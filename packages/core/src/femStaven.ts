import type { FemStaafGevalCompact, FemStaafLast, FemStaafRekenmodel, FemStaafUitkomstCompact } from './types.js';

/**
 * Het rekenmodel van een staafwerk in een `@fem`-blok (femStaafBlok.ts), zonder de
 * rekentaal.
 *
 * CalcSheet rekent het staafwerk niet zelf: dat doet Open FEM Studio
 * (`solve_open_fem_3d_batch`, dezelfde kern als `solve_open_fem_3d`, voor alle
 * rekengevallen in één aanroep). Hier wordt alleen het model opgebouwd en het antwoord
 * compact bewaard.
 *
 * De knopen
 * ---------
 * De knopen van het model zijn de benoemde knopen en de einden van de staven. Een knoop
 * die op de as van een staaf ligt, tussen zijn einden, hoort bij die staaf: de staaf loopt
 * daar door en wat aan die knoop hangt (een hanenbalk, een oplegging) zit eraan vast. Voor
 * FEM Studio blijft het één staaf, met de knoop in `intermediateNodeIds`.
 *
 * Elke staaf krijgt daarnaast tussenpunten, die ook knopen zijn:
 *   • op gelijke delen (`delen`, standaard 4): daar geeft FEM Studio de verplaatsing, en
 *     tussen twee knopen volgt de doorbuiging uit de momentenlijn;
 *   • onder elke puntlast op de staaf: FEM Studio kent een puntlast op een staaf alleen
 *     loodrecht op de as, en een last omlaag op een schuine staaf heeft ook een deel langs
 *     de as. De puntlast wordt daarom een knooplast op een tussenknoop;
 *   • aan het begin en het eind van een lijnlast over een deel van de staaf: zo is de
 *     last binnen elk deel één rechte lijn en de momentenlijn één veelterm.
 * De tussenpunten zijn voor alle rekengevallen dezelfde, zodat de uitkomsten op dezelfde
 * plaatsen staan en een combinatie een gewone som is.
 *
 * Een vlak staafwerk
 * ------------------
 * Met twee coördinaten per knoop (x en z) is het staafwerk vlak: y = 0, en het is uit het
 * vlak gehouden. Elke knoop is vast in u_y, r_x en r_z. FEM Studio verdeelt een staaf voor
 * de knikberekening zelf nog verder, en die punten zijn niet te houden; de doorsnede
 * rekent daarom uit het vlak duizend keer zo stijf als erin (I_z = 1000·I_y). De
 * knikfactor is dan die in het vlak. Knik en kip uit het vlak horen bij de toets van de
 * staaf.
 *
 * De assen van een staaf
 * ----------------------
 * Zoals FEM Studio ze kiest (nagemeten met lokale lasten op de server): x van begin naar
 * eind; y horizontaal, Z × x; z = x × y, dus de kant waar z naar wijst is de bovenzijde.
 * Een staande staaf (|x·Z| > 0,999) heeft z langs de globale X. Een moment M_y is positief
 * bij trek aan de onderzijde (de kant van −z), N is positief bij trek, V_z = dM_y/dx.
 *
 * Eenheden: m, kN, kN/m, kNm; E en G in MPa. Lasten in het rekenmodel staan in de assen
 * van FEM Studio (Z omhoog): een last omlaag is daar negatief.
 */

/** De tool van FEM Studio die een staafwerk rekent: alle rekengevallen in één aanroep. */
export const FEM_STAVEN_TOOL = 'solve_open_fem_3d_batch';
export const FEM_STAVEN_MAX_KNOPEN = 4000;
export const FEM_STAVEN_MAX_STAVEN = 1000;
export const FEM_STAVEN_MAX_GEVALLEN = 200;
/** Zoveel keer stijver dan in het vlak rekent de doorsnede van een vlak staafwerk uit het vlak. */
export const FEM_UIT_HET_VLAK = 1000;

export type Vec3 = [number, number, number];

/** Twee plaatsen dichter bij elkaar dan dit zijn één plaats (m). */
const SAMEN = 1e-6;
/** De grens waarboven FEM Studio een staaf als staand ziet (|e_x·Z|). */
const STAAND = 0.999;
const twaalf = (v: number) => Number(v.toPrecision(12));

export const vMin = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const vPlus = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const vMaal = (a: Vec3, f: number): Vec3 => [a[0] * f, a[1] * f, a[2] * f];
export const vDot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const vKruis = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const vLengte = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const vEenheid = (a: Vec3): Vec3 => vMaal(a, 1 / vLengte(a));

