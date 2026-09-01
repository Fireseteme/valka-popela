"use strict";
/* Válka popela — vykreslování mapy.

   TŘI vrstvy nad sebou (odspodu):
   1. #map3d — terén a stavby jako skutečné 3D modely (three.js, js/render3d.js).
      Sem se od v0.16 přesunulo všechno, co dřív kreslily izo-sprity.
   2. mapLayer — offscreen 2D plátno se vším, co se mění jen jednou za tik:
      nádech území a hranice, jmenovky ⚔, filtry mapy, mlha války.
   3. #map — 2D překryv kreslený každý snímek: výběr, hover, figurky hrdinů,
      pochody, praporky, efekty ultimátek, bitvy, popelná bouře.

   Vrstvy 2 a 3 se kreslí ve stejné souřadné soustavě jako dřív (tileToPixel).
   3D kamera je nastavená tak, aby promítala PŘESNĚ do ní — viz komentář
   v render3d.js. Díky tomu se v main.js ani v překryvech nemuselo nic měnit. */

const HEX_SIZE = 26;      // poloměr hexu ve world pixelech
const MAP_SCALE = 3;      // supersampling statické vrstvy (zoom až 5× — ať se terén nerozmaže)

// izometrie: sprity jsou renderované kamerou nakloněnou o 55°, mapa se proto
// svisle stlačuje stejným poměrem — logika mřížky se nemění
const ISO_SQUASH = Math.cos(55 * Math.PI / 180);
const camera = { x: 0, y: 0, zoom: 1 };
let canvas, ctx;
let hoverKey = null;
let selectedKey = null;
let selectedMarchHero = null; // heroIdx vybraného vlastního pochodu (klik na kolonu)
let marchPreview = null;      // {from:{q,r}, to:{q,r}, color} — průhledná plánovaná trasa
let reachPreview = null;      // {q, r, color} — základna hrdiny: diamant dosahu REACH (v0.29)

let mapLayer = null, mapCtx = null, mapDrawnTick = -2;
let mapFilter = null; // null | "food" | "wood" | "gold" | "level" | "vztahy"
// DRUHÝ REŽIM MAPY PODLE VZTAHŮ (etapa 11): na světě o stovkách hráčů se
// z barev rodů nedá poznat, kdo je nepřítel — tenhle režim překreslí mapu
// podle DIPLOMACIE, ne podle příslušnosti.
const VZTAH_BARVA = {
  moje: "#e0b83d", spojenec: "#5fc86a", valka: "#d8503c",
  pakt: "#4f8fd8", cizi: "#8a8f98", neutral: null,
};
function vztahPole(t, me) {
  if (t.owner === -1) return "neutral";
  if (t.owner === me.id) return "moje";
  const cizi = G.factions[t.owner];
  if (!cizi) return "cizi";
  if (jsouSpojenci(me, cizi)) return "spojenec";
  if (jeValka(me, cizi.id)) return "valka";
  if (hasPact(me, cizi)) return "pakt";
  return "cizi";
}
let worldMinX = 0, worldMinY = 0, worldW = 0, worldH = 0;
// v0.33: mapLayer už nekryje celý svět, ale jen VÝŘEZ kolem kamery —
// celosvětový rastr měl při MAP_R 34 přes 100 Mpx (~394 MB, Firefox má strop
// plátna ~124 Mpx) a pro větší mapy by vůbec nešel založit
let layerMinX = 0, layerMinY = 0, layerW = 0, layerH = 0, layerS = 1;
let fogTik = -1;   // R3.setFog (průchod všech 3D instancí) jen 1× za tik, ne s každým výřezem

// 3D vrstva (js/render3d.js). map3dPodpis drží, z čeho je postavená mapa —
// přestavuje se jen při změně terénu či staveb, ne každý tik.
let map3dReady = false;
let map3dPodpis = null;

// postaví (nebo přestaví) 3D mapu, když se změnil terén, stavby či rekvizity
let map3dTik = -1; // mapModelList je průchod celé mapy — po první stavbě už jen 1× za tik
function ensureMap3D() {
  if (!map3dReady || !R3.ready || !G.tiles.size) return;
  if (map3dPodpis && map3dTik === G.tick) return; // do první stavby pollovat každý snímek
  map3dTik = G.tick;
  const { dilky, podpis } = mapModelList();
  if (podpis === map3dPodpis) return;
  map3dPodpis = podpis;
  R3.build(dilky);
  mapDrawnTick = -2;   // s novým terénem překreslit i 2D vrstvu (nouzová mapa)
  // ⚠ build() vrátil instanceColor na odstín pole, tedy faktor mlhy 1 — a HNED
  // pod tímhle voláním se v draw() kreslí snímek. Samotné `fogTik = -1` nestačí:
  // to jen řekne „nanést při nejbližším setFog", jenže drawFogOverlay běží až
  // ZA R3.render(), takže by se jeden hotový snímek ukázal s CELOU mapou
  // odhalenou — včetně cizích staveb, které mlha války má krýt. Nanáší se proto
  // rovnou tady, ještě před vykreslením.
  R3.setFog(fogFactor);
  fogTik = G.tick;
}


// ---------- cesty mezi vlastními poli (v0.64, PLAN IV-J bod 5) ----------
// Síť roste se záborem: pole téhož majitele se propojí KOSTROU vedoucí
// od jeho staveb ven. Kreslí se všem rodům, ne jen hráči — je to infrastruktura
// v krajině, ne prapor, a co hráč nemá prozkoumané, stejně skryje mlha války
// (setCesty předá klíče polí a R3 na ně nanese tutéž mlhu jako na terén).
//
// ⚠ Přes MOST se cesta nevede, i když most je v grafu hrana (bridgeTwin).
// Lávka má vlastní výšku i sklon a plochý pás v úrovni země by nad řekou
// visel ve vzduchu. Most sám o sobě čte jako přechod dost dobře.
let cestyTik = -1, cestyPodpis = null;

// Kudy se dá vyšlapat pěšina. Voda ne (přes tu vede most), val hradby ne
// (je to zeď, ne pole).
function nesePesinu(t) {
  return t.owner >= 0 && t.terrain !== "water" && t.terrain !== "wall";
}

function ensureCesty() {
  if (!map3dReady || !R3.ready || !G.tiles.size || !R3.setCesty) return;
  if (cestyTik === G.tick) return;
  cestyTik = G.tick;

  const uzly = [], kam = new Map(), podpis = [];
  for (const t of G.tiles.values()) {
    if (!nesePesinu(t)) continue;
    const k = keyOf(t.q, t.r);
    kam.set(k, uzly.length);
    uzly.push({ key: k, q: t.q, r: t.r, owner: t.owner,
      stavba: !!t.structure, most: t.structure === "bridge" });
    // ⚠ i STAVBA — síť vede mezi stavbami, takže postavená výspa ji musí
    // přestavět, i když se vlastnictví polí nezměnilo
    podpis.push(k + ":" + t.owner + (t.structure ? ":" + t.structure : ""));
  }
  const p = podpis.join("|");
  if (p === cestyPodpis) return;
  cestyPodpis = p;

  // ⚠ NE mezi každou dvojicí sousedů. Souvislý blok území má souseda na každé
  // vnitřní hranici, takže „úsek mezi každými dvěma sousedy" nakreslí přes
  // celé území pravidelnou MŘÍŽKU — změřeno 21,9 % plochy obrazovky při zoomu
  // 3,2, a protože středy sousedních polí leží ve směru HRAN kosočtverce, ta
  // mřížka se navíc kryje s mřížkou dlaždic a čte se jako obtažené hranice.
  // Kostra přes všechna pole je jen o polovinu řidší a vypadá stejně.
  //
  // Cesta je proto to, co cesta ve skutečnosti je: SPOJNICE STAVEB. Vede
  // z kapitálu k městům, výspám a pevnostem NEJKRATŠÍ CESTOU PŘES VLASTNÍ
  // PŮDU, takže se objeví, až když má co spojovat — a s každou další výspou
  // síť povyroste. Prázdné pole cestu nedostane; není kam by vedla.
  const useky = [], hrany = new Set();
  const sousedi = i => {
    const u = uzly[i], ven = [];
    for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const j = kam.get(keyOf(u.q + dq, u.r + dr));
      if (j !== undefined && uzly[j].owner === u.owner) ven.push(j);
    }
    return ven;
  };
  const stavby = new Map();          // majitel → [indexy staveb]
  uzly.forEach((u, i) => {
    if (!u.stavba) return;
    if (!stavby.has(u.owner)) stavby.set(u.owner, []);
    stavby.get(u.owner).push(i);
  });
  for (const [, seznam] of stavby) {
    if (seznam.length < 2) continue;   // jedna stavba nemá kam vést
    // ⚠ Území rodu NENÍ souvislé — mostní břehy jsou samostatné ostrůvky
    // (voda cestu nenese), takže jediný průchod z první stavby by u rodu,
    // jehož prvním nalezeným polem je most, nenašel VŮBEC NIC. Proto se
    // komponenty berou po jedné, dokud je co spojovat.
    const zbyva = new Set(seznam);
    while (zbyva.size > 1) {
      // kořen: nejdřív skutečné sídlo, most až kdyby nic jiného nezbylo
      let koren = -1;
      for (const i of zbyva) if (koren < 0 || (uzly[koren].most && !uzly[i].most)) koren = i;
      // Průchod do šířky dá strom nejkratších cest; ostatní stavby se pak
      // jen vrátí po rodičích. Sjednocení těch cest je síť.
      const rodic = new Int32Array(uzly.length).fill(-1);
      const videl = new Uint8Array(uzly.length);
      videl[koren] = 1;
      const fronta = [koren];
      for (let f = 0; f < fronta.length; f++) {
        for (const j of sousedi(fronta[f])) {
          if (videl[j]) continue;
          videl[j] = 1; rodic[j] = fronta[f]; fronta.push(j);
        }
      }
      for (const cil of seznam) {
        if (!videl[cil]) continue;
        zbyva.delete(cil);
        let k = cil;
        while (rodic[k] >= 0) {
          const a = Math.min(k, rodic[k]), b = Math.max(k, rodic[k]);
          const klic = a + "-" + b;
          if (hrany.has(klic)) break;    // dál už síť vede, netřeba pokračovat
          hrany.add(klic); useky.push([a, b]);
          k = rodic[k];
        }
      }
    }
  }
  R3.setCesty(uzly, useky);
}

// ---------- assety ----------
// Terén a stavby jsou od v0.16 3D modely (art/models/, načítá render3d.js).
// Jako obrázky zůstaly UŽ JEN figurky hrdinů — ty se pořád kreslí do 2D
// překryvu, takže se sprity zahodit nedají. Ušetřilo to ~12 MB při načtení.
const ASSET_FILES = {};
for (const b of ["aldar", "yllien", "durgar", "horda", "brakkar", "sarn", "vhorren", "gryk"])
  for (let i = 0; i < 6; i++)
    ASSET_FILES[`hero_${b}_${i}`] = `art/render/hero_${b}_${i}.png`;
ASSET_FILES.hero_militia = "art/render/hero_militia.png";
const ASSETS = {};
let assetsReady = false;

function loadAssets() {
  const keys = Object.keys(ASSET_FILES);
  let pending = keys.length;
  for (const k of keys) {
    const img = new Image();
    img.onload = () => { if (--pending === 0) { assetsReady = true; mapDrawnTick = -2; } };
    img.onerror = () => { if (--pending === 0) { assetsReady = true; mapDrawnTick = -2; } };
    img.src = ASSET_FILES[k];
    ASSETS[k] = img;
  }
}

// biom pole podle polohy: střed za hradbami je popel Vellaru, jinak kvadrant
// nejbližšího hlavního města (démoni sopky, orkové železo, elfové zeleň…)
function biomeOf(q, r) {
  if (gridDist({ q, r }, { q: 0, r: 0 }) < WALL_R) return "center";
  let best = 0, bd = 1e9;
  for (let i = 0; i < CAPITAL_POS.length; i++) {
    const d = gridDist({ q, r }, CAPITAL_POS[i]);
    if (d < bd) { bd = d; best = i; }
  }
  return FACTION_DEFS[best].key;
}

// jméno 3D modelu pro pole (dřív to byl obrázek spritu — logika je stejná)
// od v0.25 mají všechny rody vlastní biomové dlaždice; mapa výpůjček zůstává
// jako mechanismus pro případné budoucí frakce bez vlastního artu
const BIOME_LOOK = {};

