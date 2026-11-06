/**
 * Controlescript voor de REST-API van de app (packages/desktop/src/mcp/rest.ts)
 * en de tools achter "alle functies".
 *
 * Toetst zonder webview en zonder Tauri, op de nagebouwde app van
 * scripts/lib/mcpproef.mjs:
 *
 *   registry      elke tool heeft een REST-route; geen dubbele routes;
 *                 padparameters staan in het schema van de tool
 *   openapi       3.1, elke route erin met de tool erbij, Bearer-beveiliging,
 *                 de specificatie zelf zonder token
 *   routes        statussen (200/201/400/404/405/409/422/423/501/503), query
 *                 omgezet naar het type uit het schema, padparameter wint
 *   tools         project nieuw/openen/opslaan/opslaan als/recent, naam,
 *                 zichtbaarheid, rapport lezen/zetten, bladen dupliceren en
 *                 verplaatsen, PDF-blad, formules, IFC/IFCX, PDF, afdrukken,
 *                 weergave, instellingen, modulebibliotheek, ongedaan/opnieuw
 *   gelijk        dezelfde tool via MCP en REST geeft hetzelfde
 *   generiek      GET /api/v1/tools, POST /api/v1/tools/{naam}
 *   requests      een REST-request door de requesthandler: zonder MCP-sessie,
 *                 met de status van rest.ts
 *
 * De Rust-kant (token, Origin, welke paden REST zijn, de openbare
 * specificatie) heeft eigen tests: cargo test, src-tauri/src/mcp_bridge.rs.
 *
 * Node 24 laadt de .ts-bestanden rechtstreeks. Vereist een gebouwde core:
 * npm --prefix packages/core run build
 *
 * Draaien:  node scripts/check-api.mjs
 */
import { verwerkRest, routesVan } from "../packages/desktop/src/mcp/rest.ts";
import { verwerkMcpBericht } from "../packages/desktop/src/mcp/dispatcher.ts";
import { MCP_TOOLS } from "../packages/desktop/src/mcp/tools.ts";
import { maakRequestHandler, maakSessies } from "../packages/desktop/src/mcp/requestHandler.ts";
import { FORMULES } from "../packages/desktop/src/components/ribbon/formules.ts";
import { useLibrary } from "../packages/desktop/src/store/library.ts";
import { laadLibrary } from "./lib/library.mjs";
import { maakApp, maakContext, PROJECT_ID, RAPPORT_ID, PROEF_PDF } from "./lib/mcpproef.mjs";

let fouten = 0;
let aantal = 0;
const meld = (ok, wat, detail = "") => {
  aantal++;
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};

const app = maakApp();
const vlaggen = { alleenLezen: false, gepauzeerd: false };
const context = () => maakContext(app.omgeving, vlaggen)();
const deps = { tools: MCP_TOOLS, context };

/** Eén REST-request; geeft {status, data}. */
async function api(methode, pad, body) {
  const r = await verwerkRest(methode, pad, body === undefined ? "" : typeof body === "string" ? body : JSON.stringify(body), deps);
  return { status: r.status, data: JSON.parse(r.body) };
}
const kort = (r) => JSON.stringify(r.data).slice(0, 200);

// ── 1. Registry ─────────────────────────────────────────────────────────────
console.log("Registry:");
{
  const zonder = MCP_TOOLS.filter((t) => !t.rest || t.rest.length === 0).map((t) => t.name);
  meld(zonder.length === 0, `elke tool (${MCP_TOOLS.length}) heeft een REST-route`, zonder.join());
  const sleutels = MCP_TOOLS.flatMap((t) => (t.rest ?? []).map((r) => `${r.method} ${r.path.replace(/\{[^}]+\}/g, "{}")}`));
  const dubbel = sleutels.filter((k, i) => sleutels.indexOf(k) !== i);
  meld(dubbel.length === 0, "geen route twee keer", dubbel.join());
  const mis = MCP_TOOLS.flatMap((t) => (t.rest ?? []).flatMap((r) =>
    [...r.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]).filter((p) => !(p in (t.inputSchema.properties ?? {}))).map((p) => `${t.name}:${p}`)));
  meld(mis.length === 0, "padparameters staan in het schema", mis.join());
  const routes = routesVan(MCP_TOOLS);
  const pdf = routes.findIndex((r) => r.route.path === "/sheets/pdf");
  const id = routes.findIndex((r) => r.route.path === "/sheets/{id}");
  meld(pdf >= 0 && id >= 0 && pdf < id, "vaste routes vóór routes met een parameter");
  meld(MCP_TOOLS.every((t) => ["read", "mutate", "file", "ui"].includes(t.kind)), "elke tool heeft een soort");
}

