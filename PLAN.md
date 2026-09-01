# PLÁN — sloučené zadání příští éry (28. 8. 2026, večer)

Sloučení dvou zdrojů: **zadání druhé session** (tři ověřené mechaniky z předlohy,
rozhodnuté uživatelem) + **brainstorm této session** (UI, hrdinové, ekonomika, MMO
pivot mapy, web). ŽÁDNÁ ČÁST SE NEIMPLEMENTUJE, dokud uživatel neřekne „shrň
a implementuj" — tento soubor je zásobník rozhodnutí a doporučení.

Prameny: `E:\Claude\reference-rtw\REFERENCE.md`, kodex
https://claude.ai/code/artifact/31d17bef-a8c8-4065-a7b6-409e5790f4e6 (kap. V, IX, X),
paměť `valka-popela-stav.md`. **Železné pravidlo archivu: přebíráme ČÍSLA, POMĚRY
A VZORY — nikdy jména, lore a grafiku (vlastní IP Vellar).** Každá nová konstanta =
pojmenovaný knob v game.js, škálovaný vůči délce sezóny (setSeasonHours) a velikosti
mapy, ne absolutně.

Stav: **v0.27 hotová = ETAPA 1 CELÁ** (strany hrdinů + startovní osmička
strukturálně, síň, oddanost dle tieru, truhla 400+zdarma+listy+wishlist,
rotující obchod, akademie, UI konsolidace vč. sloupce portrétů a presetů;
detaily CLAUDE.md v0.27). Předtím v0.26 čekající rozkazy. **Etapa 2 HOTOVÁ ve v0.28** (kity, efekty slowEnemy/shred/roundHeal/cauter/
harvest, FACTION_UNITS na CP paritu, čistá pavučina v test-rastr).
**Etapa 3 HOTOVÁ ve v0.29** (REACH 20 + domovské základny + usazování na
výspách, odolnost velkých staveb s obléhacími okny a bouráním, vyhlášení
války s postihem drženého kraje a povinností na kapitál, vykořenění =
přesídlení přes pohyblivý f.capKey; AI staví výspy k Trůnu;
detaily CLAUDE.md v0.29). **Etapa 4a HOTOVÁ ve v0.30** (generátor žil:
uzly 200+ vždy 2×2 s konkrétní surovinou a prstencem, nikdy vedle sebe,
ochrana hradů a bran, strop 300 na výseč; dvou-armádové uzly na jeden zátah
s resetem a 15min uzávěrou; zóny světa ve 4 fázích s checkpointy a časovými
pojistkami; AI drah + koncovka. **Gate sim je od v0.30 STATISTICKÝ**
(rozhodnutí uživatele 30. 8.: všichni živí, nikdo hůř než REACH+2, ≥7/8
v plném dosahu na seed, celkem ≥90 % — tvrdé 8×8 bylo na chaotickém simu
nedoladitelné; stav 62/64). Detaily CLAUDE.md v0.30.) **Etapa 4b HOTOVÁ ve v0.31** (strom Prstenu
6 větví místo automatik, strop území 80→216 se třemi zdroji a výjimkami
Trůn/nájezdy, kapitoly příběhu per frakce vč. AI, kolektivní checkpointy
s pozdním uznáním; gate 62/64 beze změny; CLAUDE.md v0.31). **Etapa 4c
HOTOVÁ ve v0.32** (hráč-uvnitř-frakce: členové s vlastními městy, územím
t.clen, oddělenou ekonomikou/Prstenem/příběhem; obrana společná,
diplomacie frakční; server CLENU_MAX 4; oprava: nájezd dobývá pole →
strop bez výjimky; CLAUDE.md v0.32). **Etapa 4d HOTOVÁ ve v0.33**
(delta snapshoty 498 KB → ~13 KB/tik; viewport culling — mapLayer jako
výřez 394 MB → ~16 MB; minimapa se skokem kamery; velikost mapy knob
`node server/server.js 8123 336 51`, výchozí mapa byte-identická,
invarianty ověřeny na 103×103; tick výnosů dle měření NETŘEBA — 5,4
ms/tik na 103×103; CLAUDE.md v0.33). **ETAPA 4 KOMPLETNÍ.**
**SIGNATURE INTERMEZZO HOTOVÉ ve v0.34** (sigy starterů na archetypech
a jako páky pavučiny; referenční build rastru nese sig; rozhodnutí
uživatele: Edran zůstává špičkou — hlídá se, že ve výhrách krvácí;
frakční amplifikátory vsDmg schváleny; kruhy brakkar>horda>vhorren>
brakkar a durgar>vhorren>gryk>durgar; allow-list ZRUŠEN — test-rastr
41 asercí tvrdě; CLAUDE.md v0.34). **Oddanost jako postup hrdiny
HOTOVÁ ve v0.35** (zadání uživatele: R1 dva startovní stromy, ♥3
třetí, ♥5 čtvrtý, R10 = ♥10 odemyká signature; AI bránu obchází;
balíček na startu jen AI; TREE_VERSION 3; CLAUDE.md v0.35).
**Další na řadě: etapa 5 (provoz a persistence).** Pořadí etap PŘEPSÁNO 29. 8. 2026 po brainstormu MMO a klanové vrstvy (8 rodů po 100 hráčích, klany, keepy, okno zranění) — platí ČÁST IV a ČÁST V na konci souboru, ne ČÁST III.

---

## ČÁST I — tři mechaniky z předlohy (zadání druhé session)

### 1) Akční rádius základen

Fakta předlohy: sídlo a každá tvrz promítají kruh dosahu (RtW ~50 polí na mapě
o milionech polí); armáda smí jednat JEN v kruhu své aktuální základny; do tvrze se
armáda musí výslovně přemístit (pochod na její pole = jen stráž); tvrz se staví na
vlastním poli za suroviny + zlato, sloty na N armád; klanová pevnost = sdílená
předsunutá základna; tunely/mosty fungují, jen když frakce drží OBA konce.

Adaptace: kapitál a výspa (buildOutpost, t.outpost z v0.4) promítají rádius.
**ROZHODNUTO: REACH = 20** (knob; kapitály ~32 Manhattan od středu → na Trůn kapitál
nedosáhne, jedna výspa s rezervou ano; ověřit simem, po MMO pivotu škálovat s mapou).
Hrdina dostane „domovskou základnu"; usazení na výspě = explicitní akce (rozšíření
outpostDeposit o hrdiny). UI: kruh dosahu při výběru hrdiny, nedosažitelné cíle šedě
s důvodem. Mosty „oba konce" jako feature flag (může škrtit hru).

**NEJVĚTŠÍ RIZIKO: AI.** Musí rádius respektovat, stavět výspy směrem k cílům,
nezamrznout před středem — bez toho bod 1 nenasazovat. Ověřit 3000 tiků s 8 AI:
všechny frakce musí dosáhnout na Trůn.

*Doplněno z kodexu (tato session):* ruiny = předpřipravené tvrze k obsazení (5 slotů,
šlo jimi i přesídlit) — kandidát na pozdější obohacení mapy; „Reposition" byl v RtW
oddělený povel od pochodu — naše usazení na výspě má být stejně explicitní. Po MMO
pivotu (část II-C) se REACH škáluje s mapou a tvrze staví hráči, ne frakce.

### 2) Obléhací okna, vyhlášení války, vykořenění

Fakta předlohy: klíčové stavby mají odolnost (siege HP); po pobití posádky se otevře
obléhací okno (RtW ~1 h při ~60denní sezóně ≈ 0,07 % sezóny); sražená odolnost mezi
náběhy zůstává; promeškané okno = stavba se obnoví i s posádkou; při bourání odolnosti
útočník nekrvácí (výjimka: sídlo s lučištnickou věží střílí i při obléhání); v regionu
drženém cizí frakcí má útočník obléhací poškození −70 % a sundá to jen formální
vyhlášení války (akce s dlouhým cooldownem); vynulované sídlo hráče = „vykořenění" —
násilné přesídlení poraženého, NE smazání ze hry.

Adaptace: odolnost jen pro velké stavby (pevnosti, grandforty, kapitály, Trůn — bloky
2×2/3×3 existují), běžná pole beze změny. Okno = knob v % sezóny (0,07 %; při 336 h
≈ 14 min, zaokrouhlit). 70% postih napojit na existující diplomacii (pakty/grudge):
akce „Vyhlásit válku" s cooldownem v % sezóny; AI osobnosti ji musí umět (agresor
vyhlašuje, mírný ne). Vykořenění: kapitál na nule → přesídlení místo eliminace — **ROZHODNUTO: do vlastní
startovní zóny** (na dnešní mapě bez zón = bezpečný kout vlastního oktantu u původní
pozice); poražený se sbírá v závětří.
Věž: kapitály pasivně ostřelují obléhatele (malé, knob).

**POZOR:** kotvy křivky dobývání (tests/test-boj.js sada 8 + tests/test-stromy.js
sada 5, měnit vždy obojí) se NESMÍ hnout — odolnost jen pro velké stavby.

*Doplněno z kodexu:* pole 200+ bránily DVĚ armády poražené na jeden zátah (druhá
bitva s tím, co zbylo z první) — zvážit pro naše velké 2×2 uzly (viz II-C); kraje už
máme (regionOf v0.24) — 70% postih se váže na držení kraje (grandfort), což mu dá
novou váhu. Vyhlášení války povinné pro útok na kapitál.

### 3) Krčma, oddanost, zvací listy, akademie velení
### — SLOUČENO s brainstormem hrdinů a ekonomiky (II-B, II-D ekonomika)

Fakta předlohy: nábor velitele = naplnění respektu, prahy dle tieru 800/3 000/9 000
(poměr ~1 : 3,75 : 11); dárky TEMATICKÉ per velitel; zvací list = okamžitý plný nábor;
strop velení zvedá vedle základu, typu a Prstenu i BUDOVA (+2 setovky velení/úroveň).
Mathom truhla: **400 gemů, jedna denně zdarma, pity na 200 truhel, wishlist** (kodex,
kap. XII). Market: Trading 1:1 na losovaných párech + Bartering s poplatkem.

Adaptace (zadání druhé session + rozhodnutí brainstormu):
- (a) dárková měna se jmenuje **oddanost** (interní pole heroRespect/skillPts neměnit).
- (b) prahy odemčení dle tieru v poměru ~1 : 3,75 : 11 — nástřel 8/30/90 dárků, knob.
- (c) dárky dostanou vellarská jména a ikony dle rodu/rysu cílového hrdiny.
- (d) **zvací list** = vzácný drop z truhel: okamžité odemčení konkrétního hrdiny
  (šance dle tieru, u Legendary nejvzácnější; zvážit zápočet do pity).
- (e) **akademie** v kapitálu (nebo větev ⚒ Vylepšení) — **ROZHODNUTO: +1 velení
  všem hrdinům za úroveň, strop úroveň 10** (celkem +10 CP); cena kámen + zlato,
  roste s úrovní.
- (f) hire-box přestavět na **verbovací síň** s měřákem oddanosti per hrdina.
- (g) **ROZHODNUTO (brainstorm): najímání hrdinů za zlato SE RUŠÍ** — hrdina je buď
  odemčený oddaností (trvale, per účet), nebo ho dává frakce (startovní). HERO_HIRE_COST
  a hirePool v dnešní podobě končí.
- (h) **ROZHODNUTO: truhla za 400 jader + jedna denně zdarma** (reset o půlnoci, per
  účet). **Převzít pity na 200 truhlách i wishlist** — RtW model kompletně.
- (i) **ROZHODNUTO: rotující denní obchod** na tržnici — sloty s itemy a dárky
  (oddaností) za ZLATO; nahrazuje zrušený zlatý žrout najímání. Pozor: převádí sezónní
  měnu na trvalý postup účtu — **ROZHODNUTO: denní limit 1–3 kusy na položku** (knob).
  ⚠ 30. 8. 2026: ceník v IV-R řeší KLANOVOU BURZU, ne tenhle obchod — cena slotů
  tady zůstává otevřená. Platí ale zjištění odtud: náhodný kus z truhly stojí
  ~380 jader, takže cílený kus v obchodě musí stát víc.

---

## ČÁST II — brainstorm této session (28. 8. večer)

### II-A UI konsolidace (horní lišta 10 ikon → ~4–5)

- **Město = místo**: budovy, výcvik, vylepšení, tržnice JEN z panelu města (zkratky
  tp-open existují). Z horní lišty pryč. Přidat tlačítko/klávesu **„domů"** —
  vycentrovat kameru na kapitál (na velké mapě nutnost). Truhly zůstávají v liště
  (účtové, ne městské).
- **Obálka 📩** = kronika + bojové reporty jako dvě záložky, badge nepřečtených.
- **Ratolest 🌿** = cíle sezóny + skóre/diplomacie (skóre+diplomacie už jedno okno).
- **Okno hrdinů**: správa armády hrdiny (v poli = zkratka na posily; doma —
  **ROZHODNUTO: „výchozí sestava"** = uložitelný preset, který útočné kolo předvyplní;
  automatický návrh zůstává pro hrdiny bez presetu); katalog VŠECH hrdinů včetně
  zamčených (strom, signature item, visačka „oddanost X/Y") — motivace k truhlám.
- **Doladění v0.26**: „⚙ Upravit" u hrdiny V POLI dnes vede na formulář pochodu
  cílového pole (posily tam nejsou) — má otevřít rovnou výběr posil pro hrdinu
  a zachovat rozjednaný cíl (navázat na čekající rozkaz), ne intent zahodit.
- **Sloupec portrétů vlevo** (upřesněno uživatelem): portrét vyskočí, když je hrdina
  aktivní; vedle něj co dělá — pochod s časem dojezdu, čekání na posily s časem,
  obléhání, stráž; + malý proužek naplnění armády (aktuální jednotky vs. momentální
  strop velení, počítat přes CP). KLIK = info o hrdinovi (karta), DVOJKLIK = skok
  kamery k němu na mapě. Domácí odpočívající se neukazují. (Pozn. pro mobil později:
  dvojklik ≈ podržení.)

### II-B Hrdinové: strany, startovní osmička, rastr balancu

- **ROZHODNUTO: hrdinové se sjednocují po STRANÁCH** (dobro/zlo, pooly 2×N). Před
  výběrem frakce obrazovka „dobro, nebo zlo?" → 4 frakce té strany. Volba strany
  **per sezóna** (účet sbírá obě poloviny). Odemčený dobrý hrdina hratelný v kterékoli
  dobré frakci. Stávající odemčení (frakce:hrdina) se migrují na stranu.
- **ROZHODNUTO: startovní hrdina je přidělený frakcí** (pravidlo „první common navždy"
  končí — jistotu dává frakce). RtW precedens: Erebor→Dwalin, Rohan→Éowyn…
  Osm archetypů (zadání uživatele):
  - **Aldar (lidé)** — štítonoš: stun nepřátel + buffy vlastních jednotek
  - **Yllien (elfové)** — lukostřelec: zpomalování nepřátel + buffy jednotek
  - **Brakkar (trpaslíci)** — pomalý tank/DD, BEZ bonusů pro jednotky, jeden strom
    čistě healing (vzor: Dwalin — free T1, v reportu 82 % poškození armády)
  - **Sarn (jízdní)** — kavalerista: rychlý, specialista na jízdu
  - **Durgar (orkové)** — siegemaster: podpora jednotek, healing, obléhací bonusy
  - **Horda (démoni)** — čistý DD: žádné skilly na jednotky, přímé fyzické spelly,
    srážení statů nepřátelského hrdiny
  - **Vhorren (nekropole)** — warlock: křísí padlé, kletby, debuffy, madness
  - **Gryk (goblini)** — ekonom: healing + extra výtěžek z akcí na mapě
  **ROZHODNUTO: přeprofilovat stávající** (roster zůstane 48: 8 frakčních starterů
  + 2×20 v poolech stran) — a u každé frakce se na startera přestaví JINÝ slot/rys
  hrdiny (ne všude rychlík či obránce; rozprostřít pestře), ať pooly stran nepřijdou
  plošně o stejný archetyp.
- **Nové typy efektů v boji** (největší kus práce): stun ↔ stun immunity, zpomalení
  (iniciativa), healing BĚHEM boje (lazaret je po boji), srážení statů nepřátelského
  hrdiny, obléhací bonus jako skill, ekonomické skilly (akce mapy, výnosy). Kolové
  aktivky formát unesou („úhyb první 2 kola" = doslova Kingly Kin z kodexu, slovník
  stavů kap. X: Rush/Initiative/Stun/Evade/Pursuit/Follow-up/Madness + imunity).
- **Balanc = pavučina counterů, ne rovnost** (rozhodnutí uživatele): každý má kořist
  i lovce, balanc pocitový přes hraní. **Strom = rozpočet** — specializace si slabinu
  kupuje sama (poměr specializovaných vs. obecných slotů je ladicí knoflík). Signature
  osmička se staví PRVNÍ a podle ní se pak láduje zbylých 40 (rastr).
- Testy hlídají TVAR pavučiny: matice hrdina×hrdina — žádný řádek bez porážky, žádný
  bez výhry; + pásmo tempa PvE (podlaha v dobývání neutrálů — doporučení). Později
  reálné statistiky matchupů ze serverových reportů.
- Každá specializace míří na skutečný moment sezóny (obléhání → brány/Trůn, healing →
  dlouhá tažení, ekonom → dlouhé sezóny, jízda → nájezdy). **ROZHODNUTO: rarita =
  šířka + malý příplatek síly** (vzácnější hrdina umí víc věcí, silou jen o málo výš).

### II-B2 Strom Prstenu (sezónní strom hráče)

- **ROZHODNUTO: úroveň Prstenu dostane strom skillů** (RtW vzor: Dominance/Control/
  Harvest/Abundant, kap. III kodexu). Body za úrovně, méně bodů než větví×ranků →
  sezónní build. Nástřel větví (vellarská jména): **Nadvláda** (strop území — váže se
  na 80→216), **Vláda** (body činu 24→30, obnova), **Výdrž** (stamina hrdinů — dnešní
  ringStam pasivka se stěhuje sem), **Sklizeň** (výnosy, Sklizeň kraje), **Velení**
  (strop CP — dnešní ringCap sem), **Hojnost** (drobné staty hrdinů). Milníky za
  úroveň mimo volbu: RtW „Prsten 10 = tvrze" → výspy/tvrze odemčené Prstenem (spojka
  s mechanikou I-1). Reset stromu za cenu (knob). Ring akce (výcvik/odpočinek/sklizeň)
  zůstávají, větve je zlevňují/posilují.
