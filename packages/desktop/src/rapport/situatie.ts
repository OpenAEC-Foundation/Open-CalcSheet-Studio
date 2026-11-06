/**
 * De situatie in het rapport: de kaarten van de plek van het project, met het
 * punt en de datum waarvoor ze zijn gemaakt. Wordt als JSON in het project
 * opgeslagen en bij het openen genormaliseerd (normaliseerRapport in model.ts).
 * Importeert alleen binnen src/ met extensie .ts, zodat de controlescripts het
 * direct in Node laden.
 */
import { leesPunt, puntJson, type Punt } from "../kaart/punt.ts";
import { ZOEKSTRAAL_M } from "../kaart/overpass.ts";
import { metersPerPixel, schaalTekst } from "../kaart/tegels.ts";
import type { BeeldEenheden } from "../components/calc/beeldEenheden.ts";

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
  /** "kust": het dichtstbijzijnde water is de kustlijn (die heeft zelden een naam). */
  soort?: "kust";
}

export interface Situatie {
  tonen: boolean;
  punt: Punt;
  /** "JJJJ-MM-DD": de dag waarop de kaarten zijn gemaakt. */
  datum: string;
  kaarten: Kaartbeeld[];
  /**
   * Het gemeten open water. Afwezig: nog niet gemeten. `null`: gemeten, en er ligt geen
   * open water binnen de zoekstraal (10 km).
   */
  water?: Water | null;
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
  return { afstand: o.afstand, naam: o.naam, punt, ...(o.soort === "kust" ? { soort: "kust" as const } : {}) };
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
  // null is een meting ("geen open water"), een ongeldig object valt weg als niet gemeten.
  const water = o.water === null ? null : leesWater(o.water);
  return {
    tonen: typeof o.tonen === "boolean" ? o.tonen : true,
    punt: JSON.parse(puntJson(punt)) as Punt,
    datum: o.datum,
    kaarten,
    ...(water !== undefined ? { water } : {}),
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

/** Afgerond op twee significante cijfers: 26308 wordt 26000, 3459 wordt 3500, 411 wordt 410. */
function opTweeCijfers(x: number): number {
  if (!(x > 0)) return 0;
  const macht = 10 ** (Math.floor(Math.log10(x)) - 1);
  return Math.round(x / macht) * macht;
}

/**
 * Het onderschrift onder een kaart op papier, bijvoorbeeld "Omgeving · ca. 3,5 km":
 * de naam van de kaart en de werkelijke breedte van het beeld (pixels maal meters per
 * pixel bij dit zoomniveau en deze breedtegraad, op twee cijfers), in het eenhedenstelsel
 * van het project en in de taal van het rapport (`t` is de vertaler van die taal).
 */
export function onderschrift(
  id: KaartId,
  zoom: number,
  lat: number,
  eenheden: BeeldEenheden,
  taal: string,
  t: (sleutel: string, opties?: Record<string, unknown>) => string,
): string {
  const breedte = KAARTEN.find((k) => k.id === id)?.breedte ?? 0;
  const meters = opTweeCijfers(breedte * metersPerPixel(lat, zoom));
  return t("afdruk.situatie.onderschrift", {
    kaart: t(`afdruk.situatie.kaarten.${id}`),
    afstand: schaalTekst(meters, eenheden, taal),
  });
}

/**
 * De afstand tot open water in tekst, in het eenhedenstelsel van het project en in de taal
 * van het rapport: "820 m (Noorderplas)", of voor `null` "geen open water binnen 10 km".
 * Zonder naam alleen de afstand; bij de kust komt "kust" erbij: "3,2 km (kust)" of
 * "3,2 km (Noordzee, kust)".
 */
export function waterTekst(
  water: Water | null,
  eenheden: BeeldEenheden,
  taal: string,
  t: (sleutel: string, opties?: Record<string, unknown>) => string,
): string {
  if (!water) return t("afdruk.situatie.geenWater", { straal: schaalTekst(ZOEKSTRAAL_M, eenheden, taal) });
  const afstand = schaalTekst(water.afstand, eenheden, taal);
  const delen = [water.naam, water.soort === "kust" ? t("afdruk.situatie.kust") : ""].filter(Boolean);
  return delen.length > 0 ? `${afstand} (${delen.join(", ")})` : afstand;
}
