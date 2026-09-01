# Předloha UI podle Rise to War (z videí od Turgona)

> Referenční poznámky z ostudia dvou videí hráče Turgon (LotR: Rise to War):
> „Season 10 Update & Battle Report Review" (p5R5-o19xqc) a „Commander Review
> and Deep Dive" (OEo4SUBDHuI). **Ne vzhled Pána prstenů — jen rozvržení a
> chování.** Slouží jako šablona pro další úpravy UI Války popela.

## Obecné chování
- Hra je celá **mapa na celé obrazovce**; veškerá správa se otevírá jako
  **velká okna přes mapu** (ne postranní sloupec). Jedno okno naráz, jasný
  křížek, návrat vždy zpět na mapu. ✅ (od v0.5 máme lištu ikon + okna)
- Okna jsou **tmavá, s ornamentálním nadpisem nahoře** a obsahem děleným do
  tabů; důležitá čísla velká, doplňky malým písmem.

## Okno hrdiny („Commander") — hlavní předloha
- **Levý sloupec: svislý seznam portrétů všech hrdinů** — kliknutím se
  přepíná hrdina BEZ zavření okna (žádné otvírání každého zvlášť).
- **Střed: velká postava hrdiny** (u nás velký portrét / sprite figurky),
  nahoře jméno + třída (Warrior…) + úroveň/hvězdy + XP pruh (3330/4800).
- **Pravý okraj okna: svislé taby** — Stats / Portrait (strom dovedností) /
  Unique. U nás: Staty / Dovednosti / Výbava.
- **Řádek základních statů s ikonami** pod jménem (v RtW 4 čísla).
- **Dole vodorovná řada slotů výbavy** (ikonky, prázdný slot = obrys).

## Strom dovedností — „souhvězdí"
- Dovednosti jako **kruhové uzly propojené linkami do souhvězdí** na tmavém
  pozadí, každý uzel má **rank „7/15"** a jméno větve (Durin's Blood,
  White Council…). Tlačítko **Reset** v rohu (u nás respec za zlato).

## Výbava a itemy
- Výběr: **mřížka itemů vlevo**, po kliknutí **porovnání vedle sebe**:
  „Vybraný předmět" vs „Nasazený" — stat řádky se **zelenými + hodnotami**.
- Staty itemů jsou **kategorizované**: `[Commander] Might +28`,
  `[Army] Attack +18`, `[Unit] Attack (Large Unit) +60` — přesně naše
  dělení hrdina/jednotky. U nás: `[Hrdina] poškození +15`, `[Armáda] …`.
