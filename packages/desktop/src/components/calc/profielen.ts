/**
 * Europese profieltabel — gedeeld door de staalmodules (stalen kolom,
 * brandwerendheid, moment-, dwarskracht- en schoorverbinding).
 *
 * De id's komen overeen met de @select-waarden in de bijbehorende rekenbladen.
 * Dezelfde gegevens zijn er in twee vormen:
 *
 *   • PROFIELEN en HOEKSTALEN, voor de beelden. Alles in mm: maten in mm,
 *     oppervlak in mm², weerstandsmoment in mm³, traagheidsmoment in mm⁴,
 *     welvingsconstante in mm⁶.
 *   • profielMatrix() met profielOpzoeking(), en hoekstaalMatrix() met
 *     hoekstaalOpzoeking(), voor de rekenbladen: een rekentaal-matrix in de
 *     eenheden van de profieltabel (mm, cm², cm⁴, …) plus de hlookup-regels die
 *     er de grootheden mét eenheid uithalen. Zie de toelichting bij
 *     profielMatrix() voor het gebruik in een blad.
 *
 * Waarden: nominaal volgens de gangbare profieltabellen (EN 10365 voor I- en
 * H-profielen, EN 10056-1 voor hoekstaal), met de afronding van die tabellen.
 * scripts/check-profielen.mjs rekent ze na uit de nominale maten en bewaakt dat
 * de matrix in een blad gelijk loopt met deze tabel.
 */

import { I_TABEL } from "@ifc-calc/core";

// ── I- en H-profielen ────────────────────────────────────────────────────────

// De tabel zelf staat in de kern (packages/core/src/profielTabel.ts): een `@fem`-blok
// leest er de profielen ook uit.

/** Een I- of H-profiel, alles in mm-eenheden (zie de kop van dit bestand). */
export interface Profiel {
  naam: string;
  h: number;    // profielhoogte
  b: number;    // flensbreedte
  tw: number;   // lijfdikte
  tf: number;   // flensdikte
  A: number;    // doorsnede-oppervlak [mm²]
  r: number;    // afrondingsstraal tussen lijf en flens [mm]
  Iy: number;   // traagheidsmoment om de sterke as [mm⁴]
  Iz: number;   // traagheidsmoment om de zwakke as [mm⁴]
  Wely: number; // elastisch weerstandsmoment, sterke as [mm³]
  Welz: number; // elastisch weerstandsmoment, zwakke as [mm³]
  Wply: number; // plastisch weerstandsmoment, sterke as [mm³]
  Wplz: number; // plastisch weerstandsmoment, zwakke as [mm³]
  iy: number;   // traagheidsstraal, sterke as [mm]
  iz: number;   // traagheidsstraal, zwakke as [mm]
  Avz: number;  // afschuifoppervlak evenwijdig aan het lijf [mm²], zie I_TABEL
  It: number;   // torsieconstante [mm⁴]
  Iw: number;   // welvingsconstante [mm⁶]
}

/** Tabelwaarde maal een macht van tien, zonder drijvendekommaruis (21.24·100 = 2124). */
const maal = (v: number, f: number) => Number((v * f).toPrecision(12));

export const PROFIELEN: Record<number, Profiel> = Object.fromEntries(
  I_TABEL.map(([id, naam, h, b, tw, tf, r, A, Iy, Wely, Wply, iy, Avz, Iz, Welz, Wplz, iz, It, Iw]) => [id, {
    naam, h, b, tw, tf, A: maal(A, 1e2), r,
    Iy: maal(Iy, 1e4), Iz: maal(Iz, 1e4),
    Wely: maal(Wely, 1e3), Welz: maal(Welz, 1e3), Wply: maal(Wply, 1e3), Wplz: maal(Wplz, 1e3),
    iy: maal(iy, 10), iz: maal(iz, 10), Avz: maal(Avz, 1e2),
    It: maal(It, 1e4), Iw: maal(Iw, 1e9),
  }]),
);

export const profiel = (id: number, terugval = 5): Profiel =>
  PROFIELEN[Math.round(id)] ?? PROFIELEN[terugval];

/** Keuzelijst voor een `<select>`, in tabelvolgorde. */
export const profielOpties = (ids?: number[]) =>
  (ids ?? Object.keys(PROFIELEN).map(Number)).map((id) => ({ v: id, label: PROFIELEN[id].naam }));

/**
 * Verhitte omtrek A_m [mm/m'] van een I-profiel, voor de profielfactor A_m/V.
 * `koker` = kokervormig omhuld (rechthoekige omtrek), anders profielvolgend.
 * `zijden` = 4 (alzijdig) of 3 (vloer op de bovenflens).
 */
