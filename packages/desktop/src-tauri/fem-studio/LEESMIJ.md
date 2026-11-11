# FEM Studio

Hier komt de server van Open FEM Studio (`openaec-mcp-server`, op Windows met
`.exe`). CalcSheet start hem headless voor de normtoetsingen
(`src/fem_studio.rs`, `fem-brug/`). Hij staat niet in git.

`versie.json` pint de versie en per platform het bestand en zijn sha256;
`node scripts/pin-fem-server.mjs vJJJJ.W.N` vult het uit een release van FEM Studio.
`node scripts/haal-fem-server.mjs` haalt het bestand op uit de release van FEM
Studio en controleert de sha256. `tauri build` doet dat zelf via
`beforeBuildCommand` (`--als-nodig`). Zonder bestand voor het platform, of zonder
toegang tot die release, bouwt de app gewoon. Instellingen › Over meldt dan
"niet meegeleverd".

De server gaat ongewijzigd mee, met de handtekening van FEM Studio; Tauri tekent
een resource niet. Zie `docs/ondertekening.md`.

In een debug-build gebruikt de app ook `OCSS_FEM_SERVER` of een geïnstalleerde
FEM Studio. Zie `docs/ontwikkelen.md`.

Deze LEESMIJ staat er zodat `fem-studio/*` in `bundle.resources` ook zonder
server iets vindt.
