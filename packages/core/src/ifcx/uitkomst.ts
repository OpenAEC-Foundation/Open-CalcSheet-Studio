/**
 * De uitkomst van een doorgerekend blad als gewone gegevens: elke variabele met
 * waarde, eenheid en formule, de unity checks en het oordeel. Zo kan een andere
 * lezer ze gebruiken zonder de rekentaal te kennen.
 *
 * Dit is afgeleid: de app rekent bij het openen opnieuw uit de tekst en de
 * invoer, en leest dit deel niet terug.
 */
import type { EvaluatedDrieD, EvaluatedNode } from '../types.js';
import type { UITKOMST_STATUS } from './namespace.js';

export type UitkomstStatus = (typeof UITKOMST_STATUS)[number];

export interface UitkomstVariabele {
  naam: string;
  /** Zoals het blad hem toont, afgerond: "13.62 N / mm^2". Ook bij een uitkomst die geen getal is. */
  tekst: string;
  /** Het getal in `eenheid`, onafgerond. Ontbreekt bij ∞ of een uitkomst die geen getal is. */
  waarde?: number;
  eenheid?: string;
  formule?: string;
  /** De formule met de getallen ingevuld. */
  invulling?: string;
  /** De kop waaronder de variabele op het blad staat. */
  kop?: string;
  /** De regel staat verborgen (`#hide`): hij rekent mee, maar komt niet op papier. */
  verborgen?: boolean;
}

export interface UitkomstInvoerveld {
  naam: string;
  label?: string;
  soort: 'veld' | 'keuze';
  waarde: string;
  getal?: number;
  eenheid?: string;
  /** Bij een keuzelijst: de tekst van de gekozen regel. */
  keuzeTekst?: string;
}

export interface UitkomstUnityCheck {
  naam: string;
  tekst: string;
  waarde?: number;
  voldoet?: boolean;
}

export interface BladUitkomstGegevens {
  status: UitkomstStatus;
  titel: string;
  norm?: string;
  /** De maatgevende unity check; ontbreekt als het blad er geen noemt, of hij oneindig is. */
  uc?: number;
  /** Alleen bij een maatgevende UC die geen eindig getal is: "∞". */
  ucTekst?: string;
  /** Waarom het blad niet is doorgerekend. */
  fout?: string;
  invoervelden: UitkomstInvoerveld[];
  variabelen: UitkomstVariabele[];
  unityChecks: UitkomstUnityCheck[];
}

/** Het eindoordeel van een blad, zoals de app het leest (`leesResultaat` in bladLezen.ts). */
export interface BladOordeel {
  titel?: string;
  norm?: string;
  uc?: number | null;
  voldoet?: boolean | null;
}

export interface BladFiguur {
  soort: 'svg' | 'plot' | '3d' | 'afbeelding' | 'iframe' | 'ifcx';
  volgnummer: number;
  kop?: string;
  svg?: string;
  scene?: EvaluatedDrieD['scene'];
  bron?: string;
  meldingen?: string[];
}

