// CHAT (etapa 9, IV-E): tři kanály — svět, klan, soukromý. Klíčové je, že
// server rozesílá JEN to, co aktér smí vidět, a jen to, co ještě nedostal.
const g = require(__dirname + "/../js/game.js");

let proslo = 0, selhalo = 0;
const test = (jmeno, ok) => {
  if (ok) proslo++;
  else { selhalo++; console.log("  ❌ " + jmeno); }
};
const sada = jmeno => console.log("\n=== " + jmeno + " ===");

// scéna: frakce 0 se dvěma členy + frakce 1 (cizí rod)
function scena() {
  g.setSeasonHours(1);
  g.newGame(0, 42, null);
  const f0 = g.G.factions[0], f1 = g.G.factions[1];
  const a = g.pridejClena(0, "Alfa"), b = g.pridejClena(0, "Beta");
  return { f0, f1, a, b };
}
// prodleva mezi zprávami je 2 tiky — testy si musí „počkat"
const posli = (kdo, kanal, text, komu) => {
  kdo.chatDo = 0;
  return g.chatPosli(kdo, kanal, text, komu);
};

sada("1. Světový kanál vidí všichni");
{
  const { f0, f1, a } = scena();
  const id = posli(f0, "svet", "Zdravím Vellar");
  test("zpráva vznikla", id === 1 && g.G.chat.length === 1);
  const m = g.G.chat[0];
  test("nese odesílatele i rod", m.od === g.aktorKlic(f0) && m.odRod === f0.key && m.odJmeno);
  test("vidí ji vlastní rod", g.chatViditelna(f0, m) && g.chatViditelna(a, m));
  test("vidí ji i cizí rod", g.chatViditelna(f1, m));
}

sada("2. Klanový kanál je jen pro klan");
{
  const { f0, f1, a, b } = scena();
  const k = g.zalozKlan(f0, "Popelní jezdci");
  g.prijmiDoKlanu(f0, a.cid);
  test("bez klanu se do klanu nepíše", posli(b, "klan", "pustíte mě?") === 0);
  const id = posli(f0, "klan", "Sraz u mostu");
  test("člen klanu odeslal", id > 0);
  const m = g.G.chat.find(x => x.id === id);
  test("zpráva nese id klanu", m.klan === k.id);
  test("vidí ji člen klanu", g.chatViditelna(a, m));
  test("nevidí ji spoluhráč mimo klan", !g.chatViditelna(b, m));
  test("nevidí ji cizí rod", !g.chatViditelna(f1, m));
  // klan cizího rodu se stejným ID neexistuje, ale kdyby ano, klíč je id klanu
  b.klan = k.id + 99;
  test("cizí klan ji taky nevidí", !g.chatViditelna(b, m));
}

sada("3. Soukromý kanál vidí jen dvojice");
{
  const { f0, f1, a, b } = scena();
  const komu = g.aktorKlic(a);
  test("bez příjemce to neprojde", posli(f0, "soukr", "ahoj") === 0);
  test("sám sobě se nepíše", posli(f0, "soukr", "ahoj", g.aktorKlic(f0)) === 0);
  test("neexistujícímu příjemci ne", posli(f0, "soukr", "ahoj", "0:99") === 0);
  const id = posli(f0, "soukr", "koupím kámen", komu);
  test("soukromá zpráva odešla", id > 0);
  const m = g.G.chat.find(x => x.id === id);
  test("vidí ji odesílatel", g.chatViditelna(f0, m));
  test("vidí ji příjemce", g.chatViditelna(a, m));
  test("nevidí ji nikdo třetí", !g.chatViditelna(b, m) && !g.chatViditelna(f1, m));
  // napříč rody funguje taky (domlouvání obchodu)
  test("napříč rody to jde", posli(f1, "soukr", "nabídka", g.aktorKlic(f0)) > 0);
}

sada("4. Odmítání: prázdno, cizí kanál, délka a bílé znaky");
{
  const { f0 } = scena();
  test("prázdná zpráva ne", posli(f0, "svet", "   ") === 0);
  test("neznámý kanál ne", posli(f0, "vsem", "hej") === 0);
  test("bez aktéra ne", g.chatPosli(null, "svet", "hej") === 0);
  posli(f0, "svet", "  dva   mezery\n a odřádkování ");
  const m = g.G.chat[g.G.chat.length - 1];
  test("bílé znaky se srovnaly", m.text === "dva mezery a odřádkování");
  posli(f0, "svet", "x".repeat(g.CHAT_MAX_ZNAKU + 50));
  test("délka se ořízne", g.G.chat[g.G.chat.length - 1].text.length === g.CHAT_MAX_ZNAKU);
}

