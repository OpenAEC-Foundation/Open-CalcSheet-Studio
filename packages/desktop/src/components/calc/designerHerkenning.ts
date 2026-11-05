import { hoortBij } from "../../templates/hoortBij";

/**
 * De herkenningspunten van de parametrische beelden (designerKeuze.tsx), zonder de
 * beelden zelf: de werkruimte moet dit weten voordat die geladen zijn.
 * scripts/check-designerkeuze.mjs houdt de twee lijsten gelijk.
 */
const HERKENNINGSPUNTEN = [
  "Balklaag",
  "Ligger van hout of staal",
  "Tweepaalspoer",
  "Spanningen in een doorsnede",
];

/** Heeft dit blad een parametrisch beeld? */
export function heeftDesigner(source: string): boolean {
  return HERKENNINGSPUNTEN.some((marker) => hoortBij(source, marker));
}
