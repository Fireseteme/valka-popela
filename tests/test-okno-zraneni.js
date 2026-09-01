// Okno zranění (etapa 7, IV-C): od prvního útoku se posádka přestane hojit
// a postup se SČÍTÁ napříč útočníky; po vypršení okna plný reset.
const g = require("../js/game.js");

let proslo = 0, selhalo = 0;
const test = (jmeno, ok) => {
  if (ok) proslo++;
  else { selhalo++; console.log("  ❌ " + jmeno); }
};
const sada = jmeno => console.log("\n=== " + jmeno + " ===");
const kk = g.keyOf;

// neutrální pole daného stupně s volným sousedem, v ÚTOČITELNÉ zóně
function najdiPole(G, me, minLvl, maxLvl = 12) {
  const volny = n => n && !n.big && !n.bigSize && !n.structure && !n.riv
    && ["plains", "forest", "hills", "ruins"].includes(n.terrain) && n.owner === -1;
  // POZOR: pole musí mít POSÁDKU (uvnitř hradeb jsou i neutrální pole s nulou)
  // a leží v MOJÍ expanzní zóně — jinam se buď nesmí, nebo tam nevede základna
  const mojeZona = "expanze-" + me.id;
  for (const t of G.tiles.values()) {
    if (t.owner !== -1 || t.structure || t.big || t.bigSize || t.riv) continue;
    if (t.level < minLvl || t.level > maxLvl || !(t.garrison > 0)) continue;
    if (g.zonaOf(t) !== mojeZona) continue;
    for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = G.tiles.get(kk(t.q + dq, t.r + dr));
      if (volny(n) && g.zonaOf(n) === mojeZona) return [t, n];
    }
  }
  return [null, null];
}

// ze souseda udělá výspu se základnou hrdiny (vzor test-etapa4)
function pripravUtok(G, me, soused, armada, heroIdx = 0) {
  soused.owner = 0; soused.garrison = 0; soused.terrain = "plains";
  soused.structure = "outpost"; soused.outpost = g.emptyArmy();
  const h = me.heroes[heroIdx];
  h.pos = kk(soused.q, soused.r); h.zakladna = kk(soused.q, soused.r);
  h.army = Object.assign(g.emptyArmy(), armada);
  h.stamina = 999; h.cooldown = 0;
  me.resources.gold = 999999;
  return h;
}

function udelejZatah(G, me, cil, heroIdx = 0) {
  if (!g.startMarch(me, cil, null, heroIdx)) return false;
  const m = me.marches.find(x => x.kind === "attack" && x.heroIdx === heroIdx);
  if (!m) return false;
  m.ticksLeft = 1;
  g.doTick();
  return true;
}

sada("1. Okno se otevře prvním zásahem a má správnou délku");
{
  g.setSeasonHours(1);
  g.newGame(0, 61, [0]);
  const G = g.G, me = G.factions[0];
  G.faze = 4;
  const [cil, soused] = najdiPole(G, me, 8, 8);
  test("běžné pole nalezeno", !!cil);
  test("před útokem okno neběží", !(cil.zran > 0));
  pripravUtok(G, me, soused, { inf: 30 });   // schválně slabý zátah
  test("zátah proběhl", udelejZatah(G, me, cil));
  test("pole nedobyto (slabý útok)", cil.owner === -1);
  test(`okno běží (${cil.zran} s)`, cil.zran > 0);
  test("běžné pole má okno 15 minut", cil.zran <= g.ZRAN_TICKS && cil.zran > g.ZRAN_TICKS - 5);
  test("uzly a stavby mají okno 60 minut",
    g.ZRAN_TICKS_CIL === 3600 && g.zranDelka({ bigSize: 2 }) === g.ZRAN_TICKS_CIL
    && g.zranDelka({ structure: "bridge" }) === g.ZRAN_TICKS_CIL
    && g.zranDelka({}) === g.ZRAN_TICKS);
}

sada("2. Během okna se posádka NEHOJÍ");
{
  g.newGame(0, 62, [0]);
  const G = g.G, me = G.factions[0];
  G.faze = 4;
  const [cil, soused] = najdiPole(G, me, 8, 8);
  pripravUtok(G, me, soused, { inf: 30 });
  udelejZatah(G, me, cil);
  const po = cil.garrison;
  test("posádka je oslabená", po < g.TIER_GARRISON[cil.level - 1]);
  for (let i = 0; i < 120; i++) g.doTick();     // dvakrát tolik, než trvá regen
  test(`za 120 tiků nedorostla (${Math.round(po)} → ${Math.round(cil.garrison)})`,
    Math.abs(cil.garrison - po) < 0.5);
  test("okno mezitím odtikalo", cil.zran < g.ZRAN_TICKS - 100);
}

sada("3. Postup se SČÍTÁ — druhý zátah bere z OSLABENÉ posádky");
{
  g.newGame(0, 63, [0]);
  const G = g.G, me = G.factions[0];
  G.faze = 4;
  const [cil, soused] = najdiPole(G, me, 7, 10);
  test("cíl nalezen", !!cil);
  const plna = cil.garrison;
  const h = pripravUtok(G, me, soused, { inf: 60 });
  udelejZatah(G, me, cil);
  const poPrvnim = cil.garrison;
  test(`první zátah ubral (${Math.round(plna)} → ${Math.round(poPrvnim)})`, poPrvnim < plna);
  const oknoPoPrvnim = cil.zran;

  // druhý zátah HNED — posádka se mezitím nehojí, takže začíná tam, kde skončil
  // první. Že škoda visí na POLI (ne na útočníkovi) je právě to, co dělá
  // „postup se sčítá napříč útočníky" — druhý hrdina ani jiná frakce v tom
  // nehraje roli, čte se tentýž t.garrison.
  me.marches.length = 0;
  h.pos = kk(soused.q, soused.r);
  h.army = Object.assign(g.emptyArmy(), { inf: 60 });
  h.cooldown = 0; h.stamina = 999;
  udelejZatah(G, me, cil);
  test(`druhý zátah ubral dál (${Math.round(poPrvnim)} → ${Math.round(cil.garrison)})`,
    cil.garrison < poPrvnim);
  test("okno se druhým zátahem NEPRODLUŽUJE", cil.zran <= oknoPoPrvnim);
}

sada("4. Vypršení okna vrátí plnou sílu");
{
  g.newGame(0, 64, [0]);
  const G = g.G, me = G.factions[0];
  G.faze = 4;
  const [cil, soused] = najdiPole(G, me, 8, 8);
  const plna = cil.garrison;
  pripravUtok(G, me, soused, { inf: 30 });
  udelejZatah(G, me, cil);
  test("posádka oslabená", cil.garrison < plna);
  cil.zran = 2;                                  // zkrátit okno, ať test netrvá
  g.doTick(); g.doTick();
  test("okno zmizelo", cil.zran === undefined);
  test(`posádka zpět na plné (${Math.round(cil.garrison)} / ${Math.round(plna)})`,
    Math.abs(cil.garrison - plna) < 0.5);
}

sada("5. Dobyté pole si okno nenese");
{
  g.newGame(0, 65, [0]);
  const G = g.G, me = G.factions[0];
  G.faze = 4;
  const [cil, soused] = najdiPole(G, me, 3, 5);
  pripravUtok(G, me, soused, { inf: 4000, arch: 2000 });
  udelejZatah(G, me, cil);
  test("pole dobyto", cil.owner === 0);
  test("okno se smazalo", cil.zran === undefined);
}

console.log(`\n${proslo} prošlo, ${selhalo} selhalo`);
if (selhalo) process.exit(1);
