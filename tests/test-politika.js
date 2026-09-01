// POLITIKA (etapa 10, IV-D): rozhodující klan, hlasování rady a členů,
// vyhlášení s odpočtem, oboustranná válka, mír s klidem a spojenectví.
const g = require(__dirname + "/../js/game.js");

let proslo = 0, selhalo = 0;
const test = (jmeno, ok) => {
  if (ok) proslo++;
  else { selhalo++; console.log("  ❌ " + jmeno); }
};
const sada = jmeno => console.log("\n=== " + jmeno + " ===");

// scéna: rod 0 s klanem (vůdce + 4 členové, aby šla rada i hlasování členů)
function scena(clenu = 4) {
  g.setSeasonHours(1);
  g.newGame(0, 42, null);
  const f = g.G.factions[0];
  const clenove = [];
  for (let i = 0; i < clenu; i++) clenove.push(g.pridejClena(0, "Hráč" + (i + 1)));
  const k = g.zalozKlan(f, "Rada popela");
  for (const c of clenove) g.prijmiDoKlanu(f, c.cid);
  g.prepoctiRozhodujici(true);
  return { f, clenove, k };
}
// rada se v malém klanu obsazuje ručně (sloty rostou po 20 členech)
const dejRadu = (k, cids) => { k.dustojnici = cids.slice(); };

sada("1. Lhůty vycházejí z délky sezóny, ne z hodin na zdi");
{
  g.setSeasonHours(336);
  test("den = 24 h", g.denTicks() === 86400);
  test("vyhlášení má ~6 h odpočet", g.vyhlaseniTicks() === 21600);
  test("válka trvá nejméně 3 dny", g.valkaMinTicks() === 3 * 86400);
  test("po míru 3 dny klidu", g.mirKlidTicks() === 3 * 86400);
  g.setSeasonHours(1);
  test("na hodinové sezóně se to smrskne, ale nezmizí",
    g.denTicks() >= 60 && g.denTicks() < 3600 && g.vyhlaseniTicks() >= 30);
}

sada("2. Rozhodující klan = nejsilnější, a mezi přepočty PLATÍ");
{
  const { f, clenove, k } = scena(2);
  test("jediný klan rozhoduje", g.rozhodujiciKlanId(0) === k.id && g.jeRozhodujici(k));
  // druhý klan téhož rodu, zatím slabší
  const b = g.pridejClena(0, "Vyzyvatel");
  const k2 = g.zalozKlan(b, "Druhý");
  g.prepoctiRozhodujici(true);
  test("silnější zůstává rozhodující", g.rozhodujiciKlanId(0) === k.id);
  // vezmeme prvnímu klanu členy — síla klesne
  for (const c of clenove) g.odejdiZKlanu(c);
  g.odejdiZKlanu(f);
  g.prepoctiRozhodujici(true);
  test("po oslabení přebírá vedení druhý klan", g.rozhodujiciKlanId(0) === k2.id);
  test("a je to poznat i z jeRozhodujici", g.jeRozhodujici(k2) && !g.jeRozhodujici(k));
  // mezi přepočty se to NEMĚNÍ
  g.G.rozhodujici[0].doTiku = g.G.tick + 999999;
  g.zrusKlan(k2);
  g.prepoctiRozhodujici();
  test("bez přepočtu drží staré rozhodnutí", g.rozhodujiciKlanId(0) === k2.id);
}

sada("3. Hlasování otevírá jen důstojník rozhodujícího klanu");
{
  const { f, clenove, k } = scena(4);
  dejRadu(k, [clenove[0].cid]);
  test("řadový člen hlasování neotevře", !g.zahajHlasovani(clenove[1], "valka", 1, 0.5));
  test("vůdce ano", !!g.zahajHlasovani(f, "valka", 1, 0.5));
  test("dvakrát totéž ne", !g.zahajHlasovani(f, "valka", 1, 0.5));
  test("na sebe se válka nevyhlašuje", !g.zahajHlasovani(f, "valka", 0, 0.5));
  test("mír bez války nedává smysl", !g.zahajHlasovani(f, "mir", 2, 0.5));
  const h = g.hlasovaniOtevrene(0)[0];
  test("hlasování začíná u RADY", h.faze === "rada");
  test("práh členů nejde pod 10 %",
    g.zahajHlasovani(f, "valka", 2, 0.01) && g.hlasovaniOtevrene(0)
      .find(x => x.cil === 2).prah === g.HLASOVANI_MIN_PODIL);
}

