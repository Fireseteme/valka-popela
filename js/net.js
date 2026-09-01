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
// Vývojářský přepis délky sezóny z adresy (index.html?sezona=1) — sólo hra
// jinak jede na CÍLOVÝCH 14 dnech. Lobby serveru ho NESMÍ přepsat: domov se
// k serveru připojuje sám, takže by přepis okamžitě zanikl.
let sezonaZUrl = false;

const NET_CMDS = {
  startMarch: (f, tile, army, heroIdx, returnAfter) =>
    ({ tileKey: keyOf(tile.q, tile.r), army, heroIdx, returnAfter: !!returnAfter }),
  startReinforce: (f, tile, army) => ({ tileKey: keyOf(tile.q, tile.r), army }),
  startReinforceAttack: (f, tile, heroIdx, army, raid) =>
    ({ tileKey: keyOf(tile.q, tile.r), heroIdx, army, raid: !!raid }),
  startRecall: (f, heroIdx) => ({ heroIdx }),
  turnBackMarch: (f, heroIdx) => ({ heroIdx }),
  cancelReinforce: (f, heroIdx) => ({ heroIdx }),
  toggleGuard: (f, heroIdx) => ({ heroIdx }),
  startBuild: (f, key) => ({ key }),
  buildOutpost: (f, tile) => ({ tileKey: keyOf(tile.q, tile.r) }),
  // CHAT (etapa 9)
  chatPosli: (f, kanal, text, komu) => ({ kanal, text, komu }),
  // POLITIKA (etapa 10)
  zahajHlasovani: (f, typ, cil, prah) => ({ typ, cil, prah }),
  hlasuj: (f, id, pro) => ({ id, pro: !!pro }),
  nabidniSpojenectvi: (f, cil) => ({ cil }),
  zrusSpojenectvi: () => ({}),
  // KLANY (etapa 8)
  zalozKlan: (f, jmeno) => ({ jmeno }),
  prijmiDoKlanu: (f, cid) => ({ cid }),
  odejdiZKlanu: () => ({}),
  povysDustojnika: (f, cid) => ({ cid }),
  sesadDustojnika: (f, cid) => ({ cid }),
  postavKlanovouPevnost: (f, tile) => ({ tileKey: keyOf(tile.q, tile.r) }),
  zbourejKlanovouPevnost: (f, tile) => ({ tileKey: keyOf(tile.q, tile.r) }),
  navrhniVyhazov: (f, cid) => ({ cid }),
  prijmiVyhazov: () => ({}),
  odmitniVyhazov: () => ({}),
  outpostDeposit: (f, tile, army) => ({ tileKey: keyOf(tile.q, tile.r), army }),
  outpostWithdraw: (f, tile) => ({ tileKey: keyOf(tile.q, tile.r) }),
  // odebrání pole (v0.39)
  abandonTile: (f, tile) => ({ tileKey: keyOf(tile.q, tile.r) }),
  cancelAbandon: (f, tile) => ({ tileKey: keyOf(tile.q, tile.r) }),
  startRecruit: (f, type, batches) => ({ type, batches: batches || 1 }),
  startRecruitOrder: (f, order) => ({ order: order || {} }),
  cancelRecruit: (f, index) => ({ index: index | 0 }),
  marketExchange: (f, from, to, amount) => ({ from, to, amount: amount | 0 }),
  refineItem: (f, itemId) => ({ itemId }),
  ringGather: (f, tile) => ({ tileKey: keyOf(tile.q, tile.r) }),
  ringTrain: (f, heroIdx) => ({ heroIdx }),
  ringRest: (f, heroIdx) => ({ heroIdx }),
  // strom Prstenu (v0.31)
  ringLearn: (f, vetev) => ({ vetev }),
  ringReset: (f) => ({}),
  hireHero: (f, defIdx) => ({ defIdx: defIdx ?? null }),
  deployHero: (f, fkey, defIdx) => ({ fkey, defIdx }),
  setHeroPreset: (f, heroIdx, army) => ({ heroIdx, army }),
  zvolDruhyRod: (f, fkey) => ({ fkey }),
  equipItem: (f, heroIdx, itemId) => ({ heroIdx, itemId }),
  unequipItem: (f, heroIdx, slot) => ({ heroIdx, slot }),
  strengthenItem: (f, itemId, materialIds) => ({ itemId, materialIds }),
  learnSkill: (f, heroIdx, skillKey) => ({ heroIdx, skillKey }),
  respecHero: (f, heroIdx) => ({ heroIdx }),
  offerPact: (f, targetId) => ({ targetId }),
  cancelPact: (f, targetId) => ({ targetId }),
  acceptAiOffer: (aiId) => ({ aiId }),
  declineAiOffer: (aiId) => ({ aiId }),
  // akční rádius a válka (v0.29)
  heroSettle: (f, heroIdx) => ({ heroIdx }),
  declareWar: (f, targetId) => ({ targetId }),
};
const localFns = {}; // originály pro návrat do singleplayeru

