/**
 * De talen van de app, op één plek.
 *
 * Een taal toevoegen: een map locales/<code>/ met dezelfde bestanden als locales/en/,
 * en één regel in TALEN. Verder verandert er niets aan de code: de app, het rapport en de
 * controles lezen allemaal deze lijst (zie docs/talen.md).
 *
 * Ook het register van de vertalingen staat hier. In de app vult bundels.ts het uit de
 * mappen; in Node doet scripts/lib/talen.mjs dat. Zonder React, zonder i18next en zonder
 * vite, zodat de scripts dit bestand rechtstreeks kunnen laden.
 */

export interface Taal {
  /** De taalcode, ook de naam van de map in locales/. */
  code: string;
  /** De naam van de taal in die taal zelf, voor de keuzelijsten. */
  naam: string;
  /** Schrijft deze taal een getal met een decimale komma? */
  komma: boolean;
  /** De landcode voor datums en getallen van de browser (toLocaleString). */
  locale: string;
}

/** Engels is de bron: elke tekst bestaat in het Engels. De rest is een vertaling. */
export const BRONTAAL = "en";

export const TALEN: readonly Taal[] = [
  { code: "en", naam: "English", komma: false, locale: "en-GB" },
  { code: "nl", naam: "Nederlands", komma: true, locale: "nl-NL" },
  { code: "lt", naam: "Lietuvių", komma: true, locale: "lt-LT" },
];

/** De taal met deze code, ook voor "nl-BE" of "lt-LT"; een onbekende taal geeft undefined. */
export function taalVan(code: string | null | undefined): Taal | undefined {
  if (!code) return undefined;
  return TALEN.find((t) => t.code === code) ?? TALEN.find((t) => t.code === code.split("-")[0]);
}

/**
 * Schrijft deze taal een decimale komma? Een taal uit TALEN zegt het zelf; voor een andere
 * taalcode (uit een bestand) gelden de bekende kommatalen.
 */
export function decimaleKomma(taal: string): boolean {
  return taalVan(taal)?.komma ?? /^(nl|de|fr|lt)\b/.test(taal);
}

/** De landcode voor toLocaleString; onbekend: Brits Engels. */
export function landcode(taal: string | null | undefined): string {
  return taalVan(taal)?.locale ?? "en-GB";
}

/** Nederlands is ook maar een vertaling: alleen in die taal staat iets Nederlands. */
export function isNederlands(taal: string | null | undefined): boolean {
  return taalVan(taal)?.code === "nl";
}

// ── Het register ────────────────────────────────────────────────────────────

type Bundel = Record<string, unknown>;
const REGISTER = new Map<string, Map<string, Bundel>>();

/** Leg de vertalingen van één namespace in één taal vast. */
export function registreer(taal: string, ns: string, inhoud: Bundel): void {
  let talen = REGISTER.get(taal);
  if (!talen) REGISTER.set(taal, (talen = new Map()));
  talen.set(ns, inhoud);
}

/** De vertalingen van deze namespace in deze taal, als die zijn vastgelegd. */
export function bundel(taal: string, ns: string): Bundel | undefined {
  return REGISTER.get(taal)?.get(ns);
}

/**
 * De tekst op `sleutel` ("koppen.inleiding", "standaard.titels.0") in deze taal; ontbreekt
 * hij, dan undefined. Een tekst is altijd een string: een groep of lijst is geen tekst.
 */
export function tekstOp(taal: string, ns: string, sleutel: string): string | undefined {
  let plek: unknown = bundel(taal, ns);
  for (const deel of sleutel.split(".")) {
    if (plek === null || typeof plek !== "object" || !Object.prototype.hasOwnProperty.call(plek, deel)) return undefined;
    plek = (plek as Record<string, unknown>)[deel];
  }
  return typeof plek === "string" ? plek : undefined;
}
