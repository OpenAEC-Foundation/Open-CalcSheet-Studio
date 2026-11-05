/**
 * Hoort een bladtekst bij een parametrisch beeld? Los van vertalingen.ts, want de
 * werkruimte vraagt dit voor het eerste scherm, zonder de vertaaltabellen van de bladen.
 */

/** De kop van een module in de vertaling, bij het herkenningspunt van zijn beeld. */
const KOP_VERTAALD: Readonly<Record<string, string>> = {
  Balklaag: "Timber joist floor",
  "Ligger van hout of staal": "Timber or steel beam",
  Tweepaalspoer: "Two-pile cap",
  "Spanningen in een doorsnede": "Section stresses",
};

/** Hoort deze bladtekst bij het beeld met dit herkenningspunt? Ook als de kop in de vertaling is aangepast. */
export function hoortBij(bron: string, marker: string): boolean {
  if (bron.includes(marker)) return true;
  const vertaald = KOP_VERTAALD[marker];
  return vertaald !== undefined && bron.includes(vertaald);
}