- **ROZHODNUTO: za Prsten NIC automaticky** — všechno jen za útratu skill pointů.
- **ROZHODNUTO: strop území = tři zdroje** (základ 80, cíl 216; rozpočet +136
  **ROZHODNUT: journey +60 / Nadvláda +50 / checkpointy +26**, knoby):
  1. větev **Nadvláda** (skill pointy Prstenu),
  2. **osobní season journey** — kapitoly po 3–5 questech, za kapitolu +10 polí
     + suroviny + zlato (RtW: ~20kapitolová linka jako hlavní mimoprstenový zdroj
     limitu; stavět na existujících Cílech sezóny / SEASON_GOALS),
  3. **kolektivní season checkpointy** — celoserverové milníky („všichni dohromady
     obsadí 50 000 dílků síly 130+", „dobyto 8 pevností navíc") → všem se odemkne
     další porce polí. Dávají serveru společný rytmus.
- **ROZHODNUTO: checkpointy = motor sezóny.** Splnění podmínky checkpointu → odměna
  všem + OTEVŘE SE MOST do další zóny + startuje další celoserverový sezónní quest.
  Už zabrané mosty/pevnosti se započítávají do součtů. Pojistka pro málo hráčů:
  časový limit checkpointu (např. 3 dny → otevře se i bez splnění) NEBO škálování
  podmínek podle počtu hráčů v sezóně — doporučení: OBOJÍ (škálovat podle přihlášených
  + tvrdý časový strop), sezóna se nesmí zaseknout.

### II-C MMO pivot mapy (největší změna, mění model hry)

