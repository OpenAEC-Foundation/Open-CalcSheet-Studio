import type { EvaluatedIframe, IframeNode } from './types.js';

/**
 * Een externe pagina in het blad: de regel `@iframe`.
 *
 * Schrijfwijze
 * ------------
 *   @iframe https://voorbeeld.nl/kaart hoogte=120mm
 *   @iframe https://voorbeeld.nl/?L={{L}}&b={{b}} hoogte={{h_kaart}} titel="Kaart"
 *   @iframe https://voorbeeld.nl/viewer hoogte=80mm scripts
 *
 * Eerst het adres, daarna de opties in willekeurige volgorde:
 *   hoogte=…     120mm, 12cm, 0.12m, 450px, een kaal getal (mm) of `{{…}}`;
 *                tussen 20 en 230 mm, zodat het blok altijd op één vel past
 *   titel="…"    het onderschrift van het kader
 *   scripts      de pagina mag scripts uitvoeren, in haar eigen afgeschermde
 *                omgeving (zonder dit: helemaal geen scripts)
 *
 * In het adres, de titel en de hoogte werkt `{{…}}` zoals in `@3d`: een naam of
 * een formule uit het blad. In een adres staat de waarde zonder eenheid en
 * URL-gecodeerd; `{{…}}` als het hele adres is een tekst met een volledig adres.
 *
 * Veiligheid
 * ----------
 * Een blad kan van iemand anders komen. Daarom:
 *   - alleen http en https, en dat wordt getoetst ná het invullen van `{{…}}`;
 *     geen gebruikersnaam of wachtwoord in het adres;
 *   - de kern schrijft geen `<iframe>`, alleen een kader met het adres. De app
 *     zet er pas een iframe in als de gebruiker de herkomst heeft bevestigd
 *     (components/calc/iframeBlok.ts), en bepaalt daar zelf de rechten;
 *   - wat wordt geweigerd, komt als melding in de uitwerking; de rest van het
 *     blad staat er gewoon.
 *
 * Uitvoer
 * -------
 *   <div class="calc-iframe" data-iframe-url="…" [data-iframe-scripts="ja"]>
 *     <div class="calc-iframe-vak" style="height:120mm">kader met het adres</div>
 *     <p class="calc-iframe-bron">onderschrift bij een geladen pagina</p>
 *   </div>
 *
 * De hoogte staat vast, geladen of niet: de verdeling over de vellen hangt er
 * niet van af. Zonder bevestiging, en als de inhoud niet op tijd klaar is, komt
 * het kader op papier in plaats van een lege plek.
 */

export const IFRAME_RE = /^@iframe(?:\s+(.*))?$/i;

/** Hoogte van het blok in mm: zonder opgave, en de grenzen. Tot 230 mm past hij op elk vel (paginering.ts). */
export const IFRAME_STANDAARD_MM = 120;
export const IFRAME_MIN_MM = 20;
export const IFRAME_MAX_MM = 230;

const OPTIE_RE = /^(hoogte|titel|scripts)(?:=(.*))?$/i;
const MAAT_RE = /^(.*?)\s*(mm|cm|m|px)?$/i;
const GETAL_RE = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i;
const FORMULE_RE = /^\{\{([\s\S]+)\}\}$/;
const INVULLING_RE = /\{\{([\s\S]*?)\}\}/g;
/** Millimeters per eenheid; een px is de CSS-pixel. */
const MM_PER: Readonly<Record<string, number>> = { mm: 1, cm: 10, m: 1000, px: 25.4 / 96 };

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Splitst op witruimte; `{{ … }}` en `"…"` blijven heel, ook met spaties erin. */
export function splitsDelen(regel: string): string[] {
  const delen: string[] = [];
  let i = 0;
  while (i < regel.length) {
    if (/\s/.test(regel[i])) { i++; continue; }
    let deel = '';
    while (i < regel.length && !/\s/.test(regel[i])) {
      const eindteken = regel.startsWith('{{', i) ? '}}' : regel[i] === '"' ? '"' : null;
      if (eindteken) {
        const van = i + (eindteken === '}}' ? 2 : 1);
        const eind = regel.indexOf(eindteken, van);
        if (eind === -1) throw new Error(eindteken === '}}' ? '{{ zonder sluitende }}' : 'een tekst zonder sluitend aanhalingsteken');
        deel += regel.slice(i, eind + eindteken.length);
        i = eind + eindteken.length;
      } else {
        deel += regel[i];
        i++;
      }
    }
    delen.push(deel);
  }
  return delen;
}

