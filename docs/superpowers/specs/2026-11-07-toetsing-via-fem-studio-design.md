# Toetsing via Open FEM Studio — opzet

Datum: 07-11-2026
Status: voorstel, ter bespreking. Nog niet goedgekeurd, dus nog geen plan.

## Waarom

Normtoetsingen (staal, hout, beton, aluminium, metselwerk) horen op één plek te
staan. Open FEM Studio heeft ze al, in Rust-kernen met een volledige afleiding
per toets en met analytische proeven per norm. Dezelfde kernen zijn bereikbaar
via de app, via `toetsbrug` en via `openaec-mcp-server`. Die laatste is ook een
HTTP-dienst: `POST /v1/tools/{naam}`, lokaal of in de cloud (`docs/cloud-api.md`
in die repository).

Bouwt CalcSheet dezelfde toetsen nog eens in de rekentaal, dan zijn er twee
bronnen voor dezelfde norm. Die lopen uit elkaar: een correctie in de ene komt
niet vanzelf in de andere. Dat gebeurt nu al: de ligger in CalcSheet toetst
staal en hout zelf.

## Doelen

1. **Eén bron.** Een rekenblad in CalcSheet laat een toetsing doen door FEM
   Studio en toont de uitkomst. CalcSheet rekent de toets niet zelf na.
2. **Eén taal.** De rekentaal krijgt één blok voor elke toets van FEM Studio.
   Komt er in FEM Studio een toets bij, dan is die in CalcSheet bruikbaar zonder
   dat CalcSheet verandert.
3. **Herhaalbaar.** Een opgeleverd blad toont over vijf jaar dezelfde uitkomst,
   ook als FEM Studio intussen veranderd is (`docs/projectmodel.md`: eigen kopie
   per exemplaar).
4. **Eerlijk.** Een toets die niet kon draaien, staat nooit als "voldoet" op
   scherm of papier.
5. **Het portaal.** Het portaal als standaard element wordt doorgerekend en
   getoetst door FEM Studio: tweede orde met scheefstand, en per staaf de
   staaltoets.

## Niet-doelen

- Code van FEM Studio overnemen of meebundelen. CalcSheet praat met een apart
  proces via HTTP. De server van FEM Studio is AGPL en blijft daardoor buiten
  CalcSheet. De toetskernen zelf (`*-check`, `nen-en-*`) zijn LGPL-3.0; ze als
  bibliotheek in de Rust-kant van CalcSheet opnemen is een andere weg, met één
  bron en zonder dienst. Zie open punt 1.
- Een tweede gebruikersinterface voor FEM Studio. Wie een model wil tekenen,
  opent FEM Studio.
- Toetsen die FEM Studio niet heeft, zoals pons, poeren en vloeren op staal.
  Die blijven in CalcSheet tot FEM Studio ze heeft. Zie de open punten.

## Anti-doelen

- **Stil voldoen.** Een UC die er niet is, of die uit een oude versie komt
  zonder dat het blad dat zegt, telt als mislukt.
- **Stil veranderen.** Een opgeleverd blad dat bij het openen een andere UC
  toont, omdat FEM Studio is bijgewerkt.
- **Een tweede rekenweg.** De toetsing in CalcSheet nabouwen "voor als FEM Studio
  er niet is".

## 1. Waar FEM Studio draait

**De editie.** De toetsen zitten alleen in de editie van FEM Studio met de
feature `toetsing`; die repository is privé. De openbare editie, "Open FEM
Studio Mechanics", heeft geen `check_*`-tools. CalcSheet is openbaar. Welke
editie een gebruiker nodig heeft en waar hij die haalt, is open punt 1. Dat
punt bepaalt ook of lokaal of de cloud de standaard wordt.

**Mijn keuze:** CalcSheet kent twee bronnen, in te stellen onder Instellingen ›
Toetsing.

