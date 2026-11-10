# Grafblad: een prettige node-editor — ontwerp

Datum: 10-11-2026
Status: ontwerp; de schets is goedgekeurd, dit document nog niet
Schets: `2026-11-10-grafblad-editor-schets.html` (naast dit document; open hem in een browser)

## Aanleiding

Het grafblad is de bladsoort met nodes en verbindingen op een vlak, met het
3D-voorbeeld op de achtergrond. Het rekent goed, maar het werkt nog niet als een
node-editor waar je graag in bouwt. Er is geen overzicht van wat er aan nodes is, je
kunt maar één node tegelijk kiezen, en je kunt niets ordenen of toelichten. De nodes
zelf zijn grijze kaartjes.

Dit ontwerp maakt van het vlak een volwaardige editor. Het is het eerste van drie
delen:

1. **De editor** (dit document).
2. **FEM Studio als nodes**: staalprofielen, belastingen, het model, doorrekenen en
   de normtoetsen, uit de lijst met tools die FEM Studio zelf geeft. Eigen ontwerp,
   later.
3. **Een Python-node.** Eigen ontwerp, later.

De editor moet de plek klaarzetten waar deel 2 en 3 in passen: een catalogus met meer
bronnen dan de ingebouwde nodes. Verder bouwt dit deel niets voor 2 en 3.

## Hoe het nu zit

- **Model** (`packages/desktop/src/graaf/model.ts`): `Graaf { versie, nodes,
  verbindingen }`. Een node heeft `id`, `soort`, `x`, `y`, `naam?`, `invoer?`,
  `geheel?`. Eén verbinding per ingang. Elke bewerking geeft een nieuw object; de
  store (`zetGraaf`) maakt er een stap ongedaan maken van. `leesGraaf` leest wat er
  in het bestand staat en laat onbekende velden vallen.
- **Nodes** (`graaf/nodes.ts`): 80 soorten in zes groepen (`invoer`, `lijst`,
  `reken`, `logica`, `tekst`, `geometrie`). Poorten staan op vaste rijen bovenaan de
  node (`KOP_HOOGTE`, `RIJ_HOOGTE`), zodat `poortPlek` de plek van een verbinding
  uitrekent zonder te meten.
- **Rekenen** (`graaf/rekenen.ts`): bij elke wijziging de hele graaf, in
  topologische volgorde; per node `poorten`, `uitkomst`, `fouten`, `meldingen`.
- **Vlak** (`components/graaf/GraafBladWeergave.tsx`):
  - links slepen op een node verplaatst hem, op een poort trekt het een verbinding;
  - links slepen op een lege plek draait het 3D-voorbeeld (de laag met nodes laat
    de muis door naar het 3D-doek);
  - rechts of midden slepen schuift het vlak, scrollen zoomt;
  - dubbelklik opent het zoekmenu (`GraafZoekmenu.tsx`);
  - Delete verwijdert de gekozen node of verbinding;
  - het rechtsklikmenu van de browser staat uit, er is geen eigen menu.
  Er is één gekozen ding tegelijk (`Gekozen`).
- **Node** (`GraafNodeKaart.tsx`): kop met naam (dubbelklik hernoemt) en ×, de
  poorten, eigen velden per soort (getal met schuif, codeblok, tekst), en daaronder
  altijd het voorbeeld van de uitkomst.
- **Papier** (`graaf/papier.ts`, `GraafAfdruk.tsx`): de graaf als SVG, het
  3D-voorbeeld en de bekijk-nodes in een tabel.
- **Inlezen** (`graaf/grafBestand.ts`): een grafbestand (`.dyn`, JSON) wordt een
  graaf; wat niet bestaat, wordt een node `ingelezen`.
- **Controle**: `scripts/check-graaf.mjs`.
- **Iconen**: alleen uit de OpenAEC Blueprint (`components/ribbon/calcIcons.ts`:
  "kies het id uit de Blueprint, niet zelf tekenen"). Een eigen sprite met alleen de
  gebruikte symbolen, ongewijzigd overgenomen, kan (precedent:
  `public/icons/spreadsheet.svg`).

## Doelen

- Een **catalogus** links naast het vlak: zoeken, groepen met icoon, recent
  gebruikt; slepen of Enter zet een node op het vlak.
- **Mooiere nodes**: stijl A uit de schets, met een icoon per node en een kleur per
  groep. Poorten en verbindingen tonen met hun kleur wat erdoor gaat.
