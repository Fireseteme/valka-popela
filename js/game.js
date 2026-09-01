"use strict";
/* Válka popela v0.2 — herní logika (mapa, frakce, budovy, jednotky, boj, AI) */

// ---------- RNG (deterministický, aby šla mapa reprodukovat) ----------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
let rng = mulberry32(Date.now() % 100000);
const rand = (a, b) => a + rng() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));

// ---------- Konstanty ----------
// Mapa je ČTVERCOVÁ MŘÍŽKA (od v0.21): svět = čtverec (2·MAP_R+1)² polí,
// na obrazovce otočený o 45° — velký diamant jako v předloze. Sousedé jsou 4
// (hranou), vzdálenosti Manhattan. Hlavní města sedí uprostřed čtyř hran
// čtverce (na obrazovce rohy diamantu), osy q/r jsou spojnice k trůnu.
// v0.23: OSM frakcí — svět dělí 8 řek (4 osové + 4 úhlopříčné) na 8 výsečí,
// každý segment včetně středových je proti v0.21 DVOJNÁSOBNÝ.
// v0.33: velikost světa je KNOB (node server/server.js 8123 336 51) — všechna
// geometrie se odvozuje ze MAP_R přes setMapRadius; výchozí hodnoty odpovídají
// odvození pro 34 na chlup (byte-identická mapa, hlídá tests/test-mapr.js)
let MAP_R = 34;   // Čebyševův poloměr — 69×69 = 4761 polí
let WALL_R = 8;   // vnitřní hradby středové oblasti (Manhattan prstenec kolem trůnu)
let OUTER_R = 16; // vnější prstenec opevnění — prostupný jen přes velké pevnosti
// pásma stupňů polí (levelForDist) a limity měst — přepočítává setMapRadius
let PASMO_BLIZKE = 20, PASMO_STREDNI = 24, PASMO_DALEKE = 27, PASMO_MEST = 28;
let POCET_MEST = 20, MEST_GUARD = 6000, BRODU_MAX = 12;
const TICK_MS = 1000;
// CÍLOVÁ DÉLKA SEZÓNY = 14 DNÍ (336 h, 1 209 600 tiků) — od 31. 8. 2026 je to
// VÝCHOZÍ hodnota, ne volitelný argument. Do té doby byla výchozí jedna hodina
// (testovací režim) a všechna čísla se ladila proti ní, což zkreslovalo dojem:
// doby stavby se sezónou škálují, ceny ne.
// Krátkou sezónu si vyžádej výslovně: node server/server.js 8123 1
// Vše odvozené (otevření Trůnu, doba držení, tempo Prstenu a bodů činu, doby
// stavby i výcviku) se škáluje ze SEASON_TICKS, takže rytmus zůstává poměrově
// stejný, ať sezóna trvá hodinu nebo dva týdny.
const SEZONA_BASELINE_H = 336;
let SEASON_TICKS = SEZONA_BASELINE_H * 3600;
function setSeasonHours(h) {
  SEASON_TICKS = Math.max(600, Math.round((parseFloat(h) || SEZONA_BASELINE_H) * 3600));
  THRONE_UNLOCK = SEASON_TICKS / 2;
}
function seasonTicks() { return SEASON_TICKS; }

// Přepočet celé geometrie světa z nového poloměru. Odvození jsou volená tak,
// aby při r=34 vyšla PŘESNĚ dnešní čísla (pasti: WALL_R musí být floor —
// round by dal 9; OUTER_R NENÍ MAP_R/2 = 17; osové mosty stojí na 24, ne na
// úrovni kapitálů 23). Ochranná aserce dole to hlídá napořád.
function setMapRadius(r) {
  r = Math.max(17, Math.round(parseFloat(r) || 34));
  MAP_R = r;
  WALL_R = Math.floor(MAP_R / 4);
  OUTER_R = 2 * WALL_R;
  const kapM = 2 * OUTER_R;          // Manhattan kapitálů (34 → 32)
  const c = WALL_R + 1;              // menší souřadnice kapitálu (34 → 9)
  CAPITAL_POS = stavKapitaly(kapM, c);
  BRIDGE_KEYS = stavMosty();
  const dKap = kapM - c / 2;         // distLvl kapitálu (34 → 27,5)
  PASMO_BLIZKE = Math.round(OUTER_R + (dKap - OUTER_R) / 3);      // 20
  PASMO_STREDNI = Math.round(OUTER_R + 2 * (dKap - OUTER_R) / 3); // 24
  PASMO_DALEKE = Math.floor(dKap);   // 27
  PASMO_MEST = Math.ceil(dKap);      // 28
  // AKČNÍ RÁDIUS SE PŘESTAL ROZTAHOVAT S MAPOU (etapa 11). Odvození
  // 5·OUTER_R/4 vzniklo, když frakce = jeden hráč: tehdy dávalo smysl, že na
  // větším světě dosáhne dál. Na MMO měřítku je ale svět větší proto, že je
  // v něm VÍC HRÁČŮ — každý pořád drží nejvýš 216 polí. Bez stropu by hrdina
  // na 461×461 operoval 143 polí od základny a AOI by muselo posílat pětinu
  // mapy. Na 69×69 vychází pořád 20, takže se statistická brána nehne.
  REACH = Math.min(REACH_MAX, Math.round(5 * OUTER_R / 4));
  const plocha = ((2 * MAP_R + 1) / 69) ** 2; // poměr ploch k výchozí mapě
  POCET_MEST = Math.round(20 * plocha);
  MEST_GUARD = Math.round(6000 * plocha);
  BRODU_MAX = Math.max(12, Math.round(12 * MAP_R / 34));
  EVENT_MAX = Math.max(3, Math.round(3 * plocha));
  if (r === 34 && (WALL_R !== 8 || OUTER_R !== 16 || REACH !== 20
      || PASMO_BLIZKE !== 20 || PASMO_STREDNI !== 24 || PASMO_DALEKE !== 27
      || PASMO_MEST !== 28 || CAPITAL_POS[0].q !== 23 || CAPITAL_POS[0].r !== 9
      // v0.53: úhlopříčné přechody se posunuly do expanzního pásu (z (17,15)
      // na (14,12)); osové zůstaly na q = 24, ty v kolébce nebyly
      || !BRIDGE_KEYS.includes(keyOf(24, -2)) || !BRIDGE_KEYS.includes(keyOf(24, 2))
      || !BRIDGE_KEYS.includes(keyOf(14, 12))))
    throw new Error("setMapRadius(34) nedává výchozí geometrii — odvození se rozbilo");
  // Node: primitivy v module.exports jsou kopie z doby načtení — přepsat
  if (typeof module !== "undefined" && module.exports && module.exports.G)
    Object.assign(module.exports, { MAP_R, WALL_R, OUTER_R, REACH, CAPITAL_POS, BRIDGE_KEYS });
}
const MARCH_TICKS = 15;     // přesun o jedno pole = 15 s
const REINFORCE_TICKS = MARCH_TICKS / 2; // posily jdou nalehko — 7,5 s/pole
const GUARD_COST = 15;          // výdrž za aktivaci stráže
const GUARD_DRAIN = 1;          // výdrž/s při držené stráži (a nic se neobnovuje)
// síla jednotek snížena na 1: obrana pole ≈ počet jednotek, které ji udrží
const SOLDIER_POWER = 1;

// --- stupně polí ---
// pole se dělí na 12 druhů podle "síly" (jmenovka druhu, viz TIERS);
// posádka (kolik jednotek je potřeba) roste strměji než jmenovka
const TIERS         = [1, 10, 15, 30, 60, 90, 130, 150, 200, 230, 260, 300];
const TIER_GARRISON = [17, 56, 167, 306, 473, 667, 890, 1140, 1418, 1724, 2058, 2419];
const TIER_YIELD    = [0.4, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9, 2.5]; // surovin/s
const TIER_SCORE    = [1, 1, 2, 3, 6, 9, 13, 15, 20, 23, 26, 30]; // body do síly království
const tierOf = t => TIERS[t.level - 1];
const tierScore = t => TIER_SCORE[t.level - 1];
// Jméno světa je vlastní IP — do vět se DOSAZUJE, nepřekládá se (etapa 12b)
const SVET_JMENO = "Vellar";
// suroviny se střídají ob úroveň: sudé stupně (10, 30, 90…) jídlo NEBO železo,
// liché (15, 60, 130…) kámen NEBO dřevo; stupeň 1 dává trochu od všeho.
// Od v0.30 mají pole síly 300 (uzly 2×2) KONKRÉTNÍ surovinu dle žíly —
// objem „od všeho" jim vrací ×4 v tileYield
const RES_KEYS = ["food", "wood", "stone", "iron"];
const OUTPOST_CAP = 11123;       // nejvyšší posádka výspy
const OUTPOST_COST = { stone: 300, wood: 100, gold: 150 };
const COUNTER_BONUS = 0.3;      // bonus poškození proti typu, proti kterému je jednotka silná
// boj probíhá v kolech: každá strana sčítá životy svých jednotek do jednoho
// fondu a každé kolo udělí poškození podle statů; rozdíl útoku a obrany stran
// posouvá udělené poškození o 5 % za bod, rychlost hrdiny určuje, kdo v kole
// udeří první (pomalejší strana oplácí už jen s přeživšími)
const ATKDEF_STEP = 0.05;       // ±5 % poškození za bod rozdílu útok−obrana
const MILITIA_SPEED = 4;        // rychlost strany bez hrdiny
const HERO_DMG_SHARE = 0.0054;    // podíl poškození skupiny, který schytá hrdina
const MAX_ROUNDS = 8;           // (historické; boj po formacích jede na ROUND_CAP)
// ---- boj po formacích (v0.19) ----
const ROUND_CAP = 10;           // strop kol; pak je útok odražen (remíza)
const LOSS_DEAD = 0.6;          // podíl padlých ze ztrát (zbytek jsou ranění)
// armáda se nebije do posledního muže: když klesne pod tenhle podíl původního
// stavu, zlomí se a odtáhne. Díky tomu z bitvy odchází i poražený s vojskem —
// útočník se může po chvíli vrátit a pole ubourat dalším náběhem.
const ROUT_AT = 0.25;
// tempo bitvy: dělí VŠECHNO poškození stejně, takže neurčuje, kdo vyhraje,
// jen jak dlouho se bijí. Bez toho by bitva skončila za dvě kola a kolové
// dovednosti („každé 3. kolo") by se nikdy nespustily.
const DMG_PACE = 2.5;
// velitel má být plnohodnotný kanál poškození, ne přípočet k jednotkám —
// jeho dmg je „na hrdinu", jednotky bijí po stovkách, proto se násobí
const HERO_DMG_SCALE = 33;
const ROUT_LOSS = 0.25;         // dodatečné ztráty při ústupu z prohraného útoku
const WOUNDED_COOLDOWN = 60;    // zotavení hrdiny, jehož armáda byla zničena
// ETAPA 6: dávka roste s měřítkem velení (armády 5,56×), aby výroba
// stíhala. Cena dávky zůstala — cena za KUS tím klesla přesně 5,56×.
const RECRUIT_BATCH = 56;
const STAMINA_MAX = 100;
const STAMINA_REGEN = 0.5;
const DEFEAT_COOLDOWN = 30;     // s nepoužitelnosti po porážce
// ---- obléhání: odražený hrdina zůstává u pole a zkusí to znovu ----
// Po odraženém útoku hrdina neutíká domů — utáboří se a po SIEGE_RETRY
// sekundách udeří znovu s tím, co mu zbylo. Silná pole se tak lámou na víc
// náběhů a hráč mezitím může poslat posily. (V předloze 5 minut; naše sezóna
// trvá hodinu, tak je pauza kratší.)
const SIEGE_RETRY = 25;         // s do dalšího náběhu
const SIEGE_MIN_ARMY = 67;      // pod tolik jednotek se obléhání vzdává
const SIEGE_MAX_TRIES = 5;      // kolik náběhů za sebou hrdina zkusí
// ---- akční rádius základen (v0.29) ----
// Kapitál a výspy promítají kruh dosahu (Manhattan). Hrdina smí ÚTOČIT jen
// v dosahu své domovské základny; přesuny na vlastní pole, návraty a posily
// omezené nejsou. Usazení na výspě je výslovná akce (heroSettle); návrat
// domů základnu vrací pod kapitál.
let REACH = 20;                    // Manhattan dosah základny (přepočítává setMapRadius)
const REACH_MAX = 40;              // strop dosahu na velkých mapách (etapa 11)
const BRIDGE_BOTH_ENDS = false;    // most „vodí" sousedství jen s oběma břehy (feature flag)
// ---- obléhací okna velkých staveb (v0.29) ----
// Velké stavby (pevnost/velká pevnost/kapitál/Trůn) mají ODOLNOST. Pobití
// posádky stavbu NEzabírá — otevře obléhací okno; v něm útočník náběhy boří
// odolnost BEZ vlastních ztrát (kapitál a Trůn pasivně ostřelují). Promeškané
// okno = stavba se obnoví i s posádkou. Běžná pole beze změny — kotvy křivky
// dobývání se nehýbou.
const SIEGE_HP = { fortress: 7786, grandfort: 13348, capital: 17797, throne: 25027 };
const SIEGE_WINDOW_FRAC = 0.0007;  // délka okna v podílu sezóny (RtW ~1 h z 60 dnů)
const SIEGE_WINDOW_MIN = 90;       // podlaha okna v ticích (sólo hodina je krátká)
const DEMOLISH_PER_CP = 1.0;       // bourací poškození za bod velení armády
const CAPITAL_FIRE = 0.015;        // kapitál/Trůn: podíl armády sestřelený za náběh bourání
const WAR_SIEGE_PENALTY = 0.7;     // −70 % bourání v cizím DRŽENÉM kraji bez vyhlášené války
function siegeWindowTicks() {
  return Math.max(SIEGE_WINDOW_MIN, Math.round(SEASON_TICKS * SIEGE_WINDOW_FRAC));
}
const jeVelkaStavba = t => !!(t && t.structure && SIEGE_HP[t.structure]);
// ---- surovinové uzly 2×2 (v0.30) ----
// Pole síly 200+ jsou VŽDY bloky 2×2 („uzly") s konkrétní surovinou a žílou
// menších polí stejné suroviny okolo. Neutrální uzel brání DVĚ armády po
// polovině posádky — obě je nutné porazit na jeden zátah; odražený zátah
// obě armády plně obnoví a uzel se na čas uzavře.
const UZEL_CD_TICKS = 900;         // uzavření uzlu po odraženém zátahu (15 min, knob)

// ---------- OKNO ZRANĚNÍ (IV-C, etapa 7) ----------
// Od PRVNÍHO útoku se poškození neutrální posádky přestane hojit a postup se
// SČÍTÁ napříč útočníky; po vypršení okna se pole vrátí do plné síly. Dřív se
// odražený zátah na uzel nebo most vracel do plné síly OKAMŽITĚ, takže velký
// cíl se nedal rozebrat po částech — a přesně to je celá raid smyčka: skupina
// hráčů ho ubourává, dokud okno běží.
// POZOR na jméno: „t.okno" je něco JINÉHO — obléhací okno velkých staveb
// z etapy 3 (posádka pobita → smí se bourat odolnost). Tohle je „t.zran".
const ZRAN_TICKS = 900;            // běžná pole: 15 minut
const ZRAN_TICKS_CIL = 3600;       // uzly, mosty, keepy, grandforty: 60 minut
function zranDelka(t) { return (t.structure || t.bigSize === 2) ? ZRAN_TICKS_CIL : ZRAN_TICKS; }
// otevře okno při prvním zásahu; další útočníci ho jen využívají, neprodlužují
function zranOtevri(t) { if (t && t.owner === -1 && !(t.zran > 0)) { t.zran = zranDelka(t); ozivPole(t); } }
// ubere posádce, co v boji padlo (SOLDIER_POWER = 1, takže kus = bod posádky)
function zranUber(t, padlo) {
  if (!t) return;
  t.garrison = Math.max(0, t.garrison - Math.max(0, padlo) * SOLDIER_POWER);
  ozivPole(t);
}

// ---------- ŽIVÁ POLE (etapa 11b) ----------
// `tickWorld` procházel KAŽDOU VTEŘINU celý svět, aby odtikal hrstku odpočtů
// a dorovnal pobité posádky. Na mapě 1459×1459 to bylo 80 ze 142 ms tiku,
// přestože pozornost potřebuje řádově pár set polí: naprostá většina světa
// je neutrální divočina s plnou posádkou, kde se nikdy nic nemění.
//
// Pole se do evidence zapíše, když se mu něco stane (ztráty v boji, okno
// zranění, uzávěra uzlu, obléhací okno, vyklízení), a vypadne z ní, jakmile
// je zase v klidu.
//
// ⚠ Evidence se jednou za ZIVE_OBNOVA tiků postaví ZNOVU průchodem mapy.
// Je to pojistka, ne optimalizace: kdyby se někde na `ozivPole` zapomnělo,
// pole se rozjede nejpozději za pět minut, místo aby zůstalo pobité navždy.
// Amortizovaně to stojí jeden průchod z tří set.
const ZIVE_OBNOVA = 300;
// Jedno místo pro „tomuhle poli se něco stalo".
// Sype do DVOU evidencí, protože obě mají jiného čtenáře a jiný životní cyklus:
//  · G.zive    — tik: pole potřebuje odpočet nebo dorůst posádky. Vypadne,
//                jakmile je zase v klidu (potrebujePozornost).
//  · G.dotcene — server: pole se mohlo změnit, prověř mu otisk. Vyprazdňuje se
//                po každém sestavení delty pro klienty.
// Obě jsou jen ZRYCHLENÍ, ne pravda: G.zive se přestaví jednou za pět minut
// a otisky prochází valivá kontrola, takže zapomenuté zavolání ničemu nevadí.
function ozivPole(t) {
  if (!t) return;
  const k = keyOf(t.q, t.r);
  if (G.zive) G.zive.add(k);
  if (G.dotcene) G.dotcene.add(k);
}
// plná posádka pole (uzel 2×2 brání dvojnásobek — dvě armády na jeden zátah)
function plnaPosadka(t) {
  return (t.structure ? struktMilice(t) : LEVEL_GARRISON[t.level]) * (t.bigSize === 2 ? 2 : 1);
}
function potrebujePozornost(t) {
  if (t.uzelCd > 0 || t.abandon > 0 || t.okno > 0 || t.zran > 0) return true;
  if (t.owner !== -1 || t.big || !TERRAIN[t.terrain].passable) return false;
  return t.garrison < plnaPosadka(t);
}
// jeden tik jednoho pole — dřív tělo smyčky přes celý svět
function tikniPole(t) {
  if (t.uzelCd > 0 && --t.uzelCd <= 0) delete t.uzelCd; // uzel se zas otevírá
  // vyklízení pole (v0.39): po odpočtu připadne pole zpět divočině
  if (t.abandon > 0 && --t.abandon <= 0) { finishAbandon(t); return; }
  if (t.okno > 0) {
    if (--t.okno <= 0) {
      delete t.okno;
      delete t.odol; // odolnost se s obnovou vrací na plnou
      if (t.owner === -1 && t.structure) t.garrison = struktMilice(t);
      addLog(-1, { klic: "kron.okno.promeskano", param: { pole: tileKlic(t), kraj: regionOf(t) } });
    }
    return; // pobitá posádka během okna nedorůstá
  }
  if (t.owner !== -1 || !TERRAIN[t.terrain].passable) return;
  // členové bloků posádku nemají (boj jde vždy přes kotvu)
  if (t.big) return;
  const base = plnaPosadka(t);
  // OKNO ZRANĚNÍ: dokud běží, posádka NEDORŮSTÁ (postup se sčítá napříč
  // útočníky); jakmile vyprší, vrací se rovnou do plné síly
  if (t.zran > 0) {
    if (--t.zran <= 0) { delete t.zran; t.garrison = base; }
    return;
  }
  if (t.garrison < base)
    t.garrison = Math.min(base, t.garrison + base / GARRISON_REGEN_TICKS);
}
// ---------- EVIDENCE VÝSP (etapa 11b) ----------
// Výspa je jediná stavba, kterou hráči a AI staví a boří za běhu, a zároveň
// se na ni ptá každý tik AI (základny) i dohled. Průchod světem kvůli hrstce
// polí se nevyplatí ani na dnešní mapě, natož na desetinásobné.
// ⚠ Stejně jako u živých polí je evidence jen ZRYCHLENÍ: staví se znovu
// průchodem mapy pokaždé, když je `null`, takže zapomenutý zápis se zahojí.
let vyspyKes = null;
function zrusVyspy() { vyspyKes = null; }
function vyspyRodu(fid) {
  if (!vyspyKes) {
    vyspyKes = new Map();
    for (const t of G.tiles.values()) {
      if (t.structure !== "outpost" || t.owner === -1) continue;
      if (!vyspyKes.has(t.owner)) vyspyKes.set(t.owner, []);
      vyspyKes.get(t.owner).push(t);
    }
  }
  return vyspyKes.get(fid) || [];
}
function obnovZive() {
  G.zive = new Set();
  for (const t of G.tiles.values()) if (potrebujePozornost(t)) G.zive.add(keyOf(t.q, t.r));
}
const jeUzel = t => !!(t && t.bigSize === 2 && !t.structure);
// ---- mosty jako brány přes řeku (v0.40) ----
// Oba břehy mostu brání DVĚ armády s veliteli pevné úrovně 35 — stejná
// mechanika „na jeden zátah" jako u uzlů 2×2, jen s jinou posádkou.
const BRIDGE_LEVEL = 35;           // úroveň obou neutrálních velitelů mostu
// DVĚ ARMÁDY NA JEDEN ZÁTAH: uzly 2×2 a laterální mosty. Kolébkový přechod
// mezi ně NEPATŘÍ (v0.69) — je to první objektiv sezóny, ne uzel. S dvěma
// vlnami a patnáctiminutovou uzávěrou po nezdaru stál rod tolik času, že se
// fronta nestihla protlačit k prstenci: sim brána spadla z 63/64 na 53/64.
const dveArmady = t => jeUzel(t) || !!(t && t.structure === "bridge" && !jeKolebkovyMost(t));
// cena najmutí podle počtu hrdinů, které už frakce má (start = 1 zdarma)
const HERO_HIRE_COST = [0, 250, 450, 700, 1000];
const HERO_MAX = 5;
// startovní hrdina přidělený frakcí (v0.27): hráč si ho nevybírá — bere frakci
// a dostane jejího „basic signature" hrdinu (indexy dle pořadí rysů; všichni
// běžného tieru, u každé frakce jiný slot, ať pooly stran nepřijdou o totéž)
const STARTER_IDX = { aldar: 2, yllien: 0, brakkar: 3, sarn: 0,
  durgar: 3, horda: 1, vhorren: 3, gryk: 3 }; // pozor: durgar a horda mají jiné pořadí rysů;
// vhorren = Nespící Ordwal (tireless) — shield rys dával warlockovi stunImmune
// + avoidCharge z mistrovských bonusů a dělal z něj neporazitelnou pevnost

// --- oživení mapy: obnova neutrálních posádek a putovní události ---
const GARRISON_REGEN_TICKS = 600;    // neutrální posádka doroste za ~10 minut
const EVENT_INTERVAL = [70, 130];    // interval mezi událostmi na mapě (s)
let EVENT_MAX = 3;                   // souběžných událostí nejvýš (roste s plochou mapy)
const MAP_EVENTS = {
  banda:    { name: "Potulná banda",     icon: "💀", dur: 150,
    desc: "posádka pole +60 %; poražení bandy vynese zlato navíc" },
  karavana: { name: "Kupecká karavana",  icon: "💰", dur: 100,
    desc: "dobytí pole, dokud tu karavana táboří, vynese měšec zlata" },
  relikvie: { name: "Ztracená relikvie", icon: "✨", dur: 150,
    desc: "dobytí pole zaručí kořist vyšší rarity" },
};

// --- rytmus sezóny ---
let THRONE_UNLOCK = SEASON_TICKS / 2;  // Trůnní město se otevírá v půlce sezóny

// ---- otevírání světa po fázích (v0.30) ----
// Fáze 1 = jen vlastní výseč; 2 = + mezikruží velkých pevností; 3 = + cizí
// výseče a mosty; 4 = + vnitřek za hradbami (Trůn navíc hlídá příměří).
// Každou fázi otevře kolektivní checkpoint NEBO časová pojistka — co nastane
// dřív; sezóna se nesmí zaseknout.
const ZONE_FAZE_FRAC = { 2: 0.10, 3: 0.30, 4: 0.45 }; // pojistky v podílu sezóny
function zoneFazeTicks(n) {
  return Math.max(60, Math.round(SEASON_TICKS * (ZONE_FAZE_FRAC[n] || 1)));
}

// ---------- Prsten popela a body činu (v0.24) ----------
// Moc hráče (skóre) se každý „den světa" (1/60 sezóny) přetavuje ve zkušenost
// Prstenu popela. Úrovně odemykají ČINY na mapě placené body činu ⚡ — strop
// 24, +1 za „hodinu světa" (1/24 sezóny, u dlouhé sezóny nejvýš po reálné
// hodině). Prsten je samostatná mechanika hráčovy moci, NE výhra sezóny.
const RING_MAX = 10;
const RING_AP_MAX = 24;
const RING_COSTS = { gather: 6, train: 8, rest: 6 };
function ringXpNeed(l) { return Math.round(150 * Math.pow(l, 1.6)); }
function ringGrantTicks() { return Math.max(30, Math.round(SEASON_TICKS / 60)); }
function ringApTicks() { return Math.min(3600, Math.max(10, Math.round(SEASON_TICKS / 24))); }
// dary Prstenu jdou od v0.31 VÝHRADNĚ přes strom („za Prsten nic
// automaticky"): výdrž = větev Výdrž, velení = větev Velení. Jména funkcí
// zůstala — čtecí místa (heroStats.stamMax, heroArmyCap) i testy je znají
function ringStam(faction) { return 10 * ringVetev(faction, "vydrz"); }
function ringCap(faction) { return 111 * ringVetev(faction, "veleni"); }
const RING_UNLOCKS = [
  { lvl: 1, txt: "čin ⚡ Sklizeň kraje (6) — denní výnos pole naráz" },
  { lvl: 3, txt: "čin ⚡ Výcvik mysli (8) — hrdina získá zkušenost" },
  { lvl: 5, txt: "čin ⚡ Druhý dech (6) — hrdinovi se vrátí výdrž" },
  { lvl: 7, txt: "Sklizeň kraje je dvakrát vydatnější" },
  { lvl: 9, txt: "Výcvik mysli je dvakrát vydatnější" },
];

// ---------- Strom Prstenu (v0.31, etapa 4b) ----------
// Za Prsten NIC automaticky: dřívější pasivky (výdrž od úr. 2, velení na
// vrcholu) se stěhují do VĚTVÍ a všechno se kupuje za body — 1 bod za
// úroveň Prstenu, 10 bodů na 20 slotů = sezónní build. Milníky RING_UNLOCKS
// (činy ⚡) zůstávají mimo volbu. Reset stromu za zlato.
const RING_VETVE = {
  nadvlada: { name: "Nadvláda", max: 5, icon: "🗺", per: "+10 polí stropu území" },
  vlada:    { name: "Vláda",    max: 3, icon: "⚡", per: "+2 nejvyšší body činu" },
  vydrz:    { name: "Výdrž",    max: 3, icon: "🥾", per: "+10 nejvyšší výdrže hrdinů" },
  sklizen:  { name: "Sklizeň",  max: 3, icon: "🌾", per: "+3 % výnosů říše a +15 % Sklizně kraje" },
  veleni:   { name: "Velení",   max: 3, icon: "🎖", per: "+111 velení všem hrdinům" },
  hojnost:  { name: "Hojnost",  max: 3, icon: "✨", per: "+0,5 útoku a obrany všem hrdinům" },
};
const RING_RESPEC_GOLD = 300;    // cena přerozdělení stromu Prstenu (knob)
function ringVetev(faction, k) {
  return (faction && faction.ring && faction.ring.strom && faction.ring.strom[k]) || 0;
}
function ringApMax(faction) { return RING_AP_MAX + 2 * ringVetev(faction, "vlada"); }
function ringHojnost(faction) { return 0.5 * ringVetev(faction, "hojnost"); }
function ringLearn(faction, vetev) {
  const def = RING_VETVE[vetev];
  const r = faction.ring;
  if (!def || !r || !r.strom) return false;
  if ((r.body || 0) < 1 || (r.strom[vetev] || 0) >= def.max) return false;
  r.body--;
  r.strom[vetev] = (r.strom[vetev] || 0) + 1;
  addLog(faction.id, { klic: "kron.prsten.vetev", param: { vetev: def.name, rank: r.strom[vetev], max: def.max, popis: def.per } });
  return true;
}
function ringReset(faction) {
  const r = faction.ring;
  if (!r || !r.strom) return false;
  const utraceno = Object.values(r.strom).reduce((a, b) => a + b, 0);
  if (utraceno < 1 || faction.resources.gold < RING_RESPEC_GOLD) return false;
  faction.resources.gold -= RING_RESPEC_GOLD;
  for (const k in r.strom) r.strom[k] = 0;
  r.body = r.level;
  addLog(faction.id, { klic: "kron.prsten.reset", param: { cena: RING_RESPEC_GOLD } });
  return true;
}

// Výhra sezóny: kdo udrží Trůnní město NEPŘETRŽITĚ 12 % sezóny (u hodinové
// ~7 minut, u dvouměsíční ~týden jako v předloze), získává Korunu popela.
function throneHoldTicks() { return Math.max(60, Math.round(SEASON_TICKS * 0.12)); }
// ETAPA 12b: jednotka jde přes slovník. Do KRONIKY se ale doba vkládá jako
// PARAMETR (server ji skládá dřív, než ví, komu ji pošle), takže se tady
// vždycky vezme jazyk toho, kdo funkci volá — u klienta jeho vlastní,
// u serveru čeština jako záloha do `text`.
function fmtDobu(ticks) {
  const min = Math.round(ticks / 60);
  const J = jazyky();
  const t = (k, n) => (J.tx ? J.tx(k, { n }) : J.txCs(k, { n }));
  if (min >= 5760) return t("doba.dni", Math.round(min / 1440));
  if (min >= 120) return t("doba.hodin", Math.round(min / 60));
  return t("doba.minut", min);
}

// ---------- Kraje Vellaru (v0.24) ----------
// Devět pojmenovaných krajů: střed za hradbami + osm výsečí. Bránou kraje je
// jeho velká pevnost — kdo ji drží, „vládne kraji" (a nese už dřívější bonus
// +10 % útoku za grandfort).
const REGION_CENTER = "Srdce Vellaru";
const REGION_NAMES = ["Zlatá marka", "Tiché hvozdy", "Železné pustiny",
  "Popelná spálenina", "Šedé štíty", "Větrné stepi", "Bezesné pláně",
  "Rozhryzaná vrchovina"];   // pořadí = domovské výseče frakcí 0–7
function regionOf(t) {
  // ostrá nerovnost: brány (M = OUTER_R) patří kraji, který střeží — ne středu
  if (Math.abs(t.q) + Math.abs(t.r) < OUTER_R) return REGION_CENTER;
  const aq = Math.abs(t.q), ar = Math.abs(t.r);
  let idx;
  if (t.q >= 0 && t.r >= 0) idx = aq >= ar ? 0 : 1;        // aldar / yllien
  else if (t.q < 0 && t.r >= 0) idx = ar >= aq ? 4 : 6;    // brakkar / vhorren
  else if (t.q < 0 && t.r < 0) idx = aq >= ar ? 2 : 3;     // durgar / horda
  else idx = ar >= aq ? 7 : 5;                             // gryk / sarn
  return REGION_NAMES[idx];
}

// ---------- Zóny světa (v0.30) ----------
// Mapa se otevírá po fázích: každé pole patří do zóny a do zamčené zóny se
// neútočí (vlastní pole, návraty a posily omezené nejsou).
// ETAPA 7 (IV-K): výseč každého rodu se dělí na DVĚ radiální zóny —
// KOLÉBKU (dál od středu, stojí v ní kapitál) a EXPANZI (blíž ke středu).
//
// ROZHODNUTÍ UŽIVATELE (30. 8. 2026): kolébka zůstává nedotknutelná — cizí rod
// do ní nevstoupí NIKDY. Rod se tím nedá vymazat z mapy a tlak se přesouvá na
// CROSSING: kdo někoho porazil, musí jeho crossing z kolébky DRŽET, jinak se
// poražený vyleje zpátky ven. Raná hra je tak PvE, střední laterální PvP.
// Dělič se měří MANHATTANEM, stejně jako prstence hradeb. Vrstevnice Manhattanu
// jsou kosočtverce se čtyřmi stranami podél (1,1) a (1,−1) — přesně směry, které
// umí modely řek. Osmiúhelníková metrika (distLvl) by dala hezčí tvar, ale její
// vrstevnice nejsou v žádném z těch směrů a prstencová řeka by neměla model.
//
// Naměřeno na 69×69 (výseč 549 polí, váha = Σ úroveň²): za kapitály leží jen
// VÝPLŇ — průměrná úroveň 1,8 a žádné město. Dělič 28 (kapitál je na 32) proto
// nechá kolébce kapitál a jedno město, ale 69 % HODNOTY zůstane ve sporném pásu.
// Počtem polí je kolébka větší; to je v pořádku, je to prázdné zázemí.
function kolebkaR() { return Math.round(1.75 * OUTER_R); }
// index výseče (oktantu) — stejné dělení jako regionOf; sdílí ho zonaOf
// i pravidla kolébkových přechodů
function oktantOf(q, r) {
  const aq = Math.abs(q), ar = Math.abs(r);
  if (q >= 0 && r >= 0) return aq >= ar ? 0 : 1;
  if (q < 0 && r >= 0) return ar >= aq ? 4 : 6;
  if (q < 0 && r < 0) return aq >= ar ? 2 : 3;
  return ar >= aq ? 7 : 5;
}
function zonaOf(t) {
  if (t.structure === "grandfort" || t.structure === "bastion") return "mezikruzi";
  if (t.structure === "fortress") return "vnitrek";
  if (t.structure === "bridge") return "most"; // hranice výsečí — otevírá fáze 3
  const m = Math.abs(t.q) + Math.abs(t.r);
  if (m < WALL_R) return "vnitrek";
  if (m <= OUTER_R) return "mezikruzi";
  return (m > kolebkaR() ? "kolebka-" : "expanze-") + oktantOf(t.q, t.r);
}
// komu kolébka patří (-1 = není to kolébka)
function kolebkaOf(t) {
  const z = zonaOf(t);
  return z.startsWith("kolebka-") ? +z.slice(8) : -1;
}
// je to CIZÍ kolébka? (nedotknutelná — nepřítel do ní nevstoupí vůbec)
function jeCiziKolebka(faction, tile) {
  const k = kolebkaOf(bigAnchor(tile));
  return k !== -1 && k !== faction.id;
}
function zonaOtevrena(faction, tile) {
  const z = zonaOf(bigAnchor(tile));
  if (z === "vnitrek") return G.faze >= 4;
  if (z === "mezikruzi") return G.faze >= 2;
  // Laterální most je hranice mezi dvěma rody → fáze 3. KOLÉBKOVÝ PŘECHOD
  // jsou ale VLASTNÍ vrata rodu ven z domova: kdyby čekal na fázi 3, byl by
  // rod první třetinu sezóny zavřený ve slepé kapse (změřeno: gate 0/64).
  // Svůj přechod má rod otevřený od začátku, cizí až s ostatními mosty.
  if (z === "most") {
    const t = bigAnchor(tile);
    // oba břehy leží v téže výseči (vnitřní v expanzi, vnější v kolébce)
    if (jeKolebkovyMost(t)) return oktantOf(t.q, t.r) === faction.id || G.faze >= 3;
    return G.faze >= 3;
  }
  // KOLÉBKA: vlastní je otevřená vždy, cizí NIKDY (rozhodnutí 30. 8.)
  if (z.startsWith("kolebka-")) return z === "kolebka-" + faction.id;
  return z === "expanze-" + faction.id || G.faze >= 3;
}
const STORM_INTERVAL = [200, 320];       // popelná bouře: interval mezi bouřemi (s)
const STORM_DUR = 45;                    // trvání bouře (s)
const STORM_INCOME = 0.5;                // výnosy během bouře
const STORM_DEF = 1.2;                   // obránci se během bouře zakopou

// --- cíle sezóny (jen pro hráče; jednorázové odměny) ---
const SEASON_GOALS = [
  { key: "tiles",  desc: "Ovládni 15 polí",             check: f => [...G.tiles.values()].filter(t => t.owner === f.id).length >= 15,
    reward: { gold: 150 } },
  { key: "wins",   desc: "Vyhraj 5 bitev",              check: f => f.stats.wins >= 5,
    reward: { food: 100, wood: 100, gold: 100 } },
  { key: "city",   desc: "Dobuď keep kraje",             check: f => [...G.tiles.values()].some(t => t.owner === f.id && t.structure === "keep"),
    reward: { gold: 250 } },
  { key: "hero5",  desc: "Vycvič hrdinu na úroveň 5",   check: f => f.heroes.some(h => h.level >= 5),
    reward: { gold: 200 } },
  { key: "bridge", desc: "Ovládni most",                check: f => [...G.tiles.values()].some(t => t.owner === f.id && t.structure === "bridge"),
    reward: { wood: 150, gold: 100 } },
];

// ---------- Strop území + příběh sezóny + checkpointy (v0.31, etapa 4b) ----------
// Strop území (PLAN II-B2, rozhodnuto): základ 80, cíl 216. Tři zdroje:
// větev Nadvláda (+10/bod, max +50), kapitoly osobního příběhu (+10/kapitola,
// max +60) a kolektivní checkpointy (+26 celkem). Zábor nad strop nejde;
// výjimky: Trůn (sezónní cíl), nájezd „udeř a vrať se" (pole nedrží)
// a vynucené přesídlení. Nájezdy jsou ventil agrese pro frakce na stropu.
const STROP_BASE = 80;
function pocetPoli(faction) {
  // v0.32: počítá pole AKTÉRA (člen jen svá; zakladatel i pole bez t.clen)
  // etapa 11: čte JEDEN průchod mapou za tik místo vlastního skenu
  return prehledOf(faction).poli;
}

// ---------- AOI: OKRUH ZÁJMU HRÁČE (etapa 11) ----------
// Do etapy 11 dostal každý hráč CELOU mapu — při startu a pak každých 60 tiků
// jako samoléčba. Změřeno na 461×461 (212 521 polí): plný snímek dlaždic váží
// **21 MB**, takže při 800 hráčích by to bylo 16,9 GB každou minutu, tedy
// 2 256 Mbit/s. Nedá se to ani zkomprimovat do použitelna.
//
// Nově se posílá jen OKRUH ZÁJMU: kosočtverce kolem míst, kde hráč opravdu
// je (kapitál, hrdinové, výspy), plus jeho VLASTNÍ pole. Klient si dlaždice
// HROMADÍ — mapa mu jen roste, nikdy se nezmenšuje, takže se do prozkoumaných
// končin může kdykoli podívat a nic nezmizí.
//
// AOI_R je o kus větší než REACH: hráč musí vidět dál, než kam dosáhne, jinak
// by útočil naslepo.
const AOI_R = 55;

// ⚠ Na MALÉM světě se AOI NEPOUŽIJE. Okruh je pevných 55 polí bez ohledu na
// velikost mapy — to je celý smysl etapy 11 (náklad na hráče nezávisí na
// velikosti světa) — jenže na 69×69 z toho vyjde 70 % mapy a hráči zbude
// svět useknutý rovnou čarou. Na světě pro partu je plný snímek levný
// (4 761 polí, po kompresi desítky kB jednou za 60 tiků), takže se pošle celý.
// Strop 6 000 polí = svět do 77×77, tedy zhruba 50 hráčů; nad ním AOI nastoupí
// a zbytek mapy kreslí klient jako siluetu neznámé země.
const AOI_CELA_MAPA_DO = 6000;

// zájmová místa aktéra — kapitál, hrdinové v poli, výspy
function aoiBody(a) {
  const body = [];
  const cap = G.tiles.get(capKeyOf(a));
  if (cap) body.push(cap);
  for (const h of a.heroes || []) {
    if (!h.pos) continue;
    const t = G.tiles.get(h.pos);
    if (t) body.push(t);
    if (h.zakladna) { const z = G.tiles.get(h.zakladna); if (z) body.push(z); }
  }
  for (const m of a.marches || []) {
    const t = G.tiles.get(m.targetKey);
    if (t) body.push(t);
  }
  return body;
}

// Klíče dlaždic, které tenhle aktér smí dostat. Kosočtverce se počítají
// SOUŘADNICEMI, ne průchodem mapy — jinak by AOI stálo tolik co plný snímek.
function aoiKlice(a, r = AOI_R) {
  const out = new Set();
  if (!a) return out;
  if (G.tiles.size <= AOI_CELA_MAPA_DO) {
    for (const k of G.tiles.keys()) out.add(k);
    return out;
  }
  for (const b of aoiBody(a)) {
    for (let dq = -r; dq <= r; dq++) {
      const zb = r - Math.abs(dq);
      for (let dr = -zb; dr <= zb; dr++) {
        const k = keyOf(b.q + dq, b.r + dr);
        if (G.tiles.has(k)) out.add(k);
      }
    }
  }
  // vlastní pole aktéra ať leží kdekoli — strop území je 216, takže je to
  // nejvýš pár set klíčů a hráč musí vidět na všechno, co drží
  for (const t of G.tiles.values()) if (patriClenu(a, t)) out.add(keyOf(t.q, t.r));
  return out;
}

function stropPoli(faction) {
  let s = STROP_BASE + 10 * ringVetev(faction, "nadvlada")
    + 10 * ((faction.journey && faction.journey.kapitola) || 0);
  for (let i = 0; i < CHECKPOINTY.length; i++)
    if (G.checkpointy && G.checkpointy[i]) s += CHECKPOINTY[i].bonusPoli;
  return s;
}

// Příběh sezóny (journey): kapitoly po 3 questech, za kapitolu +10 polí
// stropu + suroviny (+ jádra hráčům). Vyhodnocuje se KAŽDÉ živé frakci —
// AI kapitoly plní přirozeně hrou (checky jsou podmínky, ne klikání).
// SEASON_GOALS výše zůstává jen jako mrtvá reference (nahrazeno kapitolami).
const KAPITOLY = [
  { name: "Kořeny říše", quests: [
      { key: "poli15", desc: "Ovládni 15 polí", check: f => pocetPoli(f) >= 15 },
      { key: "vyhry5", desc: "Vyhraj 5 bitev", check: f => f.stats.wins >= 5 },
      { key: "hrdina5", desc: "Vycvič hrdinu na úroveň 5", check: f => f.heroes.some(h => h.level >= 5) },
    ], reward: { gold: 250 } },
  { name: "Cesty a výspy", quests: [
      { key: "vyspa", desc: "Postav výspu", check: f => [...G.tiles.values()].some(t => patriClenu(f, t) && t.structure === "outpost") },
      { key: "poli30", desc: "Ovládni 30 polí", check: f => pocetPoli(f) >= 30 },
      { key: "vyhry12", desc: "Vyhraj 12 bitev", check: f => f.stats.wins >= 12 },
    ], reward: { wood: 250, gold: 150 } },
  { name: "Keepy krajů", quests: [
      { key: "mesto", desc: "Dobuď keep kraje", check: f => [...G.tiles.values()].some(t => patriClenu(f, t) && t.structure === "keep") },
      { key: "prsten3", desc: "Prsten popela na úrovni 3", check: f => f.ring && f.ring.level >= 3 },
      { key: "hrdina10", desc: "Vycvič hrdinu na úroveň 10", check: f => f.heroes.some(h => h.level >= 10) },
    ], reward: { stone: 250, gold: 250 } },
  { name: "Bohatství žil", quests: [
      { key: "uzel", desc: "Zlom uzel 2×2 (dvě armády na jeden zátah)", check: f => [...G.tiles.values()].some(t => patriClenu(f, t) && jeUzel(t) && t.bigSize === 2) },
      { key: "poli50", desc: "Ovládni 50 polí", check: f => pocetPoli(f) >= 50 },
      { key: "usazeni", desc: "Usaď hrdinu na výspě", check: f => f.heroes.some(h => h.zakladna) },
    ], reward: { iron: 300, gold: 300 } },
  { name: "Brány krajů", quests: [
      { key: "brana", desc: "Dobuď baštu nebo pevnost", check: f => [...G.tiles.values()].some(t => patriClenu(f, t) && (t.structure === "bastion" || t.structure === "fortress")) },
      { key: "most", desc: "Ovládni most", check: f => [...G.tiles.values()].some(t => patriClenu(f, t) && t.structure === "bridge") },
      { key: "vyhry30", desc: "Vyhraj 30 bitev", check: f => f.stats.wins >= 30 },
    ], reward: { gold: 500 } },
  { name: "Stín Trůnu", quests: [
      { key: "grandfort", desc: "Dobuď velkou pevnost", check: f => [...G.tiles.values()].some(t => patriClenu(f, t) && t.structure === "grandfort") },
      { key: "prsten6", desc: "Prsten popela na úrovni 6", check: f => f.ring && f.ring.level >= 6 },
      { key: "poli80", desc: "Ovládni 80 polí", check: f => pocetPoli(f) >= 80 },
    ], reward: { gold: 800 } },
];

// Kolektivní checkpointy = motor sezóny: podmínky společného postupu VŠECH
// frakcí. Splnění (klidně i POZDĚJI, po časové pojistce) dá všem jednorázově
// +bonusPoli do stropu; fáze světa (zonaOtevrena) otevírá checkpoint NEBO
// pojistka — porce polí je ale odměna jen za skutečné splnění (216 je cíl,
// ne nárok). Měří se nad jedním průchodem mapy (m = {poli,granty,silnych,zivych}).
const CHECKPOINTY = [
  { faze: 2, popis: "ovládnuto 24 polí na frakci", bonusPoli: 8,
    check: m => m.poli >= 24 * m.zivych },
  { faze: 3, popis: "dobyty velké pevnosti", bonusPoli: 9,
    check: m => m.granty >= Math.max(2, Math.ceil(m.zivych / 4)) },
  { faze: 4, popis: "ovládnuta silná pole (130+, 5 na frakci)", bonusPoli: 9,
    check: m => m.silnych >= 5 * m.zivych },
];

// --- diplomacie ---
const PACT_DURATION = 180;      // pakt o neútočení (s)
const PACT_COST = 100;          // zlato za nabídku paktu
const PACT_REFUSE_COOLDOWN = 90;   // po odmítnutí chvíli nenabízet znovu
const PACT_BETRAYAL_COOLDOWN = 300; // po vypovězení paktu AI dlouho nedůvěřuje

// --- údržba armád jídlem ---
// ZADÁNÍ UŽIVATELE (30. 8. 2026): každý začíná s HOTOVOU armádou — 3 000 CP
// základní jednotky a 1 500 CP druhé. Dřív to bylo 20 pěšáků, tedy prakticky
// nic: hráč musel nejdřív dlouho verbovat, než mohl na první pole.
// Počítá se v BODECH VELENÍ, ne v kusech, aby sarn (2 CP za kus) dostal stejné
// velení, ne dvojnásobnou armádu.
// Startovní armáda se s novou křivkou musela zmenšit: se stropem 300 CP by
// z 4 500 CP hrdina uvezl patnáctinu a zbytek by byl jen zeď kolem města.
// 600 CP = hrdina si naloží plný batoh a něco málo zbude doma.
const START_CP = { inf: 400, arch: 200 };
function startovniZasoba(fkey) {
  const out = emptyArmy();
  for (const k in START_CP) out[k] = Math.round(START_CP[k] / (uDef(fkey, k).cp || 1));
  return out;
}
// ZRUŠENO NA ZADÁNÍ UŽIVATELE (30. 8. 2026): armáda nežere jídlo ani neplatí
// žold. Hladovění a dezerce tím padají celé — brzdou velikosti armády zůstává
// STROP VELENÍ hrdiny, ne ekonomika. (Frakční mod `upkeep` u vhorrena tím
// ztratil smysl; nechává se v tabulce, ale nic nedělá.)

// kámen–nůžky–papír: pěchota > jízda > lučištníci > pěchota
// bojové staty: hp = životy jednotky, dmg = základní poškození za kolo,
// atk/def = útok a obrana (rozdíl proti straně nepřítele = ±5 % poškození/bod)
// cp = kolik bodů velení jednotka zabírá (velení hrdiny je heroArmyCap).
// Zatím všechny 1:1; těžké jednotky s vyšší vahou (jízda 2, obři 25/100)
// přijdou s přestavbou boje na formace — proto se s cp počítá už teď.
const UNIT_TYPES = {
  inf:  { name: "Pěchota",    icon: "🗡", power: 1, counters: "cav", cp: 1, ini: 4,
          hp: 10, dmg: 2, atk: 3, def: 5, speed: 0.8,
          cost: { food: 80,  iron: 30, gold: 20 } },
  arch: { name: "Lučištníci", icon: "🏹", power: 1, counters: "inf", cp: 1, ini: 6,
          hp: 6,  dmg: 3, atk: 5, def: 2, speed: 1.0,
          cost: { food: 60,  wood: 60, gold: 30 } },
  // základní „velká": neutrálové ji nedostanou (viz balancedArmy), je tu proto,
  // aby smyčky přes UNIT_KEYS měly co číst i u domobrany
  big:  { name: "Obrněnci",   icon: "🛡", power: 1, counters: null, cp: 25, ini: 3,
          velka: true, rada: "clona", trainMult: 2,
          hp: 288, dmg: 25, atk: 2, def: 7, speed: 0.5,
          cost: { food: 2600, iron: 1200, gold: 900 } },
  cav:  { name: "Jízda",      icon: "🐎", power: 1, counters: "arch", cp: 1, ini: 9,
          hp: 9,  dmg: 3, atk: 5, def: 3, speed: 1.3,
          cost: { food: 120, iron: 50, gold: 60 } },
};
const UNIT_KEYS = ["inf", "arch", "cav", "big", "inf2", "arch2", "cav2"];
// „big" je čtvrtý druh — vlajková jednotka T4 rodu (etapa 6, IV-M).
// Neutrálové a domobrana ji NEMAJÍ: balancedArmy dál dělí posádku na tři díly,
// takže se svět velkými jednotkami nezaplevelí a kotvy dobývání drží.
//
// „*2" jsou jednotky DRUHÉHO RODU (IV-O): na 8. úrovni hlavní budovy si hráč
// jednou za sezónu vybere spřátelený rod své strany a smí verbovat jeho
// ZÁKLADNÍ jednotky — vlajku ne, ta je duše rodu. Klíče jsou vlastní, aby šla
// cizí clona postavit PŘED vlastní střelce; pravidlo tří formací platí dál,
// takže roster 7 druhů pořád znamená bitvu o třech liniích.
const DRUHY_ROD_KLICE = { inf2: "inf", arch2: "arch", cav2: "cav" };
function jeDruhehoRodu(k) { return !!DRUHY_ROD_KLICE[k]; }
// Trojúhelník převah, role linií i protibonusy se dívají na DRUH, ne na klíč:
// "cav2" je pořád jízda, takže ji pěchota poráží a jízdou obchází clonu.
function zakladniDruh(k) { return DRUHY_ROD_KLICE[k] || k; }

// ---------- Frakční jednotky (v0.23, dle papírové tabulky v DESIGN.md) ----------
// Tři jednotky frakce se mapují na tři SLOTY formací (inf/arch/cav) — trojúhelník
// převah zůstává po slotech. Neutrální posádky a domobrana jedou na základní
// tabulce UNIT_TYPES. Zvláštní vlajky: magic (poškození obchází porovnání
// útok/obrana), bonusVs (násobek proti slotu cíle), cp (body velení za kus).
const FACTION_UNITS = {
  aldar: {   // řemeslo a kvalita: +10 % staty, +25 % cena, pomalejší výcvik
    inf:  { name: "Gardová pěchota", icon: "🗡", power: 1, counters: "cav", cp: 1, ini: 4,
            hp: 10, dmg: 2.3, atk: 3, def: 5, speed: 0.8, cost: { food: 100, iron: 38, gold: 25 } },
    arch: { name: "Královští střelci", icon: "🏹", power: 1, counters: "inf", cp: 1, ini: 6,
            hp: 7, dmg: 3.2, atk: 5, def: 2, speed: 1.0, cost: { food: 75, wood: 75, gold: 38 } },
    cav:  { name: "Korouhevní jízda", icon: "🐎", power: 1, counters: "arch", cp: 1, ini: 9,
            hp: 9, dmg: 3.2, atk: 5, def: 3, speed: 1.3, cost: { food: 150, iron: 63, gold: 75 } },
  },
  yllien: {  // mistři střelby: jádro ve střelcích, lehká rychlá pěchota
    inf:  { name: "Strážci hvozdu", icon: "🗡", power: 1, counters: "cav", cp: 1, ini: 5,
            hp: 9, dmg: 2.2, atk: 4, def: 6, speed: 0.9, cost: { food: 80, iron: 30, gold: 20 } },
    arch: { name: "Trnoví lučištníci", icon: "🏹", power: 1, counters: "inf", cp: 1, ini: 7,
            hp: 6, dmg: 4.1, atk: 7, def: 2, speed: 1.0, cost: { food: 60, wood: 60, gold: 30 } },
    cav:  { name: "Trnová jízda", icon: "🐎", power: 1, counters: "arch", cp: 1, ini: 9,
            hp: 8, dmg: 3.4, atk: 5, def: 3, speed: 1.3, cost: { food: 120, iron: 50, gold: 60 } },
  },
  durgar: {  // útočné železo: drtivá pomalá pěchota
    inf:  { name: "Železné tesáky", icon: "🗡", power: 1, counters: "cav", cp: 1, ini: 3,
            hp: 11, dmg: 3.1, atk: 4, def: 5, speed: 0.75, cost: { food: 85, iron: 40, gold: 20 } },
    arch: { name: "Vrhači oštěpů", icon: "🏹", power: 1, counters: "inf", cp: 1, ini: 6,
            hp: 6, dmg: 3.1, atk: 5, def: 2, speed: 1.0, cost: { food: 60, wood: 60, gold: 30 } },
    cav:  { name: "Vlčí jezdci", icon: "🐎", power: 1, counters: "arch", cp: 1, ini: 9,
            hp: 9, dmg: 3.1, atk: 5, def: 3, speed: 1.3, cost: { food: 120, iron: 50, gold: 60 } },
  },
  horda: {   // sklo, které pálí: +zbraň, −obrana, levnější
    inf:  { name: "Popelná lůza", icon: "🗡", power: 1, counters: "cav", cp: 1, ini: 4,
            hp: 9, dmg: 2.9, atk: 3, def: 4, speed: 0.85, cost: { food: 68, iron: 26, gold: 17 } },
    arch: { name: "Sirné praky", icon: "🏹", power: 1, counters: "inf", cp: 1, ini: 6,
            hp: 6, dmg: 4, atk: 5, def: 1, speed: 1.0, cost: { food: 60, wood: 60, gold: 30 } },
    cav:  { name: "Stínové bestie", icon: "🐎", power: 1, counters: "arch", cp: 1, ini: 10,
            hp: 8, dmg: 3.8, atk: 5, def: 2, speed: 1.35, cost: { food: 110, iron: 45, gold: 55 } },
  },
  brakkar: { // pomalí a nezlomní: −iniciativa, −pochod, +životy a obrana
    inf:  { name: "Štítová hradba", icon: "🛡", power: 1, counters: "cav", cp: 1, ini: 2,
            hp: 13, dmg: 2, atk: 3, def: 6, speed: 0.7, cost: { food: 85, iron: 40, gold: 22 } },
    arch: { name: "Vrhači seker", icon: "🪓", power: 1, counters: "inf", cp: 1, ini: 4,
            hp: 8, dmg: 3, atk: 5, def: 3, speed: 0.85, cost: { food: 65, wood: 65, gold: 32 } },
    cav:  { name: "Beraní vozy", icon: "🐏", power: 1, counters: "arch", cp: 1, ini: 6,
            hp: 11, dmg: 3, atk: 4, def: 4, speed: 1.05, cost: { food: 130, iron: 60, gold: 65 } },
  },
  sarn: {    // vše v sedle: 2 body velení na kus, dvojité staty, rychlý pochod
    inf:  { name: "Obrněná jízda", icon: "🐎", power: 1, counters: "cav", cp: 2, ini: 7,
            hp: 24, dmg: 3.5, atk: 6, def: 10, speed: 1.1, cost: { food: 240, iron: 100, gold: 120 } },
    arch: { name: "Jízdní lučištníci", icon: "🏹", power: 1, counters: "inf", cp: 2, ini: 10,
            hp: 14, dmg: 5, atk: 10, def: 4, speed: 1.25, cost: { food: 160, wood: 100, gold: 100 } },
    cav:  { name: "Vichrná jízda", icon: "🌪", power: 1, counters: "arch", cp: 2, ini: 12,
            hp: 18, dmg: 5, atk: 10, def: 6, speed: 1.4, cost: { food: 260, iron: 110, gold: 140 } },
  },
  vhorren: { // padlí vstávají: pomalé levné šiky, mágové s magickým poškozením
    inf:  { name: "Kostěná hradba", icon: "💀", power: 1, counters: "cav", cp: 1, ini: 3,
            hp: 11, dmg: 2.4, atk: 3, def: 6, speed: 0.75, cost: { food: 68, iron: 26, gold: 17 } },
    arch: { name: "Bledí mágové", icon: "✨", power: 1, counters: "inf", cp: 1, ini: 5, magic: true,
            hp: 6, dmg: 4, atk: 0, def: 2, speed: 0.95, cost: { food: 45, wood: 25, gold: 45 } },
    cav:  { name: "Mrtvolní štvanci", icon: "🐺", power: 1, counters: "arch", cp: 1, ini: 8,
            hp: 10, dmg: 3.5, atk: 4, def: 3, speed: 1.25, cost: { food: 102, iron: 43, gold: 51 } },
  },
  gryk: {    // množství a kořist: −15 % staty, −25 % cena, kopí proti jízdě
    inf:  { name: "Kopiníci roje", icon: "🗡", power: 1, counters: "cav", cp: 1, ini: 4,
            hp: 9, dmg: 3, atk: 4, def: 4, speed: 0.85, bonusVs: { cav: 1.5 },
            cost: { food: 60, iron: 22, gold: 15 } },
    arch: { name: "Prakovníci", icon: "🪨", power: 1, counters: "inf", cp: 1, ini: 6,
            hp: 6, dmg: 3.6, atk: 5, def: 2, speed: 1.0, cost: { food: 45, wood: 45, gold: 22 } },
    cav:  { name: "Jezdci na vlkodavech", icon: "🐺", power: 1, counters: "arch", cp: 1, ini: 10,
            hp: 8, dmg: 3.3, atk: 5, def: 3, speed: 1.3, cost: { food: 90, iron: 38, gold: 45 } },
  },
};

// Most na slovník: v prohlížeči je `tx` globální (jazyky.js je klasický
// skript), v Node se modul dotáhne přes require. Jméno `tx`, ne `t` — `t`
// je v tomhle souboru dlaždice na stovkách míst.
// Stojí NAD tabulkami jednotek schválně: `unitsOf` si jím překládá jména,
// a to běží dřív, než se dojde na kroniku. `var`, ne `let` — TDZ by
// shodilo volání z inicializace modulu.
var _jazyky = null;
function jazyky() {
  if (_jazyky) return _jazyky;
  const nic = { txCs: k => k, tx: k => k, maKlic: () => false, znaKlic: () => false, aktualniJazyk: () => "cs" };
  // ⚠ V PROHLÍŽEČI se most skládá RUČNĚ z globálů — co se sem nezapíše,
  // to game.js nemá. `naPrepnuti` tu chybělo a přepis obsahových tabulek
  // se proto v prohlížeči nikdy nezaregistroval (v Node přes require jel).
  if (typeof txCs === "function") _jazyky = { txCs, tx, maKlic, znaKlic, aktualniJazyk, naPrepnuti, cisloJazyk };
  else if (typeof require === "function") {
    try { _jazyky = require("./jazyky.js"); } catch (e) { _jazyky = nic; }
  } else _jazyky = nic;
  return _jazyky;
}
// Jméno z obsahové tabulky (jednotky, vylepšení…): když slovník klíč zná,
// vyhraje překlad; jinak zůstane česká předloha z tabulky. Nová jednotka
// tak jde přidat bez zásahu do tří jazyků a nikde se neobjeví ⟨klic⟩.
function nazev(klic, cesky) {
  const J = jazyky();
  // `{svet}` je v obsahových tabulkách VŽDYCKY k dispozici — jméno světa
  // se nepřekládá, ale do vět se dosazuje (viz hlavička jazyky.js).
  return J.znaKlic(klic) ? J.tx(klic, { svet: SVET_JMENO }) : cesky;
}
// Tabulka jednotek strany = vlastní rod + (volitelně) základní jednotky
// druhého rodu pod klíči *2. Skládá se do KEŠE, protože uDef jede v horkých
// smyčkách boje; klíč keše je dvojice rodů, takže se nemůže rozejít se stavem.
const _udKes = new Map();
function unitsOf(f, druhy) {
  const fk = typeof f === "string" ? f : f && f.key;
  const dr = druhy !== undefined ? druhy : (typeof f === "object" && f ? f.druhyRod : null);
  const zaklad = FACTION_UNITS[fk] || UNIT_TYPES;
  // ETAPA 12b: jména jednotek jdou přes slovník (klíč `jed.<rod>.<druh>`).
  // Sedí to sem, protože `uDef` je jediná cesta, kterou se jméno ven dostane —
  // jinak by se překlad musel lepit na třicet míst v enginu i v rozhraní.
  // Jazyk je součástí klíče keše, jinak by po přepnutí zůstala stará jména.
  // NEUTRÁL nemá rod, takže spadne na UNIT_TYPES — ty mají vlastní prefix
  // `jed.zaklad`, jinak by se hledal klíč `jed.undefined.inf` a jméno by
  // v reportu zůstalo české.
  const pre = fk ? "jed." + fk : "jed.zaklad";
  const klic = fk + "|" + (dr || "") + "|" + jazyky().aktualniJazyk();
  let t = _udKes.get(klic);
  if (t) return t;
  t = {};
  for (const k in zaklad)
    t[k] = Object.assign({}, zaklad[k], { name: nazev(pre + "." + k, zaklad[k].name) });
  if (dr && FACTION_UNITS[dr] && dr !== fk) {
    const rodJm = FACTION_DEFS.find(d => d.key === dr).name;
    for (const k in DRUHY_ROD_KLICE) {
      const dk = DRUHY_ROD_KLICE[k], z = FACTION_UNITS[dr][dk];
      // jméno nese rod, ať hráč v mřížce pozná, čí jednotka to je
      t[k] = Object.assign({}, z, { name: nazev("jed." + dr + "." + dk, z.name) + " (" + rodJm + ")" });
    }
  }
  _udKes.set(klic, t);
  return t;
}
// Klíče, které frakce nemá (jednotky druhého rodu bez spojenectví), musí
// z uDef vracet NĚCO — smyčky přes UNIT_KEYS jsou po celém enginu a
// undefined.cp je shodí. Prázdná jednotka je neškodná: unitUnlocked ji do
// verbování nepustí, takže se v armádě nikdy neobjeví a do boje nedojde.
const PRAZDNA_JEDNOTKA = { name: "—", icon: "·", power: 1, counters: null, cp: 1,
  ini: 1, hp: 1, dmg: 0, atk: 0, def: 0, speed: 1, cost: {}, prazdna: true };
function uDef(f, k) { return unitsOf(f)[k] || PRAZDNA_JEDNOTKA; }
// Keš vrací KOPIE, takže zásah do FACTION_UNITS za běhu se do ní nepromítne.
// Hra tabulku po startu nemění, ale A/B měření v testech ano — tohle je
// jediná správná cesta, jak jim dát vědět, že se předloha změnila.
function zrusKesJednotek() { _udKes.clear(); }

// Událost bojového reportu ({s,klic,param}) → ČESKÁ věta. Používají ji testy
// a stará data; klient si ji skládá sám ve svém jazyce.
function evCesky(e) {
  if (typeof e === "string") return e;
  if (!e || !e.klic) return "";
  return (e.s === "a" ? "⚔ " : e.s === "d" ? "🛡 " : "") + jazyky().txCs(e.klic, e.param);
}

// hospodářské modifikátory frakcí (výcvik, stavby, údržba, kořist)
const FACTION_MODS = {
  aldar:   { trainTime: 1.5, buildCost: 0.85, buildTime: 0.85 },
  durgar:  { upgradeCost: 0.75 },
  horda:   { goldLoot: 0.1 },
  vhorren: { upkeep: 0.5 },
  gryk:    { trainTime: 0.75, buildTime: 0.75 },
};

// budovy hlavního města; cost/time indexováno CÍLOVOU úrovní
const BUILDINGS = {
  main: {
    // IV-O: strom budov má pokrýt celou sezónu, ne první minuty — proto 8 úrovní
    name: "Hlavní budova", max: 8,
    desc: "+10 % výnosu za úroveň; určuje nejvyšší úroveň ostatních budov, na úrovni 7 otevírá vlajkovou jednotku rodu a na úrovni 8 druhý rod k verbování",
    // CENY (30. 8. 2026, zadání uživatele): dosavadní křivka byla proti výnosům
    // plochá — vůdce sezóny má na konci hodiny 340 000 kámen/h, takže celý strom
    // budov stál pár minut příjmu. Nově tisíce dole a MILION nahoře.
    // ROZVOLNĚNO 31. 8. 2026: poměr je ROVNOMĚRNÝ ×2,63 na úroveň, ne pozvolný
    // začátek a zeď na konci. Střed tím zdražil (úr. 5 z 24 000 na 54 800,
    // úr. 6 ze 70 000 na 144 200), takže se stoupá celou sezónu místo skoku.
    cost: [null, null, { stone: 1200, gold: 800 }, { stone: 2700, gold: 1800 },
           { stone: 4500, wood: 1500, gold: 4000 }, { stone: 10800, wood: 3600, gold: 9600 },
           { stone: 45000, wood: 15000, gold: 40000 },
           { stone: 171000, wood: 57000, gold: 152000 },
           { stone: 450000, wood: 150000, gold: 400000 }],
    // 31. 8. 2026: horní tři úrovně stojí ČAS, ne jen suroviny. Řetěz na
    // hlavní budovu 7 dělá 1 175 s baseline = 110 hodin čtrnáctidenní sezóny
    // (4,6 dne čisté stavby), takže vlajka vychází na týden hraní. Suroviny
    // by to samy neudělaly: plató výnosu je 191 000 zlata/h a milion je pak
    // pět hodin příjmu.
    time: [null, null, 30, 45, 60, 90, 300, 650, 1200],
  },
  barracks: {
    name: "Kasárny", max: 4,
    desc: "úr. 2 odemyká lučištníky, úr. 3 jízdu, úr. 4 vlajkovou jednotku rodu (a k ní je potřeba i Hlavní budova 7); každá úroveň zrychluje výcvik",
    // kasárny drží celou AI (odemykají jí střelce a jízdu), proto zůstávají
    // mírné — vlajku od 31. 8. 2026 stejně brzdí HLAVNÍ BUDOVA 7, ne ony
    cost: [null, null, { stone: 900, gold: 600 }, { stone: 2200, gold: 1800 },
           { stone: 5500, wood: 1800, gold: 4700 }],
    time: [null, null, 40, 60, 90],
  },
  hospital: {
    name: "Nemocnice", max: 3,
    desc: "vrací část padlých do zásoby (15 / 20 / 25 %)",
    cost: [null, { stone: 600, gold: 400 }, { stone: 1400, gold: 1100 }, { stone: 3600, gold: 2900 }],
    time: [null, 30, 45, 60],
  },
  academy: {
    // IV-O: +100 velení za úroveň (dřív +1). Po rebase velení na ~5 200 CP
    // dávala akademie za deset úrovní +10 CP, tedy 0,2 % — byla to mrtvá
    // budova. Nově +1 000 CP = +19 % ke stropu, a tomu odpovídají i ceny (×2,5).
    name: "Akademie velení", max: 10,
    desc: "+100 velení všem hrdinům za úroveň (stavět jde do dvojnásobku úrovně Hlavní budovy)",
    // deset úrovní rovnoměrně ×1,91: 3 000 → 1 000 000. AI akademii nestaví
    // vůbec, takže je to čistě hráčův dlouhodobý cíl sezóny.
    cost: [null,
      { stone: 1650, gold: 1350 }, { stone: 3150, gold: 2570 }, { stone: 6000, gold: 4910 },
      { stone: 11440, gold: 9360 }, { stone: 21820, gold: 17850 },
      { stone: 41610, gold: 34040 }, { stone: 79340, gold: 64920 },
      { stone: 151300, gold: 123800 }, { stone: 288550, gold: 236090 },
      { stone: 550000, gold: 450000 }],
    time: [null, 30, 35, 40, 45, 50, 55, 60, 70, 80, 90],
  },
  market: {
    name: "Tržnice", max: 3,
    desc: "směna surovin; každá úroveň zlepšuje kurz (40 / 55 / 70 %)",
    cost: [null, { stone: 940, wood: 700, gold: 360 },
           { stone: 2800, wood: 2100, gold: 1100 }, { stone: 8400, wood: 6300, gold: 3300 }],
    time: [null, 35, 50, 70],
  },
};
// podíl RANĚNÝCH, které nemocnice vrátí (ranění = 1 − LOSS_DEAD ze ztrát);
// 0,4 × [0,375 / 0,5 / 0,625] = 15 / 20 / 25 % ztrát jako dřív
const HOSPITAL_HEAL = [0, 0.375, 0.5, 0.625];

// ---------- Tržnice ----------
// Směňuje se jen mezi POLNÍMI surovinami — zlato zůstává stranou (platí se jím
// žold, verbování a hrdinové, takže by se přes tržnici dalo farmit).
// Kurz je vždy ztrátový: za 100 daných dostaneš 40 / 55 / 70 podle úrovně.
const MARKET_RES = ["food", "wood", "stone", "iron"];
const MARKET_RATE = [0, 0.40, 0.55, 0.70];
const MARKET_MIN = 10;   // pod tuhle hranici se neobchoduje (kvůli zaokrouhlení)

function marketLevel(faction) { return faction.buildings.market || 0; }

// kolik dostanu za `amount` dané suroviny (0 = obchod neprojde)
function marketGain(faction, amount) {
  const lvl = marketLevel(faction);
  if (lvl < 1) return 0;
  amount = Math.floor(Number(amount) || 0);
  if (amount < MARKET_MIN) return 0;
  return Math.floor(amount * MARKET_RATE[lvl]);
}

function marketExchange(faction, from, to, amount) {
  if (marketLevel(faction) < 1) return false;
  if (from === to) return false;
  if (!MARKET_RES.includes(from) || !MARKET_RES.includes(to)) return false;
  amount = Math.floor(Number(amount) || 0);
  if (amount < MARKET_MIN || faction.resources[from] < amount) return false;
  const got = marketGain(faction, amount);
  if (got < 1) return false;
  faction.resources[from] -= amount;
  faction.resources[to] += got;
  return true;
}

// ---------- Frakční pasivky jednotek a vylepšení ----------
// Každý typ jednotky má u každé frakce vlastní pasivní schopnost (aktivní od
// začátku); frakční vylepšovací budova dává +10 % síly typu za úroveň a na
// úrovni 2 pasivku zesiluje (×1,5).
const UNIT_PASSIVES = {
  aldar: {
    inf:  { name: "Štítová formace", desc: "v 1. kole boje kryje: −30 % utrpěných ztrát" },
    arch: { name: "Přesná salva",    desc: "v 1. kole střílí dřív a srazí úvodní úder nepřítele o 25 %" },
    cav:  { name: "Výpad",           desc: "v 1. kole +20 % síly" },
  },
  yllien: {
    inf:  { name: "Lesní úskok",     desc: "při obraně se každé kolo vyhne 15 % příchozích ztrát" },
    arch: { name: "Dvojitý výstřel", desc: "každé 3. kolo střílí dvakrát" },
    cav:  { name: "Vílí rychlost",   desc: "při ústupu z prohraného boje poloviční ztráty jízdy" },
  },
  durgar: {
    inf:  { name: "Krvavá zbroj",    desc: "vztek: za každé kolo se ztrátami +8 % síly" },
    arch: { name: "Těžké šipky",     desc: "obchází 30 % obranného bonusu terénu a opevnění" },
    cav:  { name: "Beranidlo",       desc: "+25 % síly při útoku na opevněná pole" },
  },
  horda: {
    inf:  { name: "Požírači",        desc: "každé kolo pohltí padlé: obnoví 10 % zabitých nepřátel" },
    arch: { name: "Lovci hrdinů",    desc: "+25 % síly proti armádě vedené hrdinou; poražený hrdina se zotavuje o 30 s déle" },
    cav:  { name: "Popelná smršť",   desc: "rozjezd: každým kolem boje +5 % síly" },
  },
  brakkar: {
    inf:  { name: "Nezlomná hradba", desc: "o třetinu víc životů a tužší obrana — kovadlina hlubiny" },
    arch: { name: "Vrhači seker",    desc: "krátký dostřel, ale dvakrát tužší než cizí střelci" },
    cav:  { name: "Okované vozy",    desc: "pomalé beranidlové vozy — drží jako pěchota" },
  },
  sarn: {
    inf:  { name: "Obrněná lavina",  desc: "vše v sedle: dvojité staty, 2 body velení na jednotku" },
    arch: { name: "Střelba za jízdy", desc: "jízdní lučištníci — střelci s rychlostí jízdy" },
    cav:  { name: "Vichrný roj",     desc: "nejrychlejší jednotka Vellaru" },
  },
  vhorren: {
    inf:  { name: "Kostěné řady",    desc: "po vyhrané bitvě čtvrtina vlastních padlých vstane" },
    arch: { name: "Bledá magie",     desc: "magické poškození — obchází porovnání útoku a obrany" },
    cav:  { name: "Mrtvolní štvanci", desc: "oživování padlých platí i pro ně" },
  },
  gryk: {
    inf:  { name: "Dlouhá kopí",     desc: "+50 % poškození proti jízdě" },
    arch: { name: "Laciné praky",    desc: "sklo za pár šupů — o čtvrtinu levnější" },
    cav:  { name: "Vlkodavi",        desc: "nejlevnější jízda Vellaru" },
  },
};

const UNIT_UPGRADES = {
  aldar:  { inf: "Cvičiště štítonošů", arch: "Královská lukostřelnice", cav: "Turnajová stáj" },
  yllien: { inf: "Trnová houština",    arch: "Větrná galerie",          cav: "Mlžné výběhy" },
  durgar: { inf: "Krvavá jáma",        arch: "Šípařská dílna",          cav: "Válečná kovárna" },
  horda:  { inf: "Jáma hladu",         arch: "Hnízdo lovců",            cav: "Popelné ohrady" },
  brakkar: { inf: "Runová zbrojnice",  arch: "Sekerníkův dvůr",         cav: "Beranidlová hala" },
  sarn:    { inf: "Obrněná ohrada",    arch: "Lukostřelba za jízdy",    cav: "Vichrné výběhy" },
  vhorren: { inf: "Kostnice",          arch: "Bledá věž",               cav: "Mrtvolné stáje" },
  gryk:    { inf: "Jáma s kopími",     arch: "Prakovnická rokle",       cav: "Vlkodaví kotce" },
};
// ---------- VLAJKOVÉ JEDNOTKY T4 (etapa 6, PLAN IV-M) ----------
// Jedna ikonická jednotka na rod, klíč "big". Staty se NEPÍŠOU ručně — odvozují
// se z jednotky téhož rodu ve stejné roli, takže si vlajka nese jeho povahu
// (durgarský trol vyrůstá z tvrdší pěchoty než yllienský ent) a nemůže se
// rozejít s laděním T1–T3.
//
// Profil je „VÝDRŽ, NE VÝSTUP" (rozhodnuto 30. 8.): 25 CP trola PŘEŽIJE o desetinu
// víc než 25 pěšáků, ale udělí ani ne polovinu jejich poškození. Bez toho by byl
// na obraně striktně nejlepší jednotkou ve hře — kdo stojí na poli, nepochoduje,
// takže z dvojí ceny pomalosti platí jen iniciativu.
const VELKA_VYDRZ = 1.15;    // životy na 1 CP proti základní jednotce rodu
const VELKA_VYSTUP = 0.45;   // poškození na 1 CP proti základní jednotce rodu
const VELKA_CENA = 1.3;      // příplatek za vlajku (na 1 CP)

function velkaJednotka(fkey, cfg) {
  const z = FACTION_UNITS[fkey][cfg.zaklad || "inf"];   // vzor povahy rodu
  const cp = cfg.cp;
  // POZOR: přepočítává se NA BOD VELENÍ, ne na kus. Sarnská jízda stojí 2 CP,
  // takže odvození „na kus" by Bělovlasovi dalo dvojnásobek proti ostatním rodům.
  const naCp = z.cp || 1;
  const des = (x, d) => Math.round(x * 10 ** d) / 10 ** d;
  const vystup = cfg.vystup || VELKA_VYSTUP;
  const kus = {
    power: 1, counters: null, cp, velka: true, rada: "clona", ini: 3,
    trainMult: 2, speed: 0.5,
    hp:  des(z.hp / naCp * cp * (cfg.vydrz || VELKA_VYDRZ), 0),
    dmg: des(z.dmg / naCp * cp * vystup, 1),
    atk: des(Math.max(0, z.atk - 1), 1),
    def: des(z.def + 2, 1),
    cost: Object.fromEntries(Object.entries(z.cost)
      .map(([r, v]) => [r, Math.round(v / naCp * cp * VELKA_CENA)])),
  };
  for (const k of ["name", "icon", "rada", "ini", "speed", "counters", "magic", "bonusVs",
                   "taunt", "tauntDef", "lifesteal", "aura", "zlato", "konverze"])
    if (cfg[k] !== undefined) kus[k] = cfg[k];
  return kus;
}

// zaklad = ze které jednotky rodu se odvozují staty (role vlajky)
const VELKE_DEFS = {
  aldar:   { name: "Jezdci na gryfech", icon: "🦅", cp: 25, zaklad: "arch",
             rada: "strelec", counters: "inf", ini: 10, speed: 1.6 },
  // taunt: kolik prvních kol drží formace na sobě pozornost mellee (změřeno
  // 30. 8.: vyrovnaná bitva trvá 7–8 kol, takže 3 kola = zhruba polovina)
  // Naměřeno 30. 8. na přejezdu 2,7× přesily (dobyto / ztráty útočníka):
  //   bez tauntu 24/24 · 281 | taunt 3 + obrana 15 % 24/24 · 828
  //   taunt 3 + obrana 25 % ... 0/24 · 860  ← ÚTES, ne efekt
  // Ta poslední kombinace pole ubrání VŽDY, protože bitva narazí na ROUND_CAP
  // a útok se počítá za odražený. Obranný bonus proto zůstává nízko: trol má
  // dobývání ZDRAŽIT (2,9×), ne ho zastavit. Ve vyrovnaném střetu taunt skoro
  // nic nemění (769 → 805) — je to daň za přejezd, ne páka na remízy.
  yllien:  { name: "Enti",              icon: "🌳", cp: 25, ini: 2, speed: 0.35, vydrz: 1.3,
             taunt: 3, tauntDef: 0.20 },
  durgar:  { name: "Trolové",           icon: "🧌", cp: 25, ini: 3, speed: 0.45,
             taunt: 3, tauntDef: 0.15 },
  brakkar: { name: "Železná garda",     icon: "🛡", cp: 2,  ini: 4, speed: 0.6, vydrz: 1.35 },
  sarn:    { name: "Bělovlasi",         icon: "🏇", cp: 25, zaklad: "cav",
             rada: "jizda", counters: "arch", ini: 999, speed: 1.15 },
  // Princ je vědomá výjimka z pravidla „výdrž, ne výstup“: umí obojí a platí
  // za to šílenstvím, které dopadá i na VLASTNÍ řady (viz aura níž)
  horda:   { name: "Démoní princové",   icon: "👿", cp: 100, ini: 5, speed: 0.7, vystup: 0.9,
             lifesteal: 0.30, aura: 25 },
  vhorren: { name: "Nekromanti",        icon: "🔮", cp: 4,  zaklad: "arch",
             rada: "strelec", counters: "inf", magic: true, ini: 6, speed: 0.8,
             konverze: 0.35 },
  // warboss sílí s pokladnicí: +1 % za každých 1 500 zlata, strop +40 %.
  // Strop je tam schválně, ať gryk není nejsilnější těsně po prodeji na tržnici.
  gryk:    { name: "Váleční náčelníci", icon: "👹", cp: 25, ini: 4, speed: 0.7,
             zlato: { za: 1500, max: 0.4 } },
};
for (const [fk, cfg] of Object.entries(VELKE_DEFS))
  FACTION_UNITS[fk].big = velkaJednotka(fk, cfg);

// vylepšovací budova a popis vlajky (stejný tvar jako u T1–T3)
Object.assign(UNIT_UPGRADES.aldar,   { big: "Gryfí hnízdo" });
Object.assign(UNIT_UPGRADES.yllien,  { big: "Prastarý háj" });
Object.assign(UNIT_UPGRADES.durgar,  { big: "Trolí sluj" });
Object.assign(UNIT_UPGRADES.horda,   { big: "Brána propasti" });
Object.assign(UNIT_UPGRADES.brakkar, { big: "Síň předků" });
Object.assign(UNIT_UPGRADES.sarn,    { big: "Bělovlasý dvorec" });
Object.assign(UNIT_UPGRADES.vhorren, { big: "Černá katedra" });
Object.assign(UNIT_UPGRADES.gryk,    { big: "Doupě náčelníků" });

// Popisy MUSÍ sedět s tím, co jednotka opravdu dělá — hráč je čte v panelu
// Výcviku a podle nich se rozhoduje, co si postaví.
const VELKE_POPISY = {
  aldar:   ["Střemhlavý nálet", "střelec, který jedná dřív než jízda a clona ho nezastaví"],
  yllien:  ["Kořeny hvozdu",    "3 kola drží na sobě pozornost útoku a schytává o 20 % míň"],
  durgar:  ["Kamenná kůže",     "3 kola drží na sobě pozornost útoku a schytává o 15 % míň"],
  horda:   ["Propastní krev",   "léčí se z uděleného poškození; aura šílenství 25 % na slabší formace — I VLASTNÍ"],
  brakkar: ["Štítová zeď",      "levná vlajka: 2 CP za kus, zato se nedá prokousat"],
  sarn:    ["Bílá vichřice",    "v každém kole udeří jako první ze všech formací"],
  vhorren: ["Slovo z hrobu",    "magické poškození obchází útok i obranu; pobité obrací na svou stranu do konce bitvy"],
  gryk:    ["Řev náčelníka",    "těžká clona roje; síla roste s pokladnicí rodu (až +40 %)"],
};
for (const [fk, [name, desc]] of Object.entries(VELKE_POPISY))
  Object.assign(UNIT_PASSIVES[fk], { big: { name, desc } });

// ---------- TŘI FORMACE (rozhodnutí uživatele 30. 8.) ----------
// Rod má víc druhů jednotek než formací. Armáda je pořád mapa druh→počet, ale
// smí mít nejvýš FORMACI_MAX nenulových druhů — tři sloty, do kterých si hráč
// PŘETÁHNE, co má vycvičené. Roster tím může růst donekonečna (T4, T5, žoldnéři,
// druhý rod z IV-O) a bitva zůstane čitelná: pořád tři formace.
//
// Trojúhelník převah proto NENÍ na slotu, ale na DRUHU (counters míří na klíč
// jednotky), takže platí, ať si hráč jednotku strčí do kteréhokoli slotu.
// ---------- KOLIK HRÁČŮ SVĚT UŽIVÍ (v0.52) ----------
// Do v0.52 se kapacita sezóny měřila tím, kolik se do výseče vejde MĚST 3×3.
// To je ale jiná otázka než „kolik zbude země". Naměřeno:
//
//   svět      výseč   měst/frakci   polí na hráče
//   69×69       558            30              18
//   111×111   1 414           100              14
//   221×221   5 460           448              12
//
// Strop území přitom začíná na STROP_BASE (80) polích NA HRÁČE, takže hráč měl
// nárok na 80 polí a v celé své výseči jich na něj vycházelo 18 — a zvětšení
// mapy to nespravilo, protože města se pakují pořád stejně hustě. Kapacita se
// proto počítá ze ZEMĚ, ne z měst (města jsou vždy ~6× volnější podmínka).
//
// Výseč jedné frakce je stabilně ~11 % světa (naměřeno 0,1114–0,1172 na
// R 34–130); bere se konzervativních 0,110, aby se kapacita spíš podcenila.
const VYSEC_PODIL = 0.110;
const CIL_POLI_NA_HRACE = 80;    // = STROP_BASE, ať slíbený strop dává smysl
const MAP_R_MIN = 34;            // 69×69 — nejmenší svět, na kterém se testuje
// ETAPA 11b: strop zvednutý z 461×461 na 1459×1459 — DESETINÁSOBEK PLOCHY
// a desetinásobek hráčů. Do etapy 11b ho držel TIK: AI hledala cíle průchodem
// celého světa, tickWorld obcházel každé pole kvůli hrstce odpočtů a server
// otiskoval celou mapu kvůli deltě. Nic z toho už nezávisí na velikosti světa.
//
// Naměřeno (vývojový stroj; ostrý VPS je 7–10× pomalejší):
//
//   mapa        polí       generátor  200 měst  TIK      paměť   hráčů
//   461×461     212 521      0,5 s      7 ms     8,4 ms    33 MB   2 336
//   1459×1459   2 128 681    7,3 s      9 ms    29,8 ms   360 MB  23 408
//   2071×2071   4 289 041   17,1 s      9 ms    51,7 ms   724 MB  47 176
//   2917×2917   8 508 889   36,4 s     13 ms    83,2 ms  1 454 MB 93 592
//
// Strop teď drží PAMĚŤ, ne tik: ostrý VPS má 2 GB, takže 1459×1459 (360 MB)
// sedí pohodlně, 2071×2071 (724 MB + rozbalený snímek při startu) by bylo
// na hraně a 2917×2917 se tam nevejde vůbec. Na stroji se 4 GB jde zvednout
// na 1035 beze změny kódu — je to jedno číslo.
const MAP_R_MAX = 729;           // 1459×1459, cca 23 400 hráčů (2 926 na frakci)

// kolik hráčů uveze JEDNA frakce na světě poloměru R
function hracuNaFrakci(R) {
  const poli = (2 * R + 1) ** 2;
  return Math.max(1, Math.floor(poli * VYSEC_PODIL / CIL_POLI_NA_HRACE));
}
// nejmenší svět, na kterém dostane každý hráč frakce svých CIL_POLI_NA_HRACE
function velikostProPocet(hracuNaFrakciCil) {
  const n = Math.max(1, hracuNaFrakciCil | 0);
  const strana = Math.sqrt(n * CIL_POLI_NA_HRACE / VYSEC_PODIL);
  return Math.min(MAP_R_MAX, Math.max(MAP_R_MIN, Math.ceil((strana - 1) / 2)));
}

// IV-O: akademie dává +100 velení za úroveň (deset úrovní = +1 000 CP,
// tedy +19 % ke stropu 5 179). Před rebase to bylo +1, což po přepočtu
// znamenalo +0,2 % — mrtvá budova.
const AKADEMIE_CAP = 100;

// ---------- DRUHÝ ROD (IV-O) ----------
// Na 8. úrovni hlavní budovy si hráč jednou za sezónu vybere spřátelený rod
// a smí verbovat jeho ZÁKLADNÍ jednotky. Rozhodnuto 30. 8.:
//   · jen z vlastní STRANY (precedens: Síň hrdinů je cross-frakční po straně),
//   · jen základní jednotky, NE cizí vlajku (ta je duše rodu),
//   · volba je na celou sezónu a nedá se změnit.
const DRUHY_ROD_MAIN = 8;
function lzeVybratDruhyRod(faction) {
  return !faction.druhyRod && (faction.buildings.main || 0) >= DRUHY_ROD_MAIN;
}
function nabidkaDruhehoRodu(faction) {
  const moje = sideOfFaction(faction.key);
  return FACTION_DEFS.filter(d => d.key !== faction.key && sideOfFaction(d.key) === moje)
    .map(d => d.key);
}
function zvolDruhyRod(faction, fkey) {
  if (!lzeVybratDruhyRod(faction)) return false;
  if (!nabidkaDruhehoRodu(faction).includes(fkey)) return false;
  faction.druhyRod = fkey;
  addLog(faction.id, { klic: "kron.druhy.rod", param: { rod: faction.name, spojenec: FACTION_DEFS.find(d => d.key === fkey).name } });
  return true;
}

const FORMACI_MAX = 3;
// Stav uložený před v0.52 nezná slot "big". Po obnově sezóny nebo po snímku
// z počítače se starší verzí se armády doplní na plný tvar — jinak by
// chybějící slot tekl aritmetikou jako undefined.
function dopl(a) { if (a) for (const k of UNIT_KEYS) if (typeof a[k] !== "number") a[k] = 0; return a; }
function normalizujArmady(G) {
  if (!G || !G.factions) return G;
  for (const f of G.factions) {
    for (const a of [f, ...((f && f.clenove) || [])]) {
      if (!a) continue;
      dopl(a.units); dopl(a.upgrades);
      for (const h of a.heroes || []) { dopl(h.army); if (h.preset) dopl(h.preset); }
      for (const m of a.marches || []) dopl(m.army);
    }
  }
  if (G.tiles) for (const t of (G.tiles.values ? G.tiles.values() : []))
    if (t && t.outpost) dopl(t.outpost);
  return G;
}
function pocetFormaci(army) {
  let n = 0;
  for (const k of UNIT_KEYS) if ((army[k] || 0) > 0) n++;
  return n;
}
function lzeSestavit(army) { return pocetFormaci(army) <= FORMACI_MAX; }

// ×8 spolu s budovami (30. 8. 2026) — vylepšení sedí ve stejném panelu a při
// starých cenách by vedle nich vypadalo jako drobné. AI je staví do úrovně 2.
const UPGRADE_COST = [null, { iron: 1200, gold: 1600 }, { iron: 2800, gold: 3600 }];
const UPGRADE_TIME = [null, 40, 60];
const UPGRADE_MAX = 2;

function unitPowerMult(f, type) { return f ? 1 + 0.10 * (f.upgrades[type] || 0) : 1; }
function passiveScale(f, type) { return f && (f.upgrades[type] || 0) >= 2 ? 1.5 : 1; }

// výnos už neurčuje terén, ale stupeň pole (TIER_YIELD) a přiřazená surovina
// (t.res) — terén dává jen vzhled, průchodnost a obranný bonus
const TERRAIN = {
  plains: { name: "Pláně",  color: "#8fae5f", income: {}, passable: true,  defBonus: 1.0 },
  forest: { name: "Hvozd",  color: "#4e7d46", income: {}, passable: true,  defBonus: 1.15 },
  hills:  { name: "Kopce",  color: "#9b8a6b", income: {}, passable: true,  defBonus: 1.3 },
  water:  { name: "Řeka",   color: "#4f7fa8", income: {},          passable: false, defBonus: 1.0 },
  ruins:  { name: "Ruiny",  color: "#7d7387", income: {},          passable: true,  defBonus: 1.5 },
  bridge: { name: "Most",   color: "#4f7fa8", income: {},          passable: true,  defBonus: 1.3 },
  wall:   { name: "Hradby", color: "#6b655c", income: {},          passable: false, defBonus: 1.0 },
};

// neutrální posádka je dána POUZE úrovní pole (1–5) — vždy stejná síla
// neutrální posádka je dána POUZE stupněm pole (index 1–12) — vždy stejná síla
const LEVEL_GARRISON = [0, ...TIER_GARRISON];

const STRUCTURES = {
  capital:  { name: "Hlavní město",   score: 30,  militia: 3337 },
  city:     { name: "Svobodné město", score: 20,  militia: 1446 },
  throne:   { name: "Trůnní město",   score: 200, militia: 6674 },
  bridge:   { name: "Most",           score: 8,   militia: 2781 },  // v0.40: brána přes řeku, 2 armády po 250
  fortress: { name: "Pevnost",        score: 20,  militia: 2781 },  // brána vnitřních hradeb
  grandfort: { name: "Velká pevnost", score: 50,  militia: 4032 },  // srdce vnějšího prstence (síla 500)
  bastion:  { name: "Bašta",          score: 20,  militia: 2419 },  // rameno velké pevnosti (síla 300)
  outpost:  { name: "Výspa",          score: 8,   militia: 0 },    // hráčská stavba za kámen
  // KEEP KRAJE (etapa 7, IV-C): jeden na kraj, 5×5, uprostřed sporného pásu.
  // Kdo ho drží, drží celý kraj. Posádka je ~3× velká pevnost — sólo se
  // nedá vzít na jeden zátah, ale s OKNEM ZRANĚNÍ (60 min, postup se sčítá)
  // ho skupina rozebere. To je celá raid smyčka etapy 7.
  keep:     { name: "Keep kraje",     score: 80,  militia: 12000 },
  // KLANOVÁ PEVNOST (etapa 8, IV-B): staví ji důstojník na vlastněném uzlu 2×2.
  // Posádku nemá — brání ji hrdinové klanu, co v ní stojí. Je to shromaždiště
  // a vysílač dosahu, ne opevnění.
  klanpevnost: { name: "Klanová pevnost", score: 40, militia: 0 },
};

// ai: osobnost frakce — aggression škáluje chuť útočit (i na hráče),
// trust ochotu přistoupit na pakt o neútočení
const FACTION_DEFS = [
  { key: "aldar",  name: "Aldarské království", race: "Lidé",               color: "#4d8fe0",
    desc: "+25 % jídla", incomeMult: { food: 1.25 }, attackMult: 1.0,
    ai: { aggression: 0.9, trust: 1.25, mood: "rozvážní diplomaté" } },
  { key: "yllien", name: "Tichý sněm Yllienu",  race: "Ylliové — elfové",   color: "#3fbfa8",
    desc: "+50 % dřeva z hvozdů", incomeMult: { wood: 1.5 }, attackMult: 1.0,
    ai: { aggression: 0.8, trust: 1.0, mood: "vyčkávaví oportunisté" } },
  { key: "durgar", name: "Durgarská držba",     race: "Durgarové — orkové", color: "#e0913d",
    desc: "+50 % zlata", incomeMult: { gold: 1.5 }, attackMult: 1.0,
    ai: { aggression: 1.05, trust: 0.85, mood: "tvrdohlaví obchodníci" } },
  { key: "horda",  name: "Popelná horda",       race: "Šarakhové — démoni", color: "#d5504a",
    desc: "+15 % síly v útoku", incomeMult: {}, attackMult: 1.15,
    ai: { aggression: 1.35, trust: 0.5, mood: "nenasytní dobyvatelé" } },
  // ---- nové rody (v0.23, dle papírové tabulky v DESIGN.md) ----
  { key: "brakkar", name: "Brakkarská hlubina", race: "Brakkarové — trpaslíci", color: "#9aa3ad",
    desc: "+50 % kamene, pomalí a nezlomní", incomeMult: { stone: 1.5 }, attackMult: 1.0,
    ai: { aggression: 0.7, trust: 1.1, mood: "trpěliví horalé" } },
  { key: "sarn", name: "Sarnské klany", race: "Sarnové — jezdci stepí", color: "#c9b458",
    desc: "+25 % jídla, vše v sedle", incomeMult: { food: 1.25 }, attackMult: 1.0,
    ai: { aggression: 1.15, trust: 0.95, mood: "nespoutaní nájezdníci" } },
  { key: "vhorren", name: "Bezesná říše Vhorren", race: "Vhorrenové — nemrtví", color: "#9b86c9",
    desc: "padlí vstávají, mágové místo střelců", incomeMult: {}, attackMult: 1.0,
    ai: { aggression: 1.0, trust: 0.7, mood: "chladní počtáři" } },
  { key: "gryk", name: "Grycký roj", race: "Grykové — skřeti", color: "#8fae3f",
    desc: "+20 % všech surovin, levné množství",
    incomeMult: { food: 1.2, wood: 1.2, stone: 1.2, iron: 1.2, gold: 1.2 }, attackMult: 1.0,
    ai: { aggression: 1.2, trust: 0.6, mood: "hladový roj" } },
];

// 8 kapitálů na Manhattan M = 2×OUTER_R, dvojice souřadnic (M−c, c) s
// c = WALL_R+1 — při výchozí mapě přesně dnešní (±23,±9)/(±9,±23).
// POŘADÍ = id frakce = index do REGION_NAMES i FACTION_DEFS — neměnit!
function stavKapitaly(M, c) {
  const v = M - c;
  return [
    { q: v, r: c },    // aldar
    { q: c, r: v },    // yllien
    { q: -v, r: -c },  // durgar
    { q: -c, r: -v },  // horda
    { q: -c, r: v },   // brakkar
    { q: v, r: -c },   // sarn
    { q: -v, r: c },   // vhorren
    { q: c, r: -v },   // gryk
  ];
}
let CAPITAL_POS = stavKapitaly(2 * OUTER_R, WALL_R + 1);

// ---------- Strany dobra a zla (v0.9) ----------
// Vellar je rozdělen: Aldarské království a Yllien stojí na straně dobra,
// Popelná horda s Durgarskou držbou na straně zla. Truhly i výbava mají
// afinitu ke straně — hrdina smí nosit jen výbavu své strany.
const FACTION_SIDE = { aldar: "dobro", yllien: "dobro", brakkar: "dobro", sarn: "dobro",
  durgar: "zlo", horda: "zlo", vhorren: "zlo", gryk: "zlo" };
// STRANY SE JMENUJÍ SUNBORN A ASHEN (zadání uživatele 30. 8. 2026).
// „dobro"/„zlo" byly placeholdery z prototypu; Vellar má vlastní jména.
//
// ⚠ KLÍČE ZŮSTÁVAJÍ "dobro"/"zlo" A NESMÍ SE MĚNIT. Sedí v ÚČTECH hráčů:
// každý kus výbavy nese `item.side`, truhly mají `sideName` per klíč,
// `sigOdemceno` i `heroUnlocks` se plní podle strany. Přejmenovat klíč by
// znamenalo migraci všech účtů — a kdo by ji nedostal, přišel by o výbavu
// své strany (equipItem cizí stranu odmítá). Mění se proto jen NÁZVY.
//
// gen = 2. pád, aby šlo psát „výbava … Sunbornů" bez ohýbání v UI
const SIDES = {
  dobro: { name: "Sunborn", gen: "Sunbornů", icon: "☀", color: "#e5cf7a",
    desc: "Aldar, Yllien, Brakkarská hlubina a Sarnské klany" },
  zlo:   { name: "Ashen", gen: "Ashenů", icon: "🔥", color: "#e06a4d",
    desc: "Horda, Durgar, Bezesná říše a Grycký roj" },
};
function sideOfFaction(fkey) { return FACTION_SIDE[fkey] || "dobro"; }

// ---------- Tiery hrdinů (v0.9) ----------
// Vzácnost získání (dárky, odemykání), NE síla — staty tier nemění.
// V každé frakci 3 běžní / 2 epičtí / 1 legendární podle rysu.
// Do etapy 6 byl tier daný VÝHRADNĚ rysem, takže legendární hrdina byl v každém
// rodu mystik a roster byl „jeden od každého rysu". IV-H to obrací:
// LEGENDÁRNÍ HRDINA JE ARCHETYP RODU — aldarský štítonoš, sarnský jezdec,
// brakkarský ranhojič. Zbytek tabulky slouží jako záloha pro rody bez záznamu.
const HERO_TIER_BY_TRAIT = { swift: 0, shield: 0, tireless: 0, healer: 0, attack: 1, warlord: 1, mystic: 2 };
// POZOR: rys STARTOVNÍHO hrdiny musí zůstat BĚŽNÝ. Startera dostává hráč
// zdarma při první hře s rodem, takže legendárka na jeho rysu by rozdávala
// zadarmo to, co jinak stojí ~1 400 truhel. Legendárka je proto vrchol rodu
// MEZI NESTARTOVNÍMI hrdiny — ne rys, kterým rod začíná.
const HERO_TIER_BY_ROD = {
  aldar:   { leg: "warlord", epic: ["mystic", "attack"] },   // korouhev království (starter: shield)
  yllien:  { leg: "mystic",  epic: ["attack", "warlord"] },  // hvězdný šepot (starter: swift)
  durgar:  { leg: "attack",  epic: ["warlord", "shield"] },  // kladivo obléhatelů (starter: tireless)
  horda:   { leg: "mystic",  epic: ["attack", "warlord"] },  // plamenný prorok (starter: swift)
  brakkar: { leg: "healer",  epic: ["shield", "warlord"] },  // želva, co se hojí (starter: tireless)
  sarn:    { leg: "warlord", epic: ["attack", "mystic"] },   // chán stepí (starter: swift)
  vhorren: { leg: "mystic",  epic: ["attack", "warlord"] },  // lich nekropole (starter: tireless)
  gryk:    { leg: "warlord", epic: ["attack", "mystic"] },   // náčelník roje (starter: tireless)
};
// reprezentativní rys tieru pro JMÉNO a IKONU daru (skupiny darů jsou
// fkey:t<tier>, viz v0.44) — odvozuje se z rodu, ne z pevné trojice
function giftTierTrait(fkey, tier) {
  const r = HERO_TIER_BY_ROD[fkey];
  if (!r) return GIFT_TIER_TRAIT[tier] || GIFT_TIER_TRAIT[0];
  if (tier === 2) return r.leg;
  if (tier === 1) return r.epic[0];
  const bezny = (HERO_DEFS[fkey] || []).find(h =>
    h.trait !== r.leg && !r.epic.includes(h.trait));
  return bezny ? bezny.trait : GIFT_TIER_TRAIT[0];
}
const HERO_TIERS = [
  { key: "common",    name: "Běžný",       color: "#9aa5b1" },
  { key: "epic",      name: "Epický",      color: "#b06ae0" },
  { key: "legendary", name: "Legendární",  color: "#e0b13d" },
];
function heroTierOf(fkey, defIdx) {
  const def = HERO_DEFS[fkey] && HERO_DEFS[fkey][defIdx];
  if (!def) return 0;
  const r = HERO_TIER_BY_ROD[fkey];
  if (r) {
    if (def.trait === r.leg) return 2;
    if (r.epic.includes(def.trait)) return 1;
    return 0;
  }
  return HERO_TIER_BY_TRAIT[def.trait] || 0;
}

// bonusy rysů jsou vyjádřené ve statech: 1 bod útoku/obrany ≈ 5 % poškození
const HERO_TRAITS = {
  attack:   { name: "Útočník",   desc: "+3 útoku",                          atk: 3 },
  swift:    { name: "Rychlý",    desc: "−25 % času pochodu, +2 rychlosti",  time: 0.75, speed: 2 },
  shield:   { name: "Ochránce",  desc: "+4 obrany",                         def: 4 },
  tireless: { name: "Neúnavný",  desc: "+60 % obnovy výdrže, +40 životů",   regen: 1.6, hp: 40 },
  warlord:  { name: "Vojevůdce", desc: "+100 velených jednotek, +6 poškození", cap: 100, dmg: 6 },
  mystic:   { name: "Mystik",    desc: "kouzla: 15 poškození přímo do životů nepřátel každé kolo", spell: 15 },
  // IV-H: ranhojič léčí ARMÁDU v průběhu bitvy. Samotné léčení sedí ve stromu
  // a v mistrovských bonusech (roundHeal existuje od v0.28) — rys sám dává
  // výdrž, stejně jako u ostatních rysů drží tabulka jen ploché staty.
  healer:   { name: "Ranhojič",  desc: "+50 životů, +40 % obnovy výdrže; jeho strom léčí armádu přímo v boji", hp: 50, regen: 1.4 },
};

// základní staty hrdiny (životy, útok, poškození za kolo, obrana, rychlost).
// Fáze 3: strop úrovní 30 — per-level přírůstky zploštěné tak, aby úroveň 30
// odpovídala staré desítce (kapitán domobrany používá jen base, spodek křivky
// dobývání se nehýbe)
const HERO_HP_BASE = 100, HERO_HP_PER_LEVEL = 3.5;
const HERO_ATK_BASE = 2,  HERO_ATK_PER_LEVEL = 0.09;
const HERO_DEF_BASE = 2,  HERO_DEF_PER_LEVEL = 0.09;
const HERO_DMG_BASE = 8,  HERO_DMG_PER_LEVEL = 0.6;
const HERO_SPEED_BASE = 5;
const HERO_HEAL_FRAC = 0.015;   // léčení mimo boj: podíl max životů za tik

// Velení: kolik CP hrdina uvede. ETAPA 6 přepsala měřítko z 935 na ~5 200 CP
// na úrovni 50 — teprve s pěti tisíci dává smysl vézt 52 Demon Princů po
// 100 CP nebo 5 200 pěšáků po jednom.
//
// Škáluje se CELÁ KŘIVKA ×5,5615 (200+15/úr → 1112+83/úr), ne jen její vrchol.
// Plán píše „základ 200 + 100 za úroveň", ale o kus dál varuje, že rebase je
// „buď se všechno přepočítá 5,5×" — a to platí i tady: posádky vzrostly ×5,56
// na KAŽDÉM stupni, takže velení musí taky, jinak je hrdina na nízké úrovni
// proti poli relativně 3,7× slabší než před etapou 6. Změřeno na simu 8 seedů:
// se strmou křivkou (300+100/úr) drží svět 420 polí, s plochou 539 (před
// rebase 519) a nikdo neuvízne mimo dosah Trůnu.
// KŘIVKA VELENÍ (v0.63, zadání uživatele): 300 CP na 1. úrovni a +100 za každou
// další. Do v0.62 to bylo 1 112 + 83, což byla PLOCHÁ křivka — celé měřítko
// z etapy 6 se přeškálovalo jedním koeficientem, takže hrdina 1. úrovně vezl
// 1 112 CP a hned na startu dobyl pole ⚔60 prakticky bez ztrát. Progres tím
// neměl kde vzniknout.
//
// Nová křivka je STRMÁ: vrchol zůstává (úr. 50 = 5 200 ≈ dřívějších 5 179),
// takže keepy, brány prstence ani vlajkové jednotky se nepřepočítávají —
// mění se jen to, jak slabě se začíná. Proti posádkám to vychází přesně na
// zadání „⚔1 lehké, ⚔10 předpokládané, ⚔15 obtížnější":
//
//   ⚔1   17 obránců → potřeba ~34 CP    (z 300 hračka)
//   ⚔10  56          → ~112             (pohodlné)
//   ⚔15  167         → ~334             (nevejde se, chce posily nebo úroveň)
//   ⚔30  306         → ~612             (mimo dosah)
//   ⚔60  473         → ~946             (dvakrát mimo — a o to šlo)
const HERO_CAP_BASE = 300;
const HERO_CAP_PER_LEVEL = 100;

// hvězdy velitele — druhá osa progrese (trvalá, přežívá sezóny na účtu):
// každá hvězda +4 % k hlavním statům (životy/útok/obrana/poškození/kouzla),
// +25 velených jednotek a +1 bod dovedností; povýšení hrdinu uzdraví.
// Hvězdy se NEKUPUJÍ za 💠 — plní se dárky hrdiny (respekt) z truhel:
// hvězda n stojí 10/12/15/17/20… dárků (střídavě +2/+3, 25. hvězda 70);
// 1. hvězda hrdinu zároveň odemyká (zamčení hrdinové, v0.9)
const HERO_MAX_STARS = 25;
const STAR_STAT_BONUS = 0.04;
// IV-H: TIER JE OSA SÍLY. Do etapy 6 tier ovlivňoval VÝHRADNĚ cenu hvězd
// a šanci z truhly — na staty neměl vliv žádný, takže „legendární hrdina"
// byl jen dražší, ne lepší. Nově +5 % základu za stupeň (epický ×1,05,
// legendární ×1,10). Násobí se stejně jako hvězdy, takže se to nemine
// s výbavou ani s dovednostmi.
const TIER_STAT_BONUS = 0.05;
const STAR_CAP_BONUS = 25;
const STAR_SKILL_POINT = 1;   // bod dovedností za každou hvězdu

// IV-H: SEZÓNNÍ JE SÍLA, TRVALÁ JE SBÍRKA.
// Do etapy 6 přecházela mezi sezónami i ÚROVEŇ — veterán začínal novou sezónu
// na třicítce a nový hráč na jedničce, což je přesně ten rozdíl, který se
// z dlouhodobé hry nedá dohnat. Nově se na začátku sezóny hrdinům nuluje
// úroveň, zkušenosti, dovednosti i body z úrovní; HVĚZDY ODDANOSTI, ODEMČENÍ
// A VÝBAVA zůstávají na účtu, protože to je sbírka, ne síla.
//
// Body za hvězdy zůstávají (jsou součást sbírky), body za úrovně padají —
// proto se skillPts nastavuje na hvězdy × STAR_SKILL_POINT, ne na nulu.
function resetSezonyUctu(acc) {
  if (!acc || !acc.heroProgress) return acc;
  for (const key in acc.heroProgress) {
    const p = acc.heroProgress[key];
    p.level = 1;
    p.xp = 0;
    p.skills = {};
    p.skillPts = (p.stars || 0) * STAR_SKILL_POINT;
  }
  return acc;
}

// v0.44: HODNOTA DÁRKU roste s tierem (dřív měl každý dárek 10 oddanosti a
// vzácnost nesla cenovka). Nově je to obráceně: vyšší tier potřebuje MÍŇ kusů,
// ale jeho dárky padají vzácněji — vzácnost tak nese drop, ne cenovka.
const GIFT_RESPECT_BY_TIER = [10, 100, 300];
const GIFT_RESPECT = GIFT_RESPECT_BY_TIER[0];   // zpětná kompatibilita čtecích míst
function giftRespectFor(tier) { return GIFT_RESPECT_BY_TIER[tier] ?? GIFT_RESPECT_BY_TIER[0]; }

// Cena hvězdy v KUSECH dárků. Odemčení (1. hvězda) stojí VŽDY 30 kusů bez
// ohledu na tier; od druhé hvězdy jede původní tvar křivky (10/12/15/17/20…)
// přeškálovaný tak, aby 2. hvězda vyšla na 10 / 7 / 5 kusů.
const UNLOCK_GIFTS = 30;
const STAR2_GIFTS = [10, 7, 5];
const giftBaseCurve = n => 10 + Math.floor((n - 1) / 2) * 5 + ((n - 1) % 2) * 2;
function giftCostForStar(n, tier = 0) {
  if (n <= 1) return UNLOCK_GIFTS;
  const m = (STAR2_GIFTS[tier] ?? STAR2_GIFTS[0]) / giftBaseCurve(2);
  return Math.max(1, Math.round(giftBaseCurve(n) * m));
}
function respectForStar(n, tier = 0) { return giftCostForStar(n, tier) * giftRespectFor(tier); }

// ---------- SKUPINY DÁRKŮ (v0.44) ----------
// Dárek už nepatří jednomu hrdinovi, ale RODU A TIERU: „epický dar Popelné
// hordy" nakrmí kteréhokoli epického hrdinu hordy. Sbírka se tím zlikvidnila
// (místo 48 mikro-měn máme 24) a mrtvý drop zmizel úplně — dárek se dá vždycky
// někam dát. Klíč skupiny má tvar `fkey:t<tier>`, aby se nepletl s klíčem
// hrdiny `fkey:idx`.
const GIFT_TIER_TRAIT = ["swift", "attack", "mystic"];  // reprezentant tieru pro jméno a ikonu
const GIFT_TIER_NAME = ["Běžný", "Epický", "Legendární"];
function giftGroupKey(fkey, tier) { return fkey + ":t" + tier; }
function jeSkupinaDarku(key) { return typeof key === "string" && /:t\d+$/.test(key); }
function rozborSkupiny(key) {
  const [fkey, t] = String(key).split(":t");
  return { fkey, tier: parseInt(t, 10) || 0 };
}
// skupina, do které patří dárek daného hrdiny
function giftGroupOfHero(heroKey) {
  const [fkey, idxS] = String(heroKey).split(":");
  return giftGroupKey(fkey, heroTierOf(fkey, parseInt(idxS, 10)));
}
// jméno a ikona skupiny — bere se z reprezentativního rysu tieru, takže
// zůstávají vellarská jména, která hráč zná z v0.27
function giftNameForGroup(fkey, tier) {
  const trait = giftTierTrait(fkey, tier);
  return { name: (GIFT_NAMES[fkey] || {})[trait] || "Dárek",
    icon: GIFT_ICON_BY_TRAIT[trait] || "🎁" };
}
// jednotné čtení pro obojí: klíč hrdiny i klíč skupiny
function giftNameOf(key) {
  if (jeSkupinaDarku(key)) { const s = rozborSkupiny(key); return giftNameForGroup(s.fkey, s.tier); }
  const [fkey, idxS] = String(key).split(":");
  return giftNameFor(fkey, parseInt(idxS, 10));
}
// hrdinové, které daná skupina umí nakrmit
function hrdinoveSkupiny(key) {
  const { fkey, tier } = rozborSkupiny(key);
  return (HERO_DEFS[fkey] || []).map((hd, i) => ({ fkey, idx: i, hd, key: fkey + ":" + i }))
    .filter(h => heroTierOf(fkey, h.idx) === tier);
}

// vellarská jména dárků: každý hrdina má svůj tematický dárek (dle rodu a rysu)
const GIFT_ICON_BY_TRAIT = { healer: "🌿", swift: "🪶", attack: "🗡", shield: "🛡",
  tireless: "🍞", warlord: "🚩", mystic: "✨" };
const GIFT_NAMES = {
  aldar:   { swift: "Jezdecké ostruhy", attack: "Turnajová stuha", shield: "Štítový erb",
             tireless: "Poutnický chléb", warlord: "Korouhev rodu", mystic: "Svěcený olej", healer: "Léčivá mast" },
  yllien:  { swift: "Sokolí pero", attack: "Šíp z hvozdu", shield: "Listová spona",
             tireless: "Medový suchar", warlord: "Větevní roh", mystic: "Měsíční rosa", healer: "Lístek hojivce" },
  brakkar: { swift: "Kozlí podkova", attack: "Runová sekerka", shield: "Žulový štítek",
             tireless: "Důlní lucerna", warlord: "Mistrovské kladívko", mystic: "Hlubinný krystal", healer: "Runový obklad" },
  sarn:    { swift: "Hříběcí ohlávka", attack: "Kostěný luk", shield: "Plstěný pancíř",
             tireless: "Sušené maso", warlord: "Náčelnický buben", mystic: "Šamanská tykev", healer: "Stepní balzám" },
  durgar:  { swift: "Okovaná bota", attack: "Zubatý tesák", shield: "Kotlový plát",
             tireless: "Černý příděl", warlord: "Válečný roh", mystic: "Strusková runa", healer: "Kostní dlaha" },
  horda:   { swift: "Uhlíkové křídlo", attack: "Žhnoucí dráp", shield: "Spečený krunýř",
             tireless: "Popelový chléb", warlord: "Ohnivá standarta", mystic: "Sirné kadidlo", healer: "Popelná tinktura" },
  vhorren: { swift: "Bledá svíce", attack: "Hrobní hřeb", shield: "Kostěný amulet",
             tireless: "Balzamový obvaz", warlord: "Pohřební prapor", mystic: "Lampa duší", healer: "Rubáš uzdravení" },
  gryk:    { swift: "Ukradená bota", attack: "Rezavý nožík", shield: "Poklice z kotle",
             tireless: "Houbová polívka", warlord: "Chechtavý totem", mystic: "Prašivý prsten", healer: "Žvýkaný obvaz" },
};
function giftNameFor(fkey, defIdx) {
  const trait = HERO_DEFS[fkey][defIdx].trait;
  return { name: (GIFT_NAMES[fkey] || {})[trait] || "Dárek",
    icon: GIFT_ICON_BY_TRAIT[trait] || "🎁" };
}

// tvar stromu dovedností (Audit 2): 4 hlavní dovednosti po 15 rancích, pod
// každou dvě větve s podřízenou dovedností po 7 rancích. Kapacita 116 bodů
// proti příjmu 74 (49 z úrovní + 25 z hvězd) — plný strom je záměrně mimo
// dosah. Hlavní se odemykají investovanými body, podřízené rankem rodiče.
const MAIN_MAX_RANK = 15;
const SUB_MAX_RANK = 7;
const SKILL_UNLOCK_MAIN = [0, 8, 18, 30];
const SUB_REQ = 3;            // výchozí rank rodiče pro odemčení větve
// v0.35: ODDANOST (♥ = hvězdy hrdiny) odemyká STROMY — po vzoru předlohy
// (clustery se štítky ♥3/♥5). R1 (čerstvě odemčený hrdina) má dva startovní
// stromy, ♥3 třetí, ♥5 čtvrtý; na ♥10 (R10) hrdina odemyká svůj SIGNATURE
// kus. Oddanost tak přestává být jen zdrojem bodů (rozhodnutí uživatele).
const STAR_UNLOCK_MAIN = [0, 0, 3, 5];
const SIG_STARS = 10;         // R10 — signature kus hrdiny (jednou navždy)

/* Mistrovské bonusy za plné naučení hlavní dovednosti (Audit 2, fáze B).
   Plných 15/15 odemyká bonus podle RYSU velitele — index je pořadí hlavní
   dovednosti (slot 0–3). Dekorátor je stampuje do `s.maxEff` všem hlavním
   uzlům, které nemají vlastní maxEff; slot 3 (vrcholná dovednost) ho má
   zpravidla vlastní — jedinečný odkaz na dřívější ultimátku — takže položka
   pro slot 3 slouží jako záloha.
   Podřízené dovednosti (větve) mistrovský bonus NEMAJÍ (hlídá to validátor). */
const TRAIT_MAX_EFFS = {
  attack:   [{ type: "atk", val: 1.5 },
             { type: "followUp", val: 15 },
             { type: "roundDmg", val: 35, targets: 2, timing: { round: 1 } },
             { type: "strike", val: 12 }],
  shield:   [{ type: "def", val: 1.5 },
             { type: "stunImmune", val: 1 },
             { type: "avoidCharge", val: 1 },
             { type: "holdDef", val: 20 }],
  swift:    [{ type: "spd", val: 1 },
             { type: "speed", val: 8 },
             { type: "fastReturn", val: 25 },
             { type: "instantReturn", val: 1 }],
  tireless: [{ type: "hp", val: 40 },
             { type: "regen", val: 25 },
             { type: "stam", val: 12 },
             { type: "noCooldown", val: 1 }],
  warlord:  [{ type: "cap", val: 50 },
             { type: "rally", val: 15 },
             { type: "roundArmy", val: 25, timing: { every: 3 } },
             { type: "dmg", val: 6 }],
  mystic:   [{ type: "spell", val: 8 },
             { type: "ward", val: 8 },
             { type: "stunChance", val: 8 },
             { type: "ignoreDef", val: 1 }],
  healer:   [{ type: "hp", val: 40 },
             { type: "heal", val: 25 },
             { type: "regen", val: 25 },
             { type: "roundHeal", val: 10, timing: { every: 2 } }],
};

/* Každý hrdina má unikátní strom o 12 uzlech (Audit 2): 4 hlavní dovednosti
   po 15 rancích (poslední je vrcholná, `ult: true`) a pod každou dvě větve
   s podřízenou dovedností po 7 rancích (`parent` + `branch`, bez maxEff).
   Pořadí v poli je závazné: nejdřív všechny hlavní, pak podřízené.
   Efekty (eff/effs) se sčítají přes ranky; typy zpracovává heroStats a boj:
   atk/def (body útoku a obrany, 1 bod ≈ 5 % poškození)/dmg (poškození hrdiny)/
   hp (životy hrdiny)/spell (kouzelné poškození přímo do životů)/ward (−% poškození
   od nepřátelských hrdinů a kouzel)/spd (rychlost v boji)/speed (čas pochodu)/
   regen/stam/stamCost/structAtk/holdDef/guardEff/heal/xp/gold/convoy/
   strike (eliminace nepřátel před bojem)/aura (oslabení útočníků poblíž)/
   rally/fastReturn/noCooldown/instantReturn/ignoreDef/winStam/
   stackAtk+stackDef (bonus rostoucí každým kolem)/followUp (šance na druhý úder)/
   stunChance (šance omráčit nepřátelského velitele na kolo)/stunImmune
   (imunita vůči omráčení; s cond.vsFaction jen proti dané frakci) */
const HERO_DEFS = {
  aldar: [
    { name: "Kaelen Ostříž", trait: "swift", tree: [
      { key: "oko",   name: "Jestřábí oko", max: 15, eff: { type: "speed", val: 1 },
        desc: "−1 % času pochodu za bod" },
      { key: "ztec",  name: "Jízdní zteč", max: 15, eff: { type: "unitDmg", val: 1.2, cond: { unit: "cav" } },
        desc: "jízda +1,2 % poškození za bod" },
      { key: "korist", name: "Nájezdník", max: 15, eff: { type: "gold", val: 0.25 },
        desc: "po dobytí +0,25 zlata × úroveň pole za bod" },
      { key: "kridla", name: "Křídla bouře", max: 15, ult: true, eff: { type: "spd", val: 0.2 },
        desc: "+0,2 rychlosti v boji za bod", maxEff: { type: "speed", val: 30 } },
      { key: "oko_a", name: "Lehký krok", max: 7, parent: "oko", branch: 0,
        eff: { type: "stamCost", val: 2.5 }, desc: "−2,5 % ceny výdrže pochodů za bod" },
      { key: "oko_b", name: "Dlouhé výpravy", max: 7, parent: "oko", branch: 1,
        eff: { type: "stam", val: 2.5 }, desc: "+2,5 maximální výdrže za bod" },
      { key: "ztec_a", name: "Průlom v čele", max: 7, parent: "ztec", branch: 0,
        eff: { type: "strike", val: 1.5 }, desc: "při střetu eliminuje 1,5 nepřítele za bod ještě před bojem" },
      { key: "ztec_b", name: "Jezdecký dril", max: 7, parent: "ztec", branch: 1,
        eff: { type: "cap", val: 9 }, desc: "+9 velených jednotek za bod" },
      { key: "korist_a", name: "Kořistníci", max: 7, parent: "korist", branch: 0,
        eff: { type: "gold", val: 0.3 }, desc: "po dobytí +0,3 zlata × úroveň pole za bod" },
      { key: "korist_b", name: "Zkušený zvěd", max: 7, parent: "korist", branch: 1,
        eff: { type: "xp", val: 3 }, desc: "+3 % zkušeností za bod" },
      { key: "kridla_a", name: "Neúnavní koně", max: 7, parent: "kridla", branch: 0,
        eff: { type: "fastReturn", val: 5 }, desc: "návrat z výprav o 5 % rychleji za bod" },
      { key: "kridla_b", name: "Vítr v zádech", max: 7, parent: "kridla", branch: 1,
        eff: { type: "regen", val: 4 }, desc: "+4 % obnovy výdrže za bod" },
    ] },
    { name: "Mara z Dubové tvrze", trait: "attack", tree: [
      { key: "zur",   name: "Zuřivost", max: 15, eff: { type: "atk", val: 0.2 },
        desc: "+0,2 útoku za bod" },
      { key: "uder",  name: "První úder", max: 15, eff: { type: "strike", val: 1.6 },
        desc: "při střetu eliminuje 1,6 nepřítele za bod ještě před bojem" },
      { key: "drt",   name: "Ohlušující úder", max: 15, eff: { type: "stunChance", val: 1.6 },
        desc: "1,6 % šance za bod omráčit nepřátelského velitele na kolo boje" },
      { key: "popravci", name: "Popravčí", max: 15, ult: true, eff: { type: "dmg", val: 0.8 },
        desc: "+0,8 poškození hrdiny za bod", maxEff: { type: "strike", val: 40 } },
      { key: "zur_a", name: "Zocelená ostří", max: 7, parent: "zur", branch: 0,
        eff: { type: "dmg", val: 1.3 }, desc: "+1,3 poškození hrdiny za bod" },
      { key: "zur_b", name: "Bojový instinkt", max: 7, parent: "zur", branch: 1,
        eff: { type: "spd", val: 0.15 }, desc: "+0,15 rychlosti v boji za bod" },
      { key: "uder_a", name: "Obávaná", max: 7, parent: "uder", branch: 0,
        eff: { type: "aura", val: 1.3 }, desc: "nepřátelé útočící v okolí Mary −1,3 % síly za bod" },
      { key: "uder_b", name: "Krvavá stopa", max: 7, parent: "uder", branch: 1,
        eff: { type: "heal", val: 2 }, desc: "po vítězství se 2 % ztrát za bod vrací do armády" },
      { key: "drt_a", name: "Těžká palice", max: 7, parent: "drt", branch: 0,
        eff: { type: "unitDmg", val: 1.8, cond: { unit: "inf" } }, desc: "pěchota +1,8 % poškození za bod" },
      { key: "drt_b", name: "Neúprosnost", max: 7, parent: "drt", branch: 1,
        eff: { type: "stam", val: 2 }, desc: "+2 maximální výdrže za bod" },
      { key: "popravci_a", name: "Lovkyně velitelů", max: 7, parent: "popravci", branch: 0,
        eff: { type: "followUp", val: 2.4 }, desc: "2,4 % šance za bod na navazující úder velitele (60 % poškození)" },
      { key: "popravci_b", name: "Válečná kořist", max: 7, parent: "popravci", branch: 1,
        eff: { type: "gold", val: 0.3 }, desc: "po dobytí +0,3 zlata × úroveň pole za bod" },
    ] },
    { name: "Edran Sirotčí král", trait: "shield", tree: [
      { key: "zakop", name: "Zákopnictví", max: 15, eff: { type: "stackDef", val: 0.11 },
        desc: "obrana strany roste o 0,11 každým kolem boje za bod (sčítá se)" },
      { key: "hradba", name: "Královská hradba", max: 15, eff: { type: "holdDef", val: 2 },
        desc: "+2 % obrany pole s Edranem za bod" },
      { key: "stit",  name: "Štítonoši", max: 15, eff: { type: "unitDmg", val: 1.2, cond: { unit: "inf" } },
        desc: "pěchota +1,2 % poškození za bod" },
      { key: "zed",   name: "Nezlomná zeď", max: 15, ult: true, eff: { type: "def", val: 0.2 },
        desc: "+0,2 obrany za bod", maxEff: { type: "holdDef", val: 35 } },
      { key: "zakop_a", name: "Palisády", max: 7, parent: "zakop", branch: 0,
        eff: { type: "def", val: 0.25 }, desc: "+0,25 obrany za bod" },
      { key: "zakop_b", name: "Věrná stráž", max: 7, parent: "zakop", branch: 1,
        eff: { type: "guardEff", val: 7 }, desc: "stráž čerpá o 7 % méně výdrže za bod" },
      { key: "hradba_a", name: "Zhouba Šarakhů", max: 7, parent: "hradba", branch: 0,
        eff: { type: "vsDmg", val: 2.5, cond: { vsFaction: "horda" } },
        desc: "proti Šarakhům +2,5 % poškození jednotek za bod" },
      { key: "hradba_b", name: "Kamenné základy", max: 7, parent: "hradba", branch: 1,
        eff: { type: "hp", val: 8 }, desc: "+8 životů hrdiny za bod" },
      { key: "stit_a", name: "Kopiníci v druhé řadě", max: 7, parent: "stit", branch: 0,
        eff: { type: "unitDmg", val: 1.8, cond: { unit: "cav" } }, desc: "jízda +1,8 % poškození za bod" },
      { key: "stit_b", name: "Polní kuchyně", max: 7, parent: "stit", branch: 1,
        eff: { type: "stam", val: 2 }, desc: "+2 maximální výdrže za bod" },
      { key: "zed_a", name: "Hradní zásoby", max: 7, parent: "zed", branch: 0,
        eff: { type: "convoy", val: 3 }, desc: "posily k Edranovi jdou o 3 % rychleji za bod" },
      { key: "zed_b", name: "Neochvějnost", max: 7, parent: "zed", branch: 1,
        eff: { type: "ward", val: 2 }, desc: "−2 % poškození od nepřátelských hrdinů a kouzel za bod" },
    ] },
    { name: "Ysra Železná", trait: "tireless", tree: [
      { key: "dech",  name: "Druhý dech", max: 15, eff: { type: "regen", val: 4.8 },
        desc: "+4,8 % obnovy výdrže za bod" },
      { key: "vule",  name: "Železná vůle", max: 15, eff: { type: "stam", val: 1.6 },
        desc: "+1,6 maximální výdrže za bod" },
      { key: "otuz",  name: "Otužilost", max: 15, eff: { type: "hp", val: 4 },
        desc: "+4 životů hrdiny za bod" },
      { key: "neunavna", name: "Neúnavná", max: 15, ult: true, eff: { type: "heal", val: 0.8 },
        desc: "po vítězství se 0,8 % ztrát za bod vrací do armády",
        maxEff: { type: "noCooldown", val: 1 } },
      { key: "dech_a", name: "Polní lazaret", max: 7, parent: "dech", branch: 0,
        eff: { type: "heal", val: 2.5 }, desc: "po vítězství se 2,5 % ztrát za bod vrací do armády" },
      { key: "dech_b", name: "Pochodová píseň", max: 7, parent: "dech", branch: 1,
        eff: { type: "stamCost", val: 2 }, desc: "−2 % ceny výdrže pochodů za bod" },
      { key: "vule_a", name: "Nezlomný kořen", max: 7, parent: "vule", branch: 0,
        eff: { type: "ward", val: 2 }, desc: "−2 % poškození od nepřátelských hrdinů a kouzel za bod" },
      { key: "vule_b", name: "Zásobní vaky", max: 7, parent: "vule", branch: 1,
        eff: { type: "convoy", val: 3 }, desc: "posily k Ysře jdou o 3 % rychleji za bod" },
      { key: "otuz_a", name: "Zocelená kůže", max: 7, parent: "otuz", branch: 0,
        eff: { type: "def", val: 0.25 }, desc: "+0,25 obrany za bod" },
      { key: "otuz_b", name: "Rychlé zotavení", max: 7, parent: "otuz", branch: 1,
        eff: { type: "fastReturn", val: 5 }, desc: "návrat z výprav o 5 % rychleji za bod" },
      { key: "neunavna_a", name: "Druhá vlna", max: 7, parent: "neunavna", branch: 0,
        eff: { type: "strike", val: 1.5 }, desc: "při střetu eliminuje 1,5 nepřítele za bod ještě před bojem" },
      { key: "neunavna_b", name: "Zkušená velitelka", max: 7, parent: "neunavna", branch: 1,
        eff: { type: "xp", val: 3 }, desc: "+3 % zkušeností za bod" },
    ] },
    { name: "Ser Aldric Korouhevník", trait: "warlord", tree: [
      { key: "takt",  name: "Velitelský takt", max: 15, eff: { type: "cap", val: 8 },
        desc: "+8 velených jednotek za bod" },
      { key: "sik",   name: "Sevřený šik", max: 15, eff: { type: "def", val: 0.2 },
        desc: "+0,2 obrany za bod" },
      { key: "prapor", name: "Vlající prapor", max: 15, eff: { type: "stackAtk", val: 0.06 },
        desc: "útok strany roste o 0,06 každým kolem boje za bod (sčítá se)" },
      { key: "korouhev", name: "Královská korouhev", max: 15, ult: true, eff: { type: "cap", val: 6 },
        desc: "+6 velených jednotek za bod", maxEff: { type: "cap", val: 150 } },
      { key: "takt_a", name: "Zásobovací trén", max: 7, parent: "takt", branch: 0,
        eff: { type: "convoy", val: 4 }, desc: "posily k Aldricovi jdou o 4 % rychleji za bod" },
      { key: "takt_b", name: "Válečná pokladna", max: 7, parent: "takt", branch: 1,
        eff: { type: "gold", val: 0.4 }, desc: "po dobytí +0,4 zlata × úroveň pole za bod" },
      { key: "sik_a", name: "Kryté boky", max: 7, parent: "sik", branch: 0,
        eff: { type: "unitDmg", val: 1.8, cond: { unit: "inf" } }, desc: "pěchota +1,8 % poškození za bod" },
      { key: "sik_b", name: "Kázeň", max: 7, parent: "sik", branch: 1,
        eff: { type: "stam", val: 2 }, desc: "+2 maximální výdrže za bod" },
      { key: "prapor_a", name: "Bojový pokřik", max: 7, parent: "prapor", branch: 0,
        eff: { type: "stackAtk", val: 0.12 },
        desc: "útok strany roste o 0,12 každým kolem boje za bod (sčítá se)" },
      { key: "prapor_b", name: "Polnice", max: 7, parent: "prapor", branch: 1,
        eff: { type: "rally", val: 3 }, desc: "po vítězství +3 výdrže všem hrdinům za bod" },
      { key: "korouhev_a", name: "Jízdní gardy", max: 7, parent: "korouhev", branch: 0,
        eff: { type: "unitDmg", val: 1.8, cond: { unit: "cav" } }, desc: "jízda +1,8 % poškození za bod" },
      { key: "korouhev_b", name: "Řád táborů", max: 7, parent: "korouhev", branch: 1,
        eff: { type: "guardEff", val: 5 }, desc: "stráž čerpá o 5 % méně výdrže za bod" },
    ] },
    { name: "Arcimág Vaelis", trait: "mystic", tree: [
      { key: "blesk", name: "Řetězový blesk", max: 15, eff: { type: "spell", val: 2.4 },
        desc: "+2,4 kouzelného poškození každé kolo za bod" },
      { key: "runy",  name: "Runová bariéra", max: 15, eff: { type: "ward", val: 2.1 },
        desc: "−2,1 % poškození od nepřátelských hrdinů a kouzel za bod" },
      { key: "mlha",  name: "Mrazivá mlha", max: 15, eff: { type: "stunChance", val: 1.6 },
        desc: "1,6 % šance za bod omráčit nepřátelského velitele na kolo boje" },
      { key: "nebesa", name: "Hněv nebes", max: 15, ult: true, eff: { type: "spell", val: 2 },
        desc: "+2 kouzelného poškození každé kolo za bod", maxEff: { type: "spell", val: 50 } },
      { key: "blesk_a", name: "Spalující žár", max: 7, parent: "blesk", branch: 0,
        eff: { type: "dmg", val: 1.3 }, desc: "+1,3 poškození hrdiny za bod" },
      { key: "blesk_b", name: "Ohnisko vůle", max: 7, parent: "blesk", branch: 1,
        eff: { type: "spell", val: 1.7 }, desc: "+1,7 kouzelného poškození každé kolo za bod" },
      { key: "runy_a", name: "Éterická schrána", max: 7, parent: "runy", branch: 0,
        eff: { type: "hp", val: 8.5 }, desc: "+8,5 životů hrdiny za bod" },
      { key: "runy_b", name: "Ochranný kruh", max: 7, parent: "runy", branch: 1,
        eff: { type: "ward", val: 2 }, desc: "−2 % poškození od nepřátelských hrdinů a kouzel za bod" },
      { key: "mlha_a", name: "Ledový dech", max: 7, parent: "mlha", branch: 0,
        eff: { type: "unitDmg", val: 1.8, cond: { unit: "arch" } }, desc: "lučištníci +1,8 % poškození za bod" },
      { key: "mlha_b", name: "Klam", max: 7, parent: "mlha", branch: 1,
        eff: { type: "aura", val: 0.9 }, desc: "nepřátelé útočící v okolí Vaelise −0,9 % síly za bod" },
      { key: "nebesa_a", name: "Bouřné oko", max: 7, parent: "nebesa", branch: 0,
        eff: { type: "followUp", val: 2.4 }, desc: "2,4 % šance za bod na navazující úder velitele (60 % poškození)" },
      { key: "nebesa_b", name: "Věštec", max: 7, parent: "nebesa", branch: 1,
        eff: { type: "xp", val: 3 }, desc: "+3 % zkušeností za bod" },
    ] },
  ],
  yllien: [
    { name: "Nyalle Tichá", trait: "swift", tree: [
      { key: "krok",  name: "Tichý krok", max: 15, eff: { type: "speed", val: 1 },
        desc: "−1 % času pochodu za bod" },
      { key: "cepel", name: "Stínová čepel", max: 15, eff: { type: "strike", val: 1.35 },
        desc: "při střetu eliminuje 1,35 nepřítele za bod ještě před bojem" },
      { key: "jed",   name: "Otrávené čepele", max: 15, eff: { type: "dmg", val: 0.6 },
        desc: "+0,6 poškození hrdiny za bod" },
      { key: "stinochod", name: "Stínochod", max: 15, ult: true, eff: { type: "spd", val: 0.2 },
        desc: "+0,2 rychlosti v boji za bod", maxEff: { type: "instantReturn", val: 1 } },
      { key: "krok_a", name: "Splynutí", max: 7, parent: "krok", branch: 0,
        eff: { type: "stamCost", val: 2.5 }, desc: "−2,5 % ceny výdrže pochodů za bod" },
      { key: "krok_b", name: "Lehkost kroku", max: 7, parent: "krok", branch: 1,
        eff: { type: "stam", val: 2 }, desc: "+2 maximální výdrže za bod" },
      { key: "cepel_a", name: "Plášť šera", max: 7, parent: "cepel", branch: 0,
        eff: { type: "aura", val: 0.85 }, desc: "nepřátelé útočící v okolí Nyalle −0,85 % síly za bod" },
      { key: "cepel_b", name: "Zákeřný zásah", max: 7, parent: "cepel", branch: 1,
        eff: { type: "followUp", val: 2.4 }, desc: "2,4 % šance za bod na navazující úder velitele (60 % poškození)" },
      { key: "jed_a", name: "Rychlé ostří", max: 7, parent: "jed", branch: 0,
        eff: { type: "spd", val: 0.15 }, desc: "+0,15 rychlosti v boji za bod" },
      { key: "jed_b", name: "Tichý lov", max: 7, parent: "jed", branch: 1,
        eff: { type: "gold", val: 0.3 }, desc: "po dobytí +0,3 zlata × úroveň pole za bod" },
      { key: "stinochod_a", name: "Mizející stopa", max: 7, parent: "stinochod", branch: 0,
        eff: { type: "fastReturn", val: 5 }, desc: "návrat z výprav o 5 % rychleji za bod" },
      { key: "stinochod_b", name: "Lesní úkryty", max: 7, parent: "stinochod", branch: 1,
        eff: { type: "ward", val: 2 }, desc: "−2 % poškození od nepřátelských hrdinů a kouzel za bod" },
    ] },
    { name: "Theyren Trnový", trait: "attack", tree: [
      { key: "palba", name: "Trnová palba", max: 15, eff: { type: "unitDmg", val: 1.6, cond: { unit: "arch" } },
        desc: "lučištníci +1,6 % poškození za bod" },
      { key: "muska", name: "Přesná muška", max: 15, eff: { type: "strike", val: 1.35 },
        desc: "při střetu eliminuje 1,35 nepřítele za bod ještě před bojem" },
      { key: "hejno", name: "Hejno šípů", max: 15, eff: { type: "followUp", val: 1.6 },
        desc: "1,6 % šance za bod na navazující úder velitele (60 % poškození)" },
      { key: "srdcestrel", name: "Srdcestřel", max: 15, ult: true, eff: { type: "atk", val: 0.2 },
        desc: "+0,2 útoku za bod", maxEff: { type: "ignoreDef", val: 1 } },
      { key: "palba_a", name: "Hořké trny", max: 7, parent: "palba", branch: 0,
        eff: { type: "aura", val: 1.3 }, desc: "nepřátelé útočící v okolí Theyrena −1,3 % síly za bod" },
      { key: "palba_b", name: "Zásoba šípů", max: 7, parent: "palba", branch: 1,
        eff: { type: "stam", val: 2 }, desc: "+2 maximální výdrže za bod" },
      { key: "muska_a", name: "Trnová past", max: 7, parent: "muska", branch: 0,
        eff: { type: "stunChance", val: 3.4 },
        desc: "3,4 % šance za bod omráčit nepřátelského velitele na kolo boje" },
      { key: "muska_b", name: "Stopař", max: 7, parent: "muska", branch: 1,
        eff: { type: "xp", val: 3 }, desc: "+3 % zkušeností za bod" },
      { key: "hejno_a", name: "Zápalné šípy", max: 7, parent: "hejno", branch: 0,
        eff: { type: "structAtk", val: 1.5 }, desc: "+1,5 % síly proti opevněným polím za bod" },
      { key: "hejno_b", name: "Rychlá tětiva", max: 7, parent: "hejno", branch: 1,
        eff: { type: "spd", val: 0.15 }, desc: "+0,15 rychlosti v boji za bod" },
      { key: "srdcestrel_a", name: "Proti temnotě", max: 7, parent: "srdcestrel", branch: 0,
        eff: { type: "vsDmg", val: 1.8, cond: { vsFaction: "horda" } },
        desc: "proti Šarakhům +1,8 % poškození jednotek za bod" },
      { key: "srdcestrel_b", name: "Lovcův klid", max: 7, parent: "srdcestrel", branch: 1,
        eff: { type: "regen", val: 4 }, desc: "+4 % obnovy výdrže za bod" },
    ] },
    { name: "Tusiq Kořenopěvec", trait: "shield", tree: [
      { key: "koreny", name: "Píseň kořenů", max: 15, eff: { type: "holdDef", val: 2 },
        desc: "+2 % obrany pole s Tusiqem za bod" },
      { key: "zpev",  name: "Hojivý zpěv", max: 15, eff: { type: "heal", val: 2.1 },
        desc: "po vítězství se 2,1 % ztrát za bod vrací do armády" },
      { key: "miza",  name: "Proudění mízy", max: 15, eff: { type: "hp", val: 4 },
        desc: "+4 životů hrdiny za bod" },
      { key: "hvozd", name: "Prastarý hvozd", max: 15, ult: true, eff: { type: "aura", val: 0.8 },
        desc: "nepřátelé útočící v okolí Tusiqa −0,8 % síly za bod",
        maxEff: { type: "aura", val: 20 } },
      { key: "koreny_a", name: "Objetí lesa", max: 7, parent: "koreny", branch: 0,
        eff: { type: "guardEff", val: 7 }, desc: "stráž čerpá o 7 % méně výdrže za bod" },
      { key: "koreny_b", name: "Kořenná past", max: 7, parent: "koreny", branch: 1,
        eff: { type: "def", val: 0.25 }, desc: "+0,25 obrany za bod" },
      { key: "zpev_a", name: "Léčivé byliny", max: 7, parent: "zpev", branch: 0,
        eff: { type: "regen", val: 4 }, desc: "+4 % obnovy výdrže za bod" },
      { key: "zpev_b", name: "Píseň vytrvalosti", max: 7, parent: "zpev", branch: 1,
        eff: { type: "stam", val: 2 }, desc: "+2 maximální výdrže za bod" },
      { key: "miza_a", name: "Kůra jako štít", max: 7, parent: "miza", branch: 0,
        eff: { type: "ward", val: 2 }, desc: "−2 % poškození od nepřátelských hrdinů a kouzel za bod" },
      { key: "miza_b", name: "Míza života", max: 7, parent: "miza", branch: 1,
        eff: { type: "hp", val: 6 }, desc: "+6 životů hrdiny za bod" },
      { key: "hvozd_a", name: "Strážci hvozdu", max: 7, parent: "hvozd", branch: 0,
        eff: { type: "unitDmg", val: 1.8, cond: { unit: "arch" } }, desc: "lučištníci +1,8 % poškození za bod" },
      { key: "hvozd_b", name: "Lesní stezky", max: 7, parent: "hvozd", branch: 1,
        eff: { type: "convoy", val: 3 }, desc: "posily k Tusiqovi jdou o 3 % rychleji za bod" },
    ] },
    { name: "Sivrel Věčná", trait: "tireless", tree: [
      { key: "krok",  name: "Věčný krok", max: 15, eff: { type: "regen", val: 4.8 },
        desc: "+4,8 % obnovy výdrže za bod" },
      { key: "moudrost", name: "Moudrost věků", max: 15, eff: { type: "xp", val: 4 },
        desc: "+4 % zkušeností za bod" },
      { key: "cas",   name: "Závoj času", max: 15, eff: { type: "ward", val: 1.2 },
        desc: "−1,2 % poškození od nepřátelských hrdinů a kouzel za bod" },
      { key: "vitezstvi", name: "Vítězný dech", max: 15, ult: true, eff: { type: "stam", val: 1.6 },
        desc: "+1,6 maximální výdrže za bod", maxEff: { type: "winStam", val: 1 } },
      { key: "krok_a", name: "Lehkost bytí", max: 7, parent: "krok", branch: 0,
        eff: { type: "stamCost", val: 2.5 }, desc: "−2,5 % ceny výdrže pochodů za bod" },
      { key: "krok_b", name: "Hvězdná rosa", max: 7, parent: "krok", branch: 1,
        eff: { type: "stam", val: 2.5 }, desc: "+2,5 maximální výdrže za bod" },
      { key: "moudrost_a", name: "Učenlivost", max: 7, parent: "moudrost", branch: 0,
        eff: { type: "spell", val: 1.2 }, desc: "+1,2 kouzelného poškození každé kolo za bod" },
      { key: "moudrost_b", name: "Dávné svitky", max: 7, parent: "moudrost", branch: 1,
        eff: { type: "gold", val: 0.3 }, desc: "po dobytí +0,3 zlata × úroveň pole za bod" },
      { key: "cas_a", name: "Zpomalený tep", max: 7, parent: "cas", branch: 0,
        eff: { type: "hp", val: 6 }, desc: "+6 životů hrdiny za bod" },
      { key: "cas_b", name: "Předvídání", max: 7, parent: "cas", branch: 1,
        eff: { type: "spd", val: 0.15 }, desc: "+0,15 rychlosti v boji za bod" },
      { key: "vitezstvi_a", name: "Nevyčerpatelná", max: 7, parent: "vitezstvi", branch: 0,
        eff: { type: "fastReturn", val: 5 }, desc: "návrat z výprav o 5 % rychleji za bod" },
      { key: "vitezstvi_b", name: "Klidná mysl", max: 7, parent: "vitezstvi", branch: 1,
        eff: { type: "heal", val: 2 }, desc: "po vítězství se 2 % ztrát za bod vrací do armády" },
    ] },
    { name: "Laeril Píseň úsvitu", trait: "warlord", tree: [
      { key: "sbor",  name: "Píseň sboru", max: 15, eff: { type: "cap", val: 8 },
        desc: "+8 velených jednotek za bod" },
      { key: "hoj",   name: "Úsvitná hojivost", max: 15, eff: { type: "heal", val: 1.6 },
        desc: "po vítězství se 1,6 % ztrát za bod vrací do armády" },
      { key: "ton",   name: "Vytrvalý tón", max: 15, eff: { type: "stackDef", val: 0.06 },
        desc: "obrana strany roste o 0,06 každým kolem boje za bod (sčítá se)" },
      { key: "chor",  name: "Chór úsvitu", max: 15, ult: true,
        effs: [{ type: "cap", val: 6 }, { type: "heal", val: 0.7 }],
        desc: "+6 velených jednotek a 0,7 % vrácených ztrát za bod",
        maxEff: { type: "cap", val: 120 } },
      { key: "sbor_a", name: "Nádech lesa", max: 7, parent: "sbor", branch: 0,
        eff: { type: "regen", val: 4 }, desc: "+4 % obnovy výdrže za bod" },
      { key: "sbor_b", name: "Jas úsvitu", max: 7, parent: "sbor", branch: 1,
        eff: { type: "spell", val: 1.7 }, desc: "+1,7 kouzelného poškození každé kolo za bod" },
      { key: "hoj_a", name: "Ranhojiči", max: 7, parent: "hoj", branch: 0,
        eff: { type: "heal", val: 2 }, desc: "po vítězství se 2 % ztrát za bod vrací do armády" },
      { key: "hoj_b", name: "Polní oltář", max: 7, parent: "hoj", branch: 1,
        eff: { type: "stam", val: 2 }, desc: "+2 maximální výdrže za bod" },
      { key: "ton_a", name: "Souzvuk štítů", max: 7, parent: "ton", branch: 0,
        eff: { type: "def", val: 0.25 }, desc: "+0,25 obrany za bod" },
      { key: "ton_b", name: "Vzestupná melodie", max: 7, parent: "ton", branch: 1,
        eff: { type: "stackAtk", val: 0.12 },
        desc: "útok strany roste o 0,12 každým kolem boje za bod (sčítá se)" },
      { key: "chor_a", name: "Zástavy úsvitu", max: 7, parent: "chor", branch: 0,
        eff: { type: "unitDmg", val: 1.8, cond: { unit: "inf" } }, desc: "pěchota +1,8 % poškození za bod" },
      { key: "chor_b", name: "Poutní trén", max: 7, parent: "chor", branch: 1,
        eff: { type: "convoy", val: 3 }, desc: "posily k Laeril jdou o 3 % rychleji za bod" },
    ] },
    { name: "Síthrel Hvězdný šepot", trait: "mystic", tree: [
      { key: "hvezdy", name: "Pád hvězd", max: 15, eff: { type: "spell", val: 2.4 },
        desc: "+2,4 kouzelného poškození každé kolo za bod" },
      { key: "zavoj", name: "Mlžný závoj", max: 15, eff: { type: "ward", val: 2.4 },
        desc: "−2,4 % poškození od nepřátelských hrdinů a kouzel za bod" },
      { key: "kometa", name: "Ohon komety", max: 15, eff: { type: "followUp", val: 1.6 },
        desc: "1,6 % šance za bod na navazující úder velitele (60 % poškození)" },
      { key: "zrcadlo", name: "Zrcadlo hvězd", max: 15, ult: true,
        effs: [{ type: "spell", val: 1.4 }, { type: "ward", val: 0.8 }],
        desc: "+1,4 kouzelného poškození a −0,8 % poškození od hrdinů za bod",
        maxEff: { type: "spell", val: 25 } },
      { key: "hvezdy_a", name: "Hvězdná vitalita", max: 7, parent: "hvezdy", branch: 0,
        eff: { type: "hp", val: 8.5 }, desc: "+8,5 životů hrdiny za bod" },
      { key: "hvezdy_b", name: "Souhvězdí moci", max: 7, parent: "hvezdy", branch: 1,
        eff: { type: "spell", val: 1.7 }, desc: "+1,7 kouzelného poškození každé kolo za bod" },
      { key: "zavoj_a", name: "Hvězdné ticho", max: 7, parent: "zavoj", branch: 0,
        eff: { type: "stunChance", val: 3.4 },
        desc: "3,4 % šance za bod omráčit nepřátelského velitele na kolo boje" },
      { key: "zavoj_b", name: "Mlžná clona", max: 7, parent: "zavoj", branch: 1,
        eff: { type: "aura", val: 0.9 }, desc: "nepřátelé útočící v okolí Síthrel −0,9 % síly za bod" },
      { key: "kometa_a", name: "Meteorický roj", max: 7, parent: "kometa", branch: 0,
        eff: { type: "unitDmg", val: 1.8, cond: { unit: "arch" } }, desc: "lučištníci +1,8 % poškození za bod" },
      { key: "kometa_b", name: "Jiskření", max: 7, parent: "kometa", branch: 1,
        eff: { type: "dmg", val: 0.9 }, desc: "+0,9 poškození hrdiny za bod" },
      { key: "zrcadlo_a", name: "Odraz", max: 7, parent: "zrcadlo", branch: 0,
        eff: { type: "ward", val: 2 }, desc: "−2 % poškození od nepřátelských hrdinů a kouzel za bod" },
      { key: "zrcadlo_b", name: "Čtení osudu", max: 7, parent: "zrcadlo", branch: 1,
        eff: { type: "xp", val: 3 }, desc: "+3 % zkušeností za bod" },
    ] },
  ],
  durgar: [
    { name: "Borgan Kladivo", trait: "attack", tree: [
      { key: "rany",  name: "Drtivé rány", max: 15, eff: { type: "unitDmg", val: 1.6, cond: { unit: "inf" } },
        desc: "pěchota +1,6 % poškození za bod" },
      { key: "boreni", name: "Boření hradeb", max: 15, eff: { type: "structAtk", val: 1.6 },
        desc: "+1,6 % síly proti opevněným polím za bod" },
      { key: "otras", name: "Otřes země", max: 15, eff: { type: "stunChance", val: 1.6 },
        desc: "1,6 % šance za bod omráčit nepřátelského velitele na kolo boje" },
      { key: "kladivo", name: "Kladivo hor", max: 15, ult: true, eff: { type: "atk", val: 0.2 },
        desc: "+0,2 útoku za bod", maxEff: { type: "structAtk", val: 35 } },
      { key: "rany_a", name: "Válečný řev", max: 7, parent: "rany", branch: 0,
        eff: { type: "aura", val: 1.3 }, desc: "nepřátelé útočící v okolí Borgana −1,3 % síly za bod" },
      { key: "rany_b", name: "Kovadlina", max: 7, parent: "rany", branch: 1,
        eff: { type: "def", val: 0.4 }, desc: "+0,4 obrany za bod" },
      { key: "boreni_a", name: "Obléhací klíny", max: 7, parent: "boreni", branch: 0,
        eff: { type: "strike", val: 1.5 }, desc: "při střetu eliminuje 1,5 nepřítele za bod ještě před bojem" },
      { key: "boreni_b", name: "Kovářský cech", max: 7, parent: "boreni", branch: 1,
        eff: { type: "convoy", val: 3 }, desc: "posily k Borganovi jdou o 3 % rychleji za bod" },
      { key: "otras_a", name: "Rozdrcení", max: 7, parent: "otras", branch: 0,
        eff: { type: "followUp", val: 2.4 }, desc: "2,4 % šance za bod na navazující úder velitele (60 % poškození)" },
      { key: "otras_b", name: "Železná pěst", max: 7, parent: "otras", branch: 1,
        eff: { type: "dmg", val: 1.3 }, desc: "+1,3 poškození hrdiny za bod" },
      { key: "kladivo_a", name: "Dobyvačná daň", max: 7, parent: "kladivo", branch: 0,
        eff: { type: "gold", val: 0.3 }, desc: "po dobytí +0,3 zlata × úroveň pole za bod" },
      { key: "kladivo_b", name: "Neochvějný postoj", max: 7, parent: "kladivo", branch: 1,
        eff: { type: "hp", val: 6 }, desc: "+6 životů hrdiny za bod" },
    ] },
    { name: "Duna Hlubinná", trait: "shield", tree: [
      { key: "kuze",  name: "Kamenná kůže", max: 15, eff: { type: "def", val: 0.2 },
        desc: "+0,2 obrany za bod" },
      { key: "pevnost", name: "Hlubinná pevnost", max: 15, eff: { type: "holdDef", val: 2 },
        desc: "+2 % obrany pole s Dunou za bod" },
      { key: "sruby", name: "Podzemní sruby", max: 15, eff: { type: "guardEff", val: 3.2 },
        desc: "stráž čerpá o 3,2 % méně výdrže za bod" },
      { key: "lavina", name: "Lavina", max: 15, ult: true, eff: { type: "strike", val: 1.5 },
        desc: "při střetu smete 1,5 nepřítele za bod ještě před bojem",
        maxEff: { type: "strike", val: 45 } },
      { key: "kuze_a", name: "Skalní základ", max: 7, parent: "kuze", branch: 0,
        eff: { type: "ward", val: 2 }, desc: "−2 % poškození od nepřátelských hrdinů a kouzel za bod" },
      { key: "kuze_b", name: "Žulová hruď", max: 7, parent: "kuze", branch: 1,
        eff: { type: "hp", val: 8.5 }, desc: "+8,5 životů hrdiny za bod" },
      { key: "pevnost_a", name: "Štolové zásobování", max: 7, parent: "pevnost", branch: 0,
        eff: { type: "convoy", val: 4 }, desc: "posily k Duně jdou o 4 % rychleji za bod" },
      { key: "pevnost_b", name: "Zatarasené brány", max: 7, parent: "pevnost", branch: 1,
        eff: { type: "unitDmg", val: 1.8, cond: { unit: "inf" } }, desc: "pěchota +1,8 % poškození za bod" },
      { key: "sruby_a", name: "Hlídkové stezky", max: 7, parent: "sruby", branch: 0,
        eff: { type: "stam", val: 2 }, desc: "+2 maximální výdrže za bod" },
      { key: "sruby_b", name: "Tesané valy", max: 7, parent: "sruby", branch: 1,
        eff: { type: "def", val: 0.25 }, desc: "+0,25 obrany za bod" },
      { key: "lavina_a", name: "Padající balvany", max: 7, parent: "lavina", branch: 0,
        eff: { type: "structAtk", val: 1.5 }, desc: "+1,5 % síly proti opevněným polím za bod" },
      { key: "lavina_b", name: "Podkopy", max: 7, parent: "lavina", branch: 1,
        eff: { type: "stunChance", val: 2.4 },
        desc: "2,4 % šance za bod omráčit nepřátelského velitele na kolo boje" },
    ] },
    { name: "Khorr Střelmistr", trait: "swift", tree: [
      { key: "kola",  name: "Rychlá kola", max: 15, eff: { type: "speed", val: 1 },
        desc: "−1 % času pochodu za bod" },
      { key: "strely", name: "Zápalné střely", max: 15, eff: { type: "strike", val: 1.35 },
        desc: "při střetu eliminuje 1,35 nepřítele za bod ještě před bojem" },
      { key: "salvy", name: "Kartáčové salvy", max: 15, eff: { type: "unitDmg", val: 1.2, cond: { unit: "arch" } },
        desc: "lučištníci +1,2 % poškození za bod" },
      { key: "priprava", name: "Dělostřelecká příprava", max: 15, ult: true,
        effs: [{ type: "atk", val: 0.13 }, { type: "structAtk", val: 1.2 }],
        desc: "+0,13 útoku a +1,2 % síly proti opevnění za bod",
        maxEff: { type: "strike", val: 25 } },
      { key: "kola_a", name: "Prachová zásoba", max: 7, parent: "kola", branch: 0,
        eff: { type: "stamCost", val: 2.5 }, desc: "−2,5 % ceny výdrže pochodů za bod" },
      { key: "kola_b", name: "Kolomaz", max: 7, parent: "kola", branch: 1,
        eff: { type: "fastReturn", val: 7 }, desc: "návrat z výprav o 7 % rychleji za bod" },
      { key: "strely_a", name: "Zápalné hlavice", max: 7, parent: "strely", branch: 0,
        eff: { type: "structAtk", val: 1.5 }, desc: "+1,5 % síly proti opevněným polím za bod" },
      { key: "strely_b", name: "Rychlonabíjení", max: 7, parent: "strely", branch: 1,
        eff: { type: "spd", val: 0.15 }, desc: "+0,15 rychlosti v boji za bod" },
      { key: "salvy_a", name: "Odstřelovači", max: 7, parent: "salvy", branch: 0,
        eff: { type: "followUp", val: 2.4 }, desc: "2,4 % šance za bod na navazující úder velitele (60 % poškození)" },
      { key: "salvy_b", name: "Muniční vozy", max: 7, parent: "salvy", branch: 1,
        eff: { type: "convoy", val: 3 }, desc: "posily ke Khorrovi jdou o 3 % rychleji za bod" },
      { key: "priprava_a", name: "Ohňostrůjci", max: 7, parent: "priprava", branch: 0,
        eff: { type: "aura", val: 0.9 }, desc: "nepřátelé útočící v okolí Khorra −0,9 % síly za bod" },
      { key: "priprava_b", name: "Pancéřové vozy", max: 7, parent: "priprava", branch: 1,
        eff: { type: "hp", val: 6 }, desc: "+6 životů hrdiny za bod" },
    ] },
    { name: "Vagga Žulová", trait: "tireless", tree: [
      { key: "vydrz", name: "Žulová výdrž", max: 15, eff: { type: "stam", val: 1.6 },
        desc: "+1,6 maximální výdrže za bod" },
      { key: "dech",  name: "Horský dech", max: 15, eff: { type: "regen", val: 4.8 },
        desc: "+4,8 % obnovy výdrže za bod" },
      { key: "mozoly", name: "Žulové mozoly", max: 15, eff: { type: "hp", val: 4 },
        desc: "+4 životů hrdiny za bod" },
      { key: "pokrik", name: "Žulový pokřik", max: 15, ult: true, eff: { type: "rally", val: 1.5 },
        desc: "po vítězství +1,5 výdrže všem hrdinům frakce za bod",
        maxEff: { type: "stunImmune", val: 1, cond: { vsFaction: "horda" } } },
      { key: "vydrz_a", name: "Sdílená píce", max: 7, parent: "vydrz", branch: 0,
        eff: { type: "heal", val: 2.5 }, desc: "po vítězství se 2,5 % ztrát za bod vrací do armády" },
      { key: "vydrz_b", name: "Nosiči nákladu", max: 7, parent: "vydrz", branch: 1,
        eff: { type: "convoy", val: 3 }, desc: "posily k Vagze jdou o 3 % rychleji za bod" },
      { key: "dech_a", name: "Otrlost", max: 7, parent: "dech", branch: 0,
        eff: { type: "ward", val: 2 }, desc: "−2 % poškození od nepřátelských hrdinů a kouzel za bod" },
      { key: "dech_b", name: "Horské stezky", max: 7, parent: "dech", branch: 1,
        eff: { type: "stamCost", val: 2 }, desc: "−2 % ceny výdrže pochodů za bod" },
      { key: "mozoly_a", name: "Tvrdá kůže", max: 7, parent: "mozoly", branch: 0,
        eff: { type: "def", val: 0.25 }, desc: "+0,25 obrany za bod" },
      { key: "mozoly_b", name: "Nezmar", max: 7, parent: "mozoly", branch: 1,
        eff: { type: "fastReturn", val: 5 }, desc: "návrat z výprav o 5 % rychleji za bod" },
      { key: "pokrik_a", name: "Povzbuzení", max: 7, parent: "pokrik", branch: 0,
        eff: { type: "stackAtk", val: 0.12 },
        desc: "útok strany roste o 0,12 každým kolem boje za bod (sčítá se)" },
      { key: "pokrik_b", name: "Družina", max: 7, parent: "pokrik", branch: 1,
        eff: { type: "cap", val: 9 }, desc: "+9 velených jednotek za bod" },
    ] },
    { name: "Thrag Sedmý správce", trait: "warlord", tree: [
      { key: "knihy", name: "Vojenské knihy", max: 15, eff: { type: "cap", val: 8 },
        desc: "+8 velených jednotek za bod" },
      { key: "berani", name: "Obléhací berani", max: 15, eff: { type: "structAtk", val: 1.35 },
        desc: "+1,35 % síly proti opevněným polím za bod" },
      { key: "klin",  name: "Klínový manévr", max: 15, eff: { type: "unitDmg", val: 1.2, cond: { unit: "cav" } },
        desc: "jízda +1,2 % poškození za bod" },
      { key: "legie", name: "Železná legie", max: 15, ult: true,
        effs: [{ type: "cap", val: 6 }, { type: "structAtk", val: 0.8 }],
        desc: "+6 velených jednotek a +0,8 % síly proti opevnění za bod",
        maxEff: { type: "cap", val: 120 } },
      { key: "knihy_a", name: "Poctivý žold", max: 7, parent: "knihy", branch: 0,
        eff: { type: "gold", val: 0.4 }, desc: "po dobytí +0,4 zlata × úroveň pole za bod" },
      { key: "knihy_b", name: "Plné špižírny", max: 7, parent: "knihy", branch: 1,
        eff: { type: "stam", val: 2.5 }, desc: "+2,5 maximální výdrže za bod" },
      { key: "berani_a", name: "Ženisté", max: 7, parent: "berani", branch: 0,
        eff: { type: "strike", val: 1.5 }, desc: "při střetu eliminuje 1,5 nepřítele za bod ještě před bojem" },
      { key: "berani_b", name: "Vozatajstvo", max: 7, parent: "berani", branch: 1,
        eff: { type: "convoy", val: 3 }, desc: "posily k Thragovi jdou o 3 % rychleji za bod" },
      { key: "klin_a", name: "Těžká jízda", max: 7, parent: "klin", branch: 0,
        eff: { type: "def", val: 0.25 }, desc: "+0,25 obrany za bod" },
      { key: "klin_b", name: "Průzkumníci", max: 7, parent: "klin", branch: 1,
        eff: { type: "speed", val: 2 }, desc: "−2 % času pochodu za bod" },
      { key: "legie_a", name: "Kázeň legie", max: 7, parent: "legie", branch: 0,
        eff: { type: "unitDmg", val: 1.8, cond: { unit: "inf" } }, desc: "pěchota +1,8 % poškození za bod" },
      { key: "legie_b", name: "Táborový řád", max: 7, parent: "legie", branch: 1,
        eff: { type: "guardEff", val: 5 }, desc: "stráž čerpá o 5 % méně výdrže za bod" },
    ] },
    { name: "Zhargra Runové oko", trait: "mystic", tree: [
      { key: "lava",  name: "Puklina lávy", max: 15, eff: { type: "spell", val: 2.6 },
        desc: "+2,6 kouzelného poškození každé kolo za bod" },
      { key: "runy",  name: "Ochranné runy", max: 15, eff: { type: "ward", val: 2.1 },
        desc: "−2,1 % poškození od nepřátelských hrdinů a kouzel za bod" },
      { key: "otisk", name: "Runový otisk", max: 15, eff: { type: "stunChance", val: 1.6 },
        desc: "1,6 % šance za bod omráčit nepřátelského velitele na kolo boje" },
      { key: "hora",  name: "Probuzená hora", max: 15, ult: true, eff: { type: "spell", val: 2.2 },
        desc: "+2,2 kouzelného poškození každé kolo za bod", maxEff: { type: "spell", val: 55 } },
      { key: "lava_a", name: "Žhnoucí krev", max: 7, parent: "lava", branch: 0,
        eff: { type: "dmg", val: 1.3 }, desc: "+1,3 poškození hrdiny za bod" },
      { key: "lava_b", name: "Popraskaná zem", max: 7, parent: "lava", branch: 1,
        eff: { type: "structAtk", val: 1.5 }, desc: "+1,5 % síly proti opevněným polím za bod" },
      { key: "runy_a", name: "Žulová krev", max: 7, parent: "runy", branch: 0,
        eff: { type: "hp", val: 10 }, desc: "+10 životů hrdiny za bod" },
      { key: "runy_b", name: "Runový štít", max: 7, parent: "runy", branch: 1,
        eff: { type: "ward", val: 2 }, desc: "−2 % poškození od nepřátelských hrdinů a kouzel za bod" },
      { key: "otisk_a", name: "Kamenná kletba", max: 7, parent: "otisk", branch: 0,
        eff: { type: "aura", val: 0.9 }, desc: "nepřátelé útočící v okolí Zhargry −0,9 % síly za bod" },
      { key: "otisk_b", name: "Runové zbraně", max: 7, parent: "otisk", branch: 1,
        eff: { type: "unitDmg", val: 1.8, cond: { unit: "inf" } }, desc: "pěchota +1,8 % poškození za bod" },
      { key: "hora_a", name: "Sopečný výbuch", max: 7, parent: "hora", branch: 0,
        eff: { type: "followUp", val: 2.4 }, desc: "2,4 % šance za bod na navazující úder velitele (60 % poškození)" },
      { key: "hora_b", name: "Hlubinné vědění", max: 7, parent: "hora", branch: 1,
        eff: { type: "xp", val: 3 }, desc: "+3 % zkušeností za bod" },
    ] },
  ],
  horda: [
    { name: "Ghazk Popelný", trait: "attack", tree: [
      { key: "hnev",  name: "Popelný hněv", max: 15, eff: { type: "stackAtk", val: 0.11 },
        desc: "útok strany roste o 0,11 každým kolem boje za bod (sčítá se)" },
      { key: "dan",   name: "Krvavá daň", max: 15, eff: { type: "strike", val: 1.6 },
        desc: "při střetu eliminuje 1,6 nepřítele za bod ještě před bojem" },
      { key: "popel", name: "Popel měst", max: 15, eff: { type: "vsDmg", val: 1.2, cond: { vsFaction: "aldar" } },
        desc: "proti Lidem +1,2 % poškození jednotek za bod" },
      { key: "prikrov", name: "Popelný příkrov", max: 15, ult: true, eff: { type: "aura", val: 0.8 },
        desc: "nepřátelé útočící v okolí Ghazka −0,8 % síly za bod",
        maxEff: { type: "aura", val: 25 } },
      { key: "hnev_a", name: "Surovost", max: 7, parent: "hnev", branch: 0,
        eff: { type: "dmg", val: 1.3 }, desc: "+1,3 poškození hrdiny za bod" },
      { key: "hnev_b", name: "Nenávist", max: 7, parent: "hnev", branch: 1,
        eff: { type: "atk", val: 0.25 }, desc: "+0,25 útoku za bod" },
      { key: "dan_a", name: "Děs", max: 7, parent: "dan", branch: 0,
        eff: { type: "aura", val: 1.3 }, desc: "nepřátelé útočící v okolí Ghazka −1,3 % síly za bod" },
      { key: "dan_b", name: "Řezníci", max: 7, parent: "dan", branch: 1,
        eff: { type: "unitDmg", val: 1.8, cond: { unit: "inf" } }, desc: "pěchota +1,8 % poškození za bod" },
      { key: "popel_a", name: "Kořist z popela", max: 7, parent: "popel", branch: 0,
        eff: { type: "gold", val: 0.3 }, desc: "po dobytí +0,3 zlata × úroveň pole za bod" },
      { key: "popel_b", name: "Spálená země", max: 7, parent: "popel", branch: 1,
        eff: { type: "structAtk", val: 1.5 }, desc: "+1,5 % síly proti opevněným polím za bod" },
      { key: "prikrov_a", name: "Dusivý popel", max: 7, parent: "prikrov", branch: 0,
        eff: { type: "stunChance", val: 2.4 },
        desc: "2,4 % šance za bod omráčit nepřátelského velitele na kolo boje" },
      { key: "prikrov_b", name: "Popelný dech", max: 7, parent: "prikrov", branch: 1,
        eff: { type: "ward", val: 2 }, desc: "−2 % poškození od nepřátelských hrdinů a kouzel za bod" },
    ] },
    { name: "Ukhra Vichřice", trait: "swift", tree: [
      { key: "vichr", name: "Vichřice", max: 15, eff: { type: "speed", val: 1 },
        desc: "−1 % času pochodu za bod" },
      { key: "step",  name: "Stepní smršť", max: 15, eff: { type: "unitDmg", val: 1.2, cond: { unit: "cav" } },
        desc: "jízda +1,2 % poškození za bod" },
      { key: "najezdy", name: "Nájezdy", max: 15, eff: { type: "gold", val: 0.25 },
        desc: "po dobytí +0,25 zlata × úroveň pole za bod" },
      { key: "boure", name: "Oko bouře", max: 15, ult: true,
        effs: [{ type: "speed", val: 0.8 }, { type: "stamCost", val: 0.7 }],
        desc: "−0,8 % času pochodu a −0,7 % ceny výdrže za bod",
        maxEff: { type: "speed", val: 25 } },
      { key: "vichr_a", name: "Bez uzdy", max: 7, parent: "vichr", branch: 0,
        eff: { type: "stamCost", val: 2.5 }, desc: "−2,5 % ceny výdrže pochodů za bod" },
      { key: "vichr_b", name: "Kruh větrů", max: 7, parent: "vichr", branch: 1,
        eff: { type: "regen", val: 6 }, desc: "+6 % obnovy výdrže za bod" },
      { key: "step_a", name: "Šavle v trysku", max: 7, parent: "step", branch: 0,
        eff: { type: "followUp", val: 2.4 }, desc: "2,4 % šance za bod na navazující úder velitele (60 % poškození)" },
      { key: "step_b", name: "Divoké stádo", max: 7, parent: "step", branch: 1,
        eff: { type: "cap", val: 9 }, desc: "+9 velených jednotek za bod" },
      { key: "najezdy_a", name: "Rychlá kořist", max: 7, parent: "najezdy", branch: 0,
        eff: { type: "xp", val: 3 }, desc: "+3 % zkušeností za bod" },
      { key: "najezdy_b", name: "Loupežné výpady", max: 7, parent: "najezdy", branch: 1,
        eff: { type: "strike", val: 1.5 }, desc: "při střetu eliminuje 1,5 nepřítele za bod ještě před bojem" },
      { key: "boure_a", name: "Nezastavitelní", max: 7, parent: "boure", branch: 0,
        eff: { type: "fastReturn", val: 5 }, desc: "návrat z výprav o 5 % rychleji za bod" },
      { key: "boure_b", name: "Prašná clona", max: 7, parent: "boure", branch: 1,
        eff: { type: "aura", val: 0.9 }, desc: "nepřátelé útočící v okolí Ukhry −0,9 % síly za bod" },
    ] },
    { name: "Morgal Kostiplát", trait: "shield", tree: [
      { key: "pancir", name: "Kostěný pancíř", max: 15, eff: { type: "def", val: 0.2 },
        desc: "+0,2 obrany za bod" },
      { key: "hradba", name: "Kostěná hradba", max: 15, eff: { type: "holdDef", val: 2 },
        desc: "+2 % obrany pole s Morgalem za bod" },
      { key: "sber",  name: "Sběr kostí", max: 15, eff: { type: "heal", val: 1.2 },
        desc: "po vítězství se 1,2 % ztrát za bod vrací do armády" },
      { key: "kostizer", name: "Kostižer", max: 15, ult: true, eff: { type: "hp", val: 3 },
        desc: "+3 životů hrdiny za bod", maxEff: { type: "heal", val: 30 } },
      { key: "pancir_a", name: "Kostěná klec", max: 7, parent: "pancir", branch: 0,
        eff: { type: "ward", val: 2 }, desc: "−2 % poškození od nepřátelských hrdinů a kouzel za bod" },
      { key: "pancir_b", name: "Kostěné ostny", max: 7, parent: "pancir", branch: 1,
        eff: { type: "aura", val: 0.85 }, desc: "nepřátelé útočící v okolí Morgala −0,85 % síly za bod" },
      { key: "hradba_a", name: "Hromady lebek", max: 7, parent: "hradba", branch: 0,
        eff: { type: "guardEff", val: 5 }, desc: "stráž čerpá o 5 % méně výdrže za bod" },
      { key: "hradba_b", name: "Kostěné valy", max: 7, parent: "hradba", branch: 1,
        eff: { type: "unitDmg", val: 1.8, cond: { unit: "inf" } }, desc: "pěchota +1,8 % poškození za bod" },
      { key: "sber_a", name: "Mrchožrouti", max: 7, parent: "sber", branch: 0,
        eff: { type: "stam", val: 2 }, desc: "+2 maximální výdrže za bod" },
      { key: "sber_b", name: "Kostěné dláto", max: 7, parent: "sber", branch: 1,
        eff: { type: "structAtk", val: 1.5 }, desc: "+1,5 % síly proti opevněným polím za bod" },
      { key: "kostizer_a", name: "Nemrtvý pluk", max: 7, parent: "kostizer", branch: 0,
        eff: { type: "strike", val: 1.5 }, desc: "při střetu eliminuje 1,5 nepřítele za bod ještě před bojem" },
      { key: "kostizer_b", name: "Kosti pod nohama", max: 7, parent: "kostizer", branch: 1,
        eff: { type: "def", val: 0.25 }, desc: "+0,25 obrany za bod" },
    ] },
    { name: "Zhurr Nezdolný", trait: "tireless", tree: [
      { key: "nezdol", name: "Nezdolnost", max: 15, eff: { type: "regen", val: 4.8 },
        desc: "+4,8 % obnovy výdrže za bod" },
      { key: "kuze",  name: "Popelná kůže", max: 15, eff: { type: "stam", val: 1.6 },
        desc: "+1,6 maximální výdrže za bod" },
      { key: "jizvy", name: "Popelné jizvy", max: 15, eff: { type: "hp", val: 4 },
        desc: "+4 životů hrdiny za bod" },
      { key: "navrat", name: "Věčný návrat", max: 15, ult: true, eff: { type: "fastReturn", val: 3 },
        desc: "návrat z výprav o 3 % rychleji za bod",
        maxEff: { type: "noCooldown", val: 1 } },
      { key: "nezdol_a", name: "Věčný hlad", max: 7, parent: "nezdol", branch: 0,
        eff: { type: "heal", val: 2.5 }, desc: "po vítězství se 2,5 % ztrát za bod vrací do armády" },
      { key: "nezdol_b", name: "Tvrdá škola", max: 7, parent: "nezdol", branch: 1,
        eff: { type: "xp", val: 4 }, desc: "+4 % zkušeností za bod" },
      { key: "kuze_a", name: "Zjizvená kůže", max: 7, parent: "kuze", branch: 0,
        eff: { type: "def", val: 0.25 }, desc: "+0,25 obrany za bod" },
      { key: "kuze_b", name: "Otrlost", max: 7, parent: "kuze", branch: 1,
        eff: { type: "ward", val: 2 }, desc: "−2 % poškození od nepřátelských hrdinů a kouzel za bod" },
      { key: "jizvy_a", name: "Bolest nic není", max: 7, parent: "jizvy", branch: 0,
        eff: { type: "dmg", val: 1.3 }, desc: "+1,3 poškození hrdiny za bod" },
      { key: "jizvy_b", name: "Pochodová zuřivost", max: 7, parent: "jizvy", branch: 1,
        eff: { type: "stamCost", val: 2 }, desc: "−2 % ceny výdrže pochodů za bod" },
      { key: "navrat_a", name: "Nezlomný", max: 7, parent: "navrat", branch: 0,
        eff: { type: "stackDef", val: 0.12 },
        desc: "obrana strany roste o 0,12 každým kolem boje za bod (sčítá se)" },
      { key: "navrat_b", name: "Znovu do sedla", max: 7, parent: "navrat", branch: 1,
        eff: { type: "spd", val: 0.15 }, desc: "+0,15 rychlosti v boji za bod" },
    ] },
    { name: "Vrakh Pán smeček", trait: "warlord", tree: [
      { key: "smecka", name: "Hlad smečky", max: 15, eff: { type: "cap", val: 8 },
        desc: "+8 velených jednotek za bod" },
      { key: "bic",   name: "Popelný bič", max: 15, eff: { type: "atk", val: 0.2 },
        desc: "+0,2 útoku za bod" },
      { key: "vyti",  name: "Vytí smečky", max: 15, eff: { type: "stunChance", val: 1.6 },
        desc: "1,6 % šance za bod omráčit nepřátelského velitele na kolo boje" },
      { key: "hordapan", name: "Nekonečná horda", max: 15, ult: true,
        effs: [{ type: "cap", val: 6 }, { type: "atk", val: 0.13 }],
        desc: "+6 velených jednotek a +0,13 útoku za bod",
        maxEff: { type: "cap", val: 120 } },
      { key: "smecka_a", name: "Vláda strachu", max: 7, parent: "smecka", branch: 0,
        eff: { type: "aura", val: 0.85 }, desc: "nepřátelé útočící v okolí Vrakha −0,85 % síly za bod" },
      { key: "smecka_b", name: "Kořistníci", max: 7, parent: "smecka", branch: 1,
        eff: { type: "gold", val: 0.3 }, desc: "po dobytí +0,3 zlata × úroveň pole za bod" },
      { key: "bic_a", name: "Pach krve", max: 7, parent: "bic", branch: 0,
        eff: { type: "stackAtk", val: 0.12 },
        desc: "útok strany roste o 0,12 každým kolem boje za bod (sčítá se)" },
      { key: "bic_b", name: "Zuřiví psi", max: 7, parent: "bic", branch: 1,
        eff: { type: "unitDmg", val: 1.8, cond: { unit: "cav" } }, desc: "jízda +1,8 % poškození za bod" },
      { key: "vyti_a", name: "Štvanice", max: 7, parent: "vyti", branch: 0,
        eff: { type: "followUp", val: 2.4 }, desc: "2,4 % šance za bod na navazující úder velitele (60 % poškození)" },
      { key: "vyti_b", name: "Neúnavná smečka", max: 7, parent: "vyti", branch: 1,
        eff: { type: "regen", val: 4 }, desc: "+4 % obnovy výdrže za bod" },
      { key: "hordapan_a", name: "Přísun mas", max: 7, parent: "hordapan", branch: 0,
        eff: { type: "convoy", val: 3 }, desc: "posily k Vrakhovi jdou o 3 % rychleji za bod" },
      { key: "hordapan_b", name: "Bezhlavý nápor", max: 7, parent: "hordapan", branch: 1,
        eff: { type: "strike", val: 1.5 }, desc: "při střetu eliminuje 1,5 nepřítele za bod ještě před bojem" },
    ] },
    { name: "Maalzeth Plamenný prorok", trait: "mystic", tree: [
      { key: "plamen", name: "Popelný plamen", max: 15, eff: { type: "spell", val: 2.9 },
        desc: "+2,9 kouzelného poškození každé kolo za bod" },
      { key: "vysav", name: "Vysátí vůle", max: 15, eff: { type: "ward", val: 1.6 },
        desc: "−1,6 % poškození od nepřátelských hrdinů a kouzel za bod" },
      { key: "vestba", name: "Věštba plamenů", max: 15, eff: { type: "followUp", val: 1.6 },
        desc: "1,6 % šance za bod na navazující úder velitele (60 % poškození)" },
      { key: "pohlceni", name: "Pohlcení plamenem", max: 15, ult: true,
        effs: [{ type: "spell", val: 1.8 }, { type: "dmg", val: 0.5 }],
        desc: "+1,8 kouzelného poškození a +0,5 poškození hrdiny za bod",
        maxEff: { type: "spell", val: 45 } },
      { key: "plamen_a", name: "Krvavá oběť", max: 7, parent: "plamen", branch: 0,
        eff: { type: "dmg", val: 1.7 }, desc: "+1,7 poškození hrdiny za bod" },
      { key: "plamen_b", name: "Řeřavé jádro", max: 7, parent: "plamen", branch: 1,
        eff: { type: "hp", val: 8.5 }, desc: "+8,5 životů hrdiny za bod" },
      { key: "vysav_a", name: "Vysátí sil", max: 7, parent: "vysav", branch: 0,
        eff: { type: "aura", val: 0.9 }, desc: "nepřátelé útočící v okolí Maalzetha −0,9 % síly za bod" },
      { key: "vysav_b", name: "Popelný štít", max: 7, parent: "vysav", branch: 1,
        eff: { type: "ward", val: 2 }, desc: "−2 % poškození od nepřátelských hrdinů a kouzel za bod" },
      { key: "vestba_a", name: "Ohnivý jazyk", max: 7, parent: "vestba", branch: 0,
        eff: { type: "unitDmg", val: 1.8, cond: { unit: "arch" } }, desc: "lučištníci +1,8 % poškození za bod" },
      { key: "vestba_b", name: "Prorokovo šílenství", max: 7, parent: "vestba", branch: 1,
        eff: { type: "stunChance", val: 2.4 },
        desc: "2,4 % šance za bod omráčit nepřátelského velitele na kolo boje" },
      { key: "pohlceni_a", name: "Živý oheň", max: 7, parent: "pohlceni", branch: 0,
        eff: { type: "structAtk", val: 1.5 }, desc: "+1,5 % síly proti opevněným polím za bod" },
      { key: "pohlceni_b", name: "Vidiny", max: 7, parent: "pohlceni", branch: 1,
        eff: { type: "xp", val: 3 }, desc: "+3 % zkušeností za bod" },
    ] },
  ],
};

// ---------- Rodové knihovny stromů (v0.23) ----------
// Dokončení „fáze 2": místo 12 ručních uzlů na hrdinu sdílejí NOVÉ frakce
// stromy podle RODU (= rysu velitele) — jako rodové linie v předloze.
// Hodnoty za bod jsou převzaté z ověřených aldarských stromů, mění se jen
// jména. Klíče dovedností se smějí opakovat napříč hrdiny (ukládají se
// per hrdina). Původních 24 hrdinů si nechává ruční stromy beze změny.
function rodovyStrom(trait) {
  const T = {
    swift: [
      ["krok", "Vichrný krok", { type: "speed", val: 1 }, "−1 % času pochodu za bod"],
      ["najezd", "Nájezdnická zteč", { type: "unitDmg", val: 1.2, cond: { unit: "cav" } }, "jízda +1,2 % poškození za bod"],
      ["stopa", "Kořist z výprav", { type: "gold", val: 0.25 }, "po dobytí +0,25 zlata × úroveň pole za bod"],
      ["vichr", "Křídla vichru", { type: "spd", val: 0.2 }, "+0,2 rychlosti v boji za bod"],
      ["krok_a", "Lehká noha", { type: "stamCost", val: 2.5 }, "−2,5 % ceny výdrže pochodů za bod"],
      ["krok_b", "Daleké obzory", { type: "stam", val: 2.5 }, "+2,5 maximální výdrže za bod"],
      ["najezd_a", "Hrot klínu", { type: "strike", val: 1.5 }, "při střetu eliminuje 1,5 nepřítele za bod ještě před bojem"],
      ["najezd_b", "Rychlé řady", { type: "cap", val: 9 }, "+9 velených jednotek za bod"],
      ["stopa_a", "Sběrači kořisti", { type: "gold", val: 0.3 }, "po dobytí +0,3 zlata × úroveň pole za bod"],
      ["stopa_b", "Ostřílený zvěd", { type: "xp", val: 3 }, "+3 % zkušeností za bod"],
      ["vichr_a", "Návrat po větru", { type: "fastReturn", val: 5 }, "návrat z výprav o 5 % rychleji za bod"],
      ["vichr_b", "Nezastavitelný dech", { type: "regen", val: 4 }, "+4 % obnovy výdrže za bod"],
    ],
    attack: [
      ["cepel", "Broušené čepele", { type: "atk", val: 0.2 }, "+0,2 útoku za bod"],
      ["vypad", "První výpad", { type: "strike", val: 1.6 }, "při střetu eliminuje 1,6 nepřítele za bod ještě před bojem"],
      ["omrac", "Ohlušující rány", { type: "stunChance", val: 1.6 }, "1,6 % šance za bod omráčit nepřátelského velitele na kolo boje"],
      ["poprava", "Popravčí sek", { type: "dmg", val: 0.8 }, "+0,8 poškození hrdiny za bod"],
      ["cepel_a", "Zocelené hrany", { type: "dmg", val: 1.3 }, "+1,3 poškození hrdiny za bod"],
      ["cepel_b", "Bojový takt", { type: "spd", val: 0.15 }, "+0,15 rychlosti v boji za bod"],
      ["vypad_a", "Hrozivá pověst", { type: "aura", val: 1.3 }, "nepřátelé útočící v okolí velitele −1,3 % síly za bod"],
      ["vypad_b", "Po bitvě na nohou", { type: "heal", val: 2 }, "po vítězství se 2 % ztrát za bod vrací do armády"],
      ["omrac_a", "Těžké palice", { type: "unitDmg", val: 1.8, cond: { unit: "inf" } }, "pěchota +1,8 % poškození za bod"],
      ["omrac_b", "Tvrdý kořínek", { type: "stam", val: 2 }, "+2 maximální výdrže za bod"],
      ["poprava_a", "Dvojitý sek", { type: "followUp", val: 2.4 }, "2,4 % šance za bod na navazující úder velitele (60 % poškození)"],
      ["poprava_b", "Válečná odměna", { type: "gold", val: 0.3 }, "po dobytí +0,3 zlata × úroveň pole za bod"],
    ],
    shield: [
      ["valy", "Zákopové valy", { type: "stackDef", val: 0.11 }, "+0,11 obrany armády za bod za každé dokončené kolo boje"],
      ["hradba", "Pevná hradba", { type: "holdDef", val: 2 }, "+2 % obrany při bránění vlastního pole za bod"],
      ["stitonos", "Štítonoši rodu", { type: "unitDmg", val: 1.2, cond: { unit: "inf" } }, "pěchota +1,2 % poškození za bod"],
      ["zed", "Nezlomná zeď", { type: "def", val: 0.2 }, "+0,2 obrany za bod"],
      ["valy_a", "Palisáda", { type: "def", val: 0.25 }, "+0,25 obrany za bod"],
      ["valy_b", "Stráž rodu", { type: "guardEff", val: 7 }, "+7 % síly stráže na poli za bod"],
      ["hradba_a", "Protivýpad", { type: "strike", val: 1.2 }, "při střetu eliminuje 1,2 nepřítele za bod ještě před bojem"],
      ["hradba_b", "Kamenné základy", { type: "hp", val: 8 }, "+8 životů velitele za bod"],
      ["stitonos_a", "Kopí za štíty", { type: "unitDmg", val: 1.8, cond: { unit: "cav" } }, "jízda +1,8 % poškození za bod"],
      ["stitonos_b", "Železná zásoba", { type: "stam", val: 2 }, "+2 maximální výdrže za bod"],
      ["zed_a", "Hluboké sklady", { type: "convoy", val: 3 }, "+3 % rychlosti konvojů posil za bod"],
      ["zed_b", "Neochvějnost", { type: "ward", val: 2 }, "−2 % poškození od hrdinů a kouzel za bod"],
    ],
    tireless: [
      ["dech", "Hluboký dech", { type: "regen", val: 4.8 }, "+4,8 % obnovy výdrže za bod"],
      ["vule", "Nezlomná vůle", { type: "stam", val: 1.6 }, "+1,6 maximální výdrže za bod"],
      ["otuzilost", "Otužilost rodu", { type: "hp", val: 4 }, "+4 životů velitele za bod"],
      ["vecnost", "Věčný pochod", { type: "heal", val: 0.8 }, "po vítězství se 0,8 % ztrát za bod vrací do armády"],
      ["dech_a", "Polní ranhojiči", { type: "heal", val: 2.5 }, "po vítězství se 2,5 % ztrát za bod vrací do armády"],
      ["dech_b", "Úsporný krok", { type: "stamCost", val: 2 }, "−2 % ceny výdrže pochodů za bod"],
      ["vule_a", "Kořen vůle", { type: "ward", val: 2 }, "−2 % poškození od hrdinů a kouzel za bod"],
      ["vule_b", "Plné vaky", { type: "convoy", val: 3 }, "+3 % rychlosti konvojů posil za bod"],
      ["otuzilost_a", "Hrubá kůže", { type: "def", val: 0.25 }, "+0,25 obrany za bod"],
      ["otuzilost_b", "Rychlý návrat", { type: "fastReturn", val: 5 }, "návrat z výprav o 5 % rychleji za bod"],
      ["vecnost_a", "Druhá vlna", { type: "strike", val: 1.5 }, "při střetu eliminuje 1,5 nepřítele za bod ještě před bojem"],
      ["vecnost_b", "Zkušenost cest", { type: "xp", val: 3 }, "+3 % zkušeností za bod"],
    ],
    warlord: [
      ["takt", "Velitelský takt", { type: "cap", val: 8 }, "+8 velených jednotek za bod"],
      ["sik", "Sevřený šik", { type: "def", val: 0.2 }, "+0,2 obrany za bod"],
      ["prapor", "Prapor rodu", { type: "stackAtk", val: 0.06 }, "+0,06 útoku armády za bod za každé dokončené kolo boje"],
      ["korouhev", "Velká korouhev", { type: "cap", val: 6 }, "+6 velených jednotek za bod"],
      ["takt_a", "Zásobovací trén", { type: "convoy", val: 4 }, "+4 % rychlosti konvojů posil za bod"],
      ["takt_b", "Válečná pokladna", { type: "gold", val: 0.4 }, "po dobytí +0,4 zlata × úroveň pole za bod"],
      ["sik_a", "Kryté boky", { type: "unitDmg", val: 1.8, cond: { unit: "inf" } }, "pěchota +1,8 % poškození za bod"],
      ["sik_b", "Kázeň", { type: "stam", val: 2 }, "+2 maximální výdrže za bod"],
      ["prapor_a", "Bojový pokřik", { type: "stackAtk", val: 0.12 }, "+0,12 útoku armády za bod za každé dokončené kolo boje"],
      ["prapor_b", "Polnice", { type: "rally", val: 3 }, "+3 % síly posádek sousedních vlastních polí za bod"],
      ["korouhev_a", "Jízdní zálohy", { type: "unitDmg", val: 1.8, cond: { unit: "cav" } }, "jízda +1,8 % poškození za bod"],
      ["korouhev_b", "Řád táborů", { type: "guardEff", val: 5 }, "+5 % síly stráže na poli za bod"],
    ],
    mystic: [
      ["blesk", "Hlubinný blesk", { type: "spell", val: 2.4 }, "+2,4 poškození kouzly za bod (obchází zbroj)"],
      ["runy", "Runová bariéra", { type: "ward", val: 2.1 }, "−2,1 % poškození od hrdinů a kouzel za bod"],
      ["mlha", "Mámivá mlha", { type: "stunChance", val: 1.6 }, "1,6 % šance za bod omráčit nepřátelského velitele na kolo boje"],
      ["hnev", "Hněv hlubin", { type: "spell", val: 2 }, "+2 poškození kouzly za bod (obchází zbroj)"],
      ["blesk_a", "Spalující žár", { type: "dmg", val: 1.3 }, "+1,3 poškození hrdiny za bod"],
      ["blesk_b", "Ohnisko vůle", { type: "spell", val: 1.7 }, "+1,7 poškození kouzly za bod (obchází zbroj)"],
      ["runy_a", "Éterická schrána", { type: "hp", val: 8.5 }, "+8,5 životů velitele za bod"],
      ["runy_b", "Ochranný kruh", { type: "ward", val: 2 }, "−2 % poškození od hrdinů a kouzel za bod"],
      ["mlha_a", "Ledový dech", { type: "unitDmg", val: 1.8, cond: { unit: "arch" } }, "střelci +1,8 % poškození za bod"],
      ["mlha_b", "Klam", { type: "aura", val: 0.9 }, "nepřátelé útočící v okolí velitele −0,9 % síly za bod"],
      ["hnev_a", "Ozvěna úderu", { type: "followUp", val: 2.4 }, "2,4 % šance za bod na navazující úder velitele (60 % poškození)"],
      ["hnev_b", "Věštec", { type: "xp", val: 3 }, "+3 % zkušeností za bod"],
    ],
    healer: [
      ["obvaz", "Polní obvaziště", { type: "roundHeal", val: 0.45, timing: { every: 3 } }, "každé 3. kolo vrátí do řad 0,45 % dosavadních ztrát za bod"],
      ["lazaret", "Ranhojičův stan", { type: "heal", val: 2.2 }, "po vítězství se 2,2 % ztrát za bod vrací do armády"],
      ["dech", "Dech života", { type: "hp", val: 9 }, "+9 životů velitele za bod"],
      ["pramen", "Pramen uzdravení", { type: "roundHeal", val: 0.8, timing: { every: 2 } }, "každé 2. kolo vrátí do řad 0,8 % dosavadních ztrát za bod"],
      ["obvaz_a", "Čisté plátno", { type: "regen", val: 4 }, "+4 % obnovy výdrže za bod"],
      ["obvaz_b", "Bylinkářka", { type: "stam", val: 2 }, "+2 maximální výdrže za bod"],
      ["lazaret_a", "Nosiči raněných", { type: "heal", val: 2.6 }, "po vítězství se 2,6 % ztrát za bod vrací do armády"],
      ["lazaret_b", "Teplá strava", { type: "hp", val: 8 }, "+8 životů velitele za bod"],
      ["dech_a", "Pevná ruka", { type: "def", val: 0.2 }, "+0,2 obrany za bod"],
      ["dech_b", "Klid v bouři", { type: "ward", val: 1.2 }, "−1,2 % poškození od hrdinů a kouzel za bod"],
      ["pramen_a", "Modlitba za padlé", { type: "roundHeal", val: 0.5, timing: { every: 3 } }, "každé 3. kolo vrátí do řad dalších 0,5 % ztrát za bod"],
      ["pramen_b", "Vlídné slovo", { type: "rally", val: 1.5 }, "+1,5 % výdrže po vítězství za bod"],
    ],
  }[trait];
  const rodice = [T[0][0], T[1][0], T[2][0], T[3][0]];
  return T.map(([key, name, eff, desc], i) => i < 4
    ? { key, name, max: 15, eff, desc, ...(i === 3 ? { ult: true } : {}) }
    : { key, name, max: 7, eff, desc,
        parent: rodice[(i - 4) >> 1], branch: (i - 4) % 2 });
}

// šest hrdinů nové frakce v závazném pořadí rysů (Common 3 / Epic 2 / Legendary 1)
function rodovaSestava(jmena) {
  const rysy = ["swift", "attack", "shield", "tireless", "warlord", "mystic", "healer"];
  return jmena.map((name, i) => ({ name, trait: rysy[i], tree: rodovyStrom(rysy[i]) }));
}

// IV-H: ranhojič je SEDMÝ hrdina každého rodu. Čtyři původní rody mají stromy
// psané ručně, takže se jim ranhojič připojí zvlášť — z knihovního stromu,
// stejně jako u rodů přidaných ve v0.23.
const RANHOJICI = {
  aldar:   "Sestra Elwyn",
  yllien:  "Aewen Tišitelka",
  durgar:  "Grumla Kostivarka",
  horda:   "Nyx Krvavá sestra",
};

for (const [fk, jm] of Object.entries(RANHOJICI))
  HERO_DEFS[fk].push({ name: jm, trait: "healer", tree: rodovyStrom("healer") });

Object.assign(HERO_DEFS, {
  brakkar: rodovaSestava(["Vigga Hlubinná", "Dorn Kamenopěst", "Balgrim Štítová skála",
    "Helga Žulová", "Thrandur Korouhevník", "Runovědma Sigrit",
    "Hilda Dlaňová"]),
  sarn: rodovaSestava(["Ajsel Vichřice", "Tarkan Rudý oštěp", "Bajan Štít stepi",
    "Ulzana Nezlomná", "Chán Argut", "Šamanka Zereja",
    "Ajla Bylinná"]),
  vhorren: rodovaSestava(["Bledý Vessik", "Mortena Žnečka", "Kravn Kostěný val",
    "Nespící Ordwal", "Panovník Malvren", "Lich Vhorrag",
    "Sevrik Šeptající"]),
  gryk: rodovaSestava(["Špindíra Rychloprst", "Vřešt Krvezub", "Grud Železný krunýř",
    "Mrk Houževnatý", "Náčelník Zubodrv", "Kejklíř Chrchel",
    "Bábrle Zaříkávač"]),
});

// ---------- STARTOVNÍ KITY (v0.28, etapa 2 plánu) ----------
// Přeprofilované stromy osmi startovních hrdinů (archetypy dle PLAN.md):
// štítonoš / lukostřelec / tank-heal / kavalerista / siegemaster / čistý DD /
// warlock / ekonom. Vygenerováno workflow + kontrola, čísla ladí rastr
// (tests/rastr.js). Musí stát PŘED dekorátorem stromů.

HERO_DEFS.aldar[2].tree = [ // Edran Sirotčí král
  { key: "uder", name: "Úder štítem", max: MAIN_MAX_RANK,
    eff: { type: "stunChance", val: 1.0 },
    desc: "1 % šance za bod omráčit nepřátelského velitele na kolo boje" },
  { key: "rozkaz", name: "Královský rozkaz", max: MAIN_MAX_RANK,
    eff: { type: "roundArmy", val: 1.4, timing: { every: 3 } },
    desc: "každé 3. kolo: jednotky +1,4 % poškození za bod" },
  { key: "postoj", name: "Pevný postoj", max: MAIN_MAX_RANK,
    eff: { type: "def", val: 0.22 },
    desc: "+0,22 obrany za bod" },
  { key: "hradba", name: "Poslední hradba", max: MAIN_MAX_RANK, ult: true,
    eff: { type: "stackDef", val: 0.11 },
    desc: "za každé dokončené kolo boje +0,11 obrany armády za bod" },
  { key: "uder_a", name: "Ohlušující náraz", max: SUB_MAX_RANK, parent: "uder", branch: 0,
    eff: { type: "slowEnemy", val: 0.24 },
    desc: "−0,24 rychlosti nepřátel v boji za bod" },
  { key: "uder_b", name: "Tíha koruny", max: SUB_MAX_RANK, parent: "uder", branch: 1,
    eff: { type: "dmg", val: 1 },
    desc: "+1 poškození velitele za bod" },
  { key: "rozkaz_a", name: "Štítová řada", max: SUB_MAX_RANK, parent: "rozkaz", branch: 0,
    eff: { type: "unitDmg", val: 1.5, cond: { unit: "inf" } },
    desc: "pěchota +1,5 % poškození za bod" },
  { key: "rozkaz_b", name: "Korouhev Aldaru", max: SUB_MAX_RANK, parent: "rozkaz", branch: 1,
    eff: { type: "cap", val: 7 },
    desc: "+7 velení za bod" },
  { key: "postoj_a", name: "Obrana domoviny", max: SUB_MAX_RANK, parent: "postoj", branch: 0,
    eff: { type: "holdDef", val: 2 },
    desc: "+2 % obrany při obraně vlastního pole za bod" },
  { key: "postoj_b", name: "Srdce sirotka", max: SUB_MAX_RANK, parent: "postoj", branch: 1,
    eff: { type: "hp", val: 7 },
    desc: "+7 životů velitele za bod" },
  { key: "hradba_a", name: "Okovaný štít", max: SUB_MAX_RANK, parent: "hradba", branch: 0,
    eff: { type: "ward", val: 0.65 },
    desc: "−0,65 % poškození od nepřátelských velitelů a kouzel za bod" },
  { key: "hradba_b", name: "Semknuté řady", max: SUB_MAX_RANK, parent: "hradba", branch: 1,
    eff: { type: "roundHeal", val: 0.6, timing: { every: 3 } },
    desc: "každé 3. kolo: 0,6 % kumulativních ztrát se vrací do řad za bod" },
];

HERO_DEFS.yllien[0].tree = [ // Nyalle Tichá
  { key: "sepot", name: "Šepot kořenů", max: MAIN_MAX_RANK,
    eff: { type: "slowEnemy", val: 0.27 },
    desc: "kořeny hvozdu se pnou nepřátelům pod nohy: −0,27 iniciativy nepřátel za bod" },
  { key: "pisen", name: "Píseň tětiv", max: MAIN_MAX_RANK,
    eff: { type: "unitDmg", val: 1.8, cond: { unit: "arch" } },
    desc: "lučištníci +1,8 % poškození za bod" },
  { key: "dest", name: "Déšť z korun", max: MAIN_MAX_RANK,
    eff: { type: "roundArmy", val: 1.5, timing: { every: 3 } },
    desc: "každé 3. kolo: jednotky +1,5 % poškození za bod" },
  { key: "boure", name: "Bouře šípů", max: MAIN_MAX_RANK, ult: true,
    eff: { type: "roundDmg", val: 2.4, timing: { every: 2 }, targets: 2 },
    desc: "každé 2. kolo: mistrovská salva za 2,4 % poškození velitele za bod, zasáhne 2 cíle" },
  { key: "sepot_a", name: "Lehký krok", max: SUB_MAX_RANK, parent: "sepot", branch: 0,
    eff: { type: "spd", val: 0.18 },
    desc: "+0,18 rychlosti v boji za bod" },
  { key: "sepot_b", name: "Léčka v mlází", max: SUB_MAX_RANK, parent: "sepot", branch: 1,
    eff: { type: "strike", val: 1.4 },
    desc: "tichá salva před střetem vyřadí část nepřátel: 1,4 za bod" },
  { key: "pisen_a", name: "Napjatá tětiva", max: SUB_MAX_RANK, parent: "pisen", branch: 0,
    eff: { type: "atk", val: 0.2 },
    desc: "+0,2 útoku za bod" },
  { key: "pisen_b", name: "Neomylný šíp", max: SUB_MAX_RANK, parent: "pisen", branch: 1,
    eff: { type: "pursuit", val: 2 },
    desc: "2 % šance za bod na neodvratný úder" },
  { key: "dest_a", name: "Dvojitá střela", max: SUB_MAX_RANK, parent: "dest", branch: 0,
    eff: { type: "followUp", val: 2.2 },
    desc: "2,2 % šance za bod na navazující úder" },
  { key: "dest_b", name: "Stezky hvozdu", max: SUB_MAX_RANK, parent: "dest", branch: 1,
    eff: { type: "speed", val: 1 },
    desc: "−1 % času pochodu za bod" },
  { key: "boure_a", name: "Stříbrný hrot", max: SUB_MAX_RANK, parent: "boure", branch: 0,
    eff: { type: "dmg", val: 1 },
    desc: "+1 poškození velitele za bod" },
  { key: "boure_b", name: "Závoj listí", max: SUB_MAX_RANK, parent: "boure", branch: 1,
    eff: { type: "ward", val: 0.6 },
    desc: "−0,6 % poškození od nepřátelských velitelů a kouzel za bod" },
];

HERO_DEFS.brakkar[3].tree = [ // Helga Žulová
  { key: "vaha", name: "Váha hory", max: MAIN_MAX_RANK,
    eff: { type: "dmg", val: 1 },
    desc: "+1 poškození hrdiny za bod" },
  { key: "zula", name: "Žulová kůže", max: MAIN_MAX_RANK,
    eff: { type: "def", val: 0.22 },
    desc: "+0,22 obrany za bod" },
  { key: "srdce", name: "Kamenné srdce", max: MAIN_MAX_RANK,
    eff: { type: "roundHeal", val: 0.6, timing: { every: 2 } },
    desc: "každé 2. kolo se 0,6 % kumulativních ztrát za bod vrací do řad" },
  { key: "pad", name: "Pád hory", max: MAIN_MAX_RANK, ult: true,
    eff: { type: "roundDmg", val: 2.2, timing: { every: 3 }, targets: 2 },
    desc: "každé 3. kolo: úder za 2,2 % poškození hrdiny za bod, zasáhne 2 cíle" },
  { key: "vaha_a", name: "Žár kovadliny", max: SUB_MAX_RANK, parent: "vaha", branch: 0,
    eff: { type: "stackAtk", val: 0.11 },
    desc: "+0,11 útoku armády za bod za každé dokončené kolo boje" },
  { key: "vaha_b", name: "Lamač pancířů", max: SUB_MAX_RANK, parent: "vaha", branch: 1,
    eff: { type: "shred", val: 2.1 },
    desc: "−2,1 % statů nepřátelského velitele za bod" },
  { key: "zula_a", name: "Kořeny hory", max: SUB_MAX_RANK, parent: "zula", branch: 0,
    eff: { type: "hp", val: 7 },
    desc: "+7 životů hrdiny za bod" },
  { key: "zula_b", name: "Vryté runy", max: SUB_MAX_RANK, parent: "zula", branch: 1,
    eff: { type: "ward", val: 0.65 },
    desc: "−0,65 % poškození od nepřátelských hrdinů a kouzel za bod" },
  { key: "srdce_a", name: "Runy zacelení", max: SUB_MAX_RANK, parent: "srdce", branch: 0,
    eff: { type: "heal", val: 2.2 },
    desc: "po vítězství se 2,2 % ztrát za bod vrací do armády" },
  { key: "srdce_b", name: "Dech hlubiny", max: SUB_MAX_RANK, parent: "srdce", branch: 1,
    eff: { type: "regen", val: 3.5 },
    desc: "+3,5 % obnovy výdrže za bod" },
  { key: "pad_a", name: "Dunivý dopad", max: SUB_MAX_RANK, parent: "pad", branch: 0,
    eff: { type: "stunChance", val: 1.5 },
    desc: "1,5 % šance za bod omráčit nepřátelského velitele na kolo boje" },
  { key: "pad_b", name: "Vrostlá do skály", max: SUB_MAX_RANK, parent: "pad", branch: 1,
    eff: { type: "stackDef", val: 0.11 },
    desc: "+0,11 obrany armády za bod za každé dokončené kolo boje" },
];

HERO_DEFS.sarn[0].tree = [ // Ajsel Vichřice
  { key: "jizda", name: "Sarnská jízda", max: MAIN_MAX_RANK,
    eff: { type: "unitDmg", val: 2.7, cond: { unit: "cav" } },
    desc: "jízda +2,7 % poškození za bod" },
  { key: "vichr", name: "Stepní zteč", max: MAIN_MAX_RANK,
    eff: { type: "strike", val: 1.6 },
    desc: "zteč před začátkem boje eliminuje 1,6 nepřátel za bod" },
  { key: "najezd", name: "Dusot kopyt", max: MAIN_MAX_RANK,
    eff: { type: "stunChance", val: 1.4 },
    desc: "1,4 % šance za bod omráčit nepřátelského velitele na kolo boje" },
  { key: "lavina", name: "Lavina kopyt", max: MAIN_MAX_RANK, ult: true,
    eff: { type: "roundDmg", val: 2.4, timing: { round: 1 }, targets: 2 },
    desc: "1. kolo: drtivá zteč za 2,4 % velitelova poškození za bod, zasáhne 2 cíle" },
  { key: "jizda_a", name: "Druhá vlna", max: SUB_MAX_RANK, parent: "jizda", branch: 0,
    eff: { type: "followUp", val: 2.2 },
    desc: "2,2 % šance za bod na navazující úder" },
  { key: "jizda_b", name: "Šavle stepi", max: SUB_MAX_RANK, parent: "jizda", branch: 1,
    eff: { type: "atk", val: 0.2 },
    desc: "+0,2 útoku za bod" },
  { key: "vichr_a", name: "Křídla vichru", max: SUB_MAX_RANK, parent: "vichr", branch: 0,
    eff: { type: "speed", val: 1 },
    desc: "−1 % času pochodu za bod" },
  { key: "vichr_b", name: "Lehká sedla", max: SUB_MAX_RANK, parent: "vichr", branch: 1,
    eff: { type: "stamCost", val: 2.2 },
    desc: "−2,2 % ceny výdrže za bod" },
  { key: "najezd_a", name: "Oblaka prachu", max: SUB_MAX_RANK, parent: "najezd", branch: 0,
    eff: { type: "slowEnemy", val: 0.24 },
    desc: "−0,24 iniciativy nepřátel v boji za bod" },
  { key: "najezd_b", name: "Nelítostná štvanice", max: SUB_MAX_RANK, parent: "najezd", branch: 1,
    eff: { type: "pursuit", val: 2 },
    desc: "2 % šance za bod na neodvratný úder" },
  { key: "lavina_a", name: "První náraz", max: SUB_MAX_RANK, parent: "lavina", branch: 0,
    eff: { type: "strike", val: 1.4 },
    desc: "zteč před začátkem boje eliminuje 1,4 nepřátel za bod" },
  { key: "lavina_b", name: "V plném trysku", max: SUB_MAX_RANK, parent: "lavina", branch: 1,
    eff: { type: "spd", val: 0.18 },
    desc: "+0,18 rychlosti v boji za bod" },
];

HERO_DEFS.durgar[3].tree = [ // Vagga Žulová
  { key: "boreni", name: "Žulové beranidlo", max: MAIN_MAX_RANK,
    eff: { type: "structAtk", val: 1.5 },
    desc: "+1,5 % síly proti opevněným polím za bod" },
  { key: "hradba", name: "Štítová hradba", max: MAIN_MAX_RANK,
    eff: { type: "stackDef", val: 0.11 },
    desc: "+0,11 obrany armády za bod za každé dokončené kolo boje" },
  { key: "kovarna", name: "Polní kovárna", max: MAIN_MAX_RANK,
    eff: { type: "roundHeal", val: 0.6, timing: { every: 3 } },
    desc: "každé 3. kolo: 0,6 % kumulativních ztrát za bod se vrací do řad" },
  { key: "pokrik", name: "Chorál hlubin", max: MAIN_MAX_RANK, ult: true,
    eff: { type: "roundArmy", val: 1.5, timing: { every: 3 } },
    desc: "každé 3. kolo: jednotky +1,5 % poškození za bod" },
  { key: "boreni_a", name: "Prolomení bran", max: SUB_MAX_RANK, parent: "boreni", branch: 0,
    eff: { type: "structAtk", val: 1.5 },
    desc: "+1,5 % síly proti opevněným polím za bod" },
  { key: "boreni_b", name: "Úvodní salva", max: SUB_MAX_RANK, parent: "boreni", branch: 1,
    eff: { type: "strike", val: 1.4 },
    desc: "1,4 nepřátel za bod padne ještě před prvním kolem boje" },
  { key: "hradba_a", name: "Kladiva předvoje", max: SUB_MAX_RANK, parent: "hradba", branch: 0,
    eff: { type: "unitDmg", val: 1.5, cond: { unit: "inf" } },
    desc: "pěchota +1,5 % poškození za bod" },
  { key: "hradba_b", name: "Držet průsmyk", max: SUB_MAX_RANK, parent: "hradba", branch: 1,
    eff: { type: "holdDef", val: 2 },
    desc: "+2 % obrany při obraně vlastního pole za bod" },
  { key: "kovarna_a", name: "Felčaři hlubin", max: SUB_MAX_RANK, parent: "kovarna", branch: 0,
    eff: { type: "heal", val: 2.2 },
    desc: "po vítězství se 2,2 % ztrát za bod vrací do armády" },
  { key: "kovarna_b", name: "Neúnavný krok", max: SUB_MAX_RANK, parent: "kovarna", branch: 1,
    eff: { type: "regen", val: 3.5 },
    desc: "+3,5 % obnovy výdrže za bod" },
  { key: "pokrik_a", name: "Žár výhně", max: SUB_MAX_RANK, parent: "pokrik", branch: 0,
    eff: { type: "stackAtk", val: 0.11 },
    desc: "+0,11 útoku armády za bod za každé dokončené kolo boje" },
  { key: "pokrik_b", name: "Dunění bubnů", max: SUB_MAX_RANK, parent: "pokrik", branch: 1,
    eff: { type: "cap", val: 7 },
    desc: "+7 velení za bod" },
];

HERO_DEFS.horda[1].tree = [ // Ukhra Vichřice
  { key: "cepel", name: "Čepel vichru", max: MAIN_MAX_RANK,
    eff: { type: "dmg", val: 1.4 },
    maxEff: { type: "stunImmune", val: 1 },
    desc: "+1,4 poškození velitele za bod; při plném naučení popelová zuřivost — velitelku nelze omráčit" },
  { key: "poryv", name: "Žhnoucí rány", max: MAIN_MAX_RANK,
    eff: { type: "cauter", val: 4 },
    desc: "rány od velitele se nehojí: nepřátelské léčení v boji −4 % za bod" },
  { key: "spary", name: "Drásavé spáry", max: MAIN_MAX_RANK,
    eff: { type: "shred", val: 2.2 },
    desc: "−2,2 % statů nepřátelského velitele za bod (max 40 %)" },
  { key: "smrst", name: "Popelná smršť", max: MAIN_MAX_RANK, ult: true,
    eff: { type: "roundDmg", val: 2.4, timing: { every: 2 }, targets: 2 },
    desc: "každé 2. kolo: udeří 2 nepřátelské velitele za 2,4 % svého poškození za bod" },
  { key: "cepel_a", name: "Ostří popela", max: SUB_MAX_RANK, parent: "cepel", branch: 0,
    eff: { type: "atk", val: 0.2 },
    desc: "+0,2 útoku za bod" },
  { key: "cepel_b", name: "První krev", max: SUB_MAX_RANK, parent: "cepel", branch: 1,
    eff: { type: "strike", val: 1.4 },
    desc: "úder před bojem: eliminace nepřátel +1,4 za bod" },
  { key: "poryv_a", name: "Dvojí poryv", max: SUB_MAX_RANK, parent: "poryv", branch: 0,
    eff: { type: "followUp", val: 2.4 },
    desc: "+2,4 % šance za bod na navazující úder" },
  { key: "poryv_b", name: "Neúnavná štvanice", max: SUB_MAX_RANK, parent: "poryv", branch: 1,
    eff: { type: "pursuit", val: 2 },
    desc: "+2 % šance za bod na neodvratný úder" },
  { key: "spary_a", name: "Drtivý dopad", max: SUB_MAX_RANK, parent: "spary", branch: 0,
    eff: { type: "stunChance", val: 1.5 },
    desc: "1,5 % šance za bod omráčit nepřátelského velitele na kolo boje (max 35 %)" },
  { key: "spary_b", name: "Dusivý popel", max: SUB_MAX_RANK, parent: "spary", branch: 1,
    eff: { type: "slowEnemy", val: 0.24 },
    desc: "−0,24 iniciativy nepřátel za bod (max 4)" },
  { key: "smrst_a", name: "Blesk z popela", max: SUB_MAX_RANK, parent: "smrst", branch: 0,
    eff: { type: "roundDmg", val: 2, timing: { round: 1 } },
    desc: "1. kolo: udeří nepřátelského velitele za 2 % svého poškození za bod" },
  { key: "smrst_b", name: "Žár smršti", max: SUB_MAX_RANK, parent: "smrst", branch: 1,
    eff: { type: "spell", val: 1 },
    desc: "+1 magické poškození velitele za bod (obchází útok i obranu)" },
];

HERO_DEFS.vhorren[3].tree = [ // Nespící Ordwal
  { key: "kletba", name: "Kletba úpadku", max: MAIN_MAX_RANK,
    eff: { type: "shred", val: 2.0 },
    desc: "−2 % statů nepřátelského velitele za bod" },
  { key: "padli", name: "Vstávání padlých", max: MAIN_MAX_RANK,
    eff: { type: "roundHeal", val: 0.6, timing: { every: 2 } },
    desc: "každé 2. kolo: 0,6 % kumulativních ztrát za bod vstává zpět do řad" },
  { key: "sileni", name: "Šepot hrobů", max: MAIN_MAX_RANK,
    eff: { type: "madness", val: 0.8 },
    desc: "0,8 % šance za bod uvrhnout nepřátelskou formaci do šílenství na kolo boje" },
  { key: "hnev", name: "Hněv Vhorrenu", max: MAIN_MAX_RANK, ult: true,
    eff: { type: "roundDmg", val: 2.2, timing: { every: 3 }, targets: 2 },
    desc: "každé 3. kolo: velká kletba zasáhne 2 nepřátelské cíle za 2,2 % velitelova poškození za bod" },
  { key: "kletba_a", name: "Zhoubný stín", max: SUB_MAX_RANK, parent: "kletba", branch: 0,
    eff: { type: "spell", val: 1 },
    desc: "+1 magického poškození velitele za bod (obchází útok i obranu)" },
  { key: "kletba_b", name: "Mrtvolný chlad", max: SUB_MAX_RANK, parent: "kletba", branch: 1,
    eff: { type: "slowEnemy", val: 0.24 },
    desc: "−0,24 iniciativy nepřátel za bod" },
  { key: "padli_a", name: "Sběr kostí", max: SUB_MAX_RANK, parent: "padli", branch: 0,
    eff: { type: "heal", val: 2.2 },
    desc: "po vítězství se 2,2 % ztrát za bod vrací do řad" },
  { key: "padli_b", name: "Hradba kostí", max: SUB_MAX_RANK, parent: "padli", branch: 1,
    eff: { type: "hp", val: 7 },
    desc: "+7 životů velitele za bod" },
  { key: "sileni_a", name: "Mrazivý děs", max: SUB_MAX_RANK, parent: "sileni", branch: 0,
    eff: { type: "stunChance", val: 1.5 },
    desc: "1,5 % šance za bod omráčit nepřátelského velitele na kolo boje" },
  { key: "sileni_b", name: "Rubáš stínů", max: SUB_MAX_RANK, parent: "sileni", branch: 1,
    eff: { type: "ward", val: 0.65 },
    desc: "−0,65 % poškození od nepřátelských velitelů a kouzel za bod" },
  { key: "hnev_a", name: "Popelový štít", max: SUB_MAX_RANK, parent: "hnev", branch: 0,
    eff: { type: "def", val: 0.22 },
    desc: "+0,22 obrany za bod" },
  { key: "hnev_b", name: "Hlad mrtvých", max: SUB_MAX_RANK, parent: "hnev", branch: 1,
    eff: { type: "roundArmy", val: 1.4, timing: { every: 3 } },
    desc: "každé 3. kolo: jednotky +1,4 % poškození za bod" },
];

HERO_DEFS.gryk[3].tree = [ // Mrk Houževnatý
  { key: "paraty", name: "Pilné pařáty", max: MAIN_MAX_RANK,
    eff: { type: "harvest", val: 2 },
    desc: "+2 % výnosu Sklizně kraje za bod" },
  { key: "cenich", name: "Krunýř roje", max: MAIN_MAX_RANK,
    eff: { type: "stackDef", val: 0.13 },
    desc: "+0,13 obrany armády za bod za každé dokončené kolo boje" },
  { key: "obklady", name: "Bahenní obklady", max: MAIN_MAX_RANK,
    eff: { type: "roundHeal", val: 0.7, timing: { every: 2 } },
    desc: "každé 2. kolo se 0,7 % kumulativních ztrát za bod vrací do řad" },
  { key: "zne", name: "Žně Velkého roje", max: MAIN_MAX_RANK, ult: true,
    eff: { type: "harvest", val: 3 },
    desc: "+3 % výnosu Sklizně kraje za bod" },
  { key: "paraty_a", name: "Nosiči z nor", max: SUB_MAX_RANK, parent: "paraty", branch: 0,
    eff: { type: "stamCost", val: 2.2 },
    desc: "−2,2 % ceny výdrže pochodů za bod" },
  { key: "paraty_b", name: "Pečlivé paběrky", max: SUB_MAX_RANK, parent: "paraty", branch: 1,
    eff: { type: "harvest", val: 1.5 },
    desc: "+1,5 % výnosu Sklizně kraje za bod" },
  { key: "cenich_a", name: "Bystrá kukadla", max: SUB_MAX_RANK, parent: "cenich", branch: 0,
    eff: { type: "xp", val: 3 },
    desc: "+3 % zkušeností za bod" },
  { key: "cenich_b", name: "Tajné brody", max: SUB_MAX_RANK, parent: "cenich", branch: 1,
    eff: { type: "convoy", val: 3.5 },
    desc: "posily k Mrkovi jdou o 3,5 % rychleji za bod" },
  { key: "obklady_a", name: "Mechové lože", max: SUB_MAX_RANK, parent: "obklady", branch: 0,
    eff: { type: "regen", val: 3.5 },
    desc: "+3,5 % obnovy výdrže za bod" },
  { key: "obklady_b", name: "Tuhý kořínek", max: SUB_MAX_RANK, parent: "obklady", branch: 1,
    eff: { type: "hp", val: 8 },
    desc: "+8 životů hrdiny za bod" },
  { key: "zne_a", name: "Zlatá žíla", max: SUB_MAX_RANK, parent: "zne", branch: 0,
    eff: { type: "gold", val: 0.3 },
    desc: "po dobytí +0,3 zlata × úroveň pole za bod" },
  { key: "zne_b", name: "Semknutý roj", max: SUB_MAX_RANK, parent: "zne", branch: 1,
    eff: { type: "stackDef", val: 0.1 },
    desc: "+0,1 obrany armády za bod za každé dokončené kolo boje" },
];

// ---------- Dekorátor a kontrola stromů (Audit 2) ----------
// Strom je ploché pole 12 uzlů: nejdřív 4 hlavní dovednosti (15 ranků),
// pak 8 podřízených (7 ranků) odkazujících na rodiče přes `parent` a stranu
// větve přes `branch`. Dekorátor hlavním doplní `slot` (0–3, pořadí
// odemykání) a `main`; chybu v definici shodí hned při načtení souboru,
// ne až uprostřed bitvy. Pořadí hlavní→podřízené je závazné (spoléhá na něj
// aiSpendSkills i UI).
for (const fkey in HERO_DEFS) {
  for (const hd of HERO_DEFS[fkey]) {
    const bad = m => { throw new Error(`HERO_DEFS ${fkey}/${hd.name}: ${m}`); };
    const keys = new Set();
    let slot = 0, seenSub = false;
    for (const s of hd.tree) {
      if (keys.has(s.key)) bad(`duplicitní klíč dovednosti „${s.key}“`);
      keys.add(s.key);
      if (s.parent) {
        seenSub = true;
        if (s.maxEff) bad(`podřízená dovednost „${s.key}“ nesmí mít maxEff`);
        if (s.max !== SUB_MAX_RANK) bad(`podřízená dovednost „${s.key}“ má mít max ${SUB_MAX_RANK}`);
        continue;
      }
      if (seenSub) bad(`hlavní dovednost „${s.key}“ stojí až za podřízenými`);
      if (s.max !== MAIN_MAX_RANK) bad(`hlavní dovednost „${s.key}“ má mít max ${MAIN_MAX_RANK}`);
      s.main = true;
      s.slot = slot++;
      // mistrovský bonus za 15/15: vlastní má přednost, jinak podle rysu
      if (!s.maxEff) {
        const byTrait = (TRAIT_MAX_EFFS[hd.trait] || [])[s.slot];
        if (!byTrait) bad(`hlavní dovednost „${s.key}“ nemá mistrovský bonus (rys ${hd.trait})`);
        s.maxEff = byTrait;
        s.maxEffTrait = true;   // pro UI: bonus pochází z rysu velitele
      }
    }
    if (slot !== SKILL_UNLOCK_MAIN.length) bad(`očekávány 4 hlavní dovednosti, nalezeno ${slot}`);
    for (const s of hd.tree)
      if (s.parent && !keys.has(s.parent)) bad(`„${s.key}“ odkazuje na neznámého rodiče „${s.parent}“`);
    const cap = hd.tree.find(s => s.ult);
    if (!cap || !cap.main || cap.slot !== 3) bad("vrcholná dovednost (ult) musí být 4. hlavní uzel");
  }
}

// ---------- Předměty a kořist ----------
// Šest slotů výbavy = šest základních statů hrdiny: každý předmět sám od sebe
// přidává stat svého slotu (hodnota = síla předmětu, roste s raritou).
const ITEM_SLOTS = {
  weapon: { name: "Zbraň",    icon: "⚔",  stat: "dmg",   base: 3 },   // +poškození hrdiny
  shield: { name: "Štít",     icon: "🛡", stat: "def",   base: 1 },   // +obrana
  armor:  { name: "Brnění",   icon: "🎽", stat: "hp",    base: 12 },  // +životy
  helmet: { name: "Helma",    icon: "🪖", stat: "spell", base: 3 },   // +kouzla (ohnisko vůle)
  boots:  { name: "Boty",     icon: "🥾", stat: "speed", base: 0.7 }, // +rychlost
  gloves: { name: "Rukavice", icon: "🧤", stat: "atk",   base: 1 },   // +útok
};
const ITEM_SLOT_KEYS = Object.keys(ITEM_SLOTS);

const RARITIES = [
  { name: "obyčejná kvalita",    color: "#9aa5b1", mult: 1 },
  { name: "kvalitní zpracování", color: "#63c76a", mult: 1.5 },
  { name: "vzácný kus",          color: "#5aa4e6", mult: 2.2 },
  { name: "epická relikvie",     color: "#b06ae0", mult: 3.2 },
  { name: "legendární dědictví", color: "#e0b13d", mult: 4.5 },
];

const ITEM_NAMES = {
  weapon: ["Meč", "Sekera", "Kopí", "Palcát"],
  shield: ["Štít", "Pavéza", "Puklíř"],
  armor:  ["Kožená zbroj", "Kroužková zbroj", "Plátová zbroj"],
  helmet: ["Přilba", "Šišák", "Helma"],
  boots:  ["Škorně", "Jezdecké boty", "Okované boty"],
  gloves: ["Rukavice", "Latnice", "Pěstnice"],
};
const ITEM_SUFFIX = ["z Popelné války", "starého krále", "říšské gardy",
  "z hlubin Vellaru", "prvních dnů", "Trůnního města"];

// v0.9: výbava má afinitu ke straně dobra/zla — vlastní jména a vzhled;
// hrdina smí nosit jen kusy své strany (kusy bez `side` z dřívějška jsou
// univerzální a fungují všem)
const ITEM_SIDE_NAMES = {
  dobro: {
    weapon: ["Čepel úsvitu", "Meč strážců", "Kopí jitra", "Palcát světla"],
    shield: ["Sluneční pavéza", "Štít poutníků", "Zrcadlový puklíř"],
    armor:  ["Zbroj úsvitu", "Stříbřitá kroužkovka", "Plátovka řádu"],
    helmet: ["Přilba jitřenky", "Šišák světlonoše", "Diadém svítání"],
    boots:  ["Škorně poutníka", "Boty větrných plání", "Okované boty hlídky"],
    gloves: ["Rukavice jitra", "Latnice řádu", "Pěstnice strážce"],
  },
  zlo: {
    weapon: ["Popelný sekáč", "Čepel z jam", "Trnové kopí", "Drtič lebek"],
    shield: ["Kostěná pavéza", "Štít z vraků", "Ohořelý puklíř"],
    armor:  ["Zbroj z popela", "Ostnatá kroužkovka", "Pláty temnot"],
    helmet: ["Rohatá přilba", "Šišák nájezdníků", "Maska děsu"],
    boots:  ["Škorně nájezdníka", "Boty spálenišť", "Okovaný krok"],
    gloves: ["Drápavé rukavice", "Latnice jam", "Pěstnice smečky"],
  },
};
const ITEM_SIDE_SUFFIX = {
  dobro: ["ze Světlých dvorů", "královské přísahy", "prvních strážců",
    "z yllienských hájů", "úsvitní hlídky", "Trůnního města"],
  zlo: ["z Popelných plání", "krvavé přísahy", "zlomených okovů",
    "z durgarských jam", "půlnoční smečky", "Trůnního města"],
};

// ---------- Sety předmětů ----------
// Kusy setu jsou zvláštní druh předmětu (vlastní jména po slotech); nošení
// více kusů téhož setu dává bonusy navíc — effs používají stejné typy jako
// dovednosti, takže je heroStats sčítá se vším ostatním.
const ITEM_SETS = {
  valecnik: {
    name: "Zbroj Popelného válečníka", color: "#e0705a",
    pieces: { weapon: "Popelný meč", shield: "Popelná pavéza", armor: "Popelný kyrys",
      helmet: "Popelná přilba", boots: "Popelné okovky", gloves: "Popelné latnice" },
    bonuses: [
      { pieces: 2, desc: "+1 útoku", effs: [{ type: "atk", val: 1 }] },
      { pieces: 4, desc: "+2 obrany", effs: [{ type: "def", val: 2 }] },
      { pieces: 6, desc: "první úder: eliminuje 15 nepřátel", effs: [{ type: "strike", val: 15 }] },
    ] },
  poutnik: {
    name: "Šat Větrného poutníka", color: "#5ec4d6",
    pieces: { weapon: "Poutnická hůl", shield: "Lehký terč", armor: "Větrný plášť",
      helmet: "Kapuce poutníka", boots: "Toulavé boty", gloves: "Jezdecké rukavice" },
    bonuses: [
      { pieces: 2, desc: "−8 % času pochodu", effs: [{ type: "speed", val: 8 }] },
      { pieces: 4, desc: "−15 % ceny výdrže pochodů", effs: [{ type: "stamCost", val: 15 }] },
      { pieces: 6, desc: "+35 % obnovy výdrže", effs: [{ type: "regen", val: 35 }] },
    ] },
  strazce: {
    name: "Plát Kamenného strážce", color: "#a8b58a",
    pieces: { weapon: "Strážcovo kladivo", shield: "Kamenná zeď", armor: "Žulový plát",
      helmet: "Strážní šišák", boots: "Pevné škorně", gloves: "Kamenné pěstnice" },
    bonuses: [
      { pieces: 2, desc: "+1 obrany", effs: [{ type: "def", val: 1 }] },
      { pieces: 4, desc: "+15 % obrany drženého pole", effs: [{ type: "holdDef", val: 15 }] },
      { pieces: 6, desc: "stráž čerpá o 40 % méně výdrže", effs: [{ type: "guardEff", val: 40 }] },
    ] },
  lovec: {
    name: "Výstroj Krvavého lovce", color: "#c98ae0",
    pieces: { weapon: "Lovecký tesák", shield: "Trofejní štít", armor: "Kožešinová vesta",
      helmet: "Lebka kořisti", boots: "Stopařské mokasíny", gloves: "Stahovací rukavice" },
    bonuses: [
      { pieces: 2, desc: "+15 % zkušeností", effs: [{ type: "xp", val: 15 }] },
      { pieces: 4, desc: "po dobytí +2 zlata × úroveň pole", effs: [{ type: "gold", val: 2 }] },
      { pieces: 6, desc: "po vítězství se 15 % ztrát vrací", effs: [{ type: "heal", val: 15 }] },
    ] },
  // sety v0.5: čisté staty hrdiny a přímé poškození velitele (ne jednotek)
  sampion: {
    name: "Regálie Popelného šampiona", color: "#e8c26a",
    pieces: { weapon: "Šampionova čepel", shield: "Šampionův terč", armor: "Šampionův kyrys",
      helmet: "Vavřínová přilba", boots: "Šampionovy škorně", gloves: "Šampionovy latnice" },
    bonuses: [
      { pieces: 2, desc: "+40 životů hrdiny", effs: [{ type: "hp", val: 40 }] },
      { pieces: 4, desc: "+1 útoku a +1 obrany", effs: [{ type: "atk", val: 1 }, { type: "def", val: 1 }] },
      { pieces: 6, desc: "+2 rychlosti a +60 životů hrdiny", effs: [{ type: "spd", val: 2 }, { type: "hp", val: 60 }] },
    ] },
  kat: {
    name: "Zbroj Rudého kata", color: "#d5504a",
    pieces: { weapon: "Katova sekera", shield: "Krvavý puklíř", armor: "Rudá kytlice",
      helmet: "Katova kukla", boots: "Popravčí boty", gloves: "Krvavé rukavice" },
    bonuses: [
      { pieces: 2, desc: "+6 poškození hrdiny", effs: [{ type: "dmg", val: 6 }] },
      { pieces: 4, desc: "+12 poškození hrdiny", effs: [{ type: "dmg", val: 12 }] },
      { pieces: 6, desc: "+1 útoku a +20 poškození hrdiny", effs: [{ type: "atk", val: 1 }, { type: "dmg", val: 20 }] },
    ] },
  zrec: {
    name: "Roucho Popelného zřece", color: "#9b6ae0",
    pieces: { weapon: "Zřecova hůl", shield: "Runový terč", armor: "Zřecovo roucho",
      helmet: "Zřecova čapka", boots: "Zřecovy střevíce", gloves: "Runové rukavice" },
    bonuses: [
      { pieces: 2, desc: "+10 kouzelného poškození každé kolo", effs: [{ type: "spell", val: 10 }] },
      { pieces: 4, desc: "+15 kouzelného poškození, −10 % poškození od hrdinů a kouzel",
        effs: [{ type: "spell", val: 15 }, { type: "ward", val: 10 }] },
      { pieces: 6, desc: "+30 kouzelného poškození každé kolo", effs: [{ type: "spell", val: 30 }] },
    ] },
};
const ITEM_SET_KEYS = Object.keys(ITEM_SETS);
const SET_DROP_CHANCE = 0.35; // šance, že kořist je kusem setu

// kolik kusů daného setu má hrdina nasazeno
function heroSetCounts(hero) {
  const counts = {};
  for (const s of ITEM_SLOT_KEYS) {
    const it = hero.equip[s];
    if (it && it.set) counts[it.set] = (counts[it.set] || 0) + 1;
  }
  return counts;
}

// součet efektů daného typu z aktivních setových bonusů hrdiny
function heroSetEff(faction, heroIdx, type) {
  const counts = heroSetCounts(faction.heroes[heroIdx]);
  let v = 0;
  for (const setKey in counts) {
    for (const b of ITEM_SETS[setKey].bonuses) {
      if (counts[setKey] < b.pieces) continue;
      for (const e of b.effs) if (e.type === type) v += e.val;
    }
  }
  return v;
}

let nextItemId = 1;

// šance na vyšší raritu roste se stupněm pole a u struktur
function lootBonus(tile) {
  let bonus = tile.level * 0.025;
  if (tile.structure === "city") bonus += 0.15;
  if (tile.structure === "bridge") bonus += 0.10;
  if (tile.structure === "fortress") bonus += 0.25;
  if (tile.structure === "bastion") bonus += 0.25;
  if (tile.structure === "grandfort") bonus += 0.35;
  if (tile.structure === "throne") bonus += 0.45;
  return bonus;
}

function rollRarity(tile) {
  const bonus = lootBonus(tile);
  const x = rng() + bonus;
  if (x > 1.25) return 4;
  if (x > 1.05) return 3;
  if (x > 0.85) return 2;
  if (x > 0.60) return 1;
  return 0;
}

// pravděpodobnosti rarit kořisti z daného pole (odvozeno přesně z rollRarity)
function lootChances(tile) {
  const bonus = lootBonus(tile);
  const above = t => Math.max(0, Math.min(1, 1 - (t - bonus)));
  const p4 = above(1.25);
  const p3 = above(1.05) - p4;
  const p2 = above(0.85) - p4 - p3;
  const p1 = above(0.60) - p4 - p3 - p2;
  return [Math.max(0, 1 - p1 - p2 - p3 - p4), p1, p2, p3, p4];
}

function makeItem(tile, rarityBonus = 0, fixedRarity = null, side = null) {
  const slot = ITEM_SLOT_KEYS[randInt(0, ITEM_SLOT_KEYS.length - 1)];
  const def = ITEM_SLOTS[slot];
  const rarity = fixedRarity != null ? fixedRarity
    : Math.min(RARITIES.length - 1, rollRarity(tile) + rarityBonus);
  const value = Math.max(1, Math.round(
    def.base * RARITIES[rarity].mult * (0.85 + 0.025 * tile.level + rng() * 0.25)));
  // kus setu je zvláštní druh předmětu s vlastním jménem a příslušností k setu
  const pasK = rollItemPassive(rarity);
  if (rng() < SET_DROP_CHANCE) {
    const setKey = ITEM_SET_KEYS[randInt(0, ITEM_SET_KEYS.length - 1)];
    const out = { id: nextItemId++, slot, rarity, value, set: setKey,
      name: ITEM_SETS[setKey].pieces[slot] };
    if (side) out.side = side;
    if (pasK) out.pas = pasK;
    return out;
  }
  const names = side ? ITEM_SIDE_NAMES[side][slot] : ITEM_NAMES[slot];
  let name = names[randInt(0, names.length - 1)];
  if (rarity >= 3) {
    const sufs = side ? ITEM_SIDE_SUFFIX[side] : ITEM_SUFFIX;
    name += " " + sufs[randInt(0, sufs.length - 1)];
  }
  const out = { id: nextItemId++, slot, rarity, value, name };
  if (side) out.side = side;
  if (pasK) out.pas = pasK;
  return out;
}

// „DRUH" kusu (v0.39): kmen jména bez přípony vzácnosti — identita ikonky.
// „Čepel z jam krvavé přísahy" i „Čepel z jam půlnoční smečky" jsou týž druh
// (stejná ikonka), „Popelný sekáč" je jiný druh. Sety a signature mají pevná
// jména = vlastní druh. Hledá se NEJDELŠÍ kmen z generátorových poolů
// (krátký „Štít" nesmí ukrást „Štít poutníků").
function itemZaklad(it) {
  if (!it || !it.name) return "";
  if (it.sig) return it.name;
  if (it.set && ITEM_SETS[it.set]) return ITEM_SETS[it.set].pieces[it.slot] || it.name;
  let best = "";
  const pooly = [ITEM_NAMES[it.slot] || [],
    ITEM_SIDE_NAMES.dobro[it.slot] || [], ITEM_SIDE_NAMES.zlo[it.slot] || []];
  for (const pool of pooly)
    for (const zaklad of pool)
      if (it.name.startsWith(zaklad) && zaklad.length > best.length) best = zaklad;
  return best || it.name;
}

// popis zvláštní vlastnosti kusu i s aktuální silou (po zušlechtění)
function itemPassiveStr(item) {
  const p = item && item.pas && ITEM_PASSIVES[item.pas];
  if (!p) return "";
  const cisla = itemPassiveEffs(item).map(e => {
    const n = Math.round(e.val * 100) / 100;
    return (n > 0 ? "+" : "") + String(n).replace(".", ",") + p.jed;
  }).join(", ");
  return `${p.name}: ${p.desc} (${cisla})`;
}

function itemEffectStr(item) {
  const stat = ITEM_SLOTS[item.slot].stat;
  const v = itemValueOf(item);
  if (stat === "dmg")   return `+${v} poškození hrdiny`;
  if (stat === "def")   return `+${v} obrany`;
  if (stat === "hp")    return `+${v} životů`;
  if (stat === "spell") return `+${v} kouzelného poškození`;
  if (stat === "speed") return `+${v} rychlosti`;
  return `+${v} útoku`;
}

// kořist z boje padá už JEN z klíčových staveb (v0.6.2): Trůnní město dává
// zaručenou legendárku, pevnosti obou okruhů epický kus s 50% šancí —
// všechno ostatní vybavení pochází z truhel (💠)
function dropStructLoot(faction, heroIdx, tile, rarity, chance = 1) {
  if (rng() >= chance) return false;
  const item = makeItem(tile, 0, rarity, sideOfFaction(faction.key));
  faction.items.push(item);
  emitEvent("loot", faction.id);
  addLog(faction.id, { klic: "kron.korist", param: { hrdina: heroDef(faction, heroIdx).name, rod: faction.name, ikona: ITEM_SLOTS[item.slot].icon, kus: item.name + (item.set ? ` (${ITEM_SETS[item.set].name})` : ""), efekt: itemEffectStr(item) } });
  return true;
}

function equipItem(faction, heroIdx, itemId) {
  const idx = faction.items.findIndex(it => it.id === itemId);
  if (idx === -1) return false;
  // afinita stran: kus dobra nosí jen hrdinové dobra a naopak (v0.9);
  // kusy bez side (z dřívějška) jsou univerzální
  if (faction.items[idx].side && faction.items[idx].side !== sideOfFaction(faction.key))
    return false;
  const item = faction.items.splice(idx, 1)[0];
  const hero = faction.heroes[heroIdx];
  if (hero.equip[item.slot]) faction.items.push(hero.equip[item.slot]);
  hero.equip[item.slot] = item;
  return true;
}

function unequipItem(faction, heroIdx, slot) {
  const hero = faction.heroes[heroIdx];
  if (!hero.equip[slot]) return false;
  faction.items.push(hero.equip[slot]);
  hero.equip[slot] = null;
  return true;
}

function emptyEquip() {
  const e = {};
  for (const s of ITEM_SLOT_KEYS) e[s] = null;
  return e;
}

// ---------- Účet, popelná jádra a truhly (v0.6) ----------
// Trvalý postup po vzoru RtW: hrdinové (úrovně, dovednosti, výbava) a sklad
// předmětů žijí na účtu a přežívají sezóny. Prémiová měna 💠 popelná jádra
// se získává z herních událostí a promo kódů (skutečné platby zapojené nejsou
// — obchod je připravený, ale jádra rozdává jen hra a kódy).
const CORE_ICON = "💠";
// Uvítací dárek nového účtu. ZVÝŠENO 30. 8. 2026 ze 120 na 5 000: poplatek
// klanové burzy (IV-R) platí OBĚ strany, takže se 120 jádry by byl nováček
// prakticky odříznutý od obchodu se spoluhráči. Vedlejší důsledek, který je
// vidět chtít: 5 000 = 12,5 truhly, tedy přesně počítadlo smůly (PITY_AT),
// takže start obsahuje jistou legendu, když si hráč truhly otevře naráz.
const ACCOUNT_START_CORES = 5000;

const CHEST_ITEMS = 3; // každé otevření sype 3 kusy (materiál na Strengthen)
// po kolikáté truhle bez legendy ji hráč dostane jistě (počítadlo smůly)
const PITY_AT = 12;

// v0.9: každá truhla existuje ve dvou provedeních — pro stranu dobra a zla
// (sype výbavu a dárky hrdinů jen své strany). Váhy rarit snížené o 10 bodů
// (minimálně 0,5) — uvolněný prostor do 100 zabírají posilovací doplňky
// (jednorázové zrychlení stavby / produkce říše).
// v0.14: levnější stupně (Poutníkova/Runová truhla) zrušené — zůstala jediná
// truhla na stranu a sype přesně CHEST_ITEMS kusů. Dárek hrdiny UŽ NENÍ drop
// navíc: bere jeden ze slotů a losuje se ze STEJNÉ tabulky rarit jako výbava
// (GIFT_SHARE dělí prostor rarit napůl), takže dárek dané rarity padá se
// stejnou šancí jako výbava té rarity. Hrdinské tiery jsou jen tři, mapuje
// je GIFT_RARITY_TIER.
const CHESTS = {
  // bulkCost = cena za CHEST_BULK truhel naráz (jednotlivě by stálo 2000)
  royal:  { name: "Truhla Popelného krále", cost: 400, bulkCost: 1900, color: "#e0b13d", icon: "👑",
    sideName: { dobro: "Truhla Světlého dvora", zlo: "Truhla Popelného krále" },
    desc: "Poklad z trůnních sklepení — jen vzácné a lepší, nejvyšší šance na legendy.",
    weights: [0, 0, 40, 24, 6], setChance: 0.6, lvl: [7, 12],
    boostTierW: [0, 45, 55] },
};

// dárek hrdiny bere půlku prostoru rarit (zbytek je výbava), takže dárek
// rarity R padá stejně často jako kus výbavy rarity R. Rarit je pět, tierů
// hrdinů tři — vzácný a níž = Běžný, epický = Epický, legendární = Legendární.
const GIFT_SHARE = 0.5;
const GIFT_RARITY_TIER = [0, 0, 0, 1, 2];

// v0.27: první truhla dne zdarma (reset o půlnoci místního času serveru),
// zvací list = okamžité odemčení hrdiny (vzácný drop + jistota po smůle)
// a wishlist — seznam přání zdvojnásobí šanci, že dárek/list padne na něj.
const INVITE_PITY_AT = 200;      // po tolika truhlách bez listu přijde jistě
const INVITE_CHANCE = 0.02;      // šance na zvací list v jednom otevření
const INVITE_TIER_W = [70, 25, 5]; // váhy tieru hrdiny na listu (Legendary nejvzácnější)
// Jistota po INVITE_PITY_AT truhlách míří výš než běžný los: obyčejný hrdina
// za 200 otevření (= 200 dní truhly zdarma) by byl výsměch, takže se losuje
// jen mezi epickým a legendárním. Na „vždy legendární" stačí [0, 0, 100].
const INVITE_PITY_TIER_W = [0, 30, 70];
const INVITE_DUP_CORES = 200;    // list na už odemčeného hrdinu → náhrada v jádrech
const WISHLIST_MAX = 4;
const WISHLIST_CHANCE = 0.5;     // šance, že se výběr omezí na seznam přání

function dnesniDen() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0")
    + "-" + String(d.getDate()).padStart(2, "0");
}

function chestFreeAvailable(acc) {
  return !!acc && acc.freeChestDay !== dnesniDen();
}

function wishlistToggle(acc, key) {
  if (!acc) return false;
  migrateAccount(acc);
  const i = acc.wishlist.indexOf(key);
  if (i >= 0) { acc.wishlist.splice(i, 1); return true; }
  if (acc.wishlist.length >= WISHLIST_MAX) return false;
  if (!key.includes(":") || !HERO_DEFS[key.split(":")[0]]) return false;
  acc.wishlist.push(key);
  return true;
}

// zvací list: okamžité odemčení hrdiny (= 1. hvězda); duplicitní se mění v jádra
function applyInviteToAccount(acc, key) {
  migrateAccount(acc);
  const [fkey, idxS] = key.split(":");
  const name = HERO_DEFS[fkey][parseInt(idxS, 10)].name;
  if (heroUnlocked(acc, key)) {
    acc.cores += INVITE_DUP_CORES;
    return { key, name, type: "inviteDup", cores: INVITE_DUP_CORES };
  }
  // Zvací list hrdinu odemyká PŘÍMO a nasbíranou oddanost NEUTRÁCÍ ani nemaže
  // (acc.heroRespect se tu vůbec nesahá) — body zůstávají na účtu a počítají se
  // do další hvězdy. Nedostane se za něj 300 oddanosti; dostane se rovnou to,
  // co by za ně hráč koupil. Přeplatek tím nevznikne: cena hvězd roste, takže
  // co nestačilo na 1★, nestačí ani na 2★.
  acc.heroUnlocks[key] = 1;
  const entry = acc.heroProgress[key] || (acc.heroProgress[key] =
    { level: 1, xp: 0, stars: 0, skills: {}, skillPts: 0, equip: {} });
  if ((entry.stars || 0) < 1) { entry.stars = 1; entry.skillPts = (entry.skillPts || 0) + STAR_SKILL_POINT; }
  return { key, name, type: "invite" };
}

// los hrdiny pro zvací list: tier dle vah, přednost zamčeným a seznamu přání.
// `jistota` = list z počítadla smůly — losuje z INVITE_PITY_TIER_W a navíc
// nesmí propadnout v duplikát, dokud je na straně koho odemykat.
function rollInviteHero(acc, side, jistota) {
  const tier = weightedIndex(jistota ? INVITE_PITY_TIER_W : INVITE_TIER_W, Math.random());
  const pool = [[], [], []], zamceni = [[], [], []];
  for (const fkey in HERO_DEFS) {
    if (sideOfFaction(fkey) !== side) continue;
    HERO_DEFS[fkey].forEach((hd, i) => {
      const t = heroTierOf(fkey, i), key = fkey + ":" + i;
      pool[t].push(key);
      if (!heroUnlocked(acc, key)) zamceni[t].push(key);
    });
  }
  // Vysbíraný tier: přeteče se na NEJBLIŽŠÍ jiný se zamčeným hrdinou, aby
  // vzácný list nepropadl v pouhá jádra, dokud je koho odemykat (duplikát tak
  // zbude jen na kompletní sbírku strany). Nejbližší, ne nejvyšší — jinak by
  // se běžný list po vysbírání obyčejných změnil v automat na legendární.
  // Při stejné vzdálenosti míří jistota nahoru, běžný los dolů.
  let zdroj = zamceni[tier];
  if (!zdroj.length) {
    const jinde = [0, 1, 2].filter(t => t !== tier && zamceni[t].length)
      .sort((a, b) => Math.abs(a - tier) - Math.abs(b - tier) || (jistota ? b - a : a - b))[0];
    zdroj = jinde !== undefined ? zamceni[jinde] : pool[tier];
  }
  const prani = (acc.wishlist || []).filter(k => zdroj.includes(k));
  const vyber = prani.length && Math.random() < WISHLIST_CHANCE ? prani : zdroj;
  return vyber[Math.floor(Math.random() * vyber.length)];
}

// posilovací doplňky (v0.9): jednorázové předměty z truhel — po použití na
// běžící říši zdvojnásobí na 1/3/5 minut (dle tieru) rychlost staveb, nebo
// celou produkci surovin
const BOOST_KINDS = {
  build: { name: "Stavitelský rozkaz", icon: "🏗",
    desc: "stavby a vylepšení běží dvojnásobnou rychlostí" },
  prod:  { name: "Roh hojnosti", icon: "🎺",
    desc: "celá produkce říše se zdvojnásobí" },
};
const BOOST_MINUTES = [1, 3, 5]; // délka dle tieru (Běžný/Epický/Legendární)

function weightedIndex(weights, roll) {
  let r = roll * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return weights.length - 1;
}

function makeBoost(chestDef) {
  return { boost: Math.random() < 0.5 ? "build" : "prod",
    tier: weightedIndex(chestDef.boostTierW, Math.random()) };
}

// promo kódy (server je může přepsat vlastní tabulkou v accounts.json)
// Kódy začínající na TEST jsou LADICÍ: jdou uplatnit opakovaně, aby se testování
// truhel nezaseklo na jednorázovém limitu. Před ostrým během je klidně smaž.
const CORE_CODES = { "VITEJTE": 200, "POPEL50": 50, "VELLAR": 100,
  "PANVELLARU": 1000000, "TEST100K": 100000, "TEST1K": 1000 };
const CODE_REPEATABLE = /^TEST/;

// předmět z truhly: rarita dle vah truhly, hodnota dle jejího rozsahu úrovní,
// jména a afinita dle strany truhly.
// Používá Math.random (ne herní rng) — truhly se otvírají i mimo běžící hru.
// forceRarity: index rarity, který se má vynutit (počítadlo smůly) — jinak null
function makeChestItem(tier, side, forceRarity = null) {
  const def = CHESTS[tier];
  if (!def) return null;
  side = side === "zlo" ? "zlo" : "dobro";
  // Královská truhla vzácně vydá signature kus některého hrdiny SVÉ strany
  // (vynucená rarita ho přeskakuje — hráč má dostat slíbenou legendu)
  if (tier === "royal" && forceRarity === null && Math.random() < 0.08) {
    const keys = Object.keys(SIGNATURE_ITEMS)
      .filter(k => sideOfFaction(k.split(":")[0]) === side);
    return makeSignatureItem(keys[Math.floor(Math.random() * keys.length)]);
  }
  const rarity = forceRarity !== null ? forceRarity
    : weightedIndex(def.weights, Math.random());
  const slot = ITEM_SLOT_KEYS[Math.floor(Math.random() * ITEM_SLOT_KEYS.length)];
  const lvl = def.lvl[0] + Math.random() * (def.lvl[1] - def.lvl[0]);
  const value = Math.max(1, Math.round(
    ITEM_SLOTS[slot].base * RARITIES[rarity].mult * (0.85 + 0.025 * lvl + Math.random() * 0.25)));
  const pas = rollItemPassive(rarity);
  if (Math.random() < def.setChance) {
    const setKey = ITEM_SET_KEYS[Math.floor(Math.random() * ITEM_SET_KEYS.length)];
    const kus = { slot, rarity, value, set: setKey, side,
      name: ITEM_SETS[setKey].pieces[slot] };
    if (pas) kus.pas = pas;
    return kus;
  }
  const names = ITEM_SIDE_NAMES[side][slot];
  let name = names[Math.floor(Math.random() * names.length)];
  if (rarity >= 3) {
    const sufs = ITEM_SIDE_SUFFIX[side];
    name += " " + sufs[Math.floor(Math.random() * sufs.length)];
  }
  const kus = { slot, rarity, value, name, side };
  if (pas) kus.pas = pas;
  return kus;
}

// verze tvaru stromů dovedností na účtu — zvýšení vyvolá jednorázový respec
// všech hrdinů (klíče dovedností a ranky se změnily, staré rozdělení bodů
// by v novém stromu bylo nelegální)
// v3 (v0.35): brána oddanosti — staré účty mohly mít ranky ve stromech,
// které nová pravidla zamykají (♥3/♥5); migrace body vrací a stromy čistí
const TREE_VERSION = 3;

// nový prázdný účet (server i místní účet v prohlížeči)
function emptyAccount(name) {
  return { name: name || "místní hráč", cores: ACCOUNT_START_CORES,
    inventory: [], heroProgress: {}, codesUsed: [],
    heroUnlocks: {}, heroRespect: {}, boosts: {}, pity: 0, treeV: TREE_VERSION,
    darky: {},          // v0.43: nasbírané dárky hrdinů jako předměty (klíč → počet)
    sigOdemceno: {}, // R10: jednou odemčené signature kusy (v0.35)
    // e-mail (v0.51): bez potvrzení se k účtu nedá přihlásit, ale sbírka
    // i postup na něm normálně vznikají — účet je jen zamčený, ne prázdný
    email: "", emailOvereno: false,
    // ETAPA 12b: jazyk patří na ÚČET, ne do localStorage — hráč se přihlásí
    // z jiného zařízení a hra musí zůstat v jeho jazyce
    jazyk: "" };
}

// UVÍTACÍ JÁDRA SE VYZVEDÁVAJÍ OVĚŘOVACÍM ODKAZEM (v0.58, zadání uživatele).
// Registrovaný účet nezačíná s jádry v ruce, ale s ČEKAJÍCÍ dávkou
// (`acc.jadraCekaji`); odkaz z mailu je vyzvedne a tím zároveň potvrdí adresu.
// Jeden mail místo dvou a ověření dostane důvod, proč na něj kliknout.
//
// ⚠ Stav nese POLE, ne příznak: staré účty `jadraCekaji` nemají, takže se
// jich to netýká, a po vyzvednutí pole mizí — vyzvednout jde tedy PRÁVĚ
// JEDNOU, ať se odkaz otevře kolikrát chce a ať se server mezitím restartuje.
// Sólo účet v prohlížeči žádné ověřování nemá a jádra dostává rovnou
// (`emptyAccount`), takže se ho změna netýká.
function jadraCekaji(acc) { return (acc && acc.jadraCekaji) | 0; }
function vyzvedniJadra(acc) {
  const n = jadraCekaji(acc);
  if (!n) return 0;
  acc.cores = (acc.cores | 0) + n;
  delete acc.jadraCekaji;
  return n;
}

// doplnění polí v0.9 na starší účty; hrdina s rozehraným postupem se počítá
// za odemčeného (kamarádi nepřijdou o hrdiny z dřívějška). Audit 2 navíc
// jednorázově vrací všechny investované body — POZOR: značka `treeV` musí
// zůstat na ÚČTU (ne v heroProgress), jinak by ji syncAccountFromFaction
// přepsal a každá další synchronizace by živé stromy zase smazala.
function migrateAccount(acc) {
  if (!acc) return acc;
  acc.heroUnlocks = acc.heroUnlocks || {};
  acc.heroRespect = acc.heroRespect || {};
  acc.boosts = acc.boosts || {};
  acc.pity = acc.pity | 0;              // počítadlo smůly (v0.18)
  acc.pityInvite = acc.pityInvite | 0;  // počítadlo smůly na zvací list (v0.27)
  acc.wishlist = acc.wishlist || [];    // seznam přání (v0.27)
  acc.freeChestDay = acc.freeChestDay || ""; // den poslední truhly zdarma (v0.27)
  acc.shopDay = acc.shopDay || "";      // rotující obchod: den a odběry (v0.27)
  acc.shopBought = acc.shopBought || {};
  acc.sigOdemceno = acc.sigOdemceno || {}; // R10 signature (v0.35)
  acc.darky = acc.darky || {};          // sklad dárků (v0.43)
  if (acc.email === undefined) acc.email = "";
  if (acc.jazyk === undefined) acc.jazyk = "";   // v0.62: prázdné = ber z prohlížeče
  // POZOR: staré účty vznikly PŘED povinným e-mailem — musí zůstat funkční,
  // jinak by si po nasazení nikdo z nich nezahrál. Ověřený je ten, kdo
  // e-mail buď potvrdil, nebo ho nikdy mít nemusel.
  if (acc.emailOvereno === undefined) acc.emailOvereno = !acc.email;
  // v0.44: dárky se sloučily do skupin rod×tier — staré klíče hrdinů převést
  for (const k of Object.keys(acc.darky)) {
    if (jeSkupinaDarku(k)) continue;
    const skup = giftGroupOfHero(k);
    acc.darky[skup] = (acc.darky[skup] | 0) + (acc.darky[k] | 0);
    delete acc.darky[k];
  }
  for (const key in (acc.heroProgress || {})) acc.heroUnlocks[key] = 1;
  if ((acc.treeV | 0) < TREE_VERSION) {
    for (const key in (acc.heroProgress || {})) {
      const pr = acc.heroProgress[key];
      pr.skills = {};
      pr.skillPts = totalSkillPtsForLevel(pr.level || 1)
        + (pr.stars || 0) * STAR_SKILL_POINT;
      // v0.35: hrdinové, kteří už ♥10 mají, dostávají signature kus zpětně
      // (migrace běží mimo živou hru — inventář je bezpečný cíl)
      if ((pr.stars || 0) >= SIG_STARS && !acc.sigOdemceno[key]) {
        acc.sigOdemceno[key] = 1;
        const kus = makeSignatureItem(key);
        if (kus) (acc.inventory = acc.inventory || []).push(kus);
      }
    }
    acc.treeV = TREE_VERSION;
    acc.respecNote = 1;   // klient jednou oznámí, že se stromy změnily
  }
  return acc;
}

function heroUnlocked(acc, key) {
  return !!(acc && acc.heroUnlocks && acc.heroUnlocks[key]);
}

// náhodný hrdina pro dárek z truhly: tier zadaný (odvozený z rarity slotu),
// hrdina ze strany truhly
// v0.44: los vrací SKUPINU (rod × tier), ne konkrétního hrdinu — dárek pak
// nakrmí kteréhokoli hrdinu té skupiny a mrtvý drop nevzniká. Seznam přání
// se mapuje na skupiny vysněných hrdinů.
function rollGiftGroup(tier, side, acc) {
  const pool = [];
  for (const fkey in HERO_DEFS) {
    if (sideOfFaction(fkey) !== side) continue;
    if (HERO_DEFS[fkey].some((hd, i) => heroTierOf(fkey, i) === tier))
      pool.push(giftGroupKey(fkey, tier));
  }
  if (!pool.length) return null;
  const prani = acc && acc.wishlist
    ? [...new Set(acc.wishlist.map(giftGroupOfHero))].filter(k => pool.includes(k)) : [];
  const vyber = prani.length && Math.random() < WISHLIST_CHANCE ? prani : pool;
  return vyber[Math.floor(Math.random() * vyber.length)];
}
// starý název drží zpětnou kompatibilitu čtecích míst a testů
function rollGiftHero(tier, side, acc) { return rollGiftGroup(tier, side, acc); }

// dárek hrdiny: +10 respektu na účet; při naplnění ceny další hvězdy hrdina
// povýší (1. hvězda = odemčení, +1 bod dovedností za každou hvězdu, uzdravení).
// liveFaction = běžící frakce majitele účtu: hvězdy najatého hrdiny drží živý
// hrdina (sync účtu by účetní zápis přepsal), jinak se píší do heroProgress.
// Hrdina na 25★ mění další dárky na 💠.
// ---------- Dárky jako předměty (v0.43) ----------
// Do v0.42 se dárek z truhly rovnou proměnil v oddanost cílového hrdiny — kdo
// nesbíral zrovna jeho, měl mrtvý drop. Nově padá dárek do SKLADU na účtu
// (acc.darky: klíč hrdiny → počet) a hráč ho použije sám, kdy chce. Tím se
// z dárků stane obchodovatelné zboží (klanová burza, etapa 9) a duplicita
// přestane být ztráta.
//
// Sklad je počítadlo, ne pole objektů: legendární hvězda stojí přes sto dárků
// a sto samostatných předmětů s vlastním id by nafouklo účet i profil v MP.
// Navenek (v inventáři) se stejně kreslí jako dlaždice s odznakem počtu.
function giftCount(acc, key) {
  return acc && acc.darky ? (acc.darky[key] | 0) : 0;
}

// dárek do skladu — vrací popis pro odhalení truhly (stejný tvar jako dřív,
// jen typ „giftItem“ místo okamžitého povýšení)
function grantGift(acc, key, pocet = 1) {
  migrateAccount(acc);
  // v0.44: klíč je SKUPINA rod×tier; starý klíč hrdiny se na skupinu převede
  const skup = jeSkupinaDarku(key) ? key : giftGroupOfHero(key);
  const { fkey, tier } = rozborSkupiny(skup);
  acc.darky[skup] = giftCount(acc, skup) + pocet;
  return { key: skup, name: (FACTION_DEFS.find(d => d.key === fkey) || {}).name || fkey,
    tier, darek: giftNameForGroup(fkey, tier), type: "giftItem",
    pocet, mam: acc.darky[skup] };
}

// použití dárků ze skladu: spotřebuje jich `pocet` (nebo kolik je) a připíše
// oddanost. Vrací totéž co applyGiftToAccount, takže oslavy odemčení a R10
// signature fungují beze změny.
function useGifts(acc, heroKey, pocet, liveFaction) {
  if (!acc || !heroKey || jeSkupinaDarku(heroKey)) return null;   // cíl je HRDINA
  migrateAccount(acc);
  const skup = giftGroupOfHero(heroKey);
  const mam = giftCount(acc, skup);
  if (mam <= 0) return null;
  pocet = Math.max(1, Math.min(Math.floor(pocet) || 1, mam));
  acc.darky[skup] = mam - pocet;
  if (!acc.darky[skup]) delete acc.darky[skup];
  return applyGiftToAccount(acc, heroKey, liveFaction, pocet);
}

function applyGiftToAccount(acc, key, liveFaction, pocet = 1) {
  migrateAccount(acc);
  const [fkey, idxS] = key.split(":");
  const defIdx = parseInt(idxS, 10);
  const name = HERO_DEFS[fkey][defIdx].name;
  let live = null, liveIdx = -1;
  if (liveFaction && liveFaction.key === fkey) {
    liveIdx = liveFaction.heroes.findIndex(h => h.defIdx === defIdx);
    if (liveIdx !== -1) live = liveFaction.heroes[liveIdx];
  }
  const pr = acc.heroProgress[key];
  const stars = live ? (live.stars || 0) : (pr ? pr.stars || 0 : 0);
  const darek = giftNameFor(fkey, defIdx);
  if (stars >= HERO_MAX_STARS) {
    const jadra = giftRespectFor(heroTierOf(fkey, defIdx)) * pocet;
    acc.cores += jadra;
    return { key, name, darek, type: "cores", cores: jadra };
  }
  // Povyšování je SMYČKA. Cena hvězdy roste, takže dárky samy o sobě přeplatek
  // neudělají — jenže zvací list odemyká hrdinu BEZ utracení nasbírané
  // oddanosti a tier hrdiny se mezi verzemi může změnit, takže na účtu můžou
  // zbýt body na několik hvězd naráz. Jeden dárek pak povýší o všechny.
  const tier = heroTierOf(fkey, defIdx);
  let zbylo = (acc.heroRespect[key] || 0) + giftRespectFor(tier) * pocet;
  let hvezd = stars;
  while (hvezd < HERO_MAX_STARS && zbylo >= respectForStar(hvezd + 1, tier)) {
    zbylo -= respectForStar(hvezd + 1, tier);
    hvezd++;
  }
  acc.heroRespect[key] = zbylo;
  const need = respectForStar(Math.min(hvezd + 1, HERO_MAX_STARS), tier);
  if (hvezd === stars) {
    return { key, name, darek, type: "respect", respect: zbylo, need,
      locked: !heroUnlocked(acc, key) };
  }
  const pribylo = hvezd - stars;
  const wasLocked = !heroUnlocked(acc, key);
  acc.heroUnlocks[key] = 1;
  if (live) {
    live.stars = hvezd;
    live.skillPts += STAR_SKILL_POINT * pribylo;
    live.hp = heroStats(liveFaction, liveIdx).hpMax; // povýšení uzdraví
    addLog(liveFaction.id, { klic: "kron.hrdina.hvezda", param: { hrdina: name, rod: liveFaction.name, hvezd, body: pribylo } });
  } else {
    const entry = acc.heroProgress[key] || (acc.heroProgress[key] =
      { level: 1, xp: 0, stars: 0, skills: {}, skillPts: 0, equip: {} });
    entry.stars = hvezd;
    entry.skillPts = (entry.skillPts || 0) + STAR_SKILL_POINT * pribylo;
  }
  // R10 (v0.35): dosažení ♥10 odemyká hrdinův signature kus — jednou navždy.
  // Za běžící hry jde do frakční zásoby (sync ho uloží na účet — inventář by
  // příští sync přepsal!), mimo hru rovnou na účet.
  let sigDar = false;
  if (hvezd >= SIG_STARS && !acc.sigOdemceno[key]) {
    acc.sigOdemceno[key] = 1;
    const kus = makeSignatureItem(key);
    if (kus) {
      sigDar = true;
      if (liveFaction) {
        grantItemToFaction(liveFaction, kus);
        addLog(liveFaction.id, { klic: "kron.signature", param: { hrdina: name, hvezd: SIG_STARS, kus: kus.name } });
      } else acc.inventory.push(kus);
    }
  }
  return { key, name, darek, type: wasLocked ? "unlock" : "star", star: hvezd,
    hvezd: pribylo, sig: sigDar };
}

// otevření truhly nad účtem — vrací {items, boosts, gifts, side}, nebo null
// (málo jader). Truhla dá VŽDY přesně CHEST_ITEMS věcí: každý slot je buď
// posilovací doplněk (prostor uvolněný z vah rarit), nebo — podle stejné
// tabulky rarit — výbava, či dárek hrdiny téže rarity. Žádný drop navíc.
function accountOpenChest(acc, tier, side, liveFaction) {
  const def = CHESTS[tier];
  if (!acc || !def) return null;
  side = side === "zlo" ? "zlo" : "dobro";
  migrateAccount(acc);
  // první otevření dne je zdarma
  const zdarma = chestFreeAvailable(acc);
  if (zdarma) acc.freeChestDay = dnesniDen();
  else if (acc.cores < def.cost) return null;
  else acc.cores -= def.cost;
  const r = losujTruhlu(acc, tier, side, liveFaction);
  return { ...r, side, pity: acc.pity, pityAt: PITY_AT, zdarma,
    pocet: 1, cena: zdarma ? 0 : def.cost,
    pityInvite: acc.pityInvite, invitePityAt: INVITE_PITY_AT };
}

// Dávkové otevření (v0.38): CHEST_BULK truhel naráz za zvýhodněnou cenu.
// Denní truhla zdarma se NEspotřebuje — hráč si ji vybere zvlášť, aby o ni
// dávkou nepřišel. Platí se JEDNOU za celou dávku (atomicky: buď všech pět,
// nebo nic), počítadla smůly pak tikají normálně přes všechna losování.
const CHEST_BULK = 5;
function chestBulkCost(tier) {
  const def = CHESTS[tier];
  return def ? (def.bulkCost || def.cost * CHEST_BULK) : 0;
}
function accountOpenChests(acc, tier, side, liveFaction, pocet) {
  const def = CHESTS[tier];
  if (!acc || !def) return null;
  pocet = Math.floor(pocet || CHEST_BULK);
  if (!(pocet > 1)) return accountOpenChest(acc, tier, side, liveFaction);
  pocet = Math.min(CHEST_BULK, pocet);
  side = side === "zlo" ? "zlo" : "dobro";
  migrateAccount(acc);
  const cena = pocet === CHEST_BULK ? chestBulkCost(tier) : def.cost * pocet;
  if (acc.cores < cena) return null;
  acc.cores -= cena;
  const items = [], boosts = [], gifts = [], invites = [];
  let legenda = false;
  for (let i = 0; i < pocet; i++) {
    const r = losujTruhlu(acc, tier, side, liveFaction);
    items.push(...r.items);
    boosts.push(...r.boosts);
    gifts.push(...r.gifts);
    if (r.invite) invites.push(r.invite);
    if (r.legenda) legenda = true;
  }
  return { items, boosts, gifts, side, pocet, cena, legenda,
    invites, invite: invites[0] || null,   // starší klient čte jen `invite`
    pity: acc.pity, pityAt: PITY_AT, zdarma: false,
    pityInvite: acc.pityInvite, invitePityAt: INVITE_PITY_AT };
}

// jedno losování truhly BEZ placení — sdílí ho jednotlivé i dávkové otevření
function losujTruhlu(acc, tier, side, liveFaction) {
  const def = CHESTS[tier];
  // počítadlo smůly: PITY_AT. truhla BEZ legendy ji vydá jistě. Truhla dá
  // legendu sama od sebe zhruba každou čtvrtou, takže se počítadlo dotkne
  // jen nešťastné menšiny — nezlevňuje, jen ubírá krutost náhody.
  acc.pity = (acc.pity || 0) + 1;
  let pityLeft = acc.pity >= PITY_AT ? 1 : 0;
  // zvací list: malá šance v každém otevření, jistota po INVITE_PITY_AT truhlách
  acc.pityInvite = (acc.pityInvite || 0) + 1;
  let list = null;
  const jistota = acc.pityInvite >= INVITE_PITY_AT;
  if (jistota || Math.random() < INVITE_CHANCE) {
    list = applyInviteToAccount(acc, rollInviteHero(acc, side, jistota));
    acc.pityInvite = 0;
  }

  const items = [], boosts = [], gifts = [];
  const wsum = def.weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < CHEST_ITEMS; i++) {
    if (pityLeft > 0 && i === CHEST_ITEMS - 1) {
      // poslední slot jistoty: legendární kus, ať už náhoda dala cokoli
      pityLeft--;
      const item = makeChestItem(tier, side, RARITIES.length - 1);
      items.push(item);
      acc.inventory.push(item);
    } else if (Math.random() * 100 >= wsum) {
      const b = makeBoost(def);
      boosts.push(b);
      const bk = b.boost + "_" + b.tier;
      acc.boosts[bk] = (acc.boosts[bk] || 0) + 1;
    } else if (Math.random() < GIFT_SHARE) {
      // rarita se losuje ze stejné tabulky jako u výbavy a teprve pak se
      // přepíše na tier hrdiny — dárek proto kopíruje křivku rarit výbavy
      const rarity = weightedIndex(def.weights, Math.random());
      gifts.push(grantGift(acc, rollGiftHero(GIFT_RARITY_TIER[rarity], side, acc)));
    } else {
      const item = makeChestItem(tier, side);
      items.push(item);
      acc.inventory.push(item);
    }
  }
  // legenda (ať už z náhody, nebo z jistoty) počítadlo nuluje
  const legenda = items.some(it => it && it.rarity >= RARITIES.length - 1);
  if (legenda) acc.pity = 0;
  return { items, boosts, gifts, invite: list, legenda };
}

// ---------- Rotující denní obchod (v0.27) ----------
// Tržnice vedle směny nabízí denně rotující sloty: dárky hrdinů a výbavu za
// ZLATO (sezónní měna). Nabídka je pro daný den a stranu stejná pro všechny
// (deterministický los ze dne), odběry se počítají per účet (limit 1–3 kusy).
const SHOP_SLOTS = 5;
const SHOP_GIFT_PRICE = [90, 320, 900];    // cena dárku dle tieru hrdiny
const SHOP_ITEM_PRICE = [0, 0, 350, 900, 2400]; // cena výbavy dle rarity

function marketShopOffers(side) {
  side = side === "zlo" ? "zlo" : "dobro";
  const den = dnesniDen();
  // deterministický los: stejný den + strana = stejná nabídka pro všechny
  let seed = 0;
  const klic = den + side;
  for (let i = 0; i < klic.length; i++) seed = (seed * 31 + klic.charCodeAt(i)) >>> 0;
  const rng = mulberry32(seed);
  const heroes = [];
  for (const fkey in HERO_DEFS) {
    if (sideOfFaction(fkey) !== side) continue;
    HERO_DEFS[fkey].forEach((hd, i) => heroes.push(fkey + ":" + i));
  }
  const offers = [];
  for (let slot = 0; slot < SHOP_SLOTS; slot++) {
    if (slot < 3) {
      // tři sloty dárků: náhodný hrdina strany, limit kusů 1–3
      const hrd = heroes[Math.floor(rng() * heroes.length)];
      const [fkey, idxS] = hrd.split(":");
      const tier = heroTierOf(fkey, parseInt(idxS, 10));
      const key = giftGroupKey(fkey, tier);   // v0.44: obchod prodává skupinu
      offers.push({ slot, druh: "gift", key, tier,
        jmeno: (FACTION_DEFS.find(d => d.key === fkey) || {}).name + " · "
          + GIFT_TIER_NAME[tier].toLowerCase(),
        darek: giftNameForGroup(fkey, tier),
        cena: SHOP_GIFT_PRICE[tier], limit: 1 + Math.floor(rng() * 3) });
    } else {
      // dva sloty výbavy: vzácná / epická (legenda do obchodu nepatří)
      const rarity = slot === 3 ? 2 : 3;
      offers.push({ slot, druh: "item", rarity, cena: SHOP_ITEM_PRICE[rarity],
        limit: 1, seed: Math.floor(rng() * 1e9) });
    }
  }
  return { den, side, offers };
}

// nákup: zlato platí běžící frakce, odměna jde na účet; limity per účet a den
function buyShopOffer(faction, acc, slot) {
  if (!faction || !acc) return null;
  migrateAccount(acc);
  const side = sideOfFaction(faction.key);
  const shop = marketShopOffers(side);
  const off = shop.offers[slot];
  if (!off) return null;
  if (acc.shopDay !== shop.den) { acc.shopDay = shop.den; acc.shopBought = {}; }
  const koupeno = acc.shopBought[slot] || 0;
  if (koupeno >= off.limit) return null;
  if (faction.resources.gold < off.cena) return null;
  faction.resources.gold -= off.cena;
  acc.shopBought[slot] = koupeno + 1;
  if (off.druh === "gift") {
    // v0.43: i z obchodu padá dárek jako předmět, použije ho hráč sám
    const vysledek = grantGift(acc, off.key);
    return { druh: "gift", vysledek, zbyva: off.limit - koupeno - 1 };
  }
  const item = makeChestItem("royal", side, off.rarity);
  acc.inventory.push(item);
  return { druh: "item", item, zbyva: off.limit - koupeno - 1 };
}

// použití posilovacího doplňku z účtu na běžící říši
function accountUseBoost(acc, kind, tier, faction) {
  if (!acc || !BOOST_KINDS[kind] || !(tier >= 0 && tier <= 2) || !faction) return false;
  migrateAccount(acc);
  const bk = kind + "_" + tier;
  if (!(acc.boosts[bk] > 0)) return false;
  acc.boosts[bk]--;
  faction.boosts = faction.boosts || { build: 0, prod: 0 };
  faction.boosts[kind] += BOOST_MINUTES[tier] * 60; // tiky (1 tik = 1 s)
  addLog(faction.id, { klic: "kron.doplnek", param: { ikona: BOOST_KINDS[kind].icon, rod: faction.name, co: BOOST_KINDS[kind].name, tier: HERO_TIERS[tier].name.toLowerCase(), popis: BOOST_KINDS[kind].desc, min: BOOST_MINUTES[tier] } });
  return true;
}

// ---------- Strengthen: vylepšování předmětů (v0.6.1) ----------
// Každý předmět jde posílit až na 5 ★. Materiálem jsou jiné předměty
// STEJNÉHO slotu a stejné rarity; cena hvězd roste: 1/3/5/8/13 kusů.
// Každá hvězda zvedá hodnotu předmětu o 25 %; pátá hvězda navíc probouzí
// mistrovský bonus slotu (extra efekt jako od dovednosti).
const STRENGTHEN_COST = [1, 3, 5, 8, 13];
const STAR_VALUE_BONUS = 0.25;

// ---------- Zvláštní vlastnosti výbavy (v0.20) ----------
// Kus výbavy může kromě svého plochého statu nést ještě LOSOVANOU pasivku.
// Ta se nevylepšuje hvězdami (ty zvedají plochý stat), ale druhou dráhou —
// ZUŠLECHTĚNÍM za zlato: účinek = základ × (stupeň + 1), tedy až šestinásobek.
// Předloha (RtW) to má stejně: Strengthen zvedá staty, Refine pasivku.
// Základy jsou schválně malé — pasivka má dávat kusu tvář, ne zastínit stat.
const ITEM_PASSIVES = {
  ostri:    { name: "Broušené ostří", desc: "šance na navazující úder",
              effs: [{ type: "followUp", val: 2 }], jed: "%" },
  pokrik:   { name: "Válečný pokřik", desc: "útok rostoucí každým kolem",
              effs: [{ type: "stackAtk", val: 0.06 }], jed: "/kolo" },
  neoblom:  { name: "Neoblomnost", desc: "obrana rostoucí každým kolem",
              effs: [{ type: "stackDef", val: 0.06 }], jed: "/kolo" },
  praporec: { name: "Praporec", desc: "vyšší velení",
              effs: [{ type: "cap", val: 8 }], jed: " jednotek" },
  amulet:   { name: "Ochranný amulet", desc: "méně poškození od hrdinů a kouzel",
              effs: [{ type: "ward", val: 1 }], jed: "%" },
  dech:     { name: "Druhý dech", desc: "rychlejší léčení mimo boj",
              effs: [{ type: "regen", val: 6 }], jed: "%" },
  vytrval:  { name: "Vytrvalost", desc: "vyšší výdrž",
              effs: [{ type: "stam", val: 4 }], jed: "" },
  hak:      { name: "Obléhací hák", desc: "silnější útok na opevněná pole",
              effs: [{ type: "structAtk", val: 2 }], jed: "%" },
  ranhojic: { name: "Ranhojič", desc: "část ztrát se po vítězství vrací",
              effs: [{ type: "heal", val: 0.5 }], jed: "%" },
  kopinici: { name: "Kopiníci", desc: "silnější pěchota",
              effs: [{ type: "unitDmg", val: 1, cond: { unit: "inf" } }], jed: "%" },
  strelci:  { name: "Mistři luku", desc: "silnější lučištníci",
              effs: [{ type: "unitDmg", val: 1, cond: { unit: "arch" } }], jed: "%" },
  jezdci:   { name: "Ostruhy", desc: "silnější jízda",
              effs: [{ type: "unitDmg", val: 1, cond: { unit: "cav" } }], jed: "%" },
  maska:    { name: "Šílená maska", desc: "šance uvrhnout nepřátelskou formaci do šílenství",
              effs: [{ type: "madness", val: 3 }], jed: "%" },
  neuprosn: { name: "Neúprosnost", desc: "šance na neodvratný úder (obejde vyhnutí)",
              effs: [{ type: "pursuit", val: 6 }], jed: "%" },
};
const ITEM_PASSIVE_KEYS = Object.keys(ITEM_PASSIVES);
// šance na pasivku podle rarity — vzácnost tak neurčuje jen výši statu,
// ale hlavně to, jestli kus vůbec něco umí
const ITEM_PASSIVE_CHANCE = [0, 0, 0.35, 0.7, 1];
const REFINE_MAX = 5;
// zlato za posun na stupeň 1…5 (indexováno CÍLOVÝM stupněm)
const REFINE_COST = [0, 300, 600, 1000, 1500, 2200];

function rollItemPassive(rarity) {
  if (Math.random() >= (ITEM_PASSIVE_CHANCE[rarity] || 0)) return null;
  return ITEM_PASSIVE_KEYS[Math.floor(Math.random() * ITEM_PASSIVE_KEYS.length)];
}

// efekty pasivky po zušlechtění: základ × (stupeň + 1), max ×6
function itemPassiveEffs(it) {
  const p = it && it.pas && ITEM_PASSIVES[it.pas];
  if (!p) return [];
  const nasob = Math.min(REFINE_MAX, it.refine || 0) + 1;
  return p.effs.map(e => ({ ...e, val: e.val * nasob }));
}

// součet nepodmíněných efektů pasivek ze VŠÍ nasazené výbavy
function heroItemPasEff(faction, heroIdx, type) {
  const h = faction.heroes[heroIdx];
  let v = 0;
  for (const s of ITEM_SLOT_KEYS)
    for (const e of itemPassiveEffs(h.equip[s]))
      if (!e.cond && e.type === type) v += e.val;
  return v;
}

// zušlechtění: druhá dráha vylepšení, platí se ZLATEM (hvězdy jedou na
// materiálu, takže si cesty nekonkurují)
function refineItem(faction, itemId) {
  let target = faction.items.find(it => it.id === itemId);
  if (!target) {
    for (const h of faction.heroes)
      for (const s of ITEM_SLOT_KEYS)
        if (h.equip[s] && h.equip[s].id === itemId) target = h.equip[s];
  }
  if (!target || !target.pas) return false;
  const stupen = target.refine || 0;
  if (stupen >= REFINE_MAX) return false;
  const cena = REFINE_COST[stupen + 1];
  if (faction.resources.gold < cena) return false;
  faction.resources.gold -= cena;
  target.refine = stupen + 1;
  addLog(faction.id, { klic: "kron.zuslechteni", param: { kus: target.name, stupen: target.refine, pasivka: ITEM_PASSIVES[target.pas].name } });
  return true;
}

const MASTER_BONUS = {
  weapon: { name: "Popravčí úder", desc: "+12 poškození hrdiny",
    effs: [{ type: "dmg", val: 12 }] },
  shield: { name: "Neprostupná hradba", desc: "+2 obrany, −8 % poškození od hrdinů",
    effs: [{ type: "def", val: 2 }, { type: "ward", val: 8 }] },
  armor:  { name: "Železná výdrž", desc: "+80 životů hrdiny",
    effs: [{ type: "hp", val: 80 }] },
  helmet: { name: "Třetí oko", desc: "+12 kouzelného poškození každé kolo",
    effs: [{ type: "spell", val: 12 }] },
  boots:  { name: "Vichr", desc: "+2 rychlosti a +1 útoku",
    effs: [{ type: "spd", val: 2 }, { type: "atk", val: 1 }] },
  gloves: { name: "Drtivý stisk", desc: "+2 útoku",
    effs: [{ type: "atk", val: 2 }] },
};

// skutečná hodnota předmětu včetně hvězd vylepšení
function itemValueOf(it) {
  return Math.round(it.value * (1 + STAR_VALUE_BONUS * (it.stars || 0)));
}

// mistrovské bonusy 5★ výbavy — přičítají se v heroStats ke skillům a setům
function heroMasterEff(faction, heroIdx, type) {
  const h = faction.heroes[heroIdx];
  let v = 0;
  for (const s of ITEM_SLOT_KEYS) {
    const it = h.equip[s];
    if (!it || (it.stars || 0) < 5) continue;
    for (const e of MASTER_BONUS[s].effs) if (e.type === type) v += e.val;
  }
  return v;
}

// vylepšení předmětu: cíl smí být v zásobě i nasazený, materiál jen ze
// zásoby (ne nasazené kusy) — pohltí se a zmizí
function strengthenItem(faction, itemId, materialIds) {
  let target = faction.items.find(it => it.id === itemId);
  if (!target) {
    for (const h of faction.heroes)
      for (const s of ITEM_SLOT_KEYS)
        if (h.equip[s] && h.equip[s].id === itemId) target = h.equip[s];
  }
  if (!target) return false;
  const stars = target.stars || 0;
  if (stars >= 5) return false;
  const need = STRENGTHEN_COST[stars];
  const ids = [...new Set(materialIds || [])].filter(id => id !== itemId);
  if (ids.length !== need) return false;
  const mats = ids.map(id => faction.items.find(it => it.id === id));
  if (mats.some(m => !m || m.slot !== target.slot || m.rarity !== target.rarity)) return false;
  faction.items = faction.items.filter(it => !ids.includes(it.id));
  target.stars = stars + 1;
  if (target.stars === 5) {
    addLog(faction.id, { klic: "kron.mistrovsky.kus", param: { ikona: ITEM_SLOTS[target.slot].icon, kus: target.name, bonus: MASTER_BONUS[target.slot].name, popis: MASTER_BONUS[target.slot].desc } });
  }
  return true;
}

// uplatnění promo kódu nad účtem — vrací počet jader, nebo null
function accountRedeemCode(acc, code, table) {
  if (!acc) return null;
  code = String(code || "").trim().toUpperCase();
  const codes = table || CORE_CODES;
  if (!codes[code]) return null;
  const once = !CODE_REPEATABLE.test(code);
  acc.codesUsed = acc.codesUsed || [];
  if (once && acc.codesUsed.includes(code)) return null;
  if (once) acc.codesUsed.push(code);
  acc.cores += codes[code];
  return codes[code];
}

// ---------- Signature předměty (v0.7, Fáze 2 auditu RtW) ----------
// Unikátní kus vázaný na konkrétního hrdinu: nosit ho může kdokoli (stat
// slotu platí vždy), ale POJMENOVANÁ PASIVKA se probouzí jen na svém
// hrdinovi. Padá zaručeně z prvního dobytí Trůnu (kus vedoucího hrdiny)
// a vzácně z Truhly Popelného krále.
const SIGNATURE_ITEMS = {
  "aldar:0": { slot: "boots", name: "Ostřížovy perutě", passive: "Střemhlav",
    effs: [{ type: "spd", val: 2 }, { type: "followUp", val: 20 }] },
  "aldar:1": { slot: "weapon", name: "Mařina dubová sekera", passive: "Drtivý výpad",
    effs: [{ type: "dmg", val: 10 }, { type: "followUp", val: 25 }] },
  "aldar:2": { slot: "shield", name: "Sirotčí hradba", passive: "Neustoupím",
    effs: [{ type: "def", val: 2 }, { type: "stackDef", val: 0.5 }] },
  "aldar:3": { slot: "armor", name: "Ysřin železný kabátec", passive: "Druhé srdce",
    effs: [{ type: "hp", val: 60 }, { type: "regen", val: 40 }] },
  "aldar:4": { slot: "gloves", name: "Korouhevníkovy latnice", passive: "Pod praporem",
    effs: [{ type: "cap", val: 120 }, { type: "atk", val: 1 }] },
  "aldar:5": { slot: "helmet", name: "Vaelisův diadém", passive: "Přetlak vůle",
    effs: [{ type: "spell", val: 12 }, { type: "ward", val: 8 }] },
  // v0.34 SIGNATURE INTERMEZZO: sigy starterů přeladěny na archetypy kitů
  // v0.28 a použity jako páky pavučiny (rozhodnutí uživatele: Edran zůstává
  // bez zásahu — smí být špička, dokud ve výhrách krvácí; frakční
  // amplifikátory vsDmg jsou schválený knob po vzoru rasových řádků RtW)
  "yllien:0": { slot: "boots", name: "Nyalliny tiché kroky", passive: "Druhý šíp",
    effs: [{ type: "spd", val: 2 }, { type: "followUp", val: 15 }] },
  "yllien:1": { slot: "weapon", name: "Trnový luk", passive: "Tisíc trnů",
    effs: [{ type: "dmg", val: 8 }, { type: "unitDmg", val: 10, cond: { unit: "arch" } }] },
  "yllien:2": { slot: "shield", name: "Kořenový štít", passive: "Objetí hvozdu",
    effs: [{ type: "def", val: 2 }, { type: "holdDef", val: 15 }] },
  "yllien:3": { slot: "armor", name: "Roucho věčnosti", passive: "Nekonečný krok",
    effs: [{ type: "hp", val: 50 }, { type: "regen", val: 40 }] },
  "yllien:4": { slot: "gloves", name: "Úsvitové rukavice", passive: "Píseň úsvitu",
    effs: [{ type: "cap", val: 100 }, { type: "followUp", val: 15 }] },
  "yllien:5": { slot: "helmet", name: "Hvězdná čelenka", passive: "Šepot hvězd",
    effs: [{ type: "spell", val: 12 }, { type: "vsDmg", val: 10, cond: { vsFaction: "horda" } }] },
  "durgar:0": { slot: "weapon", name: "Kladivo hlubin", passive: "Otřes",
    effs: [{ type: "dmg", val: 10 }, { type: "structAtk", val: 15 }] },
  "durgar:1": { slot: "shield", name: "Žulová pavéza", passive: "Kamenné objetí",
    effs: [{ type: "def", val: 2 }, { type: "stackDef", val: 0.5 }] },
  "durgar:2": { slot: "boots", name: "Střelmistrovy okovky", passive: "Rychlopal",
    effs: [{ type: "spd", val: 2 }, { type: "unitDmg", val: 10, cond: { unit: "arch" } }] },
  // ETAPA 6: s liniemi ztratil durgar v rastru VŠECHNY páry — jeho kit má
  // půlku síly ve structAtk, který se v duelu bez stavby vůbec neprojeví.
  // Cauter zesílen a doplněn o shred: „vypálené rány" nejen brání hojení,
  // ale i oslabují protějšek. Naměřeno hledačem — nejmírnější kombinace,
  // po které není bez výhry nikdo.
  "durgar:3": { slot: "armor", name: "Žulový krunýř", passive: "Vypálené rány",
    effs: [{ type: "hp", val: 70 }, { type: "cauter", val: 50 }, { type: "shred", val: 6 }] },
  "durgar:4": { slot: "gloves", name: "Správcovské pěstnice", passive: "Sedmá směna",
    effs: [{ type: "cap", val: 120 }, { type: "unitDmg", val: 8, cond: { unit: "inf" } }] },
  "durgar:5": { slot: "helmet", name: "Runová přilba", passive: "Žhnoucí runy",
    effs: [{ type: "spell", val: 12 }, { type: "followUp", val: 15 }] },
  "horda:0": { slot: "weapon", name: "Popelný sekáč", passive: "Hněv popela",
    effs: [{ type: "dmg", val: 10 }, { type: "stackAtk", val: 0.5 }] },
  "horda:1": { slot: "boots", name: "Vichřicí kované", passive: "Smršť",
    effs: [{ type: "spd", val: 3 }, { type: "followUp", val: 15 }] },
  "horda:2": { slot: "shield", name: "Kostiplátová hradba", passive: "Kostěný val",
    effs: [{ type: "def", val: 2 }, { type: "ward", val: 8 }] },
  "horda:3": { slot: "armor", name: "Nezdolná kůže", passive: "Nepadnu",
    effs: [{ type: "hp", val: 80 }, { type: "regen", val: 30 }] },
  "horda:4": { slot: "gloves", name: "Smečkovy drápy", passive: "Hlad smečky",
    effs: [{ type: "cap", val: 120 }, { type: "unitDmg", val: 8, cond: { unit: "cav" } }] },
  "horda:5": { slot: "helmet", name: "Prorokova kápě", passive: "Pohlcení plamenem",
    effs: [{ type: "spell", val: 14 }, { type: "vsDmg", val: 10, cond: { vsFaction: "aldar" } }] },
  // ---- nové rody (v0.25) — sloty dle pořadí rysů: boty/zbraň/štít/zbroj/rukavice/helma ----
  "brakkar:0": { slot: "boots", name: "Hlubinné škorně", passive: "Krok pod horou",
    effs: [{ type: "spd", val: 2 }, { type: "stam", val: 25 }] },
  "brakkar:1": { slot: "weapon", name: "Dornova kamenopěst", passive: "Drtič bran",
    effs: [{ type: "dmg", val: 10 }, { type: "structAtk", val: 15 }] },
  "brakkar:2": { slot: "shield", name: "Štítová skála", passive: "Neprorazitelný",
    effs: [{ type: "def", val: 2 }, { type: "holdDef", val: 20 }] },
  "brakkar:3": { slot: "armor", name: "Žulový kyrys", passive: "Hlubina proti popelu",
    effs: [{ type: "hp", val: 60 }, { type: "vsDmg", val: 16, cond: { vsFaction: "horda" } }] },
  "brakkar:4": { slot: "gloves", name: "Runové latnice", passive: "Runový povel",
    effs: [{ type: "cap", val: 120 }, { type: "rally", val: 10 }] },
  "brakkar:5": { slot: "helmet", name: "Sigritina runová čelenka", passive: "Hlas run",
    effs: [{ type: "spell", val: 12 }, { type: "stunChance", val: 8 }] },
  "sarn:0": { slot: "boots", name: "Vichrné třmeny", passive: "Nájezdnický trysk",
    effs: [{ type: "spd", val: 2 }, { type: "unitDmg", val: 10, cond: { unit: "cav" } }] },
  "sarn:1": { slot: "weapon", name: "Rudý oštěp", passive: "První krev",
    effs: [{ type: "dmg", val: 9 }, { type: "strike", val: 12 }] },
  "sarn:2": { slot: "shield", name: "Bajanův štít stepi", passive: "Kruhová hradba",
    effs: [{ type: "def", val: 2 }, { type: "unitDmg", val: 10, cond: { unit: "inf" } }] },
  "sarn:3": { slot: "armor", name: "Pancíř klanů", passive: "Nezlomená",
    effs: [{ type: "hp", val: 50 }, { type: "regen", val: 40 }] },
  "sarn:4": { slot: "gloves", name: "Chánovy rukavice", passive: "Ohon v čele",
    effs: [{ type: "cap", val: 110 }, { type: "speed", val: 5 }] },
  "sarn:5": { slot: "helmet", name: "Péřová koruna", passive: "Šepot stepi",
    effs: [{ type: "spell", val: 11 }, { type: "ward", val: 8 }] },
  "vhorren:0": { slot: "boots", name: "Bledé kroky", passive: "Nikde a všude",
    effs: [{ type: "spd", val: 2 }, { type: "strike", val: 10 }] },
  "vhorren:1": { slot: "weapon", name: "Žnečka", passive: "Sklizeň duší",
    effs: [{ type: "dmg", val: 10 }, { type: "heal", val: 8 }] },
  "vhorren:2": { slot: "shield", name: "Kostěný val", passive: "Mrtví se nedrolí",
    effs: [{ type: "def", val: 2 }, { type: "stackDef", val: 0.5 }] },
  "vhorren:3": { slot: "armor", name: "Rubáš bdění", passive: "Nespící stráž",
    effs: [{ type: "hp", val: 60 }, { type: "ward", val: 12 }] },
  "vhorren:4": { slot: "gloves", name: "Panovníkovy spáry", passive: "Vůle hrobu",
    effs: [{ type: "cap", val: 120 }, { type: "aura", val: 8 }] },
  "vhorren:5": { slot: "helmet", name: "Lichova koruna", passive: "Bezesná moc",
    effs: [{ type: "spell", val: 14 }, { type: "ward", val: 6 }] },
  "gryk:0": { slot: "boots", name: "Rychloprsté opánky", passive: "Šmik a pryč",
    effs: [{ type: "spd", val: 2 }, { type: "gold", val: 4 }] },
  "gryk:1": { slot: "weapon", name: "Krvezub", passive: "Zákeřný sek",
    effs: [{ type: "dmg", val: 9 }, { type: "followUp", val: 20 }] },
  "gryk:2": { slot: "shield", name: "Krunýř z vrakoviny", passive: "Plechová zeď",
    effs: [{ type: "def", val: 2 }, { type: "hp", val: 30 }] },
  "gryk:3": { slot: "armor", name: "Houževnatá kazajka", passive: "Hlodá železo",
    effs: [{ type: "hp", val: 55 }, { type: "vsDmg", val: 8, cond: { vsFaction: "durgar" } }] },
  "gryk:4": { slot: "gloves", name: "Náčelnické pařáty", passive: "Řev roje",
    effs: [{ type: "cap", val: 110 }, { type: "unitDmg", val: 10, cond: { unit: "inf" } }] },
  "gryk:5": { slot: "helmet", name: "Chrastící kápě", passive: "Prašivé kejkle",
    effs: [{ type: "spell", val: 10 }, { type: "madness", val: 8 }] },
};

function makeSignatureItem(sigKey) {
  const d = SIGNATURE_ITEMS[sigKey];
  if (!d) return null;
  const value = Math.round(ITEM_SLOTS[d.slot].base * RARITIES[4].mult * 1.25);
  return { sig: sigKey, slot: d.slot, rarity: 4, value, name: d.name,
    side: sideOfFaction(sigKey.split(":")[0]) };
}

// nasazený signature kus PATŘÍCÍ tomuto hrdinovi (jinému pasivku nedá)
function heroSigItem(faction, heroIdx) {
  const h = faction.heroes[heroIdx];
  const key = faction.key + ":" + h.defIdx;
  for (const s of ITEM_SLOT_KEYS) {
    const it = h.equip[s];
    if (it && it.sig === key) return it;
  }
  return null;
}

function heroSigEff(faction, heroIdx, type) {
  const sig = heroSigItem(faction, heroIdx);
  if (!sig) return 0;
  let v = 0;
  for (const e of SIGNATURE_ITEMS[sig.sig].effs)
    if (!e.cond && e.type === type) v += e.val;
  return v;
}

// Startovní hrdina = SIGNATURE BALÍČEK (v0.35): přichází rovnou se svým
// signature kusem. Pavučina rastru s ním počítá („v endgame má každý svůj
// signature") a hráč ho jinak potkával jen v 8 % královských truhel nebo
// za první dobytí Trůnu. Idempotentní: když kus u aktéra už kdekoli je
// (výbava kteréhokoli hrdiny či zásoba — účet ho vrací applyAccountToHero
// nebo inventářem), nic se negrantuje. Bere AKTÉRA (frakci i člena — duck).
function zajistiSigStartera(a) {
  const idx = STARTER_IDX[a.key] ?? 0;
  const h = (a.heroes || []).find(x => x.defIdx === idx);
  if (!h) return; // testovací sestavy bez startera balíček nedostávají
  const key = a.key + ":" + idx;
  const ma = it => it && it.sig === key;
  if (a.heroes.some(x => Object.values(x.equip || {}).some(ma))
    || (a.items || []).some(ma)) return;
  const kus = { ...makeSignatureItem(key), id: nextItemId++ };
  if (!h.equip[kus.slot]) h.equip[kus.slot] = kus;
  else a.items.push(kus); // slot drží kus z účtu — volbu nechat hráči
}

// předmět z truhly rovnou do frakční zásoby běžící hry (dostane runtime id)
function grantItemToFaction(faction, item) {
  faction.items.push({ ...item, id: nextItemId++ });
}

// očištění předmětu o runtime id (do trvalého uložení) — hvězdy a vazba
// na hrdinu (sig) zůstávají
function stripItem(it) {
  const { slot, rarity, value, name, set, stars, sig, side, pas, refine } = it;
  const out = { slot, rarity, value, name };
  if (pas) out.pas = pas;
  if (refine) out.refine = refine;
  if (set) out.set = set;
  if (stars) out.stars = stars;
  if (sig) out.sig = sig;
  if (side) out.side = side;
  return out;
}

// účet → frakce (start sezóny): sklad předmětů do frakční zásoby, uložený
// postup hrdinů (úroveň, dovednosti, nasazená výbava) na startovní hrdiny
function applyAccountToFaction(faction, acc) {
  if (!acc) return;
  for (const it of acc.inventory || []) faction.items.push({ ...it, id: nextItemId++ });
  faction.heroes.forEach((h, i) => applyAccountToHero(faction, i, acc));
  // sig startera se u lidí NEdorovnává (v0.35): odemyká ho oddanost ♥10 —
  // kdo ho už má (R10, truhla, Trůn), přinesl si ho v inventáři výš
}

function applyAccountToHero(faction, heroIdx, acc) {
  if (!acc) return;
  const h = faction.heroes[heroIdx];
  const pr = (acc.heroProgress || {})[heroKeyFor(faction, h)];
  if (!pr) return;
  h.level = Math.max(1, Math.min(HERO_MAX_LEVEL, pr.level || 1));
  h.xp = Math.max(0, pr.xp || 0);
  h.stars = Math.max(0, Math.min(HERO_MAX_STARS, pr.stars || 0));
  // dovednosti se staví průchodem přes strom: ručně upravený (nebo starý)
  // účet nesmí do hry propašovat neznámý klíč, rank nad maximem — ani ranky
  // ve stromech zamčených oddaností (v0.35); zahozené ranky se vrací v bodech
  const zamcene = new Set();
  for (const s of heroDef(faction, heroIdx).tree)
    if (s.main && (h.stars || 0) < STAR_UNLOCK_MAIN[s.slot]) zamcene.add(s.key);
  let vraceno = 0;
  h.skills = {};
  for (const s of heroDef(faction, heroIdx).tree) {
    if (zamcene.has(s.key) || (s.parent && zamcene.has(s.parent))) {
      vraceno += Math.min(s.max, Math.max(0, ((pr.skills || {})[s.key] | 0)));
      continue;
    }
    const r = Math.min(s.max, Math.max(0, ((pr.skills || {})[s.key] | 0)));
    if (r > 0) h.skills[s.key] = r;
  }
  h.skillPts = Math.max(0, pr.skillPts || 0) + vraceno;
  for (const s of ITEM_SLOT_KEYS) {
    if (pr.equip && pr.equip[s]) h.equip[s] = { ...pr.equip[s], id: nextItemId++ };
  }
  // XP křivka se mezi verzemi mění — uložené xp může přesahovat práh úrovně;
  // prázdný zisk hrdinu dolevluje, připíše body a uzdraví ho (výbava už sedí)
  heroGainXp(faction, heroIdx, 0);
  h.hp = heroStats(faction, heroIdx).hpMax;
}

// frakce → účet (průběžně a na konci sezóny): kořist i postup zpět na účet
function syncAccountFromFaction(acc, faction) {
  if (!acc) return;
  acc.inventory = faction.items.map(stripItem);
  acc.heroProgress = acc.heroProgress || {};
  for (const h of faction.heroes) {
    const equip = {};
    for (const s of ITEM_SLOT_KEYS) equip[s] = h.equip[s] ? stripItem(h.equip[s]) : null;
    acc.heroProgress[heroKeyFor(faction, h)] = {
      level: h.level, xp: h.xp, stars: h.stars || 0,
      skills: { ...h.skills }, skillPts: h.skillPts, equip };
  }
}

// popelná jádra z herních událostí — připíše je vrstva účtů (server /
// místní účet) přes G.onCores; AI frakce žádný účet nemají a nic nedostanou
function grantCores(factionId, amount, reason, cid) {
  // cid (v0.32): jádra padají konkrétnímu členovi frakce (chybí = zakladatel)
  if (typeof G.onCores === "function" && G.onCores(factionId, amount, cid)) {
    addLog(factionId, { klic: "kron.jadra", param: { ikona: CORE_ICON, kolik: amount, duvod: reason } });
  }
}

// ---------- Zkušenosti hrdinů ----------
// Audit 2: strop 50 se zploštěnými per-level přírůstky — úroveň 50 vychází
// zhruba na dřívější třicítku (HP 271 vs 274, atk/def 6,4 vs 6,35, dmg 37 vs 37,
// velení 935 vs 925). BASE konstanty a kapitán domobrany se NESMÍ hnout —
// na nich stojí spodní část křivky dobývání.
const HERO_MAX_LEVEL = 50;
const LEVEL_STAMINA = 1;     // +1 max výdrže za úroveň

function xpForLevel(level) { return Math.round(25 * Math.pow(level, 1.4)); }

// bod dovedností za každou úroveň (2..50 = 49 bodů) + 1 za každou hvězdu:
// strop příjmu 74 proti kapacitě stromu 116 (4×15 + 8×7) — na plný strom
// to záměrně nestačí, takže volba buildu má smysl
function skillPtGainAt(level) { return 1; }
// jediný zdroj pravdy o nasbíraných bodech z úrovní (používá i migrace účtů)
function totalSkillPtsForLevel(level) {
  return Math.max(0, Math.min(HERO_MAX_LEVEL, level | 0) - 1);
}

function heroGainXp(faction, heroIdx, amount) {
  const h = faction.heroes[heroIdx];
  if (h.level >= HERO_MAX_LEVEL) return;
  h.xp += Math.round(amount * (1 + heroEff(faction, heroIdx, "xp") / 100));
  while (h.level < HERO_MAX_LEVEL && h.xp >= xpForLevel(h.level)) {
    h.xp -= xpForLevel(h.level);
    h.level++;
    const pts = skillPtGainAt(h.level);
    h.skillPts += pts;
    h.hp = heroStats(faction, heroIdx).hpMax; // postup na úroveň hrdinu uzdraví
    emitEvent("levelup", faction.id);
    addLog(faction.id, { klic: pts ? "kron.hrdina.level.bod" : "kron.hrdina.level", param: { hrdina: heroDef(faction, heroIdx).name, rod: faction.name, uroven: h.level } });
  }
  if (h.level >= HERO_MAX_LEVEL) h.xp = 0;
}

// ---------- Dovednosti hrdinů ----------
// Tvar stromu (MAIN_MAX_RANK / SUB_MAX_RANK / SKILL_UNLOCK_MAIN / SUB_REQ) je
// definovaný nahoře u konstant hrdinů — dekorátor HERO_DEFS ho potřebuje dřív.
const RESPEC_GOLD_PER_POINT = 15;

function heroSpentPoints(hero) {
  return Object.values(hero.skills).reduce((a, b) => a + b, 0);
}

// je uzel odemčený? (hlavní podle investovaných bodů, podřízený podle rodiče)
function skillUnlocked(hero, skill, bezOddanosti) {
  if (skill.parent) return (hero.skills[skill.parent] || 0) >= (skill.req || SUB_REQ);
  // brána oddanosti (v0.35): třetí strom od ♥3, čtvrtý od ♥5. AI (a testy
  // mechaniky stromů) ji obcházejí — dárkovou ekonomiku nehrají
  if (!bezOddanosti && (hero.stars || 0) < STAR_UNLOCK_MAIN[skill.slot]) return false;
  return heroSpentPoints(hero) >= SKILL_UNLOCK_MAIN[skill.slot];
}

function learnSkill(faction, heroIdx, skillKey) {
  const h = faction.heroes[heroIdx];
  if (h.skillPts <= 0) return false;
  const tree = heroDef(faction, heroIdx).tree;
  const s = tree.find(x => x.key === skillKey);
  if (!s) return false;
  // bezOddanosti se NIKDY nebere z klientských argumentů — jen ze stavu
  // frakce na serveru (AI); hráč bránu neobejde ani upraveným příkazem
  if (!skillUnlocked(h, s, faction.isAI)) return false;
  if ((h.skills[skillKey] || 0) >= s.max) return false;
  h.skills[skillKey] = (h.skills[skillKey] || 0) + 1;
  h.skillPts--;
  // dovršení hlavní dovednosti odemyká bonus podle rysu velitele
  if (s.main && h.skills[skillKey] >= s.max && s.maxEff) {
    addLog(faction.id, { klic: "kron.hrdina.mistrovstvi", param: { hrdina: heroDef(faction, heroIdx).name, rod: faction.name, dovednost: s.name } });
  }
  return true;
}

// respec: vrátí všechny investované body, stojí zlato podle jejich počtu
function respecHero(faction, heroIdx) {
  const h = faction.heroes[heroIdx];
  const spent = heroSpentPoints(h);
  if (spent <= 0) return false;
  // každá frakce má na sezónu jeden reset zdarma; další stojí zlato
  if (faction.freeRespecs > 0) {
    faction.freeRespecs--;
    h.skillPts += spent;
    h.skills = {};
    addLog(faction.id, { klic: "kron.hrdina.respec.zdarma", param: { hrdina: heroDef(faction, heroIdx).name, rod: faction.name } });
    return true;
  }
  const cost = spent * RESPEC_GOLD_PER_POINT;
  if (faction.resources.gold < cost) return false;
  faction.resources.gold -= cost;
  h.skillPts += spent;
  h.skills = {};
  addLog(faction.id, { klic: "kron.hrdina.respec", param: { hrdina: heroDef(faction, heroIdx).name, rod: faction.name, cena: cost } });
  return true;
}

// součet efektu daného typu přes všechny naučené dovednosti hrdiny;
// podmínkové efekty (e.cond) sem nepatří — sbírá je heroCondEffs;
// maxEff je bonus navíc při plně naučené dovednosti (Max Level Effect)
// kolové aktivky (roundDmg/roundArmy) se nesčítají do jednoho čísla — mají
// vlastní časování a sbírá je heroActives; heroEff je proto přeskakuje
const ROUND_EFF_TYPES = { roundDmg: 1, roundArmy: 1, roundHeal: 1 };

function heroEff(faction, heroIdx, type) {
  const tree = heroDef(faction, heroIdx).tree;
  const h = faction.heroes[heroIdx];
  let v = 0;
  for (const s of tree) {
    const r = h.skills[s.key] || 0;
    if (!r) continue;
    for (const e of (s.effs || [s.eff])) {
      if (e.cond || ROUND_EFF_TYPES[e.type]) continue;
      if (e.type === type) v += e.val * r;
    }
    if (s.maxEff && r >= s.max && !s.maxEff.cond && !ROUND_EFF_TYPES[s.maxEff.type]
        && s.maxEff.type === type) v += s.maxEff.val;
  }
  return v;
}

// kolové aktivky velitele: efekt se spustí jen v určených kolech boje
// (timing.round = konkrétní kolo, timing.every = každé N. kolo). Vrací
// položky {name, type, pct, targets, round, every} — poškození počítá
// simulateBattle, časování je deterministické (žádné rng).
function heroActives(faction, heroIdx) {
  const out = [];
  const tree = heroDef(faction, heroIdx).tree;
  const h = faction.heroes[heroIdx];
  const push = (s, e, val) => {
    const t = e.timing || {};
    out.push({ name: s.name, type: e.type, pct: val,
      targets: e.targets || 1, round: t.round || 0, every: t.every || 0 });
  };
  for (const s of tree) {
    const r = h.skills[s.key] || 0;
    if (!r) continue;
    for (const e of (s.effs || [s.eff]))
      if (ROUND_EFF_TYPES[e.type] && !e.cond) push(s, e, e.val * r);
    if (s.maxEff && r >= s.max && ROUND_EFF_TYPES[s.maxEff.type] && !s.maxEff.cond)
      push(s, s.maxEff, s.maxEff.val);
  }
  const sig = heroSigItem(faction, heroIdx);
  if (sig) for (const e of SIGNATURE_ITEMS[sig.sig].effs)
    if (ROUND_EFF_TYPES[e.type] && !e.cond)
      push({ name: SIGNATURE_ITEMS[sig.sig].name }, e, e.val);
  return out;
}

// podmínkové efekty ([typ jednotky] / [proti frakci]) z dovedností a
// signature kusu — do boje jdou zvlášť, ne přes ploché součty heroEff
function heroCondEffs(faction, heroIdx) {
  const out = [];
  const tree = heroDef(faction, heroIdx).tree;
  const h = faction.heroes[heroIdx];
  for (const s of tree) {
    const r = h.skills[s.key] || 0;
    if (!r) continue;
    for (const e of (s.effs || [s.eff]))
      if (e.cond) out.push({ type: e.type, val: e.val * r, cond: e.cond });
    if (s.maxEff && r >= s.max && s.maxEff.cond) out.push({ ...s.maxEff });
  }
  const sig = heroSigItem(faction, heroIdx);
  if (sig) for (const e of SIGNATURE_ITEMS[sig.sig].effs)
    if (e.cond) out.push({ type: e.type, val: e.val, cond: e.cond });
  // losované pasivky výbavy (zušlechtěné) — stejná gramatika jako dovednosti
  for (const s of ITEM_SLOT_KEYS)
    for (const e of itemPassiveEffs(h.equip[s]))
      if (e.cond) out.push({ type: e.type, val: e.val, cond: e.cond });
  return out;
}

// ---------- Armádní pomocníci ----------
function emptyArmy() { const o = {}; for (const k of UNIT_KEYS) o[k] = 0; return o; }
function armyTotal(a) { let s = 0; for (const k of UNIT_KEYS) s += a[k] || 0; return s; }
function armyClone(a) { return armyFrom(a); }
// libovolný vstup → plná armáda (chybějící sloty 0); uprav ořeže/zaokrouhlí.
// Existuje kvůli čtvrtému slotu: dřív se armády skládaly literálem o třech
// klíčích na osmi místech a pátý slot by je musel obejít znovu.
function armyFrom(a, uprav) {
  const o = {};
  for (const k of UNIT_KEYS) { const v = (a && +a[k]) || 0; o[k] = uprav ? uprav(v) : v; }
  return o;
}
function armyAdd(into, add) {
  for (const k of UNIT_KEYS) into[k] = (into[k] || 0) + (add[k] || 0);
  return into;
}
function armyStr(a, f) {
  return UNIT_KEYS.filter(k => a[k] > 0).map(k => uDef(f, k).icon + Math.floor(a[k])).join(" ") || "—";
}
// „domobrana“: abstraktní vyvážený mix daného výkonu
function balancedArmy(power) {
  // POZOR: dělí se na TŘI díly, ne na počet UNIT_KEYS — domobrana a neutrální
  // posádky velké jednotky nemají (jinak by se posílily samy od sebe a celá
  // křivka dobývání by se posunula).
  const per = power / (SOLDIER_POWER * 3);
  return Object.assign(emptyArmy(), { inf: per, arch: per, cav: per });
}
// ztráty: frac z každého typu (zaokrouhleně), vrací {losses, survivors}
function splitLosses(a, frac) {
  const losses = emptyArmy(), survivors = emptyArmy();
  for (const k of UNIT_KEYS) {
    const n = a[k] || 0;
    losses[k] = Math.min(n, Math.round(n * frac));
    survivors[k] = n - losses[k];
  }
  return { losses, survivors };
}
// eliminace n jednotek z armády (poměrně mezi typy) — „první úder“ před bojem
function armyCull(a, n) {
  const total = armyTotal(a);
  if (total <= 0 || n <= 0) return;
  const frac = Math.min(1, n / total);
  for (const k of UNIT_KEYS) { const n = a[k] || 0; a[k] = Math.max(0, n - Math.round(n * frac)); }
}

// síla armády proti konkrétnímu nepříteli (+30 % proti typu, který jednotka poráží)
function armyPower(army, enemy, mult = 1) {
  const totalE = enemy ? armyTotal(enemy) : 0;
  let p = 0;
  for (const k of UNIT_KEYS) {
    let bonus = 0;
    const zd = UNIT_TYPES[zakladniDruh(k)] || UNIT_TYPES.inf;
    if (totalE > 0) bonus = COUNTER_BONUS * ((enemy[zd.counters] || 0) / totalE);
    p += army[k] * zd.power * (1 + bonus);
  }
  return p * mult;
}

// ---------- Boj v kolech ----------
// Skutečný souboj místo porovnání čísel: až MAX_ROUNDS kol, každé kolo si
// strany současně vymění ztráty podle aktuální síly (převahy typů, pasivky
// frakcí, bonusy hrdiny). Útočník vítězí zničením obrany; jinak je odražen.
function reviveInto(a, n) {
  const t = armyTotal(a);
  if (t <= 0 || n <= 0) return;
  for (const k of UNIT_KEYS) a[k] += n * (a[k] / t);
}

// ---------- Bitva: boj po formacích (v0.19) ----------
// Armáda NENÍ společný fond životů, ale tři formace (pěchota / lučištníci /
// jízda). Každá má vlastní zásobu životů a jedná sama za sebe. V kole se
// střídají podle rychlosti: velitelé napřed, pak formace od nejrychlejší.
//
// Poškození formace = počet kusů × síla na kus × modifikátory;
// padlí = poškození ÷ životy jednoho kusu.
//
// Klíčové pravidlo: PŘEBYTEČNÉ POŠKOZENÍ SE ZTRÁCÍ. Formace se nedá
// „prostřelit" do další, takže ani obrovská přesila nevyhladí obránce jedním
// úderem — bitva se protáhne a i vítěz za ni zaplatí ztrátami. Právě tohle
// dřív chybělo: poškození bez cíle se vypařilo a hrdina bral pole zadarmo.
//
// Bitva trvá nejvýš ROUND_CAP kol. Když do té doby obránce nepadne, je útok
// odražen (remíza) a útočník se vrací s přeživšími.
// ---- PŘEDNÍ A ZADNÍ LINIE (v0.52, etapa 6) ----
//
// Do v0.51 se poškození rozdělovalo mezi formace bez pojmu dosahu, takže
// formace neměly skutečný smysl — lučištníci stáli v první řadě stejně jako
// pěchota. Nově platí: **jednotka na blízko nedosáhne na střelce, dokud před
// nimi stojí clona**.
//
// Tři role místo tří slotů: `clona` kryje (pěchota a velké jednotky),
// `strelec` je krytý a střílí přes hlavy, `jizda` je mellee, která clonu
// NETVOŘÍ, ale tenkou obchází. Vychází to ze slotu, takže dnešní jednotky
// nepotřebují ani řádek navíc; T4 vlajky si roli řeknou samy (`rada`).
const RADA_VYCHOZI = { inf: "clona", arch: "strelec", cav: "jizda", big: "clona" };
function radaJednotky(ud, k) {
  return (ud && ud[k] && ud[k].rada) || RADA_VYCHOZI[zakladniDruh(k)] || "clona";
}

// Jízda projde, když je clona proti ní TENKÁ. Práh se měří v CP, ne v kusech:
// velká jízda má při stejném velení mnohonásobně méně těl a podle počtu by
// clonu neprorazila nikdy — sarnská vlajka by bojovala proti mechanice rodu.
let PROLOM_POMER = 1;
function setProlomPomer(v) { PROLOM_POMER = v; }   // ladicí knob pro rastr

function simulateBattle(ctx) {
  const mkSide = (src, heroLed) => ({
    f: src.faction, hero: src.hero || null, heroLed,
    ud: unitsOf(src.faction),   // tabulka jednotek strany (neutrál = základní)
    army: armyClone(src.army),
    dead: emptyArmy(), wounded: emptyArmy(),
    ragged: 0, fell: false, stacks: 0, stunned: false, routed: false,
    madness: new Set(),   // formace obrácené toto kolo proti svým
    avoid: (src.hero && src.hero.avoidCharges) || 0,
  });
  const A = mkSide(ctx.attacker, true);
  const D = mkSide(ctx.defender, !!ctx.defender.heroLed);
  // kletby a zpomalení (v0.28): srazit staty a rychlost NEPŘÁTELSKÉHO velitele
  // — bitevní objekty velitelů jsou per-bitva kopie, mutace je bezpečná
  for (const [S, E] of [[A, D], [D, A]]) {
    if (!S.hero || !E.hero) continue;
    if (S.hero.shred > 0) {
      const m = 1 - Math.min(40, S.hero.shred) / 100;
      E.hero.atk *= m; E.hero.def *= m; E.hero.dmg *= m;
    }
    if (S.hero.slowEnemy > 0)
      E.hero.speed = Math.max(1, E.hero.speed - S.hero.slowEnemy);
  }
  const initA = armyClone(A.army), initD = armyClone(D.army);

  const share = (S, k) => { const t = armyTotal(S.army); return t > 0 ? S.army[k] / t : 0; };
  const heroUp = S => S.hero && S.hero.hp > 0;
  // omráčený velitel celé kolo nepřispívá (staty, poškození, kouzla, procy)
  const act = S => heroUp(S) && !S.stunned;
  const alive = (S, k) => S.army[k] > 0.5;
  const anyForm = S => UNIT_KEYS.some(k => alive(S, k));
  // spouští se kolová aktivka v tomto kole? (deterministicky, bez rng)
  const activeFires = (a, r) => (a.round && a.round === r)
    || (a.every && r % a.every === 0);

  const tot = { dmgA: 0, dmgD: 0, cmdA: 0, cmdD: 0, revA: 0, revD: 0, avoidA: 0, avoidD: 0 };
  // Kdo na koho v bitvě mířil — s liniemi z IV-N je to ta zajímavá informace
  // (proraženo, nebo se mellee o clonu otloukalo?). Sčítá se za CELOU bitvu,
  // ne po kolech: report jde schránkou i snímkem sezóny a po kolech by
  // ztrojnásobil jeho velikost.
  const strety = new Map();   // "strana|útočník|cíl[|v]" → poškození
  const roundLog = [];
  const snap = a => armyFrom(a, Math.round);
  const pct = v => Math.round(v * 100);

  // ---- staty formace: vlastní stat jednotky + staty velitele ----
  // stackAtk/stackDef narůstají za každé dokončené kolo s velitelem v sedle
  const formAtk = (S, k) => S.ud[k].atk
    + (act(S) ? S.hero.atk + S.stacks * (S.hero.stackAtk || 0) : 0);
  const formDef = (S, k) => S.ud[k].def
    + (act(S) ? S.hero.def + S.stacks * (S.hero.stackDef || 0) : 0);
  const mod = diff => Math.max(0.5, Math.min(2, 1 + ATKDEF_STEP * diff));

  // ---- výběr cíle ----
  // Formace míří na typ, který poráží (kámen–nůžky–papír je tak vidět);
  // když ten padl, bije do nejsilnější zbývající. Velitel jde vždy na
  // nejsilnější formaci — jeho úder má bolet tam, kde je nepřítel nejtěžší.
  // Kolik CP drží clona strany — na tom stojí prolomení jízdou.
  // pickTarget i formRed potřebují číslo kola (taunt má okno), ale jsou
  // definované NAD smyčkou kol — proto sdílená proměnná, ne parametr
  let kolo = 0;
  // formace s taunt drží na sobě pozornost všeho, co není střelec: dokud
  // žije a běží její okno, mellee ani jízda si cíl nevybírají
  const tauntCil = (S, E, attKey) => {
    if (attKey === null) return null;                            // velitele trol nevydráždí
    if (radaJednotky(S.ud, attKey) === "strelec") return null;   // střelci střílí přes něj
    for (const k of UNIT_KEYS) {
      const u = E.ud[k];
      if (u && u.taunt > 0 && kolo <= u.taunt && alive(E, k)) return k;
    }
    return null;
  };
  const clonaCp = E => UNIT_KEYS.reduce((sum, k) =>
    (radaJednotky(E.ud, k) === "clona" && E.army[k] > 0.5)
      ? sum + E.army[k] * (E.ud[k].cp || 1) : sum, 0);

  // Dosáhne útočník `attKey` na cíl `cilKey`? VELITEL linie NEŘEŠÍ — je to
  // jeden muž, který si cíl vybírá sám, a jeho podíl je stejně omezený.
  const dosahne = (S, E, attKey, cilKey) => {
    if (attKey === null) return true;                            // velitel
    if (radaJednotky(E.ud, cilKey) !== "strelec") return true;   // clonu i jízdu bije každý
    const r = radaJednotky(S.ud, attKey);
    if (r === "strelec") return true;                            // střílí přes hlavy
    const clona = clonaCp(E);
    if (clona <= 0) return true;                                 // není co krýt
    if (r === "jizda")
      return clona < PROLOM_POMER * S.army[attKey] * (S.ud[attKey].cp || 1);
    return false;                                                // mellee neprojde
  };

  const pickTarget = (S, E, attKey, krome) => {
    const lze = k => k !== krome && alive(E, k) && dosahne(S, E, attKey, k);
    const vydrazdil = tauntCil(S, E, attKey);        // taunt přebíjí i countery
    if (vydrazdil && lze(vydrazdil)) return vydrazdil;
    // counters pojmenovává DRUH — hledá se kterýkoli klíč toho druhu, ať už
    // jde o vlastní jízdu, nebo o jízdu půjčenou od spojeneckého rodu
    const pref = attKey ? zakladniDruh((S.ud[attKey] || {}).counters || "") : null;
    if (pref) for (const k of UNIT_KEYS) if (zakladniDruh(k) === pref && lze(k)) return k;
    let best = null, bn = 0.5;
    for (const k of UNIT_KEYS)
      if (lze(k) && E.army[k] > bn) { bn = E.army[k]; best = k; }
    return best;
  };

  // ---- dopad poškození na JEDNU formaci ----
  // Přebytek nad zásobu životů formace se ZTRÁCÍ (viz komentář nahoře).
  // Velitel schytá malý podíl jako ochránce svých lidí; když už žádná formace
  // nestojí, dopadne na něj všechno — hrdina bez armády tedy umírá.
  const hitForm = (S, k, dmg, ev, mark, neodvratny) => {
    if (dmg <= 0) return 0;
    // obranná charga pohltí celý úder (funguje i při omráčení velitele —
    // je to připravená obrana armády, ne akce velitele). Neodvratný úder
    // (protějšek vyhnutí) ji ale obejde.
    if (!neodvratny && S.avoid > 0 && heroUp(S) && rng() * 100 < (S.hero.avoidChance || 0)) {
      S.avoid--;
      tot[S === A ? "avoidA" : "avoidD"] += dmg;
      if (ev) ev.push({ s: S === A ? "a" : "d", klic: S.avoid > 0 ? "bit.vyhnuti.zbyva" : "bit.vyhnuti", param: { zbyva: S.avoid } });
      return 0;
    }
    // velitel kryje své lidi vlastním tělem — schytá malý podíl každého úderu.
    // Padne-li celá armáda, bitva končí porážkou a velitel se stahuje živý
    // (umřít může jen v dlouhé bitvě, kde těch podílů nasčítá dost).
    if (heroUp(S)) {
      S.hero.hp -= dmg * HERO_DMG_SHARE;
      if (S.hero.hp <= 0) {
        S.hero.hp = 0;
        S.fell = true;
        if (ev) ev.push({ s: S === A ? "a" : "d", klic: "bit.velitel.padl", param: { hrdina: S.hero.name } });
      }
      dmg *= 1 - HERO_DMG_SHARE;
    }
    if (!k || S.army[k] <= 0) return 0;
    const u = S.ud[k];
    const pool = S.army[k] * u.hp;
    const use = Math.min(dmg, pool);          // přebytek propadá
    const killed = use / u.hp;
    S.army[k] = Math.max(0, S.army[k] - killed);
    if (mark) mark.killed += killed;
    return killed;
  };

  // ---- poškození jedné formace za kolo ----
  const formPower = (S, E, k, cil, r, role) => {
    const n = S.army[k];
    if (n <= 0.5) return 0;
    let m = unitPowerMult(S.f, k);
    const cilD = cil ? zakladniDruh(cil) : null;
    if (cilD && zakladniDruh(S.ud[k].counters || "") === cilD) m *= 1 + COUNTER_BONUS;
    if (cilD && S.ud[k].bonusVs && S.ud[k].bonusVs[cilD]) m *= S.ud[k].bonusVs[cilD]; // dlouhá kopí ap.
    if (S.f) {
      const sc = passiveScale(S.f, k);
      if (S.f.key === "aldar" && k === "cav" && r === 1) m *= 1 + 0.20 * sc;       // Výpad
      if (S.f.key === "yllien" && k === "arch" && r % 3 === 0) m *= 1 + 1.0 * sc;  // Dvojitý výstřel
      if (S.f.key === "durgar" && k === "inf") m *= 1 + 0.08 * sc * S.ragged;      // Krvavá zbroj
      if (S.f.key === "durgar" && k === "cav" && role === "att" && ctx.structure) m *= 1 + 0.25 * sc; // Beranidlo
      if (S.f.key === "horda" && k === "arch" && E.heroLed) m *= 1 + 0.25 * sc;    // Lovci hrdinů
      if (S.f.key === "horda" && k === "cav") m *= 1 + 0.05 * sc * (r - 1);        // Popelná smršť
    }
    // warboss: síla roste s pokladnicí rodu (strop drží tržnici na uzdě)
    const zl = S.ud[k].zlato;
    if (zl && S.f && S.f.resources)
      m *= 1 + Math.min(zl.max, (S.f.resources.gold || 0) / zl.za / 100);
    // podmínkové bonusy velitele: [typ jednotky] a [proti frakci]
    if (act(S) && S.hero.unitDmg) m *= 1 + (S.hero.unitDmg[k] || 0) / 100;
    if (act(S) && S.hero.vsAll) m *= 1 + S.hero.vsAll / 100;
    // kolová aktivka na celou armádu (např. „⏱ každé 3. kolo +25 %")
    if (act(S)) for (const a of (S.hero.armyActives || []))
      if (activeFires(a, r)) m *= 1 + a.pct / 100;
    return n * S.ud[k].dmg * m;
  };

  // ---- poškození velitele za kolo (vlastní kanál, ne přípočet k jednotkám) ----
  const heroPower = (S, E, r, ev, opakovany) => {
    if (!act(S)) return 0;
    const ward = E.hero ? E.hero.ward : 0;
    let d = S.hero.dmg * HERO_DMG_SCALE * (1 - ward);
    // kolová aktivka velitele: udeří za podíl svého poškození proti N cílům
    // (v navazujícím úderu už ne — spouští se jednou za kolo)
    for (const a of (opakovany ? [] : S.hero.actives || [])) {
      if (!activeFires(a, r)) continue;
      const extra = S.hero.dmg * HERO_DMG_SCALE * (a.pct / 100) * a.targets * (1 - ward);
      if (extra >= 0.5 && ev) ev.push({ s: S === A ? "a" : "d", klic: "bit.aktivka.cile", param: { schopnost: a.name, cile: a.targets, pct: a.pct, navic: Math.round(extra) } });
      d += extra;
    }
    return d;
  };

  let rounds = 0;
  for (let r = 1; r <= ROUND_CAP; r++) {
    if (!anyForm(A) || !anyForm(D)) break;
    rounds = r;
    const ev = [];
    // BOJOVÝ LOG KOLO PO KOLE (IV-P, zadání uživatele): vedle textových
    // poznámek se sbírají STRUKTUROVANÉ záznamy — kdo jedná, koho trefil,
    // za kolik a kolik se vyléčilo. Text se skládá až v UI, takže se dá
    // filtrovat a vykreslit tabulkou. Cena: ~8 řádků na kolo, tedy pár set
    // bajtů na bitvu (proti souhrnné matici střetů, která zůstává taky).
    const akce = [];
    let lecA = 0, lecD = 0;
    kolo = r;   // taunt okno čte pickTarget i formRed
    // ETAPA 12b: událost reportu je KLÍČ + parametry, ne hotová věta —
    // ikonu strany (⚔ útočník / 🛡 obránce) lepí až klient, aby se
    // s ní nemíchal jazyk. Starý report se stringy se pořád vykreslí.
    const note = (S, klic, param) => ev.push({ s: S === A ? "a" : "d", klic, param });
    const markA = { killed: 0 }, markD = { killed: 0 };

    // ---- omráčení: velitel se šancí stunChance vyřadí protějšek na kolo ----
    A.stunned = D.stunned = false;
    for (const [S, E] of [[A, D], [D, A]]) {
      if (!heroUp(S) || !(S.hero.stunChance > 0) || !heroUp(E)) continue;
      if (rng() * 100 >= S.hero.stunChance) continue;
      if (E.hero.stunImmune) {
        if (r === 1) note(E, "bit.stun.imunita", { hrdina: E.hero.name });
        continue;
      }
      E.stunned = true;
      note(S, "bit.stun", { hrdina: S.hero.name, cil: E.hero.name });
    }

    // ---- léčení během boje (v0.28): aktivka vrací část padlých do řad ----
    for (const S of [A, D]) {
      if (!act(S)) continue;
      for (const a of (S.hero.healActives || [])) {
        if (!activeFires(a, r)) continue;
        // ztráty se dělí na mrtvé/raněné až PO bitvě — během ní se křísí
        // z kumulativních ztrát (počáteční stav − současný)
        const init = S === A ? initA : initD;
        const E2 = S === A ? D : A;
        // kauterizace protivníka krátí léčení (rány se nehojí)
        const kauter = 1 - Math.min(75, (E2.hero && E2.hero.cauter) || 0) / 100;
        let vraceno = 0;
        for (const k of UNIT_KEYS) {
          const ztrata = Math.max(0, init[k] - S.army[k]);
          const zpet = ztrata * a.pct / 100 * kauter;
          if (zpet <= 0) continue;
          S.army[k] += zpet;
          vraceno += zpet;
        }
        if (vraceno >= 0.5) {
          note(S, "bit.leceni", { schopnost: a.name, pocet: Math.round(vraceno) });
          if (S === A) lecA += vraceno; else lecD += vraceno;
        }
      }
    }

    // ---- hlášky frakčních pasivek, které v tomto kole působí ----
    for (const [S, E, role] of [[A, D, "att"], [D, A, "def"]]) {
      if (!S.f) continue;
      const sc = k => passiveScale(S.f, k);
      if (S.f.key === "aldar") {
        if (r === 1 && alive(S, "cav")) note(S, "bit.pas.vypad", { pct: pct(0.20 * sc("cav")) });
        if (r === 1 && alive(S, "arch")) note(S, "bit.pas.salva", { pct: pct(0.25 * share(S, "arch") * sc("arch")) });
        if (r === 1 && alive(S, "inf")) note(S, "bit.pas.stit", { pct: pct(0.30 * sc("inf")) });
      }
      if (S.f.key === "yllien") {
        if (r % 3 === 0 && alive(S, "arch")) note(S, "bit.pas.dvojity");
        if (r === 1 && role === "def" && alive(S, "inf")) note(S, "bit.pas.uskok", { pct: pct(0.15 * sc("inf")) });
      }
      if (S.f.key === "durgar") {
        if (S.ragged > 0 && alive(S, "inf")) note(S, "bit.pas.krvava", { pct: pct(0.08 * sc("inf") * S.ragged) });
        if (r === 1 && role === "att" && alive(S, "arch") && ctx.defender.mult > 1)
          note(S, "bit.pas.sipky", { pct: pct(0.30 * share(S, "arch") * sc("arch")) });
        if (r === 1 && role === "att" && alive(S, "cav") && ctx.structure)
          note(S, "bit.pas.beranidlo", { pct: pct(0.25 * sc("cav")) });
      }
      if (S.f.key === "horda") {
        if (r === 1 && alive(S, "arch") && E.heroLed) note(S, "bit.pas.lovci", { pct: pct(0.25 * sc("arch")) });
        if (r >= 2 && alive(S, "cav")) note(S, "bit.pas.smrst", { pct: pct(0.05 * sc("cav") * (r - 1)) });
      }
    }

    // ---- opevnění a frakční srážky příchozího poškození ----
    // Těžké šipky: durgarští lučištníci obcházejí část obranného bonusu pole
    let defMult = ctx.defender.mult;
    if (A.f && A.f.key === "durgar" && defMult > 1)
      defMult = 1 + (defMult - 1) * (1 - 0.30 * share(A, "arch") * passiveScale(A.f, "arch"));
    // Přesná salva: aldarští lučištníci v 1. kole srazí úvodní úder nepřítele
    let outA = 1, outD = 1;
    if (r === 1) {
      if (A.f && A.f.key === "aldar") outD *= 1 - 0.25 * share(A, "arch") * passiveScale(A.f, "arch");
      if (D.f && D.f.key === "aldar") outA *= 1 - 0.25 * share(D, "arch") * passiveScale(D.f, "arch");
    }
    // srážka ztrát konkrétní formace (Štítová formace, Lesní úskok)
    const formRed = (S, k) => {
      let red = 1;
      if (S.f && S.f.key === "aldar" && k === "inf" && r === 1)
        red *= 1 - 0.30 * passiveScale(S.f, "inf");
      if (S.f && S.f.key === "yllien" && k === "inf" && S === D)
        red *= 1 - 0.15 * passiveScale(S.f, "inf");
      // kdo drží linii, drží ji pořádně: po dobu taunt okna schytává míň
      const u = S.ud[k];
      if (u && u.taunt > 0 && u.tauntDef > 0 && kolo <= u.taunt) red *= 1 - u.tauntDef;
      return red;
    };

    // ---- šílenství: zasažená formace se může obrátit proti vlastním řadám ----
    A.madness.clear(); D.madness.clear();
    for (const [S, E] of [[A, D], [D, A]]) {
      if (!act(S) || !(S.hero.madness > 0) || !anyForm(E)) continue;
      if (rng() * 100 >= S.hero.madness) continue;
      const kandidati = UNIT_KEYS.filter(k => alive(E, k));
      const kdo = kandidati[Math.floor(rng() * kandidati.length)];
      E.madness.add(kdo);
      note(S, "bit.silenstvi", { hrdina: S.hero.name, jednotka: E.ud[kdo].name });
    }
    // aura Demon Prince: vychází z JEDNOTKY, ne z velitele, a dopadá na OBĚ
    // strany — každá formace slabší (v CP) než nasazení princové se může
    // obrátit. Čím víc princů, tím víc chaosu včetně vlastních řad; formace,
    // která sama auru nese, je vůči ní imunní.
    for (const Z of [A, D]) {
      let auraCp = 0, auraPct = 0, auraJm = "";
      for (const k of UNIT_KEYS) {
        const u = Z.ud[k];
        if (!u || !(u.aura > 0) || !alive(Z, k)) continue;
        auraCp += Z.army[k] * (u.cp || 1);
        if (u.aura > auraPct) { auraPct = u.aura; auraJm = u.name; }
      }
      if (auraCp <= 0) continue;
      for (const C of [A, D]) for (const k of UNIT_KEYS) {
        if (!alive(C, k) || C.madness.has(k)) continue;
        const u = C.ud[k];
        if (!u || u.aura > 0) continue;                       // princ auře odolá
        if (C.army[k] * (u.cp || 1) >= auraCp) continue;      // silná formace taky
        if (rng() * 100 >= auraPct) continue;
        C.madness.add(k);
        note(Z, C === Z ? "bit.aura.vlastni" : "bit.aura.nepritel", { aura: auraJm, jednotka: u.name });
      }
    }

    // ---- pořadí jednajících: velitelé napřed, pak formace dle rychlosti ----
    const actors = [];
    if (act(A)) actors.push({ S: A, E: D, k: null, spd: 1000 + (A.hero.speed || 0) });
    if (act(D)) actors.push({ S: D, E: A, k: null, spd: 1000 + (D.hero.speed || 0) });
    for (const k of UNIT_KEYS) {
      if (alive(A, k)) actors.push({ S: A, E: D, k,
        spd: Math.max(1, A.ud[k].ini - ((D.hero && D.hero.slowEnemy) || 0)) });
      if (alive(D, k)) actors.push({ S: D, E: A, k,
        spd: Math.max(1, D.ud[k].ini - ((A.hero && A.hero.slowEnemy) || 0)) });
    }
    // shoda rychlosti → útočník napřed (deterministicky, bez rng)
    actors.sort((x, y) => y.spd - x.spd || (x.S === A ? -1 : 1));
    // pořadí do logu: hráč se dřív nedozvěděl, KDO v kole začíná
    const poradi = actors.map(ac => ({ s: ac.S === A ? "a" : "d", k: ac.k,
      spd: Math.round(ac.spd) }));
    if (r === 1) {
      const spdA = heroUp(A) ? A.hero.speed : MILITIA_SPEED;
      const spdD = heroUp(D) ? D.hero.speed : MILITIA_SPEED;
      if (spdA !== spdD)
        note(spdA > spdD ? A : D, "bit.rychlejsi", { nase: Math.max(spdA, spdD), jejich: Math.min(spdA, spdD) });
    }

    // Jeden úder. Vrací true, když skutečně dopadl — velitel ho díky
    // navazujícímu úderu může provést v kole dvakrát a druhý úder se počítá
    // celý znovu (jiný cíl, nová šance na pohlcení, nové procy).
    const uderit = (ac, opakovany) => {
      const { S, E } = ac;
      if (!anyForm(E)) return false;
      if (ac.k !== null && !alive(S, ac.k)) return false;
      const role = S === A ? "att" : "def";
      // šílená formace se s poloviční šancí vrhne na vlastní řady
      let T = E, zbesily = false;
      if (ac.k !== null && S.madness.has(ac.k) && rng() < 0.5) { T = S; zbesily = true; }
      const cil = pickTarget(S, T, zbesily ? null : ac.k, zbesily ? ac.k : null);
      if (!cil) return false;
      // proti vlastním lidem neplatí opevnění ani frakční otvíráky
      const out = zbesily ? 1 : (S === A ? outA : outD);
      const opev = zbesily ? 1 : (S === A ? defMult : 1);
      const nasob = zbesily ? 1 : (S === A ? ctx.attacker.mult : 1);
      const mark = T === A ? markA : markD;

      let dmg = 0, velitel = 0, neodvratny = false;
      if (ac.k === null) {
        // velitel: vlastní úder + kouzla (kouzla obchází útok/obranu i opevnění)
        const uder = heroPower(S, E, r, ev, opakovany);
        const f = nasob * out * mod(S.hero.atk - formDef(T, cil)) * formRed(T, cil) / opev;
        velitel = uder * f;
        // kouzla se v navazujícím úderu neopakují — jde o jeden proud vůle
        const kouzlo = (!opakovany && act(S))
          ? S.hero.spell * HERO_DMG_SCALE * (1 - (E.hero ? E.hero.ward : 0)) : 0;
        if (r === 1 && kouzlo >= 1)
          note(S, "bit.kouzla", { hrdina: S.hero.name, dmg: Math.round(kouzlo) });
        velitel += kouzlo;
        dmg = velitel;
        // neodvratný úder: obranná charga ho nepohltí
        if (act(S) && S.hero.pursuit > 0 && rng() * 100 < S.hero.pursuit) {
          neodvratny = true;
          note(S, "bit.neodvratny", { hrdina: S.hero.name });
        }
      } else {
        const stret = S.ud[ac.k].magic ? 1 : mod(formAtk(S, ac.k) - formDef(T, cil));
        const f = nasob * out * stret * formRed(T, cil) / opev;
        dmg = formPower(S, E, ac.k, cil, r, role) * f;
      }
      dmg /= DMG_PACE;
      velitel /= DMG_PACE;
      if (dmg <= 0) return false;
      if (zbesily)
        note(S, "bit.silenstvi.uder", { jednotka: S.ud[ac.k].name, cil: S.ud[cil].name });
      tot[S === A ? "dmgA" : "dmgD"] += dmg;
      if (velitel > 0) tot[S === A ? "cmdA" : "cmdD"] += velitel;
      const zabito = hitForm(T, cil, dmg, ev, mark, neodvratny);
      const kus = ac.k !== null ? S.ud[ac.k] : null;
      if (kus && !zbesily && zabito > 0) {
        const vychozi = (S === A ? initA : initD)[ac.k] || 0;
        // lifesteal: část uděleného poškození se vrátí do vlastních řad
        // (nejvýš na výchozí stav — je to léčení, ne rozmnožování)
        if (kus.lifesteal > 0) {
          const vraceno = Math.min(dmg * kus.lifesteal / kus.hp,
            Math.max(0, vychozi - S.army[ac.k]));
          if (vraceno > 0) {
            S.army[ac.k] += vraceno;
            tot[S === A ? "revA" : "revD"] += vraceno;
          }
        }
        // Konverze: pobití vstávají v řadách nekromantů a do konce bitvy za ně
        // bojují. Je to DVOJÍ ŠVIH — nepříteli ubudou a nám přibudou.
        //
        // ZÁMĚRNĚ JEN NA BITVU: přeživší se na obou stranách ořezávají na
        // výchozí stav (remA přes Math.min(initA), obránce přes defFrac ≤ 1),
        // takže vzkříšení se domů nevrátí. Bez toho by vhorren snowballoval
        // a navíc už jednu posmrtnou odměnu má (Kostěné řady vracejí 25 %
        // vlastních padlých po výhře). Změřeno: ztráty obránce +51 %.
        //
        // Přepočítává se přes VELENÍ, jinak by převod levných těl vyráběl
        // drahé mágy zadarmo; strop je dvojnásobek výchozího stavu, ať
        // formace uprostřed bitvy nenaroste v lavinu.
        if (kus.konverze > 0 && T !== S) {
          const cilU = T.ud[cil];
          const kusu = Math.min(T.army[cil], zabito * kus.konverze);
          const pribude = Math.min(kusu * (cilU.cp || 1) / (kus.cp || 1),
            Math.max(0, vychozi * 2 - S.army[ac.k]));
          if (pribude > 0 && kusu > 0) {
            T.army[cil] = Math.max(0, T.army[cil] - kusu);
            if (mark) mark.killed += kusu;
            S.army[ac.k] += pribude;
            tot[S === A ? "revA" : "revD"] += pribude;
            if (r === 1) note(S, "bit.konverze", { jednotka: kus.name, cil: cilU.name });
          }
        }
      }
      const klic = (S === A ? "a" : "d") + "|" + (ac.k || "-") + "|" + cil + (zbesily ? "|v" : "");
      strety.set(klic, (strety.get(klic) || 0) + dmg);
      // týž záznam, ale S ČÍSLEM KOLA — z toho staví UI průběh bitvy
      akce.push({ s: S === A ? "a" : "d", k: ac.k || null, c: cil,
        d: Math.round(dmg), ...(zbesily ? { vl: 1 } : {}), ...(opakovany ? { op: 1 } : {}) });
      return true;
    };

    // ---- vlastní kolo ----
    for (const ac of actors) {
      if (!anyForm(ac.E)) break;
      uderit(ac, false);
      // navazující úder velitele: PLNÝ druhý útok, ne přípočet k prvnímu
      if (ac.k === null && act(ac.S) && ac.S.hero.followUp > 0
          && rng() * 100 < ac.S.hero.followUp && anyForm(ac.E)) {
        note(ac.S, "bit.navazujici", { hrdina: ac.S.hero.name });
        uderit(ac, true);
      }
    }

    // ---- konec kola: vztek, požírači, hlášky velitele ----
    if (markA.killed > 0.5) A.ragged++;
    if (markD.killed > 0.5) D.ragged++;
    const lsA = A.f && A.f.key === "horda" ? 0.10 * share(A, "inf") * passiveScale(A.f, "inf") : 0;
    const lsD = D.f && D.f.key === "horda" ? 0.10 * share(D, "inf") * passiveScale(D.f, "inf") : 0;
    const revA = markD.killed * lsA, revD = markA.killed * lsD;
    tot.revA += revA; tot.revD += revD;
    if (revA > 0) reviveInto(A.army, revA);
    if (revD > 0) reviveInto(D.army, revD);
    if (revA >= 0.5) note(A, "bit.pozirac", { pocet: Math.round(revA) });
    if (revD >= 0.5) note(D, "bit.pozirac", { pocet: Math.round(revD) });

    if (r === 1) for (const S of [A, D]) {
      if (!heroUp(S)) continue;
      if (S.hero.stackAtk) note(S, "bit.stoh.utok", { hrdina: S.hero.name, kolik: Math.round(S.hero.stackAtk * 100) / 100 });
      if (S.hero.stackDef) note(S, "bit.stoh.obrana", { hrdina: S.hero.name, kolik: Math.round(S.hero.stackDef * 100) / 100 });
      if (S.hero.stunChance > 0) note(S, "bit.stun.sance", { hrdina: S.hero.name, sance: S.hero.stunChance });
      if (S.avoid > 0) note(S, S.hero.avoidChance < 100 ? "bit.pohlti.sance" : "bit.pohlti", { hrdina: S.hero.name, pocet: S.avoid, sance: S.hero.avoidChance });
      for (const a of (S.hero.armyActives || []))
        note(S, a.round ? "bit.aktivka.kolo" : "bit.aktivka.kazde", { schopnost: a.name, pct: a.pct, kolo: a.round, kazde: a.every });
      if (S.hero.unitDmg) for (const k of UNIT_KEYS) {
        if (S.hero.unitDmg[k] > 0 && (S === A ? initA : initD)[k] > 0.5)
          note(S, "bit.jednotka.dmg", { hrdina: S.hero.name, ikona: S.ud[k].icon, jednotka: S.ud[k].name, pct: S.hero.unitDmg[k] });
      }
      if (S.hero.vsAll > 0) note(S, "bit.vsall", { hrdina: S.hero.name, pct: S.hero.vsAll });
    }

    // stav strany v tomto kole: omráčení, šílené formace a nasčítané stohy
    // (stackAtk/stackDef rostou každým dokončeným kolem s živým velitelem)
    const stav = S => ({
      ...(S.stunned ? { stun: 1 } : {}),
      ...(S.madness && S.madness.size ? { sil: [...S.madness] } : {}),
      ...(S.stacks ? { st: S.stacks } : {}),
    });
    roundLog.push({ r, pA: Math.round(tot.dmgA), pD: Math.round(tot.dmgD),
      killedA: Math.round(markA.killed), killedD: Math.round(markD.killed),
      hpA: A.hero ? Math.max(0, Math.round(A.hero.hp)) : null,
      hpD: D.hero ? Math.max(0, Math.round(D.hero.hp)) : null,
      remA: snap(A.army), remD: snap(D.army), ev,
      // IV-P: strukturovaný průběh kola
      poradi, akce,
      ...(lecA >= 0.5 ? { lecA: Math.round(lecA) } : {}),
      ...(lecD >= 0.5 ? { lecD: Math.round(lecD) } : {}),
      stavA: stav(A), stavD: stav(D) });

    if (act(A)) A.stacks++;
    if (act(D)) D.stacks++;

    // ---- zlomení: strana pod ROUT_AT původního stavu odtáhne ----
    const sila = (S, init) => armyTotal(S.army) / Math.max(1, armyTotal(init));
    if (anyForm(A) && sila(A, initA) < ROUT_AT) {
      A.routed = true;
      note(A, "bit.ustup", { hrdina: A.hero ? A.hero.name : { klic: "bit.vojsko" } });
    }
    if (anyForm(D) && sila(D, initD) < ROUT_AT) {
      D.routed = true;
      note(D, "bit.obrana.hrouti");
    }
    if (A.routed || D.routed) break;
  }

  // ---- výsledek ----
  // Útočník bere pole, když obrana padla nebo se zlomila — ale jen pokud se
  // sám nezlomil dřív. Jinak je útok odražen (remíza) a vrací se s přeživšími.
  const won = !!((!anyForm(D) || D.routed) && !A.routed && anyForm(A));
  const remA = emptyArmy(), attLosses = emptyArmy(), defFrac = {};
  const lossA = { dead: emptyArmy(), wounded: emptyArmy() };
  for (const k of UNIT_KEYS) {
    remA[k] = Math.min(initA[k], Math.max(0, Math.round(A.army[k])));
    attLosses[k] = initA[k] - remA[k];
    // ztráty se dělí na padlé a raněné; ranění se dají vrátit v nemocnici
    lossA.dead[k] = Math.round(attLosses[k] * LOSS_DEAD);
    lossA.wounded[k] = attLosses[k] - lossA.dead[k];
    defFrac[k] = won ? 0 : (initD[k] > 0 ? Math.max(0, Math.min(1, D.army[k] / initD[k])) : 1);
  }
  const defKilled = Math.max(0, Math.round(armyTotal(initD) - armyTotal(D.army)));
  for (const k in tot) tot[k] = Math.round(tot[k]);
  return { won, rounds, remA, remD: snap(D.army), attLosses, defFrac, defKilled,
    initA, initD: snap(initD), roundLog, tot, lossA,
    strety: [...strety.entries()].map(([klic, d]) => {
      const [strana, k, c, vlastni] = klic.split("|");
      return { s: strana, k: k === "-" ? null : k, c, d: Math.round(d),
        ...(vlastni ? { vl: 1 } : {}) };
    }).filter(x => x.d > 0).sort((a, b) => b.d - a.d),
    heroHpA: A.hero ? Math.max(0, Math.round(A.hero.hp)) : null,
    heroHpD: D.hero ? Math.max(0, Math.round(D.hero.hp)) : null,
    heroFellA: A.fell, heroFellD: D.fell };
}

// ---------- Čtvercová mřížka (na obrazovce „na koso") ----------
// Souřadnice (q, r) jsou celočíselná mřížka; otočku o 45° dělá až projekce
// (render: tileToPixel / poleNa3D), data zůstávají rovná. Sousedé 4 hranou.
const DIRS4 = [ [1, 0], [-1, 0], [0, 1], [0, -1] ];
const keyOf = (q, r) => q + "," + r;
// pochodová vzdálenost = Manhattan (přesně tolik kroků udělá armáda po polích)
function gridDist(a, b) {
  return Math.abs(a.q - b.q) + Math.abs(a.r - b.r);
}
// „krajinná" vzdálenost pro stupně polí: průměr Manhattanu a Čebyševa dává
// osmiúhelníkové vrstevnice — bez něj by rohy čtvercového světa (Manhattan
// až 2×MAP_R) spadly celé do stupně 1 a 60 % mapy by byl prázdný okraj
function distLvl(q, r) {
  const aq = Math.abs(q), ar = Math.abs(r);
  return (aq + ar + Math.max(aq, ar)) / 2;
}

// ---------- Stav hry ----------
const G = {
  tiles: new Map(),
  factions: [],
  playerFaction: 0,
  tick: 0,
  running: false,
  gameOver: false,
  throneHold: { fid: -1, ticks: 0, pulka: false },  // souvislé držení Trůnu
  winnerId: -1,        // vítěz sezóny (držením Trůnu, nebo skóre na konci)
  seasonNumber: 1,     // pořadí sezóny (server/localStorage ho drží mezi sezónami)
  log: [],
  reports: [],      // bojové reporty (záznamy kol pro prohlížeč bitev)
  nextReportId: 1,
  mapEvents: [],    // putovní události na mapě {key, type, ticksLeft, total}
  nextEventTick: 0,
  storm: 0,         // zbývající tiky popelné bouře (0 = klid)
  nextStormTick: 0,
  throneOpen: false,
  playerClen: 0,    // cid hráčova aktéra ve frakci (v0.32; 0 = zakladatel)
  nextLogId: 0,     // kronika jde po kusech jako chat (etapa 9)
  klany: [],        // klany uvnitř rodů (etapa 8) — žijí v sezóně, ne na účtu
  nextKlanId: 0,
  chat: [],         // zprávy tří kanálů (etapa 9) — server je rozesílá po kusech
  nextChatId: 0,
  rozhodujici: {},  // fid → {klan, sila, doTiku} — kdo mluví za rod (etapa 10)
  hlasovani: [],    // otevřená i dohlasovaná hlasování o válce a míru
  nextHlasId: 0,
  faze: 1,          // otevírání světa (v0.30): 1 vlastní výseč → 4 vnitřek
  checkpointy: [false, false, false], // uznané kolektivní checkpointy (v0.31)
  goals: [],        // MRTVÉ od v0.31 (kapitoly jedou per frakce v f.journey)
  visible: new Set(),  // mlha války: co hráč právě vidí
  explored: new Set(), // co už kdy viděl
  zive: null,          // etapa 11b: pole, která potřebují pozornost tiku (viz obnovZive)
  dotcene: null,       // etapa 11b: pole, kterým se má prověřit otisk (čte server)
  onEvent: null,       // hook pro zvuky/efekty UI (name, factionId)
};

// události pro UI (zvuky): hra sama nic nepřehrává, jen hlásí
// cid (v0.32): událost míří konkrétnímu členovi frakce (chybí = zakladatel)
function emitEvent(name, factionId, cid) {
  if (G.onEvent) { try { G.onEvent(name, factionId, cid); } catch (e) {} }
}

function mapEventAt(key) { return G.mapEvents.find(e => e.key === key) || null; }

function tileAt(q, r) { return G.tiles.get(keyOf(q, r)); }
function neighborsOf(tile) {
  const out = [];
  for (const [dq, dr] of DIRS4) {
    const t = tileAt(tile.q + dq, tile.r + dr);
    if (t) out.push(t);
  }
  // v0.40: dvojice mostů je spojená PŘES VODU — protější břeh je soused,
  // takže se z dobytého břehu dá udeřit na druhý a pak pokračovat dál.
  // Platí to i pro pathfinding, dohled a šíření území (jedna hrana v grafu).
  const twin = bridgeTwin(tile);
  if (twin) out.push(twin);
  return out;
}

// v0.41: SOUSEDSTVÍ PRO ZÁBOR je osmisměrné — hranou i rohem. Mřížka je na
// obrazovce otočená o 45°, takže čtyři hranoví sousedé leží „do X" a čtyři
// rohoví „do +"; expandovat jde tedy do všech osmi směrů kolem pole.
// POZOR — roh se NEUZNÁVÁ, když jsou obě pole mezi ním a mnou neprůchodná
// („no corner cutting"). Bez toho by šlo proklouznout rohem mezi dvěma poli
// hradebního prstence (ta se v mřížce dotýkají JEN rohy!) a obejít brány.
// Řeka drží i tak: roh přeskočí nejvýš o dvě pole a pás vody je široký tři.
// Generátor, dohled a spojitost světa dál jedou po čtyřech hranách.
const DIRS_ROH = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
function rohoviSousedi(tile) {
  const out = [];
  for (const [dq, dr] of DIRS_ROH) {
    const t = tileAt(tile.q + dq, tile.r + dr);
    if (!t) continue;
    const a = tileAt(tile.q + dq, tile.r), b = tileAt(tile.q, tile.r + dr);
    if ((a && TERRAIN[a.terrain].passable) || (b && TERRAIN[b.terrain].passable)) out.push(t);
  }
  return out;
}
function sousediZaboru(tile) { return neighborsOf(tile).concat(rohoviSousedi(tile)); }

// ETAPA 11b: OKOLÍ MÍSTO CELÉ MAPY.
//
// AI hledala cíle na zábor tak, že prošla CELOU mapu a u každého pole se
// zeptala „sousedí se mnou?" — což je ~16 vyhledání v Mapě přes skládaný
// řetězcový klíč. Na mapě 1459×1459 to bylo 88,7 % celého tiku, přestože
// pole dál než REACH stejně propadlo filtrem dosahu o pár řádků níž.
// Průchod světem byl tedy jen drahá cesta ke stejné množině.
//
// ⚠ POŘADÍ MUSÍ ZŮSTAT JAKO U `G.tiles.values()`, tedy podle (q, r)
// vzestupně — tak je vkládá genMap. Kandidáti se řadí podle skóre a shodné
// skóre rozhoduje pořadí vložení (sort v JS je stabilní), takže jiné pořadí
// by AI začala rozhodovat jinak a rozešly by se otisky map i sim brána.
function poleVOkoli(stredy, r) {
  const klice = new Set();
  for (const s of stredy) {
    for (let dq = -r; dq <= r; dq++) {
      const zb = r - Math.abs(dq);          // Manhattan: |dq| + |dr| <= r
      for (let dr = -zb; dr <= zb; dr++) klice.add(keyOf(s.q + dq, s.r + dr));
    }
  }
  const ven = [];
  for (const k of klice) { const t = G.tiles.get(k); if (t) ven.push(t); }
  ven.sort((a, b) => a.q - b.q || a.r - b.r);
  return ven;
}

// ---------- Velké stopy staveb (v0.22) ----------
// Města, kapitály a Trůn zabírají 3×3 pole, silná pole (stupeň 9+) 2×2 —
// jako v předloze. KOTVA (u 3×3 střed, u 2×2 levý dolní roh) nese posádku,
// strukturu a bigSize + bigKeys; ČLENOVÉ mají t.big = klíč kotvy, dědí stupeň
// i surovinu (výnos běží na každém poli bloku) a všechno bojové se přes ně
// jen PŘESMĚRUJE na kotvu: jeden blok = jedna bitva = jeden zábor celku.
function bigAnchor(t) { return t && t.big ? G.tiles.get(t.big) || t : t; }
function blockTiles(a) {
  if (!a.bigKeys) return [a];
  return [a, ...a.bigKeys.map(k => G.tiles.get(k)).filter(Boolean)];
}
function setTileOwner(tile, owner, cid, klan) {
  // cid (v0.32): pole drží konkrétní člen frakce; velké sdílené stavby a
  // neutralizace cid mažou (chybějící clen = zakladatel frakce)
  // klan (etapa 8): TŘETÍ úroveň — pole patří klanu, ne osobě. Klanové a osobní
  // vlastnictví se VYLUČUJÍ, proto se t.clen při klanovém záboru maže.
  zrusPrehled();   // etapa 11: přehled aktérů je keš na tik, zábor ji mění
  zrusVyspy();     // etapa 11b: výspa může se záborem změnit majitele
  for (const m of blockTiles(bigAnchor(tile))) {
    ozivPole(m);
    m.owner = owner;
    if (klan) { m.klan = klan; delete m.clen; }
    else {
      delete m.klan;
      if (cid) m.clen = cid;
      else delete m.clen;
    }
  }
}
// pokusí se z kotvy udělat blok n×n; členové musí být volná, průchozí,
// neutrální pole bez řek a struktur. Vrací false a nic nemění, když to nejde.
function makeBig(anchor, n, dovolPrevzit = false) {
  // sudé stopy (2×2) kotví levým dolním rohem, liché (3×3, 5×5) STŘEDEM
  const off = n % 2 === 0
    ? Array.from({ length: n }, (_, i) => i)
    : Array.from({ length: n }, (_, i) => i - ((n - 1) >> 1));
  const clenove = [];
  for (const dq of off) for (const dr of off) {
    if (dq === 0 && dr === 0) continue;
    const t = tileAt(anchor.q + dq, anchor.r + dr);
    if (!t || t.structure || t.big || t.bigSize || t.riv) return false;
    if (!dovolPrevzit && (t.owner !== -1 || !TERRAIN[t.terrain].passable)) return false;
    clenove.push(t);
  }
  anchor.bigSize = n;
  anchor.bigKeys = clenove.map(t => keyOf(t.q, t.r));
  for (const t of clenove) {
    t.big = keyOf(anchor.q, anchor.r);
    if (!TERRAIN[t.terrain].passable) t.terrain = "plains";
    t.level = anchor.level;
    t.owner = anchor.owner;
    t.garrison = 0;
  }
  zrusPrehled();   // blok mění vlastnictví mimo setTileOwner
  return true;
}

// ---------- KEEPY KRAJŮ (etapa 7, IV-C) ----------
// Jeden keep na kraj = devět keepů (střed + osm výsečí). Umísťuje se
// DETERMINISTICKY (bez rng), aby se generátor nerozjel se seedy: v každém
// kraji se seřadí kandidáti podle vzdálenosti od STŘEDU sporného pásu a bere
// se první, na kterém se povede blok 5×5.
//
// Proč doprostřed EXPANZE a ne kamkoli: kolébka je od etapy 7 nedotknutelná,
// takže keep v ní by nikdo nikdy nedobyl a „kdo drží keep, drží kraj" by bylo
// prázdné pravidlo. Keep Srdce Vellaru sedí v mezikruží.
function placeKeeps() {
  const stredExpanze = (OUTER_R + kolebkaR()) / 2;
  const stredMezikruzi = (WALL_R + OUTER_R) / 2;
  // brány prstenců se hledají JEDNOU — sken přes všechna pole u každého
  // kandidáta by z generátoru udělal O(polí²)
  const brany = [...G.tiles.values()].filter(t =>
    t.structure === "grandfort" || t.structure === "bastion" || t.structure === "fortress");

  const kandidati = new Map();          // kraj → [{t, skore, uBrany}]
  for (const t of G.tiles.values()) {
    if (t.structure || t.big || t.bigSize || t.riv) continue;
    if (!TERRAIN[t.terrain].passable) continue;
    const z = zonaOf(t);
    const vExpanzi = z.startsWith("expanze-");
    if (!vExpanzi && z !== "mezikruzi") continue;
    if (CAPITAL_POS.some(c => gridDist(t, c) < 9)) continue;
    const m = Math.abs(t.q) + Math.abs(t.r);
    const skore = Math.abs(m - (vExpanzi ? stredExpanze : stredMezikruzi));
    const kraj = regionOf(t);
    if (!kandidati.has(kraj)) kandidati.set(kraj, []);
    kandidati.get(kraj).push({ t, skore, uBrany: brany.some(x => gridDist(t, x) < 6) });
  }

  let postaveno = 0;
  for (const [, seznam] of kandidati) {
    // tie-break podle souřadnic, ať je pořadí stabilní napříč běhy
    seznam.sort((a, b) => a.skore - b.skore || a.t.q - b.t.q || a.t.r - b.t.r);
    // dvě kola: nejdřív s odstupem od bran, pak bez něj. Bez druhého kola
    // zůstalo pět krajů z devíti bez keepu (brány a uzly 2×2 sežerou místo).
    // tři kola: 5×5 s odstupem od bran → 5×5 kdekoli → 3×3 jako záchrana.
    // Bez posledního kola zůstaly dva kraje z devíti bez keepu (jejich expanzní
    // pás je prošpikovaný uzly 2×2 a řekami a souvislých 25 polí tam není).
    let hotovo = false;
    for (const [n, jenDaleko] of [[5, true], [5, false], [3, false]]) {
      for (const k of seznam) {
        if (jenDaleko && k.uBrany) continue;
        if (zkusKeep(k.t, n)) { hotovo = true; break; }
      }
      if (hotovo) break;
    }
    if (hotovo) postaveno++;
  }
  return postaveno;
}

// Postaví keep na poli, nebo pole vrátí do původního stavu. Bez vracení by
// po každém neúspěšném pokusu zůstalo na mapě pole stupně 12 s posádkou keepu.
function zkusKeep(t, n = 5) {
  const zaloha = { terrain: t.terrain, level: t.level, garrison: t.garrison, res: t.res };
  t.terrain = "plains";
  t.structure = "keep";
  t.level = 12;
  t.garrison = STRUCTURES.keep.militia;
  if (makeBig(t, n)) return true;
  t.structure = null;
  t.terrain = zaloha.terrain;
  t.level = zaloha.level;
  t.garrison = zaloha.garrison;
  t.res = zaloha.res;
  return false;
}

// ---------- Řeky a mosty ----------
// Čtyři řeky vedou po úhlopříčkách mřížky (mezi sousedními hlavními městy)
// od vnějšího prstence k okraji světa — na obrazovce jsou to vodorovné a
// svislé toky dělící mapu na kvadranty. Dílky řeky se dotýkají rohy, což
// pohyb po 4 sousedech blokuje stejně spolehlivě jako plná zeď.
// Každou řeku překonává jediný most.
// v0.40: řeka je PÁS ŠÍŘKY 3 POLÍ (dřív jediná řada). Osa pásu je původní
// koryto, k němu se přidávají dva postranní pruhy — hranice výsečí je tím
// skutečná překážka, ne linka. Směr koryta ("a"–"d") si nesou všechna pole
// pásu, aby model seděl.
const RIVER_HALF = 1;              // pruhů na každou stranu osy (šířka = 2×+1)
function riverKeys() {
  // klíč → směr koryta: "a" podél světové X, "b" podél Z (úhlopříčné pásy),
  // "c" podél světové úhlopříčky (1,1), "d" podél (−1,1) — osové pásy.
  const keys = new Map();
  const man = (q, r) => Math.abs(q) + Math.abs(r);
  for (let q = -MAP_R; q <= MAP_R; q++) {
    for (let r = -MAP_R; r <= MAP_R; r++) {
      // úhlopříčné pásy začínají VNĚ prstence (Manhattan > OUTER_R),
      // osové až za ním (|osa| > OUTER_R) — uvnitř dělí svět hradby
      if (Math.abs(q - r) <= RIVER_HALF && man(q, r) > OUTER_R) keys.set(keyOf(q, r), "b");
      else if (Math.abs(q + r) <= RIVER_HALF && man(q, r) > OUTER_R) keys.set(keyOf(q, r), "a");
      else if (Math.abs(r) <= RIVER_HALF && Math.abs(q) > OUTER_R) keys.set(keyOf(q, r), "c");
      else if (Math.abs(q) <= RIVER_HALF && Math.abs(r) > OUTER_R) keys.set(keyOf(q, r), "d");
      // ETAPA 7 (IV-K): PRSTENCOVÝ DĚLIČ KOLÉBKY. Bez něj se dá z kolébky
      // vyjít kdekoli a pravidlo „vítěz musí držet crossing" nemá co držet.
      // Vede po vrstevnici MANHATTANU (kolebkaR), a to je právě ten důvod,
      // proč se dělič měří Manhattanem: vrstevnice jsou kosočtverce se stranami
      // podél (1,1) a (1,−1), tedy přesně směry, na které máme modely řek.
      // Kvadranty se shodnými znaménky leží podél (1,−1) = "a", ostatní "b".
      else if (Math.abs(man(q, r) - kolebkaR()) <= RIVER_HALF)
        keys.set(keyOf(q, r), (q >= 0) === (r >= 0) ? "a" : "b");
    }
  }
  return keys;
}

// v0.40: most už není JEDNO pole uprostřed vody, ale DVOJICE polí na
// PROTILEHLÝCH BŘEZÍCH. Obě jsou průchozí, obě brání dvě armády a jsou
// spojená „přes vodu" (neighborsOf je vrací jako sousedy), takže přejít
// řeku znamená dobýt oba břehy — nejdřív ten svůj, z něj až druhý.
// stavMosty vrací PLOCHÝ seznam klíčů (osm dvojic = 16 polí), párování drží
// BRIDGE_PAIR: klíč → klíč protějšku.
const BRIDGE_PAIR = new Map();
const BRIDGE_DIR = new Map();      // klíč mostu → směr koryta, které překlenuje
// PŘECHOD PŘES DĚLIČ KOLÉBKY je jiný živel než laterální most (ETAPA 7):
// laterální most je SPORNÁ HRANICE mezi dvěma rody, kolébkový přechod jsou
// VLASTNÍ vrata rodu ven z domova. Kdyby měl tvrdost laterálního (posádka
// 2 781, velitelé úrovně 35), nikdo by se ze startovní zóny nedostal —
// změřeno: gate spadl na 0/64, protože AI nevylezla z kolébky ani jednou.
// Je to proto „stupeň 1" křivky obtížnosti: první objektiv sezóny.
const KOLEBKA_MOSTY = new Set();   // klíče obou břehů všech osmi přechodů
const KOLEBKA_MOST_MILICE = 120;   // posádka (proti 2 781 u laterálního mostu)
const KOLEBKA_MOST_LEVEL = 5;     // úroveň velitelů (proti BRIDGE_LEVEL 35)
const jeKolebkovyMost = t => !!(t && t.structure === "bridge"
  && KOLEBKA_MOSTY.has(keyOf(t.q, t.r)));
// posádka stavby — u kolébkových přechodů měkčí než tabulka STRUCTURES
function struktMilice(t) {
  if (jeKolebkovyMost(t)) return KOLEBKA_MOST_MILICE;
  return (STRUCTURES[t.structure] || {}).militia || 0;
}
function stavMosty() {
  const b = RIVER_HALF + 1;        // první pole ZA pásem = břeh
  // ETAPA 7 (IV-K): laterální crossingy musí ležet v EXPANZNÍM PÁSU, ne
  // v kolébce. Do v0.53 byly na distLvl 24,5 a 25, tedy uvnitř kolébek —
  // most se dal vzít, ale za ním byla nedotknutelná zóna a laterální PvP
  // nešlo vůbec. Poloměry se proto odvozují ze STROPU EXPANZE.
  //
  // Úhlopříčný břeh (o+u, o−u) má Manhattan 2o, osový břeh (a, ±b) pak a+b.
  // Obojí musí zůstat POD stropem expanze, a to s rezervou jednoho pole.
  const u = Math.ceil(b / 2);
  const strop = kolebkaR() - 2;
  const o = Math.max(WALL_R + 1, Math.min(OUTER_R, Math.floor(strop / 2)));
  const a = Math.max(OUTER_R + 2, Math.min(Math.round(1.5 * OUTER_R), strop - b));
  // v0.41: u ÚHLOPŘÍČNÝCH řek se posun sčítá do OBOU souřadnic, takže pás
  // překročí dvakrát rychleji — břeh je až u |q−r| = 2b, tedy o pás dál, než
  // má být (v0.40 stály tyhle čtyři mosty dvě pole od vody, na suchu). Půlka
  // posunu to vrací na první pole za pásem.
  // [břeh 1, břeh 2, směr koryta pod mostem (pro model)]
  const dvojice = [
    // úhlopříčné řeky (osa q=r resp. q=−r) — břehy leží kolmo na koryto
    [[o + u, o - u], [o - u, o + u], "b"],
    [[-o + u, -o - u], [-o - u, -o + u], "b"],
    [[o + u, -o + u], [o - u, -o - u], "a"],
    [[-o + u, o + u], [-o - u, o - u], "a"],
    // osové řeky (pás kolem r=0 resp. q=0) — břehy nad a pod pásem
    [[a, -b], [a, b], "c"], [[-a, -b], [-a, b], "c"],
    [[-b, a], [b, a], "d"], [[-b, -a], [b, -a], "d"],
  ];
  // PŘECHODY PŘES DĚLIČ KOLÉBKY — jeden na výseč (ETAPA 7, IV-K).
  // Leží na PŮLÍCÍ PŘÍMCE oktantu, aby žádný nespadl na hranici dvou výsečí:
  // vnitřní břeh v expanzi (Manhattan kolebkaR−2), vnější v kolébce (+2).
  // Posun je RADIÁLNÍ (±2 do obou souřadnic), takže je přechod kolmý na
  // vrstevnici a jeho šířka vyjde stejně jako u úhlopříčných řek (4·DIAG).
  {
    // Kam přechod NESMÍ padnout (dřív to nebylo potřeba: tři pole vedle sebe
    // na půlící přímce nikam nedosáhla, kdežto rozhozené se doputují daleko):
    //  · na laterální most přes hranici výsečí — dvojice by se přepsala,
    //  · do říčního pásu — most má stát na BŘEHU, ne ve vodě,
    //  · do okolí kapitálu — město je blok 3×3 a stavba vedle něj mu brání
    //    vzniknout (čtyři rody kvůli tomu přišly o město 3×3, než se to chytlo).
    const obsazene = new Set();
    for (const [[q1, r1], [q2, r2]] of dvojice) {
      obsazene.add(keyOf(q1, r1)); obsazene.add(keyOf(q2, r2));
    }
    for (const k of riverKeys().keys()) obsazene.add(k);
    for (const c of CAPITAL_POS)
      for (let dq = -2; dq <= 2; dq++)
        for (let dr = -2; dr <= 2; dr++) obsazene.add(keyOf(c.q + dq, c.r + dr));
    const R = kolebkaR();
    const vnitr = R - 2;
    // půlící směr oktantu: větší složka ≈ m/√2, zbytek do Manhattanu
    const hl = Math.round(vnitr / Math.SQRT2), ved = vnitr - hl;
    // [větší složka na q?, znaménko q, znaménko r] pro osm oktantů
    const oktanty = [
      [true, 1, 1], [false, 1, 1], [true, -1, -1], [false, -1, -1],
      [false, -1, 1], [true, -1, 1], [true, 1, -1], [false, 1, -1],
    ];
    for (const [qHlavni, sq, sr] of oktanty) {
      const q0 = sq * (qHlavni ? hl : ved), r0 = sr * (qHlavni ? ved : hl);
      // TŘI PŘECHODY NA VÝSEČ, ROZHOZENÉ PO ŘECE (v0.69).
      //
      // Původně to byla tři pole VEDLE SEBE na půlící přímce oktantu. Tři
      // musí být proto, že s jediným párem stál průchod a padal na tom, jestli
      // má vnitřní břeh aspoň jednoho suchého souseda — jehla v uchu: na pěti
      // seedech z osmi zůstal jeden rod navždy v kolébce (brána 59/64).
      // Držet je pohromadě ale znamenalo jedno místo, kde se dá projít, a stálo
      // to stejně za jediné úzké hrdlo. Nově se rozhodí po SVÉM ÚSEKU řeky:
      // úsek se rozdělí na třetiny a v každé padne jeden přechod náhodně.
      // Robustnost zůstává (tři nezávislé pokusy), přibyla rozmanitost a rod
      // má z kolébky tři různá východiště místo jednoho.
      //
      // Posun je PODÉL vrstevnice: u shodných znamének (1,−1), jinak (1,1).
      const [pq, pr] = sq === sr ? [1, -1] : [1, 1];
      const okt = oktantOf(q0, r0);
      // dokud oba břehy zůstávají ve VLASTNÍ výseči — přechod na hranici dvou
      // výsečí by patřil oběma a pravidlo „vítěz musí držet crossing" by nemělo
      // co držet
      let rozsah = 1;
      while (rozsah < 400) {
        const d = rozsah + 1;
        const rohy = [[q0 + d * pq, r0 + d * pr], [q0 - d * pq, r0 - d * pr]];
        if (rohy.some(([q1, r1]) => oktantOf(q1, r1) !== okt
            || oktantOf(q1 + 2 * sq, r1 + 2 * sr) !== okt)) break;
        rozsah = d;
      }
      const kraj = Math.max(1, Math.floor(rozsah * 0.8));   // odstup od hranice výseče
      const tretina = (2 * kraj) / 3;
      for (let i = 0; i < 3; i++) {
        let d = Math.round(-kraj + i * tretina + rng() * tretina);
        // ⚠ Los smí spadnout na pole, které už most má — buď na LATERÁLNÍ most
        // přes hranici výsečí, nebo na sourozence z předchozí třetiny. Dvojice
        // by se přepsala a přechodů by bylo míň, než se čeká. Uhne se stranou.
        for (let pokus = 0; pokus < 2 * kraj + 4; pokus++) {
          const q1 = q0 + d * pq, r1 = r0 + d * pr;
          if (!obsazene.has(keyOf(q1, r1)) && !obsazene.has(keyOf(q1 + 2 * sq, r1 + 2 * sr))) break;
          d += (pokus % 2 ? -1 : 1) * (pokus + 1);
        }
        const q1 = q0 + d * pq, r1 = r0 + d * pr;
        obsazene.add(keyOf(q1, r1));
        obsazene.add(keyOf(q1 + 2 * sq, r1 + 2 * sr));
        dvojice.push([[q1, r1], [q1 + 2 * sq, r1 + 2 * sr], sq === sr ? "a" : "b", true]);
      }
    }
  }
  BRIDGE_PAIR.clear();
  BRIDGE_DIR.clear();
  KOLEBKA_MOSTY.clear();
  const keys = [];
  for (const [[q1, r1], [q2, r2], smer, kolebkovy] of dvojice) {
    const k1 = keyOf(q1, r1), k2 = keyOf(q2, r2);
    BRIDGE_PAIR.set(k1, k2);
    BRIDGE_PAIR.set(k2, k1);
    BRIDGE_DIR.set(k1, smer);
    BRIDGE_DIR.set(k2, smer);
    // POZOR: kolébkový přechod se NEPOZNÁ z geometrie — laterální mosty leží
    // taky dvě pole od vrstevnice kolébky. Značí se proto výslovně při stavbě.
    if (kolebkovy) { KOLEBKA_MOSTY.add(k1); KOLEBKA_MOSTY.add(k2); }
    keys.push(k1, k2);
  }
  return keys;
}
let BRIDGE_KEYS = stavMosty();
// protější břeh mostu (null = pole není most)
function bridgeTwin(tile) {
  if (!tile || tile.structure !== "bridge") return null;
  return G.tiles.get(BRIDGE_PAIR.get(keyOf(tile.q, tile.r))) || null;
}

// ---------- Generování mapy ----------
// stupeň pole podle vzdálenosti od trůnu: čím blíž středu, tím bohatší a hůř
// bráněné území (hlavní města sedí ve vzdálenosti 16 mezi poli síly 1–15)
function levelForDist(d) {
  let lvl;
  if (d <= 2) lvl = 12;
  else if (d < WALL_R) lvl = 11 + (rng() < 0.35 ? 1 : 0);
  else if (d < OUTER_R) lvl = 8 + randInt(0, 2);   // mezi prstenci: 150–230
  else {
    // vzácné bohaté uzly i ve startovních výsečích (v0.30): šance klesá ke
    // kraji, sílu dává druhý hod (300 vzácně — strop „1× od suroviny na
    // výseč" a ochrannou zónu hradů pak hlídá placeNodes)
    const sance = d <= PASMO_BLIZKE ? 0.010 : d <= PASMO_DALEKE ? 0.007 : 0.003;
    if (rng() < sance) {
      const sila = rng();
      lvl = sila < 0.45 ? 9 : sila < 0.75 ? 10 : sila < 0.92 ? 11 : 12;
    }
    else if (d <= PASMO_BLIZKE) lvl = 6 + randInt(0, 1);   // 90–130
    else if (d <= PASMO_STREDNI) lvl = 4 + randInt(0, 1);  // 30–60
    else if (d <= PASMO_DALEKE) lvl = 3 + randInt(0, 1);   // 15–30
    else if (d <= MAP_R) lvl = 2 + randInt(0, 1);          // 10–15 (pásmo kapitálů)
    else lvl = 1 + (rng() < 0.4 ? 1 : 0);                  // okraj světa: 1–10
  }
  return Math.min(12, lvl);
}

// surovina pole: sudé stupně jídlo/železo, liché kámen/dřevo (terén napovídá),
// stupeň 1 a 300 dávají od všeho
function assignRes(t) {
  if (t.level === 1 || t.level === 12) { t.res = "all"; return; }
  const pair = t.level % 2 === 0 ? ["food", "iron"] : ["stone", "wood"];
  if (pair.includes("wood") && t.terrain === "forest") t.res = "wood";
  else if (pair.includes("stone") && t.terrain === "hills") t.res = "stone";
  else if (pair.includes("iron") && t.terrain === "hills") t.res = "iron";
  else if (pair.includes("food") && t.terrain === "plains") t.res = rng() < 0.7 ? "food" : "iron";
  else t.res = pair[randInt(0, 1)];
}

// ---------- Uzly a žíly (v0.30) ----------
// Pole síly 200+ (stupeň 9+) jsou VŽDY uzly 2×2 s KONKRÉTNÍ surovinou
// a „žílou": prstencem menších polí stejné suroviny okolo (čím silnější uzel,
// tím víc jich je). Dva uzly nikdy nesousedí, kolem kapitálů drží ochranná
// zóna bez uzlů a ve startovních výsečích smí být uzel síly 300 od každé
// suroviny nejvýš jednou. Kde blok nejde postavit, pole degraduje na 150.
const NODE_GUARD = 5;                          // Manhattan od hradu bez uzlů
// blok 2×2 má přesně 8 obvodových sousedů — strop křivky je geometrie
const VEIN_RING = { 9: 4, 10: 5, 11: 6, 12: 8 }; // síla uzlu → velikost žíly
function placeNodes() {
  const clenoveUzlu = new Set(); // pole všech už položených uzlů
  const stropy = new Set();      // "sektor:res" — level-12 uzly venku max 1×
  const kapitaly = [], brany = [];
  for (const t of G.tiles.values()) {
    if (t.structure === "capital") for (const m of blockTiles(t)) kapitaly.push(m);
    // brány prstenců: uzel nesmí zapečetit přístup k jediné cestě dovnitř
    if (t.structure === "grandfort" || t.structure === "bastion"
      || t.structure === "fortress") brany.push(t);
  }
  for (const t of [...G.tiles.values()]) {
    if (t.level < 9 || t.structure || t.big || t.bigSize || t.riv) continue;
    if (!TERRAIN[t.terrain].passable || t.owner !== -1) continue;
    // ochranná zóna hradů: v okruhu NODE_GUARD od kapitálu uzel nevznikne —
    // měří se NEJBLIŽŠÍ pole bloku (člen 2×2 je až o 2 blíž než kotva)
    const clenBliz = c => Math.min(gridDist(t, c),
      Math.abs(t.q + 1 - c.q) + Math.abs(t.r - c.r),
      Math.abs(t.q - c.q) + Math.abs(t.r + 1 - c.r),
      Math.abs(t.q + 1 - c.q) + Math.abs(t.r + 1 - c.r));
    if (kapitaly.some(c => clenBliz(c) <= NODE_GUARD)) { t.level = 8; continue; }
    // odstup od bran: uzel přisátý na velkou pevnost/baštu/pevnost umí jako
    // dvou-armádová hradba zavřít JEDINOU cestu výseče do mezikruží (a AI
    // se stropy velení ~300 CP ho nikdy nezlomí) — seed 2233, brakkar
    if (brany.some(b => clenBliz(b) <= 2)) { t.level = 8; continue; }
    // žádné dva uzly vedle sebe: členové nesmí sousedit s cizím uzlem
    const cl = [t, tileAt(t.q + 1, t.r), tileAt(t.q, t.r + 1), tileAt(t.q + 1, t.r + 1)];
    if (cl.some(m => m && neighborsOf(m).some(n => clenoveUzlu.has(keyOf(n.q, n.r))))) {
      t.level = 8; continue;
    }
    // surovina uzlu: 300 losuje ze všech (venku strop 1× od suroviny na výseč),
    // slabší uzly drží párové pravidlo sudé/liché stupně
    let res = null;
    if (t.level === 12) {
      res = RES_KEYS[randInt(0, 3)];
      if (Math.abs(t.q) + Math.abs(t.r) > OUTER_R) {
        const sektor = zonaOf(t);
        let volna = null;
        for (let z = 0; z < 4; z++) {
          const kand = RES_KEYS[(RES_KEYS.indexOf(res) + z) % 4];
          if (!stropy.has(sektor + ":" + kand)) { volna = kand; break; }
        }
        if (volna) { res = volna; stropy.add(sektor + ":" + volna); }
        else { t.level = 11; res = null; } // výseč už má všechna 300 — uzel slábne
      }
    }
    if (!res) {
      const pair = t.level % 2 === 0 ? ["food", "iron"] : ["stone", "wood"];
      res = pair[randInt(0, 1)];
    }
    if (!makeBig(t, 2)) { t.level = 8; continue; } // blok se nevešel — pole slábne
    t.res = res;
    for (const m of blockTiles(t)) clenoveUzlu.add(keyOf(m.q, m.r));
    // žíla: prstenec menších polí stejné suroviny kolem bloku. Přednost mají
    // volná pole; když by žíla vyšla pod dvě pole (sousední žíly rozebraly
    // okolí), smí si DVĚ pole „přebarvit" — prstenec je garantovaný
    const okoli = [], zalozni = [];
    for (const m of blockTiles(t))
      for (const n of neighborsOf(m)) {
        const k = keyOf(n.q, n.r);
        if (clenoveUzlu.has(k) || okoli.some(o => o.t === n) || zalozni.some(o => o.t === n)) continue;
        if (n.structure || n.big || n.bigSize || n.riv) continue;
        if (!TERRAIN[n.terrain].passable || n.owner !== -1) continue;
        (n.res ? zalozni : okoli).push({ t: n });
      }
    let zbyva = VEIN_RING[t.level] || 4, dano = 0;
    for (const o of okoli) {
      if (zbyva-- <= 0) break;
      o.t.res = res;
      o.t.level = Math.max(o.t.level, randInt(5, 8));
      dano++;
    }
    for (const o of zalozni) {
      if (dano >= 2) break;
      o.t.res = res;
      o.t.level = Math.max(o.t.level, randInt(5, 8));
      dano++;
    }
  }
}

function genMap() {
  // Přechody přes dělič se od v0.69 LOSUJÍ (viz stavMosty), takže se musí
  // postavit až tady — po `rng = mulberry32(seed)` v newGame. Každý svět má
  // tím pádem východiště z kolébky jinde. Laterální mosty přes hranice výsečí
  // se nelosují a vyjdou pokaždé stejně.
  BRIDGE_KEYS = stavMosty();
  if (typeof module !== "undefined" && module.exports && module.exports.G)
    module.exports.BRIDGE_KEYS = BRIDGE_KEYS;
  G.tiles.clear();
  const center = { q: 0, r: 0 };
  for (let q = -MAP_R; q <= MAP_R; q++) {
    for (let r = -MAP_R; r <= MAP_R; r++) {
      let terrain = "plains";
      const roll = rng();
      if (roll < 0.16) terrain = "forest";
      else if (roll < 0.27) terrain = "hills";
      else if (roll < 0.33) terrain = "water";
      else if (roll < 0.36) terrain = "ruins";
      G.tiles.set(keyOf(q, r), { q, r, terrain, level: levelForDist(distLvl(q, r)), res: null,
        owner: -1, structure: null, garrison: 0 });
    }
  }
  // řeky (přepíšou náhodný terén) a mosty — začínají až za vnějším prstencem,
  // uvnitř přebírají dělicí roli hradby; t.riv určuje směr koryta pro model
  for (const [key, smer] of riverKeys()) {
    const t = G.tiles.get(key);
    if (t) { t.terrain = "water"; t.structure = null; t.riv = smer; }
  }
  // v0.40: mosty stojí na BŘEZÍCH (mimo pás vody) — dvojice spojená přes řeku.
  // Případný říční pruh pod nimi se přepisuje, ať most nikdy neleží ve vodě.
  for (const key of BRIDGE_KEYS) {
    const t = G.tiles.get(key);
    // t.riv u mostu značí SMĚR KORYTA pod ním (kvůli modelu), ne že je to voda
    if (t) { t.terrain = "bridge"; t.structure = "bridge"; t.riv = BRIDGE_DIR.get(key); }
  }
  // vnější prstenec opevnění: hradby ve vzdálenosti OUTER_R; branami jsou
  // čtyři VELKÉ PEVNOSTI — shluky 5 polí (srdce + 4 bašty), těžké na dobytí
  // brány v POLOVINÁCH osmin prstence: Manhattan součet = OUTER_R, dělení
  // ~3:1 (výchozí mapa 12/4); round + dopočet drží součet přesně
  const gMale = Math.round(OUTER_R / 4), gVelke = OUTER_R - gMale;
  const GRAND_KEYS = [
    keyOf(gVelke, gMale), keyOf(gMale, gVelke), keyOf(-gVelke, gMale), keyOf(-gMale, gVelke),
    keyOf(gVelke, -gMale), keyOf(gMale, -gVelke), keyOf(-gVelke, -gMale), keyOf(-gMale, -gVelke),
  ];
  const grandCluster = new Set();
  for (const gk of GRAND_KEYS) {
    const g = G.tiles.get(gk);
    grandCluster.add(gk);
    for (const n of neighborsOf(g)) grandCluster.add(keyOf(n.q, n.r));
  }
  for (const t of G.tiles.values()) {
    const d = gridDist(t, center);
    const key = keyOf(t.q, t.r);
    if (grandCluster.has(key)) {
      t.terrain = "plains";
      t.structure = GRAND_KEYS.includes(key) ? "grandfort" : "bastion";
      t.level = 12;
      continue;
    }
    // HRADBA + PŘÍKOP = PŘEKÁŽKA DVĚ POLE ŠIROKÁ (v0.69).
    //
    // Úhlopříčný krok umí přeskočit nejvýš JEDNU vrstvu (Manhattan se jím mění
    // o 0 nebo ±2), takže jedinou řadu zdi šlo obejít rohem hned vedle brány
    // a brána přestala být jediným průchodem. Dvě řady ten zkrat zavřou
    // geometrií, bez zásahu do pravidel pohybu a bez toho, aby přibylo pole,
    // o které se musí bojovat.
    //
    // Druhá řada je ZÁMĚRNĚ VODA, ne zeď: dvě řady hradeb by na obrazovce
    // vypadaly jako dvě zdi za sebou, kdežto zeď s příkopem před ní čte jako
    // JEDNA hradba. Navíc je to zadarmo — vodní pole je hladká deska, která
    // se sousedy splývá v jednu hladinu (v0.41), takže příkop obkrouží celý
    // prstenec bez jediného nového modelu.
    if (d === OUTER_R && !t.structure) { t.terrain = "wall"; t.structure = null; }
    if (d === OUTER_R + 1 && !t.structure) {
      t.terrain = "water"; t.structure = null; delete t.riv; t.res = null;
    }
  }
  // vnitřní hradby kolem trůnu se čtyřmi pevnostmi — jediné brány dovnitř
  const FORT_KEYS = [keyOf(WALL_R, 0), keyOf(0, WALL_R), keyOf(-WALL_R, 0), keyOf(0, -WALL_R)];
  // CHODBA BRÁNY: druhá řada hradeb by pevnost zazdila, takže se přímo před
  // ní nechává průchozí pole. Dovnitř se pořád vejde jedině PŘES pevnost —
  // z chodby vedou úhlopříčky zase jen do zdi.
  const FORT_CHODBA = [keyOf(WALL_R + 1, 0), keyOf(0, WALL_R + 1),
    keyOf(-(WALL_R + 1), 0), keyOf(0, -(WALL_R + 1))];
  for (const t of G.tiles.values()) {
    const d = gridDist(t, center);
    const k = keyOf(t.q, t.r);
    if (d === WALL_R || d === WALL_R + 1) {
      if (FORT_KEYS.includes(k)) {
        t.terrain = "plains"; t.structure = "fortress"; t.level = 12;
      } else if (FORT_CHODBA.includes(k)) {
        // HRÁZ K BRÁNĚ: jediné suché místo přes příkop, a vede rovnou
        // na pevnost. Z hráze jdou úhlopříčky zase jen do vody.
        t.terrain = "plains"; t.structure = null; delete t.riv; t.res = null;
      } else if (d === WALL_R) {
        t.terrain = "wall"; t.structure = null;
      } else {
        t.terrain = "water"; t.structure = null; delete t.riv; t.res = null;
      }
    } else if (d < WALL_R) {
      if (!TERRAIN[t.terrain].passable) t.terrain = "plains";
      t.structure = null;
    }
  }
  const throne = tileAt(0, 0);
  throne.terrain = "plains"; throne.structure = "throne"; throne.level = 12;
  makeBig(throne, 3);   // Trůnní město zabírá 3×3 pole
  // KEEPY KRAJŮ místo rozesetých svobodných měst (rozhodnutí uživatele
  // 31. 8. 2026). Dřív tu vznikalo ~20 neutrálních měst 3×3 náhodně po mapě;
  // o jedno z dvaceti se nepral nikdo. Nově je JEDEN keep na kraj, uprostřed
  // sporného pásu, a kdo ho drží, drží kraj.
  placeKeeps();
  CAPITAL_POS.forEach((pos, i) => {
    const cap = tileAt(pos.q, pos.r);
    cap.terrain = "plains"; cap.structure = "capital"; cap.owner = i; cap.level = 2;
    // kapitál zabírá 3×3 — okolí se srovná a celý blok patří frakci od startu
    for (const dq of [-1, 0, 1]) for (const dr of [-1, 0, 1]) {
      const t = tileAt(pos.q + dq, pos.r + dr);
      if (t && !TERRAIN[t.terrain].passable) { t.terrain = "plains"; t.structure = null; delete t.riv; }
    }
    makeBig(cap, 3, true);
  });
  // PŘECHODY PŘES DĚLIČ JSOU NEUTRÁLNÍ (zadání uživatele 1. 9. 2026).
  //
  // Do v0.69 patřily svému rodu od začátku: vlastní vrata, která držíš, dokud
  // ti je někdo nevezme. Nově se musí NEJDŘÍV DOBÝT — vylézt z kolébky je
  // první objektiv sezóny, ne samozřejmost.
  //
  // ⚠ HISTORIE, kterou je nutné znát: přesně tohle už jednou zkoušené bylo
  // a rozbilo hru — s JEDNÍM přechodem na výseč zůstal rod v kolébce na pěti
  // seedech z osmi, i s měkkou posádkou. Od v0.69 jsou ale přechody TŘI
  // a rozhozené po řece, takže má rod tři nezávislé pokusy a tři různá místa,
  // kde to zkusit. Jestli to stačí, měří sim brána — je to celý smysl toho,
  // že tam ta brána je.
  //
  // Posádka je měkká schválně (KOLEBKA_MOST_MILICE 120 proti 2 781
  // u laterálního mostu, velitelé úrovně 5 proti 35): je to „stupeň 1"
  // křivky obtížnosti, ne skutečná brána.
  for (const k of KOLEBKA_MOSTY) {
    const t = G.tiles.get(k);
    if (!t) continue;
    // VNITŘNÍ břeh (v expanzním pásu) je neutrální a musí se dobýt — to je ta
    // brána ven. VNĚJŠÍ břeh leží v nedotknutelné kolébce, kam stejně nikdo
    // cizí nevstoupí, takže neutrální být nepotřebuje a rod na něj rovnou
    // došlápne.
    if (Math.abs(t.q) + Math.abs(t.r) > kolebkaR()) {
      t.owner = oktantOf(t.q, t.r); t.garrison = 0;
    } else {
      t.owner = -1; t.garrison = struktMilice(t);
    }
  }
  pobrezi();
  repairBridges();
  ensureConnectivity();
  zatopNedosazitelne();
  // silná pole (stupeň 9+) = uzly 2×2 se žílami stejné suroviny (v0.30)
  placeNodes();
  for (const t of G.tiles.values()) {
    // uzly a žíly už surovinu mají — nepřepisovat
    if (TERRAIN[t.terrain].passable && !t.big && !t.res) assignRes(t);
    if (t.big) { t.garrison = 0; continue; }   // člen bloku: posádku nese kotva
    if (t.owner !== -1 || !TERRAIN[t.terrain].passable) continue;
    if (t.structure && t.structure !== "outpost") {
      t.garrison = struktMilice(t);
      continue;
    }
    // 2×2 pole brání dvojnásobek (v předloze velká pole bránily dvě armády)
    t.garrison = LEVEL_GARRISON[t.level] * (t.bigSize === 2 ? 2 : 1);
  }
  // členové sdílejí surovinu kotvy — blok je jedno souvislé naleziště
  for (const t of G.tiles.values())
    if (t.big) t.res = (G.tiles.get(t.big) || t).res;
}

// v0.40: most je dvojice polí na protilehlých březích. Každé z nich musí mít
// aspoň jednoho průchozího souseda NA SVÉ STRANĚ řeky (mimo protějšek), jinak
// by přechod ústil do slepé vody — náhodná jezera za mostem tedy proměníme
// na pláně. Samotné spojení břehů drží neighborsOf (dvojice je soused).
// ---------- POBŘEŽÍ (v0.63) ----------
// Svět končil TAM, KDE DOŠLA MŘÍŽKA: řeky doběhly k hranici a uťaly se o ni,
// takže vršek mapy vypadal roztrhaně a v rohu diamantu stála voda, ze které
// nikam nevedla cesta. Nejzazší prstenec polí je nově MOŘE — řeky do něj
// ústí, okraj má tvar a rohy světa přestaly být slepé konce koryta.
//
// Stojí to 272 polí ze 4 761 (5,7 %) na 69×69, a jsou to ta nejchudší pole
// úplně na kraji — kapitály stojí na Manhattanu 32 s |q| ≤ 23, takže se jich
// to nedotkne.
function pobrezi() {
  for (const t of G.tiles.values()) {
    if (Math.max(Math.abs(t.q), Math.abs(t.r)) !== MAP_R) continue;
    t.terrain = "water";
    t.structure = null;
    t.res = null;
    t.owner = -1;
    t.garrison = 0;
    delete t.riv;
  }
}

// Pole, na které se z Trůnu nedá dojít, je LEŽ — vypadá jako země, ale nikdo
// tam nikdy nevstoupí. Zbylé kapsy (typicky pár polí sevřených mezi řekou
// a pobřežím) se proto zatopí. Kapitály chrání ensureConnectivity výš, tohle
// je úklid po ní.
function zatopNedosazitelne() {
  const seen = new Set([keyOf(0, 0)]);
  const stack = [G.tiles.get(keyOf(0, 0))];
  while (stack.length) {
    const t = stack.pop();
    for (const n of neighborsOf(t)) {
      const k = keyOf(n.q, n.r);
      if (seen.has(k) || !TERRAIN[n.terrain].passable) continue;
      seen.add(k); stack.push(n);
    }
  }
  let zatopeno = 0;
  for (const t of G.tiles.values()) {
    if (!TERRAIN[t.terrain].passable || seen.has(keyOf(t.q, t.r))) continue;
    t.terrain = "water"; t.structure = null; t.res = null; t.owner = -1; t.garrison = 0;
    zatopeno++;
  }
  return zatopeno;
}

function repairBridges() {
  for (const key of BRIDGE_KEYS) {
    const b = G.tiles.get(key);
    if (!b) continue;
    const twinKey = BRIDGE_PAIR.get(key);
    const suchi = neighborsOf(b).filter(n => keyOf(n.q, n.r) !== twinKey);
    if (suchi.some(n => TERRAIN[n.terrain].passable)) continue;
    // vezmi souseda dál od řeky (větší Manhattan od osy) a vysuš ho
    const ven = suchi.sort((x, y) =>
      (Math.abs(x.q) + Math.abs(x.r)) - (Math.abs(y.q) + Math.abs(y.r))).pop();
    if (!ven) continue;
    ven.terrain = "plains";
    ven.structure = null;
    delete ven.riv;
  }
}

// pojistka: každé hlavní město se musí po souši (a mostech) dostat k trůnu;
// když náhodná jezera některý kout odříznou, protne se nejbližší vodní stěna
// brodem (pole se změní na pláně)
function ensureConnectivity() {
  const flood = fromKey => {
    const seen = new Set([fromKey]);
    const stack = [G.tiles.get(fromKey)];
    while (stack.length) {
      const t = stack.pop();
      for (const n of neighborsOf(t)) {
        const k = keyOf(n.q, n.r);
        if (seen.has(k) || !TERRAIN[n.terrain].passable) continue;
        seen.add(k);
        stack.push(n);
      }
    }
    return seen;
  };
  const throneKey = keyOf(0, 0);
  let guard = 0;
  while (guard++ < BRODU_MAX) {
    const reach = flood(throneKey);
    const cut = CAPITAL_POS.find(c => !reach.has(keyOf(c.q, c.r)));
    if (!cut) return;
    const island = flood(keyOf(cut.q, cut.r));
    const river = riverKeys();
    let ford = null, riverFord = null;
    for (const t of G.tiles.values()) {
      if (t.terrain !== "water") continue;
      // ⚠ PŘÍKOP PRSTENCŮ SE NEBRODÍ. Brod prokopává vodní stěnu, aby se každý
      // kapitál dostal k Trůnu — kdyby si vybral pole příkopu, prorazil by
      // hradbu mimo bránu a celá geometrie „brána je jediný průchod" by padla.
      const dPrstenec = Math.abs(t.q) + Math.abs(t.r);
      if (dPrstenec === OUTER_R + 1 || dPrstenec === WALL_R + 1) continue;
      const ns = neighborsOf(t);
      if (!ns.some(n => reach.has(keyOf(n.q, n.r))) || !ns.some(n => island.has(keyOf(n.q, n.r)))) continue;
      if (river.has(keyOf(t.q, t.r))) { if (!riverFord) riverFord = t; } // řeku protni až v nouzi
      else { ford = t; break; }
    }
    ford = ford || riverFord;
    if (!ford) return; // nemělo by nastat (řeky mají mosty)
    ford.terrain = "plains";
    ford.structure = null;
    delete ford.riv;
  }
}

// ---------- Frakce ----------
function makeHero(defIdx, srcKey = null) {
  return { defIdx, srcKey, stamina: STAMINA_MAX, hp: HERO_HP_BASE, pos: null,
    army: emptyArmy(), cooldown: 0, stars: 0,
    level: 1, xp: 0, equip: emptyEquip(), guard: false, skills: {}, skillPts: 0,
    rozkaz: null, zakladna: null,
    prisel: 0 };   // tik příchodu na pole — určuje pořadí obrany stohu (IV-M)
}

// (povyšování za 💠 zrušeno ve v0.9 — hvězdy rostou respektem z dárků,
// viz applyGiftToAccount)

// playerHeroes: defIdx jediného startovního hrdiny hráče (vybraný na startu);
// AI si startovního hrdinu losuje, zbytek jde do zásoby k najmutí
function initFactions(playerIndex, playerHeroes) {
  G.playerFaction = playerIndex;
  G.playerClen = 0;
  G.factions = FACTION_DEFS.map((def, i) => {
    let start;
    if (i === playerIndex && playerHeroes && playerHeroes.length >= 1) {
      start = [playerHeroes[0]];
    } else {
      start = [STARTER_IDX[def.key] ?? 0];
    }
    return {
      id: i, ...def,
      isAI: i !== playerIndex,
      alive: true,
      capKey: keyOf(CAPITAL_POS[i].q, CAPITAL_POS[i].r), // kotva kapitálu (vykořenění ji přesouvá)
      resources: { food: 200, wood: 120, stone: 80, iron: 60, gold: 100 },
      units: startovniZasoba(def.key),
      // POZOR: každá budova z BUILDINGS tu musí mít klíč — bez něj UI ukáže
      // „úr. undefined · NaN s" a stavba nejde zadat (akademie tím trpěla
      // od v0.27 do v0.30)
      buildings: { main: 1, barracks: 1, hospital: 0, market: 0, academy: 0 },
      upgrades: emptyArmy(),   // frakční vylepšení typů jednotek
      druhyRod: null,          // spojenecký rod k verbování (IV-O, od hlavní budovy 8)
      build: null,      // {key, ticksLeft, total}
      heroes: start.map(makeHero),
      boosts: { build: 0, prod: 0 }, // zbývající tiky posilovacích doplňků
      freeRespecs: 2,   // dva resety dovedností na sezónu zdarma (větší strom = víc pokusů)
      hirePool: HERO_DEFS[def.key].map((_, d) => d).filter(d => !start.includes(d)), // hrdinové k najmutí
      items: [],        // frakční inventář kořisti
      marches: [],      // {kind, fromKey, targetKey, army, ticksLeft, total, heroIdx}
      recruitQueue: [], // {type, ticksLeft}
      aiCooldown: randInt(3, 6),
      pacts: {},
      // etapa 10: válka je OBOUSTRANNÁ (zacniValku ji zapíše oběma strranám),
      // valkaOd drží tik začátku kvůli minimální délce a mirDo klid po míru
      valky: {},        // {otherId: 1} — vyhlášené války (na sezónu)
      valkaOd: {},      // {otherId: tik} — kdy válka začala (etapa 10)
      mirDo: {},        // {otherId: tik} — do kdy se po míru nesmí vyhlásit znovu
      vyhlaseni: {},    // {otherId: tik} — odpočet do začátku války
      spojenec: -1,     // JEDEN spojenec na rod (etapa 10, IV-D)
      valkaCd: 0,       // tik, od kterého jde vyhlásit další válku        // {otherId: zbývající tiky paktu o neútočení}
      pactCooldown: {}, // {otherId: tiky, po které nejednat o novém paktu}
      offerToPlayer: 0, // AI nabízí hráči pakt (zbývající tiky nabídky)
      grudge: {},       // {otherId: 1} — zrada: AI míří na zrádce ochotněji
      ring: { xp: 0, level: 0, ap: RING_AP_MAX, body: 0,  // Prsten popela + body činu
        strom: { nadvlada: 0, vlada: 0, vydrz: 0, sklizen: 0, veleni: 0, hojnost: 0 } },
      journey: { kapitola: 0, splnene: {} }, // příběh sezóny (v0.31) — strop +10/kapitola
      stats: { wins: 0 },
      // ---- členové frakce (v0.32, etapa 4c) ----
      // Zakládající člen (cid 0) JE frakce sama — sólo a AI cesty se nemění.
      // Další hráči téže frakce žijí jako ploché objekty v clenove (cid =
      // index+1) se STEJNÝMI jmény per-hráčských polí (duck typing).
      cid: 0,
      clenove: [],
    };
  });
  // signature balíček starterů (v0.35): JEN AI frakce — pavučina rastru
  // (endgame parita) na sigy spoléhá a AI dárkovou ekonomiku nehraje.
  // HRÁČ svůj signature kus odemyká oddaností ♥10 (R10, applyGiftToAccount);
  // do té doby ho může potkat jen v královské truhle či za první dobytí Trůnu.
  for (const f of G.factions) if (f.isAI) zajistiSigStartera(f);
}

// ---------- Členové frakce (v0.32, etapa 4c) ----------
// Aktér = frakce (zakladatel, cid 0) NEBO člen z f.clenove. Členové nesmí
// držet zpětnou referenci na frakci (frakce se serializuje vcelku — JSON!):
// frakci aktéra číst VÝHRADNĚ přes frakceOf.
function frakceOf(a) { return G.factions[a.id]; }
function clenPodleCid(faction, cid) {
  return cid ? (faction.clenove || [])[cid - 1] : faction;
}
function vsichniClenove(faction) { return [faction, ...(faction.clenove || [])]; }
// vlastnictví pole: t.owner = id frakce, t.clen = cid člena (chybí = zakladatel),
// t.klan = id klanu (etapa 8; klanové pole NEPATŘÍ nikomu osobně — proto se
// nepočítá do osobního stropu, nesype osobní výnos a nejde z něj stavět výspa)
function patriClenu(a, t) {
  if (t.klan) return false;
  return t.owner === a.id && ((t.clen || 0) === (a.cid || 0));
}
// skóre jen z polí aktéra (frakční scoreOf zůstává pro tabulku a Trůn)
// Komu report patří (v0.50). Aktér = frakce + člen; "3:0" je zakladatel
// třetí frakce, "3:2" její druhý člen. Server podle toho reporty rozesílá,
// aby hráči chodily jen jeho bitvy — dřív dostával každý každou bitvu světa.
function aktorKlic(a) { return a ? a.id + ":" + (a.cid || 0) : null; }

// Účastníci bitvy o pole: útočník + majitel pole + všichni, kdo ho bránili
// hrdinou nebo stráží (spoluhráči ze stejné frakce).
function ucastniciBitvy(faction, tile, comp) {
  const out = [aktorKlic(faction)];
  if (tile && tile.owner !== -1) {
    const k = tile.owner + ":" + (tile.clen || 0);
    if (!out.includes(k)) out.push(k);
  }
  for (const c of (comp && comp.contributors) || []) {
    const k = aktorKlic(c.faction);
    if (k && !out.includes(k)) out.push(k);
  }
  return out;
}
function scoreClena(a) { return Math.round(prehledOf(a).skore); }


// ---------- JEDEN PRŮCHOD MAPOU MÍSTO JEDNOHO NA KAŽDÉHO AKTÉRA (etapa 11) ----------
// `incomeOf`, `pocetPoli` i `scoreClena` procházely CELOU mapu, každá zvlášť
// a každý svůj sken pro každého aktéra. Do etapy 11 to nevadilo (osm frakcí
// po čtyřech členech), na MMO měřítku je to rozdíl mezi vteřinou a dvěma
// milisekundami:
//
//   naměřeno na 461×461 (212 521 polí): jeden sken 1,5–2,2 ms
//   × 800 aktérů (100 hráčů na rod) = 1 800 ms NA TIK při rozpočtu 1 000
//
// Nově se všechno spočítá JEDNÍM průchodem za tik a čtenáři jen sáhnou do
// přehledu. Klíč je `aktorKlic` ("fid:cid"), klanová pole se přeskakují
// (nepatří nikomu osobně) stejně jako v `patriClenu`.
let prehledKes = null, prehledTik = -1;
function zrusPrehled() { prehledKes = null; prehledTik = -1; }
function prehledAkteru() {
  if (prehledTik === G.tick && prehledKes) return prehledKes;
  const m = new Map();
  for (const t of G.tiles.values()) {
    if (t.owner === -1 || t.klan) continue;
    const k = t.owner + ":" + (t.clen || 0);
    let z = m.get(k);
    if (!z) { z = { poli: 0, skore: 0, inc: { food: 0, wood: 0, stone: 0, iron: 0, gold: 0 } }; m.set(k, z); }
    z.poli++;
    z.skore += tierScore(t);
    if (t.structure) z.skore += STRUCTURES[t.structure].score;
    const y = tileYield(t);
    for (const res in y) z.inc[res] += y[res];
  }
  prehledKes = m; prehledTik = G.tick;
  return m;
}
const PREHLED_PRAZDNY = { poli: 0, skore: 0, inc: { food: 0, wood: 0, stone: 0, iron: 0, gold: 0 } };
function prehledOf(a) {
  return (a && prehledAkteru().get(aktorKlic(a))) || PREHLED_PRAZDNY;
}

// nový člen frakce — zrcadlí per-hráčskou část initFactions
function initClen(faction, jmeno) {
  const start = [STARTER_IDX[faction.key] ?? 0];
  return {
    id: faction.id, cid: (faction.clenove.length + 1), jmeno,
    name: faction.name, color: faction.color, // hlášky a reporty (duck)
    key: faction.key, incomeMult: faction.incomeMult, attackMult: faction.attackMult,
    isAI: false,
    alive: true, // čte se v obranných smyčkách; člen žije a padá s frakcí
    capKey: null, // doplní umistiMestoClena
    resources: { food: 200, wood: 120, stone: 80, iron: 60, gold: 100 },
    units: startovniZasoba(faction.key),
    buildings: { main: 1, barracks: 1, hospital: 0, market: 0, academy: 0 },
    upgrades: emptyArmy(),
    druhyRod: null,
    build: null,
    heroes: start.map(makeHero),
    boosts: { build: 0, prod: 0 },
    freeRespecs: 2,
    hirePool: HERO_DEFS[faction.key].map((_, d) => d).filter(d => !start.includes(d)),
    items: [],
    marches: [],
    recruitQueue: [],
    aiCooldown: randInt(3, 6),
    ring: { xp: 0, level: 0, ap: RING_AP_MAX, body: 0,
      strom: { nadvlada: 0, vlada: 0, vydrz: 0, sklizen: 0, veleni: 0, hojnost: 0 } },
    journey: { kapitola: 0, splnene: {} },
    stats: { wins: 0 },
  };
}

// město nového člena: volné 3×3 ve VLASTNÍ výseči frakce, co nejblíž
// frakčnímu kapitálu, s odstupem od ostatních sídel (vzor resettleFaction)
// ETAPA 11b: MĚSTO SE HLEDÁ OD KAPITÁLU VEN, ne průchodem celého světa.
//
// Vítěz byl vždycky nejbližší vyhovující pole (skóre = −vzdálenost od
// kapitálu), takže první nález na nejmenším poloměru je TOTÉŽ pole, jaké
// vybral průchod mapou — jen se pro něj nemusí obejít svět. Do teď stálo
// založení jednoho města na mapě 1459×1459 celých 319 ms, takže start sezóny
// byl O(hráči × pole): 23 000 hráčů = hodiny čekání, než se svět rozjede.
//
// ⚠ Prstenec se prochází v pořadí (q, r) vzestupně, tedy stejně, jako vkládá
// pole genMap. Shodně vzdálená pole tak vyhrává pořád to samé co dřív.
function umistiMestoClena(faction, clen) {
  const kraj = REGION_NAMES[faction.id];
  const kap = capPosOf(faction);
  const vyhovuje = t => {
    if (Math.abs(t.q) > MAP_R - 1 || Math.abs(t.r) > MAP_R - 1) return false;
    if (regionOf(t) !== kraj) return false;
    for (const dq of [-1, 0, 1]) for (const dr of [-1, 0, 1]) {
      const m = tileAt(t.q + dq, t.r + dr);
      if (!m || m.structure || m.big || m.bigSize || m.riv
          || (m.owner !== -1 && m.owner !== faction.id)) return false;
    }
    return true;
  };
  let best = null;
  // od 6 — bližší pole odřezával odstup od frakčního kapitálu
  for (let d = 6; d <= 2 * MAP_R && !best; d++) {
    for (let dq = -d; dq <= d && !best; dq++) {
      const zb = d - Math.abs(dq);
      for (const dr of (zb === 0 ? [0] : [-zb, zb])) {
        const t = tileAt(kap.q + dq, kap.r + dr);
        if (t && vyhovuje(t)) { best = t; break; }
      }
    }
  }
  if (!best) return false;
  for (const dq of [-1, 0, 1]) for (const dr of [-1, 0, 1]) {
    const m = tileAt(best.q + dq, best.r + dr);
    if (!TERRAIN[m.terrain].passable) { m.terrain = "plains"; m.structure = null; delete m.riv; }
  }
  best.terrain = "plains";
  best.structure = "capital";
  best.owner = faction.id;
  best.level = 2;
  best.garrison = 0;
  best.res = null;
  if (!makeBig(best, 3, true)) { best.structure = null; return false; }
  // členská pole města MUSÍ sypat jako u zakladatelů (členové bloku kapitálu
  // dědí surovinu kotvy — bez ní by město člena mělo ~poloviční výnos)
  assignRes(best);
  for (const k of best.bigKeys) { const m = G.tiles.get(k); m.res = best.res; m.garrison = 0; }
  for (const m of blockTiles(best)) m.clen = clen.cid; // město i pole patří členovi
  zrusPrehled();
  clen.capKey = keyOf(best.q, best.r);
  return true;
}

// připojení hráče do frakce za běhu příprav (volá server v tryStart)
function pridejClena(factionId, jmeno) {
  const f = G.factions[factionId];
  if (!f || !f.alive) return null;
  const clen = initClen(f, jmeno);
  if (!umistiMestoClena(f, clen)) return null;
  f.clenove.push(clen);
  // člen je člověk — signature odemyká oddanost ♥10, žádný balíček (v0.35)
  addLog(f.id, { klic: "kron.clen.prichod", param: { kdo: jmeno, rod: f.name } });
  return clen;
}

// ---------- KLANY (etapa 8, IV-A + IV-B) ----------
// Klan je entita UVNITŘ rodu: sdružuje aktéry jedné frakce (zakladatele
// i členy) a přidává TŘETÍ ÚROVEŇ VLASTNICTVÍ POLE:
//
//     rod (t.owner) → člen (t.clen) → KLAN (t.klan)
//
// Klanové pole nepatří nikomu osobně — nepočítá se do osobního stropu, nesype
// osobní výnos a nakládat s ním smí jen důstojník. Je to táž úvaha jako u mostu
// v etapě 7: klanová pevnost je BRÁNA, ne půda.
//
// Klan žije v SEZÓNĚ (G.klany), ne na účtu — mezi sezónami se rozpouští stejně
// jako svět. Členství drží AKTÉR (a.klan = id klanu), takže projde snapshotem
// s frakcemi a nevzniká druhý zdroj pravdy.
const KLAN_ZAKLAD_CLENU = 25;          // kapacita na 1. úrovni
const KLAN_MAX_CLENU = 100;            // kapacita na 10. úrovni
const KLAN_MAX_UROVEN = 10;
const KLAN_DUSTOJNIKU_MAX = 5;         // vůdce + až 5 důstojníků
const KLAN_CLENU_NA_DUSTOJNIKA = 20;   // jeden slot na 20 členů
const KLAN_PEVNOSTI_ZAKLAD = 3;        // pohyblivá frontová linie
const KLAN_RADA_JEDNOMYSLNE = 4;       // do 4 důstojníků musí být shoda
const KLAN_JMENO_MAX = 24;
const KLAN_PEVNOST_CENA = { stone: 6000, wood: 3000, gold: 4000 };

function klanPodleId(id) { return id ? (G.klany || []).find(k => k && k.id === id) || null : null; }
function klanOf(a) { return a ? klanPodleId(a.klan) : null; }
// aktéři klanu; pořadí = vůdce, pak podle cid (deterministické pro UI i testy)
function klanCleny(k) {
  if (!k) return [];
  const f = G.factions[k.fid];
  if (!f) return [];
  return vsichniClenove(f).filter(a => a.klan === k.id)
    .sort((a, b) => ((b.cid || 0) === k.vudce) - ((a.cid || 0) === k.vudce) || (a.cid || 0) - (b.cid || 0));
}
// kumulativní síla členů = zdroj úrovně klanu (obdoba XP Prstenu)
function klanSila(k) { return klanCleny(k).reduce((s, a) => s + scoreClena(a), 0); }
function klanXpNeed(l) { return Math.round(400 * Math.pow(l, 1.6)); }
function klanKapacita(k) {
  const u = k ? k.level : 1;
  return Math.round(KLAN_ZAKLAD_CLENU
    + (KLAN_MAX_CLENU - KLAN_ZAKLAD_CLENU) * (u - 1) / (KLAN_MAX_UROVEN - 1));
}
// „jeden důstojník na 20 členů" — sloty rostou s klanem, ne s přáním vůdce
function klanDustojnikuMax(k) {
  return Math.min(KLAN_DUSTOJNIKU_MAX, Math.floor(klanCleny(k).length / KLAN_CLENU_NA_DUSTOJNIKA));
}
function klanPevnostiMax(k) { return KLAN_PEVNOSTI_ZAKLAD + Math.floor((k ? k.level : 1) / 5); }
function jeVudce(k, a) { return !!k && !!a && a.klan === k.id && (a.cid || 0) === k.vudce; }
function jeDustojnik(k, a) {
  return jeVudce(k, a) || (!!k && !!a && a.klan === k.id && k.dustojnici.includes(a.cid || 0));
}
// RADA: do KLAN_RADA_JEDNOMYSLNE důstojníků musí být rozhodnutí jednomyslné,
// od té hranice stačí většina a nejvýš jeden proti (IV-A).
function radaVelikost(k) { return 1 + (k ? k.dustojnici.length : 0); }   // vůdce se počítá
function radaProsla(k, pro, proti) {
  const n = radaVelikost(k);
  if (n < KLAN_RADA_JEDNOMYSLNE) return pro >= n && proti === 0;
  return pro > n / 2 && proti <= 1;
}
// jméno aktéra do hlášek: člen má vlastní jméno, zakladatel jede pod rodem
function jmenoAktera(a) { return a ? (a.jmeno || a.name) : "?"; }

function zalozKlan(a, jmeno) {
  if (!a || a.klan) return null;                       // aktér je nejvýš v jednom klanu
  const nazev = String(jmeno || "").trim().slice(0, KLAN_JMENO_MAX);
  if (!nazev) return null;
  if (!G.klany) G.klany = [];
  if (G.klany.some(k => k.fid === a.id && k.jmeno.toLowerCase() === nazev.toLowerCase())) return null;
  const k = {
    id: (G.nextKlanId = (G.nextKlanId || 0) + 1),
    fid: a.id, jmeno: nazev,
    vudce: a.cid || 0, dustojnici: [],
    level: 1, xp: 0,
    zalozen: G.tick,
  };
  G.klany.push(k);
  a.klan = k.id;
  addLog(a.id, { klic: "kron.klan.vznik", param: { kdo: jmenoAktera(a), klan: nazev } });
  return k;
}

function prijmiDoKlanu(a, cid) {
  const k = klanOf(a);
  if (!k || !jeDustojnik(k, a)) return false;           // přijímá jen důstojník
  const novy = clenPodleCid(G.factions[k.fid], cid);
  if (!novy || novy.klan) return false;
  if (klanCleny(k).length >= klanKapacita(k)) return false;
  novy.klan = k.id;
  addLog(k.fid, { klic: "kron.klan.vstup", param: { kdo: jmenoAktera(novy), klan: k.jmeno } });
  return true;
}

function odejdiZKlanu(a) {
  const k = klanOf(a);
  if (!k) return false;
  if (jeVudce(k, a)) {
    // vůdce předá klan prvnímu důstojníkovi, jinak klan zaniká
    const nastupce = k.dustojnici[0];
    if (nastupce === undefined) { a.klan = 0; zrusKlan(k); return true; }
    k.vudce = nastupce;
    k.dustojnici = k.dustojnici.filter(c => c !== nastupce);
  }
  k.dustojnici = k.dustojnici.filter(c => c !== (a.cid || 0));
  a.klan = 0;
  delete a.vyhazov;
  addLog(k.fid, { klic: "kron.klan.odchod", param: { kdo: jmenoAktera(a), klan: k.jmeno } });
  return true;
}

function povysDustojnika(a, cid) {
  const k = klanOf(a);
  if (!k || !jeVudce(k, a)) return false;               // povyšuje jen vůdce
  const c = clenPodleCid(G.factions[k.fid], cid);
  if (!c || c.klan !== k.id || (c.cid || 0) === k.vudce) return false;
  if (k.dustojnici.includes(cid)) return false;
  if (k.dustojnici.length >= klanDustojnikuMax(k)) return false;
  k.dustojnici.push(cid);
  addLog(k.fid, { klic: "kron.klan.dustojnik", param: { kdo: jmenoAktera(c), klan: k.jmeno } });
  return true;
}
function sesadDustojnika(a, cid) {
  const k = klanOf(a);
  if (!k || !jeVudce(k, a) || !k.dustojnici.includes(cid)) return false;
  k.dustojnici = k.dustojnici.filter(c => c !== cid);
  return true;
}

// Zánik klanu: pevnosti se NEVRACEJÍ rodu, ale ZNEUTRÁLNÍ (rozhodnuto 29. 8.) —
// jinak by rozbití klanu bylo pro rod výhodný obchod.
function zrusKlan(k) {
  if (!k) return false;
  for (const t of klanPevnosti(k)) zneutralniPevnost(t);
  for (const a of klanCleny(k)) { a.klan = 0; delete a.vyhazov; }
  G.klany = (G.klany || []).filter(x => x.id !== k.id);
  addLog(k.fid, { klic: "kron.klan.rozpad", param: { klan: k.jmeno } });
  return true;
}

// úroveň klanu roste z KUMULATIVNÍ síly členů (obdoba XP Prstenu) — volá se
// z tickWorld ve stejném rytmu jako přírůstek Prstenu
function klanTick() {
  for (const k of G.klany || []) {
    if (!klanCleny(k).length) { zrusKlan(k); continue; }
    k.xp += klanSila(k);
    while (k.level < KLAN_MAX_UROVEN && k.xp >= klanXpNeed(k.level)) {
      k.xp -= klanXpNeed(k.level);
      k.level++;
      addLog(k.fid, { klic: "kron.klan.uroven", param: { klan: k.jmeno, uroven: k.level, mist: klanKapacita(k) } });
    }
  }
}




// ---------- POLITIKA: ROZHODUJÍCÍ KLAN, HLASOVÁNÍ, SPOJENCI (etapa 10, IV-D) ----------
// Válku za celý rod nevyhlašuje jednotlivec, ale ROZHODUJÍCÍ KLAN — ten
// s nejvyšší kumulativní silou členů. Uvnitř klanu musí projít nejdřív shoda
// RADY a pak hlasování ČLENŮ; z toho vznikne VYHLÁŠENÍ s odpočtem, aby se druhá
// strana stihla připravit.
//
// ⚠ Plán mluví o „přepočtu denně v 6:00" a o dnech. Hra ale běží na TICÍCH
// a sezóna může trvat hodinu i čtrnáct dní, takže se všechny lhůty odvozují
// z délky sezóny — na čtrnáctidenní vyjdou přesně dny z plánu, na testovací
// hodinové sezóně minuty. Pevná hodina na zdi by v hodinové sezóně nikdy
// nenastala a mechanika by se nedala ani otestovat.
const POLITIKA_DNU = 14;                   // cílová sezóna má 14 dní
function denTicks() { return Math.max(60, Math.round(SEASON_TICKS / POLITIKA_DNU)); }
function prepocetTicks() { return denTicks(); }          // rozhodující klan platí „24 h"
function vyhlaseniTicks() { return Math.max(30, Math.round(denTicks() / 4)); } // ~6 h odpočet
function valkaMinTicks() { return 3 * denTicks(); }      // válka trvá nejméně 3 dny
function mirKlidTicks() { return 3 * denTicks(); }       // po míru 3 dny klidu
function hlasovaniTicks() { return Math.max(30, Math.round(denTicks() / 2)); } // lhůta na hlasy
const HLASOVANI_MIN_PODIL = 0.10;          // prahu členů se rada nesmí dostat pod 10 %

// ---- rozhodující klan ----
// Přepočítává se jednou za „den" a mezitím PLATÍ — jinak by se vedení rodu
// měnilo každým dobytým polem a nikdo by nevěděl, kdo zrovna rozhoduje.
function prepoctiRozhodujici(force) {
  G.rozhodujici = G.rozhodujici || {};
  for (const f of G.factions) {
    const stav = G.rozhodujici[f.id];
    if (!force && stav && G.tick < stav.doTiku) continue;
    let nej = null, nejSila = -1;
    for (const k of G.klany || []) {
      if (k.fid !== f.id) continue;
      const s = klanSila(k);
      if (s > nejSila) { nejSila = s; nej = k; }
    }
    const drive = stav && stav.klan;
    G.rozhodujici[f.id] = { klan: nej ? nej.id : 0, sila: Math.max(0, nejSila),
      doTiku: G.tick + prepocetTicks() };
    if (nej && drive !== nej.id)
      addLog(f.id, { klic: "kron.klan.rozhoduje", param: { klan: nej.jmeno } });
  }
}
function rozhodujiciKlanId(fid) {
  const s = G.rozhodujici && G.rozhodujici[fid];
  return s ? s.klan : 0;
}
function jeRozhodujici(k) { return !!k && rozhodujiciKlanId(k.fid) === k.id; }

// ---- hlasování ----
// Dvě fáze: RADA (jednomyslně / většinou podle etapy 8) a pak ČLENOVÉ s prahem,
// který rada určí — nejméně 10 % členů. Teprve pak se z hlasování stane čin.
function hlasovaniOtevrene(fid) {
  return (G.hlasovani || []).filter(h => h.fid === fid && h.faze !== "hotovo");
}
function hlasovaniPodleId(id) { return (G.hlasovani || []).find(h => h.id === id) || null; }

function zahajHlasovani(a, typ, cilId, prahPodil) {
  const k = klanOf(a);
  if (!k || !jeDustojnik(k, a)) return null;          // vyhlašuje jen důstojník
  if (!jeRozhodujici(k)) return null;                 // a jen rozhodující klan
  if (typ !== "valka" && typ !== "mir") return null;
  const cil = G.factions[cilId];
  if (!cil || !cil.alive || cil.id === k.fid) return null;
  const f = G.factions[k.fid];
  if (typ === "valka") {
    if (jeValka(f, cilId)) return null;
    if (G.tick < ((f.mirDo || {})[cilId] || 0)) return null;   // 3 dny klidu po míru
  } else {
    if (!jeValka(f, cilId)) return null;
    // ⚠ o míru se nedá ani hlasovat, dokud válka netrvá 3 dny — spolu s klidem
    // po míru z toho vychází čistý třídenní rytmus a válečné jojo nevznikne
    if (G.tick < ((f.valkaOd || {})[cilId] || 0) + valkaMinTicks()) return null;
  }
  if (hlasovaniOtevrene(k.fid).some(h => h.typ === typ && h.cil === cilId)) return null;
  G.hlasovani = G.hlasovani || [];
  const h = {
    id: (G.nextHlasId = (G.nextHlasId || 0) + 1),
    fid: k.fid, klan: k.id, typ, cil: cilId,
    faze: "rada", hlasy: {}, prah: Math.max(HLASOVANI_MIN_PODIL, Math.min(1, prahPodil || 0.5)),
    doTiku: G.tick + hlasovaniTicks(),
  };
  G.hlasovani.push(h);
  addLog(k.fid, { klic: typ === "valka" ? "kron.hlasovani.valka" : "kron.hlasovani.mir", param: { klan: k.jmeno, cil: cil.name } });
  return h;
}

function hlasuj(a, id, pro) {
  const h = hlasovaniPodleId(id);
  if (!h || h.faze === "hotovo") return false;
  const k = klanOf(a);
  if (!k || k.id !== h.klan) return false;
  if (h.faze === "rada" && !jeDustojnik(k, a)) return false;   // v první fázi jen rada
  const cid = a.cid || 0;
  if (h.hlasy[cid] !== undefined) return false;                // hlasuje se jednou
  h.hlasy[cid] = !!pro;
  vyhodnotHlasovani(h);
  return true;
}

function vyhodnotHlasovani(h) {
  const k = klanPodleId(h.klan);
  if (!k) { h.faze = "hotovo"; h.vysledek = "klan zanikl"; return; }
  const pro = Object.values(h.hlasy).filter(Boolean).length;
  const proti = Object.values(h.hlasy).filter(x => !x).length;
  if (h.faze === "rada") {
    if (proti && !radaProsla(k, pro, proti)) { h.faze = "hotovo"; h.vysledek = "rada zamítla"; return; }
    if (!radaProsla(k, pro, proti)) return;      // ještě se čeká na zbytek rady
    h.faze = "clenove";
    h.hlasy = {};                                 // druhé kolo je čisté
    h.doTiku = G.tick + hlasovaniTicks();
    addLog(h.fid, { klic: "kron.rada.souhlas", param: { prah: Math.round(h.prah * 100), klan: k.jmeno } });
    return;
  }
  const cleny = klanCleny(k).length;
  if (pro >= Math.max(1, Math.ceil(cleny * h.prah))) { h.faze = "hotovo"; hlasovaniProslo(h); }
  else if (proti > cleny - Math.ceil(cleny * h.prah)) { h.faze = "hotovo"; h.vysledek = "členové zamítli"; }
}

function hlasovaniProslo(h) {
  h.vysledek = "prošlo";
  const f = G.factions[h.fid], cil = G.factions[h.cil];
  if (!f || !cil) return;
  if (h.typ === "mir") { uzavriMir(f, cil.id); return; }
  // VYHLÁŠENÍ: válka začne až po odpočtu, ať se druhá strana stihne připravit
  f.vyhlaseni = f.vyhlaseni || {};
  f.vyhlaseni[cil.id] = G.tick + vyhlaseniTicks();
  addLog(-1, { klic: "kron.vyhlaseni", param: { a: f.name, b: cil.name, za: fmtDobu(vyhlaseniTicks()) } });
  emitEvent("war", cil.id);
}

// odpočty hlasování a vyhlášení; volá se z tickWorld
function tikPolitiky() {
  prepoctiRozhodujici();
  for (const h of G.hlasovani || []) {
    if (h.faze !== "hotovo" && G.tick >= h.doTiku) {
      // vypršelá lhůta = zamítnuto (mlčení není souhlas)
      h.faze = "hotovo"; h.vysledek = "vypršelo";
    }
  }
  if (G.hlasovani && G.hlasovani.length > 40)
    G.hlasovani = G.hlasovani.filter(h => h.faze !== "hotovo").concat(
      G.hlasovani.filter(h => h.faze === "hotovo").slice(-20));
  for (const f of G.factions) {
    if (!f.vyhlaseni) continue;
    for (const cilId of Object.keys(f.vyhlaseni)) {
      if (G.tick < f.vyhlaseni[cilId]) continue;
      delete f.vyhlaseni[cilId];
      zacniValku(f, +cilId);
    }
  }
}

// ---- válka je OBOUSTRANNÁ ----
function zacniValku(f, cilId) {
  const cil = G.factions[cilId];
  if (!f || !cil || !cil.alive) return false;
  for (const [a, b] of [[f, cil], [cil, f]]) {
    a.valky = a.valky || {};
    a.valky[b.id] = 1;
    a.valkaOd = a.valkaOd || {};
    a.valkaOd[b.id] = G.tick;
    if (a.pacts) delete a.pacts[b.id];
  }
  // spojenectví s protivníkem válku nepřežije
  if (spojenecId(f) === cil.id) zrusSpojenectvi(f);
  cil.grudge[f.id] = 1;
  addLog(-1, { klic: "kron.valka", param: { a: f.name, b: cil.name } });
  emitEvent("war", cil.id);
  return true;
}

function uzavriMir(f, cilId) {
  const cil = G.factions[cilId];
  if (!f || !cil) return false;
  for (const [a, b] of [[f, cil], [cil, f]]) {
    if (a.valky) delete a.valky[b.id];
    if (a.valkaOd) delete a.valkaOd[b.id];
    a.mirDo = a.mirDo || {};
    a.mirDo[b.id] = G.tick + mirKlidTicks();   // 3 dny se nedá vyhlásit znovu
  }
  addLog(-1, { klic: "kron.mir", param: { a: f.name, b: cil.name } });
  return true;
}

// ---- spojenectví: JEDEN spojenec na rod ----
// Sdílený dohled, spojenecká pole se pro PŘESUN i pro SOUSEDSTVÍ ZÁBORU chovají
// jako vlastní. Dvojice rodů se tím pro expanzi chová jako jedna souvislá
// klaksa — aliance zdvojnásobí nejen dojezd, ale i frontu. A protože je spojenec
// jen jeden, vznikne nejvýš dvojice, nikdy blok.
function spojenecId(f) {
  f = frakceOf(f) || f;
  return f && f.spojenec !== undefined ? f.spojenec : -1;
}
function jsouSpojenci(a, b) {
  if (!a || !b) return false;
  const fa = frakceOf(a) || a, fb = frakceOf(b) || b;
  if (fa.id === fb.id) return false;
  return spojenecId(fa) === fb.id && spojenecId(fb) === fa.id;
}
// nabídka spojenectví: druhá strana ji musí přijmout (tatáž funkce z druhé strany)
function nabidniSpojenectvi(a, cilId) {
  const f = frakceOf(a) || a;
  const cil = G.factions[cilId];
  if (!f || !cil || !cil.alive || cil.id === f.id) return false;
  const k = klanOf(a);
  if (!k || !jeDustojnik(k, a) || !jeRozhodujici(k)) return false;   // mluví rozhodující klan
  if (jeValka(f, cilId)) return false;
  if (spojenecId(f) >= 0 && spojenecId(f) !== cilId) return false;   // jeden spojenec na rod
  if (spojenecId(cil) >= 0 && spojenecId(cil) !== f.id) return false;
  f.spojenec = cilId;
  if (spojenecId(cil) === f.id) {
    addLog(-1, { klic: "kron.spojenectvi", param: { a: f.name, b: cil.name } });
  } else {
    addLog(cil.id, { klic: "kron.spojenectvi.nabidka", param: { rod: f.name } });
  }
  return true;
}
function zrusSpojenectvi(a) {
  const f = frakceOf(a) || a;
  const byl = spojenecId(f);
  if (byl < 0) return false;
  f.spojenec = -1;
  const cil = G.factions[byl];
  if (cil && spojenecId(cil) === f.id) {
    cil.spojenec = -1;
    addLog(-1, { klic: "kron.spojenectvi.konec", param: { a: f.name, b: cil.name } });
  }
  return true;
}

// ---------- KLANOVÁ BURZA: pravidla a ceník (etapa 9, IV-F + IV-R) ----------
// Tady jsou jen ČISTÁ PRAVIDLA — co se smí za co měnit a kolik to stojí.
// Úschova, stavy nabídek a trvalé úložiště jsou na serveru (server/burza.js),
// protože musí být v jedné transakci s účty.
//
// TŘI ODDĚLENÉ PŘIHRÁDKY a mezi nimi se NEMĚNÍ:
//   suroviny za suroviny (nejméně 1:1, přeplatit smíš)
//   výbava za výbavu STEJNÉ RARITY
//   dárky za dárky STEJNÉHO TIERU
// Jakýkoli kurz mezi surovinou a předmětem je cena, kterou by bylo nutné
// obhájit — a je to trubka na farmení z altů i na prodej za skutečné peníze.
const BURZA_PRIHRADKY = ["suroviny", "vybava", "darky"];
// jádra za KUS podle tieru (běžný / epický / legendární). Sudá schválně:
// půlka na stranu vychází vždy celá (3 / 6 / 12).
const BURZA_KUS_JADRA = [6, 12, 24];
const BURZA_SUROVINY_PROCENTO = 0.15;   // z objemu OBOU stran, ve zlatě
// Každý další obchod za den stojí víc — odtok i brzda proti slévání z altů.
// Objemovou složku má poplatek už v sobě (suroviny 15 % objemu, kusy za kus),
// tohle je ta POČETNÍ: n-tý obchod dne stojí (1 + 0,5·(n−1))násobek.
const BURZA_ESKALACE = 0.5;
const BURZA_PLATNOST_DNI = 7;           // po týdnu nabídka vyprší a úschova se vrátí

function burzaTierRarity(rarita) { return GIFT_RARITY_TIER[Math.max(0, Math.min(4, rarita | 0))] | 0; }
function burzaObjem(res) {
  let s = 0;
  for (const k of RES_KEYS) s += Math.max(0, Math.round(res && res[k] || 0));
  return s;
}
// kolikátý obchod dne to pro tenhle účet je (0 = první)
function burzaObchoduDnes(acc, den) {
  return (acc && acc.burzaDen === (den || dnesniDen())) ? (acc.burzaPocet | 0) : 0;
}
function burzaNasobek(acc, den) { return 1 + BURZA_ESKALACE * burzaObchoduDnes(acc, den); }

// CELÝ poplatek za obchod (obě strany dohromady) — { mena, celkem }.
// Zaokrouhluje se NAHORU, jinak by se poplatek dal obejít drobnými obchody.
function burzaPoplatek(nabidka) {
  if (!nabidka) return { mena: "gold", celkem: 0 };
  if (nabidka.prihradka === "suroviny") {
    const objem = burzaObjem(nabidka.dava) + burzaObjem(nabidka.chce);
    return { mena: "gold", celkem: Math.ceil(objem * BURZA_SUROVINY_PROCENTO) };
  }
  const tier = nabidka.prihradka === "vybava"
    ? burzaTierRarity(nabidka.chce && nabidka.chce.rarita)
    : Math.max(0, Math.min(2, (nabidka.chce && nabidka.chce.tier) | 0));
  const kusu = Math.max(1, (nabidka.chce && nabidka.chce.pocet) | 0);
  return { mena: "cores", celkem: BURZA_KUS_JADRA[tier] * kusu };
}
// POLOVINA pro jednu stranu, i s eskalací za počet jejích dnešních obchodů.
// Zaokrouhluje se nahoru — u jader to vždy vyjde celé (ceník je sudý).
function burzaPulka(nabidka, acc, den) {
  const p = burzaPoplatek(nabidka);
  return { mena: p.mena, castka: Math.ceil(p.celkem / 2 * burzaNasobek(acc, den)) };
}

// Smí taková nabídka vůbec vzniknout? Vrací null (v pořádku), nebo důvod.
// Kontroluje jen PRAVIDLA PŘIHRÁDKY, ne majetek — ten hlídá server.
function burzaZkontroluj(nabidka) {
  if (!nabidka || !BURZA_PRIHRADKY.includes(nabidka.prihradka)) return "Neznámá přihrádka.";
  const { prihradka, dava, chce } = nabidka;
  if (!dava || !chce) return "Nabídka musí mít obě strany.";
  if (prihradka === "suroviny") {
    const d = burzaObjem(dava), c = burzaObjem(chce);
    if (d <= 0 || c <= 0) return "Obě strany musí něco nabídnout.";
    // „nejméně 1:1, přeplatit smíš" — nabízející si nesmí říct o MÍŇ, než dává.
    // Tím se z burzy nedá udělat trubka na převod hodnoty z altů: mění se
    // DRUH suroviny, ne její množství.
    if (c < d) return "Za suroviny musíš chtít aspoň tolik, kolik dáváš (nejméně 1:1).";
    return null;
  }
  if (prihradka === "vybava") {
    // ⚠ Při VYSTAVENÍ zná klient jen `itemId` — raritu ověří server, až má kus
    // v ruce (`burzaRaritaSedi`). Tady se kontroluje jen tvar nabídky.
    if (!dava.item && !dava.itemId) return "Vyber kus výbavy.";
    const rarita = chce.rarita | 0;
    if (rarita < 0 || rarita > 4) return "Neplatná rarita.";
    if (dava.item && (dava.item.rarity | 0) !== rarita)
      return "Výbava se mění jen za STEJNOU raritu.";
    return null;
  }
  // dárky
  const pocet = (dava.pocet | 0);
  if (!dava.skupina || pocet <= 0) return "Vyber dárky a počet.";
  if (!jeSkupinaDarku(dava.skupina)) return "Neplatná skupina dárků.";
  if ((chce.pocet | 0) !== pocet) return "Dárky se mění kus za kus.";
  const tier = rozborSkupiny(dava.skupina).tier;
  if ((chce.tier | 0) !== tier) return "Dárky se mění jen za STEJNÝ tier.";
  return null;
}

// Kontrola, kterou umí až server: rarita kusu, který jde do úschovy, musí sedět
// s tím, co nabídka chce. „Výbava za výbavu STEJNÉ rarity" platí pro obě strany.
function burzaRaritaSedi(nabidka, item) {
  if (!item) return "Ten kus v zásobě nemáš.";
  if ((item.rarity | 0) !== ((nabidka.chce && nabidka.chce.rarita) | 0))
    return "Výbava se mění jen za STEJNOU raritu.";
  return null;
}

// Sedí protiplnění na to, co nabídka chce?
function burzaProtiplneniSedi(nabidka, dava) {
  if (!nabidka || !dava) return "Chybí protiplnění.";
  if (nabidka.prihradka === "suroviny") {
    for (const k of RES_KEYS)
      if (Math.round(dava[k] || 0) < Math.round(nabidka.chce[k] || 0)) return "Nedáváš, co nabídka chce.";
    return null;
  }
  if (nabidka.prihradka === "vybava") {
    // ⚠ i tady posílá klient jen `itemId` — raritu ověří server přes
    // `burzaRaritaSedi`, až má kus v ruce
    if (!dava.item && !dava.itemId) return "Vyber kus výbavy.";
    if (dava.item && (dava.item.rarity | 0) !== (nabidka.chce.rarita | 0))
      return "Kus musí mít stejnou raritu.";
    return null;
  }
  if (!dava.skupina || !jeSkupinaDarku(dava.skupina)) return "Vyber dárky.";
  if ((dava.pocet | 0) !== (nabidka.chce.pocet | 0)) return "Musí to být kus za kus.";
  if (rozborSkupiny(dava.skupina).tier !== (nabidka.chce.tier | 0)) return "Dárky musí být stejného tieru.";
  return null;
}

// ---------- CHAT (etapa 9, IV-E) ----------
// Tři kanály: SVĚT (všichni), KLAN (jen členové) a SOUKROMÝ (dva aktéři).
// Soukromý není luxus — bez něj se nedá domluvit obchod na klanové burze.
//
// Zprávy žijí v SEZÓNĚ (`G.chat`) jako reporty a projdou snímkem samy. Server
// je rozesílá PO KUSECH (jako reporty od v0.50): každý hráč dostane jen to,
// co ho smí vidět, a jen to, co ještě nedostal — jinak by se celý svět dozvěděl
// obsah cizích klanových porad.
const CHAT_MAX = 300;              // strop zpráv v paměti sezóny
const CHAT_MAX_ZNAKU = 300;
const CHAT_KANALY = ["svet", "klan", "soukr"];
// Prodleva mezi zprávami JEDNOHO aktéra. Neškáluje se délkou sezóny — je to
// ochrana proti zaplavení, ne herní rytmus (stejná úvaha jako ABANDON_TICKS).
const CHAT_PAUZA = 2;

function chatPauzaTicks() { return CHAT_PAUZA; }
// smí aktér vidět tuhle zprávu?
function chatViditelna(a, m) {
  if (!a || !m) return false;
  if (m.kanal === "svet") return true;
  if (m.kanal === "klan") return !!a.klan && m.klan === a.klan;
  if (m.kanal === "soukr") { const k = aktorKlic(a); return m.od === k || m.komu === k; }
  return false;
}
function chatProAktera(a, odId = 0) {
  return (G.chat || []).filter(m => m.id > odId && chatViditelna(a, m));
}

// Vrací id zprávy, nebo 0 při odmítnutí. Odmítá TICHO — spam nemá dostávat
// zpětnou vazbu, podle které by se dal ladit.
function chatPosli(a, kanal, text, komu) {
  if (!a || !CHAT_KANALY.includes(kanal)) return 0;
  const t = String(text || "").replace(/\s+/g, " ").trim().slice(0, CHAT_MAX_ZNAKU);
  if (!t) return 0;
  if (kanal === "klan" && !a.klan) return 0;
  if (kanal === "soukr") {
    if (!komu || komu === aktorKlic(a)) return 0;
    const [fid, cid] = String(komu).split(":").map(Number);
    const f = G.factions[fid];
    if (!f || !clenPodleCid(f, cid || 0)) return 0;
  }
  // prodleva proti zaplavení — na aktérovi, ne na spojení (jinak by stačilo
  // otevřít druhou záložku)
  if (a.chatDo && G.tick < a.chatDo) return 0;
  a.chatDo = G.tick + chatPauzaTicks();

  if (!G.chat) G.chat = [];
  const m = {
    id: (G.nextChatId = (G.nextChatId || 0) + 1),
    kanal, tick: G.tick,
    od: aktorKlic(a), odJmeno: jmenoAktera(a), odRod: a.key,
  };
  if (kanal === "klan") m.klan = a.klan;
  if (kanal === "soukr") m.komu = komu;
  m.text = t;
  G.chat.push(m);
  if (G.chat.length > CHAT_MAX) G.chat.splice(0, G.chat.length - CHAT_MAX);
  return m.id;
}

// ---------- KLANOVÁ PEVNOST (IV-B) ----------
// Staví se na VLASTNĚNÉM uzlu 2×2 (síla 200+) — uzel se musí nejdřív dobýt,
// což vyžaduje dosah, takže pevnost nikdy nevznikne mimo frontu.
function patriKlanu(k, t) { return !!k && !!t && t.owner === k.fid && t.klan === k.id; }
function klanPevnosti(k) {
  if (!k) return [];
  return [...G.tiles.values()].filter(t => patriKlanu(k, t) && t.structure === "klanpevnost" && !t.big);
}
function jeKlanovaPevnost(t) { return !!t && t.structure === "klanpevnost"; }
function lzeStavetPevnost(a, tile) {
  const k = klanOf(a);
  const t = bigAnchor(tile);
  if (!k || !jeDustojnik(k, a) || !t) return false;
  if (!patriClenu(a, t)) return false;                  // musí být MOJE dobyté pole
  if (t.bigSize !== 2 || t.structure) return false;     // právě uzel 2×2, nic jiného
  if (klanPevnosti(k).length >= klanPevnostiMax(k)) return false;
  return true;
}
function postavKlanovouPevnost(a, tile) {
  const t = bigAnchor(tile);
  if (!lzeStavetPevnost(a, t)) return false;
  const k = klanOf(a);
  if (!canAfford(a, KLAN_PEVNOST_CENA)) return false;
  pay(a, KLAN_PEVNOST_CENA);
  t.klanPredchozi = a.cid || 0;      // komu se pole vrátí po zbourání
  t.structure = "klanpevnost";
  setTileOwner(t, k.fid, 0, k.id);
  addLog(k.fid, { klic: "kron.pevnost.stavba", param: { klan: k.jmeno, pole: tileKlic(t) } });
  return true;
}
function zbourejKlanovouPevnost(a, tile) {
  const k = klanOf(a);
  const t = bigAnchor(tile);
  if (!k || !jeDustojnik(k, a) || !patriKlanu(k, t) || !jeKlanovaPevnost(t)) return false;
  const komu = t.klanPredchozi || 0;
  delete t.klanPredchozi;
  t.structure = null;
  setTileOwner(t, k.fid, komu);      // pole se vrací tomu, kdo ho do klanu vložil
  addLog(k.fid, { klic: "kron.pevnost.bourani", param: { klan: k.jmeno, pole: tileKlic(t) } });
  return true;
}
// pevnost bez klanu = neutrální blok s posádkou, jako vyklizené pole
function zneutralniPevnost(t) {
  t.structure = null;
  delete t.klanPredchozi;
  setTileOwner(t, -1);
  t.garrison = LEVEL_GARRISON[t.level] * (t.bigSize === 2 ? 2 : 1);
}
// „Vejde se jeden hrdina za člena" — pevnost je shromaždiště, ne bezedný pytel
function pevnostKapacita(k) { return Math.max(1, klanCleny(k).length); }
function hrdinuNaPoli(key) {
  let n = 0;
  for (const f of G.factions) for (const a of vsichniClenove(f))
    for (const h of a.heroes) if (h.pos === key) n++;
  return n;
}

// ---------- VYHAZOV JAKO STAV (IV-A) ----------
// Vyhazov se NEDÁ vynutit: důstojník pošle výpověď, a když ji hráč PŘIJME,
// odejde čistě. Když ji odmítne (nebo ji nechá vypršet), stane se VYVRHELEM:
// ztratí frakční pouta — spoluhráči ho nebrání, nesdílí s ním hranici ani
// dohled — a teprve TÍM se jeho pole stanou pro rod nepřátelská.
//
// Musí to být STAV, ne výjimka v útoku: pole patří RODU (t.owner je fid), takže
// bez toho by se pochod na pole spoluhráče vyhodnotil jako přesun na vlastní
// pole, ne jako bitva.
function vyhazovTicks() { return Math.max(120, Math.round(SEASON_TICKS * 0.03)); }
function navrhniVyhazov(a, cid) {
  const k = klanOf(a);
  if (!k || !jeDustojnik(k, a)) return false;
  const c = clenPodleCid(G.factions[k.fid], cid);
  if (!c || c.klan !== k.id || (c.cid || 0) === k.vudce) return false;  // vůdce se vyhodit nedá
  if (c.vyhazov) return false;
  c.vyhazov = { klan: k.id, doTiku: G.tick + vyhazovTicks() };
  addLog(k.fid, { klic: "kron.vyhazov", param: { klan: k.jmeno, kdo: jmenoAktera(c) } });
  emitEvent("vyhazov", c.id, c.cid);
  return true;
}
function prijmiVyhazov(a) {
  if (!a || !a.vyhazov) return false;
  delete a.vyhazov;
  odejdiZKlanu(a);
  return true;
}
function odmitniVyhazov(a) {
  if (!a || !a.vyhazov) return false;
  const k = klanOf(a);
  delete a.vyhazov;
  a.vyvrhel = true;
  if (k) {
    k.dustojnici = k.dustojnici.filter(c => c !== (a.cid || 0));
    a.klan = 0;
    addLog(k.fid, { klic: "kron.vyvrhel", param: { kdo: jmenoAktera(a), klan: k.jmeno } });
  }
  return true;
}
function jeVyvrhel(a) { return !!a && a.vyvrhel === true; }
// Sdílí spolu dva aktéři frakční pouta? Vyvrhel je nesdílí s nikým — ani sám
// se sebou to neplatí obráceně: BRÁNIT SE SÁM smí dál (proto rovnost aktérů).
function poutaSdili(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  if ((a.id || 0) !== (b.id || 0)) return false;
  if ((a.cid || 0) === (b.cid || 0)) return true;
  return !jeVyvrhel(a) && !jeVyvrhel(b);
}
// kdo pole DRŽÍ jako aktér; klanové pole nedrží nikdo osobně (vrací null)
function drzitelPole(t) {
  if (!t || t.owner === -1 || t.klan) return null;
  const f = G.factions[t.owner];
  return f ? (clenPodleCid(f, t.clen || 0) || f) : null;
}
// Je pole pro tohoto aktéra „vlastní" (přesun), nebo cizí (bitva)? Do etapy 8
// stačilo t.owner === faction.id; s VYVRHELEM to přestalo platit — a je to
// jediné místo, kde se to rozhoduje, takže se pravidlo nemá kde rozejít.
// ⚠ Běží v horkých smyčkách AI (isAdjacentToFaction) — nejčastější případ
// „moje vlastní pole" se proto vyřizuje bez jediného vyhledání.
function jeMoje(a, tile) {
  if (!a || !tile || tile.owner === -1) return false;
  // ETAPA 10: spojenecká pole se pro PŘESUN a pro SOUSEDSTVÍ ZÁBORU chovají
  // jako vlastní — dva spojenecké rody se pro expanzi chovají jako jedna
  // souvislá klaksa. Do OBRANY se to nepropisuje (braniPole zůstává přísné).
  if (tile.owner !== a.id) return jsouSpojenci(a, G.factions[tile.owner]);
  if (tile.klan) return !jeVyvrhel(a);        // půda rodu, byť ji spravuje klan
  if ((tile.clen || 0) === (a.cid || 0)) return true;
  if (jeVyvrhel(a)) return false;
  return !jeVyvrhel(drzitelPole(tile));
}
// Smí tento aktér PŘISPĚT DO OBRANY pole? Přísnější než jeMoje: klanovou
// pevnost brání jen klan, ne celý rod.
function braniPole(a, tile) {
  if (!a || !tile || tile.owner !== a.id) return false;
  if (tile.klan) return (a.klan || 0) === tile.klan;
  if ((tile.clen || 0) === (a.cid || 0)) return true;
  return !jeVyvrhel(a) && !jeVyvrhel(drzitelPole(tile));
}

// pakt o neútočení je vzájemný — čte se z obou stran
// (v0.32: aktér-člen se normalizuje na svou frakci — diplomacie je frakční)
function hasPact(a, b) {
  a = frakceOf(a) || a;
  return !!(a.pacts && a.pacts[b.id] && a.pacts[b.id] > 0);
}

// ---------- Hrdinové ----------
function heroDef(faction, heroIdx) {
  const h = faction.heroes[heroIdx];
  return HERO_DEFS[h.srcKey || faction.key][h.defIdx];
}
// účetní klíč hrdiny („rodnáFrakce:index") — jediný zdroj pravdy pro účty
function heroKeyFor(faction, h) { return (h.srcKey || faction.key) + ":" + h.defIdx; }
function heroTrait(faction, heroIdx) { return HERO_TRAITS[heroDef(faction, heroIdx).trait]; }
// ---------- Vyhlášení války (v0.29) ----------
// Válka je JEDNOSMĚRNÝ stav do konce sezóny: sundá 70% postih bourání
// v krajích držených cílem a je POVINNÁ pro útok na kapitál. Vyhlášení má
// dlouhý cooldown a trhá případný pakt (zrada jako u cancelPact).
const WAR_CD_FRAC = 0.05;   // cooldown mezi vyhlášeními v podílu sezóny
const WAR_CD_MIN = 180;     // podlaha cooldownu v ticích
function warCdTicks() { return Math.max(WAR_CD_MIN, Math.round(SEASON_TICKS * WAR_CD_FRAC)); }
function jeValka(faction, target) {
  faction = frakceOf(faction) || faction; // v0.32: války čte frakce aktéra
  const tid = typeof target === "number" ? target : target && target.id;
  return !!(faction.valky && faction.valky[tid]);
}
function declareWar(faction, targetId) {
  faction = frakceOf(faction) || faction; // v0.32: diplomacie je frakční
  const cil = G.factions[targetId];
  if (!cil || !cil.alive || cil.id === faction.id) return false;
  if (jeValka(faction, targetId)) return false;
  if (G.tick < (faction.valkaCd || 0)) return false;
  if (hasPact(faction, cil)) {
    delete faction.pacts[targetId];
    delete cil.pacts[faction.id];
    cil.pactCooldown[faction.id] = PACT_BETRAYAL_COOLDOWN;
    addLog(-1, { klic: "kron.pakt.zrada", param: { a: faction.name, b: cil.name } });
  }
  // ETAPA 10: válka je OBOUSTRANNÁ a je jen JEDNA cesta, jak vznikne —
  // `zacniValku`. Politický aparát (hlasování → vyhlášení → odpočet) k ní vede
  // u hráčů, AI ji vyhlašuje rovnou přes tuhle funkci. Dva různé mechanismy
  // války by se dřív nebo později rozešly.
  faction.valkaCd = G.tick + warCdTicks();
  zacniValku(faction, targetId);
  return true;
}
// kdo DRŽÍ kraj: střed = majitel Trůnu, jinak majitel grandfortu-brány kraje
function regionHolderId(tile) {
  const kraj = regionOf(tile);
  if (kraj === REGION_CENTER) {
    const trun = tileAt(0, 0);
    return trun ? trun.owner : -1;
  }
  // Kdo drží KEEP kraje, drží kraj (etapa 7). Grandfort na prstenci zůstává
  // záložním držitelem pro kraje, kde se keep nepovedlo postavit.
  let zaloha = -1;
  for (const t of G.tiles.values()) {
    if (regionOf(t) !== kraj) continue;
    if (t.structure === "keep") return t.owner;
    if (t.structure === "grandfort" && zaloha === -1) zaloha = t.owner;
  }
  return zaloha;
}

function heroBusy(faction, heroIdx) { return faction.marches.some(m => m.heroIdx === heroIdx); }

// souhrn vlastností hrdiny: charakterový rys × úroveň × výbava
function heroItemBonus(faction, heroIdx, stat) {
  const h = faction.heroes[heroIdx];
  let v = 0;
  for (const s of ITEM_SLOT_KEYS) {
    const it = h.equip[s];
    if (it && ITEM_SLOTS[s].stat === stat) v += itemValueOf(it);
  }
  return v;
}

function heroStats(faction, heroIdx) {
  const h = faction.heroes[heroIdx];
  const trait = heroTrait(faction, heroIdx);
  // dovednosti + sety + mistrovské bonusy 5★ + pasivka signature kusu:
  // všechno sdílí stejné typy efektů
  const eff = t => heroEff(faction, heroIdx, t) + heroSetEff(faction, heroIdx, t)
    + heroMasterEff(faction, heroIdx, t) + heroSigEff(faction, heroIdx, t)
    + heroItemPasEff(faction, heroIdx, t);
  // podmínkové efekty: bonusy poškození podle typu jednotek a proti frakci
  const unitDmg = emptyArmy();
  const vsDmg = {}, vsStunImmune = {};
  for (const e of heroCondEffs(faction, heroIdx)) {
    if (e.type === "unitDmg" && e.cond.unit) unitDmg[e.cond.unit] += e.val;
    if (e.type === "vsDmg" && e.cond.vsFaction)
      vsDmg[e.cond.vsFaction] = (vsDmg[e.cond.vsFaction] || 0) + e.val;
    if (e.type === "stunImmune" && e.cond.vsFaction) vsStunImmune[e.cond.vsFaction] = 1;
  }
  const item = t => heroItemBonus(faction, heroIdx, t);
  // kolové aktivky se dělí na poškození velitele a posílení celé armády
  const acts = heroActives(faction, heroIdx);
  // hvězdy velitele: +4 % k hlavním statům a +25 velení za hvězdu
  const starMult = (1 + STAR_STAT_BONUS * (h.stars || 0))
    * (1 + TIER_STAT_BONUS * heroTierOf(h.srcKey || faction.key, h.defIdx));
  return {
    // bojové staty: přičítají se ke statům armády, kterou hrdina vede;
    // předměty přidávají stat svého slotu přímo (zbraň poškození, štít
    // obranu, brnění životy, helma kouzla, boty rychlost, rukavice útok)
    hpMax: Math.round((HERO_HP_BASE + HERO_HP_PER_LEVEL * (h.level - 1)
            + (trait.hp || 0) + eff("hp") + item("hp")) * starMult),
    atk: (HERO_ATK_BASE + HERO_ATK_PER_LEVEL * (h.level - 1) + (trait.atk || 0)
            + eff("atk") + item("atk")) * starMult + ringHojnost(faction),
    def: (HERO_DEF_BASE + HERO_DEF_PER_LEVEL * (h.level - 1) + (trait.def || 0)
            + eff("def") + item("def")) * starMult + ringHojnost(faction),
    dmg: Math.round((HERO_DMG_BASE + HERO_DMG_PER_LEVEL * (h.level - 1)
            + (trait.dmg || 0) + eff("dmg") + item("dmg")) * starMult),
    speed: HERO_SPEED_BASE + (trait.speed || 0) + eff("spd") + item("speed"),
    spell: ((trait.spell || 0) + eff("spell") + item("spell")) * starMult,
    stackAtk: eff("stackAtk"),  // útok rostoucí každým kolem boje
    stackDef: eff("stackDef"),  // obrana rostoucí každým kolem boje
    followUp: Math.min(60, eff("followUp")), // % šance na navazující úder velitele
    madness: Math.min(30, eff("madness")),   // % šance uvrhnout formaci do šílenství
    pursuit: Math.min(60, eff("pursuit")),   // % šance na neodvratný úder (obejde vyhnutí)
    stunChance: Math.min(35, eff("stunChance")), // % šance omráčit velitele na kolo
    stunImmune: eff("stunImmune") > 0,           // imunita vůči omráčení
    slowEnemy: Math.min(4, eff("slowEnemy")),    // zpomalení nepřátel (iniciativa/rychlost)
    shred: Math.min(40, eff("shred")),           // −% statů nepřátelského velitele
    harvest: eff("harvest"),                     // +% výnosu Sklizně kraje (mimo boj)
    cauter: Math.min(75, eff("cauter")),         // −% účinku nepřátelského léčení v boji
    vsStunImmune,               // imunita jen proti dané frakci (cond.vsFaction)
    unitDmg, vsDmg,             // podmínkové bonusy poškození
    // kolové aktivky: poškození velitele vs posílení armády (viz heroActives)
    actives: acts.filter(a => a.type === "roundDmg"),
    armyActives: acts.filter(a => a.type === "roundArmy"),
    healActives: acts.filter(a => a.type === "roundHeal"), // léčení BĚHEM boje
    // obranné chargy: prvních N úderů může strana zcela pohltit
    avoidCharges: Math.round(eff("avoidCharge")),
    avoidChance: Math.min(100, eff("avoidChance") || (eff("avoidCharge") > 0 ? 100 : 0)),
    ward: Math.min(0.8, ((trait.ward || 0) + eff("ward")) / 100),
    time: Math.max(0.35, (trait.time || 1) * (1 - eff("speed") / 100)),
    regen: (trait.regen || 1) * (1 + eff("regen") / 100),
    stamMax: STAMINA_MAX + LEVEL_STAMINA * (h.level - 1) + eff("stam") + ringStam(faction),
    structAtk: 1 + eff("structAtk") / 100,        // proti opevněným polím
    heal: Math.min(0.5, eff("heal") / 100),        // podíl ztrát vrácený po vítězství
    strike: eff("strike"),                         // eliminace nepřátel před bojem
    aura: Math.min(0.35, eff("aura") / 100),       // oslabení útočníků v okolí
    holdDef: 1 + eff("holdDef") / 100,             // obrana pole, kde hrdina stojí
    stamCostMult: Math.max(0.4, 1 - eff("stamCost") / 100),
    guardDrainMult: Math.max(0.25, 1 - eff("guardEff") / 100),
    convoyMult: Math.max(0.5, 1 - eff("convoy") / 100),
    goldPerLevel: eff("gold"),                     // zlato za dobytí × úroveň pole
    rally: eff("rally"),                           // výdrž všem hrdinům po výhře
    fastReturn: Math.max(0.3, 1 - eff("fastReturn") / 100),
    noCooldown: eff("noCooldown") > 0,
    instantReturn: eff("instantReturn") > 0,
    ignoreDef: eff("ignoreDef") > 0,
    winStam: eff("winStam") > 0,
    cap: HERO_CAP_BASE + HERO_CAP_PER_LEVEL * (h.level - 1) + (trait.cap || 0)
            + STAR_CAP_BONUS * (h.stars || 0) + eff("cap"),
  };
}

// velení: nejvyšší počet jednotek, který hrdina uvede (armáda + posily na cestě)
function heroArmyCap(faction, heroIdx) {
  return heroStats(faction, heroIdx).cap + ringCap(faction)
    + AKADEMIE_CAP * ((faction.buildings && faction.buildings.academy) || 0);
}

// ---------- Činy Prstenu popela (v0.24) ----------
function ringGather(faction, tile) {
  const r = faction.ring;
  if (!r || r.level < 1 || r.ap < RING_COSTS.gather || !tile) return false;
  tile = bigAnchor(tile);
  if (!patriClenu(faction, tile) || !TERRAIN[tile.terrain].passable) return false; // v0.32: jen vlastní pole aktéra
  if (tile.structure === "outpost") return false;
  const ticks = Math.round(SEASON_TICKS / 24) * (r.level >= 7 ? 2 : 1);
  // ekonomické skilly (v0.28) + větev Sklizeň stromu Prstenu (v0.31)
  let sklizen = 1 + 0.15 * ringVetev(faction, "sklizen");
  for (let hi = 0; hi < faction.heroes.length; hi++)
    sklizen += (heroStats(faction, hi).harvest || 0) / 100;
  const zisk = {};
  for (const m of blockTiles(tile)) {
    const inc = tileYield(m);
    for (const res in inc) {
      const v = inc[res] * ticks * sklizen * ((faction.incomeMult && faction.incomeMult[res]) || 1);
      if (v > 0) zisk[res] = (zisk[res] || 0) + v;
    }
  }
  let neco = false;
  for (const res in zisk) {
    const v = Math.round(zisk[res]);
    if (v > 0) { faction.resources[res] += v; neco = true; }
  }
  if (!neco) return false;
  r.ap -= RING_COSTS.gather;
  addLog(faction.id, { klic: "kron.sklizen", param: { rod: faction.name, pole: tileKlic(tile) } });
  return true;
}

function ringTrain(faction, heroIdx) {
  const r = faction.ring, h = faction.heroes[heroIdx];
  if (!r || r.level < 3 || r.ap < RING_COSTS.train || !h) return false;
  if (h.level >= HERO_MAX_LEVEL) return false;
  const xp = Math.round(xpForLevel(h.level + 1) * (r.level >= 9 ? 0.24 : 0.12));
  r.ap -= RING_COSTS.train;
  addLog(faction.id, { klic: "kron.vycvik.mysli", param: { hrdina: heroDef(faction, heroIdx).name, xp } });
  heroGainXp(faction, heroIdx, xp);
  return true;
}

function ringRest(faction, heroIdx) {
  const r = faction.ring, h = faction.heroes[heroIdx];
  if (!r || r.level < 5 || r.ap < RING_COSTS.rest || !h) return false;
  const max = heroStats(faction, heroIdx).stamMax;
  if (h.stamina >= max) return false;
  r.ap -= RING_COSTS.rest;
  h.stamina = max;
  addLog(faction.id, { klic: "kron.druhy.dech", param: { hrdina: heroDef(faction, heroIdx).name } });
  return true;
}

// jednotky již vázané na hrdinu: jeho armáda + konvoje posil na cestě k němu
function heroArmyCommitted(faction, heroIdx) {
  const h = faction.heroes[heroIdx];
  let n = armyCp(h.army, faction);   // velení se počítá v bodech velení
  if (h.pos) for (const m of faction.marches)
    if (m.kind === "reinforce" && m.targetKey === h.pos) n += armyCp(m.army, faction);
  return n;
}

// síla hrdiny v osobním duelu: úroveň, bojové staty a výbava
function duelPower(faction, heroIdx) {
  const h = faction.heroes[heroIdx];
  const st = heroStats(faction, heroIdx);
  const gear = ITEM_SLOT_KEYS.filter(s => h.equip[s]).length;
  return h.level * 6 + (st.atk + st.def) * 6 + st.dmg / 2 + st.spell / 2 + gear * 4;
}

// ---------- Akční rádius základen (v0.29) ----------
// kapitál frakce je od vykořenění POHYBLIVÝ — vždy číst přes capKeyOf/capPosOf
function capKeyOf(faction) {
  // fallback na CAPITAL_POS psát VÝSLOVNĚ přes keyOf — starší snapshot bez
  // capKey (server před v0.29) nesmí klienta shodit
  if (faction.capKey) return faction.capKey;
  const p = CAPITAL_POS[faction.id];
  return keyOf(p.q, p.r);
}
function capPosOf(faction) {
  const [q, r] = capKeyOf(faction).split(",").map(Number);
  return { q, r };
}
// domovská základna hrdiny: klíč vlastní výspy, jinak kapitál (líná validace —
// padlá výspa vrací hrdinu automaticky pod kapitál)
function heroBaseKey(faction, hero) {
  if (hero.zakladna) {
    const t = G.tiles.get(hero.zakladna);
    if (t && patriClenu(faction, t) && t.structure === "outpost") return hero.zakladna;
    // etapa 8 (IV-B): KLANOVÁ PEVNOST PROMÍTÁ DOSAH — člen se z ní usadí
    // a staví výspy i mimo svůj vlastní akční rádius. To je celý smysl
    // řetězu „dobýt uzel → pevnost → výspy → další uzel".
    if (t && jeKlanovaPevnost(t) && faction.klan && t.klan === faction.klan) return hero.zakladna;
  }
  return capKeyOf(faction);
}
function vDosahu(faction, hero, tile) {
  const [bq, br] = heroBaseKey(faction, hero).split(",").map(Number);
  const a = bigAnchor(tile);
  return Math.abs(a.q - bq) + Math.abs(a.r - br) <= REACH;
}
// usazení: výslovná akce — hrdina stojící na vlastní výspě z ní udělá základnu;
// hrdina doma se vrací pod kapitál
function heroSettle(faction, heroIdx) {
  const h = faction.heroes[heroIdx];
  if (!h || heroBusy(faction, heroIdx)) return false;
  if (!h.pos) {
    if (!h.zakladna) return false;
    h.zakladna = null;
    return true;
  }
  const t = G.tiles.get(h.pos);
  const naPevnosti = jeKlanovaPevnost(t) && faction.klan && t.klan === faction.klan;
  if (!t || (!naPevnosti && (t.owner !== faction.id || t.structure !== "outpost"))) return false;
  if (h.zakladna === h.pos) return false;
  h.zakladna = h.pos;
  addLog(faction.id, { klic: naPevnosti ? "kron.usazeni.pevnost" : "kron.usazeni.vyspa", param: { hrdina: heroDef(faction, heroIdx).name, rod: faction.name } });
  return true;
}

function heroPosOf(faction, heroIdx) {
  const h = faction.heroes[heroIdx];
  if (h.pos) { const t = G.tiles.get(h.pos); return { q: t.q, r: t.r }; }
  return capPosOf(faction);
}

function marchStaminaCost(faction, tile, heroIdx) {
  const base = 12 + 4 * gridDist(tile, heroPosOf(faction, heroIdx));
  const mult = Math.max(0.4, 1 - heroEff(faction, heroIdx, "stamCost") / 100);
  return Math.max(4, Math.round(base * mult));
}

// hrdina čekající na posily je „ukotven": dokud konvoj nedorazí (nebo ho
// hráč neodvolá), nesmí opustit pole — stráž ale držet může
function heroPinned(faction, heroIdx) {
  const h = faction.heroes[heroIdx];
  return !!h.pos && faction.marches.some(m => m.kind === "reinforce" && m.targetKey === h.pos);
}

function heroReady(faction, heroIdx, tile) {
  const h = faction.heroes[heroIdx];
  if (heroBusy(faction, heroIdx) || h.cooldown > 0) return false;
  if (heroPinned(faction, heroIdx)) return false; // čeká na posily
  if (tile && h.stamina < marchStaminaCost(faction, tile, heroIdx)) return false;
  return true;
}

function nextHeroCost(faction) {
  return faction.hirePool.length > 0 && faction.heroes.length < HERO_MAX
    ? HERO_HIRE_COST[faction.heroes.length] : null;
}

// výchozí sestava (v0.27): uložený preset složení armády — útočné kolo ho
// předvyplní místo automatického návrhu (ořez na zásobu řeší klient/kolo)
function setHeroPreset(faction, heroIdx, army) {
  const h = faction.heroes[heroIdx];
  if (!h) return false;
  h.preset = army && armyTotal(army) > 0
    ? armyFrom(army, v => Math.max(0, v | 0))
    : null;
  return true;
}

// nasazení hrdiny z poolu strany (v0.27) — lidská cesta k 2.–5. hrdinovi;
// zdarma, gate je odemčení na účtu (oddanost / zvací list)
function deployHero(faction, fkey, defIdx) {
  if (!HERO_DEFS[fkey] || !HERO_DEFS[fkey][defIdx]) return false;
  if (sideOfFaction(fkey) !== sideOfFaction(faction.key)) return false;
  if (faction.heroes.length >= HERO_MAX) return false;
  if (faction.heroes.some(h => (h.srcKey || faction.key) === fkey && h.defIdx === defIdx))
    return false;
  if (!faction.isAI && typeof G.canDeploy === "function"
      && !G.canDeploy(faction, fkey, defIdx)) return false;
  faction.heroes.push(makeHero(defIdx, fkey === faction.key ? null : fkey));
  if (typeof G.onHire === "function") G.onHire(faction, faction.heroes.length - 1);
  addLog(faction.id, { klic: "kron.hrdina.prichod", param: { hrdina: HERO_DEFS[fkey][defIdx].name, rod: faction.name } });
  return true;
}

// AI si dokupuje vlastní hrdiny za zlato (drží tempo sezóny); u lidí
// nahrazeno nasazováním přes deployHero
function hireHero(faction, defIdx = null) {
  const cost = nextHeroCost(faction);
  if (cost === null || faction.resources.gold < cost) return false;
  if (defIdx == null) defIdx = faction.hirePool[randInt(0, faction.hirePool.length - 1)];
  const at = faction.hirePool.indexOf(defIdx);
  if (at === -1) return false;
  // v0.9: lidský hráč najímá jen hrdiny odemčené na účtu (hook nastavuje
  // server / sólo klient); AI frakce mají všechny
  if (!faction.isAI && typeof G.canHire === "function" && !G.canHire(faction, defIdx))
    return false;
  faction.resources.gold -= cost;
  faction.hirePool.splice(at, 1);
  faction.heroes.push(makeHero(defIdx));
  // najatý hrdina si nese uložený postup z účtu (úroveň, dovednosti, výbavu)
  if (typeof G.onHire === "function") G.onHire(faction, faction.heroes.length - 1);
  addLog(faction.id, { klic: "kron.hrdina.prichod", param: { hrdina: HERO_DEFS[faction.key][defIdx].name, rod: faction.name } });
  return true;
}

// ---------- Ekonomika ----------
// výnos jednoho pole: objem podle stupně (TIER_YIELD), surovina podle t.res;
// KAŽDÉ pole k tomu generuje zlato ve výši 20 % objemu svých surovin
function tileYield(t) {
  const inc = { food: 0, wood: 0, stone: 0, iron: 0, gold: 0 };
  if (t.structure === "capital") {
    inc.food = 6; inc.wood = 3; inc.stone = 2; inc.iron = 2; inc.gold = 3; return inc;
  }
  if (t.structure === "city") {
    inc.food = 4; inc.wood = 4; inc.stone = 3; inc.iron = 3; inc.gold = 4; return inc;
  }
  if (t.structure === "throne") {
    inc.food = 8; inc.wood = 8; inc.stone = 6; inc.iron = 6; inc.gold = 10; return inc;
  }
  // keep je odměna za kraj — výnos mezi městem a Trůnem, a běží na KAŽDÉM
  // z 25 polí bloku, takže se držení kraje pozná i na ekonomice
  if (t.structure === "keep") {
    inc.food = 5; inc.wood = 5; inc.stone = 4; inc.iron = 4; inc.gold = 6; return inc;
  }
  if (t.structure === "grandfort" || t.structure === "bastion") {
    inc.stone = 3; inc.gold = 2; return inc;
  }
  // MOST NESYPE NIC (etapa 7): je to brána přes vodu, ne půda. Od chvíle, kdy
  // rod vlastní svůj přechod přes dělič kolébky od začátku sezóny, by šest
  // mostních polí navíc znamenalo tichý startovní příjem — a členové frakce
  // by na tom byli jinak než zakladatel.
  if (t.structure === "bridge") return inc;
  // KLANOVÁ PEVNOST NESYPE NIC (etapa 8) — je to shromaždiště a vysílač dosahu,
  // ne půda. Kdyby sypala, nevědělo by se komu: pole nepatří nikomu osobně.
  if (t.structure === "klanpevnost") return inc;
  if (!t.res) return inc;
  // uzly síly 300 (v0.30) mají JEDNU surovinu — objem drží úhrn dřívějšího
  // „od všeho" (4×2,5), jen soustředěný: proto ×4 pro konkrétní res na lvl 12
  const v = TIER_YIELD[t.level - 1] * (t.level === 12 && t.res !== "all" ? 4 : 1);
  if (t.res === "all") {
    for (const r of RES_KEYS) inc[r] = v;
    inc.gold = 0.2 * 4 * v;
  } else {
    inc[t.res] = v;
    inc.gold = 0.2 * v;
  }
  return inc;
}

function incomeOf(faction) {
  const inc = { food: 0, wood: 0, stone: 0, iron: 0, gold: 0 };
  // etapa 11: surová sklizeň z JEDNOHO průchodu mapou za tik; frakční
  // násobiče a bonusy se dopočítají tady, ať zůstanou per aktér
  const surova = prehledOf(faction).inc;
  for (const res in inc) inc[res] = surova[res] * (faction.incomeMult[res] || 1);
  const mainBonus = 1 + 0.1 * (faction.buildings.main - 1);
  for (const res in inc) inc[res] *= mainBonus;
  if (G.storm > 0) for (const res in inc) inc[res] *= STORM_INCOME; // popelná bouře
  // Roh hojnosti: dočasně zdvojnásobená produkce celé říše (v0.9)
  if (faction.boosts && faction.boosts.prod > 0) for (const res in inc) inc[res] *= 2;
  return inc;
}

// údržba: armáda žere jídlo (zásoba + armády hrdinů + pochodující oddíly)
// PONECHÁNO jako 0: čte ho horní lišta i AI a je jednodušší mít jedno místo,
// kde je vidět, že žold neexistuje, než ho vytrhat ze všech volajících.
function armyUpkeep() { return 0; }

// co pole vynáší za tik (pro danou frakci, včetně bonusu hlavní budovy)
function tileIncomePreview(t, faction) {
  const inc = tileYield(t);
  const mainBonus = 1 + 0.1 * (faction.buildings.main - 1);
  const boost = faction.boosts && faction.boosts.prod > 0 ? 2 : 1;
  for (const r in inc)
    inc[r] = Math.round(inc[r] * (faction.incomeMult[r] || 1) * mainBonus * boost * 10) / 10;
  return inc;
}

function canAfford(faction, cost) {
  return Object.keys(cost).every(res => faction.resources[res] >= cost[res]);
}
function pay(faction, cost) {
  for (const res in cost) faction.resources[res] -= cost[res];
}

// ---------- Budovy ----------
function unitUnlocked(faction, type) {
  if (type === "arch") return faction.buildings.barracks >= 2;
  if (type === "cav") return faction.buildings.barracks >= 3;
  // VLAJKA (T4) CHCE DVĚ PODMÍNKY (31. 8. 2026, zadání uživatele): kasárny 4
  // A HLAVNÍ BUDOVU 7. Samotné kasárny 4 se daly postavit v prvních dnech
  // sezóny a T4 tím byla k mání skoro hned; hlavní budova 7 je konec dlouhého
  // řetězu (její doby stavby se škálují délkou sezóny), takže vlajka vychází
  // na týden až dva hraní. Ověřeno, že to gate nebolí: 61/64 i bez vlajek u AI.
  if (type === "big") return faction.buildings.barracks >= 4 && faction.buildings.main >= 7;
  if (jeDruhehoRodu(type)) {
    // druhý rod půjčuje jen to, co máš odemčené i u sebe (kasárna platí stejně)
    if (!faction.druhyRod) return false;
    return unitUnlocked(faction, DRUHY_ROD_KLICE[type]);
  }
  return true;
}

// IV-O: doby stavby jsou vyjádřené jako PODÍL SEZÓNY, ne v pevných vteřinách.
// Čísla v BUILDINGS.time jsou baseline pro hodinovou sezónu (3 600 tiků) —
// při čtrnáctidenní se roztáhnou 336×, takže strom budov pokrývá celou sezónu
// místo prvních pár minut. Konvence projektu: každý nový knob škáluj vůči
// setSeasonHours (stejně jako throneHoldTicks, siegeWindowTicks, warCdTicks).
const SEZONA_BASELINE = 3600;
function buildTicks(zaklad, mod) {
  if (!zaklad) return 2;
  return Math.max(2, Math.round(zaklad * (mod || 1) * SEASON_TICKS / SEZONA_BASELINE));
}

function buildCost(faction, key) {
  if (key.startsWith("up_")) {
    const type = key.slice(3);
    const target = faction.upgrades[type] + 1;
    if (target > UPGRADE_MAX) return null;
    const um = (FACTION_MODS[faction.key] || {}).upgradeCost || 1;
    const uc = {};
    for (const res in UPGRADE_COST[target]) uc[res] = Math.round(UPGRADE_COST[target][res] * um);
    return { target, cost: uc, time: buildTicks(UPGRADE_TIME[target]) };
  }
  const target = faction.buildings[key] + 1;
  if (target > BUILDINGS[key].max) return null;
  const mody = FACTION_MODS[faction.key] || {};
  const cena = {};
  for (const res in BUILDINGS[key].cost[target])
    cena[res] = Math.round(BUILDINGS[key].cost[target][res] * (mody.buildCost || 1));
  return { target, cost: cena, time: buildTicks(BUILDINGS[key].time[target], mody.buildTime) };
}

function canBuild(faction, key) {
  if (faction.build) return { ok: false, why: "Už se staví jiná budova." };
  const info = buildCost(faction, key);
  if (!info) return { ok: false, why: "Budova je na maximální úrovni." };
  if (key.startsWith("up_")) {
    const type = key.slice(3);
    if (!unitUnlocked(faction, type))
      return { ok: false, why: "Nejdřív odemkni tento typ jednotky v kasárnách." };
    if (info.target >= 2 && faction.buildings.main < 3)
      return { ok: false, why: "Úroveň 2 vyžaduje Hlavní budovu úrovně 3." };
  } else if (key === "academy" && info.target > faction.buildings.main * 2) {
    return { ok: false, why: `Vyžaduje Hlavní budovu úrovně ${Math.ceil(info.target / 2)}.` };
  } else if (key !== "main" && key !== "academy" && info.target > faction.buildings.main) {
    return { ok: false, why: `Vyžaduje Hlavní budovu úrovně ${info.target}.` };
  }
  if (!canAfford(faction, info.cost)) return { ok: false, why: "Nedostatek surovin." };
  return { ok: true, info };
}

function startBuild(faction, key) {
  const check = canBuild(faction, key);
  if (!check.ok) return false;
  pay(faction, check.info.cost);
  faction.build = { key, ticksLeft: check.info.time, total: check.info.time };
  return true;
}

// ---------- Výcvik: doba podle OBJEMU (zadání uživatele 30. 8. 2026) ----------
// Dřív trvala každá zakázka pevných 12/10/8/6 s bez ohledu na velikost, takže
// jeden pěšák stál stejně času jako 2 781 kusů. Nově se čas počítá z BODŮ
// VELENÍ a fronta se odbavuje POSTUPNĚ (dřív tikaly všechny položky souběžně)
// — bez toho by stačilo objednávku rozdělit na tři typy a čas by se vydělil.
//
// Kalibrace: AI dosud držela dvě zakázky po 56 CP à 12 s, tedy ~9,3 CP/s.
// 0,12 s za CP dává 8,3 CP/s, takže se tempo AI (a s ním statistický gate)
// nemá o co zlomit. Pro hráče: plné velení hrdiny 1. úrovně (1 112 CP) vyjde
// na 133 s hodinové sezóny = 3,7 % její délky — a stejná 3,7 % i na
// čtrnáctidenní, protože se to jako doby stavby škáluje délkou sezóny.
const VYCVIK_SEK_ZA_CP = 0.12;

// násobek kasáren drží původní progresi 12/10/8/6 s (úrovně 1–4)
function vycvikKasarny(faction) {
  return (12 - 2 * ((faction.buildings.barracks || 1) - 1)) / 12;
}

// doba výcviku JEDNÉ položky fronty: count kusů daného typu, v ticích.
// trainMult velkých jednotek zůstává navrch nad jejich CP — vlajka je i po
// přepočtu na velení dvakrát dražší na čas než totéž velení v pěchotě (IV-M:
// „schopnost musí něco stát").
function recruitTicks(faction, type, count = 1) {
  const kus = (type && uDef(faction, type)) || null;
  const cp = (kus ? kus.cp : 1) * Math.max(1, Math.floor(count) || 1);
  const mody = FACTION_MODS[faction.key] || {};
  const sek = cp * VYCVIK_SEK_ZA_CP * vycvikKasarny(faction)
    * (mody.trainTime || 1) * ((kus && kus.trainMult) || 1);
  return Math.max(2, Math.round(sek * SEASON_TICKS / SEZONA_BASELINE));
}

// batches: kolik dávek po RECRUIT_BATCH naráz (Shift+klik = 10 dávek = 100
// jednotek); platí se vše předem a cvičí se souběžně jako jedna zakázka
function startRecruit(faction, type, batches = 1) {
  batches = Math.max(1, Math.min(10, batches | 0));
  if (!unitUnlocked(faction, type)) return false;
  const one = uDef(faction, type).cost;
  const cost = {};
  for (const res in one) cost[res] = one[res] * batches;
  if (!canAfford(faction, cost)) return false;
  pay(faction, cost);
  const kusu = RECRUIT_BATCH * batches;
  const doba = recruitTicks(faction, type, kusu);
  faction.recruitQueue.push({ type, ticksLeft: doba, total: doba, count: kusu });
  return true;
}

// ---------- verbovací zakázka (panel Výcvik) ----------
// Panel skládá výcvik jako armádu: jezdíkem se u každého typu nastaví POČET
// KUSŮ, ceny se sečtou a platí se jednou. Ceny v UNIT_TYPES jsou za dávku
// RECRUIT_BATCH, takže se dělí a zaokrouhlují nahoru (za 1 kus se nikdy
// neplatí míň, než kolik vychází z dávkové ceny).
const RECRUIT_MAX_ORDER = 2781;    // strop na typ a zakázku (šířka jezdíku)

function armyCp(army, f) {
  let cp = 0;
  for (const k of UNIT_KEYS) cp += (army[k] || 0) * uDef(f, k).cp;
  return cp;
}

// očistí objednávku na celá čísla v povoleném rozsahu a jen odemčené typy
function cleanRecruitOrder(faction, order) {
  const clean = {};
  for (const k of UNIT_KEYS) {
    const n = Math.floor(Number((order || {})[k]) || 0);
    if (n <= 0 || !unitUnlocked(faction, k)) continue;
    clean[k] = Math.min(RECRUIT_MAX_ORDER, n);
  }
  return clean;
}

function recruitOrderCost(faction, order) {
  const clean = cleanRecruitOrder(faction, order);
  const cost = {};
  for (const k in clean) {
    const one = uDef(faction, k).cost;
    for (const res in one)
      cost[res] = (cost[res] || 0) + Math.ceil(one[res] * clean[k] / RECRUIT_BATCH);
  }
  return cost;
}

function startRecruitOrder(faction, order) {
  const clean = cleanRecruitOrder(faction, order);
  let total = 0;
  for (const k in clean) total += clean[k];
  if (!total) return false;
  const cost = recruitOrderCost(faction, clean);
  if (!canAfford(faction, cost)) return false;
  pay(faction, cost);
  for (const k in clean) {
    const doba = recruitTicks(faction, k, clean[k]);
    faction.recruitQueue.push({ type: k, ticksLeft: doba, total: doba, count: clean[k] });
  }
  return true;
}

// Zrušení zakázky ve frontě. Doba teď roste s objemem, takže omyl s jezdíkem
// (max je přes 1 800 kusů) umí zablokovat kasárny na půl hodiny — bez možnosti
// couvnout by to byla past, kterou si hráč sám vyrobí jedním tažením myší.
// Vrací se POMĚRNÁ část ceny podle nevycvičeného zbytku: co se stihlo, propadá.
function cancelRecruit(faction, index) {
  const i = Math.floor(Number(index));
  const fronta = faction.recruitQueue || [];
  const rq = fronta[i];
  if (!rq) return false;
  const total = rq.total || recruitTicks(faction, rq.type, rq.count) || 1;
  const podil = Math.max(0, Math.min(1, (rq.ticksLeft || 0) / total));
  const cost = recruitOrderCost(faction, { [rq.type]: rq.count });
  for (const res in cost) faction.resources[res] += Math.floor(cost[res] * podil);
  fronta.splice(i, 1);
  return true;
}

// Celková doba zakázky. Fronta jede postupně, takže se položky SČÍTAJÍ — a UI
// tohle musí ukázat DŘÍV, než hráč objednávku potvrdí (zadání uživatele).
function recruitOrderTicks(faction, order) {
  const clean = cleanRecruitOrder(faction, order);
  let t = 0;
  for (const k in clean) t += recruitTicks(faction, k, clean[k]);
  return t;
}

// za jak dlouho bude prázdná celá fronta (včetně rozcvičené první položky)
function recruitQueueTicks(faction) {
  return (faction.recruitQueue || []).reduce((a, rq) => a + Math.max(0, rq.ticksLeft || 0), 0);
}

// kolik kusů daného typu si frakce může dovolit, kdyby verbovala jen ten
function recruitAffordable(faction, type) {
  const one = uDef(faction, type).cost;
  let max = RECRUIT_MAX_ORDER;
  for (const res in one) {
    if (!one[res]) continue;
    max = Math.min(max, Math.floor((faction.resources[res] || 0) * RECRUIT_BATCH / one[res]));
  }
  return Math.max(0, max);
}

// ---------- Odebrání pole (v0.39) ----------
// Držená pole se počítají do stropu území, takže hráč potřebuje způsob, jak
// se nepotřebného pole zbavit. Odebrání není okamžité: pole se vyklízí
// ABANDON_TICKS (5 minut reálného času — je to pojistka proti překlikům
// a proti žonglování se stropem, ne herní rytmus, takže se NEškáluje délkou
// sezóny). Po vypršení pole zneutrálne i s obnovenou posádkou.
const ABANDON_TICKS = 300;
// Co odebrat NELZE: kapitál (sídlo), pole s vlastním hrdinou nebo výspou
// (nejdřív ať hráč hrdinu odvolá / výspa padá s polem) a cizí pole.
function canAbandonTile(faction, tile) {
  const a = bigAnchor(tile);
  if (!a || !patriClenu(faction, a)) return false;
  if (a.structure === "capital" || keyOf(a.q, a.r) === capKeyOf(faction)) return false;
  if (a.structure === "outpost") return false;
  for (const t of blockTiles(a)) {
    const k = keyOf(t.q, t.r);
    if (faction.heroes.some(h => h.pos === k)) return false;
    if (faction.marches.some(m => m.targetKey === k)) return false;
  }
  return true;
}
function abandonTile(faction, tile) {
  const a = bigAnchor(tile);
  if (!canAbandonTile(faction, a)) return false;
  if (a.abandon > 0) return false;              // už se vyklízí
  a.abandon = ABANDON_TICKS;
  ozivPole(a);
  addLog(faction.id, { klic: "kron.vyklizeni", param: { rod: faction.name, pole: tileKlic(a), min: Math.round(ABANDON_TICKS / 60) } });
  return true;
}
function cancelAbandon(faction, tile) {
  const a = bigAnchor(tile);
  if (!a || !patriClenu(faction, a) || !(a.abandon > 0)) return false;
  delete a.abandon;
  return true;
}
// dokončení: pole (celý blok) zneutrálne a posádka se obnoví, aby se dalo
// znovu dobýt jako každé jiné neutrální pole
function finishAbandon(tile) {
  const fid = tile.owner;
  delete tile.abandon;
  setTileOwner(tile, -1);
  for (const t of blockTiles(tile)) {
    delete t.abandon;
    if (t.outpost) { delete t.outpost; if (t.structure === "outpost") { delete t.structure; zrusVyspy(); } }
  }
  // posádka jako u čerstvě vygenerovaného pole (blok 2×2 brání dvojnásobek)
  tile.garrison = tile.structure && tile.structure !== "outpost"
    ? STRUCTURES[tile.structure].militia
    : LEVEL_GARRISON[tile.level] * (tile.bigSize === 2 ? 2 : 1);
  if (fid >= 0 && G.factions[fid])
    addLog(fid, { klic: "kron.opusteno", param: { rod: G.factions[fid].name, pole: tileKlic(tile) } });
}

// ---------- Výspa (outpost) ----------
// obranná stavba za kámen: posádka až 2000 jednotek drží NEUSTÁLOU stráž
// nad polem i sousedy; jednotky se přesouvají mezi výspou a zásobou volně
function buildOutpost(faction, tile) {
  if (!patriClenu(faction, tile) || tile.structure || tile.big || tile.bigSize) return false;
  if (!TERRAIN[tile.terrain].passable || tile.terrain === "bridge") return false;
  if (!canAfford(faction, OUTPOST_COST)) return false;
  pay(faction, OUTPOST_COST);
  tile.structure = "outpost";
  tile.outpost = emptyArmy();
  zrusVyspy();
  ozivPole(tile);
  addLog(faction.id, { klic: "kron.vyspa", param: { rod: faction.name, pole: tileKlic(tile) } });
  return true;
}

function outpostDeposit(faction, tile, army) {
  if (!patriClenu(faction, tile) || tile.structure !== "outpost" || !tile.outpost) return false;
  if (!army) return false;
  army = armyFrom(army, Math.floor);
  if (armyTotal(army) <= 0) return false;
  for (const k of UNIT_KEYS) if (army[k] < 0 || army[k] > faction.units[k]) return false;
  if (armyTotal(tile.outpost) + armyTotal(army) > OUTPOST_CAP) return false;
  if (!lzeSestavit(armyAdd(armyClone(tile.outpost), army))) return false;   // tři formace
  for (const k of UNIT_KEYS) { faction.units[k] -= army[k]; tile.outpost[k] += army[k]; }
  ozivPole(tile);
  return true;
}

function outpostWithdraw(faction, tile) {
  if (!patriClenu(faction, tile) || tile.structure !== "outpost" || !tile.outpost) return false;
  armyAdd(faction.units, tile.outpost);
  tile.outpost = emptyArmy();
  return true;
}

// velké pevnosti vnějšího prstence: každá držená dává celé frakci +10 % útoku
function grandfortMult(faction) {
  let n = 0;
  for (const t of G.tiles.values())
    if (t.owner === faction.id && t.structure === "grandfort") n++;
  return 1 + 0.10 * n;
}

// Nemocnice: uzdravuje RANĚNÉ, ne padlé. Ze ztrát je LOSS_DEAD dílu mrtvých
// (ti se nevrátí nikdy) a zbytek ranění — z nich se vrací HOSPITAL_HEAL.
// Čísla jsou nastavená tak, aby výsledný podíl zůstal jako dřív (15/20/25 %
// ze ztrát), jen je teď vyjádřený správně: jako podíl z těch, kdo přežili.
function applyHospital(faction, lostArmy) {
  const heal = HOSPITAL_HEAL[faction.buildings.hospital];
  if (heal <= 0) return;
  for (const k of UNIT_KEYS)
    faction.units[k] += Math.floor(lostArmy[k] * (1 - LOSS_DEAD) * heal);
}

// ---------- Obrana pole ----------
// IV-M: hrdina se počítá do obranného stohu, JEN když opravdu něco veze.
// Prázdný batoh byl do etapy 6 nejlevnější zeď ve hře — hrdina bez jednotek
// dal poli své staty velitele, první úder i holdDef zadarmo. Práh je v CP,
// takže 100 pěšáků a 50 sarnských jezdců (2 CP/kus) váží stejně.
const OBRANA_MIN_CP = 100;
function braniStoh(a, h) { return armyCp(h.army, a) >= OBRANA_MIN_CP; }

function tileDefComponents(tile) {
  const stormMult = G.storm > 0 ? STORM_DEF : 1; // v bouři se obránci zakopou
  if (tile.owner === -1) {
    // potulná banda posiluje neutrální posádku
    const ev = mapEventAt(keyOf(tile.q, tile.r));
    const g = tile.garrison * (ev && ev.type === "banda" ? 1.6 : 1);
    return { army: balancedArmy(g), mult: stormMult, contributors: [] };
  }
  let militia = tile.level * 3;
  if (tile.structure) militia += STRUCTURES[tile.structure].militia;
  if (tile.okno > 0 && jeVelkaStavba(tile)) militia = 0; // posádka pobita — běží obléhací okno
  const army = balancedArmy(militia * SOLDIER_POWER);
  const owner = G.factions[tile.owner];
  const key = keyOf(tile.q, tile.r);
  const contributors = []; // hrdinové, jejichž armády tu bojují (nesou skutečné ztráty)
  const obranci = [];      // hrdinové STOJÍCÍ na poli, v pořadí příchodu (IV-L)
  const outposts = [];     // výspy, jejichž posádky tu bojují (nesou skutečné ztráty)
  let holdMult = 1; // obranné dovednosti hrdiny stojícího na poli
  // v0.32: pole brání hrdinové VŠECH členů frakce (spolubojovníci na poli
  // i na stráži vedle) — contributors nesou konkrétního aktéra
  for (const a of vsichniClenove(owner)) {
    // etapa 8: vyvrhel není bráněn spoluhráči a sám je nebrání; klanovou
    // pevnost brání jen její klan
    if (!braniPole(a, tile)) continue;
    for (let i = 0; i < a.heroes.length; i++) {
      const h = a.heroes[i];
      if (!braniStoh(a, h)) continue;   // prázdný batoh nebrání (IV-M)
      if (h.pos === key) {
        armyAdd(army, h.army);
        holdMult = Math.max(holdMult, heroStats(a, i).holdDef);
        contributors.push({ faction: a, idx: i });
        obranci.push({ faction: a, idx: i, prisel: h.prisel || 0 });
      }
      // hrdina na stráži brání i sousední vlastní pole
      else if (h.guard && h.pos && gridDist(G.tiles.get(h.pos), tile) === 1) {
        armyAdd(army, h.army);
        contributors.push({ faction: a, idx: i });
      }
    }
  }
  // výspa: posádka brání vlastní pole a drží NEUSTÁLOU stráž nad sousedy
  if (tile.structure === "outpost" && tile.outpost) {
    armyAdd(army, tile.outpost);
    outposts.push(tile);
  }
  const drz = drzitelPole(tile);
  for (const n of neighborsOf(tile)) {
    if (n.owner === tile.owner && n.structure === "outpost" && n.outpost
        && armyTotal(n.outpost) > 0
        && (n.klan ? n.klan === tile.klan : poutaSdili(drzitelPole(n), drz))) {
      armyAdd(army, n.outpost);
      outposts.push(n);
    }
  }
  // hlavní město brání i všechny nenasazené jednotky ze zásoby — město patří
  // KONKRÉTNÍMU aktérovi (zakladatel či člen), brání ho jeho zásoba (v0.32)
  let homeFaction = null;
  for (const a of vsichniClenove(owner)) {
    if (a.capKey !== key) continue;
    armyAdd(army, a.units);
    homeFaction = a;
    break;
  }
  const structDef = { fortress: 1.4, grandfort: 1.5, bastion: 1.3, outpost: 1.3 }[tile.structure] || 1;
  return { army, mult: TERRAIN[tile.terrain].defBonus * holdMult * stormMult * structDef,
    contributors, outposts, homeFaction,
    // IV-L: stoh se brání ŘETĚZEM bitev — útok porazí vždy jen jednu armádu.
    // Vlna je obránce, který je na řadě (nejdéle stojící); poslední z nich
    // bojuje spolu s posádkou pole a teprve jeho porážka pole vydá.
    obranci: obranci.sort((x, y) => x.prisel - y.prisel || x.idx - y.idx) };
}

function tileDefense(tile) {
  tile = bigAnchor(tile);
  const c = tileDefComponents(tile);
  return Math.round(armyPower(c.army, null, c.mult));
}

// ---------- Neutrální velitelé (v0.13) ----------
// Každé neutrální pole brání vlastní velitel se svou posádkou. Úroveň roste
// s jmenovkou síly pole (⚔1 → 1, ⚔300 a víc → 50), jméno a rys se losují
// DETERMINISTICKY z pozice pole — server i všichni klienti musí dostat totéž,
// takže tu nesmí být rng ani Math.random. Neutrálové nemají výbavu, hvězdy
// ani dovednosti; mystický rys je vynechaný schválně (kouzla obcházejí obranu
// a na slabých polích by útočníky mazala).
const NEUTRAL_MAX_LEVEL = 50;
const NEUTRAL_TOP_LABEL = 300;   // od téhle jmenovky výš je velitel na maximu
// Ladicí koeficient: 1 = plná křivka (⚔300 → úroveň 50), 0.5 = poloviční
// úrovně, 0 = všude úroveň 1 (chování před v0.13). Škáluje rovnou úroveň,
// takže zobrazené číslo vždy odpovídá skutečné síle velitele.
const NEUTRAL_POWER = 1;

const NEUTRAL_COMMANDERS = [
  { name: "Kapitán domobrany",  trait: "shield" },
  { name: "Setník staré gardy", trait: "attack" },
  { name: "Vůdce zbojníků",     trait: "swift" },
  { name: "Strážce brodu",      trait: "shield" },
  { name: "Žoldnéřský harcovník", trait: "attack" },
  { name: "Vysloužilý desátník", trait: "tireless" },
  { name: "Pán tvrze",          trait: "warlord" },
  { name: "Hraniční hlídač",    trait: "swift" },
  { name: "Zbrojnoš z Popela",  trait: "tireless" },
  { name: "Velitel posádky",    trait: "warlord" },
  { name: "Ostřílený nájemník", trait: "attack" },
  { name: "Štítonoš průsmyku",  trait: "shield" },
];

// jmenovka síly pole = ⚔ číslo, které vidí hráč na mapě
function tileStrengthLabel(tile) {
  tile = bigAnchor(tile);
  if (tile.structure === "grandfort") return 500;
  if (tile.structure === "keep") return 500;      // keep kraje je T3 objektiv
  if (tile.structure === "bastion") return 300;
  if (tile.structure) return struktMilice(tile);
  return tierOf(tile);
}

function neutralHeroLevel(label) {
  const t = (label - TIERS[0]) / (NEUTRAL_TOP_LABEL - TIERS[0]);
  return Math.max(1, Math.min(NEUTRAL_MAX_LEVEL,
    Math.round(1 + Math.max(0, Math.min(1, t)) * (NEUTRAL_MAX_LEVEL - 1))));
}

// kolik jednotek by velitel dané úrovně uvedl. U běžných polí posádka tenhle
// strop nepřekračuje; klíčové stavby (Trůnní město 1200) ho záměrně přerůstají —
// brání je celá posádka města, ne polní armáda jednoho velitele.
function neutralHeroCap(level, trait) {
  return HERO_CAP_BASE + HERO_CAP_PER_LEVEL * (level - 1)
    + ((HERO_TRAITS[trait] || {}).cap || 0);
}

// velitel konkrétního pole — vždy stejný pro stejné souřadnice
// (salt > 0 = jiný velitel téhož pole: druhá armáda uzlu 2×2, v0.30)
// ---------- POŘADÍ OBRÁNCŮ (IV-M) ----------
// Hrdina si pamatuje, KDY na pole dorazil. Obranu stohu vede ten, kdo tam
// stojí NEJDÉLE — posily poslané během boje jsou záloha za linií, ne nový
// velitel. (Vlastní sekvenční boj „jedna bitva = jeden obránce" je IV-L
// a patří do etapy 7 spolu se stohováním a rally obrazovkou.)
function postavHrdinu(h, key) {
  if (h.pos !== key) h.prisel = key ? G.tick : 0;
  h.pos = key;
}

// Neutrální objektiv se brání OD NEJSLABŠÍHO: obtížnost roste a poslední
// bitva je boss (čistá PvE křivka). První vlna je menší I hůř vedená.
const NEUTRAL_VLNY = [0.4, 0.6];
function neutralSila(nc) {
  return nc.dmg * 2 + nc.atk * 5 + nc.def * 4 + nc.hp * 0.1 + (nc.spell || 0) * 3;
}
// salty velitelů seřazené od nejslabšího po nejsilnějšího
function neutralPoradi(tile, kolik) {
  const s = [];
  for (let i = 0; i < kolik; i++) s.push(i);
  return s.sort((a, b) =>
    neutralSila(neutralCommander(tile, a)) - neutralSila(neutralCommander(tile, b)));
}

// ---------- NEUTRÁLNÍ OBRÁNCE JE HRDINA (IV-L) ----------
// Do etapy 7 bránil pole anonymní velitel bez výbavy, hvězd i dovedností.
// Nově má TIER podle síly pole a k němu odpovídající výstroj — pole tím
// přestává být hromada mužů a stává se z něj protivník s profilem.
//
//   pole do jmenovky 200 → T1 (kvalitní zpracování)
//   pole 200+            → T2 (epická relikvie)
//   stavby a přechody    → T3 (legendární dědictví)
//
// ⚠ VELIKOST ARMÁDY se tím ZATÍM nemění. Plán říká „vybavené jednotkami AŽ DO
// svého stropu velení" a tabulka počtů armád v IV-K je jen pro šest OBJEKTIVŮ
// (keepy, grandforty, Trůn). Kdyby plný strop dostalo každé pole, bránilo by
// i to nejslabší 1 112 CP — přesně tolik, kolik uveze startovní hrdina, takže
// první pole ve hře by byla mince. Plné stropy přijdou s keepy.
const NEUTRAL_TIER_RARITA = [1, 3, 4];
// Jak silná je výstroj neutrálů. KALIBROVÁNO PROTI SIM GATE, ne odhadem:
//   plná (1,0) → 84 %  ·  0,6 → 94 % (1 porušení)  ·  0,5 → 95 % ✅  ·  bez → 97 %
// Plná výbava zvedla obtížnost polí ~1,5× a AI to neustála. Na 0,5 má
// neutrální obránce pořád skutečnou výstroj a gate prochází i po seedech.
let NEUTRAL_VYBAVA_SILA = 0.5;
function setNeutralVybavaSila(v) { NEUTRAL_VYBAVA_SILA = v; }
function neutralTier(tile) {
  const s = tile && tile.structure;
  if (s === "throne" || s === "grandfort" || s === "fortress" || s === "bastion"
      || s === "bridge" || s === "capital" || s === "city" || s === "keep") return 2;
  return tileStrengthLabel(tile) >= 200 ? 1 : 0;
}
// Výstroj se NELOSUJE. makeItem jede na globálním rng a pořadí volání by
// rozhoupalo zobrazenou obranu pole mezi překresleními — hodnoty se proto
// počítají deterministicky z otisku pole, takže totéž pole má vždy tutéž.
function neutralVybava(tile, level, salt = 0) {
  const tier = neutralTier(tile);
  const rar = RARITIES[NEUTRAL_TIER_RARITA[tier]];
  const bonus = {};
  let h = (Math.imul(tile.q, 0x9e3779b1) ^ Math.imul(tile.r, 0x85ebca6b)
    ^ Math.imul(salt + 1, 0xc2b2ae35)) >>> 0;
  for (const sl of ITEM_SLOT_KEYS) {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    const kolisani = 0.85 + ((h % 1000) / 1000) * 0.25;
    const d = ITEM_SLOTS[sl];
    const v = Math.max(1, Math.round(
      d.base * rar.mult * (kolisani + 0.025 * level) * NEUTRAL_VYBAVA_SILA));
    bonus[d.stat] = (bonus[d.stat] || 0) + v;
  }
  return { tier, bonus };
}

function neutralCommander(tile, salt = 0) {
  const label = tileStrengthLabel(tile);
  // v0.40: oba břehy mostu drží velitelé PEVNÉ úrovně BRIDGE_LEVEL (35) —
  // přechod přes řeku má být stejně tvrdý bez ohledu na to, kde leží
  const level = tile.structure === "bridge"
    ? (jeKolebkovyMost(tile) ? KOLEBKA_MOST_LEVEL : BRIDGE_LEVEL)
    : neutralHeroLevel(label);
  // murmur3 fmix32 — obyčejné násobení by u velkých čísel ztratilo přesnost
  // a nízké bity by se špatně promíchaly (část velitelů by nikdy nepadla)
  let hsh = (Math.imul(tile.q, 73856093) ^ Math.imul(tile.r, 19349663)
    ^ (salt ? Math.imul(salt, 83492791) >>> 0 : 0)) >>> 0;
  hsh = Math.imul(hsh ^ (hsh >>> 16), 2246822507) >>> 0;
  hsh = Math.imul(hsh ^ (hsh >>> 13), 3266489909) >>> 0;
  hsh = (hsh ^ (hsh >>> 16)) >>> 0;
  const def = NEUTRAL_COMMANDERS[hsh % NEUTRAL_COMMANDERS.length];
  const tr = HERO_TRAITS[def.trait] || {};
  const lv = Math.max(1, Math.round(1 + (level - 1) * NEUTRAL_POWER));
  const vyb = neutralVybava(tile, lv, salt);
  return {
    name: def.name, trait: def.trait, level: lv, tier: vyb.tier,
    hp: Math.round(HERO_HP_BASE + HERO_HP_PER_LEVEL * (lv - 1) + (tr.hp || 0) + (vyb.bonus.hp || 0)),
    atk: HERO_ATK_BASE + HERO_ATK_PER_LEVEL * (lv - 1) + (tr.atk || 0) + (vyb.bonus.atk || 0),
    def: HERO_DEF_BASE + HERO_DEF_PER_LEVEL * (lv - 1) + (tr.def || 0) + (vyb.bonus.def || 0),
    dmg: Math.round(HERO_DMG_BASE + HERO_DMG_PER_LEVEL * (lv - 1) + (tr.dmg || 0) + (vyb.bonus.dmg || 0)),
    // rychlost domobrany: útočník útočí první, pokud nemá velitel rys rychlosti
    speed: MILITIA_SPEED + (tr.speed || 0) + (vyb.bonus.speed || 0),
    // kouzla nese helma — i neutrální mystik teď něco umí
    spell: vyb.bonus.spell || 0,
    ward: 0,                      // bez hvězd a dovedností: ty patří hráči
    cap: neutralHeroCap(level, def.trait),
  };
}

function isAdjacentToFaction(faction, tile) {
  // v0.41: hrany I rohy (sousediZaboru) — hráč i AI expandují do osmi směrů
  // etapa 8: jeMoje místo owner === id — vyvrhel s rodem hranici NESDÍLÍ
  // (ani jedním směrem), klanová pevnost naopak hranici rodu posouvá
  for (const m of blockTiles(bigAnchor(tile)))
    if (sousediZaboru(m).some(n => jeMoje(faction, n) && bridgeVede(faction, n))) return true;
  return false;
}
// feature flag BRIDGE_BOTH_ENDS: vlastněný most „vodí" sousedství přes řeku,
// jen když frakce drží průchozí pole na OBOU březích (jinak se přes něj nedá
// expandovat). Vypnuto — může škrtit hru; zapíná se jedním přepínačem.
function bridgeVede(faction, n) {
  if (!BRIDGE_BOTH_ENDS || n.terrain !== "bridge") return true;
  const smer = n.riv || (Math.abs(n.q) === Math.abs(n.r)
    ? (Math.sign(n.q) === Math.sign(n.r) ? "b" : "a")
    : (n.r === 0 ? "c" : "d"));
  const strana = t => smer === "a" ? Math.sign(t.q + t.r) : smer === "b" ? Math.sign(t.q - t.r)
    : smer === "c" ? Math.sign(t.r) : Math.sign(t.q);
  let plus = false, minus = false;
  for (const so of neighborsOf(n)) {
    if (so.owner !== faction.id || !TERRAIN[so.terrain].passable) continue;
    const zn = strana(so);
    if (zn > 0) plus = true; else if (zn < 0) minus = true;
  }
  return plus && minus;
}

// ---------- Pochody ----------
// rychlost armády podle složení: lučištníci základ 1×, jízda o 30 % rychleji,
// pěchota o 20 % pomaleji; smíšená armáda jde váženým průměrem podílů
const UNIT_SPEED = { inf: 0.8, arch: 1.0, cav: 1.3, big: 0.5 };

function armyTimeMult(army, f) {
  const total = armyTotal(army);
  if (total <= 0) return 1;
  let speed = 0;
  for (const k of UNIT_KEYS) speed += ((army[k] || 0) / total) * (uDef(f, k).speed || UNIT_SPEED[k]);
  return 1 / speed;
}

// žold za výpravu: útok na cizí pole stojí zlato podle velikosti armády;
// přesun po vlastním území je zdarma
// ZRUŠENO NA ZADÁNÍ UŽIVATELE (30. 8. 2026): pochod nestojí zlato.
// Zlato zůstává na stavby, vylepšení a denní obchod.
const MARCH_GOLD_PER_UNIT = 0;

function marchGoldCost(faction, tile, army) {
  if (tile.owner === faction.id) return 0;
  return Math.ceil(armyTotal(army) * MARCH_GOLD_PER_UNIT);
}

function marchTime(faction, tile, heroIdx) {
  const from = heroIdx != null ? heroPosOf(faction, heroIdx) : capPosOf(faction);
  return Math.max(MARCH_TICKS, Math.round(MARCH_TICKS * gridDist(tile, from)));
}
function travelTicks(fromTile, toPos, perHex = MARCH_TICKS) {
  return Math.max(Math.round(perHex), Math.round(perHex * gridDist(fromTile, toPos)));
}

// obnova po VYHRANÉ bitvě: Polní lazaret, Kostěné řady vhorrenů a kořist
// hordy vracejí část ztrát do armády (mutuje sim.attLosses/sim.remA, píše do
// report.post) a zbytek ztrát projde špitálem. Sdílí ji hlavní výhra
// v resolveMarch i první bitva uzlu 2×2 (v0.30) — NEduplikovat.
function poVitezneObnove(faction, stats, sim, report) {
  const losses = sim.attLosses;
  const survivors = sim.remA;
  // Polní lazaret: část padlých se hned vrací do armády hrdiny
  if (stats.heal > 0) {
    let healed = 0;
    for (const k of UNIT_KEYS) {
      const back = Math.floor(losses[k] * stats.heal);
      losses[k] -= back;
      survivors[k] += back;
      healed += back;
    }
    if (healed > 0) report.post.push({ s: "a", klic: "rep.lazaret", param: { pocet: healed } });
  }
  // Kostěné řady: po vyhrané bitvě vstává čtvrtina vlastních PADLÝCH
  if (faction.key === "vhorren") {
    let vstalo = 0;
    for (const k of UNIT_KEYS) {
      const back = Math.floor(losses[k] * LOSS_DEAD * 0.25);
      losses[k] -= back;
      survivors[k] += back;
      vstalo += back;
    }
    if (vstalo > 0) report.post.push({ klic: "rep.kostene", param: { pocet: vstalo } });
  }
  // horda: kořist ze zabitých nepřátel
  if (faction.key === "horda" && sim.defKilled > 0) {
    const zlato = Math.round(sim.defKilled * FACTION_MODS.horda.goldLoot);
    if (zlato > 0) {
      faction.resources.gold += zlato;
      report.post.push({ klic: "rep.korist.padlych", param: { zlato } });
    }
  }
  applyHospital(faction, losses);
  return { losses, survivors };
}

// returnAfter: nájezd „udeř a vrať se" — po vítězství hrdina pole nedrží,
// ale obrátí se a pochoduje zpět na pole, odkud útok vyšel
function startMarch(faction, tile, army, heroIdx, returnAfter = false) {
  tile = bigAnchor(tile);   // útok na kterékoli pole bloku = útok na kotvu
  // cílem smí být i vlastní pole (přesun hrdiny k obraně) — kromě hlavního
  // města (návrat řeší odvolání) a pole, na kterém už hrdina stojí
  const own = jeMoje(faction, tile);   // etapa 8: pole vyvrhela už není „vlastní"
  if (own && tile.structure === "capital") return false;
  if (!TERRAIN[tile.terrain].passable) return false;
  if (!own && !isAdjacentToFaction(faction, tile)) return false;
  // Trůnní město je do půlky sezóny pod ochranou příměří
  if (tile.structure === "throne" && !G.throneOpen) return false;
  // svět se otevírá po fázích — do zamčené zóny se neútočí (v0.30)
  if (!own && !zonaOtevrena(faction, tile)) return false;
  // ETAPA 7 (IV-K): cizí KOLÉBKA je nedotknutelná v každé fázi a napořád.
  // Je to tvrdý zámek, ne fázový: rod se nedá vyhnat z domova.
  if (!own && jeCiziKolebka(faction, tile)) return false;
  // uzel po odraženém zátahu je na čas uzavřen (obě armády se obnovují)
  if (!own && dveArmady(tile) && tile.uzelCd > 0) return false;
  // strop území (v0.31, OPRAVA v0.32): zábor nad strop nejde — i nájezd
  // pole DOBÝVÁ (jen hrdina nezůstává), takže výjimku má jen Trůn; ventil
  // agrese na stropu přinese Plunder (PLAN II-C2). Rozlétnuté pochody mohou
  // strop o kousek přestřelit — vlastnost, gate hlídá VYSLÁNÍ
  // ETAPA 7: BRÁNY se do stropu nezapočítávají stejně jako Trůn. Kolébka má
  // 405 polí, ale strop je 80–216 — bez výjimky si rod vyplní strop lacinou
  // domácí půdou a na svůj JEDINÝ přechod ven mu místo nezbyde. Změřeno:
  // všech osm AI zůstalo v kolébce, nikdo nevzal most, gate 0/64.
  if (!own && tile.structure !== "throne" && tile.structure !== "bridge"
      && pocetPoli(faction) + blockTiles(tile).length > stropPoli(faction)) return false;
  // pakt o neútočení blokuje útoky oběma směrům
  // diplomacie je FRAKČNÍ — člen čte pakty a války své frakce (v0.32)
  if (tile.owner !== -1 && !own && hasPact(frakceOf(faction), G.factions[tile.owner])) return false;
  if (!own && tile.structure === "capital" && tile.owner !== -1
      && !jeValka(frakceOf(faction), tile.owner)) return false; // na kapitál jen s vyhlášenou válkou
  if (heroIdx == null || !faction.heroes[heroIdx]) return false;
  if (!heroReady(faction, heroIdx, tile)) return false;
  const hero = faction.heroes[heroIdx];
  if (hero.pos === keyOf(tile.q, tile.r)) return false;
  // IV-B: do klanové pevnosti se vejde JEDEN HRDINA ZA ČLENA klanu — je to
  // shromaždiště před úderem, ne bezedný pytel
  if (jeKlanovaPevnost(tile)) {
    const k = klanPodleId(tile.klan);
    if (!k || (faction.klan || 0) !== k.id) return false;
    if (hrdinuNaPoli(keyOf(tile.q, tile.r)) >= pevnostKapacita(k)) return false;
  }
  if (!own && !vDosahu(faction, hero, tile)) return false; // mimo dosah domovské základny
  const fromKey = hero.pos ?? capKeyOf(faction);
  if (hero.pos) {
    // hrdina v poli útočí s celou svou armádou
    army = armyClone(hero.army);
    if (armyTotal(army) <= 0) return false;
  } else {
    if (!army) return false;
    army = armyFrom(army, Math.floor);
    if (armyTotal(army) <= 0) return false;
    if (armyCp(army, faction) > heroArmyCap(faction, heroIdx)) return false; // limit velení (CP)
    if (!lzeSestavit(army)) return false;   // tři formace (etapa 6)
    for (const k of UNIT_KEYS) {
      if (army[k] < 0 || army[k] > faction.units[k]) return false;
    }
  }
  const goldCost = marchGoldCost(faction, tile, army);
  if (faction.resources.gold < goldCost) return false;
  faction.resources.gold -= goldCost;
  if (hero.pos) hero.army = emptyArmy();
  else for (const k of UNIT_KEYS) faction.units[k] -= army[k];
  hero.stamina -= marchStaminaCost(faction, tile, heroIdx);
  const stats = heroStats(faction, heroIdx);
  const total = Math.max(2, Math.round(
    marchTime(faction, tile, heroIdx) * stats.time * armyTimeMult(army, faction)));
  postavHrdinu(hero, null); // hrdina je na cestě
  hero.guard = false;
  hero.rozkaz = null; // ruční vyslání nahrazuje čekající rozkaz
  faction.marches.push({ kind: "attack", fromKey, targetKey: keyOf(tile.q, tile.r),
    army, ticksLeft: total, total, heroIdx, returnAfter: !!returnAfter });
  return true;
}

// posily: konvoj z hlavního města k hrdinovi v poli (nevede ho hrdina, nemůže útočit)
function startReinforce(faction, tile, army) {
  if (!army) return false;
  army = armyFrom(army, Math.floor);
  if (armyTotal(army) <= 0) return false;
  for (const k of UNIT_KEYS) {
    if (army[k] < 0 || army[k] > faction.units[k]) return false;
  }
  if (tile.owner !== faction.id) return false;
  const key = keyOf(tile.q, tile.r);
  if (!faction.heroes.some(h => h.pos === key)) return false;
  const capIdx = faction.heroes.findIndex(h => h.pos === key);
  // limit velení: armáda hrdiny + konvoje na cestě + tyto posily
  if (heroArmyCommitted(faction, capIdx) + armyCp(army, faction) > heroArmyCap(faction, capIdx))
    return false;
  // tři formace: konvoj se hrdinovi po dojezdu SLIJE do armády, takže se
  // nepočítá sám o sobě, ale i s tím, co už veze a co k němu je na cestě
  {
    const az = armyClone(faction.heroes[capIdx].army);
    for (const m of faction.marches)
      if (m.kind === "reinforce" && m.targetKey === key) armyAdd(az, m.army);
    if (!lzeSestavit(armyAdd(az, army))) return false;
  }
  for (const k of UNIT_KEYS) faction.units[k] -= army[k];
  const targetHero = faction.heroes.findIndex(h => h.pos === key);
  const convoy = heroStats(faction, targetHero).convoyMult;
  const total = Math.max(1, Math.round(
    travelTicks(tile, capPosOf(faction), REINFORCE_TICKS) * convoy * armyTimeMult(army, faction)));
  faction.marches.push({ kind: "reinforce",
    fromKey: capKeyOf(faction),
    targetKey: key, army, ticksLeft: total, total, heroIdx: null });
  return true;
}

// zrušení posil: konvoje k hrdinovi se obrátí a vezou náklad zpět do města;
// hrdina se tím odemyká a může se zase hýbat
function cancelReinforce(faction, heroIdx) {
  const h = faction.heroes[heroIdx];
  if (!h || !h.pos) return false;
  let cancelled = 0;
  for (let mi = faction.marches.length - 1; mi >= 0; mi--) {
    const m = faction.marches[mi];
    if (m.kind !== "reinforce" || m.targetKey !== h.pos) continue;
    faction.marches.splice(mi, 1);
    const elapsed = Math.max(1, m.total - m.ticksLeft);
    faction.marches.push({ kind: "return", fromKey: m.targetKey, targetKey: m.fromKey,
      army: m.army, ticksLeft: elapsed, total: m.total, heroIdx: null });
    cancelled++;
  }
  if (cancelled > 0 && h.rozkaz) {
    h.rozkaz = null;
    addLog(faction.id, { klic: "kron.rozkaz.zrusen", param: { hrdina: heroDef(faction, heroIdx).name } });
  }
  if (cancelled > 0)
    addLog(faction.id, { klic: "kron.posily.zpet", param: { hrdina: heroDef(faction, heroIdx).name, rod: faction.name } });
  return cancelled > 0;
}

// posily s rozkazem (v0.26): jedno potvrzení vyšle konvoj k hrdinovi v poli
// a uloží mu čekající rozkaz — jakmile dorazí POSLEDNÍ konvoj, hrdina sám
// vyrazí na cílové pole se vším, co má (stejný vzor jako obléhací náběhy:
// když to v tu chvíli nejde, zůstane stát a kronika řekne proč)
function startReinforceAttack(faction, target, heroIdx, army, raid = false) {
  const h = faction.heroes[heroIdx];
  if (!h || !h.pos) return false;
  target = bigAnchor(target);
  if (!TERRAIN[target.terrain].passable) return false;
  if (target.owner === faction.id && target.structure === "capital") return false;
  const cilKey = keyOf(target.q, target.r);
  if (cilKey === h.pos) return false;
  if (target.owner !== faction.id && !vDosahu(faction, h, target)) return false; // mimo dosah základny
  if (target.owner !== faction.id
      && (!zonaOtevrena(faction, target) || (jeUzel(target) && target.uzelCd > 0))) return false; // zóna/uzel (v0.30)
  if (target.owner !== faction.id && target.structure !== "throne" && target.structure !== "bridge"
      && pocetPoli(faction) + blockTiles(target).length > stropPoli(faction)) return false; // strop území (v0.31; brány mimo)
  if (!startReinforce(faction, G.tiles.get(h.pos), army)) return false;
  h.rozkaz = { targetKey: cilKey, raid: !!raid, utok: target.owner !== faction.id };
  addLog(faction.id, { klic: h.rozkaz.utok ? "kron.rozkaz.utok" : "kron.rozkaz.presun", param: { hrdina: heroDef(faction, heroIdx).name, rod: faction.name, pole: tileKlic(target) } });
  return true;
}

// splnění čekajícího rozkazu: volá se po zpracování všech dojitých pochodů
// v tiku (dva konvoje mohou dorazit naráz — rozkaz smí vyrazit až s oběma)
function splnRozkaz(faction, heroIdx) {
  const h = faction.heroes[heroIdx];
  if (!h || !h.rozkaz) return;
  if (!h.pos) { h.rozkaz = null; return; } // hrdina mezitím z pole zmizel
  if (heroPinned(faction, heroIdx)) return; // další konvoj je stále na cestě
  const r = h.rozkaz;
  h.rozkaz = null;
  const cil = G.tiles.get(r.targetKey);
  const jmeno = heroDef(faction, heroIdx).name;
  if (!cil || (r.utok && cil.owner === faction.id)) {
    addLog(faction.id, { klic: cil ? "kron.rozkaz.uz.nase" : "kron.rozkaz.cil.zmizel", param: { hrdina: jmeno, rod: faction.name, pole: cil ? tileKlic(cil) : "" } });
    return;
  }
  const sila = armyStr(h.army);
  if (startMarch(faction, cil, null, heroIdx, r.raid)) {
    addLog(faction.id, { klic: "kron.rozkaz.splnen", param: { hrdina: jmeno, rod: faction.name, pole: tileKlic(cil), sila } });
  } else {
    // uzel se mohl mezitím uzavřít cizím odraženým zátahem — říct pravý důvod
    const duvod = jeUzel(bigAnchor(cil)) && bigAnchor(cil).uzelCd > 0
      ? `uzel je uzavřen ještě ${fmtDobu(bigAnchor(cil).uzelCd)}` : "výdrž, zlato či pakt";
    addLog(faction.id, { klic: "kron.rozkaz.nejde", param: { hrdina: jmeno, rod: faction.name, pole: tileKlic(cil), duvod } });
  }
}

// dobrovolný návrat hrdiny z pole do hlavního města
function startRecall(faction, heroIdx) {
  const hero = faction.heroes[heroIdx];
  if (!hero || !hero.pos || heroBusy(faction, heroIdx)) return false;
  if (heroPinned(faction, heroIdx)) return false; // čeká na posily — nejdřív je zruš
  const from = G.tiles.get(hero.pos);
  const total = heroStats(faction, heroIdx).instantReturn
    ? 1 : Math.max(1, Math.round(
        travelTicks(from, capPosOf(faction)) * armyTimeMult(hero.army, faction)));
  faction.marches.push({ kind: "return", fromKey: hero.pos,
    targetKey: capKeyOf(faction),
    army: armyClone(hero.army), ticksLeft: total, total, heroIdx });
  postavHrdinu(hero, null);
  hero.army = emptyArmy();
  hero.guard = false;
  hero.rozkaz = null;
  return true;
}

// obrat na pochodu: hrdina zruší probíhající přesun a vrací se na pole,
// odkud vyšel; ušlý kus cesty musí ujít zpět. Řeší se jako "fallback" —
// když výchozí pole mezitím padlo, hrdina ustoupí až do hlavního města.
function turnBackMarch(faction, heroIdx) {
  const mi = faction.marches.findIndex(m => m.heroIdx === heroIdx &&
    (m.kind === "attack" || m.kind === "return" || m.kind === "siege"));
  if (mi < 0) return false;
  const m = faction.marches[mi];
  faction.marches.splice(mi, 1);
  // odvolané obléhání: hrdina už na svém poli stojí, takže se jen zruší
  // odpočet dalšího náběhu a zůstane na místě (odvolat domů jde zvlášť)
  if (m.kind === "siege") {
    addLog(faction.id, { klic: "kron.oblehani.konec", param: { hrdina: heroDef(faction, heroIdx).name, rod: faction.name } });
    return true;
  }
  const elapsed = Math.max(1, m.total - m.ticksLeft);
  faction.marches.push({ kind: "fallback", fromKey: m.targetKey, targetKey: m.fromKey,
    army: m.army, ticksLeft: elapsed, total: m.total, heroIdx: m.heroIdx });
  addLog(faction.id, { klic: "kron.pochod.zpet", param: { hrdina: heroDef(faction, heroIdx).name, rod: faction.name } });
  return true;
}

// ---------- Stráž ----------
// Hrdina v poli může držet stráž: jeho armáda pak brání i všechna sousední
// vlastní pole. Aktivace stojí výdrž a držená stráž ji dál odčerpává.
function toggleGuard(faction, heroIdx) {
  const h = faction.heroes[heroIdx];
  if (h.guard) { h.guard = false; return true; }
  if (!h.pos || heroBusy(faction, heroIdx) || h.cooldown > 0) return false;
  if (h.stamina < GUARD_COST + 10) return false;
  h.stamina -= GUARD_COST;
  h.guard = true;
  addLog(faction.id, { klic: "kron.straz", param: { hrdina: heroDef(faction, heroIdx).name, rod: faction.name } });
  return true;
}

// (stráže nesou skutečné ztráty přímo z kol boje — viz applyDefFractions)

// nucený ústup hrdiny z pole (jeho pole padlo); armáda už nese skutečné
// ztráty z boje — zničená armáda znamená raněného hrdinu (delší zotavení)
function retreatHeroFrom(frakce, tileKey, extraCooldown = 0) {
  // v0.32: z pole ustupují hrdinové VŠECH členů frakce
  for (const faction of vsichniClenove(frakce)) retreatHrdinyAktera(faction, tileKey, extraCooldown);
}
function retreatHrdinyAktera(faction, tileKey, extraCooldown = 0) {
  for (let i = 0; i < faction.heroes.length; i++)
    if (faction.heroes[i].pos === tileKey) retreatJednoho(faction, i, extraCooldown);
}
// IV-L: v řetězu bitev o stoh ustupuje VŽDY JEN poražený obránce — ostatní
// brání dál. Proto je ústup jednoho hrdiny samostatná funkce.
function retreatJednoho(faction, i, extraCooldown = 0) {
  {
    const hero = faction.heroes[i];
    const tileKey = hero.pos;
    if (!tileKey) return;
    const st = heroStats(faction, i);
    const from = G.tiles.get(tileKey);
    const total = st.instantReturn ? 1
      : Math.max(1, Math.round(travelTicks(from, capPosOf(faction)) * st.fastReturn));
    const army = armyClone(hero.army);
    const wounded = armyTotal(army) < 1;
    faction.marches.push({ kind: "return", fromKey: tileKey,
      targetKey: capKeyOf(faction),
      army, ticksLeft: total, total, heroIdx: i });
    postavHrdinu(hero, null);
    hero.army = emptyArmy();
    hero.guard = false;
    hero.rozkaz = null; // ústup maže i čekající rozkaz
    hero.cooldown = (st.noCooldown ? 0 : (wounded ? WOUNDED_COOLDOWN : DEFEAT_COOLDOWN)) + extraCooldown;
    addLog(faction.id, { klic: wounded ? "kron.ustup.raneny" : "kron.ustup", param: { hrdina: heroDef(faction, i).name, rod: faction.name } });
  }
}

// po boji: skutečné ztráty obránců se propíšou do armád hrdinů (pole i stráže)
// a u hlavního města i do domácí zásoby jednotek
function applyDefFractions(comp, defFrac) {
  for (const c of comp.contributors) {
    const h = c.faction.heroes[c.idx];
    for (const k of UNIT_KEYS) h.army[k] = Math.max(0, Math.round(h.army[k] * defFrac[k]));
  }
  for (const t of (comp.outposts || [])) {
    if (!t.outpost) continue;
    for (const k of UNIT_KEYS) t.outpost[k] = Math.max(0, Math.round(t.outpost[k] * defFrac[k]));
    ozivPole(t);
  }
  if (comp.homeFaction) {
    const u = comp.homeFaction.units;
    for (const k of UNIT_KEYS) u[k] = Math.max(0, Math.round(u[k] * defFrac[k]));
  }
}

// ---- bourání odolnosti velké stavby (v0.29): žádná bitva, jen náběh ----
// Poškození = velení armády × DEMOLISH_PER_CP × obléhací bonus hrdiny ×
// (bez vyhlášené války v cizím DRŽENÉM kraji jen 30 %). Útočník nekrvácí;
// kapitál a Trůn pasivně ostřelují. Odolnost na nule = zábor celého bloku.
function resolveDemolice(faction, march, tile, hero, heroName, stats) {
  const drzitel = regionHolderId(tile);
  const valka = drzitel === -1 || drzitel === faction.id || jeValka(frakceOf(faction), drzitel); // v0.32: válku čte frakce
  const uder = Math.max(1, Math.round(armyCp(march.army, faction) * DEMOLISH_PER_CP
    * (tile.structure ? stats.structAtk : 1) * (valka ? 1 : 1 - WAR_SIEGE_PENALTY)));
  if (tile.odol == null) tile.odol = SIEGE_HP[tile.structure];
  tile.odol -= uder;
  ozivPole(tile);
  let ztraty = 0; // kapitál a Trůn při bourání ostřelují (lučištnická věž)
  if (tile.structure === "capital" || tile.structure === "throne") {
    ztraty = Math.round(armyTotal(march.army) * CAPITAL_FIRE);
    if (ztraty > 0) armyCull(march.army, ztraty);
  }
  if (tile.odol > 0) {
    addLog(faction.id, { klic: valka ? "kron.boureni" : "kron.boureni.bezvalky", param: { hrdina: heroName, rod: faction.name, pole: tileKlic(tile), uder, zbyva: Math.round(tile.odol), ostrel: ztraty ? { klic: "kron.ostrelovani", param: { ztraty } } : "" } });
    const zaklad = G.tiles.get(march.fromKey);
    const tabor = !march.returnAfter && armyTotal(march.army) >= SIEGE_MIN_ARMY
      && !!zaklad && zaklad.owner === faction.id
      && !faction.heroes.some((h2, i2) => i2 !== march.heroIdx && h2.pos === march.fromKey);
    if (tabor) {
      postavHrdinu(hero, march.fromKey);
      hero.army = march.army;
      hero.guard = false;
      faction.marches.push({ kind: "siege", fromKey: march.fromKey,
        targetKey: march.targetKey, army: emptyArmy(),
        ticksLeft: SIEGE_RETRY, total: SIEGE_RETRY,
        heroIdx: march.heroIdx, returnAfter: false, siegeTry: 0 });
    } else {
      faction.marches.push({ kind: "fallback", fromKey: march.targetKey, targetKey: march.fromKey,
        army: march.army, ticksLeft: march.total, total: march.total, heroIdx: march.heroIdx });
    }
    return;
  }
  // odolnost stržena — zábor celé stavby (bloku)
  const prevOwner = tile.owner;
  delete tile.okno;
  delete tile.zran;      // dobyté pole rozběhnuté okno zranění nedědí
  delete tile.odol;
  if (prevOwner !== -1) {
    // obránci s prázdnýma rukama (třeba vyhladovělí) na dobyté stavbě
    // nesmí zůstat stát — ustupují jako po prohrané bitvě (celý blok)
    for (const m of blockTiles(bigAnchor(tile)))
      retreatHeroFrom(G.factions[prevOwner], keyOf(m.q, m.r));
  }
  setTileOwner(tile, faction.id);
  tile.garrison = 0;
  addLog(-1, { klic: "kron.odolnost.strzena", param: { rod: faction.name, pole: tileKlic(tile) } });
  if (tile.structure === "grandfort")
    addLog(-1, { klic: "kron.brana.kraje", param: { rod: faction.name, kraj: regionOf(tile) } });
  // bonusy prvního dobytí (velké stavby se od v0.29 zabírají jen bouráním)
  if (tile.structure === "grandfort" && prevOwner === -1) {
    addLog(faction.id, { klic: "kron.grandfort.strzen", param: { rod: faction.name } });
    grantCores(faction.id, 25, "dobytá velká pevnost");
    faction.resources.gold += 800;
    dropStructLoot(faction, march.heroIdx, tile, 3, 0.5);
  } else if (tile.structure === "fortress" && prevOwner === -1) {
    addLog(faction.id, { klic: "kron.pevnost.strzena", param: { rod: faction.name, svet: SVET_JMENO } });
    grantCores(faction.id, 10, "dobytá pevnost");
    dropStructLoot(faction, march.heroIdx, tile, 3, 0.5);
  }
  if (tile.structure === "throne") {
    addLog(faction.id, { klic: "kron.trun.ovladnut", param: { rod: faction.name } });
    grantCores(faction.id, 40, "ovládnutí Trůnního města");
    if (prevOwner === -1) {
      const sigKey = (hero.srcKey || faction.key) + ":" + hero.defIdx;
      const sigItem = makeSignatureItem(sigKey);
      if (sigItem) {
        faction.items.push({ ...sigItem, id: nextItemId++ });
        emitEvent("loot", faction.id);
        addLog(faction.id, { klic: "kron.trun.sig", param: { hrdina: heroName, rod: faction.name, kus: sigItem.name } });
      } else dropStructLoot(faction, march.heroIdx, tile, 4, 1);
    }
  }
  if (tile.structure === "capital" && prevOwner !== -1) {
    // VYKOŘENĚNÍ jen když padlo SKUTEČNÉ sídlo majitele (jeho capKey) —
    // jiné ukořistěné „kapitály" jsou jen budovy; z dobytého kapitálu
    // v každém případě zbývá svobodné město (žádné bludné kapitály)
    const pf = G.factions[prevOwner];
    if (capKeyOf(pf) === keyOf(tile.q, tile.r))
      resettleFaction(prevOwner, faction);
    else {
      // město ČLENA frakce (v0.32): vykořenění per hráč — člen se přesídlí
      // v kraji; když už není kam, schoulí se u zakladatelova kapitálu
      const clen = (pf.clenove || []).find(c => c.capKey === keyOf(tile.q, tile.r));
      if (clen) {
        if (!umistiMestoClena(pf, clen)) clen.capKey = pf.capKey;
        addLog(-1, { klic: "kron.mesto.clena.padlo", param: { kdo: clen.jmeno || pf.name, rod: pf.name } });
      }
    }
    tile.structure = "city";
  }
  emitEvent("battleWin", faction.id);
  if (prevOwner !== -1) emitEvent("battleLose", prevOwner);
  heroGainXp(faction, march.heroIdx, tile.level * 10);
  faction.stats.wins++;
  if (march.returnAfter) {
    faction.marches.push({ kind: "fallback", fromKey: march.targetKey, targetKey: march.fromKey,
      army: march.army, ticksLeft: march.total, total: march.total, heroIdx: march.heroIdx });
  } else {
    postavHrdinu(hero, march.targetKey);
    hero.army = march.army;
  }
}

function resolveMarch(faction, march) {
  if (march.kind === "return") {
    armyAdd(faction.units, march.army); // armáda se vrací do zásoby
    if (march.heroIdx != null && faction.heroes[march.heroIdx])
      faction.heroes[march.heroIdx].zakladna = null; // doma → základna kapitál
    return;
  }

  if (march.kind === "reinforce") {
    const heroIdx = faction.heroes.findIndex(h => h.pos === march.targetKey);
    if (heroIdx !== -1) {
      armyAdd(faction.heroes[heroIdx].army, march.army);
      addLog(faction.id, { klic: "kron.posily.dorazily", param: { armada: armyStr(march.army), hrdina: heroDef(faction, heroIdx).name } });
    } else {
      faction.marches.push({ kind: "return", fromKey: march.targetKey,
        targetKey: capKeyOf(faction),
        army: march.army, ticksLeft: march.total, total: march.total, heroIdx: null });
      addLog(faction.id, { klic: "kron.posily.marne" });
    }
    return;
  }

  if (march.kind === "siege") {
    // Vyprchala pauza mezi náběhy. Hrdina celou tu dobu tábořil na svém poli
    // (a mohl dostat posily), takže teď prostě vyrazí znovu — se vším, co má.
    // Když to nejde (pole už je naše, došla výdrž nebo zlato), zůstane stát
    // a další krok je na hráči.
    const tile = G.tiles.get(march.targetKey);
    const hero = faction.heroes[march.heroIdx];
    const jmeno = heroDef(faction, march.heroIdx).name;
    if (!tile || !hero || !hero.pos) return;
    if (heroPinned(faction, march.heroIdx)) {
      // posily jsou na cestě — náběh nepropadá, jen chvíli počká (jinak by
      // konvoj poslaný obléhajícímu celý řetěz náběhů tiše zabil)
      faction.marches.push({ ...march, ticksLeft: 10, total: 10 });
      return;
    }
    if (tile.owner === faction.id) {
      addLog(faction.id, { klic: "kron.oblehani.zbytecne", param: { hrdina: jmeno, rod: faction.name, pole: tileKlic(tile) } });
      return;
    }
    const sila = armyTotal(hero.army);
    if (sila < SIEGE_MIN_ARMY) {
      addLog(faction.id, { klic: "kron.oblehani.malo", param: { hrdina: jmeno, rod: faction.name, pole: tileKlic(tile), muzu: Math.round(sila) } });
      return;
    }
    const dalsi = (march.siegeTry || 1) + 1;
    if (startMarch(faction, tile, null, march.heroIdx)) {
      // přenést počítadlo náběhů do nově vzniklého pochodu
      const m = faction.marches[faction.marches.length - 1];
      if (m && m.heroIdx === march.heroIdx) m.siegeTry = march.siegeTry || 1;
      addLog(faction.id, { klic: "kron.naběh", param: { hrdina: jmeno, rod: faction.name, pole: tileKlic(tile), poradi: dalsi, armada: armyStr(hero.army) } });
    } else {
      addLog(faction.id, { klic: "kron.oblehani.ceka", param: { hrdina: jmeno, rod: faction.name, pole: tileKlic(tile) } });
    }
    return;
  }

  if (march.kind === "fallback") {
    // hrdina se stahuje na záchytné pole (zrušený útok / další ústup)
    const hero = faction.heroes[march.heroIdx];
    const dest = G.tiles.get(march.targetKey);
    const capKey = capKeyOf(faction);
    if (march.targetKey === capKey) {
      armyAdd(faction.units, march.army);
      if (hero) hero.zakladna = null; // doma → základna kapitál (jako u „return")
    } else if (dest.owner === faction.id) {
      postavHrdinu(hero, march.targetKey);
      hero.army = march.army;
    } else {
      const total = travelTicks(dest, capPosOf(faction));
      faction.marches.push({ kind: "fallback", fromKey: march.targetKey, targetKey: capKey,
        army: march.army, ticksLeft: total, total, heroIdx: march.heroIdx });
      addLog(faction.id, { klic: "kron.ustup.domu", param: { hrdina: heroDef(faction, march.heroIdx).name, rod: faction.name } });
    }
    return;
  }

  const hero = faction.heroes[march.heroIdx];
  const heroName = heroDef(faction, march.heroIdx).name;
  // PŘEUKOTVIT i při dojezdu: vykořenění umí za letu udělat z cíle člena
  // nového bloku kapitálu — bez re-anchoru by se blok zabral bitvou o holé pole
  const tile = bigAnchor(G.tiles.get(march.targetKey));
  march.targetKey = keyOf(tile.q, tile.r);
  const stats = heroStats(faction, march.heroIdx);
  if (jeMoje(faction, tile)) {
    // cíl mezitím dobyl někdo vlastní — hrdina se tam prostě utáboří
    postavHrdinu(hero, march.targetKey);
    hero.army = march.army;
    return;
  }
  if (!isAdjacentToFaction(faction, tile)) {
    // spojení s územím bylo během pochodu přerušeno — pole nelze zabrat
    faction.marches.push({ kind: "fallback", fromKey: march.targetKey, targetKey: march.fromKey,
      army: march.army, ticksLeft: march.total, total: march.total, heroIdx: march.heroIdx });
    addLog(faction.id, { klic: "kron.spojeni.pretrzeno", param: { hrdina: heroName, rod: faction.name, pole: tileKlic(tile) } });
    return;
  }
  if (tile.owner === -1 && dveArmady(tile) && tile.uzelCd > 0) {
    // uzel se mezitím po cizím odraženém zátahu uzavřel — pochod se obrací
    faction.marches.push({ kind: "fallback", fromKey: march.targetKey, targetKey: march.fromKey,
      army: march.army, ticksLeft: march.total, total: march.total, heroIdx: march.heroIdx });
    addLog(faction.id, { klic: "kron.uzel.uzavren", param: { hrdina: heroName, rod: faction.name, pole: tileKlic(tile) } });
    return;
  }

  // ---- bourání odolnosti (v0.29): otevřené okno a žádní živí obránci ----
  if (jeVelkaStavba(tile) && tile.okno > 0 && armyTotal(tileDefComponents(tile).army) < 1) {
    resolveDemolice(faction, march, tile, hero, heroName, stats);
    return;
  }

  const comp = tileDefComponents(tile);
  // uzel 2×2 (v0.30): neutrální uzel brání DVĚ armády po polovině posádky —
  // první nastupuje hned, druhá čeká jako čerstvá záloha (bitva se hraje dvakrát)
  // v0.40: totéž platí pro oba břehy mostu — brána přes řeku má dvě armády
  // IV-L: hráčský stoh se brání ŘETĚZEM bitev. Útok porazí vždy jen jednu
  // armádu; poražený obránce se stáhne a OSTATNÍ BRÁNÍ DÁL, takže dobýt pole
  // se 200 hrdiny znamená 200 úspěšných zátahů. Nutí to ke koordinovaným
  // útokům a je to tatáž mechanika jako keep, grandfort a Trůn — jen postavená
  // hráči. POSLEDNÍ obránce bojuje spolu s posádkou pole a teprve jeho porážka
  // pole vydá, takže N obránců = N zátahů, ne N+1.
  const stohBoj = tile.owner !== -1 && tile.owner !== faction.id
    && comp.obranci && comp.obranci.length > 1;
  if (stohBoj) {
    const prvni = comp.obranci[0];
    comp.army = armyClone(prvni.faction.heroes[prvni.idx].army);
    comp.contributors = [{ faction: prvni.faction, idx: prvni.idx }];
    comp.outposts = [];
    comp.homeFaction = null;
  }
  // okno zranění se otevírá PRVNÍM zásahem — od té chvíle se posádka nehojí
  // a všechno, co jí kdokoli ubere, se sčítá až do vypršení okna
  if (tile.owner === -1) zranOtevri(tile);
  const uzelBoj = dveArmady(tile) && tile.owner === -1;
  // vlny se řadí od nejslabšího velitele a první je i početně menší
  const uzelPoradi = uzelBoj ? neutralPoradi(tile, 2) : null;
  if (uzelBoj) comp.army = balancedArmy(tile.garrison * NEUTRAL_VLNY[0]);
  const preEv = []; // co se stalo ještě před 1. kolem (pro bojový report)
  // první úder útočníka: eliminace obránců ještě před bojem
  if (stats.strike > 0) {
    const before = armyTotal(comp.army);
    armyCull(comp.army, stats.strike);
    preEv.push({ s: "a", klic: "bit.prvni.uder", param: { hrdina: heroName, padlo: Math.round(before - armyTotal(comp.army)) } });
  }
  // obránci: první úder hrdinů na poli + aura hrdinů v okolí (bere se
  // nejsilnější). v0.32: skenují se hrdinové VŠECH členů vlastnící frakce
  let auraMult = 1;
  let defHeroIdx = -1, defA = null; // nejsilnější hrdina obrany + jeho aktér
  if (tile.owner !== -1) {
    const df = G.factions[tile.owner];
    let defStrike = 0;
    for (const da of vsichniClenove(df)) {
      for (let di = 0; di < da.heroes.length; di++) {
        const dh = da.heroes[di];
        if (!dh.pos) continue;
        const ds = heroStats(da, di);
        if (dh.pos === march.targetKey && braniStoh(da, dh)) defStrike += ds.strike;
        if (ds.aura > 0 && gridDist(G.tiles.get(dh.pos), tile) <= 1)
          auraMult = Math.min(auraMult, 1 - ds.aura);
      }
    }
    if (defStrike > 0) {
      const before = armyTotal(march.army);
      armyCull(march.army, defStrike);
      preEv.push({ s: "d", klic: "bit.prvni.uder.obrana", param: { padlo: Math.round(before - armyTotal(march.army)) } });
    }
    if (auraMult < 1)
      preEv.push({ s: "d", klic: "bit.aura.okoli", param: { pct: Math.round((1 - auraMult) * 100) } });

    // duel hrdinů: velitelé se střetnou tváří v tvář ještě před bitvou;
    // poražená strana ztrácí jednotky (morálka) a vítěz sbírá zkušenosti
    // IV-M: obranu stohu vede ten, kdo na poli stojí NEJDÉLE (při shodě
    // silnější, ať je výběr deterministický). Dřív velel nejsilnější, takže
    // posila poslaná vteřinu před útokem převzala velení celé obraně.
    let duelIdx = -1, duelPow = -1, duelA = null, duelPrisel = Infinity;
    for (const da of vsichniClenove(df)) {
      for (let di = 0; di < da.heroes.length; di++) {
        if (da.heroes[di].pos !== march.targetKey) continue;
        if (!braniStoh(da, da.heroes[di])) continue;   // prázdný batoh nevelí (IV-M)
        const pr = da.heroes[di].prisel || 0;
        const p = duelPower(da, di);
        if (pr < duelPrisel || (pr === duelPrisel && p > duelPow)) {
          duelPrisel = pr; duelPow = p; duelIdx = di; duelA = da;
        }
      }
    }
    defHeroIdx = duelIdx; defA = duelA;
    if (duelIdx !== -1) {
      const atkPow = duelPower(faction, march.heroIdx) + rand(0, 35);
      const defPow = duelPow + rand(0, 35);
      const dName = heroDef(defA, duelIdx).name;
      if (atkPow >= defPow) {
        const cut = Math.round(6 + 1.8 * faction.heroes[march.heroIdx].level);
        const before = armyTotal(comp.army);
        armyCull(comp.army, cut);
        heroGainXp(faction, march.heroIdx, 15);
        preEv.push({ s: "a", klic: "bit.duel", param: { vitez: heroName, porazeny: dName, ztraty: Math.round(before - armyTotal(comp.army)), strana: { klic: "bit.duel.obranci" } } });
      } else {
        const cut = Math.round(6 + 1.8 * defA.heroes[duelIdx].level);
        const before = armyTotal(march.army);
        armyCull(march.army, cut);
        heroGainXp(defA, duelIdx, 15);
        preEv.push({ s: "d", klic: "bit.duel", param: { vitez: dName, porazeny: heroName, ztraty: Math.round(before - armyTotal(march.army)), strana: { klic: "bit.duel.utocnici" } } });
      }
    }
  }
  const defFaction = tile.owner === -1 ? null : G.factions[tile.owner];
  const defenderName = defFaction ? defFaction.name : jazyky().txCs("bit.neutral");
  // do KRONIKY jde vnořený klíč, ne hotová věta — jméno rodu je vlastní jméno
  // (nepřekládá se), „neutrální posádka" je popis (překládá se)
  const obranceKlic = f => (f ? f.name : { klic: "bit.neutral" });
  const hadArch = march.army.arch > 0;
  const defHadArch = comp.army.arch > 0;

  // velitelé v bitvě: bojové staty a vlastní životy (hrdina schytává malý
  // podíl poškození skupiny; padne-li, dál se bojuje bez jeho statů)
  if (hero.hp == null) hero.hp = stats.hpMax;
  hero.hp = Math.min(hero.hp, stats.hpMax);
  const enemyKey = tile.owner !== -1 ? G.factions[tile.owner].key : null;
  const atkHero = { name: heroName, hp: hero.hp, atk: stats.atk, def: stats.def,
    dmg: stats.dmg, speed: stats.speed, spell: stats.spell, ward: stats.ward,
    stackAtk: stats.stackAtk, stackDef: stats.stackDef,
    followUp: stats.followUp, unitDmg: stats.unitDmg,
    madness: stats.madness, pursuit: stats.pursuit,
    stunChance: stats.stunChance,
    stunImmune: stats.stunImmune || (enemyKey ? !!stats.vsStunImmune[enemyKey] : false),
    actives: stats.actives, armyActives: stats.armyActives,
    healActives: stats.healActives, cauter: stats.cauter,
    slowEnemy: stats.slowEnemy, shred: stats.shred,
    avoidCharges: stats.avoidCharges, avoidChance: stats.avoidChance,
    vsAll: enemyKey ? (stats.vsDmg[enemyKey] || 0) : 0 };
  let defHero = null, defH = null;
  if (defHeroIdx !== -1) {
    defH = defA.heroes[defHeroIdx]; // v0.32: hrdina konkrétního aktéra obrany
    const ds = heroStats(defA, defHeroIdx);
    if (defH.hp == null) defH.hp = ds.hpMax;
    defH.hp = Math.min(defH.hp, ds.hpMax);
    defHero = { name: heroDef(defA, defHeroIdx).name, hp: defH.hp,
      atk: ds.atk, def: ds.def, dmg: ds.dmg, speed: ds.speed,
      spell: ds.spell, ward: ds.ward, stackAtk: ds.stackAtk, stackDef: ds.stackDef,
      followUp: ds.followUp, unitDmg: ds.unitDmg,
      madness: ds.madness, pursuit: ds.pursuit,
      stunChance: ds.stunChance,
      stunImmune: ds.stunImmune || !!ds.vsStunImmune[faction.key],
      actives: ds.actives, armyActives: ds.armyActives,
      healActives: ds.healActives, cauter: ds.cauter,
      slowEnemy: ds.slowEnemy, shred: ds.shred,
      avoidCharges: ds.avoidCharges, avoidChance: ds.avoidChance,
      vsAll: ds.vsDmg[faction.key] || 0 };
  } else if (tile.owner === -1) {
    // neutrální pole brání vlastní velitel: úroveň podle jmenovky síly pole,
    // bez výbavy, hvězd i dovedností (v0.13)
    // u dvouarmádového objektivu jde první SLABŠÍ z obou velitelů (IV-M)
    const nc = neutralCommander(tile, uzelPoradi ? uzelPoradi[0] : 0);
    defHero = { name: nc.name, level: nc.level, neutral: true,
      hp: nc.hp, atk: nc.atk, def: nc.def, dmg: nc.dmg,
      speed: nc.speed, spell: nc.spell, ward: nc.ward };
  } else {
    // vlastněné pole bez hrdiny brání kapitán domobrany se staty 1. úrovně —
    // útočníkův hrdina tak nemá převahu zadarmo
    defHero = { name: "kapitán domobrany", hp: 80, atk: HERO_ATK_BASE,
      def: HERO_DEF_BASE, dmg: HERO_DMG_BASE, speed: MILITIA_SPEED,
      spell: 0, ward: 0 };
  }

  // ---- uzel 2×2 (v0.30): bitva s PRVNÍ armádou uzlu ----
  // Výhra nezabírá — bez oddechu nastupuje druhá armáda (hlavní bitva níž).
  // Prohra NEBO pád velitele = zátah selhal: obě armády uzlu se plně obnoví
  // a uzel se na UZEL_CD_TICKS uzavře.
  if (uzelBoj) {
    const s1 = simulateBattle({
      attacker: {
        faction, army: march.army, hero: atkHero,
        mult: faction.attackMult * grandfortMult(faction)
          * (tile.structure ? stats.structAtk : 1) * auraMult,
      },
      defender: {
        faction: null, army: comp.army, hero: defHero,
        mult: stats.ignoreDef ? 1 : comp.mult, heroLed: false,
      },
      structure: !!tile.structure,
    });
    hero.hp = s1.heroHpA;
    const r1 = {
      id: G.nextReportId++, tick: G.tick,
      tileKey: march.targetKey, tileName: tileLabel(tile), tileJm: tileKlic(tile), structure: tile.structure,
      att: { name: faction.name, color: faction.color, hero: heroName,
        fkey: faction.key, druhyRod: faction.druhyRod || null,
        heroDef: hero.defIdx, level: hero.level },
      def: { name: defenderName + " (1. armáda uzlu)", nameKlic: defFaction ? null : "bit.neutral.uzel", color: "#8a8f9a", heroes: [],
        homeUnits: false, fkey: null, heroDef: null,
        leadName: defHero ? defHero.name : null,
        level: (defHero && defHero.level) || null, neutralCmd: true },
      won: s1.won, rounds: s1.rounds,
      initA: s1.initA, initD: s1.initD, remD: s1.remD, tot: s1.tot,
      heroHpA: s1.heroHpA, heroHpD: s1.heroHpD,
      heroFellA: s1.heroFellA, heroFellD: s1.heroFellD,
      pre: preEv.slice(), roundLog: s1.roundLog, strety: s1.strety,
      defKilled: s1.defKilled, post: [],
      ucastnici: ucastniciBitvy(faction, tile, comp),
    };
    G.reports.push(r1);
    if (G.reports.length > 40) G.reports.shift();
    G.clashes.push({ key: march.targetKey, tick: G.tick, att: faction.id, def: -1,
      attDef: faction.heroes[march.heroIdx] ? faction.heroes[march.heroIdx].defIdx : 0,
      defDef: null });
    if (!s1.won || s1.heroFellA) {
      // zátah selhal — uzel se uzavírá a OBĚ armády se obnovují v plné síle.
      // I vyhraná bitva s padlým velitelem je pro report prohra zátahu —
      // jinak by prohlížeč ukázal „DOBYTO" nad nedobytým polem
      r1.won = false;
      // OKNO ZRANĚNÍ: dřív se tu obě armády vrátily do plné síly. Nově si
      // posádka nese, co jí zátah pobil, a obnoví se až vypršením okna.
      zranUber(tile, s1.defKilled);
      tile.uzelCd = UZEL_CD_TICKS;
      ozivPole(tile);
      const survivors = s1.remA;
      const routLosses = emptyArmy();
      for (const k of UNIT_KEYS) {
        let rf = ROUT_LOSS;
        if (faction.key === "yllien" && k === "cav") rf *= 1 - 0.5 * passiveScale(faction, "cav");
        routLosses[k] = Math.min(survivors[k], Math.round(survivors[k] * rf));
        survivors[k] -= routLosses[k];
      }
      const totalLosses = armyAdd(armyClone(s1.attLosses), routLosses);
      if (armyTotal(routLosses) > 0)
        r1.post.push(`🛡 Pronásledování při ústupu: útočník ztrácí dalších ${armyTotal(routLosses)}`);
      applyHospital(faction, totalLosses);
      const wiped = armyTotal(survivors) < 1;
      const backTotal = stats.instantReturn ? 1
        : Math.max(1, Math.round(march.total * stats.fastReturn));
      faction.marches.push({ kind: "return", fromKey: march.targetKey,
        targetKey: capKeyOf(faction),
        army: survivors, ticksLeft: backTotal, total: backTotal, heroIdx: march.heroIdx });
      hero.cooldown = stats.noCooldown ? 0
        : (wiped || s1.heroFellA ? WOUNDED_COOLDOWN : DEFEAT_COOLDOWN);
      if (s1.heroFellA) r1.post.push(`⚔ 💔 ${heroName} v bitvě padl a zotavuje se`);
      r1.post.push(`⛔ Uzel se uzavírá — obě armády se obnovily (další zátah za ${fmtDobu(UZEL_CD_TICKS)})`);
      r1.attLosses = armyClone(totalLosses);
      r1.attRem = armyClone(survivors);
      emitEvent("battleLose", faction.id);
      addLog(faction.id, { klic: s1.won ? "kron.uzel.velitel.padl" : "kron.uzel.nezlomen", param: { hrdina: heroName, rod: faction.name, pole: tileKlic(tile), doba: fmtDobu(UZEL_CD_TICKS) } }, r1.id);
      heroGainXp(faction, march.heroIdx, Math.max(5, Math.round(s1.defKilled / 2)));
      return;
    }
    // první armáda padla — druhá nastupuje ihned (zátah pokračuje hlavní bitvou)
    r1.post.push("⚔ První armáda uzlu je pobita — druhá nastupuje ihned!");
    poVitezneObnove(faction, stats, s1, r1); // lazaret/Kostěné řady/kořist i po 1. bitvě
    r1.attLosses = armyClone(s1.attLosses);  // prohlížeč reportů obě pole čte vždy
    r1.attRem = armyClone(s1.remA);
    march.army = s1.remA;
    comp.army = balancedArmy(tile.garrison * NEUTRAL_VLNY[1]);
    const nc2 = neutralCommander(tile, uzelPoradi[1]);
    defHero = { name: nc2.name, level: nc2.level, neutral: true,
      hp: nc2.hp, atk: nc2.atk, def: nc2.def, dmg: nc2.dmg,
      speed: nc2.speed, spell: nc2.spell, ward: nc2.ward };
    preEv.length = 0; // report druhé bitvy začíná čistý
    heroGainXp(faction, march.heroIdx, Math.max(5, Math.round(s1.defKilled / 3)));
    atkHero.hp = hero.hp; // level-up mezi bitvami léčí — druhá bitva to musí poznat
  }

  const sim = simulateBattle({
    attacker: {
      faction, army: march.army, hero: atkHero,
      mult: faction.attackMult * grandfortMult(faction)
        * (tile.structure ? stats.structAtk : 1) * auraMult,
    },
    defender: {
      faction: defFaction, army: comp.army, hero: defHero,
      mult: stats.ignoreDef ? 1 : comp.mult,
      heroLed: comp.contributors && comp.contributors.length > 0,
    },
    structure: !!tile.structure,
  });
  // životy velitelů po bitvě
  hero.hp = sim.heroHpA;
  if (defH) defH.hp = sim.heroHpD;
  // ETAPA 12b: číslo kol je PARAMETR, ne hotová česká fráze — čeština skloňuje
  // „kole/kolech", angličtina ne, a věta se skládá až u klienta
  const roundsTxt = sim.rounds;

  // bojový report: kompletní záznam pro prohlížeč bitev
  const defHeroNames = comp.contributors
    .map(c => heroDef(c.faction, c.idx).name);
  const report = {
    id: G.nextReportId++, tick: G.tick,
    tileKey: march.targetKey, tileName: tileLabel(tile), tileJm: tileKlic(tile), structure: tile.structure,
    att: { name: faction.name, color: faction.color, hero: heroName,
      fkey: faction.key, druhyRod: faction.druhyRod || null,
        heroDef: hero.defIdx, level: hero.level },
    def: { name: defenderName, nameKlic: defFaction ? null : "bit.neutral", color: defFaction ? defFaction.color : "#8a8f9a",
      heroes: defHeroNames, homeUnits: !!comp.homeFaction,
      fkey: defFaction ? defFaction.key : null,
      druhyRod: (defFaction && defFaction.druhyRod) || null,
      heroDef: defH ? defH.defIdx : null,
      leadName: defHero ? defHero.name : null,
      // úroveň velitele obrany: hráčův hrdina, nebo neutrální velitel pole
      level: defH ? defH.level : (defHero && defHero.level) || null,
      neutralCmd: !!(defHero && defHero.neutral) },
    won: sim.won, rounds: sim.rounds,
    initA: sim.initA, initD: sim.initD, remD: sim.remD,
    tot: sim.tot,
    heroHpA: sim.heroHpA, heroHpD: sim.heroHpD,
    heroFellA: sim.heroFellA, heroFellD: sim.heroFellD,
    pre: preEv, roundLog: sim.roundLog, strety: sim.strety,
    defKilled: sim.defKilled, post: [],
    ucastnici: ucastniciBitvy(faction, tile, comp),
  };
  G.reports.push(report);
  if (G.reports.length > 40) G.reports.shift();
  // záznam pro animaci střetu na mapě (obě strany, obránce -1 = domobrana);
  // attDef/defDef = silueta konkrétního hrdiny (defDef null → šedá domobrana)
  const defContrib = comp.contributors.find(c => defFaction && c.faction.id === defFaction.id)
    || comp.contributors[0];
  G.clashes.push({ key: march.targetKey, tick: G.tick,
    att: faction.id, def: defFaction ? defFaction.id : -1,
    attDef: faction.heroes[march.heroIdx] ? faction.heroes[march.heroIdx].defIdx : 0,
    defDef: defContrib ? defContrib.faction.heroes[defContrib.idx].defIdx : null });

  if (sim.won) {
    const { losses, survivors } = poVitezneObnove(faction, stats, sim, report);
    const prevOwner = tile.owner;
    const wasCapital = tile.structure === "capital";
    if (prevOwner !== -1) {
      // obránci si odnášejí skutečné ztráty z kol boje
      applyDefFractions(comp, sim.defFrac);
      // Lovci hrdinů: poražení hrdinové hordy se zotavují déle
      const extraCd = faction.key === "horda" && hadArch
        ? Math.round(30 * passiveScale(faction, "arch")) : 0;
      // v řetězu stohu ustupuje JEN poražený obránce, zbytek drží pole dál
      if (stohBoj) retreatJednoho(comp.obranci[0].faction, comp.obranci[0].idx, extraCd);
      else retreatHeroFrom(G.factions[prevOwner], march.targetKey, extraCd);
    }
    if (jeVelkaStavba(tile) || stohBoj) {
      // Vítězství BEZ ZÁBORU — u velké stavby otevírá obléhací okno,
      // u stohu srazí jednu armádu z několika. Zbytek cesty (tábor, další
      // náběh, zkušenosti, ústup) je pro obojí stejný, proto jedna větev.
      if (stohBoj) {
        const zbyva = comp.obranci.length - 1;
        report.post.push({ klic: "rep.stoh.drzi", param: { zbyva } });
        report.stohZbyva = zbyva;
        addLog(faction.id, { klic: "kron.stoh.jedna", param: { hrdina: heroName, rod: faction.name, pole: tileKlic(tile), zbyva } }, report.id);
      } else if (!(tile.okno > 0)) {
        tile.okno = siegeWindowTicks();
        ozivPole(tile);
        tile.odol = SIEGE_HP[tile.structure];
        ozivPole(tile);
        addLog(-1, { klic: "kron.okno.oblehani", param: { rod: faction.name, pole: tileKlic(tile), kraj: regionOf(tile), okno: tile.okno, odolnost: tile.odol } });
        report.post.push({ klic: "rep.okno.otevreno", param: { okno: tile.okno, odolnost: tile.odol } });
      } else {
        report.post.push({ klic: "rep.okno.bezi", param: { okno: tile.okno, odolnost: Math.round(tile.odol) } });
      }
      if (!stohBoj && tile.owner === -1) tile.garrison = 0;
      report.attLosses = armyClone(losses);
      report.attRem = armyClone(survivors);
      heroGainXp(faction, march.heroIdx, Math.round(sim.defKilled * 1.4) + tile.level * 8);
      faction.stats.wins++;
      emitEvent("battleWin", faction.id);
      if (prevOwner !== -1) emitEvent("battleLose", prevOwner);
      const zaklad = G.tiles.get(march.fromKey);
      const tabor = !march.returnAfter && !sim.heroFellA
        && armyTotal(survivors) >= SIEGE_MIN_ARMY
        && !!zaklad && zaklad.owner === faction.id
        && !faction.heroes.some((h2, i2) => i2 !== march.heroIdx && h2.pos === march.fromKey);
      if (tabor) {
        postavHrdinu(hero, march.fromKey);
        hero.army = survivors;
        hero.guard = false;
        faction.marches.push({ kind: "siege", fromKey: march.fromKey,
          targetKey: march.targetKey, army: emptyArmy(),
          ticksLeft: SIEGE_RETRY, total: SIEGE_RETRY,
          heroIdx: march.heroIdx, returnAfter: false, siegeTry: 0 });
        report.post.push({ s: "a", klic: "rep.tabori", param: { hrdina: heroName, pole: tileKlic(zaklad), za: SIEGE_RETRY } });
      } else {
        const backTotal = stats.instantReturn ? 1 : march.total;
        faction.marches.push({ kind: "fallback", fromKey: march.targetKey,
          targetKey: march.fromKey, army: survivors,
          ticksLeft: backTotal, total: backTotal, heroIdx: march.heroIdx });
        report.post.push({ s: "a", klic: "rep.stahuje.bez.tabora", param: { hrdina: heroName } });
      }
      if (sim.heroFellA && !stats.noCooldown) {
        hero.cooldown = Math.max(hero.cooldown, WOUNDED_COOLDOWN);
        report.post.push({ s: "a", klic: "rep.hrdina.padl", param: { hrdina: heroName } });
      }
      addLog(faction.id, { klic: "kron.posadka.pobita", param: { hrdina: heroName, rod: faction.name, pole: tileKlic(tile), kol: roundsTxt, odolnost: Math.round(tile.odol) } }, report.id);
      return;
    }
    // v0.32: pole bere KONKRÉTNÍ aktér (velké stavby bere bitva nikdy —
    // ty jdou přes okna a demolici, kde zůstávají frakční)
    setTileOwner(tile, faction.id, faction.cid);
    delete tile.zran;      // dobyté pole rozběhnuté okno zranění nedědí
    if (tile.structure === "grandfort")
      addLog(-1, { klic: "kron.brana.kraje", param: { rod: faction.name, kraj: regionOf(tile) } });
    tile.garrison = 0;
    if (tile.structure === "outpost") { // výspa padá s polem i s posádkou
      tile.structure = null;
      tile.outpost = null;
      zrusVyspy();
      // usazení hrdinů padá s ní — nová výspa na stejném místě ho nesmí
      // vzkřísit (v0.32: prohledat hrdiny VŠECH členů frakce)
      if (prevOwner !== -1) for (const pa of vsichniClenove(G.factions[prevOwner]))
        for (const hh of pa.heroes)
          if (hh.zakladna === march.targetKey) hh.zakladna = null;
      report.post.push({ s: "a", klic: "rep.vyspa.strzena" });
    }
    if (march.returnAfter) {
      // nájezd „udeř a vrať se": pole je dobyté, ale hrdina se hned obrací
      // na výchozí pole (fallback umí ztracený cíl — u města jde armáda do zásoby)
      const backTotal = stats.instantReturn ? 1 : march.total;
      faction.marches.push({ kind: "fallback", fromKey: march.targetKey,
        targetKey: march.fromKey, army: survivors,
        ticksLeft: backTotal, total: backTotal, heroIdx: march.heroIdx });
      report.post.push({ s: "a", klic: "rep.najezd.zpet", param: { hrdina: heroName } });
    } else {
      postavHrdinu(hero, march.targetKey);
      hero.army = survivors;
    }
    // padlý velitel: vítězná armáda zůstává na poli a čeká, než se vyléčí
    if (sim.heroFellA && !stats.noCooldown) {
      hero.cooldown = Math.max(hero.cooldown, WOUNDED_COOLDOWN);
      report.post.push({ s: "a", klic: "rep.hrdina.padl.drzi", param: { hrdina: heroName } });
      addLog(faction.id, { klic: "kron.hrdina.padl", param: { hrdina: heroName, rod: faction.name, pole: tileKlic(tile) } });
    }
    report.attLosses = armyClone(losses);
    report.attRem = armyClone(survivors);
    addLog(faction.id, { klic: march.returnAfter ? "kron.dobyto.najezd" : "kron.dobyto", param: { hrdina: heroName, rod: faction.name, pole: tileKlic(tile), kol: roundsTxt, obrance: obranceKlic(defFaction), padlo: sim.defKilled, ztraty: armyTotal(losses) } }, report.id);
    heroGainXp(faction, march.heroIdx, Math.round(sim.defKilled * 1.4) + tile.level * 8);
    faction.stats.wins++;
    emitEvent("battleWin", faction.id);
    if (prevOwner !== -1) emitEvent("battleLose", prevOwner);
    // odměna putovní události na dobytém poli
    const mev = mapEventAt(march.targetKey);
    if (mev) {
      G.mapEvents = G.mapEvents.filter(e => e !== mev);
      if (mev.type === "banda") {
        const gold = 80 + tile.level * 10;
        faction.resources.gold += gold;
        report.post.push({ s: "a", klic: "rep.banda", param: { zlato: gold } });
        addLog(faction.id, { klic: "kron.banda", param: { hrdina: heroName, rod: faction.name, zlato: gold } });
        grantCores(faction.id, 5, "rozprášená banda");
      } else if (mev.type === "karavana") {
        const gold = 150 + randInt(0, 100);
        faction.resources.gold += gold;
        report.post.push({ s: "a", klic: "rep.karavana", param: { zlato: gold } });
        addLog(faction.id, { klic: "kron.karavana", param: { hrdina: heroName, rod: faction.name, zlato: gold } });
        grantCores(faction.id, 8, "zajatá karavana");
      } else if (mev.type === "relikvie") {
        faction.resources.gold += 60;
        report.post.push({ s: "a", klic: "rep.relikvie" });
        addLog(faction.id, { klic: "kron.relikvie", param: { hrdina: heroName, rod: faction.name } });
        grantCores(faction.id, 15, "ztracená relikvie");
      }
    }
    if (tile.structure === "grandfort" && prevOwner === -1) {
      // pád velké pevnosti: pokladnice, legendární kořist a frakční bonus
      addLog(faction.id, { klic: "kron.grandfort.padl", param: { rod: faction.name } });
      grantCores(faction.id, 25, "dobytá velká pevnost");
      faction.resources.gold += 800;
      report.post.push({ s: "a", klic: "rep.velka.pevnost" });
      if (dropStructLoot(faction, march.heroIdx, tile, 3, 0.5))
        report.post.push({ klic: "rep.pokladnice" });
    } else if (tile.structure === "fortress" && prevOwner === -1) {
      // pád pevnosti vnitřního okruhu: brána do středu Vellaru
      addLog(faction.id, { klic: "kron.pevnost.padla", param: { rod: faction.name, svet: SVET_JMENO } });
      grantCores(faction.id, 10, "dobytá pevnost");
      report.post.push({ s: "a", klic: "rep.pevnost", param: { svet: SVET_JMENO } });
      if (dropStructLoot(faction, march.heroIdx, tile, 3, 0.5))
        report.post.push({ klic: "rep.zbrojnice" });
    }
    // (běžná pole už kořist nesypou — výbava pochází z truhel a klíčových staveb)
    // dovednosti po vítězství: kořistné zlato, obnova výdrže, pokřik pro ostatní
    if (stats.goldPerLevel > 0) faction.resources.gold += Math.round(stats.goldPerLevel * tile.level);
    if (stats.winStam) hero.stamina = stats.stamMax;
    if (stats.rally > 0) {
      for (let ri = 0; ri < faction.heroes.length; ri++) {
        faction.heroes[ri].stamina = Math.min(heroStats(faction, ri).stamMax,
          faction.heroes[ri].stamina + stats.rally);
      }
    }
    if (wasCapital && prevOwner !== -1) eliminateFaction(prevOwner, faction);
    if (tile.structure === "throne") {
      addLog(faction.id, { klic: "kron.trun.ovladnut", param: { rod: faction.name } });
      grantCores(faction.id, 40, "ovládnutí Trůnního města");
      if (prevOwner === -1) {
        // první dobytí Trůnu v sezóně: SIGNATURE kus hrdiny, který jej dobyl
        const sigKey = faction.key + ":" + faction.heroes[march.heroIdx].defIdx;
        const sigItem = makeSignatureItem(sigKey);
        if (sigItem) {
          faction.items.push({ ...sigItem, id: nextItemId++ });
          emitEvent("loot", faction.id);
          report.post.push({ klic: "rep.trun.signature", param: { hrdina: heroName, kus: sigItem.name } });
          addLog(faction.id, { klic: "kron.trun.sig.plny", param: { hrdina: heroName, rod: faction.name, ikona: ITEM_SLOTS[sigItem.slot].icon, kus: sigItem.name, pasivka: SIGNATURE_ITEMS[sigKey].passive } });
        } else {
          report.post.push({ klic: "rep.trun.legendarni" });
          dropStructLoot(faction, march.heroIdx, tile, 4, 1);
        }
      }
    }
  } else {
    // odražený útok: skutečné ztráty z kol + pronásledování při ústupu
    applyDefFractions(comp, sim.defFrac);
    if (tile.owner === -1) {
      if (uzelBoj) {
        // OKNO ZRANĚNÍ: první vlna padla celá, druhá si nese svoje ztráty —
        // nic se neobnovuje, jen se cíl na chvíli uzavře. Dřív se tu obě
        // armády vrátily do plné síly a postup skupiny přišel vniveč.
        tile.garrison = Math.max(0, tile.garrison * (1 - NEUTRAL_VLNY[0]));
        ozivPole(tile);
        zranUber(tile, sim.defKilled);
        tile.uzelCd = UZEL_CD_TICKS;
        ozivPole(tile);
        report.post.push({ klic: tile.structure === "bridge" ? "rep.most.uzavren" : "rep.uzel.uzavren", param: { doba: fmtDobu(UZEL_CD_TICKS), muzu: Math.round(tile.garrison), zran: fmtDobu(tile.zran || 0) } });
      } else {
        // oslabená neutrální posádka se z boje nevzpamatuje celá; během okna
        // zranění navíc vůbec nedorůstá, takže se postup sčítá napříč útoky
        tile.garrison = Math.max(0, Math.round(tile.garrison * sim.defFrac.inf));
        ozivPole(tile);
        if (tile.zran > 0)
          report.post.push({ klic: "rep.okno.zraneni", param: { doba: fmtDobu(tile.zran), muzu: Math.round(tile.garrison) } });
      }
    }
    const survivors = sim.remA;
    // Obléhání: pokud hrdina i vojsko zůstali na nohou, netáhne domů —
    // utáboří se u pole a po SIEGE_RETRY sekundách udeří znovu. Sražená
    // posádka se mezitím nestihne obnovit, takže každý náběh něco ubourá.
    // Rozhoduje se PŘED ústupovými ztrátami: obléhající neprchá, jen se
    // stáhne o kus, takže ho pronásledování nestíhá.
    // tábořit se dá jen na vlastním poli, ze kterého útok vyšel
    const zaklad = G.tiles.get(march.fromKey);
    const pokus = (march.siegeTry || 0) + 1;
    // uzly se neobléhají — uzavřený uzel by náběhy stejně odmítal (v0.30)
    const oblehat = !uzelBoj && armyTotal(survivors) >= SIEGE_MIN_ARMY
      && !sim.heroFellA && !march.returnAfter && pokus < SIEGE_MAX_TRIES
      && !!zaklad && zaklad.owner === faction.id
      && !faction.heroes.some((h, i) => i !== march.heroIdx && h.pos === march.fromKey);

    const routLosses = emptyArmy();
    if (!oblehat) {
      for (const k of UNIT_KEYS) {
        let rf = ROUT_LOSS;
        if (faction.key === "yllien" && k === "cav") rf *= 1 - 0.5 * passiveScale(faction, "cav"); // Vílí rychlost
        routLosses[k] = Math.min(survivors[k], Math.round(survivors[k] * rf));
        survivors[k] -= routLosses[k];
      }
    }
    const totalLosses = armyAdd(armyClone(sim.attLosses), routLosses);
    if (armyTotal(routLosses) > 0)
      report.post.push({ s: "d", klic: "rep.pronasledovani", param: { ztraty: armyTotal(routLosses) } });
    applyHospital(faction, totalLosses);
    const wiped = armyTotal(survivors) < 1;
    if (oblehat) {
      // hrdina se stahuje na své pole a táboří tam — je vidět na mapě, dají
      // se mu poslat posily a po pauze vyrazí znovu. Obléhací pochod je jen
      // odpočet; armádu drží hrdina.
      postavHrdinu(hero, march.fromKey);
      hero.army = survivors;
      hero.guard = false;
      faction.marches.push({ kind: "siege", fromKey: march.fromKey,
        targetKey: march.targetKey, army: emptyArmy(),
        ticksLeft: SIEGE_RETRY, total: SIEGE_RETRY,
        heroIdx: march.heroIdx, returnAfter: march.returnAfter, siegeTry: pokus });
      report.post.push({ s: "a", klic: "rep.dalsi.nabeh", param: { hrdina: heroName, pole: tileKlic(zaklad), za: SIEGE_RETRY, pokus, zpokusu: SIEGE_MAX_TRIES } });
    } else {
      const backTotal = stats.instantReturn ? 1
        : Math.max(1, Math.round(march.total * stats.fastReturn));
      faction.marches.push({ kind: "return", fromKey: march.targetKey,
        targetKey: capKeyOf(faction),
        army: survivors, ticksLeft: backTotal, total: backTotal, heroIdx: march.heroIdx });
    }
    // obléhající hrdina nedostává trest za porážku — z pole neodešel a pauzu
    // mezi náběhy mu odměřuje samo obléhání
    let cd = (oblehat || stats.noCooldown) ? 0
      : (wiped || sim.heroFellA ? WOUNDED_COOLDOWN : DEFEAT_COOLDOWN);
    if (sim.heroFellA)
      report.post.push({ s: "a", klic: "rep.hrdina.padl", param: { hrdina: heroName } });
    // Lovci hrdinů: horda v obraně prodlužuje zotavení odraženého hrdiny
    if (defFaction && defFaction.key === "horda" && defHadArch)
      cd += Math.round(30 * passiveScale(defFaction, "arch"));
    hero.cooldown = cd;
    emitEvent("battleLose", faction.id);
    if (defFaction) {
      // v0.32: výhru obrany si připisuje aktér vlastnící pole (t.clen)
      const defAktor = clenPodleCid(defFaction, tile.clen || 0) || defFaction;
      defAktor.stats.wins++;
      emitEvent("battleWin", defFaction.id, tile.clen);
    }
    // padlý velitel obrany: pole ubránil, ale zotavuje se přímo na něm
    if (defH && sim.heroFellD) {
      defH.cooldown = Math.max(defH.cooldown, WOUNDED_COOLDOWN);
      report.post.push({ s: "d", klic: "rep.obrance.padl", param: { hrdina: defHero.name } });
      addLog(defFaction.id, { klic: "kron.obrance.padl", param: { hrdina: defHero.name, rod: defFaction.name, pole: tileKlic(tile) } });
    }
    report.attLosses = armyClone(totalLosses);
    report.attRem = armyClone(survivors);
    if (wiped) report.post.push({ s: "a", klic: "rep.armada.znicena", param: { hrdina: heroName } });
    addLog(faction.id, { klic: wiped ? "kron.odrazen.znicen" : "kron.odrazen", param: { hrdina: heroName, rod: faction.name, pole: tileKlic(tile), kol: roundsTxt, obrance: obranceKlic(defFaction), padlo: sim.defKilled, ztraty: armyTotal(totalLosses) } }, report.id);
    heroGainXp(faction, march.heroIdx, Math.max(5, Math.round(sim.defKilled / 2)));
    // obránci na poli sbírají zkušenosti za ubráněný útok
    if (defFaction) {
      // v0.32: zkušenost za ubráněný útok sbírají hrdinové všech členů na poli
      for (const da of vsichniClenove(defFaction)) da.heroes.forEach((h, di) => {
        if (h.pos === march.targetKey) heroGainXp(da, di, Math.round(armyTotal(totalLosses) / 2));
      });
    }
  }
}

// ---------- Vykořenění (v0.29): kapitál na nule → přesídlení, NE eliminace ----------
// Poražený dostane nový kapitál 3×3 v „závětří" vlastního oktantu (dál od
// středu než stará pozice), majetek, pole i hrdinové mu zůstávají. Když se
// místo nenajde (kraj rozvrácený), padá pojistka eliminateFaction.
function resettleFaction(id, byFaction) {
  const f = G.factions[id];
  const kraj = REGION_NAMES[id]; // domovský oktant frakce
  const stary = capPosOf(f);
  const staryM = Math.abs(stary.q) + Math.abs(stary.r);
  let best = null, bestScore = -Infinity;
  for (const t of G.tiles.values()) {
    if (Math.abs(t.q) > MAP_R - 1 || Math.abs(t.r) > MAP_R - 1) continue;
    if (Math.abs(t.q) + Math.abs(t.r) <= staryM) continue; // závětří: dál od středu
    if (regionOf(t) !== kraj) continue;
    let ok = true;
    for (const dq of [-1, 0, 1]) {
      for (const dr of [-1, 0, 1]) {
        const m = tileAt(t.q + dq, t.r + dr);
        if (!m || m.structure || m.big || m.bigSize || m.riv
            || (m.owner !== -1 && m.owner !== id)) { ok = false; break; }
      }
      if (!ok) break;
    }
    if (!ok) continue;
    const score = (Math.abs(t.q) + Math.abs(t.r)) - gridDist(t, stary) / 3;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  if (!best) { eliminateFaction(id, byFaction); return; } // pojistka: není kam přesídlit
  for (const dq of [-1, 0, 1]) for (const dr of [-1, 0, 1]) {
    const m = tileAt(best.q + dq, best.r + dr);
    if (!TERRAIN[m.terrain].passable) { m.terrain = "plains"; m.structure = null; delete m.riv; }
  }
  best.terrain = "plains";
  best.structure = "capital";
  best.owner = id;
  zrusPrehled();
  best.level = 2;
  best.garrison = 0;
  best.res = null;
  if (!makeBig(best, 3, true)) { // pojistka — kandidát prošel kontrolou, ale jistota je jistota
    best.structure = null;
    eliminateFaction(id, byFaction);
    return;
  }
  for (const k of best.bigKeys) { const m = G.tiles.get(k); m.res = null; m.garrison = 0; }
  f.capKey = keyOf(best.q, best.r);
  addLog(-1, { klic: "kron.vykoreneni", param: { kdo: byFaction.name, rod: f.name, kraj } });
  return;
}

function eliminateFaction(id, byFaction) {
  const f = G.factions[id];
  f.alive = false;
  f.marches = [];
  zrusPrehled();
  for (const t of G.tiles.values()) {
    if (t.owner === id) {
      t.owner = -1;
      delete t.clen; // v0.32: členské vlastnictví padá s frakcí
      delete t.okno; // rozběhnutá obléhací okna padlé frakce končí
      delete t.odol;
      if (t.big) continue;   // člen bloku posádku nemá — nese ji kotva
      if (t.structure === "outpost") { t.structure = null; t.outpost = null; zrusVyspy(); }
      t.garrison = t.structure
        ? Math.round(struktMilice(t) * 0.6)
        : Math.round(LEVEL_GARRISON[t.level] * 0.6 * (t.bigSize === 2 ? 2 : 1));
      if (t.structure === "capital") t.garrison = 350;
    }
  }
  addLog(id, { klic: "kron.rod.padl", param: { rod: f.name, kdo: byFaction.name } });
  // pád posledního soupeře (nebo hráče) končí sezónu okamžitě
  const alive = G.factions.filter(x => x.alive);
  if (alive.length <= 1) {
    G.gameOver = true;
    if (alive.length === 1) addLog(-1, { klic: "kron.sezona.vitez", param: { rod: alive[0].name, svet: SVET_JMENO } });
  } else if (!G.factions[G.playerFaction].alive) {
    G.gameOver = true;
    addLog(-1, { klic: "kron.tvuj.rod.padl" });
  }
}

// ---------- Diplomacie ----------
// vojenská síla frakce pro odhady AI (zásoba + armády v poli a na pochodu)
function militaryPower(f) {
  let units = armyTotal(f.units);
  for (const h of f.heroes) units += armyTotal(h.army);
  for (const m of f.marches) units += armyTotal(m.army);
  return units;
}

// hráč nabízí AI frakci pakt o neútočení (tribut propadá i při odmítnutí)
function offerPact(faction, targetId) {
  faction = frakceOf(faction) || faction; // v0.32: diplomacie je frakční
  const ai = G.factions[targetId];
  if (!ai || !ai.alive || targetId === faction.id) return { ok: false, why: "Neplatný cíl." };
  if (hasPact(faction, ai)) return { ok: false, why: "Pakt už platí." };
  if (jeValka(faction, targetId) || jeValka(ai, faction.id))
    return { ok: false, why: "Ve válce se pakt neuzavírá." };
  if ((ai.pactCooldown[faction.id] || 0) > 0)
    return { ok: false, why: `${ai.name} teď o paktu nechce jednat.` };
  if (faction.resources.gold < PACT_COST) return { ok: false, why: "Nedostatek zlata na tribut." };
  faction.resources.gold -= PACT_COST;
  // ochota: povaha frakce × poměr sil (silného souseda je lepší nedráždit);
  // zrazená frakce nabídku nikdy nepřijme
  const ratio = militaryPower(faction) / Math.max(1, militaryPower(ai));
  let chance = 0.30 * ai.ai.trust + 0.30 * Math.min(1.5, ratio);
  if (ai.grudge[faction.id]) chance = 0;
  if (rng() < chance) {
    faction.pacts[targetId] = PACT_DURATION;
    ai.pacts[faction.id] = PACT_DURATION;
    emitEvent("pact", faction.id);
    addLog(faction.id, { klic: "kron.pakt.prijat", param: { a: ai.name, b: faction.name, doba: PACT_DURATION } });
    return { ok: true, accepted: true };
  }
  ai.pactCooldown[faction.id] = PACT_REFUSE_COOLDOWN;
  addLog(faction.id, { klic: "kron.pakt.odmitnut", param: { a: ai.name, b: faction.name } });
  return { ok: true, accepted: false };
}

// vypovězení paktu: okamžité, ale roznese se — frakce dlouho nedůvěřuje
function cancelPact(faction, targetId) {
  faction = frakceOf(faction) || faction; // v0.32: diplomacie je frakční
  const ai = G.factions[targetId];
  if (!ai || !hasPact(faction, ai)) return false;
  delete faction.pacts[targetId];
  delete ai.pacts[faction.id];
  ai.grudge[faction.id] = 1;
  ai.pactCooldown[faction.id] = PACT_BETRAYAL_COOLDOWN;
  addLog(faction.id, { klic: "kron.pakt.vypoved", param: { a: faction.name, b: ai.name, svet: SVET_JMENO } });
  return true;
}

// hráč reaguje na nabídku paktu od AI (AI platí tribut hráči)
function acceptAiOffer(aiId) {
  const ai = G.factions[aiId];
  const me = G.factions[G.playerFaction];
  if (!ai || ai.offerToPlayer <= 0) return false;
  if (jeValka(me, aiId) || jeValka(ai, me.id)) { ai.offerToPlayer = 0; return false; }
  ai.offerToPlayer = 0;
  ai.pacts[me.id] = PACT_DURATION;
  me.pacts[aiId] = PACT_DURATION;
  ai.resources.gold = Math.max(0, ai.resources.gold - 50);
  me.resources.gold += 50;
  emitEvent("pact", me.id);
  addLog(me.id, { klic: "kron.pakt.prijal.hrac", param: { a: me.name, b: ai.name } });
  return true;
}

function declineAiOffer(aiId) {
  const ai = G.factions[aiId];
  if (!ai || ai.offerToPlayer <= 0) return false;
  ai.offerToPlayer = 0;
  ai.pactCooldown[G.playerFaction] = PACT_REFUSE_COOLDOWN;
  addLog(G.playerFaction, { klic: "kron.pakt.odmitl.hrac", param: { rod: ai.name } });
  return true;
}

// ---------- Putovní události a rytmus sezóny ----------
function spawnMapEvent() {
  const candidates = [...G.tiles.values()].filter(t =>
    t.owner === -1 && TERRAIN[t.terrain].passable && !t.structure
    && !t.big && !t.bigSize && !mapEventAt(keyOf(t.q, t.r)));
  if (!candidates.length) return;
  const t = candidates[randInt(0, candidates.length - 1)];
  const types = Object.keys(MAP_EVENTS);
  const type = types[randInt(0, types.length - 1)];
  const def = MAP_EVENTS[type];
  G.mapEvents.push({ key: keyOf(t.q, t.r), type, ticksLeft: def.dur, total: def.dur });
  emitEvent("mapEvent", -1);
  addLog(-1, { klic: "kron.udalost.prichod", param: { ikona: def.icon, co: def.name, pole: tileKlic(t), popis: def.desc } });
}

function tickWorld() {
  tikPolitiky();   // rozhodující klan, hlasování a odpočty vyhlášení (etapa 10)
  // klany: úroveň z kumulativní síly členů, ve stejném rytmu jako Prsten
  if (G.tick > 0 && G.tick % ringGrantTicks() === 0) klanTick();
  // VÝPOVĚĎ Z KLANU: mlčení se počítá jako odmítnutí. Bez toho by se dala
  // obejít tím, že se hráč prostě nepřihlásí — a vyhazov by nebyl STAV,
  // ale dialog, který jde ignorovat.
  for (const f of G.factions) for (const a of vsichniClenove(f)) {
    if (a.vyhazov && G.tick >= a.vyhazov.doTiku) odmitniVyhazov(a);
  }
  // putovní události: nové se objevují, staré vyprchávají
  if (G.tick >= G.nextEventTick) {
    if (G.mapEvents.length < EVENT_MAX) spawnMapEvent();
    G.nextEventTick = G.tick + randInt(EVENT_INTERVAL[0], EVENT_INTERVAL[1]);
  }
  for (const e of G.mapEvents) e.ticksLeft--;
  for (const e of G.mapEvents.filter(e => e.ticksLeft <= 0)) {
    const def = MAP_EVENTS[e.type];
    addLog(-1, { klic: "kron.udalost.odchod", param: { ikona: def.icon, co: def.name, pole: tileKlic(G.tiles.get(e.key)) } });
  }
  G.mapEvents = G.mapEvents.filter(e => e.ticksLeft > 0);

  // popelná bouře
  if (G.storm > 0) {
    if (--G.storm === 0) addLog(-1, { klic: "kron.boure.konec", param: { svet: SVET_JMENO } });
  } else if (G.tick >= G.nextStormTick) {
    G.storm = STORM_DUR;
    G.nextStormTick = G.tick + randInt(STORM_INTERVAL[0], STORM_INTERVAL[1]);
    emitEvent("storm", -1);
    addLog(-1, { klic: "kron.boure.zacatek", param: { doba: STORM_DUR } });
  }

  // otevření Trůnního města v půlce sezóny
  if (!G.throneOpen && G.tick >= THRONE_UNLOCK) {
    G.throneOpen = true;
    emitEvent("throne", -1);
    addLog(-1, { klic: "kron.trun.otevren" });
  }

  // otevírání světa (v0.30) + kolektivní checkpointy (v0.31): jeden průchod
  // mapy měří společný postup; splněný checkpoint dá VŠEM +polí do stropu
  // (klidně i pozdě, po pojistce) a otevírá svou fázi — pojistka otevře jen
  // zónu, porce polí je odměna za skutečné splnění
  if ((G.faze < 4 || G.checkpointy.some(c => !c)) && G.tick % 5 === 0) {
    const m = { zivych: G.factions.filter(f => f.alive).length || 1,
      poli: 0, granty: 0, silnych: 0 };
    for (const t of G.tiles.values()) {
      if (t.owner === -1) continue;
      m.poli++;
      if (t.structure === "grandfort") m.granty++;
      if (!t.structure && t.level >= 7) m.silnych++;
    }
    for (let i = 0; i < CHECKPOINTY.length; i++) {
      if (G.checkpointy[i] || !CHECKPOINTY[i].check(m)) continue;
      G.checkpointy[i] = true;
      emitEvent("zone", -1);
      addLog(-1, { klic: "kron.checkpoint", param: { popis: CHECKPOINTY[i].popis, poli: CHECKPOINTY[i].bonusPoli } });
    }
    if (G.faze < 4) {
      const dalsi = G.faze + 1;
      const splneno = !!G.checkpointy[dalsi - 2];
      if (splneno || G.tick >= zoneFazeTicks(dalsi)) {
        G.faze = dalsi;
        emitEvent("zone", -1);
        addLog(-1, { klic: "kron.faze." + dalsi + (splneno ? ".checkpoint" : ".pojistka") });
      }
    }
  }

  // obnova neutrálních posádek (pomalu dorůstají k plné síle)
  // + odpočet obléhacích oken: promeškané okno stavbu obnoví i s posádkou
  // ETAPA 11b: jede se přes ŽIVÁ POLE, ne přes celý svět (viz obnovZive)
  if (!G.zive || G.tick % ZIVE_OBNOVA === 0) obnovZive();
  for (const k of [...G.zive]) {
    const t = G.tiles.get(k);
    if (!t) { G.zive.delete(k); continue; }
    tikniPole(t);
    if (G.dotcene) G.dotcene.add(k);   // posádka dorostla / odpočet tikl
    if (!potrebujePozornost(t)) G.zive.delete(k);
  }

  // pakty: odpočet (každý pár jednou), vypršení hlásí Kronika
  for (const f of G.factions) {
    for (const oid in f.pacts) {
      const o = +oid;
      if (f.id < o) {
        f.pacts[oid]--;
        G.factions[o].pacts[f.id] = f.pacts[oid];
        if (f.pacts[oid] <= 0) {
          delete f.pacts[oid];
          delete G.factions[o].pacts[f.id];
          addLog(-1, { klic: "kron.pakt.vyprsel", param: { a: f.name, b: G.factions[o].name } });
        }
      }
    }
    for (const oid in f.pactCooldown) {
      if (--f.pactCooldown[oid] <= 0) delete f.pactCooldown[oid];
    }
    if (f.offerToPlayer > 0) f.offerToPlayer--;
  }

  // příběh sezóny (v0.31): kapitoly se vyhodnocují KAŽDÉMU aktérovi každé
  // živé frakce (v0.32: členové mají vlastní příběh) — AI je plní přirozeně
  // hrou. Throttle po 5 ticích (checky skenují mapu)
  if (G.tick % 5 === 0) for (const f of G.factions) {
    if (!f.alive) continue;
    for (const a of vsichniClenove(f)) {
      if (!a.journey) continue;
      const kap = KAPITOLY[a.journey.kapitola];
      if (!kap) continue; // příběh dovyprávěn
      let vseSplneno = true;
      for (const q of kap.quests) {
        if (a.journey.splnene[q.key]) continue;
        if (!q.check(a)) { vseSplneno = false; continue; }
        a.journey.splnene[q.key] = true;
        if (!a.isAI) {
          emitEvent("goal", a.id, a.cid);
          addLog(a.id, { klic: "kron.quest", param: { popis: q.desc } });
        }
      }
      if (!vseSplneno) continue;
      // kapitola hotová: odměna + strop +10 + další kapitola
      a.journey.kapitola++;
      a.journey.splnene = {};
      for (const res in kap.reward) a.resources[res] += kap.reward[res];
      const rewardTxt = Object.entries(kap.reward)
        .map(([r, v]) => `+${v} ${{ food: "🌾", wood: "🪵", stone: "🪨", iron: "⚙" }[r] || "🪙"}`).join(" ");
      addLog(a.id, { klic: "kron.kapitola", param: { kapitola: kap.name, odmena: rewardTxt } });
      if (!a.isAI) {
        emitEvent("goal", a.id, a.cid);
        grantCores(a.id, 20, "dokončená kapitola příběhu", a.cid);
      }
    }
  }
}

// ---------- Mlha války ----------
// hráč vidí své území s okolím, hrdiny (dohled 2) a trasy vlastních pochodů;
// vše ostatní je zahaleno — jednou spatřená pole zůstávají prozkoumaná
// dosah dohledu v Manhattan poloměru: vlastní pole vidí jen k sousedům,
// hrdina v poli dohlédne dál (v0.41: 2 → 3, zadání uživatele — armáda v poli
// má mít o pole větší rozhled než holé území)
const DOHLED_POLE = 1;
// ETAPA 11: dohled hrdiny 3 → 5. Na velkých mapách je REACH zastropovaný na 40
// a hráč je lokální, takže musí vidět aspoň své nejbližší okolí pořádně.
const DOHLED_HRDINA = 5;
const DOHLED_POCHOD = 1;

function computeVisibility() {
  const me = G.factions[G.playerFaction];
  if (!me) return;
  const vis = new Set();
  const addR = (q, r, rad) => {
    // Manhattan okolí — dohled sahá tam, kam se dá dojít
    for (let dq = -rad; dq <= rad; dq++) {
      const zb = rad - Math.abs(dq);
      for (let dr = -zb; dr <= zb; dr++) {
        const k = keyOf(q + dq, r + dr);
        if (G.tiles.has(k)) vis.add(k);
      }
    }
  };
  // v0.32: členové jedné frakce SDÍLÍ mapu — území frakce + hrdinové a
  // pochody všech spoluhráčů
  // etapa 8: dohled je pořád frakční, ale vyvrhel z něj vypadává — pole,
  // hrdiny ani pochody s ním rod nesdílí
  const ja = clenPodleCid(me, G.playerClen || 0) || me;
  // etapa 10: SPOJENEC sdílí dohled — jeMoje ho už zahrnuje, hrdiny doplníme níž
  for (const t of G.tiles.values()) if (jeMoje(ja, t)) addR(t.q, t.r, DOHLED_POLE);
  const spoj = G.factions[spojenecId(me)];
  if (spoj && jsouSpojenci(me, spoj)) {
    for (const a of vsichniClenove(spoj)) for (const h of a.heroes) {
      if (!h.pos) continue;
      const t = G.tiles.get(h.pos);
      if (t) addR(t.q, t.r, DOHLED_HRDINA);
    }
  }
  // ETAPA 11: hrdinové a pochody se sdílí po KLANU, ne po celém rodu — rod
  // o stovce členů by jinak odkryl celou mapu a mlha by ztratila smysl.
  // Kdo v klanu není, sdílí po rodu jako dřív (malá hra se tím nemění).
  // Území rodu i spojence je vidět dál (řeší ho jeMoje výš).
  const mujKlan = ja.klan || 0;
  for (const a of vsichniClenove(me)) {
    if (!poutaSdili(a, ja)) continue;
    if (mujKlan && (a.klan || 0) !== mujKlan) continue;
    for (const h of a.heroes) {
      if (!h.pos) continue;
      const t = G.tiles.get(h.pos);
      addR(t.q, t.r, DOHLED_HRDINA);
    }
    for (const m of a.marches) {
      const ta = G.tiles.get(m.fromKey), tb = G.tiles.get(m.targetKey);
      if (ta) addR(ta.q, ta.r, DOHLED_POCHOD);
      if (tb) addR(tb.q, tb.r, DOHLED_POCHOD);
    }
  }
  G.visible = vis;
  for (const k of vis) G.explored.add(k);
}

const isVisible = key => G.visible.has(key);

// ETAPA 11b: NA SERVERU SE DOHLED NEPOČÍTÁ.
// `computeVisibility` je pohled JEDNOHO hráče (G.playerFaction) — v sólo hře
// toho, kdo sedí u obrazovky. Server ho k ničemu nepoužívá: každý klient si
// mlhu spočítá sám (net.js po každém snímku) z dlaždic, které mu pošle AOI.
// Do etapy 11b tedy server každou vteřinu prošel celý svět pro nikoho.
let serverovyRezim = false;
function nastavServerovyRezim(v) { serverovyRezim = !!v; }
const isExplored = key => G.explored.has(key);

// ---------- AI ----------
// proporcionální výběr `count` jednotek ze zásoby
function aiSlice(f, cpBudget, klice) {
  // rozpočet je v BODECH VELENÍ — sarnská jednotka váží 2
  // Tři formace (etapa 6): bere se nejvýš FORMACI_MAX druhů — ty nejsilnější
  // v zásobě, měřeno v CP, aby AI vlajku nasadila, jakmile jí něco stojí za to.
  const klic = (klice || UNIT_KEYS).filter(k => f.units[k] > 0)
    .sort((a, b) => f.units[b] * uDef(f, b).cp - f.units[a] * uDef(f, a).cp)
    .slice(0, FORMACI_MAX);
  const totalCp = klic.reduce((a, k) => a + f.units[k] * uDef(f, k).cp, 0);
  if (totalCp <= 0) return null;
  cpBudget = Math.min(cpBudget, totalCp);
  const out = emptyArmy();
  let vzato = 0;
  for (const k of klic) {
    const cp = uDef(f, k).cp;
    out[k] = Math.min(f.units[k], Math.floor(cpBudget * (f.units[k] * cp / totalCp) / cp));
    vzato += out[k] * cp;
  }
  for (const k of klic) { // dorovnej zbytek
    const cp = uDef(f, k).cp;
    while (vzato + cp <= cpBudget && out[k] < f.units[k]) { out[k]++; vzato += cp; }
  }
  return armyTotal(out) > 0 ? out : null;
}

// AI utrácí body dovedností: postupuje vlastním stromem odshora dolů k ultimátce
function aiSpendSkills(f) {
  for (let i = 0; i < f.heroes.length; i++) {
    const h = f.heroes[i];
    let safety = 24;
    while (h.skillPts > 0 && safety-- > 0) {
      let learned = false;
      for (const s of heroDef(f, i).tree) {
        if (learnSkill(f, i, s.key)) { learned = true; break; }
      }
      if (!learned) break;
    }
  }
}

// AI rozdá kořist: každý slot každého hrdiny dostane nejlepší dostupný kus
function aiAutoEquip(f) {
  for (let i = 0; i < f.heroes.length; i++) {
    const h = f.heroes[i];
    for (const slot of ITEM_SLOT_KEYS) {
      let best = null;
      for (const it of f.items) {
        if (it.slot === slot && (!best || it.value > best.value)) best = it;
      }
      if (best && (!h.equip[slot] || best.value > h.equip[slot].value)) equipItem(f, i, best.id);
    }
  }
}

// Kolik převahy chce AI proti odhadu obrany pole. Kalibruje se PROTI GATE:
// příliš nízko a AI útočí do ztráty, příliš vysoko a nikdy nezaútočí.
let ODHAD_OBRANY = 1.7;
function setOdhadObrany(v) { ODHAD_OBRANY = v; }   // ladicí knob pro sim

const AI_BUILD_ORDER = [
  ["main", 2], ["barracks", 2], ["up_inf", 1], ["hospital", 1], ["main", 3],
  ["barracks", 3], ["up_arch", 1], ["up_cav", 1], ["main", 4],
  ["barracks", 4],   // v0.52: bez toho AI nikdy neodemkne vlajku rodu
  ["hospital", 2],
  ["up_inf", 2], ["main", 5], ["up_arch", 2], ["hospital", 3], ["up_cav", 2],
  // 31. 8. 2026: vlajka je nově za hlavní budovou 7, takže AI musí mít kam
  // dojít — jinak by ji na dlouhé sezóně neodemkla nikdy. Je to až na konci
  // pořadí, protože do té doby má co stavět a na main 6–7 stejně dlouho šetří.
  ["main", 6], ["main", 7],
];

// Které tři druhy si AI staví. Vlajka NAHRAZUJE základní jednotku své role,
// takže durgarští trolové (clona) jdou místo pěchoty a aldarští gryfové
// (střelec) místo lučištníků — armáda zůstane o třech formacích a AI si
// nenaverbuje čtvrtý druh, který by pak jen žral žold.
// (aiSlice bere pořád tři NEJSILNĚJŠÍ druhy ze zásoby, takže se zbytky po
// přepnutí dojedou v boji a nezůstanou ležet.)
function aiTrio(f) {
  const zaklad = ["inf", "arch", "cav"];
  if (!unitUnlocked(f, "big")) return zaklad;
  const ud = unitsOf(f);
  const role = radaJednotky(ud, "big");
  const nahrada = zaklad.find(k => radaJednotky(ud, k) === role) || "inf";
  return zaklad.filter(k => k !== nahrada).concat("big");
}

// základny frakce pro rádius: kotva kapitálu + všechny vlastní výspy
// AI utrácí body stromu Prstenu (v0.31): u stropu území sype do Nadvlády,
// jinak nejdřív bojové větve — jeden bod za tah stačí
function aiSpendRing(f) {
  const r = f.ring;
  if (!r || !r.strom || (r.body || 0) < 1) return;
  const uStropu = pocetPoli(f) >= stropPoli(f) - 6;
  const poradi = uStropu
    ? ["nadvlada", "veleni", "vydrz", "sklizen", "vlada", "hojnost"]
    : ["veleni", "vydrz", "nadvlada", "sklizen", "hojnost", "vlada"];
  for (const k of poradi) if (ringLearn(f, k)) return;
}

// Základny AI = kapitál + její výspy. Dřív se výspy hledaly PRŮCHODEM CELÉHO
// SVĚTA, a to jednou za tik na každý rod (na 1459×1459 to bylo 15 ms z tiku).
// Výsp je přitom v celé hře řádově pár desítek, takže se evidují (viz vyspyRodu).
function aiZakladny(f) {
  const zakladny = [capPosOf(f)];
  for (const t of vyspyRodu(f.id)) zakladny.push(t);
  return zakladny;
}

function aiTurn(f) {
  // stavba budov dle priorit
  if (!f.build) {
    for (const [key, target] of AI_BUILD_ORDER) {
      const cur = key.startsWith("up_") ? f.upgrades[key.slice(3)] : f.buildings[key];
      if (cur >= target) continue;
      if (canBuild(f, key).ok) startBuild(f, key);
      break;
    }
  }
  // verbuj typ, kterého má nejméně (max 2 ve frontě), nehromaď obří armádu
  // a neverbuj, když armádu neuživí (údržba jídlem)
  // jídlo verbování neomezuje (žold zrušen 30. 8.) — brzdou je strop zásoby
  if (armyTotal(f.units) < 4449 && f.recruitQueue.length < 2) {
    // vyvažuje se podle VELENÍ, ne podle počtu kusů — vlajka za 25 CP by
    // jinak byla vždycky „ta, které mám nejmíň" a AI by stavěla jen ji
    const avail = aiTrio(f).filter(k => unitUnlocked(f, k));
    avail.sort((a, b) => f.units[a] * uDef(f, a).cp - f.units[b] * uDef(f, b).cp);
    for (const type of avail) {
      // objednává se v BODECH VELENÍ, ne po dávkách: dávka 56 kusů je
      // u pěchoty 56 CP, ale u vlajky za 25 CP hned 1 400 CP naráz a AI si
      // na ni nikdy nenašetřila (tři rody kvůli tomu vlajku nepostavily vůbec)
      const kusu = Math.max(1, Math.round(RECRUIT_BATCH / (uDef(f, type).cp || 1)));
      if (startRecruitOrder(f, { [type]: kusu })) break;
    }
  }
  // najmi dalšího hrdinu, když na to je (a zbyde rezerva)
  const heroCost = nextHeroCost(f);
  if (heroCost !== null && f.resources.gold > heroCost + 150) hireHero(f);
  if (f.aiCooldown-- > 0) return;
  f.aiCooldown = randInt(3, 6);
  aiAutoEquip(f);
  aiSpendSkills(f);
  aiSpendRing(f);

  // ---- akční rádius (v0.29): výspy směrem k Trůnu a usazování hrdinů ----
  const zakladny = aiZakladny(f);
  const trun = tileAt(0, 0);
  const kTrunu = Math.min(...zakladny.map(b => gridDist(b, trun)));
  // koncovka dosahu, dva stupně: ŠIROKÁ (mise nesplněná a sezóna pokročilá —
  // stráže dolů, piny neblokují útok) a TĚSNÁ (základny už skoro dosáhnou —
  // dostředivý tah najisto a fronta na jeho cíl). Široká nesmí řídit frontu:
  // škrtila by výpady celé střední hry
  const koncovka = kTrunu > REACH && G.tick > SEASON_TICKS * 0.35;
  const koncovkaTesna = kTrunu > REACH && kTrunu <= REACH + 6;
  // strop území (v0.31) — spočítat JEDNOU za tah, ne v kandidátské smyčce
  const mamPoli = pocetPoli(f), strop = stropPoli(f);
  // když žádná základna nedosáhne na střed, postav výspu na vlastním poli
  // nejblíž Trůnu (fronta expanze) — s odstupem od stávajících základen
  if (kTrunu > REACH && zakladny.length < 6 && canAfford(f, OUTPOST_COST)) {
    let spot = null, sd = Infinity, nouze = null, nd = Infinity;
    for (const t of G.tiles.values()) {
      if (t.owner !== f.id || t.structure || t.big || t.bigSize || t.riv) continue;
      if (!TERRAIN[t.terrain].passable || t.terrain === "bridge") continue;
      const d = gridDist(t, trun);
      if (d > kTrunu - 2) continue;                // musí přiblížit aspoň o kus
      if (d < nd) { nd = d; nouze = t; }           // nouzový spot bez rozestupu
      // rozestup platí, jen dokud výspa nedosáhne na Trůn — „dokončovací"
      // výspa u středu smí stát klidně hned vedle předchozí
      if (d > REACH && zakladny.some(b => gridDist(b, t) < 5)) continue;
      if (d < sd) { sd = d; spot = t; }
    }
    // těsný koridor (řeka + blok v cestě): rozestup nedovolí nic, ale cíl je
    // na dohled — POSLEDNÍ „mezivýspa" smí stát natěsno. Jen v pásmu těsně nad
    // REACH; plošně by AI spamovala výspy po −2 krocích a spálila strop 6
    // základen (v0.30, seed 1294: město 3×3 + řeka pečetily durgarům cestu)
    if (!spot && nouze && nd > REACH && nd <= REACH + 2) spot = nouze;
    if (spot) buildOutpost(f, spot);
  }
  // usazení: hrdina stojící na vlastní výspě blíž Trůnu z ní udělá základnu
  for (let i = 0; i < f.heroes.length; i++) {
    const h = f.heroes[i];
    if (!h.pos || heroBusy(f, i)) continue;
    const t = G.tiles.get(h.pos);
    if (!t || t.structure !== "outpost" || t.owner !== f.id) continue;
    if (h.zakladna === h.pos) continue;
    const [bq, br] = heroBaseKey(f, h).split(",").map(Number);
    if (gridDist(t, trun) < gridDist({ q: bq, r: br }, trun)) heroSettle(f, i);
  }
  // pošli volného domácího hrdinu obsadit výspu blíž středu (přesun na vlastní
  // pole). Zásoba města je zároveň obrana kapitálu — držet rezervu a při
  // otevřeném oknu na vlastním kapitálu nikam neodjíždět!
  const kapitalOblezen = (G.tiles.get(capKeyOf(f)) || {}).okno > 0;
  const zasobaCp = armyCp(f.units, f);
  if (!kapitalOblezen && zasobaCp > 1668) for (let i = 0; i < f.heroes.length; i++) {
    const h = f.heroes[i];
    if (h.pos || h.cooldown > 0 || !heroReady(f, i)) continue;
    const [bq, br] = heroBaseKey(f, h).split(",").map(Number);
    const zBase = gridDist({ q: bq, r: br }, trun);
    let cilV = null, cd2 = Infinity;
    for (const t of zakladny) {
      if (t.structure !== "outpost") continue; // (první prvek je kapitál)
      const d = gridDist(t, trun);
      if (d >= zBase) continue; // jen výspy blíž ke středu než dnešní základna
      if (marchStaminaCost(f, t, i) > h.stamina) continue; // dojde mu dech
      const key = keyOf(t.q, t.r);
      const tam = f.heroes.filter((h2, i2) => i2 !== i
        && (h2.pos === key || h2.zakladna === key)).length
        + f.marches.filter(m => m.heroIdx != null && m.targetKey === key).length;
      if (tam >= 2) continue; // nejvýš dva hrdinové na výspu (i s těmi na cestě)
      if (d < cd2) { cd2 = d; cilV = t; }
    }
    if (cilV) {
      const army = aiSlice(f, Math.min(2225, heroArmyCap(f, i), zasobaCp - 834));
      if (army && armyCp(army, f) >= 278 && startMarch(f, cilV, army, i)) break; // jeden přesun za tah
    }
  }
  // diplomacie: slabší AI občas nabídne hráči pakt (tribut platí ona)
  const player = G.factions[G.playerFaction];
  if (player.alive && !hasPact(f, player) && f.offerToPlayer <= 0
      && !(f.pactCooldown[player.id] > 0) && !f.grudge[player.id]
      && !jeValka(f, player) && !jeValka(player, f)
      && rng() < 0.12) {
    const ratio = militaryPower(player) / Math.max(1, militaryPower(f));
    if (ratio > 1.3 * f.ai.aggression) {
      f.offerToPlayer = 60;
      emitEvent("offer", player.id);
      addLog(player.id, { klic: "kron.pakt.nabidka", param: { rod: f.name, povaha: f.ai.mood } });
    }
  }

  // hrdinům v poli posílej posily; úplně slabé (když nejsou vojáci) stáhni domů
  for (let i = 0; i < f.heroes.length; i++) {
    const h = f.heroes[i];
    const obleha = f.marches.some(m => m.heroIdx === i && m.kind === "siege");
    if (!h.pos || h.cooldown > 0 || (heroBusy(f, i) && !obleha)) continue;
    // hrdina hlídkující na struktuře (most, město…) s plnou výdrží drží stráž
    // (prahy v CP — sarnská jednotka váží 2, jinak by sarn jednal poloviční).
    // V KONCOVCE dosahu se stráž pouští: žere výdrž (cyklus 0↔70) a hrdina
    // by finální pole nikdy nedobyl (v0.30, seed 668)
    if (!h.guard && !obleha && !koncovka && h.stamina > 70
      && G.tiles.get(h.pos).structure && armyCp(h.army, f) > 334)
      toggleGuard(f, i);
    else if (h.guard && koncovka) toggleGuard(f, i);
    if (armyCp(h.army, f) < 1668 && armyCp(f.units, f) > 1112) {
      const alreadyComing = f.marches.some(m => m.kind === "reinforce" && m.targetKey === h.pos);
      if (!alreadyComing) {
        const room = heroArmyCap(f, i) - heroArmyCommitted(f, i); // limit velení
        const send = aiSlice(f, Math.min(2113 - armyCp(h.army, f), armyCp(f.units, f) - 556, room));
        if (send && armyTotal(send) > 0) startReinforce(f, G.tiles.get(h.pos), send);
      }
    } else if (armyCp(h.army, f) < 139 && armyCp(f.units, f) <= 1112) {
      startRecall(f, i);
    }
  }

  // kandidáti: průchozí pole sousedící s územím — hledají se JEN do REACH
  // od základen (viz poleVOkoli); dál by stejně propadly filtrem dosahu níž
  const targets = [];
  for (const t of poleVOkoli(zakladny, REACH)) {
    if (t.owner === f.id || !TERRAIN[t.terrain].passable) continue;
    if (t.big) continue;   // o blok se hraje přes kotvu
    if (!isAdjacentToFaction(f, t)) continue;
    if (t.structure === "throne" && !G.throneOpen) continue; // příměří u trůnu
    if (!zonaOtevrena(f, t)) continue;          // zamčená zóna světa (v0.30)
    if (dveArmady(t) && t.uzelCd > 0) continue; // uzavřený uzel/most po zátahu
    // strop území (v0.31): kandidát nad strop se nebere — jinak by AI pálila
    // vyhlášení válek a výpady o cíle, které stejně nesmí zabrat
    if (mamPoli + (t.bigSize ? blockTiles(t).length : 1) > strop
      && t.structure !== "throne" && t.structure !== "bridge") continue;  // brány jsou mimo strop
    if (t.owner !== -1 && hasPact(f, G.factions[t.owner])) continue; // pakt platí
    if (!zakladny.some(b => gridDist(b, t) <= REACH)) continue; // mimo dosah všech základen
    if (t.structure === "capital" && t.owner !== -1 && !jeValka(f, t.owner)) {
      // na kapitál je válka povinná — agresor ji vyhlásí, mírný počká;
      // před 30 % sezóny se nevyhlašuje (kandidát by stejně hned propadl
      // a cooldown by shořel naprázdno)
      if (G.tick < SEASON_TICKS * 0.3 && !f.grudge[t.owner]) continue;
      if (!(G.tick >= (f.valkaCd || 0) && rng() < 0.25 * f.ai.aggression
        && declareWar(f, t.owner))) continue;
    }
    if (jeVelkaStavba(t) && t.structure !== "capital" && G.tick > SEASON_TICKS * 0.3) {
      // bourání v cizím DRŽENÉM kraji bez války je za 30 % — zkus vyhlásit;
      // NIKDY přes pakt (válka by ho roztrhla hodem kostky)
      const drzitel = regionHolderId(t);
      if (drzitel !== -1 && drzitel !== f.id && !jeValka(f, drzitel)
          && !hasPact(f, G.factions[drzitel])
          && G.tick >= (f.valkaCd || 0) && rng() < 0.2 * f.ai.aggression)
        declareWar(f, drzitel);
    }
    const def = tileDefense(t);
    // Boj v kolech vyžaduje výraznější převahu než prosté porovnání síly.
    // ETAPA 7: odhad se dívá i na VELITELE. Do teď počítal jen s posádkou,
    // protože neutrální velitel byl slabý — od IV-L má výbavu podle tieru
    // a nese zhruba polovinu obtížnosti pole. Změřeno na vzorku polí
    // i staveb: skutečná potřeba vyšla ≈ 2× posádka (dřív ≈ 1,3×), a AI
    // s odhadem 1,25 útočila s polovinou toho, co potřebuje, takže přestala
    // stavět výspy a gate spadl na 75 %.
    const needed = Math.ceil(ODHAD_OBRANY * (def / (SOLDIER_POWER * f.attackMult) + def / 60)) + 2;
    let value = t.level;
    if (t.structure === "city") value += 8;
    if (t.structure === "bridge") value += 6; // brána do dalšího kvadrantu
    if (t.structure === "fortress") value += G.tick > SEASON_TICKS * 0.3 ? 12 : 4; // brána ke středu
    if (t.structure === "bastion") value += G.tick > SEASON_TICKS * 0.3 ? 10 : 3;  // rameno velké pevnosti
    if (t.structure === "grandfort") value += G.tick > SEASON_TICKS * 0.3 ? 20 : 5; // frakční bonus
    if (t.structure === "throne") value += G.tick > SEASON_TICKS * 0.4 ? 150 : 5;
    if (t.bigSize) value += t.level * (t.bigSize - 1); // blok = zábor víc polí naráz
    if (mapEventAt(keyOf(t.q, t.r))) value += 5; // putovní událost = odměna navíc
    if (t.owner !== -1) {
      // chuť napadat živé hráče řídí povaha frakce; zrada se nezapomíná
      if (G.tick < SEASON_TICKS * 0.3 && !f.grudge[t.owner]) continue;
      value += (t.structure === "capital" ? 25 : 2) * f.ai.aggression;
      if (f.grudge[t.owner]) value += 6;
    }
    targets.push({ t, needed, score: value / Math.max(1, needed) });
  }
  if (!targets.length) return;
  // dostředivý tah (v0.29): dokud základny nedosáhnou na Trůn, část tahů
  // tlačí frontu ke středu — jinak AI expanduje jen za lácí a zamrzne na kraji
  // v koncovce jede dostředivý tah najisto — každé kolo bez tlaku ke středu
  // je promarněné (v0.30, seed 1294)
  let dostredivy = null; // boostnutý cíl — koncovkový filtr ho nesmí odříznout
  if (kTrunu > REACH && (koncovkaTesna || rng() < 0.85)) {
    // míří na nejbližší NEblokový cíl — 2×2 uzly mají dvojité posádky,
    // na které rané armády nestačí, a tah by se o ně zasekl
    let stred = null, blok = null;
    // boost nemá cenu u cíle, který žádný hrdina neuveze (potreba nad stropy)
    const maxCap = Math.max(...f.heroes.map((h, i) => heroArmyCap(f, i)));
    for (const c of targets) {
      const d = gridDist(c.t, trun);
      // dostředivý tah jede VLASTNÍ drahou (výseč → mezikruží → vnitřek):
      // „nejbližší cíl středu" přes řeku v cizí výseči je slepá ulička —
      // dobytí neposune základny a AI tam vykrvácí (v0.30, seed 1294)
      const lane = zonaOf(c.t);
      if (lane !== "expanze-" + f.id && lane !== "kolebka-" + f.id
          && lane !== "mezikruzi" && lane !== "vnitrek") continue;
      if (c.t.bigSize) {
        // z bloků dávajících postup (blíž než dnešní kTrunu) kandiduje ten
        // NEJSLABŠÍ — nejbližší bývá dvou-armádový uzel, na který rané armády
        // nestačí, a boost by umřel na dispatch (potreba)
        // ETAPA 7: strop platí pro KAŽDÝ blok, ne jen pro uzel. Keep kraje
        // (5×5, posádka 12 000) je nejbližší blok v koridoru, takže se stával
        // dostředivým cílem a AI o něj mlátila armády celou sezónu —
        // gate spadl z 61/64 na 50/64. Na co hrdina neuveze, se netlačí.
        if (c.t.uzelCd > 0 || c.needed * 0.85 > maxCap) continue;
        if (d < kTrunu && (!blok || c.needed < blok.c.needed)) blok = { c, d };
        continue;
      }
      // ETAPA 7 dala strop „na co hrdina neuveze, se netlačí" JEN blokům —
      // u volných polí to tehdy nevadilo, protože hrdina 1. úrovně vezl
      // 1 112 CP a uvezl skoro všechno. S křivkou 300 + 100 za úroveň (v0.63)
      // je nejbližší pole ke středu často ⚔30+, na které raná armáda nestačí,
      // a AI o něj mlátila hlavu místo toho, aby si v kolébce dolevelovala.
      // Změřeno: brána 52/64 → viz níž. Stejné pravidlo, jen konečně všude.
      if (c.needed * 0.85 > maxCap) continue;
      if (!stred || d < stred.d) stred = { c, d };
    }
    // koridor těsní blok (město/uzel v cestě): na blok se tlačí JEN když volná
    // pole nedávají SKUTEČNÝ postup — výspa chce dobýt pole na d ≤ kTrunu−2,
    // takže kandidát na kTrunu−1 je jen šlapání vody. Plošný boost bloků by
    // naopak armády pálil o dvojité posádky (v0.30, seed 1294: město 3×3 +
    // řeka + vody pečetily durgarům jedinou cestu ke středu)
    if (blok && (!stred || stred.d > kTrunu - 2)) stred = blok;
    if (stred) { stred.c.score += kTrunu > Math.round(REACH * 1.2) ? 0.6 : 0.5; dostredivy = stred.c; }
  }
  targets.sort((a, b) => b.score - a.score);
  let vypady = 0; // až dva výpady za drahý tah — jinak škrtí frontu hrdinů
  for (const cand of targets.slice(0, 4)) {
    // koncovka: dostředivý cíl nesmí čekat ve frontě za tuláky — když je
    // vybraný a ještě nikdo na něm není, bere prvního volného hrdinu
    const naCili = cand.t.owner === -1 ? f.marches.filter(m =>
      m.kind === "attack" && m.targetKey === keyOf(cand.t.q, cand.t.r)).length : 0;
    if (koncovkaTesna && dostredivy && cand !== dostredivy
      && naCili === 0 && vypady === 0
      && !f.marches.some(m => m.kind === "attack" && m.targetKey === keyOf(dostredivy.t.q, dostredivy.t.r))) continue;
    // na jeden neutrální cíl nejvýš dva rozlétnuté zátahy — druhá vlna dorazí
    // do oslabené posádky a dobije ji, ale čtyřhlavá fronta jen pálí výdrž
    // (v0.30, seed 668: čtyři hrdinové v řadě na tomtéž poli)
    if (naCili >= 2) continue;
    let chosen = -1;
    for (let i = 0; i < f.heroes.length; i++) {
      const h = f.heroes[i];
      if (!heroReady(f, i, cand.t)) {
        // koncovka: samotný pin od konvoje útok blokovat nesmí — posily se
        // odvolají (vrátí se do města) a hrdina jde bojovat (v0.30, seed 668:
        // věčné pinování drželo plné a odpočaté hrdiny doma)
        const jenPin = koncovka && !heroBusy(f, i) && h.cooldown <= 0
          && h.stamina >= marchStaminaCost(f, cand.t, i) && heroPinned(f, i);
        if (!jenPin) continue;
        cancelReinforce(f, i);
        if (!heroReady(f, i, cand.t)) continue;
      }
      if (!vDosahu(f, h, cand.t)) continue; // cíl mimo dosah základny hrdiny
      if (kapitalOblezen && !h.pos) continue; // kapitál v oknu: domácí brání
      // proti neutrálům stačí 65 % odhadu — odražený útok přejde v obléhací
      // náběhy a posádka se semele (velké stavby tak jako tak čeká bourání);
      // porovnávat v CP, jinak sarn (cp 2) útočí s polovičním sebevědomím.
      // VÝJIMKA uzly 2×2 (v0.30): odražený zátah obě armády PLNĚ obnoví —
      // atriční 65% nálety tu jen krvácejí. Změřené minimum na dvě půlky je
      // ~0,86× odhadu (sekvenční bitvy jsou lehčí než jedna dvojitá) → 0,85
      const potreba = cand.t.owner === -1
        ? Math.ceil(cand.needed * (jeUzel(cand.t) ? 0.85 : 0.65)) : cand.needed;
      if (!h.pos && heroArmyCap(f, i) < potreba) continue; // neuvede dost jednotek
      const enough = h.pos ? armyCp(h.army, f) >= potreba : armyCp(f.units, f) >= potreba;
      if (enough) { chosen = i; break; }
    }
    if (chosen === -1) continue;
    const army = f.heroes[chosen].pos
      ? null // z pole jde celá armáda hrdiny
      : aiSlice(f, Math.min(Math.ceil(cand.needed * 1.15), heroArmyCap(f, chosen)));
    if (startMarch(f, cand.t, army, chosen) && ++vypady >= 2) break;
  }

  // osaď předsunuté výspy posádkou (v0.30): prázdná výspa padne prvnímu
  // nájezdu — a s ní celý dosah. Běží AŽ PO výpadech (útoky mají přednost
  // o zásobu) a jen z čerstvého stavu skladu; rezerva města zůstává nedotčená
  const poBoji = armyCp(f.units, f);
  if (!kapitalOblezen && poBoji > 2503) {
    let nejV = null, nd = Infinity;
    for (const t of zakladny) {
      if (t.structure !== "outpost" || !t.outpost) continue;
      if (armyCp(t.outpost, f) >= 1112) continue;  // už je osazená
      const d = gridDist(t, trun);
      if (d < nd) { nd = d; nejV = t; }
    }
    if (nejV) {
      const army = aiSlice(f, Math.min(1390, poBoji - 1668));
      if (army && armyCp(army, f) >= 278) outpostDeposit(f, nejV, army);
    }
  }
}

// ---------- Skóre a sezóna ----------
function scoreOf(faction) {
  let s = 0;
  for (const t of G.tiles.values()) {
    if (t.owner !== faction.id) continue;
    s += tierScore(t);
    if (t.structure) s += STRUCTURES[t.structure].score;
  }
  return Math.round(s);
}

// ---------- Log ----------
// ETAPA 12b: popisek pole se v kronice a v reportu posílá jako KLÍČ
// (`tileKlic`), aby si ho každý klient přeložil sám. `tileLabel` zůstává
// pro rozhraní, kde se lepí do hotového řetězce — vrátí rovnou větu
// v jazyce, který má prohlížeč zrovna nastavený.
function tileKlic(tile) {
  if (tile.structure) return { klic: "stav." + tile.structure };
  return { klic: "pole.sila", param: { krajina: { klic: "ter." + tile.terrain }, tier: tierOf(tile) } };
}
function tileLabel(tile) {
  const k = tileKlic(tile);
  const J = jazyky();
  return J.tx ? J.tx(k.klic, k.param) : J.txCs(k.klic, k.param);
}
// KRONIKA JE SERVEROVÝ KANÁL (etapa 9, IV-E). Záznam nese `id` (server ho
// rozesílá po kusech jako chat a reporty) a tři úrovně adresáta:
//   factionId -1        … SVĚT — pád klíčových bodů, dobyté rody, otevírání fází
//   factionId = rod     … kanál rodu, vidí ho všichni jeho aktéři
//   + cid               … OSOBNÍ záznam jednoho aktéra
//
// ⚠ Do etapy 9 šel CELÝ `G.log` každému hráči a filtroval se až v prohlížeči —
// kdokoli si mohl přečíst kroniku cizího rodu přímo z drátu. Teď se posílá
// jen to, co adresát smí vidět.
// Most na slovník: v prohlížeči je `tx` globální (jazyky.js je klasický
// skript), v Node se modul dotáhne přes require. Jméno `tx`, ne `t` — `t`
// je v tomhle souboru dlaždice na stovkách míst.
// (most na slovník je nahoře u tabulek jednotek — potřebuje ho unitsOf)

// ETAPA 12b: druhý parametr smí být KLÍČ do slovníku — `addLog(fid, {klic,
// param})`. Záznam pak nese klíč i parametry a větu složí až KLIENT ve svém
// jazyce; do `text` se navíc uloží česká podoba jako záloha pro klienta bez
// slovníku. Staré volání s hotovou větou funguje dál, takže se převádí po
// jednom a nic se nerozbije.
function addLog(factionId, text, reportId, cid) {
  let klic = null, param = null;
  if (text && typeof text === "object") {
    klic = text.klic; param = text.param || null;
    text = jazyky().txCs(klic, param);
  }
  const e = { id: (G.nextLogId = (G.nextLogId || 0) + 1), tick: G.tick, factionId, text };
  if (klic) { e.klic = klic; if (param) e.param = param; }
  if (reportId) e.reportId = reportId;
  if (cid) e.cid = cid;
  G.log.push(e);
  if (G.log.length > LOG_MAX) G.log.shift();
  return e.id;
}
const LOG_MAX = 200;
// smí tenhle aktér vidět tenhle záznam?
function logViditelny(a, e) {
  if (!a || !e) return false;
  if (e.factionId === -1) return true;                 // svět
  if (e.factionId !== a.id) return false;              // cizí rod
  return !e.cid || e.cid === (a.cid || 0);             // osobní jen svému aktérovi
}
function logProAktera(a, odId = 0) {
  return (G.log || []).filter(e => e.id > odId && logViditelny(a, e));
}


// Klíč dovednosti se odvozuje z ČESKÉHO TEXTU, ne z pozice ve stromu.
// Důvod: 672 dovedností nese jen 396 různých jmen a 210 různých popisů
// (knihovní stromy `rodovyStrom` se opakují napříč rody), takže by
// pozicové klíče znamenaly tutéž větu přeloženou třikrát — a při každé
// opravě překladu by se musela hledat na všech místech. Jméno a popis mají
// vlastní jmenný prostor (`dov.` × `dovp.`), protože patnáct jmen se
// v různých stromech pojí s různým popisem.
function slugCz(s) {
  return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 110);
}
// ---------- OBSAHOVÉ TABULKY VE TŘECH JAZYCÍCH (etapa 12b) ----------
// Tabulky jsou napsané ČESKY a čeština je předloha. Při přepnutí jazyka se
// jméno a popis přepíšou ze slovníku (klíč `bud.barracks`, popis `bud.barracks.d`);
// co slovník nezná, zůstane česky — nová budova tak jde přidat bez zásahu do
// tří jazyků a nikde se neobjeví ⟨klic⟩.
//
// PROČ PŘEPIS TABULKY, a ne `tx()` na každém místě: `BUILDINGS[k].name`,
// `MAP_EVENTS[k].desc` a spol. se čtou na víc než stovce míst v enginu
// i v rozhraní. Přepsat je jedno po druhém by znamenalo dělat tutéž práci
// znovu při každé nové budově. Takhle je to jedno místo.
//
// ⚠ Předloha se drží v `_predloha` — bez ní by se po druhém přepnutí
// překládal už překlad a čeština by se nevrátila.
const TABULKY = [
  ["bud",   () => BUILDINGS,     ["name", "desc"]],
  ["mist",  () => MASTER_BONUS,  ["name", "desc"]],
  ["boost", () => BOOST_KINDS,   ["name", "desc"]],
  ["udal",  () => MAP_EVENTS,    ["name", "desc"]],
  ["slot",  () => ITEM_SLOTS,    ["name"]],
  ["ter",   () => TERRAIN,       ["name"]],
  ["stav",  () => STRUCTURES,    ["name"]],
  ["rys",   () => HERO_TRAITS,   ["name", "desc"]],
  ["rar",   () => RARITIES,      ["name"]],
  ["tier",  () => HERO_TIERS,    ["name"]],
  ["vetev", () => RING_VETVE,    ["name", "per"]],
  ["pas",   () => ITEM_PASSIVES, ["name", "desc"]],
  ["cp",    () => CHECKPOINTY,   ["popis"]],
  ["dar",   () => RING_UNLOCKS,  ["txt"]],
  ["truhla", () => CHESTS,     ["name", "desc"]],
  ["strana", () => SIDES,      ["name", "gen"]],
];
let _predloha = null;
function _sesbirejPredlohu() {
  _predloha = [];
  for (const [, tab] of TABULKY) {
    const t = tab(), snap = {};
    for (const k in t) snap[k] = Object.assign({}, t[k]);
    _predloha.push(snap);
  }
  // vylepšovací budovy jsou holé řetězce v mapě rod → druh
  _predlohaVyl = {};
  for (const r in UNIT_UPGRADES) _predlohaVyl[r] = Object.assign({}, UNIT_UPGRADES[r]);
  // kapitoly příběhu: jméno kapitoly + popisy jejích úkolů
  _predlohaKap = KAPITOLY.map(k => ({ name: k.name, q: k.quests.map(q => q.desc) }));
  // stromy hrdinů: klíč dovednosti je v rámci hry jedinečný jen v páru s rodem
  _predlohaDov = {};
  for (const rod in HERO_DEFS) HERO_DEFS[rod].forEach((hd, i) => {
    for (const s of hd.tree) _predlohaDov[rod + "." + i + "." + s.key] = { name: s.name, desc: s.desc };
  });
}
// Předlohy tabulek se zvláštním tvarem (vnořené mapy, pole holých
// řetězců). `_predloha` výš drží ty obyčejné; bez předlohy by se po druhém
// přepnutí překládal už překlad a čeština by se nikdy nevrátila.
let _predlohaVyl = null, _predlohaDov = null, _predlohaKap = null,
    _predlohaRas = null, _predlohaRod = null, _predlohaTier = null, _predlohaTruhla = null,
    _predlohaBonus = null, _predlohaPas = null;
function prepisTabulky() {
  if (!_predloha) _sesbirejPredlohu();
  TABULKY.forEach(([pre, tab, pole], i) => {
    const t = tab(), p = _predloha[i];
    for (const k in t) for (const f of pole) {
      if (p[k] === undefined || p[k][f] === undefined) continue;
      t[k][f] = nazev(pre + "." + k + (f === "name" ? "" : "." + f[0]), p[k][f]);
    }
  });
  for (const r in UNIT_UPGRADES) for (const k in UNIT_UPGRADES[r])
    UNIT_UPGRADES[r][k] = nazev("vyl." + r + "." + k, _predlohaVyl[r][k]);
  for (const rod in HERO_DEFS) HERO_DEFS[rod].forEach((hd, i) => {
    for (const s of hd.tree) {
      const p = _predlohaDov[rod + "." + i + "." + s.key];
      s.name = nazev("dov." + slugCz(p.name), p.name);
      s.desc = nazev("dovp." + slugCz(p.desc), p.desc);
    }
  });
  // JMÉNO RODU (v0.70). Do teď zůstávalo česky i v anglické hře, protože se
  // bralo jako vlastní jméno Vellaru. Jenže ono je jen ZPOLA vlastní:
  // „Aldarské KRÁLOVSTVÍ" je popisný titul kolem jména Aldar. Překládá se
  // proto obal (království, hlubina, roj, sněm) a kmen zůstává — Aldar je
  // Aldar ve všech jazycích.
  //
  // ⚠ Přepisují se i ŽIVÉ frakce a jejich členové: člen si jméno rodu
  // KOPÍRUJE při vzniku (duck typing pro hlášky a reporty), takže by jinak
  // zůstal v jazyce, ve kterém sezóna začala. Hledá se podle KLÍČE rodu,
  // ne podle indexu — vyvrhel ani člen index nemají.
  if (!_predlohaRod) _predlohaRod = Object.fromEntries(FACTION_DEFS.map(d => [d.key, d.name]));
  for (const d of FACTION_DEFS) d.name = nazev("rod." + d.key, _predlohaRod[d.key]);
  for (const f of (G.factions || [])) {
    if (!f || !f.key || !_predlohaRod[f.key]) continue;
    const jm = nazev("rod." + f.key, _predlohaRod[f.key]);
    f.name = jm;
    for (const c of (f.clenove || [])) c.name = jm;
  }
  // popis strany = SEZNAM RODŮ (jména se překládají až od v0.70, ale pořád
  // jde o seznam, ne o větu ze slovníku)
  for (const s in SIDES)
    SIDES[s].desc = FACTION_DEFS.filter(d => FACTION_SIDE[d.key] === s).map(d => d.name).join(" · ");
  // jméno truhly podle STRANY je vnořená mapa (klíč `truhla.<tier>.<strana>`)
  if (!_predlohaTruhla) _predlohaTruhla = Object.fromEntries(
    Object.entries(CHESTS).map(([k, d]) => [k, Object.assign({}, d.sideName)]));
  for (const k in CHESTS) for (const s in CHESTS[k].sideName)
    CHESTS[k].sideName[s] = nazev("truhla." + k + "." + s, _predlohaTruhla[k][s]);
  // jména tierů dárků jsou pole holých řetězců
  if (!_predlohaTier) _predlohaTier = GIFT_TIER_NAME.slice();
  GIFT_TIER_NAME.forEach((_, i) => { GIFT_TIER_NAME[i] = nazev("tiername." + i, _predlohaTier[i]); });
  // pasivní schopnosti jednotek: vnořená mapa rod → druh → {name,desc}
  if (!_predlohaPas) _predlohaPas = Object.fromEntries(Object.entries(UNIT_PASSIVES)
    .map(([r, t]) => [r, Object.fromEntries(Object.entries(t)
      .map(([k, p]) => [k, { name: p.name, desc: p.desc }]))]));
  for (const r in UNIT_PASSIVES) for (const k in UNIT_PASSIVES[r]) {
    UNIT_PASSIVES[r][k].name = nazev("pasj." + r + "." + k, _predlohaPas[r][k].name);
    UNIT_PASSIVES[r][k].desc = nazev("pasj." + r + "." + k + ".d", _predlohaPas[r][k].desc);
  }
  // ekonomický bonus a povaha rodu (`desc`, `ai.mood`) — popisy, ne jména
  if (!_predlohaBonus) _predlohaBonus = Object.fromEntries(
    FACTION_DEFS.map(d => [d.key, { desc: d.desc, mood: d.ai && d.ai.mood }]));
  for (const d of FACTION_DEFS) {
    d.desc = nazev("bonus." + d.key, _predlohaBonus[d.key].desc);
    if (d.ai) d.ai.mood = nazev("nalada." + d.key, _predlohaBonus[d.key].mood);
  }
  // rasa rodu: klíč podle KLÍČE rodu, ne podle indexu v poli
  if (!_predlohaRas) _predlohaRas = Object.fromEntries(FACTION_DEFS.map(d => [d.key, d.race]));
  for (const d of FACTION_DEFS) d.race = nazev("rasa." + d.key, _predlohaRas[d.key]);
  KAPITOLY.forEach((k, i) => {
    k.name = nazev("kap." + i, _predlohaKap[i].name);
    k.quests.forEach((q, j) => { q.desc = nazev("kap." + i + ".q." + q.key, _predlohaKap[i].q[j]); });
  });
  zrusKesJednotek();   // jména jednotek si keš drží podle jazyka
}
// jazyky.js o game.js nesmí vědět — registr posluchačů je jeho jediný háček
jazyky().naPrepnuti && jazyky().naPrepnuti(prepisTabulky);
prepisTabulky();
// ---------- Hlavní tik ----------
function doTick() {
  if (G.gameOver) return;
  G.tick++;
  zrusPrehled();   // etapa 11: přehled aktérů platí vždy jen pro jeden tik
  G.clashes = G.clashes.filter(c => G.tick - c.tick < 5); // dohrané animace střetů
  tickWorld();
  for (const f of G.factions) {
    if (!f.alive) continue;
    // v0.32: ekonomika, fronty, hrdinové, Prsten i pochody běží KAŽDÉMU
    // aktérovi frakce (zakladatel = frakce sama, cid 0; členové v clenove)
    for (const a of vsichniClenove(f)) {
    // příjem
    const inc = incomeOf(a);
    for (const res in inc) a.resources[res] += inc[res];
    // ZRUŠENO 30. 8. 2026: armáda nežere jídlo. Hladovění i dezerce tím
    // padají — brzdou velikosti armády je STROP VELENÍ hrdiny, ne ekonomika.
    // odpočet posilovacích doplňků (Stavitelský rozkaz / Roh hojnosti)
    if (a.boosts) {
      if (a.boosts.build > 0) a.boosts.build--;
      if (a.boosts.prod > 0) a.boosts.prod--;
    }
    // stavba (Stavitelský rozkaz: dvojnásobná rychlost — tik navíc)
    if (a.build && a.boosts && a.boosts.build > 0 && a.build.ticksLeft > 1)
      a.build.ticksLeft--;
    if (a.build && --a.build.ticksLeft <= 0) {
      if (a.build.key.startsWith("up_")) {
        const type = a.build.key.slice(3);
        a.upgrades[type]++;
        const _rodUp = jeDruhehoRodu(type) ? a.druhyRod : a.key;
        const _klicUp = jeDruhehoRodu(type) ? DRUHY_ROD_KLICE[type] : type;
        addLog(a.id, { klic: "kron.vylepseni", param: { rod: f.name, co: (UNIT_UPGRADES[_rodUp] || {})[_klicUp] || { klic: "kron.vylepseni.obecne" }, jednotka: uDef(a, type).name.toLowerCase(), uroven: a.upgrades[type] } });
      } else {
        a.buildings[a.build.key]++;
        addLog(a.id, { klic: "kron.budova", param: { rod: f.name, budova: BUILDINGS[a.build.key].name, uroven: a.buildings[a.build.key] } });
      }
      a.build = null;
      emitEvent("build", a.id);
    }
    // výcvik (fronty běží souběžně, platí se předem)
    // POSTUPNÁ fronta (30. 8. 2026): tiká jen první zakázka. Souběžný výcvik
    // by dobu podle objemu obešel — stačilo by objednávku rozsekat na typy.
    if (a.recruitQueue.length) {
      const rq = a.recruitQueue[0];
      if (--rq.ticksLeft <= 0) {
        a.units[rq.type] += rq.count || RECRUIT_BATCH;
        a.recruitQueue.shift();
      }
    }
    // obnova výdrže hrdinů (stráž ji naopak čerpá) + léčení + odpočet zotavení
    for (let i = 0; i < a.heroes.length; i++) {
      const h = a.heroes[i];
      const st = heroStats(a, i);
      if (h.guard) {
        h.stamina -= GUARD_DRAIN * st.guardDrainMult;
        if (h.stamina <= 0) {
          h.stamina = 0;
          h.guard = false;
          addLog(a.id, { klic: "kron.straz.konec", param: { hrdina: heroDef(a, i).name, rod: f.name } });
        }
      } else {
        h.stamina = Math.min(st.stamMax, h.stamina + STAMINA_REGEN * st.regen);
      }
      // léčení životů mimo boj (rys Neúnavný hojí rychleji přes regen)
      if (h.hp == null) h.hp = st.hpMax;
      if (h.hp < st.hpMax)
        h.hp = Math.min(st.hpMax, h.hp + Math.max(1, st.hpMax * HERO_HEAL_FRAC) * st.regen);
      if (h.cooldown > 0) h.cooldown--;
    }
    // Prsten popela: moc se přetavuje ve zkušenost, body činu dorůstají
    // (xp z VLASTNÍCH polí aktéra — frakční skóre by členům rostlo navzájem)
    if (a.ring) {
      if (G.tick > 0 && G.tick % ringGrantTicks() === 0) {
        a.ring.xp += scoreClena(a);
        while (a.ring.level < RING_MAX && a.ring.xp >= ringXpNeed(a.ring.level + 1)) {
          a.ring.xp -= ringXpNeed(a.ring.level + 1);
          a.ring.level++;
          a.ring.body = (a.ring.body || 0) + 1; // bod do stromu Prstenu (v0.31)
          if (!a.isAI) {
            addLog(a.id, { klic: "kron.prsten.uroven", param: { uroven: a.ring.level } });
            emitEvent("levelup", a.id);
          }
        }
      }
      if (G.tick > 0 && G.tick % ringApTicks() === 0)
        a.ring.ap = Math.min(ringApMax(a), a.ring.ap + 1); // strop zvedá větev Vláda
    }
    // ETAPA 11: klient má od AOI jen ČÁST mapy, takže by si počet polí spočítal
    // špatně. Server ho posílá s aktérem — pocetPoli zůstává autoritativní tady.
    a.poli = prehledOf(a).poli;
    // pochody
    for (const m of a.marches) m.ticksLeft--;
    const arrived = a.marches.filter(m => m.ticksLeft <= 0);
    a.marches = a.marches.filter(m => m.ticksLeft > 0);
    for (const m of arrived) resolveMarch(a, m);
    if (arrived.some(m => m.kind === "reinforce"))
      for (let hi = 0; hi < a.heroes.length; hi++) splnRozkaz(a, hi);
    }
    // AI (jen zakladatel — frakce s lidmi AI výpomoc nemá)
    if (f.isAI) aiTurn(f);
  }
  if (!serverovyRezim) computeVisibility();   // na serveru si mlhu počítá klient
  // Koruna popela: souvislé držení Trůnního města vyhrává sezónu předčasně
  if (!G.gameOver) {
    const trun = tileAt(0, 0);
    const drzitel = (G.throneOpen && trun && trun.owner >= 0) ? trun.owner : -1;
    const hold = G.throneHold;
    if (drzitel !== hold.fid) {
      if (hold.fid >= 0 && hold.ticks > 30)
        addLog(-1, { klic: "kron.koruna.ztrata", param: { rod: G.factions[hold.fid].name } });
      hold.fid = drzitel; hold.ticks = 0; hold.pulka = false;
      if (drzitel >= 0)
        addLog(-1, { klic: "kron.koruna.zacatek", param: { rod: G.factions[drzitel].name, doba: fmtDobu(throneHoldTicks()) } });
    } else if (drzitel >= 0) {
      hold.ticks++;
      if (!hold.pulka && hold.ticks >= Math.floor(throneHoldTicks() / 2)) {
        hold.pulka = true;
        addLog(-1, { klic: "kron.koruna.pulka", param: { rod: G.factions[drzitel].name, zbyva: fmtDobu(throneHoldTicks() - hold.ticks) } });
      }
      if (hold.ticks >= throneHoldTicks()) {
        G.gameOver = true;
        G.winnerId = drzitel;
        addLog(-1, { klic: "kron.koruna", param: { rod: G.factions[drzitel].name, doba: fmtDobu(throneHoldTicks()) } });
        for (const f of G.factions) {
          grantCores(f.id, 15, "dohraná sezóna");
          if (f.id === drzitel) grantCores(f.id, 50, "vítězství v sezóně");
        }
      }
    }
  }
  if (!G.gameOver && G.tick >= SEASON_TICKS) {
    G.gameOver = true;
    addLog(-1, { klic: "kron.sezona.konec" });
    // odměny za dohranou sezónu: účast + bonus vítězi (jen lidské frakce s účtem)
    const best = G.factions.filter(f => f.alive)
      .sort((a, b) => scoreOf(b) - scoreOf(a))[0];
    if (best) G.winnerId = best.id;
    for (const f of G.factions) {
      grantCores(f.id, 15, "dohraná sezóna");
      if (best && f.id === best.id) grantCores(f.id, 50, "vítězství v sezóně");
    }
  }
}

// ---------- Start nové hry ----------
// seedování kostek BEZ generování mapy (v0.30) — měřicí nástroje (rastr)
// potřebují stabilní proud rng nezávislý na počtu tahů, které spotřebuje
// genMap; jinak každá změna generátoru „přehází kostky" těsných duelů
function seedRng(seed) { rng = mulberry32((seed ?? 0) >>> 0); }

function newGame(playerIndex, seed, playerHeroes) {
  rng = mulberry32(seed ?? (Date.now() % 100000));
  G.tick = 0; G.gameOver = false; G.log = []; G.nextLogId = 0;
  G.zive = null;   // nová sezóna = nová evidence živých polí (postaví ji první tik)
  G.dotcene = new Set();
  G.throneHold = { fid: -1, ticks: 0, pulka: false };
  G.winnerId = -1;
  G.reports = []; G.nextReportId = 1;
  G.clashes = []; // nedávné bitvy pro animaci střetu na mapě {key, tick, att, def}
  G.mapEvents = [];
  G.nextEventTick = randInt(40, 80);
  G.storm = 0;
  G.nextStormTick = randInt(STORM_INTERVAL[0], STORM_INTERVAL[1]);
  G.throneOpen = false;
  G.faze = 1;
  G.checkpointy = CHECKPOINTY.map(() => false);
  G.klany = []; G.nextKlanId = 0;   // klany platí jen v rámci sezóny (etapa 8)
  G.chat = []; G.nextChatId = 0;    // chat taky (etapa 9)
  G.rozhodujici = {}; G.hlasovani = []; G.nextHlasId = 0;   // politika (etapa 10)
  G.goals = []; // v0.31: cíle nahradily kapitoly na frakcích (f.journey)
  G.visible = new Set();
  G.explored = new Set();
  genMap();
  initFactions(playerIndex, playerHeroes);
  computeVisibility();
  G.running = true;
  addLog(-1, { klic: "kron.start", param: { svet: SVET_JMENO } });
}

// multiplayer: víc lidských frakcí naráz; humans = [{faction, heroes: [a, b]}]
// (zbylé frakce dohraje AI). G.playerFaction na serveru ukazuje na prvního
// člověka — používá se jen pro cíle sezóny a nabídky paktů od AI.
// ETAPA 11b: SVĚT ÚPLNĚ BEZ AI.
//
// AI rody jsou dočasná výplň, než bude hráčů dost (etapa 13 je vyměňuje za
// lidi a bandity). Aby se s tím dalo počítat dopředu, jde je vypnout naráz:
// nikdo pak sám neexpanduje, nevyhlašuje války ani nenabízí pakty. Neutrální
// posádky polí to NEJSOU — ty jsou pasivní data dlaždice a zůstávají, takže
// je pořád co dobývat.
// ⚠ Statistická brána (tests/sim-brana.js) měří právě postup AI, takže s tímhle
// přepínačem nemá co měřit — je to přepínač PROVOZU, ne testů.
function zrusAI() {
  let zruseno = 0;
  for (const f of G.factions) if (f.isAI) { f.isAI = false; zruseno++; }
  return zruseno;
}

function newGameMulti(humans, seed) {
  newGame(humans[0].faction, seed, humans[0].heroes);
  for (const hu of humans) {
    const f = G.factions[hu.faction];
    f.isAI = false;
    if (hu.faction !== humans[0].faction) {
      f.heroes = hu.heroes.slice(0, 1).map(makeHero);
      f.hirePool = HERO_DEFS[f.key].map((_, d) => d).filter(d => d !== hu.heroes[0]);
      // balíček z initFactions (frakce byla v tu chvíli AI) odešel s výměnou
      // hrdinů — a lidem nepatří: sig odemyká až oddanost ♥10 (v0.35)
    }
  }
}

// ---------- Export pro Node.js server (multiplayer) ----------
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    G, newGame, newGameMulti, doTick, keyOf, makeHero, armyTotal, tileLabel, tileKlic,
    nastavServerovyRezim, poleVOkoli, obnovZive, vyspyRodu, ozivPole, zrusAI,
    startMarch, startReinforce, startReinforceAttack, startRecall, turnBackMarch, cancelReinforce,
    toggleGuard, startBuild, startRecruit, hireHero, deployHero, STARTER_IDX,
    heroKeyFor, setHeroPreset, equipItem, unequipItem,
    // verbovací zakázka, tržnice a body velení (v0.18)
    startRecruitOrder, recruitOrderCost, recruitAffordable, armyCp,
    // zvláštní vlastnosti výbavy a zušlechtění (v0.20)
    ITEM_PASSIVES, ITEM_PASSIVE_CHANCE, REFINE_MAX, REFINE_COST, itemPassiveStr,
    refineItem, itemPassiveEffs, rollItemPassive,
    itemZaklad, ITEM_NAMES, ITEM_SIDE_NAMES, // druhy kusů + pooly jmen (v0.39, testy ikon)
    marketExchange, marketGain, marketLevel, MARKET_RES, MARKET_RATE, MARKET_MIN,
    RECRUIT_MAX_ORDER, RECRUIT_BATCH, UNIT_TYPES, UNIT_KEYS, unitUnlocked,
    VYCVIK_SEK_ZA_CP, recruitOrderTicks, recruitQueueTicks, cancelRecruit,
    FACTION_UNITS, unitsOf, uDef, FACTION_MODS,
    SIEGE_RETRY, SIEGE_MIN_ARMY, SIEGE_MAX_TRIES, ROUND_CAP, ROUT_AT,
    learnSkill, respecHero, offerPact, cancelPact, acceptAiOffer, declineAiOffer,
    buildOutpost, outpostDeposit, outpostWithdraw, HERO_MAX_STARS,
    // odebrání pole (v0.39)
    abandonTile, cancelAbandon, canAbandonTile, ABANDON_TICKS,
    // akční rádius základen (v0.29)
    REACH, capKeyOf, capPosOf, heroBaseKey, vDosahu, heroSettle, bridgeVede,
    // velikost světa jako knob (v0.33, etapa 4d) — setMapRadius přepočítá
    // geometrii I hodnoty v module.exports (primitivy jsou jinak kopie)
    setMapRadius, MAP_R, WALL_R, OUTER_R, CAPITAL_POS, BRIDGE_KEYS,
    // řeky jako pás 3 polí a mosty jako dvojice břehů (v0.40)
    TERRAIN, neighborsOf, riverKeys, RIVER_HALF, BRIDGE_PAIR, bridgeTwin,
    pobrezi, zatopNedosazitelne,
    BRIDGE_LEVEL, dveArmady, postavHrdinu, neutralPoradi, neutralSila, NEUTRAL_VLNY,
    KOLEBKA_MOSTY, KOLEBKA_MOST_MILICE, KOLEBKA_MOST_LEVEL, jeKolebkovyMost, struktMilice,
    ZRAN_TICKS, ZRAN_TICKS_CIL, zranDelka, zranOtevri, zranUber,
    kolebkaR, kolebkaOf, jeCiziKolebka, oktantOf, resettleFaction, incomeOf, armyUpkeep,
    placeKeeps,
    neutralTier, neutralVybava, NEUTRAL_TIER_RARITA, setOdhadObrany, setNeutralVybavaSila,
    tileStrengthLabel,
    setTileOwner, heroDef, makeHero,
    // osmisměrné sousedství pro zábor a dohled hrdiny (v0.41)
    sousediZaboru, aktorKlic, ucastniciBitvy, SVET_JMENO,
    // jeden průchod mapou za tik místo skenu na aktéra (etapa 11)
    prehledAkteru, prehledOf, zrusPrehled,
    // AOI: okruh zájmu hráče (etapa 11)
    aoiKlice, aoiBody, AOI_R, AOI_CELA_MAPA_DO, REACH_MAX, computeVisibility,
    // uvítací jádra k vyzvednutí ověřovacím odkazem (v0.58)
    jadraCekaji, vyzvedniJadra, ACCOUNT_START_CORES,
    // KLANY (etapa 8, IV-A + IV-B) — mutující: zalozKlan, prijmiDoKlanu,
    // odejdiZKlanu, povysDustojnika, sesadDustojnika, postavKlanovouPevnost,
    // zbourejKlanovouPevnost, navrhniVyhazov, prijmiVyhazov, odmitniVyhazov
    // (všechny jsou i v NET_CMDS a serverových CMDS!)
    zalozKlan, prijmiDoKlanu, odejdiZKlanu, povysDustojnika, sesadDustojnika,
    postavKlanovouPevnost, zbourejKlanovouPevnost, zrusKlan, klanTick,
    navrhniVyhazov, prijmiVyhazov, odmitniVyhazov,
    klanOf, klanPodleId, klanCleny, klanSila, klanXpNeed, klanKapacita,
    klanDustojnikuMax, klanPevnostiMax, klanPevnosti, jeVudce, jeDustojnik,
    radaVelikost, radaProsla, patriKlanu, jeKlanovaPevnost, lzeStavetPevnost,
    pevnostKapacita, hrdinuNaPoli, jeVyvrhel, poutaSdili, jeMoje, braniPole,
    drzitelPole, vyhazovTicks, jmenoAktera, bigAnchor, blockTiles, tileYield,
    // CHAT (etapa 9, IV-E) — chatPosli je mutující ⇒ NET_CMDS i serverové CMDS
    chatPosli, chatViditelna, chatProAktera, chatPauzaTicks,
    // KRONIKA jako serverový kanál (etapa 9, IV-E)
    addLog, logViditelny, logProAktera, LOG_MAX,
    // POLITIKA (etapa 10, IV-D) — mutující: zahajHlasovani, hlasuj,
    // nabidniSpojenectvi, zrusSpojenectvi (⇒ NET_CMDS i serverové CMDS)
    zahajHlasovani, hlasuj, nabidniSpojenectvi, zrusSpojenectvi,
    prepoctiRozhodujici, rozhodujiciKlanId, jeRozhodujici, hlasovaniOtevrene,
    hlasovaniPodleId, tikPolitiky, zacniValku, uzavriMir, spojenecId, jsouSpojenci,
    denTicks, prepocetTicks, vyhlaseniTicks, valkaMinTicks, mirKlidTicks,
    hlasovaniTicks, HLASOVANI_MIN_PODIL,
    // KLANOVÁ BURZA: pravidla a ceník (etapa 9, IV-F + IV-R)
    burzaPoplatek, burzaPulka, burzaZkontroluj, burzaProtiplneniSedi, burzaRaritaSedi,
    burzaObjem, burzaTierRarity, burzaObchoduDnes, burzaNasobek,
    BURZA_PRIHRADKY, BURZA_KUS_JADRA, BURZA_SUROVINY_PROCENTO, BURZA_ESKALACE,
    BURZA_PLATNOST_DNI, dnesniDen, stripItem, RARITIES,
    CHAT_MAX, CHAT_MAX_ZNAKU, CHAT_KANALY,
    KLAN_ZAKLAD_CLENU, KLAN_MAX_CLENU, KLAN_MAX_UROVEN, KLAN_DUSTOJNIKU_MAX,
    KLAN_CLENU_NA_DUSTOJNIKA, KLAN_PEVNOSTI_ZAKLAD, KLAN_RADA_JEDNOMYSLNE,
    KLAN_PEVNOST_CENA,
  radaJednotky, RADA_VYCHOZI, setProlomPomer, rohoviSousedi, isAdjacentToFaction, DOHLED_HRDINA, DOHLED_POLE,
    // obléhací okna, válka a vykořenění (v0.29)
    SIEGE_HP, siegeWindowTicks, jeVelkaStavba, DEMOLISH_PER_CP, CAPITAL_FIRE,
    WAR_SIEGE_PENALTY, declareWar, jeValka, warCdTicks, regionHolderId,
    // uzly, žíly a zóny světa (v0.30)
    jeUzel, UZEL_CD_TICKS, zonaOf, zonaOtevrena, zoneFazeTicks, ZONE_FAZE_FRAC,
    NODE_GUARD, VEIN_RING, seedRng,
    // strom Prstenu, strop území, kapitoly a checkpointy (v0.31)
    RING_VETVE, RING_RESPEC_GOLD, ringVetev, ringApMax, ringHojnost,
    ringLearn, ringReset, STROP_BASE, pocetPoli, stropPoli, KAPITOLY, CHECKPOINTY,
    // členové frakce (v0.32, etapa 4c)
    frakceOf, clenPodleCid, vsichniClenove, patriClenu, scoreClena,
    initClen, pridejClena, umistiMestoClena,
    HERO_DEFS, FACTION_DEFS, SEASON_TICKS, TICK_MS, SEASON_GOALS,
    setSeasonHours, seasonTicks, throneHoldTicks, ringGather, ringTrain,
    ringRest, ringXpNeed, ringGrantTicks, ringApTicks, ringStam, ringCap,
    regionOf, REGION_NAMES, REGION_CENTER, RING_UNLOCKS, RING_MAX, RING_AP_MAX,
    RING_COSTS,
    // účty a truhly (v0.6)
    CHESTS, CHEST_ITEMS, PITY_AT, GIFT_SHARE, GIFT_RARITY_TIER, GIFT_RESPECT,
    RARITIES, CORE_CODES,
    INVITE_PITY_AT, INVITE_CHANCE, chestFreeAvailable, wishlistToggle, WISHLIST_MAX,
    applyInviteToAccount, rollInviteHero, rollGiftHero, giftCostForStar,
    // dárky po skupinách rod×tier (v0.44)
    GIFT_RESPECT_BY_TIER, giftRespectFor, UNLOCK_GIFTS, STAR2_GIFTS, rollGiftGroup,
    giftGroupKey, jeSkupinaDarku, rozborSkupiny, giftGroupOfHero,
    giftNameForGroup, giftNameOf, hrdinoveSkupiny, GIFT_TIER_NAME,
    respectForStar, giftNameFor, heroTierOf, marketShopOffers, buyShopOffer,
    SHOP_SLOTS, SHOP_GIFT_PRICE, SHOP_ITEM_PRICE, dnesniDen,
    emptyAccount, accountOpenChest, accountOpenChests, CHEST_BULK, chestBulkCost,
    accountRedeemCode,
    grantGift, useGifts, giftCount,   // dárky jako předměty (v0.43)
    applyAccountToFaction, applyAccountToHero, syncAccountFromFaction,
    grantItemToFaction, strengthenItem, SIGNATURE_ITEMS, makeSignatureItem,
    zajistiSigStartera, // signature balíček starterů (v0.35)
    heroStats, heroArmyCap, simulateBattle, heroGainXp, xpForLevel, aiSpendSkills,
    // stromy dovedností (Audit 2, fáze A)
    HERO_MAX_LEVEL, MAIN_MAX_RANK, SUB_MAX_RANK, SKILL_UNLOCK_MAIN, SUB_REQ,
    skillUnlocked, totalSkillPtsForLevel, heroSpentPoints, TREE_VERSION,
    // brána oddanosti a R10 signature (v0.35)
    STAR_UNLOCK_MAIN, SIG_STARS,
    // kolové aktivky a mistrovské bonusy rysu (Audit 2, fáze B)
    TRAIT_MAX_EFFS, HERO_TRAITS, heroActives, heroEff,
    // neutrální velitelé (v0.13)
    neutralCommander, neutralHeroLevel, neutralHeroCap, tileStrengthLabel,
    NEUTRAL_COMMANDERS, TIERS, TIER_GARRISON, STRUCTURES, tileDefComponents,
    OBRANA_MIN_CP, braniStoh, emptyArmy, armyFrom,
    FORMACI_MAX, pocetFormaci, lzeSestavit, VELKE_DEFS, velkaJednotka, normalizujArmady,
  zrusKesJednotek, evCesky, prepisTabulky, nazev,
  MASTER_BONUS, ITEM_SLOTS, MAP_EVENTS, RARITIES, HERO_TIERS, RING_VETVE, ITEM_PASSIVES, TABULKY,
  UNIT_UPGRADES, HERO_TRAITS, slugCz, fmtDobu, RING_UNLOCKS, CHESTS, UNIT_PASSIVES,
    radaJednotky, unitsOf,
    BUILDINGS, recruitTicks, aiSlice, armyTimeMult, balancedArmy, aiTrio,
    AKADEMIE_CAP, buildTicks, buildCost,
    DRUHY_ROD_MAIN, DRUHY_ROD_KLICE, jeDruhehoRodu, zakladniDruh, PRAZDNA_JEDNOTKA,
    lzeVybratDruhyRod, nabidkaDruhehoRodu, zvolDruhyRod,
    aiTurn, RES_KEYS,
    hracuNaFrakci, velikostProPocet, MAP_R_MIN, MAP_R_MAX, CIL_POLI_NA_HRACE,
    // strany, tiery, dárky a doplňky (v0.9)
    FACTION_SIDE, SIDES, sideOfFaction, HERO_TIERS, heroTierOf, TIER_STAT_BONUS,
    HERO_TIER_BY_ROD, giftTierTrait,
    giftCostForStar, respectForStar, applyGiftToAccount, migrateAccount,
    heroUnlocked, accountUseBoost, BOOST_KINDS, BOOST_MINUTES, resetSezonyUctu,
  };
}
