// KLANOVÁ BURZA (etapa 9, IV-F + IV-R): pravidla přihrádek, ceník a hlavně
// ÚSCHOVA. Ta je z celé burzy nejrizikovější — musí přežít restart a vrátit se
// PRÁVĚ JEDNOU, jinak je z burzy tiskárna jader.
//
// Test si zakládá vlastní databázi v dočasném adresáři (VP_DATA se MUSÍ nastavit
// PŘED require serverových modulů — cestu si berou při načtení), takže na ostrá
// data nesahá a nepotřebuje běžící server.
const fs = require("fs"), os = require("os"), path = require("path");
process.env.VP_DATA = fs.mkdtempSync(path.join(os.tmpdir(), "vp-burza-"));

const g = require(__dirname + "/../js/game.js");
const uctyDb = require(__dirname + "/../server/ucty.js");
const burza = require(__dirname + "/../server/burza.js");

let proslo = 0, selhalo = 0;
const test = (jmeno, ok) => {
  if (ok) proslo++;
  else { selhalo++; console.log("  ❌ " + jmeno); }
};
const sada = jmeno => console.log("\n=== " + jmeno + " ===");

// ---------- scéna ----------
uctyDb.nacti(g.migrateAccount);
g.setSeasonHours(1);
g.newGame(0, 42, null);
burza.nacti(uctyDb, () => g.G);

const A = g.G.factions[0];                  // aktér prodávajícího (zakladatel)
const B = g.pridejClena(0, "Kupec");        // aktér kupujícího (člen)
const klan = g.zalozKlan(A, "Popelní jezdci");
g.prijmiDoKlanu(A, B.cid);

function ucet(klic, jmeno) {
  const a = { ...g.emptyAccount(jmeno), cores: 100000, inventory: [], darky: {} };
  uctyDb.pridej(klic, a);
  return a;
}
// ⚠ let, ne const: sada 9 databázi zavře a otevře, čímž se účty načtou jako
// NOVÉ objekty — bez přepsání referencí by testy dál sahaly na mrtvé kopie
let uA = ucet("prodavajici", "Prodavajici");
let uB = ucet("kupujici", "Kupujici");
const START_JADER = uA.cores + uB.cores;

let idKus = 0;
function kus(rarity = 3) {
  return { id: "it" + (++idKus), slot: "weapon", name: "Čepel " + idKus, rarity, value: 10 };
}
function dejKus(acc, rarity = 3) { const k = kus(rarity); acc.inventory.push(k); return k; }
function bohatyAkter(a) {
  for (const k of g.RES_KEYS) a.resources[k] = 100000;
  a.resources.gold = 100000;
}
bohatyAkter(A); bohatyAkter(B);
// eskalace poplatku by čísla v testech měnila každým obchodem — vypni ji tím,
// že se počítadlo dne před každým měřením nuluje
const bezEskalace = () => { for (const u of [uA, uB]) { u.burzaDen = ""; u.burzaPocet = 0; } };

sada("1. Ceník: jádra za kus podle tieru, suroviny 15 % z objemu OBOU stran");
{
  const p1 = g.burzaPoplatek({ prihradka: "vybava", chce: { rarita: 2, pocet: 1 } });
  const p2 = g.burzaPoplatek({ prihradka: "vybava", chce: { rarita: 3, pocet: 1 } });
  const p3 = g.burzaPoplatek({ prihradka: "vybava", chce: { rarita: 4, pocet: 1 } });
  test("běžný kus 6 jader", p1.mena === "cores" && p1.celkem === 6);
  test("epický kus 12 jader", p2.celkem === 12);
  test("legendární kus 24 jader", p3.celkem === 24);
  test("půlka vždy vyjde celá", [6, 12, 24].every(x => x % 2 === 0));

  const s = g.burzaPoplatek({ prihradka: "suroviny", dava: { stone: 100 }, chce: { wood: 200 } });
  test("suroviny 15 % ze SOUČTU obou stran", s.mena === "gold" && s.celkem === 45);
  const z = g.burzaPoplatek({ prihradka: "suroviny", dava: { stone: 1 }, chce: { wood: 1 } });
  test("zaokrouhluje se NAHORU (drobný obchod poplatek neobejde)", z.celkem === 1);

  const d = g.burzaPoplatek({ prihradka: "darky", chce: { tier: 2, pocet: 3 } });
  test("dárky za kus × počet", d.celkem === 72);
}