sada("5. Prodleva proti zaplavení");
{
  const { f0 } = scena();
  test("první projde", g.chatPosli(f0, "svet", "raz") > 0);
  test("druhá hned ne", g.chatPosli(f0, "svet", "dva") === 0);
  for (let i = 0; i < g.chatPauzaTicks(); i++) g.doTick();
  test("po prodlevě zas ano", g.chatPosli(f0, "svet", "tři") > 0);
  // prodleva visí na AKTÉROVI, ne na spojení — druhá záložka ji neobejde
  test("prodleva je na aktérovi", typeof f0.chatDo === "number" && f0.chatDo > g.G.tick);
}

sada("6. Přírůstkové doručení a strop paměti");
{
  const { f0, a } = scena();
  const id1 = posli(f0, "svet", "první");
  const id2 = posli(f0, "svet", "druhá");
  test("od nuly dostane obojí", g.chatProAktera(a, 0).length === 2);
  test("od id1 dostane jen druhou", g.chatProAktera(a, id1).map(m => m.id).join() === String(id2));
  test("od id2 nedostane nic", g.chatProAktera(a, id2).length === 0);
  // klanovou zprávu v přírůstku nedostane, když v klanu není
  g.zalozKlan(f0, "Tajný");
  posli(f0, "klan", "tajné");
  test("cizí klanová zpráva se nedoručí", g.chatProAktera(a, id2).length === 0);

  for (let i = 0; i < g.CHAT_MAX + 20; i++) posli(f0, "svet", "z" + i);
  test(`strop paměti drží (${g.G.chat.length})`, g.G.chat.length === g.CHAT_MAX);
  test("nejstarší vypadly, nejnovější zůstala",
    g.G.chat[g.G.chat.length - 1].text === "z" + (g.CHAT_MAX + 19));
}

sada("7. Chat žije v sezóně");
{
  const { f0 } = scena();
  posli(f0, "svet", "ahoj");
  const kolo = JSON.parse(JSON.stringify(g.G.chat));
  test("projde JSONem", kolo.length === 1 && kolo[0].text === "ahoj");
  g.newGame(0, 42, null);
  test("nová sezóna chat nedědí", (g.G.chat || []).length === 0 && g.G.nextChatId === 0);
}

sada("8. Kronika je serverový kanál");
{
  const { f0, f1, a, b } = scena();
  g.G.log = []; g.G.nextLogId = 0;
  const svet = g.addLog(-1, "Trůn padl");
  const rod = g.addLog(0, "Rod staví výspu");
  const osobni = g.addLog(0, "Tvůj hrdina dorazil", null, a.cid);
  const cizi = g.addLog(1, "Cizí rod verbuje");
  test("záznamy mají rostoucí id", svet === 1 && rod === 2 && osobni === 3 && cizi === 4);

  const zaznam = id => g.G.log.find(e => e.id === id);
  test("svět vidí všichni",
    [f0, f1, a, b].every(x => g.logViditelny(x, zaznam(svet))));
  test("kanál rodu vidí celý rod", g.logViditelny(f0, zaznam(rod)) && g.logViditelny(a, zaznam(rod)));
  test("kanál rodu NEvidí cizí rod", !g.logViditelny(f1, zaznam(rod)));
  test("osobní záznam vidí jen svůj aktér",
    g.logViditelny(a, zaznam(osobni)) && !g.logViditelny(b, zaznam(osobni))
    && !g.logViditelny(f0, zaznam(osobni)));
  test("cizí rod si svou kroniku nechá pro sebe",
    g.logViditelny(f1, zaznam(cizi)) && !g.logViditelny(f0, zaznam(cizi)));

  // přírůstkové doručení
  test("zakladatel dostane svět a kanál rodu", g.logProAktera(f0, 0).length === 2);
  test("aktér a dostane i svůj osobní", g.logProAktera(a, 0).length === 3);
  test("od posledního id nedostane nic", g.logProAktera(a, 4).length === 0);
  test("cizí rod dostane jen svět a své", g.logProAktera(f1, 0).map(e => e.id).join() === "1,4");

  // strop paměti
  for (let i = 0; i < g.LOG_MAX + 10; i++) g.addLog(-1, "z" + i);
  test("strop kroniky drží (" + g.G.log.length + ")", g.G.log.length === g.LOG_MAX);
}

console.log(`\n${proslo} prošlo, ${selhalo} selhalo`);
if (selhalo) process.exit(1);
