// Testy Fáze B (Audit 2): kolové aktivky, obranné chargy, bonusy rysu.
const g = require(__dirname + "/../js/game.js");
const G = g.G;
let fail = 0, pass = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  ✗ " + m); } };
// asserce, které etapa 6 legitimně posouvá (kotvy proti starému měřítku)
const { okPremeri } = require("./etapa6.js");
const okE6 = (c, m) => { const r = okPremeri(c, m); if (r.ok) pass++; else { fail++; console.log("  ✗ " + m); } };
const head = t => console.log("\n=== " + t + " ===");

const HERO = { name: "T", hp: 400, atk: 5, def: 5, dmg: 40, speed: 5, spell: 0, ward: 0 };
const mkHero = x => Object.assign({}, HERO, x);
const army = () => ({ inf: 120, arch: 120, cav: 120 });
const battle = (aX, dX, ctx) => {
  g.newGame(0, 4711, [0]);   // pevný seed → deterministické rng
  return g.simulateBattle(Object.assign({
    attacker: { faction: null, army: army(), hero: mkHero(aX), mult: 1 },
    defender: { faction: null, army: army(), hero: mkHero(dX), mult: 1, heroLed: true },
    structure: false }, ctx || {}));
};
// ETAPA 12b: událost reportu je {s,klic,param}. Testy hledají v textu, tak
// se tu složí ČESKÁ podoba — přesně ta, kterou uvidí klient bez slovníku.
const notes = sim => sim.roundLog.flatMap(x => x.ev).map(g.evCesky);

// --- 1. tabulka bonusů rysu ---
head("1. Mistrovské bonusy podle rysu");
// ETAPA 6 (IV-H): přibyl sedmý rys healer (léčí armádu v průběhu bitvy)
ok(Object.keys(g.TRAIT_MAX_EFFS).length === 7, "TRAIT_MAX_EFFS nemá 7 rysů");
for (const t in g.TRAIT_MAX_EFFS) {
  ok(g.TRAIT_MAX_EFFS[t].length === 4, `rys ${t}: ${g.TRAIT_MAX_EFFS[t].length} položek`);
  ok(g.TRAIT_MAX_EFFS[t].every(e => e && e.type && typeof e.val === "number"), `rys ${t}: špatný tvar`);
  ok(t in g.HERO_TRAITS, `rys ${t} neexistuje v HERO_TRAITS`);
}
let vlastni = 0, zRysu = 0, subBonus = 0, bezBonusu = 0;
for (const fk in g.HERO_DEFS) for (const hd of g.HERO_DEFS[fk]) for (const s of hd.tree) {
  if (s.main) { if (!s.maxEff) bezBonusu++; else if (s.maxEffTrait) zRysu++; else vlastni++; }
  else if (s.maxEff) subBonus++;
}
ok(bezBonusu === 0, `${bezBonusu} hlavních dovedností bez bonusu`);
ok(subBonus === 0, `${subBonus} větví má bonus (nemá mít žádná)`);
// ETAPA 6: osm ranhojičů = 32 dalších hlavních dovedností, všechny z rysu
ok(vlastni === 21 && zRysu === 203, `vlastních ${vlastni} (21), z rysu ${zRysu} (203 — kity osmičky v0.28 plus osm ranhojičů z etapy 6)`);
console.log(`  ${vlastni} vrcholných vlastních + ${zRysu} podle rysu, větví s bonusem ${subBonus}`);

// --- 2. bonus se projeví až při 15/15 ---
head("2. Bonus se aktivuje až na maximu");
g.newGame(0, 11, [1]);           // Mara (attack)
const f = G.factions[0], h = f.heroes[0];
f.isAI = true; // testy bojových efektů obcházejí bránu oddanosti (v0.35)
const tree = g.HERO_DEFS.aldar[1].tree;
h.skillPts = 200;
const slot0 = tree[0];           // Zuřivost (atk) → bonus rysu attack[0] = atk 1.5
for (let i = 0; i < 14; i++) g.learnSkill(f, 0, slot0.key);
const atk14 = g.heroStats(f, 0).atk;
g.learnSkill(f, 0, slot0.key);   // 15/15
const atk15 = g.heroStats(f, 0).atk;
// staty násobí i tier hrdiny (IV-H), takže se skok porovnává po jeho vydělení
const tierMara2 = 1 + g.TIER_STAT_BONUS * g.heroTierOf("aldar", 1);
ok(Math.abs((atk15 - atk14) / tierMara2 - (0.2 + 1.5)) < 0.01,
  `skok na 15/15: ${((atk15 - atk14) / tierMara2).toFixed(2)} (má být 0,2 za bod + 1,5 bonus)`);
