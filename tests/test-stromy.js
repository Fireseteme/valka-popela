// Testy Fáze A (Audit 2): struktura stromů, gating, body, migrace, křivka.
const g = require(__dirname + "/../js/game.js");
const G = g.G;
let fail = 0, pass = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log("  ✗ " + msg); } };
// kotvy, které etapa 6 legitimně posouvá (měřítko boje)
const { okPremeri } = require("./etapa6.js");
const okE6 = (c, m) => { const r = okPremeri(c, m); if (r.ok) pass++; else { fail++; console.log("  ✗ " + m); } };
const head = t => console.log("\n=== " + t + " ===");

// --- 1. struktura stromů ---
head("1. Struktura stromů");
let heroes = 0, capMin = 999, capMax = 0;
for (const fk in g.HERO_DEFS) for (const hd of g.HERO_DEFS[fk]) {
  heroes++;
  const mains = hd.tree.filter(s => s.main), subs = hd.tree.filter(s => s.parent);
  ok(hd.tree.length === 12, `${hd.name}: ${hd.tree.length} uzlů (má být 12)`);
  ok(mains.length === 4, `${hd.name}: ${mains.length} hlavních`);
  ok(subs.length === 8, `${hd.name}: ${subs.length} podřízených`);
  ok(mains.every(s => s.max === 15), `${hd.name}: hlavní nemají 15 ranků`);
  ok(subs.every(s => s.max === 7), `${hd.name}: podřízené nemají 7 ranků`);
  ok(subs.every(s => !s.maxEff), `${hd.name}: podřízená má maxEff`);
  // každá hlavní má právě 2 větve, po jedné na stranu
  for (const m of mains) {
    const kids = subs.filter(s => s.parent === m.key);
    ok(kids.length === 2, `${hd.name}/${m.key}: ${kids.length} větví`);
    ok(new Set(kids.map(k => k.branch)).size === 2, `${hd.name}/${m.key}: obě větve na stejné straně`);
  }
  const u = hd.tree.find(s => s.ult);
  ok(u && u.main && u.slot === 3, `${hd.name}: vrcholná dovednost není 4. hlavní`);
  const cap = hd.tree.reduce((a, s) => a + s.max, 0);
  capMin = Math.min(capMin, cap); capMax = Math.max(capMax, cap);
  // efekty musí mít známý tvar
  for (const s of hd.tree)
    for (const e of (s.effs || [s.eff]))
      ok(e && typeof e.type === "string" && typeof e.val === "number",
        `${hd.name}/${s.key}: špatný tvar efektu`);
}
// ETAPA 6 (IV-H): každý rod dostal SEDMÉHO hrdinu s novým rysem healer,
// takže 8 rodů × 7 = 56 (dřív 48).
ok(heroes === 56, `hrdinů ${heroes} (8 rodů × 7 rysů včetně ranhojiče, etapa 6)`);
ok(capMin === 116 && capMax === 116, `kapacita ${capMin}–${capMax} (má být 116)`);
console.log(`  hrdinů ${heroes}, kapacita stromu ${capMin} bodů`);

// --- 2. gating ---
head("2. Odemykání");
g.newGame(0, 12345, [1]); // aldar, Mara
const f = G.factions[0], h = f.heroes[0];
f.isAI = true; // testy mechaniky stromu obcházejí bránu oddanosti (tu hlídá test-sin)
const tree = g.HERO_DEFS.aldar[1].tree;
h.skillPts = 200;
ok(g.learnSkill(f, 0, tree[0].key), "1. hlavní musí jít hned");
ok(!g.learnSkill(f, 0, tree[1].key), "2. hlavní nesmí jít pod 8 bodů");
ok(!g.learnSkill(f, 0, tree[4].key), "větev nesmí jít pod 3. rank rodiče");
for (let i = 0; i < 2; i++) g.learnSkill(f, 0, tree[0].key); // rodič na 3
ok(g.learnSkill(f, 0, tree[4].key), "větev musí jít od 3. ranku rodiče");
while (g.learnSkill(f, 0, tree[0].key)); // do maxima
ok((h.skills[tree[0].key] || 0) === 15, `rank hlavní ${h.skills[tree[0].key]} (má být 15)`);
ok(!g.learnSkill(f, 0, tree[0].key), "nesmí přetéct přes max");
while (g.learnSkill(f, 0, tree[4].key));
ok((h.skills[tree[4].key] || 0) === 7, `rank větve ${h.skills[tree[4].key]} (má být 7)`);
ok(g.heroSpentPoints(h) >= 8 && g.learnSkill(f, 0, tree[1].key), "2. hlavní musí jít nad 8 bodů");
// plný strom vyžaduje 116 bodů
h.skills = {}; h.skillPts = 116;
let guard = 400;
while (h.skillPts > 0 && guard-- > 0) { for (const s of tree) if (g.learnSkill(f, 0, s.key)) break; }
ok(g.heroSpentPoints(h) === 116, `plný strom spotřeboval ${g.heroSpentPoints(h)} bodů`);
ok(tree.every(s => (h.skills[s.key] || 0) === s.max), "plný strom není opravdu plný");

