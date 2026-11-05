import type { Exemplaar } from "../../store/projectStore";
import { MARKDOWN_BLAD } from "../../store/markdownBlad";
import type { Blad, BladPlek, Inhoudskop } from "../../rapport/opzet";
import { koppenVoorInhoud } from "./markdownRegels";

/**
 * Wat een bladsoort over zijn plek in het rapport zegt (zie BladSoort in bladSoorten.tsx).
 * Los daarvan, want het zijpaneel heeft dit vanaf het eerste scherm nodig en
 * bladSoorten.tsx brengt de afdruk van elke soort mee.
 */
export interface BladOpzet {
  plek?: BladPlek;
  inhoudsKoppen?: (ex: Exemplaar) => Inhoudskop[];
}

export const OPZET: Readonly<Record<string, BladOpzet>> = {
  [MARKDOWN_BLAD]: {
    plek: "hoofdstuk",
    inhoudsKoppen: (ex) => (ex.md && !ex.md.koppenUit ? koppenVoorInhoud(ex.md.tekst, ex) : []),
  },
};

/** Een blad zoals de opzet van het rapport het leest (rapport/opzet.ts). */
export function bladVoorOpzet(ex: Exemplaar): Blad {
  const opzet = ex.templateId ? OPZET[ex.templateId] : undefined;
  return { id: ex.id, naam: ex.naam, plek: opzet?.plek, koppen: opzet?.inhoudsKoppen?.(ex) };
}
