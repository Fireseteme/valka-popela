// Etapa 6 (v0.52): práh obrany, velké jednotky T4, přední a zadní linie.
// Kotvy, které etapa 6 teprve přeměřuje, jsou v tests/etapa6.js.
const g = require("../js/game.js");

let proslo = 0, selhalo = 0;
const test = (jmeno, ok) => {
  if (ok) proslo++;
  else { selhalo++; console.log("  ❌ " + jmeno); }
};
const sada = jmeno => console.log("\n=== " + jmeno + " ===");
const kk = g.keyOf;

// vlastní pole s hrdinou, který na něm stojí s danou armádou
function polePodHrdinou(fi, armada) {
  g.newGame(0, 4242, null);
  const me = g.G.factions[fi];
  // na startu drží frakce jen blok kapitálu 3×3, takže si prosté pole zabereme
  // ETAPA 7: pole musí ležet v EXPANZNÍ zóně — do kolébky se nedá útočit
  const t = [...g.G.tiles.values()].find(x => x.owner === -1 && !x.structure
    && !x.big && !x.bigSize && !x.riv && g.TERRAIN[x.terrain].passable
    && g.zonaOf(x).startsWith("expanze-"));
  t.owner = me.id; t.garrison = 0; t.level = 3;
  const h = me.heroes[0];
  h.pos = kk(t.q, t.r);
  h.army = Object.assign(g.emptyArmy(), armada);
  return { me, t, h };
}

// ---------- 1. Práh obrany: prázdný batoh není zeď ----------
sada("1. Práh obrany 100 CP (IV-M)");

test("práh je 100 CP", g.OBRANA_MIN_CP === 100);

{
  const { me, t } = polePodHrdinou(0, {});                 // hrdina bez jednotek
  const c = g.tileDefComponents(t);
  test("hrdina bez jednotek do stohu nepatří", c.contributors.length === 0);
  const holy = g.armyTotal(c.army);

  const a99 = polePodHrdinou(0, { inf: 99 });              // těsně pod prahem
  const c99 = g.tileDefComponents(a99.t);
  test("99 CP do stohu nepatří", c99.contributors.length === 0);
  test("99 CP nepřidá ani jednotky", Math.abs(g.armyTotal(c99.army) - holy) < 0.5);

  const a100 = polePodHrdinou(0, { inf: 100 });            // přesně na prahu
  const c100 = g.tileDefComponents(a100.t);
  test("100 CP do stohu patří", c100.contributors.length === 1);
  test("100 CP přidá svých 100 jednotek",
    Math.abs(g.armyTotal(c100.army) - holy - 100) < 0.5);
}

{
  // sarn: jezdec stojí 2 CP, takže 50 kusů = 100 CP a 49 kusů = 98 CP
  const si = g.FACTION_DEFS.findIndex(f => f.key === "sarn");
  test("sarnská jízda váží 2 CP", g.uDef(g.G.factions[si], "cav").cp === 2);
  const pod = polePodHrdinou(si, { cav: 49 });
  test("sarn: 49 jezdců (98 CP) do stohu nepatří",
    g.tileDefComponents(pod.t).contributors.length === 0);
  const nad = polePodHrdinou(si, { cav: 50 });
  test("sarn: 50 jezdců (100 CP) do stohu patří",
    g.tileDefComponents(nad.t).contributors.length === 1);
  test("práh měří CP, ne kusy — 50 jezdců váží jako 100 pěšáků",
    g.armyCp({ inf: 0, arch: 0, cav: 50 }, g.G.factions[si]) === 100);
}

{
  // hrdina pod prahem nesmí poli dát ani svého velitele: obranu vede
  // kapitán domobrany a bitva není „heroLed“
  const { t, h } = polePodHrdinou(0, { inf: 10 });
  const sHrdinou = g.tileDefComponents(t);
  const misto = h.pos;
  h.pos = null;                                   // totéž pole úplně bez hrdiny
  const bezHrdiny = g.tileDefComponents(t);
  test("pod prahem nejsou přispěvatelé", sHrdinou.contributors.length === 0);
  test("pod prahem je obrana stejná jako bez hrdiny",
    sHrdinou.mult === bezHrdiny.mult
    && Math.abs(g.armyTotal(sHrdinou.army) - g.armyTotal(bezHrdiny.army)) < 0.5);
  h.pos = misto;
  test("hrdina na poli přesto stojí (jen nebrání)", h.pos === kk(t.q, t.r));
}


// ---------- 2. Vlajkové jednotky T4 ----------
sada("2. Vlajkové jednotky T4 (IV-M)");

{
  const CP_PLAN = { aldar: 25, yllien: 25, durgar: 25, brakkar: 2,
                    sarn: 25, horda: 100, vhorren: 4, gryk: 25 };
  let vsechny = true, vydrz = true, vystup = true, cena = true;
  for (const fk of Object.keys(g.FACTION_UNITS)) {
    const u = g.FACTION_UNITS[fk], b = u.big;
    if (!b || !b.velka || b.cp !== CP_PLAN[fk]) { vsechny = false; continue; }
    const z = u[g.VELKE_DEFS[fk].zaklad || "inf"], zcp = z.cp || 1;
    // „výdrž, ne výstup": na BOD VELENÍ víc životů a míň poškození než základ
    if (b.hp / b.cp <= z.hp / zcp) vydrz = false;
    if (b.dmg / b.cp >= z.dmg / zcp) vystup = false;
    for (const r in z.cost)
      if (Math.abs(b.cost[r] / b.cp - z.cost[r] / zcp * 1.3) > 1) cena = false;
  }
  test("každý rod má vlajku s CP dle plánu", vsechny);
  test("vlajka má na CP víc životů než základ rodu", vydrz);
  test("vlajka má na CP míň poškození než základ rodu", vystup);
  test("vlajka stojí na CP o 30 % víc", cena);
}

