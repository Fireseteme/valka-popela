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
const mail = require("./mail.js");

// Server nikdy nepočítá mlhu — `computeVisibility` je pohled jednoho hráče
// a klient si ho po každém snímku spočítá sám (net.js). Bez tohohle přepínače
// server každou vteřinu prošel celý svět pro nikoho (etapa 11b).
game.nastavServerovyRezim(true);

const PORT = parseInt(process.argv[2], 10) || 8123;
// délka sezóny v hodinách: node server/server.js 8123 336  (= 14 dní)
// výchozí délka sezóny je CÍLOVÝCH 14 dní (od 31. 8. 2026); krátkou sezónu
// na zkoušku si vyžádej argumentem: node server/server.js 8123 1
const SEZONA_HODIN = parseFloat(process.argv[3]) || 336;
// VELIKOST MAPY JE PRO TEĎ PEVNÁ (zadání uživatele 1. 9. 2026).
//
// Do teď se svět šil na míru počtu přihlášených (velikostProPocet): padesát
// lidí dostalo 69×69, osm set 271×271. Od etapy 11b to není potřeba — tik
// na velikosti světa prakticky nezávisí — a pevný svět je předvídatelný:
// každá sezóna vypadá stejně, mapa se nemění podle toho, kolik lidí dorazilo.
//
// 955×955 = 912 025 polí, kapacita 1 254 hráčů na rod (10 032 celkem).
// Zpátky na automatiku: dej MAPA_PEVNA na 0 (pak rozhodne počet přihlášek).
// Jednorázově jinak: node server/server.js 8123 336 51 → svět 103×103.
const MAPA_PEVNA = 477;                    // 2×477+1 = 955
const MAPA_R = parseInt(process.argv[4], 10) || MAPA_PEVNA;
// SVĚT BEZ AI (etapa 11b): VP_BEZ_AI=1 node server/server.js …
// AI rody jsou dočasná výplň, než bude hráčů dost. S tímhle přepínačem se
// v sezóně nehne nikdo, koho neřídí člověk — neutrální posádky polí zůstávají,
// takže je pořád co dobývat, ale žádný rod sám neexpanduje ani nevyhlašuje války.
const BEZ_AI = process.env.VP_BEZ_AI === "1";
const ROOT = path.join(__dirname, "..");
const { G } = game;

// ---------- statické soubory (index.html, js, style, assety) ----------
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".json": "application/json", ".md": "text/plain; charset=utf-8",
};

// Stránky, na které vedou odkazy z e-mailu. Jsou schválně samostatné a bez
// JavaScriptu — člověk je otvírá z mailu, často na cizím zařízení, a nemá
// smysl kvůli nim tahat celou hru.
function strankaHtml(nadpis, telo) {
  return `<!DOCTYPE html><html lang="cs"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${nadpis} — Válka popela</title><style>
body{background:#10151c;color:#e9e3d4;font-family:system-ui,sans-serif;display:flex;
align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}
.k{background:#1a212b;border:1px solid #37414f;border-radius:12px;padding:30px;max-width:440px;width:100%}
h1{color:#d9ab4f;font-size:22px;margin:0 0 14px}p{color:#97a1ae;line-height:1.6}
input{width:100%;box-sizing:border-box;background:#232c38;border:1px solid #37414f;color:#e9e3d4;
border-radius:8px;padding:10px 12px;font-size:14px;margin:6px 0 12px}
button{background:#d9ab4f;border:none;color:#1a1408;font-weight:600;border-radius:8px;
padding:11px 22px;font-size:14px;cursor:pointer}a{color:#e8c26a}
.jadra{background:#232c38;border:1px solid #d9ab4f;border-radius:8px;padding:10px 14px;
color:#e8c26a;font-weight:600;font-size:16px;margin:0 0 14px}
</style></head><body><div class="k">${telo}</div></body></html>`;
}
const jeKod = k => typeof k === "string" && /^[0-9a-f]{40}$/.test(k);