/** De lengte en de lokale assen van een staaf van a naar b, zoals FEM Studio ze kiest. */
export function staafAssen(a: Vec3, b: Vec3): { L: number; ex: Vec3; ey: Vec3; ez: Vec3 } {
  const d = vMin(b, a);
  const L = vLengte(d);
  const ex = vMaal(d, 1 / L);
  if (Math.abs(ex[2]) > STAAND) {
    // Staand: z is de globale X, loodrecht op de as gezet.
    const ez = vEenheid([1 - ex[0] * ex[0], -ex[0] * ex[1], -ex[0] * ex[2]]);
    return { L, ex, ey: vKruis(ez, ex), ez };
  }
  const ey = vEenheid(vKruis([0, 0, 1], ex));
  return { L, ex, ey, ez: vKruis(ex, ey) };
}

/** Een last zoals hij in het blok staat, in getallen en in de assen van FEM Studio. */
export type FemStaafInvoerLast =
  | {
    soort: 'lijn'; staaf: number; as: 'x' | 'y' | 'z' | 'ly' | 'lz'; projectie: boolean;
    q1: number; q2: number;
    /** Het bereik langs de staaf (m); null is het begin of het eind. */
    van: number | null; tot: number | null;
  }
  /** Een puntlast op een staaf, op de afstand a van het begin (m), langs een globale of lokale as (kN). */
  | { soort: 'punt'; staaf: number; a: number; as: 'x' | 'y' | 'z' | 'ly' | 'lz'; F: number }
  | { soort: 'knoop'; knoop: number; F: Vec3 }
  /** Het eigen gewicht van alle staven, of van één: γ·A omlaag per meter staaf. */
  | { soort: 'eigengewicht'; gamma: number; staaf: number | null };

/** Het staafwerk uit het blok, in getallen (m, kN, MPa). */
export interface FemStaafInvoer {
  vlak: boolean;
  analyse: 'lineair' | 'tweede-orde';
  knik: number;
  /** Elke staaf in zoveel gelijke delen. */
  delen: number;
  materialen: FemStaafRekenmodel['materialen'];
  doorsneden: FemStaafRekenmodel['doorsneden'];
  knopen: { naam: string; p: Vec3 }[];
  staven: { naam: string; a: number; b: number; doorsnede: number; scharnier: [boolean, boolean]; trek: boolean }[];
  steunen: FemStaafRekenmodel['steunen'];
  gevallen: { naam: string; lasten: FemStaafInvoerLast[] }[];
  combinaties: { naam: string; factoren: number[] }[];
}

const getalTekst = (v: number) => String(Number(v.toPrecision(6))).replace('.', ',');
const knoopTekst = (k: { naam: string; p: Vec3 }, vlak: boolean) =>
  k.naam || `(${(vlak ? [k.p[0], k.p[2]] : k.p).map(getalTekst).join('; ')})`;

/** De som van lasten maal hun factor, met gelijke lasten samengenomen; een last van nul valt weg. */
export function combineerLasten(lijsten: FemStaafLast[][], factoren: number[]): FemStaafLast[] {
  const lijnen = new Map<string, Extract<FemStaafLast, { soort: 'lijn' }>>();
  const knopen = new Map<number, Vec3>();
  lijsten.forEach((lijst, i) => {
    const f = factoren[i];
    if (!f) return;
    for (const l of lijst) {
      if (l.soort === 'knoop') {
        const al = knopen.get(l.knoop) ?? [0, 0, 0];
        knopen.set(l.knoop, [al[0] + f * l.F[0], al[1] + f * l.F[1], al[2] + f * l.F[2]]);
      } else {
        const sleutel = `${l.staaf}|${l.as}|${l.projectie ? 1 : 0}|${l.van}|${l.tot}`;
        const al = lijnen.get(sleutel);
        if (al) {
          al.q1 += f * l.q1;
          al.q2 += f * l.q2;
        } else lijnen.set(sleutel, { ...l, q1: f * l.q1, q2: f * l.q2 });
      }
    }
  });
  const uit: FemStaafLast[] = [];
  for (const l of lijnen.values()) {
    const [q1, q2] = [twaalf(l.q1), twaalf(l.q2)];
    if (q1 !== 0 || q2 !== 0) uit.push({ ...l, q1, q2 });
  }
  for (const k of [...knopen.keys()].sort((a, b) => a - b)) {
    const F = knopen.get(k)!.map(twaalf) as Vec3;
    if (F.some((v) => v !== 0)) uit.push({ soort: 'knoop', knoop: k, F });
  }
  return uit;
}