{
  g.newGame(0, 4242, null);
  const me = g.G.factions[0];
  // od 31. 8. 2026 chce vlajka DVĚ podmínky: kasárny 4 A hlavní budovu 7
  // (zadání uživatele — T4 nemá být k mání po pár dnech sezóny)
  me.buildings.main = 7;
  me.buildings.barracks = 3;
  test("při kasárnách 3 je vlajka zamčená", !g.unitUnlocked(me, "big"));
  me.buildings.barracks = 4;
  test("kasárny 4 + hlavní budova 7 vlajku odemknou", g.unitUnlocked(me, "big"));
  me.buildings.main = 6;
  test("hlavní budova 6 vlajku ještě nepustí", !g.unitUnlocked(me, "big"));
  me.buildings.main = 7;
  test("kasárny jdou na úroveň 4", g.BUILDINGS.barracks.max === 4);
  test("vlajka se cvičí déle než pěchota",
    g.recruitTicks(me, "big") > g.recruitTicks(me, "inf"));
}

{
  // Bělovlas jedná dřív než kterákoli jiná formace, ale až po velitelích
  const ini = Object.keys(g.FACTION_UNITS)
    .flatMap(fk => ["inf", "arch", "cav"].map(k => g.FACTION_UNITS[fk][k].ini));
  test("Bělovlas jedná první ze všech formací",
    g.FACTION_UNITS.sarn.big.ini > Math.max(...ini));
  test("…ale až po velitelích (ti mají 1000+)", g.FACTION_UNITS.sarn.big.ini < 1000);
  test("gryfi jsou střelci, trolové clona",
    g.FACTION_UNITS.aldar.big.rada === "strelec" && g.FACTION_UNITS.durgar.big.rada === "clona");
}

// ---------- 3. Tři formace, volné složení ----------
sada("3. Tři formace, volné složení");

test("strop formací je 3", g.FORMACI_MAX === 3);
test("domobrana a neutrálové vlajku nemají", g.balancedArmy(300).big === 0);

{
  const a = Object.assign(g.emptyArmy(), { inf: 10, arch: 5, cav: 3 });
  test("tři druhy se sestavit dají", g.lzeSestavit(a) && g.pocetFormaci(a) === 3);
  a.big = 1;
  test("čtvrtý druh se sestavit nedá", !g.lzeSestavit(a) && g.pocetFormaci(a) === 4);
  const b = Object.assign(g.emptyArmy(), { inf: 10, big: 4 });
  test("dva druhy včetně vlajky projdou", g.lzeSestavit(b));
}

{
  // pochod se čtyřmi druhy se nesestaví
  g.newGame(0, 4242, null);
  const me = g.G.factions[0];
  me.resources.gold = 99999;
  Object.assign(me.units, { inf: 500, arch: 500, cav: 500, big: 40 });
  me.heroes[0].level = 50; me.heroes[0].stamina = 200;
  const cil = [...g.G.tiles.values()].find(t => t.owner === -1
    && g.isAdjacentToFaction(me, t) && g.TERRAIN[t.terrain].passable && !t.big);
  test("cíl pro pochod nalezen", !!cil);
  test("pochod se čtyřmi druhy neprojde",
    !g.startMarch(me, cil, { inf: 100, arch: 100, cav: 100, big: 10 }, 0));
  test("pochod se třemi druhy projde",
    g.startMarch(me, cil, Object.assign(g.emptyArmy(), { inf: 100, arch: 100, big: 10 }), 0));
}

{
  // AI si vybere nejvýš tři druhy, i když má v zásobě čtyři
  g.newGame(0, 4242, null);
  const f = g.G.factions[1];
  Object.assign(f.units, { inf: 400, arch: 300, cav: 200, big: 30 });
  const vyber = g.aiSlice(f, 2000);
  test("aiSlice vybere nejvýš tři druhy", vyber && g.pocetFormaci(vyber) <= 3);
  const f2 = g.G.factions[2];
  Object.assign(f2.units, g.emptyArmy(), { inf: 10, big: 60 });
  const v2 = g.aiSlice(f2, 2000);
  test("aiSlice sáhne po vlajce, když je v zásobě nejsilnější", !!(v2 && v2.big > 0));
}

{
  // stav uložený před v0.52 nemá čtvrtý slot — doplní se
  g.newGame(0, 4242, null);
  const f = g.G.factions[0];
  delete f.units.big;
  f.heroes[0].army = { inf: 5, arch: 0, cav: 0 };
  g.normalizujArmady(g.G);
  test("normalizace doplní zásobu", f.units.big === 0);
  test("normalizace doplní armádu hrdiny", f.heroes[0].army.big === 0);
  test("aritmetika snese armádu bez slotu",
    Number.isFinite(g.armyTimeMult({ inf: 5, arch: 0, cav: 0 }, f))
    && g.armyTotal({ inf: 5, arch: 0, cav: 0 }) === 5);
}


