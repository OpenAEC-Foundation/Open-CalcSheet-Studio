/**
 * De soorten nodes die je het laatst toevoegde, over alle grafbladen: de lijst
 * "Recent" in de catalogus. De app onthoudt ze in localStorage; het project niet.
 *
 * Zonder localStorage (een privévenster, een voorbeeld) is de lijst gewoon leeg.
 */

const SLEUTEL = "ocss.graaf.recent";
const MAX = 5;

export function leesRecent(): string[] {
  try {
    const x: unknown = JSON.parse(localStorage.getItem(SLEUTEL) ?? "[]");
    return Array.isArray(x) ? x.filter((s): s is string => typeof s === "string").slice(0, MAX) : [];
  } catch {
    return [];
  }
}

/** Zet een soort vooraan; een dubbele valt weg, en meer dan vijf ook. */
export function voegRecentToe(soort: string): void {
  try {
    const lijst = [soort, ...leesRecent().filter((s) => s !== soort)].slice(0, MAX);
    localStorage.setItem(SLEUTEL, JSON.stringify(lijst));
  } catch {
    // Geen opslag: dan geen lijst.
  }
}