console.log(`  Zuřivost 14→15: útok ${atk14.toFixed(2)} → ${atk15.toFixed(2)}`);

// --- 3. kolová aktivka: sběr, časování, poškození ---
head("3. Kolové aktivky");
const slot2 = tree[2];           // Ohlušující úder → bonus attack[2] = roundDmg 35 %, 2 cíle, 1. kolo
h.skills = {}; h.skillPts = 200;
for (let i = 0; i < 15; i++) g.learnSkill(f, 0, tree[0].key); // splnit gating
for (let i = 0; i < 15; i++) g.learnSkill(f, 0, tree[1].key);
for (let i = 0; i < 14; i++) g.learnSkill(f, 0, slot2.key);
ok(g.heroStats(f, 0).actives.length === 0, "aktivka se objevila před 15/15");
g.learnSkill(f, 0, slot2.key);
const acts = g.heroStats(f, 0).actives;
ok(acts.length === 1, `aktivek ${acts.length} (má být 1)`);
ok(acts[0] && acts[0].pct === 35 && acts[0].targets === 2 && acts[0].round === 1,
  `aktivka: ${JSON.stringify(acts[0])}`);
// heroEff nesmí kolové typy sčítat jako plochý stat
ok(g.heroEff(f, 0, "roundDmg") === 0, "heroEff sečetl roundDmg (nemá)");

// dopad v bitvě: proti obrovské přesile doběhne bitva vždy všech 8 kol,
// takže jsou kumulativní součty porovnatelné (jinak by silnější útok zkrátil
// bitvu a čísla by se rozešla kvůli počtu kol, ne kvůli aktivce)
const HUGE = { inf: 4000, arch: 4000, cav: 4000 };
const longBattle = aX => {
  g.newGame(0, 4711, [0]);
  return g.simulateBattle({
    attacker: { faction: null, army: army(), hero: mkHero(aX), mult: 1 },
    defender: { faction: null, army: Object.assign({}, HUGE),
      hero: mkHero({ hp: 99999 }), mult: 1, heroLed: true },
    structure: false });
};
const bez = longBattle({});
const s = longBattle({ actives: [{ name: "Zteč", pct: 35, targets: 2, round: 1, every: 0 }] });
ok(s.rounds === bez.rounds, `různý počet kol (${bez.rounds} vs ${s.rounds})`);
ok(s.tot.dmgA > bez.tot.dmgA, `aktivka nezvýšila poškození (${bez.tot.dmgA} → ${s.tot.dmgA})`);
ok(s.tot.cmdA > bez.tot.cmdA, `aktivka se nezapočítala do poškození velitele (${bez.tot.cmdA} → ${s.tot.cmdA})`);
const nActive = notes(s).filter(e => e.includes("Zteč")).length;
ok(nActive === 1, `aktivka se spustila ${nActive}× (má 1× v 1. kole)`);
console.log(`  bez aktivky ${bez.tot.dmgA} poškození (velitel ${bez.tot.cmdA}), s aktivkou ${s.tot.dmgA} (velitel ${s.tot.cmdA}), spuštění: ${nActive}×`);

// každé 3. kolo
const s3 = battle({ actives: [{ name: "Salva", pct: 30, targets: 1, round: 0, every: 3 }] }, {});
const fires = notes(s3).filter(e => e.includes("Salva")).length;
ok(fires === Math.floor(s3.rounds / 3), `„každé 3. kolo“ se spustilo ${fires}× při ${s3.rounds} kolech`);

// roundArmy posiluje JEDNOTKY, ne velitele
const sArmy = longBattle({ armyActives: [{ name: "Polnice", pct: 50, targets: 1, round: 1, every: 0 }] });
ok(sArmy.tot.dmgA > bez.tot.dmgA, `roundArmy nic neudělal (${bez.tot.dmgA} → ${sArmy.tot.dmgA})`);
ok(sArmy.tot.cmdA === bez.tot.cmdA,
  `roundArmy se započítal jako poškození velitele (${bez.tot.cmdA} → ${sArmy.tot.cmdA})`);
console.log(`  roundArmy +50 % v 1. kole: poškození ${bez.tot.dmgA} → ${sArmy.tot.dmgA}, velitel beze změny (${sArmy.tot.cmdA})`);

