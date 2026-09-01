// Test čekajících rozkazů (v0.26): posily s rozkazem — jedno potvrzení vyšle
// konvoj k hrdinovi v poli a po doručení POSLEDNÍHO konvoje hrdina sám vyrazí
// na cíl. Kryje: atomické vydání, splnění, dva konvoje v témže tiku, zrušení
// posil, cíl mezitím dobytý, nedostatek výdrže, nájezd a limit velení.
const g = require("../js/game.js");

let proslo = 0, selhalo = 0;
const test = (jmeno, ok) => {
  if (ok) proslo++;
  else { selhalo++; console.log("  ❌ " + jmeno); }
};
const sada = jmeno => console.log("\n=== " + jmeno + " ===");

// ---------- příprava: hrdina v poli na vlastním poli, vedle neutrální cíl ----------
// najde dvojici sousedních holých polí (bez struktur, bloků a řek) poblíž
// hlavního města hráče 0 a postaví scénu: A patří hráči (stojí tu hrdina),
// B je neutrální cíl
function scena(armadaHrdiny, zasoba) {
  g.newGame(0, 42, [0]);
  const G = g.G;
  const me = G.factions[0];
  const cap = { q: 23, r: 9 }; // kapitála aldarů
  let A = null, B = null;
  for (const t of G.tiles.values()) {
    // ETAPA 7: kolem kapitálu leží prstencový DĚLIČ KOLÉBKY, takže mezi poli
    // v okruhu 6 jsou i vodní — obě pole scény musí být PRŮCHOZÍ
    if (t.owner !== -1 || t.structure || t.big || t.riv) continue;
    if (!g.TERRAIN[t.terrain].passable) continue;
    if (Math.abs(t.q - cap.q) + Math.abs(t.r - cap.r) > 6) continue;
    for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const s = G.tiles.get(g.keyOf(t.q + dq, t.r + dr));
      if (s && s.owner === -1 && !s.structure && !s.big && !s.riv
        && g.TERRAIN[s.terrain].passable) { A = t; B = s; break; }
    }
    if (A) break;
  }
  A.owner = 0;
  const h = me.heroes[0];
  h.pos = g.keyOf(A.q, A.r);
  h.army = { inf: armadaHrdiny, arch: 0, cav: 0 };
  h.stamina = 100;
  me.units = { inf: zasoba, arch: 0, cav: 0 };
  me.resources.gold = 100000;
  return { G, me, h, A, B };
}
const konvojeK = (me, key) => me.marches.filter(m => m.kind === "reinforce" && m.targetKey === key);
const utokHrdiny = me => me.marches.find(m => m.kind === "attack" && m.heroIdx === 0);
const dojedKonvoje = (me, key) => {
  let pojistka = 0;
  while (konvojeK(me, key).length > 0 && pojistka++ < 500) g.doTick();
  return pojistka < 500;
};

// ---------- 1. vydání rozkazu ----------
sada("1. Vydání rozkazu (posily + cíl atomicky)");
{
  const { me, h, B } = scena(5, 40);
  const ok = g.startReinforceAttack(me, B, 0, { inf: 10, arch: 0, cav: 0 }, false);
  test("příkaz projde", ok === true);
  test("konvoj vyjel", konvojeK(me, h.pos).length === 1);
  test("zásoba města ubyla", me.units.inf === 30);
  test("rozkaz visí na hrdinovi", !!h.rozkaz && h.rozkaz.targetKey === g.keyOf(B.q, B.r));
  test("rozkaz je útočný", h.rozkaz.utok === true);
  test("hrdina je ukotven (nesmí se hýbat)", g.startRecall(me, 0) === false);
}
{
  const { me, h } = scena(5, 40);
  test("bez jednotek příkaz neprojde", g.startReinforceAttack(me, g.G.tiles.get(h.pos), 0,
    { inf: 0, arch: 0, cav: 0 }, false) === false);
  const { me: m2, B: B2 } = scena(5, 2000);
  test("přes limit velení neprojde", g.startReinforceAttack(m2, B2, 0,
    { inf: 1500, arch: 0, cav: 0 }, false) === false);
  test("bez rozkazu po odmítnutí", !m2.heroes[0].rozkaz);
}

// ---------- 2. splnění: konvoj dojede a hrdina sám vyrazí ----------
sada("2. Splnění rozkazu po doručení posil");
{
  const { me, h, B } = scena(5, 40);
  g.startReinforceAttack(me, B, 0, { inf: 10, arch: 0, cav: 0 }, false);
  test("konvoje dojely", dojedKonvoje(me, h.pos));
  const m = utokHrdiny(me);
  test("hrdina vyrazil na cíl", !!m && m.targetKey === g.keyOf(B.q, B.r));
  test("táhne s celou doplněnou armádou (5+10)", !!m && g.armyTotal(m.army) === 15);
  test("rozkaz je spotřebován", !h.rozkaz);
  test("bez nájezdu se nevrací", !!m && m.returnAfter === false);
}

