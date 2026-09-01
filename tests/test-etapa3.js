// Testy etapy 3 (v0.29): akční rádius základen (REACH), obléhací okna
// velkých staveb (odolnost, bourání, obnova po promeškaném okně), vyhlášení
// války (postih v cizím drženém kraji, povinnost na kapitál, cooldown,
// trhání paktu) a vykořenění (přesídlení místo eliminace).
const g = require("../js/game.js");

let proslo = 0, selhalo = 0;
const test = (jmeno, ok) => {
  if (ok) proslo++;
  else { selhalo++; console.log("  ❌ " + jmeno); }
};
const sada = jmeno => console.log("\n=== " + jmeno + " ===");
const kk = g.keyOf;
const dist = (a, b) => Math.abs(a.q - b.q) + Math.abs(a.r - b.r);

// najde neutrální holé pole v dané vzdálenosti od bodu a zpřístupní ho sousedstvím
function zpristupni(G, fid, odQ, odR, minD, maxD) {
  for (const t of G.tiles.values()) {
    const d = Math.abs(t.q - odQ) + Math.abs(t.r - odR);
    if (d < minD || d > maxD) continue;
    if (t.owner !== -1 || t.structure || t.big || t.bigSize || t.riv) continue;
    if (!["plains", "forest", "hills", "ruins"].includes(t.terrain)) continue;
    for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const s = G.tiles.get(kk(t.q + dq, t.r + dr));
      if (s && s.owner === -1 && !s.structure && !s.big && !s.riv
          && ["plains", "forest", "hills", "ruins"].includes(s.terrain)) {
        s.owner = fid; s.garrison = 0;
        return t;
      }
    }
  }
  return null;
}

// ---------- 1. Akční rádius základen ----------
sada("1. Dosah základen (REACH " + g.REACH + ")");
{
  g.newGame(0, 42, [0]);
  g.G.faze = 4; // v0.30: scény testují mechaniky, ne otevírání zón
  const G = g.G, me = G.factions[0];
  const cap = g.capPosOf(me);
  me.resources.gold = 99999;
  me.units = { inf: 900, arch: 0, cav: 0 };
  const h = me.heroes[0];
  h.stamina = 100000;

  const blizko = zpristupni(G, 0, cap.q, cap.r, 2, 6);
  test("cíl v dosahu projde", !!blizko && g.startMarch(me, blizko, { inf: 50, arch: 0, cav: 0 }, 0));
  me.marches = []; h.pos = null; h.army = { inf: 0, arch: 0, cav: 0 };

  const daleko = zpristupni(G, 0, cap.q, cap.r, g.REACH + 2, g.REACH + 8);
  test("cíl za dosahem kapitálu je odmítnut",
    !!daleko && g.startMarch(me, daleko, { inf: 50, arch: 0, cav: 0 }, 0) === false);

  // výspa vedle vzdáleného cíle → usazení → útok projde
  const vyspa = [...G.tiles.values()].find(t =>
    dist(t, daleko) <= 3 && t.owner === -1 && !t.structure && !t.big && !t.riv
    && ["plains", "forest", "hills", "ruins"].includes(t.terrain));
  vyspa.owner = 0; vyspa.structure = "outpost"; vyspa.outpost = { inf: 0, arch: 0, cav: 0 };
  h.pos = kk(vyspa.q, vyspa.r);
  h.army = { inf: 200, arch: 0, cav: 0 };
  test("usazení mimo výspu selže (běžné pole)", (() => {
    const puv = h.pos;
    h.pos = kk(blizko.q, blizko.r); // stojí na běžném poli
    const r = g.heroSettle(me, 0) === false;
    h.pos = puv;
    return r;
  })());
  test("usazení na vlastní výspě projde", g.heroSettle(me, 0) === true && h.zakladna === h.pos);
  test("po usazení je vzdálený cíl v dosahu", g.vDosahu(me, h, daleko));
  test("útok z výspy projde", g.startMarch(me, daleko, null, 0));
  me.marches = []; h.pos = kk(vyspa.q, vyspa.r); h.army = { inf: 200, arch: 0, cav: 0 };

  // pád výspy vrací základnu pod kapitál (líná validace)
  vyspa.owner = 3;
  test("pád výspy → základna zpět kapitál", g.heroBaseKey(me, h) === me.capKey);
  vyspa.owner = 0;
  test("vrácení výspy → základna zase platí", g.heroBaseKey(me, h) === h.zakladna);

  // návrat domů resetuje základnu
  test("odvolání domů jde", g.startRecall(me, 0));
  let pojistka = 0;
  while (me.marches.length && pojistka++ < 900) g.doTick();
  test("po návratu domů je základna kapitál", pojistka < 900 && h.zakladna === null);

  // regrese: snapshot ze staršího serveru nemá capKey — fallback nesmí spadnout
  test("capKeyOf bez capKey padá na CAPITAL_POS (žádná rekurze)",
    g.capKeyOf({ id: 0 }) === me.capKey);
}

