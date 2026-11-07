/**
 * Controlescript voor de MCP-server van de app (packages/desktop/src/mcp/).
 *
 * Toetst de TypeScript-kant zonder webview en zonder Tauri: de JSON-RPC-
 * afhandeling (initialize, tools/list, tools/call), de sessies en de tools
 * zelf, op een nagebouwde projectstore in het geheugen. De Rust-brug heeft
 * eigen tests (cargo test, src-tauri/src/mcp_bridge.rs).
 *
 *   koppeling        adres altijd 127.0.0.1, poortgrenzen, token van 64
 *                    hextekens, de client-configuratie (header achteraan)
 *   dispatcher       initialize, ping, notificaties, tools/list, onbekende
 *                    methode, onleesbare body
 *   schema           onbekende en ontbrekende argumenten, verkeerde soort
 *   pauze en         een gepauzeerde koppeling doet niets; alleen-lezen
 *   alleen-lezen     blokkeert mutaties, niet het lezen en doorrekenen
 *   tools            project_get, project_set_data, modules_list, sheet_add,
 *                    sheet_get, sheet_set_input, sheet_set_source,
 *                    sheet_rename, sheet_select, sheet_evaluate, sheet_remove,
 *                    calc_evaluate; elke mutatie via een store-actie
 *   frame_solve      de 2D-raamwerkkern: portalen tegen gesloten oplossingen
 *                    (twee scharnieren, ingeklemd, driescharnier met helling),
 *                    een vrij raamwerk, combinaties, profielen, evenwicht en
 *                    de meldingen bij een fout
 *   sessies          initialize geeft een sessie; zonder sessie 400, met een
 *                    onbekende 404; een notificatie krijgt een leeg antwoord
 *
 * Node 24 laadt de .ts-bestanden rechtstreeks (typen worden weggestreept).
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 *
 * Draaien:  node scripts/check-mcp.mjs
 */
import { verwerkMcpBericht, controleerSchema } from "../packages/desktop/src/mcp/dispatcher.ts";
import { MCP_TOOLS, vergeetUitkomsten } from "../packages/desktop/src/mcp/tools.ts";
import { maakRequestHandler, maakSessies } from "../packages/desktop/src/mcp/requestHandler.ts";
import {
  MCP_STANDAARD_POORT,
  MCP_SERVERNAAM,
  claudeCodeCommando,
  clientConfiguratie,
  geldigePoort,
  mcpAdres,
  nieuwToken,
} from "../packages/desktop/src/mcp/koppeling.ts";
import { maakApp, maakContext, PROJECT_ID, RAPPORT_ID } from "./lib/mcpproef.mjs";

let fouten = 0;
let aantal = 0;
const meld = (ok, wat, detail = "") => {
  aantal++;
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};
const gelijk = (a, b, wat) => meld(JSON.stringify(a) === JSON.stringify(b), wat, `${JSON.stringify(a)} tegen ${JSON.stringify(b)}`);

// Een projectstore in het geheugen (scripts/lib/mcpproef.mjs).
const app = maakApp();
const vlaggen = { alleenLezen: false, gepauzeerd: false };
const deps = {
  tools: MCP_TOOLS,
  serverInfo: { name: MCP_SERVERNAAM, version: "0.0.0-check" },
  context: () => maakContext(app.omgeving, vlaggen)(),
};

let volgnummer = 0;
/** Eén JSON-RPC-request door de dispatcher; geeft het geparste antwoord. */
async function rpc(method, params) {
  const body = await verwerkMcpBericht(JSON.stringify({ jsonrpc: "2.0", id: ++volgnummer, method, params }), deps);
  return JSON.parse(body);
}
/** tools/call; geeft {isError, data} met data = structuredContent. */
async function roep(naam, args = {}) {
  const r = await rpc("tools/call", { name: naam, arguments: args });
  if (r.error) return { rpcFout: r.error, isError: true, data: null };
  return { isError: r.result.isError, data: r.result.structuredContent, tekst: r.result.content?.[0]?.text };
}

