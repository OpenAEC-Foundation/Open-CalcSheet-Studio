/**
 * Het soort element dat een rekenblad beschrijft, herkend aan de namen van zijn
 * variabelen. Dit is een hulpmiddel en geen waarheid: het herkent hoogstens het
 * sóórt element, nooit wélk element. Welk element een toetsing beschrijft, weet
 * alleen de constructeur (`elementen` op het blad).
 *
 * Elk blad staat in het IFCX, herkend of niet. Herkennen levert alleen een
 * element in de ruimtelijke boom op.
 */
import type { EvaluatedAssignment, EvaluatedNode, EvaluatedVarDisplay } from '../types.js';

interface Binding {
  name: string;
  /** Het getal uit de uitkomst, bijvoorbeeld 150 uit "150 mm"; NaN als het geen getal is. */
  value: number;
  /** De eenheid, bijvoorbeeld "mm"; leeg als er geen is. */
  unit: string;
}

function parseScalar(name: string, raw: string, unitHint: string): Binding {
  const m = String(raw).match(/^\s*(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\s*(.*)$/);
  if (m) return { name, value: parseFloat(m[1]), unit: (unitHint || m[2] || '').trim() };
  return { name, value: Number.NaN, unit: unitHint };
}

function verzamel(nodes: EvaluatedNode[]): Binding[] {
  const uit: Binding[] = [];
  const loop = (lijst: EvaluatedNode[]): void => {
    for (const n of lijst) {
      if (n.type === 'assignment') {
        const a = n as EvaluatedAssignment;
        if (typeof a.result === 'string' && !a.result.startsWith('Error')) uit.push(parseScalar(a.name, a.result, a.unit));
      } else if (n.type === 'var-display') {
        const v = n as EvaluatedVarDisplay;
        uit.push(parseScalar(v.name, v.result, v.unit));
      } else if (n.type === 'input-prompt') {
        // Een maat is vaak invoer en wordt niet nog eens getoond.
        uit.push(parseScalar(n.name, n.currentValue.replace(',', '.'), n.unit));
      } else if (n.type === 'conditional-branch') {
        loop(n.children);
      }
    }
  };
  loop(nodes);
  return uit;
}

function naarMm(b: Binding): number {
  if (!Number.isFinite(b.value)) return Number.NaN;
  const u = b.unit.toLowerCase();
  if (u === 'mm') return b.value;
  if (u === 'm' || u === '') return b.value * 1000;
  if (u === 'cm') return b.value * 10;
  return Number.NaN;
}

function zoek(bindings: Binding[], namen: readonly string[]): Binding | undefined {
  for (const doel of namen) {
    const precies = bindings.find((b) => b.name === doel);
    if (precies) return precies;
  }
  // Hoofdletterongevoelig als terugval, maar niet bij namen van één teken: in
  // constructieve notatie is `d` de nuttige hoogte en `D` een diameter, `h` een
  // hoogte en `H` een horizontale kracht.
  for (const doel of namen) {
    if (doel.length <= 1) continue;
    const klein = doel.toLowerCase();
    const gevonden = bindings.find((b) => b.name.toLowerCase() === klein);
    if (gevonden) return gevonden;
  }
  return undefined;
}

export type ElementSoort = 'paal' | 'fundering' | 'balk';

export interface HerkendElement {
  soort: ElementSoort;
  /** Maten in mm; ontbreekt als het blad ze niet noemt. */
  lengte?: number;
  breedte?: number;
  hoogte?: number;
}

export interface Herkenning {
  elementen: HerkendElement[];
  bouwlagen?: number;
  /** Hoogte van het gebouw in mm. */
  gebouwhoogte?: number;
}

const maat = (n: number | undefined) => (n !== undefined && Number.isFinite(n) ? n : undefined);

/** Wat er aan elementen en gebouwmaten uit de variabelenamen van een blad valt te lezen. */
export function herken(nodes: EvaluatedNode[]): Herkenning {
  const b = verzamel(nodes);
  const uit: Herkenning = { elementen: [] };

  const lagen = zoek(b, ['n_story', 'n_stories', 'nStories', 'nStorey']);
  const hoogte = zoek(b, ['h_Building', 'hBuilding', 'h_building']);
  if (lagen && Number.isFinite(lagen.value)) uit.bouwlagen = Math.max(1, Math.round(lagen.value));
  if (hoogte) uit.gebouwhoogte = maat(naarMm(hoogte));

  // Paal: alleen op namen die niets anders kunnen betekenen. Elke doorsnede
  // heeft een `d` en elke overspanning een `L`.
  const D = zoek(b, ['D_paal', 'd_paal', 'D_eq', 'D_paal_eq']);
  const L = zoek(b, ['L_paal', 'l_paal']);
  if (D && L) uit.elementen.push({ soort: 'paal', breedte: maat(naarMm(D)), lengte: maat(naarMm(L)) });

  const bF = zoek(b, ['b_fdn', 'b_fdn_1', 'b_fdn1']);
  const lF = zoek(b, ['l_fdn', 'l_fdn_1', 'l_fdn1']);
  const tF = zoek(b, ['t_fdn', 'h_fdn']);
  if (bF && lF) {
    uit.elementen.push({
      soort: 'fundering',
      breedte: maat(naarMm(bF)),
      lengte: maat(naarMm(lF)),
      hoogte: tF ? maat(naarMm(tF)) : undefined,
    });
  }

  const span = zoek(b, ['L_beam', 'L_balk', 'span', 'L']);
  const bB = zoek(b, ['b_beam', 'b_balk', 'b']);
  const hB = zoek(b, ['h_beam', 'h_balk', 'h']);
  const MEd = zoek(b, ['M_Ed', 'MEd']);
  const ucB = zoek(b, ['UC_M', 'uc_buiging']);
  if ((MEd || ucB) && (bB || hB)) {
    uit.elementen.push({
      soort: 'balk',
      lengte: span ? maat(naarMm(span)) : undefined,
      breedte: bB ? maat(naarMm(bB)) : undefined,
      hoogte: hB ? maat(naarMm(hB)) : undefined,
    });
  }

  return uit;
}
