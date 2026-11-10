/**
 * De maat van groepen op het vlak en op papier: het kader om de leden, de kaart van
 * een ingeklapte groep, en waar een verbinding naar een node in zo'n groep loopt.
 *
 * Het model bewaart alleen wie er in een groep zit (model.ts); het kader rekent
 * zich hier uit uit de plek en maat van de leden. Op het scherm komen de maten uit
 * de DOM, op papier uit papier.ts.
 *
 * Geen React en geen store: controlescripts laden dit bestand in Node.
 */
import type { Graaf, GraafGroep, GraafNode } from "./model.ts";
import { poortPlek, type Poorten } from "./nodes.ts";

export interface Maat {
  x: number;
  y: number;
  b: number;
  h: number;
}

/** De marge van een kader om zijn leden, en de ruimte voor de titel erboven. */
export const GROEP_MARGE = 16;
export const GROEP_TITEL = 30;
/** De kaart van een ingeklapte groep. */
export const KAART_BREEDTE = 200;
export const KAART_HOOGTE = 56;

/** Het kader om de leden; null als geen lid een maat heeft. */
export function groepKader(groep: GraafGroep, maten: ReadonlyMap<string, Maat>): Maat | null {
  const m = groep.leden.map((l) => maten.get(l)).filter((x): x is Maat => !!x);
  if (m.length === 0) return null;
  const x0 = Math.min(...m.map((a) => a.x)) - GROEP_MARGE;
  const y0 = Math.min(...m.map((a) => a.y)) - GROEP_MARGE - GROEP_TITEL;
  const x1 = Math.max(...m.map((a) => a.x + a.b)) + GROEP_MARGE;
  const y1 = Math.max(...m.map((a) => a.y + a.h)) + GROEP_MARGE;
  return { x: x0, y: y0, b: x1 - x0, h: y1 - y0 };
}

/** De kaart van een ingeklapte groep: op de linkerbovenhoek van zijn kader. Alleen de plek van de leden telt. */
export function ingeklaptKaart(groep: GraafGroep, maten: ReadonlyMap<string, Maat>): Maat | null {
  const k = groepKader(groep, maten);
  return k ? { x: k.x, y: k.y, b: KAART_BREEDTE, h: KAART_HOOGTE } : null;
}

/** De ingeklapte groep waar een id in zit, als die er is. */
export function ingeklaptVan(graaf: Graaf, id: string): GraafGroep | undefined {
  return graaf.groepen?.find((g) => g.ingeklapt && g.leden.includes(id));
}

/**
 * Als `poortPlek`, maar een node in een ingeklapte groep is niet te zien: dan loopt
 * de verbinding naar de rand van de kaart, links voor een ingang en rechts voor een
 * uitgang, op halve hoogte.
 */
export function zichtbarePoortPlek(
  graaf: Graaf,
  node: GraafNode,
  poorten: Poorten,
  kant: "in" | "uit",
  naam: string,
  maten: ReadonlyMap<string, Maat>,
): { x: number; y: number } | null {
  const groep = ingeklaptVan(graaf, node.id);
  if (!groep) return poortPlek(node, poorten, kant, naam);
  const k = ingeklaptKaart(groep, maten);
  if (!k) return poortPlek(node, poorten, kant, naam);
  return { x: kant === "in" ? k.x : k.x + k.b, y: k.y + k.h / 2 };
}
