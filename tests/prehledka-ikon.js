// KONTAKTNÍ ARCH IKONEK VÝBAVY (v0.39): vytáhne itemArtURL ze zdrojáku
// main.js, spustí ho v node s exporty game.js a vyrobí HTML přehledku
// vzorových druhů (tests/ikonky-vybavy.html — otevři v prohlížeči).
// Měřicí/náhledový nástroj jako krivka.js — není ve vse.js; validitu
// všech ikon hlídá test-truhly sada 9. Pouštěj po zásahu do kreslení.
const fs = require("fs");
const path = require("path");
const g = require("../js/game.js");
const src = fs.readFileSync(path.join(__dirname, "../js/main.js"), "utf8");
const zac = src.indexOf("const itemArtCache = {};");
const kon = src.indexOf("// ---------- Orbitální rozvržení stromu");
if (zac === -1 || kon === -1 || kon < zac) { console.error("itemArtURL nenalezen"); process.exit(1); }
const fn = new Function("RARITIES", "ITEM_SETS", "itemZaklad", "Math", "encodeURIComponent",
  src.slice(zac, kon) + "\nreturn itemArtURL;");
const itemArtURL = fn(g.RARITIES, g.ITEM_SETS, g.itemZaklad, Math, encodeURIComponent);

// vzorek: zbraně všech archetypů (vč. dvou variant téhož druhu), štíty,
// zbroje, přilby, boty, rukavice, set a signature
const vzorky = [
  { slot: "weapon", name: "Čepel z jam krvavé přísahy", rarity: 3 },
  { slot: "weapon", name: "Čepel z jam půlnoční smečky", rarity: 3 },
  { slot: "weapon", name: "Popelný sekáč", rarity: 2 },
  { slot: "weapon", name: "Drtič lebek z durgarských jam", rarity: 4 },
  { slot: "weapon", name: "Kopí jitra", rarity: 1 },
  { slot: "weapon", name: "Trnové kopí", rarity: 2 },
  { slot: "weapon", name: "Zřecova hůl", rarity: 3 },
  { slot: "weapon", name: "Meč strážců", rarity: 0 },
  { slot: "weapon", name: "Trnový luk", rarity: 2 },
  { slot: "weapon", name: "Lovecký tesák", rarity: 2 },
  { slot: "weapon", name: "Katova sekera", rarity: 4 },
  { slot: "weapon", name: "Strážcovo kladivo", rarity: 1 },
  { slot: "shield", name: "Sluneční pavéza", rarity: 3 },
  { slot: "shield", name: "Zrcadlový puklíř", rarity: 1 },
  { slot: "shield", name: "Štít poutníků", rarity: 2 },
  { slot: "armor", name: "Pláty temnot", rarity: 4 },
  { slot: "armor", name: "Ostnatá kroužkovka", rarity: 2 },
  { slot: "armor", name: "Roucho věčnosti", rarity: 3 },
  { slot: "helmet", name: "Rohatá přilba", rarity: 2 },
  { slot: "helmet", name: "Diadém svítání", rarity: 4 },
  { slot: "helmet", name: "Kapuce poutníka", rarity: 1 },
  { slot: "helmet", name: "Šišák světlonoše", rarity: 0 },
  { slot: "boots", name: "Okované boty hlídky", rarity: 2 },
  { slot: "boots", name: "Stopařské mokasíny", rarity: 1 },
  { slot: "gloves", name: "Drápavé rukavice", rarity: 3 },
  { slot: "gloves", name: "Latnice řádu", rarity: 2 },
  { slot: "weapon", set: "valecnik", name: "Popelný meč", rarity: 3 },
  { slot: "shield", sig: "aldar:2", name: "Sirotčí hradba", rarity: 4 },
  { slot: "boots", sig: "yllien:0", name: "Nyalliny tiché kroky", rarity: 4 },
];
const kachle = vzorky.map(it => `<div class="k"><img src="${itemArtURL(it)}">
  <b style="color:${g.RARITIES[it.rarity].color}">${it.name}</b>
  <small>${g.itemZaklad(it)}${it.sig ? " · ⭐ signature" : it.set ? " · ◆ set" : ""}</small></div>`).join("");
const html = `<!doctype html><meta charset="utf-8"><title>Ikonky výbavy</title>
<style>body{background:#0d1118;color:#dfe6f2;font-family:system-ui;padding:24px}
h2{color:#e8c56a;font-weight:600}p{color:#8d99b0;max-width:640px}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px}
.k{background:#161d29;border:1px solid #2c3648;border-radius:10px;padding:12px;text-align:center}
.k img{width:80px;height:80px;display:block;margin:0 auto 8px;background:#12161f;border-radius:10px}
.k b{font-size:12px;display:block;line-height:1.25}.k small{font-size:10px;color:#8d99b0}</style>
<h2>Ikonky druhů výbavy — generované z jmen</h2>
<p>Silueta se řídí významem jména (kladivo je kladivo, pavéza vysoký štít), detaily losuje
hash druhu, barvy dává rarita. Varianty přípon sdílí ikonku druhu. Signature nese zlatou jiskru.</p>
<div class="g">${kachle}</div>`;
const out = path.join(__dirname, "ikonky-vybavy.html");
fs.writeFileSync(out, html);
console.log("OK — " + vzorky.length + " vzorků → " + out);
