# Válka popela — technická předloha projektu

> **Účel souboru:** trvalá reference stavu projektu pro Clauda (načítá se automaticky při práci v tomto adresáři, přežije /compact). **Po každé větší změně tento soubor aktualizuj** — verzi, konstanty, nové systémy, gotchas.

## Co to je
Browser strategie inspirovaná LotR: Rise to War. Vlastní IP — svět **Vellar**, 4 frakce: **aldar** (Lidé, modrá), **yllien** (elfové, tyrkys), **durgar** (orkové, oranžová), **horda** (Šarakhové/démoni, červená). Uživatel komunikuje **česky**. Cíl: multiplayer pro partu kamarádů přes Node server + Tailscale.

**Aktuální verze: v0.21** (**MAPA NA ČTVERCE „NA KOSO"** — svět je čtvercová mřížka otočená na obrazovce o 45°, velký diamant jako v předloze; sousedé 4, vzdálenosti Manhattan, hradby prstenc jako čtverce s branami v rozích, řeky jako koryta přes rohy dílků; 2026-08-28. Dřív: v0.18 verbovací zakázka + tržnice + smůla truhel, v0.19 boj po formacích + obléhání, v0.20 pasivky výbavy + slovník stavů; v0.16 mapa ve 3D (three.js), v0.17 zapečené povrchy). Terén a stavby jsou 3D modely z Blenderu, hrdinové a efekty zůstaly 2D překryvem.

## Spuštění a soubory
- **Server:** `node server/server.js` → http://localhost:8123. Uživatel spouští `start-server.bat`. Testy: `node server/server.js 8200` na jiném portu (background, pak TaskStop).
- **launch.json:** config `valka-popela` (Node server), `valka-popela-static` (serve.ps1 fallback).
- **DŮLEŽITÉ:** po změně `js/game.js` nebo `server/server.js` musí uživatel **restartovat start-server.bat** (jeho živý server na :8123); klientské změny (render/main/style/html) stačí reload stránky. Vždy to připomeň v závěrečné zprávě.

| Soubor | Role |
|---|---|
| `js/game.js` | Veškerá herní logika, běží v prohlížeči I v Node (module.exports na konci — nové mutující funkce přidávej do exportů!) |
| `js/render.js` | 2D překryv: figurky hrdinů, pochody, jmenovky, mlha, filtry, efekty (+ souřadnice a stav kamery) |
| `js/render3d.js` | **3D vrstva mapy** (ES modul, three.js) — terén a stavby, `window.R3` |
| `js/vendor/three/` | Vendorovaný three.js 0.185 (mimo package.json) |
| `js/main.js` | UI: panely, radiální menu, verbování, top bar, overlay okna |
| `js/net.js` | MP klient — NET_CMDS přepisuje mutující globály na síťové příkazy |
| `server/server.js` | Autoritativní server: CMDS zrcadlí NET_CMDS, snapshoty G každý tik |
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
| `art/render/` | Vyrenderovaná PNG (sprity pro dnešní 2D renderer) |
| `art/blender/make_models.py` | Export týchž dílků jako **.glb modely** (3D větev) |
| `art/models/` | 45 .glb modelů se zapečenými texturami, 5,7 MB — vstup pro three.js/Unity |
| `art/srovnani-zapeceni.png` | referenční srovnání ploché barvy vs. zapečený povrch (horní řada v0.16, dolní v0.17) |
| `art/nahled-3d.html` | Vývojářský náhled 3D mapy (three.js, není součást hry) |
| `DESIGN.md` | Pravidla + roadmapa česky — **udržovat aktuální** |
| `REFERENCE-UI.md` | Předloha UI podle RtW (z videí) — rozvržení oken, itemy, reporty; číst před úpravami UI |
| `E:\Claude\reference-rtw\` | **Mimo projekt** (nesmí do buildu): archiv Fandom wiki mrtvé RtW — `REFERENCE.md` destilát (staty ~30 jednotek zlé strany, gramatika skillů velitelů, sezónní resety), `wiki/` surové stránky, `obrazky/` všech 370 stažených obrázků (48 MB; kity ~30 velitelů jen ve screenshotech, přepis na vyžádání). Wiki NEMÁ vzorec boje → přebírat poměry, ne absolutní čísla |
| `MULTIPLAYER.md` | Návod pro kamarády (Tailscale) |

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
- **Kořist z boje (v0.6.2)**: `dropLoot` ZRUŠEN — běžná pole/města/mosty nesypou nic. Jen `dropStructLoot(faction,heroIdx,tile,rarity,chance)` při **prvním dobytí z neutrálu**: throne → legendárka (4) jistá, fortress i grandfort → epika (3) s 50 %. Relikvie event: 60 🪙 + 15 💠 (už ne item). UI: `structLootTxt(t)` v main.js (panel + bublina, jen neutrální klíčové stavby); makeItem má 3. param fixedRarity; lootChances/rollRarity zůstaly jen pro makeItem bez fixní rarity (fakticky nevyužité). — weights rarit, setChance, lvl rozsah; `makeChestItem` používá **Math.random, ne rng** (truhly se otvírají i mimo hru). `CORE_CODES` {VITEJTE:200, POPEL50:50, VELLAR:100, PANVELLARU:1000000 (admin), **TEST100K:100000, TEST1K:1000 (ladicí)**} — server je může přepsat klíčem `codes` v accounts.json. Kódy podle `CODE_REPEATABLE` (`/^TEST/`) se do `codesUsed` nezapisují, takže je lze uplatnit **opakovaně** — pro testování truhel; ostatní zůstávají jednorázové. Nový účet startuje se 120💠 (ACCOUNT_START_CORES). **Skutečné platby NEjsou** — obchod ukazuje „připravujeme“; jádra jen z eventů a kódů.
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
  prochází serializací MP (tiles se posílají celé). Modely: `river_a/b`,
  `bridge_a/b` (podle t.riv), `wall_a/b` (pravidlo: shodná znaménka q,r → wall_a).
  Hradby a koryta jsou PÁSY od rohu k rohu — sousedé na sebe navazují.
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
4. Nová pole na G/tile se snapshotem přenesou automaticky (serializeState posílá celé G), ale zkontroluj `applySnapshot` pokud je potřeba merge (např. G.clashes).

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
(úhel = směr LÁVKY, koryto kolmo); `ctvercove_hradby()` sdílí city+capital_aldar;
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
