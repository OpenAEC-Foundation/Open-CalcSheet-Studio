import { create } from "zustand";
import i18next from "../i18n/config";
import { templates } from "../templates";
import { useProjectStore } from "./projectStore";
import { moduleNaam } from "../components/calc/moduleNaam";
import { nieuwVel } from "../components/tekenen/vel";

/**
 * Het scherm "Module toevoegen" en het blad dat daar net mee is ingevoegd.
 *
 * Modules en naslagbladen komen via één scherm het project in, geopend vanuit
 * het lint. Een vers ingevoegd blad staat in de projectlijst meteen met zijn
 * naam in bewerkstand: in een project heet een balklaag eerder "Dak" of
 * "Verdiepingsvloer" dan "Balklaag 1". Typ je niets, dan blijft de voorgestelde
 * naam staan.
 */
/** De tabbladen van het scherm; zie ModuleKiezer.tsx. */
export type KiezerTab = "modules" | "bibliotheek" | "online" | "normbestanden";

interface ModuleKiezerState {
  open: boolean;
  /** Het tabblad waarop het scherm opent. */
  tab: KiezerTab;
  /** Het blad dat net is ingevoegd; de projectlijst zet het in de naamgeefstand. */
  nieuwId: string | null;
  openen: (tab?: KiezerTab) => void;
  sluiten: () => void;
  naamKlaar: () => void;
  /** Voegt een blad uit de catalogus toe, selecteert het en sluit het scherm. */
  voegToe: (templateId: string) => void;
  /** Voegt een leeg tekenblad toe, met één lege view, en sluit het scherm. */
  voegTekenbladToe: (naam: string, viewTitel: string) => void;
  /** Voegt een leeg blad toe om zelf een berekening in te schrijven. */
  voegLeegBladToe: () => void;
}

/** Het sjabloon-id van een blad dat leeg begint; het hoort bij geen module. */
const LEEG_BLAD = "leeg";

export const useModuleKiezer = create<ModuleKiezerState>((set) => ({
  open: false,
  tab: "modules",
  nieuwId: null,
  openen: (tab = "modules") => set({ open: true, tab }),
  sluiten: () => set({ open: false }),
  naamKlaar: () => set({ nieuwId: null }),
  voegToe: (templateId) => {
    const bron = templates[templateId];
    if (!bron) return;
    // De naam in de taal van de app. De catalogus draagt een toelichting in de naam
    // ("Beam (timber or steel)"); als naam van een blad is dat te lang. De korte vorm
    // is toch maar een voorstel.
    const naam = moduleNaam(templateId) ?? templateId;
    const kort = naam.replace(/\s*\([^)]*\)\s*$/, "").trim() || naam;
    const id = useProjectStore.getState().voegToe(templateId, kort, bron);
    set({ nieuwId: id, open: false });
  },
  voegTekenbladToe: (naam, viewTitel) => {
    const id = useProjectStore.getState().voegTekenbladToe(naam, nieuwVel(viewTitel));
    set({ nieuwId: id, open: false });
  },
  voegLeegBladToe: () => {
    // Net als bij een module: het blad staat meteen in de naamgeefstand.
    const id = useProjectStore.getState().voegToe(LEEG_BLAD, i18next.t("werkruimte:project.leegBladNaam"), `"${i18next.t("werkruimte:project.leegBladTitel")}\n\n`);
    set({ nieuwId: id, open: false });
  },
}));
