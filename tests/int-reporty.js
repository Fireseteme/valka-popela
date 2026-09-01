// Pošta bojových reportů (v0.50): hráči chodí JEN jeho bitvy.
//
// Do v0.49 dostával každý hráč každou bitvu na světě a klient si držel
// posledních 40 — svět jich generuje ~390 za hodinu, takže vlastní bitvy
// hráči vypadly za šest minut mezi souboji AI na druhém konci mapy.
//
//     node tests/int-reporty.js
//
// Běží lokálně na portu 8294 nad dočasným adresářem dat (VP_DATA), takže na
// nic ostrého nesahá. NENÍ ve vse.js: startuje vlastní server a chvíli čeká.
const { spawn } = require("child_process");
const WebSocket = require("../node_modules/ws");
const { zaregistrujAPotvrd } = require("./pomoc-ucty.js");
const fs = require("fs"), os = require("os"), path = require("path");
const PORT = 8294, KOREN = path.join(__dirname, "..");
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "vp-reporty-"));
let selhalo = 0;
const test = (j, ok) => { console.log((ok ? "  ✅ " : "  ❌ ") + j); if (!ok) selhalo++; };
const pauza = ms => new Promise(r => setTimeout(r, ms));

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
let logServeru = "";

function klient() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/`);
  const fronta = [], cekaji = [];
  const reporty = [];        // co dorazilo za celou relaci
  let stav = null;
  let precteno = [];
  ws.on("message", raw => {
    const m = JSON.parse(raw);
    if (m.state) {
      stav = m.state;
      for (const r of m.state.newReports || []) reporty.push(r);
      if (m.state.precteno) precteno = m.state.precteno;
    }
    if (m.type === "reportyPrecteny") precteno = m.precteno || [];
    const i = cekaji.findIndex(c => c.typ === m.type);
    if (i >= 0) { const c = cekaji.splice(i, 1)[0]; clearTimeout(c.cas); c.res(m); } else fronta.push(m);
  });
  return {
    ws, reporty, otevreno: new Promise(r => ws.on("open", r)),
    precteno: () => precteno,
    stav: () => stav,
    posli: m => ws.send(JSON.stringify(m)),
    // POZOR: lobby chodí i samo od sebe, takže první ve frontě bývá starší
    // než odpověď na právě poslaný příkaz. Bez tohohle se test rozjel dřív,
    // než server zapsal druhému hráči frakci, a sezóna startovala s jedním.
    async cekejNaVyber(faction, ms = 8000) {
      const konec = Date.now() + ms;
      while (Date.now() < konec) {
        const m = await this.cekej("lobby", 3000).catch(() => null);
        if (m && (m.players || []).some(x => x.faction === faction)) return m;
      }
      throw new Error("výběr frakce " + faction + " se v lobby neobjevil");
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

  console.log("=== 1. dva hráči, dvě frakce, spuštěná sezóna");
  const a = klient(); await a.otevreno;
  a.posli({ type: "hello", name: "Utocnik" });
  const tokA = (await a.cekej("welcome")).token;
  const uctA = await zaregistrujAPotvrd(a, { port: PORT, dataDir: DATA, jmeno: "utocnik", heslo: "heslo123" });
  a.posli({ type: "pick", faction: 0 });
  await a.cekejNaVyber(0);

  const b = klient(); await b.otevreno;
  b.posli({ type: "hello", name: "Divak" });
  await b.cekej("welcome");
  await zaregistrujAPotvrd(b, { port: PORT, dataDir: DATA, jmeno: "divak", heslo: "heslo123" });
  b.posli({ type: "pick", faction: 4 });
  await b.cekejNaVyber(4);

  a.posli({ type: "start" });
  const startA = await a.cekej("started");
  await b.cekej("started");
  test("oba hráči jsou ve hře", startA.yourFaction === 0);

  console.log("=== 2. útočník vyšle hrdinu na sousední neutrální pole");
  // z plného stavu najdi vlastní pole a vedle něj neutrála
  const tiles = new Map(startA.state.tiles.map(t => [t.q + "," + t.r, t]));
  // ⚠ ETAPA 7: rod vlastní i svůj PŘECHOD přes dělič kolébky, který je od
  // kapitálu daleko — cíl vedle něj by hrdina pochodoval přes sto tiků
  // a test by mu na to nedal čas. Bereme jen okolí kapitálu.
  const moje = [...tiles.values()].filter(t => t.owner === 0 && t.structure !== "bridge");
  let cil = null;
  for (const m of moje) {
    for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const t = tiles.get((m.q + dq) + "," + (m.r + dr));
      // ETAPA 7: kolem vlastních polí je nově i řeka děliče a rod vlastní
      // i mostní pole — cíl musí být PRŮCHOZÍ souš ("bridge" je taky průchozí,
      // ale je to brána, ne pole na dobytí)
      if (t && t.owner === -1 && !t.structure && !t.big && !t.bigSize
        && ["plains", "forest", "hills", "ruins"].includes(t.terrain)) { cil = t; break; }
    }
    if (cil) break;
  }
  test("našel se neutrální soused", !!cil);
  // startovní zásoba je 20 pěších a nic jiného — víc poslat nejde
  a.posli({ type: "cmd", cmd: "startMarch",
    payload: { tileKey: cil.q + "," + cil.r, army: { inf: 15, arch: 0, cav: 0 }, heroIdx: 0, returnAfter: false } });

  await pauza(3000);
  const f0 = a.stav() && a.stav().factions && a.stav().factions[0];
  console.log("     pochodů po vyslání:", f0 ? f0.marches.length : "?",
    "| hrdina doma:", f0 && f0.heroes[0] ? !f0.heroes[0].pos : "?",
    "| zásoba:", f0 ? JSON.stringify(f0.units) : "?", "| zlato:", f0 ? Math.round(f0.resources.gold) : "?");
  console.log("=== 3. počkat na bitvu (a nechat AI mezitím bojovat po celé mapě)");
  // čeká se na VÝSLEDEK, ne pevnou dobu: pochod trvá 15 s na pole × rychlost
  // jednotek, takže pevný čas je buď zbytečně dlouhý, nebo občas krátký
  for (let i = 0; i < 60 && !a.reporty.length; i++) {
    await pauza(2000);
    if (i % 5 === 4) {
      const f = a.stav() && a.stav().factions && a.stav().factions[0];
      const m = f && f.marches[0];
      console.log(`     ${(i + 1) * 2} s · pochod ${m ? "zbývá " + m.ticksLeft + " tiků" : "dorazil"}`);
    }
  }
  console.log(`     útočníkovi dorazilo ${a.reporty.length} reportů, divákovi ${b.reporty.length}`);
  test("útočník má aspoň jeden report", a.reporty.length >= 1);
  test("útočník dostal JEN své bitvy",
    a.reporty.every(r => (r.ucastnici || []).includes("0:0")));
  test("divák nedostal ani jednu cizí bitvu", b.reporty.length === 0);

  console.log("=== 4. stav přečtení drží server");
  const prvni = a.reporty[0];
  a.posli({ type: "reportPrecten", id: prvni.id });
  await a.cekej("reportyPrecteny");
  test("server si přečtení zapsal", a.precteno().includes(prvni.id));

  a.ws.close();
  const a2 = klient(); await a2.otevreno;
  a2.posli({ type: "hello", name: "Utocnik", token: tokA });
  await a2.cekej("started");
  await pauza(2500);
  test("po znovupřipojení dorazila celá schránka", a2.reporty.length >= a.reporty.length);
  test("a přečtení přežilo", a2.precteno().includes(prvni.id));

  // jiné zařízení = nový token, přihlášení k témuž účtu
  const a3 = klient(); await a3.otevreno;
  a3.posli({ type: "hello", name: "Utocnik z mobilu" });
  await a3.cekej("welcome");
  a3.posli({ type: "accToken", authToken: uctA.authToken });
  await a3.cekej("started");
  await pauza(2500);
  test("z jiného zařízení sedí schránka i přečtení",
    a3.reporty.length >= 1 && a3.precteno().includes(prvni.id));
  a2.ws.close(); a3.ws.close(); b.ws.close();

  console.log("=== 5. pošta přežije restart serveru");
  // schránky jsou součástí snímku sezóny — bez toho by nasazení opravy
  // smazalo všem hráčům bojové záznamy
  await zabij(server);
  const server2 = await spustServer();
  const a4 = klient(); await a4.otevreno;
  a4.posli({ type: "hello", name: "Utocnik", token: tokA });
  await a4.cekej("started");
  await pauza(2500);
  test("schránka po restartu sedí", a4.reporty.length >= 1);
  test("a přečtení taky", a4.precteno().includes(prvni.id));
  a4.ws.close();

  await zabij(server2);
  fs.rmSync(DATA, { recursive: true, force: true });
  console.log(selhalo ? `\n❌ ${selhalo} selhalo` : "\n✅ hráči chodí jen jeho bitvy");
  process.exit(selhalo ? 1 : 0);
})().catch(e => {
  console.error("CHYBA:", e.message);
  console.error("--- posledních 14 řádků logu serveru ---");
  console.error(logServeru.split("\n").slice(-14).join("\n"));
  process.exit(1);
});