const zonderAanhalingstekens = (t: string) => t.replace(/^"(.*)"$/, '$1');

/**
 * Toetst een volledig adres. Geeft het genormaliseerde adres, of de reden van
 * weigering. De browser leest een adres op dezelfde manier: spaties en
 * regeleinden erin, hoofdletters in het schema en `\` in plaats van `/` zijn
 * hier dus al weg voordat er naar het schema wordt gekeken.
 */
export function iframeAdres(adres: string): { url: string; fout?: undefined } | { url?: undefined; fout: string } {
  let u: URL;
  try {
    u = new URL(adres.trim());
  } catch {
    return { fout: `"${adres}" is geen volledig adres; schrijf het met http:// of https://` };
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { fout: `schema "${u.protocol}" is niet toegestaan, alleen http en https` };
  }
  if (u.username || u.password) return { fout: 'een adres met een gebruikersnaam of wachtwoord is niet toegestaan' };
  return { url: u.href };
}

/**
 * Leest wat er achter `@iframe` staat. `normaliseer` maakt van een expressie in
 * `{{…}}` dezelfde vorm als elke andere expressie in het blad. Fouten worden
 * meldingen.
 */
export function leesIframe(
  rest: string,
  normaliseer: (expr: string) => string,
): Pick<IframeNode, 'url' | 'hoogte' | 'titel' | 'scripts' | 'fouten'> {
  const uit: Pick<IframeNode, 'url' | 'hoogte' | 'titel' | 'scripts' | 'fouten'> = { url: '', scripts: false, fouten: [] };
  const meld = (t: string) => uit.fouten.push(`iframe-blok: ${t}`);
  const norm = (t: string) => t.replace(INVULLING_RE, (_m, e: string) => `{{${normaliseer(e.trim())}}}`);
  let delen: string[];
  try {
    delen = splitsDelen(rest);
  } catch (err) {
    meld((err as Error).message);
    return uit;
  }
  if (delen[0] && !OPTIE_RE.test(delen[0])) uit.url = norm(zonderAanhalingstekens(delen.shift()!));
  else meld('geen adres; schrijf @iframe https://… hoogte=120mm');
  for (const deel of delen) {
    const m = deel.match(OPTIE_RE);
    if (!m) {
      meld(`onbekende optie "${deel}" (bekend: hoogte=…, titel="…", scripts)`);
      continue;
    }
    const naam = m[1].toLowerCase();
    const waarde = zonderAanhalingstekens(m[2] ?? '');
    if (naam === 'hoogte') uit.hoogte = norm(waarde);
    else if (naam === 'titel') uit.titel = norm(waarde);
    else if (m[2] === undefined || /^(ja|aan|1)$/i.test(waarde)) uit.scripts = true;
    else if (!/^(nee|uit|0)$/i.test(waarde)) meld(`scripts kent ja en nee, niet "${waarde}"`);
  }
  return uit;
}

/** Wat het blok nodig heeft van de rekenkern (evaluator.ts). */
export interface IframeRekenaar {
  reken(expr: string): unknown;
  /** Een waarde als tekst, zoals {{naam}} in een @svg: zonder eenheid. */
  alsTekst(waarde: unknown): string;
}

interface MetEenheid {
  toNumber(eenheid?: string): number;
  formatUnits(): string;
}

function heeftEenheid(v: unknown): v is MetEenheid {
  return typeof v === 'object' && v !== null
    && typeof (v as MetEenheid).toNumber === 'function'
    && typeof (v as MetEenheid).formatUnits === 'function';
}

