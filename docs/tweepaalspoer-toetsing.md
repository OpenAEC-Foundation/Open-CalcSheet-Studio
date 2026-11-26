# Tweepaalspoer — toepassingsgebied en toetsset

Dit document legt vast wat de module *Tweepaalspoer* wel en niet toetst, volgens
welke norm, en hoe ver elke formule en factor is nagelezen. Het rekenblad staat in
[`templates/tweepaalspoer.ts`](../packages/desktop/src/templates/tweepaalspoer.ts),
de handberekeningen in [`scripts/check-tweepaalspoer.mjs`](../scripts/check-tweepaalspoer.mjs).

## 1. Norm

| | |
|---|---|
| Norm | NEN-EN 1992-1-1:2005 met A1:2015 en C2:2011 |
| Nationale bijlage | NEN-EN 1992-1-1:2005+C2:2011/NB:2016+A1:2020 |
| Belastingfactor eigen gewicht | NEN-EN 1990 + NB, tabellen NB.4 en NB.5: 6.10a met 1,2, 1,35 of 1,5 per gevolgklasse uit de projectgegevens |

Editie en bijlage horen per project te worden vastgesteld (zie
[overdracht.md](overdracht.md), §3). De ontwerplevensduur komt uit de projectgegevens
en bepaalt de constructieklasse.

## 2. Toepassingsgebied

**Wel**

- Rechthoekige poer, prismatisch, met eigen maten voor lengte, breedte en hoogte.
- Twee palen in één lijn, symmetrisch onder de poer; vierkant, rechthoekig of rond.
- Eén kolom in het midden; rechthoekig of rond. De maten zijn het belaste vlak op de poer.
- Alleen een verticale, centrische drukkracht uit de kolom. UGT en frequente BGT apart in te voeren.
- Eigen gewicht van de poer: het blad telt het erbij (25 kN/m³).
- Beton C20/25 t/m C50/60, betonstaal B500B of B500C.
- Gekozen wapening, alle staven ten hoogste Ø32: trekband (ten minste Ø8) in één of twee
  lagen, rechte of omgebogen staven; beugels (ten minste Ø5); zijstaven en bovenstaven (ten
  minste Ø6); haarspelden om de trekband (ten minste Ø8); dwarsstaven op de diagonalen (ten minste Ø8).

**Niet: dan geen eindoordeel 'voldoet'**

| Geval | Uitkomst op het blad | Waarom |
|---|---|---|
| Drukdiagonaal flauwer dan 45° (θ < 45°) | niet getoetst | Bewuste grens van dit blad, geen normeis. Flauwer werkt de poer meer als ligger: de toetsset hieronder dekt dat niet. |
| Kolom en paal overlappen in de lengterichting (a_v ≤ 0, met de paalafwijking) | niet getoetst | Dan is er geen staafwerk tussen kolom en paal. |
| Betonstaal B500A | niet getoetst | 5.6.3 raadt klasse A af voor een plastische berekening; een staafwerkmodel is er een. |
| Staaf groter dan Ø32 | niet getoetst | 8.8 stelt extra eisen die dit blad niet uitwerkt. |
| Dwarsstabiliteit, horizontale krachten en kolommomenten niet aangetoond | niet getoetst | Twee palen op één lijn kunnen geen moment dwars op die lijn opnemen. Zie §5. |
| Geen paalafwijking ingevoerd (e_p = 0) | niet getoetst | 9.8.1(1) vraagt rekening te houden met de verwachte afwijking. 0 is geen uitspraak daarover. |
| Maten, lasten of staven onmogelijk of niet ingevuld; ontwerplevensduur of gevolgklasse ontbreekt | ongeldige invoer, niet getoetst | Rekenen zou een schijnzekerheid geven. |

**Buiten dit blad**, los van het oordeel over de poer en op het blad benoemd:
het draagvermogen van de palen zelf (het blad geeft de paalreactie R_Ed door),
de aansluiting van de kolom op de poer, trek in de palen, brand, vermoeiing en
aardbeving, chemische aantasting (milieuklasse XA) en vorst (XF).