function tileModel(t) {
  if (t.structure && t.structure !== "bridge") {
    if (t.structure === "capital") {
      const i = CAPITAL_POS.findIndex(p => p.q === t.q && p.r === t.r);
      // přesídlený kapitál (vykořenění) už na původních souřadnicích nesedí —
      // model urči podle majitele
      const fk = i >= 0 ? FACTION_DEFS[i].key
        : (t.owner >= 0 ? FACTION_DEFS[t.owner].key : "aldar");
      return "capital_" + fk;
    }
    // keep kraje (etapa 7) zatím nemá vlastní model — jede na velké pevnosti.
    // Výtvarný dluh: keep 5×5 si zaslouží vlastní stavbu.
    if (t.structure === "keep") return "grandfort";
    return t.structure; // city, throne, fortress, outpost, grandfort, bastion
  }
  switch (t.terrain) {
    // v0.41: vodní pole je HLADKÁ DESKA přes celé pole — sousedi na sebe
    // dosednou hranou a řeka i jezero jsou jedna plocha. Písek se přidává
    // zvlášť (river_bank) jen na hrany, za kterými voda končí.
    // PŘÍKOP PRSTENCE (v0.69) se kreslí jako KORYTO od rohu k rohu, ne jako
    // plná deska: pole na vrstevnici Manhattanu se dotýkají jen rohy, takže by
    // z desek byl řetěz samostatných kaluží. Koryto se v rohu potká se
    // sousedním a příkop běží souvisle — přesně jako val hradby vedle něj.
    // Na osách zůstává deska: tam prstenec zatáčí a plná voda roh vyplní.
    case "water": {
      const mm = Math.abs(t.q) + Math.abs(t.r);
      if (mm === OUTER_R + 1 || mm === WALL_R + 1)
        return (t.q === 0 || t.r === 0) ? "river_flat"
          : (t.q > 0) === (t.r > 0) ? "river_a" : "river_b";
      return "river_flat";
    }
    // most stojí na BŘEHU, ne ve vodě: zem pod ním je obyčejný dílek biomu
    // a nástavbu (hlava + lávka) přidává prislusenstvi() natočenou k protějšku
    case "bridge": return biomModel(t, "plains");
    // val hradby běží od rohu k rohu; kvadranty se shodnými znaménky souřadnic
    // mají hranu prstence podél světové X (wall_a), zbylé podél Z (wall_b)
    case "wall":   return (t.q === 0 || t.r === 0) ? "wall_c"
      : (t.q > 0) === (t.r > 0) ? "wall_a" : "wall_b";
    case "ruins":  return "ruins";
    default:       return biomModel(t, t.terrain);
  }
}

function biomModel(t, terrain) {
  const b = biomeOf(t.q, t.r);
  return (BIOME_LOOK[b] || b) + "_" + terrain;
}

// Světové úhly 3D scény: pole (q,r) leží na (x,z) = DIAG·(q−r, q+r), takže
// směr k sousedovi se spočítá rovnou z rozdílu mřížkových souřadnic. Modely
// břehu a mostu jsou autorsky natočené k sousedovi −q (úhel −135°) a R3 je
// otáčí kolem svislé osy o `rot`, což z úhlu ODEČÍTÁ.
const UHEL_AUTORA = -3 * Math.PI / 4;
const otoceniNa = (dq, dr) => UHEL_AUTORA - Math.atan2(dq + dr, dq - dr);

// Kusy navíc na jedno pole (v0.41): břeh na každou hranu, za kterou voda
// končí — tím drží hladina pohromadě a písek leží jen na skutečném pobřeží;
// u mostu jeho nástavba natočená k protějšímu břehu.
const BREHY = ["river_bank", "river_bank_b", "river_bank_c"];

// Která varianta břehu na pole padne. Kusy podél jednoho pobřeží mají stejnou
// otočku, takže by se bez tohohle opakoval jeden vzor oblázků dílek po dílku.
function brehVarianta(q, r, i) {
  let h = 2166136261;
  for (const v of [q, r, i]) { h ^= v & 255; h = Math.imul(h, 16777619); }
  return BREHY[(h >>> 9) % BREHY.length];
}

function prislusenstvi(t) {
  if (t.terrain === "water") {
    const ven = [];
    for (let i = 0; i < DIRS4.length; i++) {
      const [dq, dr] = DIRS4[i];
      const n = tileAt(t.q + dq, t.r + dr);
      if (n && n.terrain === "water") continue;   // hladina pokračuje dál
      ven.push({ name: brehVarianta(t.q, t.r, i), rot: otoceniNa(dq, dr) });
    }
    return ven;
  }
  if (t.terrain === "bridge") {
    const p = bridgeTwin(t);
    if (!p) return [];
    const dq = p.q - t.q, dr = p.r - t.r;
    // Délka lávky je do modelu zapečená (obě půlky se potkají nad středem
    // toku), a přechody nejsou stejně široké: úhlopříčné řeky mají břehy
    // 4·DIAG od sebe, osové 4·STRANA. Rozliší je vzdálenost ve SVĚTOVÝCH
    // osách — mřížkový Manhattan vyjde u obou stejně (4).
    const dlouhy = Math.hypot(dq - dr, dq + dr) > 5;
    return [{ name: dlouhy ? "bridge_long" : "bridge_short", rot: otoceniNa(dq, dr) }];
  }
  return [];
}

// rekvizita suroviny na poli (pšenice, klády, lom, důl, svatyně); mohutnost
// roste s úrovní pole — stejná pravidla jako u dřívějších overlay spritů
function resModel(t) {
  if (t.structure || !t.res || t.terrain === "bridge") return null;
  if (!TERRAIN[t.terrain].passable) return null;
  const band = t.level >= 9 ? 3 : t.level >= 5 ? 2 : 1;
  return `res_${t.res}_${band}`;
}

// Proti tapetě (v0.56, PLAN.md IV-J bod 4). Všechna pole téhož biomu sdílejí
// JEDEN model i JEDNU zapečenou texturu, takže se plocha čte jako kopírovaná
// tapeta — odstín (odstinPole v render3d.js) to jen ztlumí, vzor rekvizit ne.
//
// Dílek je čtverec otočený na obrazovce o 45°, takže otočka o NÁSOBEK 90° ho
// zobrazí na sebe sama: mřížka drží, sousedé lícují, a přesto se rozházejí
// stromy, kameny i vzor textury. Nestojí to nic — instance se otáčejí už kvůli
// rohovým hradbám.
//
// ⚠ SMÍ SE JEN U SYMETRICKÝCH DÍLKŮ. Břehy řek, mosty, hradby i stavby mají
// „předek" a otočka by je rozbila; proto se bere jen holý biomový podklad
// `<rod>_<plains|forest|hills>` a rekvizity surovin.
const OTACIVE = /^(?:[a-z]+_(?:plains|forest|hills)|res_[a-z]+_[123])$/;
function otockaDlazdice(klic) {
  let h = 2166136261;
  for (let i = 0; i < klic.length; i++) { h ^= klic.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 13) & 3) * (Math.PI / 2);
}

// seznam dílků pro 3D vrstvu + podpis, podle kterého se pozná, že je potřeba
// mapu přestavět (mění se jen při stavbě/zboření, ne každý tik)
function mapModelList() {
  const ven = [];
  const podpis = [];
  for (const t of G.tiles.values()) {
    if (t.big) continue;               // člen bloku kreslí zvětšená kotva
    const m = tileModel(t);
    const c = bigCenter(t);
    const sc = t.bigSize || 1;
    // wall_c je autorsky s rameny k +X a +Z; ostatní rohy jsou jeho otočky
    const klic = keyOf(t.q, t.r);
    const rot = m === "wall_c"
      ? (t.q < 0 ? 0 : t.q > 0 ? Math.PI : t.r > 0 ? Math.PI / 2 : -Math.PI / 2)
      // bloky 2×2 a 3×3 se neotáčejí — zvětšená kotva kryje víc polí a otočka
      // by ji posunula mimo blok
      : (sc === 1 && OTACIVE.test(m) ? otockaDlazdice(klic) : 0);
    ven.push({ name: m, q: c.q, r: c.r, s: sc, rot, key: klic });
    const rm = resModel(t);
    if (rm) ven.push({ name: rm, q: c.q, r: c.r, s: sc, key: klic,
      rot: sc === 1 ? otockaDlazdice(klic + "r") : 0 });
    podpis.push(m + (sc > 1 ? "*" + sc : ""), rm || "");
    for (const d of prislusenstvi(t)) {
      ven.push({ name: d.name, q: t.q, r: t.r, s: 1, rot: d.rot, key: klic });
      podpis.push(d.name + "@" + d.rot.toFixed(2));
    }
  }
  return { dilky: ven, podpis: podpis.join("|") };
}

// střed bloku velké stavby (3×3 má kotvu uprostřed, 2×2 v levém dolním rohu)
function bigCenter(t) {
  if (t.bigSize === 2) return { q: t.q + 0.5, r: t.r + 0.5 };
  return { q: t.q, r: t.r };
}

// ---------- souřadnice ----------
// Čtvercová mřížka „na koso": pole (q, r) je na obrazovce kosočtverec.
// Otočku o 45° dělá projekce (q−r, q+r) — data zůstávají rovná mřížka.
// TILE_DIAG = půl úhlopříčky kosočtverce v blenderových jednotkách (√1,5);
// stejnou konstantu má render3d.js (DIAG) a make_tiles.py (DIAG).
const TILE_DIAG = Math.sqrt(1.5);
const KOSO = HEX_SIZE * TILE_DIAG;   // půl úhlopříčky ve world pixelech
function tileToPixel(q, r) {
  return {
    x: KOSO * (q - r),
    y: KOSO * (q + r) * ISO_SQUASH,
  };
}

function pixelToTile(px, py) {
  const u = px / KOSO, v = py / (KOSO * ISO_SQUASH);
  // buňky jsou v (q, r) osově rovné jednotkové čtverce — stačí zaokrouhlit
  return { q: Math.round((u + v) / 2), r: Math.round((v - u) / 2) };
}

function screenToWorld(sx, sy) {
  return {
    x: (sx - canvas.width / 2) / camera.zoom + camera.x,
    y: (sy - canvas.height / 2) / camera.zoom + camera.y,
  };
}

function initRender(canvasEl) {
  canvas = canvasEl;
  ctx = canvas.getContext("2d");
  // 3D vrstva leží POD 2D překryvem; canvas3d je v index.html hned před #map
  const c3 = document.getElementById("map3d");
  if (c3 && window.R3) {
    R3.init(c3);
    map3dReady = true;
  }
  resizeCanvas();
  window.addEventListener("resize", resizeCanvas);
  loadAssets();
}

function resizeCanvas() {
  // rozměr bere z VLASTNÍHO rámečku plátna, ne z rodiče — obě plátna (2D i 3D)
  // mají inset:0, takže dostanou totožnou velikost a 3D s 2D lícuje na pixel
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width));
  const h = Math.max(1, Math.round(rect.height));
  canvas.width = w;
  canvas.height = h;
  mapDrawnTick = -2; // výřezová vrstva se odvíjí od rozměru plátna
  if (map3dReady) R3.resize(w, h);
}

// ---------- pomocníci kreslení ----------
// obrys pole = kosočtverec; size drží dřívější smysl (HEX_SIZE ≈ celé pole,
// menší hodnota = vnitřní odsazení), škáluje se na skutečnou úhlopříčku
function tilePath(c, cx, cy, size) {
  const s = size * TILE_DIAG;
  c.beginPath();
  c.moveTo(cx + s, cy);
  c.lineTo(cx, cy + s * ISO_SQUASH);
  c.lineTo(cx - s, cy);
  c.lineTo(cx, cy - s * ISO_SQUASH);
  c.closePath();
}

// deterministický šum na pole (aby každé pole vypadalo trochu jinak)
function tileJitter(q, r) {
  let h = (q * 374761393 + r * 668265263) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return (((h >> 16) & 0xff) / 255) - 0.5;
}

