# De rekentaal

Een rekenblad is tekst: elke regel is een toewijzing, een tekstregel of een opdracht. De
kern (`packages/core`) rekent de regels van boven naar beneden door en toont bij elke
uitkomst `naam = formule = ingevulde waarden = resultaat`. Bestanden met de extensie `.cpd`
zijn in deze taal geschreven.

## Rekenen

- **Formules met eenheden:** `mm`, `kN`, `N/mm²`, `mm⁴`, … via de eenheden van mathjs.
- **Eenheden vereenvoudigen vanzelf:** `b*h` geeft direct `mm²`, zonder `to`.
- **Wiskundige opmaak:** KaTeX, met echte breuken, superscripts, subscripts en Griekse letters.
- **Live:** de editor is CodeMirror 6, de uitkomst volgt terwijl je typt.
- **Meerdere bladen:** dezelfde module kan er meerdere keren in, elk met eigen invoer; de
  projectgegevens gelden voor alle bladen.

## Eenheden

- **Metrisch en Amerikaans:** naast de eenheden van mathjs (`mm`, `kN`, `in`, `ft`, `lbf`,
  `kip`, `psi`, …) kent de kern `ksi`, `psf`, `ksf`, `plf`, `klf` en `pcf`. `lb` is massa;
  kracht is `lbf` of `kip`. Alle eenheden staan in `packages/core/src/eenheden.ts`.
- **Eigen eenheden:** `.naam = uitdrukking`, zoals in het `.cpd`-formaat. `.EUR = 1` maakt een
  nieuwe basiseenheid, `.kipf = 1000 lbf` een eenheid uit een andere. De eenheid geldt vanaf
  die regel tot het einde van het blad. Een naam die al een eenheid of variabele is, of een
  getal zonder eenheid anders dan 1, geeft een fout.
- **Eigen eenheden van het project:** in de projectgegevens, onder Units. Ze gelden in elk
  blad zonder `.naam =`. Een blad kan zo'n eenheid niet opnieuw maken: `.naam =` met
  dezelfde naam geeft de fout dat hij al bestaat.
- **Invoervelden (`?`):** je kunt een eenheid meetypen. `5 m` in een veld in mm wordt
  5000 mm, `3/4` geldt in de eenheid naast het veld, en een eenheid die niet past of nog
  niet af is, krijgt een rode rand en wordt niet opgeslagen. Opgeslagen wordt altijd in de
  eenheid van de bladtekst.
