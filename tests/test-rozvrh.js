// Rozvrh sezón (etapa 5b): pevný termín startu, přihlášky vázané na účet,
// stropy na frakci a přechod do další sezóny. Test si dělá VLASTNÍ dočasný
// adresář přes VP_DATA — nesahá na server/data.
const fs = require("fs");
const os = require("os");
const path = require("path");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vp-rozvrh-"));
process.env.VP_DATA = tmp;
const r = require("../server/rozvrh.js");

let proslo = 0, selhalo = 0;
const test = (jmeno, ok) => {
  if (ok) proslo++;
  else { selhalo++; console.log("  ❌ " + jmeno); }
};
const sada = jmeno => console.log("\n=== " + jmeno + " ===");
const HOD = 3600 * 1000;
const T0 = 1_800_000_000_000;   // pevný čas, ať test nezávisí na hodinách

sada("1. První rozvrh na čerstvém serveru");
{
  const s = r.nacti({ delkaHodin: 336, mistNaFrakci: 31, ted: T0 });
  test("začíná se zápisy", s.faze === "zapisy");
  test("start je za PRVNI_ZA_H hodin", s.startAt === T0 + r.PRVNI_ZA_H * HOD);
  test("délka a strop se vzaly z argumentů", s.delkaHodin === 336 && s.mistNaFrakci === 31);
  test("sezóna číslo 1", s.cislo === 1);
  test("rozvrh se zapsal na disk", fs.existsSync(path.join(tmp, "rozvrh.json")));
  test("do startu zbývá zhruba PRVNI_ZA_H hodin",
    Math.round(r.doStartu(T0) / HOD) === r.PRVNI_ZA_H);
  test("ještě není čas začít", r.jeCas(T0) === false);
  test("po termínu už je čas začít", r.jeCas(T0 + 25 * HOD) === true);
}

sada("2. Přihlášky se vážou na účet");
{
  test("bez účtu to nejde", !!r.prihlas(null, 0, "Anonym").error);
  test("přihláška projde", r.prihlas("vit", 0, "Vít").ok === true);
  test("je vidět v obsazenosti", r.obsazenost()[0] === 1 && r.prihlasenych() === 1);
  test("přihlášku lze najít podle účtu", r.prihlaskaOf("vit").faction === 0);

  r.prihlas("kamos", 3, "Kamos");
  test("druhý hráč do jiné frakce", r.obsazenost()[3] === 1 && r.prihlasenych() === 2);

  r.prihlas("vit", 3, "Vít");     // přehlášení jinam
  test("přehlášení nepřidá druhou přihlášku", r.prihlasenych() === 2);
  test("stará frakce se uvolnila", !r.obsazenost()[0] && r.obsazenost()[3] === 2);

  test("odhlášení projde", r.odhlas("vit").ok === true);
  test("odhlášený zmizí z obsazenosti", r.obsazenost()[3] === 1 && r.prihlasenych() === 1);
  test("odhlásit se dvakrát nejde", !!r.odhlas("vit").error);
  test("neplatná frakce se odmítne", !!r.prihlas("vit", -1, "Vít").error);
}

sada("3. Strop na frakci");
{
  r.nacti({ delkaHodin: 336, mistNaFrakci: 3, ted: T0 });
  r.ted().prihlasky = {};
  for (let i = 0; i < 3; i++) r.prihlas("h" + i, 1, "Hráč " + i);
  test("tři se vešli", r.obsazenost()[1] === 3);
  const ctvrty = r.prihlas("h3", 1, "Čtvrtý");
  test("čtvrtý dostane 'frakce je plná'", !!ctvrty.error && /pln/i.test(ctvrty.error));
  test("do jiné frakce se dostane", r.prihlas("h3", 2, "Čtvrtý").ok === true);
  // POZOR: kdo už ve frakci je, nesmí narazit na strop při potvrzení téže frakce
  test("stávající člen se smí přihlásit znovu do TÉŽE plné frakce",
    r.prihlas("h0", 1, "Hráč 0").ok === true && r.obsazenost()[1] === 3);
}

sada("4. Start sezóny a přechod do další");
{
  r.zacni();
  test("fáze je 'bezi'", r.ted().faze === "bezi");
  test("přihlášky ZŮSTÁVAJÍ i po startu (kdo dorazí pozdě, pořád patří dovnitř)",
    r.prihlasenych() === 4);
  test("během sezóny se přihlásit nedá", !!r.prihlas("pozdni", 0, "Pozdní").error);
  test("během sezóny se odhlásit nedá", !!r.odhlas("h0").error);
  test("jeCas je za běhu false", r.jeCas(T0 + 999 * HOD) === false);

  const cislo = r.ted().cislo;
  r.dalsi(T0 + 100 * HOD);
  test("další sezóna má vyšší číslo", r.ted().cislo === cislo + 1);
  test("zase se zapisuje", r.ted().faze === "zapisy");
  test("start je za PRODLEVA_DALSI_H hodin",
    r.ted().startAt === T0 + 100 * HOD + r.PRODLEVA_DALSI_H * HOD);
  test("přihlášky z minulé sezóny se vysypaly", r.prihlasenych() === 0);
}

sada("5. Rozvrh přežije restart serveru");
{
  r.prihlas("vit", 5, "Vít");
  const pred = { cislo: r.ted().cislo, startAt: r.ted().startAt, prihlasek: r.prihlasenych() };
  delete require.cache[require.resolve("../server/rozvrh.js")];
  const r2 = require("../server/rozvrh.js");
  const s = r2.nacti({ delkaHodin: 336, mistNaFrakci: 31, ted: T0 });
  test("číslo sezóny přežilo", s.cislo === pred.cislo);
  test("termín startu přežil", s.startAt === pred.startAt);
  test("přihlášky přežily", r2.prihlasenych() === pred.prihlasek && r2.prihlaskaOf("vit").faction === 5);
}

sada("6. Poškozený rozvrh a převod ze starého stav.json");
{
  fs.writeFileSync(path.join(tmp, "rozvrh.json"), "{tohle není JSON");
  delete require.cache[require.resolve("../server/rozvrh.js")];
  const r3 = require("../server/rozvrh.js");
  const s = r3.nacti({ delkaHodin: 336, mistNaFrakci: 31, ted: T0 });
  test("poškozený rozvrh nezabije start, naplánuje se znovu", s.faze === "zapisy" && s.cislo >= 1);

  fs.unlinkSync(path.join(tmp, "rozvrh.json"));
  fs.writeFileSync(path.join(tmp, "stav.json"), JSON.stringify({ sezona: 9 }));
  delete require.cache[require.resolve("../server/rozvrh.js")];
  const r4 = require("../server/rozvrh.js");
  test("číslo sezóny se převzalo ze starého stav.json",
    r4.nacti({ delkaHodin: 336, mistNaFrakci: 31, ted: T0 }).cislo === 9);
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* uklidí OS */ }

console.log(`\n${proslo} prošlo, ${selhalo} selhalo`);
if (selhalo > 0) process.exit(1);
