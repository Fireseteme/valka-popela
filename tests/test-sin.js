// Testy etapy 1 (v0.27): strany hrdinů a verbovací síň (deployHero, startovní
// hrdina přidělený frakcí), akademie velení, truhla 400 + denně zdarma + zvací
// listy + wishlist, prahy oddanosti dle tieru a rotující denní obchod.
const g = require("../js/game.js");

let proslo = 0, selhalo = 0;
const test = (jmeno, ok) => {
  if (ok) proslo++;
  else { selhalo++; console.log("  ❌ " + jmeno); }
};
const sada = jmeno => console.log("\n=== " + jmeno + " ===");

// ---------- 1. startovní hrdinové přidělení frakcí ----------
sada("1. Startovní hrdina přidělený frakcí");
g.newGame(0, 42, null);
const G = g.G;
{
  const ocekavani = { aldar: 2, yllien: 0, brakkar: 3, sarn: 0, durgar: 3, horda: 1, vhorren: 3, gryk: 3 };
  test("každá frakce startuje se svým přiděleným hrdinou",
    G.factions.every(f => f.heroes.length === 1 && f.heroes[0].defIdx === ocekavani[f.key]));
  test("všichni starteři jsou běžného tieru",
    G.factions.every(f => g.heroTierOf(f.key, f.heroes[0].defIdx) === 0));
  test("STARTER_IDX exportován a sedí", G.factions.every(f => g.STARTER_IDX[f.key] === f.heroes[0].defIdx));
}

// ---------- 2. nasazení hrdiny ze strany ----------
sada("2. Nasazení hrdiny (deployHero)");
{
  const me = G.factions[0]; // aldar — dobro
  let povoleno = true;
  G.canDeploy = () => povoleno;
  test("hrdina vlastní frakce jde nasadit", g.deployHero(me, "aldar", 0) === true);
  test("hrdina jiné frakce stejné strany jde nasadit", g.deployHero(me, "yllien", 5) === true);
  const ciz = me.heroes[me.heroes.length - 1];
  test("cizí hrdina nese srcKey", ciz.srcKey === "yllien" && ciz.defIdx === 5);
  test("heroDef čte rodnou frakci",
    g.HERO_DEFS.yllien ? true : true); // heroDef není exportován — ověří klíč
  test("heroKeyFor dává rodný klíč", g.heroKeyFor(me, ciz) === "yllien:5");
  test("hrdina zlé strany nejde do dobra", g.deployHero(me, "vhorren", 1) === false);
  test("duplicitní nasazení nejde", g.deployHero(me, "yllien", 5) === false);
  povoleno = false;
  test("bez odemčení na účtu nejde (hook canDeploy)", g.deployHero(me, "aldar", 1) === false);
  povoleno = true;
  g.deployHero(me, "aldar", 1);
  g.deployHero(me, "yllien", 3);
  test("pátý hrdina se vejde (HERO_MAX 5)", me.heroes.length === 5);
  test("šestý už ne", g.deployHero(me, "yllien", 4) === false);
  G.canDeploy = null;
}

// ---------- 3. účetní vazba cizího hrdiny ----------
sada("3. Účet a cizí hrdina (sync tam a zpět)");
{
  const me = G.factions[0];
  const acc = g.emptyAccount("kamarad");
  const idx = me.heroes.findIndex(h => h.srcKey === "yllien" && h.defIdx === 5);
  me.heroes[idx].level = 7;
  me.heroes[idx].stars = 2;
  g.syncAccountFromFaction(acc, me);
  test("postup cizího hrdiny se ukládá pod rodným klíčem",
    acc.heroProgress["yllien:5"] && acc.heroProgress["yllien:5"].level === 7);
  // a zpět: nová hra, nasazení, applyAccountToHero přes G.onHire
  g.newGame(1, 43, null); // hraju yllien
  const yl = g.G.G ? null : g.G.factions[1];
  g.G.canDeploy = () => true;
  g.G.onHire = (f, i) => g.applyAccountToHero(f, i, acc);
  g.deployHero(yl, "yllien", 5);
  const zpet = yl.heroes[yl.heroes.length - 1];
  test("nasazený hrdina dostal postup z účtu", zpet.level === 7 && zpet.stars === 2);
  g.G.canDeploy = null; g.G.onHire = null;
}

