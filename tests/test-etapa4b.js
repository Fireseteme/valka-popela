// Etapa 4b (v0.31): strom Prstenu (za Prsten nic automaticky), strop území
// se třemi zdroji (Nadvláda / kapitoly příběhu / checkpointy), osobní journey
// per frakce a kolektivní checkpointy s pozdním uznáním.
const g = require("../js/game.js");

let proslo = 0, selhalo = 0;
const test = (jmeno, ok) => {
  if (ok) proslo++;
  else { selhalo++; console.log("  ❌ " + jmeno); }
};
const sada = jmeno => console.log("\n=== " + jmeno + " ===");
const kk = g.keyOf;
const PRUCH = { plains: 1, forest: 1, hills: 1, ruins: 1 };

// ---------- 1. Strom Prstenu ----------
sada("1. Strom Prstenu: body, větve, reset");
{
  g.newGame(0, 60, [0]);
  const me = g.G.factions[0];
  test("start: 0 bodů, prázdný strom", me.ring.body === 0 && me.ring.strom.nadvlada === 0);
  me.ring.level = 5;
  test("automatiky pryč: výdrž i velení 0 bez ranků",
    g.ringStam(me) === 0 && g.ringCap(me) === 0);
  test("learn bez bodů nejde", !g.ringLearn(me, "vydrz"));
  me.ring.body = 4;
  test("Výdrž +10/bod", g.ringLearn(me, "vydrz") && g.ringStam(me) === 10);
  test(`Velení +111/bod (2 body)`,
    g.ringLearn(me, "veleni") && g.ringLearn(me, "veleni") && g.ringCap(me) === 222);
  test("Vláda zvedá strop ⚡ na 26", g.ringLearn(me, "vlada") && g.ringApMax(me) === 26);
  test("body dojely a strop větve drží", me.ring.body === 0 && !g.ringLearn(me, "nadvlada"));
  me.ring.body = 1;
  test("neznámá větev nejde", !g.ringLearn(me, "blbost"));
  me.ring.strom.hojnost = 2;
  const atkS = g.heroStats(me, 0).atk;
  me.ring.strom.hojnost = 0;
  test("Hojnost: +0,5 útoku za bod", Math.abs(atkS - g.heroStats(me, 0).atk - 1) < 0.001);
  me.resources.gold = 1000;
  test("reset vrací body dle úrovně a stojí zlato",
    g.ringReset(me) && me.ring.body === me.ring.level
    && me.ring.strom.vydrz === 0 && me.resources.gold === 1000 - g.RING_RESPEC_GOLD);
  test("reset bez utracených bodů nejde", !g.ringReset(me));
}

// ---------- 2. Strop území ----------
sada("2. Strop území: gate, výjimky a tři zdroje");
{
  g.newGame(0, 61, [0]);
  const G = g.G, me = G.factions[0];
  G.faze = 4;
  test("základ 80", g.stropPoli(me) === g.STROP_BASE && g.STROP_BASE === 80);
  me.ring.strom.nadvlada = 3; me.journey.kapitola = 2; G.checkpointy[0] = true;
  test("zdroje se sčítají (80+30+20+8)", g.stropPoli(me) === 138);
  test("plný strop je 216", (() => {
    me.ring.strom.nadvlada = 5; me.journey.kapitola = 6;
    G.checkpointy = [true, true, true];
    const s = g.stropPoli(me);
    me.ring.strom.nadvlada = 0; me.journey.kapitola = 0;
    G.checkpointy = [false, false, false];
    return s === 216;
  })());
  // nasypat pole POBLÍŽ kapitálu na strop a zkoušet gate
  const cap = g.capPosOf(me);
  const kandidati = [...G.tiles.values()]
    .filter(t => t.owner === -1 && !t.structure && !t.big && !t.bigSize && !t.riv
      && PRUCH[t.terrain]
      && Math.abs(t.q - cap.q) + Math.abs(t.r - cap.r) <= 14)
    .sort((a, b) => (Math.abs(a.q - cap.q) + Math.abs(a.r - cap.r))
      - (Math.abs(b.q - cap.q) + Math.abs(b.r - cap.r)));
  const chybi = 80 - g.pocetPoli(me);
  for (let i = 0; i < chybi; i++) kandidati[i].owner = 0;
  // ⚠ etapa 11: pocetPoli čte přehled aktérů (jeden průchod mapou za tik).
  // Kdo píše t.owner PŘÍMO místo přes setTileOwner, musí keš zrušit sám.
  g.zrusPrehled();
  test("frakce stojí na stropu", g.pocetPoli(me) === 80);
  const cil = kandidati[chybi];
  const h = me.heroes[0];
  h.pos = null; h.stamina = 120; h.cooldown = 0;
  me.units = { inf: 500, arch: 0, cav: 0 }; me.resources.gold = 9999;
  test("zábor na stropu odmítnut", !g.startMarch(me, cil, { inf: 100, arch: 0, cav: 0 }, 0));
  // OPRAVA v0.32: i nájezd pole DOBÝVÁ (jen hrdina nezůstává) — strop platí
  // i pro něj; ventil agrese na stropu přinese až Plunder (PLAN II-C2)
  test("nájezd na stropu NEprojde (dobývá pole)",
    !g.startMarch(me, cil, { inf: 100, arch: 0, cav: 0 }, 0, true));
  me.marches.length = 0; me.units.inf = 500;
  me.ring.strom.nadvlada = 1;
  test("bod Nadvlády strop zvedne a zábor zase jde",
    g.startMarch(me, cil, { inf: 100, arch: 0, cav: 0 }, 0));
}

