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
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";

const MODEL_DIR = "art/models/";
const TILT = 55 * Math.PI / 180;
const SQUASH = Math.cos(TILT);   // == ISO_SQUASH v render.js
const HEX_PX = 26;               // == HEX_SIZE v render.js (px na jednotku při zoomu 1)

// modely, které mapa může potřebovat — stejná sada, jakou dřív načítal render.js
const NAMES = [];
for (const b of ["aldar", "yllien", "durgar", "horda", "center",
  "brakkar", "sarn", "vhorren", "gryk"])
  for (const t of ["plains", "forest", "hills"]) NAMES.push(b + "_" + t);
// v0.41: voda je jedna hladina (river_flat) + břeh na hranu (river_bank);
// most je nástavba na břehu ve dvou délkách podle šířky přechodu
// river_a/river_b = KORYTO od rohu k rohu (starý dílek z doby před v0.41).
// Od v0.69 se hodí znovu: příkop kolem hradeb musí být souvislý pás, a pole
// prstence se dotýkají jen ROHY — z plných desek by byl řetěz kaluží.
NAMES.push("river_flat", "river_a", "river_b", "river_bank", "river_bank_b", "river_bank_c",
  "bridge_short", "bridge_long",
  "wall_a", "wall_b", "wall_c", "ruins", "city", "fortress",
  "throne", "capital_aldar", "capital_yllien", "capital_durgar", "capital_horda",
  "capital_brakkar", "capital_sarn", "capital_vhorren", "capital_gryk",
  "outpost", "grandfort", "bastion");
for (const rk of ["food", "wood", "stone", "iron", "all"])
  for (let b = 1; b <= 3; b++) NAMES.push(`res_${rk}_${b}`);

let renderer = null, scene = null, cam = null, sun = null, korenMapy = null;
// Cesty mají VLASTNÍ skupinu, ne korenMapy: build() korenMapy při každé
// přestavbě terénu vysype, jenže síť cest se mění jinak často (se záborem)
// a její podpis by se přitom nezměnil — vysypaná by se už nikdy nevrátila.
let korenCest = null;
let sirka = 1, vyska = 1;
// postprocessing (v0.56) — viz „řetězec postprocessingu" níž
let composer = null, bloomPass = null, gradePass = null, ssaoPass = null, kvalita = "vysoka";
let tiltPassy = [];
// živá sada uniforem gradingu (přežije přestavbu řetězce) a podpis stavu
// stínové kamery ("" = přepočítat při nejbližším snímku)
let gradeZive = null, stinStav = "";
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

// Posun slunce od cíle. JEDNO číslo pro DirectionalLight v render() i pro
// sluneční kotouč v mapě prostředí — kdyby se rozešly, odlesky by svítily
// odjinud než odkud padají stíny.
// Vzdálenost kamery od ohniska. Ortografická kamera s dálkou nezmenšuje,
// takže je to jen odsazení, ať se nic neořízne — ale je to zároveň hloubka
// STŘEDU PLÁTNA, od které se počítá vzdušná perspektiva.
const D_KAMERA = 220;

const POSUN_SLUNCE = new THREE.Vector3(-18, 9, 11);
const SMER_SLUNCE = POSUN_SLUNCE.clone().normalize();

