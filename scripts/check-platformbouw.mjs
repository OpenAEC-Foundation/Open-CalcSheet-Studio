/**
 * De platformbouw voor de werkplek van de OpenAEC SuperCloud (docs/supercloud-werkplek.md).
 *
 * Bouwt de bundel zoals de SuperCloud dat doet (`vite build --mode platform --base ./`)
 * in een tijdelijke map en controleert dan:
 *
 *   1. index.html: geen inline <script> en geen inline event-handlers; alle paden relatief;
 *   2. geen absoluut pad (`/assets/…`) in de bundel;
 *   3. geen adres van een dienst buiten de bundel (kaarttegels, Nominatim, Overpass,
 *      GitHub, een CDN, analytics, feedback), behalve de bewust afgevangen gevallen
 *      hieronder (UITZONDERINGEN), elk met de reden;
 *   4. geen laadopdracht naar een absoluut adres (fetch, import, Worker, url(…));
 *   5. geen localStorage, sessionStorage of IndexedDB; geen window.open buiten de
 *      afgevangen gevallen;
 *   6. mcp-tools.json en de Library staan naast de bundel;
 *   7. de proef: de bundel in headless Chrome of Edge, in een frame met
 *      sandbox="allow-scripts allow-modals" en de CSP van de werkplek, met een
 *      nagebootste openaecHost (scripts/lib/werkplek-proef.mjs). De app moet starten
 *      zonder fouten in de console, het startbestand openen, opslaan als nieuwe versie,
 *      opslaan als nieuw bestand en openen uit de lijst, alles via de host. Zonder
 *      Chrome of Edge op de machine valt alleen dit deel weg.
 *
 * Draaien:  node scripts/check-platformbouw.mjs [--bundel map]
 *   --bundel  een bestaande platformbouw controleren in plaats van zelf te bouwen.
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { draaiProef } from "./lib/werkplek-proef.mjs";

const hier = dirname(fileURLToPath(import.meta.url));
const REPO = join(hier, "..");
const DESKTOP = join(REPO, "packages/desktop");
const BROWSERS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

/** Diensten buiten de bundel: deze adressen horen niet in de platformbouw. */
const DIENSTEN = [
  "tile.openstreetmap.org",
  "nominatim.openstreetmap.org",
  "overpass-api.de",
  "raw.githubusercontent.com",
  "unpkg.com",
  "cdn.jsdelivr.net",
  "cdnjs.cloudflare.com",
  "fonts.googleapis.com",
  "fonts.gstatic.com",
  "open-feedback-studio",
  "open-aec.com/shared/analytics",
  "openaec-analytics-loader",
  "api.github.com",
];

/**
 * Bewust afgevangen: code van een bibliotheek die in de app niet aangeroepen wordt,
 * of die in de werkplek een melding geeft. Per bestand (begin van de naam) hoe vaak.
 */
const UITZONDERINGEN = [
  {
    wat: "unpkg.com",
    bestand: "ifcxWeergave-",
    aantal: 1,
    reden: "de Fragments-worker van de 3D-bibliotheek; de app laadt geen Fragments (ifcxWeergave.ts leest IFCX zelf)",
  },
  {
    wat: "raw.githubusercontent.com/buildingSMART",
    bestand: "ifcxWeergave-",
    aantal: 1,
    reden: "het BCF-schema van de 3D-bibliotheek; de app gebruikt geen BCF",
  },
  {
    wat: "window.open(",
    bestand: "SpreadsheetEditor-",
    aantal: 3,
    reden: "een link in een spreadsheetcel; in de werkplek vervangt zetPopupOmweg (src/werkplek/werkplek.ts) window.open door een melding",
  },
  {
    wat: "window.open(",
    bestand: "chunk-",
    aantal: 1,
    reden: "idem, het gedeelde deel van de spreadsheetbibliotheek",
  },
];

