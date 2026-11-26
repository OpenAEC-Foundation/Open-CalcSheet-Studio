# Het projectmodel

Een project is een lijst rekenbladen die naast elkaar bestaan, met één laag
gedeelde projectgegevens erboven. Dit document legt vast hoe die scheiding
loopt en waarom hij zo strikt is.

## De kern in één regel

**Projectgegevens zijn gedeeld en expliciet. Al het andere hoort bij het blad
waar het staat.**

## Exemplaren

Een module uit de catalogus (`components/calc/projectTree.ts`) kan zo vaak in
een project voorkomen als je wilt. Elke invoeging maakt een **exemplaar**
(`store/projectStore.ts`):

```ts
interface Exemplaar {
  id: string;
  ref?: string;                        // kenmerk voor #ref.naam uit een ander blad
  naam: string;                        // "Balklaag 1", te hernoemen
  templateId: string;                  // herkomst, alleen ter informatie
  source: string;                      // eigen kopie van de rekentekst
  waarden: Record<string, string>;     // eigen invoer
  elementen?: ElementRef[];            // elementen in een bronmodel; leeg = losstaand
}
```

Twee dingen zijn hier bewust zo:

**Eigen kopie van de tekst.** Een exemplaar volgt zijn sjabloon niet. Verbeter
je het sjabloon, dan verandert een berekening die je vorig jaar hebt
opgeleverd níét — een opgeleverd stuk moet over vijf jaar hetzelfde uitrekenen.
En je mag de tekst van dít exemplaar aanpassen (een extra toetsing, een
aangepaste aanname) zonder de andere exemplaren te raken.

**Eigen waardenmap.** `N_Ed` in de kolom en `N_Ed` in de wand zijn verschillende
vakjes. Dat lijkt vanzelfsprekend, maar was het niet: tot 25-08-2026 was er één
platte waardenmap voor de hele app, waarin de variabelenaam de enige sleutel
was. Negentien namen werden gedeeld tussen bladen, en het blad dat als eerste
opende bepaalde de waarde voor alle volgende. In de praktijk betekende dat
bijvoorbeeld dat je na het openen van *Dragende metselwerkwand* in *Oplegging
op metselwerk* een unity check van 3,95 kreeg in plaats van 12,66 — een factor
3,2, de onveilige kant op, zonder enig teken in de UI. Die hele klasse fouten is
met de per-exemplaar-opslag onmogelijk geworden.

## Projectgegevens

De velden staan in `store/projectGegevens.ts` en worden ingevuld in het
formulier *Projectgegevens* (`components/calc/ProjectGegevensPanel.tsx`):

| veld | variabele | wat het is |
|---|---|---|
| Projectnummer, -naam, opdrachtgever, constructeur, locatie, onderdeel | `project_nummer`, `project_naam`, `opdrachtgever`, `constructeur`, `locatie`, `onderdeel` | de kop van de berekening |
| Gevolgklasse | `CC` (1/2/3) | plus de afgeleide `K_FI` (0,90 / 1,00 / 1,10) |
| Betrouwbaarheidsklasse | `RC` | |
| Ontwerplevensduur | `DesignLife` | in jaren |
| Windgebied | `windgebied` | volgt uit de gemeente (Tabel NB.1) |
| Terreincategorie | `terreincategorie` | volgt uit de omgeving (Tabel NB.3-4.1) |
| Land of regio | `land` | code uit `rapport/normen/landen.ts`; geen variabele voor de bladen |
| Generatie Eurocodes | `eurocode_generatie` | 1 of 2 |

Deze waarden gaan als **`initialScope`** de evaluator in, vóór de eerste regel
van het blad draait (`packages/core/src/evaluator.ts`). Een blad gebruikt ze
gewoon als variabele:

```text
γ_G = 1.2*K_FI
#if CC ≡ 1
```

Er is dus geen `@select gevolgklasse` meer in de bladen, en geen invoerveld in
de designers. Een blad mág de naam overschrijven met een eigen toekenning — de
normbladen EN 1990 en EN 1997 doen dat, omdat ze de tabel juist uitwerken —
maar het mag er geen tweede *invoerveld* voor neerzetten.

### Wat hoort er níét in

Alles wat per constructiedeel verschilt: belastingen, afmetingen, profielen,
materiaalklassen. Beton C30/37 in de fundering en C45/55 in de kern is een
normaal geval, dus de betonklasse hoort bij het blad.

