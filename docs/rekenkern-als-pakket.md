# De rekenkern als pakket

De kern (`@ifc-calc/core`) werkt ook zonder de app, bijvoorbeeld in een eigen programma:

```typescript
import {
  parse,
  evaluate,
  render,
  generateIfcx,
  generateIfc4x3Step,
} from '@ifc-calc/core';

const source = `
b = 300 mm
h = 500 mm
A = b*h
N_Ed = 120 kN
sigma = N_Ed/A to N/mm^2
`;

// Render naar HTML (KaTeX formules + SVG)
const ast = parse(source);
const evaluated = evaluate(ast, {});
const html = render(evaluated);

// IFC export uit dezelfde berekening
const ifcx = generateIfcx(evaluated, { projectName: 'Toetsing balk B1' });
const step = generateIfc4x3Step(evaluated, { projectName: 'Toetsing balk B1' });
```

## Externe SVG en `#include`

```typescript
import detailSvg from './detail-D1.svg?raw';
import svgDrawing from './svg_drawing.cpd?raw';

const ast = parse(source, {
  includes: new Map([
    ['detail-D1.svg', detailSvg],     // wordt door @img(detail-D1.svg) in het blad gezet
    ['svg_drawing.cpd', svgDrawing],  // wordt door #include svg_drawing.cpd geladen
  ]),
});
```

De taal zelf staat in [rekentaal.md](rekentaal.md).