// ── 2. OpenAPI ──────────────────────────────────────────────────────────────
console.log("OpenAPI:");
{
  const r = await api("GET", "/api/v1/openapi.json");
  const spec = r.data;
  meld(r.status === 200 && spec.openapi === "3.1.0", "GET /api/v1/openapi.json: OpenAPI 3.1");
  meld(spec.servers?.[0]?.url === "http://127.0.0.1:3879", "server: 127.0.0.1 op de poort", spec.servers?.[0]?.url);
  meld(spec.components?.securitySchemes?.bearer?.scheme === "bearer" && spec.security?.[0]?.bearer !== undefined, "Bearer-beveiliging");
  meld(Array.isArray(spec.paths?.["/api/v1/openapi.json"]?.get?.security) && spec.paths["/api/v1/openapi.json"].get.security.length === 0, "de specificatie zelf zonder token");
  const ontbreekt = MCP_TOOLS.flatMap((t) => (t.rest ?? []).filter((x) => !spec.paths?.[`/api/v1${x.path}`]?.[x.method.toLowerCase()]).map((x) => `${x.method} ${x.path}`));
  meld(ontbreekt.length === 0, "elke route staat in paths", ontbreekt.join());
  const ops = Object.values(spec.paths).flatMap((p) => Object.values(p));
  const ids = ops.map((o) => o.operationId);
  meld(new Set(ids).size === ids.length, "operationId's uniek");
  const namen = new Set(MCP_TOOLS.map((t) => t.name));
  meld(ops.filter((o) => o["x-mcp-tool"]).every((o) => namen.has(o["x-mcp-tool"])), "x-mcp-tool wijst naar een bestaande tool");
  const sheetGet = spec.paths["/api/v1/sheets/{id}"]?.get;
  meld(sheetGet?.parameters?.some((p) => p.in === "path" && p.name === "id") && sheetGet.parameters.some((p) => p.in === "query" && p.name === "evaluate"), "GET /sheets/{id}: pad- en queryparameter");
  const add = spec.paths["/api/v1/sheets"]?.post;
  meld(add?.requestBody?.content?.["application/json"]?.schema?.properties?.templateId && add.responses["201"], "POST /sheets: body-schema en 201");
  meld(spec.paths["/api/v1/sheets/{id}/inputs"]?.patch?.requestBody?.content["application/json"].schema.properties.id === undefined, "padparameter niet nog eens in de body");
  meld(spec.paths["/api/v1/sheets/{id}/inputs"]?.patch?.responses?.["423"] !== undefined, "mutatie: 423 gedocumenteerd");
  meld(spec.paths["/api/v1/tools/{name}"]?.post?.parameters?.[0]?.schema?.enum?.length === MCP_TOOLS.length, "generieke route met alle toolnamen");
}

// ── 3. Routes en statussen ───────────────────────────────────────────────────
console.log("Routes:");
{
  const index = await api("GET", "/api/v1");
  meld(index.status === 200 && index.data.routes.includes("GET /api/v1/project"), "GET /api/v1: overzicht met routes");
  meld((await api("GET", "/api/v1/bestaat/niet")).status === 404, "onbekende route: 404");
  const fout405 = await api("PUT", "/api/v1/sheets");
  meld(fout405.status === 405 && fout405.data.error.code === "METHOD_NOT_ALLOWED" && /GET, POST|POST, GET/.test(fout405.data.error.message), "verkeerde methode: 405 met de goede", kort(fout405));
  const kapot = await api("POST", "/api/v1/sheets", "{kapot");
  meld(kapot.status === 400 && kapot.data.error.code === "VALIDATION", "onleesbare body: 400");
  meld((await api("POST", "/api/v1/sheets", "[1]")).status === 400, "body geen object: 400");
  const onbekendArg = await api("GET", "/api/v1/project?onzin=1");
  meld(onbekendArg.status === 400 && /not a known argument/.test(onbekendArg.data.error.message), "onbekende queryparameter: 400", kort(onbekendArg));
  const p = await api("GET", "/api/v1/project");
  meld(p.status === 200 && p.data.projectName === "Proefproject" && p.data.hidden.report === false && p.data.undoSteps === 0, "GET /project", kort(p));
}

