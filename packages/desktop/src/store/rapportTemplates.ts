import { create } from "zustand";
import { getSetting, setSetting } from "../store";
import {
  metEigenTemplate,
  metStandaardTemplate,
  normaliseerEigenTemplates,
  zonderEigenTemplate,
  type EigenTemplates,
  type Template,
} from "../rapport/template";

/**
 * De eigen rapporttemplates: een instelling van de gebruiker, naast het bureauprofiel, niet van
 * een project. Eén daarvan kan de standaard voor nieuwe rapporten zijn; zonder is dat het
 * ingebouwde template.
 *
 * Een rapport krijgt een eigen kopie (Rapport.opzet), dus wat hier verandert, raakt geen bestaand
 * rapport. In een browser zonder Tauri is er geen opslag (zie store.ts): dan blijft dit alleen in
 * het geheugen, net als het bureauprofiel.
 */

const KEY = "rapportTemplates";

interface TemplateState extends EigenTemplates {
  /** Bewaart een template; dezelfde naam vervangt. Geeft het id. */
  bewaar: (t: Template) => string;
  verwijder: (id: string) => void;
  /** Het template voor nieuwe rapporten; null is het ingebouwde. */
  zetStandaard: (id: string | null) => void;
}

// De beginstand als vast object: zolang de store dit nog bevat, heeft niemand iets gewijzigd en
// mag de opgeslagen stand eroverheen.
const BEGIN: EigenTemplates["lijst"] = [];

const alleenGegevens = (s: EigenTemplates): EigenTemplates => ({ lijst: s.lijst, standaard: s.standaard });

export const useTemplateStore = create<TemplateState>((set, get) => ({
  lijst: BEGIN,
  standaard: null,

  bewaar: (t) => {
    const { eigen, id } = metEigenTemplate(alleenGegevens(get()), t);
    set(eigen);
    return id;
  },
  verwijder: (id) => set(zonderEigenTemplate(alleenGegevens(get()), id)),
  zetStandaard: (id) => set(metStandaardTemplate(alleenGegevens(get()), id)),
}));

// Persistentie: zelfde patroon als het bureauprofiel.
let timer: ReturnType<typeof setTimeout> | null = null;
function planOpslag(s: EigenTemplates) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void setSetting(KEY, alleenGegevens(s));
  }, 400);
}

void getSetting<unknown>(KEY, null).then((opgeslagen) => {
  // Wat de gebruiker in de tussentijd al heeft veranderd, wint en wordt alsnog bewaard.
  const nu = useTemplateStore.getState();
  if (nu.lijst !== BEGIN) planOpslag(nu);
  else if (opgeslagen !== null) useTemplateStore.setState(normaliseerEigenTemplates(opgeslagen));

  useTemplateStore.subscribe((s, vorige) => {
    if (s.lijst !== vorige.lijst || s.standaard !== vorige.standaard) planOpslag(s);
  });
});