## 3. Rekenmodel

Staafwerkmodel volgens 6.5 en 5.6.4; 9.8.1(2) staat dat voor poeren toe. Het model is
een symmetrisch staafwerk in het vlak door de palen: twee drukdiagonalen van de kolom
naar de paalknopen, één trekband onderin, een horizontale drukstaaf bovenin.

- **Inwendige hefboomsarm UGT:** kleinste waarde uit de drukzone onder de kolom bij de
  knoopgrens, 0,9 · d en de arm bij een diagonaal van 55° (l_t · tan 55°). De grenzen 0,9 · d
  en 55° zijn eigen keuzes, geen normtekst. Een hogere poer verlaagt de trekkracht boven 55°
  niet verder: de plastische herverdeling die daarvoor nodig is, toont dit blad niet aan. Het
  bereik van 45° tot 55° komt uit de oudere literatuur over poeren op twee palen; die
  verwijzing is uit het hoofd en niet aan de bron getoetst. Bij een gewone poer doet de grens
  niets. De drukzone en de knopen houden hun maat zonder deze grens. De UGT rekent nog steeds
  met een grotere arm dan de BGT als de elastische arm kleiner is.
- **Hefboomsarm BGT:** 5.6.4(2) eist voor scheurwijdte een staafwerk dat ongeveer de
  lineair-elastische spanningen volgt. Daarom hier de kleinste van de UGT-arm en de
  elastische arm van een hoge ligger uit de literatuur (0,6 · a bij a/h < 1,
  0,2 · (a + 2h) bij 1 ≤ a/h ≤ 2). Dat is geen normformule. Omdat (7.9) alleen geldt zolang
  de wapening niet vloeit, hoort σ_s ≤ f_yk bij de toets op de scheurwijdte.
- **Paalafwijking e_p (9.8.1(1)):** omhullend. Voor de trekband staan beide palen naar
  buiten: de arm neemt toe met e. Voor de paalreactie en de drukdiagonaal is de reactie
  bovendien 1 + 2e/a maal zo groot; dat kan niet tegelijk gebeuren met beide palen naar
  buiten, en is dus strenger dan elk afzonderlijk mogelijk stelsel. F_c·cos θ is daardoor
  niet gelijk aan T_Ed.
- **Ronde paal of kolom:** gelijkwaardig vierkant met dezelfde oppervlakte voor de
  knopen; de arm van de kolomhelft gaat uit van het werkelijke zwaartepunt van de halve cirkel.
- **Eigen gewicht:** alles via de kolomknoop, ook het deel dat rechtstreeks op de palen
  rust; aan de veilige kant.

## 4. Toetsset

Elke toets heeft op het blad een van vier uitkomsten: *voldoet*, *voldoet niet*,
*niet getoetst* of *niet van toepassing*. Het blad als geheel:

1. **ongeldige invoer** → geen UC, geen oordeel;
2. **buiten toepassingsgebied** → geen UC, *niet getoetst*;
3. een toets met **UC > 1** → *voldoet niet*; de onafgeronde waarde beslist;
4. een **verplichte toets ontbreekt** (dwarsstabiliteit niet aangetoond, geen paalafwijking)
   of een waarde die niet te rekenen is → *niet getoetst*;
5. alleen als alle toetsen een getal hebben dat het zegt → *voldoet*.

Een noemer van 0 of kleiner in een UC (staven die overlappen, geen ruimte, geen weerstand bij
een kracht) geeft UC = 99 of ∞, nooit een getal onder de 1. Is de kracht zelf nul, dan is de UC 0.

De onafgeronde waarde beslist. Een UC op het blad wordt naar boven afgerond op twee
decimalen: 1,004 staat er als 1,01, nooit als 1,00. `UC_max` is die afgeronde waarde,
dus de kop van het blad, de afdruk en het rapport tonen hetzelfde getal. Is er geen
oordeel, dan staat `UC_max` er niet en leest `bladLezen.leesResultaat` *niet getoetst*
uit de slotregel.

### UGT: staafwerk

