// Truhly v0.14: jediný tier, vždy přesně CHEST_ITEMS věcí a dárek hrdiny
// losovaný ze stejné tabulky rarit jako výbava.
const g = require(__dirname + "/../js/game.js");
let fail = 0, pass = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("  ✗ " + m); } };
const head = t => console.log("\n=== " + t + " ===");
// tolerance pro statistiku — Math.random se neseeduje, tak se drží zeširoka
const blizko = (a, b, tol) => Math.abs(a - b) <= tol;

head("1. Tabulka truhel");
const tiery = Object.keys(g.CHESTS);
ok(tiery.length === 1 && tiery[0] === "royal", `tierů je ${tiery.length} (${tiery}), čekán jen royal`);
ok(g.CHEST_ITEMS === 3, `CHEST_ITEMS = ${g.CHEST_ITEMS}, čekáno 3`);
const def = g.CHESTS.royal;
ok(def.cost === 400, `cena ${def.cost}, čekáno 400 (v0.27)`);
ok(def.giftChance === undefined && def.giftTierW === undefined,
  "giftChance/giftTierW měly zmizet — dárek už není extra drop");
ok(JSON.stringify(def.weights) === JSON.stringify([0, 0, 40, 24, 6]),
  "váhy rarit se nesměly změnit: " + def.weights);
ok(def.sideName.dobro && def.sideName.zlo, "truhla musí mít provedení pro obě strany");

head("2. Nedostatek jader");
const chudy = g.emptyAccount("chudak");
chudy.freeChestDay = g.dnesniDen(); // denní zdarma už vybraná — testujeme placení
// od 30. 8. 2026 startuje účet s 5 000 jádry (IV-R), takže chudáka je nutné
// vyrobit ručně — testuje se cesta „nemám na truhlu", ne výše uvítacího dárku
chudy.cores = def.cost - 1;
ok(chudy.cores < def.cost, "chudák nesmí mít na truhlu");
ok(g.accountOpenChest(chudy, "royal", "dobro") === null, "otevření bez jader musí vrátit null");
ok(g.accountOpenChest(chudy, "wooden", "dobro") === null, "zrušený tier musí vrátit null");

head("3. Vždy přesně 3 věci, nic navíc");
const acc = g.emptyAccount("boháč");
const N = 30000;
let items = 0, boosts = 0, gifts = 0, slots = 0, spatnychSlotu = 0;
const rar = {}, tier = {};
for (let i = 0; i < N; i++) {
  if (acc.cores < def.cost) g.accountRedeemCode(acc, "TEST100K");
  const r = g.accountOpenChest(acc, "royal", i % 2 ? "zlo" : "dobro");
  const n = r.items.length + r.boosts.length + r.gifts.length;
  if (n !== g.CHEST_ITEMS) spatnychSlotu++;
  slots += n; items += r.items.length; boosts += r.boosts.length; gifts += r.gifts.length;
  r.items.forEach(it => { rar[it.rarity] = (rar[it.rarity] || 0) + 1; });
  r.gifts.forEach(gf => {
    const t = g.rozborSkupiny(gf.key).tier;   // v0.44: klíč je skupina fkey:t<tier>
    tier[t] = (tier[t] || 0) + 1;
  });
}
ok(spatnychSlotu === 0, `${spatnychSlotu} truhel nedalo přesně ${g.CHEST_ITEMS} věcí`);
const P = x => 100 * x / slots;
console.log(`  výbava ${P(items).toFixed(2)} %  dárky ${P(gifts).toFixed(2)} %  doplňky ${P(boosts).toFixed(2)} %`);

head("4. Dárek má stejnou šanci jako výbava dle rarity");
// prostor rarit (70 b.) se dělí napůl → 35 % výbava, 35 % dárky, 30 % doplněk
ok(blizko(P(boosts), 30, 1.2), `doplňky ${P(boosts).toFixed(2)} %, čekáno 30`);
ok(blizko(P(items) - P(gifts), 0, 1.5),
  `výbava ${P(items).toFixed(2)} % vs dárky ${P(gifts).toFixed(2)} % — musí být stejné`);
// dárek tieru T ~ výbava rarity, která se na T mapuje (GIFT_RARITY_TIER)
const cil = [20, 12, 3]; // z vah 40/24/6 po půlce
for (let t = 0; t < 3; t++) {
  ok(blizko(P(tier[t] || 0), cil[t], 1.2),
    `dárky tieru ${t}: ${P(tier[t] || 0).toFixed(2)} %, čekáno ${cil[t]}`);
}
console.log("  dárky dle tieru: " + [0, 1, 2].map(t => `${g.HERO_TIERS[t].name} ${P(tier[t] || 0).toFixed(1)} %`).join(", "));
// výbava: 8 % slotů přebije signature kus (vždy legendární) — proto rarita 4
// vychází výš a rarity 2/3 o desetinu níž, než by čistá tabulka dala
console.log("  výbava dle rarity: " + Object.keys(rar).sort()
  .map(r => `${g.RARITIES[r].name} ${P(rar[r]).toFixed(1)} %`).join(", "));
