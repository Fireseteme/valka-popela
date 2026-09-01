"use strict";
/* Válka popela — KLANOVÁ BURZA: úschova a stavy nabídek (etapa 9, IV-F + IV-R).
 *
 * Pravidla přihrádek a ceník žijí v js/game.js (čtou je klient i server).
 * Tady je jen to, co MUSÍ být na serveru: trvalé úložiště nabídek a úschova.
 *
 * PROČ V TÉŽE DATABÁZI JAKO ÚČTY: úschova se odečítá z účtu a musí být
 * s nabídkou v JEDNÉ transakci. Kdyby to byly dvě databáze (nebo databáze
 * a sezónní snímek), pád mezi zápisy by buď snědl jádra, nebo vyrobil
 * nabídku zadarmo.
 *
 * ÚSCHOVA MUSÍ PŘEŽÍT RESTART A VRÁTIT SE PRÁVĚ JEDNOU — jinak je to tiskárna
 * jader. Drží to jediné pravidlo:
 *
 *   VŠECHNY vratky visí na PŘECHODU STAVU nabídky, ne na jejím obsahu.
 *
 * Každá operace začíná atomickým `UPDATE … WHERE stav='vystavena'` a pokračuje,
 * jen když změnila PRÁVĚ JEDEN řádek. Dvě zprávy „zruš" za sebou tak přeloží
 * stav jen jednou a druhá nemá co vracet; „přijmi" a „zruš" přes sebe mají
 * jednoho vítěze. Nikdy se nedělá „přečti zůstatek → přičti → zapiš".
 *
 * TRVANLIVOST: výbava a dárky žijí na ÚČTU a nabídky s nimi přežívají sezóny.
 * Suroviny jsou sezónní, takže surovinová nabídka nese číslo sezóny a při
 * změně sezóny se ruší — vracet by nebylo co a komu (majetek se resetuje).
 */

const game = require("../js/game.js");

let db = null;
let ucty = null;      // modul server/ucty.js (kvůli zápisu účtů v téže transakci)
let hraG = null;      // getter na živé G (suroviny žijí na aktérech)

const DEN = 86400 * 1000;

function nacti(uctyModul, getG) {
  ucty = uctyModul;
  db = ucty.db;
  hraG = getG;
  db.exec(`CREATE TABLE IF NOT EXISTS nabidky (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    stav TEXT NOT NULL,
    prihradka TEXT NOT NULL,
    majitel TEXT NOT NULL,
    jmeno TEXT NOT NULL,
    fid INTEGER NOT NULL,
    cid INTEGER NOT NULL,
    klan INTEGER NOT NULL,
    komu TEXT NOT NULL,
    sezona INTEGER NOT NULL,
    dava TEXT NOT NULL,
    chce TEXT NOT NULL,
    uschova TEXT NOT NULL,
    vznik INTEGER NOT NULL,
    platiDo INTEGER NOT NULL,
    prijal TEXT NOT NULL DEFAULT ''
  )`);
  db.exec("CREATE INDEX IF NOT EXISTS nabidky_stav ON nabidky (stav, klan)");
  db.exec("CREATE INDEX IF NOT EXISTS nabidky_majitel ON nabidky (majitel, stav)");
}

// ---- transakce s vrácením paměti ----
// Účty server drží v paměti a mutuje na místě, takže když zápis selže, musí
// se paměť vrátit ručně — SQLite o ní neví.
function transakce(fn) {
  const vrat = [];
  const zpet = f => vrat.push(f);
  db.exec("BEGIN IMMEDIATE");
  try {
    const r = fn(zpet);
    db.exec("COMMIT");
    ucty.oznacZmenu();
    return r;
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch (x) { /* už mohl spadnout sám */ }
    for (let i = vrat.length - 1; i >= 0; i--) { try { vrat[i](); } catch (x) {} }
    throw e;
  }
}
class Chyba extends Error {}
const chyba = t => { throw new Chyba(t); };

function radek(id) {
  const r = db.prepare("SELECT * FROM nabidky WHERE id = ?").get(id);
  return r ? ozivRadek(r) : null;
}
function ozivRadek(r) {
  return { ...r, dava: JSON.parse(r.dava), chce: JSON.parse(r.chce), uschova: JSON.parse(r.uschova) };
}

// aktér, kterému patří majetek nabídky (suroviny) — po změně sezóny nemusí být
function akterZ(n) {
  const G = hraG && hraG();
  const f = G && G.factions && G.factions[n.fid];
  if (!f) return null;
  return game.clenPodleCid(f, n.cid | 0) || f;
}