| Toets | Artikel | Factoren uit de NB, nagelezen |
|---|---|---|
| Sterkten | 3.1.6, 2.4.2.4, tabel 3.1 | α_cc = α_ct = 1,0; γ_C = 1,5; γ_S = 1,15 |
| Trekband | 6.5.3(1) | |
| Minimum- en maximumwapening | 9.2.1.1 (NB), 9.8.1(3) | A_s,min = kleinste van A_s,min1 (M_E,min = f_ctm·W) en 1,25 · A_s,nodig; A_s,max = 0,04·A_c |
| Knoop onder de kolom (CCC) | 6.5.4(4)a, (6.60) | k₁ = 1,0; ν′ = 1 − f_ck/250 |
| Paalknoop (CCT) | 6.5.4(4)b, (6.61) | k₂ = 0,85 alleen met ten minste twee haarspelden per paal, die met de onderbenen boven de paal T_sp dragen (NB, met een eigen eis) |
| Drukdiagonaal | 6.5.2(2), (6.56) | ν′ als boven |
| Splijtkracht in het vlak en dwars | 6.5.3(3), (6.58), (6.59), figuur 6.25 | in (6.59) h vervangen door H (NB) |
| Dwarskracht, bovengrens | 6.2.2(6), (6.5) | ν = 0,6(1 − f_ck/250) |
| Pons, drukdiagonaal langs kolom en paal | 6.4.5(3) | v_Rd,max = 0,4·ν·f_cd (NB) |

Keuzes aan de veilige kant, geen normeis:

- zonder die haarspelden rekent de paalknoop met k₃ = 0,75: de NB noemt daar geen waarde voor k₂;
- de vergroting met 10 % van 6.5.4(5) en de drie-assige druk van 6.5.4(6) worden niet gebruikt;
- de drukdiagonaal wordt halverwege getoetst met 0,6·ν′·f_cd: in het vlak het gemiddelde van de
  breedten aan de twee knopen, dwars b_ef uit figuur 6.25, begrensd op de poerbreedte. Die
  verbreding mag alleen met dwarsstaven, omdat die de splijtkracht dwars dragen. Zonder
  dwarsstaven rekent de diagonaal met de kleinste knoopbreedte en telt de splijtkracht dwars niet;
- in het vlak tellen alleen de beugels in a_v, niet die aan de uiteinden van de diagonaal. De
  splijtkracht T uit figuur 6.25 geldt per helft van de diagonaal, er zijn er twee: daarom telt
  de helft van die beugels en zijstaven. Dat volgt uit de figuur en is dus geen keuze;
- dwars op het vlak staat (6.59) letterlijk, ook als de poer smaller is dan b_ef. Het blad
  noemt op het scherm de sprong naar (6.58) op b = H/2;
- de splijtkracht dwars dragen alleen de dwarsstaven: 5.6.4(4) en 6.5.3(3) vragen wapening op
  de plaats van T, verdeeld over de lengte waarover de trajectoriën gekromd zijn. De onderbenen
  liggen onder de paalknoop en de bovenbenen in de drukzone, dus die tellen niet. De dwarsstaven
  liggen op de lijn van de diagonaal, `n` in de paalhelft en `n` in de kolomhelft, en worden
  verankerd als een beugel om de zijstaven (8.5);
- de haarspeld moet zijn volle l_b,rqd kwijt in de hoogte van de poer;
- bij de pons rekent de kolom met β = 1,15 en de paal met β = 1,4 (naar 6.4.3(6), figuur 6.21N,
  als analogie: die voorwaarden gaan over vloeren). Langs de kolom tellen alleen de twee vlakken
  naar de palen. De paal rekent met de omtrek van een randkolom (6.4.5(3)).

### Verankering en buiging

| Toets | Artikel | Factoren uit de NB, nagelezen |
|---|---|---|
| Verankeringslengte | 6.5.4(7), 8.4.3, 8.4.4, tabel 8.2, figuur 8.3 | de lengte begint bij de binnenkant van de paal en is langs de hartlijn gemeten |
| Doorndiameter en beton in de ombuiging | 8.3, tabel 8.1Na, (8.1) | 4Ø tot en met Ø16, daarboven 5Ø |
| Vorm van het been | figuur 8.1 | ten minste 5Ø recht na de bocht; korter is *voldoet niet* |

