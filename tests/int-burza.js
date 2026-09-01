// KLANOVÁ BURZA PO DRÁTĚ (etapa 9): dva hráči v jednom klanu si vymění
// suroviny. Úschovu a stavový automat pokrývá tests/test-burza.js — tady jde
// o CESTU: klient → zprávy serveru → databáze → zpátky do profilu.
//
//     node tests/int-burza.js
//
// Běží lokálně na portu 8293 nad dočasným adresářem dat (VP_DATA). NENÍ ve
// vse.js: startuje vlastní server.
//
// Surovinová přihrádka je zvolená schválně — suroviny má každý aktér od startu,
// takže se nemusí nic podstrkávat do databáze účtů.
const { spawn } = require("child_process");
const WebSocket = require("../node_modules/ws");
const { zaregistrujAPotvrd } = require("./pomoc-ucty.js");
const fs = require("fs"), os = require("os"), path = require("path");
const PORT = 8288, KOREN = path.join(__dirname, "..");
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "vp-burza-int-"));
let selhalo = 0;
const test = (j, ok) => { console.log((ok ? "  ✅ " : "  ❌ ") + j); if (!ok) selhalo++; };
const pauza = ms => new Promise(r => setTimeout(r, ms));
let logServeru = "";

function spustServer() {
  return new Promise((res, rej) => {
    // malý svět: test nemá co dělat na pevných 955×955
    const p = spawn(process.execPath, ["server/server.js", String(PORT), "1", "34"],
      { cwd: KOREN, env: { ...process.env, VP_DATA: DATA } });
    let log = "";
    p.stdout.on("data", d => { log += d; logServeru += d; if (log.includes("ukončení: Ctrl+C")) res(p); });
    p.stderr.on("data", d => { log += d; logServeru += d; });
    setTimeout(() => rej(new Error("server nenaběhl:\n" + log)), 25000);
  });
}
const zabij = p => new Promise(r => { p.on("exit", () => r()); p.kill(); });

