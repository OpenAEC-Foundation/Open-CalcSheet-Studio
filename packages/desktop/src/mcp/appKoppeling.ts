/**
 * Wat alleen App weet: de weergave van de werkruimte (code/visueel/uitwerking,
 * IFC) en het thema staan in de lokale state van App. useMcpBrug geeft ze bij
 * elke render door, zodat view_get/view_set en settings_set ze kunnen lezen en
 * zetten. Tot App getekend is, staat hier niets.
 */
export type SplitModus = "cv" | "cu" | "vu";

export interface AppKoppeling {
  splitMode: SplitModus;
  setSplitMode: (m: SplitModus) => void;
  activeView: string;
  setActiveView: (v: string) => void;
  setTheme: (t: string) => void;
}

let koppeling: AppKoppeling | null = null;

export function koppelApp(app: AppKoppeling | undefined): void {
  if (app) koppeling = app;
}

export function appKoppeling(): AppKoppeling | null {
  return koppeling;
}
