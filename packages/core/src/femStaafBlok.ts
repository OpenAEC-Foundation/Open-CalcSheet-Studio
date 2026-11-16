import { math } from './eenheden.js';
import type { FemRekenaar } from './femBlok.js';
import { FEM_STAVEN_TOOL, maakFemStaafModel, vLengte, vMin, type FemStaafInvoer, type FemStaafInvoerLast, type Vec3 } from './femStaven.js';
import { FemStaafModel, femStaafModelSvg, femStaafSvg, type FemSnedekracht, type FemStaafSet } from './femStaafResultaat.js';
import { toetsHash } from './toetsBlok.js';
import type { EvaluatedFem, FemBereik, FemNode, FemRegel, FemStaafBlad, FemStaafRekenmodel, FemStaafUitkomstCompact, ToetsAntwoord, ToetsVerzoek } from './types.js';

/**
 * Een staafwerk in het blok `@fem`: een ligger, een portaal, een kap.
 *
 *   @fem kap
 *     materiaal 11000 N/mm^2; 690 N/mm^2
 *     rechthoek spoor: 59 mm; 156 mm
 *     knoop A: 0; 0
 *     knoop B: L; 0
 *     knoop nok: L/2; h_nok
 *     staaf spoor_l: A; nok; spoor; scharnier eind
 *     staaf spoor_r: nok; B; spoor
 *     staaf hanenbalk: x_h; z_h; L - x_h; z_h; haan; scharnier
 *     steun A; scharnier
 *     steun B; rol
 *     geval S
 *       lijnlast spoor_l; q_s; projectie
 *     combinatie UGT = 1.2*G + 1.5*S
 *   @end
 *   M_Ed = kap.UGT.spoor_l.M_max
 *
 * Een blok met een van de woorden `rechthoek`, `doorsnede`, `knoop`, `staaf`, `steun`,
 * `lijnlast`, `delen` of `knikvormen` is een staafwerk; femBlok.ts geeft het dan hier af.
 * Twee coördinaten per punt (x en z) geven een vlak staafwerk, drie een ruimtelijk.
 *
 * CalcSheet rekent het staafwerk niet zelf: het blad bouwt het model op (femStaven.ts) en
 * Open FEM Studio rekent alle rekengevallen in één aanroep (`solve_open_fem_3d_batch`).
 * Het antwoord wordt opgezocht en vastgelegd zoals bij `@toets`: op de hash van het
 * rekenmodel, met het bewaarde model erbij. Zie docs/fem-model.md.
 *
 * In het blok is een last omlaag positief, een last langs x positief naar +x, en een
 * lokale last positief als hij op de bovenzijde van de staaf drukt. Na het blok staan in
 * de scope (een punt in een naam is een liggend streepje), met <R> elk geval en elke
 * combinatie, <S> elke staaf en <K> elke benoemde knoop:
 *   <naam>                               het model, voor fem_staaf, fem_knoop, fem_krachten, fem_svg en `@3d`
 *   <naam>_<R>_<S>_N_max, _N_min, _V_max, _V_min, _M_max, _M_min   (kN, kNm; ruimtelijk Vy, Vz, T, My, Mz)
 *   <naam>_<R>_<S>_w_max, _w_min         doorbuiging ten opzichte van de koorde (mm)
 *   <naam>_<R>_<K>_ux, _uz               verplaatsing van een knoop (mm)
 *   <naam>_<R>_<K>_Rx, _Rz, _My          reactie van de oplegging op die knoop (kN, kNm)
 *   <naam>_<R>_Rx, _Rz                   de reacties per oplegging, in de volgorde van het blok
 *   <naam>_<R>_Rx_som, _Rz_som, _Rz_max, _Rz_min
 *   <naam>_<R>_N_max, … _M_min, _w_max, _w_min   over alle staven
 *   <naam>_<R>_alpha_cr, _alpha          de kleinste knikfactor en alle knikfactoren
 *   <naam>_<S>_N_max, … _w_min, <naam>_<K>_Rz_max, …, <naam>_N_max, …, <naam>_alpha_cr
 *                                        de omhullende over de combinaties (zonder combinaties: over de gevallen)
 *   <naam>_<S>_L                         de lengte van een staaf (m)
 */

/** De woorden die van een `@fem`-blok een staafwerk maken. */
export const FEM_STAAF_WOORDEN: readonly string[] = ['rechthoek', 'doorsnede', 'knoop', 'staaf', 'steun', 'lijnlast', 'delen', 'knikvormen'];
/** De woorden die alleen een plaatmodel heeft. */
const PLAAT_WOORDEN: readonly string[] = ['plaat', 'veer', 'veren', 'lijnsteun', 'vlaklast', 'maas'];
/** Een staaf of knoop mag niet heten zoals een uitkomst: `kap.UGT.N_max` zou twee dingen zijn. */
export const FEM_STAAF_GERESERVEERD: readonly string[] = [
  'N', 'V', 'M', 'T', 'Vy', 'Vz', 'Mx', 'My', 'Mz', 'w', 'v', 'L', 'R', 'Rx', 'Ry', 'Rz', 'ux', 'uy', 'uz', 'alpha', 'alpha_cr', 'max', 'min', 'som',
];

type Opdracht = Extract<FemRegel, { soort: 'opdracht' }>;

/** Is dit blok een staafwerk? Ook een woord in een #for of #if telt. */
export function isFemStaafwerk(regels: FemRegel[]): boolean {
  return regels.some((r) => (r.soort === 'opdracht'
    ? FEM_STAAF_WOORDEN.includes(r.woord)
    : r.soort === 'for' ? isFemStaafwerk(r.body) : r.takken.some((t) => isFemStaafwerk(t.body)) || isFemStaafwerk(r.anders)));
}

type MathUnit = { toNumber(eenheid?: string): number; toString(): string; dimensions?: number[] };
const isUnit = (w: unknown): w is MathUnit => math.isUnit(w);
const IDENT = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const SAMEN = 1e-6;
const melding = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error:\s*/, '');

/** Een waarde als getal in `eenheid`; een kaal getal telt in die eenheid. */
function alsGetal(w: unknown, eenheid: string, wat: string): number {
  let n: number;
  if (isUnit(w)) {
    if (!eenheid) {
      if (w.dimensions && w.dimensions.every((d) => d === 0)) n = w.toNumber();
      else throw new Error(`${wat}: ${w.toString()} heeft een eenheid, hier hoort een getal`);
    } else {
      try {
        n = w.toNumber(eenheid);
      } catch {
        throw new Error(`${wat}: ${w.toString()} past niet in ${eenheid}`);
      }
    }
  } else if (typeof w === 'number') n = w;
  else if (typeof w === 'boolean') n = w ? 1 : 0;
  else if (math.isFraction(w) || math.isBigNumber(w)) n = Number(w);
  else throw new Error(`${wat}: geen getal`);
  if (!Number.isFinite(n)) throw new Error(`${wat}: geen eindig getal`);
  return n;
}

type As = 'x' | 'y' | 'z' | 'ly' | 'lz';

/** Een richting van een last: `z` (omlaag), `x`, `y`, `projectie`, `x projectie`, `lokaal`, `lokaal y`. */
function leesRichting(tekst: string): { as: As; projectie: boolean } | null {
  const t = tekst.trim().toLowerCase().replace(/\s+/g, ' ');
  if (t === 'projectie') return { as: 'z', projectie: true };
  const globaal = /^([xyz])( projectie)?$/.exec(t);
  if (globaal) return { as: globaal[1] as As, projectie: !!globaal[2] };
  const lokaal = /^lokaal( [yz])?$/.exec(t);
  if (lokaal) return { as: lokaal[1]?.trim() === 'y' ? 'ly' : 'lz', projectie: false };
  return null;
}