/**
 * Maakt het rekenmodel: de knopen met de tussenpunten, de staven en de rekengevallen met
 * hun lasten. Werpt bij een model dat niet kan, met een melding in het Nederlands.
 */
export function maakFemStaafModel(inv: FemStaafInvoer): FemStaafRekenmodel {
  if (!inv.staven.length) throw new Error('het model heeft geen staven');
  if (inv.staven.length > FEM_STAVEN_MAX_STAVEN) throw new Error(`het model heeft ${inv.staven.length} staven, meer dan ${FEM_STAVEN_MAX_STAVEN}`);
  if (!inv.steunen.length) throw new Error('het model heeft geen opleggingen: zet steun knoop; scharnier');
  if (!inv.gevallen.length) throw new Error('het model heeft geen belastinggeval: geval naam');
  const P = inv.knopen.map((k) => k.p);
  const naamVan = (k: number) => knoopTekst(inv.knopen[k], inv.vlak);

  const assen = inv.staven.map((s) => {
    if (!(vLengte(vMin(P[s.b], P[s.a])) > SAMEN)) throw new Error(`de staaf ${s.naam} heeft geen lengte`);
    const as = staafAssen(P[s.a], P[s.b]);
    const c = Math.abs(as.ex[2]);
    if (c > STAAND - 5e-5 && c < STAAND + 5e-5) {
      throw new Error(`de staaf ${s.naam} staat op de grens tussen staand en schuin (2,56° uit het lood): zet hem iets rechter of schuiner`);
    }
    return as;
  });
  const paren = new Map<string, string>();
  for (const s of inv.staven) {
    const sleutel = s.a < s.b ? `${s.a}-${s.b}` : `${s.b}-${s.a}`;
    const al = paren.get(sleutel);
    if (al) throw new Error(`de staven ${al} en ${s.naam} liggen op elkaar`);
    paren.set(sleutel, s.naam);
  }

  // De knopen van het model die op de as van een staaf liggen, tussen zijn einden.
  const opAs: { s: number; knoop: number }[][] = inv.staven.map(() => []);
  const gebruikt = new Set<number>();
  inv.staven.forEach((st, i) => {
    gebruikt.add(st.a);
    gebruikt.add(st.b);
    const { L, ex } = assen[i];
    const dicht = SAMEN * Math.max(1, L);
    // Een staaf die alleen trek opneemt, loopt van knoop tot knoop: valt hij weg, dan
    // zou een tussenknoop los hangen (FEM Studio weigert dat). Een knoop op zijn as zit
    // er dus niet aan vast.
    if (st.trek) return;
    P.forEach((p, k) => {
      if (k === st.a || k === st.b) return;
      const d = vMin(p, P[st.a]);
      const s = vDot(d, ex);
      if (s <= SAMEN || s >= L - SAMEN) return;
      if (vLengte(vMin(d, vMaal(ex, s))) > dicht) return;
      opAs[i].push({ s, knoop: k });
      gebruikt.add(k);
    });
  });
  const los = inv.knopen.findIndex((_, k) => !gebruikt.has(k));
  if (los >= 0) throw new Error(`de knoop ${naamVan(los)} hangt aan geen staaf`);
  for (const s of inv.steunen) if (!(s.knoop >= 0 && s.knoop < P.length)) throw new Error('een oplegging hoort op een knoop van het model');

  // Waar een puntlast staat of een lijnlast begint of eindigt, komt een tussenknoop.
  const plaatsen: number[][] = inv.staven.map(() => []);
  for (const g of inv.gevallen) {
    for (const l of g.lasten) {
      if (l.soort !== 'lijn' && l.soort !== 'punt') continue;
      const st = inv.staven[l.staaf];
      if (!st) throw new Error(`het geval ${g.naam} heeft een last op een staaf die er niet is`);
      const L = assen[l.staaf].L;
      if (l.soort === 'punt') {
        if (!(l.a >= -SAMEN && l.a <= L + SAMEN)) throw new Error(`de puntlast op ${getalTekst(l.a)} m ligt buiten de staaf ${st.naam} (lengte ${getalTekst(L)} m)`);
        if (st.trek && l.a > SAMEN && l.a < L - SAMEN) {
          throw new Error(`de staaf ${st.naam} neemt alleen trek op en wordt niet geknipt: zet de puntlast op een knoop`);
        }
        plaatsen[l.staaf].push(l.a);
      } else {
        const [van, tot] = [l.van ?? 0, l.tot ?? L];
        if (!(van >= -SAMEN && tot <= L + SAMEN && tot - van > SAMEN)) {
          throw new Error(`de lijnlast van ${getalTekst(van)} tot ${getalTekst(tot)} m past niet op de staaf ${st.naam} (lengte ${getalTekst(L)} m)`);
        }
        if (st.trek && (van > SAMEN || tot < L - SAMEN)) {
          throw new Error(`de staaf ${st.naam} neemt alleen trek op en wordt niet geknipt: een lijnlast loopt daar over de hele staaf`);
        }
        plaatsen[l.staaf].push(van, tot);
      }
    }
  }

  const x = P.map((p) => p[0]);
  const y = P.map((p) => p[1]);
  const z = P.map((p) => p[2]);
  const punten: { s: number; knoop: number }[][] = [];
  const staven: FemStaafRekenmodel['staven'] = inv.staven.map((st, i) => {
    const { L, ex } = assen[i];
    const hier = [...opAs[i]];
    const nieuw: number[] = [];
    const bezet = (s: number, dicht: number) => s <= dicht || s >= L - dicht || hier.some((q) => Math.abs(q.s - s) <= dicht) || nieuw.some((q) => Math.abs(q - s) <= dicht);
    for (const s of plaatsen[i]) if (!bezet(s, SAMEN)) nieuw.push(s);
    // De gelijke delen, behalve waar al een knoop vlakbij ligt: geen heel kort deel ernaast.
    const vlakbij = Math.max(1e-3, L * 1e-3);
    for (let k = 1; k < (st.trek ? 1 : inv.delen); k++) {
      const s = (L * k) / inv.delen;
      if (!bezet(s, vlakbij)) nieuw.push(s);
    }
    for (const s of nieuw.sort((a, b) => a - b)) {
      const p = vPlus(P[st.a], vMaal(ex, s));
      x.push(twaalf(p[0]));
      y.push(inv.vlak ? 0 : twaalf(p[1]));
      z.push(twaalf(p[2]));
      hier.push({ s, knoop: x.length - 1 });
    }
    hier.sort((a, b) => a.s - b.s);
    punten.push(hier);
    return {
      naam: st.naam,
      knopen: [st.a, ...hier.map((q) => q.knoop), st.b],
      doorsnede: st.doorsnede,
      scharnier: st.scharnier,
      ...(st.trek ? { trek: true as const } : {}),
    };
  });
  if (x.length > FEM_STAVEN_MAX_KNOPEN) throw new Error(`het staafwerk heeft ${x.length} knopen, meer dan ${FEM_STAVEN_MAX_KNOPEN}: kies minder delen per staaf`);

  /** De knoop op de afstand s van het begin van een staaf. */
  const knoopOp = (staaf: number, s: number): number => {
    const st = inv.staven[staaf];
    const L = assen[staaf].L;
    if (s <= SAMEN) return st.a;
    if (s >= L - SAMEN) return st.b;
    const q = punten[staaf].find((p) => Math.abs(p.s - s) <= SAMEN);
    if (!q) throw new Error(`er is geen knoop op ${getalTekst(s)} m van de staaf ${st.naam}`);
    return q.knoop;
  };

  const lastenVan = (g: FemStaafInvoer['gevallen'][number]): FemStaafLast[] => {
    const uit: FemStaafLast[] = [];
    for (const l of g.lasten) {
      if (l.soort === 'knoop') {
        if (!(l.knoop >= 0 && l.knoop < P.length)) throw new Error(`het geval ${g.naam} heeft een last op een knoop die er niet is`);
        uit.push({ soort: 'knoop', knoop: l.knoop, F: l.F });
      } else if (l.soort === 'punt') {
        const { ey, ez } = assen[l.staaf];
        const richting: Vec3 = l.as === 'x' ? [1, 0, 0] : l.as === 'y' ? [0, 1, 0] : l.as === 'z' ? [0, 0, 1] : l.as === 'ly' ? ey : ez;
        uit.push({ soort: 'knoop', knoop: knoopOp(l.staaf, l.a), F: vMaal(richting, l.F) });
      } else if (l.soort === 'lijn') {
        const L = assen[l.staaf].L;
        uit.push({
          soort: 'lijn', staaf: l.staaf, as: l.as, ...(l.projectie ? { projectie: true as const } : {}),
          q1: l.q1, q2: l.q2, van: twaalf(Math.max(0, l.van ?? 0)), tot: twaalf(Math.min(L, l.tot ?? L)),
        });
      } else {
        inv.staven.forEach((st, i) => {
          if (l.staaf !== null && l.staaf !== i) return;
          const q = -l.gamma * inv.doorsneden[st.doorsnede].A;
          uit.push({ soort: 'lijn', staaf: i, as: 'z', q1: q, q2: q, van: 0, tot: twaalf(assen[i].L) });
        });
      }
    }
    return uit;
  };
  const perGeval = inv.gevallen.map(lastenVan);
  const alsGeval = (i: number) => ({ naam: inv.gevallen[i].naam, soort: 'geval' as const, lasten: combineerLasten([perGeval[i]], [1]) });
  const alsCombinatie = (c: FemStaafInvoer['combinaties'][number]) => ({ naam: c.naam, soort: 'combinatie' as const, lasten: combineerLasten(perGeval, c.factoren) });
  // Lineair is elk geval één berekening en telt CalcSheet de combinaties op. Dat mag niet
  // bij tweede orde of een staaf die alleen trek opneemt, en een knikfactor hoort bij de
  // lasten van de combinatie zelf: dan is elke combinatie een eigen berekening.
  const lineair = inv.analyse === 'lineair' && !inv.staven.some((s) => s.trek);
  const gevallen: FemStaafRekenmodel['gevallen'] = [];
  if (lineair) {
    gevallen.push(...inv.gevallen.map((_, i) => alsGeval(i)));
    if (inv.knik > 0) gevallen.push(...inv.combinaties.map(alsCombinatie));
  } else if (inv.combinaties.length) {
    gevallen.push(...inv.combinaties.map(alsCombinatie));
  } else {
    gevallen.push(...inv.gevallen.map((_, i) => alsGeval(i)));
  }
  if (gevallen.length > FEM_STAVEN_MAX_GEVALLEN) throw new Error(`het model heeft ${gevallen.length} rekengevallen, meer dan ${FEM_STAVEN_MAX_GEVALLEN}`);
  for (const g of gevallen) if (!g.lasten.length) throw new Error(`${g.soort === 'combinatie' ? 'de combinatie' : 'het geval'} ${g.naam} heeft geen lasten`);

  return {
    vorm: 'fem-staven/1',
    vlak: inv.vlak,
    analyse: inv.analyse,
    // Tweede orde heeft de knikfactor altijd nodig: hij zegt of de berekening stabiel is.
    knik: inv.analyse === 'tweede-orde' ? Math.max(1, inv.knik) : inv.knik,
    materialen: inv.materialen,
    doorsneden: inv.doorsneden,
    x,
    y,
    z,
    knopen: inv.knopen.map((k) => k.naam),
    staven,
    steunen: inv.steunen,
    gevallen,
  };
}

