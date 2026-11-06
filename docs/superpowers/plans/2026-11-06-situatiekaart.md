# Situatiekaart — bouwplan

> **Voor wie dit uitvoert:** VERPLICHTE SUB-SKILL: superpowers:subagent-driven-development (aanbevolen) of superpowers:executing-plans, taak voor taak. Stappen hebben `- [ ]`-vakjes.

**Doel:** een project krijgt een locatie op de kaart. Het rapport krijgt op pagina 2 een pagina
Situatie met drie kaarten, de terreincategorie en de afstand tot open water. Optioneel komt de
locatie uit ERPNext.

**Opzet:**
- **Pure logica in `packages/desktop/src/kaart/`:** punten, tegels, afstanden, Nominatim en
  Overpass. Die is testbaar in Node, met `scripts/check-situatie.mjs`.
- **Opslag:**
  - het punt staat in de projectgegevens, als JSON-sleutel `locatie_punt`, net als
    `eenheden_lijst`;
  - de kaartbeelden staan als JPEG in `rapport.situatie`, met hun datum. Een opgeleverd
    rapport verandert dus niet meer.
- **Vier PR's vanaf main, elk boven op de vorige:** deel A (de locatie), deel B (de pagina),
  deel C (open water) en deel D (ERPNext).

**Techniek:**
- React + TypeScript (Tauri 2) en Leaflet / react-leaflet (staan al in `package.json`);
- canvas voor de beelden;
- in deel D Rust met `ureq` en `keyring`.

**Ontwerp:** `docs/superpowers/specs/2026-11-06-situatiekaart-design.md`.

## Algemene eisen

- **Tegels:** `https://tile.openstreetmap.org/{z}/{x}/{y}.png`. Op elke kaart en op de pagina
  staat "© OpenStreetMap contributors". Alleen de tegels van een kaart halen, nooit vooraf
  of in bulk.
- **Nominatim:** `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=…`.
  - Alleen op Enter of na een klik op de knop, nooit tijdens het typen.
  - Hooguit één vraag per seconde.
  - Geen `countrycodes`: de zoekvraag werkt wereldwijd.
- **Overpass:** `https://overpass-api.de/api/interpreter`, met één vraag per meting en
  `[timeout:25]`.
- **Zonder internet:** de app crasht niet en hangt niet. De bestaande kaarten blijven staan en
  de gebruiker krijgt een melding via i18n.
- **Elke tekst in beeld via i18n**, in `en` en `nl`:
  - op het scherm: `werkruimte.json` en `rapport.json`;
  - op papier: de taal van het rapport.
  - `node scripts/check-schermtekst.mjs` blijft groen.
- **Oude projecten zonder `locatie_punt` of `rapport.situatie`** openen en drukken zoals altijd.
  Er komt dan geen nieuwe pagina.
