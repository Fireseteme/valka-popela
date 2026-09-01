// Test dlouhych sezon (v0.24): Prsten popela + body cinu, vyhra drzenim
// Trunu (Koruna popela), kraje Vellaru a skalovani delky sezony.
const g = require("../js/game.js");

let proslo = 0, selhalo = 0;
const test = (jmeno, ok) => {
  if (ok) proslo++;
  else { selhalo++; console.log("  ❌ " + jmeno); }
};
const sada = jmeno => console.log("\n=== " + jmeno + " ===");

// ---------- 1. skalovani delky sezony ----------
sada("1. Škálování délky sezóny");
// ⚠ VÝCHOZÍ sezóna je od 31. 8. 2026 cílových 336 h — hodinu si scéna musí
// vyžádat výslovně (stejně jako sim brána)
g.setSeasonHours(1);
test("krátká (1 h): držení ~7 min", g.throneHoldTicks() === 432);
test("krátká: bod činu za 150 s (24/h)", g.ringApTicks() === 150);
test("krátká: zkušenost Prstenu každou minutu", g.ringGrantTicks() === 60);
g.setSeasonHours(336);   // 14 dní
test("dlouhá (336 h): držení ~40 h (12 %)", Math.abs(g.throneHoldTicks() - 145152) < 5);
test("dlouhá: bod činu za reálnou hodinu", g.ringApTicks() === 3600);
test("dlouhá: 60 přetavení moci za sezónu", Math.abs(g.ringGrantTicks() * 60 - 336 * 3600) < 100);
g.setSeasonHours(1);

// ---------- 2. kraje ----------
sada("2. Kraje Vellaru");
test("střed = Srdce Vellaru", g.regionOf({ q: 2, r: -3 }) === g.REGION_CENTER);
test("kapitály sedí ve svých krajích",
  [[23, 9, 0], [9, 23, 1], [-23, -9, 2], [-9, -23, 3], [-9, 23, 4], [23, -9, 5], [-23, 9, 6], [9, -23, 7]]
    .every(([q, r, i]) => g.regionOf({ q, r }) === g.REGION_NAMES[i]));

// ---------- 3. Prsten popela ----------
sada("3. Prsten popela a body činu");
g.newGame(0, [0]);
const G = g.G;
const me = G.factions[0];
test("frakce začíná s Prstenem úr. 0 a plnými body", me.ring.level === 0 && me.ring.ap === 24);
for (let i = 0; i < 200; i++) g.doTick();
test("moc se přetavuje ve zkušenost (po 200 tikách)", me.ring.xp + me.ring.level > 0);
// dorůstání bodů: utratíme a počkáme
me.ring.level = 5; me.ring.ap = 3;
const pred = me.ring.ap;
for (let i = 0; i < 151; i++) g.doTick();
test("body činu dorůstají (+1 za 150 tiků)", me.ring.ap === pred + 1);

// činy
// ETAPA 7: mezi vlastními poli jsou nově i BŘEHY PŘECHODU přes dělič kolébky
// — most nemá surovinu, takže by Sklizeň nevydala nic. Bereme pole s res.
const vlastni = [...G.tiles.values()].find(t => t.owner === 0 && !t.big
  && t.structure !== "outpost" && t.structure !== "bridge" && t.res);
me.ring.ap = 24;
const jidloPred = me.resources.food;
test("Sklizeň kraje projde a něco vydá", g.ringGather(me, vlastni) === true
  && me.resources.food > jidloPred && me.ring.ap === 24 - g.RING_COSTS.gather);
me.ring.level = 0;
test("Sklizeň bez úrovně Prstenu neprojde", g.ringGather(me, vlastni) === false);
me.ring.level = 5; me.ring.ap = 24;
const h = me.heroes[0];
const xpPred = h.xp + h.level * 100000;
test("Výcvik mysli dá zkušenost", g.ringTrain(me, 0) === true && (h.xp + h.level * 100000) > xpPred);
h.stamina = 10;
// v0.31: bez ranků Výdrže je strop výdrže base (100) — dorovnává se na stamMax
test("Druhý dech vrátí výdrž", g.ringRest(me, 0) === true
  && h.stamina === g.heroStats(me, 0).stamMax);
test("Druhý dech s plnou výdrží neprojde", g.ringRest(me, 0) === false);
// v0.31: za Prsten nic automaticky — výdrž dává jen větev Výdrž stromu
test("bez ranků Výdrže žádná výdrž navíc", g.ringStam(me) === 0);
me.ring.body = 2;
test("větev Výdrž: +10 za bod", g.ringLearn(me, "vydrz") && g.ringStam(me) === 10);
test("větev Velení: +111 za bod", g.ringLearn(me, "veleni") && g.ringCap(me) === 111);

// ---------- 4. Koruna popela (výhra držením Trůnu) ----------
sada("4. Koruna popela");
g.newGame(0, [0]);
const G2 = g.G;
G2.tick = 1799;             // těsně před otevřením Trůnu
g.doTick();                 // otevře throneOpen
const trun = G2.tiles.get("0,0");
// hráč „drží" Trůn: vlastnictví celého bloku + žádná posádka na dobytí
const setOwner = (o) => { for (const k of ["0,0", ...(trun.bigKeys || [])]) { const t = G2.tiles.get(k); t.owner = o; } };
setOwner(0);
trun.garrison = 99999;      // ať ho AI nesebere
g.doTick();
test("odpočet Koruny se rozběhl", G2.throneHold.fid === 0 && G2.throneHold.ticks >= 0);
// ztráta Trůnu odpočet ruší
setOwner(1);
g.doTick();
test("ztráta Trůnu odpočet ruší (přebírá soupeř)", G2.throneHold.fid === 1 && G2.throneHold.ticks === 0);
setOwner(0);
g.doTick();
for (let i = 0; i < g.throneHoldTicks() + 2 && !G2.gameOver; i++) g.doTick();
test("po udržení vítězí držitel (Koruna popela)", G2.gameOver === true && G2.winnerId === 0);
test("kronika hlásí Korunu", G2.log.some(l => (l.text || "").includes("KORUNA POPELA")));

console.log(`\n${selhalo ? "❌" : "✅"} ${proslo} testů prošlo, ${selhalo} selhalo`);
if (selhalo) process.exit(1);