// ---------- 3. nájezd se přenáší ----------
sada("3. Nájezd (po vítězství zpět) se přenáší");
{
  const { me, h, B } = scena(5, 40);
  g.startReinforceAttack(me, B, 0, { inf: 10, arch: 0, cav: 0 }, true);
  dojedKonvoje(me, h.pos);
  const m = utokHrdiny(me);
  test("pochod nese příznak nájezdu", !!m && m.returnAfter === true);
}

// ---------- 4. dva konvoje v témže tiku ----------
sada("4. Dva konvoje naráz — rozkaz čeká na poslední");
{
  const { me, h, A, B } = scena(5, 60);
  g.startReinforceAttack(me, B, 0, { inf: 10, arch: 0, cav: 0 }, false);
  const ok2 = g.startReinforce(me, A, { inf: 8, arch: 0, cav: 0 });
  test("druhý (obyčejný) konvoj vyjel", ok2 === true && konvojeK(me, h.pos).length === 2);
  dojedKonvoje(me, h.pos);
  const m = utokHrdiny(me);
  test("hrdina vyrazil až se vším (5+10+8)", !!m && g.armyTotal(m.army) === 23);
  test("rozkaz spotřebován", !h.rozkaz);
}

// ---------- 5. zrušení posil maže rozkaz ----------
sada("5. Zrušení posil maže rozkaz");
{
  const { me, h, B } = scena(5, 40);
  g.startReinforceAttack(me, B, 0, { inf: 10, arch: 0, cav: 0 }, false);
  g.doTick();
  test("zrušení projde", g.cancelReinforce(me, 0) === true);
  test("rozkaz padl", !h.rozkaz);
  test("konvoj se obrací (return)", me.marches.some(m => m.kind === "return"));
  for (let i = 0; i < 200 && me.marches.length; i++) g.doTick();
  test("hrdina nikam nevyrazil", !utokHrdiny(me) && h.pos !== null);
}

// ---------- 6. cíl mezitím náš ----------
sada("6. Cíl mezitím dobyt vlastními — rozkaz se ruší");
{
  const { me, h, B } = scena(5, 40);
  g.startReinforceAttack(me, B, 0, { inf: 10, arch: 0, cav: 0 }, false);
  B.owner = 0; // spojenec/já jsme pole mezitím vzali
  dojedKonvoje(me, h.pos);
  test("hrdina nevyrazil", !utokHrdiny(me));
  test("rozkaz zrušen", !h.rozkaz);
  test("posily ale dorazily (5+10)", g.armyTotal(h.army) === 15);
}

// ---------- 7. bez výdrže rozkaz nevyjde, hrdina drží pozici ----------
sada("7. Došla výdrž — hrdina drží pozici");
{
  const { me, h, B } = scena(5, 40);
  g.startReinforceAttack(me, B, 0, { inf: 10, arch: 0, cav: 0 }, false);
  // výdrž ubrat až TĚSNĚ před dojezdem — dřív by se cestou zregenerovala
  let poj = 0;
  while (konvojeK(me, h.pos).some(m => m.ticksLeft > 1) && poj++ < 500) g.doTick();
  h.stamina = 1;
  g.doTick();
  test("hrdina nevyrazil", !utokHrdiny(me));
  test("rozkaz spotřebován (nezacyklí se)", !h.rozkaz);
  test("armáda doplněná zůstává hrdinovi", g.armyTotal(h.army) === 15 && h.pos !== null);
}

// ---------- 8. serializace: rozkaz přežije JSON (multiplayer) ----------
sada("8. Rozkaz přežije snapshot (JSON)");
{
  const { me, B } = scena(5, 40);
  g.startReinforceAttack(me, B, 0, { inf: 10, arch: 0, cav: 0 }, true);
  const kopie = JSON.parse(JSON.stringify(me.heroes[0]));
  test("targetKey, utok i nájezd v kopii", kopie.rozkaz
    && kopie.rozkaz.targetKey === g.keyOf(B.q, B.r)
    && kopie.rozkaz.utok === true && kopie.rozkaz.raid === true);
}

// ---------- výsledek ----------
console.log(`\n${proslo} prošlo, ${selhalo} selhalo`);
if (selhalo > 0) process.exit(1);
