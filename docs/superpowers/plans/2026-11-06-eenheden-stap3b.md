# Eenheden stap 3b (het rapport) — bouwplan

> **Voor wie dit uitvoert:** superpowers:executing-plans, taak voor taak, met `- [ ]`-vakjes.

**Doel:** het rapport volgt het eenhedenstelsel van het project: de tabellen op papier
(belastingen, de laagopbouw) en de invoer in het rapportpaneel. Een vlakbelasting van
2,4 kN/m² staat in US customary als 50,1 psf, en wat je in het paneel typt, wordt
opgeslagen in de eenheid van het rapport.

**Opzet:**
- **Opgeslagen blijft in de eigen eenheid van het rapport** (kN/m², m, kN/m³). De
  rekenregels van het rapport (normwaarden.ts, opbouw.ts) veranderen niet.
- **Op papier:** `RapportWeergave` krijgt `eenheden` en twee helpers: `fe` (een
  uitgerekend getal in het stelsel) en `ne` (een getypt getal in het stelsel). `Eenheid`
  toont de eenheid van het stelsel; zonder omrekening precies zoals nu ([kN/m¹]).
- **Op het scherm:** één invoerveld `EenheidInvoer` (tekst, in het stelsel, opgeslagen in
  de bron), voor `Veld` met een eenheid en voor een kolom van `RijenTabel` met `eenheid`.
  De vaste teksten met kN/m² in `BelastingenSectie` en `OpbouwEditor` via het hulpmiddel.
- **`useBeeldEenheden` verhuist** naar een eigen bestand, zodat het rapport hem kan
  gebruiken zonder de kit van de beelden.
- **Blijft:** standaardteksten met een eenheid in lopende tekst (de gebruiker past ze
  zelf aan), minuten (brandwerendheid), graden, v_b,0 (m/s), de gewichtenbibliotheek
  (een gegevensbestand met eigen eenheden per regel).

## Algemene eisen

- **Zonder stelsel ziet het rapport er precies zo uit als nu**, op papier en op het scherm.
- **Halverwege typen** blijft staan zoals getypt; een veld zonder eenheid verandert nooit.
- Elke tekst via i18n; geen namen van andere rekenprogramma's; commits in het Nederlands.

## Taken

- [x] `useBeeldEenheden` naar `components/calc/useBeeldEenheden.ts`; designerKit exporteert hem door.
- [x] Test: `fe`/`ne`-logica als pure functies (in `beeldEenheden.ts`: `getypt(tekst, bron, opmaak)`).
- [x] Op papier: `Belastingen.tsx`, `raster.tsx` (`Eenheid`), `useRapportWeergave.ts`.
- [x] Op het scherm: `EenheidInvoer`, `Veld`, `RijenTabel` (`Kolom.eenheid`), `OpbouwEditor`, `BelastingenSectie`.
- [x] In de app (headless): US customary, het afdrukvoorbeeld van het rapport en het paneel.
- [x] `npm run check`, CHANGELOG, nakijken, PR.
