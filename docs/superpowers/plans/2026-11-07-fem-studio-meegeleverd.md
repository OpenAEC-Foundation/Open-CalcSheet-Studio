# FEM Studio meegeleverd (stap 1) — implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** CalcSheet start de server van Open FEM Studio headless als kindproces, praat er MCP via stdin/stdout mee, en geeft de webview drie commando's: status, tools en aanroep.

**Architecture:** Een Rust-module `fem_studio.rs` beheert één langlopend proces met een leesdraad die antwoorden op id terugkoppelt (de server beantwoordt verzoeken parallel, dus niet op volgorde). De protocolstukken zijn losse functies en zijn zonder proces te toetsen. De server komt als resource mee (`fem-studio/`), niet als `externalBin`: zo bouwt de app ook zonder server, en dan meldt hij "niet meegeleverd". Tot FEM Studio #298 er is, gebruikt de ontwikkelomgeving `OCSS_FEM_SERVER` of de geïnstalleerde FEM Studio.

**Tech Stack:** Rust (Tauri 2, serde_json, std::process, mpsc), TypeScript (React, `@tauri-apps/api/core` invoke), Node-script voor het ophalen.

**Spec:** `docs/superpowers/specs/2026-11-07-toetsing-via-fem-studio-design.md`, §1 en §7 stap 1.

## Global Constraints