// ---------- 4. Formace v bojovém reportu ----------
sada("4. Formace v bojovém reportu");

{
  g.newGame(0, 4242, null);
  const A = g.G.factions[0], D = g.G.factions[3];
  const sim = g.simulateBattle({
    attacker: { faction: A, army: Object.assign(g.emptyArmy(), { inf: 400, arch: 300, big: 12 }), hero: null, mult: 1 },
    defender: { faction: D, army: Object.assign(g.emptyArmy(), { inf: 300, arch: 400, cav: 200 }), hero: null, mult: 1 },
    seed: 7, defMult: 1,
  });
  test("bitva vrací střety formací", Array.isArray(sim.strety) && sim.strety.length > 0);
  test("střet nese stranu, útočníka, cíl i poškození",
    sim.strety.every(x => (x.s === "a" || x.s === "d")
      && (x.k === null || g.UNIT_KEYS.includes(x.k))
      && g.UNIT_KEYS.includes(x.c) && x.d > 0));
  test("střety jsou seřazené od nejsilnějšího",
    sim.strety.every((x, i) => i === 0 || sim.strety[i - 1].d >= x.d));
  test("součet střetů sedí s celkovým poškozením (±2 %)", (() => {
    const suma = sim.strety.reduce((a, x) => a + x.d, 0);
    const celkem = sim.tot.dmgA + sim.tot.dmgD;
    return Math.abs(suma - celkem) / Math.max(1, celkem) < 0.02;
  })());
  test("nikdo nemíří na formaci, kterou nemá", sim.strety.every(x => {
    const cilova = x.s === "a" ? sim.initD : sim.initA;
    const vlastni = x.s === "a" ? sim.initA : sim.initD;
    return (x.vl ? vlastni : cilova)[x.c] > 0;
  }));
  test("role formací jsou clona/střelec/jízda", g.UNIT_KEYS.every(k =>
    ["clona", "strelec", "jizda"].includes(g.radaJednotky(g.unitsOf("aldar"), k))));
}

// ---------- 5. Velikost světa podle počtu hráčů ----------
sada("5. Velikost světa podle počtu hráčů");

test("cíl polí na hráče je základ stropu území",
  g.CIL_POLI_NA_HRACE === g.STROP_BASE);
test("nejmenší svět je testovaných 69×69", g.MAP_R_MIN === 34);
test("kapacita roste s plochou",
  g.hracuNaFrakci(34) < g.hracuNaFrakci(55) && g.hracuNaFrakci(55) < g.hracuNaFrakci(130));
test("na 69×69 uveze frakce jednotky hráčů, ne desítky",
  g.hracuNaFrakci(34) >= 4 && g.hracuNaFrakci(34) <= 10);
test("největší povolený svět uveze 800 hráčů",
  g.hracuNaFrakci(g.MAP_R_MAX) * 8 >= 800);
test("velikostProPocet vrátí svět, který ten počet opravdu uveze",
  [1, 2, 6, 13, 30, 50, 100].every(n => g.hracuNaFrakci(g.velikostProPocet(n)) >= n));
test("velikostProPocet je nejmenší takový svět",
  [2, 6, 13, 30, 50, 100].every(n => {
    const R = g.velikostProPocet(n);
    return R === g.MAP_R_MIN || g.hracuNaFrakci(R - 1) < n;
  }));
test("velikost je vždy v mezích",
  [1, 5, 100, 100000].every(n => {
    const R = g.velikostProPocet(n);
    return R >= g.MAP_R_MIN && R <= g.MAP_R_MAX;
  }));

{
  // kapacita ze země musí být podstatně přísnější než počet měst 3×3
  g.setMapRadius(34);
  g.newGameMulti([{ faction: 0, heroes: [0] }], 1);
  let mest = 1;
  while (mest < 200 && g.pridejClena(0, "m" + mest)) mest++;
  test("měst se vejde mnohem víc než uživí země (proto se počítá země)",
    mest > g.hracuNaFrakci(34) * 3);
  // a naměřená výseč musí sedět s podílem, ze kterého formule počítá
  const vysec = [...g.G.tiles.values()].filter(t => g.regionOf(t) === g.REGION_NAMES[0]).length;
  test("výseč je zhruba 11 % světa (na tom formule stojí)",
    vysec / g.G.tiles.size > 0.105 && vysec / g.G.tiles.size < 0.125);
  test("odhad kapacity není optimističtější než skutečná výseč",
    g.hracuNaFrakci(34) * g.CIL_POLI_NA_HRACE <= vysec);
  g.setMapRadius(34);
}


// ---------- 6. Schopnosti vlajkových jednotek ----------
sada("6. Schopnosti vlajek (IV-M)");

