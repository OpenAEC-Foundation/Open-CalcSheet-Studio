import type { NodeDef } from "../../graaf/nodes";
import { waardeSoort, type Waarde, type WaardeSoort } from "../../graaf/waarde";

/*
 * Kleuren op het vlak: elke groep een categoriekleur van de Blueprint
 * (GraafBlad.css, `--graaf-kleur-<groep>`). Een poort en een verbinding krijgen de
 * kleur van de groep waar hun soort waarde bij hoort, zodat er geen tweede rij
 * kleuren bij komt.
 */

const GROEP_VAN: Record<WaardeSoort, NodeDef["groep"]> = {
  grootheid: "invoer",
  lijst: "lijst",
  geometrie: "geometrie",
  tekst: "tekst",
  waarOnwaar: "logica",
};

export const groepKleur = (groep: NodeDef["groep"]) => `var(--graaf-kleur-${groep})`;

/** De kleur van een waarde; zonder waarde niets (dan geldt de neutrale kleur uit de CSS). */
export function waardeKleur(w: Waarde): string | undefined {
  const s = waardeSoort(w);
  return s ? groepKleur(GROEP_VAN[s]) : undefined;
}
