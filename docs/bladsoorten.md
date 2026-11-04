# Bladsoorten in de afdruk

Een blad dat niet rekent (een PDF, een werkmap, een Markdown-tekst) heeft geen
rekentekst en geen invoer, maar komt wel in de uitdraai en het rapport. Zo'n soort
meldt zich op één plek aan: `SOORTEN` in
[`components/calc/bladSoorten.tsx`](../packages/desktop/src/components/calc/bladSoorten.tsx).
De losse uitdraai (`PrintBlad`), het rapport (`Knopen`, `RapportAfdruk`), het
doorrekenen (`bladDoorrekenen`), het paneel Rapport en het afdrukvoorbeeld vragen
het daar na. Een blad zonder aanmelding is een rekenblad; alleen Jupyter wijkt nog af
(zie onder).

## Een soort aanmelden

```tsx
{
  templateId: TEKEN_BLAD,
  soortTekst: () => papier()("tekenBlad.soort"),
  Afdruk: TekenPapier,
  useOnderkop: (ex) => [ex.tekening?.bestandsnaam],
}
```

| veld | wat | zonder |
|---|---|---|
| `templateId` | de `templateId` van de bladen | verplicht |
| `soortTekst` | de naam op papier, onder de kop en in de kolom grondslag, in de taal van de app | verplicht |
| `Afdruk` | het afdrukonderdeel: de inhoud onder de kop, binnen de bladspiegel van `maten` | verplicht |
| `useOnderkop` | wat er achter de soort onder de kop staat, zoals de bestandsnaam | alleen de soort |
| `plek` | waar de uitwerking staat zolang de gebruiker niets koos: `hoofdstuk` of `bijlage` | in de bijlage |
| `inhoudsKoppen` | regels onder de naam van het blad in de inhoudsopgave | alleen de naam |
| `useVersie` | verandert als er iets klaar is getekend, zodat het afdrukvoorbeeld opnieuw verdeelt | niet nodig als alles meteen klaar is |
| `RapportKeuze` | een eigen keuze op de kaart van het blad in het paneel Rapport | geen |
| `HeelBlad` | het hele blad zelf, zonder kop erboven: voor een blad op eigen papierformaat met zijn naam op het vel, zoals een tekenblad | de kop met `Afdruk` eronder |

De kop met het nummer tekent `LosBladAfdruk`: losse bladen 1, 2, …, bijlage A
A.1, A.2, …. In hoofdstuk Berekeningen staat het afdrukonderdeel onder de
paragraafkop.

De keuze *Uitwerking in dit hoofdstuk* van de gebruiker wint van `plek`
(`staatInHoofdstuk` in `rapport/opzet.ts`).

## Wat een afdrukonderdeel moet doen

Het afdrukvoorbeeld meet de blokken en verdeelt ze over vellen
([`paginering.ts`](../packages/desktop/src/components/calc/paginering.ts)); een
kopie van die vellen gaat naar de printer. Daarvoor geldt:

- **Elk blok is een los kind.** Een blok gaat als geheel op een vel. Wat hoger is dan
  een vel, valt eraf: maak er meer blokken van. `markdownVoorPapier` doet dat per
  lijstregel, tabelrij en regel code. De wikkels `.rpa-vlak`, `.ifc-calc` en
  `.md-citaat` worden afgepeld en op het vel opnieuw gebouwd, dus marges en padding op
  een wikkel tellen elke keer mee.
- **`print-nieuw-vel`** begint een vers vel, **`print-vel-af`** sluit het af. Zo krijgt
  elke pagina van een PDF een eigen vel. De kop van het blad neemt 20 mm van het
  eerste vel.
- **`data-afdruk-laadt`** op een element houdt het printen tegen tot het weg is. Geef
  daarna een nieuwe `useVersie`: de vellen zijn een kopie, en die moet opnieuw.
- **`data-inhoud="anker"`** op een kop maakt een regel in de inhoudsopgave mogelijk:
  `inhoudsKoppen` geeft hetzelfde anker terug. De kop van het blad zelf regelt
  `LosBladAfdruk`.

## Paginanummers en inhoudsopgave

Daar hoeft een soort niets voor te doen. Elk vel krijgt zijn nummer bij het bouwen,
hoe de inhoud ook is getekend: PDF-pagina's en vellen van een werkmap tellen dus
gewoon mee. De nummers in de inhoudsopgave komen uit dezelfde verdeling
(`paginaVanAnkers`) en worden ingevuld in cellen die er al staan, zodat de
inhoudsopgave zelf er niet door verschuift.

- **Inhoudsopgave voorin:** hoofdstukken en paragrafen, en met
  `rapport.opmaak.bladenInInhoud` ook elk blad, onder hoofdstuk Berekeningen of onder
  bijlage A, met eventueel zijn koppen. Een rapport van vóór versie 4 van de
  rapportopbouw opent met die keuze uit: de inhoudsopgave blijft even lang en de vellen
  erna verschuiven niet.
- **Inhoudsopgave van hoofdstuk Berekeningen:** elke paragraaf met zijn pagina.
- **Een eigen bijlage** (B, C, …) heeft geen nummer: het document zelf zit niet in het
  rapport.

Een pagina die groter is dan A4 of liggend staat (een A1-tekening, een liggend A4)
komt passend verkleind op een A4 staand vel, bovenaan en in het midden, en draagt het
nummer op de gewone plek rechtsonder. Het vel draait niet mee.

