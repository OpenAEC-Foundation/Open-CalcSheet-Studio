import { combineerLasten, femStaafAssen, femStaafPunt, femStaafVrijheden, vDot, vLengte, vMaal, vMin, vPlus, type Vec3 } from './femStaven.js';
import type { DrieDElement, FemStaafLast, FemStaafRekenmodel, FemStaafUitkomstCompact, Punt3D } from './types.js';

/**
 * De uitkomsten van een `@fem`-blok met staven (femStaafBlok.ts): de rekengevallen zoals
 * FEM Studio ze rekende, de combinaties als lineaire som waar dat mag, en wat het blad
 * ermee doet: de snedekracht en de doorbuiging op een plaats langs een staaf, de
 * uitersten, de knoopverplaatsingen en reacties, de snedekrachten als invoer voor een
 * toets, de lijnen als SVG en het staafwerk in een `@3d`-blok.
 *
 * Tekens (de assen van een staaf staan in femStaven.ts):
 *   N    positief bij trek;
 *   M    (M_y) positief bij trek aan de onderzijde van de staaf, de kant van −z lokaal; bij
 *        een staande staaf is dat de kant van −x;
 *   V    (V_z) = dM/dx, met x van het begin naar het eind van de staaf;
 *   w    de doorbuiging loodrecht op de staaf ten opzichte van de koorde door zijn
 *        verplaatste einden, positief naar de onderzijde;
 *   u_x, u_y, u_z   verplaatsingen in de globale assen (z omhoog): omlaag is negatief;
 *   R_x, R_y, R_z   reacties in de globale assen: omhoog is positief; een moment is
 *        positief volgens de rechterhandregel om de as.
 * Eenheden: kN, kNm, mm, m.
 *
 * Tussen de knopen
 * ----------------
 * Per deel van een staaf (tussen twee knopen) zijn van elke snedekracht vijf waarden
 * bewaard. Daardoor gaat één veelterm van de vierde graad: binnen een deel is de last een
 * rechte lijn (femStaven.ts), dus de momentenlijn van de derde graad, en de veelterm geeft
 * de lijn van FEM Studio terug. De doorbuiging tussen twee knopen volgt uit die
 * momentenlijn: w″ = M/(EI), twee keer geïntegreerd tussen de verplaatsingen van de
 * knopen. Dat is geen eigen berekening van het staafwerk: de knoopverplaatsingen en de
 * momenten zijn die van FEM Studio.
 */

/** De snedekrachten, in de volgorde van het bewaarde antwoord van een ruimtelijk staafwerk. */
export type FemSnedekracht = 'N' | 'Vy' | 'Vz' | 'T' | 'My' | 'Mz';
const RUIM: readonly FemSnedekracht[] = ['N', 'Vy', 'Vz', 'T', 'My', 'Mz'];
const VLAK: readonly FemSnedekracht[] = ['N', 'Vz', 'My'];
/** Wat `fem_staaf` kan geven. */
export type FemStaafGrootheid = FemSnedekracht | 'w' | 'v' | 'ux' | 'uy' | 'uz';

/** Eén geval of combinatie, uitgerekend. */
export interface FemStaafSet {
  naam: string;
  soort: 'geval' | 'combinatie';
  u: Float64Array;
  s: Float64Array;
  R: Float64Array;
  /** De knikfactoren; leeg als ze er niet zijn (ook bij een opgetelde combinatie). */
  alpha: number[];
  /** De weggevallen staven die alleen trek opnemen. */
  inactief: number[];
  tweede?: { iteraties: number; versterking: number };
  /** De belasting en de reacties samen (kN): in X, Y en Z. */
  last: Vec3;
  reactie: Vec3;
}

/** De rekengevallen met hun antwoord, en de combinaties met de factor per belastinggeval. */
export interface FemStaafBron {
  uitkomst: FemStaafUitkomstCompact;
  /** De namen van de belastinggevallen van het blok, in volgorde. */
  gevallen: string[];
  combinaties: { naam: string; factoren: number[] }[];
}

interface StaafInfo {
  naam: string;
  L: number;
  ex: Vec3;
  ey: Vec3;
  ez: Vec3;
  /** De afstand van elke knoop tot het begin (m). */
  s: number[];
  /** De plek van het eerste deel in de bewaarde snedekrachten. */
  basis: number;
  /** E·I_y en E·I_z (kNm²). */
  EIy: number;
  EIz: number;
}

const TAU = [0, 0.25, 0.5, 0.75, 1];
/** MONO[k][j]: de coëfficiënt van τ^k in de veelterm die 1 is op monster j en 0 op de andere. */
const MONO: number[][] = (() => {
  const uit = Array.from({ length: 5 }, () => new Array<number>(5).fill(0));
  for (let j = 0; j < 5; j++) {
    let c = [1];
    let noemer = 1;
    for (let i = 0; i < 5; i++) {
      if (i === j) continue;
      const n = new Array<number>(c.length + 1).fill(0);
      c.forEach((v, k) => {
        n[k + 1] += v;
        n[k] -= v * TAU[i];
      });
      c = n;
      noemer *= TAU[j] - TAU[i];
    }
    c.forEach((v, k) => {
      uit[k][j] = v / noemer;
    });
  }
  return uit;
})();

/** De coëfficiënten a₀ … a₄ van de veelterm door vijf monsters. */
function veelterm(m: ArrayLike<number>, plek: number): number[] {
  return MONO.map((rij) => rij[0] * m[plek] + rij[1] * m[plek + 1] + rij[2] * m[plek + 2] + rij[3] * m[plek + 3] + rij[4] * m[plek + 4]);
}
const horner = (a: number[], t: number) => (((a[4] * t + a[3]) * t + a[2]) * t + a[1]) * t + a[0];
/** De veelterm twee keer geïntegreerd, met nul aan beide einden: Σ aₖ·(τ^(k+2) − τ)/((k+1)(k+2)). */
function dubbel(a: number[], t: number): number {
  let som = 0;
  let macht = t * t;
  for (let k = 0; k < 5; k++) {
    som += (a[k] * (macht - t)) / ((k + 1) * (k + 2));
    macht *= t;
  }
  return som;
}

/** Zoveel punten per deel voor een uiterste of een lijn: de vijf monsters horen erbij. */
const FIJN = 20;

/**
 * Het doorgerekende staafwerk, zoals het onder de naam van het blok in de scope staat.
 * De knopen en tussenpunten zijn die van het bewaarde verzoek.
 */
export class FemStaafModel {
  readonly naam: string;
  readonly m: FemStaafRekenmodel;
  readonly sets = new Map<string, FemStaafSet>();
  readonly staven: StaafInfo[];
  readonly krachten: readonly FemSnedekracht[];
  /** Het aantal vrijheidsgraden per knoop en per oplegging: 3 of 6. */
  readonly nU: number;
  /** De belastinggevallen van het blok en de combinaties met hun factoren, voor het beeld van de lasten. */
  readonly gevallen: string[];
  readonly combinaties: { naam: string; factoren: number[] }[];
  /** De namen die het blok in de scope zette; een volgend blok met dezelfde naam haalt ze weg. */
  namen: string[] = [];
  private readonly uiterst = new Map<string, { min: number; max: number; xMin: number; xMax: number }>();