Grensgeval: de **referentiehoogte** voor wind. Windgebied en terreincategorie
zijn eigenschappen van de locatie en staan dus op projectniveau; z_e hoort bij
het constructiedeel (een gording op 9 m, een gevelkolom op 4 m) en staat dus in
het blad. Zie `docs/backlog.md` voor wat daar nog aan open staat.

### Land en normen

`land` bepaalt welke normen gelden. De lijst staat in `rapport/normen/landen.ts`: alleen
gegevens, per land per onderwerp de norm, de uitgever, de editie en de officiële bron, en
welke grootheid de locatie levert. Een bestaand project kent het veld niet en is daarmee
Nederlands; een nieuw project krijgt de regio van het systeem (`landVoorLocale`), of als die
niet in de lijst staat de Eurocode zonder nationale bijlage. Niets wordt opgehaald bij een
externe dienst: het scherm geeft alleen een link.

De grens loopt bij `nlTabellen` (`normkeuzeVan` in `rapport/normen/keuze.ts`): alleen Nederland
met de eerste generatie rekent met de tabellen uit `rapport/normwaarden.ts` en toont de
windkaart. Daarbuiten komt daar geen getal uit, ook niet als standaardwaarde. De invoer staat
in het rapport, per land apart (`Rapport.lokaal`), zodat een waarde niet stil meegaat naar een
ander land; een Nederlands rapport heeft dat veld niet en verandert dus niet.

Een rapporttemplate kan het land vastleggen (`Template.land`). Toepassen en een nieuw rapport
zetten dat land in de projectgegevens (`pasTemplateToeOpProject`, `metLandUit`), en een bewaard
template neemt het huidige land mee. Een template zonder land verandert het land van het project
niet.

`windgebied` en `terreincategorie` blijven in de gegevens staan, maar staan alleen op het
formulier als de Nederlandse tabellen gelden. De rekenbladen rusten op de Eurocodes met de
Nederlandse bijlage en veranderen niet mee: `bladNormUit` leest uit de rekentekst op welke norm
een blad rust, en `normAfwijking` zegt of dat afwijkt van het land. Dat staat dan op het scherm
en op papier; bij een ander stelsel dan de Eurocode staat er "niet getoetst" in plaats van een
oordeel.

## De grens wordt bewaakt

`scripts/check-projectvariabelen.mjs` (onderdeel van `npm run check`) faalt
zodra een rekenblad of designer zélf een invoerveld neerzet met de naam van een
projectvariabele. Zonder die controle sluipt de oude dubbeling er bij de
volgende module zo weer in.

## Het bestand

Eén project is één `.ifccalculation`-bestand (`store/projectBestand.ts`). Het is
zuiver IFCX: alleen `header`, `imports`, `schemas` en `data`, en alles staat als
attribuut op een knoop. Dezelfde inhoud met de extensie `.ifcx` is hetzelfde
bestand. De opbouw staat in [ifc-export.md](ifc-export.md).

