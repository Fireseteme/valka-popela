// Etapa 4c (v0.32): vrstva hráč-uvnitř-frakce — dva hráči v jedné frakci
// (zakladatel cid 0 = frakce sama; člen cid 1 s vlastním městem 3×3,
// oddělenou ekonomikou, územím přes t.clen a společnou obranou).
const g = require("../js/game.js");

let proslo = 0, selhalo = 0;
const test = (jmeno, ok) => {
  if (ok) proslo++;
  else { selhalo++; console.log("  ❌ " + jmeno); }
};
const sada = jmeno => console.log("\n=== " + jmeno + " ===");
const kk = g.keyOf;

sada("1. Dva hráči v jedné frakci");
g.newGame(0, 70, [0]);
const G = g.G, f = G.factions[0];
const clen = g.pridejClena(0, "Kamarád");
test("člen vznikl s městem", !!clen && !!clen.capKey);
test("cid 1, id frakce, jméno frakce pro hlášky", clen.cid === 1 && clen.id === 0 && clen.name === f.name);
const mesto = G.tiles.get(clen.capKey);
test("město 3×3 kapitál ve vlastní výseči", mesto.structure === "capital" && mesto.bigSize === 3
  && g.regionOf(mesto) === g.REGION_NAMES[0]);
test("blok města nese t.clen = 1", [mesto, ...mesto.bigKeys.map(k => G.tiles.get(k))]
  .every(m => m.owner === 0 && m.clen === 1));
// ETAPA 7: zakladatel drží navíc svůj PŘECHOD přes dělič kolébky (6 polí),
// člen jen svoje město — proto se počty liší o ten přechod
const prechodu = [...G.tiles.values()].filter(t => t.owner === 0 && !t.clen
  && t.structure === "bridge").length;
test(`území oddělené: zakladatel 9 + přechod ${prechodu}, člen 9`,
  g.pocetPoli(f) === 9 + prechodu && g.pocetPoli(clen) === 9);
test("strop oddělený (oba 80)", g.stropPoli(f) === 80 && g.stropPoli(clen) === 80);

sada("2. Ekonomika běží oběma zvlášť");
const fPred = f.resources.gold, cPred = clen.resources.gold;
for (let i = 0; i < 10; i++) g.doTick();
test("oba berou výnos (zlato roste odděleně)",
  f.resources.gold > fPred && clen.resources.gold > cPred);
test("výnos člena srovnatelný se zakladatelem (ne dvojnásobek)",
  Math.abs((clen.resources.gold - cPred) - (f.resources.gold - fPred)) < 8);

sada("3. Zábor členem nese t.clen");
G.faze = 4;
const h = clen.heroes[0];
let cil = null;
for (const t of G.tiles.values()) {
  if (t.owner !== -1 || t.structure || t.big || t.bigSize || t.riv) continue;
  if (!["plains", "forest", "hills", "ruins"].includes(t.terrain)) continue;
  const d = Math.abs(t.q - mesto.q) + Math.abs(t.r - mesto.r);
  if (d >= 1 && d <= 4 && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dq, dr]) => {
    const n = G.tiles.get(kk(t.q + dq, t.r + dr));
    return n && n.owner === 0;
  })) { cil = t; break; }
}
test("cíl u města nalezen", !!cil);
h.pos = null; h.stamina = 120; h.cooldown = 0; h.level = 8; // velení ~305
clen.units = { inf: 1668, arch: 0, cav: 0 };   // ETAPA 6: měřítko ×5,56
// armádu musí unést velitel: strop velení je 300 na 1. úrovni a 5 200 na 50.
clen.heroes[0].level = 50; clen.resources.gold = 9999;
test("člen vysílá útok", g.startMarch(clen, cil, { inf: 1557, arch: 0, cav: 0 }, 0));
clen.marches.find(m => m.kind === "attack").ticksLeft = 1;
g.doTick();
test("dobyté pole patří členovi (t.clen 1)", cil.owner === 0 && cil.clen === 1);
test("pocetPoli člena vzrostl, zakladatele ne",
  g.pocetPoli(clen) >= 10 && g.pocetPoli(f) === 9 + prechodu);

sada("4. Obrana je společná, zásoba města vlastní");
const fh = f.heroes[0];
// ETAPA 6: hrdina se do stohu počítá až od OBRANA_MIN_CP (prázdný batoh nebrání)
fh.pos = kk(cil.q, cil.r); fh.army = { inf: 50, arch: 0, cav: 0 };
test("spoluhráč pod prahem obrany se nezapočítá",   // pole už brání hrdina člena
  !g.tileDefComponents(cil).contributors.some(c => c.faction === f));
fh.army = { inf: 150, arch: 0, cav: 0 };
const comp = g.tileDefComponents(cil);
test("spoluhráčův hrdina se počítá do obrany členova pole",
  comp.contributors.some(c => c.faction === f) && g.armyTotal(comp.army) >= 150);
fh.pos = null; fh.army = { inf: 0, arch: 0, cav: 0 };
const compM = g.tileDefComponents(mesto);
test("město člena brání JEHO zásoba (homeFaction = člen)", compM.homeFaction === clen);

sada("5. Prsten, strop a diplomacie");
clen.ring.body = 1;
g.ringLearn(clen, "nadvlada");
test("strom člena nezasáhl zakladatele",
  g.stropPoli(clen) === 90 && g.stropPoli(f) === 80);
test("declareWar od člena zapisuje válku FRAKCI",
  (G.tick < (f.valkaCd || 0) ? true : (g.declareWar(clen, 2), !!f.valky[2])));
let jsonOk = true;
try { JSON.stringify(G.factions); } catch (e) { jsonOk = false; }
test("frakce s členem projde JSON.stringify", jsonOk);

console.log(`\n${proslo} prošlo, ${selhalo} selhalo`);
if (selhalo) process.exit(1);