// --- 4. omráčený velitel aktivku nespustí ---
head("4. Omráčení blokuje aktivku");
const stunned = battle({ actives: [{ name: "Zteč", pct: 35, targets: 2, round: 1, every: 0 }] },
  { stunChance: 100 });
ok(notes(stunned).some(e => e.includes("omračuje")), "omráčení se nespustilo");
ok(!notes(stunned).some(e => e.includes("Zteč")), "omráčený velitel přesto spustil aktivku");

// --- 5. obranné chargy ---
head("5. Obranné chargy");
const bezCharge = battle({}, {});
const sCharge = battle({}, { avoidCharges: 2, avoidChance: 100 });
const pohlceno = notes(sCharge).filter(e => e.includes("pohlcen")).length;
ok(pohlceno === 2, `pohlceno ${pohlceno} úderů (mají být 2)`);
ok(sCharge.tot.avoidD > 0, "tot.avoidD zůstalo nulové");
ok(sCharge.defKilled < bezCharge.defKilled, `chargy nesnížily ztráty (${bezCharge.defKilled} → ${sCharge.defKilled})`);
console.log(`  2 chargy: ztráty obránce ${bezCharge.defKilled} → ${sCharge.defKilled}, pohlceno ${Math.round(sCharge.tot.avoidD)} poškození`);
// charga funguje i při omráčení velitele
const stunCharge = battle({ stunChance: 100 }, { avoidCharges: 1, avoidChance: 100 });
ok(notes(stunCharge).some(e => e.includes("pohlcen")), "omráčená strana nepoužila chargu");
// 0% šance = charga se nespotřebuje
const noChance = battle({}, { avoidCharges: 2, avoidChance: 0 });
ok(!notes(noChance).some(e => e.includes("pohlcen")), "charga se spustila při 0% šanci");

// --- 6. kapitán domobrany nic z toho nemá ---
head("6. Kapitán domobrany");
g.newGame(0, 21, [0]);
const fc = G.factions[0];
fc.resources.gold = 9000; fc.units = { inf: 400, arch: 300, cav: 300 };
fc.heroes[0].stamina = 500;
let cil = null;
for (const t of G.tiles.values())
  if (t.owner === -1 && TERRAIN_OK(t) && g.G.tiles && isAdj(fc, t) && (!cil || t.level > cil.level)) cil = t;
function TERRAIN_OK(t) { return !t.structure; }
function isAdj(f2, t) { try { return require(__dirname + "/../js/game.js").G && true; } catch (e) { return true; } }
// jednodušší: přímý sim proti kapitánovi
const capSim = g.simulateBattle({
  attacker: { faction: null, army: army(), hero: mkHero({}), mult: 1 },
  defender: { faction: null, army: army(),
    hero: { name: "kapitán domobrany", hp: 80, atk: 2, def: 2, dmg: 8, speed: 4, spell: 0, ward: 0 },
    mult: 1, heroLed: false },
  structure: false });
ok(!notes(capSim).some(e => e.includes("pohlcen") || e.includes("⏱")),
  "kapitán domobrany má aktivky nebo chargy");