- **Lokaal.** CalcSheet zoekt de server die met FEM Studio wordt meegeleverd:
  - Windows: `%LOCALAPPDATA%\Open FEM Studio\openaec-mcp-server.exe` (NSIS) of
    de map onder Program Files (MSI);
  - macOS: `/Applications/Open FEM Studio.app/Contents/MacOS/openaec-mcp-server`;
  - Linux: `/usr/bin/openaec-mcp-server`;
  - of een pad dat je zelf opgeeft.

  CalcSheet start hem als kindproces met `--http 127.0.0.1:<vrije poort>` en
  `OPENAEC_API_TOEGANG=open`, en stopt hem bij het afsluiten. Een server zonder
  `check_*`-tools in `GET /v1/tools` is de verkeerde editie; dat meldt
  CalcSheet zo.
- **Cloud.** Een adres en een sleutel. De sleutel staat in de sleutelbos van het
  besturingssysteem, zoals het ERPNext-geheim nu.

**Node.js.** `validate_fem_model`, `solve_fem_model` en `check_fem_model` starten
per aanroep een Node-proces (`sidecar.rs`). De installer van FEM Studio levert
geen Node mee; de cloudcontainer wel. Lokaal werkt het portaal (§5) dus pas als
FEM Studio dat oplost of Node meelevert. De losse toetsen (`check_steel_beam`
en de andere) hebben geen Node nodig. Dit is een punt voor FEM Studio (§6).

Is er geen bron, dan meldt het blad dat FEM Studio nodig is en waar je het
haalt. Er wordt niets aangenomen.

**De aanroep loopt via de Rust-kant van CalcSheet** (een Tauri-commando). De
HTTP-dienst heeft geen CORS. Een `fetch` uit de webview naar `127.0.0.1` zou
bovendien per platform anders uitvallen. Het commando:
- doet `GET /v1/health` voor de versie en het protocol;
- doet `POST /v1/tools/{naam}` met de argumenten;
- geeft het antwoord ongewijzigd terug, met de versie erbij.

## 2. Het blok in de rekentaal

```
@toets kolom = check_steel_beam
  profile_name = profiel
  steel_grade = staalsoort
  length_m = h
  forces_envelope = [1, 0, N_Ed, 0, V_Ed, 0, M_Ed, 0; 1, h, N_Ed, 0, V_Ed, 0, 0, 0]
  lateral_bracing = {top_flange_positions: [], bottom_flange_positions: []}
  deflection_limit_class = "Roof"
  …
@end

UC_max = kolom.uc_max
```

- **De tool.** Na `@toets` komen een naam voor de uitkomst en de toolnaam van FEM
  Studio. Elke tool van FEM Studio mag, maar alleen de rekentools, niet de
  `gui_*`-, `app_*`- of projecttools. **Mijn keuze:** de lijst komt uit
  `GET /v1/tools` van de dienst zelf, niet uit een eigen lijst.
- **De velden.** Elke regel is `veld = uitdrukking`, met de veldnamen uit het
  schema van de tool. De uitdrukking rekent met de scope van het blad, dus
  invoervelden, projectgegevens en `#id`-verwijzingen werken gewoon.
- **Eenheden volgen het schema.** Veldnamen van FEM Studio dragen hun eenheid
  (`length_m`, `deflection_actual_max_mm`, `a_net_mm2`). Een waarde met eenheid
  wordt daarnaar omgerekend: `length_m = 6000 mm` gaat als 6. Een waarde zonder
  eenheid gaat zoals hij is. Een eenheid die niet past, is een fout op die regel.
  Velden zonder eenheid in de naam (zoals de krachten in `forces_envelope`, kN en
  kNm volgens hun beschrijving) volgen de eenheid die de beschrijving noemt.
- **Matrices.** Een veld dat een lijst objecten verwacht, zoals
  `forces_envelope`, mag een matrix zijn met een vaste kolomvolgorde. Die volgorde
  staat per tool in de documentatie van CalcSheet. **Mijn keuze:** alleen voor de
  paar lijstvelden die in de praktijk een tabel zijn. Elders schrijf je het object
  uit.