// ---- majetek: odebrání a vrácení ----
function odeberSuroviny(a, res, zpet) {
  for (const k of game.RES_KEYS) {
    const v = Math.max(0, Math.round(res[k] || 0));
    if (!v) continue;
    if ((a.resources[k] || 0) < v) chyba("Na tuhle nabídku nemáš suroviny.");
    a.resources[k] -= v;
    zpet(() => { a.resources[k] += v; });
  }
}
function pridejSuroviny(a, res) {
  if (!a) return;
  for (const k of game.RES_KEYS) a.resources[k] = (a.resources[k] || 0) + Math.max(0, Math.round(res[k] || 0));
}
function odeberZlato(a, kolik, zpet) {
  if (kolik <= 0) return;
  if ((a.resources.gold || 0) < kolik) chyba("Na poplatek nemáš zlato.");
  a.resources.gold -= kolik;
  zpet(() => { a.resources.gold += kolik; });
}
function odeberJadra(acc, kolik, zpet) {
  if (kolik <= 0) return;
  if ((acc.cores | 0) < kolik) chyba("Na poplatek nemáš jádra.");
  acc.cores -= kolik;
  zpet(() => { acc.cores += kolik; });
}
// kus výbavy ze zásoby účtu; do nabídky jde OČIŠTĚNÝ (stripItem) — přesně jako
// při ukládání na účet, takže se runtime id nikde nezdvojí
function odeberKus(acc, itemId, zpet) {
  const i = (acc.inventory || []).findIndex(x => x && x.id === itemId);
  if (i < 0) chyba("Ten kus v zásobě nemáš.");
  const kus = acc.inventory[i];
  acc.inventory.splice(i, 1);
  zpet(() => acc.inventory.splice(i, 0, kus));
  return game.stripItem(kus);
}
function pridejKus(acc, kus) {
  if (!acc || !kus) return;
  acc.inventory = acc.inventory || [];
  acc.inventory.push(game.stripItem(kus));
}
function odeberDarky(acc, skupina, pocet, zpet) {
  const mam = (acc.darky && acc.darky[skupina]) | 0;
  if (mam < pocet) chyba("Tolik dárků té skupiny nemáš.");
  acc.darky[skupina] = mam - pocet;
  if (!acc.darky[skupina]) delete acc.darky[skupina];
  zpet(() => { acc.darky[skupina] = mam; });
}
function pridejDarky(acc, skupina, pocet) {
  if (!acc) return;
  acc.darky = acc.darky || {};
  acc.darky[skupina] = ((acc.darky[skupina] | 0) + pocet);
}

// vrácení úschovy majiteli — volá se JEN po úspěšném přechodu stavu
function vratUschovu(n, zpet) {
  const acc = ucty.ucty[n.majitel];
  const u = n.uschova || {};
  if (u.cores && acc) { acc.cores = (acc.cores | 0) + u.cores; zpet(() => { acc.cores -= u.cores; }); }
  if (n.prihradka === "suroviny") {
    const a = akterZ(n);
    if (a) {
      pridejSuroviny(a, n.dava);
      if (u.gold) a.resources.gold = (a.resources.gold || 0) + u.gold;
    }
    return;
  }
  if (!acc) return;
  if (n.prihradka === "vybava" && n.dava.item) pridejKus(acc, n.dava.item);
  if (n.prihradka === "darky") pridejDarky(acc, n.dava.skupina, n.dava.pocet | 0);
}

// ---- počítadlo obchodů za den (eskalace poplatku) ----
function zapocitejObchod(acc, den, zpet) {
  const puvDen = acc.burzaDen, puvPocet = acc.burzaPocet | 0;
  if (acc.burzaDen !== den) { acc.burzaDen = den; acc.burzaPocet = 0; }
  acc.burzaPocet = (acc.burzaPocet | 0) + 1;
  zpet(() => { acc.burzaDen = puvDen; acc.burzaPocet = puvPocet; });
}

/** Vystavení nabídky. Úschova (zboží I polovina poplatku) se strhne HNED —
 *  kdyby se platilo až při accept, může nabízející mezitím jádra utratit
 *  a obchod spadne druhé straně pod rukama. */
