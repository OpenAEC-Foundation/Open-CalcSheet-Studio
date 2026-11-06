/**
 * De situatie in het rapport: de kaarten van de plek van het project, met het
 * punt en de datum waarvoor ze zijn gemaakt. Wordt als JSON in het project
 * opgeslagen en bij het openen genormaliseerd (normaliseerRapport in model.ts).
 * Importeert alleen binnen src/ met extensie .ts, zodat de controlescripts het
 * direct in Node laden.
 */
import { leesPunt, puntJson, type Punt } from "../kaart/punt.ts";

export type KaartId = "gebied" | "omgeving" | "locatie";

/**
 * De drie kaarten. `meters` is de breedte van het beeld in de werkelijkheid,
 * `breedte` en `hoogte` zijn in pixels: twee keer de maat op papier, voor een scherpe afdruk.
 */
export const KAARTEN: readonly { id: KaartId; meters: number; breedte: number; hoogte: number }[] = [
  { id: "gebied", meters: 15000, breedte: 560, hoogte: 460 },
  { id: "omgeving", meters: 2000, breedte: 1180, hoogte: 640 },
  { id: "locatie", meters: 300, breedte: 560, hoogte: 460 },
];

export interface Kaartbeeld {
  id: KaartId;
  zoom: number;
  /** Base64 van de JPEG, zonder `data:`-voorvoegsel. */
  jpeg: string;
}

/** Het dichtstbijzijnde water; `afstand` in meters. */
export interface Water {
  afstand: number;
  naam: string;
  punt: Punt;
}

export interface Situatie {
  tonen: boolean;
  punt: Punt;
  /** "JJJJ-MM-DD": de dag waarop de kaarten zijn gemaakt. */
  datum: string;
  kaarten: Kaartbeeld[];
  water?: Water;
}

type Los = Record<string, unknown>;

function object(x: unknown): Los | undefined {
  return x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Los) : undefined;
}

/** Hergebruikt de controle van punt.ts: geen JSON-tekst, maar een object in het rapport. */
function leesPuntObject(x: unknown): Punt | null {
  const o = object(x);
  return o ? leesPunt(JSON.stringify({ lat: o.lat, lon: o.lon })) : null;
}

function leesWater(x: unknown): Water | undefined {
  const o = object(x);
  if (!o) return undefined;
  const punt = leesPuntObject(o.punt);
  if (typeof o.afstand !== "number" || !Number.isFinite(o.afstand) || o.afstand < 0) return undefined;
  if (typeof o.naam !== "string" || !punt) return undefined;
  return { afstand: o.afstand, naam: o.naam, punt };
}

/**
 * Een situatie uit een bestand. Verkeerde vorm, een punt buiten bereik of zonder
 * bruikbare kaarten geeft `undefined`; een kaart met een onbekende id of zonder
 * jpeg valt weg.
 */
export function normaliseerSituatie(x: unknown): Situatie | undefined {
  const o = object(x);
  if (!o) return undefined;
  const punt = leesPuntObject(o.punt);
  if (!punt || typeof o.datum !== "string" || !Array.isArray(o.kaarten)) return undefined;
  const kaarten: Kaartbeeld[] = [];
  for (const el of o.kaarten) {
    const k = object(el);
    if (!k) continue;
    const id = KAARTEN.find((m) => m.id === k.id)?.id;
    if (!id || typeof k.jpeg !== "string" || !k.jpeg) continue;
    if (typeof k.zoom !== "number" || !Number.isFinite(k.zoom)) continue;
    kaarten.push({ id, zoom: k.zoom, jpeg: k.jpeg });
  }
  if (kaarten.length === 0) return undefined;
  const water = leesWater(o.water);
  return {
    tonen: typeof o.tonen === "boolean" ? o.tonen : true,
    punt: JSON.parse(puntJson(punt)) as Punt,
    datum: o.datum,
    kaarten,
    ...(water ? { water } : {}),
  };
}

const AARDSTRAAL = 6371008.8;

function afstandMeter(a: Punt, b: Punt): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * AARDSTRAAL * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Hoort de situatie bij het punt van het project? "geen" zonder situatie of punt,
 * "verouderd" als het punt meer dan 1 m van het punt van de kaarten ligt.
 */
export function situatieBijPunt(s: Situatie | undefined, p: Punt | null): "geen" | "actueel" | "verouderd" {
  if (!s || !p) return "geen";
  return afstandMeter(s.punt, p) > 1 ? "verouderd" : "actueel";
}