- **De uitkomst.** Na het blok zijn er variabelen onder de naam van het blok:
  - `kolom.uc_max` en `kolom.voldoet`;
  - per toets `kolom.uc["6.3.2_ltb"]`;
  - de maatgevende toets.

  `UC_max` en de slotzin van het blad werken daarmee zoals nu.

  **Mijn keuze voor het lezen van het antwoord:** de antwoorden van FEM Studio
  hebben drie vormen:
  - één resultaat met `uc_max`, `status`, `checks` en `governing_check_id`
    (`check_steel_beam`, `check_concrete_beam`);
  - een lijst daarvan (`check_timber_beams`, `check_clt_beams`, `check_plates`,
    die `inputs: [...]` nemen);
  - `check_fem_model`, met `results`, `timber_results`, `governing` en
    `skipped_beams`.

  CalcSheet heeft één lezer die deze drie vormen kent. Er is geen omzetting per
  tool en geen normkennis. Een nieuwe tool in een van deze vormen werkt dus
  meteen.

  - `voldoet` is `status = Ok`.
  - `NotApplicable` is "niet volledig getoetst" en nooit "voldoet".
  - Bij een lijst of een model krijgt elk element een eigen uitkomst
    (`portaal.staaf[2].uc_max`), en `uc_max` is het maximum.
  - Een tool zonder UC (`concrete_mn_kappa`, de `list_*`-tools) mag ook. Zijn
    antwoord staat dan als structuur onder de naam van het blok, zonder
    `uc_max`.
- **De taal.** De titels, notities en meldingen van FEM Studio zijn Nederlands;
  er is geen taalargument. **Mijn keuze:** CalcSheet vertaalt ze niet, want dat
  zou een tweede bron van tekst zijn. In een blad in een andere taal staan
  artikel, UC en oordeel in die taal (dat zijn vaste woorden van CalcSheet). De
  titels en de afleiding staan er zoals FEM Studio ze geeft, tot FEM Studio een
  taalargument heeft (§6).

**Op het scherm** staat per toets een regel met:
- het artikel, de titel en de UC;
- voldoet / voldoet niet / niet getoetst;
- uitklapbaar de afleiding uit FEM Studio: formules, variabelen en notities, in
  de opmaak van de uitwerking.

**Op papier** staat per toets één regel en de maatgevende toets
(`feedback_uitdraai_beknopt`). De volledige afleiding gaat desgewenst als
bijlage mee. FEM Studio maakt er zelf een PDF-rapport van
(`generate_steel_report_pdf`); dat kan een PDF-blad in het project worden.

## 3. Rekenen gebeurt synchroon, toetsen niet

De rekentaal rekent in één keer door, in een worker. Een HTTP-aanroep wacht. Zo
gaan die samen:

1. `evaluate` krijgt in `EvalOpties` een opzoekfunctie voor toetsuitkomsten. Een
   `@toets`-blok zoekt zijn uitkomst op met de hash van zijn **invoer op het
   blad**: de toolnaam en de doorgerekende velden met hun eenheid, vóór de
   omrekening naar het schema.

   **Mijn keuze:** de omrekening hangt af van het schema van FEM Studio. Zat die
   in de hash, dan veranderde de hash als FEM Studio of CalcSheet het schema of
   de omrekening verandert, zonder dat iemand het blad aanraakte. Bovendien kon
   een blad zonder FEM Studio dan zijn eigen opgeslagen antwoord niet vinden.
   Het verzonden verzoek en het schema dat daarbij hoorde, worden wel vastgelegd
   (§4).
2. **Er is een uitkomst:** het blok toont die en vult zijn variabelen.
3. **Er is er geen:** het blok toont "wordt getoetst" en zijn variabelen zijn
   onbekend. Wat ervan afhangt, krijgt de gewone fout "onbekende variabele". Het
   verzoek gaat mee terug in de uitkomst van de worker.
4. `doorrekening.ts` stuurt de openstaande verzoeken naar het Tauri-commando.
   Zodra een antwoord binnen is, rekent het blad opnieuw. Een blad met drie
   toetsblokken onder elkaar, waarvan het tweede het eerste gebruikt, gaat zo in
   drie rondes.
5. **Alleen de werkruimte stuurt verzoeken** (mijn keuze). De andere paden
   rekenen synchroon en lezen alleen de vastgelegde antwoorden:
   - de afdruk (`bladDoorrekenen.ts`);
   - de eigen API van CalcSheet (`mcp/rekenen.ts`);
   - het rapportpaneel;
   - de IFCX-export;
   - de ontwerpknop van de balklaag;
   - `#ref` tussen bladen.

   Ontbreekt daar een antwoord, dan staat het blok als **NIET GETOETST**, met de
   reden. Het blad krijgt dan geen "voldoet".
