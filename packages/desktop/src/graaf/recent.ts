/**
 * De soorten nodes die je het laatst toevoegde, over alle grafbladen: de lijst
 * "Recent" in de catalogus. De app onthoudt ze als voorkeur van de browser
 * (browserVoorkeur: localStorage, in de werkplek alleen in het geheugen); het project niet.
 *
 * Zonder opslag (een privévenster, een voorbeeld) is de lijst gewoon leeg.
 */
import { browserVoorkeur } from "../werkplek/werkplek.ts";

const SLEUTEL = "ocss.graaf.recent";
const MAX = 5;

export function leesRecent(): string[] {
  try {
    const x: unknown = JSON.parse(browserVoorkeur.lees(SLEUTEL) ?? "[]");
    return Array.isArray(x) ? x.filter((s): s is string => typeof s === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** Zet een soort vooraan; een dubbele valt weg, en meer dan vijf ook. */
export function voegRecentToe(soort: string): void {
  try {
    const lijst = [soort, ...leesRecent().filter((s) => s !== soort)].slice(0, MAX);
    browserVoorkeur.bewaar(SLEUTEL, JSON.stringify(lijst));
  } catch {
    // Geen opslag: dan geen lijst.
  }
}
