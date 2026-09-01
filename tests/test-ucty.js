// Úložiště účtů v SQLite (etapa 5): převod ze starého accounts.json, trvalost
// přes restart procesu, migrace herních polí a odolnost proti poškozenému
// záznamu. Test si dělá VLASTNÍ dočasnou databázi — nesahá na server/data.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const game = require("../js/game.js");

let proslo = 0, selhalo = 0;
const test = (jmeno, ok) => {
  if (ok) proslo++;
  else { selhalo++; console.log("  ❌ " + jmeno); }
};
const sada = jmeno => console.log("\n=== " + jmeno + " ===");

// modul si cestu bere z __dirname, takže test běží nad KOPIÍ serveru
// v dočasném adresáři — ostrá data zůstanou nedotčená
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-ucty-"));
fs.mkdirSync(path.join(tmp, "data"), { recursive: true });
fs.copyFileSync(path.join(__dirname, "..", "server", "ucty.js"), path.join(tmp, "ucty.js"));
const MODUL = path.join(tmp, "ucty.js");
const JSONF = path.join(tmp, "data", "accounts.json");
const DBF = path.join(tmp, "data", "ucty.db");

// každé „spuštění serveru" je vlastní proces — jinak by se databáze držela
// v paměti jednoho běhu a trvalost by se neotestovala
function vProcesu(kod) {
  const out = execFileSync(process.execPath, ["-e",
    `const u = require(${JSON.stringify(MODUL)});
     const game = require(${JSON.stringify(path.join(__dirname, "..", "js", "game.js"))});
     ${kod}`], { encoding: "utf8" });
  return out.trim().split("\n").filter(r => r.startsWith("VYSTUP:")).pop() || "";
}
const vystup = s => s.replace(/^VYSTUP:/, "");

sada("1. Převod starého accounts.json");
{
  const stary = { accounts: {
    kamarad: { ...game.emptyAccount("Kamarád"), cores: 777, salt: "s", hash: "h" },
    druhy: { ...game.emptyAccount("Druhý"), cores: 10 },
  }, codes: { MUJKOD: 50 } };
  fs.writeFileSync(JSONF, JSON.stringify(stary));

  const r = vystup(vProcesu(`
    const n = u.nacti(game.migrateAccount);
    console.log("VYSTUP:" + JSON.stringify({
      pocet: Object.keys(n.ucty).length,
      jadra: n.ucty.kamarad.cores,
      kody: n.kody && n.kody.MUJKOD,
      ulozeno: u.uloz(true),
    }));
    u.zavri();`));
  const v = JSON.parse(r);
  test("převedly se oba účty", v.pocet === 2);
  test("hodnoty účtu přežily převod", v.jadra === 777);
  test("promo kódy se převedly", v.kody === 50);
  test("databáze vznikla", fs.existsSync(DBF));
  test("původní JSON se přejmenoval (import se nespustí podruhé)",
    !fs.existsSync(JSONF) && fs.existsSync(JSONF + ".prevedeno.bak"));
}

sada("2. Trvalost přes restart procesu");
{
  vProcesu(`
    const n = u.nacti(game.migrateAccount);
    n.ucty.kamarad.cores = 4242;
    n.ucty.kamarad.darky = { "aldar:t1": 3 };
    u.oznacZmenu(); u.zavri();
    console.log("VYSTUP:ok");`);
  const v = JSON.parse(vystup(vProcesu(`
    const n = u.nacti(game.migrateAccount);
    console.log("VYSTUP:" + JSON.stringify({
      jadra: n.ucty.kamarad.cores,
      darky: n.ucty.kamarad.darky,
      pocet: Object.keys(n.ucty).length,
    }));
    u.zavri();`)));
  test("změna jader přežila restart", v.jadra === 4242);
  test("vnořená data (sklad dárků) přežila restart", v.darky && v.darky["aldar:t1"] === 3);
  test("počet účtů se nezměnil", v.pocet === 2);
}

sada("3. Nový účet a smazání");
{
  const v = JSON.parse(vystup(vProcesu(`
    const n = u.nacti(game.migrateAccount);
    u.pridej("treti", { ...game.emptyAccount("Třetí"), cores: 5 });
    u.uloz(true);
    const poPridani = Object.keys(n.ucty).length;   // POZOR: smaz() níž počet zase sníží
    u.smaz("druhy");
    console.log("VYSTUP:" + JSON.stringify({ pocet: poPridani }));
    u.zavri();`)));
  test("přidaný účet je v paměti", v.pocet === 3);
  const v2 = JSON.parse(vystup(vProcesu(`
    const n = u.nacti(game.migrateAccount);
    console.log("VYSTUP:" + JSON.stringify({
      klice: Object.keys(n.ucty).sort(), jadra: (n.ucty.treti || {}).cores }));
    u.zavri();`)));
  test("přidaný účet přežil restart", v2.jadra === 5);
  test("smazaný účet je pryč", !v2.klice.includes("druhy") && v2.klice.length === 2);
}

sada("4. Migrace herních polí nad uloženými účty");
{
  const v = JSON.parse(vystup(vProcesu(`
    const n = u.nacti(game.migrateAccount);
    const a = n.ucty.kamarad;
    console.log("VYSTUP:" + JSON.stringify({
      maDarky: !!a.darky, maSig: !!a.sigOdemceno, treeV: a.treeV }));
    u.zavri();`)));
  test("migrateAccount se pustil nad načtenými účty",
    v.maDarky && v.maSig && v.treeV === game.TREE_VERSION);
}

sada("5. Poškozený záznam nezabije načtení");
{
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(DBF);
  db.prepare("INSERT INTO ucty (klic, jmeno, data, zmeneno) VALUES (?, ?, ?, ?)")
    .run("rozbity", "Rozbitý", "{tohle není JSON", Date.now());
  db.close();
  const v = JSON.parse(vystup(vProcesu(`
    const n = u.nacti(game.migrateAccount);
    console.log("VYSTUP:" + JSON.stringify({ pocet: Object.keys(n.ucty).length,
      maKamarada: !!n.ucty.kamarad }));
    u.zavri();`)));
  test("zdravé účty se načetly i přes jeden poškozený", v.maKamarada && v.pocet === 2);
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* uklidí OS */ }

console.log(`\n${proslo} prošlo, ${selhalo} selhalo`);
if (selhalo > 0) process.exit(1);