function shade(col, amt) {
  const n = parseInt(col.slice(1), 16);
  const f = v => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

// hrany kosočtverce odpovídající směrům DIRS4 (pro kreslení hranic území):
// rohy pole v pořadí V(+x), J(+y), Z(−x), S(−y); směr → dvojice rohů hrany
const TILE_CORNERS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const DIR_EDGE = [[0, 1], [2, 3], [1, 2], [3, 0]];

// ---------- statická vrstva ----------
// ⚠ Hranice světa se počítají z MAP_R, NE z polí, která klient má.
// S AOI (etapa 11) drží klient jen okruh zájmu, takže by se svět „zmenšil"
// na to, co zrovna dorazilo — a padly by na to dvě věci naráz:
// draw() podle těchhle mezí OŘEZÁVÁ KAMERU (hráč by se do neznámé části
// vůbec nedostal) a minimapa podle nich škáluje (měřítko by se měnilo,
// kdykoli přibude kus mapy). Svět je čtverec |q|,|r| ≤ MAP_R, jehož rohy
// leží na (±2·KOSO·MAP_R, 0) a (0, ±2·KOSO·MAP_R·ISO_SQUASH).
function computeWorldBounds() {
  const m = HEX_SIZE * 2;
  if (typeof MAP_R === "number" && MAP_R > 0) {
    const w = 2 * KOSO * MAP_R, h = 2 * KOSO * MAP_R * ISO_SQUASH;
    worldMinX = -w - m; worldMinY = -h - m;
    worldW = 2 * w + 2 * m; worldH = 2 * h + 2 * m;
    return;
  }
  // záloha pro lobby a starší server, který MAP_R neposílá
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const t of G.tiles.values()) {
    const p = tileToPixel(t.q, t.r);
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  if (minX > maxX) { worldMinX = worldMinY = worldW = worldH = 0; return; }
  worldMinX = minX - m; worldMinY = minY - m;
  worldW = maxX - minX + 2 * m; worldH = maxY - minY + 2 * m;
}

// Výřezová vrstva (v0.33): rastr pokrývá viewport + okraj a překresluje se
// při novém tiku, vyjetí kamery z okraje, změně stupně rastru nebo rozměru
// plátna. Stupeň = px rastru na world px: dost na ostrost při daném zoomu,
// nikdy zbytečně nad MAP_SCALE (schody drží vrstvu při plynulém zoomu).
const LAYER_OKRAJ = HEX_SIZE * 8; // okraj výřezu ve world px (~3 pole na každou stranu)
function layerStupen() {
  if (camera.zoom <= 0.5) return 0.5;
  if (camera.zoom <= 1) return 1;
  if (camera.zoom <= 2) return 2;
  return MAP_SCALE;
}
function ensureMapLayer() {
  if (!G.tiles.size) return false;
  if (!worldW) computeWorldBounds();
  const S = layerStupen();
  const vw = canvas.width / camera.zoom, vh = canvas.height / camera.zoom;
  const vx0 = camera.x - vw / 2, vy0 = camera.y - vh / 2;
  const sedi = mapLayer && layerS === S
    && vx0 >= layerMinX && vy0 >= layerMinY
    && vx0 + vw <= layerMinX + layerW && vy0 + vh <= layerMinY + layerH;
  if (sedi && mapDrawnTick === G.tick) return true;
  if (!sedi) {
    layerS = S;
    layerW = vw + 2 * LAYER_OKRAJ;
    layerH = vh + 2 * LAYER_OKRAJ;
    layerMinX = vx0 - LAYER_OKRAJ;
    layerMinY = vy0 - LAYER_OKRAJ;
    const pw = Math.ceil(layerW * S), ph = Math.ceil(layerH * S);
    if (!mapLayer) {
      mapLayer = document.createElement("canvas");
      mapCtx = mapLayer.getContext("2d");
    }
    if (mapLayer.width !== pw || mapLayer.height !== ph) {
      mapLayer.width = pw; mapLayer.height = ph;
    }
  }
  renderMapLayer();
  mapDrawnTick = G.tick;
  return true;
}

// dlaždice zasahující do výřezu vrstvy: (q,r) box rohů výřezu — pohled je
// v mřížce otočený čtverec, osový box ho kryje celý. PAD kryje bloky 3×3
// (jmenovku nese kotva, až 2 pole od viditelného člena) a přesahy jmenovek.
// Na plném oddálení box degraduje na celý svět — stejný průchod jako dřív.
// (q, r) obálka výřezu vrstvy. PAD kryje kotvy bloků 3×3 a jmenovky, které
// se kreslí i z pole těsně za okrajem.
function vyrezBox(pad = 3) {
  const rohy = [
    pixelToTile(layerMinX, layerMinY),
    pixelToTile(layerMinX + layerW, layerMinY),
    pixelToTile(layerMinX, layerMinY + layerH),
    pixelToTile(layerMinX + layerW, layerMinY + layerH),
  ];
  let q0 = 1e9, q1 = -1e9, r0 = 1e9, r1 = -1e9;
  for (const p of rohy) {
    q0 = Math.min(q0, p.q); q1 = Math.max(q1, p.q);
    r0 = Math.min(r0, p.r); r1 = Math.max(r1, p.r);
  }
  return { q0: q0 - pad, q1: q1 + pad, r0: r0 - pad, r1: r1 + pad };
}

function dlazdiceVyrezu() {
  const b = vyrezBox();
  const ven = [];
  for (let q = b.q0; q <= b.q1; q++)
    for (let r = b.r0; r <= b.r1; r++) {
      const t = tileAt(q, r);
      if (t) ven.push(t);
    }
  return ven;
}

// ---------- země, kterou klient ještě nedostal (v0.67) ----------
// AOI z etapy 11 posílá jen OKRUH ZÁJMU hráče — na 69×69 je to 70 % mapy,
// zbytek světa v `G.tiles` vůbec není. Bez tohohle se ta část nemá čím
// vykreslit a mapa vypadá, jako by jí kus CHYBĚL: okruh je v mřížce
// kosočtverec, který se projekcí otočí na obrazovkový obdélník, takže je
// řez rovná čára napříč celým diamantem a čte se jako vada zobrazení.
//
// Kreslí se jen SILUETA. Kde svět končí, klient ví ze `MAP_R` (jde
// snímkem), takže se neznámá půda vyplní jednou tmavou barvou — žádný
// terén, žádný vlastník, žádná posádka. Po drátě to nestojí ani bajt
// a hráč se nedozví nic, co dosud nevěděl.
//
// ⚠ Musí se kreslit JAKO PRVNÍ, pod všechno ostatní: pod ní není 3D terén,
// takže by přes ni jinak prosvítalo pozadí stránky.
// ⚠ Barva laděná MĚŘENÍM jasu ve složeném obraze: pozadí stránky má 24,
// neprozkoumaný terén pod mlhou 63. První pokus (#141922) měl 24,6 — tedy
// přesně barvu pozadí, takže silueta nebyla vidět VŮBEC a mapa vypadala
// useknutá dál. Tahle má 39: zřetelně nad prázdnotou, zřetelně pod zemí,
// kterou hráč zná.
const NEZNAMA_ZEM = "#212834";
function kresliNeznamouZemi(c) {
  if (!G.tiles.size || typeof MAP_R !== "number") return;
  const b = vyrezBox();
  c.fillStyle = NEZNAMA_ZEM;
  const q0 = Math.max(-MAP_R, b.q0), q1 = Math.min(MAP_R, b.q1);
  const r0 = Math.max(-MAP_R, b.r0), r1 = Math.min(MAP_R, b.r1);
  for (let q = q0; q <= q1; q++)
    for (let r = r0; r <= r1; r++) {
      if (G.tiles.has(keyOf(q, r))) continue;
      const { x, y } = tileToPixel(q, r);
      // o půl pixelu přes okraj, ať mezi sousedy nezůstane šev
      tilePath(c, x, y, HEX_SIZE + 0.5);
      c.fill();
    }
}

function renderMapLayer() {
  const c = mapCtx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, mapLayer.width, mapLayer.height);
  c.setTransform(layerS, 0, 0, layerS, -layerMinX * layerS, -layerMinY * layerS);
  kresliNeznamouZemi(c);
  const vyrez = dlazdiceVyrezu();

  // Terén kreslí 3D vrstva pod tímhle plátnem. Než se modely načtou (nebo
  // když WebGL chybí), vykreslí se nouzová plochá mapa, ať hráč nekouká do
  // prázdna — jakmile R3 hlásí hotovo, tahle větev se přeskočí.
  if (!map3dReady || !R3.ready) {
    const tiles = [...vyrez].sort((a, b) => a.r - b.r || a.q - b.q);
    for (const t of tiles) {
      const { x, y } = tileToPixel(t.q, t.r);
      const terr = TERRAIN[t.terrain];
      const j = tileJitter(t.q, t.r);
      // v0.41: voda splývá i v nouzové mapě — plná barva bez mezery a bez
      // obrysu, aby z pásu tří polí byla jedna řeka, ne tři pruhy dlaždic
      const voda = t.terrain === "water";
      tilePath(c, x, y, voda ? HEX_SIZE + 0.5 : HEX_SIZE - 0.5);
      if (voda) {
        c.fillStyle = terr.color;
      } else {
        const grad = c.createLinearGradient(x, y - HEX_SIZE, x, y + HEX_SIZE);
        grad.addColorStop(0, shade(terr.color, j * 0.05 + 0.045));
        grad.addColorStop(1, shade(terr.color, j * 0.05 - 0.055));
        c.fillStyle = grad;
      }
      c.fill();
      if (!voda) {
        c.strokeStyle = "rgba(10,14,10,0.28)";
        c.lineWidth = 1;
        c.stroke();
      }
      drawDecor(c, t, x, y, j);
      if (t.terrain === "bridge") drawBridge(c, t, x, y);
    }
  }

  // stupeň pole čitelný z barvy půdy: bohatá pole (200+) hřejí do zlata,
  // chudá (1–15) jsou vybledlá do šeda. Průhledný nádech přes 3D terén.
  for (const t of vyrez) {
    if (t.structure || !TERRAIN[t.terrain].passable) continue;
    const { x, y } = tileToPixel(t.q, t.r);
    if (t.level >= 9) {
      tilePath(c, x, y, HEX_SIZE - 0.5);
      c.fillStyle = `rgba(255,205,110,${0.04 + (t.level - 8) * 0.025})`;
      c.fill();
    } else if (t.level <= 3) {
      tilePath(c, x, y, HEX_SIZE - 0.5);
      c.fillStyle = `rgba(120,128,140,${0.05 + (3 - t.level) * 0.05})`;
      c.fill();
    }
  }

  // zamčené zóny světa (v0.30): fáze je otevírají postupně — do té doby chladnou
  {
    const mne = G.factions[G.playerFaction];
    if (mne && G.faze < 4) {
      for (const t of vyrez) {
        if (!TERRAIN[t.terrain].passable || zonaOtevrena(mne, t)) continue;
        const { x, y } = tileToPixel(t.q, t.r);
        tilePath(c, x, y, HEX_SIZE - 0.5);
        c.fillStyle = "rgba(14,18,30,0.32)";
        c.fill();
      }
    }
  }

  // území: jemný nádech + silná hranice jen na okrajích území
  for (const t of vyrez) {
    if (t.owner === -1) continue;
    const { x, y } = tileToPixel(t.q, t.r);
    const col = G.factions[t.owner].color;
    tilePath(c, x, y, HEX_SIZE - 0.5);
    c.fillStyle = col + "30";
    c.fill();
    c.lineCap = "round";
    for (let d = 0; d < DIRS4.length; d++) {
      const n = tileAt(t.q + DIRS4[d][0], t.r + DIRS4[d][1]);
      if (n && n.owner === t.owner) continue;
      const s = (HEX_SIZE - 1.6) * TILE_DIAG;
      const [c1, c2] = DIR_EDGE[d];
      c.beginPath();
      c.moveTo(x + TILE_CORNERS[c1][0] * s, y + TILE_CORNERS[c1][1] * s * ISO_SQUASH);
      c.lineTo(x + TILE_CORNERS[c2][0] * s, y + TILE_CORNERS[c2][1] * s * ISO_SQUASH);
      c.strokeStyle = col;
      c.lineWidth = 3.2;
      c.stroke();
    }
  }

  // úrovně, posádky a odznaky (struktury jsou přímo součástí izo-spritů)
  for (const t of vyrez) {
    if (t.big) continue;           // jmenovku nese kotva bloku, uprostřed
    const c0 = bigCenter(t);
    const { x, y } = tileToPixel(c0.q, c0.r);
    if (!TERRAIN[t.terrain].passable) continue;
    if (!isExplored(keyOf(t.q, t.r))) continue;
    c.textAlign = "center"; c.textBaseline = "middle";
    if (t.structure) {
      // Trůnní město je do půlky sezóny pod ochranou příměří; brány zamčených
      // zón (velké pevnosti, bašty, pevnosti) nesou zámek, dokud fáze neotevře
      const mne = G.factions[G.playerFaction];
      const zamcenaBrana = mne && G.faze < 4 && !zonaOtevrena(mne, t)
        && ["grandfort", "bastion", "fortress"].includes(t.structure);
      if ((t.structure === "throne" && !G.throneOpen) || zamcenaBrana) {
        c.fillStyle = "rgba(10,12,16,0.72)";
        c.beginPath(); c.arc(x + 16, y - 22, 8, 0, Math.PI * 2); c.fill();
        c.font = "10px sans-serif";
        c.fillText("🔒", x + 16, y - 21);
      }
    }
    // druh suroviny už ukazují 3D rekvizity přímo na poli (pšenice, klády,
    // lom, důl, svatyně ✦) — mohutnost roste s úrovní pole
    // jmenovka: u neutrálních polí síla druhu (1–300, bašta 300 / velká
    // pevnost 500), u vlastněných skutečná obrana
    const def = tileDefense(t);
    const label = t.owner === -1
      ? (t.structure === "grandfort" ? 500
        : t.structure === "bastion" ? 300
        : t.structure ? def : tierOf(t))
      : def;
    if (label > 0) {
      c.font = "8.5px sans-serif";
      c.lineJoin = "round";
      c.lineWidth = 2.5;
      c.strokeStyle = "rgba(10,12,10,0.55)";
      c.strokeText("⚔" + label, x, y + 7);
      c.fillStyle = t.owner === -1 ? "rgba(255,246,225,0.8)" : "rgba(255,252,240,0.95)";
      c.fillText("⚔" + label, x, y + 7);
    }
  }

  if (mapFilter) drawFilterOverlay(c, vyrez);
  drawFogOverlay(c, vyrez);
}