ok(blizko(P(rar[2] || 0), 20 * 0.92, 1.2), `vzácná výbava ${P(rar[2] || 0).toFixed(2)} %, čekáno ~18,4`);
ok(blizko(P(rar[3] || 0), 12 * 0.92, 1.2), `epická výbava ${P(rar[3] || 0).toFixed(2)} %, čekáno ~11,0`);
ok(!rar[0] && !rar[1], "royal nesmí sypat obyčejné ani kvalitní kusy");

head("5. Strana truhly platí pro výbavu i dárky");
const acc2 = g.emptyAccount("strany");
let ciziKus = 0, ciziDarek = 0, kusu = 0, darku = 0;
for (const side of ["dobro", "zlo"]) {
  for (let i = 0; i < 600; i++) {
    if (acc2.cores < def.cost) g.accountRedeemCode(acc2, "TEST100K");
    const r = g.accountOpenChest(acc2, "royal", side);
    r.items.forEach(it => { kusu++; if (it.side !== side) ciziKus++; });
    r.gifts.forEach(gf => { darku++; if (g.sideOfFaction(g.rozborSkupiny(gf.key).fkey) !== side) ciziDarek++; });
  }
}
ok(ciziKus === 0, `${ciziKus} z ${kusu} kusů bylo z cizí strany`);
ok(ciziDarek === 0, `${ciziDarek} z ${darku} dárků bylo z cizí strany`);

head("6. Dárky se propisují na účet");
const acc3 = g.emptyAccount("sbirac");
g.accountRedeemCode(acc3, "TEST100K");
let odemceno = 0, hvezd = 0;
for (let i = 0; i < 300; i++) {
  if (acc3.cores < def.cost) g.accountRedeemCode(acc3, "TEST100K");
  const r = g.accountOpenChest(acc3, "royal", "dobro");
  // v0.43+: dárek z truhly nic neodemyká, jde do skladu — použije ho hráč
  r.gifts.forEach(gf => {
    if (gf.type !== "giftItem") throw new Error("truhla dárek aplikovala rovnou: " + gf.type);
  });
  // zvací list (v0.27) odemyká mimo dárky — počítá se taky
  if (r.invite && r.invite.type === "invite") odemceno++;
}
const respekt = Object.values(acc3.heroRespect).reduce((a, b) => a + b, 0);
const unlocks = Object.keys(acc3.heroUnlocks).length;
ok(unlocks > 0, "300 truhel neodemklo ani jednoho hrdinu — dárky se nepropisují");
ok(unlocks === odemceno, `odemčených hrdinů ${unlocks}, hlášeno ${odemceno} unlocků`);
ok(acc3.inventory.length > 0, "výbava se neuložila do skladu účtu");
console.log(`  ze 300 truhel: ${unlocks} odemčení, ${hvezd} povýšení, oddanost celkem ${respekt}`);

// --- 7. zvláštní vlastnosti výbavy a zušlechtění (v0.20) ---
head("7. Pasivky výbavy a zušlechtění");

// šance na pasivku roste s raritou a u obyčejných kusů je nulová
const cetnost = [0, 0, 0, 0, 0];
const VZORKU = 3000;
for (let r = 0; r < 5; r++)
  for (let i = 0; i < VZORKU; i++) if (g.rollItemPassive(r)) cetnost[r]++;
for (let r = 0; r < 5; r++) {
  const mereno = cetnost[r] / VZORKU, ceka = g.ITEM_PASSIVE_CHANCE[r];
  ok(Math.abs(mereno - ceka) < 0.05, `rarita ${r}: pasivka v ${(100*mereno).toFixed(0)} % (čekáno ${100*ceka} %)`);
}
ok(cetnost[0] === 0 && cetnost[1] === 0, "obyčejné kusy dostaly pasivku");
ok(cetnost[4] === VZORKU, "legendární kus nedostal pasivku vždy");
console.log("  šance dle rarity: " + cetnost.map((c, r) => `${r}:${(100*c/VZORKU).toFixed(0)}%`).join(" "));

// zušlechtění násobí účinek: základ × (stupeň + 1), strop ×6
const kus = { slot: "weapon", rarity: 4, value: 10, name: "T", pas: "ostri" };
const zaklad = g.itemPassiveEffs({ ...kus, refine: 0 })[0].val;
for (let st = 0; st <= g.REFINE_MAX; st++) {
  const v = g.itemPassiveEffs({ ...kus, refine: st })[0].val;
  ok(Math.abs(v - zaklad * (st + 1)) < 1e-9, `stupeň ${st}: ${v} místo ${zaklad * (st + 1)}`);
}
ok(g.itemPassiveEffs({ ...kus, refine: 99 })[0].val === zaklad * (g.REFINE_MAX + 1),
  "nad strop se násobek dál zvedá");
