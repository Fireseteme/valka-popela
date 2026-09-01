// Etapa 7 (v0.53): řetěz bitev o stoh hrdinů (PLAN IV-L).
const g = require("../js/game.js");

let proslo = 0, selhalo = 0;
const test = (jmeno, ok) => {
  if (ok) proslo++;
  else { selhalo++; console.log("  ❌ " + jmeno); }
};
const sada = jmeno => console.log("\n=== " + jmeno + " ===");

// pole vlastněné `obrIdx` s N hrdiny na něm a útočníkem na sousední výspě
function scena(pocetObrancu) {
  g.newGame(0, 4242, null);
  g.G.faze = 4;
  const obr = g.G.factions[0], utok = g.G.factions[3];
  const kap = g.G.tiles.get(g.capKeyOf(obr));
  // pole musí být v EXPANZNÍ zóně obránce — do kolébky nepřítel nevstoupí
  const t = [...g.G.tiles.values()].filter(x => x.owner === -1 && !x.structure && !x.big
    && !x.bigSize && !x.riv && g.TERRAIN[x.terrain].passable
    && g.zonaOf(x) === "expanze-" + obr.id
    && g.neighborsOf(x).some(n => n && g.TERRAIN[n.terrain].passable && !n.big
      && !n.bigSize && n.structure !== "bridge" && n.owner === -1))[0];
  g.setTileOwner(t, obr.id, obr.cid || 0);
  t.garrison = 0; t.level = 1;
  const kl = g.keyOf(t.q, t.r);
  while (obr.heroes.length < pocetObrancu) obr.heroes.push(g.makeHero(obr.heroes.length));
  for (let i = 0; i < pocetObrancu; i++) {
    const h = obr.heroes[i];
    h.level = 10;
    g.G.tick = 100 + i * 100;                 // pořadí příchodu
    g.postavHrdinu(h, kl);
    h.army = Object.assign(g.emptyArmy(), { inf: 300 });
  }
  // ETAPA 7: s prstencovým děličem může být první vhodné pole obklopené vodou
  // — scéna proto hledá TAKOVÉ pole expanze, které má i použitelného souseda
  const soused = g.neighborsOf(t).find(n => n && g.TERRAIN[n.terrain].passable
    && !n.big && !n.bigSize && n.structure !== "bridge" && n.owner !== obr.id);
  if (!soused) throw new Error("scéna: pole expanze nemá volného souseda");
  g.setTileOwner(soused, utok.id, utok.cid || 0);
  soused.garrison = 0; soused.structure = "outpost"; soused.outpost = g.emptyArmy();
  const uh = utok.heroes[0];
  uh.level = 50; utok.resources.gold = 999999;
  g.postavHrdinu(uh, g.keyOf(soused.q, soused.r));
  uh.zakladna = uh.pos;
  return { obr, utok, t, kl, soused, uh };
}
function zatah(s) {
  s.uh.army = Object.assign(g.emptyArmy(), { inf: 4000 });
  s.uh.stamina = 999; s.uh.cooldown = 0;
  s.utok.marches.length = 0;
  g.postavHrdinu(s.uh, g.keyOf(s.soused.q, s.soused.r));
  if (!g.startMarch(s.utok, s.t, null, 0)) return null;
  s.utok.marches.find(m => m.kind === "attack").ticksLeft = 1;
  g.doTick();
  return g.G.reports[g.G.reports.length - 1];
}