  constructor(naam: string, m: FemStaafRekenmodel, bron: FemStaafBron) {
    this.naam = naam;
    this.m = m;
    this.krachten = m.vlak ? VLAK : RUIM;
    this.nU = m.vlak ? 3 : 6;
    this.gevallen = bron.gevallen;
    this.combinaties = bron.combinaties;
    let basis = 0;
    this.staven = m.staven.map((st, i) => {
      const as = femStaafAssen(m, i);
      const a = femStaafPunt(m, st.knopen[0]);
      const s = st.knopen.map((k) => vLengte(vMin(femStaafPunt(m, k), a)));
      s[s.length - 1] = as.L;
      const d = m.doorsneden[st.doorsnede];
      const E = m.materialen[d.materiaal].E * 1000;
      const info: StaafInfo = { naam: st.naam, ...as, s, basis, EIy: E * d.Iy, EIz: E * d.Iz };
      basis += (st.knopen.length - 1) * this.krachten.length * 5;
      return info;
    });
    const N = m.x.length * this.nU;
    const R = m.steunen.length * this.nU;
    bron.uitkomst.gevallen.forEach((g, i) => {
      const geval = m.gevallen[i];
      if (!geval) return;
      if (g.u.length !== N || g.s.length !== basis || g.R.length !== R) throw new Error('het vastgelegde antwoord past niet bij zijn staafwerk');
      this.sets.set(geval.naam, {
        naam: geval.naam, soort: geval.soort,
        u: Float64Array.from(g.u), s: Float64Array.from(g.s), R: Float64Array.from(g.R),
        alpha: g.alpha ?? [], inactief: g.inactief ?? [], ...(g.tweede ? { tweede: g.tweede } : {}),
        last: g.som.last, reactie: g.som.reactie,
      });
    });
    // Een combinatie zonder eigen berekening is de som van haar gevallen.
    for (const c of bron.combinaties) {
      if (this.sets.has(c.naam)) continue;
      const delen = c.factoren.map((f, i) => ({ f, set: this.sets.get(bron.gevallen[i]) })).filter((d) => d.f !== 0);
      if (delen.some((d) => !d.set || d.set.soort !== 'geval')) continue;
      const som: FemStaafSet = {
        naam: c.naam, soort: 'combinatie', u: new Float64Array(N), s: new Float64Array(basis), R: new Float64Array(R),
        alpha: [], inactief: [], last: [0, 0, 0], reactie: [0, 0, 0],
      };
      for (const { f, set } of delen) {
        const g = set!;
        for (let k = 0; k < N; k++) som.u[k] += f * g.u[k];
        for (let k = 0; k < basis; k++) som.s[k] += f * g.s[k];
        for (let k = 0; k < R; k++) som.R[k] += f * g.R[k];
        som.last = vPlus(som.last, vMaal(g.last, f));
        som.reactie = vPlus(som.reactie, vMaal(g.reactie, f));
      }
      this.sets.set(c.naam, som);
    }
  }

  toString(): string {
    return `FEM-model ${this.naam}`;
  }

  /** De set met deze naam; werpt met de namen die er wel zijn. */
  set(naam: string): FemStaafSet {
    const s = this.sets.get(naam);
    if (!s) throw new Error(`het model ${this.naam} heeft geen geval of combinatie "${naam}" (wel: ${[...this.sets.keys()].join(', ')})`);
    return s;
  }

  /** De sets van de omhullende: de combinaties, of zonder combinaties de gevallen. */
  omhullendeSets(): FemStaafSet[] {
    const alle = [...this.sets.values()];
    const combinaties = alle.filter((s) => s.soort === 'combinatie');
    return combinaties.length ? combinaties : alle;
  }

  /** De staaf bij naam of nummer (vanaf 1). */
  staaf(ref: string | number): number {
    const i = typeof ref === 'number' ? ref - 1 : this.staven.findIndex((s) => s.naam === ref);
    if (!Number.isInteger(i) || i < 0 || i >= this.staven.length) {
      throw new Error(`het model ${this.naam} heeft geen staaf ${typeof ref === 'number' ? ref : `"${ref}"`} (wel: ${this.staven.map((s) => s.naam).join(', ')})`);
    }
    return i;
  }

  /** De knoop van het model met deze naam. */
  knoop(naam: string): number {
    const k = naam ? this.m.knopen.indexOf(naam) : -1;
    if (k < 0) throw new Error(`het model ${this.naam} heeft geen knoop "${naam}" (wel: ${this.m.knopen.filter(Boolean).join(', ')})`);
    return k;
  }

  /** De oplegging op een knoop, of −1. */
  steunOp(knoop: number): number {
    return this.m.steunen.findIndex((s) => s.knoop === knoop);
  }

  /** Het deel van de staaf waarin x ligt en de plaats daarin (0 … 1); op een knoop het deel erna. */
  private deel(st: StaafInfo, x: number): { d: number; t: number } {
    if (!(x >= -1e-9 && x <= st.L + 1e-9)) throw new Error(`x = ${Number(x.toPrecision(6))} m ligt niet op de staaf ${st.naam} (lengte ${Number(st.L.toPrecision(6))} m)`);
    const n = st.s.length - 1;
    let d = 0;
    while (d < n - 1 && x >= st.s[d + 1] - 1e-9) d++;
    const l = st.s[d + 1] - st.s[d];
    return { d, t: Math.min(1, Math.max(0, (x - st.s[d]) / l)) };
  }

  private plek(st: StaafInfo, d: number, q: number): number {
    return st.basis + (d * this.krachten.length + q) * 5;
  }

  private kolom(k: FemSnedekracht): number {
    const q = this.krachten.indexOf(k);
    if (q < 0) throw new Error(`een vlak staafwerk heeft N, V en M, geen ${k}`);
    return q;
  }

  /** De snedekracht op de afstand x van het begin van een staaf (kN, kNm). */
  kracht(set: FemStaafSet, staaf: number, k: FemSnedekracht, x: number): number {
    const st = this.staven[staaf];
    const { d, t } = this.deel(st, x);
    const p = this.plek(st, d, this.kolom(k));
    if (t <= 0) return set.s[p];
    if (t >= 1) return set.s[p + 4];
    return horner(veelterm(set.s, p), t);
  }

  /** De snedekracht op de punten van een lijn: per deel FIJN + 1 punten, met de afstand tot het begin. */
  lijn(set: FemStaafSet, staaf: number, k: FemSnedekracht): { x: number; v: number }[] {
    const st = this.staven[staaf];
    const q = this.kolom(k);
    const uit: { x: number; v: number }[] = [];
    for (let d = 0; d + 1 < st.s.length; d++) {
      const p = this.plek(st, d, q);
      const a = veelterm(set.s, p);
      const l = st.s[d + 1] - st.s[d];
      for (let j = 0; j <= FIJN; j++) {
        const t = j / FIJN;
        uit.push({ x: st.s[d] + t * l, v: j === 0 ? set.s[p] : j === FIJN ? set.s[p + 4] : j % 5 === 0 ? set.s[p + j / 5] : horner(a, t) });
      }
    }
    return uit;
  }

