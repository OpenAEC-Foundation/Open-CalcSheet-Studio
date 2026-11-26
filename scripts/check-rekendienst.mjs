/**
 * Controle van de rekendienst zonder venster (packages/headless/, docs/rekendienst.md).
 *
 * Bouwt de dienst (scripts/bouw-rekendienst.mjs), start hem als eigen proces op een vrije
 * poort en vergelijkt wat hij geeft met wat de app zelf uitrekent, in dit proces, langs
 * de wegen van de app: de API (mcp/tools/hulp.ts `rekenBlad`, met de verwijzingen) en
 * de IFCX-export (store/projectIfcx.ts `bladenVoorIfc`).
 *
 *   tools        de gedeelde tools zijn die van de registry van de app, met hetzelfde
 *                schema; elke tool van de app is gedeeld of staat met reden in
 *                NIET_GEDEELD; de eigen tools hebben een route
 *   grenzen      gezondheid en specificatie zonder sleutel, de rest niet (401), een
 *                Origin-header (403), een te groot verzoek (413), te veel tegelijk (429),
 *                een onbekende route (404), geen pad op de server (NOT_AVAILABLE)
 *   project      een project met belastingen uit hoofdstuk 5, een eigen projectwaarde,
 *                projectgegevens (CC3), een verwijzing naar een ander blad en een module:
 *                per blad dezelfde UC, hetzelfde oordeel en dezelfde getallen als de app,
 *                via REST, via /v1 en via MCP; de handberekening van R_paal
 *   modules      elke ingebouwde module via evaluate_sheet: dezelfde getallen als in de app
 *   MCP          over HTTP (sessies: initialize, zonder sessie 400, onbekend 404, einde)
 *                en over stdio
 *   FEM Studio   een @toets-blok zonder server: niet gerekend; met de meegeleverde server
 *                (packages/desktop/src-tauri/fem-studio/): beantwoord
 *   PDF          met Chrome of Chromium en de gebouwde pagina's
 *                (`node scripts/bouw-rekendienst.mjs --paginas`): een rapport als PDF;
 *                anders overgeslagen, met de reden
 *
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 * Draaien:  node scripts/check-rekendienst.mjs
 */
// Eerst de vertalingen: het rapport en de modulenamen halen hun teksten uit het register.
import "./lib/talen.mjs";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { connect } from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { laadTemplate } from "./lib/refcheck.mjs";
import { MCP_TOOLS } from "../packages/desktop/src/mcp/tools.ts";
import { GEDEELD, NIET_GEDEELD } from "../packages/desktop/src/mcp/dienst/tools.ts";
import { activeer } from "../packages/desktop/src/mcp/dienst/rekenen.ts";
import { rekenBlad } from "../packages/desktop/src/mcp/tools/hulp.ts";
import { rekenDoor, jsonGetal } from "../packages/desktop/src/mcp/rekenen.ts";
import { bouwProjectBestand, leesProjectBestand, PROJECT_FORMAAT_VERSIE } from "../packages/desktop/src/store/projectBestand.ts";
import { bladenVoorIfc } from "../packages/desktop/src/store/projectIfcx.ts";
import { legeGegevens, projectScope } from "../packages/desktop/src/store/projectGegevens.ts";
import { standaardRapport } from "../packages/desktop/src/rapport/model.ts";
import { metSymbolen } from "../packages/desktop/src/rapport/belastingBronnen.ts";
import { standaardTeksten } from "../packages/desktop/src/rapport/standaardteksten.ts";
import { CHROMIUM_PADEN } from "../packages/headless/src/pdf.mjs";

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUNDEL = join(WORTEL, "packages/headless/dist/rekendienst.mjs");
const PAGINAS = join(WORTEL, "packages/desktop/dist-rekendienst");
const FEM = join(WORTEL, "packages/desktop/src-tauri/fem-studio", process.platform === "win32" ? "openaec-mcp-server.exe" : "openaec-mcp-server");
const SLEUTEL = "controle-sleutel-0123456789abcdef";

