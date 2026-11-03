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
