# Situatiekaart op pagina 2 van het rapport — ontwerp

## Aanleiding

Bij het begin van een berekening wil de constructeur zien waar het project ligt. Op de kaart
beoordeelt hij of de omgeving bebouwd of onbebouwd is (de terreincategorie voor wind) en
hoe ver het open water is. Dat moet ook in het rapport staan, zodat een lezer die keuze kan
nalopen: voortaan op pagina 2, direct na het voorblad.

Nu bewaart een project alleen een vrij tekstveld `locatie`. De windkaart in de
projectgegevens (`components/calc/WindAreaMap.tsx`) zoekt een adres op met Nominatim, maar
alleen in Nederland. Hij bepaalt daarmee het windgebied en bewaart geen coördinaten.

## Uitgangspunten

- **De locatie** kies je in de projectuitgangspunten (de projectgegevens).
- **Uit ERPNext:** staat het project daar al met een locatie, dan neemt de app hem over.
- **De terreincategorie** (bebouwd of onbebouwd) kies je zelf. De kaart is het bewijs bij
  die keuze. Optioneel helpt de app: hij meet de afstand tot open water, of later doet een AI
  een voorstel.
- **Bronnen:**
  - OpenStreetMap, zodat het wereldwijd werkt;
  - geocoding via Nominatim;
  - voor het water de Overpass-API (overpass-api.de).
- **Volgorde:** eerst deze kaart. Een volledige headless API van de app is een apart, later
  project.

## Doelen

1. Een project heeft een locatie als punt: breedte- en lengtegraad, naast het adres als tekst.
2. Die locatie kies je in de projectgegevens. Je zoekt een adres, waar ook ter wereld, en
   zet de speld daarna met een klik op de kaart precies goed.
3. Het rapport heeft op pagina 2 een pagina **Situatie** met de locatie op drie
   zoomniveaus:
   - het gebied, ongeveer 10 tot 20 km breed;
   - de omgeving, ongeveer 2 km;
   - de locatie zelf, ongeveer 300 m.

   Op elke kaart staan een speld, een schaalbalk en de bronvermelding.
4. Op de pagina staan ook:
   - het adres en de coördinaten;
   - de terreincategorie uit de projectgegevens: 0 (zee of kust), II (onbebouwd) of
     III (bebouwd). Dat is dezelfde waarde die het rapport bij de wind toont, met de
     vermelding dat de constructeur hem kiest. Keuze: geen aparte bevestiging. Het
     veld heeft altijd een waarde, standaard II, en zo staat hij nu ook al in hoofdstuk 5.
   - de afstand tot het dichtstbijzijnde open water, met zijn naam als OSM die kent;
   - de datum van de kaart.
5. Met één knop meet de app die afstand tot open water. Op de omgevingskaart staat een lijn
   van de speld naar het water, met de afstand erbij.
6. Is het project gekoppeld aan ERPNext en heeft ERPNext een locatie, dan vult de app die in.

## Niet-doelen (nu niet)

- **De terreincategorie automatisch kiezen.** Een AI-voorstel komt later; de constructeur
  beslist.
- **Een draaibare of verschuifbare kaart op papier.** Op papier staat een vast beeld.
- **Zoeken terwijl je typt.** Nominatim staat dat niet toe; zoeken gebeurt bij Enter of
  met een knop.
- **Luchtfoto's of landelijke kaarten** (zoals PDOK in Nederland). Misschien later, als
  extra bron.
- **Kaarten zonder internet** of een eigen kaartenserver meeleveren.
- **De headless API.** Dat is een eigen project.

## Anti-doelen (dan is het mislukt, ook als het technisch werkt)

- **Het rapport verandert stil** als OpenStreetMap later verandert. Een opgeleverd rapport
  moet hetzelfde blijven. Daarom staat de kaart als vast beeld in het project, met zijn datum.
- **De app hangt of geeft een kapotte pagina** zonder internet. Dan blijft de bestaande kaart
  staan; ontbreekt die, dan valt de pagina weg of staat er een nette melding.
- **De gebruiksregels van OpenStreetMap, Nominatim of Overpass worden overtreden**:
  - geen bronvermelding;
  - veel tegels in één keer downloaden;
  - zoeken bij elke toetsaanslag.
- **De app geeft de indruk dat hij de terreincategorie bepaalt.**
- **Een Nederlandse gebruiker merkt verschil** in het bestaande rapport zonder locatie:
  zonder punt geen nieuwe pagina.

## Randvoorwaarden

