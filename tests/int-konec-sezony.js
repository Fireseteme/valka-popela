// Regrese: po RUČNÍM ukončení sezóny se musí zase otevřít zápisy. Bez toho
// zůstal rozvrh viset ve fázi „bezi" a do další sezóny se nešlo přihlásit.
const { spawn } = require("child_process");
const WebSocket = require("../node_modules/ws");
const { zaregistrujAPotvrd } = require("./pomoc-ucty.js");
const fs = require("fs"), os = require("os"), path = require("path");
const PORT = 8295, KOREN = path.join(__dirname, "..");
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "vp-konec-"));
let selhalo = 0;
const test = (j, ok) => { console.log((ok ? "  ✅ " : "  ❌ ") + j); if (!ok) selhalo++; };
const pauza = ms => new Promise(r => setTimeout(r, ms));

function spustServer() {
  return new Promise((res, rej) => {
    // malý svět: test nemá co dělat na pevných 955×955
    const p = spawn(process.execPath, ["server/server.js", String(PORT), "1", "34"],
      { cwd: KOREN, env: { ...process.env, VP_DATA: DATA } });
    let log = "";
    p.stdout.on("data", d => { log += d; if (log.includes("ukončení: Ctrl+C")) res(p); });
    p.stderr.on("data", d => { log += d; });
    setTimeout(() => rej(new Error("server nenaběhl:\n" + log)), 25000);
  });
}
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
    async posledni(typ, ms = 900) {
      await pauza(ms);
      let m = null;
      while (true) { const i = fronta.findIndex(z => z.type === typ); if (i < 0) break; m = fronta.splice(i,1)[0]; }
      return m;
    } };
}

(async () => {
  const server = await spustServer();
  const a = klient(); await a.otevreno;
  a.posli({ type: "hello", name: "Vít" });
  await a.cekej("welcome");
  await zaregistrujAPotvrd(a, { port: PORT, dataDir: DATA, jmeno: "vit", heslo: "heslo123" });
  let lob = await a.posledni("lobby");
  const cisloPred = lob.rozvrh.cislo;
  test("na začátku jsou zápisy otevřené", lob.rozvrh.faze === "zapisy");

  a.posli({ type: "pick", faction: 0 });
  await a.posledni("lobby");
  a.posli({ type: "start" });
  await a.cekej("started");
  lob = await a.posledni("lobby");
  test("za běhu jsou zápisy zavřené", lob.rozvrh.faze === "bezi");
  test("přihlásit se za běhu nejde", !!(await (async () => {
    a.posli({ type: "prihlas", faction: 1 });
    return a.cekej("rozvrhError", 4000).catch(() => null);
  })()));

  a.posli({ type: "backToLobby" });
  await a.cekej("ended");
  lob = await a.posledni("lobby", 1500);
  test("po ručním ukončení jsou zápisy ZASE otevřené", lob.rozvrh.faze === "zapisy");
  test("naplánovala se další sezóna", lob.rozvrh.cislo === cisloPred + 1);
  test("a jde se do ní přihlásit", await (async () => {
    a.posli({ type: "prihlas", faction: 1 });
    const l = await a.posledni("lobby", 1200);
    return l && l.rozvrh.mojeFrakce === 1;
  })());
  a.ws.close();

  await new Promise(r => { server.on("exit", r); server.kill(); });
  fs.rmSync(DATA, { recursive: true, force: true });
  console.log(selhalo ? `\n❌ ${selhalo} selhalo` : "\n✅ ruční konec sezóny zase otevře zápisy");
  process.exit(selhalo ? 1 : 0);
})().catch(e => { console.error("CHYBA:", e.message); process.exit(1); });
