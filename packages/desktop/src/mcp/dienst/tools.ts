/**
 * De tools van de rekendienst zonder venster (packages/headless/, docs/rekendienst.md).
 *
 * Twee soorten, beide door dezelfde uitvoering als in de app (uitvoeren.ts), dezelfde
 * REST-routes (rest.ts) en dezelfde OpenAPI-specificatie (openapi.ts):
 *
 *   • GEDEELD: de tools uit de registry van de app (mcp/tools.ts) die zonder venster en
 *     zonder bestanden op paden zinnig zijn, ongewijzigd. Ze werken op het project van
 *     de sessie (een project in het geheugen, dienst/geheugen.ts).
 *   • ALLEEN IN DE DIENST: een project als inhoud laden en teruggeven, een project of een
 *     losse rekentekst in één verzoek doorrekenen (met de FEM-blokken), de includes en
 *     het rapport als PDF. Ze nemen geen pad van de server aan.
 *
 * Wat niet meegaat en waarom staat in NIET_GEDEELD; scripts/check-rekendienst.mjs
 * controleert dat elke tool van de app in een van beide lijsten staat.
 */
import { MCP_TOOLS } from "../tools.ts";
import { McpFout, type McpContext, type McpOmgeving, type McpToolDef } from "../contracts.ts";
import { rekentaalIncludes } from "../../templates/rekentaal-includes.ts";
import { LEZEN, NIEUW, alsTekst, fout, melding, objectSchema, ok, tekstOfGetal } from "../tools/hulp.ts";
import type { GeheugenProject } from "./geheugen.ts";
import { activeer, bladUitkomsten, rekenTekst, vraagFem, type FemVerbinding, type FemVerslag } from "./rekenen.ts";

/** De tools van de app die de dienst ongewijzigd aanbiedt. */
export const GEDEELD: readonly string[] = [
  "project_get", "project_new", "project_set_name", "project_set_data", "project_set_visibility",
  "report_get", "report_set", "undo", "redo",
  "modules_list", "sheets_list", "sheet_add", "sheet_add_pdf", "sheet_get", "sheet_set_source", "sheet_set_input",
  "sheet_set_pdf", "sheet_rename", "sheet_duplicate", "sheet_move", "sheet_remove", "sheet_select", "sheet_evaluate",
  "sheet_insert_formula", "calc_evaluate", "formulas_list", "formula_get", "ifc_get",
];

/** De tools van de app die de dienst niet aanbiedt, met de reden. */
export const NIET_GEDEELD: Readonly<Record<string, string>> = {
  app_info: "adressen op 127.0.0.1 van de desktop-app; de dienst heeft GET /v1/health en GET /api/v1",
  project_open: "een pad op de server; project_load neemt de inhoud",
  project_save: "schrijft een bestand; project_export geeft de inhoud",
  project_save_as: "schrijft een bestand; project_export geeft de inhoud",
  recent_files: "paden op de computer van de gebruiker",
  library_list: "de online modulebibliotheek (netwerk)",
  library_install: "de online modulebibliotheek (netwerk)",
  library_remove: "de online modulebibliotheek (netwerk)",
  export_ifc: "schrijft een bestand; ifc_get geeft de inhoud",
  export_pdf: "schrijft een bestand en vraagt de rapportengine; report_pdf geeft de PDF",
  report_export_pdf: "schrijft een bestand; report_pdf geeft de PDF",
  print: "de printdialoog",
  view_get: "de weergave van het venster",
  view_set: "de weergave van het venster",
  settings_get: "de instellingen van de desktop-app",
  settings_set: "de instellingen van de desktop-app",
};

/** Wat de tools van de dienst van de dienst zelf nodig hebben. */
export interface DienstDeps {
  /** Het project in het geheugen achter een omgeving (de sessie). */
  projectVan(omgeving: McpOmgeving): GeheugenProject;
  /** Een nieuw, leeg project, voor een verzoek dat zijn project als inhoud meegeeft. */
  nieuwProject(): GeheugenProject;
  /** De taal van de uitvoer. */
  taal: string;
  /** FEM Studio, als de dienst hem heeft. */
  fem(): FemVerbinding | null;
  /** Doet `f` als enige tegelijk: de antwoorden van FEM Studio zijn er één keer per proces. */
  inRij<T>(f: () => Promise<T>): Promise<T>;
  /** Het rapport van een projectbestand als PDF (headless Chromium); zonder: NOT_AVAILABLE. */
  rapportPdf?: (inhoud: string, naam: string) => Promise<{ pdf: Uint8Array; paginas: number }>;
}