  /**
   * De grootste en kleinste snedekracht van een staaf, met de plaats. Per deel eerst op de
   * punten van de lijn; ligt het uiterste tussen twee punten (het grootste moment waar de
   * dwarskracht nul is), dan op de top van de veelterm zelf.
   */
  uitersten(set: FemStaafSet, staaf: number, k: FemSnedekracht): { min: number; max: number; xMin: number; xMax: number } {
    const sleutel = `${set.naam}|${staaf}|${k}`;
    let u = this.uiterst.get(sleutel);
    if (!u) {
      const st = this.staven[staaf];
      const q = this.kolom(k);
      const uit = { min: Infinity, max: -Infinity, xMin: 0, xMax: 0 };
      for (let d = 0; d + 1 < st.s.length; d++) {
        const p = this.plek(st, d, q);
        const a = veelterm(set.s, p);
        const l = st.s[d + 1] - st.s[d];
        const v = Array.from({ length: FIJN + 1 }, (_, j) => (j === 0 ? set.s[p] : j === FIJN ? set.s[p + 4] : j % 5 === 0 ? set.s[p + j / 5] : horner(a, j / FIJN)));
        let [jMax, jMin] = [0, 0];
        v.forEach((w, j) => {
          if (w > v[jMax]) jMax = j;
          if (w < v[jMin]) jMin = j;
        });
        for (const [j, teken] of [[jMax, 1], [jMin, -1]] as const) {
          let [t, w] = [j / FIJN, v[j]];
          if (j > 0 && j < FIJN) {
            // Newton op de afgeleide, binnen de twee punten ernaast.
            let top = t;
            for (let n = 0; n < 12; n++) {
              const d1 = a[1] + top * (2 * a[2] + top * (3 * a[3] + top * 4 * a[4]));
              const d2 = 2 * a[2] + top * (6 * a[3] + top * 12 * a[4]);
              if (!(Math.abs(d2) > 1e-14)) break;
              const volgende = top - d1 / d2;
              if (!(volgende > (j - 1) / FIJN && volgende < (j + 1) / FIJN)) break;
              const klaar = Math.abs(volgende - top) < 1e-13;
              top = volgende;
              if (klaar) break;
            }
            const wTop = horner(a, top);
            if (teken * wTop > teken * w) [t, w] = [top, wTop];
          }
          if (teken > 0 && w > uit.max) [uit.max, uit.xMax] = [w, st.s[d] + t * l];
          if (teken < 0 && w < uit.min) [uit.min, uit.xMin] = [w, st.s[d] + t * l];
        }
      }
      u = uit;
      this.uiterst.set(sleutel, u);
    }
    return u;
  }

  /** De verplaatsing van een knoop (m): u_x, u_y, u_z. */
  knoopU(set: FemStaafSet, knoop: number): Vec3 {
    const p = knoop * this.nU;
    return this.m.vlak ? [set.u[p], 0, set.u[p + 1]] : [set.u[p], set.u[p + 1], set.u[p + 2]];
  }

  /** De verdraaiing van een knoop (rad): r_x, r_y, r_z. */
  knoopR(set: FemStaafSet, knoop: number): Vec3 {
    const p = knoop * this.nU;
    return this.m.vlak ? [0, set.u[p + 2], 0] : [set.u[p + 3], set.u[p + 4], set.u[p + 5]];
  }

  /** De doorbuiging binnen een deel ten opzichte van de rechte tussen zijn knopen, langs lokale z en y (m). */
  private bol(set: FemStaafSet, st: StaafInfo, d: number, t: number): [number, number] {
    if (t <= 0 || t >= 1) return [0, 0];
    const l = st.s[d + 1] - st.s[d];
    // w″ = M_y/(E·I_y) langs z; langs y is het v″ = −M_z/(E·I_z).
    const z = (dubbel(veelterm(set.s, this.plek(st, d, this.kolom('My'))), t) * l * l) / st.EIy;
    const y = this.m.vlak ? 0 : (-dubbel(veelterm(set.s, this.plek(st, d, this.kolom('Mz'))), t) * l * l) / st.EIz;
    return [z, y];
  }

  /** De verplaatsing op de afstand x van het begin van een staaf, in de globale assen (m). */
  verplaatsing(set: FemStaafSet, staaf: number, x: number): Vec3 {
    const st = this.staven[staaf];
    const { d, t } = this.deel(st, x);
    const k = this.m.staven[staaf].knopen;
    const [a, b] = [this.knoopU(set, k[d]), this.knoopU(set, k[d + 1])];
    const [z, y] = this.bol(set, st, d, t);
    return vPlus(vPlus(vPlus(vMaal(a, 1 - t), vMaal(b, t)), vMaal(st.ez, z)), vMaal(st.ey, y));
  }

  /**
   * De doorbuiging op x ten opzichte van de koorde door de verplaatste einden van de staaf
   * (mm): langs lokale z positief naar de onderzijde, langs lokale y positief langs y.
   */
  doorbuiging(set: FemStaafSet, staaf: number, x: number, as: 'z' | 'y' = 'z'): number {
    const st = this.staven[staaf];
    const k = this.m.staven[staaf].knopen;
    const e = as === 'z' ? st.ez : st.ey;
    const koorde = vPlus(vMaal(this.knoopU(set, k[0]), 1 - x / st.L), vMaal(this.knoopU(set, k[k.length - 1]), x / st.L));
    const w = vDot(vMin(this.verplaatsing(set, staaf, x), koorde), e) * 1000;
    return as === 'z' ? -w : w;
  }

  /** De plaatsen langs een staaf voor een lijn of een uiterste van de doorbuiging. */
  plaatsen(staaf: number): number[] {
    const st = this.staven[staaf];
    const uit: number[] = [];
    for (let d = 0; d + 1 < st.s.length; d++) {
      for (let j = d === 0 ? 0 : 1; j <= FIJN; j++) uit.push(j === FIJN ? st.s[d + 1] : st.s[d] + ((st.s[d + 1] - st.s[d]) * j) / FIJN);
    }
    return uit;
  }

  /** De grootste en kleinste doorbuiging van een staaf ten opzichte van zijn koorde (mm). */
  doorbuigingUitersten(set: FemStaafSet, staaf: number, as: 'z' | 'y' = 'z'): { min: number; max: number; xMin: number; xMax: number } {
    const sleutel = `${set.naam}|${staaf}|w${as}`;
    let u = this.uiterst.get(sleutel);
    if (!u) {
      u = { min: Infinity, max: -Infinity, xMin: 0, xMax: 0 };
      for (const x of this.plaatsen(staaf)) {
        const w = this.doorbuiging(set, staaf, x, as);
        if (w > u.max) [u.max, u.xMax] = [w, x];
        if (w < u.min) [u.min, u.xMin] = [w, x];
      }
      this.uiterst.set(sleutel, u);
    }
    return u;
  }

  /** De reactie van een oplegging (kN, kNm), per vrijheidsgraad van het model. */
  reactie(set: FemStaafSet, steun: number): number[] {
    return Array.from(set.R.subarray(steun * this.nU, (steun + 1) * this.nU));
  }

  /** De lasten van een geval of combinatie, in de assen van FEM Studio. */
  lasten(set: string): FemStaafLast[] {
    const eigen = this.m.gevallen.find((g) => g.naam === set);
    if (eigen) return eigen.lasten;
    const c = this.combinaties.find((x) => x.naam === set);
    if (!c) throw new Error(`het model ${this.naam} heeft geen geval of combinatie "${set}"`);
    return combineerLasten(this.gevallen.map((g) => this.m.gevallen.find((x) => x.naam === g)?.lasten ?? []), c.factoren);
  }
}

// ── Grootheden ───────────────────────────────────────────────────────────────