- **De openbare repo:**
  - geen namen van bureaus;
  - geen namen van andere rekenprogramma's;
  - commits in het Nederlands, met `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Per deel:** CHANGELOG bijwerken, `npm run check`, een PR naar main, en mergen alleen
  op verzoek.

## Aandachtspunten bij het nakijken

1. **Geen internet of een dienst die faalt** (time-out, HTTP 429/5xx): een melding, de oude
   kaarten blijven, niets half opgeslagen. → taak A2, B2, C2
2. **Een kapotte of met de hand bewerkte `locatie_punt`** (geen JSON, lat buiten ±90, lon
   buiten ±180): telt als geen locatie. → taak A1
3. **De locatie verandert nadat de kaarten gemaakt zijn:** het paneel meldt dat de kaarten bij
   een ander punt horen. Op papier staan de kaarten met hun eigen punt en coördinaten, nooit
   gemengd. → taak B1, B3
4. **Snel twee keer op Zoeken klikken:** één vraag per seconde, het laatste antwoord telt.
   → taak A2
5. **Een rapport in US customary of in het Nederlands:** de afstand staat in ft, de teksten in
   het Nederlands, de getallen met een komma. → taak B3, C2

---

## Deel A: de locatie in het project (PR 1, tak `situatie-locatie`)

### Taak A1: het punt en de tegelwiskunde

**Bestanden:**
- Nieuw: `packages/desktop/src/kaart/punt.ts`, `packages/desktop/src/kaart/tegels.ts`,
  `scripts/check-situatie.mjs`
- Wijzig: README.md en README.nl.md (het aantal controles: 67)

**Interfaces (Produceert):**
- `interface Punt { lat: number; lon: number }`
- `leesPunt(json: string | undefined): Punt | null`: ongeldig of buiten bereik geeft `null`.
- `puntJson(p: Punt): string`: 6 decimalen.
- `leesCoordinaten(tekst: string): Punt | null`: accepteert "52.0907, 5.1214",
  "52,0907; 5,1214" en "52.0907 5.1214". Een adres geeft `null`.
- `puntTekst(p: Punt, taal: string): string`: "52,09070° N, 5,12140° O" in het Nederlands,
  "52.09070° N, 5.12140° E" in het Engels; zuid en west met S/Z en W.
- `tegelPositie(p: Punt, zoom: number): { x: number; y: number }`: Web Mercator, in
  tegeleenheden, als gebroken getal.
- `metersPerPixel(lat: number, zoom: number): number`: 156543.03392 · cos(lat) / 2^zoom.
- `zoomVoor(p: Punt, breedtePx: number, meters: number): number`: het grootste gehele zoom
  ≤ 19 waarbij `breedtePx` pixels ten minste `meters` beslaan.
- `uitsnede(p: Punt, zoom: number, breedte: number, hoogte: number): { z: number; x: number;
  y: number; px: number; py: number }[]`: de tegels die het beeld vullen, met hun plek in
  pixels. Het punt ligt in het midden; `x` wikkelt om de datumgrens.
- `schaalbalk(lat: number, zoom: number, maxPx: number): { meters: number; px: number }`: de
  grootste 1-2-5-reeks (1, 2, 5, 10, … m) die in `maxPx` past.

- [ ] **Stap 1: Test (moet falen).** Maak `scripts/check-situatie.mjs` in de stijl van
  `check-eenheden-beelden.mjs` (meld, telt fouten, exit 1). Gevallen:
  - `leesPunt('{"lat":52.09,"lon":5.12}')` geeft {52.09, 5.12};
  - `leesPunt("kapot")`, `leesPunt('{"lat":95,"lon":5}')`, `leesPunt(undefined)` en
    `leesPunt('{"lat":"52","lon":5}')` geven alle vier `null`;
  - `leesCoordinaten("52,0907; 5,1214")` geeft {52.0907, 5.1214};
    `leesCoordinaten("Domplein 1, Utrecht")` geeft `null`;
  - `puntTekst({lat:-33.8688, lon:151.2093}, "en")` is "33.86880° S, 151.20930° E";
    `puntTekst({lat:52.0907,lon:-5.1214}, "nl")` is "52,09070° N, 5,12140° W";
  - `tegelPositie({lat:0,lon:0}, 1)` is {1, 1};
    `tegelPositie({lat:52.0907,lon:5.1214}, 17)` geeft `x` 67400,64… en `y` 43241,37…
    (±0,01);
  - `metersPerPixel(0, 0)` is 156543.03392, tot op 1e-3;
  - `zoomVoor({lat:52.09,lon:5.12}, 1200, 2000)` is 15; `zoomVoor(…, 600, 300)` is 17;
    `zoomVoor(…, 600, 15000)` is 11;
  - `uitsnede({lat:52.09,lon:5.12}, 15, 1200, 700)` dekt het hele beeld: de tegels vullen
    0..1200 × 0..700 zonder gat, en elke `px` en `py` is een veelvoud van 1 binnen ±256;
  - `uitsnede({lat:0,lon:179.999}, 3, 600, 400)` geeft alleen `x`-waarden in 0..7;
  - `schaalbalk(52.09, 15, 200)` is {meters: 500, px: …≤ 200}.
- [ ] **Stap 2: Draai.** `node scripts/check-situatie.mjs`: FOUT, want de modules ontbreken.
- [ ] **Stap 3: Bouw `punt.ts` en `tegels.ts`** met de interfaces hierboven; zonder imports,
  zodat Node ze laadt.
- [ ] **Stap 4: Draai opnieuw.** `node scripts/check-situatie.mjs`: alles OK.
  `node scripts/check-readme.mjs` is OK na het aantal 67.
- [ ] **Stap 5: Commit.** "Situatiekaart: het punt en de tegelwiskunde".

### Taak A2: zoeken en de locatie kiezen in de projectgegevens

**Bestanden:**
- Nieuw: `packages/desktop/src/kaart/nominatim.ts`,
  `packages/desktop/src/components/calc/LocatieKiezer.tsx` en `.css`
- Wijzig:
  - `components/calc/ProjectGegevensPanel.tsx`: de kiezer onder het veld `locatie`;
  - `i18n/locales/{en,nl}/werkruimte.json` (`gegevens.situatie.*`);
  - `docs/projectmodel.md`: de sleutel `locatie_punt` in de tabel bij "Eenheden" en
    daaronder;
  - `docs/CHANGELOG.md`.

**Interfaces:**
- Gebruikt: alles uit A1.
- Produceert:
  - `parseNominatim(json: unknown): { punt: Punt; naam: string }[]`: geldige regels, de
    rest valt weg.
  - `zoekAdres(tekst: string, taal: string, f?: typeof fetch):
    Promise<{ punt: Punt; naam: string }[]>`: met `Accept-Language` gelijk aan `taal`, en
    hooguit één vraag per seconde. Een tweede aanroep binnen een seconde wacht tot de
    seconde om is. Een fout geeft een `Error` met de HTTP-status.
  - `LocatieKiezer`, zonder props:
    - leest en schrijft `gegevens.locatie` en `gegevens.locatie_punt` via `zetGegeven`;
    - zoeken: het veld met het adres, een knop "Zoeken" en Enter, dan maximaal 5 uitkomsten
      om te kiezen. Kies je er een, dan zet de app `locatie_punt`; is `locatie` nog leeg, dan
      komt de naam daar;
    - de kaart: een Leaflet-kaart met dezelfde tegels als de windkaart. Een klik zet de
      speld; slepen mag ook;
    - de coördinaten staan eronder via `puntTekst`;
    - een knop "Wis locatie" haalt `locatie_punt` weg.

- [ ] **Stap 1: Test (moet falen).** Voeg in `check-situatie.mjs` toe:
  - `parseNominatim` op een vast antwoord: twee goede regels en één zonder `lat` geven 2
    uitkomsten;
  - `zoekAdres` met een nep-`fetch`:
    - twee aanroepen direct na elkaar → de tweede start ≥ 1000 ms na de eerste (gemeten
      met `Date.now()`);
    - een 429 geeft een `Error` met "429";
    - de URL bevat geen `countrycodes`.
- [ ] **Stap 2: Draai.** FOUT, want `nominatim.ts` ontbreekt.
- [ ] **Stap 3: Bouw `nominatim.ts` en `LocatieKiezer.tsx`.**
  - De kiezer krijgt een melding bij een fout of zonder internet
    (`gegevens.situatie.zoekenMislukt`), en ook bij nul uitkomsten.
  - `useProjectStore` zoals in `EenhedenEditor.tsx`.
- [ ] **Stap 4: Draai de controles.** `node scripts/check-situatie.mjs`,
  `node scripts/check-schermtekst.mjs` en
  `cd packages/desktop && npx tsc --noEmit -p .` zijn allemaal groen.
- [ ] **Stap 5: Controle in de app (headless, dev-server).**
  - "Sydney Opera House" zoeken, de eerste uitkomst kiezen: `locatie_punt` ≈ {-33.857,
    151.215};
  - op de kaart klikken verplaatst de speld en het punt;
  - "Wis locatie" haalt hem weg;
  - een project zonder punt ziet er in het rapport uit als voorheen.
- [ ] **Stap 6: Commit en PR.** Commit "Situatiekaart: de locatie in het project", daarna
  `npm run check` en een PR.

---

## Deel B: de pagina Situatie (PR 2, tak `situatie-pagina`)

### Taak B1: het model van de situatie in het rapport

**Bestanden:**
- Nieuw: `packages/desktop/src/rapport/situatie.ts`
- Wijzig:
  - `packages/desktop/src/rapport/model.ts`: `Rapport.situatie?: Situatie`, en in
    `normaliseerRapport` via `normaliseerSituatie`;
  - `scripts/check-situatie.mjs`.

**Interfaces (Produceert):**
- `type KaartId = "gebied" | "omgeving" | "locatie"`
- `const KAARTEN: readonly { id: KaartId; meters: number; breedte: number; hoogte: number }[]`
  met deze waarden:
  - gebied: 15000 m, 560 × 460 px;
  - omgeving: 2000 m, 1180 × 640 px;
  - locatie: 300 m, 560 × 460 px.

  Dat is twee keer de maat op papier, voor een scherpe afdruk.
- `interface Kaartbeeld { id: KaartId; zoom: number; jpeg: string }`: `jpeg` is base64,
  zonder `data:`-voorvoegsel.
- `interface Situatie { tonen: boolean; punt: Punt; datum: string; kaarten: Kaartbeeld[];
  water?: Water }`. `datum` is "JJJJ-MM-DD". Exporteer hier ook
  `interface Water { afstand: number; naam: string; punt: Punt }` (afstand in m). Deel C
  vult het; hier is het al een optioneel veld.
- `normaliseerSituatie(x: unknown): Situatie | undefined`:
  - verkeerde vorm geeft `undefined`;
  - een kaart met een onbekende `id` of zonder `jpeg` valt weg;
  - zonder kaarten geeft het `undefined`.
- `situatieBijPunt(s: Situatie | undefined, p: Punt | null): "geen" | "actueel" | "verouderd"`:
  - "geen" zonder `s` of zonder `p`;
  - "verouderd" als het punt meer dan 1 m van `s.punt` ligt;
  - anders "actueel".

- [ ] **Stap 1: Test (moet falen).**
  - `normaliseerSituatie` op een goede situatie geeft hem terug.
  - Deze geven `undefined`:
    - een kaart met `id` "wereld" (valt weg, en zonder kaarten blijft er niets over);
    - `kaarten: []`;
    - `punt` met lat 200;
    - een tekst.
  - `normaliseerRapport({ ...oud rapport zonder situatie }, …)` heeft geen `situatie`.
  - Met een situatie komt die er na een rondgang via JSON gelijk uit.
  - `situatieBijPunt`: 0,5 m ernaast is "actueel", 50 m is "verouderd"; zonder punt "geen".
- [ ] **Stap 2: Draai.** FOUT.
- [ ] **Stap 3: Bouw `situatie.ts`** en zet hem in `model.ts`. `RAPPORT_VERSIE` blijft 5:
  een nieuw optioneel veld verandert geen bestaand rapport.
- [ ] **Stap 4: Draai.** `check-situatie`, `check-rapport` en `check-rapport-talen` zijn groen.
- [ ] **Stap 5: Commit.** "Situatiekaart: de situatie in het rapportmodel".

### Taak B2: de kaartbeelden maken

**Bestanden:**
- Nieuw: `packages/desktop/src/kaart/beeld.ts`
- Wijzig: `LocatieKiezer.tsx` (de knop "Kaarten maken" / "Kaarten vernieuwen"; na het
  kiezen van een punt maakt de app ze vanzelf) en `werkruimte.json` (en, nl).

**Interfaces:**
- Gebruikt: `uitsnede`, `zoomVoor`, `schaalbalk` en `tegelPositie` uit A1, `KAARTEN` uit B1.
- Produceert: `maakKaartbeeld(p: Punt, k: (typeof KAARTEN)[number], opties: { water?: { punt:
  Punt; label: string }; bron: string; schaalLabel: (meters: number) => string }):
  Promise<Kaartbeeld>`. Wat hij doet:
  - de tegels laden met `crossOrigin = "anonymous"`;
  - tekenen op een canvas, met een rode speld in het midden;
  - linksonder een schaalbalk met `schaalLabel`, rechtsonder de bron;
  - bij `water` een blauwe streeplijn van de speld naar het water, met het label;
  - JPEG met kwaliteit 0.85.
- **Faalt één tegel**, dan faalt het hele beeld met een `Error`. Er komt geen half beeld.

- [ ] **Stap 1: Test (moet falen).** De pure delen zitten al in A1 en B1. Voor het beeld komt
  er een controle in de app (stap 4). Voeg in `check-situatie.mjs` alleen toe: het
  schaallabel voor 500 m is "500 m" en voor 2000 m "2 km". Die functie heet
  `schaalTekst(meters: number, eenheden: BeeldEenheden, taal: string): string`.
  - Plaats: `kaart/tegels.ts`. Tegels.ts blijft zonder imports; `BeeldEenheden` is alleen
    een type.
  - In US customary geeft hij "1,640 ft" voor 500 m en "1.2 mi" voor 2000 m: vanaf
    5280 ft (1 mi) gaat hij naar mi.
    Gebruik `eenheden.waarde(meters, "m")` en daarna ft of mi.
- [ ] **Stap 2: Draai.** FOUT.
- [ ] **Stap 3: Bouw `schaalTekst`, `maakKaartbeeld` en de knop in de kiezer.**
  - De kiezer maakt de drie beelden achter elkaar en schrijft pas als alle drie klaar zijn,
    met één `werkRapportBij`: `situatie = { tonen: true, punt, datum: vandaag, kaarten }`.
  - Een fout geeft de melding `gegevens.situatie.kaartenMislukt`. De oude situatie blijft dan
    staan.
  - Is de situatie "verouderd" (B1), dan meldt de kiezer `gegevens.situatie.verouderd`, met
    de knop ernaast.
- [ ] **Stap 4: Controle in de app (headless).**
  - Een punt kiezen: na hooguit 15 s heeft `rapport.situatie.kaarten` 3 beelden, elk een
    JPEG van ≤ 300 kB (base64-lengte ≤ 400 000).
  - Daarna de speld 100 m verplaatsen: de melding "verouderd" verschijnt.
  - Zonder netwerk (CDP `Network.emulateNetworkConditions` met `offline: true`): de melding
    verschijnt en de oude situatie blijft.
- [ ] **Stap 5: Commit.** "Situatiekaart: de kaartbeelden".

### Taak B3: de pagina op papier, en aan/uit in het rapportpaneel

**Bestanden:**
- Nieuw: `packages/desktop/src/components/rapport/afdruk/Situatie.tsx`
- Wijzig:
  - `afdruk/RapportAfdruk.tsx`: `<Situatie w={w} />` tussen `<Voorblad>` en `<Inhoud>`;
  - `afdruk/RapportAfdruk.css`;
  - `paneel/DocumentSectie.tsx`: een vinkje "Situatiepagina" en de drie kleine beelden;
  - `i18n/locales/{en,nl}/rapport.json` (`afdruk.situatie.*`, `velden.situatie*`);
  - `docs/CHANGELOG.md`;
  - in README.md en README.nl.md de bullet "One project, one report." / "Eén project, één
    rapport.", aangevuld met de situatiepagina met kaarten van OpenStreetMap.

**Interfaces:**
- Gebruikt: `RapportWeergave` (`w.fe`, `w.t`, `w.taal`, `w.gegevens`, `w.rapport.situatie`),
  `windLabel` uit `rapport/normwaarden.ts` en `puntTekst` uit A1.
- Produceert: `Situatie({ w }: { w: RapportWeergave }): ReactNode`. Die geeft `null` zonder
  situatie of als `tonen` false is.
- **Inhoud van de pagina, in de taal van het rapport:**
  - de kop: "Site location" / "Situatie";
  - de drie beelden:
    - omgeving bovenaan, over de volle breedte;
    - gebied en locatie naast elkaar;
    - elk met een onderschrift "Area · about 15 km" enzovoort, in het stelsel via `w.fe`;
  - daaronder een tabel met:
    - Adres (`gegevens.locatie`) en Coördinaten (`puntTekst(situatie.punt, w.taal)`);
    - Terreincategorie: dezelfde tekst als in 5.2 via `windLabel`, met "(keuze van de
      constructeur)" / "(chosen by the structural engineer)";
    - Afstand tot open water: deel C, tot dan "—";
    - Kaart: "© OpenStreetMap contributors, {datum}".
- **De pagina begint op een nieuw vel en eindigt met een nieuw vel**, net als `Voorblad`. Ze
  staat niet in de inhoudsopgave; de paginanummers erna schuiven vanzelf op.

- [ ] **Stap 1: Test.** Puur te testen is er weinig. Leg in `check-situatie.mjs` de tekst
  van de onderschriften vast via een pure helper `onderschrift(id: KaartId, eenheden:
  BeeldEenheden, taal: string, t: (k: string, o?: object) => string): string` in
  `rapport/situatie.ts`:
  - "Omgeving · ca. 2 km" in nl zonder stelsel;
  - "Surroundings · about 1.2 mi" in en/us.
- [ ] **Stap 2: Draai.** FOUT.
- [ ] **Stap 3: Bouw `onderschrift`, `Situatie.tsx`, het vinkje en de plaats in de afdruk.**
- [ ] **Stap 4: Controles.**
  - `check-situatie`, `check-schermtekst`, `check-rapport`, `check-rapport-talen`, `tsc` en
    `node scripts/check-rapport-pdf.mjs` zijn groen. Lokaal zakken alleen de bekende
    werkmap-meldingen.
  - In de app (headless), bij een project met een situatie:
    - het afdrukvoorbeeld heeft "Site location" op vel 2 en de inhoudsopgave op vel 3;
    - de beelden staan erop;
    - in nl staat "Situatie" met een komma in de coördinaten;
    - met het vinkje uit is vel 2 weer de inhoudsopgave;
    - zonder situatie verandert er niets ten opzichte van main: tel de vellen.
- [ ] **Stap 5: Commit en PR.** Commit "Situatiekaart: de pagina Situatie in het rapport",
  daarna `npm run check` en een PR.

---

## Deel C: de afstand tot open water (PR 3, tak `situatie-water`)

### Taak C1: open water zoeken en de afstand berekenen

**Bestanden:**
- Nieuw: `packages/desktop/src/kaart/overpass.ts`, `packages/desktop/src/kaart/afstand.ts`
- Wijzig: `scripts/check-situatie.mjs`, met een vast Overpass-antwoord in
  `scripts/fixtures/overpass-water.json`.

**Wat telt als open water** (het ontwerp laat dit aan de bouwer; dit plan legt het vast):
- **Telt mee:**
  - `natural=coastline`, als lijn;
  - `natural=water` met `water` ∈ {lake, reservoir, river, lagoon, oxbow, canal}, of zonder
    `water`-tag, met een oppervlakte ≥ 1 ha;
  - `natural=bay` en `place=sea`, als vlak.
- **Telt niet mee:** `water` ∈ {pond, ditch, drain, basin, wastewater, fish_pass, moat,
  reflecting_pool, stream_pool}, en vlakken < 1 ha.
- **Zoekstraal:** 10 km. Daarbuiten meldt de app "geen open water binnen 10 km".

**Interfaces (Produceert):**
- `afstandM(a: Punt, b: Punt): number`: haversine, met R = 6 371 008,8 m.
- `dichtstePuntOpLijn(p: Punt, lijn: Punt[]): { punt: Punt; afstand: number }`: lokaal
  vlak rond `p` (equirectangulair), loodrecht op elk segment.
- `oppervlakteM2(ring: Punt[]): number`: lokaal vlak, de shoelace-formule.
- `waterVraag(p: Punt, straalM: number): string`: Overpass QL met `out geom;` voor ways en
  relations die aan de regel hierboven voldoen, binnen `around:straalM`.
- `dichtstbijzijndWater(p: Punt, antwoord: unknown): Water | null`, met het type `Water` uit
  B1 (`rapport/situatie.ts`, alleen als type geïmporteerd).
  - Bij een vlak met het punt erin is de afstand 0.
  - `naam` is `tags.name`, of "" zonder naam.
- `meetWater(p: Punt, f?: typeof fetch): Promise<Water | null>`: één POST met
  `data=waterVraag(p, 10000)`.

- [ ] **Stap 1: Test (moet falen).**
  - `afstandM` Utrecht–Amsterdam (52.0907, 5.1214 → 52.3676, 4.9041) ≈ 34 km, ±0,3 km.
  - `dichtstePuntOpLijn`: een punt 100 m ten noorden van een oost-west lijn geeft een afstand
    van 100 m, ±0,5 m.
  - `oppervlakteM2` van een vierkant van 100 × 100 m is 10 000 m², ±1 %.
  - Met de fixture (een vijver van 0,2 ha op 50 m, een meer van 40 ha op 800 m en een kustlijn
    op 3 km) geeft `dichtstbijzijndWater` het meer op ≈ 800 m, met zijn naam.
  - Met een leeg antwoord geeft hij `null`.
  - Een punt midden in het meer geeft afstand 0.
  - `waterVraag` bevat "around:10000", "coastline" en "out geom".
- [ ] **Stap 2: Draai.** FOUT.
- [ ] **Stap 3: Bouw `afstand.ts` en `overpass.ts`.**
- [ ] **Stap 4: Draai.** Groen.
- [ ] **Stap 5: Commit.** "Situatiekaart: open water en de afstand erheen".

### Taak C2: de knop, de lijn op de kaart en de regel op papier

**Bestanden:**
- Wijzig:
  - `LocatieKiezer.tsx`: een knop "Afstand tot open water meten";
  - `afdruk/Situatie.tsx`: de regel "Afstand tot open water";
  - `werkruimte.json` en `rapport.json` (en, nl);
  - `docs/CHANGELOG.md`.

**Interfaces:**
- Gebruikt: `meetWater` uit C1 en `maakKaartbeeld` uit B2, met `opties.water`.
- **Na een meting:**
  - `rapport.situatie.water` wordt gezet;
  - de omgevingskaart wordt opnieuw gemaakt, met de lijn; het label is `waterTekst` in de
    taal van de app;
  - dat gebeurt met één `werkRapportBij`.
- **Valt het water buiten de omgevingskaart**, dan gaat de lijn tot de rand, met een pijl en
  de afstand.
- **Op papier:** "820 m (Noorderplas)", of "geen open water binnen 10 km". In US customary
  in ft.

- [ ] **Stap 1: Test.** In `check-situatie.mjs`, met een pure helper `waterTekst(water: Water |
  null, eenheden: BeeldEenheden, taal: string, t): string` in `rapport/situatie.ts`:
  - nl zonder stelsel: "820 m (Noorderplas)";
  - en in US: "2,690 ft (Noorderplas)";
  - `null` in nl: "geen open water binnen 10 km".
- [ ] **Stap 2: Draai.** FOUT.
- [ ] **Stap 3: Bouw de helper, de knop en de regel.**
  - Bij een fout van Overpass, zoals een time-out of 429, komt er een melding. Een
    eerdere meting blijft staan.
- [ ] **Stap 4: Controle in de app (headless).**
  - Bij een punt aan het IJsselmeer ligt de gemeten afstand onder 2 km, met naam.
  - De omgevingskaart toont de lijn.
  - Op papier staat de regel.
  - Met de netwerkemulatie offline komt er een melding.
- [ ] **Stap 5: Commit en PR.** Commit "Situatiekaart: de afstand tot open water", daarna
  `npm run check` en een PR.

---

## Deel D: de locatie uit ERPNext (PR 4, tak `situatie-erpnext`)

### Taak D1: instellingen, de sleutel en het verzoek aan de Rust-kant

**Bestanden:**
- Wijzig:
  - `packages/desktop/src-tauri/Cargo.toml`: `ureq = { version = "2", default-features =
    false, features = ["tls", "json"] }` en `keyring = "3"`;
  - `src-tauri/src/lib.rs`: de commando's registreren.
- Nieuw: `src-tauri/src/erpnext.rs`
- Wijzig ook:
  - `components/settings/SettingsDialog.tsx`: een nieuwe tab "ERPNext" met de velden adres,
    API-sleutel, API-geheim en veldnaam;
  - `i18n/locales/{en,nl}/settings.json`.

**Interfaces (Produceert, Rust):**
- `#[tauri::command] erpnext_zet_geheim(geheim: String) -> Result<(), String>`: bewaart het
  geheim in de sleutelbos van het besturingssysteem, onder dienst
  `open-calcsheet-studio-erpnext`. Een leeg geheim wist het.
