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
const MAP_R = 17;   // Čebyševův poloměr — 35×35 = 1225 polí (~jako dřív)
const WALL_R = 4;   // vnitřní hradby středové oblasti (Manhattan prstenec kolem trůnu)
const OUTER_R = 8;  // vnější prstenec opevnění — prostupný jen přes velké pevnosti
const TICK_MS = 1000;
const SEASON_TICKS = 3600;      // sezóna: 1 hodina (ostrá hra: ~měsíc)
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
const TIER_GARRISON = [3, 10, 30, 55, 85, 120, 160, 205, 255, 310, 370, 435];
const TIER_YIELD    = [0.4, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9, 2.5]; // surovin/s
const TIER_SCORE    = [1, 1, 2, 3, 6, 9, 13, 15, 20, 23, 26, 30]; // body do síly království
const tierOf = t => TIERS[t.level - 1];
const tierScore = t => TIER_SCORE[t.level - 1];
// suroviny se střídají ob úroveň: sudé stupně (10, 30, 90…) jídlo NEBO železo,
// liché (15, 60, 130…) kámen NEBO dřevo; stupeň 1 dává trochu od všeho,
// stupeň 300 je klasické pole se všemi základními surovinami
const RES_KEYS = ["food", "wood", "stone", "iron"];
const OUTPOST_CAP = 2000;       // nejvyšší posádka výspy
const OUTPOST_COST = { stone: 300, wood: 100, gold: 150 };
const COUNTER_BONUS = 0.3;      // bonus poškození proti typu, proti kterému je jednotka silná
// boj probíhá v kolech: každá strana sčítá životy svých jednotek do jednoho
// fondu a každé kolo udělí poškození podle statů; rozdíl útoku a obrany stran
// posouvá udělené poškození o 5 % za bod, rychlost hrdiny určuje, kdo v kole
// udeří první (pomalejší strana oplácí už jen s přeživšími)
const ATKDEF_STEP = 0.05;       // ±5 % poškození za bod rozdílu útok−obrana
const MILITIA_SPEED = 4;        // rychlost strany bez hrdiny
const HERO_DMG_SHARE = 0.03;    // podíl poškození skupiny, který schytá hrdina
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
const HERO_DMG_SCALE = 6;
const ROUT_LOSS = 0.25;         // dodatečné ztráty při ústupu z prohraného útoku
const WOUNDED_COOLDOWN = 60;    // zotavení hrdiny, jehož armáda byla zničena
const RECRUIT_BATCH = 10;
const STAMINA_MAX = 100;
const STAMINA_REGEN = 0.5;
const DEFEAT_COOLDOWN = 30;     // s nepoužitelnosti po porážce
// ---- obléhání: odražený hrdina zůstává u pole a zkusí to znovu ----
// Po odraženém útoku hrdina neutíká domů — utáboří se a po SIEGE_RETRY
// sekundách udeří znovu s tím, co mu zbylo. Silná pole se tak lámou na víc
// náběhů a hráč mezitím může poslat posily. (V předloze 5 minut; naše sezóna
// trvá hodinu, tak je pauza kratší.)
const SIEGE_RETRY = 25;         // s do dalšího náběhu
const SIEGE_MIN_ARMY = 12;      // pod tolik jednotek se obléhání vzdává
const SIEGE_MAX_TRIES = 5;      // kolik náběhů za sebou hrdina zkusí
// cena najmutí podle počtu hrdinů, které už frakce má (start = 1 zdarma)
const HERO_HIRE_COST = [0, 250, 450, 700, 1000];
const HERO_MAX = 5;

// --- oživení mapy: obnova neutrálních posádek a putovní události ---
const GARRISON_REGEN_TICKS = 600;    // neutrální posádka doroste za ~10 minut
const EVENT_INTERVAL = [70, 130];    // interval mezi událostmi na mapě (s)
const EVENT_MAX = 3;                 // souběžných událostí nejvýš
const MAP_EVENTS = {
  banda:    { name: "Potulná banda",     icon: "💀", dur: 150,
    desc: "posádka pole +60 %; poražení bandy vynese zlato navíc" },
  karavana: { name: "Kupecká karavana",  icon: "💰", dur: 100,
    desc: "dobytí pole, dokud tu karavana táboří, vynese měšec zlata" },
  relikvie: { name: "Ztracená relikvie", icon: "✨", dur: 150,
    desc: "dobytí pole zaručí kořist vyšší rarity" },
};

// --- rytmus sezóny ---
const THRONE_UNLOCK = SEASON_TICKS / 2;  // Trůnní město se otevírá v půlce sezóny
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
  { key: "city",   desc: "Dobuď svobodné město",        check: f => [...G.tiles.values()].some(t => t.owner === f.id && t.structure === "city"),
    reward: { gold: 250 } },
  { key: "hero5",  desc: "Vycvič hrdinu na úroveň 5",   check: f => f.heroes.some(h => h.level >= 5),
    reward: { gold: 200 } },
  { key: "bridge", desc: "Ovládni most",                check: f => [...G.tiles.values()].some(t => t.owner === f.id && t.structure === "bridge"),
    reward: { wood: 150, gold: 100 } },
];

// --- diplomacie ---
const PACT_DURATION = 180;      // pakt o neútočení (s)
const PACT_COST = 100;          // zlato za nabídku paktu
const PACT_REFUSE_COOLDOWN = 90;   // po odmítnutí chvíli nenabízet znovu
const PACT_BETRAYAL_COOLDOWN = 300; // po vypovězení paktu AI dlouho nedůvěřuje

// --- údržba armád jídlem ---
const UPKEEP_PER_UNIT = 0.01;   // jídlo za jednotku a tik (armády jsou teď větší)
const STARVE_INTERVAL = 15;     // jak často hladovějící armáda dezertuje (s)
const STARVE_LOSS = 0.02;       // podíl dezertérů při hladovění

// kámen–nůžky–papír: pěchota > jízda > lučištníci > pěchota
// bojové staty: hp = životy jednotky, dmg = základní poškození za kolo,
// atk/def = útok a obrana (rozdíl proti straně nepřítele = ±5 % poškození/bod)
// cp = kolik bodů velení jednotka zabírá (velení hrdiny je heroArmyCap).
// Zatím všechny 1:1; těžké jednotky s vyšší vahou (jízda 2, obři 25/100)
// přijdou s přestavbou boje na formace — proto se s cp počítá už teď.
const UNIT_TYPES = {
  inf:  { name: "Pěchota",    icon: "🗡", power: 1, counters: "cav", cp: 1, ini: 4,
          hp: 10, dmg: 2, atk: 3, def: 5,
          cost: { food: 80,  iron: 30, gold: 20 } },
  arch: { name: "Lučištníci", icon: "🏹", power: 1, counters: "inf", cp: 1, ini: 6,
          hp: 6,  dmg: 3, atk: 5, def: 2,
          cost: { food: 60,  wood: 60, gold: 30 } },
  cav:  { name: "Jízda",      icon: "🐎", power: 1, counters: "arch", cp: 1, ini: 9,
          hp: 9,  dmg: 3, atk: 5, def: 3,
          cost: { food: 120, iron: 50, gold: 60 } },
};
const UNIT_KEYS = ["inf", "arch", "cav"];

// budovy hlavního města; cost/time indexováno CÍLOVOU úrovní
const BUILDINGS = {
  main: {
    name: "Hlavní budova", max: 5,
    desc: "+10 % výnosu za úroveň; určuje nejvyšší úroveň ostatních budov",
    cost: [null, null, { stone: 150, gold: 100 }, { stone: 350, gold: 250 },
           { stone: 700, wood: 200, gold: 550 }, { stone: 1200, wood: 400, gold: 1000 }],
    time: [null, null, 30, 45, 60, 90],
  },
  barracks: {
    name: "Kasárny", max: 3,
    desc: "úr. 2 odemyká lučištníky, úr. 3 jízdu; každá úroveň zrychluje výcvik",
    cost: [null, null, { stone: 200, gold: 150 }, { stone: 450, gold: 400 }],
    time: [null, null, 40, 60],
  },
  hospital: {
    name: "Nemocnice", max: 3,
    desc: "vrací část padlých do zásoby (15 / 20 / 25 %)",
    cost: [null, { stone: 150, gold: 120 }, { stone: 300, gold: 250 }, { stone: 550, gold: 500 }],
    time: [null, 30, 45, 60],
  },
  market: {
    name: "Tržnice", max: 3,
    desc: "směna surovin; každá úroveň zlepšuje kurz (40 / 55 / 70 %)",
    cost: [null, { stone: 200, wood: 150, gold: 100 },
           { stone: 400, wood: 300, gold: 250 }, { stone: 700, wood: 550, gold: 500 }],
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
};

const UNIT_UPGRADES = {
  aldar:  { inf: "Cvičiště štítonošů", arch: "Královská lukostřelnice", cav: "Turnajová stáj" },
  yllien: { inf: "Trnová houština",    arch: "Větrná galerie",          cav: "Mlžné výběhy" },
  durgar: { inf: "Krvavá jáma",        arch: "Šípařská dílna",          cav: "Válečná kovárna" },
  horda:  { inf: "Jáma hladu",         arch: "Hnízdo lovců",            cav: "Popelné ohrady" },
};
const UPGRADE_COST = [null, { iron: 150, gold: 200 }, { iron: 350, gold: 450 }];
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
  capital:  { name: "Hlavní město",   score: 30,  militia: 600 },
  city:     { name: "Svobodné město", score: 20,  militia: 260 },
  throne:   { name: "Trůnní město",   score: 200, militia: 1200 },
  bridge:   { name: "Most",           score: 8,   militia: 120 },
  fortress: { name: "Pevnost",        score: 20,  militia: 500 },  // brána vnitřních hradeb
  grandfort: { name: "Velká pevnost", score: 50,  militia: 725 },  // srdce vnějšího prstence (síla 500)
  bastion:  { name: "Bašta",          score: 20,  militia: 435 },  // rameno velké pevnosti (síla 300)
  outpost:  { name: "Výspa",          score: 8,   militia: 0 },    // hráčská stavba za kámen
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
];

const CAPITAL_POS = [ { q: 16, r: 0 }, { q: 0, r: 16 }, { q: -16, r: 0 }, { q: 0, r: -16 } ];

// ---------- Strany dobra a zla (v0.9) ----------
// Vellar je rozdělen: Aldarské království a Yllien stojí na straně dobra,
// Popelná horda s Durgarskou držbou na straně zla. Truhly i výbava mají
// afinitu ke straně — hrdina smí nosit jen výbavu své strany.
const FACTION_SIDE = { aldar: "dobro", yllien: "dobro", durgar: "zlo", horda: "zlo" };
const SIDES = {
  // gen = 2. pád, aby šlo psát „výbava … strany dobra" bez ohýbání v UI
  dobro: { name: "Strana dobra", gen: "strany dobra", icon: "☀", color: "#e5cf7a",
    desc: "Aldarské království a Tichý sněm Yllienu" },
  zlo:   { name: "Strana zla", gen: "strany zla", icon: "🔥", color: "#e06a4d",
    desc: "Popelná horda a Durgarská držba" },
};
function sideOfFaction(fkey) { return FACTION_SIDE[fkey] || "dobro"; }

// ---------- Tiery hrdinů (v0.9) ----------
// Vzácnost získání (dárky, odemykání), NE síla — staty tier nemění.
// V každé frakci 3 běžní / 2 epičtí / 1 legendární podle rysu.
const HERO_TIER_BY_TRAIT = { swift: 0, shield: 0, tireless: 0, attack: 1, warlord: 1, mystic: 2 };
const HERO_TIERS = [
  { key: "common",    name: "Běžný",       color: "#9aa5b1" },
  { key: "epic",      name: "Epický",      color: "#b06ae0" },
  { key: "legendary", name: "Legendární",  color: "#e0b13d" },
];
function heroTierOf(fkey, defIdx) {
  return HERO_TIER_BY_TRAIT[HERO_DEFS[fkey][defIdx].trait] || 0;
}