- Per node een **oogje**: de uitkomst tonen of verbergen.
- **Meer nodes tegelijk kiezen** met een kader en Ctrl+klik, en ze samen
  verschuiven, kopiëren, dupliceren en verwijderen.
- **Groepen**: een gekleurd kader met een naam om een paar nodes, dat als geheel
  schuift en in te klappen is.
- **Losse tekst** op het vlak, voor aannames en uitleg.
- **Rechtsklikmenu's** op een node, een verbinding, een groep, een tekst en een lege
  plek.
- **De waarde op een verbinding**: wat erdoorheen gaat, te zien op de lijn.

## Niet-doelen

- Nodes van FEM Studio en de Python-node (deel 2 en 3).
- Pakketten met nodes van buiten (online). De catalogus laat er geen lege plek voor
  zien.
- Uitlijnen en verdelen van nodes, een minikaart, subgrafen (een groep die een eigen
  node wordt met in- en uitgangen).
- Iets aan het rekenen veranderen. `rekenen.ts` blijft zoals hij is, op
  "uitgeschakeld" na (zie onder).
- Groepen en teksten uit een ingelezen grafbestand overnemen (kan later).

## Anti-doelen

- **Een tweede, eigen beeldtaal.** Kleuren, letters, hoeken, schaduwen en iconen
  komen uit de Blueprint, helemaal. Wat er ontbreekt, komt eerst in de Blueprint en
  wordt dan ongewijzigd overgenomen. Geen zelf getekende iconen, geen kleuren die
  alleen in het grafblad bestaan.
- **Een bont vlak.** De kleur van een groep zit in een streepje en het icoon, niet in
  de hele kop (daarom stijl A en niet B).
- **Bestaande grafbladen die anders gaan rekenen of breken.** Een graaf uit een
  vorige versie opent en rekent precies zoals nu.
- **Bediening die je kwijtraakt.** Wie gewend is aan slepen op een lege plek om het
  3D-voorbeeld te draaien, ziet in de hint onderaan hoe het nu gaat.

## Het beeld

De schets is leidend voor de opbouw: catalogus links, vlak rechts, balk linksboven
in het vlak, hint onderaan. Stijl A voor de nodes.

### Kleuren en iconen uit de Blueprint

- **Kleuren per groep.** De Blueprint heeft nu alleen statuskleuren (`--oa-info`,
  `--oa-success`, `--oa-warning`, `--oa-error`) en het accent. Statuskleuren voor
  een groep gebruiken zou "fout" en "groep logica" door elkaar halen. Daarom komt er
  in de Blueprint een rij van acht **categoriekleuren** (`--oa-category-1` tot en
  met `-8`), per thema (licht, donker, blueprint, hoog contrast). Het grafblad
  gebruikt er zes voor de groepen en houdt er twee vrij voor FEM Studio en Python.
  De kleuren in de schets zijn een voorbeeld, geen besluit.
  - In de Blueprint komen tokens uit een generator
    (`design/ontwerp-0.4/tokens-0.4.json` → `generate_tokens_04.py`, met
    contrastcontroles), voor vijf thema's: licht, donker, blueprint, hoog contrast
    licht en hoog contrast donker.
  - De bouwer maakt daar een voorstel voor de acht kleuren; de gebruiker keurt het
    goed voordat het in de Blueprint komt. In afwachting daarvan kan het kiezen
    (stap 4 onder Volgorde, zonder kleur) eerst.
- **De tokens van de app lopen achter op de Blueprint.**
  `packages/desktop/src/openaec/openaec-tokens.css` heeft in het lichte thema nog de
  crème vlakken; de Blueprint heeft nu neutraal grijs, en kleine wijzigingen in tekst
  en rand. Volledige adoptie betekent: het hele bestand ongewijzigd overnemen, niet
  alleen de nieuwe kleuren. Dat verandert het beeld van de hele app en gaat via main
  meteen live. Daarom is het een eigen PR, vóór de rest.
- **Iconen.** Elke groep krijgt een icoon uit de Blueprint. Een node krijgt een
  eigen icoon als de Blueprint er een heeft dat echt past (een lijn, een punt,
  tekst), anders het icoon van zijn groep. Kandidaten die er al zijn:
  `budget.add-formula` (reken), `view.list` (lijst), `field.checkbox` (logica),
  `draw.text` (tekst), `draw.polyline` (geometrie), `form.field-group` (invoer),
  `category.code` (codeblok), `draw.note` (losse tekst), `list.group-by` (groep),
  `object.show`/`object.hide` (oogje), `selection.box` (kader), `view.search`
  (zoeken). Ze staan allemaal al in de sprites van de Blueprint (`web/icons/`); er
  hoeft niets getekend te worden. De keuze per groep is aan de bouwer. Ze komen in
  een eigen sprite `public/icons/graaf.svg`, ongewijzigd uit de Blueprint-sprites,
  zoals `spreadsheet.svg`.
