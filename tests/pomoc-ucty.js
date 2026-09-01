// Společný pomocník integračních testů: založí ÚČET A ROVNOU HO POTVRDÍ.
//
// Od v0.51 je e-mail při registraci povinný a síň je do potvrzení zamčená,
// takže testy, které jen potřebují přihlášeného hráče, by jinak každý zvlášť
// řešily celý ověřovací tok. Tohle ho projde za ně: registruje, vytáhne kód
// z databáze (účty se vyklápějí okamžitě, protože bezpečnostní zápisy
// nečekají na pětivteřinový cyklus) a otevře potvrzovací odkaz.
const { DatabaseSync } = require("node:sqlite");
const path = require("path");

const pauza = ms => new Promise(r => setTimeout(r, ms));

async function ucetZDb(dataDir, klic, podminka) {
  for (let i = 0; i < 20; i++) {
    try {
      const db = new DatabaseSync(path.join(dataDir, "ucty.db"), { readOnly: true });
      const r = db.prepare("select data from ucty where klic = ?").get(klic);
      db.close();
      if (r) { const a = JSON.parse(r.data); if (!podminka || podminka(a)) return a; }
    } catch (e) { /* databáze se právě zapisuje */ }
    await pauza(400);
  }
  return null;
}

// `k` je klient s metodami posli/cekej (viz jednotlivé testy).
// Vrací profil účtu (zpráva `account`), takže volající má i authToken.
async function zaregistrujAPotvrd(k, { port, dataDir, jmeno, heslo }) {
  const email = jmeno + "@test.invalid";
  k.posli({ type: "accRegister", name: jmeno, pass: heslo, email });
  await k.cekej("accCekaOvereni");
  const klic = jmeno.toLowerCase();
  const u = await ucetZDb(dataDir, klic, a => !!a.overeniKod);
  if (!u) throw new Error("účet " + jmeno + " se v databázi neobjevil");
  const r = await fetch(`http://127.0.0.1:${port}/overit?kod=${u.overeniKod}`);
  if (!r.ok) throw new Error("potvrzení účtu " + jmeno + " selhalo: " + r.status);
  k.posli({ type: "accLogin", name: jmeno, pass: heslo });
  return await k.cekej("account");
}

module.exports = { zaregistrujAPotvrd, ucetZDb, pauza };