| wat | waar in het bestand | |
|---|---|---|
| Identiteit van het project (UUID) | het pad van het project, ook in `header.id` | bron |
| Projectnaam | `bsi::ifc::prop::Name` op het project | bron |
| Projectgegevens (ook de normen met editie en NB), verborgen onderdelen | `ocss::project` | bron |
| Constructierapport | `ocss::rapport` | bron |
| Naam van een blad | `bsi::ifc::prop::Name` op het blad | bron |
| Id, volgorde, `templateId`, `bronVersie`, `ref` | `ocss::blad` | bron |
| Rekentekst | `ocss::blad::rekentekst` | bron |
| Invoer | `ocss::blad::invoer` | bron |
| Elementen uit een bronmodel | `ocss::blad::elementen` | bron |
| PDF | `ocss::blad::pdf` | bron |
| Werkmap | `ocss::blad::xlsx` | bron |
| Markdown-tekst, met de afbeeldingen die naast het bestand stonden | `ocss::blad::markdown` | bron |
| Antwoorden van Open FEM Studio op `@toets`-blokken, met verzoek, datum en herkomst | `ocss::blad::toetsing` | bron |
| Varianten: andere invoer naast die van het blad ([varianten.md](varianten.md)) | `ocss::blad::varianten` | bron |
| Toetsregistratie (vier ogen): controleur, datum, uitkomst, opmerkingen, vrijgave met sha256 | `ocss::blad::controle` | bron |
| Bestanden op schijf die het blad met `#include` invoegt: sleutel, pad en een kopie van de laatst gelezen tekst ([rekentaal.md](rekentaal.md#include-van-een-bestand-op-schijf)) | `ocss::blad::includes` | bron |
| Uitkomsten, oordeel, unity checks | `ocss::blad::uitkomst` | afgeleid |
| Tekeningen en 3D-beelden | `ocss::figuur` op een kind van het blad | afgeleid |
| Elementen in de ruimtelijke boom | `ocss::element` | afgeleid |

Wat afgeleid is, rekent de app bij het openen opnieuw uit de tekst en de invoer;
het staat er voor andere lezers. Opslaan, openen en opslaan geeft dezelfde inhoud,
afgezien van het tijdstempel.

De formaatversie (`PROJECT_FORMAAT_VERSIE`, nu 2) staat in `header.dataVersion`.
Oudere vormen blijven openen en worden bij opnieuw opslaan versie 2: een bestand
met `project` als eigen veld, een los blad, of een `.cpd`. Een bestand zonder
`project` wordt geopend als een project met één exemplaar, zodat er nooit werk
verloren gaat. Het eerste opslaan over een oud bestand laat in de app een kopie
`<naam>.v1.bak` achter.

## Koppeling met een model

`elementen` legt vast over welke elementen in een bronmodel dit blad gaat. Leeg
is de normale toestand: een losstaande berekening. Zie
[ifc-export.md](ifc-export.md) — daar staat waarom die koppeling wordt aangewezen
en niet geraden, en wat er nog voor nodig is.

## Exporteren

`Opslaan` schrijft het hele project als één IFCX-document, want dat is wat de
rest van het OpenAEC-ecosysteem van dit programma verwacht. De tab IFC toont dat
document en de STEP die eruit volgt, en exporteert ze. Details in
[ifc-export.md](ifc-export.md).

`PDF opslaan` (en de Print-knop, en Ctrl+P) bouwt het hele project op als één
afdrukbaar document: een voorblad uit de projectgegevens, een inhoudsopgave,
daarna elk blad op een eigen pagina — met **het parametrische beeld** erboven en
de uitwerking eronder. Drie balklagen leveren dus drie hoofdstukken op, niet
alleen degene die toevallig openstond. In de printdialoog kies je "Opslaan als
PDF". De knop Rapport slaat die dialoog in de app op Windows over: je kiest een
bestandsnaam en de PDF staat er.

Met **Voorbeeld** zie je diezelfde weergave op het scherm. Dat is geen luxe: de
afdrukopmaak hangt aan een klasse (`html.afdrukmodus`) in plaats van aan
`@media print`, juist zodat hij te controleren is zonder hem uit te draaien.

Het beeld dat elk blad meekrijgt komt van zijn eigen exemplaar, niet van het
blad dat openstaat. Dat loopt via `ExemplaarContext` in `store/actiefBlad.ts`:
de designers lezen normaal het actieve blad, en de afdruk zet er per blad een
ander voor in de plaats. `alleenLezen` staat daarbij aan — een afdruk hoort niets
aan je project te veranderen, ook geen standaardwaarden aan te vullen.

Dat gaat bewust via de browser en niet via de Rust-rapportengine — zie
`docs/backlog.md`. De engine slaat tekeningen over, en zonder de
`openaec-reports`-repo is de app niet eens te bouwen.

## Twee versies vergelijken

De knop **Vergelijken** (tab Start, groep Uitvoer) zet het project dat openstaat naast een
gekozen bestand: een ander projectbestand (`.ifccalculation`, `.ifcx`), een oudere versie
van hetzelfde project, of een los blad (`.cpd`). Het bestand wordt alleen gelezen en
doorgerekend, nooit geopend of veranderd.

- **De bladen** worden gekoppeld op id (een opgeslagen versie van hetzelfde project), dan op
  kenmerk (`#4`), dan op naam. Per blad staat erbij of het gelijk is, gewijzigd, of alleen
  aan één kant staat.
- **Per blad** het oordeel (UC en voldoet/voldoet niet), de rekentekst regel voor regel naast
  elkaar (een minimaal verschil, met de gewijzigde regels tegenover elkaar), de invoer en de
  uitkomsten per naam. Standaard alleen de verschillen, met twee regels eromheen; met een
  vinkje de hele tekst en alle namen. Bij twee getallen met dezelfde eenheid staat het
  relatieve verschil erbij.
- **De projectgegevens** die verschillen, staan bovenaan.
- **Elke kant rekent met zijn eigen project:** de uitkomsten van het bestand komen uit de
  projectgegevens, de belastingen en de bladen van dat bestand. Zo is een andere gevolgklasse
  in de uitkomsten te zien, ook als de rekentekst gelijk is.
- **Waar:** `store/vergelijken.ts` (koppelen, regelverschil, tabellen; zonder React) en
  `components/calc/VergelijkVenster.tsx`. Controle: `scripts/check-vergelijken.mjs`.
- **Nog niet:** twee bladen binnen hetzelfde project naast elkaar zetten, of een versie uit
  de geschiedenis van ongedaan maken; vergelijken gaat altijd tegen een bestand.

## Toetsregistratie (vier ogen)

Elk blad met rekentekst heeft een tab **Controle**. Een tweede constructeur legt daar een
controle vast: controleur, datum, uitkomst (*akkoord*, *akkoord met opmerkingen* of
*afgekeurd*) en opmerkingen, en of het blad daarmee is **vrijgegeven**. Een afgekeurd blad
wordt nooit vrijgegeven. Eerdere controles blijven staan; de laatste telt.

- **De hash:** elke controle bewaart de sha256 van de rekentekst (met `\n` als regeleinde),
  de invoer (op naam gesorteerd), de uitkomst (de UC, het oordeel en elk getal van de
  uitwerking op 12 significante cijfers) en van die drie samen (`store/controle.ts`). De app
  rekent het blad daarvoor door zoals de uitwerking, met de projectgegevens, de belastingen
  van het rapport, de bladen waarnaar het verwijst en de vastgelegde antwoorden van FEM
  Studio, altijd op de bron (de Nederlandse rekentekst): in elke taal dezelfde hash.
- **Vergrendelen** gebeurt met die hash, niet door het blad dicht te zetten. Verandert na
  een vrijgave de rekentekst, de invoer of de uitkomst (ook door een andere gevolgklasse in
  de projectgegevens), dan zegt de tab Controle, het label in de tabbalk en de kop op
  papier dat de vrijgave niet meer geldt, en wat er veranderd is. Het label in de tabbalk
  vergelijkt alleen rekentekst en invoer (snel, bij elke toetsaanslag); de tab en de kop op
  papier rekenen ook de uitkomst na.
- **Op papier:** in de kop van het blad wie het controleerde, wanneer, en of de vrijgave
  nog geldt, met de eerste 12 tekens van de hash. Alleen bij een blad met een controle.
- **Exporteren:** de tab Controle exporteert alle controles van het project als CSV
  (puntkomma, UTF-8 met BOM) of JSON, met per blad of de vrijgave nog geldt.
- **In het bestand:** `ocss::blad::controle`. Een kopie van een blad (dupliceren, een
  variant als blad) neemt de controle niet mee.
- **Controle:** `scripts/check-controle.mjs` (ook de sha256 tegen `node:crypto`).

## Normen en nationale bijlagen

Welke editie van een norm en welke nationale bijlage in een project gelden, staat in de
projectgegevens onder de sleutel `normen_editie`, als JSON-lijst
`[{"onderwerp":"hout","norm":"NEN-EN 1995-1-1","editie":"…","nb":"…"}]`
(`store/projectNormen.ts`, ingevuld in het vak *Normen en nationale bijlagen* van de
projectgegevens). Zo gaat de vastlegging mee in het bestand (`ocss::project`), het
herstelbestand, ongedaan maken en `project_data_set`. Het is geen variabele in de bladen.

- **Op papier:** het voorblad van de losse bladen heeft een tabel met norm, editie en
  nationale bijlage, of de zin dat ze niet zijn vastgelegd. In de kop van elk blad (ook in
  bijlage A van het rapport) staan de editie en de bijlage van elke Eurocode die het blad
  noemt; een norm die het project niet vastlegt, staat er als niet vastgelegd. Legt het
  project niets vast, dan blijft de kop zoals hij was.
- **Welke normen een blad noemt:** elke `EN 199x(-y-z)` in de rekentekst, en EN 1990 als
  het blad `K_FI` gebruikt. Een regel `NEN-EN 1991` dekt alle delen van EN 1991.
- **Uit de bladen:** de knop zet de Eurocodes die de bladen noemen in de lijst, zonder
  editie en bijlage. De app vult zelf nooit een editie in.
- **Samenhang met de landenkeuze (pull request #30):** de onderwerpen zijn dezelfde sleutels
  als `Onderwerp` in `rapport/normen/landen.ts` van #30, en het lezen van de normen van een
  blad is dat van `bladNormUit` daar. #30 kiest een land en noemt de normen met hun editie
  per land; deze vastlegging legt vast wat in dít project geldt. Na samenvoegen kan de lijst
  uit de normen van het gekozen land worden gevuld, en blijft deze lijst de bron voor de
  afdruk. De velden van #30 (`land`, `eurocode_generatie`) en deze sleutel zitten elkaar niet
  in de weg.
- **Nog niet:** het voorblad van het rapport houdt zijn eigen tekstveld *Toegepaste normen*;
  de vastlegging staat daar (nog) niet in, wel in de kop van elk blad in bijlage A.
- **Controle:** `scripts/check-projectnormen.mjs`.

## Eenheden

Het eenhedenstelsel hoort bij het project en staat in de projectgegevens, zodat opslaan,
het herstelbestand, IFCX en ongedaan maken vanzelf meewerken (`store/projectEenheden.ts`):

| Sleutel | Inhoud |
| --- | --- |
| `eenheden` | `blad` (zoals in het blad, de standaard), `si-mm`, `si-m`, `us` of `eigen`; een keuzeveld in `PROJECT_VELDEN`, maar geen variabele in de bladen |
| `eenheden_eigen` | bij `eigen`: de eenheid per grootheid, als JSON (`{"kracht":"N"}`) |
| `eenheden_lijst` | de eigen eenheden van het project, als JSON (`[{"naam":"kipf","uitdrukking":"1000 lbf"}]`) |

Het stelsel raakt alleen de weergave, overal waar een waarde in beeld komt:

- **De uitwerking en het afdrukvoorbeeld:** `ex.waarden` blijven in de eenheid van de
  bladtekst. Een invoerveld toont de waarde in het stelsel en rekent terug wat je typt.
- **De parametrische beelden:** ze rekenen in de eenheden van het blad en tonen maten, lasten
  en spanningen in het stelsel (`components/calc/beeldEenheden.ts`). Wat je in een beeld
  typt, gaat terug in de eenheid van het blad.
- **Het rapport:** het slaat zijn invoer op in zijn eigen eenheid (m, kN/m², kN/m³), op zes
  cijfers en met de decimale komma van zijn taal (`rapport/paneel/EenheidInvoer.tsx`).
  Op papier staan de waarden in het stelsel (`fe` en `ne` in `useRapportWeergave.ts`).
- **De IFCX-export** blijft in de eenheden van het blad.

Een nieuw project krijgt het stelsel uit Instellingen, tab Units. Dat is `units.stelsel` in
de instellingen, ook via `settings_set`. Het stelsel van het open project is het
projectgegeven `eenheden`, ook via `project_data_set`. Zie
[het ontwerp](superpowers/specs/2026-11-06-eenheden-design.md).

## Locatie

De plek van het project voor de situatiekaart staat in de projectgegevens onder de sleutel
`locatie_punt`, als JSON `{"lat":52.0907,"lon":5.1214}` met 6 decimalen (`kaart/punt.ts`).
De LocatieKiezer onder het veld Locatie schrijft hem (`components/calc/LocatieKiezer.tsx`).
Ontbreekt de sleutel of is de waarde ongeldig (geen JSON, lat buiten ±90, lon buiten ±180),
dan heeft het project geen locatie.

De kaarten van die plek staan in het rapport, als `rapport.situatie`: vaste kaartbeelden
(`gebied`, `omgeving`, `locatie`) als JPEG met zoomniveau, het punt en de datum waarvoor ze zijn
gemaakt, het vinkje `tonen` en het gemeten `water`. Ze worden bewaard in het
project en veranderen niet meer tot de gebruiker ze vernieuwt. Op papier verschijnt de pagina
alleen als het project een geldige locatie heeft. `water` is `{afstand, naam, punt}` (afstand in meters, `punt` het dichtstbijzijnde punt van het
water). Ontbreekt `water`, dan is er niet gemeten en staat er op papier "—". Is `water` `null`, dan
is er gemeten en ligt er geen open water binnen 10 km. Is het dichtstbijzijnde water de kustlijn, dan staat `soort: "kust"` in `water` (de kust heeft zelden een naam) en volgt "(kust)" op papier. Beperking: een rivier die in OpenStreetMap alleen als lijn (`waterway=river`, zonder vlak) staat, telt niet mee. De omgevingskaart toont bij een meting de
lijn naar het water. Een nieuwe meting is een handeling van de gebruiker (de knop bij de locatie);
bij het vernieuwen van de kaarten blijft `water` alleen staan als het punt gelijk is gebleven.
`report_get` en `report_set` geven per kaart
alleen `{id, zoom, bytes}` terug, niet de JPEG.

Bij de locatie staat de knop "Overnemen uit ERPNext", als de ERPNext-instellingen (adres, API-sleutel,
veldnaam) gevuld zijn, er een API-geheim is voor dat adres en `project_nummer` gevuld is. De knop leest dat
veld bij het project met die naam in ERPNext (standaard `custom_location`). Coördinaten gaan direct,
een adres gaat via de zoekdienst; het punt vervangt `locatie_punt` pas als het gevonden is, en de kaarten
worden daarna opnieuw gemaakt. Het geheim staat in de sleutelbos van het besturingssysteem, per
herkomst (schema, host en poort) van het adres, en komt nooit in het project. Het veld bestaat niet standaard
in ERPNext: een beheerder maakt een Custom Field `custom_location` (Data) op Project. De tekst die de laatste keer uit ERPNext kwam staat als `locatie_erp` in de projectgegevens; alleen een leeg veld Locatie, of een gelijk aan `locatie_erp`, wordt door een nieuwe tekst vervangen.

## Taal van het rapport

Het rapport heeft een eigen taal, `Rapport.taal` in `ocss::rapport`, los van de taal
van de app. Een nieuw rapport neemt de taal van de app over; een rapport van vóór
versie 5 van de rapportopbouw krijgt `nl`, want zijn inhoud is Nederlands. Op papier
volgt alles die taal: de vaste woorden (`rapport.json`, onder `afdruk`), de koppen, de
rekenbladen en de getallen. Op het scherm volgt de uitwerking de taal van de app.

Wat de app meelevert is meertalig (`rapport/meertalig.ts`), met Engels als bron. Een
rapport bewaart de tekst in zijn eigen taal. Wisselen (`rapport/taalwissel.ts`) zet wat
gelijk is aan een meegeleverde waarde om; eigen tekst blijft staan, en
`Rapport.tekstTaal` onthoudt per tekst-id de taal waarin hij is getypt. De tekst-id's en
de ankers op papier veranderen niet met de taal. `scripts/check-rapport-talen.mjs` legt
een oud rapport naast de html van vóór de talen (`scripts/fixtures/rapport-oud-*.html`)
en doorzoekt een compleet Engels rapport op Nederlandse woorden.

De rekentekst van een blad (`source`) is altijd de bron, in de taal van de module.
De tab Code toont hem in de taal van de app en zet een bewerking regel voor regel terug
(`bronNaBewerking` in `components/calc/uitvoerTaal.ts`). De rekenversie, `bronVersie`,
de invoersleutels en de beelden lezen dus de bron, in elke taal hetzelfde.

## Rapporttemplate

De hoofdstukindeling van een rapport is een boom knopen (`Knoop` in `rapport/opzet.ts`).
`OPZET` is het ingebouwde template "Standard report": vast in de app en niet te
overschrijven. Een rapport kan een eigen kopie hebben, `Rapport.opzet` in `ocss::rapport`,
zoals het een kopie van het bureau heeft. Ontbreekt die, dan geldt het ingebouwde template,
dus een bestaand project blijft tot op de letter hetzelfde; een gewijzigd template verandert
geen bestaand rapport. `bouwOpzet` leest de opzet van het rapport en blijft de enige bron
van de nummers voor het paneel, de inhoudsopgave, het zijpaneel en de afdruk.

Een template is een bestand `*.reporttemplate` (`rapport/template.ts`), JSON:

| veld | |
|---|---|
| `formaat` | `open-calcsheet-report-template` |
| `versie` | 1 |
| `naam` | de naam per taal; Engels ontbreekt nooit |
| `opzet` | de knopen: `id`, `titel` per taal, `niveau`, `inhoud`, `optioneel`, `nieuwePagina`, `inspringen`, `kinderen` |
| `teksten` | per tekst-id de varianten (`label`, `tekst`), zoals `rapport/standaardteksten.ts`; de eerste is de tekst waarmee een nieuw rapport begint |
| `leeg` | tekst-id's die leeg beginnen, al hebben ze varianten om uit te kiezen (optioneel) |
| `opmaak` | `constructieprincipe`, `subkoppen`, `bladenInInhoud` |
| `huisstijl` | gaat in het rapport boven de huisstijl van het bureau (optioneel) |
| `land` | wordt bewaard en doorgegeven in `Rapport.template` (optioneel) |

Een template is onbetrouwbare invoer. `leesTemplate` controleert elk veld: een bestand dat
geen template is, geeft een melding en verandert niets; wat in een geldig template niet klopt,
wordt hersteld en gemeld. Elk id komt één keer voor en is veilig als sleutel en als anker, het
niveau volgt de diepte, en een onbekende `inhoud` bereikt de afdruk niet.

Een onderdeel is tekst (`inhoud: "tekst"`), alleen een kop (geen `inhoud`), of een rekenblok
(`REKENBLOKKEN`): de app vult dat zelf. Een rekenblok plaats je uit een lijst, hooguit één keer,
onder zijn vaste id: daar hangen zijn tekst en keuzes aan. Het heeft geen kinderen. Berekeningen
staat altijd op het hoogste niveau, omdat de bladen eronder komen. Ontbreekt dat hoofdstuk, dan
staan alle bladen in bijlage A (`bladenInBijlage`).

Wat je uit de opzet haalt, verdwijnt niet: de tekst blijft in `Rapport.teksten`, het onderdeel
staat in `Rapport.weggehaald` en komt met zijn tekst terug als je het terugzet. Een getypte
titel hoort bij de taal van het rapport; een andere taal valt terug op Engels of op wat er wel
staat. Een template toepassen laat getypte tekst staan; alleen wat niemand aanraakte, volgt het
template. Eigen templates staan in de instellingen (`store/rapportTemplates.ts`), en één daarvan
kan de standaard voor nieuwe rapporten zijn. `scripts/check-rapporttemplate.mjs` toetst dit alles,
ook in de echte afdruk en het echte paneel.

## Ongedaan maken

Eén stapel voor het hele project (`verleden` / `toekomst` in `projectStore.ts`),
niet één per onderdeel. Ctrl+Z draait dus hetzelfde terug of je nu in de
rekentekst typt, een maat in het parametrische beeld versleept, een blad
hernoemt of er een verwijdert.

De editor heeft zijn eigen geschiedenis daarom **uit** (`basicSetup.history:
false`). Twee stapels naast elkaar geeft een onvoorspelbare volgorde: dezelfde
toets zou dan eens een letter en dan weer een verwijderd blad terugdraaien.

Doortypen in hetzelfde veld telt als één stap (700 ms samenvoegvenster).
Handelingen die je los wilt kunnen terugdraaien — invoegen, verwijderen,
hernoemen, verplaatsen — krijgen altijd hun eigen stap. Automatisch seeden van
standaardwaarden komt níét in de geschiedenis: dat is geen handeling van jou.

Een momentopname bewaart alleen verwijzingen naar `exemplaren` en `gegevens`.
Omdat elke mutatie een nieuw object maakt en de rest ongemoeid laat, delen
opeenvolgende stappen bijna alles; tweehonderd stappen kosten daardoor
nauwelijks geheugen. De geschiedenis wordt niet opgeslagen — hij geldt per
sessie en wordt gewist bij Nieuw en bij het openen van een bestand.

## Wat er verdwenen is

De belastinggeval-laag (`loadCaseStore`, `LoadCaseTabs`) is weg. De tabbalk werd
nergens gerenderd — het component was nooit geïmporteerd — terwijl de store
eronder wél de waarden van alle bladen door elkaar husselde. UGT en BGT worden
per blad volgens de norm berekend; dat is geen invoerlaag.
