/** Tekst per taal. Engels is de bron en ontbreekt nooit. */
export type Meertalig = { en: string } & Record<string, string>;

/** De tekst in deze taal; ontbreekt die, dan Engels. */
export function inTaal(m: Meertalig, taal: string): string {
  return m[taal] ?? m.en;
}
