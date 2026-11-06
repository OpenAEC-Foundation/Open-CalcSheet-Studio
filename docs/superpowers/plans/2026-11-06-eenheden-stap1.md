# Eenheden stap 1 (rekenkern) — bouwplan

> **Voor wie dit uitvoert:** gebruik superpowers:executing-plans (of
> superpowers:subagent-driven-development) en werk taak voor taak. Stappen hebben
> een `- [ ]`-vakje.

**Doel:** de rekenkern krijgt één gedeelde set eenheden met de Amerikaanse
eenheden die ontbreken, eigen eenheden in een blad (`.naam = uitdrukking`) en een
eenhedenstelsel dat alleen de weergave omrekent. In de app verandert nog niets.

**Opzet:**
- `eenheden.ts` maakt de enige mathjs-instantie; parser, rekenkern en `latex.ts`
  gebruiken die.
- `eenheidstelsel.ts` deelt een eenheid in bij een grootheid en rekent een waarde
  om naar de eenheid van het stelsel.
- `evaluate` krijgt een optie-argument. De uitkomst krijgt een apart veld
  `weergave`, zodat `result`, `unit` en `waarde` (waar de beelden en de controles
  mee rekenen) ongewijzigd blijven.

**Techniek:** TypeScript in `packages/core`, mathjs 13.2.3, controles als
`scripts/check-*.mjs` tegen `packages/core/dist`.

**Ontwerp:** `docs/superpowers/specs/2026-11-06-eenheden-design.md`

## Algemene eisen

- **Zonder stelsel blijft de uitvoer gelijk.** Zonder optie of met `{}` geeft
  `render(evaluate(parse(x)))` dezelfde HTML als nu, voor elk blad.
- **Een stelsel verandert nooit een rekenwaarde.** `result`, `unit`, `waarde` en
  `getoond` blijven gelijk; alleen `weergave` komt erbij.
- **Geen namen van andere rekenprogramma's** in code, commentaar, documentatie of
  commits. Het formaat heet "het `.cpd`-formaat".
