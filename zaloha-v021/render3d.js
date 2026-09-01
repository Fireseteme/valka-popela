/* Válka popela — 3D vrstva mapy (three.js).
 *
 * Nahrazuje předrenderované izo-sprity skutečnými modely z art/models/.
 * Zbytek hry se nemění: figurky hrdinů, pochody, jmenovky a efekty dál kreslí
 * render.js do 2D překryvu nad tímhle plátnem.
 *
 * PROČ TO LÍCUJE: ortografická kamera se nakloní o stejných 55° jako kamera
 * v Blenderu, takže vodorovná rovina se svisle stlačí přesně o cos(55°) —
 * tedy o ISO_SQUASH, se kterým hra počítá odjakživa. Když se navíc měřítko
 * nastaví na HEX_SIZE pixelů na blenderovou jednotku, promítne se pole (q,r)
 * do stejného bodu, jaký vrací tileToPixel(). Souřadnice si tedy odpovídají
 * 1:1 a 2D překryv se kreslí přes 3D bez jediného přepočtu.
 *
 * Modul je ES (kvůli importu three), zbytek hry jsou klasické skripty —
 * proto se ven vystrkuje přes window.R3.
 */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_DIR = "art/models/";
const TILT = 55 * Math.PI / 180;
const SQUASH = Math.cos(TILT);   // == ISO_SQUASH v render.js
const HEX_PX = 26;               // == HEX_SIZE v render.js (px na jednotku při zoomu 1)

// modely, které mapa může potřebovat — stejná sada, jakou dřív načítal render.js
const NAMES = [];
for (const b of ["aldar", "yllien", "durgar", "horda", "center"])
  for (const t of ["plains", "forest", "hills"]) NAMES.push(b + "_" + t);
NAMES.push("water", "river_a", "river_b", "bridge_a", "bridge_b", "wall_a", "wall_b",
  "ruins", "city", "fortress",
  "throne", "capital_aldar", "capital_yllien", "capital_durgar", "capital_horda",
  "outpost", "grandfort", "bastion");
for (const rk of ["food", "wood", "stone", "iron", "all"])
  for (let b = 1; b <= 3; b++) NAMES.push(`res_${rk}_${b}`);

let renderer = null, scene = null, cam = null, sun = null, korenMapy = null;
let sirka = 1, vyska = 1;
const modely = {};      // jméno → THREE.Object3D (načtená scéna z .glb)
const kusy = {};        // jméno → [{geometry, material, matrix}]
let nactenoVse = false;
let chybi = [];

// ---------- převod pole → 3D ----------
// Čtvercová mřížka „na koso": dílek je kosočtverec s půl úhlopříčkou
// DIAG = √1,5 (deska čtverce o straně √3 otočená při exportu o 45°).
// Otočku mřížky tedy nedělá kamera, ale tenhle převod — mřížkové (q, r)
// se promítá na světové osy (q−r, q+r), sousedé sdílejí hrany kosočtverců.
const DIAG = Math.sqrt(1.5);
function poleNa3D(q, r) {
  return { x: DIAG * (q - r), z: DIAG * (q + r) };
}