6. **Vóór het afdrukken** loopt er één stap "toetsingen bijwerken". Die rekent
   de bladen in het voorbeeld eenmaal synchroon door en verzamelt de openstaande
   verzoeken. Daarna wacht hij op hun antwoorden via het Tauri-commando, en pas
   dan bouwt de afdruk de vellen. Dat is nieuw: `wachtOpDrukbeelden` wacht nu
   alleen op geladen afbeeldingen, niet op gegevens. Kan een verzoek niet, dan
   gaat het blok als NIET GETOETST op papier.

## 4. Vastleggen en herhalen

Elk exemplaar krijgt `toetsingen`. Per hash van de invoer (§3) staan daarin:
- het verzonden verzoek;
- het antwoord;
- de datum;
- de herkomst: `versie` uit `/v1/health`, de editie en een hash van het schema
  van de tool uit `GET /v1/tools`.

`protocol` uit `/v1/health` is de datum van het MCP-protocol. Dat is geen
versie van de REST-ingang of van de schema's, dus daarom gaat de schemahash
mee. Een betere versie bij elk antwoord is een wens voor FEM Studio (§6).

Die gegevens gaan mee in het projectbestand en in het IFCX (`ocss::toetsing`).
De versie staat per blok, niet per blad: een blad kan blokken hebben die met
verschillende versies zijn getoetst.

- **Bij het openen** rekent een blad met de vastgelegde antwoorden. Er gaat niets
  naar FEM Studio zolang de verzoeken gelijk zijn. Een opgeleverd blad toont dus
  zijn oude uitkomst, ook zonder FEM Studio op de computer.
- **Verandert de invoer op het blad,** dan verandert de hash en gaat er een nieuw
  verzoek uit. Een antwoord dat niet meer gebruikt wordt, valt weg bij het
  opslaan. Verandert alleen het schema of de omrekening, dan blijft het oude
  antwoord gelden. Het blad biedt dan "opnieuw toetsen" aan.
- **Is FEM Studio nieuwer** dan de versie van een vastgelegd antwoord, dan meldt
  het blad dat op het scherm: "getoetst met FEM Studio 2026.44.0; 2026.46.1 is
  beschikbaar — opnieuw toetsen". Opnieuw toetsen is een knop, nooit vanzelf.
- **De afdruk** noemt de versie van FEM Studio waarmee getoetst is: één keer als
  alle blokken van een blad dezelfde versie hebben, anders per blok.

## 5. Het portaal

PR #48 (nog niet gemerged) heeft het portaal als standaard element in de API
van CalcSheet: `frame_solve` met `portal`. Dat maakt een model voor de eigen
raamwerkkern van CalcSheet en is niet bereikbaar vanuit de rekentaal. Voor de
toetsing:

- het portaal wordt ook een **model van FEM Studio**: knopen in mm, staven met
  materiaal en profiel, opleggingen, belastinggevallen met hun type, en lasten;
- `check_fem_model` rekent dat model door en toetst het in één aanroep: tweede
  orde met scheefstand, de combinaties volgens de NB uit de gevolgklasse, en per
  staaf de staaltoets;
- het rekenblad Portaal (een nieuw sjabloon) vraagt de maten, profielen en lasten,
  zet het model op met een `@toets portaal = check_fem_model`-blok, en toont de
  momentenlijn en de UC per staaf.

Daarmee rekent CalcSheet de krachtsverdeling van het portaal niet meer zelf voor
de toetsing. De eigen raamwerkkern blijft voor wat snel en eerste orde mag:
- de lijnen in een rekenblad (`raamwerk()` in de rekentaal);
- `frame_solve` voor wie alleen krachten wil.

Zie het open punt hierover.

## 6. Wat FEM Studio nodig heeft

Voor staal, beton en hout werkt de HTTP-dienst nu al. Voor de rest moet er in
FEM Studio iets veranderen. Deze punten liggen bij de sessie van FEM Studio:

