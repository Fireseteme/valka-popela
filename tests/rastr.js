// RASTR BALANCU (v0.28): měřicí nástroj startovní osmičky.
// 1) Matice matchupů 8×8 — každý starter proti každému (stejné armády, hrdina
//    na referenční úrovni s rozdanými body) → výhry/prohry.
// 2) PvE tempo — kolik jednotek potřebuje každý starter na referenční pole
//    (kotvy jako tests/krivka.js) → pásmo kolem mediánu.
// Spouštění: node tests/rastr.js  (vypíše tabulky; asserce má test-rastr.js)
const g = require("../js/game.js");

const UROVEN = 50;          // referenční úroveň: 49 bodů = všechny 4 hlavní (15/15/15/4)
// Rozpočet VELENÍ na slot — sarn (cp 2) má poloviční počty.
// PŘEŠKÁLOVÁNO V ETAPĚ 6: 150 CP na slot odpovídalo 48 % stropu hrdiny (935 CP).
// Po rebase velení na ~5 179 CP by 150 znamenalo 8,7 % stropu a hrdina by
// scénu úplně převálcoval — kity s poškozením by drtily kity s užitkem,
// i když se v reálné hře potkávají s armádami o řád většími.
const CP_NA_SLOT = 830;
function armadaPro(f) {
  const a = {};
  for (const k of ["inf", "arch", "cav"]) a[k] = Math.round(CP_NA_SLOT / (g.uDef(f, k).cp || 1));
  return a;
}
const SEEDU = 11;           // průměr přes víc seedů (stun/procy houpou těsné duely;
                            // v0.30: liché číslo, ať se páry na hraně nerozhodnou remízou)

// postaví frakci fkey se starterem na referenční úrovni a rozdanými body;
// od signature intermezza (v0.34) nese referenční build i SIGNATURE kus —
// „v endgame má každý svůj signature" a itemy jsou páka ladění pavučiny
function pripravStartera(fkey) {
  const fid = g.FACTION_DEFS.findIndex(d => d.key === fkey);
  g.newGame(fid, 777, null);
  const f = g.G.factions[fid];
  f.isAI = true; // referenční build = endgame parita (♥5+): brána oddanosti se obchází
  const h = f.heroes[0];
  while (h.level < UROVEN) g.heroGainXp(f, 0, g.xpForLevel(h.level) - h.xp);
  // aiSpendSkills má pojistku 24 učení/volání — na 49 bodů je třeba víc průchodů
  for (let i = 0; i < 4; i++) g.aiSpendSkills(f);
  const sig = g.makeSignatureItem(fkey + ":" + g.STARTER_IDX[fkey]);
  if (sig) h.equip[sig.slot] = sig; // základ: 0★, bez zušlechtění
  h.hp = g.heroStats(f, 0).hpMax;
  return { f, h };
}

// bitevní objekt velitele z živého hrdiny (kopie — sim mutuje hp/staty)
function velitel(f, i) {
  const st = g.heroStats(f, i);
  const jmeno = g.HERO_DEFS[f.key][f.heroes[i].defIdx].name;
  return { name: jmeno, hp: st.hpMax, atk: st.atk, def: st.def, dmg: st.dmg,
    speed: st.speed, spell: st.spell, ward: st.ward,
    stackAtk: st.stackAtk, stackDef: st.stackDef, followUp: st.followUp,
    unitDmg: st.unitDmg, madness: st.madness, pursuit: st.pursuit,
    stunChance: st.stunChance, stunImmune: st.stunImmune,
    slowEnemy: st.slowEnemy, shred: st.shred, cauter: st.cauter,
    actives: st.actives, armyActives: st.armyActives, healActives: st.healActives,
    avoidCharges: st.avoidCharges, avoidChance: st.avoidChance,
    vsDmg: st.vsDmg, vsAll: 0 }; // vsAll rozliší duel proti soupeři (zrcadlo resolveMarch)
}

// frakční amplifikátory (vsDmg) se v ostré hře řeší v resolveMarch proti
// klíči soupeře — duel je musí rozlišit stejně, jinak jsou v rastru neviditelné
function rozlisVs(va, fkB, vb, fkA) {
  va.vsAll = (va.vsDmg && va.vsDmg[fkB]) || 0;
  vb.vsAll = (vb.vsDmg && vb.vsDmg[fkA]) || 0;
}