// ── 4. Project, bestanden en rapport ────────────────────────────────────────
console.log("Project:");
let liggerId;
{
  const cc = await api("PATCH", "/api/v1/project/gegevens", { name: "CC", value: "CC3" });
  meld(cc.status === 200 && cc.data.value === "3" && app.s.gegevens.CC === "3", "PATCH /project/gegevens: CC3 → 3");
  const meer = await api("PATCH", "/api/v1/project/data", { values: { windgebied: "1", project_nummer: 42 } });
  meld(meer.status === 200 && app.s.gegevens.windgebied === "1" && app.s.gegevens.project_nummer === "42", "PATCH /project/data: meerdere velden", kort(meer));
  const half = await api("PATCH", "/api/v1/project/data", { values: { RC: "1", windgebied: "9" } });
  meld(half.status === 400 && app.s.gegevens.RC === "2", "één fout veld ⇒ niets geschreven");
  const naam = await api("PUT", "/api/v1/project/name", { name: "Hal Noord" });
  meld(naam.status === 200 && app.s.projectNaam === "Hal Noord", "PUT /project/name");
  const verb = await api("PUT", "/api/v1/project/visibility", { part: "report", visible: false });
  meld(verb.status === 200 && verb.data.hidden.report === true && app.s.verborgen.rapport === true, "PUT /project/visibility: rapport verbergen");
  await api("PUT", "/api/v1/project/visibility", { part: "report", visible: true });
  meld(!app.s.verborgen.rapport, "en weer terug");

  const rev = await api("GET", "/api/v1/report?path=revisies");
  meld(rev.status === 200 && Array.isArray(rev.data.value) && rev.data.value.length >= 1, "GET /report?path=revisies", kort(rev));
  const veld = Object.keys(rev.data.value[0]).find((k) => typeof rev.data.value[0][k] === "string");
  const zet = await api("PATCH", "/api/v1/report", { path: `revisies.0.${veld}`, value: "Eerste uitgifte" });
  meld(zet.status === 200 && app.s.rapport.revisies[0][veld] === "Eerste uitgifte", `PATCH /report: revisies.0.${veld}`);
  const nieuweRev = await api("PATCH", "/api/v1/report", { path: "revisies.1", value: { ...rev.data.value[0], [veld]: "Tweede" } });
  meld(nieuweRev.status === 200 && app.s.rapport.revisies.length === 2 && app.s.rapport.revisies[1][veld] === "Tweede", "PATCH /report: een revisie erbij (object)", kort(nieuweRev));
  meld((await api("PATCH", "/api/v1/report", { path: "bestaat.niet.hier", value: "x" })).status === 404, "PATCH /report: onbekende plek 404");
  meld((await api("GET", "/api/v1/report?path=bestaat.niet")).status === 404, "GET /report: onbekend pad 404");
  const heel = await api("GET", "/api/v1/report");
  meld(heel.status === 200 && heel.data.report && typeof heel.data.report === "object", "GET /report: het hele rapport");

  const ond = await api("POST", "/api/v1/undo");
  meld(ond.status === 200 && ond.data.undone === true && app.s.rapport.revisies.length === 1, "POST /undo draait de laatste stap terug", kort(ond));
  const opn = await api("POST", "/api/v1/redo");
  meld(opn.status === 200 && opn.data.redone === true && app.s.rapport.revisies.length === 2, "POST /redo zet hem terug");
  // Een situatie met kaartbeelden: in het antwoord alleen de grootte, in het rapport zelf de JPEG.
  const jpeg = "QUJDREVGR0hJ";
  app.s.rapport.situatie = { tonen: true, punt: { lat: 52.0907, lon: 5.1214 }, datum: "2026-11-06", kaarten: [{ id: "omgeving", zoom: 15, jpeg }] };
  const metSit = await api("GET", "/api/v1/report");
  const sitTekst = JSON.stringify(metSit.data);
  meld(metSit.status === 200 && !sitTekst.includes(jpeg) && !sitTekst.includes('"jpeg"') &&
    JSON.stringify(metSit.data.report.situatie.kaarten) === JSON.stringify([{ id: "omgeving", zoom: 15, bytes: 9 }]),
    "GET /report: situatie met id, zoom en bytes, zonder jpeg", sitTekst.slice(0, 300));
  const sitDeel = await api("GET", "/api/v1/report?path=situatie");
  meld(sitDeel.status === 200 && !JSON.stringify(sitDeel.data).includes(jpeg) && sitDeel.data.value.kaarten[0].bytes === 9, "GET /report?path=situatie: ook zonder jpeg", kort(sitDeel));
  const sitZet = await api("PATCH", "/api/v1/report", { path: "situatie.tonen", value: false });
  meld(sitZet.status === 200 && app.s.rapport.situatie.kaarten[0].jpeg === jpeg, "PATCH /report: het opgeslagen rapport houdt de jpeg", kort(sitZet));
  const sitVervang = await api("PATCH", "/api/v1/report", { path: "situatie", value: app.s.rapport.situatie });
  meld(sitVervang.status === 200 && !JSON.stringify(sitVervang.data).includes(jpeg) && sitVervang.data.set.situatie.kaarten[0].bytes === 9, "PATCH /report: het antwoord heeft bytes, geen jpeg", kort(sitVervang));
  delete app.s.rapport.situatie;

  const conflict = await api("POST", "/api/v1/project/new");
  meld(conflict.status === 409 && conflict.data.error.code === "CONFLICT", "POST /project/new met niet opgeslagen werk: 409");
  const zonderPad = await api("POST", "/api/v1/project/save");
  meld(zonderPad.status === 400, "POST /project/save zonder bestand: 400");
  const als = await api("POST", "/api/v1/project/save-as", { path: "C:/proef/hal" });
  meld(als.status === 200 && als.data.filePath === "C:/proef/hal.ifccalculation" && app.s.dirty === false && app.schijf.has("C:/proef/hal.ifccalculation"), "POST /project/save-as: extensie erbij, opgeslagen", kort(als));
  await api("PUT", "/api/v1/project/name", { name: "Hal Noord 2" });
  const opslaan = await api("POST", "/api/v1/project/save");
  meld(opslaan.status === 200 && opslaan.data.filePath === "C:/proef/hal.ifccalculation" && !app.s.dirty, "POST /project/save: over het eigen bestand");
  const nieuw = await api("POST", "/api/v1/project/new");
  meld(nieuw.status === 200 && app.s.projectNaam === "Proefproject" && app.s.bestandspad === null, "POST /project/new na opslaan");
  const open = await api("POST", "/api/v1/project/open", { path: "C:/proef/hal.ifccalculation" });
  meld(open.status === 200 && app.s.projectNaam === "Hal Noord 2" && app.s.gegevens.CC === "3" && app.s.rapport.revisies.length === 2, "POST /project/open: alles terug", kort(open));
  meld((await api("POST", "/api/v1/project/open", { path: "C:/bestaat/niet.ifccalculation" })).status === 404, "POST /project/open: onbekend bestand 404");
  meld((await api("POST", "/api/v1/sheets/pdf", { path: "C:/bestaat/niet.pdf" })).status === 404, "POST /sheets/pdf: onbekend bestand 404");
  const recent = await api("GET", "/api/v1/project/recent");
  meld(recent.status === 200 && recent.data.files[0]?.path === "C:/proef/hal.ifccalculation", "GET /project/recent");

  const a = await api("POST", "/api/v1/sheets", { templateId: "ligger", name: "Ligger dak" });
  liggerId = a.data.id;
  meld(a.status === 201 && a.data.name === "Ligger dak", "POST /sheets: 201", kort(a));
  meld((await api("POST", "/api/v1/project/open", { path: "C:/proef/hal.ifccalculation" })).status === 409, "POST /project/open met niet opgeslagen werk: 409");
}