// A/B na TÉŽE scéně: schopnost se jen vypne a zase zapne, takže rozdíl
// nemůže pocházet z jiné armády ani z jiných kostek.
function bitvaVlajek(utok, obrana, seed) {
  const F = k => g.G.factions.find(f => f.key === k);
  const A = o => Object.assign(g.emptyArmy(), o);
  return g.simulateBattle({
    attacker: { faction: F(utok[0]), army: A(utok[1]), hero: null, mult: 1 },
    defender: { faction: F(obrana[0]), army: A(obrana[1]), hero: null, mult: 1 },
    seed, defMult: 1,
  });
}
function ab(kus, pole, vypnuto, mereni, n = 12) {
  const puvodni = kus[pole];
  const beh = () => {
    let s = 0;
    for (let i = 0; i < n; i++) s += mereni(300 + i * 29);
    return s / n;
  };
  // uDef jede přes keš (jazyk jmen) — po zásahu do předlohy ji zahodit,
  // jinak by se měřilo pořád totéž
  kus[pole] = vypnuto;  g.zrusKesJednotek();
  const bez = beh();
  kus[pole] = puvodni;  g.zrusKesJednotek();
  return { bez, se: beh() };
}

g.newGame(0, 42, null);

{
  const T = g.FACTION_UNITS.durgar.big;
  test("trol i ent mají taunt s obranným oknem",
    T.taunt === 3 && T.tauntDef > 0 && g.FACTION_UNITS.yllien.big.taunt === 3);
  const r = ab(T, "taunt", 0, seed =>
    g.armyTotal(bitvaVlajek(["aldar", { inf: 1400, cav: 500 }],
                            ["durgar", { inf: 400, arch: 300, big: 16 }], seed).attLosses));
  test("taunt zdraží přejezd aspoň dvojnásobně", r.se > r.bez * 2);
  // a nesmí z něj udělat zeď: útok musí pořád projít
  let vyher = 0;
  for (let i = 0; i < 12; i++)
    if (bitvaVlajek(["aldar", { inf: 1400, cav: 500 }],
                    ["durgar", { inf: 400, arch: 300, big: 16 }], 300 + i * 29).won) vyher++;
  test("taunt pole neubrání vždy (jinak je to jen strop kol)", vyher === 12);
}

{
  const P = g.FACTION_UNITS.horda.big;
  test("Demon Prince má lifesteal i auru", P.lifesteal > 0 && P.aura === 25);
  const r = ab(P, "lifesteal", 0, seed =>
    bitvaVlajek(["horda", { big: 30 }], ["aldar", { inf: 1400, arch: 700 }], seed).remA.big);
  test("lifesteal nechá naživu víc princů", r.se > r.bez);
  test("lifesteal nepřeleze výchozí stav (je to léčení, ne množení)", r.se <= 30);
}

{
  // aura dopadá na OBĚ strany — to je celá její cena
  const P = g.FACTION_UNITS.horda.big;
  const zmer = () => {
    let vlastni = 0, cizi = 0;
    for (let i = 0; i < 12; i++) {
      const s = bitvaVlajek(["horda", { inf: 800, arch: 400, big: 25 }],
                            ["aldar", { inf: 1500, arch: 800 }], 300 + i * 29);
      for (const x of s.strety) if (x.vl) (x.s === "a" ? vlastni++ : cizi++);
    }
    return { vlastni, cizi };
  };
  const puv = P.aura;
  P.aura = 0;  g.zrusKesJednotek();
  const bez = zmer();
  P.aura = puv;  g.zrusKesJednotek();
  const se = zmer();
  test("bez aury se nikdo neobrátí proti svým", bez.vlastni === 0 && bez.cizi === 0);
  test("aura obrací nepřítele", se.cizi > 0);
  test("aura obrací i VLASTNÍ řady hordy", se.vlastni > 0);
}

{
  const W = g.FACTION_UNITS.gryk.big;
  test("warboss škáluje zlatem se stropem", W.zlato && W.zlato.max === 0.4);
  const gryk = g.G.factions.find(f => f.key === "gryk");
  const zmer = zlato => {
    gryk.resources.gold = zlato;
    let s = 0;
    for (let i = 0; i < 8; i++)
      s += bitvaVlajek(["gryk", { big: 40 }], ["aldar", { inf: 3000 }], 300 + i * 29).tot.dmgA;
    return s / 8;
  };
  const chudy = zmer(0), bohaty = zmer(60000), pres = zmer(500000);
  test("bohatý gryk bije silněji", bohaty > chudy * 1.3);
  test("strop drží — půl milionu nedá víc než 60 tisíc", Math.abs(pres - bohaty) < 1);
  gryk.resources.gold = 0;
}

{
  const N = g.FACTION_UNITS.vhorren.big;
  test("nekromant konvertuje", N.konverze > 0);
  const r = ab(N, "konverze", 0, seed =>
    bitvaVlajek(["vhorren", { inf: 900, big: 150 }], ["aldar", { inf: 900, arch: 600 }], seed).defKilled);
  test("konverze zvyšuje ztráty obránce", r.se > r.bez * 1.2);
  // ale vzkříšení se domů nevrátí — přeživší se ořezávají na výchozí stav
  const s = bitvaVlajek(["vhorren", { inf: 900, big: 150 }], ["aldar", { inf: 300, arch: 200 }], 7);
  test("konvertovaní se domů nevrátí (strop na výchozím stavu)",
    g.UNIT_KEYS.every(k => s.remA[k] <= s.initA[k]));
}

{
  // Bělovlas jedná první ze všech formací — ověřeno na skutečném pořadí kol
  const s = bitvaVlajek(["sarn", { big: 40 }], ["aldar", { inf: 2000, arch: 1000 }], 11);
  test("Bělovlas se v bitvě opravdu dostane ke slovu",
    s.strety.some(x => x.s === "a" && x.k === "big"));
}


