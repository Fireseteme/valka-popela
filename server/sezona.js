// Trvalost ROZEHRANÉ SEZÓNY (etapa 5).
//
// Do teď žil svět jen v paměti procesu: restart serveru — a to je i každé
// nasazení opravy — zahodil rozehranou mapu, armády i postup a všechny vrátil
// do lobby. Pro partu kamarádů to bylo přijatelné, pro veřejný server ne.
//
// Sezóna se měří v TICÍCH, ne hodinami na zdi, takže uložením G.tick se
// zachová i její postup: výpadek sezónu jen POZASTAVÍ, nezkrátí.
//
// Stav hry je čistý strom dat — žádné funkce, cykly ani sdílené odkazy mezi
// objekty (ověřeno sondou a testem sady 6), takže stačí JSON. Jediné, co
// neprojde samo, je jedna Map (G.tiles) a dva Sety (G.visible, G.explored).
const game = require("../js/game.js");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

// VP_DATA umí přesměrovat úložiště jinam — testy tak nesahají na ostrá data
// a provoz může mít data mimo adresář aplikace
const DATA_DIR = process.env.VP_DATA || path.join(__dirname, "data");
const SOUBOR = path.join(DATA_DIR, "sezona.json.gz");
const DOCASNY = SOUBOR + ".tmp";
const VERZE = 1;

// úroveň 3 je kompromis změřený na ostrých datech: 57 KB za 1,4 ms
// (úroveň 6 ušetří 11 KB, ale trvá dvakrát tak dlouho — na 1 CPU to nestojí za to)
const GZIP = { level: 3 };

function nahradnik(k, v) {
  if (v instanceof Map) return { __mapa: [...v.entries()] };
  if (v instanceof Set) return { __set: [...v] };
  if (typeof v === "function") return undefined;   // G.onEvent je hook serveru
  return v;
}
function ozivovac(k, v) {
  if (v && typeof v === "object") {
    if (Array.isArray(v.__mapa)) return new Map(v.__mapa);
    if (Array.isArray(v.__set)) return new Set(v.__set);
  }
  return v;
}

// MAPA SE UKLÁDÁ PO DÁVKÁCH (etapa 11b).
//
// Do teď vznikl snímek jako JEDEN `JSON.stringify` celého stavu. Na mapě
// 1459×1459 to je 239 MB jednoho řetězce (112 B na pole) a na 4 289 041 polích
// by to bylo ~480 MB — jenže **strop délky řetězce ve V8 je 512 MB**, takže by
// `JSON.stringify` prostě spadl a sezóna by se přestala ukládat. Navíc se ten
// řetězec musí celý naráz vejít do paměti vedle samotného světa.
//
// Snímek je proto ŘÁDKOVANÝ: první řádek je hlavička (celý stav, jen místo
// mapy značka), další řádky jsou dávky dlaždic. Každý řádek se gzipuje zvlášť
// a členy se slepí za sebe — `gunzip` (i ten z příkazové řádky) spojené členy
// přečte jako jeden proud, takže soubor zůstal obyčejný .json.gz.
// Špička paměti při zápisu je tím jedna dávka, ne celý svět.
//
// Zápis je ATOMICKÝ: nejdřív do .tmp, pak přejmenování přes cíl. Pád uprostřed
// zápisu tak nechá starý snímek celý místo useknutého nového.
const DAVKA_POLI = 20000;          // dlaždic na jeden řádek (~2 MB JSONu)
const KONEC_RADKU = String.fromCharCode(10);   // oddělovač řádků snímku
const gz = txt => zlib.gzipSync(Buffer.from(txt), GZIP);
function uloz(stav) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const tiles = stav.G.tiles;
    // hlavička nese celý stav KROMĚ mapy; ta jde zvlášť po dávkách
    const hlavicka = { ...stav, verze: VERZE,
      G: { ...stav.G, tiles: { __mapaPoDavkach: tiles.size } } };
    const kusy = [gz(JSON.stringify(hlavicka, nahradnik) + KONEC_RADKU)];
    let davka = [];
    for (const dvojice of tiles) {
      davka.push(dvojice);
      if (davka.length >= DAVKA_POLI) { kusy.push(gz(JSON.stringify(davka) + KONEC_RADKU)); davka = []; }
    }
    if (davka.length) kusy.push(gz(JSON.stringify(davka) + KONEC_RADKU));
    const data = Buffer.concat(kusy);
    fs.writeFileSync(DOCASNY, data);
    fs.renameSync(DOCASNY, SOUBOR);
    return data.length;
  } catch (e) {
    console.error("[sezóna] zápis selhal:", e.message);
    return 0;
  }
}

