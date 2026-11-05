# Internationaal rapport: ontwerp

Datum: 05-11-2026

## Doel

Open CalcSheet Studio moet buiten Nederland bruikbaar zijn. De basis is niet Nederlands: staat de
app op Engels, dan is alles Engels, ook het volledige rapport. Een bureau bouwt zijn eigen
rapportformat in. Er komt een grote bibliotheek met gewichten als eigen bestand. Het rapport weet
welke normen waar gelden. Een wijziging op een berekening wordt een versie binnen het projectbestand,
met een lijst per pagina van wat er veranderd is.

Niet in dit ontwerp: Excel, geotechniek, Word-invoer, gegevens automatisch ophalen bij een externe
dienst, en het omzetten van code, commentaar en documentatie naar het Engels. Code en commentaar
blijven Nederlands; het gaat om wat de gebruiker ziet.

## Afspraken voor alle onderdelen

- **Bestaande projecten** openen en ogen zoals nu. Een nieuw veld krijgt bij het lezen van een oud
  bestand de waarde die het oude gedrag geeft (`normaliseerRapport`, `RAPPORT_VERSIE`).
- **Meertalige gegevens** gebruiken precies dit bestand, `packages/desktop/src/rapport/meertalig.ts`:

  ```ts
  /** Tekst per taal. Engels is de bron en ontbreekt nooit. */
  export type Meertalig = { en: string } & Record<string, string>;

  /** De tekst in deze taal; ontbreekt die, dan Engels. */
  export function inTaal(m: Meertalig, taal: string): string {
    return m[taal] ?? m.en;
  }
  ```

- **Vaste schermtekst** gaat via de vertaalbestanden in `i18n/locales`, altijd in alle talen.
- **Een eigen bestand** (template, bibliotheek) is onbetrouwbare invoer: elk veld wordt gecontroleerd
  zoals in `normaliseerRapport`, en een onleesbaar bestand geeft een melding en verandert niets.
- **Vormgeving:** alleen de bestaande tokens (`--oa-*`) en onderdelen (`ThemedSelect`, `Sectie`).
- **Getallen** komen nooit uit het geheugen. Een waarde of normnummer zonder controleerbare bron komt
  er niet in.
- **Op papier** blijft een rekenblad rond de 3 pagina's; uitleg staat alleen op het scherm.
- **Testen:** pure functies zonder React, met eerst een falende controle in `scripts/check-*.mjs`.

## 1 Talen (`rapport-talen`, vanaf main)

Lost issue #25 op.

- `Rapport.taal: string`. Een nieuw rapport neemt de taal van de app over, een oud rapport krijgt
  `"nl"`, want zijn inhoud is Nederlands. Te kiezen in de sectie Document van het rapportpaneel.
- Engels is de bron van alles wat de app voor het rapport meelevert, Nederlands is een vertaling:
  - `Knoop.titel` en `titelNieuwbouw` in `rapport/opzet.ts` worden `Meertalig`;
  - `Tekstvariant.label` en `.tekst` in `rapport/standaardteksten.ts` worden `Meertalig`;
  - materialen, standaardwaarden en suggestielijsten in `rapport/materialen.ts`,
    `rapport/normwaarden.ts` en `rapport/model.ts` volgen hetzelfde patroon. `gewichten.ts` hoort bij
    onderdeel 3 en blijft hier van af.
- De afdruk in `components/rapport/afdruk/` schrijft vaste woorden in `rapport.taal`, via
  `i18next.getFixedT(taal, "rapport")`, niet via de taal van de app. Rekenbladen in het rapport volgen
  ook `rapport.taal`, via de bestaande route in `templates/vertalingen.ts`. Op het scherm volgt de
  uitwerking de taal van de app.
- **Wisselen van taal:** een tekst die gelijk is aan een meegeleverde variant in welke taal dan ook,
  wisselt mee. Eigen tekst blijft staan. `Rapport.tekstTaal: Record<string, string>` onthoudt per
  tekst-id de taal waarin hij is getypt, en het paneel toont bij zo'n tekst een melding dat hij nog in
  een andere taal staat. Automatisch vertalen doen we niet.
- **Rest van de app:** alle hardgecodeerde Nederlandse schermtekst naar de vertaalbestanden, in
  `components/`, `store/`, `mcp/` en de lintconfiguratie. Een controle bewaakt dat: zichtbare
  letterlijke tekst in JSX en in `title`, `placeholder` en `aria-label` zonder `t(` valt op.
- De tekst die een blad krijgt bij het invoegen van een module staat nu in de Nederlandse bron. Toont
  de tab Code een Engelse gebruiker Nederlands, dan krijgt die de vertaalde tekst, voor zover dat de
  rekenversie (`bladVersie.ts`) niet breekt. Breekt het wel, dan blijft het zoals het is en wordt het
  gemeld.
