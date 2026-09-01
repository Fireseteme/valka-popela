"use strict";
/* Válka popela v0.3 — multiplayer server.
   Autoritativní: server drží stav hry, točí tik a validuje příkazy hráčů
   stejnými funkcemi jako singleplayer (js/game.js běží tady v Node).
   Klienti posílají příkazy přes WebSocket a dostávají snapshoty stavu.

   Jeden proces = jedna hra (lobby → sezóna → konec → zpět do lobby).
   Spuštění: node server/server.js [port]   (výchozí port 8123) */

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const WebSocket = require("ws");
const game = require("../js/game.js");

const PORT = parseInt(process.argv[2], 10) || 8123;
const ROOT = path.join(__dirname, "..");
const { G } = game;

// ---------- statické soubory (index.html, js, style, assety) ----------
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".json": "application/json", ".md": "text/plain; charset=utf-8",
};

const httpServer = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split("?")[0]);
  if (urlPath === "/") urlPath = "/index.html";
  const file = path.normalize(path.join(ROOT, urlPath));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end("404"); return; }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});

// ---------- hráči a fáze hry ----------
// players: token → {name, faction, heroes, ws, accKey}
const players = new Map();
let phase = "lobby"; // "lobby" | "running"
let tickTimer = null;
let lastReportId = new Map(); // token → id posledního doručeného bojového reportu
let eventBuffer = [];         // události z tiku pro zvuky na klientech

G.onEvent = (name, factionId) => { eventBuffer.push({ name, factionId }); };

// ---------- účty (v0.6): trvalý postup hrdinů, sklad předmětů, jádra ----------
// Uloženo v server/data/accounts.json. Heslo se ukládá jako scrypt hash.
// Promo kódy lze přepsat vlastní tabulkou { "KOD": pocetJader } v klíči codes.
const DATA_DIR = path.join(__dirname, "data");
const ACC_FILE = path.join(DATA_DIR, "accounts.json");
let accData = { accounts: {}, codes: null };
try {
  accData = JSON.parse(fs.readFileSync(ACC_FILE, "utf8"));
  accData.accounts = accData.accounts || {};
} catch (e) { /* první spuštění — soubor vznikne při registraci */ }
// migrace účtů: v0.9 doplňuje heroUnlocks/heroRespect/boosts (rozehraní
// hrdinové se počítají za odemčené), Audit 2 navíc jednou vrátí investované
// body dovedností. Před přepsáním stromů si odložíme zálohu souboru.
const needsTreeMigration = Object.values(accData.accounts)
  .some(a => (a.treeV | 0) < game.TREE_VERSION);
if (needsTreeMigration) {
  try {
    fs.copyFileSync(ACC_FILE, ACC_FILE + ".v1.bak");
    console.log(`[účty] záloha před migrací stromů: ${path.basename(ACC_FILE)}.v1.bak`);
  } catch (e) { /* soubor ještě neexistuje — není co zálohovat */ }
}
for (const key in accData.accounts) game.migrateAccount(accData.accounts[key]);

let accDirty = false;
function saveAccounts() { accDirty = true; }
function flushAccounts() {
  if (!accDirty) return;
  accDirty = false;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ACC_FILE, JSON.stringify(accData, null, 1));
  } catch (e) { console.error("[účty] uložení selhalo:", e.message); }
}
setInterval(flushAccounts, 5000);
process.on("exit", flushAccounts);
process.on("SIGINT", () => { flushAccounts(); process.exit(0); });

const hashPass = (pass, salt) =>
  crypto.scryptSync(String(pass), salt, 32).toString("hex");

function accOf(p) {
  return p && p.accKey ? accData.accounts[p.accKey] || null : null;
}

function playerByFaction(factionId) {
  for (const p of players.values()) if (p.faction === factionId) return p;
  return null;
}