// --- 3. úrovně, XP a body ---
head("3. Úrovně, XP a body");
ok(g.HERO_MAX_LEVEL === 50, `strop ${g.HERO_MAX_LEVEL}`);
let totalXp = 0;
for (let l = 1; l < 50; l++) totalXp += g.xpForLevel(l);
ok(totalXp > 100000 && totalXp < 140000, `celkem XP na 50. úroveň: ${totalXp}`);
ok(g.totalSkillPtsForLevel(50) === 49, `body z úrovní: ${g.totalSkillPtsForLevel(50)}`);
ok(g.totalSkillPtsForLevel(1) === 0, "úroveň 1 nemá dávat body");
g.newGame(0, 7, [1]);
const f2 = G.factions[0], h2 = f2.heroes[0];
h2.skillPts = 0;
g.heroGainXp(f2, 0, 5000000);
ok(h2.level === 50, `hrdina na úrovni ${h2.level}`);
ok(h2.skillPts === 49, `nasbíráno bodů: ${h2.skillPts} (má být 49)`);
ok(h2.xp === 0, "na stropu má být xp 0");
console.log(`  XP na max: ${totalXp}, body 49 + hvězdy 25 = 74 ze 116 (${Math.round(74 / 116 * 100)} %)`);

// --- 4. staty: úroveň 50 ≈ dřívější 30 ---
head("4. Staty na stropu");
const st50 = g.heroStats(f2, 0);
console.log(`  úr. 50: hp ${st50.hpMax}, atk ${st50.atk.toFixed(2)}, def ${st50.def.toFixed(2)}, dmg ${st50.dmg}, velení ${st50.cap}`);
ok(Math.abs(st50.hpMax - 274) < 12, `hp ${st50.hpMax} vs cíl ~274`);
// Mara je "attack" (rys +3 útoku) a od etapy 6 EPICKÁ, takže staty násobí
// i tier (IV-H: +5 % základu za stupeň). Po vydělení tierem a odečtení rysu
// zbude čistá úrovňová složka, kterou tenhle test hlídá.
const tierMara = 1 + g.TIER_STAT_BONUS * g.heroTierOf("aldar", 1);
ok(Math.abs(st50.atk / tierMara - 3 - 6.35) < 0.4,
  `atk bez rysu a tieru ${(st50.atk / tierMara - 3).toFixed(2)} vs cíl ~6,35`);
ok(Math.abs(st50.def - 6.35) < 0.4, `def ${st50.def.toFixed(2)} vs cíl ~6,35`);
ok(Math.abs(st50.dmg - 37) < 3, `dmg ${st50.dmg} vs cíl ~37`);
// ETAPA 6: velení přepsáno z 935 na 5 200 CP na padesátce (základ 300 + 100/úroveň)
ok(Math.abs(st50.cap - 5200) < 200, `velení ${st50.cap} vs cíl ~5200`);