sada("2. Eskalace: každý další obchod dne stojí víc");
{
  bezEskalace();
  const nab = { prihradka: "vybava", chce: { rarita: 4, pocet: 1 } };
  const den = g.dnesniDen();
  test("první obchod dne = půlka poplatku", g.burzaPulka(nab, uA, den).castka === 12);
  uA.burzaDen = den; uA.burzaPocet = 1;
  test("druhý stojí 1,5×", g.burzaPulka(nab, uA, den).castka === 18);
  uA.burzaPocet = 3;
  test("čtvrtý stojí 2,5×", g.burzaPulka(nab, uA, den).castka === 30);
  uA.burzaDen = "1999-01-01";
  test("jiný den počítadlo neplatí", g.burzaPulka(nab, uA, den).castka === 12);
  bezEskalace();
}

sada("3. Pravidla přihrádek — mezi nimi se nemění");
{
  test("neznámá přihrádka neprojde", !!g.burzaZkontroluj({ prihradka: "vse", dava: {}, chce: {} }));
  test("suroviny nejméně 1:1",
    !!g.burzaZkontroluj({ prihradka: "suroviny", dava: { stone: 100 }, chce: { wood: 50 } }));
  test("přeplatit smíš",
    !g.burzaZkontroluj({ prihradka: "suroviny", dava: { stone: 100 }, chce: { wood: 150 } }));
  test("výbava jen za stejnou raritu",
    !!g.burzaZkontroluj({ prihradka: "vybava", dava: { item: kus(3) }, chce: { rarita: 4 } }));
  test("stejná rarita projde",
    !g.burzaZkontroluj({ prihradka: "vybava", dava: { item: kus(3) }, chce: { rarita: 3 } }));
  test("dárky kus za kus téhož tieru",
    !g.burzaZkontroluj({ prihradka: "darky", dava: { skupina: "aldar:t1", pocet: 3 },
      chce: { tier: 1, pocet: 3 } }));
  test("jiný tier neprojde",
    !!g.burzaZkontroluj({ prihradka: "darky", dava: { skupina: "aldar:t1", pocet: 3 },
      chce: { tier: 2, pocet: 3 } }));
  test("jiný počet neprojde",
    !!g.burzaZkontroluj({ prihradka: "darky", dava: { skupina: "aldar:t1", pocet: 3 },
      chce: { tier: 1, pocet: 5 } }));
}

sada("4. Vystavení: úschova se strhne HNED a je vidět");
{
  bezEskalace();
  const k = dejKus(uA, 4);
  const pred = uA.cores, kusuPred = uA.inventory.length;
  const r = burza.vystav("prodavajici", A, {
    prihradka: "vybava", dava: { itemId: k.id }, chce: { rarita: 4, pocet: 1 },
  }, Date.now());
  test("nabídka vznikla", r.ok && r.id > 0);
  test("půlka poplatku je pryč z účtu", uA.cores === pred - 12);
  test("kus je pryč ze zásoby", uA.inventory.length === kusuPred - 1);
  test("zablokovaná jádra jsou vidět", burza.vNabidkach("prodavajici") === 12);
  test("nabídku vidí klan", burza.seznam("kupujici", B).some(n => n.id === r.id));
  // úklid pro další sady
  burza.zrus(r.id, "prodavajici");
  test("po zrušení je zase všechno zpátky",
    uA.cores === pred && uA.inventory.length === kusuPred
    && burza.vNabidkach("prodavajici") === 0);
}

sada("5. Bez klanu a bez majetku to neprojde");
{
  bezEskalace();
  const samotar = g.pridejClena(0, "Samotar");
  bohatyAkter(samotar);
  const u = ucet("samotar", "Samotar");
  const k = dejKus(u, 3);
  const r = burza.vystav("samotar", samotar, {
    prihradka: "vybava", dava: { itemId: k.id }, chce: { rarita: 3, pocet: 1 } }, Date.now());
  test("bez klanu burza nejede", !!r.error);
  test("a nic se nestrhlo", u.inventory.length === 1 && u.cores === 100000);

  const chudy = ucet("chudy", "Chudy");
  chudy.cores = 5;
  g.prijmiDoKlanu(A, 0);   // no-op, jen pro jistotu
  const k2 = dejKus(chudy, 4);
  // chudák je aktér A? ne — použijeme aktéra B, ale účet chudého
  const r2 = burza.vystav("chudy", B, {
    prihradka: "vybava", dava: { itemId: k2.id }, chce: { rarita: 4, pocet: 1 } }, Date.now());
  test("bez jader na poplatek nabídka nevznikne", !!r2.error);
  test("a KUS ZŮSTAL v zásobě (transakce se vrátila)", chudy.inventory.length === 1);
  test("i jádra zůstala", chudy.cores === 5);
}

