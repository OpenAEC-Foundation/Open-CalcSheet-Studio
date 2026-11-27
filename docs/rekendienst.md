# De rekendienst zonder venster

Een losse dienst die rekenbladen doorrekent, voor de OpenAEC SuperCloud, scripts,
pijplijnen en AI-assistenten: zonder bureaublad, zonder WebView en zonder ingelogde
gebruiker. Hij biedt de REST-API van de desktop-app ([api.md](api.md)) en de MCP-server
([mcp.md](mcp.md)) aan met dezelfde tools, routes en schema's, en levert de uitkomsten als
JSON en het constructierapport als PDF.

- Code: `packages/headless/src/` (de server in Node) en
  `packages/desktop/src/mcp/dienst/` (het project in het geheugen, het doorrekenen en de
  eigen tools; zonder React of stores, en dus door `tsc` gecontroleerd).
- Bouwen: `node scripts/bouw-rekendienst.mjs` maakt
  `packages/headless/dist/rekendienst.mjs`, één bestand voor Node 24 met de rekenkern, de
  tools, de moduleteksten en de vertalingen erin. Met `--paginas` ook
  `packages/desktop/dist-rekendienst/`, de pagina's voor het rapport als PDF.
- Image: `ghcr.io/openaec-foundation/open-calcsheet-studio-api:<versie>` en `latest`, bij
  elke release (`docker/rekendienst.Dockerfile`).
  Hetzelfde Dockerfile bouwt ook voor linux/arm64 (de SuperCloud bouwt zo haar eigen image),
  dan zonder de server van FEM Studio: daar is nog geen arm64-versie van.

## Starten

```sh
npm ci
npm run build:rekendienst        # de core, de dienst en de pagina's voor de PDF
REKENDIENST_TOKEN=<sleutel van minstens 16 tekens> node packages/headless/dist/rekendienst.mjs
```

De dienst luistert dan op `http://127.0.0.1:8080`. MCP over stdio, voor een client die de
dienst zelf start (geen sleutel nodig: wie het proces start, heeft het al in handen):

```sh
node packages/headless/dist/rekendienst.mjs --stdio
```

Met Docker:

```sh
docker run -p 8080:8080 -e REKENDIENST_TOKEN=<sleutel> ghcr.io/openaec-foundation/open-calcsheet-studio-api:latest
```

### Instellingen

| Variabele | Standaard | Betekenis |
|---|---|---|
| `REKENDIENST_TOKEN` | — | API-sleutels, gescheiden door komma's; elk minstens 16 tekens. Verplicht voor HTTP. |
| `REKENDIENST_TOKEN_BESTAND` | — | Of: een bestand met de sleutels, één per regel (een Docker-secret). |
| `REKENDIENST_ADRES` | `127.0.0.1` (image: `0.0.0.0`) | Het adres om op te luisteren. Ook `--adres`. |
| `REKENDIENST_POORT` | `8080` | De poort. Ook `--poort`; `--poort 0` kiest een vrije. |
| `REKENDIENST_MAX_MB` | `10` | Grootste verzoek in MiB; daarboven 413. |
| `REKENDIENST_MAX_GELIJK` | `4` | Zoveel verzoeken tegelijk; daarboven 429 met `Retry-After`. |
| `REKENDIENST_TIJD_S` | `120` | Time-out per verzoek; daarna 504. |
| `REKENDIENST_TAAL` | `en` | Taal van de uitwerking (HTML) en van een nieuw rapport. |
| `REKENDIENST_FEM_SERVER` | `OCSS_FEM_SERVER`, dan `packages/desktop/src-tauri/fem-studio/openaec-mcp-server` | De server van Open FEM Studio. |
| `REKENDIENST_CHROMIUM` | de eerste van Chromium, Chrome of Edge op de gewone plek | Voor het rapport als PDF. |
| `REKENDIENST_PAGINAS` | `packages/desktop/dist-rekendienst` | De pagina's voor het rapport. |
| `REKENDIENST_CHROMIUM_ZONDER_SANDBOX` | — | `1`: Chromium zonder zijn sandbox, in een container zonder user namespaces (het image). |

## Routes

Op één poort. `/v1/…` is hetzelfde als `/api/v1/…`: de paden van het gezamenlijke contract
van OpenAEC en die van de desktop-app komen bij dezelfde afhandeling uit (`rest.ts`).

