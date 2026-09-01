// NÁSTROJ (ne test): CELÝ SVĚT JAKO OBRÁZEK.
//
//     node tests/obrazek-sveta.js                       → svět 955×955 ze seedu 42
//     node tests/obrazek-sveta.js --mapa 34 --seed 7    → jiná velikost a seed
//     node tests/obrazek-sveta.js --snimek data/sezona.json.gz   → BĚŽÍCÍ svět
//     node tests/obrazek-sveta.js --rezim stupne     → mapa podle síly polí
//     node tests/obrazek-sveta.js --zoom 2 --ven svet.png
//
// Režimy:
//   teren  (výchozí) — terén, žíly (uzly 2×2) a stavby
//   stupne           — síla polí ⚔1–12 jako teplotní škála; ukáže pásma
//                      obtížnosti a rozseté žíly líp než terén
//
// Proč to existuje: hráč ani vývojář CELOU mapu v prohlížeči nikdy neuvidí.
// Server posílá jen okruh zájmu (na 955×955 je to 0,7 % světa) a zbytek je
// mlha — což je správně pro hru, ale k nakouknutí, jestli generátor dělá
// rozumné pobřeží, prstence a rozmístění keepů, je to k ničemu.
//
// Obrázek je jedna dlaždice = jeden pixel (--zoom škáluje). Mapa je na
// obrazovce otočená o 45°, tady schválně NENÍ: čtvercová mřížka (q, r) se
// kreslí přímo, takže je vidět geometrie tak, jak ji generátor staví.
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const g = require(path.join(__dirname, "..", "js", "game.js"));

const arg = (jmeno, vych) => {
  const i = process.argv.indexOf("--" + jmeno);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : vych;
};

// ---------- minimální kodér PNG (zlib je vestavěný, CRC si spočítáme) ----------
const CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function kus(typ, data) {
  const delka = Buffer.alloc(4);
  delka.writeUInt32BE(data.length);
  const telo = Buffer.concat([Buffer.from(typ, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(telo));
  return Buffer.concat([delka, telo, crc]);
}
function png(sirka, vyska, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(sirka, 0); ihdr.writeUInt32BE(vyska, 4);
  ihdr[8] = 8; ihdr[9] = 2;             // 8 bitů, truecolor RGB
  // řádky s filtrem 0 na začátku (PNG to vyžaduje)
  const radek = sirka * 3;
  const syrove = Buffer.alloc((radek + 1) * vyska);
  for (let y = 0; y < vyska; y++) {
    syrove[y * (radek + 1)] = 0;
    rgb.copy(syrove, y * (radek + 1) + 1, y * radek, (y + 1) * radek);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    kus("IHDR", ihdr),
    kus("IDAT", zlib.deflateSync(syrove, { level: 6 })),
    kus("IEND", Buffer.alloc(0)),
  ]);
}
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ---------- barvy ----------
// Stavby přebijí terén, ať je na první pohled vidět kostra světa.
// Uzel 2×2 (žíla suroviny) NENÍ stavba, takže by v terénním režimu splynul
// s loukou — a přitom je to hlavní obsah mapy: na 955×955 jich je 17 739.
const UZEL = "#00e5ff";
// teplotní škála pro stupně polí ⚔1 (slabé) → ⚔12 (nejsilnější)
const STUPNE = ["#1b3a6b", "#1f5b8f", "#2382a1", "#2fa38c", "#59bd6a", "#9ccc4f",
  "#d4d13f", "#e8ae35", "#ef8330", "#e2542c", "#c62f2f", "#ffffff"];
const STAVBY = {
  throne:      "#ffffff",
  capital:     "#ff4fd8",
  city:        "#ff9d3f",
  keep:        "#ffe14f",
  grandfort:   "#ff5c5c",
  fortress:    "#ff8c42",
  bastion:     "#d96a4a",
  bridge:      "#7fd4ff",
  outpost:     "#b6ff6a",
  klanpevnost: "#c58aff",
};

function nacti() {
  const snimek = arg("snimek", null);
  if (snimek) {
    // ⚠ VP_DATA přesměruje úložiště — modul sezona.js čte adresář, ne soubor
    process.env.VP_DATA = path.dirname(path.resolve(snimek));
    const db = require(path.join(__dirname, "..", "server", "sezona.js"));
    const stav = db.nacti();
    if (!stav) { console.error("snímek se nepodařilo přečíst: " + snimek); process.exit(1); }
    g.setMapRadius(stav.mapaR || 34);
    for (const [k, t] of stav.G.tiles) g.G.tiles.set(k, t);
    return { R: g.MAP_R, zdroj: "snímek " + snimek + " (tik " + stav.G.tick + ")" };
  }
  const R = parseInt(arg("mapa", "477"), 10);
  const seed = parseInt(arg("seed", "42"), 10);
  g.setMapRadius(R);
  g.setSeasonHours(336);
  g.newGame(0, seed, null);
  return { R, zdroj: "generátor, seed " + seed };
}

const t0 = Date.now();
const { R, zdroj } = nacti();
const zoom = Math.max(1, parseInt(arg("zoom", "1"), 10));
const strana = 2 * R + 1;
const sirka = strana * zoom, vyska = strana * zoom;
const rgb = Buffer.alloc(sirka * vyska * 3, 0x10);

const rezim = arg("rezim", "teren");
let poli = 0, staveb = 0, uzlu = 0;
for (const t of g.G.tiles.values()) {
  let barva;
  if (rezim === "stupne") {
    barva = g.TERRAIN[t.terrain].passable
      ? STUPNE[Math.max(0, Math.min(11, (t.level || 1) - 1))]
      : "#0b1220";                              // voda a hradby zůstanou tmavé
    if (t.structure && STAVBY[t.structure]) { barva = STAVBY[t.structure]; staveb++; }
  } else {
    barva = g.TERRAIN[t.terrain] ? g.TERRAIN[t.terrain].color : "#000000";
    if (t.bigSize && !t.structure) { barva = UZEL; uzlu++; }
    if (t.structure && STAVBY[t.structure]) { barva = STAVBY[t.structure]; staveb++; }
    else if (t.owner >= 0 && g.FACTION_DEFS[t.owner]) barva = g.FACTION_DEFS[t.owner].color;
  }
  const [cr, cg, cb] = hex(barva);
  const x0 = (t.q + R) * zoom, y0 = (t.r + R) * zoom;
  for (let dy = 0; dy < zoom; dy++) {
    let o = ((y0 + dy) * sirka + x0) * 3;
    for (let dx = 0; dx < zoom; dx++) { rgb[o++] = cr; rgb[o++] = cg; rgb[o++] = cb; }
  }
  poli++;
}

const ven = arg("ven", path.join(__dirname, "..", "svet-" + strana + "x" + strana + ".png"));
fs.writeFileSync(ven, png(sirka, vyska, rgb));
console.log(`svět ${strana}×${strana} · ${poli} polí · ${staveb} staveb · ${uzlu} polí žil · ${zdroj}`);
console.log(`obrázek ${sirka}×${vyska} px → ${ven} (${(fs.statSync(ven).size / 1048576).toFixed(2)} MB, ${Date.now() - t0} ms)`);
console.log(rezim === "stupne"
  ? "legenda: modrá = slabá pole ⚔1 → bílá = ⚔12; tmavá = voda a hradby"
  : "legenda: bílá = Trůn · růžová = kapitál · žlutá = keep · červená = velká pevnost"
    + " · světle modrá = most · azurová = žíla (uzel 2×2) · zelená = výspa");
