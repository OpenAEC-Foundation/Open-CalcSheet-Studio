import { IFRAME_MAX_MM, IFRAME_MIN_MM, hoogteInMm, splitsDelen } from './iframeBlok.js';
import { jsonVoorAttribuut } from './jsAttribuut.js';
import type { EvaluatedJsBlok, JsBlokNode, JsWaarde } from './types.js';

/**
 * Een stukje JavaScript in het blad: het blok `@js … @end`.
 *
 * Schrijfwijze
 * ------------
 *   @js hoogte=90mm titel="Ligger in 3D" bibliotheek=three
 *   const w = calc.wereld3d();
 *   function teken() {
 *     const { L, b, h } = calc.getallen("mm");
 *     w.leeg();
 *     w.doos([0, -b / 2, 0], [L, b / 2, h], "#e3c08a");
 *     w.teken();
 *   }
 *   teken();
 *   calc.bijWijziging(teken);
 *   @end
 *
 * Opties op de eerste regel, in willekeurige volgorde; hierin werkt `{{…}}`:
 *   hoogte=…        120mm, 12cm, 450px, een kaal getal (mm) of `{{…}}`; 20 tot 230 mm
 *   titel="…"       de titel van het kader en het onderschrift
 *   bibliotheek=…   wat de app zonder netwerk aanlevert; nu alleen `three`
 *   netwerk=…       hosts die het script mag bereiken, met komma's ertussen; alleen
 *                   https, en ze staan bij de bevestiging. Zonder dit: geen netwerk.
 *
 * De code is geen rekentaal. Hij gaat letterlijk door: `#`, `'`, `a.b`, `[1; 2]`,
 * `{{x}}`, `#if` en macronamen betekenen hier niets. Daarom gaat hij er vóór alle
 * bewerkingen van de parser uit, en komt er pas bij het inlezen van de knoop weer
 * bij. Alleen een regel die precies `@end` is, sluit het blok.
 *
 * Het script ziet de waarden van het blad op deze plek als `calc`, met hun eenheid
 * (components/calc/jsLooptijd.js in de app). Het kan de berekening niet voeden: wat
 * het uitrekent, blijft in zijn eigen venster.
 *
 * Uitvoer
 * -------
 *   <div class="calc-js" data-js-code="…" data-js-waarden="…" …>
 *     <div class="calc-iframe-vak" style="height:90mm">kader met de titel</div>
 *   </div>
 *
 * De kern voert niets uit en schrijft geen `<iframe>`. De app doet dat na een
 * bevestiging, in een afgeschermd venster (components/calc/jsBlok.ts). Niet
 * uitgevoerd, of niet gelukt: dan staat op scherm en papier het kader.
 *
 * Code en waarden staan als JSON in een attribuut, met `<` en `>` geschreven als
 * `\u003c` en `\u003e`: wat de opschoning van de uitwerking in een attribuut
 * verdacht vindt (`]>`, `</script`), kan zo niet in de code voorkomen.
 */

const JS_START_RE = /^@js(?:\s+(.*))?$/i;
const JS_EIND_RE = /^\s*@end\s*$/;
/** De regel die in de bron overblijft: het nummer van de code, en de opties. */
export const JS_PLEK_RE = /^@js\u0003(\d+)\u0003(.*)$/;

const OPTIE_RE = /^(hoogte|titel|bibliotheek|netwerk)=(.*)$/i;
const INVULLING_RE = /\{\{([\s\S]*?)\}\}/g;
/** Wat de app zonder netwerk kan aanleveren. */
export const JS_BIBLIOTHEKEN: readonly string[] = ['three'];
/** Zonder hoogte: genoeg voor een beeld, en het past nog bij andere regels op een vel. */
const JS_STANDAARD_MM = 90;

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** De code van een blok, weggehaald uit de bron. */
export interface JsCode {
  code: string;
  /** Er stond een regel `@end`. */
  dicht: boolean;
}

/**
 * Haalt de `@js`-blokken uit de bron en zet er één regel voor terug
 * (`@js<nummer>opties`, met een stuurteken dat in tekst niet voorkomt). Zo komt
 * geen enkele bewerking van de parser aan de code. De regels van `@svg`, `@3d` en
 * `@select` worden overgeslagen: `@end` hoort daar bij hun eigen blok.
 */