/**
 * Het teken waarmee een last uit het blok naar de assen van FEM Studio gaat: omlaag is in
 * het blok positief en langs Z negatief; een lokale last drukt positief op de bovenzijde,
 * tegen de lokale z in.
 */
const teken = (as: As) => (as === 'z' || as === 'lz' ? -1 : 1);

const SOORT_RE = /^(scharnier|inklemming|rol(?:\s+[xyz])?)$/i;
/** De vaste vrijheidsgraden van een oplegging bij naam. */
function steunSoort(tekst: string, vlak: boolean): boolean[] {
  const t = tekst.trim().toLowerCase().replace(/\s+/g, ' ');
  if (vlak) {
    if (t === 'scharnier') return [true, true, false];
    if (t === 'inklemming') return [true, true, true];
    if (t === 'rol' || t === 'rol x') return [false, true, false];
    if (t === 'rol z') return [true, false, false];
    throw new Error('een vlak staafwerk heeft rol (rolt langs x) en rol z (rolt langs z)');
  }
  const [x, y, z] = t === 'scharnier' || t === 'inklemming' ? [true, true, true] : t === 'rol' ? [false, false, true] : [t !== 'rol x', t !== 'rol y', t !== 'rol z'];
  const r = t === 'inklemming';
  return [x, y, z, r, r, r];
}

interface Gelezen {
  invoer: FemStaafInvoer;
  beelden: { set: string; grootheid: string }[];
  fouten: string[];
}