α₃, α₄ en α₅ staan op 1,0 en de gunstige druk van 9.8.1(5) telt niet mee: aan de veilige kant.
Voor de bovenste laag van twee lagen geldt de kortste beschikbare lengte.

### BGT

| Toets | Artikel | Factoren uit de NB, nagelezen |
|---|---|---|
| Scheurwijdte trekband | 7.3.1(8), 7.3.4, (7.8), (7.9), (7.13), (7.14) | k₃ = 3,4; k₄ = 0,425; s_r,max begrensd; **frequente** combinatie |
| Grens scheurwijdte | tabel 7.1N (NB) | 0,40 mm bij XC1; 0,30 mm bij XC2 t/m XC4; 0,20 mm bij XD en XS; k_x = c_toegepast/c_nom ≤ 2, niet bij XC1 |
| Huidwapening | 7.3.3(3) | alleen bij h ≥ 1000 mm, anders niet van toepassing |

De frequente combinatie is een NB-eis. De norm zelf noemt voor gewapend beton de
quasi-blijvende combinatie: wie die waarde invult, rekent te gunstig. In (7.13) staan ε₁ en
ε₂ op de randen van het effectieve trekgebied. A_c,eff telt over de volle poerbreedte, wat
s_r,max groter maakt: aan de veilige kant. Liggen de staven verder dan 5(c + Ø/2) uit elkaar
of van de rand, dan geldt (7.14).

### Detaillering

| Toets | Artikel |
|---|---|
| Kleinste staafdiameters: trekband 8 mm; beugels 5 mm; langsstaven 6 mm; haarspelden 8 mm (eigen keuze) | 9.8.1(3) (NB), 9.2.2(9) (NB), 9.2.1.1(5) (NB) |
| Vrije ruimte: trekband, beugels en benen per rij, beugelbenen in de breedte, zijstaven, bovenstaven, haarspelden tussen de onderbenen boven de paal; onderste zijstaaf boven de trekband | 8.2(2) (NB: k₁ = 1, k₂ = 5 mm) |
| Trekband binnen de zone boven de paal, op de hoogte van de onderste laag; band met haarspelden binnen de beugels | 9.8.1(3), figuur 9.11 |
| Wapening boven de paalkop | eigen eis |
| Paal voldoende ver van de rand, met de afwijking | 9.8.1(1) |
| Dekking op werkvloer of grond, ook op het staafeinde en met de korrel | 4.4.1.2, tabel 4.2 (voetnoot), 4.4.1.3 (NB: Δc_dev = 5 mm; k₁ = c_min,dur + 10 mm; k₂ = c_min,dur + 50 mm), tabel 4.4N (NB), klasse S4 bij 50 jaar, S6 bij 100 jaar |
| Wapeningsnet op de zijvlakken: oppervlak en afstand; één beugelbeen per vlak | 9.7(1), (2) |
| Beugels: afstanden hart-op-hart en wapeningspercentage | 9.2.2(5), (6), (8) (NB) |

Reductie van de constructieklasse om de sterkteklasse (tabel 4.3N) wordt niet gebruikt:
aan de veilige kant. De inbedding van 50 mm uit figuur 9.11 hoort bij 9.8.1(5), dat dit
blad niet gebruikt, en is daarom geen eis.

## 5. Waarom bepaalde toetsen niet op het blad staan

Het voorstel vraagt expliciet te bepalen of aanvullende controles vereist zijn.