// v0.9: startovní hrdina musí být odemčený na účtu; nemá-li hráč ve frakci
// odemčeno nic (první hra s frakcí, nebo hraje bez účtu), smí si vybrat
// libovolného hrdinu Common tieru — s účtem mu zůstane natrvalo (tryStart)
function pickAllowed(p, factionIdx, defIdx) {
  const fkey = game.FACTION_DEFS[factionIdx].key;
  const acc = accOf(p);
  if (acc && game.heroUnlocked(acc, fkey + ":" + defIdx)) return true;
  const anyUnlocked = acc && game.HERO_DEFS[fkey].some((_, i) =>
    game.heroUnlocked(acc, fkey + ":" + i));
  return !anyUnlocked && game.heroTierOf(fkey, defIdx) === 0;
}

// profil na klienta — nikdy neposílat salt/hash/authToken jiným kanálem
function profileMsg(acc) {
  game.migrateAccount(acc);
  const msg = { type: "account", name: acc.name, cores: acc.cores,
    inv: (acc.inventory || []).length,
    heroUnlocks: acc.heroUnlocks, heroRespect: acc.heroRespect,
    boosts: acc.boosts };
  // o vráceném rozdělení bodů se hráč dozví jednou, pak značku zahodíme
  if (acc.respecNote) { msg.respecNote = 1; delete acc.respecNote; saveAccounts(); }
  return msg;
}

function accRegister(name, pass) {
  name = String(name || "").trim().slice(0, 20);
  if (name.length < 3) return { error: "Jméno účtu musí mít aspoň 3 znaky." };
  if (String(pass || "").length < 4) return { error: "Heslo musí mít aspoň 4 znaky." };
  const key = name.toLowerCase();
  if (accData.accounts[key]) return { error: "Účet s tímto jménem už existuje." };
  const salt = crypto.randomBytes(12).toString("hex");
  const acc = { ...game.emptyAccount(name), salt, hash: hashPass(pass, salt),
    authToken: crypto.randomBytes(16).toString("hex") };
  accData.accounts[key] = acc;
  saveAccounts();
  return { key, acc };
}

function accLogin(name, pass) {
  const key = String(name || "").trim().toLowerCase();
  const acc = accData.accounts[key];
  if (!acc || hashPass(pass, acc.salt) !== acc.hash)
    return { error: "Špatné jméno účtu nebo heslo." };
  return { key, acc };
}

function accByToken(authToken) {
  if (!authToken) return null;
  for (const key in accData.accounts)
    if (accData.accounts[key].authToken === authToken) return { key, acc: accData.accounts[key] };
  return null;
}

// jádra z herních událostí připisuje server na účet hráče dané frakce
G.onCores = (factionId, amount) => {
  const p = playerByFaction(factionId);
  const acc = accOf(p);
  if (!acc) return false; // AI a hráči bez účtu jádra nesbírají
  acc.cores += amount;
  saveAccounts();
  send(p.ws, profileMsg(acc));
  return true;
};

// lidský hráč najímá jen hrdiny odemčené na svém účtu (v0.9)
G.canHire = (faction, defIdx) => {
  const acc = accOf(playerByFaction(faction.id));
  return !!acc && game.heroUnlocked(acc, faction.key + ":" + defIdx);
};

// najatý hrdina dostane uložený postup z účtu
G.onHire = (faction, heroIdx) => {
  const acc = accOf(playerByFaction(faction.id));
  if (acc) game.applyAccountToHero(faction, heroIdx, acc);
};

// průběžný zápis postupu běžící hry na účty (a vždy na konci sezóny)
function syncAccounts() {
  for (const p of players.values()) {
    if (p.faction === null) continue;
    const acc = accOf(p);
    const f = G.factions[p.faction];
    if (acc && f) game.syncAccountFromFaction(acc, f);
  }
  saveAccounts();
}

const wss = new WebSocket.Server({ server: httpServer });

function send(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg) {
  for (const p of players.values()) send(p.ws, msg);
}

// ---------- lobby ----------
function lobbyState() {
  return {
    type: "lobby",
    phase,
    players: [...players.values()].map(p => ({
      name: p.name, faction: p.faction, heroes: p.heroes,
      connected: p.ws && p.ws.readyState === WebSocket.OPEN,
    })),
  };
}

function broadcastLobby() { broadcast(lobbyState()); }