// --- 7. capy statů při plném buildu ---
head("7. Capy statů");
// mystik: stunChance skill 24 + bonus rysu 8 = 32 < cap 35
g.newGame(0, 33, [5]);            // Vaelis (mystic)
const fm = G.factions[0];
fm.isAI = true;
fm.heroes[0].skillPts = 200;
const mt = g.HERO_DEFS.aldar[5].tree;
for (const s of mt) if (s.main) for (let i = 0; i < 15; i++) g.learnSkill(fm, 0, s.key);
const stm = g.heroStats(fm, 0);
ok(stm.stunChance <= 35, `stunChance ${stm.stunChance} přes cap 35`);
ok(stm.ward <= 0.8, `ward ${stm.ward} přes cap 0,8`);
console.log(`  mystik plný build: omráčení ${stm.stunChance} %, ochrana ${Math.round(stm.ward * 100)} %, kouzla ${stm.spell.toFixed(1)}`);
// útočník: followUp cap 60
g.newGame(1, 34, [1]);            // Theyren (attack, yllien)
const ft = G.factions[1];
ft.isAI = true;
ft.heroes[0].skillPts = 200;
const tt = g.HERO_DEFS.yllien[1].tree;
for (const s of tt) if (s.main) for (let i = 0; i < 15; i++) g.learnSkill(ft, 0, s.key);
const stt = g.heroStats(ft, 0);
ok(stt.followUp <= 60, `followUp ${stt.followUp} přes cap 60`);
console.log(`  Theyren plné hlavní: navazující úder ${stt.followUp} % (cap 60)`);
// ochránce: dostane imunitu a chargu
g.newGame(0, 35, [2]);            // Edran (shield)
const fs2 = G.factions[0];
fs2.isAI = true;
fs2.heroes[0].skillPts = 200;
const et = g.HERO_DEFS.aldar[2].tree;
for (const s of et) if (s.main) for (let i = 0; i < 15; i++) g.learnSkill(fs2, 0, s.key);
const ste = g.heroStats(fs2, 0);
ok(ste.stunImmune === true, "ochránce nedostal imunitu vůči omráčení");
ok(ste.avoidCharges === 1, `ochránce má ${ste.avoidCharges} charg (má mít 1)`);
ok(ste.avoidChance === 100, `šance pohlcení ${ste.avoidChance} (má být 100)`);
console.log(`  Edran plné hlavní: imunita ${ste.stunImmune}, chargy ${ste.avoidCharges}`);
// vojevůdce: roundArmy + velení
g.newGame(0, 36, [4]);            // Aldric (warlord)
const fw = G.factions[0];
fw.isAI = true;
fw.heroes[0].skillPts = 200;
const wt = g.HERO_DEFS.aldar[4].tree;
for (const s of wt) if (s.main) for (let i = 0; i < 15; i++) g.learnSkill(fw, 0, s.key);
const stw = g.heroStats(fw, 0);
ok(stw.armyActives.length === 1, `vojevůdce má ${stw.armyActives.length} armádních aktivek`);
console.log(`  Aldric plné hlavní: velení ${stw.cap}, armádní aktivka ${stw.armyActives.length}×`);

// --- 8. křivka dobývání se nesmí hnout (hrdina 1. úrovně bez bodů) ---
// PŘEUKOTVENO v0.19 při přechodu na boj po formacích: potřeba armády vyrostla
// zhruba o pětinu (přebytečné poškození se ztrácí), ale hlavní rozdíl je
// v CENĚ — ztráty útočníka vyskočily násobně. Čísla drž, dokud se boj nemění.
head("8. Křivka dobývání");
g.newGame(0, 999, [0]);
const fa = G.factions[0], stA = g.heroStats(fa, 0);
ok(stA.actives.length === 0 && stA.avoidCharges === 0, "hrdina bez bodů má aktivky/chargy");
const TG = { 10: 10, 15: 30, 30: 55, 90: 120, 300: 435 };
const need = label => {
  const gar = TG[label];
  let lo = 1, hi = 2000;
  while (lo < hi) {
    const mid = (lo + hi) >> 1, per = mid / 3;
    const sim = g.simulateBattle({
      attacker: { faction: null, army: { inf: per, arch: per, cav: per },
        hero: { name: "T", hp: stA.hpMax, atk: stA.atk, def: stA.def, dmg: stA.dmg,
          speed: stA.speed, spell: 0, ward: 0 }, mult: 1 },
      defender: { faction: null, army: { inf: gar / 3, arch: gar / 3, cav: gar / 3 },
        hero: { name: "kapitán", hp: 80, atk: 2, def: 2, dmg: 8, speed: 4, spell: 0, ward: 0 },
        mult: 1, heroLed: false },
      structure: false });
    if (sim.won) hi = mid; else lo = mid + 1;
  }
  return lo;
};
// PŘEMĚŘENO po etapě 6 (linie, velké jednotky, rebase velení). Vysoké stupně
// se skoro nehnuly (⚔300: 439 → 436, ⚔90: 121 → 124), protože rebase škáloval
// posádky i velení stejným poměrem. Nejnižší stupeň povyskočil z 11 na 15:
// tam je posádka tak malá, že o výsledku rozhoduje clona a pár kusů navíc.
for (const [label, exp] of [[10, 15], [15, 31], [30, 61], [90, 124], [300, 436]]) {
  const got = need(label);
  ok(got === exp, `⚔${label}: ${got} (kotva ${exp})`);
}
console.log("  kotvy: " + [10, 15, 30, 90, 300].map(l => `⚔${l}→${need(l)}`).join(", "));

// --- 9. determinismus ---
head("9. Determinismus s novými procy");
const a1 = battle({ actives: [{ name: "X", pct: 30, targets: 2, round: 1, every: 0 }], followUp: 40, stunChance: 25 },
  { avoidCharges: 2, avoidChance: 60 });