// --- 5. křivka dobývání (kotvy) — hrdina úrovně 1 bez bodů ---
head("5. Křivka dobývání (kapitán domobrany se nesmí hnout)");
// PŘEMĚŘENO po etapě 6 — táž čísla jako v test-boj sadě 8 (obě sady tuhle
// křivku hlídají a MUSÍ se měnit společně)
const anchors = [[10, 15], [15, 31], [30, 61], [90, 124], [300, 436]];
g.newGame(0, 999, [0]);
const fa = G.factions[0];
const stA = g.heroStats(fa, 0);
const need = tierLabel => {
  // binární hledání nejmenší armády, která pole s danou jmenovkou dobude
  const TIER_GARRISON = { 10: 10, 15: 30, 30: 55, 90: 120, 300: 435 };
  const gar = TIER_GARRISON[tierLabel];
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
for (const [label, expect] of anchors) {
  const got = need(label);
  ok(Math.abs(got - expect) <= Math.max(3, expect * 0.12), `⚔${label}: potřeba ${got}, kotva ${expect}`);
  console.log(`  ⚔${label}: ${got} jednotek (kotva ${expect})`);
}

// --- 6. migrace účtů ---
head("6. Migrace účtů");
const oldAcc = { name: "kamarad", cores: 500, inventory: [], codesUsed: [],
  heroProgress: {
    "aldar:1": { level: 30, xp: 40, stars: 10, skillPts: 3,
      skills: { zur: 8, uder: 6, ult: 1 }, equip: {} },
    "horda:5": { level: 12, xp: 0, stars: 0, skillPts: 0, skills: { plamen: 5 }, equip: {} },
  } };
g.migrateAccount(oldAcc);
const pr = oldAcc.heroProgress["aldar:1"];
ok(Object.keys(pr.skills).length === 0, "staré dovednosti nebyly smazány");
ok(pr.skillPts === 29 + 10, `vráceno bodů ${pr.skillPts} (29 z úrovní + 10 z hvězd)`);
ok(oldAcc.treeV === g.TREE_VERSION, `treeV ${oldAcc.treeV} (má být ${g.TREE_VERSION})`);
ok(oldAcc.respecNote === 1, "chybí značka oznámení");
ok(g.heroUnlocked(oldAcc, "aldar:1") && g.heroUnlocked(oldAcc, "horda:5"), "rozehraní hrdinové mají zůstat odemčení");
ok(oldAcc.heroProgress["horda:5"].skillPts === 11, `Maalzeth body ${oldAcc.heroProgress["horda:5"].skillPts} (má být 11)`);
// nikdo nepřijde o body: nová křivka dává vždy ≥ než stará
let ubytek = 0;
for (let l = 1; l <= 30; l++) {
  let stara = 0;
  for (let x = 2; x <= l; x++) if (x <= 10 || x % 2 === 0) stara++;
  if (g.totalSkillPtsForLevel(l) < stara) ubytek++;
}
ok(ubytek === 0, `na ${ubytek} úrovních by hráč o body přišel`);

// --- 7. idempotence migrace (nejnebezpečnější detail) ---
head("7. Migrace nesmí mazat živé stromy");
g.newGame(0, 55, [1]);
const f3 = G.factions[0];
const acc2 = g.emptyAccount("t");
acc2.heroUnlocks["aldar:1"] = 1;
g.applyAccountToFaction(f3, acc2);
f3.heroes[0].skillPts = 20;
g.learnSkill(f3, 0, g.HERO_DEFS.aldar[1].tree[0].key);
g.syncAccountFromFaction(acc2, f3);
g.migrateAccount(acc2);           // druhé kolo migrace
g.migrateAccount(acc2);           // a třetí
const pr2 = acc2.heroProgress["aldar:1"];
ok(Object.keys(pr2.skills).length === 1, `po opakované migraci zbylo ${Object.keys(pr2.skills).length} dovedností (má být 1)`);

// --- 8. sanitizace: neznámý klíč a přetečený rank ---
head("8. Sanitizace účtu");
const acc3 = g.emptyAccount("t3");
acc3.heroProgress["aldar:1"] = { level: 5, xp: 0, stars: 0, skillPts: 0,
  skills: { zur: 99, neexistuje: 5 }, equip: {} };
g.newGame(0, 77, [1]);
const f4 = G.factions[0];
g.applyAccountToHero(f4, 0, acc3);
ok((f4.heroes[0].skills.zur || 0) === 15, `rank 99 nebyl oříznut (je ${f4.heroes[0].skills.zur})`);
ok(!("neexistuje" in f4.heroes[0].skills), "neznámý klíč se dostal do hry");

// --- 9. respec vrací všechno ---
head("9. Respec");
g.newGame(0, 88, [1]);
const f5 = G.factions[0], h5 = f5.heroes[0];
h5.skillPts = 30;
for (let i = 0; i < 10; i++) g.learnSkill(f5, 0, g.HERO_DEFS.aldar[1].tree[0].key);
const spent = g.heroSpentPoints(h5), left = h5.skillPts;
ok(f5.freeRespecs === 2, `resety zdarma: ${f5.freeRespecs} (mají být 2)`);
g.respecHero(f5, 0);
ok(h5.skillPts === spent + left, `po respecu ${h5.skillPts} bodů (má být ${spent + left})`);
ok(Object.keys(h5.skills).length === 0, "respec nevyprázdnil strom");

// --- 10. AI zvládne nový strom ---
head("10. AI rozdělování bodů");
g.newGame(0, 4242, [0]);
const ai = G.factions[1];
ai.heroes[0].skillPts = 116;
const t0 = Date.now();
for (let i = 0; i < 30; i++) g.doTick();
ok(Date.now() - t0 < 20000, "AI se zacyklila");
const aiTree = g.HERO_DEFS[ai.key][ai.heroes[0].defIdx].tree;
let legal = true;
for (const s of aiTree) {
  const r = ai.heroes[0].skills[s.key] || 0;
  if (r > s.max) legal = false;
  if (r > 0 && s.parent && (ai.heroes[0].skills[s.parent] || 0) < (s.req || g.SUB_REQ)) legal = false;
}
ok(legal, "AI si postavila nelegální strom");
console.log(`  AI utratila ${g.heroSpentPoints(ai.heroes[0])} bodů, strom legální: ${legal}`);

// --- 11. determinismus boje ---
head("11. Determinismus");
const mk = () => { g.newGame(0, 31337, [1]); return G.factions[0]; };
const run = () => {
  const ff = mk();
  const stt = g.heroStats(ff, 0);
  return JSON.stringify(g.simulateBattle({
    attacker: { faction: null, army: { inf: 100, arch: 100, cav: 100 },
      hero: { name: "A", hp: 300, atk: stt.atk, def: stt.def, dmg: 30, speed: 5,
        spell: 0, ward: 0, followUp: 30, stunChance: 20 }, mult: 1 },
    defender: { faction: null, army: { inf: 100, arch: 100, cav: 100 },
      hero: { name: "D", hp: 300, atk: 3, def: 3, dmg: 25, speed: 5, spell: 0, ward: 0 },
      mult: 1, heroLed: true },
    structure: false }).roundLog);
};
ok(run() === run(), "dvě bitvy se stejným seedem se rozešly");

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} testů prošlo, ${fail} selhalo`);
process.exit(fail ? 1 : 0);