Een tekenblad gaat anders: dat kiest zelf A4, A3 of A2 en krijgt een vel op dat formaat
(`data-vel-pagina`, `data-vel-breedte`, `data-vel-hoogte`). In het rapport loopt de
nummering erover door, en de naam in zijn titelhoek krijgt het nummer van het blad.

## Wat er verder bij een nieuwe soort hoort

Buiten de afdruk heeft een soort nog deze plekken, zoals bij Markdown:

- `store/<soort>.ts`: het veld op het blad, `isXBlad`, en lezen uit een bestand. Puur,
  want het projectbestand en de controlescripts laden het in Node.
- `isLosBlad` in `store/spreadsheetBlad.ts`, en `normaliseerExemplaar` in
  `store/projectBestand.ts`.
- `store/projectStore.ts` (toevoegen en wijzigen), `store/projectIfcx.ts` en
  `packages/core/src/ifcx/` (`ATTR`, schema en `soort` in `namespace.ts`, schrijven en
  lezen in `document.ts`, de bijlage in `step.ts`).
- De werkruimte in `App.tsx`, de keuze in `BladToevoegen.tsx` (de ene knop in het paneel), de knop in `CalcTab.tsx`, en
  de teksten in `werkruimte.json` en `rapport.json` (Nederlands en Engels).
- `bladSoort` in `mcp/tools/hulp.ts`.
- Een eigen `scripts/check-<soort>.mjs`. `scripts/check-rapport-pdf.mjs` rekent de
  nummers na op een gemengd project (`scripts/lib/gemengd-project.mjs`): zet de soort
  daar ook in.

## Markdown

De tekst staat in een eigen veld (`md` op het blad, `ocss::blad::markdown` in het
bestand), niet in `source`: die is van de rekentekst. De html loopt door dezelfde
opschoning als de uitwerking van een rekenblad, en een afbeelding van buiten laadt pas
na bevestiging per domein (`iframeBlok.ts`); op papier staat zonder bevestiging de naam
van de host.

Bij het inlezen in de app gaan afbeeldingen die naast het bestand staan mee het project
in, als data-URL per adres (`beelden`), zodat de tekst zelf niet verandert. Alleen een
pad naast de tekst wordt gelezen, geen stam of serverpad, en tot 10 MB per stuk. Wat er
niet bij zit, staat op het blad als een melding met het adres. Wegschrijven schrijft de
tekst ongewijzigd; de afbeeldingen blijven in het project.

De koppen uit de tekst komen standaard in de inhoudsopgave, de bovenste twee niveaus die
erin voorkomen. Een eerste kop gelijk aan de naam van het blad vervalt, op papier en in
de inhoudsopgave. Uitzetten kan per blad, op zijn kaart in het paneel Rapport.

## Huisstijl

*Instellingen → Bureau en huisstijl* geldt voor alles wat op papier komt: het logo, de
voetafbeelding, de kleuren en het lettertype (`rapport/model.ts`). `huisstijlVariabelen` zet
ze als CSS-variabelen op de wortel van een uitdraai; een blad gebruikt alleen die variabelen
(`--pr-*` op een los blad, `--rpa-*` in het rapport). Zolang de huisstijl de standaard is,
blijven losse bladen in hun eigen opmaak. Een rapport legt een kopie van het profiel vast; die
geldt dan ook voor de losse bladen uit dat project.

Afdrukken gaat voor elke soort uitdraai via de vellen van het afdrukvoorbeeld (`drukvellen.ts`):
wat in het voorbeeld staat, komt op papier.

## Canvas, graaf, tekenblad, Jupyter en Marimo

- **Canvas** is geen losse soort maar een rekenblad: de rekentekst staat gewoon in
  `source`, met per eenheid een regel `//@eenheid id=e1 x=10 y=15`. De kern rekent van
  boven naar beneden, en `CanvasVellen` zet de eenheden op papier.
- **Graaf** staat in `graaf` op het blad (`ocss::blad::graaf`) en is aangemeld met
  `GraafVellen`.
- **Tekenblad** staat in `tekenvel` (`ocss::blad::tekenvel`) en is aangemeld met
  `HeelBlad`, omdat de kop in de titelhoek van het vel staat.
- **Jupyter** staat in `jupyter` (`ocss::blad::jupyter`) en is de uitzondering: dat blad
  heeft nog een eigen tak in `PrintBlad.tsx` en `bladDoorrekenen.ts`, en staat niet in
  `SOORTEN`. Zie [`jupyter-blad.md`](jupyter-blad.md).
- **Marimo** staat in `marimo` op het blad (`ocss::blad::marimo`), met de code als tekst en per cel de
  laatste uitvoer, en is aangemeld met `MarimoPapier`. Een schuif staat op papier als zijn waarde. De
  Python-omgeving is die van de Jupyter-bladen: zie `docs/jupyter-blad.md`.

## Controleren

```
node scripts/check-markdown.mjs       # opslaan en heropenen, html, opschoning, op papier
node scripts/check-paginering.mjs     # de verdeling en de nummers bij de ankers
node scripts/check-rapport-pdf.mjs    # een echte PDF van een gemengd project, alle soorten
```

`check-rapport-pdf` start zijn eigen dev-server op een vrije poort en een headless
browser, leest de PDF met pdf.js en rekent na: evenveel pagina's als vellen, op elke
pagina zijn eigen nummer, en bij elke regel van de inhoudsopgave de kop op die pagina
en op geen eerdere. Met `--bewaar <map>` blijven de PDF en het project staan om te
bekijken.
