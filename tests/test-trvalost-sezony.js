// Nesmrtelnost sezóny (etapa 5): snímek rozehraného světa přežije restart
// procesu a hra se zvedne přesně tam, kde skončila. Test si dělá VLASTNÍ
// dočasný adresář přes VP_DATA — nesahá na server/data.
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

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-sezona-"));
const SEZONA = path.join(__dirname, "..", "server", "sezona.js");
const GAME = path.join(__dirname, "..", "js", "game.js");
const SNIMEK = path.join(tmp, "sezona.json.gz");

// Trvalost jde poctivě otestovat jen NAPŘÍČ PROCESY: v jednom běhu drží
// modul stav v paměti a „restart" by nedokázal nic.
function vProcesu(kod) {
  const out = execFileSync(process.execPath, ["-e",
    `const s = require(${JSON.stringify(SEZONA)});
     const game = require(${JSON.stringify(GAME)});
     const { G } = game;
     ${kod}`], { encoding: "utf8", env: { ...process.env, VP_DATA: tmp } });
  return out.trim().split("\n").filter(r => r.startsWith("VYSTUP:")).pop() || "";
}
const vystup = s => JSON.parse(s.replace(/^VYSTUP:/, ""));

// rozehraná partie, ze které se dělají snímky
const ROZEHRAJ = `
  game.newGameMulti([{ faction: 0, heroes: [0] }, { faction: 3, heroes: [0] }], 12345);
  for (let i = 0; i < 300; i++) game.doTick();`;

sada("1. Snímek přežije restart procesu");
{
  const pred = vystup(vProcesu(`${ROZEHRAJ}
    G.explored.add("0,0"); G.explored.add("1,1");
    const bajtu = s.uloz({ sezona: 7, sezonaHodin: 336, mapaR: game.MAP_R, G, hraci: [
      { token: "t1", name: "Vít", faction: 0, member: 0, accKey: "vit" }] });
    const t = G.tiles.get([...G.tiles.keys()][100]);
    console.log("VYSTUP:" + JSON.stringify({ bajtu, tick: G.tick, dlazdic: G.tiles.size,
      frakci: G.factions.length, explored: G.explored.size, vzorek: t,
      zlato: G.factions[0].resources }));`));
  test("snímek se zapsal", pred.bajtu > 0 && fs.existsSync(SNIMEK));
  test("snímek je malý (komprimovaný)", pred.bajtu < 200 * 1024);

  const po = vystup(vProcesu(`
    const stav = s.nacti();
    const t = stav.G.tiles.get([...stav.G.tiles.keys()][100]);
    console.log("VYSTUP:" + JSON.stringify({ sezona: stav.sezona, hodin: stav.sezonaHodin,
      tick: stav.G.tick, dlazdic: stav.G.tiles.size, frakci: stav.G.factions.length,
      explored: stav.G.explored.size, jeMapa: stav.G.tiles instanceof Map,
      jeSet: stav.G.explored instanceof Set, vzorek: t,
      zlato: stav.G.factions[0].resources, hraci: stav.hraci }));`));
  test("Map se vrátila jako Map, ne jako holý objekt", po.jeMapa);
  test("Set se vrátil jako Set", po.jeSet && po.explored === pred.explored);
  test("tick sedí", po.tick === pred.tick && po.tick === 300);
  test("celá mapa sedí", po.dlazdic === pred.dlazdic && po.dlazdic > 1000);
  test("dlaždice sedí do posledního pole", JSON.stringify(po.vzorek) === JSON.stringify(pred.vzorek));
  test("frakce i jejich suroviny sedí",
    po.frakci === pred.frakci && JSON.stringify(po.zlato) === JSON.stringify(pred.zlato));
  test("metadata sezóny sedí", po.sezona === 7 && po.hodin === 336);
  test("hráči se uložili i s tokenem a účtem",
    po.hraci.length === 1 && po.hraci[0].token === "t1" && po.hraci[0].accKey === "vit");
}

