import { doorsnedeGrootheden, doorsnedeStatisch } from "@ifc-calc/core";
import { PROFIELEN } from "./profielen.ts";

/*
 * Eén vastgelegde doorsnede uit de invoer van het blad Spanningen in een doorsnede: de
 * maten, de omtrek om op schaal te tekenen en de tabel met delen voor de rekenkern. Het
 * beeld, de afdruk en de download tekenen hieruit (doorsnedeTekening.ts).
 *
 * Hier staan geen rekenregels voor de spanningen: die komen uit het blad. De tabel met
 * delen is dezelfde als in het blad (templates/doorsnede-spanningen.ts) en gaat door
 * dezelfde functies van de rekenkern; dat ze gelijk zijn, bewaakt scripts/check-doorsnede.mjs.
 *
 * Alle maten in mm. y loopt naar rechts en z omlaag, de oorsprong ligt in het zwaartepunt,
 * zoals in het blad. De rekenkern telt z omhoog: de tabel met delen staat in die assen.
 */

export const VORM = { I: 1, RECHTHOEK: 2, ROND: 3, BUIS: 4, KOKER: 5, T: 6, U: 7 } as const;

/** Een invoerwaarde van het blad; het beeld geeft zijn eigen `d()` mee. */
export type Lees = (naam: string) => number;

/** Een punt [y, z]. */
export type Punt = [number, number];

export interface DoorsnedeDefinitie {
  vorm: number;
  /** De maten geven een doorsnede. Is dit niet zo, dan is de rest leeg. */
  geldig: boolean;
  /** De naam van het profiel als het uit de lijst komt; met eigen maten null. */
  profiel: string | null;
  /** Omhullende: breedte in y en hoogte in z. */
  B: number;
  H: number;
  /** Per deel een rij [soort, p1, p2, p3, p4, p5, y, z, n, draai], als in core/doorsnede.ts. */
  delen: number[][];
  A: number;
  /** Zwaartepunt: vanaf de linkerrand en vanaf de bovenrand, zoals `y_c` en `z_c` in het blad. */
  yc: number;
  zc: number;
  Iy: number;
  Iz: number;
  /** Het zwaartepunt in de assen van de rekenkern. */
  yKern: number;
  zKern: number;
  /** De omtrek vanaf het zwaartepunt: de buitenrand en eventueel de binnenrand. */
  omtrek: Punt[][];
  /**
   * Een bolle vorm om de doorsnede en wat daarbinnen leeg is. Het veld kleurt de bolle vorm en de
   * holtes gaan er wit overheen: knippen in een holle omtrek laat haarlijnen langs de knip staan.
   */
  omhulling: Punt[];
  holtes: Punt[][];
  /** Waar σ zijn uiterste waarde kan hebben: de hoekpunten, of de cirkel. */
  hoekpunten: Punt[];
  /** Waar de breedte springt of steil loopt, vanaf het zwaartepunt. */
  knipZ: number[];
  knipY: number[];
  /** De dwarskrachten uit de invoer, voor het teken van het diagram. */
  Vy: number;
  Vz: number;
}

/** Boog om (cy, cz) van hoek a0 naar a1, zonder beginpunt. */
function boog(cy: number, cz: number, straal: number, a0: number, a1: number, stukken = 8): Punt[] {
  return Array.from({ length: stukken }, (_, k) => {
    const a = a0 + ((a1 - a0) * (k + 1)) / stukken;
    return [cy + straal * Math.cos(a), cz + straal * Math.sin(a)] as Punt;
  });
}

const cirkel = (straal: number, stukken: number): Punt[] =>
  Array.from({ length: stukken }, (_, k) => {
    const a = (2 * Math.PI * k) / stukken;
    return [straal * Math.cos(a), straal * Math.sin(a)] as Punt;
  });

const π = Math.PI;

/** De holte rechts van het lijf van een I, tussen de flenzen, met de afrondingen; z omlaag. */
function holteI(H: number, B: number, tw: number, tf: number, r: number): Punt[] {
  const [h, b, t] = [H / 2, B / 2, tw / 2];
  const hoek = (cy: number, cz: number, a0: number, a1: number) => (r > 0 ? boog(cy, cz, r, a0, a1) : []);
  return [
    [b, -h + tf], [t + r, -h + tf],
    ...hoek(t + r, -h + tf + r, -π / 2, -π),
    [t, h - tf - r],
    ...hoek(t + r, h - tf - r, π, π / 2),
    [b, h - tf],
  ];
}

const gespiegeld = (l: Punt[]): Punt[] => l.map(([y, z]) => [-y, z] as Punt).reverse();
const rechthoek = (b: number, h: number): Punt[] => [[-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, h / 2], [-b / 2, h / 2]];

