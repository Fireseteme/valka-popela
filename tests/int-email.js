// E-mail u účtu (v0.51): povinná registrace s ověřením a reset zapomenutého
// hesla. Běží BEZ API klíče — modul pošty pak maily jen vypisuje do logu,
// takže je celý tok vyzkoušitelný, aniž by se cokoli odeslalo.
//
//     node tests/int-email.js
//
// Vlastní server na portu 8289 nad dočasným VP_DATA. NENÍ ve vse.js.
const { spawn } = require("child_process");
const WebSocket = require("../node_modules/ws");
const { DatabaseSync } = require("node:sqlite");
const fs = require("fs"), os = require("os"), path = require("path");
const PORT = 8289, KOREN = path.join(__dirname, "..");
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), "vp-email-"));
let selhalo = 0, logServeru = "";
const test = (j, ok) => { console.log((ok ? "  ✅ " : "  ❌ ") + j); if (!ok) selhalo++; };
const pauza = ms => new Promise(r => setTimeout(r, ms));

function spustServer() {
  return new Promise((res, rej) => {
    // malý svět: test nemá co dělat na pevných 955×955
    const p = spawn(process.execPath, ["server/server.js", String(PORT), "1", "34"],
      { cwd: KOREN, env: { ...process.env, VP_DATA: DATA, HERNI_URL: `http://127.0.0.1:${PORT}` } });
    let log = "";
    p.stdout.on("data", d => { log += d; logServeru += d; if (log.includes("ukončení: Ctrl+C")) res(p); });
    p.stderr.on("data", d => { log += d; logServeru += d; });
    setTimeout(() => rej(new Error("server nenaběhl:\n" + log)), 25000);
  });
}
const zabij = p => new Promise(r => { p.on("exit", () => r()); p.kill(); });

function klient() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}/`);
  const fronta = [], cekaji = [];
  ws.on("message", raw => {
    const m = JSON.parse(raw);
    const i = cekaji.findIndex(c => c.typ === m.type);
    if (i >= 0) { const c = cekaji.splice(i, 1)[0]; clearTimeout(c.cas); c.res(m); } else fronta.push(m);
  });
  return {
    ws, otevreno: new Promise(r => ws.on("open", r)), posli: m => ws.send(JSON.stringify(m)),
    cekej(typ, ms = 10000) {
      const i = fronta.findIndex(m => m.type === typ);
      if (i >= 0) return Promise.resolve(fronta.splice(i, 1)[0]);
      return new Promise((res, rej) => {
        const cas = setTimeout(() => rej(new Error("nedorazilo: " + typ)), ms);
        cekaji.push({ typ, res, cas });
      });
    },
  };
}

// účty se na disk vyklápějí po 5 s — test si počká a přečte je přímo
async function ucet(klic, podminka) {
  for (let i = 0; i < 20; i++) {
    try {
      const db = new DatabaseSync(path.join(DATA, "ucty.db"), { readOnly: true });
      const r = db.prepare("select data from ucty where klic = ?").get(klic);
      db.close();
      if (r) { const a = JSON.parse(r.data); if (!podminka || podminka(a)) return a; }
    } catch (e) { /* databáze se právě zapisuje */ }
    await pauza(700);
  }
  return null;
}
const ziskej = (cesta, moznosti) => fetch(`http://127.0.0.1:${PORT}${cesta}`, moznosti);

