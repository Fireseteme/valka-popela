// Rozvrh sezón (etapa 5b) — sezóna má PEVNÝ TERMÍN a do té doby se hráči
// přihlašují.
//
// Dosud sezóna začínala tím, že někdo v lobby zmáčkl „Spustit". To funguje
// pro partu kamarádů u jednoho stolu, ale ne pro stovky lidí, kteří se nikdy
// nedomluví. Nově má sezóna čas startu, hráči se do ní hlásí za konkrétní
// frakci a v ten čas se spustí sama se všemi přihlášenými.
//
// Ruční start ZŮSTÁVÁ jako obcházka pro testování a pro partu — rozvrh ho
// nenahrazuje, jen doplňuje.
const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.VP_DATA || path.join(__dirname, "data");
const SOUBOR = path.join(DATA_DIR, "rozvrh.json");
const STARY_STAV = path.join(DATA_DIR, "stav.json");   // do v0.46 tu bylo jen číslo sezóny

// Kolik hodin po konci sezóny začíná další. Dost dlouho, aby si lidé
// prohlédli výsledky a rozmysleli frakci, ne tak dlouho, aby odešli jinam.
const PRODLEVA_DALSI_H = 48;
// První sezóna po zapnutí čerstvého serveru — ať je čas se přihlásit.
const PRVNI_ZA_H = 24;

let stav = null;

function vychozi(cislo, delkaHodin, mistNaFrakci, ted) {
  return {
    cislo: cislo || 1,
    faze: "zapisy",                 // "zapisy" → "bezi" → "konec"
    startAt: ted + PRVNI_ZA_H * 3600 * 1000,
    delkaHodin: delkaHodin || 336,
    mistNaFrakci: mistNaFrakci || 31,
    prihlasky: {},                  // accKey → { faction, jmeno, kdy }
  };
}

// `ted` se předává, ne bere z Date.now(), aby šel rozvrh testovat bez čekání
function nacti({ delkaHodin, mistNaFrakci, ted = Date.now() } = {}) {
  try {
    stav = JSON.parse(fs.readFileSync(SOUBOR, "utf8"));
    if (!stav || typeof stav !== "object" || !stav.cislo) throw new Error("prázdný rozvrh");
    if (!stav.prihlasky) stav.prihlasky = {};
    // strop a délka se řídí argumenty serveru — mapa se mezi restarty může změnit
    if (mistNaFrakci) stav.mistNaFrakci = mistNaFrakci;
    // ⚠ `delkaHodin` v rozvrhu je POUZE INZERÁT pro domov — skutečnou délku
    // sezóny dává `game.setSeasonHours(SEZONA_HODIN)` v server.js a rozvrh se
    // na ni nikdy neptá. Musí se proto srovnávat BEZPODMÍNEČNĚ.
    //
    // Dřív tu byla podmínka `stav.faze === "zapisy"` a stačilo, aby při startu
    // serveru běžela sezóna (fáze „bezi"), a srovnání se přeskočilo. Stará
    // hodnota pak přežila restart, `dalsi()` ji protáhla do další sezóny a
    // domov hlásil „délka 60 minut" u sezóny, která ve skutečnosti běží 336 h.
    if (delkaHodin && stav.delkaHodin !== delkaHodin) {
      console.log(`[rozvrh] délka sezóny srovnána podle serveru: `
        + `${stav.delkaHodin} h → ${delkaHodin} h`);
      stav.delkaHodin = delkaHodin;
      uloz();
    }
    return stav;
  } catch (e) {
    if (fs.existsSync(SOUBOR)) console.error("[rozvrh] soubor je poškozený (" + e.message + ") — plánuju znovu");
  }
  // převod z v0.46: stav.json držel jen číslo sezóny
  let cislo = 1;
  try { cislo = JSON.parse(fs.readFileSync(STARY_STAV, "utf8")).sezona || 1; } catch (e) {}
  stav = vychozi(cislo, delkaHodin, mistNaFrakci, ted);
  uloz();
  return stav;
}

function uloz() {
  if (!stav) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(SOUBOR + ".tmp", JSON.stringify(stav, null, 1));
    fs.renameSync(SOUBOR + ".tmp", SOUBOR);   // atomicky, ať pád nenechá půlku
  } catch (e) { console.error("[rozvrh] zápis selhal:", e.message); }
}

function ted() { return stav; }
function doStartu(cas = Date.now()) { return stav ? Math.max(0, stav.startAt - cas) : 0; }
function jeCas(cas = Date.now()) { return !!stav && stav.faze === "zapisy" && cas >= stav.startAt; }

function obsazenost() {
  const out = {};
  for (const p of Object.values(stav.prihlasky)) out[p.faction] = (out[p.faction] || 0) + 1;
  return out;
}

function prihlasenych() { return Object.keys(stav.prihlasky).length; }

// Přihláška je vázaná na ÚČET, ne na spojení — hráč si ji nese mezi
// zařízeními a nepřijde o ni odpojením ani restartem serveru.
function prihlas(accKey, faction, jmeno) {
  if (!accKey) return { error: "Na sezónu se dá přihlásit jen s účtem." };
  if (stav.faze !== "zapisy") return { error: "Zápisy do téhle sezóny už jsou uzavřené." };
  if (!Number.isInteger(faction) || faction < 0) return { error: "Neplatná frakce." };
  const uz = stav.prihlasky[accKey];
  if (!uz || uz.faction !== faction) {
    const kolik = obsazenost()[faction] || 0;
    if (kolik >= stav.mistNaFrakci) return { error: "Tahle frakce je plná." };
  }
  stav.prihlasky[accKey] = { faction, jmeno: jmeno || "Bezejmenný", kdy: Date.now() };
  uloz();
  return { ok: true, faction };
}

function odhlas(accKey) {
  if (stav.faze !== "zapisy") return { error: "Sezóna už běží, odhlásit se nedá." };
  if (!stav.prihlasky[accKey]) return { error: "Nejsi přihlášený." };
  delete stav.prihlasky[accKey];
  uloz();
  return { ok: true };
}

function prihlaskaOf(accKey) { return (accKey && stav.prihlasky[accKey]) || null; }

// Sezóna se rozjela — zápisy se zavírají, ale seznam přihlášek ZŮSTÁVÁ:
// server podle něj pozná, kdo do sezóny patří, i když se připojí až za tři dny.
function zacni() {
  stav.faze = "bezi";
  uloz();
  return stav;
}

// Sezóna dohrála — naplánuj další a vysyp přihlášky (do nové sezóny se hlásí znovu)
function dalsi(cas = Date.now()) {
  stav.cislo++;
  stav.faze = "zapisy";
  stav.startAt = cas + PRODLEVA_DALSI_H * 3600 * 1000;
  stav.prihlasky = {};
  uloz();
  return stav;
}

// Ruční posun termínu (obcházka pro testování a pro partu, co nechce čekat)
function naplanuj(kdy) {
  stav.startAt = kdy;
  if (stav.faze !== "zapisy") { stav.faze = "zapisy"; stav.prihlasky = {}; }
  uloz();
  return stav;
}

module.exports = {
  nacti, uloz, ted, doStartu, jeCas, obsazenost, prihlasenych,
  prihlas, odhlas, prihlaskaOf, zacni, dalsi, naplanuj,
  SOUBOR, PRODLEVA_DALSI_H, PRVNI_ZA_H,
};
