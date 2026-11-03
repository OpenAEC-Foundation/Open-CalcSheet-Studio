# Jupyter-blad

Een blad met een eigen werkmap: notebooks, Python-scripts en databestanden, in een
echte JupyterLab-omgeving binnen de app. Er is geen Python-installatie nodig.

## Opbouw

| Deel | Wat |
|---|---|
| `store/jupyterBlad.ts` | De werkmap: inpakken als ZIP, padcontrole, vertrouwen eraf, omhulsel en rechten van de iframe. Puur, ook in Node te laden. |
| `components/calc/JupyterBladWeergave.tsx` | De plek in de werkruimte en `JupyterHouder`, die de vensters houdt. Een iframe verplaatsen herlaadt hem, dus de vensters staan in een eigen laag en worden over de plek gelegd. |
| `components/calc/JupyterVenster.tsx` | Eén venster en het gesprek met de omgeving. |
| `components/calc/jupyterPapier.ts` | Het notebook op papier, uit de opgeslagen uitvoer. |
| `src-tauri/src/jupyter_omgeving.rs` | Statische server op 127.0.0.1, leest uit `omgeving.pak`. |
| `jupyter-omgeving/` | Wat er bij het bouwen in de omgeving komt: configuratie, de brug `ocss-brug.js`, het accent en de licenties. |
| `scripts/bouw-jupyter-omgeving.mjs` | Bouwt `src-tauri/jupyter-omgeving/omgeving.pak`, op vaste versies en hashes. |

Het project is de enige bewaarplek. De omgeving houdt zijn bestanden in het geheugen
(`memoryStorageDriver`); bij het laden stuurt de app ze erheen, en na een wijziging
haalt de app de stand op en bewaart die als ZIP in `Exemplaar.jupyter` en in het
IFCX-attribuut `ocss::blad::jupyter`. Er blijft dus geen kopie van een werkmap achter
in de opslag van de webview. Opslaan vraagt eerst de laatste stand op via dezelfde
bewaarders als een spreadsheet (`bewaarOpenWerkmappen`). Wegklikken verliest niets: het
venster blijft leven. Er leven hoogstens drie omgevingen tegelijk.

## Waarom een server op loopback

JupyterLite heeft een service worker nodig om vanuit de kernel bij de bestanden te
komen, en die laadt niet via het app-protocol van Tauri. Elk blad krijgt daarom een
eigen herkomst: `http://blad-<sleutel>.localhost:<poort>`. Zo delen twee bladen geen
opslag, service worker of kernel. `*.localhost` geldt in WebView2 als veilige context.

Getest op Windows met WebView2. macOS en Linux zijn niet getest; WKWebView kent service
workers alleen met extra rechten, dus daar zal het blad waarschijnlijk niet starten.
De bestanden en de afdruk werken daar wel; de kernel niet.

## Grootte en offline

Bij het bouwen zijn internet en Python nodig; bij de gebruiker niets.

| | MB |
|---|---|
| `omgeving.pak` op schijf, na installatie | 65 |
| waarvan JupyterLab | 16 |
| waarvan Pyodide (kern, standaardbibliotheek) | 12 |
| waarvan Python-pakketten | 36 |
| daarvan in de installer, gecomprimeerd | ongeveer 44 |
| de hele NSIS-installer van Windows, gemeten | 56,5 |

De omgeving zit in de installer en niet in een download bij het eerste gebruik: alles
werkt dan meteen en zonder internet, ook numpy, scipy, pandas en matplotlib. `%pip
install` van andere pakketten werkt niet (zie hieronder). Een pakket erbij: voeg het toe
aan `PAKKETTEN` in het bouwscript, als het in de lijst van Pyodide staat.

## Afscherming

Code in een notebook kan van iemand anders komen. Er zijn vier lagen:

1. **WebAssembly.** Python draait in een worker in de iframe. Het ziet alleen zijn eigen
   werkmap onder `/drive`, niet de bestanden van de computer.
2. **Eigen herkomst.** De iframe kan niet bij het document van de app of bij een ander
   blad. Tauri zet zijn globale namen op Windows ook in iframes (`__TAURI_INTERNALS__`),
   maar weigert elke opdracht die niet van de eigen herkomst komt.