// ---------- 7. AI a vlajkové jednotky ----------
sada("7. AI a vlajky");

{
  g.newGame(0, 42, null);
  const f = g.G.factions[0];
  f.buildings.main = 7;
  f.buildings.barracks = 3;
  test("bez kasáren 4 jede AI na základní trojici",
    g.aiTrio(f).join() === "inf,arch,cav");
  f.buildings.barracks = 4;
  const trio = g.aiTrio(f);
  test("s vlajkou má AI pořád jen tři druhy", trio.length === 3 && trio.includes("big"));
  test("vlajka nahradí ZÁKLADNÍ jednotku své role", (() => {
    const ud = g.unitsOf(f);
    const role = g.radaJednotky(ud, "big");
    // ve trojici nesmí zůstat základní jednotka téže role
    return !trio.some(k => k !== "big" && g.radaJednotky(ud, k) === role);
  })());
}

{
  // AI musí vlajku opravdu naverbovat, ne ji jen odemknout
  g.newGame(0, 42, null);
  const f = g.G.factions[1];
  f.isAI = true;
  f.buildings.barracks = 4;
  f.buildings.main = 7;      // od 31. 8. 2026 je vlajka i za hlavní budovou 7
  for (const r of g.RES_KEYS) f.resources[r] = 999999;
  f.resources.gold = 999999;
  // ostatní druhy má plné, vlajka je v CP nejchudší → musí na ni dojít řada
  // POZOR na dva prahy verbování: AI neverbuje s obří armádou (4449 kusů)
  // ani když ji neuživí jídlem — proto malá zásoba
  Object.assign(f.units, g.emptyArmy(), { inf: 100, arch: 100, cav: 100 });
  let naverbovano = false;
  for (let i = 0; i < 40 && !naverbovano; i++) {
    f.recruitQueue.length = 0;
    g.aiTurn(f);
    naverbovano = f.recruitQueue.some(q => q.type === "big");
  }
  test("AI vlajku naverbuje", naverbovano);
  const davka = f.recruitQueue.find(q => q.type === "big");
  test("objednávka je v bodech velení, ne po dávkách 56 kusů",
    davka && davka.count > 0 && davka.count * g.uDef(f, "big").cp <= g.RECRUIT_BATCH * 1.2);
}


// ---------- 8. Budovy pro dlouhou sezónu a druhý rod (IV-O) ----------
sada("8. Budovy pro dlouhou sezónu a druhý rod (IV-O)");

{
  test("hlavní budova jde na 8", g.BUILDINGS.main.max === 8);
  test("akademie dává +100 velení za úroveň", g.AKADEMIE_CAP === 100);
  g.newGame(0, 42, null);
  const f = g.G.factions[0];
  f.buildings.academy = 0;
  const bez = g.heroArmyCap(f, 0);
  f.buildings.academy = 10;
  test("deset úrovní akademie = +1000 CP", g.heroArmyCap(f, 0) === bez + 1000);
  test("…a je to znatelný podíl stropu, ne šum",
    (g.heroArmyCap(f, 0) - bez) / bez > 0.15);
  f.buildings.academy = 0;
}

{
  // doby stavby jsou PODÍL SEZÓNY, ne pevné vteřiny
  const puvodni = g.SEASON_TICKS;
  g.setSeasonHours(1);
  const hodina = g.buildTicks(g.BUILDINGS.main.time[8]);
  g.setSeasonHours(336);
  const dvaTydny = g.buildTicks(g.BUILDINGS.main.time[8]);
  test("delší sezóna = úměrně delší stavba", Math.abs(dvaTydny / hodina - 336) < 1);
  test("na hodinové sezóně zůstávají původní časy", hodina === g.BUILDINGS.main.time[8]);
  g.setSeasonHours(1);
  test("stavba nikdy netrvá nula tiků", g.buildTicks(1) >= 2);
}

{
  g.newGame(0, 42, null);
  const f = g.G.factions[0];                       // aldar = dobro
  test("bez hlavní budovy 8 se druhý rod vybrat nedá", !g.lzeVybratDruhyRod(f));
  f.buildings.main = g.DRUHY_ROD_MAIN;
  test("s hlavní budovou 8 už jde", g.lzeVybratDruhyRod(f));
  const nabidka = g.nabidkaDruhehoRodu(f);
  test("nabízí se jen VLASTNÍ strana",
    nabidka.length === 3 && nabidka.every(k => g.sideOfFaction(k) === g.sideOfFaction(f.key)));
  test("vlastní rod v nabídce není", !nabidka.includes(f.key));
  test("rod druhé strany se vybrat nedá", !g.zvolDruhyRod(f, "horda"));
  test("spojenec z vlastní strany ano", g.zvolDruhyRod(f, "brakkar"));
  test("volba je na celou sezónu a nejde změnit", !g.zvolDruhyRod(f, "sarn"));
  test("po volbě se druhý rod drží", f.druhyRod === "brakkar");
}

