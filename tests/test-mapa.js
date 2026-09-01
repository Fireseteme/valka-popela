// Test čtvercové mapy „na koso" (v0.21), velkých stop staveb (v0.22)
// a osmi výsečí dvojnásobného světa (v0.23).
// Hlídá: geometrii světa, těsnost hradeb a řek, mosty, integritu bloků
// 3×3 / 2×2 a šíření dobytí na celý blok.
const g = require("../js/game.js");

let prošlo = 0, selhalo = 0;
const test = (jmeno, ok) => {
  if (ok) { prošlo++; }
  else { selhalo++; console.log("  ❌ " + jmeno); }
};
const sada = jmeno => console.log("\n=== " + jmeno + " ===");

g.newGame(0, [0]);
const G = g.G;
const key = (q, r) => q + "," + r;
const at = (q, r) => G.tiles.get(key(q, r));
const T = [...G.tiles.values()];
const PRUCHOZI = { plains: 1, forest: 1, hills: 1, ruins: 1, bridge: 1 };
const pass = t => t && PRUCHOZI[t.terrain];

sada("1. Geometrie světa (v0.23: 8 výsečí, vše 2×)");
const KAPITALY = [[23,9],[9,23],[-23,-9],[-9,-23],[-9,23],[23,-9],[-23,9],[9,-23]];
// v0.40: most je DVOJICE polí na protilehlých březích (8 přechodů = 16 polí)
const MOSTY = g.BRIDGE_KEYS;
test("69×69 = 4761 polí", T.length === 4761);
test("8 kapitálů v osminách světa", KAPITALY.every(c => at(c[0],c[1]).structure === "capital"));
test("trůn ve středu", at(0,0).structure === "throne");
const cnt = {};
for (const t of T) if (t.structure) cnt[t.structure] = (cnt[t.structure] || 0) + 1;
test("4 pevnosti, 8 grandfortů, 32 bastionů", cnt.fortress === 4 && cnt.grandfort === 8 && cnt.bastion === 32);
// ETAPA 7: k osmi laterálním přechodům (16 polí) přibyl DĚLIČ KOLÉBKY —
// tři přechody na výseč, tedy 8 × 3 × 2 = 48 dalších mostních polí.
// v0.69: ty tři už nestojí vedle sebe, ale jsou ROZHOZENÉ po svém úseku řeky
// (každý v jedné třetině, uvnitř třetiny náhodně) — počet se tím nemění.
const kolebkove = MOSTY.filter(k => g.jeKolebkovyMost(G.tiles.get(k)));
test("laterálních přechodů je pořád 8 (16 polí)", MOSTY.length - kolebkove.length === 16);
test("dělič kolébky má 8 přechodů po třech párech (48 polí)", kolebkove.length === 48);
test("všechna mostní pole existují a jsou mosty", cnt.bridge === MOSTY.length
  && MOSTY.every(k => G.tiles.get(k).terrain === "bridge"));