let fouten = 0;
function meld(ok, tekst, detail) {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}${ok || !detail ? "" : `   (${detail})`}`);
  if (!ok) fouten++;
}

const bundelIndex = process.argv.indexOf("--bundel");
const eigenBundel = bundelIndex > 0 ? resolve(process.argv[bundelIndex + 1]) : null;
const tijdelijk = eigenBundel ? null : mkdtempSync(join(tmpdir(), "platformbouw-"));
const bundel = eigenBundel ?? join(tijdelijk, "dist-platform");

try {
  if (!eigenBundel) {
    console.log("Bouwen (vite build --mode platform --base ./)");
    // Zonder VITE_*-variabelen uit de omgeving, zoals de bouw van de SuperCloud.
    const omgeving = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith("VITE_")));
    const r = spawnSync(process.execPath, [join(REPO, "node_modules/vite/bin/vite.js"), "build", "--mode", "platform", "--base", "./", "--outDir", bundel, "--emptyOutDir", "--logLevel", "error"], {
      cwd: DESKTOP,
      env: omgeving,
      encoding: "utf8",
      timeout: 600000,
    });
    if (r.status !== 0) throw new Error(`de platformbouw mislukte:\n${r.stdout}\n${r.stderr}`);
  }
  controleerBundel(bundel);

  console.log("\nDe proef in een afgeschermd frame");
  const browser = BROWSERS.find((p) => existsSync(p));
  if (!browser) {
    console.log("  Geen Chrome of Edge gevonden: de proef is overgeslagen.");
  } else {
    const startbestand = await maakStartbestand();
    await draaiProef({ browser, bundel, startbestand, meld });
  }
} catch (e) {
  console.error(e?.stack ?? e);
  fouten++;
} finally {
  if (tijdelijk) rmSync(tijdelijk, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

console.log(fouten === 0 ? "\nAlles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);

// ── De bundel ─────────────────────────────────────────────────────────────────

function bestanden(map) {
  return readdirSync(map).flatMap((naam) => {
    const pad = join(map, naam);
    return statSync(pad).isDirectory() ? bestanden(pad) : [pad];
  });
}

function controleerBundel(map) {
  console.log("\nindex.html");
  const html = readFileSync(join(map, "index.html"), "utf8");
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  const inline = scripts.filter((s) => !/\bsrc=/.test(s[1]) || s[2].trim() !== "");
  meld(scripts.length > 0 && inline.length === 0, `geen inline <script> (${scripts.length} script(s), alle met src)`, inline.map((s) => s[0].slice(0, 80)).join(", "));
  const handlers = [...html.matchAll(/<[^>]+\son[a-z]+\s*=/gi)];
  meld(handlers.length === 0, "geen inline event-handlers (onclick=… e.d.)", handlers.map((h) => h[0].slice(0, 60)).join(", "));
  const paden = [...html.matchAll(/\b(?:src|href)="([^"#]+)"/g)].map((m) => m[1]);
  const absoluut = paden.filter((p) => !p.startsWith("./"));
  meld(paden.length > 0 && absoluut.length === 0, `alle paden relatief (${paden.length} paden)`, absoluut.join(", "));
  meld(!/<base\b/i.test(html), "geen <base>");

  console.log("\nDe bundel");
  const alle = bestanden(map);
  const tekst = alle.filter((p) => /\.(m?js|css|html|json)$/.test(p) && !p.includes(`${join(map, "library")}`));
  const inhoud = new Map(tekst.map((p) => [p, readFileSync(p, "utf8")]));
  const naam = (p) => relative(map, p).replace(/\\/g, "/");
  const kort = (p) => naam(p).split("/").pop();
  meld(alle.some((p) => naam(p) === "mcp-tools.json"), "mcp-tools.json staat naast de bundel");
  meld(alle.some((p) => naam(p) === "library/index.json"), "de Library zit in de bundel (library/index.json)");

  const absolutePaden = [];
  for (const [p, t] of inhoud) {
    for (const m of t.matchAll(/["'(`]\/(assets|icons)\//g)) absolutePaden.push(`${naam(p)}: ${t.slice(m.index, m.index + 40)}`);
  }
  meld(absolutePaden.length === 0, "geen absoluut pad naar de eigen bundel", absolutePaden.slice(0, 5).join("; "));

  // Tel per bestand hoe vaak iets voorkomt dat niet mag; trek de uitzonderingen af.
  const telling = (zoek) => {
    const rest = [];
    for (const [p, t] of inhoud) {
      const n = t.split(zoek).length - 1;
      if (n === 0) continue;
      const toegestaan = UITZONDERINGEN.filter((u) => zoek.startsWith(u.wat) || u.wat.startsWith(zoek))
        .filter((u) => kort(p).startsWith(u.bestand) && t.split(u.wat).length - 1 === u.aantal)
        .reduce((s, u) => s + u.aantal, 0);
      if (n > toegestaan) rest.push(`${naam(p)}: ${n}×`);
    }
    return rest;
  };
  for (const dienst of DIENSTEN) {
    const rest = telling(dienst);
    meld(rest.length === 0, `geen ${dienst}`, rest.join(", "));
  }
  const laden = [];
  const LADEN = [
    /\bfetch\(\s*["'`]https?:/g,
    /\bimport\(\s*["'`]https?:/g,
    /\bnew (?:Shared)?Worker\(\s*["'`]https?:/g,
    /\bimportScripts\(\s*["'`]https?:/g,
    /url\(\s*["']?https?:/g,
    /<(?:script|link|img|iframe)\b[^>]*\b(?:src|href)=["']?https?:/g,
  ];
  for (const [p, t] of inhoud) {
    for (const re of LADEN) for (const m of t.matchAll(re)) laden.push(`${naam(p)}: ${t.slice(m.index, m.index + 60)}`);
  }
  meld(laden.length === 0, "geen laadopdracht naar een absoluut adres (fetch, import, Worker, url(), src)", laden.slice(0, 5).join("; "));

  for (const opslag of ["localStorage", "sessionStorage", "indexedDB"]) {
    const rest = telling(opslag);
    meld(rest.length === 0, `geen ${opslag}`, rest.join(", "));
  }
  const popups = telling("window.open(");
  meld(popups.length === 0, "geen window.open buiten de afgevangen gevallen", popups.join(", "));
  for (const u of UITZONDERINGEN) {
    const p = [...inhoud.keys()].find((x) => kort(x).startsWith(u.bestand) && inhoud.get(x).includes(u.wat));
    if (p) console.log(`     afgevangen: ${u.wat} in ${kort(p)} — ${u.reden}`);
  }
}

// ── Het startbestand ──────────────────────────────────────────────────────────

/** Een klein project: een rekenblad, een balklaag en een notitie. */
async function maakStartbestand() {
  const { bouwProjectBestand, PROJECT_FORMAAT_VERSIE } = await import("../packages/desktop/src/store/projectBestand.ts");
  const { bladenVoorIfc } = await import("../packages/desktop/src/store/projectIfcx.ts");
  const { legeGegevens } = await import("../packages/desktop/src/store/projectGegevens.ts");
  const { standaardRapport } = await import("../packages/desktop/src/rapport/model.ts");
  const { standaardTeksten } = await import("../packages/desktop/src/rapport/standaardteksten.ts");
  const { balklaag } = await import("../packages/desktop/src/templates/balklaag.ts");
  const gegevens = { ...legeGegevens(), project_naam: "Werkplekproef" };
  const exemplaren = [
    {
      id: "wp-rekenblad", naam: "Kolom K1", templateId: "", waarden: {}, elementen: [],
      source: "\"Kolom K1\nF = ?{120}*(kN)\nA = 6000*mm^2\nfy = 235*N/mm^2\nN_Rd = A*fy\nUC = F/N_Rd\n",
    },
    { id: "wp-balklaag", naam: "Balklaag", templateId: "balklaag", source: balklaag, waarden: {}, elementen: [] },
    { id: "wp-notitie", naam: "Uitgangspunten", templateId: "markdown", source: "", waarden: {}, elementen: [], md: { bestandsnaam: "", tekst: "# Uitgangspunten\n\nEen notitie." } },
  ];
  const project = {
    versie: PROJECT_FORMAAT_VERSIE,
    naam: "Werkplekproef",
    gegevens,
    exemplaren,
    rapport: standaardRapport("25-11-2026", standaardTeksten("nl"), "nl"),
  };
  return Buffer.from(bouwProjectBestand(project, bladenVoorIfc(project)), "utf8");
}
