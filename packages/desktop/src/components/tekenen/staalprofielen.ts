/**
 * Staalprofielen en houtmaten voor de tekening: doorsneden op ware grootte.
 *
 * Eén bron. De profielen die de rekenbladen kennen, komen met hun maten
 * (h, b, t_w, t_f, r) uit components/calc/profielen.ts. AANVULLING hieronder
 * heeft alleen wat daar niet in staat: de grotere en kleinere I- en
 * H-profielen, HEM, UNP, kokers en de overige hoeklijnen. Een profiel staat in
 * de ene of in de andere lijst, nooit in beide; scripts/check-tekenen-symbolen.mjs
 * bewaakt dat, en rekent de aanvulling na met een steekproef van
 * tabeloppervlakken.
 *
 * Maten in mm, nominaal volgens EN 10365 (I, H, U), EN 10219 (kokers) en
 * EN 10056-1 (hoeklijnen). UNP tekent met evenwijdige flenzen. Een rechthoekige
 * koker heet naar EN 10219 hoogte × breedte × wanddikte.
 *
 * Geen imports buiten profielen.ts: het controlescript laadt dit in Node.
 */
import { HOEKSTALEN, PROFIELEN } from "../calc/profielen.ts";

/** Hoe de doorsnede getekend wordt; bepaalt ook welke maten hij heeft. */
export type ProfielVorm = "i" | "u" | "koker" | "hoek";

/** De maten per vorm, in de volgorde van het paneel. */
export const MATEN_VAN: Record<ProfielVorm, readonly string[]> = {
  i: ["h", "b", "tw", "tf", "r"],
  u: ["h", "b", "tw", "tf", "r"],
  koker: ["h", "b", "t"],
  hoek: ["h", "b", "t", "r"],
};

/** Alle maten die een profiel kan hebben. */
export const ALLE_PROFIELMATEN = ["h", "b", "tw", "tf", "r", "t"] as const;

export interface ProfielRij {
  naam: string;
  maten: Record<string, number>;
  /** Uit profielen.ts (de rekenbladen) of uit de aanvulling hier. */
  bron: "profielen" | "aanvulling";
}

export interface Familie {
  id: string;
  vorm: ProfielVorm;
  standaard: string;
  rijen: ProfielRij[];
}

// ── Aanvulling: alleen wat niet in profielen.ts staat ───────────────────────

/** [naam, h, b, t_w, t_f, r] */
type IRegel = readonly [string, number, number, number, number, number];
/** [naam, h, b, t] */
type KRegel = readonly [string, number, number, number];
/** [naam, h, b, t, r] */
type LRegel = readonly [string, number, number, number, number];