/** De plaats van een knoop. */
export const femStaafPunt = (m: FemStaafRekenmodel, k: number): Vec3 => [m.x[k], m.y[k], m.z[k]];

/** De lengte en de assen van een staaf van het rekenmodel. */
export function femStaafAssen(m: FemStaafRekenmodel, staaf: number): { L: number; ex: Vec3; ey: Vec3; ez: Vec3 } {
  const k = m.staven[staaf].knopen;
  return staafAssen(femStaafPunt(m, k[0]), femStaafPunt(m, k[k.length - 1]));
}

/** De vrijheidsgraden van een knoop of oplegging: vlak drie, ruimtelijk zes. */
export const femStaafVrijheden = (m: FemStaafRekenmodel): readonly ('ux' | 'uy' | 'uz' | 'rx' | 'ry' | 'rz')[] =>
  (m.vlak ? ['ux', 'uz', 'ry'] : ['ux', 'uy', 'uz', 'rx', 'ry', 'rz']);

/** De snedekrachten per deel, in de volgorde van het bewaarde antwoord, met hun naam in het antwoord van FEM Studio. */
export const femStaafLijnen = (m: FemStaafRekenmodel): readonly string[] =>
  (m.vlak ? ['axial', 'shearZ', 'momentY'] : ['axial', 'shearY', 'shearZ', 'torsion', 'momentY', 'momentZ']);