const zonderOpmaak = (t: string) => t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** Het getal uit een uitkomsttekst, of niets als de tekst geen getal is. */
function getalUit(tekst: string): number | undefined {
  const m = tekst.match(/^\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(?:\s|$)/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

const isUc = (naam: string) => /^uc(?:$|_)/i.test(naam);

/** Loopt de uitgerekende knopen af, ook binnen een voorwaardelijk blok. */
function* alleKnopen(lijst: EvaluatedNode[]): Generator<EvaluatedNode> {
  for (const n of lijst) {
    yield n;
    if (n.type === 'conditional-branch') yield* alleKnopen(n.children);
  }
}

/**
 * Leest de uitkomst uit de uitgerekende knopen. `oordeel` komt van de app, die
 * ook de slotzin van het blad leest; zonder oordeel beslist de maatgevende UC.
 *
 * Staat een naam er vaker, dan telt de laatste, net als in de uitwerking zelf.
 * De tussenstappen staan in de rekentekst.
 */
export function leesUitkomst(nodes: EvaluatedNode[], naam: string, oordeel?: BladOordeel, fout?: string): BladUitkomstGegevens {
  const variabelen = new Map<string, UitkomstVariabele>();
  const invoervelden = new Map<string, UitkomstInvoerveld>();
  let kop: string | undefined;
  let titel: string | undefined = oordeel?.titel;
  let norm: string | undefined = oordeel?.norm;
  let titelGelezen = false;

  for (const n of alleKnopen(nodes)) {
    switch (n.type) {
      case 'heading': {
        const tekst = zonderOpmaak(n.text);
        kop = tekst || kop;
        if (n.level === 1 && !titelGelezen) {
          titelGelezen = true;
          const [voor, na] = n.text.split(/\s+—\s+/, 2);
          titel ??= zonderOpmaak(voor ?? '') || undefined;
          norm ??= na ? zonderOpmaak(na) : undefined;
        }
        break;
      }
      case 'assignment':
      case 'var-display': {
        const tekst = String(n.result);
        const waarde = typeof n.waarde === 'number'
          ? (Number.isFinite(n.waarde) ? n.waarde : undefined)
          : getalUit(tekst);
        const v: UitkomstVariabele = { naam: n.name, tekst };
        if (waarde !== undefined) v.waarde = waarde;
        if (n.unit) v.eenheid = n.unit;
        if (n.type === 'assignment') {
          if (n.expression) v.formule = n.expression;
          if (n.substitution) v.invulling = n.substitution;
          if (n.hidden) v.verborgen = true;
        }
        if (kop) v.kop = kop;
        variabelen.delete(n.name);
        variabelen.set(n.name, v);
        break;
      }
      case 'input-prompt': {
        const veld: UitkomstInvoerveld = { naam: n.name, soort: 'veld', waarde: n.currentValue };
        const label = zonderOpmaak(n.label ?? '');
        if (label) veld.label = label;
        const getal = getalUit(n.currentValue.replace(',', '.'));
        if (getal !== undefined) veld.getal = getal;
        if (n.unit) veld.eenheid = n.unit;
        invoervelden.set(n.name, veld);
        break;
      }
      case 'select': {
        const gekozen = n.options.find((o) => o.value === n.selectedValue);
        const veld: UitkomstInvoerveld = { naam: n.name, soort: 'keuze', waarde: n.selectedValue };
        const label = zonderOpmaak(n.label ?? '');
        if (label) veld.label = label;
        const getal = getalUit(n.selectedValue);
        if (getal !== undefined) veld.getal = getal;
        if (gekozen) veld.keuzeTekst = gekozen.text;
        invoervelden.set(n.name, veld);
        break;
      }
      default:
        break;
    }
  }

  const unityChecks: UitkomstUnityCheck[] = [];
  for (const v of variabelen.values()) {
    if (!isUc(v.naam)) continue;
    const uc: UitkomstUnityCheck = { naam: v.naam, tekst: v.tekst };
    if (v.waarde !== undefined) {
      uc.waarde = v.waarde;
      uc.voldoet = v.waarde <= 1;
    } else if (v.tekst.trim().startsWith('∞')) {
      uc.voldoet = false;
    }
    unityChecks.push(uc);
  }

  // De maatgevende UC: wat de app leest, anders UC_max.
  let uc: number | undefined;
  let ucTekst: string | undefined;
  if (oordeel && oordeel.uc !== undefined && oordeel.uc !== null) {
    if (Number.isFinite(oordeel.uc)) uc = oordeel.uc;
    else ucTekst = '∞';
  } else if (!oordeel || oordeel.uc === undefined) {
    const max = variabelen.get('UC_max');
    if (max?.waarde !== undefined) uc = max.waarde;
    else if (max?.tekst.trim().startsWith('∞')) ucTekst = '∞';
  }

  const voldoet = oordeel?.voldoet !== undefined && oordeel.voldoet !== null
    ? oordeel.voldoet
    : oordeel?.voldoet === null
      ? null
      : uc !== undefined
        ? uc <= 1
        : ucTekst
          ? false
          : null;

  // Een regel die niet uit te rekenen is, gooit het blad niet om: de fout staat
  // in die regel. Zonder oordeel is het blad dan niet doorgerekend.
  const regelFout = [...variabelen.values()].find((v) => v.tekst.startsWith('Error'));
  const melding = fout ?? (regelFout ? `${regelFout.naam}: ${regelFout.tekst}` : undefined);

  const status: UitkomstStatus = fout
    ? 'niet_doorgerekend'
    : voldoet === true
      ? 'voldoet'
      : voldoet === false
        ? 'voldoet_niet'
        : melding
          ? 'niet_doorgerekend'
          : 'geen_oordeel';

  const uit: BladUitkomstGegevens = {
    status,
    titel: titel || naam,
    invoervelden: [...invoervelden.values()],
    variabelen: [...variabelen.values()],
    unityChecks,
  };
  if (norm) uit.norm = norm;
  if (uc !== undefined) uit.uc = uc;
  if (ucTekst) uit.ucTekst = ucTekst;
  if (melding) uit.fout = melding;
  return uit;
}

/** Boven deze lengte blijft een afbeelding in de rekentekst staan en niet ook hier. */
const MAX_BRON = 2000;

/** De tekeningen en 3D-beelden van een doorgerekend blad, in de volgorde van het blad. */
export function leesFiguren(nodes: EvaluatedNode[]): BladFiguur[] {
  const uit: BladFiguur[] = [];
  let kop: string | undefined;
  const voeg = (f: Omit<BladFiguur, 'volgnummer' | 'kop'>) => {
    const figuur: BladFiguur = { ...f, volgnummer: uit.length + 1 };
    if (kop) figuur.kop = kop;
    uit.push(figuur);
  };
  // Een tekening staat vaak als tekstregels in het blad (`'<svg …>` tot `'</svg>`).
  let tekening: string | null = null;
  for (const n of alleKnopen(nodes)) {
    switch (n.type) {
      case 'heading':
        kop = zonderOpmaak(n.text) || kop;
        break;
      case 'text': {
        const begin: number = tekening === null ? n.text.search(/<svg[\s>]/i) : 0;
        if (begin < 0) break;
        const samen: string = (tekening ?? '') + n.text.slice(begin);
        const eind: number = samen.search(/<\/svg\s*>/i);
        if (eind >= 0) {
          voeg({ soort: 'svg', svg: samen.slice(0, samen.indexOf('>', eind) + 1) });
          tekening = null;
        } else {
          tekening = samen;
        }
        break;
      }
      case 'svg':
        voeg({ soort: 'svg', svg: n.content });
        break;
      case 'plot':
        voeg({ soort: 'plot', svg: n.svg });
        break;
      case '3d': {
        const f: Omit<BladFiguur, 'volgnummer' | 'kop'> = { soort: '3d', scene: n.scene };
        if (n.meldingen.length > 0) f.meldingen = n.meldingen;
        voeg(f);
        break;
      }
      case 'image':
        voeg(n.src.length <= MAX_BRON ? { soort: 'afbeelding', bron: n.src } : { soort: 'afbeelding' });
        break;
      case 'iframe':
        voeg(n.url ? { soort: 'iframe', bron: n.url } : { soort: 'iframe' });
        break;
      case 'ifcx':
        // Het model zelf staat als `geometrie` onder de bouwlaag.
        voeg({ soort: 'ifcx' });
        break;
      default:
        break;
    }
  }
  return uit;
}