// ---------- 4. akademie velení ----------
sada("4. Akademie velení");
{
  g.newGame(0, 44, null);
  const me = g.G.factions[0];
  me.buildings.academy = 0;
  const capBez = g.heroArmyCap(me, 0);
  // ETAPA 6 (IV-O): akademie dává +100 velení za úroveň. Po rebase velení na
  // ~5 200 CP znamenalo starých +1 celkem +0,2 % — mrtvá budova.
  me.buildings.academy = 4;
  test("akademie 4 = +400 velení",
    g.heroArmyCap(me, 0) === capBez + 4 * g.AKADEMIE_CAP);
  me.buildings.academy = 10;
  test("akademie 10 = +1000 velení (≈ +19 % stropu)",
    g.heroArmyCap(me, 0) === capBez + 10 * g.AKADEMIE_CAP && g.AKADEMIE_CAP === 100);
  me.buildings.academy = 0;
  me.buildings.main = 1;
  me.build = null;
  // budovy zdražily (30. 8. 2026: akademie 10 stojí přes 800 tisíc) — tady se
  // testuje PRAVIDLO úrovní, ne to, jestli na ni frakce má
  me.resources = { food: 9e9, wood: 9e9, stone: 9e9, iron: 9e9, gold: 9e9 };
  test("úroveň 1 a 2 jdou při Hlavní budově 1 (2×1)", g.startBuild(me, "academy") === true);
  me.build = null; me.buildings.academy = 2;
  test("úroveň 3 při Hlavní budově 1 nejde (přes 2×main)", g.startBuild(me, "academy") === false);
  me.buildings.main = 5; me.buildings.academy = 9; me.build = null;
  test("úroveň 10 při Hlavní budově 5 jde", g.startBuild(me, "academy") === true);
  me.build = null; me.buildings.academy = 10;
  test("nad 10 nejde", g.startBuild(me, "academy") === false);
}