- `#[tauri::command] erpnext_heeft_geheim() -> bool`
- `#[tauri::command] erpnext_project_veld(adres: String, sleutel: String, project: String,
  veld: String) -> Result<String, String>`:
  - doet een GET op `{adres}/api/resource/Project/{project}` (project URL-gecodeerd), met
    `Authorization: token {sleutel}:{geheim uit de sleutelbos}` en een time-out van 15 s;
  - geeft de tekst van `data.{veld}` terug, of "" als het veld leeg is;
  - fouten komen terug als tekst met de HTTP-status;
  - alleen `https://`, en `http://localhost` voor tests.
- `fn veld_uit_antwoord(json: &str, veld: &str) -> Result<String, String>`: puur, getest.
- `fn project_url(adres: &str, project: &str) -> Result<String, String>`: puur, getest. Hij
  weigert een adres dat niet met `https://` of `http://localhost` begint.

**Instellingen (TS):** `getSetting("erpnext")` geeft `{ adres: string; sleutel: string; veld:
string }`, met standaardveld `custom_location`. Het geheim staat nooit in de instellingen.

- [ ] **Stap 1: Rust-tests (moeten falen)** in `erpnext.rs`:
  - `project_url("https://erp.voorbeeld.nl", "PRJ-0001/A")` is
    "https://erp.voorbeeld.nl/api/resource/Project/PRJ-0001%2FA";
  - `project_url("ftp://x", …)` geeft een `Err`;
  - `veld_uit_antwoord('{"data":{"custom_location":"52.09, 5.12"}}', "custom_location")`
    is "52.09, 5.12";
  - een ontbrekend veld geeft "";
  - geen JSON geeft een `Err`.
