import { create } from "zustand";
import { getSetting, setSetting } from "../store";
import { templates } from "../templates";
import { modulesPerTemplate, type ModuleStatus } from "../components/calc/projectTree";

/**
 * De online modulebibliotheek: rekenmodules uit de openbare repository
 * OpenAEC-Foundation/Open-CalcSheet-Studio-modules. De catalogus
 * (index.json) wordt opgehaald als je het tabblad opent; een geïnstalleerde
 * module wordt met blad en beeld bewaard in de instellingen, zodat hij ook
 * zonder internet werkt.
 *
 * Een geïnstalleerde module komt in de gewone catalogus terecht: `templates`
 * krijgt zijn rekentekst en `modulesPerTemplate` zijn naam en status. Heeft
 * een ingebouwde module hetzelfde id (zoals de balklaag), dan vervangt de
 * versie uit de bibliotheek de ingebouwde rekentekst voor nieuwe bladen;
 * bestaande bladen houden hun eigen kopie.
 */

export const BIBLIOTHEEK_REPO = "https://github.com/OpenAEC-Foundation/Open-CalcSheet-Studio-modules";
const RAW = "https://raw.githubusercontent.com/OpenAEC-Foundation/Open-CalcSheet-Studio-modules/main";
const INSTELLING = "moduleBibliotheek";

export interface Tweetalig {
  nl: string;
  en: string;
}

/** Een module zoals index.json hem beschrijft. */
export interface CatalogusModule {
  id: string;
  versie: string;
  naam: Tweetalig;
  omschrijving: Tweetalig;
  categorie: string;
  status: ModuleStatus;
  gepubliceerd: boolean;
  normen: string[];
  map: string;
  blad: string;
  beeld: string;
  minimaleAppVersie: string;
}

/** Een geïnstalleerde module: de beschrijving plus blad en beeld. */
export interface GeinstalleerdeModule extends CatalogusModule {
  bron: string;
  /** Het beeld als data-URL, zodat het ook zonder internet werkt. */
  beeldData: string | null;
}

/** Het beeld van een module in de online bibliotheek, voor hij is geïnstalleerd. */
export const bibliotheekBeeld = (m: CatalogusModule) => `${RAW}/${m.map}/${m.beeld}`;

/** Versies als jaar.week.nummer vergelijken: negatief als a ouder is dan b. */
export function vergelijkVersie(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** De ingebouwde rekenteksten, om bij verwijderen naar terug te kunnen. */
const ingebouwd: Record<string, string> = { ...templates };

/** Zet een geïnstalleerde module in de catalogus van de app. */
function registreer(m: GeinstalleerdeModule) {
  templates[m.id] = m.bron;
  modulesPerTemplate[m.id] = {
    templateId: m.id,
    label: m.naam.nl,
    namen: m.naam,
    status: m.status,
    categorie: modulesPerTemplate[m.id]?.categorie ?? m.categorie,
  };
}

function afmelden(id: string) {
  if (ingebouwd[id] !== undefined) templates[id] = ingebouwd[id];
  else {
    delete templates[id];
    delete modulesPerTemplate[id];
  }
}

async function alsDataUrl(url: string): Promise<string | null> {
  try {
    const antwoord = await fetch(url);
    if (!antwoord.ok) return null;
    const blob = await antwoord.blob();
    return await new Promise((klaar) => {
      const lezer = new FileReader();
      lezer.onload = () => klaar(typeof lezer.result === "string" ? lezer.result : null);
      lezer.onerror = () => klaar(null);
      lezer.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

interface ModuleBibliotheek {
  geinstalleerd: Record<string, GeinstalleerdeModule>;
  catalogus: CatalogusModule[] | null;
  laden: boolean;
  fout: string | null;
  /** Het id van de module die nu wordt geïnstalleerd. */
  bezig: string | null;
  haalCatalogus: () => Promise<void>;
  installeer: (m: CatalogusModule) => Promise<void>;
  verwijder: (id: string) => void;
}

export const useModuleBibliotheek = create<ModuleBibliotheek>((set, get) => ({
  geinstalleerd: {},
  catalogus: null,
  laden: false,
  fout: null,
  bezig: null,

  haalCatalogus: async () => {
    set({ laden: true, fout: null });
    try {
      const antwoord = await fetch(`${RAW}/index.json`, { cache: "no-store" });
      if (!antwoord.ok) throw new Error(`HTTP ${antwoord.status}`);
      const index = (await antwoord.json()) as { formaat: number; modules: CatalogusModule[] };
      set({ catalogus: index.modules ?? [], laden: false });
    } catch (err) {
      set({ laden: false, fout: (err as Error).message });
    }
  },

  installeer: async (m) => {
    set({ bezig: m.id, fout: null });
    try {
      const antwoord = await fetch(`${RAW}/${m.map}/${m.blad}`, { cache: "no-store" });
      if (!antwoord.ok) throw new Error(`HTTP ${antwoord.status}`);
      const bron = await antwoord.text();
      const beeldData = await alsDataUrl(`${RAW}/${m.map}/${m.beeld}`);
      const module: GeinstalleerdeModule = { ...m, bron, beeldData };
      registreer(module);
      const geinstalleerd = { ...get().geinstalleerd, [m.id]: module };
      set({ geinstalleerd, bezig: null });
      void setSetting(INSTELLING, geinstalleerd);
    } catch (err) {
      set({ bezig: null, fout: (err as Error).message });
    }
  },

  verwijder: (id) => {
    afmelden(id);
    const geinstalleerd = { ...get().geinstalleerd };
    delete geinstalleerd[id];
    set({ geinstalleerd });
    void setSetting(INSTELLING, geinstalleerd);
  },
}));

// Bij het opstarten: de geïnstalleerde modules terug in de catalogus.
void getSetting<Record<string, GeinstalleerdeModule>>(INSTELLING, {}).then((opgeslagen) => {
  const geldig = Object.fromEntries(
    Object.entries(opgeslagen ?? {}).filter(([, m]) => m && typeof m.bron === "string" && typeof m.id === "string"),
  );
  for (const m of Object.values(geldig)) registreer(m);
  useModuleBibliotheek.setState({ geinstalleerd: geldig });
});
