import type { Lees } from "./poerDefinitie.ts";
import { bestaat, buigStraal, maakStaaf, type P3, type Staaf } from "./poerStaven.ts";

/*
 * Eén vastgelegde definitie van een poer op drie of vier palen: de maten en de gekozen
 * staven, met de plaats van elke staaf. De staaflijst, het DXF-detail en de IFC-uitvoer
 * komen hieruit (poerStaven.ts, poerDxf.ts, meerpaalIfcx.ts).
 *
 * Hier staan geen rekenregels: alleen de opbouw van de korf uit de invoer van het blad
 * (templates/meerpaalspoer.ts). De plaats van de banden volgt het blad: de band in x (of
 * bij drie palen de onderste band) onderin, de andere band erop; de hefboomsarm rekent
 * met de bovenste laag. Dat het been van een band hier op dezelfde plaats staat als in de
 * verankering van het blad (l_h), bewaakt scripts/check-poer-staaflijst.mjs.
 *
 * Wat het blad niet vastlegt en hier gekozen is (ook in docs/meerpaalspoer-toetsing.md):
 *   - het ondernet ligt in twee eigen lagen direct op de banden, over de volle breedte
 *     tussen de dekking, h.o.h. ten hoogste s_n;
 *   - de randbeugels liggen langs de zijvlakken op de dekking, gelijk verdeeld over de
 *     hoogte tussen de banden en de bovendekking (zoals s_zv in het blad);
 *   - een omgebogen band buigt binnen de randbeugel op; het net stopt tegen het been.
 *
 * Geen imports buiten poerStaven.ts: het controlescript laadt dit bestand in Node.
 * Alle maten in mm; de oorsprong ligt op de onderkant van de poer, in het hart van de kolom.
 */

export type P2 = [number, number];

export interface MeerpaalDefinitie {
  n: 3 | 4;
  h: number;
  /** De omtrek van de poer, tegen de klok in. */
  omtrek: P2[];
  /** Het hart van elke paal. */
  palen: P2[];
  paal: { rond: boolean; x: number; y: number; inbedding: number };
  kolom: { rond: boolean; x: number; y: number };
  c_o: number;
  c_z: number;
  maten: { a_x: number; a_y: number; a_3: number; r_rand: number; l: number; b: number };
  band: { n: number; d: number; s: number; omgebogen: boolean; lOp: number; doorn: number; breedte: number };
  net: { d: number; s: number };
  rand: { n: number; d: number; z: number[] };
  /**
   * Hoe ver de band voorbij het paalhart loopt, langs de band: tot het hart van het been
   * of tot het uiteinde. Bij vier palen in x en in y, bij drie palen voor elke band gelijk.
   */
  uitsteek: { x: number; y: number };
  /** Hart van de onderste en de bovenste laag banden. */
  zBand: [number, number];
}

const geheel = (w: number) => Math.max(0, Math.round(w));
const SIN30 = 0.5;
const COS30 = Math.sqrt(3) / 2;

/** Een bolle veelhoek tegen de klok in, elke rand `δ` naar binnen. */
export function binnenOmtrek(veelhoek: P2[], δ: number): P2[] {
  const n = veelhoek.length;
  const lijnen = veelhoek.map((a, i) => {
    const b = veelhoek[(i + 1) % n];
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const u: P2 = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    const binnen: P2 = [-u[1], u[0]];
    return { p: [a[0] + binnen[0] * δ, a[1] + binnen[1] * δ] as P2, u };
  });
  return lijnen.map((L, i) => {
    const V = lijnen[(i - 1 + n) % n];
    // Snijpunt van V.p + s·V.u en L.p + t·L.u.
    const noemer = V.u[0] * L.u[1] - V.u[1] * L.u[0];
    if (Math.abs(noemer) < 1e-12) return L.p;
    const s = ((L.p[0] - V.p[0]) * L.u[1] - (L.p[1] - V.p[1]) * L.u[0]) / noemer;
    return [V.p[0] + s * V.u[0], V.p[1] + s * V.u[1]] as P2;
  });
}

/** Het stuk van de lijn `as` = `w` (as 1: y = w, as 0: x = w) binnen een bolle veelhoek. */
export function koorde(veelhoek: P2[], as: 0 | 1, w: number): [number, number] | null {
  const ander = as === 1 ? 0 : 1;
  const snij: number[] = [];
  const n = veelhoek.length;
  for (let i = 0; i < n; i++) {
    const a = veelhoek[i];
    const b = veelhoek[(i + 1) % n];
    const lo = Math.min(a[as], b[as]);
    const hi = Math.max(a[as], b[as]);
    if (w < lo - 1e-9 || w > hi + 1e-9 || hi - lo < 1e-12) continue;
    const t = (w - a[as]) / (b[as] - a[as]);
    snij.push(a[ander] + t * (b[ander] - a[ander]));
  }
  if (snij.length < 2) return null;
  const k: [number, number] = [Math.min(...snij), Math.max(...snij)];
  return k[1] - k[0] > 1e-6 ? k : null;
}