/** Rekent de regels door tot een staafwerk in getallen. */
function leesStaafInvoer(node: FemNode, r: FemRekenaar): Gelezen {
  const fouten: string[] = [];
  const meld = (nr: number, tekst: string) => fouten.push(`regel ${nr}: ${tekst}`);
  const inv: FemStaafInvoer = {
    vlak: true, analyse: 'lineair', knik: 0, delen: 4,
    materialen: [], doorsneden: [], knopen: [], staven: [], steunen: [], gevallen: [], combinaties: [],
  };
  let dimensie: 2 | 3 | null = null;
  const materiaalNamen = new Map<string, number>();
  const doorsnedeNamen = new Map<string, number>();
  const knoopNamen = new Map<string, number>();
  const staafNamen = new Map<string, number>();
  const combinaties: { naam: string; expr: string; regel: number }[] = [];
  const beelden: { set: string; grootheid: string; regel: number }[] = [];
  let geval: FemStaafInvoer['gevallen'][number] | null = null;

  // Op twaalf cijfers: 350 mm is dan 0,35 m, niet 0,35000000000000003.
  const getal = (expr: string, eenheid: string, wat: string) => Number(alsGetal(r.reken(expr), eenheid, wat).toPrecision(12));
  const inGeval = () => {
    if (!geval) throw new Error('een last hoort bij een belastinggeval: zet eerst geval naam');
    return geval;
  };
  const zetDimensie = (d: 2 | 3) => {
    if (dimensie && dimensie !== d) {
      throw new Error(dimensie === 2
        ? 'het staafwerk is vlak (x en z): deze regel heeft drie coördinaten'
        : 'het staafwerk is ruimtelijk (x, y en z): deze regel heeft twee coördinaten');
    }
    dimensie = d;
    inv.vlak = d === 2;
  };
  /** Een punt uit twee of drie uitdrukkingen. */
  const punt = (a: string[], van: number, aantal: 2 | 3): Vec3 => {
    zetDimensie(aantal);
    const w = (k: number, wat: string) => getal(a[van + k], 'm', wat);
    return aantal === 2 ? [w(0, 'x'), 0, w(1, 'z')] : [w(0, 'x'), w(1, 'y'), w(2, 'z')];
  };
  /** De knoop op een plaats; is er geen, dan komt hij erbij. */
  const knoopOp = (p: Vec3): number => {
    const al = inv.knopen.findIndex((k) => vLengte(vMin(k.p, p)) <= SAMEN);
    if (al >= 0) return al;
    inv.knopen.push({ naam: '', p });
    return inv.knopen.length - 1;
  };
  const staafBijNaam = (naam: string): number => {
    const i = staafNamen.get(naam);
    if (i === undefined) throw new Error(`er is geen staaf ${naam}${staafNamen.size ? ` (wel: ${[...staafNamen.keys()].join(', ')})` : ''}`);
    return i;
  };
  const lengteVan = (staaf: number) => vLengte(vMin(inv.knopen[inv.staven[staaf].b].p, inv.knopen[inv.staven[staaf].a].p));
  const tekst = (o: Opdracht, k: number) => (o.ruw?.[k] ?? o.args[k] ?? '').trim();

  function opdracht(o: Opdracht) {
    const a = o.args;
    if (PLAAT_WOORDEN.includes(o.woord)) {
      throw new Error(`${o.woord} hoort bij een plaatmodel; platen en staven in één model kan nog niet`);
    }
    switch (o.woord) {
      case 'materiaal': {
        const E = getal(a[0], 'MPa', 'E');
        if (!(E > 0)) throw new Error('E moet groter dan 0 zijn');
        // De tweede waarde is ν (een getal) of G (een spanning); met drie waarden ν en G.
        let nu = 0.3;
        let G: number | null = null;
        const tweede = r.reken(a[1]);
        if (isUnit(tweede) && !(tweede.dimensions ?? []).every((d) => d === 0)) G = Number(alsGetal(tweede, 'MPa', 'G').toPrecision(12));
        else nu = Number(alsGetal(tweede, '', 'ν').toPrecision(12));
        if (a.length > 2) {
          if (G !== null) throw new Error('schrijf materiaal E; ν; G of materiaal E; G');
          G = getal(a[2], 'MPa', 'G');
        }
        if (!(nu > -1 && nu < 0.5)) throw new Error('ν ligt tussen 0 en 0,5');
        if (G !== null && !(G > 0)) throw new Error('G moet groter dan 0 zijn');
        if (o.naam) {
          if (materiaalNamen.has(o.naam)) throw new Error(`het materiaal ${o.naam} staat er al`);
          materiaalNamen.set(o.naam, inv.materialen.length);
        }
        inv.materialen.push({ naam: o.naam ?? '', E, nu, G });
        break;
      }
      case 'rechthoek':
      case 'doorsnede': {
        if (!o.naam) throw new Error(`geef de doorsnede een naam: ${o.woord} naam: …`);
        if (doorsnedeNamen.has(o.naam)) throw new Error(`de doorsnede ${o.naam} staat er al`);
        if (!inv.materialen.length) throw new Error('zet eerst het materiaal: materiaal E; G');
        // Een naam van een materiaal achteraan; anders het laatste materiaal.
        let materiaal = inv.materialen.length - 1;
        let waarden = a;
        const laatste = tekst(o, a.length - 1);
        const metNaam = o.woord === 'rechthoek' ? a.length === 3 : a.length === 3 || a.length === 5;
        if (metNaam) {
          const m = materiaalNamen.get(laatste);
          if (m === undefined) throw new Error(`er is geen materiaal ${laatste}${materiaalNamen.size ? ` (wel: ${[...materiaalNamen.keys()].join(', ')})` : ''}`);
          materiaal = m;
          waarden = a.slice(0, -1);
        }
        if (o.woord === 'rechthoek') {
          const [b, h] = [getal(waarden[0], 'mm', 'b') / 1000, getal(waarden[1], 'mm', 'h') / 1000];
          if (!(b > 0 && h > 0)) throw new Error('b en h moeten groter dan 0 zijn');
          // De wringstijfheid van een rechthoek met lange zijde p en korte zijde q.
          const [p, q] = [Math.max(b, h), Math.min(b, h)];
          const It = p * q ** 3 * (1 / 3 - 0.21 * (q / p) * (1 - q ** 4 / (12 * p ** 4)));
          const twaalf = (v: number) => Number(v.toPrecision(12));
          inv.doorsneden.push({ naam: o.naam, A: twaalf(b * h), Iy: twaalf((b * h ** 3) / 12), Iz: twaalf((h * b ** 3) / 12), It: twaalf(It), materiaal, b: twaalf(b), h: twaalf(h) });
        } else {
          if (waarden.length !== 2 && waarden.length !== 4) throw new Error('schrijf doorsnede naam: A; I_y of doorsnede naam: A; I_y; I_z; I_t');
          const A = getal(waarden[0], 'mm^2', 'A') / 1e6;
          const I = (k: number, wat: string) => (waarden.length > k ? getal(waarden[k], 'mm^4', wat) / 1e12 : 0);
          const [Iy, Iz, It] = [I(1, 'I_y'), I(2, 'I_z'), I(3, 'I_t')];
          if (!(A > 0 && Iy > 0)) throw new Error('A en I_y moeten groter dan 0 zijn');
          if (waarden.length === 4 && !(Iz > 0 && It > 0)) throw new Error('I_z en I_t moeten groter dan 0 zijn');
          const twaalf = (v: number) => Number(v.toPrecision(12));
          inv.doorsneden.push({ naam: o.naam, A: twaalf(A), Iy: twaalf(Iy), Iz: twaalf(Iz), It: twaalf(It), materiaal });
        }
        doorsnedeNamen.set(o.naam, inv.doorsneden.length - 1);
        break;
      }
      case 'knoop': {
        if (!o.naam) throw new Error('geef de knoop een naam: knoop naam: x; z');
        if (knoopNamen.has(o.naam) || staafNamen.has(o.naam)) throw new Error(`de naam ${o.naam} staat er al`);
        if (a.length !== 2 && a.length !== 3) throw new Error('schrijf knoop naam: x; z of knoop naam: x; y; z');
        const k = knoopOp(punt(a, 0, a.length as 2 | 3));
        if (inv.knopen[k].naam) throw new Error(`op die plaats ligt al de knoop ${inv.knopen[k].naam}`);
        inv.knopen[k].naam = o.naam;
        knoopNamen.set(o.naam, k);
        break;
      }
      case 'staaf': {
        // Van achteren: de woorden scharnier en trek, dan de naam van een doorsnede.
        let n = a.length;
        const scharnier: [boolean, boolean] = [false, false];
        let trek = false;
        for (; n > 0; n--) {
          const t = tekst(o, n - 1).toLowerCase().replace(/\s+/g, ' ');
          const s = /^scharnier(?:en)?(?: (begin|eind|beide))?$/.exec(t);
          if (s) {
            if (s[1] !== 'eind') scharnier[0] = true;
            if (s[1] !== 'begin') scharnier[1] = true;
          } else if (t === 'trek') trek = true;
          else break;
        }
        let doorsnede = inv.doorsneden.length - 1;
        const kandidaat = n > 0 ? doorsnedeNamen.get(tekst(o, n - 1)) : undefined;
        if (kandidaat !== undefined && [2, 4, 6].includes(n - 1)) {
          doorsnede = kandidaat;
          n--;
        }
        if (doorsnede < 0) throw new Error('zet eerst een doorsnede: rechthoek naam: b; h of doorsnede naam: A; I_y');
        let van: number;
        let naar: number;
        if (n === 2) {
          const bijNaam = (k: number) => {
            const naam = tekst(o, k);
            const i = knoopNamen.get(naam);
            if (i === undefined) throw new Error(`er is geen knoop ${naam}${knoopNamen.size ? ` (wel: ${[...knoopNamen.keys()].join(', ')})` : ''}`);
            return i;
          };
          [van, naar] = [bijNaam(0), bijNaam(1)];
        } else if (n === 4 || n === 6) {
          const d = (n / 2) as 2 | 3;
          const [p, q] = [punt(a, 0, d), punt(a, d, d)];
          if (!(vLengte(vMin(q, p)) > SAMEN)) throw new Error('de staaf heeft geen lengte: begin en eind vallen samen');
          [van, naar] = [knoopOp(p), knoopOp(q)];
        } else {
          throw new Error('schrijf staaf [naam:] knoop; knoop of staaf [naam:] x_1; z_1; x_2; z_2, met daarachter de doorsnede, scharnier [begin|eind] en trek');
        }
        if (van === naar) throw new Error('de staaf heeft geen lengte: begin en eind vallen samen');
        const naam = o.naam ?? `s${inv.staven.length + 1}`;
        if (staafNamen.has(naam) || knoopNamen.has(naam)) throw new Error(`de naam ${naam} staat er al`);
        staafNamen.set(naam, inv.staven.length);
        inv.staven.push({ naam, a: van, b: naar, doorsnede, scharnier, trek });
        break;
      }
      case 'steun': {
        const laatste = tekst(o, a.length - 1);
        let knoop: number;
        let vast: (boolean | number)[];
        const bijNaam = knoopNamen.get(tekst(o, 0));
        const veer = (k: number, draaiing: boolean): boolean | number => {
          const t = tekst(o, k).toLowerCase();
          if (t === 'vast') return true;
          if (t === 'vrij') return false;
          const w = r.reken(a[k]);
          let v: number;
          if (draaiing && isUnit(w)) {
            try {
              v = w.toNumber('kN m / rad');
            } catch {
              v = alsGetal(w, 'kN m', 'de veer');
            }
          } else v = alsGetal(w, draaiing ? '' : 'kN/m', 'de veer');
          if (!(v >= 0)) throw new Error('een veer is vast, vrij of een stijfheid groter dan 0');
          return v === 0 ? false : Number(v.toPrecision(12));
        };
        if (SOORT_RE.test(laatste)) {
          const voor = a.length - 1;
          if (voor === 1) {
            if (bijNaam === undefined) throw new Error(`er is geen knoop ${tekst(o, 0)}`);
            knoop = bijNaam;
          } else if (voor === 2 || voor === 3) knoop = knoopOp(punt(a, 0, voor));
          else throw new Error('schrijf steun knoop; soort of steun x; z; soort');
          if (dimensie === null) throw new Error('zet eerst de knopen of staven');
          vast = steunSoort(laatste, dimensie === 2);
        } else {
          const aantal = bijNaam !== undefined ? a.length - 1 : a.length === 5 ? 3 : a.length === 9 ? 6 : 0;
          const voor = a.length - aantal;
          if (bijNaam !== undefined && voor === 1) knoop = bijNaam;
          else if (aantal && (voor === 2 || voor === 3)) knoop = knoopOp(punt(a, 0, voor));
          else throw new Error('schrijf steun knoop; soort (scharnier, rol, rol z of inklemming) of steun knoop; x; z; draaiing met per richting vast, vrij of een veer');
          if (aantal !== (dimensie === 2 ? 3 : 6)) throw new Error(dimensie === 2 ? 'een vlak staafwerk heeft drie richtingen: x; z; draaiing' : 'een ruimtelijk staafwerk heeft zes richtingen: x; y; z; draaiing om x; om y; om z');
          vast = Array.from({ length: aantal }, (_, k) => veer(voor + k, k >= aantal / 2));
        }
        if (!vast.some((v) => v !== false)) throw new Error('de oplegging houdt niets vast');
        if (inv.steunen.some((s) => s.knoop === knoop)) throw new Error('op die knoop staat al een oplegging');
        inv.steunen.push({ knoop, vast });
        break;
      }
      case 'geval': {
        if (inv.gevallen.some((g) => g.naam === o.naam)) throw new Error(`het geval ${o.naam} staat er al`);
        if (staafNamen.has(o.naam!) || knoopNamen.has(o.naam!)) throw new Error(`de naam ${o.naam} is al een staaf of knoop`);
        geval = { naam: o.naam!, lasten: [] };
        inv.gevallen.push(geval);
        break;
      }
      case 'lijnlast': {
        if (a.length < 2) throw new Error('schrijf lijnlast staaf; q');
        const staaf = staafBijNaam(tekst(o, 0));
        // Het eerste woord dat een richting is en waarmee de aantallen kloppen.
        let richting: { as: As; projectie: boolean } = { as: 'z', projectie: false };
        let waarden: number[] = [];
        let bereik: number[] = [];
        let plek = -1;
        for (let k = 2; k < a.length && plek < 0; k++) {
          const ri = leesRichting(tekst(o, k));
          if (ri && (k === 2 || k === 3) && (a.length - k - 1 === 0 || a.length - k - 1 === 2)) {
            plek = k;
            richting = ri;
          }
        }
        if (plek >= 0) {
          waarden = Array.from({ length: plek - 1 }, (_, k) => 1 + k);
          bereik = Array.from({ length: a.length - plek - 1 }, (_, k) => plek + 1 + k);
        } else if (a.length === 2 || a.length === 3) waarden = Array.from({ length: a.length - 1 }, (_, k) => 1 + k);
        else if (a.length === 5) [waarden, bereik] = [[1, 2], [3, 4]];
        else throw new Error('schrijf lijnlast staaf; q [; q_eind] [; richting] [; van; tot]; richting is z, x, projectie, x projectie of lokaal');
        if (inv.vlak && (richting.as === 'y' || richting.as === 'ly')) throw new Error('een vlak staafwerk heeft geen lasten langs y');
        const q = waarden.map((k) => getal(a[k], 'kN/m', 'q') * teken(richting.as));
        const L = lengteVan(staaf);
        const [van, tot] = bereik.length ? [getal(a[bereik[0]], 'm', 'van'), getal(a[bereik[1]], 'm', 'tot')] : [null, null];
        if (van !== null && tot !== null && !(van >= -SAMEN && tot <= L + SAMEN && tot - van > SAMEN)) {
          throw new Error(`de last loopt van ${van} tot ${tot} m; de staaf ${inv.staven[staaf].naam} is ${Number(L.toPrecision(6))} m lang`);
        }
        inGeval().lasten.push({ soort: 'lijn', staaf, as: richting.as, projectie: richting.projectie, q1: q[0], q2: q[q.length - 1], van, tot });
        break;
      }
      case 'puntlast': {
        const doel = tekst(o, 0);
        const richting = a.length > 2 ? leesRichting(tekst(o, a.length - 1)) : null;
        if (richting?.projectie) throw new Error('een puntlast heeft geen projectie');
        const n = richting ? a.length - 1 : a.length;
        const as: As = richting?.as ?? 'z';
        if (inv.vlak && (as === 'y' || as === 'ly')) throw new Error('een vlak staafwerk heeft geen lasten langs y');
        const knoop = knoopNamen.get(doel);
        if (knoop !== undefined) {
          if (n !== 2) throw new Error('schrijf puntlast knoop; F [; richting]');
          if (as === 'ly' || as === 'lz') throw new Error('een last op een knoop is globaal: z, x of y');
          const F = getal(a[1], 'kN', 'F') * teken(as);
          const last: FemStaafInvoerLast = { soort: 'knoop', knoop, F: as === 'x' ? [F, 0, 0] : as === 'y' ? [0, F, 0] : [0, 0, F] };
          inGeval().lasten.push(last);
          break;
        }
        if (!staafNamen.has(doel)) throw new Error(`er is geen knoop of staaf ${doel}: schrijf puntlast knoop; F of puntlast staaf; F; a`);
        const staaf = staafBijNaam(doel);
        if (n !== 3) throw new Error('schrijf puntlast staaf; F; a [; richting], met a de afstand vanaf het begin van de staaf');
        const F = getal(a[1], 'kN', 'F') * teken(as);
        const plek = getal(a[2], 'm', 'a');
        const L = lengteVan(staaf);
        if (!(plek >= -SAMEN && plek <= L + SAMEN)) throw new Error(`a = ${plek} m ligt buiten de staaf ${inv.staven[staaf].naam}, die ${Number(L.toPrecision(6))} m lang is`);
        inGeval().lasten.push({ soort: 'punt', staaf, a: Math.min(L, Math.max(0, plek)), as, F });
        break;
      }
      case 'eigengewicht': {
        const gamma = getal(a[0], 'kN/m^3', 'γ');
        inGeval().lasten.push({ soort: 'eigengewicht', gamma, staaf: a.length > 1 ? staafBijNaam(tekst(o, 1)) : null });
        break;
      }
      case 'combinatie':
        if (combinaties.some((c) => c.naam === o.naam)) throw new Error(`de combinatie ${o.naam} staat er al`);
        if (staafNamen.has(o.naam!) || knoopNamen.has(o.naam!)) throw new Error(`de naam ${o.naam} is al een staaf of knoop`);
        combinaties.push({ naam: o.naam!, expr: a[0], regel: o.regel });
        break;
      case 'analyse': {
        const t = (o.naam ?? '').toLowerCase().replace(/[_\s]/g, '-');
        if (t === 'lineair' || t === 'linear' || t === 'eerste-orde') inv.analyse = 'lineair';
        else if (t === 'tweede-orde' || t === 'p-delta' || t === 'second-order') inv.analyse = 'tweede-orde';
        else throw new Error(`een staafwerk rekent lineair of in tweede orde (analyse lineair of analyse tweede-orde), niet "${o.naam}"`);
        break;
      }
      case 'knikvormen': {
        const n = getal(a[0], '', 'het aantal knikvormen');
        if (!(Number.isInteger(n) && n >= 0 && n <= 20)) throw new Error('het aantal knikvormen is een heel getal van 0 tot 20');
        inv.knik = n;
        break;
      }
      case 'delen': {
        const n = getal(a[0], '', 'het aantal delen');
        if (!(Number.isInteger(n) && n >= 1 && n <= 16)) throw new Error('het aantal delen per staaf is een heel getal van 1 tot 16');
        inv.delen = n;
        break;
      }
      case 'beeld':
        beelden.push({ set: o.naam!, grootheid: a[0], regel: o.regel });
        break;
      default:
        throw new Error(`${o.woord} hoort niet in een staafwerk`);
    }
  }

  let rondes = 0;
  function voerUit(regels: FemRegel[]) {
    for (const regel of regels) {
      if (regel.soort === 'opdracht') {
        try {
          opdracht(regel);
        } catch (e) {
          meld(regel.regel, melding(e));
        }
      } else if (regel.soort === 'for') {
        let van: number;
        let tot: number;
        try {
          van = getal(regel.van, '', '#for');
          tot = getal(regel.tot, '', '#for');
        } catch (e) {
          meld(regel.regel, melding(e));
          continue;
        }
        for (let k = van; k <= tot + 1e-9; k++) {
          if (++rondes > 10000) {
            meld(regel.regel, '#for: meer dan 10000 rondes');
            return;
          }
          const herstel = r.zet(regel.teller, k);
          try {
            voerUit(regel.body);
          } finally {
            herstel();
          }
        }
      } else {
        let gekozen: FemRegel[] | null = null;
        for (const tak of regel.takken) {
          try {
            if (getal(tak.voorwaarde, '', '#if') !== 0) {
              gekozen = tak.body;
              break;
            }
          } catch (e) {
            meld(regel.regel, melding(e));
            gekozen = [];
            break;
          }
        }
        voerUit(gekozen ?? regel.anders);
      }
    }
  }
  voerUit(node.regels);

  if (!inv.materialen.length) fouten.push('het model heeft geen materiaal: materiaal E; G');
  if (!inv.staven.length) fouten.push('het model heeft geen staven: staaf naam: knoop; knoop');
  if (!inv.steunen.length) fouten.push('het model heeft geen opleggingen: steun knoop; scharnier');
  if (!inv.gevallen.length) fouten.push('het model heeft geen belastinggeval: geval naam');
  for (const g of inv.gevallen) if (!g.lasten.length) fouten.push(`het geval ${g.naam} heeft geen lasten`);
  if (!inv.vlak) {
    for (const d of inv.doorsneden) if (!(d.Iz > 0 && d.It > 0)) fouten.push(`de doorsnede ${d.naam} heeft in een ruimtelijk staafwerk ook I_z en I_t nodig`);
  }

  // Een combinatie is een gewone uitdrukking in de namen van de gevallen; de factor van
  // een geval is de waarde met dat geval 1 en de andere 0, en de som moet lineair zijn.
  const namen = inv.gevallen.map((g) => g.naam);
  for (const c of combinaties) {
    const herstel = namen.map((n) => r.zet(n, 0));
    try {
      const waarde = () => getal(c.expr, '', 'combinatie');
      const nul = waarde();
      const factoren = namen.map((n) => {
        r.zet(n, 1);
        const een = waarde();
        r.zet(n, 2);
        const twee = waarde();
        r.zet(n, 0);
        if (Math.abs(twee - 2 * een + nul) > 1e-9 * Math.max(1, Math.abs(een))) throw new Error(`${c.naam} is geen som van factor maal geval`);
        return een - nul;
      });
      if (Math.abs(nul) > 1e-12) throw new Error(`${c.naam} heeft een deel zonder geval`);
      if (!factoren.some((f) => f !== 0)) throw new Error(`${c.naam} heeft geen geval`);
      inv.combinaties.push({ naam: c.naam, factoren });
    } catch (e) {
      meld(c.regel, melding(e));
    } finally {
      for (const h of herstel.reverse()) h();
    }
  }
  return { invoer: inv, beelden, fouten };
}

