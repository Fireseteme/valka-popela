# Válka popela — design dokument

Strategická hra o dobývání území na sdílené čtvercové mapě „na koso", inspirovaná mechanikami
LotR: Rise to War. Vlastní svět, vlastní jména, vlastní rasy — žádné převzaté IP.

## Vize

Pomalá, tahově-časovaná strategie: hráč rozvíjí své hlavní město, verbuje armády
a pole po poli rozšiřuje souvislé území směrem ke středu mapy, kde stojí Trůnní
město. Sezóna trvá omezenou dobu; na jejím konci se sečte skóre a vyhlásí vítěz.
Cílová verze je webová hra pro 10–100 hráčů na jednom serveru; začínáme
singleplayer prototypem s AI frakcemi.

## Svět: Vellar

Kontinent Vellar se vzpamatovává z Popelné války, která rozvrátila starou říši.
Trůnní město uprostřed kontinentu je opuštěné a čtyři mocnosti se je snaží
ovládnout dřív, než skončí příměří (= herní sezóna).

## Frakce

| Frakce | Rasa | Barva | Bonus |
|---|---|---|---|
| Aldarské království | Lidé | modrá | +25 % jídla |
| Tichý sněm Yllienu | Ylliové — elfové (dlouhověcí lesní lid) | tyrkysová | +50 % dřeva z hvozdů |
| Durgarská držba | Durgarové — orkové (horský lid kovářů) | oranžová | +50 % zlata z kopců a ruin |
| Popelná horda | Šarakhové — démoni (kočovníci z popelných plání) | červená | armády +15 % síly v útoku |

## Hráči uvnitř frakce (v0.32 — etapa 4c)

- Jednu frakci smí sdílet **až 4 hráči**. První je **zakladatel** (hraje za
  frakční hlavní město), každý další dostane při startu **vlastní město
  3×3** ve výseči frakce — s vlastními surovinami, jednotkami, hrdiny,
  budovami, Prstenem, příběhem sezóny i stropem území.
- **Společné za frakci:** strana, barva, diplomacie (pakty a války
  vyhlašuje kdokoli, platí všem), fáze světa, velké pevnosti, Trůn — a
  **obrana**: pole brání hrdinové a výspy všech spoluhráčů, město vždy
  zásoba svého pána.
- **Vlastní každému hráči:** dobytá pole (mapa si pamatuje, čí jsou),
  výnosy, strop území, kapitoly příběhu, strom Prstenu, kořist a účet.
  Padne-li hráčovo město, přesídlí se v kraji — stejně jako frakce.
- V lobby jde k obsazené frakci **přisednout** (karta ukazuje jména;
  „plno" až při čtyřech). Spoluhráči sdílí mapu (mlhu války).

## Suroviny

Pět surovin: **jídlo 🌾** (výcvik, údržba armád), **dřevo 🪵** (lučištníci,
vyšší budovy), **kámen 🪨** (budovy hlavního města a **výspy**), **železo ⚙**
(pěchota, jízda, vylepšení jednotek) a **zlato 🪙** (hrdinové, pakty, žold).
Suroviny nesou pole podle svého druhu (viz níže); **každé pole navíc generuje
zlato ve výši 20 % objemu svých surovin**.

**Výspa 🗼** (stavba na mapě za 300🪨 100🪵 150🪙): obranná stavba na vlastním
poli. Posádka **až 2000 jednotek** se do ní přesouvá volně ze zásoby (a
zpět) a drží **neustálou stráž**: brání výspu i všechna sousední vlastní
pole (obranný bonus ×1,3) a nese skutečné ztráty z bojů. Pád pole výspu
strhne i s posádkou.

## Mapa

- **Čtvercová mřížka otočená „na koso" (od v0.21)** — pole jsou na obrazovce
  kosočtverce a celý svět je velký diamant, přesně jako v předloze. Od v0.23
  čtverec **69×69 (4761 polí)** rozdělený **osmi řekami na osm výsečí** — po
  jedné pro každou frakci; kapitály sedí 32 pochodových kroků od Trůnu,
  všechny stejně daleko. Armáda se pohybuje na 4 sousední pole (přes hrany),
  vzdálenosti se počítají po krocích (Manhattan).
- Terén: pláně, hvozd, kopce, ruiny, řeka/jezero, most, hradby — terén dává
  vzhled, průchodnost a obranný bonus; **výnos určuje druh pole**.
- **Minimapa (v0.33)** vpravo dole: přehled celého světa (území frakcí,
  Trůn, kapitály a města jako tečky) s rámečkem toho, kam se právě díváš;
  klik nebo tažení po minimapě přesune pohled. Velikost světa je od v0.33
  technicky nastavitelná při startu serveru (výchozí zůstává 69×69 —
  větší mapy přijdou s pozdějšími fázemi hry).
- **12 druhů polí podle síly**: 1, 10, 15, 30, 60, 90, 130, 150, 200, 230,
  260, 300 — čím blíž středu, tím silnější a výnosnější. Jmenovka síly je
  „třída" pole; skutečná posádka roste strměji (síla 10 ≈ 10 jednotek,
  síla 15 už ~30, síla 300 ~435 jednotek — přesně 3/10/30/55/85/120/160/
  205/255/310/370/435). Body do **síly království** dává pole podle třídy
  (1/1/2/3/6/9/13/15/20/23/26/30).
- **Suroviny polí se střídají ob stupeň**: pole síly 1 dává **trochu od
  každé suroviny**; sudé stupně (10, 30, 90, 150, 230) dávají **jídlo NEBO
  železo**, liché (15, 60, 130, 200, 260) **kámen NEBO dřevo** (terén
  napovídá: hvozdy dřevo, kopce kámen/železo); vrcholové pole 300 je
  klasické pole se **všemi surovinami**. Objem roste se stupněm
  (0,4→9/s), zlato vždy +20 % objemu.
- **Dva prstence opevnění**:
  - **Vnitřní hradby** (poloměr 4 kolem Trůnního města) se čtyřmi
    **Pevnostmi** (⚔ 500 jednotek, skóre +20, obrana ×1,4) — brány dovnitř,
    první dobytí má 50% šanci na epický předmět.
  - **Vnější prstenec** (poloměr 8) se čtyřmi **VELKÝMI PEVNOSTMI** —
    každá je shluk **5 polí** (srdce síly 500 ≈ 725 jednotek + 4 bašty
    síly 300 ≈ 435 jednotek). Jediné průchody vnějším prstencem vedou
    skrz tyto shluky. **Držené srdce velké pevnosti dává celé frakci
    +10 % útoku**; první dobytí vynese **800 🪙 a s 50% šancí epický
    předmět**.
- **Prstence hradeb jsou na obrazovce čtverce** s branami a velkými pevnostmi
  v rozích — souvislé kamenné valy, které na sebe pole od pole navazují.
- **Velké stopy staveb (v0.22):** města, kapitály a Trůnní město zabírají
  **3×3 pole**, silná pole (síla 200–300) srůstají do bloků **2×2**. Blok je
  jeden celek: jedna bitva (útok na kterékoli jeho pole míří na celek),
  jeden vlastník, jmenovka uprostřed — ale výnos běží na každém poli, takže
  velké pole živí říši víc než malé. 2×2 pole brání **dvojnásobná posádka**
  (v předloze velká pole bránily dvě armády); kapitál startuje s celým
  blokem 9 polí.
- **Čtyři řeky dělí mapu na čtyři kvadranty** — po jednom pro každou frakci.
  Tečou od vnějšího prstence k okrajům světa (na obrazovce vodorovně a svisle)
  jako koryta s písčitými břehy. Přes každou řeku vede **jediný most** (silná neutrální posádka ~200,
  skóre +5): kdo ho drží, kontroluje bránu do sousedního kvadrantu.
  Generátor **garantuje průchodnost**: oba konce každého mostu jsou vždy
  souš (náhodné jezero za mostem se změní na pláně) a každé hlavní město
  se prokazatelně dostane po souši a mostech k trůnu — když by náhodná
  jezera kout odřízly, protne vodní stěnu brod (řeky zůstávají netknuté,
  mosty jediným přechodem).
  Kvadranty se kromě mostů potkávají už jen ve středové oblasti za
  hradbami — kdo prošel svou pevností, může uvnitř narazit na kohokoli:
  „všechny cesty vedou k trůnu“.