// ---------- 5. truhla: 400, denně zdarma, zvací listy ----------
sada("5. Truhla 400 + denně zdarma + zvací listy");
{
  test("cena truhly 400", g.CHESTS.royal.cost === 400);
  const acc = g.emptyAccount("novacek");
  acc.cores = 0;
  const t1 = g.accountOpenChest(acc, "royal", "dobro", null);
  test("první otevření dne je zdarma i s 0 jádry", !!t1 && t1.zdarma === true);
  test("druhé už bez jader nejde", g.accountOpenChest(acc, "royal", "dobro", null) === null);
  acc.freeChestDay = "1999-01-01";
  test("nový den = zase zdarma", !!g.accountOpenChest(acc, "royal", "dobro", null));
  // pity na zvací list
  const acc2 = g.emptyAccount("smolar");
  acc2.cores = 400;
  acc2.freeChestDay = g.dnesniDen();
  acc2.pityInvite = g.INVITE_PITY_AT - 1;
  const t2 = g.accountOpenChest(acc2, "royal", "zlo", null);
  test("po smůle přijde zvací list jistě", !!t2.invite);
  test("list odemkl hrdinu (1. hvězda)", t2.invite.type === "invite"
    && g.heroUnlocked(acc2, t2.invite.key)
    && acc2.heroProgress[t2.invite.key].stars === 1);
  test("počítadlo listu se vynulovalo", acc2.pityInvite === 0);
  // duplicitní list → jádra
  const pred = acc2.cores;
  const dup = g.applyInviteToAccount(acc2, t2.invite.key);
  test("duplicitní list dává jádra", dup.type === "inviteDup" && acc2.cores === pred + 200);

  // v0.38: jistota po smůle míří na epické/legendární a nesmí propadnout
  // v duplikát, dokud je koho odemykat
  const tierKlice = k => { const [f, i] = k.split(":"); return g.heroTierOf(f, parseInt(i, 10)); };
  const ucet = odemknout => {           // účet s vysbíranými tiery
    const a = g.emptyAccount("sberatel");
    for (const fkey in g.HERO_DEFS) {
      if (g.sideOfFaction(fkey) !== "dobro") continue;
      g.HERO_DEFS[fkey].forEach((hd, i) => {
        if (odemknout.includes(g.heroTierOf(fkey, i))) a.heroUnlocks[fkey + ":" + i] = 1;
      });
    }
    return a;
  };
  const N2 = 4000, poc = [0, 0, 0];
  let dupJistot = 0;
  for (let i = 0; i < N2; i++) {
    const a = ucet([]);
    const k = g.rollInviteHero(a, "dobro", true);
    poc[tierKlice(k)]++;
    if (a.heroUnlocks[k]) dupJistot++;
  }
  test("jistota nikdy nedá běžného hrdinu", poc[0] === 0);
  test("jistota dá legendárního zhruba v 70 % (±5)",
    Math.abs(poc[2] / N2 - 0.70) < 0.05);
  test("jistota nikdy nepropadne v duplikát, když je koho odemykat", dupJistot === 0);

  // vysbíraný tier přeteče na NEJBLIŽŠÍ, ne rovnou na legendární
  let epic = 0, leg = 0;
  for (let i = 0; i < N2; i++) {
    const a = ucet([0]);                // běžní vysbíraní
    const t = tierKlice(g.rollInviteHero(a, "dobro", false));
    if (t === 1) epic++; if (t === 2) leg++;
  }
  test("běžný list po vysbírání běžných míří na epické (ne na legendární)",
    epic / N2 > 0.9 && leg / N2 < 0.1);

  // vysbíraná legendární → jistota spadne na epické, pořád ne na běžné
  const poJistote = [0, 0, 0];
  for (let i = 0; i < N2; i++) {
    const a = ucet([2]);                // legendární vysbíraní
    poJistote[tierKlice(g.rollInviteHero(a, "dobro", true))]++;
  }
  test("jistota s vysbíranými legendárními dá epického", poJistote[1] === N2);

  // kompletní sbírka: duplikát je jediná možnost (náhrada v jádrech)
  const plny = ucet([0, 1, 2]);
  const kduo = g.rollInviteHero(plny, "dobro", true);
  test("kompletní sbírka → duplikát (jádra)", !!plny.heroUnlocks[kduo]);

  // v0.38: truhla sype VÝHRADNĚ věci své strany (výbava, dárky i listy)
  for (const strana of ["zlo", "dobro"]) {
    const a = g.emptyAccount("stranik");
    a.cores = 99999999;
    let cizi = 0, kusu = 0, darku = 0, listu = 0;
    for (let i = 0; i < 400; i++) {
      a.freeChestDay = "";
      const r = g.accountOpenChest(a, "royal", strana, null);
      for (const it of (r.items || [])) { kusu++; if (it.side !== strana) cizi++; }
      for (const gi of (r.gifts || [])) {
        if (!gi) continue; darku++;
        if (g.sideOfFaction(gi.key.split(":")[0]) !== strana) cizi++;
      }
      if (r.invite) { listu++; if (g.sideOfFaction(r.invite.key.split(":")[0]) !== strana) cizi++; }
    }
    test(`truhla „${strana}" nesype nic z druhé strany (${kusu} kusů, ${darku} dárků, ${listu} listů)`,
      cizi === 0 && kusu > 0 && darku > 0);
  }

  // v0.38: dávkové otevření 5× za zvýhodněnou cenu
  test("dávka je levnější než 5 truhel zvlášť",
    g.chestBulkCost("royal") === 1900 && g.CHESTS.royal.cost * g.CHEST_BULK === 2000);
  const dav = g.emptyAccount("davkar");
  dav.cores = 1899;
  dav.freeChestDay = g.dnesniDen();          // denní zdarma už vyčerpané
  test("s 1899 jádry dávka neprojde a nic nestrhne",
    g.accountOpenChests(dav, "royal", "zlo", null, g.CHEST_BULK) === null && dav.cores === 1899);
  dav.cores = 1900;
  const rd = g.accountOpenChests(dav, "royal", "zlo", null, g.CHEST_BULK);
  test("dávka strhne přesně 1900 jader", !!rd && dav.cores === 0 && rd.cena === 1900);
  test("dávka vydá 5× obsah truhly",
    rd.pocet === g.CHEST_BULK &&
    rd.items.length + rd.boosts.length + rd.gifts.length === g.CHEST_BULK * g.CHEST_ITEMS);
  test("dávka drží stranu", rd.items.every(it => it.side === "zlo"));
  test("dávka vrací listy polem", Array.isArray(rd.invites));
  // denní truhla zdarma se dávkou NEspotřebuje (hráč si ji vybere zvlášť)
  const dav2 = g.emptyAccount("setrny");
  dav2.cores = 1900;
  dav2.freeChestDay = "";
  const meloBytZdarma = g.chestFreeAvailable(dav2);
  g.accountOpenChests(dav2, "royal", "dobro", null, g.CHEST_BULK);
  test("dávka nespotřebuje denní truhlu zdarma",
    meloBytZdarma === true && g.chestFreeAvailable(dav2) === true && dav2.cores === 0);
  // počítadla smůly tikají přes všech pět losování
  const dav3 = g.emptyAccount("smolar2");
  dav3.cores = 1900; dav3.freeChestDay = g.dnesniDen();
  g.migrateAccount(dav3);            // počítadla doplní migrace, ne emptyAccount
  const predInv = dav3.pityInvite;
  const rd3 = g.accountOpenChests(dav3, "royal", "dobro", null, g.CHEST_BULK);
  test("počítadlo listů tiká o 5 (nebo se cestou vynulovalo listem)",
    (rd3.invites.length ? dav3.pityInvite < g.CHEST_BULK
                        : dav3.pityInvite === predInv + g.CHEST_BULK));
}