function mpShopBuy(slot) { netSend({ type: "shopBuy", slot }); }
function mpWishlist(key) { netSend({ type: "wishlist", key }); }
// použití dárků ze skladu (v0.43) — server je autorita, odpověď chodí jako giftUsed
function mpUseGift(key, pocet) { netSend({ type: "useGift", key, pocet }); }

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
  // velikost světa (v0.33): klient MUSÍ počítat geometrii (REACH, zóny,
  // kapitály) stejně jako server; starý server pole neposílá → zůstává 34
  if (s.mapR && s.mapR !== MAP_R) setMapRadius(s.mapR);
  // délka sezóny: visí na ní doby stavby, obléhací okna, otevírání fází
  // i Prsten. Server ≤ v0.52 pole neposílá → zůstává hodina (fail-open).
  if (!sezonaZUrl && s.sezonaHodin && seasonTicks() !== Math.round(s.sezonaHodin * 3600))
    setSeasonHours(s.sezonaHodin);
  G.tick = s.tick;
  G.gameOver = s.gameOver;
  G.storm = s.storm;
  G.throneOpen = s.throneOpen;
  // otevírání světa (v0.30): server bez pole faze (≤ v0.29) zóny nezná —
  // fail-open na 4, jinak by klient TIŠE zamkl 88 % mapy na celou sezónu
  G.faze = s.faze === undefined ? 4 : (s.faze || 1);
  G.checkpointy = s.checkpointy || [false, false, false]; // v0.31
  // klany (etapa 8) — fail-open: starší server pole neposílá, klient pak jede
  // bez klanů místo toho, aby spadl
  G.klany = s.klany || [];
  G.rozhodujici = s.rozhodujici || {};   // etapa 10 (fail-open pro starší server)
  G.hlasovani = s.hlasovani || [];
  // KRONIKA chodí po kusech taky (etapa 9) — klient si drží vlastní seznam.
  // ⚠ NESMÍ se přiřadit `G.log = s.log`: server posílá jen NOVÉ záznamy.
  if (s.log && s.log.length) {
    if (!Array.isArray(G.log)) G.log = [];
    for (const e of s.log) if (!G.log.some(x => x.id === e.id)) G.log.push(e);
    if (G.log.length > LOG_MAX) G.log.splice(0, G.log.length - LOG_MAX);
  }
  // chat chodí PO KUSECH (jako reporty) — klient si drží vlastní seznam
  if (s.chat && s.chat.length) {
    if (!G.chat) G.chat = [];
    for (const m of s.chat) if (!G.chat.some(x => x.id === m.id)) G.chat.push(m);
    if (G.chat.length > 400) G.chat.splice(0, G.chat.length - 400);
    if (typeof onChatPrisel === "function") onChatPrisel(s.chat);
  }
  G.nextStormTick = s.nextStormTick;
  G.throneHold = s.throneHold || { fid: -1, ticks: 0, pulka: false };
  G.winnerId = s.winnerId ?? -1;
  G.seasonNumber = s.seasonNumber || 1;
  G.mapEvents = s.mapEvents;
  G.clashes = s.clashes || [];
  // G.log se od etapy 9 NEPŘEPISUJE — merguje se výš (server posílá jen nové)
  G.factions = s.factions;
  // v0.33 (etapa 4d): plná mapa jde jen při startu/reconnectu a jednou za
  // FULL_KAZDYCH tiků; jinak chodí jen změněné dlaždice (tilesDelta) a mergují
  // se do držené mapy — výměna CELÉHO objektu dlaždice řeší i mazaná pole
  // (okno/odol/uzelCd se na serveru delete-ují a nový objekt je prostě nemá)
  if (s.tiles) {
    // AOI (etapa 11): server posílá jen OKRUH ZÁJMU, takže se dlaždice
    // MERGUJÍ — klient si mapu HROMADÍ a jednou poznané končiny mu nezmizí.
    // Bez příznaku (starší server nebo divák v lobby) přijde celá mapa a je
    // správné ji vyměnit.
    if (s.aoi) { for (const t of s.tiles) G.tiles.set(keyOf(t.q, t.r), t); }
    else G.tiles = new Map(s.tiles.map(t => [keyOf(t.q, t.r), t]));
  } else if (s.tilesDelta) {
    for (const t of s.tilesDelta) G.tiles.set(keyOf(t.q, t.r), t);
  }
  for (const r of (s.newReports || [])) G.reports.push(r);
  if (G.reports.length > 40) G.reports = G.reports.slice(-40);
  // stav „přečteno" drží server (v0.50) — přežije reload i jiné zařízení
  if (s.precteno && typeof readReports !== "undefined")
    for (const id of s.precteno) readReports.add(id);
  G.goals = (s.goals || []).map(g =>
    ({ def: SEASON_GOALS.find(d => d.key === g.key), done: g.done }));
  computeVisibility();
  G.running = true;
  G.lastTickAt = performance.now();
  // server ≤ v0.51 nezná čtvrtý slot formace — doplní se, ať aritmetika armád
  // nepracuje s undefined (fail-open jako u faze a checkpointů)
  if (typeof normalizujArmady === "function") normalizujArmady(G);
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
    if (typeof domovSpojeni === "function") domovSpojeni("ok");
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
    } else if (msg.type === "burzaStav") {
      // seznam nabídek posílá server (žijí v jeho databázi); profil přišel s tím
      mp.burza = msg.nabidky || [];
      burzaChyba = "";
      if (typeof acct !== "undefined" && acct.remote) {
        acct.remote.cores = msg.cores;
        acct.remote.jadraVNabidkach = msg.jadraVNabidkach | 0;
        acct.remote.invItems = msg.invItems || acct.remote.invItems;
        acct.remote.darky = msg.darky || acct.remote.darky;
      }
      burzaSig = null;
    } else if (msg.type === "burzaChyba") {
      burzaChyba = msg.text || "Obchod se nepovedl.";
      burzaSig = null;
    } else if (msg.type === "account") {
      const wasLogged = !!acct.remote;
      acct.mode = "remote";
      acct.remote = { name: msg.name, cores: msg.cores, inv: msg.inv,
        // stav e-mailu (v0.51) — Profil podle něj nabídne přidání či potvrzení
        email: msg.email || "", emailCeka: msg.emailCeka || "", emailOvereno: !!msg.emailOvereno,
        jazyk: msg.jazyk || "",             // v0.62: jazyk účtu
        jadraCekaji: msg.jadraCekaji | 0,   // v0.58: uvítací jádra čekají na odkaz z mailu
        jadraVNabidkach: msg.jadraVNabidkach | 0,  // v0.59: úschova burzy
        invItems: msg.invItems || (acct.remote && acct.remote.invItems) || [], // Sklad (v0.39)
        heroUnlocks: msg.heroUnlocks || {}, heroRespect: msg.heroRespect || {},
        heroStars: msg.heroStars || {},   // hvězdy do Síně hrdinů (v0.41)
        darky: msg.darky || {},          // sklad dárků (v0.43)
        boosts: msg.boosts || {},
        wishlist: msg.wishlist || [], freeChest: !!msg.freeChest,
        pityInvite: msg.pityInvite | 0, invitePityAt: msg.invitePityAt | 0,
        shopDay: msg.shopDay || "", shopBought: msg.shopBought || {} };
      if (msg.authToken) localStorage.setItem("vp-acc-token", msg.authToken);
      // ETAPA 12b: jazyk z účtu přebije místní volbu — hráč přišel z jiného
      // zařízení a hra má být v jeho jazyce
      if (msg.jazyk && msg.jazyk !== aktualniJazyk()) {
        nastavJazyk(msg.jazyk);
        if (typeof prekresliJazyk === "function") prekresliJazyk();
      }
      // ⚠ Po přihlášení se překresluje PĚT nezávislých kusů rozhraní. Když
      // kterýkoli z nich hodí výjimku, zbytek se NEPROVEDE a hráč zůstane
      // koukat na odhlášenou obrazovku, dokud nedá F5 — bez jediné stopy,
      // protože výjimka uvnitř posluchače zprávy jen tiše ukončí handler.
      // Každý kus proto běží zvlášť a případný pád se hlásí do konzole.
      const prekresli = (co, f) => {
        try { f(); } catch (e) { console.error("[účet] překreslení „" + co + "\" selhalo:", e); }
      };
      prekresli("lišta účtu", () => { if (wasLogged) refreshAccCores(); else renderAccBox(); });
      prekresli("truhly", () => updateChestsPanel(true));   // nezavírat truhly v lobby
      prekresli("domov", () => { if (typeof renderDomov === "function") renderDomov(); });
      if (msg.respecNote) setAccStatus(tx("ucet.respec"));
      if (msg.redeemed) setChestStatus(tx("tru.kod.ok", { n: msg.redeemed, ikona: "💠" }));
      updatePanels();
    } else if (msg.type === "giftUsed") {
      // profil přišel s odpovědí; oslavy odemčení a R10 jedou stejnou cestou
      // jako v sólu, aby se hráč o povýšení dozvěděl i v MP
      if (typeof updateHeroesPanel === "function") updateHeroesPanel();
      oslavyZVysledku(msg.vysledek);
      setChestStatus(darkyStatusText(msg.vysledek));
      updatePanels();
    } else if (msg.type === "accError" && msg.neovereno) {
      if (typeof domovStavUctu === "function") domovStavUctu(msg.text, true);
      if (typeof setAccStatus === "function") setAccStatus(msg.text);
    } else if (msg.type === "accError") {
      if (!msg.silent) { setAccStatus(msg.text); setChestStatus(msg.text); }
    } else if (msg.type === "chestResult") {
      acct.remote = { name: msg.name || (acct.remote ? acct.remote.name : "?"),
        cores: msg.cores, inv: msg.inv,
        invItems: msg.invItems || (acct.remote && acct.remote.invItems) || [], // Sklad (v0.39)
        heroUnlocks: msg.heroUnlocks || {}, heroRespect: msg.heroRespect || {},
        heroStars: msg.heroStars || {},   // hvězdy do Síně hrdinů (v0.41)
        darky: msg.darky || {},          // sklad dárků (v0.43)
        boosts: msg.boosts || {},
        wishlist: msg.wishlist || [], freeChest: !!msg.freeChest,
        pityInvite: msg.pityInvite | 0, invitePityAt: msg.invitePityAt | 0,
        shopDay: msg.shopDay || "", shopBought: msg.shopBought || {} };
      refreshAccCores();
      showChestReveal(msg.tier, { items: msg.items || [], boosts: msg.chestBoosts || [],
        gifts: msg.gifts || (msg.gift ? [msg.gift] : []), side: msg.side,
        zdarma: !!msg.zdarma, invite: msg.invite || null,
        invites: msg.invites || null,          // dávka: víc listů naráz (v0.38)
        pocet: msg.pocet || 1, cena: msg.cena || 0 });
      updatePanels();
    } else if (msg.type === "shopResult") {
      if (typeof onShopResult === "function") onShopResult(msg.res, msg.slot);
      updatePanels();
    } else if (msg.type === "lobby") {
      mp.lobby = msg;
      renderMpLobby();
      if (typeof renderDomov === "function") renderDomov();
    } else if (msg.type === "started" || (msg.type === "state" && !mp.active)) {
      enableNetMode();
      mp.myFaction = msg.yourFaction;
      mp.myMember = msg.yourMember || 0; // v0.32: můj aktér ve frakci
      if (typeof domovSkryj === "function") domovSkryj();
      startNetGame(msg.yourFaction, msg.state, msg.events, msg.yourMember || 0);
    } else if (msg.type === "state") {
      mp.myFaction = msg.yourFaction;
      mp.myMember = msg.yourMember || 0;
      G.playerFaction = msg.yourFaction;
      G.playerClen = msg.yourMember || 0;
      applySnapshot(msg.state, msg.events);
    } else if (msg.type === "ended") {
      // někdo hru ukončil: všichni zpět na výběr frakcí (lobby zůstává)
      disableNetMode();
      mp.active = false;
      G.running = false;
      if (typeof closeHeroWindow === "function") closeHeroWindow();
      if (typeof closeReport === "function") closeReport();
      $("#end-overlay").classList.add("hidden");
      $("#btn-quit").classList.add("hidden");
      showFactionStep();
      if (typeof domovZpet === "function") domovZpet();
      else $("#start-overlay").classList.remove("hidden");
      $("#mp-connect").classList.add("hidden");
      $("#mp-lobby").classList.remove("hidden");
      $("#mp-status").textContent = tx("net.hru.ukoncil", { kdo: msg.by });
    } else if (msg.type === "accCekaOvereni") {
      const t = tx("net.sin.zalozena", { jmeno: msg.name, email: msg.email });
      if (typeof domovStavUctu === "function") domovStavUctu(t, true);
      if (typeof setAccStatus === "function") setAccStatus(t);
    } else if (msg.type === "accInfo") {
      if (typeof domovStavUctu === "function") domovStavUctu(msg.text);
      if (typeof setAccStatus === "function") setAccStatus(msg.text);
    } else if (msg.type === "reportyPrecteny") {
      for (const id of msg.precteno || []) readReports.add(id);
      if (typeof updateRailBadges === "function") updateRailBadges();
    } else if (msg.type === "rozvrhError") {
      if (typeof domovChybaRozvrhu === "function") domovChybaRozvrhu(msg.text);
    } else if (msg.type === "error") {
      const el = $("#mp-status");
      if (el) el.textContent = msg.text;
    }
  });
  ws.addEventListener("error", () => {
    if (!mp.active && typeof domovSpojeni === "function") domovSpojeni("pryc");
  });
  ws.addEventListener("close", () => {
    if (mp.active) {
      // výpadek za hry: zkus se za 2 s připojit zpět (token nás vrátí do hry)
      setTimeout(() => mpConnect(name), 2000);
    } else {
      $("#mp-connect").classList.remove("hidden");
      $("#mp-lobby").classList.add("hidden");
      const el = $("#mp-status");
      if (el) el.textContent = tx("net.spojeni.pryc");
      acct.mode = "local"; // bez serveru platí místní účet v prohlížeči
      acct.remote = null;
      updatePanels();
      if (typeof domovSpojeni === "function") domovSpojeni("pryc");
    }
  });
}

