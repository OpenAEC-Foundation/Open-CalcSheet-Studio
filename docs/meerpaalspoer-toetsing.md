# Poer op drie of vier palen — toepassingsgebied en toetsset

Dit document legt vast wat de module *Poer op drie of vier palen* wel en niet toetst,
volgens welke norm, en welke keuzes het blad zelf maakt. Het rekenblad staat in
[`templates/meerpaalspoer.ts`](../packages/desktop/src/templates/meerpaalspoer.ts), de
handberekeningen in [`scripts/check-meerpaalspoer.mjs`](../scripts/check-meerpaalspoer.mjs).
Opzet, toestanden en detaillering volgen de [tweepaalspoer](tweepaalspoer-toetsing.md);
wat daar is nagelezen (factoren uit de NB, tabellen 3.1, 4.4N, 7.1N en 8.1Na) geldt hier
ook en wordt niet herhaald.

## 1. Norm

| | |
|---|---|
| Norm | NEN-EN 1992-1-1:2005 met A1:2015 en C2:2011 |
| Nationale bijlage | NEN-EN 1992-1-1:2005+C2:2011/NB:2016+A1:2020 |
| Belastingfactor eigen gewicht | NEN-EN 1990 + NB, tabellen NB.4 en NB.5: 6.10a met 1,2, 1,35 of 1,5 per gevolgklasse uit de projectgegevens |

## 2. Toepassingsgebied

**Wel**

- **Vier palen** in een rechthoek (hart-op-hart a_x × a_y) onder een rechthoekige poer
  l × b × h, symmetrisch om de kolom.
- **Drie palen** in een gelijkzijdige driehoek (zijde a) onder een driehoekige poer met
  afgeschuinde hoeken: elke rand en elke afgeschuinde hoek ligt op afstand r van het
  paalhart. De kolom staat in het zwaartepunt.
- Palen vierkant, rechthoekig of rond; kolom rechthoekig of rond.
- Kolom met een drukkracht N en momenten M_x en M_y, UGT en frequente BGT apart. De
  paalreacties volgen lineair uit de momenten (stijve poer, gelijke palen).
- Eigen gewicht van de poer: het blad telt het erbij (25 kN/m³), bij drie palen met het
  oppervlak van de afgeschuinde driehoek.
- Beton C20/25 t/m C50/60, betonstaal B500B of B500C, alle staven ten hoogste Ø32.
- Gekozen wapening: trekbanden over de palen (elke band dezelfde staven, recht of
  omgebogen), een ondernet en liggende randbeugels.

**Niet: dan geen eindoordeel 'voldoet'**

| Geval | Uitkomst op het blad | Waarom |
|---|---|---|
| Drukdiagonaal flauwer dan 45° | niet getoetst | Dezelfde grens als de tweepaalspoer: flauwer werkt de poer als plaat; dat dekt dit blad niet. |
| Kolom en paal overlappen (a_v ≤ 0, met de paalafwijking) | niet getoetst | Geen staafwerk tussen kolom en paal. |
| Een paal krijgt trek | niet getoetst | Trekpalen en hun verankering in de poer staan niet op dit blad. |
| B500A, of een staaf groter dan Ø32 | niet getoetst | 5.6.3 en 8.8, als bij de tweepaalspoer. |
| Horizontale krachten niet bevestigd | niet getoetst | Een horizontale kracht in de kolomvoet gaat niet via het staafwerk; die moet elders zijn opgenomen (palen, funderingsbalken). |
| Geen paalafwijking (e_p = 0) | niet getoetst | 9.8.1(1) vraagt rekening te houden met de afwijking. |
| Maten, lasten of staven onmogelijk; ontwerplevensduur of gevolgklasse ontbreekt | ongeldige invoer | Rekenen zou schijnzekerheid geven. |

**Buiten dit blad**, op het blad benoemd: het draagvermogen van de palen (het blad geeft
R_Ed door), horizontale krachten, de aansluiting van de kolom, brand, vermoeiing en
aardbeving.

## 3. Rekenmodel

