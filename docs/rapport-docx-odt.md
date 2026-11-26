# Het rapport als DOCX of ODT

Bestand › Exporteren heeft naast de PDF twee kaarten voor een bewerkbaar document:
DOCX en ODT (OpenDocument). Het document is een momentopname van het rapport, om op te
nemen in een groter rapport van het bureau. Wat je daarin wijzigt, rekent niet mee en
komt niet terug in het project. Het project zelf verandert niet door de export.

## Hoe het werkt

De bron is de opgemaakte afdruk, dezelfde als die van de PDF. Er is geen tweede weg om
het rapport op te bouwen.

1. De kaart zet het rapport klaar (`rapportNaarDocument` in `store/printStore.ts`).
   `App.tsx` doet daarna wat het voor de PDF doet: het rapportvoorbeeld openen, de
   `@toets`-blokken zonder antwoord laten toetsen en wachten tot de vellen staan.
2. `maakRapportDocument` (`tauri/rapportDocument.ts`) leest de meetopstelling van het
   afdrukvoorbeeld uit (`rapport/document/uitAfdruk.ts`). Daar staat het rapport
   doorlopend, in de taal, het eenhedenstelsel en met de onderdelen van het rapport.
3. Wat niet mee kan, komt in een lijst. Is die niet leeg, dan vraagt de app eerst of de
   export door moet gaan.
4. `bouwDocx` of `bouwOdt` schrijft het tussenmodel (`rapport/document/model.ts`) als
   zip, met `fflate`. In de app kies je de plek in de dialoog Opslaan (de map van het
   project, met de projectnaam); in de browser wordt het een download.

## Wat er meegaat

| Op papier | In het document |
|---|---|
| Tekst | Alinea's, met vet, cursief, index, macht en kleur |
| Hoofdstuk, paragraaf, kop van een blad, kop in een blad | Kop 1, 2, 2 en 3 (de stijlen Heading 1–3) |
| Tabel | Tabel, ook met cellen over meer kolommen of rijen; een tabel die de afdruk over vellen knipte, is weer één tabel |
| Formule | DOCX: een vergelijking (OMML). ODT: een formuleobject met MathML |
| SVG, canvas, afbeelding | Een PNG op twee keer de schermresolutie, op zijn plek, nooit breder dan de bladspiegel |
| Invoerveld, keuzelijst | De waarde of de keuze als tekst |
| Nieuw onderdeel van het rapport | Een nieuwe pagina |

Bovenaan staat een regel met het project, de revisie en het exportmoment, en de zin dat
getallen in het document niet herrekenen. De voet van elke pagina noemt hetzelfde, met het
paginanummer. De toetsstatus is wat op papier staat: "NIET GETOETST" blijft "NIET
GETOETST".

De paginering is niet die van de PDF; de editor verdeelt de tekst zelf. De inhoudsopgave
staat er daarom zonder paginanummers.

## Formules

KaTeX zet naast zijn HTML een MathML-kopie van elke formule. Die is niet altijd heel: bij
`\boldsymbol` (een uitkomst) zet KaTeX een hele rij in een `mi`, en de HTML-parser van
de browser maakt daar platte tekst van. Daarom maakt de export de MathML opnieuw uit de
TeX in de afdruk, en neemt hij die alleen als er hetzelfde staat als op papier. In het
Nederlands schrijft de afdruk een komma in de getallen (`metDecimaalKomma` in de kern);
die komt er dan ook in. Anders blijft de kopie uit de afdruk.

- **DOCX:** `mathmlNaarOmml.ts` zet de MathML om naar OMML. Hij kent wat KaTeX schrijft:
  rijen, letters, getallen, tekens, tekst, ruimte, indices, breuken, wortels, accenten,
  strepen, accolades, sommen met grenzen, matrices en haakjes. Letters achter elkaar in
  dezelfde stijl worden één woord, zodat `kN` een eenheid blijft. Een knoop die hij niet
  kent, komt als tekst in de vergelijking; hij valt nooit weg.
- **ODT:** de MathML gaat als `Object N/content.xml` mee. `voorFormuleEditor` maakt van een
  `/` een operator en haalt `accent="true"` weg: daarmee laat de formule-editor het
  accent anders weg. Het object krijgt geen maat; de editor rekent die zelf uit.

## Wat niet meegaat

Deze onderdelen staan vóór de export in een lijst. Wie doorgaat, krijgt op hun plek een
regel in het document:

- **een ingevoegd PDF-blad:** "Bijlage: bestand.pdf (n pagina's), niet opgenomen";
- **een externe pagina** (`@iframe`) en **de uitvoer van een script** (`@js`);
- **ander ingebed materiaal** (video, audio, object);
- **een afbeelding die niet om te zetten is**, bijvoorbeeld van een andere site.

## Controle

`scripts/check-rapport-docx-odt.mjs` toetst zonder browser de omzetting naar OMML, de
MathML voor ODT en de opbouw van beide pakketten: een geldige zip, alle verplichte
onderdelen, goed gevormde XML, `mimetype` eerst en ongecomprimeerd in het ODT-pakket, en
dat "NIET GETOETST" in beide documenten blijft staan.

Het uitlezen van de afdruk zelf heeft een browser nodig. Controleer na een wijziging
daaraan een proefrapport met tekst, formules, een tabel, een tekening en een niet-getoetst
blad: maak het document in de app, en open het in een tekstverwerker of zet het met
LibreOffice headless om naar PDF (`soffice --headless --convert-to pdf`).

## Bekende beperkingen

- Een lettertype dat op de computer die het document opent ontbreekt, vervangt de editor
  door een letter van dezelfde soort; de export noemt dat niet apart.
- In de formule-editor van ODT staat een accent als klein teken boven de letter, een
  binomium met een breukstreep en een accolade onder een term als klein teken.
- Een tekening is een afbeelding, geen bewerkbare tekening.