/** Een hoogte als getal in mm. Gooit met de reden. */
export function hoogteInMm(tekst: string, r: Pick<IframeRekenaar, 'reken'>): number {
  const m = tekst.match(MAAT_RE);
  const kern = m?.[1] ?? '';
  const factor = MM_PER[(m?.[2] ?? 'mm').toLowerCase()];
  if (GETAL_RE.test(kern)) return parseFloat(kern) * factor;
  const f = kern.match(FORMULE_RE);
  if (!f) throw new Error(`"${tekst}" is geen hoogte; schrijf 120mm, 12cm, 450px of {{naam}}`);
  let v: unknown;
  try {
    v = r.reken(f[1]);
  } catch (err) {
    throw new Error(`{{${f[1]}}} is niet uit te rekenen: ${(err as Error).message}`);
  }
  if (heeftEenheid(v)) {
    try {
      return v.toNumber('mm');
    } catch {
      throw new Error(`{{${f[1]}}} is geen lengte (${v.formatUnits()})`);
    }
  }
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) throw new Error(`{{${f[1]}}} is geen getal`);
  return n * factor;
}

/** Rekent een `@iframe`-regel door. Gooit niet: wat misgaat, wordt een melding. */
export function bouwIframe(node: IframeNode, r: IframeRekenaar): EvaluatedIframe {
  const meldingen = [...node.fouten];
  const meld = (t: string) => meldingen.push(`iframe-blok: ${t}`);

  /** Vult `{{…}}` in; `codeer` maakt de waarden veilig om in een adres te staan. */
  const vul = (t: string, codeer: boolean): string | null => {
    let gelukt = true;
    const uit = t.replace(INVULLING_RE, (_m, e: string) => {
      try {
        const w = r.alsTekst(r.reken(e));
        return codeer ? encodeURIComponent(w) : w;
      } catch (err) {
        meld(`{{${e}}} is niet uit te rekenen: ${(err as Error).message}`);
        gelukt = false;
        return '';
      }
    });
    return gelukt ? uit : null;
  };

  // `{{…}}` als het hele adres is een volledig adres in een tekst; de toets
  // hieronder ziet ook dan wat er echt ingevuld is.
  const heel = FORMULE_RE.test(node.url) && !node.url.slice(2).includes('{{');
  const ingevuld = node.url ? vul(node.url, !heel) : null;
  let url: string | null = null;
  if (ingevuld !== null) {
    const a = iframeAdres(ingevuld);
    if (a.url !== undefined) url = a.url;
    else meld(a.fout);
  }

  let hoogteMm = IFRAME_STANDAARD_MM;
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

  const titel = node.titel ? vul(node.titel, false) ?? undefined : undefined;
  return { type: 'iframe', url, hoogteMm, scripts: node.scripts, ...(titel ? { titel } : {}), meldingen };
}

/** Het blok in de uitwerking: de meldingen en het kader; zonder geldig adres alleen de meldingen. */
export function renderIframe(node: EvaluatedIframe): string {
  const meldingen = node.meldingen.map((m) => `<p class="calc-iframe-melding">${escapeHtml(m)}</p>`).join('');
  if (node.url === null) return `<div class="calc-iframe calc-iframe-geweigerd">${meldingen}</div>`;
  const url = escapeHtml(node.url);
  const titel = node.titel ? escapeHtml(node.titel) : '';
  return `<div class="calc-iframe" data-iframe-url="${url}"${node.scripts ? ' data-iframe-scripts="ja"' : ''}${titel ? ` data-iframe-titel="${titel}"` : ''}>${meldingen}`
    + `<div class="calc-iframe-vak" style="height:${node.hoogteMm}mm"><div class="calc-iframe-kader">`
    + `<span class="calc-iframe-kop">${titel || 'Externe pagina'}</span><span class="calc-iframe-url">${url}</span>`
    + `</div></div><p class="calc-iframe-bron">${titel ? `${titel}: ` : ''}${url}</p></div>`;
}