- **Letters, hoeken, schaduw**: `--oa-font-*`, `--oa-radius-*`,
  `--oa-shadow-panel`/`-popup`, en de themakleuren die het grafblad nu al gebruikt.

### Een node (stijl A)

- Kaart in de paneelkleur, ronde hoeken, schaduw van een paneel.
- Een **streepje** van 2 px bovenaan in de kleur van de groep.
- **Kop**: icoon in een vierkantje in de groepskleur, daarnaast de naam (vet) met
  daaronder klein de soort ("Getal", "Codeblok") als de node een eigen naam heeft.
  Rechts het oogje. De × verdwijnt uit de kop: verwijderen gaat met Delete of het
  menu.
- **Poorten** blijven op vaste rijen bovenaan, ingangen links en uitgangen rechts
  (zoals nu), zodat `poortPlek` blijft rekenen zonder te meten. De schets toont de
  uitgangen onder de code; dat was een schets, geen besluit.
- Het **bolletje** van een poort heeft de kleur van de soort waarde die er nu door
  gaat, uit de uitkomst: een grootheid of getal, een lijst, geometrie, tekst,
  waar/onwaar. Zonder waarde is het neutraal. Die vijf soorten gebruiken de kleur
  van hun groep (invoer, lijst, geometrie, tekst, logica), zodat er niet nog een
  rij kleuren bij komt.
- Een **verbinding** heeft de kleur van de waarde aan zijn begin.
- **Gekozen**: rand en gloed in de accentkleur.
- **Fout**: rand in `--oa-error`; de melding staat er altijd, ook als de uitkomst
  verborgen is.
- **Uitgeschakeld**: de hele node half doorzichtig, met een streep door het icoon.
- **De getal-node wordt compact**, zoals in de schets: de kop en één rij met het veld
  voor de waarde en het veld voor de eenheid, met de uitgang op die rij. De schuif en
  min/max/stap komen achter een klein knopje "schuif" in die rij; open of dicht
  wordt bewaard (`schuif?: true` op de node). Op papier staat alleen de waarde.

### Het oogje

- Per node: uitkomst tonen of verbergen. Klik op het oogje, toets H, of het menu.
  Met meer nodes gekozen geldt het voor allemaal.
- Wordt bewaard in het blad (zie Model).
- **Standaard**: verborgen bij `getal`, `tekst` en `waarOnwaar` (de waarde staat al
  in het veld), zichtbaar bij de rest. Een node uit een oud blad zonder het veld
  volgt die standaard.
- De bekijk-node toont altijd; het oogje staat daar niet.
- Op papier volgt het oogje het scherm.

## De catalogus

- Een paneel links in het grafblad, ongeveer 250 px breed, in en uit te klappen met
  een knop in de balk. Of hij open staat, onthoudt de app (niet het project).
- **Zoekveld** bovenaan. Ctrl+F zet de cursor erin. Zoekt zoals het zoekmenu nu:
  op naam, uitleg en de naam in de andere taal. De zoeklogica gaat naar één functie
  die het paneel en het zoekmenu allebei gebruiken.
- **Recent**: de laatste vijf soorten die je toevoegde, over alle grafbladen; de app
  onthoudt ze.
- **Alle nodes**: per groep een kop met icoon, naam en aantal, in- en uitklapbaar.
  Daaronder per node icoon en naam.
- Bij de gekozen of aangewezen regel staat de uitleg (`graaf.uitleg.<soort>`) eronder,
  zoals bij "Getal" in de schets.
- **Toevoegen**: slepen naar het vlak (de node komt waar je loslaat), of Enter of
  dubbelklik (de node komt midden in beeld, of rechts naast de gekozen node).
- Het zoekmenu bij dubbelklik op het vlak en bij een losgelaten verbinding blijft,
  voor snel werken.
- **Meer bronnen**: de catalogus leest zijn lijst uit één register van soorten met
  per soort een groep, icoon, naam en uitleg. Deel 2 en 3 voegen daar een groep aan
  toe; nu staan er alleen de ingebouwde nodes in.

