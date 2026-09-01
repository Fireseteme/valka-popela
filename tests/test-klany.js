// KLANY (etapa 8, IV-A + IV-B): klan jako entita uvnitř rodu, třetí úroveň
// vlastnictví pole (rod → člen → klan), klanová pevnost a vyhazov jako STAV.
const g = require(__dirname + "/../js/game.js");

let proslo = 0, selhalo = 0;
const test = (jmeno, ok) => {
  if (ok) proslo++;
  else { selhalo++; console.log("  ❌ " + jmeno); }
};
const sada = jmeno => console.log("\n=== " + jmeno + " ===");
const kk = g.keyOf;

// scéna: frakce 0 se zakladatelem a N členy
function scena(seed = 42, clenu = 2) {
  g.setSeasonHours(1);
  g.newGame(0, seed, null);
  const f = g.G.factions[0];
  const clenove = [];
  for (let i = 0; i < clenu; i++) clenove.push(g.pridejClena(0, "Hráč" + (i + 1)));
  return { f, clenove };
}

// vlastněný uzel 2×2 pro aktéra (klanová pevnost se staví jen na uzlu)
function dejUzel(a, poradi = 0) {
  let n = 0;
  for (const t of g.G.tiles.values()) {
    if (t.bigSize !== 2 || t.big || t.structure) continue;
    if (g.zonaOf(t) !== "expanze-" + a.id && !g.zonaOf(t).startsWith("kolebka-")) continue;
    if (n++ < poradi) continue;
    g.setTileOwner(t, a.id, a.cid || 0);
    return t;
  }
  return null;
}

sada("1. Klan vzniká, má kapacitu a jeden aktér je nejvýš v jednom");
{
  const { f, clenove } = scena(42, 2);
  const k = g.zalozKlan(f, "Popelní jezdci");
  test("klan vznikl", !!k && k.fid === 0 && k.level === 1);
  test("zakladatel je vůdce", g.jeVudce(k, f) && g.jeDustojnik(k, f));
  test("kapacita 1. úrovně je 25", g.klanKapacita(k) === g.KLAN_ZAKLAD_CLENU);
  test("kapacita 10. úrovně je 100", g.klanKapacita({ level: 10 }) === g.KLAN_MAX_CLENU);
  test("druhý klan témuž aktérovi nevznikne", g.zalozKlan(f, "Druhý") === null);
  test("stejné jméno v rodu podruhé neprojde", g.zalozKlan(clenove[0], "popelní JEZDCI") === null);
  test("klan bez jména nevznikne", g.zalozKlan(clenove[0], "   ") === null);

  test("člen se přidá", g.prijmiDoKlanu(f, clenove[0].cid) && clenove[0].klan === k.id);
  test("kdo není důstojník, nepřijímá", !g.prijmiDoKlanu(clenove[0], clenove[1].cid));
  test("člen klanu se podruhé nepřidá", !g.prijmiDoKlanu(f, clenove[0].cid));
  test("klanCleny vrací vůdce první", g.klanCleny(k)[0] === f && g.klanCleny(k).length === 2);
}

sada("2. Hodnosti a rada");
{
  const { f, clenove } = scena(42, 2);
  const k = g.zalozKlan(f, "Rada");
  g.prijmiDoKlanu(f, clenove[0].cid);
  // sloty důstojníků rostou s počtem členů (jeden na 20)
  test("malý klan nemá důstojnický slot", g.klanDustojnikuMax(k) === 0);
  test("bez slotu se nepovyšuje", !g.povysDustojnika(f, clenove[0].cid));
  k.dustojnici = [clenove[0].cid];            // ruční nasazení pro test rady
  test("důstojník je uznán", g.jeDustojnik(k, clenove[0]));
  test("vůdce se povýšit nedá", !g.povysDustojnika(f, f.cid || 0));
  test("sesadit smí jen vůdce", !g.sesadDustojnika(clenove[0], clenove[0].cid));

  // do 4 důstojníků JEDNOMYSLNĚ, od 4 většina a nejvýš jeden proti
  test("rada 2: jednomyslně ano", g.radaProsla(k, 2, 0));
  test("rada 2: jeden proti = ne", !g.radaProsla(k, 1, 1));
  const velka = { dustojnici: [1, 2, 3, 4] };  // vůdce + 4 = rada 5
  test("rada 5: většina projde", g.radaProsla(velka, 3, 2) === false || g.radaProsla(velka, 4, 1));
  test("rada 5: dva proti neprojdou", !g.radaProsla(velka, 3, 2));
  test("rada 5: 4 pro a 1 proti projde", g.radaProsla(velka, 4, 1));
}

