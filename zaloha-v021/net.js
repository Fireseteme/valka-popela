"use strict";
/* Válka popela — síťový klient pro multiplayer.
   Po připojení k serveru se herní akce neprovádějí lokálně, ale posílají se
   jako příkazy; stav hry chodí zpět ve snapshotech. Vykreslování, panely,
   reporty i zvuky zůstávají beze změny — jen čtou G naplněné ze sítě. */

const mp = {
  active: false,   // běží hra po síti
  ws: null,
  // token v sessionStorage: přežije obnovení stránky (reconnect), ale každý
  // tab je vlastní hráč — dva kamarádi u jednoho počítače si nelezou do hry
  token: sessionStorage.getItem("vp-mp-token") || null,
  myFaction: null,
  lobby: null,     // poslední stav lobby ze serveru
};

// příkazy: název globální funkce → převod argumentů na síťový payload
const NET_CMDS = {
  startMarch: (f, tile, army, heroIdx, returnAfter) =>
    ({ tileKey: keyOf(tile.q, tile.r), army, heroIdx, returnAfter: !!returnAfter }),
  startReinforce: (f, tile, army) => ({ tileKey: keyOf(tile.q, tile.r), army }),
  startRecall: (f, heroIdx) => ({ heroIdx }),
  turnBackMarch: (f, heroIdx) => ({ heroIdx }),
  cancelReinforce: (f, heroIdx) => ({ heroIdx }),
  toggleGuard: (f, heroIdx) => ({ heroIdx }),
  startBuild: (f, key) => ({ key }),
  buildOutpost: (f, tile) => ({ tileKey: keyOf(tile.q, tile.r) }),
  outpostDeposit: (f, tile, army) => ({ tileKey: keyOf(tile.q, tile.r), army }),
  outpostWithdraw: (f, tile) => ({ tileKey: keyOf(tile.q, tile.r) }),
  startRecruit: (f, type, batches) => ({ type, batches: batches || 1 }),
  startRecruitOrder: (f, order) => ({ order: order || {} }),
  marketExchange: (f, from, to, amount) => ({ from, to, amount: amount | 0 }),
  refineItem: (f, itemId) => ({ itemId }),
  hireHero: (f, defIdx) => ({ defIdx: defIdx ?? null }),
  equipItem: (f, heroIdx, itemId) => ({ heroIdx, itemId }),
  unequipItem: (f, heroIdx, slot) => ({ heroIdx, slot }),
  strengthenItem: (f, itemId, materialIds) => ({ itemId, materialIds }),
  learnSkill: (f, heroIdx, skillKey) => ({ heroIdx, skillKey }),
  respecHero: (f, heroIdx) => ({ heroIdx }),
  offerPact: (f, targetId) => ({ targetId }),
  cancelPact: (f, targetId) => ({ targetId }),
  acceptAiOffer: (aiId) => ({ aiId }),
  declineAiOffer: (aiId) => ({ aiId }),
};
const localFns = {}; // originály pro návrat do singleplayeru

function netSend(msg) {
  if (mp.ws && mp.ws.readyState === WebSocket.OPEN) mp.ws.send(JSON.stringify(msg));
}

// v síťové hře mutující funkce jen odešlou příkaz — server je autorita
function enableNetMode() {
  if (mp.active) return;
  mp.active = true;
  for (const name in NET_CMDS) {
    if (!localFns[name]) localFns[name] = window[name];
    const toPayload = NET_CMDS[name];
    window[name] = (...args) => {
      netSend({ type: "cmd", cmd: name, payload: toPayload(...args) });
      return true; // stav dorazí obratem ve snapshotu
    };
  }
}

function disableNetMode() {
  mp.active = false;
  mp.myFaction = null;
  for (const name in localFns) window[name] = localFns[name];
}

