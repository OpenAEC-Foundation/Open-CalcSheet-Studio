import type { Unit as MathUnit } from 'mathjs';
import { math } from './eenheden.js';

/**
 * Het eenhedenstelsel: per grootheid de eenheid waarin een waarde in beeld komt
 * (docs/superpowers/specs/2026-11-06-eenheden-design.md).
 *
 * Het stelsel raakt alleen de weergave. De rekenkern rekent in de eenheden van de
 * bladtekst; pas bij het tonen gaat een waarde naar de eenheid van zijn grootheid.
 */

export type Grootheid =
  | 'lengte'
  | 'maat'
  | 'oppervlakte'
  | 'doorsnedeOppervlakte'
  | 'weerstandsmoment'
  | 'traagheidsmoment'
  | 'kracht'
  | 'moment'
  | 'lijnlast'
  | 'vlakbelasting'
  | 'spanning'
  | 'volumegewicht'
  | 'massa'
  | 'temperatuur';

/** De eenheid per grootheid, in de schrijfwijze van de rekenkern (`kip ft`, `N / mm^2`). */
export type Stelsel = Partial<Record<Grootheid, string>>;

/** De kant-en-klare sets. "Zoals in het blad" is geen set: dan is er geen stelsel. */
export const STELSELS = {
  'si-mm': {
    lengte: 'm', maat: 'mm', oppervlakte: 'm^2', doorsnedeOppervlakte: 'mm^2',
    weerstandsmoment: 'mm^3', traagheidsmoment: 'mm^4', kracht: 'kN', moment: 'kN m',
    lijnlast: 'kN / m', vlakbelasting: 'kN / m^2', spanning: 'N / mm^2',
    volumegewicht: 'kN / m^3', massa: 'kg', temperatuur: 'degC',
  },
  'si-m': {
    lengte: 'm', maat: 'm', oppervlakte: 'm^2', doorsnedeOppervlakte: 'm^2',
    weerstandsmoment: 'm^3', traagheidsmoment: 'm^4', kracht: 'kN', moment: 'kN m',
    lijnlast: 'kN / m', vlakbelasting: 'kPa', spanning: 'MPa',
    volumegewicht: 'kN / m^3', massa: 'kg', temperatuur: 'degC',
  },
  us: {
    lengte: 'ft', maat: 'in', oppervlakte: 'ft^2', doorsnedeOppervlakte: 'in^2',
    weerstandsmoment: 'in^3', traagheidsmoment: 'in^4', kracht: 'kip', moment: 'kip ft',
    lijnlast: 'klf', vlakbelasting: 'psf', spanning: 'ksi',
    volumegewicht: 'pcf', massa: 'lb', temperatuur: 'degF',
  },
} as const satisfies Record<string, Required<Stelsel>>;

/**
 * Herkend aan de naam. De dimensie alleen is hier niet genoeg: een overspanning
 * (m) en een doorsnedemaat (mm) zijn allebei een lengte, en een vlakbelasting en
 * een spanning hebben allebei de dimensie van een druk. De schrijver van het blad
 * koos de eenheid, en daarmee de grootheid. Een temperatuur in K staat er niet in:
 * in een blad is dat bijna altijd een verschil.
 */
const OP_NAAM: Record<string, Grootheid> = {
  m: 'lengte', km: 'lengte', ft: 'lengte', yd: 'lengte', mi: 'lengte',
  mm: 'maat', cm: 'maat', dm: 'maat', in: 'maat', inch: 'maat',
  'm^2': 'oppervlakte', 'ft^2': 'oppervlakte', sqft: 'oppervlakte',
  'mm^2': 'doorsnedeOppervlakte', 'cm^2': 'doorsnedeOppervlakte', 'in^2': 'doorsnedeOppervlakte', 'inch^2': 'doorsnedeOppervlakte', sqin: 'doorsnedeOppervlakte',
  'mm^3': 'weerstandsmoment', 'cm^3': 'weerstandsmoment', 'in^3': 'weerstandsmoment', 'inch^3': 'weerstandsmoment',
  'mm^4': 'traagheidsmoment', 'cm^4': 'traagheidsmoment', 'm^4': 'traagheidsmoment', 'in^4': 'traagheidsmoment', 'inch^4': 'traagheidsmoment',
  'kN/m^2': 'vlakbelasting', 'N/m^2': 'vlakbelasting', kPa: 'vlakbelasting', Pa: 'vlakbelasting', psf: 'vlakbelasting', ksf: 'vlakbelasting',
  'N/mm^2': 'spanning', 'kN/mm^2': 'spanning', MPa: 'spanning', GPa: 'spanning', psi: 'spanning', ksi: 'spanning',
  degC: 'temperatuur', degF: 'temperatuur',
};

/** Herkend aan de dimensie, voor eenheden die niet in OP_NAAM staan (`N mm`, `lbf / ft`). */
const OP_DIMENSIE: [string, Grootheid][] = [
  ['N', 'kracht'],
  ['N m', 'moment'],
  ['N / m', 'lijnlast'],
  ['N / m^3', 'volumegewicht'],
  ['kg', 'massa'],
];

/** Een onbekende druk onder deze grens (in Pa) is een vlakbelasting, erboven een spanning. */
const DRUKGRENS = 1e5;

function eenheid(naam: string): MathUnit | null {
  try {
    return math.unit(naam);
  } catch {
    return null;
  }
}

/** Bij welke grootheid hoort een waarde in deze eenheid? `null`: bij geen, hij blijft zoals hij is. */
export function grootheidVan(naam: string): Grootheid | null {
  const kort = naam.replace(/\s+/g, '');
  if (OP_NAAM[kort]) return OP_NAAM[kort];
  const u = eenheid(naam);
  if (!u) return null;
  for (const [ref, g] of OP_DIMENSIE) {
    if (u.equalBase(math.unit(ref))) return g;
  }
  if (u.equalBase(math.unit('Pa'))) {
    return math.unit(1, naam).toNumber('Pa') < DRUKGRENS ? 'vlakbelasting' : 'spanning';
  }
  if (u.equalBase(math.unit('m'))) {
    return math.unit(1, naam).toNumber('m') >= 0.3 ? 'lengte' : 'maat';
  }
  return null;
}

/**
 * Het aantal decimalen van een vaste notatie in een andere eenheid, met dezelfde
 * relatieve nauwkeurigheid: het oude aantal plus de afgeronde log10 van
 * (doel / bron), tussen 0 en 6. `:F2` in mm wordt in inch `:F3`.
 */
export function decimalenNa(decimalen: number, bron: string, doel: string): number {
  const verhouding = math.unit(1, doel).toNumber(bron);
  const d = decimalen + Math.round(Math.log10(verhouding));
  return Math.min(6, Math.max(0, d));
}

/**
 * De doeleenheid van een waarde in dit stelsel, of `null` als hij blijft zoals hij
 * is: geen grootheid, geen eenheid in het stelsel, of al in die eenheid.
 */
export function doelInStelsel(bron: string, stelsel: Stelsel): string | null {
  const g = grootheidVan(bron);
  const doel = g ? stelsel[g] : undefined;
  if (!doel || doel.replace(/\s+/g, '') === bron.replace(/\s+/g, '')) return null;
  return doel;
}
