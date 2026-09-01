# Testy Války popela

Čistě nodové testy nad `js/game.js` — nepotřebují běžící server ani prohlížeč.

```bash
node tests/vse.js
```

| Soubor | Co hlídá |
|---|---|
| `test-stromy.js` | Struktura 24 stromů (4 hlavní 15/15 + 8 větví 7/7), odemykání, XP křivka a body, ekvivalence statů na úrovni 50, **kotvy křivky dobývání**, migrace účtů (`treeV`), sanitizace, respec, AI, determinismus. 700 asercí. |
| `test-boj.js` | Mistrovské bonusy podle rysu, kolové aktivky (`roundDmg`/`roundArmy`) a jejich časování, obranné chargy, capy statů, determinismus. 57 asercí. |
| `test-neutralove.js` | Neutrální velitelé: mapování úrovní, determinismus napříč běhy, žádná výbava/hvězdy/mystik, posádka vs velení, projev v boji. 25 asercí. |
| `test-truhly.js` | Truhly v0.14: jediný tier, **vždy přesně `CHEST_ITEMS` věcí** (žádný drop navíc), dárek hrdiny se stejnou šancí jako výbava té rarity, afinita strany u kusů i dárků, propis dárků na účet. 23 asercí. |
| `sonda-delta.js` | **Sonda proti běžícímu serveru** (:8200): měří delta protokol snapshotů a hloubkově porovnává merge delt vs plnou mapu (slepá místa tileOtisk). Po testu smaž server/data. |
| `prehledka-ikon.js` | **Náhled**, ne test: vyrobí tests/ikonky-vybavy.html s ikonkami druhů výbavy — pouštěj po zásahu do itemArtURL (validitu hlídá test-truhly sada 9). |
| `krivka.js` | **Měření**, ne test: vypíše tabulku „kolik jednotek je potřeba na které pole" — pouštěj po každém zásahu do boje nebo statů. |
| `test-mp-migrace.js` | Vyžaduje běžící `node server/server.js 8200` a fixture v `server/data/accounts.json`. Ověří migraci účtu přes WebSocket. Po testu `server/data` smaž. |

## Kontrola v prohlížeči: lícuje 3D s 2D překryvem?

Nodové sady na tohle nestačí (WebGL v Nodu není). Celý 3D port ale stojí na
jediném předpokladu — že se **3D scéna promítá do týchž pixelů jako
`tileToPixel()`**. Když se rozejde, rozsypou se jmenovky, hranice území
i trefování myší. Po každém zásahu do kamery v `js/render3d.js` nebo do
`resizeCanvas`/`screenToWorld` v `js/render.js` to prožeň v konzoli hry:

```js
(() => {
  const T = R3.THREE, c = document.getElementById('map');
  const out = [];
  for (const z of [0.35, 1, 2.2, 5]) {
    camera.zoom = z; camera.x = 300; camera.y = -120; draw();
    let max = 0;
    for (const [q, r] of [[0,0],[16,0],[-8,4],[5,-11],[19,0],[0,-19],[-19,19]]) {
      const p = tileToPixel(q, r);
      const sx2 = (p.x - camera.x) * camera.zoom + c.width / 2;
      const sy2 = (p.y - camera.y) * camera.zoom + c.height / 2;
      const v = new T.Vector3(Math.sqrt(3) * (q + r / 2), 0, 1.5 * r).project(R3.cam);
      max = Math.max(max, Math.abs((v.x * .5 + .5) * c.width - sx2),
                          Math.abs((-v.y * .5 + .5) * c.height - sy2));
    }
    out.push(z + ' → ' + max.toFixed(4) + ' px');
  }
  return out.join('\n');
})()
```

**Musí vyjít 0 px u všech zoomů.** K tomu se vyplatí ověřit i trefování myší
(zpětný převod `screenToWorld → pixelToTile` musí u každého viditelného pole
vrátit totéž pole) a `R3.missing` (prázdné pole = všechny modely se načetly).