// ---------- 2. Obléhací okna ----------
sada("2. Obléhací okno: pobitá posádka, bourání, obnova");
{
  g.newGame(0, 43, [0]);
  g.G.faze = 4; // v0.30: scény testují mechaniky, ne otevírání zón
  const G = g.G, me = G.factions[0];
  const pevnost = G.tiles.get("8,0"); // brána vnitřních hradeb, posádka 500
  const soused = G.tiles.get("7,0");
  soused.owner = 0; soused.structure = null; soused.garrison = 0; delete soused.riv;
  soused.terrain = "plains";
  const h = me.heroes[0];
  h.pos = kk(7, 0);
  h.army = { inf: 5000, arch: 5000, cav: 5000 };   // ETAPA 6: posádky vzrostly 5,56×
  h.stamina = 100000;
  h.zakladna = null;
  me.resources.gold = 999999;
  // dosah: kapitál (23,9) → (8,0) je 24 > REACH — výspa vedle
  const vys = G.tiles.get("6,0");
  vys.owner = 0; vys.structure = "outpost"; vys.outpost = { inf: 0, arch: 0, cav: 0 };
  delete vys.riv; vys.terrain = "plains"; vys.garrison = 0;
  h.zakladna = "6,0";

  test("útok na pevnost vyjel", g.startMarch(me, pevnost, null, 0));
  let m = me.marches.find(x => x.kind === "attack");
  m.ticksLeft = 1; g.doTick();
  test("výhra nad posádkou NEzabírá", pevnost.owner === -1);
  test("okno je otevřené", pevnost.okno > 0);
  test("odolnost na plné hodnotě", pevnost.odol === g.SIEGE_HP.fortress);
  test("posádka pobita", pevnost.garrison === 0);
  test("hrdina táboří na výchozím poli", h.pos === "7,0");
  test("běží obléhací odpočet", me.marches.some(x => x.kind === "siege"));

  // posádka během okna nedorůstá
  const gar0 = pevnost.garrison;
  g.doTick(); g.doTick();
  test("posádka během okna nedorůstá", pevnost.garrison === gar0);

  // náběh boří odolnost bez vlastních ztrát
  const pred = g.armyTotal(h.army);
  const odolPred = pevnost.odol;
  let sieg = me.marches.find(x => x.kind === "siege");
  sieg.ticksLeft = 1; g.doTick();
  m = me.marches.find(x => x.kind === "attack");
  test("náběh po táboření vyjel", !!m);
  if (m) { m.ticksLeft = 1; g.doTick(); }
  const dobyto = pevnost.owner === 0;
  test("bourání srazilo odolnost (nebo rovnou dobylo)",
    dobyto || pevnost.odol < odolPred);
  test("útočník při bourání nekrvácí", g.armyTotal(h.army) === pred);

  // obnova po promeškaném okně (čerstvá scéna)
  g.newGame(0, 44, [0]);
  g.G.faze = 4; // v0.30: scény testují mechaniky, ne otevírání zón
  const G2 = g.G;
  const pev2 = G2.tiles.get("0,8");
  pev2.okno = 2; pev2.odol = 700; pev2.garrison = 0;
  g.doTick(); g.doTick();
  test("promeškané okno: okno pryč", !(pev2.okno > 0));
  test("promeškané okno: odolnost plná (smazaná)", pev2.odol === undefined);
  test("promeškané okno: posádka zpět", pev2.garrison === g.STRUCTURES.fortress.militia);
}

