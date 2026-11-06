# Eenheden stap 2 (de app) — bouwplan

> **Voor wie dit uitvoert:** superpowers:executing-plans, taak voor taak, met `- [ ]`-vakjes.

**Doel:** het eenhedenstelsel uit stap 1 werkt in de app. Je kiest het per project, het
geldt in de uitwerking, het afdrukvoorbeeld en het rapport, invoervelden tonen en lezen
in het stelsel, en eigen eenheden van het project gelden in alle bladen.

**Opzet:**
- **Het stelsel is een projectgegeven.** `gegevens.eenheden` is een keuzeveld in
  `PROJECT_VELDEN`. `gegevens.eenheden_eigen` en `gegevens.eenheden_lijst` zijn JSON-teksten,
  extra sleutels in dezelfde `gegevens`. Opslaan, het herstelbestand, IFCX, ongedaan maken
  en oude bestanden werken daardoor vanzelf; het bestandsformaat verandert niet.
- **Doorgeven:** `evalOptiesVan(gegevens)` maakt er de `EvalOpties` van; die gaan langs
  elke weergave-ingang naar `evaluate`.
- **De beelden niet:** de parametrische beelden en de IFCX-export blijven zonder stelsel.
  Ze rekenen met `waarde`, en die verandert toch niet.

**Ontwerp:** `docs/superpowers/specs/2026-11-06-eenheden-design.md`, stap 2.

## Algemene eisen

- **Zonder stelsel ("Zoals in het blad", de standaard) ziet alles eruit zoals nu.** Eén
  uitzondering: typ je een getal mét eenheid in een veld, dan wordt dat omgerekend.
- **`ex.waarden` blijft in de eenheid van de bladtekst**, ook als je in een ander stelsel typt.
- **Elke tekst in beeld via i18n** (en en nl), net als de rest van het projectpaneel.
- **Geen namen van andere rekenprogramma's.** Commits in het Nederlands, met
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Controles:** `npm --prefix packages/core run build` en daarna `node scripts/<check>.mjs`.

## Aandachtspunten bij het nakijken

1. **Halverwege typen** ("0,", "1e", "-", leeg) blijft staan zoals getypt, en de cursor
   springt niet. → taak 3
2. **Een veld zonder eenheid** (een aantal, een factor) verandert nooit. → taak 1
3. **Kapotte JSON in `eenheden_eigen` of `eenheden_lijst`** (met de hand bewerkt bestand)
   geeft geen crash; dan geldt het als leeg. → taak 2
4. **Een eigen eenheid van het project die niet geldig is** (`.x = 3`) breekt geen enkel
   blad. → taak 2
5. **Een oud project zonder deze sleutels** opent met "Zoals in het blad". → taak 2

---

### Taak 1: Invoervelden in de rekenkern

**Bestanden:** `packages/core/src/eenheidstelsel.ts`, `evaluator.ts` (`input-prompt`),
`types.ts` (`EvaluatedInputPrompt.toonEenheid?: string`), `renderer.ts`
(`renderInputPrompt`), `index.ts`. Test: `scripts/check-eenheidstelsel.mjs`, sectie "Invoer".

**Levert:**
- `toonInvoer(waarde: string, bron: string, doel: string): string`: een opgeslagen kaal
  getal (komma mag) in de doeleenheid, op 6 significante cijfers. Is het geen getal,
  dan blijft de tekst ongewijzigd.
- `invoerNaarBron(tekst: string, toon: string, bron: string): { waarde: string } | { fout: string }`:
  - een kaal getal geldt in `toon`;
  - een getal met eenheid geldt in zijn eigen eenheid;
  - beide worden omgerekend naar `bron`, op 12 significante cijfers;
  - een andere dimensie geeft `fout`;
  - een tussenstand of een kaal getal met `toon === bron` blijft letterlijk.
- **Weergave van het veld:** met een stelsel dat de eenheid omrekent, toont het veld de
  omgerekende waarde en de eenheid `toonEenheid`. Het input-element draagt
  `data-eenheid` (de eenheid van de bron), en met een stelsel ook `data-toon-eenheid`.

- [ ] **Stap 1: Test.**
  - `toonInvoer("4500","mm","in")` === `"177.165"`
  - `invoerNaarBron("12","in","mm")` → `{waarde:"304.8"}`
  - `invoerNaarBron("12,5","in","mm")` → `"317.5"`
  - `invoerNaarBron("5 m","mm","mm")` → `"5000"`
  - `invoerNaarBron("3 kip","mm","mm")` → `fout`
  - `invoerNaarBron("12","mm","mm")` → `"12"`
  - `invoerNaarBron("0,","in","mm")` → `"0,"`
  - de node van `b = ?{4500}mm` met `us` heeft `toonEenheid` `"in"` en `currentValue` `"177.165"`;
  - zonder stelsel is er geen `toonEenheid`;
  - de HTML met `us` bevat `data-toon-eenheid="in"`.
- [ ] **Stap 2:** draai de test en zie hem falen.
- [ ] **Stap 3:** bouw het.
- [ ] **Stap 4:** draai de test en de bestaande controles (`check-lege-invoer`,
  `check-opdrachten`, `check-eenheden`): groen.
- [ ] **Stap 5: Commit.**

