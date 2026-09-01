// Test parametrizace velikosti mapy (v0.33, etapa 4d).
// Hlídá: 1) BYTE-IDENTITU výchozí mapy — hashe zamrazené před refaktorem
// (jakýkoli posun rng tahů v genMap je rozbije, i kdyby čísla vyšla stejně);
// 2) invarianty světa na VĚTŠÍ mapě (MAP_R 51 → 103×103); 3) návrat na 34.
const crypto = require("crypto");
const g = require("../js/game.js");

let prošlo = 0, selhalo = 0;
const test = (jmeno, ok) => {
  if (ok) { prošlo++; }
  else { selhalo++; console.log("  ❌ " + jmeno); }
};
const sada = jmeno => console.log("\n=== " + jmeno + " ===");
const key = (q, r) => q + "," + r;

const hashMapy = seed => {
  g.newGame(0, seed, null);
  const tiles = [...g.G.tiles.values()]
    .sort((a, b) => a.q - b.q || a.r - b.r)
    .map(t => JSON.stringify(t, Object.keys(t).sort()));
  return crypto.createHash("sha256").update(tiles.join("\n")).digest("hex").slice(0, 16);
};

// Otisky výchozí mapy — kotvy. Kdo je mění, přegenerovává všem hráčům svět
// a přeskládává sim seedy, takže se mění jen VĚDOMĚ se změnou generátoru.
// Přepsáno v0.41 (29. 8. 2026): úhlopříčné mosty se posunuly o pás blíž k vodě
// (v0.40 stály dvě pole na suchu). Předchozí sady — v0.40: 4aed2cc37db1662d /
// 85eac9b74610aece / 93e272c168c91d3f; v0.33: 1f4dadd2aff0314a /
// 26de95de4a42ec4b / 8b441f9a4b04212f.
// Přepsáno v ETAPĚ 6 (30. 8. 2026): rebase velení zvedl posádky polí 5,56×
// a posádka je součástí dlaždice, takže se změnil otisk každé mapy. Sada
// před etapou 6 — 071e0712caed56e7 / 700923bfefb9b760 / 7b55a578a6edb6e4.
// Přepsáno v ETAPĚ 7 (30. 8. 2026): laterální crossingy se posunuly z kolébek
// do expanzního pásu (osový q 24 → 20, úhlopříčný břeh (17,15) → (15,13)) —
// dřív most vedl do nedotknutelné zóny a laterální PvP nešlo vůbec. Sada
// před etapou 7 — ef65c9a5ccf8b1ba / 2b81a7d36220a9ad / 371ab57b9d1545a8;
// mezikrok s osmiúhelníkovým děličem — 51f052a1a23678da / 76f1c05e513d9561 /
// dc4c420d146f45a3.
// Přepsáno ETAPOU 7 (31. 8. 2026): svobodná města nahradily KEEPY KRAJŮ.
// Umístění keepů rng NEBERE, ale zrušená smyčka měst brala — proud losů se
// tím posunul a přegeneroval všechny mapy. Sada před keepy —
// ae5d940dad2f416f / 2387d76cfef90ae8 / 66d66eb96c2e110a.
// Přepsáno DĚLIČEM KOLÉBKY (31. 8. 2026): prstencová řeka na kolebkaR
// a osm třípolových přechodů přes ni. Sada před děličem —
// 641d75a44a0789b2 / 04284b2014125eb4 / 6124b553c45fd69d.
// v0.63 (POBŘEŽÍ): nejzazší prstenec je moře a nedosažitelné kapsy se zatopily,
// takže se otisky mění počtvrté. Předchozí sady:
//   v0.55 dělič:  42: f69e04e73773fc72, 355: a4bf51bfd19d9935, 1042: 26cdf0a78c01a065
// v0.69, dvě změny generátoru najednou (otisky se tím mění POPÁTÉ):
//
//  1. HRADBA + PŘÍKOP místo jedné řady zdi. Jedinou řadu šlo obejít ROHEM hned
//     vedle brány — úhlopříčný krok mění Manhattan o 0 nebo ±2, takže jednu
//     vrstvu přeskočil a pevnost přestala být jediným průchodem k Trůnu.
//     Druhá řada je voda, ne zeď: dvě zdi za sebou vypadají jako dvě zdi,
//     kdežto zeď s příkopem čte jako jedna hradba.
//  2. TŘI PŘECHODY PŘES DĚLIČ se rozhodily po svém úseku řeky (každý v jedné
//     třetině, uvnitř třetiny náhodně) místo tří polí vedle sebe. Losuje se ze
//     seedu světa, takže se přechody mění sezónu od sezóny — proto se BRIDGE_KEYS
//     přestavují na začátku genMap, ne jen v setMapRadius.
//
// Předchozí sady — v0.63 pobřeží: 42: 9aac0a9ef6a75d28, 355: 6d8745f4392dc188,
// 1042: 77f37f0ede4c4dcd; mezikrok se dvěma řadami zdi: 40baa040c45b0053 /
// cb4204f57a04ded4 / 4ee390936c850061.
//  3. PŘECHODY PŘES DĚLIČ JSOU NEUTRÁLNÍ (zadání uživatele): vnitřní břeh
//     se musí nejdřív dobýt, vnější zůstává rodu. Mění to vlastníka i posádku
//     šesti polí na výseč, takže otisky znovu.
// Předchozí sada (hradba+příkop a rozhozené přechody, ještě vlastněné):
//   42: 5c1e718978d0c938, 355: 82005eda02a4fa2c, 1042: dffd482d6ef1dac1
const KOTVY = { 42: "53ddf2ddcc709820", 355: "db5aa62e8dcec7a3", 1042: "04c98b365a8c84fb" };