/** De poer uit de invoer van het blad. Wat niet past, staat ook zo in de staaflijst; het blad toetst. */
export function maakMeerpaalPoer(d: Lees): MeerpaalDefinitie {
  const vier = Math.round(d("n_p")) !== 3;
  const h = Math.max(0, d("h_poer"));
  const paalRond = Math.round(d("paalvorm")) === 2;
  const kolomRond = Math.round(d("kolomvorm")) === 2;
  const p_x = Math.max(0, d("p_x"));
  const p_y = paalRond ? p_x : Math.max(0, d("p_y"));
  const c_x = Math.max(0, d("c_x"));
  const c_y = kolomRond ? c_x : Math.max(0, d("c_y"));
  const c_o = Math.max(0, d("c_o"));
  const c_z = Math.max(0, d("c_z"));

  const n_t = geheel(d("n_t"));
  const d_t = Math.max(0, d("d_t"));
  const s_t = Math.max(0, d("s_t"));
  const omgebogen = Math.round(d("vorm_t")) === 2;
  const n_z = geheel(d("n_z"));
  const d_z = Math.max(0, d("d_z"));
  const d_n = Math.max(0, d("d_n"));
  const s_n = Math.max(0, d("s_n"));
  // Een omgebogen band buigt op binnen de randbeugel: het hart van het been ligt een
  // randbeugel en een halve staaf binnen de dekking.
  const u_r = omgebogen ? (n_z > 0 && d_z > 0 ? d_z : 0) + d_t / 2 : 0;
  const breedte = n_t > 0 ? (n_t - 1) * s_t + d_t : 0;
  const oMax = n_t > 0 ? ((n_t - 1) / 2) * s_t : 0;

  let omtrek: P2[];
  let palen: P2[];
  let maten: MeerpaalDefinitie["maten"];
  let uitsteek: MeerpaalDefinitie["uitsteek"];
  if (vier) {
    const a_x = Math.max(0, d("a_x"));
    const a_y = Math.max(0, d("a_y"));
    const l = Math.max(0, d("l_poer"));
    const b = Math.max(0, d("b_poer"));
    omtrek = [[-l / 2, -b / 2], [l / 2, -b / 2], [l / 2, b / 2], [-l / 2, b / 2]];
    palen = [[-a_x / 2, -a_y / 2], [a_x / 2, -a_y / 2], [a_x / 2, a_y / 2], [-a_x / 2, a_y / 2]];
    maten = { a_x, a_y, a_3: 0, r_rand: 0, l, b };
    uitsteek = { x: l / 2 - c_z - u_r - a_x / 2, y: b / 2 - c_z - u_r - a_y / 2 };
  } else {
    const a_3 = Math.max(0, d("a_3"));
    const r = Math.max(0, d("r_rand"));
    const R = a_3 / Math.sqrt(3);
    const t_af = r * Math.tan(Math.PI / 6);
    const φ = (k: number) => ((90 + 120 * k) * Math.PI) / 180;
    palen = [0, 1, 2].map((k) => [R * Math.cos(φ(k)), R * Math.sin(φ(k))] as P2);
    // Per paal twee hoeken van de afschuining, zoals in de plattegrond van het blad.
    omtrek = [0, 1, 2].flatMap((k) => {
      const c = Math.cos(φ(k));
      const s = Math.sin(φ(k));
      return [-1, 1].map((teken) => [palen[k][0] + r * c - teken * t_af * s, palen[k][1] + r * s + teken * t_af * c] as P2);
    });
    maten = { a_x: a_3, a_y: a_3, a_3, r_rand: r, l: 0, b: 0 };
    // De buitenste staaf van de band raakt de afschuining het eerst: alle staven van een
    // band zijn even lang en houden daar hun dekking.
    const t = (r - c_z - u_r - oMax * SIN30) / COS30;
    uitsteek = { x: t, y: t };
  }

  const h_in = h - c_o - c_z - 2 * d_t;
  const randZ = Array.from({ length: n_z }, (_, i) => c_o + 2 * d_t + ((i + 1) * h_in) / (n_z + 1));
  return {
    n: vier ? 4 : 3,
    h, omtrek, palen,
    paal: { rond: paalRond, x: p_x, y: p_y, inbedding: Math.max(0, d("t_in")) },
    kolom: { rond: kolomRond, x: c_x, y: c_y },
    c_o, c_z, maten,
    band: { n: n_t, d: d_t, s: s_t, omgebogen, lOp: omgebogen ? Math.max(0, d("l_op")) : 0, doorn: omgebogen ? Math.max(0, d("D_m")) : 0, breedte },
    net: { d: d_n, s: s_n },
    rand: { n: n_z, d: d_z, z: randZ },
    uitsteek,
    zBand: [c_o + d_t / 2, c_o + (3 * d_t) / 2],
  };
}