sada("6. Přijetí: zboží se vymění právě jednou, poplatek shoří");
{
  bezEskalace();
  const kA = dejKus(uA, 3), kB = dejKus(uB, 3);
  const coresPred = uA.cores + uB.cores;
  const r = burza.vystav("prodavajici", A, {
    prihradka: "vybava", dava: { itemId: kA.id }, chce: { rarita: 3, pocet: 1 } }, Date.now());
  test("nabídka vystavena", r.ok);
  const p = burza.prijmi(r.id, "kupujici", B, { itemId: kB.id });
  test("obchod proběhl", p.ok);
  test("kupující má kus prodávajícího", uB.inventory.some(x => x.name === kA.name));
  test("prodávající má kus kupujícího", uA.inventory.some(x => x.name === kB.name));
  test("poplatek shořel oběma (2× 6 jader)", uA.cores + uB.cores === coresPred - 12);
  const p2 = burza.prijmi(r.id, "kupujici", B, { itemId: kB.id });
  test("podruhé už to nejde", !!p2.error);
  test("a nic se nezdvojilo", uB.inventory.filter(x => x.name === kA.name).length === 1);
  test("zrušit přijatou nabídku nejde", !!burza.zrus(r.id, "prodavajici").error);
}

sada("7. Suroviny: protiplnění, poplatek ve zlatě, sezónnost");
{
  bezEskalace();
  const zlatoA = A.resources.gold, zlatoB = B.resources.gold;
  const kamenA = A.resources.stone, drevoB = B.resources.wood;
  const r = burza.vystav("prodavajici", A, {
    prihradka: "suroviny", dava: { stone: 100 }, chce: { wood: 100 } }, Date.now());
  test("nabídka vznikla", r.ok);
  test("kámen je v úschově", A.resources.stone === kamenA - 100);
  test("půlka poplatku ve zlatě pryč", A.resources.gold === zlatoA - 15);
  const p = burza.prijmi(r.id, "kupujici", B, { wood: 100 });
  test("obchod proběhl", p.ok);
  test("kupující dostal kámen", B.resources.stone > 0);
  test("prodávající dostal dřevo", A.resources.wood > 0);
  test("kupující zaplatil dřevem i zlatem",
    B.resources.wood === drevoB - 100 && B.resources.gold === zlatoB - 15);
  test("málo surovin protiplnění neprojde",
    !!burza.prijmi(r.id, "kupujici", B, { wood: 1 }).error);
}

sada("8. ÚSCHOVA SE VRACÍ PRÁVĚ JEDNOU (spam cancel/accept přes sebe)");
{
  bezEskalace();
  const pred = uA.cores + uB.cores;
  let spaleno = 0, obchodu = 0;
  // deterministické „náhodné" pořadí operací
  let seed = 12345;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;

  for (let i = 0; i < 200; i++) {
    bezEskalace();                       // ať je poplatek pořád 6 jader
    const kA = dejKus(uA, 3), kB = dejKus(uB, 3);
    const r = burza.vystav("prodavajici", A, {
      prihradka: "vybava", dava: { itemId: kA.id }, chce: { rarita: 3, pocet: 1 } }, Date.now());
    if (!r.ok) { selhalo++; console.log("  ❌ nabídka " + i + " nevznikla: " + r.error); break; }
    // pět operací přes sebe v náhodném pořadí — vyhrát smí právě jedna
    const operace = [
      () => burza.zrus(r.id, "prodavajici"),
      () => burza.zrus(r.id, "prodavajici"),
      () => burza.prijmi(r.id, "kupujici", B, { itemId: kB.id }),
      () => burza.prijmi(r.id, "kupujici", B, { itemId: kB.id }),
      () => burza.vyprsele(Date.now() + 999 * 86400000),
    ];
    for (let j = operace.length - 1; j > 0; j--) {
      const x = Math.floor(rnd() * (j + 1));
      [operace[j], operace[x]] = [operace[x], operace[j]];
    }
    let prijato = false;
    for (const op of operace) { const v = op(); if (v && v.ok && !prijato && v.nabidka) prijato = true; }
    // po přijetí shoří 2× 6 jader; jinak se úschova vrátí celá
    const stav = burza.radek(r.id).stav;
    if (stav === "prijata") { spaleno += 12; obchodu++; }
  }
  const po = uA.cores + uB.cores;
  test(`součet jader sedí na jednotku (${pred} → ${po}, shořelo ${spaleno}, obchodů ${obchodu})`,
    po === pred - spaleno);
  test("aspoň jeden obchod se povedl", obchodu > 0);
  test("aspoň jedna nabídka skončila zrušením", obchodu < 200);
  test("žádná nabídka nezůstala vystavená",
    burza.seznam("prodavajici", A).length === 0);
}

