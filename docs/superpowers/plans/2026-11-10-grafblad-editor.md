# Grafblad als node-editor — implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Het grafblad wordt een prettige node-editor. Er komt een catalogus links, en de nodes krijgen icoon en kleur. Je kunt meer nodes tegelijk kiezen en ze groeperen. Verder komen er losse teksten, rechtsklikmenu's, de waarde op een verbinding en een oogje voor de uitkomst.

**Architecture:**
- **Model.** Alles wat bewaard wordt, staat in het zuivere model (`graaf/model.ts`), met versie 2 van de graaf. Elke bewerking is een functie die een nieuwe graaf teruggeeft.
- **Controle.** `scripts/check-graaf.mjs` toetst die functies in Node.
- **Weergave.** Het vlak (`GraafBladWeergave.tsx`) houdt alleen schermstaat bij: de keuze, het kader, het menu en het beeld. Het roept de modelfuncties aan via `zet(...)`, zodat ongedaan maken blijft werken.
- **Beeld.** Kleuren en iconen komen alleen uit de OpenAEC Blueprint.

**Tech Stack:** TypeScript, React 18, Zustand (projectstore), three.js (3D-voorbeeld), i18next; de controlescripts draaien in Node (`node scripts/check-graaf.mjs`).

**Spec:** `docs/superpowers/specs/2026-11-10-grafblad-editor-design.md`; de schets ernaast (`…-schets.html`).

## Global Constraints

- **Volledige adoptie van de Blueprint.** Kleuren, letters, hoeken, schaduwen en iconen komen uit de Blueprint (`C:\Users\rickd\Documents\GitHub\OpenAEC-Blueprint`), ongewijzigd overgenomen. Er wordt geen icoon zelf getekend en geen kleur bedacht. Een CSS-variabele die naar een Blueprint-token verwijst, mag wel (`--graaf-kleur-invoer: var(--oa-category-1)`).
- **Groepskleuren:** invoer `--oa-category-1`, lijst `-2`, reken `-3`, logica `-4`, tekst `-5`, geometrie `-6`. Nummer 7 en 8 blijven vrij voor FEM Studio en Python.
- **Kleur van een waarde:**
  - grootheid of getal: invoer;
  - lijst: lijst;
  - geometrie: geometrie;
  - tekst: tekst;
  - waar/onwaar: logica;
  - geen waarde: `--theme-text-muted`.
- **Oude grafen.** Een graaf van versie 1 opent en rekent precies als nu. `GRAAF_VERSIE` wordt 2.
- **Ids:** nodes `n1, n2, …` (zoals nu), losse teksten `t1, t2, …`, groepen `g1, g2, …`.
- **Teksten** staan in `packages/desktop/src/i18n/locales/{nl,en}/werkruimte.json` onder `graaf.*`, altijd in beide talen.
- **Ctrl** is op macOS Cmd: `e.ctrlKey || e.metaKey`.
- **localStorage** alleen binnen try/catch, zoals in `store/spreadsheetEditor.ts`.
- **De bediening.** Het commentaarblok "Bediening" bovenaan `GraafBladWeergave.tsx` en de tekst `graaf.hint` beschrijven na elke taak wat er dan geldt.
- **Per taak een kleine PR vanaf main.**
  - Mergen alleen op verzoek van de gebruiker.
  - Nooit force-pushen naar main.
  - `public/__meet/project.json` nooit committen.
  - Commits eindigen met `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; een PR-tekst eindigt met `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
- **Geen namen van andere rekensoftware** in code, commentaar, commits of PR-teksten, en geen verwijzing naar gesprekken met een assistent.
- **De draaiende app van de gebruiker.** Een wijziging aan `store/projectStore.ts` of de i18n-JSON herlaadt de app. Doe zulke wijzigingen per taak in één keer.
- **Proeven in Tauri** alleen met een eigen identifier (`studio.openstructuralcalculation.proef`), en maak eerst een kopie van `preferences.json`.
- **Controles.** `npm run check` heeft twee bekende fouten in `check-rapport-pdf` op main ("werkmap van 150 rijen", "de afbeelding uit de tekst"). Die tellen niet als regressie. Draai `npm run check` op de achtergrond met de uitvoer naar een logbestand, want het duurt langer dan tien minuten.
- **README.** Komt er een controlescript bij, dan gaat het aantal in `README.md` én `README.nl.md` omhoog. Dit plan voegt geen script toe.

## Review Focus

- **Een vreemd klembord plakken** (gewone tekst, JSON van iets anders, een kapotte graaf): er gebeurt niets en er is geen fout. Test `plak_vreemd_klembord` (Task 3).
- **Plakken met verbindingen naar buiten het stuk, en ids die al bestaan:** alle ids zijn nieuw, alleen de interne verbindingen gaan mee en groepen houden hun leden. Test `plak_nieuwe_ids` (Task 3).
- **Alle leden van een groep verwijderen:** de groep verdwijnt. Een groep met een paar leden weg houdt de rest. Test `verwijder_leden_groep` (Task 3).
- **Een graaf van versie 1 zonder de nieuwe velden:** hij leest en rekent gelijk, en het oogje volgt de standaard per soort. Test `versie1_onveranderd` (Task 3).
- **Een ingeklapte groep met verbindingen naar buiten:** op het scherm en op papier lopen de lijnen naar de rand van de groepskaart, niet naar een verborgen node. Test `ingeklapt_lijnen_naar_kaart` (Task 8).