/** Is het antwoord gemaakt met een andere FEM Studio of een ander schema dan die van nu? */
function verouderdVan(a: { versie?: string; schema?: string }, fem: FemRekenaar['opties']['fem']): EvaluatedFem['verouderd'] {
  if (!fem) return undefined;
  if (fem.versie && a.versie && fem.versie !== a.versie) return { versie: fem.versie };
  const nu = fem.schemas?.[FEM_STAVEN_TOOL];
  if (nu && a.schema && nu !== a.schema) return { schema: true };
  return undefined;
}

const isCompact = (u: unknown): u is FemStaafUitkomstCompact =>
  !!u && typeof u === 'object' && (u as FemStaafUitkomstCompact).vorm === 'fem-staven/1' && Array.isArray((u as FemStaafUitkomstCompact).gevallen);

const metEenheid = (v: number, eenheid: string) => math.unit(v, eenheid);
const EENHEID: Readonly<Record<FemSnedekracht, string>> = { N: 'kN', Vy: 'kN', Vz: 'kN', T: 'kN m', My: 'kN m', Mz: 'kN m' };

/** De naam van een snedekracht in een variabele: vlak N, V en M; ruimtelijk N, Vy, Vz, T, My, Mz. */
const krachtNaam = (k: FemSnedekracht, vlak: boolean) => (vlak ? (k === 'Vz' ? 'V' : k === 'My' ? 'M' : k) : k);

