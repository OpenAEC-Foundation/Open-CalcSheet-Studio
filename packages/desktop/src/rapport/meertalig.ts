/** Tekst per taal. Engels is de bron en ontbreekt nooit. */
export type Meertalig = { en: string } & Record<string, string>;

/** De tekst in deze taal; ontbreekt die, dan Engels. */
export function inTaal(m: Meertalig, taal: string): string {
  return m[taal] ?? m.en;
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
