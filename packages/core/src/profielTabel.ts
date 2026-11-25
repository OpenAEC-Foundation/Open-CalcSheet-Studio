/**
 * De tabel van de Europese I- en H-profielen, in de eenheden en de kolomvolgorde van de
 * profieltabel. De desktop leest hem in components/calc/profielen.ts (de staalmodules, de
 * beelden, de matrix voor de bladen); de kern leest hem voor `doorsnede HEA200` in een
 * `@fem`-blok. scripts/check-profielen.mjs rekent de waarden na uit de nominale maten.
 *
 * Waarden: nominaal volgens de gangbare profieltabellen (EN 10365), met de afronding van
 * die tabellen.
 */

/**
 * Eén regel van de tabel, in de eenheden en de kolomvolgorde van de
 * profieltabel: id, naam | h, b, t_w, t_f, r (mm) | A (cm²) | I_y (cm⁴),
 * W_el,y, W_pl,y (cm³), i_y (cm), A_v,z (cm²) | I_z (cm⁴), W_el,z, W_pl,z (cm³),
 * i_z (cm) | I_t (cm⁴), I_w (10³ cm⁶).
 */
export type IRegel = readonly [
  id: number, naam: string,
  h: number, b: number, tw: number, tf: number, r: number, A: number,
  Iy: number, Wely: number, Wply: number, iy: number, Avz: number,
  Iz: number, Welz: number, Wplz: number, iz: number,
  It: number, Iw: number,
];

/**
 * A_v,z = A − 2·b·t_f + (t_w + 2r)·t_f, EN 1993-1-1 6.2.6(3)a, zonder de
 * ondergrens η·h_w·t_w: die hangt van η af en hoort in het blad.
 * I_t telt de afrondingen mee; I_w = t_f·b³·(h − t_f)²/24.
 */
