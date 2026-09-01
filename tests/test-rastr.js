// Testy rastru balancu (v0.28, přeukotveno v0.34 SIGNATURE INTERMEZZEM):
// referenční build nese signature kus a sigy starterů jsou páky pavučiny.
// Hlídá TVAR PAVUČINY (bez porážky smí být JEN aldar — rozhodnutí uživatele,
// nikdo bez výhry, designové hrany kruhů), Edranovo krvácení (nesmí vyhrávat
// beze ztrát), PvE pásmo, identitu kitů i sigů a determinismus.
const g = require("../js/game.js");
const rastr = require("./rastr.js");

let proslo = 0, selhalo = 0;
const test = (jmeno, ok) => {
  if (ok) proslo++;
  else { selhalo++; console.log("  ❌ " + jmeno); }
};
// tvar pavučiny etapa 6 legitimně přepisuje (linie, T4, rebase velení) —
// do konce etapy se hlásí jako měření, pak se přeměří a přepínač vypne
const { okPremeri } = require("./etapa6.js");
const testE6 = (jmeno, ok) => {
  const x = okPremeri(ok, jmeno);
  if (x.ok) proslo++; else { selhalo++; console.log("  ❌ " + jmeno); }
};
const sada = jmeno => console.log("\n=== " + jmeno + " ===");

// ---------- 1. tvar pavučiny ----------
sada("1. Pavučina counterů — SKUTEČNÉ páry (starter + frakční jednotky + sig)");
const { fkeys, vysledky } = rastr.maticeFrakcni();
{
  const bezPorazky = [], bezVyhry = [];
  for (const a of fkeys) {
    const rady = fkeys.filter(b => b !== a).map(b => vysledky[a][b]);
    const sloupce = fkeys.filter(b => b !== a).map(b => vysledky[b][a]);
    if (!sloupce.some(v => v > 0) && rady.every(v => v >= 0)) bezPorazky.push(a);
    if (!rady.some(v => v > 0)) bezVyhry.push(a);
  }
  // ROZHODNUTÍ UŽIVATELE (29. 8. 2026): Edran smí zůstat na špici bez
  // přemožitele — „jestli je OP, tak je to dobře; ostatní půjdou nahoru" —
  // DOKUD ve výhrách krvácí (hlídá sada 2). Kletba, co by ho ulovila,
  // vyžadovala hodnoty ×6 mimo měřítko hry (změřeno hledačem v0.34).
  test(`bez porážky smí být jen aldar (${bezPorazky.join(",") || "nikdo"})`,
    bezPorazky.every(x => x === "aldar"));
  test(`nikdo bez výhry (${bezVyhry.join(",") || "✓"})`, bezVyhry.length === 0);
  // DESIGNOVÉ KRUHY — PŘEMĚŘENO PO ETAPĚ 6. Linie (IV-N) pavučinu přeskládaly
  // celou, jak plán předpokládal, takže kruhy z v0.34 už neplatí. Nové jsou
  // solidní (okraje 9–11 z 11 seedů), ne mincové:
  //   durgar > brakkar > gryk > durgar
  //   yllien > vhorren > brakkar > yllien
  test("durgar bije brakkara (vypálené rány proti hojení)", vysledky.durgar.brakkar > 0);
  test("brakkar bije gryka (želva proti roji)", vysledky.brakkar.gryk > 0);
  test("gryk bije durgara (Hlodá železo)", vysledky.gryk.durgar > 0);
  test("yllien bije vhorrena (střelba proti pomalým šikům)", vysledky.yllien.vhorren > 0);
  test("vhorren bije brakkara (magie obchází zbroj)", vysledky.vhorren.brakkar > 0);
  test("brakkar bije yllien (clona proti střelcům)", vysledky.brakkar.yllien > 0);
  test("vhorren bije brakkara (Rubáš bdění tlumí velitele)", vysledky.vhorren.brakkar > 0);
  test("horda bije vhorrena (kruh se uzavírá)", vysledky.horda.vhorren > 0);
}