---

### Task 1: Tokens en letters gelijk aan de Blueprint

**Files:**
- Modify: `packages/desktop/src/openaec/openaec-tokens.css`, `packages/desktop/src/openaec/openaec-fonts.css` (en de woff2-bestanden in `packages/desktop/src/openaec/fonts/` als de Blueprint er andere heeft).

**Interfaces:** geen.

- [ ] **Stap 1: Verschil bekijken.** `diff <(tail -n +2 packages/desktop/src/openaec/openaec-tokens.css) ../OpenAEC-Blueprint/web/openaec-tokens.css`, en hetzelfde voor fonts. Verwacht: in de tokens alleen het lichte thema (`--oa-frame`, `--oa-docbar`, `--oa-text`, `--oa-text-muted`, `--oa-border`). In de fonts alleen kop en opmaak. Zie je meer, noem het in de PR.
- [ ] **Stap 2: Overnemen.** Neem beide bestanden ongewijzigd over uit `web/` van de Blueprint. Houd de eerste regel van de app (`/* Copied from web/ by scripts/sync_tauri_template.py; do not edit here. */`). De url's naar `fonts/…woff2` moeten blijven kloppen.
- [ ] **Stap 3: Controleren.** `npm run check` op de achtergrond. Verwacht: alleen de twee bekende PDF-fouten. Start `calcsheet-dev` (preview_start) en maak een schermafdruk van het lichte thema, het donkere thema en een afdrukvoorbeeld.
- [ ] **Stap 4: Commit en PR** "Kleuren en letters gelijk aan de Blueprint". Vermeld in de PR-tekst dat het lichte thema van crème naar neutraal grijs gaat en dat dat na de merge meteen op de site staat.

---

### Task 2: Categoriekleuren in de Blueprint, en de sprite van het grafblad

Dit gebeurt in twee repo's. De Blueprint heeft eigen afspraken (`AGENTS.md` daar):
- eerst je werk claimen in `NOTES.md`;
- commitberichten in het Engels;
- committen alleen op verzoek van de gebruiker;
- **nooit pushen**: dat doet de gebruiker zelf.

**Files (Blueprint):**
- Modify: `design/ontwerp-0.4/tokens-0.4.json`, `scripts/check_tokens_04.py`, `NOTES.md`.
- Laat de generator zijn uitvoer schrijven: `web/openaec-tokens.css` en `crates/openaec-ui/src/design/tokens.rs`.
- Create: `design/ontwerp-0.4/categorie-review.html`.

**Files (app):**
- Modify: `packages/desktop/src/openaec/openaec-tokens.css`, `packages/desktop/src/components/ribbon/calcIcons.ts` (type `Sprite` krijgt `"graaf"`).
- Create: `packages/desktop/public/icons/graaf.svg`.
- Test: `scripts/check-graaf.mjs`, nieuwe sectie "Iconen".

**Interfaces:**
- Produces:
  - de tokens `--oa-category-1` … `--oa-category-8` in elk thema;
  - de sprite `graaf` met de symbolen `i16-<id>` en `i24-<id>` voor de ids hieronder;
  - `export const GROEP_ICOON: Record<NodeDef["groep"], string>` in `graaf/nodes.ts`;
  - `NodeDef.icoon?: string` (een Blueprint-id);
  - `export function nodeIcoon(soort: string): string` (het eigen icoon, anders dat van de groep, en bij een onbekende soort `status.warning`).

- [ ] **Stap 1: Claimen** in `NOTES.md` van de Blueprint, onder *Nu bezig*.
- [ ] **Stap 2: Kleuren voorstellen.** Zet in `themes.<thema>.color` van alle vijf thema's `category-1` … `category-8` als hexkleur zonder doorzichtigheid. Elke kleur moet onderscheidbaar zijn van de status- en accentkleur van dat thema. In hoog contrast mogen ze feller.
- [ ] **Stap 3: Contrast eisen** in `check_tokens_04.py` (`PAIRS`). Per thema moet elke `category-n` minstens 3,0:1 halen:
  - tegen `panel` (de node);
  - tegen `workspace` (het vlak);
  - tegen `text-on-accent`, de kleur van het icoon in het vierkantje.
