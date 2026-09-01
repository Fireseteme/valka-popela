// Výcvik podle OBJEMU (v0.54, zadání uživatele 30. 8. 2026): doba zakázky
// roste s body velení, fronta se odbavuje postupně a zakázka jde zrušit.
const g = require("../js/game.js");

let proslo = 0, selhalo = 0;
const test = (jmeno, ok) => {
  if (ok) proslo++;
  else { selhalo++; console.log("  ❌ " + jmeno); }
};
const sada = jmeno => console.log("\n=== " + jmeno + " ===");

// frakce s odemčenými typy a bezednou pokladnou (testuje se ČAS, ne ekonomika)
function hrac(idx = 0, hodin = 1) {
  g.setSeasonHours(hodin);
  g.newGame(0, 42, [0]);
  const f = g.G.factions[idx];
  f.buildings.barracks = 3;
  for (const r in f.resources) f.resources[r] = 9999999;
  return f;
}

sada("1. Doba roste s objemem");
{
  const f = hrac();
  const t1 = g.recruitOrderTicks(f, { inf: 100 });
  const t10 = g.recruitOrderTicks(f, { inf: 1000 });
  test(`100 kusů = ${t1} s, 1000 kusů = ${t10} s — desetinásobek objemu, desetinásobek času`,
    Math.abs(t10 - 10 * t1) <= 2);
  test("jeden kus se pořád cvičí (nenulový čas)", g.recruitOrderTicks(f, { inf: 1 }) >= 2);
  const cp = 500 * g.uDef(f, "inf").cp;
  // kasárny 3 → (12−2·2)/12 = 8/12, aldar má trainTime 1,5
  const ceka = Math.round(cp * g.VYCVIK_SEK_ZA_CP * (8 / 12) * 1.5);
  test(`500 kusů ≈ ${ceka} s dle vzorce (naměřeno ${g.recruitOrderTicks(f, { inf: 500 })})`,
    Math.abs(g.recruitOrderTicks(f, { inf: 500 }) - ceka) <= 2);
}

sada("2. Rozsekání zakázky na typy čas NEZKRÁTÍ");
{
  const f = hrac();
  const naraz = g.recruitOrderTicks(f, { inf: 300 });
  const rozsekane = g.recruitOrderTicks(f, { inf: 100, arch: 100, cav: 100 });
  const cpA = 300 * g.uDef(f, "inf").cp;
  const cpB = 100 * (g.uDef(f, "inf").cp + g.uDef(f, "arch").cp + g.uDef(f, "cav").cp);
  test(`stejné velení (${cpA} vs ${cpB}) → stejný čas (${naraz} vs ${rozsekane})`,
    cpA === cpB && Math.abs(naraz - rozsekane) <= 2);
}

sada("3. Platí se za VELENÍ, ne za kusy");
{
  const sarn = hrac(g.G.factions.findIndex(x => x.key === "sarn"));
  const aldar = hrac(0);
  const cpS = g.uDef(sarn, "inf").cp, cpA = g.uDef(aldar, "inf").cp;
  test(`sarnský kus stojí ${cpS} CP, aldarský ${cpA}`, cpS === 2 * cpA);
  // frakční mod trainTime se liší, tak se porovnává poměr uvnitř jednoho rodu
  const sto = g.recruitOrderTicks(sarn, { inf: 100 });
  const padesat = g.recruitOrderTicks(sarn, { inf: 50 });
  test(`50 sarnských kusů (${padesat} s) = polovina času 100 kusů (${sto} s)`,
    Math.abs(sto - 2 * padesat) <= 2);
}