| Route | Sleutel | Wat |
|---|---|---|
| `GET /v1/health` | nee | `{"status":"ok","name","version","fem","pdf"}`; `fem` is `available` of `not_included`, `pdf` `available` of `not_available`. |
| `GET /v1/openapi.json` | nee | De OpenAPI 3.1-specificatie, uit dezelfde registry als die van de app. |
| `GET /v1/tools` | ja | Elke tool met zijn JSON-schema en routes. |
| `POST /v1/tools/{naam}` | ja | Elke tool, met de MCP-argumenten als JSON-body. |
| `POST /mcp` | ja | MCP (streamable HTTP, alleen JSON-antwoorden, geen event stream). `DELETE /mcp` beëindigt een sessie. |
| `/api/v1/…` | ja | De routes van [api.md](api.md#routes) voor de gedeelde tools, plus de eigen hieronder. |

Statussen en de vorm van een fout zijn die van de app ([api.md](api.md#statussen)), met
daarnaast 401 (geen of een verkeerde sleutel), 403 (een verzoek met een `Origin`-header:
de dienst is er voor servers, niet voor een browser), 413 (te groot), 429 (te veel
tegelijk) en 504 (time-out).

### Projecten en sessies

- **MCP:** elke sessie (`initialize`) krijgt een eigen, leeg project in het geheugen. De
  tools van de app werken daarop, net als in de app op het open project.
  `project_load` laadt een project uit zijn inhoud, `project_export` geeft het terug.
  Een sessie vervalt na 30 minuten zonder verzoek; er zijn er hooguit 64.
- **REST:** zonder header werkt een verzoek op een nieuw, leeg project, dat daarna weg
  is. Geef de inhoud van een project mee aan `project_evaluate` of `report_pdf`. Met de
  header `Mcp-Session-Id` van een open MCP-sessie werkt een REST-verzoek op het project
  van die sessie.
- **Geen paden.** Een verzoek noemt nooit een bestand op de server: een project, een PDF
  of een rekentekst gaat als inhoud mee.

### Tools

Gedeeld met de app, ongewijzigd uit dezelfde registry (`packages/desktop/src/mcp/tools.ts`),
met dezelfde schema's en routes: `project_get`, `project_new`, `project_set_name`,
`project_set_data`, `project_set_visibility`, `report_get`, `report_set`, `undo`, `redo`,
`modules_list`, `sheets_list`, `sheet_add`, `sheet_add_pdf` (alleen `base64`),
`sheet_get`, `sheet_set_source`, `sheet_set_input`, `sheet_set_pdf` (alleen `base64`),
`sheet_rename`, `sheet_duplicate`, `sheet_move`, `sheet_remove`, `sheet_select`,
`sheet_evaluate`, `sheet_insert_formula`, `calc_evaluate`, `formulas_list`, `formula_get`
en `ifc_get`.

Alleen in de dienst (`packages/desktop/src/mcp/dienst/tools.ts`):

| Tool | Route | Wat |
|---|---|---|
| `project_load` | `POST /api/v1/project/load` | Een project laden uit zijn inhoud (`content`: `.ifccalculation`, IFCX of losse rekentekst). |
| `project_export` | `GET /api/v1/project/export` | Het project als inhoud van een `.ifccalculation`, met de uitkomsten erin. |
| `project_evaluate` | `POST /api/v1/project/evaluate` | Elk blad doorrekenen: titel, norm, UC, oordeel, UC's en getallen per blad, met de FEM-blokken. Met `content` op een eigen project; `values` (per blad-id, kenmerk of naam), `projectData`, `sheets`, `names`. |
| `evaluate_sheet` | `POST /api/v1/evaluate/sheet` | Eén rekentekst met invoer: de getallen per naam, de regels (zoals `calc_evaluate`) en de uitwerking als HTML. |
| `list_includes` | `GET /api/v1/includes` | Wat een rekentekst met `#include` of `@img(…)` kan opnemen. |
| `report_pdf` | `POST /api/v1/report/pdf` | Het constructierapport als PDF, in base64, met het aantal pagina's. |

Niet in de dienst, met de reden (`NIET_GEDEELD`): `app_info` (adressen van de desktop-app;
de dienst heeft `/v1/health`), `project_open`, `project_save`, `project_save_as`,
`recent_files`, `export_ifc`, `export_pdf`, `report_export_pdf` (paden en bestanden;
`project_load`, `project_export`, `ifc_get` en `report_pdf` geven de inhoud),
`library_list`, `library_install`, `library_remove` (de online modulebibliotheek),
`print`, `view_get`, `view_set`, `settings_get` en `settings_set` (het venster en de
instellingen van de desktop-app).

### Voorbeelden

```sh
T=<sleutel>
API=http://127.0.0.1:8080

curl $API/v1/health

# Een rekentekst met invoer
curl -H "Authorization: Bearer $T" -H "Content-Type: application/json" \
  -d '{"source": "q = ?{5} kN/m\nL = 6 m\nM = q*L^2/8", "values": {"q": 7}}' $API/v1/tools/evaluate_sheet

# Een heel project, met CC3 en een andere invoer voor blad 2 (jq maakt de body)
jq -n --rawfile c project.ifccalculation '{content: $c, projectData: {CC: "3"}, values: {"2": {n: 4}}}' \
  | curl -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d @- $API/api/v1/project/evaluate

# Het rapport als PDF
jq -n --rawfile c project.ifccalculation '{content: $c}' \
  | curl -H "Authorization: Bearer $T" -H "Content-Type: application/json" -d @- $API/api/v1/report/pdf \
  | jq -r .base64 | base64 -d > rapport.pdf
```

Een MCP-client met een `mcpServers`-blok:

```json
{
  "mcpServers": {
    "open-calcsheet-studio-api": {
      "type": "http",
      "url": "https://<adres van de dienst>/mcp",
      "headers": { "Authorization": "Bearer <sleutel>" }
    }
  }
}
```

## Hoe hij rekent

Met dezelfde kern en dezelfde regels als de app:

- **Projectgegevens** als scope (CC, K_FI, windgebied, …), de **belastingen uit
  hoofdstuk 5** van het rapport en de **eigen elementen** van de projectgegevens als
  projecttekst vóór elk blad, de **eigen eenheden** van het project, en de **verwijzingen
  tussen bladen en naar spreadsheetcellen** (`#1.R_paal`, `#3.Blad1!B4`). Wat de
  projectstore in de app bij elke wijziging aan de kern doorgeeft, zet de dienst vlak voor
  elke doorrekening (`dienst/rekenen.ts`, `activeer`).
- **Getallen** langs de weg van de API van de app (`rekenBlad`): in de eenheden van het
  blad. De **uitwerking (HTML)** langs de weg van de afdruk: in de taal van de uitvoer en
  het eenhedenstelsel van het project.
- **`@toets`, `@fem` en `@kern`:** vóór `project_evaluate` en `report_pdf` doet de dienst
  wat de app vóór het afdrukken doet: elk verzoek zonder antwoord gaat naar de
  meegeleverde server van Open FEM Studio (`packages/headless/src/fem.mjs`, dezelfde
  afspraken als de Rust-brug van de app: alleen rekentools, geen paden, 30 s om te
  starten, 300 s per toets), en het antwoord wordt bij het blad vastgelegd. Zonder server
  staat een blok zonder vastgelegd antwoord als niet getoetst; `fem.notComputed` per blad
  telt ze. Eén zo'n doorrekening tegelijk: de antwoorden staan één keer per proces.
- **Rapport als PDF:** headless Chromium laadt de pagina's van de rekendienst
  (`vite build --mode rekendienst`: de gewone app, met de Library in de bundel en de haak
  `window.__ocs`) van een eigen server op 127.0.0.1, laadt het project en drukt het rapport
  af langs dezelfde weg als "Rapport (PDF)" in de app en `scripts/rapport-pdf.mjs`. Elk
  verzoek van de pagina naar een ander adres wordt geweigerd, dus een blad met een
  afbeelding of script van buiten haalt niets op. Eén Chromium, per rapport een eigen
  browsercontext.

Zie ook de Linux-app als container ([supercloud-werkplek.md](supercloud-werkplek.md#de-linux-app-als-container)):
dat is de grafische app, gestreamd naar de browser; deze dienst heeft geen venster.

## Licenties in het image

De app valt onder de LGPL-3.0 (`/opt/rekendienst/LICENSE`); de npm-pakketten in de dienst
en de pagina's staan met hun licentie in `/opt/rekendienst/THIRD-PARTY-NOTICES.txt`
(`scripts/vermeldingen-derden.mjs`). De server van Open FEM Studio valt onder de AGPL-3.0
en draait als apart programma. Hij gaat net als in de installers nooit zonder zijn bron
mee: `/opt/rekendienst/fem-studio/` heeft `LICENSE-AGPL-3.0.txt`,
`THIRD-PARTY-NOTICES.txt`, `SOURCE.txt` en het bronarchief van precies die versie
(`haal-fem-server.mjs --bron`); zie [ontwikkelen.md](ontwikkelen.md). De Debian-pakketten
(Node.js, Chromium, lettertypen) hebben hun vermeldingen in `/usr/share/doc`.

## Controle

- `node scripts/check-rekendienst.mjs` (ook in `npm run check`): bouwt de dienst, start
  hem op een vrije poort en vergelijkt met de app in hetzelfde proces. De gedeelde tools
  hebben hetzelfde schema als in de registry, elke tool van de app is gedeeld of staat met
  reden in `NIET_GEDEELD`; de grenzen (401, 403, 404, 413, 429, geen paden); een project
  met belastingen uit hoofdstuk 5, een eigen projectwaarde, CC3, een verwijzing naar een
  ander blad en een module geeft per blad dezelfde getallen als de API van de app en
  dezelfde UC en hetzelfde oordeel als de IFCX-export, via REST, `/v1` en MCP, met de
  handberekening van R_paal; elke ingebouwde module via `evaluate_sheet`; MCP over HTTP
  (sessies) en stdio; een `@toets`-blok met of zonder FEM Studio; en met Chrome of
  Chromium en de gebouwde pagina's een rapport als PDF.
- `node scripts/rooktest-rekendienst.mjs <adres> <sleutel> --volledig`: een draaiende
  dienst, zoals het image in de release-workflow, vóór het publiceren.
