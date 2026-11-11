/**
 * De tools van de assistent in de werkplek van de OpenAEC SuperCloud, als
 * bestand: packages/desktop/public/mcp-tools.json. Zelfde lijst als
 * `window.__OPDS_APP__.definitions()` (packages/desktop/src/mcp/werkplek.ts),
 * dus dezelfde tools als de MCP-server, zonder de tools die bestanden schrijven.
 *
 *   node scripts/werkplek-tools.mjs           schrijven
 *   node scripts/werkplek-tools.mjs --check   alleen vergelijken (check-alles)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const desktop = fileURLToPath(new URL("../packages/desktop/", import.meta.url));
const require = createRequire(`${desktop}package.json`);
const { createServer } = await import(pathToFileURL(require.resolve("vite")).href);
const doel = `${desktop}public/mcp-tools.json`;

const server = await createServer({
  root: desktop,
  configFile: false,
  logLevel: "error",
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  define: { __LIBRARY_DEV__: '""' },
});
let tekst;
try {
  const { werkplekTools, werkplekDefinitie } = await server.ssrLoadModule("/src/mcp/werkplek.ts");
  tekst = JSON.stringify(werkplekTools().map(werkplekDefinitie), null, 2) + "\n";
} finally {
  await server.close();
}

if (process.argv.includes("--check")) {
  let nu = "";
  try { nu = readFileSync(doel, "utf8"); } catch { /* ontbreekt */ }
  if (nu !== tekst) {
    console.error("packages/desktop/public/mcp-tools.json loopt achter: draai node scripts/werkplek-tools.mjs");
    process.exit(1);
  }
  console.log(`Werkplek-tools: ${JSON.parse(tekst).length} tools, gelijk aan de MCP-server.`);
} else {
  writeFileSync(doel, tekst);
  console.log(`Geschreven: packages/desktop/public/mcp-tools.json (${JSON.parse(tekst).length} tools)`);
}