const inhoudSchema = {
  type: "string",
  minLength: 1,
  description:
    "The project file as text: a .ifccalculation project (JSON or IFCX), or loose calculation text. Not a path: the service reads no files.",
} as const;

/** Het project van het verzoek: de meegegeven inhoud in een eigen project, of het project van de sessie. */
function projectUit(args: Record<string, unknown>, ctx: McpContext, deps: DienstDeps): GeheugenProject {
  if (typeof args.content !== "string") return deps.projectVan(ctx.omgeving);
  const p = deps.nieuwProject();
  try {
    p.laad(args.content, typeof args.fileName === "string" && args.fileName ? args.fileName.replace(/\.[^.]+$/, "") : "Project");
  } catch (e) {
    throw new McpFout("VALIDATION", `The project could not be read: ${melding(e)}`);
  }
  return p;
}

/** Invoer per blad: {bladId, kenmerk of naam: {veld: waarde}}; geeft de onbekende bladen. */
function zetInvoer(p: GeheugenProject, invoer: unknown): string[] {
  if (!invoer || typeof invoer !== "object") return [];
  const onbekend: string[] = [];
  for (const [sleutel, velden] of Object.entries(invoer as Record<string, unknown>)) {
    const blad = p.stand().exemplaren.find((e) => e.id === sleutel || e.ref === sleutel || e.naam === sleutel);
    if (!blad) {
      onbekend.push(sleutel);
      continue;
    }
    for (const [naam, w] of Object.entries((velden ?? {}) as Record<string, unknown>)) {
      const t = alsTekst(w);
      if (t !== null) p.omgeving.acties.zetWaarde(blad.id, naam, t);
    }
  }
  return onbekend;
}

function zetGegevens(p: GeheugenProject, gegevens: unknown): void {
  if (!gegevens || typeof gegevens !== "object") return;
  for (const [naam, w] of Object.entries(gegevens as Record<string, unknown>)) {
    const t = alsTekst(w);
    if (t !== null) p.omgeving.acties.zetGegeven(naam, t);
  }
}

const femJson = (v: FemVerslag) => ({
  available: v.beschikbaar,
  ...(v.versie ? { version: v.versie } : {}),
  requests: v.gevraagd,
  errors: v.fouten,
  ...(v.afgebroken ? { timedOut: true } : {}),
});

const invoerSchema = {
  type: "object",
  description: "Input values per sheet: {sheet id, ref or name: {field: value}}.",
  additionalProperties: { type: "object", additionalProperties: tekstOfGetal },
} as const;
const gegevensSchema = {
  type: "object",
  description: "Project data to set first: {name: value}, e.g. {\"CC\": \"CC3\"}.",
  additionalProperties: tekstOfGetal,
} as const;

