/**
 * De rekendienst zonder venster: de ingang. scripts/bouw-rekendienst.mjs bundelt dit
 * bestand met esbuild tot packages/headless/dist/rekendienst.mjs, met de rekenkern, de
 * tools van de app en de vertalingen erin. Zie docs/rekendienst.md.
 *
 *   node packages/headless/dist/rekendienst.mjs            HTTP (REST en MCP)
 *   node packages/headless/dist/rekendienst.mjs --stdio    MCP over stdin en stdout
 *
 * Instellingen uit de omgeving:
 *   REKENDIENST_TOKEN          API-sleutels, gescheiden door komma's (verplicht voor HTTP)
 *   REKENDIENST_TOKEN_BESTAND  of: een bestand met de sleutels, één per regel
 *   REKENDIENST_ADRES          standaard 127.0.0.1 (in het image 0.0.0.0)
 *   REKENDIENST_POORT          standaard 8080
 *   REKENDIENST_MAX_MB         grootste verzoek in MiB, standaard 10
 *   REKENDIENST_MAX_GELIJK     gelijktijdige verzoeken, standaard 4
 *   REKENDIENST_TIJD_S         time-out per verzoek in seconden, standaard 120
 *   REKENDIENST_TAAL           taal van de uitvoer en van een nieuw rapport, standaard en
 *   REKENDIENST_FEM_SERVER     de server van Open FEM Studio; standaard OCSS_FEM_SERVER of
 *                              packages/desktop/src-tauri/fem-studio/openaec-mcp-server
 *   REKENDIENST_CHROMIUM       Chromium of Chrome voor het rapport; standaard gezocht
 *   REKENDIENST_PAGINAS        de gebouwde pagina's (vite --mode rekendienst); standaard
 *                              packages/desktop/dist-rekendienst
 *   REKENDIENST_CHROMIUM_ZONDER_SANDBOX=1  Chromium zonder zijn sandbox (in een container
 *                              zonder user namespaces); de pagina haalt dan nog steeds
 *                              niets van buiten
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import i18next from "i18next";
import { NAMESPACES, RESOURCES } from "../../desktop/src/i18n/bundels.ts";
import { BRONTAAL } from "../../desktop/src/i18n/talen.ts";
import { templates } from "../../desktop/src/templates/index.ts";
import { moduleNaam, groepNaam } from "../../desktop/src/components/calc/moduleNaam.ts";
import { maakGeheugenProject } from "../../desktop/src/mcp/dienst/geheugen.ts";
import { dienstTools } from "../../desktop/src/mcp/dienst/tools.ts";
import { verwerkMcpBericht } from "../../desktop/src/mcp/dispatcher.ts";
import { verwerkRest } from "../../desktop/src/mcp/rest.ts";
import { version } from "../../desktop/package.json";
import { maakFem } from "./fem.mjs";
import { maakRapportPdf } from "./pdf.mjs";
import { maakDienst } from "./server.mjs";

const NAAM = "open-calcsheet-studio-api";
const env = process.env;
const args = process.argv.slice(2);
const arg = (naam) => {
  const i = args.indexOf(naam);
  return i >= 0 ? args[i + 1] : undefined;
};
const getal = (w, standaard) => {
  const n = Number(w);
  return w !== undefined && w !== "" && Number.isFinite(n) && n > 0 ? n : standaard;
};
// Naast de bundel (packages/headless/dist) of in het image (/opt/…/dist): de repo twee hoger.
const hier = dirname(fileURLToPath(import.meta.url));
const repo = resolve(hier, "../../..");

function sleutels() {
  const uit = (env.REKENDIENST_TOKEN ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (env.REKENDIENST_TOKEN_BESTAND) {
    uit.push(...readFileSync(env.REKENDIENST_TOKEN_BESTAND, "utf8").split(/\r?\n/).map((s) => s.trim()).filter(Boolean));
  }
  for (const s of uit) if (s.length < 16) throw new Error("Een API-sleutel heeft minstens 16 tekens.");
  return uit;
}

const stdio = args.includes("--stdio");
// Over stdio is stdout van MCP alleen: elke andere melding gaat naar stderr.
if (stdio) for (const soort of ["log", "info", "warn", "debug"]) console[soort] = (...x) => console.error(...x);
const log = (tekst) => process.stderr.write(`[rekendienst] ${tekst}\n`);
const taal = env.REKENDIENST_TAAL || "en";

await i18next.init({
  resources: RESOURCES,
  ns: NAMESPACES,
  lng: taal,
  defaultNS: "common",
  fallbackLng: BRONTAAL,
  interpolation: { escapeValue: false },
  showSupportNotice: false,
});

const femPad = [env.REKENDIENST_FEM_SERVER, env.OCSS_FEM_SERVER, join(repo, "packages/desktop/src-tauri/fem-studio", process.platform === "win32" ? "openaec-mcp-server.exe" : "openaec-mcp-server")]
  .find((p) => p && existsSync(p));
const fem = maakFem(femPad, version);
const pdf = maakRapportPdf({
  chromium: env.REKENDIENST_CHROMIUM || undefined,
  paginas: env.REKENDIENST_PAGINAS || join(repo, "packages/desktop/dist-rekendienst"),
  taal,
  zonderSandbox: env.REKENDIENST_CHROMIUM_ZONDER_SANDBOX === "1",
  tijdMs: getal(env.REKENDIENST_TIJD_S, 120) * 1000 - 5000,
});

// FEM Studio en Chromium één verzoek tegelijk: de antwoorden van FEM Studio zijn er één keer per proces.
let rij = Promise.resolve();
const inRij = (f) => {
  const run = rij.then(f);
  rij = run.catch(() => {});
  return run;
};

const nieuwProject = () => maakGeheugenProject({ sjablonen: templates, moduleNaam, groepNaam, taal });

const dienst = maakDienst({
  tools: ({ projectVan, nieuwProject: maak }) =>
    dienstTools({
      projectVan,
      nieuwProject: maak,
      taal,
      fem: () => fem,
      inRij,
      ...(pdf ? { rapportPdf: (inhoud, naam) => pdf.maak(inhoud, naam) } : {}),
    }),
  nieuwProject,
  verwerkMcpBericht,
  verwerkRest,
  serverInfo: { name: NAAM, version },
  openapiOpties: (req) => ({
    titel: "Open CalcSheet Studio calculation service",
    beschrijving:
      "Headless calculation service: the REST API of the desktop app (the same routes and schemas, /api/v1 or /v1) and MCP (POST /mcp), without a window. " +
      "Every route except /v1/health and this document needs 'Authorization: Bearer <key>'; requests with an Origin header are refused. Each route runs the MCP tool named in x-mcp-tool. " +
      "Without an Mcp-Session-Id header a REST request works on a new, empty project; pass the content of a project to project_evaluate or report_pdf.",
    servers: [{ url: `http://${req.headers.host ?? "127.0.0.1"}` }],
    paden: {
      "/v1/health": {
        get: {
          operationId: "health",
          summary: "Whether the service runs, with its version and whether FEM Studio and the PDF report are available. Readable without a key.",
          tags: ["tools"],
          security: [],
          responses: { "200": { description: "Healthy.", content: { "application/json": { schema: { type: "object" } } } } },
        },
      },
    },
  }),
  gezondheid: async () => ({
    fem: fem ? "available" : "not_included",
    pdf: pdf ? "available" : "not_available",
  }),
  sleutels: stdio ? [] : sleutels(),
  maxBytes: getal(env.REKENDIENST_MAX_MB, 10) * 1024 * 1024,
  maxGelijk: getal(env.REKENDIENST_MAX_GELIJK, 4),
  tijdMs: getal(env.REKENDIENST_TIJD_S, 120) * 1000,
  log,
});

const stop = () => {
  fem?.stop();
  pdf?.stop();
};
process.on("SIGTERM", () => {
  stop();
  process.exit(0);
});
process.on("SIGINT", () => {
  stop();
  process.exit(0);
});

if (stdio) {
  log(`MCP over stdio, ${dienst.tools.length} tools; FEM Studio ${fem ? "aanwezig" : "niet meegeleverd"}, PDF ${pdf ? "aanwezig" : "niet beschikbaar"}`);
  await dienst.stdio();
  stop();
} else {
  const adres = arg("--adres") ?? env.REKENDIENST_ADRES ?? "127.0.0.1";
  const poort = getal(arg("--poort") ?? env.REKENDIENST_POORT, 8080);
  const server = await dienst.luister(adres, arg("--poort") === "0" ? 0 : poort);
  const echt = server.address().port;
  // Deze regel leest de controle (scripts/check-rekendienst.mjs) om de poort te vinden.
  log(`luistert op http://${adres}:${echt} (${NAAM} ${version}, ${dienst.tools.length} tools; FEM Studio ${fem ? femPad : "niet meegeleverd"}; PDF ${pdf ? pdf.chromium : "niet beschikbaar"})`);
}