| Controle | Uitkomst | Onderbouwing |
|---|---|---|
| Dwarskrachtweerstand V_Rd,c | niet van toepassing | 6.2.2(7) staat het staafwerkmodel als alternatief toe. Binnen dit toepassingsgebied ligt de paal binnen 2d van de kolom. De bovengrens (6.5) en de splijtkracht staan wel op het blad. |
| Pons op de controle-omtrek u₁ | niet van toepassing | Bij θ ≥ 45° ligt de paal binnen 2d van de kolom: de oplegreactie valt binnen de omtrek en de kracht loopt rechtstreeks door de diagonaal. De grens langs kolom en paal (6.4.5(3)) staat wel op het blad. |
| Splijtkrachten | getoetst | Niet door het staafwerk zelf afgedekt: staan apart op het blad, in het vlak en dwars. |
| Betondruk in de BGT (7.2(2)) | niet van toepassing | Alleen aanbevolen bij XD, XF en XS zonder andere maatregelen; beugels en haarspelden sluiten het beton op. |
| Lineaire kruip (7.2(3)) | niet van toepassing | Er wordt geen kruipvervorming berekend. |
| Staalspanning in de BGT (7.2(5)) | niet van toepassing | De NB zet k₃, k₄ en k₅ op 0,0. Dit blad leest dat als: geen aparte toets. **Interpretatie, zie §6.** Wel moet σ_s onder f_yk blijven: (7.9) geldt daarboven niet, en 7.2(4)P blijft gelden. Daarom ook bij de karakteristieke last, afgeschat als F_Ed/1,3. |
| Doorbuiging (7.4) | niet van toepassing | Een gedrongen poer buigt niet relevant door; zakking hoort bij de palen. |
| Bovenwapening | constructief | 9.8.1(3): bij een centrische last geen trek bovenin. Staat in de tekening, telt niet mee in de toetsing. |
| Minimumwapening voor scheurbeheersing (7.3.2) | niet van toepassing | NB-opmerking bij 7.3.2(1)P onder a): krimp en temperatuur zijn op twee palen nauwelijks belemmerd. |
| Dwarsstabiliteit, horizontale krachten en kolommomenten | **verplicht, buiten dit blad** | Moet elders zijn aangetoond, bijvoorbeeld met funderingsbalken. Zonder die bevestiging: *niet getoetst*. Het blad geeft het moment uit de paalafwijking dwars op de paallijn door. |

## 6. Wat is nagelezen en wat niet

De module is nagelezen tegen een lokale kopie van de norm met de nationale bijlage
(uitdraaien uit een normenportaal van 10-10-2023, niet in de repo). Alle factoren in de
tabellen van §4 komen daaruit, net als de tabellen 3.1, 4.4N, 7.1N en 8.1Na en de
formules (6.55) t/m (6.62), (7.8), (7.9), (7.13), (7.14), (8.1) t/m (8.6). Niet alles
kon worden vastgesteld:

| Punt | Stand |
|---|---|
| **ρ_w,min (9.2.2(5))** | **Niet aan de NB getoetst.** De formule ontbreekt in de lokale kopie; er staat alleen dat de waarde 'gelijk aan' een lege plek moet zijn. Het blad neemt de grootste van 0,08·√f_ck/f_yk (9.5N) en 0,16·f_ctm/f_yk. Dat laatste komt uit het geheugen, niet uit de kopie. |
| **k₃, k₄, k₅ = 0,0 (7.2(5))** | De waarde staat zo in de NB. Een spanningsgrens van nul is niet uitvoerbaar: dit blad leest dat als 'geen toets' op k₃·f_yk, en toetst wel f_yk (7.2(4)P). Lezing bevestigd door de eigenaar. |
| **A_cd in 9.7(1)** | De NB schrijft A_cd; de symbolenlijst definieert het niet. Dit blad leest: de betondoorsnede per meter, per zijvlak en per richting, dus b mm²/m. Dat is de strengste lezing. Bevestigd door de eigenaar. |
| **E_cm** | Rij van tabel 3.1 in de kopie deels onleesbaar; waarden uit het geheugen (30, 31, 33, 34, 35, 36, 37 GPa). Weegt alleen via α_e licht mee in de scheurwijdte. |
| **Tabel 4.3N, kolommen XD en XS** | Afgesneden in de NB-kopie; niet nodig, want de reductie op de sterkteklasse wordt niet gebruikt. |
| **(6.59) bij H/2 < b < b_ef** | Letterlijk toegepast. Uit figuur 6.25 volgt voor een poer die de spreiding tot b_ef niet toelaat een kleinere kracht, T = F·(b − a)/(2H), die aansluit op (6.58). Die verfijning is niet gebruikt, op keuze van de eigenaar. Bij b = H/2 springt de splijtkracht daardoor sterk; het blad meldt dat. Onder H/2 is er geen reserve. |
| **Elastische hefboomsarm, 0,9·d, 45° ≤ θ ≤ 55°** | Eigen keuzes. Geen normtekst om tegen te toetsen. |
| **k₂ = 0,85: hoeveel haarspelden** | De NB zegt 'haarspelden', geen aantal. Dit blad vraagt er ten minste twee per paal, die samen met de onderbenen binnen de paalmaat T_sp dragen. Eigen eis, op keuze van de eigenaar; de EN beveelt 0,85 zonder voorwaarde aan. |
| **Zone boven de paal bij een dwars verschoven paal** | De paalafwijking telt mee in de afstand tot de rand, niet in de zone boven de paal: de norm geeft daar geen getal voor. |
| **Zijstaven door de diagonaal** | Rekenen op f_yd zonder aparte toets van hun verankering voorbij de diagonaal. |
| **Karakteristieke last** | Afgeschat als F_Ed/1,3, omdat het blad die last niet vraagt. Dat is een eigen keuze. |
| **Geen spreiding zonder dwarsstaven** | Eigen lezing: een diagonaal die niet breder wordt dan de knoop, heeft geen dwarstrek. Gerekend met dezelfde grens 0,6·ν′·f_cd. Niet aan proeven getoetst. |

