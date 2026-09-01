// SONDA DELTA SNAPSHOTŮ (v0.33+): připojí se na běžící server (výchozí
// :8200) jako host, spustí hru a 75 tiků měří velikosti zpráv. Na každém
// PLNÉM snapshotu (tik % 60) porovná vlastní merge delt proti plné mapě
// DO HLOUBKY: rozdíl se stejným otiskem = slepé místo tileOtisk (chyba!),
// rozdíl s jiným otiskem = legitimní drift jednoho tiku (plný ho léčí).
// Spuštění:  node server/server.js 8200   +   node tests/sonda-delta.js
// (po testu smaž server/data). Není ve vse.js — pouštěj po zásahu do
// delta protokolu, tileOtisk nebo serializeState.
const WebSocket = require("ws");

const PORT = parseInt(process.argv[2], 10) || 8200;
const ws = new WebSocket("ws://localhost:" + PORT);
const mereni = { fullB: [], deltaB: [], deltaDlazdic: [], srovnani: 0, drift: 0, chyby: [] };
let tiles = null;
let ticku = 0;
const keyOf = (q, r) => q + "," + r;

function normalizuj(t) {
  return JSON.stringify(t, Object.keys(t).sort());
}

// replika serverového tileOtisk — MUSÍ zrcadlit server/server.js
function otisk(t) {
  const armyTotal = a => Object.values(a || {}).reduce((x, y) => x + y, 0);
  return t.owner + "|" + (t.clen || 0) + "|" + Math.round(t.garrison || 0)
    + "|" + (t.okno | 0) + "|" + Math.round(t.odol || 0) + "|" + (t.uzelCd | 0)
    + "|" + (t.structure || "") + "|" + (t.outpost ? Math.round(armyTotal(t.outpost) * 10) : -1)
    + "|" + t.terrain + "|" + t.level + "|" + (t.res || "") + "|" + (t.big || "")
    + "|" + (t.bigSize || 0);
}

function porovnej(plne) {
  const plna = new Map(plne.map(t => [keyOf(t.q, t.r), t]));
  if (plna.size !== tiles.size) {
    mereni.chyby.push(`počet polí: merge ${tiles.size} vs plná ${plna.size}`);
    return;
  }
  for (const [k, t] of plna) {
    const m = tiles.get(k);
    if (!m) { mereni.chyby.push(`pole ${k} v merge CHYBÍ`); continue; }
    if (normalizuj(m) === normalizuj(t)) continue;
    if (otisk(m) === otisk(t))
      mereni.chyby.push(`SLEPÉ MÍSTO otisku — pole ${k}: merge=${normalizuj(m)} plná=${normalizuj(t)}`);
    else mereni.drift++;
  }
  mereni.srovnani++;
}

ws.on("open", () => ws.send(JSON.stringify({ type: "hello", name: "sonda" })));
ws.on("message", raw => {
  const msg = JSON.parse(raw);
  const bajtu = raw.length;
  if (msg.type === "welcome") {
    ws.send(JSON.stringify({ type: "pick", faction: 0 }));
    setTimeout(() => ws.send(JSON.stringify({ type: "start" })), 200);
  } else if (msg.type === "started") {
    const s = msg.state;
    if (!s.tiles) { console.log(JSON.stringify({ CHYBA: "started BEZ tiles!" })); process.exit(1); }
    tiles = new Map(s.tiles.map(t => [keyOf(t.q, t.r), t]));
    mereni.startedB = bajtu;
  } else if (msg.type === "state") {
    const s = msg.state;
    ticku++;
    const jeFull = s.tick % 60 === 0;
    if (jeFull) {
      if (!s.tiles) mereni.chyby.push(`tik ${s.tick}: plný BEZ tiles`);
      if (s.tilesDelta) mereni.chyby.push(`tik ${s.tick}: plný S tilesDelta`);
      if (s.tiles) { porovnej(s.tiles); tiles = new Map(s.tiles.map(t => [keyOf(t.q, t.r), t])); }
      mereni.fullB.push(bajtu);
    } else {
      if (s.tiles) mereni.chyby.push(`tik ${s.tick}: delta S tiles`);
      if (!s.tilesDelta) mereni.chyby.push(`tik ${s.tick}: delta BEZ tilesDelta`);
      for (const t of (s.tilesDelta || [])) tiles.set(keyOf(t.q, t.r), t);
      mereni.deltaB.push(bajtu);
      mereni.deltaDlazdic.push((s.tilesDelta || []).length);
    }
    if (ticku >= 75) {
      const prum = a => a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0;
      console.log(JSON.stringify({
        tiku: ticku,
        startedKB: Math.round(mereni.startedB / 1024),
        fullSnapshotu: mereni.fullB.length,
        fullKB: prum(mereni.fullB.map(b => b / 1024)),
        deltaPrumB: prum(mereni.deltaB),
        deltaMaxB: Math.max(...mereni.deltaB),
        deltaDlazdicPrum: +(mereni.deltaDlazdic.reduce((a, b) => a + b, 0) / mereni.deltaDlazdic.length).toFixed(1),
        deltaDlazdicMax: Math.max(...mereni.deltaDlazdic),
        hloubkovychSrovnani: mereni.srovnani,
        driftJednohoTiku: mereni.drift,
        CHYBY: mereni.chyby.length ? mereni.chyby.slice(0, 6) : "žádné",
      }, null, 1));
      ws.close();
      process.exit(mereni.chyby.length ? 1 : 0);
    }
  } else if (msg.type === "error") {
    console.log("SERVER ERROR:", msg.text);
  }
});
ws.on("error", e => { console.log("WS CHYBA (běží server na :" + PORT + "?):", e.message); process.exit(1); });
setTimeout(() => { console.log("TIMEOUT sondy"); process.exit(1); }, 170000);
