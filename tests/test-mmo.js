// MMO MĚŘÍTKO (etapa 11): jeden průchod mapou místo skenu na aktéra, okruh
// zájmu (AOI), zastropovaný dosah a sdílení vidění po klanu.
const g = require(__dirname + "/../js/game.js");

let proslo = 0, selhalo = 0;
const test = (jmeno, ok) => {
  if (ok) proslo++;
  else { selhalo++; console.log("  ❌ " + jmeno); }
};
const sada = jmeno => console.log("\n=== " + jmeno + " ===");

sada("1. Dosah se přestal roztahovat s mapou");
{
  g.setMapRadius(34);
  test("na 69×69 zůstal 20 (brána se nehne)", g.REACH === 20);
  g.setMapRadius(110);
  test("na 221×221 je zastropovaný", g.REACH === g.REACH_MAX);
  g.setMapRadius(230);
  test("a na 461×461 taky", g.REACH === g.REACH_MAX);
  test("strop je menší než dřívější odvození", g.REACH_MAX < Math.round(5 * g.OUTER_R / 4));
  // ETAPA 11b: strop zvednutý na desetinásobek plochy — držel ho tik, ne paměť,
  // a tik od 11b na velikosti světa nezávisí (AI hledá cíle v okolí základen,
  // tickWorld jede přes živá pole a server otiskuje jen dotčené dlaždice)
  test("mapa umí až 1459×1459", g.MAP_R_MAX === 729);
  test("což je přes 23 000 hráčů", g.hracuNaFrakci(g.MAP_R_MAX) * 8 > 23000);
  g.setMapRadius(729);
  test("i na 1459×1459 je dosah zastropovaný", g.REACH === g.REACH_MAX);
  g.setMapRadius(34);
}

sada("2. Přehled aktérů: jeden průchod místo skenu na každého");
{
  g.setSeasonHours(1);
  g.newGame(0, 42, null);
  const f = g.G.factions[0];
  const clen = g.pridejClena(0, "Druhý");
  const p = g.prehledOf(f);
  test("přehled zná počet polí", p.poli === g.pocetPoli(f) && p.poli > 0);
  test("i skóre", Math.round(p.skore) === g.scoreClena(f));
  test("a surovou sklizeň", p.inc.food > 0);
  test("člen má vlastní záznam", g.prehledOf(clen).poli === g.pocetPoli(clen));
  test("cizí rod se nemíchá", g.prehledOf(g.G.factions[1]).poli === g.pocetPoli(g.G.factions[1]));

  // keš musí padat se záborem
  const pred = g.pocetPoli(f);
  const volne = [...g.G.tiles.values()].find(t => t.owner === -1 && !t.big && !t.bigSize
    && !t.structure && g.TERRAIN[t.terrain].passable);
  g.setTileOwner(volne, 0, 0);
  test("zábor přes setTileOwner keš zruší", g.pocetPoli(f) === pred + 1);
  // ⚠ přímý zápis do t.owner keš NEZRUŠÍ — kdo ho použije, musí zavolat zrusPrehled
  const volne2 = [...g.G.tiles.values()].find(t => t.owner === -1 && !t.big && !t.bigSize
    && !t.structure && g.TERRAIN[t.terrain].passable);
  volne2.owner = 0;
  test("přímý zápis keš NEZRUŠÍ (dokumentovaná past)", g.pocetPoli(f) === pred + 1);
  g.zrusPrehled();
  test("po zrusPrehled sedí zase všechno", g.pocetPoli(f) === pred + 2);
  // klanové pole nepatří nikomu osobně
  const k = g.zalozKlan(f, "Klan");
  g.setTileOwner(volne, 0, 0, k.id);
  test("klanové pole se do přehledu nepočítá", g.pocetPoli(f) === pred + 1);
}

