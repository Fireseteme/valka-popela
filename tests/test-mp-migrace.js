// MP test migrace: přihlášení tokenem, profil, výběr, start hry, snapshot
const WebSocket = require(__dirname + "/../node_modules/ws");
const ws = new WebSocket("ws://localhost:8200");
const send = o => ws.send(JSON.stringify(o));
const R = {};
let step = 0;
const done = code => { console.log(JSON.stringify(R, null, 1)); ws.close(); process.exit(code); };
setTimeout(() => { R.TIMEOUT = "step " + step; done(1); }, 12000);

ws.on("open", () => send({ type: "hello", name: "MigraceBot" }));
ws.on("message", raw => {
  const m = JSON.parse(raw);
  if (m.type === "welcome") {
    step = 1;
    send({ type: "accToken", authToken: "testtoken123" });
  } else if (m.type === "account" && step === 1) {
    step = 2;
    R.profil = { cores: m.cores, unlocks: m.heroUnlocks, respecNote: m.respecNote || 0 };
    // Mara (aldar:1) byla odemčená → výběr musí projít
    send({ type: "pick", faction: 0, heroes: [1] });
    setTimeout(() => send({ type: "start" }), 400);
  } else if (m.type === "started") {
    step = 3;
    const f = m.state.factions[m.yourFaction];
    const h = f.heroes[0];
    const tree = require(__dirname + "/../js/game.js").HERO_DEFS.aldar[1].tree;
    R.hrdina = { level: h.level, stars: h.stars, skillPts: h.skillPts,
      skills: h.skills, staryKlicZur: "zur" in h.skills };
    R.ocekavano = { skillPts: 29 + 10, skillsPrazdne: true };
    // naučit dovednost NOVÝM klíčem a STARÝM klíčem
    send({ type: "cmd", cmd: "learnSkill", payload: { heroIdx: 0, skillKey: tree[0].key } });
    send({ type: "cmd", cmd: "learnSkill", payload: { heroIdx: 0, skillKey: "neexistujici_klic" } });
    setTimeout(() => send({ type: "backToLobby" }), 2500);
  } else if (m.type === "state" && step === 3) {
    const h = m.state.factions[m.yourFaction].heroes[0];
    R.poUceni = { skills: h.skills, skillPts: h.skillPts };
  } else if (m.type === "ended") {
    step = 4;
    setTimeout(() => {
      const acc = JSON.parse(require("fs").readFileSync(__dirname + "/../server/data/accounts.json", "utf8")).accounts.kamarad;
      R.naDisku = { treeV: acc.treeV, skillPts: acc.heroProgress["aldar:1"].skillPts,
        skills: acc.heroProgress["aldar:1"].skills, stars: acc.heroProgress["aldar:1"].stars };
      done(0);
    }, 800);
  } else if (m.type === "accError" || m.type === "error") {
    R.chyba = m.text;
  }
});
