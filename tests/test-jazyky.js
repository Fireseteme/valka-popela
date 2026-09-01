// JAZYKY (etapa 12b, IV-S): slovník, dosazování, záložní jazyk a hlavně to,
// že se tři jazyky nerozejdou. Jeden chybějící klíč se v běžící hře pozná až
// tím, že někomu na obrazovce svítí ⟨klic⟩ — test ho chytí dřív.
const j = require(__dirname + "/../js/jazyky.js");
const g = require(__dirname + "/../js/game.js");

let proslo = 0, selhalo = 0;
const test = (jmeno, ok) => {
  if (ok) proslo++;
  else { selhalo++; console.log("  ❌ " + jmeno); }
};
const sada = jmeno => console.log("\n=== " + jmeno + " ===");

sada("1. Tři jazyky, žádný se nesmí rozejít");
{
  const kody = j.JAZYKY_SEZNAM.map(x => x.kod);
  test("seznam má češtinu, angličtinu a španělštinu",
    kody.includes("cs") && kody.includes("en") && kody.includes("es"));
  test("výchozí je čeština", j.JAZYK_VYCHOZI === "cs");

  const klice = Object.keys(j.SLOVNIK.cs);
  test(`slovník má klíče (${klice.length})`, klice.length > 50);
  for (const kod of kody) {
    if (kod === "cs") continue;
    const chybi = klice.filter(k => !j.SLOVNIK[kod][k]);
    const navic = Object.keys(j.SLOVNIK[kod]).filter(k => !j.SLOVNIK.cs[k]);
    test(`${kod}: nechybí ani jeden klíč${chybi.length ? " (" + chybi.slice(0, 5).join(", ") + ")" : ""}`,
      chybi.length === 0);
    test(`${kod}: nemá klíč navíc${navic.length ? " (" + navic.slice(0, 5).join(", ") + ")" : ""}`,
      navic.length === 0);
  }
}

sada("2. Dosazování parametrů sedí ve všech jazycích");
{
  const klice = Object.keys(j.SLOVNIK.cs);
  // ⚠ Věta se v překladu smí přeskládat, ale MUSÍ použít tytéž parametry —
  // jinak zůstane v textu {kdo} nebo zmizí jméno.
  let nesedi = [];
  for (const k of klice) {
    const par = s => (String(s).match(/\{(\w+)\}/g) || []).sort().join(",");
    const cs = par(j.SLOVNIK.cs[k]);
    for (const kod of ["en", "es"]) if (par(j.SLOVNIK[kod][k]) !== cs) nesedi.push(kod + ":" + k);
  }
  test(`parametry sedí u všech klíčů${nesedi.length ? " (" + nesedi.slice(0, 5).join(", ") + ")" : ""}`,
    nesedi.length === 0);

  j.nastavJazyk("cs", false);
  test("dosadí se hodnota", j.tx("kron.valka", { a: "Aldar", b: "Horda" }).includes("Aldar"));
  test("a obě", j.tx("kron.valka", { a: "Aldar", b: "Horda" }).includes("Horda"));
  test("chybějící parametr nechá zástupku", j.tx("kron.valka", { a: "Aldar" }).includes("{b}"));
  test("bez parametrů to nespadne", typeof j.tx("kron.valka") === "string");
}

sada("3. Přepnutí jazyka a záložní čeština");
{
  j.nastavJazyk("en", false);
  test("angličtina se přepnula", j.aktualniJazyk() === "en");
  test("a vrací anglický text", j.tx("ucet.prihlasit") === "Sign in");
  j.nastavJazyk("es", false);
  test("španělština taky", j.tx("ucet.prihlasit") === "Iniciar sesión");
  test("neznámý jazyk se odmítne", !j.nastavJazyk("de", false) && j.aktualniJazyk() === "es");
  test("chybějící klíč NEMLČÍ, ukáže ⟨klic⟩", j.tx("neco.neexistuje") === "⟨neco.neexistuje⟩");
  // záložní čeština: klíč, který v cizím jazyce chybí (simulace)
  const zaloha = j.SLOVNIK.es["spol.ano"];
  delete j.SLOVNIK.es["spol.ano"];
  test("chybějící překlad spadne na češtinu", j.tx("spol.ano") === j.SLOVNIK.cs["spol.ano"]);
  j.SLOVNIK.es["spol.ano"] = zaloha;
  j.nastavJazyk("cs", false);
}