- Protocol: newline-delimited JSON-RPC 2.0, `protocolVersion` "2025-06-18"; volgorde `initialize` → `notifications/initialized` → `tools/list` / `tools/call`.
- Alleen deze tools mogen worden aangeroepen: naam begint met `check_`, `list_`, `compute_`, `concrete_`, of is `validate_fem_model`, `solve_fem_model`, `portaal_maken`, `fem_solver_status`. Nooit `gui_*`, `app_*`, `project_*`, `model3d_*`, `load_fem_project` of tools die bestanden lezen of schrijven.
- Zoekvolgorde van de server: `OCSS_FEM_SERVER` → resource `fem-studio/openaec-mcp-server(.exe)` → alleen in een debug-build de geïnstalleerde FEM Studio (`%LOCALAPPDATA%\Open FEM Studio\openaec-mcp-server.exe`, `/Applications/Open FEM Studio.app/Contents/MacOS/openaec-mcp-server`, `/usr/bin/openaec-mcp-server`).
- Het proces start bij de eerste aanroep, niet bij het openen van de app, en stopt met de app.
- Tijdslimiet per aanroep: 300 s; `initialize` en `tools/list`: 30 s.
- Geen namen van externe rekensoftware in code, commentaar, commits of docs.
- Commits eindigen met `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **Server valt om midden in een aanroep:** de aanroep geeft binnen de tijdslimiet een fout ("FEM Studio is gestopt"), en de volgende aanroep start het proces opnieuw. Test: `herstart_na_gestopt_proces` (Task 1, met de echte server: proces doden, dan opnieuw aanroepen).
- **Twee aanroepen tegelijk:** antwoorden komen in een andere volgorde terug en elk gaat naar zijn eigen verzoek. Test: `antwoorden_op_id_gekoppeld` (Task 1, leesdraad op een nagebouwde stroom met omgekeerde volgorde).
- **Een tool die niet mag** (`gui_quit`, `project_save`): geweigerd vóór er iets naar de server gaat. Test: `alleen_toegestane_tools` (Task 1).
- **Een `isError`-antwoord** van een check-tool: komt als `Err` met de melding en de gestructureerde fout, geen paniek en geen lege uitkomst. Test: `fout_uit_toolresultaat` (Task 1).
- **De webview buiten Tauri** (vite-preview, controlescripts): `femStudioStatus()` geeft `{beschikbaar: false}` met een reden in plaats van een uitzondering. Getoetst in Task 3 met de browserpreview.

---

### Task 1: Procesbeheer en protocol in Rust

**Files:**
- Create: `packages/desktop/src-tauri/src/fem_studio.rs`
- Modify: `packages/desktop/src-tauri/src/lib.rs` (mod, `.manage`, drie commando's, stoppen bij afsluiten via `.build(context)` + `.run(|app, event| …)` op `RunEvent::Exit`)

**Interfaces:**
- Produces (Rust):
  - `pub fn verzoek_regel(id: u64, methode: &str, params: serde_json::Value) -> String`: één JSON-regel met `\n`.
  - `pub fn lees_regel(regel: &str) -> Option<(u64, Result<serde_json::Value, String>)>`: `None` voor notificaties en onleesbare regels; `Err` bij een JSON-RPC-`error`.
  - `pub fn toolresultaat(resultaat: serde_json::Value) -> Result<serde_json::Value, serde_json::Value>`: `structuredContent`, of de geparste `content[0].text`. Bij `isError: true` is het `Err` met `{melding, gestructureerd}`.
  - `pub fn toegestaan(tool: &str) -> bool`.
  - `pub struct FemStudio` (de Tauri-state, `Default`), met daarin `Mutex<Option<Arc<Proces>>>`.
  - Commando's:
    - `fem_studio_status(app, state) -> Result<FemStatus, String>`, met `FemStatus { beschikbaar: bool, versie: Option<String>, pad: Option<String>, reden: Option<String> }`. Het commando start het proces als dat nodig is.
    - `fem_studio_tools(app, state) -> Result<serde_json::Value, String>`: het resultaat van `tools/list`.
    - `fem_studio_aanroep(app, state, tool: String, argumenten: serde_json::Value) -> Result<serde_json::Value, serde_json::Value>`.

- [ ] **Step 1: Schrijf de unit-tests** in `fem_studio.rs` (`#[cfg(test)] mod tests`):
  - `verzoek_regel_is_een_regel`: `verzoek_regel(7, "tools/call", json!({"name":"x"}))` eindigt op `\n`, bevat precies één `\n`, en parst tot `{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"x"}}`.
  - `notificatie_wordt_overgeslagen`: `lees_regel(r#"{"jsonrpc":"2.0","method":"notifications/x"}"#) == None`, en `lees_regel("geen json") == None`.
  - `rpc_fout_wordt_err`: `lees_regel(r#"{"jsonrpc":"2.0","id":3,"error":{"code":-32601,"message":"Method not found: x"}}"#)` geeft `Some((3, Err(m)))` met `m` bevat "Method not found".
  - `structured_content_gaat_voor`: `toolresultaat(json!({"content":[{"type":"text","text":"{\"a\":1}"}],"isError":false,"structuredContent":{"a":2}}))` geeft `Ok(json!({"a":2}))`. Zonder `structuredContent` geeft het `Ok(json!({"a":1}))`.
  - `fout_uit_toolresultaat`: `isError: true` met tekst "Error: profiel onbekend" en `structuredContent: {"error_code":"X"}` geeft `Err` met `melding` = "profiel onbekend" (zonder "Error: ") en `gestructureerd.error_code` = "X".
  - `alleen_toegestane_tools`: `toegestaan` is true voor "check_steel_beam", "list_steel_grades", "compute_section_properties", "concrete_mn_kappa", "check_fem_model", "portaal_maken", en false voor "gui_quit", "app_project_save", "project_new", "model3d_get", "load_fem_project", "open_fem_3d_ifc_importeren".
  - `antwoorden_op_id_gekoppeld`: een leesdraad (`fn lees_lus(lezer: impl BufRead, wachtend: Arc<Mutex<HashMap<u64, Sender<…>>>>)`) op een `Cursor` met eerst het antwoord voor id 2, dan een notificatie, dan id 1. Elke ontvanger krijgt zijn eigen antwoord.

- [ ] **Step 2: Draai ze en zie ze falen**
  Run: `cargo test --manifest-path packages/desktop/src-tauri/Cargo.toml fem_studio` (met `CARGO_TARGET_DIR` op de bestaande target-map van de hoofdcheckout)
  Expected: compileerfout, de functies bestaan nog niet.