- [ ] **Stap 4: Genereren en toetsen.** `python scripts/generate_tokens_04.py`, daarna `python scripts/check_tokens_04.py` en `python scripts/generate_tokens_04.py --check`. Verwacht: geen problemen.
- [ ] **Stap 5: Laten zien.** Maak `categorie-review.html`: per thema de acht kleuren, en een node in stijl A per groep zoals in de schets. Open hem in de browser, laat hem de gebruiker zien en vraag om goedkeuring. Vraag daarbij ook welk versienummer de tokens krijgen; 0.4.0 is vastgesteld, dus het wordt een nieuwe versie. **Wacht hier.** Task 3 en Task 4 kunnen intussen door.
- [ ] **Stap 6: Committen** in de Blueprint, alleen als de gebruiker dat vraagt, met bijvoorbeeld het bericht `Add category colors for node groups`. Niet pushen. Werk `NOTES.md` bij: claim weg en een regel in het logboek.
- [ ] **Stap 7: Overnemen in de app.** Neem `web/openaec-tokens.css` ongewijzigd over, zoals in Task 1.
- [ ] **Stap 8: Sprite maken.** Maak `graaf.svg` met de `<symbol>`-elementen (16 en 24 px) ongewijzigd uit de sprites in `web/icons/`. Zet bovenaan in een commentaar per id de bronsprite.
  - Groepen:
    - invoer `form.field-group`;
    - lijst `view.list`;
    - reken `budget.add-formula`;
    - logica `field.checkbox`;
    - tekst `draw.text`;
    - geometrie `draw.polyline`.
  - Nodes: codeblok `category.code`, lijn `draw.line`.
  - Bediening: `object.show`, `object.hide`, `selection.box`, `list.group-by`, `draw.note`, `view.search`, `view.orbit`, `edit.delete`, `edit.copy`, `ui.more`, `status.warning`.
  - Neem een ander passend id als dat er is, maar noteer het.
- [ ] **Stap 9: De test schrijven** (sectie "Iconen" in `check-graaf.mjs`). Elk id uit `GROEP_ICOON`, elk `NodeDef.icoon` en de bedieningsiconen hierboven staat als `id="i16-<id>"` én `id="i24-<id>"` in `packages/desktop/public/icons/graaf.svg`. Draai hem: hij faalt.
- [ ] **Stap 10: Bouwen.** Maak `GROEP_ICOON`, `NodeDef.icoon` en `nodeIcoon` in `graaf/nodes.ts`, en voeg `"graaf"` toe aan het type `Sprite`. Draai de test: hij slaagt.
- [ ] **Stap 11: Commit en PR (app)** "Categoriekleuren en iconen voor het grafblad".

---

### Task 3: Model versie 2 en het projectbestand

**Files:**
- Modify: `packages/desktop/src/graaf/model.ts`, `packages/desktop/src/graaf/rekenen.ts`, `packages/desktop/src/graaf/waarde.ts`, `packages/desktop/src/graaf/nodes.ts`.
- Modify (kern):
  - `packages/core/src/ifc-generator.ts` (`GraafGegevens`);
  - `packages/core/src/ifcx/document.ts` (`graafAttribuut`, `graafUitAttribuut`);
  - `packages/core/src/ifcx/namespace.ts` (het schema `[ATTR.graaf]`).
- Create: `packages/desktop/src/graaf/klembord.ts`.
- Test: `scripts/check-graaf.mjs`, nieuwe secties.

**Interfaces (Produces), in `graaf/model.ts`:**

```ts
interface GraafNode { /* zoals nu */ verborgen?: boolean; uit?: true; schuif?: true }
interface GraafVerbinding { /* zoals nu */ label?: true }
interface GraafGroep { id: string; naam: string; leden: string[]; ingeklapt?: true }
interface GraafTekst { id: string; x: number; y: number; breedte: number; titel?: string; tekst: string }
interface Graaf { versie: number; nodes: GraafNode[]; verbindingen: GraafVerbinding[]; groepen?: GraafGroep[]; teksten?: GraafTekst[] }
/** Een stuk graaf om te kopiëren en te plakken. */
interface GraafStuk { nodes: GraafNode[]; verbindingen: GraafVerbinding[]; teksten: GraafTekst[]; groepen: GraafGroep[] }

uitkomstVerborgen(node: GraafNode): boolean            // standaard: true bij getal, tekst, waarOnwaar; bekijken altijd false
zetVerborgen(g: Graaf, ids: readonly string[], verborgen: boolean): Graaf
zetUit(g: Graaf, ids: readonly string[], uit: boolean): Graaf
wisselLabel(g: Graaf, naarNode: string, naarPoort: string): Graaf
zetSchuif(g: Graaf, id: string, open: boolean): Graaf
verplaatsKeuze(g: Graaf, ids: readonly string[], dx: number, dy: number): Graaf      // nodes en teksten
verwijderKeuze(g: Graaf, ids: readonly string[]): Graaf   // nodes, teksten, hun verbindingen; uit groepen; lege groep weg
kopieerKeuze(g: Graaf, ids: readonly string[]): GraafStuk // alleen interne verbindingen; groep alleen als al zijn leden meegaan
plak(g: Graaf, stuk: GraafStuk, x: number, y: number): { graaf: Graaf; ids: string[] }  // nieuwe ids; linksboven van het stuk op (x, y)
dupliceer(g: Graaf, ids: readonly string[]): { graaf: Graaf; ids: string[] }            // kopieer + plak, 20 px verschoven
groepeer(g: Graaf, ids: readonly string[], naam: string): { graaf: Graaf; id: string }  // haalt de ids uit hun oude groep
hefGroepOp(g: Graaf, groep: string): Graaf
zetGroepNaam(g: Graaf, groep: string, naam: string): Graaf
wisselIngeklapt(g: Graaf, groep: string): Graaf
groepVan(g: Graaf, id: string): GraafGroep | undefined
voegTekstToe(g: Graaf, x: number, y: number): { graaf: Graaf; id: string }   // breedte 240, tekst ""
zetTekst(g: Graaf, id: string, wat: { titel?: string; tekst?: string; breedte?: number }): Graaf
```