export function haalJsBlokkenUit(source: string, blokken: JsCode[]): string {
  if (!/^[ \t]*@js\b/im.test(source)) return source;
  const regels = source.split('\n');
  const uit: string[] = [];
  let inAnderBlok = false;
  for (let i = 0; i < regels.length; i++) {
    const t = regels[i].trim();
    if (inAnderBlok) {
      uit.push(regels[i]);
      if (/^@end\b/.test(t)) inAnderBlok = false;
      continue;
    }
    if (/^@svg\s*$/.test(t) || /^@3d\s*$/i.test(t) || /^@select\b/.test(t)) {
      inAnderBlok = true;
      uit.push(regels[i]);
      continue;
    }
    const m = t.match(JS_START_RE);
    if (!m) {
      uit.push(regels[i]);
      continue;
    }
    const code: string[] = [];
    let j = i + 1;
    while (j < regels.length && !JS_EIND_RE.test(regels[j])) {
      code.push(regels[j].replace(/\r$/, ''));
      j++;
    }
    blokken.push({ code: code.join('\n'), dicht: j < regels.length });
    uit.push(`@js\u0003${blokken.length - 1}\u0003${m[1] ?? ''}`);
    i = j;
  }
  return uit.join('\n');
}

/** Leest de opties van een `@js`-regel. Fouten worden meldingen. */
export function leesJsBlok(
  rest: string,
  code: JsCode,
  normaliseer: (expr: string) => string,
): Omit<JsBlokNode, 'type' | 'hidden' | 'scherm'> {
  const uit: Omit<JsBlokNode, 'type' | 'hidden' | 'scherm'> = { code: code.code, bibliotheken: [], netwerk: [], fouten: [] };
  const meld = (t: string) => uit.fouten.push(`JavaScript-blok: ${t}`);
  if (!code.dicht) meld('geen regel @end: alles tot het eind van het blad is als code gelezen');
  const norm = (t: string) => t.replace(INVULLING_RE, (_m, e: string) => `{{${normaliseer(e.trim())}}}`);
  let delen: string[];
  try {
    delen = splitsDelen(rest);
  } catch (err) {
    meld((err as Error).message);
    return uit;
  }
  for (const deel of delen) {
    const m = deel.match(OPTIE_RE);
    if (!m) {
      meld(`onbekende optie "${deel}" (bekend: hoogte=…, titel="…", bibliotheek=three, netwerk=host)`);
      continue;
    }
    const naam = m[1].toLowerCase();
    const waarde = m[2].replace(/^"(.*)"$/, '$1');
    if (naam === 'hoogte') uit.hoogte = norm(waarde);
    else if (naam === 'titel') uit.titel = norm(waarde);
    else if (naam === 'netwerk') uit.netwerk = waarde.split(',').map((h) => norm(h.trim())).filter(Boolean);
    else {
      for (const b of waarde.split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)) {
        if (JS_BIBLIOTHEKEN.includes(b)) uit.bibliotheken.push(b);
        else meld(`onbekende bibliotheek "${b}" (bekend: ${JS_BIBLIOTHEKEN.join(', ')})`);
      }
    }
  }
  return uit;
}

/**
 * Toetst een host voor `netwerk=`. Alleen https, alleen een volledige naam: geen
 * jokerteken, pad, ander schema of iets dat in een CSP een eigen regel wordt.
 */
export function jsHost(waarde: string): { host: string; fout?: undefined } | { host?: undefined; fout: string } {
  const t = waarde.trim().toLowerCase().replace(/^https:\/\//, '').replace(/\/$/, '');
  const goed = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?::\d{1,5})?$/.test(t);
  if (!goed) return { fout: `"${waarde}" is geen https-host; schrijf netwerk=cdn.voorbeeld.nl` };
  return { host: t };
}

/** Wat het blok nodig heeft van de rekenkern (evaluator.ts). */
export interface JsRekenaar {
  reken(expr: string): unknown;
  alsTekst(waarde: unknown): string;
  scope: Record<string, unknown>;
}

interface MetEenheid {
  value: number | null;
  dimensions?: number[];
  toNumber(eenheid?: string): number;
  formatUnits(): string;
}

function isEenheid(v: unknown): v is MetEenheid {
  return typeof v === 'object' && v !== null
    && typeof (v as MetEenheid).toNumber === 'function'
    && typeof (v as MetEenheid).formatUnits === 'function';
}

const netjes = (n: number) => Number(n.toPrecision(15));

/**
 * De waarden van het blad op deze plek, om mee te geven aan het script: getallen,
 * teksten, ja/nee, getallen met een eenheid en lijsten getallen. Bij een eenheid ook
 * de waarde in SI en de dimensie, zodat het script kan omrekenen. Functies en wat
 * de rekenkern intern bijhoudt, gaan niet mee.
 */