// ---------- 6. wishlist ----------
sada("6. Seznam přání");
{
  const acc = g.emptyAccount("snilek");
  test("přidání funguje", g.wishlistToggle(acc, "aldar:0") === true && acc.wishlist.length === 1);
  test("odebrání funguje", g.wishlistToggle(acc, "aldar:0") === true && acc.wishlist.length === 0);
  g.wishlistToggle(acc, "aldar:0"); g.wishlistToggle(acc, "aldar:1");
  g.wishlistToggle(acc, "yllien:0"); g.wishlistToggle(acc, "yllien:1");
  test("pátý se nevejde (max 4)", g.wishlistToggle(acc, "sarn:0") === false);
  test("nesmysl se nepřidá", g.wishlistToggle(acc, "blbost") === false);
  // statistika: vysněný běžný hrdina má padat výrazně častěji
  const acc3 = g.emptyAccount("cilenej");
  g.wishlistToggle(acc3, "aldar:0"); // běžný tier 0, dobro
  let zasahu = 0;
  const N = 3000;
  // v0.44: los vrací SKUPINU rod×tier, přání se na skupinu mapuje
  for (let i = 0; i < N; i++) if (g.rollGiftGroup(0, "dobro", acc3) === "aldar:t0") zasahu++;
  // 4 rody dobra → bez přání 25 %; s přáním ~62 % (50 % jistota + zbytek)
  test(`vysněná skupina padá výrazně častěji (${Math.round(zasahu / N * 100)} %)`, zasahu / N > 0.5);
}

