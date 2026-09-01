// Keepy krajů (etapa 7, IV-C): jeden na kraj, blok 5×5 (na stísněných krajích
// 3×3), uprostřed sporného pásu. Nahradily rozeseté „svobodné města".
const g = require("../js/game.js");

let proslo = 0, selhalo = 0;
const test = (jmeno, ok) => {
  if (ok) proslo++;
  else { selhalo++; console.log("  ❌ " + jmeno); }
};
const sada = jmeno => console.log("\n=== " + jmeno + " ===");

sada("1. Jeden keep na kraj, žádná svobodná města");
{
  for (const seed of [42, 355, 668, 1042]) {
    g.newGame(0, seed, null);
    const T = [...g.G.tiles.values()];
    const keepy = T.filter(t => t.structure === "keep");
    const kraje = new Set(keepy.map(t => g.regionOf(t)));
    test(`seed ${seed}: devět keepů v devíti krajích`,
      keepy.length === 9 && kraje.size === 9);
    test(`seed ${seed}: žádné svobodné město`, !T.some(t => t.structure === "city"));
  }
}

sada("2. Keep je blok a stojí ve sporném pásu");
{
  g.newGame(0, 42, null);
  const keepy = [...g.G.tiles.values()].filter(t => t.structure === "keep");
  test("každý keep je blok 5×5 nebo 3×3",
    keepy.every(t => (t.bigSize === 5 && t.bigKeys.length === 24)
      || (t.bigSize === 3 && t.bigKeys.length === 8)));
  test("členové bloku ukazují na kotvu",
    keepy.every(t => t.bigKeys.every(k => g.G.tiles.get(k).big === g.keyOf(t.q, t.r))));
  // ⚠ V KOLÉBCE keep být NESMÍ — do cizí kolébky se od etapy 7 nedá vstoupit,
  // takže by ho nikdo nikdy nedobyl a „kdo drží keep, drží kraj" by bylo prázdné
  test("žádný keep neleží v kolébce",
    keepy.every(t => !g.zonaOf(t).startsWith("kolebka-")));
  test("keepy leží v expanzi nebo v mezikruží",
    keepy.every(t => g.zonaOf(t).startsWith("expanze-") || g.zonaOf(t) === "mezikruzi"));
  test("neutrální keep má plnou posádku",
    keepy.every(t => t.owner === -1 && t.garrison === g.STRUCTURES.keep.militia));
}

sada("3. Keep je objektiv T3 a nese kraj");
{
  g.newGame(0, 42, null);
  const keep = [...g.G.tiles.values()].find(t => t.structure === "keep");
  test("keep je T3 (legendární výbava neutrála)", g.neutralTier(keep) === 2);
  test("jmenovka síly 500 jako velká pevnost", g.tileStrengthLabel(keep) === 500);
  test("neutrální keep = kraj nikdo nedrží", g.regionHolderId(keep) === -1);
  g.setTileOwner(keep, 3);
  test("kdo drží keep, drží kraj", g.regionHolderId(keep) === 3);
  // grandfort zůstává ZÁLOHOU pro kraje, kde se keep nepovedl
  const gf = [...g.G.tiles.values()].find(t => t.structure === "grandfort"
    && g.regionOf(t) !== g.regionOf(keep));
  if (gf) {
    g.setTileOwner(gf, 5);
    const krajGf = g.regionOf(gf);
    const keepKraje = [...g.G.tiles.values()].find(t => t.structure === "keep"
      && g.regionOf(t) === krajGf);
    test("kraj s keepem se řídí keepem, ne grandfortem",
      !keepKraje || g.regionHolderId(gf) === keepKraje.owner);
  }
}

sada("4. Cena keepu ve skóre");
{
  // tileYield není v exportech (výnos se čte přes incomeOf), takže se testuje
  // to, co ven vidět je: keep má být cennější než město i velká pevnost
  test("skóre keepu je nad městem i velkou pevností",
    g.STRUCTURES.keep.score > g.STRUCTURES.city.score
    && g.STRUCTURES.keep.score > g.STRUCTURES.grandfort.score);
  test("ale pod Trůnem", g.STRUCTURES.keep.score < g.STRUCTURES.throne.score);
}

sada("5. Keep se dobývá s oknem zranění, ne na jeden zátah");
{
  g.setSeasonHours(1);
  g.newGame(0, 42, null);
  const keep = [...g.G.tiles.values()].find(t => t.structure === "keep");
  const plna = keep.garrison;
  test("posádka keepu je násobek velké pevnosti",
    plna >= 2 * g.STRUCTURES.grandfort.militia);
  // vymaxovaný hrdina veze ~5 200 CP — keep tedy nejde vzít jedním zátahem
  test("posádka přesahuje strop velení jednoho hrdiny", plna > 5200);
  test("okno zranění keepu je hodinové", g.zranDelka(keep) === g.ZRAN_TICKS_CIL);
}

console.log(`\n${proslo} prošlo, ${selhalo} selhalo`);
if (selhalo) process.exit(1);