// bonusy rysů jsou vyjádřené ve statech: 1 bod útoku/obrany ≈ 5 % poškození
const HERO_TRAITS = {
  attack:   { name: "Útočník",   desc: "+3 útoku",                          atk: 3 },
  swift:    { name: "Rychlý",    desc: "−25 % času pochodu, +2 rychlosti",  time: 0.75, speed: 2 },
  shield:   { name: "Ochránce",  desc: "+4 obrany",                         def: 4 },
  tireless: { name: "Neúnavný",  desc: "+60 % obnovy výdrže, +40 životů",   regen: 1.6, hp: 40 },
  warlord:  { name: "Vojevůdce", desc: "+100 velených jednotek, +6 poškození", cap: 100, dmg: 6 },
  mystic:   { name: "Mystik",    desc: "kouzla: 15 poškození přímo do životů nepřátel každé kolo", spell: 15 },
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

// velení: kolik jednotek hrdina uvede — základ 200, +15 za každou úroveň
const HERO_CAP_BASE = 200;
const HERO_CAP_PER_LEVEL = 15;

// hvězdy velitele — druhá osa progrese (trvalá, přežívá sezóny na účtu):
// každá hvězda +4 % k hlavním statům (životy/útok/obrana/poškození/kouzla),
// +25 velených jednotek a +1 bod dovedností; povýšení hrdinu uzdraví.
// Hvězdy se NEKUPUJÍ za 💠 — plní se dárky hrdiny (respekt) z truhel:
// hvězda n stojí 10/12/15/17/20… dárků (střídavě +2/+3, 25. hvězda 70);
// 1. hvězda hrdinu zároveň odemyká (zamčení hrdinové, v0.9)
const HERO_MAX_STARS = 25;
const STAR_STAT_BONUS = 0.04;
const STAR_CAP_BONUS = 25;
const STAR_SKILL_POINT = 1;   // bod dovedností za každou hvězdu
const GIFT_RESPECT = 10;      // respekt za jeden dárek
function giftCostForStar(n) { return 10 + Math.floor((n - 1) / 2) * 5 + ((n - 1) % 2) * 2; }
function respectForStar(n) { return giftCostForStar(n) * GIFT_RESPECT; }

// tvar stromu dovedností (Audit 2): 4 hlavní dovednosti po 15 rancích, pod
// každou dvě větve s podřízenou dovedností po 7 rancích. Kapacita 116 bodů
// proti příjmu 74 (49 z úrovní + 25 z hvězd) — plný strom je záměrně mimo
// dosah. Hlavní se odemykají investovanými body, podřízené rankem rodiče.
const MAIN_MAX_RANK = 15;
const SUB_MAX_RANK = 7;
const SKILL_UNLOCK_MAIN = [0, 8, 18, 30];
const SUB_REQ = 3;            // výchozí rank rodiče pro odemčení větve

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
    { name: "Elvarin Kořenopěvec", trait: "shield", tree: [
      { key: "koreny", name: "Píseň kořenů", max: 15, eff: { type: "holdDef", val: 2 },
        desc: "+2 % obrany pole s Elvarinem za bod" },
      { key: "zpev",  name: "Hojivý zpěv", max: 15, eff: { type: "heal", val: 2.1 },
        desc: "po vítězství se 2,1 % ztrát za bod vrací do armády" },
      { key: "miza",  name: "Proudění mízy", max: 15, eff: { type: "hp", val: 4 },
        desc: "+4 životů hrdiny za bod" },
      { key: "hvozd", name: "Prastarý hvozd", max: 15, ult: true, eff: { type: "aura", val: 0.8 },
        desc: "nepřátelé útočící v okolí Elvarina −0,8 % síly za bod",
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
        eff: { type: "convoy", val: 3 }, desc: "posily k Elvarinovi jdou o 3 % rychleji za bod" },
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
  addLog(faction.id, `${heroDef(faction, heroIdx).name} (${faction.name}) kořistí: ` +
    `${ITEM_SLOTS[item.slot].icon} ${item.name}${item.set ? ` (${ITEM_SETS[item.set].name})` : ""} — ${itemEffectStr(item)}.`);
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
const ACCOUNT_START_CORES = 120; // uvítací dárek nového účtu

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
  royal:  { name: "Truhla Popelného krále", cost: 2400, color: "#e0b13d", icon: "👑",
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
const TREE_VERSION = 2;

// nový prázdný účet (server i místní účet v prohlížeči)
function emptyAccount(name) {
  return { name: name || "místní hráč", cores: ACCOUNT_START_CORES,
    inventory: [], heroProgress: {}, codesUsed: [],
    heroUnlocks: {}, heroRespect: {}, boosts: {}, pity: 0, treeV: TREE_VERSION };
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
  for (const key in (acc.heroProgress || {})) acc.heroUnlocks[key] = 1;
  if ((acc.treeV | 0) < TREE_VERSION) {
    for (const key in (acc.heroProgress || {})) {
      const pr = acc.heroProgress[key];
      pr.skills = {};
      pr.skillPts = totalSkillPtsForLevel(pr.level || 1)
        + (pr.stars || 0) * STAR_SKILL_POINT;
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
function rollGiftHero(tier, side) {
  const pool = [];
  for (const fkey in HERO_DEFS) {
    if (sideOfFaction(fkey) !== side) continue;
    HERO_DEFS[fkey].forEach((hd, i) => {
      if (heroTierOf(fkey, i) === tier) pool.push(fkey + ":" + i);
    });
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

// dárek hrdiny: +10 respektu na účet; při naplnění ceny další hvězdy hrdina
// povýší (1. hvězda = odemčení, +1 bod dovedností za každou hvězdu, uzdravení).
// liveFaction = běžící frakce majitele účtu: hvězdy najatého hrdiny drží živý
// hrdina (sync účtu by účetní zápis přepsal), jinak se píší do heroProgress.
// Hrdina na 25★ mění další dárky na 💠.
function applyGiftToAccount(acc, key, liveFaction) {
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
  if (stars >= HERO_MAX_STARS) {
    acc.cores += GIFT_RESPECT;
    return { key, name, type: "cores", cores: GIFT_RESPECT };
  }
  const resp = (acc.heroRespect[key] || 0) + GIFT_RESPECT;
  const need = respectForStar(stars + 1);
  if (resp < need) {
    acc.heroRespect[key] = resp;
    return { key, name, type: "respect", respect: resp, need,
      locked: !heroUnlocked(acc, key) };
  }
  acc.heroRespect[key] = resp - need;
  const wasLocked = !heroUnlocked(acc, key);
  acc.heroUnlocks[key] = 1;
  if (live) {
    live.stars = stars + 1;
    live.skillPts += STAR_SKILL_POINT;
    live.hp = heroStats(liveFaction, liveIdx).hpMax; // povýšení uzdraví
    addLog(liveFaction.id, `🌟 ${name} (${liveFaction.name}) povýšen na ${stars + 1}★ (+1 bod dovedností).`);
  } else {
    const entry = acc.heroProgress[key] || (acc.heroProgress[key] =
      { level: 1, xp: 0, stars: 0, skills: {}, skillPts: 0, equip: {} });
    entry.stars = stars + 1;
    entry.skillPts = (entry.skillPts || 0) + STAR_SKILL_POINT;
  }
  return { key, name, type: wasLocked ? "unlock" : "star", star: stars + 1 };
}

// otevření truhly nad účtem — vrací {items, boosts, gifts, side}, nebo null
// (málo jader). Truhla dá VŽDY přesně CHEST_ITEMS věcí: každý slot je buď
// posilovací doplněk (prostor uvolněný z vah rarit), nebo — podle stejné
// tabulky rarit — výbava, či dárek hrdiny téže rarity. Žádný drop navíc.
function accountOpenChest(acc, tier, side, liveFaction) {
  const def = CHESTS[tier];
  if (!acc || !def || acc.cores < def.cost) return null;
  side = side === "zlo" ? "zlo" : "dobro";
  migrateAccount(acc);
  acc.cores -= def.cost;
  // počítadlo smůly: PITY_AT. truhla BEZ legendy ji vydá jistě. Truhla dá
  // legendu sama od sebe zhruba každou čtvrtou, takže se počítadlo dotkne
  // jen nešťastné menšiny — nezlevňuje, jen ubírá krutost náhody.
  acc.pity = (acc.pity || 0) + 1;
  let pityLeft = acc.pity >= PITY_AT ? 1 : 0;

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
      gifts.push(applyGiftToAccount(acc,
        rollGiftHero(GIFT_RARITY_TIER[rarity], side), liveFaction));
    } else {
      const item = makeChestItem(tier, side);
      items.push(item);
      acc.inventory.push(item);
    }
  }
  // legenda (ať už z náhody, nebo z jistoty) počítadlo nuluje
  const legenda = items.some(it => it && it.rarity >= RARITIES.length - 1);
  if (legenda) acc.pity = 0;
  return { items, boosts, gifts, side, pity: acc.pity, pityAt: PITY_AT, legenda };
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
  addLog(faction.id, `${BOOST_KINDS[kind].icon} ${faction.name}: ${BOOST_KINDS[kind].name} ` +
    `(${HERO_TIERS[tier].name.toLowerCase()}) — ${BOOST_KINDS[kind].desc} na ${BOOST_MINUTES[tier]} min.`);
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
  addLog(faction.id, `✨ ${target.name} zušlechtěn na ${target.refine}. stupeň — ` +
    `„${ITEM_PASSIVES[target.pas].name}" sílí.`);
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
    addLog(faction.id, `🔨 ${ITEM_SLOTS[target.slot].icon} ${target.name} dosahuje ` +
      `5★ — probouzí se mistrovský bonus „${MASTER_BONUS[target.slot].name}“ ` +
      `(${MASTER_BONUS[target.slot].desc}).`);
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
  "yllien:0": { slot: "boots", name: "Nyalliny tiché kroky", passive: "Stín mezi stromy",
    effs: [{ type: "spd", val: 2 }, { type: "strike", val: 10 }] },
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
  "durgar:3": { slot: "armor", name: "Žulový krunýř", passive: "Nezlomnost",
    effs: [{ type: "hp", val: 70 }, { type: "stam", val: 15 }] },
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
}

function applyAccountToHero(faction, heroIdx, acc) {
  if (!acc) return;
  const h = faction.heroes[heroIdx];
  const pr = (acc.heroProgress || {})[faction.key + ":" + h.defIdx];
  if (!pr) return;
  h.level = Math.max(1, Math.min(HERO_MAX_LEVEL, pr.level || 1));
  h.xp = Math.max(0, pr.xp || 0);
  h.stars = Math.max(0, Math.min(HERO_MAX_STARS, pr.stars || 0));
  // dovednosti se staví průchodem přes strom: ručně upravený (nebo starý)
  // účet nesmí do hry propašovat neznámý klíč ani rank nad maximem
  h.skills = {};
  for (const s of heroDef(faction, heroIdx).tree) {
    const r = Math.min(s.max, Math.max(0, ((pr.skills || {})[s.key] | 0)));
    if (r > 0) h.skills[s.key] = r;
  }
  h.skillPts = Math.max(0, pr.skillPts || 0);
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
    acc.heroProgress[faction.key + ":" + h.defIdx] = {
      level: h.level, xp: h.xp, stars: h.stars || 0,
      skills: { ...h.skills }, skillPts: h.skillPts, equip };
  }
}

// popelná jádra z herních událostí — připíše je vrstva účtů (server /
// místní účet) přes G.onCores; AI frakce žádný účet nemají a nic nedostanou
function grantCores(factionId, amount, reason) {
  if (typeof G.onCores === "function" && G.onCores(factionId, amount)) {
    addLog(factionId, `${CORE_ICON} +${amount} popelných jader — ${reason}.`);
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
    addLog(faction.id, `⭐ ${heroDef(faction, heroIdx).name} (${faction.name}) postupuje na úroveň ${h.level}${pts ? " (+1 bod dovedností)" : ""}.`);
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
function skillUnlocked(hero, skill) {
  if (skill.parent) return (hero.skills[skill.parent] || 0) >= (skill.req || SUB_REQ);
  return heroSpentPoints(hero) >= SKILL_UNLOCK_MAIN[skill.slot];
}

function learnSkill(faction, heroIdx, skillKey) {
  const h = faction.heroes[heroIdx];
  if (h.skillPts <= 0) return false;
  const tree = heroDef(faction, heroIdx).tree;
  const s = tree.find(x => x.key === skillKey);
  if (!s) return false;
  if (!skillUnlocked(h, s)) return false;
  if ((h.skills[skillKey] || 0) >= s.max) return false;
  h.skills[skillKey] = (h.skills[skillKey] || 0) + 1;
  h.skillPts--;
  // dovršení hlavní dovednosti odemyká bonus podle rysu velitele
  if (s.main && h.skills[skillKey] >= s.max && s.maxEff) {
    addLog(faction.id, `🏅 ${heroDef(faction, heroIdx).name} (${faction.name}) dovršuje „${s.name}“ — odemyká mistrovský bonus.`);
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
    addLog(faction.id, `${heroDef(faction, heroIdx).name} (${faction.name}) přerozděluje dovednosti (reset zdarma).`);
    return true;
  }
  const cost = spent * RESPEC_GOLD_PER_POINT;
  if (faction.resources.gold < cost) return false;
  faction.resources.gold -= cost;
  h.skillPts += spent;
  h.skills = {};
  addLog(faction.id, `${heroDef(faction, heroIdx).name} (${faction.name}) přerozděluje dovednosti (−${cost} 🪙).`);
  return true;
}

// součet efektu daného typu přes všechny naučené dovednosti hrdiny;
// podmínkové efekty (e.cond) sem nepatří — sbírá je heroCondEffs;
// maxEff je bonus navíc při plně naučené dovednosti (Max Level Effect)
// kolové aktivky (roundDmg/roundArmy) se nesčítají do jednoho čísla — mají
// vlastní časování a sbírá je heroActives; heroEff je proto přeskakuje
const ROUND_EFF_TYPES = { roundDmg: 1, roundArmy: 1 };

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
function emptyArmy() { return { inf: 0, arch: 0, cav: 0 }; }
function armyTotal(a) { return a.inf + a.arch + a.cav; }
function armyClone(a) { return { inf: a.inf, arch: a.arch, cav: a.cav }; }
function armyAdd(into, add) { for (const k of UNIT_KEYS) into[k] += add[k]; return into; }
function armyStr(a) {
  return UNIT_KEYS.filter(k => a[k] > 0).map(k => UNIT_TYPES[k].icon + Math.floor(a[k])).join(" ") || "—";
}
// „domobrana“: abstraktní vyvážený mix daného výkonu
function balancedArmy(power) {
  const per = power / (SOLDIER_POWER * 3);
  return { inf: per, arch: per, cav: per };
}
// ztráty: frac z každého typu (zaokrouhleně), vrací {losses, survivors}
function splitLosses(a, frac) {
  const losses = emptyArmy(), survivors = emptyArmy();
  for (const k of UNIT_KEYS) {
    losses[k] = Math.min(a[k], Math.round(a[k] * frac));
    survivors[k] = a[k] - losses[k];
  }
  return { losses, survivors };
}
// eliminace n jednotek z armády (poměrně mezi typy) — „první úder“ před bojem
function armyCull(a, n) {
  const total = armyTotal(a);
  if (total <= 0 || n <= 0) return;
  const frac = Math.min(1, n / total);
  for (const k of UNIT_KEYS) a[k] = Math.max(0, a[k] - Math.round(a[k] * frac));
}

// síla armády proti konkrétnímu nepříteli (+30 % proti typu, který jednotka poráží)
function armyPower(army, enemy, mult = 1) {
  const totalE = enemy ? armyTotal(enemy) : 0;
  let p = 0;
  for (const k of UNIT_KEYS) {
    let bonus = 0;
    if (totalE > 0) bonus = COUNTER_BONUS * (enemy[UNIT_TYPES[k].counters] / totalE);
    p += army[k] * UNIT_TYPES[k].power * (1 + bonus);
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
function simulateBattle(ctx) {
  const mkSide = (src, heroLed) => ({
    f: src.faction, hero: src.hero || null, heroLed,
    army: armyClone(src.army),
    dead: emptyArmy(), wounded: emptyArmy(),
    ragged: 0, fell: false, stacks: 0, stunned: false, routed: false,
    avoid: (src.hero && src.hero.avoidCharges) || 0,
  });
  const A = mkSide(ctx.attacker, true);
  const D = mkSide(ctx.defender, !!ctx.defender.heroLed);
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
  const roundLog = [];
  const snap = a => ({ inf: Math.round(a.inf), arch: Math.round(a.arch), cav: Math.round(a.cav) });
  const pct = v => Math.round(v * 100);

  // ---- staty formace: vlastní stat jednotky + staty velitele ----
  // stackAtk/stackDef narůstají za každé dokončené kolo s velitelem v sedle
  const formAtk = (S, k) => UNIT_TYPES[k].atk
    + (act(S) ? S.hero.atk + S.stacks * (S.hero.stackAtk || 0) : 0);
  const formDef = (S, k) => UNIT_TYPES[k].def
    + (act(S) ? S.hero.def + S.stacks * (S.hero.stackDef || 0) : 0);
  const mod = diff => Math.max(0.5, Math.min(2, 1 + ATKDEF_STEP * diff));

  // ---- výběr cíle ----
  // Formace míří na typ, který poráží (kámen–nůžky–papír je tak vidět);
  // když ten padl, bije do nejsilnější zbývající. Velitel jde vždy na
  // nejsilnější formaci — jeho úder má bolet tam, kde je nepřítel nejtěžší.
  const pickTarget = (E, attKey, krome) => {
    const pref = attKey ? UNIT_TYPES[attKey].counters : null;
    if (pref && pref !== krome && alive(E, pref)) return pref;
    let best = null, bn = 0.5;
    for (const k of UNIT_KEYS)
      if (k !== krome && E.army[k] > bn) { bn = E.army[k]; best = k; }
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
      if (ev) ev.push(`${S === A ? "⚔" : "🛡"} 🛡 [Armáda] vyhnutí: úder pohlcen` +
        `${S.avoid > 0 ? ` (zbývá ${S.avoid})` : ""}`);
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
        if (ev) ev.push(`${S === A ? "⚔" : "🛡"} 💔 ${S.hero.name} padá vyčerpáním — bojuje se dál bez velitele!`);
      }
      dmg *= 1 - HERO_DMG_SHARE;
    }
    if (!k || S.army[k] <= 0) return 0;
    const u = UNIT_TYPES[k];
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
    if (cil && UNIT_TYPES[k].counters === cil) m *= 1 + COUNTER_BONUS;
    if (S.f) {
      const sc = passiveScale(S.f, k);
      if (S.f.key === "aldar" && k === "cav" && r === 1) m *= 1 + 0.20 * sc;       // Výpad
      if (S.f.key === "yllien" && k === "arch" && r % 3 === 0) m *= 1 + 1.0 * sc;  // Dvojitý výstřel
      if (S.f.key === "durgar" && k === "inf") m *= 1 + 0.08 * sc * S.ragged;      // Krvavá zbroj
      if (S.f.key === "durgar" && k === "cav" && role === "att" && ctx.structure) m *= 1 + 0.25 * sc; // Beranidlo
      if (S.f.key === "horda" && k === "arch" && E.heroLed) m *= 1 + 0.25 * sc;    // Lovci hrdinů
      if (S.f.key === "horda" && k === "cav") m *= 1 + 0.05 * sc * (r - 1);        // Popelná smršť
    }
    // podmínkové bonusy velitele: [typ jednotky] a [proti frakci]
    if (act(S) && S.hero.unitDmg) m *= 1 + (S.hero.unitDmg[k] || 0) / 100;
    if (act(S) && S.hero.vsAll) m *= 1 + S.hero.vsAll / 100;
    // kolová aktivka na celou armádu (např. „⏱ každé 3. kolo +25 %")
    if (act(S)) for (const a of (S.hero.armyActives || []))
      if (activeFires(a, r)) m *= 1 + a.pct / 100;
    return n * UNIT_TYPES[k].dmg * m;
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
      if (extra >= 0.5 && ev) ev.push(`${S === A ? "⚔ " : "🛡 "}⏱ ${a.name}: ` +
        `[proti ${a.targets} cílům] ${a.pct} % poškození velitele (+${Math.round(extra)})`);
      d += extra;
    }
    return d;
  };

  let rounds = 0;
  for (let r = 1; r <= ROUND_CAP; r++) {
    if (!anyForm(A) || !anyForm(D)) break;
    rounds = r;
    const ev = [];
    const note = (S, txt) => ev.push((S === A ? "⚔ " : "🛡 ") + txt);
    const markA = { killed: 0 }, markD = { killed: 0 };

    // ---- omráčení: velitel se šancí stunChance vyřadí protějšek na kolo ----
    A.stunned = D.stunned = false;
    for (const [S, E] of [[A, D], [D, A]]) {
      if (!heroUp(S) || !(S.hero.stunChance > 0) || !heroUp(E)) continue;
      if (rng() * 100 >= S.hero.stunChance) continue;
      if (E.hero.stunImmune) {
        if (r === 1) note(E, `${E.hero.name}: odolává omráčení (imunita)`);
        continue;
      }
      E.stunned = true;
      note(S, `💫 ${S.hero.name} omračuje: ${E.hero.name} toto kolo nepřispívá`);
    }

    // ---- hlášky frakčních pasivek, které v tomto kole působí ----
    for (const [S, E, role] of [[A, D, "att"], [D, A, "def"]]) {
      if (!S.f) continue;
      const sc = k => passiveScale(S.f, k);
      if (S.f.key === "aldar") {
        if (r === 1 && alive(S, "cav")) note(S, `Výpad: jízda +${pct(0.20 * sc("cav"))} % v 1. kole`);
        if (r === 1 && alive(S, "arch")) note(S, `Přesná salva: protiúder −${pct(0.25 * share(S, "arch") * sc("arch"))} %`);
        if (r === 1 && alive(S, "inf")) note(S, `Štítová formace: ztráty pěchoty −${pct(0.30 * sc("inf"))} % v 1. kole`);
      }
      if (S.f.key === "yllien") {
        if (r % 3 === 0 && alive(S, "arch")) note(S, `Dvojitý výstřel: lučištníci střílí dvakrát`);
        if (r === 1 && role === "def" && alive(S, "inf")) note(S, `Lesní úskok: ztráty pěchoty −${pct(0.15 * sc("inf"))} % každé kolo`);
      }
      if (S.f.key === "durgar") {
        if (S.ragged > 0 && alive(S, "inf")) note(S, `Krvavá zbroj: pěchota +${pct(0.08 * sc("inf") * S.ragged)} %`);
        if (r === 1 && role === "att" && alive(S, "arch") && ctx.defender.mult > 1)
          note(S, `Těžké šipky: obchází ${pct(0.30 * share(S, "arch") * sc("arch"))} % obranného bonusu`);
        if (r === 1 && role === "att" && alive(S, "cav") && ctx.structure)
          note(S, `Beranidlo: jízda +${pct(0.25 * sc("cav"))} % proti opevnění`);
      }
      if (S.f.key === "horda") {
        if (r === 1 && alive(S, "arch") && E.heroLed) note(S, `Lovci hrdinů: +${pct(0.25 * sc("arch"))} % proti hrdinovi`);
        if (r >= 2 && alive(S, "cav")) note(S, `Popelná smršť: jízda +${pct(0.05 * sc("cav") * (r - 1))} %`);
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
      return red;
    };

    // ---- šílenství: zasažená formace se může obrátit proti vlastním řadám ----
    A.madness = null; D.madness = null;
    for (const [S, E] of [[A, D], [D, A]]) {
      if (!act(S) || !(S.hero.madness > 0) || !anyForm(E)) continue;
      if (rng() * 100 >= S.hero.madness) continue;
      const kandidati = UNIT_KEYS.filter(k => alive(E, k));
      E.madness = kandidati[Math.floor(rng() * kandidati.length)];
      note(S, `🌀 ${S.hero.name} sesílá šílenství: ${UNIT_TYPES[E.madness].name} nepřítele ` +
        `se toto kolo může obrátit proti svým`);
    }

    // ---- pořadí jednajících: velitelé napřed, pak formace dle rychlosti ----
    const actors = [];
    if (act(A)) actors.push({ S: A, E: D, k: null, spd: 1000 + (A.hero.speed || 0) });
    if (act(D)) actors.push({ S: D, E: A, k: null, spd: 1000 + (D.hero.speed || 0) });
    for (const k of UNIT_KEYS) {
      if (alive(A, k)) actors.push({ S: A, E: D, k, spd: UNIT_TYPES[k].ini });
      if (alive(D, k)) actors.push({ S: D, E: A, k, spd: UNIT_TYPES[k].ini });
    }
    // shoda rychlosti → útočník napřed (deterministicky, bez rng)
    actors.sort((x, y) => y.spd - x.spd || (x.S === A ? -1 : 1));
    if (r === 1) {
      const spdA = heroUp(A) ? A.hero.speed : MILITIA_SPEED;
      const spdD = heroUp(D) ? D.hero.speed : MILITIA_SPEED;
      if (spdA !== spdD)
        note(spdA > spdD ? A : D, `Rychlejší velení (${Math.max(spdA, spdD)} proti ${Math.min(spdA, spdD)}): udeří první`);
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
      if (ac.k !== null && S.madness === ac.k && rng() < 0.5) { T = S; zbesily = true; }
      const cil = pickTarget(T, zbesily ? null : ac.k, zbesily ? ac.k : null);
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
          note(S, `Kouzla ${S.hero.name}: ${Math.round(kouzlo)} poškození přímo do životů každé kolo`);
        velitel += kouzlo;
        dmg = velitel;
        // neodvratný úder: obranná charga ho nepohltí
        if (act(S) && S.hero.pursuit > 0 && rng() * 100 < S.hero.pursuit) {
          neodvratny = true;
          note(S, `🎯 ${S.hero.name}: neodvratný úder — vyhnout se mu nejde`);
        }
      } else {
        const f = nasob * out * mod(formAtk(S, ac.k) - formDef(T, cil)) * formRed(T, cil) / opev;
        dmg = formPower(S, E, ac.k, cil, r, role) * f;
      }
      dmg /= DMG_PACE;
      velitel /= DMG_PACE;
      if (dmg <= 0) return false;
      if (zbesily)
        note(S, `🌀 ${UNIT_TYPES[ac.k].name} v šílenství útočí na vlastní ${UNIT_TYPES[cil].name}!`);
      tot[S === A ? "dmgA" : "dmgD"] += dmg;
      if (velitel > 0) tot[S === A ? "cmdA" : "cmdD"] += velitel;
      hitForm(T, cil, dmg, ev, mark, neodvratny);
      return true;
    };

    // ---- vlastní kolo ----
    for (const ac of actors) {
      if (!anyForm(ac.E)) break;
      uderit(ac, false);
      // navazující úder velitele: PLNÝ druhý útok, ne přípočet k prvnímu
      if (ac.k === null && act(ac.S) && ac.S.hero.followUp > 0
          && rng() * 100 < ac.S.hero.followUp && anyForm(ac.E)) {
        note(ac.S, `${ac.S.hero.name}: navazující úder — bije podruhé`);
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
    if (revA >= 0.5) note(A, `Požírači: pěchota pohltila ${Math.round(revA)} padlých`);
    if (revD >= 0.5) note(D, `Požírači: pěchota pohltila ${Math.round(revD)} padlých`);

    if (r === 1) for (const S of [A, D]) {
      if (!heroUp(S)) continue;
      if (S.hero.stackAtk) note(S, `${S.hero.name}: útok +${Math.round(S.hero.stackAtk * 100) / 100} každým kolem boje (sčítá se)`);
      if (S.hero.stackDef) note(S, `${S.hero.name}: obrana +${Math.round(S.hero.stackDef * 100) / 100} každým kolem boje (sčítá se)`);
      if (S.hero.stunChance > 0) note(S, `${S.hero.name}: ${S.hero.stunChance} % šance každé kolo omráčit nepřátelského velitele`);
      if (S.avoid > 0) note(S, `${S.hero.name}: [Armáda] pohltí ${S.avoid} ${S.avoid === 1 ? "úder" : "údery"}` +
        `${S.hero.avoidChance < 100 ? ` s ${S.hero.avoidChance}% šancí` : ""}`);
      for (const a of (S.hero.armyActives || []))
        note(S, `⏱ ${a.name}: [Armáda] +${a.pct} % poškození ${a.round ? `v ${a.round}. kole` : `každé ${a.every}. kolo`}`);
      if (S.hero.unitDmg) for (const k of UNIT_KEYS) {
        if (S.hero.unitDmg[k] > 0 && (S === A ? initA : initD)[k] > 0.5)
          note(S, `${S.hero.name}: [${UNIT_TYPES[k].icon} ${UNIT_TYPES[k].name}] +${S.hero.unitDmg[k]} % poškození`);
      }
      if (S.hero.vsAll > 0) note(S, `${S.hero.name}: [proti nepřátelské frakci] +${S.hero.vsAll} % poškození jednotek`);
    }

    roundLog.push({ r, pA: Math.round(tot.dmgA), pD: Math.round(tot.dmgD),
      killedA: Math.round(markA.killed), killedD: Math.round(markD.killed),
      hpA: A.hero ? Math.max(0, Math.round(A.hero.hp)) : null,
      hpD: D.hero ? Math.max(0, Math.round(D.hero.hp)) : null,
      remA: snap(A.army), remD: snap(D.army), ev });

    if (act(A)) A.stacks++;
    if (act(D)) D.stacks++;

    // ---- zlomení: strana pod ROUT_AT původního stavu odtáhne ----
    const sila = (S, init) => armyTotal(S.army) / Math.max(1, armyTotal(init));
    if (anyForm(A) && sila(A, initA) < ROUT_AT) {
      A.routed = true;
      note(A, `Řady se lámou — ${A.hero ? A.hero.name : "vojsko"} odvolává útok a stahuje se.`);
    }
    if (anyForm(D) && sila(D, initD) < ROUT_AT) {
      D.routed = true;
      note(D, `Obrana se hroutí — obránce opouští pozice.`);
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
  log: [],
  reports: [],      // bojové reporty (záznamy kol pro prohlížeč bitev)
  nextReportId: 1,
  mapEvents: [],    // putovní události na mapě {key, type, ticksLeft, total}
  nextEventTick: 0,
  storm: 0,         // zbývající tiky popelné bouře (0 = klid)
  nextStormTick: 0,
  throneOpen: false,
  goals: [],        // cíle sezóny hráče {key, desc, reward, done}
  visible: new Set(),  // mlha války: co hráč právě vidí
  explored: new Set(), // co už kdy viděl
  onEvent: null,       // hook pro zvuky/efekty UI (name, factionId)
};

// události pro UI (zvuky): hra sama nic nepřehrává, jen hlásí
function emitEvent(name, factionId) {
  if (G.onEvent) { try { G.onEvent(name, factionId); } catch (e) {} }
}

function mapEventAt(key) { return G.mapEvents.find(e => e.key === key) || null; }

function tileAt(q, r) { return G.tiles.get(keyOf(q, r)); }
function neighborsOf(tile) {
  const out = [];
  for (const [dq, dr] of DIRS4) {
    const t = tileAt(tile.q + dq, tile.r + dr);
    if (t) out.push(t);
  }
  return out;
}

// ---------- Řeky a mosty ----------
// Čtyři řeky vedou po úhlopříčkách mřížky (mezi sousedními hlavními městy)
// od vnějšího prstence k okraji světa — na obrazovce jsou to vodorovné a
// svislé toky dělící mapu na kvadranty. Dílky řeky se dotýkají rohy, což
// pohyb po 4 sousedech blokuje stejně spolehlivě jako plná zeď.
// Každou řeku překonává jediný most.
function riverKeys() {
  const keys = new Map();   // klíč → "a" (koryto podél světové X) | "b" (podél Z)
  for (let k = 5; k <= MAP_R; k++) {
    keys.set(keyOf(k, k), "b");  keys.set(keyOf(-k, -k), "b");
    keys.set(keyOf(k, -k), "a"); keys.set(keyOf(-k, k), "a");
  }
  return keys;
}
const BRIDGE_KEYS = [keyOf(8, 8), keyOf(-8, -8), keyOf(8, -8), keyOf(-8, 8)];

// ---------- Generování mapy ----------
// stupeň pole podle vzdálenosti od trůnu: čím blíž středu, tím bohatší a hůř
// bráněné území (hlavní města sedí ve vzdálenosti 16 mezi poli síly 1–15)
function levelForDist(d) {
  let lvl;
  if (d <= 1) lvl = 12;
  else if (d < WALL_R) lvl = 11 + (rng() < 0.35 ? 1 : 0);
  else if (d < OUTER_R) lvl = 8 + randInt(0, 2);   // mezi prstenci: 150–230
  else if (d <= 10) lvl = 6 + randInt(0, 1);       // 90–130
  else if (d <= 12) lvl = 4 + randInt(0, 1);       // 30–60
  else if (d <= 14) lvl = 3 + randInt(0, 1);       // 15–30
  else if (d <= 16) lvl = 2 + randInt(0, 1);       // 10–15
  else lvl = 1 + (rng() < 0.4 ? 1 : 0);            // okraj světa: 1–10
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

function genMap() {
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
  for (const key of BRIDGE_KEYS) {
    const t = G.tiles.get(key);
    if (t) { t.terrain = "bridge"; t.structure = "bridge"; }
  }
  // vnější prstenec opevnění: hradby ve vzdálenosti OUTER_R; branami jsou
  // čtyři VELKÉ PEVNOSTI — shluky 5 polí (srdce + 4 bašty), těžké na dobytí
  const GRAND_KEYS = [keyOf(OUTER_R, 0), keyOf(0, OUTER_R), keyOf(-OUTER_R, 0), keyOf(0, -OUTER_R)];
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
    if (d === OUTER_R) { t.terrain = "wall"; t.structure = null; }
  }
  // vnitřní hradby kolem trůnu se čtyřmi pevnostmi — jediné brány dovnitř
  const FORT_KEYS = [keyOf(WALL_R, 0), keyOf(0, WALL_R), keyOf(-WALL_R, 0), keyOf(0, -WALL_R)];
  for (const t of G.tiles.values()) {
    const d = gridDist(t, center);
    if (d === WALL_R) {
      if (FORT_KEYS.includes(keyOf(t.q, t.r))) {
        t.terrain = "plains"; t.structure = "fortress"; t.level = 12;
      } else {
        t.terrain = "wall"; t.structure = null;
      }
    } else if (d < WALL_R) {
      if (!TERRAIN[t.terrain].passable) t.terrain = "plains";
      t.structure = null;
    }
  }
  const throne = tileAt(0, 0);
  throne.terrain = "plains"; throne.structure = "throne"; throne.level = 12;
  let placed = 0, guard = 0;
  while (placed < 10 && guard++ < 900) {
    const arr = [...G.tiles.values()];
    const t = arr[randInt(0, arr.length - 1)];
    const dC = distLvl(t.q, t.r);   // krajinná vzdálenost — města i v úhlopříčných klínech
    if (dC <= OUTER_R + 1 || dC > 14 || t.structure || !TERRAIN[t.terrain].passable) continue;
    if (CAPITAL_POS.some(c => gridDist(t, c) < 4)) continue;
    if ([...G.tiles.values()].some(x => x.structure === "city" && gridDist(t, x) < 4)) continue;
    t.terrain = "plains"; t.structure = "city"; placed++;
  }
  CAPITAL_POS.forEach((pos, i) => {
    const cap = tileAt(pos.q, pos.r);
    cap.terrain = "plains"; cap.structure = "capital"; cap.owner = i; cap.level = 2;
    for (const n of neighborsOf(cap)) {
      if (n.structure) continue;
      if (!TERRAIN[n.terrain].passable) n.terrain = "plains";
      n.owner = i;
    }
  });
  repairBridges();
  ensureConnectivity();
  for (const t of G.tiles.values()) {
    if (TERRAIN[t.terrain].passable) assignRes(t);
    if (t.owner !== -1 || !TERRAIN[t.terrain].passable) continue;
    if (t.structure && t.structure !== "outpost") {
      t.garrison = STRUCTURES[t.structure].militia;
      continue;
    }
    t.garrison = LEVEL_GARRISON[t.level]; // pevně podle stupně, žádná náhoda
  }
}

// most musí skutečně spojovat oba břehy: řeka vede po úhlopříčce, takže se
// žádný ze čtyř sousedů mostu nedotýká řeky hranou — dva leží na jednom
// břehu, dva na druhém. Na každém břehu musí být aspoň jedno průchozí pole
// (náhodná jezera za mostem uměla přechod zaslepit — proměníme je na pláně)
function repairBridges() {
  for (const key of BRIDGE_KEYS) {
    const b = G.tiles.get(key);
    if (!b) continue;
    // řeka q=r (koryto "b") dělí svět na strany podle znaménka q−r;
    // řeka q=−r (koryto "a") podle znaménka q+r
    const strana = t => Math.sign(b.riv === "a" ? t.q + t.r : t.q - t.r);
    for (const s of [-1, 1]) {
      const breh = neighborsOf(b).filter(n => strana(n) === s);
      if (!breh.length || breh.some(n => TERRAIN[n.terrain].passable)) continue;
      breh[0].terrain = "plains";
      breh[0].structure = null;
      delete breh[0].riv;
    }
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
  while (guard++ < 12) {
    const reach = flood(throneKey);
    const cut = CAPITAL_POS.find(c => !reach.has(keyOf(c.q, c.r)));
    if (!cut) return;
    const island = flood(keyOf(cut.q, cut.r));
    const river = riverKeys();
    let ford = null, riverFord = null;
    for (const t of G.tiles.values()) {
      if (t.terrain !== "water") continue;
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
function makeHero(defIdx) {
  return { defIdx, stamina: STAMINA_MAX, hp: HERO_HP_BASE, pos: null,
    army: emptyArmy(), cooldown: 0, stars: 0,
    level: 1, xp: 0, equip: emptyEquip(), guard: false, skills: {}, skillPts: 0 };
}

// (povyšování za 💠 zrušeno ve v0.9 — hvězdy rostou respektem z dárků,
// viz applyGiftToAccount)

// playerHeroes: defIdx jediného startovního hrdiny hráče (vybraný na startu);
// AI si startovního hrdinu losuje, zbytek jde do zásoby k najmutí
function initFactions(playerIndex, playerHeroes) {
  G.playerFaction = playerIndex;
  G.factions = FACTION_DEFS.map((def, i) => {
    let start;
    if (i === playerIndex && playerHeroes && playerHeroes.length >= 1) {
      start = [playerHeroes[0]];
    } else {
      start = [randInt(0, HERO_DEFS[def.key].length - 1)];
    }
    return {
      id: i, ...def,
      isAI: i !== playerIndex,
      alive: true,
      resources: { food: 200, wood: 120, stone: 80, iron: 60, gold: 100 },
      units: { inf: 20, arch: 0, cav: 0 },
      buildings: { main: 1, barracks: 1, hospital: 0, market: 0 },
      upgrades: { inf: 0, arch: 0, cav: 0 },   // frakční vylepšení typů jednotek
      build: null,      // {key, ticksLeft, total}
      heroes: start.map(makeHero),
      boosts: { build: 0, prod: 0 }, // zbývající tiky posilovacích doplňků
      freeRespecs: 2,   // dva resety dovedností na sezónu zdarma (větší strom = víc pokusů)
      hirePool: HERO_DEFS[def.key].map((_, d) => d).filter(d => !start.includes(d)), // hrdinové k najmutí
      items: [],        // frakční inventář kořisti
      marches: [],      // {kind, fromKey, targetKey, army, ticksLeft, total, heroIdx}
      recruitQueue: [], // {type, ticksLeft}
      aiCooldown: randInt(3, 6),
      pacts: {},        // {otherId: zbývající tiky paktu o neútočení}
      pactCooldown: {}, // {otherId: tiky, po které nejednat o novém paktu}
      offerToPlayer: 0, // AI nabízí hráči pakt (zbývající tiky nabídky)
      grudge: {},       // {otherId: 1} — zrada: AI míří na zrádce ochotněji
      starving: 0,      // tiky hladovění armády (bez jídla)
      stats: { wins: 0 },
    };
  });
}

// pakt o neútočení je vzájemný — čte se z obou stran
function hasPact(a, b) { return !!(a.pacts[b.id] && a.pacts[b.id] > 0); }

// ---------- Hrdinové ----------
function heroDef(faction, heroIdx) { return HERO_DEFS[faction.key][faction.heroes[heroIdx].defIdx]; }
function heroTrait(faction, heroIdx) { return HERO_TRAITS[heroDef(faction, heroIdx).trait]; }
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
  const unitDmg = { inf: 0, arch: 0, cav: 0 };
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
  const starMult = 1 + STAR_STAT_BONUS * (h.stars || 0);
  return {
    // bojové staty: přičítají se ke statům armády, kterou hrdina vede;
    // předměty přidávají stat svého slotu přímo (zbraň poškození, štít
    // obranu, brnění životy, helma kouzla, boty rychlost, rukavice útok)
    hpMax: Math.round((HERO_HP_BASE + HERO_HP_PER_LEVEL * (h.level - 1)
            + (trait.hp || 0) + eff("hp") + item("hp")) * starMult),
    atk: (HERO_ATK_BASE + HERO_ATK_PER_LEVEL * (h.level - 1) + (trait.atk || 0)
            + eff("atk") + item("atk")) * starMult,
    def: (HERO_DEF_BASE + HERO_DEF_PER_LEVEL * (h.level - 1) + (trait.def || 0)
            + eff("def") + item("def")) * starMult,
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
    vsStunImmune,               // imunita jen proti dané frakci (cond.vsFaction)
    unitDmg, vsDmg,             // podmínkové bonusy poškození
    // kolové aktivky: poškození velitele vs posílení armády (viz heroActives)
    actives: acts.filter(a => a.type === "roundDmg"),
    armyActives: acts.filter(a => a.type === "roundArmy"),
    // obranné chargy: prvních N úderů může strana zcela pohltit
    avoidCharges: Math.round(eff("avoidCharge")),
    avoidChance: Math.min(100, eff("avoidChance") || (eff("avoidCharge") > 0 ? 100 : 0)),
    ward: Math.min(0.8, ((trait.ward || 0) + eff("ward")) / 100),
    time: Math.max(0.35, (trait.time || 1) * (1 - eff("speed") / 100)),
    regen: (trait.regen || 1) * (1 + eff("regen") / 100),
    stamMax: STAMINA_MAX + LEVEL_STAMINA * (h.level - 1) + eff("stam"),
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
  return heroStats(faction, heroIdx).cap;
}

// jednotky již vázané na hrdinu: jeho armáda + konvoje posil na cestě k němu
function heroArmyCommitted(faction, heroIdx) {
  const h = faction.heroes[heroIdx];
  let n = armyTotal(h.army);
  if (h.pos) for (const m of faction.marches)
    if (m.kind === "reinforce" && m.targetKey === h.pos) n += armyTotal(m.army);
  return n;
}

// síla hrdiny v osobním duelu: úroveň, bojové staty a výbava
function duelPower(faction, heroIdx) {
  const h = faction.heroes[heroIdx];
  const st = heroStats(faction, heroIdx);
  const gear = ITEM_SLOT_KEYS.filter(s => h.equip[s]).length;
  return h.level * 6 + (st.atk + st.def) * 6 + st.dmg / 2 + st.spell / 2 + gear * 4;
}

function heroPosOf(faction, heroIdx) {
  const h = faction.heroes[heroIdx];
  if (h.pos) { const t = G.tiles.get(h.pos); return { q: t.q, r: t.r }; }
  return CAPITAL_POS[faction.id];
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

// hráč si vybírá, koho z pool naverbuje; bez defIdx (AI) se losuje
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
  addLog(faction.id, `${HERO_DEFS[faction.key][defIdx].name} se přidává k frakci ${faction.name}.`);
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
  if (t.structure === "grandfort" || t.structure === "bastion") {
    inc.stone = 3; inc.gold = 2; return inc;
  }
  if (!t.res) return inc;
  const v = TIER_YIELD[t.level - 1];
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
  for (const t of G.tiles.values()) {
    if (t.owner !== faction.id) continue;
    const y = tileYield(t);
    for (const res in y) inc[res] += y[res] * (faction.incomeMult[res] || 1);
  }
  const mainBonus = 1 + 0.1 * (faction.buildings.main - 1);
  for (const res in inc) inc[res] *= mainBonus;
  if (G.storm > 0) for (const res in inc) inc[res] *= STORM_INCOME; // popelná bouře
  // Roh hojnosti: dočasně zdvojnásobená produkce celé říše (v0.9)
  if (faction.boosts && faction.boosts.prod > 0) for (const res in inc) inc[res] *= 2;
  return inc;
}

// údržba: armáda žere jídlo (zásoba + armády hrdinů + pochodující oddíly)
function armyUpkeep(faction) {
  let units = armyTotal(faction.units);
  for (const h of faction.heroes) units += armyTotal(h.army);
  for (const m of faction.marches) units += armyTotal(m.army);
  for (const t of G.tiles.values())
    if (t.owner === faction.id && t.structure === "outpost" && t.outpost)
      units += armyTotal(t.outpost);
  return units * UPKEEP_PER_UNIT;
}

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
  return true;
}

function buildCost(faction, key) {
  if (key.startsWith("up_")) {
    const type = key.slice(3);
    const target = faction.upgrades[type] + 1;
    if (target > UPGRADE_MAX) return null;
    return { target, cost: UPGRADE_COST[target], time: UPGRADE_TIME[target] };
  }
  const target = faction.buildings[key] + 1;
  if (target > BUILDINGS[key].max) return null;
  return { target, cost: BUILDINGS[key].cost[target], time: BUILDINGS[key].time[target] };
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
  } else if (key !== "main" && info.target > faction.buildings.main) {
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

function recruitTicks(faction) {
  return 12 - 2 * (faction.buildings.barracks - 1); // 12 / 10 / 8 s
}

// batches: kolik dávek po RECRUIT_BATCH naráz (Shift+klik = 10 dávek = 100
// jednotek); platí se vše předem a cvičí se souběžně jako jedna zakázka
function startRecruit(faction, type, batches = 1) {
  batches = Math.max(1, Math.min(10, batches | 0));
  if (!unitUnlocked(faction, type)) return false;
  const one = UNIT_TYPES[type].cost;
  const cost = {};
  for (const res in one) cost[res] = one[res] * batches;
  if (!canAfford(faction, cost)) return false;
  pay(faction, cost);
  faction.recruitQueue.push({ type, ticksLeft: recruitTicks(faction),
    count: RECRUIT_BATCH * batches });
  return true;
}

// ---------- verbovací zakázka (panel Výcvik) ----------
// Panel skládá výcvik jako armádu: jezdíkem se u každého typu nastaví POČET
// KUSŮ, ceny se sečtou a platí se jednou. Ceny v UNIT_TYPES jsou za dávku
// RECRUIT_BATCH, takže se dělí a zaokrouhlují nahoru (za 1 kus se nikdy
// neplatí míň, než kolik vychází z dávkové ceny).
const RECRUIT_MAX_ORDER = 500;    // strop na typ a zakázku (šířka jezdíku)

function armyCp(army) {
  let cp = 0;
  for (const k of UNIT_KEYS) cp += (army[k] || 0) * UNIT_TYPES[k].cp;
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
    const one = UNIT_TYPES[k].cost;
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
  const ticks = recruitTicks(faction);
  for (const k in clean)
    faction.recruitQueue.push({ type: k, ticksLeft: ticks, count: clean[k] });
  return true;
}

// kolik kusů daného typu si frakce může dovolit, kdyby verbovala jen ten
function recruitAffordable(faction, type) {
  const one = UNIT_TYPES[type].cost;
  let max = RECRUIT_MAX_ORDER;
  for (const res in one) {
    if (!one[res]) continue;
    max = Math.min(max, Math.floor((faction.resources[res] || 0) * RECRUIT_BATCH / one[res]));
  }
  return Math.max(0, max);
}

// ---------- Výspa (outpost) ----------
// obranná stavba za kámen: posádka až 2000 jednotek drží NEUSTÁLOU stráž
// nad polem i sousedy; jednotky se přesouvají mezi výspou a zásobou volně
function buildOutpost(faction, tile) {
  if (tile.owner !== faction.id || tile.structure) return false;
  if (!TERRAIN[tile.terrain].passable || tile.terrain === "bridge") return false;
  if (!canAfford(faction, OUTPOST_COST)) return false;
  pay(faction, OUTPOST_COST);
  tile.structure = "outpost";
  tile.outpost = emptyArmy();
  addLog(faction.id, `🗼 ${faction.name} staví výspu — ${tileLabel(tile)}.`);
  return true;
}

function outpostDeposit(faction, tile, army) {
  if (tile.owner !== faction.id || tile.structure !== "outpost" || !tile.outpost) return false;
  if (!army) return false;
  army = { inf: Math.floor(army.inf || 0), arch: Math.floor(army.arch || 0), cav: Math.floor(army.cav || 0) };
  if (armyTotal(army) <= 0) return false;
  for (const k of UNIT_KEYS) if (army[k] < 0 || army[k] > faction.units[k]) return false;
  if (armyTotal(tile.outpost) + armyTotal(army) > OUTPOST_CAP) return false;
  for (const k of UNIT_KEYS) { faction.units[k] -= army[k]; tile.outpost[k] += army[k]; }
  return true;
}

function outpostWithdraw(faction, tile) {
  if (tile.owner !== faction.id || tile.structure !== "outpost" || !tile.outpost) return false;
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
  const army = balancedArmy(militia * SOLDIER_POWER);
  const owner = G.factions[tile.owner];
  const key = keyOf(tile.q, tile.r);
  const contributors = []; // hrdinové, jejichž armády tu bojují (nesou skutečné ztráty)
  const outposts = [];     // výspy, jejichž posádky tu bojují (nesou skutečné ztráty)
  let holdMult = 1; // obranné dovednosti hrdiny stojícího na poli
  for (let i = 0; i < owner.heroes.length; i++) {
    const h = owner.heroes[i];
    if (h.pos === key) {
      armyAdd(army, h.army);
      holdMult = Math.max(holdMult, heroStats(owner, i).holdDef);
      contributors.push({ faction: owner, idx: i });
    }
    // hrdina na stráži brání i sousední vlastní pole
    else if (h.guard && h.pos && gridDist(G.tiles.get(h.pos), tile) === 1) {
      armyAdd(army, h.army);
      contributors.push({ faction: owner, idx: i });
    }
  }
  // výspa: posádka brání vlastní pole a drží NEUSTÁLOU stráž nad sousedy
  if (tile.structure === "outpost" && tile.outpost) {
    armyAdd(army, tile.outpost);
    outposts.push(tile);
  }
  for (const n of neighborsOf(tile)) {
    if (n.owner === tile.owner && n.structure === "outpost" && n.outpost
        && armyTotal(n.outpost) > 0) {
      armyAdd(army, n.outpost);
      outposts.push(n);
    }
  }
  // vlastní hlavní město brání i všechny nenasazené jednotky ze zásoby
  let homeFaction = null;
  const capPos = CAPITAL_POS[owner.id];
  if (tile.q === capPos.q && tile.r === capPos.r) {
    armyAdd(army, owner.units);
    homeFaction = owner;
  }
  const structDef = { fortress: 1.4, grandfort: 1.5, bastion: 1.3, outpost: 1.3 }[tile.structure] || 1;
  return { army, mult: TERRAIN[tile.terrain].defBonus * holdMult * stormMult * structDef,
    contributors, outposts, homeFaction };
}

function tileDefense(tile) {
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
  if (tile.structure === "grandfort") return 500;
  if (tile.structure === "bastion") return 300;
  if (tile.structure) return STRUCTURES[tile.structure].militia;
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
function neutralCommander(tile) {
  const label = tileStrengthLabel(tile);
  const level = neutralHeroLevel(label);
  // murmur3 fmix32 — obyčejné násobení by u velkých čísel ztratilo přesnost
  // a nízké bity by se špatně promíchaly (část velitelů by nikdy nepadla)
  let hsh = (Math.imul(tile.q, 73856093) ^ Math.imul(tile.r, 19349663)) >>> 0;
  hsh = Math.imul(hsh ^ (hsh >>> 16), 2246822507) >>> 0;
  hsh = Math.imul(hsh ^ (hsh >>> 13), 3266489909) >>> 0;
  hsh = (hsh ^ (hsh >>> 16)) >>> 0;
  const def = NEUTRAL_COMMANDERS[hsh % NEUTRAL_COMMANDERS.length];
  const tr = HERO_TRAITS[def.trait] || {};
  const lv = Math.max(1, Math.round(1 + (level - 1) * NEUTRAL_POWER));
  return {
    name: def.name, trait: def.trait, level: lv,
    hp: Math.round(HERO_HP_BASE + HERO_HP_PER_LEVEL * (lv - 1) + (tr.hp || 0)),
    atk: HERO_ATK_BASE + HERO_ATK_PER_LEVEL * (lv - 1) + (tr.atk || 0),
    def: HERO_DEF_BASE + HERO_DEF_PER_LEVEL * (lv - 1) + (tr.def || 0),
    dmg: Math.round(HERO_DMG_BASE + HERO_DMG_PER_LEVEL * (lv - 1) + (tr.dmg || 0)),
    // rychlost domobrany: útočník útočí první, pokud nemá velitel rys rychlosti
    speed: MILITIA_SPEED + (tr.speed || 0),
    spell: 0, ward: 0,            // bez výbavy, hvězd i dovedností
    cap: neutralHeroCap(level, def.trait),
  };
}

function isAdjacentToFaction(faction, tile) {
  return neighborsOf(tile).some(n => n.owner === faction.id);
}

// ---------- Pochody ----------
// rychlost armády podle složení: lučištníci základ 1×, jízda o 30 % rychleji,
// pěchota o 20 % pomaleji; smíšená armáda jde váženým průměrem podílů
const UNIT_SPEED = { inf: 0.8, arch: 1.0, cav: 1.3 };

function armyTimeMult(army) {
  const total = armyTotal(army);
  if (total <= 0) return 1;
  let speed = 0;
  for (const k of UNIT_KEYS) speed += (army[k] / total) * UNIT_SPEED[k];
  return 1 / speed;
}

// žold za výpravu: útok na cizí pole stojí zlato podle velikosti armády;
// přesun po vlastním území je zdarma
const MARCH_GOLD_PER_UNIT = 0.3;

function marchGoldCost(faction, tile, army) {
  if (tile.owner === faction.id) return 0;
  return Math.ceil(armyTotal(army) * MARCH_GOLD_PER_UNIT);
}

function marchTime(faction, tile, heroIdx) {
  const from = heroIdx != null ? heroPosOf(faction, heroIdx) : CAPITAL_POS[faction.id];
  return Math.max(MARCH_TICKS, Math.round(MARCH_TICKS * gridDist(tile, from)));
}
function travelTicks(fromTile, toPos, perHex = MARCH_TICKS) {
  return Math.max(Math.round(perHex), Math.round(perHex * gridDist(fromTile, toPos)));
}

// returnAfter: nájezd „udeř a vrať se" — po vítězství hrdina pole nedrží,
// ale obrátí se a pochoduje zpět na pole, odkud útok vyšel
function startMarch(faction, tile, army, heroIdx, returnAfter = false) {
  // cílem smí být i vlastní pole (přesun hrdiny k obraně) — kromě hlavního
  // města (návrat řeší odvolání) a pole, na kterém už hrdina stojí
  const own = tile.owner === faction.id;
  if (own && tile.structure === "capital") return false;
  if (!TERRAIN[tile.terrain].passable) return false;
  if (!own && !isAdjacentToFaction(faction, tile)) return false;
  // Trůnní město je do půlky sezóny pod ochranou příměří
  if (tile.structure === "throne" && !G.throneOpen) return false;
  // pakt o neútočení blokuje útoky oběma směrům
  if (tile.owner !== -1 && !own && hasPact(faction, G.factions[tile.owner])) return false;
  if (heroIdx == null || !faction.heroes[heroIdx]) return false;
  if (!heroReady(faction, heroIdx, tile)) return false;
  const hero = faction.heroes[heroIdx];
  if (hero.pos === keyOf(tile.q, tile.r)) return false;
  const fromKey = hero.pos ?? keyOf(CAPITAL_POS[faction.id].q, CAPITAL_POS[faction.id].r);
  if (hero.pos) {
    // hrdina v poli útočí s celou svou armádou
    army = armyClone(hero.army);
    if (armyTotal(army) <= 0) return false;
  } else {
    if (!army) return false;
    army = { inf: Math.floor(army.inf || 0), arch: Math.floor(army.arch || 0), cav: Math.floor(army.cav || 0) };
    if (armyTotal(army) <= 0) return false;
    if (armyTotal(army) > heroArmyCap(faction, heroIdx)) return false; // limit velení
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
    marchTime(faction, tile, heroIdx) * stats.time * armyTimeMult(army)));
  hero.pos = null; // hrdina je na cestě
  hero.guard = false;
  faction.marches.push({ kind: "attack", fromKey, targetKey: keyOf(tile.q, tile.r),
    army, ticksLeft: total, total, heroIdx, returnAfter: !!returnAfter });
  return true;
}

// posily: konvoj z hlavního města k hrdinovi v poli (nevede ho hrdina, nemůže útočit)
function startReinforce(faction, tile, army) {
  if (!army) return false;
  army = { inf: Math.floor(army.inf || 0), arch: Math.floor(army.arch || 0), cav: Math.floor(army.cav || 0) };
  if (armyTotal(army) <= 0) return false;
  for (const k of UNIT_KEYS) {
    if (army[k] < 0 || army[k] > faction.units[k]) return false;
  }
  if (tile.owner !== faction.id) return false;
  const key = keyOf(tile.q, tile.r);
  if (!faction.heroes.some(h => h.pos === key)) return false;
  const capIdx = faction.heroes.findIndex(h => h.pos === key);
  // limit velení: armáda hrdiny + konvoje na cestě + tyto posily
  if (heroArmyCommitted(faction, capIdx) + armyTotal(army) > heroArmyCap(faction, capIdx))
    return false;
  for (const k of UNIT_KEYS) faction.units[k] -= army[k];
  const targetHero = faction.heroes.findIndex(h => h.pos === key);
  const convoy = heroStats(faction, targetHero).convoyMult;
  const total = Math.max(1, Math.round(
    travelTicks(tile, CAPITAL_POS[faction.id], REINFORCE_TICKS) * convoy * armyTimeMult(army)));
  faction.marches.push({ kind: "reinforce",
    fromKey: keyOf(CAPITAL_POS[faction.id].q, CAPITAL_POS[faction.id].r),
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
  if (cancelled > 0)
    addLog(faction.id, `↩ Posily pro ${heroDef(faction, heroIdx).name} (${faction.name}) se obracejí zpět do města.`);
  return cancelled > 0;
}

// dobrovolný návrat hrdiny z pole do hlavního města
function startRecall(faction, heroIdx) {
  const hero = faction.heroes[heroIdx];
  if (!hero || !hero.pos || heroBusy(faction, heroIdx)) return false;
  if (heroPinned(faction, heroIdx)) return false; // čeká na posily — nejdřív je zruš
  const from = G.tiles.get(hero.pos);
  const total = heroStats(faction, heroIdx).instantReturn
    ? 1 : Math.max(1, Math.round(
        travelTicks(from, CAPITAL_POS[faction.id]) * armyTimeMult(hero.army)));
  faction.marches.push({ kind: "return", fromKey: hero.pos,
    targetKey: keyOf(CAPITAL_POS[faction.id].q, CAPITAL_POS[faction.id].r),
    army: armyClone(hero.army), ticksLeft: total, total, heroIdx });
  hero.pos = null;
  hero.army = emptyArmy();
  hero.guard = false;
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
    addLog(faction.id, `↩ ${heroDef(faction, heroIdx).name} (${faction.name}) odvolává obléhání a drží pozici.`);
    return true;
  }
  const elapsed = Math.max(1, m.total - m.ticksLeft);
  faction.marches.push({ kind: "fallback", fromKey: m.targetKey, targetKey: m.fromKey,
    army: m.army, ticksLeft: elapsed, total: m.total, heroIdx: m.heroIdx });
  addLog(faction.id, `↩ ${heroDef(faction, heroIdx).name} (${faction.name}) se na pochodu obrací a vrací se zpět.`);
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
  addLog(faction.id, `🛡 ${heroDef(faction, heroIdx).name} (${faction.name}) drží stráž a brání i sousední pole.`);
  return true;
}

// (stráže nesou skutečné ztráty přímo z kol boje — viz applyDefFractions)

// nucený ústup hrdiny z pole (jeho pole padlo); armáda už nese skutečné
// ztráty z boje — zničená armáda znamená raněného hrdinu (delší zotavení)
function retreatHeroFrom(faction, tileKey, extraCooldown = 0) {
  for (let i = 0; i < faction.heroes.length; i++) {
    const hero = faction.heroes[i];
    if (hero.pos !== tileKey) continue;
    const st = heroStats(faction, i);
    const from = G.tiles.get(tileKey);
    const total = st.instantReturn ? 1
      : Math.max(1, Math.round(travelTicks(from, CAPITAL_POS[faction.id]) * st.fastReturn));
    const army = armyClone(hero.army);
    const wounded = armyTotal(army) < 1;
    faction.marches.push({ kind: "return", fromKey: tileKey,
      targetKey: keyOf(CAPITAL_POS[faction.id].q, CAPITAL_POS[faction.id].r),
      army, ticksLeft: total, total, heroIdx: i });
    hero.pos = null;
    hero.army = emptyArmy();
    hero.guard = false;
    hero.cooldown = (st.noCooldown ? 0 : (wounded ? WOUNDED_COOLDOWN : DEFEAT_COOLDOWN)) + extraCooldown;
    addLog(faction.id, `${heroDef(faction, i).name} (${faction.name}) ustupuje z dobytého pole${wounded ? " těžce raněn" : ""}.`);
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
  }
  if (comp.homeFaction) {
    const u = comp.homeFaction.units;
    for (const k of UNIT_KEYS) u[k] = Math.max(0, Math.round(u[k] * defFrac[k]));
  }
}

function resolveMarch(faction, march) {
  if (march.kind === "return") {
    armyAdd(faction.units, march.army); // armáda se vrací do zásoby
    return;
  }

  if (march.kind === "reinforce") {
    const heroIdx = faction.heroes.findIndex(h => h.pos === march.targetKey);
    if (heroIdx !== -1) {
      armyAdd(faction.heroes[heroIdx].army, march.army);
      addLog(faction.id, `Posily (${armyStr(march.army)}) dorazily k ${heroDef(faction, heroIdx).name}.`);
    } else {
      faction.marches.push({ kind: "return", fromKey: march.targetKey,
        targetKey: keyOf(CAPITAL_POS[faction.id].q, CAPITAL_POS[faction.id].r),
        army: march.army, ticksLeft: march.total, total: march.total, heroIdx: null });
      addLog(faction.id, `Posily nenašly hrdinu a vracejí se do hlavního města.`);
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
    if (tile.owner === faction.id) {
      addLog(faction.id, `${jmeno} (${faction.name}) končí obléhání — ${tileLabel(tile)} je naše.`);
      return;
    }
    const sila = armyTotal(hero.army);
    if (sila < SIEGE_MIN_ARMY) {
      addLog(faction.id, `${jmeno} (${faction.name}) má u ${tileLabel(tile)} příliš málo mužů (${Math.round(sila)}) — obléhání končí, čeká na posily.`);
      return;
    }
    const dalsi = (march.siegeTry || 1) + 1;
    if (startMarch(faction, tile, null, march.heroIdx)) {
      // přenést počítadlo náběhů do nově vzniklého pochodu
      const m = faction.marches[faction.marches.length - 1];
      if (m && m.heroIdx === march.heroIdx) m.siegeTry = march.siegeTry || 1;
      addLog(faction.id, `⚔ ${jmeno} (${faction.name}) útočí znovu na ${tileLabel(tile)} ` +
        `(${dalsi}. náběh, ${armyStr(hero.army)}).`);
    } else {
      addLog(faction.id, `${jmeno} (${faction.name}) drží pozici u ${tileLabel(tile)} — na další náběh zatím nemá.`);
    }
    return;
  }

  if (march.kind === "fallback") {
    // hrdina se stahuje na záchytné pole (zrušený útok / další ústup)
    const hero = faction.heroes[march.heroIdx];
    const dest = G.tiles.get(march.targetKey);
    const capKey = keyOf(CAPITAL_POS[faction.id].q, CAPITAL_POS[faction.id].r);
    if (march.targetKey === capKey) {
      armyAdd(faction.units, march.army);
    } else if (dest.owner === faction.id) {
      hero.pos = march.targetKey;
      hero.army = march.army;
    } else {
      const total = travelTicks(dest, CAPITAL_POS[faction.id]);
      faction.marches.push({ kind: "fallback", fromKey: march.targetKey, targetKey: capKey,
        army: march.army, ticksLeft: total, total, heroIdx: march.heroIdx });
      addLog(faction.id, `${heroDef(faction, march.heroIdx).name} (${faction.name}) nenachází bezpečné pole a ustupuje až do hlavního města.`);
    }
    return;
  }

  const hero = faction.heroes[march.heroIdx];
  const heroName = heroDef(faction, march.heroIdx).name;
  const tile = G.tiles.get(march.targetKey);
  const stats = heroStats(faction, march.heroIdx);
  if (tile.owner === faction.id) {
    // cíl mezitím dobyl někdo vlastní — hrdina se tam prostě utáboří
    hero.pos = march.targetKey;
    hero.army = march.army;
    return;
  }
  if (!isAdjacentToFaction(faction, tile)) {
    // spojení s územím bylo během pochodu přerušeno — pole nelze zabrat
    faction.marches.push({ kind: "fallback", fromKey: march.targetKey, targetKey: march.fromKey,
      army: march.army, ticksLeft: march.total, total: march.total, heroIdx: march.heroIdx });
    addLog(faction.id, `${heroName} (${faction.name}) nemůže zabrat ${tileLabel(tile)} — spojení s územím bylo přerušeno, vrací se.`);
    return;
  }

  const comp = tileDefComponents(tile);
  const preEv = []; // co se stalo ještě před 1. kolem (pro bojový report)
  // první úder útočníka: eliminace obránců ještě před bojem
  if (stats.strike > 0) {
    const before = armyTotal(comp.army);
    armyCull(comp.army, stats.strike);
    preEv.push(`⚔ První úder ${heroName}: −${Math.round(before - armyTotal(comp.army))} obránců před bojem`);
  }
  // obránci: první úder hrdinů na poli + aura hrdinů v okolí (bere se nejsilnější)
  let auraMult = 1;
  let defHeroIdx = -1; // nejsilnější hrdina obránce na poli = velitel obrany
  if (tile.owner !== -1) {
    const df = G.factions[tile.owner];
    let defStrike = 0;
    for (let di = 0; di < df.heroes.length; di++) {
      const dh = df.heroes[di];
      if (!dh.pos) continue;
      const ds = heroStats(df, di);
      if (dh.pos === march.targetKey) defStrike += ds.strike;
      if (ds.aura > 0 && gridDist(G.tiles.get(dh.pos), tile) <= 1)
        auraMult = Math.min(auraMult, 1 - ds.aura);
    }
    if (defStrike > 0) {
      const before = armyTotal(march.army);
      armyCull(march.army, defStrike);
      preEv.push(`🛡 První úder obránců: −${Math.round(before - armyTotal(march.army))} útočníků před bojem`);
    }
    if (auraMult < 1)
      preEv.push(`🛡 Aura hrdiny v okolí: síla útočníka −${Math.round((1 - auraMult) * 100)} %`);

    // duel hrdinů: velitelé se střetnou tváří v tvář ještě před bitvou;
    // poražená strana ztrácí jednotky (morálka) a vítěz sbírá zkušenosti
    let duelIdx = -1, duelPow = -1;
    for (let di = 0; di < df.heroes.length; di++) {
      if (df.heroes[di].pos !== march.targetKey) continue;
      const p = duelPower(df, di);
      if (p > duelPow) { duelPow = p; duelIdx = di; }
    }
    defHeroIdx = duelIdx;
    if (duelIdx !== -1) {
      const atkPow = duelPower(faction, march.heroIdx) + rand(0, 35);
      const defPow = duelPow + rand(0, 35);
      const dName = heroDef(df, duelIdx).name;
      if (atkPow >= defPow) {
        const cut = Math.round(6 + 1.8 * faction.heroes[march.heroIdx].level);
        const before = armyTotal(comp.army);
        armyCull(comp.army, cut);
        heroGainXp(faction, march.heroIdx, 15);
        preEv.push(`⚔ Duel hrdinů: ${heroName} sráží ${dName} — obránci v otřesu ztrácejí ${Math.round(before - armyTotal(comp.army))} jednotek`);
      } else {
        const cut = Math.round(6 + 1.8 * df.heroes[duelIdx].level);
        const before = armyTotal(march.army);
        armyCull(march.army, cut);
        heroGainXp(df, duelIdx, 15);
        preEv.push(`🛡 Duel hrdinů: ${dName} sráží ${heroName} — útočníci v otřesu ztrácejí ${Math.round(before - armyTotal(march.army))} jednotek`);
      }
    }
  }
  const defFaction = tile.owner === -1 ? null : G.factions[tile.owner];
  const defenderName = defFaction ? defFaction.name : "neutrální posádka";
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
    avoidCharges: stats.avoidCharges, avoidChance: stats.avoidChance,
    vsAll: enemyKey ? (stats.vsDmg[enemyKey] || 0) : 0 };
  let defHero = null, defH = null;
  if (defHeroIdx !== -1) {
    defH = defFaction.heroes[defHeroIdx];
    const ds = heroStats(defFaction, defHeroIdx);
    if (defH.hp == null) defH.hp = ds.hpMax;
    defH.hp = Math.min(defH.hp, ds.hpMax);
    defHero = { name: heroDef(defFaction, defHeroIdx).name, hp: defH.hp,
      atk: ds.atk, def: ds.def, dmg: ds.dmg, speed: ds.speed,
      spell: ds.spell, ward: ds.ward, stackAtk: ds.stackAtk, stackDef: ds.stackDef,
      followUp: ds.followUp, unitDmg: ds.unitDmg,
      madness: ds.madness, pursuit: ds.pursuit,
      stunChance: ds.stunChance,
      stunImmune: ds.stunImmune || !!ds.vsStunImmune[faction.key],
      actives: ds.actives, armyActives: ds.armyActives,
      avoidCharges: ds.avoidCharges, avoidChance: ds.avoidChance,
      vsAll: ds.vsDmg[faction.key] || 0 };
  } else if (tile.owner === -1) {
    // neutrální pole brání vlastní velitel: úroveň podle jmenovky síly pole,
    // bez výbavy, hvězd i dovedností (v0.13)
    const nc = neutralCommander(tile);
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
  const roundsTxt = `po ${sim.rounds} ${sim.rounds === 1 ? "kole" : "kolech"}`;

  // bojový report: kompletní záznam pro prohlížeč bitev
  const defHeroNames = comp.contributors
    .map(c => heroDef(c.faction, c.idx).name);
  const report = {
    id: G.nextReportId++, tick: G.tick,
    tileKey: march.targetKey, tileName: tileLabel(tile), structure: tile.structure,
    att: { name: faction.name, color: faction.color, hero: heroName,
      fkey: faction.key, heroDef: hero.defIdx, level: hero.level },
    def: { name: defenderName, color: defFaction ? defFaction.color : "#8a8f9a",
      heroes: defHeroNames, homeUnits: !!comp.homeFaction,
      fkey: defFaction ? defFaction.key : null,
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
    pre: preEv, roundLog: sim.roundLog,
    defKilled: sim.defKilled, post: [],
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
      if (healed > 0) report.post.push(`⚔ Polní lazaret: ${healed} padlých se vrací do armády`);
    }
    applyHospital(faction, losses);
    const prevOwner = tile.owner;
    const wasCapital = tile.structure === "capital";
    if (prevOwner !== -1) {
      // obránci si odnášejí skutečné ztráty z kol boje
      applyDefFractions(comp, sim.defFrac);
      // Lovci hrdinů: poražení hrdinové hordy se zotavují déle
      const extraCd = faction.key === "horda" && hadArch
        ? Math.round(30 * passiveScale(faction, "arch")) : 0;
      retreatHeroFrom(G.factions[prevOwner], march.targetKey, extraCd);
    }
    tile.owner = faction.id;
    tile.garrison = 0;
    if (tile.structure === "outpost") { // výspa padá s polem i s posádkou
      tile.structure = null;
      tile.outpost = null;
      report.post.push("⚔ Výspa obránce stržena");
    }
    if (march.returnAfter) {
      // nájezd „udeř a vrať se": pole je dobyté, ale hrdina se hned obrací
      // na výchozí pole (fallback umí ztracený cíl — u města jde armáda do zásoby)
      const backTotal = stats.instantReturn ? 1 : march.total;
      faction.marches.push({ kind: "fallback", fromKey: march.targetKey,
        targetKey: march.fromKey, army: survivors,
        ticksLeft: backTotal, total: backTotal, heroIdx: march.heroIdx });
      report.post.push(`⚔ Nájezd: ${heroName} se po vítězství obrací zpět`);
    } else {
      hero.pos = march.targetKey;
      hero.army = survivors;
    }
    // padlý velitel: vítězná armáda zůstává na poli a čeká, než se vyléčí
    if (sim.heroFellA && !stats.noCooldown) {
      hero.cooldown = Math.max(hero.cooldown, WOUNDED_COOLDOWN);
      report.post.push(`⚔ 💔 ${heroName} v bitvě padl — armáda drží pole a čeká, než se vyléčí`);
      addLog(faction.id, `💔 ${heroName} (${faction.name}) v bitvě padl vyčerpáním — armáda drží ${tileLabel(tile)} a čeká na jeho uzdravení.`);
    }
    report.attLosses = armyClone(losses);
    report.attRem = armyClone(survivors);
    addLog(faction.id, `${heroName} (${faction.name}) dobývá ${tileLabel(tile)} ${roundsTxt} (${defenderName}: −${sim.defKilled}, vlastní ztráty ${armyTotal(losses)})${march.returnAfter ? " a obrací se zpět" : ""}.`, report.id);
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
        report.post.push(`⚔ Potulná banda rozprášena: kořist ${gold} 🪙`);
        addLog(faction.id, `💀 ${heroName} (${faction.name}) rozprášil potulnou bandu (+${gold} 🪙).`);
        grantCores(faction.id, 5, "rozprášená banda");
      } else if (mev.type === "karavana") {
        const gold = 150 + randInt(0, 100);
        faction.resources.gold += gold;
        report.post.push(`⚔ Zajatá karavana: měšec ${gold} 🪙`);
        addLog(faction.id, `💰 ${heroName} (${faction.name}) zajal kupeckou karavanu (+${gold} 🪙).`);
        grantCores(faction.id, 8, "zajatá karavana");
      } else if (mev.type === "relikvie") {
        faction.resources.gold += 60;
        report.post.push(`⚔ Nalezena ztracená relikvie: 60 🪙 a popelná jádra`);
        addLog(faction.id, `🗿 ${heroName} (${faction.name}) nalezl ztracenou relikvii (+60 🪙).`);
        grantCores(faction.id, 15, "ztracená relikvie");
      }
    }
    if (tile.structure === "grandfort" && prevOwner === -1) {
      // pád velké pevnosti: pokladnice, legendární kořist a frakční bonus
      addLog(faction.id, `⚔🏰 Velká pevnost padla — ${faction.name} plení její pokladnici (+800 🪙) a její prapor posiluje celou frakci!`);
      grantCores(faction.id, 25, "dobytá velká pevnost");
      faction.resources.gold += 800;
      report.post.push("⚔ Velká pevnost dobyta: 800 🪙 a +10 % útoku frakce, dokud ji držíš");
      if (dropStructLoot(faction, march.heroIdx, tile, 3, 0.5))
        report.post.push("🎁 Z pokladnice padl epický kus výbavy");
    } else if (tile.structure === "fortress" && prevOwner === -1) {
      // pád pevnosti vnitřního okruhu: brána do středu Vellaru
      addLog(faction.id, `🏰 Pevnost padla — ${faction.name} otevírá bránu do středu Vellaru!`);
      grantCores(faction.id, 10, "dobytá pevnost");
      report.post.push("⚔ Pevnost dobyta — brána do středu Vellaru");
      if (dropStructLoot(faction, march.heroIdx, tile, 3, 0.5))
        report.post.push("🎁 Ze zbrojnice padl epický kus výbavy");
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
      addLog(faction.id, `⚑ ${faction.name} ovládá Trůnní město!`);
      grantCores(faction.id, 40, "ovládnutí Trůnního města");
      if (prevOwner === -1) {
        // první dobytí Trůnu v sezóně: SIGNATURE kus hrdiny, který jej dobyl
        const sigKey = faction.key + ":" + faction.heroes[march.heroIdx].defIdx;
        const sigItem = makeSignatureItem(sigKey);
        if (sigItem) {
          faction.items.push({ ...sigItem, id: nextItemId++ });
          emitEvent("loot", faction.id);
          report.post.push(`👑 Trůnní město dobyto: ${heroName} získává svůj signature kus — ${sigItem.name}!`);
          addLog(faction.id, `👑 ${heroName} (${faction.name}) vynáší z trůnních sklepení svůj ` +
            `signature kus: ${ITEM_SLOTS[sigItem.slot].icon} ${sigItem.name} („${SIGNATURE_ITEMS[sigKey].passive}“).`);
        } else {
          report.post.push("👑 Trůnní město dobyto: zaručená legendární kořist");
          dropStructLoot(faction, march.heroIdx, tile, 4, 1);
        }
      }
    }
  } else {
    // odražený útok: skutečné ztráty z kol + pronásledování při ústupu
    applyDefFractions(comp, sim.defFrac);
    if (tile.owner === -1) {
      // oslabená neutrální posádka se z boje nevzpamatuje celá
      tile.garrison = Math.max(15, Math.round(tile.garrison * sim.defFrac.inf));
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
    const oblehat = armyTotal(survivors) >= SIEGE_MIN_ARMY
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
      report.post.push(`🛡 Pronásledování při ústupu: útočník ztrácí dalších ${armyTotal(routLosses)}`);
    applyHospital(faction, totalLosses);
    const wiped = armyTotal(survivors) < 1;
    if (oblehat) {
      // hrdina se stahuje na své pole a táboří tam — je vidět na mapě, dají
      // se mu poslat posily a po pauze vyrazí znovu. Obléhací pochod je jen
      // odpočet; armádu drží hrdina.
      hero.pos = march.fromKey;
      hero.army = survivors;
      hero.guard = false;
      faction.marches.push({ kind: "siege", fromKey: march.fromKey,
        targetKey: march.targetKey, army: emptyArmy(),
        ticksLeft: SIEGE_RETRY, total: SIEGE_RETRY,
        heroIdx: march.heroIdx, returnAfter: march.returnAfter, siegeTry: pokus });
      report.post.push(`⚔ ${heroName} se stahuje na ${tileLabel(zaklad)} a chystá další ` +
        `náběh (za ${SIEGE_RETRY} s, ${pokus}/${SIEGE_MAX_TRIES}) — teď je čas na posily`);
    } else {
      const backTotal = stats.instantReturn ? 1
        : Math.max(1, Math.round(march.total * stats.fastReturn));
      faction.marches.push({ kind: "return", fromKey: march.targetKey,
        targetKey: keyOf(CAPITAL_POS[faction.id].q, CAPITAL_POS[faction.id].r),
        army: survivors, ticksLeft: backTotal, total: backTotal, heroIdx: march.heroIdx });
    }
    // obléhající hrdina nedostává trest za porážku — z pole neodešel a pauzu
    // mezi náběhy mu odměřuje samo obléhání
    let cd = (oblehat || stats.noCooldown) ? 0
      : (wiped || sim.heroFellA ? WOUNDED_COOLDOWN : DEFEAT_COOLDOWN);
    if (sim.heroFellA)
      report.post.push(`⚔ 💔 ${heroName} v bitvě padl a zotavuje se`);
    // Lovci hrdinů: horda v obraně prodlužuje zotavení odraženého hrdiny
    if (defFaction && defFaction.key === "horda" && defHadArch)
      cd += Math.round(30 * passiveScale(defFaction, "arch"));
    hero.cooldown = cd;
    emitEvent("battleLose", faction.id);
    if (defFaction) { defFaction.stats.wins++; emitEvent("battleWin", defFaction.id); }
    // padlý velitel obrany: pole ubránil, ale zotavuje se přímo na něm
    if (defH && sim.heroFellD) {
      defH.cooldown = Math.max(defH.cooldown, WOUNDED_COOLDOWN);
      report.post.push(`🛡 💔 ${defHero.name} při obraně padl — zotavuje se na poli`);
      addLog(defFaction.id, `💔 ${defHero.name} (${defFaction.name}) při obraně ${tileLabel(tile)} padl vyčerpáním a zotavuje se.`);
    }
    report.attLosses = armyClone(totalLosses);
    report.attRem = armyClone(survivors);
    if (wiped) report.post.push(`⚔ Armáda útočníka zničena — ${heroName} je těžce raněn`);
    addLog(faction.id, `${heroName} (${faction.name}) byl ${roundsTxt} odražen u ${tileLabel(tile)} (${defenderName}: −${sim.defKilled}, vlastní ztráty ${armyTotal(totalLosses)})${wiped ? " — armáda zničena, hrdina je těžce raněn" : ""}.`, report.id);
    heroGainXp(faction, march.heroIdx, Math.max(5, Math.round(sim.defKilled / 2)));
    // obránci na poli sbírají zkušenosti za ubráněný útok
    if (defFaction) {
      defFaction.heroes.forEach((h, di) => {
        if (h.pos === march.targetKey) heroGainXp(defFaction, di, Math.round(armyTotal(totalLosses) / 2));
      });
    }
  }
}

function eliminateFaction(id, byFaction) {
  const f = G.factions[id];
  f.alive = false;
  f.marches = [];
  for (const t of G.tiles.values()) {
    if (t.owner === id) {
      t.owner = -1;
      if (t.structure === "outpost") { t.structure = null; t.outpost = null; }
      t.garrison = t.structure
        ? Math.round(STRUCTURES[t.structure].militia * 0.6)
        : Math.round(LEVEL_GARRISON[t.level] * 0.6);
      if (t.structure === "capital") t.garrison = 350;
    }
  }
  addLog(id, `☠ ${f.name} padlo — hlavní město dobyla frakce ${byFaction.name}!`);
  // pád posledního soupeře (nebo hráče) končí sezónu okamžitě
  const alive = G.factions.filter(x => x.alive);
  if (alive.length <= 1) {
    G.gameOver = true;
    if (alive.length === 1) addLog(-1, `⚑ ${alive[0].name} ovládá celý Vellar — sezóna končí!`);
  } else if (!G.factions[G.playerFaction].alive) {
    G.gameOver = true;
    addLog(-1, "Tvá frakce padla — sezóna tím pro tebe končí.");
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
  const ai = G.factions[targetId];
  if (!ai || !ai.alive || targetId === faction.id) return { ok: false, why: "Neplatný cíl." };
  if (hasPact(faction, ai)) return { ok: false, why: "Pakt už platí." };
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
    addLog(faction.id, `🤝 ${ai.name} přijímá pakt o neútočení s frakcí ${faction.name} (${PACT_DURATION} s).`);
    return { ok: true, accepted: true };
  }
  ai.pactCooldown[faction.id] = PACT_REFUSE_COOLDOWN;
  addLog(faction.id, `🤝 ${ai.name} odmítá pakt s frakcí ${faction.name} — tribut si ale nechává.`);
  return { ok: true, accepted: false };
}

// vypovězení paktu: okamžité, ale roznese se — frakce dlouho nedůvěřuje
function cancelPact(faction, targetId) {
  const ai = G.factions[targetId];
  if (!ai || !hasPact(faction, ai)) return false;
  delete faction.pacts[targetId];
  delete ai.pacts[faction.id];
  ai.grudge[faction.id] = 1;
  ai.pactCooldown[faction.id] = PACT_BETRAYAL_COOLDOWN;
  addLog(faction.id, `⚔ ${faction.name} vypovídá pakt s frakcí ${ai.name} — zrada se roznese po Vellaru.`);
  return true;
}

// hráč reaguje na nabídku paktu od AI (AI platí tribut hráči)
function acceptAiOffer(aiId) {
  const ai = G.factions[aiId];
  const me = G.factions[G.playerFaction];
  if (!ai || ai.offerToPlayer <= 0) return false;
  ai.offerToPlayer = 0;
  ai.pacts[me.id] = PACT_DURATION;
  me.pacts[aiId] = PACT_DURATION;
  ai.resources.gold = Math.max(0, ai.resources.gold - 50);
  me.resources.gold += 50;
  emitEvent("pact", me.id);
  addLog(me.id, `🤝 ${me.name} přijímá pakt s frakcí ${ai.name} (+50 🪙 tribut).`);
  return true;
}

function declineAiOffer(aiId) {
  const ai = G.factions[aiId];
  if (!ai || ai.offerToPlayer <= 0) return false;
  ai.offerToPlayer = 0;
  ai.pactCooldown[G.playerFaction] = PACT_REFUSE_COOLDOWN;
  addLog(G.playerFaction, `${ai.name} bere odmítnutí paktu na vědomí.`);
  return true;
}

// ---------- Putovní události a rytmus sezóny ----------
function spawnMapEvent() {
  const candidates = [...G.tiles.values()].filter(t =>
    t.owner === -1 && TERRAIN[t.terrain].passable && !t.structure
    && !mapEventAt(keyOf(t.q, t.r)));
  if (!candidates.length) return;
  const t = candidates[randInt(0, candidates.length - 1)];
  const types = Object.keys(MAP_EVENTS);
  const type = types[randInt(0, types.length - 1)];
  const def = MAP_EVENTS[type];
  G.mapEvents.push({ key: keyOf(t.q, t.r), type, ticksLeft: def.dur, total: def.dur });
  emitEvent("mapEvent", -1);
  addLog(-1, `${def.icon} ${def.name} se objevuje: ${tileLabel(t)} — ${def.desc}.`);
}

function tickWorld() {
  // putovní události: nové se objevují, staré vyprchávají
  if (G.tick >= G.nextEventTick) {
    if (G.mapEvents.length < EVENT_MAX) spawnMapEvent();
    G.nextEventTick = G.tick + randInt(EVENT_INTERVAL[0], EVENT_INTERVAL[1]);
  }
  for (const e of G.mapEvents) e.ticksLeft--;
  for (const e of G.mapEvents.filter(e => e.ticksLeft <= 0)) {
    const def = MAP_EVENTS[e.type];
    addLog(-1, `${def.icon} ${def.name} mizí z mapy (${tileLabel(G.tiles.get(e.key))}).`);
  }
  G.mapEvents = G.mapEvents.filter(e => e.ticksLeft > 0);

  // popelná bouře
  if (G.storm > 0) {
    if (--G.storm === 0) addLog(-1, "🌤 Popelná bouře se přehnala, Vellar zase dýchá.");
  } else if (G.tick >= G.nextStormTick) {
    G.storm = STORM_DUR;
    G.nextStormTick = G.tick + randInt(STORM_INTERVAL[0], STORM_INTERVAL[1]);
    emitEvent("storm", -1);
    addLog(-1, `🌋 Popelná bouře! Výnosy klesají na polovinu a obránci se zakopávají (${STORM_DUR} s).`);
  }

  // otevření Trůnního města v půlce sezóny
  if (!G.throneOpen && G.tick >= THRONE_UNLOCK) {
    G.throneOpen = true;
    emitEvent("throne", -1);
    addLog(-1, "👑 Příměří u Trůnního města končí — brány se otevírají dobyvatelům!");
  }

  // obnova neutrálních posádek (pomalu dorůstají k plné síle)
  for (const t of G.tiles.values()) {
    if (t.owner !== -1 || !TERRAIN[t.terrain].passable) continue;
    const base = t.structure ? STRUCTURES[t.structure].militia : LEVEL_GARRISON[t.level];
    if (t.garrison < base)
      t.garrison = Math.min(base, t.garrison + base / GARRISON_REGEN_TICKS);
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
          addLog(-1, `🤝 Pakt mezi ${f.name} a ${G.factions[o].name} vypršel.`);
        }
      }
    }
    for (const oid in f.pactCooldown) {
      if (--f.pactCooldown[oid] <= 0) delete f.pactCooldown[oid];
    }
    if (f.offerToPlayer > 0) f.offerToPlayer--;
  }

  // cíle sezóny hráče
  const me = G.factions[G.playerFaction];
  if (me && me.alive) {
    for (const g of G.goals) {
      if (g.done || !g.def.check(me)) continue;
      g.done = true;
      for (const res in g.def.reward) me.resources[res] += g.def.reward[res];
      emitEvent("goal", me.id);
      const rewardTxt = Object.entries(g.def.reward)
        .map(([r, v]) => `+${v} ${{ food: "🌾", wood: "🪵", stone: "🪨", iron: "⚙" }[r] || "🪙"}`).join(" ");
      addLog(me.id, `🏅 Cíl sezóny splněn: ${g.def.desc} (${rewardTxt}).`);
      grantCores(me.id, 20, "splněný cíl sezóny");
    }
  }
}

// ---------- Mlha války ----------
// hráč vidí své území s okolím, hrdiny (dohled 2) a trasy vlastních pochodů;
// vše ostatní je zahaleno — jednou spatřená pole zůstávají prozkoumaná
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
  for (const t of G.tiles.values()) if (t.owner === me.id) addR(t.q, t.r, 1);
  for (const h of me.heroes) {
    if (!h.pos) continue;
    const t = G.tiles.get(h.pos);
    addR(t.q, t.r, 2);
  }
  for (const m of me.marches) {
    const a = G.tiles.get(m.fromKey), b = G.tiles.get(m.targetKey);
    if (a) addR(a.q, a.r, 1);
    if (b) addR(b.q, b.r, 1);
  }
  G.visible = vis;
  for (const k of vis) G.explored.add(k);
}

const isVisible = key => G.visible.has(key);
const isExplored = key => G.explored.has(key);

// ---------- AI ----------
// proporcionální výběr `count` jednotek ze zásoby
function aiSlice(f, count) {
  const total = armyTotal(f.units);
  if (total <= 0) return null;
  count = Math.min(count, total);
  const out = emptyArmy();
  let taken = 0;
  for (const k of UNIT_KEYS) {
    out[k] = Math.min(f.units[k], Math.floor(count * (f.units[k] / total)));
    taken += out[k];
  }
  for (const k of UNIT_KEYS) { // dorovnej zbytek
    while (taken < count && out[k] < f.units[k]) { out[k]++; taken++; }
  }
  return out;
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

const AI_BUILD_ORDER = [
  ["main", 2], ["barracks", 2], ["up_inf", 1], ["hospital", 1], ["main", 3],
  ["barracks", 3], ["up_arch", 1], ["up_cav", 1], ["main", 4], ["hospital", 2],
  ["up_inf", 2], ["main", 5], ["up_arch", 2], ["hospital", 3], ["up_cav", 2],
];

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
  const foodNet = incomeOf(f).food - armyUpkeep(f);
  if (armyTotal(f.units) < 800 && f.recruitQueue.length < 2
      && (foodNet > 1 || militaryPower(f) < 100)) {
    const avail = UNIT_KEYS.filter(k => unitUnlocked(f, k));
    avail.sort((a, b) => f.units[a] - f.units[b]);
    for (const type of avail) {
      if (startRecruit(f, type)) break;
    }
  }
  // najmi dalšího hrdinu, když na to je (a zbyde rezerva)
  const heroCost = nextHeroCost(f);
  if (heroCost !== null && f.resources.gold > heroCost + 150) hireHero(f);
  if (f.aiCooldown-- > 0) return;
  f.aiCooldown = randInt(3, 6);
  aiAutoEquip(f);
  aiSpendSkills(f);

  // diplomacie: slabší AI občas nabídne hráči pakt (tribut platí ona)
  const player = G.factions[G.playerFaction];
  if (player.alive && !hasPact(f, player) && f.offerToPlayer <= 0
      && !(f.pactCooldown[player.id] > 0) && !f.grudge[player.id]
      && rng() < 0.12) {
    const ratio = militaryPower(player) / Math.max(1, militaryPower(f));
    if (ratio > 1.3 * f.ai.aggression) {
      f.offerToPlayer = 60;
      emitEvent("offer", player.id);
      addLog(player.id, `🤝 ${f.name} (${f.ai.mood}) nabízí pakt o neútočení — odpověz do 60 s.`);
    }
  }

  // hrdinům v poli posílej posily; úplně slabé (když nejsou vojáci) stáhni domů
  for (let i = 0; i < f.heroes.length; i++) {
    const h = f.heroes[i];
    if (!h.pos || heroBusy(f, i) || h.cooldown > 0) continue;
    // hrdina hlídkující na struktuře (most, město…) s plnou výdrží drží stráž
    if (!h.guard && h.stamina > 70 && G.tiles.get(h.pos).structure && armyTotal(h.army) > 60)
      toggleGuard(f, i);
    if (armyTotal(h.army) < 150 && armyTotal(f.units) > 200) {
      const alreadyComing = f.marches.some(m => m.kind === "reinforce" && m.targetKey === h.pos);
      if (!alreadyComing) {
        const room = heroArmyCap(f, i) - heroArmyCommitted(f, i); // limit velení
        const send = aiSlice(f, Math.min(250 - armyTotal(h.army), armyTotal(f.units) - 100, room));
        if (send && armyTotal(send) > 0) startReinforce(f, G.tiles.get(h.pos), send);
      }
    } else if (armyTotal(h.army) < 25 && armyTotal(f.units) <= 200) {
      startRecall(f, i);
    }
  }

  // kandidáti: průchozí pole sousedící s územím
  const targets = [];
  for (const t of G.tiles.values()) {
    if (t.owner === f.id || !TERRAIN[t.terrain].passable) continue;
    if (!isAdjacentToFaction(f, t)) continue;
    if (t.structure === "throne" && !G.throneOpen) continue; // příměří u trůnu
    if (t.owner !== -1 && hasPact(f, G.factions[t.owner])) continue; // pakt platí
    const def = tileDefense(t);
    // boj v kolech vyžaduje výraznější převahu než prosté porovnání síly
    const needed = Math.ceil(1.25 * (def / (SOLDIER_POWER * f.attackMult) + def / 60)) + 2;
    let value = t.level;
    if (t.structure === "city") value += 8;
    if (t.structure === "bridge") value += 6; // brána do dalšího kvadrantu
    if (t.structure === "fortress") value += G.tick > SEASON_TICKS * 0.3 ? 12 : 4; // brána ke středu
    if (t.structure === "bastion") value += G.tick > SEASON_TICKS * 0.3 ? 10 : 3;  // rameno velké pevnosti
    if (t.structure === "grandfort") value += G.tick > SEASON_TICKS * 0.3 ? 20 : 5; // frakční bonus
    if (t.structure === "throne") value += G.tick > SEASON_TICKS * 0.4 ? 150 : 5;
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
  targets.sort((a, b) => b.score - a.score);
  for (const cand of targets.slice(0, 3)) {
    let chosen = -1;
    for (let i = 0; i < f.heroes.length; i++) {
      if (!heroReady(f, i, cand.t)) continue;
      const h = f.heroes[i];
      if (!h.pos && heroArmyCap(f, i) < cand.needed) continue; // neuvede dost jednotek
      const enough = h.pos ? armyTotal(h.army) >= cand.needed : armyTotal(f.units) >= cand.needed;
      if (enough) { chosen = i; break; }
    }
    if (chosen === -1) continue;
    const army = f.heroes[chosen].pos
      ? null // z pole jde celá armáda hrdiny
      : aiSlice(f, Math.min(Math.ceil(cand.needed * 1.15), heroArmyCap(f, chosen)));
    startMarch(f, cand.t, army, chosen);
    break;
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
function tileLabel(tile) {
  if (tile.structure) return STRUCTURES[tile.structure].name;
  return `${TERRAIN[tile.terrain].name} (síla ${tierOf(tile)})`;
}
function addLog(factionId, text, reportId) {
  G.log.push({ tick: G.tick, factionId, text, reportId });
  if (G.log.length > 60) G.log.shift();
}

// ---------- Hlavní tik ----------
function doTick() {
  if (G.gameOver) return;
  G.tick++;
  G.clashes = G.clashes.filter(c => G.tick - c.tick < 5); // dohrané animace střetů
  tickWorld();
  for (const f of G.factions) {
    if (!f.alive) continue;
    // příjem
    const inc = incomeOf(f);
    for (const res in inc) f.resources[res] += inc[res];
    // údržba: armáda žere jídlo; bez jídla po čase dezertuje
    f.resources.food -= armyUpkeep(f);
    if (f.resources.food < 0) {
      f.resources.food = 0;
      if (++f.starving % STARVE_INTERVAL === 0) {
        let lost = 0;
        const cut = a => {
          for (const k of UNIT_KEYS) {
            const d = Math.ceil(a[k] * STARVE_LOSS);
            if (a[k] > 0 && d > 0) { a[k] = Math.max(0, a[k] - d); lost += d; }
          }
        };
        cut(f.units);
        for (const h of f.heroes) cut(h.army);
        if (lost > 0) {
          emitEvent("starve", f.id);
          addLog(f.id, `🍞 Armáda frakce ${f.name} hladoví — ${lost} jednotek dezertuje!`);
        }
      }
    } else {
      f.starving = 0;
    }
    // odpočet posilovacích doplňků (Stavitelský rozkaz / Roh hojnosti)
    if (f.boosts) {
      if (f.boosts.build > 0) f.boosts.build--;
      if (f.boosts.prod > 0) f.boosts.prod--;
    }
    // stavba (Stavitelský rozkaz: dvojnásobná rychlost — tik navíc)
    if (f.build && f.boosts && f.boosts.build > 0 && f.build.ticksLeft > 1)
      f.build.ticksLeft--;
    if (f.build && --f.build.ticksLeft <= 0) {
      if (f.build.key.startsWith("up_")) {
        const type = f.build.key.slice(3);
        f.upgrades[type]++;
        addLog(f.id, `${f.name}: ${UNIT_UPGRADES[f.key][type]} — ${UNIT_TYPES[type].name.toLowerCase()} vylepšena na úroveň ${f.upgrades[type]}.`);
      } else {
        f.buildings[f.build.key]++;
        addLog(f.id, `${f.name}: ${BUILDINGS[f.build.key].name} vylepšena na úroveň ${f.buildings[f.build.key]}.`);
      }
      f.build = null;
      emitEvent("build", f.id);
    }
    // výcvik (fronty běží souběžně, platí se předem)
    for (const rq of f.recruitQueue) rq.ticksLeft--;
    const done = f.recruitQueue.filter(rq => rq.ticksLeft <= 0);
    f.recruitQueue = f.recruitQueue.filter(rq => rq.ticksLeft > 0);
    for (const rq of done) f.units[rq.type] += rq.count || RECRUIT_BATCH;
    // obnova výdrže hrdinů (stráž ji naopak čerpá) + léčení + odpočet zotavení
    for (let i = 0; i < f.heroes.length; i++) {
      const h = f.heroes[i];
      const st = heroStats(f, i);
      if (h.guard) {
        h.stamina -= GUARD_DRAIN * st.guardDrainMult;
        if (h.stamina <= 0) {
          h.stamina = 0;
          h.guard = false;
          addLog(f.id, `${heroDef(f, i).name} (${f.name}) je vyčerpán a končí stráž.`);
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
    // pochody
    for (const m of f.marches) m.ticksLeft--;
    const arrived = f.marches.filter(m => m.ticksLeft <= 0);
    f.marches = f.marches.filter(m => m.ticksLeft > 0);
    for (const m of arrived) resolveMarch(f, m);
    // AI
    if (f.isAI) aiTurn(f);
  }
  computeVisibility();
  if (G.tick >= SEASON_TICKS) {
    G.gameOver = true;
    addLog(-1, "Sezóna skončila.");
    // odměny za dohranou sezónu: účast + bonus vítězi (jen lidské frakce s účtem)
    const best = G.factions.filter(f => f.alive)
      .sort((a, b) => scoreOf(b) - scoreOf(a))[0];
    for (const f of G.factions) {
      grantCores(f.id, 15, "dohraná sezóna");
      if (best && f.id === best.id) grantCores(f.id, 50, "vítězství v sezóně");
    }
  }
}

// ---------- Start nové hry ----------
function newGame(playerIndex, seed, playerHeroes) {
  rng = mulberry32(seed ?? (Date.now() % 100000));
  G.tick = 0; G.gameOver = false; G.log = [];
  G.reports = []; G.nextReportId = 1;
  G.clashes = []; // nedávné bitvy pro animaci střetu na mapě {key, tick, att, def}
  G.mapEvents = [];
  G.nextEventTick = randInt(40, 80);
  G.storm = 0;
  G.nextStormTick = randInt(STORM_INTERVAL[0], STORM_INTERVAL[1]);
  G.throneOpen = false;
  G.goals = SEASON_GOALS.map(def => ({ def, done: false }));
  G.visible = new Set();
  G.explored = new Set();
  genMap();
  initFactions(playerIndex, playerHeroes);
  computeVisibility();
  G.running = true;
  addLog(-1, "Příměří padlo. Boj o Vellar začíná!");
}

// multiplayer: víc lidských frakcí naráz; humans = [{faction, heroes: [a, b]}]
// (zbylé frakce dohraje AI). G.playerFaction na serveru ukazuje na prvního
// člověka — používá se jen pro cíle sezóny a nabídky paktů od AI.
function newGameMulti(humans, seed) {
  newGame(humans[0].faction, seed, humans[0].heroes);
  for (const hu of humans) {
    const f = G.factions[hu.faction];
    f.isAI = false;
    if (hu.faction !== humans[0].faction) {
      f.heroes = hu.heroes.slice(0, 1).map(makeHero);
      f.hirePool = HERO_DEFS[f.key].map((_, d) => d).filter(d => d !== hu.heroes[0]);
    }
  }
}

// ---------- Export pro Node.js server (multiplayer) ----------
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    G, newGame, newGameMulti, doTick, keyOf, makeHero, armyTotal, tileLabel,
    startMarch, startReinforce, startRecall, turnBackMarch, cancelReinforce,
    toggleGuard, startBuild, startRecruit, hireHero, equipItem, unequipItem,
    // verbovací zakázka, tržnice a body velení (v0.18)
    startRecruitOrder, recruitOrderCost, recruitAffordable, armyCp,
    // zvláštní vlastnosti výbavy a zušlechtění (v0.20)
    ITEM_PASSIVES, ITEM_PASSIVE_CHANCE, REFINE_MAX, REFINE_COST, itemPassiveStr,
    refineItem, itemPassiveEffs, rollItemPassive,
    marketExchange, marketGain, marketLevel, MARKET_RES, MARKET_RATE, MARKET_MIN,
    RECRUIT_MAX_ORDER, RECRUIT_BATCH, UNIT_TYPES, UNIT_KEYS, unitUnlocked,
    SIEGE_RETRY, SIEGE_MIN_ARMY, SIEGE_MAX_TRIES, ROUND_CAP, ROUT_AT,
    learnSkill, respecHero, offerPact, cancelPact, acceptAiOffer, declineAiOffer,
    buildOutpost, outpostDeposit, outpostWithdraw, HERO_MAX_STARS,
    HERO_DEFS, FACTION_DEFS, SEASON_TICKS, TICK_MS, SEASON_GOALS,
    // účty a truhly (v0.6)
    CHESTS, CHEST_ITEMS, PITY_AT, GIFT_SHARE, GIFT_RARITY_TIER, RARITIES, CORE_CODES,
    emptyAccount, accountOpenChest, accountRedeemCode,
    applyAccountToFaction, applyAccountToHero, syncAccountFromFaction,
    grantItemToFaction, strengthenItem, SIGNATURE_ITEMS, makeSignatureItem,
    heroStats, simulateBattle, heroGainXp, xpForLevel,
    // stromy dovedností (Audit 2, fáze A)
    HERO_MAX_LEVEL, MAIN_MAX_RANK, SUB_MAX_RANK, SKILL_UNLOCK_MAIN, SUB_REQ,
    skillUnlocked, totalSkillPtsForLevel, heroSpentPoints, TREE_VERSION,
    // kolové aktivky a mistrovské bonusy rysu (Audit 2, fáze B)
    TRAIT_MAX_EFFS, HERO_TRAITS, heroActives, heroEff,
    // neutrální velitelé (v0.13)
    neutralCommander, neutralHeroLevel, neutralHeroCap, tileStrengthLabel,
    NEUTRAL_COMMANDERS, TIERS, TIER_GARRISON, STRUCTURES, tileDefComponents,
    // strany, tiery, dárky a doplňky (v0.9)
    FACTION_SIDE, SIDES, sideOfFaction, HERO_TIERS, heroTierOf,
    giftCostForStar, respectForStar, applyGiftToAccount, migrateAccount,
    heroUnlocked, accountUseBoost, BOOST_KINDS, BOOST_MINUTES,
  };
}