/** De naam van een grootheid zoals het blad hem schrijft: "M", "V_z", "u_x", … */
export function femStaafGrootheid(model: FemStaafModel, naam: string): FemStaafGrootheid {
  const s = naam.trim().toLowerCase().replace(/[_,\s]/g, '');
  const vlak = model.m.vlak;
  const kaart: Record<string, FemStaafGrootheid> = {
    n: 'N', vz: 'Vz', my: 'My', w: 'w', ux: 'ux', uz: 'uz',
    ...(vlak ? { v: 'Vz', m: 'My' } : { vy: 'Vy', t: 'T', mt: 'T', mx: 'T', mz: 'Mz', uy: 'uy', v: 'v' }),
  };
  const g = kaart[s];
  if (!g) {
    throw new Error(`onbekende grootheid "${naam}" (${vlak ? 'een vlak staafwerk heeft N, V, M, w, ux en uz' : 'een ruimtelijk staafwerk heeft N, Vy, Vz, T, My, Mz, w, v, ux, uy en uz'})`);
  }
  return g;
}

const isVerplaatsing = (g: FemStaafGrootheid): g is 'w' | 'v' | 'ux' | 'uy' | 'uz' => g === 'w' || g === 'v' || g === 'ux' || g === 'uy' || g === 'uz';
/** De eenheid van een grootheid: kN, kNm of mm. */
export const femStaafEenheid = (g: FemStaafGrootheid): 'kN' | 'kNm' | 'mm' => (isVerplaatsing(g) ? 'mm' : g === 'My' || g === 'Mz' || g === 'T' ? 'kNm' : 'kN');

function opPlaats(model: FemStaafModel, s: FemStaafSet, staaf: number, g: FemStaafGrootheid, x: number): number {
  if (g === 'w') return model.doorbuiging(s, staaf, x, 'z');
  if (g === 'v') return model.doorbuiging(s, staaf, x, 'y');
  if (isVerplaatsing(g)) return model.verplaatsing(s, staaf, x)[g === 'ux' ? 0 : g === 'uy' ? 1 : 2] * 1000;
  return model.kracht(s, staaf, g, x);
}

/**
 * De waarde op de afstand x (m) van het begin van een staaf: een snedekracht in kN of kNm,
 * een doorbuiging of verplaatsing in mm. De set "max" of "min" geeft de omhullende over de
 * combinaties op die plaats.
 */
export function femStaafWaarde(model: FemStaafModel, set: string, staaf: string | number, grootheid: string, x: number): number {
  const i = model.staaf(staaf);
  const g = femStaafGrootheid(model, grootheid);
  if ((set === 'max' || set === 'min') && !model.sets.has(set)) {
    const waarden = model.omhullendeSets().map((s) => opPlaats(model, s, i, g, x));
    return set === 'max' ? Math.max(...waarden) : Math.min(...waarden);
  }
  return opPlaats(model, model.set(set), i, g, x);
}

/**
 * Een grootheid van een knoop: de verplaatsing ("ux", "uy", "uz" in mm), de verdraaiing
 * ("rx", "ry", "rz" in rad) of de reactie van de oplegging op die knoop ("Rx", "Ry", "Rz"
 * in kN, "Mx", "My", "Mz" in kNm).
 */
export function femStaafKnoop(model: FemStaafModel, set: string, knoop: string, grootheid: string): { waarde: number; eenheid: 'mm' | 'rad' | 'kN' | 'kNm' } {
  const s = model.set(set);
  const k = model.knoop(knoop);
  const g = grootheid.trim().replace(/[_\s]/g, '');
  const as = 'xyz'.indexOf(g.slice(-1).toLowerCase());
  const soort = g.slice(0, -1);
  if (as < 0 || !['u', 'r', 'R', 'M'].includes(soort) || g.length !== 2) throw new Error(`onbekende grootheid "${grootheid}" (een knoop heeft ux, uy, uz, rx, ry, rz, en met een oplegging Rx, Ry, Rz, Mx, My, Mz)`);
  if (soort === 'u') return { waarde: model.knoopU(s, k)[as] * 1000, eenheid: 'mm' };
  if (soort === 'r') return { waarde: model.knoopR(s, k)[as], eenheid: 'rad' };
  const st = model.steunOp(k);
  if (st < 0) throw new Error(`de knoop ${knoop} heeft geen oplegging`);
  const vrijheid = `${soort === 'R' ? 'u' : 'r'}${'xyz'[as]}` as 'ux';
  const plek = femStaafVrijheden(model.m).indexOf(vrijheid);
  return { waarde: plek < 0 ? 0 : model.reactie(s, st)[plek], eenheid: soort === 'R' ? 'kN' : 'kNm' };
}

/**
 * De snedekrachten van een staaf als rijen voor een toets (`forces_envelope`): per
 * combinatie en per station [nummer, x (m), N, V_y, V_z, M_t, M_y, M_z] in kN en kNm. Per
 * deel van de staaf vijf stations; op een knoop met een sprong (een puntlast) twee rijen.
 * De combinaties krijgen de nummers 1, 2, … in de volgorde waarin ze gevraagd zijn.
 */
export function femStaafKrachten(model: FemStaafModel, staaf: string | number, sets: string[]): number[][] {
  const i = model.staaf(staaf);
  const st = model.staven[i];
  if (!sets.length) throw new Error('geef minstens één geval of combinatie');
  const uit: number[][] = [];
  sets.forEach((naam, c) => {
    const s = model.set(naam);
    let vorige: number[] | null = null;
    for (let d = 0; d + 1 < st.s.length; d++) {
      for (let j = 0; j <= 4; j++) {
        const x = j === 4 ? st.s[d + 1] : st.s[d] + ((st.s[d + 1] - st.s[d]) * j) / 4;
        const krachten = RUIM.map((k) => {
          const q = model.krachten.indexOf(k);
          return q < 0 ? 0 : s.s[st.basis + (d * model.krachten.length + q) * 5 + j];
        });
        const rij = [c + 1, x, ...krachten];
        // Het begin van een deel is het eind van het vorige: alleen bij een sprong twee rijen.
        if (j === 0 && vorige && vorige.slice(2).every((v, n) => Math.abs(v - krachten[n]) <= 1e-9)) continue;
        uit.push(rij);
        vorige = rij;
      }
    }
  });
  return uit;
}

// ── Tekenen ──────────────────────────────────────────────────────────────────

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f1 = (n: number) => String(Math.round(n * 10) / 10);
/** Een getal voor op papier: drie cijfers, met de komma als dat de taal is. */
function getalTekst(v: number, taal: string): string {
  const a = Math.abs(v);
  const t = a >= 100 ? v.toFixed(0) : a >= 10 ? v.toFixed(1) : v.toFixed(2);
  const n = /^-0([.,]0+)?$/.test(t) ? t.slice(1) : t;
  return taal === 'nl' ? n.replace('.', ',') : n;
}

const INKT = '#1e293b';
const GRIJS = '#64748b';
const BLAUW = '#1d4ed8';
const ROOD = '#b91c1c';
const LAST = '#b45309';

interface Kader {
  breedte: number;
  hoogte: number;
  schaal: number;
  /** Een punt van het model op het papier. */
  p(punt: Vec3): [number, number];
}