sada("4. Rada, pak členové — a mlčení není souhlas");
{
  const { f, clenove, k } = scena(4);
  dejRadu(k, [clenove[0].cid]);            // rada = vůdce + 1 důstojník
  const h = g.zahajHlasovani(f, "valka", 1, 0.5);
  test("řadový člen v první fázi nehlasuje", !g.hlasuj(clenove[1], h.id, true));
  test("vůdce hlasuje pro", g.hlasuj(f, h.id, true));
  test("dokud rada nedohlasovala, fáze drží", h.faze === "rada");
  test("druhý důstojník dohlasuje", g.hlasuj(clenove[0], h.id, true));
  test("rada prošla → hlasují členové", h.faze === "clenove");
  test("druhé kolo začíná s čistým stolem", Object.keys(h.hlasy).length === 0);

  // klan má 5 aktérů (vůdce + 4), práh 50 % → potřeba 3 hlasy pro
  test("první hlas prošel", g.hlasuj(f, h.id, true));
  test("týž aktér podruhé nehlasuje", !g.hlasuj(f, h.id, true));
  test("druhý hlas prošel", g.hlasuj(clenove[0], h.id, true));
  test("dva hlasy z pěti nestačí", h.faze === "clenove");
  g.hlasuj(clenove[1], h.id, true);
  test("třetí hlas hlasování uzavře", h.faze === "hotovo" && h.vysledek === "prošlo");
  test("vzniklo VYHLÁŠENÍ s odpočtem", (f.vyhlaseni || {})[1] > g.G.tick);
  test("válka ještě neběží", !g.jeValka(f, 1));
}

sada("5. Rada zamítne a je konec");
{
  const { f, clenove, k } = scena(4);
  dejRadu(k, [clenove[0].cid]);
  const h = g.zahajHlasovani(f, "valka", 1, 0.5);
  g.hlasuj(f, h.id, true);
  g.hlasuj(clenove[0], h.id, false);
  test("jeden proti v malé radě = zamítnuto",
    h.faze === "hotovo" && h.vysledek === "rada zamítla");
  test("žádné vyhlášení nevzniklo", !(f.vyhlaseni || {})[1]);

  // vypršení lhůty
  const h2 = g.zahajHlasovani(f, "valka", 2, 0.5);
  h2.doTiku = g.G.tick;
  g.doTick();
  test("vypršelá lhůta = zamítnuto", h2.faze === "hotovo" && h2.vysledek === "vypršelo");
}

sada("6. Odpočet, válka je OBOUSTRANNÁ");
{
  const { f, clenove, k } = scena(4);
  dejRadu(k, [clenove[0].cid]);
  const h = g.zahajHlasovani(f, "valka", 1, 0.5);
  g.hlasuj(f, h.id, true); g.hlasuj(clenove[0], h.id, true);
  g.hlasuj(f, h.id, true); g.hlasuj(clenove[0], h.id, true); g.hlasuj(clenove[1], h.id, true);
  test("vyhlášeno", h.vysledek === "prošlo");
  f.vyhlaseni[1] = g.G.tick;      // zkrátit odpočet, ať test netrvá
  g.doTick();
  const cil = g.G.factions[1];
  test("po odpočtu válka běží", g.jeValka(f, 1));
  test("a běží OBĚMA směry", g.jeValka(cil, 0));
  test("obě strany si pamatují začátek", (f.valkaOd || {})[1] && (cil.valkaOd || {})[0]);
  test("odpočet zmizel", !(f.vyhlaseni || {})[1]);
}