const AANVULLING_I: Record<"HEA" | "HEB" | "HEM" | "IPE", readonly IRegel[]> = {
  HEA: [
    ["HEA 280", 270, 280, 8, 13, 24],
    ["HEA 320", 310, 300, 9, 15.5, 27],
    ["HEA 340", 330, 300, 9.5, 16.5, 27],
    ["HEA 360", 350, 300, 10, 17.5, 27],
    ["HEA 400", 390, 300, 11, 19, 27],
    ["HEA 450", 440, 300, 11.5, 21, 27],
    ["HEA 500", 490, 300, 12, 23, 27],
    ["HEA 550", 540, 300, 12.5, 24, 27],
    ["HEA 600", 590, 300, 13, 25, 27],
    ["HEA 650", 640, 300, 13.5, 26, 27],
    ["HEA 700", 690, 300, 14.5, 27, 27],
    ["HEA 800", 790, 300, 15, 28, 30],
    ["HEA 900", 890, 300, 16, 30, 30],
    ["HEA 1000", 990, 300, 16.5, 31, 30],
  ],
  HEB: [
    ["HEB 280", 280, 280, 10.5, 18, 24],
    ["HEB 320", 320, 300, 11.5, 20.5, 27],
    ["HEB 340", 340, 300, 12, 21.5, 27],
    ["HEB 360", 360, 300, 12.5, 22.5, 27],
    ["HEB 400", 400, 300, 13.5, 24, 27],
    ["HEB 450", 450, 300, 14, 26, 27],
    ["HEB 500", 500, 300, 14.5, 28, 27],
    ["HEB 550", 550, 300, 15, 29, 27],
    ["HEB 600", 600, 300, 15.5, 30, 27],
    ["HEB 650", 650, 300, 16, 31, 27],
    ["HEB 700", 700, 300, 17, 32, 27],
    ["HEB 800", 800, 300, 17.5, 33, 30],
    ["HEB 900", 900, 300, 18.5, 35, 30],
    ["HEB 1000", 1000, 300, 19, 36, 30],
  ],
  HEM: [
    ["HEM 100", 120, 106, 12, 20, 12],
    ["HEM 120", 140, 126, 12.5, 21, 12],
    ["HEM 140", 160, 146, 13, 22, 12],
    ["HEM 160", 180, 166, 14, 23, 15],
    ["HEM 180", 200, 186, 14.5, 24, 15],
    ["HEM 200", 220, 206, 15, 25, 18],
    ["HEM 220", 240, 226, 15.5, 26, 18],
    ["HEM 240", 270, 248, 18, 32, 21],
    ["HEM 260", 290, 268, 18, 32.5, 24],
    ["HEM 280", 310, 288, 18.5, 33, 24],
    ["HEM 300", 340, 310, 21, 39, 27],
    ["HEM 320", 359, 309, 21, 40, 27],
    ["HEM 340", 377, 309, 21, 40, 27],
    ["HEM 360", 395, 308, 21, 40, 27],
    ["HEM 400", 432, 307, 21, 40, 27],
    ["HEM 450", 478, 307, 21, 40, 27],
    ["HEM 500", 524, 306, 21, 40, 27],
    ["HEM 550", 572, 306, 21, 40, 27],
    ["HEM 600", 620, 305, 21, 40, 27],
    ["HEM 650", 668, 305, 21, 40, 27],
    ["HEM 700", 716, 304, 21, 40, 27],
    ["HEM 800", 814, 303, 21, 40, 30],
    ["HEM 900", 910, 302, 21, 40, 30],
    ["HEM 1000", 1008, 302, 21, 40, 30],
  ],
  IPE: [
    ["IPE 80", 80, 46, 3.8, 5.2, 5],
    ["IPE 100", 100, 55, 4.1, 5.7, 7],
    ["IPE 120", 120, 64, 4.4, 6.3, 7],
    ["IPE 140", 140, 73, 4.7, 6.9, 7],
    ["IPE 160", 160, 82, 5, 7.4, 9],
    ["IPE 180", 180, 91, 5.3, 8, 9],
    ["IPE 220", 220, 110, 5.9, 9.2, 12],
    ["IPE 450", 450, 190, 9.4, 14.6, 21],
    ["IPE 500", 500, 200, 10.2, 16, 21],
    ["IPE 550", 550, 210, 11.1, 17.2, 24],
    ["IPE 600", 600, 220, 12, 19, 24],
  ],
};

/** U-profielen, getekend met evenwijdige flenzen. */
const AANVULLING_UNP: readonly IRegel[] = [
  ["UNP 80", 80, 45, 6, 8, 8],
  ["UNP 100", 100, 50, 6, 8.5, 8.5],
  ["UNP 120", 120, 55, 7, 9, 9],
  ["UNP 140", 140, 60, 7, 10, 10],
  ["UNP 160", 160, 65, 7.5, 10.5, 10.5],
  ["UNP 180", 180, 70, 8, 11, 11],
  ["UNP 200", 200, 75, 8.5, 11.5, 11.5],
  ["UNP 220", 220, 80, 9, 12.5, 12.5],
  ["UNP 240", 240, 85, 9.5, 13, 13],
  ["UNP 260", 260, 90, 10, 14, 14],
  ["UNP 280", 280, 95, 10, 15, 15],
  ["UNP 300", 300, 100, 10, 16, 16],
  ["UNP 320", 320, 100, 14, 17.5, 17.5],
  ["UNP 350", 350, 100, 14, 16, 16],
  ["UNP 380", 380, 102, 13.5, 16, 16],
  ["UNP 400", 400, 110, 14, 18, 18],
];

