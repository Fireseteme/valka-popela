"use strict";
/* Válka popela — UI, ovládání, hlavní smyčka (verze je v index.html) */

let tickTimer = null;
let tilePanelSig = null; // podpis obsahu panelu — překreslujeme jen při změně
let panelHeld = false;   // myš je stisknutá v panelu — nepřekreslovat pod rukou

// ---------- Pomocníci ----------
const $ = sel => document.querySelector(sel);
function fmtTime(ticks) {
  const s = Math.max(0, ticks);
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}
// v0.32: „já" = můj AKTÉR (zakladatel frakce, nebo člen dle G.playerClen) —
// všechna per-hráčská pole (suroviny, hrdinové, město…) žijí na něm
function player() {
  const f = G.factions[G.playerFaction];
  if (!f) return f;
  return clenPodleCid(f, G.playerClen || 0) || f;
}
// frakce mého aktéra — pro diplomacii, války a frakční zobrazení
function myFaction() { return G.factions[G.playerFaction]; }

// ---------- Účet hráče (v0.6) ----------
// Ve hře po síti drží účet server (accounts.json); v sólo hře žije místní
// účet v localStorage. Obojí sdílí stejnou logiku z game.js.
const acct = {
  mode: "local",   // "local" | "remote"
  remote: null,    // profil ze serveru {name, cores, inv}
  local: null,     // celý místní účet (objekt z emptyAccount)
};

function loadLocalAccount() {
  try {
    const raw = localStorage.getItem("vp-account");
    const a = JSON.parse(raw);
    if (a && typeof a.cores === "number") {
      // před přestavbou stromů si odložíme původní účet (jen jednou)
      if ((a.treeV | 0) < TREE_VERSION) {
        try { localStorage.setItem("vp-account-v1-bak", raw); } catch (e) {}
      }
      acct.local = migrateAccount(a);
      saveLocalAccount();
      return;
    }
  } catch (e) {}
  acct.local = emptyAccount(tx("ucet.mistni.hrac"));
  saveLocalAccount();
}

// jednorázové oznámení, že přestavba stromů vrátila investované body
function noteRespecIfAny() {
  const a = acct.local;
  if (!a || !a.respecNote) return;
  delete a.respecNote;
  saveLocalAccount();
  setAccStatus(tx("ucet.respec"));
}

// jednotný přístup k metadatům účtu (odemčení hrdinové, oddanost, doplňky) —
// v sólu místní účet, v MP profil ze serveru
function acctMeta() { return acct.mode === "remote" ? acct.remote : acct.local; }
function heroUnlockedAcc(key) {
  const a = acctMeta();
  return !!(a && a.heroUnlocks && a.heroUnlocks[key]);
}
function acctRespect(key) {
  const a = acctMeta();
  return a && a.heroRespect ? (a.heroRespect[key] || 0) : 0;
}
function acctBoosts() {
  const a = acctMeta();
  return (a && a.boosts) || {};
}
// počítadlo smůly: kolik truhel bez legendy už padlo (v0.18)
function acctPity() {
  const a = acctMeta();
  return a ? (a.pity | 0) : 0;
}
// má hráč ve frakci odemčeného aspoň jednoho hrdinu? (jinak první volba Common)
function anyHeroUnlocked(fkey) {
  return HERO_DEFS[fkey].some((_, i) => heroUnlockedAcc(fkey + ":" + i));
}

function saveLocalAccount() {
  try { localStorage.setItem("vp-account", JSON.stringify(acct.local)); } catch (e) {}
}

function acctFreeChest() {
  return acct.mode === "remote"
    ? !!(acct.remote && acct.remote.freeChest)
    : chestFreeAvailable(acct.local);
}
function acctPityInvite() {
  return acct.mode === "remote"
    ? (acct.remote ? acct.remote.pityInvite | 0 : 0)
    : (acct.local ? acct.local.pityInvite | 0 : 0);
}
function acctWishlist() {
  return acct.mode === "remote"
    ? (acct.remote && acct.remote.wishlist) || []
    : (acct.local && acct.local.wishlist) || [];
}
function acctShopBought() {
  const meta = acct.mode === "remote" ? acct.remote : acct.local;
  if (!meta) return {};
  return meta.shopDay === dnesniDen() ? (meta.shopBought || {}) : {};
}
function acctCores() {
  return acct.mode === "remote"
    ? (acct.remote ? acct.remote.cores : null)
    : acct.local ? acct.local.cores : null;
}

function acctLabel() {
  if (acct.mode === "remote")
    return acct.remote ? tx("ucet.stitek", { jmeno: acct.remote.name }) : tx("ucet.neprihlasen");
  return tx("ucet.mistni");
}

// průběžný zápis sólo hry na místní účet (v MP totéž dělá server)
function syncLocalAccount(save) {
  if (mp.active || !G.running || !acct.local) return;
  const me = player();
  if (me) syncAccountFromFaction(acct.local, me);
  if (save) saveLocalAccount();
}

function setAccStatus(text) {
  const el = $("#acc-status");
  if (el) el.textContent = text || "";
}

// jen přepíše počet jader v řádku účtu (bez přestavby boxu — nezavře truhly)
function refreshAccCores() {
  const el = document.querySelector("#acc-box .acc-cores");
  if (el && acct.remote) el.textContent = acct.remote.cores;
}

// rámeček účtu v lobby: přihlášení/registrace, po přihlášení jméno + jádra
// a rozklikávací truhly (jdou otvírat i mezi sezónami rovnou z lobby)
// PŘIHLÁŠENÍ A REGISTRACE JSOU DVĚ OBRAZOVKY (zadání uživatele 30. 8. 2026).
// Dřív to byl jeden řádek se třemi poli a dvěma tlačítky, takže se vracejícího
// hráče ptal na e-mail, který nepotřebuje — a nováček zase netušil, že je
// povinný. Přihlášení chce jméno a heslo, registrace navíc e-mail.
let accRezim = "login";   // "login" | "reg"

function renderAccBox() {
  const box = $("#acc-box");
  if (!box) return;
  const chestsToggle = `<a href="#" class="acc-chests-toggle">💠 ${tx("tru.truhly").toLowerCase()}</a>`;
  if (acct.remote) {
    box.innerHTML = `<div class="acc-row">💠 <b>${acct.remote.name}</b>
        · <span class="acc-cores">${acct.remote.cores}</span> ${tx("ucet.jader")} ${chestsToggle}
        <a href="#" id="acc-logout">${tx("ucet.odhlasit")}</a></div>
      <div id="lobby-chests" class="hidden"></div>
      <p class="hint" id="acc-status"></p>`;
    $("#acc-logout").addEventListener("click", e => {
      e.preventDefault();
      localStorage.removeItem("vp-acc-token");
      netSend({ type: "accLogout" });
      acct.remote = null;
      renderAccBox();
      updatePanels();
    });
  } else {
    const reg = accRezim === "reg";
    box.innerHTML = `<div class="acc-prep">
        <button class="acc-tab${reg ? "" : " on"}" data-rezim="login">${tx("ucet.prihlasit")}</button>
        <button class="acc-tab${reg ? " on" : ""}" data-rezim="reg">${tx("ucet.zalozit")}</button>
      </div>
      <div class="acc-row">
        <input id="acc-name" placeholder="${tx("ucet.jmeno")}" maxlength="20" autocomplete="username">
        <input id="acc-pass" type="password" placeholder="${tx("ucet.heslo")}" maxlength="40"
          autocomplete="${reg ? "new-password" : "current-password"}">
        ${reg ? `<input id="acc-mail" type="email" placeholder="${tx("ucet.email")}" maxlength="120" autocomplete="email">` : ""}
        <button id="btn-acc-go">${reg ? tx("ucet.zalozit") : tx("ucet.prihlasit")}</button></div>
      <p class="hint" id="acc-status">${reg
        ? tx("ucet.email.povinny")
        : `${tx("ucet.k.cemu")}
           <a href="#" id="acc-zapomenute">${tx("ucet.zapomenute")}</a>`}</p>`;
    const go = () => {
      const name = $("#acc-name").value, pass = $("#acc-pass").value;
      if (!name.trim() || !pass) { setAccStatus(tx("ucet.chyba.pole")); return; }
      const email = reg ? $("#acc-mail").value.trim() : "";
      if (reg && !email) { setAccStatus(tx("ucet.chyba.bez.emailu")); return; }
      netSend({ type: reg ? "accRegister" : "accLogin", name, pass, email });
    };
    $("#btn-acc-go").addEventListener("click", go);
    // Enter odesílá z kteréhokoli pole — jinak se v přihlášení musí sahat na myš
    for (const id of ["#acc-name", "#acc-pass", "#acc-mail"]) {
      const el = $(id);
      if (el) el.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
    }
    for (const b of box.querySelectorAll(".acc-tab"))
      b.addEventListener("click", () => { accRezim = b.dataset.rezim; renderAccBox(); });
    const zap = $("#acc-zapomenute");
    if (zap) zap.addEventListener("click", e => {
      e.preventDefault();
      const kdo = $("#acc-name").value.trim();
      if (!kdo) { setAccStatus(tx("ucet.chyba.jmeno")); return; }
      netSend({ type: "zapomenuteHeslo", kdo });
    });
  }
  const tg = box.querySelector(".acc-chests-toggle");
  if (tg) tg.addEventListener("click", e => {
    e.preventDefault();
    const lc = $("#lobby-chests");
    lc.classList.toggle("hidden");
    if (!lc.classList.contains("hidden")) updateChestsPanel(true);
  });
}

// ---------- Startovní obrazovka ----------
// v0.27: napřed volba STRANY (dobro/zlo), pak frakce té strany; startovního
// hrdinu už si hráč nevybírá — dává ho frakce (STARTER_IDX)
let pickSide = null;         // "dobro" | "zlo" | null
let pickFactionIdx = null;   // frakce zvolená v 2. kroku
let pickedHeroes = [];       // ponecháno kvůli MP protokolu (server ignoruje)

function buildStartScreen() { renderStartCards(); }

function renderStartCards() {
  const wrap = $("#faction-cards");
  wrap.innerHTML = "";
  wrap.classList.remove("hidden");
  $("#hero-select").classList.add("hidden");
  const btn = $("#btn-start-game");
  if (pickSide === null) {
    $("#start-intro").innerHTML = tx("start.vyber.strany", { a: SIDES.dobro.name, b: SIDES.zlo.name });
    for (const [sk, s] of Object.entries(SIDES)) {
      const card = document.createElement("div");
      card.className = "faction-card side-card";
      card.style.borderColor = s.color;
      card.innerHTML = `<h3 style="color:${s.color}">${s.icon} ${s.name}</h3>
        <p class="race">${s.desc}</p>
        <p class="bonus">${FACTION_DEFS.filter(d => sideOfFaction(d.key) === sk)
          .map(d => d.name).join(" · ")}</p>`;
      card.addEventListener("click", () => { pickSide = sk; renderStartCards(); });
      wrap.appendChild(card);
    }
    btn.disabled = true;
    btn.textContent = tx("start.tlacitko.strana");
    return;
  }
  const s = SIDES[pickSide];
  $("#start-intro").innerHTML = `<span style="color:${s.color};font-weight:700">${s.icon} ${s.name}</span>
    — ${tx("start.vyber.rodu")}
    <a href="#" id="back-to-sides">‹ ${tx("start.zpet")}</a>`;
  const zpet = $("#back-to-sides");
  if (zpet) zpet.addEventListener("click", e => {
    e.preventDefault();
    pickSide = null; pickFactionIdx = null;
    renderStartCards();
    if (typeof renderMpLobby === "function") renderMpLobby();
  });
  FACTION_DEFS.forEach((def, i) => {
    if (sideOfFaction(def.key) !== pickSide) return;
    const st = STARTER_IDX[def.key] ?? 0;
    const sh = HERO_DEFS[def.key][st];
    const card = document.createElement("div");
    card.className = "faction-card";
    card.dataset.fi = i;
    card.style.borderColor = def.color;
    card.innerHTML = `<h3 style="color:${def.color}">${def.name}</h3>
      <p class="race">${def.race}</p><p class="bonus">${def.desc}</p>
      <p class="starter">⚑ ${tx("start.startovni.hrdina")}: <b>${sh.name}</b>
        <small>(${HERO_TRAITS[sh.trait].name})</small><br>
        <small class="starter-sig">✦ signature: ${
          (SIGNATURE_ITEMS[def.key + ":" + st] || {}).name || ""} ${tx("start.sig.odemyka", { hvezd: SIG_STARS })}</small></p>
      <div class="card-faces">${HERO_DEFS[def.key].map((hd, j) =>
        `<img src="${heroPortraitURL(def.key, j)}" alt="" title="${hd.name}${j === st ? " — " + tx("start.startovni") : ""}">`).join("")}</div>`;
    card.addEventListener("click", () => {
      if (card.classList.contains("taken")) return; // v lobby už ji někdo drží
      pickFactionIdx = i;
      pickedHeroes = [st];
      wrap.querySelectorAll(".faction-card").forEach(c =>
        c.classList.toggle("sel", parseInt(c.dataset.fi, 10) === i));
      btn.disabled = false;
      btn.textContent = "⚔ " + tx("start.vytahnout");
    });
    wrap.appendChild(card);
  });
  btn.disabled = pickFactionIdx === null;
  btn.textContent = pickFactionIdx === null ? tx("start.tlacitko.rod") : "⚔ " + tx("start.vytahnout");
}

function showFactionStep() {
  pickFactionIdx = null;
  pickedHeroes = [];
  renderStartCards();
}

function startGame(factionIndex, heroSel) {
  chestSide = null;                      // truhly zpět „podle mé frakce"
  newGame(factionIndex, undefined, null); // startovního hrdinu dává frakce
  try { G.seasonNumber = parseInt(localStorage.getItem("vp-sezona"), 10) || 1; } catch (e) {}
  // trvalý postup z místního účtu (sklad, úrovně a výbava hrdinů)
  if (acct.local) {
    // startovní hrdina frakce zůstává na účtu natrvalo
    const fk = FACTION_DEFS[factionIndex].key;
    const startKey = fk + ":" + (STARTER_IDX[fk] ?? 0);
    if (!heroUnlockedAcc(startKey)) {
      acct.local.heroUnlocks[startKey] = 1;
      saveLocalAccount();
    }
    resetSezonyUctu(acct.local);   // IV-H: nová sezóna nuluje sílu, sbírka zůstává
    applyAccountToFaction(G.factions[factionIndex], acct.local);
    G.onCores = (fid, n) => {
      if (fid !== G.playerFaction || mp.active) return false;
      acct.local.cores += n;
      saveLocalAccount();
      return true;
    };
    // najímat jde jen hrdiny odemčené na účtu (v0.9)
    G.canHire = (f, d) => f.id !== G.playerFaction || mp.active
      || heroUnlockedAcc(f.key + ":" + d);
    // nasazení ze síně strany (v0.27): gate = odemčení na účtu (rodný klíč)
    G.canDeploy = (f, fkey, d) => f.id !== G.playerFaction || mp.active
      || heroUnlockedAcc(fkey + ":" + d);
    G.onHire = (f, hi) => {
      if (f.id === G.playerFaction && !mp.active) applyAccountToHero(f, hi, acct.local);
    };
  }
  $("#start-overlay").classList.add("hidden");
  $("#end-overlay").classList.add("hidden");
  selectedKey = null;
  tilePanelSig = null;
  closeHeroWindow();
  mapDrawnTick = -2; // vynutit překreslení statické vrstvy mapy
  const cap = capPosOf(G.factions[factionIndex]); // kapitál je pohyblivý (vykořenění)
  const p = tileToPixel(cap.q, cap.r);
  camera.x = p.x; camera.y = p.y; camera.zoom = 1;
  if (tickTimer) clearInterval(tickTimer);
  G.lastTickAt = performance.now();
  tickTimer = setInterval(() => {
    doTick();
    G.lastTickAt = performance.now(); // pro plynulou animaci pochodů mezi tiky
    syncLocalAccount(G.tick % 15 === 0); // postup na místní účet, obden ulož
    updatePanels();
    if (G.gameOver) showEndScreen();
  }, TICK_MS);
  updatePanels();
}

function showEndScreen() {
  syncLocalAccount(true); // konec sezóny: postup a kořist zůstávají na účtu
  clearInterval(tickTimer); tickTimer = null;
  hideTileMenu();
  const ranking = G.factions
    .map(f => ({ f, score: f.alive ? scoreOf(f) : 0 }))
    .sort((a, b) => b.score - a.score);
  const rows = ranking.map((x, i) =>
    `<tr class="${x.f.id === G.playerFaction ? 'me' : ''}">
       <td>${i + 1}.</td><td style="color:${x.f.color}">${x.f.name}${x.f.alive ? "" : " ☠"}</td>
       <td>${x.score}</td></tr>`).join("");
  const vitez = G.winnerId >= 0 ? G.factions[G.winnerId] : ranking[0].f;
  $("#end-title").textContent = vitez.id === G.playerFaction
    ? tx("konec.vitezstvi", { n: G.seasonNumber || 1 })
    : tx("konec.vitezi", { n: G.seasonNumber || 1, rod: vitez.name });
  $("#end-table").innerHTML = `<tr><th></th><th>${tx("konec.rod")}</th><th>${tx("spol.skore")}</th></tr>${rows}`;
  if (!mp.connected) {   // sólo: posunout počítadlo sezón pro příště
    try { localStorage.setItem("vp-sezona", String((G.seasonNumber || 1) + 1)); } catch (e) {}
  }
  $("#end-overlay").classList.remove("hidden");
}

// ---------- Boční lišta s okny ----------
// každá agenda má vlastní okno (jako v RtW): lišta ikon vpravo, jedno okno
// otevřené naráz; obsahové divy (#heroes-panel, #scores…) žijí v DOM trvale,
// takže updatery fungují beze změny — okno jen přepíná viditelnost sekcí
// ETAPA 12b: titulky se čtou ze slovníku AŽ PŘI VYKRESLENÍ. Kdyby to byla
// konstanta složená při načtení, zůstal by v ní jazyk, který byl nastavený
// v tu chvíli, a přepnutí by se neprojevilo.
function oknoTitulek(key) { return tx("okno." + key); }
// Rasa rodu se čte z KATALOGU (FACTION_DEFS), ne z frakce ve hře: kopie
// v `G.factions` vznikla při startu sezóny a přepnutí jazyka do ní nesáhne.
function rasaRodu(key) { const d = FACTION_DEFS.find(x => x.key === key); return d ? d.race : ""; }
// ETAPA 12b: přepnutí jazyka musí ZAHODIT VŠECHNY PODPISY PANELŮ. Panely se
// překreslují jen při změně dat (klan, chat, burza, město, truhly…), a jazyk
// mezi jejich data nepatří — bez tohohle by po přepnutí zůstaly česky, dokud
// se v nich něco nepohne. Registruje se u slovníku, takže to platí i pro
// přepnutí z domovské síně.
function zapomenPodpisy() {
  tilePanelSig = citySig = chestsSig = chatSig = burzaSig = klanSig = null;
  heroWinSig = landPanelSig = lastLogHtml = null;
  if (typeof updatePanels === "function") updatePanels();
}
if (typeof naPrepnuti === "function") naPrepnuti(zapomenPodpisy);

// STATICKÉ TEXTY Z index.html (v0.70).
//
// V HTML se `tx()` zavolat nedá, takže popisky lišty, tooltipy ikon
// i obrazovka „hrát s přáteli" zůstávaly česky ve všech jazycích — a měřič
// pokrytí to neodhalil, protože index.html vůbec nečetl.
// Prvky proto nesou atributy:
//   data-tx        → textContent    (nadpis, popisek tlačítka)
//   data-tx-title  → title          (tooltip)
//   data-tx-ph     → placeholder    (prázdné políčko)
// Česky psaný obsah v HTML zůstává jako PŘEDLOHA — když klíč ve slovníku není,
// `tx` vrátí ⟨klic⟩, takže se chybějící překlad pozná na první pohled.
function prelozStatickeHtml() {
  document.querySelectorAll("[data-tx]").forEach(el => { el.textContent = tx(el.dataset.tx); });
  document.querySelectorAll("[data-tx-title]").forEach(el => { el.title = tx(el.dataset.txTitle); });
  document.querySelectorAll("[data-tx-ph]").forEach(el => { el.placeholder = tx(el.dataset.txPh); });
}
if (typeof naPrepnuti === "function") naPrepnuti(prelozStatickeHtml);
// Výběr strany a rodu se skládá jednou při načtení, takže by po přepnutí
// jazyka zůstal v původním — jména rodů se od v0.70 překládají a musí se
// přerovnat i tady.
// ⚠ Překresluje se i když je výběr SCHOVANÝ. Skládá se totiž jednou při
// načtení stránky a odkrytí ho nepřestaví — kdo přepnul jazyk na úvodní
// obrazovce a teprve pak šel „hrát s přáteli", viděl karty v původním jazyce.
if (typeof naPrepnuti === "function") naPrepnuti(() => {
  if (typeof renderStartCards === "function" && $("#faction-cards")) renderStartCards();
});
document.addEventListener("DOMContentLoaded", prelozStatickeHtml);
if (document.readyState !== "loading") prelozStatickeHtml();
// složená okna (v0.27): jedna ikona lišty, uvnitř záložky
// složená okna: druhá položka je KLÍČ do slovníku, ne hotový popisek
const COMPOSITE_WINS = {
  branch: [["goals", "okno.goals"], ["realm", "okno.realm"], ["klan", "okno.klan"], ["burza", "okno.burza"]],
  mail: [["log", "okno.log"], ["chat", "okno.chat"], ["reports", "okno.reports"]],
};
let compTab = { branch: "goals", mail: "log" };
let activeWin = null;
let citySig = null;      // podpis oken města (budovy/výcvik/vylepšení)
let logSeen = 0;         // počet záznamů Kroniky při posledním otevření okna

function openSideWin(key) {
  // město z lišty zmizelo (v0.27) — jeho okna se otvírají z panelu města,
  // ale klávesové/programové cesty zůstávají platné
  activeWin = key;
  $("#side-win").classList.remove("hidden");
  $("#side-win-title").textContent = oknoTitulek(key);
  const comp = COMPOSITE_WINS[key];
  const tabs = $("#win-tabs");
  let sec = key;
  if (comp && tabs) {
    sec = compTab[key];
    tabs.classList.remove("hidden");
    tabs.innerHTML = comp.map(([k, klic]) =>
      `<span class="win-tab${sec === k ? " active" : ""}" data-tab="${k}">${tx(klic)}${
        k === "reports" && unreadReportCount() > 0 ? `<span class="tab-badge">●</span>` : ""}</span>`).join("");
    tabs.querySelectorAll(".win-tab").forEach(t => t.addEventListener("click", () => {
      if (t.dataset.tab === "reports") { closeSideWin(); openReportsWindow(); return; }
      compTab[key] = t.dataset.tab;
      openSideWin(key);
    }));
  } else if (tabs) tabs.classList.add("hidden");
  document.querySelectorAll("#side-win .win-sec").forEach(s =>
    s.classList.toggle("hidden", s.dataset.sec !== sec));
  sirokeOkno(sec);
  document.querySelectorAll(".rail-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.win === key));
  if (sec === "log") logSeen = logEntries().length;
  if (key === "chests") updateChestsPanel(true);
  citySig = null;
  updatePanels();
}

// ---------- Okno truhel (v0.6) ----------
let chestsSig = null;

// šance na jeden slot truhly: rarity výbavy + podíl posilovacích doplňků
// (váhy jsou přímo procenta — dohromady se zbytkem do 100 na doplňky)
// šance JEDNOHO slotu truhly (dohromady 100 %): výbava dle rarity, dárek
// hrdiny ze stejné tabulky rarit (jen přemapované na tři tiery) a doplněk
function chestWeightsStr(def) {
  const wsum = def.weights.reduce((a, b) => a + b, 0);
  const pct = w => Math.round(w * 10) / 10;
  const parts = def.weights.map((w, i) => w > 0
    ? `<span class="chc" style="color:${RARITIES[i].color}" title="${tx("st.vybava")} — ${RARITIES[i].name}">${pct(w * (1 - GIFT_SHARE))} %</span>`
    : "").filter(Boolean);
  const giftW = [0, 0, 0];
  def.weights.forEach((w, i) => { giftW[GIFT_RARITY_TIER[i]] += w * GIFT_SHARE; });
  giftW.forEach((w, t) => { if (w > 0) parts.push(
    `<span class="chc" style="color:${HERO_TIERS[t].color}" title="${tx("tru.sance.darek", { tier: HERO_TIERS[t].name })}">🎁 ${pct(w)} %</span>`); });
  parts.push(`<span class="chc" style="color:#7ec8e3" title="${tx("tru.sance.doplnek")}">🏗 ${pct(100 - wsum)} %</span>`);
  return parts.join(" ");
}

// Aktivní strana truhel (dobro/zlo) — přepínač v okně truhel.
// `null` = hráč nepřepnul ručně, takže se řídí frakcí, za kterou hraje.
// Bez toho měl každý natvrdo předvolené dobro a hráč zla si otevíral truhly
// dobra: fasoval výbavu, kterou jeho hrdinové nesmí nosit (equipItem ji
// odmítá), a dárky hrdinů, které v téhle sezóně nemůže nasadit.
let chestSide = null;
function stranaTruhel() {
  if (chestSide) return chestSide;
  const me = (typeof G !== "undefined" && G.running) ? player() : null;
  return me && me.key ? sideOfFaction(me.key) : "dobro";
}

// panel truhel se kreslí do okna lišty (#chests-panel) i do lobby
// (#lobby-chests) — vnitřní prvky proto nesou třídy, ne id
// ---------- globální Sklad (v0.39, záložka okna 💠) ----------
// Za běžící hry ukazuje frakční zásobu, v lobby kusy na účtu (sólo místní
// účet; v MP je posílá server v profilu — invItems). Jen prohlížení
// s filtry a detailem; nasazování zůstává ve Výbavě hrdiny (🎒).
function skladZdroj() {
  const inGame = acct.mode === "remote" ? mp.active : G.running;
  if (inGame && typeof player === "function" && player())
    return { items: player().items, pozn: tx("skl.zdroj.hra") };
  if (acct.mode === "local" && acct.local)
    return { items: acct.local.inventory || [], pozn: tx("skl.zdroj.ucet") };
  if (acct.remote && acct.remote.invItems)
    return { items: acct.remote.invItems, pozn: tx("skl.zdroj.ucet") };
  return null;
}

function skladHtml() {
  const z = skladZdroj();
  if (!z) return `<p class="hint">${tx("skl.bez.uctu")}</p>`;
  const slotChips = ITEM_SLOT_KEYS.map(s => `<button class="inv-slotchip${skladFiltr.slot === s ? " on" : ""}"
      data-sklslot="${s}" title="${ITEM_SLOTS[s].name}">${ITEM_SLOTS[s].icon}</button>`).join("");
  const items = invFiltruj(z.items, skladFiltr)
    .sort((a, b) => b.rarity - a.rarity || itemValueOf(b) - itemValueOf(a));
  const grid = items.length
    ? `<div class="inv-grid-v2">${items.map((it, i) => invTileHtml(it, i, skladSel === i, false)).join("")}</div>`
    : `<p class="hint">${tx(z.items.length ? "skl.filtr.prazdno" : "skl.prazdno")}</p>`;
  const sel = items[skladSel];
  const detail = sel
    ? `<div class="cmp-row">${itemCompareCardHtml(sel, tx("skl.vybrany"), null)}</div>
       <p class="hint">${tx("skl.kde.nasadit")}</p>`
    : `<p class="hint">${tx("skl.klikni")}</p>`;
  return `<div class="sklad-obsah">
    ${darkyGridHtml()}
    <h4>${tx("skl.nazev")} (${items.length}/${z.items.length}) <small class="hint">· ${z.pozn}</small></h4>
    <div class="inv-chips">${slotChips}</div>
    ${invChipsHtml(skladFiltr, z.items, "sklad")}
    ${grid}
    ${detail}
  </div>`;
}

function updateChestsPanel(force) {
  // #dom-chests je Výbava v domovské síni (etapa 5b) — tentýž panel truhel
  // a skladu, jen mimo běžící hru
  const targets = [$("#chests-panel"), $("#lobby-chests"), $("#dom-chests")]
    .filter(el => el && !el.classList.contains("hidden"));
  if (!targets.length) return;
  if (activeWin !== "chests" && !force && !$("#lobby-chests") && !$("#dom-chests")) return;
  const cores = acctCores();
  const inGame = acct.mode === "remote" ? mp.active : G.running;
  const boostInv = acctBoosts();
  const boostSig = Object.entries(boostInv).filter(([, n]) => n > 0)
    .map(([k, n]) => k + n).join(",");
  const pity = acctPity();
  const free = acctFreeChest();
  const pInv = acctPityInvite();
  const strana = stranaTruhel();
  // podpis skladu (v0.39): záložka, filtry, výběr a otisk zdroje kusů
  const zdrojSkladu = skladZdroj();
  const skladOtisk = zdrojSkladu
    ? zdrojSkladu.items.length + ":" + zdrojSkladu.items.reduce((a, it) =>
        a + it.rarity + (it.stars | 0) + (it.refine | 0), 0)
    : "x";
  const sig = [acct.mode, cores, acct.remote && acct.remote.name, strana,
    boostSig, pity, free ? 1 : 0, pInv, inGame ? 1 : 0,
    chestTab, JSON.stringify(skladFiltr), skladSel, skladOtisk,
    JSON.stringify(acctDarky()), darekSel].join("|");   // sklad dárků (v0.43/44)
  if (!force && sig === chestsSig) return;
  chestsSig = sig;
  const noAcc = acct.mode === "remote" && !acct.remote;
  let html = `<p class="chest-balance">${CORE_ICON} <b>${cores != null ? cores : "—"}</b>
      ${tx("tru.jadra")} <small>· ${acctLabel()}</small></p>
    <div class="win-tabs-inline chest-tabs">
      <button class="${chestTab === "truhly" ? "active" : ""}" data-ctab="truhly">💠 ${tx("tru.truhly")}</button>
      <button class="${chestTab === "sklad" ? "active" : ""}" data-ctab="sklad">🎒 ${tx("skl.nazev")}</button>
    </div>`;
  if (chestTab === "sklad") {
    html += skladHtml();
  } else if (noAcc) {
    html += `<p class="hint">${tx("tru.bez.uctu")}</p>`;
  } else {
    // přepínač strany: truhly dobra a zla sypou výbavu a dárky jen své strany
    html += `<div class="chest-sides">` + Object.entries(SIDES).map(([sk, s]) => `
      <button class="chest-side-btn${strana === sk ? " active" : ""}" data-side="${sk}"
        style="--side-color:${s.color}" title="${s.desc}">${s.icon} ${s.name}</button>`).join("") + `</div>`;
    // hraješ-li za druhou stranu, kusy odsud si na své hrdiny nenasadíš
    const meStrana = (typeof G !== "undefined" && G.running && player() && player().key)
      ? sideOfFaction(player().key) : null;
    if (meStrana && meStrana !== strana) {
      html += `<p class="chest-warn">⚠ ${tx("tru.cizi.strana", { moje: SIDES[meStrana].gen, cizi: SIDES[strana].gen })}</p>`;
    }
    html += Object.entries(CHESTS).map(([tier, d]) => `
      <div class="chest-card side-${strana}" style="border-color:${d.color}55">
        <div class="chest-ico" style="text-shadow:0 0 12px ${d.color}">${d.icon}</div>
        <div class="chest-info">
          <b style="color:${d.color}">${SIDES[strana].icon} ${d.sideName[strana]}</b>
          <small>${d.desc} ${tx("tru.sype", { n: CHEST_ITEMS, ikona: SIDES[strana].icon, strana: SIDES[strana].gen })}</small>
          <small class="chest-odds">${chestWeightsStr(d)}</small>
          <div class="pity-invite" title="${tx("tru.list.tip", { n: INVITE_PITY_AT })}">📜 ${tx("tru.list", { n: Math.max(1, INVITE_PITY_AT - pInv) })}</div>
          <div class="pity-bar" title="${tx("tru.smula.tip", { n: PITY_AT })}">
            <div class="pity-fill" style="width:${Math.min(100, 100 * pity / PITY_AT)}%"></div>
            <span class="pity-txt">${pity >= PITY_AT - 1
              ? tx("tru.legenda.hned")
              : tx("tru.legenda.za", { n: PITY_AT - pity })}</span>
          </div>
        </div>
        <div class="chest-btns">
          <button class="btn-chest" data-tier="${tier}" ${free || (cores != null && cores >= d.cost) ? "" : "disabled"}>
            ${free ? `${tx("tru.otevrit")}<br><span class="free-tag">${tx("tru.dnes.zdarma")}</span>`
                   : `${tx("tru.otevrit")}<br>${d.cost} ${CORE_ICON}`}</button>
          <button class="btn-chest bulk" data-tier="${tier}" data-count="${CHEST_BULK}"
            title="${tx("tru.davka.tip", { n: CHEST_BULK, cena: chestBulkCost(tier), ikona: CORE_ICON, misto: d.cost * CHEST_BULK })}"
            ${cores != null && cores >= chestBulkCost(tier) ? "" : "disabled"}>
            ${tx("tru.otevrit")} ${CHEST_BULK}×<br>${chestBulkCost(tier)} ${CORE_ICON}
            <span class="bulk-save">−${d.cost * CHEST_BULK - chestBulkCost(tier)}</span></button>
        </div>
      </div>`).join("");
    // posilovací doplňky ze zásoby účtu — použití jen za běžící hry
    const boostRows = [];
    for (const kind in BOOST_KINDS) {
      for (let t = 0; t < 3; t++) {
        const n = boostInv[kind + "_" + t] || 0;
        if (n <= 0) continue;
        const bd = BOOST_KINDS[kind];
        const tierD = HERO_TIERS[t];
        boostRows.push(`<div class="boost-row">
          <span class="boost-name" style="color:${tierD.color}">${bd.icon} ${bd.name}
            <small>(${tierD.name.toLowerCase()}, ${BOOST_MINUTES[t]} min)</small></span>
          <span class="boost-count">×${n}</span>
          <button class="btn-boost" data-kind="${kind}" data-tier="${t}" ${inGame ? "" : "disabled"}
            title="${bd.desc} — ${BOOST_MINUTES[t]} min">${tx("spol.pouzit")}</button>
        </div>`);
      }
    }
    if (boostRows.length) {
      const me = inGame && !mp.active ? player() : (mp.active ? G.factions[G.playerFaction] : null);
      const act = me && me.boosts
        ? [me.boosts.build > 0 ? `🏗 ${fmtTime(me.boosts.build)}` : "",
           me.boosts.prod > 0 ? `🎺 ${fmtTime(me.boosts.prod)}` : ""].filter(Boolean).join(" · ")
        : "";
      html += `<h4 class="boost-head">${tx("tru.doplnky")}${act ? ` <small class="boost-active">${tx("tru.aktivni")}: ${act}</small>` : ""}</h4>
        ${boostRows.join("")}
        ${inGame ? "" : `<p class="hint">${tx("tru.doplnky.hint")}</p>`}`;
    }
    html += `<div class="chest-reveal"></div>
      <div class="chest-code">
        <input class="code-input" placeholder="${tx("tru.promo")}" maxlength="20">
        <button class="btn-code">${tx("tru.uplatnit")}</button>
      </div>
      <p class="hint chest-status"></p>
      <p class="hint">${CORE_ICON} ${tx("tru.odkud.jadra")}</p>
      <p class="hint">${tx("tru.o.darcich")}</p>`;
  }
  for (const el of targets) {
    el.innerHTML = html;
    // záložky 💠/🎒 + filtry a dlaždice Skladu (v0.39)
    el.querySelectorAll("[data-ctab]").forEach(btn =>
      btn.addEventListener("click", () => { chestTab = btn.dataset.ctab; skladSel = -1; updateChestsPanel(true); }));
    el.querySelectorAll('.inv-rar[data-filtr="sklad"]').forEach(btn =>
      btn.addEventListener("click", () => {
        const r = parseInt(btn.dataset.rar, 10);
        skladFiltr.rar = skladFiltr.rar.includes(r)
          ? skladFiltr.rar.filter(x => x !== r) : [...skladFiltr.rar, r];
        skladSel = -1; updateChestsPanel(true);
      }));
    const sSet = el.querySelector('.inv-set[data-filtr="sklad"]');
    if (sSet) sSet.addEventListener("change", () => {
      skladFiltr.set = sSet.value; skladSel = -1; updateChestsPanel(true); });
    const sZrus = el.querySelector('.inv-zrus[data-filtr="sklad"]');
    if (sZrus) sZrus.addEventListener("click", () => {
      skladFiltr = { rar: [], set: "", slot: skladFiltr.slot }; skladSel = -1; updateChestsPanel(true); });
    el.querySelectorAll("[data-sklslot]").forEach(btn =>
      btn.addEventListener("click", () => {
        skladFiltr.slot = skladFiltr.slot === btn.dataset.sklslot ? "" : btn.dataset.sklslot;
        skladSel = -1; updateChestsPanel(true);
      }));
    el.querySelectorAll(".sklad-obsah .inv-tile[data-item]").forEach(t =>
      t.addEventListener("click", () => {
        const i = parseInt(t.dataset.item, 10);
        skladSel = skladSel === i ? -1 : i;
        updateChestsPanel(true);
      }));
    bindDarky(el);
    el.querySelectorAll(".chest-side-btn").forEach(btn =>
      btn.addEventListener("click", () => { chestSide = btn.dataset.side; updateChestsPanel(true); }));
    el.querySelectorAll(".btn-chest").forEach(btn =>
      btn.addEventListener("click", () =>
        openChestAction(btn.dataset.tier, parseInt(btn.dataset.count, 10) || 1)));
    el.querySelectorAll(".btn-boost").forEach(btn =>
      btn.addEventListener("click", () => useBoostAction(btn.dataset.kind, parseInt(btn.dataset.tier, 10))));
    const bc = el.querySelector(".btn-code");
    if (bc) bc.addEventListener("click", () => {
      const code = el.querySelector(".code-input").value;
      if (!code.trim()) return;
      if (acct.mode === "remote") netSend({ type: "redeemCode", code });
      else {
        const gain = accountRedeemCode(acct.local, code);
        setChestStatus(gain != null ? tx("tru.kod.ok", { n: gain, ikona: CORE_ICON })
          : tx("tru.kod.spatny"));
        if (gain != null) { saveLocalAccount(); updateChestsPanel(true); }
      }
    });
  }
}

// použití posilovacího doplňku (jen za běžící hry)
function useBoostAction(kind, tier) {
  if (acct.mode === "remote") { netSend({ type: "useBoost", kind, tier }); return; }
  if (!G.running || !player()) { setChestStatus(tx("tru.doplnek.jen.hra")); return; }
  if (!accountUseBoost(acct.local, kind, tier, player())) {
    setChestStatus(tx("tru.doplnek.nemas"));
    return;
  }
  saveLocalAccount();
  updateChestsPanel(true);
  updatePanels();
}

function setChestStatus(text) {
  const els = document.querySelectorAll(".chest-status");
  if (els.length) els.forEach(e => { e.textContent = text; });
  else if (text) setAccStatus(text);
}

function openChestAction(tier, count) {
  const strana = stranaTruhel();
  const pocet = count > 1 ? Math.min(CHEST_BULK, count) : 1;
  if (acct.mode === "remote") {
    netSend({ type: "openChest", tier, side: strana, count: pocet });
    return;
  }
  const live = G.running && !mp.active ? player() : null;
  const res = pocet > 1
    ? accountOpenChests(acct.local, tier, strana, live, pocet)
    : accountOpenChest(acct.local, tier, strana, live);
  if (!res) { setChestStatus(tx("tru.malo.jader")); return; }
  // za běžící sólo hry rovnou do frakční zásoby (sync účtu to srovná)
  if (live) {
    for (const item of res.items) grantItemToFaction(live, item);
    syncAccountFromFaction(acct.local, live);
  }
  saveLocalAccount();
  showChestReveal(tier, res);
  updatePanels();
}

// ---------- Dárky jako předměty ve skupinách (v0.43, skupiny v0.44) ----------
// Dárek z truhly se neaplikuje sám — leží ve skladu na účtu a hráč ho použije,
// kdy chce. Od v0.44 nepatří jednomu hrdinovi, ale SKUPINĚ rod × tier: „epický
// dar Popelné hordy" nakrmí kteréhokoli epického hrdinu hordy. Mrtvý drop tím
// zmizel úplně a sbírka je likvidní (24 druhů místo 48).
let darekSel = null;        // rozkliknutá skupina ve Skladu

function acctDarky() {
  const a = acctMeta();
  return (a && a.darky) || {};
}
// počet kusů ve skladu — bere klíč SKUPINY i klíč hrdiny
function darkuMam(key) {
  if (!key) return 0;
  return acctDarky()[jeSkupinaDarku(key) ? key : giftGroupOfHero(key)] | 0;
}

// hláška po použití — sdílí ji sólo i síťová větev (net.js po giftUsed)
function darkyStatusText(v) {
  if (!v) return "";
  const jm = v.name || "hrdina";
  if (v.type === "cores") return tx("dar.stav.jadra", { hrdina: jm, max: HERO_MAX_STARS, n: v.cores, ikona: CORE_ICON });
  if (v.type === "unlock") return tx("dar.stav.odemcen", { hrdina: jm, hvezd: v.star });
  if (v.type === "star") return tx("dar.stav.povysen", { hrdina: jm, hvezd: v.star, body: v.hvezd || 1 });
  return `🎁 ${jm}: ` + tx(v.locked ? "odh.oddanost.odemk" : "odh.oddanost", { ted: v.respect, need: v.need });
}

// jediná cesta k použití — cílem je vždy KONKRÉTNÍ hrdina, dárky se berou
// z jeho skupiny. V MP se jen odešle příkaz, server je autorita.
function pouzitDarky(heroKey, pocet) {
  if (!heroKey || jeSkupinaDarku(heroKey) || !darkuMam(heroKey)) return;
  if (mp.active) { mpUseGift(heroKey, pocet | 0); return; }
  const me = (typeof G !== "undefined" && G.running) ? player() : null;
  const v = useGifts(acct.local, heroKey, pocet | 0, me);
  if (!v) return;
  saveLocalAccount();
  oslavyZVysledku(v);
  updateChestsPanel(true);          // POZOR: přestaví panel, takže hláška až PO něm
  setChestStatus(darkyStatusText(v));
  updateHeroesPanel();
  // POZOR: heroWindowSig je FUNKCE, podpis drží proměnná heroWinSig
  heroWinSig = null;
  renderHeroWindow();
  updatePanels();
}

// řádek „mám dárky" pod pruhem oddanosti v okně hrdiny
function darkyRowHtml(heroKey) {
  const mam = darkuMam(heroKey);
  const skup = giftGroupOfHero(heroKey);
  const d = giftNameOf(skup);
  const { fkey, tier } = rozborSkupiny(skup);
  const rod = (FACTION_DEFS.find(x => x.key === fkey) || {}).name || fkey;
  if (!mam) {
    return `<div class="darky-row prazdny"><span class="darky-mam">${d.icon} ${d.name}
      <small class="dim">— ${tx("dar.popis", { tier: GIFT_TIER_NAME[tier].toLowerCase(), rod })}; ${tx("dar.zadny")}</small></span></div>`;
  }
  return `<div class="darky-row" data-hero="${heroKey}"
      title="${tx("dar.tip", { jmeno: d.name, tier: GIFT_TIER_NAME[tier].toLowerCase(), rod, kolik: giftRespectFor(tier) })}">
    <span class="darky-mam">${d.icon} ${tx("dar.ve.skladu")} <b>${mam}</b> ${
      tx("dar.darku")}</span>
    <button class="btn-darek-1">${tx("dar.pouzit1")}</button>
    <button class="btn-darek-vse">${tx("dar.pouzit.vse", { n: mam })}</button>
  </div>`;
}

// mřížka skupin ve Skladu; klik na dlaždici rozbalí hrdiny, kterým se dá dát
function darkyGridHtml() {
  const darky = acctDarky();
  const klice = Object.keys(darky).filter(k => darky[k] > 0 && jeSkupinaDarku(k))
    .sort((a, b) => rozborSkupiny(b).tier - rozborSkupiny(a).tier
      || darky[b] - darky[a] || a.localeCompare(b));
  if (!klice.length) return "";
  const celkem = klice.reduce((n, k) => n + darky[k], 0);
  const dlazdice = klice.map(k => {
    const { fkey, tier } = rozborSkupiny(k);
    const d = giftNameOf(k);
    const t = HERO_TIERS[tier];
    const rod = (FACTION_DEFS.find(x => x.key === fkey) || {}).name || fkey;
    return `<div class="darek-tile${darekSel === k ? " on" : ""}" data-skup="${k}"
        style="--tc:${t.color}" title="${d.name} — ${tx("dar.popis", { tier: GIFT_TIER_NAME[tier].toLowerCase(), rod })}">
      <span class="darek-ikona">${d.icon}</span>
      <span class="darek-pocet">${darky[k]}</span>
      <span class="darek-jmeno">${d.name}</span>
      <small class="darek-rod" style="color:${t.color}">${rod}</small>
    </div>`;
  }).join("");
  return `<div class="sklad-sekce">
      <h4>🎁 ${tx("dar.nadpis")} <span class="dim">${celkem} ${tx("spol.ks")} · ${tx("dar.druhu", { n: klice.length })}</span></h4>
      <p class="hint">${tx("dar.skupina.hint")}</p>
      <div class="darky-grid">${dlazdice}</div>
      ${darekSel && darky[darekSel] > 0 ? darekCileHtml(darekSel) : ""}
    </div>`;
}

// seznam hrdinů vybrané skupiny s tlačítky (odemčení / postup je vidět hned)
function darekCileHtml(skup) {
  const mam = acctDarky()[skup] | 0;
  const { tier } = rozborSkupiny(skup);
  const rady = hrdinoveSkupiny(skup).map(h => {
    const hvezd = acctStars(h.key);
    const odemcen = heroUnlockedAcc(h.key);
    const need = respectForStar(hvezd + 1, tier);
    const resp = acctRespect(h.key);
    const max = hvezd >= HERO_MAX_STARS;
    return `<div class="darek-cil" data-hero="${h.key}">
      <img src="${heroPortraitURL(h.fkey, h.idx)}" alt="">
      <span class="dc-jmeno">${h.hd.name}
        <small class="dim">${odemcen ? `★ ${hvezd}` : "🔒 " + tx("dar.zamceny")}${
          max ? " · " + tx("sin.maximum") : ` · ${resp}/${need}`}</small></span>
      <button class="btn-darek-1">1</button>
      <button class="btn-darek-vse">${tx("dar.vse", { n: mam })}</button>
    </div>`;
  }).join("");
  return `<div class="darek-cile"><b>${tx("dar.komu")}</b>${rady}</div>`;
}

// společné navěšení tlačítek (okno hrdiny i Sklad používají stejné třídy)
function bindDarky(root) {
  if (!root) return;
  root.querySelectorAll(".darek-tile[data-skup]").forEach(t =>
    t.addEventListener("click", () => {
      darekSel = darekSel === t.dataset.skup ? null : t.dataset.skup;
      updateChestsPanel(true);
    }));
  root.querySelectorAll(".btn-darek-1").forEach(b => b.addEventListener("click", e => {
    e.stopPropagation();
    const el = b.closest("[data-hero]");
    if (el) pouzitDarky(el.dataset.hero, 1);
  }));
  root.querySelectorAll(".btn-darek-vse").forEach(b => b.addEventListener("click", e => {
    e.stopPropagation();
    const el = b.closest("[data-hero]");
    if (el) pouzitDarky(el.dataset.hero, darkuMam(el.dataset.hero));
  }));
}

// karta dárku hrdiny do odhalení truhly (oddanost / hvězda / odemčení / 💠)
function giftRevealHtml(gift, delay) {
  if (!gift) return "";
  const tier = HERO_TIERS[gift.tier != null ? gift.tier
    : heroTierOf(gift.key.split(":")[0], parseInt(gift.key.split(":")[1], 10))];
  let txt, big = false;
  if (gift.type === "giftItem") txt = tx("odh.do.skladu", { n: gift.mam });
  else if (gift.type === "cores") txt = tx("odh.na.jadra", { n: gift.cores, ikona: CORE_ICON });
  else if (gift.type === "unlock") { txt = tx("odh.odemcen", { hvezd: gift.star }); big = true; }
  else if (gift.type === "star") { txt = tx("odh.povysen", { hvezd: gift.star }) + (gift.sig ? " · " + tx("odh.sig") : ""); big = true; }
  else txt = tx(gift.locked ? "odh.oddanost.odemk" : "odh.oddanost", { ted: gift.respect, need: gift.need });
  return `<div class="reveal-card small gift${big ? " gift-big" : ""}"
      style="border-color:${tier.color};box-shadow:0 0 16px ${tier.color}66;animation-delay:${delay}s">
    <b class="reveal-name" style="color:${tier.color}">${gift.darek ? gift.darek.icon + " " + gift.darek.name : "🎁 " + tx("odh.darek")} → ${gift.name}</b>
    <small>${tx("odh.tier.hrdina", { tier: tier.name })}</small>
    <small>${txt}</small>
  </div>`;
}

// odhalení kořisti z truhly — výbava dle rarity, doplňky, dárky hrdinů
function showChestReveal(tier, res) {
  if (Array.isArray(res)) res = { items: res, boosts: [], gifts: [] }; // starší tvar
  const items = res.items || [], boosts = res.boosts || [];
  const gifts = res.gifts || (res.gift ? [res.gift] : []); // res.gift = starší server
  updateChestsPanel(true);
  const boxes = document.querySelectorAll(".chest-reveal");
  const d = CHESTS[tier];
  const inGame = acct.mode === "remote" ? mp.active : G.running;
  let delay = 0;
  const cards = items.map(item => {
    const r = RARITIES[item.rarity];
    return `<div class="reveal-card small" style="border-color:${r.color};box-shadow:0 0 14px ${r.color}55;animation-delay:${(delay += 0.12) - 0.12}s">
      <img class="rv-art" src="${itemArtURL(item)}" alt="">
      <b class="reveal-name" style="color:${r.color}">${sideIcon(item)}${item.name}</b>
      <small>${r.name}</small>
      <small>[${tx("spol.hrdina")}] ${itemEffectStr(item)}</small>
      ${item.set ? `<small style="color:${ITEM_SETS[item.set].color}">◆ ${ITEM_SETS[item.set].name}</small>` : ""}
      ${sigTagHtml(item)}
    </div>`;
  }).join("") + boosts.map(b => {
    const bd = BOOST_KINDS[b.boost];
    const tierD = HERO_TIERS[b.tier];
    return `<div class="reveal-card small boost" style="border-color:${tierD.color};box-shadow:0 0 12px ${tierD.color}44;animation-delay:${(delay += 0.12) - 0.12}s">
      <b class="reveal-name" style="color:${tierD.color}">${bd.icon} ${bd.name}</b>
      <small>${tx("odh.tier.doplnek", { tier: tierD.name })}</small>
      <small>${bd.desc} — ${BOOST_MINUTES[b.tier]} min</small>
    </div>`;
  }).join("") + gifts.map(g => giftRevealHtml(g, (delay += 0.12) - 0.12)).join("")
    // dávka může vydat víc zvacích listů naráz (starší tvar = jeden `invite`)
    + (res.invites || (res.invite ? [res.invite] : []))
        .map(inv => inviteRevealHtml(inv, (delay += 0.12) - 0.12)).join("");
  // panel truhel nemusí být otevřený (zavřené okno, jiná obrazovka) — karty se
  // pak nevykreslí, ale OSLAVA odemčení musí proběhnout tak jako tak, jinak
  // hráči nový hrdina propadne bez jediné zprávy
  const davka = (res.pocet || 1) > 1;
  for (const box of boxes) box.innerHTML = `
    <div class="reveal-head"><span class="reveal-burst">${d ? d.icon : "🧰"} ✨${
      davka ? ` <span class="bulk-tag">${tx("odh.davka", { n: res.pocet, cena: res.cena, ikona: CORE_ICON })}</span>` : ""}${
      res.zdarma ? ` <span class="free-tag">${tx("odh.prvni.zdarma")}</span>` : ""}</span>
      <small class="hint">${tx(inGame ? "odh.kam.hra" : "odh.kam.ucet")}</small></div>
    <div class="reveal-grid${davka ? " bulk" : ""}">${cards}</div>`;
  if (boxes.length) sfx.play("loot");
  // oslavy (v0.36/36.1): noví hrdinové (zvací list i dárkové odemčení)
  // a R10 signature kusy; okno vyskočí, až karty odhalení doletí
  // (duplicitní list nic neslaví); hrdinové mají přednost před kusy
  const odemceni = [];
  for (const inv of (res.invites || (res.invite ? [res.invite] : [])))
    if (inv && inv.type === "invite") odemceni.push({ typ: "hrdina", key: inv.key });
  for (const g of gifts) if (g && g.type === "unlock") odemceni.push({ typ: "hrdina", key: g.key });
  for (const g of gifts) if (g && g.sig) odemceni.push({ typ: "sig", key: g.key });
  if (odemceni.length) {
    oslavaFronta.push(...odemceni.slice(1));
    setTimeout(() => spustOslavu(odemceni[0]), 800);
  }
}

// ---------- oslavy odemčení (v0.36, R10 v0.36.1) ----------
// Zvací list / dárek odemkl NOVÉHO hrdinu, nebo oddanost ♥10 odemkla
// SIGNATURE kus → přes odhalení vyskočí slavnostní okno. Víc oslav naráz
// se odbaví frontou — další okno až po zavření předchozího.
let oslavaFronta = []; // položky {typ: "hrdina"|"sig", key}
function spustOslavu(o) {
  if (!o) return;
  if (o.typ === "sig") showSigUnlockCelebration(o.key);
  else showHeroUnlockCelebration(o.key);
}
function dalsiOslava() {
  const el = $("#hero-unlock-overlay");
  if (el) el.classList.add("hidden");
  const dalsi = oslavaFronta.shift();
  if (dalsi) setTimeout(() => spustOslavu(dalsi), 200);
}
// založí/naplní overlay a vrátí element (sdílí ho oslava hrdiny i sigu).
// Zavírá se VÝHRADNĚ křížkem v rohu (zadání uživatele) — klik na pozadí
// ani jinam okno nezavře, ať sláva nezmizí omylem při klikání do hry
function oslavaOverlay(html) {
  let el = $("#hero-unlock-overlay");
  if (!el) {
    el = document.createElement("div");
    el.id = "hero-unlock-overlay";
    document.body.appendChild(el);
  }
  el.innerHTML = html;
  el.querySelector(".hu-box").insertAdjacentHTML("afterbegin",
    `<button class="hu-x" title="${tx("spol.zavrit")}">✕</button>`);
  el.classList.remove("hidden");
  sfx.play("levelup");
  el.querySelector(".hu-x").addEventListener("click", dalsiOslava);
  return el;
}
const oslavaJiskry = () =>
  Array.from({ length: 10 }, (_, i) => `<span class="hu-spark s${i}">✦</span>`).join("");

// oslavy z výsledku JEDNOHO dárku (denní obchod): odemčení a/nebo R10 sig
function oslavyZVysledku(v) {
  if (!v) return;
  const o = [];
  if (v.type === "unlock") o.push({ typ: "hrdina", key: v.key });
  if (v.sig) o.push({ typ: "sig", key: v.key });
  if (!o.length) return;
  const el = $("#hero-unlock-overlay");
  if (el && !el.classList.contains("hidden")) oslavaFronta.push(...o); // okno běží — zařadit
  else { oslavaFronta.push(...o.slice(1)); spustOslavu(o[0]); }
}

function showHeroUnlockCelebration(key) {
  const [fk, idxS] = key.split(":");
  const idx = parseInt(idxS, 10);
  const def = FACTION_DEFS.find(x => x.key === fk);
  const hd = (HERO_DEFS[fk] || [])[idx];
  if (!def || !hd) return;
  const tier = HERO_TIERS[heroTierOf(fk, idx)];
  oslavaOverlay(`<div class="hu-box" style="--hu-barva:${tier.color}">
    <div class="hu-rays"></div>
    ${oslavaJiskry()}
    <div class="hu-title">⭐ ${tx("osl.novy.hrdina")}</div>
    <div class="hu-portrait"><img src="${heroPortraitURL(fk, idx)}" alt=""></div>
    <div class="hu-name">${hd.name}</div>
    <div class="hu-sub" style="color:${def.color}">${def.name}</div>
    <div class="hu-chips">
      <span class="hu-chip" style="border-color:${tier.color};color:${tier.color}">${tier.name}</span>
      <span class="hu-chip">${HERO_TRAITS[hd.trait].name}</span>
    </div>
    <p class="hint">${tx("osl.kde.najdes")}</p>
  </div>`);
}

// R10 (v0.36.1): oddanost ♥10 odemkla hrdinův signature kus — stejná sláva,
// jen s kusem v kruhu místo portrétu a pasivkou v popisu
function showSigUnlockCelebration(key) {
  const [fk, idxS] = key.split(":");
  const idx = parseInt(idxS, 10);
  const sig = SIGNATURE_ITEMS[key];
  const hd = (HERO_DEFS[fk] || [])[idx];
  const def = FACTION_DEFS.find(x => x.key === fk);
  if (!sig || !hd || !def) return;
  const barva = RARITIES[4].color; // signature nosí legendární zlatou
  const veHre = acct.mode === "remote" ? mp.active : G.running;
  oslavaOverlay(`<div class="hu-box" style="--hu-barva:${barva}">
    <div class="hu-rays"></div>
    ${oslavaJiskry()}
    <div class="hu-title">⭐ ${tx("osl.sig")}</div>
    <div class="hu-portrait hu-item"><span>${ITEM_SLOTS[sig.slot].icon}</span></div>
    <div class="hu-name" style="color:${barva}">${sig.name}</div>
    <div class="hu-sub" style="color:${def.color}">${hd.name} · ${def.name}</div>
    <div class="hu-chips">
      <span class="hu-chip" style="border-color:${barva};color:${barva}">⭐ Signature</span>
      <span class="hu-chip">„${sig.passive}“</span>
    </div>
    <p class="hint">${tx("osl.pasivka")}: ${sig.effs.map(e => effLine(e, e.val)).join(" · ")}.<br>
      ${tx(veHre ? "osl.kus.hra" : "osl.kus.ucet")}</p>
  </div>`);
}

// karta zvacího listu (v0.27): okamžité odemčení hrdiny z truhly
function inviteRevealHtml(inv, delay) {
  if (!inv) return "";
  const [fk, idxS] = inv.key.split(":");
  const tier = HERO_TIERS[heroTierOf(fk, parseInt(idxS, 10))];
  return `<div class="reveal-card small invite" style="animation-delay:${delay}s">
    <b class="reveal-name" style="color:#e0b13d">📜 ${tx("odh.zvaci.list")}: ${inv.name}</b>
    <small>${tx("odh.tier.hrdina", { tier: tier.name })}</small>
    <small>${inv.type === "invite" ? tx("odh.hned.odemcen") : tx("odh.uz.odemcen", { n: inv.cores, ikona: CORE_ICON })}</small>
  </div>`;
}

// štítek strany předmětu (☀ Sunborn / 🔥 Ashen); kusy bez strany jsou univerzální
function sideIcon(item) {
  return item && item.side ? `<span title="${SIDES[item.side].name} — ${tx("vyb.strana.tip")}">${SIDES[item.side].icon}</span> ` : "";
}

function closeSideWin() {
  activeWin = null;
  $("#side-win").classList.add("hidden");
  document.querySelectorAll(".rail-btn").forEach(b => b.classList.remove("active"));
}

// Překreslení panelu se odkládá, jen když v něm hráč něco ROZEPSAL (jezdík,
// počet, výběr). Dřív stačil jakýkoli focus uvnitř — jenže kliknuté tlačítko
// si focus drží, takže po „Postavit" se panel překreslil až za tik a stavba
// vypadala, že se nespustila (hlásil uživatel, v0.39).
const VSTUPY = { INPUT: 1, SELECT: 1, TEXTAREA: 1 };
function rozepsanyVstup(el) {
  const ae = document.activeElement;
  return !!ae && ae !== el && el.contains(ae) && !!VSTUPY[ae.tagName];
}

// okna města: překreslují se jen při změně stavu (a ne pod stisknutou myší)
function citySignature(me) {
  // po desítkách, aby rozsah jezdíků rostl s příjmem, ale panel se
  // nepřekresloval při každém tiku suroviny
  const afford = UNIT_KEYS.map(k => Math.floor(recruitAffordable(me, k) / 10)).join(",");
  const buildable = [...Object.keys(BUILDINGS), ...UNIT_KEYS.map(k => "up_" + k)]
    .map(key => canBuild(me, key).ok ? 1 : 0).join("");
  // tržnice: zdroj/cíl a stav jeho zásoby (aby rozsah jezdíku odpovídal)
  const trh = [me.buildings.market || 0, marketTrade.from, marketTrade.to,
    me.resources[marketTrade.from] | 0].join(",");
  return [me.buildings.main, me.buildings.barracks, me.buildings.hospital,
    me.upgrades.inf, me.upgrades.arch, me.upgrades.cav, trh,
    me.build ? me.build.key + me.build.ticksLeft : "", afford, buildable,
    me.recruitQueue.map(rq => rq.type + (rq.count || RECRUIT_BATCH)).join(",")].join("|");
}

function updateCityPanels() {
  if (!activeWin || !["build", "train", "upgrade", "market"].includes(activeWin)) return;
  if (panelHeld) return;
  const win = $("#side-win");
  if (rozepsanyVstup(win)) return;
  const me = player();
  const sig = citySignature(me) + "|" + activeWin;
  if (sig === citySig) return;
  citySig = sig;
  $("#build-panel").innerHTML = buildPanelHtml(me);
  $("#train-panel").innerHTML = trainPanelHtml(me);
  $("#upgrade-panel").innerHTML = upgradePanelHtml(me);
  $("#market-panel").innerHTML = marketPanelHtml(me);
  bindCityPanels(me);
  bindMarketPanel(me);
}

function bindCityPanels(me) {
  // jezdíky: mění se jen čísla a součet, panel se během tažení NEpřekresluje
  document.querySelectorAll("#side-win .rec-slider").forEach(sl =>
    sl.addEventListener("input", () => {
      const k = sl.dataset.type;
      recruitOrder[k] = Math.max(0, Math.min(Number(sl.max), Number(sl.value) | 0));
      const out = document.querySelector(`#side-win .rec-count[data-type="${k}"]`);
      if (out) out.textContent = recruitOrder[k];
      const tot = document.querySelector("#side-win .rec-total");
      if (tot) {
        tot.innerHTML = recruitTotalsHtml(me);
        bindRecruitOrderBtn(me);
      }
    }));
  bindRecruitOrderBtn(me);
  document.querySelectorAll("#side-win .btn-build").forEach(btn =>
    btn.addEventListener("click", () => {
      startBuild(me, btn.dataset.key);
      citySig = null;
      updatePanels();
    }));
  // volba spojeneckého rodu je NEVRATNÁ a platí celou sezónu, proto se
  // potvrzuje druhým klikem (stejný vzor jako vyhlášení války ve Skóre)
  document.querySelectorAll("#side-win .dr-volba").forEach(btn =>
    btn.addEventListener("click", () => {
      const k = btn.dataset.dr;
      if (druhyRodArm !== k) {
        druhyRodArm = k;
        setTimeout(() => { if (druhyRodArm === k) { druhyRodArm = null; citySig = null; updatePanels(); } }, 4000);
      } else {
        druhyRodArm = null;
        zvolDruhyRod(me, k);
      }
      citySig = null;
      updatePanels();
    }));
}

function bindMarketPanel(me) {
  document.querySelectorAll("#market-panel .mk-res").forEach(btn =>
    btn.addEventListener("click", () => {
      marketTrade[btn.dataset.side] = btn.dataset.res;
      if (btn.dataset.side === "from") marketTrade.amount = 0;
      citySig = null;
      updatePanels();
    }));

  const sl = document.querySelector("#market-panel .mk-slider");
  if (sl) sl.addEventListener("input", () => {
    marketTrade.amount = Math.max(0, Math.min(Number(sl.max), Number(sl.value) | 0));
    const out = document.querySelector("#market-panel .mk-count");
    if (out) out.textContent = marketTrade.amount;
    const tot = document.querySelector("#market-panel .mk-total");
    if (tot) { tot.innerHTML = marketPreviewHtml(me); bindTradeBtn(me); }
  });
  bindTradeBtn(me);
}

function bindTradeBtn(me) {
  document.querySelectorAll("#market-panel .btn-shop").forEach(b =>
    b.addEventListener("click", () => shopBuyAction(parseInt(b.dataset.slot, 10))));
  const btn = document.querySelector("#market-panel .btn-trade");
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (!marketExchange(me, marketTrade.from, marketTrade.to, marketTrade.amount)) return;
    marketTrade.amount = 0;
    citySig = null;
    updatePanels();
  });
}

// tlačítko zakázky se překresluje spolu se součtem, proto vlastní navázání
function bindRecruitOrderBtn(me) {
  const btn = document.querySelector("#side-win .btn-order");
  if (btn) btn.addEventListener("click", () => {
    if (!startRecruitOrder(me, recruitOrder)) return;
    for (const k of UNIT_KEYS) recruitOrder[k] = 0;
    citySig = null;
    updatePanels();
  });
  // ✕ u položek fronty; indexy se po zrušení posunou, proto se panel překreslí
  for (const x of document.querySelectorAll("#side-win .rec-q-x")) {
    x.addEventListener("click", () => {
      if (!cancelRecruit(me, parseInt(x.dataset.i, 10))) return;
      citySig = null;
      updatePanels();
    });
  }
}

// odznaky na liště: nerozdělené body dovedností, nabídky paktů, nové záznamy
function updateRailBadges(me) {
  const badge = (id, n) => {
    const el = $(id);
    if (!el) return;
    el.classList.toggle("hidden", !n);
    if (n) el.textContent = n > 99 ? "99+" : n;
  };
  const pts = me.heroes.reduce((a, h) => a + h.skillPts, 0);
  badge("#badge-heroes", pts);
  badge("#badge-realm", G.factions.filter(f => f.alive && f.isAI && f.offerToPlayer > 0).length);
  const seenNow = logEntries().length;
  const noveKroniky = activeWin === "mail" && compTab.mail === "log"
    ? (logSeen = seenNow, 0) : Math.max(0, seenNow - logSeen);
  // chat se počítá do TÉŽE obálky — je to jedno okno; otevřená záložka chatu
  // zprávy rovnou odškrtává (vzor Kroniky)
  const chatNove = activeWin === "mail" && compTab.mail === "chat"
    ? (chatVideno = Math.max(chatVideno, ...(G.chat || []).map(x => x.id), 0), 0)
    : chatNeprectene(me);
  badge("#badge-mail", noveKroniky + unreadReportCount() + chatNove);
}

// ---------- Sloupec portrétů aktivních hrdinů (v0.27) ----------
// vlevo: hrdinové v poli / na pochodu, stav + proužek naplnění armády;
// klik = karta hrdiny, dvojklik = skok kamery
let stripClickTimer = null;
function updateHeroStrip(me) {
  const strip = $("#hero-strip");
  if (!strip) return;
  const rows = [];
  me.heroes.forEach((h, i) => {
    const march = me.marches.find(mm => mm.heroIdx === i && mm.kind !== "siege");
    const sieg = me.marches.find(mm => mm.heroIdx === i && mm.kind === "siege");
    if (!h.pos && !march) return; // doma a v klidu — sloupec ukazuje jen aktivní
    const st = heroStats(me, i);
    let status, army = h.army;
    if (march) {
      army = march.army && armyTotal(march.army) > 0 ? march.army : h.army;
      const cil = G.tiles.get(march.targetKey);
      status = march.kind === "attack" ? `⚔ → ${tileLabel(cil)} (${march.ticksLeft} s)`
        : march.kind === "return" ? `↩ ${tx("sl.domu", { s: march.ticksLeft })}`
        : `🥾 ${tx("sl.presun", { s: march.ticksLeft })}`;
    } else if (sieg) {
      status = `🏰 ${tx("sl.obleha", { s: sieg.ticksLeft })}`;
    } else if (h.rozkaz) {
      const eta = Math.max(0, ...me.marches
        .filter(mm => mm.kind === "reinforce" && mm.targetKey === h.pos)
        .map(mm => mm.ticksLeft));
      status = `📦 posily (${eta} s) → ⚔ ${tileLabel(G.tiles.get(h.rozkaz.targetKey))}`;
    } else if (heroPinned(me, i)) {
      const eta = Math.max(0, ...me.marches
        .filter(mm => mm.kind === "reinforce" && mm.targetKey === h.pos)
        .map(mm => mm.ticksLeft));
      status = `📦 ${tx("hrd.posily.cesta", { s: eta })}`;
    } else {
      status = `${h.guard ? "🛡 " : ""}${h.zakladna === h.pos ? "⌂ " : ""}📍 ${tileLabel(G.tiles.get(h.pos))}`;
    }
    const cap = heroArmyCap(me, i);
    const cp = armyCp(army, me);
    rows.push(`<div class="hs-row" data-hero="${i}" title="${tx("sl.tip")}">
      <img src="${heroPortraitURL(h.srcKey || me.key, h.defIdx)}" alt="">
      <div class="hs-info">
        <span class="hs-name">${heroDef(me, i).name}</span>
        <span class="hs-status">${status}</span>
        <div class="hs-bar" title="${tx("st.armada").toLowerCase()} ${armyTotal(army)} ${tx("spol.j")} · ${tx("spol.veleni")} ${cp}/${cap}">
          <div class="hs-fill" style="width:${Math.min(100, Math.round(100 * cp / Math.max(1, cap)))}%"></div></div>
      </div></div>`);
  });
  const sig = rows.join("");
  if (strip.dataset.sig === sig) return;
  strip.dataset.sig = sig;
  strip.innerHTML = sig;
  strip.querySelectorAll(".hs-row").forEach(row => {
    const i = parseInt(row.dataset.hero, 10);
    row.addEventListener("click", () => {
      clearTimeout(stripClickTimer);
      stripClickTimer = setTimeout(() => openHeroWindow(i), 230);
    });
    row.addEventListener("dblclick", () => {
      clearTimeout(stripClickTimer);
      const h = player().heroes[i];
      const mm = player().marches.find(x => x.heroIdx === i && x.kind !== "siege");
      const key = h.pos || (mm && mm.targetKey);
      if (!key) return;
      const t = G.tiles.get(key);
      const p = tileToPixel(t.q, t.r);
      camera.x = p.x; camera.y = p.y;
      selectedKey = h.pos || null;
      if (h.pos) forceTilePanel();
    });
  });
}

// ---------- Panely ----------
function updatePanels() {
  const me = player();
  if (!me) return;
  const inc = incomeOf(me);
  // žold ani hladovění neexistují (zrušeno 30. 8. 2026) — lišta ukazuje
  // čistý výnos, armádu brzdí jen strop velení hrdinů
  // výnos v liště je ZA HODINU (zadání 30. 8. 2026), zkráceně kvůli místu;
  // přesné číslo i přepočet na tik jsou v bublině nad ikonou
  for (const r of ["food", "wood", "stone", "iron", "gold"]) {
    const el = $("#res-" + r);
    if (!el) continue;
    el.textContent = `${Math.floor(me.resources[r]).toLocaleString(cisloJazyk())} (+${fmtHodKratce(inc[r])}/h)`;
    if (el.parentElement) el.parentElement.title =
      `${RES_NAMES[r][0].toUpperCase() + RES_NAMES[r].slice(1)}: ${tx("spol.vynos.za.hodinu", { kolik: fmtHod(inc[r]) })} `
      + `(+${(Math.round(inc[r] * 10) / 10).toLocaleString(cisloJazyk())} za tik)`;
  }
  $("#res-inf").textContent = me.units.inf;
  $("#res-arch").textContent = me.units.arch;
  $("#res-cav").textContent = me.units.cav;
  const training = me.recruitQueue.reduce((a, rq) => a + (rq.count || RECRUIT_BATCH), 0);
  $("#res-training").textContent = training ? tx("lista.ve.vycviku", { n: training }) : "";
  const coresEl = $("#res-cores");
  if (coresEl) {
    const cores = acctCores();
    coresEl.textContent = cores != null ? cores : "—";
  }
  const drzeni = G.throneHold && G.throneHold.fid >= 0
    ? ` · 👑 ${G.factions[G.throneHold.fid].name}: ${tx("lista.do.koruny", { doba: fmtTime(throneHoldTicks() - G.throneHold.ticks) })}`
    : "";
  // fmtDobu, ne fmtTime: u 336h sezóny by mm:ss ukázalo „2016:00" a roztáhlo lištu
  const fazeTxt = G.faze < 4 ? ` · 🌍 ${G.faze}/4 za ${fmtDobu(Math.max(1, zoneFazeTicks(G.faze + 1) - G.tick))}` : "";
  $("#season-timer").textContent = fmtTime(SEASON_TICKS - G.tick)
    + (G.storm > 0 ? " · 🌋 " + tx("lista.boure") : "") + fazeTxt + (!G.throneOpen ? " · 👑 " + fmtTime(THRONE_UNLOCK - G.tick) : drzeni);
  const prsten = me && me.ring;
  if (prsten) {
    $("#ring-lvl").textContent = prsten.level;
    $("#ring-ap").textContent = prsten.ap;
  }
  // území v liště (v0.39): X/strop; červeně na stropu, kde zábor neprojde
  const landEl = $("#land-count");
  if (landEl) {
    // etapa 11: s AOI má klient jen část mapy — počet polí posílá server
    const mam = me.poli !== undefined ? me.poli : pocetPoli(me), strop = stropPoli(me);
    landEl.textContent = `${mam}/${strop}`;
    $("#land-chip").classList.toggle("full", mam >= strop);
  }
  updateLandPanel();
  $("#btn-quit").classList.toggle("hidden", !G.running || G.gameOver);

  updateScores();
  updateKlan();
  updateChat();
  updateBurza();
  updateGoals();
  updateTilePanel();
  updateCityPanels();
  updateHeroesPanel();
  updateRailBadges(me);
  updateHeroStrip(me);
  updateChestsPanel();
  if (heroWinIdx !== null) renderHeroWindow();
  updateLog();
}

// ---------- CHAT (etapa 9, IV-E) ----------
// Tři kanály jako záložky uvnitř okna 📩 vedle Kroniky a Reportů. Kronika je
// serverový kanál (události světa), chat je hráčský — patří k sobě.
let chatKanal = "svet";
let chatKomu = null;          // protějšek soukromého kanálu ("fid:cid")
let chatNapsano = "";         // rozepsaná zpráva žije MIMO DOM (jinak ji smaže překreslení)
let chatVideno = 0;           // nejvyšší přečtené id — z něj se počítá odznak
let chatSig = null;

function chatJmenoAktera(klic) {
  const [fid, cid] = String(klic || "").split(":").map(Number);
  const f = G.factions[fid];
  if (!f) return "?";
  const a = clenPodleCid(f, cid || 0);
  return a ? jmenoAktera(a) : f.name;
}
// s kým se dá psát soukromě: aktéři mého rodu + kdokoli, kdo mi už napsal
function chatProtejsky(me) {
  const ja = aktorKlic(me);
  const out = new Map();
  for (const a of vsichniClenove(myFaction())) {
    const k = aktorKlic(a);
    if (k !== ja) out.set(k, jmenoAktera(a));
  }
  for (const m of G.chat || []) {
    if (m.kanal !== "soukr") continue;
    for (const k of [m.od, m.komu]) if (k && k !== ja && !out.has(k)) out.set(k, chatJmenoAktera(k));
  }
  return [...out.entries()];
}
function chatZpravy(me) {
  return (G.chat || []).filter(m => {
    if (!chatViditelna(me, m)) return false;
    if (m.kanal !== chatKanal) return false;
    if (chatKanal === "soukr" && chatKomu) return m.od === chatKomu || m.komu === chatKomu;
    return true;
  });
}
// nepřečtené napříč kanály — odznak na liště
function chatNeprectene(me) {
  return (G.chat || []).filter(m => m.id > chatVideno && chatViditelna(me, m)
    && m.od !== aktorKlic(me)).length;
}

function chatPanelHtml() {
  const me = player();
  if (!me) return "";
  const klan = klanOf(me);
  const zpravy = chatZpravy(me);
  const protejsky = chatProtejsky(me);
  const zamek = chatKanal === "klan" && !klan ? tx("chat.bez.klanu")
    : chatKanal === "soukr" && !chatKomu ? tx("chat.vyber.komu") : null;

  let html = `<div class="chat-taby">
    <button class="chat-tab${chatKanal === "svet" ? " active" : ""}" data-kanal="svet">🌍 ${tx("chat.svet")}</button>
    <button class="chat-tab${chatKanal === "klan" ? " active" : ""}" data-kanal="klan">⚔ ${tx("kl.klan")}${
      klan ? ` (${klan.jmeno})` : ""}</button>
    <button class="chat-tab${chatKanal === "soukr" ? " active" : ""}" data-kanal="soukr">✉ ${tx("chat.soukrome")}</button>
  </div>`;

  if (chatKanal === "soukr") {
    html += `<select id="chat-komu" class="chat-komu">
      <option value="">— ${tx("chat.vyber.protejsek")} —</option>` +
      protejsky.map(([k, jm]) => `<option value="${k}"${k === chatKomu ? " selected" : ""}>${jm}</option>`).join("")
      + `</select>`;
  }

  html += `<div class="chat-log" id="chat-log">`;
  if (!zpravy.length) html += `<p class="hint">${zamek || tx("chat.ticho")}</p>`;
  else html += zpravy.map(m => {
    const moje = m.od === aktorKlic(me);
    const barva = FACTION_DEFS.find(f => f.key === m.odRod);
    return `<div class="chat-m${moje ? " moje" : ""}">
      <span class="chat-kdo" style="color:${barva ? barva.color : "#c9b68a"}">${m.odJmeno}</span>
      <span class="chat-cas">${fmtTime(m.tick)}</span>
      <span class="chat-txt">${m.text.replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]))}</span>
    </div>`;
  }).join("");
  html += `</div>`;

  const muze = !(chatKanal === "klan" && !klan) && !(chatKanal === "soukr" && !chatKomu);
  html += `<div class="chat-vstup">
    <input id="chat-text" type="text" maxlength="${CHAT_MAX_ZNAKU}" ${muze ? "" : "disabled"}
      placeholder="${muze ? tx("chat.napis") : (zamek || "")}" value="${chatNapsano.replace(/"/g, "&quot;")}">
    <button id="chat-poslat" ${muze ? "" : "disabled"}>${tx("chat.odeslat")}</button>
  </div>`;
  return html;
}

function updateChat() {
  const el = $("#chat-panel");
  if (!el) return;
  const me = player();
  if (!me) return;
  const zpravy = chatZpravy(me);
  const sig = [chatKanal, chatKomu || "", zpravy.length, zpravy.length ? zpravy[zpravy.length - 1].id : 0,
    chatNapsano, me.klan | 0].join("|");
  if (sig === chatSig) return;
  chatSig = sig;
  const log = el.querySelector("#chat-log");
  const dole = !log || log.scrollTop + log.clientHeight >= log.scrollHeight - 24;
  el.innerHTML = chatPanelHtml();
  bindChat(el);
  const novy = el.querySelector("#chat-log");
  if (novy && dole) novy.scrollTop = novy.scrollHeight;  // drž se u konce, dokud čtenář neodroloval
}

function bindChat(root) {
  const me = player();
  root.querySelectorAll(".chat-tab").forEach(b => b.addEventListener("click", () => {
    chatKanal = b.dataset.kanal; chatSig = null; updateChat();
  }));
  const komu = root.querySelector("#chat-komu");
  if (komu) komu.addEventListener("change", () => { chatKomu = komu.value || null; chatSig = null; updateChat(); });
  const vstup = root.querySelector("#chat-text");
  const posli = () => {
    const t = (vstup && vstup.value || "").trim();
    if (!t) return;
    chatPosli(me, chatKanal, t, chatKanal === "soukr" ? chatKomu : null);
    chatNapsano = ""; if (vstup) vstup.value = "";
    chatSig = null; updateChat();
  };
  if (vstup) {
    vstup.addEventListener("input", e => { chatNapsano = e.target.value; });
    vstup.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); posli(); } });
  }
  const btn = root.querySelector("#chat-poslat");
  if (btn) btn.addEventListener("click", posli);
}

// nové zprávy ze sítě: když je okno chatu otevřené, rovnou je označ za přečtené
function onChatPrisel(nove) {
  const me = typeof player === "function" ? player() : null;
  if (!me) return;
  const otevreno = activeWin === "mail" && compTab.mail === "chat";
  if (otevreno) for (const m of nove) chatVideno = Math.max(chatVideno, m.id);
  chatSig = null;
}

// ---------- KLANOVÁ BURZA (etapa 9, IV-F + IV-R) ----------
// Burza žije na SERVERU (nabídky i úschova jsou v SQLite u účtů), takže v sólo
// hře prostě není — panel to řekne rovnou místo toho, aby nabízel tlačítka,
// která nikam nevedou.
let burzaPrihradka = "vybava";
let burzaSig = null;
let burzaChyba = "";
// rozepsaná nabídka žije MIMO DOM (jinak ji smaže překreslení), stejně jako
// verbovací zakázka od v0.18
let burzaForm = { itemId: "", skupina: "", pocet: 1, dava: {}, chce: {} };

function burzaNabidky() { return (typeof mp !== "undefined" && mp.burza) || []; }
function burzaMoje(n) { return n.majitel === burzaMujKlic(); }
function burzaMujKlic() {
  const a = acctMeta();
  return a && a.name ? String(a.name).toLowerCase() : "";
}

function burzaZboziHtml(n) {
  if (n.prihradka === "suroviny") {
    const s = res => RES_KEYS.filter(k => res[k]).map(k => `${Math.round(res[k])}${RES_ICONS[k]}`).join(" ");
    return `${s(n.dava)} <span class="bz-sip">→</span> ${s(n.chce)}`;
  }
  if (n.prihradka === "vybava") {
    const it = n.dava.item || {};
    return `<img class="it-art-s" src="${itemArtURL(it)}" alt="">
      <b class="rar-${it.rarity}">${it.name}</b>
      <span class="bz-sip">→</span> ${tx("bz.jiny.kus")} <b class="rar-${n.chce.rarita}">${RARITIES[n.chce.rarita].name}</b>`;
  }
  return `${n.dava.pocet}× ${giftNameOf(n.dava.skupina)}
    <span class="bz-sip">→</span> ${tx("bz.darek.tieru", { n: n.chce.pocet, tier: GIFT_TIER_NAME[n.chce.tier].toLowerCase() })}`;
}

function burzaRadekHtml(n) {
  const moje = burzaMoje(n);
  const p = burzaPoplatek(n);
  const me = player();
  const pulka = burzaPulka(n, acctMeta() || {}, dnesniDen());
  let akce = "";
  if (moje) akce = `<button class="bz-mini warn" data-zrus="${n.id}">${tx("bz.stahnout")}</button>`;
  else if (n.prihradka === "suroviny")
    akce = `<button class="bz-mini" data-prijmi="${n.id}">${tx("kl.prijmout")}</button>`;
  else akce = `<button class="bz-mini" data-vyber="${n.id}">${tx("kl.prijmout")}…</button>`;
  return `<div class="bz-row${moje ? " moje" : ""}">
    <div class="bz-zbozi">${burzaZboziHtml(n)}</div>
    <div class="bz-pata">
      <span class="bz-kdo">${moje ? tx("bz.tvoje") : n.jmeno}${n.komu ? " · " + tx("bz.mirena") : ""}</span>
      <span class="bz-poplatek" title="${tx("bz.poplatek.tip")}">
        ${p.mena === "cores" ? "💠" : "🪙"} ${moje ? tx("bz.v.uschove") : tx("bz.tva.pulka")} ${moje ? (n.uschova.cores || n.uschova.gold || 0) : pulka.castka}</span>
      ${akce}
    </div></div>`;
}

function burzaFormHtml() {
  const me = player();
  const acc = acctMeta() || {};
  if (burzaPrihradka === "suroviny") {
    const rada = (kam, popis) => `<div class="bz-res">${popis}` + RES_KEYS.map(k =>
      `<label>${RES_ICONS[k]}<input type="number" min="0" step="10" data-bz="${kam}.${k}"
        value="${(burzaForm[kam][k] | 0) || ""}" placeholder="0"></label>`).join("") + `</div>`;
    const dava = burzaObjem(burzaForm.dava), chce = burzaObjem(burzaForm.chce);
    const p = burzaPoplatek({ prihradka: "suroviny", dava: burzaForm.dava, chce: burzaForm.chce });
    return rada("dava", "<b>" + tx("bz.davas") + "</b>") + rada("chce", "<b>" + tx("bz.chces") + "</b>")
      + `<p class="hint">${tx("bz.suroviny.hint", { dava, chce, poplatek: p.celkem })}</p>`;
  }
  if (burzaPrihradka === "vybava") {
    const kusy = (acc.invItems || []).filter(x => x);
    if (!kusy.length) return `<p class="hint">${tx("bz.bez.vybavy")}</p>`;
    return `<select data-bz="itemId"><option value="">— ${tx("bz.vyber.kus")} —</option>` +
      kusy.map((x, i) => `<option value="${x.id || i}"${burzaForm.itemId === String(x.id || i) ? " selected" : ""}>
        ${RARITIES[x.rarity].name} · ${x.name}</option>`).join("") + `</select>
      <p class="hint">${tx("bz.vybava.hint", { poplatek: BURZA_KUS_JADRA[burzaTierRarity(vybranyKusRarita())] })}</p>`;
  }
  const skupiny = Object.entries(acctDarky()).filter(([, n]) => n > 0);
  if (!skupiny.length) return `<p class="hint">${tx("bz.bez.darku")}</p>`;
  return `<select data-bz="skupina"><option value="">— ${tx("bz.vyber.darky")} —</option>` +
    skupiny.map(([k, n]) => `<option value="${k}"${burzaForm.skupina === k ? " selected" : ""}>
      ${giftNameOf(k)} (${n})</option>`).join("") + `</select>
    <label class="bz-pocet">${tx("bz.pocet")} <input type="number" min="1" max="99" data-bz="pocet"
      value="${burzaForm.pocet || 1}"></label>
    <p class="hint">${tx("bz.darky.hint")}</p>`;
}
function vybranyKusRarita() {
  const acc = acctMeta() || {};
  const it = (acc.invItems || []).find(x => x && String(x.id) === String(burzaForm.itemId));
  return it ? (it.rarity | 0) : 3;
}

function burzaPanelHtml() {
  const me = player();
  if (!me) return "";
  if (typeof mp === "undefined" || !mp.ws) {
    return `<p class="hint">⚖ ${tx("bz.jen.sit")}</p>`;
  }
  const klan = klanOf(me);
  if (!klan) return `<p class="hint">⚖ ${tx("bz.jen.klan")}</p>`;
  const acc = acctMeta() || {};
  let html = `<div class="bz-hlava">
    <b>⚖ Burza klanu ${klan.jmeno}</b>
    <span class="bz-jadra" title="${tx("bz.blokovana.tip")}">
      💠 ${acc.cores | 0}${(acc.jadraVNabidkach | 0) ? ` <span class="bz-blok">${tx("bz.blokovana", { n: acc.jadraVNabidkach })}</span>` : ""}</span>
  </div>`;
  if (burzaChyba) html += `<p class="bz-chyba">⚠ ${burzaChyba}</p>`;

  html += `<div class="bz-taby">` + [["vybava", "🗡 " + tx("st.vybava")], ["darky", "🎁 " + tx("bz.darky")], ["suroviny", "🪨 " + tx("bz.suroviny")]]
    .map(([k, l]) => `<button class="bz-tab${burzaPrihradka === k ? " active" : ""}" data-prih="${k}">${l}</button>`)
    .join("") + `</div>`;

  html += `<div class="bz-form">${burzaFormHtml()}
    <button id="bz-vystavit">${tx("bz.vystavit")}</button></div>`;

  const nab = burzaNabidky().filter(n => n.prihradka === burzaPrihradka);
  html += `<div class="bz-sekce"><b>${tx("bz.nabidky")} (${nab.length})</b>`
    + (nab.length ? nab.map(burzaRadekHtml).join("")
      : `<p class="hint">${tx("bz.prazdno")}</p>`) + `</div>`;
  html += `<p class="hint">${tx("bz.prihradky.hint")}</p>`;
  return html;
}

function updateBurza() {
  const el = $("#burza-panel");
  if (!el) return;
  const me = player();
  if (!me) return;
  const acc = acctMeta() || {};
  const sig = [burzaPrihradka, burzaChyba, me.klan | 0, acc.cores | 0, acc.jadraVNabidkach | 0,
    burzaNabidky().map(n => n.id).join(","), JSON.stringify(burzaForm)].join("|");
  if (sig === burzaSig) return;
  burzaSig = sig;
  el.innerHTML = burzaPanelHtml();
  bindBurza(el);
}

function bindBurza(root) {
  root.querySelectorAll(".bz-tab").forEach(b => b.addEventListener("click", () => {
    burzaPrihradka = b.dataset.prih;
    burzaForm = { itemId: "", skupina: "", pocet: 1, dava: {}, chce: {} };
    burzaChyba = ""; burzaSig = null; updateBurza();
  }));
  root.querySelectorAll("[data-bz]").forEach(el => el.addEventListener("input", () => {
    const cesta = el.dataset.bz.split(".");
    if (cesta.length === 2) burzaForm[cesta[0]][cesta[1]] = Math.max(0, parseInt(el.value, 10) || 0);
    else if (cesta[0] === "pocet") burzaForm.pocet = Math.max(1, parseInt(el.value, 10) || 1);
    else burzaForm[cesta[0]] = el.value;
    burzaSig = null;
    // překreslit jen shrnutí, ne celý panel — jinak by vstup ztratil focus
    if (cesta.length === 2) { const s = burzaSig; burzaSig = s; }
  }));
  const vystav = root.querySelector("#bz-vystavit");
  if (vystav) vystav.addEventListener("click", () => {
    burzaChyba = "";
    if (burzaPrihradka === "suroviny")
      netSend({ type: "burzaVystav", prihradka: "suroviny", dava: burzaForm.dava, chce: burzaForm.chce });
    else if (burzaPrihradka === "vybava")
      netSend({ type: "burzaVystav", prihradka: "vybava", dava: { itemId: burzaForm.itemId },
        chce: { rarita: vybranyKusRarita(), pocet: 1 } });
    else {
      const tier = burzaForm.skupina ? rozborSkupiny(burzaForm.skupina).tier : 0;
      netSend({ type: "burzaVystav", prihradka: "darky",
        dava: { skupina: burzaForm.skupina, pocet: burzaForm.pocet },
        chce: { tier, pocet: burzaForm.pocet } });
    }
  });
  root.querySelectorAll("[data-zrus]").forEach(b => b.addEventListener("click",
    () => netSend({ type: "burzaZrus", id: +b.dataset.zrus })));
  root.querySelectorAll("[data-prijmi]").forEach(b => b.addEventListener("click", () => {
    const n = burzaNabidky().find(x => x.id === +b.dataset.prijmi);
    if (n) netSend({ type: "burzaPrijmi", id: n.id, dava: n.chce });
  }));
  // u výbavy a dárků si přijímající musí vybrat, ČÍM zaplatí
  root.querySelectorAll("[data-vyber]").forEach(b => b.addEventListener("click", () => {
    const n = burzaNabidky().find(x => x.id === +b.dataset.vyber);
    if (!n) return;
    const acc = acctMeta() || {};
    if (n.prihradka === "vybava") {
      const kus = (acc.invItems || []).find(x => x && (x.rarity | 0) === (n.chce.rarita | 0));
      if (!kus) { burzaChyba = tx("bz.chyba.kus"); burzaSig = null; updateBurza(); return; }
      netSend({ type: "burzaPrijmi", id: n.id, dava: { itemId: kus.id } });
    } else {
      const skup = Object.entries(acctDarky()).find(([k, ks]) =>
        ks >= n.chce.pocet && rozborSkupiny(k).tier === (n.chce.tier | 0));
      if (!skup) { burzaChyba = tx("bz.chyba.darky"); burzaSig = null; updateBurza(); return; }
      netSend({ type: "burzaPrijmi", id: n.id, dava: { skupina: skup[0], pocet: n.chce.pocet } });
    }
  }));
}

// ---------- KLAN (etapa 8, IV-A + IV-B) ----------
// Panel klanu je záložka složeného okna 🌿 vedle Cílů a Skóre — klan je
// politika rodu, patří k nim, ne do vlastní ikony lišty (těch je pět a je
// to strop, na kterém se lišta v0.27 ustálila).
let klanSig = null;
let klanJmenoNove = "";   // rozepsané jméno žije MIMO DOM, jinak ho smaže překreslení

function klanPruhHtml(k) {
  const need = klanXpNeed(k.level);
  const pct = k.level >= KLAN_MAX_UROVEN ? 100 : Math.min(100, Math.round(k.xp / need * 100));
  return `<div class="klan-bar"><div style="width:${pct}%"></div></div>
    <span class="klan-xp">${k.level >= KLAN_MAX_UROVEN ? "vrchol"
      : tx("kl.do.urovne", { ted: Math.round(k.xp), need, uroven: k.level + 1 })}</span>`;
}

function klanRadekHtml(k, a, ja) {
  const cid = a.cid || 0;
  const hodnost = cid === k.vudce ? "👑 " + tx("kl.vudce")
    : k.dustojnici.includes(cid) ? "🎖 " + tx("kl.dustojnik") : tx("kl.clen");
  const jaVudce = jeVudce(k, ja), jaDust = jeDustojnik(k, ja);
  let akce = "";
  if (jaVudce && cid !== k.vudce) {
    akce += k.dustojnici.includes(cid)
      ? `<button class="klan-mini" data-sesad="${cid}" title="${tx("kl.sesadit")}">↓</button>`
      : (k.dustojnici.length < klanDustojnikuMax(k)
        ? `<button class="klan-mini" data-povys="${cid}" title="${tx("kl.povysit")}">🎖</button>` : "");
  }
  if (jaDust && cid !== k.vudce && cid !== (ja.cid || 0) && !a.vyhazov)
    akce += `<button class="klan-mini warn" data-vyhod="${cid}" title="${tx("kl.vyhod.tip")}">⚠</button>`;
  const cekaVyhazov = a.vyhazov
    ? `<span class="klan-warn" title="${tx("kl.ceka.odpoved")}">⚠ ${tx("kl.vypoved")} (${fmtDobu(Math.max(0, a.vyhazov.doTiku - G.tick))})</span>` : "";
  return `<div class="klan-row${cid === (ja.cid || 0) ? " ja" : ""}">
    <span class="klan-jm">${jmenoAktera(a)}</span>
    <span class="klan-hod">${hodnost}</span>
    <span class="klan-sk">${scoreClena(a)} ${tx("spol.b")}</span>
    ${cekaVyhazov}<span class="klan-akce">${akce}</span></div>`;
}

function klanPanelHtml() {
  const ja = player();
  const f = myFaction();
  if (!ja || !f) return "";
  let html = "";

  // VYVRHEL: stav, ne hláška — hráč musí vědět, co přesně ztratil
  if (jeVyvrhel(ja)) {
    html += `<div class="klan-vyvrhel"><b>⚠ ${tx("kl.vyvrhel", { rod: f.name })}</b>
      <p>${tx("kl.vyvrhel.popis")}</p></div>`;
  }
  // čekající výpověď — přijmout (čistý odchod) nebo odmítnout (vyvrhel)
  if (ja.vyhazov) {
    const k = klanPodleId(ja.vyhazov.klan);
    html += `<div class="klan-vypoved"><b>⚠ ${tx("kl.vypoved.z", { klan: k ? k.jmeno : "?" })}</b>
      <p>${tx("kl.vypoved.popis", { doba: fmtDobu(Math.max(0, ja.vyhazov.doTiku - G.tick)) })}</p>
      <button id="klan-prijmi">${tx("kl.prijmout.odejit")}</button>
      <button id="klan-odmitni" class="warn">${tx("kl.odmitnout")}</button></div>`;
  }

  const k = klanOf(ja);
  if (!k) {
    const moje = (G.klany || []).filter(x => x.fid === f.id);
    html += `<div class="klan-uvod"><b>⚔ ${tx("kl.klan")}</b>
      <p>${tx("kl.uvod")}</p>
      <div class="klan-zaloz">
        <input id="klan-jmeno" type="text" maxlength="${KLAN_JMENO_MAX}"
          placeholder="${tx("kl.jmeno.placeholder")}" value="${klanJmenoNove.replace(/"/g, "&quot;")}">
        <button id="klan-zaloz">${tx("kl.zalozit")}</button>
      </div></div>`;
    if (moje.length) {
      html += `<div class="klan-sekce"><b>${tx("kl.klany.rodu", { rod: f.name })}</b>
        <p class="hint">${tx("kl.musi.prijmout")}</p>` +
        moje.map(x => `<div class="klan-row"><span class="klan-jm">${x.jmeno}</span>
          <span class="klan-hod">${tx("spol.ur")} ${x.level}</span>
          <span class="klan-sk">${klanCleny(x).length} / ${klanKapacita(x)} ${tx("kl.clenu")}</span></div>`).join("")
        + `</div>`;
    }
    return html;
  }

  const cleny = klanCleny(k);
  const pevnosti = klanPevnosti(k);
  html += `<div class="klan-hlava"><b>⚔ ${k.jmeno}</b>
    <span class="klan-hod">${tx("spol.uroven")} ${k.level}</span></div>
    ${klanPruhHtml(k)}
    <div class="klan-cisla">
      <span title="${tx("kl.kapacita.tip")}">👥 ${cleny.length} / ${klanKapacita(k)}</span>
      <span title="${tx("kl.sloty.tip", { n: KLAN_CLENU_NA_DUSTOJNIKA })}">🎖 ${k.dustojnici.length} / ${klanDustojnikuMax(k)}</span>
      <span title="${tx("kl.pevnosti.tip")}">🏯 ${pevnosti.length} / ${klanPevnostiMax(k)}</span>
      <span title="${tx("kl.sila.tip")}">⚔ ${klanSila(k)}</span>
    </div>`;

  html += `<div class="klan-sekce"><b>${tx("kl.clenove")}</b>`
    + cleny.map(a => klanRadekHtml(k, a, ja)).join("") + `</div>`;

  // důstojník přijímá lidi z rodu, kteří v klanu nejsou
  if (jeDustojnik(k, ja)) {
    const volni = vsichniClenove(f).filter(a => !a.klan);
    if (volni.length && cleny.length < klanKapacita(k)) {
      html += `<div class="klan-sekce"><b>${tx("kl.rod.bez.klanu")}</b>`
        + volni.map(a => `<div class="klan-row"><span class="klan-jm">${jmenoAktera(a)}</span>
            <span class="klan-sk">${scoreClena(a)} ${tx("spol.b")}</span>
            <span class="klan-akce"><button class="klan-mini" data-prijmi="${a.cid || 0}">${tx("kl.prijmout")}</button></span>
          </div>`).join("") + `</div>`;
    }
  }

  if (pevnosti.length) {
    html += `<div class="klan-sekce"><b>${tx("kl.pevnosti")}</b>`
      + pevnosti.map(t => `<div class="klan-row klan-pevnost" data-skok="${keyOf(t.q, t.r)}">
          <span class="klan-jm">🏯 ${t.q},${t.r}</span>
          <span class="klan-hod">${regionOf(t)}</span>
          <span class="klan-sk">🛡 ${hrdinuNaPoli(keyOf(t.q, t.r))} / ${pevnostKapacita(k)} ${tx("kl.hrdinu")}</span>
        </div>`).join("") + `</div>`;
  }

  html += `<p class="hint">${tx("kl.pevnost.hint")}</p>
    <button id="klan-odejdi" class="warn">${tx("kl.opustit")}</button>`;
  return html;
}

function updateKlan() {
  const el = $("#klan-panel");
  if (!el) return;
  const ja = player();
  if (!ja) return;
  const k = klanOf(ja);
  const sig = [k ? k.id : 0, k ? k.level : 0, k ? Math.round(k.xp) : 0,
    k ? klanCleny(k).length : 0, k ? k.dustojnici.join(",") : "",
    k ? klanPevnosti(k).length : 0, (G.klany || []).length,
    ja.vyhazov ? ja.vyhazov.doTiku : 0, jeVyvrhel(ja) ? 1 : 0,
    // rozepsané jméno musí být v podpisu, jinak input po překreslení „skáče"
    klanJmenoNove].join("|");
  if (sig === klanSig) return;
  klanSig = sig;
  el.innerHTML = klanPanelHtml();
  bindKlan(el);
}

function bindKlan(root) {
  const me = player();
  const vstup = root.querySelector("#klan-jmeno");
  if (vstup) vstup.addEventListener("input", e => { klanJmenoNove = e.target.value; });
  const zaloz = root.querySelector("#klan-zaloz");
  if (zaloz) zaloz.addEventListener("click", () => {
    const jm = (vstup && vstup.value || "").trim();
    if (!jm) return;
    zalozKlan(me, jm);
    klanJmenoNove = ""; klanSig = null; updateKlan();
  });
  const konec = root.querySelector("#klan-odejdi");
  if (konec) konec.addEventListener("click", () => { odejdiZKlanu(me); klanSig = null; updateKlan(); });
  const ano = root.querySelector("#klan-prijmi");
  if (ano) ano.addEventListener("click", () => { prijmiVyhazov(me); klanSig = null; updateKlan(); });
  const ne = root.querySelector("#klan-odmitni");
  if (ne) ne.addEventListener("click", () => { odmitniVyhazov(me); klanSig = null; updateKlan(); });
  root.querySelectorAll("[data-prijmi]").forEach(b => b.addEventListener("click",
    () => { prijmiDoKlanu(me, +b.dataset.prijmi); klanSig = null; updateKlan(); }));
  root.querySelectorAll("[data-povys]").forEach(b => b.addEventListener("click",
    () => { povysDustojnika(me, +b.dataset.povys); klanSig = null; updateKlan(); }));
  root.querySelectorAll("[data-sesad]").forEach(b => b.addEventListener("click",
    () => { sesadDustojnika(me, +b.dataset.sesad); klanSig = null; updateKlan(); }));
  root.querySelectorAll("[data-vyhod]").forEach(b => b.addEventListener("click",
    () => { navrhniVyhazov(me, +b.dataset.vyhod); klanSig = null; updateKlan(); }));
  root.querySelectorAll("[data-skok]").forEach(el => el.addEventListener("click", () => {
    const t = G.tiles.get(el.dataset.skok);
    if (!t) return;
    const p = tileToPixel(t.q, t.r);
    camera.x = p.x; camera.y = p.y;
    selectedKey = el.dataset.skok;
    forceTilePanel();
  }));
}

// řádek o třetí úrovni vlastnictví: klanové pole a pole vyvrhela. Patří do
// SPOLEČNÉ části panelu — pole vyvrhela je pro rod „cizí" a bez popisku by
// vypadalo jako pole nepřítele ve vlastní barvě.
function klanPoleHtml(me, t) {
  if (t.klan) {
    const k = klanPodleId(t.klan);
    const moje = k && (me.klan || 0) === k.id;
    const kap = k ? ` · 🛡 ${hrdinuNaPoli(keyOf(t.q, t.r))} / ${pevnostKapacita(k)} ${tx("kl.hrdinu")}` : "";
    return `<p class="odol-line" title="${tx("kl.pole.tip", { reach: REACH })}">
      🏯 ${tx("kl.pole", { klan: k ? k.jmeno : "?" })}${moje ? " ✅ " + tx("kl.tvuj") : ""}${jeKlanovaPevnost(t) ? kap : ""}</p>`;
  }
  const drz = drzitelPole(t);
  if (drz && jeVyvrhel(drz) && t.owner === me.id) {
    return `<p class="odol-line" title="${tx("kl.vyvrhel.pole.tip")}">
      ⚠ ${tx("kl.vyvrhel.pole")} — ${jmenoAktera(drz)}${(me.cid || 0) === (drz.cid || 0) ? " " + tx("kl.ty") : " · " + tx("kl.rod.nebrani")}</p>`;
  }
  return "";
}

// tlačítka klanové pevnosti do panelu pole (sdílí obě větve — s hrdinou i bez)
function klanPevnostBtnHtml(me, t) {
  const k = klanOf(me);
  if (!k) return "";
  if (jeKlanovaPevnost(t) && t.klan === k.id && jeDustojnik(k, me))
    return `<button id="btn-klan-bourat" class="warn"
      title="${tx("kl.zbourat.tip")}">🏯 ${tx("kl.zbourat")}</button>`;
  if (!lzeStavetPevnost(me, t)) return "";
  const muze = canAfford(me, KLAN_PEVNOST_CENA);
  return `<button id="btn-klan-pevnost" ${muze ? "" : "disabled"}
    title="${tx("kl.postavit.tip", { reach: REACH })}">
    🏯 ${tx("kl.postavit")} (${costStr(KLAN_PEVNOST_CENA)})</button>`;
}

// ---------- POLITIKA (etapa 10, IV-D) ----------
// Válku za rod nevyhlašuje jednotlivec, ale ROZHODUJÍCÍ KLAN — panel proto
// patří ke Skóre a diplomacii, kde se rod dívá na ostatní rody.
function politikaHtml(me) {
  const f = myFaction();
  if (!f) return "";
  const k = klanOf(me);
  const rozId = rozhodujiciKlanId(f.id);
  const roz = klanPodleId(rozId);
  const mujRozhoduje = !!k && k.id === rozId;
  const dustojnik = !!k && jeDustojnik(k, me);
  const spoj = G.factions[spojenecId(f)];

  let html = `<div class="pol-sek"><b>🏛 ${tx("pol.nazev")}</b>
    <p class="pol-radek">${roz ? tx("pol.mluvi", { klan: roz.jmeno }) : tx("pol.mluvi.nikdo")}
      ${mujRozhoduje ? `<span class="pol-ok">— ${tx("pol.to.jsi.ty")}</span>` : ""}
      <span class="pol-hint" title="${tx("pol.rozhodujici.tip")}">ⓘ</span></p>`;
  if (spoj) {
    const plati = jsouSpojenci(f, spoj);
    html += `<p class="pol-radek">🤝 ${tx("pol.spojenec")}: <b style="color:${spoj.color}">${spoj.name}</b>
      ${plati ? "— " + tx("pol.spojenec.plati") : "<i>— " + tx("pol.spojenec.ceka") + "</i>"}
      ${mujRozhoduje && dustojnik ? `<button class="pol-mini warn" id="pol-zrus-spoj">${tx("spol.zrusit")}</button>` : ""}</p>`;
  }

  // otevřená hlasování
  const hlasy = hlasovaniOtevrene(f.id).filter(h => !k || h.klan === k.id);
  for (const h of hlasy) {
    const cil = G.factions[h.cil];
    const smim = k && h.klan === k.id && (h.faze !== "rada" || dustojnik);
    const uzJsem = h.hlasy[me.cid || 0] !== undefined;
    const pro = Object.values(h.hlasy).filter(Boolean).length;
    const potreba = h.faze === "rada" ? radaVelikost(klanPodleId(h.klan))
      : Math.max(1, Math.ceil(klanCleny(klanPodleId(h.klan)).length * h.prah));
    html += `<div class="pol-hlas">
      <b>${tx(h.typ === "valka" ? "pol.valka.proti" : "pol.mir.s", { rod: cil ? cil.name : "?" })}</b>
      <span class="pol-faze">${tx(h.faze === "rada" ? "pol.rada" : "pol.clenove")}
        · ${pro}/${potreba} ${tx("pol.pro.male")} · ${tx("pol.zbyva", { doba: fmtDobu(Math.max(0, h.doTiku - G.tick)) })}</span>
      ${smim && !uzJsem ? `<span class="pol-akce">
        <button class="pol-mini" data-hlas="${h.id}" data-pro="1">${tx("pol.pro")}</button>
        <button class="pol-mini warn" data-hlas="${h.id}" data-pro="0">${tx("pol.proti")}</button></span>`
        : `<span class="pol-faze">${tx(uzJsem ? "pol.hlasoval" : "pol.nehlasujes")}</span>`}
    </div>`;
  }

  // odpočty vyhlášení (vidí je celý svět — o to jde)
  for (const fid of Object.keys(f.vyhlaseni || {})) {
    const cil = G.factions[fid];
    html += `<p class="pol-radek pol-odpocet">⚔ ${tx("pol.vyhlaseno", { rod: cil ? cil.name : "?", doba: fmtDobu(Math.max(0, f.vyhlaseni[fid] - G.tick)) })}</p>`;
  }

  if (mujRozhoduje && dustojnik) {
    const cile = G.factions.filter(x => x.alive && x.id !== f.id);
    html += `<div class="pol-navrh">
      <select id="pol-cil">${cile.map(x => `<option value="${x.id}">${x.name}</option>`).join("")}</select>
      <button class="pol-mini" id="pol-valka">⚔ ${tx("pol.hlasovat.valka")}</button>
      <button class="pol-mini" id="pol-mir">🕊 ${tx("pol.hlasovat.mir")}</button>
      <button class="pol-mini" id="pol-spoj">🤝 ${tx("pol.nabidnout.spoj")}</button>
    </div>
    <p class="hint">${tx("pol.postup", { pct: Math.round(HLASOVANI_MIN_PODIL * 100) })}</p>`;
  } else if (k) {
    html += `<p class="hint">${tx("pol.navrhuje")}</p>`;
  } else {
    html += `<p class="hint">${tx("pol.bez.klanu")}</p>`;
  }
  return html + `</div>`;
}

function bindPolitika(root) {
  const me = player();
  const cil = () => {
    const s = root.querySelector("#pol-cil");
    return s ? +s.value : -1;
  };
  const b = (id, fn) => { const el = root.querySelector(id); if (el) el.addEventListener("click", fn); };
  b("#pol-valka", () => zahajHlasovani(me, "valka", cil(), 0.5));
  b("#pol-mir", () => zahajHlasovani(me, "mir", cil(), 0.5));
  b("#pol-spoj", () => nabidniSpojenectvi(me, cil()));
  b("#pol-zrus-spoj", () => zrusSpojenectvi(me));
  root.querySelectorAll("[data-hlas]").forEach(el => el.addEventListener("click",
    () => hlasuj(me, +el.dataset.hlas, el.dataset.pro === "1")));
}

// skóre + diplomacie: u AI frakcí stav paktu / nabídka paktu
function updateScores() {
  const me = player();
  let ringHtml = "";
  if (me && me.ring) {
    const r = me.ring;
    const need = r.level < RING_MAX ? ringXpNeed(r.level + 1) : 0;
    const pct = need ? Math.min(100, Math.round(r.xp / need * 100)) : 100;
    const dalsi = RING_UNLOCKS.find(u => u.lvl > r.level);
    ringHtml = `<div class="ring-sec">
      <b>⭘ ${tx("pr.prsten", { uroven: r.level })}${r.level >= RING_MAX ? " " + tx("pr.vrchol") : ""}</b>
      <div class="respect-bar"><div class="respect-fill" style="width:${pct}%"></div>
        <span class="respect-num">${need ? tx("pr.zkusenost", { ted: r.xp, need, doba: fmtTime(ringGrantTicks()) }) : tx("pr.plna.moc")}</span></div>
      <div class="hint">⚡ ${tx("pr.body.cinu", { ted: r.ap, max: ringApMax(me), doba: fmtTime(ringApTicks()) })}</div>
      <div class="hint">🗺 ${tx("pr.uzemi", { ted: pocetPoli(me), max: stropPoli(me) })}</div>
      ${dalsi ? `<div class="hint">${tx("pr.dalsi.dar", { uroven: dalsi.lvl, co: dalsi.txt })}</div>` : ""}
      <div class="ring-strom"><b>${tx("pr.strom")}</b> — ${tx("pr.body")}: <b>${r.body || 0}</b>
        <span class="dim">${tx("pr.body.hint")}</span>
        ${Object.entries(RING_VETVE).map(([k, v]) => {
          const rank = (r.strom && r.strom[k]) || 0;
          const plus = (r.body || 0) > 0 && rank < v.max;
          return `<div class="ring-vetev"><span title="${v.per} ${tx("pr.za.bod")}">${v.icon} ${v.name}</span>
            <span class="ring-tecky">${"●".repeat(rank)}${"○".repeat(v.max - rank)}</span>
            ${plus ? `<a href="#" class="ring-plus" data-vetev="${k}" title="${tx("pr.naucit")}: ${v.per}">＋</a>` : `<span class="dim">＋</span>`}</div>`;
        }).join("")}
        ${Object.values((r.strom || {})).some(x => x > 0)
          ? `<a href="#" class="ring-reset" title="${tx("pr.reset.tip", { cena: RING_RESPEC_GOLD })}">↺ ${tx("pr.reset")}</a>` : ""}
      </div>
    </div>`;
    const brany = [];
    for (const t of G.tiles.values()) if (t.structure === "grandfort") brany.push(t);
    const trun = tileAt(0, 0);
    const radek = (jm, drzi) => `<div class="kraj-row"><span>${jm}</span><span>${
      drzi >= 0 ? `<span style="color:${G.factions[drzi].color}">${G.factions[drzi].name}</span>` : "—"}</span></div>`;
    ringHtml += `<div class="ring-sec"><b>⚑ ${tx("pr.kraje", { svet: SVET_JMENO })}</b> <span class="dim">${tx("pr.kraje.hint")}</span>
      ${radek(REGION_CENTER + " 👑", trun ? trun.owner : -1)}
      ${brany.map(b => radek(regionOf(b), b.owner)).join("")}
    </div>`;
  }
  const polHtml = politikaHtml(me);
  $("#scores").innerHTML = ringHtml + polHtml + G.factions.map(f => {
    const s = f.alive ? scoreOf(f) : 0;
    let diplo = "";
    if (f.id !== me.id && f.alive && me.alive) {
      if (hasPact(me, f)) {
        diplo = `<span class="pact-tag" title="${tx("dip.pakt")}">🤝 ${fmtTime(myFaction().pacts[f.id])}</span>
          <a href="#" class="pact-cancel" data-f="${f.id}" title="${tx("dip.pakt.zrusit")}">✕</a>`;
      } else if ((f.pactCooldown[me.id] || 0) > 0) {
        diplo = `<span class="pact-tag muted" title="${tx("dip.pakt.nejedna")}">🤝 ✕</span>`;
      } else {
        diplo = `<a href="#" class="pact-offer" data-f="${f.id}"
          title="${tx("dip.pakt.nabidnout", { cena: PACT_COST, nalada: f.ai.mood })}">🤝</a>`;
      }
      // v0.29: vyhlášení války — sundá 70% postih bourání v krajích cíle
      // a otevírá útok na kapitál; dvojklikové ozbrojení, dlouhý cooldown
      if (jeValka(me, f)) {
        diplo += ` <span class="war-tag" title="${tx("dip.valka.bezi")}">⚔🔥</span>`;
      } else if (G.tick < (myFaction().valkaCd || 0)) {
        diplo += ` <span class="war-tag muted" title="${tx("dip.valka.cd", { doba: fmtTime((myFaction().valkaCd || 0) - G.tick) })}">⚔</span>`;
      } else {
        const armed = warArm && warArm.fid === f.id && performance.now() < warArm.do;
        diplo += ` <a href="#" class="war-declare${armed ? " armed" : ""}" data-f="${f.id}"
          title="${armed ? tx("dip.valka.potvrd") : tx("dip.valka.tip", { doba: fmtTime(warCdTicks()) })}">${armed ? "⚔?!" : "⚔"}</a>`;
      }
      if (f.valky && f.valky[me.id])
        diplo += ` <span class="war-tag danger" title="${tx("dip.valka.na.tebe", { rod: f.name })}">🔥!</span>`;
    }
    return `<div class="score-row${f.id === G.playerFaction ? ' me' : ''}">
      <span class="dot" style="background:${f.color}"></span>
      <span class="fname">${f.name}${f.alive ? "" : " ☠"}</span>
      ${diplo}<span class="fscore">${s}</span></div>`;
  }).join("");
  // příchozí nabídky paktu od AI
  const offers = G.factions.filter(f => f.isAI && f.alive && f.offerToPlayer > 0);
  $("#diplo-offers").innerHTML = offers.map(f =>
    `<div class="diplo-offer">
      <span class="dot" style="background:${f.color}"></span>
      ${tx("dip.nabizi.pakt", { rod: f.name })} — ${fmtTime(f.offerToPlayer)}
      <a href="#" class="offer-yes" data-f="${f.id}">${tx("dip.prijmout")}</a> ·
      <a href="#" class="offer-no" data-f="${f.id}">${tx("dip.odmitnout")}</a>
    </div>`).join("");
  const bind = (sel, fn) => $("#scores").parentElement.querySelectorAll(sel).forEach(a =>
    a.addEventListener("click", e => { e.preventDefault(); fn(parseInt(a.dataset.f, 10)); updatePanels(); }));
  // strom Prstenu (v0.31): + na větvích a přerozdělení — klíče jsou řetězce
  bindPolitika($("#scores"));   // etapa 10: hlasování a spojenectví
  $("#scores").parentElement.querySelectorAll(".ring-plus").forEach(a =>
    a.addEventListener("click", e => { e.preventDefault(); ringLearn(player(), a.dataset.vetev); updatePanels(); }));
  $("#scores").parentElement.querySelectorAll(".ring-reset").forEach(a =>
    a.addEventListener("click", e => { e.preventDefault(); ringReset(player()); updatePanels(); }));
  bind(".pact-offer", id => {
    const r = offerPact(player(), id);
    if (r.ok) sfx.play(r.accepted ? "pact" : "error");
  });
  bind(".pact-cancel", id => cancelPact(player(), id));
  bind(".offer-yes", id => { acceptAiOffer(id); });
  bind(".offer-no", id => declineAiOffer(id));
  // válka na dvojí kliknutí (ozbrojený stav 3 s — jako u ✕ Konec)
  bind(".war-declare", id => {
    if (warArm && warArm.fid === id && performance.now() < warArm.do) {
      warArm = null;
      declareWar(player(), id);
      sfx.play("error");
    } else {
      warArm = { fid: id, do: performance.now() + 3000 };
    }
  });
}
let warArm = null; // {fid, do} — první klik na ⚔ jen „ozbrojí" vyhlášení

// cíle sezóny (jednorázové odměny)
// v0.30: popis zamčené zóny (panel, kolo, tooltip); null = cíl je otevřený
function zonaZamekTxt(me, t) {
  if (zonaOtevrena(me, t)) return null;
  const z = zonaOf(bigAnchor(t));
  const potreba = z === "vnitrek" ? 4 : z === "mezikruzi" ? 2 : 3;
  const nazev = tx(z === "vnitrek" ? "zona.vnitrek"
    : z === "mezikruzi" ? "zona.mezikruzi"
    : z === "most" ? "zona.most" : "zona.cizi");
  return `🔒 ${tx("zona.zamek", { nazev, faze: potreba, doba: fmtTime(Math.max(0, zoneFazeTicks(potreba) - G.tick)) })}`;
}

// ---------- RALLY: co se právě dobývá (etapa 7) ----------
// Okno zranění dává smysl jen tehdy, když skupina VIDÍ, jak daleko je.
// Panel pole ukáže jedno pole; tohle je přehled VŠECH načatých cílů, které
// hráč vidí — kolik posádky zbývá, kolik času do resetu a kdo je na cestě.
// Plán (IV-C): „zbývá 36 ze 40 armád, reset za 42 minut".
function rallyHtml(me) {
  const radky = [];
  for (const t of G.tiles.values()) {
    if (t.owner !== -1 || !(t.zran > 0) || t.big) continue;
    const k = keyOf(t.q, t.r);
    if (!G.explored.has(k)) continue;          // co hráč neviděl, to nezná
    const plna = t.structure ? (STRUCTURES[t.structure] || {}).militia
      : TIER_GARRISON[t.level - 1] * (t.bigSize === 2 ? 2 : 1);
    if (!plna) continue;
    const zbyva = Math.max(0, Math.min(100, Math.round(100 * t.garrison / plna)));
    if (zbyva > 97) continue;                   // sotva škrábnuté cíle nezajímají
    const naCeste = me.marches.filter(m => m.kind === "attack" && m.targetKey === k).length;
    radky.push({ t, k, zbyva, naCeste,
      jmeno: t.structure ? STRUCTURES[t.structure].name : tx("rally.pole", { sila: tierOf(t) }) });
  }
  if (!radky.length) return "";
  // nejblíž k pádu první — tam se skupina má sejít
  radky.sort((a, b) => a.zbyva - b.zbyva || a.t.zran - b.t.zran);
  const rows = radky.slice(0, 8).map(r => `<div class="rally-row" data-key="${r.k}"
      title="${tx("rally.tip")}">
      <span class="rally-jmeno">${r.jmeno} <span class="hint-inline">${regionOf(r.t)}</span></span>
      <span class="rally-bar"><span style="width:${r.zbyva}%"></span></span>
      <span class="rally-cisla">${Math.round(r.t.garrison).toLocaleString(cisloJazyk())} / ${Math.round(plnaZ(r)).toLocaleString(cisloJazyk())}
        · ⏳ ${fmtTime(r.t.zran)}${r.naCeste ? ` · ⚔${r.naCeste}` : ""}</span>
    </div>`).join("");
  return `<div class="rally-box"><div class="rally-head">⚔ ${tx("rally.nadpis")}</div>${rows}</div>`;
}
function plnaZ(r) {
  return r.t.structure ? (STRUCTURES[r.t.structure] || {}).militia
    : TIER_GARRISON[r.t.level - 1] * (r.t.bigSize === 2 ? 2 : 1);
}

function updateGoals() {
  const me = player();
  const rewardTxt = r => Object.entries(r).map(([k, v]) =>
    `+${v} ${{ food: "🌾", wood: "🪵", stone: "🪨", iron: "⚙" }[k] || "🪙"}`).join(" ");
  // popisy fází se čtou AŽ TADY, ne do konstanty modulu — jinak by v nich
  // zamrzl jazyk platný při načtení souboru
  const fazePopis = ["", tx("cil.faze1"), tx("cil.faze2"), tx("cil.faze3"), tx("cil.faze4")];
  const zony = `<div class="goal-row zone-status" title="${tx("cil.faze.tip")}">
      <span class="goal-check">🌍</span>
      <span class="goal-desc"><b>${tx("cil.otevirani", { faze: G.faze })}</b> — ${fazePopis[G.faze]}${
        G.faze < 4 ? `<br><span class="hint-inline">${tx("cil.dalsi.faze", { doba: fmtDobu(Math.max(1, zoneFazeTicks(G.faze + 1) - G.tick)) })}</span>` : ""}</span>
    </div>`;
  // v0.31: strop území + osobní příběh sezóny + kolektivní checkpointy
  const strop = `<div class="goal-row zone-status" title="${tx("cil.strop.tip")}">
      <span class="goal-check">🗺</span>
      <span class="goal-desc"><b>${tx("cil.uzemi", { ted: pocetPoli(me), max: stropPoli(me) })}</b></span>
    </div>`;
  const j = me.journey || { kapitola: 0, splnene: {} };
  const kap = KAPITOLY[j.kapitola];
  let pribeh;
  if (!kap) {
    pribeh = `<div class="goal-row done"><span class="goal-check">📖</span>
      <span class="goal-desc">${tx("cil.pribeh.hotov", { n: KAPITOLY.length })}</span></div>`;
  } else {
    pribeh = `<div class="goal-row"><span class="goal-check">📖</span>
      <span class="goal-desc"><b>${tx("cil.kapitola", { n: j.kapitola + 1, z: KAPITOLY.length, jmeno: kap.name })}</b><br>
        <span class="hint-inline">${tx("cil.za.kapitolu", { odmena: rewardTxt(kap.reward) })}</span></span></div>`
      + kap.quests.map(q => `<div class="goal-row${j.splnene[q.key] ? " done" : ""}">
        <span class="goal-check">${j.splnene[q.key] ? "✅" : "◻"}</span>
        <span class="goal-desc">${q.desc}</span></div>`).join("");
  }
  const checkpointy = CHECKPOINTY.map((c, i) => `<div class="goal-row${G.checkpointy && G.checkpointy[i] ? " done" : ""}">
      <span class="goal-check">${G.checkpointy && G.checkpointy[i] ? "🏁" : "◻"}</span>
      <span class="goal-desc">${tx("cil.checkpoint")}: ${c.popis}</span>
      <span class="goal-reward">+${c.bonusPoli} 🗺 ${tx("cil.vsem")}</span>
    </div>`).join("");
  $("#goals").innerHTML = rallyHtml(me) + zony + strop + pribeh + checkpointy;
  // skok kamerou na načatý cíl — skupina se u něj má sejít
  for (const row of document.querySelectorAll("#goals .rally-row")) {
    row.addEventListener("click", () => {
      const t = G.tiles.get(row.dataset.key);
      if (!t) return;
      const p = tileToPixel(t.q, t.r);
      camera.x = p.x; camera.y = p.y;
      selectedKey = row.dataset.key;
      hideTileMenu();
      forceTilePanel();
    });
  }
}

let heroesTab = "moji";   // "moji" | "sin" — záložky okna hrdinů (v0.27)
let presetOpen = -1;       // rozbalený editor výchozí sestavy

function heroesTabsHtml(me) {
  return `<div class="hp-tabs win-tabs-inline">
    <span class="win-tab${heroesTab === "moji" ? " active" : ""}" data-htab="moji">⚑ ${tx("hrd.moji", { n: me.heroes.length, max: HERO_MAX })}</span>
    <span class="win-tab${heroesTab === "sin" ? " active" : ""}" data-htab="sin">🏛 ${tx("hrd.sin")}</span>
  </div>`;
}

function bindHeroesTabs(panel) {
  panel.querySelectorAll("[data-htab]").forEach(t => t.addEventListener("click", () => {
    heroesTab = t.dataset.htab;
    updateHeroesPanel();
  }));
}

// Síň hrdinů je katalog 24–32 karet — do 336px sloupce se nevejde čitelně,
// takže na tuhle záložku (a jen na ni) okno roztáhne (v0.41)
function sirokeOkno(sec) {
  const win = $("#side-win");
  if (win) win.classList.toggle("siroke", sec === "heroes" && heroesTab === "sin");
}

// hvězdy hrdiny podle ÚČTU (mimo pole): v sólu z heroProgress, v MP z mapy
// heroStars v profilu — profil celý heroProgress neposílá
function acctStars(key) {
  const a = acctMeta();
  if (!a) return 0;
  if (a.heroStars) return a.heroStars[key] | 0;
  const pr = (a.heroProgress || {})[key];
  return pr ? (pr.stars | 0) : 0;
}

// ---------- Náhled hrdiny (31. 8. 2026, zadání uživatele) ----------
// Síň u zamčeného hrdiny ukazovala jméno, rys a cenu odemčení — co UMÍ, se
// hráč nedozvěděl, dokud ho neměl. Sbírkovou hru to dělá slepou: nedá se
// rozhodnout, do koho sypat dárky. Náhled je čistě ke KOUKÁNÍ: stromy
// dovedností, signature kus a postup k odemčení; žádné body, žádné učení.
let sinNahled = null;   // "fkey:defIdx", nebo null

// jeden uzel stromu jako řádek — u větví se přidá odsazení a rodič
function nahledUzelHtml(tree, sk, vetev) {
  const efekty = skillEffs(sk).map(e => effLine(e, e.val * sk.max)).join(" · ");
  const rodic = sk.parent ? tree.find(x => x.key === sk.parent) : null;
  const zamek = sk.main
    ? (STAR_UNLOCK_MAIN[sk.slot] ? `♥${STAR_UNLOCK_MAIN[sk.slot]}` : tx("nah.od.zacatku"))
    : tx("nah.rodic.rank", { rodic: rodic ? rodic.name : sk.parent, rank: sk.req || SUB_REQ });
  return `<div class="nh-skill${vetev ? " vetev" : ""}${sk.ult ? " ult" : ""}">
    <img class="nh-art" src="${skillArtURL(sk)}" alt="">
    <div class="nh-skill-txt">
      <div class="nh-skill-name">${sk.ult ? "★ " : ""}${sk.name}
        <span class="nh-max">max ${sk.max}</span>
        <span class="nh-when">${skillTimingTag(sk)}</span></div>
      <div class="nh-desc">${sk.desc}</div>
      <div class="nh-eff">${tx("nah.plny.rank")}: <b>${efekty}</b>${sk.maxEff
        ? ` · ✨ ${tx("nah.mistrovstvi")}: ${effLine(sk.maxEff, sk.maxEff.val)}` : ""}</div>
      <div class="nh-lock">🔓 ${zamek}</div>
    </div>
  </div>`;
}

function nahledHrdinyHtml(key) {
  const [fkey, ds] = key.split(":");
  const d = parseInt(ds, 10);
  const def = FACTION_DEFS.find(x => x.key === fkey);
  const hd = HERO_DEFS[fkey] && HERO_DEFS[fkey][d];
  if (!def || !hd) return "";
  const tierIdx = heroTierOf(fkey, d);
  const tier = HERO_TIERS[tierIdx];
  const trait = HERO_TRAITS[hd.trait];
  const darek = giftNameOf(giftGroupOfHero(key));
  const sig = SIGNATURE_ITEMS[key];
  const hvezd = acctStars(key);
  const odemcen = heroUnlockedAcc(key);
  const resp = acctRespect(key);
  const naMaximu = hvezd >= HERO_MAX_STARS;
  const need = naMaximu ? 1 : respectForStar(hvezd + 1, tierIdx);
  const tree = hd.tree;
  const mains = tree.filter(x => x.main);

  const stromy = mains.map(m => `<div class="nh-strom">
      ${nahledUzelHtml(tree, m, false)}
      ${tree.filter(x => x.parent === m.key).map(x => nahledUzelHtml(tree, x, true)).join("")}
    </div>`).join("");

  return `<div class="nh-overlay" id="nh-overlay">
    <div class="nh-box" style="--tc:${tier.color}">
      <button class="nh-close" title="${tx("spol.zavrit")}">✕</button>
      <div class="nh-head">
        <img class="nh-portret" src="${heroPortraitURL(fkey, d)}" alt="">
        <div class="nh-hlava-txt">
          <div class="nh-name">${hd.name}</div>
          <div class="nh-rod" style="color:${def.color}">${def.name}
            <span class="tier-tag" style="color:${tier.color};border-color:${tier.color}66">${tier.name}</span></div>
          <div class="nh-trait">${darek.icon} <b>${trait.name}</b> — ${trait.desc}</div>
          ${sig ? `<div class="nh-sig">✦ signature: <b>${sig.name}</b>
            <span class="dim">(${sig.passive}: ${(sig.effs || []).map(e => effLine(e, e.val)).join(" · ")}) — ${tx("nah.sig.odemyka", { hvezd: SIG_STARS })}</span></div>` : ""}
          <div class="nh-stav">${odemcen
            ? `🔓 ${tx("nah.mas.ho")} · ♥${hvezd}${naMaximu ? " (" + tx("sin.maximum") + ")" : ` · ${resp}/${need} ${tx("nah.do.srdce", { hvezd: hvezd + 1 })}`}`
            : `🔒 ${tx("dar.zamceny")} · ${darek.icon} ${darek.name}: ${resp}/${need} ${tx("sin.k.odemceni")}`}</div>
        </div>
      </div>
      <p class="hint">${tx("nah.hint")}</p>
      <div class="nh-stromy">${stromy}</div>
    </div>
  </div>`;
}

// síň hrdinů (v0.27, vzhled v0.41): katalog celé strany jako mřížka karet.
// Portrét má rám podle tieru, odznak hvězd a pruh oddanosti — u zamčených
// k odemčení, u odemčených k další hvězdě (dřív se u nich neukazoval vůbec,
// takže hráč netušil, jak daleko je). Vlastní rod jde první.
function sinHtml(me) {
  const side = sideOfFaction(me.key);
  const wish = acctWishlist();
  const rody = FACTION_DEFS.filter(d => sideOfFaction(d.key) === side)
    .sort((a, b) => (b.key === me.key) - (a.key === me.key));
  const skupiny = rody.map(def => ({
    def,
    hrdinove: HERO_DEFS[def.key].map((hd, d) => {
      const key = def.key + ":" + d;
      const starter = d === (STARTER_IDX[def.key] ?? 0);
      const zivy = me.heroes.find(h => (h.srcKey || me.key) === def.key && h.defIdx === d);
      const odemcen = (def.key === me.key && starter) || heroUnlockedAcc(key);
      return { def, hd, d, key, starter, zivy, odemcen,
        tierIdx: heroTierOf(def.key, d),
        hvezd: zivy ? (zivy.stars || 0) : acctStars(key) };
    }),
  }));
  const pocet = skupiny.reduce((n, s) => n + s.hrdinove.length, 0);
  const odemk = skupiny.reduce((n, s) => n + s.hrdinove.filter(x => x.odemcen).length, 0);
  const plno = me.heroes.length >= HERO_MAX;

  let html = `<div class="sin-head">
    <div class="sin-side" style="color:${SIDES[side].color}">${SIDES[side].icon} ${SIDES[side].name}</div>
    <div class="sin-tally">
      <span title="${tx("sin.odemceni.tip")}">🔓 <b>${odemk}</b>/${pocet}</span>
      <span title="${tx("sin.nasazeno.tip")}">⚑ <b>${me.heroes.length}</b>/${HERO_MAX}</span>
      <span title="${tx("sin.prani.tip")}">☆ <b>${wish.length}</b>/${WISHLIST_MAX}</span>
    </div>
  </div>
  <p class="hint">${tx("sin.hint")}</p>`;

  for (const { def, hrdinove } of skupiny) {
    const md = hrdinove.filter(x => x.odemcen).length;
    html += `<div class="sin-fkey" style="color:${def.color}">${def.name}
      ${def.key === me.key ? `<span class="sin-mine">${tx("sin.tvuj.rod")}</span>` : ""}
      <span class="sin-fcount">${md}/${hrdinove.length}</span></div>
      <div class="sin-grid">${hrdinove.map(sinKartaHtml.bind(null, wish, plno)).join("")}</div>`;
  }
  return html + (sinNahled ? nahledHrdinyHtml(sinNahled) : "");
}

function sinKartaHtml(wish, plno, x) {
  const { def, hd, d, key, starter, zivy, odemcen, tierIdx, hvezd } = x;
  const tier = HERO_TIERS[tierIdx];
  const darek = giftNameOf(giftGroupOfHero(key));
  const trait = HERO_TRAITS[hd.trait];
  const resp = acctRespect(key);
  const naMaximu = hvezd >= HERO_MAX_STARS;
  const need = naMaximu ? 1 : respectForStar(hvezd + 1, tierIdx);
  const pct = naMaximu ? 100 : Math.min(100, Math.round(resp / need * 100));
  const akce = zivy
    ? `<span class="sin-badge in">⚑ ${tx("sin.v.poli", { uroven: zivy.level })}</span>`
    : odemcen
      ? `<button class="btn-deploy" data-fkey="${def.key}" data-def="${d}"${
          plno ? ` disabled title="${tx("sin.plno", { max: HERO_MAX })}"` : ""}>⚑ ${tx("vyb.nasadit")}</button>`
      : `<span class="sin-badge lock">🔒 ${darek.icon} ${darek.name}</span>`;
  return `<div class="sin-card${odemcen ? "" : " locked"}${zivy ? " deployed" : ""}"
      style="--tc:${tier.color}" data-nahled="${key}"
      title="${tx("sin.detail.tip")}">
    <button class="sin-wish${wish.includes(key) ? " on" : ""}" data-key="${key}"
      title="${wish.includes(key) ? tx("sin.prani.pryc")
        : tx("sin.prani.pridat", { max: WISHLIST_MAX })}">${wish.includes(key) ? "★" : "☆"}</button>
    <div class="sin-face">
      <img src="${heroPortraitURL(def.key, d)}" alt="">
      ${odemcen ? (hvezd ? `<span class="sin-stars">★ ${hvezd}</span>` : "")
        : `<span class="sin-locked">🔒</span>`}
    </div>
    <div class="sin-main">
      <div class="sin-name">${starter ? "⚑ " : ""}${hd.name}
        <span class="tier-tag" style="color:${tier.color};border-color:${tier.color}66">${tier.name}</span></div>
      <div class="sin-trait" title="${trait.desc}">${darek.icon} ${trait.name}<span class="dim"> — ${trait.desc}</span></div>
      <div class="sin-prog" title="${naMaximu ? tx("sin.max.tip")
        : tx("sin.prog.tip", { darek: darek.name, zaKus: GIFT_RESPECT, need, hvezda: hvezd + 1 })}">
        <div class="sin-bar"><div style="width:${pct}%"></div></div>
        <span class="sin-num">${naMaximu ? "★ " + tx("sin.maximum")
          : `🎁 ${resp}/${need} ${odemcen ? tx("sin.do.hvezdy", { hvezda: hvezd + 1 }) : tx("sin.k.odemceni")}`}</span>
      </div>
      <div class="sin-act">${akce}</div>
    </div>
  </div>`;
}

// Náhled se otevírá i z DOMOVSKÉ síně, kde běží vlastní překreslení, proto
// je vazba zvlášť a bere si překreslovací funkci zvenčí.
function bindSinNahled(root, prekresli) {
  root.querySelectorAll(".sin-card[data-nahled]").forEach(c => c.addEventListener("click", e => {
    if (e.target.closest("button")) return;   // hvězdička a „Nasadit" mají své
    sinNahled = c.dataset.nahled;
    prekresli();
  }));
  const zav = () => { sinNahled = null; prekresli(); };
  const box = root.querySelector("#nh-overlay");
  if (box) {
    box.addEventListener("click", e => { if (e.target === box) zav(); });
    const x = box.querySelector(".nh-close");
    if (x) x.addEventListener("click", zav);
  }
}

function bindSin(panel) {
  bindSinNahled(panel, updateHeroesPanel);
  panel.querySelectorAll(".btn-deploy").forEach(b => b.addEventListener("click", () => {
    deployHero(player(), b.dataset.fkey, parseInt(b.dataset.def, 10));
    updatePanels();
    updateHeroesPanel();
  }));
  panel.querySelectorAll(".sin-wish").forEach(b => b.addEventListener("click", () => {
    if (mp.active) mpWishlist(b.dataset.key);
    else { wishlistToggle(acct.local, b.dataset.key); saveLocalAccount(); }
    updateHeroesPanel();
  }));
}

// výchozí sestava (v0.27): preset složení armády pro útočné kolo
function presetRowHtml(me, h, i) {
  if (h.pos) return ""; // v poli nese skutečnou armádu
  const p = h.preset;
  if (presetOpen !== i) {
    return `<div class="preset-row"><a href="#" class="preset-open" data-hero="${i}">📋 ${tx("pre.sestava")}${
      p ? `: ${armyStr(p)}` : " — " + tx("pre.nastavit")}</a></div>`;
  }
  const v = p || { inf: 0, arch: 0, cav: 0 };
  return `<div class="preset-row">📋
    ${UNIT_KEYS.map(k => `${uDef(me, k).icon}<input type="number" min="0" class="preset-in" data-k="${k}" value="${v[k] || 0}">`).join(" ")}
    <button class="preset-save" data-hero="${i}">${tx("spol.ulozit")}</button>
    <button class="preset-clear" data-hero="${i}">✕</button></div>`;
}

function updateHeroesPanel() {
  const me = player();
  const panel = $("#heroes-panel");
  if (activeWin === "heroes") sirokeOkno("heroes");   // šířka podle záložky
  if (heroesTab === "sin") {
    panel.innerHTML = heroesTabsHtml(me) + sinHtml(me);
    bindHeroesTabs(panel);
    bindSin(panel);
    return;
  }
  let html = heroesTabsHtml(me) + me.heroes.map((h, i) => {
    const def = heroDef(me, i);
    const trait = heroTrait(me, i);
    const st = heroStats(me, i);
    const busy = heroBusy(me, i);
    const pct = Math.round(h.stamina / st.stamMax * 100);
    const hp = Math.round(h.hp ?? st.hpMax);
    const hpPct = Math.round(hp / st.hpMax * 100);
    const maxed = h.level >= HERO_MAX_LEVEL;
    const xpPct = maxed ? 100 : Math.round(h.xp / xpForLevel(h.level) * 100);
    const gear = ITEM_SLOT_KEYS.filter(s => h.equip[s]).length;
    let status, place = "";
    // obléhání: hrdina stojí na svém poli, ale je „zaneprázdněný" odpočtem
    // dalšího náběhu — proto se řeší dřív než obecné „na pochodu"
    const oblehani = me.marches.find(mm => mm.heroIdx === i && mm.kind === "siege");
    if (oblehani && h.pos) {
      const cil = G.tiles.get(oblehani.targetKey);
      status = `⚔ ${tx("hrd.obleha", { s: oblehani.ticksLeft })}`;
      place = `<div class="hero-trait">${tx("hrd.tabori")}
        <a href="#" class="focus-hero" data-hero="${i}" title="${tx("hrd.ukazat")}">📍 ${tileLabel(G.tiles.get(h.pos))}</a>
        · ${armyStr(h.army)}<br>${tx("hrd.dalsi.nabeh", { pole: tileLabel(cil), s: oblehani.ticksLeft })}
        <a href="#" class="turn-back" data-hero="${i}"
           title="${tx("hrd.zrusit.obleh.tip")}">✕ ${tx("hrd.zrusit.obleh")}</a></div>`;
    }
    else if (busy) {
      status = "🏃 " + tx("hrd.na.pochodu");
      const m = me.marches.find(mm => mm.heroIdx === i);
      if (m && (m.kind === "attack" || m.kind === "return")) {
        const t = G.tiles.get(m.targetKey);
        place = `<div class="hero-trait">${tx(m.kind === "attack" ? "hrd.tahne" : "hrd.vraci", { pole: tileLabel(t), s: m.ticksLeft })}${m.returnAfter ? " · " + tx("hrd.najezd") + " ↩" : ""} ·
          <a href="#" class="turn-back" data-hero="${i}"
             title="${tx("hrd.obratit.tip")}">↩ ${tx("hrd.obratit")}</a></div>`;
      }
    }
    else if (h.cooldown > 0) status = `🛌 ${tx("hrd.zotavuje", { s: h.cooldown })}`;
    else if (h.guard) status = "🛡 " + tx("hrd.straz");
    else if (h.pos) status = "⚑ " + tx("hrd.v.poli");
    else status = h.stamina < 30 ? "😮‍💨 " + tx("hrd.odpociva") : "✔ " + tx("hrd.pripraven");
    // pozice: obléhající má vlastní řádek výše, tenhle blok by ho přepsal
    if (h.pos && !oblehani) {
      const t = G.tiles.get(h.pos);
      const canAct = !busy && h.cooldown <= 0;
      const pinned = heroPinned(me, i);
      const guardLink = h.guard
        ? `<a href="#" class="guard-toggle" data-hero="${i}" title="${tx("hrd.straz.konec.tip")}">🛡 ${tx("hrd.straz.konec")}</a>`
        : `<a href="#" class="guard-toggle" data-hero="${i}"
             title="${tx("hrd.straz.tip", { cena: GUARD_COST, odber: GUARD_DRAIN })}">🛡 ${tx("hrd.straz.kratce")}</a>`;
      let actions = "";
      if (canAct && pinned) {
        // ukotven příchozími posilami: pohyb až po jejich doručení / zrušení
        const eta = Math.max(...me.marches
          .filter(m => m.kind === "reinforce" && m.targetKey === h.pos)
          .map(m => m.ticksLeft));
        const cil = h.rozkaz ? G.tiles.get(h.rozkaz.targetKey) : null;
        actions = `<span class="pinned-note" title="${tx("hrd.pin.tip")}">📦 ${tx("hrd.posily.cesta", { s: eta })}${cil ? ` → ⚔ ${tileLabel(cil)}` : ""}</span>
          <a href="#" class="cancel-conv" data-hero="${i}"
             title="${tx("hrd.zrusit.posily.tip")}">✕ ${tx("hrd.zrusit.posily")}</a> ${guardLink}`;
      } else if (canAct) {
        actions = `<a href="#" class="recall" data-hero="${i}">↩ ${tx("hrd.odvolat")}</a> ${guardLink}`;
      }
      place = `<div class="hero-trait">${tx("hrd.stoji")}:
        <a href="#" class="focus-hero" data-hero="${i}" title="${tx("hrd.ukazat")}">📍 ${tileLabel(t)}</a>
        · ${armyStr(h.army)}
        ${actions}</div>`;
    }
    return `<div class="hero-row${busy ? " busy" : ""}">
      <img class="hero-face hero-open" data-hero="${i}" src="${heroPortraitURL(me.key, h.defIdx)}"
        alt="" title="${def.name} — ${tx("hrd.otevrit")}">
      <div class="hero-body">
      <div class="hero-head">
        <span class="hero-name"><a href="#" class="hero-open" data-hero="${i}">${def.name}</a>
          <span class="hero-lvl">${tx("spol.ur")} ${h.level}</span>${h.skillPts > 0
            ? `<a href="#" class="skill-pts hero-open" data-hero="${i}"
                 title="${tx("hrd.body.tip")}">＋${h.skillPts}</a>` : ""}</span>
        <span class="hero-status">${status}</span></div>
      <div class="hero-trait">${trait.name} — ${trait.desc} ·
        <a href="#" class="hero-open" data-hero="${i}">🎒 ${tx("spol.vybava")} ${gear}/6</a>${(() => {
          const u = heroDef(me, i).tree.find(s => s.ult);
          return u && (h.skills[u.key] || 0) >= u.max ? ` · <span class="ult-name">★ ${u.name}</span>` : "";
        })()}</div>
      ${place}
      <div class="hero-trait hero-stats-line"
        title="${tx("hrd.staty.tip")}">
        ❤ ${hp}/${st.hpMax} · ⚔ ${st.atk.toFixed(1)} · 🗡 ${st.dmg} · 🛡 ${st.def.toFixed(1)} · ⚡ ${st.speed}${st.spell > 0 ? ` · ✨ ${st.spell}` : ""}</div>
      <div class="hero-trait"
        title="${tx("hrd.armada.tip")}">
        🪖 ${(() => {
          // obléhací odpočet armádu nedrží (drží ji hrdina) — přeskočit
          const m = me.marches.find(mm => mm.heroIdx === i && mm.kind !== "siege");
          const army = m ? m.army : h.army;
          const n = Math.round(armyTotal(army));
          return n > 0 ? `${armyStr(army)} — ${n}/${st.cap} ${tx("spol.veleni")}`
            : tx("hrd.bez.armady", { cap: st.cap });
        })()}</div>
      <div class="hp-bar" title="${tx("hrd.hp.tip")}">
        <div class="hp-fill" style="width:${hpPct}%"></div></div>
      <div class="stam-bar"><div class="stam-fill" style="width:${pct}%"></div></div>
      <div class="xp-bar" title="${tx("spol.zkusenosti")}: ${maxed ? tx("hrd.max.uroven") : h.xp + " / " + xpForLevel(h.level)}">
        <div class="xp-fill" style="width:${xpPct}%"></div></div>
      ${presetRowHtml(me, h, i)}
      </div>
    </div>`;
  }).join("");
  if (me.heroes.length < HERO_MAX) {
    html += `<p class="hint">${tx("hrd.dalsiho")}</p>`;
  }
  panel.innerHTML = html;
  bindHeroesTabs(panel);
  panel.querySelectorAll(".preset-open").forEach(a => a.addEventListener("click", e => {
    e.preventDefault();
    presetOpen = parseInt(a.dataset.hero, 10);
    updateHeroesPanel();
  }));
  panel.querySelectorAll(".preset-save").forEach(b => b.addEventListener("click", () => {
    const i = parseInt(b.dataset.hero, 10);
    const row = b.closest(".preset-row");
    const army = { inf: 0, arch: 0, cav: 0 };
    row.querySelectorAll(".preset-in").forEach(inp => army[inp.dataset.k] = Math.max(0, parseInt(inp.value, 10) || 0));
    setHeroPreset(player(), i, army);
    presetOpen = -1;
    updateHeroesPanel();
  }));
  panel.querySelectorAll(".preset-clear").forEach(b => b.addEventListener("click", () => {
    setHeroPreset(player(), parseInt(b.dataset.hero, 10), null);
    presetOpen = -1;
    updateHeroesPanel();
  }));
  panel.querySelectorAll(".recall").forEach(a => a.addEventListener("click", e => {
    e.preventDefault();
    startRecall(player(), parseInt(a.dataset.hero, 10));
    forceTilePanel();
  }));
  panel.querySelectorAll(".cancel-conv").forEach(a => a.addEventListener("click", e => {
    e.preventDefault();
    cancelReinforce(player(), parseInt(a.dataset.hero, 10));
    forceTilePanel();
  }));
  panel.querySelectorAll(".turn-back").forEach(a => a.addEventListener("click", e => {
    e.preventDefault();
    turnBackMarch(player(), parseInt(a.dataset.hero, 10));
    forceTilePanel();
  }));
  panel.querySelectorAll(".hero-open").forEach(a => a.addEventListener("click", e => {
    e.preventDefault();
    openHeroWindow(parseInt(a.dataset.hero, 10));
  }));
  panel.querySelectorAll(".guard-toggle").forEach(a => a.addEventListener("click", e => {
    e.preventDefault();
    toggleGuard(player(), parseInt(a.dataset.hero, 10));
    forceTilePanel();
  }));
  panel.querySelectorAll(".focus-hero").forEach(a => a.addEventListener("click", e => {
    e.preventDefault();
    const h = player().heroes[parseInt(a.dataset.hero, 10)];
    if (!h.pos) return;
    const t = G.tiles.get(h.pos);
    const p = tileToPixel(t.q, t.r);
    camera.x = p.x; camera.y = p.y;
    selectedKey = h.pos;
    forceTilePanel();
  }));
}

// ---------- Okno hrdiny (seznam vlevo, velký střed, taby vpravo) ----------
let heroWinIdx = null;
let heroWinSig = null;
let heroWinTab = "stats";  // stats | skills | equip | forge
let hwSkillSel = null;     // vybraný uzel souhvězdí dovedností
let hwFxOpen = false;      // je otevřený panel „Aktuální efekty"?
let hwSlotSel = null;      // vybraný slot výbavy (filtr inventáře)
let hwItemSel = null;      // vybraný předmět k porovnání
let hwForgeSel = null;     // kovárna: předmět k posílení
let hwForgeMats = [];      // kovárna: vybraný materiál (ids)
let hwLastTab = null;      // poslední vykreslený tab (animace přechodu)

function openHeroWindow(i, tab = null) {
  heroWinIdx = i;
  if (tab) heroWinTab = tab;
  hwSkillSel = null; hwSlotSel = null; hwItemSel = null; hwFxOpen = false;
  hwForgeSel = null; hwForgeMats = [];
  heroWinSig = null;
  renderHeroWindow();
  $("#hero-overlay").classList.remove("hidden");
}

function closeHeroWindow() {
  heroWinIdx = null;
  $("#hero-overlay").classList.add("hidden");
}

// podpis okna — překreslit jen při skutečné změně, ať klikání nic nepřeruší
function heroWindowSig(me, h) {
  const canRespec = (me.freeRespecs > 0
    || me.resources.gold >= heroSpentPoints(h) * RESPEC_GOLD_PER_POINT) ? 1 : 0;
  return [heroWinIdx, heroWinTab, hwSkillSel, hwSlotSel, hwItemSel, me.freeRespecs || 0,
    hwForgeSel, hwForgeMats.join(";"), hwFxOpen ? 1 : 0,
    JSON.stringify(invFiltr), // filtry inventáře (v0.39)
    h.level, h.stars || 0, acctRespect(me.key + ":" + h.defIdx), Math.floor(h.xp), Math.round(h.hp ?? -1),
    ITEM_SLOT_KEYS.map(s => h.equip[s] ? h.equip[s].id + "*" + (h.equip[s].stars || 0) : 0).join(","),
    me.items.map(it => it.id + "*" + (it.stars || 0)).join(","),
    me.heroes.map(x => x.level + ":" + x.skillPts).join(","),
    h.skillPts, JSON.stringify(h.skills), canRespec,
    // v0.31: úroveň/⚡ Prstenu odemykají Výcvik mysli a Druhý dech na kartě
    me.ring ? me.ring.level : 0, me.ring ? me.ring.ap : 0,
    Math.floor(h.stamina / 5), h.zakladna || "",
    darkuMam(heroKeyFor(me, h))].join("|");   // sklad dárků (v0.43)
}

// ---------- Strom dovedností (podle předlohy RtW) ----------
// Rozmístění uzlů počítá orbitPos() přímo ze struktury stromu (4 hlavní
// dovednosti na prstencích, pod každou dvě větve) — viz constellationHtml níže.

const EFF_ICONS = { stackAtk: "📈", stackDef: "🧱", stunChance: "💫", stunImmune: "🛑",
  roundDmg: "⏱", roundArmy: "📯", avoidCharge: "🛡", avoidChance: "🛡", followUp: "🔁",
  atk: "⚔", def: "🛡", dmg: "🗡", hp: "❤", spell: "✨", ward: "🔮",
  spd: "⚡", speed: "🥾", stamCost: "👣", regen: "⏳", stam: "⏳", strike: "💥",
  aura: "😨", holdDef: "🏰", heal: "⚕", xp: "📖", gold: "🪙", cap: "⚑",
  convoy: "📦", structAtk: "🪓", rally: "📯", fastReturn: "↩", winStam: "🔥",
  noCooldown: "♻", instantReturn: "🌀", ignoreDef: "🎯",
  slowEnemy: "🐌", shred: "🩸", harvest: "🌾", roundHeal: "⚕", madness: "🌀",
  pursuit: "🎯", cauter: "🔥" };

// číslo efektu česky: zaokrouhlené na 2 desetinná místa, s desetinnou čárkou
// (hodnoty za bod jsou od Auditu 2 většinou desetinné)
function effNum(v) {
  return String(Math.round(v * 100) / 100).replace(".", ",");
}

// text efektu pro daný typ a součtovou hodnotu (rank × val)
function effText(type, v) {
  v = effNum(v);
  // ETAPA 12b: klíč slovníku = `ef.<typ>`, hodnota jde dovnitř jako {v}.
  // Vlastní tabulka tady být nemusí — typů je čtyřicet a slovník je stejně
  // rychlá mapa; navíc se tím překlad drží na jednom místě se zbytkem UI.
  if (type === "avoidCharge") return tx(v === "1" ? "ef.avoidCharge.1" : "ef.avoidCharge", { v });
  const k = "ef." + type;
  return znaKlic(k) ? tx(k, { v }) : `${type} ${v}`;
}

// kolová aktivka: text nese i časování a počet cílů (podle předlohy RtW)
function roundEffText(e, v) {
  const t = e.timing || {};
  const kdy = t.round ? tx("ef.kolo", { n: t.round }) : (t.every ? tx("ef.kazde", { n: t.every }) : tx("ef.kazde.kolo"));
  if (e.type === "roundArmy") return `⏱ ${kdy} — ${tx("ef.roundArmy", { v: effNum(v) })}`;
  if (e.type === "roundHeal") return `⏱ ${kdy} — ⚕ ${tx("ef.roundHeal", { v: effNum(v) })}`;
  const cile = (e.targets || 1) > 1 ? tx("ef.cile", { n: e.targets }) + " " : "";
  return `⏱ ${kdy} — ${cile}${tx("ef.roundDmg", { v: effNum(v) })}`;
}

// text podmínkového efektu s tagem [typ jednotky] / [proti frakci]
function condEffText(e, v) {
  if (e.cond && e.cond.unit) {
    const u = UNIT_TYPES[e.cond.unit];
    return `[${u.icon} ${u.name}] ${tx("ef.unitDmg", { v: effNum(v) })}`;
  }
  if (e.cond && e.cond.vsFaction) {
    const f = FACTION_DEFS.find(x => x.key === e.cond.vsFaction);
    const inner = e.type === "vsDmg" ? tx("ef.vsDmg", { v: effNum(v) }) : effText(e.type, v);
    return `${tx("ef.proti", { rod: f ? f.name : e.cond.vsFaction })} ${inner}`;
  }
  return effText(e.type, v);
}

// jednotný řádek efektu (obyčejný, podmínkový i kolová aktivka)
function effLine(e, v) {
  if (e.type === "roundDmg" || e.type === "roundArmy") return roundEffText(e, v);
  return e.cond ? condEffText(e, v) : effText(e.type, v);
}

function skillEffs(s) { return s.effs || [s.eff]; }
function skillIcon(s) { return s.ult ? "★" : (EFF_ICONS[skillEffs(s)[0].type] || "✦"); }

// ---------- Unikátní kresby skillů (Fáze 3) ----------
// každá dovednost má vlastní zlatou pečeť: deterministické SVG generované
// z klíče a jména (žádné dva skilly nesdílí ikonu) — tahy zrcadlené podle
// svislé osy působí jako runa/emblém, ultimátka má hvězdový střed
const skillArtCache = {};
function skillArtURL(s) {
  const seedStr = s.key + "|" + s.name;
  if (skillArtCache[seedStr]) return skillArtCache[seedStr];
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const rnd = () => {
    h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };
  const F = x => x.toFixed(1);
  const gold = "#e8c56a", dim = "#8d7440";
  let el = "";
  // vnější kruh, nebo jen oblouk
  const rO = 15 + rnd() * 3;
  if (rnd() < 0.5) {
    el += `<circle cx="20" cy="20" r="${F(rO)}" fill="none" stroke="${dim}" stroke-width="1.1"/>`;
  } else {
    const a0 = rnd() * Math.PI * 2, sw = Math.PI * (0.9 + rnd() * 0.8);
    el += `<path d="M${F(20 + rO * Math.cos(a0))} ${F(20 + rO * Math.sin(a0))} A${F(rO)} ${F(rO)} 0 ${sw > Math.PI ? 1 : 0} 1 ${F(20 + rO * Math.cos(a0 + sw))} ${F(20 + rO * Math.sin(a0 + sw))}" fill="none" stroke="${dim}" stroke-width="1.1"/>`;
  }
  // zrcadlené paprsky ze středu, konce s jiskrou
  const rays = 2 + Math.floor(rnd() * 2);
  for (let i = 0; i < rays; i++) {
    const ang = -Math.PI / 2 + (rnd() - 0.2) * 1.6;
    const r1 = 3 + rnd() * 4, r2 = 10 + rnd() * 7;
    const ax = 20 + Math.cos(ang) * r1, ay = 20 + Math.sin(ang) * r1;
    const bx = 20 + Math.cos(ang) * r2, by = 20 + Math.sin(ang) * r2;
    el += `<line x1="${F(ax)}" y1="${F(ay)}" x2="${F(bx)}" y2="${F(by)}" stroke="${gold}" stroke-width="1.6" stroke-linecap="round"/>`
        + `<line x1="${F(40 - ax)}" y1="${F(ay)}" x2="${F(40 - bx)}" y2="${F(by)}" stroke="${gold}" stroke-width="1.6" stroke-linecap="round"/>`;
    if (rnd() < 0.6) {
      el += `<circle cx="${F(bx)}" cy="${F(by)}" r="1.3" fill="${gold}"/>`
          + `<circle cx="${F(40 - bx)}" cy="${F(by)}" r="1.3" fill="${gold}"/>`;
    }
  }
  // střed: ultimátka = hvězda, jinak kosočtverec / kroužek
  if (s.ult) {
    el += `<path d="M20 11.5 L22.5 17.5 L28.5 20 L22.5 22.5 L20 28.5 L17.5 22.5 L11.5 20 L17.5 17.5 Z" fill="${gold}"/>`;
  } else if (rnd() < 0.5) {
    el += `<rect x="17.2" y="17.2" width="5.6" height="5.6" transform="rotate(45 20 20)" fill="${gold}"/>`;
  } else {
    el += `<circle cx="20" cy="20" r="2.6" fill="none" stroke="${gold}" stroke-width="1.6"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">${el}</svg>`;
  return (skillArtCache[seedStr] = "data:image/svg+xml," + encodeURIComponent(svg));
}

// ---------- Ikonky předmětů (v0.39) ----------
// Každý DRUH kusu (itemZaklad — kmen jména) má vlastní deterministickou
// ikonku: silueta se řídí VÝZNAMEM jména (kladivo vypadá jako kladivo,
// pavéza jako vysoký štít), detaily a proporce losuje hash druhu, barvy
// určuje rarita. Dvě „Čepele z jam" tak vypadají stejně, „Popelný sekáč"
// jinak. Kešuje se podle (druh|rarita).
const itemArtCache = {};
function itemArtURL(it) {
  const zaklad = itemZaklad(it);
  const klic = zaklad + "|" + it.slot + "|" + it.rarity;
  if (itemArtCache[klic]) return itemArtCache[klic];
  let h = 2166136261;
  for (let i = 0; i < zaklad.length; i++) {
    h ^= zaklad.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  const rnd = () => {
    h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0;
    return h / 4294967296;
  };
  const F = x => (Math.round(x * 10) / 10);
  const akcent = RARITIES[it.rarity].color;
  const ocel = "#a7b6cc", telo = "#232c3b", stin = "#161d29";
  const jm = zaklad.toLowerCase();
  const ma = (...slova) => slova.some(s => jm.includes(s));
  let el = `<circle cx="20" cy="20" r="17" fill="${akcent}" opacity="0.09"/>`;
  const obrys = `fill="${telo}" stroke="${akcent}" stroke-width="1.4" stroke-linejoin="round"`;
  const detail = `fill="none" stroke="${ocel}" stroke-width="1" stroke-linecap="round"`;
  // POZOR: data-URI SVG je přísné XML — duplicitní atribut (např. ${detail}
  // + druhý stroke v témže tagu) shodí CELÝ obrázek; akcentní čáry mají
  // proto vlastní sadu atributů místo přepisování
  const detailA = `fill="none" stroke="${akcent}" stroke-width="1" stroke-linecap="round"`;

  if (it.slot === "weapon") {
    if (ma("luk")) {                                    // luk: oblouk + šíp
      const proh = 9 + rnd() * 3;
      el += `<path d="M13 7 Q${F(13 + proh)} 20 13 33" fill="none" stroke="${akcent}" stroke-width="1.8" stroke-linecap="round"/>
        <line x1="13" y1="7" x2="13" y2="33" stroke="${ocel}" stroke-width="0.7"/>
        <line x1="9" y1="20" x2="${F(24 + rnd() * 4)}" y2="20" stroke="${ocel}" stroke-width="1.2"/>
        <path d="M${F(28 + rnd() * 3)} 20 l-4 -2.4 v4.8 Z" fill="${akcent}"/>`;
    } else if (ma("sek")) {                             // sekera/sekáč
      const sirka = 8 + rnd() * 4, dvoji = rnd() < 0.35;
      el += `<line x1="14" y1="33" x2="26" y2="9" stroke="#6b563a" stroke-width="2.2"/>
        <path d="M26 9 q${F(sirka)} ${F(2 + rnd() * 3)} ${F(sirka * 0.7)} ${F(10 + rnd() * 2)} q${F(-sirka * 0.55)} -3 -8.5 -4 Z" ${obrys}/>`
        + (dvoji ? `<path d="M26 9 q${F(-sirka)} ${F(2 + rnd() * 3)} ${F(-sirka * 0.7)} ${F(10 + rnd() * 2)} q${F(sirka * 0.55)} -3 8.5 -4 Z" ${obrys}/>` : "");
    } else if (ma("kladivo", "palcát", "drtič", "kyj")) { // tupá váha
      const hlava = 6 + rnd() * 3;
      el += `<line x1="15" y1="34" x2="24" y2="12" stroke="#6b563a" stroke-width="2.2"/>`;
      if (ma("palcát", "drtič") && rnd() < 0.7) {       // ostnatá koule
        el += `<circle cx="25" cy="10.5" r="${F(hlava * 0.8)}" ${obrys}/>`;
        for (let i = 0; i < 6; i++) {
          const a = rnd() * Math.PI * 2;
          el += `<line x1="${F(25 + Math.cos(a) * hlava * 0.7)}" y1="${F(10.5 + Math.sin(a) * hlava * 0.7)}"
            x2="${F(25 + Math.cos(a) * (hlava * 0.7 + 3.4))}" y2="${F(10.5 + Math.sin(a) * (hlava * 0.7 + 3.4))}"
            stroke="${akcent}" stroke-width="1.6" stroke-linecap="round"/>`;
        }
      } else {                                          // hranaté kladivo
        el += `<rect x="${F(25 - hlava)}" y="${F(10.5 - hlava * 0.55)}" width="${F(hlava * 2)}" height="${F(hlava * 1.1)}"
          rx="1.5" transform="rotate(${F(-14 + rnd() * 8)} 25 10.5)" ${obrys}/>`;
      }
    } else if (ma("kopí", "oštěp")) {                   // kopí
      el += `<line x1="12" y1="34" x2="27" y2="10" stroke="#6b563a" stroke-width="1.8"/>
        <path d="M27 10 l${F(2 + rnd() * 2)} -5.5 l${F(2 + rnd() * 2)} 5.5 l-${F(2 + rnd())} 4.5 h-2 Z" ${obrys}/>
        <line x1="${F(20 + rnd() * 3)}" y1="${F(22 - rnd() * 3)}" x2="${F(17 + rnd() * 3)}" y2="${F(26 - rnd() * 3)}" stroke="${akcent}" stroke-width="1"/>`;
    } else if (ma("hůl")) {                             // hůl s ohniskem
      el += `<path d="M17 35 q${F(-3 + rnd() * 6)} -12 2 -22" fill="none" stroke="#6b563a" stroke-width="2"/>
        <circle cx="20" cy="10" r="${F(3.4 + rnd() * 1.4)}" fill="${stin}" stroke="${akcent}" stroke-width="1.4"/>
        <circle cx="20" cy="10" r="1.4" fill="${akcent}"/>`;
    } else {                                            // čepel (meč/tesák)
      const kratky = ma("tesák"), delka = kratky ? 15 : 20 + rnd() * 3;
      const sirka = kratky ? 4.5 : 2.8 + rnd() * 1.6;
      const kriv = (rnd() - 0.5) * (kratky ? 2 : 5);
      el += `<path d="M${F(14 - sirka / 2)} ${F(28 - 0)} Q${F(20 + kriv)} ${F(28 - delka * 0.55)} ${F(14 + delka * 0.62)} ${F(28 - delka)}
          L${F(15 + delka * 0.66)} ${F(28 - delka + 2.4)} Q${F(21 + kriv)} ${F(28 - delka * 0.45)} ${F(14 + sirka / 2)} 28 Z" ${obrys}/>
        <line x1="${F(11.4)}" y1="${F(30.4)}" x2="${F(17)}" y2="${F(25)}" stroke="${ocel}" stroke-width="2"/>
        <line x1="10" y1="34" x2="13.4" y2="30.6" stroke="#6b563a" stroke-width="2.4"/>
        <circle cx="9" cy="35" r="1.5" fill="${akcent}"/>`;
    }
  } else if (it.slot === "shield") {
    if (ma("pavéza", "zeď")) {                          // vysoký štít
      el += `<rect x="12.5" y="7" width="15" height="26" rx="${F(2 + rnd() * 2)}" ${obrys}/>
        <line x1="20" y1="9" x2="20" y2="31" ${detail}/>`
        + (rnd() < 0.7 ? `<rect x="15.5" y="${F(11 + rnd() * 4)}" width="9" height="${F(4 + rnd() * 3)}" fill="${stin}" stroke="${akcent}" stroke-width="0.8"/>` : "");
    } else if (ma("puklíř", "terč")) {                  // kulatý štít
      el += `<circle cx="20" cy="20" r="${F(11 + rnd() * 2)}" ${obrys}/>
        <circle cx="20" cy="20" r="${F(3.4 + rnd() * 1.6)}" fill="${stin}" stroke="${akcent}" stroke-width="1.2"/>`;
      const nytu = 4 + Math.floor(rnd() * 4);
      for (let i = 0; i < nytu; i++) {
        const a = (i / nytu) * Math.PI * 2 + rnd() * 0.4;
        el += `<circle cx="${F(20 + Math.cos(a) * 8)}" cy="${F(20 + Math.sin(a) * 8)}" r="0.9" fill="${ocel}"/>`;
      }
    } else {                                            // kapkovitý štít
      el += `<path d="M20 6 Q${F(29 + rnd() * 2)} 8 ${F(28 + rnd())} 17 Q${F(27 + rnd())} 28 20 34 Q${F(13 - rnd())} 28 ${F(12 - rnd())} 17 Q${F(11 - rnd() * 2)} 8 20 6 Z" ${obrys}/>`
        + (rnd() < 0.5 ? `<path d="M15 15 L20 ${F(19 + rnd() * 3)} L25 15" ${detailA}/>`
          : `<line x1="20" y1="9" x2="20" y2="31" ${detailA}/>`);
    }
  } else if (it.slot === "armor") {
    if (ma("roucho", "plášť", "šat", "kytlice", "vesta", "kožešin")) {  // splývavý oděv
      el += `<path d="M14 9 L20 ${F(11 + rnd() * 2)} L26 9 L${F(29 + rnd() * 2)} 33 L${F(22 + rnd() * 2)} ${F(30 + rnd() * 3)} L20 33 L${F(18 - rnd() * 2)} ${F(30 + rnd() * 3)} L${F(11 - rnd() * 2)} 33 Z" ${obrys}/>
        <path d="M17 12 q3 3 6 0" ${detail}/>
        <line x1="${F(16 + rnd() * 2)}" y1="16" x2="${F(15 + rnd() * 2)}" y2="30" ${detail} opacity="0.6"/>
        <line x1="${F(23 + rnd() * 2)}" y1="16" x2="${F(24 + rnd() * 2)}" y2="30" ${detail} opacity="0.6"/>`;
    } else {                                            // kyrys / kroužkovka
      el += `<path d="M13 10 L17 8 Q20 10 23 8 L27 10 L${F(28 + rnd() * 2)} 16 L26 18 L26 ${F(27 + rnd() * 2)} Q20 ${F(31 + rnd() * 2)} 14 ${F(27 + rnd() * 2)} L14 18 L${F(12 - rnd() * 2)} 16 Z" ${obrys}/>`;
      if (ma("kroužk")) {
        for (let y = 0; y < 4; y++) for (let x = 0; x < 3; x++)
          el += `<circle cx="${F(16.5 + x * 3.4 + (y % 2) * 1.7)}" cy="${F(14 + y * 3.6)}" r="1.1" ${detail} opacity="0.75"/>`;
      } else {
        el += `<line x1="20" y1="11" x2="20" y2="29" ${detailA}/>
          <path d="M15 ${F(15 + rnd() * 3)} h10 M15 ${F(21 + rnd() * 3)} h10" ${detail} opacity="0.7"/>`;
      }
    }
  } else if (it.slot === "helmet") {
    if (ma("diadém", "koruna", "čelenka", "vavřín")) {  // koruna/čelenka
      const hrotu = 3 + Math.floor(rnd() * 2);
      let spicky = "";
      for (let i = 0; i <= hrotu; i++) {
        const x = 12 + (16 / hrotu) * i;
        spicky += `L${F(x - 8 / hrotu)} ${F(18 + rnd())} L${F(x)} ${F(11 - rnd() * 3)} `;
      }
      el += `<path d="M12 24 L12 ${F(18 + rnd())} ${spicky} L28 24 Z" ${obrys}/>
        <circle cx="20" cy="${F(21 + rnd())}" r="1.3" fill="${akcent}"/>`;
    } else if (ma("kukla", "kapuce", "kápě", "čapka")) { // kápě
      el += `<path d="M20 7 Q${F(30 + rnd() * 2)} 10 28 22 Q${F(27 + rnd())} 30 24 32 L16 32 Q${F(13 - rnd())} 30 12 22 Q${F(10 - rnd() * 2)} 10 20 7 Z" ${obrys}/>
        <path d="M16 20 Q20 ${F(24 + rnd() * 3)} 24 20 L24 28 Q20 30 16 28 Z" fill="${stin}"/>`;
    } else {                                            // přilba (rohatá / hladká)
      el += `<path d="M12 22 Q12 9 20 9 Q28 9 28 22 L28 26 L24 26 L24 20 L16 20 L16 26 L12 26 Z" ${obrys}/>
        <line x1="20" y1="20" x2="20" y2="27" stroke="${ocel}" stroke-width="1.6"/>`;
      if (ma("rohat", "maska", "lebka", "děs"))
        el += `<path d="M12 18 Q${F(6 - rnd() * 2)} 14 ${F(8 - rnd() * 2)} ${F(7 + rnd() * 2)} Q11 12 13.5 15 Z" ${obrys}/>
          <path d="M28 18 Q${F(34 + rnd() * 2)} 14 ${F(32 + rnd() * 2)} ${F(7 + rnd() * 2)} Q29 12 26.5 15 Z" ${obrys}/>`;
      else if (rnd() < 0.5)
        el += `<path d="M14 12 Q20 ${F(6 - rnd() * 2)} 26 12" ${detailA}/>`;
    }
  } else if (it.slot === "boots") {
    const vysoke = ma("jezdeck", "toulavé", "škorně");
    const vyska = vysoke ? 9 + rnd() * 2 : 15 + rnd() * 2;
    el += `<path d="M15 ${F(vyska)} L22 ${F(vyska)} L22 24 L29 27 Q30 30 28 31 L15 31 Z" ${obrys}/>
      <line x1="15" y1="${F(vyska + 3)}" x2="22" y2="${F(vyska + 3)}" ${detail}/>`;
    if (ma("okovan", "okované")) el += `<path d="M24 26 L29 28" stroke="${akcent}" stroke-width="2" stroke-linecap="round"/>`;
    if (ma("mokasín", "střevíc")) el += `<path d="M16 ${F(vyska + 6)} l4 2 M16 ${F(vyska + 9)} l4 2" ${detailA}/>`;
    if (rnd() < 0.5) el += `<circle cx="${F(17 + rnd() * 3)}" cy="${F(vyska + 6 + rnd() * 4)}" r="0.9" fill="${ocel}"/>`;
  } else {                                              // gloves
    if (ma("dráp", "spár", "stahovací")) {              // pařáty
      el += `<path d="M14 30 L14 16 Q14 12 17 12 L24 12 Q27 13 27 17 L27 24 Z" ${obrys}/>`;
      for (let i = 0; i < 3; i++)
        el += `<path d="M${F(17 + i * 4)} 12 q${F(1 + rnd())} -5 ${F(3 + rnd())} -4 q-1 2.5 -1.4 4.6 Z" fill="${akcent}"/>`;
    } else {                                            // rukavice/latnice
      el += `<path d="M14 31 L14 15 Q14 11 18 11 L24 11 Q27 11 27 15 L27 22 Q27 26 23 26 L18 26 Z" ${obrys}/>
        <rect x="13" y="27" width="15" height="4.5" rx="1.4" fill="${stin}" stroke="${akcent}" stroke-width="1.1"/>`;
      if (ma("latnice", "pěstnice", "kamenné"))
        el += `<path d="M16 14 h9 M16 17.5 h10 M16 21 h10" ${detailA} opacity="0.85"/>`;
      else el += `<path d="M18 11 v8 M22 11 v8" ${detail} opacity="0.6"/>`;
    }
  }
  // signature: zlatá jiskra v rohu přímo v ikoně
  if (it.sig) el += `<path d="M31 6 L32.3 9.2 L35.5 10.5 L32.3 11.8 L31 15 L29.7 11.8 L26.5 10.5 L29.7 9.2 Z" fill="#ffd455"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40">${el}</svg>`;
  return (itemArtCache[klic] = "data:image/svg+xml," + encodeURIComponent(svg));
}

// ---------- Orbitální rozvržení stromu (Audit 2, fáze C) ----------
// Čtyři hlavní dovednosti sedí na soustředných prstencích kolem středu,
// větve visí na krátkých ramenech směrem VEN od středu (branch určuje stranu).
// Vše se počítá ze struktury stromu (slot/parent/branch), takže je to
// deterministické — všichni hráči vidí stejné souhvězdí.
const ORBIT = {
  cx: 50, cy: 48,
  // hlavní dovednosti: prstenec (poloměr) a úhel ve stupních
  main: [{ r: 28, ang: 156 }, { r: 25, ang: 245 }, { r: 22, ang: 61 }, { r: 33, ang: 335 }],
  rings: [22, 28, 33],          // vykreslované prstence (poloměry)
  subR: 14, subSpread: 58,      // délka ramene větve a rozevření ve stupních
  clampX: [9, 91], clampY: [15, 84],
};

function orbitPos(tree) {
  const rad = a => a * Math.PI / 180;
  const cl = (v, [lo, hi]) => Math.max(lo, Math.min(hi, v));
  const pos = {}, ang = {};
  for (const s of tree) {
    if (!s.main) continue;
    const o = ORBIT.main[s.slot];
    pos[s.key] = { x: ORBIT.cx + o.r * Math.cos(rad(o.ang)),
                   y: ORBIT.cy + o.r * Math.sin(rad(o.ang)) };
    ang[s.key] = o.ang;
  }
  for (const s of tree) {
    if (!s.parent || !pos[s.parent]) continue;
    const a = ang[s.parent] + (s.branch ? ORBIT.subSpread : -ORBIT.subSpread);
    const p = pos[s.parent];
    pos[s.key] = {
      x: cl(p.x + ORBIT.subR * Math.cos(rad(a)), ORBIT.clampX),
      y: cl(p.y + ORBIT.subR * Math.sin(rad(a)), ORBIT.clampY),
    };
  }
  return pos;
}

// štítek časování dovednosti (podle předlohy: „⏱ Round 1“) — čistě zobrazovací
// odvození z typu prvního efektu, žádná data v HERO_DEFS
function skillTimingTag(s) {
  // roundHeal řeší obecná větev kolových aktivek níže (timing every/round)
  const e = skillEffs(s)[0] || {};
  if (e.type === "roundDmg" || e.type === "roundArmy") {
    const t = e.timing || {};
    return "⏱ " + (t.round ? tx("ef.kolo", { n: t.round }) : (t.every ? tx("ef.kazde", { n: t.every }) : tx("ef.kazde.kolo")));
  }
  // typ efektu → KLÍČ okamžiku; ikonu nese klíč sám, aby zůstala u významu
  const M = {
    spell: "cas.kolo", stackAtk: "cas.kolo", stackDef: "cas.kolo",
    unitDmg: "cas.kolo", vsDmg: "cas.kolo", dmg: "cas.kolo",
    followUp: "cas.uder", strike: "cas.pred.bojem", stunChance: "cas.zacatek.kola",
    avoidCharge: "cas.zasah", avoidChance: "cas.zasah",
    holdDef: "cas.obrana", aura: "cas.okoli", guardEff: "cas.straz",
    heal: "cas.vitezstvi", rally: "cas.vitezstvi", winStam: "cas.vitezstvi",
    gold: "cas.dobyti", speed: "cas.pochod", stamCost: "cas.pochod",
    convoy: "cas.pochod", fastReturn: "cas.pochod", instantReturn: "cas.pochod",
  };
  return tx(M[e.type] || "cas.trvale");
}

function constellationHtml(me, h) {
  const tree = heroDef(me, heroWinIdx).tree;
  const spent = heroSpentPoints(h);
  const pos = orbitPos(tree);
  // orbitální prstence pod uzly — rozsvítí se, když na nich stojí naučená
  // hlavní dovednost (kružnice se v roztaženém viewBoxu jeví jako elipsy)
  const ringLit = ORBIT.rings.map(r => tree.some(s =>
    s.main && (h.skills[s.key] || 0) > 0 && Math.abs(ORBIT.main[s.slot].r - r) < 0.5));
  const rings = ORBIT.rings.map((r, i) =>
    `<circle class="orbit-ring${ringLit[i] ? " active" : ""}" cx="${ORBIT.cx}" cy="${ORBIT.cy}" r="${r}"/>`).join("");
  // spojnice vedou od hlavní dovednosti k jejím větvím; rozsvítí se, jakmile
  // jsou naučené oba konce (po rozsvícených putují jiskry a čárkovaná linka)
  const lines = tree.filter(s => s.parent).map((s, li) => {
    const p = pos[s.parent], q = pos[s.key];
    const lit = (h.skills[s.parent] || 0) > 0 && (h.skills[s.key] || 0) > 0;
    let extra = "";
    if (lit) {
      const dur = (2 + li * 0.3).toFixed(1);
      extra = `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" class="lit-dash"/>
        <circle r="0.9" class="spark">
          <animate attributeName="cx" values="${p.x};${q.x}" dur="${dur}s" repeatCount="indefinite"/>
          <animate attributeName="cy" values="${p.y};${q.y}" dur="${dur}s" repeatCount="indefinite"/>
        </circle>`;
    }
    return `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" class="${lit ? "lit" : ""}"/>` + extra;
  }).join("");
  const nodes = tree.map(s => {
    const r = h.skills[s.key] || 0;
    const unlocked = skillUnlocked(h, s);
    const p = pos[s.key];
    return `<div class="const-node ${s.main ? "main" : "sub"}${s.ult ? " ult" : ""}${r > 0 ? " known" : ""}${r >= s.max ? " maxed" : ""}${unlocked ? "" : " locked"}${hwSkillSel === s.key ? " selected" : ""}"
        style="left:${p.x}%;top:${p.y}%" data-skill="${s.key}" title="${s.name}">
      <div class="cn-circle"><img class="cn-art" src="${skillArtURL(s)}" alt="">${unlocked ? ""
        : `<span class="cn-lock">${s.main && (h.stars || 0) < STAR_UNLOCK_MAIN[s.slot]
          ? "♥" + STAR_UNLOCK_MAIN[s.slot] : "🔒"}</span>`}
        <span class="cn-rank${r >= s.max ? " max" : ""}">${r >= s.max ? "Max" : `${r}/${s.max}`}</span></div>
      ${s.main && r >= s.max ? `<span class="cn-crown" title="${tx("dov.koruna")}">👑</span>` : ""}
      ${s.main ? `<div class="cn-name cn-plate">${s.name}</div>` : ""}
    </div>`;
  }).join("");
  const cost = spent * RESPEC_GOLD_PER_POINT;
  const freeR = (me.freeRespecs || 0) > 0;
  const mains = tree.filter(s => s.main);
  const mastered = mains.filter(s => (h.skills[s.key] || 0) >= s.max).length;
  const ptsTxt = tx("dov.bodu");
  return `
    <div class="constellation">
      <img class="const-hero" src="art/render/hero_${me.key}_${h.defIdx}.png" alt="">
      <svg class="const-lines" viewBox="0 0 100 100" preserveAspectRatio="none">${rings}${lines}</svg>
      ${nodes}
      ${skillCardHtml(me, h, tree, pos, spent)}
      ${hwFxOpen ? heroEffectsPanelHtml(me, h, tree) : ""}
    </div>
    <div class="const-foot">
      <span class="pts-chip" title="${tx("dov.body.tip2")}">
        ✦ <b>${h.skillPts}</b> ${ptsTxt} ${tx("dov.k.rozdeleni")}</span>
      <span class="mastery-chip" title="${tx("mis.chip.tip", { max: MAIN_MAX_RANK })}">
        🏅 ${mastered}/${mains.length}</span>
      <button class="fx-toggle${hwFxOpen ? " on" : ""}" title="${tx("fx.tip")}">☰ ${tx("fx.nazev")}</button>
      ${spent > 0 ? `<button id="btn-respec" ${freeR || me.resources.gold >= cost ? "" : "disabled"}
        title="${tx(freeR ? "dov.reset.tip.zdarma" : "dov.reset.tip", { body: spent })}">
        ↺ ${tx("dov.reset")} ${freeR ? "(" + tx("dov.zdarma") + ")" : `(${cost} 🪙)`}</button>` : ""}
    </div>`;
}

// Karta vybrané dovednosti — překryv v rohu stromu (podle předlohy RtW).
// Vykreslí se na opačné straně, než na které uzel leží.
function skillCardHtml(me, h, tree, pos, spent) {
  const s = tree.find(x => x.key === hwSkillSel);
  if (!s || hwFxOpen) return "";
  const r = h.skills[s.key] || 0;
  const unlocked = skillUnlocked(h, s);
  const can = h.skillPts > 0 && unlocked && r < s.max;
  const parent = s.parent ? tree.find(x => x.key === s.parent) : null;
  const side = (pos[s.key] && pos[s.key].x > 50) ? "left" : "right";
  const now = r > 0 ? skillEffs(s).map(e => effLine(e, e.val * r)).join(" · ") : tx("dov.nenauceno");
  const next = r < s.max ? skillEffs(s).map(e => effLine(e, e.val * (r + 1))).join(" · ") : null;
  return `<div class="skill-card ${side}">
    <button class="sc-close" title="${tx("spol.zavrit")}">✕</button>
    <div class="sc-head">
      <span class="sc-seal${s.main ? "" : " sub"}"><img class="cn-art" src="${skillArtURL(s)}" alt=""></span>
      <b>${s.ult ? "★ " : ""}${s.name}</b>
      ${r >= s.max ? `<span class="max-tag">${tx("dov.max")}</span>` : `<span class="cn-rank big">${r}/${s.max}</span>`}
    </div>
    <div class="sc-tags">
      <span class="sc-tag">${s.main ? tx(s.ult ? "dov.vrcholna" : "dov.hlavni")
        : tx("dov.vetev", { rodic: parent ? parent.name : "" })}</span>
      <span class="sc-tag time">${skillTimingTag(s)}</span>
    </div>
    <p class="cd-desc">${s.desc}</p>
    <p class="cd-now">${tx("dov.nyni")}: <b>${now}</b></p>
    ${next ? `<p class="cd-next">${tx("dov.dalsi.bod")}: <b class="green">${next}</b></p>`
           : `<p class="cd-next">${tx("dov.plne")}</p>`}
    ${s.main ? `<p class="cd-maxeff${r >= s.max ? " on" : ""}">✨ ${tx("dov.bonus.plne", { max: s.max })}: ${effLine(s.maxEff, s.maxEff.val)}${r >= s.max ? " — " + tx("dov.aktivni") : ""}</p>` : ""}
    ${!unlocked ? `<p class="hint">🔒 ${s.parent
      ? tx("dov.zamek.rodic", { rodic: parent ? parent.name : s.parent, rank: s.req || SUB_REQ, ma: h.skills[s.parent] || 0 })
      : (h.stars || 0) < STAR_UNLOCK_MAIN[s.slot]
        ? tx("dov.zamek.oddanost", { need: STAR_UNLOCK_MAIN[s.slot], ma: h.stars || 0 })
        : tx("dov.zamek.body", { need: SKILL_UNLOCK_MAIN[s.slot], ma: spent })}</p>` : ""}
    ${can ? `<button class="cd-learn" data-skill="${s.key}">✦ ${tx("dov.vylepsit")} <small>${tx("dov.vylepsit.pozn", { zbyva: h.skillPts })}</small></button>` : ""}
  </div>`;
}

// Panel „Aktuální efekty" — svislý souhrn všeho naučeného (podle předlohy).
function heroEffectsPanelHtml(me, h, tree) {
  const rows = [];
  for (const m of tree.filter(s => s.main)) {
    for (const s of [m, ...tree.filter(x => x.parent === m.key)]) {
      const r = h.skills[s.key] || 0;
      if (!r) continue;
      rows.push(`<div class="fx-row${s.main ? " main" : ""}">
        <img class="cn-art" src="${skillArtURL(s)}" alt="">
        <div class="fx-body">
          <b>${s.name}</b> <span class="cn-rank${r >= s.max ? " max" : ""}">${r}/${s.max}</span>
          <span class="sc-tag time">${skillTimingTag(s)}</span>
          <p>${skillEffs(s).map(e => effLine(e, e.val * r)).join(" · ")}</p>
          ${s.main && r >= s.max
            ? `<p class="fx-max">✨ ${effLine(s.maxEff, s.maxEff.val)}</p>` : ""}
        </div></div>`);
    }
  }
  // první uzel, do kterého jde investovat — pro tlačítko „Rozdělit body"
  const nextKey = (tree.find(s => skillUnlocked(h, s) && (h.skills[s.key] || 0) < s.max) || {}).key || "";
  return `<div class="fx-panel">
    <div class="fx-head"><b>${tx("fx.nazev")}</b><button class="fx-close" title="${tx("spol.zavrit")}">✕</button></div>
    <div class="fx-list">${rows.length ? rows.join("")
      : `<p class="hint">${tx("fx.nic")}</p>`}</div>
    ${h.skillPts > 0 && nextKey ? `<button class="fx-alloc" data-skill="${nextKey}">✦ ${tx("fx.rozdelit", { n: h.skillPts })}</button>` : ""}
  </div>`;
}

// Mistrovské bonusy: plné naučení hlavní dovednosti (15/15) odemyká bonus
// podle rysu velitele; vrcholná dovednost má vlastní, jedinečný.
function masteryHtml(me, h, def) {
  const mains = def.tree.filter(s => s.main);
  const done = mains.filter(s => (h.skills[s.key] || 0) >= s.max).length;
  const cards = mains.map(s => {
    const r = h.skills[s.key] || 0;
    const hotovo = r >= s.max;
    return `<div class="uq-card mastery${hotovo ? " on" : " locked"}">
      <b>${hotovo ? "🏅" : "🔒"} ${s.name}</b>
      <span class="cn-rank${hotovo ? " max" : ""}">${hotovo ? "Max" : `${r}/${s.max}`}</span>
      <p>${effLine(s.maxEff, s.maxEff.val)}</p>
      <p class="hint">${s.maxEffTrait ? tx("mis.bonus.rysu", { rys: HERO_TRAITS[def.trait].name })
        : tx("mis.bonus.vlastni")}${hotovo ? " — " + tx("dov.aktivni") : ""}</p>
    </div>`;
  }).join("");
  return `<h4>🏅 ${tx("mis.nazev")} <small>(${done}/${mains.length})</small></h4>
    <p class="hint">${tx("mis.hint", { max: MAIN_MAX_RANK })}</p>
    ${cards}`;
}

// ---------- Záložka Unikát (vrcholná dovednost, rys, mistrovství, signature) ----------
function heroUniqueTabHtml(me, h) {
  const def = heroDef(me, heroWinIdx);
  const trait = heroTrait(me, heroWinIdx);
  const ult = def.tree.find(s => s.ult);
  const r = ult ? (h.skills[ult.key] || 0) : 0;
  const sigKey = me.key + ":" + h.defIdx;
  const sig = SIGNATURE_ITEMS[sigKey];
  const owned = [...me.items, ...ITEM_SLOT_KEYS.map(s2 => h.equip[s2]).filter(Boolean)]
    .some(it => it.sig === sigKey);
  const active = !!heroSigItem(me, heroWinIdx);
  return `<div class="unique-tab">
    <div class="hw-figure uq"
      style="background-image:url('art/render/hero_big_${me.key}_${h.defIdx}.png')"></div>
    <div class="unique-info">
      ${ult ? `<h4>★ ${tx("dov.vrcholna")}</h4>
      <div class="uq-card${r > 0 ? " on" : ""}">
        <b>${ult.name}</b> <span class="cn-rank big">${r}/${ult.max}</span>
        <p>${ult.desc}</p>
        <p class="cd-now">${r > 0
          ? tx("uni.aktivni") + ": " + skillEffs(ult).map(e => effLine(e, e.val * r)).join(" · ")
          : tx("uni.ult.zamek", { hvezd: STAR_UNLOCK_MAIN[3], body: SKILL_UNLOCK_MAIN[SKILL_UNLOCK_MAIN.length - 1] })}</p>
        ${ult.maxEff ? `<p class="cd-maxeff${r >= ult.max ? " on" : ""}">✨ ${tx("dov.bonus.plne", { max: ult.max })}:
          ${effLine(ult.maxEff, ult.maxEff.val)}${r >= ult.max ? " — " + tx("dov.aktivni") : ""}</p>` : ""}
      </div>` : ""}
      <h4>Rys velitele</h4>
      <div class="uq-card on"><b>${trait.name}</b><p>${trait.desc}</p></div>
      ${masteryHtml(me, h, def)}
      ${sig ? `<h4>⭐ ${tx("uni.signature")}</h4>
      <div class="uq-card${active ? " on" : ""}">
        <b>${ITEM_SLOTS[sig.slot].icon} ${sig.name}</b>
        <p>Pasivka „${sig.passive}“: ${sig.effs.map(e => effLine(e, e.val)).join(" · ")}</p>
        <p class="hint">${active ? tx("uni.sig.nasazen")
          : owned ? tx("uni.sig.ve.skladu")
          : tx("uni.sig.zamek", { hvezd: SIG_STARS, ma: h.stars || 0 })}</p>
      </div>` : ""}
    </div></div>`;
}

// ---------- Záložka Staty ----------
function heroStatsTabHtml(me, h, st) {
  const row = (ico, name, val, tip) => `<div class="stat-row" title="${tip}">
    <span class="sr-ico">${ico}</span><span class="sr-name">${name}</span>
    <b class="sr-val">${val}</b></div>`;
  // čtveřice hlavních statů jako velké dlaždice (podle předlohy)
  const big = (ico, name, val, tip) => `<div class="stat-big" title="${tip}">
    <span class="sb-ico">${ico}</span><b class="sb-val">${val}</b><small>${name}</small></div>`;
  let html = `<div class="hw-figure stats"
    style="background-image:url('art/render/hero_big_${me.key}_${h.defIdx}.png')"></div>`;
  html += `<div class="stat-big-row">
    ${big("⚔", tx("st.utok"), st.atk.toFixed(1), tx("st.utok.tip"))}
    ${big("🛡", tx("st.obrana"), st.def.toFixed(1), tx("st.obrana.tip"))}
    ${big("🗡", tx("st.poskozeni"), st.dmg, tx("st.poskozeni.tip"))}
    ${big("⚡", tx("st.rychlost"), st.speed, tx("st.rychlost.tip"))}
  </div>`;
  html += `<div class="stat-grid">
    ${row("❤", tx("st.zivoty"), `${Math.round(h.hp ?? st.hpMax)}/${st.hpMax}`, tx("st.zivoty.tip"))}
    ${st.spell > 0 ? row("✨", tx("st.kouzla"), st.spell, tx("st.kouzla.tip")) : ""}
    ${st.stackAtk > 0 ? row("📈", tx("st.zurivost"), `+${effNum(st.stackAtk)}/${tx("spol.kolo")}`, tx("st.zurivost.tip")) : ""}
    ${st.stackDef > 0 ? row("🧱", tx("st.zakopy"), `+${effNum(st.stackDef)}/${tx("spol.kolo")}`, tx("st.zakopy.tip")) : ""}
    ${st.followUp > 0 ? row("⚡", tx("st.navazujici"), `${st.followUp} %`, tx("st.navazujici.tip")) : ""}
    ${st.stunChance > 0 ? row("💫", tx("st.omraceni"), `${st.stunChance} %`, tx("st.omraceni.tip")) : ""}
    ${st.stunImmune ? row("🛑", tx("st.neochvejnost"), tx("st.imunni"), tx("st.neochvejnost.tip")) : ""}
    ${st.avoidCharges > 0 ? row("🛡", tx("st.vyhnuti"), tx("st.vyhnuti.hodnota", { n: st.avoidCharges }), tx("st.vyhnuti.tip")) : ""}
    ${(st.actives || []).map(a => row("⏱", a.name,
      `${a.pct} % × ${a.targets}`,
      tx("st.aktivka.tip", { kdy: a.round ? tx("ef.kolo", { n: a.round }) : tx("ef.kazde", { n: a.every }), pct: a.pct, cile: a.targets }))).join("")}
    ${(st.armyActives || []).map(a => row("📯", a.name, `+${a.pct} % ${tx("st.armade")}`,
      tx("st.aktivka.armada.tip", { kdy: a.round ? tx("ef.kolo", { n: a.round }) : tx("ef.kazde", { n: a.every }), pct: a.pct }))).join("")}
    ${st.ward > 0 ? row("🔮", tx("st.ochrana"), `−${Math.round(st.ward * 100)} %`, tx("st.ochrana.tip")) : ""}
    ${row("⚑", tx("spol.veleni.velke"), st.cap, tx("st.veleni.tip"))}
    ${row("🥾", tx("st.cas.pochodu"), `×${st.time.toFixed(2)}`, tx("st.cas.tip"))}
    ${row("⏳", tx("st.vydrz"), `${Math.floor(h.stamina)}/${Math.round(st.stamMax)} (×${st.regen.toFixed(2)})`,
      tx("st.vydrz.tip"))}
    ${row("⌂", tx("st.zakladna"), h.zakladna && heroBaseKey(me, h) === h.zakladna
      ? tx("st.zakladna.vyspa", { pole: h.zakladna }) : tx("st.zakladna.kapital"),
      tx("st.zakladna.tip", { reach: REACH }))}
  </div>`;
  // hvězdy hrdiny: rostou oddaností z 🎁 dárků (truhly) — automaticky při
  // naplnění ceny další hvězdy; trvalá progrese uložená na účtu
  const stars = h.stars || 0;
  // POZOR: klíč i cena hvězdy jdou přes RODNOU frakci hrdiny (h.srcKey) a jeho
  // TIER — bez tieru vyjde cena běžného hrdiny (×0,8) a pruh pak lhal
  // („oddanost 270/100", ale epický potřebuje 360 a nepovyšoval)
  const heroKey = heroKeyFor(me, h);
  const tierIdx = heroTierOf(heroKey.split(":")[0], h.defIdx);
  const resp = acctRespect(heroKey);
  if (stars < HERO_MAX_STARS) {
    const need = respectForStar(stars + 1, tierIdx);
    const pct = Math.min(100, Math.round(resp / need * 100));
    html += `<div class="promote-row"
      title="${tx("st.oddanost.tip", { need, hvezda: stars + 1, darku: giftCostForStar(stars + 1, tierIdx), tier: HERO_TIERS[tierIdx].name.toLowerCase() })}">
      <span class="pr-stars">★ ${stars}<span class="dim">/${HERO_MAX_STARS}</span></span>
      <div class="respect-bar"><div class="respect-fill" style="width:${pct}%"></div>
        <span class="respect-num">🎁 ${tx("st.oddanost", { ted: resp, need, hvezda: stars + 1 })}</span></div>
    </div>` + darkyRowHtml(heroKey);
  } else {
    html += `<div class="promote-row"><span class="pr-stars">★ ${HERO_MAX_STARS}</span>
      <small class="hint">${tx("st.max.povyseni", { ikona: CORE_ICON })}</small></div>` + darkyRowHtml(heroKey);
  }
  if (me.ring && me.ring.level >= 3) {
    const r = me.ring;
    html += `<div class="ring-row">
      <button id="btn-ring-train" ${r.ap >= RING_COSTS.train && h.level < HERO_MAX_LEVEL ? "" : "disabled"}
        title="${tx("st.vycvik.tip", { pct: r.level >= 9 ? 24 : 12, cena: RING_COSTS.train, mas: r.ap })}">⚡ ${tx("st.vycvik")} (${RING_COSTS.train})</button>
      ${r.level >= 5 ? `<button id="btn-ring-rest" ${r.ap >= RING_COSTS.rest ? "" : "disabled"}
        title="${tx("st.dech.tip", { cena: RING_COSTS.rest, mas: r.ap })}">⚡ ${tx("st.dech")} (${RING_COSTS.rest})</button>` : ""}
    </div>`;
  }
  // armáda pod velením
  // obléhací odpočet armádu nedrží (drží ji hrdina) — přeskočit
  const m = me.marches.find(mm => mm.heroIdx === heroWinIdx && mm.kind !== "siege");
  const army = m ? m.army : h.army;
  const n = Math.round(armyTotal(army));
  html += `<h4>${tx("st.armada")}</h4><p>${n > 0 ? `${armyStr(army)} — ${n}/${st.cap} ${tx("spol.veleni")}`
    : tx("hrd.bez.armady", { cap: st.cap })}</p>`;
  // aktivní setové bonusy
  const counts = heroSetCounts(h);
  const rows = Object.entries(counts).map(([k, cnt]) => {
    const set = ITEM_SETS[k];
    const bons = set.bonuses.map(b =>
      `<span class="set-bonus${cnt >= b.pieces ? " on" : ""}">${b.pieces} ${tx("spol.ks")}: ${b.desc}</span>`).join("");
    return `<div class="set-row"><b style="color:${set.color}">◆ ${set.name}</b>
      <span class="set-count">${cnt}/6</span><div class="set-bonuses">${bons}</div></div>`;
  });
  if (rows.length) html += `<h4>${tx("st.setove")}</h4>${rows.join("")}`;
  // řada slotů výbavy dole (jako v předloze) — klik skočí na tab Výbava
  const slotRow = ITEM_SLOT_KEYS.map(s => {
    const sd = ITEM_SLOTS[s];
    const it = h.equip[s];
    return `<div class="eq-slot st-eq${it ? ` filled rar-${it.rarity}` : " empty"}" data-goslot="${s}"
        title="${sd.name}${it ? ` — ${it.name} (${itemEffectStr(it)})` : " — " + tx("st.prazdny.slot")}">
      <span class="eq-ico">${sd.icon}</span>
      ${it && itemStars(it) ? `<span class="eq-stars up-stars">${itemStars(it)}</span>` : ""}
    </div>`;
  }).join("");
  html += `<h4>${tx("st.vybava")}</h4><div class="eq-slot-row">${slotRow}</div>`;
  return html;
}

// ---------- Záložka Výbava (porovnávání jako v předloze) ----------
// hvězdy = úroveň Strengthen (0–5); raritu ukazuje barva rámečku a jméno
function itemStars(it) {
  const s = it.stars || 0;
  return s ? "★".repeat(s) : "";
}

// štítek signature kusu: jméno pasivky + komu patří
function sigTagHtml(it) {
  if (!it || !it.sig || !SIGNATURE_ITEMS[it.sig]) return "";
  const d = SIGNATURE_ITEMS[it.sig];
  const [fk, di] = it.sig.split(":");
  const hname = (HERO_DEFS[fk] && HERO_DEFS[fk][+di]) ? HERO_DEFS[fk][+di].name : "?";
  return `<small class="sig-tag" title="${d.effs.map(e => effLine(e, e.val)).join(" · ")}">
    ⭐ „${d.passive}“ — pasivka pro ${hname}</small>`;
}

function itemCompareCardHtml(it, tag, other) {
  if (!it) return `<div class="cmp-card empty"><div class="cmp-tag">${tag}</div>
    <p class="hint">— ${tx("vyb.slot.prazdny.kratce")} —</p></div>`;
  const better = other && ITEM_SLOTS[it.slot].stat === ITEM_SLOTS[other.slot].stat
    ? (itemValueOf(it) > itemValueOf(other) ? "up"
      : itemValueOf(it) < itemValueOf(other) ? "down" : "") : "";
  let setHtml = "";
  if (it.set) {
    const set = ITEM_SETS[it.set];
    setHtml = `<div class="cmp-set" style="color:${set.color}">◆ ${set.name}</div>
      <div class="cmp-set-bonuses">${set.bonuses.map(b => `<small>${b.pieces} ks: ${b.desc}</small>`).join("")}</div>`;
  }
  if (it.sig && SIGNATURE_ITEMS[it.sig]) {
    const d = SIGNATURE_ITEMS[it.sig];
    setHtml = `<div class="cmp-set sig-line">⭐ Signature — „${d.passive}“</div>
      <div class="cmp-set-bonuses">${d.effs.map(e => `<small>${effLine(e, e.val)}</small>`).join("")}
        ${sigTagHtml(it)}</div>` + setHtml;
  }
  return `<div class="cmp-card rar-${it.rarity}">
    <div class="cmp-tag">${tag}</div>
    <div class="cmp-name"><img class="it-art-s" src="${itemArtURL(it)}" alt=""> <b>${sideIcon(it)}${it.name}</b></div>
    <div class="cmp-stars"><span class="up-stars">${itemStars(it)}</span>
      <small style="color:${RARITIES[it.rarity].color}">${RARITIES[it.rarity].name}</small></div>
    <div class="cmp-line ${better}">[Hrdina] ${itemEffectStr(it)}</div>
    ${itemPassiveStr(it) ? `<div class="cmp-line it-pas">✨ ${itemPassiveStr(it)}</div>` : ""}
    ${(it.stars || 0) >= 5 ? `<div class="cmp-line master">🔨 ${MASTER_BONUS[it.slot].name}: ${MASTER_BONUS[it.slot].desc}</div>`
      : `<div class="cmp-line max5">na 5★: +${Math.round(it.value * 2.25)} · ${MASTER_BONUS[it.slot].name}</div>`}
    ${setHtml}
  </div>`;
}

// ---------- mřížka inventáře s ikonkami a filtry (v0.39) ----------
// Dlaždice ~44 px s generovanou ikonkou druhu (itemArtURL) — na obrazovku
// se jich vejde 50+; klik = výběr s detailem. Filtry: rarita (vícevýběr),
// set, u Výbavy hrdiny přepínač „jen použitelné". Kusy, které hrdina nemůže
// nosit (cizí strana), padají VŽDY úplně dospod (zadání uživatele).
let invFiltr = { rar: [], set: "", pouz: false };   // Výbava hrdiny
let skladFiltr = { rar: [], set: "", slot: "" };    // globální Sklad (💠)
let skladSel = -1;
let chestTab = "truhly";                            // záložka okna 💠

function invTileHtml(it, klic, vybrano, spatnaStrana) {
  const set = it.set && ITEM_SETS[it.set];
  return `<div class="inv-tile rar-${it.rarity}${vybrano ? " selected" : ""}${spatnaStrana ? " wrong-side" : ""}"
      data-item="${klic}" title="${it.name} · ${RARITIES[it.rarity].name}${set ? ` · ◆ ${set.name}` : ""} · ${itemEffectStr(it)}${spatnaStrana ? " · ⚠ " + tx("vyb.cizi.strana.kratce") : ""}">
    <img src="${itemArtURL(it)}" alt="" draggable="false">
    ${it.stars ? `<span class="it-b it-hvezdy">★${it.stars}</span>` : ""}
    ${it.refine ? `<span class="it-b it-zus">✨${it.refine}</span>` : ""}
    ${set ? `<span class="it-setdot" style="background:${set.color}"></span>` : ""}
    ${spatnaStrana ? `<span class="it-b it-strana">${SIDES[it.side].icon}</span>` : ""}
  </div>`;
}

// řádek filtrů: rarita jako barevné tečky, set jako výběr z vlastněných
function invChipsHtml(filtr, items, prefix, extra = "") {
  const rarity = RARITIES.map((r, i) => `<button class="inv-rar${filtr.rar.includes(i) ? " on" : ""}"
      data-filtr="${prefix}" data-rar="${i}" style="--rc:${r.color}" title="${r.name}"></button>`).join("");
  const sety = [...new Set(items.map(it => it.set).filter(Boolean))];
  const setSel = sety.length ? `<select class="inv-set" data-filtr="${prefix}">
      <option value="">◆ ${tx("vyb.vsechny.sety")}</option>
      ${sety.map(s => `<option value="${s}"${filtr.set === s ? " selected" : ""}>◆ ${ITEM_SETS[s].name}</option>`).join("")}
    </select>` : "";
  return `<div class="inv-chips">${rarity}${setSel}${extra}
    ${filtr.rar.length || filtr.set ? `<button class="inv-zrus" data-filtr="${prefix}">✕ ${tx("vyb.filtr")}</button>` : ""}</div>`;
}

function invFiltruj(items, filtr) {
  return items.filter(it => (!filtr.rar.length || filtr.rar.includes(it.rarity))
    && (!filtr.set || it.set === filtr.set)
    && (!filtr.slot || it.slot === filtr.slot));
}

function heroEquipTabHtml(me, h) {
  // řada slotů (jako v předloze dole pod postavou) — klik filtruje inventář
  const slots = ITEM_SLOT_KEYS.map(s => {
    const sd = ITEM_SLOTS[s];
    const it = h.equip[s];
    return `<div class="eq-slot${it ? ` filled rar-${it.rarity}` : " empty"}${hwSlotSel === s ? " selected" : ""}"
        data-slot="${s}" title="${sd.name}${it ? ` — ${it.name} (${itemEffectStr(it)})` : " — " + tx("vyb.prazdne")}">
      ${it ? `<img class="eq-art" src="${itemArtURL(it)}" alt="" draggable="false">`
           : `<span class="eq-ico">${sd.icon}</span>`}
      ${it && itemStars(it) ? `<span class="eq-stars up-stars">${itemStars(it)}</span>` : ""}
    </div>`;
  }).join("");
  // inventář: mřížka ikonek (v0.39) — filtr slotu (řada výš), rarity a setu;
  // kusy cizí strany VŽDY dospod a šedě, bez ohledu na řazení
  const strana = sideOfFaction(me.key);
  const spatna = it => !!(it.side && it.side !== strana);
  const vsech = me.items.length;
  const items = invFiltruj(me.items.filter(it =>
    (!hwSlotSel || it.slot === hwSlotSel) && (!invFiltr.pouz || !spatna(it))), invFiltr)
    .sort((a, b) => (spatna(a) - spatna(b)) || b.rarity - a.rarity
      || itemValueOf(b) - itemValueOf(a) || b.id - a.id);
  const chips = invChipsHtml(invFiltr, me.items, "inv",
    `<label class="inv-pouz"><input type="checkbox" id="inv-pouz"${invFiltr.pouz ? " checked" : ""}> ${tx("vyb.jen.pouzitelne")}</label>`);
  const inv = items.length
    ? `<div class="inv-grid-v2">${items.map(it =>
        invTileHtml(it, it.id, hwItemSel === it.id, spatna(it))).join("")}</div>`
    : `<p class="hint">${vsech ? tx("skl.filtr.prazdno") : tx(hwSlotSel ? "vyb.slot.prazdny" : "vyb.prazdny")}</p>`;
  // porovnání vybraného kusu s nasazeným v jeho slotu
  let compare = "";
  const sel = me.items.find(it => it.id === hwItemSel);
  if (sel) {
    const cur = h.equip[sel.slot];
    // afinita stran: kus cizí strany hrdina nenasadí (v0.9)
    const wrongSide = sel.side && sel.side !== sideOfFaction(me.key);
    compare = `<div class="cmp-row">
      ${itemCompareCardHtml(sel, tx("vyb.vybrany"), cur)}
      ${itemCompareCardHtml(cur, tx("vyb.nasazeny"), sel)}
    </div>
    <div class="cmp-actions">
      <button id="btn-equip-sel" ${wrongSide ? "disabled" : ""}>${cur ? "⇄ " + tx("vyb.vymenit") : "✔ " + tx("vyb.nasadit")}</button>
      ${cur ? `<button id="btn-unequip-cur">${tx("vyb.sundat")}</button>` : ""}
      ${wrongSide ? `<small class="hint warn">${SIDES[sel.side].icon} ${tx("vyb.cizi.strana", { cizi: SIDES[sel.side].name, moje: SIDES[sideOfFaction(me.key)].name })}</small>` : ""}
    </div>`;
  } else {
    const cur = hwSlotSel ? h.equip[hwSlotSel] : null;
    if (cur) compare = `<div class="cmp-row">${itemCompareCardHtml(cur, tx("vyb.nasazeny"), null)}</div>
      <div class="cmp-actions"><button id="btn-unequip-cur" data-slot="${hwSlotSel}">Sundat</button></div>`;
    else compare = `<p class="hint">${tx("vyb.vyber.kus")}</p>`;
  }
  return `<div class="eq-slot-row">${slots}</div>
    ${compare}
    <h4>${tx("vyb.inventar")} (${items.length}/${vsech})${hwSlotSel ? ` · ${tx("vyb.slot")}: ${ITEM_SLOTS[hwSlotSel].name}
      <a href="#" id="eq-clear-filter">${tx("vyb.zrusit.filtr")}</a>` : ""}</h4>
    ${chips}
    ${inv}`;
}

// ---------- Záložka Kovárna — Strengthen (v0.6.1) ----------
// Posílení předmětu až na 5★ pohlcením jiných kusů stejného druhu a rarity
// (1/3/5/8/13 kusů). Pátá hvězda probouzí mistrovský bonus slotu.
function heroForgeTabHtml(me, h) {
  const equipped = ITEM_SLOT_KEYS.map(s => h.equip[s]).filter(Boolean);
  const pool = [...equipped.map(it => ({ it, eq: true })),
    ...me.items.map(it => ({ it, eq: false }))];
  const grid = pool.length ? pool.map(x => `
    <div class="item-card forge-pick rar-${x.it.rarity}${hwForgeSel === x.it.id ? " selected" : ""}" data-forge="${x.it.id}">
      <img class="it-art-s" src="${itemArtURL(x.it)}" alt="">
      <div class="slot-txt"><b>${x.it.name}</b>${itemStars(x.it) ? ` <span class="up-stars">${itemStars(x.it)}</span>` : ""}
        <small>${itemEffectStr(x.it)}${x.eq ? " · <i>" + tx("vyb.nasazeny").toLowerCase() + "</i>" : ""}</small>${itemPassiveStr(x.it) ? `<small class="it-pas">✨ ${itemPassiveStr(x.it)}</small>` : ""}</div>
    </div>`).join("")
    : `<p class="hint">${tx("kov.bez.predmetu")}</p>`;

  let detail = `<p class="hint">${tx("kov.uvod")}</p>`;
      // zušlechtění: druhá dráha — sílí LOSOVANÁ pasivka kusu
      const refBlok = it => {
        if (!it.pas) return `<p class="hint">${tx("kov.bez.vlastnosti")}</p>`;
        const st = it.refine || 0;
        if (st >= REFINE_MAX) return `<p class="master">✨ ${itemPassiveStr(it)} — ${tx("kov.max.zuslechteni")}</p>`;
        const cena = REFINE_COST[st + 1];
        const dost = me.resources.gold >= cena;
        const nahled = itemPassiveEffs({ ...it, refine: st + 1 })
          .map(e => (Math.round(e.val * 100) / 100 + "").replace(".", ",")).join(", ");
        return `<p class="master">✨ ${itemPassiveStr(it)}
            <span class="fg-up">→ ${tx("kov.po.zuslechteni", { co: nahled })}</span></p>
          <button id="btn-refine" ${dost ? "" : "disabled"}>
            ✨ ${tx("kov.zuslechtit", { stupen: st + 1, cena })}${dost ? "" : " — " + tx("kov.nemas")}</button>`;
      };
  const target = pool.map(x => x.it).find(it => it.id === hwForgeSel);
  if (target) {
    const stars = target.stars || 0;
    const mb = MASTER_BONUS[target.slot];
    const starBar = `<span class="up-stars big">${"★".repeat(stars)}<span class="dim">${"☆".repeat(5 - stars)}</span></span>`;
    if (stars >= 5) {
      detail = `<div class="forge-detail rar-${target.rarity}">
        <p><b>${ITEM_SLOTS[target.slot].icon} ${target.name}</b> ${starBar}</p>
        <p>${itemEffectStr(target)}</p>
        <p class="master">🔨 ${tx("kov.mistrovsky", { jmeno: mb.name })}: ${mb.desc}</p>
        <p class="hint">${tx("kov.hvezdy.max")}</p>
        ${refBlok(target)}
      </div>`;
    } else {
      const need = STRENGTHEN_COST[stars];
      const mats = me.items.filter(it => it.id !== target.id
        && it.slot === target.slot && it.rarity === target.rarity);
      hwForgeMats = hwForgeMats.filter(id => mats.some(m => m.id === id));
      const matGrid = mats.length ? mats.map(it => `
        <div class="forge-mat${hwForgeMats.includes(it.id) ? " selected" : ""}" data-mat="${it.id}">
          ${ITEM_SLOTS[it.slot].icon} ${it.name}${itemStars(it) ? ` <span class="up-stars">${itemStars(it)}</span>` : ""}</div>`).join("")
        : `<p class="hint">${tx("kov.chybi.material", { slot: ITEM_SLOTS[target.slot].name, rarita: RARITIES[target.rarity].name })}</p>`;
      const nextVal = Math.round(target.value * (1 + 0.25 * (stars + 1)));
      detail = `<div class="forge-detail rar-${target.rarity}">
        <p><b>${ITEM_SLOTS[target.slot].icon} ${target.name}</b> ${starBar}</p>
        <p>${itemEffectStr(target)} → <b class="fg-up">${tx("kov.po.vylepseni", { hodnota: nextVal })}</b></p>
        <p>Na ${stars + 1}. ★: <b>${need}×</b> ${ITEM_SLOTS[target.slot].name}
          · ${RARITIES[target.rarity].name} — ${tx("kov.vybrano")} <b>${hwForgeMats.length}/${need}</b>
          ${mats.length >= need ? ` <a href="#" id="forge-auto">${tx("kov.vybrat.za.me")}</a>` : ""}</p>
        <p class="hint">${tx("kov.na5", { hodnota: Math.round(target.value * 2.25) })}
          „${mb.name}“ — ${mb.desc}.</p>
        <div class="forge-mats">${matGrid}</div>
        <button id="btn-strengthen" ${hwForgeMats.length === need ? "" : "disabled"}>
          🔨 ${tx("kov.posilit")} (${hwForgeMats.length}/${need})</button>
        ${refBlok(target)}
      </div>`;
    }
  }
  return `${detail}
    <h4>${tx("kov.predmety")} (${pool.length})</h4>
    <div class="inv-grid">${grid}</div>`;
}

function renderHeroWindow() {
  if (heroWinIdx === null) return;
  const me = player();
  const h = me.heroes[heroWinIdx];
  if (!h) { closeHeroWindow(); return; }
  const sig = heroWindowSig(me, h);
  if (sig === heroWinSig) return;
  heroWinSig = sig;

  const def = heroDef(me, heroWinIdx);
  const trait = heroTrait(me, heroWinIdx);
  const st = heroStats(me, heroWinIdx);
  const maxed = h.level >= HERO_MAX_LEVEL;
  const need = xpForLevel(h.level);
  const xpPct = maxed ? 100 : Math.round(h.xp / need * 100);

  // levý sloupec: všichni hrdinové — přepínání bez zavření okna
  const list = me.heroes.map((hh, i) => `
    <button class="hw-hero${i === heroWinIdx ? " active" : ""}" data-hero="${i}"
      title="${heroDef(me, i).name}">
      <img src="${heroPortraitURL(me.key, hh.defIdx)}" alt="">
      <span class="hw-lvl">${hh.level}</span>
      ${hh.skillPts > 0 ? `<span class="hw-dot" title="${tx("hrd.body.tip")}">✦</span>` : ""}
    </button>`).join("");

  const body =
    heroWinTab === "skills" ? constellationHtml(me, h) :
    heroWinTab === "equip" ? heroEquipTabHtml(me, h) :
    heroWinTab === "forge" ? heroForgeTabHtml(me, h) :
    heroWinTab === "unique" ? heroUniqueTabHtml(me, h) :
    heroStatsTabHtml(me, h, st);
  // plynulý přechod jen při skutečné změně tabu (ne při každém překreslení)
  const tabChanged = hwLastTab !== heroWinTab;
  hwLastTab = heroWinTab;

  const TRAIT_ICONS = { attack: "⚔", shield: "🛡", swift: "🦅", tireless: "⏳",
    warlord: "⚑", mystic: "✨", healer: "🌿" };
  const starsN = Math.min(HERO_MAX_STARS, h.stars || 0); // hvězdy velitele (oddanost z dárků)
  $("#hero-window").innerHTML = `
    <div class="hw">
      <div class="hw-list">${list}</div>
      <div class="hw-main">
        <div class="hero-win-head">
          <div class="hw-face-wrap">
            <img class="hero-face big" src="${heroPortraitURL(me.key, h.defIdx)}" alt="">
            <span class="lvl-badge" title="${tx("okh.uroven.z", { ted: h.level, max: HERO_MAX_LEVEL })}">${h.level}</span>
          </div>
          <div class="hw-title">
            <h3>${def.name}
              <span class="hw-stars" title="${tx("okh.hvezdy.tip", { max: HERO_MAX_STARS })}">${starsN > 0 ? `★ ${starsN}` : `<span class="dim">☆ 0</span>`}</span></h3>
            <p class="hero-trait"><span class="hw-class-ico">${TRAIT_ICONS[def.trait] || "✦"}</span>
              ${rasaRodu(me.key)} · <span class="hw-class">${trait.name}</span> — ${trait.desc}</p>
            <div class="xp-bar big" title="${tx(maxed ? "hrd.max.uroven" : "okh.xp.tip")}">
              <div class="xp-fill" style="width:${xpPct}%"></div>
              <span class="xp-num">${maxed ? `${tx("spol.ur")} ${h.level}/${HERO_MAX_LEVEL} — ${tx("dov.max").toLowerCase()}`
                : `${tx("spol.ur")} ${h.level}/${HERO_MAX_LEVEL} · ${h.xp} / ${need} ${tx("okh.zk")}`}</span></div>
          </div>
        </div>
        <div class="hw-body${tabChanged ? " tab-in" : ""}">${body}</div>
      </div>
      <div class="hw-tabs">
        <button class="hw-tab${heroWinTab === "stats" ? " active" : ""}" data-tab="stats" title="${tx("okh.staty")}">📊<small>${tx("okh.staty")}</small></button>
        <button class="hw-tab${heroWinTab === "skills" ? " active" : ""}" data-tab="skills" title="${tx("okh.dovednosti")}">✦<small>${tx("okh.strom")}</small>${h.skillPts > 0 ? `<span class="hw-dot">${h.skillPts}</span>` : ""}</button>
        <button class="hw-tab${heroWinTab === "equip" ? " active" : ""}" data-tab="equip" title="${tx("st.vybava")}">🎒<small>${tx("st.vybava")}</small></button>
        <button class="hw-tab${heroWinTab === "forge" ? " active" : ""}" data-tab="forge" title="${tx("okh.kovarna.tip")}">🔨<small>${tx("okh.kovarna")}</small></button>
        <button class="hw-tab${heroWinTab === "unique" ? " active" : ""}" data-tab="unique" title="${tx("okh.unikat.tip")}">★<small>${tx("okh.unikat")}</small></button>
      </div>
    </div>`;

  const rerender = () => { heroWinSig = null; renderHeroWindow(); updatePanels(); };
  document.querySelectorAll("#hero-window .hw-hero").forEach(el =>
    el.addEventListener("click", () => {
      heroWinIdx = parseInt(el.dataset.hero, 10);
      hwSkillSel = null; hwItemSel = null; hwSlotSel = null; hwFxOpen = false;
      rerender();
    }));
  document.querySelectorAll("#hero-window .hw-tab").forEach(el =>
    el.addEventListener("click", () => { heroWinTab = el.dataset.tab; rerender(); }));
  document.querySelectorAll("#hero-window .const-node").forEach(el =>
    el.addEventListener("click", () => {
      hwSkillSel = el.dataset.skill;
      hwFxOpen = false;          // karta dovednosti a panel efektů se vylučují
      rerender();
    }));
  document.querySelectorAll("#hero-window .cd-learn").forEach(el =>
    el.addEventListener("click", () => { learnSkill(player(), heroWinIdx, el.dataset.skill); rerender(); }));
  const scClose = document.querySelector("#hero-window .sc-close");
  if (scClose) scClose.addEventListener("click", () => { hwSkillSel = null; rerender(); });
  const fxTgl = document.querySelector("#hero-window .fx-toggle");
  if (fxTgl) fxTgl.addEventListener("click", () => { hwFxOpen = !hwFxOpen; rerender(); });
  const fxClose = document.querySelector("#hero-window .fx-close");
  if (fxClose) fxClose.addEventListener("click", () => { hwFxOpen = false; rerender(); });
  const fxAlloc = document.querySelector("#hero-window .fx-alloc");
  if (fxAlloc) fxAlloc.addEventListener("click", () => {
    hwFxOpen = false;
    hwSkillSel = fxAlloc.dataset.skill;
    rerender();
  });
  const btnResp = $("#btn-respec");
  if (btnResp) btnResp.addEventListener("click", () => { respecHero(player(), heroWinIdx); rerender(); });
  bindDarky(document.querySelector("#hero-window"));   // použití dárků (v0.43)
  const btnRT = $("#btn-ring-train");
  if (btnRT) btnRT.addEventListener("click", () => { ringTrain(player(), heroWinIdx); rerender(); });
  const btnRR = $("#btn-ring-rest");
  if (btnRR) btnRR.addEventListener("click", () => { ringRest(player(), heroWinIdx); rerender(); });
  document.querySelectorAll("#hero-window .eq-slot[data-slot]").forEach(el =>
    el.addEventListener("click", () => {
      hwSlotSel = hwSlotSel === el.dataset.slot ? null : el.dataset.slot;
      hwItemSel = null;
      rerender();
    }));
  // sloty na kartě Staty: klik skočí rovnou do Výbavy s filtrem slotu
  document.querySelectorAll("#hero-window .eq-slot[data-goslot]").forEach(el =>
    el.addEventListener("click", () => {
      heroWinTab = "equip";
      hwSlotSel = el.dataset.goslot;
      hwItemSel = null;
      rerender();
    }));
  document.querySelectorAll("#hero-window .item-card[data-item], #hero-window .inv-tile[data-item]").forEach(el =>
    el.addEventListener("click", () => {
      const id = parseInt(el.dataset.item, 10);
      hwItemSel = hwItemSel === id ? null : id;
      rerender();
    }));
  // filtry inventáře (v0.39): rarita (vícevýběr), set, jen použitelné
  document.querySelectorAll('#hero-window .inv-rar[data-filtr="inv"]').forEach(el =>
    el.addEventListener("click", () => {
      const r = parseInt(el.dataset.rar, 10);
      invFiltr.rar = invFiltr.rar.includes(r)
        ? invFiltr.rar.filter(x => x !== r) : [...invFiltr.rar, r];
      rerender();
    }));
  const invSet = document.querySelector('#hero-window .inv-set[data-filtr="inv"]');
  if (invSet) invSet.addEventListener("change", () => { invFiltr.set = invSet.value; rerender(); });
  const invZrus = document.querySelector('#hero-window .inv-zrus[data-filtr="inv"]');
  if (invZrus) invZrus.addEventListener("click", () => { invFiltr = { rar: [], set: "", pouz: invFiltr.pouz }; rerender(); });
  const invPouz = $("#inv-pouz");
  if (invPouz) invPouz.addEventListener("change", () => { invFiltr.pouz = invPouz.checked; rerender(); });
  // kovárna: výběr předmětu, materiálu a samotné posílení
  document.querySelectorAll("#hero-window [data-forge]").forEach(el =>
    el.addEventListener("click", () => {
      const id = parseInt(el.dataset.forge, 10);
      hwForgeSel = hwForgeSel === id ? null : id;
      hwForgeMats = [];
      rerender();
    }));
  document.querySelectorAll("#hero-window .forge-mat").forEach(el =>
    el.addEventListener("click", () => {
      const id = parseInt(el.dataset.mat, 10);
      const me2 = player();
      const target = [...me2.items, ...ITEM_SLOT_KEYS.map(s => me2.heroes[heroWinIdx].equip[s]).filter(Boolean)]
        .find(it => it.id === hwForgeSel);
      const need = target ? STRENGTHEN_COST[target.stars || 0] : 0;
      if (hwForgeMats.includes(id)) hwForgeMats = hwForgeMats.filter(x => x !== id);
      else if (hwForgeMats.length < need) hwForgeMats.push(id);
      rerender();
    }));
  const fAuto = $("#forge-auto");
  if (fAuto) fAuto.addEventListener("click", e => {
    e.preventDefault();
    const me2 = player();
    const target = [...me2.items, ...ITEM_SLOT_KEYS.map(s => me2.heroes[heroWinIdx].equip[s]).filter(Boolean)]
      .find(it => it.id === hwForgeSel);
    if (!target) return;
    const need = STRENGTHEN_COST[target.stars || 0];
    hwForgeMats = me2.items
      .filter(it => it.id !== target.id && it.slot === target.slot && it.rarity === target.rarity)
      .sort((a, b) => (a.stars || 0) - (b.stars || 0) || a.value - b.value) // nejdřív nejslabší
      .slice(0, need).map(it => it.id);
    rerender();
  });
  const btnRef = $("#btn-refine");
  if (btnRef) btnRef.addEventListener("click", () => {
    refineItem(player(), hwForgeSel);
    syncLocalAccount(true);
    rerender();
  });
  const btnStr = $("#btn-strengthen");
  if (btnStr) btnStr.addEventListener("click", () => {
    strengthenItem(player(), hwForgeSel, hwForgeMats);
    hwForgeMats = [];
    syncLocalAccount(true);
    rerender();
  });
  const clearF = $("#eq-clear-filter");
  if (clearF) clearF.addEventListener("click", e => { e.preventDefault(); hwSlotSel = null; rerender(); });
  const btnEq = $("#btn-equip-sel");
  if (btnEq) btnEq.addEventListener("click", () => {
    equipItem(player(), heroWinIdx, hwItemSel);
    hwItemSel = null;
    rerender();
  });
  const btnUneq = $("#btn-unequip-cur");
  if (btnUneq) btnUneq.addEventListener("click", () => {
    const sel = player().items.find(it => it.id === hwItemSel);
    const slot = sel ? sel.slot : (btnUneq.dataset.slot || hwSlotSel);
    if (slot) unequipItem(player(), heroWinIdx, slot);
    rerender();
  });
}

// ---------- Panel vybraného pole ----------
// Překresluje se jen když se změní jeho "podpis" — jinak by se každý tik
// zavíral rozbalený výběr hrdiny a resetovaly rozepsané počty jednotek.
function tileSignature() {
  const me = player();
  if (selectedMarchHero !== null) {
    const m = me.marches.find(x => x.heroIdx === selectedMarchHero);
    return m ? ["march", selectedMarchHero, m.kind, m.ticksLeft, m.targetKey].join("|")
      : "march-gone" + selectedMarchHero;
  }
  if (!selectedKey) return "none";
  const t = G.tiles.get(selectedKey);
  const readyHeroes = me.heroes.map((h, i) => heroReady(me, i, t) ? 1 : 0).join("");
  const heroHere = me.heroes.findIndex(h => h.pos === selectedKey);
  const heroArmy = heroHere !== -1 ? armyTotal(me.heroes[heroHere].army) : -1;
  const heroPlaces = me.heroes.map(h => (h.pos || "cap") + (h.guard ? "G" : "")).join(";");
  // dostupnost akcí musí být součástí podpisu — jinak tlačítka „zamrznou“
  // ve stavu, ve kterém se poprvé vykreslila (např. neaktivní kvůli surovinám)
  const afford = UNIT_KEYS.map(k => canAfford(me, uDef(me, k).cost) ? 1 : 0).join("");
  const buildable = [...Object.keys(BUILDINGS), ...UNIT_KEYS.map(k => "up_" + k)]
    .map(key => canBuild(me, key).ok ? 1 : 0).join("");
  const convoys = me.marches.filter(m => m.kind === "reinforce").map(m => m.targetKey).join("|");
  const worldBits = [convoys, mapEventAt(selectedKey) ? 1 : 0, G.throneOpen ? 1 : 0,
    isVisible(selectedKey) ? 1 : 0, isExplored(selectedKey) ? 1 : 0,
    G.factions.map(f => hasPact(me, f) ? 1 : 0).join(""),
    // v0.29: obléhací okno/odolnost a války mění obsah panelu
    t.okno | 0, t.zran | 0, Math.round(t.odol || 0),
    G.faze | 0, t.uzelCd | 0, // v0.30: fáze světa a uzavření uzlu mění panel
    t.zran | 0,               // etapa 7: okno zranění (odpočet + oslabená posádka)
    t.abandon | 0,            // v0.39: odpočet vyklízení pole
    t.klan | 0, t.clen | 0,   // etapa 8: klanové i členské vlastnictví mění panel
    me.klan | 0, (me.vyhazov ? 1 : 0), (me.vyvrhel ? 1 : 0),
    // v0.31: strop území a Prsten (Sklizeň/Výcvik tlačítka, hlášky stropu)
    pocetPoli(me), stropPoli(me), me.ring ? me.ring.level : 0,
    me.ring ? me.ring.ap : 0, me.ring ? (me.ring.body || 0) : 0,
    G.factions.map(f => jeValka(me, f) ? 1 : 0).join(""),
    // join("|"): čísla bez oddělovače by mohla srůst do stejného podpisu
    me.heroes.map(h => h.zakladna || "").join(";")].join("|");
  return [selectedKey, t.owner, tileDefense(t), readyHeroes, heroHere, heroArmy, heroPlaces, worldBits,
    me.units.inf, me.units.arch, me.units.cav,
    me.buildings.main, me.buildings.barracks, me.buildings.hospital,
    me.upgrades.inf, me.upgrades.arch, me.upgrades.cav, afford, buildable,
    me.build ? me.build.key : "",
    me.recruitQueue.map(rq => rq.type + (rq.count || RECRUIT_BATCH)).join(",")].join("|");
}

function forceTilePanel() {
  tilePanelSig = null;
  updatePanels();
}

// řádek vyklízení pole do panelu pole (v0.39) — stejná akce jako v seznamu
function abandonHtml(me, t) {
  const a = bigAnchor(t);
  if (!a || !patriClenu(me, a)) return "";
  if (a.abandon > 0) {
    return `<p class="map-event-tag">🏳 ${tx("uz.vyklizi.se", { doba: fmtTime(a.abandon) })}</p>
      <button id="btn-abandon-cancel">↩ ${tx("uz.zrusit.vyklizeni")}</button>`;
  }
  if (!canAbandonTile(me, a)) return "";
  return `<button id="btn-abandon" class="btn-quiet"
    title="${tx("uz.odebrat.tip", { min: Math.round(ABANDON_TICKS / 60) })}">
    🏳 ${tx("uz.odebrat", { min: Math.round(ABANDON_TICKS / 60) })}</button>`;
}

// ---------- Seznam držených polí (v0.39) ----------
// Klik na 🗺 v liště rozbalí soupis území seřazený od nejsilnějšího pole.
// Řádek skáče kamerou na pole, tlačítko ho pošle vyklidit (5 min odpočet).
let landPanelOpen = false, landPanelSig = null;
function toggleLandPanel() {
  landPanelOpen = !landPanelOpen;
  landPanelSig = null;
  updateLandPanel();
}
function updateLandPanel() {
  const panel = $("#land-panel");
  if (!panel) return;
  const me = player();
  if (!landPanelOpen || !me || !G.running || G.gameOver) {
    panel.classList.add("hidden");
    return;
  }
  // moje pole odshora podle síly; kotvy bloků jednou (členy vynecháme)
  const pole = [];
  for (const t of G.tiles.values()) {
    if (!patriClenu(me, t) || t.big) continue;
    pole.push(t);
  }
  pole.sort((a, b) => (tierOf(b) - tierOf(a))
    || (b.bigSize || 1) - (a.bigSize || 1)
    || gridDist(a, capPosOf(me)) - gridDist(b, capPosOf(me)));
  const sig = [pole.length, pocetPoli(me), stropPoli(me), selectedKey,
    pole.map(t => keyOf(t.q, t.r) + ":" + (t.abandon | 0)).join(",")].join("|");
  if (sig === landPanelSig) return;
  landPanelSig = sig;
  panel.classList.remove("hidden");
  const rows = pole.map(t => {
    const k = keyOf(t.q, t.r);
    const vyklizi = t.abandon > 0;
    const lze = canAbandonTile(me, t);
    const stopa = t.bigSize ? ` · ${t.bigSize}×${t.bigSize}` : "";
    const res = t.res && t.res !== "all" ? ` ${RES_ICONS[t.res]}` : (t.res === "all" ? " ✦" : "");
    return `<div class="land-row${k === selectedKey ? " sel" : ""}${vyklizi ? " leaving" : ""}" data-key="${k}">
      <button class="land-go" data-key="${k}" title="${tx("uz.skocit", { pole: k })}">
        <span class="land-lvl" style="color:${LEVEL_COLORS[t.level - 1]}">⚔${tierOf(t)}</span>
        <span class="land-name">${t.structure ? STRUCTURES[t.structure].name : TERRAIN[t.terrain].name}${stopa}${res}</span>
        <span class="land-reg">${regionOf(t)}</span>
      </button>
      ${vyklizi
        ? `<button class="land-drop cancel" data-cancel="${k}" title="${tx("uz.zrusit.vyklizeni")}">↩ ${fmtTime(t.abandon)}</button>`
        : `<button class="land-drop" data-drop="${k}" ${lze ? "" : "disabled"}
            title="${lze ? tx("uz.vyklidit.tip", { min: Math.round(ABANDON_TICKS / 60) })
              : tx("uz.nelze.odebrat")}">🏳</button>`}
    </div>`;
  }).join("");
  panel.innerHTML = `
    <div class="land-head">
      <b>🗺 ${tx("cil.uzemi", { ted: pocetPoli(me), max: stropPoli(me) })}</b>
      <button class="tp-close" id="land-close" title="${tx("spol.zavrit")}">✕</button>
    </div>
    <p class="hint land-hint">${tx("uz.hint", { min: Math.round(ABANDON_TICKS / 60) })}</p>
    <div class="land-list">${rows || `<p class="hint">${tx("uz.zadna.pole")}</p>`}</div>`;
  $("#land-close").addEventListener("click", () => toggleLandPanel());
  panel.querySelectorAll(".land-go").forEach(b => b.addEventListener("click", () => {
    const t = G.tiles.get(b.dataset.key);
    if (!t) return;
    const p = tileToPixel(t.q, t.r);
    camera.x = p.x; camera.y = p.y;
    selectedKey = b.dataset.key;
    hideTileMenu();
    forceTilePanel();
    landPanelSig = null;
  }));
  panel.querySelectorAll("[data-drop]").forEach(b => b.addEventListener("click", () => {
    abandonTile(me, G.tiles.get(b.dataset.drop));
    landPanelSig = null; forceTilePanel();
  }));
  panel.querySelectorAll("[data-cancel]").forEach(b => b.addEventListener("click", () => {
    cancelAbandon(me, G.tiles.get(b.dataset.cancel));
    landPanelSig = null; forceTilePanel();
  }));
}

// zrcadlí podmínky buildOutpost — aby UI nenabízelo akci, která tiše selže
// (kotva i členové bloků 2×2/3×3 výspu nesnesou)
function lzeStavetVyspu(me, t) {
  return !!t && patriClenu(me, t) && !t.structure && !t.big && !t.bigSize
    && TERRAIN[t.terrain].passable && t.terrain !== "bridge";
}

function updateTilePanel() {
  const panel = $("#tile-panel");
  // rozkliknuté tlačítko (mezi stiskem a puštěním) — nerušit, klik by se ztratil
  if (panelHeld) return;
  // uživatel právě pracuje s formulářem (rozbalený select, psaní čísel) — nerušit;
  // tlačítko, které si po kliku drží focus, ale překreslení blokovat NESMÍ
  if (rozepsanyVstup(panel)) return;
  const sig = tileSignature();
  if (sig === tilePanelSig) return;
  tilePanelSig = sig;
  renderTilePanel();
}

// panel vybraného pochodu (klik na kolonu na mapě): kdo jde, kam, za jak
// dlouho — s možností obrátit ho zpět bez hledání v soupisu hrdinů
function renderMarchPanel(panel, me, m) {
  panel.classList.remove("hidden");
  const h = me.heroes[m.heroIdx];
  const target = G.tiles.get(m.targetKey);
  const origin = G.tiles.get(m.fromKey);
  const kindTxt = m.kind === "attack"
    ? (target && target.owner === me.id ? "🥾 " + tx("poch.presun.na") : "⚔ " + tx("poch.utok.na"))
    : m.kind === "return" ? "🏠 " + tx("poch.navrat.do") : "↩ " + tx("poch.ustup.na");
  const prog = Math.round((m.total - m.ticksLeft) / m.total * 100);
  const canTurn = m.kind === "attack" || m.kind === "return";
  panel.innerHTML = `<button class="tp-close" id="tp-close" title="${tx("spol.zavrit")}">✕</button>
    <h3>${tx("poch.nazev")} — ${heroDef(me, m.heroIdx).name}</h3>
    <div class="march-head">
      <img class="march-face" src="${heroPortraitURL(me.key, h.defIdx)}" alt="">
      <div>
        <p>${kindTxt} <b>${target ? tileLabel(target) : "?"}</b></p>
        <p class="hint">${tx("poch.z")} ${origin ? tileLabel(origin) : "?"} · ${armyStr(m.army)} (${armyTotal(m.army)} ${tx("spol.j")})</p>
      </div>
    </div>
    <div class="march-bar"><div class="march-fill" style="width:${prog}%;background:${me.color}"></div></div>
    <p class="hint">${tx("pot.dorazi", { doba: fmtTime(m.ticksLeft) })}.</p>
    ${canTurn ? `<button id="btn-march-turn">↩ ${tx("poch.obratit")}</button>` : ""}
    <button id="btn-march-hero">⚑ ${tx("poch.detail")}</button>`;
  bindTpClose();
  const bt = $("#btn-march-turn");
  if (bt) bt.addEventListener("click", () => {
    turnBackMarch(me, m.heroIdx);
    forceTilePanel();
  });
  $("#btn-march-hero").addEventListener("click", () => openHeroWindow(m.heroIdx));
}

function renderTilePanel() {
  const panel = $("#tile-panel");
  const me = player();
  // náhled trasy znovu nastaví jen otevřený formulář pochodu; když ale visí
  // potvrzovací karta kola, její náhledy nechat (panel se překresluje každý
  // tik, jakmile je v podpisu odpočet okna)
  if (!document.querySelector("#tile-menu .tm-confirm"))
    marchPreview = null, reachPreview = null;
  if (selectedMarchHero !== null) {
    const m = me ? me.marches.find(x => x.heroIdx === selectedMarchHero) : null;
    if (m) { renderMarchPanel(panel, me, m); return; }
    selectedMarchHero = null; // pochod skončil — zpět na běžný panel
  }
  panel.classList.toggle("hidden", !selectedKey);
  if (!selectedKey) { panel.innerHTML = ""; return; }
  const closeBtn = `<button class="tp-close" id="tp-close" title="${tx("spol.zavrit")}">✕</button>`;
  const t = G.tiles.get(selectedKey);
  // mlha války: neprozkoumaná pole neprozradí nic
  if (!isExplored(selectedKey)) {
    panel.innerHTML = `${closeBtn}<h3>${tx("pan.neprozkoumane")}</h3>
      <p class="hint">${tx("pan.mlha")}</p>`;
    bindTpClose();
    return;
  }
  const seen = isVisible(selectedKey);
  const terr = TERRAIN[t.terrain];
  const ownerName = t.owner === -1 ? tx("pan.neutralni") :
    `<span style="color:${G.factions[t.owner].color}">${G.factions[t.owner].name}</span>`;
  const resTxt = t.res === "all"
    ? `✦ ${tx("pan.vsechny.suroviny")}`
    : t.res ? `${RES_ICONS[t.res]} ${RES_NAMES[t.res]}` : "";
  let html = `${closeBtn}<h3>${t.structure ? STRUCTURES[t.structure].name : terr.name}</h3>
    <p>${tx("pan.sila", { sila: tileStrengthLabel(t) })} · ${ownerName}${resTxt ? " · " + resTxt : ""}</p>`;
  if (!terr.passable) {
    html += `<p class="hint">${tx("pan.neprchodny")}</p>`;
    panel.innerHTML = html; bindTpClose(); return;
  }
  if (!seen) {
    html += `<p>${tx("pan.obrana")}: ⚔ <span class="hint-inline">${tx("pan.mimo.dohled")}</span></p>`;
    html += tileGainHtml(t, me, true);
    html += `<p class="hint">${tx("pan.posledni.stav")}</p>`;
    panel.innerHTML = html; bindTpClose(); return;
  }
  const def = tileDefense(t);
  const komp = tileDefComponents(t);
  const homeDef = komp.homeFaction;
  const cizistoh = t.owner !== -1 && t.owner !== me.id && (komp.obranci || []).length >= 2;
  if (cizistoh) {
    // IV-L: u CIZÍHO stohu je vidět POČET armád, ne jejich síla — velký stoh
    // nemusí být silný a blafování slabými hrdiny je záměr. U vlastních polí
    // se dál vidí všechno.
    const n = komp.obranci.length;
    html += `<p title="${tx("pan.stoh.tip")}">
      🛡 ${tx("pan.stoh", { n })} <span class="hint-inline">${tx("pan.stoh.neznas")}</span></p>`;
  } else {
    html += `<p>${tx("pan.obrana")}: ⚔ ${def}${homeDef
      ? ` <span class="hint-inline" title="${tx("pan.zasoba.tip")}">${tx("pan.zasoba", { pocet: armyTotal(homeDef.units) })}</span>` : ""}</p>`;
  }
  const nctxt = neutralCmdTxt(t);
  if (nctxt) html += `<p class="neutral-cmd" title="${tx("pan.velitel.tip")}">🛡 ${tx("pan.velitel")}: ${nctxt}</p>`;
  if (t.owner === me.id) html += poradiObranyHtml(me, t);
  // v0.40: most je brána přes řeku — dvojice břehů spojená přes vodu
  if (t.structure === "bridge") {
    const twin = bridgeTwin(t);
    const drzimTwin = twin && twin.owner === me.id;
    html += `<p class="odol-line" title="${tx("pan.most.tip")}">
      🌉 ${tx("pan.most", { breh: twin ? `${twin.q},${twin.r}` : "?" })}${drzimTwin ? " ✅ " + tx("pan.most.drzis") : ""}
      ${t.owner === -1 ? ` · ⚔⚔ ${tx("pan.dve.armady.most", { uroven: BRIDGE_LEVEL })}` : ""}
      ${t.uzelCd > 0 ? ` · ⛔ <b>${tx("pan.uzavren", { doba: fmtTime(t.uzelCd) })}</b>` : ""}</p>`;
  }
  html += klanPoleHtml(me, t);   // etapa 8: klanové pole / pole vyvrhela
  // v0.30: uzel 2×2 brání dvě armády; po odraženém zátahu je na čas uzavřen
  if (jeUzel(t) && t.owner === -1) {
    html += `<p class="odol-line" title="${tx("pan.uzel.tip")}">⚔⚔ ${tx("pan.uzel")}${
      t.uzelCd > 0 ? ` · ⛔ <b>${tx("pan.uzavren", { doba: fmtTime(t.uzelCd) })}</b>` : ""}</p>`;
  }
  // v0.29: velké stavby mají odolnost — pobitá posádka otevírá obléhací okno
  if (jeVelkaStavba(t)) {
    const om = SIEGE_HP[t.structure];
    html += `<p class="odol-line" title="${tx("pan.odolnost.tip")}">🧱 ${tx("pan.odolnost", { ted: Math.round(t.odol ?? om), max: om })}${
      t.okno > 0 ? ` · ⏳ <b>${tx("pan.okno", { doba: fmtTime(t.okno) })}</b> — ${tx("pan.posadka.pobita")}` : ""}</p>`;
    const drzitel = regionHolderId(t);
    if (drzitel !== -1 && drzitel !== me.id && !jeValka(me, drzitel))
      html += `<p class="hint">⚔ ${tx("pan.kraj.drzi", { rod: G.factions[drzitel].name, pct: Math.round((1 - WAR_SIEGE_PENALTY) * 100) })}</p>`;
  }
  // KEEP KRAJE (etapa 7): jeden na kraj a kdo ho drží, drží kraj — to je
  // informace, kterou z názvu stavby nikdo nevyčte
  if (t.structure === "keep") {
    const drzi = regionHolderId(t);
    html += `<p class="keep-line" title="${tx("pan.keep.tip")}">🏯 ${tx("pan.keep", { kraj: regionOf(t) })}${drzi === -1 ? " " + tx("pan.keep.nikdo")
        : drzi === me.id ? " · <b>" + tx("pan.keep.tvuj") + "</b>" : " · " + tx("pan.keep.drzi", { rod: G.factions[drzi].name })}</p>`;
    // ⚠ Z „⚔ 12000" a jednoho velitele hráč nepozná, JAK je keep bráněný:
    // jestli je to jedna armáda nebo vlny, a jestli má vůbec smysl útočit
    // s tím, co uveze jeden hrdina. Tohle je celá raid smyčka v jedné větě.
    if (t.owner === -1) {
      const strop = Math.round(Math.max(...me.heroes.map((h, i) => heroArmyCap(me, i))));
      const potreba = marchNeeded(t);
      const naJeden = Math.max(1, Math.round(potreba / Math.max(1, strop)));
      html += `<p class="keep-line" title="${tx("pan.keep.obrana.tip")}">
        🛡 ${tx("pan.keep.obrana", { muzu: Math.round(t.garrison).toLocaleString(cisloJazyk()), strop: strop.toLocaleString(cisloJazyk()), nasobek: naJeden })}</p>`;
    }
  }
  // OKNO ZRANĚNÍ (etapa 7): dokud běží, posádka se nehojí a co jí kdokoli
  // ubere, se sčítá. Hráč to musí VIDĚT — jinak nepozná rozdíl mezi „pole je
  // slabé" a „pole je NAČATÉ a za chvíli se zase zacelí".
  if (t.owner === -1 && t.zran > 0) {
    const plna = t.structure ? (STRUCTURES[t.structure] || {}).militia
      : TIER_GARRISON[t.level - 1] * (t.bigSize === 2 ? 2 : 1);
    const ubrano = plna ? Math.max(0, Math.min(100, Math.round(100 * (1 - t.garrison / plna)))) : 0;
    html += `<p class="zran-line" title="${tx("pan.zran.tip")}">⏳ ${tx("pan.zran", { doba: fmtTime(t.zran), pct: ubrano })}</p>`;
  }
  const mev = mapEventAt(selectedKey);
  if (mev) {
    const evd = MAP_EVENTS[mev.type];
    html += `<p class="map-event-tag">${evd.icon} <b>${evd.name}</b> (${fmtTime(mev.ticksLeft)}) — ${evd.desc}.</p>`;
  }
  if (t.structure === "throne" && !G.throneOpen) {
    html += `<p class="map-event-tag">🔒 ${tx("pan.trun.primeri", { doba: fmtTime(THRONE_UNLOCK - G.tick) })}</p>`;
  }
  html += tileGainHtml(t, me, true);

  if (t.owner === me.id) {
    if (t.structure === "capital") {
      // správa města žije ve vlastních oknech boční lišty
      html += `<p class="hint">${tx("pan.kapital")}</p>
        <div class="tp-shortcuts">
          <button class="tp-open" data-win="build">🏰 ${tx("zkr.budovy")}</button>
          <button class="tp-open" data-win="train">🗡 ${tx("zkr.vycvik")}</button>
          <button class="tp-open" data-win="upgrade">⚒ ${tx("zkr.vylepseni")}</button>
        </div>`;
    } else {
      const heroHereIdx = me.heroes.findIndex(h => h.pos === selectedKey);
      if (heroHereIdx !== -1) {
        const hh = me.heroes[heroHereIdx];
        const travel = travelTicks(t, capPosOf(me), REINFORCE_TICKS);
        html += `<p>⚑ ${heroDef(me, heroHereIdx).name} — ${armyStr(hh.army)}</p>`;
        // v0.29: usazení na výspě = výslovná akce; z výspy pak hrdina jedná
        // v dosahu REACH kolem ní místo kolem kapitálu
        if (t.structure === "outpost") {
          if (hh.zakladna === selectedKey) {
            html += `<p class="hint">⌂ ${tx("pan.zakladna", { reach: REACH })}</p>`;
          } else if (!heroBusy(me, heroHereIdx)) {
            html += `<button id="btn-settle" title="${tx("pan.usadit.tip", { reach: REACH })}">⚑ ${tx("pan.usadit")}</button>`;
          }
        }
        // výspu staví hrdina, který na poli stojí — rovnou ji brání a může
        // se v ní usadit (dosah REACH pak měří odtud, ne od kapitálu)
        if (lzeStavetVyspu(me, t)) {
          const affordOp = canAfford(me, OUTPOST_COST);
          html += `<button id="btn-outpost" ${affordOp ? "" : "disabled"}
            title="${tx("pan.vyspa.tip.hrdina", { cap: OUTPOST_CAP })}">
            🗼 ${tx("pan.vyspa.postavit")} (${costStr(OUTPOST_COST)})</button>`;
        }
        html += klanPevnostBtnHtml(me, t);   // etapa 8: klanová pevnost na uzlu 2×2
        if (heroPinned(me, heroHereIdx)) {
          const eta = Math.max(...me.marches
            .filter(m => m.kind === "reinforce" && m.targetKey === selectedKey)
            .map(m => m.ticksLeft));
          html += `<p class="map-event-tag">📦 ${tx("pan.posily.cesta", { eta })}</p>${hh.rozkaz
              ? `<p class="map-event-tag">⚔ ${tx(hh.rozkaz.utok ? "pan.rozkaz.utok" : "pan.rozkaz.presun", { pole: tileLabel(G.tiles.get(hh.rozkaz.targetKey)) })}</p>` : ""}
            <button id="btn-cancel-conv">✕ ${tx(hh.rozkaz ? "pan.zrusit.posily.rozkaz" : "pan.zrusit.posily")}</button>`;
        }
        const rfRoom = Math.max(0, heroArmyCap(me, heroHereIdx) - heroArmyCommitted(me, heroHereIdx));
        if (armyTotal(me.units) > 0 && rfRoom > 0) {
          // předvyplněno maximum, ale jen do limitu velení hrdiny
          html += `<div class="unit-inputs">${unitInputsHtml("reinforce", me, Math.min(armyTotal(me.units), rfRoom), forceTilePanel)}</div>
            <button id="btn-reinforce">${tx("pan.poslat.posily")}</button>
            <p class="hint" id="rf-eta"></p>
            <p class="hint">${tx("pan.posily.hint", { strop: heroArmyCap(me, heroHereIdx), volne: rfRoom })}</p>`;
        } else if (rfRoom <= 0) {
          html += `<p class="hint">⚑ ${tx("pan.limit.veleni", { strop: heroArmyCap(me, heroHereIdx) })}</p>`;
        } else {
          html += `<p class="hint">${tx("pan.zadne.jednotky")}</p>`;
        }
      } else if (t.structure === "outpost") {
        // výspa: správa posádky — jednotky se přesouvají volně, drží trvalou stráž
        const inside = t.outpost || { inf: 0, arch: 0, cav: 0 };
        const room = OUTPOST_CAP - armyTotal(inside);
        html += `<h4>🗼 ${tx("pan.vyspa.posadka", { ted: armyTotal(inside), max: OUTPOST_CAP })}</h4>
          <p>${armyStr(inside)}</p>
          <p class="hint">${tx("pan.vyspa.hint")}</p>`;
        if (room > 0 && armyTotal(me.units) > 0) {
          html += `<div class="unit-inputs">${unitInputsHtml("op", me, Math.min(armyTotal(me.units), room), forceTilePanel)}</div>
            <button id="btn-op-in">${tx("pan.do.vyspy")}</button>`;
        } else if (room <= 0) {
          html += `<p class="hint">${tx("pan.vyspa.plna")}</p>`;
        }
        if (armyTotal(inside) > 0) {
          html += `<button id="btn-op-out">${tx("pan.z.vyspy")}</button>`;
        }
        const usazeni = me.heroes.map((h, i) => ({ h, i }))
          .filter(x => x.h.zakladna === selectedKey);
        if (usazeni.length) html += `<p class="hint">⌂ ${tx("pan.zakladna.hrdinu")}:
          ${usazeni.map(x => heroDef(me, x.i).name).join(", ")}</p>`;
      } else {
        html += `<p class="hint">${tx("pan.tve.uzemi", { kraj: regionOf(t) })}</p>`;
        html += abandonHtml(me, t);
        if (me.ring && me.ring.level >= 1 && t.structure !== "outpost") {
          const muze = me.ring.ap >= RING_COSTS.gather;
          html += `<button id="btn-gather" ${muze ? "" : "disabled"}
            title="${tx(me.ring.level >= 7 ? "pan.sklizen.tip2" : "pan.sklizen.tip", { cena: RING_COSTS.gather, mas: me.ring.ap })}">
            ⚡ ${tx("pan.sklizen")} (${RING_COSTS.gather} ⚡)</button>`;
        }
        if (lzeStavetVyspu(me, t)) {
          const affordOp = canAfford(me, OUTPOST_COST);
          html += `<button id="btn-outpost" ${affordOp ? "" : "disabled"}
            title="${tx("pan.vyspa.tip", { cap: OUTPOST_CAP })}">
            🗼 ${tx("pan.vyspa.postavit")} (${costStr(OUTPOST_COST)})</button>`;
        }
        html += klanPevnostBtnHtml(me, t);   // etapa 8: klanová pevnost na uzlu 2×2
        const ready = me.heroes.map((h, i) => ({ h, i }))
          .filter(x => heroReady(me, x.i, t) && x.h.pos !== selectedKey);
        if (ready.length) {
          html += `
            <h4>${tx("pan.presun.hrdiny")}</h4>
            <label>${tx("spol.hrdina")}: <select id="march-hero">${heroOptionsHtml(ready, me, t)}</select></label>
            <div class="unit-inputs" id="march-units">${unitInputsHtml("march", me, Math.min(30, armyTotal(me.units)), forceTilePanel)}</div>
            <p class="hint" id="march-eta"></p>
            <button id="btn-march">${tx("pan.presunout")}</button>
            <p class="hint">${tx("pan.presun.hint")}</p>`;
        }
      }
    }
  } else if (!zonaOtevrena(me, t)) {
    html += `<p class="hint">${zonaZamekTxt(me, t)}</p>`;
  } else if (jeUzel(t) && t.owner === -1 && t.uzelCd > 0) {
    html += `<p class="hint">⛔ ${tx("pan.uzel.zavreny", { doba: fmtTime(t.uzelCd) })}</p>`;
  } else if (t.structure === "throne" && !G.throneOpen) {
    html += `<p class="hint">${tx("pan.trun.zamek")}</p>`;
  } else if (t.owner !== -1 && hasPact(me, G.factions[t.owner])) {
    html += `<p class="hint">🤝 ${tx("pan.pakt", { rod: G.factions[t.owner].name, doba: fmtTime(myFaction().pacts[t.owner]) })}</p>`;
  } else if (isAdjacentToFaction(me, t)) {
    // v0.29: na kapitál jen s vyhlášenou válkou; hrdina jedná jen v dosahu základny
    const valkaTreba = t.structure === "capital" && t.owner !== -1 && !jeValka(me, t.owner);
    const ready = me.heroes
      .map((h, i) => ({ h, i }))
      .filter(x => heroReady(me, x.i, t) && vDosahu(me, x.h, t));
    if (valkaTreba) {
      html += `<p class="hint">⚔🔥 ${tx("pan.valka.treba", { rod: G.factions[t.owner].name })}</p>
        <button id="btn-war-jump">🏆 ${tx("pan.otevrit.skore")}</button>`;
    } else if (!ready.length) {
      const mimoDosah = me.heroes.some((h, i) => heroReady(me, i, t) && !vDosahu(me, h, t));
      html += mimoDosah
        ? `<p class="hint">🚫 ${tx("pan.mimo.dosahu", { reach: REACH })}</p>`
        : `<p class="hint">${tx("pan.zadny.hrdina")}</p>`;
    } else {
      const needed = marchNeeded(t);
      html += `
        <label>${tx("spol.hrdina")}: <select id="march-hero">${heroOptionsHtml(ready, me, t)}</select></label>
        <div class="unit-inputs" id="march-units">${unitInputsHtml("march", me, needed, forceTilePanel)}</div>
        <label class="chk-return"><input type="checkbox" id="march-return">
          ${tx("pan.najezd")}</label>
        <p class="hint" id="march-eta"></p>
        <button id="btn-march">${tx("pan.vyslat")}</button>
        <p class="hint">${tx("pan.vyslat.hint", { potreba: needed })}</p>`;
    }
  } else {
    html += `<p class="hint">${tx("pan.nesousedi")}</p>`;
  }
  panel.innerHTML = html;
  bindTilePanel(t, me);
}

// stav výdrže hrdiny „kolik ze kolika" pro výběr pochodu. Bez varování na
// nedostatek — hrdinu, kterému výdrž na cestu nestačí, odfiltruje heroReady
// dřív, než se do výběru vůbec dostane.
function staminaTxt(me, heroIdx) {
  const max = Math.round(heroStats(me, heroIdx).stamMax);
  return tx("spol.vydrz", { ted: Math.floor(me.heroes[heroIdx].stamina), max });
}

// volby hrdinů pro výběr pochodu (společné pro útok i přesun k obraně);
// řadí se podle vzdálenosti k cíli — nejbližší hrdina je předvybraný
function heroOptionsHtml(ready, me, t) {
  ready = [...ready].sort((a, b) =>
    gridDist(heroPosOf(me, a.i), t) - gridDist(heroPosOf(me, b.i), t));
  return ready.map(x => {
    const where = x.h.pos ? tx("pan.v.poli", { armada: armyStr(x.h.army) }) : tx("pan.doma");
    return `<option value="${x.i}" data-infield="${x.h.pos ? 1 : 0}">${heroDef(me, x.i).name}
      (${where} · ${staminaTxt(me, x.i)} · ${tx("spol.veleni")} ${heroStats(me, x.i).cap} · ${marchTime(me, t, x.i)} s · −${marchStaminaCost(me, t, x.i)} ${tx("spol.vydrze")})</option>`;
  }).join("");
}

// rozdělí `suggest` jednotek proporcionálně podle zásoby ve městě; součet
// NIKDY nepřesáhne suggest (dřív Math.ceil přestřelil o 1–2 jednotky a odeslání
// pak tiše selhalo na limitu velení). Používá formulář v panelu i rychlé
// potvrzení pochodu z kola.
function suggestArmy(me, suggest, klice) {
  // suggest je rozpočet VELENÍ (CP) — sarnská jednotka váží 2 body.
  // klice = druhy, mezi které se rozpočet dělí (od etapy 6 jen obsazené sloty).
  const cpOf = k => uDef(me, k).cp || 1;
  const kl = (klice && klice.length ? klice : UNIT_KEYS).filter(k => (me.units[k] || 0) > 0);
  const totalCp = kl.reduce((a, k) => a + me.units[k] * cpOf(k), 0);
  const vals = emptyArmy();
  let cpBudget = Math.max(0, Math.min(suggest, totalCp));
  for (const k of kl) {
    vals[k] = cpBudget > 0 && totalCp > 0
      ? Math.min(me.units[k], Math.floor(cpBudget * (me.units[k] * cpOf(k)) / totalCp / cpOf(k))) : 0;
  }
  let zbyva = cpBudget - kl.reduce((a, k) => a + vals[k] * cpOf(k), 0);
  for (const k of kl) {   // dorovnat zbytek po floorech
    const add = Math.min(Math.floor(zbyva / cpOf(k)), me.units[k] - vals[k]);
    if (add > 0) { vals[k] += add; zbyva -= add * cpOf(k); }
  }
  return vals;
}

// doporučený objem armády na dobytí pole — stejné číslo hlásí panel i varování
function marchNeeded(t) { return Math.ceil(tileDefense(t) / SOLDIER_POWER) + 1; }

// ---------- SKLÁDÁNÍ ARMÁDY DO TŘÍ FORMACÍ (etapa 6) ----------
// Rod má víc druhů jednotek než formací, takže se armáda neskládá výčtem všech
// typů, ale třemi SLOTY: co je vycvičené, vidíš v zásobníku a přetáhneš (nebo
// klepneš) do slotu, kde určíš počet. Roster tím může růst (T4, později T5,
// žoldnéři, druhý rod), a bitva zůstane o třech formacích.
//
// Stav slotů žije MIMO DOM — panel se překresluje každý tik a v DOMu by ho to
// smazalo (stejný důvod jako u recruitOrder ve v0.18). Po změně slotu se volá
// formaceObnov[prefix], což překreslí okolní panel i s bindingem.
const formaceSlotu = {};   // prefix → [klíč|null ×3]
const formaceObnov = {};   // prefix → překreslí okolní panel

function slotyProPrefix(prefix, me) {
  const dostupne = UNIT_KEYS.filter(k => (me.units[k] || 0) > 0);
  let sloty = formaceSlotu[prefix];
  // slot ukazující na druh, který mezitím došel, se uvolní
  if (sloty) sloty = sloty.map(k => (k && dostupne.includes(k)) ? k : null);
  if (!sloty || !sloty.some(Boolean)) {
    // výchozí = první tři druhy v pořadí UNIT_KEYS, tedy pěchota/střelci/jízda
    sloty = dostupne.slice(0, FORMACI_MAX);
    while (sloty.length < FORMACI_MAX) sloty.push(null);
  }
  formaceSlotu[prefix] = sloty;
  return sloty;
}

function formaceNastav(prefix, i, k) {
  const sloty = formaceSlotu[prefix];
  if (!sloty || i < 0 || i >= FORMACI_MAX) return;
  const kde = sloty.indexOf(k);
  if (kde !== -1) sloty[kde] = null;   // jeden druh nesmí být ve dvou slotech
  sloty[i] = k;
  if (formaceObnov[prefix]) formaceObnov[prefix]();
}

// Jednotky druhého rodu (klíče *2) mají pasivku i vylepšovací budovu zapsanou
// pod rodem, ze kterého pocházejí — ne pod naším. Bez tohohle překladu by
// UNIT_PASSIVES[me.key]["inf2"] vrátilo undefined a panel Výcviku by spadl.
function pasivkaJednotky(me, k) {
  const rod = jeDruhehoRodu(k) ? me.druhyRod : me.key;
  const klic = jeDruhehoRodu(k) ? DRUHY_ROD_KLICE[k] : k;
  return (UNIT_PASSIVES[rod] && UNIT_PASSIVES[rod][klic]) || null;
}
function budovaJednotky(me, k) {
  const rod = jeDruhehoRodu(k) ? me.druhyRod : me.key;
  const klic = jeDruhehoRodu(k) ? DRUHY_ROD_KLICE[k] : k;
  return (UNIT_UPGRADES[rod] && UNIT_UPGRADES[rod][klic]) || "";
}

function unitInputsHtml(prefix, me, suggest = 0, obnov) {
  if (obnov) formaceObnov[prefix] = obnov;
  const sloty = slotyProPrefix(prefix, me);
  const vals = suggestArmy(me, suggest, sloty.filter(Boolean));
  const zasobnik = UNIT_KEYS.filter(k => (me.units[k] || 0) > 0).map(k => {
    const d = uDef(me, k), uz = sloty.includes(k);
    return `<button type="button" class="fm-kus${uz ? " uz" : ""}" draggable="${!uz}"
      data-fm-pool="${prefix}" data-k="${k}"
      title="${d.name} — ${tx("rw.cp.za.kus", { cp: d.cp || 1 })}, ${tx("fm.vycviceno", { n: me.units[k] })}${uz ? " " + tx("fm.uz.ve.formaci") : ""}"
      >${d.icon}<span class="fm-n">${me.units[k]}</span></button>`;
  }).join("") || `<span class="hint">${tx("fm.nic")}</span>`;
  const boxy = sloty.map((k, i) => {
    if (!k) return `<div class="fm-slot prazdny" data-fm-slot="${prefix}" data-i="${i}">
        <span class="fm-hint">${tx("fm.prazdna")}</span></div>`;
    const d = uDef(me, k);
    return `<div class="fm-slot" data-fm-slot="${prefix}" data-i="${i}">
      <div class="fm-hlava"><span class="fm-jm">${d.icon} ${d.name}</span>
        <button type="button" class="fm-x" data-fm-clear="${prefix}" data-i="${i}"
          title="${tx("fm.uvolnit")}">✕</button></div>
      <input id="${prefix}-${k}" type="number" min="0" max="${me.units[k]}" value="${vals[k]}">
      <span class="maxn">/${me.units[k]} · ${d.cp || 1} CP</span>
    </div>`;
  }).join("");
  return `<div class="fm-zasobnik">${zasobnik}</div><div class="fm-sloty">${boxy}</div>`;
}

function readUnitInputs(prefix) {
  const army = emptyArmy();
  for (const k of UNIT_KEYS) {
    const el = $(`#${prefix}-${k}`);
    if (el) army[k] = parseInt(el.value, 10) || 0;
  }
  return army;
}

// Vstupy jednotek NEPUSTÍ součet přes rozpočet (v0.36): právě změněné pole
// se ořízne tak, aby se zbytek nastavení zachoval — dřív šlo napsat víc,
// než hrdina uveze, a odeslání pak tiše selhalo. vahaFn váží jednotku
// (velení = CP, kapacita výspy = kusy). Vrací true, když se řezalo.
function clampUnitInput(prefix, changedEl, budget, vahaFn) {
  if (!changedEl || budget == null) return false;
  const k = changedEl.id.slice(prefix.length + 1);
  if (!UNIT_KEYS.includes(k)) return false;
  const vaha = vahaFn || (() => 1);
  let ostatni = 0;
  for (const u of UNIT_KEYS) {
    if (u === k) continue;
    const el = $(`#${prefix}-${u}`);
    ostatni += (el ? parseInt(el.value, 10) || 0 : 0) * vaha(u);
  }
  const maxK = Math.max(0, Math.floor((budget - ostatni) / vaha(k)));
  if ((parseInt(changedEl.value, 10) || 0) > maxK) {
    changedEl.value = maxK;
    return true;
  }
  return false;
}

// ořez všech polí formuláře naráz (změna hrdiny mění rozpočet)
function clampAllUnitInputs(prefix, budget, vahaFn) {
  let rez = false;
  for (const k of UNIT_KEYS) {
    const el = $(`#${prefix}-${k}`);
    if (el && clampUnitInput(prefix, el, budget, vahaFn)) rez = true;
  }
  return rez;
}

// tři okna správy města (boční lišta) — dřív jeden panel hlavního města
// ---------- panel Výcvik ----------
// Zakázka se skládá jako armáda: u každého typu se jezdíkem nastaví počet
// kusů a naverbuje se všechno naráz. Objednávka žije MIMO DOM, aby ji
// překreslení panelu nesmazalo.
// Trvání od vteřin po dny. fmtDobu z game.js zaokrouhluje na minuty, takže
// by u krátkého výcviku psalo „0 minut" — a přesně tenhle druh nesmyslu si
// uživatel vyfotil (jmenovka hlásila „1 minut", zatímco běželo 13 271 s).
function fmtTrvani(ticks) {
  const s = Math.max(0, Math.round(ticks));
  if (s < 90) return s + " s";
  const min = Math.floor(s / 60);
  if (min < 90) return min + " min" + (s % 60 ? " " + (s % 60) + " s" : "");
  const h = Math.floor(min / 60);
  if (h < 48) return h + " h" + (min % 60 ? " " + (min % 60) + " min" : "");
  const d = Math.floor(h / 24);
  return tx("doba.dni", { n: d }) + (h % 24 ? " " + (h % 24) + " h" : "");
}

let recruitOrder = { inf: 0, arch: 0, cav: 0 };

function recruitOrderTotals(me) {
  let units = 0, cp = 0;
  for (const k of UNIT_KEYS) {
    const n = recruitOrder[k] || 0;
    units += n;
    cp += n * uDef(me, k).cp;
  }
  return { units, cp, cost: recruitOrderCost(me, recruitOrder) };
}

function recruitTotalsHtml(me) {
  const t = recruitOrderTotals(me);
  const enough = t.units > 0 && canAfford(me, t.cost);
  // doba VÝCVIKU je vidět dřív, než hráč objednávku potvrdí (zadání 30. 8.):
  // roste s objemem v CP a fronta se odbavuje postupně, takže rozhodnutí
  // „kolik jich chci" je zároveň rozhodnutí „jak dlouho na ně budu čekat"
  const doba = t.units ? recruitOrderTicks(me, recruitOrder) : 0;
  const fronta = recruitQueueTicks(me);
  return `<div class="rec-sum">
      <b>${t.units}</b> ${tx("spol.ks")}
      · <b>${t.cp}</b> ${tx("spol.veleni")}${doba ? ` · ⏳ <b>${fmtTrvani(doba)}</b>` : ""}
    </div>
    ${doba && fronta ? `<div class="rec-queue-note">${tx("vyc.fronta", { fronta: fmtTrvani(fronta), celkem: fmtTrvani(fronta + doba) })}</div>` : ""}
    <div class="rec-price ${t.units && !enough ? "short" : ""}">${t.units ? costStr(t.cost) : "—"}</div>
    <button class="btn-order" ${enough ? "" : "disabled"}>${tx("pot.vycvicit")}</button>`;
}

function trainPanelHtml(me) {
  // tempo se ukazuje na 100 bodech velení, ne na kusech — u sarna je kus za
  // 2 CP, takže „za 100 kusů" by mezi rody znamenalo pokaždé něco jiného
  const zaSto = recruitTicks(me, "inf", Math.max(1, Math.round(100 / (uDef(me, "inf").cp || 1))));
  let html = `<p class="hint">${tx("vyc.hlavicka", { uroven: me.buildings.barracks, doba: fmtTrvani(zaSto) })}</p>
    <div class="recruit-list">`;

  for (const k of UNIT_KEYS) {
    // bez spojeneckého rodu cizí sloty vůbec neexistují — nevypisovat je jako
    // „zamčené", hráč o nich nemá důvod vědět, dokud si spojence nevybere
    if (jeDruhehoRodu(k) && !me.druhyRod) continue;
    const u = uDef(me, k);
    const pas = pasivkaJednotky(me, k) || { name: "—", desc: "" };
    const locked = !unitUnlocked(me, k);
    const max = locked ? 0 : recruitAffordable(me, k);
    const n = Math.min(recruitOrder[k] || 0, max);
    recruitOrder[k] = n;
    const lockNote = tx("vyc.zamek.kasarny", { uroven: k === "arch" ? 2 : 3 });

    html += `<div class="rec-row${locked ? " locked" : ""}" data-type="${k}">
      <div class="rec-head">
        <span class="rec-name">${u.icon} ${u.name}</span>
        <span class="rec-cp">${tx("vyc.cp.ks", { cp: u.cp })}</span>
      </div>
      <div class="rec-stats" title="${tx("vyc.pasivka")} — ${pas.name}: ${pas.desc}">
        ❤${u.hp} 🗡${u.dmg} ⚔${u.atk} 🛡${u.def} · ${pas.name}
      </div>`;

    if (locked) {
      html += `<div class="rec-lock">${tx("vyc.zamceno")} — ${lockNote}</div>`;
    } else if (max <= 0) {
      html += `<div class="rec-lock">nedostatek surovin (${costStr(u.cost)} za ${RECRUIT_BATCH} ks)</div>`;
    } else {
      html += `<div class="rec-ctl">
        <input type="range" class="rec-slider" data-type="${k}"
          min="0" max="${max}" step="1" value="${n}"
          aria-label="${u.name} — ${tx("vyc.pocet.kusu")}">
        <output class="rec-count" data-type="${k}">${n}</output>
      </div>`;
    }
    html += `</div>`;
  }

  html += `</div><div class="rec-total">${recruitTotalsHtml(me)}</div>`;

  // Fronta se odbavuje po sobě, takže se i vypisuje JAKO FRONTA: co běží teď,
  // co čeká a v kolikáté minutě to bude hotové. Každá zakázka jde zrušit —
  // s dobou podle objemu umí jedno tažení jezdíku zablokovat kasárny na dlouho.
  const fronta = me.recruitQueue || [];
  if (!fronta.length) {
    html += `<p class="hint">${tx("vyc.ve.vycviku")}: —</p>`;
  } else {
    let cek = 0;
    html += `<div class="rec-queue"><div class="rec-q-head">${tx("vyc.ve.vycviku")}
      · hotovo za ${fmtTrvani(recruitQueueTicks(me))}</div>`;
    fronta.forEach((rq, i) => {
      cek += Math.max(0, rq.ticksLeft || 0);
      const u = uDef(me, rq.type);
      const celkem = rq.total || rq.ticksLeft || 1;
      const hotovo = Math.round(100 * (1 - (rq.ticksLeft || 0) / celkem));
      html += `<div class="rec-q-row${i === 0 ? " run" : ""}">
        <span class="rec-q-name">${u.icon} ${rq.count || RECRUIT_BATCH}× ${u.name}</span>
        <span class="rec-q-time">${i === 0 ? hotovo + " % · " : ""}${fmtTrvani(cek)}</span>
        <button class="rec-q-x" data-i="${i}"
          title="${tx("vyc.zrusit.zakazku")}">✕</button>
      </div>`;
    });
    html += `</div>`;
  }
  return html;
}

// ---------- panel Tržnice ----------
// Stejná logika jako Výcvik: výběr žije mimo DOM, jezdík mění jen náhled.
let marketTrade = { from: "food", to: "wood", amount: 0 };

function marketPreviewHtml(me) {
  const give = Math.min(marketTrade.amount, me.resources[marketTrade.from] | 0);
  const got = marketGain(me, give);
  const ok = got >= 1 && give >= MARKET_MIN && marketTrade.from !== marketTrade.to;
  return `<div class="mk-preview ${ok ? "" : "short"}">
      <b>${give}</b>${RES_ICONS[marketTrade.from]}
      <span class="mk-arrow">→</span>
      <b>${got}</b>${RES_ICONS[marketTrade.to]}
    </div>
    <button class="btn-trade" ${ok ? "" : "disabled"}>${tx("trz.smenit")}</button>`;
}

function marketPanelHtml(me) {
  const lvl = marketLevel(me);
  if (lvl < 1) {
    return `<p class="hint">${tx("trz.neni")}</p>`;
  }
  // cílová surovina nesmí být stejná jako zdrojová
  if (marketTrade.to === marketTrade.from)
    marketTrade.to = MARKET_RES.find(r => r !== marketTrade.from);

  const have = me.resources[marketTrade.from] | 0;
  marketTrade.amount = Math.min(marketTrade.amount, have);

  const radek = (kam, vybrano) => MARKET_RES.map(r => {
    const dis = kam === "to" && r === marketTrade.from;
    return `<button class="mk-res${r === vybrano ? " sel" : ""}" data-side="${kam}"
      data-res="${r}" ${dis ? "disabled" : ""} title="${RES_NAMES[r]}">
      ${RES_ICONS[r]}<span class="mk-have">${me.resources[r] | 0}</span></button>`;
  }).join("");

  return `<p class="hint">${tx("trz.uroven", { uroven: lvl })} · ${tx("trz.kurz")}
      <b>${Math.round(MARKET_RATE[lvl] * 100)} %</b>
      ${tx("trz.za100", { kolik: Math.round(MARKET_RATE[lvl] * 100) })} ·
      ${tx("trz.minimum", { n: MARKET_MIN })}</p>
    <p class="mk-label">${tx("bz.davas")}</p>
    <div class="mk-row">${radek("from", marketTrade.from)}</div>
    <div class="mk-ctl">
      <input type="range" class="mk-slider" min="0" max="${have}" step="1"
        value="${marketTrade.amount}" aria-label="${tx("trz.kolik.dat")}">
      <output class="mk-count">${marketTrade.amount}</output>
    </div>
    <p class="mk-label">${tx("trz.dostanes")}</p>
    <div class="mk-row">${radek("to", marketTrade.to)}</div>
    <div class="mk-total">${marketPreviewHtml(me)}</div>
    <p class="hint">${tx("trz.zlato")}</p>
    ${dailyShopHtml(me)}`;
}

// rotující denní obchod (v0.27): dárky hrdinů a výbava za ZLATO, nabídka
// dne je deterministická (stejná pro všechny na straně), odběry per účet
function dailyShopHtml(me) {
  const shop = marketShopOffers(sideOfFaction(me.key));
  const bought = acctShopBought();
  const noAcc = acct.mode === "remote" && !acct.remote;
  let html = `<h4 class="shop-head">🛒 ${tx("obch.nazev")} <small>— ${tx("obch.meni")}</small></h4>`;
  if (noAcc) return html + `<p class="hint">${tx("obch.bez.uctu")}</p>`;
  html += shop.offers.map(off => {
    const koupeno = bought[off.slot] || 0;
    const zbyva = Math.max(0, off.limit - koupeno);
    const dost = me.resources.gold >= off.cena;
    if (off.druh === "gift") {
      const tier = HERO_TIERS[off.tier];
      return `<div class="shop-card${zbyva ? "" : " sold"}">
        <span style="font-size:20px">${off.darek.icon}</span>
        <div class="shop-main"><b style="color:${tier.color}">${off.darek.name}</b>
          → ${off.jmeno} <span class="shop-sub">(${tier.name}) · +${GIFT_RESPECT} oddanosti</span>
          <div class="shop-sub">${zbyva ? tx("obch.jeste", { n: zbyva }) : tx("obch.vyprodano")}</div></div>
        <button class="btn-shop" data-slot="${off.slot}" ${zbyva && dost ? "" : "disabled"}>${off.cena} 🪙</button>
      </div>`;
    }
    const r = RARITIES[off.rarity];
    return `<div class="shop-card${zbyva ? "" : " sold"}">
      <span style="font-size:20px">🎲</span>
      <div class="shop-main"><b style="color:${r.color}">${tx("obch.nahodny.kus")} — ${r.name}</b>
        <span class="shop-sub">(strana ${SIDES[sideOfFaction(me.key)].icon})</span>
        <div class="shop-sub">${zbyva ? tx("obch.jeste", { n: zbyva }) : tx("obch.vyprodano")}</div></div>
      <button class="btn-shop" data-slot="${off.slot}" ${zbyva && dost ? "" : "disabled"}>${off.cena} 🪙</button>
    </div>`;
  }).join("");
  return html;
}

// nákup v denním obchodě — sólo rovnou, v MP přes server
function shopBuyAction(slot) {
  if (mp.active) { mpShopBuy(slot); return; }
  const res = buyShopOffer(player(), acct.local, slot);
  if (!res) return;
  saveLocalAccount();
  citySig = null;
  updatePanels();
  // dárek z obchodu umí odemknout hrdinu i R10 signature — slavit stejně
  if (res.druh === "gift") oslavyZVysledku(res.vysledek);
}
function onShopResult(res, slot) {
  citySig = null;
  updatePanels();
  if (res && res.druh === "gift") oslavyZVysledku(res.vysledek);
}

// IV-O: na 8. úrovni hlavní budovy si hráč JEDNOU ZA SEZÓNU vybere spřátelený
// rod své strany a smí verbovat jeho základní jednotky (vlajku ne). Volba se
// nedá vzít zpět, proto potvrzení dvojklikem jako u vyhlášení války.
let druhyRodArm = null;   // klíč rodu čekající na potvrzení
function druhyRodHtml(me) {
  if (me.druhyRod) {
    const d = FACTION_DEFS.find(x => x.key === me.druhyRod);
    return `<div class="dr-box hotovo">🤝 ${tx("dr.nazev")}: <b style="color:${d.color}">${d.name}</b>
      <span class="hint">${tx("dr.mas")}</span></div>`;
  }
  const chybi = DRUHY_ROD_MAIN - (me.buildings.main || 0);
  if (chybi > 0)
    return `<div class="dr-box"><b>🤝 ${tx("dr.nazev")}</b>
      <span class="hint">${tx("dr.zamek", { uroven: DRUHY_ROD_MAIN, chybi })}</span></div>`;
  return `<div class="dr-box"><b>🤝 ${tx("dr.vyber")}</b>
    <span class="hint">${tx("dr.popis")}</span>
    <div class="dr-volby">${nabidkaDruhehoRodu(me).map(k => druhyRodVolbaHtml(k)).join("")}</div></div>`;
}
// jedna dlaždice nabídky — vytažená ven, ať se nemusí vnořovat šablony
function druhyRodVolbaHtml(k) {
  const d = FACTION_DEFS.find(x => x.key === k);
  const u = FACTION_UNITS[k];
  const arm = druhyRodArm === k;
  const jm = ["inf", "arch", "cav"].map(x => u[x].icon + " " + u[x].name).join(" · ");
  const ikony = ["inf", "arch", "cav"].map(x => u[x].icon).join("");
  return `<button class="dr-volba${arm ? " arm" : ""}" data-dr="${k}"
    style="border-color:${d.color}" title="${jm}">
    <span style="color:${d.color}">${d.name}</span>
    <small>${ikony}${arm ? " — " + tx("dr.potvrd") : ""}</small></button>`;
}

function buildPanelHtml(me) {
  let html = "";
  for (const key in BUILDINGS) {
    const b = BUILDINGS[key];
    const lvl = me.buildings[key];
    let action;
    if (me.build && me.build.key === key) {
      action = `<span class="hint">${tx("bud.stavi.se", { s: me.build.ticksLeft })}</span>`;
    } else if (lvl >= b.max) {
      action = `<span class="hint">${tx("bud.max")}</span>`;
    } else {
      const info = buildCost(me, key);
      const check = canBuild(me, key);
      action = `<button class="btn-build" data-key="${key}" ${check.ok ? "" : "disabled"}
        title="${check.ok ? "" : check.why}">↑ ${costStr(info.cost)} · ${fmtDobu(info.time)}</button>`;
    }
    html += `<div class="build-row" title="${b.desc}">
      <span>${b.name} <b>${tx("spol.ur")} ${lvl}</b></span>${action}</div>`;
  }
  html += druhyRodHtml(me);
  html += `<p class="hint">${tx("bud.hint")}</p>`;
  return html;
}

function upgradePanelHtml(me) {
  let html = "";
  for (const k of UNIT_KEYS) {
    if (jeDruhehoRodu(k) && !me.druhyRod) continue;   // viz Výcvik
    const lvl = me.upgrades[k];
    const pas = pasivkaJednotky(me, k) || { name: "—", desc: "" };
    const upName = budovaJednotky(me, k) || tx("zkr.vylepseni");
    const bkey = "up_" + k;
    let action;
    if (me.build && me.build.key === bkey) {
      action = `<span class="hint">${tx("bud.stavi.se", { s: me.build.ticksLeft })}</span>`;
    } else if (lvl >= UPGRADE_MAX) {
      action = `<span class="hint">${tx("bud.max")}</span>`;
    } else {
      const info = buildCost(me, bkey);
      const check = canBuild(me, bkey);
      action = `<button class="btn-build" data-key="${bkey}" ${check.ok ? "" : "disabled"}
        title="${check.ok ? "" : check.why}">↑ ${costStr(info.cost)} · ${fmtDobu(info.time)}</button>`;
    }
    html += `<div class="build-row"
      title="${pas.name}: ${pas.desc}. ${tx("vyl.tip")}">
      <span>${uDef(me, k).icon} ${upName} <b>${tx("spol.ur")} ${lvl}</b></span>${action}</div>`;
  }
  html += `<p class="hint">${tx("vyl.hint")}</p>`;
  return html;
}

// křížek panelu pole: odznačí pole a panel schová
function bindTpClose() {
  const b = $("#tp-close");
  if (b) b.addEventListener("click", () => { selectedKey = null; selectedMarchHero = null; forceTilePanel(); });
}

function bindTilePanel(t, me) {
  bindTpClose();
  // zkratky hlavního města otevírají okna boční lišty
  document.querySelectorAll("#tile-panel .tp-open").forEach(btn =>
    btn.addEventListener("click", () => openSideWin(btn.dataset.win)));
  // (vazba Domů je v initu — tady jen připomínka, že město se otvírá odsud)
  const btnRf = $("#btn-reinforce");
  if (btnRf) {
    // živý odhad času konvoje podle složení posil
    const rfEta = $("#rf-eta");
    const heroHereIdx = me.heroes.findIndex(h => h.pos === keyOf(t.q, t.r));
    const updateRfEta = (zmeneny) => {
      if (!rfEta || heroHereIdx === -1) return;
      // tvrdý strop (v0.36): vstup nad volné velení se rovnou ořízne
      const room = Math.max(0, heroArmyCap(me, heroHereIdx) - heroArmyCommitted(me, heroHereIdx));
      const orezano = zmeneny
        ? clampUnitInput("reinforce", zmeneny, room, k2 => uDef(me, k2).cp || 1) : false;
      const army = readUnitInputs("reinforce");
      rfEta.classList.remove("warn");
      if (armyTotal(army) <= 0) {
        rfEta.textContent = tx("fp.vyber.jednotky");
        btnRf.disabled = true;
        return;
      }
      const time = Math.max(1, Math.round(
        travelTicks(t, capPosOf(me), REINFORCE_TICKS)
        * heroStats(me, heroHereIdx).convoyMult * armyTimeMult(army)));
      // velení se měří v CP (sarn váží 2 body/kus), ne v kusech
      const cp = armyCp(army, me);
      const over = cp > room;
      // tři formace: počítá se armáda hrdiny + konvoje na cestě + tyhle posily
      const dohromady = armyClone(me.heroes[heroHereIdx].army);
      for (const m of me.marches)
        if (m.kind === "reinforce" && m.targetKey === keyOf(t.q, t.r)) armyAdd(dohromady, m.army);
      armyAdd(dohromady, army);
      const moc = !lzeSestavit(dohromady);
      let rfTxt = tx("fp.konvoj", { s: time, cp, room });
      if (orezano) rfTxt += " · ✂ " + tx("fp.orezano.posily");
      if (over) rfTxt = tx("fp.pres.limit", { room });
      else if (moc) rfTxt = tx("pot.moc.formaci", { armada: armyStr(me.heroes[heroHereIdx].army, me), kolik: pocetFormaci(dohromady), max: FORMACI_MAX });
      rfEta.textContent = rfTxt;
      rfEta.classList.toggle("warn", over || moc || orezano);
      btnRf.disabled = over || moc; // dřív klik tiše selhal — teď je vidět proč
    };
    document.querySelectorAll('[id^="reinforce-"]').forEach(inp =>
      inp.addEventListener("input", () => updateRfEta(inp)));
    updateRfEta();
    btnRf.addEventListener("click", () => {
      if (startReinforce(me, t, readUnitInputs("reinforce"))) forceTilePanel();
      else if (rfEta) { rfEta.textContent = tx("fp.konvoj.nejde"); rfEta.classList.add("warn"); }
    });
  }
  const btnCc = $("#btn-cancel-conv");
  if (btnCc) btnCc.addEventListener("click", () => {
    const idx = me.heroes.findIndex(h => h.pos === keyOf(t.q, t.r));
    if (idx !== -1) cancelReinforce(me, idx);
    forceTilePanel();
  });
  const btnOp = $("#btn-outpost");
  if (btnOp) btnOp.addEventListener("click", () => { buildOutpost(me, t); forceTilePanel(); });
  // klanová pevnost (etapa 8)
  const btnKp = $("#btn-klan-pevnost");
  if (btnKp) btnKp.addEventListener("click", () => {
    postavKlanovouPevnost(me, t); klanSig = null; forceTilePanel();
  });
  const btnKb = $("#btn-klan-bourat");
  if (btnKb) btnKb.addEventListener("click", () => {
    zbourejKlanovouPevnost(me, t); klanSig = null; forceTilePanel();
  });
  // vyklízení pole (v0.39) — z panelu i ze seznamu 🗺 v liště
  const btnAb = $("#btn-abandon");
  if (btnAb) btnAb.addEventListener("click", () => {
    abandonTile(me, t); landPanelSig = null; forceTilePanel();
  });
  const btnAbC = $("#btn-abandon-cancel");
  if (btnAbC) btnAbC.addEventListener("click", () => {
    cancelAbandon(me, t); landPanelSig = null; forceTilePanel();
  });
  const btnGa = $("#btn-gather");
  if (btnGa) btnGa.addEventListener("click", () => { ringGather(me, t); forceTilePanel(); });
  const btnOpIn = $("#btn-op-in");
  if (btnOpIn) {
    // kapacita výspy se měří v KUSECH — vstupy nad volné místo se ořežou
    const opRoom = Math.max(0, OUTPOST_CAP - armyTotal(t.outpost || {}));
    document.querySelectorAll('[id^="op-"]').forEach(inp =>
      inp.addEventListener("input", () => clampUnitInput("op", inp, opRoom)));
    btnOpIn.addEventListener("click", () => {
      outpostDeposit(me, t, readUnitInputs("op"));
      forceTilePanel();
    });
  }
  const btnOpOut = $("#btn-op-out");
  if (btnOpOut) btnOpOut.addEventListener("click", () => { outpostWithdraw(me, t); forceTilePanel(); });
  // v0.29: usazení hrdiny na výspě + skok na diplomacii kvůli vyhlášení války
  const btnSettle = $("#btn-settle");
  if (btnSettle) btnSettle.addEventListener("click", () => {
    const idx = me.heroes.findIndex(h => h.pos === keyOf(t.q, t.r));
    if (idx !== -1) heroSettle(me, idx);
    forceTilePanel();
  });
  const btnWarJump = $("#btn-war-jump");
  if (btnWarJump) btnWarJump.addEventListener("click", () => {
    compTab.branch = "realm";
    openSideWin("branch");
  });
  const btnM = $("#btn-march");
  if (btnM) {
    const sel = $("#march-hero");
    const unitsBox = $("#march-units");
    const eta = $("#march-eta");
    // volné velení vybraného hrdiny — rozpočet pro tvrdý strop vstupů (v0.36)
    const volneVeleni = heroIdx =>
      Math.max(0, heroArmyCap(me, heroIdx) - heroArmyCommitted(me, heroIdx));
    let marchOrezano = false;
    // živý odhad času pochodu podle hrdiny a složení armády
    const updateEta = () => {
      if (!eta) return;
      const heroIdx = parseInt(sel.value, 10);
      const h = me.heroes[heroIdx];
      const army = h.pos ? h.army : readUnitInputs("march");
      eta.classList.remove("warn");
      if (armyTotal(army) <= 0) { eta.textContent = "Odhad pochodu: vyber jednotky."; btnM.disabled = false; return; }
      const mult = armyTimeMult(army);
      const time = Math.max(2, Math.round(
        marchTime(me, t, heroIdx) * heroStats(me, heroIdx).time * mult));
      const pct = Math.round((1 / mult - 1) * 100);
      let txt = tx("fp.pochod", { s: time, tempo: (pct >= 0 ? "+" : "") + pct });
      const gold = marchGoldCost(me, t, army);
      if (gold > 0) {
        txt += ` · ${tx("spol.zold")} ${gold} 🪙`;
        if (me.resources.gold < gold) txt += " — nedostatek zlata!";
      }
      // velení v CP (sarn váží 2/kus); přes strop tlačítko zamkne — dřív
      // klik tiše selhal (v MP bez jakékoli hlášky)
      const cap = heroStats(me, heroIdx).cap;
      const cp = armyCp(army, me);
      const over = !h.pos && cp > volneVeleni(heroIdx);
      if (!h.pos) txt += ` · ${tx("spol.veleni")} ${cp}/${volneVeleni(heroIdx)}`;
      if (marchOrezano) { txt += " · ✂ " + tx("fp.orezano.pochod"); marchOrezano = false; }
      if (over) txt += " — ⚠ " + tx("fp.pres.stropu", { strop: cap });
      eta.textContent = txt;
      eta.classList.toggle("warn", over);
      btnM.disabled = over;
    };
    const syncInputs = () => {
      const h = me.heroes[parseInt(sel.value, 10)];
      if (unitsBox) unitsBox.style.display = h.pos ? "none" : "";
      // nový hrdina = nový rozpočet velení — nastavené počty se dorovnají
      if (unitsBox && !h.pos && clampAllUnitInputs("march",
        volneVeleni(parseInt(sel.value, 10)), k2 => uDef(me, k2).cp || 1))
        marchOrezano = true;
      // průhledný náhled trasy vybraného hrdiny na mapě + diamant dosahu základny
      marchPreview = { from: heroPosOf(me, parseInt(sel.value, 10)),
        to: { q: t.q, r: t.r }, color: me.color };
      const [zq, zr] = heroBaseKey(me, h).split(",").map(Number);
      reachPreview = { q: zq, r: zr, color: me.color };
      const cf = $("#march-confirm");
      if (cf) cf.remove(); // změna hrdiny/jednotek ruší rozpracované potvrzení
      updateEta();
    };
    sel.addEventListener("change", syncInputs);
    if (unitsBox) unitsBox.querySelectorAll("input").forEach(inp =>
      inp.addEventListener("input", () => {
        if (clampUnitInput("march", inp, volneVeleni(parseInt(sel.value, 10)),
          k2 => uDef(me, k2).cp || 1)) marchOrezano = true;
        syncInputs();
      }));
    syncInputs();
    // první klik jen rozbalí potvrzení (s náhledem trasy); vyslání až druhým
    btnM.addEventListener("click", () => {
      if ($("#march-confirm")) return;
      const heroIdx = parseInt(sel.value, 10);
      const h = me.heroes[heroIdx];
      const army = h.pos ? armyClone(h.army) : readUnitInputs("march");
      if (armyTotal(army) <= 0) return;
      const mult = armyTimeMult(army);
      const time = Math.max(2, Math.round(marchTime(me, t, heroIdx) * heroStats(me, heroIdx).time * mult));
      // hrdina v poli: nabídnout doplnění posil, pokud má volné velení a zásobu
      const room = h.pos ? Math.max(0, heroArmyCap(me, heroIdx) - heroArmyCommitted(me, heroIdx)) : 0;
      const refill = h.pos && room > 0 && armyTotal(me.units) > 0
        ? `<button id="march-refill" title="${tx("fp.doplnit.tip")}">
            📦 ${tx("fp.doplnit", { volne: room })}</button>` : "";
      // stejná varování jako u rychlého potvrzení z kola na mapě
      const needed = t.owner === me.id ? 0 : marchNeeded(t);
      const goldCost = marchGoldCost(me, t, army);
      const warn = [];
      if (needed && armyTotal(army) < needed)
        warn.push(tx("pot.malo.jednotek", { mas: armyTotal(army), potreba: needed, obrana: tileDefense(t) }));
      if (goldCost > me.resources.gold)
        warn.push(tx("pot.malo.zlata", { potreba: goldCost, mas: Math.floor(me.resources.gold) }));
      btnM.insertAdjacentHTML("afterend", `<div id="march-confirm">
        <p>${tx("fp.potvrzeni", { hrdina: heroDef(me, heroIdx).name, pocet: armyTotal(army), pole: tileLabel(t), doba: fmtTime(time) })}</p>
        ${warn.map(w => `<p class="mc-warn">${w}</p>`).join("")}
        ${refill}
        <div class="mc-btns">
          <button id="march-go">⚔ Vyslat</button>
          <button id="march-cancel">✕ ${tx("spol.zrusit")}</button>
        </div></div>`);
      $("#march-go").addEventListener("click", () => {
        const chk = $("#march-return");
        const returnAfter = !!(chk && chk.checked);
        if (startMarch(me, t, h.pos ? null : readUnitInputs("march"), heroIdx, returnAfter)) {
          sfx.play("march"); marchPreview = null, reachPreview = null; forceTilePanel();
        }
      });
      $("#march-cancel").addEventListener("click", () => {
        const cf = $("#march-confirm");
        if (cf) cf.remove();
      });
      const rf = $("#march-refill");
      if (rf) rf.addEventListener("click", () => {
        selectedKey = h.pos; // panel pole hrdiny má formulář posil
        forceTilePanel();
      });
    });
  }
}

const RES_ICONS = { food: "🌾", wood: "🪵", stone: "🪨", iron: "⚙", gold: "🪙" };
// Jména surovin se čtou ZE SLOVNÍKU až při použití — konstanta složená při
// načtení by v sobě zamrazila jazyk platný v tu chvíli. `RES_NAMES` proto
// zůstává funkcí s indexovým přístupem přes Proxy, ať se nemusí přepisovat
// pětadvacet míst, která ho čtou jako tabulku.
const RES_NAMES = new Proxy({}, { get: (_, r) => tx("sur." + String(r)) });
// oddělovač tisíců je od zdražení budov (30. 8. 2026) nutnost — hlavní budova
// úrovně 8 stojí „450000🪨 150000🪵 400000🪙" a bez mezer se to nedá přečíst
function costStr(cost) {
  return Object.entries(cost)
    .map(([r, v]) => `${Math.round(v).toLocaleString(cisloJazyk())}${RES_ICONS[r]}`).join(" ");
}
// zkrácené rarity (do těsných míst) — čtou se ze slovníku až při použití
const RAR_SHORT = new Proxy({}, { get: (_, i) => tx("rar.kratce." + String(i)) });

// VÝNOSY SE UKAZUJÍ ZA HODINU (zadání uživatele 30. 8. 2026). Vnitřně se všechno
// dál počítá na TIK a tik je vteřinový (TICK_MS = 1000), takže hodina je prostý
// ×3600. Důvod: za vteřinu vycházel výnos slabého pole jako „+0,3" a u sezóny
// dlouhé 336 hodin se to nedalo porovnat s ničím — za hodinu je to „+900".
const ZA_HODINU = 3600;
const perHod = v => Math.round(v * ZA_HODINU);
const fmtHod = v => perHod(v).toLocaleString(cisloJazyk());
// zkrácený tvar do horní lišty, kde na „63 000" není místo
function fmtHodKratce(v) {
  const h = perHod(v);
  if (h >= 1000) return (Math.round(h / 100) / 10).toLocaleString(cisloJazyk()) + "k";
  return h.toLocaleString(cisloJazyk());
}

function incomeStr(inc) {
  const parts = [];
  for (const r in inc) if (inc[r] > 0) parts.push(`+${fmtHod(inc[r])}${RES_ICONS[r]}`);
  return parts.length ? parts.join(" ") + "/h" : tx("spol.zadny");
}

// kořist z boje sypou už jen klíčové stavby (první dobytí z neutrálu):
// Trůn legendárku jistě, pevnosti obou okruhů epický kus s 50% šancí
function structLootTxt(t) {
  if (t.owner !== -1) return null;
  if (t.structure === "throne")
    return `<span class="rar-chip" style="color:${RARITIES[4].color}">${tx("korist.legenda")}</span>`;
  if (t.structure === "grandfort" || t.structure === "fortress")
    return `<span class="rar-chip" style="color:${RARITIES[3].color}">${tx("korist.epika")}</span>`;
  return null;
}

// řádky „co za pole dostanu“ — výnos, skóre, kořist
function tileGainHtml(t, me, full) {
  const inc = tileIncomePreview(t, me);
  // uzel 2×2 (v0.30): výnos běží na KAŽDÉM poli bloku — panel ukazuje celek,
  // jinak hráč podstřelí hodnotu uzlu 4× (u 3×3 struktur zůstává známá mezera)
  const blok = t.bigSize === 2 && !t.structure ? 4 : 1;
  if (blok > 1) for (const r in inc) inc[r] = Math.round(inc[r] * blok * 10) / 10;
  const score = tierScore(t) * blok + (t.structure ? STRUCTURES[t.structure].score : 0);
  let html = `<p class="tile-gain">${tx("spol.vynos")}: <b>${incomeStr(inc)}</b>${blok > 1 ? ` <span class="hint-inline">${tx("pan.cely.blok")}</span>` : ""} · ${tx("spol.skore")}: <b>+${score}</b></p>`;
  if (t.owner !== me.id && full) {
    const loot = structLootTxt(t);
    if (loot) html += `<p class="tile-gain">🎁 ${tx("pan.korist")}: ${loot}</p>`;
  }
  return html;
}

let lastLogHtml = null;
// KRONIKA MÁ DVA KANÁLY (etapa 9): "svet" = serverový kanál událostí (pád
// klíčových bodů, dobyté rody, otevírání fází), "rod" = dění mého rodu.
// ⚠ Starý pohled „Celý Vellar" ZANIKL, a to je oprava, ne ztráta: server od
// etapy 9 posílá jen to, co hráč smí vidět, takže by ukazoval totéž co „Rod"
// a tvářil se, že je v něm celý svět.
let logView = "svet";

// záznamy podle filtru: vlastní akce, obecné hlášky (-1) a bitvy, kde jsem
// útočník či obránce (poznají se přes report — jeho strany nesou klíč frakce)
function logEntries() {
  const me = player();
  if (!me) return G.log;
  if (logView === "svet") return G.log.filter(e => e.factionId === -1);
  return G.log.filter(e => e.factionId === me.id
    || (e.reportId && G.reports.some(r => r.id === e.reportId
        && ((r.att && r.att.fkey === me.key) || (r.def && r.def.fkey === me.key)))));
}

function updateLog() {
  const el = $("#log");
  const rows = logEntries().slice(-15).reverse().map(e => {
    const color = e.factionId >= 0 ? G.factions[e.factionId].color : "#aab";
    const rep = e.reportId && G.reports.some(r => r.id === e.reportId)
      ? ` <a href="#" class="log-report" data-rep="${e.reportId}" title="${tx("kron.otevrit.report")}">📜</a>` : "";
    // ETAPA 12b: záznam s KLÍČEM se překládá tady u klienta; starší záznam
    // (nebo hláška, která se ještě nepřevedla) má hotovou větu v e.text
    const veta = e.klic ? tx(e.klic, e.param) : e.text;
    return `<div class="log-row"><span class="dot" style="background:${color}"></span>
      <span class="t">${fmtTime(e.tick)}</span> ${veta}${rep}</div>`;
  }).join("");
  const html = `<div class="log-tabs">
      <button class="log-tab${logView === "svet" ? " active" : ""}" data-view="svet">🌍 ${tx("chat.svet")}</button>
      <button class="log-tab${logView === "rod" ? " active" : ""}" data-view="rod">⚔ ${tx("konec.rod")}</button>
    </div>` + (rows || `<p class="hint">${tx("kron.prazdno")}</p>`);
  if (html === lastLogHtml) return; // beze změny nepřekreslovat (a nehýbat scrollem)
  lastLogHtml = html;
  el.innerHTML = html;
}

// ---------- Bojové reporty (podle předlohy RtW) ----------
let reportOpenId = null;
// Přečtené reporty. V síťové hře je zdrojem pravdy SERVER (posílá `precteno`
// v každém stavu), takže stav přežije reload i přechod na jiné zařízení —
// dřív žil jen v této relaci prohlížeče. V sólu zůstává relační.
const readReports = new Set();
function oznacPrecteno(ids) {
  for (const id of ids) readReports.add(id);
  if (typeof mp !== "undefined" && mp.active && typeof netSend === "function")
    netSend(ids.length > 1 ? { type: "reportPrecten", vse: true } : { type: "reportPrecten", id: ids[0] });
}

function unreadReportCount() {
  return G.reports.filter(r => !readReports.has(r.id)).length;
}

function openReport(id) {
  const rep = G.reports.find(r => r.id === id);
  if (!rep) return;
  reportOpenId = id;
  oznacPrecteno([id]);
  sfx.play("report");
  renderReportWindow();
  $("#report-overlay").classList.remove("hidden");
}

function closeReport() {
  reportOpenId = null;
  $("#report-overlay").classList.add("hidden");
}

// tlačítko ⚔ na liště: otevře okno bitev (poslední report, nebo prázdný stav)
function openReportsWindow() {
  const latest = G.reports[G.reports.length - 1];
  if (latest) { openReport(latest.id); return; }
  reportOpenId = null;
  $("#report-window").innerHTML = `<div class="rw">
    <p class="hint" style="padding:30px 20px">${tx("rep.prazdno")}</p></div>`;
  $("#report-overlay").classList.remove("hidden");
}

// okno reportů: seznam bitev vlevo (se stavem přečtení), detail vpravo
// MOJE vs KLANOVÉ (etapa 9): report je „můj", když jsem mezi účastníky bitvy;
// jinak je klanový (dostal jsem ho, protože je v klanu někdo, kdo se jí účastnil).
// Staré reporty `ucastnici` nemají — počítají se jako moje, ať nezmizí.
function reportMuj(r) {
  const me = player();
  if (!me || !r.ucastnici) return true;
  return r.ucastnici.includes(aktorKlic(me));
}
let repFiltr = "moje";   // "moje" | "klan"

function renderReportWindow() {
  const rep = G.reports.find(r => r.id === reportOpenId);
  if (!rep) { closeReport(); return; }
  const klanovych = G.reports.filter(r => !reportMuj(r)).length;
  const videt = G.reports.filter(r => repFiltr === "klan" ? !reportMuj(r) : reportMuj(r));
  const list = [...videt].reverse().map(r => `
    <button class="rw-item${r.id === reportOpenId ? " active" : ""}" data-rep="${r.id}">
      <span class="rw-res ${r.won ? "win" : "loss"}">${r.won ? "⚔" : "🛡"}</span>
      <span class="rw-meta"><b>${r.tileJm ? tx(r.tileJm.klic, r.tileJm.param) : r.tileName}</b>
        <small>${fmtTime(r.tick)} · ${tx(r.won ? "rw.dobyto" : "rw.ubraneno").toLowerCase()}</small></span>
      ${readReports.has(r.id) ? "" : `<span class="rw-unread" title="${tx("rep.neprecteno")}"></span>`}
    </button>`).join("");
  $("#report-window").innerHTML = `
    <div class="rw">
      <div class="rw-list">
        ${klanovych ? `<div class="rw-taby">
          <button class="rw-tab${repFiltr === "moje" ? " active" : ""}" data-filtr="moje">⚔ ${tx("rep.moje")}</button>
          <button class="rw-tab${repFiltr === "klan" ? " active" : ""}" data-filtr="klan">🛡 ${tx("rep.klanove")} (${klanovych})</button>
        </div>` : ""}
        <button id="rw-readall" class="rw-readall" title="${tx("rep.vse.tip")}">✔ ${tx("rep.vse")}</button>
        ${list}
      </div>
      <div class="rw-main">${reportHtml(rep)}</div>
    </div>`;
  document.querySelectorAll("#report-window .rw-item").forEach(b =>
    b.addEventListener("click", () => openReport(parseInt(b.dataset.rep, 10))));
  document.querySelectorAll("#report-window .rw-tab").forEach(b =>
    b.addEventListener("click", () => { repFiltr = b.dataset.filtr; renderReportWindow(); }));
  $("#rw-readall").addEventListener("click", () => {
    oznacPrecteno(G.reports.map(r => r.id));
    renderReportWindow();
  });
}

// blok velitele v hlavičce reportu: portrét, úroveň, jméno, frakce, pruh armády
// Jméno strany reportu: neutrální posádka nese KLÍČ (překládá se), rod nese
// vlastní jméno (nepřekládá se). Starší reporty klíč nemají a použijí větu.
function repJmeno(p) { return p && p.nameKlic ? tx(p.nameKlic) : (p && p.name) || ""; }
function cmdrBlockHtml(rep, side) {
  const isAtt = side === "att";
  const p = rep[side];
  const init = isAtt ? armyTotal(rep.initA) : armyTotal(rep.initD);
  const rem = isAtt
    ? (rep.attRem ? armyTotal(rep.attRem) : 0)
    : (rep.remD ? armyTotal(rep.remD) : Math.max(0, init - rep.defKilled));
  const remPct = init > 0 ? Math.min(100, rem / init * 100) : 0;
  const portrait = p.fkey != null && p.heroDef != null
    ? `<img class="rw-face" src="${heroPortraitURL(p.fkey, p.heroDef)}" alt="">`
    : `<div class="rw-face militia" title="${tx("rw.domobrana.tip")}">🛡</div>`;
  const heroName = isAtt ? p.hero : (p.leadName || (p.heroes && p.heroes[0]) || tx("rw.domobrana"));
  const hp = isAtt ? rep.heroHpA : rep.heroHpD;
  const fell = isAtt ? rep.heroFellA : rep.heroFellD;
  return `<div class="rw-cmdr">
    <div class="rw-portrait">${portrait}
      ${p.level ? `<span class="rw-lvl">${p.level}</span>` : ""}</div>
    <b class="rw-hero">${heroName}</b>
    <small class="rw-fac" style="color:${p.color}">${repJmeno(p)}</small>
    ${hp != null ? `<small class="rw-hp">${fell ? "💔" : "❤"} ${hp}${fell ? " — padl" : ""}</small>` : ""}
    <div class="rw-armybar" title="${isAtt ? armyStr(rep.attRem || rep.initA) : armyStr(rep.remD || rep.initD)}">
      <div class="rw-armyfill" style="width:${remPct}%;background:${p.color}"></div>
    </div>
    <small class="rw-armynum">${Math.round(rem).toLocaleString(cisloJazyk())} / ${Math.round(init).toLocaleString(cisloJazyk())}
      ${!isAtt && rep.def.homeUnits ? " " + tx("rw.vc.zasoby") : ""}</small>
  </div>`;
}

// ---------- FORMACE V REPORTU (v0.52) ----------
// S liniemi z IV-N přestalo stačit „obránce ztratil 300 jednotek": hráč
// potřebuje vidět, KDO na koho mířil a jestli měla strana clonu. Vše se čte
// z reportu — `fkey` obou stran dá tabulku jednotek (neutrál nemá žádný,
// `unitsOf` pak spadne na základní UNIT_TYPES).
// popisky řad se čtou AŽ PŘI VYKRESLENÍ (`radaTxt`), ne do konstanty —
// konstanta složená při načtení by v sobě zamrazila tehdejší jazyk
function radaTxt(rada) { return znaKlic("rw.rada." + rada) ? tx("rw.rada." + rada) : rada; }

// strana reportu = { fkey, druhyRod } — bez spojence by se jednotky půjčené
// od druhého rodu (klíče *2) nedaly pojmenovat a vypsaly by se jako „❔ inf2"
function repUd(s, k) {
  const ud = unitsOf(s && s.fkey, (s && s.druhyRod) || null) || UNIT_TYPES;
  return ud[k] || UNIT_TYPES[k] || { icon: "❔", name: k, cp: 1 };
}
function repFormace(army, s) {
  const ud = unitsOf(s && s.fkey, (s && s.druhyRod) || null) || UNIT_TYPES;
  return UNIT_KEYS.filter(k => (army && army[k] > 0.5)).map(k => ({
    k, d: repUd(s, k), n: Math.round(army[k]), rada: radaJednotky(ud, k),
  }));
}
// jedna strana sestavy: formace s rolí a počtem
function repSestavaCol(army, strana, ico, jmeno) {
  const rs = repFormace(army, strana);
  const maClonu = rs.some(x => x.rada === "clona");
  const maStrelce = rs.some(x => x.rada === "strelec");
  return `<div class="rw-sest-col">
    <div class="rw-sest-h">${ico} ${jmeno}</div>
    ${rs.length ? rs.map(x => `<div class="rw-form">
        <span class="rw-fico">${x.d.icon}</span>
        <span class="rw-fname" title="${x.d.name} · ${tx("rw.cp.za.kus", { cp: x.d.cp || 1 })}">${x.d.name}</span>
        <span class="rw-frada rada-${x.rada}">${radaTxt(x.rada)}</span>
        <span class="rw-fn">${x.n.toLocaleString(cisloJazyk())}</span></div>`).join("")
      : `<div class="rw-form"><span class="rw-fname">—</span></div>`}
    ${!maClonu && maStrelce
      ? `<div class="rw-fwarn">⚠ ${tx("rw.bez.clony")}</div>` : ""}
  </div>`;
}
function repSestavyHtml(rep) {
  return `<div class="rw-sestavy">
    ${repSestavaCol(rep.initA, rep.att, "⚔", repJmeno(rep.att))}
    ${repSestavaCol(rep.initD, rep.def, "🛡", repJmeno(rep.def))}
  </div>`;
}
// kdo na koho mířil za celou bitvu (řazeno podle poškození)
function repStretyHtml(rep) {
  if (!rep.strety || !rep.strety.length) return "";   // reporty před v0.52
  const max = Math.max(...rep.strety.map(x => x.d)) || 1;
  const radek = x => {
    const utoc = x.s === "a" ? rep.att : rep.def;
    const cil = x.vl ? utoc : (x.s === "a" ? rep.def : rep.att);
    const od = x.k === null
      ? `<span class="rw-fico">⚑</span> ${tx("rw.velitel")}`
      : `<span class="rw-fico">${repUd(utoc, x.k).icon}</span> ${repUd(utoc, x.k).name}`;
    return `<div class="rw-stret${x.vl ? " vlastni" : ""}"
        title="${x.vl ? tx("rw.silenstvi") : ""}">
      <span class="rw-st-s">${x.s === "a" ? "⚔" : "🛡"}</span>
      <span class="rw-st-od">${od}</span>
      <span class="rw-st-sip">${x.vl ? "🌀→" : "→"}</span>
      <span class="rw-st-na"><span class="rw-fico">${repUd(cil, x.c).icon}</span> ${repUd(cil, x.c).name}</span>
      <span class="rw-st-bar"><i style="width:${Math.round(x.d / max * 100)}%"></i></span>
      <span class="rw-st-d">${x.d.toLocaleString(cisloJazyk())}</span>
    </div>`;
  };
  return `<details class="rw-strety" open>
    <summary>${tx("rw.strety", { n: rep.strety.length })}</summary>
    ${rep.strety.map(radek).join("")}</details>`;
}

function reportHtml(rep) {
  const totalA0 = armyTotal(rep.initA), totalD0 = armyTotal(rep.initD);
  const side = (ico, color, remArmy, killed, init, strana) => {
    const rem = armyTotal(remArmy);
    const remPct = init > 0 ? Math.min(100, rem / init * 100) : 0;
    const lossPct = init > 0 ? Math.min(100 - remPct, killed / init * 100) : 0;
    // rozpad po formacích: bez něj není vidět, KTERÁ linie se hroutí
    const rozpad = repFormace(remArmy, strana)
      .map(x => `<span class="rep-fk" title="${x.d.name} — ${radaTxt(x.rada)}">${x.d.icon}${x.n.toLocaleString(cisloJazyk())}</span>`)
      .join("") || `<span class="rep-fk">—</span>`;
    return `<div class="rep-side"><span class="rep-ico">${ico}</span>
      <div class="rep-bar">
        <div class="rep-fill" style="width:${remPct}%;background:${color}"></div>
        <div class="rep-lost" style="width:${lossPct}%"></div>
      </div>
      <span class="rep-num" title="${armyStr(remArmy, strana && strana.fkey)}">${Math.round(rem)}${killed > 0 ? `<em>−${killed}</em>` : ""}</span>
    </div>
    <div class="rep-forms">${rozpad}</div>`;
  };
  // ETAPA 12b: událost reportu smí být KLÍČ — `{s,klic,param}`. Větu skládá
  // klient ve svém jazyce, ikonu strany (⚔/🛡) lepí až tady. Starší reporty
  // nesou hotový řetězec, ten se vypíše rovnou.
  const evTxt = e => typeof e === "string" ? e
    : ((e.s === "a" ? "⚔ " : e.s === "d" ? "🛡 " : "") + tx(e.klic, e.param));
  const evs = list => list && list.length
    ? `<div class="rep-evs">${list.map(e => `<span class="rep-ev">${evTxt(e)}</span>`).join("")}</div>` : "";

  // hlavička: velitelé proti sobě + banner výsledku
  let html = `<div class="rw-head">
    ${cmdrBlockHtml(rep, "att")}
    <div class="rw-banner ${rep.won ? "win" : "loss"}">
      <div class="rw-result">${tx(rep.won ? "rw.dobyto" : "rw.ubraneno")}</div>
      <div class="rw-tile">⚔ ${rep.tileJm ? tx(rep.tileJm.klic, rep.tileJm.param) : rep.tileName}</div>
      <small>${fmtTime(rep.tick)} · ${tx("rw.kol", { n: rep.rounds })}</small>
    </div>
    ${cmdrBlockHtml(rep, "def")}
  </div>`;

  // souhrnné metriky (Poškození velitele × jednotek — jako v předloze)
  if (rep.tot) {
    const t = rep.tot;
    const fmt = v => Math.max(0, Math.round(v)).toLocaleString(cisloJazyk());
    const row = (a, label, d, tip) => `<div class="rw-srow" title="${tip}">
      <span class="rw-sval">${a}</span><span class="rw-slab">${label}</span><span class="rw-sval">${d}</span></div>`;
    html += `<div class="rw-stats">
      ${row(fmt(armyTotal(rep.attLosses || emptyArmy())), tx("rw.padle"), fmt(rep.defKilled), tx("rw.padle.tip"))}
      ${row(fmt(t.dmgA - t.cmdA), tx("rw.dmg.jednotek"), fmt(t.dmgD - t.cmdD), tx("rw.dmg.jednotek.tip"))}
      ${row(fmt(t.cmdA), tx("rw.dmg.velitele"), fmt(t.cmdD), tx("rw.dmg.velitele.tip"))}
      ${(t.revA || t.revD) ? row(fmt(t.revA), tx("rw.obnovene"), fmt(t.revD), tx("rw.obnovene.tip")) : ""}
      ${(t.avoidA || t.avoidD) ? row(fmt(t.avoidA || 0), tx("rw.pohlcene"), fmt(t.avoidD || 0), tx("rw.pohlcene.tip")) : ""}
    </div>`;
  }

  html += repSestavyHtml(rep);
  html += evs(rep.pre);
  html += repStretyHtml(rep);
  // průběh po kolech — sbalený detail, ať souhrn zůstane přehledný
  let rounds = "";
  // BOJOVÝ LOG KOLO PO KOLE (IV-P, zadání uživatele): kdo v kole jedná
  // a v jakém pořadí, koho trefil a za kolik, kolik se vyléčilo a jaké stavy
  // zrovna běží. Reporty ze starších verzí `akce` nemají — blok se pak
  // přeskočí, nespadne.
  const jm = (rep, strana, k) => {
    const kdo = strana === "a" ? rep.att : rep.def;
    // útočník nese jméno v .hero, obránce (i neutrální) v .leadName
    if (k === null || k === undefined) return (kdo.hero || kdo.leadName || tx("rw.velitel"));
    const u = repUd(kdo, k);
    return u ? u.icon + " " + u.name : "❔ " + k;
  };
  const prubehHtml = rd => {
    if (!rd.akce || !rd.akce.length) return "";
    const por = (rd.poradi || []).map(p =>
      `<span class="lg-por ${p.s === "a" ? "att" : "def"}">${jm(rep, p.s, p.k)}</span>`).join(" › ");
    const radky = rd.akce.map(a => `<div class="lg-akce ${a.s === "a" ? "att" : "def"}">
        <span class="lg-kdo">${jm(rep, a.s, a.k)}</span>
        <span class="lg-sip">${a.vl ? "🌀→" : "→"}</span>
        <span class="lg-cil">${jm(rep, a.vl ? a.s : (a.s === "a" ? "d" : "a"), a.c)}${a.vl ? " " + tx("rw.vlastni") : ""}</span>
        <span class="lg-dmg">${a.d.toLocaleString(cisloJazyk())}</span>${a.op ? `<span class="lg-tag">${tx("rw.navazujici")}</span>` : ""}
      </div>`).join("");
    const stavTxt = (st, znak) => {
      if (!st) return "";
      const c = [];
      if (st.stun) c.push("💫 " + tx("rw.omracen"));
      if (st.sil && st.sil.length) c.push("🌀 " + tx("rw.sili") + ": " + st.sil.map(k => jm(rep, znak, k)).join(", "));
      if (st.st) c.push(`📈 ${tx("rw.stohy", { n: st.st })}`);
      return c.length ? `<span class="lg-stav ${znak === "a" ? "att" : "def"}">${c.join(" · ")}</span>` : "";
    };
    const lec = [];
    if (rd.lecA) lec.push(`<span class="lg-lec att">⚕ ${tx("rw.utocnik.lecil", { n: rd.lecA.toLocaleString(cisloJazyk()) })}</span>`);
    if (rd.lecD) lec.push(`<span class="lg-lec def">⚕ ${tx("rw.obrance.lecil", { n: rd.lecD.toLocaleString(cisloJazyk()) })}</span>`);
    const stavy = [stavTxt(rd.stavA, "a"), stavTxt(rd.stavD, "d"), ...lec].filter(Boolean).join(" ");
    return `<details class="lg-box"><summary>${tx("rw.prubeh.kola", { n: rd.akce.length })}</summary>
      ${por ? `<div class="lg-poradi"><span class="lg-label">${tx("rw.poradi")}:</span> ${por}</div>` : ""}
      ${radky}
      ${stavy ? `<div class="lg-stavy">${stavy}</div>` : ""}
    </details>`;
  };
  for (const rd of rep.roundLog) {
    rounds += `<div class="rep-round">
      <div class="rep-rhead"><b>${tx("rw.kolo", { n: rd.r })}</b>
        <span class="rep-pow" title="${tx("rw.dmg.tip")}">🗡 ${rd.pA.toLocaleString(cisloJazyk())} : ${rd.pD.toLocaleString(cisloJazyk())}</span>${rd.hpA != null || rd.hpD != null
          ? `<span class="rep-pow" title="${tx("rw.hp.tip")}">❤ ${rd.hpA != null ? rd.hpA : "—"} : ${rd.hpD != null ? rd.hpD : "—"}</span>` : ""}</div>
      ${side("⚔", rep.att.color, rd.remA, rd.killedA, totalA0, rep.att)}
      ${side("🛡", rep.def.color, rd.remD, rd.killedD, totalD0, rep.def)}
      ${prubehHtml(rd)}
      ${evs(rd.ev)}
    </div>`;
  }
  html += `<details class="rw-rounds" open>
    <summary>${tx("rw.prubeh.bitvy", { n: rep.rounds })}</summary>${rounds}</details>`;
  html += evs(rep.post);
  html += `<p class="rep-final">${rep.won
    ? "⚑ " + tx("rw.zaver.vyhra", { rod: repJmeno(rep.att), obrance: rep.defKilled, utocnik: armyTotal(rep.attLosses), zbytek: armyStr(rep.attRem) })
    : "🛡 " + tx("rw.zaver.prohra", { rod: repJmeno(rep.def), utocnik: armyTotal(rep.attLosses), obrance: rep.defKilled })}</p>`;
  return html;
}

// ---------- Radiální menu akcí na poli ----------
// klik na pole rozvine kolo ikon s dostupnými akcemi (útok, přesun, stráž,
// posily, odvolání); útok a přesun pokračují výběrem hrdiny — nejbližší první
let tileMenuKey = null;

function hideTileMenu() {
  const m = $("#tile-menu");
  if (m) { m.classList.add("hidden"); m.innerHTML = ""; }
  tileMenuKey = null;
  // zavření kola (i tahem mapy) nesmí nechat na mapě viset náhledy
  marchPreview = null;
  reachPreview = null;
}

function positionTileMenu(t) {
  const menu = $("#tile-menu");
  const p = tileToPixel(t.q, t.r);
  menu.style.left = ((p.x - camera.x) * camera.zoom + canvas.width / 2) + "px";
  menu.style.top = ((p.y - camera.y) * camera.zoom + canvas.height / 2) + "px";
  menu.classList.remove("hidden");
}

function tileMenuActions(t, me) {
  const key = keyOf(t.q, t.r);
  const acts = [];
  if (!TERRAIN[t.terrain].passable) return acts;
  const own = t.owner === me.id;
  const heroHereIdx = me.heroes.findIndex(h => h.pos === key);
  const anyReady = me.heroes.some((h, i) => heroReady(me, i, t) && h.pos !== key);
  // výspa: nabízí se na vlastním poli s hrdinou i bez něj, ale jen tam,
  // kde buildOutpost skutečně projde (jinak by bublina tiše selhala)
  const vyspaMozna = lzeStavetVyspu(me, t) && canAfford(me, OUTPOST_COST);
  const vyspaAkce = { icon: "🗼", label: tx("pan.vyspa.postavit"),
    act: () => { hideTileMenu(); buildOutpost(me, t); forceTilePanel(); } };
  if (!own) {
    const blocked = (t.structure === "throne" && !G.throneOpen)
      || !zonaOtevrena(me, t)                              // zamčená zóna (v0.30)
      || (jeUzel(t) && t.owner === -1 && t.uzelCd > 0)     // uzavřený uzel
      || (t.owner !== -1 && hasPact(me, G.factions[t.owner]))
      || !isAdjacentToFaction(me, t);
    // v0.29: na kapitál jen s vyhlášenou válkou — kolo nabídne skok na diplomacii
    const valkaTreba = t.structure === "capital" && t.owner !== -1 && !jeValka(me, t.owner);
    if (!blocked && valkaTreba) {
      acts.push({ icon: "🔥", label: tx("kolo.vyhlasit.valku"), act: () => {
        hideTileMenu();
        compTab.branch = "realm";
        openSideWin("branch");
      } });
    } else if (!blocked && anyReady)
      acts.push({ icon: "⚔", label: tx("kolo.zautocit"), act: () => showHeroPick(t, tx("kolo.zautocit")) });
  } else if (t.structure === "capital") {
    // hlavní město: bubliny kola = rychlé skoky na městské agendy (v0.30)
    acts.push({ icon: "🏰", label: tx("kolo.stavet"),
      act: () => { hideTileMenu(); openSideWin("build"); } });
    acts.push({ icon: "🗡", label: tx("zkr.vycvik"),
      act: () => { hideTileMenu(); openSideWin("train"); } });
    acts.push({ icon: "⚒", label: tx("zkr.vylepseni"),
      act: () => { hideTileMenu(); openSideWin("upgrade"); } });
  } else if (heroHereIdx !== -1) {
    const h = me.heroes[heroHereIdx];
    acts.push({ icon: "🛡", label: tx(h.guard ? "hrd.straz.konec" : "kolo.straz"),
      act: () => { hideTileMenu(); toggleGuard(me, heroHereIdx); forceTilePanel(); } });
    if (heroPinned(me, heroHereIdx)) {
      acts.push({ icon: "✕", label: tx("hrd.zrusit.posily"),
        act: () => { hideTileMenu(); cancelReinforce(me, heroHereIdx); forceTilePanel(); } });
    } else if (!heroBusy(me, heroHereIdx)) {
      if (armyTotal(me.units) > 0)
        acts.push({ icon: "📦", label: tx("kolo.poslat.posily"), act: () => focusPanelEl("#btn-reinforce") });
      if (vyspaMozna) acts.push(vyspaAkce);
      acts.push({ icon: "🏠", label: tx("kolo.odvolat"),
        act: () => { hideTileMenu(); startRecall(me, heroHereIdx); forceTilePanel(); } });
    }
  } else {
    // vlastní pole bez hrdiny: přesun hrdiny sem i stavba výspy na místě
    if (anyReady)
      acts.push({ icon: "🥾", label: tx("kolo.presun"), act: () => showHeroPick(t, tx("kolo.presun")) });
    if (vyspaMozna) acts.push(vyspaAkce);
  }
  return acts;
}

function showTileMenu(t) {
  hideTileMenu();
  const me = player();
  if (!me || !G.running || G.gameOver || !t) return;
  if (!isExplored(keyOf(t.q, t.r))) return;
  const acts = tileMenuActions(t, me);
  if (!acts.length) return;
  tileMenuKey = keyOf(t.q, t.r);
  const menu = $("#tile-menu");
  const R = 54;
  menu.innerHTML = acts.map((a, i) => {
    const ang = -Math.PI / 2 + i * (2 * Math.PI / Math.max(acts.length, 3));
    const x = Math.round(Math.cos(ang) * R), y = Math.round(Math.sin(ang) * R);
    return `<button class="tm-btn" data-i="${i}" style="left:${x}px;top:${y}px">
      <span class="tm-ico">${a.icon}</span><span class="tm-lbl">${a.label}</span></button>`;
  }).join("");
  positionTileMenu(t);
  menu.querySelectorAll(".tm-btn").forEach(btn => btn.addEventListener("click", () =>
    acts[parseInt(btn.dataset.i, 10)].act()));
}

// druhý krok kola: výběr hrdiny pro útok/přesun (řazeno vzdáleností k cíli)
function showHeroPick(t, title) {
  const me = player();
  const key = keyOf(t.q, t.r);
  const own = t.owner === me.id;
  // v0.29: hrdina mimo dosah základny zůstává v seznamu, ale šedě s důvodem
  const ready = me.heroes.map((h, i) => ({ h, i, dosah: own || vDosahu(me, h, t) }))
    .filter(x => heroReady(me, x.i, t) && x.h.pos !== key)
    .sort((a, b) => (b.dosah - a.dosah)
      || gridDist(heroPosOf(me, a.i), t) - gridDist(heroPosOf(me, b.i), t));
  if (!ready.length) { hideTileMenu(); return; }
  const menu = $("#tile-menu");
  menu.innerHTML = `<div class="tm-heroes"><div class="tm-title">${title} — ${tx("kolo.kym")}</div>` +
    ready.map(x => {
      const where = x.h.pos ? `${tx("hrd.v.poli")} · ${armyTotal(x.h.army)} ${tx("spol.j")}` : tx("pan.doma");
      // výdrž se ukazuje VŽDY (dřív jen u hrdiny doma a bez maxima) —
      // hráč tak u výběru vidí, na kolik výpadů mu hrdina ještě zbývá
      const st = staminaTxt(me, x.i);
      const pozn = x.dosah ? `${where} · ${st} · ${marchTime(me, t, x.i)} s`
        : `🚫 ${tx("kolo.mimo.dosah", { reach: REACH })} · ${st}`;
      return `<button class="tm-hero" data-i="${x.i}"${x.dosah ? "" : " disabled"}
        title="${x.dosah ? tx("kolo.cena.pochodu", { kolik: marchStaminaCost(me, t, x.i) }) : tx("kolo.usad.bliz")}"><b>${heroDef(me, x.i).name}</b>
        <span>${pozn}</span></button>`;
    }).join("") + `</div>`;
  positionTileMenu(t);
  menu.querySelectorAll(".tm-hero:not([disabled])").forEach(btn => btn.addEventListener("click", () =>
    showMarchConfirm(t, parseInt(btn.dataset.i, 10), title)));
}

// třetí krok kola: potvrzení rovnou na mapě a hned vyslání. Dřív volba hrdiny
// jen odskočila na formulář v panelu — hráči to přišlo, že se neděje nic.
// Hrdina v poli táhne celou svou armádou, z domova mu naložíme doporučený
// objem. v0.26: když jednotky chybí (nebo úplně schází), kolo rovnou nabídne
// doplnění — doma úpravou nákladu ze zásoby, v poli posilami s čekajícím
// rozkazem (hrdina vyrazí sám, jakmile dorazí poslední konvoj). Prázdné
// město nabídne skok na verbování.
function showMarchConfirm(t, heroIdx, title) {
  const me = player();
  const h = me.heroes[heroIdx];
  const own = t.owner === me.id;
  const vPoli = !!h.pos;
  const needed = own ? 0 : marchNeeded(t);
  const room = Math.max(0, heroArmyCap(me, heroIdx) - heroArmyCommitted(me, heroIdx));
  const budgetDoma = Math.min(room, own ? Math.min(30, armyTotal(me.units)) : needed);
  // výchozí sestava (v0.27): preset hrdiny má přednost před návrhem,
  // ořezaný na skutečnou zásobu města
  const preset = !vPoli && h.preset ? (() => {
    const a = emptyArmy();
    for (const k of UNIT_KEYS) a[k] = Math.min(h.preset[k] | 0, me.units[k]);
    return armyTotal(a) > 0 ? a : null;
  })() : null;
  const army = vPoli ? armyClone(h.army) : (preset || suggestArmy(me, budgetDoma));
  const total = armyTotal(army);
  const stock = armyTotal(me.units);
  const chybi = !own && total < needed;
  const time = Math.max(2, Math.round(
    marchTime(me, t, heroIdx) * heroStats(me, heroIdx).time * armyTimeMult(army, me)));
  const gold = marchGoldCost(me, t, army);
  // v0.29: dosah základny a válka na kapitál — tvrdé zámky (ne jen varování)
  const dosah = own || vDosahu(me, h, t);
  const valkaTreba = !own && t.structure === "capital" && t.owner !== -1
    && !jeValka(me, t.owner);
  // v0.30: zamčená zóna a uzavřený uzel jsou stejně tvrdé zámky
  const zonaZamek = !own && !zonaOtevrena(me, t);
  const uzelZamek = !own && jeUzel(t) && t.owner === -1 && t.uzelCd > 0;
  const zamek = !dosah || valkaTreba || zonaZamek || uzelZamek;
  const warn = [];
  if (zonaZamek) warn.push(zonaZamekTxt(me, t));
  if (uzelZamek) warn.push(tx("pot.uzel.zamek", { doba: fmtTime(t.uzelCd) }));
  if (!dosah) {
    const [zq, zr] = heroBaseKey(me, h).split(",").map(Number);
    warn.push(tx("pot.mimo.dosah", { vzdalenost: Math.abs(t.q - zq) + Math.abs(t.r - zr), reach: REACH }));
  }
  if (valkaTreba)
    warn.push(tx("pot.valka.treba", { rod: G.factions[t.owner].name }));
  // v0.31/32: strop území — zábor (i nájezdem: pole se dobývá) logika odmítne
  if (!own && t.structure !== "throne"
    && pocetPoli(me) + blockTiles(bigAnchor(t)).length > stropPoli(me))
    warn.push(tx("pot.strop", { ted: pocetPoli(me), max: stropPoli(me) }));
  if (!zamek && total > 0 && chybi)
    warn.push(tx("pot.malo.jednotek", { mas: total, potreba: needed, obrana: tileDefense(t) }));
  if (!zamek && total > 0 && gold > me.resources.gold)
    warn.push(tx("pot.malo.zlata", { potreba: gold, mas: Math.floor(me.resources.gold) }));
  // náhled trasy na mapě jako u formuláře v panelu + diamant dosahu základny
  marchPreview = { from: heroPosOf(me, heroIdx), to: { q: t.q, r: t.r }, color: me.color };
  {
    const [zq, zr] = heroBaseKey(me, h).split(",").map(Number);
    reachPreview = { q: zq, r: zr, color: me.color };
  }

  // doplnění: doma se upravuje náklad ze zásoby, v poli jedou posily (velení)
  const canFill = stock > 0 && room > 0;
  const fillOpen = canFill && (total <= 0 || chybi);
  const fillBudget = vPoli ? Math.min(room, Math.max(0, needed - total)) : budgetDoma;
  const noUnits = total <= 0 && stock <= 0;

  const menu = $("#tile-menu");
  menu.innerHTML = `<div class="tm-heroes tm-confirm">
    <div class="tm-title">${title} — ${tileLabel(t)}</div>
    ${total > 0
      ? `<p class="tm-sum"><b>${heroDef(me, heroIdx).name}</b> · ${armyStr(army)} (${total} ${tx("spol.j")})<br>
          ${tx("pot.dorazi", { doba: fmtTime(time) })}${gold > 0 ? ` · ${tx("spol.zold")} ${gold} 🪙` : ""}</p>`
      : `<p class="tm-warn">⚠ ${tx(vPoli ? "pot.bez.jednotek.pole" : "pot.bez.jednotek.mesto")}${canFill ? " " + tx("pot.doplnit.nize") : ""}</p>`}
    ${warn.map(w => `<p class="tm-warn">${w}</p>`).join("")}
    ${canFill ? `<div class="tm-fill"${fillOpen ? "" : " hidden"}>
        <div class="tm-fill-title">${vPoli
          ? `📦 ${tx("pot.posily.z.mesta", { volne: room })}` : `🎒 ${tx("pot.naklad")}`}</div>
        <div class="unit-inputs">${unitInputsHtml("tmfill", me, fillBudget, () => showMarchConfirm(t, heroIdx, title))}</div>
        <p class="hint" id="tmfill-sum"></p>
      </div>` : ""}
    ${noUnits ? `<p class="tm-warn">🏹 ${tx("pot.nejdriv.vycvic")}</p>` : ""}
    ${total <= 0 && vPoli && stock > 0 && room <= 0
      ? `<p class="tm-warn">⚑ ${tx("pot.limit.veleni")}</p>` : ""}
    ${!own && (total > 0 || canFill) ? `<label class="tm-chk"><input type="checkbox" class="tm-return">
      ${tx("pot.najezd")}</label>` : ""}
    <div class="tm-btns">
      ${total > 0 && !zamek ? `<button class="tm-go">⚔ ${tx(vPoli && canFill ? "pot.vyslat.hned" : "pot.vyslat")}</button>` : ""}
      ${vPoli && canFill && !zamek ? `<button class="tm-rf">📦 ${tx(own ? "pot.doplnit.vyrazit" : "pot.doplnit.zautocit")}</button>` : ""}
      ${canFill && !fillOpen ? `<button class="tm-fill-open"
        title="${tx(vPoli ? "pot.upravit.posily" : "pot.upravit.naklad")}">±</button>` : ""}
      ${noUnits ? `<button class="tm-recruit">🏹 ${tx("pot.vycvicit")}</button>` : ""}
      ${vPoli ? "" : `<button class="tm-tune" title="${tx("pot.upravit.tip")}">⚙ ${tx("spol.upravit")}</button>`}
      <button class="tm-cancel">✕ ${tx("spol.zrusit")}</button>
    </div></div>`;
  positionTileMenu(t);

  const fillDiv = menu.querySelector(".tm-fill");
  const rf = menu.querySelector(".tm-rf");
  const fillArmy = () => readUnitInputs("tmfill");
  // živý souhrn doplnění: počty, velení, časy a žold
  const updateFill = () => {
    const sum = $("#tmfill-sum");
    if (!sum) return;
    const a = fillArmy();
    const an = armyTotal(a);
    const cp = armyCp(a, me);
    if (vPoli) {
      const spolu = armyClone(h.army);
      armyAdd(spolu, a);
      const konvoj = an > 0 ? Math.max(1, Math.round(
        travelTicks(G.tiles.get(h.pos), capPosOf(me), REINFORCE_TICKS)
        * heroStats(me, heroIdx).convoyMult * armyTimeMult(a, me))) : 0;
      const pochod = Math.max(2, Math.round(marchTime(me, t, heroIdx)
        * heroStats(me, heroIdx).time * armyTimeMult(spolu, me)));
      const zold = marchGoldCost(me, t, spolu);
      const pres = cp > room;
      const moc = !lzeSestavit(spolu);   // tři formace (etapa 6)
      sum.innerHTML = an <= 0 ? tx("pot.nastav.posily")
        : moc ? tx("pot.moc.formaci", { armada: armyStr(h.army, me), kolik: pocetFormaci(spolu), max: FORMACI_MAX })
        : `${an} ${tx("spol.j")} (${tx("spol.veleni")} ${cp}/${room})${pres ? " ⚠ " + tx("pot.pres.limit") : ""}
           · ${tx(own ? "pot.konvoj.presun" : "pot.konvoj.utok", { konvoj: fmtTime(konvoj), pochod: fmtTime(pochod) })}
           · ${tx("pot.celkem", { n: armyTotal(spolu) })}${zold > 0 ? ` · ${tx("spol.zold")} ${zold} 🪙` : ""}`;
      if (rf) rf.disabled = an <= 0 || pres || moc;
    } else {
      const cas = an > 0 ? Math.max(2, Math.round(marchTime(me, t, heroIdx)
        * heroStats(me, heroIdx).time * armyTimeMult(a, me))) : 0;
      const zold = marchGoldCost(me, t, a);
      const pres = cp > heroArmyCap(me, heroIdx);
      sum.innerHTML = an <= 0 ? tx("pot.nastav.naklad")
        : `${an} ${tx("spol.j")} (${tx("spol.veleni")} ${cp}/${heroArmyCap(me, heroIdx)})${pres ? " ⚠ " + tx("pot.pres.limit") : ""}
           · ${tx("pot.dorazi", { doba: fmtTime(cas) })}${zold > 0 ? ` · ${tx("spol.zold")} ${zold} 🪙` : ""}${
           !own && an < needed ? ` · ⚠ ${tx("pot.doporuceno", { n: needed })}` : ""}`;
      const go = menu.querySelector(".tm-go");
      if (go && fillDiv && !fillDiv.hidden) go.disabled = an <= 0 || pres;
    }
  };
  if (fillDiv) {
    // tvrdý strop (v0.36): vstupy nepustí přes volné velení / limit hrdiny
    const fillStrop = vPoli ? room : heroArmyCap(me, heroIdx);
    fillDiv.querySelectorAll("input").forEach(inp => inp.addEventListener("input", () => {
      clampUnitInput("tmfill", inp, fillStrop, k2 => uDef(me, k2).cp || 1);
      updateFill();
    }));
    updateFill();
  }
  const btnOpen = menu.querySelector(".tm-fill-open");
  if (btnOpen) btnOpen.addEventListener("click", () => {
    fillDiv.hidden = !fillDiv.hidden;
    const go = menu.querySelector(".tm-go");
    if (!fillDiv.hidden) updateFill();
    else if (go) go.disabled = false;
  });

  const selhani = btn => {
    // mezi vykreslením a klikem se něco změnilo (výdrž, zásoba, pakt…)
    btn.disabled = true;
    menu.querySelector(".tm-confirm").insertAdjacentHTML("beforeend",
      `<p class="tm-warn">${tx("pot.rozkaz.selhal")}</p>`);
  };
  const raid = () => {
    const chk = menu.querySelector(".tm-return");
    return !!(chk && chk.checked);
  };
  const go = menu.querySelector(".tm-go");
  if (go) go.addEventListener("click", () => {
    // doma s otevřeným doplněním jede upravený náklad, jinak návrh/celá armáda
    const naklad = vPoli ? null : (fillDiv && !fillDiv.hidden ? fillArmy() : army);
    if (startMarch(me, t, naklad, heroIdx, raid())) {
      sfx.play("march");
      marchPreview = null, reachPreview = null;
      hideTileMenu();
      selectedKey = keyOf(t.q, t.r);
      forceTilePanel();
    } else selhani(go);
  });
  if (rf) rf.addEventListener("click", () => {
    const a = fillArmy();
    if (armyTotal(a) <= 0) return;
    if (startReinforceAttack(me, t, heroIdx, a, raid())) {
      sfx.play("march");
      marchPreview = null, reachPreview = null;
      hideTileMenu();
      selectedKey = h.pos; // ukázat hrdinu, který teď nese čekající rozkaz
      forceTilePanel();
    } else selhani(rf);
  });
  const btnRecruit = menu.querySelector(".tm-recruit");
  if (btnRecruit) btnRecruit.addEventListener("click", () => {
    marchPreview = null, reachPreview = null;
    hideTileMenu();
    openSideWin("train");
  });
  const tune = menu.querySelector(".tm-tune");
  if (tune) tune.addEventListener("click", () => openMarchForm(t, heroIdx));
  menu.querySelector(".tm-cancel").addEventListener("click", () => {
    marchPreview = null, reachPreview = null;
    hideTileMenu();
  });
}

// záložní cesta: otevře formulář pochodu v panelu pole s předvybraným hrdinou
// (složení armády, doplnění posil, nájezd)
function openMarchForm(t, heroIdx) {
  hideTileMenu();
  selectedKey = keyOf(t.q, t.r);
  forceTilePanel();
  const sel = $("#march-hero");
  if (sel) { sel.value = String(heroIdx); sel.dispatchEvent(new Event("change")); }
  const el = document.querySelector("#btn-march");
  if (el) {
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1800);
  }
}

// zavře kolo a zvýrazní cílový prvek bočního panelu
function focusPanelEl(selector) {
  hideTileMenu();
  forceTilePanel();
  const el = document.querySelector(selector);
  if (el) {
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    el.classList.add("flash");
    setTimeout(() => el.classList.remove("flash"), 1800);
  }
}

// ---------- Ovládání mapy ----------
// Pointer Events sjednocují myš, dotyk i pero (Firefox, Safari, mobily);
// dva prsty na dotykové obrazovce ovládají pinch-zoom
function bindMapControls() {
  let moved = false, lastX = 0, lastY = 0;
  const pointers = new Map(); // aktivní prsty/kurzory pro drag + pinch
  let pinchDist = 0;

  const pinchDistance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  canvas.addEventListener("pointerdown", e => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) { moved = false; lastX = e.clientX; lastY = e.clientY; }
    else if (pointers.size === 2) pinchDist = pinchDistance();
    if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) { // pinch-zoom dvěma prsty
      const d = pinchDistance();
      if (pinchDist > 0 && d > 0) {
        camera.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, camera.zoom * d / pinchDist));
        moved = true; hideTileMenu();
      }
      pinchDist = d;
    } else if (pointers.size === 1) {
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      if (Math.abs(dx) + Math.abs(dy) > 3) { moved = true; hideTileMenu(); }
      camera.x -= dx / camera.zoom;
      camera.y -= dy / camera.zoom;
      lastX = e.clientX; lastY = e.clientY;
    }
  });
  const endPointer = e => {
    pointers.delete(e.pointerId);
    if (pointers.size === 1) { // z pinche zpět na drag jedním prstem
      const p = [...pointers.values()][0];
      lastX = p.x; lastY = p.y;
    }
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);

  canvas.addEventListener("mousemove", e => {
    const rect = canvas.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    const h = pixelToTile(w.x, w.y);
    const t = bigAnchor(tileAt(h.q, h.r));   // najetí na člen bloku ukazuje kotvu
    hoverKey = t ? keyOf(t.q, t.r) : null;
    updateMapTip(pointers.size > 0 ? null : t, e.clientX - rect.left, e.clientY - rect.top);
  });
  canvas.addEventListener("mouseleave", () => updateMapTip(null, 0, 0));

  canvas.addEventListener("click", e => {
    if (moved) return;
    const rect = canvas.getBoundingClientRect();
    const w = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
    // klik na pochodující kolonu vlastního hrdiny otevře panel pochodu
    const mh = marchHeroAt(w.x, w.y);
    if (mh !== null) {
      selectedMarchHero = mh;
      selectedKey = null;
      hideTileMenu();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      forceTilePanel();
      return;
    }
    selectedMarchHero = null;
    const h = pixelToTile(w.x, w.y);
    const t = bigAnchor(tileAt(h.q, h.r));   // klik na člen bloku vybírá kotvu
    selectedKey = t ? keyOf(t.q, t.r) : null;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    forceTilePanel();
    showTileMenu(t);
  });

  canvas.addEventListener("wheel", e => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    camera.zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, camera.zoom * factor));
    hideTileMenu();
  }, { passive: false });
}

const ZOOM_MIN = 0.35, ZOOM_MAX = 5; // přiblížení až na detail figurek

// najde pochod vlastního hrdiny poblíž světových souřadnic (klik na kolonu);
// pozice čela kolony se počítá stejně jako v render.js
function marchHeroAt(wx, wy) {
  const me = player();
  if (!me || !G.running || G.gameOver) return null;
  const tickFrac = G.lastTickAt ? Math.min(1, (performance.now() - G.lastTickAt) / TICK_MS) : 1;
  let best = null, bestD = Infinity;
  for (const m of me.marches) {
    if (m.heroIdx == null) continue;
    const o = G.tiles.get(m.fromKey), t = G.tiles.get(m.targetKey);
    if (!o || !t) continue;
    const from = tileToPixel(o.q, o.r);
    const to = tileToPixel(t.q, t.r);
    const prog = Math.min(1, Math.max(0, (m.total - m.ticksLeft + tickFrac) / m.total));
    const px = from.x + (to.x - from.x) * prog;
    const py = from.y + (to.y - from.y) * prog;
    const d = Math.hypot(wx - px, wy - py);
    if (d < 22 && d < bestD) { best = m.heroIdx; bestD = d; }
  }
  return best;
}

// ---------- Bublina na mapě: co pole nabízí ----------
let mapTipKey = null;

// popis velitele neutrálního pole (v0.13) — hráč má vědět, proti komu jde
function neutralCmdTxt(t) {
  if (!t || t.owner !== -1 || !TERRAIN[t.terrain].passable) return "";
  const popis = nc => {
    const tr = HERO_TRAITS[nc.trait];
    return `${nc.name} · ${tx("spol.ur")} ${nc.level} · ${tr ? tr.name : ""}`;
  };
  // IV-M: dvouarmádový objektiv se brání OD NEJSLABŠÍHO — hráč musí vidět,
  // v jakém pořadí vlny přijdou, jinak si druhou (bossovskou) nemá jak
  // odhadnout dopředu
  if (dveArmady(t)) {
    const p = neutralPoradi(t, 2);
    return `1. ${popis(neutralCommander(t, p[0]))} → 2. ${popis(neutralCommander(t, p[1]))}`;
  }
  return popis(neutralCommander(t));
}

// pořadí obrany vlastního stohu: kdo stojí na poli nejdéle, vede
function poradiObranyHtml(me, t) {
  const key = keyOf(t.q, t.r);
  const stoji = [];
  for (let i = 0; i < me.heroes.length; i++) {
    const h = me.heroes[i];
    if (h.pos !== key) continue;
    if (armyCp(h.army, me) < OBRANA_MIN_CP) continue;   // prázdný batoh nebrání
    stoji.push({ i, h });
  }
  if (stoji.length < 2) return "";
  stoji.sort((a, b) => (a.h.prisel || 0) - (b.h.prisel || 0));
  return `<p class="def-order" title="${tx("obr.poradi.tip")}">
    🛡 ${tx("obr.poradi")}: ${stoji.map((x, n) =>
      `<b>${n + 1}.</b> ${heroDef(me, x.i).name}`).join(" · ")}</p>`;
}

function updateMapTip(tile, x, y) {
  const tip = $("#map-tip");
  if (!tile || !G.running || G.gameOver) {
    tip.classList.add("hidden");
    mapTipKey = null;
    return;
  }
  tip.classList.remove("hidden");
  // bublina sleduje kurzor; obsah se skládá jen při změně pole
  const wrap = $("#canvas-wrap");
  const flipX = x > wrap.clientWidth - 240;
  tip.style.left = (flipX ? x - 232 : x + 16) + "px";
  tip.style.top = Math.min(y + 14, wrap.clientHeight - 120) + "px";
  const key = keyOf(tile.q, tile.r);
  if (key === mapTipKey) return;
  mapTipKey = key;
  // mlha války: neprozkoumaná pole neprozradí nic, mimo dohled jen základ
  if (!isExplored(key)) {
    tip.innerHTML = `<b>${tx("pan.neprozkoumane")}</b><div class="tip-row">${tx("tip.mlha")}</div>`;
    return;
  }
  const me = player();
  const terr = TERRAIN[tile.terrain];
  const ownerTxt = tile.owner === -1 ? tx("pan.neutralni")
    : `<span style="color:${G.factions[tile.owner].color}">${G.factions[tile.owner].name}</span>`;
  let html = `<b>${tile.structure ? STRUCTURES[tile.structure].name : terr.name}</b>
    <span class="tip-lvl">${tx("tip.sila", { sila: tile.structure === "grandfort" ? 500 : tierOf(tile) })}</span> · ${ownerTxt}
    <div class="tip-row dim">kraj ${regionOf(tile)}</div>`;
  if (!terr.passable) {
    html += `<div class="tip-row">${tx("pan.neprchodny")}</div>`;
  } else if (!isVisible(key)) {
    html += `<div class="tip-row">⚔ ${tx("tip.mimo.dohled")}</div>`;
  } else {
    html += `<div class="tip-row">⚔ ${tileDefense(tile)} · ${tileGainHtml(tile, me, false)
      .replace(/<\/?p[^>]*>/g, "")}</div>`;
    const nctip = neutralCmdTxt(tile);
    if (nctip) html += `<div class="tip-row">🛡 Velitel: ${nctip}</div>`;
    const mev = mapEventAt(key);
    if (mev) {
      const evd = MAP_EVENTS[mev.type];
      html += `<div class="tip-row">${evd.icon} <b>${evd.name}</b> (${fmtTime(mev.ticksLeft)}) — ${evd.desc}.</div>`;
    }
    if (tile.structure === "throne" && !G.throneOpen)
      html += `<div class="tip-row">🔒 ${tx("tip.primeri", { doba: fmtTime(THRONE_UNLOCK - G.tick) })}</div>`;
    const zz = tile.owner !== me.id ? zonaZamekTxt(me, tile) : null; // v0.30
    if (zz) html += `<div class="tip-row">${zz}</div>`;
    if (jeUzel(tile) && tile.owner === -1)
      html += `<div class="tip-row">⚔⚔ ${tx("tip.uzel")}${
        tile.uzelCd > 0 ? ` · ⛔ ${tx("tip.uzavren", { doba: fmtTime(tile.uzelCd) })}` : ""}${
        tile.owner === -1 && tile.zran > 0 ? ` · ⏳ okno ${fmtTime(tile.zran)}` : ""}</div>`;
    const tipLoot = tile.owner !== me.id ? structLootTxt(tile) : null;
    if (tipLoot) html += `<div class="tip-row">🎁 ${tx("tip.korist")}: ${tipLoot}</div>`;
  }
  tip.innerHTML = html;
}

// ---------- Smyčka vykreslování ----------
function frame() {
  draw();
  requestAnimationFrame(frame);
}

// ---------- Init ----------
// Ovládání formací je DELEGOVANÉ na dokumentu a zakládá se jednou — widget se
// překresluje s celým panelem, takže posluchače na jeho prvcích by se ztrácely
// (a při vázání v render funkci by se naopak vrstvily, viz slider rodů v0.49).
function bindFormace() {
  let tazeny = null;   // {prefix, k} — přetahovaná jednotka
  document.addEventListener("click", e => {
    const x = e.target.closest("[data-fm-clear]");
    if (x) {
      const p = x.dataset.fmClear;
      if (formaceSlotu[p]) { formaceSlotu[p][+x.dataset.i] = null; }
      if (formaceObnov[p]) formaceObnov[p]();
      return;
    }
    const kus = e.target.closest("[data-fm-pool]");
    if (!kus) return;
    const p = kus.dataset.fmPool, k = kus.dataset.k, sloty = formaceSlotu[p];
    if (!sloty) return;
    if (sloty.includes(k)) return;                 // už ve formaci — klik nic nedělá
    const volny = sloty.indexOf(null);
    // bez volného slotu klepnutí nahradí POSLEDNÍ formaci (přetažením se dá
    // trefit konkrétní slot; tohle je rychlá cesta na dotyku)
    formaceNastav(p, volny === -1 ? FORMACI_MAX - 1 : volny, k);
  });
  document.addEventListener("dragstart", e => {
    const kus = e.target.closest && e.target.closest("[data-fm-pool]");
    if (!kus) { tazeny = null; return; }
    tazeny = { prefix: kus.dataset.fmPool, k: kus.dataset.k };
    if (e.dataTransfer) { e.dataTransfer.effectAllowed = "copy"; e.dataTransfer.setData("text/plain", tazeny.k); }
  });
  document.addEventListener("dragend", () => {
    document.querySelectorAll(".fm-slot.nad").forEach(el => el.classList.remove("nad"));
    tazeny = null;
  });
  document.addEventListener("dragover", e => {
    const slot = e.target.closest && e.target.closest("[data-fm-slot]");
    if (!slot || !tazeny || slot.dataset.fmSlot !== tazeny.prefix) return;
    e.preventDefault();                            // bez toho prohlížeč drop nepustí
    if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    slot.classList.add("nad");
  });
  document.addEventListener("dragleave", e => {
    const slot = e.target.closest && e.target.closest("[data-fm-slot]");
    if (slot) slot.classList.remove("nad");
  });
  document.addEventListener("drop", e => {
    const slot = e.target.closest && e.target.closest("[data-fm-slot]");
    if (!slot || !tazeny || slot.dataset.fmSlot !== tazeny.prefix) return;
    e.preventDefault();
    slot.classList.remove("nad");
    formaceNastav(tazeny.prefix, +slot.dataset.i, tazeny.k);
    tazeny = null;
  });
}

window.addEventListener("DOMContentLoaded", () => {
  // Sólo hra jede na CÍLOVÉ délce sezóny (14 dní) jako server. Na zkoušení
  // mechanik je to nepoužitelné — Trůn se otevírá po sedmi dnech — takže
  // krátkou sezónu si jde vyžádat adresou:  index.html?sezona=1
  // (v multiplayeru délku určuje server a tenhle přepínač se ignoruje)
  // ETAPA 12b: jazyk nejdřív z localStorage, jinak tip z prohlížeče; jakmile
  // se hráč přihlásí, přebije to jazyk z jeho ÚČTU (net.js)
  nactiJazyk();
  const sezonaParam = new URLSearchParams(location.search).get("sezona");
  if (sezonaParam) { setSeasonHours(sezonaParam); sezonaZUrl = true; }
  bindFormace();
  initRender($("#map"));
  bindMapControls();
  buildStartScreen();

  // zvuky: hra hlásí události, tady se rozhoduje, co je slyšet
  G.onEvent = (name, fid, cid) => {
    // v0.32: událost s cid patří konkrétnímu členovi — cizí kapitoly netlučou
    const mine = fid === G.playerFaction && (cid === undefined || cid === (G.playerClen || 0));
    const global = fid === -1;
    const MAP = { battleWin: mine, battleLose: mine, levelup: mine, build: mine,
      loot: mine, starve: mine, goal: mine, pact: mine, offer: mine,
      mapEvent: global, storm: global, throne: global,
      zone: global, // v0.30: otevření fáze světa zní jako Trůn
      war: mine }; // v0.29: válka vyhlášená MNĚ zní jako poplach
    if (MAP[name]) sfx.play(name === "war" ? "battleLose" : name === "zone" ? "throne" : name);
  };
  // ukončení hry: první klik vyzve k potvrzení, druhý do 3 s hru ukončí
  const quitBtn = $("#btn-quit");
  let quitArmed = null;
  quitBtn.addEventListener("click", () => {
    if (!G.running) return;
    if (!quitArmed) {
      quitBtn.textContent = tx("spol.opravdu.konec");
      quitArmed = setTimeout(() => { quitArmed = null; quitBtn.textContent = "✕ Konec"; }, 3000);
      return;
    }
    clearTimeout(quitArmed); quitArmed = null;
    quitBtn.textContent = "✕ " + tx("spol.konec");
    quitBtn.classList.add("hidden");
    hideTileMenu();
    if (mp.active) {
      netSend({ type: "backToLobby" }); // server vrátí všechny do lobby
      return;
    }
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    G.running = false;
    G.gameOver = true;
    closeHeroWindow();
    closeReport();
    $("#end-overlay").classList.add("hidden");
    $("#start-overlay").classList.remove("hidden");
    showFactionStep();
  });

  const sndBtn = $("#btn-sound");
  const sndLabel = () => { sndBtn.textContent = sfx.enabled ? "🔊" : "🔇"; };
  sndLabel();
  sndBtn.addEventListener("click", () => { sfx.toggle(); sndLabel(); });
  // jemné kliknutí na tlačítkách
  document.addEventListener("click", e => {
    if (e.target.closest("button:not(#btn-sound):not([disabled])")) sfx.play("click");
  });
  $("#tile-panel").addEventListener("mousedown", () => { panelHeld = true; });
  $("#side-win").addEventListener("mousedown", () => { panelHeld = true; });
  window.addEventListener("mouseup", () => { panelHeld = false; });
  // boční lišta: ikona otevře (či zavře) svoje okno
  document.querySelectorAll(".rail-btn").forEach(btn =>
    btn.addEventListener("click", () => {
      if (!btn.dataset.win) return; // speciální tlačítka (reporty) mají vlastní obsluhu
      activeWin === btn.dataset.win ? closeSideWin() : openSideWin(btn.dataset.win);
    }));
  // v0.39: 🗺 v liště rozbalí soupis držených polí
  const landChip = $("#land-chip");
  if (landChip) landChip.addEventListener("click", () => toggleLandPanel());
  // v0.27: Domů — skok kamery na hlavní město (reporty bydlí v obálce 📩)
  const btnHome = $("#rail-home");
  if (btnHome) btnHome.addEventListener("click", () => {
    const me = player();
    if (!me) return;
    const cp = capPosOf(me);
    const p = tileToPixel(cp.q, cp.r);
    camera.x = p.x; camera.y = p.y;
    selectedKey = keyOf(cp.q, cp.r);
    hideTileMenu(); // kolo se po skoku kamery samo nepřemístí
    closeSideWin();
    forceTilePanel();
  });
  // minimapa (v0.33): klik i tažení skáče kamerou; meze hlídá clamp v draw()
  const mini = $("#minimap");
  if (mini) {
    const skok = e => {
      const r = mini.getBoundingClientRect();
      const p = miniToWorld(e.clientX - r.left, e.clientY - r.top);
      if (!p) return;
      camera.x = p.x; camera.y = p.y;
      hideTileMenu();
    };
    mini.addEventListener("pointerdown", e => {
      skok(e);
      try { mini.setPointerCapture(e.pointerId); } catch (err) { /* syntetické eventy testů */ }
    });
    mini.addEventListener("pointermove", e => { if (e.buttons) skok(e); });
  }
  $("#side-win-close").addEventListener("click", closeSideWin);
  // ---------- FILTRY MAPY: jedno tlačítko a nabídka (v0.63) ----------
  // Osm tlačítek vedle sebe zabíralo celou šířku nad mapou a sloupec hrdinů
  // jim lezl do cesty. Nabídka se skládá TADY, ne v HTML, aby šla přeložit
  // a aby se popisek tlačítka měnil s vybraným filtrem.
  const FILTRY = [
    { f: "", ikona: "🗺", klic: "filtr.mapa" },
    { f: "food", ikona: "🌾", klic: "filtr.food", popis: "filtr.vynos" },
    { f: "wood", ikona: "🪵", klic: "filtr.wood", popis: "filtr.vynos" },
    { f: "stone", ikona: "🪨", klic: "filtr.stone", popis: "filtr.vynos" },
    { f: "iron", ikona: "⚙", klic: "filtr.iron", popis: "filtr.vynos" },
    { f: "gold", ikona: "🪙", klic: "filtr.gold", popis: "filtr.vynos" },
    { f: "level", ikona: "⚔", klic: "filtr.level", popis: "filtr.level.popis" },
    { f: "vztahy", ikona: "🤝", klic: "filtr.vztahy", popis: "filtr.vztahy.popis" },
  ];
  function filtrPopisek() {
    const d = FILTRY.find(x => (x.f || null) === mapFilter) || FILTRY[0];
    return d.ikona + " " + tx(d.klic);
  }
  function prekresliFiltr() {
    const btn = $("#mf-toggle");
    if (btn) btn.innerHTML = `<span class="mf-label">${tx("filtr.nazev")}:</span> `
      + filtrPopisek() + ` <span class="mf-sip">▾</span>`;
    const menu = $("#mf-menu");
    if (!menu) return;
    menu.innerHTML = FILTRY.map(d => `<button class="mf-row${
      (d.f || null) === mapFilter ? " active" : ""}" data-f="${d.f}">
        <span class="mf-ico">${d.ikona}</span>
        <span class="mf-txt">${tx(d.klic)}${d.popis
          ? `<small>${tx(d.popis)}</small>` : ""}</span></button>`).join("")
      + `<div class="mf-del"></div>
      <button class="mf-row" id="btn-kvalita"><span class="mf-ico">✨</span>
        <span class="mf-txt">${tx("filtr.kvalita")}<small id="mf-kvalita-stav"></small></span></button>`;
    popisKvality();
    menu.querySelectorAll("[data-f]").forEach(b => b.addEventListener("click", () => {
      mapFilter = b.dataset.f || null;
      mapDrawnTick = -2;   // překreslit statickou vrstvu s overlay filtrem
      zavriFiltr();
      prekresliFiltr();
    }));
    const kv = menu.querySelector("#btn-kvalita");
    if (kv) kv.addEventListener("click", prepniKvalitu);
  }
  function zavriFiltr() { $("#mf-menu")?.classList.add("hidden"); }
  $("#mf-toggle")?.addEventListener("click", e => {
    e.stopPropagation();
    $("#mf-menu")?.classList.toggle("hidden");
  });
  // klik jinam nabídku zavře — jinak zůstane viset přes mapu
  document.addEventListener("click", e => {
    if (!e.target.closest("#map-filters")) zavriFiltr();
  });
  // přepnutí jazyka musí popisek i nabídku přeložit
  window.prekresliFiltrMapy = prekresliFiltr;

  // ---------- kvalita grafiky (v0.56) ----------
  // Tři stupně z render3d.js: vysoká (bloom + 4× MSAA), střední, nízká
  // (postprocessing se ÚPLNĚ obejde). Volba se pamatuje v localStorage,
  // takže přežije reload i restart serveru.
  const KVALITA_POPIS = {
    vysoka: "✨ " + tx("kval.vysoka"), stredni: "✦ " + tx("kval.stredni"), nizka: "· " + tx("kval.nizka"),
  };
  // kvalita bydlí od v0.63 v nabídce filtrů — hráč na ni sáhne přesně tehdy,
  // když mu mapa seká, a nemusí kvůli tomu být přihlášený
  function popisKvality() {
    const stav = $("#mf-kvalita-stav");
    if (!stav || !window.R3 || !R3.kvalita) return;
    stav.textContent = KVALITA_POPIS[R3.kvalita] || "✨";
  }
  function prepniKvalitu() {
    if (!window.R3 || !R3.setKvalita) return;
    // pořadí od nejhezčí po nejrychlejší, dokola
    const poradi = ["vysoka", "stredni", "nizka"];
    const dalsi = poradi[(poradi.indexOf(R3.kvalita) + 1) % poradi.length];
    R3.setKvalita(dalsi);
    popisKvality();
  }
  prekresliFiltr();
  $("#btn-again").addEventListener("click", () => {
    if (mp.active) {
      // síťová hra: server vrátí všechny do lobby (obslouží zpráva "ended")
      netSend({ type: "backToLobby" });
      return;
    }
    $("#end-overlay").classList.add("hidden");
    $("#start-overlay").classList.remove("hidden");
    showFactionStep();
  });
  $("#btn-start-game").addEventListener("click", () => {
    if (pickFactionIdx === null) return;
    if (mp.ws && mp.ws.readyState === WebSocket.OPEN && !mp.active) {
      // v lobby síťové hry: výběr se jen ohlásí serveru, hru spouští tlačítko lobby
      mpSendPick(pickFactionIdx);
      showFactionStep();
    } else {
      startGame(pickFactionIdx);
    }
  });
  $("#btn-mp-join").addEventListener("click", () => {
    const name = $("#mp-name").value.trim() || tx("spol.bezejmenny");
    localStorage.setItem("vp-mp-name", name);
    mpConnect(name);
  });
  $("#mp-name").value = localStorage.getItem("vp-mp-name") || "";
  $("#btn-mp-start").addEventListener("click", () => netSend({ type: "start" }));
  $("#btn-back-factions").addEventListener("click", e => {
    e.preventDefault();
    showFactionStep();
  });
  $("#hero-close").addEventListener("click", closeHeroWindow);
  $("#hero-overlay").addEventListener("click", e => {
    if (e.target.id === "hero-overlay") closeHeroWindow();
  });
  $("#log").addEventListener("click", e => {
    const tab = e.target.closest(".log-tab");
    if (tab) {
      logView = tab.dataset.view;
      logSeen = logEntries().length;
      updateLog();
      return;
    }
    const a = e.target.closest(".log-report");
    if (!a) return;
    e.preventDefault();
    openReport(parseInt(a.dataset.rep, 10));
  });
  $("#report-close").addEventListener("click", closeReport);
  $("#report-overlay").addEventListener("click", e => {
    if (e.target.id === "report-overlay") closeReport();
  });
  window.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (reportOpenId !== null) closeReport();
    else if (heroWinIdx !== null) closeHeroWindow();
  });
  loadLocalAccount();
  renderAccBox();
  noteRespecIfAny();
  window.addEventListener("beforeunload", () => syncLocalAccount(true));
  requestAnimationFrame(frame);
});