- **Bewijs:** de controle zet een compleet rapport in het Engels op en doorzoekt de html op
  Nederlandse woorden. Een oud rapport heeft dezelfde koppen en teksten als voorheen.

Valkuilen: een oud bestand zonder `taal`; een tekst-id zonder vertaling; `titelVan` bij nieuwbouw;
de inhoudsopgave en het zijpaneel (`inhoudVoorPaneel`) in de taal van het rapport; het anker en de
tekst-id veranderen niet mee met de taal.

## 2 Rapporttemplate (`rapport-template`, vanaf `rapport-talen`)

Ons format blijft de standaard, maar is aanpasbaar.

- Een **template** is een bestand `*.reporttemplate` (JSON):
  `{ formaat: "open-calcsheet-report-template", versie: 1, naam: Meertalig, opzet: Knoop[], teksten,
  opmaak, huisstijl?, land? }`. `teksten` geeft per tekst-id de varianten, zoals
  `standaardteksten.ts`.
- `OPZET` wordt het **ingebouwde template** "Standard report": vast in de app, niet te overschrijven.
  Eigen templates staan in de instellingen (naast `bureauProfiel`). Eén daarvan kan de standaard voor
  nieuwe rapporten zijn.
- `Rapport.opzet?: Knoop[]`: het rapport houdt zijn eigen kopie, zoals `rapport.bureau`. Ontbreekt die,
  dan geldt het ingebouwde template. Een gewijzigd template verandert dus geen bestaand rapport.
  Alles wat nu `OPZET` en `TEKST_IDS` leest, leest de opzet van het rapport.
- **Bewerken** in een nieuwe sectie "Report structure" van het rapportpaneel: hoofdstukken, paragrafen
  en tekstblokken toevoegen, hernoemen, verwijderen en verplaatsen; per onderdeel een nieuwe pagina.
- **Rekenblokken** (`bouwwerk`, `brand`, `materialen`, `factoren`, `sneeuw`, `wind`, `veranderlijk`,
  `blijvend`, `berekeningen` enzovoort) rekent de app zelf uit. Je plaatst ze uit een lijst, elk
  hooguit één keer, en de tekst erin kun je niet vervangen.
- Knoppen: template openen, bewaren als template (bestand), als standaard instellen, terug naar het
  ingebouwde template.

Valkuilen: een template met een onbekende `inhoud`; een dubbel id; een verwijderd hoofdstuk waar nog
tekst in staat (blijft bewaard in `rapport.teksten`, komt terug als je het onderdeel terugzet); een
template zonder `berekeningen` terwijl er bladen zijn (bijlage A blijft kloppen); de nummering van
paneel, inhoudsopgave en afdruk blijft één bron (`bouwOpzet`).

## 3 Gewichtenbibliotheek (`gewichten-bibliotheek`, vanaf main)

- Een bibliotheek is een bestand `*.weightlibrary` (JSON). De app levert er één mee. Je kunt die
  opslaan als eigen bestand, een eigen bibliotheek openen, er regels aan toevoegen, en delen.
- Een regel: `{ id, categorie, naam: Meertalig, d?, rho?, p?, toestand?, leverancier?, regio?, opmerking?:
  Meertalig, bron: { titel, url?, datum? } }`. Eenheden zoals `gewichten.ts`: d in m, ρ in kN/m³, p in
  kN/m². Een ingevulde p gaat voor d × ρ.
- **Categorieën:** materialen, vloeren (kanaalplaat per leverancier en dikte, breedplaat, massief,
  staalplaat-beton, hout, CLT), wanden (metselwerk per soort en leverancier, kalkzandsteen, gipsblokken,
  HSB, CLT), daken, gevels, afwerkingen, plafonds en installaties, grond, opslag.
- **Inhoud:** zoveel als we met bron kunnen vinden, zonder vast aantal. Elke waarde heeft een bron die
  te controleren is, en de `url` opent daarnaartoe. De huidige regels uit `gewichten.ts` blijven, met
  als bron "eigen gewichtenoverzicht".
- **Normen:** geen tabel uit een norm vrijwel integraal overnemen. Losse waarden met bron, in eigen
  selectie en volgorde. Merk- en leveranciersnamen mogen voor bouwproducten; de oude regel in
  `gewichten.ts` vervalt. Namen van externe rekensoftware blijven verboden, ook in `bron`.
- **Scherm:** zoeken en filteren op categorie, leverancier en regio, en met één klik in een opbouw
  invoegen vanuit `OpbouwEditor`. Plus een eigen plek om de bibliotheek te doorbladeren in het
  projectpaneel of als venster.