sada("7. Mír až po třech dnech, pak tři dny klidu");
{
  const { f, clenove, k } = scena(4);
  dejRadu(k, [clenove[0].cid]);
  g.zacniValku(f, 1);
  test("o míru se hned hlasovat nedá", !g.zahajHlasovani(f, "mir", 1, 0.5));
  f.valkaOd[1] = g.G.tick - g.valkaMinTicks() - 1;
  const h = g.zahajHlasovani(f, "mir", 1, 0.5);
  test("po třech dnech ano", !!h);
  g.hlasuj(f, h.id, true); g.hlasuj(clenove[0], h.id, true);
  g.hlasuj(f, h.id, true); g.hlasuj(clenove[0], h.id, true); g.hlasuj(clenove[1], h.id, true);
  test("mír je OKAMŽITÝ", h.vysledek === "prošlo" && !g.jeValka(f, 1));
  test("a oboustranný", !g.jeValka(g.G.factions[1], 0));
  test("tři dny se válka vyhlásit nedá", !g.zahajHlasovani(f, "valka", 1, 0.5));
  f.mirDo[1] = g.G.tick - 1;
  test("po klidu už zas ano", !!g.zahajHlasovani(f, "valka", 1, 0.5));
}

sada("8. Spojenectví: jedno na rod, oboustranné");
{
  const { f, clenove, k } = scena(2);
  dejRadu(k, [clenove[0].cid]);
  const b = g.G.factions[1], c = g.G.factions[2];
  test("na začátku nikdo spojence nemá", g.spojenecId(f) === -1);
  test("nabídka projde", g.nabidniSpojenectvi(f, 1));
  test("dokud druhá strana nepřijme, spojenectví není", !g.jsouSpojenci(f, b));
  // druhá strana potvrdí (v testu přímo, v UI to udělá její rozhodující klan)
  b.spojenec = 0;
  test("po potvrzení spojenectví platí", g.jsouSpojenci(f, b) && g.jsouSpojenci(b, f));
  test("druhého spojence si rod nepořídí", !g.nabidniSpojenectvi(f, 2));
  test("řadový člen spojence nesjedná", !g.nabidniSpojenectvi(clenove[1], 2));

  // spojenecká půda je pro PŘESUN i SOUSEDSTVÍ jako vlastní.
  // ⚠ Rod na startu vlastní jen blok kapitálu a mostní pole přechodu, takže
  // se prosté pole musí spojenci PŘIDĚLIT — jinak testujeme geometrii, ne pravidlo.
  const volne = [...g.G.tiles.values()].find(t => t.owner === -1 && !t.big && !t.bigSize
    && !t.structure && g.TERRAIN[t.terrain].passable
    && g.neighborsOf(t).some(n => n.owner === -1 && !n.big && !n.bigSize && !n.structure
      && g.TERRAIN[n.terrain].passable));
  g.setTileOwner(volne, 1);
  const jehoPole = volne;
  test("spojencovo pole je pro přesun vlastní", g.jeMoje(f, jehoPole));
  test("ale do obrany se to nepropisuje", !g.braniPole(f, jehoPole));
  const soused = g.neighborsOf(jehoPole).find(t => t.owner === -1
    && g.TERRAIN[t.terrain].passable && !t.big && !t.bigSize);
  if (soused) test("od hranice spojence se smí dobývat", g.isAdjacentToFaction(f, soused));
  else test("od hranice spojence se smí dobývat", false);

  // válka spojenectví ruší
  g.zacniValku(f, 1);
  test("válka spojenectví trhá", !g.jsouSpojenci(f, b) && g.spojenecId(f) === -1);
  test("cizí pole je zase cizí", !g.jeMoje(f, jehoPole));
}

sada("9. Stav politiky projde snapshotem");
{
  const { f, clenove, k } = scena(2);
  dejRadu(k, [clenove[0].cid]);
  g.zahajHlasovani(f, "valka", 1, 0.5);
  f.spojenec = 2;
  const kolo = JSON.parse(JSON.stringify({
    rozhodujici: g.G.rozhodujici, hlasovani: g.G.hlasovani, factions: g.G.factions }));
  test("rozhodující klan projde", kolo.rozhodujici[0].klan === k.id);
  test("hlasování projde", kolo.hlasovani.length === 1 && kolo.hlasovani[0].typ === "valka");
  test("spojenec projde", kolo.factions[0].spojenec === 2);
  g.newGame(0, 42, null);
  test("nová sezóna politiku nedědí",
    (g.G.hlasovani || []).length === 0 && g.G.factions[0].spojenec === -1);
}

console.log(`\n${proslo} prošlo, ${selhalo} selhalo`);
if (selhalo) process.exit(1);