sada("4. Kasárny zrychlují, délka sezóny čas škáluje");
{
  const f = hrac();
  const casy = [1, 2, 3, 4].map(b => { f.buildings.barracks = b; return g.recruitOrderTicks(f, { inf: 1000 }); });
  test(`úrovně 1–4 dávají ${casy.join(" / ")} s (klesá)`,
    casy.every((c, i) => i === 0 || c < casy[i - 1]));

  const kratka = hrac(0, 1);
  const tK = g.recruitOrderTicks(kratka, { inf: 1112 });
  const podilK = tK / g.seasonTicks();
  const dlouha = hrac(0, 336);
  const tD = g.recruitOrderTicks(dlouha, { inf: 1112 });
  const podilD = tD / g.seasonTicks();
  test(`podíl sezóny stejný: hodinová ${(100 * podilK).toFixed(2)} % vs 14denní ${(100 * podilD).toFixed(2)} %`,
    Math.abs(podilK - podilD) < 0.0005);
  test(`na 14denní sezóně to je ${(tD / 3600).toFixed(1)} h, ne 133 s`, tD > 100 * tK);
  g.setSeasonHours(1);
}

sada("5. Fronta se odbavuje POSTUPNĚ");
{
  const f = hrac();
  const pred = { inf: f.units.inf, arch: f.units.arch };
  g.startRecruitOrder(f, { inf: 100, arch: 100 });
  test("zakázka se rozpadla na dvě položky fronty", f.recruitQueue.length === 2);
  test("položka si nese svou plnou dobu (total)", f.recruitQueue.every(rq => rq.total > 0));
  const doba0 = f.recruitQueue[0].total, doba1 = f.recruitQueue[1].total;
  test(`souhrn fronty = součet položek (${g.recruitQueueTicks(f)} = ${doba0} + ${doba1})`,
    g.recruitQueueTicks(f) === doba0 + doba1);

  let prvni = null, druhy = null;
  for (let i = 1; i <= doba0 + doba1 + 5; i++) {
    g.doTick();
    if (prvni === null && f.units.inf > pred.inf) prvni = i;
    if (druhy === null && f.units.arch > pred.arch) druhy = i;
  }
  test(`první zakázka dorazila v tiku ${prvni} (čekáno ${doba0})`, prvni === doba0);
  test(`druhá až v tiku ${druhy} (čekáno ${doba0 + doba1}) — nečekaly souběžně`,
    druhy === doba0 + doba1);
  test("fronta je prázdná", f.recruitQueue.length === 0);
}

sada("6. Zrušení zakázky vrací poměrnou část ceny");
{
  const f = hrac();
  const cena = g.recruitOrderCost(f, { inf: 1000 });
  g.startRecruitOrder(f, { inf: 1000 });
  const doba = f.recruitQueue[0].total;
  const ubehlo = Math.floor(doba * 0.25);
  for (let i = 0; i < ubehlo; i++) g.doTick();
  const pred = { ...f.resources };
  const zbytek = f.recruitQueue[0].ticksLeft / doba;
  test("zrušení vrátilo true", g.cancelRecruit(f, 0) === true);
  test("položka zmizela z fronty", f.recruitQueue.length === 0);
  let sedi = true;
  for (const res in cena) {
    const vraceno = f.resources[res] - pred[res];
    if (Math.abs(vraceno - Math.floor(cena[res] * zbytek)) > 1) sedi = false;
  }
  test(`vráceno ${(100 * zbytek).toFixed(0)} % ceny (vycvičený zbytek propadá)`, sedi);
  test("zrušení neexistujícího indexu vrací false", g.cancelRecruit(f, 7) === false);
  test("zrušení v prázdné frontě vrací false", g.cancelRecruit(f, 0) === false);
}

sada("7. Zrušení prostřední položky posune zbytek");
{
  const f = hrac();
  g.startRecruitOrder(f, { inf: 100 });
  g.startRecruitOrder(f, { arch: 100 });
  g.startRecruitOrder(f, { cav: 100 });
  test("ve frontě jsou tři zakázky", f.recruitQueue.length === 3);
  g.cancelRecruit(f, 1);
  test("zůstaly dvě a prostřední je pryč",
    f.recruitQueue.length === 2 && f.recruitQueue.map(rq => rq.type).join(",") === "inf,cav");
}

console.log(`\n${proslo} prošlo, ${selhalo} selhalo`);
if (selhalo) process.exit(1);
