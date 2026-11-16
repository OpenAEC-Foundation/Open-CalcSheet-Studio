# Een model door Open FEM Studio: `@fem`

Een rekenblad bouwt met `@fem naam … @end` een model op dat Open FEM Studio doorrekent:
een **plaatmodel** (platen, veren, lijnsteunen; dit eerste deel) of een **staafwerk**
(staven, knopen, opleggingen; zie [Een staafwerk](#een-staafwerk-staven-in-fem) verderop).
Een blok met `staaf`, `knoop`, `steun`, `rechthoek`, `doorsnede` of `lijnlast` is een
staafwerk, elk ander blok een plaatmodel. Platen en staven in één model kan nog niet.

## Een plaatmodel

Een rekenblad bouwt met `@fem naam … @end` een plaatmodel op. Open FEM Studio rekent
het door (`solve_open_fem_3d`, vierhoekige MITC4-schaalelementen) en het blad rekent
verder met de uitkomsten. CalcSheet heeft hier geen eigen plaatkern: het blad maakt het
model en het raster, FEM Studio rekent. De oude eigen kern (`plaat_palen`, DKT) blijft
alleen als terugval en ter vergelijking.

De code: `packages/core/src/femBlok.ts` (het blok), `femNet.ts` (het raster en de JSON),
`femResultaat.ts` (combinaties, waarden, beelden). De controle:
`scripts/check-fem-model.mjs`, met de antwoorden van de echte server in
`scripts/fixtures/fem/` (opnieuw te maken met `node scripts/proef-fem-model.mjs --bewaar`).

## Voorbeeld: een betonvloer op palen

```text
L = 5 m
t = 250 mm
b_k = 1 m
t_k = 450 mm
b_s = 1 m
t_s = 350 mm
k = 200 MN/m
d = 400 mm

@fem vloer
  materiaal 33 GPa; 0.2
  maas 0.5 m
  // de vloer, en de versterkte stroken over de middelste paallijnen
  plaat 0; 0; 2*L; 2*L; t
  plaat 0; L - b_s/2; 2*L; b_s; t_s
  plaat L - b_s/2; 0; b_s; 2*L; t_s
  // een ponskop boven elke paal, binnen de vloer gehouden
  #for i = 0 : 2
  #for j = 0 : 2
  plaat max(i*L - b_k/2; 0 m); max(j*L - b_k/2; 0 m); min(i*L + b_k/2; 2*L) - max(i*L - b_k/2; 0 m); min(j*L + b_k/2; 2*L) - max(j*L - b_k/2; 0 m); t_k
  #loop
  #loop
  veren 0; 0; 3; 3; L; L; k; d
  geval G
    eigengewicht 25 kN/m^3
    vlaklast 1 kN/m^2
  geval Q
    vlaklast 5 kN/m^2; 0; 0; L; 2*L
    puntlast 20 kN; 1.5*L; 1.5*L
  combinatie UGT = 1.2*G + 1.5*Q
  combinatie BGT = G + Q
  beeld UGT mx
@end

m_Ed = vloer.UGT.mx_max
m_Ed,steun = -vloer.UGT.mx_min
m_ks = -fem_strook(vloer; "UGT"; "mx"; L; 0.75*L; L; 1.25*L)
R_max = vloer.R_max
w_BGT = vloer.BGT.w_max
@3d
eenheid m
fem vloer BGT w
@end
```

Het blok is dat van de controle (`scripts/fixtures/fem/bladen.mjs`, `VLOER`), met een
`beeld` erbij. Met de vastgelegde antwoorden geeft het blad m_Ed = 80,2 kNm/m,
m_Ed,steun = 114,9 kNm/m, m_ks = 58,2 kNm/m boven de middelste paal, R_max = 485,2 kN en
w_BGT = 2,68 mm.

## De regels in het blok

Een regel is een woord en zijn waarden, gescheiden door `;`. Elke waarde is een
uitdrukking uit het blad, met eenheid. Een kaal getal telt in de eenheid die erbij staat.
Een regel met `//` is commentaar; `#for … #loop` en `#if … #else if … #else … #end if`
werken zoals in de rest van het blad.

| Regel | Betekenis | Kaal getal in |
|---|---|---|
| `materiaal E; ν` | elasticiteitsmodulus en dwarscontractie, voor alle platen | MPa |
| `maas a` | de grootste zijde van een element (standaard 0,5 m) | m |
| `analyse lineair` | de enige analyse die FEM Studio voor platen nu kent (standaard) | |
| `plaat [naam:] x; y; l_x; l_y; t` | een rechthoekige plaat vanaf de hoek (x, y), dikte t; een latere plaat over een eerdere wint | m |
| `veer x; y; k [; d_kop]` | een veer loodrecht op de plaat, over de knopen binnen de paalkop d verdeeld | m, kN/m |
| `veren x₀; y₀; n_x; n_y; a_x; a_y; k [; d_kop]` | een raster van n_x × n_y veren op afstand a_x, a_y | m, kN/m |
| `lijnsteun x₁; y₁; x₂; y₂ [; k]` | een steun langs een lijn evenwijdig aan x of y; zonder k vast, met k een veer per m | m, kN/m² |
| `geval naam` | een belastinggeval; de lasten eronder horen erbij | |
| `vlaklast q` | op de hele vloer | kN/m² |
| `vlaklast q; plaat` | op de rechthoek van een benoemde plaat, ook waar een latere plaat erover ligt | kN/m² |
| `vlaklast q; x; y; l_x; l_y` | op een rechthoek | kN/m², m |
| `eigengewicht γ` | γ maal de dikte van de plaat die er ligt | kN/m³ |
| `puntlast F; x; y` | een puntlast | kN, m |
| `combinatie naam = 1.2*G + 1.5*Q` | een som van factor maal geval; een factor mag een uitdrukking uit het blad zijn | |
| `beeld UGT mx` | een plattegrond in kleur onder het blok (zie `fem_svg`); w, mx, my, mxy, vx of vy | |

Een last omlaag is positief. Een fout staat per regel boven het blok (`regel 7: veer
verwacht 3 of 4 waarden …`); dan gaat er niets naar FEM Studio.

## Na het blok in de scope

Een punt in een naam is in de rekentaal een liggend streepje: `vloer.UGT.mx_max` is
`vloer_UGT_mx_max`. Uit een ander blad schrijf je de liggende streepjes: `#2.vloer_UGT_mx_max`,
en `fem_waarde(#2.vloer; "UGT"; "mx"; x; y)` leest het model van blad 2.

| Naam | Wat | Eenheid |
|---|---|---|
| `vloer` | het model zelf, voor de functies en `@3d` | |
| `vloer.R.mx_max`, `.mx_min`, `.my_max`, `.my_min`, `.mxy_max`, `.mxy_min` | de uitersten per geval of combinatie R | kNm/m |
| `vloer.R.w_max`, `.w_min` | doorbuiging, omlaag positief | mm |
| `vloer.R.R` | de reactie per veer, in de volgorde van het blok (een raster rij voor rij, de onderste eerst) | kN |
| `vloer.R.R_max`, `.R_min`, `.R_som` | de grootste, kleinste en totale veerreactie | kN |
| `vloer.R.RL` | de reactie per lijnsteun | kN |
| `vloer.mx_max`, … `vloer.R_min` | de omhullende over de combinaties (zonder combinaties: over de gevallen) | |

Tekens zoals in `plaat.ts`: een moment is positief bij trek aan de onderzijde, m_x geeft
spanning in x (wapening in x), een reactie is positief omhoog. Een moment per meter heeft
de dimensie van een kracht; de kern toont het daarom als kN.

## Functies

- `fem_waarde(vloer; "UGT"; "mx"; x; y)`: de waarde op een punt. Grootheden: `"w"` (mm),
  `"mx"`, `"my"`, `"mxy"` (kNm/m), `"vx"`, `"vy"` (kN/m). Binnen een element bilineair
  tussen de knopen van zijn plaat; een punt naast de vloer is een fout.
- `fem_strook(vloer; "UGT"; "mx"; x₁; y₁; x₂; y₂)`: het gemiddelde over de rechthoek, of over
  de lijn als hij in één richting geen breedte heeft. Voor een kolomstrook op de lijn door
  de palen: `fem_strook(vloer; "UGT"; "mx"; L; 0.75*L; L; 1.25*L)`. Exact per element (het
  veld is bilineair); alleen wat op een plaat ligt telt.
- `fem_svg(vloer; "UGT"; "mx" [; breedte])`: een plattegrond in kleur, als `<svg>`, voor een
  plek elders in het blad: `#hide`, `kaart = fem_svg(…)`, `#show`, en dan `{{kaart}}` in een
  `@svg`-blok. Hetzelfde beeld als `beeld` in het blok. Tien klassen (op papier af te lezen), een legenda met de grenzen en de
  eenheid, de randen tussen platen van verschillende dikte, de veren en lijnsteunen, en het
  grootste en kleinste getal op hun plek. Een moment rood (trek boven) – wit – blauw (trek
  onder), de doorbuiging van wit naar blauw.
- `fem_reacties(vloer; "UGT")`: per veer [x; y; R].
- In een `@3d`-blok: `fem vloer UGT w [h]` tekent het vlak, elke knoop op zijn plaats met de
  waarde als hoogte (omlaag bij een positief getal, zoals een momentenlijn aan de
  trekzijde), in de kleuren van `fem_svg`. h is de getekende hoogte van het grootste getal
  (standaard 12 % van de vloer).

## Op het blad

Het blok toont de kop met de versie van FEM Studio, het model in het kort (knopen,
vierhoeken, maas, veren), een plattegrond van het model met de platen in grijs naar dikte,
per belastinggeval Σ last en Σ R (het evenwicht), en per geval en combinatie de uitersten.

- **Wacht:** in de werkruimte gaat elk geval naar FEM Studio; tot de antwoorden er zijn,
  staat er "Wordt gerekend door Open FEM Studio…" en zijn de uitkomsten onbekend.
- **NIET GEREKEND:** zonder antwoord (op papier, in het rapport, via de API) of bij een
  fout van FEM Studio, met de reden. Er staat dan nooit een uitkomst.
- **Opnieuw rekenen:** bij een fout, of als het antwoord van een andere versie van FEM
  Studio komt; nooit vanzelf.

## Hoe het werkt

- **Het raster.** Eén raster van rechthoeken over alle platen, met lijnen door elke
  plaatrand, elke veer en de rand van zijn paalkop, elke lijnsteun, de rand van elke
  vlaklast op een rechthoek en elke puntlast. Daartussen zo verdeeld dat geen zijde langer
  is dan de maas. Zo delen platen van verschillende dikte die tegen elkaar liggen hun
  knopen, zonder hangende knopen. Een element hoort bij de laatste plaat die zijn midden
  bedekt. Hoogstens 8000 knopen.
- **Een paalkop.** Op een puntsteun wordt het moment in een plaat oneindig
  (logaritmisch), en de waarde boven de paal zou dan alleen van de maas afhangen. Een veer
  met een kop d is daarom gelijk verdeeld over de knopen binnen de kop (zoals in
  `plaat.ts`); de rand van de kop is een rasterlijn, dus er zijn er minstens vijf (minder aan
  de rand van de vloer).
- **In het vlak.** Een plaat die alleen loodrecht op haar vlak is opgelegd, kan in haar
  vlak schuiven en draaien. Het model houdt de eerste knoop vast in x en y en een tweede op
  dezelfde rij in y: statisch bepaald, dus zonder dwang.
- **De lasten.** Elke plaat uit het blok is één plaat in de JSON. De vlaklast op de hele
  vloer en het eigen gewicht gaan als vlaklast van FEM Studio (`surfaceLoads`). Een
  vlaklast op een rechthoek gaat als knooplasten, q·A/4 op elke hoek van elk element
  eronder: voor een rechthoekig element is dat de consistente last. Een plaat opdelen per
  vlaklast kan niet, want FEM Studio middelt de momenten op een knoop per plaat.
- **Per geval één aanroep.** De combinaties telt CalcSheet lineair op; dat mag, want een
  model met platen rekent FEM Studio alleen lineair.
- **Vastleggen.** Zoals bij `@toets`: het antwoord hoort bij de hash van de invoer op het
  blad (het hele model in SI, en de naam van het geval). Een andere factor in een
  combinatie vraagt dus niets nieuws; een andere last of plaat laat alle gevallen opnieuw
  rekenen, omdat het raster kan verschuiven. Bij het blad worden bewaard: het rekenmodel van
  het geval (het raster, de steunen en de lasten, waaruit `femArgumenten` precies de
  verzonden JSON maakt) en het antwoord compact (per knoop u_z, per knoop en plaat de
  momenten en dwarskrachten, per steunknoop de reactie, op zes of negen cijfers). Een
  opgeleverd blad toont zo later hetzelfde, ook zonder FEM Studio en ook als CalcSheet
  intussen anders zou meshen. Zijn de gevallen met een ander raster gerekend, dan meldt
  het blok dat en rekent het niet.

## Vergelijking met een bekende oplossing

`scripts/check-fem-model.mjs` rekent met de vastgelegde antwoorden van FEM Studio 2026.44.2:

- **Navier**, vrij opgelegde vierkante plaat a = 6 m, t = 150 mm, q = 10 kN/m², maas a/24,
  vier lijnsteunen: w in het midden +1,6 %, m_x in het midden +1,0 %. De plaat van FEM
  Studio is een Mindlin-plaat met zachte opleggingen (alleen w vast); dwarskracht-
  vervorming en de randzone maken hem iets slapper dan de Kirchhoff-plaat van Navier.
- **plaat_palen** (DKT, `plaat.ts`), 3 × 3 velden van 4 m, t = 250 mm, palen van
  150 MN/m met een kop van 1 m, maas 0,25 m: paalreacties binnen 0,4 %, doorbuiging binnen
  0,7 %, m_x in het veldmidden −2,7 %, in de kolomstrook +2,0 % en boven de binnenpaal
  +2,4 %. Met een maas van 0,5 m kwam m_x in het veldmidden 11 % lager uit: MITC4 benadert
  dat veldmoment op een grof raster van onderen. Kies de maas dus niet grover dan een
  achtste van de overspanning.

## Wat FEM Studio nog niet kan

- **Fysisch niet-lineair** (gescheurd beton met wapeningslagen): `solve_open_fem_3d`
  weigert een model met platen dat niet lineair is. Het blok kent daarom alleen
  `analyse lineair`; een andere analyse, zoals `analyse fysisch-niet-lineair`, laat het
  blok als niet gerekend staan met de reden erbij, zodat een blad die keuze al kan
  aanbieden zonder ooit een lineaire uitkomst onder een andere naam te tonen. De
  rekenkernen van `solve_native_fem` rekenen een gewapende plaat ook nog niet
  niet-lineair: zie [fem-kernen.md](fem-kernen.md), "Fysisch niet-lineair rekenen van een
  plaat". Het blok is er wel op gebouwd: een rekengeval is nu een belastinggeval, en
  combinaties zijn een lineaire som. Voor een niet-lineaire berekening wordt elke
  combinatie zelf een rekengeval met zijn gefactoriseerde lasten, zonder optellen. Wat
  daarvoor in FEM Studio nodig is: een tool (of `analysis` in `solve_open_fem_3d`) die een
  plaat met wapening rekent, met per plaat de wapening per richting boven en onder (A_s,
  dekking), de betonklasse en het staal, de belasting in stappen, en een antwoord in
  dezelfde vorm (knopen, momenten per plaat) plus de staalspanning en de scheurwijdte. In
  het blok komt dan `wapening [plaat:] A_sx,o; A_sy,o; A_sx,b; A_sy,b; c` en
  `analyse fysisch-niet-lineair`.
- **Andere vormen dan rechthoeken**, gaten en schuine randen: het raster is rechthoekig.
- **Wanden, kolommen en balken** onder de plaat: alleen veren en lijnsteunen. Een blok is
  een plaatmodel of een staafwerk; staven onder een plaat (`intermediateNodeIds` langs de
  plaatrand) kent `solve_open_fem_3d` wel, het blok nog niet.
- **Bedding** (`plates[].bedding`, alleen druk) en orthotrope platen kent
  `solve_open_fem_3d` wel; het blok gebruikt ze nog niet.
- **Driehoeken** weigert FEM Studio; het raster maakt alleen vierhoeken.

# Een staafwerk: staven in `@fem`

Met staven bouwt een blad een staafwerk op: een ligger, een portaal, een sporenkap met
hanenbalk, een spant met gordingen. Open FEM Studio rekent het door en het blad rekent
verder met de snedekrachten, de doorbuiging, de reacties en de knikfactor. CalcSheet heeft
geen eigen rekenkern voor staafwerken: het blad maakt het model, FEM Studio rekent.

Twee coördinaten per punt (x en z) geven een **vlak** staafwerk, drie (x, y en z) een
**ruimtelijk**. Een vlak staafwerk is uit het vlak gehouden: de uitkomst blijft in het vlak.

De code: `packages/core/src/femStaafBlok.ts` (de regels, de scope, het blok op het blad),
`femStaven.ts` (het rekenmodel en de JSON), `femStaafResultaat.ts` (waarden, beelden). De
controle: `scripts/check-fem-staven.mjs`, met de antwoorden van de echte server in
`scripts/fixtures/fem/staven-*.json` (opnieuw te maken met
`node scripts/proef-fem-staven.mjs --bewaar`).

## Voorbeeld: een sporenkap met hanenbalk

Twee sporen op muurplaten die de spatkracht opnemen, met een scharnier in de nok en een
hanenbalk ertussen. De hanenbalk heeft geen eigen knopen: hij begint en eindigt op de
sporen, en het model knipt de sporen daar zelf. Hart op hart 0,6 m, dus elke last per m²
maal a.

```text
L = 7.2 m
h_nok = 3.2 m
z_h = 2.2 m
a = 0.6 m
b = 59 mm
h = 156 mm
g_dak = 0.55 kN/m^2
s_k = 0.56 kN/m^2
w_druk = 0.35 kN/m^2
w_zuig = 0.25 kN/m^2
x_h = L/2*z_h/h_nok

@fem kap
  materiaal 11000 N/mm^2; 690 N/mm^2
  rechthoek spoor: b; h
  rechthoek haan: 46 mm; 121 mm
  knoop A: 0; 0
  knoop B: L; 0
  knoop nok: L/2; h_nok
  staaf spoor_l: A; nok; spoor; scharnier eind
  staaf spoor_r: nok; B; spoor
  staaf hanenbalk: x_h; z_h; L - x_h; z_h; haan; scharnier
  steun A; scharnier
  steun B; scharnier
  geval G
    eigengewicht 4.2 kN/m^3
    lijnlast spoor_l; g_dak*a
    lijnlast spoor_r; g_dak*a
  geval S
    lijnlast spoor_l; s_k*a; projectie
    lijnlast spoor_r; s_k*a; projectie
  geval W
    lijnlast spoor_l; w_druk*a; lokaal
    lijnlast spoor_r; -w_zuig*a; lokaal
  combinatie UGT_G = 1.35*G
  combinatie UGT_S = 1.2*G + 1.5*S
  combinatie UGT_W = 1.2*G + 1.5*W
  combinatie BGT = G + S
  beeld UGT_S M
@end

M_Ed = max(kap.UGT_S.spoor_l.M_max; -kap.UGT_S.spoor_l.M_min)
N_haan = kap.UGT_S.hanenbalk.N_min
H_A = kap.UGT_S.A.Rx
w_BGT = kap.BGT.spoor_l.w_max
```

Dit is het blad `KAP` van de controle (`scripts/fixtures/fem/staven-bladen.mjs`). Met de
vastgelegde antwoorden geeft het M_Ed = 0,62 kNm, N_haan = −3,15 kN (druk), een spatkracht
H_A = 3,23 kN en w_BGT = 2,05 mm.

Andere kappen zijn dezelfde regels met een andere oplegging of een staaf erbij:

- **Zonder hanenbalk:** laat de regel `staaf hanenbalk: …` weg. Dat is een
  driescharnierspant.
- **Op muurplaten die geen spatkracht opnemen:** `steun B; rol`. De hanenbalk wordt dan de
  trekker.
- **Op een vloerbalk als trekker:** `steun B; rol` en een staaf tussen de voeten,
  `staaf vloerbalk: A; B; balk; scharnier`, met haar eigen doorsnede en lasten.
- **Een spant met gordingen:** de gordingen zijn puntlasten op de spantbenen,
  `puntlast been_l; F; 2.5 m` (op 2,5 m van het begin van de staaf) en `puntlast nok; F`.

## De regels voor een staafwerk

Een regel is een woord en zijn waarden, gescheiden door `;`, zoals bij een plaatmodel.
Elke waarde is een uitdrukking uit het blad, met eenheid; `#for … #loop` en
`#if … #end if` werken ook hier. Een naam (van een knoop, staaf, doorsnede of materiaal)
en een woord (`scharnier`, `rol`, `projectie`) staan er zoals ze zijn.

| Regel | Betekenis | Kaal getal in |
|---|---|---|
| `materiaal [naam:] E; G` | elasticiteitsmodulus en glijdingsmodulus, zoals bij hout. Ook `E; ν` (G volgt dan uit E en ν) en `E; ν; G`. De tweede waarde is G als hij een spanning is, anders ν | MPa |
| `rechthoek naam: b; h [; materiaal]` | een rechthoekige doorsnede; h staat in het vlak van de buiging. Zonder materiaal: het laatste | mm |
| `doorsnede naam: A; I_y [; I_z; I_t] [; materiaal]` | vrije waarden; ruimtelijk zijn I_z en I_t nodig | mm², mm⁴ |
| `knoop naam: x; z` | een benoemde knoop; ruimtelijk `x; y; z` | m |
| `staaf [naam:] knoop; knoop [; doorsnede] [; scharnier] [; trek]` | een staaf tussen twee knopen. Zonder doorsnede: de laatste. Zonder naam heet hij `s1`, `s2`, … | |
| `staaf [naam:] x₁; z₁; x₂; z₂ […]` | hetzelfde tussen twee punten; ruimtelijk zes coördinaten | m |
| `scharnier`, `scharnier begin`, `scharnier eind` | achter een staaf: een scharnier aan beide einden, of aan één | |
| `trek` | achter een staaf: hij neemt alleen trek op en valt weg als hij op druk komt | |
| `steun knoop; soort` | een oplegging: `scharnier` (verplaatsingen vast), `rol` (rolt langs x, alleen z vast), `rol z` (alleen x vast) of `inklemming` | |
| `steun x; z; soort` | hetzelfde op een plaats: een knoop, of een punt op een staaf | m |
| `steun knoop; x; z; draaiing` | per richting `vast`, `vrij` of een veer; ruimtelijk zes richtingen | kN/m, kNm/rad |
| `delen n` | elke staaf in n gelijke delen (standaard 4, hoogstens 16) | |
| `analyse lineair` of `analyse tweede-orde` | eerste orde (standaard) of tweede orde (P-Δ) | |
| `knikvormen n` | het aantal knikvormen, voor de knikfactor α_cr (standaard 0; bij tweede orde altijd minstens 1) | |
| `geval naam` | een belastinggeval; de lasten eronder horen erbij | |
| `lijnlast staaf; q [; q_eind] [; richting] [; van; tot]` | een lijnlast, gelijkmatig of als trapezium, over de staaf of een deel ervan | kN/m, m |
| `puntlast knoop; F [; richting]` | een puntlast op een knoop | kN |
| `puntlast staaf; F; a [; richting]` | een puntlast op een staaf, op de afstand a van zijn begin | kN, m |
| `eigengewicht γ [; staaf]` | γ maal de doorsnede, omlaag per meter staaf, op alle staven of op één | kN/m³ |
| `combinatie naam = 1.2*G + 1.5*Q` | een som van factor maal geval | |
| `beeld UGT M` | een beeld onder het blok: `M`, `V`, `N`, `u` (de vervormde stand) of `lasten`; `beeld omhullende M` tekent de grootste en kleinste lijn over de combinaties | |

De **richting** van een last:

| Woord | Betekenis |
|---|---|
| `z` (standaard) | omlaag, per meter staaf: eigen gewicht, dakbedekking |
| `projectie` | omlaag, per meter grondvlak: sneeuw op een schuin dak |
| `x` | langs +x, per meter staaf |
| `x projectie` | langs +x, per meter hoogte: wind op de verticale projectie |
| `lokaal` | loodrecht op de staaf; positief drukt op de bovenzijde: winddruk op het dakvlak, zuiging negatief |
| `y`, `y projectie`, `lokaal y` | alleen ruimtelijk |

Een last omlaag is positief. De woorden `x`, `y` en `z` zijn op de plaats van de richting
een richting, ook als het blad een variabele met die naam heeft.

Een fout staat per regel boven het blok (`regel 9: er is geen knoop C (wel: A, B, nok)`);
dan gaat er niets naar FEM Studio.

**Let op de naam `N`.** Een variabele `N` in het blad gaat in de rekentaal voor de eenheid
newton: `11000 N/mm^2` is daarna elfduizend keer die kracht per mm². Noem een
normaalkracht `N_Ed`.

## Knopen en staven

- **Een staaf loopt door over een knoop op zijn as.** Ligt een knoop tussen de einden van
  een staaf (het eind van de hanenbalk op het spoor, een oplegging halverwege een ligger),
  dan zit hij aan de staaf vast en blijft de staaf één staaf, met één M-lijn, één lengte
  en één toets. Wat aan die knoop hangt, kan zijn eigen scharnier hebben.
- **Twee staven die elkaar kruisen** zonder knoop op het kruispunt, zitten niet aan
  elkaar.
- **Een scharnier** laat het moment los aan dat eind van de staaf (ruimtelijk om beide
  assen, niet de wringing). In de nok van een kap is één scharnier genoeg; hebben alle
  staven aan een knoop een scharnier, dan rekent FEM Studio dat ook.
- **Een staaf die alleen trek opneemt** (`trek`) loopt van knoop tot knoop en wordt niet
  geknipt: een knoop op zijn as zit er niet aan vast, een puntlast staat op een knoop.
- **De assen van een staaf.** x loopt van begin naar eind; z staat loodrecht daarop in het
  verticale vlak door de staaf, naar boven; y ligt horizontaal. Bij een staande staaf wijst
  z langs de globale x. De **bovenzijde** van een staaf is de kant van z, de onderzijde de
  andere; bij een stijl is de onderzijde dus de kant van −x.

## Na het blok in de scope

Een punt in een naam is een liggend streepje: `kap.UGT_S.spoor_l.M_max` is
`kap_UGT_S_spoor_l_M_max`. Uit een ander blad schrijf je de liggende streepjes:
`#2.kap_UGT_S_spoor_l_M_max`, en `fem_staaf(#2.kap; "UGT_S"; "spoor_l"; "M"; x)` leest het
model van blad 2. Hieronder is R een geval of combinatie, S een staaf en K een benoemde
knoop.

| Naam | Wat | Eenheid |
|---|---|---|
| `kap` | het model zelf, voor de functies en `@3d` | |
| `kap.R.S.N_max`, `.N_min`, `.V_max`, `.V_min`, `.M_max`, `.M_min` | de grootste en kleinste snedekracht van een staaf | kN, kNm |
| `kap.R.S.w_max`, `.w_min` | de doorbuiging van een staaf ten opzichte van de koorde door zijn verplaatste einden | mm |
| `kap.R.K.ux`, `.uz` | de verplaatsing van een knoop | mm |
| `kap.R.K.Rx`, `.Rz`, `.My` | de reactie van de oplegging op die knoop | kN, kNm |
| `kap.R.Rx`, `kap.R.Rz` | de reacties per oplegging, in de volgorde van het blok | kN |
| `kap.R.Rx_som`, `.Rz_som`, `.Rz_max`, `.Rz_min`, `.Rx_max`, `.Rx_min` | samen, en de grootste en kleinste | kN |
| `kap.R.N_max`, … `kap.R.M_min`, `kap.R.w_max`, `.w_min` | over alle staven | |
| `kap.R.alpha_cr`, `kap.R.alpha` | de kleinste knikfactor, en alle knikfactoren | |
| `kap.S.N_max`, … `kap.S.w_min`, `kap.K.Rz_max`, `kap.K.uz_min`, `kap.M_max`, `kap.alpha_cr` | de omhullende over de combinaties (zonder combinaties: over de gevallen) | |
| `kap.S.L` | de lengte van een staaf | m |

Een ruimtelijk staafwerk heeft `N`, `Vy`, `Vz`, `T`, `My` en `Mz` in plaats van N, V en M,
de doorbuiging `v` langs de lokale y naast `w`, `uy` en `Ry`, en `Mx`, `My`, `Mz` als
reactiemomenten.

**Tekens.**

- N is positief bij trek.
- M is positief bij trek aan de onderzijde van de staaf.
- V = dM/dx, met x van het begin naar het eind van de staaf: wie een staaf omdraait, keert
  het teken van V om, niet dat van M.
- w is positief naar de onderzijde.
- Verplaatsingen en reacties staan in de globale assen: omhoog is positief, dus een knoop
  die zakt heeft een negatieve `uz`. Een reactiemoment is positief volgens de
  rechterhandregel om de as.

## Functies

- `fem_staaf(kap; "UGT_S"; "spoor_l"; "M"; x)`: de waarde op de afstand x van het begin van
  een staaf. Grootheden: `"N"`, `"V"`, `"M"` (kN, kNm), `"w"` (de doorbuiging ten opzichte
  van de koorde, mm) en `"ux"`, `"uz"` (de verplaatsing, mm). De staaf bij naam of nummer.
  Met `"max"` of `"min"` als geval: de omhullende over de combinaties op die plaats. Op een
  knoop met een sprong (onder een puntlast) geeft de functie de waarde erna.
- `fem_knoop(kap; "BGT"; "nok"; "uz")`: een grootheid van een benoemde knoop: `"ux"`,
  `"uz"` (mm), `"ry"` (rad), en van zijn oplegging `"Rx"`, `"Rz"` (kN) en `"My"` (kNm).
- `fem_krachten(kap; "spoor_l"; "UGT_G"; "UGT_S"; "UGT_W")`: de snedekrachten van een staaf
  als matrix voor een toets, zie hieronder.
- `fem_reacties(kap; "UGT_S")`: per oplegging [x; z; R_x; R_z; M_y].
- `fem_svg(kap; "UGT_S"; "M" [; breedte])`: hetzelfde beeld als `beeld` in het blok, als
  `<svg>` voor een plek elders in het blad.
- In een `@3d`-blok: `fem kap UGT_S M [h]` tekent de staven met hun echte doorsnede (een
  rechthoek als balk, een vrije doorsnede als lijn), de opleggingen en de lijn als een
  gekleurd vlak langs elke staaf, met de uitersten erbij; `fem kap BGT u [h]` tekent de
  vervormde stand, vergroot. h is de getekende hoogte van het grootste getal.

## Beelden

`beeld UGT_S M` zet een beeld onder het blok, leesbaar op papier: de staven met hun
scharnieren en opleggingen, de lijn op elke staaf en de uitersten per staaf als getal. De
M-lijn staat aan de trekzijde; V en N staan positief aan de bovenzijde. `u` tekent de
vervormde stand met de grootste verplaatsing, `lasten` het schema met de lasten van een
geval of combinatie. Een beeld als SVG is er voor een vlak staafwerk; een ruimtelijk
staafwerk teken je in een `@3d`-blok.

## De houttoets: `check_timber_beams`

De houttoets van FEM Studio (NEN-EN 1995-1-1 met de Nederlandse nationale bijlage) wil per
staaf de snedekrachten per station en per combinatie van de uiterste grenstoestand
(`forces_envelope`). `fem_krachten` geeft ze in die vorm: per rij [nummer van de
combinatie; x; N; V_y; V_z; M_t; M_y; M_z], met de combinaties genummerd in de volgorde
waarin ze staan, en per deel van de staaf vijf stations (met vier delen zeventien). Op een
knoop met een sprong staan twee rijen. De tekens zijn die van het schema van de toets:
N positief bij trek, M_y positief bij trek onder.

Onder het blok van de sporenkap hierboven:

```text
@toets spoor = check_timber_beams
  inputs = [{
    beam_id: 1,
    width_mm: b,
    height_mm: h,
    strength_class: "C24",
    service_class: "Sc2",
    length_m: kap.spoor_l.L,
    // het dakbeschot houdt het spoor zijdelings: knik uit het vlak en kip over 0,3 m
    buckling_length_z_m: 0.3 m,
    ltb_segment_length_m: 0.3 m,
    // de snedekrachten per station, voor de drie combinaties van de uiterste grenstoestand
    forces_envelope: fem_krachten(kap; "spoor_l"; "UGT_G"; "UGT_S"; "UGT_W"),
    // k_mod per combinatie: alleen blijvend, en met sneeuw of wind (kort)
    load_duration: "ShortTerm",
    load_duration_per_combination: [{combination_id: 1, load_duration: "Permanent"}, {combination_id: 2, load_duration: "ShortTerm"}, {combination_id: 3, load_duration: "ShortTerm"}],
    // de doorbuiging, met teken: omlaag is negatief
    deflection_inst_mm: -kap.BGT.spoor_l.w_max,
    deflection_quasi_perm_mm: -kap.G.spoor_l.w_max,
    deflection_permanent_mm: -kap.G.spoor_l.w_max
  }]
@end
UC = spoor.uc_max
```

Met het vastgelegde antwoord: UC = 0,31, maatgevend de kolomknik met buiging (6.3.2).

- **Een lijst van staven.** `check_timber_beams` neemt `inputs`, een lijst; elke staaf is
  een object `{…}`. Een veld van een `@toets`-blok mag over meer regels lopen zolang er
  een haak openstaat, met commentaar ertussen. Meer staven: meer objecten in de lijst, en
  `spoor.uc_staaf` is dan een vector met een UC per staaf.
- **Eenheden** volgen de naam van het veld, ook in het object: `width_mm: b`,
  `length_m: kap.spoor_l.L`.
- **In rondes.** Het staafwerk gaat eerst naar FEM Studio; met dat antwoord rekent het blad
  opnieuw en gaat de toets. Tot dan is de toets niet getoetst.
- **Wat het blad zelf geeft.** De kniklengten en de kipsteunen (de berekening in het vlak
  ziet de richting uit het vlak niet), de sterkteklasse, de klimaatklasse en de
  belastingduur per combinatie. Zonder `load_duration_per_combination` toetst FEM Studio
  alle combinaties met één k_mod. De combinatie met alleen de blijvende belasting hoort
  erbij.
- **De doorbuiging.** `w_max` is positief naar de onderzijde; de toets wil de zakking
  negatief omlaag.

## Op het blad

Het blok toont de kop met de tool en de versie van FEM Studio, het staafwerk in het kort,
een schema met de namen, per rekengeval de belasting en de reacties samen (het evenwicht),
per geval en combinatie de uitersten over alle staven met de knikfactor, per staaf de
omhullende, en per oplegging de omhullende van de reacties. Wacht, NIET GEREKEND en
opnieuw rekenen werken zoals bij een plaatmodel.

## Hoe het werkt

- **De tool.** `solve_open_fem_3d_batch` rekent alle rekengevallen van het staafwerk in één
  aanroep. Het is dezelfde kern als `solve_open_fem_3d`, met per verzoek hetzelfde schema,
  en elke uitkomst is gelijk aan die van een losse aanroep. Eén aanroep is één antwoord,
  één hash en één ronde opnieuw rekenen, en alle gevallen komen van dezelfde server op
  hetzelfde moment. `solve_members_3d` rekent met een andere kern en kent geen globale
  lasten, tussenknopen of staven die alleen trek opnemen: daarmee is een kap met sneeuw
  per meter grondvlak en een hanenbalk op het spoor niet te schrijven.
- **Zonder Node.** CalcSheet levert geen Node mee. `solve_open_fem_3d_batch` en
  `check_timber_beams` rekenen in de server zelf; `solve_fem_model`, `validate_fem_model`
  en `check_fem_model` vragen Node en geven zonder Node `NODE_ONTBREEKT`.
  `node scripts/proef-fem-staven.mjs --zonder-node` laat het zien: de server start in een
  omgeving zonder Node (een PATH zonder Node en `OPENAEC_NODE` naar een pad dat niet
  bestaat, want de server zoekt Node anders ook op de gewone installatieplek),
  `fem_solver_status` meldt `NODE_ONTBREEKT`, en alle bladen van de controle rekenen.
- **De tussenpunten.** Elke staaf krijgt knopen op gelijke delen, onder elke puntlast en
  waar een lijnlast begint of eindigt. Voor FEM Studio blijft het één staaf
  (`intermediateNodeIds`). Een puntlast op een staaf wordt een knooplast op zo'n knoop:
  FEM Studio kent een puntlast op een staaf alleen loodrecht op de as, en een last omlaag
  op een schuine staaf heeft ook een deel langs de as. De tussenpunten zijn voor alle
  rekengevallen dezelfde.
- **Tussen de knopen.** Per deel van een staaf zijn van elke snedekracht vijf waarden
  bewaard, uit de lijn van FEM Studio. Daardoor gaat één veelterm van de vierde graad; in
  een deel is de last een rechte lijn en de momentenlijn van de derde graad, dus de
  veelterm geeft de lijn van FEM Studio terug. Het grootste moment ligt op de top van die
  veelterm, ook tussen twee punten. De doorbuiging tussen twee knopen volgt uit de
  momentenlijn (w″ = M/EI, tussen de verplaatsingen van de knopen); op de knopen is zij die
  van FEM Studio.
- **Een vlak staafwerk.** y = 0 en elke knoop is vast in u_y, r_x en r_z. FEM Studio
  verdeelt een staaf voor de knikberekening zelf nog verder en die punten zijn niet te
  houden, dus de doorsnede rekent uit het vlak duizend keer zo stijf als erin
  (I_z = 1000·I_y). De knikfactor is zo die in het vlak. Knik en kip uit het vlak horen
  bij de toets van de staaf.
- **Lineair: per geval één berekening.** De combinaties telt CalcSheet op, op elke plaats
  langs elke staaf. Een andere factor in een combinatie vraagt dan niets nieuws.
- **Een eigen berekening per combinatie** waar optellen niet mag of niet kan: bij
  `analyse tweede-orde`, bij een staaf die alleen trek opneemt, en bij `knikvormen` (een
  knikfactor hoort bij de lasten van de combinatie zelf). Bij tweede orde en bij
  trekstaven zijn alleen de combinaties een uitkomst, de gevallen apart niet; zonder
  combinaties de gevallen. Een berekening in tweede orde die niet tot rust komt of niet
  stabiel is, is een fout, geen uitkomst.
- **Het eigen gewicht** is γ maal de doorsnede als lijnlast omlaag: het materiaal in de
  JSON heeft geen gewicht.
- **Vastleggen.** Het antwoord hoort bij de hash van het rekenmodel (de knopen, de staven,
  de opleggingen en de rekengevallen in SI). Bij het blad worden het rekenmodel en het
  antwoord compact bewaard: per knoop de verplaatsing, per deel de vijf waarden per
  snedekracht, per oplegging de reactie, de knikfactoren. Een fout van één rekengeval is
  een fout van het geheel, met het geval erbij. Een ligger kost zo'n 1,3 kB in het
  projectbestand, de sporenkap hierboven met drie rekengevallen 11 kB.

## Vergelijking met bekende oplossingen

`scripts/check-fem-staven.mjs` legt de antwoorden van FEM Studio 2026.46.1 naast een
handberekening (uitgeschreven in de kop van het script). Hout 71 × 196 mm,
E = 11000 N/mm², tenzij anders.

| Geval | Grootheid | Met de hand | FEM Studio | Afwijking |
|---|---|---|---|---|
| Ligger op twee steunpunten, L = 4 m, q = 2 kN/m | M = qL²/8 | 4,000 kNm | 4,000 kNm | 0,000 % |
| | w = 5qL⁴/(384EI) | 13,604 mm | 13,604 mm | 0,000 % |
| | w op L/8, tussen twee knopen | 5,282 mm | 5,282 mm | 0,000 % |
| Driescharnierspant, L = 8 m, nok 3 m, q = 2 kN/m per m grondvlak | V = qL/2 | 8,000 kN | 8,000 kN | 0,000 % |
| | spatkracht H = qL²/(8h) | 5,333 kN | 5,333 kN | 0,000 % |
| | N aan de voet | −9,067 kN | −9,067 kN | 0,000 % |
| Sporenkap met hanenbalk op een rol, L = 8 m, nok 4 m, hanenbalk op 2,5 m | N in de hanenbalk, uit het evenwicht van de halve kap | 10,667 kN | 10,667 kN | 0,000 % |
| | M in het spoor bij de hanenbalk | 13,750 kNm | 13,750 kNm | 0,000 % |
| Euler, H = 3 m, N = 10 kN | α_cr = π²EI/(H²·N) | 53,7397 | 53,7398 | +0,0002 % |
| Tweede orde, ingeklemde stijl, N = 30 kN, dwarskracht 1 kN | M_voet = F·tan(kH)/k | 3,7073 kNm | 3,7073 kNm | 0,000 % |
| | u_top | 23,575 mm | 23,575 mm | 0,000 % |
| | α_cr = π²EI/(4H²·N) | 4,4783 | 4,4783 | 0,000 % |
| Ruimtelijk, haakse uitkraging met wringing | zakking van het eind | 54,762 mm | 54,762 mm | 0,000 % |
| Kruis van trekstangen, wind 10 kN | N in de dragende diagonaal | 12,500 kN | 12,500 kN | 0,000 % |
| Spant met gordingen | N in de trekbalk | 8,000 kN | 8,000 kN | 0,000 % |
| Trapeziumlast over een deel, op een veer | M_max, tussen twee knopen | 2,0458 kNm | 2,0458 kNm | 0,000 % |

De staafelementen zijn exact voor een staaf met een last die per deel een rechte lijn is;
de enige afwijking die boven de afronding uitkomt is die van de knikfactor, die met de
verdeling van de staaf samenhangt.

## Wat er nog niet is

- **Platen en staven in één model** (een balk onder een vloer, een kolom onder een plaat).
- **Een beeld als SVG van een ruimtelijk staafwerk:** alleen in een `@3d`-blok.
- **Een moment als last op een knoop**, een opgelegde verplaatsing en een
  temperatuurlast: `solve_open_fem_3d` kent ze (`nodalLoads`, `uxPrescribedM`,
  `thermalLoads`), het blok nog niet.
- **Scheefstand** bij tweede orde: het blad zet hem als last of in de coördinaten.
- **Een verlopende staaf** (`partSectionIds`), **een staaf op bedding** en **een
  draaiing van de doorsnede om de staafas** (`rollAngleRad`).
- **Een scharnier om één as** en losse verbindingen langs de staaf (een schuivende
  oplegging van een staafeind).
- **Dwarskrachtvervorming:** de doorsnede gaat zonder dwarskrachtoppervlak naar FEM
  Studio (Euler-Bernoulli).
- **Namen in een lus:** een staaf in een `#for` heeft geen eigen naam; hij heet `s1`,
  `s2`, … naar zijn volgnummer.