// ---------- serializace stavu ----------
function serializeState(forToken) {
  const tiles = [];
  for (const t of G.tiles.values()) tiles.push(t);
  const last = lastReportId.get(forToken) || 0;
  const newReports = G.reports.filter(r => r.id > last);
  if (newReports.length) lastReportId.set(forToken, newReports[newReports.length - 1].id);
  return {
    tick: G.tick, gameOver: G.gameOver, storm: G.storm, throneOpen: G.throneOpen,
    nextStormTick: G.nextStormTick,
    tiles, factions: G.factions, log: G.log, mapEvents: G.mapEvents,
    clashes: G.clashes,
    goals: G.goals.map(g => ({ key: g.def.key, done: g.done })),
    newReports,
  };
}

function broadcastState() {
  for (const [token, p] of players) {
    if (!p.ws || p.ws.readyState !== WebSocket.OPEN || p.faction === null) continue;
    send(p.ws, { type: "state", yourFaction: p.faction, state: serializeState(token), events: eventBuffer });
  }
  eventBuffer = [];
}

// ---------- start hry ----------
function tryStart() {
  const picked = [...players.values()].filter(p => p.faction !== null && p.heroes);
  if (phase !== "lobby" || picked.length < 1) return false;
  const humans = picked.map(p => ({ faction: p.faction, heroes: p.heroes }));
  game.newGameMulti(humans, Date.now() % 100000);
  // trvalý postup z účtů: sklad předmětů, úrovně a výbava startovních hrdinů
  for (const p of picked) {
    const acc = accOf(p);
    if (!acc) continue;
    // první hra s frakcí: zvolený Common hrdina zůstává hráči natrvalo
    const key = game.FACTION_DEFS[p.faction].key + ":" + p.heroes[0];
    if (!game.heroUnlocked(acc, key)) { acc.heroUnlocks[key] = 1; saveAccounts(); }
    game.applyAccountToFaction(G.factions[p.faction], acc);
  }
  phase = "running";
  lastReportId = new Map();
  eventBuffer = [];
  for (const [token, p] of players) {
    if (p.faction === null) continue;
    send(p.ws, { type: "started", yourFaction: p.faction, state: serializeState(token), events: [] });
  }
  tickTimer = setInterval(() => {
    game.doTick();
    if (G.tick % 5 === 0) syncAccounts(); // průběžný zápis postupu na účty
    broadcastState();
    if (G.gameOver) {
      clearInterval(tickTimer); tickTimer = null;
      syncAccounts();
      flushAccounts();
      console.log(`[hra] sezóna skončila v tiku ${G.tick}`);
    }
  }, game.TICK_MS);
  console.log(`[hra] start: ${humans.length} hráčů (${picked.map(p => p.name).join(", ")})`);
  return true;
}

function backToLobby() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  if (phase === "running") { syncAccounts(); flushAccounts(); }
  phase = "lobby";
  for (const p of players.values()) { p.faction = null; p.heroes = null; }
  broadcastLobby();
}