sada("1. Řetěz bitev o stoh (IV-L)");
{
  const s = scena(3);
  test("na poli stojí tři obránci", s.obr.heroes.filter(h => h.pos === s.kl).length === 3);
  const komp = g.tileDefComponents(s.t);
  test("stoh je seřazený podle příchodu",
    komp.obranci.map(o => o.prisel).join(",") === "100,200,300");

  const r1 = zatah(s);
  test("první zátah vyhrál", !!r1 && r1.won);
  test("…ale pole NEZABRAL", s.t.owner === s.obr.id);
  test("…srazil právě jednu armádu", s.obr.heroes.filter(h => h.pos === s.kl).length === 2);
  test("report hlásí, kolik armád zbývá", r1.stohZbyva === 2);
  test("ustoupil ten, kdo dorazil PRVNÍ", s.obr.heroes[0].pos === null);

  const r2 = zatah(s);
  test("druhý zátah srazí druhou armádu",
    !!r2 && r2.won && s.obr.heroes.filter(h => h.pos === s.kl).length === 1
    && s.t.owner === s.obr.id);

  const r3 = zatah(s);
  test("třetí zátah pole DOBÝVÁ", !!r3 && r3.won && s.t.owner === s.utok.id);
  test("na dobytém poli už nikdo z obránců nestojí",
    s.obr.heroes.filter(h => h.pos === s.kl).length === 0);
}

sada("2. Jediný obránce = jeden zátah (beze změny)");
{
  const s = scena(1);
  const komp = g.tileDefComponents(s.t);
  test("jeden obránce se řetězem neřeší", komp.obranci.length === 1);
  const r = zatah(s);
  test("jediný zátah pole rovnou dobývá", !!r && r.won && s.t.owner === s.utok.id);
  test("a report o zbývajících armádách nemluví", r.stohZbyva === undefined);
}

sada("3. Poslední obránce brání SPOLU s polem");
{
  const s = scena(2);
  s.t.level = 8;                       // pole samo má posádku
  s.t.garrison = 400;
  const komp1 = g.tileDefComponents(s.t);
  const silaCela = g.armyTotal(komp1.army);
  test("dokud je stoh, bojuje jen armáda jednoho obránce",
    komp1.obranci.length === 2 && silaCela > 300);
  zatah(s);                            // srazí prvního
  const komp2 = g.tileDefComponents(s.t);
  test("po sražení prvního zbývá poslední", komp2.obranci.length === 1);
  test("poslední už bojuje i s posádkou pole",
    g.armyTotal(komp2.army) > g.armyTotal(s.obr.heroes[1].army));
}


sada("4. Nedotknutelná kolébka (IV-K)");
{
  g.newGame(0, 4242, null);
  g.G.faze = 4;                       // i po plném otevření světa
  const poc = {};
  for (const t of g.G.tiles.values()) {
    const z = g.zonaOf(t).replace(/-\d+$/, "");
    poc[z] = (poc[z] || 0) + 1;
  }
  test("výseč se dělí na kolébku a expanzi", poc.kolebka > 0 && poc.expanze > 0);

  let kapitalyOk = true;
  for (let i = 0; i < 8; i++)
    if (g.zonaOf(g.G.tiles.get(g.capKeyOf(g.G.factions[i]))) !== "kolebka-" + i) kapitalyOk = false;
  test("každý kapitál leží ve VLASTNÍ kolébce", kapitalyOk);

  const mojeKolebka = g.G.tiles.get(g.capKeyOf(g.G.factions[0]));
  test("vlastní kolébka je otevřená", g.zonaOtevrena(g.G.factions[0], mojeKolebka));
  test("cizí kolébka je zamčená i ve fázi 4",
    !g.zonaOtevrena(g.G.factions[3], mojeKolebka));
  test("jeCiziKolebka to pozná", g.jeCiziKolebka(g.G.factions[3], mojeKolebka)
    && !g.jeCiziKolebka(g.G.factions[0], mojeKolebka));

  // i NEUTRÁLNÍ pole v cizí kolébce je nedotknutelné — kolébka je exkluzivní
  // PvE farma svého rodu
  const neutrVKolebce = [...g.G.tiles.values()].find(t => t.owner === -1
    && g.zonaOf(t) === "kolebka-5" && g.TERRAIN[t.terrain].passable);
  test("neutrální pole v cizí kolébce se najde", !!neutrVKolebce);
  test("…a je pro cizí rod taky nedotknutelné",
    g.jeCiziKolebka(g.G.factions[0], neutrVKolebce));

  // expanzní pás se po fázi 3 otevírá normálně
  const ciziExpanze = [...g.G.tiles.values()].find(t => g.zonaOf(t) === "expanze-5");
  test("cizí EXPANZE se ve fázi 4 otevírá", g.zonaOtevrena(g.G.factions[0], ciziExpanze));
}