// ── 1. Koppeling ──────────────────────────────────────────────────────────────
console.log("Koppeling:");
{
  gelijk(mcpAdres(3879), "http://127.0.0.1:3879/mcp", "adres is loopback met /mcp");
  meld(MCP_STANDAARD_POORT === 3879, "standaardpoort 3879");
  meld(geldigePoort(3879) && geldigePoort(65535) && geldigePoort(1024), "geldige poorten");
  meld(!geldigePoort(80) && !geldigePoort(70000) && !geldigePoort(3879.5) && !geldigePoort("3879"), "ongeldige poorten geweigerd");
  const t = nieuwToken();
  meld(/^[0-9a-f]{64}$/.test(t) && t !== nieuwToken(), "token: 64 hextekens, elke keer anders");
  const cmd = claudeCodeCommando(3879, "abc");
  meld(
    cmd.startsWith(`claude mcp add --transport http --scope user ${MCP_SERVERNAAM} http://127.0.0.1:3879/mcp`) &&
      cmd.endsWith(`--header "Authorization: Bearer abc"`),
    "opdrachtregel: naam en adres vóór de header",
    cmd,
  );
  const cfg = JSON.parse(clientConfiguratie(3879, "abc")).mcpServers[MCP_SERVERNAAM];
  gelijk(cfg, { type: "http", url: "http://127.0.0.1:3879/mcp", headers: { Authorization: "Bearer abc" } }, "JSON-configuratie");
}

// ── 2. Dispatcher ─────────────────────────────────────────────────────────────
console.log("Dispatcher:");
{
  const init = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  meld(init.result?.protocolVersion === "2025-03-26", "initialize echoot een bekende protocolversie");
  meld((await rpc("initialize", { protocolVersion: "1999-01-01" })).result?.protocolVersion === "2025-06-18", "onbekende versie → de eigen");
  gelijk(init.result?.serverInfo, { name: MCP_SERVERNAAM, version: "0.0.0-check" }, "serverInfo");
  meld(init.result?.capabilities?.tools !== undefined, "capabilities.tools");
  meld(typeof init.result?.instructions === "string" && init.result.instructions.includes("project_get"), "instructions noemen project_get");
  gelijk(await verwerkMcpBericht(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }), deps), "", "notificatie: geen antwoord");
  gelijk((await rpc("ping")).result, {}, "ping");
  const lijst = (await rpc("tools/list")).result.tools;
  const namen = lijst.map((t) => t.name);
  const verwacht = [
    "project_get", "project_set_data", "modules_list", "sheet_add", "sheet_get", "sheet_set_source",
    "sheet_set_input", "sheet_rename", "sheet_remove", "sheet_select", "sheet_evaluate", "calc_evaluate",
  ];
  meld(verwacht.every((n) => namen.includes(n)), "tools/list: de twaalf oorspronkelijke tools", verwacht.filter((n) => !namen.includes(n)).join());
  meld(namen.length === MCP_TOOLS.length && new Set(namen).size === namen.length, `tools/list: alle ${MCP_TOOLS.length} tools, elk één keer`);
  meld(lijst.every((t) => t.inputSchema?.type === "object" && typeof t.description === "string" && t.description.length > 20), "elke tool: objectschema en beschrijving");
  meld(lijst.every((t) => typeof t.annotations?.readOnlyHint === "boolean"), "elke tool: annotaties");
  meld((await rpc("bestaat/niet")).error?.code === -32601, "onbekende methode: -32601");
  meld(JSON.parse(await verwerkMcpBericht("{kapot", deps)).error?.code === -32700, "onleesbare body: -32700");
  meld(JSON.parse(await verwerkMcpBericht("[]", deps)).error?.code === -32600, "batch-array: -32600");
  meld((await rpc("tools/call", { name: "bestaat_niet", arguments: {} })).error?.code === -32602, "onbekende tool: -32602");
}

