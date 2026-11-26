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

/** Een taalcode uit een bestand: "en", "nl", "pt-BR". Iets anders geeft undefined. */
export function leesTaal(x: unknown): string | undefined {
  return typeof x === "string" && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(x) ? x : undefined;
}

/**
 * Meertalige tekst uit een bestand. Alleen geldige taalcodes met niet-lege tekst tellen. Ontbreekt
 * Engels, dan staat daar wat er wel is: `en` is altijd de terugval van een andere taal. Een gewone
 * tekst is Engels. Niets leesbaars geeft undefined.
 */
export function leesMeertalig(x: unknown): Meertalig | undefined {
  if (typeof x === "string") return x.trim() === "" ? undefined : { en: x };
  if (x === null || typeof x !== "object" || Array.isArray(x)) return undefined;
  const talen = Object.entries(x).filter((e): e is [string, string] =>
    leesTaal(e[0]) !== undefined && typeof e[1] === "string" && e[1].trim() !== "");
  if (talen.length === 0) return undefined;
  const per = Object.fromEntries(talen);
  return { en: per.en ?? talen[0][1], ...per };
}

/** Getypte tekst: hij hoort bij deze taal, en voor elke andere taal is hij wat er wel staat. */
export function alleenInTaal(tekst: string, taal: string): Meertalig {
  return taal === "en" ? { en: tekst } : { en: tekst, [taal]: tekst };
}

/**
 * `m` met nieuwe tekst in deze taal. De andere talen blijven staan, behalve Engels als dat nog
 * een kopie van deze taal was (alleenInTaal): dan blijft het de terugval en gaat het mee.
 */
export function inTaalGezet(m: Meertalig, taal: string, tekst: string): Meertalig {
  if (taal === "en") return { ...m, en: tekst };
  return { ...m, [taal]: tekst, ...(m.en === m[taal] ? { en: tekst } : {}) };
}