/** Het vlak x–z op papier, z omhoog, met ruimte rondom voor de lijnen en de getallen. */
function kader(m: FemStaafRekenmodel, breedte: number, boven: number, onder: number, zij: number): Kader {
  const x0 = Math.min(...m.x), x1 = Math.max(...m.x), z0 = Math.min(...m.z), z1 = Math.max(...m.z);
  const schaal = Math.min((breedte - 2 * zij) / Math.max(x1 - x0, 1e-9), 380 / Math.max(z1 - z0, 1e-9));
  const hoogte = boven + (z1 - z0) * schaal + onder;
  const dx = (breedte - (x1 - x0) * schaal) / 2;
  return { breedte, hoogte, schaal, p: (punt) => [dx + (punt[0] - x0) * schaal, boven + (z1 - punt[2]) * schaal] };
}

/** Een richting van het model op papier (z omhoog wordt y omlaag), als eenheidsvector. */
const opPapier = (v: Vec3): [number, number] => {
  const l = Math.hypot(v[0], v[2]) || 1;
  return [v[0] / l, -v[2] / l];
};

/** De staven als lijnen; een staaf die alleen trek opneemt gestreept, een scharnier als rondje. */
function stavenSvg(m: FemStaafRekenmodel, k: Kader, kleur = INKT, dikte = 2.2): string {
  const uit: string[] = [];
  m.staven.forEach((st, i) => {
    const [a, b] = [k.p(femStaafPunt(m, st.knopen[0])), k.p(femStaafPunt(m, st.knopen[st.knopen.length - 1]))];
    uit.push(`<line x1="${f1(a[0])}" y1="${f1(a[1])}" x2="${f1(b[0])}" y2="${f1(b[1])}" stroke="${kleur}" stroke-width="${st.trek ? dikte * 0.6 : dikte}"${st.trek ? ' stroke-dasharray="7 3"' : ''} stroke-linecap="round"/>`);
    const e = opPapier(femStaafAssen(m, i).ex);
    const rondje = (p: [number, number], f: number) => `<circle cx="${f1(p[0] + f * 7 * e[0])}" cy="${f1(p[1] + f * 7 * e[1])}" r="3" fill="#fff" stroke="${kleur}" stroke-width="1.2"/>`;
    if (st.scharnier[0]) uit.push(rondje(a, 1));
    if (st.scharnier[1]) uit.push(rondje(b, -1));
  });
  return uit.join('');
}

/** Het teken van een oplegging: scharnier, rol, inklemming of veer. */
function steunenSvg(m: FemStaafRekenmodel, k: Kader): string {
  const uit: string[] = [];
  const lijn = (x1: number, y1: number, x2: number, y2: number, dikte = 1.4) => `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${INKT}" stroke-width="${dikte}"/>`;
  /** Een grondlijn met arcering, loodrecht op (nx, ny), door (x, y). */
  const grond = (x: number, y: number, nx: number, ny: number) => {
    const [tx, ty] = [-ny, nx];
    let s = lijn(x - 10 * tx, y - 10 * ty, x + 10 * tx, y + 10 * ty);
    for (let j = -2; j <= 2; j++) s += lijn(x + 4 * j * tx, y + 4 * j * ty, x + 4 * j * tx + 4 * (nx - tx), y + 4 * j * ty + 4 * (ny - ty), 0.8);
    return s;
  };
  const zigzag = (x: number, y: number, nx: number, ny: number) => {
    const [tx, ty] = [-ny, nx];
    let d = `M${f1(x)} ${f1(y)}`;
    for (let j = 1; j <= 6; j++) d += `L${f1(x + nx * (2 + j * 2.4) + tx * (j % 2 ? 3.5 : -3.5))} ${f1(y + ny * (2 + j * 2.4) + ty * (j % 2 ? 3.5 : -3.5))}`;
    d += `L${f1(x + nx * 19)} ${f1(y + ny * 19)}`;
    return `<path d="${d}" fill="none" stroke="${INKT}" stroke-width="1.2"/>${grond(x + nx * 19, y + ny * 19, nx, ny)}`;
  };
  for (const st of m.steunen) {
    const [x, y] = k.p(femStaafPunt(m, st.knoop));
    const [ux, uz, ry] = m.vlak ? st.vast : [st.vast[0], st.vast[2], st.vast[4]];
    const driehoek = (nx: number, ny: number) => {
      const [tx, ty] = [-ny, nx];
      return `<path d="M${f1(x)} ${f1(y)}L${f1(x + 12 * nx - 8 * tx)} ${f1(y + 12 * ny - 8 * ty)}L${f1(x + 12 * nx + 8 * tx)} ${f1(y + 12 * ny + 8 * ty)}Z" fill="#fff" stroke="${INKT}" stroke-width="1.4"/>`;
    };
    if (ux === true && uz === true && ry === true) {
      // Ingeklemd: een arcering haaks op de staaf die er aankomt.
      const staaf = m.staven.findIndex((s) => s.knopen.includes(st.knoop));
      const as = femStaafAssen(m, Math.max(0, staaf));
      const begin = m.staven[Math.max(0, staaf)].knopen[0] === st.knoop;
      const e = opPapier(as.ex);
      const [nx, ny] = begin ? [-e[0], -e[1]] : [e[0], e[1]];
      uit.push(grond(x, y, nx, ny).replace('stroke-width="1.4"', 'stroke-width="2.6"'));
      continue;
    }
    if (ux === true && uz === true) uit.push(driehoek(0, 1) + grond(x, y + 12, 0, 1));
    else if (uz === true) uit.push(driehoek(0, 1) + lijn(x - 10, y + 15.5, x + 10, y + 15.5));
    else if (ux === true) uit.push(driehoek(-1, 0) + lijn(x - 15.5, y - 10, x - 15.5, y + 10));
    if (typeof uz === 'number') uit.push(zigzag(x, y, 0, 1));
    if (typeof ux === 'number') uit.push(zigzag(x, y, -1, 0));
    if (ry === true || typeof ry === 'number') uit.push(`<path d="M${f1(x + 6)} ${f1(y)}a6 6 0 1 0 -6 6" fill="none" stroke="${INKT}" stroke-width="1.2"/>`);
  }
  return uit.join('');
}

/** De namen van de staven en de knopen, klein, bij het schema. */
function namenSvg(m: FemStaafRekenmodel, k: Kader): string {
  const uit: string[] = [];
  const tekst = (x: number, y: number, t: string, stijl: string) => `<text x="${f1(x)}" y="${f1(y)}" font-size="10" ${stijl} stroke="#fff" stroke-width="2.5" paint-order="stroke">${esc(t)}</text>`;
  /** Een tekst die van de lijn af loopt: links ervan eindigt hij op het punt, rechts begint hij er. */
  const anker = (dx: number) => (dx < -0.3 ? 'end' : dx > 0.3 ? 'start' : 'middle');
  m.staven.forEach((st, i) => {
    const as = femStaafAssen(m, i);
    const [a, b] = [k.p(femStaafPunt(m, st.knopen[0])), k.p(femStaafPunt(m, st.knopen[st.knopen.length - 1]))];
    const n = opPapier(as.ez);
    uit.push(tekst((a[0] + b[0]) / 2 + 8 * n[0], (a[1] + b[1]) / 2 + 8 * n[1] + 3, st.naam, `text-anchor="${anker(n[0])}" font-style="italic" fill="${GRIJS}"`));
  });
  const metSteun = new Set(m.steunen.map((s) => s.knoop));
  m.knopen.forEach((naam, i) => {
    if (!naam) return;
    const [x, y] = k.p(femStaafPunt(m, i));
    // Weg van de staven die aan de knoop zitten, en niet in het teken van een oplegging eronder.
    let [sx, sy] = [0, 0];
    m.staven.forEach((st, j) => {
      const e = opPapier(femStaafAssen(m, j).ex);
      if (st.knopen[0] === i) [sx, sy] = [sx + e[0], sy + e[1]];
      if (st.knopen[st.knopen.length - 1] === i) [sx, sy] = [sx - e[0], sy - e[1]];
    });
    const l = Math.hypot(sx, sy);
    let [dx, dy] = l < 0.2 ? [0, -1] : [-sx / l, -sy / l];
    if (metSteun.has(i) && dy > 0.2) [dx, dy] = [dx < 0 ? -1 : 1, -0.2];
    uit.push(tekst(x + 11 * dx, y + 11 * dy + 3.5, naam, `text-anchor="${anker(dx)}" font-weight="600" fill="${INKT}"`));
  });
  return uit.join('');
}