// duel dvou starterů: KITY na NEUTRÁLNÍCH jednotkách (hrdinové jsou od
// v0.27 přenosní po straně — kit musí být férový bez ohledu na frakci)
function duel(fkA, fkB, seed) {
  const A = pripravStartera(fkA);
  const va = velitel(A.f, 0);
  const B = pripravStartera(fkB);
  const vb = velitel(B.f, 0);
  rozlisVs(va, fkB, vb, fkA);
  const armada = () => ({ inf: CP_NA_SLOT, arch: CP_NA_SLOT, cav: CP_NA_SLOT });
  // sim čte GLOBÁLNÍ rng — seedovat BEZ mapy (v0.30: genMap mění počet tahů
  // a přes newGame by každá úprava generátoru přeházela kostky těsných duelů)
  g.seedRng(seed);
  const sim = g.simulateBattle({
    attacker: { faction: null, army: armada(), hero: va, mult: 1 },
    defender: { faction: null, army: armada(), hero: vb, mult: 1, heroLed: true },
    structure: false, seed });
  const zbyloA = g.armyTotal(sim.remA || sim.remAtt || {});
  const zbyloD = g.armyTotal(sim.remD);
  return { zbyloA, zbyloD, kol: sim.rounds };
}

// SKUTEČNÝ pár sezóny: starter S frakčními jednotkami (CP parita) —
// na tomhle se vyhodnocuje pavučina; neutrální duel() hlídá přenositelnost kitů
function duelFrakcni(fkA, fkB, seed) {
  const A = pripravStartera(fkA);
  const va = velitel(A.f, 0);
  const armA = armadaPro(A.f);
  const B = pripravStartera(fkB);
  const vb = velitel(B.f, 0);
  const armB = armadaPro(B.f);
  rozlisVs(va, fkB, vb, fkA);
  g.seedRng(seed); // kostky bez mapy — viz duel()
  const sim = g.simulateBattle({
    attacker: { faction: A.f, army: armA, hero: va, mult: 1 },
    defender: { faction: B.f, army: armB, hero: vb, mult: 1, heroLed: true },
    structure: false });
  return { zbyloA: g.armyTotal(sim.remA || {}), zbyloD: g.armyTotal(sim.remD) };
}

function maticeFrakcni() {
  const fkeys = Object.keys(g.STARTER_IDX);
  const vysledky = {};
  for (const a of fkeys) {
    vysledky[a] = {};
    for (const b of fkeys) {
      if (a === b) { vysledky[a][b] = null; continue; }
      let skore = 0;
      for (let i = 0; i < SEEDU; i++) {
        const r = duelFrakcni(a, b, 900 + i * 131);
        skore += r.zbyloA > r.zbyloD ? 1 : r.zbyloA < r.zbyloD ? -1 : 0;
      }
      vysledky[a][b] = skore;
    }
  }
  return { fkeys, vysledky };
}

// síla FRAKČNÍCH jednotek při stejném velení: zrcadlový střet bez hrdinů
// (jen informační tabulka — přeladění FACTION_UNITS hýbe kotvami křivky
// dobývání a je to samostatné rozhodnutí)
function silaJednotek() {
  const fkeys = Object.keys(g.STARTER_IDX);
  const skore = {};
  for (const a of fkeys) skore[a] = 0;
  for (const a of fkeys) for (const b of fkeys) {
    if (a === b) continue;
    g.newGame(0, 900, null);
    const fa = g.G.factions.find(f => f.key === a);
    const fb = g.G.factions.find(f => f.key === b);
    const sim = g.simulateBattle({
      attacker: { faction: fa, army: armadaPro(fa), mult: 1 },
      defender: { faction: fb, army: armadaPro(fb), mult: 1 },
      structure: false, seed: 77 });
    const za = g.armyTotal(sim.remA || {});
    const zb = g.armyTotal(sim.remD);
    skore[a] += za > zb ? 1 : za < zb ? -1 : 0;
  }
  return skore;
}

function maticeMatchupu() {
  const fkeys = Object.keys(g.STARTER_IDX);
  const vysledky = {};
  for (const a of fkeys) {
    vysledky[a] = {};
    for (const b of fkeys) {
      if (a === b) { vysledky[a][b] = null; continue; }
      let skore = 0;
      for (let s = 0; s < SEEDU; s++) {
        const r = duel(a, b, 900 + s * 131);
        // výhra útočníka = obránci zbylo méně (obrana nemá výhodu pole:
        // defense 0, structure false) — měříme ČISTÝ souboj kitů
        skore += (r.zbyloA > r.zbyloD ? 1 : r.zbyloA < r.zbyloD ? -1 : 0);
      }
      vysledky[a][b] = skore; // −SEEDU .. +SEEDU
    }
  }
  return { fkeys, vysledky };
}