const a2 = battle({ actives: [{ name: "X", pct: 30, targets: 2, round: 1, every: 0 }], followUp: 40, stunChance: 25 },
  { avoidCharges: 2, avoidChance: 60 });
ok(JSON.stringify(a1.roundLog) === JSON.stringify(a2.roundLog), "stejný seed dal jiný průběh");
const src = require("fs").readFileSync(__dirname + "/../js/game.js", "utf8");
const simBody = src.slice(src.indexOf("function simulateBattle"), src.indexOf("function resolveMarch"));
ok(!simBody.includes("Math.random("), "v simulateBattle je volání Math.random"); // pozor: hledat volání, ne zmínku v komentáři

// --- 10. boj po formacích (v0.19) ---
head("10. Formace: pravidla nového boje");

// strop kol a remíza: proti obří přesile útok neprojde a vrátí se s přeživšími
g.newGame(0, 4711, [0]);
const remiza = g.simulateBattle({
  attacker: { faction: null, army: { inf: 120, arch: 120, cav: 120 }, hero: mkHero({}), mult: 1 },
  defender: { faction: null, army: { inf: 300, arch: 300, cav: 300 },
    hero: mkHero({ hp: 99999 }), mult: 1, heroLed: true },
  structure: false });
ok(remiza.rounds <= 10, `bitva běžela ${remiza.rounds} kol (strop je 10)`);
ok(remiza.won === false, `útok proti dvouapůlnásobné přesile prošel (won=${remiza.won})`);
ok(g.armyTotal(remiza.remA) > 0, "odražený útočník se nevrátil s nikým — chybí zlomení a ústup");
ok(typeof remiza.won === "boolean", `won není boolean, ale ${typeof remiza.won}`);
console.log(`  remíza: ${remiza.rounds} kol, útočníkovi zbylo ${g.armyTotal(remiza.remA)} jednotek`);

// přebytečné poškození se ztrácí: ani drtivá přesila nedobývá zadarmo
g.newGame(0, 4711, [0]);
const drtiva = g.simulateBattle({
  attacker: { faction: null, army: { inf: 900, arch: 900, cav: 900 }, hero: mkHero({}), mult: 1 },
  defender: { faction: null, army: { inf: 10, arch: 10, cav: 10 },
    hero: { name: "kapitán", hp: 80, atk: 2, def: 2, dmg: 8, speed: 4, spell: 0, ward: 0 },
    mult: 1, heroLed: false }, structure: false });
ok(drtiva.won, "třicetinásobná přesila neuspěla");
const ztraty = g.armyTotal(drtiva.attLosses);
ok(ztraty > 0, "vítěz nepřišel ani o jednu jednotku (poškození se zase vypařuje)");
console.log(`  drtivá přesila vyhrála za ${drtiva.rounds} kol a stála ${ztraty} jednotek`);

// ztráty se dělí na padlé a raněné a jejich součet sedí
const soucet = g.UNIT_KEYS.reduce((a, k) => a + drtiva.lossA.dead[k] + drtiva.lossA.wounded[k], 0);
ok(soucet === ztraty, `padlí+ranění ${soucet} != ztráty ${ztraty}`);
const mrtvi = g.UNIT_KEYS.reduce((a, k) => a + drtiva.lossA.dead[k], 0);
ok(mrtvi >= 0 && mrtvi <= ztraty, "nesmyslný počet padlých");
console.log(`  ztráty ${ztraty} = ${mrtvi} padlých + ${ztraty - mrtvi} raněných`);

// formace umírají jednotlivě, ne rovnoměrným ubýváním z jednoho fondu
g.newGame(0, 4711, [0]);
const jednotlive = g.simulateBattle({
  attacker: { faction: null, army: { inf: 300, arch: 300, cav: 300 }, hero: mkHero({}), mult: 1 },
  defender: { faction: null, army: { inf: 200, arch: 60, cav: 60 },
    hero: { name: "kapitán", hp: 80, atk: 2, def: 2, dmg: 8, speed: 4, spell: 0, ward: 0 },
    mult: 1, heroLed: false }, structure: false });
const prvni = jednotlive.roundLog[0];
const podily = g.UNIT_KEYS.map(k => prvni.remD[k] / (k === "inf" ? 200 : 60));
const rozptyl = Math.max(...podily) - Math.min(...podily);
ok(rozptyl > 0.05,
  `formace ubyly skoro stejným podílem (rozptyl ${rozptyl.toFixed(3)}) — to je starý fondový boj`);