// Drobná mapa okolí: nebe nahoře, zem dole. Kovy (zlato, železo, ruda) v PBR
// nesvítí samy — zrcadlí okolí — a bez prostředí by byly ČERNÉ.
function prostredi() {
  const s = 16, h = 8, d = new Uint8Array(s * h * 4);
  const nebe = [150, 178, 224], zem = [92, 84, 70];
  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    for (let x = 0; x < s; x++) {
      const i = (y * s + x) * 4;
      for (let c = 0; c < 3; c++) d[i + c] = nebe[c] + (zem[c] - nebe[c]) * t;
      d[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(d, s, h, THREE.RGBAFormat);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const cil = pmrem.fromEquirectangular(tex);
  pmrem.dispose();
  tex.dispose();
  return cil.texture;
}

// ---------- inicializace ----------
function init(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearAlpha(0);            // pozadí kreslí CSS pod plátnem
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;  // PCFSoft je od three 0.185 zrušený
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  scene = new THREE.Scene();

  // ortografická kamera — měřítko i cíl se přenastavují každý snímek v render()
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 600);
  scene.add(cam);

  // Klíčové slunce. POZOR: oblohové světlo drž slabé (~0,4) — silnější zaplní
  // stíny tak, že vypadají, jako by se shadow mapa vůbec nekreslila.
  sun = new THREE.DirectionalLight(0xfff0d8, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  // Oblohu drž slabou — silnější zaplní stíny tak, že vypadají, jako by se
  // shadow mapa vůbec nekreslila. Kus jejího dílu teď nese prostředí.
  scene.add(new THREE.HemisphereLight(0xbfd6ff, 0x4a4436, 0.26));
  scene.environment = prostredi();
  scene.environmentIntensity = 0.35;

  const obrys = new THREE.DirectionalLight(0xffd9a8, 0.45);
  obrys.position.set(14, 9, -18);
  scene.add(obrys);

  korenMapy = new THREE.Group();
  scene.add(korenMapy);

  nactiModely();
}

function nactiModely() {
  const loader = new GLTFLoader();
  let zbyva = NAMES.length;
  for (const jmeno of NAMES) {
    loader.load(MODEL_DIR + jmeno + ".glb",
      g => {
        modely[jmeno] = g.scene;
        if (--zbyva === 0) nactenoVse = true;
      },
      undefined,
      () => {                       // chybějící model hru nesmí položit
        chybi.push(jmeno);
        if (--zbyva === 0) nactenoVse = true;
      });
  }
}

// Rozebere model na dvojice (geometrie, materiál) i s místní transformací.
// Z toho se staví InstancedMesh — bez instancování má plná mapa přes 6 000
// volání kreslení a běží na 4 snímcích za sekundu, s ním 146 volání a 120.
// instanceColor násobí jen rozptýlenou složku, NE záři — bez tohohle by lávová
// pole a krystaly svítily skrz neprozkoumanou mlhu jako světlušky ve tmě.
const jizUpravene = new WeakSet();
function mlhaDoZare(mat) {
  for (const m of (Array.isArray(mat) ? mat : [mat])) {
    if (!m || jizUpravene.has(m)) continue;
    jizUpravene.add(m);
    if (!m.emissiveMap && (!m.emissive || m.emissive.getHex() === 0)) continue;
    // Vede se VLASTNÍ varying, ne vestavěné vColor: jestli three zrovna
    // definuje USE_COLOR, nebo USE_COLOR_ALPHA, se mezi verzemi mění a
    // podmínka pak tiše vypadne. Atribut instanceColor je oproti tomu smluvní.
    m.onBeforeCompile = s => {
      s.vertexShader = s.vertexShader
        .replace("void main() {", "varying vec3 vMlha;\nvoid main() {")
        .replace("#include <begin_vertex>",
          ["#ifdef USE_INSTANCING_COLOR", "  vMlha = instanceColor;",
           "#else", "  vMlha = vec3( 1.0 );", "#endif",
           "#include <begin_vertex>"].join("\n"));
      s.fragmentShader = s.fragmentShader
        .replace("void main() {", "varying vec3 vMlha;\nvoid main() {")
        .replace("#include <emissivemap_fragment>",
          // Na druhou, ne lineárně: láva svítí mnohonásobně přes jedničku, takže
          // prosté vynásobení mlhou 0,18 propustí ještě 43 % oranžové. Zdroj
          // světla má ve tmě mizet rychleji než plocha, kterou nasvěcuje.
          ["#include <emissivemap_fragment>",
           "  totalEmissiveRadiance *= vMlha * vMlha;"].join("\n"));
    };
    // Bez vlastního klíče si three sáhne pro dřív přeložený program a záplata
    // se nikdy neprojeví — onBeforeCompile do klíče keše sám nevstupuje.
    m.customProgramCacheKey = () => "vp-mlha-zare";
    m.needsUpdate = true;
  }
}

function rozeber(jmeno) {
  if (kusy[jmeno]) return kusy[jmeno];
  const koren = modely[jmeno];
  const ven = [];
  if (!koren) return (kusy[jmeno] = ven);
  koren.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(koren.matrixWorld).invert();
  koren.traverse(o => {
    if (!o.isMesh) return;
    mlhaDoZare(o.material);
    ven.push({
      geometry: o.geometry,
      material: o.material,
      matrix: new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld),
    });
  });
  return (kusy[jmeno] = ven);
}

// Všechna pole téhož druhu sdílejí jednu zapečenou texturu, takže by se mapa
// bez tohohle četla jako kopírovaná tapeta. Odstín se odvozuje z klíče pole,
// takže je stálý — po přestavbě mapy neposkočí.
function odstinPole(klic, kam, kde) {
  let h = 2166136261;
  for (let i = 0; i < klic.length; i++) {
    h ^= klic.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const jas = 0.93 + ((h >>> 8) & 255) / 255 * 0.14;    // +-7 % jasu
  const teplo = 0.97 + ((h >>> 16) & 255) / 255 * 0.06; // špetka do tepla/chladu
  kam[kde] = jas * teplo;
  kam[kde + 1] = jas;
  kam[kde + 2] = jas / teplo;
}

// ---------- stavba mapy ----------
// dilky = [{ name, q, r }] — jedno pole může mít víc záznamů (terén + rekvizita)
let rozsah = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };

function build(dilky) {
  if (!korenMapy) return;
  for (const d of [...korenMapy.children]) {
    korenMapy.remove(d);
    if (d.isInstancedMesh) d.dispose();
  }
  const podleDruhu = new Map();
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const d of dilky) {
    if (!modely[d.name]) continue;
    let pole = podleDruhu.get(d.name);
    if (!pole) podleDruhu.set(d.name, pole = []);
    const p = poleNa3D(d.q, d.r);
    p.key = d.q + "," + d.r;
    pole.push(p);
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
  }
  const posun = new THREE.Matrix4(), pom = new THREE.Matrix4();
  const odstin = new THREE.Color();
  for (const [jmeno, mista] of podleDruhu) {
    for (const kus of rozeber(jmeno)) {
      const im = new THREE.InstancedMesh(kus.geometry, kus.material, mista.length);
      im.castShadow = true;
      im.receiveShadow = true;
      const odstiny = new Float32Array(mista.length * 3);
      mista.forEach((p, i) => {
        posun.makeTranslation(p.x, 0, p.z);
        pom.multiplyMatrices(posun, kus.matrix);
        im.setMatrixAt(i, pom);
        odstinPole(p.key, odstiny, i * 3);
        odstin.setRGB(odstiny[i * 3], odstiny[i * 3 + 1], odstiny[i * 3 + 2]);
        im.setColorAt(i, odstin);   // zakládá i instanceColor, které pak přebírá setFog
      });
      im.userData.odstiny = odstiny;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      // pořadí klíčů polí = pořadí instancí; podle něj setFog ztmavuje
      im.userData.klice = mista.map(m => m.key);
      korenMapy.add(im);
    }
  }
  if (minX < 1e9) rozsah = { minX, maxX, minZ, maxZ };
}