sada("3. Okruh zájmu (AOI) je ohraničený, ať je mapa jakkoli velká");
{
  const velikosti = [];
  for (const R of [34, 110, 729]) {
    g.setSeasonHours(336);
    g.setMapRadius(R);
    g.newGame(0, 42, null);
    const a = g.G.factions[0];
    const klice = g.aoiKlice(a);
    velikosti.push({ R, aoi: klice.size, mapa: g.G.tiles.size });
    test(`R ${R}: AOI je menší než mapa`, klice.size < g.G.tiles.size || R === 34);
    test(`R ${R}: AOI obsahuje kapitál`, klice.has(g.capKeyOf(a)));
    test(`R ${R}: AOI obsahuje všechna vlastní pole`,
      [...g.G.tiles.values()].filter(t => g.patriClenu(a, t))
        .every(t => klice.has(g.keyOf(t.q, t.r))));
  }
  // TOHLE je celý smysl AOI: velikost okruhu se s mapou prakticky nemění
  const male = velikosti[0].aoi, velke = velikosti[2].aoi;
  test(`AOI neroste s mapou (${male} → ${velke} polí při 447× větší mapě)`,
    velke < male * 3);
  test("zatímco mapa vyrostla mnohonásobně",
    velikosti[2].mapa > velikosti[0].mapa * 400);
  g.setMapRadius(34);
}

sada("4. AOI se hýbe s hrdinou");
{
  g.setSeasonHours(1);
  g.setMapRadius(110);
  g.newGame(0, 42, null);
  const a = g.G.factions[0];
  const doma = g.aoiKlice(a);
  // hrdina daleko od domova otevře nový okruh
  const daleko = [...g.G.tiles.values()].find(t => g.TERRAIN[t.terrain].passable
    && Math.abs(t.q) + Math.abs(t.r) < 20);
  g.postavHrdinu(a.heroes[0], g.keyOf(daleko.q, daleko.r));
  const spole = g.aoiKlice(a);
  test("okruh se rozšířil", spole.size > doma.size);
  test("a obsahuje okolí hrdiny", spole.has(g.keyOf(daleko.q, daleko.r)));
  test("dohled hrdiny je nově 5", g.DOHLED_HRDINA === 5);
  g.setMapRadius(34);
}

sada("5. Vidění se sdílí po klanu, ne po celém rodu");
{
  g.setSeasonHours(1);
  g.newGame(0, 42, null);
  const f = g.G.factions[0];
  const a = g.pridejClena(0, "Vklanu"), b = g.pridejClena(0, "Mimoklan");
  const k = g.zalozKlan(f, "Vidoucí");
  g.prijmiDoKlanu(f, a.cid);
  // hrdiny obou členů poslat daleko od sebe
  // ⚠ pole musí být DALEKO od vlastního území — okolí vlastních polí je vidět
  // vždycky (DOHLED_POLE) a test by měřil území, ne sdílení vidění
  const cap = g.capPosOf(f);
  const dost = t => g.TERRAIN[t.terrain].passable
    && [...g.G.tiles.values()].every(x => x.owner !== 0
      || Math.abs(x.q - t.q) + Math.abs(x.r - t.r) > 3);
  const kand = [...g.G.tiles.values()].filter(dost);
  const daleko = [kand[0], kand.find(t =>
    Math.abs(t.q - kand[0].q) + Math.abs(t.r - kand[0].r) > 2 * g.DOHLED_HRDINA + 2)];
  g.postavHrdinu(a.heroes[0], g.keyOf(daleko[0].q, daleko[0].r));
  g.postavHrdinu(b.heroes[0], g.keyOf(daleko[1].q, daleko[1].r));
  g.G.playerClen = 0;   // dívá se zakladatel (je v klanu)
  g.computeVisibility();
  test("vidím hrdinu spoluklanovníka", g.G.visible.has(g.keyOf(daleko[0].q, daleko[0].r)));
  test("hrdinu mimo klan nevidím", !g.G.visible.has(g.keyOf(daleko[1].q, daleko[1].r)));
  // kdo v klanu není, sdílí po rodu jako dřív
  g.odejdiZKlanu(f);
  g.computeVisibility();
  test("bez klanu se sdílí po rodu jako dřív",
    g.G.visible.has(g.keyOf(daleko[1].q, daleko[1].r)));
}

