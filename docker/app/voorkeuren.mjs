/**
 * Zet bij de start van de app-container de instellingen uit de omgeving in
 * preferences.json van de app (de plugin-store van Tauri, zie src/store.ts en
 * src/mcp/brug.ts). Wat er al staat, blijft staan; alleen wat in de omgeving gezet is,
 * gaat ervoor.
 *
 *   OCSS_TAAL        taal van de app: en, nl, lt, … ("auto" volgt het systeem)
 *   OCSS_THEMA       thema: light, dark, high-contrast-dark, …
 *   OCSS_MCP_TOKEN   het token van de MCP-server en REST-API (64 hextekens); zonder
 *                    maakt de app er bij de eerste start zelf een
 *
 * De MCP-server luistert in de container op 127.0.0.1:3879; start.sh zet die door
 * naar poort 3001 voor het interne netwerk.
 *
 *   node voorkeuren.mjs <pad van preferences.json>
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const pad = process.argv[2];
let voorkeuren = {};
if (existsSync(pad)) {
  try {
    voorkeuren = JSON.parse(readFileSync(pad, "utf8"));
  } catch {
    console.error(`[voorkeuren] ${pad} is geen geldige JSON; begint opnieuw`);
  }
}
const env = process.env;
if (env.OCSS_TAAL) voorkeuren.language = env.OCSS_TAAL;
if (env.OCSS_THEMA) voorkeuren.theme = env.OCSS_THEMA;
if (env.OCSS_MCP_TOKEN) {
  if (!/^[0-9a-f]{64}$/i.test(env.OCSS_MCP_TOKEN)) {
    console.error("[voorkeuren] OCSS_MCP_TOKEN moet 64 hextekens zijn (openssl rand -hex 32)");
    process.exit(1);
  }
  voorkeuren.mcpToken = env.OCSS_MCP_TOKEN.toLowerCase();
}
voorkeuren.mcpAan = true;
voorkeuren.mcpPoort = 3879;
mkdirSync(dirname(pad), { recursive: true });
writeFileSync(pad, JSON.stringify(voorkeuren, null, 2));