{
  g.newGame(0, 42, null);
  const f = g.G.factions[0];
  f.buildings.main = 8; f.buildings.barracks = 4;
  test("bez spojenectví jsou cizí jednotky zamčené",
    ["inf2", "arch2", "cav2"].every(k => !g.unitUnlocked(f, k)));
  test("…a uDef na nich nespadne (prázdná jednotka)",
    ["inf2", "arch2", "cav2"].every(k => g.uDef(f, k) && g.uDef(f, k).prazdna));
  g.zvolDruhyRod(f, "brakkar");
  test("se spojenectvím jsou odemčené",
    ["inf2", "arch2", "cav2"].every(k => g.unitUnlocked(f, k)));
  test("cizí jednotky mají staty spojence",
    g.uDef(f, "inf2").hp === g.FACTION_UNITS.brakkar.inf.hp);
  test("cizí VLAJKA se nepůjčuje — vlajka je vlastní",
    g.uDef(f, "big").name === g.FACTION_UNITS.aldar.big.name);
  test("jméno cizí jednotky nese rod původu", g.uDef(f, "inf2").name.includes("Brakkar"));
}

{
  // trojúhelník převah se dívá na DRUH, ne na klíč: cav2 je pořád jízda
  test("cav2 se počítá jako jízda", g.zakladniDruh("cav2") === "cav");
  test("vlastní klíče zůstávají samy sebou", g.zakladniDruh("big") === "big");
  g.newGame(0, 42, null);
  const f = g.G.factions[0];
  f.buildings.main = 8; f.buildings.barracks = 4;
  g.zvolDruhyRod(f, "brakkar");
  const ud = g.unitsOf(f);
  test("půjčená clona je pořád clona", g.radaJednotky(ud, "inf2") === "clona");
  test("půjčení střelci jsou pořád střelci", g.radaJednotky(ud, "arch2") === "strelec");
  test("půjčená jízda je pořád jízda", g.radaJednotky(ud, "cav2") === "jizda");
}

{
  // celý smysl IV-O: cizí clona před vlastními střelci
  g.newGame(0, 42, null);
  const A = g.G.factions[0], D = g.G.factions[3];
  A.buildings.main = 8; A.buildings.barracks = 4;
  g.zvolDruhyRod(A, "brakkar");
  const armada = Object.assign(g.emptyArmy(), { arch: 800, inf2: 600 });
  test("armáda ze dvou rodů se sestaví (pořád tři formace)", g.lzeSestavit(armada));
  const s = g.simulateBattle({
    attacker: { faction: A, army: armada, hero: null, mult: 1 },
    defender: { faction: D, army: Object.assign(g.emptyArmy(), { inf: 600, cav: 400 }), hero: null, mult: 1 },
    seed: 9, defMult: 1,
  });
  test("bitva s půjčenou clonou proběhne", s.rounds > 0 && Array.isArray(s.strety));
  test("nepřítel na naše střelce přes cizí clonu nedosáhne",
    !s.strety.some(x => x.s === "d" && x.c === "arch"
      && g.radaJednotky(g.unitsOf(D), x.k) !== "strelec" && x.k !== null));
}


// ---------- 9. Tier jako osa síly a rys healer (IV-H) ----------
sada("9. Tier jako osa síly a rys healer (IV-H)");

test("tier dává +5 % základu za stupeň", g.TIER_STAT_BONUS === 0.05);

{
  g.newGame(0, 42, null);
  const f = g.G.factions[0];
  const stat = idx => {
    f.heroes[0].defIdx = idx; f.heroes[0].level = 30; f.heroes[0].stars = 0;
    return g.heroStats(f, 0).hpMax;
  };
  const bezny = g.HERO_DEFS.aldar.findIndex((h, i) => g.heroTierOf("aldar", i) === 0);
  const epicky = g.HERO_DEFS.aldar.findIndex((h, i) => g.heroTierOf("aldar", i) === 1);
  const legend = g.HERO_DEFS.aldar.findIndex((h, i) => g.heroTierOf("aldar", i) === 2);
  // porovnává se hrdina BEZ bonusu rysu na životy (tireless a healer je mají)
  const cisty = i => !["tireless", "healer"].includes(g.HERO_DEFS.aldar[i].trait);
  if (cisty(bezny) && cisty(epicky) && cisty(legend)) {
    test("epický má o 5 % vyšší základ než běžný",
      Math.abs(stat(epicky) / stat(bezny) - 1.05) < 0.02);
    test("legendární o 10 %", Math.abs(stat(legend) / stat(bezny) - 1.10) < 0.02);
  } else {
    test("srovnávací hrdinové bez bonusu rysu na životy nalezeni", false);
  }
}

{
  let rozdeleniOk = true, starteriBezni = true, ranhojicu = 0;
  for (const fk of Object.keys(g.HERO_DEFS)) {
    const d = g.HERO_DEFS[fk];
    const poc = [0, 1, 2].map(t => d.filter((h, i) => g.heroTierOf(fk, i) === t).length);
    if (poc[0] !== 4 || poc[1] !== 2 || poc[2] !== 1) rozdeleniOk = false;
    if (g.heroTierOf(fk, g.STARTER_IDX[fk] ?? 0) !== 0) starteriBezni = false;
    ranhojicu += d.filter(h => h.trait === "healer").length;
  }
  test("každý rod má 4 běžné / 2 epické / 1 legendárního", rozdeleniOk);
  test("STARTOVNÍ hrdina je vždy běžný (dostává se zdarma)", starteriBezni);
  test("každý rod má právě jednoho ranhojiče", ranhojicu === 8);
}