sada("6. Počet polí posílá server (klient má jen část mapy)");
{
  g.setSeasonHours(1);
  g.newGame(0, 42, null);
  const f = g.G.factions[0];
  g.doTick();
  test("aktér nese autoritativní počet polí", f.poli === g.pocetPoli(f) && f.poli > 0);
  const clen = g.pridejClena(0, "Člen");
  g.doTick();
  test("i člen", clen.poli === g.pocetPoli(clen));
}

sada("7. Etapa 11b: nic v tiku už neprochází celý svět");
{
  g.setSeasonHours(1);
  g.setMapRadius(34);
  g.newGame(0, 42, null);
  const f = g.G.factions[0];

  // okolí základen — zdroj kandidátů AI místo průchodu mapou
  const kap = g.G.tiles.get(g.capKeyOf(f));
  const okoli = g.poleVOkoli([kap], 5);
  test("okolí je jen kus světa", okoli.length > 0 && okoli.length < g.G.tiles.size / 4);
  test("okolí drží pořadí mapy (q, r)",
    okoli.every((t, i) => i === 0 || t.q > okoli[i - 1].q
      || (t.q === okoli[i - 1].q && t.r > okoli[i - 1].r)));
  test("okolí nesahá dál než zadaný dosah",
    okoli.every(t => Math.abs(t.q - kap.q) + Math.abs(t.r - kap.r) <= 5));

  // živá pole: v klidném světě jich je řádově míň než polí
  g.doTick();
  test("evidence živých polí vznikla", g.G.zive instanceof Set);
  test("živých polí je zlomek mapy", g.G.zive.size < g.G.tiles.size / 10);
  const cil = [...g.G.tiles.values()].find(t => t.owner === -1 && !t.big && !t.structure
    && g.TERRAIN[t.terrain].passable && t.garrison > 2);
  cil.garrison -= 1;
  g.ozivPole(cil);
  test("pobité pole se do evidence dostane", g.G.zive.has(g.keyOf(cil.q, cil.r)));

  // výspy se evidují, ne hledají průchodem světa
  const volne = [...g.G.tiles.values()].find(t => t.owner === -1 && !t.structure
    && !t.big && !t.bigSize && !t.riv && g.TERRAIN[t.terrain].passable);
  g.setTileOwner(volne, f.id, 0);
  const vlastni = volne;
  const pred = g.vyspyRodu(f.id).length;
  f.resources.stone = 9999; f.resources.wood = 9999; f.resources.gold = 9999;
  g.buildOutpost(f, vlastni);
  test("postavená výspa je hned v evidenci", g.vyspyRodu(f.id).length === pred + 1);
}

sada("8. Svět úplně bez AI (etapa 11b)");
{
  g.setSeasonHours(1);
  g.setMapRadius(34);
  g.newGame(0, 42, null);
  const aiPred = g.G.factions.filter(f => f.isAI).length;
  test("výchozí svět má AI rody", aiPred === 7);
  test("zrusAI vypne všechny", g.zrusAI() === aiPred);
  test("a nezbyl ani jeden", g.G.factions.every(f => !f.isAI));

  const poliPred = g.G.factions.map(f => g.pocetPoli(f));
  for (let i = 0; i < 200; i++) g.doTick();
  test("svět bez AI tiká dál", g.G.tick === 200 && !g.G.gameOver);
  test("a nikdo sám neexpanduje",
    g.G.factions.every((f, i) => g.pocetPoli(f) === poliPred[i]));
  // neutrální posádky NEJSOU AI — pořád je co dobývat
  const neutral = [...g.G.tiles.values()].filter(t => t.owner === -1 && t.garrison > 0);
  test("neutrální pole se pořád brání", neutral.length > 100);
  test("hráči teče příjem i bez AI", g.incomeOf(g.G.factions[0]).food > 0);
}

console.log(`\n${proslo} prošlo, ${selhalo} selhalo`);
if (selhalo) process.exit(1);
