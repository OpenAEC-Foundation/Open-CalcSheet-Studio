/**
 * De waarden die over de verbindingen van een graaf lopen: getallen en grootheden
 * van de rekenkern (mathjs), tekst, lijsten en geometrie.
 *
 * Alle maten van geometrie staan in millimeter, de eenheid van de scène.
 */
import { uitkomstTekst } from "@ifc-calc/core";

export type Punt = [number, number, number];

export type Geometrie =
  | { geometrie: "punt"; p: Punt }
  | { geometrie: "lijn"; van: Punt; naar: Punt }
  | { geometrie: "balk"; van: Punt; naar: Punt; b: number; h: number }
  | { geometrie: "doos"; hoek: Punt; maat: Punt };

/** Een waarde: getal, grootheid (object van de rekenkern), tekst, waar/onwaar, lijst of geometrie. */
export type Waarde = unknown;

export const isLijst = (w: Waarde): w is Waarde[] => Array.isArray(w);

export function isGeometrie(w: Waarde): w is Geometrie {
  return !!w && typeof w === "object" && typeof (w as { geometrie?: unknown }).geometrie === "string";
}

export function isGrootheid(w: Waarde): w is { isUnit: true; toNumber: (eenheid: string) => number } {
  return !!w && typeof w === "object" && (w as { isUnit?: unknown }).isUnit === true;
}

/** De soort van een waarde, voor de kleur van een poort en een verbinding. */
export type WaardeSoort = "grootheid" | "lijst" | "geometrie" | "tekst" | "waarOnwaar";

export function waardeSoort(w: Waarde): WaardeSoort | null {
  if (w === undefined || w === null) return null;
  if (isLijst(w)) return "lijst";
  if (isGeometrie(w)) return "geometrie";
  if (typeof w === "string") return "tekst";
  if (typeof w === "boolean") return "waarOnwaar";
  if (typeof w === "number" || isGrootheid(w)) return "grootheid";
  return null;
}

/** Een vector of matrix uit de rekenkern wordt een gewone lijst, ook genest. */
export function alsLijstWaarde(w: Waarde): Waarde {
  if (Array.isArray(w)) return w.map(alsLijstWaarde);
  if (w && typeof w === "object" && typeof (w as { toArray?: unknown }).toArray === "function" && !isGrootheid(w)) {
    return alsLijstWaarde((w as { toArray: () => unknown[] }).toArray());
  }
  return w;
}

const mm = (n: number) => String(Math.round(n * 100) / 100);
const puntTekst = (p: Punt) => `${mm(p[0])}; ${mm(p[1])}; ${mm(p[2])}`;

export function afstand(a: Punt, b: Punt): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** Geometrie in één regel. De woorden blijven internationaal leesbaar; de maten in mm. */
export function geometrieTekst(g: Geometrie): string {
  switch (g.geometrie) {
    case "punt":
      return `(${puntTekst(g.p)}) mm`;
    case "lijn":
      return `L = ${mm(afstand(g.van, g.naar))} mm`;
    case "balk":
      return `L = ${mm(afstand(g.van, g.naar))} mm · ${mm(g.b)} × ${mm(g.h)} mm`;
    case "doos":
      return `${mm(g.maat[0])} × ${mm(g.maat[1])} × ${mm(g.maat[2])} mm`;
  }
}

/** Een waarde in één regel: `4.5 m`, `[1; 2; 3]`. Een lange lijst wordt ingekort. */
export function waardeTekst(w: Waarde, maxElementen = 40): string {
  if (w === undefined) return "—";
  if (isLijst(w)) {
    const delen = w.slice(0, maxElementen).map((e) => waardeTekst(e, maxElementen));
    if (w.length > maxElementen) delen.push(`… (${w.length})`);
    return `[${delen.join("; ")}]`;
  }
  if (isGeometrie(w)) return geometrieTekst(w);
  if (typeof w === "string") return w;
  return uitkomstTekst(w);
}

/** Alle geometrie uit een waarde, ook uit geneste lijsten. */
export function geometrieUit(w: Waarde, uit: Geometrie[] = []): Geometrie[] {
  if (isLijst(w)) for (const e of w) geometrieUit(e, uit);
  else if (isGeometrie(w)) uit.push(w);
  return uit;
}
