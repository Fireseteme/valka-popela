// Prstencový dělič kolébky (etapa 7, IV-K): řeka po vrstevnici kolebkaR
// a osm přechodů přes ni — jeden na výseč, tři pole široký.
const g = require("../js/game.js");

let proslo = 0, selhalo = 0;
const test = (jmeno, ok) => {
  if (ok) proslo++;
  else { selhalo++; console.log("  ❌ " + jmeno); }
};
const sada = jmeno => console.log("\n=== " + jmeno + " ===");
const kk = g.keyOf;
const pass = t => t && g.TERRAIN[t.terrain].passable;

sada("1. Dělič odděluje kolébku od expanze");
{
  g.newGame(0, 42, null);
  const G = g.G;
  // ⚠ Sousedství se počítá přes neighborsOf (mosty spojují protilehlé břehy),
  // takže „průsak" hledáme mezi POLI, ne přes přechody.
  let prusaky = 0;
  for (const t of G.tiles.values()) {
    const z = g.zonaOf(t);
    if (!z.startsWith("kolebka-") || !pass(t) || t.structure === "bridge") continue;
    for (const n of g.neighborsOf(t)) {
      if (!pass(n) || n.structure === "bridge") continue;
      if (g.zonaOf(n) === "expanze-" + z.slice(8)) prusaky++;
    }
  }
  test(`z kolébky se ven nedá jinudy než přechodem (průsaků ${prusaky})`, prusaky === 0);

  // a přesto je svět souvislý — přes mostní dvojice
  const flood = (sq, sr) => {
    const seen = new Set([kk(sq, sr)]);
    const st = [G.tiles.get(kk(sq, sr))];
    while (st.length) {
      const t = st.pop();
      for (const n of g.neighborsOf(t)) {
        if (!pass(n)) continue;
        const k = kk(n.q, n.r);
        if (!seen.has(k)) { seen.add(k); st.push(n); }
      }
    }
    return seen;
  };
  const R = flood(0, 0);
  test("všech 8 kapitálů je z trůnu dosažitelných",
    g.CAPITAL_POS.every(c => R.has(kk(c.q, c.r))));
}

sada("2. Jeden přechod na výseč, tři pole široký");
{
  for (const seed of [42, 355, 668]) {
    g.newGame(0, seed, null);
    const kol = [...g.G.tiles.values()].filter(t => g.jeKolebkovyMost(t));
    test(`seed ${seed}: 8 výsečí × 3 páry × 2 břehy = 48 polí (má ${kol.length})`,
      kol.length === 48);
    const perVysec = {};
    for (const t of kol) {
      const o = g.oktantOf(t.q, t.r);
      perVysec[o] = (perVysec[o] || 0) + 1;
    }
    test(`seed ${seed}: každá výseč má právě jeden přechod (6 polí)`,
      Object.keys(perVysec).length === 8 && Object.values(perVysec).every(n => n === 6));
  }
}

sada("3. Přechod se musí dobýt a spojuje kolébku s expanzí");
{
  g.newGame(0, 42, null);
  const kol = [...g.G.tiles.values()].filter(t => g.jeKolebkovyMost(t));
  const vKolebce = t => Math.abs(t.q) + Math.abs(t.r) > g.kolebkaR();
  // v0.69 (zadání uživatele): vylézt z kolébky je PRVNÍ OBJEKTIV sezóny.
  // Neutrální je vnitřní břeh — ten v expanzním pásu; vnější leží
  // v nedotknutelné kolébce, kam cizí rod nevstoupí, takže patří rodu.
  test("vnější břeh (v kolébce) patří své výseči",
    kol.filter(vKolebce).every(t => t.owner === g.oktantOf(t.q, t.r) && t.garrison === 0));
  test("vnitřní břeh je neutrální a brání se",
    kol.filter(t => !vKolebce(t)).every(t => t.owner === -1
      && t.garrison === g.KOLEBKA_MOST_MILICE));
  test("na výseč vychází tři neutrální břehy",
    kol.filter(t => !vKolebce(t)).length === 24);
  // vnější břeh leží v kolébce, vnitřní v expanzi — proto ten přechod vůbec je
  let dvojicOk = true;
  for (const t of kol) {
    const twin = g.bridgeTwin(t);
    if (!twin) { dvojicOk = false; continue; }
    const m1 = Math.abs(t.q) + Math.abs(t.r), m2 = Math.abs(twin.q) + Math.abs(twin.r);
    if (Math.min(m1, m2) >= g.kolebkaR() || Math.max(m1, m2) <= g.kolebkaR()) dvojicOk = false;
  }
  test("každý přechod má jeden břeh v expanzi a druhý v kolébce", dvojicOk);
}

sada("4. Vlastní vrata jsou otevřená od začátku, cizí až s mosty");
{
  g.newGame(0, 42, null);
  g.G.faze = 1;
  const kol = [...g.G.tiles.values()].filter(t => g.jeKolebkovyMost(t));
  const f0 = g.G.factions[0], f1 = g.G.factions[1];
  const moje = kol.filter(t => g.oktantOf(t.q, t.r) === 0);
  test("ve fázi 1 vidí rod svůj přechod", moje.every(t => g.zonaOtevrena(f0, t)));
  test("ve fázi 1 na cizí přechod nesmí", moje.every(t => !g.zonaOtevrena(f1, t)));
  g.G.faze = 3;
  test("od fáze 3 jsou přechody otevřené všem", moje.every(t => g.zonaOtevrena(f1, t)));
}

sada("5. Přechod je měkčí než laterální most");
{
  g.newGame(0, 42, null);
  const kol = [...g.G.tiles.values()].find(t => g.jeKolebkovyMost(t));
  const lat = [...g.G.tiles.values()].find(t => t.structure === "bridge" && !g.jeKolebkovyMost(t));
  test("posádka přechodu je zlomek laterálního mostu",
    g.KOLEBKA_MOST_MILICE < g.STRUCTURES.bridge.militia / 4);
  test("velitel přechodu je slabší než na laterálním mostě",
    g.KOLEBKA_MOST_LEVEL < g.BRIDGE_LEVEL
    && g.neutralCommander(kol, 0).level < g.neutralCommander(lat, 0).level);
  // most NESYPE — jinak by rod dostal se svými vraty šest polí příjmu zdarma
  const f = g.G.factions[0];
  const pred = g.incomeOf(f);
  for (const t of g.G.tiles.values()) if (t.owner === 0 && t.structure !== "bridge") t.owner = -1;
  // ⚠ etapa 11: příjmy čte přehled aktérů (jeden průchod mapou za tik).
  // Kdo píše t.owner PŘÍMO místo přes setTileOwner, musí keš zrušit sám.
  g.zrusPrehled();
  const jenMosty = g.incomeOf(f);
  test(`most nesype výnos (zbylo ${Math.round(jenMosty.gold * 100) / 100} zlata)`,
    jenMosty.gold === 0 && jenMosty.food === 0 && pred.gold > 0);
}

console.log(`\n${proslo} prošlo, ${selhalo} selhalo`);
if (selhalo) process.exit(1);
