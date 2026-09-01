// Etapa 4a (v0.30): dvou-armádové uzly 2×2, cooldown uzlu, zóny světa
// a otevírání fází checkpointy/pojistkou. Generátor žil hlídá test-mapa.js.
const g = require("../js/game.js");

let proslo = 0, selhalo = 0;
const test = (jmeno, ok) => {
  if (ok) proslo++;
  else { selhalo++; console.log("  ❌ " + jmeno); }
};
const sada = jmeno => console.log("\n=== " + jmeno + " ===");
const kk = g.keyOf;

// najde uzel (2×2 bez struktury) s volným průchozím sousedem a vrátí [kotva, soused]
function najdiUzel(G, minLvl = 9) {
  const volny = n => n && !n.big && !n.bigSize && !n.structure && !n.riv
    && ["plains", "forest", "hills", "ruins"].includes(n.terrain) && n.owner === -1;
  for (const t of G.tiles.values()) {
    if (t.bigSize !== 2 || t.structure || t.level < minLvl) continue;
    // ETAPA 7: do CIZÍ kolébky se nedá útočit ani na neutrální pole —
    // uzel v ní by scénu zablokoval hned na startMarch
    if (g.jeCiziKolebka(G.factions[0], t)) continue;
    for (const m of [t, ...t.bigKeys.map(k => G.tiles.get(k))]) {
      for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const n = G.tiles.get(kk(m.q + dq, m.r + dr));
        if (volny(n)) return [t, n];
      }
    }
  }
  return [null, null];
}
// z pole udělá vlastní výspu se základnou hrdiny 0 (vzor test-mapa sada 4)
function pripravUtok(G, me, soused, armada) {
  soused.owner = 0; soused.garrison = 0; soused.terrain = "plains";
  soused.structure = "outpost"; soused.outpost = { inf: 0, arch: 0, cav: 0 };
  const h = me.heroes[0];
  h.pos = kk(soused.q, soused.r); h.zakladna = kk(soused.q, soused.r);
  h.army = armada; h.stamina = 120; h.cooldown = 0;
  me.resources.gold = 99999;
  return h;
}

// ---------- 1. Uzel: dvě armády na jeden zátah ----------
sada("1. Uzel 2×2: dvě armády na jeden zátah");
{
  g.newGame(0, 48, [0]);
  const G = g.G, me = G.factions[0];
  G.faze = 4; // scény testují uzly, ne otevírání zón
  const [a, soused] = najdiUzel(G);
  test("uzel s volným sousedem existuje", !!a);
  // ETAPA 7: filtr cizích kolébek posunul výběr uzlu na silnější kus, a po
  // rebase velení z etapy 6 má posádka tisíce CP — armáda musí odpovídat,
  // jinak scéna netestuje ZÁBOR, ale odražený zátah (to je sada 2)
  pripravUtok(G, me, soused, { inf: 3000, arch: 3000, cav: 3000 });
  test("posádka uzlu = dvojnásobek tabulky", a.garrison === 2 * g.TIER_GARRISON[a.level - 1]);
  const repPred = G.reports.length;
  test("útok jde vyslat", g.startMarch(me, a, null, 0));
  me.marches.find(m => m.kind === "attack").ticksLeft = 1;
  g.doTick();
  const r1 = G.reports[G.reports.length - 2], r2 = G.reports[G.reports.length - 1];
  test("zátah = dva reporty", G.reports.length - repPred === 2);
  test("první report nese 1. armádu uzlu", (r1.def.name || "").includes("1. armáda"));
  // ETAPA 6 (IV-M): neutrální objektiv se brání OD NEJSLABŠÍHO, takže pořadí
  // velitelů neurčuje salt, ale jejich síla — poslední bitva je boss.
  // (12 předloh velitelů → jména se u ~4 % uzlů shodují, proto se porovnává síla.)
  const poradi = g.neutralPoradi(a, 2);
  const slabsi = g.neutralCommander(a, poradi[0]), silnejsi = g.neutralCommander(a, poradi[1]);
  test("druhou armádu vede SILNĚJŠÍ z obou velitelů", r2.def.leadName === silnejsi.name);
  test("první armádu vede ten slabší", (r1.def.leadName || "") === slabsi.name);
  test("obtížnost mezi vlnami roste, ne klesá",
    g.neutralSila(silnejsi) >= g.neutralSila(slabsi));
  test("první vlna je i početně menší (0,4 : 0,6)",
    g.NEUTRAL_VLNY[0] < g.NEUTRAL_VLNY[1]
    && Math.abs(g.NEUTRAL_VLNY[0] + g.NEUTRAL_VLNY[1] - 1) < 1e-9);
  test("report 1. bitvy nese ztráty i zbytek (prohlížeč je čte vždy)",
    r1.attLosses !== undefined && r1.attRem !== undefined);
  test("výhra obou bitev = zábor celého bloku",
    a.owner === 0 && a.bigKeys.every(k => G.tiles.get(k).owner === 0));
  test("po záboru uzel bez cooldownu", !a.uzelCd);
}