/** Kokers: vierkant als K b/t, rechthoekig als Koker h x b x t. */
const AANVULLING_KOKER: readonly KRegel[] = [
  ["K40/3", 40, 40, 3],
  ["K50/3", 50, 50, 3],
  ["K60/4", 60, 60, 4],
  ["K70/4", 70, 70, 4],
  ["K80/4", 80, 80, 4],
  ["K90/5", 90, 90, 5],
  ["K100/5", 100, 100, 5],
  ["K120/6", 120, 120, 6],
  ["K140/6", 140, 140, 6],
  ["K150/8", 150, 150, 8],
  ["K160/8", 160, 160, 8],
  ["K180/8", 180, 180, 8],
  ["K200/10", 200, 200, 10],
  ["K250/10", 250, 250, 10],
  ["K300/12.5", 300, 300, 12.5],
  ["Koker 50x30x3", 50, 30, 3],
  ["Koker 60x40x4", 60, 40, 4],
  ["Koker 80x40x4", 80, 40, 4],
  ["Koker 80x60x4", 80, 60, 4],
  ["Koker 100x50x5", 100, 50, 5],
  ["Koker 100x60x5", 100, 60, 5],
  ["Koker 120x60x5", 120, 60, 5],
  ["Koker 120x80x6", 120, 80, 6],
  ["Koker 150x100x8", 150, 100, 8],
  ["Koker 160x80x8", 160, 80, 8],
  ["Koker 180x100x8", 180, 100, 8],
  ["Koker 200x100x10", 200, 100, 10],
  ["Koker 250x150x10", 250, 150, 10],
  ["Koker 300x200x12.5", 300, 200, 12.5],
];

/** Hoeklijnen die niet in profielen.ts staan; h = staande poot, b = liggende poot, r = binnenradius. */
const AANVULLING_HOEK: readonly LRegel[] = [
  ["L 45x45x4.5", 45, 45, 4.5, 7],
  ["L 75x75x8", 75, 75, 8, 9],
  ["L 110x110x10", 110, 110, 10, 12],
  ["L 120x120x12", 120, 120, 12, 13],
  ["L 130x130x12", 130, 130, 12, 14],
  ["L 150x150x15", 150, 150, 15, 16],
  ["L 160x160x15", 160, 160, 15, 17],
  ["L 180x180x18", 180, 180, 18, 18],
  ["L 200x200x20", 200, 200, 20, 18],
  ["L 100x50x6", 100, 50, 6, 8],
  ["L 100x65x7", 100, 65, 7, 10],
  ["L 100x75x8", 100, 75, 8, 10],
  ["L 110x70x8", 110, 70, 8, 10],
  ["L 120x80x10", 120, 80, 10, 11],
  ["L 125x75x8", 125, 75, 8, 11],
  ["L 135x65x8", 135, 65, 8, 11],
  ["L 150x75x10", 150, 75, 10, 11],
  ["L 150x90x10", 150, 90, 10, 12],
  ["L 150x100x12", 150, 100, 12, 12],
  ["L 150x110x10", 150, 110, 10, 12],
  ["L 200x100x10", 200, 100, 10, 15],
  ["L 200x110x12", 200, 110, 12, 15],
  ["L 200x150x12", 200, 150, 12, 15],
];

/** De aanvulling, per familie, voor het controlescript. */
export function aanvullingNamen(): string[] {
  return [
    ...Object.values(AANVULLING_I).flatMap((l) => l.map((r) => r[0])),
    ...AANVULLING_UNP.map((r) => r[0]),
    ...AANVULLING_KOKER.map((r) => r[0]),
    ...AANVULLING_HOEK.map((r) => r[0]),
  ];
}

// ── De families ──────────────────────────────────────────────────────────────

const iRij = ([naam, h, b, tw, tf, r]: IRegel): ProfielRij => ({ naam, maten: { h, b, tw, tf, r }, bron: "aanvulling" });

/** Het getal in een naam als HEA 200, voor de volgorde. */
const nummer = (naam: string) => Number(/\d+/.exec(naam)?.[0] ?? 0);

function iFamilie(id: "HEA" | "HEB" | "HEM" | "IPE"): ProfielRij[] {
  const uitTabel: ProfielRij[] = Object.values(PROFIELEN)
    .filter((p) => p.naam.startsWith(`${id} `))
    .map((p) => ({ naam: p.naam, maten: { h: p.h, b: p.b, tw: p.tw, tf: p.tf, r: p.r }, bron: "profielen" }));
  return [...uitTabel, ...AANVULLING_I[id].map(iRij)].sort((a, b) => nummer(a.naam) - nummer(b.naam));
}