- De leden van een groep heten overal `leden`: in het model, de IFCX en het schema.
- De volgorde van de taken wijkt af van "Volgorde" in het spec: het model komt als eigen PR vóór de bediening, zodat het projectbestand de nieuwe velden al bewaart.
- In `graaf/klembord.ts`:
  - `stukAlsTekst(s: GraafStuk): string` geeft JSON met de sleutel `"ocss-graafstuk": 1`;
  - `leesStuk(tekst: string): GraafStuk | null` geeft `null` bij alles wat niet zo'n stuk is; het stuk zelf ruimt hij op zoals `leesGraaf`.
- In `graaf/waarde.ts`: `type WaardeSoort = "grootheid" | "lijst" | "geometrie" | "tekst" | "waarOnwaar"` en `waardeSoort(w: Waarde): WaardeSoort | null`.
- In `graaf/rekenen.ts`: een node met `uit` krijgt `{ waarden: {}, fouten: [], meldingen: [{ code: "uitgeschakeld", gegevens: {} }] }` en rekent niet.

- [ ] **Stap 1: De tests schrijven** in `check-graaf.mjs`. Gebruik de bestaande helper `bouw()`.
  - `versie1_onveranderd`: de voorbeeldgraaf uit sectie "Opslaan en heropenen" als JSON met `versie: 1`, door `leesGraaf`.
    - Hij heeft dezelfde nodes en verbindingen en geen `groepen` of `teksten`.
    - `rekenGraaf` geeft dezelfde `waarden` als het origineel.
    - `uitkomstVerborgen` is `true` voor de `getal`-node en `false` voor `codeblok` en `bekijken`.
  - `lezen_v2`: een graaf met twee groepen, twee teksten, `verborgen`, `uit`, `label` en `schuif` komt via `leesGraaf(JSON.parse(JSON.stringify(g)))` gelijk terug. `leesGraaf` ruimt op:
    - een groep met een onbekend id houdt alleen de bekende leden;
    - een groep zonder leden valt weg;
    - een node in twee groepen blijft alleen in de eerste.
  - `verwijder_leden_groep`: een groep `{n1, n2, t1}`.
    - `verwijderKeuze([n1])` laat de groep met `{n2, t1}` en haalt de verbindingen van n1 weg.
    - `verwijderKeuze([n2, t1])` daarna laat geen groep meer over.
  - `kopieer_intern`: a→b→c, kies `[a, b]`. Het stuk heeft één verbinding (a→b), niet b→c.
  - `plak_nieuwe_ids`: plak het stuk van hierboven twee keer.
    - Alle ids zijn nieuw en uniek (`n4`… na `n3`).
    - De verbinding loopt tussen de nieuwe ids.
    - Linksboven van het stuk ligt op (x, y).
    - Een gekopieerde groep met al zijn leden komt mee, met de nieuwe ids als leden.
  - `plak_vreemd_klembord`: `leesStuk` geeft `null` voor `"hallo"`, `"{}"`, `'{"nodes":[]}'` (zonder sleutel) en `'{"ocss-graafstuk":1,"nodes":"x"}'`.
  - `dupliceer_verschuift`: de nieuwe nodes liggen 20 px rechts en 20 px lager.
  - `groepeer_haalt_uit_oude`: groepeer `[a, b]` en daarna `[b, c]`. b zit nu alleen in de tweede groep, en de eerste groep heeft alleen a.
  - `uit_rekent_niet`: getal(5) → codeblok `y = x * 2`. Met het codeblok uit:
    - de uitkomst van het codeblok heeft geen waarden en de melding `uitgeschakeld`;
    - een bekijk-node erachter heeft de fout `ingangZonderWaarde`.
    - Met het getal uit heeft het codeblok `ingangZonderWaarde`.
  - `waardesoort`: `waardeSoort` geeft:
    - `grootheid` voor een mathjs-eenheid en voor `5`;
    - `lijst` voor `[1, 2]`;
    - `geometrie` voor een punt;
    - `tekst` voor `"a"`;
    - `waarOnwaar` voor `true`;
    - `null` voor `undefined`.
  - `projectbestand_v2`: breid sectie "Opslaan en heropenen" uit met de graaf van `lezen_v2`. Na `projectIfcx` → `leesProjectBestand` zijn groepen, teksten en de nieuwe velden gelijk.
- [ ] **Stap 2: Draaien.** `npm --prefix packages/core run build && node scripts/check-graaf.mjs`. Verwacht: deze tests falen (onbekende functies, of groepen kwijt in het projectbestand).
- [ ] **Stap 3: Model bouwen.** Maak de functies hierboven in `model.ts`, `klembord.ts`, `waarde.ts` en `rekenen.ts`. Laat `leesGraaf` de nieuwe velden lezen. `nieuweNodeId` blijft voor nodes; teksten (`t`) en groepen (`g`) krijgen elk zo'n functie.
- [ ] **Stap 4: De kern bijwerken.**
  - `GraafGegevens` krijgt de nieuwe velden.
  - `graafAttribuut`/`graafUitAttribuut` nemen ze mee: `groepen`, `teksten`, en per node `verborgen`, `uit`, `schuif`, per verbinding `label`.
  - Breid het schema `[ATTR.graaf]` uit met `opt(...)` voor elk nieuw veld: `groepen: opt(lijst(object({ id: TEKST, naam: TEKST, leden: lijst(TEKST), ingeklapt: opt(JANEE) })))`, met hetzelfde patroon voor `teksten`. Per node komen `verborgen`, `uit` en `schuif` erbij als `opt(JANEE)`, per verbinding `label`.