- **Temperatuur** rekent niet om naar een ander stelsel: in een blad is het bijna altijd
  een verschil. Voet-en-inch met breuken (5'-6 ½") komt later.
- **Eenhedenstelsel:** `evaluate(nodes, waarden, scope, { stelsel })` toont elke waarde in de
  eenheid van zijn grootheid (`STELSELS` in `eenheidstelsel.ts`: SI (mm), SI (m) en US
  customary). Alleen de weergave verandert: `result`, `unit` en `waarde` blijven in de
  eenheid van het blad, de omgerekende vorm staat in `inStelsel`. Zie
  [het ontwerp](superpowers/specs/2026-11-06-eenheden-design.md).

## Syntax

- `"Title`, `'tekst`, `// commentaar`
- `#if … #else if … #else … #end if`, `#hide / #show / #pre / #post`
- `#repeat n … #end repeat` en `#for var = lo : hi … #loop`, ook genest
- `#def name(p1; p2; …) … #end def` voor macro's, `#def Name$ = literal` voor constanten
- `#include filename.cpd` voor externe macro's en SVG-tekeningen
- `$Plot{ … @ x = lo : hi }` voor grafieken in het blad
- Komma's in een index (`V_b,0`, `n_Int,support,points`), `$`-verwijzingen, matrix `[a;b|c;d]`
- Opmaak (`:F2`), namen met punt of procent (`Cs.Cd`, `F_0.9G50%TotalWeight`)
- `take`, `hlookup`, `hlookup_ge`, `hlookup_le`, `vlookup`, `get`, ook op matrices
- `@select var "Label" … @end` voor een keuzelijst, bijvoorbeeld een materiaal

## Tekeningen in het blad

- **SVG met waarden uit het blad:** `'<line x1="'a'" y1="'b'"/>`
- **`@svg … @end`:** handgeschreven SVG
- **`@img(file.svg)`:** een SVG-bestand komt in het blad, via dezelfde weg als `#include`
- **`@img(file.png|jpg|…)`:** een afbeelding
- **`@iframe https://… hoogte=120mm`:** een externe pagina, laadt pas na bevestiging, in een
  sandbox
- **`@js hoogte=90mm titel="…" bibliotheek=three … @end`:** JavaScript met de waarden van het
  blad als `calc`, pas na bevestiging, afgeschermd en zonder netwerk. Een draaibaar model kan
  met `calc.wereld3d()`, een knop met `addEventListener` (geen `onclick=`)

## Normtoetsen: `@toets`

Een normtoets komt uit één bron: Open FEM Studio, dat headless in CalcSheet zit. Een
blad schrijft de toets niet zelf, maar laat hem doen:

```text
@toets kolom = check_steel_beam
  beam_id = 1
  profile_name = "HEA200"
  steel_grade = "S235"
  length_m = h
  forces_envelope = [1; 0; N_Ed; 0; V_Ed; 0; M_Ed; 0 | 1; h; N_Ed; 0; V_Ed; 0; M_Ed; 0]
  lateral_bracing = {top_flange_positions: [0; 1], bottom_flange_positions: [0; 1]}
  deflection_limit_class = "Roof"
  deflection_limit_numerator = 250
  deflection_actual_max_mm = w_max
  is_cantilever = false
  consequence_class = "CC2"
@end
UC_max = kolom.uc_max
```

- **De velden.** Na `@toets` komen de naam van de uitkomst en een tool van FEM Studio:
  `check_*`, `list_*`, `compute_*`, `concrete_*`, of `check_fem_model`. Elke regel is
  `veld = uitdrukking`, met de veldnamen uit het schema van die tool. Een uitdrukking
  rekent met het blad: invoer, projectgegevens en `#id`-verwijzingen. Tekst staat tussen
  dubbele aanhalingstekens, ja en nee zijn `true` en `false`, en een object schrijf je als
  `{naam: waarde, …}`.
- **Eenheden.** Die volgen het einde van de veldnaam: `_m`, `_mm`, `_mm2`, `_mm4`, `_mm6`,
  `_kn`, `_knm`, `_mpa`, `_n_per_mm`, `_kn_per_m`. `length_m = 6000 mm` gaat als 6.
  - Een getal zonder eenheid gaat zoals het is.
  - Een grootheid in een veld zonder eenheid in de naam is een fout op die regel.
  - `forces_envelope` mag een matrix zijn, met per rij één station: combinatie, x (mm),
    N, V_y, V_z (kN), M_t, M_y, M_z (kNm).
- **De uitkomst.** Na het blok gelden de volgende variabelen. Een punt in een naam is in
  de rekentaal een liggend streepje, dus `kolom.uc_max` is `kolom_uc_max`.
  - `kolom.uc_max`: de hoogste UC.
  - `kolom.voldoet`: 1 of 0.
  - `kolom.status`: `Ok`, `NotOk` of `NotApplicable` (niet volledig getoetst).
  - Per toets `kolom.uc_6_3_2_ltb`: de punten in het id worden liggende streepjes.
  - Bij een model `kolom.uc_staaf`: een vector met een UC per staaf.
- **Op het blad.** Het blok staat als tabel: per toets het artikel, de titel, de UC en het
  oordeel, met de maatgevende rij vet. Een toets die niet van toepassing is, staat grijs.
  De afleiding (formule, waarden, toelichting) staat alleen op het scherm.
- **Rekenen in rondes.** De werkruimte stuurt het verzoek naar FEM Studio en rekent het
  blad opnieuw zodra het antwoord er is. Wat van het blok afhangt, is tot dan onbekend.
- **Niet getoetst.** De afdruk, het rapport en de API vragen zelf niets aan FEM Studio. Een
  blok zonder antwoord staat daar als NIET GETOETST, nooit als "voldoet". Zo staat het ook
  als FEM Studio een fout gaf, bijvoorbeeld een profiel dat het niet kent.
- **Hetzelfde antwoord.** Het antwoord hoort bij de invoer op het blad, niet bij de eenheid
  waarin die getypt is: `h = 6 m` en `h = 6000 mm` vinden hetzelfde antwoord. In deze
  versie gelden de antwoorden tot de app sluit; vastleggen in het projectbestand volgt.

## Voorbeeld

```text
"Voorbeeldproject

#include svg_drawing.cpd

# 1. Invoer
b = 300 mm
h = 500 mm
N_Ed = ?*(kN)
fck = 30 N/mm^2

# 2. Geometrie
A = b*h          // mm² — automatisch
W_y = b*h^2/6    // mm³

# 3. Toetsing
sigma = N_Ed/A to N/mm^2

#if sigma ≤ fck/1.5
    'Voldoet ✓
#else
    'Voldoet NIET ✗
#end if

# 4. Detail-tekening
@img(detail-D1.svg)

# 5. Belasting-diagram
$Plot{f(x) @ x = 0 : L}
```