const VEER = { ux: 'kxKnPerM', uy: 'kyKnPerM', uz: 'kzKnPerM', rx: 'krxKnmPerRad', ry: 'kryKnmPerRad', rz: 'krzKnmPerRad' } as const;

/**
 * De JSON voor `solve_open_fem_3d_batch`: per rekengeval een verzoek met het schema van
 * `solve_open_fem_3d` (contractversie 2, nodig voor de tussenknopen). Z wijst omhoog.
 */
export function femStaafArgumenten(m: FemStaafRekenmodel): Record<string, unknown> {
  const nodes = m.x.map((x, i) => ({ id: i + 1, x, y: m.y[i], z: m.z[i] }));
  const materials = m.materialen.map((mat, i) => ({
    id: i + 1, name: mat.naam || `materiaal ${i + 1}`, eMpa: mat.E, nu: mat.nu, ...(mat.G !== null ? { gMpa: mat.G } : {}),
  }));
  const sections = m.doorsneden.map((d, i) => ({
    id: i + 1,
    name: d.naam || `doorsnede ${i + 1}`,
    areaM2: d.A,
    iyM4: d.Iy,
    izM4: m.vlak ? twaalf(d.Iy * FEM_UIT_HET_VLAK) : d.Iz,
    torsionJM4: m.vlak && !(d.It > 0) ? d.Iy : d.It,
  }));
  const members = m.staven.map((s, i) => {
    const tussen = s.knopen.slice(1, -1).map((k) => k + 1);
    const [b, e] = s.scharnier;
    const releases = !b && !e ? null : m.vlak ? { myStart: b, myEnd: e } : { myStart: b, mzStart: b, myEnd: e, mzEnd: e };
    return {
      id: i + 1,
      startNodeId: s.knopen[0] + 1,
      endNodeId: s.knopen[s.knopen.length - 1] + 1,
      materialId: m.doorsneden[s.doorsnede].materiaal + 1,
      sectionId: s.doorsnede + 1,
      ...(tussen.length ? { intermediateNodeIds: tussen } : {}),
      ...(releases ? { releases } : {}),
      ...(s.trek ? { tensionOnly: true } : {}),
    };
  });
  const vrijheden = femStaafVrijheden(m);
  const steun = (k: number, vast: readonly (boolean | number)[] | undefined) => {
    const uit: Record<string, unknown> = { nodeId: k + 1, ux: false, uy: m.vlak, uz: false, rx: m.vlak, ry: false, rz: m.vlak };
    vrijheden.forEach((d, i) => {
      const v = vast?.[i];
      if (v === true) uit[d] = true;
      else if (typeof v === 'number' && v > 0) uit[VEER[d]] = v;
    });
    return uit;
  };
  const perKnoop = new Map(m.steunen.map((s) => [s.knoop, s.vast]));
  const supports = m.vlak ? nodes.map((_, k) => steun(k, perKnoop.get(k))) : m.steunen.map((s) => steun(s.knoop, s.vast));
  const lengte = m.staven.map((_, i) => femStaafAssen(m, i).L);

  const requests = m.gevallen.map((g) => {
    const memberLoads: Record<string, unknown>[] = [];
    const nodalLoads: Record<string, unknown>[] = [];
    for (const l of g.lasten) {
      if (l.soort === 'knoop') {
        nodalLoads.push({ id: nodalLoads.length + 1, nodeId: l.knoop + 1, fx: l.F[0], fy: l.F[1], fz: l.F[2], mx: 0, my: 0, mz: 0 });
        continue;
      }
      const bereik = {
        ...(l.van > SAMEN ? { startPositionM: l.van } : {}),
        ...(l.tot < lengte[l.staaf] - SAMEN ? { endPositionM: l.tot } : {}),
      };
      const kop = { id: memberLoads.length + 1, memberId: l.staaf + 1 };
      if (l.as === 'ly') memberLoads.push({ ...kop, qyStartKnPerM: l.q1, qyEndKnPerM: l.q2, ...bereik });
      else if (l.as === 'lz') memberLoads.push({ ...kop, qzStartKnPerM: l.q1, qzEndKnPerM: l.q2, ...bereik });
      else memberLoads.push({ ...kop, globalDirection: l.as, qStartKnPerM: l.q1, qEndKnPerM: l.q2, ...(l.projectie ? { perProjection: true } : {}), ...bereik });
    }
    return {
      schemaVersion: 2,
      analysis: m.analyse === 'tweede-orde' ? 'p-delta' : 'linear',
      bucklingModes: m.knik,
      nodes,
      materials,
      sections,
      members,
      supports,
      ...(memberLoads.length ? { memberLoads } : {}),
      ...(nodalLoads.length ? { nodalLoads } : {}),
    };
  });
  return { requests };
}