const kop = (klasse: string, k: Kader, label: string) =>
  `<svg class="${klasse}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${k.breedte} ${f1(k.hoogte)}" width="100%" style="max-width:${k.breedte}px" font-family="sans-serif" role="img" aria-label="${esc(label)}">`;
const titel = (k: Kader, t: string) => `<text x="${f1(k.breedte / 2)}" y="16" text-anchor="middle" font-size="12.5" font-weight="600" fill="${INKT}">${t}</text>`;

/**
 * Het schema van het staafwerk zelf, zonder uitkomsten: de staven, de scharnieren, de
 * opleggingen en de namen. Op het blad bij het blok, om de invoer na te kijken.
 */
export function femStaafModelSvg(m: FemStaafRekenmodel, _taal = 'nl', breedte = 520): string {
  if (!m.vlak) return '';
  const k = kader(m, breedte, 22, 34, 40);
  return `${kop('calc-fem-model', k, 'model')}${stavenSvg(m, k)}${steunenSvg(m, k)}${namenSvg(m, k)}</svg>`;
}

/** Een pijl van (x1, y1) naar de punt (x2, y2). */
function pijl(x1: number, y1: number, x2: number, y2: number, kleur: string, dikte = 1.1): string {
  const l = Math.hypot(x2 - x1, y2 - y1) || 1;
  const [ex, ey] = [(x2 - x1) / l, (y2 - y1) / l];
  const [bx, by] = [x2 - 5 * ex, y2 - 5 * ey];
  return `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(bx)}" y2="${f1(by)}" stroke="${kleur}" stroke-width="${dikte}"/>`
    + `<path d="M${f1(x2)} ${f1(y2)}L${f1(bx - 2.4 * ey)} ${f1(by + 2.4 * ex)}L${f1(bx + 2.4 * ey)} ${f1(by - 2.4 * ex)}Z" fill="${kleur}"/>`;
}

/** De lasten van een geval of combinatie op het schema: lijnlasten als een rij pijlen, knooplasten als één pijl. */
function lastenSvg(model: FemStaafModel, set: string, k: Kader, taal: string): string {
  const m = model.m;
  const lasten = model.lasten(set);
  const qMax = Math.max(1e-12, ...lasten.map((l) => (l.soort === 'lijn' ? Math.max(Math.abs(l.q1), Math.abs(l.q2)) : 0)));
  const uit: string[] = [];
  const label = (x: number, y: number, t: string) => `<text x="${f1(x)}" y="${f1(y)}" text-anchor="middle" font-size="10" fill="${LAST}" stroke="#fff" stroke-width="2.5" paint-order="stroke">${esc(t)}</text>`;
  for (const l of lasten) {
    if (l.soort === 'knoop') {
      const [x, y] = k.p(femStaafPunt(m, l.knoop));
      const F = Math.hypot(l.F[0], l.F[2]);
      if (!(F > 0)) continue;
      const d = opPapier(l.F);
      uit.push(pijl(x - 34 * d[0], y - 34 * d[1], x, y, LAST, 1.6));
      uit.push(label(x - 42 * d[0], y - 42 * d[1] + 3, `${getalTekst(F, taal)} kN`));
      continue;
    }
    const as = femStaafAssen(m, l.staaf);
    const a = femStaafPunt(m, m.staven[l.staaf].knopen[0]);
    const richting: Vec3 = l.as === 'x' ? [1, 0, 0] : l.as === 'z' ? [0, 0, 1] : l.as === 'lz' ? as.ez : [0, 0, 0];
    const lengte = (q: number) => (Math.abs(q) > 0 ? 9 + (21 * Math.abs(q)) / qMax : 0);
    const staart = (s: number, q: number): [number, number] => {
      const [x, y] = k.p(vPlus(a, vMaal(as.ex, s)));
      const d = opPapier(vMaal(richting, Math.sign(q) || 1));
      return [x - lengte(q) * d[0], y - lengte(q) * d[1]];
    };
    const n = Math.max(2, Math.min(14, Math.round(((l.tot - l.van) * k.schaal) / 16) + 1));
    const staarten: [number, number][] = [];
    for (let j = 0; j < n; j++) {
      const s = l.van + ((l.tot - l.van) * j) / (n - 1);
      const q = l.q1 + ((l.q2 - l.q1) * j) / (n - 1);
      const punt = k.p(vPlus(a, vMaal(as.ex, s)));
      const t = staart(s, q);
      staarten.push(t);
      if (Math.abs(q) > 0) uit.push(pijl(t[0], t[1], punt[0], punt[1], LAST));
    }
    uit.push(`<path d="${staarten.map((p, j) => `${j ? 'L' : 'M'}${f1(p[0])} ${f1(p[1])}`).join('')}" fill="none" stroke="${LAST}" stroke-width="1.1"/>`);
    const midden = staarten[Math.floor(n / 2)];
    const d = opPapier(vMaal(richting, Math.sign(l.q1 + l.q2) || 1));
    const waarde = Math.abs(l.q1 - l.q2) < 1e-9 * qMax ? getalTekst(Math.abs(l.q1), taal) : `${getalTekst(Math.abs(l.q1), taal)} … ${getalTekst(Math.abs(l.q2), taal)}`;
    const soort = l.projectie ? (taal === 'nl' ? ' (projectie)' : ' (projection)') : '';
    uit.push(label(midden[0] - 8 * d[0], midden[1] - 8 * d[1] + 3, `${waarde} kN/m${soort}`));
  }
  return uit.join('');
}

/** Labels die niet over elkaar vallen: een tweede getal op dezelfde plek schuift op of valt weg. */
function labelPlaatser(): (x: number, y: number, tekst: string, kleur: string) => string {
  const gezet: { x: number; y: number; tekst: string }[] = [];
  return (x, y, tekst, kleur) => {
    let py = y;
    for (let poging = 0; poging < 4; poging++) {
      const botst = gezet.find((g) => Math.abs(g.x - x) < 34 && Math.abs(g.y - py) < 11);
      if (!botst) break;
      if (botst.tekst === tekst) return '';
      py += 11;
    }
    gezet.push({ x, y: py, tekst });
    return `<text x="${f1(x)}" y="${f1(py)}" text-anchor="middle" font-size="10.5" font-weight="600" fill="${kleur}" stroke="#fff" stroke-width="3" paint-order="stroke">${esc(tekst)}</text>`;
  };
}