// ---------- snapshoty ----------
function applySnapshot(s, events) {
  G.tick = s.tick;
  G.gameOver = s.gameOver;
  G.storm = s.storm;
  G.throneOpen = s.throneOpen;
  G.nextStormTick = s.nextStormTick;
  G.mapEvents = s.mapEvents;
  G.clashes = s.clashes || [];
  G.log = s.log;
  G.factions = s.factions;
  G.tiles = new Map(s.tiles.map(t => [keyOf(t.q, t.r), t]));
  for (const r of (s.newReports || [])) G.reports.push(r);
  if (G.reports.length > 40) G.reports = G.reports.slice(-40);
  G.goals = (s.goals || []).map(g =>
    ({ def: SEASON_GOALS.find(d => d.key === g.key), done: g.done }));
  computeVisibility();
  G.running = true;
  G.lastTickAt = performance.now();
  mapDrawnTick = -2;
  for (const ev of (events || [])) { if (G.onEvent) G.onEvent(ev.name, ev.factionId); }
  updatePanels();
  if (G.gameOver) showEndScreen();
}

// ---------- připojení a lobby ----------
function mpConnect(name) {
  const proto = location.protocol === "https:" ? "wss://" : "ws://";
  const ws = new WebSocket(proto + location.host);
  mp.ws = ws;
  ws.addEventListener("open", () => {
    netSend({ type: "hello", name, token: mp.token });
  });
  ws.addEventListener("message", e => {
    let msg;
    try { msg = JSON.parse(e.data); } catch (err) { return; }
    if (msg.type === "welcome") {
      mp.token = msg.token;
      sessionStorage.setItem("vp-mp-token", msg.token);
      $("#mp-connect").classList.add("hidden");
      $("#mp-lobby").classList.remove("hidden");
      // trvalé přihlášení k účtu: token přežívá v localStorage
      const at = localStorage.getItem("vp-acc-token");
      if (at) netSend({ type: "accToken", authToken: at });
      renderAccBox();
    } else if (msg.type === "account") {
      const wasLogged = !!acct.remote;
      acct.mode = "remote";
      acct.remote = { name: msg.name, cores: msg.cores, inv: msg.inv,
        heroUnlocks: msg.heroUnlocks || {}, heroRespect: msg.heroRespect || {},
        boosts: msg.boosts || {} };
      if (msg.authToken) localStorage.setItem("vp-acc-token", msg.authToken);
      if (wasLogged) refreshAccCores(); else renderAccBox(); // nezavírat truhly v lobby
      updateChestsPanel(true);
      if (msg.respecNote) setAccStatus("Stromy dovedností se změnily — všechny investované body byly vráceny.");
      if (msg.redeemed) setChestStatus(`Kód uplatněn: +${msg.redeemed} 💠.`);
      updatePanels();
    } else if (msg.type === "accError") {
      if (!msg.silent) { setAccStatus(msg.text); setChestStatus(msg.text); }
    } else if (msg.type === "chestResult") {
      acct.remote = { name: msg.name || (acct.remote ? acct.remote.name : "?"),
        cores: msg.cores, inv: msg.inv,
        heroUnlocks: msg.heroUnlocks || {}, heroRespect: msg.heroRespect || {},
        boosts: msg.boosts || {} };
      refreshAccCores();
      showChestReveal(msg.tier, { items: msg.items || [], boosts: msg.chestBoosts || [],
        gifts: msg.gifts || (msg.gift ? [msg.gift] : []), side: msg.side });
      updatePanels();
    } else if (msg.type === "lobby") {
      mp.lobby = msg;
      renderMpLobby();
    } else if (msg.type === "started" || (msg.type === "state" && !mp.active)) {
      enableNetMode();
      mp.myFaction = msg.yourFaction;
      startNetGame(msg.yourFaction, msg.state, msg.events);
    } else if (msg.type === "state") {
      mp.myFaction = msg.yourFaction;
      G.playerFaction = msg.yourFaction;
      applySnapshot(msg.state, msg.events);
    } else if (msg.type === "ended") {
      // někdo hru ukončil: všichni zpět na výběr frakcí (lobby zůstává)
      disableNetMode();
      mp.active = false;
      G.running = false;
      if (typeof closeHeroWindow === "function") closeHeroWindow();
      if (typeof closeReport === "function") closeReport();
      $("#end-overlay").classList.add("hidden");
      $("#start-overlay").classList.remove("hidden");
      $("#btn-quit").classList.add("hidden");
      showFactionStep();
      $("#mp-connect").classList.add("hidden");
      $("#mp-lobby").classList.remove("hidden");
      $("#mp-status").textContent = `Hru ukončil ${msg.by} — vyberte frakce pro novou sezónu.`;
    } else if (msg.type === "error") {
      const el = $("#mp-status");
      if (el) el.textContent = msg.text;
    }
  });
  ws.addEventListener("close", () => {
    if (mp.active) {
      // výpadek za hry: zkus se za 2 s připojit zpět (token nás vrátí do hry)
      setTimeout(() => mpConnect(name), 2000);
    } else {
      $("#mp-connect").classList.remove("hidden");
      $("#mp-lobby").classList.add("hidden");
      const el = $("#mp-status");
      if (el) el.textContent = "Spojení se serverem se přerušilo.";
      acct.mode = "local"; // bez serveru platí místní účet v prohlížeči
      acct.remote = null;
      updatePanels();
    }
  });
}

