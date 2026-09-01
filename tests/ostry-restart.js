// !!! TENHLE TEST SAHÁ NA OSTRÝ SERVER !!!
//
// Zahodí právě běžící sezónu na warofash.com a dvakrát restartuje službu.
// Pouštěj ho JEN když na serveru nikdo nehraje — typicky po nasazení, jako
// důkaz, že restart sezónu neztratí. Kvůli tomu chce potvrzení:
//
//     node tests/ostry-restart.js --opravdu
//
// Ověřuje celý řetěz: rozehrát sezónu přes wss://warofash.com, nechat
// systemctl restart (na Linuxu je SIGTERM opravdový signál, takže se ověří
// i úklidové uložení) a zkontrolovat, že se svět zvedl tam, kde skončil.
// NENÍ ve vse.js — potřebuje běžící ostrý server a SSH klíč.
if (!process.argv.includes("--opravdu")) {
  console.log("Tenhle test zahodí běžící sezónu na OSTRÉM serveru.");
  console.log("Když to je opravdu záměr:  node tests/ostry-restart.js --opravdu");
  process.exit(1);
}
const WebSocket = require("../node_modules/ws");
const { execFileSync } = require("child_process");
const URL = "wss://warofash.com/";
let selhalo = 0;
const test = (j, ok) => { console.log((ok ? "  ✅ " : "  ❌ ") + j); if (!ok) selhalo++; };
const pauza = ms => new Promise(r => setTimeout(r, ms));
const ssh = cmd => execFileSync("ssh", ["-o", "BatchMode=yes", "root@31.31.72.77", cmd], { encoding: "utf8" });

function klient() {
  const ws = new WebSocket(URL);
  const fronta = [], cekaji = [];
  ws.on("message", raw => {
    const m = JSON.parse(raw);
    const i = cekaji.findIndex(c => c.typ === m.type);
    if (i >= 0) { const c = cekaji.splice(i, 1)[0]; clearTimeout(c.cas); c.res(m); } else fronta.push(m);
  });
  return { ws, otevreno: new Promise(r => ws.on("open", r)), posli: m => ws.send(JSON.stringify(m)),
    cekej(typ, ms = 15000) {
      const i = fronta.findIndex(m => m.type === typ);
      if (i >= 0) return Promise.resolve(fronta.splice(i, 1)[0]);
      return new Promise((res, rej) => { const cas = setTimeout(() => rej(new Error("nedorazilo: " + typ)), ms); cekaji.push({ typ, res, cas }); });
    } };
}

(async () => {
  console.log("=== 0. čistý start (server nesmí být v rozehrané sezóně)");
  // POŘADÍ: restart nejdřív pošle SIGTERM a odcházející proces snímek ZNOVU
  // zapíše — smazat se musí až po zastavení služby
  ssh("systemctl stop warofash; rm -f /opt/warofash/data/sezona.json.gz; systemctl start warofash");
  await pauza(5000);

  console.log("=== 1. rozehrát sezónu na ostrém serveru");
  let k = klient();
  await k.otevreno;
  k.posli({ type: "hello", name: "restart-test" });
  const token = (await k.cekej("welcome")).token;
  k.posli({ type: "pick", faction: 0 });
  await k.cekej("lobby");
  k.posli({ type: "start" });
  const start = await k.cekej("started");
  test("sezóna se rozjela", start.yourFaction === 0 && !!start.state);

  await pauza(15000);
  let tickPred = 0;
  for (let i = 0; i < 40; i++) {
    const m = await k.cekej("state", 2500).catch(() => null);
    if (!m) break;
    const t = m.tick != null ? m.tick : (m.state && m.state.tick);
    if (t != null) tickPred = Math.max(tickPred, t);
  }
  console.log("     tik před restartem:", tickPred);
  test("snímek na serveru vznikl", ssh("ls -l /opt/warofash/data/sezona.json.gz").includes("sezona.json.gz"));
  k.ws.close();

  console.log("=== 2. systemctl restart warofash");
  ssh("systemctl restart warofash");
  await pauza(5000);
  const log = ssh("journalctl -u warofash -n 25 --no-pager -o cat");
  test("úklidové uložení při SIGTERM proběhlo", /ukládám stav a končím/.test(log));
  test("start hlásí obnovu", /POKRAČUJE po restartu|obnovena sezóna/.test(log));
  const m = log.match(/obnovena sezóna (\d+) v tiku (\d+)/);
  const tickObnovy = m ? parseInt(m[2], 10) : -1;
  console.log("     obnoveno v tiku:", tickObnovy);
  // ZTRÁTA se měří TADY: co server po restartu načetl vs. co hráč naposled
  // viděl. Tik po reconnectu je vždycky vyšší, protože svět mezitím běží dál.
  test("snímek při vypnutí nezaostal za tím, co hráč viděl", tickObnovy >= tickPred);

  console.log("=== 3. hráč se vrací");
  k = klient();
  await k.otevreno;
  k.posli({ type: "hello", name: "restart-test", token });
  const zpet = await k.cekej("started");
  const tickPo = zpet.state && zpet.state.tick;
  test("hráč je zpátky ve své frakci se světem", zpet.yourFaction === 0 && !!zpet.state.tiles);
  console.log("     tik po restartu:", tickPo, "(svět mezitím tikal dál)");
  test("sezóna pokračuje", tickPo >= tickPred - 3);
  k.ws.close();
  console.log(selhalo ? `\n❌ ${selhalo} selhalo` : "\n✅ ostrý server restart přežil bez ztráty");
  process.exit(selhalo ? 1 : 0);
})().catch(e => { console.error("CHYBA:", e.message); process.exit(1); });