// ---------- mlha války ----------
// neprozkoumaná pole jsou v temnu, ale silueta terénu (hory, lesy, voda)
// prosvítá — hráč tuší, co ho čeká; prozkoumaná, ale právě neviditelná šednou
// jak moc je pole vidět: 1 = v dohledu, 0.45 = prozkoumané mimo dohled,
// 0.2 = neprozkoumané (silueta terénu prosvítá, hráč tuší, co ho čeká)
function fogFactor(key) {
  if (!G.factions.length) return 1;
  const t = G.tiles.get(key);
  // zamčená zóna (v0.30): ztlumit i 3D terén, ne jen plochou 2D vrstvu
  const mne = G.factions[G.playerFaction];
  const zamek = (G.faze < 4 && mne && t && !zonaOtevrena(mne, t)) ? 0.62 : 1;
  if (t && t.bigSize) {              // blok svítí podle nejlépe viditelného pole
    let f = 0.2;
    for (const m of blockTiles(t)) {
      const k = keyOf(m.q, m.r);
      f = Math.max(f, isVisible(k) ? 1 : isExplored(k) ? 0.45 : 0.2);
      if (f === 1) break;
    }
    return Math.max(0.2, f * zamek); // 0.2 = podlaha siluety terénu (nešlapat)
  }
  if (isVisible(key)) return zamek;
  return Math.max(0.2, (isExplored(key) ? 0.45 : 0.2) * zamek);
}

function drawFogOverlay(c, vyrez) {
  if (!G.factions.length) return;
  const trojrozmerne = map3dReady && R3.ready;
  // Terén ztmavuje mlha rovnou ve 3D (R3.setFog) — plochý hexagon by nezakryl
  // vysoké stavby a hradby by z mlhy koukaly ven. Jede přes VŠECHNY instance
  // (mimo výřez taky — při posunu kamery nesmí vyplout nezamlžený terén),
  // proto jen 1× za tik a po přestavbě 3D, ne s každým překreslením výřezu.
  if (trojrozmerne && fogTik !== G.tick) { R3.setFog(fogFactor); fogTik = G.tick; }

  for (const t of vyrez) {
    const key = keyOf(t.q, t.r);
    if (isVisible(key)) continue;
    const { x, y } = tileToPixel(t.q, t.r);
    const zname = isExplored(key);
    if (trojrozmerne) {
      // 2D obsah (nádech území, jmenovky, filtry) se nad mlhou nesmí prosvítat,
      // jinak by hráč viděl cizí území i v neprozkoumané tmě. Místo tmavého
      // překryvu ho tedy proporčně ODMAŽEME — 3D pod tím už je zamlžené.
      c.save();
      c.globalCompositeOperation = "destination-out";
      tilePath(c, x, y, HEX_SIZE + 0.6);
      // se zapnutým filtrem mažeme mírněji — filtr je průzkumová pomůcka
      // a i dřív zůstával přes mlhu čitelný (jen ztmavený)
      const sila = mapFilter ? (zname ? 0.3 : 0.55) : (zname ? 0.55 : 0.88);
      c.fillStyle = "rgba(0,0,0," + sila + ")";
      c.fill();
      c.restore();
    } else {
      tilePath(c, x, y, HEX_SIZE + 0.6);
      c.fillStyle = zname ? "rgba(10,13,18,0.45)" : "rgba(7,9,13,0.76)";
      c.fill();
    }
    if (!zname) {   // mřížka zůstane čitelná i v neprozkoumané tmě
      c.strokeStyle = "rgba(30,36,46,0.5)";
      c.lineWidth = 1;
      tilePath(c, x, y, HEX_SIZE - 0.5);
      c.stroke();
    }
  }
}

// ---------- filtry mapy (surovina / úroveň polí) ----------
const FILTER_RES_COLOR = { food: "#d9d24d", wood: "#b07a3f", stone: "#a8b2bc",
  iron: "#c98d5a", gold: "#ffd455" };
// 12 stupňů polí: modrá (1) → tyrkys → zeleň → zlatá → oranž → rudá → purpur (300)
const LEVEL_COLORS = ["", "#5a8fd0", "#4fa8c8", "#3fbfa8", "#59c46a", "#a8c94d",
  "#d9c94d", "#e0b13d", "#e0913d", "#d56f3d", "#d5504a", "#c03a68", "#9a3ad0"];