// ── 3. Schema ─────────────────────────────────────────────────────────────────
console.log("Schema:");
{
  const r1 = await roep("project_get", { onzin: 1 });
  meld(r1.isError && r1.data.code === "VALIDATION", "onbekend argument geweigerd", JSON.stringify(r1.data));
  const r2 = await roep("sheet_rename", { name: "x" });
  meld(r2.isError && r2.data.code === "VALIDATION" && /id is required/.test(r2.data.error), "ontbrekend verplicht argument", JSON.stringify(r2.data));
  const r3 = await roep("project_get", { evaluate: "ja" });
  meld(r3.isError && /boolean/.test(r3.data.error), "verkeerde soort", JSON.stringify(r3.data));
  meld(controleerSchema({ type: ["string", "number"] }, 3) === null && controleerSchema({ type: ["string", "number"] }, true) !== null, "samengestelde soort");
  meld(controleerSchema({ type: "integer", minimum: 1 }, 0) !== null && controleerSchema({ type: "integer" }, 1.5) !== null, "integer en minimum");
}

// ── 4. Tools ─────────────────────────────────────────────────────────────────
console.log("Tools:");
let liggerId = null;
{
  const p = await roep("project_get");
  meld(!p.isError && p.data.projectName === "Proefproject" && p.data.sheets.length === 0, "project_get: leeg project");
  const cc = p.data.projectData.find((v) => v.name === "CC");
  meld(cc && cc.type === "choice" && cc.value === "2" && cc.options.length === 3, "project_get: CC met keuzes", JSON.stringify(cc));
  meld(p.data.activeView === "project-data" && p.data.unsaved === false, "project_get: weergave en opgeslagen-stand");
  meld(typeof p.tekst === "string" && JSON.parse(p.tekst).projectName === "Proefproject", "resultaat ook als tekst");

  const m = await roep("modules_list");
  const ligger = m.data.modules.find((x) => x.templateId === "ligger");
  meld(ligger && ligger.available === true && ligger.kind === "module", "modules_list: ligger beschikbaar");
  meld(m.data.modules.some((x) => x.templateId === "balklaag" && x.status === "gereed"), "modules_list: balklaag met status");

  const s1 = await roep("project_set_data", { name: "CC", value: "CC3" });
  meld(!s1.isError && s1.data.value === "3" && app.s.gegevens.CC === "3", "project_set_data: label 'CC3' wordt waarde 3", JSON.stringify(s1.data));
  const s2 = await roep("project_set_data", { name: "CC", value: "7" });
  meld(s2.isError && s2.data.code === "VALIDATION" && s2.data.data.options.length === 3, "project_set_data: onbekende keuze geweigerd");
  const s3 = await roep("project_set_data", { name: "bestaat_niet", value: "1" });
  meld(s3.isError && s3.data.code === "VALIDATION", "project_set_data: alleen bestaande velden");
  const s4 = await roep("project_set_data", { name: "project_nummer", value: 2026 });
  meld(!s4.isError && app.s.gegevens.project_nummer === "2026", "project_set_data: tekstveld, getal wordt tekst");

  const a = await roep("sheet_add", { templateId: "ligger" });
  liggerId = a.data?.id;
  meld(!a.isError && a.data.name === "Beam 1" && app.s.activeId === liggerId, "sheet_add: module, korte naam in de taal van de app, geselecteerd", JSON.stringify(a.data?.name));
  meld(a.data.inputs.some((v) => v.name === "materiaal" && v.kind === "choice"), "sheet_add: geeft de invoervelden");
  meld((await roep("sheet_add", { templateId: "bestaat_niet" })).data.code === "NOT_FOUND", "sheet_add: onbekende module");
  meld((await roep("sheet_add", { templateId: "ligger", source: "x" })).data.code === "VALIDATION", "sheet_add: templateId en source niet samen");

  const g = await roep("sheet_get", { id: liggerId, evaluate: false });
  const mat = g.data.inputs.find((v) => v.name === "materiaal");
  meld(mat && mat.value === "1" && mat.isSet === false && mat.selectedText === "Hout", "sheet_get: keuzelijst met beginwaarde", JSON.stringify(mat));
  meld(typeof g.data.source === "string" && g.data.source.length > 1000 && g.data.result === undefined, "sheet_get: tekst, zonder uitkomst bij evaluate=false");

  const zonderId = await roep("sheet_get", { evaluate: false });
  meld(zonderId.data?.id === liggerId, "sheet_get zonder id: het open blad");

  const i1 = await roep("sheet_set_input", { id: liggerId, name: "materiaal", value: "Staal" });
  meld(!i1.isError && app.s.exemplaren[0].waarden.materiaal === "2", "sheet_set_input: keuze op tekst", JSON.stringify(i1.data));
  const i2 = await roep("sheet_set_input", { id: liggerId, name: "materiaal", value: "Beton" });
  meld(i2.isError && i2.data.code === "VALIDATION" && i2.data.data.options.length === 2, "sheet_set_input: onbekende keuze geweigerd");
  const i3 = await roep("sheet_set_input", { id: liggerId, values: { materiaal: "1", bestaat_niet: "3" } });
  meld(i3.isError && app.s.exemplaren[0].waarden.materiaal === "2", "sheet_set_input: één fout veld ⇒ niets geschreven");
  meld((await roep("sheet_set_input", { id: liggerId })).isError, "sheet_set_input: zonder waarden geweigerd");
  meld((await roep("sheet_set_input", { id: "ex-999", name: "a", value: 1 })).data.code === "NOT_FOUND", "sheet_set_input: onbekend blad");

  const e = await roep("sheet_evaluate", { id: liggerId });
  meld(!e.isError && typeof e.data.title === "string" && e.data.title.length > 0, "sheet_evaluate: titel", JSON.stringify(e.data?.title ?? e.data));
  meld(e.data && "uc" in e.data && "passes" in e.data && typeof e.data.numbers === "object", "sheet_evaluate: uc, oordeel en getallen");
  const [eerste, eersteWaarde] = Object.entries(e.data.numbers)[0] ?? [];
  const e2 = await roep("sheet_evaluate", { id: liggerId, names: [eerste, "bestaat_niet"] });
  gelijk(Object.keys(e2.data.numbers ?? {}), [eerste, "bestaat_niet"], "sheet_evaluate: alleen de gevraagde getallen");
  meld(eerste !== undefined && e2.data.numbers[eerste] === eersteWaarde && e2.data.numbers.bestaat_niet === null, "sheet_evaluate: waarde en null", JSON.stringify(e2.data.numbers));

  const p2 = await roep("project_get");
  const blad = p2.data.sheets.find((x) => x.id === liggerId);
  meld(blad.evaluated === true && blad.uc === e.data.uc && blad.module === "Beam (timber or steel)", "project_get: uitkomst bekend na sheet_evaluate", JSON.stringify(blad));
  await roep("sheet_set_input", { id: liggerId, name: "materiaal", value: "1" });
  const blad2 = (await roep("project_get")).data.sheets.find((x) => x.id === liggerId);
  meld(blad2.evaluated === false && blad2.uc === null, "project_get: andere invoer ⇒ uitkomst niet meer bekend");
  const blad3 = (await roep("project_get", { evaluate: true })).data.sheets.find((x) => x.id === liggerId);
  meld(blad3.evaluated === true, "project_get evaluate=true rekent alles door");

  const leeg = await roep("sheet_add", { name: "Eigen blad", source: '"Eigen\na = ? mm\nb = 2*a' });
  const eigenId = leeg.data.id;
  meld(!leeg.isError && leeg.data.name === "Eigen blad" && leeg.data.templateId === "leeg", "sheet_add: leeg blad met eigen naam en tekst", JSON.stringify(leeg.data));
  meld(leeg.data.inputs.length === 1 && leeg.data.inputs[0].name === "a" && leeg.data.inputs[0].unit === "mm", "sheet_add: invoerveld uit eigen tekst");
  const bron = await roep("sheet_set_source", { id: eigenId, source: '"Eigen\na = ? mm\nc = ? kN\nb = 2*a' });
  meld(!bron.isError && bron.data.inputs.map((v) => v.name).join() === "a,c", "sheet_set_source: nieuwe invoervelden");
  await roep("sheet_set_input", { id: eigenId, name: "a", value: 21 });
  const ev = await roep("sheet_evaluate", { id: eigenId, names: ["b"] });
  meld(ev.data.numbers?.b === 42, "sheet_evaluate: rekent met de gezette invoer", JSON.stringify(ev.data));
  meld((await roep("sheet_rename", { id: eigenId, name: "  Nieuw  " })).data.name === "Nieuw" && app.s.exemplaren[1].naam === "Nieuw", "sheet_rename");
  meld(!(await roep("sheet_select", { id: "project" })).isError && app.s.activeId === PROJECT_ID, "sheet_select: projectgegevens");
  meld(!(await roep("sheet_select", { id: "report" })).isError && app.s.activeId === RAPPORT_ID, "sheet_select: rapport");
  meld(!(await roep("sheet_select", { id: eigenId })).isError && app.s.activeId === eigenId, "sheet_select: blad");
  meld((await roep("sheet_select", { id: "ex-999" })).data.code === "NOT_FOUND", "sheet_select: onbekend blad");
  const kapot = await roep("sheet_set_source", { id: eigenId, source: '"Kapot\n#if\n' });
  meld(!kapot.isError, "sheet_set_source: ook een tekst met fouten komt erin");
  const weg = await roep("sheet_remove", { id: eigenId });
  meld(!weg.isError && app.s.exemplaren.length === 1 && weg.data.remainingSheets === 1, "sheet_remove");

  const toegestaan = new Set(["voegToe", "hernoem", "verwijder", "selecteer", "zetBron", "zetWaarde", "zetGegeven", "zetProjectNaam"]);
  meld(app.acties.length > 0 && app.acties.every((a) => toegestaan.has(a)), "elke mutatie liep via een store-actie", app.acties.join());
}