// PvE: kolik jednotek (vyvážený mix) potřebuje starter na dobytí pole
// s posádkou N — binární hledání (kopie přístupu tests/krivka.js)
function pveNaklad(fkey, posadka) {
  const { f } = pripravStartera(fkey);
  const zkus = celkem => {
    const t = Math.round(celkem / 3);
    const va = velitel(f, 0);
    const sim = g.simulateBattle({
      attacker: { faction: null, army: { inf: t, arch: t, cav: t }, hero: va, mult: 1 },
      defender: { faction: null, army: { inf: posadka, arch: 0, cav: 0 },
        hero: { name: "kapitán domobrany", hp: 80, atk: 2, def: 2, dmg: 8, speed: 4,
          spell: 0, ward: 0 }, mult: 1, heroLed: true },
      structure: false, seed: 55 });
    return sim.won === true;
  };
  let lo = 3, hi = 4000;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (zkus(mid)) hi = mid; else lo = mid + 1;
  }
  return lo;
}

function pveTabulka() {
  const fkeys = Object.keys(g.STARTER_IDX);
  const out = {};
  for (const fk of fkeys) out[fk] = { p60: pveNaklad(fk, 60), p160: pveNaklad(fk, 160) };
  return out;
}

module.exports = { maticeMatchupu, maticeFrakcni, pveTabulka, pripravStartera, velitel,
  duel, duelFrakcni, silaJednotek, UROVEN, CP_NA_SLOT };

if (require.main === module) {
  console.log(`RASTR — startovní osmička na úrovni ${UROVEN}, armáda 3×${CP_NA_SLOT} CP, ${SEEDU} seedy\n`);
  const { fkeys, vysledky } = maticeMatchupu();
  const W = 9;
  console.log("útočí ↓ | " + fkeys.map(k => k.padEnd(W)).join(""));
  for (const a of fkeys) {
    const radek = fkeys.map(b => a === b ? "—".padEnd(W)
      : String(vysledky[a][b] > 0 ? "+" + vysledky[a][b] : vysledky[a][b]).padEnd(W)).join("");
    console.log(a.padEnd(8) + "| " + radek);
  }
  let bezPorazky = [], bezVyhry = [];
  for (const a of fkeys) {
    const rady = fkeys.filter(b => b !== a).map(b => vysledky[a][b]);
    const sloupce = fkeys.filter(b => b !== a).map(b => vysledky[b][a]);
    // „poráží ho někdo?" = existuje b, které proti a vyhrává (sloupec > 0 z pohledu b)
    if (!sloupce.some(v => v > 0) && rady.every(v => v >= 0)) bezPorazky.push(a);
    if (!rady.some(v => v > 0)) bezVyhry.push(a);
  }
  console.log("\nbez porážky (nesmí být nikdo):", bezPorazky.length ? bezPorazky.join(", ") : "✓ nikdo");
  console.log("bez výhry (nesmí být nikdo):  ", bezVyhry.length ? bezVyhry.join(", ") : "✓ nikdo");
  console.log("\nPvE náklad (jednotek na posádku 60 / 160):");
  const pve = pveTabulka();
  for (const fk of fkeys) console.log(`  ${fk.padEnd(8)} ⚔60→${pve[fk].p60}  ⚔160→${pve[fk].p160}`);
  const p60s = fkeys.map(fk => pve[fk].p60).sort((x, y) => x - y);
  const med = p60s[Math.floor(p60s.length / 2)];
  console.log(`  medián ⚔60: ${med}; pásmo ±35 %: ${Math.round(med * 0.65)}–${Math.round(med * 1.35)}`);
  console.log("\nINFO — síla frakčních jednotek při stejném velení (zrcadla bez hrdinů, skóre −7..+7):");
  const sj = silaJednotek();
  for (const fk of Object.keys(sj)) console.log(`  ${fk.padEnd(8)} ${sj[fk] > 0 ? "+" + sj[fk] : sj[fk]}`);
  console.log("  (přeladění FACTION_UNITS = samostatné rozhodnutí — hýbe kotvami křivky dobývání)");
}