// Mapa okolí (v0.56). Kovy (zlato, železo, ruda) v PBR nesvítí samy — zrcadlí
// okolí — a bez prostředí by byly ČERNÉ. Do v0.55 to byl přechod 16×8 px, tedy
// jen „něco tam je". Nově je to skutečná obloha 256×128 s HDR slunečním
// kotoučem, takže se má co zrcadlit a rozptýlené světlo přichází ze SPRÁVNÉHO
// směru (obloha shora, odraz země zdola) místo z ploché polokoule.
//
// ⚠ Data jsou LINEÁRNÍ float, ne 8bitové sRGB — proto `LinearSRGBColorSpace`
// a `FloatType`. Se sRGB by se hodnoty převedly podruhé a obloha by ztmavla;
// v 8 bitech by se navíc slunce přišpendlilo na 1,0 a kotouč by přestal být
// jasnější než obloha kolem (celý smysl HDR mapy prostředí).
function nebeProstredi() {
  const w = 256, h = 128, d = new Float32Array(w * h * 4);
  const zenit = [0.045, 0.085, 0.180];
  const obzor = [0.42, 0.44, 0.46];
  const zeme = [0.085, 0.075, 0.058];
  const slunce = [1.0, 0.86, 0.62];
  const s = SMER_SLUNCE;
  for (let y = 0; y < h; y++) {
    // three mapuje ekvirektangulární texturu jako v = asin(dir.y)/π + 0,5,
    // takže řádek 0 je NADIR (dolů) a poslední řádek zenit.
    const v = (y + 0.5) / h;
    const dy = Math.sin((v - 0.5) * Math.PI);
    const vodorovne = Math.sqrt(Math.max(0, 1 - dy * dy));
    for (let x = 0; x < w; x++) {
      const phi = ((x + 0.5) / w - 0.5) * 2 * Math.PI;
      const dx = Math.cos(phi) * vodorovne, dz = Math.sin(phi) * vodorovne;
      let a, t;
      if (dy >= 0) { a = zenit; t = Math.pow(dy, 0.45); }     // rychlý přechod u obzoru
      else { a = zeme; t = Math.min(1, -dy * 3); }
      let r = obzor[0] + (a[0] - obzor[0]) * t;
      let g = obzor[1] + (a[1] - obzor[1]) * t;
      let b = obzor[2] + (a[2] - obzor[2]) * t;
      const kos = Math.max(0, dx * s.x + dy * s.y + dz * s.z);
      const zar = Math.pow(kos, 220) * 40      // kotouč (HDR, hluboko nad 1,0)
                + Math.pow(kos, 8) * 0.6;      // rozptyl kolem něj
      const i = (y * w + x) * 4;
      d[i] = r + slunce[0] * zar;
      d[i + 1] = g + slunce[1] * zar;
      d[i + 2] = b + slunce[2] * zar;
      d[i + 3] = 1;
    }
  }
  const tex = new THREE.DataTexture(d, w, h, THREE.RGBAFormat, THREE.FloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  // ⚠ DataTexture má na rozdíl od Texture výchozí filtr NEAREST, takže by
  // PMREM dostal schodovitou oblohu a odlesky by byly kostrbaté.
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.RepeatWrapping;      // šev na 360° musí navazovat
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const cil = pmrem.fromEquirectangular(tex);
  pmrem.dispose();
  tex.dispose();
  return cil.texture;
}

// ---------- řetězec postprocessingu (v0.56) ----------
//
// Pořadí je RenderPass → Bloom → OutputPass → grading, a to pořadí je věcné:
// bloom MUSÍ běžet v lineárním prostoru PŘED tónovým mapováním (jinak se
// rozzáří i obyčejný terén a ztratí se rozdíl mezi „světlé" a „svítí"),
// kdežto kontrast, sytost a vinětace patří až na hotový obraz.
//
// ⚠ Když se kreslí do render targetu, three tónové mapování ani převod do sRGB
// NEAPLIKUJE (dělá to jen při kreslení na plátno) — proto je v řetězci
// OutputPass. Bez něj vyjde obraz vybledlý a tmavý.
//
// ⚠ Plátno je PRŮHLEDNÉ (alpha 0 mimo mapu, pod ním prosvítá CSS gradient
// #canvas-wrap). Každý průchod proto musí zachovat alfu — OutputShader mění
// jen .rgb, grading kopíruje c.a. A kontrast se nesmí pustit pod 1,0:
// vzorec (b−0,5)·k+0,5 by při k<1 zvedl čerň nad nulu a kolem mapy by se
// objevil svítící závoj (plátno je premultiplied, takže RGB>0 při alfa 0
// se skládá ADITIVNĚ).
const GRADING = {
  name: "vp-grading",
  uniforms: {
    tDiffuse: { value: null },
    kontrast: { value: 1.14 },
    sytost: { value: 1.18 },
    odstinSvetel: { value: new THREE.Vector3(1.03, 1.00, 0.94) },
    odstinStinu: { value: new THREE.Vector3(0.95, 0.98, 1.06) },
    vineta: { value: 0.32 },
    vinetaSirka: { value: 0.80 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float kontrast, sytost, vineta, vinetaSirka;
    uniform vec3 odstinSvetel, odstinStinu;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 b = c.rgb;
      b = (b - 0.5) * kontrast + 0.5;                      // kontrast kolem střední šedi
      float l = dot(b, vec3(0.2126, 0.7152, 0.0722));
      b = mix(vec3(l), b, sytost);
      // dělené tónování: stíny do chladna, světla do tepla — levný trik, ze
      // kterého plochý render okamžitě vypadá „nagradovaně"
      b *= mix(odstinStinu, odstinSvetel, smoothstep(0.15, 0.85, l));
      float v = smoothstep(vinetaSirka, vinetaSirka - 0.45, length(vUv - 0.5));
      b *= mix(1.0 - vineta, 1.0, v);
      gl_FragColor = vec4(clamp(b, 0.0, 1.0), c.a);
    }`,
};

// Stupně kvality. `nizka` řetězec ÚPLNĚ obchází (kreslí se rovnou na plátno),
// takže na slabém zařízení nestojí postprocessing ani jeden pixel navíc.
// `bloomDil` dělí rozlišení bloomu NAD RÁMEC toho, že si ho UnrealBloomPass
// sám o sobě už půlí (dil 2 => čtvrtina plátna). Záře je rozostřená, takže
// se na ní nižší rozlišení skoro neprojeví, ale ušetří se výplň.
// Rozpočet je 30 fps (33 ms/snímek), ne 60 — rozhodnutí uživatele 31. 8. 2026:
// „je to tahová strategie, vzhled je přednější než naprostá plynulost".
// Proto si `vysoka` může dovolit plný bloom i 4× MSAA.
const STUPNE = {
  // `ssao` je nejdražší průchod v řetězci (renderuje si vlastní hloubku
  // a normály, tedy DALŠÍ celý průchod scénou), proto jen na vysoké.
  vysoka: { composer: true, vzorky: 4, bloomDil: 1, bloom: 0.42, ssao: true, tilt: true },
  stredni: { composer: true, vzorky: 2, bloomDil: 2, bloom: 0.34, ssao: false, tilt: false },
  nizka: { composer: false },
};

// Kontaktní zastínění (v0.56). PLAN.md IV-J ho má jako bod jedna a přesně
// pojmenovává proč: zapečené AO je PER MODEL, takže dlaždice neví, že vedle ní
// stojí hradba — a všechno pak vypadá nalepené na zem. Tohle screen-space
// zastínění to spočítá až ze scény, tedy VČETNĚ sousedů.
//
// Poloměr je ve SVĚTOVÝCH jednotkách: dílek má na šířku ~2,4, takže zastínění
// v řádu desetin jednotky drží stín u paty stavby a nerozlije se přes pole.
// Poloměr laděn měřením: 0,3 → 42,5 % ztmavených pixelů, 1,0 → 46,8 %,
// 4,0 už kontakty MÍJÍ a pokrytí padá na 36,8 %. Dílek má na šířku 2,4
// jednotky, takže 1,0 drží stín u paty stavby a nerozlije ho přes pole.
const SSAO = { polomer: 1.0, sila: 1.0, meritko: 1.0, tloustka: 1.0 };

// ---------- tilt-shift (v0.56, PLAN IV-J bod 6) ----------
//
// Úzký pás ostrosti, k okrajům rozostření. U ORTOGRAFICKÉ kamery to prodává
// „tohle je fyzický model" mimořádně dobře, protože přesně tak vypadá makro
// snímek dioramatu — a protože ortho nemá perspektivu, nedá se to splést
// s hloubkou ostrosti skutečné scény.
//
// ⚠ ZÁMĚRNĚ JEN PŘI PŘIBLÍŽENÍ. Je to STRATEGIE: na oddáleném pohledu hráč
// čte celou mapu a rozmazat jí horní a dolní třetinu je vada použitelnosti,
// ne efekt. Síla proto najíždí se zoomem stejně jako detailní normála —
// při zoomu ≤ 2,2 je nula.
const NAKLON = {
  stred: { value: 0.52 },   // střed ostrého pásu (0 = dole, 1 = nahoře)
  pas: { value: 0.16 },     // poloviční šířka plně ostrého pásu
  nabeh: { value: 0.30 },   // jak daleko za pásem je rozostření plné
  sila: { value: 0.0 },     // maximální poloměr v pixelech (řídí se zoomem)
};
const NAKLON_MAX = 3.2;

const NAKLON_SHADER = {
  name: "vp-tilt",
  uniforms: {
    tDiffuse: { value: null },
    uRozmer: { value: new THREE.Vector2(1, 1) },
    uSmer: { value: 0 },
    uStred: { value: 0.52 }, uPas: { value: 0.16 },
    uNabeh: { value: 0.30 }, uSila: { value: 0.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec2 uRozmer;
    uniform float uSmer, uStred, uPas, uNabeh, uSila;
    varying vec2 vUv;
    void main() {
      float d = abs(vUv.y - uStred);
      float mira = smoothstep(uPas, uPas + uNabeh, d) * uSila;
      if (mira < 0.01) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
      vec2 krok = (uSmer < 0.5 ? vec2(1.0, 0.0) : vec2(0.0, 1.0)) * mira / uRozmer;
      // devítitapý gauss; alfa se rozostřuje SPOLU s barvou, protože plátno je
      // premultiplied — kdyby se alfa nechala ostrá, okraj mapy by se rozsvítil
      vec4 s = texture2D(tDiffuse, vUv) * 0.2270270270;
      s += (texture2D(tDiffuse, vUv + krok * 1.3846153846)
          + texture2D(tDiffuse, vUv - krok * 1.3846153846)) * 0.3162162162;
      s += (texture2D(tDiffuse, vUv + krok * 3.2307692308)
          + texture2D(tDiffuse, vUv - krok * 3.2307692308)) * 0.0702702703;
      gl_FragColor = s;
    }`,
};

function autoKvalita() {
  const ulozeno = (() => { try { return localStorage.getItem("vp-kvalita"); } catch { return null; } })();
  if (ulozeno && STUPNE[ulozeno]) return ulozeno;
  const jadra = navigator.hardwareConcurrency || 4;
  const dotykove = matchMedia && matchMedia("(pointer: coarse)").matches;
  return (dotykove || jadra <= 4) ? "stredni" : "vysoka";
}

function postavRetezec() {
  if (composer) {
    // ⚠ `composer.dispose()` uvolní JEN své dva cíle a copyPass — pole `passes`
    // vůbec neprochází. UnrealBloomPass si přitom drží 11 HalfFloat render
    // targetů a ~10 materiálů, ShaderPass i OutputPass svůj materiál a fsQuad.
    // Bez tohohle cyklu nechá každé přepnutí kvality na GPU další sadu a po
    // pár přepnutích spadne kontext. RenderPass dispose() nemá (no-op v Pass.js),
    // takže je průchod polem bezpečný.
    for (const p of composer.passes) p.dispose?.();
    composer.dispose();
    composer = null; bloomPass = null; gradePass = null; ssaoPass = null; tiltPassy = [];
  }
  const s = STUPNE[kvalita];
  if (!s.composer) return;

  // ⚠ Vlastní render target kvůli `samples`: výchozí cíl composeru je BEZ
  // multisamplingu, takže by se přechodem na composer ztratilo vyhlazování
  // hran z `antialias: true` a mapa by vypadala ZUBATĚJI než předtím.
  const cil = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    samples: s.vzorky,
  });
  composer = new EffectComposer(renderer, cil);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.addPass(new RenderPass(scene, cam));

  // ⚠ AO patří PŘED bloom a PŘED tónové mapování: zatmavuje scénu v lineárním
  // prostoru, takže na ztmavených místech pak správně nekvete ani bloom.
  // GTAO umí ortografickou kameru (sám si přepne PERSPECTIVE_CAMERA podle
  // `camera.isPerspectiveCamera`), což je pro naši nakloněnou ortho podmínka.
  if (s.ssao) {
    ssaoPass = new GTAOPass(scene, cam, Math.max(1, sirka), Math.max(1, vyska));
    ssaoPass.output = GTAOPass.OUTPUT.Default;   // krása × zastínění, ne jen AO
    ssaoPass.updateGtaoMaterial({
      radius: SSAO.polomer, scale: SSAO.meritko, thickness: SSAO.tloustka,
    });
    ssaoPass.blendIntensity = SSAO.sila;
    // ⚠ GTAO míchá zastínění NÁSOBENÍM — a násobí i ALFU (`blendSrcAlpha:
    // DstAlphaFactor`, shader zapisuje `texel.a` z AO textury). Na neprůhledném
    // plátně je to neškodné, na našem PRŮHLEDNÉM je to vada: alfa klesne,
    // RGB zůstane, a protože je plátno premultiplied, přimíchá se pod ním CSS
    // gradient ADITIVNĚ — obraz zesvětlá a zamlží se místo aby ztmavl.
    // Alfu proto necháváme být: výsledná alfa = alfa cíle.
    ssaoPass.blendMaterial.blendSrcAlpha = THREE.ZeroFactor;
    ssaoPass.blendMaterial.blendDstAlpha = THREE.OneFactor;
    ssaoPass.blendMaterial.needsUpdate = true;
    composer.addPass(ssaoPass);
  }

  bloomPass = new UnrealBloomPass(
    new THREE.Vector2(Math.max(1, sirka / s.bloomDil), Math.max(1, vyska / s.bloomDil)),
    s.bloom,   // síla
    0.55,      // poloměr
    0.92);     // práh — nad běžným osvětleným terénem, aby zářila jen záře
  // ⚠ composer.setSize() volá setSize na VŠECH průchodech, takže by si bloom
  // rozlišení hned přepsal zpátky na plné a `bloomDil` by byl mrtvý knob
  // (naměřeno: 1:1 a 1:2 stály úplně stejně). Dělitel se proto musí vnutit tady.
  const puvodniSetSize = bloomPass.setSize.bind(bloomPass);
  bloomPass.setSize = (w, h) =>
    puvodniSetSize(Math.max(1, Math.round(w / s.bloomDil)),
                   Math.max(1, Math.round(h / s.bloomDil)));
  composer.addPass(bloomPass);

  composer.addPass(new OutputPass());          // tónové mapování + sRGB
  gradePass = new ShaderPass(GRADING);
  // ⚠ ShaderPass si uniformy KLONUJE (UniformsUtils.clone), takže by se doladěné
  // hodnoty při každé přestavbě řetězce tiše vrátily na výchozí a `R3.grade`
  // by ukazoval na zahozený objekt. Držíme proto jednu živou sadu napříč
  // přestavbami — stejně jako to dělají VODA a DETAIL.
  if (gradeZive) { gradePass.uniforms = gradeZive; gradePass.material.uniforms = gradeZive; }
  else gradeZive = gradePass.uniforms;
  composer.addPass(gradePass);

  // Tilt-shift až úplně na konci — rozostřuje HOTOVÝ obraz, ne mezivýsledek.
  // Dva průchody (vodorovný a svislý), protože oddělitelné rozostření dá při
  // stejném počtu vzorků mnohem hladší výsledek než jeden kruhový.
  if (s.tilt) {
    tiltPassy = [0, 1].map(smer => {
      const p = new ShaderPass(NAKLON_SHADER);
      p.uniforms.uSmer.value = smer;          // 0 = vodorovně, 1 = svisle
      p.uniforms.uStred = NAKLON.stred;         // sdílené = ladí se obojí naráz
      p.uniforms.uPas = NAKLON.pas;
      p.uniforms.uNabeh = NAKLON.nabeh;
      p.uniforms.uSila = NAKLON.sila;
      composer.addPass(p);
      return p;
    });
  }
  composer.setSize(sirka, vyska);
}

