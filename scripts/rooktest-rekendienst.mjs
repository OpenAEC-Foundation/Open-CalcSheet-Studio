/**
 * Rooktest van een draaiende rekendienst, bijvoorbeeld het image
 * (docker/rekendienst.Dockerfile) in de release-workflow, vóór het publiceren.
 *
 *   node scripts/rooktest-rekendienst.mjs <adres> <sleutel> [--volledig]
 *
 * Wacht tot /v1/health gezond is, rekent het voorbeeldproject
 * (scripts/fixtures/rapport-voorbeeld.ifccalculation) met een extra blad met een
 * @toets-blok door via REST en via MCP, en maakt er het rapport van als PDF. Met
 * --volledig moeten FEM Studio en de PDF er zijn (in het image altijd); zonder mag een
 * van beide ontbreken, en wordt die stap overgeslagen.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const [adres, sleutel] = process.argv.slice(2);
const volledig = process.argv.includes("--volledig");
if (!adres || !sleutel) {
  console.error("gebruik: node scripts/rooktest-rekendienst.mjs <adres> <sleutel> [--volledig]");
  process.exit(2);
}
const basis = adres.replace(/\/+$/, "");

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + String(detail).slice(0, 500)}`);
};
const post = async (pad, body, koppen = {}) => {
  const r = await fetch(`${basis}${pad}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${sleutel}`, "Content-Type": "application/json", ...koppen },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });
  return { status: r.status, koppen: r.headers, data: await r.json().catch(() => null) };
};

// Gezond worden: hooguit 60 s.
let gezond = null;
for (let i = 0; i < 120 && !gezond; i++) {
  try {
    const r = await fetch(`${basis}/v1/health`, { signal: AbortSignal.timeout(2000) });
    if (r.ok) gezond = await r.json();
  } catch {
    // nog niet
  }
  if (!gezond) await new Promise((r) => setTimeout(r, 500));
}
meld(gezond?.status === "ok", "GET /v1/health", JSON.stringify(gezond));
if (!gezond) process.exit(1);
console.log(`  ${gezond.name} ${gezond.version}: FEM Studio ${gezond.fem}, PDF ${gezond.pdf}`);
if (volledig) meld(gezond.fem === "available" && gezond.pdf === "available", "FEM Studio en de PDF zijn er");

// Het voorbeeldproject met een blad dat FEM Studio iets vraagt.
const project = JSON.parse(readFileSync(join(WORTEL, "scripts/fixtures/rapport-voorbeeld.ifccalculation"), "utf8"));
project.project.exemplaren.push({
  id: "ex-rooktest-toets", naam: "Staalsoorten", templateId: "", waarden: {}, elementen: [],
  source: "\"Staalsoorten\n@toets staal = list_steel_grades\n@end\n",
});
const inhoud = JSON.stringify(project);

const rest = await post("/v1/tools/project_evaluate", { content: inhoud, numbers: false });
const bladen = rest.data?.sheets ?? [];
meld(rest.status === 200 && bladen.length === project.project.exemplaren.length && bladen.filter((b) => b.kind === "calculation").every((b) => b.evaluated),
  `project_evaluate: ${bladen.length} bladen doorgerekend`, JSON.stringify(rest.data).slice(0, 400));
const toets = bladen.find((b) => b.id === "ex-rooktest-toets");
if (gezond.fem === "available") {
  meld(rest.data.fem.available && toets?.fem?.answered === 1, "FEM Studio beantwoordt het @toets-blok", JSON.stringify({ fem: rest.data?.fem, blad: toets?.fem }));
} else {
  meld(toets?.fem?.notComputed === 1, "zonder FEM Studio: het @toets-blok is niet gerekend", JSON.stringify(toets?.fem));
}

// Dezelfde uitkomst via MCP.
const init = await post("/mcp", { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "rooktest", version: "1" } } });
const sessie = init.koppen.get("mcp-session-id");
meld(init.status === 200 && !!sessie, "MCP: initialize met een sessie", init.status);
const viaMcp = await post("/mcp", { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "project_evaluate", arguments: { content: inhoud, numbers: false, fem: false } } }, { "Mcp-Session-Id": sessie });
const mcpBladen = viaMcp.data?.result?.structuredContent?.sheets ?? [];
const zelfde = bladen.filter((b) => b.evaluated && !b.fem).every((b) => {
  const m = mcpBladen.find((x) => x.id === b.id);
  return m && JSON.stringify(m.ucValues) === JSON.stringify(b.ucValues) && m.passes === b.passes;
});
meld(viaMcp.data?.result?.isError === false && zelfde, "MCP: dezelfde UC's als REST", JSON.stringify(viaMcp.data).slice(0, 300));

// Het rapport.
if (gezond.pdf === "available") {
  const t0 = Date.now();
  const pdf = await post("/api/v1/report/pdf", { content: inhoud, fileName: "rapport-voorbeeld.ifccalculation" });
  const bytes = pdf.data?.base64 ? Buffer.from(pdf.data.base64, "base64") : Buffer.alloc(0);
  meld(pdf.status === 200 && bytes.subarray(0, 5).toString("latin1") === "%PDF-" && pdf.data.pages > 2,
    `report_pdf: ${pdf.data?.pages} pagina's, ${Math.round(bytes.length / 1024)} kB in ${((Date.now() - t0) / 1000).toFixed(1)} s`, JSON.stringify({ ...pdf.data, base64: undefined }));
} else {
  console.log("  -- PDF overgeslagen: de dienst heeft geen Chromium of geen pagina's");
}

console.log(fouten === 0 ? "\nRooktest geslaagd." : `\nRooktest gezakt: ${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