/** De namen van de reacties in de vrijheidsgraden van het model. */
const reactieNamen = (vlak: boolean): { naam: string; eenheid: string }[] => (vlak
  ? [{ naam: 'Rx', eenheid: 'kN' }, { naam: 'Rz', eenheid: 'kN' }, { naam: 'My', eenheid: 'kN m' }]
  : [{ naam: 'Rx', eenheid: 'kN' }, { naam: 'Ry', eenheid: 'kN' }, { naam: 'Rz', eenheid: 'kN' }, { naam: 'Mx', eenheid: 'kN m' }, { naam: 'My', eenheid: 'kN m' }, { naam: 'Mz', eenheid: 'kN m' }]);

/** Zet de uitkomsten in de scope en onthoudt de namen bij het model. */
function zetVariabelen(naam: string, model: FemStaafModel, scope: Record<string, unknown>): void {
  const m = model.m;
  const namen: string[] = [naam];
  const zet = (sleutel: string, waarde: unknown) => {
    scope[sleutel] = waarde;
    namen.push(sleutel);
  };
  scope[naam] = model;
  const sets = [...model.sets.values()];
  const omhullende = model.omhullendeSets();
  const R = reactieNamen(m.vlak);
  const assen = m.vlak ? (['ux', 'uz'] as const) : (['ux', 'uy', 'uz'] as const);
  const doorbuiging = m.vlak ? (['z'] as const) : (['z', 'y'] as const);
  /** Het kleinste en grootste over een reeks sets, of over de staven. */
  const bereik = (waarden: { min: number; max: number }[]) => ({ min: Math.min(...waarden.map((w) => w.min)), max: Math.max(...waarden.map((w) => w.max)) });
  const zetBereik = (sleutel: string, b: { min: number; max: number }, eenheid: string) => {
    zet(`${sleutel}_max`, metEenheid(b.max, eenheid));
    zet(`${sleutel}_min`, metEenheid(b.min, eenheid));
  };

  for (const s of sets) {
    const basis = `${naam}_${s.naam}`;
    for (const k of model.krachten) {
      m.staven.forEach((st, i) => zetBereik(`${basis}_${st.naam}_${krachtNaam(k, m.vlak)}`, model.uitersten(s, i, k), EENHEID[k]));
      zetBereik(`${basis}_${krachtNaam(k, m.vlak)}`, bereik(m.staven.map((_, i) => model.uitersten(s, i, k))), EENHEID[k]);
    }
    for (const as of doorbuiging) {
      const w = as === 'z' ? 'w' : 'v';
      m.staven.forEach((st, i) => zetBereik(`${basis}_${st.naam}_${w}`, model.doorbuigingUitersten(s, i, as), 'mm'));
      zetBereik(`${basis}_${w}`, bereik(m.staven.map((_, i) => model.doorbuigingUitersten(s, i, as))), 'mm');
    }
    m.knopen.forEach((knoop, k) => {
      if (!knoop) return;
      const u = model.knoopU(s, k);
      for (const as of assen) zet(`${basis}_${knoop}_${as}`, metEenheid(u['xyz'.indexOf(as[1])] * 1000, 'mm'));
    });
    const reacties = m.steunen.map((_, i) => model.reactie(s, i));
    m.steunen.forEach((st, i) => {
      const knoop = m.knopen[st.knoop];
      if (knoop) R.forEach((r, v) => zet(`${basis}_${knoop}_${r.naam}`, metEenheid(reacties[i][v], r.eenheid)));
    });
    R.forEach((r, v) => {
      if (r.eenheid !== 'kN') return;
      const waarden = reacties.map((x) => x[v]);
      zet(`${basis}_${r.naam}`, math.matrix(waarden.map((w) => metEenheid(w, 'kN')) as unknown as number[]));
      zet(`${basis}_${r.naam}_som`, metEenheid(waarden.reduce((t, w) => t + w, 0), 'kN'));
      zet(`${basis}_${r.naam}_max`, metEenheid(Math.max(...waarden), 'kN'));
      zet(`${basis}_${r.naam}_min`, metEenheid(Math.min(...waarden), 'kN'));
    });
    if (s.alpha.length) {
      zet(`${basis}_alpha_cr`, s.alpha[0]);
      zet(`${basis}_alpha`, math.matrix(s.alpha));
    }
  }

  // De omhullende over de combinaties, of over de gevallen als er geen combinaties zijn.
  m.staven.forEach((st, i) => {
    zet(`${naam}_${st.naam}_L`, metEenheid(model.staven[i].L, 'm'));
    for (const k of model.krachten) zetBereik(`${naam}_${st.naam}_${krachtNaam(k, m.vlak)}`, bereik(omhullende.map((s) => model.uitersten(s, i, k))), EENHEID[k]);
    for (const as of doorbuiging) zetBereik(`${naam}_${st.naam}_${as === 'z' ? 'w' : 'v'}`, bereik(omhullende.map((s) => model.doorbuigingUitersten(s, i, as))), 'mm');
  });
  for (const k of model.krachten) {
    zetBereik(`${naam}_${krachtNaam(k, m.vlak)}`, bereik(omhullende.flatMap((s) => m.staven.map((_, i) => model.uitersten(s, i, k)))), EENHEID[k]);
  }
  for (const as of doorbuiging) {
    zetBereik(`${naam}_${as === 'z' ? 'w' : 'v'}`, bereik(omhullende.flatMap((s) => m.staven.map((_, i) => model.doorbuigingUitersten(s, i, as)))), 'mm');
  }
  m.knopen.forEach((knoop, k) => {
    if (!knoop) return;
    for (const as of assen) {
      const waarden = omhullende.map((s) => model.knoopU(s, k)['xyz'.indexOf(as[1])] * 1000);
      zetBereik(`${naam}_${knoop}_${as}`, { min: Math.min(...waarden), max: Math.max(...waarden) }, 'mm');
    }
  });
  m.steunen.forEach((st, i) => {
    const knoop = m.knopen[st.knoop];
    if (!knoop) return;
    R.forEach((r, v) => {
      const waarden = omhullende.map((s) => model.reactie(s, i)[v]);
      zetBereik(`${naam}_${knoop}_${r.naam}`, { min: Math.min(...waarden), max: Math.max(...waarden) }, r.eenheid);
    });
  });
  const alpha = omhullende.filter((s) => s.alpha.length).map((s) => s.alpha[0]);
  if (alpha.length) zet(`${naam}_alpha_cr`, Math.min(...alpha));
  model.namen = namen;
}

