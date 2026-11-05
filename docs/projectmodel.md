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
| Projectnaam | `bsi::ifc::prop::Name` op het project | bron |
| Projectgegevens, verborgen onderdelen | `ocss::project` | bron |
| Constructierapport | `ocss::rapport` | bron |
| Naam van een blad | `bsi::ifc::prop::Name` op het blad | bron |
| Id, volgorde, `templateId`, `bronVersie` | `ocss::blad` | bron |
| Rekentekst | `ocss::blad::rekentekst` | bron |
| Invoer | `ocss::blad::invoer` | bron |
| Elementen uit een bronmodel | `ocss::blad::elementen` | bron |
| PDF | `ocss::blad::pdf` | bron |
| Werkmap | `ocss::blad::xlsx` | bron |
| Markdown-tekst, met de afbeeldingen die naast het bestand stonden | `ocss::blad::markdown` | bron |
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