- [ ] **Stap 5: Draaien.** `npm --prefix packages/core run build && node scripts/check-graaf.mjs`, daarna `node scripts/check-ifcx.mjs`. Verwacht: alles slaagt.
- [ ] **Stap 6: `npm run check`** op de achtergrond. Verwacht: alleen de twee bekende PDF-fouten.
- [ ] **Stap 7: Commit en PR** "Grafblad: model versie 2 (groepen, teksten, keuze, uitschakelen)".

---

### Task 4: Kiezen en bewerken op het vlak

**Files:**
- Modify: `packages/desktop/src/components/graaf/GraafBladWeergave.tsx`, `graafAchtergrond.ts`, `GraafNodeKaart.tsx`, `GraafBlad.css`.
- Modify: de i18n-JSON (`graaf.hint`, `graaf.draaien`, `graaf.draaienUitleg`).

**Interfaces:**
- Consumes: uit Task 3 `verplaatsKeuze`, `verwijderKeuze`, `kopieerKeuze`, `plak`, `dupliceer`, `stukAlsTekst`, `leesStuk`.
- Produces:
  - In `GraafBladWeergave.tsx` wordt de schermstaat `gekozen` een `Set<string>` met ids van nodes en teksten, plus `lijn: { naarNode; naarPoort } | null` voor één gekozen verbinding.
  - `GraafAchtergrond.zetDraaien(aan: boolean): void` (zet `controls.enabled`).
  - `NodeActies.beginSlepen(e, node)` sleept nu alle gekozen ids.

- [ ] **Stap 1: Draaien begrenzen.** Maak `zetDraaien`. Het vlak zet het in een pointerdown-luisteraar in de capture-fase, vóór OrbitControls hem ziet: draaien mag als `e.altKey || draaiStand`.
- [ ] **Stap 2: Het kader.** Links slepen op een lege plek, zonder Alt en zonder draaistand, tekent een kader (`.graaf-kader`, accentkleur gestippeld).
  - Bij loslaten kiest het de nodes en teksten die er helemaal in liggen. Rond de kaarten gaat het met `offsetWidth`/`offsetHeight`, zoals `passend()` dat doet.
  - Met Shift kiest het erbij.
  - Een klik zonder te slepen op leeg maakt de keuze leeg.
  - Het kader rekent met `opVlak`, dus het klopt ook bij een andere zoom.
- [ ] **Stap 3: Ctrl+klik** op een node of tekst zet hem in of uit de keuze. Een gewone klik kiest alleen hem, behalve op een node die al gekozen is: dan begint slepen met de hele keuze.
- [ ] **Stap 4: Samen slepen.** Slepen verschuift alle gekozen ids. Tijdens het slepen staat de verschuiving in de schermstaat; bij loslaten gaat `verplaatsKeuze` één keer naar het project.
- [ ] **Stap 5: Toetsen.**
  - Ctrl+A kiest alles, Escape niets, Delete/Backspace roept `verwijderKeuze` aan, of `ontkoppel` voor een gekozen lijn.
  - Ctrl+D roept `dupliceer` aan; daarna is het nieuwe gekozen.
  - Kopiëren, knippen en plakken gaan via de events `copy`, `cut` en `paste` op het vlak, met `clipboardData` en `text/plain`, zoals `spreadsheetKlembord.ts`. Plakken komt rond de laatste muisplek op het vlak; een `leesStuk` die `null` geeft, doet niets.
  - Geen van deze toetsen werkt in een INPUT of TEXTAREA.
- [ ] **Stap 6: De knop "3D draaien"** in `.graaf-balk`, met icoon `view.orbit` uit de sprite `graaf` en `aria-pressed`. De stand is schermstaat en standaard uit.
- [ ] **Stap 7: Bediening en hint.** Werk het commentaar "Bediening" en `graaf.hint` in nl en en bij.
- [ ] **Stap 8: Controleren in de dev-app.** `calcsheet-dev`, een grafblad met "Voorbeeld laden". Maak een schermafdruk per stap:
  - een kader om drie nodes, ook bij zoom 0,5;
  - Ctrl+klik;
  - samen slepen, daarna Ctrl+Z (één stap terug);
  - Ctrl+D;
  - Ctrl+C, en Ctrl+V in een tweede grafblad;
  - Delete;
  - Alt+slepen draait het voorbeeld; de knop "3D draaien" aan, dan draait gewoon slepen ook.
  - In de console geen fouten.
- [ ] **Stap 9: `npm run check`** op de achtergrond en `npx tsc -p packages/desktop --noEmit`. Daarna commit en PR "Grafblad: meer nodes kiezen, kopiëren en plakken".

---

### Task 5: Het beeld van de node (stijl A)

