# Toetsing via Open FEM Studio — opzet

Datum: 07-11-2026
Status: voorstel, ter bespreking. Nog niet goedgekeurd, dus nog geen plan.

## Waarom

Normtoetsingen (staal, hout, beton, aluminium, metselwerk) horen op één plek te
staan. Open FEM Studio heeft ze al, in Rust-kernen met een volledige afleiding
per toets en met analytische proeven per norm. Dezelfde kernen zijn bereikbaar
via de app, via `toetsbrug` en via `openaec-mcp-server`. Die laatste draait
headless, via stdin/stdout (MCP) of als HTTP-dienst (`docs/cloud-api.md` in die
repository).

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
6. **Geen eigen raamwerk-API.** CalcSheet heeft geen `frame_solve` (besluit;
   PR #48 is gesloten). Krachtsverdeling en toetsing van raamwerken komen uit
   FEM Studio.

## Niet-doelen

- Code van FEM Studio overnemen of in CalcSheet compileren. CalcSheet levert de
  server van FEM Studio mee als apart programma en praat ermee via stdin/stdout.
  De toetskernen zelf (`*-check`, `nen-en-*`, LGPL-3.0) als bibliotheek in de
  Rust-kant van CalcSheet opnemen kan ook en is ook één bron, maar
  `check_fem_model` (het portaal) zit niet in die kernen. Daarom de hele server.
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

**Besluit: FEM Studio zit headless in CalcSheet.** CalcSheet levert de server
van FEM Studio zelf mee (`openaec-mcp-server`, met de standaardfeature
`toetsing`, 34 MB op Windows). Hij komt als sidecar in de installer
(`bundle.externalBin` van Tauri, per platform). De gebruiker hoeft FEM Studio
niet te installeren en ziet er niets van.

- **Via stdin/stdout, niet via HTTP** (mijn keuze). CalcSheet start één
  langlopend proces in de gewone MCP-modus (stdio) en praat JSON-RPC:
  `tools/list` voor de schema's en `tools/call` voor een toets. Er is dan geen
  poort, geen open verbinding op de machine en geen sleutel. De lijst
  `CLOUD_TOOLS` geldt alleen voor HTTP, dus ook aluminium en metselwerk zijn zo
  bereikbaar. CalcSheet roept alleen de reken- en opzoektools aan, nooit
  `gui_*`, `app_*` of de projecttools.
- **Eén versie per release.** Elke release van CalcSheet pint de versie van de
  server en zijn sha256, zoals FEM Studio dat met `fem-kernel.sha256` voor zijn
  eigen rekenkern doet. Een release met een nieuwere server staat in de
  CHANGELOG. De vastgelegde antwoorden (§4) blijven daardoor gelden: een nieuwe
  versie toetst alleen opnieuw op de knop.
- **Starten.** Het proces start bij de eerste toets, niet bij het openen van de
  app, en stopt met de app. Loopt het vast of valt het om, dan start CalcSheet
  het opnieuw en meldt het blok "niet getoetst" met de reden.
- **Bouwen.** De release-workflow van CalcSheet (`build.yml`) haalt de
  server per platform op uit de release van FEM Studio en controleert de
  sha256. Die repository is privé, dus de workflow heeft een token nodig, of
  FEM Studio zet de server op een plek waar de workflow hem mag ophalen. De
  sidecar wordt ondertekend zoals de app (Windows, macOS-notarisatie).
- **Licentie.** De server is AGPL-3.0 en de broncode is privé. CalcSheet is
  LGPL. Een los programma meeleveren naast een app mag, maar wie het binaire
  AGPL-programma verspreidt, moet de broncode ervan beschikbaar stellen aan de
  ontvangers. Als rechthebbende kan de foundation daar zelf over beslissen;
  dat moet vóór de eerste release met de server. Zie open punt 1.
- **Ontwikkelen.** In de dev-omgeving mag een pad naar een eigen gebouwde
  server worden opgegeven (`OCSS_FEM_SERVER`), om een nieuwere FEM Studio te
  proberen.

**Node.js.** `validate_fem_model`, `solve_fem_model` en `check_fem_model` starten
per aanroep een Node-proces (`sidecar.rs`). CalcSheet heeft geen Node, en FEM
Studio levert het niet mee. Het portaal (§5) werkt dus pas als FEM Studio dat
oplost (#295). De losse toetsen (`check_steel_beam` en de andere) hebben geen
Node nodig.

**De aanroep loopt via de Rust-kant van CalcSheet** (Tauri-commando's). Die
kant beheert het proces. Het commando:
- doet bij de start `initialize` (het antwoord draagt `serverInfo.version`) en
  `tools/list` voor de schema's;
- doet per toets `tools/call` met de argumenten;
- geeft het antwoord ongewijzigd terug, met de versie erbij.

De webview praat nooit zelf met de server.

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
  `tools/list` van de meegeleverde server, niet uit een eigen lijst.
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

**De afleiding heeft al één vorm.** Elke toets van FEM Studio geeft
`NamedCheck { id, kind }`. Dat geldt voor staal, hout, CLT, aluminium,
koudgevormd, beton, metselwerk, natuursteen en platen. `kind` is
`{type: "Resistance", data: ResistanceCalc}` of
`{type: "Stability", data: StabilityCalc}`, met:
- `id`, `title` en `article`;
- `force_state`, `formula_latex`, `variables` en `deelstappen`;
- `value` en `unit`;
- `uc`, `status` en `notes`.

Het rapport van FEM Studio leest diezelfde vorm. De typen staan in
`design-mockup/src/lib/types/steel/` van FEM Studio. CalcSheet heeft dus één
weergave nodig.

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

De rekentaal rekent in één keer door, in een worker. Een aanroep van de server
wacht. Zo gaan die samen:

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
- de herkomst: de versie van de server (`serverInfo.version`), de sha256 van de
  meegeleverde server, en een hash van het schema van de tool uit `tools/list`.

De protocolversie van MCP zegt niets over de schema's, dus daarom gaat de
schemahash mee. Een herkomst bij elk antwoord, met editie en bundelhash, is een
wens voor FEM Studio (#293, §6).

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
- **Gelijk is binnen een tolerantie.** Dezelfde invoer met dezelfde build op
  hetzelfde platform geeft bit voor bit hetzelfde antwoord. Tussen Windows en
  Linux verschillen iteratieve en goniometrische uitkomsten in de laatste bits
  (gemeten: 2·10⁻¹⁵ relatief). Een opnieuw getoetst antwoord vergelijkt CalcSheet
  dus met een relatieve tolerantie (10⁻⁹), niet byte voor byte. Een verschil
  daaronder telt niet als een veranderde uitkomst.
- **Heeft een nieuwere CalcSheet een nieuwere server,** dan meldt het blad dat op
  het scherm: "getoetst met FEM Studio 2026.44.0; deze versie heeft 2026.46.1 —
  opnieuw toetsen". Opnieuw toetsen is een knop, nooit vanzelf.
- **De afdruk** noemt de versie van FEM Studio waarmee getoetst is: één keer als
  alle blokken van een blad dezelfde versie hebben, anders per blok.

## 5. Het portaal

- het portaal wordt een **model van FEM Studio**, gemaakt door FEM Studio zelf:
  de tool `portaal_maken` (FEM Studio #297). Die neemt de maten, profielen en
  lasten en geeft een model in de `.ifcfem2d`-vorm terug, dat `check_fem_model`
  direct slikt. CalcSheet bouwt er geen eigen generator voor;
- `check_fem_model` rekent dat model door en toetst het in één aanroep: tweede
  orde met scheefstand, de combinaties volgens de NB uit de gevolgklasse, en per
  staaf de staaltoets;
- het rekenblad Portaal (een nieuw sjabloon) vraagt de maten, profielen en
  lasten. Het laat het model maken met `@toets model = portaal_maken`, toetst
  het met `@toets portaal = check_fem_model`, en toont de momentenlijn en de UC
  per staaf.

Daarmee rekent CalcSheet de krachtsverdeling van het portaal niet zelf. De
functie `raamwerk()` in de rekentaal bestaat al langer en wordt door geen
sjabloon in de openbare app gebruikt. Zie open punt 4.

## 6. Wat FEM Studio nodig heeft

Via stdin/stdout zijn alle toetsen bereikbaar, en de afleiding heeft al één vorm
(§2). De rest staat als issue in de repository van FEM Studio. Die issues zijn
niet opgepakt; de volgorde bepaalt de gebruiker.

| issue | wat | nodig voor |
|---|---|---|
| #293 | herkomst bij elk antwoord: editie, schemahash, bundelhash (in stdio-modus in het antwoord of in `initialize`, niet als HTTP-header) | vastleggen (§4) |
| #294 | `x-unit` per numeriek veld in de schema's; de API blijft SI | de omrekening (§2), zonder af te gaan op de naam |
| #295 | Node.js: meeleveren, de sidecar als losse executable, of het rekenpad naar Rust | `check_fem_model` in CalcSheet, dus het portaal (§5) |
| #296 | een argument `taal` voor de toetsteksten; vertalen bij de bron, in alle toetscrates | anderstalige bladen (§2) |
| #297 | `portaal_maken`: een 2D-portaal als model voor `check_fem_model` | het portaal (§5) |
| nieuw | de server per platform als release-artefact met sha256, op een plek waar de workflow van CalcSheet hem mag ophalen | meeleveren (§1) |

#292 (de lijst van de HTTP-dienst en de poort) is voor CalcSheet niet meer nodig,
omdat CalcSheet stdin/stdout gebruikt.

Tot #294 er is, leest CalcSheet de eenheid uit het achtervoegsel van de
veldnaam en, voor de krachtvelden, uit de beschrijving. Tot #293 er is, legt
CalcSheet `serverInfo.version` en de sha256 van de meegeleverde server vast, plus
een eigen hash van het schema.

## 7. Volgorde van bouwen

Elke stap is een eigen PR.

1. **De meegeleverde server.**
   - de sidecar in `tauri.conf.json` (`externalBin`);
   - het ophalen en controleren in `build.yml`;
   - het proces in de Rust-kant (starten, `initialize`, `tools/list`,
     `tools/call`, opnieuw starten, stoppen);
   - een regel "FEM Studio <versie>" bij Over en in de instellingen.
2. **Het blok.**
   - `@toets` in de parser en de evaluator;
   - de omrekening van eenheden uit het schema;
   - de matrixvorm van de lijstvelden;
   - de opzoekfunctie en het ronde-voor-ronde rekenen;
   - de weergave op scherm en papier.
3. **Vastleggen.** `toetsingen` per exemplaar, in het bestand en het IFCX, de
   versiemelding en "opnieuw toetsen".
4. **Het portaal**, zodra FEM Studio #297 en #295 er zijn: het sjabloon Portaal
   met `portaal_maken` en `check_fem_model`.
5. **Bestaande toetsen** naar FEM Studio, als dat de keuze is (open punt 2).
   Voor de ligger:
   - `check_steel_beam` kent de omhullende per station, kipsteunen per flens,
     gaffels, kip over een overstek (conservatief, C1 = 1,0) en de
     doorbuigingsklasse `Cantilever` met l_rep = 2L;
   - een doorgaande ligger gaat per veld, met één aanroep per staaf;
   - **valkuil bij hout:** `check_timber_beams` neemt k_mod per UGT-combinatie
     alleen als de duurklasse per combinatie wordt meegegeven. Zonder die lijst
     valt hij terug op "blijvend". De ligger moet die lijst dus altijd uit zijn
     lasten opbouwen, zoals `check_fem_model` dat zelf doet.

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

Besloten:
- **FEM Studio zit headless in CalcSheet** (§1).
- **Geen `frame_solve`** in CalcSheet; PR #48 is gesloten.

Nog open:

1. **De licentie van de meegeleverde server.** De server is AGPL-3.0 met privé
   broncode, en CalcSheet is openbaar (LGPL). Wie de server meelevert, moet de
   broncode ervan beschikbaar stellen aan de ontvangers. Er zijn twee wegen:
   - de broncode van de server (of de hele FEM Studio) openbaar maken;
   - een eigen licentie van de foundation, als rechthebbende, voor het
     meeleveren met CalcSheet.

   Dit moet vastliggen vóór de eerste release met de server, niet vóór het
   bouwen.
2. **Bestaande toetsen.** Moeten de toetsen die CalcSheet nu zelf doet en die
   FEM Studio ook heeft, naar FEM Studio? Het gaat vooral om staal en hout in de
   ligger. Bestaande projecten veranderen daar niet door, want een exemplaar
   heeft zijn eigen tekst. Omdat de server in CalcSheet zit, heeft een nieuwe
   ligger geen losse installatie nodig.
3. **Node.js voor FEM Studio (#295).** Node meeleveren, de sidecar als losse
   executable, of het rekenpad naar Rust? Dit is een keuze in FEM Studio, maar
   het portaal in CalcSheet wacht erop. Node in CalcSheet meeleveren (circa
   70 MB) is mogelijk, maar zwaar.
4. **`raamwerk()` in de rekentaal.** Deze eigen raamwerkkern bestaat al langer en
   wordt door geen sjabloon in de openbare app gebruikt. Blijft hij, voor
   snelle lijnen in eerste orde in een eigen blad, of gaat hij er ook uit?
5. **Waar het sjabloon Portaal komt.** In de openbare app, net als de ligger,
   in de modules-repo, of in de privé-app?