function setKvalita(uroven) {
  if (!STUPNE[uroven] || uroven === kvalita) return kvalita;
  kvalita = uroven;
  try { localStorage.setItem("vp-kvalita", uroven); } catch { /* soukromé okno */ }
  if (renderer) postavRetezec();
  return kvalita;
}

// ---------- inicializace ----------
function init(canvas) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearAlpha(0);            // pozadí kreslí CSS pod plátnem
  renderer.shadowMap.enabled = true;
  // Stínová mapa 2048² se překresluje CELOU SCÉNOU. U tahové strategie stojí
  // kamera většinu času, takže se přepočítává jen při změně stavu stínové
  // kamery nebo po přestavbě mapy — viz stinStav v render() a build().
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.type = THREE.PCFShadowMap;  // PCFSoft je od three 0.185 zrušený
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  // Expozice 1,05 byla PODEXPOZICE: obraz neměl žádná světla (p95 pod 0,6),
  // proto mapa vypadala plocho a bloom neměl co rozzářit. Hodnota je laděná
  // SPOLU se silou slunce — viz komentář u DirectionalLight níž.
  renderer.toneMappingExposure = 1.25;
  // Bez tohohle hlásí info() jen poslední průchod composeru (celoplošný
  // čtverec = 1 volání) místo skutečné mapy — viz reset v render().
  renderer.info.autoReset = false;

  scene = new THREE.Scene();

  // ortografická kamera — měřítko i cíl se přenastavují každý snímek v render()
  cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 600);
  scene.add(cam);

  // Klíčové slunce. POZOR: oblohové světlo drž slabé (~0,4) — silnější zaplní
  // stíny tak, že vypadají, jako by se shadow mapa vůbec nekreslila.
  // Síla 6 (dřív 3) v páru s expozicí 1,25 (dřív 1,9): stejný celkový jas, ale
  // světlo nese SLUNCE místo ambientu, takže scéna má stíny. Změřeno na pěti
  // různých terénech (Trůn, kapitál, les, řeka, láva) — průměrný dynamický
  // rozsah 0,434 → 0,612 při NIŽŠÍM přepalu (0,88 % → 0,79 %).
  sun = new THREE.DirectionalLight(0xfff0d8, 6.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0009;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(sun.target);

  // Váha se od v0.56 přesunula z polokoule do PROSTŘEDÍ: IBL z mapy okolí je
  // směrově správné (světlo přichází odtud, odkud obloha opravdu svítí),
  // kdežto HemisphereLight jen plošně přisvětluje shora dolů a stíny zaplňuje.
  // Oblohu proto drž slabou — silnější a vypadá to, jako by se shadow mapa
  // vůbec nekreslila.
  scene.add(new THREE.HemisphereLight(0xbfd6ff, 0x4a4436, 0.12));
  scene.environment = nebeProstredi();
  scene.environmentIntensity = 0.40;

  const obrys = new THREE.DirectionalLight(0xffd9a8, 0.45);
  obrys.position.set(14, 9, -18);
  scene.add(obrys);

  korenMapy = new THREE.Group();
  scene.add(korenMapy);
  korenCest = new THREE.Group();
  scene.add(korenCest);
  korenFigurek = new THREE.Group();
  scene.add(korenFigurek);

  kvalita = autoKvalita();
  postavRetezec();

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
// Na jeden materiál může padnout VÍC záplat (mlha + detailní normála + voda).
// Bez tohohle je to past hned dvakrát: druhé přiřazení onBeforeCompile přepíše
// první, a hlavně `customProgramCacheKey` musí nést, KTERÉ záplaty na materiálu
// jsou — jinak si dva různě záplatované materiály sáhnou pro tentýž přeložený
// program a jedna ze záplat se tiše ztratí.
function pridejZaplatu(m, jmeno, uprav) {
  const seznam = m.userData.vpZaplaty || (m.userData.vpZaplaty = []);
  if (seznam.includes(jmeno)) return false;
  seznam.push(jmeno);
  const drivejsi = m.onBeforeCompile;
  m.onBeforeCompile = (s, r) => { if (drivejsi) drivejsi(s, r); uprav(s, r); };
  m.customProgramCacheKey = () => "vp:" + seznam.join("+");
  m.needsUpdate = true;
  return true;
}

const jizUpravene = new WeakSet();
function mlhaDoZare(mat) {
  for (const m of (Array.isArray(mat) ? mat : [mat])) {
    if (!m || jizUpravene.has(m)) continue;
    jizUpravene.add(m);
    if (!m.emissiveMap && (!m.emissive || m.emissive.getHex() === 0)) continue;
    // Vede se VLASTNÍ varying, ne vestavěné vColor: jestli three zrovna
    // definuje USE_COLOR, nebo USE_COLOR_ALPHA, se mezi verzemi mění a
    // podmínka pak tiše vypadne. Atribut instanceColor je oproti tomu smluvní.
    // Bez vlastního klíče keše by si three sáhlo pro dřív přeložený program
    // a záplata by se nikdy neprojevila — onBeforeCompile do klíče sám
    // nevstupuje. Klíč skládá pridejZaplatu().
    pridejZaplatu(m, "mlha-zare", s => {
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
    });
  }
}

// ---------- detailní normála povrchů (v0.56) ----------
// Zapečené mapy mají 512/256 px na CELÝ dílek i s rekvizitami, takže při
// přiblížení je povrch hladký jako plast. Fotografické textury to NEŘEŠÍ —
// změřeno, +2,9 % detailu, viz komentář v make_tiles.py. Procedurální normála
// AŽ V SHADERU rozlišením pečení omezená není a nestojí ani bajt stahování.
//
// Síla se řídí PŘIBLÍŽENÍM (DETAIL.sila): na oddáleném pohledu, kde má dílek
// pár desítek pixelů, by z detailu bylo jen zrnění a aliasing.
const DETAIL = { sila: { value: 0.0 }, meritko: { value: 9.0 }, max: 0.35 };

function detailNormaly(mat) {
  for (const m of (Array.isArray(mat) ? mat : [mat])) {
    if (!m) continue;
    pridejZaplatu(m, "detail", s => {
      s.uniforms.uDetSila = DETAIL.sila;
      s.uniforms.uDetMeritko = DETAIL.meritko;
      s.vertexShader = s.vertexShader
        .replace("void main() {", "varying vec3 vDetSvet;\nvoid main() {")
        .replace("#include <begin_vertex>", [
          "#include <begin_vertex>",
          "vec4 vpDet = vec4( transformed, 1.0 );",
          "#ifdef USE_INSTANCING",
          "  vpDet = instanceMatrix * vpDet;",
          "#endif",
          "vDetSvet = ( modelMatrix * vpDet ).xyz;",
        ].join("\n"));
      s.fragmentShader = s.fragmentShader
        .replace("void main() {", [
          "uniform float uDetSila, uDetMeritko;",
          "varying vec3 vDetSvet;",
          // ⚠ Součin sinů (první pokus) tady NEFUNGUJE: je periodický, takže
          // z něj přes celou mapu vyjde pravidelné ŠRAFOVÁNÍ. Vypadalo to jako
          // moaré přes terén i stavby — a metrika místního kontrastu to
          // neodhalila, naopak ho pravidelný vzor hnal nahoru (+14 %).
          // Proto skutečný hodnotový šum s vyhlazenou interpolací.
          "float vpHash( vec2 q ) {",
          "  q = fract( q * vec2( 123.34, 456.21 ) );",
          "  q += dot( q, q + 45.32 );",
          "  return fract( q.x * q.y );",
          "}",
          "float vpSum( vec2 q ) {",
          "  vec2 i = floor( q ), f = fract( q );",
          "  f = f * f * ( 3.0 - 2.0 * f );",
          "  return mix( mix( vpHash( i ), vpHash( i + vec2( 1.0, 0.0 ) ), f.x ),",
          "              mix( vpHash( i + vec2( 0.0, 1.0 ) ), vpHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );",
          "}",
          "float vpRelief( vec2 q ) { return vpSum( q ) * 0.65 + vpSum( q * 2.7 ) * 0.35; }",
          "void main() {",
        ].join("\n"))
        .replace("#include <normal_fragment_maps>", [
          "#include <normal_fragment_maps>",
          "if ( uDetSila > 0.001 ) {",
          "  vec2 q = vDetSvet.xz * uDetMeritko;",
          "  float e = 0.6;",
          "  float h = vpRelief( q );",
          // ⚠ NÁKLON, ne mix: `mix(normal, hrbol, s)` původní normálu NAHRAZUJE
          // a zapečený reliéf tím zředí — naměřeno, místní kontrast KLESL.
          "  vec3 posun = vec3( h - vpRelief( q + vec2( e, 0.0 ) ), 0.0,",
          "                     h - vpRelief( q + vec2( 0.0, e ) ) ) * 3.0;",
          "  vec3 posunP = ( viewMatrix * vec4( posun, 0.0 ) ).xyz;",
          "  normal = normalize( normal + posunP * uDetSila );",
          "}",
        ].join("\n"));
    });
  }
}

// ---------- vzdušná perspektiva (v0.64, PLAN IV-J bod 5) ----------
//
// Vzdálená krajina se s dálkou vytrácí do barvy oblohy. U ORTOGRAFICKÉ kamery
// je to jediný signál hloubky, který vůbec zbývá — perspektivní zmenšování
// ortho nemá, takže bez závoje leží zadní okraj mapy ve stejné rovině jako
// přední a celé to čte jako stolní desku, ne jako krajinu.
//
// ⚠ Vztažný bod je OHNISKO kamery (střed plátna), ne kamera sama. Kamera stojí
// 220 jednotek daleko, takže od NÍ počítaný závoj leží na celé mapě skoro
// stejně a jen ji vybledlí. Takhle je nula uprostřed obrazu, závoj přibývá
// SMĚREM DOZADU a bližší (dolní) půlka plátna zůstává čistá.
//
// Kamera je nakloněná o 55°, takže posun o v jednotek nahoru po plátně
// znamená +v·tan(55°) = +1,43 jednotky hloubky. Při zoomu 1 a plátně 900 px
// je horní okraj ~25 jednotek za ohniskem, při zoomu 4 už jen ~6 — závoj se
// tedy s přiblížením VYTRATÍ SÁM a předá štafetu tilt-shiftu (ten naopak
// najíždí až od zoomu 2,2). Nic se pro to nemusí přepínat.
//
// ⚠ Proč záplata materiálů a ne `scene.fog`: vestavěná mlha three se míchá až
// ZA tónovým mapováním a převodem do sRGB (`fog_fragment` je v shaderu až za
// `tonemapping_fragment`). Jenže při kreslení do render targetu three tónové
// mapování NEAPLIKUJE, takže by stejná mlha vyšla jinak s composerem
// (vysoká/střední) a jinak bez něj (nízká). Takhle se míchá v lineárním světle
// před tónovou křivkou — fyzikálně správně a ve všech stupních stejně.
const VZDUCH = {
  // LINEÁRNÍ barva, ne sRGB — míchá se před tónovým mapováním. Odstín je obzor
  // z mapy oblohy (0,42 / 0,44 / 0,46) posunutý do modra, ať dálka chladne.
  barva: { value: new THREE.Vector3(0.40, 0.47, 0.58) },
  delka: { value: 45.0 },   // po kolika jednotkách hloubky ubyde 63 % barvy
  // Síla laděná MĚŘENÍM v horním (nejvzdálenějším) pásu obrazu, plátno
  // 1280×820, zoom 1:
  //   0,55 → sytost −26,7 %, místní kontrast −18,8 %, jas +8,6 %
  //   0,75 → sytost −33,3 %, místní kontrast −24,4 %, jas +11,3 %
  // Vzato 0,55: v pozdní hře je prozkoumaná celá obrazovka a ztráta čtvrtiny
  // místního kontrastu v horní třetině už je vada použitelnosti, ne efekt.
  sila: { value: 0.55 },    // strop podílu závoje
};
// Hloubka ohniska = vzdálenost kamery (D_KAMERA). Je to uniforma, ne konstanta
// v shaderu, aby se dala měnit z konzole při ladění.
const OHNISKO = { value: D_KAMERA };

function vzdusnaPerspektiva(mat) {
  for (const m of (Array.isArray(mat) ? mat : [mat])) {
    if (!m) continue;
    pridejZaplatu(m, "vzduch", s => {
      s.uniforms.uVzdBarva = VZDUCH.barva;
      s.uniforms.uVzdDelka = VZDUCH.delka;
      s.uniforms.uVzdSila = VZDUCH.sila;
      s.uniforms.uVzdOhnisko = OHNISKO;
      s.vertexShader = s.vertexShader
        .replace("void main() {", "varying float vVzdHloubka;\nvarying float vVzdMlha;\nvoid main() {")
        // `mvPosition` vzniká až v project_vertex a je to poloha v POHLEDOVÉM
        // prostoru i pro instancované meshe (chunk sám násobí instanceMatrix).
        .replace("#include <project_vertex>", [
          "#include <project_vertex>",
          "vVzdHloubka = -mvPosition.z;",
          // Mlha války jede jako instanceColor (viz setFog). Vlastní varying,
          // ne vestavěné vColor — jestli three definuje USE_COLOR nebo
          // USE_COLOR_ALPHA, se mezi verzemi mění, kdežto atribut je smluvní.
          "#ifdef USE_INSTANCING_COLOR",
          "  vVzdMlha = dot( instanceColor, vec3( 0.2126, 0.7152, 0.0722 ) );",
          // cesty nejsou instancované — mlhu nesou ve vrcholových barvách
          "#elif defined( USE_COLOR )",
          "  vVzdMlha = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );",
          "#else",
          "  vVzdMlha = 1.0;",
          "#endif",
        ].join("\n"));
      s.fragmentShader = s.fragmentShader
        .replace("void main() {", [
          "uniform vec3 uVzdBarva;",
          "uniform float uVzdDelka, uVzdSila, uVzdOhnisko;",
          "varying float vVzdHloubka;",
          "varying float vVzdMlha;",
          "void main() {",
        ].join("\n"))
        .replace("#include <opaque_fragment>", [
          "#include <opaque_fragment>",
          "{",
          // Beerův zákon: závoj přibývá exponenciálně, ne lineárně. Lineární
          // náběh udělá přesně v ohnisku viditelnou hranu, exponenciála ne.
          "  float dH = max( 0.0, vVzdHloubka - uVzdOhnisko );",
          "  float mira = uVzdSila * ( 1.0 - exp( -dH / uVzdDelka ) );",
          // ⚠ ZMĚŘENO: bez tohohle závoj ROZSVĚCUJE neprozkoumaná pole. Mlha
          // války násobí rozptýlenou složku, takže se uplatní PŘED tímhle
          // místem a závoj se přimíchá i tam, kde hráč nemá co vidět —
          // ztmavení v horním pásu spadlo z 63,9 % na 42,5 % (síla 0,55),
          // resp. 37,0 % (0,75). Vynásobením toutéž maskou se pořadí srovná:
          // „tohle nevidím" platí až NAD atmosférou.
          "  mira *= vVzdMlha;",
          // ⚠ Alfa se NESMÍ měnit: plátno je průhledné a premultiplied, takže
          // závoj smí jen přebarvit to, co UŽ je nakreslené. Kdyby se přimíchal
          // i do alfy, okraj mapy by se rozsvítil.
          "  gl_FragColor.rgb = mix( gl_FragColor.rgb, uVzdBarva, mira );",
          "}",
        ].join("\n"));
    });
  }
}

// ---------- živá hladina (v0.56) ----------
// Sdílený čas: JEDEN objekt pro všechny vodní materiály, takže stačí měnit
// CAS.value v render() a vlny se pohnou všude naráz.
const CAS = { value: 0 };
// Ladicí uniformy hladiny — sdílené VŠEMI vodními materiály, takže se dají
// měnit za běhu z konzole (R3.voda.sila.value = 0.9) a projeví se všude.
const VODA = {
  // Laděno vizuálně: vyšší měřítko dá jemný ŠUM místo vln, nižší zase rozsvítí
  // velké plochy naráz (hladina zbledne, protože velký kus normál chytí oblohu).
  sila: { value: 0.55 },      // jak moc vlna přebije zapečenou normálu
  sklon: { value: 2.2 },      // menší = strmější vlny (dělitel svislé složky)
  meritko: { value: 0.6 },    // prostorová frekvence vln
  rychlost: { value: 1.0 },
};
const vodaUpraveno = new WeakSet();

// Řeka je od v0.41 jedna souvislá deska přes celé pole, což je přesně ten
// podklad, na kterém má smysl vlnit normálu: hladina se pak nerozpadne na
// dlaždice a vlna přejde plynule přes celý tok.
//
// ⚠ Normála ve fragment shaderu je v POHLEDOVÉM prostoru, kdežto vlnu počítám
// ze SVĚTOVÝCH souřadnic (jinak by se vlny hýbaly s kamerou). Musí se proto
// převést přes viewMatrix — bez toho voda „teče do kopce", jakmile se posune
// pohled.
function vodaShader(mat) {
  for (const m of (Array.isArray(mat) ? mat : [mat])) {
    if (!m || vodaUpraveno.has(m)) continue;
    vodaUpraveno.add(m);
    m.roughness = 0.14;          // zapečená drsnost je pro souš, hladina má zrcadlit
    m.envMapIntensity = 1.7;
    pridejZaplatu(m, "voda", s => {
      s.uniforms.uCas = CAS;
      s.uniforms.uSila = VODA.sila;
      s.uniforms.uSklon = VODA.sklon;
      s.uniforms.uMeritko = VODA.meritko;
      s.uniforms.uRychlost = VODA.rychlost;
      s.vertexShader = s.vertexShader
        .replace("void main() {", "varying vec3 vSvet;\nvoid main() {")
        .replace("#include <begin_vertex>", [
          "#include <begin_vertex>",
          "vec4 vpSvet = vec4( transformed, 1.0 );",
          "#ifdef USE_INSTANCING",
          "  vpSvet = instanceMatrix * vpSvet;",
          "#endif",
          "vSvet = ( modelMatrix * vpSvet ).xyz;",
        ].join("\n"));
      s.fragmentShader = s.fragmentShader
        .replace("void main() {",
          ["uniform float uCas, uSila, uSklon, uMeritko, uRychlost;",
           "varying vec3 vSvet;", "void main() {"].join("\n"))
        .replace("#include <normal_fragment_maps>", [
          "#include <normal_fragment_maps>",
          "{",
          "  vec2 p = vSvet.xz * uMeritko;",
          "  float t = uCas * uRychlost;",
          // tři vrstvy různého měřítka a směru — jedna sama o sobě čte jako pruhy
          "  float a = sin( p.x * 1.4 + p.y * 0.5 + t * 0.85 );",
          "  float b = cos( p.y * 2.2 - p.x * 0.8 - t * 1.25 );",
          "  float c = sin( ( p.x + p.y ) * 0.9 + t * 0.45 );",
          "  vec3 vlna = normalize( vec3( a * 0.6 + b * 0.35, uSklon, c * 0.6 + b * 0.3 ) );",
          "  vec3 vlnaP = normalize( ( viewMatrix * vec4( vlna, 0.0 ) ).xyz );",
          "  normal = normalize( mix( normal, vlnaP, uSila ) );",
          "}",
        ].join("\n"));
    });
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
    // Hladina má vlastní vlny; detail povrchu by se s nimi jen bil.
    if (jmeno === "river_flat") vodaShader(o.material);
    else detailNormaly(o.material);
    vzdusnaPerspektiva(o.material);
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
// ...ale dílky, které mají na mapě splynout v JEDNU plochu, se odstiňovat
// nesmějí: hladina řeky by se rozpadla na dlaždice různého jasu a most by měl
// uprostřed toku schod mezi svými dvěma půlkami.
const BEZ_ODSTINU = { river_flat: 1, bridge_short: 1, bridge_long: 1 };

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

// ---------- cesty mezi vlastními poli (v0.64, PLAN IV-J bod 5) ----------
//
// Síť pěšin, která ROSTE SE ZÁBOREM: každá dvojice sousedních polí téhož
// majitele dostane úsek. Je to jediný prvek mapy, který se nedrží mřížky —
// uzel každého pole je náhodně rozházený od jeho středu, takže cesta mezi
// poli kličkuje a čte se jako vyšlapaná, ne jako čáry v tabulce.
//
// ⚠ NENÍ to instancované: je to JEDNA sloučená geometrie na celou síť.
// Instancování by tady nedávalo smysl (každý úsek má jinou délku i směr)
// a jedna geometrie stojí jedno volání kreslení místo tisíců.
//
// Mlha války jede přes VRCHOLOVÉ BARVY — setCesty si zapamatuje, který uzel
// patří kterému poli, a setFog pak přebarvuje jen atribut, ne geometrii.
const CESTA = {
  sirka: 0.34,      // šířka pěšiny ve světových jednotkách (pole má 1,73 napříč)
  vyska: 0.305,     // deska pole má vršek přesně na 0,30 — 5 tisícin nad ním
  rozhod: 0.24,     // o kolik se uzel smí odchýlit od středu pole
  barva: 0x6f5c3f,  // udusaná hlína
};

let cestyMesh = null, cestyMat = null;

// Stálý hash z klíče pole (stejný princip jako odstinPole): rozházení uzlů
// se po přestavbě mapy NESMÍ pohnout, jinak by cesty poskočily.
function hashKlice(k) {
  let h = 2166136261;
  for (let i = 0; i < k.length; i++) { h ^= k.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function materialCesty() {
  if (cestyMat) return cestyMat;
  cestyMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(CESTA.barva),
    roughness: 0.96, metalness: 0.0,
    vertexColors: true,              // nese mlhu války, viz setFog
    // Pěšina leží 5 tisícin nad deskou pole, což je při oddáleném pohledu
    // pod rozlišení hloubkového bufferu — bez odsazení by po ní běhaly skvrny.
    polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
  });
  detailNormaly(cestyMat);        // ať povrch není plast
  vzdusnaPerspektiva(cestyMat);   // a ať se s dálkou ztrácí jako zbytek mapy
  return cestyMat;
}

// uzly = [{ key, q, r }], useky = [[indexA, indexB], ...]
function setCesty(uzly, useky) {
  if (!korenCest) return;
  if (cestyMesh) {
    korenCest.remove(cestyMesh);
    cestyMesh.geometry.dispose();
    cestyMesh = null;
  }
  if (!uzly || !uzly.length || !useky || !useky.length) return;

  const P = uzly.map(u => {
    const p = poleNa3D(u.q, u.r);
    const h = hashKlice(u.key);
    return {
      x: p.x + (((h & 255) / 255) - 0.5) * 2 * CESTA.rozhod,
      z: p.z + ((((h >>> 8) & 255) / 255) - 0.5) * 2 * CESTA.rozhod,
      // šířka kolísá 0,78–1,22násobkem, ať pěšina nemá po celé délce stejnou stopu
      w: CESTA.sirka * (0.78 + (((h >>> 16) & 255) / 255) * 0.44),
      key: u.key,
    };
  });

  // Uzel se kreslí, jen když z něj něco vede — osamocené pole by jinak dostalo
  // do trávy placku bez cesty.
  const zapojen = new Uint8Array(P.length);
  for (const [a, b] of useky) { zapojen[a] = 1; zapojen[b] = 1; }
  let uzluKresli = 0;
  for (let i = 0; i < P.length; i++) if (zapojen[i]) uzluKresli++;

  const trojuh = useky.length * 2 + uzluKresli * 2;
  const poz = new Float32Array(trojuh * 3 * 3);
  const nor = new Float32Array(trojuh * 3 * 3);
  const uv = new Float32Array(trojuh * 3 * 2);
  const bar = new Float32Array(trojuh * 3 * 3);
  const uzelVrcholu = new Uint32Array(trojuh * 3);
  let v = 0;

  const y = CESTA.vyska;
  function vrchol(x, z, u, vv, uzel) {
    poz[v * 3] = x; poz[v * 3 + 1] = y; poz[v * 3 + 2] = z;
    nor[v * 3 + 1] = 1;
    uv[v * 2] = u; uv[v * 2 + 1] = vv;
    bar[v * 3] = bar[v * 3 + 1] = bar[v * 3 + 2] = 1;
    uzelVrcholu[v] = uzel;
    v++;
  }
  function ctverec(x1, z1, x2, z2, x3, z3, x4, z4, u1, u2, uzA, uzB) {
    vrchol(x1, z1, 0, u1, uzA); vrchol(x2, z2, 1, u1, uzA); vrchol(x3, z3, 1, u2, uzB);
    vrchol(x1, z1, 0, u1, uzA); vrchol(x3, z3, 1, u2, uzB); vrchol(x4, z4, 0, u2, uzB);
  }

  for (const [ia, ib] of useky) {
    const a = P[ia], b = P[ib];
    const dx = b.x - a.x, dz = b.z - a.z;
    const d = Math.hypot(dx, dz) || 1;
    // kolmice v rovině země
    const nx = -dz / d, nz = dx / d;
    const ha = a.w / 2, hb = b.w / 2;
    ctverec(a.x - nx * ha, a.z - nz * ha, a.x + nx * ha, a.z + nz * ha,
            b.x + nx * hb, b.z + nz * hb, b.x - nx * hb, b.z - nz * hb,
            0, d, ia, ib);
  }
  // Náplast v uzlu: dva kolmé úseky se v rohu míjejí o klín, čtverec o straně
  // šířky cesty ho zaplní a zároveň udělá z konce slepé větve rozšlapané místo.
  for (let i = 0; i < P.length; i++) {
    if (!zapojen[i]) continue;
    const p = P[i], h = p.w / 2;
    ctverec(p.x - h, p.z - h, p.x + h, p.z - h, p.x + h, p.z + h, p.x - h, p.z + h,
            0, 1, i, i);
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(poz, 3));
  g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setAttribute("color", new THREE.BufferAttribute(bar, 3));
  g.computeBoundingSphere();

  cestyMesh = new THREE.Mesh(g, materialCesty());
  cestyMesh.receiveShadow = true;   // stín stromu přes pěšinu ji přilepí k zemi
  cestyMesh.castShadow = false;     // plochá stopa nemá co vrhat
  cestyMesh.renderOrder = 1;
  cestyMesh.userData.uzelVrcholu = uzelVrcholu;
  cestyMesh.userData.klice = P.map(p => p.key);
  korenCest.add(cestyMesh);
  if (poslMlha) mlhaNaCesty(poslMlha);   // hned nanést mlhu, ať síť neproblikne
}

// ---------- 3D figurky hrdinů (v0.66, PLAN IV-J bod 7) ----------
//
// Do v0.65 byli hrdinové JEDINÁ věc na mapě, která zůstala 2D: ploché sprity
// v překryvu nad 3D terénem. Při přiblížení to byla největší trhlina ve hře —
// terén měl stíny, zastínění i vzdušnou perspektivu, a přes něj stál papírový
// panáček bez jediného z toho.
//
// Modely dělá `art/blender/make_hrdiny_modely.py` z TÝCHŽ stavitelů, ze
// kterých se dodnes renderují sprity (make_heroes.py), takže se figurka
// nemůže rozejít se svým portrétem. Barvu nesou VRCHOLY, takže má figurka
// jeden materiál a jedno volání kreslení.
//
// ⚠ NAČÍTAJÍ SE AŽ NA VYŽÁDÁNÍ. 49 figurek váží 5,6 MB — tolik co celý terén.
// Hráč jich za sezónu potká pár, takže se stahuje jen to, co je opravdu na
// mapě; než model dorazí, figurka prostě není (2D záloha se kreslí dál).
const FIGURKA_DIR = MODEL_DIR + "hrdinove/";
// Figurka je v modelu ~1,2 jednotky vysoká. Kamera je nakloněná o 55°, takže
// se svislá jednička promítne na 0,82 jednotky = 21 px při zoomu 1 — přesně
// v měřítku spritů, které tu byly do v0.65 (38 px šířky, nohy v 66,8 %).
const FIGURKA = {
  meritko: 1.15,
  zem: 0.14,        // vršek desky pole (rekvizity na ní začínají taky na 0,14)
  natoceni: -Math.PI / 2 + 0.55,   // tříčtvrteční pohled ke kameře
  stin: 0.42,       // poloměr kontaktního stínu
  // ⚠ Figurka je stavěná pro RENDER SPRITU (Cycles, vlastní světlo), ne pro
  // herní scénu: ocel má základ 0,72 a tráva zapečená v terénu kolem 0,15,
  // takže by hrdina proti mapě SVÍTIL. Ztlumení se dělá až tady, ne v modelu
  // — je to knob ke světlu hry, ne vlastnost figurky.
  // Laděno měřením proti terénu (zoom 5, plně odhalená mapa): terén má
  // průměrný jas 157, figurka při 1,0 vyjde na 185 a 12 % pixelů PŘEPÁLÍ
  // (bílý plast místo oceli), při 0,72 sedí na 154 a přepálí jen 3 % —
  // odlesky na zbroji, které tam patří.
  jas: 0.72,
};

let korenFigurek = null;
const modelyFigurek = {};        // klíč → THREE.Object3D | "nacita" | "chybi"
const bazenFigurek = new Map();  // klíč → pole nasazených instancí
let stinTextura = null;
// ⚠ Stíny jsou JEDNA INSTANCOVANÁ DÁVKA, ne deska u každé figurky. Změřeno:
// se samostatnými deskami stálo 10 figurek 40 volání kreslení místo 20 —
// polovinu spolykaly skvrny, které mají na obrazovce pár pixelů. Takhle je
// celá sada za JEDNO volání, ať jich je kolik chce.
let stinyMesh = null;
const stinMat = new THREE.Matrix4();

// Kontaktní stín. Figurka NEVRHÁ skutečný stín schválně: stínová mapa se od
// v0.56 přepočítává jen při pohybu kamery (`shadowMap.autoUpdate = false`),
// takže by pochodujícímu hrdinovi zůstal stín stát na místě. Měkká skvrna pod
// nohama drží figurku při zemi za zlomek ceny.
function texturaStinu() {
  if (stinTextura) return stinTextura;
  const n = 64, d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const dx = (x + 0.5) / n - 0.5, dy = (y + 0.5) / n - 0.5;
      const r = Math.min(1, Math.hypot(dx, dy) * 2);
      const a = Math.pow(1 - r, 1.8);
      const i = (y * n + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 0;
      d[i + 3] = Math.round(a * 190);
    }
  }
  const t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat);
  // ⚠ DataTexture má výchozí filtr NEAREST — bez tohohle je z měkké skvrny
  // schodovitý kosočtverec (stejná past jako u mapy oblohy).
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  stinTextura = t;
  return t;
}

function nactiFigurku(klic) {
  if (modelyFigurek[klic]) return;
  modelyFigurek[klic] = "nacita";
  new GLTFLoader().load(FIGURKA_DIR + klic + ".glb",
    g => { modelyFigurek[klic] = g.scene; },
    undefined,
    () => { modelyFigurek[klic] = "chybi"; });   // chybějící model hru nesmí položit
}

function novaFigurka(klic) {
  const zdroj = modelyFigurek[klic];
  if (!zdroj || typeof zdroj === "string") return null;
  const ob = zdroj.clone(true);
  ob.traverse(o => {
    if (!o.isMesh) return;
    // ⚠ Materiál se MUSÍ klonovat: mlhu války nese jeho `color`, takže sdílený
    // materiál by ztmavil všechny figurky téhož druhu podle té poslední.
    const m = o.material.clone();
    // ⚠ A klonu se musí vynulovat seznam záplat: `Material.copy` userData
    // zkopíruje, ale `onBeforeCompile` NE — pridejZaplatu by pak záplatu
    // odmítla přidat („už tam je") a shader by ji nikdy nedostal.
    m.userData = {};
    m.userData.zarZaklad = m.emissiveIntensity;
    vzdusnaPerspektiva(m);
    o.material = m;
    o.castShadow = false;      // viz texturaStinu()
    o.receiveShadow = true;    // stín stromu přes hrdinu ho přilepí do scény
  });
  ob.scale.setScalar(FIGURKA.meritko);
  korenFigurek.add(ob);
  return ob;
}

function zajistiStiny(kolik) {
  if (stinyMesh && stinyMesh.count >= kolik) return stinyMesh;
  if (stinyMesh) { korenFigurek.remove(stinyMesh); stinyMesh.dispose(); }
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);          // rovnou naležato, ať nemusí každá instance
  stinyMesh = new THREE.InstancedMesh(g, new THREE.MeshBasicMaterial({
    map: texturaStinu(), transparent: true, depthWrite: false, opacity: 0.7,
  }), Math.max(16, kolik * 2));
  stinyMesh.frustumCulled = false;   // obal by musel růst s rozptylem figurek
  stinyMesh.renderOrder = 2;
  korenFigurek.add(stinyMesh);
  return stinyMesh;
}