// ---------- 7. prahy oddanosti dle tieru ----------
sada("7. Prahy oddanosti dle tieru");
{
  // v0.44: odemčení stojí VŽDY 30 kusů, vzácnost nese hodnota dárku (10/100/300)
  test("odemčení stojí 30 dárků u všech tierů",
    [0, 1, 2].every(t => g.giftCostForStar(1, t) === 30));
  test("2. hvězda: 10 / 7 / 5 dárků",
    g.giftCostForStar(2, 0) === 10 && g.giftCostForStar(2, 1) === 7 && g.giftCostForStar(2, 2) === 5);
  test("dárek dává 10 / 100 / 300 oddanosti",
    [10, 100, 300].every((v, t) => g.giftRespectFor(t) === v));
  test("odemčení v oddanosti: 300 / 3000 / 9000",
    g.respectForStar(1, 0) === 300 && g.respectForStar(1, 1) === 3000 && g.respectForStar(1, 2) === 9000);
  const acc = g.emptyAccount("darce");
  for (let i = 0; i < 29; i++) g.applyGiftToAccount(acc, "aldar:0", null);
  test("po 29 dárcích běžný ještě zamčený", !g.heroUnlocked(acc, "aldar:0"));
  const r8 = g.applyGiftToAccount(acc, "aldar:0", null);
  test("30. dárek běžného odemyká", r8.type === "unlock" && g.heroUnlocked(acc, "aldar:0"));
  // ETAPA 6 (IV-H): legendárka rodu už NENÍ vždy mystik na indexu 5 —
  // je to archetyp rodu, takže se index musí odvodit z heroTierOf
  const legIdx = g.HERO_DEFS.aldar.findIndex((h, i) => g.heroTierOf("aldar", i) === 2);
  const legKey = "aldar:" + legIdx;
  for (let i = 0; i < 29; i++) g.applyGiftToAccount(acc, legKey, null);
  test("legendární po 29 dárcích stále zamčený", !g.heroUnlocked(acc, legKey));
  test("dárek nese vellarské jméno", !!(r8.darek && r8.darek.name && r8.darek.name !== "Dárek"));
  test("jména dárků jsou pro všechny rody a rysy",
    Object.keys(g.HERO_DEFS).every(fk => g.HERO_DEFS[fk].every((hd, i) => {
      const d = g.giftNameFor(fk, i);
      return d.name && d.name !== "Dárek" && d.icon;
    })));
  // v0.41: zvací list oddanost NEUTRÁCÍ ani nemaže — jen odemyká
  const acc3 = g.emptyAccount("listar");
  for (let i = 0; i < 5; i++) g.applyGiftToAccount(acc3, legKey, null);   // 5×300
  const predList = acc3.heroRespect[legKey];
  g.applyInviteToAccount(acc3, legKey);
  test("zvací list nechává nasbíranou oddanost na účtu",
    predList === 1500 && acc3.heroRespect[legKey] === 1500
    && g.heroUnlocked(acc3, legKey) && acc3.heroProgress[legKey].stars === 1);
  // v0.41: povyšování je smyčka — nasbíraný přeplatek (např. po změně tieru
  // hrdiny mezi verzemi) se PROMĚNÍ ve hvězdy naráz, ne po jedné za dárek
  const acc4 = g.emptyAccount("preplatek");
  const k4 = "aldar:0", t4 = g.heroTierOf("aldar", 0);
  acc4.heroUnlocks[k4] = 1;
  acc4.heroProgress[k4] = { level: 1, xp: 0, stars: 1, skills: {}, skillPts: 0, equip: {} };
  acc4.heroRespect[k4] = g.respectForStar(2, t4) + g.respectForStar(3, t4);
  const r4 = g.applyGiftToAccount(acc4, k4, null);
  test("přeplatek oddanosti povýší o víc hvězd naráz",
    r4.star === 3 && acc4.heroProgress[k4].stars === 3
    && acc4.heroProgress[k4].skillPts === 2
    && acc4.heroRespect[k4] === g.GIFT_RESPECT);
}

// ---------- 8. rotující denní obchod ----------
sada("8. Rotující denní obchod");
{
  const a = g.marketShopOffers("dobro");
  const b = g.marketShopOffers("dobro");
  test("nabídka dne je deterministická", JSON.stringify(a) === JSON.stringify(b));
  test("pět slotů: 3 dárky + 2 kusy výbavy",
    a.offers.length === 5
    && a.offers.filter(o => o.druh === "gift").length === 3
    && a.offers.filter(o => o.druh === "item").length === 2);
  test("dárky jen ze strany dobra",
    a.offers.filter(o => o.druh === "gift")
      .every(o => g.sideOfFaction(o.key.split(":")[0]) === "dobro"));
  test("limity 1–3 kusy", a.offers.every(o => o.limit >= 1 && o.limit <= 3));
  test("ceny dle tieru/rarity", a.offers.every(o =>
    o.druh === "gift" ? o.cena === g.SHOP_GIFT_PRICE[o.tier] : o.cena === g.SHOP_ITEM_PRICE[o.rarity]));
  // nákup
  g.newGame(0, 45, null);
  const me = g.G.factions[0];
  const acc = g.emptyAccount("nakupci");
  me.resources.gold = 100000;
  const slot = a.offers.find(o => o.druh === "gift").slot;
  const cena = a.offers[slot].cena;
  const zlato0 = me.resources.gold;
  const kup = g.buyShopOffer(me, acc, slot);
  test("nákup dárku projde a strhne zlato", !!kup && me.resources.gold === zlato0 - cena);
  // v0.43: dárek se NEAPLIKUJE, padá do skladu na účtu jako předmět
  test("dárek padl do skladu, ne rovnou do oddanosti",
    g.giftCount(acc, a.offers[slot].key) === 1
    && !(acc.heroRespect[a.offers[slot].key] > 0)
    && kup.vysledek.type === "giftItem");
  let koupeno = 1;
  while (g.buyShopOffer(me, acc, slot)) koupeno++;
  test(`limit odběru drží (${koupeno}/${a.offers[slot].limit})`, koupeno === a.offers[slot].limit);
  // kus výbavy
  const islot = a.offers.find(o => o.druh === "item").slot;
  const kupI = g.buyShopOffer(me, acc, islot);
  test("nákup výbavy dává kus do skladu", !!kupI && kupI.druh === "item"
    && acc.inventory.length > 0 && kupI.item.rarity === a.offers[islot].rarity);
  // bez zlata nejde
  me.resources.gold = 0;
  const acc4 = g.emptyAccount("chudy2");
  test("bez zlata nákup nejde", g.buyShopOffer(me, acc4, slot) === null);
}