// ── 5. calc_evaluate ─────────────────────────────────────────────────────────
console.log("calc_evaluate:");
{
  const voorAantal = app.acties.length;
  const tekst = [
    '"Proefblad — NEN-EN 1990',
    "'Een losse berekening.",
    "L = ? m",
    "@select soort \"Soort\"",
    "  Licht = 1",
    "  Zwaar = 2",
    "@end",
    "q = 2*soort",
    "M = q*L^2/8",
    "f = K_FI*M",
    "UC_max = M/(5 m^2)",
  ].join("\n");
  const r = await roep("calc_evaluate", { source: tekst, values: { L: 4, soort: "2" } });
  meld(!r.isError, "calc_evaluate: rekent", JSON.stringify(r.data));
  const regels = r.data.lines;
  const M = regels.find((x) => x.name === "M");
  // q = 2·soort = 4, M = 4·4²/8 = 8 m², in de eenheid van L.
  meld(M && M.type === "assignment" && M.value === 8 && M.unit === "m^2", "toekenning met waarde en eenheid", JSON.stringify(M));
  meld(regels.some((x) => x.type === "input" && x.name === "L" && x.value === "4"), "invoerregel met de gegeven waarde");
  meld(regels.some((x) => x.type === "select" && x.name === "soort" && x.selected === "2"), "keuzelijst met de gekozen waarde");
  meld(regels[0].type === "heading" && r.data.title === "Proefblad" && r.data.norm === "NEN-EN 1990", "kop, titel en norm", JSON.stringify(regels[0]));
  meld(r.data.uc === 1.6 && r.data.passes === false, "UC_max en oordeel (zonder slotzin beslist de UC)", `${r.data.uc} ${r.data.passes}`);
  const f = regels.find((x) => x.name === "f");
  meld(f && Math.abs(f.value - 8 * 1.1) < 1e-9, "projectgegevens in de scope (CC3 ⇒ K_FI = 1,1)", JSON.stringify(f));
  const zonder = await roep("calc_evaluate", { source: "f = K_FI*2", useProjectData: false });
  meld(!zonder.isError && zonder.data.errorLines === 1, "useProjectData=false: K_FI onbekend", JSON.stringify(zonder.data));
  const kort = await roep("calc_evaluate", { source: tekst, maxLines: 2 });
  meld(kort.data.lines.length === 2 && kort.data.truncated === true, "maxLines kapt af");
  meld(app.acties.length === voorAantal, "calc_evaluate wijzigt het project niet");
}