let fouten = 0;
let aantal = 0;
const meld = (ok, wat, detail = "") => {
  aantal++;
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + String(detail).slice(0, 400)}`);
};
const dichtbij = (a, b) => (typeof a === "number" && typeof b === "number" ? Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)) : a === b);

// ── De dienst bouwen en starten ─────────────────────────────────────────────

const bouw = spawnSync(process.execPath, [join(WORTEL, "scripts/bouw-rekendienst.mjs")], { encoding: "utf8" });
if (bouw.status !== 0) {
  console.error(bouw.stdout, bouw.stderr);
  console.error("De rekendienst bouwt niet.");
  process.exit(1);
}

/** Start de dienst; geeft { poort, proc, log, stop }. */
async function startDienst(extra = {}) {
  const proc = spawn(process.execPath, [BUNDEL, "--poort", "0"], {
    env: {
      ...process.env,
      REKENDIENST_TOKEN: SLEUTEL,
      REKENDIENST_PAGINAS: PAGINAS,
      REKENDIENST_FEM_SERVER: existsSync(FEM) ? FEM : join(WORTEL, "bestaat-niet"),
      OCSS_FEM_SERVER: "",
      ...extra,
    },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let log = "";
  const poort = await new Promise((ja, nee) => {
    const klok = setTimeout(() => nee(new Error(`de dienst startte niet binnen 30 s:\n${log}`)), 30_000);
    proc.stderr.on("data", (d) => {
      log += d;
      const m = /luistert op http:\/\/[^:]+:(\d+)/.exec(log);
      if (m) {
        clearTimeout(klok);
        ja(Number(m[1]));
      }
    });
    proc.on("exit", (code) => {
      clearTimeout(klok);
      nee(new Error(`de dienst stopte (${code}):\n${log}`));
    });
  });
  return { poort, proc, log: () => log, stop: () => proc.kill() };
}

const dienst = await startDienst();
const BASIS = `http://127.0.0.1:${dienst.poort}`;
console.log(`Dienst op ${BASIS}`);

