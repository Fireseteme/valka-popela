// NÁSTROJ (ne test): kolik textu ještě čeká na převod do slovníku.
//
//     node tests/pokryti-jazyku.js
//
// Hra vznikla natvrdo česky a etapa 12b postavila kostru — tenhle skript
// říká, kolik práce zbývá a KDE, ať se to dá dělat po soustech a měřit.
//
// ⚠ Měří se ŘÁDKY s českým textem mimo komentáře, ne řetězce — je to hrubý
// odhad rozsahu, ne přesný počet. Převedený řádek už češtinu nemá (má klíč),
// takže „zbývá" přirozeně klesá s prací.
const fs = require("fs");
const path = require("path");
const KOREN = path.join(__dirname, "..");
const j = require(KOREN + "/js/jazyky.js");

const SOUBORY = ["js/main.js", "js/domov.js", "js/net.js", "js/game.js", "index.html"];
const CESKE = /[ěščřžýáíéúůňťďóĚŠČŘŽÝÁÍÉÚŮŇŤĎÓ]/;
const RE_TX = /\btx\(/g;                 // hotová volání překladu
// index.html je STATICKÝ — tx() se v něm zavolat nedá, překlad se značí
// atributem data-tx / data-tx-title / data-tx-ph (dosadí je prelozStatickeHtml
// v main.js). Bez tohohle měřič hlásil nulu i ve chvíli, kdy byla celá horní
// lišta, tooltipy ikon a výběr rodu česky (odhaleno u v0.70).
const RE_DATA_TX = /data-tx(?:-title|-ph)?=/;
const jeKomentar = r => {
  const t = r.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
};
// Usekne komentář na KONCI řádku, ale jen mimo řetězec — jednoduchý průchod
// se sledováním uvozovek stačí, protože jde o odhad rozsahu, ne o parser.
function bezKomentare(r) {
  let q = null;
  for (let i = 0; i < r.length - 1; i++) {
    const c = r[i];
    if (q) { if (c === "\\") i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'" || c === "`") { q = c; continue; }
    if (c === "/" && r[i + 1] === "/") return r.slice(0, i);
  }
  return r;
}

// Řádky, které v češtině ZŮSTÁVAJÍ SPRÁVNĚ — nejsou to nedodělky:
//
//  1. VLASTNÍ JMÉNA VELLARU (hrdinové, rody, kraje, předměty, dárky,
//     neutrální velitelé) se nepřekládají vůbec, a v generátoru ikonek se
//     nad jejich českými jmény navíc hledají klíčová slova.
//  2. OBSAHOVÉ TABULKY (budovy, dovednosti, kapitoly, mapové události,
//     větve Prstenu…) jsou napsané česky ZÁMĚRNĚ: čeština je předloha,
//     kterou `prepisTabulky` v game.js při přepnutí jazyka nahradí ze
//     slovníku. Nová budova jde přidat bez zásahu do tří jazyků.
//
// Bez tohohle rozlišení vypadal game.js napořád jako „1 600 řádků práce",
// i když v něm žádná nezbyla.
const JMENNE_TABULKY = [
  // vlastní jména
  ["const HERO_DEFS", "// ---------- Prsten popela"],
  ["const ITEM_NAMES", "const ITEM_PASSIVES"],
  ["const SIGNATURE_ITEMS", "// ---------- Truhly"],
  ["const GIFT_NAMES", "function giftGroupKey"],
  ["const NEUTRAL_COMMANDERS", "function neutralCommander"],
  ["const FACTION_DEFS", "const FACTION_UNITS"],
  ["const REGION_CENTER", "function regionOf"],
  ["function itemArtURL", "function skladZdroj"],
  // české předlohy obsahových tabulek (přepisuje je prepisTabulky)
  ["const MAP_EVENTS", "// --- rytmus sezóny ---"],
  ["const RING_UNLOCKS", "function ringGather"],
  ["const RING_VETVE", "function ringLearn"],
  ["const SEASON_GOALS", "function goalsProgress"],
  ["const KAPITOLY", "const CHECKPOINTY"],
  ["const CHECKPOINTY", "function tickWorld"],
  ["const TERRAIN", "const STRUCTURES"],
  ["const STRUCTURES", "const TIERS"],
  ["const BUILDINGS", "const UPGRADE_MAX"],
  ["const MASTER_BONUS", "function heroMasterEff"],
  ["const ITEM_PASSIVES", "const ITEM_PASSIVE_CHANCE"],
  ["const BOOST_KINDS", "const BOOST_MINUTES"],
  ["const HERO_TRAITS", "const TRAIT_MAX_EFFS"],
  ["const UNIT_TYPES", "const UNIT_KEYS"],
  ["const UNIT_UPGRADES", "// ---------- VLAJKOVÉ JEDNOTKY"],
  ["const CHESTS", "// dárek hrdiny bere půlku"],
  ["const RARITIES", "const ITEM_NAMES"],
  ["const HERO_TIERS", "const HERO_TIER_BY_ROD"],
  ["const SIDES", "const FACTION_SIDE"],
  ["const GIFT_TIER_NAME", "function giftTierTrait"],
];
// množina indexů řádků, které se mají počítat jako JMÉNA
function jmenneUseky(txt) {
  const ven = new Set();
  for (const [od, do_] of JMENNE_TABULKY) {
    const a = txt.findIndex(x => x.startsWith(od));
    if (a < 0) continue;
    let b = txt.findIndex((x, i) => i > a && x.startsWith(do_));
    if (b < 0) b = txt.length;
    for (let i = a; i < b; i++) ven.add(i);
  }
  return ven;
}

let zbyva = 0, hotovo = 0, jmen = 0;
const radky = [];
for (const rel of SOUBORY) {
  const txt = fs.readFileSync(path.join(KOREN, rel), "utf8").split("\n");
  const jmena = jmenneUseky(txt);
  let z = 0, h = 0, jm = 0;
  // HTML má vlastní komentáře (<!-- … -->) a ty se táhnou přes víc řádků;
  // bez tohohle by se dokumentace v index.html počítala jako nepřeložený text.
  let vHtmlKom = false;
  txt.forEach((x, i) => {
    if (jeKomentar(x)) return;
    if (vHtmlKom) { if (x.includes("-->")) vHtmlKom = false; return; }
    if (x.includes("<!--") && !x.includes("-->")) { vHtmlKom = true; return; }
    if (x.trim().startsWith("<!--")) return;
    h += (x.match(RE_TX) || []).length + (RE_DATA_TX.test(x) ? 1 : 0);
    // ⚠ ZAVLEČENÝ komentář na konci řádku se musí useknout, jinak se
    // `const REACH = 20;   // Manhattan dosah` počítá jako práce, i když
    // v něm žádný text pro hráče není. Uvozovky se hlídají, ať se neusekne
    // „//" uvnitř řetězce (typicky URL).
    const kod = bezKomentare(x);
    if (!CESKE.test(kod)) return;
    if (RE_DATA_TX.test(kod)) { jm++; return; }   // česká PŘEDLOHA v HTML, překlad je hotový
    // jméno hry je značka a v HTML zůstává; #start-intro přepisuje main.js
    if (/Válka popela|id="start-intro"|než sezóna skončí/.test(kod)) { jm++; return; }
    if (jmena.has(i)) { jm++; return; }           // jména Vellaru — nepřekládají se
    z++;                                          // řádky, které ještě čekají
  });
  zbyva += z; hotovo += h; jmen += jm;
  radky.push({ rel, z, h, jm });
}

console.log("Převod textů do slovníku (etapa 12b):\n");
console.log("soubor".padEnd(16) + "volání tx()\tzbývá\tčesky správně");
for (const s of radky) console.log(s.rel.padEnd(16) + s.h + "\t\t" + s.z + "\t" + s.jm);
console.log("-".repeat(52));
console.log("CELKEM".padEnd(16) + hotovo + "\t\t" + zbyva + "\t" + jmen);
console.log(`\nSlovník: ${Object.keys(j.SLOVNIK.cs).length} klíčů × ${
  Object.keys(j.SLOVNIK).length} jazyky.`);
console.log(`
⚠ Sloupec „česky správně" NENÍ práce: jsou to vlastní jména Vellaru (ta se
   nepřekládají vůbec) a české PŘEDLOHY obsahových tabulek, které si při
   přepnutí jazyka nahradí prepisTabulky() v game.js ze slovníku.
   Sloupec „zbývá" je to, co ještě čeká — hlášky do konzole a ladicí texty
   se tam počítají taky, i když je hráč nevidí.`);