// Mlha války PŘÍMO VE 3D. Plochý tmavý hexagon ve 2D nestačil — vysoké stavby
// (hradby, věže, hory) z něj koukaly ven, protože přesahují půdorys pole.
// Ztmavení se proto přičte instanci: 1 = vidím, ~0,45 = prozkoumané mimo
// dohled, ~0,2 = neprozkoumané.
const barvaMlhy = new THREE.Color();
function setFog(faktorProKlic) {
  if (!korenMapy) return;
  for (const im of korenMapy.children) {
    if (!im.isInstancedMesh || !im.userData.klice) continue;
    const klice = im.userData.klice;
    const o = im.userData.odstiny;
    for (let i = 0; i < klice.length; i++) {
      const f = faktorProKlic(klice[i]);
      barvaMlhy.setRGB(o[i * 3] * f, o[i * 3 + 1] * f, o[i * 3 + 2] * f);
      im.setColorAt(i, barvaMlhy);
    }
    if (im.instanceColor) im.instanceColor.needsUpdate = true;
  }
}

// ---------- kreslení ----------
function resize(w, h) {
  if (!renderer) return;
  sirka = Math.max(1, w); vyska = Math.max(1, h);
  renderer.setSize(sirka, vyska, false);
}

// camX/camY jsou souřadnice ve 2D světě hry (stejné, jaké drží render.js),
// zoom je herní přiblížení. Kamera se nastaví tak, aby střed plátna ležel
// přesně na (camX, camY) a jedna blenderová jednotka měla HEX_PX*zoom pixelů.
function render(camX, camY, zoom) {
  if (!renderer || !scene || !cam) return;
  const k = HEX_PX * zoom;              // pixelů na jednotku
  // střed plátna = bod (camX, camY) ve 2D světě hry; zpět na 3D souřadnice
  const cx = camX / HEX_PX;
  const cz = camY / (HEX_PX * SQUASH);

  cam.left = -sirka / 2 / k;
  cam.right = sirka / 2 / k;
  cam.top = vyska / 2 / k;
  cam.bottom = -vyska / 2 / k;
  cam.near = 0.1;
  cam.far = 600;
  // pozice po směru náklonu: nahoru cos(55°), dozadu sin(55°)
  const D = 220;
  cam.position.set(cx, D * SQUASH, cz + D * Math.sin(TILT));
  cam.up.set(0, 1, 0);
  cam.lookAt(cx, 0, cz);
  cam.updateProjectionMatrix();

  // stínová kamera sleduje výřez — jinak stíny mimo její rozsah zmizí
  const dohled = Math.max(sirka, vyska) / k * 0.75 + 6;
  // Slunce nízko nad obzorem (~23°) — vysoko postavené dává stíny tak krátké,
  // že pod rekvizitami zaniknou a mapa vypadá plochá.
  sun.position.set(cx - 18, 9, cz + 11);
  sun.target.position.set(cx, 0, cz);
  sun.target.updateMatrixWorld();
  const sc = sun.shadow.camera;
  sc.left = -dohled; sc.right = dohled; sc.top = dohled; sc.bottom = -dohled;
  sc.near = 1; sc.far = 200;
  sc.updateProjectionMatrix();

  renderer.render(scene, cam);
}

function info() {
  return renderer
    ? { volani: renderer.info.render.calls, trojuhelniku: renderer.info.render.triangles,
        nacteno: nactenoVse, chybi: chybi.slice(), rozsah }
    : null;
}

window.R3 = {
  init, build, resize, render, info, setFog,
  // ladicí přístup do scény (ověřování lícování 3D vs 2D překryv)
  get scene() { return scene; },
  get cam() { return cam; },
  get ready() { return nactenoVse; },
  get missing() { return chybi; },
  THREE,
};