test("každý most má protějšek na druhém břehu a je s ním spojený", MOSTY.every(k => {
  const b = G.tiles.get(k), twin = g.bridgeTwin(b);
  return twin && twin.structure === "bridge"
    && g.neighborsOf(b).includes(twin) && g.neighborsOf(twin).includes(b);
}));
// most má t.riv (směr koryta POD ním, kvůli modelu), ale nesmí být voda
// ani součástí říčního pásu
test("mosty stojí na souši, ne ve vodě", MOSTY.every(k => {
  const b = G.tiles.get(k);
  return b.terrain === "bridge" && !!b.riv && !g.riverKeys().has(k);
}));
// v0.41: most musí sousedit s VODOU. Ve v0.40 se posun u úhlopříčných řek
// sčítal do obou souřadnic, takže čtyři mosty stály dvě pole na suchu a lávka
// neměla co překlenout.
test("každý most stojí u vody", MOSTY.every(k => {
  const b = G.tiles.get(k);
  return [[1,0],[-1,0],[0,1],[0,-1]].some(d => {
    const n = at(b.q + d[0], b.r + d[1]);
    return n && n.terrain === "water";
  });
}));
// Šířka přechodu je do modelu lávky ZAPEČENÁ (obě půlky se potkají nad středem
// toku), takže smí mít jen dvě hodnoty: úhlopříčné řeky 4 DIAG ve světových
// osách, osové 4·√2 DIAG. Mřížkový Manhattan je u obou 4 — nerozliší je.
test("přechody mají jen dvě šířky (podle nich se volí model lávky)", MOSTY.every(k => {
  const b = G.tiles.get(k), tw = g.bridgeTwin(b);
  const dq = tw.q - b.q, dr = tw.r - b.r;
  const d = Math.hypot(dq - dr, dq + dr);
  return Math.abs(d - (b.riv === "a" || b.riv === "b" ? 4 : 4 * Math.SQRT2)) < 1e-9;
}));
// laterální most je SPORNÁ HRANICE (velitelé 35), kolébkový přechod jsou
// VLASTNÍ vrata rodu — patří mu od začátku a velitele má jen po neutralizaci
test("laterální břehy brání dvě armády velitelů úrovně 35", MOSTY.every(k => {
  const b = G.tiles.get(k);
  if (g.jeKolebkovyMost(b)) return true;
  return g.dveArmady(b) && b.garrison === g.STRUCTURES.bridge.militia
    && g.neutralCommander(b, 0).level === g.BRIDGE_LEVEL
    && g.neutralCommander(b, 1).level === g.BRIDGE_LEVEL;
}));
// v0.69 (zadání uživatele): přechod se musí NEJDŘÍV DOBÝT. Neutrální je ten
// břeh, který leží v EXPANZNÍM pásu — to je brána ven. Vnější břeh je
// v nedotknutelné kolébce, kam cizí rod stejně nevstoupí, takže zůstává rodu.
test("vnitřní břeh přechodu je neutrální a brání se", kolebkove.every(k => {
  const b = G.tiles.get(k);
  if (Math.abs(b.q) + Math.abs(b.r) > g.kolebkaR()) return true;   // vnější břeh
  return b.owner === -1 && b.garrison === g.KOLEBKA_MOST_MILICE;
}));
test("vnější břeh v kolébce patří své výseči", kolebkove.every(k => {
  const b = G.tiles.get(k);
  if (Math.abs(b.q) + Math.abs(b.r) <= g.kolebkaR()) return true;  // vnitřní břeh
  return b.owner === g.oktantOf(b.q, b.r) && b.garrison === 0;
}));
test("přechod není uzel na dvě armády (je to první objektiv, ne brána)",
  kolebkove.every(k => !g.dveArmady(G.tiles.get(k))));
test("kolébkový přechod je měkčí než laterální most",
  g.KOLEBKA_MOST_MILICE < g.STRUCTURES.bridge.militia
  && g.KOLEBKA_MOST_LEVEL < g.BRIDGE_LEVEL);
// řeka je pás tří polí: kolmo přes osové koryto musí ležet 3 vodní pole
{
  const rez = [];
  for (let r = -1; r <= 1; r++) rez.push(at(25, r));
  // ⚠ Kontrolní řez se musí dělat MIMO prstencový dělič kolébky (Manhattan
  // kolebkaR ± 1), jinak jsou i pole „za pásem" voda a test měří dělič.
  const q = g.kolebkaR() + 6;                       // hluboko v kolébce
  const rez2 = [-1, 0, 1].map(r => at(q, r));
  const nad = at(q, 2), pod = at(q, -2);
  test("řeka je pás 3 polí (kolmý řez mimo dělič)",
    rez2.every(t => t && t.terrain === "water") && g.RIVER_HALF === 1
    && [nad, pod].every(t => t && !g.riverKeys().has(key(t.q, t.r))));
}