De handberekeningen zijn fictief. **Er is niet vergeleken met praktijkrapporten of
proefresultaten.** Daarom staat de module in de catalogus op *controleren*.

Het blad is met de hand en met willekeurige invoer nagerekend en doorzocht op een onterecht
'voldoet'. **Een controle door een tweede constructeur heeft nog niet plaatsgevonden.**

## 7. De fasen uit het voorstel

| Fase | Wat | Stand |
|---|---|---|
| 1 | Tweepaalspoer en poer op drie of vier palen: berekening, parametrische plattegrond en doorsneden, PDF via de afdruk, SVG-detail | er (dit blad en [meerpaalspoer-toetsing.md](meerpaalspoer-toetsing.md)) |
| 2 | Staaflijst met merken, vormen en lengtes; DXF-detail; ontwerpschema of vrijgegeven voor uitvoering | er, zie §9 |
| 3 | IFC van het beton en elke staaf als IfcReinforcingBar met geometrie, merk en diameter | er, zie §8 en §9 |
| 4 | Koppeling met andere apps en revisiebeheer van gekoppelde tekeningen | er, zie §10 |

## 8. Het 3D-studiemodel

Op het scherm staat bij de tekening een draaibaar model: de poer als doorzichtig
betonvolume, de twee palen, de kolom en de korf. Het model rekent niets uit en toetst
niets. Het komt uit dezelfde definitie als de tekening (`poerDefinitie.ts`, via
`poerIfcx.ts`) en volgt elke wijziging meteen, uit de velden en uit de blauwe maten. Palen
en kolom zijn alleen de aanzet, zoals op de tekening. Het staat niet op papier.

`scripts/check-poer-ifcx.mjs` legt het model naast de definitie en de tekening: de maten,
en het aantal en de plaats van elke staaf.

Elke staaf in het model draagt sinds fase 3 zijn merk uit de staaflijst
(`ocss::calc::merk`), zijn diameter en zijn lengte langs de hartlijn. De hoeken van beugels
en haarspelden buigen om de kleinste doorn uit tabel 8.1N, zoals in de staaflijst.

## 9. Staaflijst en DXF-detail

Onder de tekening staat de staaflijst, uit dezelfde staven als de tekening, het model en de
toets (`poerStaven.ts`). Op papier is het een tabel; op het scherm staat hij ingeklapt, met
de uitleg, het vinkje *Vrijgegeven voor uitvoering* en de knop voor het DXF-detail.

- **Merk**: gelijke staven (soort, diameter, vorm, haken en zijlengtes op de millimeter)
  krijgen één merk, genummerd in de volgorde van de legenda.