- [ ] **Step 3: Implementeer de functies, `Proces` en de zoekvolgorde.**
  - `Proces::start(pad)`: `Command` met stdin en stdout als pipe en stderr naar null; op Windows `CREATE_NO_WINDOW`. Een leesdraad loopt over `lees_lus`. Daarna `initialize` en `notifications/initialized`.
  - `Proces::roep(methode, params, tijd) -> Result<Value, String>`: vraagt een id, registreert een `mpsc`-zender, schrijft de regel en doet `recv_timeout`.
  - Loopt de leesdraad af (EOF), dan krijgen alle wachtenden `Err("FEM Studio is gestopt")` en wordt het proces als dood gemarkeerd. De volgende aanroep start opnieuw.
  - `vind_server(app) -> Result<PathBuf, String>` volgt de Global Constraints. Het resourcepad komt uit `app.path().resolve("fem-studio/<naam>", BaseDirectory::Resource)`.

- [ ] **Step 4: Unit-tests groen**
  Run: zelfde commando. Expected: 7 passed.

- [ ] **Step 5: Integratietest met de echte server** (`#[test] #[ignore]`, `echte_server`). Hij start de server uit `OCSS_FEM_SERVER` of het geïnstalleerde pad en toetst:
  - `serverInfo.version` is niet leeg;
  - `tools/list` bevat "check_steel_beam";
  - `list_steel_grades` geeft `Ok`;
  - `check_steel_beam` met `{}` geeft `Err`, zonder paniek.

  Dan `herstart_na_gestopt_proces`: het kind doden, een aanroep geeft `Err`, de volgende `Ok`.
  Run: `cargo test … fem_studio -- --ignored`. Expected: passed op deze machine (FEM Studio 2026.45 geïnstalleerd).

- [ ] **Step 6: Registreer in `lib.rs`.** `.manage(fem_studio::FemStudio::default())` en de drie commando's. Bij `RunEvent::Exit` het kind stoppen. Draai `cargo check`.

- [ ] **Step 7: Commit** — `git add packages/desktop/src-tauri/src/fem_studio.rs packages/desktop/src-tauri/src/lib.rs` en commit "FEM Studio headless starten en aanspreken via stdio".

### Task 2: De server meeleveren: resource, versie en ophalen

**Files:**
- Create:
  - `packages/desktop/src-tauri/fem-studio/LEESMIJ.md`
  - `packages/desktop/src-tauri/fem-studio/versie.json`
  - `scripts/haal-fem-server.mjs`
  - `scripts/check-fem-server.mjs`
- Modify:
  - `packages/desktop/src-tauri/tauri.conf.json` (`resources` + `"fem-studio/*"`; `beforeBuildCommand` begint met `node ../../scripts/haal-fem-server.mjs --als-nodig &&`)
  - `.gitignore` (`packages/desktop/src-tauri/fem-studio/openaec-mcp-server*`)
  - `scripts/check-alles.mjs` (als die een vaste lijst heeft)
  - `.github/workflows/build.yml` (stap vóór de Tauri-build, met `GH_TOKEN: ${{ secrets.FEM_STUDIO_TOKEN }}`)

**Interfaces:**
- `versie.json`: `{ "versie": "2026.45.0", "repo": "OpenAEC-Foundation/open-fem-studio", "bestanden": { "<rust-target-triple>": { "naam": "<assetnaam>", "sha256": "<hex>" } } }`. `bestanden` blijft leeg tot FEM Studio #298 er is.
- `haal-fem-server.mjs`: exporteert `kiesBestand(versie, triple) -> {naam, sha256} | null` en `klopt(pad, sha256) -> boolean`. Als script met `--als-nodig`:
  - staat er een server met de juiste sha256, dan stopt het;
  - is er een bestand voor dit platform en een `GH_TOKEN`, dan haalt het met `gh release download`, controleert de sha256 en zet de server als `fem-studio/openaec-mcp-server(.exe)`;
  - anders meldt het "FEM Studio niet meegeleverd in deze build" en sluit het af met 0.

  Een verkeerde sha256 geeft afsluitcode 1.

