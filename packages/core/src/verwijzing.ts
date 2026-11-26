/**
 * Verwijzingen naar een waarde in een ander blad: `#ref.naam`.
 *
 * Elk blad in een project heeft een kort, vast kenmerk (`ref`, zie
 * Exemplaar in de app): een nummer als `1`, of een naam als `vloer`. In een
 * formule of een invoerveld neemt `#1.R_paal` de waarde `R_paal` uit dat blad
 * over, met zijn eenheid. Een naam met een komma-index mag ook: `#vloer.V_Ed,0`.
 *
 * De kern rekent één blad tegelijk. Bij het inlezen wordt `#ref.naam` een
 * gewone naam (`ref__1__R_paal`); de app rekent het blad waarnaar verwezen
 * wordt eerst door en zet de waarde onder die naam in de scope. In beeld staat
 * de verwijzing weer als `#1.R_paal` (latex.ts).
 */

import { rekendelen } from './parser.js';
import { naamInScope } from './naam.js';

/**
 * `#ref.naam`: ref is letters, cijfers en `_`; naam als een variabelenaam, met komma-index
 * en procent (`#1.F_1%50`).
 * Niet de eerste helft van een celverwijzing (`#3.Blad1!B4`, zie onder): na de naam mag
 * geen `!` met een kolomletter komen. (`#1.n!` als faculteit blijft een verwijzing.)
 */
export const VERWIJZING_RE = /#([A-Za-z0-9_]+)\.([\p{L}_][\p{L}\p{N}_]*(?:[,%][\p{L}\p{N}_]+)*)(?![\p{L}\p{N}_]*!\$?[A-Za-z])/gu;

const HELE_VERWIJZING_RE = /^\s*#([A-Za-z0-9_]+)\.([\p{L}_][\p{L}\p{N}_]*(?:[,%][\p{L}\p{N}_]+)*)\s*$/u;
const NAAM_RE = /^ref__([A-Za-z0-9]+(?:_[A-Za-z0-9]+)*?)__(.+)$/;

/** De naam waaronder een verwijzing in de scope staat: `#1.V_Ed,0` → `ref__1__V_Ed_0`. */
export function verwijzingNaam(ref: string, naam: string): string {
  return `ref__${ref}__${naamInScope(naam)}`;
}

/**
 * Vervangt elke `#ref.naam` in een stuk rekentekst door zijn naam in de scope.
 * Tekst tussen dubbele aanhalingstekens blijft staan: een kleur als "#b91c1c"
 * of een label is geen verwijzing.
 */
export function vervangVerwijzingen(code: string): string {
  if (!code.includes('#')) return code;
  return code
    .split('"')
    .map((stuk, i) => (i % 2 === 1 ? stuk : stuk.replace(VERWIJZING_RE, (_m, ref: string, naam: string) => verwijzingNaam(ref, naam))))
    .join('"');
}

/** Is de hele tekst één verwijzing (een invoerveld met `#1.R_paal`)? */
export function leesVerwijzing(tekst: string): { ref: string; naam: string } | null {
  const m = tekst.match(HELE_VERWIJZING_RE);
  return m ? { ref: m[1], naam: m[2] } : null;
}

/**
 * Alle verwijzingen in een blad: in de rekendelen van de tekst (niet in uitleg of
 * koppen) en in de invoerwaarden. Elke combinatie van blad en naam één keer, in de
 * volgorde waarin ze voorkomen.
 */
export function verwijzingenIn(bron: string, waarden: Readonly<Record<string, string>> = {}): { ref: string; naam: string }[] {
  const uit: { ref: string; naam: string }[] = [];
  const gezien = new Set<string>();
  const neem = (tekst: string) => {
    if (!tekst.includes('#')) return;
    for (const m of tekst.matchAll(VERWIJZING_RE)) {
      const sleutel = verwijzingNaam(m[1], m[2]);
      if (gezien.has(sleutel)) continue;
      gezien.add(sleutel);
      uit.push({ ref: m[1], naam: m[2] });
    }
  };
  neem(bron.includes('#') ? rekendelen(bron) : bron);
  for (const w of Object.values(waarden)) neem(String(w));
  return uit;
}

/** Een naam in de scope terug naar de verwijzing: `ref__1__R_paal` → { ref: "1", naam: "R_paal" }. */
export function verwijzingVanNaam(naam: string): { ref: string; naam: string } | null {
  const m = naam.match(NAAM_RE);
  return m ? { ref: m[1], naam: m[2] } : null;
}