/** Gelijk verdeeld van a tot b, met ten hoogste `s` tussen twee staven. */
function verdeelTot(a: number, b: number, s: number): number[] {
  if (!(b > a)) return b === a ? [a] : [];
  if (!(s > 0)) return [];
  const n = Math.ceil((b - a) / s - 1e-9) + 1;
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

/**
 * De staven van de poer: banden, ondernet en randbeugels, in die volgorde. Het net bij
 * drie palen verloopt in lengte: elke richting is één reeks met één merk.
 */
export function stavenMeerpaal(m: MeerpaalDefinitie): Staaf[] {
  const uit: Staaf[] = [];
  const bd = m.band;
  const [z1, z2] = m.zBand;
  const offsets = Array.from({ length: bd.n }, (_, j) => (j - (bd.n - 1) / 2) * bd.s);
  const rBand = (bd.doorn + bd.d) / 2;
  /** Een band van a naar b (paalharten), met een uitsteek t voorbij elke paal. */
  const band = (sleutel: string, a: P2, b: P2, t: number, z: number) => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (!(l > 0)) return;
    const u: P2 = [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
    const mid: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let w: P2 = [u[1], -u[0]];
    if (w[0] * mid[0] + w[1] * mid[1] < 0) w = [-w[0], -w[1]];
    for (const o of offsets) {
      const p0: P3 = [a[0] - t * u[0] + o * w[0], a[1] - t * u[1] + o * w[1], z];
      const p1: P3 = [b[0] + t * u[0] + o * w[0], b[1] + t * u[1] + o * w[1], z];
      uit.push(bd.omgebogen
        ? maakStaaf("band", sleutel, bd.d, [[p0[0], p0[1], z + bd.lOp], p0, p1, [p1[0], p1[1], z + bd.lOp]], { r: rBand })
        : maakStaaf("band", sleutel, bd.d, [p0, p1]));
    }
  };
  if (m.n === 4) {
    const { a_x, a_y } = m.maten;
    // De band in x ligt onderin, over de palen op y = ±a_y/2; de band in y erop.
    for (const y of [-a_y / 2, a_y / 2]) band("band/x", [-a_x / 2, y], [a_x / 2, y], m.uitsteek.x, z1);
    for (const x of [-a_x / 2, a_x / 2]) band("band/y", [x, -a_y / 2], [x, a_y / 2], m.uitsteek.y, z2);
  } else {
    // Band k van paal k naar paal k+1; de band tussen de twee onderste palen (k = 1) onderin.
    for (let k = 0; k < 3; k++) band(`band/${k + 1}`, m.palen[k], m.palen[(k + 1) % 3], m.uitsteek.x, k === 1 ? z1 : z2);
  }

  // ── ondernet ──────────────────────────────────────────────────────────────
  const nt = m.net;
  if (nt.d > 0 && nt.s > 0 && m.omtrek.length >= 3) {
    // Aan de einden stopt het net tegen het been van een omgebogen band; opzij ligt de
    // buitenste staaf niet verder naar buiten dan die einden.
    const δEind = m.c_z + (bd.omgebogen && bd.n > 0 ? (m.rand.n > 0 && m.rand.d > 0 ? m.rand.d : 0) + bd.d : 0);
    const zij = binnenOmtrek(m.omtrek, Math.max(m.c_z + nt.d / 2, δEind));
    const eind = binnenOmtrek(m.omtrek, δEind);
    const zNet = m.c_o + 2 * bd.d + nt.d / 2;
    const verloopt = m.n === 3;
    ([[1, zNet, "net/x"], [0, zNet + nt.d, "net/y"]] as const).forEach(([as, z, sleutel]) => {
      const waarden = zij.map((p) => p[as]);
      for (const w of verdeelTot(Math.min(...waarden), Math.max(...waarden), nt.s)) {
        const k = koorde(eind, as, w);
        if (!k) continue;
        const pad: P3[] = as === 1 ? [[k[0], w, z], [k[1], w, z]] : [[w, k[0], z], [w, k[1], z]];
        uit.push(maakStaaf("net", sleutel, nt.d, pad, verloopt ? { reeks: sleutel } : {}));
      }
    });
  }

  // ── randbeugels ───────────────────────────────────────────────────────────
  const rd = m.rand;
  if (rd.n > 0 && rd.d > 0) {
    const lus = binnenOmtrek(m.omtrek, m.c_z + rd.d / 2);
    for (const z of rd.z) {
      uit.push(maakStaaf("randbeugel", "randbeugel", rd.d, lus.map(([x, y]) => [x, y, z] as P3), { gesloten: true, r: buigStraal(rd.d), haken: 2 }));
    }
  }
  return uit.filter(bestaat);
}
