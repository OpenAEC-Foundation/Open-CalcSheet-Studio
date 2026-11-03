/**
 * De beelden van de README (docs/images/readme/), uit de echte app. Het project is
 * verzonnen en staat hieronder, dus elk beeld is opnieuw te maken.
 *
 * Bouwen, met een eigen identifier: de opgeslagen appstaat hangt daaraan, en dit script
 * opent een project. Zonder eigen identifier overschrijft het de staat van de gebruiker.
 *   npm run tauri build --workspace=@openaec/calcsheet-studio -- --no-bundle
 *     -c "{\"identifier\":\"studio.openstructuralcalculation.proef\"}"
 *
 * Draaien:  node scripts/maak-readme-beelden.mjs <pad-naar-exe> [naam van een beeld …]
 *
 * Een beeld boven de 150 kB gaat terug naar 256 kleuren zonder dithering; dat houdt
 * tekst scherp. Daarvoor is Python met Pillow nodig. scripts/check-readme.mjs
 * controleert de uitkomst.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strToU8 } from "fflate";
import { DOMParser, Node } from "./lib/mini-dom.mjs";

globalThis.DOMParser = DOMParser;
globalThis.Node = Node;

const { bouwProjectBestand, PROJECT_FORMAAT_VERSIE } = await import("../packages/desktop/src/store/projectBestand.ts");
const { bladenVoorIfc } = await import("../packages/desktop/src/store/projectIfcx.ts");
const { legeGegevens } = await import("../packages/desktop/src/store/projectGegevens.ts");
const { standaardRapport } = await import("../packages/desktop/src/rapport/model.ts");
const { standaardTeksten } = await import("../packages/desktop/src/rapport/standaardteksten.ts");
const { balklaag } = await import("../packages/desktop/src/templates/balklaag.ts");
const { ligger } = await import("../packages/desktop/src/templates/ligger.ts");
const { tweepaalspoer } = await import("../packages/desktop/src/templates/tweepaalspoer.ts");
const { CANVAS_BLAD, schrijfEenheden } = await import("../packages/desktop/src/store/canvasBlad.ts");
const { GRAAF_BLAD } = await import("../packages/desktop/src/store/graafBlad.ts");
const { TEKEN_BLAD } = await import("../packages/desktop/src/store/tekenBlad.ts");
const { JUPYTER_BLAD, pakWerkmapIn } = await import("../packages/desktop/src/store/jupyterBlad.ts");
const { voorbeeldGraaf } = await import("../packages/desktop/src/graaf/voorbeeldGraaf.ts");
const V = await import("../packages/desktop/src/components/tekenen/vel.ts");
const Y = await import("../packages/desktop/src/components/tekenen/symbolen.ts");
const M = await import("../packages/desktop/src/components/tekenen/model.ts");
const { maakWerkmap } = await import("./lib/gemengd-project.mjs");
const { NOTEBOOK_KLAAR, startApp } = await import("./lib/jupyter-venster.mjs");

const [exe, ...alleen] = process.argv.slice(2);
if (!exe) {
  console.error("Gebruik: node scripts/maak-readme-beelden.mjs <pad-naar-exe> [naam van een beeld …]");
  process.exit(2);
}

const UIT = fileURLToPath(new URL("../docs/images/readme/", import.meta.url));
const LIBRARY = fileURLToPath(new URL("../library/", import.meta.url));
const MAX_BYTES = 150 * 1024;
const IDENTIFIER = "studio.openstructuralcalculation.proef";
const BREEDTE = 1440;
const HOOGTE = 900;

// ─── Het project ────────────────────────────────────────────────────

const stijl = { ...M.STANDAARD_STIJL, lijn: "#000000", dikte: 1 };
const inModel = (o = {}) => ({ schaal: String(V.MODEL_SCHAAL), ...o });

function maakVel() {
  const raster = V.stramienRaster({ x: [5400, 5400, 7200], y: [6000, 6000], x0: 0, y0: 0, uitloop: 1500, maatvoering: true }, stijl);
  const wand = (x1, y1, x2, y2) => Y.nieuwSymbool("wand", { x1, y1, x2, y2 }, stijl, inModel({ materiaal: "metselwerk", dikteMm: "214" }));
  const vloer = (x, y, w, h) => Y.nieuwSymbool("kanaalplaat", { x, y, w, h }, stijl, inModel({ hoogteMm: "200", richting: "x" }));
  return {
    formaat: "A3",
    ligging: "liggend",
    views: [
      {
        id: "v1", titel: "Floor plan, level 1", x: 20, y: 22, breedte: 250, hoogte: 215, schaal: 100, x0: -3500, y0: -3500,
        elementen: [
          vloer(0, 0, 5400, 6000), vloer(5400, 0, 5400, 6000), vloer(10800, 0, 7200, 6000),
          wand(0, 0, 18000, 0), wand(0, 12000, 18000, 12000), wand(0, 0, 0, 12000), wand(18000, 0, 18000, 12000),
          ...raster,
        ],
      },
      {
        id: "v2", titel: "Section A-A", x: 285, y: 22, breedte: 118, hoogte: 110, schaal: 50, x0: -600, y0: -2600,
        elementen: [
          Y.nieuwSymbool("kanaalplaatdoorsnede", { x1: 0, y1: 0, x2: 4800, y2: 0 }, stijl, inModel({ hoogteMm: "200" })),
          Y.nieuwSymbool("niveau", { x1: -300, y1: 0, x2: 5100, y2: 0 }, stijl, { tekst: "+3000" }),
          Y.nieuwSymbool("niveau", { x1: -300, y1: 3000, x2: 5100, y2: 3000 }, stijl, { tekst: "0" }),
        ],
      },
    ],
  };
}

const notebook = {
  cells: [
    { cell_type: "markdown", id: "c0", metadata: {}, source: ["# Quantities\n", "Beam moments from a script next to this notebook, and a table from a data file."] },
    {
      cell_type: "code", id: "c1", metadata: {}, execution_count: null, outputs: [],
      source: ["import numpy as np\n", "import matplotlib.pyplot as plt\n", "from helper import moment\n", "L = 6.0\n", "x = np.linspace(0, L, 61)\n", "plt.figure(figsize=(6, 2.4))\n", "plt.plot(x, moment(5.0, L, x))\n", "plt.gca().invert_yaxis()\n", "plt.xlabel('x (m)')\n", "plt.ylabel('M (kNm)')\n", "plt.show()\n"],
    },
    {
      cell_type: "code", id: "c2", metadata: {}, execution_count: null, outputs: [],
      source: ["import pandas as pd\n", "df = pd.read_csv('data/beams.csv')\n", "df['M_max'] = df.q * df.L**2 / 8\n", "df\n"],
    },
  ],
  metadata: { kernelspec: { display_name: "Python (Pyodide)", language: "python", name: "python" } },
  nbformat: 4,
  nbformat_minor: 5,
};

const MARKDOWN = `# Design basis

The building has three bays on a grid of 5.4 m, 5.4 m and 7.2 m. Floors are hollow-core
slabs on masonry walls.

## Loads

| Load | Value |
|---|---|
| Permanent, floor finish | 1.5 kN/m² |
| Variable, category B | 2.5 kN/m² |
| Partition walls | 1.2 kN/m² |

## Starting points

- Consequence class CC2, design life 50 years.
- Wind area 2, terrain category 3.
- Foundation on driven piles, two piles per column.
`;

/** Waar het hoofdstuk over de toetsing staat, voor het beeld met code en uitvoer. */
const TOETS_REGEL = balklaag.split("\n").findIndex((r) => /^# 8\./.test(r)) + 1;

const NAAM = {
  vloer: "Timber floor, level 1",
  ligger: "Roof edge beam",
  poer: "Pile cap P1",
  kolom: "Column C1",
  canvas: "Beam on a canvas",
  werkmap: "Bar schedule",
  graaf: "Portal frame graph",
  teken: "Floor plan",
  jupyter: "Quantities notebook",
  md: "Design basis",
};

async function bouwProject() {
  const kale = { source: "", waarden: {}, elementen: [] };
  const exemplaren = [
    { id: "ex-md", naam: NAAM.md, ...kale, templateId: "markdown", md: { bestandsnaam: "design-basis.md", tekst: MARKDOWN } },
    { id: "ex-vloer", naam: NAAM.vloer, templateId: "balklaag", source: balklaag, waarden: {}, elementen: [] },
    { id: "ex-ligger", naam: NAAM.ligger, templateId: "ligger", source: ligger, waarden: {}, elementen: [] },
    { id: "ex-poer", naam: NAAM.poer, templateId: "tweepaalspoer", source: tweepaalspoer, waarden: {}, elementen: [] },
    {
      id: "ex-kolom", naam: NAAM.kolom, templateId: "", waarden: {}, elementen: [],
      source: "\"Column C1\n'Axial force in a steel column, written by hand\nN_Ed = 900 kN\nA = 7810 mm^2\nf_y = 235 N/mm^2\nN_Rd = A*f_y to kN\nUC = N_Ed/N_Rd\n",
    },
    {
      id: "ex-canvas", naam: NAAM.canvas, templateId: CANVAS_BLAD, waarden: {}, elementen: [],
      source: schrijfEenheden([
        { id: "e1", x: 10, y: 12, tekst: "'Beam on two supports" },
        { id: "e2", x: 10, y: 34, tekst: "L = 6 m\nq = 8 kN/m" },
        { id: "e3", x: 78, y: 34, tekst: "M_Ed = q*L^2/8 to kN*m" },
        { id: "e4", x: 10, y: 80, tekst: "W_y = 628 cm^3\nf_y = 235 N/mm^2" },
        { id: "e5", x: 78, y: 80, tekst: "M_Rd = W_y*f_y to kN*m\nUC = M_Ed/M_Rd" },
      ]),
    },
    { id: "ex-werkmap", naam: NAAM.werkmap, ...kale, templateId: "spreadsheet", xlsx: { bestandsnaam: "bar-schedule.xlsx", data: await maakWerkmap(24, "Bar") } },
    {
      id: "ex-graaf", naam: NAAM.graaf, ...kale, templateId: GRAAF_BLAD,
      graaf: voorbeeldGraaf({
        aantalVelden: "Number of bays", hartOpHart: "Centre-to-centre", hoogte: "Height", lijnlast: "Line load", moment: "Span moment",
        kolomstramien: "Column grid", aantalKolommen: "Number of columns", kolommen: "Columns", liggers: "Girders", fundering: "Foundation",
      }),
    },
    { id: "ex-teken", naam: NAAM.teken, ...kale, templateId: TEKEN_BLAD, tekenvel: maakVel() },
    {
      id: "ex-jupyter", naam: NAAM.jupyter, ...kale, templateId: JUPYTER_BLAD,
      jupyter: {
        bestandsnaam: "",
        metCode: true,
        data: Buffer.from(pakWerkmapIn([
          { pad: "notebook.ipynb", bytes: strToU8(JSON.stringify(notebook)) },
          { pad: "helper.py", bytes: strToU8("def moment(q, L, x):\n    return q * x * (L - x) / 2\n") },
          { pad: "data/beams.csv", bytes: strToU8("beam,q,L\nB1,5,6\nB2,8,7.2\nB3,12,5.4\n") },
        ])).toString("base64"),
      },
    },
  ];

  const rapport = standaardRapport("01-09-2026", standaardTeksten());
  rapport.kenmerk = "EX-2026-001";
  rapport.fase = "DD";
  rapport.verantwoordelijk = "A. Example, MSc";
  rapport.uitvoerend = "B. Example, BSc";
  rapport.teksten = { ...rapport.teksten, projectomschrijving: "{projectnaam} is a made-up project with every kind of sheet.", wijziging: "Timber floors on masonry walls." };
  rapport.bureau = { ...rapport.bureau, naam: "Example Engineers", plaats: "Exampleton" };

  const gegevens = {
    ...legeGegevens(),
    project_nummer: "2026-001", project_naam: "Example building", opdrachtgever: "Example client", constructeur: "A. Example, MSc",
    locatie: "Exampleton", CC: "2", RC: "2", DesignLife: "50", windgebied: "2", terreincategorie: "3",
  };
  const project = { versie: PROJECT_FORMAAT_VERSIE, naam: gegevens.project_naam, gegevens, exemplaren, rapport };
  return bouwProjectBestand(project, bladenVoorIfc(project));
}

// ─── De app ─────────────────────────────────────────────────────────

const WERK = mkdtempSync(join(tmpdir(), "ocss-readme-"));
const PROJECT = join(WERK, "example.ifccalculation");
writeFileSync(PROJECT, await bouwProject());
mkdirSync(UIT, { recursive: true });

// Een eigen poort voor de MCP-server: een draaiende app heeft de standaardpoort al, en dan
// staat er "port in use" in de statusbalk van elk beeld.
const VOORKEUREN = join(process.env.APPDATA ?? join(homedir(), ".config"), IDENTIFIER, "preferences.json");
mkdirSync(dirname(VOORKEUREN), { recursive: true });
const voorkeuren = existsSync(VOORKEUREN) ? JSON.parse(readFileSync(VOORKEUREN, "utf8")) : {};
writeFileSync(VOORKEUREN, JSON.stringify({ ...voorkeuren, mcpPoort: 3897 }));

const wacht = (ms) => new Promise((klaar) => setTimeout(klaar, ms));
const app = await startApp({ exe, map: join(WERK, "opslag"), poort: 9378, argumenten: [PROJECT] });
const s = app.sessie;
await s.stuur("Emulation.setDeviceMetricsOverride", { width: BREEDTE, height: HOOGTE, deviceScaleFactor: 1, mobile: false });

/** De Library uit de map op schijf, ook als hij nog niet op main staat. */
await s.stuur("Fetch.enable", { patterns: [{ urlPattern: "https://raw.githubusercontent.com/*/library/*" }] });
s.ws.addEventListener("message", (e) => {
  const b = JSON.parse(e.data);
  if (b.method !== "Fetch.requestPaused") return;
  const pad = new URL(b.params.request.url).pathname.split("/library/")[1];
  const bestand = join(LIBRARY, pad);
  const body = existsSync(bestand) ? readFileSync(bestand).toString("base64") : "";
  s.stuur("Fetch.fulfillRequest", {
    requestId: b.params.requestId,
    responseCode: body ? 200 : 404,
    responseHeaders: [{ name: "Access-Control-Allow-Origin", value: "*" }],
    body,
  }).catch(() => {});
});

const klik = (js) => s.voerUit(`(() => { const e = ${js}; if (!e) throw new Error(${JSON.stringify(`niet gevonden: ${js}`)}); e.click(); })()`);
const metTekst = (selector, re) => `[...document.querySelectorAll(${JSON.stringify(selector)})].find((e) => ${re}.test(e.textContent.trim()))`;
const kiesBlad = async (naam) => {
  await klik(`[...document.querySelectorAll('.pb-naam')].find((e) => e.textContent.includes(${JSON.stringify(naam)})).closest('button')`);
  await wacht(900);
};
const lint = async (re) => { await klik(metTekst(".ribbon-tab", re)); await wacht(500); };
const weergave = async (re) => { await klik(metTekst(".split-tab", re)); await wacht(1200); };
/** Zet een waarde zoals de gebruiker dat doet: de app hoort het aan de gebeurtenissen. */
const ZET = `(el, v) => {
  const soort = el.tagName === "SELECT" ? HTMLSelectElement : HTMLInputElement;
  Object.getOwnPropertyDescriptor(soort.prototype, "value").set.call(el, v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}`;
const kiesVloer = async () => {
  await s.voerUit(`(() => {
    const zet = ${ZET};
    const keuze = [...document.querySelectorAll("select")].find((e) => [...e.options].some((o) => o.textContent.trim() === "96×271"));
    zet(keuze, [...keuze.options].find((o) => o.textContent.trim() === "96×271").value);
  })()`);
  await wacht(1500);
  await s.voerUit(`(${ZET})(document.querySelector(".calc-input-value[data-prompt=L_d]"), "4200")`);
  await wacht(1500);
};

async function bewaar(naam) {
  const pad = join(UIT, `${naam}.png`);
  writeFileSync(pad, await s.foto());
  if (readFileSync(pad).length > MAX_BYTES) {
    const py = "import sys; from PIL import Image; p = sys.argv[1]; Image.open(p).convert('RGB').quantize(256, dither=Image.Dither.NONE).save(p, optimize=True)";
    const r = spawnSync("python", ["-c", py, pad], { encoding: "utf8" });
    if (r.status !== 0) throw new Error(`Verkleinen van ${naam} mislukt: ${r.stderr}`);
  }
  const kb = Math.round(readFileSync(pad).length / 1024);
  console.log(`  ${kb > 150 ? "✗" : "✓"} ${naam}.png  ${kb} kB`);
}

try {
  await s.wachtOp(() => s.voerUit(`[...document.querySelectorAll('.pb-naam')].some((e) => e.textContent.includes(${JSON.stringify(NAAM.vloer)})) ? 1 : 0`), { tekst: "de projectboom", ms: 60000 });
  await s.voerUit(`document.querySelector('.welkom-paneel button[aria-label]')?.click()`);
  // De eerste poging kan voor het onderscheppen zijn geweest.
  await wacht(800);
  await s.voerUit(`document.querySelector('.lib-opnieuw')?.click()`);
  await s.wachtOp(() => s.voerUit(`document.querySelectorAll('.lib-rij').length > 0 ? 1 : 0`), { tekst: "de Library", ms: 30000 });

  // Een beeld vult zijn beginwaarden pas in als zijn blad actief is.
  for (const naam of [NAAM.vloer, NAAM.ligger, NAAM.poer]) await kiesBlad(naam);

  const BEELDEN = {
    hero: async () => {
      await kiesBlad(NAAM.vloer);
      await weergave(/^Visual [+] output$/);
      await kiesVloer();
    },
    "code-output": async () => {
      await kiesBlad(NAAM.vloer);
      await weergave(/^Code [+] output$/);
      await s.voerUit(`(() => {
        const regel = document.querySelector(".cm-line")?.getBoundingClientRect().height ?? 18;
        document.querySelector(".cm-scroller").scrollTop = (${TOETS_REGEL} + 40) * regel;
        const kop = [...document.querySelectorAll("h1, h2, h3, h4")].find((e) => /^8\\./.test(e.textContent.trim()));
        if (!kop) throw new Error("hoofdstuk 8 niet gevonden");
        kop.scrollIntoView({ block: "start" });
      })()`);
      await wacht(1200);
    },
    "two-pile-cap": async () => {
      await kiesBlad(NAAM.poer);
      await weergave(/^Visual [+] output$/);
    },
    report: async () => {
      await klik(`[...document.querySelectorAll('.pb-naam')].find((e) => /^Report$/.test(e.textContent.trim())).closest('button')`);
      await wacht(700);
      await weergave(/Print preview/);
      await s.wachtOp(() => s.voerUit(`document.querySelectorAll('.av-vel').length > 3 ? 1 : 0`), { tekst: "het rapport", ms: 60000 });
      await s.voerUit(`(() => {
        const zoom = [...document.querySelectorAll("select")].find((e) => [...e.options].some((o) => /^50\\s*%$/.test(o.textContent.trim())));
        (${ZET})(zoom, [...zoom.options].find((o) => /^50\\s*%$/.test(o.textContent.trim())).value);
      })()`);
      await wacht(1500);
      // De inhoudsopgave in beeld, tussen het voorblad en het eerste hoofdstuk.
      await s.voerUit(`document.querySelectorAll('.av-vel')[1].scrollIntoView({ block: "center" })`);
      await wacht(1200);
    },
    spreadsheet: async () => {
      await kiesBlad(NAAM.werkmap);
      await wacht(2500);
    },
    canvas: async () => {
      await kiesBlad(NAAM.canvas);
      await wacht(1200);
    },
    graph: async () => {
      await kiesBlad(NAAM.graaf);
      await wacht(3000);
    },
    "drawing-sheet": async () => {
      await kiesBlad(NAAM.teken);
      await wacht(1500);
    },
    jupyter: async () => {
      await kiesBlad(NAAM.jupyter);
      const frame = await s.wachtOp(async () => {
        for (const [sessie, f] of s.frames) {
          if (f.type !== "iframe") continue;
          const herkomst = await s.voerUit("location.origin", sessie).catch(() => "");
          if (/^http:\/\/blad-.*\.localhost/.test(herkomst)) return sessie;
        }
        return null;
      }, { tekst: "de omgeving", ms: 120000 });
      await s.wachtOp(() => s.voerUit(NOTEBOOK_KLAAR, frame), { tekst: "de kernel", ms: 180000 });
      await s.voerUit(`window.jupyterapp.commands.execute('notebook:run-all-cells')`, frame);
      await s.wachtOp(() => s.voerUit(`document.querySelector('.jp-RenderedImage img') && document.querySelector('.jp-RenderedHTMLCommon table.dataframe') ? 1 : 0`, frame), { tekst: "de uitvoer", ms: 240000 });
      await s.voerUit(`document.querySelector('.jp-RenderedImage').scrollIntoView({ block: "center" })`, frame);
      await wacht(1000);
    },
    library: async () => {
      await kiesBlad(NAAM.kolom);
      await klik(`[...document.querySelectorAll('.lib-rij')].find((e) => /Buckling/.test(e.textContent))`);
      await s.wachtOp(() => s.voerUit(`document.querySelector('.lib-vak svg') ? 1 : 0`), { tekst: "het voorbeeld", ms: 15000 });
      await wacht(800);
    },
    "formula-library": async () => {
      await s.voerUit(`document.querySelector('.lib-vak-sluit')?.click()`);
      await klik(`document.querySelector('.lib-lijst .pb-toevoegen')`);
      await s.wachtOp(() => s.voerUit(`document.querySelectorAll('.fv-rij .fb').length > 100 ? 1 : 0`), { tekst: "het formulevenster", ms: 15000 });
      await wacht(600);
    },
    ifc: async () => {
      await s.voerUit(`document.querySelector('.formule-venster .settings-btn-secondary')?.click()`);
      await s.voerUit(`document.querySelector('.lib-vak-sluit')?.click()`);
      await kiesBlad(NAAM.vloer);
      await lint(/^IFC$/);
      await wacht(1500);
    },
  };

  if (alleen.includes("--lijst")) {
    console.log(JSON.stringify(await s.voerUit(`({ tabs: [...document.querySelectorAll('.split-tab')].map((e) => e.textContent), lint: [...document.querySelectorAll('.ribbon-tab')].map((e) => e.textContent), boom: [...document.querySelectorAll('.pb-naam')].map((e) => e.textContent) })`), null, 1));
  } else {
    for (const [naam, stap] of Object.entries(BEELDEN)) {
      if (alleen.length > 0 && !alleen.includes(naam)) continue;
      await stap();
      await bewaar(naam);
    }
  }
} finally {
  app.stop();
  await wacht(800);
  rmSync(WERK, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
}
