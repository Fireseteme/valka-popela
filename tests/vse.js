// Spustí všechny testovací sady najednou:  node tests/vse.js
// (jednotlivě: node tests/test-stromy.js …). Testy běží čistě nad js/game.js,
// nesahají na běžící server ani na server/data — pouštěj je kdykoli.
const { execFileSync } = require("child_process");
const path = require("path");
const sady = [
  ["Stromy dovedností, úrovně a migrace účtů", "test-stromy.js"],
  ["Boj: kolové aktivky, chargy, bonusy rysu", "test-boj.js"],
  ["Neutrální velitelé", "test-neutralove.js"],
  ["Truhly: sloty, dárky a rarity", "test-truhly.js"],
  ["Mapa na koso a bloky staveb", "test-mapa.js"],
  ["Dlouhé sezóny: Prsten, Koruna, kraje", "test-sezony.js"],
  ["Čekající rozkazy: posily a pak útok", "test-rozkazy.js"],
  ["Síň hrdinů, strany a ekonomika účtu", "test-sin.js"],
  ["Úložiště účtů v SQLite (etapa 5)", "test-ucty.js"],
  ["Nesmrtelnost sezóny: snímek přežije restart (etapa 5)", "test-trvalost-sezony.js"],
  ["Rozvrh sezón: termíny a přihlášky (etapa 5b)", "test-rozvrh.js"],
  ["Rastr balancu: pavučina osmičky", "test-rastr.js"],
  ["Etapa 3: rádius, obléhací okna, válka, vykořenění", "test-etapa3.js"],
  ["Etapa 4a: uzly 2×2, zóny světa a fáze", "test-etapa4.js"],
  ["Etapa 4b: strom Prstenu, strop území, kapitoly a checkpointy", "test-etapa4b.js"],
  ["Etapa 4c: hráč-uvnitř-frakce (členové, města, t.clen)", "test-etapa4c.js"],
  ["Etapa 4d: parametrizace velikosti mapy (byte-identita + invarianty 103×103)", "test-mapr.js"],
  ["Etapa 6: práh obrany, velké jednotky, linie", "test-etapa6.js"],
  ["Etapa 7: řetěz bitev o stoh hrdinů", "test-etapa7.js"],
  ["Výcvik podle objemu: doba, fronta, zrušení", "test-vycvik.js"],
  ["Okno zranění: sčítaný postup na neutrálech", "test-okno-zraneni.js"],
  ["Keepy krajů: jeden na kraj, blok 5×5, drží kraj", "test-keepy.js"],
  ["Dělič kolébky: prstenec a jeden přechod na výseč", "test-delic.js"],
  ["Klany: entita v rodu, klanové pole, pevnost a vyhazov", "test-klany.js"],
  ["Chat: svět, klan a soukromé kanály", "test-chat.js"],
  ["Klanová burza: přihrádky, ceník a ÚSCHOVA", "test-burza.js"],
  ["Politika: rozhodující klan, hlasování, spojenci", "test-politika.js"],
  ["MMO měřítko: přehled aktérů, AOI, dosah a vidění", "test-mmo.js"],
  ["Jazyky: slovník, tři jazyky a klíče v kronice", "test-jazyky.js"],
];
// Etapa 6 přeměřuje kotvy boje — dokud přepínač běží, je část asercí jen
// měřením. Banner je tu proto, aby se na jeho vypnutí nedalo zapomenout.
const { PREMERUJE_SE } = require("./etapa6.js");
if (PREMERUJE_SE) {
  console.log("");
  console.log("⚠  ETAPA 6 PROBÍHÁ: kotvy boje se přeměřují, část asercí je vypnutá.");
  console.log("   Na konci etapy PŘEMĚŘIT a vypnout přepínač v tests/etapa6.js.");
  console.log("");
}
let chyb = 0;
for (const [nazev, soubor] of sady) {
  console.log("\n########## " + nazev + " ##########");
  try {
    console.log(execFileSync(process.execPath, [path.join(__dirname, soubor)],
      { encoding: "utf8" }));
  } catch (e) {
    chyb++;
    console.log(e.stdout || "");
    console.log("!!! " + soubor + " SELHAL");
  }
}
console.log(chyb === 0 ? "\n✅ všechny sady prošly" : `\n❌ ${chyb} sad selhalo`);
process.exit(chyb ? 1 : 0);
