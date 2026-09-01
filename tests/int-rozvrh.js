// Integrace rozvrhu sezón (etapa 5b) na SKUTEČNÉM serveru: přihlásit se
// k sezóně, nechat nastat termín a ověřit, že se sezóna rozjela i pro hráče,
// který u toho NEBYL online — a že ho pak přihlášení k účtu posadí ke svému
// městu. Běží lokálně na portu 8297 nad dočasným adresářem dat (VP_DATA),
// takže na nic ostrého nesahá.
//
//     node tests/int-rozvrh.js
//
// NENÍ ve vse.js: startuje vlastní server a trvá přes 20 s (čeká na kontrolu
// termínu). Pouštět po zásahu do rozvrhu, startu sezóny nebo účastníků.
const { spawn } = require("child_process");
const WebSocket = require("../node_modules/ws");
const { zaregistrujAPotvrd } = require("./pomoc-ucty.js");
const game = require("../js/game.js");
const fs = require("fs"), os = require("os"), path = require("path");
const PORT = 8297, KOREN = require("path").join(__dirname, "..");
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "vp-rozvrh-int-"));
let selhalo = 0;
const test = (j, ok) => { console.log((ok ? "  ✅ " : "  ❌ ") + j); if (!ok) selhalo++; };
const pauza = ms => new Promise(r => setTimeout(r, ms));

function spustServer() {
  return new Promise((res, rej) => {
    // malý svět: test nemá co dělat na pevných 955×955
    const p = spawn(process.execPath, ["server/server.js", String(PORT), "1", "34"],
      { cwd: KOREN, env: { ...process.env, VP_DATA: DATA } });
    let log = "";
    p.stdout.on("data", d => { log += d; if (log.includes("ukončení: Ctrl+C")) res({ p, log: () => log }); });
    p.stderr.on("data", d => { log += d; });
    setTimeout(() => rej(new Error("server nenaběhl:\n" + log)), 25000);
  });
}
const zabij = p => new Promise(r => { p.on("exit", () => r()); p.kill(); });
function klient() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/`);
  const fronta = [], cekaji = [];
  ws.on("message", raw => { const m = JSON.parse(raw);
    const i = cekaji.findIndex(c => c.typ === m.type);
    if (i >= 0) { const c = cekaji.splice(i,1)[0]; clearTimeout(c.cas); c.res(m); } else fronta.push(m); });
  return { ws, otevreno: new Promise(r => ws.on("open", r)), posli: m => ws.send(JSON.stringify(m)),
    cekej(typ, ms = 12000) {
      const i = fronta.findIndex(m => m.type === typ);
      if (i >= 0) return Promise.resolve(fronta.splice(i,1)[0]);
      return new Promise((res, rej) => { const cas = setTimeout(() => rej(new Error("nedorazilo: "+typ)), ms); cekaji.push({typ,res,cas}); });
    },
    // POZOR: lobby chodí i samo od sebe (připojení jiného hráče), takže první
    // ve frontě bývá starší než odpověď na právě poslaný příkaz. Tohle vezme
    // tu NEJNOVĚJŠÍ — jinak test tvrdí, že se přihláška neprojevila.
    async posledni(typ, ms = 1200) {
      await pauza(ms);
      let m = null, x;
      while (true) { const i = fronta.findIndex(z => z.type === typ); if (i < 0) break; x = fronta.splice(i,1)[0]; m = x; }
      return m;
    } };
}

(async () => {
  console.log("=== 1. server naplánuje první sezónu sám");
  let { p: server, log } = await spustServer();
  const rozvrhSoubor = path.join(DATA, "rozvrh.json");
  test("rozvrh vznikl", fs.existsSync(rozvrhSoubor));
  let r = JSON.parse(fs.readFileSync(rozvrhSoubor, "utf8"));
  console.log("     strop na frakci podle mapy:", r.mistNaFrakci);
  // strop se ODVOZUJE Z MAPY, na které server běží (dřív to byla natvrdo 4).
  // Test pouští malý svět 69×69, takže se čeká jeho kapacita — od 1. 9. 2026
  // má ostrý server pevných 955×955, tedy 1 254 na rod.
  test("strop odpovídá kapacitě mapy, na které server běží",
    r.mistNaFrakci === game.hracuNaFrakci(34));
  test("zápisy jsou otevřené", r.faze === "zapisy");

  console.log("=== 2. dva hráči se přihlásí, pak jeden odejde offline");
  const a = klient(); await a.otevreno;
  a.posli({ type: "hello", name: "Vít" });
  await a.cekej("welcome");
  await zaregistrujAPotvrd(a, { port: PORT, dataDir: DATA, jmeno: "vit", heslo: "heslo123" });
  a.posli({ type: "prihlas", faction: 0 });
  let lob = await a.posledni("lobby");
  test("přihláška je vidět v lobby", lob.rozvrh && lob.rozvrh.mojeFrakce === 0);
  test("obsazenost frakce se zvedla", lob.rozvrh.obsazenost["0"] === 1);

  const b = klient(); await b.otevreno;
  b.posli({ type: "hello", name: "Kamos" });
  await b.cekej("welcome");
  await zaregistrujAPotvrd(b, { port: PORT, dataDir: DATA, jmeno: "kamos", heslo: "heslo123" });
  b.posli({ type: "prihlas", faction: 3 });
  lob = await b.posledni("lobby");
  test("přihlášení dva", lob.rozvrh.prihlasenych === 2);
  await pauza(6000);                  // ať se účty stihnou vyklopit na disk (flush po 5 s)
  b.ws.close();                       // druhý hráč jde offline a u startu NEBUDE
  a.ws.close();

  console.log("=== 3. nastane termín (posunu ho do minulosti a restartuju)");
  await zabij(server);
  r = JSON.parse(fs.readFileSync(rozvrhSoubor, "utf8"));
  r.startAt = Date.now() - 1000;
  fs.writeFileSync(rozvrhSoubor, JSON.stringify(r));
  ({ p: server, log } = await spustServer());
  await pauza(1000);
  // kontrola termínu běží každých 15 s
  const c = klient(); await c.otevreno;
  c.posli({ type: "hello", name: "divák" });
  await c.cekej("welcome");
  await pauza(18000);
  const hlaska = log();
  test("server sám spustil sezónu v termínu", /nastal termín sezóny/.test(hlaska));
  test("startoval s oběma přihlášenými, i s tím offline", /startuji s 2 přihlášenými/.test(hlaska));
  c.ws.close();

  console.log("=== 4. offline hráč se vrátí a najde své město");
  const d = klient(); await d.otevreno;
  d.posli({ type: "hello", name: "Kamos" });
  await d.cekej("welcome");
  d.posli({ type: "accLogin", name: "kamos", pass: "heslo123" });
  await d.cekej("account");
  const zpet = await d.cekej("started", 15000);
  test("dostal svět své frakce", zpet.yourFaction === 3 && !!zpet.state);
  console.log("     frakce:", zpet.yourFaction, "· aktér:", zpet.yourMember);
  d.ws.close();

  await zabij(server);
  fs.rmSync(DATA, { recursive: true, force: true });
  console.log(selhalo ? `\n❌ ${selhalo} selhalo` : "\n✅ rozvrh sezón funguje na skutečném serveru");
  process.exit(selhalo ? 1 : 0);
})().catch(e => { console.error("CHYBA:", e.message); process.exit(1); });
