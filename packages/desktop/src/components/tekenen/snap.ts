/**
 * Objectsnap en ortho voor het tekenvlak.
 *
 * Een punt springt naar een eindpunt, midden of middelpunt van een vorm in de
 * buurt; is er geen, dan naar het dichtstbijzijnde punt op een lijn (een
 * ligger, een lijn, de rand van een rechthoek). Zo komt een oplegging precies
 * op het uiteinde van een ligger en een puntlast precies op de ligger.
 */
import { aantalPunten, boogEind, isVorm, maatNormaal, opCirkel, type Opgelost, type Tekening, type Vorm } from "./model.ts";
import { getekend, rechthoekLijnen, rechthoekPunten, symboolSnap, type SnapPunt, type SnapSoort } from "./symbolen.ts";

export type { SnapSoort };

export interface Snapset {
  punten: (SnapPunt & { id: string })[];
  lijnen: { id: string; x1: number; y1: number; x2: number; y2: number }[];
}

type Lijn = [number, number, number, number];

/** De snappunten en snaplijnen van één vorm, op de getekende waarden. */
export function vormSnap(v: Vorm, w: (k: string) => number): { punten: SnapPunt[]; lijnen: Lijn[] } {
  switch (v.soort) {
    case "lijn":
    case "pijl": {
      const [x1, y1, x2, y2] = [w("x1"), w("y1"), w("x2"), w("y2")];
      return {
        punten: [
          { x: x1, y: y1, soort: "eind" },
          { x: x2, y: y2, soort: "eind" },
          { x: (x1 + x2) / 2, y: (y1 + y2) / 2, soort: "midden" },
        ],
        lijnen: [[x1, y1, x2, y2]],
      };
    }
    case "maat": {
      // De maatlijn zelf, op zijn afstand: daar sluit een volgende maat op aan.
      const n = maatNormaal(w);
      const af = v.p.offset ? w("offset") : 0;
      const [x1, y1, x2, y2] = [w("x1") + n.x * af, w("y1") + n.y * af, w("x2") + n.x * af, w("y2") + n.y * af];
      return {
        punten: [
          { x: x1, y: y1, soort: "eind" },
          { x: x2, y: y2, soort: "eind" },
          { x: (x1 + x2) / 2, y: (y1 + y2) / 2, soort: "midden" },
        ],
        lijnen: [[x1, y1, x2, y2]],
      };
    }
    case "rechthoek": {
      const [x, y, b, h] = [w("x"), w("y"), w("w"), w("h")];
      return { punten: rechthoekPunten(x, y, b, h), lijnen: rechthoekLijnen(x, y, b, h) };
    }
    case "cirkel": {
      const [cx, cy, r] = [w("cx"), w("cy"), w("r")];
      return {
        punten: [
          { x: cx, y: cy, soort: "centrum" },
          { x: cx + r, y: cy, soort: "eind" },
          { x: cx - r, y: cy, soort: "eind" },
          { x: cx, y: cy + r, soort: "eind" },
          { x: cx, y: cy - r, soort: "eind" },
        ],
        lijnen: [],
      };
    }
    case "polylijn": {
      const n = aantalPunten(v);
      const pt = (i: number) => ({ x: w(`x${i}`), y: w(`y${i}`) });
      const punten: SnapPunt[] = [];
      const lijnen: Lijn[] = [];
      for (let i = 0; i < n; i++) {
        const a = pt(i);
        punten.push({ ...a, soort: "eind" });
        const j = i + 1 < n ? i + 1 : v.gesloten ? 0 : -1;
        if (j < 0) continue;
        const b = pt(j);
        punten.push({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, soort: "midden" });
        lijnen.push([a.x, a.y, b.x, b.y]);
      }
      return { punten, lijnen };
    }
    case "tekst":
      return { punten: [{ x: w("x"), y: w("y"), soort: "eind" }], lijnen: [] };
    case "boog": {
      const [cx, cy, r, a1] = [w("cx"), w("cy"), w("r"), w("a1")];
      const a2 = boogEind(a1, w("a2"));
      return {
        punten: [
          { ...opCirkel(cx, cy, r, a1), soort: "eind" },
          { ...opCirkel(cx, cy, r, a2), soort: "eind" },
          { ...opCirkel(cx, cy, r, (a1 + a2) / 2), soort: "midden" },
          { x: cx, y: cy, soort: "centrum" },
        ],
        lijnen: [],
      };
    }
    case "symbool":
      return symboolSnap(v, w);
  }
}

/** Alle snappunten van de tekening. */
export function snapset(t: Tekening, opgelost: Opgelost): Snapset {
  const set: Snapset = { punten: [], lijnen: [] };
  for (const el of t.elementen) {
    if (!isVorm(el)) continue;
    const { punten, lijnen } = vormSnap(el, getekend(el, opgelost));
    for (const p of punten) if (Number.isFinite(p.x) && Number.isFinite(p.y)) set.punten.push({ ...p, id: el.id });
    for (const [x1, y1, x2, y2] of lijnen) set.lijnen.push({ id: el.id, x1, y1, x2, y2 });
  }
  return set;
}

/** Voorrang bij gelijke afstand: een eindpunt gaat voor een midden, een midden voor een middelpunt. */
const VOORRANG: Record<SnapSoort, number> = { eind: 0, midden: 1, centrum: 2, op: 3 };

/** Het snappunt bij p binnen `tol`; null als er niets in de buurt ligt. */
export function zoekSnap(set: Snapset, p: { x: number; y: number }, tol: number, uitsluiten?: string[]): SnapPunt | null {
  let beste: SnapPunt | null = null;
  let afstand = Infinity;
  for (const q of set.punten) {
    if (uitsluiten?.includes(q.id)) continue;
    const d = Math.hypot(q.x - p.x, q.y - p.y) + VOORRANG[q.soort] * 1e-6;
    if (d < tol && d < afstand) {
      beste = { x: q.x, y: q.y, soort: q.soort };
      afstand = d;
    }
  }
  if (beste) return beste;
  for (const l of set.lijnen) {
    if (uitsluiten?.includes(l.id)) continue;
    const dx = l.x2 - l.x1, dy = l.y2 - l.y1;
    const kw = dx * dx + dy * dy;
    if (kw < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((p.x - l.x1) * dx + (p.y - l.y1) * dy) / kw));
    const x = l.x1 + t * dx, y = l.y1 + t * dy;
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < tol && d < afstand) {
      beste = { x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, soort: "op" };
      afstand = d;
    }
  }
  return beste;
}

/** Ortho: horizontaal of verticaal vanaf `a`, wat het dichtst bij de muis ligt. */
export function ortho(a: { x: number; y: number }, p: { x: number; y: number }) {
  return Math.abs(p.x - a.x) >= Math.abs(p.y - a.y) ? { x: p.x, y: a.y } : { x: a.x, y: p.y };
}