- **De gebruiksregels:**
  - OpenStreetMap-tegels: bronvermelding "© OpenStreetMap contributors", geen massaal
    downloaden, alleen de tegels die een kaart echt nodig heeft;
  - Nominatim: hooguit één zoekvraag per seconde, alleen op verzoek van de gebruiker;
  - Overpass: redelijk gebruik, een korte time-out en één vraag per meting.
- **Wereldwijd:** de beperking tot Nederland (`countrycodes=nl`) geldt niet voor deze kaart.
  De windkaart mag Nederlands blijven.
- **Elke tekst in beeld via i18n**, in het Engels en het Nederlands. Op papier volgt de
  pagina de taal van het rapport (`rapport.taal`).
- **Het projectbestand blijft IFCX.** De locatie en de kaartbeelden gaan mee in het project,
  in het herstelbestand, met ongedaan maken en in IFCX. Oude projecten zonder locatie
  openen zoals altijd.
- **Afstanden volgen het eenhedenstelsel van het project:** in US customary in ft of mi.
- **De openbare repo:**
  - geen namen van bureaus;
  - geen namen van andere rekenprogramma's;
  - de ERPNext-koppeling is algemeen: een adres en een sleutel in de instellingen.
- **Kleine PR's vanaf main**, elk met een eigen controlescript.

## Uitwerking

- **Opslag van de locatie:** in de projectgegevens. Daar staan nu het adres (`locatie`) en
  het windgebied al. De locatie komt als punt erbij.
- **Bronnen:** OpenStreetMap-tegels, Nominatim en Overpass.
- **Plaats in het rapport:** een eigen pagina **Situatie** op pagina 2, direct na het
  voorblad. Keuze: hij staat vóór de inhoudsopgave, zonder hoofdstuknummer. De
  inhoudsopgave schuift één pagina op.
- **Het beeld op papier** wordt gemaakt als je de locatie bevestigt of op "Kaarten
  vernieuwen" klikt. Het staat daarna vast in het project, met de datum. Keuze, om het
  anti-doel "het rapport verandert stil" te halen.
- **Geen locatie, geen pagina.** De pagina is ook uit te zetten in het rapportpaneel, net
  als andere onderdelen.
- **ERPNext overschrijft nooit stil.** Is het project gekoppeld, dan staat er een knop
  "Overnemen uit ERPNext". Pas na die klik vervangt de app het adres en zoekt hij het op bij
  Nominatim. Die zoekvraag is dus op verzoek van de gebruiker. Een speld die de constructeur
  zelf zette, blijft staan tot die klik.
- **ERPNext is een nieuwe koppeling.** In de code bestaat nog niets, op een paar losse
  vertalingen na. Ze komt er met:
  - een adres en een sleutel in de instellingen, veilig bewaard;
  - de verzoeken via de Rust-kant, vanwege CORS;
  - het koppelen via het projectnummer: `project_nummer` in de projectgegevens is de naam
    van het project in ERPNext. Dat is de uitgangskeuze.

  Daarom is ERPNext de laatste PR.
- **De locatie in ERPNext is een eigen veld bij het project.** Standaard heeft het doctype Project geen adres- of coördinatenveld. Het adres van de klant is meestal niet de bouwplaats.
  - De naam van het veld staat in de instellingen, want de app is openbaar en elke
    installatie kiest haar eigen naam. Standaard: `custom_location`.
  - Het veld bevat een adres of coördinaten ("52.09, 5.12"). Coördinaten neemt de app
    direct over. Een adres zoekt hij op bij Nominatim, na de klik op "Overnemen uit ERPNext".
  - Het veld bestaat niet standaard; de beheerder van een ERPNext-installatie maakt het aan.

## Aan de bouwer

- Hoe de tegels tot een beeld worden samengevoegd (canvas, schaal, resolutie voor de druk)
  en in welk formaat het beeld in het project staat. Eis: het projectbestand groeit niet
  meer dan enkele honderden kB per kaart.
- De precieze zoomniveaus en de schikking van de drie kaarten op een A4. De bladspiegel van
  het rapport blijft gelden.
- Wat precies "open water" is in de Overpass-vraag, met de zoekstraal: zee en kustlijn,
  meren, brede rivieren; geen sloten en vijvers. Kies een drempel (oppervlakte of breedte)
  en leg hem vast in de code en in de controle.
- Hoe de gebruiker ziet dat een zoekvraag of meting bezig is, mislukt of geen internet heeft.
- Of de windkaart de nieuwe projectlocatie gebruikt in plaats van zelf opnieuw te zoeken.
  Mag, als dat in Nederland niets aan het gekozen windgebied verandert.
- De verdeling in PR's. Voorstel:
  1. de locatie in het project;
  2. de kaartbeelden en de pagina in het rapport;
  3. de afstand tot open water;
  4. ERPNext.