// ── 5. Bladen ───────────────────────────────────────────────────────────────
console.log("Bladen:");
{
  const g = await api("GET", `/api/v1/sheets/${liggerId}?evaluate=false`);
  meld(g.status === 200 && g.data.result === undefined && g.data.inputs.some((v) => v.name === "materiaal"), "GET /sheets/{id}?evaluate=false: query als boolean");
  const inp = await api("PATCH", `/api/v1/sheets/${liggerId}/inputs`, { values: { materiaal: "Staal" } });
  meld(inp.status === 200 && inp.data.set.materiaal === "2", "PATCH /sheets/{id}/inputs");
  const andereId = await api("PATCH", `/api/v1/sheets/${liggerId}/inputs`, { id: "ex-999", values: { materiaal: "1" } });
  meld(andereId.status === 200 && app.s.exemplaren.find((e) => e.id === liggerId).waarden.materiaal === "1", "padparameter wint van de body");
  const ev = await api("POST", `/api/v1/sheets/${liggerId}/evaluate`, { numbers: false });
  meld(ev.status === 200 && typeof ev.data.title === "string" && ev.data.numbers === undefined, "POST /sheets/{id}/evaluate", kort(ev));
  const lijst = await api("GET", "/api/v1/sheets");
  meld(lijst.status === 200 && lijst.data.sheets.find((x) => x.id === liggerId)?.evaluated === true, "GET /sheets: uitkomst bekend na evaluate");
  const lijst2 = await api("GET", "/api/v1/sheets?evaluate=true");
  meld(lijst2.data.sheets.every((x) => x.kind === "pdf" || x.evaluated || x.error), "GET /sheets?evaluate=true rekent alles");

  const eigen = await api("POST", "/api/v1/sheets", { source: '"Eigen\na = ? mm\n' });
  const eigenId = eigen.data.id;
  const bron = await api("PUT", `/api/v1/sheets/${eigenId}/source`, { source: '"Eigen\na = ? mm\nb = 2*a\n' });
  meld(bron.status === 200 && bron.data.lines === 4, "PUT /sheets/{id}/source");
  const formule = FORMULES[0];
  const fl = await api("GET", `/api/v1/formulas?query=${encodeURIComponent(formule.naam.en.split(" ")[0])}&includeCode=true`);
  meld(fl.status === 200 && fl.data.count > 0 && fl.data.formulas.some((f) => f.id === formule.id && f.code === formule.code), "GET /formulas?query=…&includeCode=true", kort(fl));
  const grp = await api("GET", `/api/v1/formulas?group=${formule.groep}`);
  meld(grp.status === 200 && grp.data.formulas.every((f) => f.group === formule.groep && f.code === undefined), "GET /formulas?group=…");
  meld((await api("GET", "/api/v1/formulas?group=bestaat-niet")).status === 400, "GET /formulas: onbekende groep 400");
  const f1 = await api("GET", `/api/v1/formulas/${formule.id}`);
  meld(f1.status === 200 && f1.data.code === formule.code, "GET /formulas/{id}");
  meld((await api("GET", "/api/v1/formulas/bestaat-niet")).status === 404, "GET /formulas/{id}: onbekend 404");
  const ins = await api("POST", `/api/v1/sheets/${eigenId}/formulas`, { formulaId: formule.id, position: 1 });
  const naIns = app.s.exemplaren.find((e) => e.id === eigenId).source.split("\n");
  meld(ins.status === 200 && ins.data.fromLine === 2 && naIns[1] === formule.code.split("\n")[0] && naIns[0] === '"Eigen', "POST /sheets/{id}/formulas: na regel 1", kort(ins));
  const insEind = await api("POST", `/api/v1/sheets/${eigenId}/formulas`, { formulaId: formule.id });
  const bronNu = app.s.exemplaren.find((e) => e.id === eigenId).source;
  meld(insEind.status === 200 && bronNu.trimEnd().endsWith(formule.code.split("\n").at(-1)), "POST /sheets/{id}/formulas: achteraan");
  const evIns = await api("POST", `/api/v1/sheets/${eigenId}/evaluate`, { numbers: false });
  meld(evIns.status === 200, "blad met ingevoegde formule rekent door", kort(evIns));

  // Een voorbeeld uit de Library heeft tekstregels in twee talen. De API kent het pas
  // als het is opgehaald, net als in de app.
  useLibrary.setState(await laadLibrary());
  const vb = useLibrary.getState().voorbeelden[0];
  const vbGet = await api("GET", `/api/v1/formulas/${vb.id}`);
  meld(vbGet.status === 200 && vbGet.data.library === vb.library && vbGet.data.code === vb.code && vbGet.data.codeEn === vb.codeEn, "GET /formulas/{id}: voorbeeld in twee talen", kort(vbGet));
  const vbBlad = await api("POST", "/api/v1/sheets", { source: '"Voorbeeld\n' });
  const vbEn = await api("POST", `/api/v1/sheets/${vbBlad.data.id}/formulas`, { formulaId: vb.id, language: "en" });
  meld(vbEn.status === 200 && vbEn.data.inserted === vb.codeEn, "POST /sheets/{id}/formulas: language en", kort(vbEn));
  const vbNl = await api("POST", `/api/v1/sheets/${vbBlad.data.id}/formulas`, { formulaId: vb.id, language: "nl" });
  meld(vbNl.status === 200 && vbNl.data.inserted === vb.code, "POST /sheets/{id}/formulas: language nl", kort(vbNl));
  const vbApp = await api("POST", `/api/v1/sheets/${vbBlad.data.id}/formulas`, { formulaId: vb.id });
  meld(vbApp.status === 200 && [vb.code, vb.codeEn].includes(vbApp.data.inserted), "POST /sheets/{id}/formulas: zonder language de taal van de app", kort(vbApp));
  meld((await api("POST", `/api/v1/sheets/${vbBlad.data.id}/formulas`, { formulaId: vb.id, language: "fr" })).status === 400, "POST /sheets/{id}/formulas: onbekende taal 400");
  meld((await api("DELETE", `/api/v1/sheets/${vbBlad.data.id}`)).status === 200, "voorbeeldblad weer weg");

  const ren = await api("PATCH", `/api/v1/sheets/${eigenId}`, { name: "Eigen blad" });
  meld(ren.status === 200 && ren.data.name === "Eigen blad", "PATCH /sheets/{id}: hernoemen");
  const dup = await api("POST", `/api/v1/sheets/${liggerId}/duplicate`, { name: "Ligger dak (b)" });
  meld(dup.status === 201 && dup.data.position === 1 && app.s.exemplaren[1].naam === "Ligger dak (b)" && app.s.exemplaren[1].waarden.materiaal === "1", "POST /sheets/{id}/duplicate: direct erna, met invoer", kort(dup));
  const mv = await api("POST", `/api/v1/sheets/${eigenId}/move`, { direction: "up", steps: 5 });
  meld(mv.status === 200 && mv.data.position === 0 && app.s.exemplaren[0].id === eigenId, "POST /sheets/{id}/move: tot bovenaan", kort(mv));
  meld((await api("POST", `/api/v1/sheets/${eigenId}/move`, { direction: "sideways" })).status === 400, "move: verkeerde richting 400");

  const pdf = await api("POST", "/api/v1/sheets/pdf", { base64: PROEF_PDF, fileName: "leverancier.pdf" });
  meld(pdf.status === 201 && pdf.data.name === "leverancier" && app.s.exemplaren.at(-1).templateId === "pdf", "POST /sheets/pdf: base64", kort(pdf));
  meld((await api("POST", "/api/v1/sheets/pdf", { base64: Buffer.from("geen pdf").toString("base64") })).status === 400, "POST /sheets/pdf: geen PDF 400");
  meld((await api("POST", "/api/v1/sheets/pdf", {})).status === 400, "POST /sheets/pdf: zonder bestand 400");
  app.schijf.set("C:/proef/bijlage.pdf", Buffer.from(PROEF_PDF, "base64").toString("latin1"));
  const pdfPad = await api("POST", "/api/v1/sheets/pdf", { path: "C:/proef/bijlage.pdf", name: "Bijlage" });
  meld(pdfPad.status === 201 && pdfPad.data.name === "Bijlage" && pdfPad.data.fileName === "bijlage.pdf", "POST /sheets/pdf: uit een pad", kort(pdfPad));
  const pdfGet = await api("GET", `/api/v1/sheets/${pdf.data.id}`);
  meld(pdfGet.status === 200 && pdfGet.data.kind === "pdf" && pdfGet.data.pdf.fileName === "leverancier.pdf" && pdfGet.data.source === undefined, "GET /sheets/{id}: PDF-blad");
  meld((await api("POST", `/api/v1/sheets/${pdf.data.id}/evaluate`)).status === 400, "een PDF-blad rekent niet: 400");
  const pdfZet = await api("PUT", `/api/v1/sheets/${pdf.data.id}/pdf`, { base64: PROEF_PDF, fileName: "v2.pdf" });
  meld(pdfZet.status === 200 && app.s.exemplaren.find((e) => e.id === pdf.data.id).pdf.bestandsnaam === "v2.pdf", "PUT /sheets/{id}/pdf");
  meld((await api("PUT", `/api/v1/sheets/${liggerId}/pdf`, { base64: PROEF_PDF })).status === 400, "PUT /pdf op een rekenblad: 400");

  meld((await api("POST", `/api/v1/sheets/report/select`)).status === 200 && app.s.activeId === RAPPORT_ID, "POST /sheets/report/select");
  meld((await api("POST", `/api/v1/sheets/${liggerId}/select`)).status === 200 && app.s.activeId === liggerId, "POST /sheets/{id}/select");
  const weg = await api("DELETE", `/api/v1/sheets/${pdfPad.data.id}`);
  meld(weg.status === 200 && !app.s.exemplaren.some((e) => e.id === pdfPad.data.id), "DELETE /sheets/{id}");
  meld((await api("GET", "/api/v1/sheets/ex-999")).status === 404, "GET /sheets/{id}: onbekend 404");
  const calc = await api("POST", "/api/v1/evaluate", { source: "a = 2\nb = a*3" });
  meld(calc.status === 200 && calc.data.lines.find((l) => l.name === "b")?.value === 6, "POST /evaluate");
  const kapotCalc = await api("POST", "/api/v1/evaluate", { source: "x = (" });
  meld([200, 422].includes(kapotCalc.status), "POST /evaluate met een fout: 200 met foutregel of 422", String(kapotCalc.status));
}