- **Vorm:** namen en commentaar in het Nederlands, zoals de rest van de kern.
  Commits in het Nederlands, met `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Controles draaien tegen een gebouwde kern:**
  `npm --prefix packages/core run build && node scripts/check-eenheidstelsel.mjs`.
- **Nieuwe eenheden:**
  - ksi = 1000 psi
  - psf = 1 lbf/ft^2
  - ksf = 1 kip/ft^2
  - plf = 1 lbf/ft
  - klf = 1 kip/ft
  - pcf = 1 lbf/ft^3

## Aandachtspunten bij het nakijken

Wat het ontwerp niet uitspreekt maar een gebruiker wel tegenkomt, met de taak
die het afdekt:

1. **Een variabele met de naam van een nieuwe eenheid** (`ksi = 2`, `psf = 3`)
   blijft een variabele: `y = 3*ksi` geeft 6. → taak 1
2. **Een regel die met een punt begint maar geen definitie is** (`.5`, `.Opmerking`
   zonder `=`) doet wat hij nu doet. → taak 3
3. **Een temperatuurverschil in K** (`ΔT = 20 K`) blijft in elk stelsel 20 K. → taak 4
4. **Een vector of matrix met één eenheid** (`v = [1; 2] m`) wordt in het stelsel
   per element omgerekend. → taak 4
5. **Nul en negatieve waarden** rekenen om zonder "-0". → taak 4

---

### Taak 1: Eén gedeelde set eenheden, met de Amerikaanse erbij

**Bestanden:**
- Nieuw: `packages/core/src/eenheden.ts`
- Wijzigen: `packages/core/src/evaluator.ts:1,20` (instantie), `packages/core/src/parser.ts:1,1606-1640` (`Unit` uit de gedeelde instantie), `packages/core/src/latex.ts:1` (`parse` uit de gedeelde instantie)
- Nieuw: `scripts/check-eenheidstelsel.mjs`

**Levert:**
- `export const math: MathJsInstance`
- `export function isEenheidNaam(naam: string): boolean`, verhuisd uit
  `evaluator.ts:1374` en daar opnieuw geëxporteerd voor `rekenblok.ts`.

- [ ] **Stap 1: Schrijf de controle.** Nieuw script, in de stijl van
  `check-eenheden.mjs` (functie `meld`, aan het eind `process.exit`). Sectie
  "Amerikaanse eenheden". Met `uitkomst(bron, naam)` als hulpje dat
  `evaluate(parse(bron))` doorloopt en `result` van node `naam` geeft:
  - `uitkomst("s = 235 N/mm^2\nx = s to ksi", "x")` === `"34.08 ksi"`
  - `uitkomst("q = 10 kN/m\nx = q to klf", "x")` === `"0.6852 klf"`
  - `uitkomst("p = 2.4 kN/m^2\nx = p to psf", "x")` === `"50.13 psf"`
  - `uitkomst("p = 100 kN/m^2\nx = p to ksf", "x")` === `"2.089 ksf"`
  - `uitkomst("q = 1 kN/m\nx = q to plf", "x")` === `"68.52 plf"`
  - `uitkomst("g = 25 kN/m^3\nx = g to pcf", "x")` === `"159.1 pcf"`
  - een getal met een nieuwe eenheid wordt herkend: `uitkomst("p = 50 psf\nx = p to kN/m^2", "x")` === `"2.394 kN / m^2"`
  - aandachtspunt 1: `uitkomst("ksi = 2\ny = 3*ksi", "y")` === `"6"`
- [ ] **Stap 2: Draai de controle.** Na het bouwen van de kern faalt hij met
  "Undefined symbol ksi".
- [ ] **Stap 3: Bouw `eenheden.ts`.** `create(all, {})`, daarna `createUnit` voor
  de zes eenheden uit "Algemene eisen". Laat evaluator, parser en `latex.ts` deze
  instantie gebruiken. `isDoeleenheid` en `isEenheid` in de parser gebruiken
  `math.Unit.isValuelessUnit`.
- [ ] **Stap 4: Draai de controle**, plus `node scripts/check-eenheden.mjs` en
  `node scripts/check-opdrachten.mjs`: allemaal groen.
- [ ] **Stap 5: Commit.** "Rekenkern: één gedeelde set eenheden, met ksi, psf, ksf, plf, klf en pcf".

### Taak 2: Amerikaanse eenheden goed in beeld

**Bestanden:**
- Wijzigen: `packages/core/src/latex.ts:19-31` (`UNIT_NAMES`), en de plek waar een
  naam na een getal als eenheid wordt opgemaakt (`latex.ts:181`)
- Wijzigen: `packages/core/src/evaluator.ts:2084` (`isLengte` in `simplifyUnitString`)
- Test: `scripts/check-eenheidstelsel.mjs`, sectie "Opmaak"

- [ ] **Stap 1: Schrijf de controle.**
  - `exprToLatex("50 psi")` bevat `\text{psi}` en niet `\psi`;
  - `exprToLatex("psi_0 * 2")` bevat wel `\psi` (de variabele ψ₀ blijft Grieks);
  - `exprToLatex("3 kip")` en `exprToLatex("2 lbf")` bevatten `\text{kip}` en `\text{lbf}`;
  - `uitkomst("F = 10 kip\na = 2 ft\nM = F*a", "M")` eindigt op `"kip ft"` (lengte achteraan, zoals bij `kN m`).
- [ ] **Stap 2: Draai de controle.** Hij faalt op psi en op "ft kip".
- [ ] **Stap 3: Pas aan.**
  - `UNIT_NAMES` krijgt `in`, `lbf`, `kip`, `psi`, `ksi`, `psf`, `ksf`, `plf`, `klf` en `pcf`.
  - Een naam direct na een getal die een eenheid is, gaat via `unitToLatex`, vóór
    de Griekse tabel.
  - `isLengte` herkent ook `in`, `inch`, `ft`, `yd` en `mi`.
- [ ] **Stap 4: Draai de controle**, plus `check-formulebeeld.mjs` en
  `check-afkortingen.mjs`: groen.
- [ ] **Stap 5: Commit.** "Formules: psi is een eenheid, geen ψ; Amerikaanse lengtes achteraan".

### Taak 3: Eigen eenheden in een blad

**Bestanden:**
- Wijzigen: `packages/core/src/parser.ts` (nieuwe regelsoort, en eigen eenheden
  herkennen bij het binden van getal en eenheid)
- Wijzigen: `packages/core/src/types.ts` (AST-node `eenheid-def`)
- Wijzigen: `packages/core/src/evaluator.ts` (uitvoeren en opruimen)
- Wijzigen: `packages/core/src/renderer.ts` (de definitieregel tonen)
- Test: `scripts/check-eenheidstelsel.mjs`, sectie "Eigen eenheden"

**Levert:**
- AST-node `{ type: 'eenheid-def'; name: string; expression: string; line: number }`
- `ParseOptions.eenheden?: string[]`: extra eenheidsnamen, voor stap 2 (eenheden
  van het project)

- [ ] **Stap 1: Schrijf de controle.**
  - `uitkomst(".kipf = 1000 lbf\nF = 3 kipf\nG = F to kN", "G")` === `"13.34 kN"`
  - `uitkomst(".EUR = 1\n.USD = 0.92 EUR\nP = 100 USD to EUR", "P")` === `"92 EUR"`
    (een nieuwe basiseenheid, en het getal vast aan de eenheid zoals in het
    `.cpd`-formaat)
  - **Geen lek naar het volgende blad:** daarna geeft `uitkomst("F = 3 kipf", "F")`
    een foutmelding (een tekst die met `Error:` begint).
  - **Botsing met een bestaande eenheid:** in `.kN = 2 N` geeft de definitieregel
    een fout, en `uitkomst(".kN = 2 N\nF = 1 kN to N", "F")` === `"1000 N"`.
  - **Een getal zonder eenheid anders dan 1:** in `.dozijn = 12` geeft de
    definitieregel een fout.
  - **Aandachtspunt 2:** `parse(".5")` en `parse(".Opmerking zonder is-teken")`
    leveren dezelfde nodes als op main.
- [ ] **Stap 2: Draai de controle.** Hij faalt.
- [ ] **Stap 3: Bouw het.**
  - **Parser:** een regel die past op `^\.(IDENT)\s*=\s*(.+)$` wordt
    `eenheid-def`. Vooraf leest de parser de hele bron op zulke namen en behandelt
    die, samen met `options.eenheden`, als eenheid bij het binden van getal en
    eenheid.
  - **Evaluator:** bereken de uitdrukking in de scope en kies:
    - het getal 1 → `math.createUnit(naam)` (een nieuwe basiseenheid);
    - een waarde met eenheid → `math.createUnit(naam, waarde.toString())`;
    - een ander getal, of een naam die al een eenheid of variabele is → een
      foutregel, en er wordt geen eenheid gemaakt.
    De namen die gemaakt zijn, komen in de stand. In de `finally` van `evaluate`
    gaan ze weg met `math.Unit.deleteUnit`.
  - **Weergave:** de regel staat in beeld als `kipf = 1000 lbf`, met de naam
    rechtop als eenheid.
- [ ] **Stap 4: Draai de controle**, plus `check-opdrachten.mjs`,
  `check-eenheden.mjs` en `check-lege-invoer.mjs`: groen.
- [ ] **Stap 5: Commit.** "Rekentaal: eigen eenheden met .naam = uitdrukking (#22)".

### Taak 4: Het eenhedenstelsel, alleen in de weergave

**Bestanden:**
- Nieuw: `packages/core/src/eenheidstelsel.ts`
- Wijzigen: `packages/core/src/evaluator.ts`
  - `evaluate` bij 1325: vierde argument;
  - `uitkomstVelden` bij 2328: veld `weergave`;
  - `buildSubstitution`/`formatInline`: de ingevulde waarden;
  - `matrixUitkomst`.
- Wijzigen: `packages/core/src/types.ts` (`weergave` op de uitkomst-nodes),
  `packages/core/src/renderer.ts:316,407` (`weergave` gaat voor),
  `packages/core/src/index.ts` (export)
- Wijzigen: `scripts/lib/refcheck.mjs`: `reken(tpl, selectValues, initialScope, opties)`
- Test: `scripts/check-eenheidstelsel.mjs`, secties "Indeling", "Weergave" en "Rekenen verandert niet"

**Levert:**
- `export type Grootheid = 'lengte' | 'maat' | 'oppervlakte' | 'doorsnedeOppervlakte' | 'weerstandsmoment' | 'traagheidsmoment' | 'kracht' | 'moment' | 'lijnlast' | 'vlakbelasting' | 'spanning' | 'volumegewicht' | 'massa' | 'temperatuur'`
- `export type Stelsel = Partial<Record<Grootheid, string>>`: de eenheid per
  grootheid, in mathjs-schrijfwijze (`kip ft`, `N / mm^2`).
- `export const STELSELS: { 'si-mm': Stelsel; 'si-m': Stelsel; us: Stelsel }`,
  volgens de tabel "Sets" in het ontwerp.
- `export function grootheidVan(eenheid: string): Grootheid | null`
- `export function decimalenNa(decimalen: number, bron: string, doel: string): number`
- `export interface EvalOpties { stelsel?: Stelsel; eigenEenheden?: { naam: string; uitdrukking: string }[] }`
  (`eigenEenheden` gebruikt stap 2; hier maakt `evaluate` ze aan het begin aan en
  ruimt ze op zoals in taak 3)
- `evaluate(nodes, selectValues?, initialScope?, opties?: EvalOpties): EvaluatedNode[]`
- Op uitkomst-nodes: `weergave?: { result: string; unit: string; getoond?: string }`.
  Alleen gezet als het stelsel de waarde omrekent.

- [ ] **Stap 1: Schrijf de controle.**
  - **Indeling:** `grootheidVan` voor elke rij van de tabel in het ontwerp, in de
    schrijfwijze van `simplifyUnitString`:
    - `mm`→maat, `in`→maat, `m`→lengte, `ft`→lengte
    - `mm^2`→doorsnedeOppervlakte, `m^2`→oppervlakte
    - `mm^3`→weerstandsmoment, `mm^4`→traagheidsmoment
    - `kN`→kracht, `kN m`→moment, `kN / m`→lijnlast
    - `kN / m^2`→vlakbelasting, `psf`→vlakbelasting
    - `N / mm^2`→spanning, `MPa`→spanning, `psi`→spanning
    - `kN / m^3`→volumegewicht, `kg`→massa, `degC`→temperatuur
    - `K`→null, `K^-1`→null, `1 / s`→null
  - **Weergave**, met `STELSELS.us`, via `weergave.result` van de node:
    - `L = 4.5 m` → `"14.76 ft"`
    - `b = 4500 mm` → `"177.2 in"`
    - `M = 10 kN*m` → `"7.376 kip ft"`
    - `f = 235 N/mm^2` → `"34.08 ksi"`
    - `T = 20 degC` → `"68 degF"`
    - `dT = 20 K` → geen `weergave` (aandachtspunt 3)
    - `v = [1; 2] m` → `weergave.result` bevat "3.281", "6.562" en "ft", en geen
      "m" als eenheid (aandachtspunt 4)
    - `z = 0 mm` → `"0 in"` en `n = -4.5 m` → `"-14.76 ft"` (aandachtspunt 5)
  - **Notatie:** `x = 1234.567 mm:F2` geeft met `us` `weergave.getoond` = `"48.605 in"`.
    `decimalenNa(2, 'mm', 'in')` === 3 en `decimalenNa(2, 'in', 'mm')` === 1.
  - **Geen gemengde regel:** in `q = 0.9 kN/m\nL = 4 m\nM = q*L^2/8` bevat de
    ingevulde formule van `M` met `us` "klf" en "ft" en geen "kN".
  - **Zonder stelsel niets anders:** voor de bronnen van `balklaag` en `ligger`
    (via `laadTemplate`) geeft `render(evaluate(parse(t)))` zonder opties en met
    `{}` exact dezelfde HTML.
  - **Rekenen verandert niet:** voor dezelfde modules geeft
    `reken(tpl, {}, {}, { stelsel })` voor elk van de drie sets dezelfde `values`
    als `reken(tpl)`, ook elke UC.
- [ ] **Stap 2: Draai de controle.** Hij faalt.
- [ ] **Stap 3: Bouw het.**
  - **`grootheidVan`:** eerst op naam. Een tabel per naam, zoals `simplifyUnitString`
    hem schrijft, dekt de rijen waar de dimensie niet genoeg is: lengte en maat,
    de oppervlaktes en de drukken. Daarna op dimensie (`math.unit('1 ' + e).dimensions`)
    voor kracht, moment, lijnlast, volumegewicht en massa. Een onbekende druk
    valt op de grens van 100 kPa. Temperatuur alleen bij `degC` en `degF`.
  - **De stand:** het stelsel staat tijdens één `evaluate` in een module-variabele,
    zoals de hoekeenheid, en wordt in de `finally` teruggezet.
  - **`uitkomstVelden`:** bereken `result`, `unit`, `waarde` en `getoond` zoals nu.
    Heeft de waarde een grootheid in het stelsel, reken dan om met
    `value.to(doel)` en vul `weergave` met dezelfde opmaakfuncties. Gebruik de
    decimalen uit `decimalenNa` als er een vaste notatie is.
  - **Ingevulde formule:** gebruik de omgerekende waarde bij het opmaken van elke
    ingevulde grootheid.
  - **Renderer:** `node.weergave?.getoond ?? node.weergave?.result ?? node.getoond ?? node.result`.
- [ ] **Stap 4: Draai de controle**, plus `check-balklaag.mjs`, `check-ligger.mjs`,
  `check-matrices.mjs` en `check-formaataanduiding.mjs`: groen.
- [ ] **Stap 5: Commit.** "Rekenkern: eenhedenstelsel dat alleen de weergave omrekent".

### Taak 5: Vastleggen

**Bestanden:**
- Wijzigen: `docs/rekentaal.md` (Amerikaanse eenheden, eigen eenheden, het
  stelsel als optie van de kern)
- Wijzigen: `docs/CHANGELOG.md` onder "Nog niet uitgebracht"
- Wijzigen: `README.md:120` en `README.nl.md:122` (64 controlescripts)

- [ ] **Stap 1:** werk de drie bestanden bij. In de changelog in gebruikerstaal:
  ksi, psf, ksf, plf, klf en pcf; eigen eenheden met `.naam = uitdrukking`; psi
  niet meer als ψ.
- [ ] **Stap 2:** `npm run check`. Verwacht: alles groen, op de twee controles na
  die lokaal ook op main zakken (`check-pdf-viewer` en de werkmapcontroles in
  `check-rapport-pdf`).
- [ ] **Stap 3: Commit, push en PR** naar main, met de ontwerpcommit erin. Titel:
  "Eenheden stap 1: Amerikaanse en eigen eenheden in de rekenkern (#22)".
