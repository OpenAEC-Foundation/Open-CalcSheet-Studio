# Ontwikkelen

Lees voor de afspraken ook [overdracht.md](overdracht.md).

## Starten

```bash
npm ci
```

```bash
# Browser-preview starten (bouwt eerst de rekenkern)
npm run dev

# Rekenkern en frontend bouwen, inclusief TypeScript-controle
npm run build

# Native debugbuild zonder installatiepakket
npm run build:debug

# Desktop (Tauri) starten
npm run tauri:dev --workspace=@openaec/calcsheet-studio

# Rekenkern automatisch herbouwen tijdens wijzigingen
npm run dev --workspace=@ifc-calc/core

# Alle controles
npm run check
```

De browser-preview draait zonder Rust en is voor het rekenwerk zelf gelijkwaardig; alleen
bestandsdialogen, de opslag van instellingen en het Jupyter-blad werken daar niet.

## Benodigdheden

- **Node 24.** De controlescripts laden de `.ts`-bestanden rechtstreeks.
- **Rust**, via `rustup`, voor de desktop-app.
- **Op Windows** ook de Visual Studio Build Tools met de C++-werkbelasting en de Windows SDK:

```bash
winget install --id Rustlang.Rustup --exact
```

```bash
winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Die tweede vraagt beheerdersrechten; draai hem vanuit een PowerShell die als administrator is
gestart, anders breekt hij af met code 1602.

- **Python 3.10 of nieuwer en internet**, eenmalig, om de Jupyter-omgeving te bouwen; zie
  [jupyter-blad.md](jupyter-blad.md).

## Optioneel: de OpenAEC-rapportengine

Afdrukken gaat standaard via de webview (voorblad, inhoudsopgave, elk blad op een pagina, met
tekeningen). De Rust-rapportengine van OpenAEC is optioneel en wordt niet meegebouwd, zodat dit
project op zichzelf bouwt:

```bash
npm run tauri build --workspace=@openaec/calcsheet-studio -- --features rapportengine
```

Zonder die vlag bestaan de engine-commando's wel, maar geven ze een melding dat de build ze
niet bevat. Zie [backlog.md](backlog.md) voor waarom die weg nu niet de standaard is.

## Opbouw

```
Open-CalcSheet-Studio/
├── library/                           # Voorbeelden, bij het opstarten opgehaald (library.md)
├── packages/
│   ├── core/                          # @ifc-calc/core: de rekenkern
│   │   └── src/
│   │       ├── parser.ts              # Regels, macro's, #include
│   │       ├── evaluator.ts           # Rekenen met mathjs
│   │       ├── ligger.ts              # Ligger op steunpunten (omhullende M/V)
│   │       ├── raamwerk.ts            # Vlakke raamwerken, knikfactor
│   │       ├── doorsnede.ts           # Samengestelde doorsneden
│   │       ├── ifc-generator.ts       # IFCX en IFC4x3 STEP
│   │       ├── latex.ts               # Formule naar LaTeX
│   │       ├── renderer.ts            # HTML (KaTeX, SVG)
│   │       ├── gef-parser.ts          # Sondering (GEF)
│   │       └── index.ts               # Openbare API
│   └── desktop/                       # @openaec/calcsheet-studio: de Tauri-app
│       ├── src/                       # React: lint, panelen, bladen
│       │   ├── templates/             # Rekenbladen (balklaag, ligger, tweepaalspoer)
│       │   └── store/                 # Project, bladsoorten, Library
│       └── src-tauri/                 # Rust-schil (Tauri 2)
├── scripts/                           # Controles (npm run check) en hulpscripts
└── docs/                              # Opbouw, toetsing, ontwerpen
```

## Beelden van de README

De beelden in `docs/images/readme/` komen uit de echte app, met een verzonnen project; zie de
kop van [`scripts/maak-readme-beelden.mjs`](../scripts/maak-readme-beelden.mjs). De README's
volgen de
[README-standaard](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint/blob/main/templates/README-standaard.md);
`scripts/check-readme.mjs` controleert de beelden en de opbouw.