sada("2. Průchodnost a těsnost");
// ⚠ Průchod MUSÍ jít přes neighborsOf, ne přes offsety souřadnic: mostní
// dvojice leží čtyři pole od sebe a spojuje je až bridgeTwin. Do etapy 7 to
// nevadilo (kolem prstence se dalo obejít), ale prstencový dělič kolébky
// zavírá výseč úplně — bez dvojic mostů se z trůnu k žádnému kapitálu nedá.
const flood = (sq, sr, extra) => {
  const seen = new Set([key(sq, sr)]);
  const st = [at(sq, sr)];
  while (st.length) {
    const t = st.pop();
    for (const n of g.neighborsOf(t)) {
      if (n && pass(n) && (!extra || extra(n)) && !seen.has(key(n.q, n.r))) {
        seen.add(key(n.q, n.r)); st.push(n);
      }
    }
  }
  return seen;
};
const R = flood(0, 0);
test("všech 8 kapitálů dosažitelných z trůnu", KAPITALY.every(c => R.has(key(c[0], c[1]))));
// bez mostů a bran se výseče rozpadnou — z aldaru nikam
const bezBran = t => t.terrain !== "bridge" && !["fortress","grandfort","bastion","throne"].includes(t.structure);
const Q = flood(23, 9, bezBran);
test("bez mostů a bran všech 8 výsečí těsní", KAPITALY.slice(1).every(c => !Q.has(key(c[0], c[1]))));
// v0.40: každé mostní pole musí mít průchozího souseda NA SVÉ STRANĚ řeky
// (mimo protějšek) — jinak by přechod ústil do slepé vody
let brehyOk = true;
for (const k of MOSTY) {
  const b = G.tiles.get(k);
  const suchi = [[1,0],[-1,0],[0,1],[0,-1]].map(d => at(b.q + d[0], b.r + d[1]))
    .filter(n => n && pass(n) && n.structure !== "bridge");
  if (!suchi.length) brehyOk = false;
}
test("každý most ústí na souš svého břehu", brehyOk);

sada("2b. Zábor po rozích (v0.41) — hradby a řeky musí těsnit i tak");
// zábor uznává i ROHOVÉ sousedy, ale jen když je aspoň jedno z obou polí mezi
// nimi průchozí. Bez toho pravidla by šlo proklouznout mezi dvěma poli
// hradebního prstence (ta se dotýkají jen rohy) a obejít brány.
{
  const volne = T.find(t => pass(t) && !t.structure && !t.big && !t.bigSize
    && [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]
      .every(d => { const n = at(t.q + d[0], t.r + d[1]); return n && pass(n); }));
  test("na volném poli je osm sousedů pro zábor", !!volne && g.sousediZaboru(volne).length === 8);
  // sevřený roh: obě pole mezi mnou a rohem neprůchodná → roh se neuznává
  const stred = at(volne.q, volne.r);
  const puvodni = [at(stred.q + 1, stred.r).terrain, at(stred.q, stred.r + 1).terrain];
  at(stred.q + 1, stred.r).terrain = "water";
  at(stred.q, stred.r + 1).terrain = "water";
  test("roh mezi dvěma neprůchodnými poli se neuznává",
    !g.rohoviSousedi(stred).includes(at(stred.q + 1, stred.r + 1)));
  at(stred.q + 1, stred.r).terrain = puvodni[0];
  at(stred.q, stred.r + 1).terrain = puvodni[1];
}
// flood přes hrany I rohy: bez bran a mostů se ani tak nesmí prolézt
const flood8 = (sq, sr, extra) => {
  const seen = new Set([key(sq, sr)]);
  const st = [at(sq, sr)];
  while (st.length) {
    const t = st.pop();
    for (const n of g.sousediZaboru(t)) {
      if (!pass(n) || (extra && !extra(n))) continue;
      const k = key(n.q, n.r);
      if (!seen.has(k)) { seen.add(k); st.push(n); }
    }
  }
  return seen;
};
const Q8 = flood8(23, 9, bezBran);
test("po rozích: bez mostů a bran všech 8 výsečí těsní",
  KAPITALY.slice(1).every(c => !Q8.has(key(c[0], c[1]))));