sada("4. JMÉNA VELLARU se nepřekládají");
{
  // Vlastní IP světa musí zůstat stejná ve všech jazycích — kdyby se některé
  // jméno omylem dostalo do slovníku, hráči by si nerozuměli.
  // ⚠ ROZLIŠENÍ od v0.70: jméno rodu je jen ZPOLA vlastní. „Aldarské
  // KRÁLOVSTVÍ" je popisný titul kolem jména Aldar, takže se obal překládá
  // a chráněný je KMEN. Kraje a hrdinové jsou naopak čistá vlastní jména
  // a do slovníku nesmí vůbec.
  const jmena = [
    ...g.REGION_NAMES,
    ...Object.values(g.HERO_DEFS).flat().map(h => h.name),
  ];
  const vsechnyTexty = [];
  for (const kod of Object.keys(j.SLOVNIK))
    for (const k in j.SLOVNIK[kod]) vsechnyTexty.push(j.SLOVNIK[kod][k]);
  const proniklo = jmena.filter(n => n && n.length > 4
    && vsechnyTexty.some(txt => txt.includes(n)));
  test(`jméno kraje ani hrdiny není ve slovníku${
    proniklo.length ? " (" + proniklo.slice(0, 3).join(", ") + ")" : ""}`, proniklo.length === 0);

  // kmen jména rodu musí stát ve VŠECH jazycích stejně
  const KMENY = { aldar: "Aldar", yllien: "Yllien", durgar: "Durgar", brakkar: "Brakkar",
    sarn: "Sarn", vhorren: "Vhorren", gryk: "Gryk" };   // „horda" je popisná ve všech jazycích
  // ⚠ Čeština se nekontroluje: ohýbá kmen na přídavné jméno („Gryk" →
  // „Grycký roj"), což je správně česky. Invariant je o PŘEKLADECH — ty musí
  // kmen nechat na pokoji, jinak by si hráči různých jazyků nerozuměli.
  const bezKmene = [];
  for (const [rod, kmen] of Object.entries(KMENY))
    for (const kod of Object.keys(j.SLOVNIK)) {
      if (kod === "cs") continue;
      const jm = j.SLOVNIK[kod]["rod." + rod];
      if (!jm || !jm.includes(kmen)) bezKmene.push(kod + "/" + rod + ": " + jm);
    }
  test(`kmen jména rodu drží v každém překladu${
    bezKmene.length ? " (" + bezKmene.slice(0, 3).join(", ") + ")" : ""}`, bezKmene.length === 0);
  test("každý rod má jméno ve všech třech jazycích",
    g.FACTION_DEFS.every(d => Object.keys(j.SLOVNIK).every(kod => !!j.SLOVNIK[kod]["rod." + d.key])));
  test("svět se dosazuje parametrem, ne natvrdo",
    j.SLOVNIK.cs["kron.start"].includes("{svet}")
    && !j.SLOVNIK.en["kron.start"].includes("Vellar"));
}

sada("5. Kronika: server posílá KLÍČ, větu skládá klient");
{
  g.setSeasonHours(1);
  g.newGame(0, 42, null);
  const zaznamy = g.G.log.filter(e => e.klic);
  test("start sezóny se hlásí klíčem", zaznamy.some(e => e.klic === "kron.start"));
  const e = zaznamy.find(x => x.klic === "kron.start");
  test("klíč nese parametry", !!e.param && !!e.param.svet);
  j.nastavJazyk("en", false);
  test("anglicky vyjde anglická věta", j.tx(e.klic, e.param).startsWith("The truce"));
  j.nastavJazyk("cs", false);
  test("česky česká", j.tx(e.klic, e.param).startsWith("Příměří"));
  test("a jméno světa zůstalo", j.tx(e.klic, e.param).includes("Vellar"));
  // staré záznamy s hotovou větou musí fungovat dál
  g.addLog(-1, "Hotová česká věta z doby před etapou 12b");
  const stary = g.G.log[g.G.log.length - 1];
  test("záznam bez klíče má pořád text", !stary.klic && stary.text.includes("Hotová"));
}