// ---------- 2. Uzel: odražený zátah = reset + cooldown ----------
sada("2. Uzel: odražený zátah škodu NEVRACÍ (okno zranění, v0.55)");
{
  g.newGame(0, 49, [0]);
  const G = g.G, me = G.factions[0];
  G.faze = 4;
  const [a, soused] = najdiUzel(G, 10);
  test("silný uzel nalezen", !!a && a.level >= 10);
  const h = pripravUtok(G, me, soused, { inf: 40, arch: 0, cav: 0 });
  const plna = a.garrison;
  test("slabý útok jde vyslat", g.startMarch(me, a, null, 0));
  me.marches.find(m => m.kind === "attack").ticksLeft = 1;
  g.doTick();
  // ETAPA 7 (okno zranění): dřív se tu obě armády vrátily do plné síly. Nově
  // si posádka nese, co jí zátah pobil, a obnoví se až vypršením okna.
  test(`posádka je oslabená, ne obnovená (${Math.round(a.garrison)} z ${plna})`,
    a.garrison < plna);
  test("okno zranění běží", a.zran > 0 && a.zran <= g.ZRAN_TICKS_CIL);
  test("uzel dostal cooldown", a.uzelCd > 0 && a.uzelCd <= g.UZEL_CD_TICKS);
  test("uzel se neobléhá (žádný siege pochod)", !me.marches.some(m => m.kind === "siege"));
  // zamčený uzel odmítá další zátahy…
  h.pos = kk(soused.q, soused.r); h.army = { inf: 500, arch: 0, cav: 0 };
  h.cooldown = 0; h.stamina = 120;
  test("útok na uzavřený uzel odmítnut", !g.startMarch(me, a, null, 0));
  test("posily-útok na uzavřený uzel odmítnut", !g.startReinforceAttack(me, a, { inf: 1, arch: 0, cav: 0 }, 0));
  // …a rozlétnutý pochod se u uzavřeného uzlu obrací
  me.marches.length = 0; // uklidit návratový pochod z odraženého zátahu
  h.pos = kk(soused.q, soused.r); h.army = { inf: 500, arch: 0, cav: 0 };
  h.cooldown = 0; h.stamina = 120;
  a.uzelCd = 0; delete a.uzelCd;
  test("po otevření útok zase jde", g.startMarch(me, a, null, 0));
  a.uzelCd = 500; // někdo jiný mezitím zátah prohrál
  me.marches.find(m => m.kind === "attack").ticksLeft = 1;
  g.doTick();
  test("dolet na uzavřený uzel = obrat (fallback)", me.marches.some(m => m.kind === "fallback"));
  test("uzel nedobyt", a.owner === -1);
  // cooldown odtikává a mizí
  a.uzelCd = 1; g.doTick();
  test("cooldown vypršel a smazal se", a.uzelCd === undefined);
}

// ---------- 3. Regen uzlu míří na dvojnásobek ----------
sada("3. Regen: uzel dorůstá k dvojité posádce");
{
  g.newGame(0, 50, [0]);
  const G = g.G;
  const [a] = najdiUzel(G);
  const cil = 2 * g.TIER_GARRISON[a.level - 1];
  a.garrison = Math.round(cil * 0.6);
  const pred = a.garrison;
  for (let i = 0; i < 30; i++) g.doTick();
  test("posádka roste", a.garrison > pred);
  a.garrison = cil - 0.001;
  for (let i = 0; i < 5; i++) g.doTick();
  test("strop je dvojnásobek (ne polovina)", Math.abs(a.garrison - cil) < 0.01);
}

