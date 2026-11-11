/**
 * De assistent van de OpenAEC SuperCloud: `window.__OPDS_APP__` met dezelfde
 * tools als de MCP-server van de desktop-app (MCP_TOOLS), via dezelfde weg
 * (`voerToolUit`). Alleen het transport verschilt: een functieaanroep in plaats
 * van HTTP. Zie het contract in OpenAEC-Blueprint, docs/supercloud-koppeling.md.
 *
 * - Tools van de soort `file` (schijf, export, opslaan) staan er niet bij:
 *   openen en opslaan doet de gebruiker in de werkplek zelf, via Docs.
 * - Tools die het project wijzigen (`mutate`) dragen `bevestigen: true`: de
 *   SuperCloud vraagt de gebruiker eerst om toestemming (mens in de lus).
 * - De namen krijgen het voorvoegsel van deze tool (`VOORVOEGSEL`), zodat ze
 *   in een gesprek niet botsen met die van andere tools.
 *
 * Wordt alleen geladen in de werkplek (`window.openaecHost` aanwezig).
 */
import { MCP_SERVERNAAM } from "./koppeling";
import { MCP_TOOLS } from "./tools";
import { voerToolUit } from "./uitvoeren";
import type { McpContext, McpToolDef } from "./contracts";

export const VOORVOEGSEL = "calcsheet_";

interface WerkplekDefinitie {
  name: string;
  description: string;
  inputSchema: object;
  bevestigen?: boolean;
}

declare global {
  interface Window {
    __OPDS_APP__?: {
      tools(): Promise<string[]>;
      definitions(): Promise<WerkplekDefinitie[]>;
      run(name: string, args?: Record<string, unknown>): Promise<unknown>;
    };
  }
}

/** Wat in de werkplek mag: alles behalve schrijven naar schijf en exporteren. */
export function werkplekTools(alle: McpToolDef[] = MCP_TOOLS): McpToolDef[] {
  return alle.filter((t) => t.kind !== "file");
}

export function werkplekDefinitie(t: McpToolDef): WerkplekDefinitie {
  const d: WerkplekDefinitie = { name: VOORVOEGSEL + t.name, description: t.description, inputSchema: t.inputSchema };
  if (t.kind === "mutate") d.bevestigen = true;
  return d;
}

export async function installeerWerkplekTools(versie: string): Promise<void> {
  const { liveOmgeving } = await import("./omgeving");
  const tools = werkplekTools();
  const context = (): McpContext => ({
    omgeving: liveOmgeving,
    alleenLezen: false,
    gepauzeerd: false,
    server: { naam: MCP_SERVERNAAM, versie, poort: 0 },
  });
  window.__OPDS_APP__ = {
    tools: async () => tools.map((t) => VOORVOEGSEL + t.name),
    definitions: async () => tools.map(werkplekDefinitie),
    run: async (name, args = {}) => {
      const def = tools.find((t) => VOORVOEGSEL + t.name === name);
      if (!def) throw new Error(`niet_in_browser: ${name}`);
      const uitkomst = await voerToolUit(def, args, context());
      if (!uitkomst.ok) throw new Error(`${uitkomst.code}: ${uitkomst.error}`);
      return uitkomst.data;
    },
  };
}