async function http(methode, pad, { body, sleutel = SLEUTEL, koppen = {} } = {}) {
  const r = await fetch(`${BASIS}${pad}`, {
    method: methode,
    headers: { ...(sleutel ? { Authorization: `Bearer ${sleutel}` } : {}), ...(body !== undefined ? { "Content-Type": "application/json" } : {}), ...koppen },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
  const tekst = await r.text();
  let data = null;
  try {
    data = tekst ? JSON.parse(tekst) : null;
  } catch {
    data = tekst;
  }
  return { status: r.status, data, koppen: r.headers };
}
const tool = (naam, args, koppen) => http("POST", `/v1/tools/${naam}`, { body: args, koppen });

let mcpId = 0;
async function mcp(sessie, methode, params) {
  const r = await http("POST", "/mcp", { body: { jsonrpc: "2.0", id: ++mcpId, method: methode, params }, koppen: sessie ? { "Mcp-Session-Id": sessie } : {} });
  return r;
}

try {
  // ── 1. Tools ─────────────────────────────────────────────────────────────
  console.log("\nTools");
  const lijst = await http("GET", "/v1/tools");
  meld(lijst.status === 200 && Array.isArray(lijst.data?.tools), "GET /v1/tools", lijst.status);
  const namen = (lijst.data?.tools ?? []).map((t) => t.name);
  const app = new Map(MCP_TOOLS.map((t) => [t.name, t]));
  meld(GEDEELD.every((n) => namen.includes(n)), "elke gedeelde tool staat in de dienst", GEDEELD.filter((n) => !namen.includes(n)).join(", "));
  const anders = GEDEELD.filter((n) => {
    const d = lijst.data.tools.find((t) => t.name === n);
    const a = app.get(n);
    return !d || !a || JSON.stringify(d.inputSchema) !== JSON.stringify(a.inputSchema) || d.description !== a.description || d.kind !== a.kind;
  });
  meld(anders.length === 0, "een gedeelde tool heeft hetzelfde schema, dezelfde beschrijving en soort als in de app", anders.join(", "));
  const zonder = MCP_TOOLS.map((t) => t.name).filter((n) => !GEDEELD.includes(n) && !NIET_GEDEELD[n]);
  meld(zonder.length === 0, "elke tool van de app is gedeeld of staat met reden in NIET_GEDEELD", zonder.join(", "));
  meld(Object.keys(NIET_GEDEELD).every((n) => !namen.includes(n) && app.has(n)), "wat niet gedeeld is, staat niet in de dienst en wel in de app");
  for (const eigen of ["project_load", "project_export", "project_evaluate", "evaluate_sheet", "list_includes", "report_pdf"]) {
    const t = lijst.data.tools.find((x) => x.name === eigen);
    meld(!!t && t.routes.some((r) => r.path.startsWith("/api/v1/") && !r.path.includes("/tools/")), `eigen tool ${eigen} met een REST-route`);
  }
  const inc = await http("GET", "/api/v1/includes");
  meld(inc.status === 200 && inc.data.includes.some((i) => i.name === "detail-oplegging.svg" && i.usage === "@img(detail-oplegging.svg)"), "list_includes: de ingebouwde includes", JSON.stringify(inc.data));

  // ── 2. Grenzen ───────────────────────────────────────────────────────────
  console.log("\nGrenzen");
  const gezond = await http("GET", "/v1/health", { sleutel: null });
  meld(gezond.status === 200 && gezond.data.status === "ok" && /^\d{4}\.\d+\.\d+/.test(gezond.data.version), "GET /v1/health zonder sleutel", JSON.stringify(gezond.data));
  const spec = await http("GET", "/v1/openapi.json", { sleutel: null });
  meld(spec.status === 200 && spec.data.openapi === "3.1.0" && !!spec.data.paths["/v1/health"] && !!spec.data.paths["/api/v1/project/evaluate"]?.post && !!spec.data.paths["/api/v1/sheets/{id}/evaluate"]?.post,
    "GET /v1/openapi.json zonder sleutel: dezelfde routes als de app, plus de eigen en /v1/health");
  meld(spec.data.servers?.[0]?.url === BASIS.replace("http://127.0.0.1", "http://127.0.0.1"), "de specificatie noemt het adres van de dienst", JSON.stringify(spec.data.servers));
  meld((await http("GET", "/v1/tools", { sleutel: null })).status === 401, "zonder sleutel: 401");
  meld((await http("GET", "/v1/tools", { sleutel: "verkeerde-sleutel-0123456789" })).status === 401, "een verkeerde sleutel: 401");
  meld((await http("GET", "/v1/health", { sleutel: null, koppen: { Origin: "https://example.org" } })).status === 403, "met een Origin-header: 403");
  meld((await http("GET", "/v1/bestaat-niet")).status === 404, "een onbekende route: 404");
  const pad = await tool("project_open", { path: "/etc/passwd" });
  meld(pad.status === 404 && pad.data.error.code === "NOT_FOUND", "project_open (een pad) bestaat niet in de dienst", JSON.stringify(pad.data));
  const pdfPad = await tool("sheet_add_pdf", { path: "/etc/hosts" });
  meld(pdfPad.status === 501 && pdfPad.data.error.code === "NOT_AVAILABLE", "een PDF-blad van een pad: NOT_AVAILABLE", JSON.stringify(pdfPad.data));
  {
    const klein = await startDienst({ REKENDIENST_MAX_MB: "1", REKENDIENST_MAX_GELIJK: "1" });
    try {
      const groot = await fetch(`http://127.0.0.1:${klein.poort}/v1/tools/evaluate_sheet`, {
        method: "POST", headers: { Authorization: `Bearer ${SLEUTEL}`, "Content-Type": "application/json" },
        body: JSON.stringify({ source: "x = 1\n" + "' ".repeat(800_000) }),
      });
      meld(groot.status === 413, "een verzoek boven de grens (1 MiB): 413", groot.status);
      // Eén verzoek houdt de enige plek bezet door zijn body niet af te maken.
      const sok = connect(klein.poort, "127.0.0.1");
      await new Promise((r) => sok.once("connect", r));
      sok.write(`POST /v1/tools/evaluate_sheet HTTP/1.1\r\nHost: x\r\nAuthorization: Bearer ${SLEUTEL}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{"source":`);
      await new Promise((r) => setTimeout(r, 300));
      const druk = await fetch(`http://127.0.0.1:${klein.poort}/v1/tools/list_includes`, { method: "POST", headers: { Authorization: `Bearer ${SLEUTEL}` } });
      meld(druk.status === 429 && druk.headers.get("retry-after") === "1", "meer verzoeken tegelijk dan de grens: 429", druk.status);
      sok.destroy();
    } finally {
      klein.stop();
    }
  }

  // ── 3. Een project, tegen de app ───────────────────────────────────────────
  console.log("\nProject: zelfde uitkomsten als de app");
  const rapport = standaardRapport("1 januari 2026", standaardTeksten("nl"), "nl");
  rapport.belastingen = metSymbolen({
    ...rapport.belastingen,
    vloerenDaken: [{ soort: "vlak", naam: "Verdiepingsvloer", lagen: [{ naam: "breedplaat 270", d: "0,27", rho: "25,0", p: "" }, { naam: "afwerkvloer", d: "0,07", rho: "20,0", p: "" }] }],
    klassen: [{ categorie: "A-vloer", lichteScheidingswanden: "0,80", dakhelling: "", qlast: "" }],
  });
  const exemplaren = [
    {
      id: "ex-paal", ref: "1", naam: "Paalbelasting", templateId: "", waarden: {}, elementen: [],
      source: "\"Paalbelasting\nq_Ed = 1.35*g_v1 + 1.5*q_k1\nA = 3.6 m*3.6 m\nR_paal = q_Ed*A to kN\nM_psi = psi_0*10 kN*m\nUC_paal = R_paal/(600 kN)\n",
    },
    {
      id: "ex-poer", ref: "2", naam: "Poer", templateId: "", waarden: { n: "3" }, elementen: [],
      source: "\"Poer\nn = ?{2}\nV = 1.1*#1.R_paal\nF_d = K_FI*V/n\nUC_max = F_d/(100 kN)\n",
    },
    { id: "ex-ligger", ref: "3", naam: "Ligger 1", templateId: "ligger", waarden: {}, elementen: [], source: laadTemplate("ligger.ts") },
    { id: "ex-toets", ref: "4", naam: "Toets", templateId: "", waarden: {}, elementen: [], source: "\"Toets\n@toets staal = list_steel_grades\n@end\n" },
  ];
  const gegevens = { ...legeGegevens(), CC: "3", projectblad: "psi_0 = 0.7" };
  const payload = { versie: PROJECT_FORMAAT_VERSIE, naam: "Controleproject", gegevens, exemplaren, rapport };
  const inhoud = bouwProjectBestand(payload, null);

  // De app, in dit proces: hetzelfde project gelezen, de stand in de kern gezet.
  const gelezen = leesProjectBestand(inhoud, "controle");
  const stand = { gegevens: gelezen.gegevens, rapport: { ...gelezen.rapport, belastingen: metSymbolen(gelezen.rapport.belastingen) }, exemplaren: gelezen.exemplaren };
  activeer(stand);
  const viaApi = Object.fromEntries(stand.exemplaren.map((b) => [b.id, rekenBlad(b, stand.gegevens, stand.exemplaren)]));
  const viaIfc = Object.fromEntries(bladenVoorIfc({ exemplaren: stand.exemplaren, gegevens: stand.gegevens }).map((b) => [b.id, b]));

  const vergelijk = (uitkomst, wat) => {
    for (const blad of uitkomst.sheets ?? []) {
      const a = viaApi[blad.id];
      const ifc = viaIfc[blad.id];
      if (!a?.ok) {
        meld(blad.evaluated === false && !!blad.error, `${wat}: ${blad.name} rekent niet door, net als in de app`, JSON.stringify(blad));
        continue;
      }
      const getallen = Object.fromEntries(Object.entries(a.d.getallen).map(([n, w]) => [n, jsonGetal(w)]));
      const verschil = Object.keys({ ...getallen, ...blad.numbers }).filter((n) => !dichtbij(getallen[n], blad.numbers?.[n]));
      // Het toetsblad toont zonder antwoord geen getallen; de andere bladen wel.
      meld(verschil.length === 0 && (Object.keys(getallen).length > 0 || blad.id === "ex-toets"),`${wat}: ${blad.name}: dezelfde ${Object.keys(getallen).length} getallen als de API van de app`,
        verschil.slice(0, 5).map((n) => `${n}: ${getallen[n]} tegen ${blad.numbers?.[n]}`).join("; "));
      meld(dichtbij(jsonGetal(ifc.resultaat?.uc), blad.uc) && (ifc.resultaat?.voldoet ?? null) === blad.passes,
        `${wat}: ${blad.name}: UC ${blad.uc} en oordeel ${blad.passes} zoals de IFCX-export van de app`, `${jsonGetal(ifc.resultaat?.uc)}/${ifc.resultaat?.voldoet}`);
    }
  };

  const rest = await http("POST", "/api/v1/project/evaluate", { body: { content: inhoud, fileName: "controle.ifccalculation" } });
  meld(rest.status === 200 && rest.data.sheets?.length === 4, "POST /api/v1/project/evaluate", JSON.stringify(rest.data).slice(0, 300));
  vergelijk(rest.data, "REST");
  const paal = rest.data.sheets.find((b) => b.id === "ex-paal");
  // Handberekening: g_v1 = 0,27·25 + 0,07·20 = 8,15 kN/m²; q_k1 = 1,75 + 0,8 = 2,55 kN/m²;
  // q_Ed = 1,35·8,15 + 1,5·2,55 = 14,8275 kN/m²; R_paal = 14,8275 · 12,96 = 192,16 kN.
  meld(Math.abs(paal.numbers.R_paal - 192.1644) < 0.01, "de belastingen uit hoofdstuk 5 tellen: R_paal = 192,16 kN", paal.numbers.R_paal);
  meld(Math.abs(paal.numbers.M_psi - 7) < 1e-9, "een eigen projectwaarde telt: M_psi = 0,7 · 10 = 7 kNm", paal.numbers.M_psi);
  const poer = rest.data.sheets.find((b) => b.id === "ex-poer");
  // CC3: K_FI = 1,1; V = 1,1 · 192,1644 = 211,38 kN; F_d = 1,1 · 211,38 / 3 = 77,51 kN.
  meld(Math.abs(poer.numbers.V - 211.3808) < 0.01 && Math.abs(poer.numbers.F_d - 77.5063) < 0.01, "verwijzing naar blad 1, de invoer n = 3 en K_FI van CC3 tellen", JSON.stringify(poer.numbers));
  const toets = rest.data.sheets.find((b) => b.id === "ex-toets");
  if (existsSync(FEM)) {
    meld(rest.data.fem.available === true && toets.fem?.answered === 1, "met FEM Studio: het @toets-blok is beantwoord", JSON.stringify({ fem: rest.data.fem, blad: toets.fem }));
  } else {
    meld(rest.data.fem.available === false && toets.fem?.notComputed === 1, "zonder FEM Studio: het @toets-blok is niet gerekend", JSON.stringify({ fem: rest.data.fem, blad: toets.fem }));
  }

  const viaV1 = await tool("project_evaluate", { content: inhoud, values: { "1": {} }, sheets: ["ex-poer"], names: ["F_d"] });
  meld(viaV1.status === 200 && viaV1.data.sheets.length === 1 && Object.keys(viaV1.data.sheets[0].numbers).join() === "F_d" && dichtbij(viaV1.data.sheets[0].numbers.F_d, poer.numbers.F_d),
    "POST /v1/tools/project_evaluate met sheets en names", JSON.stringify(viaV1.data).slice(0, 300));
  const anderCc = await tool("project_evaluate", { content: inhoud, projectData: { CC: "2" }, values: { Poer: { n: 2 } }, sheets: ["2"] });
  meld(Math.abs(anderCc.data.sheets[0].numbers.F_d - 211.3808 / 2) < 0.01, "projectData en values per blad (op naam en kenmerk) tellen alleen voor dat verzoek", JSON.stringify(anderCc.data.sheets[0]?.numbers));
  const onbekend = await tool("project_evaluate", { content: inhoud, values: { "Bestaat niet": { n: 1 } } });
  meld(onbekend.status === 404, "invoer voor een blad dat er niet is: 404", onbekend.status);
  const kapot = await tool("project_evaluate", { content: "{\"type\": \"ifcx\", \"header\": {}, \"data\": [] " });
  meld(kapot.status === 200 && kapot.data.sheets.length === 1, "een onleesbaar bestand wordt een los blad, zoals in de app", JSON.stringify(kapot.data).slice(0, 200));

  // MCP over HTTP, met een sessie en het project daarin.
  console.log("\nMCP over HTTP");
  const init = await mcp(null, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "controle", version: "1" } });
  const sessie = init.koppen.get("mcp-session-id");
  meld(init.status === 200 && init.data.result?.serverInfo?.name === "open-calcsheet-studio-api" && /^[0-9a-f]{32}$/.test(sessie ?? ""), "initialize geeft een sessie", JSON.stringify(init.data));
  meld((await mcp(null, "tools/list", {})).status === 400, "zonder sessie: 400");
  meld((await mcp("0".repeat(32), "tools/list", {})).status === 404, "een onbekende sessie: 404");
  const mcpLijst = await mcp(sessie, "tools/list", {});
  meld(mcpLijst.data.result.tools.length === namen.length, "tools/list: dezelfde tools als REST", `${mcpLijst.data.result.tools.length} tegen ${namen.length}`);
  const laad = await mcp(sessie, "tools/call", { name: "project_load", arguments: { content: inhoud } });
  meld(laad.data.result?.isError === false && laad.data.result.structuredContent.sheets.length === 4, "project_load in de sessie", JSON.stringify(laad.data).slice(0, 300));
  const viaMcp = await mcp(sessie, "tools/call", { name: "sheet_evaluate", arguments: { id: "ex-poer" } });
  const sc = viaMcp.data.result?.structuredContent;
  meld(viaMcp.data.result?.isError === false && dichtbij(sc.numbers.F_d, poer.numbers.F_d) && dichtbij(sc.uc, poer.uc), "sheet_evaluate (de tool van de app) op het project van de sessie: dezelfde waarden", JSON.stringify(sc).slice(0, 300));
  const evalMcp = await mcp(sessie, "tools/call", { name: "project_evaluate", arguments: {} });
  vergelijk(evalMcp.data.result.structuredContent, "MCP");
  // REST op het project van dezelfde sessie, en een wijziging die in de sessie blijft.
  const zet = await http("PATCH", "/api/v1/sheets/ex-poer/inputs", { body: { values: { n: 4 } }, koppen: { "Mcp-Session-Id": sessie } });
  const na = await http("POST", "/api/v1/sheets/ex-poer/evaluate", { body: { names: ["F_d"] }, koppen: { "Mcp-Session-Id": sessie } });
  meld(zet.status === 200 && Math.abs(na.data.numbers.F_d - 1.1 * 211.3808 / 4) < 0.01, "REST met de sessie: invoer zetten en doorrekenen op hetzelfde project", JSON.stringify(na.data));
  const uitvoer = await mcp(sessie, "tools/call", { name: "project_export", arguments: {} });
  const terug = leesProjectBestand(uitvoer.data.result.structuredContent.content, "terug");
  meld(terug.exemplaren.find((e) => e.id === "ex-poer")?.waarden.n === "4" && /"UC_max"|UC_max/.test(uitvoer.data.result.structuredContent.content), "project_export: het project met de wijziging en de uitkomsten");
  meld((await http("DELETE", "/mcp", { koppen: { "Mcp-Session-Id": sessie } })).status === 204, "DELETE /mcp beëindigt de sessie");
  meld((await mcp(sessie, "tools/list", {})).status === 404, "daarna is de sessie onbekend");

  // ── 4. De ingebouwde modules ─────────────────────────────────────────────
  console.log("\nModules: evaluate_sheet tegen de app");
  activeer({ gegevens: legeGegevens(), rapport: standaardRapport("1 januari 2026", standaardTeksten("en"), "en"), exemplaren: [] });
  const modules = [
    ["ligger", laadTemplate("ligger.ts")],
    ["balklaag", laadTemplate("balklaag.ts")],
    ["tweepaalspoer", laadTemplate("tweepaalspoer.ts")],
    ["meerpaalspoer", laadTemplate("meerpaalspoer.ts")],
    ["doorsnede-spanningen", laadTemplate("doorsnede-spanningen.ts")],
    ["rekentaal-demo", laadTemplate("rekentaal-demo.ts")],
    ["voorgespannen-heipaal", readFileSync(join(WORTEL, "packages/desktop/src/templates/voorgespannen-heipaal.cpd"), "utf8")],
  ];
  for (const [naam, bron] of modules) {
    const zelf = rekenDoor(bron, {}, projectScope(legeGegevens()), "");
    const verwacht = Object.fromEntries(Object.entries(zelf.getallen).map(([n, w]) => [n, jsonGetal(w)]));
    const r = await tool("evaluate_sheet", { source: bron, html: naam === "ligger", maxLines: 1 });
    const verschil = Object.keys({ ...verwacht, ...r.data.numbers }).filter((n) => !dichtbij(verwacht[n], r.data.numbers?.[n]));
    meld(r.status === 200 && verschil.length === 0 && dichtbij(jsonGetal(zelf.resultaat.uc), r.data.uc),
      `${naam}: ${Object.keys(verwacht).length} getallen en UC ${r.data.uc} zoals in de app`, verschil.slice(0, 5).map((n) => `${n}: ${verwacht[n]} tegen ${r.data.numbers?.[n]}`).join("; "));
    if (naam === "ligger") meld(typeof r.data.html === "string" && r.data.html.includes("katex"), "evaluate_sheet geeft de uitwerking als HTML");
  }

  // ── 5. MCP over stdio ────────────────────────────────────────────────────
  console.log("\nMCP over stdio");
  {
    const proc = spawn(process.execPath, [BUNDEL, "--stdio"], { env: { ...process.env, REKENDIENST_TOKEN: "", REKENDIENST_FEM_SERVER: join(WORTEL, "bestaat-niet"), OCSS_FEM_SERVER: "" }, stdio: ["pipe", "pipe", "ignore"] });
    let buffer = "";
    const antwoorden = [];
    proc.stdout.on("data", (d) => {
      buffer += d;
      let i;
      while ((i = buffer.indexOf("\n")) >= 0) {
        antwoorden.push(JSON.parse(buffer.slice(0, i)));
        buffer = buffer.slice(i + 1);
      }
    });
    const stuur = (b) => proc.stdin.write(`${JSON.stringify(b)}\n`);
    stuur({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "controle", version: "1" } } });
    stuur({ jsonrpc: "2.0", method: "notifications/initialized" });
    stuur({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "evaluate_sheet", arguments: { source: "a = 3 m\nb = 4 m\nc = sqrt(a^2 + b^2)", html: false } } });
    for (let i = 0; i < 100 && antwoorden.length < 2; i++) await new Promise((r) => setTimeout(r, 100));
    proc.stdin.end();
    const [een, twee] = antwoorden;
    meld(een?.result?.serverInfo?.name === "open-calcsheet-studio-api", "stdio: initialize", JSON.stringify(een));
    meld(twee?.result?.structuredContent?.numbers?.c === 5 && antwoorden.length === 2, "stdio: evaluate_sheet geeft c = 5 m; geen antwoord op een notificatie", JSON.stringify(twee).slice(0, 200));
    await new Promise((r) => proc.once("exit", r));
  }

  // ── 6. Rapport als PDF ───────────────────────────────────────────────────
  console.log("\nRapport als PDF");
  const chromium = process.env.REKENDIENST_CHROMIUM || CHROMIUM_PADEN.find((p) => existsSync(p));
  if (!chromium) {
    console.log("  -- overgeslagen: geen Chrome of Chromium gevonden");
    meld(gezond.data.pdf === "not_available", "zonder Chromium meldt /v1/health pdf: not_available");
  } else if (!existsSync(join(PAGINAS, "index.html"))) {
    console.log("  -- overgeslagen: de pagina's ontbreken (node scripts/bouw-rekendienst.mjs --paginas)");
    const geen = await tool("report_pdf", { content: inhoud });
    meld(geen.status === 501 && geen.data.error.code === "NOT_AVAILABLE", "zonder pagina's: report_pdf geeft NOT_AVAILABLE", JSON.stringify(geen.data));
  } else {
    const r = await tool("report_pdf", { content: inhoud, fileName: "controle.ifccalculation" });
    const pdf = r.data?.base64 ? Buffer.from(r.data.base64, "base64") : Buffer.alloc(0);
    meld(r.status === 200 && pdf.subarray(0, 5).toString("latin1") === "%PDF-" && r.data.pages > 2 && r.data.bytes === pdf.length, `report_pdf: een PDF van ${r.data?.pages} pagina's`, JSON.stringify({ ...r.data, base64: undefined }));
  }
} finally {
  dienst.stop();
}

console.log(`\n${aantal - fouten} van ${aantal} controles goed.`);
process.exit(fouten === 0 ? 0 : 1);