// seznam = [{ klic, x, y, uhel?, mlha?, odstin?, rezim?, faze?, cas? }]
//   x, y   … poloha ve 2D světě hry (tytéž pixely, ve kterých počítá render.js)
//   uhel   … směr pochodu ve 2D pixelech {dx, dy}; chybí = tříčtvrteční postoj
//   mlha   … 1 vidím … 0,2 neprozkoumané (stejná stupnice jako setFog)
//   odstin … [r,g,b] násobič barvy (šedý návrat domů)
//   rezim  … "stoji" | "jde"
function setFigurky(seznam) {
  if (!korenFigurek) return;
  const potreba = new Map();
  for (const f of seznam || []) potreba.set(f.klic, (potreba.get(f.klic) || 0) + 1);

  // Instance se RECYKLUJÍ po druzích — klonovat model každý snímek by při
  // 60 snímcích za sekundu vyrábělo stovky materiálů a shaderů za minutu.
  for (const [klic, kolik] of potreba) {
    if (!modelyFigurek[klic]) nactiFigurku(klic);
    let bazen = bazenFigurek.get(klic);
    if (!bazen) bazenFigurek.set(klic, bazen = []);
    while (bazen.length < kolik) {
      const nova = novaFigurka(klic);
      if (!nova) break;             // model ještě nedorazil — příště
      bazen.push(nova);
    }
  }
  for (const [klic, bazen] of bazenFigurek) {
    for (const ob of bazen) ob.visible = false;
    if (!potreba.has(klic) && bazen.length) {
      // druh zmizel z mapy — instance nechat, ale schované (levnější než
      // uvolnit a za chvíli znovu klonovat)
      continue;
    }
  }

  const pocty = new Map();
  const cas = performance.now() / 1000;
  const stiny = zajistiStiny((seznam || []).length);
  let stinu = 0;
  for (const f of seznam || []) {
    const bazen = bazenFigurek.get(f.klic);
    if (!bazen || !bazen.length) continue;
    const i = pocty.get(f.klic) || 0;
    if (i >= bazen.length) continue;
    pocty.set(f.klic, i + 1);
    const ob = bazen[i];
    ob.visible = true;
    const x = f.x / HEX_PX, z = f.y / (HEX_PX * SQUASH);
    const jde = f.rezim === "jde";
    // houpání: chůze poskakuje z kroku, stání jen dýchá
    const faze = (f.faze || 0) + cas * (jde ? 6.2 : 1.1) + x * 0.7;
    const bob = jde ? Math.abs(Math.sin(faze)) * 0.055 : Math.sin(faze) * 0.012;
    ob.position.set(x, FIGURKA.zem + bob, z);
    if (f.uhel && (f.uhel.dx || f.uhel.dy)) {
      // směr pochodu je ve 2D pixelech — do světa přes tutéž projekci,
      // kterou používá render(); model hledí k +X, takže rotace kolem Y
      // je atan2(−dz, dx)
      const dx = f.uhel.dx / HEX_PX, dz = f.uhel.dy / (HEX_PX * SQUASH);
      ob.rotation.y = Math.atan2(-dz, dx);
    } else {
      ob.rotation.y = FIGURKA.natoceni;
    }
    ob.rotation.z = jde ? Math.sin(faze) * 0.035 : 0;
    const m = f.mlha === undefined ? 1 : f.mlha;
    const o = f.odstin || null;
    ob.traverse(u => {
      if (!u.isMesh) return;
      const j = m * FIGURKA.jas;
      if (o) u.material.color.setRGB(o[0] * j, o[1] * j, o[2] * j);
      else u.material.color.setRGB(j, j, j);
      // záře MOCNINOU jako u terénu: zdroj světla má ve tmě mizet rychleji
      // než plocha, kterou nasvěcuje (viz mlhaDoZare)
      if (u.material.userData.zarZaklad)
        u.material.emissiveIntensity = u.material.userData.zarZaklad * m * m;
    });
    // stín NEskáče s houpáním — leží na zemi
    const w = FIGURKA.stin * 2 * FIGURKA.meritko;
    stinMat.makeScale(w, 1, w);
    stinMat.setPosition(x, FIGURKA.zem + 0.008, z);
    stiny.setMatrixAt(stinu++, stinMat);
  }
  stiny.count = stinu;
  stiny.instanceMatrix.needsUpdate = true;
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
    const p = poleNa3D(d.q, d.r);   // velké stavby chodí se zlomkovým středem bloku
    p.key = d.key || (d.q + "," + d.r);
    p.s = d.s || 1;
    p.rot = d.rot || 0;             // rohové hradby se otáčejí po 90°
    pole.push(p);
    if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
    if (p.z < minZ) minZ = p.z; if (p.z > maxZ) maxZ = p.z;
  }
  const posun = new THREE.Matrix4(), pom = new THREE.Matrix4(),
    meritko = new THREE.Matrix4(), natoc = new THREE.Matrix4();
  const odstin = new THREE.Color();
  for (const [jmeno, mista] of podleDruhu) {
    const jednolity = !!BEZ_ODSTINU[jmeno];
    for (const kus of rozeber(jmeno)) {
      const im = new THREE.InstancedMesh(kus.geometry, kus.material, mista.length);
      im.castShadow = true;
      im.receiveShadow = true;
      const odstiny = new Float32Array(mista.length * 3);
      mista.forEach((p, i) => {
        posun.makeTranslation(p.x, 0, p.z);
        if (p.rot) { natoc.makeRotationY(p.rot); posun.multiply(natoc); }
        // blok n×n: zvětšený kosočtverec kryje čtvercový blok beze zbytku
        if (p.s !== 1) { meritko.makeScale(p.s, p.s, p.s); posun.multiply(meritko); }
        pom.multiplyMatrices(posun, kus.matrix);
        im.setMatrixAt(i, pom);
        if (jednolity) odstiny[i * 3] = odstiny[i * 3 + 1] = odstiny[i * 3 + 2] = 1;
        else odstinPole(p.key, odstiny, i * 3);
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
  stinStav = "";   // nová geometrie → stínová mapa se musí přepočítat
}

// Mlha války PŘÍMO VE 3D. Plochý tmavý hexagon ve 2D nestačil — vysoké stavby
// (hradby, věže, hory) z něj koukaly ven, protože přesahují půdorys pole.
// Ztmavení se proto přičte instanci: 1 = vidím, ~0,45 = prozkoumané mimo
// dohled, ~0,2 = neprozkoumané.
const barvaMlhy = new THREE.Color();
// Poslední nanesená mlha. Cesty se přestavují jindy než terén, takže si
// nová síť musí umět mlhu nanést sama — jinak by jeden snímek svítila.
let poslMlha = null;
function setFog(faktorProKlic) {
  if (!korenMapy) return;
  poslMlha = faktorProKlic;
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
  mlhaNaCesty(faktorProKlic);
}

// Cesty nesou mlhu ve VRCHOLOVÝCH barvách (jsou jedna sloučená geometrie,
// ne instance), takže se přepisuje atribut `color` po uzlech.
function mlhaNaCesty(faktorProKlic) {
  if (!cestyMesh) return;
  const klice = cestyMesh.userData.klice, uzel = cestyMesh.userData.uzelVrcholu;
  const f = new Float32Array(klice.length);
  for (let i = 0; i < klice.length; i++) f[i] = faktorProKlic(klice[i]);
  const a = cestyMesh.geometry.getAttribute("color"), pole = a.array;
  for (let i = 0; i < uzel.length; i++) {
    const v = f[uzel[i]];
    pole[i * 3] = pole[i * 3 + 1] = pole[i * 3 + 2] = v;
  }
  a.needsUpdate = true;
}

// ---------- kreslení ----------
function resize(w, h) {
  if (!renderer) return;
  sirka = Math.max(1, w); vyska = Math.max(1, h);
  // Poměr pixelů se MĚNÍ ZA BĚHU (přesun na jiný monitor, zoom prohlížeče);
  // nastavit ho jen v init() znamená rozmazaný nebo zbytečně drahý obraz.
  const pom = Math.min(devicePixelRatio, 2);
  renderer.setPixelRatio(pom);
  renderer.setSize(sirka, vyska, false);
  // composer.setSize bere CSS rozměr a poměr pixelů si přinásobí sám
  if (composer) { composer.setPixelRatio(pom); composer.setSize(sirka, vyska); }
  for (const p of tiltPassy) p.uniforms.uRozmer.value.set(sirka * pom, vyska * pom);
}

// camX/camY jsou souřadnice ve 2D světě hry (stejné, jaké drží render.js),
// zoom je herní přiblížení. Kamera se nastaví tak, aby střed plátna ležel
// přesně na (camX, camY) a jedna blenderová jednotka měla HEX_PX*zoom pixelů.
function render(camX, camY, zoom) {
  if (!renderer || !scene || !cam) return;
  renderer.info.reset();     // ruční, viz autoReset = false v init()
  CAS.value = performance.now() / 1000;   // vlny na hladině
  // Detail povrchu má smysl jen při přiblížení — na oddáleném pohledu, kde má
  // dílek pár desítek pixelů, by z něj bylo zrnění a aliasing. Náběh 1,6→3,2
  // zoomu, aby se to neobjevilo skokem.
  DETAIL.sila.value = Math.max(0, Math.min(1, (zoom - 1.6) / 1.6)) * DETAIL.max;
  // Tilt-shift až od většího přiblížení než detail: na přehledovém pohledu
  // musí být mapa celá čitelná.
  NAKLON.sila.value = Math.max(0, Math.min(1, (zoom - 2.2) / 1.8)) * NAKLON_MAX;
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
  const D = D_KAMERA;
  cam.position.set(cx, D * SQUASH, cz + D * Math.sin(TILT));
  cam.up.set(0, 1, 0);
  cam.lookAt(cx, 0, cz);
  cam.updateProjectionMatrix();

  // stínová kamera sleduje výřez — jinak stíny mimo její rozsah zmizí
  const dohled = Math.max(sirka, vyska) / k * 0.75 + 6;
  // Slunce nízko nad obzorem (~23°) — vysoko postavené dává stíny tak krátké,
  // že pod rekvizitami zaniknou a mapa vypadá plochá. Směr sdílí s kotoučem
  // v mapě prostředí (POSUN_SLUNCE), ať odlesky sedí se stíny.
  sun.position.set(cx + POSUN_SLUNCE.x, POSUN_SLUNCE.y, cz + POSUN_SLUNCE.z);
  sun.target.position.set(cx, 0, cz);
  sun.target.updateMatrixWorld();
  const sc = sun.shadow.camera;
  sc.left = -dohled; sc.right = dohled; sc.top = dohled; sc.bottom = -dohled;
  sc.near = 1; sc.far = 200;
  sc.updateProjectionMatrix();

  // Stínová mapa se s autoUpdate=false musí vyžádat ručně. Přepočítá se, jen
  // když se stínová kamera opravdu hnula (posun pohledu, zoom) — a po každé
  // přestavbě mapy, o kterou se hlásí build() vynulováním stinStav. Bez toho
  // by se stíny zasekly na stavu z doby, kdy se naposledy pohnula kamera.
  const podpisStinu = cx.toFixed(2) + "|" + cz.toFixed(2) + "|" + dohled.toFixed(2);
  if (podpisStinu !== stinStav) {
    stinStav = podpisStinu;
    renderer.shadowMap.needsUpdate = true;
  }

  if (composer) composer.render();
  else renderer.render(scene, cam);
}

function info() {
  return renderer
    ? { volani: renderer.info.render.calls, trojuhelniku: renderer.info.render.triangles,
        nacteno: nactenoVse, chybi: chybi.slice(), rozsah }
    : null;
}

window.R3 = {
  init, build, resize, render, info, setFog, setKvalita, setCesty, setFigurky,
  get kvalita() { return kvalita; },
  get stupne() { return Object.keys(STUPNE); },
  // ladění: R3.stupnice.vysoka.vzorky = 0; R3.prestav()
  get stupnice() { return STUPNE; },
  prestav() { if (renderer) postavRetezec(); return kvalita; },
  // Živé ladění vzhledu z konzole: R3.grade.sytost.value = 1.3 apod.
  // (uniformy gradingu, R3.bloom.strength / .threshold / .radius)
  get grade() { return gradeZive || (gradePass ? gradePass.uniforms : null); },
  get bloom() { return bloomPass; },
  get renderer() { return renderer; },
  get slunce() { return sun; },
  // Expozice se uplatní PŘED tónovým mapováním, takže na rozdíl od jasu
  // v gradingu vyrábí skutečná světla místo vybledlé šedi.
  setExpozice(v) { if (renderer) renderer.toneMappingExposure = v; return v; },
  get expozice() { return renderer ? renderer.toneMappingExposure : null; },
  // síla rozptýleného světla z mapy okolí (IBL)
  setProstredi(v) { if (scene) scene.environmentIntensity = v; return v; },
  get prostredi() { return scene ? scene.environmentIntensity : null; },
  get voda() { return VODA; },   // ladění hladiny: R3.voda.sila.value = 0.8
  get detail() { return DETAIL; },      // R3.detail.max = 0.5
  get vzduch() { return VZDUCH; },      // R3.vzduch.sila.value = 0 — ladí se za běhu
  get cesty() { return CESTA; },        // po změně musí render.js znovu poslat setCesty
  get figurka() { return FIGURKA; },    // R3.figurka.meritko = 1.3 (projeví se u NOVÝCH instancí)
  // "chybi" = model neexistuje (např. sedmý hrdina rodu, ranhojič z v0.52,
  // nemá v Blenderu stavitele) — render.js pak kreslí 2D zálohu
  stavFigurky(klic) { const m = modelyFigurek[klic]; return !m ? "neni" : (typeof m === "string" ? m : "ano"); },
  get figurky() { return korenFigurek; },
  get cestyMesh() { return cestyMesh; },
  get ohnisko() { return OHNISKO; },
  get ssao() { return ssaoPass; },      // R3.ssao.blendIntensity = 1.5
  get ssaoNast() { return SSAO; },      // po změně volej R3.prestav()
  get naklon() { return NAKLON; },      // R3.naklon.pas.value = 0.1
  // ladicí přístup do scény (ověřování lícování 3D vs 2D překryv)
  get scene() { return scene; },
  get cam() { return cam; },
  get ready() { return nactenoVse; },
  get missing() { return chybi; },
  THREE,
};