// PLNÝ SNÍMEK SE ROZEPISUJE PŘES VÍC TIKŮ (etapa 11b).
//
// I s dávkováním trvá zápis celé mapy na 4,3 M polí ~2 s na vývojovém stroji
// a odhadem 15 s na ostrém VPS. To celé běží na tikovém vlákně, takže by se
// hra dvakrát za hodinu na patnáct vteřin zastavila.
//
// Snímek se proto začne (`zacniPlny`) a pak se každý tik zapíše jen pár dávek
// (`krokPlnyho`). Hotový soubor se přejmenuje na místo starého až nakonec.
//
// ⚠ Mapa se tím do souboru obtiskne ROZMAZANĚ — každá dávka je z jiného tiku.
// Srovná to přírůstek: server si po celou dobu rozepisování pamatuje, kterých
// polí se něco dotklo, a hned po přejmenování je připojí jedním řádkem. Do té
// doby zůstává platný STARÝ soubor, takže pád uprostřed nic nepoškodí.
let rozepsany = null;
function rozepsanyPlny() { return !!rozepsany; }
function zacniPlny(stav) {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (rozepsany) { try { fs.closeSync(rozepsany.fd); } catch (e) {} rozepsany = null; }
    const hlavicka = { ...stav, verze: VERZE,
      G: { ...stav.G, tiles: { __mapaPoDavkach: stav.G.tiles.size } } };
    const fd = fs.openSync(DOCASNY, "w");
    fs.writeSync(fd, gz(JSON.stringify(hlavicka, nahradnik) + KONEC_RADKU));
    rozepsany = { fd, iter: stav.G.tiles[Symbol.iterator](), bajtu: 0 };
    return true;
  } catch (e) {
    console.error("[sezóna] začátek plného snímku selhal:", e.message);
    rozepsany = null;
    return false;
  }
}
// Vrací true, když je snímek hotový (soubor už je na svém místě).
function krokPlnyho(davek) {
  if (!rozepsany) return true;
  try {
    for (let d = 0; d < (davek || 1); d++) {
      const davka = [];
      let konec = false;
      for (let i = 0; i < DAVKA_POLI; i++) {
        const kr = rozepsany.iter.next();
        if (kr.done) { konec = true; break; }
        davka.push(kr.value);
      }
      if (davka.length) {
        const kus = gz(JSON.stringify(davka) + KONEC_RADKU);
        fs.writeSync(rozepsany.fd, kus);
        rozepsany.bajtu += kus.length;
      }
      if (konec) {
        fs.closeSync(rozepsany.fd);
        fs.renameSync(DOCASNY, SOUBOR);
        rozepsany = null;
        return true;
      }
    }
    return false;
  } catch (e) {
    console.error("[sezóna] plný snímek selhal:", e.message);
    try { fs.closeSync(rozepsany.fd); } catch (e2) {}
    rozepsany = null;
    return true;
  }
}

// PŘÍRŮSTKOVÝ ZÁPIS (etapa 11b).
//
// Plný snímek přepisuje celou mapu — na 4,3 M polí je to 1,9 s, a to každých
// deset tiků. Měření přitom říká, že se za tik změní medián NULA polí: skoro
// celá ta práce zapisovala pořád stejná data.
//
// Mezi plnými snímky se proto k souboru jen PŘIPOJÍ řádek se změnami: nová
// hlavička (rody, pochody, pošta — to se mění pořád) a hrstka dlaždic, kterých
// se od minule něco dotklo. Náklad zápisu tím přestal záviset na velikosti
// mapy a začal záviset na tom, co se doopravdy stalo.
//
// Připojení je bezpečné: základ souboru zůstává nedotčený, takže pád uprostřed
// zápisu poškodí nejvýš POSLEDNÍ řádek — a ten čtení zahodí (viz nacti).
function ulozZmeny(stav, pole) {
  try {
    if (!fs.existsSync(SOUBOR)) return uloz(stav);
    const radek = { __zmeny: 1, verze: VERZE, stav: { ...stav, verze: VERZE,
      G: { ...stav.G, tiles: { __mapaPoDavkach: stav.G.tiles.size } } }, pole };
    const data = gz(JSON.stringify(radek, nahradnik) + KONEC_RADKU);
    fs.appendFileSync(SOUBOR, data);
    return data.length;
  } catch (e) {
    console.error("[sezóna] přírůstkový zápis selhal:", e.message);
    return 0;
  }
}