Een ruimtelijk staafwerk volgens 6.5 en 5.6.4, dat 9.8.1(2) voor poeren toestaat: van de
kolom een drukdiagonaal naar elke paal, onderin trekbanden over de palen.

- **Paalreacties.** Vier palen: R = N/4 ± M_y/(2·a_x) ± M_x/(2·a_y). Drie palen (boven op
  (0, R₃), onder op (±a/2, −R₃/2), R₃ = a/√3): Σy² = 1,5·R₃², Σx² = a²/2. De paalafwijking
  telt als extra moment N·e_p om beide assen, met het ongunstige teken: omhullend, en
  strenger dan elk afzonderlijk mogelijk stelsel. Het eigen gewicht gaat volledig via de
  kolomknoop.
- **Begin van de diagonaal.** Het zwaartepunt van een kwart van de kolom: c/4 bij een
  rechthoekige kolom, 2c/(3π) bij een ronde. Bij drie palen het kleinste van de twee, wat
  de arm groter en de trekband zwaarder maakt. De paal staat naar buiten verschoven over
  e_p.
- **Hefboomsarm.** Uit de drukzone onder de kolom, zoals bij de tweepaalspoer: per richting
  het moment van de palen aan één kant over de kolombreedte dwars daarop, ten hoogste
  0,9·d en de arm bij θ = 55°. d hoort bij de bovenste laag van de banden.
- **Trekbanden.** Vier palen: de diagonaal R·r/z ontbonden in x en y; de band in x draagt
  R·d_x/z, de band in y R·d_y/z. Drie palen: de horizontale kracht H = R·r/z wordt in de
  paalknoop opgenomen door de twee banden onder 60°, elk H/√3; een band krijgt de grootste
  van zijn twee uiteinden. De bovenste en de onderste palen hebben elk hun eigen reactie.
- **Lagen.** Vier palen: band in x onderin, band in y erop. Drie palen: de band tussen de
  twee onderste palen onderin, de schuine banden erop.

## 4. Toetsset

De toestanden, het afronden van de UC naar boven en de slotregel zijn die van de
tweepaalspoer (zie daar §4).

### UGT

| Toets | Artikel | Opmerking |
|---|---|---|
| Trekbanden | 6.5.3(1) | de zwaarste band, met A_s van één band |
| A_s,min en A_s,max | 9.2.1.1 (NB) | per richting over de volle breedte: de banden en het ondernet; A_s,min = kleinste van M_E,min = f_ctm·W en 1,25·A_s,nodig; A_s,max = 0,04·A_c |
| Knoop onder de kolom (CCC) | 6.5.4(4)a, (6.60) | k₁ = 1,0; σ onder de kolom, σ van de diagonaal en de drukzone (ξ ≤ 1) |
| Knoop boven de paal (CTT) | 6.5.4(4)c, (6.62) | k₃ = 0,75: boven elke paal komen twee banden samen |
| Dwarskracht, bovengrens | 6.2.2(6), (6.5) | 0,5·b·d·ν·f_cd over de volle breedte op het kolomvlak |
| Dwarskracht V_Rd,c met β | 6.2.2(1), (6.2a), 6.2.2(6) | β = a_v/2d ≥ 0,25; ρ_l uit het ondernet en bij vier palen de banden in die richting |
| Pons langs kolom en paal | 6.4.5(3) | v_Rd,max = 0,4·ν·f_cd (NB); kolom β = 1,15, paal als hoekkolom u₀ = 3d ≤ c₁ + c₂ met β = 1,5 |
| Verankering en ombuiging | 8.4, 6.5.4(7), 8.3, figuur 8.1 | als de tweepaalspoer |

### BGT en detaillering

| Toets | Artikel | Opmerking |
|---|---|---|
| Scheurwijdte trekbanden | 7.3.4, (7.8), (7.9), (7.11), (7.14) | frequente combinatie (NB); σ_s ≤ f_yk, ook karakteristiek |
| Huidwapening | 7.3.3(3) | alleen bij h ≥ 1000 mm, met de randbeugels |
| Diameters, vrije ruimte | 9.8.1(3), 8.2(2) | banden ten minste Ø8, net ten minste Ø8, randbeugels ten minste Ø6 |
| Band binnen de zone boven de paal | 9.8.1(3), figuur 9.11 | dwars op de band gemeten |
| Paalkop en rand | 9.8.1(1) | wapening boven de paalkop; paal tot rand met de afwijking |
| Dekking | 4.4.1 (NB) | als de tweepaalspoer |

