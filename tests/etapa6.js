// PŘEMĚŘOVÁNÍ V ETAPĚ 6 — dočasný přepínač, který se MUSÍ vypnout.
//
// Etapa 6 mění měřítko boje (přední a zadní linie, velké jednotky, velení
// 200+100/úroveň → 5 200 CP). Kotvy naměřené proti starému modelu tím
// NUTNĚ přestávají platit — není to regrese, je to smysl té práce.
//
// Dokud je `PREMERUJE_SE` zapnuté, hlásí se dotčené asserce jako MĚŘENÍ
// (⚠) místo selhání, takže sada dál chytá skutečné nové chyby a nezapadnou
// v šumu očekávaných posunů. Na konci etapy se všechny kotvy přeměří,
// zapíšou a přepínač se vypne — `vse.js` na zapnutý přepínač hlasitě
// upozorňuje, aby se na to nedalo zapomenout.
// VYPNUTO 30. 8. 2026 — všechny kotvy etapy 6 přeměřené a zapsané:
//   · křivka dobývání (test-boj sada 8 i test-stromy sada 5)
//   · navazující úder (měří se nově na jednom kole, ne přes celou bitvu)
//   · pavučina counterů (test-rastr — nové kruhy po zavedení linií)
// Přepínač zůstává v repu jako nástroj pro příští etapu, která bude
// kotvy zase posouvat; okPremeri se pak jen znovu zapne.
const PREMERUJE_SE = false;

// Použití místo `ok(...)` u asercí, které etapa 6 legitimně posouvá.
// `hlaska` je stejná jako u ok(); `mereni` je volitelný popis hodnoty,
// který se vypíše i při úspěchu, aby byl vidět SMĚR pohybu.
function okPremeri(stav, hlaska, mereni) {
  if (stav) return { ok: true, tichy: true };
  if (PREMERUJE_SE) {
    console.log("  ⚠ přeměřuje se (etapa 6): " + hlaska + (mereni ? " · " + mereni : ""));
    return { ok: true, tichy: false };
  }
  return { ok: false };
}

module.exports = { PREMERUJE_SE, okPremeri };
