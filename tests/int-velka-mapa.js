// VELKÁ MAPA NA SKUTEČNÉM SERVERU (etapa 11b).
//
//     node tests/int-velka-mapa.js
//
// Etapa 11b zvedla strop mapy z 461×461 na 1459×1459 tím, že z tiku zmizely
// průchody celým světem (kandidáti AI, odpočty polí, otisky pro deltu) a že
// se snímek sezóny ukládá přírůstkově. Jednotkové testy měří kusy; tenhle test
// pouští OSTRÝ server na velké mapě a hlídá to, co se dá pokazit jen dohromady:
// že tik stíhá, že snímek neroste o celý svět a že restart sezónu vrátí.
//
// Mapa je 955×955 (912 025 polí) — pevná velikost ostrého serveru.
// NENÍ ve vse.js: spouští vlastní server a generátor mapy trvá vteřiny.
const { spawn } = require("child_process");
const WebSocket = require("../node_modules/ws");
const { zaregistrujAPotvrd } = require("./pomoc-ucty.js");
const fs = require("fs"), os = require("os"), path = require("path");
// 477 = 955×955 — PŘESNĚ ten svět, na kterém ostrý server od 1. 9. 2026 jede
// (pevná velikost, viz MAPA_PEVNA v server.js). Test tak hlídá provozní stav,
// ne nějakou vymyšlenou velikost.
const PORT = 8291, MAPA_R = 477, KOREN = path.join(__dirname, "..");
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "vp-velka-"));
const SNIMEK = path.join(DATA, "sezona.json.gz");
let selhalo = 0;
const test = (j, ok) => { console.log((ok ? "  ✅ " : "  ❌ ") + j); if (!ok) selhalo++; };
const pauza = ms => new Promise(r => setTimeout(r, ms));
let logServeru = "";

function spustServer() {
  return new Promise((res, rej) => {
    const p = spawn(process.execPath, ["server/server.js", String(PORT), "1", String(MAPA_R)],
      { cwd: KOREN, env: { ...process.env, VP_DATA: DATA } });
    let log = "";
    p.stdout.on("data", d => { log += d; logServeru += d; if (log.includes("ukončení: Ctrl+C")) res(p); });
    p.stderr.on("data", d => { log += d; logServeru += d; });
    setTimeout(() => rej(new Error("server nenaběhl:\n" + log)), 60000);
  });
}
const zabij = p => new Promise(r => { p.on("exit", () => r()); p.kill(); });

function klient() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/`);
  const fronta = [], cekaji = [];
  let stav = null;
  ws.on("message", raw => {
    const m = JSON.parse(raw);
    if (m.state) stav = m.state;
    const i = cekaji.findIndex(c => c.typ === m.type);
    if (i >= 0) { const c = cekaji.splice(i, 1)[0]; clearTimeout(c.cas); c.res(m); } else fronta.push(m);
  });
  return {
    ws, otevreno: new Promise(r => ws.on("open", r)), stav: () => stav,
    posli: m => ws.send(JSON.stringify(m)),
    async cekejNaHracu(n, ms = 12000) {
      const konec = Date.now() + ms;
      while (Date.now() < konec) {
        const m = await this.cekej("lobby", 4000).catch(() => null);
        if (m && (m.players || []).filter(x => x.faction !== null).length >= n) return m;
      }
      throw new Error("v lobby není " + n + " hráčů");
    },
    cekej(typ, ms = 30000) {
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
  let server = await spustServer();
  try {
    const poli = (2 * MAPA_R + 1) ** 2;
    console.log(`=== 1. sezóna se rozjede na mapě ${2 * MAPA_R + 1}×${2 * MAPA_R + 1} (${poli} polí)`);
    const a = klient(); await a.otevreno;
    a.posli({ type: "hello", name: "Prvni" }); await a.cekej("welcome");
    await zaregistrujAPotvrd(a, { port: PORT, dataDir: DATA, jmeno: "prvni", heslo: "heslo123" });
    a.posli({ type: "pick", faction: 0 }); await a.cekejNaHracu(1);
    const t0 = Date.now();
    a.posli({ type: "start" });
    const start = await a.cekej("started", 120000);
    console.log(`     start sezóny trval ${Date.now() - t0} ms`);
    test("sezóna běží", !!start.state);
    test("a klient dostal jen okruh zájmu, ne celou mapu",
      (start.state.tiles || []).length > 0 && start.state.tiles.length < poli / 10);

    console.log("=== 2. tik stíhá (server posílá stavy dál)");
    const tikPred = a.stav().tick;
    await pauza(10000);
    const tikPo = a.stav().tick;
    console.log(`     za 10 s uběhlo ${tikPo - tikPred} tiků`);
    test("hodiny světa jdou (aspoň 6 tiků za 10 s)", tikPo - tikPred >= 6);

    console.log("=== 3. snímek roste přírůstkově, ne o celý svět");
    // plný snímek se ROZEPISUJE přes tiky, takže na svět po startu chvíli čeká
    const doKdy = Date.now() + 90000;
    while (!fs.existsSync(SNIMEK) && Date.now() < doKdy) await pauza(1000);
    test("snímek sezóny se dopsal", fs.existsSync(SNIMEK));
    const pred = fs.statSync(SNIMEK).size;
    await pauza(12000);   // aspoň jeden přírůstkový zápis
    const po = fs.statSync(SNIMEK).size;
    console.log(`     ${(pred / 1048576).toFixed(2)} MB → ${(po / 1048576).toFixed(2)} MB `
      + `(přírůstek ${((po - pred) / 1024).toFixed(0)} kB)`);
    test("soubor se nepřepisuje celý dokola", po - pred < pred / 2);

    console.log("=== 4. restart sezónu vrátí");
    const tikPredRestartem = a.stav().tick;
    a.ws.close();
    await zabij(server);
    logServeru = "";
    server = await spustServer();
    await pauza(1500);
    test("server hlásí obnovenou sezónu", logServeru.includes("obnovena sezóna"));
    // tik po obnově čteme z logu serveru — anonymní klient dostane jen lobby
    const kus = logServeru.split("obnovena sezóna ")[1] || "";
    const tikPoObnove = parseInt((kus.split("v tiku ")[1] || "").trim(), 10) || -1;
    console.log(`     před restartem tik ${tikPredRestartem}, po obnově ${tikPoObnove}`);
    test("svět pokračuje, ne začíná od nuly", tikPoObnove > 0);
    test("a neztratil víc než pár vteřin hry",
      tikPoObnove >= tikPredRestartem - 30);
  } catch (e) {
    console.log("❌ VÝJIMKA: " + e.message);
    selhalo++;
  } finally {
    await zabij(server);
    try { fs.rmSync(DATA, { recursive: true, force: true }); } catch (e) {}
  }
  if (logServeru.match(/TypeError|ReferenceError|selhal/)) {
    console.log("❌ v logu serveru je chyba:\n" + logServeru.split("\n")
      .filter(r => r.match(/TypeError|ReferenceError|selhal/)).slice(0, 5).join("\n"));
    selhalo++;
  }
  console.log(selhalo ? `\n❌ int-velká-mapa: ${selhalo} selhalo` : "\n✅ int-velká-mapa prošlo");
  process.exit(selhalo ? 1 : 0);
})();