- **ROZHODNUTO: 100 hráčů na frakci.** Každý hráč musí mít možnost držet na konci
  sezóny 216 polí ve svém startovním biomu → biom ≥ 21 600 polí → svět ~200 000 polí
  (~460×460; dnes 69×69 = 4 761). Vzniká vrstva **hráč-uvnitř-frakce**: vlastní město
  (3×3), suroviny, jednotky, hrdinové, vlastní území; frakci zůstává strana, biom,
  velké pevnosti, Trůn. (RtW: frakce = stovky hráčů, klany 100, „království" 200.)
- **ROZHODNUTO: strop území roste Prstenem — 80 → 216** (RtW: doloženo 207/216,
  technologie Dominance). Křivka ~+13–14 polí/úroveň, knob.
- **ROZHODNUTO: spawn polí náhodný s žílami**: velké dílky (200+) nikdy vedle sebe;
  kolem velkého garantovaný prstenec menších (130/150 a níž) STEJNÉ suroviny; čím
  silnější uzel, tím víc menších okolo. **Upřesněno (rozhodnuto):** velká pole smí
  být i blízko hráčů (cesta se hledá okolo), ALE **ochranná zóna 5 polí kolem každého
  hráčského hradu bez 200+** (zvolená varianta). Bohatost per zóna: ve startovní zóně
  pole 300 nejvýš JEDNOU od každé suroviny a obecně nižší šance velkých polí; šance
  rostou v zónách blíž středu.
- **ROZHODNUTO: uzly 200+ VŽDY 2×2** (kodex: 1×1 běžná, 200–300 = 2×2, města 3×3),
  vizuálně nepřehlédnutelné (velký model přes blok). Dnešní 1×1 lvl-300 u středu padá.
  **ROZHODNUTO: 200+ brání DVĚ armády úrovně 40** — porazíš jednu, musíš hned i druhou
  (jeden zátah); po neúspěchu cooldown 15 minut (knob) a pole i obě armády se resetují.
- **ROZHODNUTO: startovní zóna s JEDNÍM mostem** ke středu; přechody do dalších zón
  a k ostatním frakcím se otevírají progresem sezóny (precedens: Trůnní příměří).
  Oblouk sezóny: (1) bezpečné PvE → (2) expanze + vnitřní politika frakce →
  (3) válka → (4) střed a Trůn. **ROZHODNUTO: otevírání zón řídí checkpointy**
  (viz II-B2) s časovou pojistkou.
- Technika: klient kreslí JEN viewport + minimapa; síť = area-of-interest diffy
  (jen okolí hráče); mapa po kusech. Tick výnosů ne po 1 s. Bohaté žíly = vnitřní
  politika frakce (kdo z 100 dostane zlatý uzel) — záměr, ne bug.
- Stavět a testovat v malém: stejný kód, velká mapa, 8 lidí v jedné frakci.

### II-C2 Výměna AI za hráče, bandité a Plunder

- **ROZHODNUTO: výměna AI za nového hráče** = AI ztratí všechna pole (zneutrální),
  majetek i hrdinové zmizí beze stopy, hráč startuje načisto. **Za každou výměnu se
  spawne přesně JEDEN nový neutrální bandita** (předvídatelné pravidlo).
- **ROZHODNUTO: mechanika Plunder** — vyplenění nepřátelského pole BEZ záboru: útočník
  dostane malý obnos suroviny pole (~hodinový výnos, knob) a pole majiteli po 1 h
  (knob) netěží. Dělají to bandité hráčům; hráči nepřátelům. Systémový smysl: se
  stropem území je plenění ventil agrese pro hráče na stropu. Odměna za skolení
  bandity (zlato — ozvěna RtW bossů).
  **ROZHODNUTO (detaily):** Plunder stojí body činu ⚡; posádka pole se MUSÍ porazit;
  vypleněné pole má cooldown proti dalšímu plenění — 3 h při plné sezóně, knob
  škálovaný délkou sezóny (ochrana proti šikaně). Zbývá doladit: výše lupu
  (~hodinový výnos), délka výpadku těžby (~1 h), zápočet do skóre minimální.
  **ROZHODNUTO: model ⚡ zůstává** — dobíjení +1/h do zásobníku 24, žádný hodinový reset.

### II-D Web, provoz, launch

- **Železo**: VPS (~5–10 €/měs), doména, HTTPS (Caddy/Let's Encrypt — WSS nutnost),
  systemd/pm2, zálohy. **Účty: SQLite** (better-sqlite3; migrace accounts.json).
  **E-mail**: ověření registrace + reset hesla přes transakční službu (Resend/Brevo/
  Mailgun, free tier; SPF/DKIM na doméně). Stránka „co ukládáme".
- **Nesmrtelnost sezóny**: průběžné ukládání celého stavu hry + resume po restartu.
- **Dieta snapshotů**: hned permessage-deflate, pak rozdílové snapshoty; po II-C
  area-of-interest.
- **Jízdní řád sezón**: plánované starty („svět 1: pondělí 18:00"), přihlašovací okno
  (~prvních 20 % sezóny; převzetí AI frakce/slotu), víc světů při zájmu, střídat
  dlouhé a rychlé sezóny. Limity zpráv/registrací. Multi-accounting se řeší sociálně.
- **ROZHODNUTO: předregistrace na první oficiální launch** — měsíc dopředu: účet +
  přihláška „chci hrát od startu", landing s odpočtem a počítadlem, pole **party**
  (nerozdělit kamarády do různých světů), z přihlášek plyne počet světů (10–12
  přihlášek/svět kvůli no-show) a poměr dobro/zlo. Kanál oznámení: Discord
  (doporučeno) a/nebo e-mail. RtW vzor: Bag End lobby, registrace 5–7 dní předem,
  sólo i předsestavené týmy. Datum slibovat veřejně až po týdnu stabilní bety.
- Měsíc odpočtu = dráha na: UI přestavbu, signature osmičku + rastr, serverové schody,
  ostrou beta sezónu s kamarády.

---

## ČÁST III — pořadí etap a závislosti (návrh)

1. ✅ HOTOVO v0.27 — **UI dávka** (II-A) + **mechanika I-3** (verbovací síň,
   oddanost dle tierů, truhla 400 + denní, rotující obchod, akademie) + strany
   hrdinů (II-B pooly + obrazovka dobro/zlo + startovní osmička strukturálně;
   KITY osmičky = etapa 2).
2. ✅ HOTOVO v0.28 — **signature osmička + nové bojové efekty + rastr** (II-B);
   navíc FACTION_UNITS přeladěny na CP paritu a přibyl efekt cauter
   (kauterizace — protipól léčitelů). Jemné ladění převezme beta.
3. ✅ HOTOVO v0.29 — **mechaniky I-1 (rádius) a I-2 (obléhací okna, válka,
   vykořenění)** na dnešní mapě 69×69, knoby připravené na škálování
   (REACH, SIEGE_WINDOW_FRAC, WAR_CD_FRAC v % sezóny); AI gate prošel.
4. **MMO pivot mapy** (II-C) — největší; rozpad na pod-etapy:
   ✅ **4a HOTOVÁ v0.30** — generátor žil + dvou-armádové uzly 2×2 + zóny
   světa s fázemi „v malém" na dnešní mapě 69×69;
   ✅ **4b HOTOVÁ v0.31** — strom Prstenu (6 větví, nic automaticky), strop
   území 80→216 (Nadvláda +50 / kapitoly +60 / checkpointy +26), osobní
   příběh per frakce, kolektivní checkpointy s pozdním uznáním;
   ✅ **4c HOTOVÁ v0.32** — vrstva hráč-uvnitř-frakce: až 4 hráči na
   frakci, každý s městem 3×3, územím (t.clen), Prstenem a příběhem;
   diplomacie a velké stavby frakční; „stejný kód, víc lidí v jedné
   frakci" ověřeno dvěma taby na :8200;
   ✅ **4d HOTOVÁ v0.33** — delta snapshoty (jen změněné dlaždice, plná
   mapa 1×/60 tiků + při startu/reconnectu), viewport culling (mapLayer
   = výřez kolem kamery, průchody polí ohraničené), minimapa, velikost
   mapy jako knob (setMapRadius, server argv[4]; byte-identita při 34
   hlídána testem test-mapr.js, invarianty na 103×103); tick výnosů
   dle měření netřeba (5,4 ms/tik na 103×103). Skutečná MMO škála
   (~460×460) čeká na AOI po hráčích a chunkovanou 3D stavbu — obojí
   popsáno v CLAUDE.md v0.33 „vědomé resty".
5. **Web a provoz** (II-D železo → nesmrtelnost → dieta → jízdní řád) — částečně
   souběžně s 3–4.
6. **Předregistrace + beta + launch.**

Po každé etapě: `node tests/vse.js`, sim 3000 tiků s 8 AI bez chyby, MP smoke test
(serializace nových stavů!), aktualizace CLAUDE.md + DESIGN.md + paměti.
Nové testy dle zadání druhé session: dosah základen, obnova stavby po promeškaném
okně, postih bez vyhlášené války, prahy oddanosti dle tieru, velení s akademií;
+ z brainstormu: matice counterů (tvar pavučiny), strop území dle Prstenu, generátor
žil (žádné dva velké uzly vedle sebe, prstence sedí), otevírání zón v čase.

## VŠE ROZHODNUTO (28. 8. večer, odpovědi uživatele)

REACH 20 · vykořenění → startovní zóna · akademie +1 CP/úroveň do úrovně 10 ·
rarita = šířka + malý příplatek · preset „výchozí sestavy" ANO · strop +136 =
journey 60 / Nadvláda 50 / checkpointy 26 · bandita: vždy jeden nový za výměnu.
Žádné otevřené body — plán je kompletní, čeká se na povel k implementaci (etapy
v části III).

---

## ČÁST IV — MMO a klanová vrstva (brainstorm 29. 8. 2026)

Zdroj: brainstorm po dokončení v0.42. **Mění MĚŘÍTKO hry**: z 8 frakcí po
4 hráčích (dnešní `CLENU_MAX`) na **8 rodů po 100 hráčích = 800 hráčů na
server**. Vše níže je ROZHODNUTO uživatelem, pokud není označeno „otevřené".

**Základní dělba, ze které plyne zbytek:** *rod je identita* (strana, barva,
výseč, jednotky, bonusy), *klan je společenská jednotka uvnitř rodu* (chat,
burza, hlasování, hodnosti, úrovně). Klan nikdy nepřekročí hranici rodu — ork
a démon nemůžou být v jednom klanu. Na začátku může být celý rod jeden klan;
později jich v rodu bude víc.

### IV-A Klan, hodnosti, úrovně
- Klan začíná na 25 členech, úrovně ho zvednou až na 100.
- **Úroveň klanu roste z kumulativní síly členů** (obdoba XP Prstenu).
- Vůdce + až **5 důstojníků**, jeden důstojník na 20 členů; sloty se odemykají
  úrovní klanu (další u hranice 40 členů atd.).
- **Rada:** do 4 důstojníků musí být rozhodnutí jednomyslné; od 4 stačí většina
  a nejvýš jeden proti.
- Důstojník smí: přijímat a vyhazovat členy, stavět a bourat klanové pevnosti,
  vyhlašovat hlasování.
- **Vyhazov (eviction notice):** člen ho navrhne; když ho hráč nepřijme, ztratí
  frakční pouta — spoluhráči ho nebrání, nesdílí s ním hranici ani dohled —
  a teprve TÍM se jeho pole stanou pro rod nepřátelská. Musí to být stav, ne
  výjimka v útoku: pole patří RODU (`t.owner` je fid), takže dnešní pochod na
  pole spoluhráče se vyhodnotí jako přesun na vlastní pole, ne jako bitva.

### IV-B Klanová pevnost
- Staví ji důstojník/vůdce **na vlastněném uzlu 2×2 (síla 200+)** — uzel se
  musí nejdřív dobýt, což vyžaduje dosah, takže pevnost nikdy nevznikne mimo
  frontu. Pole přejde z osobního vlastnictví do **klanového**.
- Bourat smí jen důstojník/vůdce.
- **Nepočítá se do osobního stropu polí, ale do klanového** — max 3 naráz,
  roste s úrovní klanu.
- Vejde se **jeden hrdina za člena** → je to shromaždiště před úderem.
- **Promítá dosah**, takže členové kolem ní staví výspy i mimo svůj vlastní
  akční rádius. Řetěz expanze: dobýt uzel → pevnost → výspy → další uzel.
- Tři pevnosti = **pohyblivá frontová linie**; jak se válka posouvá, musí je
  klan bourat a stavět jinde.
- ROZHODNUTO (29. 8. večer): když klan zanikne, pevnost **zneutrální** — vrátí
  se jí neutrální posádka jako u vyklizeného pole, nepropadá rodu.

### IV-C Světové cíle a okno zranění
- ✅ **HOTOVO v0.55 (31. 8. 2026) — Okno zranění:** od PRVNÍHO útoku se
  poškození posádky přestane hojit a postup se **sčítá napříč útočníky**; po
  vypršení okna plný reset. **15 minut běžná pole, 60 minut uzly, mosty, keepy
  a grandforty** (`t.zran`, `ZRAN_TICKS`/`ZRAN_TICKS_CIL`). Odražený zátah na
  uzel už obě armády NEOBNOVUJE. Odolnost velkých staveb zůstala na starém
  obléhacím okně (`t.okno`) — jsou to dvě různé mechaniky.
  Dnešní uzly 2×2 mají slabšího předchůdce: 2 armády a 15min uzávěru, ale
  postup se u nich NESČÍTÁ (odražený zátah = plný reset).
- ✅ **HOTOVO v0.55 (31. 8. 2026) — Regionální keep 5×5** uprostřed každého kraje,
  posádka 12 000 (3× velká pevnost, tedy nad stropem velení jednoho hrdiny).
  Původně bráněný 20–50 armádami podle Kdo drží keep, **drží celý kraj** — a s ním pravidlo −70 % bourání
  pro útočníky bez vyhlášené války. (Dnes to samé dělá `regionHolderId` přes
  grandfort na prstenci; keep to přesune doprostřed kraje, kam na velké mapě
  patří.)
- ROZHODNUTO (30. 8. 2026): **keep NAHRAZUJE svobodná města** a je **JEDEN NA CELÝ
  KRAJ, ne tři**. Dnešních ~20 rozesetých neutrálních měst tím padá a zůstane
  devět keepů (střed + osm výsečí). Vzácnost je smysl věci: o jediný keep v kraji
  se pere celý kraj, zatímco o jedno z dvaceti měst se nepere nikdo. Cíl sezóny
  „Dobuď svobodné město" a kapitola „Svobodná města" se musí přepsat na keep —
  jinak zůstanou nesplnitelné, protože kapitál se od etapy 7 dobýt nedá.
- **Do mezikruží není přístup jinudy než grandforty**, posílenými na
  **40× velitel úrovně 50**; Trůnní město **50× úroveň 50**.
- ✅ **HOTOVO v0.55 (31. 8. 2026) — Rally**: přehled načatých cílů v okně 🌿
  (jméno, kraj, pruh zbývající posádky, čísla, odpočet okna, kolik mých
  pochodů je na cestě; klik = skok kamerou). Zatím je to přehled pro HRÁČE —
  klanová viditelnost přijde s klany (etapa 8).
- Aritmetika, ze které to celé plyne: 40 armád za hodinu = 40 útoků, jeden
  hrdina jich stihne 2–3 → **na jeden keep je potřeba 15–20 lidí u něj**. Proto
  je klanová pevnost podmínka, ne bonus.
- **Neutrální města se přestanou generovat.** Typ `city` ale ve hře ZŮSTÁVÁ —
  padlý kapitál se mění na město. Přepsat dvě zadání kapitol „Dobyj svobodné
  město".
- ROZHODNUTO (29. 8. večer): **keep a grandfort se NENAHRAZUJÍ, role si rozdělí** —
  keep drží NADVLÁDU NAD KRAJEM (a s ní pravidlo −70 %), grandfort zůstává
  BRÁNOU do těžších zón (mezikruží a střed).
- **Čísla obran NAHRAZENA křivkou v IV-K (uzavřena 30. 8.)** (30. 8.): 20× lvl 30 → 30× lvl 35 →
  30× lvl 40 → 40× lvl 40 → 45× lvl 50 → 70× lvl 50. Zůstává otevřená jen
  velikost jedné armády v mužích.

### IV-D Politika: války, mír, spojenci
- **Rozhodující klan** = ten s nejvyšší kumulativní silou členů. Přepočet
  **denně v 6:00**, platí 24 hodin. Jen on smí vyhlásit válku za celý rod.
- Uvnitř klanu: nejdřív **shoda rady**, pak **hlasování členů** s prahem, který
  rada určí — **minimum vždy 10 % členů**.
- Hlasování vyrobí **VYHLÁŠENÍ**; válka začne až po odpočtu (~6 h), aby se
  druhá strana stihla připravit.
- **Válka je oboustranná** (kdo ji začal, ten ji má).
- **Mír:** jedna strana navrhne, druhá hlasuje; po schválení **okamžitý**. Poté
  **3 dny**, kdy si ty dva rody nemůžou vyhlásit válku znovu.
- **Jeden spojenec na rod**, válek kolik chce. Cizí pole jsou vždy nepřátelská;
  bez vyhlášené války platí −70 % bourání v drženém kraji.
- ROZHODNUTO (29. 8. večer): **válka trvá minimálně 3 dny** — po ty tři dny se
  o míru nedá ani hlasovat. Spolu s 3denním klidem po míru z toho vychází čistý
  třídenní rytmus a válečné jojo při výměně rozhodujícího klanu nevznikne.
- ROZHODNUTO (29. 8. večer): **spojenectví = sdílený dohled + spojenecká pole se
  pro PŘESUN chovají jako vlastní** (stejně jako pole klanu a rodu se k síti
  přidají pole spojeneckého rodu). Jeden spojenec na rod tak zdvojnásobí
  operační prostor — a protože je jen jeden, vznikne nejvýš dvojice, ne blok.
- ROZHODNUTO (29. 8. večer): **platí to i pro SOUSEDSTVÍ ZÁBORU** — od hranice
  spojence se smí dobývat. Dva spojenecké rody se tím pro expanzi chovají jako
  jedna souvislá klaksa: aliance zdvojnásobí nejen dojezd, ale i frontu.
  Důsledek pro kód: `isAdjacentToFaction` přestane číst jen
  `n.owner === faction.id` a začne se dívat i na diplomacii. Protože tou funkcí chodí hráč, UI i AI,
  spojenecké hranice začne využívat automaticky i AI.

### IV-E Komunikace a reporty
- Chaty: **svět** (vlastní stránka), **klan**, **soukromý mezi hráči**
  (soukromý je potřeba kvůli domlouvání obchodů).
- **Kronika se překlopí na serverový kanál** — pád klíčových bodů, dobytí cizích
  frakcí, do budoucna oznámení eventů. Osobní věci jdou do reportů.
- **Reporty dělené „moje / klanové"**, musí přežít celou session a dorazit i to,
  co se stalo offline. Dnes je to JEDEN globální seznam 40 záznamů pro celý svět
  a nese jen `factionId`, ne cid → stropy per aktér a doplnit cid.

### IV-F Klanová burza
- **Tři oddělené přihrádky:** suroviny za suroviny (**minimálně 1:1**, přeplatit
  smíš), výbava za výbavu **stejné rarity**, dárky za dárky **stejného tieru**.
- Důvod oddělení: jakýkoli kurz mezi surovinou a předmětem je cena, kterou bys
  musel obhájit, a je to trubka jak na farmení z altů, tak na prodej za skutečné
  peníze.
- Nabídka **veřejná pro klan** (kdo dřív přijde) nebo **mířená na člena**.
- **Každý další obchod za den stojí víc zlata** — odtok zlata i brzda proti
  slévání surovin. Poměr 1:1 brání úniku hodnoty, ne koncentraci.
- ROZHODNUTO (29. 8. večer): **žádný zvláštní denní strop** — brzdou je rostoucí
  cena za každý další obchod.
- ROZHODNUTO (29. 8. večer): **poplatek roste i s OBJEMEM**, nejen s počtem
  obchodů za den. Jedno pravidlo tak brzdí obojí — sérii malých převodů z altů
  i jednorázové slití velké dávky — a zvláštní denní strop není potřeba.
- ROZHODNUTO (30. 8. 2026): **měna i výše poplatku se řídí přihrádkou** — výbava
  a dárky stojí 💠 **6 / 12 / 24 jader za kus** podle tieru, suroviny **15 % ze
  součtu obou stran ve zlatě**. **Platí obě strany napůl**, nabízející formou
  úschovy při vystavení nabídky (vrací se, když obchod nevyjde). Detaily v IV-R.

### IV-G Dárky jako předměty
- Dárky přestanou působit okamžitě: **padají do inventáře jako předmět**,
  stohují se, používají se ručně z inventáře nebo z karty hrdiny — a proto se
  dají obchodovat. Řeší mrtvý drop „dárek pro hrdinu, kterého nesbírám".
- Nutné „**použít vše**" (legendární hvězda stojí přes 100 dárků) a hlídat, aby
  odhalení truhly nepřišlo o šťávu.

### IV-H Hrdinové a sezóny
- **Tier se stane osou síly:** ~+5 % základu za tier a lepší schopnosti. Dnes
  tier ovlivňuje VÝHRADNĚ cenu hvězd a šanci z truhly — na staty nemá vliv
  žádný.
- **Legendární hrdina rodu = archetyp rodu** (Aldar tank, Vhorren mystici, …),
  ne vždy mystik jako dnes. Roster rodu přestane být „jeden od každého rysu",
  což pohne pavučinou counterů → rastr balancu dostane osu tieru.
- **Nový rys healer:** léčí ARMÁDU v průběhu bitvy. Efekt `roundHeal` i jeho
  protilék `cauter` existují od v0.28.
- **Reset sezóny:** úroveň, zkušenosti a body dovedností se nulují; **hvězdy
  oddanosti, odemčení hrdinové a výbava zůstávají na účtu**; Prsten je sezónní
  už dnes. Sezónní je SÍLA, trvalá je SBÍRKA.
- **Delší sezóny.**
- Změřeno 29. 8.: za cenu legendárního na R5 (666 dárků) je běžný hrdina na
  **R22** → +88 % statů a 22 bodů dovedností proti +20 %, pěti bodům a pěti
  procentům základu. Legendárka převálcuje běžného až na R25 vs R25. Je to tedy
  **investice na několik sezón** — což přesně sedí na to, že hvězdy přecházejí
  mezi sezónami. V UI to musí být vidět, jinak si hráč připadá podvedený.
- Vědomé rozhodnutí uživatele: **veteráni s 25★ si náskok ponesou**; obranou je,
  aby běžní hrdinové zůstali plně použitelní (což čísla výš potvrzují).

### IV-I Dohled a mapa
- **Dohled 5 polí** u hrdinů i u polí po zvětšení mapy.
- **Vidění sdílí KLAN, ne rod** — frakční sdílení by při stovce hráčů mlhu
  smazalo úplně.
- **Druhý režim mapy podle vztahů**: moje pole zeleným orámováním, můj klan
  tmavě modře, ostatní klany rodu tyrkysově, nepřátelé červeně. Dnešní rodové
  barvení zůstane jako první režim — v bitvě chceš vztahy, při plánování chceš
  vědět, který rod sedí za řekou.

### IV-J Vzhled („dioráma", ne fotorealismus)
Pořadí podle poměru dopad/práce:
1. **SSAO** — dnes je zastínění zapečené per model, takže dlaždice neví, že
   vedle ní stojí hradba, a všechno vypadá nalepené. Největší rozdíl za
   nejmenší práci.
2. **Světlo a grade** — teplé nízké slunce, modré stíny, viněta. Prostředí je
   dnes přechod 16×8 pixelů.
3. **Živá voda** — posouvající se vlnky, odlesk, průsvit u břehu. Pohyb táhne
   oko víc než detail.
4. **Proti tapetě** — výškové rozházení desek o pár centimetrů, náhodné otočení
   symetrických dlaždic po 90° (zadarmo, bez nových modelů), víc variant na
   biom (vzor: tři varianty břehu z v0.41).
5. **Vzdušná perspektiva** a **cesty mezi vlastními poli** (rostou se záborem,
   protínají mřížku).
6. **Tilt-shift** — úzký pás ostrosti; u ortografické kamery mimořádně
   přesvědčivě prodává „tohle je fyzický model".
7. Později: 3D figurky hrdinů (dnes 2D nad 3D — největší trhlina při přiblížení,
   ale velká výtvarná investice), denní cyklus.
- Měřit: post efekty stojí pixely, ne trojúhelníky, takže se nepotkají s dluhem
  na chunkování. Dnes 0,5 ms CPU na snímek.

### IV-K Rozložení zón a křivka obtížnosti

**Topologie.** Výseč každého rodu se rozdělí na DVĚ radiální zóny:
- **startovní zóna** (nejdál od středu, stojí v ní kapitál) — laterálně
  UZAVŘENÁ; vede z ní **jediný crossing** na nativní expanzi směrem ke středu.
- **nativní expanze** — odtud vedou **crossingy do nativních expanzních zón
  sousedních rodů** a **jeden grandfort ke středu**.
- Do biomu okolo středového města přibude **další grandfort**.

Důsledek, kvůli kterému to celé stojí za to: **startovní zóna je slepá kapsa,
kterou nejde napadnout zvenčí** — veškerý boj mezi rody se odehrává až
v expanzním pásu. Kdo chce do cizí kolébky, musí projít jeho expanzní zónou
a vzít mu jeho jediný crossing. Raná hra je tím PvE, střední hra laterální PvP,
koncovka střed.

**Křivka obtížnosti** (počet armád × úroveň velitele):

| stupeň | co to je | obrana |
|---|---|---|
| 1 | keep startovní zóny | 20× lvl 30 |
| 2 | keep nativní expanze | 30× lvl 35 |
| 3 | grandfort — vstup z vnějších zón | 30× lvl 40 |
| 4 | keep vnější části středového kruhu | 40× lvl 45 |
| 5 | grandfort do středu k městu | 45× lvl 50 |
| 6 | hlavní město (Trůn) | 70× lvl 50 |

Celkem **235 armád** na celou cestu od kolébky k Trůnu. Nahrazuje dřívější
nástřel z IV-C (keepy 20–50, grandforty 40× lvl 50, Trůn 50× lvl 50).

Po přepočtu velení z IV-M (200 CP + 100 za úroveň) to dělá **1 087 000 CP
obránců** — 64k, 111k, 126k, 188k, 234k a 364k po stupních. Vymaxovaný hrdina
veze 5 200 CP, takže cesta od kolébky k Trůnu stojí **zhruba 209 plných zátahů**,
a to bez ztrát, které se musí doplňovat. Křivka úrovní 30 → 35 → 40 → 45 → 50
je tím monotónní a počty 20 → 30 → 30 → 40 → 45 → 70 rostou s ní.

**Co pro to chybí v dnešní geometrii** (změřeno 30. 8. 2026):
- Dnešní svět má jen DVĚ vrstvy: střed (Manhattan < 16, uvnitř ještě prstenec
  na 8) a výseč 16–34 s kapitálem na 32. **Chybí dělič mezi startovní zónou
  a expanzí** — nabízí se prstencová řeka s jedním mostem na výseč (most jako
  dvojice břehů, kde se musí držet oba, už umíme z v0.40).
- ✅ **Laterální crossingy posunuty do expanzního pásu** (v0.53): úhlopříčné
  z břehů (17,15) na (14,12), osové zůstaly na q = 24. Všech 16 břehů má za
  sebou útočitelnou půdu, všech 8 dvojic spojuje dvě různé výseče.
- ✅ **Keepy krajů (v0.55)**: devět keepů místo ~20 svobodných měst, umístění
  deterministické, kolébka vyloučená. Gate 63/64.
- ✅ **HOTOVO v0.55 (31. 8. 2026): Prstencový dělič kolébky s JEDNÍM přechodem
  na výseč** — řeka po vrstevnici `kolebkaR()`, přechod tři pole široký na
  půlící přímce oktantu, vlastněný svým rodem od začátku. Gate 64/64.
  Původní zadání: **Prstencový dělič kolébky s JEDNÍM mostem na výseč** — bez něj se dá
  z kolébky vyjít kdekoli a „vítěz drží crossing" nemá co držet. Vrstevnice
  Manhattanu jsou kvůli tomu ve směrech (1,1)/(1,−1), takže modely řek sednou.
- Vnitřní prstenec na Manhattan 8 má **4 pevnosti, ne 8 grandfortů** — počet
  bran dovnitř nesedí s počtem výsečí.
- Výseč je dnes hluboká 18 polí; po rozdělení vyjde ~9 na zónu. Na prototyp
  stačí, na velké mapě se poloměry škálují úměrně (jsou odvozené z MAP_R).

**Otevřené:**
- ~~Velikost jedné armády~~ — ROZHODNUTO v IV-L: armádu veze neutrální HRDINA
  a její velikost je jeho strop velení pro danou úroveň plus výbava jeho tieru.
- ~~Posádky crossingů~~ — ROZHODNUTO: zatím beze změny, neškálují se.
- ~~Zapečetěná kolébka~~ — ROZHODNUTO v IV-L a HOTOVO ve v0.53: do startovní
  zóny nepřítel vůbec nesmí, každý rod má navždy aspoň jednu zónu. Kapitál
  se tím nedá dobýt (potvrzeno uživatelem 30. 8.) a tlak se přesouvá na
  CROSSING, který musí vítěz držet. Dělič kolébka/expanze je `kolebkaR()`.
- **Kritérium sim gate.** Dnes měří „AI dosáhne na Trůn" (63/64). S 235 armádami
  na cestě tam nedosáhne nikdo — a to je záměr. Gate se musí přeformulovat,
  třeba na „AI se dostane do expanzního pásu a udrží svůj keep".

### IV-L Neutrálové jako hrdinové, nedotknutelná kolébka, stohování

**Neutrální obránci přestanou být holé posádky.** Na poli nestojí anonymní
jednotky, ale **neutrální verze hrdinů** — týchž, jaké může používat hráč —
vybavené jednotkami **až do svého normálního stropu velení (CP) pro danou
úroveň**. Platí to všude: běžná pole, crossingy, keepy, grandforty i střed.

- pole do síly 200 → jen **T1** hrdinové (základní kvalita)
- pole 200+ → **T2**
- keepy, grandforty a středové město → **T3 s legendární výbavou**
- **Neutrální hrdina smí nosit jen výbavu svého tieru:** T1 zelené kusy,
  T2 epické, T3 legendární.

**Tím vzniká jednotný metr na sílu armád** — nemusí se vymýšlet, kolik mužů má
která posádka. Vyplyne to ze stropu velení hrdiny dané úrovně plus jeho výbavy.
Změřeno 30. 8. (základ bez výbavy, hvězd a dovedností):

| úroveň velitele | strop velení |
|---|---|
| 30 | 635 CP |
| 35 | 710 CP |
| 40 | 785 CP |
| 50 | 935 CP |

Křivka z IV-K pak v součtu vychází na **~196 000 CP obránců** na celé cestě od
kolébky k Trůnu (12,7k → 21,3k → 23,6k → 31,4k → 42,1k → 65,5k). Vymaxovaný
hrdina hráče veze 935 CP na jeden útok, takže cesta stojí **přes 200 plných
zátahů** — a to bez ztrát, které se musí doplňovat.

**Crossingy zatím BEZE ZMĚNY** — zůstávají na dnešních 2× velitel úrovně 35
a posádce 500. Neškálují se po zónách.

**Startovní zóna je pro nepřítele NEDOTKNUTELNÁ.** Cizí rod do ní nemůže
vstoupit vůbec; útočit ven může jen ten, kdo z ní vychází. Každý rod tak má
navždy aspoň jednu zónu a nedá se z mapy vymazat.

**Na jednom poli smí stát víc hrdinů téže frakce.** Aby se dalo před grandfort
nahromadit třeba 200 armád, aniž by každá musela pochodovat z domova. Dnes drží
hrdina jedno pole (`hero.pos`) a víc jich na sobě stát nemůže — tohle je zásah
do pohybu i do obrany.

**Uprostřed budou jen 4 keepy — záměrně.** Osm rodů, jeden spojenec na rod →
nejvýš čtyři dvojice, tedy přesně čtyři keepy. Kdo není ve spojenectví, ke
středu se nedostane, dokud si keep nevybojuje. Nedostatek je tu mechanika,
ne opomenutí.

**PASTI A DŮSLEDKY:**
- **Křivka dobývání se tím CELÁ pohne.** Dnes má pole holou posádku (strop 435
  mužů na úrovni 12) a slabého velitele; T1 hrdina s výbavou, rysem a stromem
  dovedností je jiné zvíře. Kotvy `tests/test-boj.js` sada 8 a
  `tests/test-stromy.js` sada 5 (které se dosud NESMĚLY hnout) se přepíšou
  spolu s tím — obojí najednou.
- **Trůn vyroste zhruba 35×** proti dnešku (dnes posádka 1200 mužů, nově
  65 500 CP). Je to změna, která dává smysl až se stovkami hráčů — na dnešní
  hře by byla nehratelná. Patří tedy do etapy 6 a dál, ne dřív.
- **Obléhání kapitálu a vykořenění se stane nedosažitelné.** Kapitál stojí ve
  startovní zóně, do které nepřítel nesmí — takže `resettleFaction` už nikdy
  nespustí cizí útok. Buď je to záměr (rod se nedá vyhnat z domova), nebo se
  kapitál musí přesunout do expanzní zóny. **Rozhodnout.**
- **ROZHODNUTO — obrana stohu je řetěz jednotlivých bitev.** Útok porazí VŽDY
  JEN JEDNU armádu; poražený obránce se stáhne na výspu a **ostatní brání dál**.
  Dobýt pole s 200 hrdiny tedy znamená 200 úspěšných zátahů. Je to záměr: nutí
  to k **koordinovaným útokům** a je to přesně tatáž mechanika jako keep,
  grandfort a Trůn — jen postavená hráči. Jeden mechanismus, tři použití.
- **Počet armád na poli MUSÍ být vidět, jejich síla NE** — aby šlo klamat
  slabými hrdiny. Panel pole tedy ukáže „armád: 47" bez složení; u vlastních
  polí se vidí všechno. Vzniká tím vrstva blafování: velký stoh nemusí být silný.
- **Asymetrie resetu:** neutrální cíl se po vypršení okna zranění doplní sám,
  ale hráčský stoh se „resetuje" jen tím, že majitel pošle stažené hrdiny zpátky
  — stojí ho to čas, výdrž a pochod. To je lepší brzda než časovač.
- ~~PAST: prázdná armáda~~ — ZAVŘENO v IV-M prahem 100 CP.
  Původní znění: hrdina s PRÁZDNOU armádou nesmí do stohu počítat. Když stažení
  hrdiny nic nestojí, dá se na pole nastrkat 200 hrdinů bez jediného vojáka
  a udělat z nich zadarmo zeď, kterou musí útočník 200× přebít. Blafovat slabými
  hrdiny je záměr, blafovat prázdnými je degenerace — obrana by měla mít práh
  (aspoň nějaká armáda), nebo něco stát (výdrž).
- **Pořadí obránců ROZHODNUTO v IV-M:** neutrálové od nejslabšího, hráčské
  stohy v pořadí příchodu.
- Stohování zároveň **odebere klanové pevnosti její roli shromaždiště**
  (dnes „jeden hrdina za člena"). Pevnosti pak zůstane hlavní smysl
  v promítnutém dosahu — což je pořád dost, ale je dobré to vědět.
- **Neutrální hrdinové potřebují jména, portréty a stromy.** Buď se berou
  z existujícího poolu hrdinů (a pak potkáš „svého" hrdinu jako nepřítele —
  což je mimochodem hezké), nebo dostanou vlastní neutrální sadu.

### IV-M Jednotky T4, měřítko velení a pořadí obránců

**Práh obrany: hrdina musí vézt aspoň 100 CP jednotek**, aby se počítal do stohu
(100 pěchoty, 50 jízdy u sarnů apod.). Zavírá past z IV-L — prázdný batoh
přestane být nejlevnější zeď ve hře.

**Nový druh jednotky „velká" a ikonická T4 jednotka pro každý rod.** Rod se jí
definuje; cena i staty rostou úměrně její hodnotě CP.

| rod | T4 jednotka | CP/kus | co dělá |
|---|---|---|---|
| aldar (lidé) | jezdec na gryfovi | 25 | střelec s vyšší rychlostí než jízda |
| yllien (elfové) | ent | 25 | — |
| durgar (orkové) | trol | 25 | — |
| brakkar (trpaslíci) | těžká pěchota | 2 | hodně tanková melee |
| sarn (jízdní klany) | Bělovlas | 25 | v kole útočí vždy první |
| horda (démoni) | Demon Prince | 100 | léčí se z uděleného poškození |
| vhorren (nekropole) | mág | 4 | během bitvy konvertuje nepřátelské jednotky na svou stranu |
| gryk (goblini) | warboss | 25 | škáluje podle aktuálního množství zlata |

**Precedens už ve hře je:** sarnské jednotky stojí 2 CP za kus a mají zhruba
dvojnásobné staty (pěchota 24 HP proti 10 u aldarů). T4 jednotky jsou tentýž
princip, jen o řád výš. Ostatní rody mají dnes všechny jednotky po 1 CP.

**Měřítko velení se přepočítá: základ 200 CP + 100 CP za úroveň** → na úrovni 50
**5 200 CP** místo dnešních 935. Stejné pravidlo platí pro neutrální hrdiny na
polích, takže **poměr útoků k obraně zůstává stejný** — celá cesta na Trůn
vyjde po přepočtu na ~1 070 000 CP obránců proti 5 200 CP na jeden plný zátah,
tedy pořád přes dvě stě zátahů. Mění se granularita, ne obtížnost: teprve
s pěti tisíci CP dává smysl vézt 52 Demon Princů nebo 5 200 pěšáků.

**Pořadí obránců:**
- **Neutrální objektivy: od nejslabšího.** Obtížnost roste, poslední bitva je
  boss — čistá PvE křivka.
- **Hráčské stohy: v pořadí příchodu, NEJDÉLE STOJÍCÍ PRVNÍ** (doporučení, viz
  rozbor níže). Kdo přišel dřív, brání dřív; posily poslané během boje jsou
  záloha za linií.
- Pozdější rozšíření: majitel pole si smí pořadí svého stohu přeskládat ručně.

**PASTI A DŮSLEDKY:**
- **Přepočet velení na 5 200 CP je REBASE CELÉ EKONOMIKY, ne knob.** Ceny
  jednotek, verbovací fronty, výnosy polí, žold (armyUpkeep) i křivka dobývání
  jsou vyladěné na armády kolem tisíce CP. Buď se všechno přepočítá 5,5×, nebo
  jednotky o tolik zlevní.
- **T4 s úměrnými staty A schopností navíc je striktně lepší.** Když 25 CP trola
  odpovídá 25 CP pěchoty v surových statech a k tomu má schopnost, není důvod
  brát pěchotu. Schopnost musí něco stát — méně statů za CP, vyšší cena, delší
  verbování, nebo strop kusů na armádu.
- **Málo velkých jednotek je strukturálně výhodné** kvůli pravidlu „přebytek
  poškození se ZTRÁCÍ" (v0.19): útok na jeden 25CP kus přeteče a přebytek zmizí,
  zatímco 25 jednotlivců pobije úderů víc. Velké jednotky tedy dostanou bonus
  zadarmo — počítat s tím při ladění, nebo pravidlo přebytku pro velké kusy
  upravit.
- **Konverze u nekropole** (mág přetahuje nepřátelské jednotky) je nový druh
  efektu — dnešní bojové efekty umí poškození, léčení, zpomalení a shred, ale
  ne převod kusů mezi stranami. Chce vlastní pravidla: co se stane s převedenými
  po bitvě, dá se konvertovat velitel, jde konvertovat konvertované zpátky.
**Doplněné profily T4 (30. 8.):**

- **Demon Prince (horda)** — mellee, obrovské HP, VELKÉ poškození, lifesteal,
  velmi drahý. **Vědomá výjimka z pravidla „výdrž, ne výstup"** z IV-M: umí
  obojí, a platí za to šílenstvím. Aura: každá formace, jejíž součet CP je nižší
  než aktuální CP nasazených Demon Princů, má **50 % šanci na šílenství každé
  kolo — a platí to i pro VLASTNÍ a spojenecké jednotky**. Čím víc princů
  nasadíš, tím víc se pole propadá do chaosu včetně tvých vlastních řad.
  Sebeškálující cena: silný nástroj, který si sám vyrábí riziko.
  - `madness` už v enginu JE (v0.20): zasažená formace se to kolo může obrátit
    proti svým, volí se náhodně z živých formací nepřítele. Nové by bylo, že
    aura vychází z JEDNOTKY (ne z hrdiny) a míří na **obě strany**.
  - **ROZHODNUTO: šance 25 % za kolo** (dnešní měřítko: item „Šílená maska" 3 %,
    rank dovednosti 0,8 % za bod — 25 % je pořád o řád výš, ale při 7–8 kolech
    vyrovnané bitvy to dělá ~2 obrácené formace za bitvu, ne ruletu).
  - **ROZHODNUTO: CP Demon Princů se porovnává proti KAŽDÉ FORMACI zvlášť**, ne
    proti celé armádě. Protože se armáda dělí na tři typy jednotek, drží jedna
    formace zhruba třetinu velení — u armády 5 200 CP tedy ~1 733 CP na formaci,
    takže **18 princů (1 800 CP) šílí celé bojiště**.
  - **DŮSLEDEK 1 — soustředěná armáda Princi odolá.** Kdo naskládá velení do
    JEDNÉ formace nad práh, madness ho mine. Jenže tím ztratí clonu nebo
    poškození (IV-N), takže obrana proti Princi stojí formační rovnováhu.
    Pěkné napětí: Princ tlačí ke koncentraci, linie k vyváženosti.
  - **DŮSLEDEK 2 — armáda Demon Princů chce být skoro celá z Princů.** Doprovod
    je vždycky pod prahem, takže šílí VLASTNÍ podpora. Horda se tím sama od sebe
    stane rodem malého elitního houfu nestvůr, ne smíšeného vojska — identita,
    která vypadla z jednoho pravidla.
  - Princové jsou vůči vlastní auře imunní (stejné CP, ne nižší).
  - Lifesteal má ve hře protilék: **`cauter`** (kauterizace, zákaz léčení, v0.28).
- **Bělovlas (sarn)** — VELKÁ mellee jízda, 25 CP/kus, v kole útočí vždy první.
  S obcházecím pravidlem z IV-N je to „udeří na tvé střelce dřív, než stihneš
  jednat" — silná kombinace, jejíž protilék je hustá clona.
  - **ROZHODNUTO: práh „tenké clony" se měří v CP, ne v počtu kusů.** Velká
    jízda má při stejném velení 25× méně těl než pěchota, takže podle počtu by
    Bělovlas clonu nikdy neprorazil — a sarnská vlajková jednotka by bojovala
    proti vlastní mechanice rodu.

**Profil trola (a vzor pro ostatní „velké"):** drahý, hodně HP, VELMI POMALÝ,
plošný úder nebo taunt v prvních 2–4 kolech a po tu dobu bonus k obraně.

Změřeno 30. 8. — jak dlouho bitva vůbec trvá (vyrovnaní velitelé úrovně 50):

| síla obránce vůči útočníkovi | kol |
|---|---|
| 60 % | 3 |
| 80 % | 5 |
| 100 % | 7 |
| 120 % | 8 (útok odražen) |

Okno „první 2 kola" tedy pokryje čtvrtinu skutečné bitvy, „první 4 kola" zhruba
polovinu — a v jednostranném přejezdu je to celá bitva. Pro efekt, který má
rozhodovat vyrovnané střety, jsou 3–4 kola; 2 kola jsou jen malá výhoda.

**Pomalost stojí DVAKRÁT a obojí je už ve hře zapojené:** rychlost jednotek
určuje čas pochodu (`armyTimeMult`) — trolí armáda dorazí pozdě, a v hodinovém
okně raidu to přímo ubírá počet zátahů; a zároveň určuje **pořadí v kole**,
takže pomalá armáda jedná poslední a schytá alfa úder dřív, než sama udeří.
Bonus k obraně v prvních kolech je přesně správná kompenzace toho druhého.

**PAST: pomalost netrestá obranu tolik jako útok.** Kdo stojí na poli, nikam
nepochoduje — z dvojí ceny mu zbude jen ta iniciativa. Když k tomu trol ještě
POBIJE víc než 25 pěchoty, je na obraně striktně nejlepší jednotkou ve hře
a s novým modelem stohů z něj bude nepřekonatelná zeď. ROZHODNUTO (30. 8.): velké
jednotky dostanou **výdrž, ne výstup** — trol ať 25 pěšáků PŘEŽIJE, ne pobije. Pak je
na útoku štítem pro zbytek armády a na obraně zdržovačem, ne vyhlazovačem.

**Taunt je nová osa v boji.** Dnes se poškození rozděluje po formacích a nikdo
nemá vliv na to, koho nepřítel bije. Cílení je dobrý přírůstek (dá formacím
smysl), ale je to zásah do jádra soubojového enginu, ne nový řádek v tabulce.

- **Warboss škálující zlatem** váže bojovou sílu na ekonomiku — pozor, aby
  gryk nebyl nejsilnější těsně po prodeji surovin na tržnici.

### IV-N Přední a zadní linie (mellee vs ranged)

**Pravidlo:** jednotka na blízko **nedosáhne na střelce, dokud před nimi stojí
bránící jednotka na blízko**. Výjimkou jsou efekty, které cílí na celou formaci
nebo výslovně na střelce.

Tím poprvé dostanou formace skutečný smysl: pěchota (a velké jednotky) jsou
**clona**, střelci za ní jsou chráněné poškození. Armáda ze samých střelců nemá
clonu a rozsype se; armáda ze samé pěchoty jde celou cestu pod palbou.

Pěkně to zapadá do dvou věcí, které už máme: **„přebytek poškození se ZTRÁCÍ"**
(v0.19) znamená, že všechen přetok jde do clony a mizí — clona tedy plýtvá
nepřítelovým poškozením, což je přesně její práce; a **velké jednotky s vysokým
HP na kus jsou ideální clonou**, takže trol s taunt efektem a profilem
„výdrž, ne výstup" (IV-M) je přesně ta jednotka, která má v přední linii stát.

**JÍZDA — VYŘEŠENO.** Jestli mellee na střelce nedosáhne
NIKDY, je z jízdy jen rychlejší pěchota a **trojúhelník counterů se sype**:
identita jízdy v tomhle žánru je právě obcházení linie a vraždění lučištníků.
ROZHODNUTO (30. 8.): **jízda clonu obchází, ale jen když je clona proti ní příliš tenká** —
tím začne záležet na VELIKOSTI clony, ne jen na její přítomnosti, a vznikne
čitelný kruh: pěchota kryje střelce, střelci střílí, jízda proráží tenkou clonu.

**Důsledky:**
- **Pavučina counterů se přepočítá celá.** Rastr balancu (test-rastr, 41 asercí)
  stojí na dnešním rozdělování poškození mezi formace — s liniemi to bude jiná
  hra a matice se musí naměřit znovu.
- **Cílení je zásah do jádra enginu**, ne řádek v tabulce: `simulateBattle` dnes
  rozděluje poškození po formacích bez pojmu dosahu.
- **Neutrální hrdinové mají clonu taky** (staví se podle stejných pravidel),
  takže keepy a grandforty se stanou tvrdší i bez zvýšení čísel.
- Efekty „na celou formaci" a „na střelce" se stanou protilékem na zaťukanou
  obranu — mají už domov v systému bojových efektů z v0.28.
- U každé T4 jednotky bude potřeba určit, jestli je mellee nebo ranged
  (gryfí jezdec a nekropolní mág jsou střelci, trol/ent/warboss clona,
  Demon Prince a Bělovlas rozhodnout).

---

### IV-O Budovy pro dlouhou sezónu a najímání dvou rodů

**Budovy se roztáhnou:** víc úrovní, vyšší ceny, delší stavba, aby strom budov
pokrýval celou (nově delší) sezónu místo prvních minut.

Dnešní stav (změřeno 30. 8.) — proč to není jen zvednutí čísel:
- **Hlavní budova má dnes max 5 úrovní**, takže úroveň 8 zatím neexistuje.
- Hlavní budova **stropuje úrovně ostatních budov** a akademie smí až na
  dvojnásobek její úrovně. Posun hlavní na 8 by pustil akademii na 16, jenže
  její vlastní strop je 10 — **stropy se musí projít jako celek**, ne po jednom.
- **Doby stavby jsou 30–90 tiků**, tedy vteřin: celý strom se postaví za pár
  minut. Pro sezónu na týdny je potřeba je vyjádřit **jako podíl sezóny**
  (konvence projektu: každý nový knob škálovat vůči `setSeasonHours`).
- **ROZHODNUTO: akademie dává +100 velení za úroveň** (dnes +1). Při deseti
  úrovních to je +1 000 CP, tedy +19 % ke stropu 5 200.
- **ROZHODNUTO (30. 8.): za oddanost dostává hrdina hlavně STATY a BODY
  DOVEDNOSTÍ, ne velení.** Velení je věc úrovně a akademie. Bonus velení za
  hvězdu tím zůstává jen ozdobou (dnes 25/hvězdu, po rebase ~12 % při 25★) —
  přeškálovat ho netřeba.
  - Pilíř „sezónní je síla, trvalá je sbírka" (IV-H) tím drží: **+4 % statů
    a +1 bod za hvězdu jsou procenta a body, takže je rebase velení nemine**.
    Na 25 hvězdách je to +100 % statů a +25 bodů proti 49 z úrovní — trvalá
    sbírka zůstává obrovská výhoda i po přepočtu.
  - **Hlídat v etapě 6:** armády vyrostou 5,5×, ale vlastní staty hrdiny ne.
    Podíl hrdiny na bitvě tím klesne a hvězdy by zeslábly zadními vrátky.
    Při přeměření rastru zkontrolovat, kolik poškození hrdina reálně dává
    (dnes 4–55 %), a případně jeho staty rebasovat s armádami.

**Na úrovni 8 hlavní budovy si hráč jednou za sezónu vybere DRUHÝ ROD**, jehož
jednotky pak smí verbovat. Skládá si tím armádu ze dvou rodů.

- **Precedens už ve hře je:** hrdinové jsou cross-frakční v rámci STRANY —
  Síň hrdinů nabízí hrdiny všech rodů dobra nebo zla. Stejné pravidlo pro
  jednotky je konzistentní: **druhý rod jen z vlastní strany**. Zároveň to
  udrží smysl dělení dobro/zlo a zmenší to kombinace z 28 dvojic na 6 na stranu.
- **ROZHODNUTO: druhý rod půjčuje jen ZÁKLADNÍ jednotky, ne svou T4 vlajku.**
  Vlajková jednotka je duše rodu — svou si necháváš, cizí nedostaneš. Flexibilita
  zůstane (brakkarská clona pro yllienské střelce), ale nikdo si nesloží
  superarmádu ze dvou vlajek a práce na identitách rodů z IV-M zůstane platná.
- Skládá se to hezky s liniemi z IV-N: hodnota druhého rodu je přesně
  „zalátat díru ve své formaci", což je zajímavá volba, ne jen víc čísel.
- **ROZHODNUTO: volba druhého rodu je na celou sezónu, nedá se změnit.**
- **VĚDOMĚ PŘIJATÉ RIZIKO (rozhodnutí uživatele 30. 8.):** míchání dvou rodů
  rozšiřuje pavučinu counterů z osmi identit na kombinace a rastr balancu
  (test-rastr, 41 asercí) na to není stavěný. Uživatel se rozhodl **balanc
  míchání zatím neřešit a nechat to na provoz** — kdyby se ukázalo, že jedna
  dvojice pokrývá clonu i střelbu líp než ostatní, řeší se to až tehdy.
  Není to opomenutí, je to odložení.

---

### IV-P Bojový log kolo po kole — ✅ HOTOVO v0.55 (31. 8. 2026)

**Hotovo:** `roundLog[]` nese vedle textových poznámek i `poradi` (kdo v kole
jedná a v jakém pořadí), `akce` (kdo → koho → za kolik, včetně příznaků
„obrátil se na vlastní" a „navazující úder"), `lecA`/`lecD` (vyléčeno v kole)
a `stavA`/`stavD` (omráčení, šílené formace, nasčítané stohy). UI to kreslí
jako rozklikávací „Průběh kola" uvnitř každého kola reportu.

Report vyrostl z ~4 KB na 5,8 KB (bitva o pěti kolech), takže se schránka
40 reportů vejde pod ~230 KB a **přehrávání ze seedu nebylo potřeba**.

Původní zadání a rozbor:



Report musí ukázat **přesně, co se v každém kole stalo** — ne souhrn, ale
průběh, ze kterého se dá pochopit PROČ bitva dopadla, jak dopadla. Konkrétně:

- **kdo v kole jedná a v jakém pořadí** (velitelé napřed, pak formace podle
  iniciativy — dnes to engine počítá, ale ven nedá nic),
- **co ta jednotka udělala a KOHO trefila** (dnes se cíl volí, ale v logu
  není),
- **za kolik dala poškození** — rozpad na velitele, formace a kouzla,
- **kolik jednotek vyléčila** (`roundHeal`, lifesteal, konverze) a komu,
- **jaké buffy jsou v kole aktivní, kdy se zapnuly a jak dlouho vydrží**
  (`stackAtk`/`stackDef` rostoucí každým kolem, kolové aktivky s časováním
  „každé 3. kolo", taunt okno, šílenství, obranné chargy, opevnění).

**Co už je hotové (v0.52):** report nese sestavy obou stran s rolí formací,
matici střetů „kdo na koho mířil" za celou bitvu, rozpad zbytku po formacích
v každém kole a textové poznámky (`roundLog[].ev`).

**Co chybí:** poznámky jsou dnes volný text, který engine vyrábí ad hoc na
~30 místech. Aby se dal log vykreslit strukturovaně (a filtrovat), musí se
z něj stát **záznamy s daty**, ne věty:
`{ kolo, kdo, akce, cil, hodnota, trvani }`.

**PASTI A DŮSLEDKY:**
- **Velikost reportu.** Report jde hráčovou schránkou i snímkem sezóny;
  strukturovaný log po kolech ho nafoukne násobně (proto se matice střetů
  ve v0.52 sčítá za celou bitvu, ne po kolech). Buď se log ukládá jen pro
  bitvy, kterých se hráč účastnil, nebo se drží zkráceně a plný se dopočítá
  z uloženého seedu — **simulace je deterministická, takže PŘEHRÁNÍ z seedu
  je reálná varianta a je zdaleka nejlevnější.**
- **Poznámky jsou dnes lokalizované věty.** Strukturovaný log musí nést kód
  akce a čísla; text se skládá až v UI, jinak se nedá filtrovat ani zobrazit
  kompaktně.
- Vhodné udělat **spolu s rally obrazovkou** (etapa 7) — obojí je čtení
  bitvy a sdílí komponenty.

---

### IV-Q Drobná zadání z provozu (30. 8. 2026)

**Strany se přejmenují: dobro → Sunborn, zlo → Ashen.** ✅ HOTOVO v0.55
(31. 8. 2026) — přejmenované je jen ZOBRAZENÍ (`SIDES.name`/`gen`), klíče
`dobro`/`zlo` zůstaly kvůli účtům. Původní rozbor: Dnešní `SIDES`
a `FACTION_SIDE` používají klíče `dobro`/`zlo` a jména „Dobro"/„Zlo", což je
placeholder z prototypu. Vellar má vlastní jména.
- Mapování (ověřit s uživatelem): **Sunborn** = aldar, yllien, brakkar, sarn;
  **Ashen** = durgar, horda, vhorren, gryk (popel je jejich živel).
- PAST: klíč strany je v ÚČTECH (`acc.inventory[].side`, sady truhel,
  `sigOdemceno`) a v `ITEM_SIDE_NAMES`. Přejmenovat se smí ZOBRAZENÍ, klíč
  buď nechat, nebo přidat migraci — jinak hráči přijdou o výbavu své strany.

**Výcvik místo verbování a doba podle OBJEMU.** ✅ HOTOVO v0.54 (30. 8. 2026):
sazba `VYCVIK_SEK_ZA_CP = 0,12` s za bod velení (baseline hodinové sezóny,
škáluje se délkou sezóny jako `buildTicks`), fronta se odbavuje POSTUPNĚ, čas
je vidět před potvrzením, tlačítko se jmenuje „Vycvičit" a zakázka jde zrušit
s poměrnou vratkou. Kalibrováno na dosavadní tempo AI (~9,3 CP/s), gate zůstal
63/64. Původní zadání znělo:
- v UI **„vycvičit"**, ne „naverbovat",
- **doba roste s objemem v CP** — návrh uživatele: 1 s za 1 CP, takže
  300 CP = 300 s,
- **čas musí být vidět dopředu**, ještě než hráč objednávku potvrdí.
- ⚠ Musí se to škálovat DÉLKOU SEZÓNY jako doby stavby (`buildTicks`,
  konvence z IV-O) — 1 s/CP je na hodinovou testovací sezónu nesmysl
  (5 200 CP = 87 minut z 60), zatímco na čtrnáctidenní je to málo.
  Nabízí se `recruitTicks = CP × podíl sezóny`, kalibrovaný tak, aby plná
  armáda hrdiny stála zhruba stejný podíl sezóny bez ohledu na její délku.
- ⚠ Dnešní `RECRUIT_BATCH` (56 kusů) a fronta o dvou dávkách tím ztrácí
  smysl — přepsat na objednávku s vlastní dobou.

**Výnosy za HODINU, ne za vteřinu.** ✅ HOTOVO v0.54 (30. 8. 2026): horní lišta,
panel pole, bublina mapy i popisky vrstev. Vnitřní tik zůstal vteřinový, mění se
jen zobrazení (×3600); lišta zkracuje nad 1 000 na „63k/h", přesné číslo je
v bublině nad ikonou.

⚠ **Co se tím ODHALILO:** na startu je výnos 63 000 jídla za hodinu, zatímco
zásoba je 200 a nejdražší budova stála 4 750. Ekonomika byla tedy na dlouhé
sezóně vyřešená během první hodiny.

**Vlajka T4 je nově za HLAVNÍ BUDOVOU 7** (31. 8. 2026, návrh uživatele) —
kasárny 4 samotné se daly postavit v prvních dnech a T4 byla k mání skoro hned.
Pákou nejsou ceny, ale DOBY STAVBY (škálují se délkou sezóny): řetěz na main 7
a kasárny 4 dělá 5,3 dne čisté stavby ze 14, takže vlajka vychází na 6.–8. den.
Ověřeno, že to nebolí AI gate (61/64 i bez vlajek u AI).

**Částečně vyřešeno (30. 8. 2026, zadání uživatele „budovy se musí zvýšit,
první levely v tisících, pozdější klidně milion"):** křivka cen budov je nově
geometrická — hlavní budova 2 000 → **1 000 000**, akademie 2 000 → 890 000,
vylepšení ×8. Strmá část leží nad hlavní budovou 5, kam `AI_BUILD_ORDER`
nechodí, takže se ladí hráčova hra a AI zůstává funkční (ověřeno: všech sedm
AI rodů pořád dojde na kasárny 4, gate 61/64 = 95 %).

⚠ **Co tím vyřešené NENÍ:** ceny se pořád neškálují délkou sezóny, zatímco časy
ano. Na hodinové testovací sezóně jsou vrcholy stromu nedosažitelné (vůdce
vydělá za hodinu ~80 000 zlata), na čtrnáctidenní naopak celý strom padne
během prvního dne (plató 191 000 zlata/h). Buď přidat škálování i cenám
(konvence `buildTicks`), nebo mít pro krátké sezóny vlastní sadu čísel.

**Zrušit generování neutrálních měst** — už je v etapě 7, tady jen odkaz:
města na mapě mají být hráčská, ne rozeseté „svobodné obce". ⚠ Vázané na keepy
(30. 8. 2026): až budou keepy, města se ruší a keep je JEDEN na kraj. Dřív ne —
jinak zmizí cíl sezóny i celá kapitola a nic je nenahradí.


---

### IV-R Poplatky klanové burzy (zadání uživatele 30. 8. 2026)

Ceník k IV-F. Týká se **obchodu mezi členy klanu**, ne nákupu od hry.

**Kolik:**
- **výbava a dárky: 💠 jádra ZA KUS podle tieru — 6 / 12 / 24** (běžný / epický /
  legendární). Tiery jsou tři, rarit pět — mapuje je existující `GIFT_RARITY_TIER`
  = [0,0,0,1,2], takže obyčejná, kvalitní i vzácná kvalita stojí 6, epická relikvie
  12 a legendární dědictví 24. Sudá čísla schválně: půlka na stranu vychází vždy
  celá (3 / 6 / 12), žádné zaokrouhlování.
- **suroviny: 🪙 zlato ve výši 15 % z celkového objemu obchodu** — objem = **součet
  VŠECH surovin z obou stran** (ne větší strana, ne jeden druh). Přeplacení tím
  poplatek zvedá, ne ředí. Při symetrickém obchodu to vychází hezky: každá strana
  zaplatí 15 % toho, co sama dala.

**Kdo platí:** **OBĚ strany napůl** — nabízející i přijímající, každý polovinu.
U legendárního kusu tedy 12 jader na hlavu, u surovin 7,5 % objemu.

**Jak se to strhává: ÚSCHOVA (escrow) při vystavení nabídky** — rozhodnuto
30. 8. 2026. Nabízejícímu se jeho polovina odečte hned, jak nabídku vystaví,
a **vrátí se mu, když obchod neproběhne** (zruší ho, vyprší, nebo ho nepřijme
nikdo). Přijímající platí svou polovinu při accept. Důvod: kdyby se platilo
oběma až při accept, může nabízející mezitím jádra utratit a obchod spadne
druhé straně pod rukama.

**Proč měna podle zboží:** dělící čára je TRVANLIVOST. Výbava a dárky žijí na ÚČTU
a přežívají sezóny → platí se trvalou měnou. Suroviny jsou sezónní → platí se sezónní.

**Co se tím NEROZBÍJÍ:** zlato se tu za suroviny nekupuje, jen se pálí jako poplatek.
Zásada tržnice („zlato zůstává stranou, jinak by se dalo farmit", `MARKET_RES`)
tedy platí dál — žádný kurz zlato→surovina nevzniká.

**ROZHODNUTO 30. 8. 2026 (potvrzeno uživatelem):**

- ✅ **Zámek předmětu.** Do úschovy nejdou jen jádra, ale i PŘEDMĚT: vystavená
  výbava je zamčená proti nasazení, použití, zušlechtění i rozebrání a vrací se
  stejným pravidlem jako jádra. Bez zámku nabídka zchátrá a accept spadne — nebo
  hůř, kus se rozdvojí.
- ✅ **Zablokovaná jádra musí být VIDĚT.** V účtu „z toho 12 💠 v nabídkách", jinak
  hráč hlásí, že mu jádra zmizela.
- ✅ **Nováček:** uvítací dárek zvednutý ze 120 na **5 000 jader**
  (`ACCOUNT_START_CORES`, v kódu od 30. 8. 2026) — nejlevnější přijetí stojí
  3 jádra na hlavu, takže odříznutý start nehrozí, a nový hráč má rovnou na
  roztočení beden. Staré účty se zpětně nedoplňují.

⚠ **ÚSCHOVA MUSÍ PŘEŽÍT RESTART A VRÁTIT SE PRÁVĚ JEDNOU — jinak je to tiskárna
jader.** Uživatel to označil za exploit a je to nejrizikovější kus celé burzy.
Díry, které to musí ustát:
- **Dvojí vratka.** Dvě zprávy „zruš nabídku" naráz → jádra zpět dvakrát. Obrana:
  vratka visí na PŘECHODU STAVU nabídky, ne na jejím obsahu — jeden atomický
  `UPDATE … WHERE stav = 'vystavena'` a kontrola počtu změněných řádků. Nikdy ne
  „přečti zůstatek → přičti → zapiš".
- **Pád mezi odečtem a uložením nabídky.** Buď zmizí jádra, nebo vznikne nabídka
  zadarmo. Obrana: odečet i vznik nabídky v JEDNÉ transakci.
- **Accept a cancel naráz.** Kupující zaplatí a dostane, prodávající mezitím zruší
  → kus je dvakrát, nebo nikde. Obrana: tentýž stavový automat, jeden vítěz.
- **Nabídka žijící jen v paměti procesu.** Musí být v SQLite u účtů, ne v sezónním
  snímku — nabídky jsou účtové, ne sezónní, a přežívají i konec sezóny.
- **Hotovo, když:** test spamuje cancel/accept přes sebe a po tisíci pokusech sedí
  SOUČET jader všech účtů na jednotku přesně.

**PASTI A DŮSLEDKY:**
- **Kurz surovina→zlato je pořád knob.** 15 % se počítá z objemu v surovinách,
  platí se ve zlatě — default 1:1, dokalibrovat. Všechny čtyři polní suroviny jsou
  si dnes rovné (tržnice mezi nimi směňuje bez rozdílu druhu), takže stačí jedno
  číslo.
- **Zaokrouhlení u surovin.** Jádra vycházejí celá (6/12/24), 15 % z objemu ale ne.
  Zaokrouhlovat NAHORU na stranu — jinak se poplatek dá obejít drobnými obchody.
- **Poměr mezi tiery se zploštil** z 1 : 5 : 10 na 1 : 2 : 4. Vědomé — poplatek je
  odtok, ne ocenění zboží; kdyby měl kopírovat pořizovací cenu, legendárka by proti
  běžnému kusu stála desetinásobek.
- **Poplatek je ODTOK, ne brzda — a je to tak v pořádku, jen ať se od něj nečeká víc.**
  Změřeno z dnešní truhly (400 jader, 3 sloty; slot padá 30 % doplněk, 35 % dárek,
  35 % výbava; váhy rarit [0,0,40,24,6]): jeden náhodný KUS výbavy vyjde na ~380 jader,
  epický kus na ~800 a legendární na ~2 500–4 400. Převod legendárky za 24 jader je
  tedy pod procentem její pořizovací ceny. Brzdou proti slévání z altů zůstávají pravidla
  IV-F — směna jen ve STEJNÉ raritě / stejném tieru a poplatek rostoucí s počtem
  i objemem obchodů za den — ne tenhle ceník.
- **Jádra jsou prémiová měna.** Až se zapnou skutečné platby, je poplatek za obchod
  neškodný (nekupuje se jím nic nového). Ostražitost patří k ROTUJÍCÍMU OBCHODU, kde
  hra předměty tvoří — viz níže.

**Otevřené: rotující denní obchod (rozhodnutí I-3 (i)) NENÍ tímto vyřešený.** Tam
hra předmět VYRÁBÍ, takže cena nesmí být 6/12/24 — to by bylo pod cenou z truhly
(~380 za náhodný kus) a truhla, hlavní odtok jader, by ztratila smysl. Cílený kus
musí stát VÍC než náhodný. Zbývá rozhodnout, jestli se v obchodě platí jádry (pak
padá výhrada, že obchod převádí sezónní měnu na trvalý postup), nebo zlatem.

---

### IV-S Jazyky: angličtina, španělština a překladač v chatu (zadání uživatele 31. 8. 2026)

> ✅ **HOTOVO ve v0.64 kromě překladače do chatu** — viz etapa 12b v části V.
> Text níž je původní zadání; nechává se, protože popisuje ÚVAHU (co se
> překládá a co ne, proč jazyk patří na účet, proč server posílá klíče),
> která platí dál a rozhoduje o každém novém textu, který do hry přibude.

Hra byla **natvrdo česky**. Texty byly vepsané přímo v `js/main.js`,
`js/domov.js` a `js/game.js` — jména rodů a hrdinů, popisy dovedností, kronika,
bojové reporty i chybové hlášky. Nic jako slovník neexistovalo.

**Cíl: čeština + angličtina, ideálně i španělština.** Angličtina je podmínka
launche mimo ČR a SK; španělština je druhý největší zásah za nejmenší práci
navíc, jakmile slovník existuje.

**Co se musí udělat, než se dá překládat vůbec něco:**
- **Vytáhnout řetězce do slovníku** (`t("klic")`) — mechanická, ale rozsáhlá práce.
- **Jazyk patří na ÚČET**, ne do localStorage: hráč se přihlásí z jiného zařízení
  a hra musí zůstat v jeho jazyce.
- **Oddělit JMÉNA od TEXTŮ.** Jména rodů, hrdinů, krajů, předmětů a světa jsou
  vlastní IP Vellaru a **nepřekládají se** — Vellar zůstane Vellar, Popelná
  spálenina zůstane Popelná spálenina. Překládá se to, co něco vysvětluje:
  popisy dovedností, nápověda, hlášky, rozhraní.
- **Server musí posílat KLÍČE, ne věty.** Kronika i bojové reporty se dnes
  skládají na serveru jako hotové české souvětí. Pro překlad musí nést
  `{klic, parametry}` a věta vzniknout až u klienta — jinak by hráč s anglickým
  klientem dostával od českého serveru české reporty.

**Překladač do chatu** (patří k etapě 9, kde chat vzniká): zpráva se posílá
v původním jazyce a příjemce si ji může nechat přeložit. Jakmile je na jednom
světě víc jazyků, je to nutnost — bez něj se rod rozpadne na jazykové ostrůvky
a klan přestane fungovat jako klan. **Otevřené:** kdo překládá (placená služba
vs. model běžící u nás), strop na hráče proti zneužití jako levné API a co
s tím, že překlad zdrží zprávu o vteřiny.

**Kdy:** slovník a angličtina **před launchem** (podmínka etapy 14), španělština
hned za ní, překladač v chatu s chatem samotným nebo kdykoli později.

⚠ **Čím dřív, tím levněji.** Každá další etapa přidá další stovky českých
řetězců a cena vytažení do slovníku roste s velikostí rozhraní, ne s počtem
jazyků. Odkládat to je jediná chyba, která se tu dá udělat.

### IV-V Přechod z kolébky se musí dobýt (zadání uživatele 1. 9. 2026) — ✅ v0.69

Do v0.69 patřil přechod přes dělič rodu OD STARTU: vlastní vrata, která držíš,
dokud ti je někdo nevezme. Nově se musí nejdřív dobýt — vylézt z kolébky je
první objektiv sezóny.

**Měřeno sim bránou, protože přesně tohle už jednou hru rozbilo** (s jedním
přechodem na výseč zůstal rod v kolébce na pěti seedech z osmi):

| varianta | brána |
|---|---|
| přechod patří rodu (do v0.69) | 63/64 = 98 % |
| **oba břehy neutrální** | **53/64 = 83 % ❌ neprošla** |
| oba neutrální + jeden boj místo dvou armád | 54/64 = 84 % ❌ |
| **jen vnitřní břeh neutrální** | **58/64 = 91 % ✅ prošla** |
| jen vnitřní + posádka 80 místo 120 | 58/64 = 91 %, ale 1 porušení ❌ |

**Vzato: neutrální je VNITŘNÍ břeh** (ten v expanzním pásu, tedy skutečná
brána ven). Vnější leží v nedotknutelné kolébce, kam cizí rod stejně nikdy
nevstoupí, takže neutrální být nepotřebuje. Posádka zůstala na kalibrovaných
120 (proti 2 781 u laterálního mostu) a přechod přestal být uzel na dvě armády
s patnáctiminutovou uzávěrou — je to stupeň 1 křivky obtížnosti, ne brána.

⚠ Bez rozhozených přechodů z téže verze by to nevyšlo: tři nezávislá místa
místo jednoho jsou to, co drží bránu nad prahem.

### IV-U Brány prstenců šly obejít rohem — ✅ VYŘEŠENO v0.69 (1. 9. 2026)

> **Vyřešeno návrhem uživatele: ZESÍLIT ZEĎ NA DVĚ POLE.** Je to lepší než obě
> varianty níž — úhlopříčný krok mění Manhattan o 0 nebo ±2, takže přeskočí
> právě JEDNU vrstvu; druhá řada zkrat zavře geometrií, nemění pravidla pohybu
> a nepřidává ani jedno pole, o které se musí bojovat. Brána vede skrz obě
> vrstvy: u vnitřních hradeb chodbou přímo před pevností, u vnějšího prstence
> baštami, které tam klastr velké pevnosti má tak jako tak.
> Ověřeno na 69×69, 461×461 i 955×955: k Trůnu vede cesta, ale ne bez brány
> a ne bez pevnosti. Hlídá to sada v `tests/test-mapa.js`.
> Sim brána beze změny (63/64), otisky map v test-mapr přepsány popáté.

### Původní rozbor

Ověřováno, jestli na velké mapě vůbec vede cesta k Trůnu. **Vede** — průchod
světem 955×955 dá cestu kapitál (356,120) → 356 polí → Trůn (0,0) přes most,
most, baštu, baštu. Brány jsou všechny a ve stejném počtu jako na malé mapě,
jen s většími poloměry: 8 velkých pevností + 32 bašt na vnějším prstenci,
4 pevnosti ve vnitřních hradbách, 64 mostů.

**Ale u toho vypadl nález:**

| | |
|---|---|
| vnější prstenec | ✅ **těsní** — bez dobytí bašty nebo velké pevnosti se dovnitř nedá |
| vnitřní hradby | ❌ **jdou obejít** — u každé ze čtyř pevností se dá projít ROHEM vedle brány |

Změřeno na 69×69, 461×461 i 955×955 — **je to všude stejné, se zvětšením mapy
to nesouvisí.** Příčina je v pravidle „bez řezání rohů" (`rohoviSousedi`):
roh se blokuje, jen když jsou OBĚ mezilehlá pole neprůchodná. Vedle brány je
jedno z nich sama brána (terén `plains`), takže se roh povolí a hráč projde
kolem pevnosti bez boje. Vnější prstenec to nepostihlo jen proto, že velkou
pevnost lemují BAŠTY — rohová pole jsou tam taky bráněné brány.

**Důsledek:** pevnost jako poslední brána k Trůnu se dá minout. Systém
„brány jsou jediné průchody" tedy platí jen pro vnější prstenec.

**Dvě cesty ven** (obojí je malá změna, obojí přepíše otisky map v test-mapr
a chce projet sim bránu):
1. **Lemovat pevnost baštami** jako velkou pevnost — konzistentní s tím, co už
   ve světě je, a rohy se zacpou samy. Změna generátoru.
2. **Nepočítat bránu jako průchozí mezilehlé pole** v `rohoviSousedi` — jeden
   řádek, ale mění obecné pravidlo pohybu, takže se musí přeměřit balanc.

### IV-T Mapa 10× větší — co brání a co to stojí (změřeno 1. 9. 2026)

Otázka zněla: jak reálné je zvětšit mapu ještě desetkrát. Odpověď je ZMĚŘENÁ,
ne odhadnutá — sonda staví světy různých velikostí a měří generátor, tik,
paměť i snímek; profil zásobníku říká, kam čas jde.

**Nejdřív nález, který platí UŽ DNES:** dnešní strop 461×461 se na ostrém
VPS do tikového rozpočtu NEVEJDE. Číslo „TIK 304 ms (rozpočet 1 000)"
v CLAUDE.md je z vývojového stroje. Na VPS (1 CPU, QEMU) je to **1 816 ms**,
tedy 1,8× přes rozpočet. VPS je 7–10× pomalejší než vývojový stroj a měřit
strop škálování na vývojovém stroji je proto past.

#### Kam ten čas jde

Profil zásobníku (R 517, 1,07 M polí): **88,7 % tiku je `aiTurn`**, a v něm
`isAdjacentToFaction` → `sousediZaboru` → `tileAt`. AI hledá kandidáty na
zábor tak, že projde CELOU mapu a u každého pole se ptá „sousedí se mnou?".
To je ~16 vyhledání v `Map` přes skládaný řetězcový klíč na pole, krát osm
rodů, krát každý tik: na milionové mapě **136 milionů vyhledání za tik**.

⚠ **Levné filtry jsou přitom AŽ ZA tím drahým.** Test „je pole v dosahu
některé z mých základen" (`gridDist <= REACH`, čistá aritmetika, REACH je
zastropovaný na 40) stojí v původním pořadí až devátý, takže drahý soused
se počítá i pro pole na druhém konci světa.

#### Přehození jednoho filtru = 6–30×

Přesun `zakladny.some(b => gridDist(b, t) <= REACH)` PŘED
`isAdjacentToFaction` (tři řádky, obojí jsou čisté predikáty):

| kde | polí | dnes | s přehozeným filtrem | bez AI (podlaha) |
|---|---|---|---|---|
| vývoj R 230 | 212 521 | 255 ms | **32 ms** | 16 ms |
| vývoj R 517 | 1 071 225 | 2 839 ms | **178 ms** | 78 ms |
| vývoj R 729 | 2 128 681 | 7 620 ms | **253 ms** | 130 ms |
| **VPS R 230** | 212 521 | **1 816 ms** | **282 ms** | 167 ms |

**Je to beze změny chování** — ověřeno hashem celého světa po 400 ticích na
R 34 i R 115: bitově shodné. Proud `rng()` se nehne, protože tik odmítnutý
podle dosahu žádný los nespotřeboval ani v původním pořadí.

#### 10× PLOCHA (1459×1459, 2,13 M polí, ~23 400 hráčů)

| co | dnes | po opravě AI | strop |
|---|---|---|---|
| tik na VPS | ~14 000 ms | ~2 200 ms → ~1 000 ms, když AI přestane skenovat celou mapu | 1 000 ms |
| generování mapy | 12,9 s vývoj / ~100 s VPS | totéž | jednorázově, snesitelné |
| paměť dlaždic | 178 MB haldy (88 B/pole) | totéž | 2 GB na VPS |
| **snímek sezóny** | JSON **239 MB** → gzip 18,3 MB, 703 ms vývoj / **~5,6 s VPS** | totéž | běží každých 10 tiků |
| **města členů** | 319 ms na člena (roste s mapou!) → 23 400 hráčů = **2,1 h vývoj / ~16 h VPS** | totéž | start sezóny |

Tik se tedy opravit dá, ale **dvě věci jsou horší než tik**:
1. **Umístění města člena je O(mapa) na člena**, takže start sezóny je
   O(hráči × pole) — kvadratický v měřítku světa. Už dnes stojí plná sezóna
   2 336 hráčů ~60 s na vývojovém stroji (~8 min na VPS); na 10× ploše
   je to hodiny. Chce to prostorový rejstřík, ne průchod mapou.
2. **Snímek je jeden JSON řetězec.** 239 MB se skládá a gzipuje na tikovém
   vlákně; na VPS to je pětivteřinové zaseknutí každých deset tiků.

#### 10× STRANA (4610×4610, 21,3 M polí, ~234 000 hráčů) — ne

Tady nejde o ladění, ale o architekturu:
- JSON snímku by měl ~2,4 GB, ale **strop řetězce ve V8 je 512 MB** —
  `JSON.stringify` prostě spadne. Persistence by musela být binární
  nebo po částech.
- Jen dlaždice by zabraly ~1,8 GB haldy na stroji, který má 2 GB celkem.
- Podlaha tiku (i s vypnutou AI) ~1,3 s vývoj / ~10 s VPS.
- Města: 234 000 hráčů × 3,2 s = 208 h.

#### Co by se muselo udělat, kdyby se do toho šlo

Pořadí podle poměru dopad/práce:
1. **Přehodit filtr v `aiTurn`** — tři řádky, 6× na VPS, bez změny chování.
2. **AI ať nechodí přes celou mapu**: kandidáti jen z okolí základen
   (REACH je 40, takže jedna základna = nejvýš 81×81 polí) a `aiZakladny`
   ať drží seznam výsp místo průchodu mapou. Tím se AI přestane starat
   o velikost světa úplně.
3. **Prostorový rejstřík pro umístění města** — jinak start sezóny nepůjde.
4. **Snímek po částech** (nebo binárně) — jinak zamrzá tik a nad 4 M polí
   se o strop řetězce rozbije úplně.
5. **Dlaždice jako typová pole** místo objektů (88 B/pole → ~20 B/pole);
   teprve tohle otevírá desítky milionů polí.
6. **Rychlejší jádro VPS.** Tik je jednovláknový, takže víc jader nepomůže —
   pomůže jen rychlejší jedno.

#### „Nedalo by se to vykreslovat postupně?" — vykreslování není problém

Klient už postupný JE a na hrdlo nesahá: AOI posílá místo celé mapy jen okolí
míst, kde hráč opravdu je (21 MB → ~0,6 MB na hráče, a okruh se s mapou
prakticky nemění — 3 352 polí na 69×69, 6 161 na 461×461, tedy 45× větší svět
za dvojnásobný okruh), kreslí se výřez kolem kamery a 3D modely se stahují až
při prvním výskytu. Změřeno: s vypnutou AI stojí tik na 461×461 16 ms.
**Zasekává se server, ne kreslení.**

#### Číslo, které vysvětluje všechno

Na mapě 461×461 s 88 aktéry, měřeno 120 tiků rozehrané sezóny:

| | |
|---|---|
| změněných polí za tik | **medián 0**, průměr 0,1, maximum 3 |
| běžících pochodů a staveb | ~25 |
| polí, kterých se tik dotkne | 212 521 × 8 rodů ≈ **1,7 M** (a v nich ~27 M vyhledání v Mapě) |

Přepočítáváme tedy celý svět každou vteřinu, abychom obsloužili **desetinu
změněného pole** a pětadvacet běžících odpočtů.

#### Jak to dělá LotR: Rise to War a celý ten žánr

(Archiv předlohy velikost mapy nezaznamenal, ale na tom nezáleží — velikost
neumožňuje hardware, umožňuje ji model běhu.)

- **Dlaždice NETIKAJÍ.** Pole je pasivní záznam, který nedělá nic, dokud se
  ho někdo nedotkne. Mapa může mít miliony polí, protože je to jen úložiště.
- **Suroviny se počítají LÍNĚ, až při čtení:**
  `stav = uložený stav + rychlost × (teď − naposledy)`. Sklad, který nikdo
  neotevřel, nestál procesor ani jednou.
- **Pochody, stavby a výcvik jsou NAPLÁNOVANÉ UDÁLOSTI** ve frontě podle času
  („dorazí v T"), ne smyčka přes mapu. Obsluhuje se jen to, co právě dozrálo.
- **Nikdo neskenuje mapu.** Aktéři jsou lidi a ti kliknou párkrát za minutu;
  osm AI rodů, které si každou vteřinu odvozují obraz světa znovu, tam nejsou.

Cena tedy roste s **počtem akcí za vteřinu**, ne s počtem polí. Milion polí
a 20 000 hráčů udělá řádově stovky událostí za vteřinu — to je nic.

#### „A co AI úplně vymazat?" — pomůže tiku, ne mapě

Nejdřív rozlišit dvě věci, které se snadno slijí:

- **VYGENEROVAT** mapu (jednorázově při startu sezóny) — s AI to nemá
  společného vůbec nic. Generátor sype terén, žíly, prstence a keepy;
  na 10× ploše stojí 12,9 s (vývoj) / ~100 s (VPS) a smazání AI ho nezrychlí
  ani o milisekundu.
- **UTÁHNOUT** mapu (každou vteřinu znovu) — tady AI drží dnes 88,7 % tiku.

Změřeno na 1459×1459 (2,13 M polí, 10× dnešní plocha):

| | tik na vývoji | přepočet na VPS (×8) |
|---|---|---|
| dnes | 7 620 ms | ~60 000 ms |
| přehozený filtr (3 řádky) | 253 ms | ~2 000 ms |
| **AI úplně pryč** | **130 ms** | **~1 040 ms** |

**Smazání AI tedy přidá jen 1,95× nad to, co dá přehození filtru** — a ani
tak se 10× plocha na dnešním VPS do rozpočtu 1 000 ms nevejde. Tik totiž
roste s mapou i BEZ AI (16 ms → 130 ms při 10× polí): zbývají `prehledAkteru`,
`computeVisibility` a průchod v `tickWorld`.

A hlavně: **tři ze čtyř stropů to neřeší vůbec** — generátor (výš), umístění
měst členů (O(mapa) na hráče, na 10× ploše hodiny) a snímek sezóny (239 MB
jednoho JSON řetězce). Ty zůstanou úplně stejné.

**Cena v návrhu je přitom vysoká.** AI je dnes sedm z osmi rodů: bez ní
zůstane prázdný svět, sólo hra (`index.html?sezona=1`) nemá proti komu hrát
a statistická brána `sim-brana.js`, která měří právě postup AI, ztratí smysl —
přijdeme o jediný automatický test celé hry. Sezóna 4 má zatím dvě přihlášky;
bez AI by to byla mapa se dvěma hráči a ničím jiným. (Neutrální posádky polí
AI NEJSOU — ty jsou pasivní data dlaždice a zůstávají, takže dobývat by bylo
co. Chybět by chyběl protivník, který sám expanduje.)

**Rozumný střed** místo mazání: AI ať se nedívá na celou mapu, ale jen na
okolí svých základen (REACH je 40, takže jedna základna = nejvýš 81×81 polí).
Tím přestane AI velikost světa vnímat úplně a dostaneme se skoro na těch
130 ms — se všemi osmi rody na mapě. Etapa 13 („výměna AI za hráče") pak
ubírá AI postupně tak, jak přibývají lidi, místo skokem.

#### ✅ UDĚLÁNO (v0.68, 1. 9. 2026) — stupeň A je hotový

Zadání znělo „udělej, abychom se vešli na mnohem větší mapu; AI klidně vymaž,
ale počítej s tím, že ve hře vůbec nebude". Uděláno obojí, jen jinak, než to
vypadalo: **AI se nemazala, protože měření říká, že by to nestačilo** (smazání
dá 1,95×, kdežto zbavit AI skenu mapy dá 30×) — místo toho přestala AI
o velikosti světa vědět a přibyl přepínač `VP_BEZ_AI=1` pro svět bez ní.

**Strop: 461×461 → 1459×1459** (212 521 → 2 128 681 polí, 2 336 → 23 408 hráčů).

Zmizelo šest průchodů celým světem za tik: kandidáti AI, hledání výsp, odpočty
polí v `tickWorld`, otisky pro deltu na serveru, mlha na serveru a hledání
místa pro město člena. K tomu snímek sezóny po dávkách, přírůstkově a rozepsaný
přes víc tiků. Detaily, tabulky a pasti jsou v `CLAUDE.md`.

**Na ostrém VPS: tik 461×461 z 1 816 ms na 123 ms; na desetinásobné mapě
391 ms.** Chování se nezměnilo — hash světa po 400 ticích je bitově shodný
a sim brána drží 63/64 (98 %).

**Co ze seznamu níž zbývá:** bod 5 (dlaždice jako typová pole) — teprve ten
otevírá desítky milionů polí. Dnešní strop drží PAMĚŤ ostrého VPS (2 GB),
ne kód: na stroji se 4 GB jde `MAP_R_MAX` zvednout na 1035 (47 000 hráčů)
změnou jediného čísla.

#### Dva stupně, ne jeden

**Stupeň A — dohledná práce (body 1–4 výš).** AI ať nechodí přes celou mapu,
prostorový rejstřík pro města, snímek po částech. Otevírá **10× plochu**
a opravuje i dnešek.

**Stupeň B — a tohle je přesně ta „postupnost", jen na serveru:** pasivní
dlaždice + líné suroviny + fronta událostí místo tiku přes svět. Je to přepis
jádra, zato po něm velikost mapy skoro přestane hrát roli a strop se přesune
k paměti a persistenci. ⚠ Odemyká i něco jiného než velkou mapu: **tik
přestane růst s počtem hráčů**, což je dnes druhá polovina téhož stropu.

**Závěr:** 10× plocha je reálná a body 1–4 jsou dohledná práce. 10× strana
reálná není bez výměny reprezentace světa a persistence, což je přepis jádra,
ne knob. A ať se do toho půjde nebo ne, **bod 1 se vyplatí udělat hned** —
opravuje totiž i dnešní stav, kde nejvyšší povolená mapa na ostrém železe
tikový rozpočet překračuje.

---

---

## ČÁST V — ETAPY (přepsáno 30. 8. 2026)

Dvě železná pravidla pořadí:

1. **Nic sociálního nemá smysl dřív, než věci přežijí restart serveru.** Denní
   hlasování, hodinové odpočty raidů, nabídky na burze a offline reporty jsou
   všechno stavy, které dnes žijí jen v paměti procesu.
2. **Bojový model musí předcházet světovým cílům.** Křivka 235 armád (IV-K) je
   vyladěná proti stropu velení; jakmile se velení přebásní z 935 na 5 200 CP
   (IV-M), byla by všechna čísla keepů k zahození. Nemá cenu ladit obtížnost
   proti měřítku, které se za týden vynásobí pěti a půl.

### ETAPA 5 — Provoz a persistence — HOTOVA (v0.45–v0.51)

VPS, doména warofash.com, HTTPS/WSS s automatickým certifikátem, systemd,
denní zálohy · účty v SQLite · nesmrtelnost sezóny (snímek každých 10 tiků
i při vypnutí) · reporty per hráč se schránkou, stavem přečteno na účtu
a stropem 40 na hráče · permessage-deflate (−88 % na drátě) · e-mail
s ověřením registrace a resetem hesla přes Resend.
Zprovozněno naostro 30. 8. 2026: Resend má ověřenou doménu, klíč je na serveru
a ověřovací i resetovací maily chodí.
### ETAPA 5 — Provoz a persistence (blokuje všechno ostatní)
VPS, doména, HTTPS/WSS, systemd, zálohy · účty do **SQLite** (migrace
accounts.json) · e-mail: ověření registrace a reset hesla · **nesmrtelnost
sezóny** (průběžné ukládání stavu + resume po restartu) · **reporty per hráč**
se stavem přečteno a stropem per aktér · permessage-deflate.
**Hotovo, když:** restart serveru nezmění nic, co hráč vidí — rozehrané
hlasování, načaté okno zranění ani nabídka na burze se neztratí.

### ETAPA 5b — Domovská síň („Bag End") — VĚTŠINA HOTOVA (v0.47–v0.48)

**Hotovo:** uvítací stránka bez přihlášení · domov se čtyřmi záložkami
(Sezóna / Síň hrdinů / Výbava / Profil) · rozvrh sezón s pevným termínem,
odpočtem a přihláškami za konkrétní frakci · výbava a hrdinové dostupní
mimo běžící hru. **Zbývá:** výsledky minulých sezón a historie v profilu
(nemá se z čeho vzít, dokud první sezóna nedoběhne) a kovárna doma.

**ODDĚLIT PŘIHLÁŠENÍ OD REGISTRACE** — ✅ HOTOVO v0.55 (31. 8. 2026):
stav `accRezim` a dvě záložky v lobby i na domově; přihlášení chce jméno
a heslo, založení síně navíc e-mail. Jedno tlačítko místo dvou, Enter odesílá,
zapomenuté heslo bere jen jméno účtu. Původní zadání: Dnes je
to jeden formulář a e-mail se plete do obou. Správně:
- **Přihlášení: jen jméno a heslo.** Nic víc. Kdo se vrací, nemá po sobě
  nechat vypisovat adresu, kterou už jednou zadal.
- **Registrace: jméno, heslo A e-mail** (od v0.51 povinný, síň je do
  potvrzení zamčená).
- Jsou to dvě různé obrazovky, ne jedna se skrytým polem — už proto, že se
  liší i chybové hlášky („špatné heslo" vs „jméno je zabrané") a že
  registrace končí větou „poslali jsme ti ověřovací odkaz", kdežto
  přihlášení pouští rovnou dovnitř.
- Hlídat: účty z doby před v0.51 e-mail nemají a přihlásit se musí dál —
  migrace jim nastavuje `emailOvereno = !acc.email` (viz CLAUDE.md).
Dnes je všechno nalepené na jedné lobby obrazovce: uvítání, přihlášení, výběr
strany, truhly, sklad i Síň hrdinů. Pro veřejný server to musí být skutečný
domov, kam se hráč vrací MEZI sezónami a kde tráví čas, i když zrovna žádná
neběží.

- **Uvítací stránka (bez přihlášení).** Co je Válka popela, svět Vellar, osm
  rodů, obrázky. První dojem pro člověka, který přišel z odkazu a nic neví.
  Odsud registrace a přihlášení.
- **Domov po přihlášení.** Rozcestník: běžící sezóna (skočit zpátky do hry),
  přehled sezón k připojení s časem startu a obsazeností, výsledky minulých
  sezón (Koruna popela, body činu).
- **Výbava mimo hru.** Sklad, kovárna, truhly, Síň hrdinů a sestavy jdou
  spravovat v klidu doma, ne jen v běžící sezóně — hrdinové a kusy jsou
  trvalý majetek účtu, tak ať mají trvalé místo.
- **Profil.** Jméno, statistiky, sbírka hrdinů, historie sezón.

**Hotovo, když:** hráč, který ještě nikdy nehrál, přijde na warofash.com,
pochopí co to je, založí si účet, projde si hrdiny a výbavu a přihlásí se do
nejbližší sezóny — a nikdy přitom nemusí vidět mapu běžící hry.

### ETAPA 6 — Boj, jednotky a hrdinové (velký přepočet) — HOTOVÁ (v0.52)
Všechno, co sahá na soubojový engine a na měřítko síly — musí se udělat NARAZ,
protože to celé visí na týchž testech (test-boj sada 8, test-stromy sada 5,
test-rastr 41 asercí). Kotvy, které se přeměřují, drží přepínač
`tests/etapa6.js`; podrobnosti a pasti jsou v CLAUDE.md.
- ✅ **Přední a zadní linie** (IV-N): mellee nedosáhne na střelce přes clonu; jízda
  obchází tenkou clonu, práh se měří v CP. (`rada`, `dosahne`, `PROLOM_POMER`)
- ✅ **Velení → ~5 200 CP na padesátce** místo 935. Rebase ekonomiky: posádky,
  ceny, verbovací dávka, žold, převodníky poškození hrdiny, dvanáct prahů AI.
  ⚠ **PŘEHODNOCENO 31. 8. 2026 (v0.63, zadání uživatele):** rebase etapy 6
  škáloval celou křivku jedním koeficientem (1112 + 83/úr.), takže hrdina
  1. úrovně dobyl ⚔60 prakticky bez ztrát a progres neměl kde vzniknout.
  Křivka je nově **300 + 100 za úroveň** podle původního záměru plánu; vrchol
  zůstal (úr. 50 = 5 200 ≈ 5 179), takže se keepy ani brány nepřepočítávaly.
  Měřením se potvrdilo zadání „⚔1 lehké, ⚔10 předpokládané, ⚔15 obtížnější"
  a odhalilo se, že dostředivý strop AI platil jen pro BLOKY — po opravě
  brána 61/64 a AI dobývá VÍC expanzní půdy než dřív. Podrobnosti v CLAUDE.md.
- ✅ **Práh obrany 100 CP** (IV-M) — prázdný batoh přestal být nejlevnější zeď.
- ✅ **Osm vlajkových T4** (IV-M): výdrž místo výstupu, staty odvozené z rodu,
  odemyká kasárna 4. **Formace zůstávají TŘI** (rozhodnutí uživatele 30. 8.) —
  hráč si vybírá SLOŽENÍ přetažením vycvičených jednotek do tří slotů.
- ✅ **Schopnosti vlajek**: taunt (trol/ent, 3 kola — obranný bonus musel dolů,
  jinak z něj strop kol dělá nedobytnou zeď), aura šílenství 25 % Demon Prince
  (platí i na vlastní řady), lifesteal, konverze nekromanta (ZÁMĚRNĚ jen na
  bitvu — vzkříšení se domů nevrátí), škálování warbosse zlatem se stropem.
- ✅ **Formace v reportu**: sestavy obou stran s rolí, střety (kdo na koho mířil)
  a rozpad zbytku po formacích v každém kole.
- ✅ **Kapacita sezóny ze ZEMĚ, ne z počtu měst** — a svět se při startu sezóny
  šije na míru počtu přihlášených (48 lidí → 69×69, 800 → 271×271). Dřív
  slíbený strop 80 polí na hráče proti reálným 18 ve výseči.
- ✅ **AI vlajky staví i nasazuje** (kasárna 4 v prioritách, trojice druhů,
  verbování v bodech velení místo dávek).
- ✅ **Budovy pro dlouhou sezónu (IV-O)**: hlavní budova na 8 úrovní, doby stavby
  jako podíl sezóny (336h = 336× delší), akademie +100 velení za úroveň místo +1.
- ✅ **Druhý rod (IV-O)**: od hlavní budovy 8, jednou za sezónu, jen vlastní strana,
  jen základní jednotky. Vlastní klíče *2, aby šla cizí clona před vlastní střelce.
- ✅ **Tier jako osa síly** (+5 % základu za stupeň), **legendárka = archetyp rodu**
  (mezi NESTARTOVNÍMI hrdiny — starter musí zůstat běžný), nový rys **healer**
  (sedmý hrdina každého rodu, 56 celkem).
- ✅ **Reset sezóny**: úroveň, zkušenosti a body z úrovní se nulují; hvězdy,
  odemčení a výbava zůstávají. Sezónní je síla, trvalá je sbírka.
- ✅ **Pavučina counterů přeměřená celá** — parita jednotek zpět na ±3, scéna
  rastru přeškálovaná s rebasem (150 → 830 CP/slot), durgarův signature
  přeladěn. Bez výhry nikdo, bez porážky jen aldar. `PREMERUJE_SE` vypnuto.
- ✅ **Pořadí obránců**: neutrální objektiv se brání od nejslabšího (vlny 0,4/0,6
  posádky, slabší velitel první), hráčský stoh vede ten, kdo dorazil první.
  Sekvenční boj „jedna bitva = jeden obránce" zůstává v etapě 7 (IV-L).
- **Tier jako osa síly** (+~5 % základu za tier), **legendárka = archetyp rodu**,
  nový rys **healer** (léčí armádu v bitvě).
- **Reset sezóny**: síla se nuluje, sbírka zůstává. Delší sezóny.
- **Budovy pro dlouhou sezónu** (IV-O): víc úrovní, vyšší ceny, doby stavby jako
  podíl sezóny, přeškálovaná akademie, hlavní budova na 8+ a s ní volba druhého
  rodu k verbování.
- **Pavučina counterů se naměří celá znovu** — s liniemi je to jiná hra.
**Hotovo, když:** rastr balancu má osu tieru, žádná frakce není bez porážky
a nikdo bez výhry, a křivka dobývání sedí na nové měřítko.

### ETAPA 7 — Svět s cíli (raid smyčka „v malém")
Testovatelné na dnešní mapě 69×69, stejným způsobem jako etapa 4a.
- **Rozdělení výsečí na startovní zónu a nativní expanzi** (IV-K): z kolébky
  vede jediný crossing dovnitř, do cizí kolébky se nepřítel nedostane vůbec.
- **Regionální keep 5×5**, křivka 20× lvl 30 → 70× lvl 50 (IV-K).
- **Neutrální obránci jsou HRDINOVÉ** vyzbrojení podle svého tieru (IV-L).
- **Okno zranění** 15 min / 60 min, postup se sčítá napříč útočníky.
- ✅ **Stohování hrdinů na poli** (IV-L, v0.53): jedna bitva = jeden obránce,
  poražený se stahuje, počet vidět, sílu ne, pořadí podle příchodu. Poslední
  obránce bojuje spolu s posádkou pole, takže N obránců = N zátahů.
- **Rally obrazovka** — bez ní mechanika nefunguje.
- **Bojový log kolo po kole** (IV-P, zadání uživatele 30. 8.): kdo v kole jedná
  a v jakém pořadí, koho trefil, za kolik, kolik vyléčil a jaké buffy zrovna
  běží a jak dlouho. Dělat spolu s rally obrazovkou — obojí je čtení bitvy.
- Zrušení generování neutrálních měst + přepis kapitol.
**Hotovo, když:** keep se nedá dobýt sólo a skupina na něm vidí sčítaný postup
i odpočet do resetu.

### ETAPA 8 — Klan jako entita — ✅ HOTOVO v0.56 (31. 8. 2026)
Klanový objekt uvnitř rodu · vůdce + 5 důstojníků + pravidla rady · úroveň klanu
z kumulativní síly · **třetí úroveň vlastnictví pole (rod → člen → klan)** ·
klanové pevnosti · vyhazov jako stav.
**Hotovo, když:** klan postaví pevnost, člen z ní postaví výspu mimo svůj dosah,
a vyhozený hráč přestane být bráněn spoluhráči. — **splněno a ověřeno**
(`tests/test-klany.js` 79 asercí, `tests/int-klany.js` po drátě, brána 64/64).
Rada je připravená (`radaProsla`), ale zatím ji nikdo nevolá — hlasování přijde
s etapou 10. Přihláška do klanu neexistuje: přijímá důstojník ze seznamu rodu.

### ETAPA 9 — Komunikace a klanová ekonomika — ✅ HOTOVA (v0.57–v0.59)
- ✅ **Chaty (svět / klan / soukromý)** — v0.57, rozesílané po kusech jako
  reporty: co hráč nesmí vidět, se mu VŮBEC NEODEŠLE. Prodleva proti zaplavení
  visí na aktérovi, ne na spojení.
- ✅ **Reporty dělené moje/klanové** — v0.57; report se nekopíruje, rozlišení
  dělá klient podle `ucastnici`.
- ✅ **Kronika jako serverový kanál** — v0.58. Zároveň se tím zavřela DÍRA:
  do té doby šel celý `G.log` každému hráči a filtroval se až v prohlížeči,
  takže se dala číst kronika cizího rodu přímo z drátu. Tři úrovně adresáta
  (svět / rod / osobní), rozesílání po kusech, záložky 🌍 Svět a ⚔ Rod.
- ✅ **Uvítací jádra se vyzvedávají ověřovacím odkazem** (v0.58, zadání
  uživatele) — jeden mail vyřídí potvrzení adresy i dárek 5 000 💠.
- ✅ **Klanová burza** — v0.59, tři přihrádky, ceník i úschova podle IV-R.
  „Hotovo, když test spamuje cancel/accept přes sebe a součet jader sedí na
  jednotku" SPLNĚNO: `tests/test-burza.js` sada 8 (200 nabídek × 5 operací
  v náhodném pořadí) + `tests/int-burza.js` po drátě.

Původní zadání: Chaty (svět / klan / soukromý) · Kronika jako serverový kanál ·
reporty dělené moje/klanové · klanová burza se třemi přihrádkami a poplatkem rostoucím s počtem
i objemem (**výbava a dárky 6/12/24 jader za kus, suroviny 15 % objemu ve zlatě;
platí obě strany napůl, nabízející v úschově** — IV-R) ·
**dárky jako předměty** (jediná položka nezávislá na všem ostatním —
dá se předsunout kamkoli) · **překladač zpráv v chatu** (IV-S) — bez něj se
vícejazyčný svět rozpadne na jazykové ostrůvky.

### ETAPA 10 — Politika: války a spojenectví — ✅ HOTOVA (v0.60, 31. 8. 2026)
Rozhodující klan s denním přepočtem v 6:00 · hlasování rady + členů s 10%
minimem · vyhlášení → odpočet → válka · oboustrannost · minimální délka války
3 dny · mír okamžitý po schválení a 3 dny klidu · jeden spojenec na rod se
sdíleným dohledem, průchodem i sousedstvím pro zábor.

**Provedeno beze zbytku, s jedinou vědomou odchylkou:** „denně v 6:00" je
PERIODA odvozená z délky sezóny (`SEASON_TICKS / 14`), ne hodina na zdi — hra
běží na ticích a na hodinové testovací sezóně by pevná hodina nikdy nenastala.
Na cílové čtrnáctidenní sezóně vycházejí čísla z plánu přesně (24 h / 6 h /
3 dny / 3 dny). Spojenectví se propisuje jediným místem (`jeMoje`), takže ho
automaticky umí hráč, UI i AI. `declareWar` (cesta AI) nově jede přes tutéž
`zacniValku` — dva mechanismy války by se rozešly; brána zůstala 64/64.
Testy: `tests/test-politika.js` (59 asercí).

### ETAPA 11 — MMO měřítko — ✅ HOTOVA (v0.61, 31. 8. 2026)
Mapa ~460×460 (knob existuje) · **AOI po hráčích** · **chunkovaná 3D stavba
(InstancedMesh po 16×16)** · umisťování 100 měst na rod · dohled 5 a sdílení
vidění po klanu · druhý režim mapy podle vztahů.

**Hotovo:** mapa 461×461 (`MAP_R_MAX` 230), AOI (plný snímek 21 MB → 0,6 MB
na hráče, okruh se s mapou prakticky nemění), 100 měst na rod ověřeno
(1,5 s jednorázově), dohled 5, vidění sdílené po klanu místo po celém rodu,
mapa vztahů. **Chunky ZÁMĚRNĚ NE** — s AOI klient nikdy nedrží víc než svůj
okruh (~6 000 polí) a renderer od v0.33 kreslí jen výřez, takže by chunky
přidaly volání kreslení bez čeho ušetřit (přesně jak plán předpokládal).

**Dva nálezy, které by MMO měřítko zabily dřív než síť:**
1. `incomeOf`/`pocetPoli`/`scoreClena` skenovaly celou mapu PRO KAŽDÉHO
   aktéra — při 800 hráčích 1 800 ms na tik. Nově jeden průchod za tik
   (tik 490 → 304 ms na 461×461).
2. `REACH` rostl s mapou (143 polí na 461×461), i když hráč pořád drží nejvýš
   216 polí — svět je větší kvůli POČTU HRÁČŮ, ne kvůli dosahu jednoho.
   Zastropováno na 40; na 69×69 zůstává 20, takže brána drží 64/64.
**Proč až tady:** dnes je to 104 volání kreslení a 6,9 M trojúhelníků bez
jakéhokoli cullingu; na velké mapě ~420 tis. instancí a ~320 M trojúhelníků na
snímek. Chunky dnes zavést NELZE — 19 chunků × ~20 druhů modelů by dalo
čtyřnásobek volání za úsporu, kterou si můžeme dovolit.

### ETAPA 12 — Vzhled — ✅ HOTOVÁ KROMĚ DENNÍHO CYKLU (v0.56–v0.66)
SSAO → světlo a grade → živá voda → proti tapetě (v0.56) → tilt-shift (31. 8.)
→ vzdušná perspektiva a cesty (v0.64) → **3D figurky hrdinů (v0.66)** — 49 modelů
z týchž blenderových stavitelů jako portréty, barva ve vrcholech, načítání až na
vyžádání, kontaktní stíny v jedné instancované dávce.

**Zbývá z bodu 7: denní cyklus** — slunce má dnes pevný směr i barvu.
⚠ Není to jen otáčení světla: stínová mapa se od v0.56 přepočítává jen při pohybu
kamery (shadowMap.autoUpdate = false) a IBL prostředí se peče při startu — obojí
by muselo dostat přepočet na změnu času, jinak zůstanou stíny rána na scéně večera.

**Výtvarné dluhy, které zbývají:** sedmý hrdina každého rodu (ranhojič z v0.52)
nemá v Blenderu stavitele, takže se ve 3D kreslí dál ploše; keep 5×5 a klanová
pevnost jedou na modelu velké pevnosti.

### ETAPA 12b — Jazyky — ✅ HOTOVÁ (v0.65)
**Hotovo, když:** *anglický klient dostane od českého serveru anglický bojový
report a v kronice nezůstane česká věta.* — **splněno a ověřeno v prohlížeči**
(sada 6 v `tests/test-jazyky.js` to hlídá i strojově).

Hra je celá ve **třech jazycích** (čeština / angličtina / španělština):
- **Slovník** `js/jazyky.js` — `tx()`, dosazování `{parametrů}`, **vnořené
  klíče** (parametr smí být sám `{klic,param}`), záložní čeština, chybějící
  klíč hlásí `⟨klic⟩`. **1 983 klíčů × 3 jazyky.**
- **Server posílá KLÍČE, ne věty** — kronika (118 hlášek), bojový report
  (události kol, před bojem i po něm), jméno pole i jméno obránce.
- **Obsahové tabulky** (budovy, jednotky, vylepšení, dovednosti, kapitoly,
  checkpointy, rysy, rarity, truhly, pasivky…) se při přepnutí jazyka
  přepíšou ze slovníku funkcí `prepisTabulky()`; čeština v nich zůstává jako
  PŘEDLOHA, takže nová budova jde přidat bez zásahu do tří jazyků.
- **Rozhraní ve hře je na nule** — `node tests/pokryti-jazyku.js` říká
  `js/main.js … zbývá 0`.
- **Čísla a doby** jdou podle jazyka (`cisloJazyk()`, `fmtDobu`).
- **Jména Vellaru se nepřekládají** (rody, hrdinové, kraje, předměty, dárky,
  neutrální velitelé, jméno světa) — hlídá to sada 4 v testu.

**Testy:** `tests/test-jazyky.js` **50 asercí** (mj. sada 6 = kritérium etapy,
sada 7 = tabulky se vrátí do češtiny i po třech přepnutích, sada 8 = formát
čísel), `node tests/pokryti-jazyku.js` jako měřič.

**Vědomý rest:** překladač do chatu (hráčské zprávy) — samostatná věc, čeká
na rozhodnutí o službě (viz IV-S).

### ETAPA 13 — Plunder, bandité, výměna AI za hráče
Beze změny podle ČÁSTI II-C2. Plunder je **ventil agrese pro hráče na stropu
území** — se stovkou hráčů na rod to přestane být kosmetika.

### ETAPA 14 — Předregistrace, beta, launch
Beze změny podle ČÁSTI II-D. **Podmínka: hotová angličtina (etapa 12b)** — launch
mimo ČR a SK nemá bez ní smysl.

**Po každé etapě jako dosud:** `node tests/vse.js`, statistický sim gate,
MP smoke test, aktualizace CLAUDE.md + PLAN.md + paměti.

**Sim brána PŘEFORMULOVÁNA 31. 8. 2026** (`tests/sim-brana.js`, dřív
`sim-etapa3.js`). Staré kritérium se jmenovalo „AI dosáhne na Trůn", ale nikdy
Trůn neměřilo — měřilo ZÁKLADNU do REACH od středu, což po etapě 7 znamená
frontu protlačenou přes celý expanzní pás k vnějšímu prstenci. Kritérium tedy
zůstalo a přibylo k němu „prorazil dělič" (dobytá půda v expanzi mimo startovní
přechod) a „ekonomika neusnula".

⚠ **Na keep se NEGATUJE a je to změřené, ne odhad.** Hrdina AI je na konci
hodinové sezóny na úrovni 14–16 se stropem velení ~2 690 CP, kdežto filtr
`needed * 0.85 > maxCap` pustí bastion od 4 183 CP, most od 4 808, velkou pevnost
od 6 971 a keep až od 20 742. **AI tedy neprojde ani jednou branou vnějšího
prstence** — 0/64 dobytých bran, 0/64 polí v mezikruží, 0/64 načatých keepů,
0/72 krajů s držitelem. Keep je od návrhu skupinový cíl, ale to, že AI nedosáhne
ani na bastion, je věc k rozhodnutí: buď se AI naučí RAID SMYČKU (útočit
opakovaně na cíl nad svůj strop a sbírat postup v okně zranění — přesně to, co
etapa 7 přidala pro hráče), nebo AI zůstane navždy zavřená ve své výseči a
laterální PvP z v0.53 bude jen pro hráče. Brána obojí měří a vypisuje.