- [ ] **Stap 2: Draai.** `cd packages/desktop/src-tauri && cargo test erpnext`: FOUT.
- [ ] **Stap 3: Bouw `erpnext.rs`, registreer de commando's en zet de instellingen in het
  dialoogvenster.** Het geheim gaat via `erpnext_zet_geheim`; het veld toont alleen of er
  een geheim is.
- [ ] **Stap 4: Draai.** `cargo test erpnext` is groen, en
  `cd packages/desktop && npx tsc --noEmit -p .` ook.
- [ ] **Stap 5: Commit.** "Situatiekaart: ERPNext-instellingen en het verzoek".

### Taak D2: "Overnemen uit ERPNext"

**Bestanden:**
- Wijzig:
  - `LocatieKiezer.tsx`;
  - `werkruimte.json` (en, nl);
  - `docs/CHANGELOG.md`;
  - `docs/projectmodel.md`: een korte alinea ERPNext.
- Nieuw: `packages/desktop/src/kaart/erpnext.ts`

**Interfaces:**
- Gebruikt: `leesCoordinaten` uit A1, `zoekAdres` uit A2 en de Rust-commando's uit D1.
- Produceert: `locatieUitErp(tekst: string, zoek: (t: string) => Promise<{ punt: Punt; naam:
  string }[]>): Promise<{ punt: Punt; naam: string } | null>`.
  - Zijn het coördinaten, dan gebruikt hij die direct, met als naam de tekst.
  - Is het een adres, dan neemt hij de eerste uitkomst van `zoek`.
  - Is de tekst leeg, dan `null`.