Valkuilen: lege of tegenstrijdige waarden (p en d × ρ wijken af: de controle meldt het); kg/m² en
kg/m³ uit leveranciersbladen moeten omgerekend (1 kg ≙ 0,00981 kN); nat en droog apart; dubbele id's
bij samenvoegen van bibliotheken; een bestaand rapport bewaart getallen, niet de verwijzing, dus het
verandert niet als de bibliotheek verandert.

## 4 Normen per land (`normen-per-land`, vanaf `rapport-talen`)

- `rapport/normen/landen.ts`: per land of regio de normen per onderwerp (belastingen, wind, sneeuw,
  aardbeving, beton, staal, hout, metselwerk, funderingen), de uitgever, de editie, welke grootheid de
  locatie levert, en een link naar de officiële bron. Alleen wat is bevestigd; wat alleen uit een
  secundaire bron komt, staat er niet in of is als zodanig gemarkeerd.
- De keuze `land` hoort bij het project. Een oud project krijgt `"NL"`. Een nieuw project volgt de
  regio van het systeem als die in de lijst staat, anders "Eurocode zonder nationale bijlage". Een
  template kan het land vastleggen.
- Het veld `Rapport.normen` en de normenlijst in het rapport volgen het land.
- **Wind en sneeuw:** Nederland houdt de kaart en de berekening. Elders vul je de grootheid in die
  daar geldt, met de bron erbij. Een aardbevingsblok met dezelfde opzet.
- **Factoren:** Nederland blijft zoals het is. In Eurocode-landen staan de aanbevolen waarden uit
  EN 1990 als aanpasbare invoer, met de melding dat de nationale bijlage ze kan wijzigen. Buiten de
  Eurocodes vult de gebruiker de combinaties zelf in.
- **Tweede generatie Eurocodes:** per project te kiezen welke generatie geldt, zodat de overgang tot
  30-03-2028 past.

Valkuilen: een Nederlands project mag niets veranderen, tot op het getal; blokken die aan Nederlandse
tabellen vastzitten (`normwaarden.ts`) tonen elders geen Nederlandse uitkomst; rekenbladen die aan
Eurocode-formules vastzitten krijgen geen schijn van geldigheid in de VS.

## 5 Versies in het bestand (`versies-in-bestand`, vanaf `rapport-template`)

- Geen echte git: de versies staan in het projectbestand en je hoeft niets te installeren.
- `Versie: { id, code, naam, datum, omschrijving, ouder?, inhoud }`. `inhoud` is een kopie van de hele
  projectstand: de bladen, de projectgegevens en het rapport. Grote bijlagen (PDF, werkmappen) staan
  één keer in het bestand en worden per inhoudshash aangewezen, zodat tien versies niet tien keer de
  PDF opslaan.
- **Bediening:** "Nieuwe versie" maakt een tak van de huidige stand. Wat je daarna wijzigt, staat alleen
  daarin. Wisselen kan altijd, ook terug naar het origineel, en wisselen verliest niets. Een oude
  versie blijft bewerkbaar, want het is een tak. Elke versie is een regel in de revisietabel op het
  voorblad.
- **Vergelijken:** per blad wat er aan invoer, rekentekst en uitkomsten verschilt met de oudertak.
  Pagina's komen uit de ankers van het afdrukvoorbeeld (`paginaVanAnkers`).
- **In het rapport:** een rekenblok `wijzigingen` bij de inhoudsopgave, per pagina wat er gewijzigd is,
  met een aanvulling van de gebruiker per regel. De gebruiker kan regels aanpassen of verwijderen.
  Die keuze blijft bewaard als de lijst opnieuw wordt gemaakt.

Valkuilen: een oud bestand zonder versies is één versie; ongedaan maken over een wissel heen; opslaan
terwijl een veld open staat (`registreerBewaarder`); een blad dat in de ene versie niet bestaat; een
hernoemd blad (vergelijken op `id`, niet op naam); een bestand met kapotte versies opent nog steeds
de laatste bruikbare stand.

## 6 Duits en Frans (`talen-de-fr`, als laatste)

De app en het rapport krijgen Duits en Frans. Dat is een eigen vertaling die nog geen vakvertaler heeft
gezien; de taalkeuze in de app zegt dat er eerlijk bij. Rekenbladen zonder vertaling vallen terug op
Engels. Een controle bewaakt dat elke taal dezelfde sleutels heeft.

## Volgorde

1. `rapport-talen` en `gewichten-bibliotheek`, naast elkaar.
2. `rapport-template` en `normen-per-land`, op `rapport-talen`.
3. `versies-in-bestand`, op `rapport-template`.
4. `talen-de-fr`, als de teksten vaststaan.