## Kiezen en bewerken

### Muis

| Wat | Waar | Doet |
|---|---|---|
| links klikken | node, tekst, groepskop | kiest hem (de rest niet meer) |
| Ctrl+klik | node, tekst | zet hem erbij of haalt hem eraf |
| links slepen | lege plek | **kader**: kiest wat erin valt (nieuw) |
| Shift+slepen | lege plek | kader dat erbij kiest |
| Alt+slepen | lege plek | 3D-voorbeeld draaien (was: gewoon slepen) |
| links slepen | node of gekozen nodes | alles wat gekozen is, schuift mee |
| links slepen | groepskop | de groep met inhoud schuift |
| rechts klikken | overal | menu (nieuw) |
| rechts of midden slepen | overal | vlak schuiven (zoals nu); pas na 4 px beweging, anders is het een klik |
| scrollen | overal | zoomen; met Shift het 3D-voorbeeld (zoals nu) |
| dubbelklik | lege plek | zoekmenu (zoals nu) |

Een node of tekst valt in het kader als hij er helemaal in ligt.

Op macOS is Ctrl hier Cmd, zoals elders in de app (`ctrlKey || metaKey`).

**3D draaien zonder Alt.** Op een deel van de Linux-bureaubladen verplaatst
Alt+slepen het venster. Daarom komt er in de balk een knop "3D draaien" die je aan
en uit zet: aan is links slepen op een lege plek weer draaien, zoals nu; uit is het
een kader. Standaard uit. De hint onderaan zegt wat geldt.

**Een groep kiezen.** Een klik op de titel van een groep kiest de groep, en daarmee
alle nodes en teksten erin; het kader licht op. Wat je dan doet, geldt voor de groep
met inhoud:

- Delete haalt de groep met inhoud weg (één stap ongedaan maken).
- Kopiëren en dupliceren nemen de groep mee als al zijn leden in de keuze zitten;
  anders gaan alleen de gekozen leden mee, zonder groep.
- Het kader kiest nodes en teksten; een groep telt als gekozen als al zijn leden
  gekozen zijn.

### Toetsen

Ctrl+A alles, Escape niets meer gekozen, Delete weg, Ctrl+C / Ctrl+X / Ctrl+V
kopiëren, knippen, plakken, Ctrl+D dupliceren, Ctrl+G groeperen, Ctrl+Shift+G groep
opheffen, H uitkomst aan of uit, F2 hernoemen, T losse tekst op de plek van de muis.
Niet als de cursor in een veld staat.

### Kopiëren en plakken

- Kopiëren neemt de gekozen nodes en teksten mee, met de verbindingen tussen de
  gekozen nodes. Verbindingen naar buiten de keuze gaan niet mee.
- Het klembord krijgt JSON (een stukje graaf), zodat plakken ook in een ander grafblad
  werkt. Plakken legt het stuk rond de muis, met nieuwe ids; daarna is het geplakte
  gekozen.
- Dupliceren is kopiëren en plakken, 20 px verschoven.

### Ongedaan maken

Elke handeling is één stap: een kader vol nodes verschuiven, plakken, groeperen.

## Rechtsklikmenu's

Het menu is een popup in de stijl van de app (`--oa-shadow-popup`), met de toets
rechts. Met meer dingen gekozen werkt het op de keuze; rechtsklik op iets dat niet
gekozen is, kiest eerst alleen dat.

- **Node**: Hernoemen (F2) · Uitkomst tonen/verbergen (H) · Uitschakelen /
  Inschakelen · Dupliceren (Ctrl+D) · Groeperen (Ctrl+G) · Uitleg bij deze node ·
  Verwijderen (Del).
- **Verbinding**: Waarde op de lijn tonen/verbergen · Node ertussen · Verwijderen.
- **Groep**: Hernoemen · Inklappen/Uitklappen · Groep opheffen · Verwijderen met
  inhoud.
- **Losse tekst**: Bewerken · Verwijderen.
- **Lege plek**: Node toevoegen (het zoekmenu hier) · Tekst hier · Plakken · Alles
  kiezen · Passend in beeld.

"Uitleg bij deze node" klapt de catalogus open met die node gekozen, zodat de uitleg
er staat.

### Uitschakelen

Een uitgeschakelde node rekent niet; zijn uitgangen hebben geen waarde. Een node
erachter krijgt de melding die er nu al is voor een ingang zonder waarde. Zo kun je
een tak van de graaf even stilzetten zonder hem weg te halen.