// ── 5b. frame_solve ──────────────────────────────────────────────────────────
console.log("frame_solve:");
{
  const voorAantal = app.acties.length;
  const dicht = (a, b, tol = 1e-4) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
  // De gesloten oplossingen verwaarlozen de rek: heel stijf in de lengte.
  const L = 10, h = 5, EIk = 20000, EIr = 40000, q = 4, H = 10, STIJF = 1e11;
  const k = (EIr / EIk) * (h / L);
  const portaal = (voeten, lasten) => ({
    portal: { span: L, height: h, feet: voeten, column: { EI: EIk, EA: STIJF }, rafter: { EI: EIr, EA: STIJF }, loads: lasten },
  });

  // Portaal met twee scharnieren, q op de regel: M_k = −qL²/(4(2k + 3)), H_A = −M_k/h, V_A = qL/2.
  const twee = await roep("frame_solve", portaal("pinned", [{ case: "G", roof: q }, { case: "W", wallLeft: 2, wallRight: -1 }]));
  meld(!twee.isError, "frame_solve: portaal met twee scharnieren rekent", JSON.stringify(twee.data).slice(0, 200));
  const g = twee.data.results.find((r) => r.combination === "G");
  const Mk2 = -(q * L * L) / (4 * (2 * k + 3));
  meld(dicht(g.members[1].M_start, Mk2) && dicht(g.members[0].M_end, Mk2), "portaal 2 scharnieren: knoopmoment −qL²/(4(2k + 3))", `${g.members[1].M_start} tegen ${Mk2}`);
  meld(dicht(g.reactions[0].Rx, -Mk2 / h) && dicht(g.reactions[0].Ry, (q * L) / 2), "en H_A = qL²/(4h(2k + 3)), V_A = qL/2", JSON.stringify(g.reactions[0]));
  meld(dicht(g.members[0].M_start, 0, 1e-9) && dicht(g.members[1].M_mid, (q * L * L) / 8 + Mk2), "M aan de voet 0, in het veld qL²/8 + M_k");
  meld(twee.data.model.loads.filter((l) => l.case === "G").length === 1, "een gelijke dakbelasting is één last over de hele regel");
  meld(twee.data.results.length === 2 && Array.isArray(twee.data.envelope), "zonder combinaties: een uitkomst per lastgeval, met de omhullende");

  // Ingeklemd portaal: M_k = −qL²/(6(k + 2)), M_voet = qL²/(12(k + 2)).
  const klem = await roep("frame_solve", portaal("fixed", [{ case: "G", roof: q }]));
  const kg = klem.data.results[0];
  meld(dicht(kg.members[1].M_start, -(q * L * L) / (6 * (k + 2))) && dicht(kg.members[0].M_start, (q * L * L) / (12 * (k + 2))), "ingeklemd portaal: knoop −qL²/(6(k + 2)), voet qL²/(12(k + 2))", `${kg.members[1].M_start} ${kg.members[0].M_start}`);
  meld(dicht(kg.reactions[0].M, (q * L * L) / (12 * (k + 2))), "het inklemmingsmoment als reactie");

  // Combinaties zijn lineair: 1,2·G + 1,5·W.
  const comb = await roep("frame_solve", {
    ...portaal("pinned", [{ case: "G", roof: q }, { case: "W", wallLeft: 2, wallRight: -1 }]),
    combinations: [{ name: "6.10b", factors: { G: 1.2, W: 1.5 } }],
  });
  const w = twee.data.results.find((r) => r.combination === "W");
  meld(comb.data.results.length === 1 && dicht(comb.data.results[0].members[1].M_start, 1.2 * g.members[1].M_start + 1.5 * w.members[1].M_start), "een combinatie is de som van de lastgevallen maal hun factor");

  // Vrije invoer: een horizontale knooplast H op de knie. M_k = H·h/2, δ = H·h²/12·(2h/EI_k + L/EI_r).
  const vrij = await roep("frame_solve", {
    nodes: [{ x: 0, y: 0 }, { x: 0, y: h }, { x: L, y: h }, { x: L, y: 0 }],
    members: [{ from: 1, to: 2, EI: EIk, EA: STIJF }, { from: 2, to: 3, EI: EIr, EA: STIJF }, { from: 3, to: 4, EI: EIk, EA: STIJF }],
    supports: [{ node: 1 }, { node: 4, type: "pinned" }],
    loads: [{ kind: "node", node: 2, direction: "x", value: H }],
  });
  const vr = vrij.data.results[0];
  const delta = ((H * h * h) / 12) * ((2 * h) / EIk + L / EIr) * 1000;
  meld(dicht(vr.members[0].M_end, (H * h) / 2) && dicht(vr.reactions[0].Rx, -H / 2), "vrij raamwerk: knoopmoment H·h/2 en H_A = −H/2", JSON.stringify(vr.reactions[0]));
  meld(dicht(vr.displacements[1].ux, delta), "en de zijdelingse verplaatsing in mm", `${vr.displacements[1].ux} tegen ${delta}`);
  meld(vr.secondOrder === (vr.alphaCr !== null && vr.alphaCr < 10), "α_cr en de grens van 10 voor de tweede orde");

  // Driescharnierportaal met helling: H = qL²/(8·f), f de hoogte van de nok boven de voeten.
  const helling = 15, nok = h + (L / 2) * Math.tan((helling * Math.PI) / 180);
  const drie = await roep("frame_solve", {
    portal: { span: L, height: h, pitch: helling, ridgeHinge: true, column: { EI: EIk, EA: STIJF }, rafter: { EI: EIr, EA: STIJF }, loads: [{ case: "S", roof: q }] },
  });
  const dr = drie.data.results[0];
  meld(drie.data.model.nodes.length === 5 && dicht(drie.data.model.nodes[2].y, nok), "het hellende portaal heeft een nok op h + L/2·tan α");
  meld(dicht(dr.reactions[0].Rx, (q * L * L) / (8 * nok)) && dicht(dr.members[1].M_end, 0, 1e-9), "driescharnierportaal: H = qL²/(8·f), M in de nok 0", JSON.stringify(dr.reactions[0]));

  // Profielen uit de tabel en het eigen gewicht: E·I_y, E·A en 78,5 kN/m³.
  const prof = await roep("frame_solve", {
    portal: { span: 20, height: 6, pitch: 10, feet: "fixed", column: { profile: "HEA 300" }, rafter: { profile: "ipe400" }, loads: [{ case: "S", roof: 3.2 }] },
    selfWeight: "G",
  });
  const kol = prof.data.model.members[0];
  meld(kol.profile === "HEA 300" && dicht(kol.EI, 210e6 * 18260e-8, 1e-3) && dicht(kol.weight, 78.5 * 112.5e-4, 1e-3), "profiel HEA 300: EI, EA en gewicht uit de tabel", JSON.stringify(kol));
  meld(prof.data.model.members[1].profile === "IPE 400", "een profielnaam zonder spatie en in kleine letters wordt gevonden");
  const S = prof.data.results.find((r) => r.combination === "S");
  const G = prof.data.results.find((r) => r.combination === "G");
  const gewicht = prof.data.model.members.reduce((s, m) => s + m.weight * m.L, 0);
  meld(dicht(S.reactions.reduce((s, r) => s + r.Ry, 0), 3.2 * 20) && dicht(G.reactions.reduce((s, r) => s + r.Ry, 0), gewicht, 1e-3), "evenwicht: ΣR_y is de dakbelasting en het eigen gewicht");

  // Fouten worden meldingen, geen uitkomsten: {code, error} in de tekst.
  const foutVan = (x) => { try { return JSON.parse(x.tekst ?? "{}"); } catch { return {}; } };
  const mechanisme = await roep("frame_solve", { portal: { span: L, height: h, ridgeHinge: true, feet: "pinned", column: { EI: EIk, EA: EIk }, loads: [] }, buckling: false });
  meld(!mechanisme.isError, "driescharnierportaal zonder lasten is geen mechanisme");
  const los = await roep("frame_solve", {
    nodes: [{ x: 0, y: 0 }, { x: 0, y: h }], members: [{ from: 1, to: 2, EI: 1, EA: 1 }], supports: [{ node: 1, type: "roller" }],
  });
  meld(los.isError && foutVan(los).code === "VALIDATION" && /mechanism/.test(foutVan(los).error), "een mechanisme geeft een melding", los.tekst);
  const onbekend = await roep("frame_solve", { portal: { span: L, height: h, column: { profile: "HEA 999" } } });
  meld(onbekend.isError && /profile table/.test(foutVan(onbekend).error), "een onbekend profiel geeft een melding", onbekend.tekst);
  const geval = await roep("frame_solve", { ...portaal("pinned", [{ case: "G", roof: q }]), combinations: [{ factors: { Q: 1.5 } }] });
  meld(geval.isError && /no load case "Q"/.test(foutVan(geval).error), "een combinatie met een onbekend lastgeval geeft een melding", geval.tekst);
  const knoop = await roep("frame_solve", { nodes: [{ x: 0, y: 0 }], members: [{ from: 1, to: 2, EI: 1, EA: 1 }], supports: [{ node: 1 }] });
  meld(knoop.isError && /no such node/.test(foutVan(knoop).error), "een staaf naar een knoop die niet bestaat geeft een melding", knoop.tekst);
  meld(app.acties.length === voorAantal, "frame_solve wijzigt het project niet");
}