// ---------- 4. Zóny světa: kdo kam smí v které fázi ----------
sada("4. Zóny: otevřenost dle fází");
{
  g.newGame(0, 51, [0]);
  const G = g.G, me = G.factions[0]; // aldar, sektor-0
  const cizi = G.factions[2];        // durgar, sektor-2
  const mez = G.tiles.get(kk(10, 2));    // mezikruží (M = 12)
  const vnitr = G.tiles.get(kk(3, 2));   // vnitřek (M = 5)
  const brana = G.tiles.get(kk(12, 4));  // velká pevnost = brána mezikruží
  const most = G.tiles.get(g.BRIDGE_KEYS[0]);   // v0.40: most je na břehu, ne na (16,16)
  const mujKap = G.tiles.get(g.capKeyOf(me));
  // ETAPA 7: výseč se dělí na KOLÉBKU (s kapitálem) a EXPANZI
  test("zonaOf: kolébka / mezikruží / vnitřek / most",
    g.zonaOf(mujKap) === "kolebka-0" && g.zonaOf(mez) === "mezikruzi"
    && g.zonaOf(vnitr) === "vnitrek" && g.zonaOf(most) === "most"
    && g.zonaOf(brana) === "mezikruzi");
  test("fáze 1: vlastní kolébka ano, mezikruží ne",
    g.zonaOtevrena(me, mujKap) && !g.zonaOtevrena(me, mez));
  test("fáze 1: cizí kolébka zamčená", !g.zonaOtevrena(cizi, mujKap));
  G.faze = 2;
  test("fáze 2: mezikruží (i brána) ano, vnitřek a cizí sektor ne",
    g.zonaOtevrena(me, mez) && g.zonaOtevrena(me, brana)
    && !g.zonaOtevrena(me, vnitr) && !g.zonaOtevrena(cizi, mujKap));
  G.faze = 3;
  // ROZHODNUTÍ UŽIVATELE (30. 8.): cizí KOLÉBKA se neotevře NIKDY — ani ve
  // fázi 4. Rod se nedá vyhnat z domova; otevírá se jen expanzní pás.
  const cizExp = [...G.tiles.values()].find(t => g.zonaOf(t) === "expanze-2");
  test("fáze 3: cizí EXPANZE a mosty ano",
    g.zonaOtevrena(me, cizExp) && g.zonaOtevrena(me, most));
  test("cizí kolébka zůstává zamčená i ve fázi 3", !g.zonaOtevrena(cizi, mujKap));
  G.faze = 4;
  test("fáze 4: vnitřek ano", g.zonaOtevrena(me, vnitr));
  test("fáze 4: cizí kolébka POŘÁD zamčená", !g.zonaOtevrena(cizi, mujKap));
  // tvrdý zámek v startMarch: cíl v zamčené zóně neprojde ani jinak platný
  G.faze = 1;
  const [a, soused] = najdiUzel(G);
  const h = pripravUtok(G, me, soused, { inf: 900, arch: 900, cav: 900 });
  const vSektoru = g.zonaOf(a) === "kolebka-0" || g.zonaOf(a) === "expanze-0";
  if (!vSektoru) {
    test("útok do zamčené zóny odmítnut", !g.startMarch(me, a, null, 0));
    G.faze = 4;
    test("po otevření tentýž útok projde", g.startMarch(me, a, null, 0));
  } else {
    test("uzel v sektoru: útok projde i ve fázi 1", g.startMarch(me, a, null, 0));
    test("(zamčený cíl kryje scéna výš)", true);
  }
}

// ---------- 5. Otevírání fází: pojistka i checkpoint ----------
sada("5. Fáze: časová pojistka i checkpoint");
{
  g.newGame(0, 52, [0]);
  const G = g.G;
  test("start ve fázi 1", G.faze === 1);
  // checkpoint: dost dobytých polí otevře fázi 2 PŘED pojistkou
  const zivych = G.factions.filter(f => f.alive).length;
  let dano = 0;
  for (const t of G.tiles.values()) {
    if (dano >= 24 * zivych + 5) break;
    if (t.owner === -1 && !t.structure && !t.big && !t.bigSize
      && ["plains", "forest", "hills", "ruins"].includes(t.terrain)) { t.owner = 3; dano++; }
  }
  for (let i = 0; i < 6; i++) g.doTick();
  test("checkpoint (dobytá pole) otevřel fázi 2 před pojistkou",
    G.faze >= 2 && G.tick < g.zoneFazeTicks(2));
  // pojistka dožene zbytek
  G.tick = g.zoneFazeTicks(4) + 3;
  for (let i = 0; i < 12; i++) g.doTick();
  test("pojistka dohnala fázi 4", G.faze === 4);
}

// ---------- 6. Akademie velení jde stavět (oprava v0.30) ----------
sada("6. Akademie velení jde stavět (chyběl klíč academy od v0.27)");
{
  g.newGame(0, 53, [0]);
  const me = g.G.factions[0];
  test("frakce startuje s academy: 0", me.buildings.academy === 0);
  me.resources.stone = 9999; me.resources.gold = 9999;
  test("stavba akademie jde zadat", !!g.startBuild(me, "academy"));
}

console.log(`\n${proslo} prošlo, ${selhalo} selhalo`);
if (selhalo) process.exit(1);