/** De belasting van een rekengeval samen (kN), in X, Y en Z, uit het model. */
export function femStaafSomLast(m: FemStaafRekenmodel, geval: number): Vec3 {
  const som: Vec3 = [0, 0, 0];
  const bij = (v: Vec3) => {
    som[0] += v[0];
    som[1] += v[1];
    som[2] += v[2];
  };
  const AS: Record<'x' | 'y' | 'z', Vec3> = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };
  for (const l of m.gevallen[geval].lasten) {
    if (l.soort === 'knoop') {
      bij(l.F);
      continue;
    }
    const { ex, ey, ez } = femStaafAssen(m, l.staaf);
    const gemiddeld = ((l.q1 + l.q2) / 2) * (l.tot - l.van);
    if (l.as === 'ly') bij(vMaal(ey, gemiddeld));
    else if (l.as === 'lz') bij(vMaal(ez, gemiddeld));
    else {
      const e = AS[l.as];
      // Per meter projectie: de lengte loodrecht op de lastrichting.
      const deel = l.projectie ? Math.sqrt(Math.max(0, 1 - vDot(ex, e) ** 2)) : 1;
      bij(vMaal(e, gemiddeld * deel));
    }
  }
  return som;
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const lijst = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter(isObject) : []);
const getal = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : NaN);
/** Negen cijfers; wat kleiner is dan afrondingsruis wordt nul. */
const schoon = (v: number, nul: number) => (Math.abs(v) < nul ? 0 : Number(v.toPrecision(9)));