const LIJN_TITEL: Readonly<Record<string, string>> = { N: 'N', Vz: 'V', My: 'M' };

/**
 * Een beeld van een vlak staafwerk als SVG, voor papier:
 *   "M", "V", "N"   de lijn op de staven, met de uitersten per staaf als getal. M staat aan
 *                   de trekzijde, V en N positief aan de bovenzijde van de staaf;
 *   "u"             de vervormde stand, vergroot, met de grootste verplaatsing;
 *   "lasten"        het schema met de lasten van het geval of de combinatie.
 * De set "omhullende" tekent bij M, V en N de grootste en de kleinste lijn over de
 * combinaties. `breedte` in px; op papier schaalt het beeld mee met de kolom.
 */
export function femStaafSvg(model: FemStaafModel, set: string, grootheid: string, breedte = 640, taal = 'nl'): string {
  const m = model.m;
  if (!m.vlak) throw new Error('een beeld als SVG is er voor een vlak staafwerk; teken een ruimtelijk staafwerk in een @3d-blok (fem model geval M)');
  const soort = grootheid.trim().toLowerCase();
  const k = kader(m, breedte, 78, 84, 66);
  const naam = `${esc(model.naam)} · ${esc(set)}`;
  if (soort === 'lasten' || soort === 'last' || soort === 'loads') {
    return `${kop('calc-fem-beeld', k, `${model.naam} ${set}`)}${titel(k, `${naam} · ${taal === 'nl' ? 'lasten' : 'loads'}`)}${stavenSvg(m, k)}${steunenSvg(m, k)}${lastenSvg(model, set, k, taal)}</svg>`;
  }
  const omhullende = set === 'omhullende' || set === 'envelope';
  const sets = omhullende ? model.omhullendeSets() : [model.set(set)];
  const label = labelPlaatser();

  if (soort === 'u' || soort === 'vervorming') {
    if (omhullende) throw new Error('de vervormde stand hoort bij één geval of combinatie');
    const s = sets[0];
    let grootste = 0;
    let plek: Vec3 = [0, 0, 0];
    let waar: Vec3 = [0, 0, 0];
    const lijnen = m.staven.map((st, i) => {
      const a = femStaafPunt(m, st.knopen[0]);
      const ex = model.staven[i].ex;
      return model.plaatsen(i).map((x) => {
        const p = vPlus(a, vMaal(ex, x));
        const u = model.verplaatsing(s, i, x);
        const l = Math.hypot(u[0], u[2]);
        if (l > grootste) [grootste, plek, waar] = [l, p, u];
        return { p, u };
      });
    });
    const factor = grootste > 0 ? 34 / (grootste * k.schaal) : 0;
    const vervormd = lijnen.map((punten) => `<path d="${punten.map((q, j) => {
      const [x, y] = k.p(vPlus(q.p, vMaal(q.u, factor)));
      return `${j ? 'L' : 'M'}${f1(x)} ${f1(y)}`;
    }).join('')}" fill="none" stroke="${BLAUW}" stroke-width="2"/>`).join('');
    const [gx, gy] = k.p(vPlus(plek, vMaal(waar, factor)));
    const maat = grootste > 0
      ? `<circle cx="${f1(gx)}" cy="${f1(gy)}" r="3" fill="none" stroke="${BLAUW}" stroke-width="1.5"/>${label(gx, gy + (waar[2] <= 0 ? 16 : -8), `${getalTekst(grootste * 1000, taal)} mm`, BLAUW)}`
      : '';
    const vergroot = factor > 0 ? ` (× ${Number(factor.toPrecision(2))})` : '';
    return `${kop('calc-fem-beeld', k, `${model.naam} ${set} u`)}${titel(k, `${naam} · ${taal === 'nl' ? 'vervorming' : 'deformation'}${vergroot} [mm]`)}${stavenSvg(m, k, '#94a3b8', 1.4)}${steunenSvg(m, k)}${vervormd}${maat}</svg>`;
  }

  const g = femStaafGrootheid(model, grootheid);
  if (isVerplaatsing(g)) throw new Error(`een beeld is er van M, V, N, u (de vervormde stand) en lasten, niet van "${grootheid}"`);
  const eenheid = femStaafEenheid(g);
  // De lijn per staaf: bij de omhullende de grootste en de kleinste over de sets.
  const lijnen = m.staven.map((_, i) => {
    const per = sets.map((s) => model.lijn(s, i, g));
    return per[0].map((p, j) => ({ x: p.x, hoog: Math.max(...per.map((l) => l[j].v)), laag: Math.min(...per.map((l) => l[j].v)) }));
  });
  const grootste = Math.max(1e-12, ...lijnen.flat().map((p) => Math.max(Math.abs(p.hoog), Math.abs(p.laag))));
  const maat = 44 / grootste;
  // Een moment staat aan de trekzijde: positief aan de onderzijde. V en N positief aan de bovenzijde.
  const kant = g === 'My' ? -1 : 1;
  const vlakken: string[] = [];
  const getallen: string[] = [];
  m.staven.forEach((st, i) => {
    const info = model.staven[i];
    const a = femStaafPunt(m, st.knopen[0]);
    const n = opPapier(vMaal(info.ez, kant));
    const as = lijnen[i].map((p) => k.p(vPlus(a, vMaal(info.ex, p.x))));
    const krom = (welke: 'hoog' | 'laag') => lijnen[i].map((p, j): [number, number] => [as[j][0] + n[0] * p[welke] * maat, as[j][1] + n[1] * p[welke] * maat]);
    const pad = (punten: [number, number][]) => punten.map((p, j) => `${j ? 'L' : 'M'}${f1(p[0])} ${f1(p[1])}`).join('');
    const terug = [...as].reverse().map((p) => `L${f1(p[0])} ${f1(p[1])}`).join('');
    for (const welke of omhullende ? (['hoog', 'laag'] as const) : (['hoog'] as const)) {
      const punten = krom(welke);
      vlakken.push(`<path d="${pad(punten)}${terug}Z" fill="${BLAUW}" fill-opacity="0.13" stroke="none"/><path d="${pad(punten)}" fill="none" stroke="${BLAUW}" stroke-width="1.2"/>`);
    }
    // De uitersten van de staaf als getal, aan de kant van de lijn.
    const zet = (welke: 'hoog' | 'laag', j: number) => {
      const v = lijnen[i][j][welke];
      if (Math.abs(v) < 0.02 * grootste) return;
      const p = krom(welke)[j];
      const uit = Math.sign(v) || 1;
      getallen.push(label(p[0] + n[0] * uit * 9, p[1] + n[1] * uit * 9 + 3.5, getalTekst(v, taal), v < 0 ? ROOD : BLAUW));
    };
    let [jMax, jMin] = [0, 0];
    lijnen[i].forEach((p, j) => {
      if (p.hoog > lijnen[i][jMax].hoog) jMax = j;
      if (p.laag < lijnen[i][jMin].laag) jMin = j;
    });
    zet('hoog', jMax);
    if (lijnen[i][jMin].laag < -0.02 * grootste || omhullende) zet('laag', jMin);
  });
  const kopje = `${naam} · ${LIJN_TITEL[g] ?? g} [${eenheid}]`;
  return `${kop('calc-fem-beeld', k, `${model.naam} ${set} ${g}`)}${titel(k, kopje)}${vlakken.join('')}${stavenSvg(m, k)}${steunenSvg(m, k)}${getallen.join('')}</svg>`;
}