// vstup do běžící síťové hry (obdoba startGame bez lokálního tikání)
function startNetGame(factionIndex, state, events, memberCid) {
  chestSide = null;              // truhly zpět „podle mé frakce" (v0.38)
  G.playerFaction = factionIndex;
  G.playerClen = memberCid || 0; // v0.32: kdo jsem ve frakci
  if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
  $("#start-overlay").classList.add("hidden");
  $("#end-overlay").classList.add("hidden");
  selectedKey = null;
  tilePanelSig = null;
  closeHeroWindow();
  applySnapshot(state, events);
  // kamera na MÉM městě (člen má vlastní; kapitál je od vykořenění pohyblivý)
  const ja = clenPodleCid(G.factions[factionIndex], memberCid || 0) || G.factions[factionIndex];
  const cap = capPosOf(ja);
  const p = tileToPixel(cap.q, cap.r);
  camera.x = p.x; camera.y = p.y; camera.zoom = 1;
}

// ---------- UI lobby ----------
function renderMpLobby() {
  const box = $("#mp-players");
  if (!box || !mp.lobby) return;
  // v0.32: frakci smí sdílet víc hráčů — „plná" je až na stropu z lobby zprávy
  const clenuMax = mp.lobby.clenuMax || 1;
  const hraciFrakce = f => mp.lobby.players.filter(p => p.faction === f);
  if (!sezonaZUrl && mp.lobby.sezonaHodin && seasonTicks() !== Math.round(mp.lobby.sezonaHodin * 3600))
    setSeasonHours(mp.lobby.sezonaHodin);
  box.innerHTML = `<div class="mp-sezona">⚔ ${tx("net.sezona", { n: mp.lobby.sezona || 1 })}${(mp.lobby.sezonaHodin || 336) === 336
      ? " · " + tx("doba.dni", { n: 14 }) : ` · ${tx("net.zkracena", { h: mp.lobby.sezonaHodin })}`} — ${tx("net.lobby.popis")}</div>`
    + mp.lobby.players.map(p => {
    const fac = p.faction !== null ? FACTION_DEFS[p.faction] : null;
    return `<div class="mp-player">
      <span class="dot" style="background:${fac ? fac.color : "#555c68"}"></span>
      <b>${p.name}</b>${p.connected ? "" : " " + tx("net.odpojen")} —
      ${fac ? `${fac.name} — ⚑ ${HERO_DEFS[fac.key][STARTER_IDX[fac.key] ?? 0].name}`
            : tx("net.vybira")}
    </div>`;
  }).join("");
  // označit obsazení frakcí na kartách (v0.32: „taken" = PLNÁ, jinak jde
  // přisednout jako další člen se svým vlastním městem)
  document.querySelectorAll("#faction-cards .faction-card[data-fi]").forEach(card => {
    const i = parseInt(card.dataset.fi, 10);
    const lidi = hraciFrakce(i);
    card.classList.toggle("taken", lidi.length >= clenuMax);
    let tag = card.querySelector(".taken-tag");
    if (lidi.length) {
      if (!tag) {
        tag = document.createElement("div");
        tag.className = "taken-tag";
        card.appendChild(tag);
      }
      tag.textContent = "⚑ " + lidi.map(p => p.name).join(", ")
        + (lidi.length >= clenuMax ? " " + tx("net.plno") : "");
    } else if (tag) tag.remove();
  });
  const ready = mp.lobby.players.filter(p => p.faction !== null).length;
  $("#mp-status").textContent = ready > 0
    ? tx("net.pripraveno", { ted: ready, z: mp.lobby.players.length })
    : tx("net.vyber.si");
  $("#btn-mp-start").disabled = ready < 1;
}

// výběr frakce+hrdinů v lobby posílá showHeroSelect/btn-start-game (viz main.js)
function mpSendPick(faction) {
  netSend({ type: "pick", faction });
}