sada("1. Byte-identita výchozí mapy (MAP_R 34)");
for (const s of [42, 355, 1042])
  test(`seed ${s} beze změny`, hashMapy(+s) === KOTVY[s]);
g.setMapRadius(34); // explicitní setter musí dát tutéž geometrii jako výchozí stav
test("setMapRadius(34): hash seed 42 sedí i po přepočtu", hashMapy(42) === KOTVY[42]);
test("odvození 34: WALL 8, OUTER 16, REACH 20", g.MAP_R === 34 && g.WALL_R === 8 && g.OUTER_R === 16 && g.REACH === 20);
test("odvození 34: kapitál aldaru (23,9)", g.CAPITAL_POS[0].q === 23 && g.CAPITAL_POS[0].r === 9);
// ETAPA 7: přechody leží v EXPANZNÍM pásu — osový zůstal na q = 24,
// úhlopříčný se posunul z (17,15) na (14,12), protože ten ležel v kolébce
test("odvození 34: osový přechod na 24 má oba břehy",
  g.BRIDGE_KEYS.includes("24,-2") && g.BRIDGE_KEYS.includes("24,2"));
test("odvození 34: úhlopříčný přechod na (14,12)/(12,14)",
  g.BRIDGE_KEYS.includes("14,12") && g.BRIDGE_KEYS.includes("12,14"));
// ⚠ Platí jen pro LATERÁLNÍ crossingy (mezi výsečemi). Přechod přes DĚLIČ
// KOLÉBKY má vnější břeh schválně v kolébce — tím spojuje domov s expanzí.
test("žádný laterální crossing neleží v kolébce", g.BRIDGE_KEYS.every(k => {
  if (g.KOLEBKA_MOSTY.has(k)) return true;   // klíče děliče, mapa tu ještě není
  const [q, r] = k.split(",").map(Number);
  return Math.abs(q) + Math.abs(r) <= g.kolebkaR();
}));

sada("2. Větší svět (MAP_R 51 → 103×103)");
g.setMapRadius(51);
test("odvození 51: WALL 12, OUTER 24, REACH 30", g.WALL_R === 12 && g.OUTER_R === 24 && g.REACH === 30);
g.newGame(0, 42, null);
const G = g.G;
const at = (q, r) => G.tiles.get(key(q, r));
const T = [...G.tiles.values()];
const PRUCHOZI = { plains: 1, forest: 1, hills: 1, ruins: 1, bridge: 1 };
const pass = t => t && PRUCHOZI[t.terrain];
test("103×103 = 10609 polí", T.length === 10609);
test("8 kapitálů na Manhattan 48", g.CAPITAL_POS.length === 8
  && g.CAPITAL_POS.every(c => Math.abs(c.q) + Math.abs(c.r) === 48)
  && g.CAPITAL_POS.every((c, i) => at(c.q, c.r).structure === "capital" && at(c.q, c.r).owner === i));
test("trůn 3×3 ve středu", at(0, 0).structure === "throne" && at(0, 0).bigSize === 3);
const cnt = {};
for (const t of T) if (t.structure) cnt[t.structure] = (cnt[t.structure] || 0) + 1;
test("4 pevnosti, 8 grandfortů, 32 bastionů", cnt.fortress === 4 && cnt.grandfort === 8 && cnt.bastion === 32);
// v0.40: 8 přechodů × 2 břehy = 16 mostních polí, všechna na souši
// ETAPA 7: 8 laterálních přechodů (16 polí) + dělič kolébky (8 × 3 páry = 48)
const kolebkovych = g.BRIDGE_KEYS.filter(k => g.KOLEBKA_MOSTY.has(k)).length;
test("8 laterálních přechodů = 16 polí", g.BRIDGE_KEYS.length - kolebkovych === 16);
test("dělič kolébky = 48 mostních polí i na velké mapě", kolebkovych === 48);
test("všechna mostní pole jsou mosty", cnt.bridge === g.BRIDGE_KEYS.length
  && g.BRIDGE_KEYS.every(k => G.tiles.get(k) && G.tiles.get(k).terrain === "bridge"));
