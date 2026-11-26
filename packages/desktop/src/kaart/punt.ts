/**
 * Het punt van de situatiekaart: een plek op aarde in graden (WGS84).
 * Zonder imports, zodat de controlescripts het direct in Node laden.
 */

export interface Punt {
  lat: number;
  lon: number;
}

function geldig(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === "number" && typeof lon === "number" &&
    Number.isFinite(lat) && Number.isFinite(lon) &&
    Math.abs(lat) <= 90 && Math.abs(lon) <= 180
  );
}

/** Leest het opgeslagen punt. Ontbrekend, kapot of buiten bereik telt als geen locatie. */
export function leesPunt(json: string | undefined): Punt | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json) as { lat?: unknown; lon?: unknown } | null;
    if (!o || typeof o !== "object") return null;
    if (!geldig(o.lat, o.lon)) return null;
    return { lat: o.lat as number, lon: o.lon as number };
  } catch {
    return null;
  }
}

/** Het punt om op te slaan, op 6 decimalen (ongeveer 0,1 m). */
export function puntJson(p: Punt): string {
  return JSON.stringify({ lat: Number(p.lat.toFixed(6)), lon: Number(p.lon.toFixed(6)) });
}

const GETAL = /^[+-]?\d+(?:[.,]\d+)?$/;

function getal(s: string): number {
  return Number(s.replace(",", "."));
}

/**
 * Leest "52.0907, 5.1214", "52,0907; 5,1214" of "52.0907 5.1214".
 * Alles wat geen paar coördinaten is (een adres) geeft null.
 */
export function leesCoordinaten(tekst: string): Punt | null {
  const t = tekst.trim();
  if (!t) return null;
  let delen: string[];
  if (t.includes(";")) {
    delen = t.split(";").map((d) => d.trim());
  } else if (/\s/.test(t) && !t.includes(",")) {
    delen = t.split(/\s+/);
  } else {
    // komma als scheiding: de getallen zelf hebben dan een punt als decimaalteken
    const stukken = t.split(",").map((d) => d.trim());
    delen = stukken.length === 2 ? stukken : t.split(/\s+/);
  }
  if (delen.length !== 2 || !delen.every((d) => GETAL.test(d))) return null;
  const lat = getal(delen[0]);
  const lon = getal(delen[1]);
  return geldig(lat, lon) ? { lat, lon } : null;
}

/** Het punt leesbaar: "52,09070° N, 5,12140° O" (nl) of "52.09070° N, 5.12140° E" (en). */
export function puntTekst(p: Punt, taal: string): string {
  const nl = taal.toLowerCase().startsWith("nl");
  const getalTekst = (v: number) => {
    const s = Math.abs(v).toFixed(5);
    return nl ? s.replace(".", ",") : s;
  };
  const ns = p.lat < 0 ? (nl ? "Z" : "S") : "N";
  const ow = p.lon < 0 ? "W" : nl ? "O" : "E";
  return `${getalTekst(p.lat)}° ${ns}, ${getalTekst(p.lon)}° ${ow}`;
}
