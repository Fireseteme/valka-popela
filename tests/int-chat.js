// CHAT PO DRÁTĚ (etapa 9, IV-E): tři hráči — dva v jednom rodu (z toho dva
// v klanu) a jeden v cizím. Ověřuje to, na čem u chatu opravdu záleží:
// klanová a soukromá zpráva se cizímu hráči vůbec NEODEŠLE, ne že by ji jen
// neuviděl v UI.
//
//     node tests/int-chat.js
//
// Běží lokálně na portu 8295 nad dočasným adresářem dat (VP_DATA). NENÍ ve
// vse.js: startuje vlastní server.
const { spawn } = require("child_process");
const WebSocket = require("../node_modules/ws");
const { zaregistrujAPotvrd } = require("./pomoc-ucty.js");
const fs = require("fs"), os = require("os"), path = require("path");
const PORT = 8295, KOREN = path.join(__dirname, "..");
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "vp-chat-"));
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

function klient(jmeno) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/`);
  const fronta = [], cekaji = [];
  const chat = [];            // co tomuhle hráči server OPRAVDU poslal
  const kronika = [];         // a co mu poslal z kroniky
  let stav = null, muj = { faction: null, member: 0 };
  ws.on("message", raw => {
    const m = JSON.parse(raw);
    if (m.state) {
      stav = m.state;
      for (const z of m.state.chat || []) if (!chat.some(x => x.id === z.id)) chat.push(z);
      for (const z of m.state.log || []) if (!kronika.some(x => x.id === z.id)) kronika.push(z);
    }
    if (m.type === "started") { muj.faction = m.yourFaction; muj.member = m.yourMember || 0; }
    const i = cekaji.findIndex(c => c.typ === m.type);
    if (i >= 0) { const c = cekaji.splice(i, 1)[0]; clearTimeout(c.cas); c.res(m); } else fronta.push(m);
  });
  return {
    ws, muj, chat, kronika, jmeno, otevreno: new Promise(r => ws.on("open", r)),
    stav: () => stav,
    klic: () => muj.faction + ":" + (muj.member || 0),
    posli: m => ws.send(JSON.stringify(m)),
    cmd: (cmd, payload = {}) => ws.send(JSON.stringify({ type: "cmd", cmd, payload })),
    ma: text => chat.some(m => m.text === text),
    async cekejNaHracu(faction, n, ms = 8000) {
      const konec = Date.now() + ms;
      while (Date.now() < konec) {
        const m = await this.cekej("lobby", 3000).catch(() => null);
        if (m && (m.players || []).filter(x => x.faction === faction).length >= n) return m;
      }
      throw new Error("v lobby není " + n + " hráčů frakce " + faction);
    },
    async cekejZpravu(text, ms = 6000) {
      const konec = Date.now() + ms;
      while (Date.now() < konec) { if (this.ma(text)) return true; await pauza(250); }
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
    console.log("=== 1. tři hráči: dva v rodu 0, jeden v rodu 4");
    const a = klient("Vudce"); await a.otevreno;
    a.posli({ type: "hello", name: "Vudce" }); await a.cekej("welcome");
    await zaregistrujAPotvrd(a, { port: PORT, dataDir: DATA, jmeno: "vudce", heslo: "heslo123" });
    a.posli({ type: "pick", faction: 0 }); await a.cekejNaHracu(0, 1);

    const b = klient("Clen"); await b.otevreno;
    b.posli({ type: "hello", name: "Clen" }); await b.cekej("welcome");
    await zaregistrujAPotvrd(b, { port: PORT, dataDir: DATA, jmeno: "clen", heslo: "heslo123" });
    b.posli({ type: "pick", faction: 0 }); await b.cekejNaHracu(0, 2);

    const c = klient("Cizi"); await c.otevreno;
    c.posli({ type: "hello", name: "Cizi" }); await c.cekej("welcome");
    await zaregistrujAPotvrd(c, { port: PORT, dataDir: DATA, jmeno: "cizi", heslo: "heslo123" });
    c.posli({ type: "pick", faction: 4 }); await c.cekejNaHracu(4, 1);

    a.posli({ type: "start" });
    await a.cekej("started"); await b.cekej("started"); await c.cekej("started");
    test("rozdělení sedí", a.klic() === "0:0" && b.klic() === "0:1" && c.muj.faction === 4);

    console.log("=== 2. světový kanál dorazí všem");
    a.cmd("chatPosli", { kanal: "svet", text: "Zdravím Vellar" });
    test("dorazilo odesílateli", await a.cekejZpravu("Zdravím Vellar"));
    test("dorazilo spoluhráči", await b.cekejZpravu("Zdravím Vellar"));
    test("dorazilo i cizímu rodu", await c.cekejZpravu("Zdravím Vellar"));

    console.log("=== 3. klanový kanál se cizímu vůbec NEODEŠLE");
    a.cmd("zalozKlan", { jmeno: "Popelní jezdci" });
    await pauza(1500);
    a.cmd("prijmiDoKlanu", { cid: 1 });
    await pauza(1500);
    a.cmd("chatPosli", { kanal: "klan", text: "Sraz u mostu" });
    test("dorazilo vůdci", await a.cekejZpravu("Sraz u mostu"));
    test("dorazilo členovi klanu", await b.cekejZpravu("Sraz u mostu"));
    await pauza(2500);
    test("cizímu rodu se NEODESLALO", !c.ma("Sraz u mostu"));

    console.log("=== 4. soukromý kanál vidí jen dvojice");
    c.cmd("chatPosli", { kanal: "soukr", text: "koupím kámen", komu: a.klic() });
    test("dorazilo odesílateli", await c.cekejZpravu("koupím kámen"));
    test("dorazilo příjemci", await a.cekejZpravu("koupím kámen"));
    await pauza(2000);
    test("třetímu se NEODESLALO", !b.ma("koupím kámen"));

    console.log("=== 5. prodleva proti zaplavení");
    a.cmd("chatPosli", { kanal: "svet", text: "raz" });
    a.cmd("chatPosli", { kanal: "svet", text: "dva" });
    a.cmd("chatPosli", { kanal: "svet", text: "tri" });
    await pauza(2500);
    const kolik = ["raz", "dva", "tri"].filter(t => a.ma(t)).length;
    test(`ze tří zpráv naráz prošla jen část (${kolik})`, kolik >= 1 && kolik < 3);

    console.log("=== 6. kronika je serverový kanál — cizí rod ji nedostane");
    // svět (factionId -1) chodí všem, kanál rodu jen svému rodu
    test("kronika vůbec chodí", a.kronika.length > 0);
    test("světové záznamy má i cizí rod", c.kronika.some(e => e.factionId === -1));
    test("cizí rod NEDOSTAL ani jeden záznam rodu 0",
      !c.kronika.some(e => e.factionId === 0));
    test("rod 0 nedostal kroniku cizího rodu",
      !a.kronika.some(e => e.factionId >= 0 && e.factionId !== 0));
    test("záznamy nesou id", a.kronika.every(e => typeof e.id === "number"));

    console.log("=== 7. po znovupřipojení dorazí viditelná historie znovu");
    const tokB = null;
    b.ws.close();
    await pauza(500);
    const b2 = klient("Clen"); await b2.otevreno;
    b2.posli({ type: "hello", name: "Clen" });
    await b2.cekej("welcome");
    b2.posli({ type: "accLogin", name: "clen", pass: "heslo123" });
    await b2.cekej("account", 8000).catch(() => null);
    await pauza(3000);
    test("historie dorazila znovu", b2.ma("Zdravím Vellar") && b2.ma("Sraz u mostu"));
    test("cizí soukromá zpráva mezi tím není", !b2.ma("koupím kámen"));
    test("a kronika taky dorazila znovu", b2.kronika.length > 0);
    b2.ws.close();

    a.ws.close(); c.ws.close();
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
  console.log(selhalo ? `\n❌ ${selhalo} selhalo` : "\n✅ int-chat prošlo");
  process.exit(selhalo ? 1 : 0);
})();
