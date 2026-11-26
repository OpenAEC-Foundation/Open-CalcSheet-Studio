/**
 * Afstanden en oppervlakten op aarde, voor de afstand tot open water.
 * Importeert alleen ./punt.ts, zodat de controlescripts het direct in Node laden.
 *
 * Handberekening: 1° breedte = 6 371 008,8 m · π / 180 = 111 195 m;
 * 100 m naar het noorden is dus 100 / 111 195 = 0,000899° breedte.
 */
import type { Punt } from "./punt.ts";

const AARDSTRAAL = 6371008.8;
const RAD = Math.PI / 180;

/** De afstand over het aardoppervlak in meters (haversine). */
export function afstandM(a: Punt, b: Punt): number {
  const dLat = (b.lat - a.lat) * RAD;
  const dLon = (b.lon - a.lon) * RAD;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * AARDSTRAAL * Math.asin(Math.min(1, Math.sqrt(h)));
}

interface Xy {
  x: number;
  y: number;
}

/** Lengteverschil in graden, binnen ±180 (voor lijnen over de datumgrens). */
function verschilLon(lon: number, midden: number): number {
  let d = lon - midden;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/** Een lokaal vlak rond `midden` (equirectangulair): x oost, y noord, in meters. */
function vlak(midden: Punt) {
  const cosLat = Math.cos(midden.lat * RAD);
  const perGraad = AARDSTRAAL * RAD;
  return {
    naarXy: (p: Punt): Xy => ({ x: verschilLon(p.lon, midden.lon) * perGraad * cosLat, y: (p.lat - midden.lat) * perGraad }),
    naarPunt: (v: Xy): Punt => ({
      lat: midden.lat + v.y / perGraad,
      lon: midden.lon + (cosLat > 1e-9 ? v.x / (perGraad * cosLat) : 0),
    }),
  };
}

/** Het dichtste punt op een lijn (een rij punten) bij `p`, loodrecht op het segment, en de afstand in meters. */
export function dichtstePuntOpLijn(p: Punt, lijn: Punt[]): { punt: Punt; afstand: number } {
  if (lijn.length === 0) return { punt: p, afstand: Infinity };
  const v = vlak(p);
  const xy = lijn.map(v.naarXy);
  let besteAfstand = Infinity;
  let beste: Xy = xy[0];
  const probeer = (c: Xy) => {
    const d = Math.hypot(c.x, c.y);
    if (d < besteAfstand) {
      besteAfstand = d;
      beste = c;
    }
  };
  if (xy.length === 1) probeer(xy[0]);
  for (let i = 0; i + 1 < xy.length; i++) {
    const a = xy[i];
    const b = xy[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengte2 = dx * dx + dy * dy;
    // p ligt in de oorsprong: de projectie op het segment is a + t·(b − a) met t = −a·(b − a) / |b − a|²
    const t = lengte2 === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lengte2));
    probeer({ x: a.x + t * dx, y: a.y + t * dy });
  }
  return { punt: v.naarPunt(beste), afstand: besteAfstand };
}

/** De oppervlakte van een ring in m² (shoelace in een lokaal vlak). De ring mag open of gesloten zijn. */
export function oppervlakteM2(ring: Punt[]): number {
  if (ring.length < 3) return 0;
  const v = vlak(ring[0]);
  const xy = ring.map(v.naarXy);
  let som = 0;
  for (let i = 0; i < xy.length; i++) {
    const a = xy[i];
    const b = xy[(i + 1) % xy.length];
    som += a.x * b.y - b.x * a.y;
  }
  return Math.abs(som) / 2;
}

/** Ligt `p` binnen de ring? (Even-oneven regel in een lokaal vlak rond `p`.) */
export function puntInRing(p: Punt, ring: Punt[]): boolean {
  if (ring.length < 3) return false;
  const xy = ring.map(vlak(p).naarXy);
  let binnen = false;
  for (let i = 0, j = xy.length - 1; i < xy.length; j = i++) {
    const a = xy[i];
    const b = xy[j];
    if (a.y > 0 !== b.y > 0 && 0 < ((b.x - a.x) * (0 - a.y)) / (b.y - a.y) + a.x) binnen = !binnen;
  }
  return binnen;
}