export function omtrek(p: Profiel, koker: boolean, zijden: 3 | 4): number {
  if (koker) return zijden === 4 ? 2 * (p.h + p.b) : 2 * p.h + p.b;
  return zijden === 4 ? 2 * p.h + 4 * p.b - 2 * p.tw : 2 * p.h + 3 * p.b - 2 * p.tw;
}

// ── Gelijkzijdig hoekstaal ───────────────────────────────────────────────────

/**
 * Eén regel, in de eenheden en de kolomvolgorde van de profieltabel:
 * id, naam | h, t, r_1, r_2 (mm) | A (cm²) | e (cm) | I_y (cm⁴), W_el (cm³),
 * i_y (cm) | I_u (cm⁴), i_u (cm) | I_v (cm⁴), i_v (cm).
 *
 * h = beenlengte, r_1 = afronding in de binnenhoek, r_2 = afronding aan de
 * teen, e = afstand van het zwaartepunt tot de rug van een been. I_y = I_z en
 * W_el,y = W_el,z (om de assen evenwijdig aan de benen), u–u is de sterke en
 * v–v de zwakke hoofdas. I_v volgt de tabel; die ligt voor enkele maten tot
 * 0,4 % onder de exacte uitkomst uit de nominale maten (de veilige kant).
 */
type LRegel = readonly [
  id: number, naam: string,
  h: number, t: number, r1: number, r2: number,
  A: number, e: number, Iy: number, Wel: number, iy: number,
  Iu: number, iu: number, Iv: number, iv: number,
];

/** Dezelfde id's als de keuzelijst in templates/schoorverbinding.ts. */
const L_TABEL: readonly LRegel[] = [
  [1, "L 40x40x4", 40, 4, 6, 3, 3.08, 1.12, 4.47, 1.55, 1.21, 7.09, 1.52, 1.86, 0.78],
  [2, "L 45x45x5", 45, 5, 7, 3.5, 4.30, 1.28, 7.84, 2.43, 1.35, 12.4, 1.70, 3.25, 0.87],
  [3, "L 50x50x5", 50, 5, 7, 3.5, 4.80, 1.40, 11.0, 3.05, 1.51, 17.4, 1.90, 4.54, 0.97],
  [4, "L 60x60x6", 60, 6, 8, 4, 6.91, 1.69, 22.8, 5.29, 1.82, 36.1, 2.29, 9.43, 1.17],
  [5, "L 70x70x7", 70, 7, 9, 4.5, 9.40, 1.97, 42.3, 8.41, 2.12, 67.1, 2.67, 17.5, 1.36],
  [6, "L 80x80x8", 80, 8, 10, 5, 12.3, 2.26, 72.2, 12.6, 2.43, 115, 3.06, 29.9, 1.56],
  [7, "L 90x90x9", 90, 9, 11, 5.5, 15.5, 2.54, 116, 17.9, 2.73, 184, 3.44, 47.8, 1.76],
  [8, "L 100x100x10", 100, 10, 12, 6, 19.2, 2.82, 177, 24.6, 3.04, 280, 3.83, 73.0, 1.95],
];

/** Een gelijkzijdig hoekstaal, alles in mm-eenheden. */
export interface Hoekstaal {
  naam: string;
  h: number;    // beenlengte
  t: number;    // dikte
  r1: number;   // afronding in de binnenhoek
  r2: number;   // afronding aan de teen
  A: number;    // doorsnede-oppervlak [mm²]
  e: number;    // afstand van het zwaartepunt tot de rug van een been [mm]
  Iy: number;   // traagheidsmoment om een as evenwijdig aan een been (= I_z) [mm⁴]
  Wel: number;  // elastisch weerstandsmoment om die as [mm³]
  iy: number;   // traagheidsstraal om die as [mm]
  Iu: number;   // traagheidsmoment om de sterke hoofdas [mm⁴]
  iu: number;   // traagheidsstraal om de sterke hoofdas [mm]
  Iv: number;   // traagheidsmoment om de zwakke hoofdas [mm⁴]
  iv: number;   // traagheidsstraal om de zwakke hoofdas [mm]
}

export const HOEKSTALEN: Record<number, Hoekstaal> = Object.fromEntries(
  L_TABEL.map(([id, naam, h, t, r1, r2, A, e, Iy, Wel, iy, Iu, iu, Iv, iv]) => [id, {
    naam, h, t, r1, r2, A: maal(A, 1e2), e: maal(e, 10),
    Iy: maal(Iy, 1e4), Wel: maal(Wel, 1e3), iy: maal(iy, 10),
    Iu: maal(Iu, 1e4), iu: maal(iu, 10), Iv: maal(Iv, 1e4), iv: maal(iv, 10),
  }]),
);

export const hoekstaal = (id: number, terugval = 3): Hoekstaal =>
  HOEKSTALEN[Math.round(id)] ?? HOEKSTALEN[terugval];

