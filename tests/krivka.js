const g = require(__dirname + "/../js/game.js");
const G = g.G;
g.newGame(0, 999, [0]);
const stA = g.heroStats(G.factions[0], 0);   // hrdina 1. úrovně bez bodů (kotva)

const vzorek = {};
for (const t of G.tiles.values()) {
  if (t.owner !== -1 || t.structure) continue;
  if (!vzorek[t.level]) vzorek[t.level] = t;
}
// POZOR: simulateBattle mění hp předaného velitele — do každého pokusu musí
// jít čerstvá kopie, jinak je obránce od druhého kola hledání mrtvý
const potreba = (garrison, mkDef) => {
  // strop hledání: Trůn po etapě 7 přeleze 6 000, jinak se měření saturuje
  let lo = 1, hi = 20000;
  while (lo < hi) {
    const mid = (lo + hi) >> 1, per = mid / 3;
    const sim = g.simulateBattle({
      attacker: { faction: null, army: { inf: per, arch: per, cav: per },
        hero: { name: "T", hp: stA.hpMax, atk: stA.atk, def: stA.def, dmg: stA.dmg,
          speed: stA.speed, spell: 0, ward: 0 }, mult: 1 },
      defender: { faction: null, army: { inf: garrison / 3, arch: garrison / 3, cav: garrison / 3 },
        hero: mkDef(), mult: 1, heroLed: false },
      structure: false });
    if (sim.won) hi = mid; else lo = mid + 1;
  }
  return lo;
};
const kapitan = () => ({ name: "kapitán", hp: 80, atk: 2, def: 2, dmg: 8, speed: 4, spell: 0, ward: 0 });
const velitel = nc => () => ({ name: nc.name, hp: nc.hp, atk: nc.atk, def: nc.def,
  dmg: nc.dmg, speed: nc.speed, spell: 0, ward: 0 });

console.log("pole            | posádka | velitel            | dřív |  teď | poměr");
const rows = [];
for (const lvl of [1, 2, 3, 4, 5, 6, 8, 10, 12]) {
  const t = vzorek[lvl]; if (!t) continue;
  const gar = g.TIER_GARRISON[lvl - 1], nc = g.neutralCommander(t);
  rows.push([`⚔${String(g.TIERS[lvl-1]).padStart(4)}`, gar, nc,
    potreba(gar, kapitan), potreba(gar, velitel(nc))]);
}
for (const t of G.tiles.values()) {
  if (t.owner !== -1 || !t.structure) continue;
  const k = "S" + t.structure;
  if (vzorek[k] || !["fortress","grandfort","throne","city","bridge","bastion"].includes(t.structure)) continue;
  vzorek[k] = 1;
  const gar = g.STRUCTURES[t.structure].militia, nc = g.neutralCommander(t);
  rows.push([t.structure.padEnd(5) + " ⚔" + String(g.tileStrengthLabel(t)).padStart(4), gar, nc,
    potreba(gar, kapitan), potreba(gar, velitel(nc))]);
}
for (const [jm, gar, nc, stare, nove] of rows) {
  console.log(`${jm.padEnd(15)} | ${String(gar).padStart(7)} | úr.${String(nc.level).padStart(2)} ${nc.trait.padEnd(8)}`
    + ` | ${String(stare).padStart(4)} | ${String(nove).padStart(4)} | ×${(nove/stare).toFixed(2)}`);
}