/** Haalt de uitkomsten van een eerder staafwerk met dezelfde naam weg: geen oude uitkomst laten staan. */
export function wisFemStaven(naam: string, scope: Record<string, unknown>): void {
  const oud = scope[naam];
  if (oud instanceof FemStaafModel) for (const n of oud.namen) delete scope[n];
}

/** De tabellen van het blok. */
function maakBlad(model: FemStaafModel, kort: FemStaafBlad, knoopNaam: (k: number) => string): FemStaafBlad {
  const m = model.m;
  const sets = [...model.sets.values()];
  const omhullende = model.omhullendeSets();
  const span = (waarden: { min: number; max: number }[]): FemBereik => (waarden.length ? [Math.min(...waarden.map((w) => w.min)), Math.max(...waarden.map((w) => w.max))] : null);
  /** De doorbuiging met de grootste uitslag, met haar teken. */
  const uitslag = (waarden: { min: number; max: number }[]) => waarden.reduce((t, w) => (Math.abs(w.max) > Math.abs(t) ? w.max : Math.abs(w.min) > Math.abs(t) ? w.min : t), 0);
  const staven = m.staven.map((_, i) => i);
  const per = (s: FemStaafSet, k: FemSnedekracht) => span(staven.map((i) => model.uitersten(s, i, k)));
  const plek = (naam: string) => reactieNamen(m.vlak).findIndex((r) => r.naam === naam);
  const reactie = (i: number, naam: string): FemBereik => {
    const v = plek(naam);
    const waarden = omhullende.map((s) => model.reactie(s, i)[v]);
    return [Math.min(...waarden), Math.max(...waarden)];
  };
  return {
    ...kort,
    staven: m.staven.length,
    knopen: m.x.length,
    gevallen: m.gevallen.map((g) => {
      const s = model.set(g.naam);
      return {
        naam: g.naam, lastX: s.last[0], lastZ: -s.last[2], reactieX: s.reactie[0], reactieZ: s.reactie[2],
        ...(m.vlak ? {} : { lastY: s.last[1], reactieY: s.reactie[1] }),
      };
    }),
    sets: sets.map((s) => ({
      naam: s.naam,
      soort: s.soort,
      N: per(s, 'N'),
      V: per(s, 'Vz'),
      M: per(s, 'My'),
      w: uitslag(staven.map((i) => model.doorbuigingUitersten(s, i))),
      alpha: s.alpha.length ? s.alpha[0] : null,
      ...(s.inactief.length ? { inactief: s.inactief.map((i) => m.staven[i].naam) } : {}),
    })),
    omhullende: staven.map((i) => ({
      naam: m.staven[i].naam,
      lengte: model.staven[i].L,
      N: span(omhullende.map((s) => model.uitersten(s, i, 'N'))),
      V: span(omhullende.map((s) => model.uitersten(s, i, 'Vz'))),
      M: span(omhullende.map((s) => model.uitersten(s, i, 'My'))),
      w: uitslag(omhullende.map((s) => model.doorbuigingUitersten(s, i))),
    })),
    reacties: m.steunen.map((st, i) => {
      const draaiing = st.vast[m.vlak ? 2 : 4];
      return {
        naam: knoopNaam(st.knoop),
        Rx: reactie(i, 'Rx'),
        ...(m.vlak ? {} : { Ry: reactie(i, 'Ry') }),
        Rz: reactie(i, 'Rz'),
        M: draaiing === false ? null : reactie(i, 'My'),
      };
    }),
  };
}