// ---------- 2. Edran krvácí ----------
sada("2. Edran smí vládnout, jen dokud výhry nejsou zadarmo");
{
  // proti každému soupeři musí aldar v průměru ztratit aspoň 15 % armády
  // (naměřeno v0.34: 28–44 %) — kdyby kleslo pod práh, je čas na mírný zákrok
  for (const b of fkeys) {
    if (b === "aldar") continue;
    let ztraty = 0;
    for (let i = 0; i < 5; i++) {
      const r = rastr.duelFrakcni("aldar", b, 900 + i * 131);
      // velikost armády se odvozuje z rozpočtu rastru, ne z napevno
      // psaných 450 kusů — scéna se v etapě 6 přeškálovala s rebasem velení
      ztraty += 1 - r.zbyloA / (3 * rastr.CP_NA_SLOT);
    }
    const prum = Math.round((ztraty / 5) * 100);
    test(`vs ${b}: průměrné ztráty ${prum} % ≥ 15 %`, prum >= 15);
  }
}

// ---------- 3. PvE podlaha ----------
sada("3. PvE pásmo (běžné čištění polí)");
{
  const pve = rastr.pveTabulka();
  const p60 = fkeys.map(fk => pve[fk].p60).sort((a, b) => a - b);
  const med = p60[Math.floor(p60.length / 2)];
  const lo = med * 0.6, hi = med * 1.5;
  for (const fk of fkeys)
    test(`${fk}: ⚔60 → ${pve[fk].p60} v pásmu ${Math.round(lo)}–${Math.round(hi)}`,
      pve[fk].p60 >= lo && pve[fk].p60 <= hi);
  // monotonie: větší pole = větší náklad
  test("⚔160 dražší než ⚔60 u všech", fkeys.every(fk => pve[fk].p160 > pve[fk].p60));
}

// ---------- 4. identita kitů a sigů ----------
sada("4. Archetypové efekty v kitech a sigy starterů");
{
  const maTyp = (fk, typ) => {
    const idx = g.STARTER_IDX[fk];
    return g.HERO_DEFS[fk][idx].tree.some(s =>
      (s.effs || [s.eff]).some(e => e && e.type === typ));
  };
  test("aldar štítonoš: stunChance", maTyp("aldar", "stunChance"));
  test("yllien lukostřelec: slowEnemy", maTyp("yllien", "slowEnemy"));
  test("brakkar tank-heal: roundHeal", maTyp("brakkar", "roundHeal"));
  test("brakkar bez bonusů jednotkám", !maTyp("brakkar", "unitDmg") && !maTyp("brakkar", "roundArmy"));
  test("sarn kavalerista: unitDmg", maTyp("sarn", "unitDmg"));
  test("durgar siegemaster: structAtk", maTyp("durgar", "structAtk"));
  test("horda DD: shred nebo roundDmg", maTyp("horda", "shred") || maTyp("horda", "roundDmg"));
  test("horda bez bonusů jednotkám", !maTyp("horda", "unitDmg") && !maTyp("horda", "roundArmy"));
  test("vhorren warlock: madness", maTyp("vhorren", "madness"));
  test("vhorren křísí: roundHeal", maTyp("vhorren", "roundHeal"));
  test("gryk ekonom: harvest", maTyp("gryk", "harvest"));
  // sigy starterů (v0.34) nesou archetypové páky — přeladění nesmí zapadnout
  const sigMa = (fk, typ) => {
    const d = g.SIGNATURE_ITEMS[fk + ":" + g.STARTER_IDX[fk]];
    return d && d.effs.some(e => e.type === typ);
  };
  test("sig yllien: followUp (Druhý šíp)", sigMa("yllien", "followUp"));
  test("sig durgar: cauter (Vypálené rány)", sigMa("durgar", "cauter"));
  test("sig brakkar: vsDmg (Hlubina proti popelu)", sigMa("brakkar", "vsDmg"));
  test("sig gryk: vsDmg (Hlodá železo)", sigMa("gryk", "vsDmg"));
  test("sig sarn: unitDmg cav (Nájezdnický trysk)", sigMa("sarn", "unitDmg"));
  test("sig vhorren: ward (Nespící stráž)", sigMa("vhorren", "ward"));
}

// ---------- 5. determinismus ----------
sada("5. Determinismus rastru");
{
  const a = rastr.duel("aldar", "horda", 123);
  const b = rastr.duel("aldar", "horda", 123);
  test("stejný seed = stejný výsledek",
    a.zbyloA === b.zbyloA && a.zbyloD === b.zbyloD && a.kol === b.kol);
}

console.log(`\n${proslo} prošlo, ${selhalo} selhalo`);
if (selhalo > 0) process.exit(1);
