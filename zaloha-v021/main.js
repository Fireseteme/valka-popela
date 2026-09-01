"use strict";
/* Válka popela v0.2 — UI, ovládání, hlavní smyčka */

let tickTimer = null;
let tilePanelSig = null; // podpis obsahu panelu — překreslujeme jen při změně
let panelHeld = false;   // myš je stisknutá v panelu — nepřekreslovat pod rukou

// ---------- Pomocníci ----------
const $ = sel => document.querySelector(sel);
function fmtTime(ticks) {
  const s = Math.max(0, ticks);
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}
function player() { return G.factions[G.playerFaction]; }

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
  acct.local = emptyAccount("místní hráč");
  saveLocalAccount();
}

// jednorázové oznámení, že přestavba stromů vrátila investované body
function noteRespecIfAny() {
  const a = acct.local;
  if (!a || !a.respecNote) return;
  delete a.respecNote;
  saveLocalAccount();
  setAccStatus("Stromy dovedností se změnily — všechny investované body byly vráceny.");
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

function acctCores() {
  return acct.mode === "remote"
    ? (acct.remote ? acct.remote.cores : null)
    : acct.local ? acct.local.cores : null;
}

function acctLabel() {
  if (acct.mode === "remote")
    return acct.remote ? `účet ${acct.remote.name}` : "nepřihlášen";
  return "místní účet (tento prohlížeč)";
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
function renderAccBox() {
  const box = $("#acc-box");
  if (!box) return;
  const chestsToggle = `<a href="#" class="acc-chests-toggle">💠 truhly</a>`;
  if (acct.remote) {
    box.innerHTML = `<div class="acc-row">💠 <b>${acct.remote.name}</b>
        · <span class="acc-cores">${acct.remote.cores}</span> jader ${chestsToggle}
        <a href="#" id="acc-logout">odhlásit</a></div>
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
    box.innerHTML = `<div class="acc-row">
        <input id="acc-name" placeholder="Jméno účtu" maxlength="20" autocomplete="username">
        <input id="acc-pass" type="password" placeholder="Heslo" maxlength="40" autocomplete="current-password">
        <button id="btn-acc-login">Přihlásit</button>
        <button id="btn-acc-reg">Registrovat</button></div>
      <p class="hint" id="acc-status">Účet ukládá hrdiny, jejich výbavu i 💠 jádra napříč sezónami.</p>`;
    const go = type => {
      const name = $("#acc-name").value, pass = $("#acc-pass").value;
      if (!name.trim() || !pass) { setAccStatus("Vyplň jméno účtu i heslo."); return; }
      netSend({ type, name, pass });
    };
    $("#btn-acc-login").addEventListener("click", () => go("accLogin"));
    $("#btn-acc-reg").addEventListener("click", () => go("accRegister"));
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
let pickFactionIdx = null;   // frakce zvolená v 1. kroku
let pickedHeroes = [];       // defIdx vybraného startovního hrdiny (přesně 1)

function buildStartScreen() {
  const wrap = $("#faction-cards");
  wrap.innerHTML = "";
  FACTION_DEFS.forEach((def, i) => {
    const card = document.createElement("div");
    card.className = "faction-card";
    card.style.borderColor = def.color;
    card.innerHTML = `<h3 style="color:${def.color}">${def.name}</h3>
      <p class="race">${def.race}</p><p class="bonus">${def.desc}</p>
      <div class="card-faces">${HERO_DEFS[def.key].map((hd, j) =>
        `<img src="${heroPortraitURL(def.key, j)}" alt="" title="${hd.name}">`).join("")}</div>`;
    card.addEventListener("click", () => {
      if (card.classList.contains("taken")) return; // v lobby už ji někdo drží
      showHeroSelect(i);
    });
    wrap.appendChild(card);
  });
  showFactionStep();
}

function showFactionStep() {
  pickFactionIdx = null;
  pickedHeroes = [];
  $("#faction-cards").classList.remove("hidden");
  $("#hero-select").classList.add("hidden");
  $("#start-intro").innerHTML = `Příměří končí. Vyber frakci a doveď ji k Trůnnímu městu dřív,<br>
    než sezóna skončí. Dobývat lze jen pole sousedící s tvým územím.`;
}

// 2. krok: volba jediného startovního hrdiny zvolené frakce.
// v0.9: hrdinové jsou zamčení — vybrat jde jen odemčené na účtu; při první
// hře s frakcí (nic odemčeno) jde vybrat libovolného hrdinu Common tieru
// a ten hráči zůstane natrvalo
function showHeroSelect(factionIdx) {
  pickFactionIdx = factionIdx;
  pickedHeroes = [];
  const def = FACTION_DEFS[factionIdx];
  const firstPick = !anyHeroUnlocked(def.key);
  $("#faction-cards").classList.add("hidden");
  $("#hero-select").classList.remove("hidden");
  $("#start-intro").innerHTML = `<span style="color:${def.color};font-weight:700">${def.name}</span>
    — ${firstPick
      ? `první tažení: vyber si <b>jednoho hrdinu běžného tieru</b> — zůstane ti navždy.
        Ostatní odemkneš dárky z truhel (💠).`
      : `vyber <b>jednoho odemčeného hrdinu</b>. Další hrdiny odemykají dárky z truhel (💠).`}`;
  const wrap = $("#hero-pick-cards");
  wrap.innerHTML = HERO_DEFS[def.key].map((hd, j) => {
    const trait = HERO_TRAITS[hd.trait];
    const ult = hd.tree.find(s => s.ult);
    const key = def.key + ":" + j;
    const tier = HERO_TIERS[heroTierOf(def.key, j)];
    const unlocked = heroUnlockedAcc(key);
    const pickable = unlocked || (firstPick && heroTierOf(def.key, j) === 0);
    const resp = acctRespect(key);
    // na výběrové kartě stačí hlavní dovednosti — větví je dalších osm
    // a celý strom by kartu protáhl přes celou obrazovku
    const mains = hd.tree.filter(s => s.main && !s.ult);
    const subs = hd.tree.filter(s => s.parent).length;
    const skills = mains
      .map(s => `<span class="hp-skill">• <b>${s.name}</b> — ${s.desc}</span>`).join("")
      + `<span class="hp-more">a ${subs} dovedností ve větvích</span>`;
    return `<div class="hero-pick${pickable ? "" : " locked"}" data-idx="${j}" data-pickable="${pickable ? 1 : 0}">
      <div class="hp-head">
        <img src="${heroPortraitURL(def.key, j)}" alt="">
        <div class="hp-body">
          <b>${hd.name} <span class="tier-tag" style="color:${tier.color};border-color:${tier.color}66">${tier.name}</span></b>
          <span class="hp-trait">${trait.name} — ${trait.desc}</span>
        </div>
        <span class="hp-check">✓</span>
      </div>
      ${pickable ? "" : `<div class="hp-lock">🔒 Zamčen — odemkne ho ${giftCostForStar(1)}
        dárků z truhel${resp > 0 ? ` <b>(oddanost ${resp}/${respectForStar(1)})</b>` : ""}</div>`}
      <div class="hp-skills">${skills}</div>
      <div class="hp-ult">★ ${ult.name} — <span class="hp-ultdesc">${ult.desc}</span></div>
    </div>`;
  }).join("");
  wrap.querySelectorAll(".hero-pick").forEach(card => card.addEventListener("click", () => {
    if (card.dataset.pickable !== "1") return;
    const idx = parseInt(card.dataset.idx, 10);
    pickedHeroes = pickedHeroes[0] === idx ? [] : [idx];
    wrap.querySelectorAll(".hero-pick").forEach(c =>
      c.classList.toggle("sel", pickedHeroes.includes(parseInt(c.dataset.idx, 10))));
    const btn = $("#btn-start-game");
    btn.disabled = pickedHeroes.length !== 1;
    btn.textContent = pickedHeroes.length === 1 ? "⚔ Vytáhnout do pole" : "Vyber hrdinu";
  }));
  $("#btn-start-game").disabled = true;
  $("#btn-start-game").textContent = "Vyber hrdinu";
}

function startGame(factionIndex, heroSel) {
  newGame(factionIndex, undefined, heroSel);
  // trvalý postup z místního účtu (sklad, úrovně a výbava hrdinů)
  if (acct.local) {
    // první hra s frakcí: zvolený Common hrdina zůstává na účtu natrvalo
    const startKey = FACTION_DEFS[factionIndex].key + ":" + heroSel[0];
    if (!heroUnlockedAcc(startKey)) {
      acct.local.heroUnlocks[startKey] = 1;
      saveLocalAccount();
    }
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
  const cap = CAPITAL_POS[factionIndex];
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
  $("#end-title").textContent = ranking[0].f.id === G.playerFaction ? "Vítězství!" : "Sezóna skončila";
  $("#end-table").innerHTML = `<tr><th></th><th>Frakce</th><th>Skóre</th></tr>${rows}`;
  $("#end-overlay").classList.remove("hidden");
}

// ---------- Boční lišta s okny ----------
// každá agenda má vlastní okno (jako v RtW): lišta ikon vpravo, jedno okno
// otevřené naráz; obsahové divy (#heroes-panel, #scores…) žijí v DOM trvale,
// takže updatery fungují beze změny — okno jen přepíná viditelnost sekcí
const WIN_TITLES = {
  build: "🏰 Budovy hlavního města", train: "🗡 Výcvik jednotek",
  upgrade: "⚒ Vylepšení jednotek", market: "⚖ Tržnice", heroes: "⚑ Hrdinové",
  realm: "🏆 Skóre a diplomacie", goals: "🎯 Cíle sezóny", log: "📜 Kronika",
  chests: "💠 Truhly a popelná jádra",
};
let activeWin = null;
let citySig = null;      // podpis oken města (budovy/výcvik/vylepšení)
let logSeen = 0;         // počet záznamů Kroniky při posledním otevření okna

function openSideWin(key) {
  activeWin = key;
  $("#side-win").classList.remove("hidden");
  $("#side-win-title").textContent = WIN_TITLES[key];
  document.querySelectorAll("#side-win .win-sec").forEach(s =>
    s.classList.toggle("hidden", s.dataset.sec !== key));
  document.querySelectorAll(".rail-btn").forEach(b =>
    b.classList.toggle("active", b.dataset.win === key));
  if (key === "log") logSeen = logEntries().length;
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
    ? `<span class="chc" style="color:${RARITIES[i].color}" title="výbava — ${RARITIES[i].name}">${pct(w * (1 - GIFT_SHARE))} %</span>`
    : "").filter(Boolean);
  const giftW = [0, 0, 0];
  def.weights.forEach((w, i) => { giftW[GIFT_RARITY_TIER[i]] += w * GIFT_SHARE; });
  giftW.forEach((w, t) => { if (w > 0) parts.push(
    `<span class="chc" style="color:${HERO_TIERS[t].color}" title="🎁 dárek — ${HERO_TIERS[t].name} hrdina (stejná šance jako výbava té rarity)">🎁 ${pct(w)} %</span>`); });
  parts.push(`<span class="chc" style="color:#7ec8e3" title="posilovací doplněk (stavba/produkce)">🏗 ${pct(100 - wsum)} %</span>`);
  return parts.join(" ");
}

// aktivní strana truhel (dobro/zlo) — přepínač v okně truhel
let chestSide = "dobro";

// panel truhel se kreslí do okna lišty (#chests-panel) i do lobby
// (#lobby-chests) — vnitřní prvky proto nesou třídy, ne id
function updateChestsPanel(force) {
  const targets = [$("#chests-panel"), $("#lobby-chests")]
    .filter(el => el && !el.classList.contains("hidden"));
  if (!targets.length) return;
  if (activeWin !== "chests" && !force && !$("#lobby-chests")) return;
  const cores = acctCores();
  const inGame = acct.mode === "remote" ? mp.active : G.running;
  const boostInv = acctBoosts();
  const boostSig = Object.entries(boostInv).filter(([, n]) => n > 0)
    .map(([k, n]) => k + n).join(",");
  const pity = acctPity();
  const sig = [acct.mode, cores, acct.remote && acct.remote.name, chestSide,
    boostSig, pity, inGame ? 1 : 0].join("|");
  if (!force && sig === chestsSig) return;
  chestsSig = sig;
  const noAcc = acct.mode === "remote" && !acct.remote;
  let html = `<p class="chest-balance">${CORE_ICON} <b>${cores != null ? cores : "—"}</b>
      popelných jader <small>· ${acctLabel()}</small></p>`;
  if (noAcc) {
    html += `<p class="hint">Přihlas se k účtu v lobby (rámeček „Hra s přáteli“) —
      jádra, truhly i postup hrdinů se ukládají na server.</p>`;
  } else {
    // přepínač strany: truhly dobra a zla sypou výbavu a dárky jen své strany
    html += `<div class="chest-sides">` + Object.entries(SIDES).map(([sk, s]) => `
      <button class="chest-side-btn${chestSide === sk ? " active" : ""}" data-side="${sk}"
        style="--side-color:${s.color}" title="${s.desc}">${s.icon} ${s.name}</button>`).join("") + `</div>`;
    html += Object.entries(CHESTS).map(([tier, d]) => `
      <div class="chest-card side-${chestSide}" style="border-color:${d.color}55">
        <div class="chest-ico" style="text-shadow:0 0 12px ${d.color}">${d.icon}</div>
        <div class="chest-info">
          <b style="color:${d.color}">${SIDES[chestSide].icon} ${d.sideName[chestSide]}</b>
          <small>${d.desc} Sype vždy <b>${CHEST_ITEMS} ${CHEST_ITEMS < 5 ? "kusy" : "kusů"}</b>:
            výbavu a 🎁 dárky hrdinů ${SIDES[chestSide].icon} ${SIDES[chestSide].gen},
            nebo posilovací doplňky.</small>
          <small class="chest-odds">${chestWeightsStr(d)}</small>
          <div class="pity-bar" title="Po ${PITY_AT} truhlách bez legendy ji další vydá jistě. Počítadlo se nuluje, kdykoli legenda padne.">
            <div class="pity-fill" style="width:${Math.min(100, 100 * pity / PITY_AT)}%"></div>
            <span class="pity-txt">${pity >= PITY_AT - 1
              ? "příští truhla dá legendu jistě"
              : `jistá legenda za ${PITY_AT - pity} ${PITY_AT - pity === 1 ? "truhlu" : PITY_AT - pity < 5 ? "truhly" : "truhel"}`}</span>
          </div>
        </div>
        <button class="btn-chest" data-tier="${tier}" ${cores != null && cores >= d.cost ? "" : "disabled"}>
          Otevřít<br>${d.cost} ${CORE_ICON}</button>
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
            title="${bd.desc} na ${BOOST_MINUTES[t]} min">Použít</button>
        </div>`);
      }
    }
    if (boostRows.length) {
      const me = inGame && !mp.active ? player() : (mp.active ? G.factions[G.playerFaction] : null);
      const act = me && me.boosts
        ? [me.boosts.build > 0 ? `🏗 ${fmtTime(me.boosts.build)}` : "",
           me.boosts.prod > 0 ? `🎺 ${fmtTime(me.boosts.prod)}` : ""].filter(Boolean).join(" · ")
        : "";
      html += `<h4 class="boost-head">Posilovací doplňky${act ? ` <small class="boost-active">aktivní: ${act}</small>` : ""}</h4>
        ${boostRows.join("")}
        ${inGame ? "" : `<p class="hint">Doplňky použiješ za běžící hry — zdvojnásobí stavbu nebo produkci.</p>`}`;
    }
    html += `<div class="chest-reveal"></div>
      <div class="chest-code">
        <input class="code-input" placeholder="Promo kód" maxlength="20">
        <button class="btn-code">Uplatnit</button>
      </div>
      <p class="hint chest-status"></p>
      <p class="hint">${CORE_ICON} Jádra získáš ze hry: cíle sezóny (+20), pevnosti (+10/+25),
        bandy (+5) a karavany (+8), Trůnní město (+40), dohraná sezóna (+15, vítěz +50) —
        a z promo kódů. Balíčky jader za peníze: <b>připravujeme</b>.</p>
      <p class="hint">🎁 Dárky hrdinů zvyšují oddanost: hvězda hrdiny stojí 10/12/15/17/20…
        dárků (první hvězda hrdinu odemyká). Každá hvězda: +4 % statů, +25 velení,
        +1 bod dovedností. Kořist i postup zůstávají na účtu.</p>`;
  }
  for (const el of targets) {
    el.innerHTML = html;
    el.querySelectorAll(".chest-side-btn").forEach(btn =>
      btn.addEventListener("click", () => { chestSide = btn.dataset.side; updateChestsPanel(true); }));
    el.querySelectorAll(".btn-chest").forEach(btn =>
      btn.addEventListener("click", () => openChestAction(btn.dataset.tier)));
    el.querySelectorAll(".btn-boost").forEach(btn =>
      btn.addEventListener("click", () => useBoostAction(btn.dataset.kind, parseInt(btn.dataset.tier, 10))));
    const bc = el.querySelector(".btn-code");
    if (bc) bc.addEventListener("click", () => {
      const code = el.querySelector(".code-input").value;
      if (!code.trim()) return;
      if (acct.mode === "remote") netSend({ type: "redeemCode", code });
      else {
        const gain = accountRedeemCode(acct.local, code);
        setChestStatus(gain != null ? `Kód uplatněn: +${gain} ${CORE_ICON}.`
          : "Neplatný nebo už použitý kód.");
        if (gain != null) { saveLocalAccount(); updateChestsPanel(true); }
      }
    });
  }
}

// použití posilovacího doplňku (jen za běžící hry)
function useBoostAction(kind, tier) {
  if (acct.mode === "remote") { netSend({ type: "useBoost", kind, tier }); return; }
  if (!G.running || !player()) { setChestStatus("Doplňky lze použít jen za běžící hry."); return; }
  if (!accountUseBoost(acct.local, kind, tier, player())) {
    setChestStatus("Tento doplněk na účtu nemáš.");
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

function openChestAction(tier) {
  if (acct.mode === "remote") { netSend({ type: "openChest", tier, side: chestSide }); return; }
  const live = G.running && !mp.active ? player() : null;
  const res = accountOpenChest(acct.local, tier, chestSide, live);
  if (!res) { setChestStatus("Nedostatek popelných jader."); return; }
  // za běžící sólo hry rovnou do frakční zásoby (sync účtu to srovná)
  if (live) {
    for (const item of res.items) grantItemToFaction(live, item);
    syncAccountFromFaction(acct.local, live);
  }
  saveLocalAccount();
  showChestReveal(tier, res);
  updatePanels();
}

// karta dárku hrdiny do odhalení truhly (oddanost / hvězda / odemčení / 💠)
function giftRevealHtml(gift, delay) {
  if (!gift) return "";
  const tier = HERO_TIERS[heroTierOf(gift.key.split(":")[0], parseInt(gift.key.split(":")[1], 10))];
  let txt, big = false;
  if (gift.type === "cores") txt = `hrdina má 25★ — dárek se mění na +${gift.cores} ${CORE_ICON}`;
  else if (gift.type === "unlock") { txt = `⭐ ODEMČEN a povýšen na ${gift.star}★!`; big = true; }
  else if (gift.type === "star") { txt = `🌟 povýšen na ${gift.star}★ (+1 bod dovedností)`; big = true; }
  else txt = `oddanost ${gift.respect}/${gift.need}${gift.locked ? " k odemčení" : " do další ★"}`;
  return `<div class="reveal-card small gift${big ? " gift-big" : ""}"
      style="border-color:${tier.color};box-shadow:0 0 16px ${tier.color}66;animation-delay:${delay}s">
    <b class="reveal-name" style="color:${tier.color}">🎁 Dárek: ${gift.name}</b>
    <small>${tier.name} hrdina</small>
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
  if (!boxes.length) return;
  const d = CHESTS[tier];
  const inGame = acct.mode === "remote" ? mp.active : G.running;
  let delay = 0;
  const cards = items.map(item => {
    const r = RARITIES[item.rarity];
    return `<div class="reveal-card small" style="border-color:${r.color};box-shadow:0 0 14px ${r.color}55;animation-delay:${(delay += 0.12) - 0.12}s">
      <b class="reveal-name" style="color:${r.color}">${sideIcon(item)}${ITEM_SLOTS[item.slot].icon} ${item.name}</b>
      <small>${r.name}</small>
      <small>[Hrdina] ${itemEffectStr(item)}</small>
      ${item.set ? `<small style="color:${ITEM_SETS[item.set].color}">◆ ${ITEM_SETS[item.set].name}</small>` : ""}
      ${sigTagHtml(item)}
    </div>`;
  }).join("") + boosts.map(b => {
    const bd = BOOST_KINDS[b.boost];
    const tierD = HERO_TIERS[b.tier];
    return `<div class="reveal-card small boost" style="border-color:${tierD.color};box-shadow:0 0 12px ${tierD.color}44;animation-delay:${(delay += 0.12) - 0.12}s">
      <b class="reveal-name" style="color:${tierD.color}">${bd.icon} ${bd.name}</b>
      <small>${tierD.name} doplněk</small>
      <small>${bd.desc} na ${BOOST_MINUTES[b.tier]} min</small>
    </div>`;
  }).join("") + gifts.map(g => giftRevealHtml(g, (delay += 0.12) - 0.12)).join("");
  for (const box of boxes) box.innerHTML = `
    <div class="reveal-head"><span class="reveal-burst">${d ? d.icon : "🧰"} ✨</span>
      <small class="hint">${inGame
        ? "Kusy jsou ve frakční zásobě — nasadíš je ve Výbavě (🎒), posílíš v Kovárně (🔨)."
        : "Kusy čekají na účtu — hrdinové je vyfasují na startu příští hry."}</small></div>
    <div class="reveal-grid">${cards}</div>`;
  sfx.play("loot");
}

// štítek strany předmětu (☀ dobro / 🔥 zlo); kusy bez strany jsou univerzální
function sideIcon(item) {
  return item && item.side ? `<span title="${SIDES[item.side].name} — nosí jen hrdinové této strany">${SIDES[item.side].icon}</span> ` : "";
}

function closeSideWin() {
  activeWin = null;
  $("#side-win").classList.add("hidden");
  document.querySelectorAll(".rail-btn").forEach(b => b.classList.remove("active"));
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
  if (win.contains(document.activeElement) && document.activeElement !== win) return;
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
  if (!btn) return;
  btn.addEventListener("click", () => {
    if (!startRecruitOrder(me, recruitOrder)) return;
    for (const k of UNIT_KEYS) recruitOrder[k] = 0;
    citySig = null;
    updatePanels();
  });
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
  badge("#badge-log", activeWin === "log" ? (logSeen = seenNow, 0)
    : Math.max(0, seenNow - logSeen));
  badge("#badge-reports", unreadReportCount());
}

// ---------- Panely ----------
function updatePanels() {
  const me = player();
  if (!me) return;
  const inc = incomeOf(me);
  const upkeep = armyUpkeep(me);
  const foodNet = inc.food - upkeep;
  const foodEl = $("#res-food");
  foodEl.textContent = `${Math.floor(me.resources.food)} (${foodNet >= 0 ? "+" : ""}${Math.round(foodNet * 10) / 10})`;
  foodEl.parentElement.title = `Výnos +${Math.round(inc.food)} · údržba armády −${Math.round(upkeep * 10) / 10}`
    + (me.starving > 0 ? " — ARMÁDA HLADOVÍ!" : "");
  foodEl.classList.toggle("starving", me.starving > 0);
  $("#res-wood").textContent = `${Math.floor(me.resources.wood)} (+${Math.round(inc.wood)})`;
  $("#res-stone").textContent = `${Math.floor(me.resources.stone)} (+${Math.round(inc.stone)})`;
  $("#res-iron").textContent = `${Math.floor(me.resources.iron)} (+${Math.round(inc.iron)})`;
  $("#res-gold").textContent = `${Math.floor(me.resources.gold)} (+${Math.round(inc.gold * 10) / 10})`;
  $("#res-inf").textContent = me.units.inf;
  $("#res-arch").textContent = me.units.arch;
  $("#res-cav").textContent = me.units.cav;
  const training = me.recruitQueue.reduce((a, rq) => a + (rq.count || RECRUIT_BATCH), 0);
  $("#res-training").textContent = training ? `(+${training} ve výcviku)` : "";
  const coresEl = $("#res-cores");
  if (coresEl) {
    const cores = acctCores();
    coresEl.textContent = cores != null ? cores : "—";
  }
  $("#season-timer").textContent = fmtTime(SEASON_TICKS - G.tick)
    + (G.storm > 0 ? " · 🌋 bouře" : "") + (!G.throneOpen ? " · 👑 " + fmtTime(THRONE_UNLOCK - G.tick) : "");
  $("#btn-quit").classList.toggle("hidden", !G.running || G.gameOver);

  updateScores();
  updateGoals();
  updateTilePanel();
  updateCityPanels();
  updateHeroesPanel();
  updateRailBadges(me);
  updateChestsPanel();
  if (heroWinIdx !== null) renderHeroWindow();
  updateLog();
}

// skóre + diplomacie: u AI frakcí stav paktu / nabídka paktu
function updateScores() {
  const me = player();
  $("#scores").innerHTML = G.factions.map(f => {
    const s = f.alive ? scoreOf(f) : 0;
    let diplo = "";
    if (f.id !== me.id && f.alive && me.alive) {
      if (hasPact(me, f)) {
        diplo = `<span class="pact-tag" title="Pakt o neútokení">🤝 ${fmtTime(me.pacts[f.id])}</span>
          <a href="#" class="pact-cancel" data-f="${f.id}" title="Vypovědět pakt (frakce dlouho nedůvěřuje zrádci)">✕</a>`;
      } else if ((f.pactCooldown[me.id] || 0) > 0) {
        diplo = `<span class="pact-tag muted" title="Frakce teď o paktu nejedná">🤝 ✕</span>`;
      } else {
        diplo = `<a href="#" class="pact-offer" data-f="${f.id}"
          title="Nabídnout pakt o neútočení (tribut ${PACT_COST} 🪙; ${f.ai.mood})">🤝</a>`;
      }
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
      ${f.name} nabízí pakt (+50 🪙) — ${fmtTime(f.offerToPlayer)}
      <a href="#" class="offer-yes" data-f="${f.id}">přijmout</a> ·
      <a href="#" class="offer-no" data-f="${f.id}">odmítnout</a>
    </div>`).join("");
  const bind = (sel, fn) => $("#scores").parentElement.querySelectorAll(sel).forEach(a =>
    a.addEventListener("click", e => { e.preventDefault(); fn(parseInt(a.dataset.f, 10)); updatePanels(); }));
  bind(".pact-offer", id => {
    const r = offerPact(player(), id);
    if (r.ok) sfx.play(r.accepted ? "pact" : "error");
  });
  bind(".pact-cancel", id => cancelPact(player(), id));
  bind(".offer-yes", id => { acceptAiOffer(id); });
  bind(".offer-no", id => declineAiOffer(id));
}

// cíle sezóny (jednorázové odměny)
function updateGoals() {
  const rewardTxt = r => Object.entries(r)
    .map(([k, v]) => `+${v} ${k === "food" ? "🌾" : k === "wood" ? "🪵" : "🪙"}`).join(" ");
  $("#goals").innerHTML = G.goals.map(g =>
    `<div class="goal-row${g.done ? " done" : ""}">
      <span class="goal-check">${g.done ? "✅" : "◻"}</span>
      <span class="goal-desc">${g.def.desc}</span>
      <span class="goal-reward">${rewardTxt(g.def.reward)}</span>
    </div>`).join("");
}

function updateHeroesPanel() {
  const me = player();
  const panel = $("#heroes-panel");
  let html = me.heroes.map((h, i) => {
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
      status = `⚔ obléhá (${oblehani.ticksLeft} s)`;
      place = `<div class="hero-trait">Táboří u
        <a href="#" class="focus-hero" data-hero="${i}" title="Ukázat na mapě">📍 ${tileLabel(G.tiles.get(h.pos))}</a>
        · ${armyStr(h.army)}<br>Další náběh na <b>${tileLabel(cil)}</b> za ${oblehani.ticksLeft} s —
        pošli posily, než vyrazí ·
        <a href="#" class="turn-back" data-hero="${i}"
           title="Zrušit další náběh. Hrdina zůstane stát na svém poli — pak ho jde odvolat domů.">✕ zrušit obléhání</a></div>`;
    }
    else if (busy) {
      status = "🏃 na pochodu";
      const m = me.marches.find(mm => mm.heroIdx === i);
      if (m && (m.kind === "attack" || m.kind === "return")) {
        const t = G.tiles.get(m.targetKey);
        place = `<div class="hero-trait">${m.kind === "attack" ? "Táhne na" : "Vrací se do"}
          ${tileLabel(t)} (${m.ticksLeft} s)${m.returnAfter ? " · nájezd ↩" : ""} ·
          <a href="#" class="turn-back" data-hero="${i}"
             title="Obrátit se a vrátit na pole, odkud pochod vyšel">↩ obrátit se</a></div>`;
      }
    }
    else if (h.cooldown > 0) status = `🛌 zotavuje se (${h.cooldown} s)`;
    else if (h.guard) status = "🛡 drží stráž";
    else if (h.pos) status = "⚑ v poli";
    else status = h.stamina < 30 ? "😮‍💨 odpočívá" : "✔ připraven";
    // pozice: obléhající má vlastní řádek výše, tenhle blok by ho přepsal
    if (h.pos && !oblehani) {
      const t = G.tiles.get(h.pos);
      const canAct = !busy && h.cooldown <= 0;
      const pinned = heroPinned(me, i);
      const guardLink = h.guard
        ? `<a href="#" class="guard-toggle" data-hero="${i}" title="Ukončit stráž">🛡 zrušit stráž</a>`
        : `<a href="#" class="guard-toggle" data-hero="${i}"
             title="Stráž: hrdina brání i sousední pole (−${GUARD_COST} výdrže, pak −${GUARD_DRAIN}/s)">🛡 stráž</a>`;
      let actions = "";
      if (canAct && pinned) {
        // ukotven příchozími posilami: pohyb až po jejich doručení / zrušení
        const eta = Math.max(...me.marches
          .filter(m => m.kind === "reinforce" && m.targetKey === h.pos)
          .map(m => m.ticksLeft));
        actions = `<span class="pinned-note" title="Dokud posily nedorazí, hrdina nesmí opustit pole">📦 posily na cestě (${eta} s)</span>
          <a href="#" class="cancel-conv" data-hero="${i}"
             title="Obrátit konvoj zpět do města a hrdinu odemknout">✕ zrušit posily</a> ${guardLink}`;
      } else if (canAct) {
        actions = `<a href="#" class="recall" data-hero="${i}">↩ odvolat</a> ${guardLink}`;
      }
      place = `<div class="hero-trait">Stojí:
        <a href="#" class="focus-hero" data-hero="${i}" title="Ukázat na mapě">📍 ${tileLabel(t)}</a>
        · ${armyStr(h.army)}
        ${actions}</div>`;
    }
    return `<div class="hero-row${busy ? " busy" : ""}">
      <img class="hero-face hero-open" data-hero="${i}" src="${heroPortraitURL(me.key, h.defIdx)}"
        alt="" title="${def.name} — otevřít">
      <div class="hero-body">
      <div class="hero-head">
        <span class="hero-name"><a href="#" class="hero-open" data-hero="${i}">${def.name}</a>
          <span class="hero-lvl">úr. ${h.level}</span>${h.skillPts > 0
            ? `<a href="#" class="skill-pts hero-open" data-hero="${i}"
                 title="Nerozdělené body dovedností">＋${h.skillPts}</a>` : ""}</span>
        <span class="hero-status">${status}</span></div>
      <div class="hero-trait">${trait.name} — ${trait.desc} ·
        <a href="#" class="hero-open" data-hero="${i}">🎒 výbava ${gear}/6</a>${(() => {
          const u = heroDef(me, i).tree.find(s => s.ult);
          return u && (h.skills[u.key] || 0) >= u.max ? ` · <span class="ult-name">★ ${u.name}</span>` : "";
        })()}</div>
      ${place}
      <div class="hero-trait hero-stats-line"
        title="Bojové staty: životy · útok · poškození za kolo · obrana · rychlost (rozdíl útoku a obrany = ±5 % poškození za bod; rychlejší velitel v kole udeří první)">
        ❤ ${hp}/${st.hpMax} · ⚔ ${st.atk.toFixed(1)} · 🗡 ${st.dmg} · 🛡 ${st.def.toFixed(1)} · ⚡ ${st.speed}${st.spell > 0 ? ` · ✨ ${st.spell}` : ""}</div>
      <div class="hero-trait"
        title="Jednotky pod velením hrdiny (armáda v poli či na pochodu / limit velení)">
        🪖 ${(() => {
          // obléhací odpočet armádu nedrží (drží ji hrdina) — přeskočit
          const m = me.marches.find(mm => mm.heroIdx === i && mm.kind !== "siege");
          const army = m ? m.army : h.army;
          const n = Math.round(armyTotal(army));
          return n > 0 ? `${armyStr(army)} — ${n}/${st.cap} velení`
            : `bez armády — jednotky dostane při výpravě (velení ${st.cap})`;
        })()}</div>
      <div class="hp-bar" title="Životy velitele: v boji schytává malý podíl poškození skupiny; padne-li, zotavuje se a armáda na něj čeká">
        <div class="hp-fill" style="width:${hpPct}%"></div></div>
      <div class="stam-bar"><div class="stam-fill" style="width:${pct}%"></div></div>
      <div class="xp-bar" title="Zkušenosti: ${maxed ? "max. úroveň" : h.xp + " / " + xpForLevel(h.level)}">
        <div class="xp-fill" style="width:${xpPct}%"></div></div>
      </div>
    </div>`;
  }).join("");
  const cost = nextHeroCost(me);
  if (cost !== null) {
    const afford = me.resources.gold >= cost;
    html += `<div class="hire-box"><div class="hire-title">Najmout hrdinu (${cost} 🪙) — vyber koho:</div>` +
      me.hirePool.map(d => {
        const hd = HERO_DEFS[me.key][d];
        const trait = HERO_TRAITS[hd.trait];
        const key = me.key + ":" + d;
        const tier = HERO_TIERS[heroTierOf(me.key, d)];
        const unlocked = mp.active ? heroUnlockedAcc(key)
          : (typeof G.canHire !== "function" || G.canHire(me, d));
        const resp = acctRespect(key);
        return `<button class="btn-hire${unlocked ? "" : " locked"}" data-def="${d}"
            ${afford && unlocked ? "" : "disabled"}
            title="${unlocked ? "" : `Zamčen — odemkne ho ${giftCostForStar(1)} 🎁 dárků z truhel (oddanost ${resp}/${respectForStar(1)})`}">
          <img class="hero-face mini" src="${heroPortraitURL(me.key, d)}" alt="">
          <span class="hire-name">${unlocked ? "" : "🔒 "}${hd.name}
            <span class="tier-tag" style="color:${tier.color};border-color:${tier.color}66">${tier.name}</span>
            <small>${unlocked ? `${trait.name} — ${trait.desc}`
              : `zamčen — 🎁 oddanost ${resp}/${respectForStar(1)}`}</small></span></button>`;
      }).join("") + `</div>`;
  }
  panel.innerHTML = html;
  panel.querySelectorAll(".btn-hire").forEach(btn => btn.addEventListener("click", () => {
    hireHero(player(), parseInt(btn.dataset.def, 10));
    updatePanels();
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
    h.level, h.stars || 0, acctRespect(me.key + ":" + h.defIdx), Math.floor(h.xp), Math.round(h.hp ?? -1),
    ITEM_SLOT_KEYS.map(s => h.equip[s] ? h.equip[s].id + "*" + (h.equip[s].stars || 0) : 0).join(","),
    me.items.map(it => it.id + "*" + (it.stars || 0)).join(","),
    me.heroes.map(x => x.level + ":" + x.skillPts).join(","),
    h.skillPts, JSON.stringify(h.skills), canRespec,
    Math.floor(h.stamina / 5)].join("|");
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
  noCooldown: "♻", instantReturn: "🌀", ignoreDef: "🎯" };

// číslo efektu česky: zaokrouhlené na 2 desetinná místa, s desetinnou čárkou
// (hodnoty za bod jsou od Auditu 2 většinou desetinné)
function effNum(v) {
  return String(Math.round(v * 100) / 100).replace(".", ",");
}

// text efektu pro daný typ a součtovou hodnotu (rank × val)
function effText(type, v) {
  v = effNum(v);
  const M = {
    atk: `+${v} útoku`, def: `+${v} obrany`, dmg: `+${v} poškození hrdiny`,
    hp: `+${v} životů hrdiny`, spell: `+${v} kouzelného poškození každé kolo`,
    ward: `−${v} % poškození od nepřátelských hrdinů a kouzel`, spd: `+${v} rychlosti`,
    speed: `−${v} % času pochodu`, stamCost: `−${v} % ceny výdrže pochodů`,
    regen: `+${v} % obnovy výdrže`, stam: `+${v} maximální výdrže`,
    strike: `${v} nepřátel padne ještě před bojem`, aura: `útočníci v okolí −${v} % síly`,
    holdDef: `+${v} % obrany drženého pole`, heal: `${v} % ztrát se po výhře vrací`,
    xp: `+${v} % zkušeností`, gold: `+${v} 🪙 × úroveň pole za dobytí`,
    cap: `+${v} velených jednotek`, convoy: `posily o ${v} % rychleji`,
    structAtk: `+${v} % síly proti opevnění`, rally: `+${v} výdrže všem hrdinům po výhře`,
    fastReturn: `návrat o ${v} % rychleji`, winStam: `po vítězství plná výdrž`,
    noCooldown: `po porážce bez zotavování`, instantReturn: `návrat i ústup okamžitě`,
    ignoreDef: `útoky ignorují obranné bonusy terénu i opevnění`,
    stackAtk: `útok strany +${v} každým kolem boje (sčítá se)`,
    stackDef: `obrana strany +${v} každým kolem boje (sčítá se)`,
    followUp: `${v} % šance na navazující úder velitele (60 % poškození)`,
    stunChance: `${v} % šance omráčit nepřátelského velitele na kolo boje`,
    stunImmune: `velitele nelze omráčit`,
    unitDmg: `+${v} % poškození jednotek`, vsDmg: `+${v} % poškození jednotek`,
    avoidCharge: `[Armáda] pohltí ${v} ${v === "1" ? "úder" : "údery"} beze ztrát`,
    avoidChance: `${v} % šance pohltit úder`,
  };
  return M[type] || `${type} ${v}`;
}

// kolová aktivka: text nese i časování a počet cílů (podle předlohy RtW)
function roundEffText(e, v) {
  const t = e.timing || {};
  const kdy = t.round ? `⏱ ${t.round}. kolo` : (t.every ? `⏱ každé ${t.every}. kolo` : "⏱ každé kolo");
  if (e.type === "roundArmy") return `${kdy} — [Armáda] +${effNum(v)} % poškození`;
  const cile = (e.targets || 1) > 1 ? `[proti ${e.targets} cílům] ` : "";
  return `${kdy} — ${cile}${effNum(v)} % poškození velitele`;
}

// text podmínkového efektu s tagem [typ jednotky] / [proti frakci]
function condEffText(e, v) {
  if (e.cond && e.cond.unit) {
    const u = UNIT_TYPES[e.cond.unit];
    return `[${u.icon} ${u.name}] +${effNum(v)} % poškození`;
  }
  if (e.cond && e.cond.vsFaction) {
    const f = FACTION_DEFS.find(x => x.key === e.cond.vsFaction);
    const inner = e.type === "vsDmg" ? `+${effNum(v)} % poškození jednotek` : effText(e.type, v);
    return `[proti: ${f ? f.name : e.cond.vsFaction}] ${inner}`;
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
  const e = skillEffs(s)[0] || {};
  if (e.type === "roundDmg" || e.type === "roundArmy") {
    const t = e.timing || {};
    return t.round ? `⏱ ${t.round}. kolo` : (t.every ? `⏱ každé ${t.every}. kolo` : "⏱ každé kolo");
  }
  const M = {
    spell: "⏱ každé kolo", stackAtk: "⏱ každé kolo", stackDef: "⏱ každé kolo",
    unitDmg: "⏱ každé kolo", vsDmg: "⏱ každé kolo", dmg: "⏱ každé kolo",
    followUp: "⏱ při úderu", strike: "⏱ před bojem", stunChance: "⏱ začátek kola",
    avoidCharge: "🛡 při zásahu", avoidChance: "🛡 při zásahu",
    holdDef: "🛡 při obraně", aura: "🛡 v okolí", guardEff: "🛡 při stráži",
    heal: "🏳 po vítězství", rally: "🏳 po vítězství", winStam: "🏳 po vítězství",
    gold: "🏳 po dobytí", speed: "🥾 na pochodu", stamCost: "🥾 na pochodu",
    convoy: "🥾 na pochodu", fastReturn: "🥾 na pochodu", instantReturn: "🥾 na pochodu",
  };
  return M[e.type] || "trvale";
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
      <div class="cn-circle"><img class="cn-art" src="${skillArtURL(s)}" alt="">${unlocked ? "" : `<span class="cn-lock">🔒</span>`}
        <span class="cn-rank${r >= s.max ? " max" : ""}">${r >= s.max ? "Max" : `${r}/${s.max}`}</span></div>
      ${s.main && r >= s.max ? `<span class="cn-crown" title="Mistrovský bonus odemčen">👑</span>` : ""}
      ${s.main ? `<div class="cn-name cn-plate">${s.name}</div>` : ""}
    </div>`;
  }).join("");
  const cost = spent * RESPEC_GOLD_PER_POINT;
  const freeR = (me.freeRespecs || 0) > 0;
  const mains = tree.filter(s => s.main);
  const mastered = mains.filter(s => (h.skills[s.key] || 0) >= s.max).length;
  const ptsTxt = h.skillPts === 1 ? "bod" : (h.skillPts < 5 ? "body" : "bodů");
  return `
    <div class="constellation">
      <img class="const-hero" src="art/render/hero_${me.key}_${h.defIdx}.png" alt="">
      <svg class="const-lines" viewBox="0 0 100 100" preserveAspectRatio="none">${rings}${lines}</svg>
      ${nodes}
      ${skillCardHtml(me, h, tree, pos, spent)}
      ${hwFxOpen ? heroEffectsPanelHtml(me, h, tree) : ""}
    </div>
    <div class="const-foot">
      <span class="pts-chip" title="+1 bod dovedností za každou úroveň velitele (od 2.) a +1 za každou hvězdu">
        ✦ <b>${h.skillPts}</b> ${ptsTxt} k rozdělení</span>
      <span class="mastery-chip" title="Hlavní dovednosti na ${MAIN_MAX_RANK}/${MAIN_MAX_RANK} — každá odemyká trvalý bonus (detaily v záložce Unikát)">
        🏅 ${mastered}/${mains.length}</span>
      <button class="fx-toggle${hwFxOpen ? " on" : ""}" title="Souhrn všech naučených dovedností">☰ Aktuální efekty</button>
      ${spent > 0 ? `<button id="btn-respec" ${freeR || me.resources.gold >= cost ? "" : "disabled"}
        title="Vrátí všech ${spent} investovaných bodů${freeR ? " — reset zdarma máš k dispozici" : ""}">
        ↺ Reset ${freeR ? "(zdarma)" : `(${cost} 🪙)`}</button>` : ""}
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
  const now = r > 0 ? skillEffs(s).map(e => effLine(e, e.val * r)).join(" · ") : "zatím nenaučeno";
  const next = r < s.max ? skillEffs(s).map(e => effLine(e, e.val * (r + 1))).join(" · ") : null;
  return `<div class="skill-card ${side}">
    <button class="sc-close" title="Zavřít">✕</button>
    <div class="sc-head">
      <span class="sc-seal${s.main ? "" : " sub"}"><img class="cn-art" src="${skillArtURL(s)}" alt=""></span>
      <b>${s.ult ? "★ " : ""}${s.name}</b>
      ${r >= s.max ? `<span class="max-tag">Max</span>` : `<span class="cn-rank big">${r}/${s.max}</span>`}
    </div>
    <div class="sc-tags">
      <span class="sc-tag">${s.main ? (s.ult ? "Vrcholná dovednost" : "Hlavní dovednost")
        : `Větev · ${parent ? parent.name : ""}`}</span>
      <span class="sc-tag time">${skillTimingTag(s)}</span>
    </div>
    <p class="cd-desc">${s.desc}</p>
    <p class="cd-now">Nyní: <b>${now}</b></p>
    ${next ? `<p class="cd-next">Další bod: <b class="green">${next}</b></p>`
           : `<p class="cd-next">Plně naučeno.</p>`}
    ${s.main ? `<p class="cd-maxeff${r >= s.max ? " on" : ""}">✨ Bonus při plném naučení
      (${s.max}/${s.max}): ${effLine(s.maxEff, s.maxEff.val)}${r >= s.max ? " — aktivní" : ""}</p>` : ""}
    ${!unlocked ? `<p class="hint">🔒 ${s.parent
      ? `Odemkne se, až bude „${parent ? parent.name : s.parent}“ na ${s.req || SUB_REQ}. ranku (má ${h.skills[s.parent] || 0}).`
      : `Odemkne se po ${SKILL_UNLOCK_MAIN[s.slot]} investovaných bodech (máš ${spent}).`}</p>` : ""}
    ${can ? `<button class="cd-learn" data-skill="${s.key}">✦ Vylepšit <small>(1 bod, zbývá ${h.skillPts})</small></button>` : ""}
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
    <div class="fx-head"><b>Aktuální efekty</b><button class="fx-close" title="Zavřít">✕</button></div>
    <div class="fx-list">${rows.length ? rows.join("")
      : `<p class="hint">Zatím není naučená žádná dovednost.</p>`}</div>
    ${h.skillPts > 0 && nextKey ? `<button class="fx-alloc" data-skill="${nextKey}">✦ Rozdělit body (${h.skillPts})</button>` : ""}
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
      <p class="hint">${s.maxEffTrait ? `bonus rysu ${HERO_TRAITS[def.trait].name}`
        : "jedinečný bonus tohoto velitele"}${hotovo ? " — aktivní" : ""}</p>
    </div>`;
  }).join("");
  return `<h4>🏅 Mistrovství <small>(${done}/${mains.length})</small></h4>
    <p class="hint">Každá hlavní dovednost na ${MAIN_MAX_RANK}/${MAIN_MAX_RANK} odemyká trvalý bonus.</p>
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
      ${ult ? `<h4>★ Vrcholná dovednost</h4>
      <div class="uq-card${r > 0 ? " on" : ""}">
        <b>${ult.name}</b> <span class="cn-rank big">${r}/${ult.max}</span>
        <p>${ult.desc}</p>
        <p class="cd-now">${r > 0
          ? "Aktivní: " + skillEffs(ult).map(e => effLine(e, e.val * r)).join(" · ")
          : `Zatím nenaučena — strom ji odemkne po ${SKILL_UNLOCK_MAIN[SKILL_UNLOCK_MAIN.length - 1]} investovaných bodech.`}</p>
        ${ult.maxEff ? `<p class="cd-maxeff${r >= ult.max ? " on" : ""}">✨ Bonus při plném naučení (${ult.max}/${ult.max}):
          ${effLine(ult.maxEff, ult.maxEff.val)}${r >= ult.max ? " — aktivní" : ""}</p>` : ""}
      </div>` : ""}
      <h4>Rys velitele</h4>
      <div class="uq-card on"><b>${trait.name}</b><p>${trait.desc}</p></div>
      ${masteryHtml(me, h, def)}
      ${sig ? `<h4>⭐ Signature předmět</h4>
      <div class="uq-card${active ? " on" : ""}">
        <b>${ITEM_SLOTS[sig.slot].icon} ${sig.name}</b>
        <p>Pasivka „${sig.passive}“: ${sig.effs.map(e => effLine(e, e.val)).join(" · ")}</p>
        <p class="hint">${active ? "Nasazen — pasivka je aktivní."
          : owned ? "Máš ho ve skladu — nasaď ho tomuto hrdinovi (🎒 Výbava)."
          : "Získáš ho prvním dobytím Trůnního města tímto hrdinou, nebo vzácně z Truhly Popelného krále."}</p>
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
    ${big("⚔", "Útok", st.atk.toFixed(1), "Každý bod nad obranou nepřítele = +5 % poškození")}
    ${big("🛡", "Obrana", st.def.toFixed(1), "Každý bod nad útokem nepřítele = −5 % utrpěného poškození")}
    ${big("🗡", "Poškození", st.dmg, "Poškození, které hrdina sám udělí každé kolo boje")}
    ${big("⚡", "Rychlost", st.speed, "Rychlejší velitel v každém kole boje udeří první")}
  </div>`;
  html += `<div class="stat-grid">
    ${row("❤", "Životy", `${Math.round(h.hp ?? st.hpMax)}/${st.hpMax}`,
      "V boji velitel schytává malý podíl poškození skupiny; padne-li, zotavuje se a armáda na něj čeká")}
    ${st.spell > 0 ? row("✨", "Kouzla", st.spell, "Poškození přímo do životů nepřátel každé kolo — obchází útok/obranu i opevnění") : ""}
    ${st.stackAtk > 0 ? row("📈", "Zuřivost", `+${effNum(st.stackAtk)}/kolo`, "Útok strany roste každým kolem boje") : ""}
    ${st.stackDef > 0 ? row("🧱", "Zákopy", `+${effNum(st.stackDef)}/kolo`, "Obrana strany roste každým kolem boje") : ""}
    ${st.followUp > 0 ? row("⚡", "Navazující úder", `${st.followUp} %`, "Šance, že velitel v kole udeří podruhé za 60 % poškození") : ""}
    ${st.stunChance > 0 ? row("💫", "Omráčení", `${st.stunChance} %`, "Šance na začátku kola omráčit nepřátelského velitele — omráčený to kolo nepřispívá") : ""}
    ${st.stunImmune ? row("🛑", "Neochvějnost", "imunní", "Tohoto velitele nelze omráčit") : ""}
    ${st.avoidCharges > 0 ? row("🛡", "Vyhnutí", `${st.avoidCharges}× úder`,
      "Armáda beze ztrát pohltí prvních N úderů v bitvě") : ""}
    ${(st.actives || []).map(a => row("⏱", a.name,
      `${a.pct} % × ${a.targets}`,
      `Kolová schopnost: ${a.round ? `${a.round}. kolo` : `každé ${a.every}. kolo`} udeří za ${a.pct} % poškození velitele proti ${a.targets} cílům`)).join("")}
    ${(st.armyActives || []).map(a => row("📯", a.name, `+${a.pct} % armádě`,
      `Kolová schopnost: ${a.round ? `${a.round}. kolo` : `každé ${a.every}. kolo`} +${a.pct} % poškození celé armády`)).join("")}
    ${st.ward > 0 ? row("🔮", "Ochrana", `−${Math.round(st.ward * 100)} %`, "Snižuje poškození od nepřátelských hrdinů a kouzel") : ""}
    ${row("⚑", "Velení", st.cap, "Nejvyšší počet jednotek, který hrdina uvede (armáda + posily na cestě)")}
    ${row("🥾", "Čas pochodu", `×${st.time.toFixed(2)}`, "Násobek času všech pochodů hrdiny")}
    ${row("⏳", "Výdrž", `${Math.floor(h.stamina)}/${Math.round(st.stamMax)} (×${st.regen.toFixed(2)})`,
      "Pochody stojí výdrž; v závorce rychlost obnovy")}
  </div>`;
  // hvězdy hrdiny: rostou oddaností z 🎁 dárků (truhly) — automaticky při
  // naplnění ceny další hvězdy; trvalá progrese uložená na účtu
  const stars = h.stars || 0;
  const heroKey = me.key + ":" + h.defIdx;
  const resp = acctRespect(heroKey);
  if (stars < HERO_MAX_STARS) {
    const need = respectForStar(stars + 1);
    const pct = Math.min(100, Math.round(resp / need * 100));
    html += `<div class="promote-row"
      title="Dárky tohoto hrdiny z truhel dávají +10 oddanosti; při ${need} oddanosti povýší na ${stars + 1}★ (${giftCostForStar(stars + 1)} dárků). Každá hvězda: +4 % statů, +25 velení, +1 bod dovedností; povýšení uzdraví.">
      <span class="pr-stars">★ ${stars}<span class="dim">/${HERO_MAX_STARS}</span></span>
      <div class="respect-bar"><div class="respect-fill" style="width:${pct}%"></div>
        <span class="respect-num">🎁 oddanost ${resp}/${need} do ${stars + 1}★</span></div>
    </div>`;
  } else {
    html += `<div class="promote-row"><span class="pr-stars">★ ${HERO_MAX_STARS}</span>
      <small class="hint">maximální povýšení — dárky se mění na ${CORE_ICON}</small></div>`;
  }
  // armáda pod velením
  // obléhací odpočet armádu nedrží (drží ji hrdina) — přeskočit
  const m = me.marches.find(mm => mm.heroIdx === heroWinIdx && mm.kind !== "siege");
  const army = m ? m.army : h.army;
  const n = Math.round(armyTotal(army));
  html += `<h4>Armáda</h4><p>${n > 0 ? `${armyStr(army)} — ${n}/${st.cap} velení`
    : `bez armády — jednotky dostane při výpravě (velení ${st.cap})`}</p>`;
  // aktivní setové bonusy
  const counts = heroSetCounts(h);
  const rows = Object.entries(counts).map(([k, cnt]) => {
    const set = ITEM_SETS[k];
    const bons = set.bonuses.map(b =>
      `<span class="set-bonus${cnt >= b.pieces ? " on" : ""}">${b.pieces} ks: ${b.desc}</span>`).join("");
    return `<div class="set-row"><b style="color:${set.color}">◆ ${set.name}</b>
      <span class="set-count">${cnt}/6</span><div class="set-bonuses">${bons}</div></div>`;
  });
  if (rows.length) html += `<h4>Setové bonusy</h4>${rows.join("")}`;
  // řada slotů výbavy dole (jako v předloze) — klik skočí na tab Výbava
  const slotRow = ITEM_SLOT_KEYS.map(s => {
    const sd = ITEM_SLOTS[s];
    const it = h.equip[s];
    return `<div class="eq-slot st-eq${it ? ` filled rar-${it.rarity}` : " empty"}" data-goslot="${s}"
        title="${sd.name}${it ? ` — ${it.name} (${itemEffectStr(it)})` : " — prázdné · klikni pro výbavu"}">
      <span class="eq-ico">${sd.icon}</span>
      ${it && itemStars(it) ? `<span class="eq-stars up-stars">${itemStars(it)}</span>` : ""}
    </div>`;
  }).join("");
  html += `<h4>Výbava</h4><div class="eq-slot-row">${slotRow}</div>`;
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
    <p class="hint">— slot je prázdný —</p></div>`;
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
    <div class="cmp-name"><span class="slot-ico">${ITEM_SLOTS[it.slot].icon}</span> <b>${sideIcon(it)}${it.name}</b></div>
    <div class="cmp-stars"><span class="up-stars">${itemStars(it)}</span>
      <small style="color:${RARITIES[it.rarity].color}">${RARITIES[it.rarity].name}</small></div>
    <div class="cmp-line ${better}">[Hrdina] ${itemEffectStr(it)}</div>
    ${itemPassiveStr(it) ? `<div class="cmp-line it-pas">✨ ${itemPassiveStr(it)}</div>` : ""}
    ${(it.stars || 0) >= 5 ? `<div class="cmp-line master">🔨 ${MASTER_BONUS[it.slot].name}: ${MASTER_BONUS[it.slot].desc}</div>`
      : `<div class="cmp-line max5">na 5★: +${Math.round(it.value * 2.25)} · ${MASTER_BONUS[it.slot].name}</div>`}
    ${setHtml}
  </div>`;
}

function heroEquipTabHtml(me, h) {
  // řada slotů (jako v předloze dole pod postavou) — klik filtruje inventář
  const slots = ITEM_SLOT_KEYS.map(s => {
    const sd = ITEM_SLOTS[s];
    const it = h.equip[s];
    return `<div class="eq-slot${it ? ` filled rar-${it.rarity}` : " empty"}${hwSlotSel === s ? " selected" : ""}"
        data-slot="${s}" title="${sd.name}${it ? ` — ${it.name} (${itemEffectStr(it)})` : " — prázdné"}">
      <span class="eq-ico">${sd.icon}</span>
      ${it && itemStars(it) ? `<span class="eq-stars up-stars">${itemStars(it)}</span>` : ""}
    </div>`;
  }).join("");
  // inventář (filtr podle vybraného slotu)
  const items = [...me.items]
    .filter(it => !hwSlotSel || it.slot === hwSlotSel)
    .sort((a, b) => ITEM_SLOT_KEYS.indexOf(a.slot) - ITEM_SLOT_KEYS.indexOf(b.slot) || b.value - a.value);
  const inv = items.length
    ? items.map(it => `<div class="item-card rar-${it.rarity}${hwItemSel === it.id ? " selected" : ""}${it.side && it.side !== sideOfFaction(me.key) ? " wrong-side" : ""}" data-item="${it.id}">
        <span class="slot-ico">${ITEM_SLOTS[it.slot].icon}</span>
        <div class="slot-txt"><b>${sideIcon(it)}${it.name}</b>${itemStars(it) ? ` <span class="up-stars">${itemStars(it)}</span>` : ""}<small>${itemEffectStr(it)}</small>${itemPassiveStr(it) ? `<small class="it-pas">✨ ${itemPassiveStr(it)}</small>` : ""}${it.set
          ? `<small class="set-tag" style="color:${ITEM_SETS[it.set].color}">◆ ${ITEM_SETS[it.set].name}</small>` : ""}${sigTagHtml(it)}</div></div>`).join("")
    : `<p class="hint">${hwSlotSel ? "Pro tento slot nemáš v inventáři žádný kus." :
        "Inventář je prázdný. Výbavu sypou truhly (💠 v liště) a dobytí pevností či Trůnu."}</p>`;
  // porovnání vybraného kusu s nasazeným v jeho slotu
  let compare = "";
  const sel = me.items.find(it => it.id === hwItemSel);
  if (sel) {
    const cur = h.equip[sel.slot];
    // afinita stran: kus cizí strany hrdina nenasadí (v0.9)
    const wrongSide = sel.side && sel.side !== sideOfFaction(me.key);
    compare = `<div class="cmp-row">
      ${itemCompareCardHtml(sel, "Vybraný předmět", cur)}
      ${itemCompareCardHtml(cur, "Nasazený", sel)}
    </div>
    <div class="cmp-actions">
      <button id="btn-equip-sel" ${wrongSide ? "disabled" : ""}>${cur ? "⇄ Vyměnit" : "✔ Nasadit"}</button>
      ${cur ? `<button id="btn-unequip-cur">Sundat nasazený</button>` : ""}
      ${wrongSide ? `<small class="hint warn">${SIDES[sel.side].icon} Výbava ${SIDES[sel.side].name.toLowerCase()} —
        hrdinové ${SIDES[sideOfFaction(me.key)].name.toLowerCase()} ji nosit nemohou.</small>` : ""}
    </div>`;
  } else {
    const cur = hwSlotSel ? h.equip[hwSlotSel] : null;
    if (cur) compare = `<div class="cmp-row">${itemCompareCardHtml(cur, "Nasazený", null)}</div>
      <div class="cmp-actions"><button id="btn-unequip-cur" data-slot="${hwSlotSel}">Sundat</button></div>`;
    else compare = `<p class="hint">Vyber kus z inventáře — ukážu porovnání s nasazeným.</p>`;
  }
  return `<div class="eq-slot-row">${slots}</div>
    ${compare}
    <h4>Inventář frakce (${me.items.length})${hwSlotSel ? ` · filtr: ${ITEM_SLOTS[hwSlotSel].name}
      <a href="#" id="eq-clear-filter">zrušit</a>` : ""}</h4>
    <div class="inv-grid">${inv}</div>`;
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
      <span class="slot-ico">${ITEM_SLOTS[x.it.slot].icon}</span>
      <div class="slot-txt"><b>${x.it.name}</b>${itemStars(x.it) ? ` <span class="up-stars">${itemStars(x.it)}</span>` : ""}
        <small>${itemEffectStr(x.it)}${x.eq ? " · <i>nasazený</i>" : ""}</small>${itemPassiveStr(x.it) ? `<small class="it-pas">✨ ${itemPassiveStr(x.it)}</small>` : ""}</div>
    </div>`).join("")
    : `<p class="hint">Žádné předměty. Materiál sypou hlavně truhly (💠 v liště).</p>`;

  let detail = `<p class="hint">Vyber předmět k posílení. Materiálem jsou jiné kusy
    <b>stejného druhu a stejné rarity</b> — pohltí se a zmizí. Hvězdy stojí
    1 / 3 / 5 / 8 / 13 kusů, každá zvedá sílu předmětu o 25 %; pátá navíc
    probouzí <b>mistrovský bonus</b> slotu.</p>`;
      // zušlechtění: druhá dráha — sílí LOSOVANÁ pasivka kusu
      const refBlok = it => {
        if (!it.pas) return `<p class="hint">Tenhle kus nemá zvláštní vlastnost — zušlechtit nejde.</p>`;
        const st = it.refine || 0;
        if (st >= REFINE_MAX) return `<p class="master">✨ ${itemPassiveStr(it)} — vyšlechtěno na maximum.</p>`;
        const cena = REFINE_COST[st + 1];
        const dost = me.resources.gold >= cena;
        const nahled = itemPassiveEffs({ ...it, refine: st + 1 })
          .map(e => (Math.round(e.val * 100) / 100 + "").replace(".", ",")).join(", ");
        return `<p class="master">✨ ${itemPassiveStr(it)}
            <span class="fg-up">→ po zušlechtění ${nahled}</span></p>
          <button id="btn-refine" ${dost ? "" : "disabled"}>
            ✨ Zušlechtit na ${st + 1}. stupeň (${cena} 🪙${dost ? "" : " — nemáš"})</button>`;
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
        <p class="master">🔨 Mistrovský bonus „${mb.name}“: ${mb.desc}</p>
        <p class="hint">Hvězdy jsou na maximu.</p>
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
        : `<p class="hint">Chybí materiál: ${ITEM_SLOTS[target.slot].name}
            (${RARITIES[target.rarity].name}). Zkus otevřít truhly (💠).</p>`;
      const nextVal = Math.round(target.value * (1 + 0.25 * (stars + 1)));
      detail = `<div class="forge-detail rar-${target.rarity}">
        <p><b>${ITEM_SLOTS[target.slot].icon} ${target.name}</b> ${starBar}</p>
        <p>${itemEffectStr(target)} → <b class="fg-up">po vylepšení +${nextVal}</b></p>
        <p>Na ${stars + 1}. ★: <b>${need}×</b> ${ITEM_SLOTS[target.slot].name}
          · ${RARITIES[target.rarity].name} — vybráno <b>${hwForgeMats.length}/${need}</b>
          ${mats.length >= need ? ` <a href="#" id="forge-auto">vybrat za mě</a>` : ""}</p>
        <p class="hint">Na 5★: <b>+${Math.round(target.value * 2.25)}</b> a mistrovský bonus
          „${mb.name}“ — ${mb.desc}.</p>
        <div class="forge-mats">${matGrid}</div>
        <button id="btn-strengthen" ${hwForgeMats.length === need ? "" : "disabled"}>
          🔨 Posílit (${hwForgeMats.length}/${need})</button>
        ${refBlok(target)}
      </div>`;
    }
  }
  return `${detail}
    <h4>Předměty k posílení (${pool.length})</h4>
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
      ${hh.skillPts > 0 ? `<span class="hw-dot" title="Nerozdělené body">✦</span>` : ""}
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
    warlord: "⚑", mystic: "✨" };
  const starsN = Math.min(HERO_MAX_STARS, h.stars || 0); // hvězdy velitele (oddanost z dárků)
  $("#hero-window").innerHTML = `
    <div class="hw">
      <div class="hw-list">${list}</div>
      <div class="hw-main">
        <div class="hero-win-head">
          <div class="hw-face-wrap">
            <img class="hero-face big" src="${heroPortraitURL(me.key, h.defIdx)}" alt="">
            <span class="lvl-badge" title="Úroveň ${h.level} z ${HERO_MAX_LEVEL}">${h.level}</span>
          </div>
          <div class="hw-title">
            <h3>${def.name}
              <span class="hw-stars" title="Hvězdy velitele (max ${HERO_MAX_STARS}) — rostou oddaností z 🎁 dárků; každá +4 % statů, +25 velení, +1 bod dovedností">${starsN > 0 ? `★ ${starsN}` : `<span class="dim">☆ 0</span>`}</span></h3>
            <p class="hero-trait"><span class="hw-class-ico">${TRAIT_ICONS[def.trait] || "✦"}</span>
              ${me.race} · <span class="hw-class">${trait.name}</span> — ${trait.desc}</p>
            <div class="xp-bar big" title="${maxed ? "Maximální úroveň" : `Zkušenosti do další úrovně`}">
              <div class="xp-fill" style="width:${xpPct}%"></div>
              <span class="xp-num">${maxed ? `úr. ${h.level}/${HERO_MAX_LEVEL} — max`
                : `úr. ${h.level}/${HERO_MAX_LEVEL} · ${h.xp} / ${need} zk.`}</span></div>
          </div>
        </div>
        <div class="hw-body${tabChanged ? " tab-in" : ""}">${body}</div>
      </div>
      <div class="hw-tabs">
        <button class="hw-tab${heroWinTab === "stats" ? " active" : ""}" data-tab="stats" title="Staty">📊<small>Staty</small></button>
        <button class="hw-tab${heroWinTab === "skills" ? " active" : ""}" data-tab="skills" title="Dovednosti">✦<small>Strom</small>${h.skillPts > 0 ? `<span class="hw-dot">${h.skillPts}</span>` : ""}</button>
        <button class="hw-tab${heroWinTab === "equip" ? " active" : ""}" data-tab="equip" title="Výbava">🎒<small>Výbava</small></button>
        <button class="hw-tab${heroWinTab === "forge" ? " active" : ""}" data-tab="forge" title="Kovárna — Strengthen">🔨<small>Kovárna</small></button>
        <button class="hw-tab${heroWinTab === "unique" ? " active" : ""}" data-tab="unique" title="Ultimátka, rys a signature kus">★<small>Unikát</small></button>
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
  document.querySelectorAll("#hero-window .item-card[data-item]").forEach(el =>
    el.addEventListener("click", () => {
      const id = parseInt(el.dataset.item, 10);
      hwItemSel = hwItemSel === id ? null : id;
      rerender();
    }));
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
  const afford = UNIT_KEYS.map(k => canAfford(me, UNIT_TYPES[k].cost) ? 1 : 0).join("");
  const buildable = [...Object.keys(BUILDINGS), ...UNIT_KEYS.map(k => "up_" + k)]
    .map(key => canBuild(me, key).ok ? 1 : 0).join("");
  const convoys = me.marches.filter(m => m.kind === "reinforce").map(m => m.targetKey).join("|");
  const worldBits = [convoys, mapEventAt(selectedKey) ? 1 : 0, G.throneOpen ? 1 : 0,
    isVisible(selectedKey) ? 1 : 0, isExplored(selectedKey) ? 1 : 0,
    G.factions.map(f => hasPact(me, f) ? 1 : 0).join("")].join("");
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

function updateTilePanel() {
  const panel = $("#tile-panel");
  // rozkliknuté tlačítko (mezi stiskem a puštěním) — nerušit, klik by se ztratil
  if (panelHeld) return;
  // uživatel právě pracuje s formulářem (rozbalený select, psaní čísel) — nerušit
  if (panel.contains(document.activeElement) && document.activeElement !== panel) return;
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
    ? (target && target.owner === me.id ? "🥾 Přesun na" : "⚔ Útok na")
    : m.kind === "return" ? "🏠 Návrat do" : "↩ Ústup na";
  const prog = Math.round((m.total - m.ticksLeft) / m.total * 100);
  const canTurn = m.kind === "attack" || m.kind === "return";
  panel.innerHTML = `<button class="tp-close" id="tp-close" title="Zavřít">✕</button>
    <h3>Pochod — ${heroDef(me, m.heroIdx).name}</h3>
    <div class="march-head">
      <img class="march-face" src="${heroPortraitURL(me.key, h.defIdx)}" alt="">
      <div>
        <p>${kindTxt} <b>${target ? tileLabel(target) : "?"}</b></p>
        <p class="hint">z ${origin ? tileLabel(origin) : "?"} · ${armyStr(m.army)} (${armyTotal(m.army)} j.)</p>
      </div>
    </div>
    <div class="march-bar"><div class="march-fill" style="width:${prog}%;background:${me.color}"></div></div>
    <p class="hint">Dorazí za ${fmtTime(m.ticksLeft)}.</p>
    ${canTurn ? `<button id="btn-march-turn">↩ Obrátit zpět</button>` : ""}
    <button id="btn-march-hero">⚑ Detail hrdiny</button>`;
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
  marchPreview = null; // náhled trasy znovu nastaví jen otevřený formulář pochodu
  if (selectedMarchHero !== null) {
    const m = me ? me.marches.find(x => x.heroIdx === selectedMarchHero) : null;
    if (m) { renderMarchPanel(panel, me, m); return; }
    selectedMarchHero = null; // pochod skončil — zpět na běžný panel
  }
  panel.classList.toggle("hidden", !selectedKey);
  if (!selectedKey) { panel.innerHTML = ""; return; }
  const closeBtn = `<button class="tp-close" id="tp-close" title="Zavřít">✕</button>`;
  const t = G.tiles.get(selectedKey);
  // mlha války: neprozkoumaná pole neprozradí nic
  if (!isExplored(selectedKey)) {
    panel.innerHTML = `${closeBtn}<h3>Neprozkoumané území</h3>
      <p class="hint">Mlha války — pošli hrdinu blíž, ať zjistíš, co tu leží.</p>`;
    bindTpClose();
    return;
  }
  const seen = isVisible(selectedKey);
  const terr = TERRAIN[t.terrain];
  const ownerName = t.owner === -1 ? "neutrální" :
    `<span style="color:${G.factions[t.owner].color}">${G.factions[t.owner].name}</span>`;
  const resTxt = t.res === "all"
    ? `✦ všechny suroviny`
    : t.res ? `${RES_ICONS[t.res]} ${RES_NAMES[t.res]}` : "";
  let html = `${closeBtn}<h3>${t.structure ? STRUCTURES[t.structure].name : terr.name}</h3>
    <p>Síla ${t.structure === "grandfort" ? 500 : tierOf(t)} · ${ownerName}${resTxt ? " · " + resTxt : ""}</p>`;
  if (!terr.passable) {
    html += `<p class="hint">Neprůchodný terén.</p>`;
    panel.innerHTML = html; bindTpClose(); return;
  }
  if (!seen) {
    html += `<p>Obrana: ⚔ <span class="hint-inline">? (pole není na dohled)</span></p>`;
    html += tileGainHtml(t, me, true);
    html += `<p class="hint">Poslední známý stav — přesnou sílu obrany odhalí jen dohled.</p>`;
    panel.innerHTML = html; bindTpClose(); return;
  }
  const def = tileDefense(t);
  const homeDef = tileDefComponents(t).homeFaction;
  html += `<p>Obrana: ⚔ ${def}${homeDef
    ? ` <span class="hint-inline" title="Jednotky v zásobě brání hlavní město a nesou ztráty z boje">(vč. ${armyTotal(homeDef.units)} jednotek v zásobě)</span>` : ""}</p>`;
  const nctxt = neutralCmdTxt(t);
  if (nctxt) html += `<p class="neutral-cmd" title="Neutrální posádku vede velitel — jeho úroveň roste se silou pole. Nemá výbavu ani hvězdy.">🛡 Velitel: ${nctxt}</p>`;
  const mev = mapEventAt(selectedKey);
  if (mev) {
    const evd = MAP_EVENTS[mev.type];
    html += `<p class="map-event-tag">${evd.icon} <b>${evd.name}</b> (${fmtTime(mev.ticksLeft)}) — ${evd.desc}.</p>`;
  }
  if (t.structure === "throne" && !G.throneOpen) {
    html += `<p class="map-event-tag">🔒 Trůnní město chrání příměří — otevře se za ${fmtTime(THRONE_UNLOCK - G.tick)}.</p>`;
  }
  html += tileGainHtml(t, me, true);

  if (t.owner === me.id) {
    if (t.structure === "capital") {
      // správa města žije ve vlastních oknech boční lišty
      html += `<p class="hint">Srdce tvé říše. Zásoba jednotek brání město
        a jednotlivé agendy otevřeš v liště vpravo:</p>
        <div class="tp-shortcuts">
          <button class="tp-open" data-win="build">🏰 Budovy</button>
          <button class="tp-open" data-win="train">🗡 Výcvik</button>
          <button class="tp-open" data-win="upgrade">⚒ Vylepšení</button>
        </div>`;
    } else {
      const heroHereIdx = me.heroes.findIndex(h => h.pos === selectedKey);
      if (heroHereIdx !== -1) {
        const hh = me.heroes[heroHereIdx];
        const travel = travelTicks(t, CAPITAL_POS[me.id], REINFORCE_TICKS);
        html += `<p>⚑ ${heroDef(me, heroHereIdx).name} — ${armyStr(hh.army)}</p>`;
        if (heroPinned(me, heroHereIdx)) {
          const eta = Math.max(...me.marches
            .filter(m => m.kind === "reinforce" && m.targetKey === selectedKey)
            .map(m => m.ticksLeft));
          html += `<p class="map-event-tag">📦 Posily na cestě (${eta} s) — hrdina do jejich
            doručení nesmí opustit pole. Stráž držet může.</p>
            <button id="btn-cancel-conv">✕ Zrušit posily (konvoj se vrátí)</button>`;
        }
        const rfRoom = Math.max(0, heroArmyCap(me, heroHereIdx) - heroArmyCommitted(me, heroHereIdx));
        if (armyTotal(me.units) > 0 && rfRoom > 0) {
          // předvyplněno maximum, ale jen do limitu velení hrdiny
          html += `<div class="unit-inputs">${unitInputsHtml("reinforce", me, Math.min(armyTotal(me.units), rfRoom))}</div>
            <button id="btn-reinforce">Poslat posily z města</button>
            <p class="hint" id="rf-eta"></p>
            <p class="hint">Posily jdou nalehko — dvakrát rychleji než hrdina.
              Hrdina uvede nejvýše ${heroArmyCap(me, heroHereIdx)} jednotek (velení), volných ${rfRoom}.</p>`;
        } else if (rfRoom <= 0) {
          html += `<p class="hint">⚑ Hrdina je na limitu velení (${heroArmyCap(me, heroHereIdx)} jednotek) — posily nelze poslat.</p>`;
        } else {
          html += `<p class="hint">V zásobě nejsou žádné jednotky na posily.</p>`;
        }
      } else if (t.structure === "outpost") {
        // výspa: správa posádky — jednotky se přesouvají volně, drží trvalou stráž
        const inside = t.outpost || { inf: 0, arch: 0, cav: 0 };
        const room = OUTPOST_CAP - armyTotal(inside);
        html += `<h4>🗼 Posádka výspy (${armyTotal(inside)}/${OUTPOST_CAP})</h4>
          <p>${armyStr(inside)}</p>
          <p class="hint">Posádka brání výspu i všechna sousední vlastní pole
            (trvalá stráž) a nese skutečné ztráty z bojů.</p>`;
        if (room > 0 && armyTotal(me.units) > 0) {
          html += `<div class="unit-inputs">${unitInputsHtml("op", me, Math.min(armyTotal(me.units), room))}</div>
            <button id="btn-op-in">Přesunout do výspy</button>`;
        } else if (room <= 0) {
          html += `<p class="hint">Výspa je plná.</p>`;
        }
        if (armyTotal(inside) > 0) {
          html += `<button id="btn-op-out">Stáhnout vše do zásoby</button>`;
        }
      } else {
        html += `<p class="hint">Tvé území.</p>`;
        if (!t.structure && t.terrain !== "bridge") {
          const affordOp = canAfford(me, OUTPOST_COST);
          html += `<button id="btn-outpost" ${affordOp ? "" : "disabled"}
            title="Obranná stavba: posádka až ${OUTPOST_CAP} jednotek drží trvalou stráž nad polem i sousedy">
            🗼 Postavit výspu (${costStr(OUTPOST_COST)})</button>`;
        }
        const ready = me.heroes.map((h, i) => ({ h, i }))
          .filter(x => heroReady(me, x.i, t) && x.h.pos !== selectedKey);
        if (ready.length) {
          html += `
            <h4>Přesun hrdiny (obrana)</h4>
            <label>Hrdina: <select id="march-hero">${heroOptionsHtml(ready, me, t)}</select></label>
            <div class="unit-inputs" id="march-units">${unitInputsHtml("march", me, Math.min(30, armyTotal(me.units)))}</div>
            <p class="hint" id="march-eta"></p>
            <button id="btn-march">Přesunout na pole</button>
            <p class="hint">Hrdina na poli posiluje jeho obranu; se stráží 🛡 brání i sousední pole.</p>`;
        }
      }
    }
  } else if (t.structure === "throne" && !G.throneOpen) {
    html += `<p class="hint">Dokud platí příměří, na Trůnní město nelze zaútočit.</p>`;
  } else if (t.owner !== -1 && hasPact(me, G.factions[t.owner])) {
    html += `<p class="hint">🤝 S frakcí ${G.factions[t.owner].name} platí pakt o neútočení
      (${fmtTime(me.pacts[t.owner])}). Útok umožní až vypovězení paktu.</p>`;
  } else if (isAdjacentToFaction(me, t)) {
    const ready = me.heroes
      .map((h, i) => ({ h, i }))
      .filter(x => heroReady(me, x.i, t));
    if (!ready.length) {
      html += `<p class="hint">Žádný hrdina není k dispozici — všichni jsou na pochodu,
        zotavují se, nebo nemají dost výdrže.</p>`;
    } else {
      const needed = marchNeeded(t);
      html += `
        <label>Hrdina: <select id="march-hero">${heroOptionsHtml(ready, me, t)}</select></label>
        <div class="unit-inputs" id="march-units">${unitInputsHtml("march", me, needed)}</div>
        <label class="chk-return"><input type="checkbox" id="march-return">
          nájezd: po vítězství se vrátit na výchozí pole</label>
        <p class="hint" id="march-eta"></p>
        <button id="btn-march">Vyslat armádu</button>
        <p class="hint">Doporučená síla ≥ ${needed} jednotek. Hrdina v poli útočí celou svou armádou.
          Převahy: 🗡→🐎, 🏹→🗡, 🐎→🏹 (+30 %) · rychlost: 🏹 1×, 🐎 +30 %, 🗡 −20 %.</p>`;
    }
  } else {
    html += `<p class="hint">Mimo dosah — dobývat lze jen pole sousedící s tvým územím.</p>`;
  }
  panel.innerHTML = html;
  bindTilePanel(t, me);
}

// volby hrdinů pro výběr pochodu (společné pro útok i přesun k obraně);
// řadí se podle vzdálenosti k cíli — nejbližší hrdina je předvybraný
function heroOptionsHtml(ready, me, t) {
  ready = [...ready].sort((a, b) =>
    gridDist(heroPosOf(me, a.i), t) - gridDist(heroPosOf(me, b.i), t));
  return ready.map(x => {
    const where = x.h.pos ? `v poli, ${armyStr(x.h.army)}` : `výdrž ${Math.floor(x.h.stamina)}`;
    return `<option value="${x.i}" data-infield="${x.h.pos ? 1 : 0}">${heroDef(me, x.i).name}
      (${where} · velení ${heroStats(me, x.i).cap} · ${marchTime(me, t, x.i)} s · −${marchStaminaCost(me, t, x.i)} výdrže)</option>`;
  }).join("");
}

// rozdělí `suggest` jednotek proporcionálně podle zásoby ve městě; součet
// NIKDY nepřesáhne suggest (dřív Math.ceil přestřelil o 1–2 jednotky a odeslání
// pak tiše selhalo na limitu velení). Používá formulář v panelu i rychlé
// potvrzení pochodu z kola.
function suggestArmy(me, suggest) {
  const total = armyTotal(me.units);
  const vals = emptyArmy();
  let assigned = 0;
  for (const k of UNIT_KEYS) {
    vals[k] = suggest > 0 && total > 0
      ? Math.min(me.units[k], Math.floor(suggest * me.units[k] / total)) : 0;
    assigned += vals[k];
  }
  let left = Math.max(0, Math.min(suggest, total) - assigned); // dorovnat zbytek po floorech
  for (const k of UNIT_KEYS) {
    const add = Math.min(left, me.units[k] - vals[k]);
    vals[k] += add;
    left -= add;
  }
  return vals;
}

// doporučený objem armády na dobytí pole — stejné číslo hlásí panel i varování
function marchNeeded(t) { return Math.ceil(tileDefense(t) / SOLDIER_POWER) + 1; }

// tři číselná pole pro složení armády; výchozí hodnoty naplní `suggest`
function unitInputsHtml(prefix, me, suggest = 0) {
  const vals = suggestArmy(me, suggest);
  return UNIT_KEYS.map(k =>
    `<label>${UNIT_TYPES[k].icon} <input id="${prefix}-${k}" type="number"
      min="0" max="${me.units[k]}" value="${vals[k]}"> <span class="maxn">/${me.units[k]}</span></label>`
  ).join("");
}

function readUnitInputs(prefix) {
  const army = emptyArmy();
  for (const k of UNIT_KEYS) {
    const el = $(`#${prefix}-${k}`);
    if (el) army[k] = parseInt(el.value, 10) || 0;
  }
  return army;
}

// tři okna správy města (boční lišta) — dřív jeden panel hlavního města
// ---------- panel Výcvik ----------
// Zakázka se skládá jako armáda: u každého typu se jezdíkem nastaví počet
// kusů a naverbuje se všechno naráz. Objednávka žije MIMO DOM, aby ji
// překreslení panelu nesmazalo.
let recruitOrder = { inf: 0, arch: 0, cav: 0 };

function recruitOrderTotals(me) {
  let units = 0, cp = 0;
  for (const k of UNIT_KEYS) {
    const n = recruitOrder[k] || 0;
    units += n;
    cp += n * UNIT_TYPES[k].cp;
  }
  return { units, cp, cost: recruitOrderCost(me, recruitOrder) };
}

function recruitTotalsHtml(me) {
  const t = recruitOrderTotals(me);
  const enough = t.units > 0 && canAfford(me, t.cost);
  return `<div class="rec-sum">
      <b>${t.units}</b> ${t.units === 1 ? "kus" : t.units < 5 ? "kusy" : "kusů"}
      · <b>${t.cp}</b> velení
    </div>
    <div class="rec-price ${t.units && !enough ? "short" : ""}">${t.units ? costStr(t.cost) : "—"}</div>
    <button class="btn-order" ${enough ? "" : "disabled"}>Naverbovat</button>`;
}

function trainPanelHtml(me) {
  let html = `<p class="hint">Kasárny úr. ${me.buildings.barracks}
    · výcvik ${recruitTicks(me)} s · jezdíkem nastav počet, verbuje se vše naráz</p>
    <div class="recruit-list">`;

  for (const k of UNIT_KEYS) {
    const u = UNIT_TYPES[k];
    const pas = UNIT_PASSIVES[me.key][k];
    const locked = !unitUnlocked(me, k);
    const max = locked ? 0 : recruitAffordable(me, k);
    const n = Math.min(recruitOrder[k] || 0, max);
    recruitOrder[k] = n;
    const lockNote = k === "arch" ? "kasárny úr. 2" : "kasárny úr. 3";

    html += `<div class="rec-row${locked ? " locked" : ""}" data-type="${k}">
      <div class="rec-head">
        <span class="rec-name">${u.icon} ${u.name}</span>
        <span class="rec-cp">${u.cp} velení/ks</span>
      </div>
      <div class="rec-stats" title="Pasivní schopnost — ${pas.name}: ${pas.desc}">
        ❤${u.hp} 🗡${u.dmg} ⚔${u.atk} 🛡${u.def} · ${pas.name}
      </div>`;

    if (locked) {
      html += `<div class="rec-lock">zamčeno — ${lockNote}</div>`;
    } else if (max <= 0) {
      html += `<div class="rec-lock">nedostatek surovin (${costStr(u.cost)} za ${RECRUIT_BATCH} ks)</div>`;
    } else {
      html += `<div class="rec-ctl">
        <input type="range" class="rec-slider" data-type="${k}"
          min="0" max="${max}" step="1" value="${n}"
          aria-label="${u.name} — počet kusů">
        <output class="rec-count" data-type="${k}">${n}</output>
      </div>`;
    }
    html += `</div>`;
  }

  html += `</div><div class="rec-total">${recruitTotalsHtml(me)}</div>`;

  const counts = {};
  for (const rq of me.recruitQueue) counts[rq.type] = (counts[rq.type] || 0) + (rq.count || RECRUIT_BATCH);
  const trainTxt = UNIT_KEYS.filter(k => counts[k])
    .map(k => UNIT_TYPES[k].icon + counts[k]).join(" ");
  html += `<p class="hint">Ve výcviku: ${trainTxt || "—"}</p>`;
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
    <button class="btn-trade" ${ok ? "" : "disabled"}>Směnit</button>`;
}

function marketPanelHtml(me) {
  const lvl = marketLevel(me);
  if (lvl < 1) {
    return `<p class="hint">Tržnice není postavená. Postav ji v okně
      🏰 <b>Budovy</b> — pak si tu budeš moci směnit přebytek za to, čeho se
      nedostává (typicky dřevo za jídlo, když armáda žere).</p>`;
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

  return `<p class="hint">Tržnice úr. ${lvl} · kurz
      <b>${Math.round(MARKET_RATE[lvl] * 100)} %</b>
      (za 100 daných dostaneš ${Math.round(MARKET_RATE[lvl] * 100)}) ·
      nejmenší směna ${MARKET_MIN}</p>
    <p class="mk-label">Dáváš</p>
    <div class="mk-row">${radek("from", marketTrade.from)}</div>
    <div class="mk-ctl">
      <input type="range" class="mk-slider" min="0" max="${have}" step="1"
        value="${marketTrade.amount}" aria-label="Kolik surovin dát">
      <output class="mk-count">${marketTrade.amount}</output>
    </div>
    <p class="mk-label">Dostaneš</p>
    <div class="mk-row">${radek("to", marketTrade.to)}</div>
    <div class="mk-total">${marketPreviewHtml(me)}</div>
    <p class="hint">Zlato se neobchoduje — platí se jím žold, verbování
      a hrdinové.</p>`;
}

function buildPanelHtml(me) {
  let html = "";
  for (const key in BUILDINGS) {
    const b = BUILDINGS[key];
    const lvl = me.buildings[key];
    let action;
    if (me.build && me.build.key === key) {
      action = `<span class="hint">staví se… ${me.build.ticksLeft} s</span>`;
    } else if (lvl >= b.max) {
      action = `<span class="hint">max</span>`;
    } else {
      const info = buildCost(me, key);
      const check = canBuild(me, key);
      action = `<button class="btn-build" data-key="${key}" ${check.ok ? "" : "disabled"}
        title="${check.ok ? "" : check.why}">↑ ${costStr(info.cost)} · ${info.time} s</button>`;
    }
    html += `<div class="build-row" title="${b.desc}">
      <span>${b.name} <b>úr. ${lvl}</b></span>${action}</div>`;
  }
  html += `<p class="hint">Najetím na řádek zjistíš, co budova umí. Výspy 🗼 se
    staví přímo na mapě (klik na vlastní pole).</p>`;
  return html;
}

function upgradePanelHtml(me) {
  let html = "";
  for (const k of UNIT_KEYS) {
    const lvl = me.upgrades[k];
    const pas = UNIT_PASSIVES[me.key][k];
    const upName = UNIT_UPGRADES[me.key][k];
    const bkey = "up_" + k;
    let action;
    if (me.build && me.build.key === bkey) {
      action = `<span class="hint">staví se… ${me.build.ticksLeft} s</span>`;
    } else if (lvl >= UPGRADE_MAX) {
      action = `<span class="hint">max</span>`;
    } else {
      const info = buildCost(me, bkey);
      const check = canBuild(me, bkey);
      action = `<button class="btn-build" data-key="${bkey}" ${check.ok ? "" : "disabled"}
        title="${check.ok ? "" : check.why}">↑ ${costStr(info.cost)} · ${info.time} s</button>`;
    }
    html += `<div class="build-row"
      title="${pas.name}: ${pas.desc}. Vylepšení: +10 % síly za úroveň; úroveň 2 pasivku zesiluje (×1,5).">
      <span>${UNIT_TYPES[k].icon} ${upName} <b>úr. ${lvl}</b></span>${action}</div>`;
  }
  html += `<p class="hint">Každý typ jednotky má frakční pasivní schopnost (najetím na řádek).</p>`;
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
  const btnRf = $("#btn-reinforce");
  if (btnRf) {
    // živý odhad času konvoje podle složení posil
    const rfEta = $("#rf-eta");
    const heroHereIdx = me.heroes.findIndex(h => h.pos === keyOf(t.q, t.r));
    const updateRfEta = () => {
      if (!rfEta || heroHereIdx === -1) return;
      const army = readUnitInputs("reinforce");
      rfEta.classList.remove("warn");
      if (armyTotal(army) <= 0) {
        rfEta.textContent = "Vyber jednotky k odeslání.";
        btnRf.disabled = true;
        return;
      }
      const time = Math.max(1, Math.round(
        travelTicks(t, CAPITAL_POS[me.id], REINFORCE_TICKS)
        * heroStats(me, heroHereIdx).convoyMult * armyTimeMult(army)));
      let rfTxt = `Odhad cesty konvoje: ${time} s`;
      const room = Math.max(0, heroArmyCap(me, heroHereIdx) - heroArmyCommitted(me, heroHereIdx));
      const over = armyTotal(army) > room;
      if (over) rfTxt = `⚠ Přes limit velení — hrdina pobere už jen ${room} jednotek. Uber, ať jde konvoj poslat.`;
      rfEta.textContent = rfTxt;
      rfEta.classList.toggle("warn", over);
      btnRf.disabled = over; // dřív klik tiše selhal — teď je vidět proč
    };
    document.querySelectorAll('[id^="reinforce-"]').forEach(inp =>
      inp.addEventListener("input", updateRfEta));
    updateRfEta();
    btnRf.addEventListener("click", () => {
      if (startReinforce(me, t, readUnitInputs("reinforce"))) forceTilePanel();
      else if (rfEta) { rfEta.textContent = "Konvoj nejde poslat — zkontroluj počty jednotek."; rfEta.classList.add("warn"); }
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
  const btnOpIn = $("#btn-op-in");
  if (btnOpIn) btnOpIn.addEventListener("click", () => {
    outpostDeposit(me, t, readUnitInputs("op"));
    forceTilePanel();
  });
  const btnOpOut = $("#btn-op-out");
  if (btnOpOut) btnOpOut.addEventListener("click", () => { outpostWithdraw(me, t); forceTilePanel(); });
  const btnM = $("#btn-march");
  if (btnM) {
    const sel = $("#march-hero");
    const unitsBox = $("#march-units");
    const eta = $("#march-eta");
    // živý odhad času pochodu podle hrdiny a složení armády
    const updateEta = () => {
      if (!eta) return;
      const heroIdx = parseInt(sel.value, 10);
      const h = me.heroes[heroIdx];
      const army = h.pos ? h.army : readUnitInputs("march");
      if (armyTotal(army) <= 0) { eta.textContent = "Odhad pochodu: vyber jednotky."; return; }
      const mult = armyTimeMult(army);
      const time = Math.max(2, Math.round(
        marchTime(me, t, heroIdx) * heroStats(me, heroIdx).time * mult));
      const pct = Math.round((1 / mult - 1) * 100);
      let txt = `Odhad pochodu: ${time} s (tempo armády ${pct >= 0 ? "+" : ""}${pct} %)`;
      const gold = marchGoldCost(me, t, army);
      if (gold > 0) {
        txt += ` · žold ${gold} 🪙`;
        if (me.resources.gold < gold) txt += " — nedostatek zlata!";
      }
      const cap = heroStats(me, heroIdx).cap;
      if (!h.pos && armyTotal(army) > cap)
        txt += ` — přes limit velení (${armyTotal(army)}/${cap})!`;
      eta.textContent = txt;
    };
    const syncInputs = () => {
      const h = me.heroes[parseInt(sel.value, 10)];
      if (unitsBox) unitsBox.style.display = h.pos ? "none" : "";
      // průhledný náhled trasy vybraného hrdiny na mapě
      marchPreview = { from: heroPosOf(me, parseInt(sel.value, 10)),
        to: { q: t.q, r: t.r }, color: me.color };
      const cf = $("#march-confirm");
      if (cf) cf.remove(); // změna hrdiny/jednotek ruší rozpracované potvrzení
      updateEta();
    };
    sel.addEventListener("change", syncInputs);
    if (unitsBox) unitsBox.querySelectorAll("input").forEach(inp =>
      inp.addEventListener("input", syncInputs));
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
        ? `<button id="march-refill" title="Přejít na pole hrdiny a poslat mu posily z města">
            📦 Nejdřív doplnit posily (volných ${room})</button>` : "";
      // stejná varování jako u rychlého potvrzení z kola na mapě
      const needed = t.owner === me.id ? 0 : marchNeeded(t);
      const goldCost = marchGoldCost(me, t, army);
      const warn = [];
      if (needed && armyTotal(army) < needed)
        warn.push(`⚠ <b>Málo jednotek:</b> ${armyTotal(army)} z doporučených ${needed}
          (obrana pole ⚔ ${tileDefense(t)}). Útok nejspíš neuspěje.`);
      if (goldCost > me.resources.gold)
        warn.push(`⚠ <b>Nedostatek zlata</b> na žold: ${goldCost} 🪙,
          máš ${Math.floor(me.resources.gold)} 🪙.`);
      btnM.insertAdjacentHTML("afterend", `<div id="march-confirm">
        <p>Vyslat <b>${heroDef(me, heroIdx).name}</b> (${armyTotal(army)} j.)
          na <b>${tileLabel(t)}</b>? Dorazí za ~${fmtTime(time)}.</p>
        ${warn.map(w => `<p class="mc-warn">${w}</p>`).join("")}
        ${refill}
        <div class="mc-btns">
          <button id="march-go">⚔ Vyslat</button>
          <button id="march-cancel">✕ Zrušit</button>
        </div></div>`);
      $("#march-go").addEventListener("click", () => {
        const chk = $("#march-return");
        const returnAfter = !!(chk && chk.checked);
        if (startMarch(me, t, h.pos ? null : readUnitInputs("march"), heroIdx, returnAfter)) {
          sfx.play("march"); marchPreview = null; forceTilePanel();
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
const RES_NAMES = { food: "jídlo", wood: "dřevo", stone: "kámen", iron: "železo", gold: "zlato" };
function costStr(cost) {
  return Object.entries(cost).map(([r, v]) => `${v}${RES_ICONS[r]}`).join(" ");
}
const RAR_SHORT = ["obyčejná", "kvalitní", "vzácná", "epická", "legendární"];

function incomeStr(inc) {
  const parts = [];
  for (const r in inc) if (inc[r] > 0) parts.push(`+${inc[r]}${RES_ICONS[r]}`);
  return parts.length ? parts.join(" ") + "/s" : "žádný";
}

// kořist z boje sypou už jen klíčové stavby (první dobytí z neutrálu):
// Trůn legendárku jistě, pevnosti obou okruhů epický kus s 50% šancí
function structLootTxt(t) {
  if (t.owner !== -1) return null;
  if (t.structure === "throne")
    return `<span class="rar-chip" style="color:${RARITIES[4].color}">legendární kus — padne vždy</span>`;
  if (t.structure === "grandfort" || t.structure === "fortress")
    return `<span class="rar-chip" style="color:${RARITIES[3].color}">epický kus — šance 50 %</span>`;
  return null;
}

// řádky „co za pole dostanu“ — výnos, skóre, kořist
function tileGainHtml(t, me, full) {
  const inc = tileIncomePreview(t, me);
  const score = tierScore(t) + (t.structure ? STRUCTURES[t.structure].score : 0);
  let html = `<p class="tile-gain">Výnos: <b>${incomeStr(inc)}</b> · Skóre: <b>+${score}</b></p>`;
  if (t.owner !== me.id && full) {
    const loot = structLootTxt(t);
    if (loot) html += `<p class="tile-gain">🎁 Kořist při dobytí: ${loot}</p>`;
  }
  return html;
}

let lastLogHtml = null;
let logView = "mine"; // Kronika: "mine" = jen mé tahy a útoky na mě, "all" = celý Vellar

// záznamy podle filtru: vlastní akce, obecné hlášky (-1) a bitvy, kde jsem
// útočník či obránce (poznají se přes report — jeho strany nesou klíč frakce)
function logEntries() {
  const me = player();
  if (!me || logView === "all") return G.log;
  return G.log.filter(e => e.factionId === me.id || e.factionId === -1
    || (e.reportId && G.reports.some(r => r.id === e.reportId
        && ((r.att && r.att.fkey === me.key) || (r.def && r.def.fkey === me.key)))));
}

function updateLog() {
  const el = $("#log");
  const rows = logEntries().slice(-15).reverse().map(e => {
    const color = e.factionId >= 0 ? G.factions[e.factionId].color : "#aab";
    const rep = e.reportId && G.reports.some(r => r.id === e.reportId)
      ? ` <a href="#" class="log-report" data-rep="${e.reportId}" title="Otevřít bojový report">📜</a>` : "";
    return `<div class="log-row"><span class="dot" style="background:${color}"></span>
      <span class="t">${fmtTime(e.tick)}</span> ${e.text}${rep}</div>`;
  }).join("");
  const html = `<div class="log-tabs">
      <button class="log-tab${logView === "mine" ? " active" : ""}" data-view="mine">⚑ Moje tahy</button>
      <button class="log-tab${logView === "all" ? " active" : ""}" data-view="all">🌍 Celý Vellar</button>
    </div>` + (rows || `<p class="hint">Zatím žádné záznamy.</p>`);
  if (html === lastLogHtml) return; // beze změny nepřekreslovat (a nehýbat scrollem)
  lastLogHtml = html;
  el.innerHTML = html;
}

// ---------- Bojové reporty (podle předlohy RtW) ----------
let reportOpenId = null;
const readReports = new Set(); // přečtené reporty (v této relaci prohlížeče)

function unreadReportCount() {
  return G.reports.filter(r => !readReports.has(r.id)).length;
}

function openReport(id) {
  const rep = G.reports.find(r => r.id === id);
  if (!rep) return;
  reportOpenId = id;
  readReports.add(id);
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
    <p class="hint" style="padding:30px 20px">Zatím žádné bitvy. Reporty se tu
      objeví po každém tvém útoku i obraně — a stejné 📜 odkazy najdeš
      v Kronice.</p></div>`;
  $("#report-overlay").classList.remove("hidden");
}

// okno reportů: seznam bitev vlevo (se stavem přečtení), detail vpravo
function renderReportWindow() {
  const rep = G.reports.find(r => r.id === reportOpenId);
  if (!rep) { closeReport(); return; }
  const list = [...G.reports].reverse().map(r => `
    <button class="rw-item${r.id === reportOpenId ? " active" : ""}" data-rep="${r.id}">
      <span class="rw-res ${r.won ? "win" : "loss"}">${r.won ? "⚔" : "🛡"}</span>
      <span class="rw-meta"><b>${r.tileName}</b>
        <small>${fmtTime(r.tick)} · ${r.won ? "dobyto" : "ubráněno"}</small></span>
      ${readReports.has(r.id) ? "" : `<span class="rw-unread" title="Nepřečteno"></span>`}
    </button>`).join("");
  $("#report-window").innerHTML = `
    <div class="rw">
      <div class="rw-list">
        <button id="rw-readall" class="rw-readall" title="Označit všechny bitvy jako přečtené">✔ vše přečteno</button>
        ${list}
      </div>
      <div class="rw-main">${reportHtml(rep)}</div>
    </div>`;
  document.querySelectorAll("#report-window .rw-item").forEach(b =>
    b.addEventListener("click", () => openReport(parseInt(b.dataset.rep, 10))));
  $("#rw-readall").addEventListener("click", () => {
    G.reports.forEach(r => readReports.add(r.id));
    renderReportWindow();
  });
}

// blok velitele v hlavičce reportu: portrét, úroveň, jméno, frakce, pruh armády
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
    : `<div class="rw-face militia" title="Domobrana bez velitele">🛡</div>`;
  const heroName = isAtt ? p.hero : (p.leadName || (p.heroes && p.heroes[0]) || "domobrana");
  const hp = isAtt ? rep.heroHpA : rep.heroHpD;
  const fell = isAtt ? rep.heroFellA : rep.heroFellD;
  return `<div class="rw-cmdr">
    <div class="rw-portrait">${portrait}
      ${p.level ? `<span class="rw-lvl">${p.level}</span>` : ""}</div>
    <b class="rw-hero">${heroName}</b>
    <small class="rw-fac" style="color:${p.color}">${p.name}</small>
    ${hp != null ? `<small class="rw-hp">${fell ? "💔" : "❤"} ${hp}${fell ? " — padl" : ""}</small>` : ""}
    <div class="rw-armybar" title="${isAtt ? armyStr(rep.attRem || rep.initA) : armyStr(rep.remD || rep.initD)}">
      <div class="rw-armyfill" style="width:${remPct}%;background:${p.color}"></div>
    </div>
    <small class="rw-armynum">${Math.round(rem).toLocaleString("cs-CZ")} / ${Math.round(init).toLocaleString("cs-CZ")}
      ${!isAtt && rep.def.homeUnits ? " (vč. zásoby)" : ""}</small>
  </div>`;
}

function reportHtml(rep) {
  const totalA0 = armyTotal(rep.initA), totalD0 = armyTotal(rep.initD);
  const side = (ico, color, remArmy, killed, init) => {
    const rem = armyTotal(remArmy);
    const remPct = init > 0 ? Math.min(100, rem / init * 100) : 0;
    const lossPct = init > 0 ? Math.min(100 - remPct, killed / init * 100) : 0;
    return `<div class="rep-side"><span class="rep-ico">${ico}</span>
      <div class="rep-bar">
        <div class="rep-fill" style="width:${remPct}%;background:${color}"></div>
        <div class="rep-lost" style="width:${lossPct}%"></div>
      </div>
      <span class="rep-num" title="${armyStr(remArmy)}">${Math.round(rem)}${killed > 0 ? `<em>−${killed}</em>` : ""}</span>
    </div>`;
  };
  const evs = list => list.length
    ? `<div class="rep-evs">${list.map(e => `<span class="rep-ev">${e}</span>`).join("")}</div>` : "";

  // hlavička: velitelé proti sobě + banner výsledku
  let html = `<div class="rw-head">
    ${cmdrBlockHtml(rep, "att")}
    <div class="rw-banner ${rep.won ? "win" : "loss"}">
      <div class="rw-result">${rep.won ? "DOBYTO" : "UBRÁNĚNO"}</div>
      <div class="rw-tile">⚔ ${rep.tileName}</div>
      <small>${fmtTime(rep.tick)} · ${rep.rounds} ${rep.rounds === 1 ? "kolo" : rep.rounds < 5 ? "kola" : "kol"}</small>
    </div>
    ${cmdrBlockHtml(rep, "def")}
  </div>`;

  // souhrnné metriky (Poškození velitele × jednotek — jako v předloze)
  if (rep.tot) {
    const t = rep.tot;
    const fmt = v => Math.max(0, Math.round(v)).toLocaleString("cs-CZ");
    const row = (a, label, d, tip) => `<div class="rw-srow" title="${tip}">
      <span class="rw-sval">${a}</span><span class="rw-slab">${label}</span><span class="rw-sval">${d}</span></div>`;
    html += `<div class="rw-stats">
      ${row(fmt(armyTotal(rep.attLosses || {inf:0,arch:0,cav:0})), "Padlé jednotky", fmt(rep.defKilled),
        "Kolik jednotek strana v bitvě ztratila (útočník vč. pronásledování)")}
      ${row(fmt(t.dmgA - t.cmdA), "Poškození jednotek", fmt(t.dmgD - t.cmdD),
        "Poškození, které udělily jednotky strany")}
      ${row(fmt(t.cmdA), "Poškození velitele", fmt(t.cmdD),
        "Poškození udělené samotným velitelem (zbraň + kouzla)")}
      ${(t.revA || t.revD) ? row(fmt(t.revA), "Obnovené jednotky", fmt(t.revD),
        "Jednotky vrácené do boje pasivkami (Požírači…)") : ""}
      ${(t.avoidA || t.avoidD) ? row(fmt(t.avoidA || 0), "Pohlcené poškození", fmt(t.avoidD || 0),
        "Poškození zcela pohlcené obrannými chargami („vyhnutí“)") : ""}
    </div>`;
  }

  html += evs(rep.pre);
  // průběh po kolech — sbalený detail, ať souhrn zůstane přehledný
  let rounds = "";
  for (const rd of rep.roundLog) {
    rounds += `<div class="rep-round">
      <div class="rep-rhead"><b>Kolo ${rd.r}</b>
        <span class="rep-pow" title="Udělené poškození stran v tomto kole">🗡 ${rd.pA.toLocaleString("cs-CZ")} : ${rd.pD.toLocaleString("cs-CZ")}</span>${rd.hpA != null || rd.hpD != null
          ? `<span class="rep-pow" title="Životy velitelů po kole">❤ ${rd.hpA != null ? rd.hpA : "—"} : ${rd.hpD != null ? rd.hpD : "—"}</span>` : ""}</div>
      ${side("⚔", rep.att.color, rd.remA, rd.killedA, totalA0)}
      ${side("🛡", rep.def.color, rd.remD, rd.killedD, totalD0)}
      ${evs(rd.ev)}
    </div>`;
  }
  html += `<details class="rw-rounds" open>
    <summary>Průběh bitvy po kolech (${rep.rounds})</summary>${rounds}</details>`;
  html += evs(rep.post);
  html += `<p class="rep-final">${rep.won
    ? `⚑ <b>${rep.att.name}</b> pole dobývá — obránce ztrácí ${rep.defKilled} jednotek,
       útočník ${armyTotal(rep.attLosses)} (zbývá mu ${armyStr(rep.attRem)}).`
    : `🛡 Obránce (<b>${rep.def.name}</b>) pole drží —
       útočník ztrácí ${armyTotal(rep.attLosses)} jednotek, obránce ${rep.defKilled}.`}</p>`;
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
  if (!own) {
    const blocked = (t.structure === "throne" && !G.throneOpen)
      || (t.owner !== -1 && hasPact(me, G.factions[t.owner]))
      || !isAdjacentToFaction(me, t);
    if (!blocked && anyReady)
      acts.push({ icon: "⚔", label: "Zaútočit", act: () => showHeroPick(t, "Zaútočit") });
  } else if (t.structure === "capital") {
    // hlavní město: nábor a stavby řeší boční panel
  } else if (heroHereIdx !== -1) {
    const h = me.heroes[heroHereIdx];
    acts.push({ icon: "🛡", label: h.guard ? "Zrušit stráž" : "Stráž",
      act: () => { hideTileMenu(); toggleGuard(me, heroHereIdx); forceTilePanel(); } });
    if (heroPinned(me, heroHereIdx)) {
      acts.push({ icon: "✕", label: "Zrušit posily",
        act: () => { hideTileMenu(); cancelReinforce(me, heroHereIdx); forceTilePanel(); } });
    } else if (!heroBusy(me, heroHereIdx)) {
      if (armyTotal(me.units) > 0)
        acts.push({ icon: "📦", label: "Poslat posily", act: () => focusPanelEl("#btn-reinforce") });
      acts.push({ icon: "🏠", label: "Odvolat domů",
        act: () => { hideTileMenu(); startRecall(me, heroHereIdx); forceTilePanel(); } });
    }
  } else if (anyReady) {
    acts.push({ icon: "🥾", label: "Přesun hrdiny", act: () => showHeroPick(t, "Přesun hrdiny") });
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
  const ready = me.heroes.map((h, i) => ({ h, i }))
    .filter(x => heroReady(me, x.i, t) && x.h.pos !== key)
    .sort((a, b) => gridDist(heroPosOf(me, a.i), t) - gridDist(heroPosOf(me, b.i), t));
  if (!ready.length) { hideTileMenu(); return; }
  const menu = $("#tile-menu");
  menu.innerHTML = `<div class="tm-heroes"><div class="tm-title">${title} — kým?</div>` +
    ready.map(x => {
      const where = x.h.pos ? `v poli · ${armyTotal(x.h.army)} j.` : `doma · výdrž ${Math.floor(x.h.stamina)}`;
      return `<button class="tm-hero" data-i="${x.i}"><b>${heroDef(me, x.i).name}</b>
        <span>${where} · ${marchTime(me, t, x.i)} s</span></button>`;
    }).join("") + `</div>`;
  positionTileMenu(t);
  menu.querySelectorAll(".tm-hero").forEach(btn => btn.addEventListener("click", () =>
    showMarchConfirm(t, parseInt(btn.dataset.i, 10), title)));
}

// třetí krok kola: potvrzení rovnou na mapě a hned vyslání. Dřív volba hrdiny
// jen odskočila na formulář v panelu — hráči to přišlo, že se neděje nic.
// Hrdina v poli táhne celou svou armádou, z domova mu naložíme doporučený
// objem; kdo chce jiné složení nebo posily, jde přes „⚙ Upravit".
function showMarchConfirm(t, heroIdx, title) {
  const me = player();
  const h = me.heroes[heroIdx];
  const own = t.owner === me.id;
  const needed = own ? 0 : marchNeeded(t);
  const room = Math.max(0, heroArmyCap(me, heroIdx) - heroArmyCommitted(me, heroIdx));
  const army = h.pos ? armyClone(h.army)
    : suggestArmy(me, Math.min(room, own ? Math.min(30, armyTotal(me.units)) : needed));
  const total = armyTotal(army);
  const time = Math.max(2, Math.round(
    marchTime(me, t, heroIdx) * heroStats(me, heroIdx).time * armyTimeMult(army)));
  const gold = marchGoldCost(me, t, army);
  const warn = [];
  if (total > 0 && needed && total < needed)
    warn.push(`⚠ <b>Málo jednotek:</b> ${total} z doporučených ${needed}
      (obrana pole ⚔ ${tileDefense(t)}). Útok nejspíš neuspěje.`);
  if (total > 0 && gold > me.resources.gold)
    warn.push(`⚠ <b>Nedostatek zlata</b> na žold: ${gold} 🪙, máš ${Math.floor(me.resources.gold)} 🪙.`);
  // náhled trasy na mapě jako u formuláře v panelu
  marchPreview = { from: heroPosOf(me, heroIdx), to: { q: t.q, r: t.r }, color: me.color };
  const menu = $("#tile-menu");
  menu.innerHTML = `<div class="tm-heroes tm-confirm">
    <div class="tm-title">${title} — ${tileLabel(t)}</div>
    ${total > 0
      ? `<p class="tm-sum"><b>${heroDef(me, heroIdx).name}</b> · ${armyStr(army)} (${total} j.)<br>
          dorazí za ~${fmtTime(time)}${gold > 0 ? ` · žold ${gold} 🪙` : ""}</p>`
      : `<p class="tm-warn">⚠ Není co vyslat — ${h.pos
          ? "hrdina v poli nemá žádné jednotky." : "ve městě nejsou jednotky v zásobě."}</p>`}
    ${warn.map(w => `<p class="tm-warn">${w}</p>`).join("")}
    ${total > 0 && !own ? `<label class="tm-chk"><input type="checkbox" class="tm-return">
      nájezd: po vítězství se vrátit</label>` : ""}
    <div class="tm-btns">
      ${total > 0 ? `<button class="tm-go">⚔ Vyslat</button>` : ""}
      <button class="tm-tune" title="Otevřít formulář v panelu pole — složení armády, posily, nájezd">⚙ Upravit</button>
      <button class="tm-cancel">✕ Zrušit</button>
    </div></div>`;
  positionTileMenu(t);
  const go = menu.querySelector(".tm-go");
  if (go) go.addEventListener("click", () => {
    const chk = menu.querySelector(".tm-return");
    if (startMarch(me, t, h.pos ? null : army, heroIdx, !!(chk && chk.checked))) {
      sfx.play("march");
      marchPreview = null;
      hideTileMenu();
      selectedKey = keyOf(t.q, t.r);
      forceTilePanel();
    } else {
      // mezi vykreslením a klikem se něco změnilo (výdrž, zásoba, pakt…)
      go.disabled = true;
      menu.querySelector(".tm-confirm").insertAdjacentHTML("beforeend",
        `<p class="tm-warn">Pochod se nepodařilo vyslat. Zkontroluj v panelu pole
          výdrž hrdiny, limit velení a zlato.</p>`);
    }
  });
  menu.querySelector(".tm-tune").addEventListener("click", () => openMarchForm(t, heroIdx));
  menu.querySelector(".tm-cancel").addEventListener("click", () => {
    marchPreview = null;
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
    const t = tileAt(h.q, h.r);
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
    const t = tileAt(h.q, h.r);
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
  const nc = neutralCommander(t);
  const tr = HERO_TRAITS[nc.trait];
  return `${nc.name} · úr. ${nc.level} · ${tr ? tr.name : ""}`;
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
    tip.innerHTML = `<b>Neprozkoumané území</b><div class="tip-row">Mlha války — pošli hrdinu blíž.</div>`;
    return;
  }
  const me = player();
  const terr = TERRAIN[tile.terrain];
  const ownerTxt = tile.owner === -1 ? "neutrální"
    : `<span style="color:${G.factions[tile.owner].color}">${G.factions[tile.owner].name}</span>`;
  let html = `<b>${tile.structure ? STRUCTURES[tile.structure].name : terr.name}</b>
    <span class="tip-lvl">síla ${tile.structure === "grandfort" ? 500 : tierOf(tile)}</span> · ${ownerTxt}`;
  if (!terr.passable) {
    html += `<div class="tip-row">Neprůchodný terén.</div>`;
  } else if (!isVisible(key)) {
    html += `<div class="tip-row">⚔ ? — pole není na dohled (poslední známý stav).</div>`;
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
      html += `<div class="tip-row">🔒 Příměří — otevře se za ${fmtTime(THRONE_UNLOCK - G.tick)}.</div>`;
    const tipLoot = tile.owner !== me.id ? structLootTxt(tile) : null;
    if (tipLoot) html += `<div class="tip-row">🎁 Kořist: ${tipLoot}</div>`;
  }
  tip.innerHTML = html;
}

// ---------- Smyčka vykreslování ----------
function frame() {
  draw();
  requestAnimationFrame(frame);
}

// ---------- Init ----------
window.addEventListener("DOMContentLoaded", () => {
  initRender($("#map"));
  bindMapControls();
  buildStartScreen();

  // zvuky: hra hlásí události, tady se rozhoduje, co je slyšet
  G.onEvent = (name, fid) => {
    const mine = fid === G.playerFaction;
    const global = fid === -1;
    const MAP = { battleWin: mine, battleLose: mine, levelup: mine, build: mine,
      loot: mine, starve: mine, goal: mine, pact: mine, offer: mine,
      mapEvent: global, storm: global, throne: global };
    if (MAP[name]) sfx.play(name);
  };
  // ukončení hry: první klik vyzve k potvrzení, druhý do 3 s hru ukončí
  const quitBtn = $("#btn-quit");
  let quitArmed = null;
  quitBtn.addEventListener("click", () => {
    if (!G.running) return;
    if (!quitArmed) {
      quitBtn.textContent = "Opravdu ukončit?";
      quitArmed = setTimeout(() => { quitArmed = null; quitBtn.textContent = "✕ Konec"; }, 3000);
      return;
    }
    clearTimeout(quitArmed); quitArmed = null;
    quitBtn.textContent = "✕ Konec";
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
  $("#rail-reports").addEventListener("click", openReportsWindow);
  $("#side-win-close").addEventListener("click", closeSideWin);
  document.querySelectorAll(".mf-btn").forEach(btn => btn.addEventListener("click", () => {
    mapFilter = btn.dataset.f || null;
    mapDrawnTick = -2; // překreslit statickou vrstvu s overlay filtrem
    document.querySelectorAll(".mf-btn").forEach(b =>
      b.classList.toggle("active", b === btn));
  }));
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
    if (pickFactionIdx === null || pickedHeroes.length !== 1) return;
    if (mp.ws && mp.ws.readyState === WebSocket.OPEN && !mp.active) {
      // v lobby síťové hry: výběr se jen ohlásí serveru, hru spouští tlačítko lobby
      mpSendPick(pickFactionIdx, [...pickedHeroes]);
      showFactionStep();
    } else {
      startGame(pickFactionIdx, [...pickedHeroes]);
    }
  });
  $("#btn-mp-join").addEventListener("click", () => {
    const name = $("#mp-name").value.trim() || "Bezejmenný";
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