test("po rozích: prstenec hradeb těsní (dovnitř se nedá proklouznout)",
  ![...Q8].some(k => {
    const [q, r] = k.split(",").map(Number);
    return Math.abs(q) + Math.abs(r) < g.OUTER_R;
  }));

sada("3. Bloky staveb (5×5 / 3×3 / 2×2)");
const kotvy = T.filter(t => t.bigSize), cleny = T.filter(t => t.big);
const k5 = kotvy.filter(t => t.bigSize === 5);
const k3 = kotvy.filter(t => t.bigSize === 3), k2 = kotvy.filter(t => t.bigSize === 2);
// ETAPA 7: svobodná města nahradily KEEPY KRAJŮ — jeden na kraj, 5×5
// (na stísněných krajích spadne na 3×3, viz placeKeeps)
const keepy = T.filter(t => t.structure === "keep");
test("keep je v každém z devíti krajů", keepy.length === 9);
test("keepy jsou bloky 5×5 nebo 3×3", keepy.every(t => t.bigSize === 5 || t.bigSize === 3));
test("svobodná města se už negenerují", !cnt.city);
test("3×3: trůn + 8 kapitálů + tísněné keepy",
  k3.length === 9 + keepy.filter(t => t.bigSize === 3).length && k3.every(t => t.structure));
test("2×2 pole existují (jen stupeň 9+)", k2.length >= 4 && k2.every(t => t.level >= 9 && !t.structure));
test("počet členů sedí", cleny.length === k5.length * 24 + k3.length * 8 + k2.length * 3);
let clenOk = true, prekryv = 0;
const videne = new Set();
for (const a of kotvy) for (const k of a.bigKeys) {
  if (videne.has(k)) prekryv++;
  videne.add(k);
  const m = G.tiles.get(k);
  if (!m || m.big !== key(a.q, a.r) || m.garrison !== 0 || m.level !== a.level
    || m.res !== a.res || m.owner !== a.owner || !pass(m)) clenOk = false;
}
test("členové: kotva, posádka 0, stejný stupeň/surovina/vlastník", clenOk);
test("bloky se nepřekrývají", prekryv === 0);
// v0.30: 1×1 pole 9+ už neexistují — dvojnásobek se měří proti tabulce posádek
test("2×2 posádka je dvojnásobná (dvě armády)",
  k2.every(t => t.garrison === 2 * g.TIER_GARRISON[t.level - 1]));
test("žádné holé 1×1 pole síly 200+ (uzly jsou vždy 2×2)",
  !T.some(x => !x.big && !x.bigSize && !x.structure && x.level >= 9 && pass(x)));
