// Odesílání e-mailů přes Resend (etapa 5) — ověření registrace a reset hesla.
//
// PROČ RESEND A NE VLASTNÍ SMTP: adresy VPS mají u Gmailu a Seznamu špatnou
// reputaci a ověřovací maily by končily ve spamu nebo v koši. Resend má
// 3 000 zpráv měsíčně zdarma, což na naše objemy stačí s velkou rezervou.
//
// KLÍČ SE NIKDY NEDÁVÁ DO REPA. Čte se z prostředí (`RESEND_API_KEY`), které
// službě podstrčí systemd přes EnvironmentFile — viz CLAUDE.md, Ostrý provoz.
// Bez klíče se maily NEODESÍLAJÍ a modul to hlásí; hra běží dál.
// Klíč se PROČISTÍ od netisknutelných znaků. Do proměnné se snadno dostane
// smetí ze schránky (ověřeno naostro: vložení v Git Bashi přidalo na začátek
// U+007F) a takový znak v hlavičce Authorization shodí celé volání na
// neurčité „fetch failed / UND_ERR_INVALID_ARG".
const KLIC = (process.env.RESEND_API_KEY || "").replace(/[^!-~]/g, "");
const ODESILATEL = process.env.MAIL_FROM || "Válka popela <noreply@warofash.com>";
const ZAKLAD = process.env.HERNI_URL || "https://warofash.com";

// Vývoj bez klíče: maily se jen vypíšou do logu, ať jde celý tok vyzkoušet.
const jenLog = !KLIC;
if (jenLog) console.log("[mail] RESEND_API_KEY není nastavený — maily se jen vypíšou do logu");

function jePlatnyEmail(e) {
  // schválně volná kontrola: přísné regexy na e-maily odmítají platné adresy
  // častěji, než chytají neplatné. Skutečné ověření dělá až doručený odkaz.
  return typeof e === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e.trim()) && e.length <= 120;
}

async function posli(komu, predmet, html, text) {
  if (jenLog) {
    console.log(`[mail] (bez klíče) → ${komu}: ${predmet}\n${text}`);
    return { ok: true, log: true };
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": "Bearer " + KLIC, "Content-Type": "application/json" },
      body: JSON.stringify({ from: ODESILATEL, to: [komu], subject: predmet, html, text }),
    });
    if (!r.ok) {
      const telo = await r.text().catch(() => "");
      console.error(`[mail] Resend odmítl (${r.status}): ${telo.slice(0, 300)}`);
      return { ok: false, error: "Odeslání selhalo." };
    }
    return { ok: true };
  } catch (e) {
    console.error("[mail] odeslání selhalo:", e.message,
      e.cause && (e.cause.code || e.cause.message) || "");
    return { ok: false, error: "Odeslání selhalo." };
  }
}

// Jednoduchá šablona — bez obrázků a bez externích zdrojů, ať projde
// i v klientech, co blokují všechno kromě textu.
function sablona(nadpis, veta, odkaz, popisTlacitka) {
  return `<div style="font-family:system-ui,sans-serif;background:#10151c;color:#e9e3d4;padding:28px">
  <h1 style="font-size:22px;color:#d9ab4f;margin:0 0 14px">⚔ ${nadpis}</h1>
  <p style="color:#97a1ae;line-height:1.6;margin:0 0 20px">${veta}</p>
  <p><a href="${odkaz}" style="background:#d9ab4f;color:#1a1408;text-decoration:none;
     padding:11px 22px;border-radius:8px;font-weight:600;display:inline-block">${popisTlacitka}</a></p>
  <p style="color:#6b7280;font-size:12px;margin-top:22px">Kdyby tlačítko nefungovalo, otevři tenhle odkaz:<br>${odkaz}</p>
  <p style="color:#6b7280;font-size:12px">Tenhle e-mail ti přišel, protože někdo zadal tvou adresu na ${ZAKLAD}.
     Jestli jsi to nebyl ty, nemusíš dělat nic.</p>
</div>`;
}