**Files:**
- Modify: `packages/desktop/src/components/graaf/GraafNodeKaart.tsx`, `GraafBlad.css`, `GraafBladWeergave.tsx` (kleur van de lijnen).
- Modify: `packages/desktop/src/graaf/nodes.ts` (`KOP_HOOGTE` 34), `packages/desktop/src/graaf/papier.ts`, de i18n-JSON.

**Interfaces:**
- Consumes: uit Task 2 `nodeIcoon` en `GROEP_ICOON`; uit Task 3 `uitkomstVerborgen`, `zetVerborgen`, `zetSchuif`, `waardeSoort`.
- Produces: `NodeActies.zetVerborgen(ids: string[], verborgen: boolean)` en `NodeActies.zetSchuif(id, open)`.

- [ ] **Stap 1: Papier-test schrijven** in de sectie "Papier" van `check-graaf.mjs`:
  - `papier_verborgen`: een codeblok met `verborgen: true` heeft geen voorbeeldregel in de SVG, maar wel zijn naam.
  - `papier_getal_compact`: een getal-node toont op papier "5 kN/m" en niet de woorden min/max/stap.
  - `kop_hoogte`: `poortPlek` geeft voor de eerste rij `y = node.y + 34 + 13`.
  Draai: ze falen.
- [ ] **Stap 2: Papier en `KOP_HOOGTE`.** Zet `KOP_HOOGTE` op 34 en laat `papier.ts` het oogje en de compacte getal-node volgen. Draai: de tests slagen.
- [ ] **Stap 3: De kaart in stijl A**, zoals de schets:
  - een streepje van 2 px in `var(--graaf-kleur-<groep>)`;
  - in de kop een icoon (`<Icoon id={nodeIcoon(node.soort)} uit="graaf" />`) in een vierkantje in de groepskleur;
  - de naam vet, met eronder klein de soort als de node een eigen naam heeft;
  - het oogje rechts (`object.show`/`object.hide`); niet bij `bekijken`;
  - de × gaat weg;
  - rand en gloed in de accentkleur als hij gekozen is, de rand in `--oa-error` bij een fout.
  - Zet de groepskleuren in `GraafBlad.css` als variabelen die naar `--oa-category-n` wijzen.
- [ ] **Stap 4: Poort- en lijnkleur** uit `waardeSoort` van de waarde op die uitgang (`uitkomst.nodes[id].waarden[poort]`). Een ingang krijgt de kleur van wat eraan hangt.
- [ ] **Stap 5: Het oogje.**
  - Klik op het oogje of H (op de keuze) roept `zetVerborgen` aan.
  - Is de uitkomst verborgen, dan valt het blok `.graaf-voorbeeld` weg. Fouten blijven staan.
- [ ] **Stap 6: Compacte getal-node.**
  - In de rij van de uitgang staan het veld voor de waarde en het veld voor de eenheid.
  - Een knopje "schuif" (`aria-expanded`) zet `schuif`. Alleen dan staan de schuif en min/max/stap eronder.
- [ ] **Stap 7: Controleren in de dev-app** met de voorbeeldgraaf. Maak schermafdrukken in licht, donker en blueprint:
  - de kleuren per groep;
  - een lijn met een lijst in de kleur van lijst;
  - het oogje aan en uit;
  - de schuif open en dicht;
  - het afdrukvoorbeeld van het blad.
- [ ] **Stap 8: `npm run check`** en tsc. Daarna commit en PR "Grafblad: nodes met icoon, kleur en oogje".

---

### Task 6: De catalogus

**Files:**
- Create: `packages/desktop/src/components/graaf/GraafCatalogus.tsx`, `packages/desktop/src/components/graaf/zoekNodes.ts`, `packages/desktop/src/graaf/recent.ts`.
- Modify: `GraafZoekmenu.tsx` (gebruikt `zoekNodes`), `GraafBladWeergave.tsx`, `GraafBlad.css`, de i18n-JSON (`graaf.catalogus.*`).
- Test: `scripts/check-graaf.mjs`, sectie "Catalogus".

**Interfaces:**
- `zoekNodes(zoek: string, t: (k: string) => string, anders: (k: string) => string): NodeSoort[]` zoekt op de soort, `graaf.soort.*`, `graaf.uitleg.*` en de naam in de andere taal. Alle woorden moeten passen. De volgorde is de groepsvolgorde, zoals nu in het zoekmenu.
- `leesRecent(): string[]` en `voegRecentToe(soort: string): void`:
  - localStorage-sleutel `ocss.graaf.recent`;
  - nieuwste eerst, hooguit 5, zonder dubbele.
- `GraafCatalogus({ onKies(soort), open, onWissel })`. Slepen geeft `dataTransfer` met type `application/x-ocss-node` en als waarde de soort.

- [ ] **Stap 1: Tests schrijven**, met een nep-`t` die de sleutels uit `nl/werkruimte.json` en `en/werkruimte.json` leest:
  - `zoek_som`: `zoekNodes("som", tNl, tEn)` bevat `som`.
  - `zoek_twee_woorden`: `zoekNodes("tekst lengte", …)` bevat `tekstLengte` en niet `som`.
  - `zoek_andere_taal`: `zoekNodes("sum", tNl, tEn)` bevat `som`.
  - `zoek_leeg_alles`: `zoekNodes("", …)` heeft de lengte van `NODE_SOORTEN`.
  - `recent`: met een nep-`localStorage` in `globalThis` en drie keer `voegRecentToe` met a, b, a is `leesRecent()` `["a", "b"]`. Zonder localStorage (een getter die gooit) geeft het `[]` zonder fout.
  Draai: ze falen.