- **De lijst van de HTTP-dienst.** `CLOUD_TOOLS` in `cloudbeleid.rs` mist
  `check_aluminium_beams`, `check_masonry_walls`, `check_koudgevormd_beams`,
  `check_natural_stone_elements` en `list_aluminium_alloys`. De HTTP-modus past
  die lijst ook lokaal toe, dus die tools geven nu een 404.
- **Node.js lokaal.** `check_fem_model` heeft Node nodig, en de installer levert
  dat niet mee. Daar is Node meeleveren of `OPENAEC_NODE` vullen nodig, anders
  werkt het portaal lokaal niet.
- **Een vrije poort.** `--http 127.0.0.1:0`, met de gekozen poort als één
  machineleesbare regel op stdout.
- **Herkomst bij elk antwoord.** De serverversie, de editie, de versie van de
  rekenkern en een schemaversie.
- **Eén vorm voor de afleiding** over alle toetsen: titel, artikel, formules,
  variabelen en notities.
- **Eenheid per veld** in `GET /v1/tools`, als eigen sleutel.
- **Een taalargument** voor titels en notities.
- **Een generator voor een 2D-portaal**, als FEM Studio die wil hebben. Dan
  bouwt CalcSheet er geen eigen (§5).

## 7. Volgorde van bouwen

Elke stap is een eigen PR.

1. **De verbinding.** Het Tauri-commando, lokaal en cloud, en de instelling.
   Een proefknop "Verbinding testen" toont de versie van FEM Studio.
2. **Het blok.**
   - `@toets` in de parser en de evaluator;
   - de omrekening van eenheden uit het schema;
   - de matrixvorm van de lijstvelden;
   - de opzoekfunctie en het ronde-voor-ronde rekenen;
   - de weergave op scherm en papier.
3. **Vastleggen.** `toetsingen` per exemplaar, in het bestand en het IFCX, de
   versiemelding en "opnieuw toetsen".
4. **Het portaal.** Het model voor FEM Studio uit de maten, het sjabloon Portaal
   en `check_fem_model`.
5. **Bestaande toetsen** naar FEM Studio, als dat de keuze is (open punt 1).

## Controleren

- Een controlescript met een nagebouwde dienst (vaste antwoorden), zoals
  `check-mcp.mjs` dat met een nagebouwde store doet. Het toetst:
  - de omrekening van eenheden;
  - de matrixvorm;
  - de hash;
  - de rondes;
  - "niet getoetst" bij een fout of geen verbinding;
  - het vastleggen en teruglezen.
- Een proef tegen een echte FEM Studio, als die er is. De UC van een
  `@toets`-blok moet gelijk zijn aan die van dezelfde aanroep rechtstreeks.

## Open punten

Deze beslissingen veranderen wat er gebouwd wordt:

1. **De editie en de weg.** De toetsen zitten alleen in de privé-editie van FEM
   Studio. Wat krijgt een gebruiker van CalcSheet? Er zijn drie wegen:
   - (a) de editie met toetsen installeren, lokaal;
   - (b) een sleutel voor de clouddienst;
   - (c) de LGPL-toetskernen als bibliotheek in de Rust-kant van CalcSheet,
     zonder dienst en zonder Node. Dat geldt voor de losse toetsen, niet voor
     `check_fem_model`.

   Het antwoord bepaalt de standaardbron in §1, de melding "waar je het haalt",
   en of een nieuwe ligger een niet-openbaar product nodig heeft.
2. **Bestaande toetsen.** Moeten de toetsen die CalcSheet nu zelf doet en die
   FEM Studio ook heeft, naar FEM Studio? Het gaat vooral om staal en hout in de
   ligger. Bestaande projecten veranderen daar niet door, want een exemplaar
   heeft zijn eigen tekst. Een nieuwe ligger zou dan wel FEM Studio nodig hebben.
3. **`frame_solve` (PR #48).** Houden als snelle krachtsverdeling in eerste orde,
   naast `check_fem_model` voor de toetsing? Of laten doorsturen naar
   `solve_fem_model` van FEM Studio, zodat er ook voor de krachtsverdeling één bron
   is?
4. **Waar het sjabloon Portaal komt.** In de openbare app, net als de ligger,
   in de modules-repo, of in de privé-app? Het werkt alleen met de editie van
   FEM Studio met toetsen.