### Taak 2: Het stelsel in het project en langs alle ingangen

**Bestanden:**
- nieuw: `packages/desktop/src/store/projectEenheden.ts`;
- `store/projectGegevens.ts` (veld `eenheden` in `PROJECT_VELDEN`, groep "Units", standaard `blad`);
- `rekenen/doorrekening.ts`: `useDoorrekening` leest `gegevens` uit de store en zet de
  opties in het verzoek en de cachesleutel;
- `rekenen/rekenWorker.ts`;
- `components/calc/canvasRekenen.ts` (`rekenUitwerking`, `rekenEenhedenDoor`: extra
  argument `evalOpties`);
- `components/calc/bladDoorrekenen.ts` (`rekenBladDoor(ex, scope, taal, evalOpties?)`);
- `components/calc/PrintDocument.tsx` (`useUitdraai`);
- `components/rapport/afdruk/useRapportWeergave.ts`;
- `mcp/rekenen.ts`.

Test: nieuw `scripts/check-eenheden-project.mjs`.

**Levert:**
- `export type StelselKeuze = 'blad' | 'si-mm' | 'si-m' | 'us' | 'eigen'`
- `export function evalOptiesVan(g: ProjectGegevens): EvalOpties`
  - `blad` → `{}`, zonder stelsel;
  - een set → `STELSELS[...]`;
  - `eigen` → `{ ...STELSELS['si-mm'], ...eigen }`;
  - plus `eigenEenheden` uit `eenheden_lijst`.
- `export function eigenNamenVan(g: ProjectGegevens): string[]` (voor `ParseOptions.eenheden`)
- `export const GROOTHEID_KEUZES: Record<Grootheid, string[]>`, de keuzes uit de tabel in het
  ontwerp.

- [ ] **Stap 1: Test.**
  - `evalOptiesVan({})` heeft geen stelsel;
  - met `{eenheden:"us"}` geldt `stelsel.kracht === "kip"`;
  - `eigen` met `{"kracht":"N"}` geeft `kracht === "N"` en `maat === "mm"`;
  - kapotte JSON geeft geen fout en geldt als leeg (aandachtspunt 3);
  - `eigenNamenVan` geeft de namen uit de lijst;
  - `PROJECT_VELDEN` heeft `eenheden` met standaard `blad`, en `projectScope` krijgt
    geen variabele `eenheden`;
  - `rekenBladDoor({source:"L = 4.5 m", waarden:{}, ...}, {}, "en", evalOptiesVan({eenheden:"us"}))`
    geeft html met "ft";
  - een eigen eenheid van het project (`kipf = 1000 lbf`) geldt in het blad;
  - een ongeldige (`x` = `3`) breekt het blad niet (aandachtspunt 4).
- [ ] **Stappen 2–5:** zien falen, bouwen, groen (plus `check-uitvoer-taal`,
  `check-rapport`, `check-api`, `check-mcp`, desktop `tsc`), commit.

### Taak 3: Invoervelden in de uitwerking

**Bestand:** `packages/desktop/src/components/calc/Preview.tsx` (de lus over `.calc-input-value`).

- **Waarde in beeld:** het veld toont `toonInvoer(opgeslagen, data-eenheid, data-toon-eenheid)`.
  Zolang je typt, staat er wat je typte; dat bewaart een ref per veld en vergeet het bij blur.
- **Bij typen:** `invoerNaarBron(tekst, toon ?? bron, bron)`.
  - Een waarde gaat naar `setSelectValue`.
  - Een fout geeft het veld de klasse `calc-input-fout` en de melding als `title`, en
    slaat niets op.

- [ ] **Controle in de echte app** (taak 5): typ "12" in een veld in mm met US customary,
  en zie in `waarden` 304.8 en in het veld nog steeds "12".

### Taak 4: Instellen

**Bestanden:**
- `components/calc/ProjectGegevensPanel.tsx`: een sectie Units.
  - Het keuzeveld komt uit `PROJECT_VELDEN`.
  - Bij "eigen" per grootheid een keuzelijst uit `GROOTHEID_KEUZES`.
  - Een lijst eigen eenheden (naam, uitdrukking, verwijderen, toevoegen), via `zetGegeven`
    als JSON.
- `components/settings/SettingsDialog.tsx`, tab Units:
  - "Unit system for new projects" (`units.stelsel`) komt in de plaats van de drie
    keuzes die niets deden;
  - de velden blijven in `UnitsSettings` voor de API.
- `store/projectStore.ts` (`nieuwProject`): een nieuw project krijgt `units.stelsel`.
- `i18n/locales/{en,nl}/*.json`.

- [ ] Draai `check-bureau-i18n`, `check-schermtekst` en desktop `tsc`, en commit.

### Taak 5: In de app, nakijken en PR

- [ ] Changelog, `docs/projectmodel.md` (de drie sleutels), README-telling (+1 controle).
- [ ] **Dev-server van deze worktree, headless.**
  - Een balklaag met US customary: het blad toont ft, in en kip, en het rapport en het
    afdrukvoorbeeld ook.
  - Typen in een veld werkt als in taak 3.
  - Schermafdruk.
- [ ] `npm run check`, een onafhankelijke nakijker, de bevindingen verwerken en dan een PR
  (op `eenheden`; na het mergen van #33 naar main).