{
  // legendárka je archetyp rodu, ne pořád mystik
  const legRysy = Object.keys(g.HERO_DEFS).map(fk =>
    g.HERO_DEFS[fk].find((h, i) => g.heroTierOf(fk, i) === 2).trait);
  test("legendárka NENÍ ve všech rodech stejný rys", new Set(legRysy).size > 1);
  test("legendárka rodu sedí s tabulkou archetypů",
    Object.keys(g.HERO_TIER_BY_ROD).every(fk =>
      g.HERO_DEFS[fk].find((h, i) => g.heroTierOf(fk, i) === 2).trait
        === g.HERO_TIER_BY_ROD[fk].leg));
  test("brakkarská legendárka je ranhojič (želva, co se hojí)",
    g.HERO_TIER_BY_ROD.brakkar.leg === "healer");
}

{
  const strom = g.HERO_DEFS.brakkar.find(h => h.trait === "healer").tree;
  test("strom ranhojiče má 12 uzlů", strom.length === 12);
  test("čtyři hlavní a osm větví",
    strom.filter(s => s.main).length === 4 && strom.filter(s => s.parent).length === 8);
  test("vrcholná dovednost je poslední hlavní",
    strom.filter(s => s.ult).length === 1 && strom[3].ult === true);
  test("ranhojič léčí armádu v průběhu bitvy",
    strom.some(s => s.eff && s.eff.type === "roundHeal"));
  test("má i mistrovské bonusy rysu", (g.TRAIT_MAX_EFFS.healer || []).length === 4);
  test("jeho vrchol je léčení každé druhé kolo",
    g.TRAIT_MAX_EFFS.healer.some(e => e.type === "roundHeal" && e.timing && e.timing.every === 2));
}

{
  // dary: jméno i ikona pro každý rod a rys, a skupina tieru sedí s archetypem
  test("dárek existuje pro každého hrdinu všech rodů",
    Object.keys(g.HERO_DEFS).every(fk => g.HERO_DEFS[fk].every((hd, i) => {
      const d = g.giftNameFor(fk, i);
      return d.name && d.name !== "Dárek" && d.icon;
    })));
  test("dar legendárního tieru se řídí archetypem rodu, ne pevnou trojicí",
    Object.keys(g.HERO_TIER_BY_ROD).every(fk =>
      g.giftTierTrait(fk, 2) === g.HERO_TIER_BY_ROD[fk].leg));
  test("skupinové dárky mají jméno pro všechny rody a tiery",
    Object.keys(g.HERO_DEFS).every(fk => [0, 1, 2].every(t => {
      const d = g.giftNameOf(fk + ":t" + t);
      return d.name && d.name !== "Dárek";
    })));
}

{
  // léčení musí být v boji vidět: ranhojič s naučeným stromem vrací ztráty
  g.newGame(0, 42, null);
  const f = g.G.factions[4];                       // brakkar
  f.isAI = true;                                   // obejde bránu oddanosti
  const idx = g.HERO_DEFS.brakkar.findIndex(h => h.trait === "healer");
  f.heroes[0].defIdx = idx; f.heroes[0].srcKey = "brakkar";
  f.heroes[0].level = 50; f.heroes[0].skillPts = 200;
  const strom = g.HERO_DEFS.brakkar[idx].tree;
  const uzel = strom.find(s => s.eff && s.eff.type === "roundHeal");
  for (let i = 0; i < 15; i++) g.learnSkill(f, 0, uzel.key);
  const st = g.heroStats(f, 0);
  test("léčení se propíše do bojových aktivek",
    (st.healActives || []).some(a => a.type === "roundHeal" && a.pct > 0));
}


// ---------- 10. Reset sezóny: síla je sezónní, sbírka trvalá (IV-H) ----------
sada("10. Reset sezóny (IV-H)");

{
  const klic = "aldar:" + (g.STARTER_IDX.aldar ?? 0);
  const acc = g.emptyAccount("veteran");
  acc.heroUnlocks[klic] = 1;
  acc.heroRespect[klic] = 900;
  acc.heroProgress[klic] = { level: 30, xp: 5000, stars: 6, skills: { valy: 5 }, skillPts: 12,
    equip: { weapon: { id: "w", slot: "weapon", name: "Meč", value: 10, rarity: 3, stars: 1 } } };
  acc.inventory = [{ id: "i", slot: "shield", name: "Štít", value: 8, rarity: 2, stars: 0 }];

  g.resetSezonyUctu(acc);
  const p = acc.heroProgress[klic];
  test("úroveň se nuluje", p.level === 1);
  test("zkušenosti se nulují", p.xp === 0);
  test("dovednosti se nulují", Object.keys(p.skills).length === 0);
  test("body z ÚROVNÍ padají, body za HVĚZDY zůstávají", p.skillPts === 6);
  test("hvězdy oddanosti zůstávají", p.stars === 6);
  test("výbava hrdiny zůstává", !!p.equip.weapon);
  test("odemčení hrdinové zůstávají", g.heroUnlocked(acc, klic));
  test("nasbíraná oddanost zůstává", acc.heroRespect[klic] === 900);
  test("sklad na účtu zůstává", acc.inventory.length === 1);

  // a po nasazení do nové sezóny musí hrdina opravdu začínat od jedničky
  g.newGame(0, 42, null);
  const f = g.G.factions[0];
  g.applyAccountToFaction(f, acc);
  const h = f.heroes[0];
  test("hrdina v nové sezóně startuje na úrovni 1", h.level === 1);
  test("…ale se svými hvězdami a výbavou",
    h.stars === 6 && Object.keys(h.equip || {}).length > 0);
}