3. **CSP in de antwoordkoppen.** Geen verzoek naar buiten: `connect-src`, `img-src`,
   `font-src` en de rest staan alleen op de eigen herkomst. Dat geldt ook voor de workers
   en dus voor Python. De iframe staat alleen in de app.

   Geen `unsafe-inline` in `script-src` en de renderers voor JavaScript en Vega staan uit:
   uitvoer van een cel kan geen script in het venster starten, ook niet na uitvoeren. Dat
   is ook de afscherming tegen WebRTC, dat een CSP in WebView2 niet tegenhoudt en dat
   alleen in het venster bestaat, niet in de worker van Python. Gevolg: `display(Javascript(...))`
   en bibliotheken die op JavaScript in de uitvoer leunen (plotly, bokeh, ipywidgets) doen
   niets. `unsafe-eval` blijft, omdat JupyterLab en Pyodide het zelf nodig hebben.
4. **Omhulsel.** De iframe zit in een tweede iframe zonder script, waarvan `frame-src` hem
   op zijn herkomst houdt. Zo kan code de pagina niet naar buiten navigeren met een waarde
   in het adres. Zonder `allow-top-navigation` en `allow-popups` kan hij het hoofdvenster
   niet wegsturen en geen venster openen.

Python heeft dus geen netwerk: `js.fetch`, `pyfetch`, `open_url`, `urllib`, `socket` en
`%pip install` lukken niet. Dat is een bewuste keuze voor deze eerste versie; een
instelling per blad kan later.

Navigeert code de pagina toch, dan weigert het omhulsel dat en toont de iframe een
foutpagina. Er gaat niets naar buiten en het project houdt de laatste stand; de melding
boven het venster biedt *Opnieuw laden*.

Er draait niets uit zichzelf. De kernel start bij het openen, maar geen cel; alleen de
brug zet één regel klaar in de kernel: een terugval die bij een mislukte import nog één
keer zoekt. Python onthoudt de inhoud van een map tot de wijzigingstijd verandert, en die
is op `/drive` altijd 0. Zonder terugval blijft een nieuw script onvindbaar. Een notebook
verliest bij het inlezen zijn vertrouwen (`trusted`), dus HTML in de opgeslagen uitvoer
wordt door JupyterLab geschoond. Afbeeldingen en tabellen blijven zichtbaar.

De server geeft alleen statische inhoud, geen projectgegevens. Hij luistert op loopback,
kent alleen GET en HEAD en antwoordt alleen op de eigen hostnamen.

## Op papier

Elk notebook met tekstcellen, code en uitvoer (tekst, tabellen, afbeeldingen), uit de
opgeslagen werkmap en zonder kernel. HTML gaat door dezelfde opschoning als de rest van de
app (`schoonUitwerking`, DOMPurify). De keuze *Code op papier* staat per blad; een cel met
`source_hidden`, `outputs_hidden` of de tag `remove-input`, `remove-output` of `remove-cell`
volgt zijn eigen instelling. Wat te hoog is voor een vel wordt geknipt op regels of rijen.

## Controleren

```
node scripts/check-jupyter.mjs
node scripts/proef-jupyter-venster.mjs <pad-naar-exe> <map-voor-uitvoer>
```

De eerste draait mee in `check-alles`. De tweede vraagt een Tauri-build en stuurt het echte
venster aan: rekenen, opslaan, twee bladen, een notebook van iemand anders, afscherming met
een eigen luisterpost, heropenen en afdruk. Bouw daarvoor met een eigen identifier (zie de
kop van het script): de opgeslagen appstaat hangt daaraan, niet aan de opslagmap van de
webview.

`cargo test --lib` start op de ontwikkelmachine niet: het testprogramma valt bij het laden
om (`STATUS_ENTRYPOINT_NOT_FOUND`), nog vóór de eerste test. De tests in
`jupyter_omgeving.rs` zijn daarom apart gedraaid, in een kleine crate zonder Tauri.

## Licenties

Zie `packages/desktop/jupyter-omgeving/LICENTIES.md`; dat bestand gaat ook mee in de
omgeving. In de app zelf: `fflate` (MIT) en `marked` (MIT).