// Vrací uložený stav, nebo null (soubor není / je poškozený / je z jiné verze).
// Poškozený snímek NESMÍ shodit start serveru — hra se v takovém případě
// rozjede načisto z lobby, což je vždycky lepší než server, který nenaběhne.
function nacti() {
  if (!fs.existsSync(SOUBOR)) return null;
  try {
    // ⚠ Čte se z BUFFERU po řádcích, ne přes jeden `.toString()` — u velké
    // mapy by převod na řetězec narazil na týž strop 512 MB jako zápis.
    // Starší snímek (jeden JSON bez řádkování) se pozná podle chybějícího
    // konce řádku a načte se postaru, ať nasazení nezahodí běžící sezónu.
    // Z_SYNC_FLUSH: useknutý poslední člen (pád uprostřed připojení) nesmí
    // shodit čtení celého souboru — vrátí se, co se přečíst dalo.
    const syrove = zlib.gunzipSync(fs.readFileSync(SOUBOR),
      { finishFlush: zlib.constants.Z_SYNC_FLUSH });
    const konec1 = syrove.indexOf(10);
    let stav = JSON.parse(syrove.toString("utf8", 0, konec1 < 0 ? syrove.length : konec1), ozivovac);
    if (konec1 >= 0) {
      const mapa = new Map();
      let useklych = 0, prirustku = 0;
      for (let od = konec1 + 1; od < syrove.length;) {
        let do_ = syrove.indexOf(10, od);
        if (do_ < 0) do_ = syrove.length;
        if (do_ > od) {
          let radek = null;
          try { radek = JSON.parse(syrove.toString("utf8", od, do_), ozivovac); }
          catch (e) { useklych++; break; }   // rozepsaný konec souboru — zahodit
          if (Array.isArray(radek)) {                    // dávka dlaždic
            for (const [k, t] of radek) mapa.set(k, t);
          } else if (radek && radek.__zmeny) {           // přírůstek
            stav = radek.stav;
            for (const [k, t] of radek.pole) mapa.set(k, t);
            prirustku++;
          }
        }
        od = do_ + 1;
      }
      stav.G.tiles = mapa;
      if (prirustku || useklych)
        console.log(`[sezóna] snímek + ${prirustku} přírůstků`
          + (useklych ? " (poslední řádek byl useknutý — zahozen)" : ""));
    }
    if (stav.verze !== VERZE) {
      console.log(`[sezóna] snímek je verze ${stav.verze}, server umí ${VERZE} — začínám načisto`);
      return null;
    }
    if (!stav.G || !(stav.G.tiles instanceof Map) || stav.G.tiles.size === 0) {
      console.error("[sezóna] snímek nemá mapu — začínám načisto");
      return null;
    }
    return stav;
  } catch (e) {
    console.error("[sezóna] snímek je poškozený (" + e.message + ") — začínám načisto");
    return null;
  }
}

function smaz() {
  for (const f of [SOUBOR, DOCASNY]) { try { fs.unlinkSync(f); } catch (e) {} }
}

function existuje() { return fs.existsSync(SOUBOR); }

// Stav se vrací DO STÁVAJÍCÍHO objektu G, ne za něj. game.js si drží `G` jako
// vlastní modulovou konstantu, kterou všechny funkce zavírají — kdyby server
// odkaz přepsal, hra by dál mutovala starý osiřelý objekt.
function obnovDoG(G, ulozeneG) {
  const hook = G.onEvent;              // hook serveru snímek neobsahuje
  for (const k of Object.keys(G)) if (!(k in ulozeneG)) delete G[k];
  for (const k of Object.keys(ulozeneG)) G[k] = ulozeneG[k];
  G.onEvent = hook;
  // Sezóna uložená před v0.52 nezná čtvrtý slot formace — doplní se, jinak
  // by z chybějícího slotu tekla aritmetika armád jako NaN.
  if (game.normalizujArmady) game.normalizujArmady(G);
  // Sezóna uložená před etapou 8 klany nezná a řádek výš klíč SMAZAL —
  // doplní se prázdné, ať se rozehraná sezóna po nasazení nerozbije.
  if (!G.klany) { G.klany = []; G.nextKlanId = 0; }
  return G;
}

module.exports = { uloz, ulozZmeny, nacti, smaz, existuje, obnovDoG, SOUBOR, VERZE,
  zacniPlny, krokPlnyho, rozepsanyPlny };