test("uzly mají konkrétní surovinu (ne „all“)", k2.every(t => t.res && t.res !== "all"));
// žíla je garantovaná, kde má prstenec vůbec kam růst (kraje, řeky a stavby
// mohou uzel sevřít) — proto se měří proti počtu způsobilých sousedů
let zilProslo = true, zilSoucet = 0;
for (const a of k2) {
  const cleny = [a, ...a.bigKeys.map(k => G.tiles.get(k))];
  const videne = new Set();
  let stejnych = 0, zpusobilych = 0;
  for (const m of cleny)
    for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = G.tiles.get(key(m.q + dq, m.r + dr));
      if (!n || n.big || n.bigSize || videne.has(key(n.q, n.r))) continue;
      videne.add(key(n.q, n.r));
      if (n.structure || n.riv || !pass(n) || n.owner !== -1) continue;
      zpusobilych++;
      if (n.res === a.res) stejnych++;
    }
  zilSoucet += stejnych;
  if (stejnych < Math.min(2, zpusobilych)) zilProslo = false;
}
test("žíla: u uzlu min(2, způsobilé okolí) polí stejné suroviny", zilProslo);
test("žíla: průměrně ≥3 pole na uzel", k2.length > 0 && zilSoucet / k2.length >= 3);
test("strop výsečí: level-12 uzel max 1× od suroviny na výseč", (() => {
  const stropy = new Set();
  for (const a of k2) {
    if (a.level !== 12 || Math.abs(a.q) + Math.abs(a.r) <= 16) continue;
    const klic = g.zonaOf(a) + ":" + a.res;
    if (stropy.has(klic)) return false;
    stropy.add(klic);
  }
  return true;
})());
test("uzly nesousedí (nikdy vedle sebe)", (() => {
  const cleny = new Map();
  for (const a of k2) for (const m of [a, ...a.bigKeys.map(k => G.tiles.get(k))])
    cleny.set(key(m.q, m.r), key(a.q, a.r));
  for (const [k, ak] of cleny) {
    const [q, r] = k.split(",").map(Number);
    for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const s = cleny.get(key(q + dq, r + dr));
      if (s && s !== ak) return false;
    }
  }
  return true;
})());
test("ochranná zóna hradů (Manhattan 5 bez uzlů)", (() => {
  const kapClen = T.filter(t => t.structure === "capital")
    .flatMap(c => [c, ...(c.bigKeys || []).map(k => G.tiles.get(k))]);
  return !k2.some(a => [a, ...a.bigKeys.map(k => G.tiles.get(k))]
    .some(m => kapClen.some(c => Math.abs(c.q - m.q) + Math.abs(c.r - m.r) <= 5)));
})());
// v0.69: rodu patří blok kapitálu (9 polí) a VNĚJŠÍ břehy tří přechodů (3),
// vnitřní břehy jsou neutrální a musí se dobýt
test("rod vlastní blok kapitálu (9) a vnější břehy přechodů (3)",
  T.filter(t => t.owner === 0).length === 12
  && T.filter(t => t.owner === 0 && t.structure === "bridge").length === 3);

sada("4. Dobytí bloku (přes člena)");
// najdi blok, jehož člen má volného souseda (mezi prstenci je hustě)
let a2, clen, soused;
for (const kand of k2) {
  // ETAPA 7: do CIZÍ kolébky se nedá útočit ani na neutrální blok
  if (g.jeCiziKolebka(G.factions[0], kand)) continue;
  for (const mk of kand.bigKeys) {
    const m = G.tiles.get(mk);
    const sn = T.find(t => Math.abs(t.q - m.q) + Math.abs(t.r - m.r) === 1
      && !t.big && !t.bigSize && t.owner === -1 && !t.structure && pass(t));
    if (sn) { a2 = kand; clen = m; soused = sn; break; }
  }
  if (a2) break;
}
soused.owner = 0; soused.garrison = 0;
// v0.29: bloky u středu jsou mimo REACH kapitálu — hrdina potřebuje základnu
soused.structure = "outpost"; soused.outpost = { inf: 0, arch: 0, cav: 0 };
G.faze = 4; // v0.30: bloky u středu jsou v zamčené zóně — test zkouší dobývání
const me = G.factions[0];
me.resources.gold = 9999;
const h = me.heroes[0];
h.level = 50; h.hp = 5000; h.stamina = 120;
h.pos = key(soused.q, soused.r);
h.zakladna = key(soused.q, soused.r);
h.army = { inf: 900, arch: 900, cav: 900 };
test("pochod na člena se přesměruje na kotvu",
  g.startMarch(me, clen, null, 0) && me.marches[0].targetKey === key(a2.q, a2.r));
me.marches[0].ticksLeft = 1;
g.doTick();
test("dobytím kotvy padá celý blok", a2.owner === 0 && a2.bigKeys.every(k => G.tiles.get(k).owner === 0));