// ---------- příkazy hráčů (validuje herní logika sama) ----------
const CMDS = {
  startMarch: (f, d) => game.startMarch(f, G.tiles.get(d.tileKey), d.army, d.heroIdx, !!d.returnAfter),
  startReinforce: (f, d) => game.startReinforce(f, G.tiles.get(d.tileKey), d.army),
  startRecall: (f, d) => game.startRecall(f, d.heroIdx),
  turnBackMarch: (f, d) => game.turnBackMarch(f, d.heroIdx),
  cancelReinforce: (f, d) => game.cancelReinforce(f, d.heroIdx),
  toggleGuard: (f, d) => game.toggleGuard(f, d.heroIdx),
  startBuild: (f, d) => game.startBuild(f, d.key),
  buildOutpost: (f, d) => game.buildOutpost(f, G.tiles.get(d.tileKey)),
  outpostDeposit: (f, d) => game.outpostDeposit(f, G.tiles.get(d.tileKey), d.army),
  outpostWithdraw: (f, d) => game.outpostWithdraw(f, G.tiles.get(d.tileKey)),
  startRecruit: (f, d) => game.startRecruit(f, d.type, d.batches || 1),
  startRecruitOrder: (f, d) => game.startRecruitOrder(f, d.order || {}),
  marketExchange: (f, d) => game.marketExchange(f, d.from, d.to, d.amount | 0),
  refineItem: (f, d) => game.refineItem(f, d.itemId),
  hireHero: (f, d) => game.hireHero(f, d && d.defIdx != null ? d.defIdx | 0 : null),
  equipItem: (f, d) => game.equipItem(f, d.heroIdx, d.itemId),
  unequipItem: (f, d) => game.unequipItem(f, d.heroIdx, d.slot),
  strengthenItem: (f, d) => game.strengthenItem(f, d.itemId, d.materialIds || []),
  learnSkill: (f, d) => game.learnSkill(f, d.heroIdx, d.skillKey),
  respecHero: (f, d) => game.respecHero(f, d.heroIdx),
  offerPact: (f, d) => game.offerPact(f, d.targetId),
  cancelPact: (f, d) => game.cancelPact(f, d.targetId),
  // nabídky od AI zpracovává jen frakce, které jsou určeny (první člověk)
  acceptAiOffer: (f, d) => f.id === G.playerFaction && game.acceptAiOffer(d.aiId),
  declineAiOffer: (f, d) => f.id === G.playerFaction && game.declineAiOffer(d.aiId),
};