- **Filtry mapy** (lišta vlevo nahoře): zvýraznění polí podle výnosu
  jídla / dřeva / kamene / železa / zlata (s hodnotou za tik) nebo filtr
  **⚔ Síla** — pole obarví podle stupně (12 barev modrá→purpur) a ukáže
  jmenovku síly (neprozkoumaná „?").
- **Čtení mapy**: neutrální pole nese popisek ⚔ se **jmenovkou síly**
  (1–300; bašta 300, velká pevnost 500), vlastněná pole skutečnou obranu.
  Vedle popisku je drobná **ikona suroviny** (🌾🪵🪨⚙, ✦ = vše) a stupeň
  podbarvuje půdu (bohatá pole hřejí do zlata, chudá šednou).
- **Izometrická grafika**: mapa je od v0.16 **skutečná 3D scéna** (three.js,
  modely z Blenderu `art/blender/make_models.py` → `art/models/`, ortografická
  kamera s náklonem 55°); do v0.15 to byly předrenderované sprity. Logika mřížky
  se nemění, jen se rovina svisle stlačí (`ISO_SQUASH`) — a protože se kamera
  naklání o stejný úhel, promítá 3D do týchž pixelů, ve kterých počítá 2D.
  **Každá frakce má svůj biom** v kvadrantu kolem svého hlavního města:
  Aldar = zelené pláně s poli, statky a listnáči; Yllien = sytá elfí
  zeleň, květiny a zářící krystaly; Durgar = vyprahlá zem, železné pláty
  a skály s žílami rudy; Horda = čedič, žhavé praskliny, spálené lesy
  a sopky s lávou; **Brakkar** = chladné horské louky, žulové štíty se
  sněhovými čepicemi a mohyly; **Sarn** = zlatá step s akáciemi a trsy
  suché trávy; **Vhorren** = bledá zem náhrobků, mrtvých stromů a sinale
  zářících krystalů; **Gryk** = rozrytá bahnitá vrchovina s norami,
  haldami a kalnými loužemi. Střed za hradbami je **popel Vellaru** (bledé duny,
  zkamenělé hvozdy, skalní věže). Hlavní města mají frakční architekturu
  (lidské hrazené město, elfí věže, orčí železná tvrz, démoní citadela),
  Trůnní město je temná citadela se zlatými hroty a žhavým příkopem.
- Struktury: **hlavní města** frakcí (4, v rozích), **svobodná města**
  (neutrální, silná posádka, výnos ze všech surovin) a **Trůnní město** ve
  středu (nejsilnější posádka, obrovské skóre).
- **Průhlednost zisku**: najetí myší na pole ukáže bublinu s obranou,
  výnosem za tik (včetně frakčních bonusů a hlavní budovy), body skóre
  a šancemi na rarity kořisti; totéž detailně v panelu vybraného pole.
- **Kolo akcí**: klik na pole rozvine kolem něj kruhové menu ikon s tím,
  co s polem jde dělat — ⚔ útok (neutrální/nepřátelské), 🥾 přesun hrdiny
  (vlastní pole), a na poli s vlastním hrdinou 🛡 stráž, 📦 posily a
  🏠 odvolání. Útok a přesun pokračují výběrem hrdiny (řazeno vzdáleností
  k cíli): hrdina v poli vyráží hned celou armádou, u hrdiny doma se otevře
  formulář v panelu s předvybraným hrdinou. Kolo mizí při tažení mapy,
  zoomu či kliku jinam.
- Klíčové pravidlo: dobývat lze jen pole **sousedící s vlastním územím** —
  území musí být souvislé, fronty vznikají přirozeně. Sousedství se kontroluje
  i při dopadu útoku: ztratí-li útočník během pochodu spojovací pole, bitva se
  nekoná a hrdina se vrací na pole, odkud vyrazil (padlo-li mezitím i to,
  ustupuje dál do hlavního města).
- **Mlha války**: hráč vidí své území s okolím (dohled 1), hrdiny v poli
  (dohled 2) a okolí tras vlastních pochodů. Neprozkoumaná pole halí temnota,
  ale **silueta terénu prosvítá** (hory, lesy, voda, obrysy měst) — hráč tuší,
  co ho čeká, čísla (úroveň, posádka) ale nevidí;
  jednou spatřená zůstávají prozkoumaná, ale mimo dohled šednou a neukazují
  aktuální obranu ani cizí hrdiny a pochody (cizí pochod je vidět, jen když
  je vidět některý konec jeho trasy). AI mlhou omezena není.
- **Živá mapa**: neutrální posádky se pomalu obnovují k plné síle
  (~10 minut), takže se prořezané koridory časem znovu zavírají. Na
  neutrálních polích se navíc objevují **putovní události** (max 3 naráz,
  s odpočtem): 💀 *Potulná banda* (posádka +60 %, poražení vynese zlato),
  💰 *Kupecká karavana* (dobytí pole vynese měšec zlata), ✨ *Ztracená
  relikvie* (dobytí zaručí kořist vyšší rarity). Kdo pole dobude, dokud
  událost trvá, bere odměnu.

## Dlouhé sezóny, Koruna popela a Prsten (v0.24)

- **Výhra sezóny = Koruna popela:** kdo udrží Trůnní město NEPŘETRŽITĚ
  12 % délky sezóny (u hodinové ~7 minut, u dvouměsíční ~týden), okamžitě
  vítězí. Ztráta Trůnu odpočet ruší. Když Korunu nikdo nezíská, na konci
  rozhodne skóre. Trůn se otvírá v půlce sezóny (příměří).
- **Délka sezóny:** server ji dostane v hodinách (`node server/server.js
  8123 336` = 14 dní); všechno — otevření Trůnu, doba držení, tempo Prstenu
  i bodů činu — se škáluje poměrově. Sólo hra zůstává hodinová.
- **Prsten popela:** moc hráče (skóre) se každý „den světa" přetavuje ve
  zkušenost Prstenu (úrovně 1–10). **Body činu ⚡** — strop 24, +1 za
  „hodinu světa" (u dlouhých sezón reálná hodina) — platí činy na mapě:
  **Sklizeň kraje** (6 ⚡, denní výnos pole naráz; od úr. 7 dvojnásobný),
  **Výcvik mysli** (8 ⚡, zkušenost hrdinovi; od úr. 9 dvojnásobná),
  **Druhý dech** (6 ⚡, plná výdrž hrdiny). Sudé úrovně přidávají výdrž
  všem hrdinům, vrchol dává +50 velení. Prsten je moc hráče — s výhrou
  sezóny nesouvisí a s koncem sezóny se vrací na začátek.
- **Kraje Vellaru:** devět pojmenovaných krajů (Srdce Vellaru + osm výsečí:
  Zlatá marka, Tiché hvozdy, Železné pustiny, Popelná spálenina, Šedé štíty,
  Větrné stepi, Bezesné pláně, Rozhryzaná vrchovina). Kraji vládne, kdo drží
  jeho bránu — velkou pevnost (+10 % útoku frakce). Přehled v okně Skóre.
- **Domovská síň:** mezi sezónami se všichni scházejí v lobby — účty, truhly,
  postup hrdinů a výběr frakce do další sezóny; server počítá sezóny a po
  konci jedné otevře přihlášky do příští.

## Rytmus sezóny

- **Trůnní město chrání příměří do půlky sezóny** (🔒 na mapě + odpočet
  v horní liště); pak se brány otevřou všem — vrchol sezóny má jasný čas.
- **Popelná bouře**: každých ~3–5 minut se na ~45 s přežene bouře — výnosy
  klesají na polovinu a všichni obránci dostávají +20 % (zákopy). Na
  obrazovce poletuje popel; bouře je vidět i v horní liště.
- **Cíle sezóny**: pět jednorázových úkolů pro hráče (ovládni 15 polí,
  vyhraj 5 bitev, dobuď svobodné město, vycvič hrdinu na úroveň 5, ovládni
  most) s odměnami v surovinách; postup ukazuje panel v bočním sloupci.

## Diplomacie

Každá AI frakce má **osobnost** (aggression — chuť útočit, trust — ochota
k paktům): Aldar rozvážní diplomaté, Yllien vyčkávaví oportunisté, Durgar
tvrdohlaví obchodníci, Horda nenasytní dobyvatelé (pakty téměř nepřijímá).

- **Pakt o neútočení** (3 min): blokuje útoky oběma směry. Hráč ho nabízí
  tlačítkem 🤝 u frakce v panelu skóre za tribut 100 🪙 (propadá i při
  odmítnutí). Šanci na přijetí zvyšuje důvěřivost frakce a vojenská převaha
  hráče; zrazená frakce nepřijme nikdy.
- **AI nabízí pakt sama**, když se cítí slabší — nabídka visí 60 s v panelu
  (přijetí hráči vynese 50 🪙 tribut).
- **Vypovězení paktu** je okamžité, ale zrada se roznese: frakce si ji
  pamatuje (grudge — útočí na zrádce ochotněji a dřív) a dlouho (5 min)
  o novém paktu nejedná.
- **Vyhlášení války (v0.29)**: formální akce ⚔ v panelu skóre (dvojím
  kliknutím), s dlouhým cooldownem (5 % sezóny). Sundá 70% postih bourání
  v krajích držených cílem a je POVINNÁ pro útok na hlavní město. Trhá
  případný pakt (počítá se jako zrada) a napadený si válku pamatuje.

## Akční rádius, obléhací okna a vykořenění (v0.29)

Tři mechaniky podle předlohy (PLAN.md část I):

- **Akční rádius**: kapitál a každá výspa promítají kruh dosahu 20 polí
  (Manhattan). Hrdina smí ÚTOČIT jen v dosahu své **domovské základny** —
  výchozí je kapitál; na vlastní výspě se hrdina může výslovně **usadit**
  (⚑ v panelu pole) a jednat pak kolem ní. Návrat domů základnu vrací pod
  kapitál; pád výspy taky. Přesuny na vlastní pole, návraty a posily
  omezené nejsou. Kapitály jsou ~32 polí od Trůnu — na střed je potřeba
  řetěz výsep. Mapa ukazuje diamant dosahu při potvrzování pochodu.
- **Obléhací okna**: velké stavby (pevnosti, velké pevnosti, kapitály,
  Trůn) mají **odolnost**. Pobití posádky stavbu nezabírá — otevře
  obléhací okno (0,07 % sezóny, min. 90 s); v něm náběhy boří odolnost
  bez vlastních ztrát (kapitál a Trůn ostřelují ~1,5 % armády za náběh).
  Odolnost na nule = zábor. Promeškané okno = stavba se obnoví i
  s posádkou. Obránce může stavbu během okna posádkovat hrdiny — ti se
  musí vybít bitvou. Běžná pole se dobývají postaru.
- **Vykořenění**: kapitál sražený na nulu neznamená konec — poražená
  frakce se přesídlí do závětří vlastního kraje (nový kapitál 3×3 dál od
  středu), majetek, území i hrdinové jí zůstávají. Z dobytého kapitálu
  zbývá dobyvateli svobodné město.

## Žíly, uzly a otevírání světa (v0.30 — etapa 4a MMO pivotu)

- **Žíly surovin**: bohatá pole síly 200+ jsou vždy **uzly 2×2** s JEDNOU
  konkrétní surovinou a kolem nich roste „žíla" — prstenec menších polí
  (síly 60–150) STEJNÉ suroviny; čím silnější uzel, tím víc jich je. Dva
  uzly nikdy nestojí vedle sebe, kolem hradů drží ochranná zóna 5 polí a
  uzel nikdy nepřisedne k bráně prstence. Ve startovní výseči je uzel síly
  300 od každé suroviny nejvýš jednou; směrem ke středu jich přibývá.
  Uzel síly 300 sype JEDNU surovinu ve čtyřnásobném objemu (za celý blok
  panel ukazuje součet).
- **Dvě armády na jeden zátah**: neutrální uzel brání dvě armády po sobě —
  porazíš první a HNED nastupuje druhá (dva bojové reporty). Prohra
  kterékoli bitvy, nebo pád tvého velitele uprostřed zátahu, uzel na
  15 minut **uzavře** a OBĚ armády se plně obnoví. Uzly se neobléhají —
  buď je zlomíš na jeden zátah, nebo počkáš. Jednou dobytý uzel se pak
  brání normálně jako tvé území.
- **Otevírání světa**: mapa se otevírá ve **4 fázích** — (1) jen vlastní
  výseč, (2) + mezikruží velkých pevností, (3) + cizí výseče a mosty,
  (4) + vnitřek za hradbami (Trůn navíc chrání příměří do půlky sezóny).
  Fázi otevře **společný postup všech frakcí** (checkpointy: dobytá pole,
  velké pevnosti, silná pole) — nejpozději ale časová pojistka (10/30/45 %
  sezóny), sezóna se nezasekne. Zamčené zóny jsou na mapě ztmavené se 🔒
  na branách a horní lišta odpočítává další fázi.

## Strom Prstenu, strop území a příběh sezóny (v0.31 — etapa 4b)

- **Strom Prstenu**: za každou úroveň Prstenu popela 1 bod do stromu —
  6 větví (🗺 Nadvláda +10 polí stropu, ⚡ Vláda +2 body činu, 🥾 Výdrž
  +10 výdrže hrdinů, 🌾 Sklizeň +3 % výnosů a +15 % Sklizně kraje,
  🎖 Velení +20 velení, ✨ Hojnost +0,5 útoku a obrany), dohromady 20
  slotů na 10 bodů — každý build je sezónní volba. **Za Prsten nic
  automaticky** — dřívější dary výdrže a velení se kupují ve větvích.
  Přerozdělení bodů stojí zlato. Činy ⚡ (Sklizeň, Výcvik, Druhý dech)
  dál odemyká úroveň Prstenu.
- **Strop území**: říše smí držet nejvýš **80 polí** + co si vybuduje:
  Nadvláda (+50), kapitoly příběhu (+60) a checkpointy (+26) — cíl 216.
  Zábor nad strop nejde (i nájezd pole dobývá — jen hrdina nezůstává);
  výjimkou je vždy Trůn. Ventil agrese pro říše na stropu přinese
  **Plunder** (vyplenění bez záboru, plán II-C2). Stav 🗺 X/strop
  ukazuje okno cílů.
- **Příběh sezóny**: 6 kapitol po 3 questech (pole, výhry, hrdinové,
  výspy, města, uzly, brány, velké pevnosti…). Dokončená kapitola dá
  suroviny, +10 polí stropu a jádra. Každá frakce má svůj příběh — i AI
  ho plní přirozeně hrou.
- **Checkpointy sezóny**: tři společné milníky všech frakcí; splnění
  (klidně i po časové pojistce) přidá VŠEM +8/+9/+9 polí stropu a otevírá
  fáze světa. Pojistka otevře jen zónu — porce polí je odměna za skutečný
  společný výkon.

## Suroviny

Jídlo, dřevo, zlato. Přibývají každý tik podle držených polí
(výnos = terén × úroveň). Utrácejí se za verbování; později za budovy a hrdiny.

**Údržba armád**: každá jednotka (v zásobě, u hrdinů i na pochodu) spotřebuje
0,02 jídla za tik — horní lišta ukazuje čisté saldo jídla (výnos − údržba).
Když jídlo dojde, armáda **hladoví**: každých 15 s dezertují ~2 % jednotek,
dokud se zásobování neobnoví. Platí i pro AI (ta při záporném saldu přestává
verbovat). Velikost armády tak má přirozený ekonomický strop.

## Hrdinové

Armáda může vyrazit jen pod vedením hrdiny — počet hrdinů tak omezuje počet
souběžných útoků (žádné dobývání salvou pochodů). Každý hrdina:

- je **unikátní** (vlastní jméno a rys: Útočník +3 útoku, Rychlý −25 % času
  pochodu a +2 rychlosti, Ochránce +4 obrany, Neúnavný +60 % obnovy výdrže
  a +40 životů, Vojevůdce +100 velení a +6 poškození, **Mystik** — kouzla:
  poškození přímo do životů nepřátel každé kolo),
- má **bojové staty**: ❤ životy (100 + 20/úroveň), ⚔ útok a 🛡 obranu
  (2 + 0,5/úroveň; 1 bod ≈ 5 % poškození), 🗡 poškození za kolo
  (8 + 3/úroveň) a ⚡ rychlost (5) — viz „Boj v kolech“; dovednosti
  a předměty tyto staty zvyšují (procenta předmětů se počítají 5 % = 1 bod),
- vede **nejvýše jeden pochod** naráz,
- má **výdrž** (0–100): pochod stojí 12 + 4 × vzdálenost, obnovuje se
  0,5/s — dlouhé výpady vyčerpávají a hrdina musí odpočívat.

**Žold**: útok na cizí pole stojí **0,3 🪙 za jednotku** (zaokrouhleno nahoru)
— velké výpravy jsou drahé a masová armáda zatěžuje pokladnici, ne jen sýpku.
Přesun na vlastní pole je zdarma; žold se za zrušený či prohraný pochod
nevrací. Platí i pro AI. Odhad žoldu ukazuje útočný formulář živě.

Hrdina je vázaný na mapu:

- **Po vítězství zůstává s přeživší armádou na dobytém poli** a další útok vede
  odtud (kratší pochod i nižší cena výdrže na frontě). Pole s hrdinou je díky
  jeho armádě výrazně lépe bráněné.
- **Po porážce ustupuje do hlavního města** — cesta zpět trvá stejně dlouho
  jako pochod do bitvy a hrdina je poté 30 s nepoužitelný (zotavuje se).
  Padne-li pole, na kterém hrdina stojí, ustupuje také — armáda si nese
  skutečné ztráty z proběhlého boje.
- Hrdinu v poli lze kdykoli **odvolat** zpět do města; armáda se po návratu
  vrací do společné zásoby.
- Hrdina se může **na pochodu obrátit** (útok i návrat domů) a vrátit se na
  pole, odkud pochod vyšel — ušlý kus cesty ale musí ujít zpět. Výdrž za
  zrušený pochod se nevrací. Padne-li výchozí pole mezitím do cizích rukou,
  hrdina ustupuje až do hlavního města.
- Hrdinovi v poli lze poslat **posily** — zásobovací konvoj z hlavního města
  (nevede ho hrdina, takže nemůže útočit a neobchází limit souběžných útoků).
  Konvoj jde nalehko **dvojnásobnou rychlostí** (7,5 s na pole). Dokud je
  konvoj na cestě, je hrdina **ukotven**: nesmí opustit pole (útok, přesun
  ani odvolání) — čekat ale může na stráži, tu držet smí. Hráč může posily
  **zrušit** (✕ v panelu hrdinů i pole): konvoj se obrátí, ušlý kus cesty
  ujde zpět, náklad se vrátí do zásoby a hrdina se odemkne. Padne-li pole
  hrdiny bojem, konvoj se po doražení otočí a vrací se domů sám.
- Hrdina se může **přesunout i na vlastní pole** (obranný pochod) — stojí
  výdrž a čas jako útok, na místě pak posiluje obranu pole svou armádou.
- **Stráž (Guard)**: hrdina v poli může aktivovat stráž — jeho armáda pak
  brání i **všechna sousední vlastní pole**. Aktivace stojí 15 výdrže a
  držená stráž čerpá 1 výdrž/s (bez obnovy); na nule stráž padá. Když
  střežené sousední pole přesto padne, strážce kryje ústup a ztrácí 25 %
  armády. Odchodem z pole se stráž ruší.
- Na mapě je každý hrdina v poli **postavička s vlastní siluetou** —
  všech 24 hrdinů má předrenderovaný 3D sprite z Blenderu
  (`art/blender/make_heroes.py`): rasa podle frakce (lidé, elfové s ušima,
  mohutní orkové s kly, démoni s rohy) a **osobní výbava** (Mara obouruční
  meč, Edran věžový štít s korunou, Theyren luk s toulcem, Duna kulatý
  štít, Khorr kuše, Ghazk čepel se žhavým ostřím, Morgal kostěný štít,
  vojevůdci zástavy frakce — Vrakh s lebkou na žerdi…). Sprite oživují
  transformace: na poli **stojí a pohupuje se**, na pochodu **kráčí v čele
  kolony** (houpavý krok), při dobytí pole se odehraje **animovaný střet**:
  útočníkova a obráncova figurka se bijí v oblaku prachu se záblesky
  čepelí (~3 s; brání-li jen posádka, stojí proti útočníkovi šedý kopiník
  domobrany). Než se sprity načtou, kreslí se vektorové siluety. K tomu dál praporek
  s iniciálou v barvě frakce (vlastní hrdinové se zlatým okrajem), kroužek
  na poli a u stráže pulzující aura přes chráněná pole. Pochody se liší stylem linie: útok =
  plná linie se šipkou, posily = jemná tečkovaná, návrat/ústup = šedá. Po
  trase pochoduje **animovaná kolona figurek** (nohy v kroku, houpání při
  došlapu, počet vojáků nad čelem; velikost kolony roste s armádou): útok
  vede praporečník s vlající zástavou frakce, posily veze krytý vůz
  s točícími se koly, návrat a ústup jde v šedé bez zástavy.

Frakce začíná s **jediným hrdinou** — hráč si ho vybírá na startu (druhý
krok po volbě frakce: karty se zobrazeným portrétem, povahou i ultimátkou).
Každá frakce má **6 hrdinů** (naverbovat lze nejvýš 5 — jeden vždy zbyde);
zbylé lze najímat za zlato (250 / 450 / 700 / 1000 — cena roste s počtem
hrdinů) a **hráč si vybírá, koho naverbuje** (panel Hrdinové nabízí všechny
volné). AI si startovního hrdinu losuje a dokupuje náhodně, takže se
soupeři hru od hry liší.

**Velení**: každý hrdina uvede omezený počet jednotek — **200 + 100 za
každou úroveň** (armáda v poli + posily na cestě se počítají dohromady).
Pátý hrdina každé frakce je **Vojevůdce** (+100 velených jednotek z povahy)
a jeho strom dovedností velení dále zvyšuje (+40/bod, ultimátka +120–150):
Ser Aldric Korouhevník (Aldar), Laeril Píseň úsvitu (Yllien), Thrag Sedmý
správce (Durgar) a Vrakh Pán smeček (Horda).

Šestý hrdina je **Mystik** — kouzelník, jehož kouzla působí **poškození
přímo do životů nepřátel** každé kolo (obchází útok/obranu i opevnění)
a jehož **ochrana (ward)** sráží poškození od nepřátelských hrdinů a kouzel:
Arcimág Vaelis (Aldar), Síthrel Hvězdný šepot (Yllien), Zhargra Runové oko
(Durgar) a Maalzeth Plamenný prorok (Horda). Každý má vlastní siluetu
s holí a zářivým ohniskem (koule, krystalová hvězda, runová deska, lebka
v plameni).

### Úrovně a zkušenosti

Hrdinové sbírají zkušenosti z bojů (vítězství podle síly poražené obrany,
menší díl i za prohru a za ubráněný útok) a postupují až na **úroveň 10**:
každá úroveň dává **+20 životů, +0,5 útoku, +0,5 obrany, +3 poškození,
+3 maximální výdrže a 1 bod dovedností** (a postup hrdinu uzdraví).

### Strom dovedností

**Každý hrdina má unikátní strom**: tři osobní dovednosti (max 3/3/2 ranky)
a **ultimátní schopnost**. Dovednosti se odemykají podle celkem
investovaných bodů (0 / 2 / 4), ultimátka po **6 investovaných** — bodů je
za kariéru 9, takže plný strom = celý rozpočet. **Respec**: přerozdělení
všech bodů stojí 40 zlata za investovaný bod.

Klíčové mechaniky: **první úder** (eliminace jednotek nepřítele ještě před
výpočtem boje — funguje v útoku i při obraně vlastního pole), **aura**
(nepřátelé útočící na pole v okolí hrdiny mají sníženou celkovou sílu,
dokud tam hrdina stojí; bere se nejsilnější aura), kořistné zlato, rychlejší
konvoje, návraty a další.

Ultimátky (výběr): Mara — *Popravčí* (eliminace 40 před bojem);
Edran — *Nezlomná zeď* (+35 % obrany pole); Ysra — *Neúnavná* (bez zotavení
po porážce); Nyalle — *Stínochod* (návrat/ústup okamžitě); Theyren —
*Srdcestřel* (ignoruje obranné bonusy); Elvarin — *Prastarý hvozd* (aura
−20 %); Sivrel — *Vítězný dech* (plná výdrž po výhře); Borgan — *Kladivo
hor* (+35 % na opevnění); Duna — *Lavina* (smete 45 před bojem); Khorr —
*Dělostřelecká příprava* (25 eliminací + útok); Vagga — *Žulový pokřik*
(výdrž všem po výhře); Ghazk — *Popelný příkrov* (aura −25 %); Ukhra —
*Oko bouře* (rychlost + levná výdrž); Morgal — *Kostižer* (30 % ztrát
zpět); Zhurr — *Věčný návrat* (bez zotavení, návrat 2× rychleji);
Kaelen — *Křídla bouře* (pochody o 30 % rychleji).

AI utrácí body průběžně vlastním stromem směrem k ultimátce.

**Naučená ultimátka je vidět na mapě**: každý hrdina s ultimátkou nese
u praporku barevný glyf (⚔ 🛡 ☠ …) a kolem jeho pole běží vlastní animace —
aury jako rozlehlý barevný příkrov s rotujícím okrajem, Edranova zlatá
hradba, kladivo, jiskry, kostěné a kamenné částice, třpyt, stínové přízraky,
prstence pokřiku… Pohybové ultimátky (Křídla bouře, Stínochod, Oko bouře,
Věčný návrat) navíc táhnou za pochodujícím oddílem barevný kometový ohon.
V panelu Hrdinové se naučená ultimátka ukazuje zlatě (★ jméno).

### Výbava a kořist

Každý hrdina má **6 slotů výbavy = 6 základních statů**: každý předmět sám
od sebe přidává stat svého slotu — **zbraň 🗡 poškození hrdiny, štít 🛡
obranu, brnění ❤ životy, helma ✨ kouzelné poškození (ohnisko vůle), boty
⚡ rychlost a rukavice ⚔ útok** (běžný kus ~+1–3/+13 životů, legendární
~+4–5 útoku/obrany/rychlosti, +15 poškození/kouzel, +60 životů). Bonusy na
výdrž, obnovu a čas pochodu zůstávají setovým kusům a dovednostem.

Hlavním zdrojem výbavy jsou **truhly za 💠 popelná jádra**. Z bojů padá
kořist **jen z klíčových staveb, při prvním dobytí z neutrálu**: Trůnní
město dává **zaručený legendární kus**, pevnosti vnitřních hradeb i velké
pevnosti vnějšího prstence **epický kus s 50% šancí**. Běžná pole, města
ani mosty výbavu nesypou; ztracená relikvie (putovní událost) nově dává
60 🪙 a 15 💠.

Pět rarit (obyčejná → kvalitní → vzácná → epická → legendární) násobí sílu
předmětu ×1 až ×4,5. Kořist jde do **společného inventáře frakce**;
v okně hrdiny (klik na jméno) se nasazuje a sundává. AI svou kořist
rozděluje hrdinům automaticky.

**Sety předmětů**: ~35 % kořisti jsou kusy jednoho ze sedmi setů — zvláštní
druh předmětu s vlastními jmény pro každý slot. Nošení více kusů téhož setu
dává bonusy navíc (prahy 2/4/6 kusů), které se sčítají s dovednostmi:

| Set | 2 kusy | 4 kusy | 6 kusů |
|---|---|---|---|
| Zbroj Popelného válečníka | +1 útoku | +2 obrany | první úder 15 |
| Šat Větrného poutníka | −8 % času pochodu | −15 % výdrže pochodů | +35 % obnovy výdrže |
| Plát Kamenného strážce | +1 obrany | +15 % obrany pole | stráž −40 % výdrže |
| Výstroj Krvavého lovce | +15 % zkušeností | +2 🪙 × úroveň za dobytí | +15 % ztrát zpět po výhře |
| Regálie Popelného šampiona | +40 životů | +1 útoku a +1 obrany | +2 rychlosti a +60 životů |
| Zbroj Rudého kata | +6 poškození hrdiny | +12 poškození hrdiny | +1 útoku a +20 poškození hrdiny |
| Roucho Popelného zřece | +10 kouzelného poškození | +15 kouzelného, −10 % od hrdinů a kouzel | +30 kouzelného poškození |

Nové sety v0.5 míří čistě na velitele: **Regálie Popelného šampiona** sázejí
na jeho staty (životy, útok/obrana, rychlost — plný set často zajistí první
úder v kole), **Zbroj Rudého kata** hrne přímé zbraňové poškození hrdiny
(+38 celkem — víc než zdvojnásobí poškození hrdiny 10. úrovně) a **Roucho
Popelného zřece** dává kouzelné poškození přímo do životů nepřátel
(+55 celkem + ochrana) — a funguje i na nemystiky: kouzlit tak může každý,
kdo roucho poskládá.

Okno hrdiny ukazuje u kusů setu jeho jméno (◆ barevně) a sekci Setové
bonusy s počtem kusů a aktivními prahy.

**Výcvik jako zakázka (v0.18)**: panel 🗡 Výcvik neverbuje po jednom typu,
ale skládá se v něm celá objednávka. U každé jednotky je jezdík na počet
kusů, pod ním se průběžně sčítá, kolik to bude **kusů, bodů velení a
surovin** — a tlačítkem *Naverbovat* se pošle všechno naráz. Zamčené typy
(lučištníci od kasáren 2, jízda od 3) ukazují, co jim chybí; když nestačí
suroviny, jezdík se nedá vytáhnout dál, než na kolik máš.

**Body velení** jsou nová společná měna: každá jednotka zabírá ve velení
hrdiny určitý počet bodů. Zatím platí jeden bod za kus, takže se čísla
shodují s počtem vojáků; těžké jednotky s vyšší vahou přijdou spolu
s přestavbou bitev.

**Tržnice (v0.18)**: budova, ve které se dá přebytek směnit za to, čeho se
nedostává — typicky dřevo za jídlo, když armáda žere víc, než pole stačí
rodit. Kurz je vždy ztrátový (za 100 daných dostaneš 40, po vylepšení 55
a nakonec 70), takže se z tržnice nedá udělat pumpa na suroviny. **Zlato
se neobchoduje**: platí se jím žold, verbování i hrdinové, a to má zůstat
věcí dobývání, ne směny.

## Budovy hlavního města

Staví se jedna budova naráz, za dřevo a zlato:

| Budova | Max | Účinek |
|---|---|---|
| Hlavní budova | 5 | +10 % výnosu za úroveň; určuje nejvyšší úroveň ostatních budov |
| Kasárny | 3 | úr. 2 odemyká lučištníky, úr. 3 jízdu; každá úroveň zrychluje výcvik (12/10/8 s) |
| Nemocnice | 3 | vrací část padlých do zásoby (15/20/25 %) |

## Jednotky a boj

Tři typy jednotek v principu kámen–nůžky–papír — každá má **+30 % síly proti
typu, který poráží** (váženo podílem tohoto typu v nepřátelské armádě):

- 🗡 **Pěchota** poráží jízdu (levná, hlavně jídlo) — pochoduje o 20 % pomaleji
- 🏹 **Lučištníci** porážejí pěchotu (hlavně dřevo) — základní tempo 1×
- 🐎 **Jízda** poráží lučištníky (drahá, jídlo + zlato) — o 30 % rychlejší

**Rychlost pochodu podle složení**: tempo armády je vážený průměr rychlostí
jejích jednotek (čistá jízda tedy jde o 30 % rychleji, čistá pěchota o 20 %
pomaleji; koeficient se násobí s rychlostí hrdiny). Platí pro útoky, přesuny,
konvoje posil i odvolání domů. Formuláře ukazují **živý odhad času pochodu**
podle právě zadaného složení.

### Frakční pasivky a vylepšení jednotek

Každý typ jednotky má u každé frakce **vlastní pasivní schopnost** (aktivní
od začátku) a frakční **vylepšovací budovu** (max úr. 2: +10 % síly typu za
úroveň, úroveň 2 pasivku zesiluje ×1,5; úr. 2 vyžaduje Hlavní budovu 3):

| | 🗡 Pěchota | 🏹 Lučištníci | 🐎 Jízda |
|---|---|---|---|
| **Aldar** | Štítová formace: 1. kolo −30 % ztrát | Přesná salva: 1. kolo střílí dřív (−25 % úvodního úderu) | Výpad: 1. kolo +20 % |
| **Yllien** | Lesní úskok: v obraně −15 % ztrát každé kolo | Dvojitý výstřel: každé 3. kolo 2× | Vílí rychlost: poloviční ztráty jízdy při ústupu |
| **Durgar** | Krvavá zbroj: +8 % za každé kolo se ztrátami | Těžké šipky: obchází 30 % obranného bonusu | Beranidlo: +25 % na opevněná pole |
| **Horda** | Požírači: obnoví 10 % zabitých | Lovci hrdinů: +25 % na hrdiny; poražený hrdina +30 s zotavení | Popelná smršť: +5 % za každé kolo |

Budovy: Cvičiště štítonošů / Královská lukostřelnice / Turnajová stáj (Aldar),
Trnová houština / Větrná galerie / Mlžné výběhy (Yllien), Krvavá jáma /
Šípařská dílna / Válečná kovárna (Durgar), Jáma hladu / Hnízdo lovců /
Popelné ohrady (Horda).

### Boj v kolech

Bitva je **skutečný souboj, ne porovnání čísel**: probíhá až **10 kol**
nad bojovými staty. Armáda ale není jeden pytel vojáků — dělí se na **tři
formace** (pěchota, lučištníci, jízda), z nichž **každá má vlastní zásobu
životů a bije sama za sebe**. Každá jednotka má životy, poškození, útok
a obranu (pěchota 10 ❤ / 2 🗡 / 3 ⚔ / 5 🛡, lučištníci 6/3/5/2, jízda 9/3/5/3).

- **Pořadí v kole určuje rychlost.** Nejdřív udeří velitelé, pak formace od
  nejhbitější: jízda, lučištníci, těžká pěchota nakonec. Kdo je pomalý, bije
  do řad, které už prořídly.
- **Formace si vybírají cíl.** Míří na typ, který porážejí — pěchota na jízdu,
  jízda na lučištníky, lučištníci na pěchotu — a když ten padne, na
  nejsilnější zbylou formaci. Trojúhelník převah je tak konečně vidět.
- **Přebytečné poškození se ztrácí.** Formace se nedá „prostřelit" do další,
  takže ani obrovská přesila nevyhladí obránce jediným úderem. Právě tohle
  dřív chybělo: údery bez cíle se vypařily a hrdina bral pole zadarmo.
- **Stavy v boji (v0.20).** Bitva zná tři triky, které se do hry dostávají
  vzácnou výbavou: **🌀 šílenství** uvrhne nepřátelskou formaci do zmatku,
  takže se každé druhé kolo vrhne na vlastní řady místo na tebe;
  **🎯 neodvratný úder** projde skrz připravenou obranu, které se jinak dá
  vyhnout; a **navazující úder** už není přípočet, ale skutečný druhý útok —
  velitel bije podruhé, vybírá si nový cíl a znovu se rozhoduje všechno,
  co se rozhoduje. Každý z těch triků má svůj protilék, takže žádný není
  odpovědí na všechno.
- **Poražený neumírá do posledního muže.** Když armáda klesne pod čtvrtinu
  původního stavu, **zlomí se a odtáhne** — z bitvy tak odchází s vojskem
  i ten, kdo prohrál.

**Obléhání.** A právě proto se odražený hrdina nevrací domů: stáhne se na pole,
ze kterého útočil, **utáboří se a za pár desítek vteřin udeří znovu** s tím, co
mu zbylo. Mezi náběhy je vidět na mapě, dají se mu **poslat posily** — a taky
se dá napadnout. Posádka se z ran mezi útoky nestihne vzpamatovat, takže každý
náběh něco ubourá: tvrdé pole se nebere jedním hrdinským výpadem, ale sérií
útoků, do kterých hráč mezitím sype nové muže. Hrdina to zkusí nejvýš pětkrát;
když mu vojsko ztenčí pod hrst mužů, obléhání sám vzdá. Zrušit ho jde kdykoli —
hrdina pak zůstane stát na svém poli.

- **Útok proti obraně:** porovnává se útok strany (vážený průměr jednotek
  + útok velitele) s obranou druhé strany — **každý bod rozdílu = ±5 %
  uděleného poškození** (v rozmezí 0,5×–2×). Útok 4 proti obraně 3 → +5 %.
- **Rychlost velí pořadí:** rychlejší velitel v každém kole **udeří první**
  a pomalejší oplácí už jen s přeživšími; bez hrdiny bojuje strana rychlostí
  domobrany (4). Bezvelitelské posádky vede „kapitán domobrany" se staty
  hrdiny 1. úrovně, takže proti neutrálům nemá hrdina převahu statů zadarmo.
- **Velitel je plnohodnotný bojovník, ne přípočet.** Bije vlastním úderem
  a podle toho, jak je silný a jak velkou armádu vede, na sebe bere
  **4 až 55 % veškerého poškození** své strany — slabý velitel s velkým
  vojskem je kapkou v moři, silný velitel s hrstkou elity nese bitvu sám.
- **Velitel má vlastní životy** a schytává malý podíl (3 %) poškození celé
  skupiny. Když klesne na nulu, **padá** — do konce bitvy se bojuje bez jeho
  statů a poté se **zotavuje 60 s** jako po porážce. Vyhraje-li jeho armáda,
  **zůstává na dobytém poli a čeká, než se velitel vyléčí** (léčení ~1,5 %
  max. životů za tik, rys Neúnavný hojí rychleji; postup na úroveň uzdraví).
- **Mystikova kouzla** jdou **přímo do životů** nepřátel — obchází útok,
  obranu, terén i opevnění; sráží je jen ochrana (ward) nepřátelského
  hrdiny.

Před 1. kolem se odehrají **první údery** hrdinů a **duel hrdinů**: když
pole brání hrdina, střetnou se velitelé tváří v tvář (síla = úroveň, bojové
staty, výbava + náhoda); armáda poraženého ztrácí v otřesu jednotky
(6 + 3 × úroveň vítěze) a vítěz sbírá zkušenosti. Duel je vidět v bojovém
reportu.

- Útočník vítězí, jen když obranu **zlomí do 10 kol** — jinak je odražen;
  vyrovnané síly tedy drží obránce a útok potřebuje zřetelnou převahu.
- **Ztráty se dělí na padlé a raněné** (zhruba tři pětiny mrtvých). Nemocnice
  vrací do zásoby raněné, mrtví se nevracejí nikdy.
- **Obě strany nesou skutečné ztráty**: neutrální posádka zůstává po
  odraženém útoku oslabená a armády bránících hrdinů (i stráží ze sousedství)
  se boji reálně ztenčují.
- Ústup z prohraného útoku stojí dalších 25 % přeživších (pronásledování).
- **Zranění hrdinů**: hrdina, jehož armáda byla v boji zničena, je „těžce
  raněn“ a zotavuje se 60 s místo 30. Schopnosti se mohou vázat na poražení
  hrdiny — Lovci hrdinů (Horda) prodlužují zotavení poraženého hrdiny.
- Útok = pochod: hráč vybere hrdinu, cíl a složení armády; **přesun trvá
  15 s na pole**. Kronika hlásí počet kol a ztráty obou stran.
- **Nájezd („udeř a vrať se")**: zaškrtávátko v útočném formuláři. Po
  vítězství frakce pole obsadí, ale hrdina ho nedrží — hned se obrací
  a pochoduje zpět na pole, odkud útok vyšel (padlo-li mezitím, ustupuje
  do hlavního města; z města jde armáda zpět do zásoby). Dobyté pole tak
  zůstává bez obránce — rychlejší expanze výměnou za slabší týl. Porážka
  se chová stejně jako u běžného útoku.
- **Bojové reporty** (podle předlohy RtW): Kronika u bitvy nabízí odkaz 📜,
  který otevře prohlížeč se **seznamem bitev vlevo** (⚔ dobyto / 🛡 ubráněno,
  čas, červená tečka u nepřečtených, „vše přečteno“) a detailem vpravo.
  Detail: **velitelé proti sobě** — portréty s odznakem úrovně (bezvelitelská
  domobrana má šedý štít), banner **DOBYTO/UBRÁNĚNO**, životy velitelů
  (💔 u padlých) a **pruhy armád** přeživší/nástup. Pod tím **souhrnné
  metriky** obou stran: padlé jednotky, **poškození jednotek × poškození
  velitele** (zbraň + kouzla) a obnovené jednotky (Požírači…). Následují
  události před bojem (duel, první údery), sbalitelný **průběh po kolech**
  (poškození, životy velitelů, pruhy armád, odznaky pasivek) a závěr.
  Uchovává se posledních 40 bitev, včetně bitev AI frakcí.
- **Hlavní město brání i domácí zásoba**: všechny naverbované jednotky,
  které nejsou nasazené (nepochodují a nestojí u hrdiny v poli), se
  přičítají k obraně vlastního hlavního města a nesou skutečné ztráty
  z boje. Panel města ukazuje obranu včetně zásoby.
- Dobytí nepřátelského hlavního města frakci vyřadí (její území zneutrální).

## Sezóna a skóre

Sezóna = 20 minut prototypového času (ostrá hra: zhruba měsíc reálného času —
všechny časy se pak přeškálují jednou konstantou).
Skóre = součet úrovní držených polí + 10 za svobodné město + 100 za Trůnní
město. Na konci sezóny se zobrazí pořadí.

## Roadmapa

- **v0.1 (teď)** — singleplayer prototyp v prohlížeči: mapa, suroviny,
  verbování, pochody, boj, 3 AI frakce, sezóna a skóre. Bez serveru, běží
  ze souboru.
- **v0.2 (hotovo)** — budovy v hlavním městě, tři typy jednotek s frakčními
  pasivkami a vylepšeními, hrdinové (úrovně, unikátní skill stromy
  s ultimátkami, výbava, sety), boj v kolech s bojovými reporty a duely,
  mlha války, živá mapa (obnova posádek, putovní události), rytmus sezóny
  (příměří u trůnu, popelné bouře, cíle), diplomacie s AI osobnostmi,
  údržba armád jídlem, zvukové efekty (WebAudio), chytřejší AI.
- **v0.3 (základ hotov)** — multiplayer server (Node.js + ws): autoritativní
  tik na serveru, klienti posílají příkazy a dostávají snapshoty; lobby
  s výběrem frakcí a hrdinů (1–4 lidé, zbytek AI), reconnect přes token,
  `start-server.bat` + MULTIPLAYER.md (Tailscale). Zbývá: persistence světa
  (ukládání na disk), serverové ořezání mlhy války, oddělená Kronika frakcí.
- **v0.4** — aliance, chat, více map, balanc podle dat ze hry.
- **v1.0** — veřejná sezóna pro 10–100 hráčů.

## Rozhraní

Rozhraní po vzoru mobilních válečných strategií (RtW): **mapa přes celou
obrazovku**, žádný pevný postranní sloupec. Vpravo je **svislá lišta
kulatých ikon** — každá agenda má vlastní plovoucí okno (otevřené je vždy
jen jedno; stejná ikona okno i zavře):

- 🏰 **Budovy** hlavního města, 🗡 **Výcvik** jednotek (s bojovými staty
  v bublině), ⚒ **Vylepšení** jednotek — dřív jeden dlouhý panel hlavního
  města, teď tři samostatná okna dostupná odkudkoli (netřeba klikat na
  město; panel města nabízí zkratky).
- ⚑ **Hrdinové** — karta každého hrdiny: portrét, úroveň, rys, bojové staty
  (❤⚔🗡🛡⚡✨), pruhy životů/výdrže/zkušeností a **jednotky, které vede**
  (složení armády / limit velení); dole verbování dalších hrdinů.

**Okno hrdiny** (klik na jméno/portrét) kopíruje předlohu RtW: **vlevo
svislý seznam portrétů všech hrdinů** (přepínání bez zavření okna, odznaky
úrovně a volných bodů), uprostřed hlavička se jménem, třídou a XP pruhem,
**po pravém okraji svislé taby**:

- 📊 **Staty** — mřížka statů s ikonami a popisky, armáda pod velením,
  aktivní setové bonusy.
- ✦ **Strom** — dovednosti jako **souhvězdí**: čtyři hvězdné uzly (3 +
  ultimátka) spojené linkami na hvězdném pozadí, u každého **rank 2/3**;
  naučené září zlatě, zamčené mají 🔒 (odemykání po 2/4/6 investovaných
  bodech). Klik na uzel otevře **detail efektu**: popis, „Nyní" (součet za
  naučené ranky, zeleně) a „Další bod" (náhled), tlačítko Naučit; dole
  Reset (respec za zlato).
- 🎒 **Výbava** — nahoře řada 6 slotů (klik filtruje inventář), po výběru
  kusu **porovnání vedle sebe**: „Vybraný předmět" vs „Nasazený" s hvězdami
  rarity, kategorií `[Hrdina] +X stat` a šipkami ▲▼ (zelená = lepší);
  tlačítka ⇄ Vyměnit / Sundat. Kusy setů ukazují bonusy setu.
- 🏆 **Skóre a diplomacie**, 🎯 **Cíle sezóny**, 📜 **Kronika** — Kronika
  má přepínač **⚑ Moje tahy / 🌍 Celý Vellar**; výchozí pohled ukazuje jen
  vlastní akce, obecné události a bitvy, kde jsi útočník či obránce.
- Ikony nosí **odznaky**: nerozdělené body dovedností (⚑), nabídka paktu
  od AI (🏆) a počet nových záznamů Kroniky (📜, počítá se z filtru).

Klik na pole mapy otevírá **kontextové okno pole** v levém dolním rohu
(informace, útok/přesun, posily, výspa…) s křížkem na zavření; radiální
kolo akcí na mapě zůstává.

**Pochody:** nad vlastní pochodující kolonou je **jméno hrdiny**; klik na
kolonu otevře **okno pochodu** (kdo, odkud kam, armáda, průběh a čas
dojezdu) s tlačítky **↩ Obrátit zpět** a **⚑ Detail hrdiny** — netřeba nic
hledat v soupisu hrdinů.

**Vyslání armády na dva kliky (v0.15):** klik na pole → ⚔ Zaútočit (nebo
🥾 Přesun hrdiny) → volba hrdiny → **potvrzení rovnou na mapě** s plánovanou
trasou, souhrnem (kdo, kolik jednotek, čas dojezdu, žold) a tlačítky
**⚔ Vyslat / ⚙ Upravit / ✕ Zrušit**. Hrdina stojící v poli táhne celou svou
armádou, hrdinovi z města se naloží **doporučený objem** jednotek.

Když je armáda slabší než doporučený objem, potvrzení hlásí **⚠ Málo
jednotek: X z doporučených Y** — varování ale nic neblokuje, útok jde vyslat
i tak. Stejně se hlásí nedostatek zlata na žold. Kdo chce jiné složení
armády, nájezd s návratem nebo hrdinovi v poli nejdřív poslat posily,
klikne na **⚙ Upravit** a dostane plný formulář v okně pole.

**Ovládání a kompatibilita:** mapa se ovládá Pointer Events — myš, dotyk
i pero (tažení prstem, **pinch-zoom dvěma prsty**), funguje v Chromu,
Firefoxu, Safari i na mobilech. Přiblížení až 5× (detail figurek).
Sezóna trvá **1 hodinu** (SEASON_TICKS 3600).

## Účet, popelná jádra a truhly (v0.6)

Postup hráče přežívá sezóny na **účtu** (po vzoru RtW): hrdinové si drží
úrovně, dovednosti i nasazenou výbavu, sklad předmětů se přenáší do další
hry. Ve hře po síti se účty (jméno + heslo) ukládají na serveru
(`server/data/accounts.json`); v sólo hře žije místní účet v prohlížeči.
V lobby se přihlásíš v rámečku „Hra s přáteli“ — přihlášení si prohlížeč
pamatuje.

**💠 Popelná jádra** jsou prémiová měna na otevírání truhel s výbavou:

| Truhla | Strana | Cena | Obsah |
|---|---|---|---|
| Truhla Světlého dvora | ☀ dobro | 2400 💠 | jen vzácné a lepší, nejvyšší šance na legendy |
| Truhla Popelného krále | 🔥 zlo | 2400 💠 | jen vzácné a lepší, nejvyšší šance na legendy |

Od **v0.14** je truhla jediná — pro každou stranu ve svém provedení; levnější
Poutníkova a Runová truhla zanikly. Truhla dá **vždy přesně 3 věci**, nic navíc.
Každý slot je jedno z:

| Slot padne jako | Šance |
|---|---|
| 🎒 výbava — vzácná / epická / legendární | 20 % / 12 % / 3 % |
| 🎁 dárek hrdiny — Běžný / Epický / Legendární | 20 % / 12 % / 3 % |
| 🏗 posilovací doplněk | 30 % |

**Dárek hrdiny se losuje ze stejné tabulky rarit jako výbava** — legendární
dárek je tedy stejně vzácný jako legendární kus. Přebytečná výbava je materiál
pro kovárnu.

**🔨 Strengthen (kovárna):** každý předmět jde posílit až na **5 ★**
pohlcením jiných kusů **stejného druhu a stejné rarity** — na 1.–5. hvězdu
je potřeba 1 / 3 / 5 / 8 / 13 kusů. Každá hvězda zvedá sílu předmětu
o 25 %; **pátá hvězda navíc probouzí mistrovský bonus slotu** (zbraň
„Popravčí úder“ +12 poškození, štít „Neprostupná hradba“ +2 obrany a
−8 % od hrdinů, brnění „Železná výdrž“ +80 životů, helma „Třetí oko“
+12 kouzel, boty „Vichr“ +2 rychlosti a +1 útoku, rukavice „Drtivý
stisk“ +2 útoku). Kovárna je čtvrtý tab okna hrdiny (🔨); hvězdy se
ukládají na účet a přežívají sezóny.

Jádra se získávají **ze hry**: cíle sezóny (+20), dobytá pevnost (+10) a
velká pevnost (+25), banda (+5), karavana (+8), Trůnní město (+40),
dohraná sezóna (+15, vítěz +50) — a z **promo kódů** (nový účet dostává
120 💠 na uvítanou). Placené balíčky jader jsou v obchodě označené jako
„připravujeme“ — skutečná platební brána zapojená není; jádra rozdává
hra a správce serveru přes kódy (tabulka `codes` v accounts.json).

## Grafika ve 3D (v0.16)

Mapa se od v0.16 nekreslí z předrenderovaných obrázků, ale jako **skutečná 3D
scéna** (three.js): terén i stavby jsou modely z Blenderu, svítí na ně slunce
a vrhají stíny. Pohled zůstal stejný — stejný náklon, stejná mřížka, stejné
ovládání; hra vypadá jako dřív, jen má hloubku a jde přiblížit bez rozmazání.

Hrdinové, pochodující kolony, praporky, jmenovky ⚔ a efekty ultimátek se dál
kreslí jako 2D překryv nad 3D — na figurkách je v téhle velikosti realismus
stejně nepoznat a zachovalo to všechnu dosavadní animaci.

**Mlha války** ztmavuje rovnou 3D modely, takže z ní nic nekouká: hradby ani
věže se v neprozkoumané tmě neprozradí. Nádech cizího území se přes mlhu
neprosvítá.

Načítání je **lehčí než dřív** — mapa stahuje modely místo 12 MB obrázků.
Na plné mapě (1141 polí) běží vykreslování s velkou rezervou.

## Zapečené povrchy (v0.17)

V0.16 měly modely ploché barvy a vypadaly plastově. Od v0.17 mají **povrch**:
tráva má zrno, skála je zrnitá, kámen hradeb drží strukturu, do prohlubní
a pod rekvizity se zapeklo měkké zastínění. Vzniká to v Blenderu — povrch se
spočítá procedurálně a uloží do obrázků, protože formát modelů umí přenést
jen obrázky, ne výpočet.

Aby mapa nevypadala jako **kopírovaná tapeta** (všechna pole téhož druhu
sdílejí jednu texturu), dostalo každé pole vlastní nepatrný odstín — o pár
procent světlejší, tmavší, teplejší nebo studenější. Je odvozený z polohy
pole, takže se nemění a nebliká.

Zlato, železo a ruda konečně vypadají jako kov: dostaly co odrážet. A láva
s krystaly už neprosvítají skrz neprozkoumanou tmu — v mlze jen slabě doutnají,
místo aby prozrazovaly, co v ní je.

Cena: mapa se natáhne v 5,7 MB místo 2 MB. Zisk kromě vzhledu: vykreslování je
**skoro pětkrát levnější** než ve v0.16, protože každé pole je teď jeden materiál
místo šesti — a trojúhelníků je dokonce o třetinu méně.

Zároveň dostaly rekvizity **pořádný obrys**. Ve velikosti, ve které je hráč
vidí, není z kamene ani stromu poznat nic než silueta — a čistý kužel čte jako
zmrzlina, i kdyby měl sebelepší povrch. Skály se proto skládají z několika
nepravidelných pater s římsami, jehličnany mají patrové větve a koruny listnáčů
nejsou hladké koule. Krystaly Yllienu zůstaly geometricky čisté schválně —
krystal takový má být.

Nešlo přitom o „přidat detail": koule korun se zjednodušily a to, co se ušetřilo,
se přesunulo do skal a stromů. Náročnost vykreslování zůstala stejná.

Co zbývá: stavby jsou pořád kvádry s jehlanovou střechou. A hlavně se ta práce
už nezahodí, protože modely i textury se dají použít i v Unity nebo Godotu,
kdyby hra jednou mířila na Steam a na mobily.

## Grafika

Mapa běží na **předrenderovaných izometrických spritech z Blenderu**
(`art/blender/make_tiles.py`, `make_heroes.py` → `art/render/`): frakční
biomy, struktury i figurky hrdinů. Voda a překryvy (území, výběr, pochody,
praporky) se dokreslují vektorově.

**Každé pole ukazuje svou surovinu a bohatství přímo v krajině**: obilná
políčka se snopy (jídlo), hranice klád a dřevorubecké tábory (dřevo),
balvany a terasové lomy s jeřábem (kámen), rudné štoly s důlním vozíkem
(železo) a menhiry se zlatým krystalem (✦ všechny suroviny). Rekvizity
rostou se stupněm pole ve třech velikostech (úroveň 1–4 / 5–8 / 9–12) —
bohatý kraj poznáš od chudého na první pohled, mlýn či velký lom značí
pole nejvyšších úrovní.

**Portréty hrdinů** se generují procedurálně (`js/portraits.js`):
deterministický obličej podle rasy frakce (lidé / elfové / orkové / démoni —
tvar hlavy, uši, kly, rohy, žhnoucí oči), odstín pleti a účes podle pořadí
hrdiny a doplněk podle schopnosti (Útočník jizva, Rychlý kápě, Ochránce
přilba, Neúnavný čelenka). Portréty jsou v panelu hrdinů, okně hrdiny,
tlačítku najmutí i na kartách frakcí.

## Technika

Prototyp: čisté HTML/CSS/JS (canvas), klasické skripty bez build kroku —
funguje otevřením `index.html`. Server později Node.js + TypeScript + SQLite.

## Hrdinové v0.8 — dlouhá progrese (Fáze 3 auditu RtW)

- **Úrovně až 30** — přírůstky za úroveň jsou menší (úroveň 30 ≈ stará 10),
  křivka XP je dlouhá (~102 000 XP na max): hrdina roste přes více sezón,
  postup se ukládá na účet.
- **Body dovedností:** do úrovně 10 každou úroveň, dál jen za sudé — celkem 19
  bodů na strom s kapacitou ~35. Nelze naučit všechno → buildy a respec mají smysl.
- **Stromy dovedností: 6 uzlů** (5 dovedností + ultimátka) propojených do tvaru
  souhvězdí; ranky 8/8/6/6/6, ultimátka po 14 investovaných bodech. Každá
  dovednost má vlastní generovanou zlatou pečeť (žádné sdílené ikony).
- **Hvězdy velitele:** druhá osa progrese — od v0.9 rostou respektem z dárků
  (viz níže), ne nákupem za 💠. Každá hvězda +4 % hlavních statů a +25 velení;
  povýšení hrdinu uzdraví a je trvalé (účet).
- **Oddanost odemyká stromy (v0.35):** čerstvý hrdina umí jen **dva
  startovní stromy**; třetí se otevírá na **♥3**, čtvrtý (s vrcholnou
  dovedností) na **♥5** — zamčené stromy nesou štítek ♥3/♥5 přímo
  v souhvězdí, přesně jako v předloze. A na **♥10 (zkráceně R10)** si
  hrdina **odemyká svůj signature předmět** — jistá cesta k němu vedle
  vzácné truhly a prvního dobytí Trůnu. Oddanost tak není jen bod
  dovedností navíc: je to celá dráha růstu hrdiny. (AI velitelé dárky
  nesbírají — hrají bez brány a startují se svým signature, ať je boj
  s nimi poctivý.)
- **Omráčení:** někteří hrdinové mají šanci omráčit nepřátelského velitele na
  kolo (omráčený to kolo nepřispívá staty ani poškozením); tanky mají imunitu
  (Ysra, Elvarin, Duna, Morgal; Vagga jen proti Šarakhům).

## Sběratelský systém hrdinů v0.9 — strany, tiery, dárky

- **Vellar je rozdělen na dvě strany:** ☀ **dobro** (Aldarské království,
  Tichý sněm Yllienu) a 🔥 **zlo** (Popelná horda, Durgarská držba).
- **Truhly existují pro každou stranu zvlášť** (přepínač v okně truhel) a
  sypou výbavu, dárky hrdinů a signature kusy jen své strany. Výbava má
  afinitu: hrdina dobra nenosí kusy zla a naopak (staré kusy bez strany
  jsou univerzální).
- **Signature kusy starterů sedí na jejich archetyp (v0.34):** yllienská
  lukostřelkyně nese „Druhý šíp" (navazující útoky), durgarský ženista
  „Vypálené rány" (nepřítel se v bitvě nedohojí), brakkarská hradba
  „Hlubinu proti popelu" (zášť k hordě — silnější údery proti ní), grycký
  roj „Hlodá železo" (totéž proti durgarům), sarnský nájezdník tryskem
  posiluje jízdu a vhorrenský Rubáš bdění tlumí nepřátelské velitele.
  Rivalitní kusy jsou po vzoru předlohy cílené na konkrétního nepřítele —
  a drží pavučinu counterů: každý rod má svého lovce i svou kořist.
  Jedinou výjimkou je aldarský Edran — záměrně nejtvrdší souboják sezóny
  (jeho výhry ale nikdy nejsou zadarmo).
- **Zvláštní vlastnosti a zušlechtění (v0.20):** vzácnější kusy výbavy nesou
  kromě svého statu ještě **losovanou zvláštní vlastnost** — Broušené ostří,
  Válečný pokřik, Praporec, Ostruhy… Obyčejné kusy ji nemají nikdy, legendární
  vždy, takže **rarita neurčuje jen výši čísla, ale hlavně to, jestli kus vůbec
  něco umí**. Vylepšovat jde dvěma cestami, které si nekonkurují: **hvězdy**
  zvedají plochý stat a platí se za ně duplicitními kusy, **zušlechtění**
  posiluje tu zvláštní vlastnost a platí se zlatem. Na pátém stupni je
  vlastnost **šestkrát silnější** než na začátku, takže i obyčejně vypadající
  kus s dobře padlou vlastností může být lepší než cizí legenda.
- **Inventář s ikonkami (v0.39):** každý druh výbavy má vlastní ikonku
  kreslenou podle jména — kladivo vypadá jako kladivo, pavéza jako vysoký
  štít; vzácnost určuje barvu. Výbava hrdiny i nový **Sklad** (záložka
  okna 💠, funguje i mezi sezónami) ukazují mřížku desítek kusů naráz
  s filtry podle vzácnosti, setu a slotu; klik na kus otevře detail.
  Kusy, které tvoji hrdinové nosit nemohou, klesají v inventáři dospod.
- **Počítadlo smůly (v0.18):** truhla dá legendární kus zhruba každou čtvrtou,
  ale smůla umí být krutá — proto se pod kartou truhly plní pruh a **dvanáctá
  truhla bez legendy ji vydá jistě**. Jakmile legenda padne (ať už náhodou,
  nebo z jistoty), počítadlo se nuluje. Nezlevňuje to truhly, jen to odřezává
  nešťastný ocas: naměřeno na 6 000 otevřeních, nejdelší suchá série byla 11.
- **Tiery hrdinů 3/2/1 na frakci:** Běžní (rychlý, ochránce, neúnavný),
  Epičtí (útočník, vojevůdce), Legendární (mystik). Tier určuje vzácnost
  dárků a odemykání — sílu hrdiny nemění.
- **Hrdinové jsou zamčení.** Při první hře s frakcí si hráč vybere jednoho
  hrdinu **Běžného tieru** a ten mu zůstává navždy. Ostatní odemyká dárky.
  Odemčení nového hrdiny (zvacím listem i dárky) slaví **vyskakovací okno**
  s portrétem, jménem a rodem — ať je jasné, kdo právě vstoupil do síně.
- **Dárky a respekt:** truhly mají šanci přihodit 🎁 dárek náhodného hrdiny
  své strany — dárek zabírá jeden ze tří slotů truhly a jeho tier se losuje
  stejnými váhami jako rarita výbavy (viz tabulka výše).
  Dárek = +10 respektu. Hvězda stojí 10/12/15/17/20… dárků (střídavě +2/+3,
  25. hvězda 70; celkem 994) — **první hvězda hrdinu odemyká**. Povýšení
  proběhne samo při naplnění, uzdraví hrdinu a dá **+1 bod dovedností**,
  +4 % statů a +25 velení. Hrdina na 25★ mění další dárky na +10 💠.
- **Posilovací doplňky:** váhy rarit v truhlách jsou o 10 bodů nižší
  (min. 0,5 %) — uvolněný prostor sype jednorázové doplňky: 🏗 Stavitelský
  rozkaz (stavby 2×) a 🎺 Roh hojnosti (produkce říše 2×) na 1/3/5 minut
  podle tieru. Použití jen za běžící hry (okno truhel).

## Hrdinové v0.10–v0.12 — stromy podle Rise to War

Druhý audit podle videa „Ultimate Beginners Guide" přestavěl celý rozvoj velitele.

- **Úrovně až 50.** Přírůstky za úroveň jsou menší, takže padesátka odpovídá
  dřívější třicítce — hrdina roste přes víc sezón a postup se ukládá na účet.
- **Strom má 12 uzlů:** **4 hlavní dovednosti po 15 rancích** (poslední z nich
  je vrcholná — bývalá ultimátka) a pod každou **dvě větve po 7 rancích**.
  Hlavní se odemykají po 8 / 18 / 30 investovaných bodech, větev až když je
  její mateřská dovednost na 3. ranku.
- **Bodů je míň, než strom pojme:** 49 za úrovně + 1 za každou hvězdu = 74
  proti kapacitě 116. Na plný strom to nestačí, takže volba buildu má smysl
  a reset dovedností je užitečný (dva zdarma za sezónu).
- **Mistrovský bonus za 15/15.** Každá plně naučená hlavní dovednost odemyká
  trvalý bonus **podle rysu velitele** — útočník dostává útok, navazující úder
  a kolovou schopnost; ochránce obranu, imunitu vůči omráčení a obrannou
  chargu; mystik kouzla, ochranu a omráčení; a tak dál. Vrcholná dovednost má
  místo toho vlastní, jedinečný bonus. Větve odměnu za maximum nemají.
- **Kolové schopnosti.** Některé bonusy se spouštějí v konkrétních kolech boje
  („⏱ 1. kolo — proti 2 cílům 35 % poškození velitele", „každé 3. kolo +25 %
  poškození armády"). Obranné chargy pohltí celý úder kola beze ztrát.
- **Orbitální rozhraní.** Čtyři zlaté hlavní dovednosti sedí na soustředných
  prstencích, kolem nich menší modré větve. Karta dovednosti se otevírá jako
  překryv v rohu a ukazuje časování, aktuální hodnotu i přírůstek za další bod.
  Panel **Aktuální efekty** shrne všechno naučené na jednom místě.

**Přechod na nový strom vrátí všem hrdinům investované body** — rozdělení se
ztratí (staré dovednosti v novém stromu neexistují), ale o body nikdo nepřijde.

## Neutrální velitelé v0.13

Každé neutrální pole brání **vlastní velitel** se svou posádkou, ne anonymní
domobrana. Jeho úroveň roste se silou pole: ⚔1 má velitele 1. úrovně,
⚔300 a silnější pole (pevnosti, bašty, Trůnní město) velitele 50. úrovně.

- Jméno a povaha velitele patří napevno ke konkrétnímu poli — na stejném
  místě potkáš vždy stejného protivníka.
- Neutrálové **nemají výbavu, hvězdy ani dovednosti** — jen svou úroveň a rys.
- Posádky zůstaly stejné; ztvrdla hlavně pozdní hra. Trůnní město je nově
  obrana pro rozvinutou říši, ne pro jednoho hrdinu s plnou armádou.
- Velitele vidíš v panelu pole, v bublině na mapě i v bojovém reportu, takže
  se dá útok naplánovat dopředu.

## Osm frakcí — papírová tabulka (SCHVÁLENO a IMPLEMENTOVÁNO, v0.23)

> Tabulka níže je od v0.23 v kódu (FACTION_UNITS v js/game.js — tam jsou
> závazná čísla včetně cen a rychlostí; tabulka zůstává jako čitelný přehled).
> Nové rody mají hrdiny z rodových knihoven stromů podle rysu velitele. Východiska: trojúhelník
> převah zůstává po slotech (pěchotní slot bije jízdní, střelecký pěchotní,
> jízdní střelecký), každá frakce má tři jednotky mapované na tři sloty
> formací. Měřítko hodnoty: 1 bod velení (CP) ≈ 20–23 bodů statů
> (HP + 2×zbraň + útok + obrana) — dnešní pěchota 22, lučištníci 19 + rychlost,
> jízda 23 + rychlost. Blok 100 CP = srovnávací obálka balancu jako v předloze.

### Strana dobra ☀

**Aldarské království (Lidé) — řemeslo a kvalita.**
Identita: stavitelé — budovy o 15 % levnější a rychlejší; jednotky dražší,
pomaleji cvičené, ale kvalitnější (žádné „sklo"). Trvá: +25 % jídla.
| Slot | Jednotka | CP | Ini | HP | Zbraň | Útok | Obr. | Cena (≈) | Pozn. |
|---|---|---|---|---|---|---|---|---|---|
| pěchota | Gardová pěchota | 1 | 4 | 11 | 2 | 3 | 6 | 115 % dnešní | +10 % staty, +25 % cena, výcvik 1,5× |
| střelci | Královští střelci | 1 | 6 | 7 | 3 | 6 | 2 | 115 % | dtto |
| jízda | Korouhevní jízda | 1 | 9 | 10 | 3 | 6 | 3 | 115 % | dtto |

**Tichý sněm Yllienu (elfové) — mistři střelby.**
Identita: +15 % poškození střeleckých jednotek; jízda je SMÍŠENÁ (nese
střelecký štítek, takže bere půlku střeleckých bonusů). Trvá: +50 % dřeva.
| Slot | Jednotka | CP | Ini | HP | Zbraň | Útok | Obr. | Pozn. |
|---|---|---|---|---|---|---|---|---|
| pěchota | Strážci hvozdu | 1 | 5 | 9 | 2 | 4 | 5 | lehčí, rychlejší než pěchota |
| střelci | Trnoví lučištníci | 1 | 7 | 6 | 3,5 | 6 | 2 | jádro frakce |
| jízda | Trnová jízda | 1 | 9 | 8 | 3 | 5 | 3 | smíšená: střelecký štítek |

**Brakkarská hlubina (trpaslíci) — pomalí a nezlomní.** *(nová)*
Identita: všechny jednotky −2 iniciativy a pochod o 15 % pomalejší, za to
+30 % HP a +1 obrana; posádky vlastních polí +20 %. Surovina: +50 % kamene.
| Slot | Jednotka | CP | Ini | HP | Zbraň | Útok | Obr. | Pozn. |
|---|---|---|---|---|---|---|---|---|
| pěchota | Štítová hradba | 1 | 2 | 13 | 2 | 3 | 7 | kovadlina hry |
| střelci | Vrhači seker | 1 | 4 | 8 | 3 | 5 | 3 | krátký dostřel = víc HP |
| jízda | Beraní vozy | 1 | 6 | 12 | 3 | 4 | 4 | „jízda" na vozech, pomalá |

**Sarnské klany (jezdci stepí) — vše v sedle.** *(nová)*
Identita: ŽÁDNÁ 1CP jednotka — všechno jízda za 2 CP (poloviční počty, dvojité
staty). Pochod celé armády o 25 % rychlejší. Surovina: +25 % jídla ze stepí.
| Slot | Jednotka | CP | Ini | HP | Zbraň | Útok | Obr. | Pozn. |
|---|---|---|---|---|---|---|---|---|
| pěchota | Obrněná jízda | 2 | 7 | 24 | 4 | 6 | 10 | tanková jízda — pomalejší, drží |
| střelci | Jízdní lučištníci | 2 | 10 | 14 | 6 | 10 | 4 | střelecký štítek |
| jízda | Vichrná jízda | 2 | 12 | 18 | 6 | 10 | 6 | nejrychlejší jednotka hry |

### Strana zla 🔥

**Durgarská držba (orkové) — útočné železo.**
Identita: těžká útočná pěchota — pěchotní slot +1 zbraň a +2 HP; vylepšení
jednotek v kovárně o 25 % levnější. Trvá: +50 % zlata.
| Slot | Jednotka | CP | Ini | HP | Zbraň | Útok | Obr. | Pozn. |
|---|---|---|---|---|---|---|---|---|
| pěchota | Železné tesáky | 1 | 3 | 12 | 3 | 4 | 5 | pomalejší, drtivá |
| střelci | Vrhači oštěpů | 1 | 6 | 6 | 3 | 5 | 2 | beze změny |
| jízda | Vlčí jezdci | 1 | 9 | 9 | 3 | 5 | 3 | beze změny |

**Popelná horda (Šarakhové) — nenasytný oheň.** *(identita = návrh)*
Identita: trvá +15 % síly v útoku; jednotky +1 zbraň, −1 obrana (sklo, které
pálí). Padlí nepřátelé dávají +10 % zlata z kořisti.
| Slot | Jednotka | CP | Ini | HP | Zbraň | Útok | Obr. | Pozn. |
|---|---|---|---|---|---|---|---|---|
| pěchota | Popelná lůza | 1 | 4 | 9 | 3 | 3 | 4 | levnější o 15 % |
| střelci | Sirné praky | 1 | 6 | 6 | 4 | 5 | 1 | nejvyšší zbraň slotu |
| jízda | Stínové bestie | 1 | 10 | 8 | 4 | 5 | 2 | rychlé sklo |

**Bezesná říše Vhorren (nemrtví) — padlí vstávají.** *(nová)*
Identita: po VYHRANÉ bitvě se 25 % vlastních PADLÝCH (ne raněných) vrací do
armády; místo střelců MÁGOVÉ s magickým poškozením (obchází porovnání
útok/obrana — pevný násobek jako kouzla velitelů, ale ne opevnění). Pomalé
(−1 ini vše), levné (−15 % cena). Bez jídla? NE — žerou „ticho": údržba
z jídla poloviční.
| Slot | Jednotka | CP | Ini | HP | Zbraň | Útok | Obr. | Pozn. |
|---|---|---|---|---|---|---|---|---|
| pěchota | Kostěná hradba | 1 | 3 | 10 | 2 | 3 | 5 | vstává (oživování) |
| střelci | Bledí mágové | 1 | 5 | 5 | 2,5 | — | 2 | MAGICKÉ poškození, žádný útok/obrana |
| jízda | Mrtvolní štvanci | 1 | 8 | 8 | 3 | 4 | 3 | oživování se vztahuje i na ně |

**Grycký roj (skřeti) — množství a kořist.** *(nová)*
Identita: +20 % VŠECH surovin, verbování i stavby o 25 % rychlejší; jednotky
o 15 % slabší a o 25 % levnější. Pěchota má vrozený bonus +50 % poškození
PROTI JÍZDĚ (dlouhá kopí — pojistka proti sarnské přesile).
| Slot | Jednotka | CP | Ini | HP | Zbraň | Útok | Obr. | Pozn. |
|---|---|---|---|---|---|---|---|---|
| pěchota | Kopiníci roje | 1 | 4 | 8 | 2 | 3 | 4 | +50 % proti jízdě |
| střelci | Prakovníci | 1 | 6 | 5 | 2,5 | 4 | 2 | levné sklo |
| jízda | Jezdci na vlkodavech | 1 | 10 | 7 | 2,5 | 4 | 2 | nejlevnější jízda |

### Poznámky k obálce balancu (100 CP)
- 100 CP Sarnů = 50 jednotek s dvojitými staty → stejný součet statů jako
  100 grycké pěchoty, ale poloviční cíl pro léčení (léčení je v CP) a menší
  ztráty počtem — vyváženo tím, že Grykové doplňují 2× rychleji a levněji.
- Brakkar vs Durgar: stejná „tvrdost", trpaslík ji nese v obraně (kovadlina),
  ork ve zbrani (kladivo). Oba pomalí — rozdíl dělá iniciativa střelců.
- Vhorrenské oživování se počítá z PADLÝCH po výhře → prohraná bitva nemrtvé
  nedoplní; magické poškození mágů je stálé, ale nedostane bonusy z převah.
- Otevřené otázky pro rozhodnutí: (1) jména nových frakcí a barvy, (2) horda
  — sedí navržená identita „sklo, které pálí"? (3) mapa pro 8 frakcí = 8 výsečí
  světa — spojit s dlouhými sezónami a regiony (bod 3 plánu), (4) trollové /
  mûmakové jako 25/100CP speciality přijdou až s regiony (odemykání táborů).
