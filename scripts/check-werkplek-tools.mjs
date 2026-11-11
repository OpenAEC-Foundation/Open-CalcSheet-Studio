/**
 * De tools van de assistent in de werkplek van de OpenAEC SuperCloud
 * (packages/desktop/public/mcp-tools.json) moeten gelijk zijn aan wat
 * `window.__OPDS_APP__.definitions()` geeft: de MCP-tools zonder de tools die
 * bestanden schrijven. Bijwerken: node scripts/werkplek-tools.mjs
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const r = spawnSync(process.execPath, [fileURLToPath(new URL("./werkplek-tools.mjs", import.meta.url)), "--check"], { stdio: "inherit" });
process.exit(r.status ?? 1);
