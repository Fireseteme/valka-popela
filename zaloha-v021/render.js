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

let mapLayer = null, mapCtx = null, mapDrawnTick = -2;
let mapFilter = null; // null | "food" | "wood" | "gold" | "level"
let worldMinX = 0, worldMinY = 0, worldW = 0, worldH = 0;

// 3D vrstva (js/render3d.js). map3dPodpis drží, z čeho je postavená mapa —
// přestavuje se jen při změně terénu či staveb, ne každý tik.
let map3dReady = false;
let map3dPodpis = null;

// postaví (nebo přestaví) 3D mapu, když se změnil terén, stavby či rekvizity
function ensureMap3D() {
  if (!map3dReady || !R3.ready || !G.tiles.size) return;
  const { dilky, podpis } = mapModelList();
  if (podpis === map3dPodpis) return;
  map3dPodpis = podpis;
  R3.build(dilky);
  mapDrawnTick = -2;   // s novým terénem překreslit i 2D vrstvu (nouzová mapa)
}

// ---------- assety ----------
// Terén a stavby jsou od v0.16 3D modely (art/models/, načítá render3d.js).
// Jako obrázky zůstaly UŽ JEN figurky hrdinů — ty se pořád kreslí do 2D
// překryvu, takže se sprity zahodit nedají. Ušetřilo to ~12 MB při načtení.
const ASSET_FILES = {};
for (const b of ["aldar", "yllien", "durgar", "horda"])
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
function tileModel(t) {
  if (t.structure && t.structure !== "bridge") {
    if (t.structure === "capital") {
      const i = CAPITAL_POS.findIndex(p => p.q === t.q && p.r === t.r);
      return "capital_" + FACTION_DEFS[i >= 0 ? i : 0].key;
    }
    return t.structure; // city, throne, fortress, outpost, grandfort, bastion
  }
  switch (t.terrain) {
    // t.riv značí říční dílek a směr koryta (a = podél X, b = podél Z)
    case "water":  return t.riv ? "river_" + t.riv : "water";
    case "bridge": return "bridge_" + (t.riv || "a");
    // val hradby běží od rohu k rohu; kvadranty se shodnými znaménky souřadnic
    // mají hranu prstence podél světové X (wall_a), zbylé podél Z (wall_b)
    case "wall":   return (t.q > 0) === (t.r > 0) ? "wall_a" : "wall_b";
    case "ruins":  return "ruins";
    default:       return biomeOf(t.q, t.r) + "_" + t.terrain;
  }
}

// rekvizita suroviny na poli (pšenice, klády, lom, důl, svatyně); mohutnost
// roste s úrovní pole — stejná pravidla jako u dřívějších overlay spritů
function resModel(t) {
  if (t.structure || !t.res || t.terrain === "bridge") return null;
  if (!TERRAIN[t.terrain].passable) return null;
  const band = t.level >= 9 ? 3 : t.level >= 5 ? 2 : 1;
  return `res_${t.res}_${band}`;
}

// seznam dílků pro 3D vrstvu + podpis, podle kterého se pozná, že je potřeba
// mapu přestavět (mění se jen při stavbě/zboření, ne každý tik)
function mapModelList() {
  const ven = [];
  const podpis = [];
  for (const t of G.tiles.values()) {
    const m = tileModel(t);
    ven.push({ name: m, q: t.q, r: t.r });
    const rm = resModel(t);
    if (rm) ven.push({ name: rm, q: t.q, r: t.r });
    podpis.push(m, rm || "");
  }
  return { dilky: ven, podpis: podpis.join("|") };
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
function computeWorldBounds() {
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const t of G.tiles.values()) {
    const p = tileToPixel(t.q, t.r);
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
  }
  const m = HEX_SIZE * 2;
  worldMinX = minX - m; worldMinY = minY - m;
  worldW = maxX - minX + 2 * m; worldH = maxY - minY + 2 * m;
}

function ensureMapLayer() {
  if (!G.tiles.size) return false;
  if (mapLayer && mapDrawnTick === G.tick) return true;
  if (!mapLayer) {
    computeWorldBounds();
    mapLayer = document.createElement("canvas");
    mapLayer.width = Math.ceil(worldW * MAP_SCALE);
    mapLayer.height = Math.ceil(worldH * MAP_SCALE);
    mapCtx = mapLayer.getContext("2d");
  }
  renderMapLayer();
  mapDrawnTick = G.tick;
  return true;
}