sada("5. Kapitál se nedá dobýt (rozhodnutí 30. 8.)");
{
  g.newGame(0, 47, [0]);
  g.G.faze = 4;
  const me = g.G.factions[0], ob = g.G.factions[5];
  const obCap = g.G.tiles.get(g.capKeyOf(ob));
  // hrdina rovnou vedle cizího kapitálu, s válkou a plnou armádou
  const u = g.G.tiles.get(g.keyOf(obCap.q - 2, obCap.r));
  u.owner = me.id; u.structure = null; u.garrison = 0; delete u.big; delete u.riv;
  u.terrain = "plains";
  const h = me.heroes[0];
  g.postavHrdinu(h, g.keyOf(u.q, u.r));
  h.army = Object.assign(g.emptyArmy(), { inf: 5000 });
  h.stamina = 100000; h.zakladna = null;
  me.resources.gold = 99999;
  me.valkaCd = 0;
  test("válka se vyhlásit dá", g.declareWar(me, 5));
  test("útok na cizí kapitál NEPROJDE ani s válkou",
    g.startMarch(me, obCap, null, 0) === false);
  test("…protože stojí v cizí kolébce", g.jeCiziKolebka(me, obCap));
  // a totéž pro pole vedle něj, které je taky v kolébce
  const vedle = g.G.tiles.get(g.keyOf(obCap.q + 2, obCap.r));
  if (vedle && g.TERRAIN[vedle.terrain].passable) {
    test("ani sousední pole v kolébce se napadnout nedá",
      g.jeCiziKolebka(me, vedle) ? g.startMarch(me, vedle, null, 0) === false : true);
  }
}


sada("6. Neutrální obránce je hrdina (IV-L)");
{
  g.newGame(0, 4242, null);
  // tier podle síly pole: slabé T1, silné T2, stavby T3
  const slabe = [...g.G.tiles.values()].find(t => t.owner === -1 && !t.structure
    && g.tileStrengthLabel(t) < 200);
  const silne = [...g.G.tiles.values()].find(t => t.owner === -1 && !t.structure
    && g.tileStrengthLabel(t) >= 200);
  const stavba = [...g.G.tiles.values()].find(t => t.owner === -1 && t.structure === "grandfort");
  test("slabé pole má velitele T1", g.neutralTier(slabe) === 0);
  test("silné pole T2", silne ? g.neutralTier(silne) === 1 : true);
  test("grandfort T3", stavba ? g.neutralTier(stavba) === 2 : true);
  test("rarita výstroje roste s tierem",
    g.NEUTRAL_TIER_RARITA[0] < g.NEUTRAL_TIER_RARITA[1]
    && g.NEUTRAL_TIER_RARITA[1] < g.NEUTRAL_TIER_RARITA[2]);

  // výstroj je DETERMINISTICKÁ — jinak by obrana pole poskakovala mezi
  // překresleními, protože makeItem jede na globálním rng
  const a = g.neutralVybava(slabe, 10), b = g.neutralVybava(slabe, 10);
  test("výstroj téhož pole je pokaždé stejná",
    JSON.stringify(a.bonus) === JSON.stringify(b.bonus));
  const jiny = g.neutralVybava(silne || stavba, 10);
  test("jiné pole má jinou výstroj",
    JSON.stringify(a.bonus) !== JSON.stringify(jiny.bonus));

  // velitel s výstrojí musí být SILNĚJŠÍ než bez ní
  const nc = g.neutralCommander(stavba || silne || slabe);
  test("velitel má kouzla z helmy", nc.spell > 0);
  test("velitel zná svůj tier", typeof nc.tier === "number");
  test("pořád nemá hvězdy ani dovednosti", !nc.stars && !nc.skills);
}

console.log(`\n${proslo} prošlo, ${selhalo} selhalo`);
process.exit(selhalo ? 1 : 0);
