# Eenheden: een eenhedenstelsel voor alle bladen, Amerikaanse en eigen eenheden — ontwerp

Datum: 06-11-2026
Status: ontwerp, nog niet goedgekeurd
Issue: #22 (Custom Units)

## Aanleiding

Twee wensen die samen één onderdeel worden:

1. **Issue #22.** Een gebruiker vraagt om eigen eenheden en om de Amerikaanse
   eenheden die een constructeur daar gebruikt.
2. **Een eenhedeninstelling die overal doorwerkt.** Per soort grootheid kies je
   de eenheid: lengte in m of mm, kracht in kN, N of kip, spanning in N/mm², MPa
   of ksi, enzovoort. Dat geldt in alle bladen, ook de meegeleverde modules, en in
   de afdruk.

Het doel daarachter: de app mag niet aanvoelen als een Nederlands gereedschap.
Een Amerikaanse constructeur zet de instelling om en ziet zijn eigen eenheden.

## Hoe het nu zit

- **Eenheden komen uit mathjs** (13.2.3), met één instantie in
  `packages/core/src/evaluator.ts:20`, zonder eigen eenheden (`createUnit` komt
  nergens voor).
- **De eenheid van een uitkomst kiest de schrijver van het blad.** Dat gebeurt met
  `to`/`|` (`… to kN*m`) of door wat mathjs laat staan. `simplifyUnitString`
  (`evaluator.ts:2080`) zet de eenheid op een rij. Een voorkeurseenheid bestaat
  nergens.
- **Een invoerveld** (`L = ?{5000}mm`) bewaart in `ex.waarden` het kale getal dat
  de gebruiker typte. De rekenkern plakt er de eenheid uit de bladtekst achter
  (`getalMetEenheid`, `evaluator.ts:1802`). Typ je "5 m" in een veld in mm, dan
  rekent het blad met `5 m mm`.
- **De parametrische beelden** lezen en schrijven kale getallen in de eenheid van
  het blad (`designerKit.tsx:95-128`). Ze lezen uitkomsten in de getoonde eenheid
  (`bladLezen.ts:102-116`), en `{{x}}` in een `@svg` zet het getal in de getoonde
  eenheid in de tekening (`evaluator.ts:2598-2624`).
- **In Instellingen bestaat al een tab Units** (`SettingsDialog.tsx:40-55, 409-492`)
  met `defaultLength`, `defaultForce` en `defaultStress`. Die worden bewaard, maar
  niets leest ze. Alleen de hoekeenheid (`angleMode`) werkt door, via het
  rekenverzoek aan de worker (`rekenen/doorrekening.ts`, `rekenWorker.ts:20`).
- **Amerikaanse eenheden in mathjs:** `in`, `ft`, `yd`, `mi`, `sqin`, `sqft`, `lbf`,
  `kip`, `psi` en `degF` bestaan. `ksi`, `psf`, `ksf`, `plf`, `klf` en `pcf`
  ontbreken. `lb` is massa, niet kracht.
- **Kleinere fouten die hierbij horen:**
  - `psi` staat in de tabel met Griekse letters (`latex.ts:12`), dus `50 psi`
    wordt 50 ψ;
  - de lijst met eenheidsnamen in `latex.ts:19-31` kent `in`, `lbf`, `kip` en
    `psi` niet;
  - de volgorde in `simplifyUnitString` herkent alleen metrische lengtes;
  - de parser herkent eenheden via de standaardinstantie van mathjs
    (`parser.ts:1`), niet via die van de rekenkern, en `latex.ts` doet hetzelfde.
    Een eigen eenheid zou de parser daardoor niet zien.

## Doelen

- Een **eenhedenstelsel per project**: per grootheid een weergave-eenheid, met
  kant-en-klare sets.
- **Alle getoonde waarden volgen dat stelsel.** Dat geldt voor uitkomsten,
  ingevulde waarden in de formules, invoervelden, de parametrische beelden, de
  afdruk en het rapport.