// ---------- WebSocket ----------
wss.on("connection", ws => {
  let token = null;

  ws.on("message", raw => {
    let msg;
    try { msg = JSON.parse(raw); } catch (e) { return; }

    if (msg.type === "hello") {
      token = msg.token || crypto.randomBytes(12).toString("hex");
      const existing = players.get(token);
      if (existing) {
        // reconnect: převezmi spojení, při běžící hře pošli rovnou stav
        if (existing.ws && existing.ws !== ws) { try { existing.ws.close(); } catch (e) {} }
        existing.ws = ws;
        existing.name = msg.name || existing.name;
        console.log(`[hráč] ${existing.name} se znovu připojil`);
        if (phase === "running" && existing.faction !== null) {
          lastReportId.set(token, 0); // pošli mu reporty znovu
          send(ws, { type: "started", yourFaction: existing.faction, state: serializeState(token), events: [] });
        } else {
          send(ws, { type: "welcome", token });
          broadcastLobby();
        }
        return;
      }
      const name = String(msg.name || "Bezejmenný").slice(0, 24);
      players.set(token, { name, faction: null, heroes: null, ws });
      console.log(`[hráč] ${name} se připojil (${players.size} v lobby)`);
      send(ws, { type: "welcome", token });
      broadcastLobby();
      return;
    }

    const p = token ? players.get(token) : null;
    if (!p) return;

    // ---------- účty ----------
    if (msg.type === "accRegister" || msg.type === "accLogin") {
      const r = msg.type === "accRegister"
        ? accRegister(msg.name, msg.pass) : accLogin(msg.name, msg.pass);
      if (r.error) { send(ws, { type: "accError", text: r.error }); return; }
      p.accKey = r.key;
      console.log(`[účet] ${p.name} přihlášen jako "${r.acc.name}"`);
      send(ws, { ...profileMsg(r.acc), authToken: r.acc.authToken });
      return;
    }
    if (msg.type === "accToken") {
      const r = accByToken(msg.authToken);
      if (!r) { send(ws, { type: "accError", text: "", silent: true }); return; }
      p.accKey = r.key;
      console.log(`[účet] ${p.name} přihlášen tokenem jako "${r.acc.name}"`);
      send(ws, { ...profileMsg(r.acc), authToken: r.acc.authToken });
      return;
    }
    if (msg.type === "accLogout") { p.accKey = null; return; }

    if (msg.type === "openChest") {
      const acc = accOf(p);
      if (!acc) { send(ws, { type: "accError", text: "Nejdřív se přihlas k účtu." }); return; }
      const liveFaction = (phase === "running" && p.faction !== null)
        ? G.factions[p.faction] : null;
      const res = game.accountOpenChest(acc, msg.tier, msg.side, liveFaction);
      if (!res) { send(ws, { type: "accError", text: "Nedostatek popelných jader." }); return; }
      const items = res.items;
      // za běžící hry putují kusy rovnou i do frakční zásoby (sync to srovná);
      // dárky mohly povýšit živého hrdinu — poslat všem nový stav
      if (liveFaction) {
        for (const item of items) game.grantItemToFaction(liveFaction, item);
        game.syncAccountFromFaction(acc, liveFaction);
        broadcastState();
      }
      saveAccounts();
      send(ws, { ...profileMsg(acc), type: "chestResult", tier: msg.tier,
        side: res.side, items, chestBoosts: res.boosts, gifts: res.gifts });
      return;
    }

    if (msg.type === "useBoost") {
      const acc = accOf(p);
      if (!acc) { send(ws, { type: "accError", text: "Nejdřív se přihlas k účtu." }); return; }
      if (phase !== "running" || p.faction === null) {
        send(ws, { type: "accError", text: "Doplňky lze použít jen za běžící hry." }); return;
      }
      if (!game.accountUseBoost(acc, msg.kind, msg.tier | 0, G.factions[p.faction])) {
        send(ws, { type: "accError", text: "Tento doplněk na účtu nemáš." }); return;
      }
      saveAccounts();
      broadcastState();
      send(ws, profileMsg(acc));
      return;
    }

    if (msg.type === "redeemCode") {
      const acc = accOf(p);
      if (!acc) { send(ws, { type: "accError", text: "Nejdřív se přihlas k účtu." }); return; }
      const gain = game.accountRedeemCode(acc, msg.code, accData.codes || undefined);
      if (gain == null) { send(ws, { type: "accError", text: "Neplatný nebo už použitý kód." }); return; }
      saveAccounts();
      send(ws, { ...profileMsg(acc), redeemed: gain });
      return;
    }

    if (msg.type === "pick" && phase === "lobby") {
      const f = msg.faction;
      const taken = [...players.values()].some(q => q !== p && q.faction === f);
      const hero = Array.isArray(msg.heroes) && msg.heroes.length === 1
        ? Math.max(0, Math.min(5, msg.heroes[0] | 0)) : null;
      if (f === null || (Number.isInteger(f) && f >= 0 && f < 4 && !taken
          && hero !== null && pickAllowed(p, f, hero))) {
        p.faction = f;
        p.heroes = f === null ? null : [hero];
      }
      broadcastLobby();
      return;
    }

    if (msg.type === "start" && phase === "lobby") {
      if (!tryStart()) send(ws, { type: "error", text: "Hru nelze spustit — vyber frakci a hrdiny." });
      return;
    }

    if (msg.type === "backToLobby" && phase === "running") {
      // kdokoli může sezónu ukončit — hra mezi kamarády; všichni zpět do lobby
      console.log(`[hra] ${p.name} ukončil hru — návrat do lobby`);
      broadcast({ type: "ended", by: p.name });
      backToLobby();
      return;
    }

    if (msg.type === "cmd" && phase === "running" && !G.gameOver) {
      if (p.faction === null) return;
      const faction = G.factions[p.faction];
      if (!faction || !faction.alive) return;
      const fn = CMDS[msg.cmd];
      if (!fn) return;
      try { fn(faction, msg.payload || {}); } catch (e) {
        console.error(`[cmd] ${msg.cmd} selhal:`, e.message);
      }
      broadcastState(); // okamžitá odezva, další přijde s tikem
      return;
    }
  });

  ws.on("close", () => {
    if (!token) return;
    const p = players.get(token);
    if (!p) return;
    if (phase === "lobby") {
      players.delete(token); // v lobby odpojené rovnou uklidíme
      console.log(`[hráč] ${p.name} odešel`);
    } else {
      console.log(`[hráč] ${p.name} se odpojil (může se vrátit)`);
    }
    broadcastLobby();
  });
});

httpServer.listen(PORT, () => {
  console.log("⚔ Válka popela — multiplayer server");
  console.log(`   hra běží na:  http://localhost:${PORT}`);
  console.log("   kamarádi se připojí na tvou (Tailscale) adresu, např. http://100.x.y.z:" + PORT);
  console.log("   ukončení: Ctrl+C");
});