// ---------- 3. Vyhlášení války ----------
sada("3. Válka: postih kraje, kapitál, cooldown, pakt");
{
  g.newGame(0, 45, [0]);
  g.G.faze = 4; // v0.30: scény testují mechaniky, ne otevírání zón
  const G = g.G, me = G.factions[0];
  me.resources.gold = 999999;

  // postih bourání v cizím DRŽENÉM kraji: grandfort Zlaté marky (12,4) drží durgar
  const gf = G.tiles.get("12,4");
  test("grandfort Zlaté marky existuje", !!gf && gf.structure === "grandfort");
  gf.owner = 2; // durgar drží bránu
  // ETAPA 7: kraj drží ten, kdo má jeho KEEP; grandfort je jen záloha, když
  // se keep nepodařilo postavit. Scéna proto musí předat i keep.
  for (const t of G.tiles.values())
    if (t.structure === "keep" && g.regionOf(t) === g.regionOf(gf)) t.owner = 2;
  for (const bk of ["11,4", "13,4", "12,3", "12,5"]) {
    const b = G.tiles.get(bk);
    if (b && b.structure === "bastion") b.owner = 2;
  }
  test("držitel kraje je durgar", g.regionHolderId(gf) === 2);

  // výchozí pole útoku = bašta (13,4) sousedící s grandfortem
  const odraz = G.tiles.get("13,4");
  odraz.owner = 0; odraz.garrison = 0;
  const h = me.heroes[0];
  h.pos = "13,4";
  h.army = { inf: 400, arch: 300, cav: 300 };
  h.stamina = 100000;
  const vys = G.tiles.get("14,5");
  vys.owner = 0; vys.structure = "outpost"; vys.outpost = { inf: 0, arch: 0, cav: 0 };
  delete vys.big; delete vys.riv; vys.terrain = "plains"; vys.garrison = 0;
  h.zakladna = "14,5";

  // okno na grandfortu už otevřené, bourá se bez války → 30 % síly
  gf.okno = 500; gf.odol = g.SIEGE_HP.grandfort; gf.garrison = 0;
  test("útok na grandfort vyjel", g.startMarch(me, gf, null, 0));
  let m = me.marches.find(x => x.kind === "attack");
  m.ticksLeft = 1; g.doTick();
  const uderBezValky = g.SIEGE_HP.grandfort - gf.odol;
  test("bez války jen ~30 % bourání", uderBezValky > 0
    && uderBezValky < g.armyCp(h.army, me) * 0.5);

  // vyhlášení války a plný úder
  test("vyhlášení války projde", g.declareWar(me, 2));
  test("jeValka platí", g.jeValka(me, 2));
  test("cooldown blokuje druhé vyhlášení", g.declareWar(me, 3) === false);
  const odolPred = gf.odol;
  // zrušit táboření a vyslat znovu (čistý úder)
  me.marches = me.marches.filter(x => x.kind !== "siege");
  h.pos = "13,4";
  test("druhý útok vyjel", g.startMarch(me, gf, null, 0));
  m = me.marches.find(x => x.kind === "attack");
  m.ticksLeft = 1; g.doTick();
  const uderSValkou = odolPred - gf.odol;
  test("s válkou boří naplno (≥3× víc)", uderSValkou >= uderBezValky * 2.5);

  // válka trhá pakt a nechává zradu
  g.newGame(0, 46, [0]);
  g.G.faze = 4; // v0.30: scény testují mechaniky, ne otevírání zón
  const G3 = g.G, me3 = G3.factions[0], cil = G3.factions[4];
  me3.pacts[4] = 500; cil.pacts[0] = 500;
  test("vyhlášení přes pakt projde", g.declareWar(me3, 4));
  test("pakt je roztržen", !me3.pacts[4] && !cil.pacts[0]);
  test("zrada zapsána (grudge)", cil.grudge[0] === 1);

  // kapitál jen s vyhlášenou válkou
  const obCap = G3.tiles.get(G3.factions[5].capKey);
  const u = G3.tiles.get(kk(obCap.q - 2, obCap.r));
  u.owner = 0; u.structure = null; u.garrison = 0; delete u.big; delete u.riv; u.terrain = "plains";
  const h3 = me3.heroes[0];
  h3.pos = kk(u.q, u.r);
  h3.army = { inf: 500, arch: 0, cav: 0 };
  h3.stamina = 100000; h3.zakladna = null;
  me3.resources.gold = 99999;
  test("útok na kapitál bez války odmítnut", g.startMarch(me3, obCap, null, 0) === false);
  me3.valkaCd = 0;
  test("válka na sarn projde", g.declareWar(me3, 5));
  // ETAPA 7 (rozhodnutí uživatele 30. 8.): kapitál stojí v KOLÉBCE, do které
  // cizí rod nevstoupí vůbec — ani s vyhlášenou válkou. Rod se nedá vyhnat
  // z domova; tlak se přesouvá na crossing, který musí vítěz držet.
  test("kapitál leží v kolébce svého rodu", g.kolebkaOf(obCap) === 5);
  test("ani s válkou útok na kapitál NEPROJDE", g.startMarch(me3, obCap, null, 0) === false);
  test("do cizí kolébky se nedostane nikdo", g.jeCiziKolebka(me3, obCap));
}