console.log(`  „${g.ITEM_PASSIVES.ostri.name}": ${zaklad} → ${zaklad * (g.REFINE_MAX + 1)} (×${g.REFINE_MAX + 1})`);

// pasivka se propisuje do statů hrdiny a roste zušlechtěním
g.newGame(0, 42, [0]);
const fp = g.G.factions[0];
fp.resources.gold = 99999;
const bezPas = g.heroStats(fp, 0).followUp;
fp.items.push({ id: 77001, slot: "weapon", rarity: 4, value: 10, name: "Čepel", pas: "ostri" });
g.equipItem(fp, 0, 77001);
const sPas = g.heroStats(fp, 0).followUp;
ok(sPas > bezPas, `pasivka se do statů nepropsala (${bezPas} → ${sPas})`);
ok(g.refineItem(fp, 77001), "zušlechtění neprošlo");
ok(g.heroStats(fp, 0).followUp > sPas, "zušlechtění stat nezvedlo");
console.log(`  navazující úder: ${bezPas} % → ${sPas} % → ${g.heroStats(fp, 0).followUp} % po zušlechtění`);

// podmínková pasivka (bonus typu jednotek) funguje taky
fp.items.push({ id: 77002, slot: "gloves", rarity: 4, value: 5, name: "Rukavice", pas: "kopinici", refine: 2 });
g.equipItem(fp, 0, 77002);
const infBonus = g.heroStats(fp, 0).unitDmg.inf;
ok(infBonus > 0, "podmínková pasivka (Kopiníci) se neprojevila");
ok(Math.abs(infBonus - g.ITEM_PASSIVES.kopinici.effs[0].val * 3) < 1e-9,
  `Kopiníci na stupni 2 dávají ${infBonus} místo ×3`);
console.log(`  Kopiníci (stupeň 2): pěchota +${infBonus} %`);

// zlato se strhne a meze drží
const zlatoPred = fp.resources.gold;
const stupenPred = fp.heroes[0].equip.weapon.refine;
ok(g.refineItem(fp, 77001), "druhé zušlechtění neprošlo");
ok(zlatoPred - fp.resources.gold === g.REFINE_COST[stupenPred + 1],
  `strženo ${zlatoPred - fp.resources.gold} místo ${g.REFINE_COST[stupenPred + 1]}`);
fp.heroes[0].equip.weapon.refine = g.REFINE_MAX;
ok(!g.refineItem(fp, 77001), "šlo zušlechtit přes strop");
fp.items.push({ id: 77003, slot: "boots", rarity: 0, value: 2, name: "Holé boty" });
ok(!g.refineItem(fp, 77003), "šel zušlechtit kus bez pasivky");
fp.resources.gold = 0;
fp.heroes[0].equip.weapon.refine = 0;
ok(!g.refineItem(fp, 77001), "zušlechtění prošlo bez zlata");
console.log("  meze drží: strop, kus bez pasivky i prázdná pokladna");

// pasivka i stupeň přežijí uložení na účet — v zásobě i na nasazeném kusu
fp.items.push({ id: 77004, slot: "shield", rarity: 4, value: 6, name: "Štít", pas: "amulet", refine: 4 });
const acc7 = g.emptyAccount("pas");
g.syncAccountFromFaction(acc7, fp);
const vZasobe = acc7.inventory.find(i => i.pas === "amulet");
ok(!!vZasobe, "pasivka kusu v zásobě se při uložení ztratila");
ok(vZasobe && vZasobe.refine === 4, `stupeň u kusu v zásobě se neuložil (${vZasobe && vZasobe.refine})`);
const nasazeny = acc7.heroProgress[fp.key + ":" + fp.heroes[0].defIdx].equip.gloves;
ok(nasazeny && nasazeny.pas === "kopinici", "pasivka NASAZENÉHO kusu se ztratila");
ok(nasazeny && nasazeny.refine === 2, `stupeň nasazeného kusu se neuložil (${nasazeny && nasazeny.refine})`);
console.log("  uložení na účet: pasivka i stupeň zůstávají u zásoby i nasazené výbavy");

// ---------- 8. druh kusu = identita ikonky (v0.39) ----------
console.log("\n=== 8. itemZaklad — druh kusu pro ikonku ===");
ok(g.itemZaklad({ slot: "weapon", name: "Čepel z jam krvavé přísahy" }) === "Čepel z jam"
  && g.itemZaklad({ slot: "weapon", name: "Čepel z jam půlnoční smečky" }) === "Čepel z jam",
  "varianty přípon sdílí druh (Čepel z jam)");