// ── 6. Export, afdrukken, weergave, instellingen, bibliotheek ────────────────
console.log("Export en app:");
{
  const ifcx = await api("GET", "/api/v1/export/ifc?format=ifcx");
  let doc = null;
  try { doc = JSON.parse(ifcx.data.content); } catch { /* geen JSON */ }
  meld(ifcx.status === 200 && doc?.header?.ifcxVersion === "ifcx_alpha" && JSON.stringify(Object.keys(doc)) === '["header","imports","schemas","data"]' && doc.data.some((k) => k.attributes?.["ocss::blad"]), "GET /export/ifc?format=ifcx: het project als zuiver IFCX, met zijn bladen");
  const step = await api("GET", `/api/v1/export/ifc?format=ifc&id=${liggerId}`);
  meld(step.status === 200 && /ISO-10303-21/.test(step.data.content) && /IFCRELAGGREGATES/.test(step.data.content) && /IFCDOCUMENTINFORMATION/.test(step.data.content), "GET /export/ifc?format=ifc&id=…: STEP van één blad, met boom en document");
  meld((await api("GET", "/api/v1/export/ifc?format=ifc&id=ex-999")).status === 404, "IFC van een onbekend blad: 404");
  const naar = await api("POST", "/api/v1/export/ifc", { format: "ifc", path: "C:/proef/hal.ifc" });
  meld(naar.status === 200 && /ISO-10303-21/.test(app.schijf.get("C:/proef/hal.ifc") ?? ""), "POST /export/ifc: naar een bestand");
  const pdf = await api("POST", "/api/v1/export/pdf", { path: "C:/proef/hal" });
  meld(pdf.status === 501 && pdf.data.error.code === "NOT_AVAILABLE", "POST /export/pdf zonder rapportengine: 501", kort(pdf));
  const print = await api("POST", "/api/v1/print", { what: "report" });
  meld(print.status === 200 && app.afdrukken.at(-1)?.soort === "rapport", "POST /print: het rapport");
  const printBlad = await api("POST", "/api/v1/print", { what: "sheets", ids: [liggerId] });
  meld(printBlad.status === 200 && app.afdrukken.at(-1)?.selectie?.[0] === liggerId, "POST /print: één blad");
  meld((await api("POST", "/api/v1/print", { what: "sheets", ids: ["ex-999"] })).status === 404, "POST /print: onbekend blad 404");

  const v = await api("PUT", "/api/v1/view", { view: "code-output" });
  meld(v.status === 200 && (await api("GET", "/api/v1/view")).data.view === "code-output", "PUT/GET /view: code-output");
  await api("POST", "/api/v1/sheets/project/select");
  const geenBlad = await api("PUT", "/api/v1/view", { view: "ifc" });
  meld(geenBlad.status === 501, "PUT /view ifc zonder open blad: 501");
  meld((await api("PUT", "/api/v1/view", { view: "plat" })).status === 400, "PUT /view: onbekende weergave 400");

  const s1 = await api("PATCH", "/api/v1/settings", { theme: "dark", units: { angleMode: "deg" } });
  meld(s1.status === 200 && s1.data.theme === "dark" && s1.data.units.angleMode === "deg" && s1.data.units.defaultLength === "mm", "PATCH /settings: thema en één eenheid, de rest blijft", kort(s1));
  const s3 = await api("PATCH", "/api/v1/settings", { units: { stelsel: "us" } });
  meld(s3.status === 200 && s3.data.units.stelsel === "us" && s3.data.units.angleMode === "deg", "PATCH /settings: het eenhedenstelsel voor een nieuw project, de rest blijft", kort(s3));
  meld((await api("PATCH", "/api/v1/settings", { units: { stelsel: "imperial" } })).status === 400, "PATCH /settings: onbekend eenhedenstelsel 400");
  meld((await api("PATCH", "/api/v1/settings", { theme: "roze" })).status === 400, "PATCH /settings: onbekend thema 400");
  meld((await api("PATCH", "/api/v1/settings", {})).status === 400, "PATCH /settings: leeg 400");
  const s2 = await api("GET", "/api/v1/settings");
  meld(s2.status === 200 && s2.data.options.theme.includes("blueprint"), "GET /settings met de keuzes");

  const lib = await api("GET", "/api/v1/library");
  meld(lib.status === 200 && lib.data.modules.some((m) => m.id === "kolom" && m.installed === false), "GET /library");
  const inst = await api("POST", "/api/v1/library/kolom/install");
  meld(inst.status === 200 && inst.data.installed === "kolom", "POST /library/{id}/install");
  meld((await api("POST", "/api/v1/library/bestaat-niet/install")).status === 404, "installeren: onbekende module 404");
  const lib2 = await api("GET", "/api/v1/library");
  meld(lib2.data.modules.find((m) => m.id === "kolom")?.installed === true, "GET /library: geïnstalleerd");
  const kolom = await api("POST", "/api/v1/sheets", { templateId: "kolom" });
  meld(kolom.status === 201, "een geïnstalleerde module als blad toevoegen", kort(kolom));
  meld((await api("DELETE", "/api/v1/library/kolom")).status === 200 && (await api("DELETE", "/api/v1/library/kolom")).status === 404, "DELETE /library/{id}, tweede keer 404");

  const info = await api("GET", "/api/v1/info");
  meld(info.status === 200 && info.data.rest === "http://127.0.0.1:3879/api/v1" && info.data.mcp === "http://127.0.0.1:3879/mcp", "GET /info");
}