/** Zet de interne namen in een foutmelding terug naar `#ref.naam`. */
export function verwijzingenInMelding(melding: string): string {
  return melding.replace(/ref__([A-Za-z0-9]+)__([\p{L}\p{N}_]+)/gu, '#$1.$2');
}

/*
 * Een cel uit een spreadsheet-blad in een invoerveld: `#3.Blad1!B4`, met een eenheid
 * erachter als het getal er een heeft: `#3.Blad1!B4 kN`. Een werkblad met een spatie of
 * een leesteken in zijn naam staat tussen enkele aanhalingstekens, zoals in een
 * spreadsheet: `#3.'Lasten vloer'!B4`; een aanhalingsteken in de naam wordt er twee.
 *
 * Alleen in een invoerveld, niet in een formule. De app leest de cel uit de werkmap en
 * zet het getal, of wat er mis is, onder `celNaam` in de scope; het invoerveld neemt het
 * daar over (evaluator.ts).
 */

/** Een celverwijzing, ontleed. `cel` zonder `$` en in hoofdletters; `eenheid` leeg als er geen is. */
export interface CelVerwijzing {
  ref: string;
  blad: string;
  cel: string;
  eenheid: string;
}

const CEL_VERWIJZING_RE = /^\s*#([A-Za-z0-9_]+)\.(?:'((?:[^']|'')+)'|([^\s!'#]+))!\$?([A-Za-z]{1,3})\$?([1-9][0-9]{0,6})(?:\s+(.*?))?\s*$/u;

/** Is de hele tekst één celverwijzing? */
export function leesCelVerwijzing(tekst: string): CelVerwijzing | null {
  const m = tekst.match(CEL_VERWIJZING_RE);
  if (!m) return null;
  return {
    ref: m[1],
    blad: m[2] !== undefined ? m[2].replace(/''/g, "'") : m[3],
    cel: `${m[4].toUpperCase()}${m[5]}`,
    eenheid: (m[6] ?? '').trim(),
  };
}

/** Een celverwijzing als tekst; de naam van het werkblad tussen aanhalingstekens als dat moet. */
export function celVerwijzingTekst(v: CelVerwijzing): string {
  const blad = /^[\p{L}\p{N}_]+$/u.test(v.blad) ? v.blad : `'${v.blad.replace(/'/g, "''")}'`;
  return `#${v.ref}.${blad}!${v.cel}${v.eenheid ? ` ${v.eenheid}` : ''}`;
}

/** De sleutel in de scope voor de waarde van een cel. Geen naam voor een formule: alleen voor het invoerveld. */
export function celNaam(ref: string, blad: string, cel: string): string {
  return `cel__${ref}__${blad}!${cel.toUpperCase()}`;
}

/** Wat er mis kan zijn met een gekoppelde cel. */
export type CelFout =
  | 'bron' // geen blad met dit kenmerk
  | 'geen-spreadsheet' // het blad is geen spreadsheet-blad
  | 'werkmap' // de werkmap is niet te lezen
  | 'werkblad' // geen werkblad met deze naam
  | 'leeg' // de cel is leeg
  | 'tekst' // tekst of een ja/nee-waarde, geen getal
  | 'formulefout' // de formule geeft een fout, zoals #DIV/0!
  | 'geen-waarde'; // een formule zonder berekende waarde in het bestand

/** De waarde van een gekoppelde cel zoals de app hem in de scope zet: een getal, of wat er mis is. */
export type CelWaarde = number | { fout: CelFout; detail?: string };

/** Alle celverwijzingen in de invoer van een blad, elke cel één keer. */
export function celVerwijzingenIn(waarden: Readonly<Record<string, string>>): CelVerwijzing[] {
  const uit: CelVerwijzing[] = [];
  const gezien = new Set<string>();
  for (const w of Object.values(waarden)) {
    const v = typeof w === 'string' && w.includes('!') ? leesCelVerwijzing(w) : null;
    if (!v) continue;
    const sleutel = celNaam(v.ref, v.blad, v.cel);
    if (gezien.has(sleutel)) continue;
    gezien.add(sleutel);
    uit.push(v);
  }
  return uit;
}

/** Is wat in een invoerveld staat een verwijzing, naar een ander blad of naar een cel? Dan wordt er niet omgerekend. */
export function isVerwijzingInvoer(tekst: string): boolean {
  return leesVerwijzing(tekst) !== null || leesCelVerwijzing(tekst) !== null;
}
