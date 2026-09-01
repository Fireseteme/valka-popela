// KLANY PO DRÁTĚ (etapa 8): dva hráči v JEDNÉ frakci — zakladatel a člen.
// Ověřuje, že klan projde celým řetězem klient → CMDS → snapshot → klient:
// založení, přijetí, povýšení, výpověď a odmítnutí (vyvrhel).
//
//     node tests/int-klany.js
//
// Běží lokálně na portu 8296 nad dočasným adresářem dat (VP_DATA). NENÍ ve
// vse.js: startuje vlastní server.
//
// ⚠ KLANOVOU PEVNOST tenhle test nestaví — vyžadovala by dobytý uzel 2×2,
// tedy desítky tiků pochodu a bitvu s nejistým výsledkem. Pevnost, dosah,
// kapacitu i zneutrálnění po zániku klanu pokrývá tests/test-klany.js.
const { spawn } = require("child_process");
const WebSocket = require("../node_modules/ws");
const { zaregistrujAPotvrd } = require("./pomoc-ucty.js");
const fs = require("fs"), os = require("os"), path = require("path");
const PORT = 8296, KOREN = path.join(__dirname, "..");
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "vp-klany-"));
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
  let stav = null, muj = { faction: null, member: 0 };
  ws.on("message", raw => {
    const m = JSON.parse(raw);
    if (m.state) stav = m.state;
    if (m.type === "started") { muj.faction = m.yourFaction; muj.member = m.yourMember || 0; }
    const i = cekaji.findIndex(c => c.typ === m.type);
    if (i >= 0) { const c = cekaji.splice(i, 1)[0]; clearTimeout(c.cas); c.res(m); } else fronta.push(m);
  });
  return {
    ws, muj, otevreno: new Promise(r => ws.on("open", r)),
    stav: () => stav,
    posli: m => ws.send(JSON.stringify(m)),
    cmd: (cmd, payload = {}) => ws.send(JSON.stringify({ type: "cmd", cmd, payload })),
    // aktér tohoto hráče ve snapshotu (zakladatel = frakce sama, člen = clenove[cid-1])
    ja() {
      const f = stav && stav.factions && stav.factions[muj.faction];
      if (!f) return null;
      return muj.member ? (f.clenove || [])[muj.member - 1] : f;
    },
    klany: () => (stav && stav.klany) || [],
    // POZOR: lobby chodí i samo od sebe — čekat se musí na zprávu, která
    // požadovaný stav UŽ OBSAHUJE (vzor int-reporty.js)
    async cekejNaHracu(n, ms = 8000) {
      const konec = Date.now() + ms;
      while (Date.now() < konec) {
        const m = await this.cekej("lobby", 3000).catch(() => null);
        if (m && (m.players || []).filter(x => x.faction === 0).length >= n) return m;
      }
      throw new Error("v lobby není " + n + " hráčů frakce 0");
    },
    // počká, až snapshot splní podmínku (příkazy jsou optimistické, odpověď
    // přijde až s dalším stavem)
    async cekejStav(podminka, popis, ms = 6000) {
      const konec = Date.now() + ms;
      while (Date.now() < konec) {
        if (stav && podminka()) return true;
        await pauza(250);
      }
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
    console.log("=== 1. dva hráči v jedné frakci");
    const a = klient(); await a.otevreno;
    a.posli({ type: "hello", name: "Vudce" });
    await a.cekej("welcome");
    await zaregistrujAPotvrd(a, { port: PORT, dataDir: DATA, jmeno: "vudce", heslo: "heslo123" });
    a.posli({ type: "pick", faction: 0 });
    await a.cekejNaHracu(1);

    const b = klient(); await b.otevreno;
    b.posli({ type: "hello", name: "Clen" });
    await b.cekej("welcome");
    await zaregistrujAPotvrd(b, { port: PORT, dataDir: DATA, jmeno: "clen", heslo: "heslo123" });
    b.posli({ type: "pick", faction: 0 });
    await b.cekejNaHracu(2);

    a.posli({ type: "start" });
    await a.cekej("started");
    await b.cekej("started");
    test("oba jsou ve frakci 0", a.muj.faction === 0 && b.muj.faction === 0);
    test("druhý hráč je ČLEN (cid 1)", a.muj.member === 0 && b.muj.member === 1);

    console.log("=== 2. založení klanu projde snapshotem");
    a.cmd("zalozKlan", { jmeno: "Popelní jezdci" });
    test("klan dorazil oběma klientům",
      await a.cekejStav(() => a.klany().length === 1, "klan u zakladatele")
      && await b.cekejStav(() => b.klany().length === 1, "klan u člena"));
    const k = a.klany()[0];
    test("klan má správná pole", !!k && k.fid === 0 && k.level === 1 && k.jmeno === "Popelní jezdci");
    test("členství visí na AKTÉROVI", a.ja() && a.ja().klan === k.id);
    test("vůdcem je zakladatel", k.vudce === 0);
    test("člen zatím v klanu není", b.ja() && !b.ja().klan);

    console.log("=== 3. důstojník přijímá, cizí ne");
    b.cmd("prijmiDoKlanu", { cid: 0 });     // člen není důstojník — nesmí projít
    await pauza(1200);
    test("nečlen nikoho nepřijme", a.ja().klan === k.id && !b.ja().klan);
    a.cmd("prijmiDoKlanu", { cid: 1 });
    test("člen je v klanu", await b.cekejStav(() => b.ja() && b.ja().klan === k.id, "členství"));

    console.log("=== 4. povýšení na důstojníka podle slotů");
    a.cmd("povysDustojnika", { cid: 1 });
    await pauza(1200);
    // dvoučlenný klan nemá důstojnický slot (jeden na 20 členů) — povýšení
    // se smí ODMÍTNOUT, ale nesmí spadnout server
    test("malý klan důstojníka nedostane", (a.klany()[0].dustojnici || []).length === 0);

    console.log("=== 5. výpověď a odmítnutí = vyvrhel");
    a.cmd("navrhniVyhazov", { cid: 1 });
    test("výpověď dorazila členovi",
      await b.cekejStav(() => b.ja() && !!b.ja().vyhazov, "výpověď"));
    test("výpověď má odpočet", b.ja().vyhazov.doTiku > 0 && b.ja().vyhazov.klan === k.id);
    b.cmd("odmitniVyhazov");
    test("odmítnutí udělalo vyvrhela",
      await b.cekejStav(() => b.ja() && b.ja().vyvrhel === true, "vyvrhel"));
    test("vyvrhel už v klanu není", !b.ja().klan);
    test("stav vyvrhela vidí i druhý hráč",
      await a.cekejStav(() => {
        const cl = (a.stav().factions[0].clenove || [])[0];
        return cl && cl.vyvrhel === true;
      }, "vyvrhel u zakladatele"));

    console.log("=== 6. opuštění klanu bez důstojníka klan ruší");
    a.cmd("odejdiZKlanu");
    test("klan zanikl", await a.cekejStav(() => a.klany().length === 0, "zánik klanu"));
    test("zakladateli zmizelo členství", !a.ja().klan);

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
  console.log(selhalo ? `\n❌ ${selhalo} selhalo` : "\n✅ int-klany prošlo");
  process.exit(selhalo ? 1 : 0);
})();
