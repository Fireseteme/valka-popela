# Válka popela — technická předloha projektu

> **Účel souboru:** trvalá reference stavu projektu pro Clauda (načítá se automaticky při práci v tomto adresáři, přežije /compact). **Po každé větší změně tento soubor aktualizuj** — verzi, konstanty, nové systémy, gotchas.

## Co to je
Browser strategie inspirovaná LotR: Rise to War. Vlastní IP — svět **Vellar**, 4 frakce: **aldar** (Lidé, modrá), **yllien** (elfové, tyrkys), **durgar** (orkové, oranžová), **horda** (Šarakhové/démoni, červená). Uživatel komunikuje **česky**. Cíl: multiplayer pro partu kamarádů přes Node server + Tailscale.

**Aktuální verze: v0.70** (**DOPŘEKLAD: JMÉNA RODŮ A STATICKÉ HTML** — po
přepnutí jazyka zůstávala část hry česky. Dvě příčiny:
1. **Jméno rodu** se bralo jako vlastní jméno Vellaru, jenže je jen ZPOLA
   vlastní — „Aldarské KRÁLOVSTVÍ" je popisný titul kolem jména Aldar.
   Překládá se proto obal a kmen zůstává; přepisují se i ŽIVÉ frakce a jejich
   členové, kteří si jméno kopírují při vzniku.
2. **`index.html` nikdo nepřekládal** a měřič pokrytí ho vůbec nečetl, takže
   hlásil nulu, i když byla celá horní lišta, tooltipy ikon a obrazovka „hrát
   s přáteli" česky. Statické prvky nově nesou `data-tx` / `data-tx-title` /
   `data-tx-ph` a doplňuje je `prelozStatickeHtml()` při každém přepnutí.
Ověřeno v prohlížeči průchodem celého DOM: v angličtině **nula českých
řetězců** (mimo značku „Válka popela" a vlastní jména Vellaru).
**Klientské, stačí reload.**
Dřív **v0.69** (**HRADBA S PŘÍKOPEM A ROZHOZENÉ PŘECHODY** — jedna řada zdi
šla obejít ROHEM hned vedle brány, takže pevnost přestala být jediným průchodem
k Trůnu. Úhlopříčný krok mění Manhattan o 0 nebo ±2, tedy přeskočí právě jednu
vrstvu; dvě řady to zavřou geometrií, aniž by přibylo, o co se musí bojovat.
Brána vede skrz obě: u vnitřních hradeb HRÁZÍ přímo před pevností, u vnějšího
prstence baštami klastru velké pevnosti. Platilo to na VŠECH velikostech mapy,
se zvětšením světa to nesouviselo.
**Druhá řada je ZÁMĚRNĚ VODA, ne zeď** (zadání uživatele): dvě zdi za sebou
vypadají jako dvě zdi, kdežto hradba s příkopem čte jako JEDNA. Příkop se kreslí
starým dílkem `river_a/river_b` — korytem od rohu k rohu, ne plnou deskou:
pole na vrstevnici Manhattanu se dotýkají jen ROHY, takže z desek byl řetěz
kaluží, kdežto koryta se v rohu potkají a příkop běží souvisle jako val vedle něj.
**PŘECHODY JSOU NEUTRÁLNÍ A MUSÍ SE DOBÝT** (zadání uživatele): vylézt
z kolébky je první objektiv sezóny. Neutrální je VNITŘNÍ břeh (v expanzním
pásu) — vnější leží v nedotknutelné kolébce, kam cizí rod nevstoupí, takže
zůstává rodu. ⚠ Obě strany neutrální brána NEUNESE: sim brána spadla na
53/64 (83 %), s neutrálním jen vnitřním břehem drží 58/64 (91 %). Přechod
taky přestal být uzel na dvě armády — je to stupeň 1 křivky, ne brána.
**A TŘI PŘECHODY PŘES DĚLIČ se rozhodily po řece** (zadání uživatele): každý
padne do jedné třetiny úseku své výseče, uvnitř třetiny náhodně, a losuje se
ZE SEEDU SVĚTA — proto se `BRIDGE_KEYS` přestavují na začátku `genMap`, ne jen
v `setMapRadius`. ⚠ Rozhozený přechod doputuje daleko, takže se musí vyhýbat
laterálním mostům, říčnímu pásu a okolí kapitálu (blok města 3×3 vedle sebe
stavbu nesnese — čtyři rody kvůli tomu přišly o město, než se to chytlo). **Mění se generátor mapy → projeví se až na
NOVÉM světě, běžící sezóna si nese starou mapu ve snímku.** Otisky map přepsány
popáté, sim brána beze změny 63/64.
Dřív **v0.68** (**ETAPA 11b: SVĚT DESETKRÁT VĚTŠÍ** — strop mapy
zvednutý z 461×461 na **1459×1459, tedy 2 128 681 polí a ~23 400 hráčů**.
Z tiku zmizely VŠECHNY průchody celým světem: AI hledá cíle v okolí svých
základen místo skenu mapy, `tickWorld` jede přes evidenci ŽIVÝCH POLÍ, výspy
se evidují, server otiskuje jen dotčené dlaždice (plus valivá kontrola) a mlhu
nepočítá vůbec. Snímek sezóny se ukládá po dávkách, mezi plnými snímky jen
PŘÍRŮSTKOVĚ a plný se rozepisuje přes víc tiků, takže zápis přestal záviset
na velikosti mapy i zastavovat hru. Město členovi se hledá od kapitálu ven,
ne průchodem světa (319 ms → 0,04 ms na město).
**Naměřeno na OSTRÉM VPS: tik na 461×461 z 1 816 ms na 123 ms**, a na
desetinásobné mapě 391 ms — pořád pod rozpočtem 1 000 ms.
Přibyl přepínač `VP_BEZ_AI=1` pro svět úplně bez AI rodů.
**Velikost mapy je nově PEVNÁ: 955×955** (zadání uživatele) — svět se přestal
šít na míru počtu přihlášených.
**Mění se game.js/server.js → restart serveru. NASAZENO 1. 9. 2026.**
Dřív **v0.67** (**MAPA UŽ NEVYPADÁ USEKNUTĚ** — hlášení uživatele
„skoro půlka mapy chybí". Generátor byl v pořádku (plný čtverec 4 761 polí);
vinu nesl okruh zájmu z etapy 11, který klientovi poslal 70 % mapy a zbytek
se neměl čím vykreslit. Na světě do 77×77 se AOI nepoužije vůbec (plný snímek
stojí 34 kB po kompresi), nad ním kreslí klient neznámou půdu jako SILUETU
a hranice světa se počítají z MAP_R, ne ze známých polí — kamera se tak
dostane i tam, kam ještě nevidí. **Mění se game.js → restart serveru.**
Dřív **v0.66** (**3D FIGURKY HRDINŮ — ETAPA 12 VZHLED KOMPLETNÍ** —
poslední bod z PLAN.md IV-J. Hrdinové i pochodující zástup se kreslí ve 3D
vrstvě místo plochých spritů: 49 modelů z TÝCHŽ blenderových stavitelů, ze
kterých se renderují portréty, barva ve vrcholech (dva materiály na figurku),
načítání až na vyžádání, kontaktní stíny v jedné instancované dávce.
**Klientské, stačí reload.** Dřív **v0.65** (**ETAPA 12b KOMPLETNÍ: HRA MLUVÍ TŘEMI JAZYKY** —
čeština, angličtina a španělština v CELÉ hře. Server jede česky a posílá do
kroniky i do bojového reportu KLÍČE, větu skládá klient ve svém jazyce; obsahové
tabulky (budovy, jednotky, dovednosti, kapitoly, rysy, truhly, pasivky) se při
přepnutí jazyka přepíšou ze slovníku a čeština v nich zůstává jako předloha.
Rozhraní ve hře je na nule zbývajících českých řádků. **1 983 klíčů × 3 jazyky,
50 asercí.** Jména Vellaru se nepřekládají a hlídá to test.
**Mění se game.js/net.js → restart serveru.** Dřív **v0.64**
(**VZDUŠNÁ PERSPEKTIVA A CESTY MEZI STAVBAMI** —
dokončení bodu 5 z PLAN.md IV-J. Dálka se ztrácí do barvy oblohy (u ortografické
kamery jediný zbývající signál hloubky; závoj se s přiblížením vytrácí sám
a předává štafetu tilt-shiftu) a síť cest spojuje kapitál s městy, výspami
a pevnostmi přes vlastní půdu — roste tedy se záborem. **Klientské, stačí
reload.** Dřív **v0.63** (**KŘIVKA VELENÍ 300 + 100 ZA ÚROVEŇ, POBŘEŽÍ A FILTR
JAKO NABÍDKA** — hrdina 1. úrovně veze 300 CP místo 1 112, takže ⚔1 je lehké,
⚔10 předpokládané a ⚔15 stojí čtvrtinu armády; vrchol křivky zůstal (úr. 50 =
5 200). Svět nově končí MOŘEM místo utrženého pole a nedosažitelné kapsy se
zatopily. Osm tlačítek filtrů se zabalilo do jednoho s nabídkou.
**Mění se generátor mapy → nové světy, restart serveru.** Dřív **v0.62**
(**ETAPA 12b: JAZYKY — KOSTRA, ANGLIČTINA A ŠPANĚLŠTINA**
— slovník `js/jazyky.js` s `tx()`, jazyk na ÚČTU, server posílá do kroniky KLÍČE
místo hotových vět a domovská síň, účty i titulky oken jedou ve třech jazycích.
Jména Vellaru se zásadně nepřekládají. **Mění se game.js/net.js/server.js →
restart serveru.** Dřív **v0.61** (**ETAPA 11: MMO MĚŘÍTKO** — mapa až 461×461, AOI
(hráč dostává jen svůj okruh zájmu místo 21 MB celé mapy), jeden průchod mapou
za tik místo skenu na každého aktéra (tik 490 → 304 ms), zastropovaný akční
rádius, vidění sdílené po klanu a mapa vztahů.
**Mění se game.js/net.js/server.js → restart serveru.** Dřív **v0.60**
(**ETAPA 10: POLITIKA — ROZHODUJÍCÍ KLAN, HLASOVÁNÍ,
SPOJENCI** — válku za rod vyhlašuje klan s nejvyšší kumulativní silou, uvnitř
nejdřív shoda rady a pak hlasování členů (nejméně 10 %); z toho vznikne vyhlášení
s odpočtem, válka je OBOUSTRANNÁ, trvá nejméně tři dny a po míru jsou tři dny
klidu. Spojenec je jeden na rod a sdílí dohled, průchod i hranici pro zábor.
**Mění se game.js/net.js/server.js → restart serveru.** Dřív **v0.59**
(**ETAPA 9 KOMPLETNÍ: KLANOVÁ BURZA** — tři oddělené
přihrádky (suroviny nejméně 1:1, výbava za stejnou raritu, dárky za stejný tier),
poplatek 6/12/24 jader za kus a 15 % objemu ve zlatě, platí obě strany napůl,
nabízející formou ÚSCHOVY při vystavení. Úschova je v téže databázi jako účty
a všechny vratky visí na atomickém přechodu stavu nabídky, takže se vrací právě
jednou i přes restart. **Mění se game.js/net.js/server.js → restart serveru.**
Dřív **v0.58** (**JEDEN MAIL VYŘÍDÍ OVĚŘENÍ I UVÍTACÍ JÁDRA
+ KRONIKA JAKO SERVEROVÝ KANÁL** — registrovaný účet začíná s nulou a s čekající
dávkou 5 000 jader, kterou vyzvedne odkaz z mailu a tím zároveň potvrdí adresu;
kronika se přestala posílat celá všem (dala se číst kronika cizího rodu přímo
z drátu) a jde po kusech ve třech úrovních svět / rod / osobní.
**Mění se game.js/net.js/server.js → restart serveru.** Dřív **v0.57** (**SEZÓNA
14 DNÍ + ETAPA 9: CHAT A KLANOVÉ REPORTY** —
výchozí délka sezóny je nově CÍLOVÝCH 336 h (dřív testovací hodina; sólo přepínač
`index.html?sezona=1`), přibyly tři chatové kanály (svět / klan / soukromý)
rozesílané po kusech jako reporty a bojové reporty se dělí na MOJE a KLANOVÉ.
**Mění se game.js/net.js/server.js → restart serveru.** Dřív **v0.56** (**ETAPA 8: KLANY — TŘETÍ ÚROVEŇ VLASTNICTVÍ POLE** —
klan je entita uvnitř rodu (rod → člen → KLAN), drží vlastní pole, staví klanové
pevnosti na dobytých uzlech 2×2, které promítají dosah pro výspy členů, a vyhazov
je STAV, ne dialog: kdo odmítne výpověď, stane se vyvrhelem a ztratí frakční pouta
— spoluhráči ho nebrání, nesdílí s ním hranici ani dohled a jeho pole jsou pro rod
nepřátelská. Zároveň se PŘEFORMULOVALA SIM BRÁNA (`tests/sim-brana.js`, dřív
`sim-etapa3.js`) a změřilo se, že AI neprojde ani jednou branou vnějšího prstence.
**Mění se game.js/net.js/server.js → restart serveru.** Dřív **v0.55** (**ETAPA 7
KOMPLETNÍ: DĚLIČ KOLÉBKY, OKNO ZRANĚNÍ, KEEPY KRAJŮ, RALLY A BOJOVÝ LOG PO KOLECH** — od prvního útoku se posádka neutrálního pole přestane hojit a postup se SČÍTÁ napříč útočníky (15 min běžná pole, 60 min uzly a stavby); po vypršení okna plný reset. Na to sedají KEEPY KRAJŮ: jeden na kraj (devět), blok 5×5 uprostřed sporného pásu, posádka 12 000 = trojnásobek velké pevnosti, takže se nedá vzít jedním zátahem. Kdo drží keep, drží kraj. Rozeseté „svobodné města" se přestala generovat. **Mění se generátor mapy → nové světy, restart serveru.** Dřív v témže kroku **VÝCVIK PODLE OBJEMU, VÝNOSY ZA HODINU A CENY BUDOV AŽ NA MILION** — doba výcviku roste s body velení (0,12 s za CP baseline, škáluje se délkou sezóny jako doby stavby), fronta se odbavuje POSTUPNĚ, zakázka jde zrušit s poměrnou vratkou a čas je vidět dřív, než hráč objednávku potvrdí; výnosy se všude ukazují ZA HODINU místo za vteřinu. **Mění se game.js/net.js/server.js → restart serveru.** Dřív v témže kroku **BEZ ŽOLDU A S HOTOVOU STARTOVNÍ ARMÁDOU** — každý začíná se 4 500 CP (3 000 T1 + 1 500 T2), armáda nežere jídlo a pochod nestojí zlato; brzdou je strop velení, ne ekonomika. Dřív v témže kroku **ETAPA 7: ŘETĚZ BITEV O STOH + NEDOTKNUTELNÁ KOLÉBKA** — výseč se dělí na kolébku (s kapitálem, do které cizí rod NIKDY nevstoupí) a sporný expanzní pás; kapitál se tím nedá dobýt a tlak se přesouvá na crossing. Dřív v témže kroku: hráčský stoh se brání řetězem jednotlivých bitev: útok porazí vždy jen jednu armádu, poražený obránce se stáhne a ostatní brání dál, takže dobýt pole se 200 hrdiny znamená 200 zátahů. U cizího stohu je vidět POČET armád, ne jejich síla. **Dřív **v0.52** (**ETAPA 6 KOMPLETNÍ** — přední a zadní linie (mellee nedosáhne na střelce přes clonu, jízda tenkou clonu prorazí), rebase měřítka velení na ~5 200 CP na úrovni 50 se všemi závislými konstantami, práh obrany 100 CP (prázdný batoh přestal být nejlevnější zeď ve hře) a **vlajkové jednotky T4 pro všech osm rodů**. Formace zůstávají TŘI a hráč si vybírá SLOŽENÍ: v panelu vidí zásobník vycvičených jednotek a přetáhne je do tří slotů. Bojový report nově ukazuje SESTAVY obou stran s rolí formací a STŘETY — kdo na koho mířil. A kapacita sezóny se přestala počítat z toho, kolik se vejde měst (69×69 → 30 na frakci, ale jen 18 polí na hlavu proti slíbenému stropu 80) a počítá se ze ZEMĚ: svět se při startu sezóny šije na míru počtu přihlášených (50 lidí → 69×69, 800 → 271×271). Vlajky mají schopnosti (taunt, lifesteal, aura šílenství i na vlastní řady, konverze, škálování zlatem) a AI je staví i nasazuje. Z IV-O přibyly budovy pro dlouhou sezónu (hlavní budova na 8, doby stavby jako podíl sezóny, akademie +100 velení za úroveň) a DRUHÝ ROD: od hlavní budovy 8 si hráč jednou za sezónu vybere spojence své strany a verbuje jeho základní jednotky, takže si může postavit cizí clonu před vlastní střelce. Tier se stal osou síly (+5 % za stupeň), legendárka je archetyp rodu a přibyl sedmý rys HEALER, takže hrdinů je 56. Reset sezóny nuluje sílu a nechává sbírku. Všechny bojové kotvy PŘEMĚŘENÉ a přepínač vypnutý — pavučina counterů má nové kruhy, bez výhry není nikdo. Obránci mají POŘADÍ: neutrální objektiv se brání od nejslabšího (poslední vlna je boss), hráčský stoh vede ten, kdo na poli stojí nejdéle; **mění se server i klient → restart serveru**; níže. Dřív **v0.51** (**E-MAIL U ÚČTU — ETAPA 5 KOMPLETNÍ** — registrace nově vyžaduje e-mail a síň je do potvrzení odkazem zamčená (ani trvalé přihlášení tokenem to neobejde); přibyl reset zapomenutého hesla přes jednorázový odkaz s hodinovou platností. Odesílá se přes Resend, klíč čte server z prostředí a bez něj se maily jen vypíšou do logu, takže hra běží dál. Účty založené dřív zůstávají funkční a v Profilu si můžou adresu doplnit — nová čeká na potvrzení a do té doby se přístup nemění; **mění se server i klient → restart serveru**; níže. Dřív **v0.50** — **POŠTA REPORTŮ A KOMPRESE** — dokončení etapy 5. Hráči nově chodí JEN jeho bitvy: report nese seznam účastníků a server má pro každého hráče schránku se stavem „přečteno" na ÚČTU (přežije reload, jiné zařízení i restart serveru). Dřív dostával každý každou bitvu světa a při ~390 reportech za hodinu vydržel strop 40 šest minut, než hráči vypadly vlastní bitvy mezi souboji AI. K tomu zapnutá komprese WebSocketu — naměřeno na socketu 847 KB → 102 KB za 30 s hry, tedy 88 % dolů (240 hráčů: 53 → 6,4 Mbit/s), a projde i přes Caddy; **mění se server i klient → restart serveru**; níže. Dřív **v0.49** — **SLIDER RODŮ** — výběr frakce na domově byl mřížka osmi jmen s číslem „0/30", což hráči, který se upisuje na dva týdny, o rodu neřeklo nic. Nově je to slider: jedna karta = jeden rod s portrétem, rasou a povahou, bonusem, startovním hrdinou, signature kusem, jednotkami a obsazeností; listuje se šipkami, záložkami, přejetím prstu i klávesnicí. Proužek osmi mini-záložek pod ním drží přehled obsazenosti všech rodů naráz; **klientské — stačí reload**; níže. Dřív **v0.48** — **DOMOVSKÁ SÍŇ** — hra má konečně vstupní obrazovku: nepřihlášenému řekne, co Válka popela je (svět, tři pilíře, osm rodů s povahou) a nabídne účet; přihlášenému dá domov se čtyřmi záložkami — Sezóna (odpočet na vteřiny, obsazenost frakcí, přihlášení jedním klikem), Síň hrdinů, Výbava (tentýž panel truhel a skladu jako ve hře) a Profil. Starý výběr frakce žije dál za tlačítkem „Hrát hned s přáteli". Nový `js/domov.js`; cestou opraveno, že po přihlášení k účtu chybělo lobby s vlastní přihláškou a že ruční ukončení sezóny neotevřelo zápisy; **mění se server i klient → restart serveru**; níže. Dřív **v0.47** — **ROZVRH SEZÓN** — sezóna má pevný termín a hráči se do ní předem přihlašují za konkrétní frakci; v termínu se spustí sama se všemi přihlášenými, ať jsou online nebo ne. Místo ve světě drží ÚČET, ne spojení, takže hráč najde své město i z jiného zařízení a i když dorazí týden po startu. `CLENU_MAX` přestal být umělá 4 — kapacita se při startu MĚŘÍ z mapy (69×69 → 30, 111×111 → 105, což je těch cílených 800 hráčů). Ruční start z lobby zůstává jako obcházka; **mění se server → restart serveru**; níže. Dřív **v0.46** — **NESMRTELNOST SEZÓNY** — restart serveru, a to je i každé nasazení opravy, už nezahodí rozehraný svět: stav se každých 10 tiků a navíc při vypínání ukládá do gzipovaného snímku (`data/sezona.json.gz`, 57 KB za 1,4 ms) a server se po startu zvedne přesně v tom tiku, kde skončil. Sezóna se měří v TICÍCH, ne hodinami na zdi, takže ji výpadek jen pozastaví, nezkrátí; hráč se tokenem vrátí ke své frakci i aktérovi. Ověřeno i na ostrém serveru přes `systemctl restart`; **mění se server → restart serveru**; níže. Dřív **v0.45** — **ÚČTY V SQLITE** — první kus etapy 5: účty přestaly žít v jednom přepisovaném JSON souboru a přesunuly se do SQLite přes vestavěný `node:sqlite` (Node 22+, žádná nativní závislost). Starý `accounts.json` se při prvním spuštění sám převede a přejmenuje. Model se nezměnil — server drží účty v paměti a mutuje je na místě, databáze je jen trvalá vrstva pod tím; **restart serveru**; níže. Dřív **v0.44** — **DÁRKY PO SKUPINÁCH A NOVÁ CENA ODDANOSTI** — hodnota dárku roste s tierem (10/100/300 oddanosti), odemčení stojí VŽDY 30 kusů a druhá hvězda 10/7/5; vzácnost se tím přesunula z cenovky do dropu. Dárek navíc nepatří hrdinovi, ale RODU A TIERU (`fkey:t<tier>`) — „epický dar hordy" nakrmí kteréhokoli epického hrdinu hordy, takže mrtvý drop zmizel a sbírka je likvidní (24 druhů místo 48); **mění se game.js/net.js/server.js → restart serveru**; níže. Dřív **v0.43** — **DÁRKY JAKO PŘEDMĚTY** — dárek z truhly se už neaplikuje sám: padá do skladu na účtu (`acc.darky`, počítadlo klíč→počet), stohuje se a hráč ho použije z okna hrdiny nebo ze Skladu tlačítkem „Použít 1" / „Použít vše". Duplicitní dárek tím přestal být mrtvý drop a připravuje se tak klanová burza z etapy 9; **mění se game.js/net.js/server.js → restart serveru**; níže. Dřív **v0.42** — **ODDANOST, SÍŇ, DOHLED A ZÁBOR PO ROZÍCH** — čtyři zadání v jedné dávce: (1) pruh oddanosti v okně hrdiny počítal cenu hvězdy BEZ TIERU, takže legendárnímu hrdinovi ukazoval „270/100" místo 270/1080 a vypadalo to, že progres stojí — progrese přitom byla v pořádku; zvací list nasbíranou oddanost nemaže ani neutrácí, jen odemyká, a povyšování je nově smyčka; (2) Síň hrdinů přepsaná na mřížku karet s portrétem v rámu tieru, hvězdami a pruhem oddanosti i u odemčených — a okno se na tuhle záložku roztáhne na 880 px; (3) hrdina v poli dohlédne o pole dál (`DOHLED_HRDINA` 2 → 3); (4) **zábor jde nově i po ROZÍCH** (na obrazovce směr „+", nejen „X") s pravidlem „bez řezání rohů", bez kterého by šlo proklouznout mezi dvěma poli hradeb dovnitř prstence; **mění se game.js/net.js/server.js → restart serveru**; níže. Dřív **v0.41** — **ŘEKA JAKO JEDNA HLADINA + MOST PŘES CELÝ TOK**: vodní pole je hladká deska přes celé pole bez lemu a bez fazety, takže pás tří polí splyne v JEDNU řeku místo tří potůčků vedle sebe; písčitý břeh se přidává zvlášť jen na hrany, za kterými voda opravdu končí (tři varianty, aby se dlouhé pobřeží neopakovalo dlaždici po dlaždici), a most je nástavba nad obyčejným dílkem biomu: dvě hlavy na protilehlých březích, jejichž lávky se potkají nad středem toku. Při té příležitosti opraveny čtyři **úhlopříčné mosty, které stály dvě pole od vody na suchu**; nový nástroj `art/blender/nahled_mapy.py` fotí kus mapy tak, jak ho skládá renderer; **mění se generátor mapy → nové světy, restart serveru**; níže. Dřív **v0.40** — **ŘEKY PÁS 3 POLÍ + MOSTY JAKO DVOJICE BŘEHŮ**: hranice výsečí je teď skutečná překážka; přechod tvoří dva mostní břehy spojené přes vodu, každý bráněný dvěma armádami velitelů úrovně 35, takže přejít řeku znamená dobýt oba; **mění se generátor mapy → nové světy, restart serveru**; níže. Dřív **v0.39**, dvě souběžné části — **ÚZEMÍ V LIŠTĚ A ODEBÍRÁNÍ POLÍ**: odznak 🗺 X/strop v horní liště otevírá seznam držených polí řazený od nejsilnějšího, řádek skáče kamerou a pole jde odsud i z mapy poslat vyklidit (`ABANDON_TICKS` 300 = 5 min, jde zrušit; kapitál/výspa/pole s hrdinou zamčené); k výběru hrdiny přibyla **výdrž „kolik z kolika"**; **mění se game.js/net.js/server.js → restart serveru**; níže. A **INVENTÁŘ S IKONKAMI, FILTRY A SKLAD** — každý DRUH kusu má vlastní generovanou SVG ikonku řízenou významem jména (itemZaklad + itemArtURL; dvě „Čepele z jam" = stejná, „Popelný sekáč" = jiná); mřížka 50+ dlaždic s odznaky, klik = detail; filtry rarita/set/slot; nepoužitelné kusy VŽDY dospod v inventáři hrdiny; globální Sklad jako záložka okna 💠 (i v lobby — MP přes profileMsg.invItems); ikonky i v kovárně, odhalení truhly a slotech hrdiny; níže). Dřív: **v0.38 TRUHLY: DÁVKA 5× + PODLE FRAKCE + ZVACÍ LISTY MÍŘÍ VÝŠ** — nové tlačítko „Otevřít 5×" za `bulkCost` 1900 💠 místo 5×400 (atomicky, denní zdarma nespotřebuje); okno truhel se nově řídí stranou frakce, za kterou hráč hraje (dřív natvrdo „dobro", takže hráč zla fasoval nenasaditelnou výbavu dobra), ruční přepnutí hlásí varování; k tomu — jistota po 200 truhlách losuje jen epické/legendární (70 % legendární, `INVITE_PITY_TIER_W`), vysbíraný tier přeteče na nejbližší se zamčeným hrdinou (konec duplikátů, dokud je koho odemykat) a oslava odemčení už nezávisí na otevřeném panelu truhel; **mění se game.js → uživatel musí restartovat server**; níže). Dřív: **v0.37 VÝSPU STAVÍ HRDINA NA POLI** — tlačítko 🗼 přibylo do větve hrdiny v panelu pole i jako bublina radiálního kola; UI ho nově nenabízí tam, kde by `buildOutpost` tiše selhal (bloky 2×2/3×3) — sdílený `lzeStavetVyspu`; klientské, stačí reload; níže). Dřív: **v0.36 UX: oslavy odemčení + tvrdý strop vstupů jednotek** — zvací list/dárkové odemčení hrdiny i R10 signature (♥10) vyskočí slavnostním oknem (portrét/kus, rod, pasivka; fronta oslav; i z denního obchodu); vstupy jednotek (pochod/posily/kolo/výspa) se ořezávají na rozpočet velení v CP a nejde zadat víc, než hrdina uveze; oprava měření posil z kusů na CP (sarn); klientské — stačí reload; níže). Dřív: **v0.35 ODDANOST JAKO POSTUP HRDINY** — R1 dva startovní stromy, ♥3 třetí, ♥5 čtvrtý, R10 = ♥10 odemyká signature kus (jistota vedle truhly a Trůnu); AI bránu obchází (faction.isAI, server-authoritative); signature balíček na startu jen pro AI (parita s rastrem), hráč začíná bez sigu; TREE_VERSION 3 — migrace čistí stromy, vrací body a zpětně grantuje sig ♥10+ hrdinům; štítky ♥3/♥5 na zamčených uzlech; níže). Dřív: **v0.34 SIGNATURE INTERMEZZO** — sigy starterů přeladěny na archetypy kitů a zapojeny do referenčního buildu rastru jako páky pavučiny; Edran bez zásahu = špička záměrem uživatele (hlídá se, že ve výhrách krvácí ≥ 15 %); frakční amplifikátory vsDmg schváleny; kruhy brakkar>horda>vhorren>brakkar a durgar>vhorren>gryk>durgar; allow-list v test-rastr.js ZRUŠEN; níže). Dřív: **v0.33 ETAPA 4d: DELTA SNAPSHOTY + VIEWPORT + MINIMAPA + VELIKOST MAPY** — síť posílá jen změněné dlaždice (498 KB → ~13 KB/tik), mapLayer je výřez kolem kamery místo celosvětového rastru (394 MB → ~16 MB), minimapa s rámečkem pohledu a skokem kamery, velikost světa je knob `node server/server.js 8123 336 51` s byte-identickou výchozí mapou; ETAPA 4 KOMPLETNÍ; níže). Dřív: **v0.32 ETAPA 4c: HRÁČ-UVNITŘ-FRAKCE** — až 4 hráči sdílí frakci, každý = „aktér" s vlastním městem 3×3, surovinami, hrdiny, územím (t.clen), Prstenem i příběhem; zakladatel cid 0 = frakční objekt sám (sólo/AI beze změny), diplomacie/války/zóny zůstávají frakční, obrana polí je společná; oprava v0.31: nájezd dobývá pole → strop bez výjimky; níže). Dřív: **v0.31 ETAPA 4b: STROM PRSTENU + STROP ÚZEMÍ + KAPITOLY + CHECKPOINTY** — 6 větví stromu místo automatik („za Prsten nic automaticky"), strop území 80→216 ze tří zdrojů (Nadvláda/kapitoly/checkpointy) s výjimkou Trůnu a nájezdů, osobní příběh sezóny per frakce (AI plní přirozeně), kolektivní checkpointy s pozdním uznáním; níže). Dřív: **v0.30 ETAPA 4a: ŽÍLY + DVOU-ARMÁDOVÉ UZLY 2×2 + ZÓNY SVĚTA** — generátor žil (uzly 200+ vždy 2×2 s konkrétní surovinou a prstencem stejné suroviny, nikdy vedle sebe, ochranné zóny hradů a bran), neutrální uzel brání DVĚ armády na jeden zátah (neúspěch = plný reset + 15 min uzávěra), mapa se otevírá 4 fázemi (checkpointy + časové pojistky), AI jede vlastní drahou s koncovkou, gate STATISTICKÝ 62/64; níže). Dřív: **v0.29 ETAPA 3: AKČNÍ RÁDIUS ZÁKLADEN + OBLÉHACÍ OKNA + VÁLKA + VYKOŘENĚNÍ** — REACH 20 od kapitálu/usazené výspy, odolnost velkých staveb s okny a bouráním, vyhlášení války s postihem kraje, kapitál na nule = přesídlení; AI staví výspy k Trůnu; níže). Dřív: **v0.28 ETAPA 2: KITY STARTOVNÍ OSMIČKY + NOVÉ BOJOVÉ EFEKTY + RASTR BALANCU** — 8 archetypových stromů, slowEnemy/shred/roundHeal/cauter/harvest, přeladěné FACTION_UNITS na CP paritu, čistá pavučina counterů; níže). Dřív: **v0.27 ETAPA 1** — síň hrdinů po stranách, startovní hrdina přidělený frakcí, konec najímání za zlato, truhla 400 + denně zdarma + zvací listy + wishlist, oddanost dle tieru, rotující denní obchod, akademie velení, lišta 5 ikon, sloupec portrétů, presety sestav; níže). Dřív: **v0.26 ČEKAJÍCÍ ROZKAZY** — potvrzovací kolo útoku umí doplnit armádu: doma úpravou nákladu, v poli posilami s rozkazem „po doručení zaútoč"; níže). Dřív: **v0.25 VÝTVARNÉ DLUHY SPLACENY** — vlastní biomy, figurky, velké rendery a signature itemy čtyř nových rodů; níže). Dřív: **v0.24 DLOUHÉ SEZÓNY** — výhra držením Trůnu = Koruna popela, Prsten popela + body činu, kraje Vellaru, nastavitelná délka sezóny, domovská síň; níže). Dřív: **v0.23 OSM FRAKCÍ + DVOJNÁSOBNÝ SVĚT** — 4 nové rody dle papírové tabulky, svět 69×69 v osmi výsečích, každý segment 2×; níže). Dřív: **v0.22 VELKÉ STOPY STAVEB** — města, kapitály a Trůn zabírají 3×3 pole, silná pole stupně 9+ srůstají do bloků 2×2 s dvojnásobnou posádkou; jeden blok = jedna bitva = zábor celku. Předtím **v0.21 MAPA NA ČTVERCE „NA KOSO"** — svět je čtvercová mřížka otočená na obrazovce o 45°, velký diamant jako v předloze; sousedé 4, vzdálenosti Manhattan, hradby prstenc jako čtverce s branami v rozích, řeky jako koryta přes rohy dílků; 2026-08-28. Dřív: v0.18 verbovací zakázka + tržnice + smůla truhel, v0.19 boj po formacích + obléhání, v0.20 pasivky výbavy + slovník stavů; v0.16 mapa ve 3D (three.js), v0.17 zapečené povrchy). Terén a stavby jsou 3D modely z Blenderu, hrdinové a efekty zůstaly 2D překryvem.

## Spuštění a soubory
- **Server:** `node server/server.js` → http://localhost:8123. Uživatel spouští `start-server.bat`. Testy: `node server/server.js 8200` na jiném portu (background, pak TaskStop).
- **launch.json:** config `valka-popela` (Node server), `valka-popela-static` (serve.ps1 fallback).
- **DŮLEŽITÉ:** po změně `js/game.js` nebo `server/server.js` musí uživatel **restartovat start-server.bat** (jeho živý server na :8123); klientské změny (render/main/style/html) stačí reload stránky. Vždy to připomeň v závěrečné zprávě.

| Soubor | Role |
|---|---|
| `js/game.js` | Veškerá herní logika, běží v prohlížeči I v Node (module.exports na konci — nové mutující funkce přidávej do exportů!) |
| `js/render.js` | 2D překryv: figurky hrdinů, pochody, jmenovky, mlha, filtry, efekty (+ souřadnice a stav kamery) |
| `js/render3d.js` | **3D vrstva mapy** (ES modul, three.js) — terén a stavby, `window.R3` |
| `js/vendor/three/` | Vendorovaný three.js 0.185 (mimo package.json) — od v0.56 i `addons/postprocessing` |
| `js/main.js` | UI: panely, radiální menu, verbování, top bar, overlay okna |
| `js/domov.js` | **Domovská síň** (v0.48): uvítací stránka, rozcestník po přihlášení, přihlášky do sezóny |
| `js/net.js` | MP klient — NET_CMDS přepisuje mutující globály na síťové příkazy |
| `server/server.js` | Autoritativní server: CMDS zrcadlí NET_CMDS, snapshoty G každý tik |
| `server/ucty.js` | Úložiště účtů v SQLite (v0.45) |
| `server/sezona.js` | Snímky rozehrané sezóny (v0.46) |
| `server/rozvrh.js` | Rozvrh sezón a přihlášky (v0.47) |
| `server/mail.js` | Odesílání e-mailů přes Resend (v0.51); klíč z prostředí, bez něj jen loguje |
| `js/sfx.js`, `js/portraits.js` | WebAudio synth zvuky; SVG portréty hrdinů |
| `index.html`, `style.css` | Layout, top bar (5 surovin), filtry, overlaye |

**Bojové reporty (RtW předloha, v0.5):** simulateBattle vrací navíc `tot` {dmgA/D, cmdA/D (velitel: zbraň×mody+kouzla), revA/D} a `remD`; report nese fkey/heroDef/level obou stran, leadName, heroHp/heroFell, tot, remD. UI: `renderReportWindow` (seznam vlevo, `readReports` Set + unreadReportCount, „vše přečteno"), `cmdrBlockHtml` (portrét/militia štít, úroveň, HP, pruh armády), banner DOBYTO/UBRÁNĚNO, `.rw-stats` souhrn, kola v `<details>`. Staré reporty bez `tot` jsou ošetřené fallbackem.

**Fáze 1 auditu RtW (v0.7, 2026-08-25) — HOTOVÁ:** plán auditu (3 fáze, 39 nálezů) je v REFERENCE-UI.md; všechny 3 fáze HOTOVÉ. Uděláno: karta Staty má `.stat-big-row` (4 dlaždice ⚔🛡🗡⚡) + dole `.eq-slot-row` se sloty `[data-goslot]` (klik → tab equip, binding oddělen od `[data-slot]`!); hlavička: `.lvl-badge` (zlatý hexagon na portrétu), `.hw-stars` (zobrazovací ★ = ceil(level/2)), ikona třídy TRAIT_ICONS, `.xp-num` v XP baru; souhvězdí: `.const-hero` (sprite hrdiny za uzly, opacity 0.34, mask fade), SMIL jiskry `.spark` + běžící `.lit-dash` na rozsvícených spojnicích, zlaté conic-gradient prstence `.cn-circle::before`, pulz known, locked přes grayscale filtr, serif `.cn-name`; `.hero-dialog` šum (feTurbulence data-URI) + dvojitý zlatý rám. **Stack efekty**: eff typy stackAtk/stackDef (heroStats → atkHero/defHero → simulateBattle: S.stacks++ za dokončené kolo s velitelem, sideAtk/Def přičítá stacks×val, note v 1. kole); skilly převedeny: aldar Edran „Zákopnictví" stackDef 0.5, horda Ghazk „Popelný hněv" stackAtk 0.5; effText+EFF_ICONS (📈/🧱) doplněny. 5★ náhled: `.cmp-line.max5` na kartách + v kovárně (value×2.25).

**Audit 2 / Fáze A (v0.10, 2026-08-26) — HOTOVÁ; ČEKÁ Fáze B a C** (plán: REFERENCE-UI.md „# Audit 2"). **Strom 12 uzlů**: `tree` je PLOCHÉ pole — nejdřív 4 hlavní (`max: MAIN_MAX_RANK`=15, poslední `ult: true`), pak 8 podřízených (`max: SUB_MAX_RANK`=7, `parent` + `branch` 0/1, volitelně `req`). Za HERO_DEFS běží **dekorátor** (doplní `s.main`/`s.slot` 0–3) + validátor, který při chybě definice **throwne při načtení** (duplicitní klíč, maxEff na podřízené, špatné maxy, hlavní za podřízenými, neznámý rodič, ult mimo slot 3) — konstanty tvaru stromu jsou proto deklarované NAD HERO_DEFS (TDZ!). Gating: `skillUnlocked(hero, skill)` — hlavní podle `SKILL_UNLOCK_MAIN=[0,8,18,30]` investovaných bodů, podřízené podle ranku rodiče (`SUB_REQ`=3). Staré `SKILL_UNLOCK`/`CONST_POS`/`CONST_LINKS` SMAZÁNY. **Úrovně 50**: per-level HP 3,5 / ATK-DEF 0,09 / DMG 0,6 / CAP 15 (úr. 50 ≈ dřívější 30: hp 272, atk+def 6,41, dmg 37, velení 935); `xpForLevel = 25·l^1.4` (121 549 XP na max); `skillPtGainAt` = 1 za každou úroveň → `totalSkillPtsForLevel(l) = l−1` (49) + 1/hvězdu (25) = **74 ze 116**; RESPEC_GOLD_PER_POINT 40→15, freeRespecs 1→**2**. Dorovnáno: duel cut `6+1,8×level`, duelPower `level×6`, aiSpendSkills safety 24. Vrcholná dovednost má 15 ranků → mapové FX (`ultFxFor`, jmenovka v soupisu) se zapínají až při **rank ≥ max**. **Migrace účtů**: `TREE_VERSION=2`, `migrateAccount` při `acc.treeV < 2` vymaže `skills` a přepočte `skillPts` — **značka `treeV` je na ÚČTU, nikdy v heroProgress** (jinak by ji syncAccountFromFaction přepsal a každý sync by mazal živé stromy); server i klient si předtím udělají zálohu (`accounts.json.v1.bak`, localStorage `vp-account-v1-bak`) a jednou oznámí `respecNote`. `applyAccountToHero` staví `h.skills` průchodem přes strom (ořez neznámých klíčů a ranků nad max) a volá `heroGainXp(...,0)` kvůli dolevlování po změně XP křivky. UI: `treeLayout()` = PROVIZORNÍ mřížka 4 sloupců (orbity přijdou ve Fázi C), uzly mají třídy `.main`/`.sub` (modré, menší, jméno jen v title), `effNum()` = české desetinné čárky. Dárková měna se v UI jmenuje **oddanost** (interní `heroRespect`/`respectForStar`/`.respect-bar` BEZE ZMĚNY). Testy: `tests/test-stromy.js` (700 asercí vč. kotev křivky dobývání ⚔10→9, ⚔15→25, ⚔30→46, ⚔90→101, ⚔300→363).

**Audit 2 / Fáze B (v0.11, 2026-08-26) — HOTOVÁ.** **Mistrovské bonusy za 15/15**: `TRAIT_MAX_EFFS[rys][slot 0–3]` (6 rysů × 4) — dekorátor je stampuje do `s.maxEff` každé hlavní dovednosti BEZ vlastního maxEff a nastaví `s.maxEffTrait=true`; validátor teď vyžaduje, aby hlavní bonus měla vždy. Výsledek: **24 vlastních** (slot 3 = jedinečný odkaz na bývalou ultimátku) + **72 z rysu** (sloty 0–2), 0 na větvích. Ze slotů 0–2 bylo odebráno 7 ručních maxEff, které tabulku duplikovaly. Obsah tabulky: attack [atk 1,5 / followUp 15 / **roundDmg 35 %, 2 cíle, 1. kolo** / strike 12], shield [def 1,5 / stunImmune / **avoidCharge 1** / holdDef 20], swift [spd 1 / speed 8 / fastReturn 25 / instantReturn], tireless [hp 40 / regen 25 / stam 12 / noCooldown], warlord [cap 50 / rally 15 / **roundArmy 25 %, každé 3. kolo** / dmg 6], mystic [spell 8 / ward 8 / stunChance 8 / ignoreDef]. **Kolové aktivky**: eff typy `roundDmg` (poškození velitele × `targets`) a `roundArmy` (+% poškození JEDNOTEK) s `timing:{round:N}` nebo `{every:N}`; `ROUND_EFF_TYPES` je heroEff PŘESKAKUJE (nesčítají se do skaláru), sbírá je **`heroActives`** (jako heroCondEffs, bere i maxEff a signature) → heroStats `actives`/`armyActives` → resolveMarch do atkHero i defHero (kapitán domobrany NIKDY) → simulateBattle: `activeFires(a,r)` (deterministické, bez rng), `activeDmg(S,E)` v hitD/hitA se přičítá do `v` i `tot.cmd`, roundArmy násobí `p` v sideDmg; omráčený velitel aktivku nespustí (`act(S)`). **Obranné chargy**: `avoidCharge` (počet) + `avoidChance` (%; při charge bez chance se dopočte 100) → `S.avoid` v simulateBattle, na začátku `applyDamage` seeded roll pohltí CELÝ úder kola a přičte do `tot.avoidA/D` — funguje i při omráčení (je to obrana armády). Silné (2 chargy = ztráty 360→38), proto jen jako odměna za 15/15. UI: `roundEffText` (⏱ časování + [proti N cílům]), `effLine` je dispatchuje, EFF_ICONS ⏱/📯/🛡/🔁, řádky na kartě Staty, „Pohlcené poškození" v reportu, sekce **🏅 Mistrovství (X/4)** v tabu Unikát (`masteryHtml`, `.uq-card.mastery`). Testy: `tests/test-boj.js` (57 asercí; POZOR měřit `tot.dmgA`, ne `defKilled` — ten se zasytí, a proti obří přesile, aby oba běhy měly stejný počet kol).

**Audit 2 / Fáze C (v0.12, 2026-08-26) — HOTOVÁ; CELÝ AUDIT 2 DOKONČEN (A+B+C).** Vše klientské (stačí reload, restart serveru netřeba). **Orbitální rozvržení**: `ORBIT` (cx/cy, `main[slot]={r,ang}`, `rings`, `subR`, `subSpread`, clampy) + **`orbitPos(tree)`** — hlavní na prstencích, větve na ramenech `parentAng ± subSpread` ven (branch = strana), výsledek clampnutý do plochy; `treeLayout()` z fáze A SMAZÁN. Prstence jako `<circle class="orbit-ring">` v const-lines (`.active` když na prstenci stojí naučená hlavní; kružnice se v roztaženém viewBoxu jeví jako elipsy — záměr). Ověřeno pro všech 24 stromů: nic nevyjede z plochy, žádné dva uzly blíž než 9 jednotek. **Uzly**: hlavní 50px zlaté se jménem na tmavém štítku `.cn-plate` + 👑 `.cn-crown` při 15/15; větve 30px modré bez jména (jen title). **Karta dovednosti** `skillCardHtml` = překryv UVNITŘ `.constellation`, strana podle pozice uzlu (x>50 → vlevo), sklo + zlaté rohy, hlavička s pečetí, kapsle typu a **`skillTimingTag(s)`** (klientská mapa typ→„⏱ 1. kolo / ⏱ každé kolo / ⏱ před bojem / 🛡 při obraně / 🏳 po vítězství / 🥾 na pochodu / trvale"), Nyní / Další bod (zeleně) / ✨ Bonus při plném naučení / hint zámku / ✦ Vylepšit. Statický `.const-detail` pod stromem ZRUŠEN (CSS pravidla zůstala, neškodí). **Panel „Aktuální efekty"** `heroEffectsPanelHtml` = výsuv zprava, řádky hlavní→její větve s pečetí, rankem, časováním a texty efektů + zlatý řádek bonusu při max; dole „✦ Rozdělit body" (nastaví `hwSkillSel` na první uzel, do kterého jde investovat). **Spodní lišta**: `.pts-chip` (zůstatek), `.mastery-chip` 🏅 X/4, přepínač `.fx-toggle`, Reset. **Stav `hwFxOpen`** — MUSÍ být v `heroWindowSig` (jinak panel zmizí při tiku; ověřeno testem přes doTick) a resetuje se v openHeroWindow i při přepnutí hrdiny; karta a panel se vzájemně vylučují. Výška `.constellation` = `clamp(320px, 42vh, 408px)` (víc už vyrobí posuvník v `.hw-body`); media query pod 620px dá kartu na celou šířku dole.

**Vyslání hrdiny na dva kliky (v0.15):** volba hrdiny v radiálním kole **rovnou vysílá**. Dřív `pickHeroAction` jen zavřel kolo, otevřel panel pole a bliknul na `#btn-march` — hráč hlásil „vyberu hrdinu a nic se nestane". Nově `showHeroPick` → **`showMarchConfirm(t, heroIdx, title)`**: karta přímo v `#tile-menu` (souhrn hrdina/armáda/ETA/žold, náhled trasy přes `marchPreview`, u cizího pole i checkbox nájezdu) a tlačítka **⚔ Vyslat / ⚙ Upravit / ✕ Zrušit**. Armáda: hrdina v poli táhne celou svou (`armyClone(h.army)`), z domova mu `suggestArmy` naloží `min(volné velení, doporučený objem)` — u vlastního pole `min(30, zásoba)`. `⚙ Upravit` = bývalý `pickHeroAction`, přejmenovaný na **`openMarchForm(t, heroIdx)`** (složení armády, posily, nájezd). Bez jednotek se ⚔ Vyslat vůbec nevykreslí. Když `startMarch` vrátí false, tlačítko se zamkne a přibude hláška (v MP `NET_CMDS` vrací vždy `true`, takže se tam větev nikdy nespustí — pochod je optimistický jako dřív).

**Varování „málo jednotek" (v0.15):** nový sdílený helper **`marchNeeded(t)`** = `Math.ceil(tileDefense(t)/SOLDIER_POWER)+1` (stejné číslo, které panel psal jako „Doporučená síla ≥ N"). Hlásí se **v OBOU potvrzeních** — v kartě v kole (`.tm-warn`) i v `#march-confirm` v panelu (`.mc-warn`) — spolu s druhým varováním na nedostatek zlata na žold. Jen u cizích polí; přesun na vlastní pole doporučený objem nemá. **Varování NEBLOKUJE** — hráč může vyslat i podčíslenou armádu.

**`suggestArmy(me, suggest)` (v0.15):** proporcionální rozpad jednotek vytažený z `unitInputsHtml` do samostatné funkce (formulář v panelu i rychlé potvrzení musí dávat stejná čísla). Součet nikdy nepřesáhne `suggest` ani zásobu — floor + dorovnání zbytku. Ověřeno: zásoba 37/21/9, suggest 30 → 17/9/4.

**Startovní okno se vždy vejde na obrazovku (v0.12.1):** po Auditu 2 měl každý hrdina 12 uzlů, takže výběrová karta vypisovala 11 dovedností a dialog přetékal nad i pod obrazovku (nešel odrolovat — `.dialog` neměl strop výšky). Řešeno třemi kroky: (1) `showHeroSelect` vypisuje jen **hlavní dovednosti** + řádek `.hp-more` „a N dovedností ve větvích"; (2) `#start-overlay .dialog` je **flex sloupec** s `max-height: calc(100vh - 24px)` a `overflow: hidden` — roluje jen prostřední část (`#hero-pick-cards`, `#faction-cards`, `#mp-box` mají `overflow-y:auto; min-height:0`), takže nadpis, potvrzovací tlačítko i odkaz zpět zůstávají VŽDY vidět; (3) dialog smí být širší (`min(940px, 96vw)`) a nad 1000px je mřížka hrdinů třísloupcová → 6 hrdinů na dvě řady; nízká okna (`max-height: 780px`) mají menší odsazení. Ověřeno na 1430×1270, 1366×700, 1280×560 a 859×764 — dialog se vejde a celý tok výběru → spuštění hry funguje.

**Neutrální velitelé (v0.13):** každé neutrální pole brání **vlastní velitel** místo dřívějšího univerzálního „kapitána domobrany". `neutralCommander(tile)` vrací {name, trait, level, hp/atk/def/dmg/speed/spell/ward, cap} — **deterministicky z (q,r)** přes murmur3 fmix32 s `Math.imul` (obyčejné `*` ztrácelo přesnost a nízké bity se špatně míchaly → část velitelů nikdy nepadla; hlídá to test rozložení rysů). Úroveň: `neutralHeroLevel(label)` lineárně ⚔1→1 … ⚔300+→50 z `tileStrengthLabel(tile)` (grandfort 500, bastion 300, ostatní stavby dle `STRUCTURES.militia`, pole `tierOf`). Velitelé jsou **bez výbavy, hvězd i dovedností** (jen base + rys + úroveň), rychlost = `MILITIA_SPEED` + rys (útočník útočí první, kromě rychlých velitelů), **mystický rys je vynechán schválně** (spell obchází obranu a na slabých polích by mazal útočníky). Tabulka `NEUTRAL_COMMANDERS` = 12 jmen/rysů; `NEUTRAL_POWER` (1) je ladicí knob škálující rovnou ÚROVEŇ, takže zobrazené číslo vždy odpovídá síle (0 = chování před v0.13). Posádky se NEMĚNILY — zůstávají kotvou křivky; `neutralHeroCap` ověřuje, že je velitel uvede (jediná záměrná výjimka: Trůn 1200 > velení 1035 — brání ho celé město). Wiring: v resolveMarch nová větev `tile.owner === -1`, **vlastněná pole bez hrdiny dál brání kapitán domobrany** (aby neztvrdly souboje hráčů); report nese `def.level` + `def.neutralCmd`; UI: řádek „🛡 Velitel: jméno · úr. N · rys" v panelu pole i v bublině mapy (`neutralCmdTxt`). **Nová křivka dobývání** (hrdina 1. úrovně, jednotek potřeba dřív→teď): ⚔1 3→3, ⚔10 9→10, ⚔30 46→48, ⚔90 101→110, ⚔150 173→226, ⚔300 363→469, pevnost 413→566, grandfort 596→815, **Trůn 1003→1608**. Testy: `tests/test-neutralove.js` (25 asercí) + `tests/krivka.js` (měření). **GOTCHA při měření: `simulateBattle` MUTUJE hp předaného velitele** — do každého pokusu binárního hledání musí jít čerstvá kopie, jinak je obránce od druhého kroku mrtvý a čísla vyjdou stejná.

**⏭ Audit 2 je hotový. Nevyřešené/otevřené:** grafika (uživatel zmiňoval „realističtější"), Tailscale u kamaráda, druhotná pozorování z videa mimo strom dovedností (sezónní milníky serveru, kapitolové questy, směnárna Mathom, denní market se slevami, odemykání regionů na mapě světa) — nic z toho není naplánované.

**Sběratelský systém hrdinů (v0.9, 2026-08-26):** POVYŠOVÁNÍ ZA 💠 ZRUŠENO (promoteHero/PROMOTE_COST/G.spendCores smazány z game/net/server/main). **Strany**: `FACTION_SIDE` aldar+yllien=dobro ☀, durgar+horda=zlo 🔥 (`sideOfFaction`, `SIDES`). **Tiery hrdinů** `HERO_TIER_BY_TRAIT`: swift/shield/tireless=Common, attack/warlord=Epic, mystic=Legendary (3/2/1 na frakci; `heroTierOf`, `HERO_TIERS` barvy) — jen vzácnost, NE síla. **Zamčení hrdinové**: účet má `heroUnlocks/heroRespect/boosts` (`migrateAccount` doplní + hrdina s heroProgress = odemčen; volá se při loadu serveru, loginu/profileMsg i loadLocalAccount). První hra s frakcí (nic odemčeno) = volba libovolného **Common** hrdiny, při startu se zapíše `heroUnlocks` natrvalo (server tryStart / sólo startGame); výběrovka `showHeroSelect` zamyká karty (data-pickable, tier-tag, hp-lock s progresem), server validuje `pickAllowed`. Najímání: `hireHero` volá **`G.canHire(faction,defIdx)`** pro !isAI (server: accOf+heroUnlocked; sólo v startGame; bez účtu MP = nic); hire-box ukazuje 🔒+respekt. **Dárky/respekt**: hvězda n stojí `giftCostForStar(n)` dárků = 10/12/15/17/20…70 (+2/+3 střídavě, celkem 994 na 25★), `HERO_MAX_STARS=25`, 1 dárek = +10 respektu (`GIFT_RESPECT`); `applyGiftToAccount(acc,key,liveFaction)` — auto-povýšení při naplnění (`respectForStar`): 1.★ = ODEMČENÍ; +1 skillPt za hvězdu (`STAR_SKILL_POINT`) + uzdravení; **živého najatého hrdinu povyšuje přímo (h.stars/skillPts — sync by účet přepsal), jinak píše heroProgress** (entry vytvoří); na 25★ dárek → +10 💠. Bonusy hvězd beze změny (+4 %/+25 velení; na 25★ +100 % statů — záměr). **Truhly** (`accountOpenChest(acc,tier,side,liveFaction)` → **{items,boosts,gift,side}**, NE pole!): váhy rarit −10 b. (min 0,5; royal 0/0/40/24/6 — jsou to přímo %), zbytek do 100 = **posilovací doplněk** místo kusu (`makeBoost`, `BOOST_KINDS` build 🏗/prod 🎺 ×2 na `BOOST_MINUTES` 1/3/5 min dle tieru, boostTierW per truhla); royal sig 8 % jen sig hrdinů své strany. (v0.14: wooden/runic zrušené, CHEST_ITEMS 5→3, **dárek už není drop navíc** — viz níže.) Truhly mají `sideName` per strana, UI přepínač `chestSide` (.chest-sides). **Doplňky**: účet `boosts{kind_tier:n}`, `accountUseBoost` → `faction.boosts{build,prod}` tiky; doTick odpočítává, build tik navíc (ticksLeft>1!), incomeOf+tileIncomePreview ×2; zpráva `useBoost` (server) / useBoostAction (sólo), jen za běžící hry. **Afinita výbavy**: item nese `side` (stripItem drží!), `ITEM_SIDE_NAMES/ITEM_SIDE_SUFFIX`, makeChestItem/makeItem(side)/dropStructLoot/makeSignatureItem sypou side; `equipItem` cizí stranu ODMÍTÁ (kusy bez side = univerzální, migrace); UI sideIcon ☀/🔥, .wrong-side, disabled Nasadit s hláškou. **profileMsg** posílá heroUnlocks/heroRespect/boosts; chestResult = {...profileMsg, tier, side, items, chestBoosts, gift}; klient `acctMeta()/heroUnlockedAcc/acctRespect/acctBoosts` (sólo acct.local / MP acct.remote). Hero window: respect-bar místo promote tlačítka (auto-povýšení), hlavička ★ N/25 číselně. Testy: ws klient na pick validaci; startovní unlock jen VYBRANÉHO hrdiny (ostatní Common zůstávají zamčení).

**Fáze 3 auditu RtW (v0.8, 2026-08-26) — HOTOVÁ (celý audit dokončen):** Strop úrovní **HERO_MAX_LEVEL=30**, per-level konstanty zploštěné (HP 6, ATK/DEF 0,15, DMG 1, CAP 25 — úroveň 30 ≈ stará 10; kapitán domobrany na base beze změny), `xpForLevel = 40·l^1.6` (~102k XP na max, LEVEL_STAMINA 1), bod dovedností přes `skillPtGainAt(l)`: do úrovně 10 každou, dál jen sudé → **19 bodů celkem** vs kapacita stromu ~35 (buildy!). **Hvězdy hrdinů**: `h.stars` 0–5, `promoteHero(faction,heroIdx)` (exports/NET_CMDS/CMDS), platba přes **`G.spendCores(fid,n)`** (server: účet + profileMsg; sólo: acct.local v startGame — hráč bez účtu nepovýší), `PROMOTE_COST=[150,300,600,1000,1600]` 💠, efekt `STAR_STAT_BONUS=0.04` (×hpMax/atk/def/dmg/spell) + `STAR_CAP_BONUS=25`; povýšení uzdraví; persistence `stars` v applyAccountToHero/syncAccountFromFaction; UI `.promote-row` na kartě Staty (#btn-promote), `.hw-stars` = skutečné hvězdy (už NE ceil(level/2)). **Stromy 6 uzlů** (5 skillů + ult poslední, ranky 8/8/6/6/6, hodnoty/bod ~⅓; stunImmune uzly max 1), `SKILL_UNLOCK=[0,2,4,7,10,14]`; spojnice dle **CONST_LINKS** (7 hran, lit = OBA konce naučené), CONST_POS 6 pozic; nikde už nepoužívat SKILL_UNLOCK[3] pro ult — vždy poslední prvek. **Unikátní pečeti skillů**: `skillArtURL(s)` v main.js — deterministické SVG (FNV hash klíč+jméno → xorshift; zrcadlené zlaté tahy, ult hvězda) jako data-URI, `<img class="cn-art">` v cn-circle (emoji skillIcon zůstal jen jako fallback). **Stun**: eff `stunChance` (cap 35 %, heroStats) / `stunImmune` (+`vsStunImmune{fkey}` z cond.vsFaction přes heroCondEffs, resolved v resolveMarch jako u vsAll); v simulateBattle `act(S)=heroUp&&!stunned` místo heroUp ve VŠECH příspěvcích velitele (sideAtk/Def, sideDmg, spellTo, heroPart, followUp, stacks++), roll na začátku kola seeded rng, note 💫; kapitán domobrany stun nemá, ale omráčit jde. effText: rounding `Math.round(v*100)/100` (desetinné val/bod!), stunChance/stunImmune texty, condEffText umí stunImmune s [proti: F]. `goldPerLevel` zisk se zaokrouhluje (val 0,5/bod). Testy: node přímo (heroStats/simulateBattle/heroGainXp/xpForLevel V EXPORTECH); pozor startMarch chce cíl **přilehlý k území** (isAdjacentToFaction).

**Fáze 2 auditu RtW (v0.7.1, 2026-08-26) — HOTOVÁ:** `SIGNATURE_ITEMS` (24 kusů `fkey:defIdx` → {slot,name,passive,effs}) — nosit smí kdokoli (stat slotu platí), pasivka jen na svém hrdinovi (`heroSigItem/heroSigEff` v eff řetězci heroStats); item nese `sig`, stripItem ho drží; drop: 1. dobytí Trůnu = sig kus dobyvatele (v resolveMarch), royal truhla 8 % (makeChestItem). **Proc**: followUp (heroStats cap 60 %, v simulateBattle helper followUp(S,E,f) přes seeded rng — NIKDY Math.random; +60 % heroPart, note). **Podmínkové effs**: `cond:{unit}` / `cond:{vsFaction}` — heroEff je PŘESKAKUJE, sbírá `heroCondEffs` (skilly×rank + sig), heroStats staví unitDmg{inf,arch,cav}/vsDmg{fkey}, hero objekty nesou unitDmg+vsAll (resolved proti soupeři), sideDmg násobí. **maxEff** na skillech (bonus při plném naučení, zatím zur/hradba/dech/hnev/palba/rany — poslední dvě konvertovány na unitDmg arch/inf 8 %/bod). **Respec**: faction.freeRespecs=1/sezónu (initFactions), respecHero čerpá dřív než zlato. UI: `effLine/condEffText` (tagy [🏹 Lučištníci]/[proti: Frakce]), cd-maxeff + `.max-tag`, zamčené uzly ukazují ikonu + 🔒 v rohu, 5. tab **Unikát** (heroUniqueTabHtml: ultimátka, rys, signature stav), `.hw-figure` = background-DIV (img dělal scrollbary!) s hero_big_* rendery (make_heroes.py: env RES/SUFFIX, ONLY je prefix; 25 ks 768px v art/render), tab-in animace (hwLastTab), sig štítky `sigTagHtml` na kartách/reveal/porovnání.

**Okno hrdiny (RtW předloha, v0.5):** `.hw` layout v #hero-overlay — hw-list (portréty všech hrdinů, přepínání bez zavření), hw-main (hlavička + hw-body dle heroWinTab stats/skills/equip), hw-tabs vpravo. Strom = `constellationHtml` (CONST_POS 4 uzly, SVG linky, rank badge, detail s effText — mapa typů efektů na české texty, „Nyní/Další bod", Naučit/Reset). Výbava = `heroEquipTabHtml` (eq-slot-row filtr, porovnání itemCompareCardHtml s ▲▼, ⇄ Vyměnit). Stav: heroWinTab/hwSkillSel/hwSlotSel/hwItemSel — vše v heroWindowSig! openHeroWindow(i, tab?) resetuje výběry.

**Pochody a Kronika (v0.5.1, 2026-08-25):** SEASON_TICKS=3600 (hodinová sezóna). Zoom ZOOM_MIN/MAX 0.35–5 (konstanty v main.js). Ovládání mapy přes **Pointer Events** (bindMapControls: pointers Map, drag jedním prstem, pinch-zoom dvěma; #map má touch-action:none) — kompatibilita s Firefoxem/Safari/mobily. **Klik na kolonu vlastního pochodu** (`marchHeroAt`, rádius 22 world px) → `selectedMarchHero` (heroIdx, deklarace v render.js vedle selectedKey) → `renderMarchPanel` v #tile-panel (portrét, cíl, ETA, progress, ↩ Obrátit zpět = turnBackMarch, ⚑ Detail hrdiny); jméno hrdiny se kreslí nad vlastní kolonou (render.js march loop). **Náhled trasy**: `marchPreview` {from,to,color} (render.js — pulsující čárkovaná linie s tmavým podkladem), nastavuje syncInputs formuláře pochodu, nuluje se v renderTilePanel. **Potvrzení pochodu**: klik na #btn-march jen rozbalí #march-confirm (souhrn + varování + ⚔ Vyslat / ✕ Zrušit + u hrdiny v poli 📦 Nejdřív doplnit posily → skok na jeho pole). POZOR, od v0.15 to není jediná cesta — kolo na mapě má vlastní potvrzení `showMarchConfirm`, které vysílá rovnou (`pickHeroAction` přejmenovaný na `openMarchForm` a schovaný pod ⚙ Upravit). **Kronika filtrovaná**: logView "mine"/"all" (`logEntries()` — vlastní factionId, -1, nebo report kde att/def.fkey==me.key), taby v #log (.log-tab, delegace v initu), badge i logSeen počítají filtrované záznamy.

**UI (v0.5, RtW styl):** žádný pevný sidebar — mapa fullscreen, vpravo `#side-rail` (kulaté ikony) otvírá `#side-win` (jedno okno naráz): build/train/upgrade (dřív capitalPanelHtml, teď buildPanelHtml/trainPanelHtml/upgradePanelHtml + updateCityPanels se signaturou citySig a bindCityPanels), heroes/realm/goals/log (trvalé divy #heroes-panel/#scores/#goals/#log v .win-sec — updatery beze změny). openSideWin/closeSideWin/activeWin, odznaky updateRailBadges (skillPts/pakty/nové logy, logSeen). #tile-panel = plovoucí okno vlevo dole (hidden bez výběru, .tp-close křížek, kapitál jen zkratky .tp-open). POZOR: globální `.hidden { display:none !important }` přidán až v0.5 — dřív existovala jen specifická pravidla.
| `art/blender/make_tiles.py` | 30 spritů polí/staveb (Blender headless) |
| `art/blender/make_heroes.py` | 21 spritů hrdinů (unikátní siluety) |
| `art/blender/make_hrdiny_modely.py` | **49 figurek jako .glb** (v0.66) — vrcholové barvy, bez textur |
| `art/models/hrdinove/` | 49 .glb figurek, 5,6 MB — načítají se AŽ NA VYŽÁDÁNÍ |
| `art/blender/promo.py` | **Promo rendery** (Sunborn vs Ashen) z týchž figurek |
| `art/render/` | Vyrenderovaná PNG (sprity pro dnešní 2D renderer) |
| `art/blender/make_models.py` | Export týchž dílků jako **.glb modely** (3D větev) |
| `art/models/` | 45 .glb modelů se zapečenými texturami, 5,7 MB — vstup pro three.js/Unity |
| `art/srovnani-zapeceni.png` | referenční srovnání ploché barvy vs. zapečený povrch (horní řada v0.16, dolní v0.17) |
| `art/nahled-3d.html` | Vývojářský náhled 3D mapy (three.js, není součást hry) |
| `DESIGN.md` | Pravidla + roadmapa česky — **udržovat aktuální** |
| `REFERENCE-UI.md` | Předloha UI podle RtW (z videí) — rozvržení oken, itemy, reporty; číst před úpravami UI |
| `E:\Claude\reference-rtw\` | **Mimo projekt** (nesmí do buildu): archiv Fandom wiki mrtvé RtW — `REFERENCE.md` destilát (staty ~30 jednotek zlé strany, gramatika skillů velitelů, sezónní resety), `wiki/` surové stránky, `obrazky/` všech 370 stažených obrázků (48 MB; kity ~30 velitelů jen ve screenshotech, přepis na vyžádání). Wiki NEMÁ vzorec boje → přebírat poměry, ne absolutní čísla |
| `MULTIPLAYER.md` | Návod pro kamarády (Tailscale) |

## Ostrý provoz — warofash.com (etapa 5, 2026-08-30)

Hra běží na vlastním VPS. **Vývoj se nezměnil** — lokálně dál `start-server.bat`
na :8123; ostrý server je zvlášť a nasazuje se jedním příkazem.

| Co | Kde |
|---|---|
| Doména | `warofash.com` (Wedos, registrovaná 2026-08-30) |
| VPS | Wedos, `31.31.72.77`, IPv6 `2a02:2b88:2:1::7d15:1`, hostname `vm32021`, Ubuntu 24.04, 1 CPU / 2 GB / 15 GB |
| Přístup | `ssh root@31.31.72.77` klíčem `~/.ssh/id_ed25519` (heslo vypnuté) |
| Nouzový přístup | KVM konzole Wedosu `32021.vm21.wedos.net:42021` — jediná cesta zpět, když se rozbije SSH nebo firewall |
| Hra | `/opt/warofash/app`, běží jako uživatel `warofash`, služba `warofash.service`, port 8123 jen lokálně |
| Data | `/opt/warofash/data` — účty v `ucty.db`, rozehraná sezóna v `sezona.json.gz`; `app/server/data` je jen ODKAZ sem, aby je nasazení nepřepsalo |
| Proxy | Caddy, `/etc/caddy/Caddyfile` — HTTPS i WSS certifikátem od Let's Encrypt, sám se obnovuje |
| Zálohy | `warofash-zaloha.timer` denně 4:30 → `/opt/warofash/zalohy`: účty přes `sqlite3 .backup` + gzip, snímek sezóny kopií; drží 14 dní |
| Logy | `journalctl -u warofash -f` (hra), `journalctl -u caddy -f` (proxy) |

**Nasazení: `./nasadit.sh`** — pustí testy, zabalí, nahraje, restartuje službu
a ověří zvenčí. `--bez-testu` testy přeskočí.

**Nasazení v0.66 (1. 9. 2026) proběhlo bez mazání snímku sezóny** — na serveru
žádný `sezona.json.gz` nebyl, protože sezóna 4 byla ve fázi ZÁPISŮ (start
2. 9. 12:58, dvě přihlášky). Změna generátoru mapy z v0.55 se tím vyřešila sama:
svět se poprvé narodí až z nového kódu. Balíček **21 MB** (nově 49 figurek
hrdinů v `art/models/hrdinove`), účty (4) i `rozvrh.json` zůstaly netknuté.
⚠ Kdyby sezóna běžela, platí dál pořadí `systemctl stop` → `rm data/sezona.json.gz`
→ `systemctl start`.

**PASTI**
- **`server/data` se NIKDY nenahrává.** Na serveru jsou ostré účty hráčů; lokální
  testovací databáze by je přepsala. Skript ji z balíčku maže — nepřidávej ji zpátky.
- **Ověřovat nasazení proti doméně je past.** Dokud DNS mířily na parking Wedosu,
  vracel `https://warofash.com/` veselé HTTP 200 od cizího serveru. Skript proto
  kontroluje `%{remote_ip}` — na jakou adresu se curl OPRAVDU připojil.
- **Testy nesmí mít absolutní cesty.** Šest sad mělo `require("E:/Claude/...")`
  a na serveru spadly. Nově `__dirname + "/../js/game.js"`.
- **Caddyho unit má `/var/log` jen ke čtení** (`ProtectSystem=full`), zápis do
  `/var/log/caddy` skončí „permission denied" a Caddy vůbec nenaběhne. Logy jdou
  do journalu, ten rotaci řeší sám.
- **`/boot` na tomhle VPS je malý.** Při zprovoznění byl plný (44 MB) a rozbil
  dpkg uprostřed instalace Node. Před `apt upgrade` s novým jádrem zkontroluj
  `df -h /boot` a starým jádrům dělej `apt-get purge`.
- **Vynutit čistou sezónu nejde restartem.** `systemctl restart` pošle SIGTERM
  a odcházející proces snímek ZNOVU zapíše, takže smazat ho předtím je
  k ničemu. Pořadí musí být `systemctl stop` → `rm data/sezona.json.gz` →
  `systemctl start`.
- **V `find` na úklid záloh musí být závorky.** Bez nich znamená
  `-name A -o -name B -mtime +14 -delete` „A NEBO (B a starší 14 dnů a smaž)"
  a zálohy účtů by se nemazaly nikdy — disk by tiše rostl.
- Node na serveru je **24.20.0** z NodeSource (kvůli `node:sqlite`), ne z Ubuntu.

## Ekonomika a mapa (v0.4)
- **5 surovin:** food 🌾, wood 🪵, stone 🪨 (budovy + výspy), iron ⚙ (pěchota/jízda/upgrady), gold 🪙. `RES_KEYS=["food","wood","stone","iron"]`.
- **12 druhů polí** — jmenovky síly `TIERS=[1,10,15,30,60,90,130,150,200,230,260,300]`; `t.level=1..12`, `tierOf(t)`. Skutečné posádky `TIER_GARRISON=[3,10,30,55,85,120,160,205,255,310,370,435]` (strmější než jmenovka — záměr: na ⚔10 stačí ~10 jednotek, na ⚔15 už ~30). Skóre `TIER_SCORE`, výnos `TIER_YIELD`.
- **t.res:** `"all"` (level 1 a 12) | sudé levely food/iron | liché stone/wood (vážené terénem, `assignRes`). Zlato = 20 % objemu výnosu (`tileYield`).
- **Síla jednotek = 1** (`SOLDIER_POWER=1`, všechny UNIT_TYPES power 1) → obrana ≈ počet jednotek. `UPKEEP_PER_UNIT=0.01`.
- **Mapa (v0.21 čtvercová):** `MAP_R=17` Čebyšev (35×35 = 1225 polí), capitals (±16,0),(0,±16), `CAPITAL_POS`. Dva **Manhattan** prstence: `WALL_R=4` vnitřní hradby (4 fortress brány v ROZÍCH prstence ±(4,0),(0,±4)), `OUTER_R=8` vnější — zeď kromě **4 grand-pevností** v rozích (±8,0),(0,±8): shluk 5 polí = grandfort (label 500, ×1,5) + **4 bastiony** (label 300, ×1,3; dřív 6 — shluk je při 4 sousedech menší, obrana svazku klesla ~o čtvrtinu). Jediné průchody! `grandfortMult` = +10 % útoku frakce za držený grandfort; první dobytí z neutrálu: +800 zl + zaručená legendárka. `levelForDist(distLvl(q,r))` = pásma tierů (osmiúhelníková metrika!). Řeky (±k,±k) od k=5, `BRIDGE_KEYS` (±8,±8) — každý kvadrant má k sousedům 1 most + 2 brány. 10 měst v pásmu distLvl 10–14.
- **Výspa (outpost):** `buildOutpost` / `outpostDeposit` / `outpostWithdraw`; cena `OUTPOST_COST={stone:300,wood:100,gold:150}`, `t.outpost` armáda do `OUTPOST_CAP=2000`. Trvalá stráž sebe + sousedů přes `tileDefComponents` (comp.outposts), ztráty `applyDefFractions`, padá s polem, počítá se do žoldu. Struktura outpost: def 0/skóre 8/×1,3.
- **Žold za útok:** `marchGoldCost` = 0,3 🪙/jednotka jen na cizí pole, validace v `startMarch` před mutací.

## Bojové staty (v0.5)
- **Jednotky** mají hp/dmg/atk/def v UNIT_TYPES: inf 10/2/3/5, arch 6/3/5/2, cav 9/3/5/3. Strana sčítá životy do fondu; poškození za kolo = Σ dmg × (převahy typů + pasivky). ROUND_DMG/SOLDIER_POWER v boji zrušeny (power=1 zůstává pro armyPower/tileDefense).
- **Útok vs obrana:** `ATKDEF_STEP=0.05` — každý bod rozdílu (vážený průměr jednotek + stat velitele) = ±5 % poškození, clamp 0,5×–2×.
- **Rychlost:** rychlejší velitel v kole udeří první (pomalejší oplácí s přeživšími); bez hrdiny MILITIA_SPEED=4. Bezvelitelskou obranu vede „kapitán domobrany" (staty hrdiny 1. úrovně, hp 80) — jinak by útočník bral pole pod jmenovkou.
- **Hrdina:** hpMax 100+20/lvl, atk/def 2+0,5/lvl, dmg 8+3/lvl, speed 5; `h.hp` persistentní, léčení `HERO_HEAL_FRAC=0.015`×hpMax×regen za tik, level-up uzdraví. Schytává `HERO_DMG_SHARE=0.03` poškození skupiny; při hp 0 **padá** (sim.heroFellA/D): dál se bojuje bez jeho statů, pak WOUNDED_COOLDOWN 60 s; při výhře armáda zůstává na poli (hero.pos) a čeká. simulateBattle bere ctx.attacker/defender.hero {name,hp,atk,def,dmg,speed,spell,ward}, vrací heroHpA/D+heroFellA/D; roundLog má hpA/hpD.
- **Rysy převedené na staty** (1 bod ≈ 5 %): attack→atk 3, shield→def 4, swift +speed 2, tireless +hp 40, warlord +dmg 6, **mystic** spell 15. Skilly "atk"/"loss" → body "atk"/"def"; itemy zůstaly v %, folduje je heroStats (/5). heroStats už NEMÁ .attack/.loss — má hpMax/atk/def/dmg/speed/spell/ward.
- **Mystikové (6. hrdina, defIdx 5):** Arcimág Vaelis, Síthrel Hvězdný šepot, Zhargra Runové oko, Maalzeth Plamenný prorok. Eff typy spell (přímé poškození do fondu, obchází vše krom ward), ward (−% poškození od hrdinů a kouzel, cap 80 %), dmg, hp. HERO_MAX=5 z 6. Server pick clamp 0–5!
- **Sety v0.5 (ITEM_SETS):** sampion (hp/atk/def/spd — čisté staty hrdiny), kat (dmg hrdiny, celkem +38), zrec (spell +55 + ward 10 — kouzla i pro nemystiky). Celkem 7 setů; bonusy jdou přes heroSetEff, žádný další kód netřeba.
- **Předměty = staty (ITEM_SLOTS):** 6 slotů 1:1 na 6 statů — weapon→dmg (base 3), shield→def (1), armor→hp (12), helmet→spell (3), boots→speed (0.7), gloves→atk (1); hodnota se přičítá přímo v heroStats přes heroItemBonus (žádné /5 přepočty). Staré item staty attack/loss/stamina/speed%/regen zrušeny — výdrž/pochod řeší jen eff typy (skilly, sety).
- **Křivka dobývání ověřená:** ⚔10→9 jednotek, ⚔15→25, ⚔30→46, ⚔90→101, ⚔300→366, grandfort→781 (vyvážený mix, hrdina lvl 1).

## Účty, jádra a truhly (v0.6)
- **Trvalý postup po vzoru RtW**: účet drží 💠 popelná jádra, sklad předmětů (inventory) a heroProgress `{fkey:defIdx → {level,xp,skills,skillPts,equip{slot:item}}}`. Sdílená logika v game.js: `emptyAccount/accountOpenChest/accountRedeemCode/applyAccountToFaction/applyAccountToHero/syncAccountFromFaction/grantItemToFaction/stripItem` (vše v exports). Předměty se ukládají očištěné o runtime `id` (stripItem), při načtení dostanou nové.
- **Strengthen (v0.6.1)**: každý item má `stars` 0–5; `STRENGTHEN_COST=[1,3,5,8,13]` kusů **stejného slotu a rarity** ze zásoby (cíl smí být i nasazený, materiál ne). Hodnota = `itemValueOf(it)` = value×(1+0.25×stars) — používá heroItemBonus i itemEffectStr. 5★ → `MASTER_BONUS[slot]` {name,desc,effs} přičítané přes `heroMasterEff` v eff řetězci heroStats. `strengthenItem(faction,itemId,materialIds)` v exports/NET_CMDS/CMDS. stripItem zachovává stars. UI: 4. tab okna hrdiny „forge" 🔨 Kovárna (heroForgeTabHtml, stav hwForgeSel/hwForgeMats v heroWindowSig, „vybrat za mě" #forge-auto bere nejslabší kusy); `itemStars(it)` = ★ podle **stars** (rarita jen barvou/jménem!); binding .item-card zúžen na `[data-item]`.
- **CHESTS**: **v0.14 zůstal jediný tier `royal` 2400💠** (wooden/runic smazané — CHESTS je jednoprvkový objekt, ale UI i server pořád jedou přes `data-tier`/`msg.tier`, takže přidání dalšího tieru nic nerozbije). Truhla dá **VŽDY přesně `CHEST_ITEMS=3` věcí** (bylo 5 + dárek navíc). Zůstaly `weights` 0/0/40/24/6, `setChance` 0.6, `lvl` 7–12, `boostTierW` 0/45/55, sig 8 %; `giftChance`/`giftTierW` SMAZANÉ.
- **Dárky jsou slot, ne bonus (v0.14)**: každý slot → `Math.random()*100 >= wsum` doplněk (30 %), jinak `Math.random() < GIFT_SHARE` (0.5) dárek, jinak výbava. Dárku se rarita losuje **ze stejné tabulky `def.weights`** a teprve pak se přemapuje na tři hrdinské tiery přes `GIFT_RARITY_TIER=[0,0,0,1,2]` → dárek rarity R padá stejně často jako výbava rarity R. `rollGiftHero(tier, side)` bere **tier**, ne chestDef! `accountOpenChest` vrací **`gifts` POLE** (ne `gift`) — server posílá `gifts`, net.js i showChestReveal mají fallback `msg.gift ? [msg.gift] : []` pro starší server. Naměřeno na 30 k truhlách: výbava 35 %, dárky 35 %, doplňky 30 % slotů; per otevření 1,05 / 1,06 / 0,89. `chestWeightsStr` kreslí všechny tři skupiny (součet 100 %) — gear půlky vah, dárky přemapované, doplněk zbytek.
- **Kořist z boje (v0.6.2)**: `dropLoot` ZRUŠEN — běžná pole/města/mosty nesypou nic. Jen `dropStructLoot(faction,heroIdx,tile,rarity,chance)` při **prvním dobytí z neutrálu**: throne → legendárka (4) jistá, fortress i grandfort → epika (3) s 50 %. Relikvie event: 60 🪙 + 15 💠 (už ne item). UI: `structLootTxt(t)` v main.js (panel + bublina, jen neutrální klíčové stavby); makeItem má 3. param fixedRarity; lootChances/rollRarity zůstaly jen pro makeItem bez fixní rarity (fakticky nevyužité). — weights rarit, setChance, lvl rozsah; `makeChestItem` používá **Math.random, ne rng** (truhly se otvírají i mimo hru). `CORE_CODES` {VITEJTE:200, POPEL50:50, VELLAR:100, PANVELLARU:1000000 (admin), **TEST100K:100000, TEST1K:1000 (ladicí)**} — server je může přepsat klíčem `codes` v accounts.json. Kódy podle `CODE_REPEATABLE` (`/^TEST/`) se do `codesUsed` nezapisují, takže je lze uplatnit **opakovaně** — pro testování truhel; ostatní zůstávají jednorázové. Nový účet startuje s **5000💠** (ACCOUNT_START_CORES, zvednuto ze 120 dne 30. 8. 2026): poplatek chystané klanové burzy (PLAN IV-R) platí OBĚ strany obchodu, takže by nováček se 120 jádry byl od obchodu odříznutý — a zároveň má rovnou na roztočení beden. Vedlejší důsledek, který je vidět chtít: 5000 = 12,5 truhly, tedy přesně `PITY_AT`, takže kdo je otevře naráz, má jistou legendu. **Staré účty se zpětně nedoplňují.** Test „nedostatek jader" si proto chudáka vyrábí ručně (`chudy.cores = def.cost - 1`), nespoléhá na výši uvítacího dárku. **Skutečné platby NEjsou** — obchod ukazuje „připravujeme“; jádra jen z eventů a kódů.
- **Jádra z eventů**: `grantCores(factionId, n, reason)` → `G.onCores(fid, n)` vrací true jen pro hráče s účtem (AI nic). Místa: cíl sezóny +20, pevnost +10, grandfort +25, banda +5, karavana +8, trůn +40, konec sezóny +15 všem / +50 vítězi. `G.onHire` aplikuje postup na dokoupeného hrdinu.
- **Server** (server/server.js): accounts.json v server/data (gitignore-hodné, testy mažou!), scrypt hash hesla, authToken pro auto-login (klient v localStorage `vp-acc-token`). Zprávy: accRegister/accLogin/accToken/accLogout/openChest/redeemCode → odpovědi `account` (profil {name,cores,inv}+authToken), `accError` {text,silent?}, `chestResult` {tier,item,cores,inv}. Při tryStart `applyAccountToFaction`; sync každých 5 tiků + při gameOver/backToLobby (`syncAccounts`), zápis souboru throttlovaný 5 s (`saveAccounts`/`flushAccounts`).
- **Klient** (main.js): `acct` {mode local/remote, remote profil, local celý účet v localStorage `vp-account`}; sólo hra: applyAccountToFaction ve startGame, `syncLocalAccount` každý tik (ulož ob 15), G.onCores/G.onHire lokálně. UI: 💠 v top baru (`#res-cores`), rail okno „chests“ (`updateChestsPanel` — kreslí do #chests-panel I #lobby-chests, vnitřní prvky mají TŘÍDY ne id, sig `chestsSig`), reveal `.reveal-card` podle rarity, promo kód, v lobby `#acc-box` (renderAccBox: login/registrace, po přihlášení jádra + toggle truhly přímo v lobby, `refreshAccCores` bez přestavby boxu). net.js: po welcome auto `accToken`.
- POZOR: tlačítka v overlayích dědí width 100 % — `.chest-card .btn-chest {width:auto}`.
- **Opravy v0.6.2**: `unitInputsHtml` plní prefill floor+dorovnání (dřív Math.ceil přestřelil součet o 1–2 nad suggest → posily na limitu velení TIŠE selhaly); posily mají disable tlačítka + červené ⚠ (.warn) při překročení volného velení (updateRfEta). Lišta má tlačítko **⚔ Bojové reporty** (#rail-reports, BEZ data-win — generický rail binding přeskakuje tlačítka bez něj; openReportsWindow otevře poslední report / prázdný stav, badge #badge-reports = unreadReportCount).

## Hrdinové
- Start s **1 hrdinou** (výběr na startu; MP pick length 1). Max **5**/frakci, verbování s výběrem: `hireHero(faction, defIdx)`, ceny `HERO_HIRE_COST=[0,250,450,700,1000]`.
- **Limit velení:** `heroArmyCap` = 200 + 100×(lvl−1) + trait + eff("cap"); `heroArmyCommitted` počítá armádu + konvoje na cestě; vynuceno v startMarch/startReinforce. Trait warlord +100.
- **Figurky na mapě:** `drawHeroFigure` (sprite `hero_<fkey>_<defIdx>`, HERO_SPRITE_W=38, HERO_FEET_FRAC=0.668) + animace idle/walk/fight, fallback `drawHeroFigureVec`. Bitvy = `G.clashes` ({key,tick,att,def,...}, push v resolveMarch, prune v doTick <5 tiků, jde přes serializeState/applySnapshot) → `drawClashes` (~3 s souboj + prach).

**Surovinové rekvizity polí (v0.5.1):** 15 overlay spritů `res_<food|wood|stone|iron|all>_<1|2|3>` (make_tiles.py — builders res_*, bez hex podstavy, `catcher()` shadow catcher s vypnutým indirect bounce; materiály wheat/wheat2/arcane). Mohutnost dle úrovně: 1–4 → _1, 5–8 → _2, 9–12 → _3 (band v render.js). Kreslí se v renderMapLayer hned po tintu úrovně, jen `!t.structure && passable && t.res && terrain!=="bridge"`. Návrhy: food pole+snopy→mlýn (lopatky široké v X!), wood klády→tábor, stone balvany→terasový lom s jeřábem, iron ruda→štola s vozíkem, all menhir→kruh s krystalem (arcane emissive, emit_str 1.1 — víc vypálí AgX dobílá). Stará emoji ikonka suroviny na mapě zrušena (zůstává v tooltip/panelu). `ONLY` v make_tiles.py je teď **prefix** (ONLY=res_ přerenderuje všech 15). MAP_SCALE zvednut 2→3 (ostrý terén při zoomu 5×).

## Souřadnice mapy a popisky (od v0.21 ČTVERCOVÁ MŘÍŽKA)
- **Data jsou rovná celočíselná mřížka (q, r)** — otočku o 45° dělá až projekce:
  `tileToPixel(q,r) = (KOSO·(q−r), KOSO·(q+r)·ISO_SQUASH)`, kde `KOSO = HEX_SIZE·TILE_DIAG`
  a **`TILE_DIAG = √1,5`** = půl úhlopříčky kosočtverce v blenderových jednotkách.
  Stejná konstanta je v render3d.js (`DIAG`, `poleNa3D = (DIAG·(q−r), DIAG·(q+r))`)
  a v make_tiles.py (`DIAG`) — **měnit vždy všechny tři**. `pixelToTile` = inverzní
  afinita + prosté zaokrouhlení obou složek (buňky jsou v (q,r) osové čtverce).
- Sousedé **4 hranou** (`DIRS4`), pochodová vzdálenost `gridDist` = **Manhattan**.
  Pro STUPNĚ polí ale platí `distLvl` = (Manhattan+Čebyšev)/2 — osmiúhelníkové
  vrstevnice; bez toho by rohy čtvercového světa spadly celé do stupně 1.
- Svět = Čebyševův čtverec `MAP_R=17` (35×35=1225 polí), na obrazovce diamant.
  Kapitály (±16,0),(0,±16) = středy hran čtverce = **rohy diamantu na obrazovce**.
  Prstence hradeb jsou **Manhattan** (na obrazovce osové čtverce), brány/pevnosti
  sedí v jejich rozích na osách. Řeky = úhlopříčné řetězy (±k,±k) k=5..17, dotýkají
  se ROHY — pohyb po 4 sousedech blokují stejně jako plná zeď; mosty (±8,±8).
- `t.riv` ("a"|"b") značí říční dílek a směr koryta (a = světová osa X, b = Z);
  prochází serializací MP (tiles se posílají celé). Modely od v0.41: voda je
  `river_flat` (hladká deska přes celé pole) + `river_bank(_b/_c)` na hrany,
  za kterými voda končí; most je `bridge_short`/`bridge_long` NAD dílkem biomu.
  `wall_a/b` beze změny (pravidlo: shodná znaménka q,r → wall_a) — hradby jsou
  pořád PÁSY od rohu k rohu, které na sebe u sousedů navazují.
- `tilePath` kreslí kosočtverec (parametr `size` drží starý smysl: HEX_SIZE ≈ celé
  pole); hranice území kreslí hrany přes `DIR_EDGE`/`TILE_CORNERS`.
- `ISO_SQUASH=cos(55°)` beze změny — **soustavu drží i 3D vrstva** (kamera nakloněná
  o týchž 55°, promítá do týchž pixelů; ověřeno odchylkou 0,000 px, 194/194 kliků).
  `biomeOf(q,r)`: střed (d<WALL_R) = popel, jinak biom nejbližšího capitalu — hranice
  kvadrantů běží přesně po řekách (aldar statky, yllien zeleň, durgar ruda, horda láva).
- **Mlha (od v0.16)**: terén ztmavuje `R3.setFog` přímo ve 3D (1 / 0,45 / 0,2), 2D obsah se nad ní ODMAZÁVÁ přes `destination-out`. Plochý tmavý hexagon se používá už jen jako nouzová varianta, dokud se nenačtou modely. Popisky/piktogramy se na neprozkoumaných nekreslí.
- Popisky: neutrál ⚔jmenovka (grandfort 500, bastion 300 — pozor, special-case i v panelu/tooltipu!), vlastněné ⚔reálná obrana; LEVEL_COLORS 12 barev; půda tint dle levelu (≥9 zlatá, ≤3 šedá) se kreslí jako průhledný nádech přes 3D. Druh suroviny ukazuje 3D rekvizita na poli.
- **`art/render/*.png` jsou od v0.16 z velké části mrtvé** — hra z nich načítá UŽ JEN `hero_*` (figurky do 2D překryvu). Sprity terénu a staveb tam zůstaly nesmazané (12 MB); `make_tiles.py` je umí kdykoli vyrobit znovu, takže je lze zahodit, až bude jisté, že se 3D osvědčilo.

## 3D renderer (v0.16, 2026-08-27) — NASAZENÝ, hra běží na modelech
Rozhodnutí: hra míří dlouhodobě na Steam a mobily, takže grafická práce jde do **3D modelů, ne do vylepšování spritů** — modely se přenesou 1:1 do three.js, Unity i Godotu, předrenderovaná PNG by se zahodila.

**Tři vrstvy nad sebou** (odspodu): `#map3d` = terén a stavby ve three.js → `mapLayer` (offscreen 2D, přepočet 1× za tik) = nádech území, hranice, jmenovky ⚔, filtry, mlha → `#map` = 2D překryv každý snímek: výběr, hover, figurky hrdinů, pochody, praporky, efekty ultimátek, bitvy, bouře. Obě 2D vrstvy kreslí ve **stejné soustavě jako dřív** (`tileToPixel`), takže se v `main.js` nemuselo změnit NIC.

**PROČ TO LÍCUJE (jádro celého portu):** ortografická kamera se nakloní o stejných 55° jako kamera v Blenderu → vodorovná rovina se svisle stlačí přesně o `cos(55°)` = `ISO_SQUASH`. Když se měřítko nastaví na `HEX_SIZE·zoom` pixelů na blenderovou jednotku a střed plátna na `(camera.x, camera.y)`, promítne se pole (q,r) do bodu, který vrací `tileToPixel()`. **Ověřeno: odchylka 0,000 px** pro rohová i středová pole při zoomu 0,35 / 1 / 2,2 / 5; a 71 ze 71 viditelných polí se trefí zpětným převodem `screenToWorld → pixelToTile`.

- **`js/render3d.js`** (ES modul, ~250 ř.) — vlastní three.js, ven přes `window.R3` (`init/build/resize/render/setFog/info` + ladicí `scene`/`cam`). Klasické skripty hry na modul dosáhnou, protože modul je odložený a `initRender()` běží až na `DOMContentLoaded`.
- **`js/render.js`** zůstal klasický skript a drží CELÉ původní API (`camera`, `selectedKey`, `hoverKey`, `marchPreview`, `tileToPixel`, `pixelToTile`, `screenToWorld`, `mapFilter`, `mapDrawnTick`). Nové: `tileModel(t)`/`resModel(t)` vrací JMÉNO modelu (dřív obrázek), `mapModelList()` staví seznam + podpis, `ensureMap3D()` přestaví 3D jen když se podpis změní (stavba výspy ano, běžný tik ne). Ověřeno: postavení výspy zvedlo volání kreslení 191 → 201.
- **Sprity terénu SMAZÁNY z načítání** — jako obrázky zůstaly jen figurky hrdinů (ty se pořád kreslí do 2D). Načítání: dřív ~12 MB PNG, teď 5,7 MB modelů (i s texturami) + 950 kB three.js.
- **Výkon na plné mapě (1141 polí):** **64 volání kreslení**, 1,52 M trojúhelníků, 0,36 ms procesorového času na snímek. Bez `InstancedMesh` by to bylo přes 6 000 volání a 4 snímky/s — instancování je podmínka, ne optimalizace. (Před zapečením textur to bylo 304 volání; sloučení materiálů je srazilo na čtvrtinu.)

### Pasti, které to stálo čas (nešlapat do nich znovu)
- **Stínový chytač v glTF.** Rekvizity surovin stojí v `make_tiles.py` na `catcher()` — v Cycles neviditelná plocha, co jen chytá stín. glTF nic takového nezná a vyexportoval ji jako **bílou desku přes celé pole**; mapa vypadala přesvětleně. `make_models.py` je teď zahazuje (`zahod_stinove_chytace`). Kdyby se přidal další takový pomocný objekt, musí ven taky.
- **Mlha musí být ve 3D, ne plochý hexagon.** Tmavý 2D hex nezakryje vysoké stavby — hradby a věže z mlhy koukaly ven. Řeší `R3.setFog(fn)`, které ztmavuje `instanceColor` každé instance (1 = vidím, 0,45 = prozkoumané mimo dohled, 0,2 = neprozkoumané). `build()` proto zakládá `instanceColor` bílou a ukládá `userData.klice` = pořadí polí.
- **2D obsah se přes mlhu prosvítal.** Nádech cizího území byl vidět i v neprozkoumané tmě = únik informace. 2D vrstva se nad mlhou nepřekrývá tmou, ale **odmazává** (`globalCompositeOperation = "destination-out"`). Se zapnutým filtrem se maže mírněji, ať filtr zůstane čitelný jako dřív.
- **Plátno si hlídá rozměr samo.** `resizeCanvas` bere VLASTNÍ rámeček plátna (ne rodiče) a `draw()` každý snímek kontroluje, jestli buffer sedí s CSS. Dřív se rozcházely o 18 px (layout se po startu ještě mění) — obraz se svisle stlačil a hlavně přestaly sedět kliknutí, protože `screenToWorld` počítá v pixelech bufferu, ale myš chodí v CSS pixelech.
- **Slunce drž nízko (~23° nad obzorem).** Vysoko postavené dává stíny tak krátké, že pod rekvizitami zaniknou a mapa vypadá plochá. A **oblohové světlo pod 0,4** — silnější zaplní stíny tak, že to vypadá na nefunkční shadow mapu (ověřeno kontrolní kostkou i kontrolním InstancedMesh, oboje stín vrhalo).
- `THREE.PCFSoftShadowMap` je v three 0.185 **zrušený** — nastavuj rovnou `PCFShadowMap`.
- **`onBeforeCompile` sama o sobě NEZABERE.** three si přeložený program kešuje a záplata do klíče keše nevstupuje — bez `customProgramCacheKey` sáhne pro dřív přeložený shader a změna se tiše ztratí. Poznáš to tak, že záplatu v `s.fragmentShader` vidíš, ale na obrazovce se nic nezmění.
- **Nespoléhej na vestavěné `vColor`.** Jestli three definuje `USE_COLOR`, nebo `USE_COLOR_ALPHA`, se mezi verzemi mění a podmínka pak tiše vypadne (a ve fragmentu je to `vec4`, takže bez `.rgb` se shader nepřeloží). `mlhaDoZare` si proto vede **vlastní varying `vMlha`** napojený na atribut `instanceColor`, který je smluvní.
- **Záře mlhu ignoruje.** `instanceColor` násobí jen rozptýlenou složku, takže lávová pole a krystaly svítily skrz neprozkoumanou tmu jako světlušky. Řeší to záplata v `mlhaDoZare` — a musí být **na druhou** (`vMlha * vMlha`): lineárně prošlo ještě 43 % oranžové, protože záře jde mnohonásobně přes jedničku. Měř to počtem oranžových pixelů, ne přepálených — na přepálené to vypadá opravené, i když není.
- **Bake do 8bitového obrázku usekne všechno nad 1,0.** Láva má sílu záře 6; při pečení do 8bit bufferu se všechny tři kanály přišpendlily na 1 a láva zbělala. Musí do plovoucího bufferu, pak se vrchol vytkne do `Emission Strength` (exportér ho zapíše přes `KHR_materials_emissive_strength`).
- **Lesk na vodě mlhu ignoruje taky.** Zbývá pár desítek pixelů zrcadlového odlesku, které pod mlhou nezhasnou. Zatím zanedbatelné; kdyby vadilo, je to stejná záplata nad `#include <lights_fragment_end>`.

## Slovník stavů v boji (v0.20, 2026-08-28) — NASAZENÉ

Boj po formacích dostal tři stavy z předlohy. Zdrojem jsou zatím **pasivky
výbavy** (`ITEM_PASSIVES`), takže se do hry dostávají lootem, ne přepisem
stromů hrdinů.

- **🌀 Šílenství** (`madness`, cap 30 %): na začátku kola má velitel šanci
  uvrhnout NÁHODNOU nepřátelskou formaci do šílenství. Ta pak s **poloviční
  šancí zaútočí na vlastní řady** místo na nepřítele. Cíl se vybírá
  `pickTarget(T, null, krome)` — šílenec nikdy nebije sám sebe. Proti vlastním
  neplatí opevnění ani frakční otvíráky (`out`, `opev`, `nasob` = 1).
- **🎯 Neodvratný úder** (`pursuit`, cap 60 %): velitelův úder **obejde
  obrannou chargu** (`hitForm(..., neodvratny)`). Protějšek vyhnutí, přesně
  jako Pursuit ↔ Evade v předloze. ⚠ Neprojeví se na POČTU pohlcení (chargy
  se stejně spotřebují, jen na slabší údery) — měřit `tot.avoidD`.
- **Navazující úder** (`followUp`) je nově **PLNÝ druhý útok**, ne přípočet:
  volá se celá `uderit()` znovu — nový cíl, nová šance na pohlcení, nové
  procy. Kouzla a kolové aktivky se v něm ale neopakují (jsou jednou za kolo).
  Naměřeno: poškození velitele 595 → 917 při 100% šanci.

Kolo je kvůli tomu přestavěné: úder je funkce `uderit(ac, opakovany)`, kterou
jde zavolat dvakrát. Determinismus drží (seedované rng, ověřeno testem).
Testy: `tests/test-boj.js`, sada 12 (93 bojových testů celkem).

## Zvláštní vlastnosti výbavy a zušlechtění (v0.20, 2026-08-28) — NASAZENÉ

Výbava má nově DVĚ vylepšovací dráhy (předloha RtW: Strengthen × Refine):

| dráha | co zvedá | čím se platí | strop |
|---|---|---|---|
| **Hvězdy** (`stars`, dřív) | plochý stat slotu (+25 %/★) | duplicitní kusy | 5★ + mistrovský bonus |
| **Zušlechtění** (`refine`, nové) | LOSOVANOU pasivku kusu | **zlato** | 5. stupeň = **×6** |

- `ITEM_PASSIVES` — 12 pasivek (`{name, desc, effs, jed}`). Efekty používají
  **stejné typy jako dovednosti** (followUp, stackAtk/Def, cap, ward, regen,
  stam, structAtk, heal + podmínkové `unitDmg` na typ jednotky), takže je
  `heroStats` bere beze změny.
- **Základy jsou schválně malé** (×6 na maximu má být znát, ne převálcovat
  plochý stat): followUp 2 %, stackAtk 0,06/kolo, cap 8, unitDmg 1 %…
- `ITEM_PASSIVE_CHANCE = [0, 0, 0.35, 0.7, 1]` — obyčejné kusy pasivku nemají
  nikdy, legendární vždy. **Rarita tak neurčuje jen výši statu, ale hlavně to,
  jestli kus vůbec něco umí.**
- `itemPassiveEffs(it)` = základ × (`refine` + 1), ořezáno na `REFINE_MAX`.
  `heroItemPasEff` sčítá nepodmíněné do `heroStats.eff`; podmínkové (unitDmg)
  přidává `heroCondEffs`. `refineItem(faction, itemId)` platí `REFINE_COST`
  [300/600/1000/1500/2200] ze zlata.
- **Losuje se u OBOU zdrojů výbavy** — `makeChestItem` (truhly) i `makeItem`
  (kořist z mapy), včetně setových kusů. `stripItem` nese `pas` i `refine`,
  takže vlastnost přežije uložení na účet (v zásobě i na nasazeném kusu).
- UI: `itemPassiveStr(it)` → fialový řádek `✨` na kartách výbavy, v porovnání
  i v kovárně; tlačítko **✨ Zušlechtit** vedle **🔨 Posílit** (obě dráhy
  v jednom detailu, `#btn-refine`). Příkaz je v `NET_CMDS` i serverových `CMDS`.
- Testy: `tests/test-truhly.js`, sada 7 (četnost dle rarity, násobek ×6,
  propis do statů, podmínková pasivka, meze, uložení na účet).

## Obléhání — opakované náběhy (v0.19, 2026-08-28) — NASAZENÉ

Odražený hrdina už netáhne domů. Když mu zůstalo vojsko a sám nepadl,
**stáhne se na pole, ze kterého útočil, utáboří se tam a po `SIEGE_RETRY`
sekundách udeří znovu**. Předloha (RtW) měla 5 minut při dvouměsíční sezóně;
naše sezóna trvá hodinu, proto 25 s.

- Nový druh pochodu **`kind: "siege"`** je JEN ODPOČET — `army` má prázdnou.
  Vojsko drží hrdina (`hero.pos = fromKey`, `hero.army = survivors`), takže
  je vidět na mapě, **dají se mu poslat posily** (`startReinforce` vyžaduje
  `hero.pos`) a dá se na něj zaútočit. To je celý smysl obléhání.
  ⚠ Kdo čte `march.army` pro velení hrdiny, musí obléhací pochod PŘESKOČIT
  (v `main.js` na dvou místech `mm.kind !== "siege"`), jinak hlásí „bez armády".
- Když odpočet vyprší, zavolá se prostě **`startMarch`** — ta si sama pohlídá
  zlato, výdrž, sousedství i dobu pochodu. Když neprojde (došla výdrž, pole
  je už naše), hrdina zůstane stát a další krok je na hráči.
- **Ústupové ztráty (`ROUT_LOSS`) se při obléhání NEúčtují** — obléhající
  neprchá, jen se stáhne o kus, takže ho pronásledování nestíhá. Bez toho
  by na druhý náběh nikdy nezbylo vojsko.
- Obléhající **nedostává trest za porážku** (`cooldown = 0`) — pauzu mezi
  náběhy odměřuje samo obléhání.
- Meze: `SIEGE_MIN_ARMY` 12 (pod to se vzdává), `SIEGE_MAX_TRIES` 5 náběhů,
  jen na vlastním poli, kde nestojí jiný hrdina, a ne u nájezdu (`returnAfter`).
- `turnBackMarch` na obléhání jen **zruší odpočet** — hrdina zůstane stát
  (odvolat domů jde pak zvlášť). Kolona se v `render.js` nekreslí.

Naměřeno: posádka 200 proti armádě 150 s doplňováním posil padla na
**4 náběhy** (200 → 171 → 142 → 69 → 0). Testy v `tests/test-boj.js`, sada 11.

## BOJ 2.0 — po formacích (v0.19, 2026-08-28) — NASAZENÉ, NAHRADIL STARÝ BOJ

`simulateBattle` je přepsaný. **Jeden boj, jedna pravidla** — starý fondový
model už v kódu není. Předloha: RtW/WtW (rozbor v `E:\Claude\reference-rtw\`).

### Jak to teď funguje
1. **Tři formace** (pěchota/lučištníci/jízda), každá s vlastní zásobou životů
   a vlastními staty. Ne společný fond.
2. **Pořadí v kole**: velitelé napřed (rychlost +1000), pak formace podle
   `UNIT_TYPES[k].ini` (jízda 9 > lučištníci 6 > pěchota 4). Shoda → útočník.
3. **Cílení**: formace míří na typ, který poráží (`counters`); když padl, na
   nejsilnější zbylou. Velitel jde vždy na nejsilnější formaci.
4. **Poškození** = počet × síla/ks × modifikátory; padlí = poškození ÷ životy.
5. **PŘEBYTEK SE ZTRÁCÍ** — formace se nedá „prostřelit" do další. Tohle je
   ta oprava: dřív se poškození bez cíle vypařilo a hrdina bral pole zadarmo.
6. **Zlomení** (`ROUT_AT` 0,25): strana pod čtvrtinou původního stavu odtáhne.
   Poražený tak z bitvy odchází S VOJSKEM a může se vrátit.
7. **Strop `ROUND_CAP` = 10 kol**; pak je útok odražen (remíza).
8. **`DMG_PACE` = 2,5** dělí VŠECHNO poškození stejně — neurčuje, kdo vyhraje,
   jen jak dlouho se bijí. Bez toho bitva skončí za 2 kola a kolové dovednosti
   („každé 3. kolo") se nikdy nespustí.
9. **`HERO_DMG_SCALE` = 6**: velitel je vlastní kanál poškození. Naměřený podíl
   **3,7–55 %** podle síly velitele a velikosti armády (v předloze 3–82 %).
10. **Ztráty se dělí** `LOSS_DEAD` 0,6 padlých / 0,4 raněných (`sim.lossA`).
    Nemocnice teď léčí RANĚNÉ (`HOSPITAL_HEAL` = podíl z raněných, ne ze ztrát;
    0,4 × [0,375/0,5/0,625] = stejných 15/20/25 % jako dřív — bilančně shodné).

### Co zůstalo beze změny
Celý slovník efektů velitele (`stackAtk/stackDef`, `followUp`, `unitDmg`,
`vsAll`, `actives`, `armyActives`, `avoidCharges`, `stunChance`, `spell`,
`ward`), všechny frakční pasivky, seedované rng (žádný `Math.random`),
i **návratový kontrakt** — přibylo jen `lossA`. Všech 696 testů stromů
a 69 bojových testů prochází.

### PŘEUKOTVENO
Křivka dobývání: ⚔10→**11**, ⚔15→**31**, ⚔30→**57**, ⚔90→**121**, ⚔300→**439**
(dřív 9/25/46/101/363 — potřeba armády ≈ velikost posádky, +18 %). Hlavní
rozdíl ale není v tom, KOLIK je potřeba, ale co to STOJÍ: ztráty útočníka
na stupni 5 vyskočily z 6 % na 17 %, na stupni 6 z 12 % na 31 %.

⚠ Pozor při dalších změnách boje: kotvy jsou v `tests/test-boj.js` (sada 8)
i `tests/test-stromy.js` (sada 5) — musí se měnit OBOJE.

## VÝCVIK PODLE OBJEMU (v0.54, 2026-08-30) — ZADÁNÍ UŽIVATELE

Dřív trvala zakázka pevných 12/10/8/6 s podle kasáren **bez ohledu na velikost**
— jeden pěšák stál stejně času jako 2 781 kusů. Nově je čas funkcí OBJEMU
v bodech velení.

- `VYCVIK_SEK_ZA_CP = 0.12` — baseline pro hodinovou sezónu. Kalibrace není
  od oka: AI dosud držela dvě zakázky po 56 CP à 12 s, tedy ~9,3 CP/s; 0,12 s/CP
  dává 8,3 CP/s, takže se tempo AI (a s ním statistický gate) nemá o co zlomit.
  **Ověřeno: gate zůstal na 63/64 (98 %).**
- `recruitTicks(faction, type, count)` — CP × sazba × kasárny × `trainTime` rodu
  × `trainMult` jednotky × podíl sezóny. Kasárny drží původní progresi
  (12/10/8/6 → násobek 1 / 0,83 / 0,67 / 0,5), `trainMult` vlajek zůstává NAVRCH
  nad jejich CP (vlajka je na čas dvakrát dražší než totéž velení v pěchotě).
- **Škáluje se délkou sezóny** stejně jako `buildTicks` (× SEASON_TICKS/3600).
  Plné velení hrdiny 1. úrovně (1 112 CP) = 3,7 % sezóny, ať trvá hodinu nebo
  14 dní (133 s vs 12,5 h).
- **FRONTA JEDE POSTUPNĚ** — v `doTick` tiká jen `recruitQueue[0]`. Dřív tikaly
  všechny položky souběžně; s dobou podle objemu by stačilo objednávku rozsekat
  na tři typy a čas by se vydělil třemi. Ověřeno testem (stejné CP ⇒ stejný čas
  naráz i rozsekaně).
- Položka fronty nese `total` (plná doba) vedle `ticksLeft` — kvůli poměrné
  vratce a procentu hotovo.
- `cancelRecruit(faction, index)` — zruší zakázku a vrátí **poměrnou část ceny
  podle nevycvičeného zbytku**. Bez toho by jedno tažení jezdíku (max je přes
  1 800 kusů) zablokovalo kasárny na půl hodiny bez možnosti couvnout.
  Mutující ⇒ `module.exports` + `NET_CMDS` (net.js) + `CMDS` (server.js).
- Čtecí pomocníci pro UI: `recruitOrderTicks(faction, order)` (doba zakázky,
  součet položek) a `recruitQueueTicks(faction)` (za jak dlouho bude fronta
  prázdná).
- **UI (main.js)**: panel píše „výcvik trvá podle OBJEMU — X za 100 velení",
  souhrn zakázky ukazuje ⏳ dobu PŘED potvrzením, tlačítko se jmenuje
  **Vycvičit** (ne „Naverbovat"), fronta se vypisuje po položkách s procentem
  hotovo, časem dokončení a ✕ na zrušení. `fmtTrvani(ticks)` formátuje
  s/min/h/dny — `fmtDobu` z game.js zaokrouhluje na minuty a u krátkého výcviku
  by psalo „0 minut".
- Testy: `tests/test-vycvik.js` (22 asercí) — linearita, neobejitelnost
  rozsekáním, CP místo kusů (sarn), kasárny, škálování sezónou, postupná fronta,
  vratka a zrušení prostřední položky.

## KŘIVKA VELENÍ 300 + 100, POBŘEŽÍ A FILTR JAKO NABÍDKA (v0.63, 2026-08-31)

Tři zadání uživatele z jednoho hraní.

### 1. Velení: 300 CP na 1. úrovni a +100 za každou další

> „hned na začátku jsem mohl dobýt pole 60 prakticky bez ztrát, to postrádá tu
> radost z toho progresu — hrdina musí začínat na polích 1/10/15."

Etapa 6 přeškálovala celé měřítko JEDNÍM koeficientem (`HERO_CAP_BASE` 1112,
`HERO_CAP_PER_LEVEL` 83), takže hrdina 1. úrovně vezl 1 112 CP a rané pole pro
něj nebylo výzva. Nově je křivka **STRMÁ**: 300 + 100 za úroveň.

**Vrchol se nehnul** (úr. 50 = 5 200 ≈ dřívějších 5 179), takže keepy, brány
prstence ani vlajkové jednotky se nepřepočítávaly — mění se jen to, jak slabě
se začíná.

**Naměřeno (plný batoh, pět seedů, ✓ = vyhrál všude, % = ztráty útočníka):**

| úroveň | strop | ⚔1 (17) | ⚔10 (56) | ⚔15 (167) | ⚔30 (306) | ⚔60 (473) |
|---|---|---|---|---|---|---|
| 1 | 300 | ✓ 3 % | ✓ 4 % | ✓ **28 %** | ✗ | ✗ |
| 3 | 500 | ✓ 2 % | ✓ 2 % | ✓ 11 % | ✓ 25 % | ✗ |
| 5 | 700 | ✓ 1 % | ✓ 2 % | ✓ 7 % | ✓ 11 % | ✓ 31 % |
| 10 | 1 200 | ✓ 1 % | ✓ 1 % | ✓ 2 % | ✓ 5 % | ✓ 9 % |
| 20 | 2 200 | ✓ 0 % | ✓ 0 % | ✓ 1 % | ✓ 1 % | ✓ 2 % |

Přesně zadání: **⚔1 lehké, ⚔10 předpokládané, ⚔15 obtížnější** (stojí čtvrtinu
armády), ⚔30 se otevře kolem 3. úrovně a ⚔60 kolem 5.

**Startovní armáda se musela zmenšit** ze 4 500 CP na 600 (`START_CP`) — se
stropem 300 by hrdina uvezl patnáctinu a zbytek by byl jen zeď kolem města.

#### ⚠ Co to udělalo s AI a co to odhalilo

Brána spadla na **52/64 (81 %)**. Všichni žili, ale tři rody nevyšly z kolébky
(`e0`). Příčina byla stará vada, jen dosud neviditelná:

**Dostředivý tah měl strop „na co hrdina neuveze, se netlačí" JEN u BLOKŮ.**
Etapa 7 ho tam přidala kvůli keepům; u volných polí tehdy nevadil, protože
hrdina uvezl skoro všechno. S novou křivkou je nejbližší pole ke středu často
⚔30+ a AI o něj mlátila hlavu místo toho, aby si v kolébce dolevelovala.

Jednořádková oprava (`c.needed * 0.85 > maxCap` i pro volná pole) zvedla bránu
na **61/64 (95 %)** — a co je lepší, AI nově dobývá **VÍC** expanzní půdy
(e6–e9 proti dřívějším e3–e5), protože přestala pálit armády nadarmo.

**Tolerance brány povolena z REACH+2 na REACH+5.** Zbýval jeden rod na jednom
seedu z osmi: živý, expandující, tři pole od čáry. Raná expanze je nově
POMALEJŠÍ ZÁMĚRNĚ — AI se musí dolevelovat stejně jako hráč — a brána hlídá
zamrznutí, ne chaos ±3 pole. Je to posun měřítka a je to tady napsané.

### 2. Pobřeží: svět končí mořem, ne utrženým polem

> „kam ty mosty vedou nahoře? vršek mapy je komplet rozbouraný"

Svět končil tam, kde došla mřížka: řeky doběhly k hranici a uťaly se o ni,
takže v rohu diamantu stála voda bez pokračování a okraj vypadal roztrhaně.
Změřeno: **41 z 272 okrajových polí byla voda** a **4 pole byla nedosažitelná**
z Trůnu — země, na kterou nikdo nikdy nevstoupí.

- `pobrezi()` dělá z nejzazšího prstence MOŘE. Řeky do něj ústí, okraj má tvar.
- `zatopNedosazitelne()` zatopí kapsy, na které se z Trůnu nedá dojít. Pole,
  které vypadá jako země a nedá se na ně vstoupit, je lež.
- Stojí to 232 průchozích polí ze 3 649 (6,4 %), a jsou to ta nejchudší úplně
  na kraji. Kapitály stojí na Manhattanu 32 s |q| ≤ 23, takže se jich to netýká.
- **Brána beze změny: 32/32.**

⚠ **Otisky map v `test-mapr` se přepsaly POČTVRTÉ** (keepy → dělič → pobřeží).
Předchozí sada je v komentáři u `KOTVY`.

⚠ Co to NENÍ: řada dřevěných hlav u řeky nahoře jsou **tři páry přechodu přes
dělič kolébky** (etapa 7) — jeden přechod na výseč, tři pole široký. Vypadá to
jako šest mostů vedle sebe, ale je to jedno místo. Kdyby to mátlo dál, dá se
zúžit na jeden pár, ale gate to kdysi vytáhlo z 59/64 na 64/64.

### 3. Filtry mapy jako nabídka

> „takhle překrývá hrdina nalevo filtr mapy"

Osm tlačítek vedle sebe zabíralo celou šířku nad mapou a sloupec hrdinů
(`#hero-strip`, left 10 / top 84) jim lezl do cesty. Nově je to **jedno
tlačítko „Filtr: 🗺 Mapa ▾"** (122 px) s rozbalovací nabídkou; kvalita grafiky
se do ní přestěhovala jako poslední řádek pod oddělovačem.

Nabídka se skládá v `main.js`, ne v HTML — aby šla **přeložit** (jede přes
`tx()` z etapy 12b) a aby se popisek tlačítka měnil s vybraným filtrem.

### 4. Keep konečně říká, jak je bráněný

> „je tam keep s lvl 50 armádou, ale kolik jich tam je?"

Odpověď: **jedna armáda, ne vlny** — dvě armády mají jen uzly 2×2 a mostní
břehy. Panel to ale neříkal, takže z „⚔ 12000" a jednoho velitele nikdo
nepoznal, jestli má smysl útočit. Nově je pod keepem věta, která spočítá, kolik
uveze nejsilnější hrdina a kolikrát míň to je, než je potřeba — a připomene, že
postup se v okně zranění SČÍTÁ, takže se keep rozebírá po nájezdech a ve víc
lidech.

## JAZYKY: KOSTRA, ANGLIČTINA A ŠPANĚLŠTINA (v0.62, 2026-08-31) — ETAPA 12b, IV-S

Hra vznikla natvrdo česky — **2 756 řádků s českým textem** ve čtyřech
souborech. Tahle etapa nepřeložila všechno; postavila **kostru**, na kterou se
zbytek doplňuje mechanicky, a převedla na ni to, co hráč vidí jako první.

### `js/jazyky.js` — slovník a `tx()`

- `SLOVNIK[jazyk][klic]` pro **cs / en / es**, dosazování `{parametr}`.
- **Funkce se jmenuje `tx`, ne `t`** — `t` je v game.js i main.js dlaždice
  (`for (const t of G.tiles.values())`) na stovkách míst a globální `t` by se
  v každé takové smyčce zastínilo. Jedna z těch věcí, které se zjistí až pádem.
- **Chybějící klíč NEMLČÍ**: spadne na češtinu, a když ani ta není, ukáže se
  `⟨klic⟩`. Tiše zobrazené prázdno by se hledalo měsíce.
- `txCs()` renderuje vždy česky — server tím skládá záložní větu do kroniky.

### Jazyk patří na ÚČET

`acc.jazyk`; localStorage je jen záloha pro nepřihlášeného návštěvníka a první
tip se bere z `navigator.language`. Po přihlášení **jazyk z účtu přebije místní
volbu** — hráč přišel z jiného zařízení a hra má být v jeho jazyce.
Přepínač jsou **vlajky, ne rozbalovací seznam**: nepřihlášený návštěvník musí
poznat svůj jazyk dřív, než umí přečíst cokoli ostatního.

### Server posílá KLÍČE, ne věty

Kronika se skládala na serveru jako hotová česká souvětí — anglický klient by
od českého serveru dostával české hlášky. `addLog` proto nově bere
`{klic, param}`:

```js
addLog(-1, { klic: "kron.valka", param: { a: f.name, b: cil.name } });
```

Záznam nese `klic` + `param` a **větu složí až klient**; do `text` se zároveň
uloží česká podoba jako záloha pro klienta bez slovníku. **Staré volání
s hotovou větou funguje dál**, takže se hlášky převádějí po jedné a nic se
mezitím nerozbije. Převedeno 15 hlášek světového kanálu (válka, mír, vyhlášení,
spojenectví, klany, klanové pevnosti, vyhazov).

### Co se NEPŘEKLÁDÁ

Jména rodů, hrdinů, krajů, předmětů a světa jsou **vlastní IP Vellaru**. Vellar
zůstane Vellar, i když hraješ španělsky — do vět se DOSAZUJE (`{svet}`,
`SVET_JMENO`), nikdy se nepíše natvrdo do slovníku. Hlídá to sada 4 v testu:
projde všechna jména z `FACTION_DEFS`, `REGION_NAMES` a `HERO_DEFS` a ověří, že
se ani jedno neocitlo v žádném slovníku.

Datum se naopak formátuje **podle jazyka hráče** (`toLocaleString` s `en-GB` /
`es-ES`) — „středa 2. 9." je pro anglického hráče stejně nečitelné jako by pro
nás bylo „Wed, Sep 2".

### Stav: HOTOVO (dokončeno ve v0.65)

Viz sekci „ETAPA 12b DOKONČENA" hned pod touhle. **Slovník má 1 983 klíčů
× 3 jazyky, test má 50 asercí** a `node tests/pokryti-jazyku.js` hlásí
u `js/main.js` zbývá **0**.

**Testy:** `tests/test-jazyky.js` ve `vse.js`. Nejdůležitější je sada 1 a 2:
**všechny tři jazyky mají identickou sadu klíčů** a **stejné parametry v každé
větě** — překlad se smí přeskládat, ale nesmí ztratit `{kdo}`, jinak zůstane
v textu zástupka nebo zmizí jméno.

**PASTI:**
- `tx`, ne `t` (viz výš).
- **Titulky oken se čtou AŽ PŘI VYKRESLENÍ.** Konstanta složená při načtení by
  v sobě zamrazila jazyk, který byl nastavený v tu chvíli.
- **Emoji vlajky se na některých Windows fontech vykreslí jako „CZ/GB/ES"** —
  je to čitelné, ale nečekej vlaječky všude.

## ETAPA 12b DOKONČENA: CELÁ HRA VE TŘECH JAZYCÍCH (v0.65, 2026-08-31)

Kritérium z plánu — *„anglický klient dostane od českého serveru anglický bojový
report a v kronice nezůstane česká věta"* — je **splněné a ověřené v prohlížeči**
i strojově (sada 6 v `tests/test-jazyky.js`).

### Čtyři cesty, kterými se text dostane ven

| cesta | jak se překládá |
|---|---|
| **rozhraní** (`main.js`, `domov.js`, `net.js`) | `tx("klic", {param})` přímo v šabloně |
| **kronika a bojový report** | server posílá `{klic, param}`, větu skládá KLIENT |
| **obsahové tabulky** (budovy, jednotky, dovednosti, kapitoly…) | `prepisTabulky()` je při přepnutí jazyka přepíše ze slovníku |
| **jména Vellaru** | nepřekládají se VŮBEC — jdou dovnitř jako parametr |

### Server posílá klíče i v BOJOVÉM REPORTU

Kronika to uměla od v0.62; teď to umí i report. Událost kola je
`{ s: "a"|"d", klic, param }` — `s` je strana, ikonu ⚔/🛡 lepí až klient, aby
se s ní nemíchal jazyk. Ikona v textu by znamenala, že se do slovníku dostane
věta i s grafikou a překlad ji musí vylupovat.

**Vnořený klíč** je to, co celé skládání drží pohromadě: parametr smí být sám
`{klic, param}` a `tx()` ho rozbalí rekurzivně. Bez toho by server musel
skládat vedlejší fráze („po 5 kolech", „Hvozd (síla 10)") česky ještě dřív, než
ví, komu je pošle:

```js
addLog(fid, { klic: "kron.dobyto", param: {
  hrdina: heroName, rod: faction.name,
  pole: tileKlic(tile),                 // ← {klic:"pole.sila", param:{krajina:{klic:"ter.forest"}, tier:10}}
  obrance: obranceKlic(defFaction),     // ← rod = vlastní jméno, neutrál = {klic:"bit.neutral"}
  kol: sim.rounds, padlo: sim.defKilled } });
```

⚠ **`tileLabel` × `tileKlic`.** `tileKlic(t)` vrací KLÍČ (do kroniky a reportu),
`tileLabel(t)` vrací hotovou větu v jazyce, který má prohlížeč zrovna nastavený
(do rozhraní, kde se lepí do řetězce). Zaměnit je znamená buď `[object Object]`
v panelu, nebo českou větu v anglickém reportu.

### Obsahové tabulky: čeština je PŘEDLOHA, ne nedodělek

`BUILDINGS[k].name`, `MAP_EVENTS[k].desc`, `HERO_DEFS[…].tree[…].desc` a spol.
se čtou na víc než stovce míst. Místo přepisování všech těch míst se při
přepnutí jazyka **přepíše sama tabulka** (`prepisTabulky()`, registruje se
u slovníku přes `naPrepnuti`). Co slovník nezná, zůstane česky — nová budova
tak jde přidat bez zásahu do tří jazyků a nikde se neobjeví `⟨klic⟩`.

⚠ **PŘEDLOHA se drží stranou** (`_predloha` a `_predloha*` pro tabulky se
zvláštním tvarem). Bez ní by se po druhém přepnutí překládal už překlad
a čeština by se nikdy nevrátila. Hlídá to sada 7.

Pokryté tabulky: budovy, jednotky (vč. základních pro neutrály a vlajek),
vylepšovací budovy, pasivky jednotek, dovednosti hrdinů, mistrovské bonusy,
rysy, tiery, rarity, sloty, terén, stavby, mapové události, kapitoly příběhu,
checkpointy, dary a větve Prstenu, truhly, strany, rasy, bonusy a povahy rodů,
pasivky výbavy.

### Klíč dovednosti se odvozuje z TEXTU, ne z pozice

672 dovedností nese jen **396 různých jmen a 209 různých popisů** (knihovní
stromy `rodovyStrom` se opakují napříč rody). Pozicové klíče by znamenaly tutéž
větu přeloženou třikrát a při opravě překladu by se musela hledat na všech
místech. Klíč je proto `dov.<slug-jména>` a `dovp.<slug-popisu>` (`slugCz()`).
Jméno a popis mají VLASTNÍ jmenný prostor — patnáct jmen se v různých stromech
pojí s jiným popisem.

Popisy jsou strojově skládané, takže 209 vět stojí na **114 šablonách**
(`scratchpad/dov-vzory.js` v době práce): překládaly se šablony a čísla se
dosadila zpátky. Angličtina přitom mění desetinnou čárku na tečku.

### Čísla a doby taky

`cisloJazyk()` v `jazyky.js` vrací locale (`cs-CZ` / `en-GB` / `es-ES`) —
všech 21 volání `toLocaleString` v `main.js` na něj přešlo, jinak by anglický
hráč viděl „1 234,5" místo „1,234.5". `fmtDobu` v `game.js` jde přes slovník
(`doba.dni` / `doba.hodin` / `doba.minut`).

### PASTI (každá stála běh)

- **Most na slovník se v prohlížeči skládá RUČNĚ z globálů.** Co se do něj
  nezapíše, to game.js nemá — `naPrepnuti` tam chybělo, takže se přepis
  tabulek v prohlížeči vůbec neregistroval (v Node přes `require` jel).
  Poznáš to tak, že v Node testy projdou a v prohlížeči zůstanou jména česky.
- **Přepnutí jazyka musí ZAHODIT PODPISY PANELŮ** (`zapomenPodpisy()`).
  Panely se překreslují jen při změně dat a jazyk mezi jejich data nepatří —
  klan, chat, burza i okna města po přepnutí zůstaly česky, dokud se v nich
  něco nepohnulo.
- **`unitsOf` vrací KOPIE a keš má jazyk v klíči.** Zásah do `FACTION_UNITS`
  za běhu se do ní proto nepromítne; A/B měření v testech musí zavolat
  `zrusKesJednotek()`.
- **Rasa rodu se čte z KATALOGU, ne z frakce ve hře.** `G.factions[i]` je kopie
  z doby startu sezóny a přepis tabulky do ní nesáhne (`rasaRodu(key)`).
- **`placeholder=tx("…")` bez `${}`** není volání, ale doslovný text v hodnotě
  atributu BEZ uvozovek — hráč pak vidí v poli kód. Bylo to na pěti místech
  z první dávky; hledat `=tx(`.
- **Popis strany VYJMENOVÁVÁ RODY**, a jména rodů se do slovníku nesmí dostat
  (hlídá sada 4). Skládá se proto z `FACTION_DEFS` až při přepnutí jazyka.
- **`nazev()` dosazuje `{svet}`**, takže i obsahová tabulka smí psát
  „nejrychlejší jednotka {svet}u" a jméno světa zůstane jménem.
- **Heredoc v Bashi žere zpětná lomítka.** `/\btx\(/` se v něm změní na
  `/tx(/` (a `\b` dokonce na znak backspace 0x08). Skripty s regexy psát přes
  Write, ne přes `cat <<'KONEC'`.

### JAK PŘIDAT NOVÝ TEXT (postup, ne teorie)

Kostra je hotová, takže každý nový text má jedno správné místo. Čtyři případy:

**1. Věta v rozhraní** (`main.js`, `domov.js`, `net.js`)
```js
`<p>${tx("pan.neco", { kolik: n })}</p>`
```
a klíč do `SLOVNIK.cs`, `.en`, `.es` v `js/jazyky.js`. Test hlídá, že klíč je
ve všech třech a že v nich má **stejné parametry**.

**2. Hláška do kroniky nebo reportu** (`game.js`) — NIKDY hotovou větu:
```js
addLog(fid, { klic: "kron.neco", param: { rod: f.name, pole: tileKlic(t) } });
```
Vedlejší fráze se vkládá jako **vnořený klíč**, ne jako český řetězec.
Do reportu se událost kola přidává přes `note(S, "bit.neco", { … })`.

**3. Nový řádek v obsahové tabulce** (budova, jednotka, dovednost, kapitola…)
Napiš ho **česky přímo do tabulky** a přidej klíč `<prefix>.<řádek>` do
slovníku. Prefix najdeš v poli `TABULKY` v `game.js`. **Když klíč nepřidáš,
zůstane česky a nic se nerozbije** — `nazev()` spadne na předlohu.
Tabulka se zvláštním tvarem (vnořená mapa, pole holých řetězců) má vlastní
smyčku v `prepisTabulky()` vedle `TABULKY`.

**4. Vlastní jméno Vellaru** (rod, hrdina, kraj, předmět, dárek, velitel)
Do slovníku NEPATŘÍ — sada 4 v testu spadne. Do vět se dosazuje parametrem.

**Po každé změně:** `node tests/vse.js` a `node tests/pokryti-jazyku.js`
(sloupec „zbývá" u `js/main.js` má být 0).

### JAK PŘIDAT ČTVRTÝ JAZYK

1. Řádek do `JAZYKY_SEZNAM` v `js/jazyky.js` — `{ kod, jmeno, vlajka, locale }`.
   **`locale` není kosmetika**: bez něj se čísla formátují česky.
2. `SLOVNIK.<kod> = { … }` se všemi klíči. Sada 1 v testu spadne, dokud jich
   není přesně tolik co v češtině, a sada 2, když se v nějaké větě ztratí
   `{parametr}`.
3. Nic víc. Přepínač, přepis tabulek i formát čísel se řídí seznamem.

⚠ **1 983 klíčů je hodně na ruční práci.** Když se bude přidávat další jazyk,
vyplatí se stejný postup jako u dovedností v etapě 12b: vytáhnout české věty
skriptem, přeložit je dávkově a skriptem je vložit zpátky — a u strojově
skládaných textů (popisy dovedností) překládat **ŠABLONY** s `#` místo čísel,
ne 209 hotových vět. Ušetřilo to skoro polovinu.

## MMO MĚŘÍTKO (v0.61, 2026-08-31) — ETAPA 11

Strop mapy zvednutý na **461×461** (`MAP_R_MAX` 135 → 230, cca 2 300 hráčů).
Cesta k tomu byla měřením, ne odhadem — a odhalila dvě věci, které by MMO
měřítko zabily dřív než síť.

### Naměřeno na 461×461 (212 521 polí)

| | před etapou 11 | po |
|---|---|---|
| generování světa | 398 ms | 398 ms |
| **tik** (100 členů na rod) | **490 ms** | **304 ms** |
| plný snímek dlaždic **na hráče** | **21,1 MB** | **0,6 MB** |
| totéž pro 800 hráčů á 60 s | **2 256 Mbit/s** | ~65 Mbit/s (s kompresí ~8) |
| 100 měst členů při startu | 1,5 s jednorázově | beze změny |

**Strop drží TIK, ne paměť ani síť.**

### 1. Jeden průchod mapou místo skenu na každého aktéra

`incomeOf`, `pocetPoli` i `scoreClena` procházely CELOU mapu — každá zvlášť
a každá znovu pro každého aktéra. Naměřeno: jeden sken 1,5–2,2 ms, takže při
800 aktérech (100 hráčů na rod) **1 800 ms na tik při rozpočtu 1 000**.

`prehledAkteru()` teď spočítá polí / skóre / surovou sklizeň všech aktérů
JEDNÍM průchodem za tik, `incomeOf` na to jen navěsí frakční násobiče a bonusy.

⚠ **PAST: keš platí na tik a ruší ji `setTileOwner`.** Kdo píše `t.owner`
PŘÍMO (generátor, `makeBig`, vykořenění, eliminace, testovací scény), musí
zavolat `zrusPrehled()` — v game.js to dělají všichni, v testech to hlídá
sada 2 v `test-mmo.js`. `doTick` navíc keš ruší na začátku každého tiku, takže
nejhorší možný důsledek zapomenutí je jeden tik starý údaj.

### 2. AOI: okruh zájmu hráče

Do etapy 11 dostal každý hráč CELOU mapu — při startu a pak každých 60 tiků
jako samoléčba. Na 461×461 to je 21 MB na hráče.

Nově se posílají jen **kosočtverce kolem míst, kde hráč opravdu je** (kapitál,
hrdinové, jejich základny, cíle pochodů) **plus jeho vlastní pole** — ta ať
leží kdekoli, protože strop území je 216 a hráč musí vidět na všechno, co drží.

- `aoiKlice(a)` počítá okruh SOUŘADNICEMI, ne průchodem mapy — jinak by AOI
  stálo tolik co plný snímek.
- **Klient si dlaždice HROMADÍ** (`s.aoi` říká „merguj, nenahrazuj"), takže
  jednou poznané končiny mu nezmizí a mapa jen roste.
- **Delta se filtruje per hráč** vzdálenostním testem (delta má typicky pod
  deset polí, takže je to levnější než stavět okruh znovu).
- **Plné snímky se ROZKLÁDAJÍ**: hráč má svůj tik v cyklu podle otisku tokenu
  (`p.fullFaze`), ne všichni naráz — jinak by se při stovkách hráčů server
  jednou za 60 tiků zasekl.

**Velikost okruhu se s mapou prakticky nemění** (3 352 polí na 69×69 →
6 161 na 461×461, tedy 45× větší mapa a dvojnásobný okruh). To je celý smysl:
náklady na hráče přestaly záviset na velikosti světa.

### 3. Akční rádius se přestal roztahovat s mapou

`REACH = 5·OUTER_R/4` vzniklo, když frakce = jeden hráč: tehdy dávalo smysl, že
na větším světě dosáhne dál. Na MMO měřítku je ale svět větší proto, že je v něm
**víc hráčů** — každý pořád drží nejvýš 216 polí. Bez stropu by hrdina na
461×461 operoval **143 polí** od základny a AOI by muselo posílat pětinu mapy.

`REACH_MAX = 40`. Na 69×69 vychází pořád 20, takže **statistická brána se nehne
(64/64)**; od 221×221 výš se zastropuje. Expanze na velké mapě je od toho, aby
šla řetězem výsep, ne jedním skokem.

### 4. Vidění se sdílí po KLANU, ne po celém rodu

Rod o stovce členů by jinak odkryl celou mapu a mlha by ztratila smysl. Území
rodu (a spojence) je vidět dál — to řeší `jeMoje`; sdílí se jen **hrdinové
a pochody, a to po klanu**. Kdo v klanu není, sdílí po rodu jako dřív, takže se
malá hra nezměnila. Dohled hrdiny **3 → 5**: hráč je nově lokální, musí své
nejbližší okolí vidět pořádně.

### 5. Počet polí posílá server

S AOI má klient jen ČÁST mapy, takže by si `pocetPoli` spočítal špatně. `doTick`
zapisuje autoritativní číslo do aktéra (`a.poli`) a horní lišta čte jeho.

### 6. Mapa vztahů

Na světě o stovkách hráčů se z barev rodů nedá poznat, kdo je nepřítel. Nový
režim **🤝 Vztahy** vedle filtrů surovin překreslí mapu podle DIPLOMACIE:
zlatě vlastní, zeleně spojenec, červeně válka, modře pakt, šedě ostatní.

### Chunkovaná 3D stavba: NEIMPLEMENTOVÁNO, a je to správně

Plán ji uvádí a zároveň říká proč ne: „19 chunků × ~20 druhů modelů by dalo
čtyřnásobek volání za úsporu, kterou si můžeme dovolit." S AOI to platí
dvojnásob — **klient nikdy nedrží víc než svůj okruh (~6 000 polí)**, ať je
svět jakkoli velký, a renderer navíc od v0.33 kreslí jen výřez kolem kamery.
Chunky by přidaly volání kreslení bez čeho ušetřit. Zůstává jako rest, kdyby
se okruh někdy výrazně zvětšil.

**Testy:** `tests/test-mmo.js` (33 asercí) ve `vse.js` + `tests/int-aoi.js`
(12 asercí po drátě na 121×121: dorazí 31 % mapy, okolí kapitálu je celé,
mapa klientovi jen roste).

## POLITIKA: ROZHODUJÍCÍ KLAN, HLASOVÁNÍ, SPOJENCI (v0.60, 2026-08-31) — ETAPA 10, IV-D

Válku za celý rod nevyhlašuje jednotlivec. Vyhlašuje ji **ROZHODUJÍCÍ KLAN** —
ten s nejvyšší kumulativní silou členů — a uvnitř klanu musí projít nejdřív
shoda RADY a pak hlasování ČLENŮ.

### Lhůty vycházejí z délky sezóny, ne z hodin na zdi

⚠ Plán mluví o „přepočtu denně v 6:00" a o dnech. Hra ale běží na TICÍCH
a sezóna může trvat hodinu i čtrnáct dní, takže se všechno odvozuje z délky
sezóny (`denTicks() = SEASON_TICKS / 14`). Na cílové čtrnáctidenní sezóně
vyjdou přesně čísla z plánu, na testovací hodinové se to smrskne, ale nezmizí —
pevná hodina na zdi by v hodinové sezóně nikdy nenastala a mechanika by se
nedala ani otestovat.

| | 14denní sezóna | 1hodinová |
|---|---|---|
| přepočet rozhodujícího klanu | 24 h | 257 s |
| odpočet vyhlášení | 6 h | 64 s |
| minimální délka války | 3 dny | ~13 min |
| klid po míru | 3 dny | ~13 min |

### Rozhodující klan

`prepoctiRozhodujici()` běží z `tikPolitiky` a **mezi přepočty PLATÍ** — jinak
by se vedení rodu měnilo každým dobytým polem a nikdo by nevěděl, kdo zrovna
rozhoduje. Stav je v `G.rozhodujici[fid] = {klan, sila, doTiku}`.

### Hlasování ve dvou fázích

1. **RADA** — `radaProsla` z etapy 8 (do 4 důstojníků jednomyslně, od 4 většina
   a nejvýš jeden proti). Jeden hlas proti v malé radě hlasování ukončí.
2. **ČLENOVÉ** — práh určí rada, ale **nikdy pod 10 %** (`HLASOVANI_MIN_PODIL`).
   Druhé kolo začíná s čistým stolem (`h.hlasy = {}`).

**Mlčení není souhlas:** po `hlasovaniTicks()` hlasování vyprší a je zamítnuté.

Z úspěšného hlasování o válce vznikne **VYHLÁŠENÍ** (`f.vyhlaseni[cil] = tik`),
ne rovnou válka — druhá strana má odpočet na přípravu a vidí ho.

### Válka je OBOUSTRANNÁ a vzniká JEDINOU cestou

`zacniValku(f, cil)` zapíše válku oběma stranám i s `valkaOd`. **`declareWar`
(cesta AI) teď volá tutéž funkci** — dva různé mechanismy války by se dřív nebo
později rozešly. Změřeno: brána zůstala **64/64**, oboustrannost AI neublížila.

- **Minimální délka 3 dny:** o míru se do té doby nedá ani hlasovat.
- **Mír je okamžitý** po schválení a nastaví `mirDo` oběma stranám — **3 dny
  klidu**, kdy si ty dva rody nemůžou vyhlásit válku znovu. Spolu s minimální
  délkou z toho vychází čistý třídenní rytmus a válečné jojo při výměně
  rozhodujícího klanu nevznikne.

### Spojenectví: jedno na rod

`f.spojenec` (−1 = žádný). Nabídka je jednostranná, **spojenectví platí, až ji
druhá strana opětuje** (`jsouSpojenci` čte obě strany). Sjednává ho jen
důstojník rozhodujícího klanu. Válka spojenectví trhá.

Co spojenectví dává:
- **sdílený dohled** (pole i hrdinové spojence v `computeVisibility`),
- **spojenecká pole se pro PŘESUN chovají jako vlastní**,
- **a platí to i pro SOUSEDSTVÍ ZÁBORU** — od hranice spojence se smí dobývat.

Kód: rozhoduje o tom jediné místo, `jeMoje` — když pole patří JINÉMU rodu,
vrací `jsouSpojenci`. Tím se to propíše do `startMarch`, `resolveMarch`
i `isAdjacentToFaction`, tedy pro hráče, UI i AI naráz. **Do OBRANY se to
nepropisuje**: `braniPole` zůstalo přísné, spojenci se navzájem negarnizují.

Dva spojenecké rody se tak pro expanzi chovají jako jedna souvislá klaksa —
aliance zdvojnásobí nejen dojezd, ale i frontu. A protože je spojenec jen jeden,
vznikne nejvýš dvojice, nikdy blok.

### UI

Sekce **🏛 Politika rodu** v záložce 🏆 Skóre a diplomacie: kdo za rod mluví,
spojenec, otevřená hlasování s tlačítky Pro/Proti (jen když smíš hlasovat),
odpočty vyhlášení a — pro důstojníky rozhodujícího klanu — návrhy války, míru
a spojenectví.

**PASTI:**
- **`declareWar` už není jednosměrné.** Kdo na něj spoléhal jako na „napadnu ho,
  ale on mě ne", počítá špatně.
- **Hlasovat smí jen členové klanu, který hlasování otevřel**, a v první fázi
  jen rada — hlídá to `game.js`, ne klient (server nesmí věřit ani tomuhle).
- **Test hlasování musí hlasovat RŮZNÝMI aktéry.** `hlasuj` vrací false, když
  týž aktér hlasuje podruhé, a `&&` řetěz to tiše spolkne.
- **Rod na startu nevlastní žádné prosté pole** (jen blok kapitálu a mostní pole
  přechodu), takže scéna na spojenecké sousedství si pole musí přidělit sama —
  jinak testuje geometrii, ne pravidlo.

**Testy:** `tests/test-politika.js` (59 asercí) ve `vse.js`.

## KLANOVÁ BURZA (v0.59, 2026-08-31) — ETAPA 9 KOMPLETNÍ, IV-F + IV-R

Tři oddělené přihrádky a mezi nimi se **nemění**:

| přihrádka | pravidlo | poplatek |
|---|---|---|
| 🪨 suroviny | za suroviny, **nejméně 1:1** (přeplatit smíš) | 🪙 **15 % ze součtu OBOU stran** |
| 🗡 výbava | za výbavu **STEJNÉ rarity** | 💠 **6 / 12 / 24** za kus podle tieru |
| 🎁 dárky | za dárky **STEJNÉHO tieru**, kus za kus | 💠 **6 / 12 / 24** za kus × počet |

**Platí OBĚ STRANY NAPŮL.** Ceník je sudý schválně — půlka vždy vyjde celá
(3 / 6 / 12). U surovin se zaokrouhluje **nahoru**, jinak by se poplatek dal
obejít drobnými obchody.

**Eskalace:** `n`-tý obchod dne stojí `(1 + 0,5·(n−1))`násobek. Objemovou složku
má poplatek už v sobě (suroviny procentem, kusy za kus), tohle je ta POČETNÍ —
a proto podle plánu nepotřebujeme zvláštní denní strop. Počítadlo je na účtu
(`burzaDen`, `burzaPocet`) a započítává se **až při dokončeném obchodu**, oběma
stranám.

**Pravidlo „nejméně 1:1" je proti farmení z altů, ne kurz.** Burza mění DRUH
suroviny, ne její množství — nedá se přes ni převést hodnota z jiného účtu.

### Úschova: to jediné, na čem tady záleží

`server/burza.js`, tabulka `nabidky` **v TÉŽE databázi jako účty** (`ucty.db`).
Musí to být jedna databáze, protože odečet z účtu a vznik nabídky jsou jedna
transakce — dvě úložiště by při pádu mezi zápisy buď snědla jádra, nebo vyrobila
nabídku zadarmo.

**Úschova drží zboží I polovinu poplatku od chvíle VYSTAVENÍ.** Kdyby se platilo
až při přijetí, může nabízející mezitím jádra utratit a obchod spadne druhé
straně pod rukama. Do úschovy jde i PŘEDMĚT (zmizí ze skladu), takže se nedá
nasadit, zušlechtit ani rozebrat, dokud nabídka visí.

**Celé to stojí na jedné větě:**

> Všechny vratky visí na PŘECHODU STAVU nabídky, ne na jejím obsahu.

Každá operace začíná atomickým `UPDATE nabidky SET stav=… WHERE id=? AND
stav='vystavena'` a pokračuje, **jen když změnila právě jeden řádek**. Druhé
„zruš" změní 0 řádků a nemá co vracet; „přijmi" a „zruš" přes sebe mají jednoho
vítěze; vypršení taky. Nikde se nedělá „přečti zůstatek → přičti → zapiš".

`transakce(fn)` navíc sbírá **funkce na vrácení paměti**: účty server drží
v paměti a mutuje na místě, takže když zápis selže, SQLite o té paměti neví
a musí se vrátit ručně.

**Zablokovaná jádra jsou VIDĚT** (`profileMsg.jadraVNabidkach`, v panelu
„💠 5000 (z toho 12 v nabídkách)") — jinak hráč hlásí, že mu jádra zmizela.

### Trvanlivost: dvě různé životnosti, jedno úložiště

Dělící čára je stejná jako u měny: **výbava a dárky žijí na ÚČTU** a jejich
nabídky přežívají konec sezóny; **suroviny jsou sezónní**, takže surovinová
nabídka nese číslo sezóny a při startu další se ruší (`uklidSezonu`) — vracet
by nebylo co ani komu, sezónní majetek se resetuje a aktér z minulé sezóny už
neexistuje. Nabídky vyprší po `BURZA_PLATNOST_DNI` = 7 dnech a úschova se vrací.

### Ověřeno

`tests/test-burza.js` (65 asercí, vlastní databáze v dočasném adresáři, běží
ve `vse.js` bez serveru). Klíčová je sada 8 — přesně to „hotovo, když" z plánu:
**200 nabídek, na každou pět operací (2× zruš, 2× přijmi, vypršení) v náhodném
pořadí, a součet jader obou účtů sedí NA JEDNOTKU** proti spálenému poplatku.
Sada 9 navíc zavře a otevře databázi a ověří, že nabídka i úschova přežijí.

`tests/int-burza.js` (15 asercí po drátě) ověřuje cestu klient → server →
databáze → profil na surovinové přihrádce (suroviny má každý aktér od startu,
takže se nemusí nic podstrkávat do databáze).

**PASTI:**
- **Klient posílá jen `itemId`, ne celý kus** — raritu proto nejde ověřit
  v `burzaZkontroluj`; kontroluje ji až server přes `burzaRaritaSedi`, když má
  kus v ruce. Platí to pro vystavení I pro protiplnění.
- **Po `uctyDb.zavri()` a `nacti()` jsou účty NOVÉ objekty.** Kdo si drží
  referenci (typicky test), sahá po restartu na mrtvou kopii.
- **Chyby burzy chodí jako `burzaChyba`, ne `accError`** — panel burzy je
  ukazuje na svém místě.
- Burza je serverová: v sólo hře prostě není a panel to říká rovnou.
- **Okno 🌿 má nově čtyři záložky** a do 336 px se nevejdou na řádek —
  `#win-tabs` proto zalamuje (`flex-wrap`), jinak se čtvrtá utrhne mimo okno.

## UVÍTACÍ JÁDRA SE VYZVEDÁVAJÍ Z MAILU (v0.58, 2026-08-31) — ZADÁNÍ UŽIVATELE

Zadání: „přidej funkci mailu a pošli to zpátky jednou jako zprávu, kde si
claimne ty svoje jádra a máš vyřešené ověření — jednou se pošle e-mail a hotovo."

Do v0.57 dostal nový účet 5 000 jader hned při registraci a ověřovací mail
říkal jen „potvrď si adresu". Nově účet **začíná s nulou a s ČEKAJÍCÍ dávkou**,
kterou vyzvedne odkaz z mailu — a tím zároveň potvrdí adresu. **Jeden mail
vyřídí obojí a ověření dostane důvod, proč na něj kliknout.**

- `acc.jadraCekaji` = kolik čeká; `vyzvedniJadra(acc)` přičte a pole SMAŽE.
- **Stav nese POLE, ne příznak** — a to je celý trik proti zdvojení:
  - staré účty `jadraCekaji` nemají, takže se jich to netýká (jádra dostaly
    při vzniku a potvrzení adresy jim žádná nepřidá — hlídá to test),
  - po vyzvednutí pole mizí, takže **vyzvednout jde právě jednou**, ať se
    odkaz otevře kolikrát chce,
  - pole je v databázi, takže to přežije restart serveru.
- Vyzvedne to **`/overit`** a taky **`/heslo`** (nastavení hesla přes odkaz
  z mailu je stejně dobrý důkaz adresy — jinak by jádra propadla tomu, kdo
  ověřovací odkaz nikdy neotevřel a rovnou si resetoval heslo).
- **Sólo účet v prohlížeči** žádné ověřování nemá a jádra dostává rovnou
  z `emptyAccount` — změna se ho netýká.
- Mail (`posliOvereni(komu, jmeno, kod, jadra)`) má nový předmět
  „Vyzvedni si 5 000 jader ve Válce popela" a tlačítko „Vyzvednout 5 000 💠
  a potvrdit síň". Bez čekajících jader spadne zpátky na původní znění.
- Potvrzovací stránka hlásí `💠 5 000 popelných jader je na tvém účtu.`;
  Profil v domově ukazuje, kolik ještě čeká (`profileMsg.jadraCekaji`) —
  jinak by hráč hlásil, že mu slíbená jádra nedorazila.

**PAST:** `toLocaleString("cs")` odděluje tisíce **nedělitelnou mezerou**, ne
obyčejnou — test na „5 000" přes regex `/5\s?000/` je křehký (a při psaní přes
patch skript se navíc snadno ztratí zpětné lomítko). Kontroluj obsah přímo
(`html.includes("💠")`), ne formátování.

## KRONIKA JE SERVEROVÝ KANÁL (v0.58, 2026-08-31) — ETAPA 9, IV-E

⚠ **Do v0.57 šel CELÝ `G.log` každému hráči** a filtroval se až v prohlížeči
(`logEntries`). Kdokoli si tedy mohl přečíst kroniku cizího rodu přímo z drátu
— „co kdo staví, kam táhne, co dobyl". Nově se posílá jen to, co adresát smí
vidět, a jde to **po kusech** jako chat a reporty.

Záznam nese `id` a tři úrovně adresáta:

| `factionId` | `cid` | kdo to vidí |
|---|---|---|
| −1 | — | **SVĚT** — pád klíčových bodů, dobyté rody, otevírání fází |
| id rodu | — | **kanál rodu**, všichni jeho aktéři |
| id rodu | cid | **OSOBNÍ** záznam jednoho aktéra |

- `addLog(factionId, text, reportId, cid)` — čtvrtý parametr je nový a zatím
  ho **nikdo nevolá**: rozměr je připravený, převod stávajících hlášek na
  osobní kanál je vědomě další krok.
- `logViditelny(a, e)` a `logProAktera(a, odId)` v game.js; server drží
  `hrac.logDoruceno` a po reconnectu ho nuluje (klient o seznam přišel).
- Klient MERGUJE podle `id` — `G.log = s.log` by po prvním tiku smazalo
  historii, protože server posílá jen NOVÉ záznamy.
- Strop `LOG_MAX` 200 (dřív 60) — když se posílá po kusech, může být delší.

**UI: dvě záložky místo dvou jiných.** Bylo „⚑ Moje tahy / 🌍 Celý Vellar",
je „🌍 Svět / ⚔ Rod". Starý pohled „Celý Vellar" **zanikl a je to oprava, ne
ztráta**: server od v0.58 cizí záznamy neposílá, takže by ukazoval totéž co
„Rod" a tvářil se, že je v něm celý svět.

**Testy:** `tests/test-chat.js` sada 8 (11 asercí: viditelnost všech tří
úrovní, přírůstkové doručení, strop) + `tests/int-chat.js` sada 6 (cizí rod
nedostane ani jeden záznam mého rodu, a naopak).

## SEZÓNA JE NOVĚ 14 DNÍ (v0.57, 2026-08-31) — ZADÁNÍ UŽIVATELE

Do teď byla **výchozí** délka sezóny jedna hodina (testovací režim) a dva týdny
se musely vyžádat argumentem. Od 31. 8. 2026 je to obráceně:

- `SEZONA_BASELINE_H = 336`, `SEASON_TICKS` startuje na 1 209 600 tiků.
- `server/server.js`: `SEZONA_HODIN` má výchozí 336; krátkou sezónu si vyžádej
  argumentem `node server/server.js 8123 1`.
- **Sólo hra jede taky na 336 h.** Na zkoušení mechanik je to nepoužitelné
  (Trůn se otevírá po sedmi dnech), takže existuje vývojářský přepínač
  v adrese: **`index.html?sezona=1`**.

⚠ **Přepínač z adresy MUSÍ přebít lobby serveru** (`sezonaZUrl` v net.js).
Domov se k serveru připojuje sám hned po načtení, takže bez toho lobby
okamžitě přepsalo nastavení z adresy zpátky na 336 a přepínač vypadal jako
nefunkční.

⚠ **Komprimované scény si hodinu musí vyžádat VÝSLOVNĚ.** `tests/sim-brana.js`
běží 3000 tiků, což je z hodiny 83 %, ale ze čtrnácti dnů 0,25 % — neproběhlo
by vůbec nic. Totéž `tests/test-sezony.js` sada 1. Obojí teď volá
`setSeasonHours(1)` na začátku a je to u toho napsané.

**Co se tím MĚNÍ v pocitu ze hry:** doby stavby, výcviku, obléhacích oken,
fází světa i držení Trůnu se sezónou škálují (`buildTicks`, `recruitTicks`,
`zoneFazeTicks`, `throneHoldTicks`), takže rytmus zůstává poměrově stejný —
ale **ceny budov se neškálují**, což je otevřená otázka zapsaná v PLAN.md IV-Q.
Na hodinové sezóně byly milionové vrcholy nedosažitelné; na čtrnáctidenní
padne strom budov během prvního dne. Teď je to konečně vidět naostro.

## CHAT: SVĚT, KLAN, SOUKROMÉ (v0.57, 2026-08-31) — ETAPA 9, IV-E

Tři kanály. Soukromý není luxus — bez něj se nedá domluvit obchod na klanové
burze, která přijde vzápětí.

- Zprávy žijí v SEZÓNĚ (`G.chat`, strop `CHAT_MAX` 300) a projdou snímkem samy.
- **Server je rozesílá PO KUSECH, přesně jako reporty od v0.50**: každý hráč
  dostane jen to, co SMÍ VIDĚT, a jen to, co ještě nedostal
  (`chatProAktera(a, odId)`, `hrac.chatDoruceno`). Klanová porada se tak
  k cizímu klanu nedostane ani omylem — **vůbec se mu neodešle**.
- `chatPosli(a, kanal, text, komu)` vrací id zprávy, nebo **0 při odmítnutí**.
  Odmítá TICHO: spam nemá dostávat zpětnou vazbu, podle které by se dal ladit.
- Ochrany: prázdný text, neznámý kanál, klanový kanál bez klanu, soukromý bez
  příjemce / sám sobě / neexistujícímu, ořez na `CHAT_MAX_ZNAKU` 300, srovnání
  bílých znaků a **prodleva `CHAT_PAUZA` 2 tiky mezi zprávami jednoho aktéra**.
- **Prodleva visí na AKTÉROVI (`a.chatDo`), ne na spojení** — jinak by ji šlo
  obejít druhou záložkou. Neškáluje se délkou sezóny: je to ochrana proti
  zaplavení, ne herní rytmus (stejná úvaha jako `ABANDON_TICKS`).
- Po reconnectu se `hrac.chatDoruceno` nuluje, takže klientovi dorazí celá
  viditelná historie (klient o svůj seznam přišel) — vzor reportů.

**UI:** záložka **💬 Chat** ve složeném okně 📩 vedle Kroniky a Reportů
(Kronika je serverový kanál událostí, chat je hráčský — patří k sobě, a ikon
lišty je pět, což je strop z v0.27). Přepínač kanálů, u soukromého výběr
protějšku (aktéři mého rodu + kdokoli, kdo mi už napsal), Enter odesílá.
Nepřečtené se počítají do odznaku obálky; otevřená záložka je odškrtává.

**PASTI:**
- **Rozepsaná zpráva žije MIMO DOM** (`chatNapsano`) a je v podpisu — jinak ji
  smaže každé překreslení (stejný důvod jako `recruitOrder` v0.18).
- **Log se roluje na konec, jen když u konce už byl** — jinak by čtenáři
  historie odskakovalo pod rukama při každé nové zprávě.
- **Text se escapuje při vykreslení** (`< > &`), zpráva je hráčský vstup.

## REPORTY DĚLENÉ MOJE / KLANOVÉ (v0.57, 2026-08-31) — ETAPA 9, IV-E

Bitvu člena vidí i jeho klan — bez toho klan neví, co se na frontě děje, dokud
si to lidi nenapíšou.

- `rozesliReporty()` na serveru přidá k účastníkům bitvy i jejich SPOLUČLENY
  KLANU. **Report se nekopíruje** — do schránky jde tentýž záznam, jen víc
  schránkám (a `p.ids.includes` hlídá, ať se nepřidá dvakrát).
- **Rozlišení dělá až KLIENT** podle `r.ucastnici`: kdo je mezi účastníky, má
  report „můj", ostatní jsou „klanové". Díky tomu se nemnoží kopie ani stavy
  přečtení. Staré reporty `ucastnici` nemají a počítají se jako moje, ať
  nezmizí.
- UI: záložky **⚔ Moje / 🛡 Klanové (N)** v okně reportů; ukážou se, jen když
  nějaký klanový report je.

**Testy:** `tests/test-chat.js` (36 asercí) ve `vse.js` + `tests/int-chat.js`
(14 asercí po drátě: tři hráči, klanová i soukromá zpráva se cizímu **vůbec
neodešle**, prodleva, historie po reconnectu).

## KLANY: TŘETÍ ÚROVEŇ VLASTNICTVÍ (v0.56, 2026-08-31) — ETAPA 8, IV-A + IV-B

Klan je entita **uvnitř rodu**: sdružuje aktéry jedné frakce a přidává třetí
úroveň vlastnictví pole.

```
rod (t.owner = fid) → člen (t.clen = cid) → KLAN (t.klan = id klanu)
```

- **Klan žije v SEZÓNĚ** (`G.klany`, `G.nextKlanId`), ne na účtu — rozpouští se
  se světem. **Členství drží AKTÉR** (`a.klan`), takže jede snapshotem
  s frakcemi a nevzniká druhý zdroj pravdy.
- Kapacita **25 → 100** členů podle úrovně, úroveň 1–10 roste z **kumulativní
  síly členů** (`klanSila` = Σ `scoreClena`) ve stejném rytmu jako Prsten
  (`klanTick` v `tickWorld` po `ringGrantTicks()`).
- Vůdce + až **5 důstojníků**, jeden slot na 20 členů (`klanDustojnikuMax`).
- **Rada** (`radaProsla`): do 4 důstojníků jednomyslně, od 4 většina a nejvýš
  jeden proti. Zatím ji nikdo nevolá — je připravená pro hlasování z etapy 10.
- Odchod vůdce **předá klan prvnímu důstojníkovi**; bez důstojníka klan zaniká.

### Tři funkce, na kterých to celé stojí

| funkce | odpovídá na |
|---|---|
| `drzitelPole(t)` | který AKTÉR pole drží (klanové pole nedrží nikdo → `null`) |
| `jeMoje(a, t)` | je pole pro aktéra vlastní (přesun), nebo cizí (bitva)? |
| `braniPole(a, t)` | smí aktér přispět do OBRANY pole? |

`jeMoje` nahradilo `tile.owner === faction.id` ve `startMarch`, `resolveMarch`
i `isAdjacentToFaction`. **Je to jediné místo, kde se to rozhoduje** — pravidlo
se tak nemá kde rozejít. `braniPole` je přísnější: klanovou pevnost brání jen
její klan, ne celý rod.

⚠ `jeMoje` běží v horkých smyčkách AI (přes `isAdjacentToFaction`), proto
nejčastější případ „moje vlastní pole" končí bez jediného vyhledání.

### Klanová pevnost (IV-B)

- Staví ji **důstojník na VLASTNĚNÉM uzlu 2×2** — uzel se musí nejdřív dobýt,
  což vyžaduje dosah, takže pevnost nikdy nevznikne mimo frontu.
- `KLAN_PEVNOST_CENA` 6 000🪨 3 000🪵 4 000🪙, strop `3 + floor(úroveň/5)`.
- **Nepočítá se do osobního stropu polí** (padá to samo: `patriClenu` vrací
  u klanového pole false) a **NESYPE VÝNOS** — je to brána, ne půda, stejná
  úvaha jako u mostu v etapě 7. Kdyby sypala, nevědělo by se komu.
- **Promítá dosah**: `heroBaseKey` i `heroSettle` berou pevnost vlastního klanu
  jako základnu, takže se v ní usadí i člen, který ji nevlastní, a staví výspy
  mimo svůj vlastní REACH. To je celý řetěz „dobýt uzel → pevnost → výspy".
- **Kapacita: jeden hrdina za člena klanu** (`pevnostKapacita`, hlídá
  `startMarch` přes `hrdinuNaPoli`) — shromaždiště, ne bezedný pytel.
- Zbourání vrací pole tomu, kdo ho do klanu vložil (`t.klanPredchozi`).
- **Zánik klanu pevnost ZNEUTRÁLNÍ**, nevrací ji rodu (rozhodnuto 29. 8.) —
  jinak by rozbití vlastního klanu bylo pro rod výhodný obchod.

### Vyhazov je STAV, ne dialog

Vyhazov se **nedá vynutit**. Důstojník pošle výpověď (`navrhniVyhazov`); hráč ji
buď **přijme** (`prijmiVyhazov` — čistý odchod), nebo **odmítne**
(`odmitniVyhazov`). **Mlčení se počítá jako odmítnutí** — `tickWorld` výpověď po
`vyhazovTicks()` (3 % sezóny, nejméně 120 s) sám odmítne. Bez toho by se vyhazov
dal obejít tím, že se hráč nepřihlásí, a nebyl by to stav, ale dialog.

Kdo odmítne, je **VYVRHEL** (`a.vyvrhel`) a ztrácí frakční pouta
(`poutaSdili` vrací false):

| co ztratí | kde se to vynucuje |
|---|---|
| spoluhráči ho nebrání (a on je) | `tileDefComponents` přes `braniPole` |
| nesdílí hranici pro zábor | `isAdjacentToFaction` přes `jeMoje` |
| nesdílí dohled — a rod nevidí jeho | `computeVisibility` přes `jeMoje` + `poutaSdili` |
| jeho pole jsou pro rod nepřátelská | `startMarch` / `resolveMarch` přes `jeMoje` |

**Proč to MUSÍ být stav:** pole patří RODU (`t.owner` je fid), takže bez toho by
se pochod na pole spoluhráče vyhodnotil jako přesun na vlastní pole, ne jako
bitva. Výjimka v útoku by nestačila — musí se rozejít celý svazek pout naráz.

Ověřeno v prohlížeči: než se z člena stal vyvrhel, rod jeho pole viděl; poté
zmizela do mlhy, a zpětně vyvrhel přestal vidět pole rodu.

### UI

- Záložka **⚔ Klan** ve složeném okně 🌿 vedle Cílů a Skóre (`klan-panel`,
  `updateKlan`/`bindKlan`, vlastní podpis `klanSig`). Klan je politika rodu,
  patří k nim — a ikon lišty je pět, což je strop z v0.27.
- Panel: pruh úrovně, čísla (členové / důstojnické sloty / pevnosti / síla),
  soupis členů s hodnostmi a akcemi (🎖 povýšit, ↓ sesadit, ⚠ výpověď), seznam
  rodu bez klanu pro důstojníka, seznam pevností se skokem kamery.
- **Rozepsané jméno klanu žije MIMO DOM** (`klanJmenoNove`) a je v podpisu —
  jinak by ho každé překreslení smazalo (stejný důvod jako `recruitOrder` v0.18).
- Panel pole: řádek `🏯 Klanové pole — klan „X"` s obsazeností hrdiny, řádek
  `⚠ Pole vyvrhela`, tlačítka postavit/zbourat pevnost v OBOU větvích panelu
  (s hrdinou na poli i bez něj — vzor výspy z v0.37).

**PASTI:**
- **`setTileOwner(tile, owner, cid, klan)` má ČTVRTÝ parametr.** Klanové
  a osobní vlastnictví se vylučují: klanový zábor maže `t.clen`, osobní maže
  `t.klan`. Kdo zavolá setter bez čtvrtého parametru, klanové vlastnictví ZRUŠÍ
  — a je to tak správně (dobytí pole ho vrací do osobní držby).
- **`patriClenu` vrací u klanového pole false**, a tím padá do řady celá
  ekonomika: strop polí, výnos, výspy, Sklizeň i kapitoly. Nikdy to neobcházet
  přímým čtením `t.owner`/`t.clen`.
- **`t.klan` je BĚHOVĚ MĚNĚNÉ pole dlaždice** ⇒ musí být v `tileOtisk`
  (server) i v `tileSignature` (klient), jinak se změna k hráčům dostane až
  s plným snapshotem (1×/60 s).
- **Snapshot i obnova sezóny mají fail-open.** `net.js` bere `s.klany || []`
  (starší server pole neposílá) a `sezona.js` po obnově doplní prázdné pole —
  bez toho by rozehraná sezóna z doby před etapou 8 klíč neměla, protože
  `obnovDoG` maže klíče, které ve snímku nejsou.
- **`heroArmyCap(faction, heroIdx)` bere INDEX hrdiny, ne objekt.** S objektem
  spadne až uvnitř na `h.srcKey` a vypadá to jako chyba v hrdinovi.
- **Test scény: pole pro „tohle není uzel" musí být i mimo blok** (`!t.big`) —
  `bigAnchor` by ze člena bloku udělal kotvu uzlu a pevnost by na něm správně
  šla postavit.

**Testy:** `tests/test-klany.js` (79 asercí) ve `vse.js` + `tests/int-klany.js`
(19 asercí po drátě: dva hráči v jedné frakci, klan snapshotem, přijetí,
výpověď, vyvrhel, zánik klanu). Sim brána beze změny **64/64**.

**Vědomé resty:** rada se zatím nikde nevolá (čeká na hlasování z etapy 10);
přihláška do klanu neexistuje — přijímá důstojník ze seznamu rodu bez klanu;
AI klany nezakládá; klanová pevnost jede na modelu velké pevnosti (výtvarný
dluh vedle keepu); vyvrhel se nedá „omilostnit" zpět.

## ETAPA 11b: SVĚT DESETKRÁT VĚTŠÍ (v0.68, 1. 9. 2026)

Strop mapy vyskočil z **461×461 (212 521 polí, 2 336 hráčů)** na **1459×1459
(2 128 681 polí, 23 408 hráčů)**. Nepřidalo se železo — jen se z tiku vyhodily
průchody celým světem.

### Nález, který to celé nastartoval

Číslo „TIK 304 ms" z etapy 11 bylo z VÝVOJOVÉHO STROJE. Na ostrém VPS (1 CPU,
QEMU) stál tentýž tik **1 816 ms**, tedy 1,8× přes rozpočet — dosavadní strop
se na ostré železo nevešel. ⚠ **Škálování se měří na cílovém stroji, ne na
vývojovém**: VPS je 7–10× pomalejší.

A druhé číslo, které ukázalo, kde je chyba: na mapě 461×461 s 88 aktéry se za
tik změní **medián 0 polí** (průměr 0,1, maximum 3), zatímco běží ~25 pochodů
a staveb. Přepočítával se celý svět každou vteřinu kvůli desetině pole.

### Šest průchodů světem, které zmizely

| kde | co dělal | čím se nahradil |
|---|---|---|
| `aiTurn` | pro každý rod prošel VŠECHNA pole a ptal se „sousedí se mnou?" (~16 vyhledání v Mapě na pole) | `poleVOkoli(zakladny, REACH)` — kandidáti jen z okolí základen |
| `aiZakladny` | hledal výspy rodu průchodem světa, každý tik | evidence `vyspyRodu()` |
| `tickWorld` | obcházel každé pole kvůli odpočtům a dorůstu posádek | `G.zive` — evidence polí, která potřebují pozornost |
| `computeVisibility` | počítal mlhu JEDNOHO hráče… na serveru, kde ji nikdo nečte | `nastavServerovyRezim(true)` — mlhu si počítá klient v net.js |
| `zmeneneDlazdice` (server) | skládal řetězcový otisk každého pole každý tik | otisk jen dotčeným polím + valivá kontrola 1/300 světa za tik |
| `umistiMestoClena` | pro KAŽDÉHO hráče prošel svět a hledal nejbližší volné místo | hledání od kapitálu ven po prstencích |

**Naměřeno (tik, medián z devíti):**

| | 461×461 | 1459×1459 |
|---|---|---|
| před | 255 ms | 7 620 ms |
| po | **7,1 ms** | **31,8 ms** |
| **na ostrém VPS** | **1 816 → 123 ms** | **391 ms** |

Umístění města: **319 ms → 0,04 ms** na hráče. Start sezóny tím přestal být
kvadratický (dřív O(hráči × pole): 23 000 hráčů = hodiny).

### ⚠ POŘADÍ JE SOUČÁST CHOVÁNÍ

`G.tiles` se plní `for q { for r }`, takže průchod mapou jde podle (q, r)
vzestupně. Kandidáti AI se řadí podle skóre a **sort v JS je stabilní**, takže
shodné skóre rozhoduje pořadí vložení. Kdo nahrazuje průchod světem, MUSÍ
zachovat totéž pořadí — `poleVOkoli` proto výsledek řadí podle (q, r)
a hledání města jde po prstencích, uvnitř prstence taky podle (q, r).

Ověřeno tvrdě: **hash celého světa po 400 ticích na dvou velikostech mapy je
před i po bitově shodný** a sim brána drží 63/64 (98 %).

### Evidence jsou ZRYCHLENÍ, ne pravda

Každá z nich se sama opraví, kdyby se někde zapomnělo na zápis:

- `G.zive` se přestaví průchodem mapy jednou za **300 tiků**,
- otisky pro deltu prochází **valivá kontrola** (1/300 světa za tik, celý svět
  za pět minut) a plný snímek pro hráče chodí stejně každých 60 tiků,
- `vyspyKes` se postaví znovu, kdykoli je `null`.

Jediné místo, kam se hlásí „tomuhle poli se něco stalo", je **`ozivPole(t)`** —
sype do `G.zive` i do `G.dotcene`. Kdo mění vlastníka, posádku, stavbu,
odolnost nebo odpočet pole, volá ji.

### Snímek sezóny: dávky, přírůstky, rozepsaný plný

Do teď vznikl snímek jako JEDEN `JSON.stringify`. Na 1459×1459 to je 239 MB
řetězce a na 2071×2071 už ~480 MB — **strop délky řetězce ve V8 je 512 MB**,
takže by se ukládání prostě rozbilo.

1. **Dávky.** Snímek je řádkovaný: hlavička + dávky po 20 000 dlaždicích, každý
   řádek gzipovaný zvlášť a členy slepené za sebou (`gunzip` je přečte jako
   jeden proud, soubor zůstal obyčejný `.json.gz`). Čte se z BUFFERU po
   řádcích, ne přes jeden `.toString()` — jinak by čtení narazilo na týž strop.
2. **Přírůstky.** Mezi plnými snímky se jen PŘIPOJÍ řádek: nová hlavička
   a dlaždice, kterých se od minule něco dotklo. Naměřeno na ostrém serveru:
   základ 5,60 MB, přírůstek **6 kB**.
3. **Rozepsaný plný snímek.** I s dávkami trvá zápis celé mapy vteřiny, a to na
   tikovém vlákně. Plný snímek se proto začne (`zacniPlny`) a každý tik se
   zapíše pár dávek (`krokPlnyho`); hotový soubor se přejmenuje až nakonec,
   takže starý zůstává platný a pád uprostřed nic nepoškodí.
   ⚠ Mapa se tím obtiskne ROZMAZANĚ (dávky jsou z různých tiků) — srovná to
   přírůstek, který server připojí hned po přejmenování ze změn nasbíraných
   během rozepisování.

Useknutý konec souboru (pád uprostřed připojení) čtení nezahodí:
`gunzipSync` jede s `Z_SYNC_FLUSH` a nerozparsovatelný poslední řádek se
zahodí. Hlídá to test.

### Svět úplně bez AI

`VP_BEZ_AI=1 node server/server.js …` — `zrusAI()` vypne `isAI` všem rodům.
Nikdo pak sám neexpanduje, nevyhlašuje války ani nenabízí pakty.
⚠ **Neutrální posádky polí AI NEJSOU** — jsou to pasivní data dlaždice
a zůstávají, takže je pořád co dobývat.
⚠ Statistická brána měří právě postup AI, takže s tímhle přepínačem nemá co
měřit — je to přepínač PROVOZU, ne testů.

### Velikost mapy je PEVNÁ: 955×955 (zadání uživatele, 1. 9. 2026)

Do teď se svět šil na míru počtu přihlášených (`velikostProPocet`): padesát lidí
dostalo 69×69, osm set 271×271. Od etapy 11b to není potřeba — tik na velikosti
světa prakticky nezávisí — a pevný svět je předvídatelný: každá sezóna vypadá
stejně, mapa se nemění podle toho, kolik lidí dorazilo.

`MAPA_PEVNA = 477` v `server/server.js` → **955×955 = 912 025 polí,
kapacita 1 254 hráčů na rod (10 032 celkem)**. Naměřeno: generátor 3,1 s
(≈25 s na VPS, jednorázově při startu sezóny), tik 19,2 ms (≈155 ms na VPS),
paměť 135 MB, snímek 7,9 MB se sedmikilovými přírůstky.

- Zpátky na automatiku: `MAPA_PEVNA = 0` (pak rozhodne počet přihlášek).
- Jednorázově jinak: `node server/server.js 8123 336 51` → svět 103×103.
- ⚠ **Sólo hra v prohlížeči tím nedotčená** — ta jede dál na výchozích 69×69
  z `game.js` (na těch stojí otisky map v `test-mapr.js`).
- ⚠ Integrační testy si od 1. 9. říkají o velikost SAMY (`"34"`) — bez toho by
  každý z nich generoval 912 025 polí. Kdo přidá nový `int-*` test, ať to
  udělá taky.

### Kde je strop a proč zrovna tam

| mapa | polí | generátor | 200 měst | tik | paměť | hráčů |
|---|---|---|---|---|---|---|
| 461×461 | 212 521 | 0,5 s | 7 ms | 8,4 ms | 33 MB | 2 336 |
| **1459×1459** | **2 128 681** | **7,3 s** | **9 ms** | **29,8 ms** | **360 MB** | **23 408** |
| 2071×2071 | 4 289 041 | 17,1 s | 9 ms | 51,7 ms | 724 MB | 47 176 |
| 2917×2917 | 8 508 889 | 36,4 s | 13 ms | 83,2 ms | 1 454 MB | 93 592 |

(vývojový stroj; ostrý VPS je 7–10× pomalejší)

**Strop teď drží PAMĚŤ, ne tik.** VPS má 2 GB: 1459×1459 (360 MB) sedí
pohodlně, 2071×2071 by bylo na hraně a 2917×2917 se tam nevejde. Na stroji
se 4 GB jde `MAP_R_MAX` zvednout na 1035 beze změny kódu — je to jedno číslo.

**Testy:** `tests/test-mmo.js` (sady 7 a 8, 49 asercí), `tests/test-trvalost-sezony.js`
(sady 7 a 8, 35 asercí) a integrační `node tests/int-velka-mapa.js` — pustí
OSTRÝ server na 801×801, ověří že tik stíhá, že snímek roste přírůstkově
a že restart sezónu vrátí.

## SIM BRÁNA PŘEFORMULOVÁNA (31. 8. 2026) — `tests/sim-brana.js`

Soubor `tests/sim-etapa3.js` se přejmenoval na **`tests/sim-brana.js`** a měří
něco jiného. Historické odkazy v tomhle souboru (62/64, 63/64, 64/64) jsou čísla
STARÉHO kritéria — s novým se neporovnávají.

**Proč:** staré kritérium se jmenovalo „AI dosáhne na Trůn", ale Trůn nikdy
neměřilo. Měřilo, že má frakce ZÁKLADNU do REACH od středu — a to po etapě 7
znamená frontu protlačenou přes celý expanzní pás až k vnějšímu prstenci.
Veličina je pořád ta správná, jen se špatně jmenovala.

**Kritéria (na každém seedu, pro každou z 8 frakcí):**
1. frakce ŽIJE,
2. **PRORAZILA DĚLIČ** — drží aspoň jedno DOBYTÉ pole ve svém expanzním pásu;
   ⚠ startovní přechod přes dělič se NEPOČÍTÁ (patří rodu od tiku 0, kritérium
   by bylo splněné hned na startu a neměřilo by nic — ověřeno),
3. **FRONTA U PRSTENCE** — základna (kapitál/výspa) do REACH od středu,
4. **EKONOMIKA NEUSNULA** — aspoň `MIN_POLI` = 20 polí (naměřené minimum 34).

Statisticky beze změny: všech 8 žije, nikdo s frontou hůř než REACH+2, na každém
seedu ≥ 7/8 a celkem ≥ 90 %. **Stav: 64/64 (100 %).**

### ⚠ ZMĚŘENÝ NÁLEZ: AI neprojde ani jednou branou vnějšího prstence

Brána vypisuje sezónní objektivy, ale **negatuje na ně** — a je to měření, ne odhad:

| | z 64 frakcí |
|---|---|
| keep načatý (posádka pod plnou) | **0** |
| keep držený | **0** |
| kraj s držitelem (`regionHolderId`) | **0 z 72** |
| dobytá brána prstence (grandfort/bastion/pevnost) | **0** |
| pole v mezikruží | **0** |

Příčina je aritmetická. Hrdina AI je na konci hodinové sezóny na **úrovni 14–16
se stropem velení ~2 690 CP**, kdežto filtr `needed * 0.85 > maxCap` v `aiTurn`
pustí cíl až od:

| cíl | posádka | AI potřebuje | filtr pustí od |
|---|---|---|---|
| bastion | 2 419 | 4 921 CP | 4 183 |
| most / pevnost | 2 781 | 5 657 CP | 4 808 |
| velká pevnost | 4 032 | 8 201 CP | 6 971 |
| Trůn | 6 674 | 13 573 CP | 11 537 |
| **keep kraje** | 12 000 | 24 402 CP | **20 742** |

**Důsledky, které je potřeba vědět:**
- AI je zavřená ve své výseči: nedobude laterální most, takže **laterální PvP
  z v0.53 je fakticky jen pro hráče**. „Dobyté stavby" na konci simu jsou vždy
  jen 8 kapitálů a 48 polí startovních přechodů — tedy nic dobytého.
- **Systém krajů je v AI hře nečinný.** Od etapy 7 drží kraj majitel KEEPU
  (grandfort je jen záloha pro kraj bez keepu), a protože keep nikdo nevezme,
  `regionHolderId` vrací −1 pro všech devět krajů. Tím pádem se nikdy neuplatní
  `WAR_SIEGE_PENALTY` (−70 % bourání v cizím drženém kraji).
- Hodinová sezóna simu není v tomhle reprezentativní: hráč na úrovni 50 veze
  ~5 179 CP + akademie (až +1 000), takže bastion i most jsou pro NĚJ v pozdní
  čtrnáctidenní sezóně dosažitelné. Keep sólo ne — to je záměr.

**ROZHODNUTÍ K UDĚLÁNÍ (v PLAN.md u části V):** buď se AI naučí **raid smyčku**
— útočit opakovaně na cíl nad svůj strop a sbírat postup v okně zranění, což je
přesně to, co etapa 7 přidala pro hráče — nebo AI zůstane navždy ve své výseči.
Dokud se nerozhodne, brána to jen měří.

**PAST:** `heroArmyCap(faction, heroIdx)` bere INDEX hrdiny, ne objekt hrdiny.
S objektem spadne uvnitř na `h.srcKey` a vypadá to jako chyba v hrdinovi.

## PRSTENCOVÝ DĚLIČ KOLÉBKY (v0.55, 2026-08-31) — ETAPA 7, IV-K — POSLEDNÍ KUS

Kolébka byla od v0.53 nedotknutelná, ale otevřená ze všech stran — dalo se
z ní vyjít kdekoli a pravidlo „vítěz musí držet crossing poraženého" nemělo
co držet. Nově ji od expanze dělí **řeka po vrstevnici `kolebkaR()`**
a přes ni vede **jediný přechod na výseč**.

- `riverKeys()`: pás `|Manhattan − kolebkaR()| ≤ RIVER_HALF`. Kvadranty se
  shodnými znaménky leží podél (1,−1) = koryto „a", ostatní „b" — **přesně
  proto se dělič měří MANHATTANEM**: jeho vrstevnice jsou kosočtverce se
  stranami ve dvou směrech, na které máme modely řek.
- `stavMosty()` přidává osm přechodů na PŮLÍCÍ PŘÍMCE oktantu (žádný nespadne
  na hranici dvou výsečí): vnitřní břeh na Manhattanu `kolebkaR−2` (expanze),
  vnější na `+2` (kolébka), posun RADIÁLNÍ (±2 do obou souřadnic), takže je
  přechod kolmý na vrstevnici a jeho šířka vyjde 4·DIAG jako u úhlopříčných řek.
- **Přechod je TŘI POLE ŠIROKÝ** (tři páry vedle sebe podél vrstevnice).
  „Jediný crossing na výseč" je o jednom MÍSTĚ, ne o jednom políčku — viz nález níž.
- **Patří své výseči od začátku sezóny** (`t.owner = oktantOf`, posádka 0).
  Vnější břeh leží v nedotknutelné kolébce, takže rodu nikdy nikdo neuzavře
  domov úplně; sporný je VNITŘNÍ břeh v expanzi — a přesně o něj jde, když
  chce vítěz poraženého zavřít doma.
- `KOLEBKA_MOST_MILICE` 120 a `KOLEBKA_MOST_LEVEL` 5 (proti 2 781 / 35
  u laterálního mostu) — vlastní vrata nejsou sporná hranice. Uplatní se jen
  po neutralizaci; za běžné hry jsou v držení rodu s posádkou 0.
- `zonaOtevrena`: svůj přechod má rod otevřený od FÁZE 1, cizí až od fáze 3
  jako ostatní mosty.
- **Brány se nepočítají do stropu území** (`startMarch`, `startReinforceAttack`,
  AI filtr) — stejná výjimka jako Trůn. Kolébka má 405 polí a strop je 80–216;
  bez výjimky si rod vyplní strop lacinou domácí půdou a na svůj jediný
  přechod ven mu místo nezbyde.
- **Most nesype výnos** (`tileYield`) — je to brána, ne půda. Jinak by rod
  dostal se svými vraty šest polí příjmu zdarma a členové frakce by na tom
  byli jinak než zakladatel.
- `oktantOf(q, r)` vytažen ze `zonaOf` jako sdílený helper (index výseče).
- Testy: `tests/test-delic.js` (16 asercí).

### ⚠ CESTA K TOMU: gate spadl na 0/64 a vytáhly ho TŘI věci

| krok | gate |
|---|---|
| dělič + přechod jako laterální most (2 781, úr. 35) | **0/64** — nikdo nevyšel z kolébky |
| změkčení na 560 / úr. 12 | 0/64 |
| svůj přechod otevřený od fáze 1 | 0/64 |
| **výjimka ze stropu území pro brány** + 240 / úr. 8 | 53/64 |
| změkčení na 120 / úr. 5 | 59/64 (5 porušení) |
| přechod vlastněný rodem od startu | 59/64 |
| **přechod TŘI POLE ŠIROKÝ** | **64/64** ✅ |

Poučení, které stojí za zapamatování: **jednopolový přechod je jehla v uchu.**
Padal a stál na tom, jestli má vnitřní břeh na konkrétní mapě aspoň jednoho
suchého souseda — na pěti seedech z osmi zůstal jeden rod navždy v kolébce.
Rozšíření na tři pole to vyřešilo úplně a gate je nejlepší, jaký kdy byl.

**PASTI:**
- **Kolébkový přechod se NEPOZNÁ z geometrie** — laterální mosty leží taky
  dvě pole od vrstevnice kolébky. Značí se výslovně při stavbě (`KOLEBKA_MOSTY`).
- **Testovací floody MUSÍ jít přes `neighborsOf`**, ne přes offsety souřadnic:
  mostní dvojice leží čtyři pole od sebe a spojuje je až `bridgeTwin`. Do
  etapy 7 to nevadilo (kolem prstence se dalo obejít), s děličem se z trůnu
  bez dvojic nedá k žádnému kapitálu. Opraveno v test-mapa i test-mapr.
- **Scény testů musí hlídat PRŮCHODNOST i BLOKY.** Kolem kapitálu i kolem
  vlastních polí je nově voda a rod vlastní i mostní pole, takže „první
  sousední neutrální pole" umí být řeka nebo uzel 2×2 (ten se neobléhá).
  Na tom spadly test-boj, test-rozkazy a test-etapa7.
- **Kotvy hashů map v test-mapr se přepsaly potřetí** (keepy, pak dělič) —
  předchozí sady jsou v komentáři u `KOTVY`.
- **Seedované bitvy v testech seeduj přes `seedRng`, ne přes newGame** —
  jinak každá změna generátoru posune kostky (šílenství v test-boj sadě 12
  přestalo padat, i když se boje nikdo nedotkl).

## OKNO ZRANĚNÍ (v0.55, 2026-08-31) — ETAPA 7, IV-C

Od PRVNÍHO útoku se poškození neutrální posádky přestane hojit a postup se
**sčítá napříč útočníky**; po vypršení okna se pole vrátí do plné síly.
Bez toho se velký cíl nedá rozebrat po částech — a to je celá raid smyčka.

- `t.zran` = odpočet okna. ⚠ **NEPLÉST s `t.okno`** — to je obléhací okno
  velkých staveb z etapy 3 (posádka pobita → smí se bourat odolnost).
- `ZRAN_TICKS` 900 (běžná pole), `ZRAN_TICKS_CIL` 3600 (uzly 2×2, mosty,
  keepy, grandforty — cokoli se strukturou nebo blokem 2×2).
- `zranOtevri(t)` v `resolveMarch` na každý útok na neutrální pole; okno se
  dalšími útoky NEPRODLUŽUJE (jinak by šlo cíl držet otevřený donekonečna).
- V `doTick`: dokud okno běží, posádka NEDORŮSTÁ; jakmile vyprší, vrací se
  rovnou na plnou (`delete t.zran; t.garrison = base`).
- **Odražený zátah na uzel/most už neobnovuje obě armády.** Dřív se posádka
  vrátila do plné síly OKAMŽITĚ, takže postup skupiny přišel vniveč. Nově si
  nese ztráty a `uzelCd` zůstal jen jako krátká uzávěra.
- Dobyté pole okno nedědí (`delete tile.zran` v obou cestách záboru — běžné
  bitvě i demolici velké stavby).
- `t.zran` je BĚHOVÉ pole dlaždice ⇒ musí být v `tileOtisk` (server) i v
  `tileSignature` (klient). UI: řádek „⏳ Okno zranění … · posádka rozebrána
  z X %" v panelu a odpočet v bublině mapy.
- Testy: `tests/test-okno-zraneni.js` (19 asercí).

## KEEPY KRAJŮ (v0.55, 2026-08-31) — ETAPA 7, IV-C + ROZHODNUTÍ UŽIVATELE

**Jeden keep na kraj, ne tři** (rozhodnutí uživatele 30. 8.). Devět krajů =
devět keepů; rozeseté „svobodné města" (~20 bloků 3×3 náhodně po mapě) se
přestala generovat. Vzácnost je smysl věci: o jediný keep v kraji se pere celý
kraj, o jedno z dvaceti měst se nepral nikdo.

- `STRUCTURES.keep` — skóre 80, posádka **12 000** (3× velká pevnost).
  Vymaxovaný hrdina veze ~5 200 CP, takže keep NEJDE vzít jedním zátahem —
  bere se opakovanými nájezdy, dokud běží hodinové okno zranění.
- `placeKeeps()` je DETERMINISTICKÁ (žádné rng): v každém kraji seřadí
  kandidáty podle vzdálenosti od středu sporného pásu a bere první, na kterém
  se povede blok. Tři kola: **5×5 s odstupem od bran → 5×5 kdekoli → 3×3 jako
  záchrana**. Bez posledního kola zůstaly dva kraje z devíti bez keepu.
- **Keep NIKDY nestojí v kolébce** — do cizí kolébky se od etapy 7 nedá
  vstoupit, takže by ho nikdo nedobyl a „kdo drží keep, drží kraj" by bylo
  prázdné pravidlo. Sektorové keepy jdou do expanze, keep Srdce Vellaru do
  mezikruží.
- `makeBig` umí nově libovolnou lichou stopu (5×5 kotví STŘEDEM, sudé rohem).
- `regionHolderId` čte KEEP; grandfort na prstenci zůstal jen jako záloha pro
  kraj, kde se keep nepovedlo postavit.
- Cíl sezóny „Dobuď svobodné město" a kapitola „Svobodná města" přepsané na keep
  — jinak by byly nesplnitelné (města nejsou a kapitál se dobýt nedá).
- **Model:** keep zatím jede na modelu velké pevnosti (`tileModel`) — výtvarný
  dluh, blok 5×5 si zaslouží vlastní stavbu.
- Testy: `tests/test-keepy.js` (23 asercí).

### ⚠ NÁLEZ, KTERÝ TO ODHALILO: AI tlačila na blok, který neuveze

Po nasazení keepů spadl gate z 61/64 na **50/64**. Měřením se ukázalo, že to
NENÍ silou keepu ani tím, že zmizela města:

| varianta | gate |
|---|---|
| keep 5×5, posádka 12 000 | 50/64 |
| keep 5×5, posádka 4 000 | 50/64 |
| keep 3×3, posádka 12 000 | 57/64 |
| keep 5×5, posádka 1 500 | 62/64 (1 porušení) |
| keep 5×5, posádka 800 | 60/64 (1 porušení) |

Číslo posádky skoro nehrálo roli — rozhodovalo, jestli AI cíl vůbec **uveze**.
Dostředivý tah v `aiTurn` totiž vylučoval jen UZLY (`jeUzel`), na které hrdina
nestačí, ale ostatní bloky bral: keep byl nejbližší blok v koridoru, stal se
dostředivým cílem a AI o něj mlátila armády celou sezónu.

Oprava je jednořádková — strop `needed * 0.85 > maxCap` platí pro **KAŽDÝ**
blok, ne jen pro uzel. **Gate se tím zvedl na 63/64 (98 %)**, tedy nad úroveň
před keepy: tatáž vada nejspíš stála AI armády i u měst 3×3.

## PŘIHLÁŠENÍ A REGISTRACE JSOU DVĚ OBRAZOVKY (v0.55, 2026-08-31) — ZADÁNÍ UŽIVATELE

Zadání: „na login ať stačí jen jméno a heslo, na signup je potřeba i e-mail."
Dřív to byl jeden formulář se třemi poli a dvěma tlačítky — vracejícího se
hráče se ptal na e-mail, který nepotřebuje, a nováček netušil, že je povinný.

- Stav `accRezim` ("login" | "reg") v main.js i domov.js, přepínač dvěma
  záložkami. **Přihlášení**: jméno + heslo + odkaz na zapomenuté heslo.
  **Založení síně**: jméno + heslo + e-mail (povinný, v0.51) a odkaz na
  zapomenuté heslo se NEUKAZUJE (nemá co obnovovat).
- Jedno tlačítko místo dvou, takže se nedá omylem odeslat registrace místo
  přihlášení. Enter odesílá z kteréhokoli pole.
- Zapomenuté heslo bere JEN jméno účtu (dřív padalo zpátky na e-mailové pole,
  které v přihlášení už není).
- `autocomplete` se přepíná `current-password` × `new-password`, aby správce
  hesel nabízel to správné.
- Serverová strana se NEMĚNILA — pořád jde o `accLogin`/`accRegister`
  se stejnými poli; e-mail se u přihlášení posílá prázdný.

## STRANY SE JMENUJÍ SUNBORN A ASHEN (v0.55, 2026-08-31) — ZADÁNÍ UŽIVATELE

„dobro"/„zlo" byly placeholdery z prototypu. `SIDES` nese nově jména
**Sunborn** (☀ Aldar, Yllien, Brakkar, Sarn) a **Ashen** (🔥 Horda, Durgar,
Vhorren, Gryk), včetně 2. pádu (`gen`) pro texty typu „výbava Sunbornů".

⚠ **KLÍČE ZŮSTALY `dobro`/`zlo` a měnit se NESMÍ.** Sedí v ÚČTECH hráčů:
`item.side` u každého kusu výbavy, `CHESTS.royal.sideName` per klíč,
`sigOdemceno`, `heroUnlocks`, `ITEM_SIDE_NAMES`, `ITEM_SIDE_SUFFIX`.
Přejmenování klíče by znamenalo migraci všech účtů a kdo by ji nedostal,
přišel by o výbavu své strany (`equipItem` cizí stranu odmítá).

Změnilo se jen zobrazení: `SIDES`, dvě tlačítka výběru strany v domově
a dvě věty nápovědy. Vše ostatní (síň, přepínač truhel, štítky předmětů)
čte `SIDES[side].name`, takže se přejmenovalo samo.

## BOJOVÝ LOG KOLO PO KOLE (v0.55, 2026-08-31) — IV-P, ZADÁNÍ UŽIVATELE

Zadání: „logy ať ukazují přesně co se děje v každém kole, kdo začíná a co dělá,
za kolik dává damage a kolik vyléčil jednotek, jaké bufy jsou aplikovány
v jakém kole a na jak dlouho, koho jsem trefil útokem."

Report měl dosud jen VOLNÝ TEXT (`roundLog[].ev`), který engine vyrábí ad hoc
na ~30 místech. Nově vedle něj jedou **strukturované záznamy**, ze kterých UI
skládá tabulku:

| pole v `roundLog[]` | co nese |
|---|---|
| `poradi` | `[{s, k, spd}]` — kdo v kole jedná a v jakém pořadí (velitelé mají spd 1000+) |
| `akce` | `[{s, k, c, d, vl?, op?}]` — strana, útočící druh (`null` = velitel), CÍL, poškození, „obrátil se na vlastní" (šílenství), „navazující úder" |
| `lecA`/`lecD` | kolik jednotek se v kole vrátilo do řad (roundHeal, po kauterizaci) |
| `stavA`/`stavD` | `{stun?, sil?: [druhy], st?: stohy}` — omráčení, šílené formace, nasčítané stackAtk/stackDef |

- Sbírá se **uvnitř kola** (`akce` plní tentýž řádek `uderit`, kde se aktualizuje
  souhrnná matice `strety`), takže per-kolo i souhrn za bitvu jedou z jednoho
  zdroje a nemůžou se rozejít.
- **Velikost:** bitva o 5 kolech = report 5,8 KB (dřív ~4 KB). Strop 40 reportů
  na hráče drží schránku pod ~230 KB, takže přehrávání ze seedu (varianta
  z plánu) zatím není potřeba.
- **UI (main.js, `prubehHtml`)**: rozklikávací blok „Průběh kola — N úderů"
  uvnitř každého kola; řádek pořadí, pak řádky „kdo → koho → za kolik" barevně
  po stranách, dole stavy a léčení. Reporty ze starších verzí `akce` nemají —
  blok se přeskočí, nespadne.
- **PAST:** útočník nese jméno velitele v `rep.att.hero`, obránce (i neutrální)
  v `rep.def.leadName` — pojmenování musí zkusit obojí, jinak se u útočníka
  vypíše obecné „velitel".

## RALLY: PŘEHLED NAČATÝCH CÍLŮ (v0.55, 2026-08-31) — ETAPA 7, IV-C

Okno zranění dává smysl jen tehdy, když skupina VIDÍ, jak daleko je. Panel
pole ukáže jedno pole; rally je přehled VŠECH načatých cílů, které hráč vidí.
Plán to chtěl přesně takhle: „zbývá 36 ze 40 armád, reset za 42 minut".

- `rallyHtml(me)` v main.js, kreslí se NAD cíle sezóny v okně 🌿 (composite
  "branch"). Řádek = jméno cíle + kraj, pruh ZBÝVAJÍCÍ posádky, čísla
  „285 / 1 140", odpočet okna a počet vlastních pochodů na cestě (⚔N).
- Řadí se podle toho, co je nejblíž pádu — tam se má skupina sejít.
- **Ukazuje jen PROZKOUMANÁ pole** (`G.explored`) a jen ta pod 97 % posádky:
  sotva škrábnuté cíle by seznam zaplevelily.
- Klik na řádek skočí kamerou a vybere pole.
- Strop 8 řádků — víc se do okna nevejde a rally je nástroj na „kam teď",
  ne evidence.

## NÁHLED HRDINY V SÍNI (v0.54, 2026-08-31) — ZADÁNÍ UŽIVATELE

Síň u zamčeného hrdiny ukazovala jen jméno, rys a cenu odemčení — co UMÍ, se
hráč nedozvěděl, dokud ho neměl. U sbírkové hry je to slepota: nedá se
rozhodnout, do koho sypat dárky. Nově se **každá karta v síni dá rozkliknout**
(vlastní i cizí) a otevře čistě READ-ONLY náhled.

- `sinNahled` (main.js) = klíč `"fkey:defIdx"` nebo null; `sinHtml` na konec
  přilepí `nahledHrdinyHtml(sinNahled)`, takže overlay jede v obou místech,
  kde se síň kreslí (okno hrdinů ve hře i domovská síň).
- `nahledHrdinyHtml(key)` staví jen z KATALOGU (`HERO_DEFS`, `HERO_TIERS`,
  `HERO_TRAITS`, `SIGNATURE_ITEMS`) a z účtu (hvězdy, oddanost) — **nepotřebuje
  živou frakci ani nasazeného hrdinu**, proto funguje i doma mimo sezónu.
- Ukazuje: portrét v rámu tieru, rod, rys, signature kus i s efekty, stav
  odemčení s pruhem oddanosti a **celé stromy dovedností** — hlavní dovednosti
  s odsazenými větvemi, u každé `max`, časování (`skillTimingTag`), popis,
  efekt NA PLNÝ RANK (`effLine(e, e.val * s.max)`), mistrovský bonus a podmínku
  odemčení (♥N u hlavních přes `STAR_UNLOCK_MAIN`, rank rodiče u větví).
- `bindSinNahled(root, prekresli)` je zvlášť od `bindSin`, protože domov má
  vlastní překreslení (`renderDomov`) — `bindSin` ji volá s `updateHeroesPanel`.
  Klik na kartu náhled otevře, klik do ztmavení nebo na ✕ ho zavře; klik na
  tlačítko uvnitř karty (☆ přání, ⚑ Nasadit) se ignoruje (`e.target.closest("button")`).
- CSS `.nh-*` na konci style.css; overlay má z-index 420 (nad oknem hrdinů).

## VLAJKA (T4) AŽ ZA HLAVNÍ BUDOVOU 7 (v0.54, 2026-08-31) — ZADÁNÍ UŽIVATELE

Zadání: „nemůžeš otevřít T4 jednotku pár dní v sezóně, ale třeba za týden dva
hraní" + návrh uživatele „dej podmínku, že je můžeš najímat od úrovně 7 main
hall". Vlajka proto chce **DVĚ podmínky: kasárny 4 A hlavní budovu 7**
(`unitUnlocked`).

**Hlavní pákou jsou DOBY STAVBY, ne ceny.** Suroviny to samy neudělají: plató
výnosu vůdce je 191 000 zlata/h, takže i milionová budova je pět hodin příjmu.
Doby se ale škálují délkou sezóny (`buildTicks`), takže stačí protáhnout horní
úrovně:

- `BUILDINGS.main.time` = [–, –, 30, 45, 60, 90, **300, 650, 1200**] s baseline
  (dřív 140/210/320 na úrovních 6–8).
- Na čtrnáctidenní sezóně: main 6 = 28 h, main 7 = 60,7 h, main 8 = 112 h.
- **Čistá stavba na main 7 + kasárny 4 = 5,3 dne ze 14** (stavební slot je
  JEDEN, staví se po sobě) — plus čas na suroviny, takže vlajka vychází na
  6.–8. den. Main 8 přidá další 4,7 dne, takže strom pokrývá celou sezónu.
- Ceny na úrovních, kam leze AI (main 2–5, kasárny, nemocnice), zůstaly z 30. 8.
  **Pokus zdražit i střed gate shodil** (60/64 a porušení per-seed pravidla,
  sarn na 26) — rozvolnění proto sedí nad main 5 a hlavně v čase.
- `AI_BUILD_ORDER` dostala na konec `["main", 6], ["main", 7]`, aby AI vlajku
  na dlouhé sezóně vůbec odemkla. V hodinové se tam nedostane a **gate to
  nebolí: 61/64 (95 %) i úplně bez vlajek u AI** — ověřeno experimentem.

## CENY BUDOV: GEOMETRICKÁ KŘIVKA AŽ NA MILION (v0.54, 2026-08-30) — ZADÁNÍ UŽIVATELE

Dosavadní křivka byla proti výnosům plochá: vůdce sezóny má na konci hodiny
**340 000 kámen/h a 191 000 zlata/h**, takže celý strom budov stál pár minut
příjmu. Nově první úrovně v tisících a vrchol na milionu.

| budova | dřív (vrchol) | nově (vrchol) |
|---|---|---|
| Hlavní budova 8 | 6 500🪨 2 100🪵 5 600🪙 | **450 000🪨 150 000🪵 400 000🪙** |
| Hlavní budova 7 | 3 700🪨 1 200🪵 3 200🪙 | 171 000🪨 57 000🪵 152 000🪙 |
| Akademie 10 | 4 750🪨 3 925🪙 | **490 000🪨 400 000🪙** |
| Kasárny 4 | 900🪨 300🪵 800🪙 | 5 500🪨 1 800🪵 4 700🪙 |
| Tržnice 3 | 700🪨 550🪵 500🪙 | 8 000🪨 6 000🪵 4 000🪙 |
| Vylepšení 2 | 350⚙ 450🪙 | 2 800⚙ 3 600🪙 |

- **Strmá část leží nad hlavní budovou 5**, kam `AI_BUILD_ORDER` nechodí (končí
  na main 5, kasárny 4, nemocnice 3, vylepšení 2) a akademii ani tržnici AI
  nestaví vůbec. Milionové úrovně jsou tedy čistě hráčův cíl a AI se jich netýká.
- **Ověřeno:** všech sedm AI rodů pořád dojde na kasárny 4 (vlajka odemčená)
  a main 4–5; gate klesl z 63/64 na **61/64 (95 %, práh 90 %)** — AI staví dřív
  za víc, takže expanduje o kousek pomaleji. Pokus zlevnit rané úrovně gate
  NEZLEPŠIL (61/64 a navíc porušení per-seed pravidla), takže zůstala dražší
  varianta.
- ⚠ **Ceny se NEŠKÁLUJÍ délkou sezóny, časy ano.** Na hodinové testovací sezóně
  jsou vrcholy nedosažitelné (vůdce vydělá ~80 000 zlata za hodinu), na
  čtrnáctidenní padne strom během prvního dne. Otevřené, zapsané v PLAN.md IV-Q.
- Test `test-sin.js` musel dostat bezednou pokladnu (`9e9`) — testuje PRAVIDLO
  úrovní akademie, ne to, jestli na ni frakce má.

## VÝNOSY ZA HODINU (v0.54, 2026-08-30) — ZADÁNÍ UŽIVATELE

Vnitřně se dál počítá na TIK (a tik je vteřinový, `TICK_MS = 1000`), mění se
jen ZOBRAZENÍ: hodina = ×3600. Důvod: za vteřinu vycházel výnos slabého pole
jako „+0,3" a u sezóny dlouhé 336 hodin se to nedalo porovnat s ničím.

- `main.js`: `perHod/fmtHod/fmtHodKratce` u `incomeStr`. Horní lišta jede
  zkráceně (`+63k/h`, práh 1 000), bublina nad ikonou nese přesné číslo za
  hodinu i přepočet na tik. Panel pole a bublina mapy jedou přes `incomeStr`,
  takže stačilo změnit ji.
- `index.html`: popisky vrstev mapy „(výnos za tik)" → „(výnos za hodinu)".
- Naměřeno na startu: 17,5 jídla/tik = **63 000/h**; pole úrovně 15 = 5 400🪨/h.

## Verbovací zakázka a body velení (v0.18, 2026-08-28) — NASAZENÉ

Panel **🗡 Výcvik** už neverbuje po dávkách přes tlačítka, ale skládá zakázku
jako armádu: u každého typu je **jezdík na počet kusů**, ceny se sečtou a
naverbuje se všechno jedním tlačítkem. Předloha: RtW/WtW obrazovka doplňování
armády (viz `E:\Claude\reference-rtw\REFERENCE.md`).

- `UNIT_TYPES[k].cp` = **kolik bodů velení jednotka zabírá**. Zatím všechny 1:1
  (`heroArmyCap` tak funguje jako CP už dnes); vyšší váhy (jízda 2, obři 25/100)
  přijdou s přestavbou boje na formace — proto se s `cp` počítá už teď.
- `startRecruitOrder(faction, order)` — objednávka `{inf,arch,cav}` v KUSECH.
  Validuje odemčení typů, ořízne na `RECRUIT_MAX_ORDER` (500/typ), spočítá cenu,
  zaplatí **jednou** a zařadí každý typ do `recruitQueue`. Atomické: buď projde
  celá, nebo nic. `startRecruit` (dávky) zůstal kvůli AI a zpětné kompatibilitě.
- `recruitOrderCost` dělí dávkovou cenu z `UNIT_TYPES` a **zaokrouhluje nahoru**
  (`Math.ceil` na surovinu), aby se za 1 kus nikdy neplatilo míň než z dávky.
- `recruitAffordable(faction, type)` = strop jezdíku (kolik kusů koupím, kdyby
  se verboval jen ten typ). `armyCp(army)` = velení armády.
- **UI**: objednávka žije v `recruitOrder` v `main.js` MIMO DOM, aby ji
  překreslení panelu nesmazalo; jezdíky při tažení překreslují jen čísla a
  součet (`recruitTotalsHtml` + `bindRecruitOrderBtn`), ne celý panel.
  `citySignature` má afford po desítkách, aby rozsah jezdíků rostl s příjmem,
  ale panel se nepřekresloval každý tik.
- Nové exporty i příkazy: `NET_CMDS.startRecruitOrder` v `js/net.js` a
  `CMDS.startRecruitOrder` v `server/server.js` (mutující funkce ⇒ obojí!).

## Tržnice a počítadlo smůly (v0.18, 2026-08-28) — NASAZENÉ

**Tržnice** (`BUILDINGS.market`, max 3): směna surovin, kurz **40 / 55 / 70 %**
podle úrovně (`MARKET_RATE`) — vždy ztrátová, aby se nedala použít jako
nekonečná pumpa. `MARKET_RES` = jen POLNÍ suroviny; **zlato se neobchoduje**
(platí se jím žold, verbování a hrdinové, jinak by se přes tržnici farmilo).
`MARKET_MIN` = 10 kvůli zaokrouhlení dolů. Funkce `marketExchange` /
`marketGain` / `marketLevel`; příkaz je v `NET_CMDS` i v serverových `CMDS`.
UI: nové okno lišty **⚖ Tržnice** (`#market-panel`, `WIN_TITLES.market`,
sekce `data-sec="market"` v index.html) — řada Dáváš / jezdík / řada Dostaneš
/ náhled `X → Y`. Výběr žije v `marketTrade` MIMO DOM. Nevybrané suroviny
jsou v CSS ztlumené filtrem (`.mk-res` grayscale), jinak by na zlatých
tlačítkách hry nebylo poznat, co je zvolené. `citySignature` nese úroveň
tržnice, zdroj, cíl i zásobu zdroje.

**Počítadlo smůly u truhly** (`PITY_AT` = 12): `acc.pity` roste každým
otevřením a **nuluje se, kdykoli padne legenda** (z náhody i z jistoty).
Když dosáhne prahu, poslední slot truhly dostane vynucenou raritu
(`makeChestItem(tier, side, forceRarity)` — vynucená rarita přeskakuje
i 8% signature roll, ať hráč dostane, co mu bylo slíbeno). `accountOpenChest`
vrací navíc `{pity, pityAt, legenda}`. Migrace starých účtů v `migrateAccount`
(`acc.pity |= 0`). UI: pruh `.pity-bar` na kartě truhly.
Ověřeno statisticky: **6 000 truhel, nejdelší série bez legendy 11** (< 12),
18 % truhel obsahuje legendu.

⚠ Denní truhla zdarma z předlohy NENÍ udělaná — naše truhla stojí 2 400 jader,
takže by denní zdarma rozbila ekonomiku jader. Čeká na rozhodnutí o velikosti.

## Zapečené povrchy (v0.17, 2026-08-27) — NASAZENÉ
Ploché barvy nahradily zapečené textury. glTF procedurální uzly nepřenáší, takže je `make_models.py` spočítá dopředu a uloží do obrázků, které glTF unese. Zdrojem je `mat_hq` v `make_tiles.py` — dvojvrstvý šum barvy (hrubé fleky × jemné zrno), mikroreliéf a nerovná drsnost. Ploché `mat()` zůstává pro `BAKE=0`.

- Na dílek se pečou **čtyři mapy**: barva (512, albedo × zapečené AO), reliéf (256, normálová z bumpu), drsnost+kovovost (256; G a B kanál — glTF je čeká v jedné textuře) a záře (512, jen u dílků, co opravdu září). Do `.glb` jdou jako WEBP q90.
- **Materiálové sloty splynuly v jeden** (`aldar_plains` 6 → 1), takže volání kreslení spadla **304 → ~65**. To je hlavní výkonový zisk celého kroku, ne textury samy. (Přesné číslo kolísá podle toho, které druhy polí mapa zrovna vygeneruje — každý druh je jedno `InstancedMesh`.)
- Cena: modely 2,0 → 5,7 MB. Největší z toho je reliéf; zmenšení z 512 na 256 ubralo ~30 % velikosti `.glb` bez viditelné ztráty — pole má na obrazovce 52 px při oddálení 1 a nanejvýš ~260 px při plném přiblížení, takže vyšší rozlišení se stejně zahodí.
- **Odstín každého pole se lehce mění** (`odstinPole`, ±7 % jasu + špetka do tepla, deterministicky z klíče pole). Všechna pole téhož druhu sdílejí jednu texturu a mapa by se bez toho četla jako kopírovaná tapeta. Odstín se s mlhou **násobí**, nepřepisuje.
- **Kovy potřebují prostředí.** Zlato, železo a ruda v PBR nesvítí samy, jen zrcadlí okolí — bez `scene.environment` jsou ČERNÉ. Stačí drobný přechod nebe→země (`prostredi()`, 16×8 px přes PMREM); oblohové světlo se kvůli tomu stáhlo 0,38 → 0,26, ať se nezaplní stíny.

### Silueta rekvizit (v0.17)
V herní velikosti není z rekvizity vidět nic než **obrys** — čistý kužel čte jako zmrzlina, ať má povrch sebelepší texturu. Proto se primitiva rozhýbala:

- **`rozhyb(ob, sila, sila_z)`** posune vodorovný poloměr každého vrcholu. Osové vrcholy (špička kužele, póly koule) nechává být — jinak by se špička rozdvojila — a spodního kroužku se nedotýká ve svislém směru, aby rekvizita dosedla na zem bez skuliny.
- **`skala()`** staví kámen z několika zúžených pater. Patra musí mít **různou výšku a různý přesah**; se stejnými vyjde pravidelný stupňovitý jehlan („svatební dort"), který je stejně umělý jako čistý kužel, jen jinak.
- **`jehlicnan()`** = kmen + tři přesahující kužely (patra se překrývají o 40 %, jinak mezi nimi zejí díry).
- **`blob()`** má `nerovny=` a zmenšil se z 16×10 na 12×7 segmentů. **Tím se to celé zaplatilo**: `aldar_forest` spadl 1754 → 1034 trojúhelníků, zatímco skalnaté dílky vyrostly (`durgar_hills` 302 → 422). Přes celou sadu to vyšlo nastejno — nešlo o „přidat detail", ale o **přesunout ho tam, kde je vidět**.
- Krystaly Yllienu se schválně NErozhýbaly — krystal má být geometrický.
- **POZOR na kráter sopky:** rozhýbaný okraj se zužuje, takže musí být širší než lávová tůň, jinak láva vykoukne ven (proto `r2=0.24` proti tůni 0,15).

### Co ještě 3D neumí
Stavby jsou pořád kvádry s jehlanovou střechou bez přesahu — v téhle velikosti (přesah by měl ~4 px) se to skoro nevyplatí, ale je to poslední zjevná hranatost. Emoji ikony v rozhraní (466 kusů) a figurky hrdinů jsou pořád 2D.

## Blender pipeline
- Blender 5.2: `& "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b -P <skript>.py` (env `ONLY=prefix` omezí, co se vyrábí).
- **`make_models.py` → `art/models/*.glb`** (45 modelů, 5,7 MB, 20 164 trojúhelníků, ~15 min na procesoru) — TOHLE hra dnes používá pro mapu. Načítá si stavitele z `make_tiles.py` bez jeho `main()`, takže se geometrie nikde neduplikuje. Pořadí: postav → spoj do jednoho meshe → rozviň UV (`smart_project` + přebalení, samo o sobě nechá půlku atlasu prázdnou) → zapeč čtyři mapy → nahraď všechny sloty jedním materiálem → export.
  - `BAKE=0` vrátí staré ploché barvy, `TEX=1` nechá v `art/textures/` kopie zapečených map k nahlédnutí (jinak se po běhu mažou — je jich přes 30 MB a `.glb` je už nese).
  - **Kovovost se péct nedá** — Cycles takový průchod nemá. `_bake_hodnoty` proto materiálu dočasně posadí na výstup Emission s tou hodnotou, zapeče `EMIT` a zapojení vrátí. Stejný trik funguje na jakýkoli vstup Principled BSDF.
- `make_tiles.py` → sprity 512px (dnes už jen historicky; ortho náklon 55°, ortho_scale 3.2, Cycles CPU 48smp). `make_heroes.py` → figurky hrdinů, které hra POŘÁD potřebuje (ortho_scale 2.2, 256px, kamera +0.45 z → nohy v 66,8 % výšky; `RES=768 SUFFIX=_big` dělá velké portréty).
- `zkouska_textur.py` → `art/render/zkouska/` — NENÍ součást pipeline. Zkoušelo se v něm, co povrchům přidá procedurální materiál a tříbodové světlo; materiál z něj se od v0.17 jmenuje `mat_hq` a bydlí v `make_tiles.py`, takže pokus i exportér kreslí z jednoho zdroje.
- **GOTCHA: kamera hledí z −Y** — ploché věci (vlajky, pláště, štíty) musí být široké v **X**, ne Y, jinak jsou edge-on neviditelné.
- **GOTCHA: vysoké stavby** — hlídej ořez horní hranou framu (grandfort spire místo vlajky).

## Multiplayer wiring — checklist při přidání mutující funkce
1. game.js: funkce + přidat do `module.exports`.
2. net.js: přidat do `NET_CMDS` (přepis na síťový příkaz).
3. server/server.js: přidat do `CMDS`.
4. Nová pole na G se snapshotem přenesou automaticky, ale zkontroluj `applySnapshot`, pokud je potřeba merge (např. G.clashes).
5. **Nové BĚHOVĚ MĚNĚNÉ pole na dlaždici (v0.33!): přidat do `tileOtisk` v server/server.js** — jinak se změna k hráčům dostane až s plným snapshotem (1×/60 s). Statická pole z generátoru otisk nepotřebují.

## Testování (osvědčené)
- **Nodové sady jsou v repu: `node tests/vse.js`** (stromy 700 + boj 57 + neutrálové 25 asercí; `tests/README.md` má i seznam pastí). `tests/krivka.js` vypíše tabulku „kolik jednotek na které pole" — pouštěj po každém zásahu do boje nebo statů.
- javascript_tool v náhledu: `startGame(0,[0])`, `clearInterval(tickTimer)` zmrazí, ruční `doTick()` / `march.ticksLeft=1` vynutí bitvy; čtení Kroniky regexem; flood-fill na validaci mapy.
- Pasti: testy balit do IIFE (kolize `me`), sousedé = `neighborsOf` (ne neighbors), překreslení řeší rAF smyčka (žádné drawMap()), screenshoty jsou ~0.59× downscale (není to zoom bug).

## Nevyřešené / nabídnuté nápady
- Tailscale u kamaráda pořád nefunguje (sdílení stroje nebo firewall pravidlo ValkaPopelaServer, TCP 8123, Private profil).
- Neodsouhlasené: obrana rekrutů ve výcviku, portréty na praporcích, persistence světa, serverový ořez mlhy, Kronika per frakce.

## Mapa na čtverce „na koso" (v0.21, 2026-08-28) — NASAZENO

Svět přešel z hexů na čtvercovou mřížku otočenou na obrazovce o 45° (vzhled
předlohy: celý svět = diamant, prstence hradeb = osové čtverce, řeky vodorovné
a svislé). Detaily soustavy viz „Souřadnice mapy a popisky" výš. Co se změnilo
v kódu: `DIRS4` (4 sousedé), `gridDist` Manhattan, `distLvl` osmiúhelník,
`riverKeys()` vrací Map klíč→směr koryta, `repairBridges` hlídá průchodnost
obou břehů po stranách úhlopříčné řeky, `computeVisibility` Manhattan okolí.
Přejmenováno globálně (sed, žádná změna chování): hexDist→gridDist,
HEX_DIRS→DIRS4, hexToPixel→tileToPixel, pixelToHex→pixelToTile,
hexPath→tilePath, HEX_MARCH_TICKS→MARCH_TICKS, REINFORCE_HEX_TICKS→REINFORCE_TICKS.

**Blender:** `hex_base` (jméno zůstalo, volá ho 45 stavitelů) staví ČTVEREC
o straně √3·radius — stejný vnitřní poloměr 0,866 jako hex, takže rozmístění
rekvizit nikde nepřeteklo. Celý dílek se otáčí o 45° až při exportu
(make_models.py) → na mapě kosočtverec a stavby koutem ke kameře. Nové stavitele:
`river_tile(úhel)` (koryto přes rohy + oblázky), `wall_tile(úhel)` (val od rohu
k rohu s cimbuřím a věžičkami), `bridge(úhel)` teď staví na říčním dílku
(úhel = směr LÁVKY, koryto kolmo) — POZOR, `river_tile` i `bridge` od v0.41
z registru vypadly, nahradily je `river_flat`/`river_bank`/`bridge_head`
(viz sekce v0.41); `ctvercove_hradby()` sdílí city+capital_aldar;
bastion/grandfort/throne mají čtvercová těla lícující s deskou. Ve
stavitelských souřadnicích platí: **−45° = světová osa X, +45° = osa Z.**

### Pasti v0.21 (nešlapat znovu)
- **`join` nechává na spojeném objektu transformaci „aktivního" objektu** —
  a aktivní je první mesh PODLE ABECEDY (často otočený/škálovaný kužel mimo
  střed). Nastavit spojenému objektu `rotation_euler[2]=45°` tu transformaci
  PŘEPÍŠE a složí se s neuniformním měřítkem na zkosení — každý model jinak
  (voda seděla, pole ne, wall náhodou taky). Oprava v export_dilku: po spojení
  `transform_apply(location, rotation, scale)` a teprve PAK čistá otočka.
  Symptom k zapamatování: dlaždice na mapě jako osové čtverce s křížovými
  děrami mezi rohy.
- **Řetěz polí dotýkajících se ROHY blokuje pohyb po 4 sousedech** stejně
  jako plná zeď (přechod přes diagonálu vyžaduje šlápnout na pole řetězu).
  Proto řeky (±k,±k) NEpotřebují schodiště — a most je pak JEDNO pole, jehož
  oba břehy jsou 4-sousedé.
- **Kotvy křivky dobývání se NEZMĚNILY** (posádky dle tierů zůstaly) — testy
  prošly beze změny čísel. `tests/krivka.js` ukazuje jiná čísla než dřív jen
  proto, že na vzorkovaných polích nové mapy sedí jiní deterministicky
  losovaní neutrální velitelé.
- `tests/test-mp-migrace.js` potřebuje PŘEDPŘIPRAVENÝ účet (authToken
  „testtoken123", účet „kamarad") v server/data/accounts.json — na čistém
  serveru vždy skončí TIMEOUT step 1. Není to regrese.
- Snímky mapy jdou pořizovat i se skrytým panelem prohlížeče: rAF neběží
  (nutno ručně `ensureMap3D()` + `R3.render()`), `computer screenshot` selže,
  ale `gl.readPixels` hned po renderu funguje — složit s 2D přes pomocný
  canvas a POSTnout na lokální přijímač (viz sezení 2026-08-28).

## Velké stopy staveb (v0.22, 2026-08-28) — NASAZENO

Města, kapitály a Trůn zabírají **3×3 pole**, silná pole (stupeň 9+, jmenovky
200–300) srůstají se 75% šancí do bloků **2×2** — jako v předloze. Model:

- **Kotva** (u 3×3 STŘED bloku — kapitál tak zůstal na CAPITAL_POS; u 2×2 levý
  dolní roh) nese `bigSize` (2|3), `bigKeys` (klíče členů), strukturu a POSÁDKU.
  2×2 pole brání **dvojnásobná posádka** (v předloze velká pole bránily dvě
  armády). **Členové** mají `t.big` = klíč kotvy, posádku 0, dědí stupeň
  i surovinu kotvy — **výnos běží na každém poli bloku** (velké pole = velký
  výnos), skóre rovněž.
- Helpery v game.js: `bigAnchor(t)` / `blockTiles(a)` / `setTileOwner(tile,
  owner)` (šíří vlastnictví na blok) / `makeBig(anchor, n, dovolPrevzit)`.
  Přesměrování na kotvu: `startMarch` (útok na člena = útok na kotvu),
  `tileDefense`, `tileStrengthLabel`, `isAdjacentToFaction` (blok sousedí
  VŠEMI svými poli), klik/hover v main.js. Dobytí kotvy přepíše vlastníka
  celého bloku (resolveMarch přes setTileOwner); eliminateFaction nechává
  členy bez posádek. Výspa na blok nejde, putovní události se mu vyhýbají,
  AI členy přeskakuje a bloky si cení výš.
- **Render:** mapModelList členy vynechá a kotvu pošle se `s` = bigSize
  a STŘEDEM bloku (u 2×2 zlomkové souřadnice +0,5) + `key` kotvy (kvůli mlze
  a odstínu); render3d build() skládá do matice instance i měřítko —
  **zvětšený kosočtverec kryje čtvercový blok beze zbytku** (na hexech by to
  nešlo — důvod, proč mřížka šla první). Mlha bloku = nejlépe viditelné pole
  bloku (fogFactor). Výběr/hover obtahuje celý blok (tilePath × bigSize),
  jmenovka ⚔ je uprostřed bloku (bigCenter v render.js).
- **Generátor:** trůn a města přes makeBig (město se bez místa pro blok
  nepoloží; rozestupy měst 6, od kapitálů 7, guard 3000 → stále ~10 měst);
  kapitál makeBig(…, true) — okolí srovná a celý blok 9 polí patří frakci
  od startu (nahradilo staré vlastnictví 4 sousedů). 2×2 se tvoří po
  ensureConnectivity, členy nesmí být řeka/struktura/blok. Serializace MP:
  big/bigSize/bigKeys jsou prostá pole na dlaždicích — projdou sama.
- Testy: `tests/test-mapa.js` (17 asercí: geometrie světa, těsnost kvadrantů,
  břehy mostů, integrita bloků, dobytí bloku přes člena) — zapojeno do vse.js.
- Vědomé mezery: panel pole ukazuje výnos jen kotvy (blok reálně sype
  ×členové); stráž výspy kryje jen pole sousedící s výspou, ne celé bloky.

## Osm frakcí — stav plánu (28. 8. 2026)

Papírová tabulka jednotek a identit všech osmi frakcí je v **DESIGN.md,
sekce „Osm frakcí — papírová tabulka"** — NÁVRH ČEKÁ NA SCHVÁLENÍ uživatelem
(jména nových frakcí, barvy, identita hordy). Do kódu NIC z toho nesahat,
dokud uživatel neodsouhlasí. Klíčové stavební kameny návrhu: tři jednotky
frakce se mapují na tři SLOTY formací (trojúhelník převah zůstává po
slotech), Sarnové mají všechny jednotky za 2 CP (poloviční počty, dvojité
staty), vhorrenští mágové dávají magické poškození (obchází útok/obrana),
oživování nemrtvých bere 25 % vlastních padlých po výhře. Mapa pro 8 frakcí
(8 výsečí) se spojí s dlouhými sezónami a regiony (bod 3 plánu).

**Záloha:** složka `zaloha-v021/` v kořeni projektu = pojistka stavu před
stopami staveb (projekt nemá git). Po odsouhlasení v0.22 uživatelem smazat.

## Osm frakcí + dvojnásobný svět (v0.23, 2026-08-28) — NASAZENO

Papírová tabulka z DESIGN.md je implementovaná. Nové frakce (id 4–7):
**brakkar** (trpaslíci, dobro), **sarn** (jezdci stepí, dobro), **vhorren**
(nemrtví, zlo), **gryk** (skřeti, zlo). Strany: dobro = aldar+yllien+brakkar+
sarn, zlo = durgar+horda+vhorren+gryk.

**Svět:** `MAP_R=34` Čebyšev (69×69 = 4761 polí), `WALL_R=8`, `OUTER_R=16` —
každý segment včetně středových 2× proti v0.21. **8 řek**: úhlopříčné řetězy
(±k,±k) k=9.. (riv "a"/"b") + OSOVÉ přímky (±k,0),(0,±k) k=17.. (riv **"c"/"d"**,
na obrazovce šikmé). 8 mostů: (±16,±16) + (±24,0),(0,±24). 8 velkých pevností
v POLOVINÁCH osmin prstence (±12,±4),(±4,±12) — rohy prstence jsou plná hradba
s rohovým dílem **wall_c** (autorsky ramena k +X a +Z; ostatní rohy = OTOČKY
INSTANCE, mapModelList posílá `rot`, build() skládá rotY do matice). Kapitály
8× na Manhattan 32: (±23,±9),(±9,±23) — dobro V–S oblouk, zlo Z–J. Pásma
stupňů zdvojená (levelForDist), města 20, 2×2 bloků ~70.

**Frakční jednotky:** `FACTION_UNITS[fkey]` = tři jednotky na SLOTY inf/arch/cav
(trojúhelník převah zůstává po slotech), `unitsOf(f)`/`uDef(f,k)`; neutrálové
a domobrana jedou na základní `UNIT_TYPES` (tam přibylo `speed`).
V simulateBattle nese každá strana `S.ud` (mkSide) — atk/def/dmg/hp/ini/jména
se čtou z ní. Zvláštní vlajky: `magic` (bledí mágové — úder POMÍJÍ porovnání
útok/obrana, opevnění platí), `bonusVs` (grycká kopí ×1,5 proti jízdě —
násobí se v formPower), `cp` (sarn 2 body velení/kus). **Velení se počítá
v CP**: armyCp(army, f), heroArmyCommitted, kontroly startMarch/startReinforce,
aiSlice i suggestArmy (main.js) berou rozpočet v CP — pro staré frakce (cp 1)
je to identické s počtem kusů. `FACTION_MODS`: aldar trainTime 1,5 + build
0,85/0,85; gryk trainTime+buildTime 0,75; vhorren upkeep 0,5; durgar
upgradeCost 0,75; horda goldLoot 0,1 (po výhře +10 % zlata ze zabitých).
**Oživování vhorren**: po vyhraném útoku vstává floor(ztráty×LOSS_DEAD×0,25)
— v resolveMarch hned za Polním lazaretem, píše se do report.post.
Rychlost pochodu: `armyTimeMult(army, f)` čte per-jednotkové `speed` (sarn
rychlí, brakkar pomalí — žádný extra multiplikátor).

**Hrdinové nových rodů:** `rodovyStrom(trait)` + `rodovaSestava(jmena)` (nad
dekorátorem) — 6 knihovních stromů podle rysu (hodnoty z ověřených aldarských,
jen rodová jména), 24 nových hrdinů přes Object.assign do HERO_DEFS. Existujících
24 ručních stromů se NEDOTÝKÁNO — dotažení bodu 1 plánu pro nové rody. Vzhled:
portraits.js RACE_LOOK má 4 nové palety (archetypy human/elf/orc půjčené,
vlastní rasy = budoucí art), figurky na mapě jedou přes vektorový fallback
(sprity hero_<fkey>_* pro nové rody neexistují — NEVADÍ, drawHeroFigure spadne
do drawHeroFigureVec). Signature itemy nové rody zatím NEMAJÍ (royal sig 8 %
je prostě nemá v poolu — bez pádu).

**Biomy nových frakcí PŮJČENÉ** (BIOME_LOOK v render.js): brakkar→durgar,
sarn→aldar, vhorren→center, gryk→horda. Vlastní sady dlaždic = budoucí
výtvarný krok. Kapitály mají vlastní modely: capital_brakkar (horská síň),
capital_sarn (jurty s totemem), capital_vhorren (nekropole), capital_gryk
(palisáda roje) — celkem 61 modelů.

### Pasti v0.23
- **Překlop osy při exportu (blender Y → three −Z) u směrových dílků:**
  koryto podél světové úhlopříčky (1,1) vyžaduje STAVITELSKÝ úhel 90°,
  podél (1,−1) úhel 0° — intuice říká opak a vyjde koryto KOLMO na řeku
  (čárkovaný vzor na mapě). Dřív se to týkalo river_c/d a bridge_c/d (v0.41
  zrušeny); pravidlo platí dál pro každý směrový dílek. Vzorec pro celý
  převod: světový úhel = **−45° − stavitelský úhel** (viz `otoceniNa` v0.41).
- **Nová frakce = záznamy v: FACTION_DEFS, CAPITAL_POS, FACTION_SIDE,
  HERO_DEFS, UNIT_UPGRADES, UNIT_PASSIVES, FACTION_UNITS, RACE_LOOK
  (portraits.js), BIOME_LOOK (render.js).** UNIT_UPGRADES chyběl jako první
  — pád při dokončení vylepšení (UNIT_UPGRADES[f.key][type] undefined).
- Měření boje: útočník s obří přesilou jízdy zabije pěchotu DŘÍV, než stihne
  jednat (iniciativa) — tot.dmgA vyjde 0 a vypadá to jako rozbitý bonus.
  Měř z pozice OBRÁNCE s velkou armádou proti malému útočníkovi.
- test-stromy počítá hrdiny (48) a test-boj mistrovské bonusy z rysu (168)
  — s dalšími hrdiny se ta čísla posunou znovu.
- serializeState pořád posílá VŠECH 4761 polí každý tik každému klientovi
  (~4× víc dat než v0.21). Na LAN/Tailscale snesitelné, pro vzdálené hráče
  časem chce rozdílové snapshoty.

## Dlouhé sezóny (v0.24, 2026-08-28) — NASAZENO

Bod 3 plánu. Vše se škáluje ze `SEASON_TICKS` (teď `let` + `setSeasonHours(h)`,
který přepočítá i `THRONE_UNLOCK`), takže rytmus sezóny je poměrově stejný
v testovací hodině i ve čtrnáctidenní hře. **Délka: `node server/server.js
8123 336`** (hodiny; výchozí 1). Sólo zůstává hodinové.

- **Koruna popela (výhra sezóny):** kdo drží Trůnní město NEPŘETRŽITĚ
  `throneHoldTicks()` = 12 % sezóny (test ~7 min, 2 měsíce ~týden jako
  v předloze), vyhrává okamžitě. Stav v `G.throneHold` {fid, ticks, pulka},
  vítěz v `G.winnerId` (nastavuje ho i konec časem — bere ho showEndScreen).
  Kronika hlásí převzetí, půlku, ztrátu i Korunu; horní lišta ukazuje odpočet.
  Odpočet běží až po otevření Trůnu (půlka sezóny, beze změny).
- **Prsten popela (`f.ring` {xp, level, ap}):** každou 1/60 sezóny se skóre
  frakce přičte jako zkušenost (`ringGrantTicks`), úrovně dle `ringXpNeed`
  = 150·l^1,6, strop 10. **Body činu ⚡**: strop 24, +1 za 1/24 sezóny,
  u dlouhých sezón nejvýš po reálné hodině (`ringApTicks` = min(3600, …))
  — přesně zadání „24 a každou hodinu jeden". Dary úrovní v `RING_UNLOCKS`:
  1 Sklizeň kraje, 2/4/6/8/10 +6 výdrže hrdinů (`ringStam` v heroStats),
  3 Výcvik mysli, 5 Druhý dech, 7 dvojnásobná Sklizeň, 9 dvojnásobný Výcvik,
  10 +50 velení (`ringCap` v heroArmyCap). ČINY: `ringGather(f, tile)`
  (denní výnos pole/bloku naráz, 6 ⚡), `ringTrain(f, heroIdx)` (12/24 %
  zkušeností příští úrovně, 8 ⚡), `ringRest(f, heroIdx)` (plná výdrž, 6 ⚡)
  — v exportech, NET_CMDS i CMDS. AI Prsten sbírá, ale činy neplatí (záměr:
  výhoda živých hráčů). UI: odznak ⭘/⚡ v horní liště, sekce v okně Skóre,
  Sklizeň v panelu vlastního pole, Výcvik/Dech na kartě hrdiny.
- **Kraje Vellaru:** `regionOf(t)` — Srdce Vellaru (Manhattan < OUTER_R;
  OSTRÁ nerovnost, brány M=OUTER_R patří svému kraji!) + 8 pojmenovaných
  výsečí (`REGION_NAMES`, pořadí = domovské frakce). Kraj „drží", kdo má jeho
  bránu-grandfort (bonus +10 % útoku je z dřívějška). Kronika hlásí dobytí
  brány se jménem kraje, bublina mapy a panel pole kraj ukazují, okno Skóre
  má přehled všech devíti.
- **Domovská síň:** server drží `server/data/stav.json` {sezona}; po konci
  sezóny se číslo zvedne a po 90 s všechny vrátí do lobby (přihlášky do
  další). Lobby ukazuje „⚔ Sezóna N · délka" (lobbyState nese sezona +
  sezonaHodin). Sólo počítá sezóny v localStorage `vp-sezona`. Závěrečná
  obrazovka píše vítěze (Korunou či skóre) a číslo sezóny.
- **Serializace MP:** `throneHold`, `winnerId`, `seasonNumber` přibyly do
  serializeState i applySnapshot; `f.ring` jede s frakcemi samo.
- Testy: `tests/test-sezony.js` (21 asercí: škálování délky, kraje, Prsten,
  činy, Koruna vč. resetu při ztrátě Trůnu) — ve vse.js (celkem 1555).
- Pasti: výdrž hrdinů z Prstenu jde přes `ringStam` v heroStats — NE přes
  eff, aby ji nemazal respec; u testu Koruny je nutné vlastnit CELÝ blok
  Trůnu (setTileOwner / bigKeys), jinak držitel bliká.

## Výtvarné dluhy nových rodů (v0.25, 2026-08-28) — SPLACENO

- **12 biomových dlaždic**: brakkar (chladná horská tráva, žulové štíty se
  sněhem, horské jehličnany, mohyly), sarn (zlatá step, suché trsy, akácie
  s plochou korunou, travnaté vrchy), vhorren (bledá zem, náhrobky, mrtvé
  bezlisté stromy, sinalé fialové krystaly — nový emisivní mat vh_glow),
  gryk (rozrytá bahnitá zem, kalné louže, haldy hlušiny, nory, pařezy).
  Stavitelé bk_/sr_/vh_/gr_ v make_tiles.py + pomocníci mrtvy_strom()
  a akacie(). BIOME_LOOK v render.js je teď PRÁZDNÝ (mechanismus výpůjček
  zůstal pro budoucí frakce), NAMES v render3d jede přes 9 biomů.
  capital_sarn přepečen na stepní podstavu (sr_grass). Celkem 69 modelů.
- **48 renderů hrdinů**: make_heroes.py umí rasy dwarf (bulk 1,35 / tall
  0,72 + plnovous), undead (0,80/1,02 + žhnoucí oči, mat nether), goblin
  (0,90/0,68 + velké uši) a 24 stavitelů h_brakkar/sarn/vhorren/gryk_0–5;
  smyčka jobs jede přes všech 8 rodů. ASSET_FILES v render.js načítá sprity
  8 rodů; velké rendery hero_big_* fungují v okně hrdiny automaticky
  (main.js skládá URL z me.key). PAST: kotvy zbraní se u malých ras NESMÍ
  psát v absolutních výškách — trpaslík má ramena v 0,50 a skřet v 0,48;
  první render měl kladiva a hole ve vzduchu, kotvit přes b["shoulder"]/
  b["headZ"]. „Volně plující" čepel u zdvižených zbraní je DOMOVSKÝ STYL
  (Mara vypadá stejně) — neopravovat.
- **24 signature itemů** nových rodů v SIGNATURE_ITEMS (sloty dle pořadí
  rysů: boty/zbraň/štít/zbroj/rukavice/helma; gryk:5 má jako jediný pasivku
  se šílenstvím — madness 8). Pooly stran teď 24+24; královská truhla je
  sype automaticky (filtr přes sideOfFaction), Trůn dá dobyvatelův kus.

## Čekající rozkazy — doplnění armády z potvrzovacího kola (v0.26, 2026-08-28)

Brainstorm UI č. 1: klik na pole → Zaútočit → hrdina bez jednotek dřív skončil
slepou hláškou „Není co vyslat". Teď kolo nabídne doplnění.

- **game.js**: `startReinforceAttack(faction, target, heroIdx, army, raid)` —
  atomicky vyšle konvoj posil (přes startReinforce, platí limit velení)
  a uloží hrdinovi `h.rozkaz = { targetKey, raid, utok }`. Po zpracování VŠECH
  dojitých pochodů v tiku (dva konvoje mohou dorazit naráz) `splnRozkaz()`
  zkusí startMarch — stejný vzor jako obléhací náběhy: když to nejde (výdrž,
  zlato, pakt), hrdina drží pozici a kronika řekne proč; rozkaz se spotřebuje
  vždy. Cíl mezitím náš (`r.utok && owner === faction.id`) → rozkaz se ruší.
  Rozkaz mažou: splnění, cancelReinforce, retreatHeroFrom (porážka v obraně),
  ruční startMarch/startRecall (kšandy — při visících posilách jsou stejně
  blokované přes heroPinned). `makeHero` má `rozkaz: null`; frakce se
  serializují vcelku, takže MP snapshot rozkaz nese zadarmo.
- **Kolo (showMarchConfirm, main.js)**: tři stavy. Dost jednotek → dnešní
  souhrn + tlačítko „±" (rozbalí úpravu počtů). Málo/nic + je z čeho → picker
  `tmfill-*` (unitInputsHtml) rovnou otevřený, živý souhrn (#tmfill-sum):
  velení X/volných, konvoj ~A + pak útok ~B, celkem, žold; tlačítka
  „⚔ Vyslat (hned)" a v poli „📦 Doplnit a zaútočit/vyrazit". Prázdné město →
  „🏹 Naverbovat" (openSideWin("train")). Nájezd checkbox se přenáší i do
  rozkazu. Net: NET_CMDS/CMDS `startReinforceAttack` (tileKey, heroIdx, army,
  raid).
- **Indikace**: karta hrdiny — pinned poznámka nese „→ ⚔ cíl"; panel pole
  hrdiny — řádek „⚔ Čekající rozkaz: …"; mapa — tečkovaná trasa hrdina→cíl
  v barvě hráče (render.js, jen pro G.playerFaction, kreslí se před
  marchPreview).
- **Testy**: tests/test-rozkazy.js (29) — atomicita, splnění, dva konvoje
  v témže tiku, zrušení posil, cíl mezitím náš, došlá výdrž (pozor past:
  výdrž nastavit až tik před dojezdem, cestou regeneruje), nájezd, limit
  velení, JSON round-trip. Ověřeno i naostro proti běžícímu MP serveru
  na :8200 (celý řetěz: kolo → konvoj → „po doplnění vyráží" → bitva).
- **PAST — syntetický klik na mapu v testech přes prohlížeč**: výběr pole
  jede přes událost "click" (ne pointerup); PointerEvent s vymyšleným
  pointerId hodí neškodnou NotFoundError ze setPointerCapture.

## ETAPA 1 (v0.27, 2026-08-28/29) — strany hrdinů, ekonomika, UI konsolidace

Provedení plánu PLAN.md, etapa 1. Vše ověřeno: 52 testů tests/test-sin.js,
celá sada zelená, sim 3000 tiků s 8 AI bez chyby, sólo i MP smoke naostro.

### Strany hrdinů + startovní osmička (game.js)
- **Hrdina nese `srcKey`** (rodná frakce; null = vlastní). `heroDef` čte
  z `HERO_DEFS[h.srcKey || faction.key]`; účetní klíč = **`heroKeyFor(faction, h)`**
  („rodnáFrakce:idx") — applyAccountToHero i syncAccountFromFaction přes něj.
  Odemčený hrdina jde nasadit v KTERÉKOLI frakci své strany.
- **`STARTER_IDX`** = přidělený startovní hrdina frakce (aldar:2 štítonoš,
  yllien:0, brakkar:3, sarn:0, durgar:3, horda:1 (!jiné pořadí rysů),
  vhorren:2, gryk:3 — všichni běžný tier, rysy pestře). Hráč si hrdinu
  NEVYBÍRÁ — newGame/tryStart ho dosadí; `playerHeroes` param zůstal jako
  přepis pro testy. Startovní unlock se zapisuje na účet (sólo i server).
- **`deployHero(faction, fkey, defIdx)`** = lidská cesta k 2.–5. hrdinovi:
  zdarma, gate hook **`G.canDeploy`** (server: accOf+heroUnlocked; sólo:
  heroUnlockedAcc), stejná strana, HERO_MAX, bez duplicit; G.onHire aplikuje
  postup z účtu. `hireHero` zůstal JEN pro AI (zlato = tempo sezóny).
  NET_CMDS/CMDS: deployHero, setHeroPreset.
- **`setHeroPreset(faction, heroIdx, army)`** — „výchozí sestava": útočné
  kolo ji předvyplní místo suggestArmy (ořez na zásobu), editor na kartě
  hrdiny (📋). h.preset jde snapshotem samo.

### Ekonomika účtu (game.js)
- **Truhla 400 jader** (bylo 2400); **první otevření dne zdarma**
  (acc.freeChestDay, `chestFreeAvailable`, `dnesniDen()` — místní čas
  serveru). accountOpenChest vrací navíc {zdarma, invite, pityInvite,
  invitePityAt}.
- **Zvací listy**: INVITE_CHANCE 2 %/truhla + jistota po INVITE_PITY_AT=200
  (acc.pityInvite); `applyInviteToAccount` = okamžité odemčení (1★);
  duplicitní list → +200 💠. `rollInviteHero` váhy [70,25,5], přednost
  zamčeným a seznamu přání.
- **Wishlist** (acc.wishlist, max 4, `wishlistToggle`): rollGiftHero
  i rollInviteHero s 50% šancí losují jen z přání (WISHLIST_CHANCE).
- **Oddanost dle tieru**: `giftCostForStar(n, tier)` × TIER_GIFT_MULT
  [0,8 / 3 / 9] → 1. hvězda 8/30/90 dárků; `respectForStar(n, tier)` —
  volající MUSÍ posílat tier (heroTierOf)!
- **Vellarská jména dárků**: GIFT_NAMES[fkey][trait] (48 jmen) +
  GIFT_ICON_BY_TRAIT; `giftNameFor(fkey, defIdx)`; applyGiftToAccount
  vrací `darek` {name, icon}.
- **Rotující denní obchod**: `marketShopOffers(side)` — deterministický los
  ze dne+strany (stejná nabídka pro všechny), 5 slotů = 3 dárky (limit 1–3×)
  + 2 kusy výbavy (vzácný/epický); ceny SHOP_GIFT_PRICE [90/320/900] 🪙
  a SHOP_ITEM_PRICE dle rarity. `buyShopOffer(faction, acc, slot)` — zlato
  platí frakce, odměna na účet, odběry acc.shopDay/shopBought. Server zprávy
  shopBuy/wishlist (vedle openChest), profileMsg nese wishlist/freeChest/
  pityInvite/shopBought.
- **Akademie velení** (BUILDINGS.academy): max 10, +1 velení všem hrdinům
  za úroveň (heroArmyCap), stavět do 2× úrovně Hlavní budovy (výjimka
  v canBuild), ceny kámen+zlato.

### UI konsolidace (main.js, index.html, style.css)
- **Lišta 10 → 5 ikon**: 🏰 Domů (skok kamery na kapitál + panel města —
  budovy/výcvik/vylepšení/tržnice se otvírají ODTUD přes tp-open),
  ⚑ Hrdinové, 🌿 ratolest, 📩 obálka, 💠 truhly. **Složená okna**
  COMPOSITE_WINS: branch = cíle/skóre+diplomacie, mail = kronika/reporty
  (reporty = klik na záložku otevře overlay reportů) — záložky v #win-tabs
  (hlavička okna), badge 📩 = nepřečtené reporty + nové záznamy kroniky.
- **Okno hrdinů**: záložky ⚑ Moji / 🏛 Síň hrdinů (.win-tabs-inline — POZOR
  ne id #win-tabs, to je hlavička!). Síň = katalog 24 hrdinů strany po
  frakcích: nasazen/Nasadit/zamčený s oddaností (X/need dle tieru), vellarský
  dárek, ☆ wishlist (sólo wishlistToggle+save, MP mpWishlist). Hire-box
  SMAZÁN.
- **Sloupec portrétů vlevo** (#hero-strip, updateHeroStrip v updatePanels):
  jen aktivní hrdinové (v poli/na pochodu), stav (⚔→cíl s ETA, ↩ domů,
  🏰 obléhá, 📦 posily→rozkaz, 🛡📍 stojí) + proužek velení (armyCp/heroArmyCap);
  klik = karta hrdiny (openHeroWindow), dvojklik = skok kamery (timer 230 ms).
- **Startovní obrazovka**: krok 0 = volba strany (dobro/zlo), krok 1 = 4
  frakce strany s „⚑ startovní hrdina: X" (data-fi na kartách — lobby taken
  značení přes data-fi, ne index!); výběr hrdiny ZRUŠEN (showHeroSelect
  smazán). Sólo startGame(factionIndex) i MP mpSendPick(faction) bez hrdinů.
- **Truhly**: tlačítko „DNES ZDARMA", řádek 📜 listové smůly, reveal karta
  zvacího listu (.reveal-card.invite) + štítek „první dnes — zdarma";
  dárek v revealu nese vellarské jméno.
- **Tržnice**: sekce 🛒 Denní obchod (dailyShopHtml + shopBuyAction:
  sólo buyShopOffer+saveLocalAccount, MP mpShopBuy; onShopResult refresh).
- Kolo útoku: **⚙ Upravit jen u hrdiny DOMA** (v poli ho plně nahrazuje
  vestavěný picker posil).

### Server (server/server.js)
- pick: **oprava předexistující chyby f < 4** (blokovala výběr frakcí 4–7
  v MP od v0.23!) → f < FACTION_DEFS.length; hrdina se nevaliduje
  (pickAllowed mrtvý); tryStart bez p.heroes (startery z STARTER_IDX);
  startovní unlock na účet dle STARTER_IDX.
- Zprávy shopBuy/wishlist; chestResult nese zdarma/invite; G.canDeploy hook.

### Pasti v0.27
- **respectForStar/giftCostForStar VYŽADUJÍ tier** — volání bez tieru vrací
  ceny běžného hrdiny (default 0). Všechna UI volání posílají heroTierOf.
- **durgar a horda mají JINÉ pořadí rysů** než ostatních 6 frakcí (attack
  první) — STARTER_IDX je proto per frakce, nikdy nepřebírat indexy napříč.
- **Dvě sady záložek**: #win-tabs (hlavička složených oken) vs
  .win-tabs-inline (uvnitř panelu hrdinů) — druhé NESMÍ mít id win-tabs
  (kolize querySelectorAll → záložky hrdinů prosakovaly do obálky).
- **Patch skripty nikdy nepouštět dvakrát** — náhrada obsahující původní
  kotvu se při druhém běhu aplikuje znovu (zdvojený blok updateHeroStrip
  → SyntaxError z let; oprava dedupe podle hlavičkového komentáře).
- Guest bez účtu v MP nemůže nasazovat hrdiny (G.canDeploy chce účet) —
  stejná logika jako dřív u najímání.

## ETAPA 3 (v0.29, 2026-08-28) — akční rádius, obléhací okna, válka, vykořenění

Provedení PLAN.md část I, body 1+2. Vše zelené: tests/test-etapa3.js (49),
celá sada 1707 testů, **gate sim 3000 tiků: všech 8 AI má základnu v dosahu
Trůnu na 5+ seedech** (tests/sim-brana.js — pouštět po zásazích do AI/dosahu/
obléhání, není ve vse.js), MP smoke na :8200 (declareWar po drátě, snapshoty
nesou okno/odol/valky/capKey/zakladna automaticky).

### Akční rádius základen (game.js)
- **`REACH = 20`** (Manhattan). Základny = kotva kapitálu + vlastní výspy.
  Hrdina nese **`h.zakladna`** (klíč výspy | null = kapitál); `heroBaseKey`
  dělá LÍNOU validaci (padlá výspa → automaticky kapitál), `vDosahu(f,h,tile)`
  měří na KOTVU bloku. Gate ve startMarch (jen cizí cíle — přesuny na vlastní
  pole, návraty a posily bez omezení!) a startReinforceAttack.
- **`heroSettle(faction, heroIdx)`** — výslovné usazení: hrdina STOJÍ na
  vlastní výspě → základna; doma → základna zpět kapitál. Dojezd „return"
  pochodu základnu resetuje na kapitál. Export + NET_CMDS + CMDS.
- **Kapitál je POHYBLIVÝ**: `f.capKey` (initFactions z CAPITAL_POS), čtení
  VŽDY přes **`capKeyOf(f)`/`capPosOf(f)`** — všech ~14 vnitřních čtení
  CAPITAL_POS[id] v game.js přepsáno; CAPITAL_POS zůstává jen pro genMap,
  biomy (render) a model kapitálu (tileModel má fallback dle ownera).
- `BRIDGE_BOTH_ENDS = false` — feature flag: vlastněný most vodí sousedství
  jen s drženými OBĚMA břehy (`bridgeVede`; směr z t.riv či souřadnic). Vypnuto.

### Obléhací okna (game.js)
- **`SIEGE_HP` = {fortress 1400, grandfort 2400, capital 3200, throne 4500}**;
  `jeVelkaStavba(t)`. Bastiony/města/běžná pole BEZE ZMĚNY (kotvy křivky
  dobývání se nepohnuly — testy je hlídají dál).
- Tok: výhra nad posádkou velké stavby **NEZABÍRÁ** — otevře `t.okno`
  (`siegeWindowTicks()` = max(90, 0,07 % sezóny; 336 h ≈ 14 min) a `t.odol`
  na plnou; útočník se utáboří (stejný kind "siege" jako náběhy v0.19).
  Dojezd útoku s oknem a BEZ živých obránců → **`resolveDemolice`**: úder
  `armyCp × DEMOLISH_PER_CP(1) × structAtk × (válka? 1 : 0,3)`, útočník
  NEKRVÁCÍ; kapitál a Trůn ostřelují (`CAPITAL_FIRE` 1,5 % armády/náběh).
  Odolnost ≤ 0 → zábor bloku + PŘESTĚHOVANÉ bonusy prvního dobytí
  (grandfort 800 🪙+jádra, fortress jádra, Trůn signature kus — jen prevOwner
  === -1). Obránce se smí do stavby vrátit (posádkuje hrdiny) → normální
  bitva, okno běží dál, odolnost drží.
- **Promeškané okno** (tickWorld): posádka i odolnost na plné, kronika.
  Během okna posádka NEdorůstá a `tileDefComponents` NEpočítá milici
  (pobitá) — hrdinové/stráže/výspy/domácí zásoba brání dál.
- −70 % bourání (`WAR_SIEGE_PENALTY`) v kraji DRŽENÉM cizí frakcí
  (`regionHolderId`: majitel grandfortu-brány; střed = majitel Trůnu).

### Vyhlášení války (game.js)
- **`declareWar(f, targetId)`** — jednosměrné, do konce sezóny (`f.valky`),
  cooldown `warCdTicks()` = max(180, 5 % sezóny) (`f.valkaCd`). Trhá pakt
  (zrada: grudge + PACT_BETRAYAL_COOLDOWN), napadený dostává grudge.
  **Povinná pro útok na hráčský kapitál** (startMarch gate). `jeValka(f, id)`.
  Export + NET_CMDS + CMDS; emitEvent("war", cíl).

### Vykořenění (game.js)
- Kapitál sražený na nulu → **`resettleFaction`**: nový kapitál 3×3
  v „závětří" vlastního kraje (regionOf === REGION_NAMES[id], Manhattan
  VĚTŠÍ než starý, volné 3×3 bez staveb/bloků/řek, skóre hloubka − dist/3),
  makeBig(…, true); `f.capKey` se přepíše — návraty/ústupy/posily tečou
  k novému kapitálu samy. Starý blok drží dobyvatel a kotva se mění na
  **"city"**. Frakce ŽIJE (pole, suroviny, hrdinové zůstávají).
  eliminateFaction zůstal jen jako pojistka „není kam přesídlit".

### AI (aiTurn)
- `aiZakladny(f)` = kapitál + vlastní výspy; **staví výspy směrem k Trůnu**,
  když žádná základna nedosáhne (spot = vlastní pole nejblíž Trůnu, přiblížení
  ≥ 2; rozestup ≥ 5 NEplatí pro „dokončovací" výspu s dosahem na Trůn — bez
  výjimky AI zamrzala na 21–22). Usazuje hrdiny stojící na výspě blíž Trůnu
  a POSÍLÁ domácí hrdiny obsadit výspy (max 2 na výspu, 1 přesun/tah).
- Kandidáti: filtr dosahu základen; **dostředivý tah** — dokud kTrůnu > REACH,
  85 % tahů přidá nejbližšímu NEblokovému cíli +0,5/0,6 skóre (2×2 uzly mají
  dvojité posádky a tah by se o ně zasekl). Kapitál jen s válkou (AI ji
  vyhlásí rolí 0,25×aggression), bourání v cizím kraji zkouší válku rolí
  0,2×aggression. **Proti neutrálům útočí už na 65 % odhadu** — odražený útok
  přejde v obléhací náběhy a posádka se semele. Posily hrdinům: práh < 300,
  cíl 380, **a nově i obléhajícím** (dřív je heroBusy schovával). Až 2 výpady
  za drahý tah.

### UI (main.js, render.js, style.css)
- Kolo/panel: nedosažitelný cíl = tvrdý zámek s důvodem (šedí hrdinové
  v showHeroPick, .tm-warn v showMarchConfirm, hint v panelu pole); na cizí
  kapitál kolo nabízí „🔥 Vyhlásit válku" (skok na Skóre) a potvrzení hlásí
  valkaTreba. **Diamant dosahu** — `reachPreview` (render.js, kreslí se pod
  výběrem; nastavuje showMarchConfirm i syncInputs, maže se všude
  s marchPreview). Panel velké stavby: řádek 🧱 Odolnost X/max + ⏳ okno +
  upozornění na postih kraje. Panel výspy/hrdiny: „⚑ Usadit se na výspě"
  (#btn-settle), výpis usazených; karta hrdiny řádek ⌂ Základna; strip ⌂.
  Skóre: ⚔ vyhlášení války na dvojklik (warArm, 3 s), tagy ⚔🔥 / 🔥! (válka
  PROTI mně), cooldown šedě. tileSignature nese okno/odol/valky/zakladny!

### Pasti v0.29
- **Nikdy nečti CAPITAL_POS[id] pro živou frakci** — po vykořenění lže;
  vždy capKeyOf/capPosOf (výjimky: genMap, biomy, render fallback).
- **Patch skript s GLOBÁLNÍ náhradou přepisuje i vlastní vložený kód** —
  náhrada `keyOf(CAPITAL_POS...)→capKeyOf(faction)` proběhla PO vložení
  capKeyOf a přepsala mu fallback na sebe-rekurzi (RangeError na snapshotu
  bez capKey). Chytla to až adversariální revize; globální náhrady pouštět
  PŘED vkládáním nových funkcí, nebo je psát tak, aby se kotvě vyhnuly.
- **resolveMarch přeukotvuje cíl i PŘI DOJEZDU** (bigAnchor + přepis
  march.targetKey) — vykořenění umí za letu udělat z cíle člena nového
  bloku kapitálu; bez re-anchoru by se blok ukradl bitvou o holé pole.
- **Obléhací okno je stav SVĚTA, ne obléhatele** — boří KDOKOLI (třetí
  frakce může okno „vysupovat" včetně bonusů prvního dobytí). Vědomá
  vlastnost (drama, spolupráce stran); kdyby vadila, ukládat na kotvu
  otvírající frakci.
- **Obléhací odpočet přežívá heroPinned** (posily na cestě → náběh se
  přesune o 10 s, nepropadá) — jinak konvoj poslaný obléhajícímu tiše
  zabil celý řetěz náběhů (AI to dělá systematicky).
- **Vykořenění jen při pádu SKUTEČNÉHO capKey** — každý dobytý „kapitál"
  se mění na city, ať se bludné kapitály nemnoží; declareWar/pakt se
  vzájemně vylučují (offerPact/acceptAiOffer/AI nabídka mají guard).
- **AI prahy armád v CP, ne v kusech** (armyCp) — sarn (cp 2) jinak jedná
  s polovičním sebevědomím. Platí pro stráž/posily/odvolání/enough.
- Vědomé resty (nebolí, hlídat v betě): siegeTry se bouracími náběhy
  nezvyšuje (MAX_TRIES grind nečepuje — záměr); bonusy dovedností po
  výhře (goldPerLevel/winStam/rally) se u velkých staveb dají až při
  ZÁBORU, ne při pobití posádky; nápověda držitele kraje v panelu se
  neobnovuje každý tik (regionHolderId není v podpisu — drahý sken);
  kapitál v kraji drženém TŘETÍ frakcí se bez války na držitele boří
  za 30 % i s povinnou válkou na majitele.
- resolveDemolice se volá jen s oknem > 0 a BEZ živých obránců
  (armyTotal(comp.army) < 1) — militia je při okně nulovaná, ale domácí
  zásoba/hrdinové/výspy obránce pořád brání (musí se vybít bitvou).
- `t.okno`/`t.odol` se MAŽOU (delete) při záboru i obnově — UI čte
  `t.odol ?? SIEGE_HP[s]`.
- Sim gate: `node tests/sim-brana.js [seedů]` — po každém zásahu do AI,
  dosahu, obléhání či ekonomiky. Kotvy křivky dobývání netknuté.
- vDosahu měří na KOTVU (bigAnchor) — člen bloku nikdy neměřit přímo.
- AI výspy: bez „dokončovací" výjimky rozestupu 5 gate NEprojde — nechat.

## ETAPA 2 (v0.28, 2026-08-29) — kity osmičky, nové efekty, rastr balancu

### Nové typy efektů (game.js + sim)
- **slowEnemy** (cap 4): −iniciativa nepřátelských formací (v řazení actors)
  a −rychlost nepřátelského velitele. **shred** (cap 40): −% statů
  nepřátelského velitele (atk/def/dmg; mutace per-bitva kopií po mkSide).
  **roundHeal** (kolová aktivka, ROUND_EFF_TYPES): v kole vrací % KUMULATIVNÍCH
  ztrát (init − současný stav) zpět do řad — ztráty se dělí na mrtvé/raněné
  až PO bitvě, proto se křísí z rozdílu. **cauter** (cap 75): −% účinku
  nepřátelského roundHeal („rány se nehojí") — protipól léčitelů, vznikl
  z potřeby pavučiny. **harvest**: +% výnosu Sklizně kraje (ringGather;
  sčítá se přes hrdiny frakce). Všechny tečou přes heroStats → bitevní
  objekty velitelů (atkHero/defHero) → sim; UI texty v effText/EFF_ICONS
  (🐌🩸⚕🔥🌾) a roundEffText.
- PAST: **tests/rastr.js `velitel()` kopíruje pole VÝSLOVNĚ** — nový eff
  se musí přidat i tam, jinak se do matice nedostane (cauter to stálo kolo).
- PAST: **sim čte GLOBÁLNÍ rng** — nastavuje ho newGame(seed). Kdo chce
  varianci přes seedy, musí před simulateBattle zavolat newGame(x, seed).
- PAST: **aiSpendSkills má pojistku 24 učení NA VOLÁNÍ** — na plný build
  (49 bodů) je nutné volat opakovaně (rastr volá 4×).

### Kity startovní osmičky (blok „STARTOVNÍ KITY" před dekorátorem)
Navrženo workflow (8 návrhářů + 8 kontrolorů, schema-forced JSON; kontrola
chytila reálnou kolizi klíče „hora" se stromem Zhargry → „pad"), sestaveno
generátorem, doladěno ~25 koly rastru. Archetypy: aldar štítonoš (stun 1,0
+ roundArmy + stackDef ult), yllien lukostřelkyně (slowEnemy 0,27 + unitDmg
arch + roundDmg ult), brakkar tank-heal (dmg/def/roundHeal, BEZ bonusů
jednotkám), sarn kavalerista (unitDmg cav 2,7 + strike + stun „Dusot kopyt"
+ roundDmg zteč), durgar siegemaster (structAtk + stackDef + roundHeal),
horda čistá DD (dmg 1,4 s maxEff stunImmune! + cauter 4 + shred 2,2 + roundDmg),
vhorren warlock (shred 2,0 + roundHeal 0,6 „Vstávání padlých" + madness 0,8),
gryk ekonom (harvest ×3 + stackDef „Krunýř roje" + roundHeal 0,7 + gold/xp/convoy
ve větvích). **STARTER_IDX vhorren změněn 2→3 (Nespící Ordwal, tireless)** —
shield rys dával warlockovi stunImmune+avoidCharge z TRAIT_MAX_EFFS a dělal
z něj neporazitelnou pevnost. Mistrovské počty: vlastních 21, z rysu 171
(test-boj sada 1 přeukotvena — 4 ruční ulty nahrazeny kity, horda má vlastní).

### FACTION_UNITS přeladěny na CP paritu (±3 v zrcadlech)
Rastr odhalil, že tabulka v0.23 nebyla při stejném VELENÍ vyrovnaná
(aldar +7, gryk −7 v zrcadlových střetech bez hrdinů). Identity zůstaly
(aldar kvalita, horda sklo, brakkar želva, gryk levné množství), extrémy
staženy: aldar inf 10hp/5def, cav 9hp/3,1dmg/5atk, arch 3,1dmg/5atk;
gryk +1hp a +1atk plošně, dmg 2,6/3,1/2,9; vhorren mágové 3,8dmg, inf
11hp/6def, štvanci 10hp/3,3dmg; yllien inf 6def/2,2dmg, arch 4,1dmg/7atk,
cav 3,4dmg; horda inf 2,8dmg, arch 3,8, cav 3,6; sarn arch/cav 5,6dmg;
durgar inf 11hp; brakkar inf 6def, cav 11hp. **Kotvy křivky dobývání se
NEPOHNULY** (měří se na základních UNIT_TYPES, ne frakčních).

### Rastr (tests/rastr.js + tests/test-rastr.js, ve vse.js)
- **maticeFrakcni** = SKUTEČNÉ páry (starter + frakční jednotky, CP parita,
  5 seedů) — na ní stojí asserce pavučiny: nikdo bez porážky, nikdo bez
  výhry. Finální web: aldara loví vhorren (kletba > štítonoš), hordu aldar,
  vhorrena durgar/yllien/brakkar, gryka skoro všichni, ale bije durgara;
  sarn bere yllien/durgar/gryk.
- **maticeMatchupu** = kity na NEUTRÁLNÍCH jednotkách (přenositelnost hrdinů
  po straně — informativní). **silaJednotek** = zrcadla bez hrdinů (info).
- **pveTabulka**: náklad na ⚔60/⚔160 (kit na neutrálních jednotkách),
  pásmo 0,6–1,5× mediánu + monotonie. Referenční build: úroveň 50,
  49 bodů = všechny 4 hlavní (15/15/15/4), větve se neučí.
- Ladicí přístup: mikro-hledač kombinací knobů (scratchpad) — ruční
  bisekce jednoho knobu honí díru dokola, hledat je třeba PROSTOR.

### Vědomé resty
- Duplicitní příjmení: „Ajsel Vichřice" (sarn) × „Ukhra Vichřice" (horda),
  2× „Žulová" (brakkar Helga, durgar Vagga) — kosmetika, přejmenovat někdy.
- Signature itemy starterů zůstaly z dob starých kitů — pasivky tematicky
  nesedí na nové archetypy (funkčně OK). Doladit s balancem výbavy.
- Kit matice (neutrální jednotky) není assertovaná — po betě zvážit
  druhou pavučinu pro cross-faction nasazování.

## ETAPA 4a (v0.30, 2026-08-30) — žíly, dvou-armádové uzly, zóny světa

První pod-etapa MMO pivotu (PLAN část II-C) „v malém" na mapě 69×69: generátor
žil, dvou-armádové uzly a fázové otevírání světa — vše škálovatelné pro 4d.

**Generátor žil (`placeNodes`, game.js za assignRes):** pole síly 200+ (level
9–12) jsou VŽDY uzly 2×2 s KONKRÉTNÍ surovinou („all" zůstal jen levelu 1 a
strukturám; objem „od všeho" vrací uzlům level 12 ×4 v `tileYield`). Žíla =
prstenec až `VEIN_RING[level]` (4/5/6/8 — blok má jen 8 obvodových sousedů)
menších polí STEJNÉ suroviny: přednost volná pole, garance ≥ 2 „přebarvením"
záložních. Dva uzly nikdy nesousedí (kontrola členů); `NODE_GUARD` 5 od
kapitálů a odstup ≤ 2 od bran prstence (grandfort/bastion/fortress — uzel by
jako nedobytná hradba zapečetil jedinou cestu výseče) — OBOJÍ měřeno na
NEJBLIŽŠÍ pole bloku (člen 2×2 je až o 2 blíž než kotva!). Strop: level-12
uzel venku max 1× od suroviny na výseč (přes `zonaOf`). Kde blok nejde
postavit → degradace na level 8. `levelForDist`: vzácné žíly i ve výsečích
(šance 1 %/0,7 %/0,3 % dle pásma; síla 9/10/11/12 = 45/30/17/8 %). Krok
surovin genMap přeskakuje pole s už daným res (`!t.res`). Invariant: po
generátoru neexistuje HOLÉ 1×1 pole levelu 9+ (test-mapa). Kotvy křivky
dobývání netknuté (⚔300→439).

**Dvou-armádové uzly (resolveMarch):** neutrální uzel (`jeUzel` = bigSize 2
bez struktury; t.garrison zůstal dvojnásobný) brání DVĚ armády à garrison/2.
Bitva 1 = předřazený blok PŘED hlavním simem (override `comp.army`, velitel 1
= `neutralCommander(tile)`); výhra → report 1 (VŽDY s attLosses/attRem!),
`poVitezneObnove` (lazaret/Kostěné řady/kořist — extrahovaná sdílená funkce),
`march.army` = přeživší, velitel 2 = `neutralCommander(tile, 1)` (salt XORem;
salt 0 beze změny), atkHero pokračuje (hp i spotřebované chargy; po levelupu
`atkHero.hp = hero.hp`) → hlavní sim = bitva 2 → normální zábor přes
setTileOwner. Prohra bitvy 1 NEBO pád velitele → `r1.won = false` +
samostatná větev: posádka plná ×2, `t.uzelCd = UZEL_CD_TICKS` (900 tiků =
15 min, knob), rout + hospital + návrat + cooldown + xp. Prohra bitvy 2 →
normální loss path s resetem (místo decay). Uzly se NEOBLÉHAJÍ
(`oblehat = !uzelBoj`). Gate v startMarch i startReinforceAttack; dolet na
mezitím uzavřený uzel = obrat (fallback). tickWorld: `uzelCd--` + delete;
regen 2×2 míří na DVOJNÁSOBEK (oprava tiché vady v0.22). Vlastněný blok se
brání normálně (dvě armády jen u neutrálů).

**Zóny světa:** `zonaOf(t)`: grandfort/bastion → „mezikruzi", fortress →
„vnitrek", bridge → „most", jinak M<8 vnitrek / M≤16 mezikruzi / oktant
„sektor-N" (týž výpočet jako regionOf, ale M≤16 vs < 16 — nemíchat!).
`zonaOtevrena(f, t)`: vnitřek od fáze 4, mezikruží od 2, mosty a cizí výseče
od 3, vlastní výseč vždy. `G.faze` 1–4: G literál + newGame reset +
serializeState + applySnapshot (**fail-open**: `s.faze === undefined ? 4 : …`
— server ≤ v0.29 fázi neposílá a klient by jinak TIŠE zamkl 88 % mapy).
tickWorld (co 5 tiků): fázi otevře checkpoint NEBO pojistka
`zoneFazeTicks` (10/30/45 % sezóny) — co dřív: CP2 Σ vlastněných polí ≥
24×živých frakcí, CP3 dobyté grandforty ≥ max(2, ceil(ž/4)), CP4 holá pole
lvl 7+ ≥ 5×živých. `emitEvent("zone")` (sfx „throne"). Tvrdé zámky
v startMarch (jen `!own`) a startReinforceAttack. Trůnní příměří (50 %)
běží NAD fázemi (fáze 4 = 45 % → panel do té doby ukazuje zónový zámek,
pak příměří — pořadí sedí pro každou délku sezóny).

**AI (aiTurn):** kandidáti filtrují zamčené zóny a uzavřené uzly; potreba
uzlů **0,85** odhadu (změřené minimum sekvenčních bitev ~0,86×; 65 % na
uzlech jen krvácelo — reset po neúspěchu!); dostředivý tah jede VLASTNÍ
drahou (vlastní výseč/mezikruží/vnitřek — „nejbližší cíl" přes řeku v cizí
výseči je slepá ulička); z bloků kandiduje NEJSLABŠÍ s d < kTrunu a potřebou
≤ max. velení hrdinů, a pole ho přebije, jen když dává skutečný postup
(stred.d ≤ kTrunu−2 — kandidát na kTrunu−1 je šlapání vody). **Koncovka**
(kTrunu > REACH a tik > 35 % sezóny): stráže dolů (guard žere výdrž —
cyklus 0↔70 blokoval finální dobytí), pin od konvoje řeší `cancelReinforce`
(konvoj bez hrdiny se čistě vrací); v TĚSNÉ koncovce (≤ REACH+6) boost
najisto + fronta na dostředivý cíl; max 2 rozlétnuté zátahy na jeden
neutrální cíl. Nouzová „mezivýspa" bez rozestupu jen v pásmu (REACH,
REACH+2]. Výspy se osazují posádkou (cíl 200 CP, po výpadech, rezerva 300,
nejdřív nejblíž středu).

**GATE = STATISTICKÝ (rozhodnutí uživatele 30. 8. 2026):** tvrdé „8 frakcí ×
všechny seedy v plném dosahu" bylo na chaotickém simu nedoladitelné — frakce
uměla skončit 1–2 pole od cíle živá a aktivní a ~10 iterací heuristik jen
překlápělo seedy. `tests/sim-brana.js` nově: všech 8 žije na KAŽDÉM seedu,
nikdo hůř než REACH+2, na každém seedu ≥ 7/8 v plném dosahu, celkem ≥ 90 %.
Stav: 62/64 (97 %) na 8 seedech.

**UI:** top bar `🌍 fáze/4 za <fmtDobu>` (ne fmtTime — 336h sezóna by psala
„2016:00"), okno cílů = blok „Otevírání světa", `zonaZamekTxt` v panelu,
kole, confirmu i tooltipu, uzel „⚔⚔ Dvě armády uzlu" + odpočet uzávěry,
výnos uzlu v panelu ×4 „(celý blok 2×2)" (u 3×3 struktur mezera trvá),
tileSignature += G.faze a t.uzelCd + `join("|")` (čísla bez oddělovače uměla
srůst), render: tint zamčených zón v mapLayer, fogFactor ×0,62 s podlahou
0,2 (silueta terénu), 🔒 na branách zamčených zón (vzor trůn). **Oprava
startu rozbitého od v0.27:** `#btn-start-game` seděl v trvale skrytém
`#hero-select` (krok výběru hrdiny zrušila v0.27 a start zmizel s ním) —
sólo start ani MP pick NEŠLY potvrdit; tlačítko přesunuto pod
`#faction-cards` (+ CSS pro nízká okna).

**`seedRng(seed)` (nový export):** seedování kostek BEZ generování mapy.
Rastr přeseedovává per duel — přes newGame by KAŽDÁ změna generátoru
posunula proud rng a „přeházela kostky" těsných duelů (přesně to shodilo
test-rastr po placeNodes). SEEDU rastru 5 → 11. Poctivé kostky odhalily, že
„čistá pavučina" v0.28 byla artefakt starého proudu: reálně **aldar nemá
lovce a yllien kořist** (kity se v této etapě NEMĚNILY). test-rastr teď
nese allow-list známého dluhu a hlídá, ať se šikmost NEROZŠÍŘÍ; ladění kitů
= beta (dle PLAN etapy 2 „jemné ladění převezme beta").

**Doplňky po nasazení (30. 8. večer):** radiální kolo na VLASTNÍM kapitálu
nabízí bubliny 🏰 Stavět / 🗡 Výcvik / ⚒ Vylepšení (tileMenuActions →
openSideWin; do v0.30 bylo kolo kapitálu prázdné a agendy jen v plovoucím
panelu). Oprava chyby z v0.27: initFactions zakládal buildings BEZ klíče
`academy` → okno Budov ukazovalo „Akademie velení úr. undefined · NaN s"
a akademie NIKDY nešla postavit; klíč doplněn (test v test-etapa4 sada 6 —
každá budova z BUILDINGS musí mít v initu klíč!).

**Testy:** `tests/test-etapa4.js` (35 asercí: dvě bitvy + reporty, reset +
uzávěra + obrat doletu, regen na dvojnásobek, matice zón × fází, checkpoint
i pojistka) ve vse.js; test-mapa rozšířen (dvojnásobek dle TIER_GARRISON,
žádné holé 9+, konkrétní res, žíla dle způsobilého okolí, nikdy vedle sebe,
ochrana hradů, strop výsečí; sada 4 + test-etapa3 scény staví `G.faze = 4`).
MP smoke na :8200 (fáze po drátě, WS živý, panel uzlu, tint, cíle).
Revize: 3 adversariální čtenáři (boj/generátor/UI) — 15+ nálezů opraveno
(pád prohlížeče reportů, DOBYTO banner, mrtvý sektorový strop, přeučené
testy…), revizor zón padl na limitu sezení (kryto gate simem a testy).

### Pasti v0.30 (nešlapat znovu)
- Bitva 1 uzlu běží PŘED hlavním simem: comp.army je poloviční, strike/duel
  preEv patří bitvě 1 (pak `preEv.length = 0`); `r1` MUSÍ mít attLosses +
  attRem i při výhře (rep-final v prohlížeči je čte bez guardu) a
  `won = false` při pádu velitele (jinak zelený „DOBYTO" nad nedobytým polem).
- `poVitezneObnove` je JEDINÝ zdroj lazaret/Kostěné řady/kořist — nikdy
  neduplikovat zpět do resolveMarch.
- NODE_GUARD i odstup bran měřit přes nejbližší POLE BLOKU, ne kotvu.
- net.js fail-open na fázi (starý server → 4) NEMAZAT — jinak mixed-version
  klient tiše zamkne 88 % mapy bez chybové hlášky.
- AI koncovka je dvoustupňová: ŠIROKÁ (čas — stráže, piny) × TĚSNÁ
  (vzdálenost — fronta, jistý boost). Fronta na dostředivý cíl NESMÍ běžet
  celou střední hru (škrtila výpady a ekonomiku — proto ta dvojice).
- Změna počtu rng tahů v generátoru přegeneruje VŠECHNY mapy — sim seedy
  dopadnou jinak a těsné AI výsledky se přeskládají; gate je od toho
  statistický. Kostky duelů seedovat výhradně `seedRng` (ne newGame).
- Vědomé resty: mezi bitvami uzlu se obnovují kolové aktivky, round-1
  pasivky a avoid chargy OBOU stran (per-bitva mechanika — dokumentovaná
  vlastnost, chargy tak na uzlech platí dvakrát); staty atkHero pro bitvu 2
  jsou snapshot před případným levelupem; checkpointy fází v AI simu nikdy
  nepředběhnou pojistky (podmínky míří na živé hráče); demolice polí 9+→8
  = svět −4,7 % výnosu a vnitřek −21 % vs v0.29 (kompenzuje ×4 na uzlech
  a žíly ve výsečích; beta doladí); panel výnosu 3×3 struktur dál ukazuje
  jen kotvu; druhý velitel uzlu se u ~4 % uzlů jmenuje stejně (12 předloh).

## ETAPA 4b (v0.31, 2026-08-30) — strom Prstenu, strop území, kapitoly, checkpointy

Druhá pod-etapa MMO pivotu (PLAN II-B2, vše rozhodnuto): strop území 80→216
ze tří zdrojů, strom Prstenu místo automatik, osobní příběh per frakce a
kolektivní checkpointy jako trvalý motor sezóny.

**Strom Prstenu („za Prsten nic automaticky"):** `RING_VETVE` = 6 větví
(nadvlada 5× +10 polí stropu; vlada 3× +2 strop ⚡ 24→30; vydrz 3× +10
výdrže; sklizen 3× +3 % výnosů říše a +15 % Sklizně kraje; veleni 3× +20
velení; hojnost 3× +0,5 atk a def) — 20 slotů na 10 bodů (1 bod/úroveň,
RING_MAX 10) = sezónní build. `f.ring` += `body` + `strom{...}` (init
v initFactions, jede snapshoty samo). `ringLearn(f, vetev)` /
`ringReset(f)` (RING_RESPEC_GOLD 300) → exports + NET_CMDS + CMDS.
**Automatiky vypnuté VÝMĚNOU TĚL `ringStam`/`ringCap`** — každá měla jediné
čtecí místo (heroStats.stamMax / heroArmyCap), jména i exporty zůstala,
sémantika = strom. `ringApMax(f)` nahrazuje RING_AP_MAX v akumulaci ⚡ i UI.
Hojnost jde v heroStats PLOŠE za starMult. Sklizeň: multiplikátor
v ringGather (`sklizen`) + `incomeOf` ×(1+0,03×rank). RING_UNLOCKS
(činy ⚡ dle úrovně) zůstávají milníky mimo volbu — záznamy o starých
pasivkách (úr. 2 a 10) z tabulky smazány. Level-up Prstenu: +1 bod +
emitEvent("levelup") pro hráče. AI: `aiSpendRing` (za aiSpendSkills) —
u stropu území Nadvláda, jinak boj (1 bod/tah).

**Strop území:** `STROP_BASE 80`; `stropPoli(f) = 80 + 10×nadvláda +
10×f.journey.kapitola + Σ bonusy uznaných checkpointů` (max 216 =
80+50+60+26 dle PLAN). `pocetPoli(f)` = scan (exportováno). Gate
v startMarch (po uzelCd, před paktem) a startReinforceAttack: `!own &&
!returnAfter/raid && cíl != Trůn && pocetPoli + blockTiles(kotva).length >
strop → false`. **Výjimky: Trůn (sezónní cíl), nájezd „udeř a vrať se"
(pole nedrží — ventil agrese na stropu), resettleFaction (vynucené).**
Rozlétnuté pochody mohou strop o kousek přestřelit (gate hlídá VYSLÁNÍ) —
vlastnost. UI: řádek 🗺 X/strop v okně cílů i v sekci Prstenu, VAROVÁNÍ
(ne zámek) v showMarchConfirm s nápovědou nájezdu. AI: kandidátský filtr
(blok = +členové!) PŘED válečnými rolly (mamPoli/strop hoisted za koncovku).

**Příběh sezóny (journey):** `f.journey = {kapitola, splnene{}}` na FRAKCI
(snapshoty samy). `KAPITOLY` = 6 kapitol × 3 questy ({key, desc, check(f)});
kapitola hotová → +10 polí stropu + suroviny + grantCores 20 (jen hráči,
řeší G.onCores) + reset splnene. Vyhodnocení v tickWorld po 5 ticích pro
VŠECHNY živé frakce — AI kapitoly plní přirozeně hrou (checky = podmínky).
Questy: pole/výhry/úroveň hrdiny/výspa/město/uzel/usazení/bašta/most/
grandfort/úroveň Prstenu (kap. 6 chce 80 polí — dosažitelné, kapitoly 1–5
už daly +50 stropu). **G.goals/SEASON_GOALS jsou od v0.31 MRTVÉ** (const
zůstává exportovaná jako reference; server šle `goals: []` kvůli starším
klientům; klientský re-link v applySnapshot je no-op).

**Kolektivní checkpointy:** `CHECKPOINTY` = 3 podmínky společného postupu
({faze, popis, bonusPoli 8/9/9, check(m)}) měřené JEDNÍM průchodem mapy
(m = poli/granty/silnych/zivych) v přestavěném tickWorld bloku. Uznání
(i POZDNÍ, po časové pojistce!) = jednorázově +bonusPoli do stropu všem +
kronika 🏁 + emitEvent("zone"). Otevírání fází z v0.30 čte
`G.checkpointy[dalsi-2]` NEBO pojistku — pojistka otevře jen zónu, porce
polí je odměna za skutečné splnění (216 je cíl, ne nárok). `G.checkpointy`
[bool×3]: G literál + newGame + serializeState + applySnapshot (default
[false×3] pro starý server).

**UI:** okno cílů (🌿) = fáze světa + 🗺 území + aktuální kapitola
s questy ✅/◻ a odměnou + 3 checkpointy; sekce Prstenu ve Skóre má strom
(6 řádků ●●○, ＋ za body, ↺ přerozdělení — .ring-plus/.ring-reset binding
ve updateScores re-bind stylu, klíče větví jsou řetězce!), ⚡ čítač jede
přes ringApMax. tileSignature += pocetPoli/stropPoli/ring level+ap+body
(Sklizeň tlačítko a hlášky stropu); heroWindowSig += ring level+ap
(Výcvik mysli / Druhý dech se dřív po odemčení neprobouzely — oprava
latentní staleness z v0.24). CSS .ring-strom/.ring-vetev/.ring-plus.

**Testy:** tests/test-etapa4b.js (24 asercí: strom/automatiky/strop
s výjimkami/kapitoly/pozdní checkpoint) ve vse.js; test-sezony přepsán
(Druhý dech dorovnává na stamMax bez automatik; větve Výdrž/Velení).
Gate sim beze změny prošel (62/64). MP smoke :8200 (strom klik → body/strop
po drátě, journey/checkpointy ve snapshotu, konzole čistá).

### Pasti v0.31 (nešlapat znovu)
- ringStam/ringCap NEJSOU pasivky úrovně — těla čtou strom. Nová čtecí
  místa výdrže/velení vždy přes tyto funkce (ne vlastní vzorce z úrovně).
- KAPITOLY checky běží per frakce po 5 ticích — drahé scany (pocetPoli,
  tiles.some) do questů střídmě; nikdy nevracet quest do nesplněna
  (splnene je jednosměrné, kapitola se po dokončení resetuje celá).
- Strop gate je jen v startMarch/startReinforceAttack — resolveDemolice
  a dojezdy NEgatují (přestřel vlastnost); resettle/eliminace mimo strop.
- G.goals nechat mrtvé (server šle []) — nemazat pole ze snapshotu, drží
  klienty ≤ v0.30 naživu.
- AI strop filtr POČÍTÁ ČLENY bloku a běží před declareWar rolly — jinak
  AI pálí cooldowny válek o nezabratelné cíle.
- Vědomé resty: journey UI nemá signaturu (překresluje se každý tik — při
  interaktivních prvcích doplnit goalsSig); AI neplatí činy ⚡ (záměr
  v0.24 trvá); strop nezná Plunder (přijde s II-C2); kapitoly jsou pevné
  (bez větvení) — obsahové rozšíření až s betou.

## ETAPA 4c (v0.32, 2026-08-30) — vrstva hráč-uvnitř-frakce

Třetí pod-etapa MMO pivotu (PLAN II-C): až CLENU_MAX (4, knob v server.js)
hráčů sdílí jednu frakci — každý s vlastním městem 3×3, surovinami,
jednotkami, hrdiny, územím, Prstenem i příběhem; frakci zůstává strana,
diplomacie, války, zóny, velké pevnosti a Trůn.

**Architektura (census: ~60 % kódu duck typing):** AKTÉR = zakládající člen
(cid 0) = FRAKČNÍ OBJEKT SÁM (`f.cid = 0`, `f.clenove = []` v initFactions)
— sólo a AI cesty se nezměnily ani o řádek; členové 1+ jsou ploché objekty
v `f.clenove` (cid = index+1) se STEJNÝMI jmény per-hráčských polí
(resources/units/heroes/marches/buildings/upgrades/build/recruitQueue/
items/boosts/freeRespecs/hirePool/ring/journey/stats/starving/capKey) +
kopiemi name/color/key/incomeMult/attackMult a `id = fid` (kvůli duck
srovnáním `t.owner === a.id`). ŽÁDNÁ zpětná reference (JSON! frakce jde
do snapshotu vcelku) — frakci aktéra číst VÝHRADNĚ přes
`frakceOf(a) = G.factions[a.id]`. Helpers: `clenPodleCid(f, cid)`,
`vsichniClenove(f)` = [f, ...clenove], `patriClenu(a, t)`
(owner === a.id && (t.clen||0) === (a.cid||0)), `scoreClena(a)`.

**Vlastnictví polí:** `t.owner` zůstává FID; nově **`t.clen`** = cid
držícího člena (chybí = zakladatel). `setTileOwner(tile, fid, cid)` —
cid 0/undefined MAŽE t.clen. Zábor bitvou připisuje pole aktérovi
(resolveMarch: setTileOwner(..., faction.cid)); velké stavby jdou jen přes
demolici a zůstávají frakční (bez t.clen). eliminateFaction t.clen maže.
`patriClenu` filtruje: incomeOf, armyUpkeep, pocetPoli (→ strop per člen!),
ringGather, heroBaseKey, buildOutpost/Deposit/Withdraw, KAPITOLY checky.
Frakční zůstává: scoreOf, grandfortMult, militaryPower, regionHolderId,
computeVisibility (union), isAdjacentToFaction (útok jde i od hranice
spoluhráče — koaliční sousedství).

**Města členů:** `umistiMestoClena` — volné 3×3 ve vlastní výseči co
nejblíž frakčnímu kapitálu (odstup ≥ 6), structure "capital" (funguje celé
městské UI, SIEGE_HP kapitálu, okna), assignRes + členové bloku dědí res
(jinak by město sypalo polovinu!), blok dostane t.clen. `pridejClena(fid,
jmeno)` = initClen + město + push. Vykořenění PER ČLEN: resolveDemolice
při pádu kapitálu hledá vlastníka podle capKey — zakladatel → klasické
resettleFaction, člen → nové město přes umistiMestoClena (nouzově
capKey = zakladatelův kapitál).

**Tik po aktérech:** hlavní smyčka doTick i journey blok tickWorld iterují
`vsichniClenove(f)` (ekonomika, hlad, stavby, fronty, hrdinové, Prsten —
ring.xp z `scoreClena`, ne frakčního skóre! — pochody, splnRozkaz);
aiTurn jede jen na frakci (lidská frakce AI výpomoc nemá). Obrana
(tileDefComponents): hrdinové a stráže VŠECH členů + výspy frakce brání
společně (contributors nesou aktéra — applyDefFractions duck), domácí
zásoba brání JEN město svého aktéra (hledá se podle a.capKey). Duel/první
úder/aura/obranná XP skenují členy; defA = aktér velitele obrany; výhru
obrany si připisuje aktér dle t.clen. retreatHeroFrom stahuje hrdiny všech
členů. Diplomacie normalizuje aktéra na frakci: hasPact/jeValka/declareWar/
offerPact/cancelPact mají na vstupu `frakceOf(faction) || faction`.

**OPRAVA v0.31:** nájezd „udeř a vrať se" pole DOBÝVÁ (jen hrdina
nezůstává) — výjimka stropu pro nájezdy strop obcházela a je ZRUŠENA;
výjimkou zůstává jen Trůn. Ventil agrese na stropu = budoucí Plunder.

**Server/síť:** players Map += `member` (cid). Pick: frakci smí sdílet až
CLENU_MAX hráčů (lobby zpráva nese clenuMax; karta „taken" = PLNÁ, jinak
jde přisednout; štítek vypisuje všechna jména). tryStart: hráči seskupení
per frakce — první = zakladatel, další přes pridejClena (nouzově sdílí
zakladatele, když se město nevejde); účty se aplikují na AKTÉRA hráče
(applyAccountToFaction(aktorOf(p))) a syncAccounts synchronizuje per aktér
→ inventáře a heroProgress členů se NEMÍCHAJÍ. Dispatch: CMDS dostávají
`aktorOf(p)` — signatury beze změny. Obálky started/state nesou
`yourMember`; háčky G.onCores(fid, n, cid)/canHire/canDeploy/onHire jedou
přes `playerByActor(fid, cid)` (aktér nese svůj cid); truhly/obchod/boosty
přes aktorOf. net.js: `G.playerClen` (+ mp.myMember), startNetGame centruje
kameru na město AKTÉRA. main.js: `player()` vrací AKTÉRA (48 call sites
beze změny), nový `myFaction()` pro přímá frakční čtení (pacts/valkaCd);
emitEvent(name, fid, cid) → G.onEvent filtruje „mine" i podle
G.playerClen (kapitoly spoluhráčů netlučou zvukem).

**Testy:** tests/test-etapa4c.js (16: člen+město+t.clen, oddělená
ekonomika/strop/Prsten, zábor členem, společná obrana, homeFaction =
člen, frakční válka od člena, JSON bez cyklů) ve vse.js. Sólo regrese:
celá sada + statistický gate beze změny. MP smoke: DVA taby v jedné frakci
na :8200 — obě města na mapě, oddělené příkazy (člen staví akademii,
zakladatel ne), kamera člena u jeho města, konzole čistá.

### Pasti v0.32 (nešlapat znovu)
- Člen NESMÍ držet referenci na frakci (JSON cyklus ve snapshotu!) —
  vždy frakceOf(a). Nová per-hráčská pole přidávat DO initClen i do
  frakčního literálu (zrcadlí se).
- `t.owner === faction.id` už NENÍ „moje pole" — pro majetek aktéra
  patriClenu(a, t); owner-only srovnání nechávat jen frakčním metrikám
  (skóre, brány, adjacency, viditelnost).
- setTileOwner: TŘETÍ parametr cid — bez něj se t.clen MAŽE (velké stavby
  a neutralizace správně; zábor bitvou ho musí předat).
- ring.xp člena jede ze scoreClena (per pole aktéra) — scoreOf je frakční
  a členům by rostl navzájem.
- Nájezd DOBÝVÁ pole — žádné výjimky stropu na returnAfter/raid.
- CMDS/UI: player() = aktér (per-hráčská pole), myFaction() = frakce
  (pacts/valky/valkaCd přímá čtení) — nemíchat.
- Vědomé resty: členové sdílí barvu frakce (mapa je nerozliší — odznak
  později); kronika a bojové reporty jsou frakční (spoluhráči vidí vše —
  co-op vlastnost); AI frakce hrají bez členů (AI výpomoc lidské frakce
  není); mid-game join není (jen lobby; II-C2 výměna AI za hráče přijde
  později); hlášky členů nesou jméno frakce (ne hráče); pád města člena
  bez místa v kraji = sdílení zakladatelova kapitálu (bez eliminace).
## ETAPA 4d (v0.33, 2026-08-29) — delta snapshoty, viewport, minimapa, velikost mapy

Poslední pod-etapa MMO pivotu (PLAN II-C technika): síť i renderer přestaly
záviset na velikosti světa a velikost mapy je knob. ETAPA 4 KOMPLETNÍ.

**Delta snapshoty (server/server.js + js/net.js):** dlaždice tvořily 95 %
snapshotu (475 z 498 KB), ale mění se jich < 1 za tik. Plná mapa jde jen ve
zprávě „started" (start i reconnect — `serializeState(token, true)`) a každý
`FULL_KAZDYCH` (60) tik jako samoléčba; jinak `state.tilesDelta` = pole
změněných dlaždic dle otisku `tileOtisk(t)` (owner, clen, garrison na CELÉ
kusy, okno, odol, uzelCd, structure, outpost součet, terrain, level, res,
big, bigSize). `zmeneneDlazdice()` počítá diff JEDNOU za broadcast a
aktualizuje otisky; `tryStart` otisky primuje (`zmeneneDlazdice()` po
newGameMulti), jinak první delta nese celý svět. Klient (applySnapshot):
`s.tiles` = plná výměna mapy, `else if (s.tilesDelta)` = merge po CELÝCH
objektech dlaždic (mazaná pole jako okno/uzelCd řeší výměna objektu sama).
Změřeno sondou po drátě: **498 KB → ~13 KB/tik (38×)**, delta průměr 0,1
dlaždice/tik, plný snapshot 1×/60 tiků, žádné slepé místo otisku.

**Oprava odhalená sondou:** regen v tickWorld 600 tiků plnil posádky ČLENŮ
bloků (t.big) — mrtvá data (boj jde vždy přes kotvu, nikdo je nečte), ale
každý tik měnila ~245 polí a nafukovala delty. Regen teď členy přeskakuje
(`if (t.big) continue;`). Sim gate beze změny (62/64).

**Viewport culling (js/render.js):** mapLayer už NENÍ celosvětový rastr
(při MAP_R 34 měl 13305×7764 = 103 Mpx ≈ 394 MB — Firefox má strop plátna
~124 Mpx, větší mapa by ho vůbec nezaložila), ale VÝŘEZ kolem kamery:
viewport + `LAYER_OKRAJ` (8×HEX_SIZE), rastrovaný ve stupni `layerStupen()`
(0,5/1/2/MAP_SCALE dle zoomu — nikdy hrubší než obraz, nikdy jemněji než
MAP_SCALE; schody drží vrstvu při plynulém zoomu). Překreslení: nový tik,
vyjetí kamery z okraje, změna stupně, resize plátna (resizeCanvas nově
invaliduje mapDrawnTick). Všech 6 průchodů polí (nouzový terén, tint
úrovní, zamčené zóny, území+hranice, jmenovky, filtr+mlha) jede přes
`dlazdiceVyrezu()` — (q,r) box rohů výřezu + PAD 3 (kotvy bloků 3×3,
jmenovky); na plném oddálení degraduje na celý svět (=dřívější chování).
Blit v draw(): 9-arg drawImage výřezu na jeho world místo. Výsledek:
vrstva 15–18 MB (26×), překreslení 12–13 ms 1×/tik, snímek ~0,4 ms.
`ensureMap3D` má tick-gate (`map3dPodpis && map3dTik === G.tick` — do
první stavby polluje každý snímek): mapModelList (průchod celé mapy +
~60kB join) běžel 60×/s, teď 1×/tik. `R3.setFog` hoistnutý z
drawFogOverlay pod tick-gate `fogTik` — MUSÍ zůstat přes VŠECHNY instance
(mimo výřez taky, jinak při posunu vyplouvá nezamlžený terén) a po
R3.build se `fogTik` resetuje (build vrací instanceColor na odstín).
Kamera je nově clampovaná na worldMin/Max v draw().

**Minimapa (render.js kresliMinimapu + #minimap v index.html + CSS):**
plátno vpravo dole (232×148), podklad 1×/tik do offscreen `miniData`
(území barvou frakce, neprůchozí modře, prozkoumané/tma; tečky throne
zlatě / capital+city bíle), každý snímek blit + rámeček pohledu (obraz
kryje OSOVÝ world obdélník — projekce nemá rotaci). Souřadnice přes
`tileToPixel × miniScale` — žádná nová geometrie, škáluje s libovolným
MAP_R přes worldW/worldH. Klik i tažení (pointerdown/move v main.js,
`miniToWorld`) skáče kamerou + `hideTileMenu()` (doplněno i do #rail-home
— kolo se po skoku kamery samo nepřemisťuje). Schovaná mimo běžící hru
(class hidden, toggle v kresliMinimapu).

**Velikost mapy jako knob (game.js `setMapRadius`):** MAP_R/WALL_R/OUTER_R/
REACH/CAPITAL_POS/BRIDGE_KEYS jsou `let`; `setMapRadius(r)` přepočítá vše
+ propíše do module.exports (primitivy v exportech jsou jinak kopie z doby
načtení!). Odvození volená pro BYTE-IDENTITU při 34 (ochranná aserce přímo
v setteru): WALL_R = floor(MAP_R/4) (round by dal 9!), OUTER_R = 2×WALL_R
(NENÍ MAP_R/2 = 17!), kapitály (M−c, c) s M = 2×OUTER_R a c = WALL_R+1
→ (23,9), brány grandfortů round(OUTER_R/4) + dopočet (12/4), diagonální
řeky od floor(OUTER_R/2)+1 (9), osové od OUTER_R+1, mosty diag ±OUTER_R
a osové round(1,5×OUTER_R) = 24 (NE 23 = q kapitálu!), pásma levelForDist
z dKap = 2×OUTER_R − (WALL_R+1)/2 = 27,5: BLIZKE 20 / STREDNI 24 /
DALEKE 27 / MEST 28, REACH = round(5×OUTER_R/4) = 20, počty měst a guard
úměrně ploše ((2R+1)/69)², BRODU_MAX a EVENT_MAX škálované. AI práh
dostředivosti `kTrunu > 24` → `round(REACH×1,2)`. Smyčka měst má seznam
polí HOISTNUTÝ před while (bylo O(pokusy×polí) uvnitř; rng tahy to NEMĚNÍ
— stejné pořadí hodnot, stejné indexy). Server: `node server/server.js
8123 336 51` (4. argument; bez něj 34), volá setMapRadius PŘED tryStart.
Snapshot nese `mapR` a klient (applySnapshot) si geometrii přepočítá —
starý server pole neposílá → zůstává 34 (fail-open). Sólo hraje na 34.

**Gaty a měření:** tests/test-mapr.js (20 asercí) ve vse.js — sada 1:
hashe map (sha256 přes seřazená pole, seedy 42/355/1042) PROTI KOTVÁM
z doby před refaktorem + setter-identita + odvozené hodnoty; sada 2:
invarianty na MAP_R 51 (10609 polí, 8 kapitál na M 48, trůn 3×3, 4+8+32
opevnění, 8 mostů s průchozími břehy, souvislost trůn↔kapitály, žádné
holé 9+, uzly nesousedí, zóny, ~45 měst); sada 3: návrat na 34 + hash.
Výkon na 51: gen 34 ms, logika 5,4 ms/tik (lineární, budget 1000 ms) —
**knob tiku výnosů NENÍ potřeba** (PLAN „jen pokud měření ukážou");
plný snapshot na 51 ~1 MB 1×/60 tiků. MP smoke: :8200 na 34 (reconnect,
zoomy, filtry, minimapa, delta protokol po drátě) i na 51 (klient si
odvodil REACH 30 / kapitál (35,13), svět renderuje, konzole čistá).

### Pasti v0.33 (nešlapat znovu)
- Otisk dlaždice (tileOtisk) MUSÍ krýt každé běhové pole, které klient
  zobrazuje — nové mutující pole na dlaždici ⇒ přidat do otisku, jinak
  se změna k klientům dostane až s plným snapshotem (do 60 s). Sonda
  tests/sonda-delta.js to umí ověřit do hloubky (merge vs plná).
- „started" (start i RECONNECT) musí volat serializeState(token, true) —
  bez full příznaku přijde stav BEZ tiles a klient spadne.
- Členové bloků nemají posádku a regen je přeskakuje — kdo by jim
  posádku začal dávat, probudí síťový šum v deltách (245 polí/tik).
- mapLayer výřez: každé nové kreslení do vrstvy iterovat přes
  `dlazdiceVyrezu()` (NE G.tiles.values()) a pamatovat na PAD, když
  kreslí mimo vlastní pole (kotvy, jmenovky). R3.setFog nikdy neomezovat
  na výřez. ensureMap3D negatovat zpět na per-frame (mapModelList je
  celomapový průchod).
- setMapRadius: odvození NEMĚNIT bez testu byte-identity (test-mapr
  kotvy) — floor vs round u WALL_R, OUTER_R ≠ MAP_R/2, mosty 24 ≠ 23.
  Refaktor JAKÉKOLI smyčky v genMap s rng = přegenerování všech map
  (posun proudu rng), i když čísla sedí.
- module.exports: primitivy jsou kopie — po změně MAP_R/REACH za běhu
  Node čte správné hodnoty jen díky Object.assign v setMapRadius.
  Destrukturovaný import (`const { REACH } = require(...)`) zamrzne na
  hodnotě z doby importu — v testech po setMapRadius číst `g.REACH`.
- Vědomé resty 4d: strop level-12 uzlů zůstává 1× od suroviny na výseč
  i na větší mapě (na 200k+ mapách zvážit úměru ploše); frakcí je pořád
  8 (velikost mapy na tom nic nemění); AOI po hráčích (posílat jen okolí
  aktéra) zatím není — delta protokol ho nepotřebuje do ~MAP_R 70,
  na MMO škále (230+) bude plný snapshot 1×/min neúnosný (~20 MB) →
  tehdy FULL_KAZDYCH per hráč + prostorový filtr; chunkovaná stavba 3D
  (InstancedMesh per 16×16) až s většími mapami — dnes 64 draw calls.
## SIGNATURE INTERMEZZO (v0.34, 2026-08-29) — sigy starterů jako páky pavučiny

Schválená mezietapa (po etapě 4, před etapou 5): signature itemy starterů
přeladěny na archetypy kitů v0.28 a zapojeny jako ladicí páky pavučiny;
allow-list známého dluhu v test-rastr.js ZRUŠEN.

**Referenční build rastru nese sig:** `pripravStartera` (tests/rastr.js)
nasazuje starterovi jeho signature kus (základ, 0★, bez zušlechtění) —
předpoklad „v endgame má každý svůj signature". `velitel()` nově kopíruje
`st.vsDmg` a `rozlisVs(va, fkB, vb, fkA)` rozliší frakční amplifikátory
proti soupeři (zrcadlo resolveMarch: vsAll = vsDmg[enemyKey]) — bez toho
jsou vsFaction řádky v rastru NEVIDITELNÉ.

**Rozhodnutí uživatele (29. 8.):** (1) **Edran (aldar) se nenerfuje** —
smí být špička; „jestli je OP, tak je to dobře, ostatní půjdou nahoru";
podmínka: nesmí vyhrávat beze ztrát. Změřeno: krvácí 28–44 % armády
v každém výherním páru → bez zásahu; hlídá test (průměrné ztráty ≥ 15 %
proti každému). (2) **Frakční amplifikátory (vsDmg) jsou schválený knob**
po vzoru rasových řádků RtW.

**Přeladěné sigy (SIGNATURE_ITEMS, jen startery):**
- yllien:0 Tiché kroky — „Druhý šíp": strike 10 → **followUp 15** (strike
  je pre-battle preEv a v rastru/simu neexistuje — jako knob NEPOUŽITELNÝ).
- durgar:3 Žulový krunýř — „Vypálené rány": stam 15 → **cauter 40**
  (řeže Vstávání padlých vhorrena i léčení brakkara/gryka → durgarova výhra).
- brakkar:3 Žulový kyrys — „Hlubina proti popelu": def 1 → **vsDmg 16
  vs horda** (druhý lovec hordy vedle aldara).
- gryk:3 Houževnatá kazajka — „Hlodá železo": regen 35 → **vsDmg 8
  vs durgar** (drží designovou hranu gryk > durgar proti durgarovu cauteru).
- sarn:0 Vichrné třmeny — „Nájezdnický trysk": fastReturn 20 → **unitDmg
  cav 10** (identita kavaleristy; fastReturn byla mimoboiová utilita).
- vhorren:3 Rubáš bdění — „Nespící stráž": ward 6 → **ward 12** (tlumí
  velitelské kanály yllien/hordy/brakkara — vrací mu kořist).
- aldar:2 a horda:1 BEZE ZMĚNY.

**Výsledná pavučina (frakční matice, 11 seedů):** bez porážky JEN aldar
(záměr), nikdo bez výhry; kruhy **brakkar > horda > vhorren > brakkar**
a **durgar > vhorren > gryk > durgar**; yllien drží durgara+gryka, sarn
trojici yllien/durgar/gryk. test-rastr.js (41 asercí): tvrdý tvar + 5
designových hran + Edranovo krvácení + PvE pásmo + identita kitů I sigů.

### Pasti v0.34 (nešlapat znovu)
- **strike jako ladicí knob NEfunguje** — je to pre-battle preEv
  (resolveMarch), simulateBattle o něm neví; v rastru je neviditelný.
  Ladit přes followUp/unitDmg/vsDmg/cauter/ward.
- **Plošný shred na sigu rozbíjí okolní páry dřív, než dosáhne na cíl** —
  stackDef ult roste rychleji než plošné −%; na konkrétní matchup je
  správná páka cílený vsDmg, na velitelské kanály ward.
- **stunImmune ≠ lék na Edrana** — jeho dominance nestojí na stunu;
  zato překlopí sarna (Dusot kopyt) a výměna warda za stunImmune ROZBIJE
  vhorrenovu výhru nad yllien (ward kryje proti jejímu roundDmg ultu).
- Kletba „vhorren loví aldara" vyžadovala vsDmg ~60 (6× měřítko hry —
  existující sig vsDmg = 10) a i pak jen mincový +1 → zavrženo; aldar je
  špička ZÁMĚREM uživatele, beta zvedá ostatní.
- Hledač konfigurací: frakce připravit JEDNOU a mutovat SIGNATURE_ITEMS
  za běhu (heroStats čte tabulku živě přes heroSigEff/heroCondEffs) —
  56 párů × 11 seedů bez jediného newGame; ekvivalenci s maticeFrakcni
  ověřit PŘED hledáním (scratchpad hledac-sigu.js).
- Vědomé resty: neutrální matice (maticeMatchupu — přenositelnost kitů)
  je dál šikmá (yllien na neutrálních jednotkách bez výhry) — informativní,
  neasertuje se; těsné hrany vh→yl +2, sa→vh +1, br→sa +1 jsou mincové
  (deterministické seedy je drží, ale obsahově jsou to remízy); sigy
  NE-starterů (16 kusů) se neměnily.
## ODDANOST JAKO POSTUP HRDINY (v0.35, 2026-08-29) — brána stromů ♥3/♥5 + R10 signature

Zadání uživatele: oddanost (respect, ♥ = hvězdy) přestává být jen zdrojem
bodů — R1 (odemčený hrdina) má DVA startovní stromy, ♥3 odemyká třetí,
♥5 čtvrtý a na ♥10 (R10) si hrdina odemyká svůj SIGNATURE kus. Přesně
model předlohy (clustery se štítky ♥3/♥5 u Ugthaka v REFERENCE.md).

**Brána stromů (game.js):** `STAR_UNLOCK_MAIN = [0, 0, 3, 5]` +
`SIG_STARS = 10` (vedle SKILL_UNLOCK_MAIN). `skillUnlocked(hero, skill,
bezOddanosti)` — hlavní dovednost chce ♥ I investované body (obě brány);
větve dál jen rank rodiče (zamčený rodič = zamčené větve implicitně).
`learnSkill` předává `faction.isAI` jako bezOddanosti — **AI dárkovou
ekonomiku nehraje a bránu obchází**; hodnota se NIKDY nebere
z klientských argumentů (server-authoritative, upravený příkaz bránu
neobejde). Kapacita dvou stromů (15+15+4×7 = 58) > max bodů do ♥2 (51)
— body se nikdy nezaseknou bez cíle.

**R10 signature (applyGiftToAccount):** po povýšení na ♥10+ se
jednorázově (acc.sigOdemceno[key]) vyrobí makeSignatureItem(key):
za běžící hry → grantItemToFaction (sync ho uloží — přímý push do
acc.inventory by příští sync PŘEPSAL!), mimo hru → acc.inventory.
Vrací `sig: true` (reveal truhly píše „R10: SIGNATURE KUS ODEMČEN!").
Zdroje sigů: R10 (jistota) + 8 % královská truhla + první dobytí Trůnu
(kopie jsou legální — RtW vzor).

**Signature balíček na startu (přepsáno):** `zajistiSigStartera` dostávají
při initFactions UŽ JEN AI frakce (parita s rastrem — endgame reference
na sigy spoléhá a AI si je nemá jak vydělat). Lidé: žádný balíček
v newGameMulti, pridejClena ani applyAccountToFaction (pojistka
odstraněna) — sig si nosí v inventáři, až ho odemknou.

**Účty:** `TREE_VERSION 2 → 3` — migrace vyčistí stromy a vrátí body
(staré účty mohly mít ranky ve stromech, které brána zamyká; mechanismus
z Auditu 2 vč. zálohy accounts.json a respecNote). Migrace navíc ZPĚTNĚ
grantuje sig hrdinům, kteří už ♥10+ mají (běží mimo živou hru — inventář
je bezpečný). emptyAccount/migrateAccount += `sigOdemceno {}`.
`applyAccountToHero` navíc ODMÍTÁ ranky ve stromech zamčených oddaností
(ručně upravený účet) — zahozené ranky vrací v bodech.

**UI (main.js):** zamčené hlavní uzly nesou štítek **♥3/♥5** místo 🔒
(bodová brána nechává 🔒); karta dovednosti: „Strom odemyká oddanost ♥N —
hrdina má ♥M. Sbírej 🎁 dárky."; ult text zmiňuje ♥5; záložka Unikát:
„Odemyká ho oddanost ♥10 (R10) — hrdina má ♥N."; karta frakce na startu:
„✦ signature: … (odemyká oddanost ♥10)" (dřív tvrdila „se signature
kusem" — balíček hráčů zrušen); reveal dárku umí R10 hlášku.

**Testy:** test-sin sada 10 (13 asercí: brána ♥0/♥3/♥5, AI bypass,
balíček jen AI, R10 grant offline/live/bez duplikace, migrace v3 se
zpětným sigem, pašování ranků přes účet). test-stromy/test-boj scény
mechaniky stromů dostaly `f.isAI = true` (bránu testuje test-sin);
rastr pripravStartera taky (referenční build = endgame parita ♥5+,
matice v0.34 beze změny). test-stromy: assert `treeV === g.TREE_VERSION`
(byl literál 2). Sada 1362 asercí ✅, statistický gate 62/64 ✅,
MP smoke: karta frakce, strom se štítky ♥3/♥5, hinty, Unikát R10,
výbava startera 0/6, konzole čistá.

### Pasti v0.35 (nešlapat znovu)
- bezOddanosti NIKDY neplnit z klientských argumentů — jen faction.isAI
  (dispatch CMDS předává args klienta!).
- R10 grant za běžící hry VŽDY přes grantItemToFaction — přímý push do
  acc.inventory by syncAccountFromFaction (acc.inventory = faction.items)
  při příštím syncu zahodil. Mimo hru je inventář správný cíl.
- Testy mechaniky stromů (učení do 3./4. stromu) potřebují `f.isAI =
  true`, jinak je brána oddanosti zablokuje na ♥0. Novou scénu s learnSkill
  na lidské frakci vždy buď opatřit hvězdami, nebo AI flagem.
- Migrace treeV se NESMÍ pouštět nad živou hrou s retro-grantem do
  inventáře (sync wipe) — běží při loadu serveru/loginu/loadLocalAccount,
  tj. mimo běžící sezónu hráče. Neměnit toto pořadí.
- heroWindowSig už h.stars nese (v0.31) — zámky stromu se po povýšení
  překreslí samy; nový stav do podpisu nepřidávat.
- Vědomé resty: MP host bez účtu nemá dárky → zůstává na dvou stromech
  celou sezónu (konzistentní s tím, že nemá ani nasazování hrdinů —
  motivace k registraci); AI obchází i bodovou složku ne — bodová brána
  pro AI platí dál (jen ♥ ne); sig z R10 může duplikovat truhlu/Trůn
  (kopie jsou vzor předlohy).
## UX: OSLAVA ODEMČENÍ + TVRDÝ STROP VSTUPŮ (v0.36, 2026-08-29)

Dvě zadání uživatele, čistě klientské (main.js + style.css — stačí reload).

**Oslavy odemčení (hrdina + R10 signature):** zvací list z truhly i
dárkové odemčení („máš nového hrdinu") a od v0.36.1 i **R10 — oddanost
♥10 odemkla signature kus** — vyvolají slavnostní okno
`#hero-unlock-overlay`: rotující zlaté paprsky (repeating-conic-gradient
+ mask), stoupající jiskry ✦, kruhový portrét s pulzujícím glow v barvě
TIERU (`--hu-barva`; sig varianta má v kruhu IKONU KUSU `.hu-item`
v legendární zlaté a v popisu pasivku přes effLine), jméno (Cinzel), rod
v barvě frakce, čipy, hint (Síň hrdinů / „nasaď mu ho ve Výbavě" dle
stavu hry), fanfára sfx „levelup". Zavření VÝHRADNĚ křížkem `.hu-x`
v rohu (zadání uživatele) — klik na pozadí ani do okna nezavírá, křížek
vkládá oslavaOverlay do každé varianty sám. Architektura:
`oslavaFronta` = položky {typ: "hrdina"|"sig", key}; `spustOslavu`
dispatchuje na showHeroUnlockCelebration / showSigUnlockCelebration
(obě plní sdílený `oslavaOverlay`, zavření = `dalsiOslava` → další
z fronty). Zdroje: showChestReveal (invite + gift unlocky + gift.sig;
hrdinové před kusy; start po ~0,8 s) a DENNÍ OBCHOD — shopBuyAction
(sólo) i onShopResult (MP) volají `oslavyZVysledku(res.vysledek)`
(běžící okno nepřepisuje — zařadí do fronty). Duplicitní list
(inviteDup) neslaví. CSS na konci style.css (z-index 400, color-mix).

**Tvrdý strop vstupů jednotek:** `clampUnitInput(prefix, changedEl,
budget, vahaFn)` + `clampAllUnitInputs` — právě změněné pole se OŘÍZNE,
ať vážený součet (velení v CP; výspa v kusech) nepřeleze rozpočet;
zbytek nastavení hráče se drží. Dřív šlo napsat víc, než hrdina uveze,
a klik tiše selhal (v MP bez hlášky — NET_CMDS je optimistický). Zapojeno:
- formulář pochodu („march"): rozpočet = volné velení vybraného hrdiny
  (heroArmyCap − heroArmyCommitted); změna hrdiny přeořeže všechna pole
  (clampAllUnitInputs v syncInputs); ETA řádek nově ukazuje „velení X/Y"
  + „✂ oříznuto — víc hrdina neuveze" a při přesahu (edge) ZAMYKÁ
  #btn-march s třídou warn;
- posily („reinforce"): ořez + měření OPRAVENO z kusů na CP (armyCp —
  sarn váží 2 body/kus, srovnání armyTotal > room bylo pro sarn špatně);
- kolo („tmfill"): ořez na volné velení (v poli) / strop hrdiny (doma);
- výspa („op"): ořez v KUSECH na volnou kapacitu (vahaFn = 1).

## EKONOMIKA BEZ ŽOLDU A HOTOVÁ STARTOVNÍ ARMÁDA (v0.53, 2026-08-30)

Tři zadání uživatele, všechna měřená proti sim gate:

**Každý začíná s HOTOVOU armádou** — `START_CP` = 3 000 CP základní jednotky
a 1 500 CP druhé (celkem 4 500 CP). Dřív to bylo 20 pěšáků, tedy prakticky nic:
hráč musel nejdřív dlouho verbovat, než mohl na první pole. Počítá se v BODECH
VELENÍ, ne v kusech — sarn (2 CP za kus) tak dostane poloviční počet kusů za
stejné velení, ne dvojnásobnou armádu.

**Armáda nežere jídlo.** Odečet `armyUpkeep` v tiku, hladovění, dezerce
i pole `starving` jsou pryč. Brzdou velikosti armády zůstává STROP VELENÍ
hrdiny, ne ekonomika. `armyUpkeep()` vrací 0 a zůstal jen jako jedno místo,
kde je to vidět; frakční mod `upkeep` u vhorrena tím ztratil smysl.

**Pochod nestojí zlato** (`MARCH_GOLD_PER_UNIT = 0`). Zlato zůstává na stavby,
vylepšení a denní obchod.

**Ověřeno:** startovní příjem jídla je 17,5/tik, takže 4 500 CP by se uživilo
i se starým žoldem (8,1/tik) — zrušení tedy nezachraňuje rozbitou ekonomiku,
je to zjednodušení. Sim gate se po všech třech změnách **zlepšil na 63/64
(98 %)** z 61/64.

**PASTI:**
- **Podmínka verbování v AI se dívala na `foodNet`** — bez žoldu je vždy
  kladný, takže se zjednodušila na strop zásoby. Kdo tam bude sahat, ať neřeší
  jídlo, které neexistuje.
- **`starving` zmizelo ze snímků** — starší snímek sezóny ho ještě nese,
  ale nikdo ho nečte.

## ETAPA 7 — ROZPRACOVANÁ (v0.53, 2026-08-30)

### Řetěz bitev o stoh hrdinů (IV-L)
Na jednom poli smí stát víc hrdinů téže frakce — to šlo i dřív. Nově se ale
takový stoh brání **řetězem jednotlivých bitev**: útok porazí VŽDY JEN JEDNU
armádu, poražený obránce se stáhne a **ostatní brání dál**. Dobýt pole se
200 hrdiny tedy znamená 200 úspěšných zátahů.

- Bije se ten, kdo na poli stojí NEJDÉLE (pořadí z etapy 6, `h.prisel`).
- **Poslední obránce bojuje SPOLU s posádkou pole** a teprve jeho porážka pole
  vydá — takže N obránců = N zátahů, ne N+1.
- Dokud stoh trvá, bojuje jen armáda jednoho obránce: posádka, výspy ani
  domácí zásoba se do dílčích bitev nepočítají (jinak by se odbojovaly N×).
- Vítězství bez záboru jede **TOUŽ větví jako velké stavby** — útočník se
  utáboří na výchozím poli a náběh opakuje. Jeden mechanismus, tři použití
  (keep, grandfort, hráčský stoh).

**U CIZÍHO stohu je vidět POČET armád, ne jejich síla** — panel píše
„🛡 Armád na poli: 5 · sílu odsud nepoznáš". Velký stoh nemusí být silný;
blafování slabými hrdiny je záměr (prázdnými ne — na to je práh 100 CP
z etapy 6). U vlastních polí se dál vidí všechno.

**PASTI:**
- **`retreatHeroFrom` stahuje z pole VŠECHNY hrdiny** — v řetězu se smí
  stáhnout jen poražený, proto `retreatJednoho`.
- **`comp.army` se u stohu PŘEPISUJE na armádu jednoho obránce**, včetně
  vyprázdnění `outposts` a `homeFaction`. Kdo bude číst `comp` po tomhle
  bodě, dostane vlnu, ne celé pole — `tileDefense` pro UI se počítá zvlášť.
- **`stohBoj` se pozná z `tile.owner`, ne z `own`** — `own` je proměnná
  `startMarch`, v `resolveMarch` neexistuje.
- Zbývá z IV-L: neutrálové jako hrdinové vybavení podle tieru, nedotknutelná
  startovní zóna, okno zranění a rally obrazovka.

### Nedotknutelná kolébka (IV-K, rozhodnutí uživatele 30. 8. 2026)

Výseč každého rodu se dělí na dvě radiální zóny:
- **kolébka** (`kolebka-N`) — dál od středu, stojí v ní kapitál,
- **expanze** (`expanze-N`) — blíž ke středu, sporný pás.

**Cizí rod do kolébky nevstoupí NIKDY** — ani s vyhlášenou válkou, ani ve fázi
4. Je to tvrdý zámek v `startMarch`, ne fázová brána. Rod se tím nedá vymazat
z mapy a **tlak se přesouvá na CROSSING**: kdo někoho porazil, musí jeho
crossing z kolébky držet, jinak se poražený vyleje zpátky ven.

**Dělič se měří MANHATTANEM** (`kolebkaR() = round(1,75 × OUTER_R)` → 28 na
69×69; kapitál je na 32). Škáluje se s velikostí mapy jako ostatní poloměry.

⚠ **Metrika je volba, ne detail.** Osmiúhelníkový `distLvl` by dal hezčí tvar,
ale jeho vrstevnice nemíří v žádném ze čtyř směrů, které umí modely řek —
prstencová řeka na děliči by neměla model. Manhattanovské vrstevnice jsou
kosočtverce se stranami podél (1,1) a (1,−1), tedy přesně směry „a" a „b".
(Mezikrok s distLvl 22 v repu byl a měřením se ukázal jako HORŠÍ i obsahově.)

**Kolébka je velká POČTEM POLÍ, ale prázdná HODNOTOU — a to je v pořádku.**
Naměřeno na 69×69 (výseč 549 polí, váha = Σ úroveň²): za kapitály leží průměrná
úroveň 1,8 a žádné město, kdežto mezi prstencem a kapitálem je půda úrovně 5,1.
Dělič 28 nechá kolébce 405 polí, ale jen 1 780 váhy a jedno město — **67 %
hodnoty výseče zůstane ve sporném pásu** (140 polí, váha 3 536, dvě města).

### Laterální crossingy v expanzním pásu
Do v0.53 ležel KAŽDÝ z osmi přechodů mezi výsečemi v kolébce (distLvl 24,5–25).
Most se dal vzít, ale za ním byla nedotknutelná zóna — **laterální PvP nešlo
vůbec**. Poloměry se proto odvozují ze stropu expanze:
- úhlopříčné se posunuly z břehů (17,15)/(15,17) na **(14,12)/(12,14)**,
- osové zůstaly na **q = 24** (ty v kolébce nebyly).

Ověřeno: všech 16 břehů má za sebou útočitelnou půdu a všech 8 dvojic spojuje
DVĚ RŮZNÉ výseče.

**DŮSLEDKY (všechny ověřené testem):**
- **Kapitál se nedá dobýt.** `resettleFaction` už cizí útok nespustí. Mechanika
  žije dál pro města ČLENŮ (ta můžou stát v expanzní zóně) a jako pojistka.
- **Neutrální pole v cizí kolébce je taky nedotknutelné** — kolébka je
  exkluzivní PvE farma svého rodu. Raná hra je tím PvE, střední laterální PvP.
- **AI jede vlastní drahou** kolébka → expanze → mezikruží → vnitřek; sim gate
  drží 63/64.

**PAST PRO TESTY:** každá scéna, která na něco útočí, musí mít cíl v EXPANZNÍ
zóně (nebo ve vlastní kolébce). Šest sad na tom po zavedení pravidla spadlo —
včetně scén s NEUTRÁLNÍMI uzly, protože i ty můžou ležet v cizí kolébce.

**Testy:** `tests/test-etapa7.js` (28 asercí) ve `vse.js` — tři obránci = tři
zátahy, jediný obránce beze změny, poslední bojuje i s posádkou pole.

**ROZHODNUTO (uživatel, 30. 8. 2026):** kapitál zůstává nedotknutelný. Rod se
nedá vyhnat z domova a tlak se přesouvá na CROSSING, který musí vítěz držet.
Viz „Nedotknutelná kolébka" výš.

## ETAPA 6 — HOTOVÁ (v0.52, 2026-08-30)

Hotové **IV-N** (přední a zadní linie), **IV-M** (měřítko velení, práh obrany,
vlajkové jednotky T4 se schopnostmi, tři formace), **IV-O** (budovy pro dlouhou
sezónu, druhý rod) a **IV-H** (tier jako osa síly, rys healer, reset sezóny).
Kotvy jsou přeměřené a `PREMERUJE_SE` je vypnuté.

Etapa 6 je uzavřená celá. Do etapy 7 z ní přechází jediná vědomě odložená
věc: sekvenční boj „jedna bitva = jeden obránce" (IV-L), který patří ke
stohování hrdinů, ústupu poraženého na výspu a rally obrazovce.

### Přední a zadní linie (IV-N)
Každá jednotka má **`rada`**: `clona` (pěchota a velké), `strelec`, `jizda`;
výchozí hodnoty dle slotu drží `RADA_VYCHOZI`. V `simulateBattle`:
- `dosahne(S, E, attKey, cilKey)` — na střelce se nedosáhne, dokud před nimi
  stojí živá clona. Velitel (`attKey === null`) dosáhne vždy.
- **Jízda clonu OBCHÁZÍ, když je proti ní tenká**: projde, když
  `clonaCp < PROLOM_POMER × útočícíCP`. Měří se v **CP, ne v kusech** —
  velká jízda má při stejném velení 25× méně těl a podle počtu by Bělovlas
  clonu neprorazil nikdy, tedy sarnská vlajka by bojovala proti mechanice
  vlastního rodu.
- `PROLOM_POMER` je ladicí knob (`setProlomPomer`) — teprve se přeměřuje.

### Měřítko velení: REBASE CELÉ EKONOMIKY, ne knob
Velení na úrovni 50 vzrostlo z 935 na ~5 200 CP. **Škáluje se CELÁ KŘIVKA
×5,5615** (`HERO_CAP_BASE` 200→**1112**, `HERO_CAP_PER_LEVEL` 15→**83**),
ne jen její vrchol.

⚠ **Plán píše „základ 200 CP + 100 CP za úroveň" — to ale mění TVAR křivky,
ne měřítko** (úr. 1 by byla ×1,5, úr. 50 ×5,56), zatímco posádky vzrostly
×5,56 na KAŽDÉM stupni. Hrdina na nízké úrovni je tím proti poli relativně
3,7× slabší. **Změřeno na simu 8 seedů:** se strmou křivkou drží svět
**420 polí** a gate padá na 88 %, s plochou **539** (před rebase 519)
a gate dává **64/64**. Držíme se principu plánu („buď se všechno přepočítá
5,5×") proti jeho liteře; cílové číslo 5 200 zůstává (5 179).

Přeškálováno stejným poměrem: `TIER_GARRISON`, `militia` všech staveb,
`SIEGE_HP`, `UPKEEP_PER_UNIT`, `OUTPOST_CAP`, `SIEGE_MIN_ARMY`,
`RECRUIT_MAX_ORDER`, `ringCap`, `MARCH_GOLD_PER_UNIT`, převodníky
`HERO_DMG_SCALE` a `HERO_DMG_SHARE` a **dvanáct prahů v `aiTurn`**.

**Obtížnost se nezměnila** — dobytí světa stálo před i po rebase **246 útoků**
a kotvy dobývání vyšly ⚔300 → 436 (dřív 439), ⚔90 → 124 (121), ⚔30 → 61 (57).

**PASTI (každá stála jeden běh gate):**
- **`cost` v tabulkách jednotek je cena DÁVKY, ne kusu.** První pokus ceny
  vydělil měřítkem — armády zlevnily, ale výroba zůstala 10 kusů na dávku,
  takže byla 5,56× pomalá a gate spadl z 97 % na **19 %**. Správně je ceny
  vrátit a zvětšit **`RECRUIT_BATCH` 10 → 56**.
- **`MARCH_GOLD_PER_UNIT` se platí za KUS** (0,3 → 0,0539). Bez toho žold
  sežral AI zlato a gate zůstal na 78 %.
- **Prahy v `aiTurn` měří armádu v CP.** První průchod přeškáloval šest,
  druhých šest ne — nejdražší byl náklad hrdiny stěhujícího se na výspu blíž
  k Trůnu (`Math.min(400, …)`, tedy 400 CP z 5 200). Doplnění zvedlo gate
  z 88 % na 92 %.
- **Poškození hrdiny škáluj PŘEVODNÍKY, ne zobrazenými staty** — `HERO_DMG_SCALE`
  6 → 33 a `HERO_DMG_SHARE` 0,03 → 0,0054. Kdyby se hýbalo statem `dmg`,
  rozsypou se poměry výbavy, hvězd i dovedností.

### Práh obrany 100 CP (IV-M)
`OBRANA_MIN_CP = 100`, `braniStoh(a, h)`. Hrdina se do obranného stohu počítá,
jen když veze aspoň 100 CP — **prázdný batoh byl do etapy 6 nejlevnější zeď ve
hře** (dal poli staty velitele, první úder i `holdDef` zadarmo). Práh je v CP,
takže 100 pěšáků a 50 sarnských jezdců váží stejně. Platí ve `tileDefComponents`,
u prvního úderu obránců i u výběru velitele obrany (duel).
Vědomý rest: **aura hrdiny ze sousedního pole práh NEMÁ** — je to výslovně
mechanika okolí, ne stohu.

### Vlajkové jednotky T4 a TŘI FORMACE
Čtvrtý druh jednotky `big` — jedna ikonická vlajka na rod. **Formace zůstávají
tři** (rozhodnutí uživatele 30. 8.): armáda je pořád mapa druh→počet, ale smí
mít nejvýš `FORMACI_MAX` = 3 nenulových druhů. Hráč si tedy vybírá SLOŽENÍ:
v UI vidí zásobník vycvičených jednotek a přetáhne (nebo klepne) je do tří slotů.

**Proč zrovna takhle:** roster může růst donekonečna (T4, později T5, žoldnéři,
druhý rod z IV-O) a bitva zůstane o třech formacích. Trojúhelník převah proto
NENÍ na slotu, ale na **DRUHU** (`counters` míří na klíč jednotky), takže platí,
ať si hráč jednotku strčí do kteréhokoli slotu.

**Staty se nepíšou ručně** — `velkaJednotka(fkey, cfg)` je odvozuje z jednotky
téhož rodu ve stejné roli (`zaklad`), takže si vlajka nese jeho povahu
(durgarský trol vyrůstá z tvrdší pěchoty než yllienský ent) a nemůže se rozejít
s laděním T1–T3. Profil je **„výdrž, ne výstup"**: `VELKA_VYDRZ` 1,15 životů
a `VELKA_VYSTUP` 0,45 poškození **na bod velení** proti základní jednotce,
cena `VELKA_CENA` 1,3× na CP a `trainMult` 2× delší výcvik.

| rod | vlajka | CP | role | zvláštnost |
|---|---|---|---|---|
| aldar | 🦅 Jezdci na gryfech | 25 | střelec | iniciativa 10 — jedná dřív než jízda |
| yllien | 🌳 Enti | 25 | clona | nejtvrdší clona (výdrž 1,3), skoro se nehýbou |
| durgar | 🧌 Trolové | 25 | clona | kanonický profil velké jednotky |
| brakkar | 🛡 Železná garda | 2 | clona | levná vlajka, výdrž 1,35 |
| sarn | 🏇 Bělovlasi | 25 | jízda | `ini` 999 → první ze VŠECH formací (velitelé mají 1000+) |
| horda | 👿 Démoní princové | 100 | clona | jediná výjimka z „výdrž, ne výstup" (výstup 0,9) |
| vhorren | 🔮 Nekromanti | 4 | střelec | magické poškození (obchází útok i obranu) |
| gryk | 👹 Váleční náčelníci | 25 | clona | těžká clona roje |

Odemyká je **kasárna úrovně 4** (`max` 3 → 4, `unitUnlocked`).

**PASTI:**
- **Odvozovat staty „na kus" je špatně, musí se NA BOD VELENÍ.** Sarnská jízda
  stojí 2 CP, takže odvození na kus dalo Bělovlasovi dvojnásobek proti ostatním
  rodům (`naCp = z.cp || 1`).
- **`balancedArmy` dál dělí posádku na TŘI díly, ne na počet `UNIT_KEYS`** —
  domobrana a neutrálové vlajku nemají. Jinak by se posílili sami od sebe
  a celá křivka dobývání by se posunula.
- **Armády z verzí před v0.52 mají jen tři klíče** — uložené sezóny, snímky ze
  staršího serveru, presety na účtech. Aritmetika je proto snese (`|| 0`)
  a `normalizujArmady(G)` je doplní při obnově sezóny (`sezona.js`) i po
  snímku (`net.js`). Bez toho vyleze z chybějícího slotu NaN a pochod se
  zasekne na věčné `ticksLeft`.
- **Posily můžou hrdinovi překročit tři formace** (konvoj se mu po dojezdu
  slije do armády), takže se v `startReinforce` počítá SOUČET armády hrdiny,
  konvojů na cestě a nových posil — a **UI to musí říct dopředu**, jinak klik
  tiše selže (panel i kolo na mapě mají varování a zamknou tlačítko).
- **Obranný stoh na poli může mít víc než tři formace** — je to součet
  domobrany, hrdinů a výsep, ne jedna sestava. Vědomé: „tři formace veze
  hrdina, pole brání všechno, co na něm stojí."
- **Stav slotů žije MIMO DOM** (`formaceSlotu`, stejný důvod jako `recruitOrder`
  ve v0.18) a po změně se volá `formaceObnov[prefix]`, což překreslí celý
  okolní panel i s bindingem. Ovládání slotů je **delegované na dokumentu**
  a zakládá se JEDNOU — v render funkci by se posluchače vrstvily (viz slider
  rodů v0.49), na prvcích widgetu by se ztrácely.
- **HTML5 drag & drop na dotyku nefunguje**, proto vede do slotu i cesta
  klepnutím (obsadí první volný slot, jinak nahradí poslední).

### Formace v bojovém reportu
S liniemi z IV-N přestalo stačit „obránce ztratil 300 jednotek". Report nově
ukazuje **sestavy obou stran** s rolí každé formace (clona / střelci / jízda),
**střety formací** — kdo na koho v bitvě mířil a za kolik poškození — a
u každého kola **rozpad zbytku po formacích**, takže je vidět, která linie se
hroutí. Když straně chybí clona a má střelce, report to řekne rovnou.

`simulateBattle` k tomu sbírá `strety`: `[{ s, k, c, d, vl }]` = strana,
útočící druh (`null` = velitel), cílový druh, poškození, a `vl` u formace
obrácené šílenstvím na vlastní řady. **Sčítá se za CELOU bitvu, ne po kolech** —
report jde hráčovou schránkou i snímkem sezóny a po kolech by ztrojnásobil
jeho velikost.

⚠ Reporty vzniklé před v0.52 `strety` nemají — vykreslení je proto přeskočí,
nespadne. Ikony a jména jednotek se čtou přes `unitsOf(rep.att.fkey)`; neutrál
žádný `fkey` nemá a spadne na základní `UNIT_TYPES` (proto `repUd` s fallbackem).

### Velikost světa podle počtu hráčů
Kapacita sezóny se do v0.52 měřila tím, kolik se do výseče vejde **měst 3×3**
(69×69 → 30 na frakci). Jenže město je ta VOLNĚJŠÍ podmínka — naměřeno:

| svět | výseč frakce | měst/frakci | **polí na hráče** |
|---|---|---|---|
| 69×69 | 558 | 30 | **18** |
| 111×111 | 1 414 | 100 | **14** |
| 221×221 | 5 460 | 448 | **12** |

Strop území přitom slibuje **80 polí na hráče** (`STROP_BASE`) a roste na 216.
Hráč tedy měl nárok na 80 a v celé své výseči jich na něj vycházelo 18 —
a **zvětšení mapy to nespravilo**, protože města se pakují pořád stejně hustě.

Kapacita se proto počítá ze ZEMĚ: `hracuNaFrakci(R)` = `0,110 × plocha /
CIL_POLI_NA_HRACE`. Podíl 0,110 je naměřená velikost jedné výseče vůči světu
(0,1114–0,1172 na R 34–130, bere se spodek, ať se kapacita spíš podcení).

**Svět se šije na míru davu.** Bez pevného argumentu vybere `zacniSezonu`
nejmenší mapu, na které dostane každý hráč nejnabitější frakce svých 80 polí
(`velikostProPocet`). Padesát lidí tak hraje na 69×69, osm set na 271×271.
Čtvrtý argument serveru (`node server/server.js 8123 336 55`) zůstává jako
pevné určení — pak se nic nevybírá a strop přihlášek je kapacita té mapy.

| lidí | na frakci | svět |
|---|---|---|
| 48 | 6 | 69×69 |
| 100 | 13 | 99×99 |
| 240 | 30 | 149×149 |
| 400 | 50 | 191×191 |
| 800 | 100 | 271×271 |

`MAP_R_MAX` = 135 (271×271 = přesně 800 hráčů): naměřeno **451 ms generování,
76 ms na tik** (rozpočet 1000) a **snímek sezóny 0,68 MB**. Procesor tedy není
překážka — **výš už brzdí SÍŤ**: plný snapshot 1×/60 tiků roste s plochou a nad
~R 110 chce AOI filtr (posílat jen okolí hráče), odložený jako vědomý rest
v etapě 4d.

**PASTI:**
- **Měření nanečisto (`pridejClena` ve smyčce) je pryč** — bylo ~6× optimistické
  a na velkých mapách trvalo desítky sekund při startu serveru.
- **`setMapRadius` musí proběhnout PŘED `newGameMulti`** — geometrie stojí dřív
  než generátor.
- Rozehraná sezóna si velikost bere ZE SNÍMKU (v0.46), takže restart serveru
  mapu nepřevelikostní.

### Schopnosti vlajek (IV-M)
Schopnost je pole na definici jednotky, ne nový systém — generátor je jen
propouští (`taunt`, `tauntDef`, `lifesteal`, `aura`, `zlato`, `konverze`).

| rod | schopnost | co dělá |
|---|---|---|
| durgar 🧌 / yllien 🌳 | `taunt` 3 kola, `tauntDef` 0,15 / 0,20 | 3 kola drží na sobě pozornost všeho, co není střelec, a schytává o 15/20 % míň |
| horda 👿 | `lifesteal` 0,30 + `aura` 25 | léčí se z uděleného poškození; šílenství na každou formaci slabší (v CP) — **i vlastní** |
| gryk 👹 | `zlato` +1 % / 1 500 zl., strop +40 % | síla roste s pokladnicí rodu |
| vhorren 🔮 | `konverze` 0,35 | pobití vstávají v jeho řadách do konce bitvy |
| sarn 🏇 | `ini` 999 | jedná první ze všech formací (velitelé mají 1000+) |
| aldar 🦅 | `rada` střelec + `ini` 10 | jediný střelec, který jedná dřív než jízda |

**Taunt — naměřeno na přejezdu 2,7× přesily** (dobyto / ztráty útočníka):

| | obrana 0 % | 15 % | 25 % |
|---|---|---|---|
| bez tauntu | 24/24 · 281 | — | — |
| taunt 2 kola | 24/24 · 583 | 24/24 · 594 | 24/24 · 655 |
| taunt 3 kola | 24/24 · 782 | **24/24 · 828** | **0/24 · 860** ← útes |

⚠ **`taunt 3 + obrana 25 %` pole ubrání VŽDY** — ne proto, že by to byl silný
efekt, ale protože bitva narazí na `ROUND_CAP` (10 kol) a nedokončený útok se
počítá za odražený. Jeden stupeň obranného bonusu překlopí „vždy dobyto" na
„nikdy". Proto je bonus nízko: trol má dobývání **zdražit 2,9×**, ne ho
zastavit. Ve vyrovnaném střetu taunt skoro nic nemění (769 → 805 ztrát) —
je to daň za přejezd, ne páka na remízy.

**Konverze je ZÁMĚRNĚ jen na bitvu.** Vzkříšení do konce bitvy bojují (dvojí
švih: nepříteli ubudou a nám přibudou, naměřeno **+51 % ztrát obránce**), ale
domů se nevrátí — přeživší se na OBOU stranách ořezávají na výchozí stav
(`remA` přes `Math.min(initA)`, obránce přes `defFrac ≤ 1`). Bez toho by
vhorren snowballoval a navíc už jednu posmrtnou odměnu má (Kostěné řady
vracejí 25 % vlastních padlých po výhře). Přepočítává se přes VELENÍ, jinak by
převod levných těl vyráběl drahé mágy zadarmo.

**Aura Demon Prince vychází z JEDNOTKY, ne z velitele, a dopadá na OBĚ strany.**
Každá formace, jejíž velení je nižší než velení nasazených princů, se může
každé kolo obrátit proti svým. Naměřeno: 13× vlastních formací hordy a 14×
nepřátelských za 16 bitev. Důsledek, který z toho vypadl sám: **armáda princů
chce být skoro celá z princů**, protože doprovod je vždycky pod prahem a šílí.
Formace, která auru sama nese, je vůči ní imunní.

**PASTI:**
- **`S.madness` je od v0.52 MNOŽINA, ne jeden klíč.** Aura obrací víc formací
  naráz; kdo čte šílenství, musí použít `.has(k)`.
- **`pickTarget` a `formRed` jsou definované NAD smyčkou kol**, takže na číslo
  kola nedosáhnou parametrem — čtou sdílené `kolo`, které se nastavuje na
  začátku každého kola. Kdo přidá další efekt s oknem, musí to vědět.
- **Taunt míří jen na mellee** (`rada !== "strelec"`). Kdyby dráždil i střelce,
  byl by striktně lepší než clona a pravidla linií by ztratila smysl.
- **Měř schopnosti A/B na TÉŽE scéně** (vypnout pole, změřit, zapnout, změřit).
  První měření porovnávalo různé armády se stejným velením a vyšlo obráceně,
  než jak se efekt chová.
- **Strop kol je v měření vidět jako útes**, ne jako plynulý efekt — u každého
  obranného bonusu kontroluj, jestli útok ještě někdy projde.

### AI a vlajky
Bez zásahu by AI vlajku nikdy nepostavila — `AI_BUILD_ORDER` končil na kasárnách 3
a T4 by se v PvE vůbec neobjevily. Doplněno `["barracks", 4]` hned za hlavní
budovu 4 (dřív ji stavět nejde, budova nesmí přerůst hlavní).

`aiTrio(f)` drží AI na TŘECH druzích: vlajka **nahradí základní jednotku své
role** (durgarští trolové jsou clona → místo pěchoty, aldarští gryfové střelec →
místo lučištníků, sarnský Bělovlas jízda → místo jízdy). `aiSlice` bere pořád tři
nejsilnější druhy ZE ZÁSOBY, takže se zbytky po přepnutí dojedou v boji
a nezůstanou ležet a žrát žold.

**PASTI:**
- **AI verbuje v BODECH VELENÍ, ne po dávkách.** Dávka je 56 kusů — u pěchoty
  56 CP, ale u vlajky za 25 CP hned 1 400 CP naráz a AI si na ni nenašetřila:
  tři rody z osmi vlajku nepostavily vůbec. Po přepočtu na `RECRUIT_BATCH / cp`
  (tedy ~2 troly na objednávku) ji staví skoro všechny.
- **Vyvažuje se podle VELENÍ, ne podle počtu kusů** — jinak je vlajka vždycky
  „ta, které mám nejmíň", a AI by stavěla jen ji.
- **Verbování AI má DVA tiché prahy**: neverbuje s armádou nad 4 449 kusů ani
  když ji neuživí jídlem. Test, který AI nastrčí velkou zásobu, oba zavře
  a vypadá to, že je rozbité verbování.

### Budovy pro dlouhou sezónu a druhý rod (IV-O)

**Doby stavby jsou PODÍL SEZÓNY, ne pevné vteřiny.** Čísla v `BUILDINGS.time`
zůstala baseline pro hodinovou sezónu (`SEZONA_BASELINE` 3 600 tiků) a
`buildTicks()` je škáluje vůči `SEASON_TICKS` — u čtrnáctidenní sezóny se
roztáhnou 336×, takže strom budov pokrývá celou sezónu místo prvních minut.
Konvence projektu: každý nový knob škáluj vůči `setSeasonHours`.

| hlavní budova | 1h sezóna | 24h | 336h |
|---|---|---|---|
| úroveň 2 | 30 s | 12 min | 2,8 h |
| úroveň 8 | 5 min | 2,1 h | 30 h |

**Hlavní budova má 8 úrovní** (dřív 5) s cenami pokračujícími v křivce.
**Akademie dává +100 velení za úroveň** (dřív +1): po rebase velení na ~5 200 CP
znamenalo starých deset úrovní +10 CP, tedy 0,2 % — mrtvá budova. Nově
+1 000 CP = **+19 % ke stropu**, a tomu odpovídají i ceny (×2,5).

**Druhý rod:** na 8. úrovni hlavní budovy si hráč **jednou za sezónu** vybere
spřátelený rod své STRANY a smí verbovat jeho ZÁKLADNÍ jednotky — cizí vlajku
ne, ta je duše rodu. Volba je nevratná (v UI proto potvrzení druhým klikem,
vzor vyhlášení války).

Klíče jsou vlastní: `UNIT_KEYS` = `inf, arch, cav, big, inf2, arch2, cav2`.
Musí být vlastní, aby šla **cizí clona postavit PŘED vlastní střelce** — což je
přesně ta hodnota, kterou plán od druhého rodu chtěl. Pravidlo tří formací platí
dál, takže roster sedmi druhů pořád znamená bitvu o třech liniích a UI skládání
armády (zásobník + tři sloty) to unese beze změny.

`unitsOf(f, druhy)` skládá tabulku obou rodů do KEŠE (`uDef` jede v horkých
smyčkách boje; klíč keše je dvojice rodů). Naměřeno: sedm klíčů místo čtyř
nestálo nic — tik 12,7 → 12,8 ms na světě 111×111.

**PASTI:**
- **`uDef` musí vracet něco i pro klíč, který frakce nemá.** Smyčky přes
  `UNIT_KEYS` jsou po celém enginu a `undefined.cp` je shodí — proto
  `PRAZDNA_JEDNOTKA`. Do armády se nikdy nedostane, `unitUnlocked` ji nepustí.
- **Trojúhelník převah, role linií i protibonusy se dívají na DRUH, ne na
  klíč** (`zakladniDruh`): „cav2" je pořád jízda, takže ji pěchota poráží
  a jízdou obchází clonu. Bez toho by půjčené jednotky vypadly z counterů.
- **`counters` pojmenovává DRUH, ne jeden klíč** — `pickTarget` hledá kterýkoli
  klíč toho druhu, ať jde o vlastní jízdu, nebo o půjčenou.
- **Report musí nést `druhyRod` obou stran**, jinak se půjčené jednotky nedají
  pojmenovat a vypíšou se jako „❔ inf2". `repUd` proto bere celou stranu
  reportu, ne jen `fkey`.
- **Pasivky a vylepšovací budovy půjčených jednotek jsou zapsané pod rodem
  PŮVODU** — `UNIT_PASSIVES[me.key]["inf2"]` je undefined a panel Výcviku na
  tom spadne. Překládá to `pasivkaJednotky` / `budovaJednotky` v main.js.
- **Bez spojenectví se cizí sloty v panelech vůbec nevypisují** (ani jako
  zamčené) — hráč o nich nemá důvod vědět, dokud si spojence nevybere.
- **Balanc míchání dvou rodů se VĚDOMĚ neřeší** (rozhodnutí uživatele 30. 8.):
  rastr je stavěný na osm identit, ne na kombinace. Není to opomenutí, je to
  odložení na provoz.

### Tier jako osa síly, ranhojič, reset sezóny (IV-H)

**Tier je nově osa síly:** `TIER_STAT_BONUS` 0,05 → epický ×1,05, legendární
×1,10 na základní staty. Do etapy 6 ovlivňoval tier VÝHRADNĚ cenu hvězd
a šanci z truhly — legendární hrdina byl jen dražší, ne lepší.

**Sedmý rys `healer`** léčí armádu v průběhu bitvy (`roundHeal` existuje od
v0.28). Každý rod dostal sedmého hrdinu-ranhojiče z knihovního stromu, takže
je jich 8 × 7 = **56** (dřív 48). Vlastní portrét (šátek + bylinný znak)
i figurku na mapě (hůl s bylinným svazkem).

**Legendárka = archetyp rodu**, ne pořád mystik. `HERO_TIER_BY_ROD` dává
každému rodu jeden legendární rys a dva epické; zbytek je běžný (4/2/1).

⚠ **Rys STARTOVNÍHO hrdiny musí zůstat BĚŽNÝ.** Startera dostává hráč zdarma
při první hře s rodem, takže legendárka na jeho rysu by rozdávala zadarmo to,
co jinak stojí ~1 400 truhel. Archetyp se proto hledá MEZI NESTARTOVNÍMI
hrdiny — první pokus dal legendárku všem osmi starterům naráz.

Jméno a ikona daru se odvozují z rodu (`giftTierTrait`), ne z pevné trojice
`GIFT_TIER_TRAIT` — ta platila, dokud byla legendárka vždycky mystik.

**Reset sezóny (`resetSezonyUctu`): SEZÓNNÍ JE SÍLA, TRVALÁ JE SBÍRKA.**
Do etapy 6 přecházela mezi sezónami i ÚROVEŇ — veterán začínal novou sezónu
na třicítce, nový hráč na jedničce. Nově se nuluje úroveň, zkušenosti,
dovednosti a body z úrovní; **hvězdy oddanosti, odemčení hrdinové a výbava
zůstávají**. Body za hvězdy zůstávají taky (jsou součást sbírky), proto se
`skillPts` nastavuje na `hvězdy × STAR_SKILL_POINT`, ne na nulu.

### Přeměření kotev — konec etapy 6
`tests/etapa6.js` má **`PREMERUJE_SE = false`**; přepínač zůstává v repu jako
nástroj pro příští etapu.

**Křivka dobývání** (⚔ stupeň → jednotek): 10 → **15** (dřív 11), 15 → 31,
30 → **61** (57), 90 → **124** (121), 300 → **436** (439). Vysoké stupně se
skoro nehnuly, protože rebase škáloval posádky i velení stejným poměrem;
nejnižší povyskočil, protože tam o výsledku rozhoduje clona a pár kusů navíc.

**Navazující úder se měří jinak.** Kotva „je to plný druhý útok" počítala
kumulativní poškození přes celou bitvu a vyšla na 1,45× — jenže s navazujícím
úderem bitva **skončí dřív** (6 → 4 kola), takže součet efekt podhodnocuje.
Na jednom kole proti obřímu obránci vyjde 198 → 436, tedy **2,2×**.

**Pavučina counterů přeměřená celá.** Tři nálezy, každý změřený:
1. **Parita jednotek se rozjela vinou LINIÍ, ne rebasu** — před rebasem
   i po něm vycházela zrcadla stejně (gryk −7, sarn +7). Gryk („levné
   množství") přišel o svou výhodu, protože clona i průraz jízdou se měří
   v CP, ne v tělech. Doladěno hledačem zpět na ±3 (18 hodnot poškození).
2. **Scéna rastru zestárla s rebasem.** 150 CP na slot bylo 48 % stropu
   hrdiny (935 CP); po rebase na 5 179 to bylo 8,7 % a hrdina scénu válcoval,
   takže kity s poškozením drtily kity s užitkem. `CP_NA_SLOT` je nově **830**.
3. **Durgar ztratil všechny páry** — půlka jeho kitu je `structAtk`, který se
   v duelu bez stavby neprojeví. Jeho signature („Vypálené rány") zesílen
   z cauter 40 na cauter 50 + shred 6; hledač našel nejmírnější kombinaci,
   po které není bez výhry nikdo.

**Výsledný tvar:** bez porážky JEN aldar (rozhodnutí uživatele z v0.34, drží
podmínku, že ve výhrách krvácí ≥ 15 %), **bez výhry nikdo**. Nové kruhy
(okraje 9–11 z 11 seedů): **durgar > brakkar > gryk > durgar** a
**yllien > vhorren > brakkar > yllien**. Kruhy z v0.34 padly — přesně jak plán
u linií předpokládal.

**PASTI:**
- **Kotvy křivky dobývání jsou ve DVOU sadách** (test-boj sada 8, test-stromy
  sada 5) a musí se měnit společně.
- **Testy nesmí mít velikost armády napevno.** Test Edranova krvácení dělil
  napevno psanými 450 kusy a po přeškálování scény hlásil −288% ztráty.
- **Kdo hardcoduje index legendárního hrdiny (`aldar:5`), rozbije se**, jakmile
  se archetyp změní — v testech se index odvozuje z `heroTierOf`.
- **Verbování AI má dva tiché prahy** (obří armáda, hlad); test, který AI
  nastrčí velkou zásobu, oba zavře a vypadá to, že je rozbité verbování.

### Pořadí obránců (IV-M)

**Neutrální objektiv se brání OD NEJSLABŠÍHO** — obtížnost roste a poslední
bitva je boss (čistá PvE křivka). U dvouarmádových cílů (uzly 2×2 a mostní
břehy) neurčuje pořadí velitelů salt, ale jejich SÍLA (`neutralPoradi`,
`neutralSila`), a první vlna je i početně menší: `NEUTRAL_VLNY` = **0,4 / 0,6**
posádky. Součet zůstává celá posádka, takže se cena dobytí nemění — mění se
jen tvar střetu.

**Hráčský stoh: obranu vede ten, kdo na poli stojí NEJDÉLE.** Hrdina si nově
pamatuje tik příchodu (`h.prisel`, nastavuje ho `postavHrdinu`); velitelem
obrany je hrdina s nejmenším `prisel`, při shodě silnější (ať je výběr
deterministický). Dřív velel nejsilnější — posila poslaná vteřinu před útokem
tak převzala velení celé obraně.

Panel pole to ukazuje: u neutrálního objektivu obě vlny v pořadí, v jakém
přijdou; u vlastního pole se dvěma a více obránci řádek **🛡 Pořadí obrany**.

⚠ **Sekvenční boj „jedna bitva = jeden obránce" tohle NENÍ** — to je IV-L
a patří do ETAPY 7 spolu se stohováním hrdinů, ústupem poraženého na výspu
a rally obrazovkou. Etapa 6 řeší jen POŘADÍ; stoh dál bojuje jako jedna
armáda pod jedním velitelem.

**PASTI:**
- **`h.pos` se přiřazuje na deseti místech** — všechna jdou přes
  `postavHrdinu`, jinak by hrdina přišel o tik příchodu a pořadí by se
  rozpadlo. Kdo přidá jedenácté místo, musí použít helper.
- **Setrvání na poli tik příchodu NEMĚNÍ** (`if (h.pos !== key)`), jinak by
  se pořadí přepisovalo při každém dotyku.
- **Test útoku potřebuje útočníkovi ZÁKLADNU v dosahu** — bez usazené výspy
  `startMarch` cíl odmítne a test vypadá, že je rozbité pořadí obrany.

**Testy:** `tests/test-etapa6.js` (147 asercí) ve `vse.js` + gate
`node tests/sim-brana.js 8` = **64/64 (100 %)**.

## E-MAIL U ÚČTU (v0.51, 2026-08-30) — ETAPA 5 KOMPLETNÍ

Poslední položka etapy 5. Rozhodnutí uživatele: **e-mail je při registraci
povinný a síň je do potvrzení zamčená**; odesílá se **přes Resend**.

**Proč Resend a ne vlastní SMTP:** adresy VPS mají u Gmailu a Seznamu špatnou
reputaci, ověřovací maily by končily ve spamu. Resend má 3 000 zpráv měsíčně
zdarma, což na naše objemy stačí s velkou rezervou.

**`server/mail.js`** — `posliOvereni`, `posliReset`, `jePlatnyEmail`. Klíč se
čte z prostředí (`RESEND_API_KEY`), **nikdy z repa**; službě ho podstrčí systemd
přes `EnvironmentFile=-/etc/warofash.env` (chmod 600, pomlčka = služba naběhne
i bez souboru). **Bez klíče se maily jen vypíšou do logu a hra běží dál** — díky
tomu jde celý tok testovat, aniž by se cokoli odeslalo.

**Toky**
- **Registrace** → účet vznikne s `emailOvereno: false` a `overeniKod`; klient
  dostane `accCekaOvereni` (není přihlášený). Odkaz vede na `/overit?kod=`.
- **Přihlášení** nepotvrzeného účtu vrátí chybu s `neovereno: true` (UI nabídne
  poslat odkaz znovu). **Ani `accToken` to neobejde.**
- **Zapomenuté heslo** → `/heslo?kod=` (platnost hodina, jednorázový).
  Nové heslo zneplatní `authToken`, takže se ostatní zařízení musí přihlásit
  znovu, a zároveň potvrdí adresu (odkaz z mailu je důkaz).
- **Dodatečné přidání e-mailu** (`nastavEmail`) pro účty založené dřív:
  adresa čeká v `acc.emailCeka` a **do potvrzení se přístup NEMĚNÍ** — jinak by
  se hráč, co odkaz neotevře, sám vystrnadil ze své síně.

**Stránky `/overit` a `/heslo`** jsou samostatné, bez JavaScriptu a bez
externích zdrojů — člověk je otvírá z mailu, často na cizím zařízení, a nemá
smysl kvůli nim tahat celou hru.

**PASTI**
- **Staré účty musí zůstat funkční.** Migrace nastaví `emailOvereno = !acc.email`,
  takže účet bez adresy (vznikl před v0.51) se přihlásí dál. Bez toho by si po
  nasazení nikdo z dřívějška nezahrál. Profil takový účet upozorní a nabídne
  adresu doplnit.
- **Bezpečnostní zápisy se vyklápějí HNED** (`saveAccounts(); flushAccounts()`),
  ne až za 5 s — kdyby proces mezitím spadl, poslali bychom odkaz na kód, který
  v databázi neexistuje.
- **Odpověď na „zapomenuté heslo" je vždy stejná**, ať účet existuje nebo ne —
  jinak by to byl nástroj na zjišťování, kdo je registrovaný.
- **Jedna adresa = jedna síň** (`uctePodleEmailu`), jinak by se stejným mailem
  dalo zakládat účty donekonečna.
- **Integrační testy potřebují potvrzený účet** — `tests/pomoc-ucty.js`
  (`zaregistrujAPotvrd`) projde celý tok za ně: registruje, vytáhne kód
  z databáze a otevře odkaz. Bez toho po v0.51 spadly všechny čtyři.

**Ověřeno:** `tests/int-email.js` (24 asercí, vlastní server na portu 8289 bez
API klíče): povinnost e-mailu, zámek do potvrzení včetně tokenu, jednorázovost
obou odkazů, reset hesla i to, že starý účet bez adresy funguje a může si ji
přidat, aniž by o přístup přišel.

**PASTI PŘI ZPROVOZNĚNÍ (naostro 30. 8. 2026 — stálo to hodinu)**
- **Klíč s oprávněním „Sending access" vrací na `GET /domains` 401** s
  `name: "restricted_api_key"`. To je SPRÁVNÝ stav, ne chyba — samokontrola
  ho musí odlišit od skutečně neplatného klíče, jinak hlásí poplach přesně
  u toho typu klíče, který sama doporučuje. (Plný klíč vrátí seznam domén
  a stav ověření, takže hláška při startu se liší podle oprávnění.)
- **Neplatný klíč se pozná dvěma různými odpověďmi:** smazaný dá HTTP 400
  `validation_error`, cizí či poškozený HTTP 401. Kontrola musí umět obojí.
- **Do klíče se snadno dostane smetí ze schránky.** Vložení v Git Bashi
  přidalo na začátek U+007F a takový znak v hlavičce Authorization shodí
  volání na neurčité `fetch failed / UND_ERR_INVALID_ARG` — proto se klíč
  při načtení pročišťuje a příkaz na vložení má `tr -cd '\41-\176'`.
- **Wedos: do políčka „název" patří jen krátká část** (`resend._domainkey`,
  `rsend`, `send`, `_dmarc`) — doménu si doplní sám. A po zadání záznamů se
  musí zmáčknout „aplikovat změny", jinak zůstanou jen rozepsané.
- **Záporná odpověď z DNS se cachuje až hodinu.** Po přidání záznamů je
  veřejný resolver ještě dlouho nevidí, i když v zóně u Wedosu už jsou —
  ověřovat přímo na `ns.wedos.net`, ne na 1.1.1.1.
- **DKIM klíč ověř dekódováním**, ne okem: `crypto.createPublicKey` nad
  base64 z TXT záznamu řekne, jestli je celý (platný RSA 1024), nebo se
  cestou o znak ukousl. Useknutý klíč se projeví jen neurčitým „verification
  failed" u Resendu.

**ŽIVÉ od 30. 8. 2026:** Resend má ověřenou doménu warofash.com, klíč leží
v `/etc/warofash.env` a ověřovací i resetovací maily prokazatelně chodí
(ověřeno na ostrém účtu).

## POŠTA REPORTŮ A KOMPRESE (v0.50, 2026-08-30) — dokončení etapy 5

Dvě zbývající položky etapy 5, obě měřitelně rozbité, ne teoreticky.

### Hráči chodí JEN jeho bitvy

Do v0.49 posílal server **každému hráči každou bitvu na světě** (`serializeState`
filtroval jen podle „co už jsem ti poslal", ne podle toho, koho se týká) a klient
si držel posledních 40. **Naměřeno na běžící hře: svět generuje ~390 reportů za
hodinu, takže strop 40 vydržel šest minut**, než hráči vypadly vlastní bitvy mezi
souboji AI na druhém konci mapy. Za čtrnáctidenní sezónu jich vznikne přes 130 000.
Ve vzorku 326 reportů se hráče netýkal ANI JEDEN.

**Report nese `ucastnici`** — pole klíčů aktérů `"fid:cid"` (`aktorKlic`,
`ucastniciBitvy` v game.js): útočník + majitel pole + všichni, kdo ho bránili
hrdinou nebo stráží. Bitva proti neutrálovi má jednoho účastníka.

**Server má poštu** (`posta`: klíč hráče → `{ ids, precteno }`). Reporty se drží
JEDNOU v `reportyStore` (id → report) a schránky na ně odkazují jen id — jeden
report má typicky dva účastníky a kopírovat ho by úložiště zdvojilo. `POSTA_MAX`
= 40 na hráče (report váží 1 KB), `uklidStore` maže reporty, na které už žádná
schránka neukazuje.

**Klíč pošty je tentýž jako v `ucastnici`** (accKey, u hosta token), takže
„přečteno" visí na ÚČTU a přežije reload i přechod na jiné zařízení. Klient si
stav bere ze serveru (`state.precteno`) a hlásí ho příkazem `reportPrecten`
(`{id}` nebo `{vse:true}`).

### Komprese WebSocketu

`permessage-deflate` byla vypnutá (`ws` ji od v7 defaultně nezapíná). Naměřeno
**na socketu, ne na JSONu** — 30 s hry: **847 KB → 102 KB, tedy 88 % dolů**.

| hráčů | bez komprese | s kompresí |
|---|---|---|
| 30 | 6,6 Mbit/s | 0,8 Mbit/s |
| 240 | 52,9 Mbit/s | 6,4 Mbit/s |
| 840 | 185,3 Mbit/s | 22,4 Mbit/s |

Nastavení: `threshold` 512 (drobné zprávy nemá cenu balit), `level: 3` (změřený
kompromis poměr/CPU), **`serverMaxWindowBits: 13`** — menší okno drží kontext na
~32 kB na spojení místo ~300 kB, což je při stovkách hráčů rozdíl mezi desítkami
a stovkami MB paměti. Ověřeno, že se rozšíření dohodne i **přes Caddy**
(`Sec-WebSocket-Extensions: permessage-deflate; server_max_window_bits=13`).

**PASTI**
- **`rozesliReporty()` MUSÍ běžet hned po `doTick`** — `G.reports` drží jen
  posledních 40 a odkládat rozesílání by reporty ztratilo.
- **`doruceno` („co už spojení dostalo") patří HRÁČI, ne schránce.** Schránku
  sdílí všechna zařízení účtu a nově připojený klient nemá nic v paměti, takže mu
  musí dorazit celá — se stavem na schránce viděl hráč z mobilu prázdné reporty.
- **Pošta je součástí snímku sezóny** (`posta`, `reportyStore`,
  `poslednyRozeslany`), jinak by nasazení opravy smazalo všem bojové záznamy.
- **`prestavRejstrikAkteru()` po každé změně `ucastnici`** (start i obnova
  sezóny) — bez obráceného rejstříku `"fid:cid" → klíč hráče` se reporty
  nedoručí nikomu a tiše zmizí.
- Bitva AI proti AI se do žádné schránky nedostane a report se ani neuloží.

**Ověřeno:** `tests/int-reporty.js` (9 asercí, vlastní server na portu 8294):
dva hráči ve dvou frakcích, jeden zaútočí → jemu report dorazí a druhému
nedorazí ani jeden; přečtení přežije reconnect, jiné zařízení i restart serveru.
Měření na drátě `scratchpad/mereni-drat.js`.

**PAST PŘI PSANÍ TAKOVÝCH TESTŮ:** `cekej("lobby")` vytáhne STAROU zprávu
z fronty (lobby chodí i samo od sebe), takže test pokračoval dřív, než server
zapsal druhému hráči frakci — a sezóna startovala s jedním hráčem. Na potvrzení
akce se musí čekat na zprávu, která ji UŽ OBSAHUJE (`cekejNaVyber`).

## SLIDER RODŮ MÍSTO SEZNAMU (v0.49, 2026-08-30) — etapa 5b

Výběr frakce na domově byl mřížka osmi jmen s číslem „0/30". Hráči, který se
upisuje na dva týdny, to o rodu neřeklo nic. Nově je to **slider: jedna karta =
jeden rod** se vším podstatným, listuje se šipkami, záložkami, přejetím prstu
i šipkami na klávesnici.

**Co je na kartě:** portrét startovního hrdiny, jméno rodu v jeho barvě, rasa
a povaha (`race` + `ai.mood`), ekonomický bonus, startovní hrdina s rysem,
signature kus, tři jednotky s ikonami, pruh obsazenosti a tlačítko přihlášky.
Všechno z dat, co už v `game.js` byla — žádný nový obsah.

**Proužek pod sliderem** je zároveň navigace i přehled: osm mini-záložek
s barvou rodu a počtem přihlášených, takže se nepřišlo o to, co uměla mřížka
(obsazenost všech rodů naráz).

**PASTI**
- **Posun je v HTML, ne až v JS.** `#dom-stopa` má `transform` rovnou v šabloně.
  Domov se překresluje při každém lobby (přijde s každým připojením hráče
  i s vlastní přihláškou) a bez toho by slider skočil zpátky na první rod.
- **Přejezd se zapíná až po VYNUCENÉM PŘEPOČTU** (`void stopa.offsetWidth`),
  ne přes `requestAnimationFrame`. rAF ve skryté záložce (a ve skrytém panelu
  prohlížeče) neběží — přejezd by zůstal navždy vypnutý. Stejný trik vypíná
  animaci u skoku přes víc karet: bez něj prohlížeč sloučí odebrání třídy
  a nový posun do jedné změny a přeskok se stejně animuje.
- **Plynule se jezdí jen mezi SOUSEDNÍMI kartami.** Přetočení dokola (z prvního
  rodu na poslední) nebo klik na vzdálenou záložku by prosvištěl přes všech osm.
- `translateX(-100%)` je 100 % **stopy**, ne slidu — stopa je blokový potomek
  okna, takže má šířku okna a každý slide je `flex: 0 0 100%` z ní. Kdyby stopa
  dostala vlastní šířku, posun by přestal sedět.
- **Velké rendery hrdinů se na vizitku nehodí**: 768×768 s postavičkou v ~30 %
  šířky a osm z nich váží 1,6 MB. Generovaný portrét (`heroPortraitURL`) je
  kreslený jako portrét a nestojí bajt.
- Posluchač kláves visí na dokumentu a zakládá se JEDNOU (v `DOMContentLoaded`),
  ne v `bindSlider` — ten běží při každém překreslení a posluchače by se vrstvily.

## DOMOVSKÁ SÍŇ (v0.48, 2026-08-30) — etapa 5b

Do v0.47 hráč přišel rovnou na výběr frakce s poznámkou „Všichni otevřou tuhle
adresu v prohlížeči". To je psané pro partu u jednoho stolu; člověk, který
přišel z odkazu, nevěděl, co drží v ruce. **`#home-overlay` je nově první
obrazovka hry** a starý `#start-overlay` se schoval za tlačítko „Hrát hned
s přáteli".

**`js/domov.js`** (nový soubor — `main.js` má 4 800 řádků a nafukovat ho dál
nemá smysl). Celý modul je IIFE, ven vystrkuje jen `renderDomov`, `domovZpet`,
`domovSkryj`, `domovSpojeni` a `domovChybaRozvrhu`.

**Dvě podoby podle přihlášení:**
- **Nepřihlášený — uvítání:** co Válka popela je, tři pilíře (jeden svět /
  hrdinové zůstávají / sezóna má konec), osm rodů s povahou (`race` + `ai.mood`
  je na vizitku zajímavější než ekonomický bonus), termín nejbližší sezóny
  a založení účtu. Plus odkaz „zahrát si s přáteli bez účtu".
- **Přihlášený — domov:** čtyři záložky — **Sezóna** (odpočet na vteřiny,
  obsazenost frakcí s pruhy, přihlášení jedním klikem), **Síň hrdinů**,
  **Výbava** (tentýž panel truhel a skladu jako ve hře) a **Profil**.

**Znovupoužití panelů ze hry.** `updateChestsPanel` umí nově i cíl
`#dom-chests`, takže Výbava doma je doslova tentýž panel se záložkami
Truhly/Sklad — hráč se neučí dvakrát totéž. Síň jede přes `sinHtml(me)`.

**PASTI**
- **`sinHtml` chce ŽIVOU frakci, doma žádná není.** Podstrčí se jí skořápka
  `{ key, heroes: [] }` — čte z ní jen `key` a `heroes`, zbytek bere z účtu.
  Zároveň se doma **odstraní tlačítka „Nasadit"**: `deployHero(player())` míří
  na živou frakci a mimo sezónu by spadlo. Doma je síň k prohlížení a k ★.
- **Po přihlášení k účtu se MUSÍ znovu poslat lobby** (`posadPoPrihlaseni`).
  Klient dostal lobby ještě jako anonym, takže v něm chyběla jeho vlastní
  přihláška (`rozvrh.mojeFrakce`) a domov tvrdil, že se nikam nepřihlásil.
  Hlídá `tests/int-prihlaseni.js`.
- **Ruční ukončení sezóny musí zase otevřít zápisy.** Bez toho zůstal rozvrh
  viset ve fázi „bezi" a do další sezóny se nešlo přihlásit —
  `backToLobby` proto volá `rozvrh.dalsi()`. Hlídá `tests/int-konec-sezony.js`.
- **Číslo sezóny má JEDINÝ zdroj — rozvrh.** Dřív se počítalo zvlášť v serveru
  (`sezona++`) a zvlášť v rozvrhu; ty dva čítače se rozešly, jakmile sezóna
  skončila jinak než dohráním.
- **`zacniSezonu` rozesílá i lobby.** Kdo do sezóny nepatří, se jinak nedozví,
  že zápisy jsou zavřené.
- **Globální `button { display: block; width: 100% }`** by v domově roztáhl
  každé tlačítko přes celou kartu — proto `#home button { display: inline-block;
  width: auto }` a mřížky si `display: grid` vracejí zpátky.
- **Domov se připojuje k serveru SÁM** (`mpConnect` při načtení), jinak nemá co
  ukázat. Když spojení není, ukáže „Server neodpovídá" a nabídne hru proti AI.
- **Prohlížečový pane nezmenšuje layoutový viewport** — `resize_window` na
  mobil vrátí screenshot 375 px, ale `window.innerWidth` zůstane přes 1000
  a stránka jen vypadá rozbitě. Responzivitu ověřuj zúžením `#home-overlay`
  a měřením přetečení (ověřeno na 380/480/768 px: nic nepřetéká).

**Ověřeno:** `tests/int-prihlaseni.js` a `tests/int-konec-sezony.js` (obojí
si pouští vlastní server nad dočasným `VP_DATA`), plus ruční průchod
v prohlížeči: registrace → přihláška do sezóny → síň → výbava → profil →
hrát hned → hra → konec → zpátky domů.

## ROZVRH SEZÓN: PEVNÝ TERMÍN A PŘIHLÁŠKY (v0.47, 2026-08-30) — etapa 5b

Dosud sezóna začínala tím, že někdo v lobby zmáčkl „Spustit". To funguje pro
partu u jednoho stolu, ale ne pro stovky lidí, kteří se nikdy nedomluví.
Nově má sezóna **pevný termín**, do té doby se hráči **přihlašují za konkrétní
frakci** a v ten čas se sezóna spustí sama — se všemi přihlášenými, ať jsou
zrovna online nebo ne. **Ruční start z lobby ZŮSTÁVÁ** jako obcházka pro
testování a pro partu; rozvrh ho nenahrazuje.

**`server/rozvrh.js`** — `nacti({delkaHodin, mistNaFrakci, ted})`, `prihlas`,
`odhlas`, `prihlaskaOf`, `obsazenost`, `jeCas`, `doStartu`, `zacni`, `dalsi`,
`naplanuj`. Stav v `data/rozvrh.json` (atomický zápis přes .tmp).
`PRVNI_ZA_H` 24 (první sezóna po zapnutí čistého serveru), `PRODLEVA_DALSI_H`
48 (mezi koncem sezóny a startem další).

**Místo ve světě drží ÚČET, ne spojení.** `ucastnici: Map<klíč, {faction, cid}>`
kde klíč je accKey (přihlášený) nebo token (host bez účtu). Přihlášený hráč
tak najde své město i z jiného zařízení a i když dorazí týden po startu —
`posadPoPrihlaseni` ho po `accLogin`/`accToken` rovnou posadí do světa. Mapa
je součástí snímku sezóny, jinak by ji restart ztratil.

**`CLENU_MAX` už není pevná 4.** Každý člen dostane vlastní město 3×3, takže
strop určuje velikost mapy — `zmerKapacitu()` ho při startu **změří nanečisto**
(postaví a zahodí tři světy, ~30–100 ms) a bere **nejhorší ze tří seedů**,
protože kapacita s rozložením mapy kolísá (na 69×69 mezi 30 a 37).

**Naměřená kapacita** (kolik hráčů na frakci → celkem, a velikost snímku):
| svět | polí | na frakci | celkem | snímek |
|---|---|---|---|---|
| 69×69 | 4 761 | 31 | 248 | 51 KB |
| 91×91 | 8 281 | 66 | 528 | 88 KB |
| **111×111** | 12 321 | **105** | **840** | 129 KB |
| 123×123 | 15 129 | 125 | 1 000 | 157 KB |

**Cíl 800 hráčů tedy vyjde na svět 111×111** (`node server/server.js 8123 336 55`)
a snímek sezóny zůstane pod 130 KB. Zbytek měřítka (chat, klany, reporty) je
etapa 11.

**PASTI**
- **`lobbyState` se posílá KAŽDÉMU ZVLÁŠŤ** — nese i jeho vlastní přihlášku
  (`rozvrh.mojeFrakce`). `broadcast(lobbyState())` by všem poslal přihlášku
  toho prvního.
- **Kdo už ve frakci je, musí projít stropem znovu.** `prihlas` kontroluje
  obsazenost jen když se frakce MĚNÍ — jinak by si stávající člen plné frakce
  nemohl přihlášku potvrdit.
- **Přihlášky po startu ZŮSTÁVAJÍ** (nemažou se), server podle nich pozná, kdo
  do běžící sezóny patří. Vysypou se až v `dalsi()`.
- **Když se do termínu nikdo nepřihlásí**, termín se posune o `PRODLEVA_DALSI_H`
  místo startu prázdné sezóny.
- **Kapacita se měří PŘED obnovou sezóny** — měření přepisuje `G`.
- Kontrola termínu běží každých **15 s**, ne po minutě: vypršelý odpočet, který
  celou minutu nic nedělá, vypadá jako zaseknutá hra.

**Ověřeno:** `tests/test-rozvrh.js` (37 asercí, ve `vse.js`) + `tests/int-rozvrh.js`
(vlastní server na portu 8297: přihlášky → automatický start v termínu i pro
offline hráče → návrat ke svému městu po přihlášení).

## NESMRTELNOST SEZÓNY (v0.46, 2026-08-30) — etapa 5

Do v0.45 žil svět jen v paměti procesu: restart serveru — a to je i **každé
nasazení opravy** — zahodil rozehranou mapu, armády i postup a všechny vrátil
do lobby. Pro partu kamarádů to šlo, pro veřejný server ne.

**Sezóna se měří v TICÍCH, ne hodinami na zdi** (`SEASON_TICKS`, 1 tik = 1 s),
takže uložením `G.tick` se zachová i její postup: výpadek sezónu jen
POZASTAVÍ, nezkrátí. To je záměr — hráči nemají přijít o den sezóny kvůli
patnácti minutám údržby.

**`server/sezona.js`** — `uloz(stav)`, `nacti()`, `smaz()`, `existuje()`,
`obnovDoG(G, ulozeneG)`. Snímek je gzipovaný JSON v `data/sezona.json.gz`.

**Stav hry je čistý strom dat.** Žádné funkce, cykly ani sdílené odkazy mezi
objekty — jediné, co JSON neumí, je `G.tiles` (Map) a `G.visible`/`G.explored`
(Sety); ty se převádějí přes `{__mapa:[...]}` / `{__set:[...]}`. **Sada 6
v `test-trvalost-sezony.js` to hlídá do budoucna** — kdyby někdo do G přidal
funkci nebo cyklus, test spadne hned, ne až za běhu ostrého serveru.

**Míry (svět 69×69, 400 tiků):** JSON 0,57 MB, gzip úrovně 3 → **57 KB za
1,4 ms**; celé uložení ~5 ms. Úroveň 6 ušetří 11 KB, ale trvá dvakrát tak
dlouho — na jednom CPU to nestojí za to.

**Kdy se ukládá:** každých `ULOZ_KAZDYCH` = 10 tiků a **při SIGTERM/SIGINT**
(`ukonci()`), takže plánovaný restart neztratí nic a tvrdý pád nejvýš 10 s.

**PASTI**
- **Obnova musí mířit DO stávajícího `G`, ne za něj.** `game.js` si drží `G`
  jako vlastní modulovou konstantu, kterou všechny funkce zavírají — kdyby
  server odkaz přepsal, hra by dál mutovala osiřelý objekt. Proto `obnovDoG`
  mutuje na místě a zachovává `G.onEvent` (hook serveru, ve snímku není).
- **Délka sezóny i velikost mapy se berou ZE SNÍMKU, ne z argumentů.**
  Rozehraná sezóna má rytmus (otevření Trůnu, okna obléhání, fáze světa)
  navázaný na `SEASON_TICKS` a geometrii na `MAP_R`; změnit je v půlce by ji
  rozbilo. Argument se ohlásí a ignoruje až do konce sezóny.
- **`systemctl restart` napíše snímek ZNOVU při vypínání.** Smazat snímek před
  restartem je proto k ničemu — pořadí je SIGTERM → zápis → start. Vynutit
  čistou sezónu jde jen `systemctl stop` → `rm` → `systemctl start`.
- **Po `gameOver` a při návratu do lobby se snímek MAŽE** — jinak by restart
  vzkřísil právě dohranou sezónu.
- **Poškozený snímek nesmí shodit start.** `nacti()` vrací `null` (a hlásí to),
  server naběhne načisto — vždycky lepší než server, který nenaběhne.
- **`p.ws` se neukládá** (spojení se oživit nedá), ale token ano — hráč se po
  `hello` s týmž tokenem vrátí ke své frakci i aktérovi.
- **Na Windows SIGTERM není opravdový signál** — `kill("SIGTERM")` proces
  ustřelí a úklidové uložení neproběhne. Ověřovat tuhle větev jde jen na
  Linuxu: `node tests/ostry-restart.js --opravdu` (sahá na OSTRÝ server,
  zahodí běžící sezónu — jen když nikdo nehraje).
- **`VP_DATA`** přepíná adresář dat u `ucty.js` i `sezona.js` — testy díky
  tomu nesahají na ostrá data.

**Ověřeno:** `tests/test-trvalost-sezony.js` (25 asercí, ve `vse.js`) + ostrý
běh na warofash.com: rozehraná sezóna, `systemctl restart`, hráč se vrátil ke
své frakci a svět pokračoval od téhož tiku.

## ÚČTY V SQLITE (v0.45, 2026-08-30) — první kus etapy 5

Do v0.44 žily účty v jediném `server/data/accounts.json`, který se při každém
uložení přepisoval CELÝ. Pro hrst kamarádů to stačilo, pro stovky hráčů ne:
přepis roste s počtem účtů a pád procesu uprostřed zápisu nechá useknutý soubor,
tedy ztrátu všeho. SQLite zapisuje po řádcích a v transakci se žurnálem (WAL),
takže pád databázi nerozbije.

**`node:sqlite` je SOUČÁSTÍ Node 22+** — ověřeno na Node 24.19. Žádná nativní
závislost, nic se nekompiluje, na Windows i na Linuxu se chová stejně. Projekt
tak zůstává u jediné závislosti (`ws`). **Nepoužívat better-sqlite3** — vyžaduje
build tools a řešilo by se to zvlášť pro vývoj a zvlášť pro server.

**MODEL SE NEZMĚNIL, a to je záměr.** Účty drží server dál v paměti jako obyčejné
objekty a mutuje je na místě (`acc.cores -= 400`); databáze je jen trvalá vrstva
pod tím, do které se vyklápí každých 5 s. Díky tomu se nemusel přepsat ani jeden
z desítek čtecích míst v server.js — `accData.accounts[key]` funguje dál.

**`server/ucty.js`** — `nacti(migrace)` otevře DB, případně převede starý JSON
a načte účty do paměti (a pustí nad nimi `game.migrateAccount`); `oznacZmenu()`,
`uloz(force)`, `pridej(klic, ucet)`, `smaz(klic)`, `zavri()`.

**Převod ze starého JSON je jednorázový a automatický:** při prvním spuštění se
`accounts.json` naimportuje a přejmenuje na `accounts.json.prevedeno.bak`, takže
se import nespustí podruhé a originál zůstane po ruce.

**Zápis vyklápí VŠECHNY účty naráz v jedné transakci**, ne jen změněné. Při
stovkách účtů je to pod milisekundu a odpadá evidence, který účet je špinavý.
Až budou tisíce, přejít na sadu klíčů — je to jediné místo, které se bude měnit.

**PASTI**
- **Test si musí dělat vlastní databázi.** Modul si cestu bere z `__dirname`,
  takže `tests/test-ucty.js` kopíruje `ucty.js` do dočasného adresáře — jinak by
  testy přepisovaly ostrá data v `server/data`.
- **Trvalost jde otestovat jen napříč PROCESY.** V jednom běhu drží modul účty
  v paměti a „restart" by nic nedokázal; test proto spouští `execFileSync` s
  novým Node procesem pro každé „spuštění serveru".
- Poškozený řádek v DB načtení nezabije — přeskočí se s hláškou a zdravé účty
  se načtou (sada 5 to hlídá).
- Před ostrým během byl `accounts.json` zazálohován ručně na
  `accounts.json.pred-sqlite.zaloha`; `.prevedeno.bak` vyrábí sama migrace.

**Ověřeno:** `tests/test-ucty.js` (13 asercí) ve `vse.js`, celá sada zelená;
server nabíhá s `[účty] načteno N účtů z ucty.db`; MP smoke přes WebSocket
(registrace → truhla → použití dárku → profil) prošel proti SQLite úložišti.

## DÁRKY PO SKUPINÁCH A NOVÁ CENA ODDANOSTI (v0.44, 2026-08-30)

Zadání uživatele: hodnota dárku ať roste s tierem (10 / 100 / 300 oddanosti),
odemčení ať stojí **vždy 30 kusů** bez ohledu na tier, druhá hvězda 10 / 7 / 5
kusů — a dárky sjednotit do skupin po rodu a tieru.

**Vzácnost se přesunula z cenovky do dropu.** Dřív potřeboval legendární hrdina
11× víc dárků než běžný a každý dárek měl stejnou hodnotu. Nově potřebuje MÍŇ
kusů, ale jeho dárky padají vzácněji. Změřeno na 3 000 truhlách: 1,05 dárku na
truhlu, z toho 57 % běžných / 35 % epických / 8 % legendárních. Po seskupení po
rodech to dělá **~200 truhel na odemčení běžného, ~325 na epického a ~1 400 na
legendárního** (dřív 162 / 650 / 4 235) — legendárka je tedy asi 3× dostupnější.
Kdyby to bylo moc měkké, **pákou je drop rate, ne cenovka**.

| | odemčení | 2★ | na 25★ celkem |
|---|---|---|---|
| běžný (10/ks) | 30 ks = 300 | 10 ks = 100 | 852 ks |
| epický (100/ks) | 30 ks = 3 000 | 7 ks = 700 | 605 ks |
| legendární (300/ks) | 30 ks = 9 000 | 5 ks = 1 500 | 441 ks |

**SKUPINY DÁRKŮ.** Dárek už nepatří hrdinovi, ale **rodu a tieru**: klíč
`fkey:t<tier>` (schválně jiný tvar než klíč hrdiny `fkey:idx`, aby se nepletly).
„Epický dar Popelné hordy" nakrmí kteréhokoli epického hrdinu hordy. Sbírka je
tím likvidní (24 druhů místo 48), mrtvý drop zmizel úplně a klanová burza
z etapy 9 dostane rozumný počet obchodovatelných druhů.

- `giftGroupKey` / `jeSkupinaDarku` / `rozborSkupiny` / `giftGroupOfHero` /
  `hrdinoveSkupiny` / `giftNameForGroup` / `giftNameOf` (čte klíč hrdiny i skupiny).
- Jméno a ikona skupiny se berou z **reprezentativního rysu tieru**
  (`GIFT_TIER_TRAIT = ["swift","attack","mystic"]`), takže zůstávají vellarská
  jména z v0.27 a nevzniká nový obsah. **Až legendárka přestane být vždy mystik
  (PLAN IV-M), musí se to překlopit na vlastní tabulku jmen.**
- `rollGiftGroup(tier, side, acc)` losuje skupinu; `rollGiftHero` zůstal jako
  alias. Seznam přání se mapuje na skupiny (`wishlist.map(giftGroupOfHero)`).
- `useGifts(acc, heroKey, pocet, liveFaction)` — **cílem je HRDINA**, kusy se
  berou z jeho skupiny. Na klíč skupiny se použít nedá (vrací null).
- `migrateAccount` převádí staré klíče hrdinů ve skladu na skupiny.

**UI:** ve Skladu jsou dlaždice SKUPIN (ikona daru, počet, rod, barva tieru);
klik rozbalí `darek-cile` — hrdiny té skupiny s odemčením, hvězdami, pokrokem
a tlačítky „1" / „vše". V okně hrdiny řádek bere kusy z jeho skupiny a při
prázdném skladu ukazuje, jaký dar hrdina vlastně chce.

**PASTI**
- **`setChestStatus` musí přijít AŽ PO `updateChestsPanel`** — panel se přestaví
  a hlášku přepíše. (Stejný druh chyby jako podpisy: pořadí volání rozhoduje.)
- Klíč skupiny obsahuje dvojtečku i „t", takže `parseInt(key.split(":")[1])`
  vrátí NaN. Kdo z klíče čte index hrdiny, musí nejdřív ověřit `jeSkupinaDarku`.
- Odhalení truhly čte `gift.tier` (skupina ho nese), ne `heroTierOf` z klíče.
- `TIER_GIFT_MULT` zrušen — kdo ho hledá, chce `STAR2_GIFTS` a `giftRespectFor`.

**Ověřeno:** celá sada zelená (test-sin 103, test-truhly 60 přepsané na skupiny),
v prohlížeči 9 skupin ze 30 truhel, rozbalení cílů, „použít vše" (35 kusů poslalo
hrdinu o tři hvězdy výš) a MP skriptem přes WebSocket: profil → truhla → `useGift`
na hrdinu ze skupiny → profil.

## DÁRKY JAKO PŘEDMĚTY (v0.43, 2026-08-30) — první kus etapy 9

Zadání z brainstormu (PLAN.md IV-G): dárek z truhly se má přestat aplikovat sám
a stát se **předmětem ve skladu**, který hráč použije, kdy chce — tím se z něj
stane obchodovatelné zboží (klanová burza, etapa 9) a duplicita přestane být
mrtvý drop. Vytažené dopředu, protože je to jediná položka plánu nezávislá na
persistenci i na bojovém přepočtu.

**Sklad je POČÍTADLO, ne pole objektů:** `acc.darky = { "fkey:idx": počet }`.
Legendární hvězda stojí přes sto dárků a sto samostatných předmětů s vlastním
`id` by nafouklo účet i profil v MP. Navenek se stejně kreslí jako dlaždice
s odznakem počtu. Vedlejší zisk: `syncAccountFromFaction` přepisuje CELÝ
`acc.inventory` z frakční zásoby, ale `acc.darky` je mimo něj, takže ho živá
hra nemůže přepsat.

**game.js**
- `emptyAccount` zakládá `darky: {}`, `migrateAccount` ho doplňuje starým účtům.
- `giftCount(acc, key)` · `grantGift(acc, key, pocet)` → vrací popis pro odhalení
  truhly s `type: "giftItem"` · `useGifts(acc, key, pocet, liveFaction)` spotřebuje
  ze skladu a zavolá aplikaci.
- `applyGiftToAccount(acc, key, liveFaction, pocet = 1)` — nový poslední parametr;
  oddanost i jádra na 25★ se násobí počtem. Kaskáda povýšení z v0.42 tím dostala
  smysl naostro: „použít vše" povýší o několik hvězd naráz.
- `losujTruhlu` a `buyShopOffer` volají `grantGift` místo `applyGiftToAccount`.
  **`applyGiftToAccount` se odteď volá JEN z `useGifts`** — kdo přidá další zdroj
  dárků, ať jde přes `grantGift`, jinak dárek zmizí do oddanosti bez vědomí hráče.

**main.js** — `acctDarky()`, `darkuMam(key)`, `darkyStatusText(v)`,
`pouzitDarky(key, pocet)` (jediná cesta: v MP jen odešle příkaz),
`darkyRowHtml(key)` pod pruh oddanosti v okně hrdiny, `darkyGridHtml()` do Skladu,
`bindDarky(root)` pro obě místa. Karta odhalení truhly má větev `giftItem`.

**MP** — `profileMsg` nese `darky`; net.js ho kopíruje do `acct.remote` v OBOU
větvích (`account` i `chestResult`); nový `msg.type === "useGift"` na serveru
(mimo `CMDS`, protože ty účet nevidí — vzor `wishlist`/`useBoost`), odpověď
`giftUsed` nese profil i výsledek, klient z něj spustí oslavy odemčení a R10.

**PASTI**
- **`heroWindowSig` je FUNKCE, podpis drží proměnná `heroWinSig`.** Napsat
  `heroWindowSig = null` funkci PŘEPÍŠE a okno hrdiny se přestane překreslovat.
  Symptom: po použití dárku zůstane v řádku starý počet.
- Nová data na účtu musí do podpisů: `heroWinSig` (počet dárků hrdiny) a podpis
  okna truhel (celý `acctDarky()`), jinak se počty nepřekreslí.
- Testovací MP klient zapisuje do OSTRÉHO `server/data/accounts.json` — testovací
  účty po sobě mazat.

**Ověřeno:** sada zelená (test-sin 98 vč. nové sady 11 se 14 asercemi), v sólu
změřeno v prohlížeči (truhla sype `giftItem`, oddanost se nehne, mřížka ve Skladu,
řádek v okně hrdiny se po použití sám přepíše a při vyprázdnění zmizí), a MP cesta
ověřena skriptem proti běžícímu serveru: profil → truhla → `useGift` → profil.

## ODDANOST, SÍŇ, DOHLED A ZÁBOR PO ROZÍCH (v0.42, 2026-08-29)

Čtyři zadání uživatele v jedné dávce.

### 1. Pruh oddanosti lhal (oprava)
Hlášení: „mám respect 270/100 a nejde na další úroveň." Progrese byla v pořádku
— **lhal ukazatel**. `renderHeroWindow` volal `respectForStar(stars + 1)` **bez
tieru**, takže počítal cenu BĚŽNÉHO hrdiny (×0,8 → 100). Vaelis je mystik =
`HERO_TIER_BY_TRAIT.mystic` → **legendární** (×9), a ten na 2★ potřebuje
**1080**. Opraveno: klíč přes `heroKeyFor(me, h)` (hrdina může být z jiného rodu
téže strany — `h.srcKey`!), tier přes `heroTierOf`, a v titulku i počet dárků
s názvem tieru. `sinHtml` tier předával správně už dřív.

### 2. Zvací list nasbíranou oddanost NEMAŽE
Odpověď na otázku uživatele, teď i v komentáři u `applyInviteToAccount`: list
hrdinu odemyká **přímo** a `acc.heroRespect` se vůbec nedotkne — body zůstávají
a počítají se do další hvězdy. Nepřičítá 300 oddanosti; rovnou dá to, co by se
za ně koupilo. Přeplatek tím nevznikne (ceny hvězd rostou, co nestačilo na 1★,
nestačí ani na 2★). Pro jistotu je ale povyšování v `applyGiftToAccount` nově
**smyčka** — po případné změně tieru mezi verzemi se přeplatek promění ve hvězdy
naráz, ne po jedné za dárek (`pribylo` bodů dovedností, log i `star` odpovídají).

### 3. Síň hrdinů — mřížka karet
`sinHtml` přepsáno na hlavičku (strana + počty 🔓/⚑/☆), skupiny podle rodů
(**vlastní rod první**) a `.sin-grid` s kartami: portrét 54 px v rámu barvy
tieru, odznak hvězd, rys s ikonou dárku, **pruh oddanosti i u ODEMČENÝCH**
(k další hvězdě — dřív ho měli jen zamčení, takže hráč nevěděl, jak je daleko),
a akce (Nasadit / ⚑ v poli s úrovní / 🔒 jméno dárku). Hvězdy mimo pole čte
`acctStars()` — v MP je profil neposílal, proto **`heroStars` v `profileMsg`**
(server.js) a v obou větvích `acct.remote` (net.js).
**Okno se na tuhle záložku roztáhne** (`#side-win.siroke`, 880 px místo 336) —
katalog 24–32 karet se do úzkého sloupce nevejde; přepínač je `sirokeOkno(sec)`
volaný z `openSideWin` i `updateHeroesPanel`. Měřeno: 3 sloupce, výška panelu
1191 px místo 2899, návrat na „Moji hrdinové" okno zase zúží.

### 4. Zábor i po ROZÍCH (na obrazovce „do +")
Zadání: „chodit místo jen do tvaru X taky do směru +". Mřížka je na obrazovce
otočená o 45°, takže čtyři hranoví sousedé leží do X a čtyři rohoví do +.
Nově `sousediZaboru = neighborsOf + rohoviSousedi` a `isAdjacentToFaction` jede
přes něj — platí pro hráče, UI i AI (všichni čtou tutéž funkci).

**KLÍČOVÉ PRAVIDLO: „bez řezání rohů".** Roh se uzná, jen když je aspoň jedno
z obou polí mezi ním a mnou průchozí. Bez toho je celý svět děravý: pole
hradebního prstence se v mřížce dotýkají **jen rohy**, takže by šlo proklouznout
mezi dvěma poli hradeb dovnitř a obejít brány. Změřeno: naivní osmisměrný flood
z aldarského kapitálu bez bran a mostů dosáhne **407 polí uvnitř prstence**
a dojde i na cizí kapitály; s pravidlem 0. Řeku pás tří polí nepustí tak jako
tak (roh přeskočí nejvýš o dvě pole).

`neighborsOf` (generátor, dohled, spojitost světa, stráž výspy, mosty) zůstává
ČTYŘSMĚRNÝ — 8 sousedů v genMap by dalo grandfortům 8 bašt místo 4 a přegenerovalo
celý svět. Vzdálenost pochodu zůstává Manhattan, takže roh stojí 2 kroky
(ve světě je opravdu 1,41× delší než hrana).

### 5. Hrdina dohlédne o pole dál
`computeVisibility`: pojmenované konstanty `DOHLED_POLE` 1, `DOHLED_HRDINA`
**3** (dřív 2), `DOHLED_POCHOD` 1. Mlha je klientská — server nic neposílá jinak.

**Ověřeno:** sada zelená (test-mapa 34 vč. dvou nových sad o rozích, test-sin 83
vč. listu a přeplatku), **sim gate 63/64 (98 %)**, v prohlížeči změřeno:
dohled hrdiny 3 (ne 4), diagonální i hranový soused vlastního pole jsou pro
zábor platné, Síň 3 sloupce, pruh legendárního hrdiny 270/1080.

**PASTI:**
- Pruh oddanosti (a cokoli kolem hvězd) VŽDY počítej s tierem a klíčem přes
  `heroKeyFor` — bez tieru vyjde cena běžného hrdiny a UI mlčky lže.
- MP profil neposílá `heroProgress`; co Síň potřebuje, musí být v `profileMsg`
  **a v obou místech, kde net.js skládá `acct.remote`** (account i chestResult).
- Kdo přidá další osmisměrné sousedství, musí zkontrolovat těsnost hradeb
  a výsečí — test-mapa sada 2b to hlídá floodem přes rohy.

## ŘEKA JAKO JEDNA HLADINA + MOST PŘES CELÝ TOK (v0.41, 2026-08-29)

Zadání uživatele: „tu řeku nějak graficky předělej, aby byla dohromady."
Po v0.40 měl každý vodní dílek vlastní koryto s písčitými břehy (`river_tile`,
model z doby, kdy byla řeka JEDNA řada polí) — z pásu tří polí tak byly tři
potůčky vedle sebe, každý ve vlastním písku.

**Voda se skládá ze tří kusů** (art/blender/make_tiles.py):
- **`river_flat`** — deska přes celé pole, přesně `STRANA = √3` (= rozteč
  sousedů), výška `VODA_Z = 0.105` (deska souše má 0,14, voda leží níž).
  ZÁMĚRNĚ **bez fazety** (`hex_base` ji dává): fazeta by mezi dvěma vodními
  poli udělala rýhu a hladina by se rozpadla na dlaždice. Ani přesah: dvě
  stejně vysoké plochy by se v překryvu přebíjely.
- **`river_bank` / `_b` / `_c`** — šikmý břeh podél JEDNÉ hrany, kanonicky na
  stavitelském +Y (na mapě soused −q). Renderer ho klade jen tam, kde voda
  končí u souše, a otáčí ho po 90°. Svah je nakloněný i technicky: v rohu pásu
  se potkají dva břehy a **dvě šikmé plochy se protnou v čisté hraně**
  (vodorovné desky by v rohu blikaly). Tři varianty (seedy 41/77/113) proto,
  že kusy podél jednoho pobřeží mají STEJNOU otočku — s jedním modelem se
  opakoval jeden vzor oblázků dlaždici po dlaždici. Volí je `brehVarianta()`
  (FNV z q,r,strana) v render.js.
- **`bridge_short` / `bridge_long`** — jen NÁSTAVBA mostu (kamenná hlava,
  pilíře v korytě, mostovka do PŮLKY toku). Zem pod ní kreslí obyčejný dílek
  biomu, protože se most otáčí k protějšímu břehu **i o 45°** a čtvercová
  deska by se z mřížky vyklopila. Dvě hlavy proti sobě se koncem potkají nad
  středem řeky — prkna se řadí od spáry zpátky, aby rytmus navazoval.

**Otáčení modelů (render.js).** Pole (q,r) leží ve 3D na `(x,z) = DIAG·(q−r, q+r)`,
takže směr k sousedovi jde spočítat z rozdílu souřadnic. Modely jsou autorsky
natočené k sousedovi −q (`UHEL_AUTORA = −135°`) a `R3` otáčí kolem svislé osy
o `rot`, což úhel **odečítá**: `otoceniNa(dq,dr) = UHEL_AUTORA − atan2(dq+dr, dq−dr)`.
`prislusenstvi(t)` vrací kusy navíc k dílku (břehy / nástavba mostu),
`mapModelList` je přidává se stejným klíčem pole (mlha a odstín pak sedí).

**Splývání v render3d.js:** `BEZ_ODSTINU = {river_flat, bridge_short, bridge_long}`
— per-pole jitter jasu (`odstinPole`, ±7 %) se na ně NESMÍ pouštět, jinak by
hladina byla mozaika různě jasných dlaždic a most by měl uprostřed toku schod
mezi svými půlkami. Břehy jitter mají (písek se má lišit).

**OPRAVENO ZA POCHODU — úhlopříčné mosty stály na suchu.** `stavMosty` posouval
břeh o `b = RIVER_HALF + 1` do OBOU souřadnic, takže u úhlopříčných řek vyšel
břeh až na `|q−r| = 2b` — o celý pás dál, dvě pole od vody. Nová konstanta
`u = ceil(b/2)` to vrací na první pole za pásem. Osové řeky byly správně.
Přechody proto mají **dvě šířky**: úhlopříčné 4·DIAG (půlka lávky 2·DIAG),
osové 4·√2·DIAG (půlka 2·STRANA) — mřížkový Manhattan je u obou 4 a NEROZLIŠÍ
je, renderer proto měří vzdálenost ve světových osách.

**Náhled kusu mapy:** `art/blender/nahled_mapy.py` (`blender -b -P nahled_mapy.py`,
env `SCENA=osova|uhlopricna`, `OKNO=q0,q1,r0,r1`, `CIL=q,r`, `ZOOM`, `JENVODA`,
`BEZMOSTU`). Skládá kus mapy PŘESNĚ jako renderer (tentýž vzorec otočky
i výběru variant) a vyfotí ho — řeka, břehy a most dávají smysl až vedle sebe.
`make_models.py` bere v `ONLY` víc předpon oddělených čárkou.

**Ověřeno:** testy zelené, **sim gate 64/64 (100 %)** — o kus lepší než 63/64
před opravou mostů; v prohlížeči 760 dílků hladiny, 1400 břehů (varianty
482/471/447), 8+8 mostů, žádný chybějící model, 104 volání kreslení (dřív 91).
Rotace ověřena měřením: všech 1360 břehů míří na NEvodního souseda a obě
poloviny každého mostu míří na svůj protějšek s odchylkou 0,00°.

**PASTI:**
- **Splývající plochy = černý obdélník.** Kamenná hlava mostu měla horní plochu
  přesně v rovině mostovky a v renderu z toho byla černá díra přes celou hlavu.
  Hlava je proto o 0,04 níž (`0.12` místo `0.16` na výšku).
- Staré modely `river_a–d`, `bridge_a–d` a `water` **zůstávají na disku**
  (repo není v gitu) a stavitelé `river_tile`/`bridge` v make_tiles.py taky,
  jen vypadly z registru a z `NAMES` — dají se kdykoli přeregistrovat.
- Břehy a most jsou DALŠÍ instance nad týmž polem: kdo přidá kus do
  `prislusenstvi`, musí ho přidat i do `podpis`, jinak se mapa nepřestaví.
- Kotvy hashů v test-mapr se měnily potřetí (posun mostů) — sady z v0.40
  a v0.33 jsou v komentáři u `KOTVY`.

## ŘEKY JAKO PÁS 3 POLÍ + MOSTY JAKO DVOJICE BŘEHŮ (v0.40, 2026-08-29)

Zadání uživatele: „řeka mezi segmenty široká 3 pole, most na jednom místě na
OBOU březích, oba slouží jako přestupní pole — kdo chce přes řeku, musí dobýt
oba břehy; bránící armády 2× úroveň 35 na obou březích."

**Řeka (generátor):** `RIVER_HALF = 1` → pás **3 polí** (osa + pruh na každou
stranu). `riverKeys()` přepsáno z „řetězu na k" na test podmínky nad celou
mapou: `|q−r| ≤ 1` (koryto "b"), `|q+r| ≤ 1` ("a"), `|r| ≤ 1` ("c"),
`|q| ≤ 1` ("d"), vždy s Manhattan/osou > `OUTER_R` (uvnitř dělí svět hradby).
Pásy se nekříží (průsečíky leží uvnitř prstence). Voda tvoří ~16 % mapy,
průchozích polí zůstává ~3900 ze 4761.

**Most = DVOJICE polí na protilehlých březích** (8 přechodů = **16 mostních
polí**, dřív 8 jednotlivých uprostřed vody):
- `stavMosty()` vrací plochý seznam klíčů a plní **`BRIDGE_PAIR`** (klíč →
  protějšek) a **`BRIDGE_DIR`** (klíč → směr koryta pod mostem, jen pro model).
  Břeh = první pole ZA pásem (`RIVER_HALF + 1`).
- **`neighborsOf` vrací protějšek jako souseda** (`bridgeTwin`) — jedna hrana
  v grafu, takže spojení platí i pro pathfinding, dohled a šíření území.
  Přejít řeku = dobýt svůj břeh a z něj protější; přes vodu to nejde.
- Oba břehy brání **dvě armády** (`dveArmady` = uzel 2×2 NEBO most) s veliteli
  **pevné úrovně `BRIDGE_LEVEL` = 35** (`neutralCommander` má výjimku),
  posádka `STRUCTURES.bridge.militia` **500** (2×250, dřív 120). Odražený
  zátah obě armády obnoví a most na `UZEL_CD_TICKS` uzavře — stejně jako uzel.
- `repairBridges()` přepsáno: každý břeh musí mít průchozího souseda NA SVÉ
  STRANĚ (mimo protějšek), jinak se nejvzdálenější soused vysuší na pláň.

**Panel pole:** řádek „🌉 Přechod přes řeku — protější břeh q,r (✅ držíš)"
s počtem armád a odpočtem uzavření. Opraveno i to, že hlavička ukazovala
`tierOf` (most „Síla 30") — nově **`tileStrengthLabel`**, takže sedí
s obranou (most 500, grandfort 500, běžné pole svůj stupeň).

**Ověřeno:** testy 3 sady přepsané na novou geometrii (test-mapa 28,
test-mapr, test-etapa4), celá sada zelená; **sim gate 63/64 (98 %)** — o kus
lepší než před změnou (62/64), všech 8 frakcí žije na všech seedech;
v prohlížeči 16 mostů ve 4 směrech, 528 říčních dílků, žádný chybějící model.

**PASTI:**
- `setMapRadius` má ochrannou aserci na klíč mostu — po změně geometrie ji
  bylo nutné přepsat (`24,0` → dvojice `24,−2` / `24,2`), jinak setter hází
  výjimku a spadne celý test-mapr.
- **Kotvy hashů v test-mapr se měnily DVAKRÁT** (nejdřív geometrie, pak
  přidání `t.riv` na mosty) — každá změna dlaždice je nová mapa. Předchozí
  sady jsou v komentáři u `KOTVY`.
- Most má `t.riv` (směr koryta kvůli modelu), ale **není říční pole** —
  test „na souši" proto kontroluje `terrain === "bridge" && !riverKeys().has(k)`,
  ne nepřítomnost `riv`.
- `BRIDGE_BOTH_ENDS` (v0.29 feature flag) zůstává vypnutý a je fakticky
  nadbytečný — nový model vynucuje „oba břehy" přirozeně tvarem grafu.

## PANELY REAGUJÍ NA KLIK HNED (v0.39, 2026-08-29)

Hlášení uživatele: „když kliknu na postavit budovu, ať se rovnou updatne,
že se to staví." Klik stavbu skutečně spustil (`me.build` se nastavil) a
handler i dělal `citySig = null; updatePanels()` — jenže překreslení
zablokovala ochrana proti přerušení rozepsaného formuláře:

    if (win.contains(document.activeElement) && document.activeElement !== win) return;

**Kliknuté tlačítko si drží focus**, takže tahle podmínka platila vždycky
a panel se překreslil až dalším tikem (stavba vypadala, že se nespustila).

- Nový helper **`rozepsanyVstup(el)`** vrací true jen pro `INPUT`/`SELECT`/
  `TEXTAREA` uvnitř `el` (tabulka `VSTUPY`) — tlačítka překreslení
  neblokují. Nahradil obě stará místa: `updateCityPanels` (okna města)
  i `updateTilePanel` (panel pole), kde platila TÁŽ vada — po „Postavit
  výspu" se panel taky překresloval se zpožděním.
- Ověřeno v prohlížeči: stavba → panel hned „staví se… 26 s"; výcvik,
  vylepšení i výspa reagují okamžitě; **rozepsaný jezdík ve výcviku
  zůstává chráněný** (focus i hodnota 137 přežijí vynucené překreslení).
- `panelHeld` (mezi mousedown a mouseup) zůstává beze změny — chrání klik
  před překreslením pod rukou.

## VÝDRŽ HRDINY VE VÝBĚRU POCHODU (v0.39, 2026-08-29)

Zadání uživatele: „když vybírám hrdinu, přidej kolik má staminy z kolika."
Dřív se výdrž ukazovala JEN u hrdiny doma a bez maxima (`výdrž 84`), takže
u hrdiny v poli nebyla vidět vůbec. Nový helper **`staminaTxt(me, heroIdx)`**
(`výdrž 84/100`, max z `heroStats(...).stamMax`) se používá v obou cestách
výběru: radiální kolo `showHeroPick` i rozbalovací seznam `heroOptionsHtml`
v panelu pole. Bublina kola má navíc v `title` cenu pochodu ve výdrži.
POZOR: varování na nedostatek výdrže do textu NEPATŘÍ — `heroReady` hrdinu,
kterému výdrž na cestu nestačí, ze seznamu odfiltruje dřív (byl by to mrtvý
kód). Ověřeno v prohlížeči: doma i v poli, kolo i seznam.

## ÚZEMÍ V LIŠTĚ, SEZNAM POLÍ A JEJICH ODEBÍRÁNÍ (v0.39, 2026-08-29)

Zadání uživatele: „na horní lištu kolik mám polí z kolika, klik = seznam
podle úrovně (nahoře největší), klik na řádek přemístí kameru, a pole jde
odebrat ze seznamu i z mapy — trvá to 5 minut."

**Herní část (game.js):**
- **`ABANDON_TICKS = 300`** (5 minut reálně). ZÁMĚRNĚ se NEškáluje délkou
  sezóny (`setSeasonHours`) — je to pojistka proti překliku a proti
  žonglování se stropem, ne herní rytmus.
- `abandonTile(f, tile)` nastaví `t.abandon` na kotvě bloku, `cancelAbandon`
  ho smaže, `canAbandonTile` hlídá zámky. Odpočet tiká v `tickWorld` vedle
  `uzelCd`/`okno`; `finishAbandon` pak pole (celý blok) zneutrálí přes
  `setTileOwner(t, -1)` a **obnoví posádku** stejným vzorcem jako generátor
  (`LEVEL_GARRISON[level] × (bigSize === 2 ? 2 : 1)`, u staveb `militia`).
- **Zámky:** kapitál (i podle `capKeyOf`), výspa, pole s vlastním hrdinou
  nebo s cílem vlastního pochodu, cizí pole. Pole během odpočtu pořád patří
  hráči a **počítá se do stropu** — místo se uvolní až doběhnutím.
- Bezpečné proti nesmyslnému `tileKey` z klienta: `bigAnchor(undefined)`
  vrací `undefined` a obě funkce mají `!a` zámek (ověřeno WS testem se
  4 nesmyslnými příkazy — server je odmítl a běžel dál).

**Síť:** `abandonTile`/`cancelAbandon` v `NET_CMDS` i serverových `CMDS`;
**`t.abandon` PŘIDÁNO do `tileOtisk`** — bez toho by se odpočet ke klientům
dostal až s plným snapshotem (1×/60 s).

**UI (main.js, index.html, style.css):**
- Odznak **`#land-chip` 🗺 X/strop** v horní liště (třída `.full` červeně na
  stropu), klik přepíná `#land-panel`.
- `updateLandPanel()` — panel vpravo (`right: 64px`, **vedle boční lišty**;
  s `right: 8px` ji zakrýval, ověřeno měřením překryvů), řadí kotvy bloků
  sestupně dle `tierOf`, členy bloků vynechává. Řádek = skok kamery
  (`tileToPixel` → `camera`) + výběr pole; 🏳 pošle pole vyklidit, u běžícího
  odpočtu je místo něj `↩ mm:ss` (zrušení). Vlastní podpis `landPanelSig`,
  aby se panel nepřekresloval každý tik.
- `abandonHtml(me, t)` přidává stejnou akci do panelu pole na mapě
  (`#btn-abandon` / `#btn-abandon-cancel`); `t.abandon` je v `tileSignature`.

**Ověřeno:** sólo v prohlížeči (odznak, řazení 130/60/60/30…, skok kamery na
pixel přesně, odebrání → odpočet → po 300 tikách neutrální pole s posádkou
160, zrušení z panelu i ze seznamu, zámky kapitál/výspa/hrdina), MP smoke
(dispatch + odolnost proti nesmyslům), testy `test-etapa3.js` sada 5
(13 asercí, celkem 63).

**PAST (stálo čas):** panel prohlížeče bez zobrazení má `innerWidth/Height`
**0**, takže `vw`/`vh` v CSS vyjdou na 0 px a měření rozměrů lže (panel
vypadal jako 26×22 px). Před měřením layoutu volat
`resize_window({width, height})` a na konci `preset: "desktop"`.

## DÁVKA 5 TRUHEL NARÁZ (v0.38, 2026-08-29)

Zadání uživatele: „5 truhel najednou za 1900 jader" (jednotlivě 5×400 = 2000).

- Jádro losování vytaženo do **`losujTruhlu(acc, tier, side, liveFaction)`**
  (bez placení a bez logiky denní truhly zdarma). `accountOpenChest` ho volá
  jednou, nová **`accountOpenChests(acc, tier, side, live, pocet)`** pětkrát.
  Návratový tvar jednotlivé truhly se NEZMĚNIL (jen přibylo `pocet`/`cena`).
- `CHEST_BULK = 5`, cena v `CHESTS[tier].bulkCost` (royal 1900);
  **`chestBulkCost(tier)`** má fallback `cost × CHEST_BULK`, takže případný
  další tier funguje i bez `bulkCost`.
- **Platí se jednou a atomicky** — při nedostatku jader se nestrhne nic
  a nevydá nic (ověřeno: 1899 💠 → `null`, zůstatek beze změny).
- **Denní truhla zdarma se dávkou NEspotřebuje** (hráč si ji vybere zvlášť,
  jinak by o ni dávkou přišel). Dávka proto vždy stojí plnou cenu.
- Počítadla smůly (`pity`, `pityInvite`) tikají normálně přes všech pět
  losování, takže dávka může vydat **víc zvacích listů naráz** → výsledek
  nese `invites: []` (a `invite = invites[0]` kvůli staršímu klientovi).
  `showChestReveal` i fronta oslav procházejí `invites`.
- Server bere počet **sám** (`msg.count > 1 ? CHEST_BULK : 1`) — klient si
  nemůže vynutit libovolnou dávku. `chestResult` nese `invites/pocet/cena`.
- UI: dvě tlačítka pod sebou (`.chest-btns`), na dávce zelený odznak úspory
  `−100`; odhalení má užší mřížku `.reveal-grid.bulk` se stropem výšky
  (15 karet) a odznak „5× truhla za 1900 💠".
- Ověřeno: sólo (cena, 15 věcí, atomicita, zdarma zůstalo), UI (17 karet
  včetně dvou listů, fronta oslav) a **MP po drátě** (WS smoke:
  `pocet=5 cena=1900 věcí=15 strany=zlo`). Testy: test-sin sada 5 (81 asercí).

## TRUHLY SE ŘÍDÍ FRAKCÍ HRÁČE (v0.38, 2026-08-29)

Hlášení uživatele: „když otevírám truhly zla, ať padají jen hrdinové a itemy
zla". **Samotné truhly byly čisté už od v0.9** — změřeno 3000 otevření na
každou stranu, nula cizích kusů, dárků i listů (`scratchpad/strany.js`).
Chyba byla o patro výš: **`chestSide` startoval natvrdo na `"dobro"`**, takže
hráč zla otevíral truhly DOBRA a fasoval výbavu, kterou mu `equipItem`
odmítne nasadit (ověřeno: hra za hordu → předvoleno „dobro" → 3 kusy dobra).

- `chestSide` je nově **`null` = „neřečeno"** a čte se přes
  **`stranaTruhel()`** = ruční volba, jinak `sideOfFaction(player().key)`,
  v lobby „dobro". Všechna ČTENÍ v `updateChestsPanel`/`openChestAction`
  jdou přes ni; zápis (klik na přepínač) plní `chestSide` dál.
- Ruční volba se **resetuje při startu hry** (`startGame` v main.js,
  `startNetGame` v net.js) — jinak by po přechodu na druhou stranu zůstala
  viset volba z minulé sezóny.
- Přepínač zůstává plně funkční (sbírka je trvalá a hráč smí sbírat i druhou
  stranu). Když se ale liší od strany frakce, panel ukáže **varování
  `.chest-warn`**: kusy odsud si na své hrdiny nenasadíš.
- Denní obchod byl v pořádku už dřív — `dailyShopHtml` bere
  `sideOfFaction(me.key)`, ne přepínač.
- Test (test-sin sada 5): 400 otevření na každou stranu, žádný kus/dárek/list
  z druhé strany. Celkem 73 asercí.

## ZVACÍ LISTY: JISTOTA MÍŘÍ VÝŠ + LIST NEPROPADÁ V DUPLIKÁT (v0.38, 2026-08-29)

Hlášení uživatele: „jistý list za 200 truhel by měl být legendární hrdina
(nebo aspoň 70/30 epický/legendární)" + „někdy mi to unlock vůbec nedá
nebo neukáže". Obojí potvrzeno měřením (`scratchpad/listy.js`, 20k losů).

- **`INVITE_PITY_TIER_W = [0, 30, 70]`** — jistota po `INVITE_PITY_AT`
  losuje jen mezi epickým a legendárním (70 % legendární). Běžný los má
  dál `INVITE_TIER_W = [70, 25, 5]`. `rollInviteHero(acc, side, jistota)`
  má nový 3. parametr; `accountOpenChest` mu předává, jestli list přišel
  z počítadla. Na „vždy legendární" stačí přepsat na `[0, 0, 100]`.
- **Přetečení vysbíraného tieru**: pooly se sbírají po tierech a když ve
  vylosovaném není koho odemknout, sjede se na **NEJBLIŽŠÍ** jiný tier se
  zamčeným hrdinou (při shodě vzdálenosti míří jistota nahoru, běžný los
  dolů). Duplikát (= `inviteDup`, 200 💠) tak zbude jen na kompletní
  sbírku strany. POZOR: „nejbližší", ne „nejvyšší" — první verze brala
  nejvyšší a běžný list se po vysbírání běžných změnil v automat na
  legendární (naměřeno 75 %); teď míří na epické (95 %).
- **Oslava odemčení už nezávisí na otevřeném panelu truhel.** V
  `showChestReveal` byl `if (!boxes.length) return;` PŘED blokem oslav —
  se zavřeným oknem truhel (jiná obrazovka, zavřený rail) se hrdina
  odemkl na účtu, ale hráči to nikdo neřekl. Kreslení karet je teď
  podmíněné (`if (boxes.length) sfx.play(...)`), oslavy běží vždy.
- **Změřená ekonomika listů (důležité pro další ladění):** při
  `INVITE_CHANCE` 2 % padne list průměrně každých 50 truhel, takže na
  200 otevření vyjde ~4 listy a **počítadlo smůly se uplatní jen v ~1,7 %
  případů** (0,98^200). Tiery listů proto v praxi řídí `INVITE_TIER_W`,
  ne pity tabulka — kdyby uživatel chtěl „hodnotnější listy" plošně, sahá
  se sem, ne na `INVITE_PITY_TIER_W`.
- Testy: `test-sin.js` sada 5 rozšířena (71 asercí) — jistota nikdy nedá
  běžného, ~70 % legendárních, nikdy duplikát, dokud je koho odemykat,
  přetečení na nejbližší tier, kompletní sbírka → duplikát.

## VÝSPU STAVÍ HRDINA NA POLI (v0.37, 2026-08-29)

Hlášení uživatele „ztratila se možnost stavět výspu". Kód výspy byl celý —
zavřela se CESTA k tlačítku. Změřeno v běžící hře: (1) ve větvi panelu
`heroHereIdx !== -1` tlačítko nikdy nebylo, a protože od v0.19 vítězná
armáda na dobytém poli ZŮSTÁVÁ (léčí se), je hrdina na čerstvě dobytém poli
pravidlem → hráč klikne a nevidí nic; (2) na startu vlastní hráč jen blok
kapitálu 3×3 (9 polí, `volne: 0`) a klik na člena vybírá kotvu → panel
kapitálu bez výspy; (3) radiální kolo výspu nenabízelo vůbec.

**Rozhodnutí uživatele:** vazba na hrdinu je ŽÁDOUCÍ — „hrdina ji na poli
staví i chrání". Tlačítko tedy patří do jeho větve, ne mimo ni.

- Nový sdílený helper **`lzeStavetVyspu(me, t)`** (main.js u forceTilePanel)
  zrcadlí podmínky `buildOutpost`: patriClenu && !structure && !big &&
  !bigSize && průchozí && ne most. Používají ho OBĚ větve panelu i kolo.
- Panel: tlačítko `#btn-outpost` přibylo do větve hrdiny (za blok usazení,
  před heroPinned) — binding `btnOp` je společný, id se nesmí duplikovat
  (větve jsou if/else, takže je vždy nejvýš jedno).
- Kolo (`tileMenuActions`): bublina 🗼 Postavit výspu staví rovnou
  (`buildOutpost` + `forceTilePanel`); podmínka `vyspaMozna` =
  `lzeStavetVyspu` && `canAfford` je spočítaná NAHOŘE ve funkci a akce
  `vyspaAkce` je sdílený objekt — nabízí se ve DVOU větvích: u hrdiny na
  poli (`!heroBusy`) i na vlastním poli BEZ hrdiny (na pokyn uživatele).
  Poslední větev proto přešla z `else if (anyReady)` na `else` s vnitřním
  `if (anyReady)` — kolo se tak otevře i tam, kde není volný hrdina
  k přesunu, ale výspa jde postavit. Bez peněz se bublina nenabídne
  (kolo pak zůstane prázdné a neotevře se — záměr: žádná akce, která
  by tiše selhala).
- **Opravena latentní vada**: původní tlačítko na prázdném poli testovalo
  jen `!t.structure`, takže na kotvě bloku 2×2 svítilo a klik tiše selhal.
- Tok po opravě ověřen v prohlížeči: tlačítko → `structure: "outpost"` →
  panel rovnou nabídne „⚑ Usadit se na výspě" → `h.zakladna` = to pole
  (REACH pak měří odtud). Na kotvě 2×2 se tlačítko nenabízí a `buildOutpost`
  vrací false. Nodová sada 14/14 zelená (main.js testy nenačítají).
- PAST: `node tests/vse.js` s BĚŽÍCÍM serverem na 8200 může spadnout na
  kolizi nad `server/data/accounts.json` (jeden běh selhal, po zastavení
  serveru 3× čistě) — testy pouštět bez běžícího testovacího serveru.
- Ověřená matice kola (prohlížeč): vlastní pole bez hrdiny → Přesun hrdiny
  + Postavit výspu; s hrdinou → Stráž / Posily / Výspa / Odvolat domů;
  bez volného hrdiny → jen Výspa (kolo se přesto otevře); bez surovin →
  prázdné. Cizí a neutrální pole, výspa i kapitál beze změny.

### Pasti v0.36 (nešlapat znovu)
- Rozpočty velení VŽDY v CP přes armyCp/uDef(f,k).cp — armyTotal je
  počet kusů a u sarnu (cp 2) podhodnocuje o polovinu.
- Ořez řeže POSLEDNÍ ZMĚNĚNÉ pole (zachovává zbytek nastavení) — neřadit
  „spravedlivě" přes všechna pole, hráče to mate.
- Oslava se NESMÍ spouštět z inviteRevealHtml (renderuje se i pro
  duplicitní list) — jen z showChestReveal filtrem type === "invite" /
  "unlock".
- Oslavu NIKDY nespouštět přímo z render helperů (giftRevealHtml apod.)
  — jen ze zpracování VÝSLEDKU (showChestReveal / oslavyZVysledku),
  jinak se slaví i při pouhém překreslení.
- Vědomé resty: klávesnice šipek na number inputech clamp obchází až po
  input eventu (řeže hned, ale vizuálně blikne max hodnota — kosmetika).
## INVENTÁŘ S IKONKAMI, FILTRY A SKLAD (v0.39, 2026-08-29)

Zadání uživatele: každý DRUH kusu má vlastní ikonku (dvě „Čepele z jam"
vypadají stejně, „Popelný sekáč" jinak), mřížka ukáže 50+ kusů naráz,
klik = detail, globální inventář s filtry (rarita, set), nepoužitelné
kusy úplně dospod v inventáři hrdiny.

**Druh kusu (game.js `itemZaklad`, export):** kmen jména bez přípony
vzácnosti — nejdelší shoda z generátorových poolů (ITEM_NAMES +
ITEM_SIDE_NAMES obou stran; krátký „Štít" nesmí ukrást „Štít poutníků");
sety = pevné jméno dílu, signature = celé jméno, neznámé jméno = fallback
na celé. Testy v test-truhly sada 8.

**Ikonky (main.js `itemArtURL` + cache):** deterministické SVG (vzor
skillArtURL — FNV hash → xorshift), ale hash jede z DRUHU a silueta se
řídí VÝZNAMEM jména (klíčová slova): zbraně meč/čepel/tesák × sekera/
sekáč × kladivo/palcát/drtič (koule s ostny) × kopí/oštěp × hůl × luk;
štíty pavéza/zeď (vysoký) × puklíř/terč (kulatý s puklicí) × kapkovitý;
zbroje plát/kyrys × kroužkovka (mřížka kroužků) × roucho/plášť/vesta;
přilby dóm × rohatá/maska × koruna/diadém/čelenka × kukla/kápě; boty
vysoké/nízké s detaily (okované, šněrované); rukavice × latnice (pláty)
× drápy. Detaily a proporce losuje hash (dva meče se liší), BARVY dává
rarita (obrys + podkladová záře v barvě RARITIES), signature nese zlatou
jiskru přímo v ikoně. Keš (druh|slot|rarita). Kontaktní arch:
tests/prehledka-ikon.js (vytáhne funkci ze zdrojáku do node).

**Mřížka + filtry:** `invTileHtml` (dlaždice s odznaky ★n / ✨n /
tečka setu / ☀🔥 u cizí strany), `invChipsHtml` (rarity tečky —
vícevýběr, select setů z vlastněných, ✕ zrušení), `invFiltruj`.
- Výbava hrdiny (🎒): mřížka `.inv-grid-v2` místo karet; řazení
  POUŽITELNÉ → rarita ↓ → hodnota ↓; kusy cizí strany VŽDY na konci
  a šedé; přepínač „jen použitelné"; klik na dlaždici = dnešní porovnání
  Vybraný/Nasazený + akce (beze změny). Stav `invFiltr`
  v heroWindowSig (JSON). Obsazený slot v řadě slotů ukazuje ikonku kusu.
- **Globální Sklad**: druhá záložka okna 💠 (chestTab truhly/sklad) —
  stejná mřížka + čipy slotů; za hry frakční zásoba, v sólo lobby účet
  (acct.local.inventory), v MP lobby `invItems` z profileMsg (server
  posílá celý inventář — kusy jsou malé; net.js ho drží
  v acct.remote.invItems, fail-open na starý server). Detail = karta
  kusu bez akcí (nasazování zůstává v okně hrdiny). Výběr = INDEX do
  vyfiltrovaného seznamu (kusy na účtu nemají id!) — filtry ho nulují.
- Kovárna a odhalení truhly ukazují tutéž ikonku (`.it-art-s`, `.rv-art`).

**Ověřeno (DOM asserce v prohlížeči):** 55 dlaždic naráz; blok cizí
strany souvisle NA KONCI; 51 unikátních ikon z 55 kusů (sdílí jen
duplicitní druhy); stejný druh = stejné URI, tři různé druhy = tři
ikony; filtr legend 55→14 (vše rar-4) a zpět; Sklad 55 dlaždic +
detail; klik na dlaždici otvírá porovnání. Sada + test-truhly ✅.

### Pasti v0.39 (nešlapat znovu)
- **Data-URI SVG je PŘÍSNÉ XML: duplicitní atribut shodí CELÝ obrázek**
  (prohlížeč ukáže placeholder chybějícího obrázku). Vzor `${detail}
  stroke="…"` (přepis atributu druhým) je proto zakázaný — akcentní čáry
  mají vlastní sadu `detailA`. Hlídá test-truhly sada 9: vytáhne
  itemArtURL ze zdrojáku a projede 105 druhů × 5 rarit regexem na
  duplicitní atributy — každý nový kreslicí kód projde automaticky.
- Ikonka se kešuje podle DRUHU — do hashe nikdy nedávat celé jméno
  (přípona by rozbila „stejný druh = stejná ikonka") ani id.
- itemZaklad hledá NEJDELŠÍ kmen — nové pooly jmen přidávat tak, aby
  žádný kmen nebyl prefixem jiného v JINÉM významu (prefix stejného
  druhu je v pořádku, vyhraje delší).
- Sklad v lobby MP žije z profileMsg.invItems — po každé změně skladu
  na serveru jde s profilem (chest/shop/sync už profileMsg posílají);
  nová serverová cesta měnící inventář musí poslat profil taky.
- Výběr ve Skladu je index do VYFILTROVANÉHO pole — při každé změně
  filtru/záložky nulovat (skladSel = -1), jinak detail ukáže cizí kus.
- Vědomé resty: ikonka nerozlišuje hvězdy/zušlechtění (odznaky na
  dlaždici ano — záměr, ať keš zůstává malá); stránkování mřížky není
  (500+ kusů = dlouhý scroll, řeší filtry); staré .item-card CSS
  zůstává (kovárna ho pořád používá pro seznam).

## PROMO RENDERY (v0.55, 2026-08-31) — `art/blender/promo.py`

Marketingové obrázky se **nekreslí zvlášť** — staví se z týchž figurek, které
hráč vidí ve hře. `promo.py` si načte `make_heroes.py` jako knihovnu (usekne
závěrečné `main()`, stejný trik jako `nahled_mapy.py` s `make_tiles.py`)
a postaví z nich filmovou scénu místo ortho spritovacího záběru.

```
blender -b -P promo.py                                    # všechny scény
SCENA=stretnuti RES=800 VZORKY=24 blender -b -P promo.py  # rychlý náhled (~25 s)
```

Scény (výstup `art/render/promo_<scéna>.png`): **stretnuti** 1920×1080 — Mara
z Dubové tvrze proti Ghazku Popelnému nad žhavou trhlinou, za nimi korouhve
a šiky; **sunborn** / **ashen** 1440×1920 — karty stran. Plný běh ~6,5 min
na procesoru (160 vzorků).

Svět scény: step Sunbornů na −X, popelná pláň Ashenů na +X, mezi nimi žhavá
trhlina podél x = 0. Barvy stran se berou z `SIDES` v `js/game.js`.

**PASTI (každá stála jeden běh)**
- **Kamera i plošné světlo hledí po svém −Z a euler se skládá jako Rz·Ry·Rx**,
  takže azimut je `atan2(dy,dx) − 90°`. S plusem míří objekt přesně opačně
  a render vyjde prázdný. Vzorec je v `natoceni_na()` — ruční eulery nepsat.
- **Kompozitor je v Blenderu 5.2 přes `scene.compositing_node_group`
  v pozadí nepoužitelný**: do vstupu skupiny se render nepustí a vypadne bílá
  plocha (ověřeno i s pouhým propojením vstup→výstup a se `use_nodes = True`).
  Bloom kolem trhliny proto dělá **řada bodových světel** (`zar_trhliny`).
- **Šum na zemi musí dostat souřadnice z `Object`.** Výchozí `Generated`
  normalizuje na obalový kvádr, takže přes plochu 60×60 projde jedna buňka
  šumu a povrch vyjde jako lino.
- **Přechod oblohy ukotvi na `Geometry → Incoming`, ne `Generated`.**
  `Incoming.z` je pří pohledu vzhůru ZÁPORNÉ (rozsah běží z kladné do záporné);
  `Generated` je 0..1 a přechod z něj vyjde celý nad hlavou.
- **Obloha svítí na celou scénu.** Při síle 1 zmizí stíny i barevné přísvity
  a AgX z toho udělá pastel — drž ji kolem 0,15 a doplň `exposure = −0,8`,
  jinak jsou frakční modrá i červená vybledlé.
- **Figurky jsou stavěné na 256px sprity — na detailní portrét nemají detail.**
  První verze karet stran byly polodetaily a bylo vidět, že věžový štít je
  holá deska. Funguje polocelek celého šiku s hloubkou ostrosti a mlhou.
- **Korouhevník nese žerď po té straně, na kterou je natočený**, takže kamera
  musí stát na opačné — jinak mu vlastní žerď stojí přes obličej.
- Figurky hledí na +X; tříčtvrteční natočení ke kameře je jediné, ve kterém
  je vidět zbraň. U zrcadlené strany se úhel k otočce o 180° **přičítá**.

## POSTPROCESSING 3D VRSTVY (v0.56, 2026-08-31) — EffectComposer

První bod plánu na zvednutí grafiky. Mapa neměla žádnou „vrstvu laku" — kreslila
se rovnou na plátno. Nově jede přes `EffectComposer`:

```
RenderPass → UnrealBloomPass → OutputPass → grading (ShaderPass)
```

**Pořadí je věcné, ne libovolné.** Bloom MUSÍ běžet v lineárním prostoru PŘED
tónovým mapováním (jinak se rozzáří i obyčejně osvětlený terén a ztratí se
rozdíl mezi „světlé" a „svítí"); kontrast, sytost, dělené tónování a vinětace
patří naopak až na hotový obraz za `OutputPass`.

### EXPOZICE BYLA HLAVNÍ VADA, NE CHYBĚJÍCÍ EFEKTY
Měření na Trůnu ukázalo, že obraz nemá **žádná světla**: p50 0,43 a p95 0,59,
tedy nic nad 60 % jasu. Proto mapa vypadala plocho a bloom neměl co rozzářit.
`toneMappingExposure` **1,05 → 1,9** dává p50 0,60 / p95 0,76 při přepalu 0,1 %.
Naměřená křivka (Trůn, kámen a popel):

| expozice | p50 | p95 | přepal |
|---|---|---|---|
| 1,05 | 0,433 | 0,593 | 0,08 % |
| 1,40 | 0,519 | 0,681 | 0,10 % |
| **1,90** | **0,593** | **0,750** | **0,11 %** |
| 2,60 | 0,692 | 0,837 | 0,19 % |

Samotný řetězec (při už opravené expozici) přidává **sytost +30 %**
(0,357 → 0,463) a dynamický rozsah +6 %.

### Stupně kvality
`R3.setKvalita("vysoka"|"stredni"|"nizka")`, volba se pamatuje v localStorage
`vp-kvalita`, bez ní se odhaduje z `hardwareConcurrency` a `pointer: coarse`.
**`nizka` řetězec ÚPLNĚ obchází** (kreslí se rovnou na plátno), takže na slabém
zařízení nestojí postprocessing ani pixel — a zároveň je to přesná záloha
původní cesty, takže se s ní dá A/B testovat, jestli nález způsobil composer.

### Ladicí přístupy na `window.R3`
`grade` (uniformy gradingu), `bloom`, `renderer`, `slunce`, `expozice` /
`setExpozice`, `stupnice` + `prestav()` (změna stupňů za běhu bez reloadu).

**PASTI**
- **Vlastní render target kvůli `samples`.** Výchozí cíl composeru je BEZ
  multisamplingu, takže přechodem na composer se ztratí vyhlazování z
  `antialias: true` a mapa vypadá ZUBATĚJI než předtím.
- **Tónové mapování ani sRGB se do render targetu neaplikují** (three je dělá
  jen při kreslení na plátno) — proto `OutputPass`. Bez něj je obraz tmavý
  a vybledlý.
- **`composer.setSize()` volá `setSize` na VŠECH průchodech**, takže si
  `UnrealBloomPass` přepíše rozlišení zpátky na plné a dělitel z konstruktoru
  je mrtvý knob (naměřeno: 1:1 a 1:2 stály stejně). `bloomPass.setSize` se
  proto obaluje. Pozor, `bloomPass.resolution` se přitom NEAKTUALIZUJE —
  skutečnou velikost čti z `renderTargetsHorizontal[0]`.
- **Plátno je průhledné** (alpha 0 mimo mapu, pod ním CSS gradient
  `#canvas-wrap`), takže každý průchod musí zachovat alfu. `OutputShader` mění
  jen `.rgb`, grading kopíruje `c.a`. A **kontrast se nesmí pustit pod 1,0**:
  `(b−0,5)·k+0,5` by při k<1 zvedl čerň nad nulu a kolem mapy by se objevil
  svítící závoj (plátno je premultiplied → RGB>0 při alfa 0 se skládá aditivně).
- **`renderer.info` s composerem lže.** Auto-reset nuluje čítače při každém
  `renderer.render()`, takže po composeru zbude jen poslední celoplošný čtverec
  (1 volání). Řeší `info.autoReset = false` + ruční `info.reset()` na začátku
  `render()`. Číslo teď zahrnuje CELÝ snímek včetně průchodů (~123 volání proti
  dřívějším ~88 jen za scénu).
- **Kompozitor Blenderu 5 tímhle NENÍ dotčen** — to je jiná věc (viz promo.py).

### ⚠ VÝKON SE NA VÝVOJOVÉM STROJI NEPODAŘILO ZMĚŘIT
GPU takty kolísají tak, že i referenční „bez řetězce" naměřilo v jednom běhu
4,9 ms a v druhém 11,2 ms; rozdíly mezi konfiguracemi se v tom ztrácejí.
`EXT_disjoint_timer_query_webgl2` je k dispozici a měření přes něj je
v historii sezení, ale **za směrodatné se brát nedá**. Než se postprocessing
zapne komukoli na mobilu, musí se přeměřit na cílovém zařízení.
Do té doby jsou stupně schválně konzervativní (`vysoka` má bloom ve čtvrtině
plátna, ne v polovině).

### Vendorované addons
`js/vendor/three/addons/postprocessing/` + `shaders/` (10 souborů, 288 kB
celkem i s dřívějšími). Tahá je skript, který si projde CELÝ strom relativních
importů — kopírovat ručně je past, `EffectComposer` si tahá `Pass`, `MaskPass`
i `CopyShader` a chybějící soubor se projeví až v prohlížeči.

## PROSTŘEDÍ A PŘESVÍCENÍ MAPY (v0.56, 2026-08-31) — druhý bod plánu grafiky

Postprocessing sám o sobě zvedl málo, protože **scéna neměla co zvýraznit**.
Tenhle krok dodal světlo, na kterém teprve řetězec pracuje.

### Mapa okolí: přechod 16×8 px → obloha 256×128 v HDR
`prostredi()` → **`nebeProstredi()`**. Do v0.55 to byl svislý přechod o osmi
řádcích, tedy „ať kovy nejsou černé". Nově je to analytická obloha: zenit →
obzor → odraz země, a v ní **sluneční kotouč o síle 40** (`pow(cos,220)*40`)
plus rozptyl kolem něj. Kovy, voda a lesklé povrchy tak mají co zrcadlit
a rozptýlené světlo přichází ze SPRÁVNÉHO směru místo z ploché polokoule.

- **`POSUN_SLUNCE`** je nově JEDNA konstanta pro `DirectionalLight` v `render()`
  i pro kotouč v mapě prostředí. Dřív bylo `(-18, 9, 11)` napsané jen v render()
  — kdyby se rozešly, odlesky by svítily odjinud, než odkud padají stíny.
- Váha se přesunula z `HemisphereLight` (0,26 → **0,12**) do
  `environmentIntensity` (0,35 → **0,40**): IBL z mapy okolí je směrově správné,
  polokoule jen plošně přisvětluje a zaplňuje stíny.

### Přesvícení: světlo nese SLUNCE, ne ambient
| | dřív | nyní |
|---|---|---|
| `DirectionalLight` | 3,0 | **6,0** |
| `toneMappingExposure` | 1,9 | **1,25** |
| `environmentIntensity` | 0,35 | **0,40** |
| `HemisphereLight` | 0,26 | **0,12** |

Celkový jas zůstal, ale nese ho směrové světlo, takže scéna má stíny.
Změřeno na pěti terénech (Trůn, kapitál, les, řeka, láva hordy), plně odhalená
mapa = nejhorší případ:

| | dřív | nyní |
|---|---|---|
| průměrný dynamický rozsah | 0,434 | **0,610** (+41 %) |
| nejhorší přepal | 0,88 % | **0,80 %** |
| p95 (světla) | ~0,59 | **0,80–0,85** |
| ztmavení mlhou války | — | 64 % |

### ⚠ DVĚ PASTI V MĚŘENÍ, KTERÉ STÁLY ŠPATNÉ ROZHODNUTÍ
- **Ladit na jednom místě mapy NESTAČÍ.** Konfigurace vyladěná na Trůnu
  (slunce 11 / expozice 1,4) měla na Trůnu 0,03 % přepalu — a na plně odhalené
  mapě **21,66 %**. Každý kandidát se musí projet přes všech pět terénů.
- **Zbytková mlha měření tiše zkazí.** `R3.render()` mlhu NEPŘENASTAVUJE, drží
  se poslední stav z `draw()`. Když je z předchozího kroku odhaleno 39 polí,
  je většina záběru na faktoru 0,2 a přepal vyjde skoro nulový, ať se nastaví
  cokoli. Před každým měřením proto **výslovně `R3.setFog(() => 1)`**.
- Fog je ostatně slabší, než by číslo 0,2 slibovalo (ztmavení 64 %, ne 80 %):
  `instanceColor` násobí jen difuzní složku, kdežto zrcadlová a IBL část
  projdou. Se silnějším prostředím to je vidět víc — zatím v pořádku, ale
  kdyby se prostředí ještě zesílilo, hlídat únik informace v MP.

### Stupně kvality zvednuté na rozpočet 30 fps
Rozhodnutí uživatele 31. 8. 2026: „je to tahová strategie, vzhled je přednější
než naprostá plynulost". Rozpočet je tedy 33 ms/snímek, ne 16,7 —
`vysoka` proto má bloom v plném rozlišení a 4× MSAA, `stredni` 2× MSAA
a bloom na polovině. **Pořád neproměřeno na cílovém zařízení** (viz varování
u postprocessingu výš).

### Ladicí přístupy (přibylo)
`R3.setProstredi(v)` / `R3.prostredi`, `R3.slunce.intensity`.

## ŽIVÁ HLADINA A DETAIL POVRCHU (v0.56, 2026-08-31) — třetí a čtvrtý bod grafiky

### Vlnící se řeka
Hladina je od v0.41 JEDNA souvislá deska přes celé pole, což je přesně ten
podklad, na kterém má smysl vlnit normálu — vlna přejde plynule přes celý tok
a nerozpadne se na dlaždice. Řeší to záplata shaderu (`vodaShader`), ne nový
model: tři vrstvy sinů různého měřítka a směru naklánějí normálu, `roughness`
klesá na 0,14 a `envMapIntensity` na 1,7, takže hladina zrcadlí novou oblohu.

Ověřeno měřením, ne okem: mezi dvěma snímky po 0,9 s se změnilo **30 % pixelů**
(přesně podíl vodní plochy v záběru), takže se vlny opravdu hýbou.

Ladicí uniformy `R3.voda.{sila,sklon,meritko,rychlost}`. **Měřítko je citlivé
oběma směry**: vyšší dá jemný ŠUM místo vln, nižší rozsvítí velké plochy naráz
(velký kus normál chytí oblohu a hladina zbledne).

### Detail povrchu v shaderu
Zapečené mapy mají 512/256 px na CELÝ dílek i s rekvizitami, takže při
přiblížení je povrch hladký jako plast. Řeší to procedurální hodnotový šum
naklánějící normálu, se silou řízenou PŘIBLÍŽENÍM (náběh zoom 1,6 → 3,2; níž
by z detailu bylo jen zrnění a aliasing). Naměřeno na dílku při zoomu 6,5:
místní kontrast **26,84 → 30,67**.

**PASTI (obě stály jeden pokus)**
- **`mix(normal, hrbol, s)` normálu NAHRAZUJE** a zapečený reliéf tím zředí —
  místní kontrast KLESL (24,97 → 23,31). Správně je přičtený vodorovný posun,
  který normálu jen NAKLONÍ.
- **Součin sinů je periodický**, takže z něj přes celou mapu vyjde pravidelné
  ŠRAFOVÁNÍ (vypadalo to jako moaré přes terén i stavby). A **metrika místního
  kontrastu to neodhalila — naopak ho pravidelný vzor hnal nahoru o 14 %.**
  Poučení: místní kontrast je proxy pro detail, ne pro „vypadá to dobře";
  pravidelný vzor ho maximalizuje. Vždycky se u toho podívat na obrázek.
  Nasazený je proto skutečný hodnotový šum s vyhlazenou interpolací.

### `pridejZaplatu()` — víc záplat na jednom materiálu
Na jeden materiál teď může padnout víc úprav shaderu (mlha + detail + voda).
Bez pomocníka je to past dvakrát: druhé přiřazení `onBeforeCompile` přepíše
první, a hlavně **`customProgramCacheKey` musí nést, KTERÉ záplaty na materiálu
jsou** — jinak si dva různě záplatované materiály sáhnou pro tentýž přeložený
program a jedna záplata se tiše ztratí. Klíč se skládá ze seznamu v
`material.userData.vpZaplaty`.

### Fotografické textury — ZKOUŠENO A ZAMÍTNUTO
Viz komentář v `art/blender/make_tiles.py` (`FOTO=1`). Shrnutí: CC0 sady
z ambientCG daly **+2,9 % detailu za o 40 % větší model**, protože ceiling je
rozlišení pečení (512 px na celý dílek), ne kvalita zdroje. Detail v shaderu
dal **+14 % zadarmo**. Kdyby projekt šel do nativního buildu s jiným rozpočtem
textur, je pipeline připravená.

### Přepínač kvality grafiky (v0.56)
Tlačítko `#btn-kvalita` v liště filtrů mapy (`#map-filters`) cyklí
✨ Vysoká → ✦ Střední → · Nízká a volbu si pamatuje v localStorage `vp-kvalita`.

Proč tam a ne do Profilu: hráč na kvalitu sáhne přesně tehdy, když mu mapa seká,
tedy ve hře — a **nesmí kvůli tomu být přihlášený** (Profil se bez účtu
nevykreslí). Tlačítko sedí v téže liště, ale filtr to NENÍ: obsluha filtrů ho
přeskakuje (`if (btn.id === "btn-kvalita") return;`) a nikdy nedostane třídu
`active`, aby to nevypadalo jako zapnutá vrstva mapy.

### Kotva mlhy války po přesvícení (v0.56)
Silnější prostředí propouští víc zrcadlové a IBL složky, kterou `instanceColor`
nenásobí, takže mlha nutně trochu slábne. **Změřeno u kapitálu, zoom 1,8:
ztmavení 64,5 % (nastavení jako před v0.56) → 62,8 % (nyní).** Pokles 1,7 bodu
je v pořádku; kdyby se prostředí zesilovalo dál, tohle je číslo, které se musí
hlídat — mlha je v multiplayeru ochrana proti úniku informace, ne kosmetika.
Měření: `R3.setFog(()=>1)` vs `R3.setFog(()=>0.2)` a poměr průměrných jasů.

## ADVERSARIÁLNÍ REVIZE v0.56 — 6 OPRAVENÝCH VAD

Změny v rendereru prošly revizí čtyř nezávislých pohledů (GLSL, three.js API,
integrace, výkon), každý nález pak samostatným pokusem o vyvrácení.
**Potvrzeno 6, zamítnuto 12** — což je zhruba očekávaný poměr a hlavní důvod,
proč ověřovací fáze dává smysl.

1. **`build()` shodil mlhu a hned se kreslil snímek — ÚNIK INFORMACE.**
   `build()` vrací `instanceColor` na odstín pole (faktor mlhy 1) a v `draw()`
   je hned pod ním `R3.render()`; mlha se nanášela až v `drawFogOverlay()`, tedy
   AŽ ZA vykresleným snímkem. Při každé přestavbě mapy (cizí výspa kdekoli na
   světě, přesídlení kapitálu, první stavba) se tak na jeden snímek ukázala CELÁ
   mapa odhalená. **Změřeno: průměrný jas 73,2 → 158.** Samotné `fogTik = -1`
   nestačilo — říká jen „nanést při nejbližším setFog". Opraveno v
   `render.js/ensureMap3D()`: `R3.setFog(fogFactor)` se volá rovnou po `build()`.
2. **`composer.dispose()` NEUVOLŇUJE průchody.** Vendorovaná verze sáhne jen na
   `renderTarget1`, `renderTarget2` a `copyPass`; `passes` neprochází. Každé
   přepnutí kvality tak nechalo na GPU 11 HalfFloat cílů bloomu a ~10 programů —
   po pár přepnutích ztráta kontextu, a to zrovna na mobilu, kde je přepínání
   nejpravděpodobnější. Opraveno cyklem `for (const p of composer.passes) p.dispose?.()`.
3. **Stínová mapa 2048² se překreslovala CELOU SCÉNOU každý snímek.**
   `shadowMap.autoUpdate` zůstal zapnutý. U tahové strategie kamera většinu času
   stojí — nově `autoUpdate = false` a `needsUpdate` se vyžádá jen při změně
   podpisu stínové kamery a po `build()` (`stinStav`). Ověřeno, že stíny nezmizely a po posunu kamery se přepočítají.
   **Naměřeno: 109 volání kreslení při pohybu kamery vs 61 na statickém
   snímku — tedy 48 volání ušetřených pokaždé, když hráč nehýbe mapou.**
4. **`ShaderPass` si uniformy KLONUJE** (`UniformsUtils.clone`), takže se
   doladěný grading při každé přestavbě řetězce tiše vracel na výchozí a
   `R3.grade` ukazoval na zahozený objekt. Drží se proto jedna živá sada
   (`gradeZive`) napříč přestavbami.
5. **Poměr pixelů se nastavoval jen v `init()`.** Mění se ale za běhu (přesun na
   jiný monitor, zoom prohlížeče) — přepočítává se nově v `resize()`, včetně
   `composer.setPixelRatio`.
6. **`DataTexture` má na rozdíl od `Texture` výchozí filtr NEAREST**, takže PMREM
   dostával schodovitou oblohu. Doplněno `LinearFilter` + `RepeatWrapping` na šev.

⚠ **Poučení k měřicím metrikám:** jeden z nálezů („detail zvedl místní kontrast
o 14 %") byl PRAVDIVÝ jako číslo a přitom vedl ke špatnému rozhodnutí —
pravidelné šrafování metriku maximalizuje. Místní kontrast je proxy pro detail,
ne pro „vypadá to dobře". U každé takové metriky se podívat i na obrázek.

## SEZÓNA, KTERÁ NEMŮŽE DOBĚHNOUT (v0.56, 2026-08-31) — DIAGNÓZA A DVĚ OPRAVY

Hlášení: „po přihlášení nejde zapnout hru, ukazuje to běžící sezónu, ale žádná
běžet nemá." Nebyla to náhoda ani rozbitá data — je to **stav, do kterého se hra
dostane sama** a neumí se z něj vyhrabat.

### Řetěz
1. **Výchozí délka sezóny je 336 hodin** (`parseFloat(process.argv[3]) || 336`),
   takže `start-server.bat` bez argumentů spouští čtrnáctidenní sezónu. Na
   vývojářském stroji, kde server neběží nepřetržitě, prakticky nikdy nedoběhne
   (naměřeno: tik 8 470 z 1 209 600, tedy 0,7 %).
2. **Délka se bere ze SNÍMKU, ne z argumentu** (v0.46), takže se dlouhá sezóna
   přenese přes každý restart, i když se argument mezitím změní.
3. **Obnovení snímku přepne rozvrh na „bezi"** (`obnoveno && ... rozvrh.zacni()`),
   čímž se ZAVŘOU ZÁPISY. Do další sezóny se nikdo nepřihlásí.
4. Hráč, který v `ucastnici` není, je v koncích: `posadDoSezony` ho odmítne,
   `posadPoPrihlaseni` **tiše returnuje** a ruční start z lobby taky ne
   (`zacniSezonu` chce `phase === "lobby"`).
5. A domov mu přitom sliboval „*přihlas se k účtu a vrátíš se rovnou do světa*".

### Opravy
- **`lobbyState` nese nově `vSezone`** — je tenhle hráč účastníkem běžící sezóny?
  (`ucastnici.has(klicHrace(p, forToken))`). Domov podle toho rozlišuje DVA stavy
  místo jednoho: účastníkovi řekne, že ho server vrátí sám, ostatním rovnou, že
  do téhle sezóny nepatří — a nabídne „Hrát hned s přáteli".
- **Obnovení sezóny se hlásí do logu**: kolik zbývá, že jsou tím zavřené zápisy,
  a při zbytku nad 24 h i varování s postupem na čistý start. Tenhle stav se
  v gzipovaném snímku hledá mizerně.

### Odblokování běžící sezóny
Restart NESTAČÍ — odcházející proces si snímek zapíše zpátky. Buď z konzole
prohlížeče `netSend({ type: "backToLobby" })` (kdokoli smí; smaže snímek a zavolá
`rozvrh.dalsi()`, takže se zápisy otevřou), nebo ručně v pořadí
**zastavit → smazat `data/sezona.json.gz` → spustit**.

### ⚠ TESTOVACÍ SERVERY MUSÍ MÍT `VP_DATA`
Konfigurace `vp-test-8200` a `vp-test-8300` v `E:\Claude\.claude\launch.json`
běžely BEZ `VP_DATA`, tedy nad ostrými daty v `server/data` — souběžně s živým
serverem na 8123 tikaly tutéž sezónu a přepisovaly týž snímek. Nově jedou přes
`--env-file=E:\Claude\.claude\test-data.env` do `E:\Claude\.claude\test-data`.
Ověřeno, že si tam vyrobí vlastní `rozvrh.json` i `ucty.db` a do `server/data`
nesáhnou. **Každá nová testovací konfigurace musí mít `VP_DATA` taky.**

## ÚČET SE ZOBRAZUJE NA DVOU MÍSTECH (v0.56, 2026-08-31)

Hlášení: „po přihlášení se nic neupdatne, musím dát F5". **Přesný příznak se
nepodařilo reprodukovat** — obě přihlašovací cesty (domov `dom-acc-go`
i lobby `btn-acc-go`) překreslí správně, ověřeno i s naklonovanou sbírkou
z ostrého účtu. Našly se ale dvě věci ve stejné rodině:

### Odhlášení na domově nepřekreslilo lobby (OPRAVENO)
Účet se ukazuje na DVOU místech: hlavička domova a `#acc-box` v lobby.
Přihlášení překresluje obojí (net.js volá `renderAccBox()` i `renderDomov()`),
**odhlášení na domově ale volalo jen `renderDomov()`** — v lobby pak dál svítilo
jméno účtu i s jádry, přestože `acct.remote` už bylo `null`. Doplněno
`renderAccBox()`. Nová obrazovka, která ukazuje účet, musí do obou cest.

### Překreslení po přihlášení běží po kusech (OPRAVENO)
V `net.js` se v obsluze zprávy `account` překresluje PĚT nezávislých kusů
rozhraní za sebou. Výjimka v kterémkoli z nich **tiše ukončí celý handler**
(je to posluchač zprávy) a zbytek se neprovede — hráč zůstane koukat na
odhlašovací obrazovku, dokud nedá F5, a v konzoli není nic. Každý kus proto
běží zvlášť přes pomocníka `prekresli(co, f)`, který pád zaloguje jménem
(`[účet] překreslení „domov" selhalo: …`). Kdyby se hlášení opakovalo, tohle
řekne KTERÝ kus padá.

## DÉLKA SEZÓNY SE UKAZOVALA JINÁ, NEŽ JAKÁ BYLA (v0.56, 2026-08-31)

Hlášení: domov psal „délka 60 minut" u sezóny, která má běžet 14 dní.
Nebyl to překlep v datech — **délku drží DVA nezávislé zdroje**:

| kde | co to je |
|---|---|
| `game.setSeasonHours(SEZONA_HODIN)` (server.js) | co sezóna OPRAVDU trvá |
| `rozvrh.delkaHodin` | co se NAPÍŠE hráči na domově |

`zacniSezonu` se rozvrhu na délku **nikdy neptá**, takže je to čistě inzerát —
a ten se může rozejít se skutečností. Rozešel se řetězem tří věcí:

1. `nacti()` srovnávalo `delkaHodin` podle argumentu serveru jen ve fázi
   `"zapisy"`. Stačilo, aby při startu serveru běžela sezóna (fáze `"bezi"`),
   a srovnání se přeskočilo.
2. U hráče byla při každém startu fáze `"bezi"` — kvůli zaseknuté sezóně
   (viz „SEZÓNA, KTERÁ NEMŮŽE DOBĚHNOUT"), takže se hodnota nikdy nesrovnala.
3. `dalsi()` `delkaHodin` nepřepisuje, takže stará jednička přežila přes
   sezóny 6, 7 i 8.

**Opraveno**: `nacti()` srovnává délku BEZPODMÍNEČNĚ a rozdíl hlásí do logu
(`[rozvrh] délka sezóny srovnána podle serveru: 1 h → 336 h`). Ověřeno pro
fázi `zapisy` i `bezi`; po startu má rozvrh 336 a domov píše „14 dní".

⚠ **Zůstává návrhové omezení**: protože `zacniSezonu` délku z rozvrhu nečte,
NELZE naplánovat sezóny různých délek — každá je taková, s jakou se spustil
server. Kdyby to bylo někdy potřeba, `delkaHodin` se musí stát skutečným
zdrojem a `zacniSezonu` ho musí předat do `setSeasonHours`.

## KONTAKTNÍ ZASTÍNĚNÍ A PROTI TAPETĚ (v0.56, 2026-08-31) — PLAN IV-J body 1 a 4

### SSAO (GTAO) — bod jedna plánu
PLAN.md IV-J ho má jako *„největší rozdíl za nejmenší práci"* a přesně říká proč:
**zapečené AO je PER MODEL**, takže dlaždice neví, že vedle ní stojí hradba —
a všechno vypadá nalepené na zem. Screen-space zastínění to spočítá až ze scény,
tedy včetně sousedů. Nasazen `GTAOPass` (vendorováno i s `GTAOShader`,
`PoissonDenoiseShader` a `SimplexNoise`).

Řetězec je nově **RenderPass → GTAO → Bloom → OutputPass → grading**. AO patří
před bloom a před tónové mapování: zatmavuje v lineárním prostoru, takže na
ztmavených místech pak správně nekvete ani bloom.

**Ověřeno rozdílem snímků (ne okem):** SSAO **ztmaví 45,6 % pixelů, nezesvětlí
ani jeden**, průměr −4,5 úrovně jasu, maximum −81.

**Poloměr laděn měřením** (podíl ztmavených pixelů): 0,3 → 42,5 %, 0,55 → 45,6 %,
**1,0 → 46,8 %**, 2,0 → 46,8 %, 4,0 už kontakty MÍJÍ a spadne na 36,8 %.
Nasazeno 1,0; dílek má na šířku 2,4 jednotky, takže stín drží u paty stavby.

**Cena (deterministicky, volání kreslení / trojúhelníky na snímek s pohybem
kamery):** nízká 66 / 5,63 M, střední 81 / 5,63 M, **vysoká 116 / 8,22 M**.
SSAO tedy přidává **celý další průchod geometrií** (+2,6 M) — proto běží jen
na vysoké kvalitě.

**⚠ PAST, KTERÁ STÁLA NEJVÍC ČASU: GTAO NÁSOBÍ I ALFU.**
Blend materiál má `blendSrcAlpha: DstAlphaFactor` a shader zapisuje
`gl_FragColor = vec4(mix(vec3(1.), texel.rgb, intensity), texel.a)` — tedy alfu
z AO textury. Na neprůhledném plátně je to neškodné. Naše plátno je ale
PRŮHLEDNÉ a premultiplied, takže alfa klesla, RGB zůstalo, a pod obraz se
ADITIVNĚ přimíchal CSS gradient: scéna **zesvětlala a zamlžila se** místo aby
ztmavla. Řeší `blendSrcAlpha = ZeroFactor, blendDstAlpha = OneFactor`
(výsledná alfa = alfa cíle). **Každý nový průchod je nutné prověřit na alfu.**

Diagnostika, která to našla: `R3.ssao.output` (3 = normály, 2 = hloubka,
4 = jen AO). Normály se kreslily bezvadně → G-buffer je v pořádku → chyba je
až ve skládání. Bez toho bych ladil poloměr donekonečna.

### Proti tapetě: otočení dlaždic po 90° (bod 4, zadarmo)
Všechna pole téhož biomu sdílejí jeden model i jednu zapečenou texturu, takže
se plocha čte jako kopírovaná tapeta. Dílek je čtverec otočený o 45°, takže
otočka o NÁSOBEK 90° ho zobrazí na sebe sama — mřížka drží, sousedé lícují,
a přesto se rozházejí stromy, kameny i vzor textury. Úhel je deterministický
(FNV z klíče pole), takže po přestavbě mapy neposkočí.

**Nestojí to nic**: otočka jde do matice instance, kterou renderer skládá
stejně (85 volání před i po). Naměřené rozdělení přes ~2 900 dlaždic:
814 / 689 / 651 / 784 na čtyři směry.

⚠ **Jen SYMETRICKÉ dílky** — regulární výraz `OTACIVE` pouští pouze
`<rod>_<plains|forest|hills>` a `res_*`. Břehy řek, mosty, hradby i stavby mají
„předek" a otočka by je rozbila. Bloky 2×2 a 3×3 se neotáčejí vůbec: zvětšená
kotva kryje víc polí a otočka by ji posunula mimo blok.

## „PŮLKA MAPY CHYBÍ" (v0.67, 2026-09-01) — HLÁŠENÍ UŽIVATELE

> „proč se to generuje takhle a ne jako celý čtverec? tam skoro půlka mapy chybí"

**Generátor byl v pořádku.** Změřeno: `newGame` vyrobí plný Čebyševův čtverec
**4 761 polí bez jediné díry**, rozsah q i r přesně −34..34, 26 % vody.

Chyběla až cesta k hráči. Byly to TŘI vady na jedné příčině — **AOI z etapy 11**.

### 1. Klient dostal 70 % mapy a zbytek se neměl čím vykreslit

`aoiKlice` posílá kosočtverec `AOI_R = 55` kolem zájmových bodů hráče. Na
69×69 z toho vyjde **3 352 ze 4 761 polí = 70,4 %**. Co v `G.tiles` není,
renderer nevykreslí — ani mlhou, ani siluetou, prostě nic.

A protože je okruh v mřížce KOSOČTVEREC a projekce ho otočí o dalších 45°,
je jeho hranice na obrazovce **rovná čára napříč celým diamantem**. Nevypadá
to jako mlha války, vypadá to jako vada zobrazení:

```
# = klient má, . = server má ale NEPOSÍLÁ
........####
.....#######
..##########
.###########
....########
```

**Oprava: na malém světě se AOI vůbec nepoužije.** `AOI_CELA_MAPA_DO = 6000`
polí (svět do 77×77, tedy zhruba 50 hráčů) — pod tím jde celá mapa.
Změřeno, co to stojí: plný snímek dlaždic 69×69 je 478 kB JSON, **po kompresi
34 kB**, a jde jednou za 60 tiků. Při 48 hráčích to dělá **0,22 Mbit/s**.
Nad stropem AOI nastupuje dál a dělá přesně to, kvůli čemu vzniklo (na
461×461 by celá mapa byla 21 MB na hráče).

⚠ `tests/int-aoi.js` běží na 121×121 = 14 641 polí, tedy nad stropem —
AOI se tam pořád testuje (31 % mapy) a test prošel beze změny.

### 2. Neznámá půda se nekreslila vůbec (`kresliNeznamouZemi`)

I nad stropem musí být vidět, že tam svět POKRAČUJE. Klient ví ze `MAP_R`,
kde svět končí, takže se pole, která nedostal, vyplní jednou tmavou barvou.
**Jen silueta** — žádný terén, žádný vlastník, žádná posádka; po drátě to
nestojí ani bajt a hráč se nedozví nic, co dosud nevěděl.

⚠ Kreslí se JAKO PRVNÍ do `mapLayer`, pod všechno ostatní: pod neznámou zemí
není 3D terén, takže by přes ni jinak prosvítalo pozadí stránky.

⚠ **Barva se musela ladit měřením.** První pokus `#141922` měl jas 24,6 —
a pozadí stránky (`linear-gradient(#131922, #0d1117)`) má 24,4. Silueta tedy
nebyla vidět VŮBEC a mapa vypadala useknutá dál. Neprozkoumaný terén pod
mlhou má 63, takže `#212834` s jasem 39 sedí zřetelně nad prázdnotou
a zřetelně pod zemí, kterou hráč zná.

### 3. Hranice světa se počítaly ze ZNÁMÝCH polí

`computeWorldBounds` scanoval `G.tiles`, takže se svět „zmenšil" na to, co
zrovna dorazilo. Padly na to dvě věci naráz:

- **`draw()` podle těch mezí OŘEZÁVÁ KAMERU** — hráč se do neznámé části mapy
  vůbec nemohl podívat,
- **minimapa podle nich škáluje** — měřítko i rámeček pohledu se posouvaly,
  kdykoli přibyl kus mapy.

Nově se počítají z `MAP_R`: svět je čtverec |q|,|r| ≤ MAP_R, jehož rohy leží
na (±2·KOSO·MAP_R, 0) a (0, ±2·KOSO·MAP_R·ISO_SQUASH). Scan přes dlaždice
zůstal jako záloha pro lobby a pro starší server, který `mapR` neposílá.

Minimapa dostala tutéž siluetu, ale **jedním čtyřúhelníkem přes rohy čtverce**
— schody dlaždic jsou v jejím měřítku pod jeden pixel a per-pole průchod by
na 461×461 znamenal 212 000 obdélníčků za tik.

### Co to NENÍ

Svět se vykresluje jako **diamant, protože je to čtverec otočený o 45°** —
to je záměr od v0.21 (vzhled předlohy: prstence hradeb jako osové čtverce,
řeky vodorovné a svislé). Rohy diamantu JSOU rohy čtverce, nic tam nechybí.

## 3D FIGURKY HRDINŮ (v0.66, 2026-09-01) — PLAN IV-J bod 7, POSLEDNÍ Z ETAPY 12

Do v0.65 byli hrdinové JEDINÁ věc na mapě, která zůstala 2D. Při přiblížení to
byla největší trhlina ve hře: terén měl stíny, kontaktní zastínění i vzdušnou
perspektivu, a přes něj stál plochý panáček bez jediného z toho.

### `art/blender/make_hrdiny_modely.py` — 49 figurek jako .glb

```
blender -b -P make_hrdiny_modely.py                  # všech 49
ONLY=hero_aldar blender -b -P make_hrdiny_modely.py  # jen některé
```

Stavitele si načte z `make_heroes.py` (usekne závěrečné `main()`, stejný trik
jako promo.py a make_models.py), takže **figurka a její portrét vznikají z týchž
funkcí** a nemůžou se rozejít. Výstup `art/models/hrdinove/*.glb`, Y nahoru,
nohy v počátku, figurka hledí k +X.

**Barvu nesou VRCHOLY, ne textury — a je to jiné rozhodnutí než u dílků mapy.**
Dílek má procedurální šum, který se musí spočítat dopředu (proto pečení
v `make_models.py`); figurka je složená z hladkých primitiv v plochých barvách,
takže se zapékat nemá co. Vrcholové barvy zvládnou totéž zadarmo: 20–40
materiálových slotů splyne do dvou, model váží ~110 kB bez jediné textury,
a na obrazovce má figurka ~40 px, takže by se rozdíl stejně nedal poznat.

**⚠ Kovovost se do vrcholu uložit NEDÁ** (glTF má jen COLOR_0). První verze
slila všechno do jednoho materiálu s `metalness = 0` a ocel, železo i zlato
vypadaly jako **bílý plast** — zbroj a zbraně přišly o veškerý lesk. Kov proto
dostal vlastní slot (`metallic 0.85`), zářivé díly (krystaly, žhavá ostří,
sféry mystiků) po jednom na každou barvu záře. Na figurku to dělá 2–3 sloty
místo jednoho a **stojí to za to**.

⚠ Sílu záře drž nízko (`min(1.6, blender × 0.45)`) — hra jede přes ACES a bloom,
takže blenderová síla 2–4 udělá z drobné koule bílou kaňku.

**Celkem: 49 figurek, 70 558 trojúhelníků (průměr 1 439), 5,6 MB.**

### Načítání AŽ NA VYŽÁDÁNÍ

5,6 MB je tolik co celý terén, ale hráč potká za sezónu pár druhů. `R3` proto
model stahuje, teprve když se objeví na mapě; než dorazí, figurka prostě není.

### `R3.setFigurky(seznam)` — polohy počítá pořád `render.js`

Sběr zůstal ve 2D vrstvě, protože polohy vznikají tam (interpolace pochodu,
rozestavení kolony, sloty hrdinů na poli). Každý snímek se naplní `figurky3d`
a na konci `draw()` se pošlou do R3. Jediné místo, kde se rozhoduje 3D × sprite,
je **`kresliFigurku()`** — bere tentýž objekt, jaký brala `drawHeroFigure`.

⚠ Seznam se do 3D dostane o **JEDEN SNÍMEK POZDĚJI**: `R3.render()` běží na
začátku draw(), kdežto polohy vznikají až při kreslení překryvu nad ním. Při
60 snímcích je to pod 2 px a nestojí za druhý průchod mapou.

**⚠ Sedmý hrdina každého rodu (ranhojič z v0.52) NEMÁ v Blenderu stavitele** —
`make_heroes.py` má smyčku `range(6)`, takže mu chybí sprite i model. Do v0.65
ho kreslila vektorová silueta; bez výslovné zálohy by byl ve 3D **NEVIDITELNÝ**.
Proto `R3.stavFigurky(klic)` vrací `"ano" | "nacita" | "chybi" | "neni"` a při
`"chybi"` se kreslí dál 2D. (Skutečná oprava je dodělat stavitele — výtvarný
dluh vedle keepu 5×5 a klanové pevnosti.)

### Jas: figurka je stavěná pro RENDER SPRITU, ne pro herní scénu

Ocel má základ 0,72, kdežto tráva zapečená v dílku kolem 0,15 — hrdina proti
mapě prostě SVÍTIL. Změřeno při zoomu 5 na plně odhalené mapě (terén má
průměrný jas 157):

| `R3.figurka.jas` | jas figurky | přepálených pixelů |
|---|---|---|
| 1,00 | 185 | **12,1 %** |
| 0,75 | 155 | 3,5 % |
| **0,72** | **154** | **~3 %** |
| 0,55 | 134 | 0 % |

Vzato **0,72**: figurka sedí na jasu terénu a přepálí jen odlesky na zbroji,
které tam patří. Ztlumení je knob RENDERERU, ne vlastnost modelu — proto se
dělá až v `setFigurky`, ne ve vrcholových barvách.

### Kontaktní stín místo vrženého

Figurka **nevrhá skutečný stín schválně**: stínová mapa se od v0.56 přepočítává
jen při pohybu kamery (`shadowMap.autoUpdate = false`), takže by pochodujícímu
hrdinovi zůstal stín stát na místě. Měkká skvrna pod nohama drží figurku při
zemi za zlomek ceny.

**⚠ Stíny jsou JEDNA INSTANCOVANÁ DÁVKA.** Se samostatnou deskou u každé
figurky stálo 10 figurek **40 volání kreslení místo 20** — polovinu spolykaly
skvrny o pár pixelech. Takhle je celá sada za jedno volání, ať jich je kolik chce.

### Cena (změřeno rozdílem s figurkami a bez nich)

| v záběru | zoom | volání kreslení | trojúhelníků |
|---|---|---|---|
| 30 figurek | 1 | **+62** | +75 060 |
| 30 figurek | 2 | +54 | +65 648 |
| 30 figurek | 4 | +24 | +27 888 |
| 1 figurka | libovolný | +2 až +3 | +2 208 |

Tedy **~2 volání na figurku** (tělo + kov) a jedno navrch za celou dávku stínů.
Třicet figurek naráz je krajní případ (odhalená mapa se všemi AI hrdiny);
v běžné hře jich mlha většinu skryje. **Rest: kolona domobrany by šla složit
do InstancedMesh** — všechny její figurky jsou tentýž model, takže by z ~14
volání bylo jedno. Zatím to nebolí.

### Co zůstalo ve 2D

Praporečník a vůz v čele kolony (`drawBannerman` / `drawWagon`) — míchat plochou
kresbu s 3D figurkami v jedné koloně vypadá hůř než jednotný zástup, takže
kolonu tvoří domobrana a v čele hrdina. Ve 2D zůstávají i **figurky střetu**
(`drawClashes`), jmenovky, praporky a kolečka na poli.

**PASTI PŘI OVĚŘOVÁNÍ (obě stály čas)**
- **Panel prohlížeče bez zobrazení má `innerWidth` 0**, takže `R3.resize`
  dostane nulu, ořízne se na 1 a kamera má výřez 0,008 jednotky. Terén pak
  vyplní obraz jedním texelem (jas vyjde 217 a vypadá to jako přepal) a figurky
  jsou mimo záběr — celé to vypadá, jako by se nekreslily. Před měřením proto
  `resize_window({width, height})` a `resizeCanvas()`.
- **Vlastnictví a polohy nastavené z konzole přepíše nejbližší snímek ze
  serveru.** Na scénu je nutné vyřadit `applySnapshot` — a pak vyprázdnit
  `f.marches`, protože pochod, jehož konec už není v AOI, shodí `draw()`.

## VZDUŠNÁ PERSPEKTIVA A CESTY (v0.64, 2026-08-31) — PLAN IV-J bod 5

### Vzdušná perspektiva
U ORTOGRAFICKÉ kamery je závoj dálky **jediný signál hloubky, který zbývá** —
perspektivní zmenšování ortho nemá, takže bez něj leží zadní okraj mapy ve
stejné rovině jako přední a celé to čte jako stolní desku.

**Vztažný bod je OHNISKO kamery (střed plátna), ne kamera.** Kamera stojí 220
jednotek daleko, takže od NÍ počítaný závoj leží na celé mapě skoro stejně
a jen ji vybledlí. Takhle je nula uprostřed obrazu, závoj přibývá dozadu
a bližší (dolní) půlka plátna zůstává čistá. Náběh je Beerův zákon
(`1 − exp(−dH/45)`), ne lineární — lineární udělá přesně v ohnisku hranu.

Kamera je nakloněná o 55°, takže posun o v jednotek nahoru po plátně znamená
+v·tan(55°) = +1,43 jednotky hloubky. **Závoj se tím s přiblížením VYTRATÍ SÁM**
a předá štafetu tilt-shiftu (ten naopak najíždí až od zoomu 2,2). Změřeno na
sytosti v horní třetině obrazu, plátno 1280×820:

| zoom | 0,5 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|---|
| sytost | **−41,6 %** | −26,7 % | −19,0 % | −15,3 % | **−13,5 %** |

Síla 0,55 je z měření: 0,55 → sytost −26,7 %, místní kontrast −18,8 %, jas
+8,6 %; 0,75 → −33,3 % / −24,4 % / +11,3 %. Vzato 0,55, protože v pozdní hře
je prozkoumaná celá obrazovka a ztráta čtvrtiny místního kontrastu v horní
třetině už je vada použitelnosti, ne efekt.

**⚠ Proč záplata materiálů, a ne `scene.fog`:** vestavěná mlha three se míchá
až ZA tónovým mapováním (`fog_fragment` je v shaderu za `tonemapping_fragment`).
Jenže při kreslení do render targetu three tónové mapování NEAPLIKUJE, takže by
stejná mlha vyšla jinak s composerem a jinak bez něj. Ověřeno, že takhle sedí
ve všech stupních: nízká −30,0 %, střední −26,3 %, vysoká −26,6 %.

**⚠ ZMĚŘENÁ PAST: závoj ROZSVĚCUJE neprozkoumaná pole.** Mlha války násobí
rozptýlenou složku, tedy se uplatní PŘED závojem; ten se pak přimíchá i tam,
kde hráč nemá co vidět, a ztmavení v horním pásu spadne z 63,9 % na 42,5 %
(síla 0,55), resp. 37,0 % (0,75) — v multiplayeru je to únik informace, ne
kosmetika. Řeší `mira *= vVzdMlha`, tedy vynásobení TOUŽ maskou: „tohle nevidím"
platí až NAD atmosférou. Po opravě je ztmavení 61,4 %, tedy prakticky beze změny.

Nestojí to ani volání kreslení, ani trojúhelník — je to pár instrukcí ve
fragmentu. Ladění: `R3.vzduch.{barva,delka,sila}`, `R3.ohnisko`.

### Cesty mezi vlastními poli

**⚠ Cesta NENÍ úsek mezi každou dvojicí sousedů.** Souvislý blok území má
souseda na každé vnitřní hranici, takže z toho vyjde přes celé území pravidelná
MŘÍŽKA — změřeno **21,9 % plochy obrazovky** při zoomu 3,2. A protože středy
sousedních polí leží ve směru HRAN kosočtverce, ta mřížka se navíc kryje
s mřížkou dlaždic a čte se jako obtažené hranice, ne jako cesty. Kostra přes
všechna pole je jen o polovinu řidší a vypadá stejně.

Cesta je proto to, co cesta ve skutečnosti je: **SPOJNICE STAVEB**. Vede
z kapitálu k městům, výspám a pevnostem nejkratší cestou přes vlastní půdu
(průchod do šířky = strom nejkratších cest, ostatní stavby se vrátí po
rodičích, sjednocení cest je síť). **Objeví se, až má co spojovat, a s každou
další výspou povyroste** — přesně „rostou se záborem". Změřeno: **5,4–6,7 %
plochy obrazovky** podle zoomu, 133 úseků na území se čtyřmi výspami.

- **⚠ Území rodu NENÍ souvislé** — mostní břehy jsou samostatné ostrůvky (voda
  cestu nenese). Jediný průchod z první nalezené stavby proto u rodu, jehož
  prvním polem je most, nenajde VŮBEC NIC (změřeno: síť hráče chyběla celá).
  Komponenty se berou po jedné, dokud je co spojovat.
- **⚠ Podpis musí nést i STAVBU**, ne jen vlastníka — postavená výspa síť mění,
  i když se vlastnictví polí nezměnilo.
- **Cesty mají VLASTNÍ skupinu `korenCest`**, ne `korenMapy`: `build()`
  korenMapy při každé přestavbě terénu vysype, jenže síť se mění jinak často
  a její podpis by se přitom nezměnil — vysypaná by se už nikdy nevrátila.
- **Není to instancované** — jedna sloučená geometrie na celou síť, tedy JEDNO
  volání kreslení (každý úsek má jinou délku i směr, instancování nedává smysl).
- **Mlha války jede přes VRCHOLOVÉ BARVY** (`mlhaNaCesty`): setCesty si pamatuje,
  který uzel patří kterému poli, a setFog přepisuje atribut `color`, ne geometrii.
  Kvůli tomu umí záplata vzdušné perspektivy vedle `USE_INSTANCING_COLOR` číst
  i `USE_COLOR`.
- **Uzel je rozházený** od středu pole (`rozhod` 0,24 deterministicky z klíče),
  takže cesta mezi poli kličkuje a nekopíruje mřížku. Šířka kolísá 0,78–1,22×.
- **Přes MOST se cesta nevede**, i když most je v grafu hrana (`bridgeTwin`):
  lávka má vlastní výšku i sklon a plochý pás v úrovni země by nad řekou visel.

**⚠ Výška: povrch desky je 0,14, ne 0,3.** Rekvizity (`res_*`) začínají na 0,14
— tam je zem; hodnota 0,3–0,4 v obalovém kvádru dílku jsou už trsy a ploty.
Cesta leží na **0,305**, tedy ~0,17 nad zemí, a s `polygonOffset`. Ověřeno
rozdílem snímků: **90,8 % pixelů cesty je vidět**, zbytek kryjí stromy
a rekvizity (správně).

**PAST PŘI OVĚŘOVÁNÍ V PROHLÍŽEČI (stála nejvíc času):** vlastnictví polí
nastavené z konzole **přepíše nejbližší snímek ze serveru** a síť se vrátí do
původního stavu — vypadá to, jako by kód nefungoval. Na scénu je nutné vyřadit
`applySnapshot`. A rAF ve skrytém panelu neběží, takže `ensureCesty()`
a `draw()` se musí volat ručně.

## TILT-SHIFT (v0.56, 2026-08-31) — PLAN IV-J bod 6

Úzký pás ostrosti, k okrajům rozostření. U ORTOGRAFICKÉ kamery to prodává
„tohle je fyzický model" mimořádně dobře — přesně tak vypadá makro snímek
dioramatu, a protože ortho nemá perspektivu, nedá se to splést s hloubkou
ostrosti skutečné scény.

Dva průchody na konci řetězce (vodorovný a svislý, devítitapý gauss):
oddělitelné rozostření dá při stejném počtu vzorků mnohem hladší výsledek než
jedno kruhové. Geometrii nepřidává — jen výplň.

**Ověřeno měřením ostrosti po pásech** (místní kontrast, zoom 4):
horní třetina **−32,2 %**, **střed −0,1 %** (netknutý), dolní třetina **−55,3 %**.

**⚠ ZÁMĚRNĚ JEN PŘI PŘIBLÍŽENÍ, proti liteře plánu.** Je to STRATEGIE: na
přehledovém pohledu hráč čte celou mapu a rozmazat jí horní a dolní třetinu je
vada použitelnosti, ne efekt. Síla proto najíždí se zoomem (nula do 2,2, plná
od 4,0) — stejný princip jako u detailní normály. Nezamýšlený zisk: **2D popisky
zůstávají ostré**, protože se kreslí na vlastní plátno NAD 3D, takže čísla jsou
čitelná i v rozostřené části.

**⚠ Alfa se rozostřuje SPOLU s barvou.** Plátno je premultiplied; kdyby se alfa
nechala ostrá a rozmazala jen barva, okraj mapy by se rozsvítil (RGB > alfa se
skládá aditivně) — stejná past jako u GTAO.

**⚠ Jméno `TILT` je zabrané** pro náklon kamery (55°) hned na začátku souboru.
Tilt-shift se proto jmenuje `NAKLON` / `NAKLON_SHADER` / `NAKLON_MAX`.

**Cena (volání kreslení / trojúhelníky na snímek s pohybem kamery):**
nízká 68 / 5,88 M, střední 83 / 5,88 M, vysoká 121 / 8,57 M.
Ladění: `R3.naklon.{stred,pas,nabeh,sila}`; vypnout jde `pas.value = 10`
(ostrý pás přes celou obrazovku).