sada("2. Obnova míří do STÁVAJÍCÍHO G");
{
  // game.js si drží G jako vlastní modulovou konstantu, kterou všechny funkce
  // zavírají — kdyby obnova odkaz přepsala, hra by mutovala osiřelý objekt
  const v = vystup(vProcesu(`
    const stav = s.nacti();
    const puvodni = G;
    G.onEvent = () => {};              // hook serveru, ve snímku není
    G.smetiPoMinulem = "tohle má zmizet";
    const vraceno = s.obnovDoG(G, stav.G);
    game.doTick();                     // hra musí umět pokračovat nad obnoveným světem
    console.log("VYSTUP:" + JSON.stringify({
      tentyzObjekt: vraceno === puvodni && G === puvodni,
      hookPrezil: typeof G.onEvent === "function",
      smetiPryc: !("smetiPoMinulem" in G),
      tickPoTiku: G.tick, dlazdic: G.tiles.size }));`));
  test("obnova vrací TÝŽ objekt G (nepřepisuje odkaz)", v.tentyzObjekt);
  test("hook serveru obnovu přežil", v.hookPrezil);
  test("klíče, které ve snímku nejsou, se uklidí", v.smetiPryc);
  test("hra nad obnoveným světem tiká dál", v.tickPoTiku === 301 && v.dlazdic > 1000);
}

sada("3. Sezóna pokračuje, nezačíná znovu");
{
  const v = vystup(vProcesu(`
    const stav = s.nacti();
    s.obnovDoG(G, stav.G);
    game.setSeasonHours(stav.sezonaHodin);
    const pred = G.tick;
    for (let i = 0; i < 50; i++) game.doTick();
    console.log("VYSTUP:" + JSON.stringify({ pred, po: G.tick,
      celkem: game.seasonTicks(), gameOver: G.gameOver }));`));
  test("navazuje se na uložený tik, ne od nuly", v.pred === 300 && v.po === 350);
  test("délka sezóny se vzala ze snímku (336 h)", v.celkem === 336 * 3600);
  test("sezóna nespadla předčasně do konce", v.gameOver === false);
}

sada("4. Poškozený a cizí snímek start nezabijí");
{
  fs.writeFileSync(SNIMEK, Buffer.from("tohle není gzip"));
  const v1 = vystup(vProcesu(`console.log("VYSTUP:" + JSON.stringify({ nacteno: s.nacti() }));`));
  test("poškozený snímek vrátí null místo výjimky", v1.nacteno === null);

  const zlib = require("zlib");
  fs.writeFileSync(SNIMEK, zlib.gzipSync(JSON.stringify({ verze: 999, G: {} })));
  const v2 = vystup(vProcesu(`console.log("VYSTUP:" + JSON.stringify({ nacteno: s.nacti() }));`));
  test("snímek z jiné verze se odmítne", v2.nacteno === null);

  fs.writeFileSync(SNIMEK, zlib.gzipSync(JSON.stringify({ verze: 1, G: { tick: 5 } })));
  const v3 = vystup(vProcesu(`console.log("VYSTUP:" + JSON.stringify({ nacteno: s.nacti() }));`));
  test("snímek bez mapy se odmítne", v3.nacteno === null);

  fs.unlinkSync(SNIMEK);
  const v4 = vystup(vProcesu(`console.log("VYSTUP:" + JSON.stringify({ nacteno: s.nacti(), je: s.existuje() }));`));
  test("chybějící snímek vrátí null", v4.nacteno === null && v4.je === false);
}

sada("5. Úklid a atomický zápis");
{
  const v = vystup(vProcesu(`${ROZEHRAJ}
    s.uloz({ sezona: 1, G, hraci: [] });
    const poUlozeni = s.existuje();
    s.smaz();
    console.log("VYSTUP:" + JSON.stringify({ poUlozeni, poSmazani: s.existuje() }));`));
  test("smaz() snímek opravdu odstraní", v.poUlozeni === true && v.poSmazani === false);
  test("po zápisu nezůstává dočasný soubor",
    !fs.existsSync(SNIMEK + ".tmp") && !fs.readdirSync(tmp).some(f => f.endsWith(".tmp")));
}

sada("6. Stav hry je serializovatelný (hlídá budoucí změny)");
{
  // Kdyby někdo do G přidal funkci, cyklus nebo sdílený odkaz mezi objekty,
  // snímek by se rozpadl AŽ za běhu. Tenhle test to chytne hned.
  game.newGameMulti([{ faction: 0, heroes: [0] }, { faction: 3, heroes: [0] }], 999);
  for (let i = 0; i < 120; i++) game.doTick();
  const { G } = game;
  const potkano = new Set();
  const nalezy = { funkce: [], cyklus: [] };
  (function projdi(v, cesta) {
    if (v === null || typeof v !== "object") return;
    if (potkano.has(v)) { nalezy.cyklus.push(cesta); return; }
    potkano.add(v);
    if (v instanceof Map) { for (const [k, x] of v) projdi(x, cesta + "[" + k + "]"); return; }
    if (v instanceof Set) return;
    if (Array.isArray(v)) { v.forEach((x, i) => projdi(x, cesta + "[" + i + "]")); return; }
    for (const k of Object.keys(v)) {
      if (k === "onEvent") continue;               // jediný povolený hook
      if (typeof v[k] === "function") { nalezy.funkce.push(cesta + "." + k); continue; }
      projdi(v[k], cesta + "." + k);
    }
  })(G, "G");
  if (nalezy.funkce.length) console.log("     funkce v G:", nalezy.funkce.slice(0, 5).join(", "));
  if (nalezy.cyklus.length) console.log("     sdílené/cyklické odkazy:", nalezy.cyklus.slice(0, 5).join(", "));
  test("v G nejsou funkce (kromě onEvent)", nalezy.funkce.length === 0);
  test("v G nejsou cykly ani sdílené odkazy", nalezy.cyklus.length === 0);
}