- **Vormcode**: 00 recht, 21 U-vorm, 51 gesloten beugel met twee haken, 99 een andere vorm.
  Een eigen nummering naar de gangbare indeling.
- **Zijlengtes** zijn hartmaten, van knik tot knik. De **lengte** is de lengte langs de
  hartlijn: in elke knik van 90° (2 − π/2)·r korter dan de zijlengtes samen, met r de
  buigstraal op het hart. Een gesloten beugel heeft twee haken van 135° met max(5Ø; 50 mm)
  recht (figuur 8.5).
- **Buigstraal**: de ingevoerde doorn bij de trekband; bij beugels en haarspelden de
  kleinste doorn uit tabel 8.1N (4Ø tot Ø16, daarboven 7Ø).
- **Massa** met 7850 kg/m³, per diameter en in totaal.
- De **dwarsstaven** staan recht in de lijst, zoals op de tekening; de haken om de
  zijstaven (8.5) tekent dit blad niet en telt het niet mee in de lengte.

Het **DXF-detail** (R12, ASCII) heeft een bemaatte plattegrond, doorsnede A-A in de lengte
door de palen en B-B dwars boven een paal, met de hartlijnen en doorsneden van de staven, en
de staaflijst. Lagen: BETON, WAPENING, MAATVOERING en TEKST; maten in mm, op ware grootte.
In de titel van de tekening en van de staaflijst staat de status: *Ontwerpschema*, of
*Vrijgegeven voor uitvoering* als het vinkje aan staat **en** het blad zegt dat de poer
voldoet. Zonder dat oordeel (een verplichte toets ontbreekt, ongeldige invoer of een UC
boven 1) blijft het een ontwerpschema, met de reden erbij. In de app bewaart de knop via de
bewaardialoog, in de browser via de bestandskiezer of als download. De status is een
waarde van het blad (`tekening_vrij`) en gaat mee met het project.

`scripts/check-poer-staaflijst.mjs` rekent de lengtes met de hand na (uitgeschreven in de
kop), legt de staaflijst naast de tekening en de toets (aantallen, diameters, staalvlak, en
het recht deel van de trekband vanaf de paal tegen l_h en l_av van het blad), controleert
dat elke staaf binnen de dekking ligt, dat het DXF geldig is en de wapening binnen het beton
van elk aanzicht staat, en dat elke staaf in de IFCX een IfcReinforcingBar met geometrie,
merk en diameter is.

## 10. Fase 4: palenplan, vaste ids en revisies

Beide poerbladen (twee palen, drie of vier palen) hebben op het scherm, onder de staaflijst,
het onderdeel *Palenplan en revisie* (`components/calc/PoerKoppeling.tsx`). Op papier staat
alleen de revisie, achter de status in de kop van de staaflijst.

**Een palenplan inlezen.** Een palenplan is een IFCX met poeren (`IfcFooting`) en palen
(`IfcPile`), van een tekenprogramma of een ander blad. De lezer (`components/calc/palenplan.ts`,
op `leesIfcx` van de kern) zoekt per poer de palen waarvan het hart binnen het grondvlak van
de poer ligt, en een kolom (`IfcColumn`) erop. Daaruit volgen het blad en zijn invoer:

| Uit het plan | Wordt in het blad |
|---|---|
| twee palen | tweepaalspoer: `a_hoh`, `l_poer`, `b_poer` langs en dwars op de paallijn |
| vier palen | poer op vier palen: `a_x`, `a_y`, `l_poer`, `b_poer` in de assen van het grondvlak |
| drie palen | poer op drie palen: `a_3` (gemiddelde onderlinge afstand), `r_rand` (kleinste afstand paalhart tot rand) |
| hoogte van de poer | `h_poer` |
| paalmaat, rond of rechthoekig | `paalvorm`, `p_x`, `p_y`, gemeten in de assen van de poer; rond als de doorsnede twaalf of meer hoeken heeft (de omgeschreven cirkel) |
| bovenkant paal min onderkant poer | `t_in` |
| kolom | `kolomvorm`, `c_x`, `c_y` |
| `ocss::poer::N_Ed`, `N_fr` (kN), `M_Edx`, `M_Edy` (kNm) op de poer, als ze er zijn | de kolomlasten (`F_Ed`, `F_fr` bij twee palen) |

