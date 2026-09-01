# Válka popela — hra s přáteli (multiplayer)

Hra běží jako **server u jednoho z hráčů** (hostitele); ostatní se připojí
obyčejným prohlížečem — **nic neinstalují**, stačí jim adresa.

## 1. Hostitel: spuštění serveru

Potřebuješ [Node.js](https://nodejs.org) (LTS). Pak stačí poklepat na
**`start-server.bat`** (při prvním spuštění si sám doinstaluje závislosti),
nebo v terminálu:

```
npm install   (jen poprvé)
npm start
```

Server vypíše adresu — na tvém počítači hra běží na `http://localhost:8123`.

## 2. Připojení kamarádů: Tailscale (doporučeno, zdarma)

Kamarádi se potřebují dostat na tvůj počítač přes internet. Nejjednodušší a
bezpečná cesta je [Tailscale](https://tailscale.com) — soukromá VPN zdarma:

1. Ty i kamarádi si nainstalujete Tailscale a přihlásíte se.
2. Pozveš je do své sítě (aplikace Tailscale → **Invite external users**),
   nebo se všichni přihlásí stejným účtem.
3. Zjistíš svou Tailscale adresu (aplikace ji ukazuje, vypadá jako
   `100.x.y.z`).
4. Kamarádi otevřou v prohlížeči **`http://100.x.y.z:8123`** — a jsou ve hře.

Alternativy: hraní na stejné Wi‑Fi (stačí místní IP, `ipconfig` → IPv4),
port forwarding na routeru, nebo levný VPS.

## Účty hráčů (v0.6)

V lobby (rámeček „Hra s přáteli") si každý může založit **účet** (jméno +
heslo). Účet ukládá úrovně a výbavu hrdinů, sklad předmětů a 💠 popelná
jádra **napříč sezónami** — ukládá se na serveru hostitele do
`server/data/accounts.json`. Přihlášení se pamatuje (netřeba ho zadávat
znovu). Jádra na truhly padají z herních událostí a z promo kódů —
vestavěné kódy jsou `VITEJTE` (200), `POPEL50` (50), `VELLAR` (100)
a admin kód `PANVELLARU` (1 000 000 — nerozdávej ho, pokud nechceš
kamarádům vypnout ekonomiku truhel);
hostitel může v `accounts.json` nastavit vlastní tabulku `codes`.

## 3. Průběh hry

- Každý na úvodní obrazovce v rámečku **„Hra s přáteli"** zadá jméno
  a klikne **Připojit se**.
- V lobby si každý klikne na kartu frakce a vybere startovního hrdinu (zabrané
  frakce jsou zašedlé). Volba se ohlásí ostatním.
- Kdokoli pak dá **„Spustit hru pro všechny"** — frakce bez hráče dohraje AI.
  Funguje to pro 1–4 lidi.
- Server je autorita: tik běží na něm, klienti posílají jen příkazy, takže
  všichni vidí totéž a nejde podvádět úpravou vlastní hry.
- **Výpadek spojení nevadí** — hra běží dál a po obnovení připojení
  (stejný prohlížeč) tě server vrátí do tvé frakce.
- Po konci sezóny tlačítko „Nová sezóna" vrátí všechny do lobby.
- Hru lze kdykoli ukončit tlačítkem **„✕ Konec"** v horní liště (dvojím
  kliknutím — první vyzve k potvrzení): všichni hráči se vrátí do lobby
  na nový výběr frakcí.

## Sdílení hry

Celou složku `valka-popela` můžeš zazipovat a poslat — příjemce potřebuje
jen Node.js a `start-server.bat`. Singleplayer funguje i bez serveru
(otevřením přes libovolný statický server, např. `serve.ps1`).

## Známá omezení v0.3

- Jeden server = jedna hra (další paralelní hra = druhý server na jiném
  portu: `node server/server.js 8124`).
- Snapshot letí všem celý; mlhu války ořezává klient (mezi kamarády OK,
  pro veřejné hry se serverové ořezání doplní).
- Cíle sezóny a nabídky paktů od AI se týkají prvního připojeného hráče.
- Kronika je společná — hlásí bitvy všech frakcí (stejně jako singleplayer).
- Svět se zatím neukládá — restart serveru = nová hra (persistence je další
  krok roadmapy).

## Dlouhá sezóna (v0.24)

Výchozí sezóna je testovací (1 hodina). Pro opravdovou hru na týdny spusť
server s délkou v hodinách, např. čtrnáctidenní sezóna:

    node server/server.js 8123 336

Vše se přeškáluje samo (otevření Trůnu v půlce, Koruna popela za souvislé
držení Trůnu 12 % sezóny, bod činu ⚡ za hodinu). Číslo sezóny si server
pamatuje v server/data/stav.json; po konci sezóny se všichni po minutě a půl
vrátí do lobby a rovnou se hlásí do další.