export const I_TABEL: readonly IRegel[] = [
  [1, "HEA 100", 96, 100, 5, 8, 12, 21.24, 349.2, 72.76, 83.01, 4.06, 7.56, 133.8, 26.76, 41.14, 2.51, 5.24, 2.58],
  [2, "HEA 120", 114, 120, 5, 8, 12, 25.34, 606.2, 106.3, 119.5, 4.89, 8.46, 230.9, 38.48, 58.85, 3.02, 5.99, 6.47],
  [3, "HEA 140", 133, 140, 5.5, 8.5, 12, 31.42, 1033, 155.4, 173.5, 5.73, 10.12, 389.3, 55.62, 84.85, 3.52, 8.13, 15.06],
  [4, "HEA 160", 152, 160, 6, 9, 15, 38.77, 1673, 220.1, 245.1, 6.57, 13.21, 615.6, 76.95, 117.6, 3.98, 12.19, 31.41],
  [5, "HEA 180", 171, 180, 6, 9.5, 15, 45.25, 2510, 293.6, 324.9, 7.45, 14.47, 924.6, 102.7, 156.5, 4.52, 14.80, 60.21],
  [6, "HEA 200", 190, 200, 6.5, 10, 18, 53.83, 3692, 388.6, 429.5, 8.28, 18.08, 1336, 133.6, 203.8, 4.98, 20.98, 108.0],
  [7, "HEA 220", 210, 220, 7, 11, 18, 64.34, 5410, 515.2, 568.5, 9.17, 20.67, 1955, 177.7, 270.6, 5.51, 28.46, 193.3],
  [8, "HEA 240", 230, 240, 7.5, 12, 21, 76.84, 7763, 675.1, 744.6, 10.05, 25.18, 2769, 230.7, 351.7, 6.00, 41.55, 328.5],
  [9, "HEA 260", 250, 260, 7.5, 12.5, 24, 86.82, 10450, 836.4, 919.8, 10.97, 28.76, 3668, 282.1, 430.2, 6.50, 52.37, 516.4],
  [10, "HEA 300", 290, 300, 8.5, 14, 27, 112.5, 18260, 1260, 1383, 12.74, 37.28, 6310, 420.6, 641.2, 7.49, 85.17, 1200],
  [11, "HEB 100", 100, 100, 6, 10, 12, 26.04, 449.5, 89.91, 104.2, 4.16, 9.04, 167.3, 33.45, 51.42, 2.53, 9.25, 3.38],
  [12, "HEB 120", 120, 120, 6.5, 11, 12, 34.01, 864.4, 144.1, 165.2, 5.04, 10.96, 317.5, 52.92, 80.97, 3.06, 13.84, 9.41],
  [13, "HEB 140", 140, 140, 7, 12, 12, 42.96, 1509, 215.6, 245.4, 5.93, 13.08, 549.7, 78.52, 119.8, 3.58, 20.06, 22.48],
  [14, "HEB 160", 160, 160, 8, 13, 15, 54.25, 2492, 311.5, 354.0, 6.78, 17.59, 889.2, 111.2, 170.0, 4.05, 31.24, 47.94],
  [15, "HEB 180", 180, 180, 8.5, 14, 15, 65.25, 3831, 425.7, 481.4, 7.66, 20.24, 1363, 151.4, 231.0, 4.57, 42.16, 93.75],
  [16, "HEB 200", 200, 200, 9, 15, 18, 78.08, 5696, 569.6, 642.5, 8.54, 24.83, 2003, 200.3, 305.8, 5.07, 59.28, 171.1],
  [17, "HEB 220", 220, 220, 9.5, 16, 18, 91.04, 8091, 735.5, 827.0, 9.43, 27.92, 2843, 258.5, 393.9, 5.59, 76.57, 295.4],
  [18, "HEB 240", 240, 240, 10, 17, 21, 106.0, 11260, 938.3, 1053, 10.31, 33.23, 3923, 326.9, 498.4, 6.08, 102.7, 486.9],
  [19, "HEB 260", 260, 260, 10, 17.5, 24, 118.4, 14920, 1148, 1283, 11.22, 37.59, 5135, 395.0, 602.2, 6.58, 123.8, 753.7],
  [20, "HEB 300", 300, 300, 11, 19, 27, 149.1, 25170, 1678, 1869, 12.99, 47.43, 8563, 570.9, 870.1, 7.58, 185.0, 1688],
  [21, "IPE 200", 200, 100, 5.6, 8.5, 12, 28.48, 1943, 194.3, 220.6, 8.26, 14.00, 142.4, 28.47, 44.61, 2.24, 6.98, 12.99],
  [22, "IPE 240", 240, 120, 6.2, 9.8, 15, 39.12, 3892, 324.3, 366.6, 9.97, 19.14, 283.6, 47.27, 73.92, 2.69, 12.88, 37.39],
  [23, "IPE 270", 270, 135, 6.6, 10.2, 15, 45.95, 5790, 428.9, 484.0, 11.23, 22.14, 419.9, 62.20, 96.95, 3.02, 15.94, 70.58],
  [24, "IPE 300", 300, 150, 7.1, 10.7, 15, 53.81, 8356, 557.1, 628.4, 12.46, 25.68, 603.8, 80.50, 125.2, 3.35, 20.12, 125.9],
  [25, "IPE 330", 330, 160, 7.5, 11.5, 18, 62.61, 11770, 713.1, 804.3, 13.71, 30.81, 788.1, 98.52, 153.7, 3.55, 28.15, 199.1],
  [26, "IPE 360", 360, 170, 8, 12.7, 18, 72.73, 16270, 903.6, 1019, 14.95, 35.14, 1043, 122.8, 191.1, 3.79, 37.32, 313.6],
  [27, "IPE 400", 400, 180, 8.6, 13.5, 21, 84.46, 23130, 1156, 1307, 16.55, 42.69, 1318, 146.4, 229.0, 3.95, 51.08, 490.0],
];

/** De grootheden van een I- of H-profiel voor een staafwerk, in mm² en mm⁴. */
export interface StaafProfiel {
  naam: string;
  A: number;
  Iy: number;
  Iz: number;
  It: number;
}

/** Een naam zonder spaties en in hoofdletters: `hea200`, `HEA 200` en `HEA200` zijn één profiel. */
const sleutel = (naam: string) => naam.replace(/\s+/g, '').toUpperCase();

/** Het profiel bij een naam zoals `HEA200`, `IPE 300` of `heb300`; anders null. */
export function staafProfiel(naam: string): StaafProfiel | null {
  const r = I_TABEL.find((x) => sleutel(x[1]) === sleutel(naam));
  if (!r) return null;
  const maal = (v: number, f: number) => Number((v * f).toPrecision(12));
  return { naam: r[1], A: maal(r[7], 1e2), Iy: maal(r[8], 1e4), Iz: maal(r[13], 1e4), It: maal(r[17], 1e4) };
}

/** De namen van alle profielen, zonder spatie (`HEA200`). */
export const STAAF_PROFIELEN: readonly string[] = I_TABEL.map((r) => sleutel(r[1]));