ok(g.itemZaklad({ slot: "weapon", name: "Popelný sekáč z Popelných plání" }) === "Popelný sekáč"
  && g.itemZaklad({ slot: "weapon", name: "Drtič lebek z durgarských jam" }) === "Drtič lebek",
  "různé kmeny = různé druhy");
ok(g.itemZaklad({ slot: "shield", name: "Štít poutníků prvních strážců" }) === "Štít poutníků",
  "nejdelší kmen vyhrává (krátký „Štít“ nekrade „Štít poutníků“)");
ok(g.itemZaklad({ slot: "weapon", name: "Meč starého krále" }) === "Meč",
  "univerzální pool (bez strany) se prohledává taky");
ok(g.itemZaklad({ slot: "weapon", set: "valecnik", name: "Popelný meč" }) === "Popelný meč",
  "setový kus = pevné jméno dílu");
ok(g.itemZaklad({ slot: "shield", sig: "aldar:2", name: "Sirotčí hradba" }) === "Sirotčí hradba",
  "signature = vlastní druh");
ok(g.itemZaklad({ slot: "weapon", name: "Neznámá čepel osudu" }) === "Neznámá čepel osudu",
  "neznámé jméno padá na celé jméno");
console.log("  druhy kusů se poznávají z kmene jména — ikonky drží identitu");

// ---------- 9. ikonky všech druhů = validní XML (v0.39) ----------
// Data-URI SVG je PŘÍSNÉ XML: duplicitní atribut v jediném tagu shodí celý
// obrázek (prohlížeč ukáže placeholder). Vytáhne itemArtURL ze zdrojáku
// main.js a projede každý druh z poolů + sety + signature ve všech raritách.
console.log("\n=== 9. itemArtURL — validní SVG pro všechny druhy ===");
{
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.join(__dirname, "../js/main.js"), "utf8");
  const zac = src.indexOf("const itemArtCache = {};");
  const kon = src.indexOf("// ---------- Orbitální rozvržení stromu");
  ok(zac !== -1 && kon > zac, "itemArtURL v main.js nenalezen");
  const vyroba = new Function("RARITIES", "ITEM_SETS", "itemZaklad", "Math", "encodeURIComponent",
    src.slice(zac, kon) + "\nreturn itemArtURL;");
  const itemArtURL = vyroba(g.RARITIES, g.ITEM_SETS, g.itemZaklad, Math, encodeURIComponent);
  const kusy = [];
  for (const slot of ["weapon", "shield", "armor", "helmet", "boots", "gloves"]) {
    for (const name of (g.ITEM_NAMES[slot] || [])) kusy.push({ slot, name });
    for (const strana of ["dobro", "zlo"])
      for (const name of (g.ITEM_SIDE_NAMES[strana][slot] || [])) kusy.push({ slot, name });
  }
  for (const setKey in g.ITEM_SETS)
    for (const slot in g.ITEM_SETS[setKey].pieces)
      kusy.push({ slot, set: setKey, name: g.ITEM_SETS[setKey].pieces[slot] });
  for (const sigKey in g.SIGNATURE_ITEMS)
    kusy.push({ slot: g.SIGNATURE_ITEMS[sigKey].slot, sig: sigKey, name: g.SIGNATURE_ITEMS[sigKey].name });
  const chyby = [];
  for (const kus of kusy) for (let r = 0; r < g.RARITIES.length; r++) {
    const url = itemArtURL({ ...kus, rarity: r });
    if (!url.startsWith("data:image/svg+xml,")) { chyby.push(kus.name + ": špatný prefix"); continue; }
    const svg = decodeURIComponent(url.slice("data:image/svg+xml,".length));
    for (const tag of svg.match(/<[a-zA-Z][^>]*>/g) || []) {
      const attrs = [...tag.matchAll(/\s([a-zA-Z-]+)="/g)].map(m => m[1]);
      if (new Set(attrs).size !== attrs.length) {
        chyby.push(`${kus.name} (r${r}): duplicitní atribut v ${tag.slice(0, 60)}…`);
        break;
      }
    }
    if (!svg.includes("</svg>")) chyby.push(kus.name + ": useknuté SVG");
  }
  if (chyby.length) console.log("  " + chyby.slice(0, 6).join("\n  "));
  ok(chyby.length === 0, `nevalidních ikon ${chyby.length} (duplicitní atributy apod.)`);
  console.log(`  prověřeno ${kusy.length} druhů × ${g.RARITIES.length} rarit — všechny ikonky validní`);
}

console.log(`\n${fail === 0 ? "✅" : "❌"} ${pass} testů prošlo, ${fail} selhalo`);
process.exit(fail ? 1 : 0);
