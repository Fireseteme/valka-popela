// DOMOVSKÁ SÍŇ (etapa 5b) — první obrazovka hry.
//
// Do v0.47 hráč přišel rovnou na výběr frakce s poznámkou „Všichni otevřou
// tuhle adresu v prohlížeči". To je psané pro partu u jednoho stolu; člověk,
// který přišel z odkazu, neví co drží v ruce. Domov to obrací: nepřihlášenému
// řekne, co Válka popela je, a nabídne účet; přihlášenému dá rozcestník na
// sezónu, výbavu a profil.
//
// Výběr frakce „hrát hned s přáteli" žije dál ve #start-overlay — domov ho
// nenahrazuje, jen ho schoval za tlačítko.
(function () {
  "use strict";
  const $ = s => document.querySelector(s);

  let sekce = "sezona";          // sezona | sin | vybava | profil
  let accRezim = "login";        // "login" | "reg" — přihlášení × zakládání síně
  let sinSide = null;            // strana, jejíž síň si prohlížím
  let odpocetTimer = null;
  let spojeni = "spojuji";      // spojuji | ok | pryc
  let frakceIdx = 0;            // který rod je ve slideru vepředu

  const rozvrhStav = () => (typeof mp !== "undefined" && mp.lobby && mp.lobby.rozvrh) || null;
  const ucet = () => (typeof acct !== "undefined" && acct.remote) || null;
  const bezi = () => (typeof mp !== "undefined" && mp.lobby && mp.lobby.phase === "running");

  // ---------- odpočet ----------
  // Sezóna startuje v pevný čas, takže odpočet musí být na vteřiny přesný
  // i po hodinách bez zprávy ze serveru — počítá se z absolutního termínu.
  function odpocetText(ms) {
    if (ms <= 0) return tx("dom.sezona.ted");
    const s = Math.floor(ms / 1000);
    const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600);
    const m = Math.floor(s % 3600 / 60), sec = s % 60;
    if (d > 0) return `${tx("doba.dni", { n: d })} ${h} h ${m} min`;
    if (h > 0) return `${h} h ${m} min ${sec} s`;
    if (m > 0) return `${m} min ${sec} s`;
    return `${sec} s`;
  }

  // testovací sezóna má 1 h, ostrá 336 — dělit natvrdo 24 by u té krátké
  // vypsalo „0 dní"
  function delkaText(h) {
    if (h >= 48) return tx("doba.dni", { n: Math.round(h / 24) });
    if (h >= 2) return tx("doba.hodin", { n: Math.round(h) });
    return tx("doba.minut", { n: Math.round(h * 60) });
  }

  // ⚠ Datum se formátuje podle JAZYKA HRÁČE, ne natvrdo česky — "středa 2. 9."
  // je pro anglického hráče stejně nečitelné jako by pro nás bylo "Wed, Sep 2".
  const LOCALE = { cs: "cs-CZ", en: "en-GB", es: "es-ES" };
  function terminText(startAt) {
    return new Date(startAt).toLocaleString(LOCALE[aktualniJazyk()] || "cs-CZ",
      { weekday: "long", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  // ---------- uvítání (nepřihlášený) ----------
  function uvitaniHtml() {
    // na uvítací stránce je zajímavější povaha rodu než jeho ekonomický bonus
    const rody = FACTION_DEFS.map(d => `<li style="--rod:${d.color}">
      <b>${d.name}</b>
      <span>${d.race}${d.ai && d.ai.mood ? " · " + d.ai.mood : ""}</span>
      <em>${d.desc || ""}</em></li>`).join("");
    const r = rozvrhStav();
    const kdy = r && r.faze === "zapisy"
      ? `<p class="dom-terminek">${tx("dom.sezona.blizi")} <b>${terminText(r.startAt)}</b> · ${r.prihlasenych}</p>`
      : bezi() ? `<p class="dom-terminek">${tx("dom.sezona.bezi")}</p>` : "";
    return `
      <section class="dom-hero">
        <h1>Válka popela</h1>
        <p class="dom-podtitul">${tx("dom.podtitul", { svet: "<b>" + SVET_JMENO + "</b>" })}</p>
        ${kdy}
      </section>

      <section class="dom-tri">
        <div><span class="dom-ico">🗺</span><h3>${tx("dom.pilir1.nadpis")}</h3>
          <p>${tx("dom.pilir1.text")}</p></div>
        <div><span class="dom-ico">⚑</span><h3>${tx("dom.pilir2.nadpis")}</h3>
          <p>${tx("dom.pilir2.text")}</p></div>
        <div><span class="dom-ico">⌛</span><h3>${tx("dom.pilir3.nadpis")}</h3>
          <p>${tx("dom.pilir3.text")}</p></div>
      </section>

      <section class="dom-rody">
        <h3>${tx("dom.rody")}</h3>
        <ul class="dom-rodlist">${rody}</ul>
      </section>

      <section class="dom-vstup">
        <h3>${tx("dom.zaloz")}</h3>
        <p class="hint">${tx("dom.zaloz.popis")}</p>
        <div id="dom-acc-form"></div>
        <p class="hint"><a href="#" id="dom-bez-uctu">${tx("dom.bezuctu")}</a></p>
      </section>`;
  }

  // ---------- sezóna ----------
  // Rody se vybírají SLIDEREM, ne holým seznamem: osm jmen s číslem
  // „0/30" hráči neřeklo nic o tom, za koho vlastně hraje. Jedna karta = jeden
  // rod se vším, co o něm potřebuje vědět, než se rozhodne na dva týdny dopředu.
  function slideFrakceHtml(d, i, r) {
    const kolik = (r.obsazenost && r.obsazenost[i]) || 0;
    const pct = Math.min(100, Math.round(kolik / r.mistNaFrakci * 100));
    const moje = r.mojeFrakce === i;
    const plno = kolik >= r.mistNaFrakci && !moje;
    const st = (typeof STARTER_IDX !== "undefined" && STARTER_IDX[d.key]) || 0;
    const hrdina = HERO_DEFS[d.key][st];
    const rys = (typeof HERO_TRAITS !== "undefined" && HERO_TRAITS[hrdina.trait]) || null;
    const sig = (typeof SIGNATURE_ITEMS !== "undefined" && SIGNATURE_ITEMS[d.key + ":" + st]) || null;
    const jed = (typeof FACTION_UNITS !== "undefined" && FACTION_UNITS[d.key]) || {};
    const jednotky = ["inf", "arch", "cav"].filter(k => jed[k])
      .map(k => `<li><span class="dom-jed-ico">${jed[k].icon}</span>${jed[k].name}</li>`).join("");
    return `<article class="dom-slide" style="--rod:${d.color}">
      <div class="dom-slide-hlava">
        <!-- generovaný portrét, ne velký render: rendery mají postavičku malou
             uprostřed prázdného rámu (768×768, figura zabírá ~30 % šířky) a osm
             z nich váží 1,6 MB. Portrét je kreslený JAKO portrét a nestojí bajt. -->
        <img class="dom-slide-portret" src="${heroPortraitURL(d.key, st)}" alt="">
        <div>
          <h3>${d.name}</h3>
          <p class="dom-slide-rasa">${d.race}${d.ai && d.ai.mood ? " · " + d.ai.mood : ""}</p>
          <p class="dom-slide-bonus">${d.desc || ""}</p>
        </div>
      </div>
      <dl class="dom-slide-fakta">
        <dt>⚑ ${tx("start.startovni.hrdina")}</dt>
        <dd>${hrdina.name}${rys ? ` <small>(${rys.name})</small>` : ""}</dd>
        ${sig ? `<dt>✦ Signature</dt><dd>${sig.name} <small>· ${tx("nah.sig.odemyka", { hvezd: SIG_STARS })}</small></dd>` : ""}
        <dt>⚔ ${tx("dom.jednotky")}</dt>
        <dd><ul class="dom-jednotky">${jednotky}</ul></dd>
      </dl>
      <div class="dom-slide-pata">
        <div class="dom-slide-mista">
          <span class="dom-frakce-bar"><i style="width:${pct}%"></i></span>
          <span class="dom-frakce-pocet">${tx("dom.prihlaseno", { ted: kolik, max: r.mistNaFrakci })}</span>
        </div>
        <button class="dom-slide-btn${moje ? " moje" : ""}" data-prihlas="${i}" ${plno ? "disabled" : ""}>${
          moje ? tx("dom.prihlaska.hrajes") : plno ? tx("dom.rod.plny") : tx("ucet.prihlasit")}</button>
      </div>
    </article>`;
  }

  function frakceSliderHtml(r) {
    if (frakceIdx >= FACTION_DEFS.length) frakceIdx = 0;
    // celá stopa se posune o jednu šířku okna — proto inline transform rovnou
    // v HTML: po překreslení (přijde nové lobby) slider nesmí skočit na první rod
    const slidy = FACTION_DEFS.map((d, i) => slideFrakceHtml(d, i, r)).join("");
    const zalozky = FACTION_DEFS.map((d, i) => {
      const kolik = (r.obsazenost && r.obsazenost[i]) || 0;
      const moje = r.mojeFrakce === i;
      return `<button class="dom-zalozka${i === frakceIdx ? " on" : ""}${moje ? " moje" : ""}"
        style="--rod:${d.color}" data-slide="${i}" title="${d.name}">
        <span class="dom-zalozka-jmeno">${d.name.split(" ")[0]}</span>
        <span class="dom-zalozka-pocet">${kolik}/${r.mistNaFrakci}</span>
      </button>`;
    }).join("");
    return `<div class="dom-slider">
        <button class="dom-sip vlevo" data-krok="-1" aria-label="${tx("dom.rod.predchozi")}">‹</button>
        <div class="dom-slider-okno">
          <div class="dom-slider-stopa" id="dom-stopa"
               style="transform: translateX(-${frakceIdx * 100}%)">${slidy}</div>
        </div>
        <button class="dom-sip vpravo" data-krok="1" aria-label="${tx("dom.rod.dalsi")}">›</button>
      </div>
      <div class="dom-zalozky">${zalozky}</div>`;
  }

  function sezonaHtml() {
    const r = rozvrhStav();
    if (!r) return spojeni === "pryc"
      ? `<section class="dom-karta"><h2>${tx("dom.server.mrtvy")}</h2>
          <p class="hint">${tx("dom.server.mrtvy.popis")}</p>
          <button id="dom-hrat-hned">${tx("dom.hrat.ai")}</button></section>`
      : `<p class="hint">${tx("dom.spojuji")}</p>`;

    // sezóna běží: buď do ní patřím a vracím se, nebo koukám zvenčí
    if (r.faze === "bezi" || bezi()) {
      // ⚠ Rozlišit OBOJE. Dřív se tu všem slibovalo „přihlas se a vrátíš se
      // rovnou do světa" — jenže kdo v seznamu účastníků není, toho server
      // tiše odmítne (posadDoSezony) a hráč zůstane viset bez vysvětlení.
      const patrim = mp && mp.lobby && mp.lobby.vSezone;
      return `<section class="dom-karta">
          <h2>${tx("dom.sezona.bezi", { n: r.cislo })}</h2>
          ${patrim
            ? `<p class="hint">${tx("dom.mesto.ceka")}</p>`
            : `<p class="hint"><b>${tx("dom.prihlaska.nejsi")}</b>${tx("dom.nedostanes")}</p>
               <p class="hint">${tx("dom.zapisy.pote")}</p>`}
        </section>
        ${pratelHtml()}`;
    }

    const doStartu = r.startAt - Date.now();
    const mam = r.mojeFrakce !== null && r.mojeFrakce !== undefined;
    return `
      <section class="dom-karta dom-odpocet">
        <h2>${tx("net.sezona", { n: r.cislo })}</h2>
        <div class="dom-cas" id="dom-cas">${odpocetText(doStartu)}</div>
        <p class="dom-termin">${terminText(r.startAt)} · ${tx("dom.delka", { doba: delkaText(r.delkaHodin) })}
          · ${tx("dom.prihlasenych", { n: r.prihlasenych })}</p>
      </section>

      <section class="dom-karta">
        <h2>${mam ? "Tvoje frakce" : "Vyber si rod"}</h2>
        <p class="hint">${mam
          ? tx("dom.prihlaska.zmena")
          : tx("dom.prihlaska.nadpis")}</p>
        ${frakceSliderHtml(r)}
        ${mam ? `<button class="dom-odhlas" id="dom-odhlas">${tx("dom.prihlaska.zrusit")}</button>` : ""}
        <p class="hint" id="dom-rozvrh-stav"></p>
      </section>
      ${pratelHtml()}`;
  }

  // ruční start zůstává — parta nechce čekat na termín
  function pratelHtml() {
    return `<section class="dom-karta dom-parta">
      <h3>${tx("dom.hrat.pratele")}</h3>
      <p class="hint">${tx("dom.hrat.pratele.text")}</p>
      <button id="dom-hrat-hned">Vybrat frakci a spustit</button>
    </section>`;
  }

  // ---------- výbava a profil ----------
  function sinDomovHtml() {
    const a = ucet();
    if (!a) return `<p class="hint">${tx("dom.sin.prihlas")}</p>`;
    // je-li hráč přihlášený do sezóny, otevři rovnou síň JEHO strany —
    // ptát se ho na stranu, kterou si už vybral, je zbytečný krok
    const r = rozvrhStav();
    if (sinSide === null && r && r.mojeFrakce != null && FACTION_DEFS[r.mojeFrakce])
      sinSide = sideOfFaction(FACTION_DEFS[r.mojeFrakce].key);
    if (sinSide === null) {
      return `<section class="dom-karta">
        <h2>${tx("hrd.sin")}</h2>
        <p class="hint">${tx("dom.sin.vyber", { a: SIDES.dobro.name, b: SIDES.zlo.name })}</p>
        <div class="dom-strany">
          <button class="dom-strana dobro" data-side="dobro"><b>✳ ${SIDES.dobro.name}</b>
            <span>${SIDES.dobro.desc}</span></button>
          <button class="dom-strana zlo" data-side="zlo"><b>🜂 ${SIDES.zlo.name}</b>
            <span>${SIDES.zlo.desc}</span></button>
        </div>
      </section>`;
    }
    // sinHtml chce ŽIVOU frakci; doma žádná není, tak jí podstrčíme prázdnou
    // skořápku — čte z ní jen key a heroes, zbytek bere z účtu
    const rod = FACTION_DEFS.find(d => sideOfFaction(d.key) === sinSide);
    const skorapka = { key: rod.key, heroes: [] };
    return `<section class="dom-karta">
      <div class="dom-karta-hlava">
        <h2>${tx("hrd.sin")}</h2>
        <button class="dom-zpet" id="dom-sin-zpet">← ${tx("dom.druha.strana")}</button>
      </div>
      ${sinHtml(skorapka)}
    </section>`;
  }

  function vybavaHtml() {
    if (!ucet()) return `<p class="hint">${tx("dom.vybava.prihlas")}</p>`;
    // truhly i sklad jsou tentýž panel se záložkami jako ve hře — ať se
    // hráč neučí dvakrát totéž
    return `<section class="dom-karta"><div id="dom-chests"></div></section>`;
  }
  function profilHtml() {
    const a = ucet();
    if (!a) return `<p class="hint">${tx("dom.profil.prihlas")}</p>`;
    const odemceno = Object.keys(a.heroUnlocks || {}).length;
    const celkem = FACTION_DEFS.reduce((n, d) => n + (HERO_DEFS[d.key] || []).length, 0);
    const hvezd = Object.values(a.heroStars || {}).reduce((n, x) => n + (x | 0), 0);
    const kusu = (a.invItems || []).length;
    const darku = Object.values(a.darky || {}).reduce((n, x) => n + (x | 0), 0);
    // E-mail: účty založené před v0.51 ho nemají a bez něj se nedají obnovit.
    // Proto ho jde přidat i dodatečně — nová adresa čeká na potvrzení a do té
    // doby se přístup k účtu NEMĚNÍ.
    // v0.58: uvítací jádra čekají na kliknutí do mailu — musí to být VIDĚT,
    // jinak hráč hlásí, že mu slíbená jádra nedorazila
    const jadraRadek = (a.jadraCekaji | 0)
      ? `<p class="dom-mail ceka">${tx("ucet.jadra.cekaji", { kolik: a.jadraCekaji })}</p>` : "";
    const mailRadek = a.emailCeka
      ? `<p class="dom-mail ceka">${tx("ucet.email.ceka", { email: a.emailCeka })}
          <a href="#" id="dom-mail-znovu">${tx("ucet.email.znovu")}</a></p>`
      : a.email
        ? `<p class="dom-mail ok">${tx("ucet.email.ok", { email: a.email })}
            <a href="#" id="dom-mail-zmena">${tx("ucet.email.zmenit")}</a></p>`
        : `<div class="dom-mail chybi">
            <p>⚠ <b>${tx("ucet.email.chybi")}</b> ${tx("ucet.email.chybi.text")}</p>
            <div class="dom-acc-row">
              <input id="dom-mail-novy" type="email" placeholder="${tx("ucet.email")}" maxlength="120" autocomplete="email">
              <button id="dom-mail-ulozit" class="hlavni">${tx("ucet.email.pridat")}</button>
            </div></div>`;
    return `<section class="dom-karta">
      <h2>${a.name}</h2>
      ${jadraRadek}
      ${mailRadek}
      <p class="hint" id="dom-mail-stav"></p>
      <div class="dom-staty">
        <div><b>${odemceno}</b><span>${tx("dom.z.hrdinu", { z: celkem })}</span></div>
        <div><b>${hvezd}</b><span>${tx("dom.hvezd")}</span></div>
        <div><b>${a.cores}</b><span>💠 ${tx("ucet.jader")}</span></div>
        <div><b>${kusu}</b><span>${tx("dom.kusu")}</span></div>
        <div><b>${darku}</b><span>${tx("dom.daru")}</span></div>
      </div>
      <p class="hint">${tx("dom.profil.historie")}</p>
    </section>`;
  }

  // ---------- složení obrazovky ----------
  const SEKCE = [
    ["sezona", tx("dom.tab.sezona")],
    ["sin", tx("dom.tab.sin")],
    ["vybava", tx("dom.tab.vybava")],
    ["profil", tx("dom.tab.profil")],
  ];

  function renderNav() {
    const nav = $("#home-nav");
    if (!nav) return;
    if (!ucet()) { nav.classList.add("hidden"); nav.innerHTML = ""; return; }
    nav.classList.remove("hidden");
    nav.innerHTML = SEKCE.map(([k, jm]) =>
      `<button class="dom-tab${sekce === k ? " on" : ""}" data-sekce="${k}">${jm}</button>`).join("");
  }

  function renderAcct() {
    const box = $("#home-acct");
    if (!box) return;
    const a = ucet();
    box.innerHTML = a
      ? `<span class="dom-jmeno">${a.name}</span>
         <span class="dom-jadra">💠 ${a.cores}</span>
         <button class="dom-odhlasit" id="dom-logout">${tx("ucet.odhlasit")}</button>`
      : "";
    const b = $("#dom-logout");
    if (b) b.addEventListener("click", () => {
      localStorage.removeItem("vp-acc-token");
      netSend({ type: "accLogout" });
      acct.remote = null;
      sekce = "sezona";
      renderDomov();
      // ⚠ Účet se zobrazuje na DVOU místech: tady na domově a v `#acc-box`
      // v lobby. Bez tohohle se překreslí jen domov a lobby dál ukazuje
      // odhlášený účet i s jádry — přihlášení to dělá správně (net.js volá
      // obojí), odhlášení to dřív nedělalo.
      if (typeof renderAccBox === "function") renderAccBox();
      if (typeof updatePanels === "function") updatePanels();
    });
  }

  // ETAPA 12b: přepínač jazyka. Vlajky, ne rozbalovací seznam — nepřihlášený
  // návštěvník musí poznat svůj jazyk dřív, než umí přečíst cokoli ostatního.
  function jazykPrepinacHtml() {
    return `<div class="dom-jazyky" title="${tx("ucet.jazyk")}">` + JAZYKY_SEZNAM.map(x =>
      `<button class="dom-jaz${aktualniJazyk() === x.kod ? " active" : ""}"
        data-jaz="${x.kod}" title="${x.jmeno}">${x.vlajka}</button>`).join("") + `</div>`;
  }
  function bindJazyk(root) {
    root.querySelectorAll("[data-jaz]").forEach(b => b.addEventListener("click", () => {
      if (!nastavJazyk(b.dataset.jaz)) return;
      // přihlášenému se jazyk uloží na ÚČET, ať ho má i z jiného zařízení
      if (ucet() && typeof netSend === "function") netSend({ type: "nastavJazyk", jazyk: b.dataset.jaz });
      prekresliJazyk();
    }));
  }
  // překreslí všechno, co je zrovna vidět — po přepnutí jazyka
  function prekresliJazyk() {
    renderDomov();
    if (typeof updatePanels === "function" && typeof G !== "undefined" && G.running) {
      try { updatePanels(); } catch (e) {}
    }
    // nabídka filtrů mapy se skládá v main.js — přeložit ji musí taky
    if (typeof prekresliFiltrMapy === "function") { try { prekresliFiltrMapy(); } catch (e) {} }
  }
  window.prekresliJazyk = prekresliJazyk;

  function renderDomov() {
    const body = $("#home-body");
    if (!body) return;
    renderNav();
    renderAcct();
    if (!ucet()) { body.innerHTML = jazykPrepinacHtml() + uvitaniHtml(); bindUvitani(body); bindJazyk(body); return; }
    body.innerHTML = sekce === "sezona" ? sezonaHtml()
      : sekce === "sin" ? sinDomovHtml()
      : sekce === "vybava" ? vybavaHtml()
      : profilHtml() + jazykPrepinacHtml();
    bindDomov(body);
    bindJazyk(body);
  }

  function bindUvitani(root) {
    // přihlašovací rámeček je tentýž jako v lobby — ať se nedvojí logika
    const form = root.querySelector("#dom-acc-form");
    if (form) {
      // PŘIHLÁŠENÍ A ZALOŽENÍ JSOU DVĚ OBRAZOVKY (zadání uživatele 30. 8. 2026).
      // Kdo se vrací, chce jen jméno a heslo; e-mail patří k zakládání síně,
      // kde je povinný (v0.51) — bez něj se nedá obnovit heslo a s ním sbírka.
      const reg = accRezim === "reg";
      form.innerHTML = `<div class="dom-acc-prep">
          <button class="dom-acc-tab${reg ? "" : " on"}" data-rezim="login">${tx("ucet.prihlasit")}</button>
          <button class="dom-acc-tab${reg ? " on" : ""}" data-rezim="reg">${tx("ucet.zalozit")}</button>
        </div>
        <div class="dom-acc-row">
          <input id="dom-acc-name" placeholder="${tx("ucet.jmeno")}" maxlength="20" autocomplete="username">
          <input id="dom-acc-pass" type="password" placeholder="Heslo" maxlength="40"
            autocomplete="${reg ? "new-password" : "current-password"}">
        </div>
        ${reg ? `<div class="dom-acc-row">
          <input id="dom-acc-mail" type="email" placeholder="${tx("ucet.email.popis")}" maxlength="120" autocomplete="email">
        </div>` : ""}
        <div class="dom-acc-row">
          <button id="dom-acc-go" class="hlavni">${reg ? tx("ucet.zalozit") : tx("ucet.prihlasit")}</button>
        </div>
        <p class="hint" id="dom-acc-stav"></p>
        ${reg ? "" : `<p class="hint"><a href="#" id="dom-zapomenute">${tx("ucet.zapomenute")}</a></p>`}`;
      const stav = t => { const e = $("#dom-acc-stav"); if (e) e.textContent = t; };
      const go = () => {
        const name = $("#dom-acc-name").value, pass = $("#dom-acc-pass").value;
        if (!name.trim() || !pass) { stav(tx("ucet.chyba.pole")); return; }
        const email = reg ? $("#dom-acc-mail").value.trim() : "";
        if (reg && !email) {
          stav(tx("ucet.email.proc"));
          return;
        }
        netSend({ type: reg ? "accRegister" : "accLogin", name, pass, email });
      };
      $("#dom-acc-go").addEventListener("click", go);
      for (const id of ["#dom-acc-name", "#dom-acc-pass", "#dom-acc-mail"]) {
        const el = $(id);
        if (el) el.addEventListener("keydown", e => { if (e.key === "Enter") go(); });
      }
      for (const b of form.querySelectorAll(".dom-acc-tab"))
        b.addEventListener("click", () => { accRezim = b.dataset.rezim; renderDomov(); });
      const zap = $("#dom-zapomenute");
      if (zap) zap.addEventListener("click", e => {
        e.preventDefault();
        const kdo = $("#dom-acc-name").value.trim();
        if (!kdo) { stav(tx("ucet.chyba.jmeno")); return; }
        netSend({ type: "zapomenuteHeslo", kdo });
      });
    }
    const bez = root.querySelector("#dom-bez-uctu");
    if (bez) bez.addEventListener("click", e => { e.preventDefault(); hratHned(); });
  }

  function naSlide(i) {
    const n = FACTION_DEFS.length;
    const stary = frakceIdx;
    frakceIdx = ((i % n) + n) % n;   // dokola: za posledním rodem je zase první
    const stopa = $("#dom-stopa");
    if (stopa) {
      // Plynule se posouvá jen o SOUSEDNÍ kartu. Skok z prvního rodu na poslední
      // (přetočení dokola nebo klik na vzdálenou záložku) by jinak prosvištěl
      // přes všech osm karet — přeskočí se tedy natvrdo.
      const skok = Math.abs(frakceIdx - stary) > 1;
      if (skok) stopa.classList.remove("plyne");
      stopa.style.transform = `translateX(-${frakceIdx * 100}%)`;
      // vynucený přepočet: bez něj prohlížeč sloučí odebrání třídy a nový
      // posun do jedné změny a přeskok se stejně animuje. requestAnimationFrame
      // sem NEPATŘÍ — ve skryté záložce neběží a přejezd by zůstal vypnutý.
      if (skok) { void stopa.offsetWidth; stopa.classList.add("plyne"); }
    }
    document.querySelectorAll(".dom-zalozka").forEach((b, j) =>
      b.classList.toggle("on", j === frakceIdx));
  }

  function bindSlider(root) {
    root.querySelectorAll("[data-krok]").forEach(b =>
      b.addEventListener("click", () => naSlide(frakceIdx + (+b.dataset.krok))));
    root.querySelectorAll("[data-slide]").forEach(b =>
      b.addEventListener("click", () => naSlide(+b.dataset.slide)));
    // přejetí prstem — na mobilu je šipka u kraje špatně dosažitelná
    const okno = root.querySelector(".dom-slider-okno");
    if (okno) {
      let x0 = null;
      okno.addEventListener("pointerdown", e => { x0 = e.clientX; });
      okno.addEventListener("pointerup", e => {
        if (x0 === null) return;
        const dx = e.clientX - x0;
        x0 = null;
        if (Math.abs(dx) > 45) naSlide(frakceIdx + (dx < 0 ? 1 : -1));
      });
      okno.addEventListener("pointercancel", () => { x0 = null; });
    }
    // Stopa se kreslí rovnou na správném místě (inline transform v HTML) —
    // přejezd se zapíná až po vynuceném přepočtu, jinak by při každém
    // překreslení lobby ujela zleva doprava.
    const stopa = root.querySelector("#dom-stopa");
    if (stopa) { void stopa.offsetWidth; stopa.classList.add("plyne"); }
  }

  function bindDomov(root) {
    bindSlider(root);
    root.querySelectorAll("[data-prihlas]").forEach(b => b.addEventListener("click", () => {
      netSend({ type: "prihlas", faction: +b.dataset.prihlas });
    }));
    const od = root.querySelector("#dom-odhlas");
    if (od) od.addEventListener("click", () => netSend({ type: "odhlas" }));
    const hned = root.querySelector("#dom-hrat-hned");
    if (hned) hned.addEventListener("click", hratHned);
    root.querySelectorAll("[data-side]").forEach(b => b.addEventListener("click", () => {
      sinSide = b.dataset.side; renderDomov();
    }));
    // e-mail v Profilu
    const stavM = t => { const e = $("#dom-mail-stav"); if (e) e.textContent = t; };
    const ulozit = root.querySelector("#dom-mail-ulozit");
    if (ulozit) ulozit.addEventListener("click", () => {
      const v = $("#dom-mail-novy").value.trim();
      if (!v) { stavM(tx("ucet.chyba.email")); return; }
      netSend({ type: "nastavEmail", email: v });
    });
    const zmena = root.querySelector("#dom-mail-zmena");
    if (zmena) zmena.addEventListener("click", e => {
      e.preventDefault();
      const v = prompt(tx("ucet.email.nova"));
      if (v && v.trim()) netSend({ type: "nastavEmail", email: v.trim() });
    });
    const znovu = root.querySelector("#dom-mail-znovu");
    if (znovu) znovu.addEventListener("click", e => {
      e.preventDefault();
      netSend({ type: "nastavEmail", email: (ucet() || {}).emailCeka });
    });
    const zpet = root.querySelector("#dom-sin-zpet");
    if (zpet) zpet.addEventListener("click", () => { sinSide = null; renderDomov(); });
    // Síň doma je jen k PROHLÍŽENÍ a k seznamu přání: „Nasadit" míří na živou
    // frakci (deployHero(player())), a ta mimo běžící sezónu neexistuje.
    if (sekce === "sin") {
      root.querySelectorAll(".btn-deploy").forEach(b => b.remove());
      // náhled hrdiny (31. 8. 2026): funguje i doma, kde je síň hlavně katalog
      if (typeof bindSinNahled === "function") bindSinNahled(root, renderDomov);
      root.querySelectorAll(".sin-wish").forEach(b => b.addEventListener("click", () => {
        // doma je účet vždy na serveru (mp.active je false, spojení ale stojí)
        if (typeof mpWishlist === "function") mpWishlist(b.dataset.key);
      }));
    }
    if (sekce === "vybava" && typeof updateChestsPanel === "function") updateChestsPanel(true);
    if (typeof bindDarky === "function") bindDarky(root);
    spustOdpocet();
  }

  function spustOdpocet() {
    clearInterval(odpocetTimer);
    const el = $("#dom-cas");
    if (!el) return;
    const r = rozvrhStav();
    if (!r) return;
    odpocetTimer = setInterval(() => {
      const e = $("#dom-cas");
      if (!e) { clearInterval(odpocetTimer); return; }
      e.textContent = odpocetText(r.startAt - Date.now());
    }, 1000);
  }

  // ---------- přepínání obrazovek ----------
  function hratHned() {
    $("#home-overlay").classList.add("hidden");
    $("#start-overlay").classList.remove("hidden");
  }
  function zpetDomu() {
    $("#start-overlay").classList.add("hidden");
    $("#home-overlay").classList.remove("hidden");
    renderDomov();
  }
  function skryjDomov() { $("#home-overlay").classList.add("hidden"); }

  document.addEventListener("DOMContentLoaded", () => {
    $("#home-overlay").addEventListener("click", e => {
      const t = e.target.closest("[data-sekce]");
      if (!t) return;
      sekce = t.dataset.sekce;
      renderDomov();
    });
    // šipky na klávesnici. Posluchač visí na dokumentu a zakládá se JEDNOU —
    // domov se překresluje často a v bindSlider by se posluchače vrstvily.
    document.addEventListener("keydown", e => {
      if (sekce !== "sezona" || !$("#dom-stopa")) return;
      if ($("#home-overlay").classList.contains("hidden")) return;
      const t = e.target;
      if (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName)) return;
      if (e.key === "ArrowRight") { naSlide(frakceIdx + 1); e.preventDefault(); }
      else if (e.key === "ArrowLeft") { naSlide(frakceIdx - 1); e.preventDefault(); }
    });
    const dom = $("#btn-domu");
    if (dom) dom.addEventListener("click", e => { e.preventDefault(); zpetDomu(); });
    renderDomov();
    // Domov se připojuje SÁM — bez spojení nemá co ukázat (odpočet,
    // obsazenost, přihláška). Jméno je jen do lobby, účet ho přebije.
    if (location.protocol !== "file:" && typeof mpConnect === "function") {
      const jmeno = localStorage.getItem("vp-mp-name") || "Host";
      try { mpConnect(jmeno); } catch (e) { spojeni = "pryc"; renderDomov(); }
    } else { spojeni = "pryc"; }
  });

  window.domovSpojeni = stav => { spojeni = stav; renderDomov(); };
  window.renderDomov = renderDomov;
  window.domovZpet = zpetDomu;
  window.domovSkryj = skryjDomov;
  // hlášky k účtu (čekání na potvrzení, odeslaný odkaz) patří pod formulář
  window.domovStavUctu = (text, akce) => {
    const m = $("#dom-mail-stav");   // v Profilu má vlastní řádek
    if (m) { m.textContent = text; return; }
    const e = $("#dom-acc-stav");
    if (!e) return;
    e.textContent = text;
    if (!akce) return;
    const a = document.createElement("a");
    a.href = "#"; a.textContent = " Poslat odkaz znovu";
    a.addEventListener("click", ev => {
      ev.preventDefault();
      const kdo = ($("#dom-acc-name") && $("#dom-acc-name").value.trim())
        || ($("#dom-acc-mail") && $("#dom-acc-mail").value.trim());
      if (kdo) netSend({ type: "posliOvereni", kdo });
    });
    e.appendChild(a);
  };

  window.domovChybaRozvrhu = text => {
    const el = $("#dom-rozvrh-stav");
    if (el) el.textContent = text;
  };
})();
