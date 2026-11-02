import { useEffect } from "react";
import { initMcpBrug } from "./brug";
import { koppelApp, type AppKoppeling } from "./appKoppeling";

/**
 * Start bij het opstarten van de app de MCP-server en de REST-API, als die in
 * de instellingen aan staan (standaard: aan). Buiten de desktop-app doet dit
 * niets, behalve de status op "niet beschikbaar" zetten. Zie docs/mcp.md en
 * docs/api.md.
 *
 * `app` geeft de weergave en het thema van App door (die staan in de lokale
 * state van App), voor view_get, view_set en settings_set.
 */
export function useMcpBrug(app?: AppKoppeling): void {
  koppelApp(app);
  useEffect(() => {
    void initMcpBrug();
  }, []);
}