console.log(`  po 1. kole obránci: ${g.UNIT_KEYS.map(k => k + "=" + prvni.remD[k]).join(" ")}`);

// velitel je skutečný kanál poškození: jeho podíl roste s jeho silou
// (v předloze 3–82 % podle buildu, ne pevné číslo)
const podilVel = sila => {
  g.newGame(0, 4711, [0]);
  const s = g.simulateBattle({
    attacker: { faction: null, army: { inf: 50, arch: 50, cav: 50 }, hero: mkHero({ dmg: sila }), mult: 1 },
    defender: { faction: null, army: { inf: 40, arch: 40, cav: 40 },
      hero: { name: "kapitán", hp: 80, atk: 2, def: 2, dmg: 8, speed: 4, spell: 0, ward: 0 },
      mult: 1, heroLed: false }, structure: false });
  return 100 * s.tot.cmdA / s.tot.dmgA;
};
const slaby = podilVel(8), silny = podilVel(120);
ok(slaby >= 2, `slabý velitel dal jen ${slaby.toFixed(1)} % — velitel je zase jen přípočet`);
ok(silny > slaby * 2, `silný velitel ${silny.toFixed(1)} % vs slabý ${slaby.toFixed(1)} % — síla velitele se neprojevuje`);
ok(silny < 95, `velitel dal ${silny.toFixed(1)} % — armáda je proti němu zbytečná`);
console.log(`  podíl velitele na poškození: slabý ${slaby.toFixed(1)} %, silný ${silny.toFixed(1)} %`);

// --- 11. obléhání: odražený hrdina táboří a zkusí to znovu ---
head("11. Obléhání");

const oblehaniScena = (posadka, armada) => {
  g.newGame(0, 999, [0]);
  const me = G.factions[0];
  me.units = { inf: 3337, arch: 3337, cav: 3337 };   // ETAPA 6: měřítko ×5,56
  me.resources.gold = 99999;
  me.heroes[0].stamina = 999;
  // ETAPA 6: armádu musí unést velitel — strop je 300 CP na 1. úrovni,
  // 5 200 na padesáté. Bez povýšení by startMarch armádu odmítl.
  me.heroes[0].level = 10;
  let cil = null;
  for (const t of G.tiles.values()) {
    // ETAPA 7: rod nově vlastní i své přechody přes dělič kolébky, takže
    // mezi "sousedy" jsou i vodní pole prstence — cíl musí být PRŮCHOZÍ
    // ETAPA 7: rod nově vlastní i své přechody přes dělič kolébky, takže
    // mezi "sousedy" jsou i vodní pole prstence a uzly 2×2 hlouběji v pásu —
    // cíl musí být PRŮCHOZÍ a NEBLOKOVÝ (uzly se neobléhají, brání dvě armády)
    if (t.owner !== -1 || t.structure || t.big || t.bigSize) continue;
    if (!g.TERRAIN[t.terrain].passable) continue;
    const soused = [...G.tiles.values()].some(n => n.owner === me.id &&
      (Math.abs(n.q - t.q) + Math.abs(n.r - t.r) + Math.abs(n.q + n.r - t.q - t.r)) / 2 === 1);
    if (soused && (!cil || t.level > cil.level)) cil = t;
  }
  cil.garrison = posadka;
  g.startMarch(me, cil, { inf: armada / 3, arch: armada / 3, cav: armada / 3 }, 0);
  return { me, cil };
};

// po odraženém útoku hrdina táboří na SVÉM poli a má vojsko u sebe
const { me: m1, cil: c1 } = oblehaniScena(1600, 1100);
let tik = 0;
while (tik++ < 200 && !m1.marches.some(x => x.kind === "siege")) g.doTick();
const sg = m1.marches.find(x => x.kind === "siege");
ok(!!sg, "po odraženém útoku nevzniklo obléhání");
if (sg) {
  const h1 = m1.heroes[0];
  ok(!!h1.pos, "obléhající hrdina nestojí na poli (nedají se mu poslat posily)");
  ok(G.tiles.get(h1.pos).owner === m1.id, "hrdina táboří na cizím poli");
  ok(g.armyTotal(h1.army) > 0, "obléhající hrdina nemá u sebe vojsko");
  ok(g.armyTotal(sg.army) === 0, "obléhací odpočet drží armádu (má ji držet hrdina)");
  ok(sg.ticksLeft <= g.SIEGE_RETRY, `odpočet ${sg.ticksLeft} s je delší než SIEGE_RETRY`);
  console.log(`  po 1. náběhu: hrdina táboří na ${h1.pos} s ${Math.round(g.armyTotal(h1.army))} muži, další za ${sg.ticksLeft} s`);
  // posily k obléhajícímu musí projít
  const posily = g.startReinforce(m1, G.tiles.get(h1.pos), { inf: 10, arch: 10, cav: 10 });
  ok(posily, "posily se k obléhajícímu hrdinovi nedostanou");
}