const LEEG = (vorm: number, profiel: string | null): DoorsnedeDefinitie => ({
  vorm, geldig: false, profiel, B: 0, H: 0, delen: [], A: 0, yc: 0, zc: 0, Iy: 0, Iz: 0, yKern: 0, zKern: 0,
  omtrek: [], omhulling: [], holtes: [], hoekpunten: [], knipZ: [], knipY: [], Vy: 0, Vz: 0,
});

/**
 * De doorsnede uit de invoer van het blad. Wat niet past, is ongeldig: het blad meldt dat,
 * en de tekening tekent dan niets.
 */
export function maakDoorsnede(d: Lees): DoorsnedeDefinitie {
  const vorm = Math.round(d("vorm")) || VORM.I;
  const id = Math.round(d("profiel"));
  const p = vorm === VORM.I && id > 0 ? PROFIELEN[id] : undefined;
  const h = p ? p.h : d("h");
  const b = p ? p.b : d("b");
  const tw = p ? p.tw : d("t_w");
  const tf = p ? p.tf : d("t_f");
  const r = p ? p.r : d("r");
  const D = d("D");
  const t = d("t");
  const profiel = p ? p.naam : null;

  let delen: number[][] = [];
  let omtrek: Punt[][] = [];
  let omhulling: Punt[] = rechthoek(b, h);
  let holtes: Punt[][] = [];
  let hoekpunten: Punt[] | null = null;
  let knipZ: number[] = [];
  let knipY: number[] = [];
  let [B, H] = [b, h];
  let geldig = false;

  if (vorm === VORM.I) {
    geldig = h > 0 && b > 0 && tw > 0 && tf > 0 && r >= 0 && 2 * tf < h && tw < b && 2 * r <= b - tw && 2 * r <= h - 2 * tf;
    delen = [[3, h, b, tw, tf, r, 0, 0, 1, 0]];
    if (geldig) {
      const holte = holteI(h, b, tw, tf, r);
      holtes = [holte, gespiegeld(holte)];
      omtrek = [[[-b / 2, -h / 2], [b / 2, -h / 2], ...holte, [b / 2, h / 2], [-b / 2, h / 2], ...gespiegeld(holte)]];
    }
    knipZ = [-h / 2, -h / 2 + tf, -h / 2 + tf + r, h / 2 - tf - r, h / 2 - tf, h / 2];
    knipY = [-b / 2, -tw / 2 - r, -tw / 2, tw / 2, tw / 2 + r, b / 2];
  } else if (vorm === VORM.RECHTHOEK) {
    geldig = b > 0 && h > 0;
    delen = [[1, b, h, 0, 0, 0, 0, 0, 1, 0]];
    omtrek = [rechthoek(b, h)];
    knipZ = [-h / 2, h / 2];
    knipY = [-b / 2, b / 2];
  } else if (vorm === VORM.ROND || vorm === VORM.BUIS) {
    const buis = vorm === VORM.BUIS;
    geldig = D > 0 && (!buis || (t > 0 && 2 * t < D));
    [B, H] = [D, D];
    delen = [[2, D, buis ? t : 0, 0, 0, 0, 0, 0, 1, 0]];
    if (geldig) {
      omhulling = cirkel(D / 2, 96);
      omtrek = [omhulling];
      if (buis) {
        holtes = [cirkel(D / 2 - t, 96).reverse()];
        omtrek.push(holtes[0]);
      }
      hoekpunten = cirkel(D / 2, 360);
    }
    knipZ = buis ? [-D / 2, -D / 2 + t, D / 2 - t, D / 2] : [-D / 2, D / 2];
    knipY = knipZ;
  } else if (vorm === VORM.KOKER) {
    geldig = b > 0 && h > 0 && tw > 0 && tf > 0 && 2 * tw < b && 2 * tf < h;
    delen = [[1, b, h, 0, 0, 0, 0, 0, 1, 0], [1, b - 2 * tw, h - 2 * tf, 0, 0, 0, 0, 0, -1, 0]];
    const [bi, hi] = [b / 2 - tw, h / 2 - tf];
    holtes = [[[-bi, -hi], [-bi, hi], [bi, hi], [bi, -hi]]];
    omtrek = [rechthoek(b, h), holtes[0]];
    hoekpunten = omtrek[0];
    knipZ = [-h / 2, -hi, hi, h / 2];
    knipY = [-b / 2, -bi, bi, b / 2];
  } else if (vorm === VORM.T) {
    geldig = b > 0 && h > 0 && tw > 0 && tf > 0 && tw < b && tf < h;
    delen = [[1, b, tf, 0, 0, 0, 0, (h - tf) / 2, 1, 0], [1, tw, h - tf, 0, 0, 0, 0, -tf / 2, 1, 0]];
    const holte: Punt[] = [[b / 2, -h / 2 + tf], [tw / 2, -h / 2 + tf], [tw / 2, h / 2], [b / 2, h / 2]];
    holtes = [holte, gespiegeld(holte)];
    omtrek = [[
      [-b / 2, -h / 2], [b / 2, -h / 2], [b / 2, -h / 2 + tf], [tw / 2, -h / 2 + tf],
      [tw / 2, h / 2], [-tw / 2, h / 2], [-tw / 2, -h / 2 + tf], [-b / 2, -h / 2 + tf],
    ]];
    knipZ = [-h / 2, -h / 2 + tf, h / 2];
    knipY = [-b / 2, -tw / 2, tw / 2, b / 2];
  } else {
    geldig = b > 0 && h > 0 && tw > 0 && tf > 0 && tw < b && 2 * tf < h;
    delen = [
      [1, tw, h, 0, 0, 0, (tw - b) / 2, 0, 1, 0],
      [1, b - tw, tf, 0, 0, 0, tw / 2, (h - tf) / 2, 1, 0],
      [1, b - tw, tf, 0, 0, 0, tw / 2, (tf - h) / 2, 1, 0],
    ];
    const [y0, y1] = [-b / 2, -b / 2 + tw];
    const holte: Punt[] = [[b / 2, -h / 2 + tf], [y1, -h / 2 + tf], [y1, h / 2 - tf], [b / 2, h / 2 - tf]];
    holtes = [holte];
    omtrek = [[[y0, -h / 2], [b / 2, -h / 2], ...holte, [b / 2, h / 2], [y0, h / 2]]];
    knipZ = [-h / 2, -h / 2 + tf, h / 2 - tf, h / 2];
    knipY = [y0, y1, b / 2];
  }
  if (!geldig) return LEEG(vorm, profiel);

  const [A, yKern, zKern, Iy, Iz, , ymin, , , zmax] = doorsnedeGrootheden(delen);
  const yc = yKern - ymin;
  const zc = zmax - zKern;
  // Van het midden van de omhullende naar het zwaartepunt.
  const dy = yc - B / 2;
  const dz = zc - H / 2;
  const opZwaartepunt = (q: Punt): Punt => [q[0] - dy, q[1] - dz];
  const vanafZ = omtrek.map((l) => l.map(opZwaartepunt));
  return {
    vorm, geldig, profiel, B, H, delen, A, yc, zc, Iy, Iz, yKern, zKern,
    omtrek: vanafZ,
    omhulling: omhulling.map(opZwaartepunt),
    holtes: holtes.map((l) => l.map(opZwaartepunt)),
    hoekpunten: hoekpunten ? hoekpunten.map(opZwaartepunt) : vanafZ[0],
    knipZ: knipZ.map((k) => k - dz),
    knipY: knipY.map((k) => k - dy),
    Vy: d("V_y"),
    Vz: d("V_z"),
  };
}

