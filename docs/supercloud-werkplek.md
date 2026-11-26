# De werkplek van de OpenAEC SuperCloud

In de werkplek van een SuperCloud-omgeving draait de app als statische bundel in
een afgeschermd frame: `sandbox="allow-scripts allow-modals"`, zonder
`allow-same-origin`. Het frame heeft dus een opaque origin, geen netwerk buiten de
bundel, geen opslag in de browser en geen popups. Het contract staat in de OpenAEC
Blueprint, `docs/supercloud-koppeling.md` (route A).

## De platformbouw

```
npm ci
npm run build:platform
```

De uitvoer staat in `packages/desktop/dist-platform/`. Dat is
`vite build --mode platform --base ./ --outDir dist-platform` in
`packages/desktop`, na de bouw van de rekenkern. Zo bouwt de SuperCloud, zonder de
`npm`-scripts van de pakketten:

```
npm ci --ignore-scripts
npm run build --workspace=@ifc-calc/core
cd packages/desktop
../../node_modules/.bin/vite build --mode platform --base ./ --outDir dist-platform
```

`--sourcemap hidden` mag erbij; de bundel blijft dan gelijk.

Wat de modus `platform` anders doet (`vite.config.ts`, `src/werkplek/werkplek.ts`):

- **Relatieve paden** (`--base ./`): dezelfde bundel draait onder elk pad.
- **Geen inline scripts.** `index.html` heeft één `<script src>`. De icoonsprites
  staan wel in `index.html` (SVG, geen script), want een `<use>` naar een los
  SVG-bestand werkt niet in een frame met een opaque origin.
- **De Library zit in de bundel** (`library/`), en `mcp-tools.json` staat ernaast.
- **Geen feedbackknop en geen feedbackvenster.** De SuperCloud heeft een eigen knop.
  De app heeft geen update-check, geen analytics (die voegt alleen de bouw van de
  website toe, `.github/workflows/live.yml`) en geen eigen login. De koppeling met
  ERPNext staat in de werkplek uit.
- **Geen netwerk buiten de bundel.** De kaarten van Locatie en Windgebied hebben geen
  achtergrond (geen tegels van OpenStreetMap); klikken, slepen en coördinaten
  typen werken wel. Een adres zoeken, kaartbeelden maken en water meten geven een
  melding. Net zo de online modulebibliotheek, een webpagina (`@iframe`), een
  afbeelding van buiten en een script (`@js`) in een blad. De speld van de kaarten
  zit in de bundel, ook in de gewone bouw.
- **Geen opslag in de browser.** Instellingen gaan naar `openaecHost.settings`
  (`src/store.ts`), met een kopie in het geheugen. Het open project, de recente
  bestanden en de sleutel van de MCP-brug blijven alleen in het geheugen. Kleine
  voorkeuren (een paneel dicht, de papierrand in een werkmap) en de lokale
  normbestanden blijven tot de pagina sluit.
- **Geen popups.** Een link naar buiten geeft een melding met het adres;
  `window.open` van een bibliotheek ook. Afdrukken in het eigen document mag.
- **Workers.** Een opaque frame mag geen module-worker starten vanaf een
  http-adres. De app maakt er een klassieke worker van die het script met
  `import()` laadt (`zetWorkerOmweg`).
- **Taal.** `openaecHost.taal` gaat voor; een taal die de app niet kent, wordt
  Engels. Het event `openaec-host-preferences` meldt een wijziging.

Jupyter, Marimo en de PDF zonder printdialoog werken alleen in de desktop-app; in
de browser, en dus ook in de werkplek, staat daar een melding. Rapport (PDF) opent
de printdialoog van de browser.

## Openen en opslaan

Via `window.openaecHost` (`src/tauri/fileOps.ts`). Een bestand uit Docs heeft in de
app het pad `docs:<id>`.

- **Bij de start:** `open(initialFileId)`. Komt de host later dan de app, dan wacht de
  app tot 3 s op `openaec-host-ready`.
- **Opslaan** (Ctrl+S): `save(bytes, { id, expectedVersion })`, een nieuwe versie.
  Geeft de host een kopie terug (een conflict), dan meldt de app de naam en werkt
  hij verder in de kopie.
- **Opslaan als** (Ctrl+Shift+S): vraagt een naam en doet `save(bytes, { name })`;
  daarna is dat het geopende bestand. Alleen `.ifccalculation`.
- **Openen** (Ctrl+O): `list()`, de gebruiker kiest een nummer, `open(id)`.
- **Alleen-lezen** (`readOnly`): Opslaan wordt Opslaan als.
- Een fout van de host komt als melding, niet als crash.

De assistent van de SuperCloud krijgt de tools van de MCP-server via
`window.__OPDS_APP__`; zie [mcp.md](mcp.md).

## Controle

`node scripts/check-platformbouw.mjs` (ook in `npm run check`) bouwt de bundel in
een tijdelijke map en controleert:

- geen inline `<script>` of event-handler, alle paden relatief;
- geen adres van een dienst buiten de bundel en geen laadopdracht naar een absoluut
  adres; de bewust afgevangen gevallen staan met hun reden in het script;
- geen `localStorage`, `sessionStorage` of IndexedDB, en `window.open` alleen in de
  spreadsheetbibliotheek (afgevangen);
- de proef: de bundel in headless Chrome of Edge, in een frame met
  `sandbox="allow-scripts allow-modals"`, met de CSP-kop van de werkplek en een
  nagebootste `openaecHost` (`scripts/lib/werkplek-proef.mjs`). De app moet starten
  zonder fouten in de console van frame, gastpagina en workers, zonder verzoeken
  buiten de bundel, en het startbestand openen, opslaan als nieuwe versie, opslaan
  als nieuw bestand en openen uit de lijst. Zonder Chrome of Edge valt de proef weg.

Met `--bundel <map>` controleert het script een bestaande bouw.

## De Linux-app als container

Naast de platformbouw in een frame is er een tweede route: de grafische Linux-app zelf in
een eigen container, gestreamd naar de browser. Bij elke release komt het image
`ghcr.io/openaec-foundation/open-calcsheet-studio:<JJJJ.W.N>` en `latest` (linux/amd64),
gebouwd uit de `.deb` van die release, zonder aparte bouw van de app
(`docker/app.Dockerfile`, `.github/workflows/docker-images.yml`).

- **Eén app, geen bureaublad.** Xvfb als scherm, `matchbox-window-manager` zet de app
  schermvullend zonder titelbalk, x11vnc en websockify maken er een stroom van, en
  `docker/app/poort.mjs` biedt die met noVNC aan op poort 3000. Sluit de gebruiker de app,
  dan start hij opnieuw (`docker/app/start.sh`).
- **Mappen.** `/openaec` voor de bestanden van de gebruiker, van buiten gekoppeld; de
  dialogen beginnen daar. `/config` voor de instellingen (een volume; daarin staan de
  XDG-mappen van de app en `preferences.json`).
- **Zonder root,** zonder `--privileged`, FUSE of GPU: WebKitGTK tekent in software.
- **Instellingen uit de omgeving:** `OCSS_TAAL`, `OCSS_THEMA`, `OCSS_BESTAND` (een bestand
  dat bij de start opent), `OCSS_SCHERM` en `OCSS_MCP_TOKEN`; zie README.md › Docker.
  `docker/app/voorkeuren.mjs` zet ze bij elke start in `preferences.json`.
- **Gezondheid:** `GET /gezond` en de `HEALTHCHECK` zijn alleen OK als het proces van de
  app leeft, zijn venster zichtbaar op het scherm staat en de stroom luistert.
- **MCP:** de MCP-server en REST-API van de app luisteren in de container op
  127.0.0.1:3879; `socat` zet ze door naar poort 3001, voor het interne netwerk. Publiceer
  die poort niet.
- **Netwerk:** de app heeft geen update-check (een update is een nieuw image); welke
  verbindingen hij wel maakt, staat in README.md › Docker.
- **Ondertekend en getest:** de workflow controleert de OpenPGP-handtekening van de
  `.deb`, bouwt het image, start het, wacht tot het gezond is, controleert dat het proces
  draait, kijkt in headless Chromium naar de stroom en bewaart een schermafbeelding
  (`scripts/rooktest-app-image.mjs`). Pas dan gaat het naar GHCR, ondertekend met cosign
  (zonder sleutel), met een SBOM en een build-attestatie, en komt het geheugengebruik in
  rust in de release-tekst.

## Rekenen zonder werkplek

Rekenbladen doorrekenen als dienst, zonder werkplek en zonder ingelogde gebruiker, doet
de rekendienst: [rekendienst.md](rekendienst.md), image
`ghcr.io/openaec-foundation/open-calcsheet-studio-api`.

## Een versie vastpinnen

De SuperCloud bouwt de bundel zelf uit een vaste commit
(`scripts/werkplek-versies.txt` in openaec-bench). Pin op een **release-tag** van
deze repo: `vJJJJ.W.N` (jaar, week, volgnummer), gemaakt door de workflow
`Build and Release` vanaf `main` (`.github/workflows/release.yml`). Een tag wijst naar één
commit en verandert niet. De platformbouw zit in elke release vanaf de eerste die
deze bouw bevat; zie "Nog niet uitgebracht" in [CHANGELOG.md](CHANGELOG.md).

Zo komt de regel tot stand:

```
git fetch --tags origin
git rev-parse vJJJJ.W.N^{commit}      # de volledige SHA van 40 tekens
```

```
calcsheet  <map van de kloon>  vJJJJ.W.N  <sha>  LGPL-3.0-only  https://github.com/OpenAEC-Foundation/Open-CalcSheet-Studio
```

De licentie: [LICENSE](../LICENSE) (LGPL-3.0). De bouwopdracht is die hierboven,
zonder `npm`-scripts (`npm ci --ignore-scripts`); de bundel is
`packages/desktop/dist-platform/`.
