"use strict";
/* Válka popela — úložiště účtů v SQLite (etapa 5).
 *
 * Do v0.44 žily účty v jediném souboru server/data/accounts.json, který se při
 * každém uložení přepisoval CELÝ. To je v pořádku pro hrst kamarádů, ale ne pro
 * stovky hráčů: přepis roste s počtem účtů, a když proces spadne uprostřed
 * zápisu, je soubor useknutý a přijdeš o všechno.
 *
 * SQLite tohle řeší zápisem po řádcích a žurnálem (WAL), takže pád procesu
 * databázi nerozbije. Používá se `node:sqlite`, který je od Node 22 SOUČÁSTÍ
 * RUNTIME — žádná nativní závislost, nic se nekompiluje, na Windows i na serveru
 * se chová stejně. Projekt tak zůstává u jediné závislosti (`ws`).
 *
 * MODEL SE NEMĚNÍ: účty drží server dál v paměti jako obyčejné objekty a mutuje
 * je na místě (`acc.cores -= 400`). Databáze je jen trvalé úložiště, do kterého
 * se špinavé účty vyklápějí každých pár sekund. Díky tomu se nemusel přepisovat
 * žádný z desítek čtecích míst v server.js.
 */

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

// VP_DATA umí přesměrovat úložiště jinam — testy tak nesahají na ostrá data
const DATA_DIR = process.env.VP_DATA || path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "ucty.db");
const JSON_FILE = path.join(DATA_DIR, "accounts.json");

let db = null;
let ucty = {};              // klíč → účet (živé objekty, které server mutuje)
let kody = null;            // vlastní tabulka promo kódů, nebo null
let spinave = false;

function otevri() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_FILE);
  // WAL: čtení neblokuje zápis a nedokončený zápis se při pádu vrátí zpět
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec(`CREATE TABLE IF NOT EXISTS ucty (
    klic TEXT PRIMARY KEY,
    jmeno TEXT NOT NULL,
    data TEXT NOT NULL,
    zmeneno INTEGER NOT NULL
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS meta (
    klic TEXT PRIMARY KEY,
    hodnota TEXT NOT NULL
  )`);
}

function metaGet(klic) {
  const r = db.prepare("SELECT hodnota FROM meta WHERE klic = ?").get(klic);
  return r ? r.hodnota : null;
}
function metaSet(klic, hodnota) {
  db.prepare("INSERT INTO meta (klic, hodnota) VALUES (?, ?) " +
    "ON CONFLICT(klic) DO UPDATE SET hodnota = excluded.hodnota").run(klic, hodnota);
}

// jednorázový převod starého accounts.json; originál se přejmenuje, aby se
// import nespustil podruhé a zároveň zůstal po ruce
function prevedZeJsonu(nyni) {
  if (!fs.existsSync(JSON_FILE)) return 0;
  let stary;
  try { stary = JSON.parse(fs.readFileSync(JSON_FILE, "utf8")); }
  catch (e) { console.error("[účty] accounts.json se nepodařilo přečíst:", e.message); return 0; }
  const vloz = db.prepare("INSERT OR REPLACE INTO ucty (klic, jmeno, data, zmeneno) VALUES (?, ?, ?, ?)");
  let n = 0;
  for (const klic in (stary.accounts || {})) {
    const a = stary.accounts[klic];
    vloz.run(klic, String(a.name || klic), JSON.stringify(a), nyni);
    n++;
  }
  if (stary.codes) metaSet("codes", JSON.stringify(stary.codes));
  const zaloha = JSON_FILE + ".prevedeno.bak";
  try { fs.renameSync(JSON_FILE, zaloha); } catch (e) { /* nevadí, import proběhl */ }
  console.log(`[účty] převedeno ${n} účtů z accounts.json do SQLite (původní soubor: ${path.basename(zaloha)})`);
  return n;
}

/** Otevře databázi, případně převede starý JSON a načte účty do paměti.
 *  `migrace` = funkce volaná nad každým účtem (game.migrateAccount). */
function nacti(migrace) {
  otevri();
  const nyni = Date.now();
  if (!db.prepare("SELECT COUNT(*) AS n FROM ucty").get().n) prevedZeJsonu(nyni);

  ucty = {};
  for (const r of db.prepare("SELECT klic, data FROM ucty").all()) {
    try { ucty[r.klic] = JSON.parse(r.data); }
    catch (e) { console.error("[účty] poškozený záznam", r.klic, "—", e.message); }
  }
  const c = metaGet("codes");
  kody = c ? JSON.parse(c) : null;

  if (typeof migrace === "function") {
    for (const klic in ucty) migrace(ucty[klic]);
    spinave = true;    // migrace mohla účty změnit — ať se to uloží
  }
  return { ucty, kody };
}

function oznacZmenu() { spinave = true; }

/** Vyklopí změněné účty do databáze. Zapisuje VŠECHNY účty naráz v jedné
 *  transakci — při stovkách účtů je to pořád pod milisekundu a odpadá tím
 *  evidence, který účet je špinavý. (Až budou tisíce, přejít na klíčovou sadu.) */
function uloz(force) {
  if (!db || (!spinave && !force)) return 0;
  spinave = false;
  const nyni = Date.now();
  const vloz = db.prepare("INSERT INTO ucty (klic, jmeno, data, zmeneno) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(klic) DO UPDATE SET jmeno = excluded.jmeno, data = excluded.data, zmeneno = excluded.zmeneno");
  let n = 0;
  db.exec("BEGIN");
  try {
    for (const klic in ucty) {
      const a = ucty[klic];
      vloz.run(klic, String(a.name || klic), JSON.stringify(a), nyni);
      n++;
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    console.error("[účty] uložení selhalo:", e.message);
    spinave = true;
  }
  return n;
}

// Zápis KONKRÉTNÍCH účtů. Volá se ZEVNITŘ cizí transakce (burza), aby odečet
// jader a vznik nabídky byly jeden nedělitelný krok — pád mezi tím by jinak
// buď snědl jádra, nebo vyrobil nabídku zadarmo.
function zapisUcty(klice) {
  if (!db) return 0;
  const nyni = Date.now();
  const vloz = db.prepare("INSERT INTO ucty (klic, jmeno, data, zmeneno) VALUES (?, ?, ?, ?) " +
    "ON CONFLICT(klic) DO UPDATE SET jmeno = excluded.jmeno, data = excluded.data, zmeneno = excluded.zmeneno");
  let n = 0;
  for (const klic of klice) {
    const a = ucty[klic];
    if (!a) continue;
    vloz.run(klic, String(a.name || klic), JSON.stringify(a), nyni);
    n++;
  }
  return n;
}

function pridej(klic, ucet) { ucty[klic] = ucet; spinave = true; return ucet; }
function smaz(klic) {
  delete ucty[klic];
  if (db) db.prepare("DELETE FROM ucty WHERE klic = ?").run(klic);
}
function zavri() { uloz(); if (db) { db.close(); db = null; } }

module.exports = { nacti, uloz, oznacZmenu, pridej, smaz, zavri, zapisUcty,
  get ucty() { return ucty; }, get kody() { return kody; },
  // burza si otvírá TUTÉŽ databázi — jinak by úschova nešla zapsat v jedné
  // transakci s účty (viz PLAN IV-R: „odečet i vznik nabídky v JEDNÉ transakci")
  get db() { return db; },
  DB_FILE, JSON_FILE };
