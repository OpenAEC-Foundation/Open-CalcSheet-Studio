/**
 * De eigen elementen van de projectgegevens: een canvas onder het formulier, waarop
 * je zelf iets neerzet, net als op een canvas-blad (store/canvasBlad.ts). Wat daar
 * staat is gewone rekentekst met merktekens. Hij rekent vóór elk blad
 * (`EvalOpties.project` in de rekenkern), zodat een variabele die je hier toevoegt in
 * het hele project geldt: `ψ_0 = 0,7` of `h_verd = ?{3} m`.
 *
 * Het staat in de projectgegevens, zodat opslaan, het herstelbestand, IFCX en
 * ongedaan maken het zonder meer meenemen:
 *
 *   projectblad          de rekentekst met merktekens
 *   projectblad_waarden  de invoer van de ?{…}-velden daarin, als JSON
 *
 * Puur en zonder React: de rekenworker en de controlescripts laden dit bestand.
 */
import { projectScope, type ProjectGegevens } from "./projectGegevens.ts";
import { evalOptiesVan } from "./projectEenheden.ts";
import { belastingProject } from "../rapport/belastingBronnen.ts";
import { globalenVan, type GlobaalBlad } from "../rekenen/globalen.ts";
import type { Belastingen } from "../rapport/model.ts";

export const PROJECTBLAD = "projectblad";
export const PROJECTBLAD_WAARDEN = "projectblad_waarden";

/** De rekentekst van de eigen elementen, met merktekens. */
export function projectBladVan(g: ProjectGegevens): string {
  return g[PROJECTBLAD] ?? "";
}

/** De invoer van de eigen elementen; kapot of afwezig is leeg. */
export function projectWaardenVan(g: ProjectGegevens): Record<string, string> {
  try {
    const x: unknown = JSON.parse(g[PROJECTBLAD_WAARDEN] ?? "{}");
    if (!x || typeof x !== "object" || Array.isArray(x)) return {};
    return Object.fromEntries(Object.entries(x).filter((e): e is [string, string] => typeof e[1] === "string"));
  } catch {
    return {};
  }
}

/** De eigen elementen van de projectgegevens als projecttekst; zonder eigen elementen niets. */
export function projectOpties(g: ProjectGegevens): { bron: string; waarden: Record<string, string> } | undefined {
  const bron = projectBladVan(g);
  return bron.trim() ? { bron, waarden: projectWaardenVan(g) } : undefined;
}

/** Wat de rekenkern vóór elk blad rekent (`EvalOpties.project`). */
export interface ProjectTekst {
  bron: string;
  waarden: Record<string, string>;
  /** De naam van een belasting bij zijn symbool, voor een lastblok. */
  namen: Record<string, string>;
}

/**
 * De hele projecttekst: eerst de belastingen uit hoofdstuk 5 van het rapport
 * (rapport/belastingBronnen.ts), dan de eigen elementen van de projectgegevens, die de
 * belastingen dus mogen gebruiken, en tot slot de globale variabelen van de bladen
 * (`#global`, rekenen/globalen.ts), die beide mogen gebruiken. Niets te rekenen: undefined.
 */
export function projectTekstVan(
  g: ProjectGegevens,
  belastingen?: Belastingen,
  taal?: string,
  /** De bladen van het project, in de volgorde van de boom: voor hun `#global`. */
  bladen: readonly GlobaalBlad[] = [],
): ProjectTekst | undefined {
  const lasten = belastingen ? belastingProject(belastingen, taal) : { bron: "", namen: {} };
  const eigen = projectOpties(g);
  const basis = [lasten.bron, eigen?.bron ?? ""].filter((s) => s.trim()).join("\n");
  const waarden = eigen?.waarden ?? {};
  const opties = evalOptiesVan(g);
  const globaal = globalenVan(bladen, {
    scope: projectScope(g),
    evalOpties: basis ? { ...opties, project: { bron: basis, waarden } } : opties,
  }).bron;
  const bron = [basis, globaal].filter((s) => s.trim()).join("\n");
  return bron ? { bron, waarden, namen: lasten.namen } : undefined;
}
