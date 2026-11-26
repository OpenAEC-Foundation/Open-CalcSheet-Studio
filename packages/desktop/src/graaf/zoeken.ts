/**
 * Zoeken naar een soort node, voor de catalogus en het zoekmenu.
 *
 * Zoekt op de soort, de naam en de uitleg in de taal van de app en op de naam in de
 * andere taal; elk woord moet passen. De volgorde is die van de groepen.
 *
 * Geen React: controlescripts laden dit bestand in Node. De vertalers komen van
 * buiten (i18next in de app, het JSON-bestand in de controle).
 */
import type { NodeSoort } from "./model.ts";
import { NODE_SOORTEN, nodeDef, type NodeDef } from "./nodes.ts";

/** De volgorde van de groepen in de catalogus en het zoekmenu. */
export const GROEPEN: readonly NodeDef["groep"][] = ["invoer", "reken", "logica", "lijst", "tekst", "geometrie"];

/** Een vertaler voor de namespace werkruimte: sleutel → tekst. */
export type Vertaler = (sleutel: string) => string;

/** De soorten van een groep, in de volgorde van nodes.ts. */
export function soortenVan(groep: NodeDef["groep"]): NodeSoort[] {
  return NODE_SOORTEN.filter((s) => nodeDef(s)?.groep === groep);
}

export function zoekNodes(zoek: string, t: Vertaler, anders: Vertaler): NodeSoort[] {
  const woorden = zoek.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const volgorde = GROEPEN.flatMap(soortenVan);
  if (woorden.length === 0) return volgorde;
  return volgorde.filter((s) => {
    const hooi = [s, t(`graaf.soort.${s}`), t(`graaf.uitleg.${s}`), anders(`graaf.soort.${s}`)].join(" ").toLowerCase();
    return woorden.every((w) => hooi.includes(w));
  });
}
