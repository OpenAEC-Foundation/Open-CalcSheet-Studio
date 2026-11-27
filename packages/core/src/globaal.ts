/**
 * Globale variabelen: een waarde uit één blad die in het hele project geldt.
 *
 *   #global
 *   g_v1 = 0,43 kN/m^2
 *   q_k1 = ?{2,5} kN/m^2
 *   #end global
 *
 *   #global ψ_0 = 0,7          één regel
 *
 * In het blad zelf rekent en toont alles gewoon: `#global` en `#end global` zijn geen
 * regels van de uitwerking. Wat erbinnen wordt toegekend, gaat als rekentekst naar de
 * projecttekst (`EvalOpties.project`), die vóór elk blad rekent. Zo kent elk blad
 * `g_v1`, net zoals het CC en K_FI uit de projectgegevens kent, en mag het de naam
 * gewoon overschrijven.
 *
 * Alleen getallen en grootheden met een eenheid gaan mee: een functie, een matrix of een
 * tekst heeft geen vorm als losse rekenregel. Die komen in `overgeslagen`, net als een
 * naam die geen waarde kreeg omdat zijn regel een fout gaf.
 */

import { math } from './eenheden.js';
import { naamInScope } from './naam.js';

const IDENT = '[\\p{L}_][\\p{L}\\p{N}_]*';
/** `#global` alleen (begin van een blok) of `#global` met een regel erachter. */
const GLOBAL_RE = /^([ \t]*)#global\b[ \t]*(.*)$/i;
const END_GLOBAL_RE = /^[ \t]*#end[ \t]+global\b.*$/i;
/** Een toekenning: `naam = …` of `naam = ?…`, maar geen vergelijking (`==`) en geen functie. */
const TOEKENNING_RE = new RegExp(`^\\s*(${IDENT}(?:,[\\p{L}\\p{N}_]+)?)\\s*=(?!=)`, 'u');

/**
 * Haalt de `#global`-opdrachten uit de rekentekst, zonder het aantal regels te
 * veranderen: een losse `#global` en `#end global` worden lege regels, `#global x = 1`
 * wordt `x = 1`. Het blad rekent daarna zoals elk blad.
 */
export function haalGlobaalWeg(source: string): string {
  if (!/#global\b|#end[ \t]+global\b/i.test(source)) return source;
  return source
    .split('\n')
    .map((regel) => {
      if (END_GLOBAL_RE.test(regel)) return '';
      const m = regel.match(GLOBAL_RE);
      if (!m) return regel;
      return m[2].trim() ? `${m[1]}${m[2]}` : '';
    })
    .join('\n');
}

/** Heeft deze rekentekst globale variabelen? */
export function heeftGlobaal(source: string): boolean {
  return /^[ \t]*#global\b/im.test(source);
}

/**
 * De namen die dit blad globaal maakt, in de volgorde waarin ze staan; elke naam één
 * keer. Een naam met een komma-index (`V_b,0`) staat hier zoals in de scope (`V_b_0`).
 */
export function globaleNamen(source: string): string[] {
  const uit: string[] = [];
  let inBlok = false;
  const neem = (regel: string) => {
    // Tekst (') en een titel (") zijn geen toekenning.
    const t = regel.trim();
    if (!t || t.startsWith("'") || t.startsWith('"') || t.startsWith('#') || t.startsWith('@')) return;
    const m = t.match(TOEKENNING_RE);
    if (!m) return;
    const naam = naamInScope(m[1]);
    if (!uit.includes(naam)) uit.push(naam);
  };
  for (const regel of source.split('\n')) {
    if (END_GLOBAL_RE.test(regel)) {
      inBlok = false;
      continue;
    }
    const m = regel.match(GLOBAL_RE);
    if (m) {
      if (m[2].trim()) neem(m[2]);
      else inBlok = true;
      continue;
    }
    if (inBlok) neem(regel);
  }
  return uit;
}

/** Een getal als rekentekst: een punt als decimaalteken, zonder staart van afronding. */
function getal(v: number): string {
  return String(Number(v.toPrecision(14)));
}

/**
 * Eenheden die een constructeur verwacht, in deze volgorde geprobeerd: een som van lagen in
 * `m·kN/m³` wordt zo `kN/m^2`, en niet een stapel eenheden die niemand zo schrijft.
 */
const VOORKEUR = ['kN/m^2', 'kN/m', 'kN', 'kN*m', 'kN/m^3', 'N/mm^2', 'm', 'mm^2', 'mm^4', 'm^2', 'm^3', 'kg/m^3', 'kg', 's', 'rad'];
const voorkeur = VOORKEUR.map((e) => math.unit(e));

/** Een waarde uit de scope als rekentekst, of null als hij geen losse regel kan zijn. */
export function waardeAlsRekentekst(waarde: unknown): string | null {
  if (typeof waarde === 'number') return Number.isFinite(waarde) ? getal(waarde) : null;
  if (typeof waarde === 'boolean') return waarde ? '1' : '0';
  if (math.isUnit(waarde)) {
    const u = waarde as unknown as { units: unknown[]; value: number | null; toNumber(e: string): number; formatUnits(): string; equalBase(o: unknown): boolean };
    // Een eenheid waarin dezelfde grootheid twee keer staat (`m·kN/m³`): in een gewone. Een
    // eenheid die al zo geschreven is (`N/mm^2`, `kN/m`), blijft zoals hij is.
    const soorten = u.units.map((d) => (d as { unit?: { base?: { key?: string } } }).unit?.base?.key ?? '');
    const dubbel = soorten.some((s, i) => soorten.indexOf(s) !== i);
    const gewoon = dubbel ? VOORKEUR[voorkeur.findIndex((v) => u.equalBase(v))] : undefined;
    if (gewoon && u.value !== null) {
      const v = u.toNumber(gewoon);
      if (Number.isFinite(v)) return `${getal(v)} ${gewoon}`;
    }
    const eenheid = u.formatUnits();
    if (u.value === null || !eenheid) return null;
    const v = u.toNumber(eenheid);
    if (!Number.isFinite(v)) return null;
    // mathjs schrijft `kN m` en `kN / m^2`: een spatie is daar een vermenigvuldiging.
    const tekst = eenheid.trim().replace(/\s*\/\s*/g, '/').replace(/\s+/g, '*');
    return `${getal(v)} ${tekst}`;
  }
  return null;
}

/**
 * De globale variabelen van een doorgerekend blad als rekentekst, één regel per naam:
 * `g_v1 = 0.43 kN/m^2`. Een naam die niet in de scope staat of geen getal is, komt in
 * `overgeslagen`.
 */
export function globaleRegels(scope: Readonly<Record<string, unknown>>, namen: readonly string[]): { regels: string[]; overgeslagen: string[] } {
  const regels: string[] = [];
  const overgeslagen: string[] = [];
  for (const naam of namen) {
    const tekst = waardeAlsRekentekst(scope[naam]);
    if (tekst === null) overgeslagen.push(naam);
    else regels.push(`${naam} = ${tekst}`);
  }
  return { regels, overgeslagen };
}