// ── 7. MCP en REST gelijk; generieke routes ──────────────────────────────────
console.log("Gelijk en generiek:");
{
  const mcp = JSON.parse(await verwerkMcpBericht(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "sheet_get", arguments: { id: liggerId, evaluate: false } } }), {
    tools: MCP_TOOLS, serverInfo: { name: "x", version: "0" }, context,
  })).result.structuredContent;
  const rest = (await api("GET", `/api/v1/sheets/${liggerId}?evaluate=false`)).data;
  meld(JSON.stringify(mcp) === JSON.stringify(rest), "sheet_get via MCP en via REST: hetzelfde");
  const generiek = await api("POST", "/api/v1/tools/sheet_get", { id: liggerId, evaluate: false });
  meld(generiek.status === 200 && JSON.stringify(generiek.data) === JSON.stringify(rest), "POST /tools/sheet_get: hetzelfde");
  const lijst = await api("GET", "/api/v1/tools");
  meld(lijst.status === 200 && lijst.data.tools.length === MCP_TOOLS.length && lijst.data.tools.every((t) => t.inputSchema && t.routes.length >= 2), "GET /tools: elke tool met schema en routes");
  meld((await api("POST", "/api/v1/tools/bestaat_niet", {})).status === 404, "POST /tools/{onbekend}: 404");
  meld((await api("GET", "/api/v1/tools/sheet_get")).status === 405, "GET /tools/{naam}: 405");
  const gen400 = await api("POST", "/api/v1/tools/sheet_rename", { name: "x" });
  meld(gen400.status === 400, "POST /tools/{naam} met fout argument: 400");
}

