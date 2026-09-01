const g = require(__dirname + "/../js/game.js");
const G = g.G;
let fail = 0, pass = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  ✗ " + m); } };
const head = t => console.log("\n=== " + t + " ===");

head("1. Mapování úrovní");
const par = [[1,1],[10,2],[15,3],[30,6],[60,11],[90,16],[130,22],[150,25],[200,34],[230,39],[260,43],[300,50]];
for (const [lab, exp] of par) ok(g.neutralHeroLevel(lab) === exp, `⚔${lab} → ${g.neutralHeroLevel(lab)} (čekáno ${exp})`);
ok(g.neutralHeroLevel(500) === 50 && g.neutralHeroLevel(1200) === 50, "nad ⚔300 musí být 50");
ok(g.neutralHeroLevel(0) === 1 && g.neutralHeroLevel(-5) === 1, "pod ⚔1 nesmí klesnout pod 1");
console.log("  " + par.map(([l,e]) => `⚔${l}→${e}`).join(", "));

head("2. Determinismus (server i klienti musí vidět totéž)");
g.newGame(0, 4242, [0]);
const snap = [];
for (const t of G.tiles.values()) if (t.owner === -1) snap.push(g.neutralCommander(t));
// druhá hra se stejným seedem
g.newGame(0, 4242, [0]);
let i = 0, shoda = true;
for (const t of G.tiles.values()) if (t.owner === -1) {
  const b = g.neutralCommander(t), a = snap[i++];
  if (!a || a.name !== b.name || a.level !== b.level || a.trait !== b.trait) shoda = false;
}
ok(shoda, "velitelé se mezi běhy rozešli");
ok(i === snap.length && i > 500, `porovnáno jen ${i} polí`);
// opakované volání na témže poli
const t0 = [...G.tiles.values()].find(t => t.owner === -1);
const x = g.neutralCommander(t0), y = g.neutralCommander(t0);
ok(x.name === y.name && x.level === y.level, "dvě volání na stejném poli dala jiný výsledek");
// zdrojový kód nesmí v této části sahat na náhodu
const src = require("fs").readFileSync(__dirname + "/../js/game.js", "utf8");
const blok = src.slice(src.indexOf("const NEUTRAL_MAX_LEVEL"), src.indexOf("function tileDefComponents"));
ok(!/Math\.random|[^a-zA-Z]rng\(/.test(blok), "v generátoru velitelů je náhoda");
console.log(`  ${i} neutrálních polí, shoda mezi běhy: ${shoda}`);

head("3. Bez výbavy, hvězd a dovedností");
// ETAPA 7 (IV-L): neutrální obránce je HRDINA s výstrojí podle tieru, takže
// kouzla z helmy MÁ. Co pořád nemá: hvězdy, dovednosti, procy a rys mystika
// (ten obchází obranu a na slabých polích by mazal útočníky).
let bad = 0, bezKouzel = 0, urovne = {}, rysy = {}, tiery = {};
for (const t of G.tiles.values()) {
  if (t.owner !== -1) continue;
  const nc = g.neutralCommander(t);
  if (nc.ward !== 0) bad++;
  if (nc.stars || nc.equip || nc.skills || nc.followUp || nc.stunChance || nc.actives) bad++;
  if (nc.trait === "mystic") bad++;
  if (!(nc.spell > 0)) bezKouzel++;
  urovne[nc.level] = (urovne[nc.level] || 0) + 1;
  rysy[nc.trait] = (rysy[nc.trait] || 0) + 1;
  tiery[nc.tier] = (tiery[nc.tier] || 0) + 1;
}
ok(bad === 0, `${bad} velitelů má hvězdy/dovednosti/procy/mystika`);
ok(bezKouzel === 0, `${bezKouzel} velitelů nemá kouzla z helmy (výstroj podle tieru)`);
ok(Object.keys(tiery).length >= 2, "všichni velitelé mají stejný tier — výstroj nerozlišuje sílu pole");
console.log("  tiery velitelů: " + Object.entries(tiery).map(([k, v]) => "T" + (+k + 1) + "×" + v).join(", "));
ok(!("mystic" in rysy), "mystický rys se objevil");
console.log("  rysy:", JSON.stringify(rysy));
console.log("  rozsah úrovní:", Math.min(...Object.keys(urovne).map(Number)), "–", Math.max(...Object.keys(urovne).map(Number)));

head("4. Posádka vs velení velitele");
const pres = [];
for (let lvl = 1; lvl <= 12; lvl++) {
  const t = [...G.tiles.values()].find(x => x.owner === -1 && !x.structure && x.level === lvl);
  if (!t) continue;
  const nc = g.neutralCommander(t), gar = g.TIER_GARRISON[lvl - 1];
  if (gar > nc.cap) pres.push(`⚔${g.TIERS[lvl-1]} posádka ${gar} > velení ${nc.cap}`);
}
ok(pres.length === 0, "běžná pole přerůstají velení: " + pres.join("; "));
console.log("  běžná pole: posádka nikde nepřerůstá velení svého velitele");
for (const k of ["throne", "grandfort", "fortress", "city", "bastion", "bridge"]) {
  const gar = g.STRUCTURES[k].militia;
  const lab = k === "grandfort" ? 500 : k === "bastion" ? 300 : gar;
  const cap = g.neutralHeroCap(g.neutralHeroLevel(lab), "warlord");
  if (gar > cap) console.log(`  ⚠ ${k}: posádka ${gar} > velení ${cap} — brání ho celé město, ne polní armáda (záměr)`);
}

head("5. Boj: velitel se skutečně projeví");
const mk = nc => ({ name: nc.name, hp: nc.hp, atk: nc.atk, def: nc.def, dmg: nc.dmg,
  speed: nc.speed, spell: 0, ward: 0 });
const kap = () => ({ name: "kapitán", hp: 80, atk: 2, def: 2, dmg: 8, speed: 4, spell: 0, ward: 0 });
const bitva = defHero => { g.newGame(0, 77, [0]); return g.simulateBattle({
  attacker: { faction: null, army: { inf: 120, arch: 120, cav: 120 },
    hero: { name: "A", hp: 200, atk: 4, def: 3, dmg: 20, speed: 5, spell: 0, ward: 0 }, mult: 1 },
  defender: { faction: null, army: { inf: 100, arch: 100, cav: 100 }, hero: defHero,
    mult: 1, heroLed: false }, structure: false }); };
// ⚠ Velitelé se losují DETERMINISTICKY ze souřadnic pole, takže jeden
// konkrétní kus mapy může padnout na slabšího z dvanácti — a s každou změnou
// generátoru se „první pole úrovně 12" posune jinam. Bere se proto PRŮMĚR
// přes několik polí, ne jeden vzorek.
const silna = [...G.tiles.values()].filter(t => t.owner === -1 && !t.structure && t.level === 12).slice(0, 6);
const a5 = bitva(kap());
const prumer = silna.reduce((sum, t) => sum + bitva(mk(g.neutralCommander(t))).tot.cmdD, 0) / silna.length;
ok(silna.length >= 3, `polí úrovně 12 na vzorek: ${silna.length}`);
ok(prumer > a5.tot.cmdD * 2, `velitel udělil průměrně ${Math.round(prumer)} vs kapitán ${a5.tot.cmdD}`);
console.log(`  poškození velitele obránce: kapitán ${a5.tot.cmdD} → velitelé ⚔300 průměrně ${Math.round(prumer)}`);

head("6. Vlastněná pole zůstala u domobrany");
const rm = src.slice(src.indexOf("function resolveMarch"));
ok(rm.includes("tile.owner === -1") && rm.includes("kapitán domobrany"),
  "chybí větev pro neutrály nebo domobranu");
ok(rm.indexOf("neutralCommander(tile)") < rm.indexOf('name: "kapitán domobrany"'),
  "pořadí větví je špatně");

head("7. Knob NEUTRAL_POWER");
ok(/const NEUTRAL_POWER = 1;/.test(src), "knob chybí nebo není 1");

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} testů prošlo, ${fail} selhalo`);
process.exit(fail ? 1 : 0);