function renderMapLayer() {
  const c = mapCtx;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, mapLayer.width, mapLayer.height);
  c.setTransform(MAP_SCALE, 0, 0, MAP_SCALE, -worldMinX * MAP_SCALE, -worldMinY * MAP_SCALE);

  // Terén kreslí 3D vrstva pod tímhle plátnem. Než se modely načtou (nebo
  // když WebGL chybí), vykreslí se nouzová plochá mapa, ať hráč nekouká do
  // prázdna — jakmile R3 hlásí hotovo, tahle větev se přeskočí.
  if (!map3dReady || !R3.ready) {
    const tiles = [...G.tiles.values()].sort((a, b) => a.r - b.r || a.q - b.q);
    for (const t of tiles) {
      const { x, y } = tileToPixel(t.q, t.r);
      const terr = TERRAIN[t.terrain];
      const j = tileJitter(t.q, t.r);
      const grad = c.createLinearGradient(x, y - HEX_SIZE, x, y + HEX_SIZE);
      grad.addColorStop(0, shade(terr.color, j * 0.05 + 0.045));
      grad.addColorStop(1, shade(terr.color, j * 0.05 - 0.055));
      tilePath(c, x, y, HEX_SIZE - 0.5);
      c.fillStyle = grad;
      c.fill();
      c.strokeStyle = "rgba(10,14,10,0.28)";
      c.lineWidth = 1;
      c.stroke();
      drawDecor(c, t, x, y, j);
      if (t.terrain === "bridge") drawBridge(c, t, x, y);
    }
  }

  // stupeň pole čitelný z barvy půdy: bohatá pole (200+) hřejí do zlata,
  // chudá (1–15) jsou vybledlá do šeda. Průhledný nádech přes 3D terén.
  for (const t of G.tiles.values()) {
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

  // území: jemný nádech + silná hranice jen na okrajích území
  for (const t of G.tiles.values()) {
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
  for (const t of G.tiles.values()) {
    const { x, y } = tileToPixel(t.q, t.r);
    if (!TERRAIN[t.terrain].passable) continue;
    if (!isExplored(keyOf(t.q, t.r))) continue;
    c.textAlign = "center"; c.textBaseline = "middle";
    if (t.structure) {
      // Trůnní město je do půlky sezóny pod ochranou příměří
      if (t.structure === "throne" && !G.throneOpen) {
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

  if (mapFilter) drawFilterOverlay(c);
  drawFogOverlay(c);
}

// ---------- mlha války ----------
// neprozkoumaná pole jsou v temnu, ale silueta terénu (hory, lesy, voda)
// prosvítá — hráč tuší, co ho čeká; prozkoumaná, ale právě neviditelná šednou
// jak moc je pole vidět: 1 = v dohledu, 0.45 = prozkoumané mimo dohled,
// 0.2 = neprozkoumané (silueta terénu prosvítá, hráč tuší, co ho čeká)
function fogFactor(key) {
  if (!G.factions.length) return 1;
  if (isVisible(key)) return 1;
  return isExplored(key) ? 0.45 : 0.2;
}

function drawFogOverlay(c) {
  if (!G.factions.length) return;
  const trojrozmerne = map3dReady && R3.ready;
  // Terén ztmavuje mlha rovnou ve 3D (R3.setFog) — plochý hexagon by nezakryl
  // vysoké stavby a hradby by z mlhy koukaly ven.
  if (trojrozmerne) R3.setFog(fogFactor);

  for (const t of G.tiles.values()) {
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

function drawFilterOverlay(c) {
  const me = G.factions[G.playerFaction];
  if (!me) return;
  c.textAlign = "center"; c.textBaseline = "middle";
  for (const t of G.tiles.values()) {
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
  const ang = (t.riv === "b" ? 0 : 90) * Math.PI / 180;
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
  const now = performance.now();

  // Plátno si hlídá vlastní rozměr samo. Layout se po startu ještě mění
  // (zavře se úvodní dialog, naskočí lišty) a když se buffer rozejde s CSS,
  // obraz se svisle stlačí a hlavně přestanou sedět kliknutí — screenToWorld
  // počítá v pixelech bufferu, ale myš chodí v CSS pixelech.
  const r = canvas.getBoundingClientRect();
  if (Math.round(r.width) !== canvas.width || Math.round(r.height) !== canvas.height)
    resizeCanvas();

  // 2D plátno je průhledné — pozadí i terén jsou pod ním (CSS gradient a 3D)
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 3D terén: kamera se dopočítá z herního camera{x,y,zoom}, takže promítá
  // do stejné soustavy jako tileToPixel a překryv nad tím sedí bez přepočtu
  if (map3dReady) {
    ensureMap3D();
    R3.render(camera.x, camera.y, camera.zoom);
  }

  if (!ensureMapLayer()) return;

  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-camera.x, -camera.y);

  // statická vrstva (území, jmenovky, filtry, mlha) — už bez stínu pod mapou,
  // ten dělá skutečné světlo ve 3D
  ctx.drawImage(mapLayer, worldMinX, worldMinY, worldW, worldH);

  // zvýraznění hover / výběr
  if (hoverKey && hoverKey !== selectedKey) {
    const t = G.tiles.get(hoverKey);
    if (t) {
      const { x, y } = tileToPixel(t.q, t.r);
      tilePath(ctx, x, y, HEX_SIZE - 1);
      ctx.strokeStyle = "rgba(255,255,255,0.55)";
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }
  }
  if (selectedKey) {
    const t = G.tiles.get(selectedKey);
    if (t) {
      const { x, y } = tileToPixel(t.q, t.r);
      const pulse = 0.55 + 0.45 * Math.sin(now / 280);
      ctx.save();
      ctx.shadowColor = "#e8c26a";
      ctx.shadowBlur = 10 + 6 * pulse;
      tilePath(ctx, x, y, HEX_SIZE - 1);
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
        drawHeroFigure(ctx, x - 4 + slot * 9, y + 8, {
          fkey: f.key, color: f.color, trait: heroDef(f, i).trait,
          sprite: `hero_${f.key}_${h.defIdx}`,
          dir: x > 1 ? -1 : 1, mode: "idle", now, phase: 0, guard: h.guard,
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
          drawHeroFigure(ctx, fx, fy, {
            fkey: f.key, color: grey ? "#9aa0ab" : f.color,
            trait: heroDef(f, m.heroIdx).trait,
            sprite: `hero_${f.key}_${f.heroes[m.heroIdx].defIdx}`,
            dir: mux, mode: "walk", now, phase,
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
}

// ---------- figurky hrdinů ----------
// hrdina jako postavička na mapě. Primárně předrenderovaný sprite z Blenderu
// (unikátní silueta každého z 20 hrdinů, art/blender/make_heroes.py) oživený
// transformacemi: idle pohupování, pochodový krok (houpání + naklánění),
// boj (výpady a záklony). Nohy spritu jsou v ukotvení ~66,8 % výšky obrázku
// (kamera míří na bod 0.45 j. nad zem). Než se sprity načtou, kreslí se
// vektorová silueta podle rasy a povahy.
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
