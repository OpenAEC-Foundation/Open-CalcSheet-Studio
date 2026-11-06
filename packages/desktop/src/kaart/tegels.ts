/**
 * De tegelwiskunde van de situatiekaart: Web Mercator met tegels van 256 px,
 * zoals de kaarttegels van OpenStreetMap. Zonder imports, zodat de
 * controlescripts het direct in Node laden.
 */

export const TEGEL = 256;
export const MAX_ZOOM = 19;

interface Plek {
  lat: number;
  lon: number;
}

/** De plek in tegeleenheden (gebroken getal) op dit zoomniveau. */
export function tegelPositie(p: Plek, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const rad = (p.lat * Math.PI) / 180;
  const x = ((p.lon + 180) / 360) * n;
  const y = ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n;
  return { x, y };
}

/** Meters per pixel op deze breedtegraad en dit zoomniveau. */
export function metersPerPixel(lat: number, zoom: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

/** Het grootste gehele zoomniveau (hoogstens 19) waarbij breedtePx pixels ten minste `meters` beslaan. */
export function zoomVoor(p: Plek, breedtePx: number, meters: number): number {
  for (let z = MAX_ZOOM; z > 0; z--) {
    if (breedtePx * metersPerPixel(p.lat, z) >= meters) return z;
  }
  return 0;
}

/**
 * De tegels die een beeld van breedte × hoogte pixels vullen, met hun plek in pixels.
 * Het punt ligt in het midden. `x` wikkelt om de datumgrens; tegels boven of onder
 * de wereld bestaan niet en ontbreken.
 */
export function uitsnede(
  p: Plek,
  zoom: number,
  breedte: number,
  hoogte: number,
): { z: number; x: number; y: number; px: number; py: number }[] {
  const n = 2 ** zoom;
  const midden = tegelPositie(p, zoom);
  const links = Math.round(midden.x * TEGEL - breedte / 2);
  const boven = Math.round(midden.y * TEGEL - hoogte / 2);
  const x0 = Math.floor(links / TEGEL);
  const y0 = Math.floor(boven / TEGEL);
  const x1 = Math.floor((links + breedte - 1) / TEGEL);
  const y1 = Math.floor((boven + hoogte - 1) / TEGEL);
  const uit: { z: number; x: number; y: number; px: number; py: number }[] = [];
  for (let ty = y0; ty <= y1; ty++) {
    if (ty < 0 || ty >= n) continue;
    for (let tx = x0; tx <= x1; tx++) {
      uit.push({
        z: zoom,
        x: ((tx % n) + n) % n,
        y: ty,
        px: tx * TEGEL - links,
        py: ty * TEGEL - boven,
      });
    }
  }
  return uit;
}

/** De grootste 1-2-5-waarde (1, 2, 5, 10, ... m) die in maxPx past, met haar breedte in pixels. */
export function schaalbalk(lat: number, zoom: number, maxPx: number): { meters: number; px: number } {
  const mpp = metersPerPixel(lat, zoom);
  const maxMeters = maxPx * mpp;
  let beste = 1;
  for (let macht = 1; macht <= 1e8; macht *= 10) {
    for (const f of [1, 2, 5]) {
      if (macht * f <= maxMeters) beste = macht * f;
    }
  }
  return { meters: beste, px: beste / mpp };
}