sada("HRADBY JSOU DVĚ POLE ŠIROKÉ — brána je JEDINÝ průchod (v0.69)");
{
  // Jedna řada zdi se dala obejít ROHEM hned vedle brány: úhlopříčný krok mění
  // Manhattanovu vzdálenost o 0 nebo ±2, takže jednu vrstvu přeskočil a pevnost
  // přestala být jedinou cestou k Trůnu. Platilo to na VŠECH velikostech mapy.
  // Dvě řady to zavřou geometrií, aniž by přibylo, o co se musí bojovat.
  const BRANY = new Set(["grandfort", "fortress", "bastion"]);
  const kluc = (q, rr) => q + "," + rr;
  const PRUCHOZI_CHODBA = new Set([[g.WALL_R + 1, 0], [0, g.WALL_R + 1],
    [-(g.WALL_R + 1), 0], [0, -(g.WALL_R + 1)]].map(([q, rr]) => kluc(q, rr)));
  const dojdeK = (R, zakazane) => {
    g.setMapRadius(R); g.setSeasonHours(1); g.newGame(0, 42, null);
    const pruchozi = t => t && g.TERRAIN[t.terrain].passable
      && !(t.structure && zakazane.has(t.structure));
    const s = g.CAPITAL_POS[0];
    const start = zakazane.has("fortress") && zakazane.size === 1
      ? [...G.tiles.values()].find(t => Math.abs(t.q) + Math.abs(t.r) === g.OUTER_R - 1 && pruchozi(t))
      : G.tiles.get(kluc(s.q, s.r));
    if (!start) return false;
    const videno = new Set([kluc(start.q, start.r)]);
    const fronta = [start];
    while (fronta.length) {
      const t = fronta.shift();
      if (t.q === 0 && t.r === 0) return true;
      for (const n of g.sousediZaboru(t)) {
        const k = kluc(n.q, n.r);
        if (videno.has(k) || !pruchozi(n)) continue;
        videno.add(k); fronta.push(n);
      }
    }
    return false;
  };
  for (const R of [34, 60, 230]) {
    const strana = 2 * R + 1;
    // 1) cesta k Trůnu VŮBEC existuje — jinak je sezóna nevyhratelná
    test(`${strana}×${strana}: k Trůnu vede cesta`, dojdeK(R, new Set()));
    // 2) ale ne bez brány
    test(`${strana}×${strana}: bez vstupu na bránu se k Trůnu nedá`,
      !dojdeK(R, BRANY));
    // 3) a ani z mezikruží se vnitřní hradba neobejde
    test(`${strana}×${strana}: pevnost se nedá obejít rohem`,
      !dojdeK(R, new Set(["fortress"])));
  }
  // hradba má opravdu dvě řady a brána vede skrz obě
  g.setMapRadius(34); g.newGame(0, 42, null);
  const naVzdalenost = d => [...G.tiles.values()].filter(t => Math.abs(t.q) + Math.abs(t.r) === d);
  // v0.69 je druhá řada PŘÍKOP, ne zeď: dvě řady hradeb by na obrazovce
  // vypadaly jako dvě zdi za sebou, kdežto zeď s příkopem čte jako jedna.
  {
    const zed = naVzdalenost(g.WALL_R);
    const prikop = naVzdalenost(g.WALL_R + 1);
    const zdi = zed.filter(t => t.terrain === "wall").length;
    const vody = prikop.filter(t => t.terrain === "water").length;
    test(`hradba je zeď na Manhattan ${g.WALL_R} (${zdi}/${zed.length})`,
      zdi >= zed.length - 4);
    test(`před ní je příkop na Manhattan ${g.WALL_R + 1} (${vody}/${prikop.length})`,
      vody >= prikop.length - 4);
    test("obě řady jsou neprůchodné",
      zed.concat(prikop).every(t => !g.TERRAIN[t.terrain].passable
        || t.structure === "fortress" || PRUCHOZI_CHODBA.has(t.q + "," + t.r)));
  }
  test("hráz k bráně je průchozí přes příkop",
    [[g.WALL_R + 1, 0], [0, g.WALL_R + 1], [-(g.WALL_R + 1), 0], [0, -(g.WALL_R + 1)]]
      .every(([q, rr]) => g.TERRAIN[G.tiles.get(kluc(q, rr)).terrain].passable));
  g.setMapRadius(34);
}


console.log(`\n${selhalo ? "❌" : "✅"} ${prošlo} testů prošlo, ${selhalo} selhalo`);
if (selhalo) process.exit(1);