## Kontrola v prohlížeči: neprosvítá záře skrz mlhu?

Lávová pole a krystaly září tak silně, že jim mlha války sama o sobě nestačí —
`instanceColor` násobí jen rozptýlenou složku. Po každém zásahu do `mlhaDoZare`
nebo do shaderů three to prožeň v konzoli (kamera nemusí být nad Hordou, měří se
celé plátno):

```js
(() => {
  const cv = document.getElementById('map3d'), gl = cv.getContext('webgl2');
  const w = cv.width, h = cv.height, buf = new Uint8Array(w * h * 4);
  const lava = f => {
    R3.setFog(() => f);
    R3.render(camera.x, camera.y, camera.zoom);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    let n = 0;
    for (let i = 0; i < buf.length; i += 4)
      if (buf[i + 3] > 10 && buf[i] > 110 && buf[i] - buf[i + 2] > 60) n++;
    return n;
  };
  const plne = lava(1.0), mlha = lava(0.18);
  draw();
  return plne + ' -> ' + mlha + ' (' + (100 * mlha / plne).toFixed(1) + ' %)';
})()
```

**Musí spadnout pod ~3 %.** Naměřeno 2,6 % (v0.17; sopka má od rozhýbání širší kráter, takže je lávy vidět víc než dřív — 1,4 % před tou změnou). Počítej ORANŽOVÉ pixely, ne
přepálené (`> 200`) — na přepálených to vypadá opravené i při 43 % průsaku,
protože záře jde mnohonásobně přes jedničku a useknout ji na bílou stačí málo.
Kontrolní hodnota bez záplaty: 43 %.

## Pasti, na které jsem už narazil

- **`simulateBattle` MUTUJE `hp` předaného velitele.** Do každého opakovaného
  pokusu (binární hledání) musí jít čerstvá kopie hrdiny, jinak je obránce
  od druhého kola mrtvý a všechna čísla vyjdou stejná.
- **`defKilled` se zasytí** na velikosti obráncovy armády — pro měření dopadu
  efektů použij `tot.dmgA`, a nejlépe proti obří přesile, aby oba běhy měly
  stejný počet kol.
- Kontrola „žádná náhoda v boji" musí hledat `Math.random(` (s závorkou),
  jinak ji spustí i zmínka v komentáři.
- Synthetic hrdina v `simulateBattle` potřebuje `attacker.mult` (jinak NaN).
- **Truhly jedou na `Math.random`, ne na seedovaném rng** (otvírají se i mimo
  hru), takže se statistika testuje s tolerancí přes desítky tisíc otevření.
  Pozor na rozpočet: účtu musí v každé iteraci dotéct jádra (`TEST100K`),
  jinak `accountOpenChest` tiše vrátí `null`.
- Rarita výbavy nevyjde přesně podle `weights` — royal truhla má **8 % šanci
  na signature kus**, který raritu přepíše na legendární.
- **Armáda literálem o třech klíčích je od v0.52 nedostatečná.** Přibyl slot
  `big` (vlajkové jednotky T4), takže `{ inf: 200, arch: 0, cav: 0 }` sice
  projde aritmetikou (pomocníci mají `|| 0`), ale scéna se tím liší od
  skutečné hry. Stavěj armády přes `emptyArmy()` / `armyFrom()`.
- **Hrdina bez aspoň `OBRANA_MIN_CP` (100 CP) NEBRÁNÍ pole.** Scény, které
  testují obranu hrdinou, mu musí dát dost jednotek — s padesáti se do
  obranného stohu vůbec nedostane a `contributors` zůstane prázdné.
- **Pochod smí mít nejvýš `FORMACI_MAX` (3) druhů jednotek.** `startMarch`
  čtvrtý druh odmítne; totéž platí pro posily, kde se počítá SOUČET armády
  hrdiny, konvojů na cestě a nových posil.
