/**
 * Hoe een naam uit de rekentaal in de scope staat.
 *
 * mathjs kent geen komma of procent in een naam. Bij het inlezen wordt een
 * komma in een index een liggend streepje (`V_b,0` → `V_b_0`; in beeld weer
 * V_{b,0}). Een procent mocht dat niet worden: dan waren `F_1%50` en `F_1_50`
 * stil dezelfde variabele. Een procent wordt daarom een eigen letter die mathjs
 * als letter leest en die niemand typt (U+01C2, een Latijnse klikletter); in
 * beeld staat er weer `%`.
 */

/** De letter waaronder een `%` in een naam in de scope staat. */
export const PROCENT_IN_NAAM = 'ǂ';

/** `V_Ed,0` → `V_Ed_0`, `F_1%50` → `F_1ǂ50`: de naam zoals hij in de scope staat. */
export function naamInScope(naam: string): string {
  return naam.replace(/,/g, '_').replace(/%/g, PROCENT_IN_NAAM);
}

/** De naam zoals hij in beeld hoort: `F_1ǂ50` → `F_1%50`. */
export function naamMetProcent(naam: string): string {
  return naam.includes(PROCENT_IN_NAAM) ? naam.split(PROCENT_IN_NAAM).join('%') : naam;
}