// ── 8. Alleen-lezen en pauze ─────────────────────────────────────────────────
console.log("Alleen-lezen en pauze:");
{
  vlaggen.alleenLezen = true;
  const voor = app.acties.length;
  const r1 = await api("PATCH", `/api/v1/sheets/${liggerId}/inputs`, { name: "materiaal", value: "2" });
  meld(r1.status === 423 && r1.data.error.code === "READ_ONLY", "alleen-lezen: mutatie 423");
  meld((await api("POST", "/api/v1/project/save-as", { path: "C:/proef/x" })).status === 423, "alleen-lezen: bestand schrijven 423");
  meld((await api("POST", "/api/v1/export/ifc", { format: "ifc", path: "C:/proef/y.ifc" })).status === 423, "alleen-lezen: export 423");
  meld((await api("PATCH", "/api/v1/settings", { theme: "light" })).status === 423, "alleen-lezen: instellingen 423");
  meld((await api("GET", "/api/v1/project")).status === 200 && (await api("GET", "/api/v1/export/ifc?format=ifcx")).status === 200, "alleen-lezen: lezen mag");
  meld((await api("PUT", "/api/v1/view", { view: "print-preview" })).status === 200, "alleen-lezen: weergave kiezen mag");
  meld(app.acties.length === voor, "alleen-lezen: geen store-actie");
  vlaggen.alleenLezen = false;
  vlaggen.gepauzeerd = true;
  const p = await api("GET", "/api/v1/project");
  meld(p.status === 503 && p.data.error.code === "PAUSED", "gepauzeerd: 503");
  meld((await api("GET", "/api/v1/tools")).status === 200 && (await api("GET", "/api/v1/openapi.json")).status === 200, "gepauzeerd: tools en specificatie blijven");
  vlaggen.gepauzeerd = false;
}

