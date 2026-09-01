// Regrese: po přihlášení k účtu musí klient dostat lobby ZNOVU, jinak si nese
// stav z doby, kdy byl anonym, a jeho přihláška do sezóny v něm chybí.
const { spawn } = require("child_process");
const WebSocket = require("../node_modules/ws");
const { zaregistrujAPotvrd } = require("./pomoc-ucty.js");
const fs = require("fs"), os = require("os"), path = require("path");
const PORT = 8296, KOREN = path.join(__dirname, "..");
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "vp-prih-"));
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
  const token = (await a.cekej("welcome")).token;
  const ucet = await zaregistrujAPotvrd(a, { port: PORT, dataDir: DATA, jmeno: "vit", heslo: "heslo123" });
  a.posli({ type: "prihlas", faction: 2 });
  let lob = await a.posledni("lobby");
  test("přihláška je v lobby hned po přihlášení", lob && lob.rozvrh.mojeFrakce === 2);
  a.ws.close();

  // NOVÉ SPOJENÍ: přesně to, co dělá obnovení stránky — nejdřív anonym, pak token
  const b = klient(); await b.otevreno;
  b.posli({ type: "hello", name: "Vít" });
  await b.cekej("welcome");
  const anonym = await b.posledni("lobby");
  test("před přihlášením lobby přihlášku nenese", anonym && anonym.rozvrh.mojeFrakce === null);
  b.posli({ type: "accToken", authToken: ucet.authToken });
  await b.cekej("account");
  const poPrihlaseni = await b.posledni("lobby");
  test("PO přihlášení tokenem dorazí lobby s přihláškou",
    poPrihlaseni && poPrihlaseni.rozvrh.mojeFrakce === 2);
  b.ws.close();

  await new Promise(r => { server.on("exit", r); server.kill(); });
  fs.rmSync(DATA, { recursive: true, force: true });
  console.log(selhalo ? `\n❌ ${selhalo} selhalo` : "\n✅ lobby po přihlášení nese vlastní přihlášku");
  process.exit(selhalo ? 1 : 0);
})().catch(e => { console.error("CHYBA:", e.message); process.exit(1); });