sada("7. Přírůstkový snímek (etapa 11b)");
{
  // Plný snímek přepisuje celou mapu. Na velkém světě je to vteřiny, přestože
  // se za tik změní řádově nula polí — mezi plnými snímky se proto k souboru
  // jen PŘIPOJÍ řádek se změněnými dlaždicemi a novou hlavičkou.
  process.env.VP_DATA = tmp;
  delete require.cache[require.resolve("../server/sezona.js")];
  const db = require("../server/sezona.js");
  const g = require("../js/game.js");
  g.setMapRadius(34); g.setSeasonHours(1); g.newGame(0, 7, null);
  const hlavicka = () => ({ sezona: 1, sezonaHodin: 1, mapaR: 34, G: g.G,
    ucastnici: [], posta: [], reportyStore: [], poslednyRozeslany: 0, hraci: [] });

  const plny = db.uloz(hlavicka());
  const zmenena = [...g.G.tiles.values()].slice(100, 103);
  for (const t of zmenena) t.garrison = 1234;
  g.G.tick = 50;
  const prirustek = db.ulozZmeny(hlavicka(), zmenena.map(t => [g.keyOf(t.q, t.r), t]));

  const nacteno = db.nacti();
  test("přírůstek je řádově menší než plný snímek", prirustek > 0 && prirustek < plny / 10);
  test("mapa po přírůstku zůstala celá", !!nacteno && nacteno.G.tiles.size === g.G.tiles.size);
  test("přírůstek přebil základ", !!nacteno
    && zmenena.every(t => nacteno.G.tiles.get(g.keyOf(t.q, t.r)).garrison === 1234));
  test("hlavička je z přírůstku, ne ze základu", !!nacteno && nacteno.G.tick === 50);

  // pád uprostřed připojení smí poškodit nejvýš POSLEDNÍ řádek
  const syrove = fs.readFileSync(db.SOUBOR);
  fs.writeFileSync(db.SOUBOR, syrove.slice(0, syrove.length - 12));
  const poUseknuti = db.nacti();
  test("useknutý konec souboru snímek nezahodí",
    !!poUseknuti && poUseknuti.G.tiles.size === g.G.tiles.size);
  db.smaz();
}

sada("8. Plný snímek rozepsaný přes víc tiků (etapa 11b)");
{
  process.env.VP_DATA = tmp;
  delete require.cache[require.resolve("../server/sezona.js")];
  const db = require("../server/sezona.js");
  const g = require("../js/game.js");
  g.setMapRadius(34); g.setSeasonHours(1); g.newGame(0, 11, null);
  const hlavicka = () => ({ sezona: 2, sezonaHodin: 1, mapaR: 34, G: g.G,
    ucastnici: [], posta: [], reportyStore: [], poslednyRozeslany: 0, hraci: [] });
  db.smaz();

  // starý soubor musí zůstat platný, dokud se nový nedopíše
  db.uloz(hlavicka());
  const pred = fs.statSync(db.SOUBOR).size;
  g.G.tick = 5;
  db.zacniPlny(hlavicka());
  test("rozepsaný snímek se ohlásí", db.rozepsanyPlny() === true);
  test("starý soubor se zatím nemění", fs.statSync(db.SOUBOR).size === pred);

  let kroku = 0;
  while (!db.krokPlnyho(1) && kroku < 500) kroku++;
  test("snímek se dopsal po krocích", db.rozepsanyPlny() === false && kroku >= 0);
  const nacteno = db.nacti();
  test("dopsaný snímek má celou mapu", !!nacteno && nacteno.G.tiles.size === g.G.tiles.size);
  test("a nese hlavičku ze začátku zápisu", !!nacteno && nacteno.G.tick === 5);
  db.smaz();
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* uklidí OS */ }

console.log(`\n${proslo} prošlo, ${selhalo} selhalo`);
if (selhalo > 0) process.exit(1);