- [ ] **Step 1: Schrijf `check-fem-server.mjs`.** Het toetst:
  - `kiesBestand` met een leeg `bestanden`-object geeft `null`;
  - met een triple die er wel en een die er niet in staat;
  - `klopt` op een tijdelijk bestand met de goede en een verkeerde hash;
  - `versie.json` is geldig;
  - het pad in `tauri.conf.json` staat in `resources`.
- [ ] **Step 2: Draai en zie falen.** Run: `node scripts/check-fem-server.mjs`. Expected: het script bestaat nog niet, dus een module-fout.
- [ ] **Step 3: Implementeer** het script, `versie.json`, `LEESMIJ.md` (wat hier hoort en hoe het er komt), `.gitignore`, `tauri.conf.json` en de stap in `build.yml`. Die stap draait alleen als het secret er is. Zet er een notitie bij voor macOS: een uitvoerbaar bestand in Resources moet vóór de bundel ondertekend worden, met dezelfde identiteit als de app.
- [ ] **Step 4: Groen.** Run: `node scripts/check-fem-server.mjs` → "Alles klopt." en `node scripts/haal-fem-server.mjs --als-nodig` → de melding "niet meegeleverd", met code 0.
- [ ] **Step 5: Commit** — "FEM Studio als resource meeleveren, met vastgepinde versie".

### Task 3: De webview: brug en versieregel

**Files:**
- Create: `packages/desktop/src/rekenen/femStudio.ts`
- Modify:
  - `packages/desktop/src/components/settings/SettingsDialog.tsx` (`AboutTabContent`: een regel FEM Studio);
  - `packages/desktop/src/i18n/locales/{nl,en}/settings.json` (`about.femStudio`, `about.femStudioNiet`).

**Interfaces:**
- Consumes: de commando's uit Task 1.
- Produces:
  - `femStudioStatus(): Promise<FemStatus>`;
  - `femStudioTools(): Promise<unknown>`;
  - `femStudioAanroep(tool: string, argumenten: Record<string, unknown>): Promise<unknown>`, die bij een fout een `FemFout` gooit (`{melding: string, gestructureerd?: unknown}`).

  `FemStatus` is in TS hetzelfde als in Rust: `{beschikbaar, versie?, pad?, reden?}`. Buiten Tauri (geen `__TAURI_INTERNALS__`) geeft `femStudioStatus()` `{beschikbaar: false, reden: "alleen in de desktop-app"}`.

- [ ] **Step 1:** `femStudio.ts` met de drie functies. De versieregel in Over toont "FEM Studio: 2026.45.0", of "FEM Studio: niet beschikbaar — <reden>". De status wordt pas gevraagd als de tab Over opent, zodat het proces niet bij elke start opstart.
- [ ] **Step 2: `tsc --noEmit`.** Run: `npx tsc --noEmit -p packages/desktop`. Expected: geen uitvoer.
- [ ] **Step 3: Browserpreview** (calcsheet-dev, 3037). Open Instellingen › Over; de regel toont "niet beschikbaar — alleen in de desktop-app". Geen fout in de console.
- [ ] **Step 4: Commit** — "Versie van FEM Studio bij Over".

### Task 4: Docs en controle

**Files:**
- Modify: `docs/ontwikkelen.md` (sectie "FEM Studio in CalcSheet": de zoekvolgorde, `OCSS_FEM_SERVER`, het ophalen, de integratietest), `docs/CHANGELOG.md`, `README.md` (de tellingen, als `check-readme` dat vraagt).

- [ ] **Step 1:** Schrijf de sectie en de CHANGELOG-regel. De regel voor gebruikers: "Instellingen › Over toont de versie van de meegeleverde FEM Studio; de toetsing volgt in een volgende versie."
- [ ] **Step 2:** Run `npm run check` op de achtergrond. Expected: alleen `check-rapport-pdf` zakt, op de twee bekende punten van main.
- [ ] **Step 3:** Run `cargo test … fem_studio -- --include-ignored`. Expected: alles groen.
- [ ] **Step 4:** Commit, push de tak en open een PR naar main. De PR neemt het ontwerpvoorstel mee.