sada("6. ANGLICKÝ KLIENT dostane od ČESKÉHO SERVERU anglický bojový report");
{
  // TOHLE JE KRITÉRIUM CELÉ ETAPY. Server běží v češtině a report skládá
  // z klíčů; anglický klient si z nich složí anglickou větu, a to i uvnitř
  // parametrů (vnořené klíče) a v jménech jednotek.
  g.setSeasonHours(1);
  j.nastavJazyk("cs", false);          // SERVER je česky
  g.newGame(0, 4242, null);
  const A = o => Object.assign(g.emptyArmy(), o);
  const sim = g.simulateBattle({
    attacker: { faction: g.G.factions[0], army: A({ inf: 900, arch: 400, cav: 300 }), hero: null, mult: 1 },
    defender: { faction: g.G.factions[1], army: A({ inf: 700, arch: 500 }), hero: null, mult: 1.3 },
    seed: 4242, defMult: 1.3,
  });
  const evy = sim.roundLog.flatMap(x => x.ev);
  test("události reportu nesou KLÍČ, ne hotovou větu",
    evy.length > 0 && evy.every(e => typeof e === "object" && e.klic));
  const CES = /[ěščřžýáíéúůňťď]/;
  j.nastavJazyk("en", false);
  const anglicky = evy.map(e => j.tx(e.klic, e.param));
  test("anglicky v nich nezůstane česká hláska", !anglicky.some(v => CES.test(v)));
  test("a opravdu jsou anglicky", anglicky.some(v => /round|damage|cavalry|infantry|archers/i.test(v)));
  j.nastavJazyk("es", false);
  const spanelsky = evy.map(e => j.tx(e.klic, e.param));
  test("španělsky taky", spanelsky.some(v => /ronda|daño|caballer|infanter/i.test(v)));
  test("a liší se od angličtiny", spanelsky.join("|") !== anglicky.join("|"));

  // VNOŘENÝ KLÍČ: parametr smí být sám {klic,param} a přeloží se s větou
  j.nastavJazyk("en", false);
  const veta = j.tx("kron.dobyto", { hrdina: "X", rod: "Y",
    pole: { klic: "pole.sila", param: { krajina: { klic: "ter.forest" }, tier: 10 } },
    kol: 3, obrance: { klic: "bit.neutral" }, padlo: 5, ztraty: 2 });
  test("vnořený klíč se přeloží uvnitř věty", veta.includes("Deepwood") && !CES.test(veta));

  // JMÉNA JEDNOTEK jdou přes uDef, ne přes hotovou větu
  const u = g.unitsOf("aldar");
  test("jednotky rodu jsou anglicky", u.inf.name === "Guard Infantry");
  const zaklad = g.unitsOf(null);   // neutrál nemá rod
  test("i základní jednotky neutrála", zaklad.inf.name === "Infantry");
  j.nastavJazyk("cs", false);
  test("a po návratu do češtiny se vrátí česky", g.unitsOf("aldar").inf.name === "Gardová pěchota");
}

sada("7. Obsahové tabulky se přepínají a vracejí");
{
  const cesky = { bud: g.BUILDINGS.main.name, rys: g.HERO_TRAITS.mystic.name,
    kap: g.KAPITOLY[0].name, ter: g.TERRAIN.forest.name, vyl: g.UNIT_UPGRADES.aldar.inf,
    dov: g.HERO_DEFS.aldar[0].tree[0].name };
  j.nastavJazyk("en", false);
  test("budova se přeloží", g.BUILDINGS.main.name !== cesky.bud);
  test("rys velitele taky", g.HERO_TRAITS.mystic.name === "Mystic");
  test("kapitola příběhu taky", g.KAPITOLY[0].name !== cesky.kap);
  test("krajina taky", g.TERRAIN.forest.name === "Deepwood");
  test("vylepšovací budova taky", g.UNIT_UPGRADES.aldar.inf !== cesky.vyl);
  test("jméno dovednosti taky", g.HERO_DEFS.aldar[0].tree[0].name === "Hawk's Eye");
  test("popis dovednosti nemá českou hlásku",
    !/[ěščřžýáíéúůňťď]/.test(g.HERO_DEFS.aldar[0].tree[0].desc));
  j.nastavJazyk("cs", false);
  // ⚠ Předloha se drží stranou; bez ní by se po druhém přepnutí překládal
  // překlad a čeština by se nikdy nevrátila.
  test("a všechno se vrátí do češtiny",
    g.BUILDINGS.main.name === cesky.bud && g.HERO_TRAITS.mystic.name === cesky.rys
    && g.KAPITOLY[0].name === cesky.kap && g.TERRAIN.forest.name === cesky.ter
    && g.UNIT_UPGRADES.aldar.inf === cesky.vyl
    && g.HERO_DEFS.aldar[0].tree[0].name === cesky.dov);
  j.nastavJazyk("en", false); j.nastavJazyk("es", false); j.nastavJazyk("cs", false);
  test("ani po třech přepnutích za sebou", g.BUILDINGS.main.name === cesky.bud);
}

sada("8. Čísla se formátují podle jazyka");
{
  j.nastavJazyk("cs", false);
  test("česky je desetinná čárka", (1234.5).toLocaleString(j.cisloJazyk()).includes(","));
  j.nastavJazyk("en", false);
  test("anglicky tečka", (1234.5).toLocaleString(j.cisloJazyk()).includes("."));
  j.nastavJazyk("cs", false);
  test("doba jde taky přes slovník", g.fmtDobu(9000) === "3 hodin");
  j.nastavJazyk("en", false);
  test("a anglicky je anglicky", g.fmtDobu(9000) === "3 hours");
  j.nastavJazyk("cs", false);
}

sada("9. Odhad jazyka z prohlížeče");
{
  test("známý jazyk se vezme", typeof j.jazykZProhlizece() === "string");
  test("a je ze seznamu",
    j.JAZYKY_SEZNAM.some(x => x.kod === j.jazykZProhlizece()));
}

console.log(`\n${proslo} prošlo, ${selhalo} selhalo`);
if (selhalo) process.exit(1);
