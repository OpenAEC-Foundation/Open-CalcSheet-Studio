# Eenheden stap 3a (de beelden) — bouwplan

> **Voor wie dit uitvoert:** superpowers:executing-plans, taak voor taak, met `- [ ]`-vakjes.

**Doel:** de parametrische beelden van de modules volgen het eenhedenstelsel van het
project. Een maat van 4500 mm staat in US customary als 177,2 in in de tekening, een
moment als kip·ft, en wat je in de tekening typt, gaat terug in de eenheid van het blad.

**Opzet:**
- **De rekenwaarden blijven in de eenheid van het blad.** De beelden rekenen zoals nu
  met `waarde` en de invoer van het exemplaar; alleen wat in beeld staat, rekent om.
- **Eén hulpmiddel voor alle beelden:** `beeldEenheden(stelsel)` in
  `components/calc/beeldEenheden.ts`, zonder React, en `useBeeldEenheden()` in
  `designerKit.tsx` met het stelsel uit de projectgegevens (`evalOptiesVan`).
- **De eenheid zoals hij nu in beeld staat is de bron:** `"mm"`, `"kNm"`, `"kN/m²"`.
  `eenheidUitBeeld` maakt er de schrijfwijze van de rekenkern van. Rekent het stelsel
  niet om, dan blijft de tekst precies zoals hij was.
- **Stap 3 in twee PR's:** 3a de beelden (dit plan), 3b het rapport (de tabellen op
  papier, de velden in het rapportpaneel, de laagopbouw en de gewichtenbibliotheek).

**Ontwerp:** `docs/superpowers/specs/2026-11-06-eenheden-design.md`, stap 3.

## Algemene eisen

- **Zonder stelsel ("Zoals in het blad") ziet elk beeld er precies zo uit als nu.**
- **Een maat die je in een beeld typt, gaat terug in de eenheid van het blad.** Klik je
  een maat aan en laat je hem ongewijzigd, dan verandert er niets (geen 4499,991 mm).
- **De wapening in een legenda blijft een staafaanduiding** (Ø12-150): dat is een
  benaming, geen maat in beeld.
- **Geen namen van andere rekenprogramma's.** Commits in het Nederlands, met
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Controles:** `npm --prefix packages/core run build` en daarna `node scripts/<check>.mjs`.

## Taak 1: de rekenkern

**Bestanden:** `packages/core/src/eenheidstelsel.ts`, `packages/core/src/index.ts`,
`scripts/check-eenheidstelsel.mjs`, `packages/desktop/src/components/calc/EenhedenEditor.tsx`.

- [ ] Test: `omrekenen(4500, "mm", "in")` ≈ 177,165; `eenheidUitBeeld("kN/m²")` is
  `kN/m^2`, `"kNm"` is `kN m`, `"kN/m¹"` en `"kN/m1"` zijn `kN/m`; `eenheidInBeeld` zoals
  in EenhedenEditor (`kN / m^2` → `kN/m²`, `kip ft` → `kip·ft`).
- [ ] `omrekenen`, `eenheidUitBeeld` en `eenheidInBeeld` in `eenheidstelsel.ts`, met export;
  EenhedenEditor gebruikt die uit de kern.

## Taak 2: het hulpmiddel voor de beelden

**Bestanden:** `packages/desktop/src/components/calc/beeldEenheden.ts` (nieuw),
`scripts/check-eenheden-beelden.mjs` (nieuw), `designerKit.tsx`.

- [ ] Test (`check-eenheden-beelden.mjs`):
  - zonder stelsel: `eenheid("kNm")` is `kNm`, `waarde` en `decimalen` ongewijzigd;
  - US: 4500 mm → 177,165 in, 1 decimaal bij 0 in mm; 12 kNm → 8,851 kip·ft;
    `invoer(4500, "mm")` is `177.165`, `terug("12", "mm")` is 304,8;
  - een eenheid die het stelsel niet kent (`"mm/kN"`, `"°"`, `"min"`) blijft;
  - SI (m): 4500 mm → 4,5 m.
- [ ] `beeldEenheden(stelsel)` met `doel`, `eenheid`, `waarde`, `decimalen`, `invoer`, `terug`.
- [ ] `useBeeldEenheden()` in de kit, en `eenheden` op `DesignerCtx`.
- [ ] `Dim` en `Force` krijgen `eenheid`: het getal in het stelsel, de eenheid erachter
  zodra hij omrekent, het bewerkveld in het stelsel en terug in de bron. `Force` neemt
  `unit` als bron.

## Taak 3: de beelden van de modules

- [ ] **Ligger:** `Dim` in m, `Force` vanzelf, de `Ro`-teksten (m, kNm) via het hulpmiddel.
- [ ] **Tweepaalspoer:** `Dim` in mm; in `poerTekening.ts` een `maat`-functie in de
  teksten voor de maatlijnen en z, d (de afdruk, zonder knoppen).
- [ ] **Doorsnede:** `Dim` in mm, de invoervelden (`rij`) in het stelsel met hun eenheid
  ernaast; in `doorsnedeTekening.ts` de maten en de spanningen in het stelsel.
- [ ] **Balklaag:** de eigen `Dim` in mm, de invoervelden (mm, kN/m², kN) en alle vaste
  teksten met kN, kN/m, kNm en mm via het hulpmiddel.

## Taak 4: nakijken

- [ ] `npm run check` (het aantal controles in README.md en README.nl.md: 66).
- [ ] In de app (headless): US customary, ligger en doorsnede: maten in in/ft, een maat
  typen komt in mm in het exemplaar, zonder stelsel alles als voorheen.
- [ ] `docs/CHANGELOG.md`.
- [ ] Nakijken door een tweede paar ogen, dan een PR.