/**
 * S/b langs de as `as`: de vorm van de schuifspanning uit de dwarskracht in die richting,
 * per koorde, zonder de kracht en zonder I. Op de plaatsen s vanaf het zwaartepunt, oplopend.
 * Op een sprong in de breedte staan twee punten vlak naast elkaar. Het blad geeft de piek:
 * τ(s) = τ_max · q(s) / q_max.
 */
export function schuifLijn(def: DoorsnedeDefinitie, as: "z" | "y", n = 240): { s: number; q: number }[] {
  if (!def.geldig) return [];
  const [lo, hi] = as === "z" ? [-def.zc, def.H - def.zc] : [-def.yc, def.B - def.yc];
  const L = hi - lo;
  const knip = as === "z" ? def.knipZ : def.knipY;
  const δ = 1e-6 * L;
  const plekken = new Set<number>();
  for (let i = 1; i < n; i++) plekken.add(lo + (L * i) / n);
  // Dicht bij elke knik: een cirkel of afronding loopt daar steil.
  for (const k of knip) {
    for (const f of [δ, L / 1000, L / 400, L / 200, L / 100]) {
      for (const w of [k - f, k + f]) if (w > lo && w < hi) plekken.add(w);
    }
  }
  const lijst = [lo, ...[...plekken].sort((a, c) => a - c), hi];
  return lijst.map((s) => {
    const lijn = as === "z" ? def.zKern - s : def.yKern + s;
    const [S, b] = doorsnedeStatisch(def.delen, as === "z" ? 1 : 2, lijn);
    return { s, q: b > 0 ? S / b : 0 };
  });
}