- [ ] **Stap 2: Bouwen.** Maak `zoekNodes.ts` en `recent.ts`, en laat `GraafZoekmenu` `zoekNodes` gebruiken. Draai: de tests slagen.
- [ ] **Stap 3: Het paneel.**
  - Links in de weergave, ongeveer 250 px. Het vlak wordt smaller, de schaal blijft.
  - Of het open staat, bewaart de app in localStorage (`ocss.graaf.catalogus`); de knop in de balk zet het open en dicht.
  - Bovenaan het zoekveld; Ctrl+F zet de cursor erin.
  - Daaronder Recent en de groepen. Elke groep heeft een kop met icoon, naam en aantal, en is in en uit te klappen.
  - Een regel heeft icoon en naam. Bij de aangewezen regel staat `graaf.uitleg.<soort>` eronder.
  - Toevoegen:
    - door slepen: `onDrop` op het vlak zet de node op `opVlak(clientX, clientY)`;
    - met Enter of een dubbelklik: midden in beeld, of rechts naast de enige gekozen node.
  - Elke toevoeging roept `voegRecentToe` aan, ook die uit het zoekmenu.
- [ ] **Stap 4: Controleren in de dev-app.** Maak schermafdrukken van:
  - "getal" zoeken;
  - een node naar het vlak slepen;
  - Enter;
  - Recent na drie toevoegingen;
  - het paneel dicht en weer open na herladen.
- [ ] **Stap 5: `npm run check`** en tsc. Daarna commit en PR "Grafblad: catalogus met zoeken".

---

### Task 7: Menu's, de waarde op de lijn en uitschakelen

**Files:**
- Create: `packages/desktop/src/components/graaf/GraafMenu.tsx`.
- Modify: `GraafBladWeergave.tsx`, `GraafNodeKaart.tsx` (uitgeschakeld), `GraafBlad.css`, `graaf/nodes.ts` (`verbindingMidden`), `graaf/papier.ts`, `components/graaf/graafTeksten.ts`, de i18n-JSON (`graaf.menu.*`, `graaf.fout.uitgeschakeld`).
- Test: `scripts/check-graaf.mjs`.

**Interfaces:**
- `GraafMenu({ x, y, titel?, items, onSluit })`, met `items: ({ tekst: string; toets?: string; actie: () => void; gevaar?: true } | "streep")[]`. Hij sluit bij Escape, bij een klik ernaast en na een keuze, en blijft binnen het vlak.
- `verbindingMidden(a: {x,y}, b: {x,y}): {x,y}` is het punt op t = 0,5 van `verbindingPad`.
- Consumes: uit Task 3 `zetUit`, `wisselLabel`, `uitkomstVerborgen`/`zetVerborgen`, `dupliceer`, `groepeer` (het menu-item Groeperen komt pas in Task 8), `verwijderKeuze`.

- [ ] **Stap 1: Tests schrijven.**
  - `midden_recht`: `verbindingMidden({x:0,y:0},{x:100,y:0})` is `{x:50,y:0}`.
  - `midden_s`: voor `(0,0)` en `(100,40)` is het midden `(50, 20)`.
  - `papier_label`: getal 5 kN/m → codeblok, met `label` op die verbinding. De SVG bevat `esc(waardeTekst(waarde))` van de waarde op die lijn; zonder `label` niet.
  - `papier_uit`: een node met `uit` krijgt in de SVG de grijze vulling (`KLEUR.zacht`) en de melding `uitgeschakeld`.
  Draai: ze falen.
- [ ] **Stap 2: Bouwen.** Maak `verbindingMidden` en de papierdelen. Draai: de tests slagen.
- [ ] **Stap 3: Het menu.** Rechtsklik opent het menu. Rechts slepen schuift pas na 4 px beweging; daaronder is het een klik. Rechtsklik op iets dat niet gekozen is, kiest eerst alleen dat. Per doel, met de teksten uit het spec:
  - **Node:** Hernoemen (F2) · Uitkomst tonen/verbergen (H) · Uitschakelen/Inschakelen · Dupliceren (Ctrl+D) · Uitleg bij deze node · Verwijderen (Del, `gevaar`).
  - **Verbinding:** Waarde op de lijn tonen/verbergen · Node ertussen · Verwijderen.
  - **Lege plek:** Node toevoegen · Plakken · Alles kiezen · Passend in beeld.
- [ ] **Stap 4: Wat de menu-items doen.**
  - "Uitleg bij deze node" opent de catalogus met die soort aangewezen.
  - "Node ertussen" opent het zoekmenu op het midden van de lijn. De nieuwe node komt ertussen: de oude verbinding gaat naar zijn eerste ingang, zijn eerste uitgang naar het oude doel.
  - F2 begint het hernoemen; dat werkt nu met een dubbelklik op de titel.