- **De knop staat er alleen** als de ERPNext-instellingen gevuld zijn, er een geheim is en
  `gegevens.project_nummer` gevuld is.
- **De knop vervangt pas na de klik** `locatie_punt`. Als `locatie` leeg is of gelijk aan de
  vorige ERPNext-tekst, krijgt `locatie` de tekst uit ERPNext.
- **Daarna maakt de app de kaarten opnieuw**, zoals in B2.

- [ ] **Stap 1: Test (moet falen).** In `check-situatie.mjs`:
  - `locatieUitErp("52.09, 5.12", zoek)` roept `zoek` niet aan;
  - `locatieUitErp("Domplein 1, Utrecht", nep)` geeft de eerste uitkomst van `nep`;
  - `locatieUitErp("", …)` geeft `null`.
- [ ] **Stap 2: Draai.** FOUT.
- [ ] **Stap 3: Bouw `erpnext.ts` en de knop.** Een fout geeft een melding, en het oude punt
  blijft.
- [ ] **Stap 4: Controle in de app.**
  - Met een nep-commando (de Tauri-aanroep vervangen in de dev-server) dat
    "52.0907, 5.1214" teruggeeft, zet de knop het punt.
  - Met een adres gaat het via Nominatim.
  - Zonder instellingen is er geen knop.
- Opmerking (geen stap): het veld bestaat niet standaard in ERPNext; de beheerder van een
  installatie maakt een Custom Field `custom_location` (Data, label "Location") op Project.
- [ ] **Stap 5: Commit en PR.** Commit "Situatiekaart: locatie overnemen uit ERPNext", daarna
  `npm run check` en een PR.