// ── In 3D ────────────────────────────────────────────────────────────────────

const KLEUR_HOUT = '#E3C08A';
const KLEUR_LIJN = '#334155';
const KLEUR_GRIJS = '#94a3b8';
const KLEUR_STEUN = '#fbbf24';
const KLEUR_PLUS = '#93c5fd';
const KLEUR_MIN = '#fca5a5';

/**
 * Het staafwerk voor een `@3d`-blok: de staven met hun echte doorsnede (een rechthoek als
 * balk, een vrije doorsnede als lijn), de opleggingen, en
 *   "M", "V", "N", …  de lijn als een gekleurd vlak langs elke staaf, met de uitersten;
 *   "u"               de vervormde stand, vergroot, met de grootste verplaatsing.
 * `factor` zet m om naar de eenheid van de scène; `hoogte` is de getekende hoogte van het
 * grootste getal in die eenheid (standaard 12 % van het staafwerk, bij "u" 8 %).
 */
export function femStaaf3D(model: FemStaafModel, set: string, grootheid: string, factor: number, hoogte: number | null): DrieDElement[] {
  const m = model.m;
  const s = model.set(set);
  const r = (v: number) => Math.round(v * 1e4) / 1e4;
  const punt = (p: Vec3): Punt3D => [r(p[0] * factor), r(p[1] * factor), r(p[2] * factor)];
  const maat = Math.max(Math.max(...m.x) - Math.min(...m.x), Math.max(...m.y) - Math.min(...m.y), Math.max(...m.z) - Math.min(...m.z)) * factor;
  const uit: DrieDElement[] = [];
  const staaf = (i: number, van: Vec3, naar: Vec3, kleur: string, echt: boolean) => {
    const d = m.doorsneden[m.staven[i].doorsnede];
    if (vLengte(vMin(naar, van)) * factor < 1e-4) return;
    if (echt && d.b && d.h) uit.push({ soort: 'balk', van: punt(van), naar: punt(naar), b: r(d.b * factor), h: r(d.h * factor), kleur });
    else uit.push({ soort: 'staaf', van: punt(van), naar: punt(naar), kleur });
  };
  for (const st of m.steunen) {
    const vast = st.vast.filter((v) => v === true).length;
    const type = vast === st.vast.length ? 'inklemming' : vast >= (m.vlak ? 2 : 3) ? 'scharnier' : 'rol';
    uit.push({ soort: 'oplegging', plek: punt(femStaafPunt(m, st.knoop)), type, grootte: -1, kleur: KLEUR_STEUN });
  }
  const getal = (v: number, eenheid: string) => `${String(Number(v.toPrecision(3)))} ${eenheid}`;
  const soort = grootheid.trim().toLowerCase();

  if (soort === 'u' || soort === 'vervorming') {
    // De grootste verplaatsing op de fijne plaatsen, zoals in het beeld op papier: het
    // getal hangt niet af van het aantal stukken waarmee de staaf getekend is.
    let top: { p: Vec3; u: Vec3; l: number } | null = null;
    m.staven.forEach((st, i) => {
      const a = femStaafPunt(m, st.knopen[0]);
      for (const x of model.plaatsen(i)) {
        const u = model.verplaatsing(s, i, x);
        const l = vLengte(u);
        if (!top || l > top.l) top = { p: vPlus(a, vMaal(model.staven[i].ex, x)), u, l };
      }
    });
    const t = top as { p: Vec3; u: Vec3; l: number } | null;
    const grootste = t?.l ?? 0;
    const h = hoogte ?? 0.08 * maat;
    const schaal = grootste > 0 ? h / (grootste * factor) : 0;
    m.staven.forEach((st, i) => {
      const a = femStaafPunt(m, st.knopen[0]);
      staaf(i, a, femStaafPunt(m, st.knopen[st.knopen.length - 1]), KLEUR_GRIJS, false);
      // Per deel twee stukken: genoeg voor een vloeiende lijn, weinig elementen.
      const punten = model.staven[i].s
        .flatMap((x, d, alle) => (d + 1 < alle.length ? [x, (x + alle[d + 1]) / 2] : [x]))
        .map((x) => vPlus(vPlus(a, vMaal(model.staven[i].ex, x)), vMaal(model.verplaatsing(s, i, x), schaal)));
      for (let j = 0; j + 1 < punten.length; j++) staaf(i, punten[j], punten[j + 1], KLEUR_HOUT, true);
    });
    if (t && t.l > 0) uit.push({ soort: 'tekst', plek: punt(vPlus(t.p, vMaal(t.u, schaal))), tekst: getal(t.l * 1000, 'mm'), kleur: '#1e3a8a' });
    return uit;
  }

  const g = femStaafGrootheid(model, grootheid);
  if (isVerplaatsing(g)) throw new Error(`in een @3d-blok tekent fem de lijn van een snedekracht of u (de vervormde stand), niet "${grootheid}"`);
  const lijnen = m.staven.map((_, i) => model.lijn(s, i, g).filter((_p, j) => (j % (FIJN + 1)) % 5 === 0));
  const grootste = Math.max(1e-12, ...lijnen.flat().map((p) => Math.abs(p.v)));
  const h = hoogte ?? 0.12 * maat;
  const eenheid = femStaafEenheid(g);
  m.staven.forEach((st, i) => {
    const info = model.staven[i];
    const a = femStaafPunt(m, st.knopen[0]);
    staaf(i, a, femStaafPunt(m, st.knopen[st.knopen.length - 1]), KLEUR_HOUT, true);
    // M_y aan de trekzijde (onder), de andere positief langs de lokale z; M_z en V_y langs y.
    const richting = g === 'My' ? vMaal(info.ez, -1) : g === 'Mz' || g === 'Vy' ? info.ey : info.ez;
    const as = lijnen[i].map((p) => vPlus(a, vMaal(info.ex, p.x)));
    const top = lijnen[i].map((p, j) => vPlus(as[j], vMaal(richting, (p.v / grootste) * h / factor)));
    const n = as.length;
    const vlakken: [number, number, number, number][] = [];
    const kleuren: string[] = [];
    for (let j = 0; j + 1 < n; j++) {
      if (lijnen[i][j + 1].x - lijnen[i][j].x < 1e-9) continue;
      vlakken.push([j, j + 1, n + j + 1, n + j]);
      kleuren.push(lijnen[i][j].v + lijnen[i][j + 1].v >= 0 ? KLEUR_PLUS : KLEUR_MIN);
    }
    if (lijnen[i].some((p) => Math.abs(p.v) > 0.005 * grootste)) {
      uit.push({ soort: 'net', punten: [...as, ...top].map(punt), vlakken, kleuren, kleur: KLEUR_LIJN });
    }
    let [jMax, jMin] = [0, 0];
    lijnen[i].forEach((p, j) => {
      if (p.v > lijnen[i][jMax].v) jMax = j;
      if (p.v < lijnen[i][jMin].v) jMin = j;
    });
    for (const j of jMax === jMin ? [jMax] : [jMax, jMin]) {
      const v = lijnen[i][j].v;
      if (Math.abs(v) > 0.005 * grootste) uit.push({ soort: 'tekst', plek: punt(top[j]), tekst: getal(v, eenheid), kleur: v < 0 ? '#991b1b' : '#1e3a8a' });
    }
  });
  return uit;
}