function odpovezHtml(res, kod, html) {
  res.writeHead(kod, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
}

const httpServer = http.createServer((req, res) => {
  const cela = new URL(req.url, "http://x");
  let urlPath = decodeURIComponent(cela.pathname);

  // ---- potvrzení e-mailu ----
  if (urlPath === "/overit") {
    const kod = cela.searchParams.get("kod");
    const r = jeKod(kod) ? uctePodleKodu("overeniKod", kod) : null;
    if (!r) return odpovezHtml(res, 400, strankaHtml("Odkaz neplatí",
      `<h1>Odkaz už neplatí</h1><p>Buď je síň potvrzená a můžeš se rovnou přihlásit,
       nebo je odkaz starý. <a href="/">Zpátky do hry</a></p>`));
    // čekající adresa (dodatečné přidání či změna) se teprve teď stane platnou
    if (r.acc.emailCeka) { r.acc.email = r.acc.emailCeka; delete r.acc.emailCeka; }
    r.acc.emailOvereno = true;
    delete r.acc.overeniKod;
    // uvítací jádra se vyzvedávají TÍMTO odkazem (v0.58) — vrací 0, když už
    // vyzvednutá byla nebo když jde o starý účet, který je dostal při vzniku
    const jadra = game.vyzvedniJadra(r.acc);
    saveAccounts(); flushAccounts();
    console.log(`[účet] ${r.acc.name} potvrdil e-mail` + (jadra ? ` a vyzvedl ${jadra} 💠` : ""));
    return odpovezHtml(res, 200, strankaHtml("Síň potvrzena",
      `<h1>Síň ${r.acc.name} je tvoje</h1>` +
      (jadra ? `<p class="jadra">💠 ${jadra.toLocaleString("cs")} popelných jader je na tvém účtu.</p>` : "") +
      `<p>E-mail je potvrzený — teď se můžeš přihlásit
       a vybrat si rod pro nejbližší sezónu.</p><p><a href="/">⚔ Do hry</a></p>`));
  }

  // ---- nové heslo ----
  if (urlPath === "/heslo") {
    const kod = cela.searchParams.get("kod");
    const r = jeKod(kod) ? uctePodleKodu("resetKod", kod) : null;
    const platny = r && r.acc.resetPlati > Date.now();
    if (!platny) return odpovezHtml(res, 400, strankaHtml("Odkaz neplatí",
      `<h1>Odkaz už neplatí</h1><p>Odkaz na nové heslo platí hodinu. Zažádej si o nový
       na přihlašovací obrazovce. <a href="/">Zpátky do hry</a></p>`));
    if (req.method === "GET") return odpovezHtml(res, 200, strankaHtml("Nové heslo",
      `<h1>Nové heslo pro ${r.acc.name}</h1>
       <form method="POST" action="/heslo?kod=${kod}">
       <input type="password" name="heslo" placeholder="Nové heslo" minlength="4" required autofocus>
       <button type="submit">Nastavit heslo</button></form>`));
    if (req.method === "POST") {
      let telo = "";
      req.on("data", d => { telo += d; if (telo.length > 4096) req.destroy(); });
      req.on("end", () => {
        const heslo = new URLSearchParams(telo).get("heslo") || "";
        if (heslo.length < 4) return odpovezHtml(res, 400, strankaHtml("Krátké heslo",
          `<h1>Heslo je krátké</h1><p>Musí mít aspoň 4 znaky. <a href="/heslo?kod=${kod}">Zkusit znovu</a></p>`));
        r.acc.salt = crypto.randomBytes(12).toString("hex");
        r.acc.hash = hashPass(heslo, r.acc.salt);
        // nové heslo zneplatní i trvalé přihlášení na cizích zařízeních
        r.acc.authToken = crypto.randomBytes(16).toString("hex");
        r.acc.emailOvereno = true;   // odkaz z mailu je zároveň důkaz adresy
        // a když si účet uvítací jádra ještě nevyzvedl, dostane je tady —
        // adresu prokázal stejně dobře jako ověřovacím odkazem
        game.vyzvedniJadra(r.acc);
        delete r.acc.resetKod; delete r.acc.resetPlati;
        saveAccounts(); flushAccounts();
        console.log(`[účet] ${r.acc.name} si nastavil nové heslo`);
        odpovezHtml(res, 200, strankaHtml("Heslo změněno",
          `<h1>Hotovo</h1><p>Heslo pro síň ${r.acc.name} je nastavené. Ostatní zařízení se
           musí přihlásit znovu.</p><p><a href="/">⚔ Do hry</a></p>`));
      });
      return;
    }
  }

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
// POŠTA (v0.50): každý hráč dostává JEN své bitvy.
//
// Do v0.49 šel každý report všem a klient si držel posledních 40. Naměřeno:
// svět generuje ~390 reportů za hodinu, takže strop 40 vydržel šest minut,
// než hráči vypadly jeho vlastní bitvy mezi souboji AI na druhém konci mapy.
//
// Reporty se drží JEDNOU v `reportyStore` a schránky na ně jen odkazují id —
// jeden report má typicky dva účastníky a kopírovat ho by úložiště zdvojilo.
const POSTA_MAX = 40;             // reportů na hráče (1 KB kus)
const reportyStore = new Map();   // id → report
const posta = new Map();          // klíč hráče → { ids, precteno }
// `doruceno` (co už spojení dostalo) žije na HRÁČI, ne na schránce: schránku
// sdílí všechna zařízení účtu a nově připojený klient nemá nic v paměti,
// takže mu musí dorazit celá — jinak by z mobilu viděl prázdné reporty.
const akterNaKlic = new Map();    // "fid:cid" → klíč hráče (obrácený rejstřík k ucastnici)
let poslednyRozeslany = 0;        // dokud sem, jsou reporty rozeslané

function schranka(klic) {
  let p = posta.get(klic);
  if (!p) { p = { ids: [], precteno: [] }; posta.set(klic, p); }
  return p;
}

function prestavRejstrikAkteru() {
  akterNaKlic.clear();
  for (const [klic, m] of ucastnici) akterNaKlic.set(m.faction + ":" + (m.cid || 0), klic);
}

// Rozešle reporty vzniklé v tomto tiku do schránek jejich účastníků.
// Volá se po každém doTick — G.reports drží jen posledních 40, takže
// odkládat rozesílání by reporty ztratilo.
function rozesliReporty() {
  for (const r of G.reports) {
    if (r.id <= poslednyRozeslany) continue;
    poslednyRozeslany = r.id;
    let komu = 0;
    // KLANOVÉ REPORTY (etapa 9, IV-E): bitvu člena vidí i jeho klan — bez toho
    // klan neví, co se na frontě děje, dokud si to lidi nenapíšou. Rozlišení
    // „moje / klanové" dělá až KLIENT podle `r.ucastnici`, takže se report
    // NEKOPÍRUJE — do schránky jde tentýž záznam.
    const prijemci = new Set(r.ucastnici || []);
    for (const ak of r.ucastnici || []) {
      const [fid, cid] = String(ak).split(":").map(Number);
      const f = G.factions[fid];
      const a = f && game.clenPodleCid(f, cid || 0);
      const klan = a && game.klanOf(a);
      if (!klan) continue;
      for (const spolu of game.klanCleny(klan)) prijemci.add(game.aktorKlic(spolu));
    }
    for (const ak of prijemci) {
      const klic = akterNaKlic.get(ak);
      if (!klic) continue;              // bitva AI proti AI — nikoho nezajímá
      const p = schranka(klic);
      if (p.ids.includes(r.id)) continue;
      p.ids.push(r.id);
      if (p.ids.length > POSTA_MAX) p.ids.splice(0, p.ids.length - POSTA_MAX);
      komu++;
    }
    if (komu) reportyStore.set(r.id, r);
  }
  uklidStore();
}

// Ze store vyhoď reporty, na které už žádná schránka neodkazuje.
function uklidStore() {
  if (reportyStore.size <= POSTA_MAX) return;   // nemá cenu skenovat pořád
  const zive = new Set();
  for (const p of posta.values()) for (const id of p.ids) zive.add(id);
  for (const id of reportyStore.keys()) if (!zive.has(id)) reportyStore.delete(id);
  for (const p of posta.values()) p.precteno = p.precteno.filter(id => p.ids.includes(id));
}

// Klíč hráče pro poštu = tentýž jako v `ucastnici` (accKey, nebo token hosta),
// takže „přečteno" visí na ÚČTU a přežije reload i jiné zařízení.
function postaHrace(p, token) {
  const k = klicHrace(p, token);
  return k ? schranka(k) : null;
}
let eventBuffer = [];         // události z tiku pro zvuky na klientech

G.onEvent = (name, factionId) => { eventBuffer.push({ name, factionId }); };

// ---------- účty (v0.6): trvalý postup hrdinů, sklad předmětů, jádra ----------
// Uloženo v server/data/accounts.json. Heslo se ukládá jako scrypt hash.
// Promo kódy lze přepsat vlastní tabulkou { "KOD": pocetJader } v klíči codes.
// Etapa 5: účty žijí v SQLite (server/ucty.js) místo v jednom JSON souboru.
// Model se nemění — účty drží server v paměti jako objekty a mutuje je na
// místě; úložiště je jen trvalá vrstva pod tím. Starý accounts.json se při
// prvním spuštění automaticky převede.
const DATA_DIR = path.join(__dirname, "data");
const uctyDb = require("./ucty.js");
const nactene = uctyDb.nacti(game.migrateAccount);
const accData = { accounts: nactene.ucty, codes: nactene.kody };
console.log(`[účty] načteno ${Object.keys(accData.accounts).length} účtů z ${path.basename(uctyDb.DB_FILE)}`);

function saveAccounts() { uctyDb.oznacZmenu(); }
function flushAccounts() { uctyDb.uloz(); }
setInterval(flushAccounts, 5000);
process.on("exit", () => uctyDb.zavri());
process.on("SIGINT", () => { uctyDb.zavri(); process.exit(0); });

const hashPass = (pass, salt) =>
  crypto.scryptSync(String(pass), salt, 32).toString("hex");

function accOf(p) {
  return p && p.accKey ? accData.accounts[p.accKey] || null : null;
}
// klíč účtu v databázi = jméno malými písmeny (tak se účet zakládá i hledá)
function klicUctu(acc) { return acc ? String(acc.name || "").toLowerCase() : ""; }

function playerByFaction(factionId) {
  for (const p of players.values()) if (p.faction === factionId) return p;
  return null;
}

// v0.32: víc hráčů v jedné frakci — aktér hráče a hráč konkrétního aktéra.
// Strop NENÍ pevné číslo: řídí se tím, kolik ZEMĚ ve výseči na hráče zbude
// (69×69 → 6, 271×271 → 100 na frakci). Viz zmerKapacitu níž.
let CLENU_MAX = 4;
// Kolik hráčů pustit do frakce. Do v0.52 se to měřilo tím, kolik se do výseče
// vejde MĚST 3×3 — na 69×69 vyšlo 30 na frakci. Jenže město je ta VOLNĚJŠÍ
// podmínka: na těch 30 hráčů zbylo ve výseči 18 polí na hlavu, zatímco strop
// území jim slibuje 80. Kapacita se proto počítá ze ZEMĚ (game.hracuNaFrakci)
// a měření nanečisto odpadlo — bylo ~6× optimistické a na velkých světech
// trvalo desítky sekund.
//
// Když velikost mapy neurčil argument, je strop přihlášek kapacitou NEJVĚTŠÍHO
// povoleného světa a skutečná velikost se vybere až při startu sezóny podle
// toho, kolik lidí opravdu dorazilo (viz zacniSezonu).
function zmerKapacitu() {
  return game.hracuNaFrakci(MAPA_R || game.MAP_R_MAX);
}
function aktorOf(p) {
  if (!p || p.faction === null) return null;
  const f = G.factions[p.faction];
  return f ? game.clenPodleCid(f, p.member || 0) || f : null;
}
function playerByActor(factionId, cid) {
  for (const p of players.values())
    if (p.faction === factionId && (p.member || 0) === (cid || 0)) return p;
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
  // stav e-mailu (v0.51): Profil podle něj nabídne přidání či potvrzení
  const msg = { type: "account", name: acc.name, cores: acc.cores,
    email: acc.email || "", emailCeka: acc.emailCeka || "", emailOvereno: !!acc.emailOvereno,
    jazyk: acc.jazyk || "",              // v0.62: jazyk účtu
    jadraCekaji: game.jadraCekaji(acc),   // v0.58: čeká na potvrzení e-mailu
    // v0.59: kolik jader drží úschova burzy — bez toho hráč hlásí, že mu zmizela
    jadraVNabidkach: burza.vNabidkach(klicUctu(acc)),   // klíč = jméno malými písmeny
    inv: (acc.inventory || []).length,
    invItems: acc.inventory || [], // Sklad v lobby (v0.39) — kusy jsou malé objekty
    heroUnlocks: acc.heroUnlocks, heroRespect: acc.heroRespect,
    // hvězdy hrdinů pro Síň (v0.41) — celý heroProgress by byl zbytečně velký
    heroStars: Object.fromEntries(Object.entries(acc.heroProgress || {})
      .map(([k, p]) => [k, (p && p.stars) | 0])),
    boosts: acc.boosts,
    darky: acc.darky || {},   // sklad dárků (v0.43)
    wishlist: acc.wishlist || [], freeChest: game.chestFreeAvailable(acc),
    pityInvite: acc.pityInvite | 0, invitePityAt: game.INVITE_PITY_AT,
    shopDay: acc.shopDay || "", shopBought: acc.shopBought || {} };
  // o vráceném rozdělení bodů se hráč dozví jednou, pak značku zahodíme
  if (acc.respecNote) { msg.respecNote = 1; delete acc.respecNote; saveAccounts(); }
  return msg;
}

// Účet podle e-mailu (jedna adresa = jedna síň). Scan přes stovky účtů je
// pod milisekundu; až budou tisíce, přijde rejstřík.
function uctePodleEmailu(email) {
  const e = String(email || "").trim().toLowerCase();
  for (const [k, a] of Object.entries(accData.accounts))
    if ((a.email || "").toLowerCase() === e) return { key: k, acc: a };
  return null;
}
function uctePodleKodu(pole, kod) {
  if (!kod) return null;
  for (const [k, a] of Object.entries(accData.accounts))
    if (a[pole] && a[pole] === kod) return { key: k, acc: a };
  return null;
}

function accRegister(name, pass, email) {
  name = String(name || "").trim().slice(0, 20);
  if (name.length < 3) return { error: "Jméno účtu musí mít aspoň 3 znaky." };
  if (String(pass || "").length < 4) return { error: "Heslo musí mít aspoň 4 znaky." };
  email = String(email || "").trim();
  if (!mail.jePlatnyEmail(email)) return { error: "Zadej platný e-mail — bez něj se účet nedá obnovit." };
  const key = name.toLowerCase();
  if (accData.accounts[key]) return { error: "Účet s tímto jménem už existuje." };
  if (uctePodleEmailu(email)) return { error: "Na tenhle e-mail už jedna síň založená je." };
  const salt = crypto.randomBytes(12).toString("hex");
  // uvítací jádra se nedávají do ruky, ale ČEKAJÍ na vyzvednutí ověřovacím
  // odkazem (v0.58) — jeden mail vyřídí potvrzení adresy i dárek
  const acc = { ...game.emptyAccount(name), salt, hash: hashPass(pass, salt),
    authToken: crypto.randomBytes(16).toString("hex"),
    cores: 0, jadraCekaji: game.ACCOUNT_START_CORES,
    email, emailOvereno: false, overeniKod: crypto.randomBytes(20).toString("hex") };
  uctyDb.pridej(key, acc);
  // bezpečnostní operace se zapisují HNED, ne až za 5 s: kdyby proces mezitím
  // spadl, poslali bychom odkaz na kód, který v databázi neexistuje
  saveAccounts(); flushAccounts();
  mail.posliOvereni(email, name, acc.overeniKod, acc.jadraCekaji);
  console.log(`[účet] registrace ${name} <${email}> — čeká na potvrzení (${acc.jadraCekaji} 💠 k vyzvednutí)`);
  return { key, acc, ceka: true };
}

// Znovu poslat ověřovací odkaz. Nehlásí, jestli účet existuje — jinak by to
// byl nástroj na zjišťování, kdo je registrovaný.
function posliOvereniZnovu(jmenoNeboEmail) {
  const v = String(jmenoNeboEmail || "").trim();
  const n = accData.accounts[v.toLowerCase()];
  const r = n ? { key: v.toLowerCase(), acc: n } : uctePodleEmailu(v);
  if (r && r.acc.email && !r.acc.emailOvereno) {
    r.acc.overeniKod = r.acc.overeniKod || crypto.randomBytes(20).toString("hex");
    saveAccounts(); flushAccounts();
    mail.posliOvereni(r.acc.email, r.acc.name, r.acc.overeniKod, game.jadraCekaji(r.acc));
  }
  return { ok: true };
}

// Přidání e-mailu k účtu, který ho nemá (nebo změna). Nová adresa čeká
// v `emailCeka`, dokud ji člověk nepotvrdí odkazem — původní přístup se tím
// NESMÍ zamknout, jinak by se hráč, co odkaz neotevře, sám vystrnadil.
function nastavEmail(acc, email) {
  email = String(email || "").trim();
  if (!mail.jePlatnyEmail(email)) return { error: "Zadej platný e-mail." };
  const jiny = uctePodleEmailu(email);
  if (jiny && jiny.acc !== acc) return { error: "Na tenhle e-mail už jedna síň založená je." };
  if ((acc.email || "").toLowerCase() === email.toLowerCase() && acc.emailOvereno)
    return { error: "Tuhle adresu už máš potvrzenou." };
  acc.emailCeka = email;
  acc.overeniKod = crypto.randomBytes(20).toString("hex");
  saveAccounts(); flushAccounts();
  // starý účet jádra dostal už při vzniku — jadraCekaji vrátí 0 a mail se
  // vrátí k původnímu znění „potvrď si adresu"
  mail.posliOvereni(email, acc.name, acc.overeniKod, game.jadraCekaji(acc));
  console.log(`[účet] ${acc.name} přidává e-mail <${email}> — čeká na potvrzení`);
  return { ok: true, email };
}

const RESET_PLATNOST = 3600 * 1000;   // hodina
function zadostOHeslo(jmenoNeboEmail) {
  const v = String(jmenoNeboEmail || "").trim();
  const n = accData.accounts[v.toLowerCase()];
  const r = n ? { key: v.toLowerCase(), acc: n } : uctePodleEmailu(v);
  if (r && r.acc.email) {
    r.acc.resetKod = crypto.randomBytes(20).toString("hex");
    r.acc.resetPlati = Date.now() + RESET_PLATNOST;
    saveAccounts(); flushAccounts();
    mail.posliReset(r.acc.email, r.acc.name, r.acc.resetKod);
    console.log(`[účet] ${r.acc.name} požádal o nové heslo`);
  }
  return { ok: true };   // odpověď je vždy stejná, ať se nedá zjišťovat, kdo existuje
}

function accLogin(name, pass) {
  const key = String(name || "").trim().toLowerCase();
  const acc = accData.accounts[key];
  if (!acc || hashPass(pass, acc.salt) !== acc.hash)
    return { error: "Špatné jméno účtu nebo heslo." };
  // Nepotvrzený e-mail = zamčená síň. Heslo ale sedělo, takže je bezpečné
  // říct proč a nabídnout poslat odkaz znovu.
  if (acc.email && !acc.emailOvereno)
    return { error: "Síň čeká na potvrzení e-mailem — mrkni do schránky.", neovereno: true };
  return { key, acc };
}

function accByToken(authToken) {
  if (!authToken) return null;
  for (const key in accData.accounts)
    if (accData.accounts[key].authToken === authToken) {
      const acc = accData.accounts[key];
      // trvalé přihlášení nesmí obcházet potvrzení e-mailem
      if (acc.email && !acc.emailOvereno) return null;
      return { key, acc };
    }
  return null;
}

// jádra z herních událostí připisuje server na účet hráče daného AKTÉRA
// (v0.32: cid rozlišuje členy frakce; chybí = zakladatel)
G.onCores = (factionId, amount, cid) => {
  const p = playerByActor(factionId, cid || 0);
  const acc = accOf(p);
  if (!acc) return false; // AI a hráči bez účtu jádra nesbírají
  acc.cores += amount;
  saveAccounts();
  send(p.ws, profileMsg(acc));
  return true;
};

// lidský hráč najímá jen hrdiny odemčené na svém účtu (v0.9)
// (v0.32: „faction" je AKTÉR — dohledává se hráč jeho cid)
G.canHire = (faction, defIdx) => {
  const acc = accOf(playerByActor(faction.id, faction.cid || 0));
  return !!acc && game.heroUnlocked(acc, faction.key + ":" + defIdx);
};

// v0.27: nasazení hrdiny ze strany — gate je odemčení na účtu (rodný klíč)
G.canDeploy = (faction, fkey, defIdx) => {
  const acc = accOf(playerByActor(faction.id, faction.cid || 0));
  return !!acc && game.heroUnlocked(acc, fkey + ":" + defIdx);
};

// najatý hrdina dostane uložený postup z účtu
G.onHire = (faction, heroIdx) => {
  const acc = accOf(playerByActor(faction.id, faction.cid || 0));
  if (acc) game.applyAccountToHero(faction, heroIdx, acc);
};

// průběžný zápis postupu běžící hry na účty (a vždy na konci sezóny)
// (v0.32: každý hráč synchronizuje SVÉHO aktéra — inventáře se nemíchají)
function syncAccounts() {
  for (const p of players.values()) {
    if (p.faction === null) continue;
    const acc = accOf(p);
    const a = aktorOf(p);
    if (acc && a) game.syncAccountFromFaction(acc, a);
  }
  saveAccounts();
}

// Komprese WebSocketu (v0.50). Bez ní jde delta 14 KB na hráče a tik —
// při 240 hráčích 26 Mbit/s trvale, při 840 přes 90. S kompresí 80 % dolů
// (plný snapshot dokonce 94 %), viz čísla v CLAUDE.md.
const wss = new WebSocket.Server({
  server: httpServer,
  perMessageDeflate: {
    threshold: 512,                       // drobné zprávy (lobby, potvrzení) nemá cenu balit
    zlibDeflateOptions: { level: 3, memLevel: 7 },  // změřený kompromis mezi poměrem a CPU
    // menší okno = ~32 kB kontextu na spojení místo ~300 kB; při stovkách
    // hráčů je to rozdíl mezi desítkami a stovkami MB paměti
    serverMaxWindowBits: 13,
    concurrencyLimit: 10,
  },
});

function send(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}

function broadcast(msg) {
  for (const p of players.values()) send(p.ws, msg);
}

// ---------- lobby ----------
function lobbyState(forToken) {
  const r = rozvrh.ted();
  const p = forToken ? players.get(forToken) : null;
  const mojePrihlaska = p && p.accKey ? rozvrh.prihlaskaOf(p.accKey) : null;
  return {
    type: "lobby",
    phase,
    sezona,
    sezonaHodin: SEZONA_HODIN,
    clenuMax: CLENU_MAX, // v0.32: kolik hráčů smí sdílet frakci
    // rozvrh (etapa 5b): domov podle toho kreslí odpočet a obsazenost frakcí
    rozvrh: r && {
      cislo: r.cislo, faze: r.faze, startAt: r.startAt,
      delkaHodin: r.delkaHodin, mistNaFrakci: r.mistNaFrakci,
      obsazenost: rozvrh.obsazenost(), prihlasenych: rozvrh.prihlasenych(),
      mojeFrakce: mojePrihlaska ? mojePrihlaska.faction : null,
    },
    // v0.56: běžící sezóna má SVŮJ seznam účastníků a kdo v něm není, do světa
    // nepatří. Bez tohohle příznaku domov slibuje „přihlas se a vrátíš se rovnou
    // do světa" i tomu, koho pak posadDoSezony tiše odmítne — hráč se přihlásí,
    // nestane se nic a nemá se čeho chytit.
    vSezone: phase === "running" && !!p && ucastnici.has(klicHrace(p, forToken)),
    players: [...players.values()].map(p => ({
      name: p.name, faction: p.faction, heroes: p.heroes,
      connected: p.ws && p.ws.readyState === WebSocket.OPEN,
    })),
  };
}

// lobby se posílá KAŽDÉMU ZVLÁŠŤ — nese i jeho vlastní přihlášku
function broadcastLobby() {
  for (const [token, p] of players) send(p.ws, lobbyState(token));
}

// ---------- serializace stavu ----------
// v0.33 (etapa 4d): DELTA SNAPSHOTY. Dlaždice tvoří ~95 % snapshotu, ale
// mění se jich průměrně < 1 za tik (změřeno) — plná mapa jde jen při
// startu/reconnectu a jednou za FULL_KAZDYCH tiků (samoléčba), jinak se
// posílají jen ZMĚNĚNÉ dlaždice podle otisku běhových polí.
const FULL_KAZDYCH = 60;
const tileOtisky = new Map(); // key → otisk běhových polí dlaždice
function tileOtisk(t) {
  // posádka na celé kusy — UI ukazuje celá čísla a regen po desetinách
  // by jinak dělal z každého dorůstajícího pole změnu KAŽDÝ tik
  return t.owner + "|" + (t.clen || 0) + "|" + (t.klan || 0) + "|" + Math.round(t.garrison || 0)
    + "|" + (t.okno | 0) + "|" + (t.zran | 0) + "|" + Math.round(t.odol || 0) + "|" + (t.uzelCd | 0)
    + "|" + (t.structure || "") + "|" + (t.outpost ? Math.round(game.armyTotal(t.outpost) * 10) : -1)
    + "|" + t.terrain + "|" + t.level + "|" + (t.res || "") + "|" + (t.big || "")
    + "|" + (t.bigSize || 0) + "|" + (t.abandon | 0);   // v0.39: vyklízení pole
}
// ETAPA 11b: OTISKY SE POČÍTAJÍ JEN DOTČENÝM POLÍM.
//
// Do teď se každou vteřinu složil řetězcový otisk KAŽDÉHO pole světa jen proto,
// aby se zjistilo, že se skoro nic nezměnilo. Na 461×461 to je 212 521 otisků
// za tik, na desetinásobné mapě přes dva miliony — a měřením vyšlo, že se za
// tik změní medián NULA polí.
//
// Nově se prověřují jen pole, která hra označila (G.dotcene), a k tomu VALIVÁ
// KONTROLA: každý tik projde 1/SWEEP_TIKU světa, takže celá mapa se prověří
// jednou za pět minut. Kontrola je pojistka — kdyby se v game.js někde
// zapomnělo zavolat ozivPole, změna se projeví se zpožděním, ale nikdy se
// neztratí. (Plný snímek pro hráče chodí stejně každých 60 tiků, takže
// klientovi se nesrovnalost srovná i tak.)
const SWEEP_TIKU = 300;
let sweepIter = null;
function zmeneneDlazdice(vse) {
  const zmeny = [];
  const zkontroluj = t => {
    const k = t.q + "," + t.r;
    const o = tileOtisk(t);
    if (tileOtisky.get(k) !== o) { tileOtisky.set(k, o); zmeny.push(t); }
  };
  if (vse) {                       // po nové mapě nebo obnově sezóny
    sweepIter = null;
    for (const t of G.tiles.values()) zkontroluj(t);
    return zmeny;
  }
  const dot = G.dotcene;
  if (dot && dot.size) {
    for (const k of dot) { const t = G.tiles.get(k); if (t) zkontroluj(t); }
    dot.clear();
  }
  // valivá kontrola drží iterátor mezi tiky; dlaždice se po vygenerování
  // nikdy nemažou, takže je průchod stabilní
  let n = Math.ceil(G.tiles.size / SWEEP_TIKU);
  while (n-- > 0) {
    if (!sweepIter) sweepIter = G.tiles.values();
    const kr = sweepIter.next();
    if (kr.done) { sweepIter = null; break; }
    zkontroluj(kr.value);
  }
  return zmeny;
}
function serializeState(forToken, full) {
  // reporty ze SCHRÁNKY hráče, ne z celosvětového seznamu
  const hrac = forToken ? players.get(forToken) : null;
  const p = hrac ? postaHrace(hrac, forToken) : null;
  const newReports = [];
  if (p) {
    for (const id of p.ids) {
      if (id <= (hrac.doruceno || 0)) continue;
      const r = reportyStore.get(id);
      if (r) newReports.push(r);
    }
    if (newReports.length) hrac.doruceno = newReports[newReports.length - 1].id;
  }
  // CHAT (etapa 9): stejný model jako reporty — jen to, co hráč SMÍ VIDĚT,
  // a jen to, co ještě nedostal. Klanová porada se tak k cizímu klanu
  // nedostane ani omylem, protože se mu vůbec neodešle.
  const chat = [];
  // KRONIKA (etapa 9): totéž — do etapy 9 šla celá každému a filtrovalo se až
  // v prohlížeči, takže se dala číst kronika cizího rodu přímo z drátu
  let logHrace = [];
  if (hrac && hrac.faction !== null) {
    const a = aktorOf(hrac);
    if (a) {
      const nove = game.chatProAktera(a, hrac.chatDoruceno || 0);
      for (const m of nove) chat.push(m);
      if (nove.length) hrac.chatDoruceno = nove[nove.length - 1].id;
      const noveLog = game.logProAktera(a, hrac.logDoruceno || 0);
      logHrace = noveLog;
      if (noveLog.length) hrac.logDoruceno = noveLog[noveLog.length - 1].id;
    }
  }
  const s = {
    tick: G.tick, gameOver: G.gameOver, storm: G.storm, throneOpen: G.throneOpen,
    mapR: game.MAP_R, // velikost světa (v0.33) — klient si z ní odvodí geometrii
    // délka sezóny (v0.53): od etapy 6 na ní visí i DOBY STAVBY, takže klient
    // s výchozí hodinou ukazoval 1/336 skutečného času („1 minut" místo 3,7 h)
    sezonaHodin: SEZONA_HODIN,
    faze: G.faze, // otevírání světa (v0.30)
    klany: G.klany || [], // klany uvnitř rodů (etapa 8)
    rozhodujici: G.rozhodujici || {}, // kdo mluví za rod (etapa 10)
    hlasovani: G.hlasovani || [],
    chat,                 // nové zprávy pro TOHOHLE hráče (etapa 9)
    checkpointy: G.checkpointy, // kolektivní checkpointy (v0.31)
    nextStormTick: G.nextStormTick,
    throneHold: G.throneHold, winnerId: G.winnerId, seasonNumber: G.seasonNumber,
    factions: G.factions, log: logHrace, mapEvents: G.mapEvents,
    clashes: G.clashes,
    goals: [], // MRTVÉ od v0.31 (kapitoly jedou na frakcích) — pole drží staré klienty naživu
    newReports,
    precteno: p ? p.precteno : [],   // stav „přečteno" drží server (v0.50)
  };
  if (full) {
    // AOI (etapa 11): plný snímek posílá jen OKRUH ZÁJMU hráče, ne celou mapu.
    // Na 461×461 by celá mapa byla 21 MB na hráče — viz aoiKlice v game.js.
    const a = hrac && hrac.faction !== null ? aktorOf(hrac) : null;
    const tiles = [];
    if (a) { for (const k of game.aoiKlice(a)) tiles.push(G.tiles.get(k)); }
    else for (const t of G.tiles.values()) tiles.push(t);   // lobby/divák: celá mapa
    s.tiles = tiles;
    s.aoi = !!a;   // klient podle toho pozná, že mapu má MERGOVAT, ne nahradit
  }
  return s;
}

// Rozprostření plných snímků: hráč dostane svůj plný snímek v tiku podle
// otisku tokenu, ne všichni naráz.
function otiskTokenu(token) {
  let h = 0;
  for (let i = 0; i < token.length; i++) h = (h * 31 + token.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Delta se počítá jednou pro všechny, ale POSÍLÁ se jen to, co hráč smí vidět.
// Test je vzdálenostní (ne přes Set klíčů) — delta má typicky pod deset polí,
// takže je to levnější než stavět okruh zájmu pro každého znovu.
function aoiFiltr(p, delta) {
  if (!delta || !delta.length) return delta;
  const a = aktorOf(p);
  if (!a) return delta;
  const body = game.aoiBody(a);
  const R = game.AOI_R;
  return delta.filter(t =>
    (t.owner === a.id && (t.clen || 0) === (a.cid || 0))
    || body.some(b => Math.abs(t.q - b.q) + Math.abs(t.r - b.r) <= R));
}

function broadcastState() {
  // delta dlaždic je společná všem příjemcům — spočítat JEDNOU
  // AOI (etapa 11): delta se počítá JEDNOU pro všechny, plný snímek ale běží
  // hráč po hráči a je drahý (kosočtverce kolem zájmových bodů), takže se
  // ROZKLÁDÁ — každý hráč má svůj tik v cyklu podle otisku tokenu. Jinak by
  // se při stovkách hráčů jednou za 60 tiků zasekl celý server.
  const delta = zmeneneDlazdice();
  for (const t of delta) zmenyProSnimek.add(t.q + "," + t.r);
  for (const [token, p] of players) {
    if (!p.ws || p.ws.readyState !== WebSocket.OPEN || p.faction === null) continue;
    if (p.fullFaze === undefined) p.fullFaze = otiskTokenu(token) % FULL_KAZDYCH;
    const full = G.tick % FULL_KAZDYCH === p.fullFaze;
    const state = serializeState(token, full);
    if (!full) state.tilesDelta = aoiFiltr(p, delta);
    send(p.ws, { type: "state", yourFaction: p.faction, yourMember: p.member || 0, state, events: eventBuffer });
  }
  eventBuffer = [];
}

// ---------- start hry ----------
// ---------- pořadí sezón (přežívá restart serveru) ----------
const STAV_FILE = path.join(DATA_DIR, "stav.json");
let sezona = 1;
try { sezona = JSON.parse(fs.readFileSync(STAV_FILE, "utf8")).sezona || 1; } catch (e) {}
function ulozStav() {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(STAV_FILE, JSON.stringify({ sezona }));
  } catch (e) { console.error("[stav] zápis selhal:", e.message); }
}

// ---------- nesmrtelnost sezóny (etapa 5) ----------
// Restart serveru — a to je i každé nasazení opravy — dřív zahodil rozehraný
// svět a všechny vrátil do lobby. Snímek se ukládá průběžně a při startu se
// sezóna zvedne přesně tam, kde skončila.
const sezonaDb = require("./sezona.js");
const rozvrh = require("./rozvrh.js");
const burza = require("./burza.js");
const ULOZ_KAZDYCH = 10;   // tiků mezi snímky (1 tik = 1 s; zápis stojí ~5 ms)
// Plný snímek přepisuje celou mapu; mezi nimi se jen připojují změny (etapa 11b).
// Půlhodina je kompromis: soubor mezitím naroste o pár MB hlaviček, zato se
// velká mapa nepřepisuje pořád dokola.
const PLNY_SNIMEK = 1800;
let zmenyProSnimek = new Set();   // klíče polí dotčených od posledního zápisu
let posledniPlny = -1;

function ulozSezonu(vynutPlny) {
  if (phase !== "running") return 0;
  const plny = vynutPlny || posledniPlny < 0 || !sezonaDb.existuje()
    || G.tick - posledniPlny >= PLNY_SNIMEK;
  // hráči bez ws: spojení se po restartu nedá oživit, ale token ano — hráč se
  // vrátí na tutéž frakci a aktéra, jakmile se znovu připojí
  const stav = {
    sezona,
    sezonaHodin: SEZONA_HODIN,
    mapaR: game.MAP_R,
    G,
    // kdo do sezóny patří — bez toho by se po restartu nikdo nedostal ke svému
    // městu, protože mapování účet → aktér žije jinak jen v paměti
    ucastnici: [...ucastnici.entries()],
    posta: [...posta.entries()],
    reportyStore: [...reportyStore.entries()],
    poslednyRozeslany,
    hraci: [...players].map(([token, p]) => ({
      token, name: p.name, faction: p.faction, member: p.member || 0, accKey: p.accKey || null,
    })),
  };
  const zapisZmeny = () => {
    const pole = [];
    for (const k of zmenyProSnimek) { const t = G.tiles.get(k); if (t) pole.push([k, t]); }
    zmenyProSnimek.clear();
    return sezonaDb.ulozZmeny(stav, pole);
  };
  // Plný snímek se ROZEPISUJE přes víc tiků, ať se hra nezastaví (viz sezona.js).
  // Než doběhne, přírůstky se nezapisují — sbírají se a připojí se hned po něm,
  // takže rozmazanou mapu srovná jediný řádek.
  if (sezonaDb.rozepsanyPlny()) {
    // dokud snímek vůbec neexistuje, jede se rychleji — po startu sezóny
    // je každá minuta bez snímku minuta, kterou by pád serveru smazal
    if (!sezonaDb.krokPlnyho(sezonaDb.existuje() ? 2 : 8)) return 0;
    posledniPlny = G.tick;
    return zapisZmeny();
  }
  if (plny) { sezonaDb.zacniPlny(stav); return 0; }
  return zapisZmeny();
}

function obnovSezonu() {
  const stav = sezonaDb.nacti();
  if (!stav) return false;
  if (stav.G.gameOver) { sezonaDb.smaz(); return false; }   // dohraná sezóna se neoživuje

  sezona = stav.sezona || sezona;
  // Délka sezóny i velikost mapy se berou ZE SNÍMKU, ne z argumentů. Rozehraná
  // sezóna má svůj rytmus (otevření Trůnu, okna obléhání, fáze světa) navázaný
  // na SEASON_TICKS a geometrii na MAP_R — změnit je v půlce by ji rozbilo.
  if (stav.sezonaHodin && stav.sezonaHodin !== SEZONA_HODIN)
    console.log(`[sezóna] snímek jede na ${stav.sezonaHodin} h, argument říká ${SEZONA_HODIN} h`
      + " — držím délku ze snímku až do konce sezóny");
  game.setSeasonHours(stav.sezonaHodin || SEZONA_HODIN);
  if (stav.mapaR && stav.mapaR !== game.MAP_R) game.setMapRadius(stav.mapaR);

  sezonaDb.obnovDoG(G, stav.G);
  if (BEZ_AI) game.zrusAI();   // přepínač platí i po restartu rozehrané sezóny
  ucastnici = new Map(stav.ucastnici || []);
  prestavRejstrikAkteru();
  // pošta patří k sezóně — bez ní by restart smazal hráčům bojové záznamy
  poslednyRozeslany = stav.poslednyRozeslany || 0;
  reportyStore.clear(); posta.clear();
  for (const [id, r] of stav.reportyStore || []) reportyStore.set(id, r);
  for (const [k, p] of stav.posta || []) posta.set(k, p);
  for (const h of stav.hraci || []) {
    if (h.faction === null || h.faction === undefined) continue;
    players.set(h.token, { name: h.name, faction: h.faction, member: h.member || 0,
      heroes: null, ws: null, accKey: h.accKey || undefined });
  }
  phase = "running";
  posledniPlny = -1;      // po obnově se snímek jednou přepíše celý
  zmeneneDlazdice(true);   // srovnat otisky na obnovenou mapu (první delta by jinak nesla celý svět)
  spustTik();
  const zbyva = Math.max(0, game.seasonTicks() - G.tick);
  console.log(`[sezóna] obnovena sezóna ${sezona} v tiku ${G.tick} (zbývá ${Math.round(zbyva / 60)} min)`
    + `, ${players.size} hráčů čeká na návrat`);
  // Obnovená sezóna ZAVÍRÁ ZÁPISY (rozvrh jde do fáze „bezi") a délka se bere
  // ze SNÍMKU, ne z argumentu — dlouhá sezóna se tak přenese přes každý restart
  // a nikdo nový se do hry nedostane, dokud nedoběhne. V gzipovaném snímku se
  // to hledá mizerně, takže se to hlásí samo.
  console.log(`[sezóna] zápisy jsou tím ZAVŘENÉ — nikdo nový se nepřipojí, dokud `
    + `sezóna nedoběhne nebo ji někdo neukončí (✕ Konec v liště).`);
  if (zbyva > 24 * 3600) {
    console.log(`[sezóna] ⚠ POZOR: sama nedoběhne dřív než za ${(zbyva / 86400).toFixed(1)} dní. `
      + `Čistý start: zastav server, smaž data/sezona.json.gz, spusť znovu — v TOMHLE `
      + `pořadí, odcházející proces si jinak snímek zapíše zpátky.`);
  }
  return true;
}

function spustTik() {
  if (tickTimer) return;
  tickTimer = setInterval(() => {
    game.doTick();
    if (G.dotcene) for (const k of G.dotcene) zmenyProSnimek.add(k);
    rozesliReporty();   // MUSÍ hned — G.reports drží jen posledních 40
    if (G.tick % 5 === 0) syncAccounts();          // průběžný zápis postupu na účty
    // rozepsaný plný snímek se krokuje KAŽDÝ tik (jinak by se dopisoval hodiny)
    if (G.tick % ULOZ_KAZDYCH === 0 || sezonaDb.rozepsanyPlny()) ulozSezonu();
    broadcastState();
    if (G.gameOver) {
      clearInterval(tickTimer); tickTimer = null;
      syncAccounts();
      flushAccounts();
      console.log(`[hra] sezóna ${sezona} skončila v tiku ${G.tick}`);
      // domovská síň: po minutě a půl na výsledky se všichni vrací do lobby
      // a otvírají se přihlášky do další sezóny
      sezonaDb.smaz();   // jinak by restart oživil právě dohranou sezónu
      rozvrh.dalsi();    // hned naplánuj další termín, ať je kam se hlásit
      sezona = rozvrh.ted().cislo;   // číslo sezóny drží ROZVRH (jeden čítač, ne dva)
      ulozStav();
      console.log(`[rozvrh] další sezóna ${rozvrh.ted().cislo} startuje `
        + new Date(rozvrh.ted().startAt).toLocaleString("cs-CZ"));
      setTimeout(() => { if (phase === "running") backToLobby(); }, 90000);
    }
  }, game.TICK_MS);
}

// Kdo do běžící sezóny patří: klíč → místo ve světě. Klíč je accKey
// (přihlášený hráč), nebo token spojení u hosta bez účtu. Díky tomu si
// přihlášený hráč najde své město i z jiného zařízení a i když dorazí
// týden po startu — místo ve světě mu drží ÚČET, ne spojení.
let ucastnici = new Map();   // klíč → { faction, cid, jmeno }
const klicHrace = (p, token) => p.accKey || token;

// Posadí připojeného hráče k jeho aktérovi v běžící sezóně. Vrací true,
// když pro něj místo je (jinak jen kouká z lobby).
function posadDoSezony(p, token) {
  if (phase !== "running") return false;
  const m = ucastnici.get(klicHrace(p, token));
  if (!m) return false;
  p.faction = m.faction;
  p.member = m.cid;
  p.heroes = [game.STARTER_IDX[game.FACTION_DEFS[m.faction].key] ?? 0];
  return true;
}

// Co se musí stát po přihlášení k účtu.
//
// (1) POSLAT ZNOVU LOBBY. Klient dostal lobby ještě jako anonym, takže v něm
//     chybí jeho vlastní přihláška do sezóny (`rozvrh.mojeFrakce`) — domov by
//     pak tvrdil, že se hráč nikam nepřihlásil, i když se přihlásil.
// (2) Za běžící sezóny ho posadit ke svému městu: mohl se přihlásit z jiného
//     zařízení, nebo dorazit až týden po startu. Místo mu drží účet.
function posadPoPrihlaseni(p, token, ws) {
  send(ws, lobbyState(token));
  if (phase !== "running" || p.faction !== null) return;
  if (!posadDoSezony(p, token)) return;
  console.log(`[hra] ${p.name} se vrátil do běžící sezóny (frakce ${p.faction}, aktér ${p.member})`);
  send(ws, { type: "started", yourFaction: p.faction, yourMember: p.member || 0,
    state: serializeState(token, true), events: [] });
  broadcastLobby();
}

// Jádro startu sezóny. `seznam` je [{ klic, jmeno, faction, accKey }] —
// naplní ho buď ruční start z lobby, nebo rozvrh v termínu.
function zacniSezonu(seznam) {
  if (phase !== "lobby" || !seznam.length) return false;
  // víc hráčů v jedné frakci: první z frakce je zakladatel (cid 0),
  // další dostanou vlastní město přes pridejClena
  const perFrakce = new Map();
  for (const u of seznam) {
    if (!perFrakce.has(u.faction)) perFrakce.set(u.faction, []);
    perFrakce.get(u.faction).push(u);
  }
  const humans = [...perFrakce.keys()].map(fid => ({ faction: fid,
    heroes: [game.STARTER_IDX[game.FACTION_DEFS[fid].key] ?? 0] }));
  // Svět se šije na míru davu: bez pevného argumentu se vybere NEJMENŠÍ mapa,
  // na které dostane každý hráč nejnabitější frakce svých CIL_POLI_NA_HRACE.
  // Padesát lidí tak hraje na útulných 69×69, osm set na 271×271 — MUSÍ to
  // proběhnout před newGameMulti, geometrie stojí dřív než generátor.
  if (!MAPA_R) {
    const nejvic = Math.max(...[...perFrakce.values()].map(a => a.length));
    const R = game.velikostProPocet(nejvic);
    if (R !== game.MAP_R) game.setMapRadius(R);
    console.log(`[sezóna] ${seznam.length} hráčů, nejvíc ${nejvic} v jedné frakci`
      + ` → svět ${2 * game.MAP_R + 1}×${2 * game.MAP_R + 1}`);
  } else {
    console.log(`[sezóna] ${seznam.length} hráčů → pevný svět `
      + `${2 * game.MAP_R + 1}×${2 * game.MAP_R + 1} (${game.MAP_R === MAPA_PEVNA ? "pevná velikost" : "z argumentu"})`);
  }
  game.newGameMulti(humans, Date.now() % 100000);
  if (BEZ_AI) console.log("[hra] svět BEZ AI — vypnuto " + game.zrusAI() + " rodů");

  ucastnici = new Map();
  for (const [fid, lidi] of perFrakce) {
    lidi.forEach((u, idx) => {
      let cid = 0;
      if (idx > 0) {
        const clen = game.pridejClena(fid, u.jmeno);
        cid = clen ? clen.cid : 0;   // nouzově sdílí zakladatele (nevešlo se město)
        if (!clen) console.error(`[hra] pro ${u.jmeno} se nevešlo město — sdílí zakladatele frakce ${fid}`);
      }
      ucastnici.set(u.klic, { faction: fid, cid, jmeno: u.jmeno });
    });
  }
  prestavRejstrikAkteru();
  // Surovinové nabídky z MINULÝCH sezón se ruší — vracet není co ani komu,
  // sezónní majetek se resetuje a aktér z minulé sezóny už neexistuje.
  // Výbava a dárky žijí na účtu, takže jejich nabídky zůstávají v platnosti.
  // ⚠ Musí to být AŽ ZA newGameMulti — do té chvíle je G.seasonNumber starý.
  const zrusenych = burza.uklidSezonu(G.seasonNumber);
  if (zrusenych) console.log("[burza] zrušeno " + zrusenych + " surovinových nabídek z minulé sezóny");

  // trvalý postup z účtů: sklad předmětů, úrovně a výbava startovních hrdinů
  // (na AKTÉRA hráče — inventáře členů se nemíchají)
  for (const u of seznam) {
    const acc = u.accKey ? accData.accounts[u.accKey] : null;
    if (!acc) continue;
    const m = ucastnici.get(u.klic);
    // startovní hrdina frakce zůstává hráči na účtu natrvalo
    const fk = game.FACTION_DEFS[m.faction].key;
    const key = fk + ":" + (game.STARTER_IDX[fk] ?? 0);
    if (!game.heroUnlocked(acc, key)) { acc.heroUnlocks[key] = 1; saveAccounts(); }
    // IV-H: nová sezóna nuluje SÍLU (úroveň, zkušenosti, body), SBÍRKA zůstává
    game.resetSezonyUctu(acc);
    const f = G.factions[m.faction];
    game.applyAccountToFaction(game.clenPodleCid(f, m.cid) || f, acc);
  }

  phase = "running";
  posta.clear(); reportyStore.clear(); poslednyRozeslany = 0;
  eventBuffer = [];
  zmeneneDlazdice(true); // srovnat otisky na novou mapu — první delta jinak nese celý svět
  for (const [token, p] of players) {
    if (!posadDoSezony(p, token)) { p.faction = null; continue; }
    send(p.ws, { type: "started", yourFaction: p.faction, yourMember: p.member || 0,
      state: serializeState(token, true), events: [] }); // plná mapa při startu
  }
  spustTik();
  G.seasonNumber = sezona;
  rozvrh.zacni();
  ulozSezonu();   // hned první snímek, ať start přežije i pád v následující vteřině
  broadcastLobby();  // i kdo do sezóny nepatří, musí vědět, že zápisy jsou zavřené
  console.log(`[hra] start sezóny ${sezona}: ${seznam.length} hráčů v ${perFrakce.size} frakcích`
    + ` (${seznam.slice(0, 8).map(u => u.jmeno).join(", ")}${seznam.length > 8 ? ", …" : ""})`);
  return true;
}

// ruční start z lobby — hraje se hned s tím, kdo je připojený a vybral frakci
function tryStart() {
  const seznam = [];
  for (const [token, p] of players)
    if (p.faction !== null) seznam.push({ klic: klicHrace(p, token), jmeno: p.name, faction: p.faction, accKey: p.accKey || null });
  return zacniSezonu(seznam);
}

// start v naplánovaném termínu — hraje se s tím, kdo se PŘIHLÁSIL, ať je
// zrovna online nebo ne; místo ve světě mu drží účet
function startPodleRozvrhu() {
  const seznam = Object.entries(rozvrh.ted().prihlasky)
    .map(([accKey, p]) => ({ klic: accKey, jmeno: p.jmeno, faction: p.faction, accKey }));
  if (!seznam.length) {
    // nikdo se nepřihlásil — posuň termín, ať server nezačíná prázdnou sezónu
    rozvrh.naplanuj(Date.now() + rozvrh.PRODLEVA_DALSI_H * 3600 * 1000);
    console.log(`[rozvrh] do sezóny ${rozvrh.ted().cislo} se nikdo nepřihlásil — posunuto o ${rozvrh.PRODLEVA_DALSI_H} h`);
    broadcastLobby();
    return false;
  }
  console.log(`[rozvrh] nastal termín sezóny ${rozvrh.ted().cislo} — startuji s ${seznam.length} přihlášenými`);
  return zacniSezonu(seznam);
}

function backToLobby() {
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  if (phase === "running") { syncAccounts(); flushAccounts(); }
  phase = "lobby";
  sezonaDb.smaz();   // v lobby není co obnovovat; starý snímek by při restartu hru vzkřísil
  // Sezóna skončila předčasně (někdo ji ukončil). Bez tohohle by rozvrh zůstal
  // viset ve fázi „běží" a nikdo by se už nemohl přihlásit do další.
  if (rozvrh.ted() && rozvrh.ted().faze === "bezi") {
    rozvrh.dalsi();
    sezona = rozvrh.ted().cislo;
    ulozStav();
  }
  for (const p of players.values()) { p.faction = null; p.heroes = null; p.member = 0; }
  broadcastLobby();
}

// ---------- příkazy hráčů (validuje herní logika sama) ----------
const CMDS = {
  startMarch: (f, d) => game.startMarch(f, G.tiles.get(d.tileKey), d.army, d.heroIdx, !!d.returnAfter),
  startReinforce: (f, d) => game.startReinforce(f, G.tiles.get(d.tileKey), d.army),
  startReinforceAttack: (f, d) =>
    game.startReinforceAttack(f, G.tiles.get(d.tileKey), d.heroIdx, d.army, !!d.raid),
  startRecall: (f, d) => game.startRecall(f, d.heroIdx),
  turnBackMarch: (f, d) => game.turnBackMarch(f, d.heroIdx),
  cancelReinforce: (f, d) => game.cancelReinforce(f, d.heroIdx),
  toggleGuard: (f, d) => game.toggleGuard(f, d.heroIdx),
  startBuild: (f, d) => game.startBuild(f, d.key),
  buildOutpost: (f, d) => game.buildOutpost(f, G.tiles.get(d.tileKey)),
  // CHAT (etapa 9) — délku i prodlevu hlídá game.js, server jen předá
  chatPosli: (f, d) => !!game.chatPosli(f, String(d.kanal || ""), String(d.text || ""),
    d.komu ? String(d.komu) : null),
  // POLITIKA (etapa 10) — hlasovat smí jen členové rozhodujícího klanu,
  // hlídá si to game.js (server nesmí věřit klientovi ani v tomhle)
  zahajHlasovani: (f, d) => !!game.zahajHlasovani(f, String(d.typ || ""), d.cil | 0, +d.prah || 0.5),
  hlasuj: (f, d) => game.hlasuj(f, d.id | 0, !!d.pro),
  nabidniSpojenectvi: (f, d) => game.nabidniSpojenectvi(f, d.cil | 0),
  zrusSpojenectvi: (f) => game.zrusSpojenectvi(f),
  // KLANY (etapa 8) — jméno klanu se ořízne až v game.js, cid je celé číslo
  zalozKlan: (f, d) => !!game.zalozKlan(f, String(d.jmeno || "")),
  prijmiDoKlanu: (f, d) => game.prijmiDoKlanu(f, d.cid | 0),
  odejdiZKlanu: (f) => game.odejdiZKlanu(f),
  povysDustojnika: (f, d) => game.povysDustojnika(f, d.cid | 0),
  sesadDustojnika: (f, d) => game.sesadDustojnika(f, d.cid | 0),
  postavKlanovouPevnost: (f, d) => game.postavKlanovouPevnost(f, G.tiles.get(d.tileKey)),
  zbourejKlanovouPevnost: (f, d) => game.zbourejKlanovouPevnost(f, G.tiles.get(d.tileKey)),
  navrhniVyhazov: (f, d) => game.navrhniVyhazov(f, d.cid | 0),
  prijmiVyhazov: (f) => game.prijmiVyhazov(f),
  odmitniVyhazov: (f) => game.odmitniVyhazov(f),
  outpostDeposit: (f, d) => game.outpostDeposit(f, G.tiles.get(d.tileKey), d.army),
  ringGather: (f, d) => game.ringGather(f, G.tiles.get(d.tileKey)),
  ringTrain: (f, d) => game.ringTrain(f, d.heroIdx),
  ringRest: (f, d) => game.ringRest(f, d.heroIdx),
  // strom Prstenu (v0.31)
  ringLearn: (f, d) => game.ringLearn(f, String(d.vetev || "")),
  ringReset: (f) => game.ringReset(f),
  outpostWithdraw: (f, d) => game.outpostWithdraw(f, G.tiles.get(d.tileKey)),
  // odebrání pole (v0.39)
  abandonTile: (f, d) => game.abandonTile(f, G.tiles.get(d.tileKey)),
  cancelAbandon: (f, d) => game.cancelAbandon(f, G.tiles.get(d.tileKey)),
  startRecruit: (f, d) => game.startRecruit(f, d.type, d.batches || 1),
  startRecruitOrder: (f, d) => game.startRecruitOrder(f, d.order || {}),
  cancelRecruit: (f, d) => game.cancelRecruit(f, d.index | 0),
  marketExchange: (f, d) => game.marketExchange(f, d.from, d.to, d.amount | 0),
  refineItem: (f, d) => game.refineItem(f, d.itemId),
  hireHero: (f, d) => game.hireHero(f, d && d.defIdx != null ? d.defIdx | 0 : null),
  deployHero: (f, d) => game.deployHero(f, String(d.fkey || ""), d.defIdx | 0),
  setHeroPreset: (f, d) => game.setHeroPreset(f, d.heroIdx | 0, d.army || null),
  zvolDruhyRod: (f, d) => game.zvolDruhyRod(f, String(d.fkey || "")),
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
  // akční rádius a válka (v0.29)
  heroSettle: (f, d) => game.heroSettle(f, d.heroIdx | 0),
  declareWar: (f, d) => game.declareWar(f, d.targetId | 0),
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
          existing.doruceno = 0;   // po reconnectu pošli celou schránku znovu
          existing.chatDoruceno = 0; // a taky viditelný chat (klient o něj přišel)
          existing.logDoruceno = 0;  // a kroniku
          send(ws, { type: "started", yourFaction: existing.faction, yourMember: existing.member || 0, state: serializeState(token, true), events: [] }); // reconnect = plná mapa
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
    // ---------- e-mail: potvrzení a zapomenuté heslo (v0.51) ----------
    if (msg.type === "nastavEmail") {
      const acc = accOf(p);
      if (!acc) { send(ws, { type: "accError", text: "Nejdřív se přihlas." }); return; }
      const r = nastavEmail(acc, msg.email);
      if (r.error) { send(ws, { type: "accError", text: r.error }); return; }
      send(ws, { type: "accInfo", text: `Poslali jsme na ${r.email} potvrzovací odkaz.` });
      send(ws, profileMsg(acc));
      return;
    }
    if (msg.type === "posliOvereni") {
      posliOvereniZnovu(msg.kdo);
      send(ws, { type: "accInfo", text: "Když ta síň existuje a čeká na potvrzení, odkaz je na cestě." });
      return;
    }
    if (msg.type === "zapomenuteHeslo") {
      zadostOHeslo(msg.kdo);
      send(ws, { type: "accInfo", text: "Když ta síň existuje, poslali jsme na její e-mail odkaz na nové heslo." });
      return;
    }

    if (msg.type === "accRegister" || msg.type === "accLogin") {
      const r = msg.type === "accRegister"
        ? accRegister(msg.name, msg.pass, msg.email) : accLogin(msg.name, msg.pass);
      if (r.error) { send(ws, { type: "accError", text: r.error, neovereno: !!r.neovereno }); return; }
      // registrace ještě není přihlášení — nejdřív potvrzení z e-mailu
      if (r.ceka) {
        send(ws, { type: "accCekaOvereni", email: r.acc.email, name: r.acc.name });
        return;
      }
      p.accKey = r.key;
      console.log(`[účet] ${p.name} přihlášen jako "${r.acc.name}"`);
      send(ws, { ...profileMsg(r.acc), authToken: r.acc.authToken });
      posadPoPrihlaseni(p, token, ws);
      return;
    }
    if (msg.type === "accToken") {
      const r = accByToken(msg.authToken);
      if (!r) { send(ws, { type: "accError", text: "", silent: true }); return; }
      p.accKey = r.key;
      console.log(`[účet] ${p.name} přihlášen tokenem jako "${r.acc.name}"`);
      send(ws, { ...profileMsg(r.acc), authToken: r.acc.authToken });
      posadPoPrihlaseni(p, token, ws);
      return;
    }
    if (msg.type === "accLogout") { p.accKey = null; return; }

    if (msg.type === "openChest") {
      const acc = accOf(p);
      if (!acc) { send(ws, { type: "accError", text: "Nejdřív se přihlas k účtu." }); return; }
      const liveFaction = (phase === "running" && p.faction !== null)
        ? aktorOf(p) : null; // v0.32: kořist a nákupy jdou aktérovi hráče
      // dávka (v0.38): počet bere server sám, klient smí chtít jen 1 nebo CHEST_BULK
      const pocet = msg.count > 1 ? game.CHEST_BULK : 1;
      const res = pocet > 1
        ? game.accountOpenChests(acc, msg.tier, msg.side, liveFaction, pocet)
        : game.accountOpenChest(acc, msg.tier, msg.side, liveFaction);
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
        side: res.side, items, chestBoosts: res.boosts, gifts: res.gifts,
        zdarma: res.zdarma, invite: res.invite, invites: res.invites,
        pocet: res.pocet, cena: res.cena,
        chestPity: res.pity, chestPityAt: res.pityAt });
      return;
    }

    if (msg.type === "shopBuy") {
      const acc = accOf(p);
      if (!acc) { send(ws, { type: "accError", text: "Nejdřív se přihlas k účtu." }); return; }
      if (phase !== "running" || p.faction === null) {
        send(ws, { type: "accError", text: "Nákupy jdou jen za běžící hry." }); return;
      }
      const faction = aktorOf(p); // v0.32: nákup platí a bere AKTÉR hráče
      const res = game.buyShopOffer(faction, acc, msg.slot | 0);
      if (!res) { send(ws, { type: "accError", text: "Nákup nevyšel — zlato, nebo denní limit." }); return; }
      game.syncAccountFromFaction(acc, faction);
      saveAccounts();
      broadcastState();
      send(ws, { ...profileMsg(acc), type: "shopResult", res, slot: msg.slot | 0 });
      return;
    }

    if (msg.type === "wishlist") {
      const acc = accOf(p);
      if (!acc) { send(ws, { type: "accError", text: "Nejdřív se přihlas k účtu." }); return; }
      game.wishlistToggle(acc, String(msg.key || ""));
      saveAccounts();
      send(ws, profileMsg(acc));
      return;
    }

    // použití dárků ze skladu (v0.43) — jde i mimo běžící hru (postup je na účtu)
    if (msg.type === "useGift") {
      const acc = accOf(p);
      if (!acc) { send(ws, { type: "accError", text: "Nejdřív se přihlas k účtu." }); return; }
      const ziva = phase === "running" && p.faction !== null ? aktorOf(p) : null;
      const vysledek = game.useGifts(acc, String(msg.key || ""), msg.pocet | 0, ziva);
      if (!vysledek) { send(ws, { type: "accError", text: "Takový dárek na účtu nemáš." }); return; }
      saveAccounts();
      if (ziva) broadcastState();
      send(ws, { ...profileMsg(acc), type: "giftUsed", vysledek });
      return;
    }

    // ---- KLANOVÁ BURZA (etapa 9) ----
    if (msg.type === "burzaVystav" || msg.type === "burzaZrus"
        || msg.type === "burzaPrijmi" || msg.type === "burzaSeznam") {
      // chyby burzy chodí jako burzaChyba (ne accError) — panel burzy je
      // ukazuje na svém místě a hráč netápe, co se pokazilo
      const acc = accOf(p);
      if (!acc) { send(ws, { type: "burzaChyba", text: "Nejdřív se přihlas k účtu." }); return; }
      const klic = klicUctu(acc);
      const aktor = phase === "running" && p.faction !== null ? aktorOf(p) : null;
      if (!aktor) { send(ws, { type: "burzaChyba", text: "Burza patří k rozehrané sezóně." }); return; }
      let vysledek = { ok: true };
      if (msg.type === "burzaVystav")
        vysledek = burza.vystav(klic, aktor, {
          prihradka: String(msg.prihradka || ""),
          dava: msg.dava || {}, chce: msg.chce || {}, komu: String(msg.komu || ""),
        }, Date.now());
      else if (msg.type === "burzaZrus") vysledek = burza.zrus(msg.id | 0, klic);
      else if (msg.type === "burzaPrijmi")
        vysledek = burza.prijmi(msg.id | 0, klic, aktor, msg.dava || {});
      if (vysledek.error) { send(ws, { type: "burzaChyba", text: vysledek.error }); return; }
      if (msg.type !== "burzaSeznam") broadcastState();
      send(ws, { ...profileMsg(acc), type: "burzaStav",
        nabidky: burza.seznam(klic, aktor), akce: msg.type });
      return;
    }

    // ETAPA 12b: jazyk se ukládá na ÚČET, ať hráč přijde odkudkoli
    if (msg.type === "nastavJazyk") {
      const acc = accOf(p);
      if (!acc) return;
      const kod = String(msg.jazyk || "").slice(0, 5);
      if (!/^[a-z]{2}$/.test(kod)) return;
      acc.jazyk = kod;
      saveAccounts();
      send(ws, profileMsg(acc));
      return;
    }

    if (msg.type === "useBoost") {
      const acc = accOf(p);
      if (!acc) { send(ws, { type: "accError", text: "Nejdřív se přihlas k účtu." }); return; }
      if (phase !== "running" || p.faction === null) {
        send(ws, { type: "accError", text: "Doplňky lze použít jen za běžící hry." }); return;
      }
      if (!game.accountUseBoost(acc, msg.kind, msg.tier | 0, aktorOf(p))) { // v0.32: boost jde aktérovi
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

    // ---------- bojové reporty: stav přečtení drží server (v0.50) ----------
    if (msg.type === "reportPrecten") {
      const sch = postaHrace(p, token);
      if (!sch) return;
      const ids = msg.vse ? sch.ids.slice() : [msg.id | 0];
      for (const id of ids) if (sch.ids.includes(id) && !sch.precteno.includes(id)) sch.precteno.push(id);
      send(ws, { type: "reportyPrecteny", precteno: sch.precteno });
      return;
    }

    // ---------- přihlášky do naplánované sezóny (etapa 5b) ----------
    if (msg.type === "prihlas") {
      if (!p.accKey) { send(ws, { type: "rozvrhError", text: "Na sezónu se dá přihlásit jen s účtem." }); return; }
      const r = rozvrh.prihlas(p.accKey, msg.faction, p.name);
      if (r.error) { send(ws, { type: "rozvrhError", text: r.error }); return; }
      console.log(`[rozvrh] ${p.name} se přihlásil do sezóny ${rozvrh.ted().cislo} za ${game.FACTION_DEFS[r.faction].name}`);
      broadcastLobby();
      return;
    }
    if (msg.type === "odhlas") {
      const r = p.accKey ? rozvrh.odhlas(p.accKey) : { error: "Nejsi přihlášený." };
      if (r.error) { send(ws, { type: "rozvrhError", text: r.error }); return; }
      broadcastLobby();
      return;
    }

    if (msg.type === "pick" && phase === "lobby") {
      const f = msg.faction;
      // v0.32: frakci smí sdílet až CLENU_MAX hráčů (zakladatel + členové)
      const taken = [...players.values()].filter(q => q !== p && q.faction === f).length >= CLENU_MAX;
      // v0.27: hrdina se nevybírá (dává ho frakce); frakcí je 8 (dřív chyba f < 4)
      const hero = f === null ? null : (game.STARTER_IDX[game.FACTION_DEFS[f] && game.FACTION_DEFS[f].key] ?? 0);
      if (f === null || (Number.isInteger(f) && f >= 0 && f < game.FACTION_DEFS.length && !taken)) {
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
      if (!G.factions[p.faction] || !G.factions[p.faction].alive) return;
      // v0.32: příkazy vykonává AKTÉR hráče (zakladatel či člen frakce) —
      // signatury CMDS se nemění, per-hráčská pole žijí na aktérovi
      const faction = aktorOf(p);
      if (!faction) return;
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

game.setSeasonHours(SEZONA_HODIN);
if (MAPA_R) game.setMapRadius(MAPA_R); // před tryStart — geometrie musí stát dřív než genMap

// Kolik hráčů se smí do frakce přihlásit. Od v0.52 se to POČÍTÁ ze země
// (žádné stavění světů nanečisto), takže je to zadarmo a jde to i nad
// velké mapy, kde měření trvalo desítky sekund.
CLENU_MAX = zmerKapacitu();
// burza sdílí databázi s účty — úschova musí jít zapsat v jedné transakci
burza.nacti(uctyDb, () => G);
rozvrh.nacti({ delkaHodin: SEZONA_HODIN, mistNaFrakci: CLENU_MAX });
sezona = rozvrh.ted().cislo;   // rozvrh je jediný zdroj čísla sezóny

// běžela při posledním vypnutí sezóna? zvedni ji tam, kde skončila
// ⚠ POSLOUCHAT SE ZAČÍNÁ PŘED OBNOVOU SEZÓNY.
// Obnova je synchronní a na velké mapě trvá desítky vteřin (rozbalit snímek,
// postavit 912 tisíc dlaždic, srovnat otisky). Dokud server neposlouchá, vrací
// Caddy každému hráči 502 — na 955×955 to bylo přes minutu po každém nasazení.
// Když se socket otevře dřív, spojení jen POČKÁ, než start dokouše.
httpServer.listen(PORT);

// běžela při posledním vypnutí sezóna? zvedni ji tam, kde skončila
const t0Obnovy = Date.now();
const obnoveno = obnovSezonu();
if (obnoveno) console.log("[sezóna] obnova trvala " + (Date.now() - t0Obnovy) + " ms");
mail.zkontrolujKlic();   // hlásí do logu, jestli maily vůbec můžou chodit
if (obnoveno && rozvrh.ted().faze !== "bezi") rozvrh.zacni();  // srovnat rozvrh se skutečností


// Naplánovaný start. Kontrola po 15 s: termín je sice na hodiny, ale nechat
// lidi zírat na vypršelý odpočet celou minutu vypadá jako by se hra zasekla.
setInterval(() => {
  if (phase === "lobby" && rozvrh.jeCas()) startPodleRozvrhu();
  // vypršelé nabídky burzy vrací úschovu — nechodí to po tiku, protože
  // platnost se počítá ve dnech, ne v ticích sezóny
  const vratil = burza.vyprsele(Date.now());
  if (vratil) console.log("[burza] vypršelo " + vratil + " nabídek, úschova vrácena");
}, 15000);

// systemd posílá při restartu SIGTERM — poslední snímek a zápis účtů musí projít
// dřív, než proces zmizí, jinak se ztratí až ULOZ_KAZDYCH tiků hry
let koncim = false;
function ukonci(signal) {
  if (koncim) return;
  koncim = true;
  console.log(`\n[server] ${signal} — ukládám stav a končím`);
  if (phase === "running") { ulozSezonu(); syncAccounts(); }
  flushAccounts();
  try { uctyDb.zavri(); } catch (e) {}
  process.exit(0);
}
process.on("SIGTERM", () => ukonci("SIGTERM"));
process.on("SIGINT", () => ukonci("SIGINT"));

httpServer.on("listening", () => {   // banner; socket poslouchá už od místa výš
  console.log(`   sezóna ${sezona} · délka ${SEZONA_HODIN} h` + (SEZONA_HODIN === 336 ? " (cílová; krátká sezóna na zkoušku: node server/server.js ${PORT} 1)" : " (zkrácená)")
    + (MAPA_R ? ` · mapa ${2 * game.MAP_R + 1}×${2 * game.MAP_R + 1}` : "")
    + (BEZ_AI ? " · BEZ AI" : "")
    + (obnoveno ? ` · POKRAČUJE po restartu od tiku ${G.tick}` : ""));
  console.log("⚔ Válka popela — multiplayer server");
  console.log(`   hra běží na:  http://localhost:${PORT}`);
  // od etapy 5 běží hra i veřejně na warofash.com; ostrý běh za Caddym
  // se pozná podle toho, že mu port nikdo nepředal argumentem
  console.log("   veřejně: https://warofash.com (za Caddym), lokálně přes port výš");
  console.log("   ukončení: Ctrl+C");
});