// ETAPA 7: města jsou pryč, na každý kraj patří jeden keep — a devět krajů
// má svět v každé velikosti, takže se počet s plochou NEMĚNÍ (mění se velikost
// bloku a to, jak snadno se 5×5 vejde)
test("každý z devíti krajů má keep i na velké mapě", (cnt.keep || 0) === 9);
test("svobodná města se negenerují", !cnt.city);

// v0.40: dvojice břehů (zrcadlo test-mapa, ale na odvozených klíčích) —
// každý most má protějšek přes vodu a ústí na souš své strany
let brehyOk = true, parySedi = true, uVody = true, sirkyOk = true;
for (const bk of g.BRIDGE_KEYS) {
  const b = G.tiles.get(bk);
  const twin = g.bridgeTwin(b);
  if (!twin || twin.structure !== "bridge" || !g.neighborsOf(b).includes(twin)) parySedi = false;
  const okoli = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(d => at(b.q + d[0], b.r + d[1]));
  if (!okoli.some(n => n && pass(n) && n.structure !== "bridge")) brehyOk = false;
  // v0.41: most stojí NA BŘEHU, ne dvě pole na suchu
  if (!okoli.some(n => n && n.terrain === "water")) uVody = false;
  const dq = twin.q - b.q, dr = twin.r - b.r;
  const sirka = Math.hypot(dq - dr, dq + dr);   // ve světových osách, v DIAG
  if (Math.abs(sirka - (b.riv === "a" || b.riv === "b" ? 4 : 4 * Math.SQRT2)) > 1e-9) sirkyOk = false;
}
test("každý most ústí na souš svého břehu", brehyOk);
test("dvojice mostů jsou spojené přes vodu", parySedi);
test("každý most stojí u vody", uVody);
test("přechody mají jen dvě šířky (délka lávky je v modelu)", sirkyOk);

// Souvislost: z trůnu se po souši dojde ke všem kapitálům.
// ⚠ MUSÍ jít přes neighborsOf — mostní dvojice leží čtyři pole od sebe
// a spojuje je až bridgeTwin. S děličem kolébky je to jediná cesta domů.
const flood = (sq, sr) => {
  const seen = new Set([key(sq, sr)]);
  const st = [at(sq, sr)];
  while (st.length) {
    const t = st.pop();
    for (const n of g.neighborsOf(t)) {
      if (n && pass(n) && !seen.has(key(n.q, n.r))) { seen.add(key(n.q, n.r)); st.push(n); }
    }
  }
  return seen;
};
const dosah = flood(0, 0);
test("všechny kapitály dosažitelné z trůnu", g.CAPITAL_POS.every(c => dosah.has(key(c.q, c.r))));

// invarianty žil drží i na velké mapě (zrcadlo test-mapa sady uzlů)
test("žádné holé 1×1 pole stupně 9+", !T.some(t =>
  t.level >= 9 && !t.structure && !t.big && !t.bigSize && PRUCHOZI[t.terrain]));
let uzlyVedleSebe = false;
// kotva 2×2 souseda: klíč jeho bloku, nebo null, když v žádném uzlu není
const kotvaUzlu = n => n.bigSize === 2 ? key(n.q, n.r)
  : (n.big && (G.tiles.get(n.big) || {}).bigSize === 2 ? n.big : null);
for (const t of T) {
  if (t.bigSize !== 2) continue;
  const moje = key(t.q, t.r);
  for (const m of [t, at(t.q + 1, t.r), at(t.q, t.r + 1), at(t.q + 1, t.r + 1)]) {
    if (!m) continue;
    for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = at(m.q + dq, m.r + dr);
      if (n && kotvaUzlu(n) && kotvaUzlu(n) !== moje) uzlyVedleSebe = true;
    }
  }
}
test("uzly 2×2 nesousedí", !uzlyVedleSebe);
test("zóny sedí na odvozených prstencích", g.zonaOf(at(0, 2)) === "vnitrek"
  && g.zonaOf(at(20, 0)) === "mezikruzi"
  // ETAPA 7: výseč se dělí na kolébku (dál od středu, s kapitálem) a expanzi
  && /^(kolebka|expanze)-[0-9]+$/.test(g.zonaOf(at(40, 2))));

sada("3. Návrat na výchozí velikost");
g.setMapRadius(34);
test("hash seed 42 po návratu sedí", hashMapy(42) === KOTVY[42]);

console.log(`\n${prošlo} prošlo, ${selhalo} selhalo`);
if (selhalo) process.exitCode = 1;