// ── 6. Pauze en alleen-lezen ─────────────────────────────────────────────────
console.log("Pauze en alleen-lezen:");
{
  vlaggen.alleenLezen = true;
  const voor = app.acties.length;
  const a = await roep("sheet_add", { templateId: "ligger" });
  meld(a.isError && a.data.code === "READ_ONLY", "alleen-lezen: sheet_add geweigerd");
  meld((await roep("sheet_set_input", { id: liggerId, name: "materiaal", value: "2" })).data.code === "READ_ONLY", "alleen-lezen: sheet_set_input geweigerd");
  meld(!(await roep("project_get")).isError && !(await roep("sheet_evaluate", { id: liggerId, numbers: false })).isError, "alleen-lezen: lezen en doorrekenen mag");
  meld(!(await roep("sheet_select", { id: "project" })).isError, "alleen-lezen: selecteren mag (wijzigt het project niet)");
  meld(app.acties.length === voor + 1, "alleen-lezen: geen andere store-actie");
  vlaggen.alleenLezen = false;
  vlaggen.gepauzeerd = true;
  const p = await roep("project_get");
  meld(p.isError && p.data.code === "PAUSED", "gepauzeerd: ook lezen geeft een melding");
  meld(!(await rpc("tools/list")).error, "gepauzeerd: tools/list blijft werken");
  vlaggen.gepauzeerd = false;
}