/** De waarde van een snedekrachtlijn op t, tussen de punten i0 en i1 van de lijn. */
function opLijn(punten: { t: number; v: number }[], i0: number, i1: number, t: number): number {
  for (let i = i0; i <= i1; i++) if (Math.abs(punten[i].t - t) <= 1e-9) return punten[i].v;
  for (let i = i0; i < i1; i++) {
    const [a, b] = [punten[i], punten[i + 1]];
    if (t >= a.t && t <= b.t) return b.t - a.t > 0 ? a.v + ((b.v - a.v) * (t - a.t)) / (b.t - a.t) : a.v;
  }
  return NaN;
}

function gevalCompact(m: FemStaafRekenmodel, geval: number, r: Record<string, unknown>): FemStaafGevalCompact {
  const N = m.x.length;
  const vrijheden = femStaafVrijheden(m);
  const verplaatsing = new Map<number, Record<string, unknown>>();
  for (const d of lijst(r.displacements)) verplaatsing.set(getal(d.nodeId) - 1, d);
  const u: number[] = [];
  for (let k = 0; k < N; k++) {
    const d = verplaatsing.get(k);
    const w = vrijheden.map((v) => getal(d?.[v]));
    if (!d || w.some((v) => !Number.isFinite(v))) throw new Error(`het antwoord van FEM Studio mist de verplaatsing van knoop ${k + 1}`);
    u.push(...w.map((v) => schoon(v, 1e-13)));
  }

  // De snedekrachten: per deel van een staaf vijf waarden uit de lijn van FEM Studio.
  const diagrammen = isObject(r.diagrams) ? r.diagrams : {};
  const s: number[] = [];
  m.staven.forEach((st, i) => {
    const a = femStaafPunt(m, st.knopen[0]);
    const L = femStaafAssen(m, i).L;
    const t = st.knopen.map((k) => vLengte(vMin(femStaafPunt(m, k), a)) / L);
    t[t.length - 1] = 1;
    const lijnen = femStaafLijnen(m).map((naam) => {
      const lijn = lijst(diagrammen[naam]).find((d) => getal(d.memberId) === i + 1);
      const punten = lijst(lijn?.points).map((p) => ({ t: getal(p.t), v: getal(p.value) }));
      if (punten.length < 2 || punten.some((p) => !Number.isFinite(p.t) || !Number.isFinite(p.v))) {
        throw new Error(`het antwoord van FEM Studio mist de snedekrachten van de staaf ${st.naam}`);
      }
      return punten;
    });
    for (let d = 0; d + 1 < t.length; d++) {
      for (const punten of lijnen) {
        // Op een knoop staan twee punten: het laatste is het begin van dit deel, het
        // eerste op de volgende knoop het eind. Zo blijft een sprong onder een puntlast heel.
        let i0 = 0;
        for (let p = 0; p < punten.length && punten[p].t <= t[d] + 1e-9; p++) i0 = p;
        let i1 = punten.length - 1;
        for (let p = punten.length - 1; p >= 0 && punten[p].t >= t[d + 1] - 1e-9; p--) i1 = p;
        if (i1 <= i0) throw new Error(`het antwoord van FEM Studio heeft geen snedekrachten tussen de knopen van de staaf ${st.naam}`);
        for (let j = 0; j <= 4; j++) {
          const v = j === 0 ? punten[i0].v : j === 4 ? punten[i1].v : opLijn(punten, i0, i1, t[d] + ((t[d + 1] - t[d]) * j) / 4);
          if (!Number.isFinite(v)) throw new Error(`het antwoord van FEM Studio heeft geen getal voor de staaf ${st.naam}`);
          s.push(schoon(v, 1e-9));
        }
      }
    }
  });

  const reactie = new Map<number, Record<string, unknown>>();
  const som: Vec3 = [0, 0, 0];
  for (const x of lijst(r.reactions)) {
    reactie.set(getal(x.nodeId) - 1, x);
    som[0] += getal(x.fx) || 0;
    som[1] += getal(x.fy) || 0;
    som[2] += getal(x.fz) || 0;
  }
  const KRACHT = { ux: 'fx', uy: 'fy', uz: 'fz', rx: 'mx', ry: 'my', rz: 'mz' } as const;
  const R: number[] = [];
  for (const st of m.steunen) {
    const x = reactie.get(st.knoop);
    if (!x) throw new Error(`het antwoord van FEM Studio mist de reactie van knoop ${st.knoop + 1}`);
    vrijheden.forEach((v, i) => {
      const w = getal(x[KRACHT[v]]);
      if (!Number.isFinite(w)) throw new Error(`het antwoord van FEM Studio mist de reactie van knoop ${st.knoop + 1}`);
      // Een vrije richting draagt niets: afrondingsruis hoort daar niet te staan.
      R.push(st.vast[i] === false ? 0 : schoon(w, 1e-9));
    });
  }

  const knik = isObject(r.buckling) ? r.buckling : {};
  const alpha = lijst(knik.modes)
    .map((x) => getal(x.loadFactor))
    .filter((v) => Number.isFinite(v))
    .map((v) => schoon(v, 0));
  let tweede: FemStaafGevalCompact['tweede'];
  if (m.analyse === 'tweede-orde') {
    const so = isObject(r.secondOrder) ? r.secondOrder : null;
    if (!so || so.converged !== true) throw new Error('de berekening in tweede orde komt niet tot rust (geen convergentie)');
    if (so.stable === false) throw new Error('het staafwerk is onder deze lasten niet stabiel: de belasting ligt boven de kniklast');
    tweede = { iteraties: getal(so.iterations) || 0, versterking: schoon(getal(so.maxAmplification) || 1, 0) };
  }
  const inactief = (Array.isArray(r.inactiveMembers) ? r.inactiveMembers : [])
    .map((x) => getal(x) - 1)
    .filter((i) => i >= 0 && i < m.staven.length);
  const ev = isObject(r.equilibrium) ? r.equilibrium : {};
  return {
    u,
    s,
    R,
    alpha,
    ...(tweede ? { tweede } : {}),
    ...(inactief.length ? { inactief } : {}),
    som: { last: femStaafSomLast(m, geval).map((v) => schoon(v, 1e-9)) as Vec3, reactie: som.map((v) => schoon(v, 1e-9)) as Vec3 },
    evenwicht: { ok: ev.equilibriumOk === true && ev.residualOk !== false, max: schoon(getal(ev.maxImbalanceKn) || 0, 0) },
  };
}