// vstup do běžící síťové hry (obdoba startGame bez lokálního tikání)
function startNetGame(factionIndex, state, events) {
  G.playerFaction = factionIndex;
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  $("#start-overlay").classList.add("hidden");
  $("#end-overlay").classList.add("hidden");
  selectedKey = null;
  tilePanelSig = null;
  closeHeroWindow();
  applySnapshot(state, events);
  const cap = CAPITAL_POS[factionIndex];
  const p = tileToPixel(cap.q, cap.r);
  camera.x = p.x; camera.y = p.y; camera.zoom = 1;
}

// ---------- UI lobby ----------
function renderMpLobby() {
  const box = $("#mp-players");
  if (!box || !mp.lobby) return;
  const takenBy = f => mp.lobby.players.find(p => p.faction === f);
  box.innerHTML = mp.lobby.players.map(p => {
    const fac = p.faction !== null ? FACTION_DEFS[p.faction] : null;
    return `<div class="mp-player">
      <span class="dot" style="background:${fac ? fac.color : "#555c68"}"></span>
      <b>${p.name}</b>${p.connected ? "" : " (odpojen)"} —
      ${fac ? `${fac.name}, ${p.heroes.map(h => HERO_DEFS[fac.key][h].name).join(" + ")}`
            : "vybírá frakci…"}
    </div>`;
  }).join("");
  // označit zabrané frakce na kartách
  document.querySelectorAll("#faction-cards .faction-card").forEach((card, i) => {
    const owner = takenBy(i);
    const mine = owner && mp.lobby.players.indexOf(owner) ===
      mp.lobby.players.findIndex(p => p.faction === i);
    card.classList.toggle("taken", !!owner);
    let tag = card.querySelector(".taken-tag");
    if (owner) {
      if (!tag) {
        tag = document.createElement("div");
        tag.className = "taken-tag";
        card.appendChild(tag);
      }
      tag.textContent = "⚑ " + owner.name;
    } else if (tag) tag.remove();
  });
  const ready = mp.lobby.players.filter(p => p.faction !== null).length;
  $("#mp-status").textContent = ready > 0
    ? `Připraveno ${ready} z ${mp.lobby.players.length} hráčů — zbytek frakcí dohraje AI.`
    : "Vyber si frakci a hrdinu (klikni na kartu frakce nahoře).";
  $("#btn-mp-start").disabled = ready < 1;
}

// výběr frakce+hrdinů v lobby posílá showHeroSelect/btn-start-game (viz main.js)
function mpSendPick(faction, heroes) {
  netSend({ type: "pick", faction, heroes });
}