- **Invoer in elke eenheid.** Een veld toont zijn waarde in het stelsel, en wie
  er "12 in" of "5 m" in typt, krijgt wat hij bedoelt.
- **De Amerikaanse eenheden die ontbreken** komen erbij, en `psi` wordt geen ψ
  meer.
- **Eigen eenheden.** Je definieert ze in een blad, en voor het hele project in
  het project.

## Niet-doelen

- **Geen Amerikaanse normen.** De modules blijven rekenen volgens Eurocode;
  alleen de weergave verandert. Normen per land is een apart onderdeel
  (`normen-per-land`).
- **De IFC-export blijft in SI**, zoals nu.
- **Variabelenamen in de modules** blijven zoals ze zijn.
- **Voet-en-inch met breuken** (5'-6 ½") komt pas in een latere stap; zie
  "Later".

## Anti-doelen

Wat het onderdeel mislukt maakt, ook als het verder werkt:

- **Een stelsel dat een uitkomst verandert.** Een UC, een oordeel of een
  tussenwaarde mag nooit anders uitvallen door de weergave. Het stelsel raakt
  alleen wat er op het scherm en papier staat.
- **Een bestaand project dat er anders uitziet** voor wie de instelling nooit
  aanraakt.
- **Gemengde eenheden op één regel**, bijvoorbeeld de ingevulde waarden in kN/m en
  de uitkomst in kip·ft.
- **Een projectbestand dat stil verandert.** `waarden` blijven in de eenheid van
  de bladtekst, zodat een project ook in een oudere versie van de app hetzelfde
  rekent.

## Het stelsel

### Grootheden

Een waarde hoort bij een grootheid door twee dingen: zijn dimensie, en de eenheid
waarin de schrijver van het blad hem toont. Dat laatste is nodig om twee soorten
lengte en twee soorten druk uit elkaar te houden, precies zoals de schrijver ze
bedoelde:

| Grootheid | Herkend aan (eenheid van de schrijver) | Keuzes |
|---|---|---|
| Lengte | m, km | m, mm, ft, in |
| Maat (doorsnede, dikte, doorbuiging) | mm, cm | mm, cm, m, in |
| Oppervlakte | m² | m², ft² |
| Doorsnede-oppervlakte | mm², cm² | mm², cm², in² |
| Weerstandsmoment | mm³, cm³ | mm³, cm³, in³ |
| Traagheidsmoment | mm⁴, cm⁴ | mm⁴, cm⁴, in⁴ |
| Kracht | N, kN, MN | N, kN, MN, lbf, kip |
| Moment | N·mm, kN·m | N·mm, kN·m, lbf·in, kip·in, kip·ft |
| Lijnlast | N/mm, kN/m | kN/m, N/mm, plf, klf |
| Vlakbelasting | kN/m², kPa, N/m² | kN/m², kPa, psf, ksf |
| Spanning en E-modulus | N/mm², MPa, GPa | N/mm², MPa, GPa, psi, ksi |
| Volumegewicht | kN/m³ | kN/m³, pcf |
| Massa | kg, t | kg, t, lb |
| Temperatuur | °C, K | °C, °F |
| Hoek | (bestaande instelling) | deg, rad, gra |

- **Afspraak voor druk:** vlakbelasting en spanning hebben dezelfde dimensie. Een
  eenheid van de schrijver onder 100 kPa telt als vlakbelasting, vanaf 100 kPa als
  spanning.
- **Andere dimensies:** een dimensie die niet in de tabel staat (een veerstijfheid
  in kN/m³, een rekenfactor met eenheid) blijft zoals de schrijver hem toont.
- **De herkenning is één functie, met eigen controles:** `grootheidVan(eenheid)`
  in een nieuwe module `packages/core/src/eenheidstelsel.ts`.

### Sets

- **Zoals in het blad** (de standaard): geen omrekening, alles zoals nu.
- **SI (mm)**, **SI (m)** en **US customary**: zie de tabel.
- **Eigen keuze**: per grootheid een keuze uit de tabel hierboven, of een eigen
  eenheid met dezelfde dimensie. Je begint vanuit een van de sets.

| Grootheid | SI (mm) | SI (m) | US customary |
|---|---|---|---|
| Lengte | m | m | ft |
| Maat | mm | m | in |
| Oppervlakte | m² | m² | ft² |
| Doorsnede-oppervlakte | mm² | m² | in² |
| Weerstandsmoment | mm³ | m³ | in³ |
| Traagheidsmoment | mm⁴ | m⁴ | in⁴ |
| Kracht | kN | kN | kip |
| Moment | kN·m | kN·m | kip·ft |
| Lijnlast | kN/m | kN/m | klf |
| Vlakbelasting | kN/m² | kPa | psf |
| Spanning en E-modulus | N/mm² | MPa | ksi |
| Volumegewicht | kN/m³ | kN/m³ | pcf |
| Massa | kg | kg | lb |
| Temperatuur | °C | °C | °F |

**SI (mm)** is de gewone Eurocode-praktijk en ziet eruit als de meeste modules nu.
**SI (m)** zet alles in meters.

### Waar het stelsel staat

- **Het stelsel hoort bij het project.** Het staat in het projectbestand, zodat
  iedereen die het project opent dezelfde eenheden ziet en de afdruk klopt. Het
  is te kiezen in het projectpaneel, bij de projectgegevens.
- **De tab Units in Instellingen** wordt de standaard voor een nieuw project, net
  zoals de taal van het rapport de taal van de app overneemt. De velden
  `defaultLength`, `defaultForce` en `defaultStress` gaan op in een keuze van set
  plus "Eigen keuze". De velden blijven leesbaar voor de MCP/REST-API
  (`mcp/omgeving.ts`, `mcp/contracts.ts`).
- **Een oud projectbestand** zonder stelsel krijgt "Zoals in het blad".
- **Het projectformaat:** `PROJECT_FORMAAT_VERSIE` gaat omhoog, en
  `ocss::project` krijgt een veld voor het stelsel en de eigen eenheden
  (`ifcx/document.ts`, `ifcx/namespace.ts`).

## Weergave

**Hoofdregel:** de rekenkern rekent zoals nu, in de eenheden van de bladtekst.
Pas bij het tonen rekent een waarde om naar de eenheid van zijn grootheid.

- **Uitkomsten:** `result` en `unit` in de uitvoer van de rekenkern volgen het
  stelsel. Ook een uitkomst met `to` van de schrijver volgt het stelsel als zijn
  grootheid erin staat. Dat is de bedoeling: "overal" geldt ook voor de modules.
  Een manier om één regel buiten het stelsel te houden komt er in deze versie
  niet. Toont een blad dezelfde waarde bewust in twee eenheden, dan staat er in
  een ander stelsel twee keer hetzelfde; dat is onschuldig.
- **Ingevulde waarden in een formule** (`= 0,9 kN/m · (4 m)² / 8`) staan ook in het
  stelsel, zodat een regel nooit gemengd is. Een getal dat letterlijk in de
  formule staat, blijft zoals het geschreven is: dat is tekst van het blad.
- **Wat de beelden lezen blijft in de eenheid van het blad.** Dat zijn `waarde`,
  `getallen` en `{{x}}` in `@svg`: daar rekenen de tekeningen mee. De rekenkern
  houdt daarom de rekenwaarde en de weergave apart.
- **Notatie:**
  - Zonder notatie blijven het 4 significante cijfers.
  - Een vaste notatie van de schrijver (`:F2`, `#round 2`) houdt in een andere
    eenheid dezelfde relatieve nauwkeurigheid. Het nieuwe aantal decimalen is
    het oude plus de afgeronde log10 van (eenheid van de schrijver / eenheid van
    het stelsel), met minimaal 0 en maximaal 6. Voorbeeld: `:F2` in mm wordt in
    inch `:F3` (log10 25,4 ≈ 1,4 → 1), dus 1234,57 mm → 48,605 in.
  - `round(x; n)` is rekenen, geen weergave, en blijft wat het is.
- **Opmaak van eenheden:** m², kN·m en °C, zoals nu. `psi` en `ksi` blijven letters.
  `lbf·in` en `kip·ft` krijgen een middenpunt.

## Invoer

- **Een invoerveld toont zijn waarde in het stelsel**, met de eenheid van het
  stelsel ernaast.
- **Wat de gebruiker typt, gaat terug naar de eenheid van de bladtekst** voordat
  het in `ex.waarden` komt. Het bestand blijft zo hetzelfde, en een oudere versie
  van de app rekent het goed.
- **Een getal met een eenheid** ("12 in", "5 m", "3 kip") wordt omgerekend. Een
  eenheid met een andere dimensie geeft een melding bij het veld en wordt niet
  opgeslagen. Dit lost ook het bestaande `5 m mm` op.
- **Een kaal getal** geldt in de eenheid die naast het veld staat.
- **De parametrische beelden** krijgen in `designerKit.tsx` twee hulpmiddelen. Het
  eerste toont een getal in de eenheid van het stelsel. Het tweede leest een
  invoer in die eenheid en zet hem terug naar de eenheid van het blad. Opschriften
  zoals "kN/m" in `LiggerDesigner.tsx` komen uit het stelsel in plaats van vast in
  de code.

## Amerikaanse en eigen eenheden

- **Eén gedeelde set eenheden.** Parser, rekenkern en `latex.ts` gebruiken voortaan
  dezelfde mathjs-instantie, uit een nieuwe module `packages/core/src/eenheden.ts`.
  Dat is de voorwaarde voor eigen eenheden.
- **Erbij:**
  - ksi = 1000 psi
  - psf = lbf/ft²
  - ksf = kip/ft²
  - plf = lbf/ft
  - klf = kip/ft
  - pcf = lbf/ft³
- `lb` blijft massa, zoals in mathjs; kracht is `lbf` of `kip`.
- **Eigen eenheid in een blad.** De vorm volgt het `.cpd`-formaat, zodat zulke
  bestanden goed openen. De bouwer gaat na welke vorm dat formaat gebruikt en
  houdt die aan. Bestaat er geen vorm, dan wordt het `#unit naam = uitdrukking`.
  Een eigen eenheid geldt vanaf die regel tot het einde van het blad.
- **Eigen eenheid voor het project:** een lijst in het projectpaneel (naam en
  uitdrukking). Die eenheden gelden in alle bladen van het project en staan in
  het projectbestand.
- **Botsingen:**
  - een eigen eenheid met de naam van een bestaande eenheid of variabele geeft
    een melding en wordt niet gemaakt;
  - een blad dat een eenheid gebruikt die het project niet meer heeft, toont
    de gewone foutmelding van een onbekende naam.

## Doorgeven aan de rekenkern

Het stelsel reist mee zoals de hoekeenheid en de taal nu:

- **Rekenverzoek aan de worker:** in `RekenVerzoek` en in de cachesleutel van
  `rekenen/doorrekening.ts`.
- **Overige ingangen:**
  - `rekenBladDoor` in `bladDoorrekenen.ts`;
  - `useUitdraai` in `PrintDocument.tsx`, met het stelsel in de
    afhankelijkheden;
  - `useRapportWeergave`;
  - `rekenDoor` voor MCP en IFCX in `mcp/rekenen.ts`;
  - `store/projectIfcx.ts`, waar de cache nu alleen op `gegevens` sleutelt.
- **In de rekenkern:** `evaluate` krijgt een optie-argument
  `{ stelsel, eigenEenheden }`, in plaats van nog een module-globale toestand
  zoals bij de hoekeenheid. De hoekeenheid kan later dezelfde weg gaan.

## Het rapport

- **De tabellen in `components/rapport/afdruk/`** (Belastingen, Uitgangspunten)
  tonen vaste eenheden via `Eenheid`, zoals kN/m². Ze krijgen dezelfde omrekening
  als de bladen. De invoer in het rapportpaneel blijft opgeslagen in zijn eigen
  eenheid, en werkt verder als een invoerveld: getoond in het stelsel, en
  omgerekend bij het typen.
- **De standaardteksten van het rapport** noemen soms een eenheid in lopende tekst.
  Die blijven tekst: de gebruiker past ze zelf aan.

## Volgorde

Elke stap is een eigen kleine PR vanaf main.

1. **Kern.**
   - de gedeelde mathjs-instantie;
   - de ontbrekende Amerikaanse eenheden;
   - de fouten in `latex.ts` en `simplifyUnitString`;
   - eigen eenheden in een blad;
   - `eenheidstelsel.ts` met `grootheidVan` en de omrekening voor de weergave;
   - het optie-argument op `evaluate`.
   Nog niets in de app.
2. **App.**
   - het stelsel in het project en in het projectbestand;
   - de tab Units als standaard;
   - doorgeven langs alle ingangen;
   - invoervelden met omrekening;
   - eigen eenheden in het projectpaneel.
3. **Beelden en rapport.**
   - de hulpmiddelen in `designerKit.tsx`;
   - de parametrische beelden van de modules, één voor één;
   - de tabellen van het rapport.
4. **Documentatie.**
   - `docs/rekentaal.md` (eenheden, eigen eenheden);
   - `docs/projectmodel.md` (het veld in het bestand);
   - de README (eenheden en het stelsel);
   - `docs/CHANGELOG.md` bij elke stap.

## Controles

Een nieuw script `scripts/check-eenheidstelsel.mjs`:

- **Rekenen verandert niet.** Elke meegeleverde module (balklaag, ligger,
  tweepaalspoer, doorsnede-spanningen en de bladen in `library/`) geeft in elke set
  dezelfde UC, hetzelfde oordeel en dezelfde `waarde`/`getallen` als met "Zoals in
  het blad".
- **"Zoals in het blad" verandert niets aan de uitvoer.** Dezelfde HTML als nu, voor
  alle modules.
- **`grootheidVan`:** voor elke rij van de tabel, de afspraak voor druk, en een
  onbekende dimensie die blijft staan.
- **Weergave:**
  - een paar vaste omrekeningen (4500 mm → 14.76 ft, 10 kN·m → 7.376 kip·ft,
    235 N/mm² → 34.08 ksi);
  - geen gemengde eenheden op een regel met ingevulde waarden;
  - de notatie `:F2` na omrekening.
- **Invoer:**
  - "12 in" in een veld in mm geeft 304.8 in `waarden`;
  - "5 m" geeft 5000;
  - "3 kip" in een veld in mm geeft een melding en verandert niets.
- **Eenheden:**
  - de nieuwe Amerikaanse eenheden bestaan en rekenen goed om;
  - `psi` wordt geen ψ;
  - een eigen eenheid in een blad werkt in parser en rekenkern;
  - een eigen eenheid van het project werkt in alle bladen;
  - botsingen geven een melding.
- **Bestand:**
  - een project met stelsel en eigen eenheden blijft na opslaan en heropenen
    gelijk;
  - een oud bestand opent met "Zoals in het blad".

De bestaande controles blijven slagen. Het aantal controlescripts in de README gaat
één omhoog.

## Later

- **Voet en inch met breuken** (5'-6 ½") als notatie voor lengte, en als invoer.
- **Een bibliotheek met eigen eenheden in Instellingen** voor alle projecten.
- **Normen per land die een stelsel voorstellen**, bijvoorbeeld US customary bij
  Amerikaanse normen, zodra die er zijn.

## Aan de bouwer

- De vorm van de eigen eenheid in het `.cpd`-formaat: nagaan en aanhouden (zie
  boven).
- Waar het stelsel in het projectpaneel komt en hoe "Eigen keuze" eruitziet: in de
  stijl van het paneel, met de Blueprint-onderdelen die er al zijn.
- De precieze grens voor druk (100 kPa) mag verschuiven als een module een waarde
  in de verkeerde grootheid laat vallen; leg het dan vast in de controle.
