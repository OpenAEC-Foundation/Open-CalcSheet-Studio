# Het @toets-blok (stap 2) — implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een rekenblad laat een normtoets doen door FEM Studio met `@toets naam = tool … @end`, toont de uitkomst per toets, en rekent verder met `naam.uc_max`.

**Architecture:**
- **De kern** (`packages/core/src/toetsBlok.ts`) leest het blok, rekent de velden uit, rekent de eenheden om en maakt een hash van de invoer op het blad. Daarmee zoekt hij het antwoord op in `EvalOpties.toetsingen`. Die opties gaan via `postMessage` naar de worker, dus het zijn gegevens en geen functie.
- **Zonder antwoord** geeft het blok in de werkruimte (`toetsModus: "vragen"`) een verzoek mee terug. Elders (`"lezen"`) staat het als NIET GETOETST.
- **De app** (`rekenen/femToetsing.ts`) stuurt openstaande verzoeken via `femStudioAanroep` en bewaart de antwoorden in een sessiecache. Daarna rekent het blad een ronde opnieuw. Vastleggen in het projectbestand is stap 3.

**Tech Stack:** TypeScript (core met mathjs, desktop met React), Node-controlescript.

**Spec:** `docs/superpowers/specs/2026-11-07-toetsing-via-fem-studio-design.md`, §2, §3 en §7 stap 2.

## Global Constraints

- **Variabelen.** De rekentaal maakt van een punt in een naam een liggend streepje (`kolom.uc_max` → `kolom_uc_max`), dus het blok zet platte variabelen:
  - `<naam>_uc_max` (getal);
  - `<naam>_voldoet` (1 of 0);
  - `<naam>_status` (`Ok`, `NotOk`, `NotApplicable`);
  - per toets `<naam>_uc_<id>`, met de punten in het id als `_` (`6.3.2_ltb` → `kolom_uc_6_3_2_ltb`);
  - bij een lijst of een model `<naam>_uc_staaf`, een vector in de volgorde van het antwoord.
- **Status.** Bij een staaf of het geheel betekent `NotApplicable` "niet volledig getoetst", en nooit "voldoet". Bij één toets betekent `NotApplicable` "niet van toepassing"; die toets telt niet mee.
- **Eenheden** volgen het achtervoegsel van de veldnaam. De langste eerst: `_mm2` mm², `_mm4` mm⁴, `_mm6` mm⁶, `_mm` mm, `_m` m, `_knm` kNm, `_kn` kN, `_mpa` MPa, `_n_per_mm` N/mm, `_kn_per_m` kN/m.
  - Een grootheid met eenheid in een veld zonder achtervoegsel is een fout op die regel.
  - Een getal gaat zoals het is.
  - Dit geldt ook in geneste objecten, per sleutel.
- **Matrixvorm.** Voor `forces_envelope` zijn de kolommen `[combination_id, position_mm, n_ed, vy_ed, vz_ed, mt_ed, my_ed, mz_ed]`, in mm, kN, kN, kN, kNm, kNm, kNm. Een rij wordt `{combination_id, position_mm, forces: {…}}`.
- **De hash** gaat over `{tool, velden}` met elke waarde canoniek: een grootheid als getal in SI-basiseenheden plus haar dimensie, en getallen op 12 significante cijfers. Daarmee geven `6 m` en `6000 mm` dezelfde hash. De vorm is `t` plus 16 hextekens.
- **Taal.** Vaste woorden komen in het Nederlands of Engels, via `EvalOpties.taal`. De teksten van FEM Studio zelf blijven zoals ze komen.
- Geen namen van externe rekensoftware; commits eindigen met de Co-Authored-By-regel.

## Review Focus

- **Een veld dat niet uit te rekenen is** (onbekende variabele): een fout op die regel, en geen verzoek naar FEM Studio. Test `veldfout_geen_verzoek` (Task 1).
- **Een antwoord met `isError`** (FEM Studio weigert, bijvoorbeeld een onbekend profiel): NIET GETOETST met de melding, en de variabelen van het blok zijn onbekend. Test `antwoord_fout` (Task 1).
- **`#hide` om het blok:** de variabelen bestaan wel, maar het blok staat niet op het blad. Test `verborgen_blok_rekent` (Task 1).
- **Het blok in een `#if`-tak die niet geldt:** geen verzoek. Test `if_tak_geen_verzoek` (Task 1).
- **Hetzelfde blad, alleen een andere eenheid van invoer** (`h = 6 m` naar `h = 6000 mm`): dezelfde hash, dus geen nieuw verzoek. Test `hash_eenheid_onafhankelijk` (Task 1).

---

### Task 1: De kern: lezen, rekenen, opzoeken en tonen

**Files:**
- Create: `packages/core/src/toetsBlok.ts`, `scripts/check-toets-blok.mjs`, `scripts/fixtures/toets-staal.json` (een echt antwoord van `check_steel_beam`)
- Modify: `packages/core/src/types.ts` (`ToetsNode`, `EvaluatedToets`, `ToetsAntwoord`, `ToetsVerzoek`, de unions), `parser.ts` (het blok), `evaluator.ts` (`EvalOpties.toetsingen`, `toetsModus`, `taal`; de case `toets`), `renderer.ts` (case en CSS), `index.ts` (exports)