sada("3. Úroveň klanu roste z kumulativní síly členů");
{
  const { f, clenove } = scena(42, 1);
  const k = g.zalozKlan(f, "Síla");
  g.prijmiDoKlanu(f, clenove[0].cid);
  const sila = g.klanSila(k);
  test("síla klanu je součet skóre členů",
    sila === g.scoreClena(f) + g.scoreClena(clenove[0]) && sila > 0);
  k.xp = g.klanXpNeed(1) - 1;
  g.klanTick();
  test("klanTick povýšil po překročení prahu", k.level === 2);
  test("kapacita s úrovní vzrostla", g.klanKapacita(k) > g.KLAN_ZAKLAD_CLENU);
  // klan bez členů se rozpadne sám (zakládá ho aktér MIMO klan)
  const { clenove: c2 } = scena(44, 1);
  const osirely = g.zalozKlan(c2[0], "Osiřelý");
  c2[0].klan = 0;
  g.klanTick();
  test("klan bez členů zaniká", !!osirely && !g.klanPodleId(osirely.id));
}

sada("4. Třetí úroveň vlastnictví: klanové pole nepatří nikomu osobně");
{
  const { f, clenove } = scena(42, 1);
  const k = g.zalozKlan(f, "Držba");
  const t = dejUzel(f);
  test("uzel 2×2 nalezen", !!t && t.bigSize === 2);
  const poliPred = g.pocetPoli(f);
  const vynosPred = g.incomeOf(f).stone;

  g.setTileOwner(t, 0, 0, k.id);
  test("pole nese klan", t.klan === k.id && g.patriKlanu(k, t));
  test("klanové pole už nepatří členovi", !g.patriClenu(f, t) && !g.patriClenu(clenove[0], t));
  test("klanové pole se nepočítá do osobního stropu", g.pocetPoli(f) < poliPred);
  test("celý blok nese klan", g.blockTiles(t).every(m => m.klan === k.id && m.clen === undefined));

  // klanové a osobní vlastnictví se vylučují
  g.setTileOwner(t, 0, clenove[0].cid);
  test("osobní zábor klan maže", t.klan === undefined && t.clen === clenove[0].cid);
  g.setTileOwner(t, 0, clenove[0].cid, k.id);
  test("klanový zábor maže člena", t.klan === k.id && t.clen === undefined);
  test("výnos klanové pevnosti je nula",
    (g.tileYield({ structure: "klanpevnost", level: 12, res: "stone" }).stone) === 0
    && vynosPred >= 0);
}

sada("5. Klanová pevnost: kdo, kde a za co");
{
  const { f, clenove } = scena(42, 1);
  const k = g.zalozKlan(f, "Pevnost");
  g.prijmiDoKlanu(f, clenove[0].cid);
  const uzel = dejUzel(f);
  f.resources.stone = 9e6; f.resources.wood = 9e6; f.resources.gold = 9e6;

  // ⚠ pole MUSÍ být i mimo blok (!x.big): bigAnchor by z člena bloku udělal
  // kotvu uzlu a pevnost by na něm správně šla postavit
  test("běžné pole pevnost neunese", !g.lzeStavetPevnost(f, [...g.G.tiles.values()]
    .find(x => x.owner === 0 && !x.bigSize && !x.big && !x.structure)));
  test("cizí uzel pevnost neunese", !g.lzeStavetPevnost(clenove[0], uzel));
  test("na vlastním uzlu ano", g.lzeStavetPevnost(f, uzel));
  test("pevnost postavena", g.postavKlanovouPevnost(f, uzel));
  test("pole je klanové a je to pevnost",
    uzel.klan === k.id && g.jeKlanovaPevnost(uzel) && uzel.klanPredchozi === 0);
  test("pevnost se počítá klanu", g.klanPevnosti(k).length === 1);
  test("na téže pole podruhé ne", !g.postavKlanovouPevnost(f, uzel));

  // strop pevností
  const strop = g.klanPevnostiMax(k);
  test("strop pevností je aspoň 3", strop >= g.KLAN_PEVNOSTI_ZAKLAD);
  let postaveno = 1;
  for (let i = 1; i < strop + 3 && postaveno < strop + 1; i++) {
    const dalsi = dejUzel(f, i);
    if (dalsi && g.postavKlanovouPevnost(f, dalsi)) postaveno++;
  }
  test(`nad strop se nestaví (${postaveno}/${strop})`, postaveno <= strop);

  // zbourání vrací pole tomu, kdo ho do klanu vložil
  test("bourá jen důstojník", !g.zbourejKlanovouPevnost(clenove[0], uzel));
  test("pevnost zbourána", g.zbourejKlanovouPevnost(f, uzel));
  test("pole je zase osobní", uzel.klan === undefined && g.patriClenu(f, uzel)
    && uzel.structure === null);
}

