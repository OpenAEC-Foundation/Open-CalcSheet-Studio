/**
 * Tekst per taal. Engels is de bron en ontbreekt nooit.
 *
 * Wat de app in een rapport meelevert (koppen, standaardwaarden, standaardteksten,
 * normwaarden, de korte gewichtenlijst) staat in i18n/locales/<taal>/rapportteksten.json.
 * De code noemt alleen de sleutel (`mt`); de tekst in een taal komt uit het register van
 * i18n/talen.ts. Een nieuwe taal is daarmee alleen een nieuwe map met vertalingen.
 */
import en from "../i18n/locales/en/rapportteksten.json" with { type: "json" };
import { BRONTAAL, registreer, TALEN, tekstOp } from "../i18n/talen.ts";

export type Meertalig = { en: string } & Record<string, string>;

/** De namespace met de meegeleverde inhoud van het rapport. */
export const RAPPORTTEKSTEN = "rapportteksten";

// Het Engels is er altijd, ook in een script dat de andere talen niet laadt.
registreer(BRONTAAL, RAPPORTTEKSTEN, en);

/**
 * De meegeleverde tekst op `sleutel` in alle talen van TALEN. De talen worden pas gelezen
 * als iemand ernaar vraagt: het register mag later gevuld worden dan dit bestand laadt.
 * Een taal zonder deze tekst geeft undefined; inTaal valt dan terug op het Engels.
 */
export function mt(sleutel: string): Meertalig {
  const m = {} as Meertalig;
  for (const { code } of TALEN) {
    Object.defineProperty(m, code, { enumerable: true, get: () => tekstOp(code, RAPPORTTEKSTEN, sleutel) });
  }
  return m;
}

/** Als `mt`, met `{naam}` in elke taal ingevuld. */
export function mtMet(sleutel: string, waarden: Record<string, string | number>): Meertalig {
  const bron = mt(sleutel);
  const m = {} as Meertalig;
  for (const { code } of TALEN) {
    Object.defineProperty(m, code, {
      enumerable: true,
      get: () => bron[code]?.replace(/\{(\w+)\}/g, (heel, naam: string) => (naam in waarden ? String(waarden[naam]) : heel)),
    });
  }
  return m;
}

/** De tekst in deze taal; ontbreekt die, dan Engels. Ook voor "nl-BE": dan Nederlands. */
export function inTaal(m: Meertalig, taal: string): string {
  return m[taal] ?? m[taal.split("-")[0]] ?? m.en;
}

/** Alle talen waarin deze tekst bestaat, als tekst. */
export function alleTalen(m: Meertalig): string[] {
  return Object.values(m).filter((w): w is string => typeof w === "string");
}