export function bouwFemStaven(node: FemNode, r: FemRekenaar, basis: Pick<EvaluatedFem, 'type' | 'naam' | 'taal' | 'gevallen' | 'verborgen' | 'scherm'>): EvaluatedFem {
  const taal = basis.taal;
  const kop = { ...basis, tool: FEM_STAVEN_TOOL };
  const { invoer, beelden, fouten } = leesStaafInvoer(node, r);
  if (fouten.length) return { ...kop, status: 'fout', melding: fouten.join('; ') };
  let model: FemStaafRekenmodel;
  try {
    model = maakFemStaafModel(invoer);
  } catch (e) {
    return { ...kop, status: 'fout', melding: melding(e) };
  }
  const sets = new Set([...invoer.gevallen.map((g) => g.naam), ...invoer.combinaties.map((c) => c.naam), 'omhullende']);
  for (const b of beelden) {
    if (!sets.has(b.set)) return { ...kop, status: 'fout', melding: `beeld: er is geen geval of combinatie ${b.set}` };
    if (!/^(m|v|n|u|lasten)$/i.test(b.grootheid)) return { ...kop, status: 'fout', melding: `beeld ${b.set} ${b.grootheid}: een staafwerk heeft de beelden M, V, N, u (de vervormde stand) en lasten` };
    if (!model.vlak) return { ...kop, status: 'fout', melding: 'beeld is er voor een vlak staafwerk; teken een ruimtelijk staafwerk in een @3d-blok' };
  }
  const kort: FemStaafBlad = {
    vlak: model.vlak, analyse: model.analyse, staven: model.staven.length, knopen: model.x.length, steunen: model.steunen.length,
    trek: model.staven.filter((s) => s.trek).length, knik: model.knik,
  };
  // De hash: het hele rekenmodel. Lineair zitten de combinaties er niet in: die telt
  // CalcSheet op, en een andere factor vraagt dan niets nieuws.
  const hash = toetsHash(FEM_STAVEN_TOOL, { fem: model });
  const vragen = r.opties.toetsModus === 'vragen';
  const metModel = { ...kop, staven: kort, modelSvg: femStaafModelSvg(model, taal), hashes: [hash] };
  const antwoord: ToetsAntwoord | undefined = r.opties.toetsingen?.[hash];
  if (!antwoord) {
    if (!vragen) return { ...metModel, status: 'niet-gerekend', melding: WOORDEN[taal === 'en' ? 'en' : 'nl'].geenAntwoord };
    const verzoek: ToetsVerzoek = { hash, tool: FEM_STAVEN_TOOL, argumenten: {}, bewaar: model };
    return { ...metModel, status: 'wacht', verzoeken: [verzoek] };
  }
  if (!antwoord.ok) return { ...metModel, status: 'fout', melding: antwoord.melding, ...(vragen ? { opnieuw: true } : {}) };
  const herkomst = {
    ...(antwoord.versie ? { versie: antwoord.versie } : {}),
    ...(antwoord.datum ? { datum: antwoord.datum } : {}),
    ...(antwoord.waarschuwing ? { waarschuwing: antwoord.waarschuwing } : {}),
  };
  const mis = (tekst: string): EvaluatedFem => ({ ...metModel, status: 'fout', melding: tekst, ...herkomst, ...(vragen ? { opnieuw: true } : {}) });
  if (!isCompact(antwoord.uitkomst)) return mis('het vastgelegde antwoord is niet te lezen');
  // Het staafwerk van het bewaarde verzoek: daar horen de getallen bij.
  const bewaard = antwoord.verzoek?.vorm === 'fem-staven/1' ? antwoord.verzoek : model;
  let femModel: FemStaafModel;
  try {
    femModel = new FemStaafModel(node.naam, bewaard, {
      uitkomst: antwoord.uitkomst,
      gevallen: invoer.gevallen.map((g) => g.naam),
      combinaties: invoer.combinaties,
    });
  } catch (e) {
    return mis(melding(e));
  }
  let svgs: string[];
  try {
    svgs = beelden.map((b) => femStaafSvg(femModel, b.set, b.grootheid, 640, taal));
  } catch (e) {
    return mis(melding(e));
  }
  zetVariabelen(node.naam, femModel, r.scope);
  const knoopNaam = (k: number) => bewaard.knopen[k] || `(${(bewaard.vlak ? [bewaard.x[k], bewaard.z[k]] : [bewaard.x[k], bewaard.y[k], bewaard.z[k]]).map((v) => getalTekst(v, taal, 2)).join('; ')})`;
  const verouderd = vragen ? verouderdVan(antwoord, r.opties.fem) : undefined;
  const opnieuw = vragen && (!!verouderd || !!herkomst.waarschuwing);
  return {
    ...metModel,
    staven: maakBlad(femModel, kort, knoopNaam),
    modelSvg: femStaafModelSvg(bewaard, taal),
    status: 'klaar',
    ...(svgs.length ? { beelden: svgs } : {}),
    ...herkomst,
    ...(verouderd ? { verouderd } : {}),
    ...(opnieuw ? { opnieuw } : {}),
  };
}

// ── Tonen ────────────────────────────────────────────────────────────────────

const WOORDEN = {
  nl: {
    model: 'FEM-model', door: 'Open FEM Studio', versie: 'versie',
    wacht: 'Wordt gerekend door Open FEM Studio…', nietGerekend: 'NIET GEREKEND',
    geenAntwoord: 'er is geen antwoord van Open FEM Studio',
    opnieuw: 'Opnieuw rekenen', mislukt: 'Opnieuw rekenen lukte niet',
    samenvatting: (b: FemStaafBlad) =>
      `${b.vlak ? 'Vlak' : 'Ruimtelijk'} staafwerk${b.vlak ? ', uit het vlak gehouden' : ''}: ${b.staven} ${b.staven === 1 ? 'staaf' : 'staven'}, ${b.knopen} knopen met de tussenpunten, ${b.steunen} ${b.steunen === 1 ? 'oplegging' : 'opleggingen'}`
      + `${b.trek ? `; ${b.trek} ${b.trek === 1 ? 'staaf neemt' : 'staven nemen'} alleen trek op` : ''}; ${b.analyse === 'tweede-orde' ? 'tweede orde' : 'lineair'}${b.knik ? `, ${b.knik} ${b.knik === 1 ? 'knikvorm' : 'knikvormen'}` : ''}.`,
    geval: 'Rekengeval', set: 'Geval of combinatie', staaf: 'Staaf', steun: 'Oplegging', omhullende: 'omhullende',
    weg: (set: string, staven: string[]) => `${set}: ${staven.join(', ')} ${staven.length === 1 ? 'neemt' : 'nemen'} geen druk op en ${staven.length === 1 ? 'doet' : 'doen'} niet mee.`,
    verouderdVersie: (oud: string, nu: string) => `Gerekend met versie ${oud}; deze CalcSheet heeft FEM Studio ${nu}.`,
    verouderdSchema: `Het schema van ${FEM_STAVEN_TOOL} is veranderd sinds deze berekening.`,
  },
  en: {
    model: 'FEM model', door: 'Open FEM Studio', versie: 'version',
    wacht: 'Being calculated by Open FEM Studio…', nietGerekend: 'NOT CALCULATED',
    geenAntwoord: 'there is no answer from Open FEM Studio',
    opnieuw: 'Calculate again', mislukt: 'Calculating again failed',
    samenvatting: (b: FemStaafBlad) =>
      `${b.vlak ? 'Plane' : 'Space'} frame${b.vlak ? ', restrained out of plane' : ''}: ${b.staven} ${b.staven === 1 ? 'member' : 'members'}, ${b.knopen} nodes including the intermediate points, ${b.steunen} ${b.steunen === 1 ? 'support' : 'supports'}`
      + `${b.trek ? `; ${b.trek} ${b.trek === 1 ? 'member takes' : 'members take'} tension only` : ''}; ${b.analyse === 'tweede-orde' ? 'second order' : 'linear'}${b.knik ? `, ${b.knik} buckling ${b.knik === 1 ? 'mode' : 'modes'}` : ''}.`,
    geval: 'Analysis case', set: 'Case or combination', staaf: 'Member', steun: 'Support', omhullende: 'envelope',
    weg: (set: string, staven: string[]) => `${set}: ${staven.join(', ')} ${staven.length === 1 ? 'takes' : 'take'} no compression and ${staven.length === 1 ? 'is' : 'are'} left out.`,
    verouderdVersie: (oud: string, nu: string) => `Calculated with version ${oud}; this CalcSheet has FEM Studio ${nu}.`,
    verouderdSchema: `The schema of ${FEM_STAVEN_TOOL} has changed since this calculation.`,
  },
} as const;

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getalTekst(v: number | null | undefined, taal: string, decimalen = 2): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '–';
  const t = v.toFixed(decimalen);
  const n = /^-0[.]?0*$/.test(t) ? t.slice(1) : t;
  return taal === 'nl' ? n.replace('.', ',') : n;
}