De wapening, het beton, de dekking en de lasten zonder attribuut blijven de invoer van het
blad. Lasten uit een ander blad van het project gaan zoals altijd met een verwijzing in het
invoerveld (`#ref.naam`, [projectmodel.md](projectmodel.md)). Het blad legt de palen
symmetrisch om de kolom in zijn eigen assen; wat in het plan anders staat (de palen niet in
een rechthoek of gelijkzijdige driehoek, de kolom niet in het midden, ongelijke palen, een
ander aantal palen) is een melding bij die poer. Een poer gaat met *In dit blad* in het open
blad, of met *Als nieuw blad* in een nieuw blad van de goede soort.

**Vaste ids.** Een poer houdt de id uit het plan (`ocss::poer::id`, anders zijn naam, anders
zijn pad), elke paal de zijne (`ocss::paal::id`), in de volgorde van de poerdefinitie. Ze
staan als waarden in het blad (`poer_id`, `paal_ids`), met de plaats en de draaiing in het
plan (`plan_x`, `plan_y`, `plan_z`, `plan_hoek`) en wat het blad overnam (`plan_inhoud`).
De IFCX van de poer, ook in het projectbestand en de STEP, draagt de ids en staat op zijn
plaats in het plan ([ifc-export.md](ifc-export.md)). Een staafgroep heeft een vaste sleutel
uit de definitie (`band/x`, `beugel/1`, `randbeugel`), los van het merk, dat opschuift als
er een staafsoort bijkomt.

**Wijzigingen in het plan.** Wie het plan opnieuw inleest, ziet bij een gekoppeld blad
per veld waar het blad en het plan verschillen, en of dat in het plan veranderde sinds het
overnemen of in het blad zelf; *Uit het palenplan overnemen* zet de waarden van het plan in
het blad.

**Revisies** (`components/calc/poerRevisie.ts`). Een revisie hangt aan de inhoud van het
detail: de maten van poer, palen en kolom, en per staafgroep de regel uit de staaflijst
(aantal, diameter, vorm, zijlengtes, lengte) met de hoogte van de staven, op de millimeter.
Zolang die gelijk is aan de vastgelegde revisie, geldt dat nummer; verandert er iets, ook
door een wijziging uit het palenplan, dan staat meteen het volgende nummer in de titel van
het detail, het DXF en de staaflijst, en `ocss::revisie` in de IFCX. Het scherm toont wat
er sinds de vorige revisie veranderde. Vastleggen gebeurt bij het opslaan van het DXF-detail
of de IFCX, of met de knop *Revisie vastleggen*: het nummer, de datum, de inhoud en die van
de vorige revisie gaan als waarden in het blad (`poer_rev`, `poer_rev_datum`,
`poer_rev_inhoud`, `poer_rev_vorig`) en met het project mee. Wie terugzet naar de
vastgelegde inhoud, krijgt het oude nummer terug.

**Handwerk wordt niet bewaard.** Het wapeningsdetail, het DXF en de IFCX komen altijd uit
de definitie van het blad (de invoer via `poerDefinitie.ts` of `meerpaalDefinitie.ts`).
Tekst, maten of verplaatste aanzichten die iemand in een getekend DXF toevoegt, staan in
een nieuwe uitvoer niet meer; zet handwerk daarom in een eigen tekening die het detail als
onderlegger gebruikt.

`scripts/check-poer-koppeling.mjs` controleert dit met een klein verzonnen palenplan
(`scripts/fixtures/palenplan-proef.ifcx`, gemaakt door `scripts/lib/palenplan-proef.mjs`)
met een poer op vier en een op drie palen, met de handberekening in de kop: de overgenomen
invoer, het doorrekenen, de palen teruggezet op het plan met hun ids, de revisies na een
wijziging van de wapening en van het plan, het projectbestand en de STEP, en wat niet past.
