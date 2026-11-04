# De beelden in het scherm "Module toevoegen"

Elke tegel in het scherm heeft een eigen beeld in
`packages/desktop/src/assets/module-beelden`, op de plek en in de maat van de
rekenmodules: 180 × 104 pixels op het scherm. `scripts/check-modulebeelden.mjs`
bewaakt dat elke tegel er een heeft, dat de verhouding klopt en dat er geen beeld
over is.

Gemeenschappelijke stijl: een verfijnde isometrische architectuurvisualisatie in
3D, met geloofwaardige materialen en geometrie, een warme gebroken witte
studiogrond, donker leisteenblauw en spaarzame turquoise accenten, zachte
belichting, een centraal silhouet en genoeg marge voor het kaartje. Geen woorden,
getallen, maatlijnen, personen, logo's of watermerken. Illustratief, geen
uitvoeringsdetail.

## Gegenereerd

Deze beelden zijn met beeldgeneratie gemaakt; hierboven staat de prompt.

| Beeld | Onderwerp van de prompt |
|---|---|
| `ligger` | Vrij opgelegde ligger met gelijkmatig verdeelde belasting |
| `balklaag` | Houten balklaag met vloerplaat in doorsnede |

## Getekend

Deze beelden zijn getekend (SVG naar WebP, 540 × 312 pixels). De tekeningen van de
laatste acht staan in `scripts/maak-modulebeelden.mjs`; opnieuw draaien maakt ze
opnieuw. Dat script gebruikt de kleuren van `tweepaalspoer.webp`.

| Beeld | Tegel | Onderwerp |
|---|---|---|
| `tweepaalspoer` | Tweepaalspoer | Poer op twee palen met kolom, wapeningskorf zichtbaar |
| `doorsnede-spanningen` | Spanningen in een doorsnede | Een stuk I-profiel met het spanningsveld op de snede en de spanningsdriehoeken ernaast |
| `tekenblad` | Lege tekening | Een vel op de tekentafel met stempelveld, driehoek en potlood |
| `fem-project` | Open FEM Studio-project | Een raamwerk op een rastervloer, met knopen en de vervormde ligger |
| `jupyter` | Jupyter-notebook | Gestapelde cellen met regels code, de laatste met staven als uitvoer |
| `marimo` | Marimo-notebook | Een schuif die via lijnen de cellen en de grafiek stuurt |
| `markdown` | Markdown toevoegen | Een pagina met koppen, tekst en een lijst, met een plusteken erbij |
| `markdown-import` | Markdown inlezen | Dezelfde pagina die met een pijl in een bak zakt |
| `rekentaal-demo` | Open CalcSheet Studio-demo (Library) | Een rekenblad met invoervelden, een formule, een momentenlijn en een vinkje |

De naam van het bestand is het `templateId` van de tegel. Staat een tegel buiten de
catalogus, dan staat de naam in `TEGEL_BEELD` in `ModuleKiezer.tsx`.