export function jsWaarden(scope: Record<string, unknown>): Record<string, JsWaarde> {
  const uit: Record<string, JsWaarde> = {};
  for (const [naam, v] of Object.entries(scope)) {
    if (naam.startsWith('__') || naam === '_i') continue;
    if (typeof v === 'number') {
      if (Number.isFinite(v)) uit[naam] = { w: netjes(v) };
    } else if (typeof v === 'string' || typeof v === 'boolean') {
      uit[naam] = { w: v };
    } else if (isEenheid(v)) {
      if (typeof v.value !== 'number' || !Number.isFinite(v.value)) continue;
      const e = v.formatUnits();
      let w: number;
      try {
        w = netjes(v.toNumber(e));
      } catch {
        continue;
      }
      uit[naam] = { w, e, s: v.value, d: v.dimensions ?? [] };
    } else if (typeof v === 'object' && v !== null && typeof (v as { toArray?: unknown }).toArray === 'function') {
      const lijst = (v as { toArray(): unknown[] }).toArray();
      const plat = lijst.flat(3);
      if (plat.length > 0 && plat.length <= 10000 && plat.every((x) => typeof x === 'number' && Number.isFinite(x))) {
        uit[naam] = { w: lijst as number[] };
      }
    }
  }
  return uit;
}

/** Rekent een `@js`-regel door. Gooit niet: wat misgaat, wordt een melding. */
export function bouwJsBlok(node: JsBlokNode, r: JsRekenaar): EvaluatedJsBlok {
  const meldingen = [...node.fouten];
  const meld = (t: string) => meldingen.push(`JavaScript-blok: ${t}`);
  const vul = (t: string): string | null => {
    let gelukt = true;
    const uit = t.replace(INVULLING_RE, (_m, e: string) => {
      try {
        return r.alsTekst(r.reken(e));
      } catch (err) {
        meld(`{{${e}}} is niet uit te rekenen: ${(err as Error).message}`);
        gelukt = false;
        return '';
      }
    });
    return gelukt ? uit : null;
  };

  let hoogteMm = JS_STANDAARD_MM;
  if (node.hoogte) {
    try {
      const h = hoogteInMm(node.hoogte, r);
      if (!(h > 0)) throw new Error('de hoogte moet groter dan 0 zijn');
      hoogteMm = Math.round(Math.min(IFRAME_MAX_MM, Math.max(IFRAME_MIN_MM, h)) * 10) / 10;
      if (hoogteMm !== Math.round(h * 10) / 10) meld(`hoogte ${Math.round(h)} mm valt buiten ${IFRAME_MIN_MM} tot ${IFRAME_MAX_MM} mm; het is ${hoogteMm} mm geworden`);
    } catch (err) {
      meld((err as Error).message);
    }
  }

  const netwerk: string[] = [];
  for (const deel of node.netwerk) {
    const ingevuld = vul(deel);
    if (ingevuld === null) continue;
    const h = jsHost(ingevuld);
    if (h.host !== undefined) {
      if (!netwerk.includes(h.host)) netwerk.push(h.host);
    } else {
      meld(h.fout);
    }
  }

  const titel = node.titel ? vul(node.titel) ?? undefined : undefined;
  return {
    type: 'js',
    code: node.code,
    hoogteMm,
    ...(titel ? { titel } : {}),
    bibliotheken: node.bibliotheken,
    netwerk,
    waarden: jsWaarden(r.scope),
    meldingen,
  };
}

/** Het blok in de uitwerking: de meldingen en het kader met de titel. */
export function renderJsBlok(node: EvaluatedJsBlok): string {
  const meldingen = node.meldingen.map((m) => `<p class="calc-iframe-melding">${escapeHtml(m)}</p>`).join('');
  const titel = node.titel ? escapeHtml(node.titel) : '';
  const attr = (naam: string, waarde: string) => ` ${naam}="${escapeHtml(waarde)}"`;
  return `<div class="calc-js"${attr('data-js-code', jsonVoorAttribuut(node.code))}${attr('data-js-waarden', jsonVoorAttribuut(node.waarden))}`
    + `${node.bibliotheken.length ? attr('data-js-bibliotheek', node.bibliotheken.join(',')) : ''}`
    + `${node.netwerk.length ? attr('data-js-netwerk', node.netwerk.join(',')) : ''}`
    + `${titel ? ` data-js-titel="${titel}"` : ''}>${meldingen}`
    + `<div class="calc-iframe-vak" style="height:${node.hoogteMm}mm"><div class="calc-iframe-kader">`
    + `<span class="calc-iframe-kop">${titel || 'JavaScript'}</span><span class="calc-iframe-url">JavaScript-blok, niet uitgevoerd</span>`
    + `</div></div>${titel ? `<p class="calc-iframe-bron">${titel}</p>` : ''}</div>`;
}