(async () => {
  const server = await spustServer();
  test("bez klíče modul pošty jen loguje", /RESEND_API_KEY není nastavený/.test(logServeru));

  console.log("=== 1. registrace vyžaduje e-mail");
  const a = klient(); await a.otevreno;
  a.posli({ type: "hello", name: "Vit" });
  await a.cekej("welcome");

  a.posli({ type: "accRegister", name: "vit", pass: "heslo123" });
  const bezMailu = await a.cekej("accError");
  test("registrace bez e-mailu neprojde", /platný e-mail/i.test(bezMailu.text));

  a.posli({ type: "accRegister", name: "vit", pass: "heslo123", email: "neni-mail" });
  test("nesmysl místo adresy neprojde", /platný e-mail/i.test((await a.cekej("accError")).text));

  a.posli({ type: "accRegister", name: "vit", pass: "heslo123", email: "vit@example.com" });
  const ceka = await a.cekej("accCekaOvereni");
  test("registrace čeká na potvrzení", ceka.email === "vit@example.com");
  test("odkaz se poslal (v logu)", /potvrď síň vit otevřením odkazu/i.test(logServeru));

  console.log("=== 2. dokud není potvrzeno, dovnitř to nepustí");
  a.posli({ type: "accLogin", name: "vit", pass: "heslo123" });
  const zamek = await a.cekej("accError");
  test("přihlášení hlásí čekání na potvrzení", zamek.neovereno === true);

  const u = await ucet("vit");
  test("účet je v databázi a čeká", !!u && u.email === "vit@example.com" && u.emailOvereno === false);
  // v0.58: uvítací jádra se nedávají do ruky, čekají na odkaz z mailu
  test("nový účet nemá jádra v ruce", (u.cores | 0) === 0);
  test("uvítací jádra čekají", u.jadraCekaji === 5000);
  test("mail zve k VYZVEDNUTÍ jader", /5 ?000/.test(logServeru) && /Vyzvedni/i.test(logServeru));
  a.posli({ type: "accToken", authToken: u.authToken });
  test("ani trvalé přihlášení tokenem neprojde", !!(await a.cekej("accError")));

  console.log("=== 3. potvrzení odkazem z e-mailu");
  test("nesmyslný kód se odmítne", (await ziskej("/overit?kod=abc")).status === 400);
  const r1 = await ziskej("/overit?kod=" + u.overeniKod);
  const html1 = await r1.text();
  test("odkaz potvrdí síň", r1.status === 200 && /je tvoje/.test(html1));
  test("stránka hlásí vyzvednutá jádra",
    html1.includes("💠") && html1.includes("jader") && html1.includes("000"));
  test("použitý odkaz už podruhé neplatí", (await ziskej("/overit?kod=" + u.overeniKod)).status === 400);

  const uPo = await ucet("vit", x => !x.jadraCekaji);
  test("jádra jsou na účtu", (uPo.cores | 0) === 5000);
  test("a už nečekají", uPo.jadraCekaji === undefined);

  a.posli({ type: "accLogin", name: "vit", pass: "heslo123" });
  const profil = await a.cekej("account");
  test("po potvrzení se přihlášení povede", profil.name === "vit");
  test("profil ukazuje vyzvednutá jádra", profil.cores === 5000 && !(profil.jadraCekaji | 0));

  console.log("=== 4. zapomenuté heslo");
  const delkaLogu = logServeru.length;
  a.posli({ type: "zapomenuteHeslo", kdo: "vit@example.com" });
  await a.cekej("accInfo");
  await pauza(300);
  test("odkaz na nové heslo se poslal", /Nastav nové heslo/.test(logServeru.slice(delkaLogu)));

  a.posli({ type: "zapomenuteHeslo", kdo: "nikdo@example.com" });
  const mlceni = await a.cekej("accInfo");
  test("na neexistující účet odpoví stejně (nejde zjistit, kdo je registrovaný)",
    /Když ta síň existuje/.test(mlceni.text));

  const u2 = await ucet("vit", a => !!a.resetKod);
  test("kód na reset má omezenou platnost", !!u2.resetKod && u2.resetPlati > Date.now());
  const formular = await (await ziskej("/heslo?kod=" + u2.resetKod)).text();
  test("odkaz ukáže formulář", /Nové heslo pro vit/.test(formular));

  const kratke = await ziskej("/heslo?kod=" + u2.resetKod, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "heslo=ab" });
  test("krátké heslo se odmítne", kratke.status === 400);

  const zmena = await ziskej("/heslo?kod=" + u2.resetKod, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "heslo=noveheslo9" });
  test("nové heslo se nastaví", zmena.status === 200 && /Hotovo/.test(await zmena.text()));
  test("odkaz je jednorázový", (await ziskej("/heslo?kod=" + u2.resetKod)).status === 400);

  const b = klient(); await b.otevreno;
  b.posli({ type: "hello", name: "Vit" });
  await b.cekej("welcome");
  b.posli({ type: "accLogin", name: "vit", pass: "noveheslo9" });
  test("nové heslo funguje", (await b.cekej("account")).name === "vit");
  b.posli({ type: "accLogin", name: "vit", pass: "heslo123" });
  test("staré heslo už ne", !!(await b.cekej("accError")));

  console.log("=== 5. jedna adresa = jedna síň");
  b.posli({ type: "accRegister", name: "podvodnik", pass: "heslo123", email: "vit@example.com" });
  test("na obsazený e-mail se druhá síň nezaloží",
    /už jedna síň/.test((await b.cekej("accError")).text));

  console.log("=== 6. účet BEZ e-mailu (založený před v0.51) si ho může přidat");
  // takové účty musí dál fungovat, jinak by si po nasazení nikdo z nich nezahrál
  const { DatabaseSync: DB } = require("node:sqlite");
  {
    const db = new DB(path.join(DATA, "ucty.db"));
    const stary = { ...JSON.parse(db.prepare("select data from ucty where klic=?").get("vit").data),
      name: "Stary", email: "", emailOvereno: true, authToken: "starytoken123" };
    delete stary.overeniKod; delete stary.resetKod; delete stary.emailCeka;
    db.prepare("insert into ucty (klic, jmeno, data, zmeneno) values (?,?,?,?)")
      .run("stary", "Stary", JSON.stringify(stary), Date.now());
    db.close();
  }
  await zabij(server);
  const server2 = await spustServer();
  const c = klient(); await c.otevreno;
  c.posli({ type: "hello", name: "Stary" });
  await c.cekej("welcome");
  c.posli({ type: "accToken", authToken: "starytoken123" });
  const profilStary = await c.cekej("account");
  test("starý účet bez e-mailu se přihlásí dál", profilStary.name === "Stary");
  test("profil hlásí, že e-mail chybí", profilStary.email === "");

  c.posli({ type: "nastavEmail", email: "stary@example.com" });
  const poPridani = await c.cekej("account");
  test("nová adresa čeká na potvrzení", poPridani.emailCeka === "stary@example.com");
  test("dokud nepotvrdí, e-mail účtu se nemění", poPridani.email === "");

  const us = await ucet("stary", x => !!x.overeniKod);
  c.posli({ type: "accToken", authToken: "starytoken123" });
  test("nepotvrzená adresa NEZAMKNE přístup", !!(await c.cekej("account")));

  await ziskej("/overit?kod=" + us.overeniKod);
  c.posli({ type: "accToken", authToken: "starytoken123" });
  const hotovo = await c.cekej("account");
  test("po potvrzení je adresa platná",
    hotovo.email === "stary@example.com" && !hotovo.emailCeka && hotovo.emailOvereno);
  // ⚠ starý účet jádra dostal už při vzniku — potvrzení adresy mu NESMÍ
  // přidat další dávku, jinak je z ověřovacího odkazu tiskárna jader
  const usPo = await ucet("stary");
  test("starému účtu se jádra nezdvojila", (usPo.cores | 0) === (us.cores | 0));
  c.ws.close();

  a.ws.close(); b.ws.close();
  await zabij(server2);
  fs.rmSync(DATA, { recursive: true, force: true });
  console.log(selhalo ? `\n❌ ${selhalo} selhalo` : "\n✅ registrace s ověřením i reset hesla fungují");
  process.exit(selhalo ? 1 : 0);
})().catch(e => {
  console.error("CHYBA:", e.message);
  console.error("--- posledních 14 řádků logu serveru ---");
  console.error(logServeru.split("\n").slice(-14).join("\n"));
  process.exit(1);
});