function datumTekst(iso: string, taal: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '';
  return taal === 'nl' ? `${Number(m[3])}-${Number(m[2])}-${m[1]}` : `${m[1]}-${m[2]}-${m[3]}`;
}

/** Het blok op het blad: de kop, het schema, het evenwicht per rekengeval en de tabellen met uitersten. */
export function renderFemStaven(node: EvaluatedFem): string {
  if (node.verborgen) return '';
  const t = node.taal === 'en' ? 'en' : 'nl';
  const w = WOORDEN[t];
  const tool = node.tool ?? FEM_STAVEN_TOOL;
  const datum = node.datum ? datumTekst(node.datum, t) : '';
  const kop = `<p class="calc-fem-kop"><strong>${esc(w.model)} ${esc(node.naam)}</strong> — <code>${esc(tool)}</code>, ${esc(w.door)}${node.versie ? ` ${esc(w.versie)} ${esc(node.versie)}` : ''}${datum ? `<span class="alleen-scherm">, ${esc(datum)}</span>` : ''}</p>`;
  const scherm = node.scherm ? ' alleen-scherm' : '';
  const hashes = (node.hashes ?? []).join(' ');
  const knop = node.opnieuw && hashes ? ` <button type="button" class="calc-toets-opnieuw" data-toets-opnieuw="${esc(hashes)}">${esc(w.opnieuw)}</button>` : '';
  const b = node.staven;
  const samenvatting = b ? `<p class="calc-fem-samenvatting">${esc(w.samenvatting(b))}</p>` : '';
  const beeld = node.modelSvg ? `<div class="calc-fem-modelbeeld">${node.modelSvg}</div>` : '';
  if (node.status === 'wacht') {
    return `<div class="calc-fem calc-fem-wacht${scherm}" data-fem="${esc(hashes)}">${kop}${samenvatting}${beeld}<p>${esc(w.wacht)}</p></div>`;
  }
  if (node.status !== 'klaar' || !b?.sets) {
    const tekst = `${w.nietGerekend}${node.melding ? `: ${node.melding}` : ''}`;
    const opnieuw = knop ? `<p class="alleen-scherm">${knop.trim()}</p>` : '';
    return `<div class="calc-fem calc-fem-fout${scherm}" data-fem="${esc(hashes)}">${kop}${samenvatting}${beeld}<p class="calc-fem-melding">${esc(tekst)}</p>${opnieuw}</div>`;
  }
  const meldingen = [
    node.verouderd?.versie && node.versie ? w.verouderdVersie(node.versie, node.verouderd.versie) : '',
    node.verouderd?.schema ? w.verouderdSchema : '',
    node.waarschuwing ? `${w.mislukt}: ${node.waarschuwing}` : '',
  ].filter(Boolean);
  const verouderd = meldingen.length || knop ? `<p class="calc-toets-verouderd alleen-scherm">${meldingen.map(esc).join(' ')}${knop}</p>` : '';
  const cel = (v: number | null | undefined, decimalen = 2) => `<td class="getal">${getalTekst(v, t, decimalen)}</td>`;
  const paar = (p: FemBereik | undefined, decimalen = 2) => `${cel(p?.[0], decimalen)}${cel(p?.[1], decimalen)}`;
  const th = (h: string) => `<th>${h}</th>`;
  /** Twee kolommen: de kleinste en de grootste, met de as in de index (`V_z,min`). */
  const minMax = (g: string, as = '') => `${th(`${g}<sub>${as ? `${as},` : ''}min</sub>`)}${th(`${g}<sub>${as ? `${as},` : ''}max</sub>`)}`;

  const ruim = !b.vlak;
  const gevallen = `<table class="calc-fem-tabel"><thead><tr>${th(esc(w.geval))}${th('Σ F<sub>x</sub>')}${th('Σ R<sub>x</sub>')}${ruim ? `${th('Σ F<sub>y</sub>')}${th('Σ R<sub>y</sub>')}` : ''}${th('Σ F<sub>z</sub> ↓')}${th('Σ R<sub>z</sub> ↑')}</tr>`
    + `<tr class="eenheid"><th></th><th colspan="${ruim ? 6 : 4}">[kN]</th></tr></thead><tbody>${(b.gevallen ?? [])
      .map((g) => `<tr><td>${esc(g.naam)}</td>${cel(g.lastX)}${cel(g.reactieX)}${ruim ? `${cel(g.lastY)}${cel(g.reactieY)}` : ''}${cel(g.lastZ)}${cel(g.reactieZ)}</tr>`)
      .join('')}</tbody></table>`;
  const knik = b.sets.some((s) => s.alpha !== null);
  const krachten = `${minMax('N')}${minMax('V', ruim ? 'z' : '')}${minMax('M', ruim ? 'y' : '')}`;
  const eenheden = '<th colspan="4">[kN]</th><th colspan="2">[kNm]</th><th>[mm]</th>';
  const sets = `<table class="calc-fem-tabel"><thead><tr>${th(esc(w.set))}${krachten}${th('w')}${knik ? th('α<sub>cr</sub>') : ''}</tr>`
    + `<tr class="eenheid"><th></th>${eenheden}${knik ? '<th></th>' : ''}</tr></thead><tbody>${b.sets
      .map((s) => `<tr class="${s.soort}"><td>${esc(s.naam)}</td>${paar(s.N)}${paar(s.V)}${paar(s.M)}${cel(s.w)}${knik ? cel(s.alpha) : ''}</tr>`)
      .join('')}</tbody></table>`;
  const weg = b.sets.filter((s) => s.inactief?.length).map((s) => `<p class="calc-fem-samenvatting">${esc(w.weg(s.naam, s.inactief!))}</p>`).join('');
  const staven = `<table class="calc-fem-tabel"><thead><tr>${th(`${esc(w.staaf)} (${esc(w.omhullende)})`)}${th('L')}${krachten}${th('w')}</tr>`
    + `<tr class="eenheid"><th></th><th>[m]</th>${eenheden}</tr></thead><tbody>${(b.omhullende ?? [])
      .map((s) => `<tr><td>${esc(s.naam)}</td>${cel(s.lengte, 3)}${paar(s.N)}${paar(s.V)}${paar(s.M)}${cel(s.w)}</tr>`)
      .join('')}</tbody></table>`;
  const moment = (b.reacties ?? []).some((r) => r.M !== null);
  const reacties = `<table class="calc-fem-tabel"><thead><tr>${th(`${esc(w.steun)} (${esc(w.omhullende)})`)}${minMax('R', 'x')}${ruim ? minMax('R', 'y') : ''}${minMax('R', 'z')}${moment ? minMax('M', 'y') : ''}</tr>`
    + `<tr class="eenheid"><th></th><th colspan="${ruim ? 6 : 4}">[kN]</th>${moment ? '<th colspan="2">[kNm]</th>' : ''}</tr></thead><tbody>${(b.reacties ?? [])
      .map((r) => `<tr><td>${esc(r.naam)}</td>${paar(r.Rx)}${ruim ? paar(r.Ry) : ''}${paar(r.Rz)}${moment ? paar(r.M) : ''}</tr>`)
      .join('')}</tbody></table>`;
  const beelden = (node.beelden ?? []).map((s) => `<div class="calc-fem-kaart">${s}</div>`).join('');
  return `<div class="calc-fem${scherm}" data-fem="${esc(hashes)}">${kop}${verouderd}${samenvatting}${beeld}${gevallen}${sets}${weg}${staven}${reacties}${beelden}</div>`;
}
