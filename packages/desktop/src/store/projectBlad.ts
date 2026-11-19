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
import type { ProjectGegevens } from "./projectGegevens";

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

/** Wat de rekenkern vóór elk blad rekent; zonder eigen elementen niets. */
export function projectOpties(g: ProjectGegevens): { bron: string; waarden: Record<string, string> } | undefined {
  const bron = projectBladVan(g);
  return bron.trim() ? { bron, waarden: projectWaardenVan(g) } : undefined;
}