// ── 9. Door de requesthandler ───────────────────────────────────────────────
console.log("Requesthandler:");
{
  const antwoorden = [];
  const handler = maakRequestHandler({
    emit: (event, payload) => { antwoorden.push({ event, ...payload }); },
    verwerk: (body) => verwerkMcpBericht(body, { tools: MCP_TOOLS, serverInfo: { name: "x", version: "0" }, context }),
    verwerkRest: (m, pad, body) => verwerkRest(m, pad, body, deps),
    sessies: maakSessies(),
  });
  await handler({ id: 1, body: "", kind: "rest", method: "GET", path: "/api/v1/project" });
  const a = antwoorden.find((x) => x.id === 1);
  meld(a?.status === 200 && JSON.parse(a.body).projectName !== undefined && a.sessionId === undefined, "REST zonder MCP-sessie: 200");
  await handler({ id: 2, body: JSON.stringify({ templateId: "bestaat-niet" }), kind: "rest", method: "POST", path: "/api/v1/sheets" });
  meld(antwoorden.find((x) => x.id === 2)?.status === 404, "de status van rest.ts gaat mee");
  const zonderRest = maakRequestHandler({ emit: (e, p) => { antwoorden.push({ e, ...p }); }, verwerk: async () => "", sessies: maakSessies() });
  await zonderRest({ id: 3, body: "", kind: "rest", method: "GET", path: "/api/v1/project" });
  meld(antwoorden.find((x) => x.id === 3)?.status === 404, "zonder REST-afhandeling: 404");
}

console.log(`\n${aantal - fouten} van ${aantal} controles goed.`);
process.exit(fouten === 0 ? 0 : 1);