function klient() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/`);
  const fronta = [], cekaji = [];
  let stav = null, muj = { faction: null, member: 0 }, burza = [], profil = null, chyba = null;
  ws.on("message", raw => {
    const m = JSON.parse(raw);
    if (m.state) stav = m.state;
    if (m.type === "started") { muj.faction = m.yourFaction; muj.member = m.yourMember || 0; }
    if (m.type === "burzaStav") { burza = m.nabidky || []; profil = m; }
    if (m.type === "burzaChyba") chyba = m.text;
    if (m.type === "account") profil = m;
    const i = cekaji.findIndex(c => c.typ === m.type);
    if (i >= 0) { const c = cekaji.splice(i, 1)[0]; clearTimeout(c.cas); c.res(m); } else fronta.push(m);
  });
  return {
    ws, muj, otevreno: new Promise(r => ws.on("open", r)),
    nabidky: () => burza, profil: () => profil, chyba: () => chyba,
    zdroje() {
      const f = stav && stav.factions && stav.factions[muj.faction];
      if (!f) return null;
      return (muj.member ? (f.clenove || [])[muj.member - 1] : f).resources;
    },
    posli: m => ws.send(JSON.stringify(m)),
    cmd: (cmd, payload = {}) => ws.send(JSON.stringify({ type: "cmd", cmd, payload })),
    async cekejNaHracu(n, ms = 8000) {
      const konec = Date.now() + ms;
      while (Date.now() < konec) {
        const m = await this.cekej("lobby", 3000).catch(() => null);
        if (m && (m.players || []).filter(x => x.faction === 0).length >= n) return m;
      }
      throw new Error("v lobby není " + n + " hráčů frakce 0");
    },
    async az(podminka, popis, ms = 6000) {
      const konec = Date.now() + ms;
      while (Date.now() < konec) { if (podminka()) return true; await pauza(200); }
      console.log("     (nedočkal se: " + popis + ")");
      return false;
    },
    cekej(typ, ms = 15000) {
      const i = fronta.findIndex(m => m.type === typ);
      if (i >= 0) return Promise.resolve(fronta.splice(i, 1)[0]);
      return new Promise((res, rej) => {
        const cas = setTimeout(() => rej(new Error("nedorazilo: " + typ)), ms);
        cekaji.push({ typ, res, cas });
      });
    },
  };
}

(async () => {
  const server = await spustServer();
  try {
    console.log("=== 1. dva hráči v jednom rodu a klanu");
    const a = klient(); await a.otevreno;
    a.posli({ type: "hello", name: "Prodavajici" }); await a.cekej("welcome");
    await zaregistrujAPotvrd(a, { port: PORT, dataDir: DATA, jmeno: "prodavajici", heslo: "heslo123" });
    a.posli({ type: "pick", faction: 0 }); await a.cekejNaHracu(1);

    const b = klient(); await b.otevreno;
    b.posli({ type: "hello", name: "Kupujici" }); await b.cekej("welcome");
    await zaregistrujAPotvrd(b, { port: PORT, dataDir: DATA, jmeno: "kupujici", heslo: "heslo123" });
    b.posli({ type: "pick", faction: 0 }); await b.cekejNaHracu(2);

    a.posli({ type: "start" });
    await a.cekej("started"); await b.cekej("started");
    a.cmd("zalozKlan", { jmeno: "Kupci popela" });
    await pauza(1500);
    a.cmd("prijmiDoKlanu", { cid: 1 });
    await pauza(1500);
    test("oba jsou v klanu", !!a.zdroje() && !!b.zdroje());

    console.log("=== 2. bez klanu se nabídka nevystaví (kontrola na serveru)");
    const c = klient(); await c.otevreno;
    c.posli({ type: "hello", name: "Cizi" }); await c.cekej("welcome");
    await zaregistrujAPotvrd(c, { port: PORT, dataDir: DATA, jmeno: "cizi", heslo: "heslo123" });
    c.posli({ type: "burzaVystav", prihradka: "suroviny", dava: { stone: 10 }, chce: { wood: 10 } });
    await pauza(1200);
    test("hráč mimo sezónu dostane chybu", !!c.chyba());
    c.ws.close();

    console.log("=== 3. vystavení strhne úschovu");
    const predA = { ...a.zdroje() };
    a.posli({ type: "burzaVystav", prihradka: "suroviny", dava: { stone: 50 }, chce: { wood: 50 } });
    test("nabídka dorazila zpátky", await a.az(() => a.nabidky().length === 1, "nabídka"));
    const n = a.nabidky()[0];
    test("nabídka má správný tvar",
      n && n.prihradka === "suroviny" && n.stav === "vystavena" && n.dava.stone === 50);
    test("kámen je v úschově", await a.az(() => a.zdroje().stone <= predA.stone - 50, "kámen"));
    test("půlka poplatku ve zlatě je pryč",
      a.zdroje().gold <= predA.gold - 8 && a.zdroje().gold >= predA.gold - 8 - 2);

    console.log("=== 4. nabídku vidí klan a jde přijmout");
    b.posli({ type: "burzaSeznam" });
    test("kupující nabídku vidí", await b.az(() => b.nabidky().some(x => x.id === n.id), "seznam"));
    const predB = { ...b.zdroje() };
    b.posli({ type: "burzaPrijmi", id: n.id, dava: { wood: 50 } });
    test("kupující dostal kámen", await b.az(() => b.zdroje().stone >= predB.stone + 50, "kámen"));
    test("a zaplatil dřevem", b.zdroje().wood <= predB.wood - 50);
    test("prodávající dostal dřevo",
      await a.az(() => a.zdroje().wood >= predA.wood + 50 - 1, "dřevo"));
    test("nabídka ze seznamu zmizela", await b.az(() => !b.nabidky().some(x => x.id === n.id), "zmizení"));

    console.log("=== 5. přijatou nabídku už nikdo nevezme");
    b.posli({ type: "burzaPrijmi", id: n.id, dava: { wood: 50 } });
    await pauza(1200);
    test("druhé přijetí hlásí chybu", !!b.chyba());

    console.log("=== 6. profil hlásí zablokovaná jádra");
    a.posli({ type: "burzaSeznam" });
    await pauza(800);
    test("profil nese pole jadraVNabidkach",
      a.profil() && typeof a.profil().jadraVNabidkach === "number");

    a.ws.close(); b.ws.close();
  } catch (e) {
    console.log("❌ VÝJIMKA: " + e.message);
    selhalo++;
  } finally {
    await zabij(server);
    fs.rmSync(DATA, { recursive: true, force: true });
  }
  if (logServeru.match(/Error|TypeError|undefined is not/)) {
    console.log("⚠ v logu serveru je chyba:\n" + logServeru.split("\n")
      .filter(r => /Error|TypeError/.test(r)).slice(0, 5).join("\n"));
    selhalo++;
  }
  console.log(selhalo ? `\n❌ ${selhalo} selhalo` : "\n✅ int-burza prošlo");
  process.exit(selhalo ? 1 : 0);
})();