function hoekFamilie(): ProfielRij[] {
  const uitTabel: ProfielRij[] = Object.values(HOEKSTALEN).map((l) => ({
    naam: l.naam,
    maten: { h: l.h, b: l.h, t: l.t, r: l.r1 },
    bron: "profielen",
  }));
  const aanvulling: ProfielRij[] = AANVULLING_HOEK.map(([naam, h, b, t, r]) => ({ naam, maten: { h, b, t, r }, bron: "aanvulling" }));
  // Gelijkzijdig eerst, dan ongelijkzijdig; elk op beenlengte en dikte.
  const sleutel = (r: ProfielRij) => [r.maten.h === r.maten.b ? 0 : 1, r.maten.h, r.maten.b, r.maten.t];
  return [...uitTabel, ...aanvulling].sort((a, b) => {
    const x = sleutel(a), y = sleutel(b);
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  });
}

export const FAMILIES: readonly Familie[] = [
  { id: "HEA", vorm: "i", standaard: "HEA 200", rijen: iFamilie("HEA") },
  { id: "HEB", vorm: "i", standaard: "HEB 200", rijen: iFamilie("HEB") },
  { id: "HEM", vorm: "i", standaard: "HEM 200", rijen: iFamilie("HEM") },
  { id: "IPE", vorm: "i", standaard: "IPE 200", rijen: iFamilie("IPE") },
  { id: "UNP", vorm: "u", standaard: "UNP 200", rijen: AANVULLING_UNP.map(iRij) },
  {
    id: "koker",
    vorm: "koker",
    standaard: "K100/5",
    rijen: AANVULLING_KOKER.map(([naam, h, b, t]) => ({ naam, maten: { h, b, t }, bron: "aanvulling" as const })),
  },
  { id: "hoek", vorm: "hoek", standaard: "L 100x100x10", rijen: hoekFamilie() },
];

export const familie = (id: string | undefined): Familie => FAMILIES.find((f) => f.id === id) ?? FAMILIES[1];

export const profielRij = (f: Familie, naam: string | undefined): ProfielRij | undefined => f.rijen.find((r) => r.naam === naam);

/** De maat van een familie waarvan de hoogte het dichtst bij `h` ligt; bij gelijke afstand de kleinere. */
export function dichtsteMaat(f: Familie, h: number): string {
  if (!Number.isFinite(h) || h <= 0) return f.standaard;
  let beste = f.standaard;
  let afstand = Infinity;
  for (const r of f.rijen) {
    const d = Math.abs(r.maten.h - h);
    if (d < afstand) {
      beste = r.naam;
      afstand = d;
    }
  }
  return beste;
}

/**
 * Wanddikte naar buitenradius van een koudgevormde koker, EN 10219-2:
 * 2t tot 6 mm, 2,5t tot 10 mm, daarboven 3t. De binnenradius is r_o − t.
 */
export function kokerRadiusFactor(t: number): number {
  return t <= 6 ? 2 : t <= 10 ? 2.5 : 3;
}

// ── Hout ─────────────────────────────────────────────────────────────────────

/** Gangbare houtdoorsneden, breedte × hoogte in mm. */
export const HOUTMATEN: readonly string[] = [
  "22 x 45", "22 x 70", "32 x 50", "38 x 89", "44 x 44", "45 x 45",
  "45 x 70", "45 x 95", "45 x 120", "45 x 145", "45 x 170", "45 x 195",
  "45 x 220", "50 x 100", "50 x 150", "63 x 160", "63 x 180", "71 x 171",
  "71 x 196", "75 x 200", "75 x 225",
];

export function leesHoutmaat(s: string | undefined): { b: number; h: number } | null {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*$/i.exec(s ?? "");
  if (!m) return null;
  return { b: Number(m[1].replace(",", ".")), h: Number(m[2].replace(",", ".")) };
}

// ── Tekenschaal ──────────────────────────────────────────────────────────────

/** Beeldpunten per millimeter op papier: een CSS-pixel is 1/96 inch. */
export const PX_PER_MM = 96 / 25.4;

/** De tekenschalen in het lint (1 : n). */
export const SCHALEN: readonly number[] = [1, 2, 5, 10, 20, 25, 50];