// ---------- 4. Vykořenění ----------
sada("4. Vykořenění: přesídlení místo eliminace");
{
  g.newGame(0, 47, [0]);
  g.G.faze = 4; // v0.30: scény testují mechaniky, ne otevírání zón
  const G = g.G, me = G.factions[0], ob = G.factions[5]; // sarn — soused aldaru
  const staryKlic = ob.capKey;
  const obCap = G.tiles.get(staryKlic);
  ob.units = { inf: 0, arch: 0, cav: 0 };
  for (const hh of ob.heroes) { hh.pos = null; hh.army = { inf: 0, arch: 0, cav: 0 }; }
  // ETAPA 7: cizí útok tohle spustit UŽ NEMŮŽE — kapitál je v nedotknutelné
  // kolébce. Mechanika ale žije dál pro města ČLENŮ (ta můžou stát v expanzní
  // zóně) a jako pojistka, takže se přesídlení volá přímo.
  test("cizí útok na kapitál je nemožný", g.startMarch(me, obCap, null, 0) === false);
  g.resettleFaction(5, me);   // bere ID frakce, ne objekt

  test("frakce ŽIJE (vykořenění, ne eliminace)", ob.alive === true);
  test("kapitál se přestěhoval", ob.capKey !== staryKlic);
  const novy = G.tiles.get(ob.capKey);
  test("nový kapitál stojí a patří poraženému",
    !!novy && novy.structure === "capital" && novy.owner === 5);
  test("nový kapitál je blok 3×3", novy.bigSize === 3 && novy.bigKeys.length === 8);
  test("nový kapitál je v závětří (dál od středu)",
    Math.abs(novy.q) + Math.abs(novy.r) > Math.abs(obCap.q) + Math.abs(obCap.r));
  test("nový kapitál je ve vlastním kraji",
    g.regionOf(novy) === g.REGION_NAMES[5]);
  // Přepis starého bloku na město a jeho předání dobyvateli dělá až
  // resolveDemolice, tedy CESTA ÚTOKEM. Ta u frakčního kapitálu od etapy 7
  // neexistuje (kolébka je nedotknutelná) a zbývá jen pro města ČLENŮ
  // v expanzní zóně — samotné přesídlení se stará jen o nový kapitál.
  test("starý kapitál zůstává poraženému (útokem se k němu nikdo nedostane)",
    obCap.owner === 5);
  test("heroPosOf míří na nový kapitál",
    g.capPosOf(ob).q === novy.q && g.capPosOf(ob).r === novy.r);
}

// ---------- 5. Odebrání pole (v0.39) ----------
sada("5. Odebrání pole: odpočet, zámky, návrat divočině");
{
  g.newGame(0, 7, [0]);
  g.G.faze = 4;
  const G = g.G, me = G.factions[0];
  const volne = zpristupni(G, 0, g.capPosOf(me).q, g.capPosOf(me).r, 2, 6);
  volne.owner = 0; volne.garrison = 0;
  const predPoli = g.pocetPoli(me);

  test("čerstvé pole jde odebrat", g.canAbandonTile(me, volne) === true);
  test("kapitál odebrat nejde", g.canAbandonTile(me, G.tiles.get(me.capKey)) === false);
  test("cizí pole odebrat nejde",
    g.canAbandonTile(me, [...G.tiles.values()].find(t => t.owner === -1)) === false);

  test("zahájení nastaví odpočet", g.abandonTile(me, volne) === true
    && volne.abandon === g.ABANDON_TICKS);
  test("podruhé už nejde (běží)", g.abandonTile(me, volne) === false);
  test("pole je pořád moje a počítá se do stropu",
    volne.owner === 0 && g.pocetPoli(me) === predPoli);
  test("zrušení odpočet smaže",
    g.cancelAbandon(me, volne) === true && volne.abandon === undefined);

  me.heroes[0].pos = kk(volne.q, volne.r);
  test("pole s vlastním hrdinou odebrat nejde", g.canAbandonTile(me, volne) === false);
  me.heroes[0].pos = null;
  me.resources.stone = 9999; me.resources.wood = 9999; me.resources.gold = 9999;
  g.buildOutpost(me, volne);
  test("výspu odebrat nejde", g.canAbandonTile(me, volne) === false);
  delete volne.structure; delete volne.outpost;

  g.abandonTile(me, volne);
  for (let i = 0; i < g.ABANDON_TICKS - 1; i++) g.doTick();
  test("těsně před koncem pole pořád drží", volne.owner === 0 && volne.abandon === 1);
  g.doTick();
  test("po odpočtu je pole neutrální", volne.owner === -1 && volne.abandon === undefined);
  test("posádka se obnovila", volne.garrison > 0);
  test("uvolnilo se místo ve stropu", g.pocetPoli(me) === predPoli - 1);
}

console.log(`\n${proslo} prošlo, ${selhalo} selhalo`);
if (selhalo) process.exit(1);