// ---------- 11. Pořadí obránců (IV-M) ----------
sada("11. Pořadí obránců (IV-M)");

{
  // NEUTRÁLOVÉ: od nejslabšího, poslední bitva je boss
  g.newGame(0, 4242, null);
  const uzel = [...g.G.tiles.values()].find(t => g.dveArmady(t) && t.owner === -1);
  test("dvouarmádový objektiv se na mapě našel", !!uzel);
  const poradi = g.neutralPoradi(uzel, 2);
  const prvni = g.neutralCommander(uzel, poradi[0]);
  const druhy = g.neutralCommander(uzel, poradi[1]);
  test("první vlnu vede slabší velitel", g.neutralSila(prvni) <= g.neutralSila(druhy));
  test("vlny jsou 0,4 a 0,6 posádky (první menší)",
    g.NEUTRAL_VLNY[0] === 0.4 && g.NEUTRAL_VLNY[1] === 0.6);
  test("obě vlny dohromady dají celou posádku",
    Math.abs(g.NEUTRAL_VLNY.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  // pořadí se nesmí měnit mezi voláními (stejný objektiv = stejné pořadí)
  test("pořadí je deterministické",
    JSON.stringify(g.neutralPoradi(uzel, 2)) === JSON.stringify(poradi));
}

{
  // HRÁČSKÝ STOH: obranu vede ten, kdo dorazil PRVNÍ
  g.newGame(0, 4242, null);
  const me = g.G.factions[0];
  // ETAPA 7: pole musí ležet v EXPANZNÍ zóně — do kolébky se nedá útočit
  const t = [...g.G.tiles.values()].find(x => x.owner === -1 && !x.structure
    && !x.big && !x.bigSize && !x.riv && g.TERRAIN[x.terrain].passable
    && g.zonaOf(x).startsWith("expanze-"));
  g.setTileOwner(t, me.id, me.cid || 0);
  t.garrison = 0; t.level = 3;
  const kl = g.keyOf(t.q, t.r);

  // dva hrdinové na témže poli: slabší dorazil dřív, silnější později
  while (me.heroes.length < 2) me.heroes.push(g.makeHero(me.heroes.length));
  const slaby = me.heroes[0], silny = me.heroes[1];
  slaby.level = 5; silny.level = 40;
  const armada = () => Object.assign(g.emptyArmy(), { inf: 400 });
  g.G.tick = 100; g.postavHrdinu(slaby, kl); slaby.army = armada();
  g.G.tick = 500; g.postavHrdinu(silny, kl); silny.army = armada();

  test("hrdina si pamatuje tik příchodu", slaby.prisel === 100 && silny.prisel === 500);
  test("oba se počítají do obranného stohu",
    g.tileDefComponents(t).contributors.length === 2);

  // útok: velitelem obrany musí být ten, kdo stojí na poli déle
  const utok = g.G.factions[3];
  utok.resources.gold = 99999;
  utok.heroes[0].level = 50; utok.heroes[0].stamina = 200;
  // útočník musí mít ZÁKLADNU v dosahu — jinak startMarch cíl odmítne
  // (vzor pripravUtok z test-etapa4: soused se udělá vlastní výspou)
  g.G.faze = 4;
  const soused = g.neighborsOf(t).find(n => n && g.TERRAIN[n.terrain].passable && !n.big);
  g.setTileOwner(soused, utok.id, utok.cid || 0);
  soused.garrison = 0; soused.structure = "outpost"; soused.outpost = g.emptyArmy();
  utok.heroes[0].pos = g.keyOf(soused.q, soused.r);
  utok.heroes[0].zakladna = utok.heroes[0].pos;
  utok.heroes[0].army = Object.assign(g.emptyArmy(), { inf: 3000 });
  const pred = g.G.reports.length;
  const poslano = g.startMarch(utok, t, null, 0);
  test("útok na stoh jde vyslat", poslano);
  if (poslano) {
    utok.marches.find(m => m.kind === "attack").ticksLeft = 1;
    g.doTick();
    const rep = g.G.reports[g.G.reports.length - 1];
    test("bitva o stoh proběhla", g.G.reports.length > pred && !!rep);
    test("obranu vede ten, kdo dorazil PRVNÍ (ne ten silnější)",
      rep.def.leadName === g.heroDef(me, 0).name);
  }
}

{
  // příchod se přepisuje jen při SKUTEČNÉ změně pole
  g.newGame(0, 4242, null);
  const h = g.G.factions[0].heroes[0];
  g.G.tick = 10; g.postavHrdinu(h, "1,1");
  g.G.tick = 99; g.postavHrdinu(h, "1,1");
  test("setrvání na poli tik příchodu nemění", h.prisel === 10);
  g.postavHrdinu(h, "2,2");
  test("přesun na jiné pole ho přepíše", h.prisel === 99);
  g.postavHrdinu(h, null);
  test("odchod z pole ho nuluje", h.prisel === 0 && h.pos === null);
}

console.log(`\n${proslo} prošlo, ${selhalo} selhalo`);
process.exit(selhalo ? 1 : 0);