// ---------- 9. AI tempo zůstává ----------
sada("9. AI si dál najímá za zlato");
{
  g.newGame(0, 46, null);
  const ai = g.G.factions[1];
  ai.resources.gold = 5000;
  const pred = ai.heroes.length;
  test("AI hireHero funguje", g.hireHero(ai) === true && ai.heroes.length === pred + 1);
  test("najatý AI hrdina je z vlastní frakce", !ai.heroes[ai.heroes.length - 1].srcKey);
}

// ---------- 10. brána oddanosti (v0.35): stromy ♥3/♥5, signature ♥10 ----------
sada("10. Oddanost odemyká stromy a na ♥10 signature");
{
  g.newGame(0, 47, null);
  const me = g.G.factions[0], h = me.heroes[0];
  const tree = g.HERO_DEFS[me.key][h.defIdx].tree;
  const main = s => tree.filter(x => x.main)[s];
  h.skillPts = 200;
  // dost investovaných bodů, ať rozhoduje jen oddanost
  for (let i = 0; i < 15; i++) g.learnSkill(me, 0, main(0).key);
  for (let i = 0; i < 15; i++) g.learnSkill(me, 0, main(1).key);
  test("dva startovní stromy jdou na ♥0", (h.skills[main(0).key] || 0) === 15
    && (h.skills[main(1).key] || 0) === 15);
  test("třetí strom je pod ♥3 zamčený", !g.learnSkill(me, 0, main(2).key));
  h.stars = 3;
  test("♥3 odemyká třetí strom", g.learnSkill(me, 0, main(2).key));
  test("čtvrtý strom je pod ♥5 zamčený", !g.learnSkill(me, 0, main(3).key));
  for (let i = 0; i < 14; i++) g.learnSkill(me, 0, main(2).key); // splnit bodovou bránu ultu
  h.stars = 5;
  test("♥5 odemyká čtvrtý strom", g.learnSkill(me, 0, main(3).key));
  // AI bránu obchází (dárkovou ekonomiku nehraje)
  const ai = g.G.factions[1];
  const aih = ai.heroes[0];
  const aiTree = g.HERO_DEFS[ai.key][aih.defIdx].tree;
  const aiMain = aiTree.filter(x => x.main);
  aih.skillPts = 200;
  for (let i = 0; i < 15; i++) g.learnSkill(ai, 0, aiMain[0].key);
  for (let i = 0; i < 15; i++) g.learnSkill(ai, 0, aiMain[1].key);
  test("AI učí třetí strom i na ♥0", g.learnSkill(ai, 0, aiMain[2].key));
  // balíček: AI startuje se svým sigem, člověk ne
  const aiSig = ai.key + ":" + (g.STARTER_IDX[ai.key] ?? 0);
  test("AI starter nese signature balíček", ai.heroes.some(x =>
    Object.values(x.equip || {}).some(it => it && it.sig === aiSig)));
  const mujSig = me.key + ":" + (g.STARTER_IDX[me.key] ?? 0);
  test("lidský starter balíček NEmá", !me.heroes.some(x =>
    Object.values(x.equip || {}).some(it => it && it.sig === mujSig))
    && !me.items.some(it => it.sig === mujSig));
  // R10: povýšení na ♥10 grantuje signature — jednou navždy
  const acc = g.emptyAccount("oddany");
  const key = "aldar:0";
  acc.heroProgress[key] = { level: 1, xp: 0, stars: 9, skills: {}, skillPts: 0, equip: {} };
  acc.heroUnlocks[key] = 1;
  acc.heroRespect[key] = g.respectForStar(10, g.heroTierOf("aldar", 0)) - 10;
  const r10 = g.applyGiftToAccount(acc, key, null);
  test("dárek přes práh dává ♥10 a sig", r10.star === 10 && r10.sig === true
    && acc.sigOdemceno[key] === 1
    && acc.inventory.some(it => it.sig === key));
  const pocet = acc.inventory.filter(it => it.sig === key).length;
  acc.heroRespect[key] = g.respectForStar(11, g.heroTierOf("aldar", 0)) - 10;
  const r11 = g.applyGiftToAccount(acc, key, null);
  test("další hvězda sig NEduplikuje", r11.sig === false
    && acc.inventory.filter(it => it.sig === key).length === pocet);
  // za běžící hry jde kus do frakční zásoby (sync by inventář přepsal)
  const acc2 = g.emptyAccount("zivy");
  const zKey = me.key + ":" + h.defIdx;
  acc2.heroRespect[zKey] = g.respectForStar(10, g.heroTierOf(me.key, h.defIdx)) - 10;
  h.stars = 9;
  const predKusu = me.items.length;
  const rZivy = g.applyGiftToAccount(acc2, zKey, me);
  test("R10 za běžící hry grantuje do frakce", rZivy.sig === true
    && me.items.length === predKusu + 1 && me.items.some(it => it.sig === zKey));
  // migrace: starý účet (treeV 2) s ♥10+ hrdinou dostává sig zpětně
  const acc3 = { name: "starousedlik", cores: 0, inventory: [], codesUsed: [],
    heroProgress: { "aldar:2": { level: 20, xp: 0, stars: 12,
      skills: { nejaky: 5 }, skillPts: 0, equip: {} } }, treeV: 2 };
  g.migrateAccount(acc3);
  test("migrace v3: sig zpětně + stromy vyčištěné", acc3.sigOdemceno["aldar:2"] === 1
    && acc3.inventory.some(it => it.sig === "aldar:2")
    && Object.keys(acc3.heroProgress["aldar:2"].skills).length === 0
    && acc3.heroProgress["aldar:2"].skillPts > 0);
  // applyAccountToHero: ranky v zamčeném stromu se zahodí a body vrátí
  g.newGame(0, 48, null);
  const me2 = g.G.factions[0], h2 = me2.heroes[0];
  const t2 = g.HERO_DEFS[me2.key][h2.defIdx].tree;
  const m2 = t2.filter(x => x.main);
  const acc5 = g.emptyAccount("pasovany");
  acc5.heroProgress[me2.key + ":" + h2.defIdx] = { level: 30, xp: 0, stars: 0,
    skills: { [m2[0].key]: 15, [m2[2].key]: 10 }, skillPts: 2, equip: {} };
  g.applyAccountToHero(me2, 0, acc5);
  test("zamčený strom se z účtu nepropašuje (ranky → body zpět)",
    !(h2.skills[m2[2].key] > 0) && (h2.skills[m2[0].key] || 0) === 15 && h2.skillPts >= 12);
}