// ── 7. Sessies ───────────────────────────────────────────────────────────────
console.log("Sessies:");
{
  vergeetUitkomsten();
  const antwoorden = [];
  const handler = maakRequestHandler({
    emit: (event, payload) => {
      antwoorden.push({ event, ...payload });
    },
    verwerk: (body) => verwerkMcpBericht(body, deps),
    sessies: maakSessies(() => `sessie-${antwoorden.length}`),
  });
  const stuur = async (id, bericht, sessionId) => {
    await handler({ id, body: JSON.stringify({ jsonrpc: "2.0", ...bericht }), ...(sessionId !== undefined ? { sessionId } : {}) });
    return antwoorden.find((a) => a.id === id);
  };
  const init = await stuur(1, { id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  meld(init.event === "mcp://response" && typeof init.sessionId === "string" && init.status === undefined, "initialize: sessie-id terug", JSON.stringify(init));
  const zonder = await stuur(2, { id: 2, method: "tools/list" });
  meld(zonder.status === 400 && JSON.parse(zonder.body).error.code === -32600, "zonder sessie: 400 met JSON-RPC-fout");
  const onbekend = await stuur(3, { id: 3, method: "tools/list" }, "verzonnen");
  meld(onbekend.status === 404 && onbekend.body === "", "onbekende sessie: 404 zonder body");
  const goed = await stuur(4, { id: 4, method: "tools/call", params: { name: "project_get", arguments: {} } }, init.sessionId);
  meld(goed.status === undefined && JSON.parse(goed.body).result.structuredContent.projectName === "Proefproject", "met sessie: project_get");
  const notificatie = await stuur(5, { method: "notifications/initialized" }, init.sessionId);
  meld(notificatie && notificatie.body === "" && notificatie.status === undefined, "notificatie: leeg antwoord, wel verstuurd");
  const sessies = maakSessies(() => `s${Math.random()}`, 2);
  const eerste = sessies.open();
  sessies.open();
  sessies.open();
  meld(sessies.size() === 2 && !sessies.has(eerste), "boven het maximum verdwijnt de oudste sessie");
}

console.log(`\n${aantal - fouten} van ${aantal} controles goed.`);
process.exit(fouten === 0 ? 0 : 1);