## 5. Keuzes van dit blad, geen normtekst

- **Vlak van de diagonaal bij de kolom.** Het deel van de kolom per paal, schuin gezien,
  plus de staande zijde van dat deel over de hoogte van de drukzone: A = A_k/n·sin θ +
  c_q·x_c·cos θ. c_q is (c_x + c_y)/(2√2) bij vier palen en twee derde van de gemiddelde
  kolommaat bij drie palen. Dat is de ruimtelijke tegenhanger van a_A bij de
  tweepaalspoer, maar c_q is een benadering.
- **Vlak van de diagonaal bij de paal.** A = A_p·sin θ + √A_p·u·cos θ met u = 2·(a_t − t_in),
  als a_B bij de tweepaalspoer.
- **Knoop boven de paal met k₃ = 0,75.** Strenger dan de k₂ = 0,85 die de tweepaalspoer met
  haarspelden mag gebruiken; hier liggen er altijd twee banden over de paal.
- **De vergroting van 6.5.4(5) en de drie-assige druk van 6.5.4(6) worden niet gebruikt**,
  ook niet onder de kolom, waar de knoop wel in drie richtingen gedrukt wordt.
- **Dwarskracht.** De doorsnede over de volle breedte op het kolomvlak, met de palen aan één
  kant. Bij drie palen tellen de schuine banden niet in ρ_l (alleen het ondernet): aan de
  veilige kant.
- **Pons langs de paal als hoekkolom**, met β = 1,5 naar figuur 6.21N, als analogie.
- **Scheurwijdte.** Het effectieve trekgebied van een band: zijn breedte plus aan elke kant
  5(c + Ø/2). De arm in de BGT is de kleinste van de UGT-arm en de elastische arm van een
  hoge ligger over de kleinste paalafstand, als bij de tweepaalspoer.
- **Karakteristieke last** afgeschat als UGT/1,3.

## 6. Waarom bepaalde toetsen niet op het blad staan

| Controle | Uitkomst | Onderbouwing |
|---|---|---|
| Pons op u₁ (6.4.4) | niet van toepassing | Bij θ ≥ 45° ligt de paal binnen 2d van de kolom; de kracht loopt door de diagonaal. De grens langs kolom en paal (6.4.5(3)) staat er wel. |
| Splijtkrachten in de diagonalen (6.5.3(3)) | constructief | In een ruimtelijke poer spreiden de diagonalen in een groot volume; het ondernet en de randbeugels dragen de dwarstrek constructief. Dit blad rekent ze niet uit: een beperking ten opzichte van de tweepaalspoer. |
| Betondruk en staalspanning in de BGT (7.2) | als de tweepaalspoer | σ_s ≤ f_yk staat bij de scheurwijdte. |
| Minimumwapening voor krimp (7.3.2) | niet van toepassing | Krimp en temperatuur zijn op palen nauwelijks belemmerd. |

## 7. Wat is nagelezen en wat niet

De factoren uit de NB zijn die van de tweepaalspoer en daar nagelezen. De handberekening
in het controlescript rekent drie gevallen (vier palen, drie palen, vier palen met
momenten) buiten het blad om met dezelfde formules; dat bewijst dat het blad doet wat
hier staat, niet dat het rekenmodel juist is. **Er is niet vergeleken met
praktijkrapporten, proefresultaten of een externe referentie-berekening, en er heeft
geen controle door een tweede constructeur plaatsgevonden.** Daarom staat de module in de
catalogus op *controleren*.

Nog niet in deze module: een parametrisch beeld met invoer in de tekening, de korf in de
IFC-uitvoer, een staaflijst, en een andere vorm van de driepaalspoer.