// ---------- 3. Příběh sezóny (journey) ----------
sada("3. Kapitoly příběhu: postup, odměna, per frakce");
{
  g.newGame(0, 62, [0]);
  const G = g.G, me = G.factions[0];
  test("journey startuje kapitolou 0", me.journey.kapitola === 0);
  let dano = 0;
  for (const t of G.tiles.values()) {
    if (dano >= 10) break;
    if (t.owner === -1 && !t.structure && !t.big && !t.bigSize && !t.riv
      && PRUCH[t.terrain]) { t.owner = 0; dano++; }
  }
  me.stats.wins = 5;
  me.heroes[0].level = 5;
  const zlatoPred = me.resources.gold;
  for (let i = 0; i < 6; i++) g.doTick();
  test("kapitola 1 dovyprávěna", me.journey.kapitola === 1);
  test("odměna kapitoly přišla", me.resources.gold > zlatoPred);
  test("strop vzrostl o 10", g.stropPoli(me) === 90 + (G.checkpointy[0] ? g.CHECKPOINTY[0].bonusPoli : 0));
  test("splněné questy se resetují pro další kapitolu",
    Object.keys(me.journey.splnene).length === 0);
  test("AI frakce má vlastní nezávislý journey", G.factions[3].journey.kapitola === 0);
}

// ---------- 4. Checkpointy: pozdní uznání po pojistce ----------
sada("4. Checkpointy: pojistka otevírá zónu, odměna až za splnění");
{
  g.newGame(0, 63, [0]);
  const G = g.G, me = G.factions[0];
  G.tick = g.zoneFazeTicks(2) + 2;
  for (let i = 0; i < 8; i++) g.doTick();
  test("fáze 2 pojistkou, checkpoint zatím neuznán", G.faze >= 2 && !G.checkpointy[0]);
  const stropPred = g.stropPoli(me);
  const potreba = 24 * G.factions.filter(f => f.alive).length;
  let mame = 0;
  for (const t of G.tiles.values()) if (t.owner !== -1) mame++;
  let dano = 0;
  for (const t of G.tiles.values()) {
    if (mame + dano >= potreba + 2) break;
    if (t.owner === -1 && !t.structure && !t.big && !t.bigSize) { t.owner = 1; dano++; }
  }
  for (let i = 0; i < 8; i++) g.doTick();
  test("checkpoint uznán POZDĚ (po pojistce) a strop všem +8",
    G.checkpointy[0] && g.stropPoli(me) === stropPred + g.CHECKPOINTY[0].bonusPoli);
}

console.log(`\n${proslo} prošlo, ${selhalo} selhalo`);
if (selhalo) process.exit(1);