function vystav(majitelKlic, aktor, nabidka, nyni) {
  const acc = ucty.ucty[majitelKlic];
  if (!acc) return { error: "Nabídku smí vystavit jen přihlášený účet." };
  const duvod = game.burzaZkontroluj(nabidka);
  if (duvod) return { error: duvod };
  const klan = game.klanOf(aktor);
  if (!klan) return { error: "Burza je klanová — nejdřív vstup do klanu." };
  const den = game.dnesniDen();
  const pulka = game.burzaPulka(nabidka, acc, den);

  try {
    return transakce(zpet => {
      const uschova = {};
      if (nabidka.prihradka === "suroviny") {
        odeberSuroviny(aktor, nabidka.dava, zpet);
        odeberZlato(aktor, pulka.castka, zpet);
        uschova.gold = pulka.castka;
      } else if (nabidka.prihradka === "vybava") {
        const kus = odeberKus(acc, nabidka.dava.itemId, zpet);
        // raritu jde ověřit až tady, kde je kus v ruce (klient posílá jen id)
        const potiz = game.burzaRaritaSedi(nabidka, kus);
        if (potiz) chyba(potiz);
        nabidka.dava = { item: kus };
        odeberJadra(acc, pulka.castka, zpet);
        uschova.cores = pulka.castka;
      } else {
        odeberDarky(acc, nabidka.dava.skupina, nabidka.dava.pocet | 0, zpet);
        odeberJadra(acc, pulka.castka, zpet);
        uschova.cores = pulka.castka;
      }
      const G = hraG && hraG();
      const r = db.prepare(`INSERT INTO nabidky
        (stav, prihradka, majitel, jmeno, fid, cid, klan, komu, sezona, dava, chce, uschova, vznik, platiDo)
        VALUES ('vystavena',?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        nabidka.prihradka, majitelKlic, String(acc.name || majitelKlic),
        aktor.id | 0, aktor.cid | 0, klan.id, String(nabidka.komu || ""),
        (G && G.seasonNumber) | 0,
        JSON.stringify(nabidka.dava), JSON.stringify(nabidka.chce), JSON.stringify(uschova),
        nyni, nyni + game.BURZA_PLATNOST_DNI * DEN);
      ucty.zapisUcty([majitelKlic]);
      return { ok: true, id: Number(r.lastInsertRowid), uschova };
    });
  } catch (e) {
    return { error: e instanceof Chyba ? e.message : "Nabídku se nepodařilo vystavit." };
  }
}

/** Zrušení vlastní nabídky — úschova se vrací PRÁVĚ JEDNOU. */
function zrus(id, klic) {
  try {
    return transakce(zpet => {
      const n = radek(id);
      if (!n) chyba("Nabídka neexistuje.");
      if (n.majitel !== klic) chyba("Tohle není tvoje nabídka.");
      // ⚠ vratka visí na PŘECHODU STAVU: druhé „zruš" změní 0 řádků a skončí
      const r = db.prepare("UPDATE nabidky SET stav='zrusena' WHERE id=? AND stav='vystavena'").run(id);
      if (r.changes !== 1) chyba("Nabídka už neplatí.");
      vratUschovu(n, zpet);
      ucty.zapisUcty([n.majitel]);
      return { ok: true };
    });
  } catch (e) {
    return { error: e instanceof Chyba ? e.message : "Zrušení selhalo." };
  }
}

/** Přijetí nabídky. Protiplnění platí přijímající, svou polovinu poplatku taky. */
function prijmi(id, klic, aktor, protiplneni) {
  const acc = ucty.ucty[klic];
  if (!acc) return { error: "Obchodovat může jen přihlášený účet." };
  try {
    return transakce(zpet => {
      const n = radek(id);
      if (!n) chyba("Nabídka neexistuje.");
      if (n.stav !== "vystavena") chyba("Nabídka už neplatí.");
      if (n.majitel === klic) chyba("Vlastní nabídku si nepřijmeš.");
      const klan = game.klanOf(aktor);
      if (!klan || klan.id !== n.klan) chyba("Tahle nabídka patří jinému klanu.");
      if (n.komu && n.komu !== klic) chyba("Nabídka je mířená na někoho jiného.");
      const duvod = game.burzaProtiplneniSedi(n, protiplneni);
      if (duvod) chyba(duvod);

      // ⚠ TENTÝŽ stavový automat jako u zrušení — accept a cancel přes sebe
      // mají právě jednoho vítěze
      const r = db.prepare("UPDATE nabidky SET stav='prijata', prijal=? WHERE id=? AND stav='vystavena'")
        .run(klic, id);
      if (r.changes !== 1) chyba("Nabídka už neplatí.");

      const majitelAcc = ucty.ucty[n.majitel];
      const den = game.dnesniDen();
      const pulka = game.burzaPulka(n, acc, den);

      if (n.prihradka === "suroviny") {
        odeberSuroviny(aktor, n.chce, zpet);
        odeberZlato(aktor, pulka.castka, zpet);
        pridejSuroviny(aktor, n.dava);            // přijímající dostane, co bylo v úschově
        pridejSuroviny(akterZ(n), n.chce);        // majitel dostane protiplnění
      } else if (n.prihradka === "vybava") {
        const kus = odeberKus(acc, protiplneni.itemId, zpet);
        // rarita protiplnění se ověřuje až tady — klient posílá jen id
        const potiz2 = game.burzaRaritaSedi(n, kus);
        if (potiz2) chyba(potiz2);
        odeberJadra(acc, pulka.castka, zpet);
        pridejKus(acc, n.dava.item);
        pridejKus(majitelAcc, kus);
      } else {
        odeberDarky(acc, protiplneni.skupina, protiplneni.pocet | 0, zpet);
        odeberJadra(acc, pulka.castka, zpet);
        pridejDarky(acc, n.dava.skupina, n.dava.pocet | 0);
        pridejDarky(majitelAcc, protiplneni.skupina, protiplneni.pocet | 0);
      }
      // poplatek je ODTOK — úschova majitele se NEVRACÍ, jen zboží se vyměnilo
      zapocitejObchod(acc, den, zpet);
      if (majitelAcc) zapocitejObchod(majitelAcc, den, zpet);
      ucty.zapisUcty([klic, n.majitel]);
      return { ok: true, nabidka: n };
    });
  } catch (e) {
    return { error: e instanceof Chyba ? e.message : "Obchod selhal." };
  }
}

/** Nabídky, které tenhle účet vidí: vlastní + veřejné svého klanu + mířené naň. */
function seznam(klic, aktor) {
  if (!db) return [];
  const klan = aktor && game.klanOf(aktor);
  const r = db.prepare(`SELECT * FROM nabidky WHERE stav='vystavena'
    AND (majitel = ? OR (klan = ? AND (komu = '' OR komu = ?)))
    ORDER BY id DESC LIMIT 100`).all(klic, klan ? klan.id : -1, klic);
  return r.map(ozivRadek);
}

/** Kolik jader má účet zablokovaných v nabídkách — musí být VIDĚT, jinak
 *  hráč hlásí, že mu jádra zmizela. */
function vNabidkach(klic) {
  if (!db) return 0;
  let s = 0;
  for (const r of db.prepare("SELECT uschova FROM nabidky WHERE majitel=? AND stav='vystavena'").all(klic)) {
    try { s += JSON.parse(r.uschova).cores | 0; } catch (e) {}
  }
  return s;
}

/** Vypršelé nabídky: úschova zpátky. Přechod stavu je zase atomický, takže
 *  vyprší-li nabídka ve chvíli, kdy ji někdo přijímá, vyhraje jen jeden. */
function vyprsele(nyni) {
  if (!db) return 0;
  const ids = db.prepare("SELECT id FROM nabidky WHERE stav='vystavena' AND platiDo < ?").all(nyni);
  let n = 0;
  for (const { id } of ids) {
    try {
      transakce(zpet => {
        const nab = radek(id);
        const r = db.prepare("UPDATE nabidky SET stav='vyprsela' WHERE id=? AND stav='vystavena'").run(id);
        if (r.changes !== 1) chyba("mezitím zmizela");
        vratUschovu(nab, zpet);
        ucty.zapisUcty([nab.majitel]);
        n++;
      });
    } catch (e) { /* jiný přechod byl rychlejší */ }
  }
  return n;
}

/** Změna sezóny ruší SUROVINOVÉ nabídky z minulých sezón. Vracet není co ani
 *  komu — sezónní majetek se resetuje a aktér z minulé sezóny už neexistuje. */
function uklidSezonu(sezona) {
  if (!db) return 0;
  const r = db.prepare("UPDATE nabidky SET stav='vyprsela' WHERE stav='vystavena' AND prihradka='suroviny' AND sezona <> ?")
    .run(sezona | 0);
  return r.changes | 0;
}

/** Součet jader na VŠECH účtech i v úschovách — kontrola, že se nic neztratilo
 *  ani nevyrobilo. Používá to test integrity úschovy. */
function jadraCelkem() {
  let s = 0;
  for (const k in ucty.ucty) s += ucty.ucty[k].cores | 0;
  for (const r of db.prepare("SELECT uschova FROM nabidky WHERE stav='vystavena'").all()) {
    try { s += JSON.parse(r.uschova).cores | 0; } catch (e) {}
  }
  return s;
}

module.exports = { nacti, vystav, zrus, prijmi, seznam, vNabidkach, vyprsele,
  uklidSezonu, jadraCelkem, radek };