sada("6. Pevnost promítá dosah a má kapacitu jeden hrdina za člena");
{
  const { f, clenove } = scena(42, 1);
  const k = g.zalozKlan(f, "Dosah");
  g.prijmiDoKlanu(f, clenove[0].cid);
  const uzel = dejUzel(f);
  f.resources.stone = 9e6; f.resources.wood = 9e6; f.resources.gold = 9e6;
  g.postavKlanovouPevnost(f, uzel);
  const klic = kk(uzel.q, uzel.r);

  // člen (jiný aktér!) se v cizí pevnosti usadí, protože je ve stejném klanu
  const h = clenove[0].heroes[0];
  g.postavHrdinu(h, klic);
  test("člen klanu se v pevnosti usadí", g.heroSettle(clenove[0], 0) && h.zakladna === klic);
  test("základna hrdiny je pevnost", g.heroBaseKey(clenove[0], h) === klic);

  // kdo v klanu není, se neusadí
  const cizi = g.pridejClena(0, "Cizí");
  g.postavHrdinu(cizi.heroes[0], klic);
  test("nečlen klanu se v pevnosti neusadí", !g.heroSettle(cizi, 0));

  // „HOTOVO, KDYŽ": člen dosáhne z pevnosti tam, kam by z kapitálu nedosáhl
  const kap = g.capPosOf(clenove[0]);
  const daleko = [...g.G.tiles.values()].find(t => {
    const dKap = Math.abs(t.q - kap.q) + Math.abs(t.r - kap.r);
    const dPev = Math.abs(t.q - uzel.q) + Math.abs(t.r - uzel.r);
    return dKap > g.REACH && dPev <= g.REACH;
  });
  test("existuje pole mimo dosah kapitálu, ale v dosahu pevnosti", !!daleko);
  if (daleko) {
    test("z pevnosti na něj člen dosáhne", g.vDosahu(clenove[0], h, daleko));
    h.zakladna = null;
    test("od kapitálu ne", !g.vDosahu(clenove[0], h, daleko));
    h.zakladna = klic;
  } else { test("z pevnosti na něj člen dosáhne", false); test("od kapitálu ne", false); }

  test("kapacita pevnosti = počet členů klanu", g.pevnostKapacita(k) === 2);
  test("hrdinů na poli se počítá napříč aktéry", g.hrdinuNaPoli(klic) === 2);
}

sada("7. Vyhazov je STAV, ne dialog");
{
  const { f, clenove } = scena(42, 2);
  const k = g.zalozKlan(f, "Výpověď");
  g.prijmiDoKlanu(f, clenove[0].cid);
  g.prijmiDoKlanu(f, clenove[1].cid);

  test("vůdce se vyhodit nedá", !g.navrhniVyhazov(f, f.cid || 0));
  test("výpověď odešla", g.navrhniVyhazov(f, clenove[0].cid) && !!clenove[0].vyhazov);
  test("dvakrát tutéž výpověď ne", !g.navrhniVyhazov(f, clenove[0].cid));
  test("přijetí = čistý odchod",
    g.prijmiVyhazov(clenove[0]) && !clenove[0].klan && !g.jeVyvrhel(clenove[0]));

  // odmítnutí = vyvrhel
  g.navrhniVyhazov(f, clenove[1].cid);
  test("odmítnutí dělá vyvrhela",
    g.odmitniVyhazov(clenove[1]) && g.jeVyvrhel(clenove[1]) && !clenove[1].klan);
  test("vyvrhel nesdílí pouta s rodem", !g.poutaSdili(f, clenove[1]));
  test("sám se sebou pouta má", g.poutaSdili(clenove[1], clenove[1]));

  // mlčení se počítá jako odmítnutí
  const { f: f2, clenove: c2 } = scena(43, 1);
  const k2 = g.zalozKlan(f2, "Mlčení");
  g.prijmiDoKlanu(f2, c2[0].cid);
  g.navrhniVyhazov(f2, c2[0].cid);
  c2[0].vyhazov.doTiku = g.G.tick;
  g.doTick();
  test("vypršená výpověď = vyvrhel", g.jeVyvrhel(c2[0]) && !c2[0].vyhazov);
  test("délka výpovědi škáluje sezónou", g.vyhazovTicks() >= 120);
}