function eigenTools(deps: DienstDeps): McpToolDef[] {
  return [
    {
      name: "project_load",
      kind: "mutate",
      description:
        "Load a project into this session from its content (the text of a .ifccalculation file, IFCX, or loose calculation text). Replaces the session's project; there is no file path on the service. " +
        "Returns the project name and its sheets.",
      inputSchema: objectSchema({ content: inhoudSchema, fileName: { type: "string", description: "Name of the file, for the project name of a loose sheet." } }, ["content"]),
      annotations: NIEUW,
      rest: [{ method: "POST", path: "/project/load" }],
      handler: (args, ctx) => {
        const p = deps.projectVan(ctx.omgeving);
        try {
          p.laad(String(args.content), typeof args.fileName === "string" && args.fileName ? args.fileName.replace(/\.[^.]+$/, "") : "Project");
        } catch (e) {
          return fout("VALIDATION", `The project could not be read: ${melding(e)}`);
        }
        const s = p.stand();
        return ok({
          projectName: s.projectNaam,
          sheets: s.exemplaren.map((e) => ({ id: e.id, ref: e.ref ?? null, name: e.naam, templateId: e.templateId })),
        });
      },
    },
    {
      name: "project_export",
      kind: "read",
      description: "The session's project as the content of a .ifccalculation file, with the results of every sheet in it (the same content as Save in the desktop app).",
      inputSchema: objectSchema({}),
      annotations: LEZEN,
      rest: [{ method: "GET", path: "/project/export" }],
      handler: (_args, ctx) => {
        const p = deps.projectVan(ctx.omgeving);
        activeer(p.stand());
        return ok({ fileName: `${p.stand().projectNaam || "project"}.ifccalculation`, content: p.inhoud() });
      },
    },
    {
      name: "project_evaluate",
      kind: "read",
      description:
        "Compute every sheet of a project with the same rules as the desktop app (project data, the loads of chapter 5 of the report, references between sheets and spreadsheet cells), and return per sheet: title, norm, governing UC, verdict, every UC value and the numbers (name → value in the sheet's unit). " +
        "@toets, @fem and @kern blocks are sent to FEM Studio first when the service has it; otherwise a block without a recorded answer counts as not computed (fem.notComputed). " +
        "Pass content to compute a project without touching the session; values and projectData change only that computation.",
      inputSchema: objectSchema({
        content: inhoudSchema,
        fileName: { type: "string", description: "Name of the file." },
        values: invoerSchema,
        projectData: gegevensSchema,
        sheets: { type: "array", items: { type: "string" }, description: "Only these sheets (id, ref or name). Default: all." },
        names: { type: "array", items: { type: "string" }, description: "Only these numbers (variable names)." },
        numbers: { type: "boolean", description: "Include the numbers of each sheet. Default true." },
        fem: { type: "boolean", description: "Ask FEM Studio for the answers that are missing. Default true." },
      }),
      annotations: LEZEN,
      rest: [{ method: "POST", path: "/project/evaluate" }],
      handler: async (args, ctx) => {
        // Zonder inhoud rekent dit op een kopie van de sessie: lezen verandert het project niet.
        const bron = projectUit(args, ctx, deps);
        const p = typeof args.content === "string" ? bron : bron.kopie();
        zetGegevens(p, args.projectData);
        const onbekend = zetInvoer(p, args.values);
        if (onbekend.length) return fout("NOT_FOUND", `No sheet with id, ref or name ${onbekend.map((o) => `"${o}"`).join(", ")}.`);
        return deps.inRij(async () => {
          const verslag = await vraagFem(p, args.fem === false ? null : deps.fem());
          const sheets = bladUitkomsten(p, {
            bladen: Array.isArray(args.sheets) ? (args.sheets as string[]) : undefined,
            getallen: args.numbers !== false,
            namen: Array.isArray(args.names) ? (args.names as string[]) : undefined,
          });
          return ok({ projectName: p.stand().projectNaam, fem: femJson(verslag), sheets });
        });
      },
    },
    {
      name: "evaluate_sheet",
      kind: "read",
      description:
        "Compute one calculation text with its input values and return the outcome: title, norm, governing UC, verdict, the numbers by name (in the sheet's unit), every line (as calc_evaluate) and the worked-out calculation as HTML, as on paper. " +
        "The session's project data (CC, K_FI, windgebied, …) are variables unless useProjectData=false; projectData overrides them for this call. Does not change the project.",
      inputSchema: objectSchema(
        {
          source: { type: "string", description: "Calculation text (the content of a .cpd sheet)." },
          values: { type: "object", description: "Input values {name: value}.", additionalProperties: tekstOfGetal },
          projectData: gegevensSchema,
          useProjectData: { type: "boolean", description: "Make the project data available as variables. Default true." },
          names: { type: "array", items: { type: "string" }, description: "Only these numbers (variable names)." },
          html: { type: "boolean", description: "Include the worked-out calculation as HTML. Default true." },
          language: { type: "string", description: "Language of the HTML, e.g. 'nl' or 'en'. Default: the language of the service." },
          maxLines: { type: "integer", minimum: 1, maximum: 5000, description: "At most this many lines. Default 400." },
        },
        ["source"],
      ),
      annotations: LEZEN,
      rest: [{ method: "POST", path: "/evaluate/sheet" }],
      handler: (args, ctx) => {
        const waarden: Record<string, string> = {};
        for (const [k, w] of Object.entries((args.values ?? {}) as Record<string, unknown>)) {
          const t = alsTekst(w);
          if (t !== null) waarden[k] = t;
        }
        const p = deps.projectVan(ctx.omgeving);
        const gegevens = { ...p.stand().gegevens };
        for (const [k, w] of Object.entries((args.projectData ?? {}) as Record<string, unknown>)) {
          const t = alsTekst(w);
          if (t !== null) gegevens[k] = t;
        }
        activeer({ ...p.stand(), gegevens });
        try {
          return ok(rekenTekst(String(args.source), {
            waarden,
            gegevens: args.useProjectData === false ? null : gegevens,
            taal: typeof args.language === "string" && args.language ? args.language : deps.taal,
            html: args.html !== false,
            maxRegels: typeof args.maxLines === "number" ? args.maxLines : 400,
            namen: Array.isArray(args.names) ? (args.names as string[]) : undefined,
          }));
        } catch (e) {
          return fout("CALC_ERROR", `The text could not be computed: ${melding(e)}`);
        }
      },
    },
    {
      name: "list_includes",
      kind: "read",
      description: "The files a calculation text can include with #include name.cpd or @img(name.svg), built into the app and this service.",
      inputSchema: objectSchema({}),
      annotations: LEZEN,
      rest: [{ method: "GET", path: "/includes" }],
      handler: () =>
        ok({
          includes: [...rekentaalIncludes.keys()].map((naam) => ({
            name: naam,
            kind: /\.svg$/i.test(naam) ? "image" : "calculation",
            usage: /\.svg$/i.test(naam) ? `@img(${naam})` : `#include ${naam}`,
          })),
        }),
    },
    {
      name: "report_pdf",
      kind: "read",
      description:
        "The structural report of a project as PDF (cover, chapters, every sheet), made by headless Chromium from the same pages as Report (PDF) in the desktop app, returned as base64. " +
        "@toets, @fem and @kern blocks are sent to FEM Studio first when the service has it. Pass content for a project of its own; without it the session's project.",
      inputSchema: objectSchema({
        content: inhoudSchema,
        fileName: { type: "string", description: "Name of the file, for the PDF's file name." },
        values: invoerSchema,
        projectData: gegevensSchema,
        fem: { type: "boolean", description: "Ask FEM Studio for the answers that are missing. Default true." },
      }),
      annotations: LEZEN,
      rest: [{ method: "POST", path: "/report/pdf" }],
      handler: async (args, ctx) => {
        if (!deps.rapportPdf) return fout("NOT_AVAILABLE", "This service has no Chromium or no built report pages; it cannot make a PDF.");
        const bron = projectUit(args, ctx, deps);
        const p = typeof args.content === "string" ? bron : bron.kopie();
        zetGegevens(p, args.projectData);
        const onbekend = zetInvoer(p, args.values);
        if (onbekend.length) return fout("NOT_FOUND", `No sheet with id, ref or name ${onbekend.map((o) => `"${o}"`).join(", ")}.`);
        const maak = deps.rapportPdf;
        return deps.inRij(async () => {
          const verslag = await vraagFem(p, args.fem === false ? null : deps.fem());
          activeer(p.stand());
          const naam = p.stand().projectNaam || "rapport";
          const { pdf, paginas } = await maak(p.inhoud(), naam);
          return ok({
            fileName: `${naam}.pdf`,
            contentType: "application/pdf",
            bytes: pdf.length,
            pages: paginas,
            fem: femJson(verslag),
            base64: naarBase64(pdf),
          });
        });
      },
    },
  ];
}

function naarBase64(b: Uint8Array): string {
  let tekst = "";
  for (let i = 0; i < b.length; i += 0x8000) tekst += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(tekst);
}

/**
 * Alle tools van de dienst: de gedeelde uit de registry van de app, dan de eigen. Elke
 * tool zet eerst de stand van zijn project in de rekenkern (`activeer`).
 */
export function dienstTools(deps: DienstDeps): McpToolDef[] {
  const gedeeld = GEDEELD.map((naam) => {
    const t = MCP_TOOLS.find((x) => x.name === naam);
    if (!t) throw new Error(`Tool ${naam} is no longer in the registry of the app.`);
    return t;
  });
  return [...gedeeld, ...eigenTools(deps)].map((t) => ({
    ...t,
    handler: (args: Record<string, unknown>, ctx: McpContext) => {
      activeer(deps.projectVan(ctx.omgeving).stand());
      return t.handler(args, ctx);
    },
  }));
}