**Interfaces (core):**
- `TOETS_START_RE = /^@toets\s+([\p{L}_][\p{L}\p{N}_]*)\s*=\s*([a-z][a-z0-9_]*)\s*$/iu`
- `leesToetsBlok(naam: string, tool: string, regels: string[], normaliseer: (e: string) => string): Omit<ToetsNode, 'type'>`, met `velden: {veld, expr, regel}[]` en `fouten: string[]`.
- `naarSchema(veld: string, waarde: unknown): unknown`. Werpt een `Error` met een Nederlandse melding.
- `canoniek(waarde: unknown): unknown` en `toetsHash(tool: string, invoer: Record<string, unknown>): string`.
- `leesAntwoord(antwoord: unknown): ToetsUitkomst`, met:
  - `uc_max: number | null`, `status: string`, `voldoet: boolean`;
  - `toetsen: {id, artikel, titel, uc: number | null, status}[]`;
  - `maatgevend?: string`;
  - `staven?: {id, uc_max, status}[]`.
- `bouwToets(node: ToetsNode, r: {reken(expr: string): unknown; scope: Record<string, unknown>; opties: EvalOpties}): EvaluatedToets`. Zet de variabelen in de scope.
- `renderToets(node: EvaluatedToets): string`.
- `EvaluatedToets`:
  - `{type: 'toets', naam, tool, hash?, status: 'wacht' | 'klaar' | 'fout' | 'niet-getoetst', melding?, uitkomst?, verzoek?: ToetsVerzoek, taal}`;
  - `ToetsVerzoek = {hash, tool, argumenten}`;
  - `ToetsAntwoord = {ok: true, uitkomst: unknown, versie?: string} | {ok: false, melding: string}`.

- [ ] **Step 1: `check-toets-blok.mjs`** met deze proeven:
  - lezen: naam, tool, velden, een regel zonder `=`, en een blok zonder `@end`;
  - naarSchema: `length_m = 6000 mm` geeft 6; `a_net_mm2 = 12 cm^2` geeft 1200; een getal blijft; `profile_name = "HEA200"` blijft tekst; `lateral_bracing = {top_flange_positions: [0, 1], …}` wordt een object met arrays; een grootheid in `beam_id` is een fout;
  - de matrix van `forces_envelope`, met `M_Ed` in kNm;
  - `hash_eenheid_onafhankelijk`;
  - `leesAntwoord` op de fixture: `uc_max` 0,5776, `status` Ok, maatgevend `6.3.3_eq_6_62`, `6.2.3_tension` niet van toepassing;
  - de variabelen `kolom_uc_max`, `kolom_voldoet` en `kolom_uc_6_3_2_ltb` in de scope;
  - modus vragen zonder antwoord geeft status wacht met een verzoek; modus lezen geeft niet-getoetst zonder verzoek;
  - `antwoord_fout`, `veldfout_geen_verzoek`, `verborgen_blok_rekent`, `if_tak_geen_verzoek`;
  - de weergave: een tabel met een rij per toets (niet van toepassing apart), de maatgevende rij gemarkeerd, en "NIET GETOETST" bij een fout; Engelse woorden met `taal: 'en'`.
- [ ] **Step 2:** Run `npm --prefix packages/core run build && node scripts/check-toets-blok.mjs`. Expected: FAIL, de exports bestaan nog niet.
- [ ] **Step 3:** Implementeer de bestanden hierboven. De parser leest de regels tot `@end`, zoals bij `@3d`, en normaliseert elke uitdrukking met `normaliseer3d`. De evaluator rekent het blok ook als het verborgen is, maar zet het dan niet in de uitkomst.
- [ ] **Step 4:** Zelfde run. Expected: "Alles klopt."
- [ ] **Step 5:** Commit "Rekentaal: @toets-blok voor een toets door FEM Studio".

### Task 2: De app: rondes in de werkruimte en lezen elders

**Files:**
- Create: `packages/desktop/src/rekenen/femToetsing.ts`
- Modify:
  - `rekenen/rekenWorker.ts` (de verzoeken verzamelen, ook in takken);
  - `rekenen/doorrekening.ts` (`RekenAntwoord.verzoeken`; de evaluatieopties krijgen `toetsingen`, `toetsModus: 'vragen'` en `taal`; de sleutel krijgt de versie van de cache);
  - `components/calc/PrintDocument.tsx` en `components/rapport/afdruk/useRapportWeergave.ts` (lezen, met de cache);
  - `mcp/rekenen.ts` (lezen).

**Interfaces:**
- `vraagToetsingen(verzoeken: ToetsVerzoek[]): void` stuurt nieuwe verzoeken één keer. Een verzoek dat loopt of beantwoord is, slaat hij over.
- `toetsingenNu(): Record<string, ToetsAntwoord>` en `useToetsVersie(): number`, met `useSyncExternalStore`.
- `metToetsingen(opties: EvalOpties, modus: 'vragen' | 'lezen'): EvalOpties`.

- [ ] **Step 1:** Implementeer. Een `FemFout` wordt `{ok: false, melding}`; een antwoord wordt `{ok: true, uitkomst, versie}`, met de versie uit `femStudioStatus`.
- [ ] **Step 2:** `npx tsc --noEmit -p packages/desktop`. Expected: geen uitvoer.
- [ ] **Step 3: Browserpreview.** Een blad met een `@toets`-blok. Buiten de desktop-app blijft het bij "wordt getoetst", en daarna niet getoetst met de melding "alleen in de desktop-app". Geen fout in de console, en het blad onder het blok rekent door.
- [ ] **Step 4:** Commit "Toetsblokken in de werkruimte laten toetsen door FEM Studio".

### Task 3: Docs en controle

- [ ] `docs/rekentaal.md`: een sectie `@toets`, met het voorbeeld uit de spec, de variabelen, de eenheden, de matrixvorm en de statussen.
- [ ] `docs/CHANGELOG.md` en de tellingen in de README's (een controlescript erbij).
- [ ] `npm run check` op de achtergrond. Expected: alleen de twee bekende punten van `check-rapport-pdf`.
- [ ] Commit, push en PR (basis: `fem-studio-meegeleverd`, zolang #49 niet gemerged is).