/** Keuzelijst voor een `<select>`, in tabelvolgorde. */
export const hoekstaalOpties = (ids?: number[]) =>
  (ids ?? Object.keys(HOEKSTALEN).map(Number)).map((id) => ({ v: id, label: HOEKSTALEN[id].naam }));

// ── Rekentaal-matrix voor de rekenbladen ───────────────────────────────────────

/** Grootheden van een I-profiel, in de rijvolgorde van profielMatrix() (rij 1 = id). */
export type ProfielGrootheid =
  | "h" | "b" | "tw" | "tf" | "r" | "A"
  | "Iy" | "Wely" | "Wply" | "iy" | "Avz"
  | "Iz" | "Welz" | "Wplz" | "iz"
  | "It" | "Iw";

/** Grootheden van een hoekstaal, in de rijvolgorde van hoekstaalMatrix() (rij 1 = id). */
export type HoekstaalGrootheid =
  | "h" | "t" | "r1" | "r2" | "A" | "e"
  | "Iy" | "Wel" | "iy" | "Iu" | "iu" | "Iv" | "iv";

interface Kolom<G extends string> {
  veld: G;
  /** Standaardnaam van de variabele in het blad. */
  naam: string;
  /** Eenheid van de matrixwaarde in de rekentaal. */
  eenheid: string;
  /** Matrixwaarde = tabelwaarde · factor (alleen I_w: tabel in 10³ cm⁶). */
  factor?: number;
}

/** Rij k + 2 van de matrix = kolom k + 2 van een IRegel. */
const I_KOLOMMEN: readonly Kolom<ProfielGrootheid>[] = [
  { veld: "h", naam: "h", eenheid: "mm" },
  { veld: "b", naam: "b", eenheid: "mm" },
  { veld: "tw", naam: "t_w", eenheid: "mm" },
  { veld: "tf", naam: "t_f", eenheid: "mm" },
  { veld: "r", naam: "r", eenheid: "mm" },
  { veld: "A", naam: "A", eenheid: "cm^2" },
  { veld: "Iy", naam: "I_y", eenheid: "cm^4" },
  { veld: "Wely", naam: "W_el,y", eenheid: "cm^3" },
  { veld: "Wply", naam: "W_pl,y", eenheid: "cm^3" },
  { veld: "iy", naam: "i_y", eenheid: "cm" },
  { veld: "Avz", naam: "A_v,z", eenheid: "cm^2" },
  { veld: "Iz", naam: "I_z", eenheid: "cm^4" },
  { veld: "Welz", naam: "W_el,z", eenheid: "cm^3" },
  { veld: "Wplz", naam: "W_pl,z", eenheid: "cm^3" },
  { veld: "iz", naam: "i_z", eenheid: "cm" },
  { veld: "It", naam: "I_t", eenheid: "cm^4" },
  { veld: "Iw", naam: "I_w", eenheid: "cm^6", factor: 1e3 },
];

/** Rij k + 2 van de matrix = kolom k + 2 van een LRegel. */
const L_KOLOMMEN: readonly Kolom<HoekstaalGrootheid>[] = [
  { veld: "h", naam: "h", eenheid: "mm" },
  { veld: "t", naam: "t", eenheid: "mm" },
  { veld: "r1", naam: "r_1", eenheid: "mm" },
  { veld: "r2", naam: "r_2", eenheid: "mm" },
  { veld: "A", naam: "A", eenheid: "cm^2" },
  { veld: "e", naam: "e", eenheid: "cm" },
  { veld: "Iy", naam: "I_y", eenheid: "cm^4" },
  { veld: "Wel", naam: "W_el", eenheid: "cm^3" },
  { veld: "iy", naam: "i_y", eenheid: "cm" },
  { veld: "Iu", naam: "I_u", eenheid: "cm^4" },
  { veld: "iu", naam: "i_u", eenheid: "cm" },
  { veld: "Iv", naam: "I_v", eenheid: "cm^4" },
  { veld: "iv", naam: "i_v", eenheid: "cm" },
];

/** Kopregel waaraan scripts/check-profielen.mjs een matrix in een blad herkent. */
export const PROFIEL_KOP = "'Profieltabel uit profielen.ts:";
export const HOEKSTAAL_KOP = "'Hoekstaaltabel uit profielen.ts:";

const SUPER: Record<string, string> = { 2: "²", 3: "³", 4: "⁴", 6: "⁶" };
const leesbaar = (eenheid: string) => eenheid.replace(/\^(\d)/g, (_, n: string) => SUPER[n] ?? `^${n}`);