- Lepší kusy mají navíc **pojmenovanou pasivku s popisem** („Rend: útoky
  spojenců ignorují 12 % obrany cíle") + kurzívní flavor text.
- Tlačítka **Swap / Unequip**; varování „Equipped by another Commander"
  když item nosí jiný hrdina (u nás: item se přehodí — hlásit komu se bere).
- Rarita = barva rámečku + hvězdičky ★★★★.

## Bojové reporty
- **Seznam notifikací vlevo** (Victory / Failure / Draw + „15h ago"),
  tlačítko „Mark all as read". Nepřečtené zvýrazněné.
- **Hlavička reportu**: `[Aliance] Jméno` vs `Jméno [Aliance]`, **portréty
  velitelů proti sobě**, mezi nimi banner **VICTORY/DEFEAT**, u každého
  velitele úroveň a **HP pruh armády se ztrátami** (196 441/329 800).
- **Řádek odměn** s ikonami kořisti.
- **Detail „Total"**: dva sloupce (naše strana / nepřítel) s metrikami:
  Heavily Wounded · Dead · **Commander Damage** · **Soldier Damage** ·
  Damage Received · Total Healing (červená čísla nepřítele). Taby
  Overview / Allied / Enemy. — Skvěle sedí na naše hero dmg vs unit dmg;
  do našich reportů doplnit souhrn „poškození velitele × jednotek, léčení".

## Mapa
- **Karta události na mapě**: název (Dead Marshes), ⏳ trvání („Continues
  for 6d"), 👥 účastníci, 💀 mrtví, seznam zúčastněných aliancí. U nás
  jednodušší obdoba pro bandy/karavany/bouře.
- Špendlíky (pins) hráčů na mapě jako značky.

## Hlavní síň (profil)
- Karta: prapor, jméno + aliance, **Power/h, Total Merit, Land 195/216**
  a přehled surovin za hodinu — u nás by odpovídalo oknu 🏆 (skóre, výnosy).

## Stav implementace
1. ✅ Okno hrdiny: seznam hrdinů vlevo + velký střed + svislé taby
   Staty/Strom/Výbava (`renderHeroWindow`, `.hw` layout).
2. ✅ Porovnání itemů vedle sebe (`heroEquipTabHtml`): [Hrdina] kategorie,
   hvězdy rarity, ▲▼ zeleně/červeně, ⇄ Vyměnit / Sundat, filtr podle slotu.
3. ✅ Facelift bojového reportu (`renderReportWindow`/`reportHtml`): seznam
   bitev vlevo s nepřečtenými tečkami + „vše přečteno", portréty velitelů
   proti sobě s úrovněmi a HP, banner DOBYTO/UBRÁNĚNO, pruhy armád, souhrn
   Poškození velitele × jednotek (sim.tot v game.js), kola v <details>.
4. ✅ Strom dovedností jako souhvězdí (`constellationHtml`, CONST_POS,
   detail efektů s „Nyní/Další bod" přes `effText`).

---

# Audit podle videa „Commander Deep Dive" (2026-08-25, workflow 7 agentů, 39 nálezů)

> Porovnání okna hrdiny a systémů s předlohou (framy 180/420/760/1150/1560/2050/2620 s).
> Klíčová pozorování z předlohy: 6–8 uzlů souhvězdí s ranky 7–15 a jmény větví,
> zlaté ozdobné rámy uzlů + jiskřící spojnice, detail skillu s podmínkovými tagy
> ([Jízda], [proti orkům]) a „Max Level Effect", proc-efekty za kolo (follow-up,
> stun imunita, stacky), signature itemy s pojmenovanou pasivkou vázané na velitele,
> velká celopostavová grafika, úroveň až 50 + hvězdy reputace, tab Unique.

## Fáze 1 — Rychlé výhry ✅ (hotovo 2026-08-25)

- **Řada 4 velkých statů s ikonami** (dopad 4, pracnost 1) — V heroStatsTabHtml (main.js:815) přidat nahoru `.stat-big-row` se 4 dlaždicemi (⚔ atk, 🛡 def, 🗡 dmg, ⚡ speed), zbylé staty nechat v drobném gridu pod tím. Čistě šablona + ~15 řádků CSS.
- **Postava hrdiny prosvítající za souhvězdím** (dopad 3, pracnost 1) — Do constellationHtml vložit `<img class="const-hero">` z existujících spritů art/render/hero_*.png, absolutně vlevo, opacity ~0.15, mask-image fade, z-index pod uzly. Nulová pracnost, velký dojem hloubky.
- **Hlavička okna hrdiny: odznak úrovně, Lv.X/max, XP čísla, ikona třídy, hvězdy** (dopad 3, pracnost 1) — V renderHeroWindow vykreslit úroveň jako zlatý odznak (clip-path šestiúhelník), text `úr. X/HERO_MAX_LEVEL`, viditelné `${h.xp}/${need}` u XP pruhu se zlatým leskem, ikonu traity (⚔/🛡/🦅…) z HERO_TRAITS a zatím čistě zobrazovací řadu ★ z úrovně. Sloučeno 5 kosmetických nálezů do jednoho průchodu hlavičkou.
- **Jiskry a záře na spojnicích souhvězdí** (dopad 4, pracnost 2) — Do SVG const-lines přidat glow filtr (feGaussianBlur), pro `.lit` čáry druhou čárkovanou linku s animací stroke-dashoffset a jiskru `<circle>` s animateMotion po dráze spojnice. Vše inline SVG, žádné assety.
- **Ozdobné zlaté rámy uzlů + pulz + ztmavené zamčené** (dopad 4, pracnost 2) — Na `.cn-circle` dvojitý zlatý prstenec přes `::before` s conic-gradientem a radial maskou, keyframe pulz u naučených; zamčené uzly místo opacity dostat `grayscale+brightness` filtr. Řeší plochý 2px border z obou auditních nálezů najednou.
- **Ornamentální pozadí okna a dvojitý zlatý rám** (dopad 4, pracnost 2) — Na `.hero-dialog` navrstvit šumovou texturu jako inline SVG data-URI (feTurbulence), dvojitý rám přes inset box-shadow a jemnou zlatou vinětu. Bez externích assetů.
- **Řada slotů výbavy dole na hlavní kartě** (dopad 4, pracnost 2) — Zkopírovat markup `.eq-slot-row` z equip tabu do heroStatsTabHtml; klik na slot přepne heroWinTab="equip" + hwSlotSel a zavolá rerender(). Tooltipy s itemEffectStr už fungují.
- **Stackující bonusy za kolo** (dopad 4, pracnost 2) — Nové eff typy stackDef/stackAtk: v simulateBattle inkrementovat S.stacks na konci kola a v sideAtk/sideDef (game.js:1097–1108) přičítat val×stacks. Ideální pro shield/tireless hrdiny; hodnoty přenést přes atkHero/defHero objekt jako spell/ward.
- **Náhled maximálních statů (5★ potenciál)** (dopad 2, pracnost 1) — Do forge-detail a itemCompareCardHtml přidat řádek „na 5★: +hodnota + mistrovský bonus", ať se dá vybírat, který kus krmit. Čistě klientská změna.
- **Jména větví serifovým zlatým písmem** (dopad 2, pracnost 1) — `.cn-name` přepnout na `var(--serif)` s letter-spacingem a u naučených přidat zlaté gradientové podtržení přes `::after`. Data netřeba měnit.

## Fáze 2 — Střední kroky ✅ (hotovo 2026-08-26; zamčený uzel s ikonou ✅, řetěz jen jako 🔒 v rohu)

- **Signature itemy vázané na konkrétního hrdinu** (dopad 5, pracnost 3) — Tabulka SIGNATURE_ITEMS (24 záznamů `${fkey}:${defIdx}` → {slot, name, passiveName, effs}), item nese pole `sig`, nová funkce heroSigEff přičítaná v heroStats vedle heroSetEff/heroMasterEff; POZOR: stripItem (game.js:910) musí `sig` zachovat. V UI zlatý štítek s názvem pasivky (sloučeno s duplicitním nálezem z dimenze efekty).
- **Proc-efekty za kolo (followUp / procDmg)** (dopad 5, pracnost 3) — Nové eff typy se šancí (např. followUp: hrdina po úderu udeří znovu za 60 % dmg), heroStats předá pole `procs` do resolveMarch a simulateBattle po hitD()/hitA() hodí seeded rng() — nikdy Math.random, kvůli shodě klient/server. Každý proc zapsat přes note() do ev, ať je vidět v reportu (sloučeny 3 duplicitní nálezy).
- **Podmínkové efekty [typ jednotky] / [proti frakci]** (dopad 5, pracnost 3) — Do skill/item defů volitelné `cond: {unit, vsFaction, role, struct}`; heroEff podmíněné effs přeskočí, resolveMarch je přibalí a sideDmg násobí jen odpovídající typ jednotek / soupeřovu frakci. Dá hrdinům důvod k odlišné skladbě armád (sloučeny 2 nálezy).
- **Velká celopostavová grafika velitele na kartě** (dopad 5, pracnost 3) — Do heroStatsTabHtml vložit `<img class="hw-figure">` z existujících spritů; pro ostrost zvednout v make_heroes.py rozlišení na 1024 a přerenderovat jako hero_big_*.png (jeden headless běh Blenderu). Stejný obrázek poslouží i tabu Unikát.
- **effText a bojový report pro nové mechaniky** (dopad 3, pracnost 2) — Doplnit texty pro followUp/stackDef/stackAtk/stunChance a prefix tagů `[🐎 Jízda]`/`[proti Hordě]` z UNIT_TYPES a FACTIONS; v simulateBattle každý proc/stack logovat přes note(). Nutná podmínka čitelnosti fáze 2 — bez toho jsou procy neviditelné.
- **Max Level Effect + počítadlo resetů** (dopad 3, pracnost 2) — Do skill defů volitelné `maxEff {type,val}` přičítané v heroEff při r===s.max, v detailu uzlu řádek „Bonus při max" a zlatý štítek Max; resety řešit h.freeRespecs plněným z eventů/truhel, respecHero čerpá nejdřív počítadlo, pak zlato (sloučeny 2 nálezy).
- **Zdroj dropů signature itemů** (dopad 3, pracnost 2) — dropStructLoot při prvním dobytí Trůnu dropne signature item vedoucího hrdiny; makeChestItem u tieru royal dostane sigChance ~0.08 napříč frakcemi. V reveal kartě dát signature vlastní zlato-červený rám, ať je to moment.
- **Detail dovednosti jako ozdobná karta** (dopad 3, pracnost 2) — `.const-detail` dostane zlatý border a rohové ornamenty čistým CSS (::before/::after L-rohy), při max ranku štítek „Max" se zlatým gradientem na uzlu i v hlavičce detailu.
- **Plynulý přechod mezi taby okna hrdiny** (dopad 3, pracnost 2) — Proměnná hwPrevTab; při změně tabu přidat na `.hw-body` třídu tab-in s krátkou fade+slide animací. Podmínka na změnu tabu je nutná, jinak animace bliká při každém rerenderu.
- **Zamčený uzel s řetězem přes ztmavenou ikonu** (dopad 2, pracnost 2) — U locked uzlu vykreslit skutečnou ikonu skillu ztmavenou a přes ni SVG overlay řetězu se zámkem — hráč vidí, CO ho čeká.
- **Tab Unikát — prezentace ultimátky a rysu** (dopad 2, pracnost 2) — Pátý tab v hw-tabs: velký art hrdiny, název ultimátky s effText přes ranky, popis rysu z HERO_TRAITS. Vše čtecí, žádná mutace.

## Fáze 3 — Velké systémové změny ✅ (hotovo 2026-08-26, v0.8)

> Vše níže implementováno: strop 30 se zploštěnými konstantami (HP 6/ATK-DEF
> 0,15/DMG 1/CAP 25 za úroveň, xpForLevel 40·l^1.6, bod dovedností do úrovně 10
> každou úroveň a dál za sudé = 19 bodů celkem), hvězdy hrdinů (heroPromote za 💠,
> +4 % statů a +25 velení za hvězdu, persistence na účtu), unikátní SVG pečeti
> skillů (skillArtURL), 6 uzlů na strom s CONST_LINKS souhvězdím, ranky 8/8/6/6/6
> s úměrně nižšími hodnotami, stunChance/stunImmune (i s cond.vsFaction).

- **Strop úrovní 10 → 30–50 se zploštěním konstant** (dopad 4, pracnost 3) — Zvednout HERO_MAX_LEVEL jde jen s přeladěním per-level konstant (HP 20→6, ATK/DEF 0,5→0,15, DMG 3→1, CAP 100→25) a xpForLevel (~40·l^1.6), jinak se rozbije laděná křivka dobývání. Kapitán domobrany používá base konstanty, spodek křivky se nehne.
- **Hvězdy/rank hrdiny — druhá osa progrese** (dopad 4, pracnost 3) — h.stars 0–5 povyšované za popelná jádra novou funkcí heroPromote (exports + NET_CMDS + server CMDS dle MP checklistu), persistence přes applyAccountToHero/syncAccountFromFaction; efekt +% statů a +velení za hvězdu v heroStats. Vytváří trvalou meziseóznní progresi.
- **Unikátní kresby skillů místo sdílených emoji** (dopad 4, pracnost 3) — Po vzoru portraits.js udělat skillArt(s) generující malé SVG per skill.key (nebo Blender sprity), aby dva skilly stejného typu neměly identickou ikonu. Zlatý rám už bude hotový z fáze 1.
- **6–8 uzlů na strom místo 4** (dopad 4, pracnost 4) — Přidat 2–4 dovednosti do každého z 24 stromů v HERO_DEFS, rozšířit CONST_POS a SKILL_UNLOCK, spojnice generovat podle pole `links` místo řetězu, ať vznikne tvar souhvězdí, ne had. learnSkill/heroEff jsou generické, logika změnu snese.
- **Vyšší ranky dovedností (7–15) + rebalanc bodů** (dopad 3, pracnost 3) — Zvednout s.max na 7–15 s úměrně nižším eff.val a přísun bodů nastavit tak, aby kapacita stromu > dostupné body (~60 %) — buď bod každou 2. úroveň, nebo tabulka SKILL_PT_LEVELS. Teprve tím vznikne volba buildů a smysl respec (sloučeny 2 nálezy); dělat společně se stropem úrovní a novými uzly.
- **Stun a stun-imunita** (dopad 3, pracnost 3) — Eff typy stunChance (roll na začátku kola, omráčený velitel to kolo nepřispívá — heroUp(S) vrací false) a stunImmune s cond vsFaction; vše s note() do reportu. Dělat až po proc systému a podmínkách z fáze 2, na kterých staví.

---

# Audit 2 podle videa „Ultimate Beginners Guide" (2026-08-26, workflow 7 agentů, 6 dimenzí)

> Video ZCW9dkPgLPA (EJU-BU, ~30 min); klíčové framy ~980–1120 s: okno velitele (Boromir Lv.20, strop 50, rank 🦅 14 s medailony 1900/2700), orbitální strom 4 zlatých skillů 15/15 s kartou Current/Next/Max Level Effect a ⏱ časováním, modré sub-uzly větví, respect pointy + Reset(34), panel Current Effects s Allocate Points. Zadání uživatele: strop 50, 4 skilly 15/15 + speciální odemčení dle rysu, 2 větve subskillů 7/7 bez max odměny.

## Plán implementace — strom 4 skillů s větvemi

> Syntéza 6 analytických dimenzí (struktura stromu, boj, progrese/úrovně, UI, odměny rysu, účty/MP) nad videem LotR RtW „Ultimate Beginners Guide" (ZCW9dkPgLPA, ~980–1120 s) a závazným zadáním: **strop 50, 4 hlavní skilly 15/15 se speciálním odemčením dle rysu, 2 větve subskillů 7/7 bez max odměny**. Vlastní IP Vellar — přebíráme mechaniky a rozvržení, nikdy grafiku/jména z LotR. Klíčové zjištění všech dimenzí: díky generickému řetězu heroEff/heroCondEffs → heroStats → atkHero/defHero je Fáze A čistě **datová** (bojový kód i MP protokol beze změny); nové bojové mechaniky (kolové procy, avoid chargy) přicházejí až ve Fázi B; Fáze C je čistě klientská. Cílová bilance: kapacita stromu 4×15 + 8×7 = **116 bodů**, příjem 49 (úrovně) + 25 (hvězdy) = **74 → 64 % pokrytí** (buildy existují i na 25★). Druhotná pozorování z videa (sezónní milníky, směnárna, market) do tohoto plánu nevstupují.

## Sjednocující rozhodnutí (vyřešené konflikty dimenzí)

1. **Jeden systém odměn za 15/15** — dimenze navrhly tři varianty (per-slot TRAIT_MAX_EFFS, runtime TRAIT_MAX_BONUS, kumulativní 4stupňové TRAIT_MASTERY). Vítězí **TRAIT_MAX_EFFS[trait][slot 0..3]** stampovaná dekorátorem do `s.maxEff` při loadu: odpovídá doslovnému znění zadání („za plné odemčení skillu…"), video kartě „Max Level Effect", a nevyžaduje žádnou runtime větev — heroEff/heroCondEffs/UI čtou `s.maxEff` jako dnes. Kumulativní tiery TRAIT_MASTERY se NEimplementují (dvojí odměna za tentýž práh = power creep + druhá implementace); z té dimenze přebíráme jen UI počítadlo „🏅 mistrovství X/4", oslavnou hlášku v learnSkill a balanční testy capů.
2. **Názvosloví bodů** — RtW „respect points" (body na skilly) vs náš „respekt" v0.9 (dárky→hvězdy). Body na skilly zůstávají **„✦ body dovedností"** (zavedený termín, nulový churn; návrhy „body velení" zamítnuty — kolize s limitem velení/heroArmyCap, „body rozvoje" zbytečná změna). Dárková měna se v UI přejmenuje na **„oddanost"**. Persistovaná/interní pole (`h.skillPts`, `heroRespect`, `GIFT_RESPECT`, `respectForStar`, CSS `.respect-bar`) se NIKDY nepřejmenovávají (accounts.json, snapshoty). Slovníček do CLAUDE.md.
3. **Gating** — jednotné jméno `SKILL_UNLOCK_MAIN = [0, 8, 18, 30]` (celkové investované body, index = `s.slot`; škálováno na nový příjem 74, hodnoty doladit testy), suby přes `parent` + `req`: větev A od ranku rodiče 3, větev B od 5 (default `SUB_REQ = 3`, per-uzel override `s.req`). Staré `SKILL_UNLOCK` se TVRDĚ maže — u 12 uzlů vrací `SKILL_UNLOCK[idx≥6]` undefined a `spent < undefined === false` by VŠE odemklo.
4. **Helper bodů** — jediný zdroj pravdy `totalSkillPtsForLevel(l) = l − 1` (nová křivka 1 bod/úroveň 2..50) sdílený heroGainXp, migrací i testy; do `module.exports`. Sjednocuje tři různě pojmenované návrhy (ptsForLevel / heroTotalPtsEarned / totalSkillPtsForLevel).
5. **Migrace účtů** — plný wipe `skills` + přepočet bodů (NE mapování starých klíčů na nové: ranky 8→15/6→7 mění sémantiku hodnot za bod a selektivní přenos může vytvořit nelegální strom vůči novému gatingu). Marker **`acc.treeV` (TREE_VERSION = 2) na úrovni ÚČTU**, nikdy per-entry (syncAccountFromFaction entry přepisuje → smyčka resetů). Ověřeno: nová křivka dává na každé úrovni ≥ bodů než stará (l−1 ≥ stará ∀ l), nikdo nepřijde ani o bod.
6. **Osud ultimátek** — ult uzly zmizí; flag `ult:true` se přenese na hlavní skill slotu 3 (čistě vizuální — všech 5 call-sites `tree.find(s=>s.ult)` přežije: main.js:185/191/750/1073, render.js:508); mapové FX se aktivují až při ranku 15/15 (místo rank>0). Skalární ult efekty → per-hrdina ruční `maxEff` na slotu 3 (drží jedinečnost: Mara strike, Edran holdDef…), booleovské (noCooldown/instantReturn/ignoreDef) → TRAIT_MAX_EFFS. Kde to sedí, slot-3 skill převezme jméno bývalé ultimátky (Křídla bouře, Stínochod…).
7. **Časování efektů** — žádné nové datové pole `timing` u stávajících typů; texty „⏱ kolo 1 / každé kolo / před bojem" generuje čistě klientská mapa `skillTimingTag(s)` z typu efektu. Jen nové typy roundDmg/roundArmy nesou timing mechanicky uvnitř effu (`{round:1}` / `{every:3}`).
8. **Datové pravidlo maxEff** — `maxEff` smí ležet výhradně na hlavních uzlech; subskilly ho nikdy nemají (zadání) a dekorátor to při loadu vynucuje (throw). Zapsat do CLAUDE.md.

## Fáze A — Datový model, strop 50, body ✅ (hotovo 2026-08-26, v0.10)

> Odchylky od plánu: gating podřízených je jednotný (`SUB_REQ` 3 pro obě větve,
> ne 3/5 — jednodušší a `req` per uzel zůstává jako override); `SKILL_UNLOCK_MAIN`
> zůstalo na [0, 8, 18, 30]; provizorní rozvržení UI počítá `treeLayout()` ze
> struktury stromu místo natvrdo psaného pole pozic. Ověřeno 700 asercemi
> (`scratchpad/test-faze-a.js`) + MP testem migrace přes WebSocket.

- **Struktura stromu: 12 plochých uzlů s parent/branch + dekorátor** (dopad 5, pracnost 2) — `tree` v HERO_DEFS (game.js:313–670) zůstává PLOCHÉ pole, ale 12 záznamů v pořadí [4 hlavní, 8 sub]. Hlavní: `{key, name, max:15, eff|effs, desc, maxEff?}`; sub: `{key, name, max:7, parent:"<key hlavního>", branch:0|1, req?, eff|effs, desc}` — bez maxEff. Za definici HERO_DEFS (vedle stávající smyčky ~1059) dekorátor: hlavním (uzly bez `parent`) očísluje `s.slot=0..3` a `s.main=true`, zvaliduje unikátnost klíčů v rámci stromu (h.skills je `{key:rank}`!), existenci parent odkazů, zákaz maxEff na subech a přítomnost `ult` na slotu 3 — při chybě **throw při loadu**. heroEff (1456), heroCondEffs (1475), heroStats, heroSpentPoints (1414), respecHero (1432) i simulateBattle iterují tree genericky — **beze změny**; signatury learnSkill/respecHero drží → NET_CMDS (net.js:35–36) i CMDS (server.js:285–286) netknuté, žádný nový MP příkaz. Provizorní zobrazení do Fáze C: CONST_POS (main.js:881) dočasně rozšířit na 12 pozic (mřížka 4+8) a hrany generovat z `s.parent` malým helperem místo CONST_LINKS — jinak constellationHtml (main.js:996) uzly 7–12 nevykreslí.
- **Gating: SKILL_UNLOCK_MAIN + práh ranku rodiče** (dopad 5, pracnost 2) — game.js: smazat SKILL_UNLOCK (1411; past undefined viz rozhodnutí 3), přidat `SKILL_UNLOCK_MAIN=[0,8,18,30]` a `SUB_REQ=3`. learnSkill (1418): `if (s.parent)` → `(h.skills[s.parent]||0) >= (s.req||SUB_REQ)`, jinak `heroSpentPoints(h) >= SKILL_UNLOCK_MAIN[s.slot]`. Export do module.exports (3644) — server validuje týmž kódem. Součástí fáze je MINIMÁLNÍ oprava tří UI call-sites, které čtou SKILL_UNLOCK přímo a po smazání spadnou/lžou: main.js:1029 (legenda → „hlavní za 8/18/30 bodů"), 1049 (hint zámku subu → „🔒 Odemkne se: [jméno rodiče] rank X"), 1090 (text ultimátky). Plná vizuální přestavba až Fáze C.
- **Strop úrovní 50 + zploštění per-level konstant** (dopad 5, pracnost 2) — game.js: `HERO_MAX_LEVEL` 30→50 (1383); HERO_HP_PER_LEVEL 6→3,5 (úr. 50: 271,5 vs dnešních 274 na 30), HERO_ATK/DEF_PER_LEVEL 0,15→0,09 (6,41 vs 6,35), HERO_DMG_PER_LEVEL 1→0,6 (37,4 vs 37), HERO_CAP_PER_LEVEL 25→15 (935 vs 925) — ekvivalence 50≈30 ověřena na ≤1,5 %. BASE konstanty a kapitána domobrany (2865–2867) NESAHAT — spodek křivky dobývání (⚔10→9 … grandfort→781) stojí na nich. Dorovnat věci škálující úrovní mimo staty: duel cut `6+3*level` → `6+1.8*level` (2818, 2824), duelPower `h.level*10` → `*6` (2204); LEVEL_STAMINA ponechat 1 (stamMax 149 vs 129 = drobný akceptovaný buff). Clamp v applyAccountToHero se zvedne sám. UI čte HERO_MAX_LEVEL (main.js:694, 1356, 1389–1399) — přepne se samo.
- **xpForLevel pro 50 úrovní** (dopad 4, pracnost 2) — game.js:1386: `xpForLevel = round(25*l^1.4)` → součet do 50 = 121 549 XP (dnešní křivka do 30 ≈ 102k; stará křivka do 50 by byla prohibitivních 392k). Rychlý rozjezd (úr. 2/3/4 za 25/66/116) hned sytí nový strom, poslední úroveň 5 811. XP odměny za akce (duel 15: 2821/2827, dobytí 2974, prohra 3092, obrana 3096) neměnit. Pozor: nová křivka je na dané úrovni levnější → uložené h.xp může přetéct práh — řeší dolevlování v migraci (viz Migrace a rizika). Ověřit node testem přes exports.xpForLevel.
- **Ekonomika bodů a respec** (dopad 5, pracnost 2) — game.js: `skillPtGainAt(l)` (1390) → `return 1` pro každou úroveň 2..50 = 49 bodů; + helper `totalSkillPtsForLevel(l) = l−1` do module.exports (potřebuje ho migrace). STAR_SKILL_POINT nechat 1 (296) → strop příjmu 74 = 64 % kapacity 116 (bez hvězd 42 %, realistický hráč ~10★ ≈ 51 %) — build volba trvá i na 25★. `RESPEC_GOLD_PER_POINT` 40→15 (plných 74 bodů = 1 110 🪙; běžných ~40 = 600 ≈ dnešní cena plného respecu; 74×40=2 960 by bylo prohibitivní), `freeRespecs` 1→2/sezónu (initFactions 2086 — větší strom = víc experimentování). Log v heroGainXp (1403) a badge (main.js:579) fungují beze změny. Riziko: 1 bod/úroveň = rychlejší růst v rané/střední hře — AI čerpá stejné body (aiSpendSkills), hlídat testem křivky dobývání.
- **Obsah 24 stromů: 6 uzlů → 4 hlavní + 8 subskillů, přeškálování hodnot** (dopad 5, pracnost 5) — největší kus, dělitelný po frakcích (4×6 hrdinů, celkem 288 uzlů, ~150 nových definic). Recept na hrdinu: (a) oba rank-8 skilly povýšit na hlavní sloty 0–1 (val ×8/15≈0,53: atk 0,4→0,2; speed 2→1; spell 4,5→2,4; holdDef 4→2), (b) dva nejcharakterističtější rank-6 (přednostně s cond/maxEff identitou: ztec, drt, stit, zhouba, popel, salvy, klin, hejno…) → hlavní sloty 2–3 (val ×0,4: unitDmg 3→1,2; stunChance 4→1,6), (c) zbylé rank-6 degradovat na subskilly pod tematicky nejbližší hlavní (val ×6/7≈0,85, zaokrouhlit na čitelný krok — effText zaokrouhluje na 2 desetinná místa), (d) 1-rankové stunImmune uzly (Ysra koren, Elvarin srdce, Duna zaklad, Morgal klec, Vagga vzdor) zrušit jako uzly — přejdou do TRAIT_MAX_EFFS ve Fázi B, Vagga jako per-uzel maxEff override s cond.vsFaction, (e) dopsat ~6 nových subskillů na hrdinu z utility poolu stávajících typů (stam/stamCost/regen/heal/hp/dmg/gold/xp/cap/convoy/fastReturn/aura/strike), totály nových subů jen 60–80 % dnešních rank-6 (jsou bonus navíc — kompenzace vyššího příjmu bodů), na větev max JEDEN bojový proc typ (followUp/stunChance/unitDmg/vsDmg), profil větví „boj × zázemí". Klíče subů konvencí `<mainKey>_a` / `<mainKey>_b` (unikátnost zadarmo). Hlavní skilly držet na dnešních totálech — capy v heroStats (followUp 60, stunChance 35, aura 35, heal 50, ward 80; game.js:2156–2168) NEměnit. Jména vlastní IP, kontrolovat proti LotR.
- **Úklid ultimátek** (dopad 3, pracnost 1) — dle rozhodnutí 6: ult uzly z HERO_DEFS pryč, flag `ult:true` na hlavní slotu 3, skalární efekty rozpustit (přičíst do totálu hlavního skillu téhož typu nebo per-hrdina maxEff), booleovské zaparkovat pro TRAIT_MAX_EFFS (B). render.js ultFxFor (504–509) + main.js:750: podmínku aktivace změnit z `rank>0` na `rank>=s.max` — mapová ★ a jmenovka = oslava 15/15 (hráči je uvidí později než dnes — zmínit v changelogu). heroUniqueTabHtml zatím funguje přes týž find; přejmenování sekce až ve Fázi C.
- **aiSpendSkills: pořadí a safety** (dopad 2, pracnost 1) — game.js:3340: funguje beze změny, POKUD pole tree řadí rodiče před suby (zamčený sub → learnSkill false → smyčka jde dál); dekorátor pořadí [4 hlavní, 8 sub] garantuje. Safety čítač 12→24 (víc bodů na průchod). Volitelné vylepšení „hlavní do maxu, pak jeho větve" jen přes seeded rng() — NIKDY Math.random (shoda sólo/server).
- **Názvosloví v UI** (dopad 2, pracnost 1) — dle rozhodnutí 2: stringy „respekt" v okně hrdiny/výběrovce/hire-boxu (main.js:203, 404, 473, 788–793, 1145–1148, 1393) → „oddanost"; log v applyGiftToAccount (game.js:1103) dtto; body na skilly všude důsledně „✦ body dovedností". Interní pole beze změny. Slovníček do CLAUDE.md: oddanost = dárky→hvězdy; body dovedností = úrovně+hvězdy→strom.

## Fáze B — Bojové procy + max odměny dle rysu ✅ (hotovo 2026-08-26, v0.11)

> Odchylky od plánu: kumulativní `TRAIT_MASTERY` se podle rozhodnutí 1 neimplementovalo;
> mistrovský bonus je jen `TRAIT_MAX_EFFS[rys][slot]` stampovaný dekorátorem.
> Nové mechaniky (roundDmg/roundArmy/avoidCharge) přišly do hry POUZE přes tuto
> tabulku — žádná existující dovednost se nekonvertovala, takže balanc Fáze A
> zůstal beze změny a křivka dobývání je prokazatelně netknutá. Ověřeno 57
> asercemi (`scratchpad/test-faze-b.js`) + průchodem v prohlížeči.

- **Kolové aktivky velitele: roundDmg/roundArmy s časováním** (dopad 5, pracnost 3) — vzor kolových pasivek frakcí už existuje (aldar r===1 game.js:1580, yllien r%3 1581, horda ×(r−1) 1585). (1) Nové eff typy `{type:"roundDmg", val, targets, timing:{round:1}|{every:3}}` a `{type:"roundArmy", val, timing}`; (2) kolektor `heroActives(faction,heroIdx)` po vzoru heroCondEffs (1475) → `[{name, pct:val×rank, targets, round, every}]`, heroEff tyto typy přeskakuje; heroStats přidá `actives`/`armyActives`; kolektor bere i maxEff kolového typu při r≥max (kvůli TRAIT bonusům níže); (3) resolveMarch: `actives`/`armyActives` do OBOU literálů atkHero (2842) i defHero (2855) — kapitán domobrany (2865) NIKDY; (4) simulateBattle: helper `activeDmg(S,E,r) = Σ a.pct/100 × S.hero.dmg × a.targets × (1−E.hero.ward)` pro a s `(a.round===r || a.every && r%a.every===0)`; v hitD/hitA symetricky `v += ac×f; tot.cmd += ac×f` (fyzické poškození jde přes f jako heroPart, na rozdíl od spellu); roundArmy v sideDmg vedle vsAll (1592) jako `p *= 1+pct/100` v trigger kolech; note `⏱ kolo ${r} — ${a.name}: [proti N cílům] +X poškození velitele`. Timing deterministický, ŽÁDNÉ rng. Po zavedení typu převést ~1 vhodný hlavní skill na hrdinu (archetypy attack/warlord/mystic) na kolový proc — konverze musí zachovat průměr na kolo (proc v kole 1 za X ≈ trvalých X/4; typická bitva 3–6 kol z MAX_ROUNDS 8), škála dle RtW ~11,7 %/bod. main.js: effText (895) + EFF_ICONS (887) pro nové typy — bez toho jsou karty skillů rozbité.
- **Obranné chargy: avoidCharge/avoidChance** (dopad 4, pracnost 3) — eff typy `avoidCharge` (celé chargy — jen jako odměna za 15/15, nikdy na bod) a `avoidChance` (%/bod, roll jen dokud chargy zbývají). heroStats: `avoidCharges`, `avoidChance` (clamp 100); resolveMarch: obě pole do atkHero i defHero (kapitán NE); simulateBattle: init `S.avoid = hero.avoidCharges||0` u A/D objektů (1545–1548), na začátku applyDamage (1598): pokud `S.avoid>0 && dmg>0` a roll projde → `S.avoid--`, note „[Armáda] vyhnutí: úder pohlcen (zbývá N)", `tot.avoidA/D += dmg`, return 0. Chargy se čerpají i při stunu (buff armády, ne akce velitele). Síla: 1 charge ruší CELÝ úder kola (≈ −17 až −33 % příchozího poškození) — proto jen za plné odemčení. Nové rng je deterministické (pevné pořadí hitD/hitA→applyDamage dle speed větví 1731–1741; ve větvi shody rychlostí se nové rolly řadí až ZA oba followUp — zdokumentovat komentářem).
- **TRAIT_MAX_EFFS: speciální odemčení za 15/15 podle rysu** (dopad 5, pracnost 2) — game.js vedle HERO_TRAITS (263): tabulka `TRAIT_MAX_EFFS = { trait: [eff pro slot 0..3] }` — 6 rysů × 4 sloty = 24 definic (každá frakce má právě 1 hrdinu od rysu → „podle rysu" = konzistentní archetyp napříč frakcemi; slot 3 = vrcholný, dědí booleany ultimátek). Návrh (ladit testy): **attack** atk 1,5 / followUp 15 / strike 12 / roundDmg 40 % (⏱ kolo 1, 2 cíle); **shield** def 1,5 / stunImmune / stackDef 0,5 / avoidCharge 1; **swift** spd 1 / speed 8 / fastReturn 25 / instantReturn; **tireless** hp 40 / regen 25 / stam 12 / noCooldown; **warlord** cap 50 / rally 15 / stackAtk 0,4 / dmg 6; **mystic** spell 8 / ward 8 / stunChance 8 / ignoreDef. Dekorátor z Fáze A se rozšíří: hlavnímu uzlu BEZ vlastního maxEff stampne `s.maxEff = TRAIT_MAX_EFFS[hd.trait][s.slot]`; ručně psaný maxEff je override (Vagga stunImmune cond horda, ex-ult jedinečnosti). Build-time stamping = heroEff (1467, r≥s.max bez cond), heroCondEffs (1484, cond varianta) i UI (.cd-maxeff) fungují BEZE ZMĚNY. Subskilly maxEff nikdy (dekorátor throw). Export TRAIT_MAX_EFFS pro testy. Moment odemčení: learnSkill po inkrementu detekuje dosažení `r===s.max` na hlavním uzlu → `addLog(faction.id, "🏅 ${jméno} dovršuje „${skill.name}" — odemyká bonus rysu: ${effLine}")` — běží shodně na serveru i sólo, Kronika jde snapshotem.
- **Determinismus, tot čítače a reporty** (dopad 3, pracnost 2) — pravidla: aktivky bez rng (fixní kola); avoidChance/followUp/stun výhradně seeded rng() ve stejném pořadí; do node testů grep-check `Math.random` v cestě simulateBattle. tot (1785) rozšířit o `avoidA/D` (volitelně `activeA/D` pro kolové skilly zvlášť od heroPart) — resolveMarch report je přenese automaticky (report.tot = sim.tot); main.js reportHtml (2207–2209) doplnit řádky s fallbackem `t.avoidA||0` pro staré reporty. Noty v simulateBattle sjednotit na formát `⏱ kolo N — [tag] text` (dnes směs stylů), ať report čte stejně jako karta skillu. Test: dvě simulateBattle se stejným seedem → identický `JSON.stringify(roundLog)`.
- **Balanční mantinely bonusů rysu** (dopad 3, pracnost 2) — node test přes exports (heroStats): hrdina s 0–4 dovršenými hlavními skilly, asserty na delty a capy. Cíleně kumulace proc typů: mystic stunChance skilly + 8 (bonus) < 35; Theyren followUp 24 (skill) + 25 (signature) + 15 (bonus) → clamp 60 — potvrdit, že clamp drží a bonus není u cap-hrdinů mrtvý. Booleovské speciály (noCooldown/instantReturn/stunImmune/ignoreDef/avoidCharge) koncentrují sílu do prahu 15/15 = skokový balanc — stunImmune nově pro všechny shield hrdiny mění hodnotu stunChance buildů (zmínit v changelogu). Warlord cap +50 hlídat proti limitu velení. Křivka dobývání s hrdinou lvl 1 bez bodů se nesmí hnout (aktivky žijí jen ve skill rancích, kapitán je nemá).

## Fáze C — Orbitální UI + panel Aktuální efekty ✅ (hotovo 2026-08-26, v0.12)

> Odchylky od plánu: úhly a poloměry prstenců jsou jiné než navržené (`ORBIT.main`
> se ladil proti skutečné ploše, aby se štítky nekřížily), pozice větví se navíc
> clampují do plochy; sekce „Mistrovství" v tabu Unikát vznikla už ve Fázi B.
> Ověřeno geometrickým testem všech 24 stromů (nic nevyjede, žádná kolize uzlů),
> průchodem všech hrdinů × všech tabů bez výjimky a testem, že panel efektů
> přežije herní tik. **Tím je celý Audit 2 (A + B + C) uzavřen.**

- **Orbitální layout engine místo CONST_POS/CONST_LINKS** (dopad 5, pracnost 3) — main.js: smazat CONST_POS/CONST_LINKS (i provizorium z A), přidat `ORBIT = {cx:55, cy:50, rings:[22,34,46], main:[{ring:0,ang:205},{ring:1,ang:120},{ring:1,ang:335},{ring:2,ang:255}], subR:11, subSpread:52}` a čisté funkce nad stromem: `orbitPos(tree)` → mapa key→{x,y} (hlavní dle s.slot na prstence; suby na ramena parentAng±subSpread směrem VEN, branch určuje stranu), `linksFor(tree)` → hrany rodič→sub z `s.parent`. Deterministické, žádné rng — MP klienti vidí totéž; ze struktury stačí s.slot/s.parent/s.branch. constellationHtml (996–1067): do const-lines SVG nejdřív `<circle class="orbit-ring">` za každý prstenec (třída .active při aspoň jednom naučeném hlavním na prstenci), pak spojnice rodič→sub — markup .lit/.lit-dash/.spark PŘEVZÍT beze změny (SMIL animate cx;cy na úsečkách funguje; lit = sub rank>0). style.css: `.orbit-ring {fill:none; stroke:rgba(229,187,99,.16); stroke-width:.5}` + .active se zlatým glow a pomalu obíhajícím čárkováním (reuse @keyframes const-dash, ř. 1176). Výšku .constellation (577) zvednout 240px → clamp(340px, 44vh, 430px); hvězdné pozadí a .const-hero sprite (1161) ponechat. Pozn.: preserveAspectRatio="none" dělá z kružnic elipsy, ale uzly počítané v témže 100×100 prostoru na nich sedí přesně (elipsa působí perspektivně); pravé kruhy by chtěly pevný aspect-ratio. Úhly zvolit bez kolizí štítků (ověřit na 860px dialogu i mobilu).
- **Vzhled uzlů: zlaté hlavní vs malé modré suby, štítky, koruna, zámky** (dopad 4, pracnost 2) — constellationHtml: do class listu `s.main ? "main" : "sub"` (+ br-a/br-b dle branch); u subů rank badge „r/7", jméno NEvykreslovat trvale (jen title atribut + v kartě skillu — 8 štítků navíc by orbitu zahltilo). style.css: `.const-node.main .cn-circle` 54px (ult variantu 616 sloučit sem), `.const-node.sub .cn-circle` 28px s modrým rámem (#6f9fd8) a modrým conic-gradientem ::before; modrá pečeť bez nového generátoru: `.const-node.sub .cn-art {filter:hue-rotate(175deg) saturate(.8)}` — skillArtURL (947) netknutý vč. cache (kdyby modrá neseděla, fallback = parametr barvy v skillArtURL s rozšířeným cache klíčem). Jména hlavních do tmavých štítků `.cn-plate` {rgba(8,10,15,.85), zlatý rámeček, radius 6px} (serif + zlaté podtržení known z 1204 ponechat). Max: badge `.cn-crown` (✦/👑) nad kruhem u `.main.maxed` + stávající zesílený prstenec (1230). Malé dotykové cíle subů na mobilu řešit paddingem klikací .const-node. Zámky: 🔒 (1226) + hint rodiče z Fáze A.
- **Karta skillu jako překryv v rohu stromu** (dopad 4, pracnost 2) — místo statického bloku pod stromem (.const-detail, main.js:1027–1051) vykreslit při `hwSkillSel !== null` `<div class="skill-card">` ABSOLUTNĚ uvnitř .constellation — strana dle pozice uzlu (orbitPos[key].x > 50 → vlevo, jinak vpravo), šířka min(300px, 46 %), max-height calc(100%−20px), overflow-y auto, křížek .sc-close. Obsah: `.sc-head` = pečeť cn-art ve zlatém kroužku + jméno + rank „4/15" (reuse .cn-rank); `.sc-tags` = kapsle „Titul" + `skillTimingTag(s)` — nová čistě klientská mapa typ→text (spell/stackAtk/stackDef/unitDmg/vsDmg → „⏱ každé kolo", followUp → „⏱ při úderu", strike → „⏱ před bojem", stunChance → „⏱ začátek kola", roundDmg → „⏱ kolo 1"/„⏱ každé N. kolo" z timing objektu, holdDef/aura → „při obraně", jinak „pasivní"; později lze rozšířit i na pasivky itemů); dále cd-desc/cd-now/cd-next PŘEVZÍT s hodnotami Next obalenými `<b class="green">` (#9fd48a); sekci „✨ Bonus při max" vykreslit u KAŽDÉHO hlavního uzlu (dekorátor stampnul maxEff vždy — text přes effLine), u subů jen „Plně naučeno."; dole „✦ 1 bod" + tlačítko třídy .cd-learn „Vylepšit" (binding main.js:1424 beze změny). style.css: tmavé sklo rgba(10,12,18,.92) + backdrop-filter, zlatý rám s rohovými ornamenty PŘENÉST z .const-detail::before/after (1235–1240); starou sekci smazat. Pod ~560px šířky media query → karta zpět POD strom (stejný markup).
- **Panel „Aktuální efekty"** (dopad 4, pracnost 2) — nová funkce `heroEffectsPanelHtml(me,h)`: projít tree v pořadí hlavní→jeho suby (groupby parent), za každý uzel s r>0 řádek `.fx-row`: mini pečeť (cn-art 20px), jméno + rank „r/max", tag skillTimingTag(s), texty `skillEffs(s).map(e => effLine(e, e.val*r))` — přesně stávající effText/condEffText (895–937, umí tagy [🏹]/[proti: F]); při r≥max u hlavního zlatý řádek „Bonus při max: …" z s.maxEff. Prázdný stav „Žádný skill zatím není naučen." Umístění: slide-in overlay ZPRAVA přes .constellation (.fx-panel, min(320px, 50 %), stejné sklo jako .skill-card), přepínač „☰ Aktuální efekty" v .const-foot; dole tlačítko `.fx-alloc` „✦ Rozdělit body" → zavře panel a nastaví hwSkillSel na první odemčený nedomaxovaný uzel (pořadí hlavní→sub). Otevření panelu zavře kartu skillu a naopak (v obou binding setterech). Čistě čtecí — nula MP dopadů.
- **Spodní lišta: zůstatek, Reset, počítadlo mistrovství** (dopad 2, pracnost 1) — .const-foot (1061–1065): .pts-note přestylovat na kapsli `.pts-chip` (zlatý rám, ✦, tučné číslo) + span „(+)" s title „+1 bod za každou úroveň velitele (od 2.), +1 za každou hvězdu" (pozor: NE starý text „do 10. každou, dál sudé" — křivka se ve Fázi A změnila); Reset tlačítko beze změny logiky (freeRespecs → zlato, čte konstanty). Vedle mini počítadlo „🏅 X/4" (X = počet hlavních uzlů s rankem 15) s tooltipem výčtu bonusů rysu.
- **Tab Unikát: Vrcholná dovednost + mistrovství rysu** (dopad 3, pracnost 2) — heroUniqueTabHtml (1070–1103): sekci „Ultimátka" přejmenovat na „Vrcholná dovednost" (slot-3 skill + jeho maxEff); pod kartu rysu vložit blok „🏅 Mistrovství rysu (X/4)" — 4 karty ve stylu .uq-card: jméno hlavního skillu + jeho trait bonus přes effLine, odemčené s třídou .on, zamčené ztlumené (grayscale jako .locked uzly) s popiskem „za plné naučení (15/15)". EFF_ICONS doplnit followUp 🔁 (+ ikony roundDmg/avoidCharge z Fáze B, pokud ještě chybí). Vše čtecí.
- **Stav, signatura okna a bindingy** (dopad 2, pracnost 1) — main.js: `let hwFxOpen = false` vedle hwSkillSel (841); ZAPSAT do heroWindowSig (864–875) — jinak panel při ticku „sám" zmizí (klasická past tohoto okna, viz hwForgeSel) — a resetovat v openHeroWindow (851) i při přepnutí hrdiny (1417). Stávající bindingy .const-node[data-skill]/.cd-learn/#btn-respec fungují beze změny (suby nesou stejné data-skill); přidat delegace .sc-close/.fx-toggle/.fx-alloc/.fx-close. hwSkillSel na neexistující klíč je už dnes bezpečný (karta se nevykreslí).

## Migrace a rizika

### Účty kamarádů

- **migrateAccount v2: plný respec s přepočtem bodů** (dopad 5, pracnost 2) — game.js: `const TREE_VERSION = 2`; v migrateAccount (1042) blok: `if ((acc.treeV|0) < TREE_VERSION) { pro každý acc.heroProgress[key]: pr.skills = {}; pr.skillPts = totalSkillPtsForLevel(Math.min(HERO_MAX_LEVEL, pr.level||1)) + (pr.stars||0)*STAR_SKILL_POINT; acc.treeV = TREE_VERSION; acc.respecNote = 1; }`; emptyAccount doplnit `treeV: TREE_VERSION`. **KRITICKÉ: marker na úrovni účtu a gate verzí** — migrateAccount se volá při loadu serveru (server.js:62), profileMsg, dárcích, truhlách i loadLocalAccount (main.js:25); bez gate by opakovaná volání mazala živě naučené skilly hned po syncAccountFromFaction. Přepočet je deterministický a idempotentní; férový (nová křivka dává na každé úrovni ≥ bodů). Živí hrdinové uprostřed sezóny neexistují (svět se neukládá, restart = nová hra) → migrace na loadu pokrývá vše. Nasadit SOUČASNĚ s novým stromem (zapomenutý export totalSkillPtsForLevel = crash serveru při loadu accounts.json).
- **Dolevlování XP po změně křivky** — applyAccountToHero (1344): po nastavení level/xp/skillPts a equip (equip PŘED voláním!) zavolat `heroGainXp(faction, heroIdx, 0)` — while smyčka (1396–1404) hrdinu s přeteklým xp dolevluje, připíše body přes skillPtGainAt a uzdraví; až pak h.hp = hpMax. Samoopravné, žádná migrace level/xp polí.
- **Sanitizace applyAccountToHero (obrana do hloubky)** (dopad 2, pracnost 1) — h.skills stavět průchodem přes strom hrdiny: jen existující klíče, rank `Math.max(0, Math.min(s.max, pr.skills[k]|0))` — ruční editace accounts.json / stará záloha nesmí poslat nelegální strom do hry (a snapshotem všem). syncAccountFromFaction beze změny (zapisuje živá validní data). Navíc jednořádkový clamp `Math.min(rank, s.max)` v heroEff/heroCondEffs.
- **Zálohy a oznámení** (dopad 3, pracnost 1) — server.js: po načtení `needs = some(a => (a.treeV|0) < 2)` → `fs.copyFileSync(ACC_FILE, ACC_FILE + ".v1.bak")` v try/catch PŘED migrací a prvním flushem (flushAccounts, 66). main.js loadLocalAccount: při a.treeV<2 uložit kopii do localStorage `vp-account-v1-bak` před migrateAccount. Oznámení: profileMsg (server.js:103) přibalí respecNote → klient jednorázově ukáže „Stromy dovedností se změnily — investované body byly vráceny" (sólo po loadLocalAccount dtto); server/klient pak respecNote smaže. Hráči přijdou o ROZDĚLENÍ bodů (záměr), ne o body — komunikovat i v Kronice/changelogu.

### MP checklist

- **Žádný nový síťový příkaz**: signatury learnSkill {heroIdx, skillKey} a respecHero {heroIdx} pokrývají všech 12 uzlů → NET_CMDS (net.js:35–36) i CMDS (server.js:285–286) beze změny; veškerá validace (gating, capy) zůstává ve sdíleném game.js — server validuje týmž kódem, žádná klientská logika navíc. Snapshot přenáší h.skills automaticky (serializeState posílá celé G.factions). heroUnlocks/heroRespect/heroProgress klíče „fkey:defIdx" se nemění → pick/pickAllowed/canHire/dárky/truhly/boosts/equip/signature netknuté. MULTIPLAYER checklist (game exports → NET_CMDS → CMDS → applySnapshot) se aktivuje jen při NOVÉ mutující funkci — plán žádnou nepřidává.
- **Restart serveru**: po každé změně game.js/server.js (Fáze A i B) musí uživatel restartovat start-server.bat na :8123 — restart ukončí běžící sezónu (svět se neukládá; účty jsou díky syncAccounts každých 5 tiků na disku) → **nasadit mezi sezónami**. Fáze C je čistě klientská (reload stačí). Mixnutá stará/nová game.js klient×server by rozhodila pořadí rng rollů v reportech — další důvod nasadit A+B vcelku.
- **Ochrana proti version-skew** (dopad 2, pracnost 1) — game.js: `const GAME_VERSION` (+export); server.js přibalí do `welcome` a `started`; net.js při neshodě zapíše do #mp-status „Nová verze hry — obnov stránku (F5)" a blokne pick/cmd (early return v netSend). Starý klient s otevřenou záložkou jinak pošle starý skillKey → server bezpečně vrátí false, ale okno hrdiny by tiše lhalo.
- **Pád na klientech všech hráčů**: node test MUSÍ ověřit, že každý strom má ult flag na slotu 3 — `tree.find(s=>s.ult)` bez guardu čtou showHeroSelect (main.js:185, blokuje start hry) a ultFxFor (render.js:508, běží každý frame — pád = černá mapa u VŠECH hráčů současně).

### Testy (vzor Fáze 3: node přes module.exports; nikdy proti živému serveru — testy mažou server/data!)

- **(A) Node unit** (dopad 4, pracnost 2) — skript ve scratchpadu, require js/game.js: 1) dekorátor: všech 24 stromů má 12 uzlů, právě 4 bez parent, unikátní klíče, validní parent odkazy, ult na slotu 3, žádný maxEff na subu; 2) gating: hlavní dle SKILL_UNLOCK_MAIN, sub zamčený dokud rodič < req, capy 15/7, odmítnutí nad cap, heroSpentPoints; 3) body: heroGainXp 1→50 → Σ bodů == totalSkillPtsForLevel(50) == 49, xp==0 na stropu; Σ xpForLevel ≈ 121,5k; 4) migrace: fixture v0.9 účet (heroProgress {level:30, stars:10, skillPts:3, skills:{zur:8, uder:6, ult:1}}) → po migrateAccount skills=={}, skillPts==29+10, treeV==2; idempotence; po applyAccountToFaction + learnSkill nových klíčů + syncAccountFromFaction další migrateAccount NIC nesmaže (gate!); 5) sanitizace: neznámý klíč zahozen, rank 99 clampnut; 6) respec: vratka == spent (vč. subů), freeRespecs čerpán první; 7) capy plného buildu všech 24 hrdinů: stunChance+bonus < 35, followUp clamp 60 (Theyren), heroStats delty bonusů rysu za 0–4 dovršené skilly; 8) determinismus: 2× simulateBattle stejný seed → identický roundLog; grep Math.random v bojové cestě; 9) kotvy křivky dobývání s hrdinou lvl 1 bez bodů: ⚔10→9, ⚔15→25, ⚔30→46, ⚔90→101, ⚔300→366, grandfort→781 BEZE ZMĚNY; nová kontrolní tabulka hrdiny 50 s plným buildem vs TIER_GARRISON → zapsat do CLAUDE.md; 10) aiSpendSkills se 116 body: legální strom, gating dodržen, žádná nekonečná smyčka.
- **(B) Server :8200** — `node server/server.js 8200` na pozadí (pak TaskStop), fixture server/data/accounts.json se starými klíči bez treeV: vznikl accounts.json.v1.bak → accLogin → profileMsg (heroUnlocks beze změny) → pick (pickAllowed funguje) → start → snapshot: skills {} + přepočtené skillPts → cmd learnSkill s NOVÝM klíčem projde, se STARÝM tiše false → 5+ tiků (syncAccounts) → soubor nese jen nové klíče a treeV 2 → reconnect tokenem za běhu.
- **(C) Prohlížeč** — javascript_tool v náhledu: localStorage vp-account fixture bez treeV → loadLocalAccount migruje + záloha vp-account-v1-bak; `startGame(0,[0])` + `clearInterval(tickTimer)`; okno hrdiny: 12 uzlů na orbitách, karta skillu, fx panel přežívá tick (heroWindowSig), learnSkill/respec, mobilní šířka <560px.

### Souhrn rizik

- **Nejnebezpečnější detail celé změny**: zapomenutá gate `acc.treeV` = opakované mazání živých buildů po každém syncu; marker per-entry místo per-účet = totéž. Kryto testem A4.
- **Skoková síla prahu 15/15**: booleovské bonusy rysu (stunImmune, noCooldown, instantReturn, ignoreDef, avoidCharge) koncentrují velkou sílu do jediného bodu — hlídat testy capů (B) a případně přesunout do slabších slotů.
- **Rychlejší růst v rané/střední hře**: 1 bod/úroveň sype dřív než dnes + hrdina má naučeno víc uzlů — kompenzováno nižšími totály subskillů (60–80 %); nikdy neladit přes base konstanty (kapitán domobrany = kotva spodku křivky). AI čerpá stejné body → posílí se souměrně, ověřit kotvami.
- **Mezilehlé úrovně slabší**: zploštění konstant znamená, že úroveň 30 nově ≈ stará ~18 — hráči na rozehraných účtech pocítí pokles statů v nové sezóně; komunikovat v changelogu spolu s vráceným respecem a pozdějšími mapovými ★ FX (až 15/15).
- **Avoid chargy v PvP**: obránce-hráč s chargem zdraží dobývání hráčských polí (neutrál s kapitánem beze změny) — sledovat po nasazení.
- **Čitelnost orbity**: 12 uzlů na ploše, kde bylo 6 — vyřešeno zvětšením .constellation a 28px suby; ověřit na mobilu (padding klikacích cílů) a 860px dialogu.
- Po každé fázi aktualizovat CLAUDE.md (verze, konstanty SKILL_UNLOCK_MAIN/TRAIT_MAX_EFFS/TREE_VERSION, slovníček oddanost×body dovedností, nová kontrolní tabulka křivky) a připomenout uživateli restart start-server.bat po fázích A a B.