/**
 * Het antwoord van `solve_open_fem_3d_batch` compact, zoals het bij het blad wordt
 * vastgelegd. Een fout van één rekengeval is een fout van het geheel, met het geval
 * erbij: een staafwerk met een gat is geen antwoord. Werpt ook als er iets ontbreekt.
 */
export function femStaafBewaar(m: FemStaafRekenmodel, ruw: unknown): FemStaafUitkomstCompact {
  const resultaten = isObject(ruw) && Array.isArray(ruw.results) ? ruw.results : null;
  if (!resultaten) throw new Error('FEM Studio gaf geen resultaten terug');
  if (resultaten.length !== m.gevallen.length) {
    throw new Error(`FEM Studio gaf ${resultaten.length} uitkomsten terug voor ${m.gevallen.length} rekengevallen`);
  }
  return {
    vorm: 'fem-staven/1',
    gevallen: m.gevallen.map((g, i) => {
      const naam = `${g.soort === 'combinatie' ? 'combinatie' : 'geval'} ${g.naam}`;
      const r: unknown = resultaten[i];
      if (!isObject(r) || !isObject(r.result)) {
        const fout = isObject(r) ? r.error : null;
        const tekst = typeof fout === 'string' ? fout : isObject(fout) ? String(fout.message ?? fout.melding ?? JSON.stringify(fout)) : 'FEM Studio gaf geen resultaat';
        throw new Error(`${naam}: ${tekst.length > 700 ? `${tekst.slice(0, 700)}…` : tekst}`);
      }
      try {
        return gevalCompact(m, i, r.result);
      } catch (e) {
        throw new Error(`${naam}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }),
  };
}