function matrix<G extends string>(
  kop: string, naam: string, regels: readonly (readonly (string | number)[])[],
  kolommen: readonly Kolom<G>[], ids?: readonly number[],
): string {
  const gekozen = ids
    ? ids.map((id) => {
        const regel = regels.find((r) => r[0] === id);
        if (!regel) throw new Error(`profielen.ts: unknown id ${id}`);
        return regel;
      })
    : regels;
  const rijen = [gekozen.map((r) => String(r[0]))];
  kolommen.forEach((k, i) => {
    rijen.push(gekozen.map((r) => String(maal(r[i + 2] as number, k.factor ?? 1))));
  });
  const uitleg = ["id", ...kolommen.map((k) => `${k.naam} (${leesbaar(k.eenheid)})`)].join(" | ");
  return `${kop} ${uitleg}\n${naam} = [${rijen.map((r) => r.join("; ")).join(" |")}]`;
}

function opzoeking<G extends string>(
  kolommen: readonly Kolom<G>[], sleutel: string, matrixnaam: string, namen?: Partial<Record<G, string>>,
): string {
  const regels: string[] = [];
  kolommen.forEach((k, i) => {
    const naam = namen ? namen[k.veld] : k.naam;
    if (naam) regels.push(`${naam} = hlookup(${matrixnaam}; ${sleutel}; 1; ${i + 2})*${k.eenheid}`);
  });
  return regels.join("\n");
}

/**
 * Rekentaal-matrix met de I- en H-profielen: een kopregel (tekst, hoort binnen
 * #hide) en de regel `naam = [...]`. Rij 1 bevat het id, de overige rijen de
 * grootheden in de volgorde van ProfielGrootheid en in de eenheden van de
 * profieltabel: h, b, t_w, t_f, r in mm; A en A_v,z in cm²; I_y, I_z, I_t in
 * cm⁴; W in cm³; i in cm; I_w in cm⁶.
 *
 * `ids` beperkt de matrix tot die profielen, in die volgorde.
 *
 * Gebruik in een blad: plak de uitvoer binnen #hide … #show, gevolgd door
 * profielOpzoeking(). Een blad kan hem ook met `${profielMatrix()}` in de
 * template-string opnemen, maar de controlescripts lezen de templates als ruwe
 * tekst en zien dan geen matrix. Een geplakte matrix bewaakt
 * scripts/check-profielen.mjs; afdrukken met
 *   node scripts/check-profielen.mjs --matrix [id,id,…]
 */
export function profielMatrix(opties: { naam?: string; ids?: readonly number[] } = {}): string {
  return matrix(PROFIEL_KOP, opties.naam ?? "profielen", I_TABEL, I_KOLOMMEN, opties.ids);
}

/**
 * De hlookup-regels die de grootheden van het gekozen profiel met eenheid uit
 * de matrix halen, bijvoorbeeld `I_y = hlookup(profielen; profiel; 1; 8)*cm^4`.
 *
 * `sleutel`  de @select-variabele met het profiel-id (`profiel`, `kolomprofiel`)
 * `namen`    eigen variabelenamen, bijvoorbeeld { h: "h_c", tf: "t_fc" }. Alleen
 *            de genoemde grootheden krijgen dan een regel. Zonder `namen` komen
 *            alle grootheden erin, met de standaardnamen h, b, t_w, t_f, r, A,
 *            I_y, W_el,y, W_pl,y, i_y, A_v,z, I_z, W_el,z, W_pl,z, i_z, I_t, I_w.
 * `matrix`   naam van de matrix, standaard "profielen".
 */
export function profielOpzoeking(
  sleutel: string,
  opties: { namen?: Partial<Record<ProfielGrootheid, string>>; matrix?: string } = {},
): string {
  return opzoeking(I_KOLOMMEN, sleutel, opties.matrix ?? "profielen", opties.namen);
}

/**
 * Als profielMatrix(), voor het gelijkzijdig hoekstaal. Rijen na het id: h, t,
 * r_1, r_2 (mm), A (cm²), e (cm), I_y (cm⁴), W_el (cm³), i_y (cm), I_u (cm⁴),
 * i_u (cm), I_v (cm⁴), i_v (cm). Afdrukken met
 *   node scripts/check-profielen.mjs --hoekmatrix [id,id,…]
 */
export function hoekstaalMatrix(opties: { naam?: string; ids?: readonly number[] } = {}): string {
  return matrix(HOEKSTAAL_KOP, opties.naam ?? "hoekstalen", L_TABEL, L_KOLOMMEN, opties.ids);
}

/**
 * Als profielOpzoeking(), voor het hoekstaal. Standaardnamen: h, t, r_1, r_2,
 * A, e, I_y, W_el, i_y, I_u, i_u, I_v, i_v; matrix standaard "hoekstalen".
 */
export function hoekstaalOpzoeking(
  sleutel: string,
  opties: { namen?: Partial<Record<HoekstaalGrootheid, string>>; matrix?: string } = {},
): string {
  return opzoeking(L_KOLOMMEN, sleutel, opties.matrix ?? "hoekstalen", opties.namen);
}