// JEDEN MAIL VYŘÍDÍ OBOJÍ (v0.58): odkaz potvrdí adresu A vyzvedne uvítací
// jádra. Ověření tím dostane důvod, proč na něj kliknout — samotné „potvrď
// si adresu" nikoho nenadchne, „vyzvedni si 5 000 jader" ano.
function posliOvereni(komu, jmeno, kod, jadra) {
  const odkaz = `${ZAKLAD}/overit?kod=${kod}`;
  const kolik = (jadra | 0) ? (jadra | 0).toLocaleString("cs") : 0;
  const veta = kolik
    ? `Síň <b>${jmeno}</b> na tebe čeká a s ní <b>${kolik} popelných jader</b> na
       roztočení prvních beden. Klikni a je to tvoje.`
    : `Síň <b>${jmeno}</b> čeká na potvrzení. Klikni a je tvoje.`;
  return posli(komu, kolik ? `Vyzvedni si ${kolik} jader ve Válce popela`
      : "Potvrď svou síň ve Válce popela",
    sablona("Vítej ve Vellaru", veta, odkaz,
      kolik ? `Vyzvednout ${kolik} 💠 a potvrdit síň` : "Potvrdit síň"),
    (kolik ? `Vyzvedni si ${kolik} jader a potvrď síň ${jmeno}` : `Potvrď síň ${jmeno}`)
      + ` otevřením odkazu: ${odkaz}`);
}

function posliReset(komu, jmeno, kod) {
  const odkaz = `${ZAKLAD}/heslo?kod=${kod}`;
  return posli(komu, "Nové heslo do Války popela",
    sablona("Zapomenuté heslo", `Pro síň <b>${jmeno}</b> někdo požádal o nové heslo.
      Odkaz platí hodinu.`, odkaz, "Nastavit nové heslo"),
    `Nastav nové heslo otevřením odkazu (platí hodinu): ${odkaz}`);
}

// Samokontrola při startu: špatný klíč se jinak projeví až tím, že prvnímu
// hráči nepřijde potvrzovací mail — a to je pozdě a špatně se to hledá.
async function zkontrolujKlic() {
  if (jenLog) return;
  try {
    const r = await fetch("https://api.resend.com/domains", {
      headers: { "Authorization": "Bearer " + KLIC } });
    // POZOR: klíč s oprávněním „Sending access" NESMÍ vypsat domény a vrátí
    // 401 s name:"restricted_api_key". To je SPRÁVNÝ stav — takový klíč
    // doporučujeme — jen se z něj nedá vyčíst, jestli je doména ověřená.
    if (r.status === 401 || r.status === 403) {
      const telo = await r.text().catch(() => "");
      if (/restricted_api_key/.test(telo)) {
        console.log("[mail] klíč platí (omezený jen na odesílání — stav domény odsud nezjistím)");
        return;
      }
      console.error("[mail] ⚠ Resend klíč ODMÍTL (HTTP " + r.status + "): " + telo.slice(0, 200)
        + " — maily NEBUDOU chodit. Vlož platný klíč do /etc/warofash.env a restartuj službu.");
      return;
    }
    const j = await r.json().catch(() => ({}));
    const domeny = (j.data || []).map(d => d.name + " (" + d.status + ")").join(", ");
    const nase = (j.data || []).find(d => ODESILATEL.includes("@" + d.name));
    console.log("[mail] klíč platí · domény: " + (domeny || "žádná"));
    if (nase && nase.status !== "verified")
      console.error("[mail] ⚠ doména " + nase.name + " není ověřená (" + nase.status
        + ") — Resend odmítne odeslání z " + ODESILATEL);
    if (!nase)
      console.error("[mail] ⚠ doména odesílatele " + ODESILATEL + " není u Resendu vůbec vedená");
  } catch (e) {
    console.error("[mail] ⚠ na Resend se nedá dosáhnout:", e.message,
      e.cause && (e.cause.code || e.cause.message) || "");
  }
}

module.exports = { posliOvereni, posliReset, jePlatnyEmail, jenLog, ZAKLAD, zkontrolujKlic };