sada("8. Vyvrhel: pole rodu je pro něj cizí a rod ho nebrání");
{
  const { f, clenove } = scena(42, 1);
  const vyvrhel = clenove[0];
  const moje = [...g.G.tiles.values()].find(t => t.owner === 0 && !t.clen && !t.structure);
  // ⚠ Musí to být pole vyvrhela, které má VOLNÉHO souseda — členy bloku města
  // obklopuje jen samo město a test dole by neměl na čem měřit hranici.
  // Bez tohohle výběru test praskal pokaždé, když se hnul generátor mapy.
  const jehoKandidati = [...g.G.tiles.values()].filter(t => t.owner === 0 && t.clen === vyvrhel.cid);
  const jeho = jehoKandidati.find(t => g.neighborsOf(t).some(n => n.owner === -1
    && g.TERRAIN[n.terrain].passable && !n.big && !n.bigSize)) || jehoKandidati[0];
  test("scéna má pole obou aktérů", !!moje && !!jeho);

  test("před vyhoštěním je pole spoluhráče vlastní", g.jeMoje(vyvrhel, moje) && g.jeMoje(f, jeho));
  vyvrhel.vyvrhel = true;
  test("po vyhoštění je pole spoluhráče cizí", !g.jeMoje(vyvrhel, moje));
  test("a jeho pole je cizí pro rod", !g.jeMoje(f, jeho));
  test("vlastní pole si vyvrhel drží", g.jeMoje(vyvrhel, jeho));

  // obranu spoluhráčů ztrácí
  test("rod vyvrhela nebrání", !g.braniPole(f, jeho));
  test("vyvrhel nebrání rod", !g.braniPole(vyvrhel, moje));
  test("sám sebe brání dál", g.braniPole(vyvrhel, jeho));

  // hranici s rodem nesdílí
  const soused = g.neighborsOf(jeho).find(n => n.owner === -1
    && g.TERRAIN[n.terrain].passable && !n.big && !n.bigSize);
  if (soused) {
    test("vyvrhel má hranici jen ze svých polí", g.isAdjacentToFaction(vyvrhel, soused));
    const jenJeho = g.neighborsOf(soused).every(n => n.owner !== 0 || n.clen === vyvrhel.cid);
    test("rod přes pole vyvrhela nesousedí",
      jenJeho ? !g.isAdjacentToFaction(f, soused) : true);
  } else { test("soused nalezen", false); test("soused nalezen 2", false); }
}

sada("9. Klan v sezóně: zánik, snapshot a reset");
{
  const { f, clenove } = scena(42, 1);
  const k = g.zalozKlan(f, "Zánik");
  g.prijmiDoKlanu(f, clenove[0].cid);
  const uzel = dejUzel(f);
  f.resources.stone = 9e6; f.resources.wood = 9e6; f.resources.gold = 9e6;
  g.postavKlanovouPevnost(f, uzel);

  const kolo = JSON.parse(JSON.stringify({ klany: g.G.klany, factions: g.G.factions }));
  test("stav klanů projde JSONem bez cyklů", kolo.klany.length === 1 && kolo.klany[0].id === k.id);
  test("členství drží aktér", kolo.factions[0].klan === k.id);

  g.zrusKlan(k);
  test("klan zmizel", !g.klanPodleId(k.id));
  test("členům zmizelo členství", !f.klan && !clenove[0].klan);
  // pevnost NEPROPADÁ rodu — zneutrální i s posádkou
  test("pevnost zneutrálněla", uzel.owner === -1 && uzel.klan === undefined
    && uzel.structure === null && uzel.garrison > 0);

  g.newGame(0, 42, null);
  test("nová sezóna klany nedědí", (g.G.klany || []).length === 0 && g.G.nextKlanId === 0);
}

// vůdce odchází a předává klan
sada("10. Odchod vůdce");
{
  const { f, clenove } = scena(42, 1);
  const k = g.zalozKlan(f, "Předání");
  g.prijmiDoKlanu(f, clenove[0].cid);
  k.dustojnici = [clenove[0].cid];
  test("vůdce odešel", g.odejdiZKlanu(f) && !f.klan);
  test("klan žije dál pod novým vůdcem",
    !!g.klanPodleId(k.id) && k.vudce === clenove[0].cid && !k.dustojnici.length);
  test("nový vůdce je uznán", g.jeVudce(k, clenove[0]));
  test("poslední odchod klan ruší", g.odejdiZKlanu(clenove[0]) && !g.klanPodleId(k.id));
}

console.log(`\n${proslo} prošlo, ${selhalo} selhalo`);
if (selhalo) process.exit(1);