- [ ] **Stap 5: De waarde op de lijn.**
  - Bij een rechtsklik op een lijn staat meteen een label op `verbindingMidden`, met `waardeTekst` (kort) in de kleur van de waarde. Het label blijft tot het menu sluit.
  - Een lijn met `label` toont het label altijd.
- [ ] **Stap 6: Uitgeschakeld** op de kaart: half doorzichtig, met een streep door het icoon, en de melding `graaf.fout.uitgeschakeld`.
- [ ] **Stap 7: Controleren in de dev-app.** Schermafdrukken van elk menu en elke actie; daarna ongedaan maken.
- [ ] **Stap 8: `npm run check`** en tsc. Daarna commit en PR "Grafblad: rechtsklikmenu's, waarde op de lijn, uitschakelen".

---

### Task 8: Groepen en losse tekst

**Files:**
- Create: `packages/desktop/src/graaf/groepen.ts`, `packages/desktop/src/components/graaf/GraafGroepKader.tsx`, `packages/desktop/src/components/graaf/GraafTekstBlok.tsx`.
- Modify: `GraafBladWeergave.tsx`, `graaf/papier.ts`, `GraafBlad.css`, de i18n-JSON (`graaf.groep.*`, `graaf.tekstblok.*`).
- Test: `scripts/check-graaf.mjs`.

**Interfaces:**
- `groepKader(g: GraafGroep, maten: Map<string, { x: number; y: number; b: number; h: number }>): { x: number; y: number; b: number; h: number } | null`:
  - om de leden heen, 16 px marge, 30 px voor de titel;
  - `null` zonder leden met een maat.
- `ingeklaptKaart(g, maten)` geeft de plek en maat van de kaart van een ingeklapte groep: 200 × 56 px, linksboven op die van het kader.
- `zichtbarePoortPlek(graaf, node, poorten, kant, naam, maten)` werkt als `poortPlek`. Zit de node in een ingeklapte groep, dan geeft hij de rand van de kaart: links voor een ingang, rechts voor een uitgang, verticaal in het midden.
- Consumes: uit Task 3 `groepeer`, `hefGroepOp`, `zetGroepNaam`, `wisselIngeklapt`, `groepVan`, `voegTekstToe`, `zetTekst`, `verwijderKeuze`, `kopieerKeuze`.

- [ ] **Stap 1: Tests schrijven.**
  - `kader_om_leden`: twee leden op (0,0,100,50) en (200,100,100,50) geven het kader (-16, -46, 332, 212).
  - `kader_leeg`: een groep zonder bekende maten geeft `null`.
  - `ingeklapt_lijnen_naar_kaart`: een → b, met b in een ingeklapte groep. `zichtbarePoortPlek` voor de ingang van b ligt op de linkerrand van de kaart en niet op b. In de SVG van `graafSvg` staat b niet, maar de groepsnaam en een pad naar die rand wel.
  - `papier_groep_tekst`: de SVG bevat de groepsnaam, het kader, de titel van een tekstblok (vet) en zijn tekst.
  Draai: ze falen.
- [ ] **Stap 2: Bouwen.** Maak `groepen.ts` en de papierdelen. Op papier komen de maten uit `tekenNode`. Draai: de tests slagen.
- [ ] **Stap 3: Groepen op het vlak.**
  - Het kader ligt onder de nodes, in de accentkleur, zacht.
  - De titel is met een dubbelklik te bewerken, en na Ctrl+G meteen.
  - Het pijltje klapt in en uit.
  - Slepen aan de titel verschuift de groep met inhoud.
  - Een klik op de titel kiest alle leden.
  - Een ingeklapte groep is een kaart met de titel en het aantal leden. Lijnen lopen via `zichtbarePoortPlek`.
  - Ctrl+G groepeert de keuze (twee of meer) en Ctrl+Shift+G heft de groep op.
- [ ] **Stap 4: Losse tekst.**
  - T of "Tekst hier" maakt een blok op de muisplek, meteen in bewerking.
  - Het blok heeft een titel (één regel, vet) en tekst (een textarea die meegroeit).
  - De breedte is te slepen aan de rechterrand, met een minimum van 120 px.
  - Kiezen, slepen, kopiëren en groeperen werken zoals bij een node.
- [ ] **Stap 5: Menu's aanvullen.**
  - Bij een node komt Groeperen (Ctrl+G) erbij.
  - **Groep:** Hernoemen · Inklappen/Uitklappen · Groep opheffen · Verwijderen met inhoud.
  - **Tekst:** Bewerken · Verwijderen.
  - **Lege plek:** Tekst hier.
- [ ] **Stap 6: Bediening.** Het commentaar en `graaf.hint` noemen nu Ctrl+G en T.
- [ ] **Stap 7: Controleren in de dev-app.** Schermafdrukken van:
  - groeperen;
  - de titel bewerken;
  - de groep slepen;
  - inklappen met lijnen naar buiten;
  - een tekstblok maken en breder maken;
  - kopiëren en plakken met de groep;
  - opslaan, opnieuw openen en alles is er nog;
  - het afdrukvoorbeeld.
- [ ] **Stap 8: `npm run check`** en tsc. Daarna commit en PR "Grafblad: groepen en losse tekst".