// obléhání skutečně ubourává posádku a nakonec pole padne
const { me: m2, cil: c2 } = oblehaniScena(1600, 1100);
const posadkaNaStartu = c2.garrison;
let naboru = 0, minPosadka = c2.garrison;
for (let i = 0; i < 400; i++) {
  const pred = G.reports.length;
  g.doTick();
  for (let j = pred; j < G.reports.length; j++)
    if (G.reports[j].att && G.reports[j].att.fkey === m2.key) naboru++;
  minPosadka = Math.min(minPosadka, c2.garrison);
  const h2 = m2.heroes[0];
  // hráč mezi náběhy doplňuje síly
  if (h2.pos && g.armyTotal(h2.army) < 60 && !m2.marches.some(x => x.kind === "reinforce"))
    g.startReinforce(m2, G.tiles.get(h2.pos), { inf: 40, arch: 40, cav: 40 });
  if (c2.owner === m2.id) break;
}
ok(naboru >= 2, `hrdina zkusil jen ${naboru} náběh — obléhání se neopakuje`);
ok(minPosadka < posadkaNaStartu * 0.8, `posádka klesla jen z ${posadkaNaStartu} na ${Math.round(minPosadka)} — náběhy neubourávají`);
ok(naboru <= g.SIEGE_MAX_TRIES + 1, `${naboru} náběhů překročilo strop ${g.SIEGE_MAX_TRIES}`);
console.log(`  s posilami: ${naboru} náběhů, posádka ${posadkaNaStartu} → ${Math.round(minPosadka)}, pole ${c2.owner === m2.id ? "DOBYTO" : "drží"}`);

// zrušení obléhání hrdinu nechá stát, nevrací ho domů
const { me: m3 } = oblehaniScena(1600, 1100);
let t3 = 0;
while (t3++ < 200 && !m3.marches.some(x => x.kind === "siege")) g.doTick();
if (m3.marches.some(x => x.kind === "siege")) {
  const posPred = m3.heroes[0].pos;
  ok(g.turnBackMarch(m3, 0), "obléhání nešlo zrušit");
  ok(!m3.marches.some(x => x.kind === "siege"), "odpočet obléhání zůstal");
  ok(m3.heroes[0].pos === posPred, "zrušení obléhání hrdinu odsunulo z pole");
  console.log(`  zrušení: hrdina zůstal stát na ${m3.heroes[0].pos}`);
}

// --- 12. slovník stavů: šílenství, neodvratný úder, plný druhý úder ---
head("12. Stavy v boji");

// ⚠ newGame seeduje globální rng, ze kterého čte i simulateBattle. Volitelný
// seed dovoluje scéně přeseedovat kostky BEZ generování mapy (seedRng) —
// jinak by se každá změna generátoru propsala do výsledků těchhle bitev.
const stavBitva = (aX, dX, seed) => {
  g.newGame(0, 4711, [0]);
  if (seed !== undefined) g.seedRng(seed);
  return g.simulateBattle({
    attacker: { faction: null, army: { inf: 150, arch: 150, cav: 150 }, hero: mkHero(aX), mult: 1 },
    defender: { faction: null, army: { inf: 150, arch: 150, cav: 150 },
      hero: mkHero(Object.assign({ hp: 5000 }, dX)), mult: 1, heroLed: true },
    structure: false });
};

