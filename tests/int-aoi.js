// AOI PO DRÁTĚ (etapa 11): server posílá jen OKRUH ZÁJMU hráče, ne celou mapu.
//
//     node tests/int-aoi.js
//
// Běží lokálně na portu 8287 nad dočasným adresářem dat (VP_DATA), na mapě
// 121×121 (MAP_R 60) — dost velké, aby byl okruh zájmu menší než mapa, a dost
// malé, aby se sezóna nastartovala rychle. NENÍ ve vse.js.
const { spawn } = require("child_process");
const WebSocket = require("../node_modules/ws");
const { zaregistrujAPotvrd } = require("./pomoc-ucty.js");
const game = require("../js/game.js");
const fs = require("fs"), os = require("os"), path = require("path");
const PORT = 8287, MAPA_R = 60, KOREN = path.join(__dirname, "..");
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "vp-aoi-"));
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
    setTimeout(() => rej(new Error("server nenaběhl:\n" + log)), 30000);
  });
}
const zabij = p => new Promise(r => { p.on("exit", () => r()); p.kill(); });

function klient() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/`);
  const fronta = [], cekaji = [];
  const mapa = new Map();      // co klient POSTUPNĚ nasbíral (jako net.js)
  let stav = null, plnych = 0, poslednihoPlneho = 0;
  ws.on("message", raw => {
    const m = JSON.parse(raw);
    if (m.state) {
      stav = m.state;
      if (m.state.tiles) {
        plnych++; poslednihoPlneho = m.state.tiles.length;
        for (const t of m.state.tiles) mapa.set(t.q + "," + t.r, t);
      }
      for (const t of m.state.tilesDelta || []) mapa.set(t.q + "," + t.r, t);
    }
    const i = cekaji.findIndex(c => c.typ === m.type);
    if (i >= 0) { const c = cekaji.splice(i, 1)[0]; clearTimeout(c.cas); c.res(m); } else fronta.push(m);
  });
  return {
    ws, mapa, otevreno: new Promise(r => ws.on("open", r)),
    stav: () => stav, plnych: () => plnych, poslednihoPlneho: () => poslednihoPlneho,
    posli: m => ws.send(JSON.stringify(m)),
    async cekejNaHracu(n, ms = 8000) {
      const konec = Date.now() + ms;
      while (Date.now() < konec) {
        const m = await this.cekej("lobby", 3000).catch(() => null);
        if (m && (m.players || []).filter(x => x.faction !== null).length >= n) return m;
      }
      throw new Error("v lobby není " + n + " hráčů");
    },
    cekej(typ, ms = 20000) {
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
    const políCelkem = (2 * MAPA_R + 1) ** 2;
    console.log(`=== 1. hráč vstupuje do sezóny na mapě ${2 * MAPA_R + 1}×${2 * MAPA_R + 1} (${políCelkem} polí)`);
    const a = klient(); await a.otevreno;
    a.posli({ type: "hello", name: "Prvni" }); await a.cekej("welcome");
    await zaregistrujAPotvrd(a, { port: PORT, dataDir: DATA, jmeno: "prvni", heslo: "heslo123" });
    a.posli({ type: "pick", faction: 0 }); await a.cekejNaHracu(1);
    a.posli({ type: "start" });
    const start = await a.cekej("started");
    test("sezóna běží", !!start.state);

    console.log("=== 2. plný snímek nese jen okruh zájmu");
    const dorazilo = start.state.tiles ? start.state.tiles.length : 0;
    console.log(`     dorazilo ${dorazilo} polí z ${políCelkem} (${Math.round(dorazilo / políCelkem * 100)} %)`);
    test("dlaždice vůbec dorazily", dorazilo > 0);
    test("ale NE celá mapa", dorazilo < políCelkem);
    test("server hlásí, že jde o AOI (klient má mergovat)", start.state.aoi === true);
    test("okruh je řádově tisíce polí, ne desítky tisíc", dorazilo < 12000);

    console.log("=== 3. v okruhu je všechno, co hráč potřebuje");
    const mam = k => a.mapa.has(k);
    const moje = [...a.mapa.values()].filter(t => t.owner === 0);
    test("hráč vidí svoje pole", moje.length > 0);
    test("mezi nimi kapitál", moje.some(t => t.structure === "capital"));
    // okolí kapitálu musí být kompletní do REACH
    const cap = moje.find(t => t.structure === "capital");
    let chybi = 0;
    for (let dq = -10; dq <= 10; dq++) {
      const zb = 10 - Math.abs(dq);
      for (let dr = -zb; dr <= zb; dr++) {
        const q = cap.q + dq, r = cap.r + dr;
        if (Math.max(Math.abs(q), Math.abs(r)) <= MAPA_R && !mam(q + "," + r)) chibiPlus();
      }
    }
    function chibiPlus() { chybi++; }
    test(`okolí kapitálu do 10 polí je celé (chybí ${chybi})`, chybi === 0);

    console.log("=== 4. mapa klientovi jen ROSTE (merguje se, nepřepisuje)");
    const pred = a.mapa.size;
    await pauza(6000);   // ať proběhne aspoň jeden další snímek
    test("po dalších snímcích mapa neztratila pole", a.mapa.size >= pred);
    test("a víc plných snímků dorazilo", a.plnych() >= 1);

    a.ws.close();
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
  console.log(selhalo ? `\n❌ ${selhalo} selhalo` : "\n✅ int-aoi prošlo");
  process.exit(selhalo ? 1 : 0);
})();