## De waarde op een verbinding

- Rechtsklik op een lijn toont meteen een label midden op de lijn met wat erdoor gaat
  (`waardeTekst`, kort: "22,5 kNm", "lijst van 12"), met het menu ernaast.
- "Waarde op de lijn tonen" laat het label blijvend staan; dat wordt bewaard (zie
  Model).
- Het label heeft de kleur van de waarde, zoals de lijn.
- Op papier staat een blijvend label ook.

## Groepen

- Kies twee of meer nodes en Ctrl+G (of het menu): er komt een groep om heen, met de
  naam "Groep" en de titel meteen in bewerking.
- Een groep is een lijst met node-ids, een naam en of hij ingeklapt is. Het kader
  rekent zich uit: om de nodes heen, met marge en ruimte voor de titel. Verschuif je
  een node binnen de groep, dan groeit het kader mee.
- Een node hoort bij hooguit één groep. Groeperen van nodes die al in een groep
  zitten, haalt ze daar uit.
- **Slepen** aan de titel verschuift de groep met inhoud.
- **Inklappen** (pijltje voor de titel of het menu): de nodes verdwijnen en de groep
  wordt een kaart met de titel en het aantal nodes. Verbindingen van en naar nodes
  in de groep lopen naar de rand van die kaart. Uitklappen zet alles terug.
- Een node in een groep verwijderen haalt hem uit de groep; een lege groep verdwijnt.
- Kleur: een groep heeft de accentkleur, zacht (zoals in de schets). Een eigen kleur
  kiezen is voor later.

## Losse tekst

- T, of "Tekst hier" in het menu, zet een tekstblok op het vlak, meteen in bewerking.
- Een blok heeft een **titel** (vet, kan leeg zijn) en **tekst** (meer regels, geen
  opmaak). De breedte is te slepen aan de rechterrand; de hoogte volgt de tekst.
- Geen poorten. Kiezen, slepen, kopiëren en groeperen werken zoals bij een node.
- Dubbelklik bewerkt.

## Model

`graaf/model.ts` krijgt erbij (alle velden optioneel, zodat een graaf van nu zo
blijft):

```ts
interface GraafNode {
  // … zoals nu
  /** Uitkomst verborgen (true) of getoond (false); zonder: de standaard van de soort. */
  verborgen?: boolean;
  /** Uitgeschakeld: rekent niet. */
  uit?: true;
  /** Getal: de schuif en min/max/stap staan open. */
  schuif?: true;
}

interface GraafVerbinding {
  // … zoals nu
  /** Het label met de waarde staat blijvend op de lijn. */
  label?: true;
}

interface GraafGroep {
  id: string;            // "g1", "g2", …
  naam: string;
  nodes: string[];       // node-ids; ook ids van losse teksten
  ingeklapt?: true;
}

interface GraafTekst {
  id: string;            // "t1", "t2", …
  x: number;
  y: number;
  breedte: number;
  titel?: string;
  tekst: string;
}

interface Graaf {
  versie: number;        // wordt 2
  nodes: GraafNode[];
  verbindingen: GraafVerbinding[];
  groepen?: GraafGroep[];
  teksten?: GraafTekst[];
}
```

- `leesGraaf` leest de nieuwe velden en ruimt op: een groep met ids die er niet zijn
  houdt alleen de bestaande; een groep zonder leden valt weg; een node in twee
  groepen blijft in de eerste.
- Nieuwe functies, elk zuiver: `kiesInKader`, `verwijderKeuze`, `kopieerKeuze`
  (geeft een stukje graaf), `plak` (nieuwe ids, verschoven), `groepeer`,
  `hefGroepOp`, `wisselIngeklapt`, `voegTekstToe`, `zetTekst`, `wisselVerborgen`,
  `wisselUit`, `wisselLabel`, `verplaatsKeuze`. De namen zijn een voorstel.
- `GRAAF_VERSIE` wordt 2. Een oudere app leest een graaf van versie 2 zonder de
  groepen en teksten; die gaan dan verloren als hij hem opslaat. Dat is aanvaard.
- **Het projectbestand** (IFCX) neemt de graaf niet als geheel over: `packages/core`
  noemt elk veld apart. Daar moet dus mee veranderen, in dezelfde PR als het veld:
  - `GraafGegevens` in `packages/core/src/ifc-generator.ts`;
  - `graafAttribuut` en `graafUitAttribuut` in `packages/core/src/ifcx/document.ts`
    (nu alleen `versie`, `nodes`, `verbindingen`);
  - het schema van `ocss::blad::graaf` in `packages/core/src/ifcx/namespace.ts`.
  Zonder dat raken groepen en teksten bij elk opslaan kwijt.