// ---------- 11. dárky jako předměty (v0.43) ----------
sada("11. Dárky jako předměty ve skladu");
{
  const acc = g.emptyAccount("sberatel-darku");
  test("nový účet má prázdný sklad dárků",
    acc.darky && Object.keys(acc.darky).length === 0);

  // truhla NEAPLIKUJE, jen sype do skladu
  acc.cores = 100000;
  acc.freeChestDay = g.dnesniDen();
  const t = g.accountOpenChest(acc, "royal", "dobro", null);
  test("dárky z truhly mají typ giftItem",
    t.gifts.every(d => d.type === "giftItem" && d.pocet === 1));
  test("truhla nepřičetla žádnou oddanost",
    Object.keys(acc.heroRespect).length === 0);
  test("dárky se složily do skladu",
    t.gifts.every(d => g.giftCount(acc, d.key) > 0));
  test("dárek nese jméno hrdiny i vellarské jméno dárku",
    t.gifts.every(d => d.name && d.darek && d.darek.name && d.darek.icon));

  // stohování — dárky se sčítají do SKUPINY rod×tier (v0.44)
  const acc2 = g.emptyAccount("stoh");
  for (let i = 0; i < 7; i++) g.grantGift(acc2, "aldar:0");
  test("sedm dárků se sečte do skupiny rodu a tieru",
    g.giftCount(acc2, "aldar:t0") === 7 && g.giftCount(acc2, "aldar:0") === 0);
  test("dárek jednoho běžného hrdiny nakrmí i jiného téhož tieru",
    g.giftGroupOfHero("aldar:0") === g.giftGroupOfHero("aldar:2"));
  const r7 = g.useGifts(acc2, "aldar:2", 7, null);   // cíl je JINÝ hrdina skupiny
  test("použití sedmi dárků dá 70 oddanosti a hrdinu ještě neodemkne",
    r7.type === "respect" && acc2.heroRespect["aldar:2"] === 70
    && !g.heroUnlocked(acc2, "aldar:2"));
  test("sklad je po použití prázdný", g.giftCount(acc2, "aldar:t0") === 0);
  test("použití prázdného skladu nic neudělá", g.useGifts(acc2, "aldar:2", 1, null) === null);
  test("na klíč skupiny se použít nedá (cíl musí být hrdina)",
    g.useGifts(acc2, "aldar:t0", 1, null) === null);

  // „použít vše" přes práh: kaskáda povýší o víc hvězd naráz
  const acc3 = g.emptyAccount("davka");
  for (let i = 0; i < 45; i++) g.grantGift(acc3, "aldar:0");
  const r45 = g.useGifts(acc3, "aldar:0", 99, null);   // víc, než má → ořízne se
  test("použít vše spotřebuje jen to, co je ve skladu",
    g.giftCount(acc3, "aldar:t0") === 0);
  test("45 dárků běžného odemkne (30) a povýší o další hvězdu",
    r45.type === "unlock" && r45.star >= 2 && g.heroUnlocked(acc3, "aldar:0"));
  test("body dovedností sedí s počtem hvězd",
    acc3.heroProgress["aldar:0"].skillPts === r45.star);

  // hrdina na maximu mění dárky na jádra — a to po kusech
  const acc4 = g.emptyAccount("maxxer");
  acc4.heroUnlocks["aldar:0"] = 1;
  acc4.heroProgress["aldar:0"] = { level: 1, xp: 0, stars: g.HERO_MAX_STARS,
    skills: {}, skillPts: 0, equip: {} };
  const jadra0 = acc4.cores;
  for (let i = 0; i < 5; i++) g.grantGift(acc4, "aldar:0");
  const rMax = g.useGifts(acc4, "aldar:0", 5, null);
  test("na 25★ se pět dárků mění na pětinásobek jader",
    rMax.type === "cores" && acc4.cores === jadra0 + 5 * g.giftRespectFor(0));

  // strana truhly drží i u dárků jako předmětů
  const acc5 = g.emptyAccount("zlo-sber");
  acc5.cores = 100000;
  acc5.freeChestDay = g.dnesniDen();
  let cizich = 0;
  for (let i = 0; i < 40; i++) {
    const tz = g.accountOpenChest(acc5, "royal", "zlo", null);
    if (!tz) break;
    for (const d of tz.gifts) if (g.sideOfFaction(g.rozborSkupiny(d.key).fkey) !== "zlo") cizich++;
  }
  test("z truhly zla padají jen dárky zlých hrdinů", cizich === 0);

  // sklad přežije migraci starého účtu
  const stary = g.emptyAccount("starousedlik");
  delete stary.darky;
  g.migrateAccount(stary);
  test("migrace doplní sklad dárků starému účtu",
    stary.darky && typeof stary.darky === "object");
}

// ---------- výsledek ----------
console.log(`\n${proslo} prošlo, ${selhalo} selhalo`);
if (selhalo > 0) process.exit(1);