// Šílenství uvrhne formaci a ta se občas obrátí proti svým.
// ⚠ Obrat je HOD KOSTKOU (poloviční šance za kolo), takže jedna bitva ho
// nemusí trefit — a kostky se navíc posouvají s každou změnou generátoru mapy
// (sim čte globální rng). Bere se proto NĚKOLIK seedů přes seedRng a stačí,
// když se obrat objeví aspoň v jednom.
let uvrzeno = 0, obrat = 0, sil = null;
for (const sd of [1, 2, 3, 4, 5, 6, 7, 8]) {
  g.seedRng(sd);
  const b = stavBitva({ madness: 100 }, {}, sd);
  if (!sil) sil = b;
  uvrzeno += notes(b).filter(e => /sesílá šílenství/.test(e)).length;
  obrat += notes(b).filter(e => /v šílenství útočí na vlastní/.test(e)).length;
}
ok(uvrzeno > 0, "šílenství se ani jednou neuvrhlo");
ok(obrat > 0, "šílená formace se ani jednou neobrátila proti svým");
ok(obrat <= uvrzeno, `obrácení (${obrat}) je víc než uvržení (${uvrzeno})`);
const bezSil = stavBitva({}, {});
ok(notes(bezSil).every(e => !/šílenství/.test(e)), "šílenství se spustilo bez schopnosti");
console.log(`  šílenství: uvrženo ${uvrzeno}×, obrat proti svým ${obrat}× za ${sil.rounds} kol`);

// šílenec nebije sám sebe (cíl je vždy jiná vlastní formace)
ok(!notes(sil).some(e => /Pěchota v šílenství útočí na vlastní Pěchota/.test(e)
  || /Lučištníci v šílenství útočí na vlastní Lučištníci/.test(e)
  || /Jízda v šílenství útočí na vlastní Jízda/.test(e)),
  "šílená formace zaútočila sama na sebe");

// neodvratný úder obchází obrannou chargu (měří se POHLCENÉ poškození,
// ne počet pohlcení — chargy se stejně spotřebují, jen na slabší údery)
const bezNeo = stavBitva({ dmg: 120 }, { avoidCharges: 3, avoidChance: 100 });
const sNeo = stavBitva({ dmg: 120, pursuit: 100 }, { avoidCharges: 3, avoidChance: 100 });
ok(sNeo.tot.avoidD < bezNeo.tot.avoidD,
  `neodvratný úder nesnížil pohlcené poškození (${bezNeo.tot.avoidD} → ${sNeo.tot.avoidD})`);
ok(sNeo.defKilled > bezNeo.defKilled,
  `neodvratný úder nezvýšil ztráty obránce (${bezNeo.defKilled} → ${sNeo.defKilled})`);
ok(notes(sNeo).some(e => /neodvratný úder/.test(e)), "neodvratný úder se nikde nezmínil");
console.log(`  neodvratný: pohlceno ${bezNeo.tot.avoidD} → ${sNeo.tot.avoidD}, ztráty obránce ${bezNeo.defKilled} → ${sNeo.defKilled}`);

// Navazující úder je PLNÝ druhý útok, ne přípočet.
// MĚŘÍ SE NA JEDNOM KOLE proti obřímu obránci: s navazujícím úderem skončí
// běžná bitva DŘÍV (6 → 4 kola), takže kumulativní poškození přes celou bitvu
// efekt podhodnocuje (vyjde 1,45× místo dvojnásobku). Při pevném počtu kol
// vyjde 198 → 436, tedy 2,2× — plný druhý úder.
const fuScena = fu => {
  g.newGame(0, 4711, [0]);
  return g.simulateBattle({
    attacker: { faction: null, army: { inf: 150, arch: 150, cav: 150 },
      hero: mkHero({ followUp: fu }), mult: 1 },
    defender: { faction: null, army: { inf: 40000, arch: 40000, cav: 40000 },
      hero: mkHero({ hp: 500000 }), mult: 1, heroLed: true },
    structure: false });
};
const bezFu = fuScena(0);
const sFu = fuScena(100);
ok(sFu.tot.cmdA > bezFu.tot.cmdA * 1.8,
  `druhý úder přidal jen ${Math.round(100 * sFu.tot.cmdA / bezFu.tot.cmdA - 100)} % — není to plný útok`);
ok(notes(sFu).some(e => /bije podruhé/.test(e)), "druhý úder se nikde nezmínil");
console.log(`  druhý úder: poškození velitele ${bezFu.tot.cmdA} → ${sFu.tot.cmdA}`);

// determinismus i s novými procy
const p1 = stavBitva({ madness: 40, pursuit: 40, followUp: 40 }, { avoidCharges: 2, avoidChance: 60 });
const p2 = stavBitva({ madness: 40, pursuit: 40, followUp: 40 }, { avoidCharges: 2, avoidChance: 60 });
ok(JSON.stringify(p1.roundLog) === JSON.stringify(p2.roundLog), "stejný seed dal jiný průběh");

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} testů prošlo, ${fail} selhalo`);
process.exit(fail ? 1 : 0);