- **Rekenen**: `rekenGraaf` slaat een node met `uit` over (geen uitkomst, wel in de
  volgorde). Verder niets.

## Papier

- Groepen: een kader met de naam, zonder kleur (het papier heeft geen thema).
- Losse teksten: titel vet, tekst eronder, in een dun kader.
- Een verborgen uitkomst staat er niet; een blijvend label op een lijn wel.
- Een uitgeschakelde node grijs.
- Iconen niet op papier.
- Een ingeklapte groep op papier: als op het scherm, een kaart met titel en aantal.

## Teksten en talen

Alle nieuwe teksten in `werkruimte.json` onder `graaf.*`, in het Nederlands en het
Engels, zoals de rest van het grafblad. De app volgt zijn eigen taal.

## Controles

`scripts/check-graaf.mjs` krijgt secties voor:

- lezen en schrijven met groepen, teksten, `verborgen`, `uit`, `label`, `schuif`; een
  graaf van versie 1 leest onveranderd;
- opslaan en weer openen via het projectbestand (`check-ifcx.mjs`): groepen, teksten
  en de nieuwe velden komen terug;
- opruimen in `leesGraaf` (onbekende ids, lege groep, node in twee groepen);
- kader, verwijderen, kopiëren met alleen de interne verbindingen, plakken met nieuwe
  ids, dupliceren, groeperen en opheffen, verplaatsen van een keuze;
- rekenen met een uitgeschakelde node: geen waarde erachter, melding bij de volgende;
- papier met groepen, teksten, verborgen uitkomst, label en uitgeschakelde node.

De bediening controleert de bouwer in de dev-app (kader, Alt+slepen, menu's,
catalogus slepen, inklappen), met een schermafdruk per stap.

## Volgorde

Elk in een eigen kleine PR, telkens bruikbaar:

1. **Tokens**: `openaec-tokens.css` gelijk aan de Blueprint, het hele bestand.
2. **Categoriekleuren**: voorstel in de Blueprint, goedgekeurd, overgenomen; de
   sprite `graaf.svg`.
3. **Het beeld van de node**: stijl A, icoon, kleur, poortkleur, lijnkleur, oogje,
   compacte getal-node.
4. **Kiezen**: kader, Ctrl+klik, samen verschuiven, verwijderen, kopiëren, plakken,
   dupliceren; Alt+slepen en de knop "3D draaien". Kan vóór 2 en 3 als de kleuren
   nog op goedkeuring wachten.
5. **De catalogus.**
6. **Menu's** en de waarde op de lijn, uitschakelen.
7. **Groepen en losse tekst**, ook op papier en in het projectbestand.

## Later

- Deel 2 (FEM Studio als nodes) en deel 3 (Python-node), elk met een eigen ontwerp.
- Een eigen kleur per groep; uitlijnen; een minikaart.
- Groepen en notities uit een ingelezen grafbestand overnemen.
- Een groep omzetten in een eigen node met in- en uitgangen.

## Keuzes van de ontwerper

Niet door de gebruiker beslist, wel in dit ontwerp vastgelegd; te herzien bij het
lezen:

- De getal-node compact, met de schuif achter een knopje.
- Een gekozen groep is de groep met inhoud: Delete haalt alles weg.
- Naast Alt+slepen een knop "3D draaien" in de balk.
- Het oogje standaard uit bij getal, tekst en waar/onwaar.
- De tokens van de hele app eerst gelijk aan de Blueprint, in een eigen PR.
- De acht categoriekleuren als voorstel van de bouwer, ter goedkeuring.
- Poorten blijven op rijen bovenaan, niet onder de code zoals in de schets.
- Geen lege plek voor pakketten in de catalogus.

## Aan de bouwer

- Lees eerst `GraafBladWeergave.tsx`, `GraafNodeKaart.tsx`, `graaf/model.ts` en
  `graaf/nodes.ts`; de bediening in het commentaar bovenaan `GraafBladWeergave.tsx`
  moet na elke stap weer kloppen.
- De draaiende app van de gebruiker leest het project uit de store; verander de vorm
  van de store niet halverwege een sessie zonder dat een oud project nog opent.
- Geen namen van andere rekensoftware in code, commentaar of commits.