sada("9. Vypršení vrací úschovu a přežije restart databáze");
{
  bezEskalace();
  const k = dejKus(uA, 4);
  const pred = uA.cores;
  const r = burza.vystav("prodavajici", A, {
    prihradka: "vybava", dava: { itemId: k.id }, chce: { rarita: 4, pocet: 1 } },
    Date.now() - 999 * 86400000);   // vznikla dávno → už vypršela
  test("nabídka vznikla", r.ok);
  test("jádra jsou v úschově", uA.cores === pred - 12);
  const n = burza.vyprsele(Date.now());
  test("vypršela právě jedna", n === 1);
  test("úschova se vrátila", uA.cores === pred);
  test("kus se vrátil do zásoby", uA.inventory.some(x => x.name === k.name));
  test("podruhé už není co vracet", burza.vyprsele(Date.now()) === 0);

  // restart: nabídka i úschova musí přežít zavření a otevření databáze
  const k2 = dejKus(uA, 4);
  const r2 = burza.vystav("prodavajici", A, {
    prihradka: "vybava", dava: { itemId: k2.id }, chce: { rarita: 4, pocet: 1 } }, Date.now());
  uctyDb.uloz(true);
  uctyDb.zavri();
  uctyDb.nacti(g.migrateAccount);
  burza.nacti(uctyDb, () => g.G);
  uA = uctyDb.ucty["prodavajici"]; uB = uctyDb.ucty["kupujici"];  // nové objekty!
  test("nabídka přežila restart", !!burza.radek(r2.id) && burza.radek(r2.id).stav === "vystavena");
  test("zablokovaná jádra přežila restart", burza.vNabidkach("prodavajici") === 12);
  const predVratkou = uA.cores;
  const z = burza.zrus(r2.id, "prodavajici");
  test("po restartu jde úschovu vrátit", z.ok && uA.cores === predVratkou + 12);
  test("a kus se vrátil taky", uA.inventory.some(x => x.name === k2.name));
}

sada("10. Cizí klan a mířená nabídka");
{
  bezEskalace();
  const kA = dejKus(uA, 3), kB = dejKus(uB, 3);
  const r = burza.vystav("prodavajici", A, {
    prihradka: "vybava", dava: { itemId: kA.id }, chce: { rarita: 3, pocet: 1 },
    komu: "nekdo-jiny" }, Date.now());
  test("mířená nabídka vznikla", r.ok);
  test("cizímu ji přijmout nejde", !!burza.prijmi(r.id, "kupujici", B, { itemId: kB.id }).error);
  test("v seznamu klanu se neukáže", !burza.seznam("kupujici", B).some(n => n.id === r.id));
  test("majitel ji vidí vždycky", burza.seznam("prodavajici", A).some(n => n.id === r.id));
  test("vlastní nabídku si nepřijmeš",
    !!burza.prijmi(r.id, "prodavajici", A, { itemId: kA.id }).error);
  burza.zrus(r.id, "prodavajici");
}

// úklid dočasné databáze
try { uctyDb.zavri(); } catch (e) {}
try { fs.rmSync(process.env.VP_DATA, { recursive: true, force: true }); } catch (e) {}

console.log(`\n${proslo} prošlo, ${selhalo} selhalo`);
if (selhalo) process.exit(1);