function drawFilterOverlay(c, vyrez) {
  const me = G.factions[G.playerFaction];
  if (!me) return;
  c.textAlign = "center"; c.textBaseline = "middle";
  for (const t of vyrez) {
    const { x, y } = tileToPixel(t.q, t.r);
    const passable = TERRAIN[t.terrain].passable;
    if (mapFilter === "level") {
      // filtr síly: barva podle úrovně (stejná škála jako pecky na polích),
      // číslo = obrana posádky — pro hledání cílů a snadné zapamatování
      tilePath(c, x, y, HEX_SIZE - 0.5);
      if (!passable) { c.fillStyle = "rgba(8,12,18,0.66)"; c.fill(); continue; }
      c.fillStyle = LEVEL_COLORS[t.level] + "66";
      c.fill();
      c.strokeStyle = LEVEL_COLORS[t.level];
      c.lineWidth = 1.2;
      c.stroke();
      const known = isExplored(keyOf(t.q, t.r));
      const label = !known ? "?" : "⚔" + (t.owner === -1 && !t.structure ? tierOf(t) : tileDefense(t));
      c.fillStyle = "rgba(10,14,10,0.6)";
      c.beginPath(); c.ellipse(x, y, 13, 7.5, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = "#fff";
      c.font = "bold 9px sans-serif";
      c.fillText(label, x, y + 0.5);
    } else if (mapFilter === "vztahy") {
      tilePath(c, x, y, HEX_SIZE - 0.5);
      const col = VZTAH_BARVA[vztahPole(t, me)];
      if (!col || !passable) { c.fillStyle = "rgba(8,12,18,0.66)"; c.fill(); continue; }
      c.globalAlpha = 0.6;
      c.fillStyle = col;
      c.fill();
      c.globalAlpha = 1;
      c.strokeStyle = col;
      c.lineWidth = 1.2;
      c.stroke();
    } else {
      const amount = passable ? tileIncomePreview(t, me)[mapFilter] : 0;
      tilePath(c, x, y, HEX_SIZE - 0.5);
      if (!amount) { c.fillStyle = "rgba(8,12,18,0.66)"; c.fill(); continue; }
      const col = FILTER_RES_COLOR[mapFilter];
      const alpha = Math.min(0.72, 0.28 + amount / 18);
      c.globalAlpha = alpha;
      c.fillStyle = col;
      c.fill();
      c.globalAlpha = 1;
      c.strokeStyle = col;
      c.lineWidth = 1.2;
      c.stroke();
      c.fillStyle = "rgba(12,10,4,0.9)";
      c.font = "bold 9.5px sans-serif";
      c.fillText("+" + amount, x, y + 0.5);
    }
  }
}

// terénní dekorace (kreslené, deterministické)
function drawDecor(c, t, x, y, j) {
  const o = j * 6; // drobný posun, ať to není v mřížce
  if (t.terrain === "forest") {
    c.fillStyle = shade("#33552c", j * 0.08);
    tree(c, x - 8 + o, y + 5, 6);
    tree(c, x + 1 - o, y - 3, 7);
    tree(c, x + 8 + o, y + 6, 5.5);
  } else if (t.terrain === "hills") {
    peak(c, x - 4 + o, y + 7, 11, shade("#7d6d52", j * 0.06));
    peak(c, x + 7 - o, y + 7, 8, shade("#6e5f47", j * 0.06));
  } else if (t.terrain === "ruins") {
    c.fillStyle = "rgba(226,220,235,0.55)";
    c.fillRect(x - 8, y - 1 + o, 3, 9);
    c.fillRect(x - 1, y - 5 - o, 3, 13);
    c.fillRect(x + 6, y + 1, 3, 7);
    c.fillRect(x - 10, y + 8, 20, 2);
  } else if (t.terrain === "wall") {
    // hradby: kamenné kvádry a cimbuří přes celé pole
    c.fillStyle = shade("#57534b", j * 0.05);
    c.fillRect(x - 14, y - 4, 28, 12);
    c.fillStyle = shade("#6e695f", j * 0.05);
    for (const [bx, bw] of [[-14, 8], [-5, 9], [5, 9]]) c.fillRect(x + bx, y - 4, bw - 1, 5);
    c.fillStyle = shade("#7d786c", j * 0.05);
    for (const mx of [-13, -6, 1, 8]) c.fillRect(x + mx, y - 9, 5, 6); // zuby cimbuří
    c.fillStyle = "rgba(0,0,0,0.25)";
    c.fillRect(x - 14, y + 6, 28, 2.5);
  } else if (t.terrain === "water") {
    c.strokeStyle = "rgba(240,250,255,0.22)";
    c.lineWidth = 1.4;
    for (const dy of [-4 + o, 5 - o]) {
      c.beginPath();
      c.moveTo(x - 9, y + dy);
      c.quadraticCurveTo(x - 4, y + dy - 3, x, y + dy);
      c.quadraticCurveTo(x + 4, y + dy + 3, x + 9, y + dy);
      c.stroke();
    }
  } else if (t.terrain === "plains" && j > 0.18) {
    c.strokeStyle = "rgba(60,90,40,0.5)";
    c.lineWidth = 1;
    for (const [gx, gy] of [[-6, 6], [3, -2], [8, 8]]) {
      c.beginPath();
      c.moveTo(x + gx, y + gy + 3);
      c.lineTo(x + gx + 2, y + gy - 2);
      c.stroke();
    }
  }
}

// dřevěná lávka přes řeku (kreslená, natočená kolmo k řece)
function drawBridge(c, t, x, y) {
  const ang = ({ a: 90, b: 0, c: 135, d: 45 }[t.riv] ?? 90) * Math.PI / 180;
  c.save();
  c.translate(x, y);
  c.rotate(ang);
  const L = HEX_SIZE * 1.75, W = HEX_SIZE * 0.6;
  c.fillStyle = "#6e4e28";
  c.fillRect(-L / 2, -W / 2 - 2.5, L, W + 5);
  c.fillStyle = "#a37a45";
  for (let i = -L / 2 + 2; i < L / 2 - 2; i += 6.5) c.fillRect(i, -W / 2, 4.5, W);
  c.fillStyle = "#54391b";
  c.fillRect(-L / 2, -W / 2 - 3, L, 2.5);
  c.fillRect(-L / 2, W / 2 + 0.5, L, 2.5);
  c.restore();
}

function tree(c, x, y, size) {
  c.beginPath();
  c.moveTo(x, y - size);
  c.lineTo(x - size * 0.6, y + size * 0.45);
  c.lineTo(x + size * 0.6, y + size * 0.45);
  c.closePath();
  c.fill();
}

function peak(c, x, y, size, col) {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(x - size * 0.7, y);
  c.lineTo(x, y - size);
  c.lineTo(x + size * 0.7, y);
  c.closePath();
  c.fill();
  c.fillStyle = "rgba(255,255,255,0.35)";
  c.beginPath();
  c.moveTo(x - size * 0.18, y - size * 0.72);
  c.lineTo(x, y - size);
  c.lineTo(x + size * 0.22, y - size * 0.66);
  c.closePath();
  c.fill();
}

// ---------- vizuální projevy ultimátek ----------
// každý hrdina s naučenou ultimátkou má na mapě vlastní animaci + glyf u praporku
const ULT_FX = {
  "aldar:0":  { kind: "wind",    color: "#cfe8ff", glyph: "💨", trail: true },  // Křídla bouře
  "aldar:1":  { kind: "blades",  color: "#ff6a5a", glyph: "⚔" },               // Popravčí
  "aldar:2":  { kind: "wall",    color: "#e8c26a", glyph: "🛡" },               // Nezlomná zeď
  "aldar:3":  { kind: "iron",    color: "#b8c8d8", glyph: "∞" },               // Neúnavná
  "yllien:0": { kind: "shadow",  color: "#a97fe8", glyph: "🌒", trail: true },  // Stínochod
  "yllien:1": { kind: "arrow",   color: "#9fe06a", glyph: "🏹" },               // Srdcestřel
  "yllien:2": { kind: "aura",    color: "#4fae62", glyph: "🌿" },               // Prastarý hvozd
  "yllien:3": { kind: "sparkle", color: "#6ee0d0", glyph: "✨" },               // Vítězný dech
  "durgar:0": { kind: "hammer",  color: "#e8a13d", glyph: "🔨" },               // Kladivo hor
  "durgar:1": { kind: "rocks",   color: "#b0a48e", glyph: "🪨" },               // Lavina
  "durgar:2": { kind: "spark",   color: "#ff9a3d", glyph: "💥" },               // Dělostřelecká příprava
  "durgar:3": { kind: "rings",   color: "#e8c26a", glyph: "📯" },               // Žulový pokřik
  "horda:0":  { kind: "aura",    color: "#c94036", glyph: "☠" },               // Popelný příkrov
  "horda:1":  { kind: "storm",   color: "#dfe6f2", glyph: "🌪", trail: true },  // Oko bouře
  "horda:2":  { kind: "bones",   color: "#e9e4d2", glyph: "🦴" },               // Kostižer
  "horda:3":  { kind: "fire",    color: "#ff7a35", glyph: "🔥", trail: true },  // Věčný návrat
  "aldar:4":  { kind: "rings",   color: "#4d8fe0", glyph: "🚩" },               // Královská korouhev
  "yllien:4": { kind: "sparkle", color: "#6ee0a8", glyph: "🎶" },               // Chór úsvitu
  "durgar:4": { kind: "iron",    color: "#e0913d", glyph: "⚒" },               // Železná legie
  "horda:4":  { kind: "blades",  color: "#d5504a", glyph: "🐺" },               // Nekonečná horda
};

function ultFxFor(f, heroIdx) {
  const h = f.heroes[heroIdx];
  const fx = ULT_FX[f.key + ":" + h.defIdx];
  if (!fx) return null;
  const u = HERO_DEFS[f.key][h.defIdx].tree.find(s => s.ult);
  // efekt na mapě je oslava plně naučené vrcholné dovednosti (15/15)
  return u && (h.skills[u.key] || 0) >= u.max ? fx : null;
}

function star4(c, x, y, s) {
  c.beginPath();
  c.moveTo(x, y - s); c.lineTo(x + s * 0.3, y); c.lineTo(x, y + s); c.lineTo(x - s * 0.3, y);
  c.closePath(); c.fill();
  c.beginPath();
  c.moveTo(x - s, y); c.lineTo(x, y - s * 0.3); c.lineTo(x + s, y); c.lineTo(x, y + s * 0.3);
  c.closePath(); c.fill();
}

function drawUltFx(x, y, fx, now) {
  const c = ctx;
  c.save();
  switch (fx.kind) {
    case "aura": { // velký měkký příkrov přes okolí + rotující okraj
      const R = HEX_SIZE * 2.7;
      const pulse = 0.5 + 0.5 * Math.sin(now / 700);
      const g = c.createRadialGradient(x, y, HEX_SIZE * 0.4, x, y, R);
      g.addColorStop(0, fx.color + "30");
      g.addColorStop(0.7, fx.color + "16");
      g.addColorStop(1, fx.color + "00");
      c.fillStyle = g;
      c.beginPath(); c.arc(x, y, R, 0, Math.PI * 2); c.fill();
      c.globalAlpha = 0.30 + 0.25 * pulse;
      c.setLineDash([9, 7]);
      c.lineDashOffset = -(now / 90) % 16;
      c.strokeStyle = fx.color;
      c.lineWidth = 1.6;
      c.beginPath(); c.arc(x, y, R * 0.8, 0, Math.PI * 2); c.stroke();
      break;
    }
    case "wall": { // pevnostní pole se zlatým leskem
      c.globalAlpha = 0.55 + 0.3 * Math.sin(now / 450);
      c.shadowColor = fx.color; c.shadowBlur = 9;
      tilePath(c, x, y, HEX_SIZE - 6);
      c.strokeStyle = fx.color;
      c.lineWidth = 3;
      c.stroke();
      break;
    }
    case "wind": case "storm": { // víry kroužící kolem pole
      const speed = fx.kind === "storm" ? 320 : 650;
      const r = HEX_SIZE * 0.85;
      c.strokeStyle = fx.color;
      c.lineWidth = 2;
      c.lineCap = "round";
      for (let i = 0; i < 3; i++) {
        const ang = now / speed + i * (Math.PI * 2 / 3);
        c.globalAlpha = 0.65;
        c.beginPath(); c.arc(x, y, r, ang, ang + 0.65); c.stroke();
        if (fx.kind === "storm") {
          c.globalAlpha = 0.4;
          c.beginPath(); c.arc(x, y, r * 0.55, -ang * 1.4, -ang * 1.4 + 0.8); c.stroke();
        }
      }
      break;
    }
    case "shadow": { // temné přízraky obíhající pole
      for (let i = 0; i < 3; i++) {
        const ang = -now / 800 + i * (Math.PI * 2 / 3);
        const px = x + HEX_SIZE * 0.8 * Math.cos(ang);
        const py = y + HEX_SIZE * 0.55 * Math.sin(ang);
        c.fillStyle = fx.color;
        c.globalAlpha = 0.55;
        c.beginPath(); c.arc(px, py, 2.8, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 0.22;
        c.beginPath(); c.arc(px, py, 5.5, 0, Math.PI * 2); c.fill();
      }
      break;
    }
    case "sparkle": { // třpyt čtyřcípých hvězdiček
      const pts = [[-13, -6], [10, -13], [14, 7], [-8, 11]];
      c.fillStyle = fx.color;
      pts.forEach((p, i) => {
        c.globalAlpha = Math.max(0, Math.sin(now / 380 + i * 1.7)) * 0.9;
        star4(c, x + p[0], y + p[1], 4);
      });
      break;
    }
    case "bones": case "rocks": { // stoupající kostěné / padající kamenné částice
      const up = fx.kind === "bones";
      c.fillStyle = fx.color;
      for (let i = 0; i < 3; i++) {
        const t = ((now / 1600) + i / 3) % 1;
        const py = up ? y + 8 - t * 26 : y - 12 + t * 22;
        const px = x - 10 + i * 10 + Math.sin(now / 300 + i * 2) * 2;
        c.globalAlpha = Math.sin(t * Math.PI) * 0.85;
        c.beginPath(); c.ellipse(px, py, 2.6, up ? 1.6 : 2.2, 0, 0, Math.PI * 2); c.fill();
      }
      break;
    }
    case "rings": { // rozbíhající se kruhy pokřiku
      for (const off of [0, 0.5]) {
        const t = (now / 1500 + off) % 1;
        c.globalAlpha = (1 - t) * 0.55;
        c.strokeStyle = fx.color;
        c.lineWidth = 2;
        c.beginPath(); c.arc(x, y, 6 + t * 22, 0, Math.PI * 2); c.stroke();
      }
      break;
    }
    case "arrow": { // šíp prolétající polem
      const t = (now / 1100) % 1;
      const px = x - 18 + t * 36;
      c.globalAlpha = Math.sin(t * Math.PI);
      c.shadowColor = fx.color; c.shadowBlur = 6;
      c.strokeStyle = fx.color; c.lineWidth = 2; c.lineCap = "round";
      c.beginPath(); c.moveTo(px - 7, y - 6); c.lineTo(px, y - 6); c.stroke();
      c.fillStyle = fx.color;
      c.beginPath();
      c.moveTo(px + 4, y - 6); c.lineTo(px - 1, y - 8.5); c.lineTo(px - 1, y - 3.5);
      c.closePath(); c.fill();
      break;
    }
    case "blades": case "spark": case "hammer": case "iron": { // glyf se zábleskem
      const flash = Math.pow(Math.max(0, Math.sin(now / 480)), 6);
      c.shadowColor = fx.color;
      c.shadowBlur = 6 + 11 * flash;
      c.globalAlpha = 0.75 + 0.25 * flash;
      c.font = "11px serif";
      c.textAlign = "center"; c.textBaseline = "middle";
      c.fillStyle = fx.color;
      const bounce = fx.kind === "hammer" ? -flash * 5 : 0;
      c.fillText(fx.glyph, x - 12, y - 14 + bounce);
      if (fx.kind === "spark" && flash > 0.4) {
        c.strokeStyle = fx.color; c.lineWidth = 1.2;
        for (let i = 0; i < 5; i++) {
          const a = i * 1.256 + now / 200;
          c.beginPath();
          c.moveTo(x - 12 + Math.cos(a) * 6, y - 14 + Math.sin(a) * 6);
          c.lineTo(x - 12 + Math.cos(a) * (9 + flash * 4), y - 14 + Math.sin(a) * (9 + flash * 4));
          c.stroke();
        }
      }
      break;
    }
  }
  c.restore();
}

// ---------- dynamická vrstva ----------
function draw() {
  if (!ctx) return;
  figurky3d = [];
  const now = performance.now();

  // Plátno si hlídá vlastní rozměr samo. Layout se po startu ještě mění
  // (zavře se úvodní dialog, naskočí lišty) a když se buffer rozejde s CSS,
  // obraz se svisle stlačí a hlavně přestanou sedět kliknutí — screenToWorld
  // počítá v pixelech bufferu, ale myš chodí v CSS pixelech.
  const r = canvas.getBoundingClientRect();
  if (Math.round(r.width) !== canvas.width || Math.round(r.height) !== canvas.height)
    resizeCanvas();

  // kamera neuteče ze světa — hráč (i skok z minimapy) se jinak umí ztratit v prázdnu
  if (worldW) {
    camera.x = Math.max(worldMinX, Math.min(worldMinX + worldW, camera.x));
    camera.y = Math.max(worldMinY, Math.min(worldMinY + worldH, camera.y));
  }

  // 2D plátno je průhledné — pozadí i terén jsou pod ním (CSS gradient a 3D)
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 3D terén: kamera se dopočítá z herního camera{x,y,zoom}, takže promítá
  // do stejné soustavy jako tileToPixel a překryv nad tím sedí bez přepočtu
  if (map3dReady) {
    ensureMap3D();
    ensureCesty();
    R3.render(camera.x, camera.y, camera.zoom);
  }

  if (!ensureMapLayer()) return;

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  // statická vrstva (území, jmenovky, filtry, mlha) — už bez stínu pod mapou,
  // ten dělá skutečné světlo ve 3D; výřez se klade na své world místo
  ctx.drawImage(mapLayer, 0, 0, mapLayer.width, mapLayer.height,
    layerMinX, layerMinY, mapLayer.width / layerS, mapLayer.height / layerS);

  // dosah základny (v0.29): Manhattanův diamant kolem základny vybraného
  // hrdiny — na obrazovce osový kosočtverec, kreslí se pod výběrem a figurkami
  if (reachPreview) {
    const { x, y } = tileToPixel(reachPreview.q, reachPreview.r);
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.12 * Math.sin(now / 340);
    ctx.setLineDash([10, 7]);
    ctx.lineDashOffset = -(now / 70) % 17;
    ctx.strokeStyle = reachPreview.color || "#e8c26a";
    ctx.lineWidth = 2.4;
    // +0,5: hranice prochází STŘEDEM prvních nedosažitelných polí — dosažitelná
    // jsou celá uvnitř, za čárou to nejde
    tilePath(ctx, x, y, HEX_SIZE * (REACH + 0.5));
    ctx.stroke();
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = reachPreview.color || "#e8c26a";
    ctx.fill();
    ctx.restore();
  }

  // zvýraznění hover / výběr
  if (hoverKey && hoverKey !== selectedKey) {
    const t = G.tiles.get(hoverKey);
    if (t) {
      const c0 = bigCenter(t);
      const { x, y } = tileToPixel(c0.q, c0.r);
      tilePath(ctx, x, y, (HEX_SIZE - 1) * (t.bigSize || 1));
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
  }
  if (selectedKey) {
    const t = G.tiles.get(selectedKey);
    if (t) {
      const c0 = bigCenter(t);
      const { x, y } = tileToPixel(c0.q, c0.r);
      const pulse = 0.55 + 0.45 * Math.sin(now / 280);
      ctx.save();
      ctx.shadowColor = "#e8c26a";
      ctx.shadowBlur = 10 + 6 * pulse;
      tilePath(ctx, x, y, (HEX_SIZE - 1) * (t.bigSize || 1));
      ctx.strokeStyle = `rgba(240,205,120,${0.65 + 0.35 * pulse})`;
      ctx.lineWidth = 2.6;
      ctx.stroke();
      ctx.restore();
    }
  }

  // putovní události: pulsující odznak na poli (jen na prozkoumaných polích)
  for (const e of G.mapEvents) {
    if (!isExplored(e.key)) continue;
    const t = G.tiles.get(e.key);
    const { x, y } = tileToPixel(t.q, t.r);
    const def = MAP_EVENTS[e.type];
    const pulse = 0.5 + 0.5 * Math.sin(now / 420);
    ctx.save();
    ctx.strokeStyle = `rgba(240,205,120,${0.35 + 0.4 * pulse})`;
    ctx.lineWidth = 1.8;
    tilePath(ctx, x, y, HEX_SIZE - 2 - pulse * 2);
    ctx.stroke();
    ctx.shadowColor = "rgba(0,0,0,0.7)"; ctx.shadowBlur = 4;
    ctx.font = "13px sans-serif";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(def.icon, x, y - HEX_SIZE - 6 - pulse * 2);
    ctx.restore();
    // zbývající čas události (tenký oblouk)
    ctx.strokeStyle = "rgba(240,205,120,0.8)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y - HEX_SIZE - 6, 8.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (e.ticksLeft / e.total));
    ctx.stroke();
  }

  // aury stráže (pod jmenovkami): hrdina na stráži chrání i sousední pole
  for (const f of G.factions) {
    for (const h of f.heroes) {
      if (!h.pos || !h.guard) continue;
      if (f.id !== G.playerFaction && !isVisible(h.pos)) continue; // mlha
      const t = G.tiles.get(h.pos);
      const around = [t, ...neighborsOf(t).filter(n => n.owner === f.id && TERRAIN[n.terrain].passable)];
      for (const a of around) {
        const p = tileToPixel(a.q, a.r);
        tilePath(ctx, p.x, p.y, HEX_SIZE - 2);
        ctx.fillStyle = f.color + "24";
        ctx.fill();
      }
      const { x, y } = tileToPixel(t.q, t.r);
      const pulse = 0.5 + 0.5 * Math.sin(now / 500);
      tilePath(ctx, x, y, HEX_SIZE - 3);
      ctx.setLineDash([5, 4]);
      ctx.lineDashOffset = -(now / 130) % 9;
      ctx.strokeStyle = `rgba(255,255,255,${0.35 + 0.3 * pulse})`;
      ctx.lineWidth = 1.6;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // projevy ultimátek hrdinů v poli (pod jmenovkami)
  for (const f of G.factions) {
    for (let i = 0; i < f.heroes.length; i++) {
      const h = f.heroes[i];
      if (!h.pos) continue;
      if (f.id !== G.playerFaction && !isVisible(h.pos)) continue; // mlha
      const fx = ultFxFor(f, i);
      if (!fx) continue;
      const t = G.tiles.get(h.pos);
      const p = tileToPixel(t.q, t.r);
      drawUltFx(p.x, p.y, fx, now);
    }
  }

  // hrdinové v poli: postavička na poli + praporek s iniciálou v barvě frakce
  // (zlatý okraj = tvoji hrdinové; víc hrdinů na poli se řadí vedle sebe)
  const clashKeys = new Set((G.clashes || [])
    .filter(cl => (G.tick - cl.tick) < 3).map(cl => cl.key));
  const heroesAt = new Map();
  for (const f of G.factions) {
    for (let i = 0; i < f.heroes.length; i++) {
      const h = f.heroes[i];
      if (!h.pos) continue;
      if (f.id !== G.playerFaction && !isVisible(h.pos)) continue; // mlha
      const slot = heroesAt.get(h.pos) || 0;
      heroesAt.set(h.pos, slot + 1);
      const t = G.tiles.get(h.pos);
      const { x, y } = tileToPixel(t.q, t.r);
      const mine = f.id === G.playerFaction;
      // jemný kroužek na poli, ať je hrdina vidět i při oddálení
      tilePath(ctx, x, y, HEX_SIZE - 4.5);
      ctx.strokeStyle = f.color + (mine ? "cc" : "88");
      ctx.lineWidth = mine ? 2 : 1.4;
      ctx.stroke();
      // postavička hrdiny: hledí ke středu mapy; při bitvě na poli ji
      // nahrazují bojující figurky střetu
      if (!clashKeys.has(h.pos)) {
        kresliFigurku(ctx, x - 4 + slot * 9, y + 8, {
          fkey: f.key, color: f.color, trait: heroDef(f, i).trait,
          sprite: `hero_${f.key}_${h.defIdx}`,
          dir: x > 1 ? -1 : 1, mode: "idle", now, phase: slot * 1.7, guard: h.guard,
        });
      }
      // praporek
      const bx = x + 6 + slot * 15, by = y - 30;
      ctx.strokeStyle = "#e9e4d5";
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(bx, by + 6); ctx.lineTo(bx, by + 24); ctx.stroke();
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.6)";
      ctx.shadowBlur = 4;
      ctx.fillStyle = f.color;
      ctx.beginPath(); ctx.arc(bx, by + 4, 7.5, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = mine ? "#ffd94d" : "rgba(255,255,255,0.85)";
      ctx.lineWidth = mine ? 1.8 : 1.1;
      ctx.beginPath(); ctx.arc(bx, by + 4, 7.5, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "#fff";
      ctx.font = "bold 8.5px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(heroDef(f, i).name[0], bx, by + 4.5);
      if (h.guard) { ctx.font = "7px sans-serif"; ctx.fillText("🛡", bx + 7, by + 11); }
      const bfx = ultFxFor(f, i);
      if (bfx) { // glyf ultimátky u praporku
        ctx.save();
        ctx.shadowColor = bfx.color; ctx.shadowBlur = 5;
        ctx.font = "8px serif";
        ctx.fillStyle = bfx.color;
        ctx.fillText(bfx.glyph, bx - 8, by + 11);
        ctx.restore();
      }
    }
  }

  // pochody: plynule animované linie; útok / posily / návrat se liší stylem
  const tickFrac = G.lastTickAt ? Math.min(1, (now - G.lastTickAt) / TICK_MS) : 1;
  for (const f of G.factions) {
    for (const m of f.marches) {
      // mlha: cizí pochody vidíš, jen když vidíš některý konec trasy
      if (f.id !== G.playerFaction && !isVisible(m.fromKey) && !isVisible(m.targetKey)) continue;
      // obléhání není pochod — hrdina stojí na svém poli a jen odpočítává
      // další náběh, takže se kolona nekreslí (kreslila by fantom bez vojska)
      if (m.kind === "siege") continue;
      const target = G.tiles.get(m.targetKey);
      const origin = G.tiles.get(m.fromKey);
      const from = tileToPixel(origin.q, origin.r);
      const to = tileToPixel(target.q, target.r);
      const prog = Math.min(1, Math.max(0, (m.total - m.ticksLeft + tickFrac) / m.total));
      const kind = m.kind === "attack" ? "attack" : (m.kind === "reinforce" ? "convoy" : "back");
      // linie
      if (kind === "attack") {
        ctx.strokeStyle = f.color + "88";
        ctx.lineWidth = 2.2;
        ctx.setLineDash([7, 6]);
      } else if (kind === "convoy") {
        ctx.strokeStyle = f.color + "55";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([2.5, 5]);
      } else {
        ctx.strokeStyle = "rgba(190,195,205,0.35)";
        ctx.lineWidth = 1.4;
        ctx.setLineDash([4, 7]);
      }
      ctx.lineDashOffset = -(now / 60) % 13;
      ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
      ctx.setLineDash([]);
      // šipka u cíle útoku
      if (kind === "attack") {
        const ang = Math.atan2(to.y - from.y, to.x - from.x);
        const tipX = to.x - Math.cos(ang) * (HEX_SIZE * 0.55);
        const tipY = to.y - Math.sin(ang) * (HEX_SIZE * 0.55);
        ctx.fillStyle = f.color + "cc";
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - Math.cos(ang - 0.45) * 9, tipY - Math.sin(ang - 0.45) * 9);
        ctx.lineTo(tipX - Math.cos(ang + 0.45) * 9, tipY - Math.sin(ang + 0.45) * 9);
        ctx.closePath(); ctx.fill();
      }
      // pochodující oddíl
      const px = from.x + (to.x - from.x) * prog;
      const py = from.y + (to.y - from.y) * prog;
      const mdx = to.x - from.x, mdy = to.y - from.y;
      const mlen = Math.hypot(mdx, mdy) || 1;
      const mux = mdx / mlen, muy = mdy / mlen;   // směr pochodu
      const mnx = -muy, mny = mux;                // kolmice (dvojstup)
      // kometový ohon pohybových ultimátek (Křídla bouře, Stínochod, Oko bouře, Věčný návrat)
      const tfx = m.heroIdx != null ? ultFxFor(f, m.heroIdx) : null;
      if (tfx && tfx.trail) {
        const ang = Math.atan2(to.y - from.y, to.x - from.x);
        for (let k = 1; k <= 4; k++) {
          ctx.save();
          ctx.globalAlpha = 0.45 * (1 - k / 5);
          ctx.fillStyle = tfx.color;
          ctx.beginPath();
          ctx.arc(px - Math.cos(ang) * k * 7, py - Math.sin(ang) * k * 7, 6.5 - k, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      // kolona figurek pochoduje po trase (dvojstup, každý mírně mimo krok)
      const total = armyTotal(m.army);
      const nFig = Math.max(2, Math.min(7, 2 + Math.floor(Math.sqrt(total) / 4)));
      const grey = kind === "back";
      const bodyColor = grey ? "#9aa0ab" : f.color;
      const walked = prog * mlen;
      for (let i = nFig - 1; i >= 0; i--) { // zezadu, ať čelo překrývá zástup
        const back = Math.min(i * 7.5, walked); // kolona se nenatahuje za start
        const lat = i === 0 ? 0 : (i % 2 ? 2.8 : -2.8);
        const fx = px - mux * back + mnx * lat;
        const fy = py - muy * back + mny * lat;
        const phase = now / 110 + i * 1.15 + m.total * 0.7; // pochodový krok
        if (i === 0 && m.heroIdx != null && f.heroes[m.heroIdx]) {
          // v čele kolony pochoduje samotný hrdina (jeho vlastní silueta)
          kresliFigurku(ctx, fx, fy, {
            fkey: f.key, color: grey ? "#9aa0ab" : f.color,
            trait: heroDef(f, m.heroIdx).trait,
            sprite: `hero_${f.key}_${f.heroes[m.heroIdx].defIdx}`,
            dir: mux, mode: "walk", now, phase,
            smer: { dx: mux, dy: muy }, odstin: grey ? SEDY_ODSTIN : null,
          });
        } else if (figurkyVe3D()) {
          // ⚠ Praporečník a vůz zůstaly jen ve 2D záloze: míchat plochou
          // kresbu s 3D figurkami v jedné koloně vypadá hůř než jednotný
          // zástup. Kolonu tedy tvoří domobrana a v čele hrdina.
          kresliFigurku(ctx, fx, fy, {
            sprite: MILICE_MODEL, dir: mux, mode: "walk", now, phase,
            smer: { dx: mux, dy: muy }, odstin: grey ? SEDY_ODSTIN : null,
          });
        } else if (i === 0 && kind === "attack") {
          drawBannerman(ctx, fx, fy, mux, phase, f.color);
        } else if (i === 0 && kind === "convoy") {
          drawWagon(ctx, fx, fy, mux, now, f.color);
        } else {
          drawMarcher(ctx, fx, fy, mux, phase, bodyColor, grey);
        }
      }
      // počet vojáků nad čelem kolony
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.font = "bold 8px sans-serif";
      ctx.lineJoin = "round";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(10,12,16,0.75)";
      ctx.strokeText(String(total), px, py - 17);
      ctx.fillStyle = grey ? "#c9ccd4" : "#fff";
      ctx.fillText(String(total), px, py - 17);
      // vlastní pochody: jméno hrdiny nad kolonou, ať je jasné, kdo kam jde
      if (f.id === G.playerFaction && m.heroIdx != null && f.heroes[m.heroIdx]) {
        const hname = heroDef(f, m.heroIdx).name;
        ctx.font = "7px sans-serif";
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = "rgba(10,12,16,0.7)";
        ctx.strokeText(hname, px, py - 26);
        ctx.fillStyle = "#e8e2d2";
        ctx.fillText(hname, px, py - 26);
        if (selectedMarchHero === m.heroIdx) { // vybraný pochod: pulsující kroužek
          ctx.save();
          ctx.strokeStyle = f.color;
          ctx.globalAlpha = 0.55 + 0.35 * Math.sin(now / 220);
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          ctx.ellipse(px, py + 2, 14, 14 * ISO_SQUASH, 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  // čekající rozkazy (v0.26): hrdina s doručovanými posilami ukazuje na mapě
  // tečkovanou trasu ke svému budoucímu cíli
  const mujf = G.factions[G.playerFaction];
  if (mujf) for (const hh of mujf.heroes) {
    if (!hh.rozkaz || !hh.pos) continue;
    const ht = G.tiles.get(hh.pos), ct = G.tiles.get(hh.rozkaz.targetKey);
    if (!ht || !ct) continue;
    const from = tileToPixel(ht.q, ht.r);
    const to = tileToPixel(ct.q, ct.r);
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = mujf.color;
    ctx.lineWidth = 1.8;
    ctx.setLineDash([3, 6]);
    ctx.lineDashOffset = -(now / 90) % 9;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    ctx.setLineDash([]);
    const ang = Math.atan2(to.y - from.y, to.x - from.x);
    const tipX = to.x - Math.cos(ang) * (HEX_SIZE * 0.55);
    const tipY = to.y - Math.sin(ang) * (HEX_SIZE * 0.55);
    ctx.fillStyle = mujf.color;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - Math.cos(ang - 0.45) * 8, tipY - Math.sin(ang - 0.45) * 8);
    ctx.lineTo(tipX - Math.cos(ang + 0.45) * 8, tipY - Math.sin(ang + 0.45) * 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // plánovaná trasa pochodu (náhled před potvrzením): průhledná, pulsující
  if (marchPreview) {
    const from = tileToPixel(marchPreview.from.q, marchPreview.from.r);
    const to = tileToPixel(marchPreview.to.q, marchPreview.to.r);
    ctx.save();
    ctx.globalAlpha = 0.42 + 0.16 * Math.sin(now / 260);
    ctx.lineCap = "round";
    ctx.setLineDash([12, 9]);
    ctx.lineDashOffset = -(now / 45) % 21;
    // tmavá podkladová linka, ať je náhled čitelný i nad vlastním územím
    ctx.strokeStyle = "rgba(8,10,14,0.9)";
    ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    ctx.strokeStyle = marchPreview.color;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(from.x, from.y); ctx.lineTo(to.x, to.y); ctx.stroke();
    ctx.setLineDash([]);
    const ang = Math.atan2(to.y - from.y, to.x - from.x);
    const tipX = to.x - Math.cos(ang) * (HEX_SIZE * 0.5);
    const tipY = to.y - Math.sin(ang) * (HEX_SIZE * 0.5);
    ctx.fillStyle = marchPreview.color;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(tipX - Math.cos(ang - 0.45) * 13, tipY - Math.sin(ang - 0.45) * 13);
    ctx.lineTo(tipX - Math.cos(ang + 0.45) * 13, tipY - Math.sin(ang + 0.45) * 13);
    ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  // bitvy: bijící se figurky na polích čerstvých střetů
  drawClashes(now, tickFrac);

  ctx.restore();

  // popelná bouře: poletující popel a rudá viněta přes celou obrazovku
  if (G.storm > 0) {
    const w = canvas.width, h = canvas.height;
    const fade = Math.min(1, Math.min(G.storm, STORM_DUR - G.storm + 1) / 5); // náběh/dozvuk
    ctx.save();
    ctx.globalAlpha = 0.16 * fade;
    const vg = ctx.createRadialGradient(w / 2, h / 2, h * 0.25, w / 2, h / 2, h * 0.75);
    vg.addColorStop(0, "rgba(120,40,25,0)");
    vg.addColorStop(1, "rgba(120,40,25,1)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.55 * fade;
    ctx.fillStyle = "#c9b8a8";
    for (let i = 0; i < 46; i++) {
      const sx = ((i * 173.3 + now * (0.08 + (i % 5) * 0.02)) % (w + 40)) - 20;
      const sy = ((i * 97.7 + now * (0.045 + (i % 3) * 0.015)) % (h + 30)) - 15;
      const s = 1 + (i % 3) * 0.7;
      ctx.globalAlpha = (0.2 + 0.35 * ((i * 7919) % 100) / 100) * fade;
      ctx.fillRect(sx, sy, s, s);
    }
    ctx.restore();
  }

  if (figurkyVe3D()) R3.setFigurky(figurky3d);
  kresliMinimapu();
}

// ---------- minimapa (v0.33) ----------
// Přehled celého světa vpravo dole: území frakcí, klíčové stavby, rámeček
// pohledu kamery. Podklad se přepočítává 1× za tik do offscreen plátna,
// každý snímek se jen blitne + přikreslí rámeček. Klik/tah = skok kamery
// (binding v main.js přes miniToWorld).
const MINI_W = 232, MINI_H = 148, MINI_PAD = 6;
let miniData = null, miniCtx = null, miniTik = -2;
let miniScale = 0, miniOx = 0, miniOy = 0, miniSchovana = true;

function miniToWorld(mx, my) {
  if (!miniScale) return null;
  return { x: (mx - miniOx) / miniScale, y: (my - miniOy) / miniScale };
}

function kresliMinimapu() {
  const el = document.getElementById("minimap");
  if (!el) return;
  const zapnuta = G.running && G.tiles.size > 0 && worldW > 0;
  if (zapnuta === miniSchovana) { // stav se změnil → přepnout třídu
    el.classList.toggle("hidden", !zapnuta);
    miniSchovana = !zapnuta;
    if (!zapnuta) miniTik = -2;
  }
  if (!zapnuta) return;
  if (el.width !== MINI_W) { el.width = MINI_W; el.height = MINI_H; }
  miniScale = Math.min((MINI_W - MINI_PAD * 2) / worldW, (MINI_H - MINI_PAD * 2) / worldH);
  miniOx = (MINI_W - worldW * miniScale) / 2 - worldMinX * miniScale;
  miniOy = (MINI_H - worldH * miniScale) / 2 - worldMinY * miniScale;

  if (miniTik !== G.tick) {
    miniTik = G.tick;
    if (!miniData) {
      miniData = document.createElement("canvas");
      miniData.width = MINI_W; miniData.height = MINI_H;
      miniCtx = miniData.getContext("2d");
    }
    const c = miniCtx;
    c.clearRect(0, 0, MINI_W, MINI_H);
    // silueta CELÉHO světa (viz kresliNeznamouZemi). Na minimapě stačí jeden
    // čtyřúhelník přes rohy čtverce — schody dlaždic jsou v tomhle měřítku
    // pod jeden pixel, takže se per-pole procházet nemusí (na 461×461 by to
    // bylo 212 000 obdélníčků za tik).
    if (typeof MAP_R === "number" && MAP_R > 0) {
      const rohy = [[MAP_R, MAP_R], [MAP_R, -MAP_R], [-MAP_R, -MAP_R], [-MAP_R, MAP_R]];
      c.beginPath();
      rohy.forEach(([q, r], i) => {
        const p = tileToPixel(q, r);
        const x = p.x * miniScale + miniOx, y = p.y * miniScale + miniOy;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      });
      c.closePath();
      c.fillStyle = NEZNAMA_ZEM;
      c.fill();
    }
    // pecka pole: kosočtverec by se v téhle velikosti slil, obdélníček stačí
    const tw = Math.max(1.2, 2 * KOSO * miniScale);
    const th = Math.max(1.2, 2 * KOSO * ISO_SQUASH * miniScale);
    for (const t of G.tiles.values()) {
      const key = keyOf(t.q, t.r);
      const p = tileToPixel(t.q, t.r);
      const x = p.x * miniScale + miniOx, y = p.y * miniScale + miniOy;
      let col;
      if (t.owner !== -1) col = G.factions[t.owner].color;
      else if (!TERRAIN[t.terrain].passable) col = "rgba(58,76,104,0.6)";   // řeky a hradby
      else if (!isExplored(key)) col = "rgba(22,26,35,0.9)";
      else col = "rgba(58,62,52,0.9)";
      c.fillStyle = col;
      c.fillRect(x - tw / 2, y - th / 2, tw, th);
    }
    // klíčové stavby jako tečky (Trůn zlatě, kapitály/města bíle)
    for (const t of G.tiles.values()) {
      if (t.big || !t.structure) continue;
      if (!["throne", "capital", "grandfort", "city"].includes(t.structure)) continue;
      const p = tileToPixel(t.q, t.r);
      const vyznamna = t.structure === "throne" || t.structure === "capital";
      c.fillStyle = t.structure === "throne" ? "#ffd455"
        : t.owner !== -1 ? "#fff" : "rgba(215,220,230,0.7)";
      const s = vyznamna ? 3 : 2;
      c.fillRect(p.x * miniScale + miniOx - s / 2, p.y * miniScale + miniOy - s / 2, s, s);
    }
  }

  const mc = el.getContext("2d");
  mc.clearRect(0, 0, MINI_W, MINI_H);
  mc.drawImage(miniData, 0, 0);
  // rámeček pohledu: obraz kryje osový obdélník world souřadnic (bez rotace)
  const vw = canvas.width / camera.zoom * miniScale;
  const vh = canvas.height / camera.zoom * miniScale;
  const vx = camera.x * miniScale + miniOx - vw / 2;
  const vy = camera.y * miniScale + miniOy - vh / 2;
  mc.strokeStyle = "rgba(255,246,220,0.85)";
  mc.lineWidth = 1;
  mc.strokeRect(vx, vy, Math.min(vw, MINI_W * 2), Math.min(vh, MINI_H * 2));
}

// ---------- figurky hrdinů ----------
// hrdina jako postavička na mapě. Primárně předrenderovaný sprite z Blenderu
// (unikátní silueta každého z 20 hrdinů, art/blender/make_heroes.py) oživený
// transformacemi: idle pohupování, pochodový krok (houpání + naklánění),
// boj (výpady a záklony). Nohy spritu jsou v ukotvení ~66,8 % výšky obrázku
// (kamera míří na bod 0.45 j. nad zem). Než se sprity načtou, kreslí se
// vektorová silueta podle rasy a povahy.
// ---------- figurky: 3D místo spritů (v0.66, PLAN IV-J bod 7) ----------
// Hrdinové i pochodující zástup se od v0.66 kreslí ve 3D vrstvě (R3), ne jako
// ploché sprity v překryvu. Sběr je ale pořád TADY, protože polohy počítá 2D
// kreslení (interpolace pochodu, rozestavení kolony, sloty hrdinů na poli) —
// každý snímek se naplní `figurky3d` a na konci draw() se pošlou do R3.
//
// ⚠ Seznam se do 3D dostane o JEDEN SNÍMEK POZDĚJI, protože `R3.render()` běží
// na začátku draw(), kdežto polohy vznikají až při kreslení překryvu nad ním.
// Při 60 snímcích je to pod 2 px a nestojí za druhý průchod mapou.
//
// Když modely ještě nedorazily (lazy load) nebo 3D vrstva neběží, kreslí se
// dál původní sprity — `drawHeroFigure` zůstává jako plnohodnotná záloha.
let figurky3d = [];
const MILICE_MODEL = "hero_militia";
// odstín šedé kolony na cestě domů (2D verze používá #9aa0ab)
const SEDY_ODSTIN = [0.62, 0.65, 0.70];

function figurkyVe3D() {
  return map3dReady && window.R3 && typeof R3.setFigurky === "function";
}

// Jediné místo, kde se rozhoduje 3D × sprite. `o` je tentýž objekt, jaký brala
// `drawHeroFigure`, plus volitelně:
//   o.smer   … {dx, dy} směr pochodu ve 2D pixelech
//   o.odstin … [r,g,b] násobič barvy (šedý návrat domů)
function kresliFigurku(c, x, y, o) {
  if (!figurkyVe3D() || !o.sprite) { drawHeroFigure(c, x, y, o); return; }
  // ⚠ Model nemusí existovat — sedmý hrdina každého rodu (ranhojič z v0.52)
  // nemá stavitele v make_heroes.py, takže nemá ani sprite, ani figurku.
  // Bez téhle větve by byl ve 3D NEVIDITELNÝ, kdežto dřív ho kreslila
  // vektorová silueta. Ta se proto musí uplatnit dál.
  if (R3.stavFigurky && R3.stavFigurky(o.sprite) === "chybi") {
    drawHeroFigure(c, x, y, o); return;
  }
  figurky3d.push({
    klic: o.sprite, x, y,
    // bez směru pochodu se figurka staví tříčtvrtečně ke kameře; `dir` z 2D
    // (±1) jen určuje, na kterou stranu je natočená
    uhel: o.smer || { dx: o.dir < 0 ? -1 : 1, dy: 0.42 },
    rezim: o.mode === "walk" ? "jde" : "stoji",
    faze: o.phase || 0,
    odstin: o.odstin || null,
    mlha: o.mlha === undefined ? 1 : o.mlha,
  });
}

const HERO_SPRITE_W = 38;       // šířka spritu ve world px
const HERO_FEET_FRAC = 0.668;   // svislá poloha nohou ve spritu

function drawHeroFigure(c, x, y, o) {
  const img = o.sprite ? ASSETS[o.sprite] : null;
  if (img && img.complete && img.naturalWidth) {
    const walking = o.mode === "walk", fight = o.mode === "fight";
    const step = walking ? Math.sin(o.phase) : 0;
    const bob = walking ? Math.abs(step) * 1.6
      : (o.mode === "idle" ? Math.sin(o.now / 650 + x * 0.13) * 0.6 : 0);
    const rock = walking ? step * 0.09
      : (fight ? Math.sin(o.now / 130) * 0.10 : Math.sin(o.now / 900 + x) * 0.02);
    const lunge = fight ? Math.max(0, Math.sin(o.now / 260)) * 3.5 : 0;
    const s = o.dir < 0 ? -1 : 1;
    c.save();
    // měkký kontaktní stín
    c.fillStyle = "rgba(0,0,0,0.28)";
    c.beginPath(); c.ellipse(x, y + 1.5, 7, 2.6, 0, 0, Math.PI * 2); c.fill();
    c.translate(x + lunge * s, y - bob);
    c.scale(s, 1);
    c.rotate(rock);
    c.drawImage(img, -HERO_SPRITE_W / 2, -HERO_SPRITE_W * HERO_FEET_FRAC,
      HERO_SPRITE_W, HERO_SPRITE_W);
    c.restore();
    return;
  }
  drawHeroFigureVec(c, x, y, o);
}

function drawHeroFigureVec(c, x, y, o) {
  const look = (typeof RACE_LOOK !== "undefined" && RACE_LOOK[o.fkey]) || null;
  const race = look ? look.race : "human";
  const skin = look ? look.skins[0] : "#e8d9b8";
  const s = o.dir < 0 ? -1 : 1;
  const walking = o.mode === "walk";
  const fight = o.mode === "fight";
  const step = walking ? Math.sin(o.phase) : 0;
  const bob = walking ? Math.abs(step) * 1.4
    : (o.mode === "idle" ? Math.sin(o.now / 650 + x * 0.13) * 0.5 : 0);
  const lunge = fight ? Math.max(0, Math.sin(o.now / 260)) * 3 : 0;
  const orc = race === "orc";
  const H = orc ? 11.5 : 12.5; // výška těla (nohy→ramena)
  c.save();
  c.translate(x + lunge * s, y - bob);
  c.scale(s, 1);
  c.lineCap = "round";
  // nohy
  c.strokeStyle = "#2b2620";
  c.lineWidth = orc ? 2.2 : 1.8;
  c.beginPath();
  c.moveTo(0, -4); c.lineTo(step * 3.2, 0);
  c.moveTo(0, -4); c.lineTo(-step * 2.8, 0);
  c.stroke();
  // plášť rychlých vlaje dozadu
  if (o.trait === "swift") {
    const w = Math.sin(o.now / 240) * 1.2 + (walking ? 1.5 : 0);
    c.fillStyle = shade(o.color, -0.18);
    c.beginPath();
    c.moveTo(-1, -H);
    c.quadraticCurveTo(-5 - w, -H + 4, -6.5 - w, -2.5);
    c.lineTo(-2.5, -4);
    c.closePath(); c.fill();
  }
  // tělo v barvě frakce + opasek
  c.strokeStyle = o.color;
  c.lineWidth = orc ? 4.2 : 3.4;
  c.beginPath(); c.moveTo(0, -4); c.lineTo(0, -H); c.stroke();
  c.strokeStyle = "rgba(0,0,0,0.4)";
  c.lineWidth = 1;
  c.beginPath(); c.moveTo(-1.8, -5.2); c.lineTo(1.8, -5.2); c.stroke();
  // hlava
  const hy = -H - 2.6;
  c.fillStyle = skin;
  c.beginPath(); c.arc(0, hy, orc ? 2.6 : 2.3, 0, Math.PI * 2); c.fill();
  // rasové rysy
  if (race === "elf") { // špičaté ucho
    c.fillStyle = skin;
    c.beginPath(); c.moveTo(-2, hy); c.lineTo(-4.2, hy - 1.8); c.lineTo(-1.8, hy - 1); c.closePath(); c.fill();
  } else if (race === "orc") { // kly zpod čelisti
    c.fillStyle = "#f2eedd";
    c.fillRect(-1.7, hy + 1.2, 1, 1.4);
    c.fillRect(0.7, hy + 1.2, 1, 1.4);
  } else if (race === "demon") { // rohy
    c.strokeStyle = "#57333a";
    c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(-1.8, hy - 1.4); c.quadraticCurveTo(-3.4, hy - 3.8, -2.3, hy - 5.6); c.stroke();
    c.beginPath(); c.moveTo(1.8, hy - 1.4); c.quadraticCurveTo(3.4, hy - 3.8, 2.3, hy - 5.6); c.stroke();
  }
  // přilba (lidé, orkové) / kápě (elfové)
  if (race === "human" || race === "orc") {
    c.fillStyle = shade(o.color, 0.14);
    c.beginPath(); c.arc(0, hy - 0.7, orc ? 2.8 : 2.4, Math.PI, 2 * Math.PI); c.fill();
    if (o.trait === "warlord") { // chochol vojevůdce
      c.fillStyle = shade(o.color, 0.35);
      c.beginPath(); c.ellipse(0, hy - 3.4, 0.9, 1.7, 0, 0, Math.PI * 2); c.fill();
    }
  } else if (race === "elf") {
    c.fillStyle = shade(o.color, -0.1);
    c.beginPath(); c.arc(0, hy - 0.5, 2.5, Math.PI * 0.95, Math.PI * 2.05); c.fill();
  }
  // výzbroj podle povahy
  const swing = fight ? Math.sin(o.now / 130) * 0.8 : (walking ? step * 0.15 : 0);
  if (o.trait === "attack") { // napřažený meč
    c.save();
    c.translate(2.2, -H + 2);
    c.rotate(-0.7 + swing);
    c.strokeStyle = "#d8d4c4"; c.lineWidth = 1.3;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -8); c.stroke();
    c.strokeStyle = "#8a7a55"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(-1.5, -1.5); c.lineTo(1.5, -1.5); c.stroke();
    c.restore();
  } else if (o.trait === "shield") { // štít — na stráži zvednutý a větší
    c.fillStyle = shade(o.color, 0.18);
    const sy = o.guard ? -H + 1 : -H + 3.5;
    c.beginPath(); c.ellipse(2.6, sy, 2.2, o.guard ? 3.4 : 2.8, 0, 0, Math.PI * 2); c.fill();
    c.strokeStyle = "rgba(0,0,0,0.35)"; c.lineWidth = 0.8; c.stroke();
  } else if (o.trait === "tireless") { // kopí
    c.strokeStyle = "#cdbf9f"; c.lineWidth = 1;
    c.beginPath(); c.moveTo(2.4, 0); c.lineTo(2.4, -H - 7 + swing * 2); c.stroke();
    c.fillStyle = "#d8d4c4";
    c.beginPath(); c.moveTo(2.4, -H - 7); c.lineTo(1.5, -H - 4.8); c.lineTo(3.3, -H - 4.8);
    c.closePath(); c.fill();
  } else if (o.trait === "warlord") { // zástava frakce
    c.strokeStyle = "#cdbf9f"; c.lineWidth = 1.1;
    c.beginPath(); c.moveTo(2.6, 0); c.lineTo(2.6, -H - 9); c.stroke();
    const w1 = Math.sin(o.now / 300) * 1.2;
    c.save();
    c.shadowColor = o.color; c.shadowBlur = 3;
    c.fillStyle = o.color;
    c.beginPath();
    c.moveTo(2.6, -H - 9);
    c.quadraticCurveTo(7.5, -H - 8 + w1, 9.5, -H - 6 + w1);
    c.lineTo(2.6, -H - 4.5);
    c.closePath(); c.fill();
    c.restore();
  } else if (o.trait === "swift") { // dýka
    c.strokeStyle = "#d8d4c4"; c.lineWidth = 1.1;
    c.beginPath(); c.moveTo(2.2, -6.5); c.lineTo(4.4, -9.5 + swing * 3); c.stroke();
  } else if (o.trait === "mystic") { // hůl se zářícím kamenem
    c.strokeStyle = "#8a7a55"; c.lineWidth = 1.1;
    c.beginPath(); c.moveTo(2.6, 0); c.lineTo(2.6, -H - 5.5 + swing); c.stroke();
    const glow = 0.6 + Math.sin(o.now / 220) * 0.4;
    c.save();
    c.shadowColor = o.color; c.shadowBlur = 5 * glow;
    c.fillStyle = shade(o.color, 0.4);
    c.beginPath(); c.arc(2.6, -H - 6.3 + swing, 1.4, 0, Math.PI * 2); c.fill();
    c.restore();
  } else if (o.trait === "healer") { // hůl s bylinným svazkem
    c.strokeStyle = "#8a7a55"; c.lineWidth = 1.1;
    c.beginPath(); c.moveTo(2.6, 0); c.lineTo(2.6, -H - 4 + swing); c.stroke();
    c.fillStyle = "#7fbf7a";
    c.beginPath(); c.ellipse(2.6, -H - 4.8 + swing, 1.5, 1, 0, 0, Math.PI * 2); c.fill();
  }
  c.restore();
}

// střety: na poli čerstvé bitvy se dvě figurky bijí v oblaku prachu
function drawClashes(now, tickFrac) {
  if (!G.clashes || !G.clashes.length) return;
  for (const cl of G.clashes) {
    const age = (G.tick - cl.tick) + tickFrac;
    if (age > 3 || !isExplored(cl.key)) continue;
    const t = G.tiles.get(cl.key);
    if (!t) continue;
    const { x, y } = tileToPixel(t.q, t.r);
    const attF = G.factions[cl.att];
    const defF = cl.def >= 0 ? G.factions[cl.def] : null;
    const fade = age > 2.2 ? Math.max(0, 1 - (age - 2.2) / 0.8) : 1;
    ctx.save();
    ctx.globalAlpha = fade;
    // zvířený prach
    ctx.fillStyle = "rgba(200,190,160,0.16)";
    for (let i = 0; i < 3; i++) {
      const a = now / 500 + i * 2.1;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * 6, y + 6 + Math.sin(a) * 1.5, 7, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // útočník zleva (jeho hrdina), obránce zprava (hrdina, jinak domobrana)
    drawHeroFigure(ctx, x - 7, y + 8, { fkey: attF.key, color: attF.color,
      trait: "attack", sprite: `hero_${attF.key}_${cl.attDef ?? 0}`,
      dir: 1, mode: "fight", now, phase: 0 });
    drawHeroFigure(ctx, x + 7, y + 8, { fkey: defF ? defF.key : "aldar",
      color: defF ? defF.color : "#8a8f9a", trait: "shield",
      sprite: defF && cl.defDef != null ? `hero_${defF.key}_${cl.defDef}` : "hero_militia",
      dir: -1, mode: "fight", now: now + 400, phase: 0 });
    // záblesk zkřížených čepelí
    const flash = Math.pow(Math.max(0, Math.sin(now / 120)), 4);
    if (flash > 0.3) {
      ctx.globalAlpha = fade * flash;
      ctx.strokeStyle = "#fff2c0";
      ctx.shadowColor = "#ffd94d"; ctx.shadowBlur = 8;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x - 4, y - 9); ctx.lineTo(x + 4, y - 3); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x + 4, y - 9); ctx.lineTo(x - 4, y - 3); ctx.stroke();
    }
    ctx.restore();
  }
}

// ---------- pochodující figurky ----------
// malý pěšák z boku: nohy v kroku, tělo v barvě frakce, kopí na rameni;
// dir určuje, kterým směrem je otočený (znaménko x-ové složky pochodu)
function drawMarcher(ctx, x, y, dir, phase, color, grey) {
  const s = dir < 0 ? -1 : 1;
  const step = Math.sin(phase);
  const bob = Math.abs(step) * 1.2; // houpnutí při došlapu
  ctx.save();
  ctx.translate(x, y - bob);
  ctx.scale(s, 1);
  ctx.lineCap = "round";
  // nohy
  ctx.strokeStyle = grey ? "rgba(80,83,92,0.9)" : "#2b2620";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -2.5); ctx.lineTo(step * 2.6, 2.8);
  ctx.moveTo(0, -2.5); ctx.lineTo(-step * 2.2, 2.8);
  ctx.stroke();
  // kopí na rameni, hrot mírně kmitá s krokem
  ctx.strokeStyle = grey ? "rgba(150,152,160,0.85)" : "#cdbf9f";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-2, -3.5); ctx.lineTo(4.5, -11.5 + step * 0.7);
  ctx.stroke();
  // tělo
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(0, -2.5); ctx.lineTo(0, -7); ctx.stroke();
  // hlava
  ctx.fillStyle = grey ? "#b9bcc4" : "#e8d9b8";
  ctx.beginPath(); ctx.arc(0, -8.6, 1.9, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// praporečník v čele útočné kolony — vlající zástava frakce
function drawBannerman(ctx, x, y, dir, phase, color) {
  const s = dir < 0 ? -1 : 1;
  const step = Math.sin(phase);
  const bob = Math.abs(step) * 1.2;
  ctx.save();
  ctx.translate(x, y - bob);
  ctx.scale(s, 1);
  ctx.lineCap = "round";
  // nohy
  ctx.strokeStyle = "#2b2620";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -2.5); ctx.lineTo(step * 2.6, 2.8);
  ctx.moveTo(0, -2.5); ctx.lineTo(-step * 2.2, 2.8);
  ctx.stroke();
  // žerď
  ctx.strokeStyle = "#cdbf9f";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(1.5, -2); ctx.lineTo(1.5, -16); ctx.stroke();
  // zástava vlaje dozadu proti směru pochodu
  const w1 = Math.sin(phase * 1.7) * 1.1, w2 = Math.sin(phase * 1.3 + 1) * 1.4;
  ctx.save();
  ctx.shadowColor = color; ctx.shadowBlur = 4;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(1.5, -16);
  ctx.quadraticCurveTo(-4, -15 + w1, -9, -13.5 + w2);
  ctx.lineTo(-4, -11.5 + w1 * 0.5);
  ctx.quadraticCurveTo(-1, -11, 1.5, -10.8);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  // tělo + hlava
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.6;
  ctx.beginPath(); ctx.moveTo(0, -2.5); ctx.lineTo(0, -7); ctx.stroke();
  ctx.fillStyle = "#e8d9b8";
  ctx.beginPath(); ctx.arc(0, -8.6, 1.9, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// zásobovací vůz posil: korba s plachtou, kola s točícími se loukotěmi
function drawWagon(ctx, x, y, dir, now, color) {
  ctx.save();
  ctx.translate(x, y + Math.sin(now / 90) * 0.5); // drncání
  if (dir < 0) ctx.scale(-1, 1);
  const rot = now / 120;
  for (const wx of [-3.6, 3.6]) {
    ctx.strokeStyle = "#4a3b28";
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(wx, 2.4, 3, 0, Math.PI * 2); ctx.stroke();
    ctx.lineWidth = 0.9;
    for (const a of [rot, rot + Math.PI / 2]) {
      ctx.beginPath();
      ctx.moveTo(wx - Math.cos(a) * 2.6, 2.4 - Math.sin(a) * 2.6);
      ctx.lineTo(wx + Math.cos(a) * 2.6, 2.4 + Math.sin(a) * 2.6);
      ctx.stroke();
    }
  }
  // korba
  ctx.fillStyle = color;
  ctx.fillRect(-6, -2.6, 12, 4.2);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = 0.8;
  ctx.strokeRect(-6, -2.6, 12, 4.2);
  // plachta
  ctx.fillStyle = "rgba(235,228,210,0.92)";
  ctx.beginPath();
  ctx.moveTo(-6, -2.6);
  ctx.quadraticCurveTo(0, -8.5, 6, -2.6);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}
