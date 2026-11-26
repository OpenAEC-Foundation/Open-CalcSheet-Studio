/**
 * Open water zoeken bij Overpass (OpenStreetMap) en de afstand erheen. Eén vraag
 * per meting. Importeert alleen ./punt.ts en ./afstand.ts (en het type Water),
 * zodat de controlescripts het direct in Node laden.
 *
 * Wat telt als open water: de kustlijn (lijn); natuurlijk water van een soort die geen
 * vijver, sloot of bassin is, of zonder soort, van minstens 1 ha; baaien en zeeën (vlak).
 *
 * Beperking: de zoekopdracht meet met `around` naar de lijnen van het water. Een punt diep in
 * een zeer groot water (meer dan de zoekstraal van de oever) geeft daarom geen treffer.
 */
import { dichtstePuntOpLijn, oppervlakteM2, puntInRing } from "./afstand.ts";
import type { Punt } from "./punt.ts";
import type { Water } from "../rapport/situatie.ts";

const BASIS = "https://overpass-api.de/api/interpreter";
const TIJDSLIMIET_MS = 40000;
const MIN_OPPERVLAKTE_M2 = 10000;

/** De straal in meters waarbinnen naar open water wordt gezocht. */
export const ZOEKSTRAAL_M = 10000;

/** Soorten natuurlijk water die open water zijn; zonder soort telt het ook (mits groot genoeg). Alles anders niet. */
const OPEN_WATER = ["lake", "reservoir", "river", "lagoon", "oxbow", "canal"];

/** De Overpass-vraag: kustlijnen, meren e.d., baaien en zeeën binnen `straalM` meter van `p`. */
export function waterVraag(p: Punt, straalM: number): string {
  const rond = `(around:${straalM},${p.lat},${p.lon})`;
  const soort = `["water"~"^(${OPEN_WATER.join("|")})$"]`;
  const zonderSoort = `[!"water"]`;
  return [
    "[out:json][timeout:25];",
    "(",
    `  way["natural"="coastline"]${rond};`,
    `  way["natural"="water"]${soort}${rond};`,
    `  way["natural"="water"]${zonderSoort}${rond};`,
    `  relation["natural"="water"]${soort}${rond};`,
    `  relation["natural"="water"]${zonderSoort}${rond};`,
    `  way["natural"="bay"]${rond};`,
    `  relation["natural"="bay"]${rond};`,
    `  way["place"="sea"]${rond};`,
    `  relation["place"="sea"]${rond};`,
    ");",
    "out geom;",
  ].join("\n");
}

type Los = Record<string, unknown>;

function object(x: unknown): Los | undefined {
  return x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Los) : undefined;
}

function leesGeometrie(x: unknown): Punt[] {
  if (!Array.isArray(x)) return [];
  const uit: Punt[] = [];
  for (const el of x) {
    const o = object(el);
    if (!o || typeof o.lat !== "number" || typeof o.lon !== "number") continue;
    if (!Number.isFinite(o.lat) || !Number.isFinite(o.lon) || Math.abs(o.lat) > 90 || Math.abs(o.lon) > 180) continue;
    uit.push({ lat: o.lat, lon: o.lon });
  }
  return uit;
}

const zelfde = (a: Punt, b: Punt) => a.lat === b.lat && a.lon === b.lon;
const gesloten = (r: Punt[]) => r.length >= 4 && zelfde(r[0], r[r.length - 1]);

/** Voegt losse stukken met gedeelde eindpunten samen tot lijnen (de ringen van een relation). */
function koppel(stukken: Punt[][]): Punt[][] {
  const rest = stukken.filter((s) => s.length >= 2).map((s) => s.slice());
  const klaar: Punt[][] = [];
  while (rest.length > 0) {
    let ring = rest.shift() as Punt[];
    let gevonden = true;
    while (gevonden && !gesloten(ring)) {
      gevonden = false;
      for (let i = 0; i < rest.length; i++) {
        const s = rest[i];
        const kop = ring[0];
        const staart = ring[ring.length - 1];
        if (zelfde(staart, s[0])) ring = ring.concat(s.slice(1));
        else if (zelfde(staart, s[s.length - 1])) ring = ring.concat(s.slice(0, -1).reverse());
        else if (zelfde(kop, s[s.length - 1])) ring = s.concat(ring.slice(1));
        else if (zelfde(kop, s[0])) ring = s.slice(1).reverse().concat(ring);
        else continue;
        rest.splice(i, 1);
        gevonden = true;
        break;
      }
    }
    klaar.push(ring);
  }
  return klaar;
}

interface Kandidaat {
  naam: string;
  /** Vlakken: de buitenringen; lijnen: de lijnen. */
  buiten: Punt[][];
  /** De binnenringen (eilanden) van een vlak. */
  binnen: Punt[][];
  vlak: boolean;
  /** Het is de kustlijn. */
  kust?: boolean;
}

function tekst(x: unknown): string {
  return typeof x === "string" ? x : "";
}

/** Maakt van een element een kandidaat, of undefined als het geen open water is. */
function kandidaat(el: Los): Kandidaat | undefined {
  const tags = object(el.tags) ?? {};
  const naam = tekst(tags.name);
  const kust = tags.natural === "coastline";
  const zee = tags.natural === "bay" || tags.place === "sea";
  const meer = tags.natural === "water" && (tags.water === undefined || OPEN_WATER.includes(tekst(tags.water)));
  if (!kust && !zee && !meer) return undefined;

  let buitenLijnen: Punt[][];
  let binnenLijnen: Punt[][] = [];
  if (el.type === "way") {
    buitenLijnen = [leesGeometrie(el.geometry)];
  } else if (el.type === "relation" && Array.isArray(el.members)) {
    const bu: Punt[][] = [];
    const bi: Punt[][] = [];
    for (const m of el.members) {
      const mo = object(m);
      if (!mo || mo.type !== "way") continue;
      const g = leesGeometrie(mo.geometry);
      if (mo.role === "inner") bi.push(g);
      else if (mo.role === "outer" || mo.role === "") bu.push(g);
    }
    buitenLijnen = koppel(bu);
    binnenLijnen = koppel(bi);
  } else {
    return undefined;
  }
  buitenLijnen = buitenLijnen.filter((l) => l.length > 0);
  if (buitenLijnen.length === 0) return undefined;

  if (kust) return { naam, buiten: buitenLijnen, binnen: [], vlak: false, kust: true };
  const buitenRingen = buitenLijnen.filter(gesloten);
  if (buitenRingen.length === 0) {
    // een zee of baai die als open lijn is getekend telt als lijn; een meer zonder ring niet
    return zee ? { naam, buiten: buitenLijnen, binnen: [], vlak: false } : undefined;
  }
  const binnenRingen = binnenLijnen.filter(gesloten);
  // elk vlak (meer, baai of zee) moet minstens 1 ha zijn
  const opp = buitenRingen.reduce((s, r) => s + oppervlakteM2(r), 0) - binnenRingen.reduce((s, r) => s + oppervlakteM2(r), 0);
  if (opp < MIN_OPPERVLAKTE_M2) return undefined;
  return { naam, buiten: buitenRingen, binnen: binnenRingen, vlak: true };
}

/**
 * Het dichtstbijzijnde open water uit een Overpass-antwoord (`out geom;`), of null.
 * Ligt het punt in een vlak (en niet in een eiland erin), dan is de afstand 0.
 * Een antwoord met een `remark` over een runtime error, time-out of geheugen geeft een Error,
 * en een antwoord zonder `elements`-lijst ook (dat is geen antwoord van de dienst). Alleen een
 * lege lijst of zonder geldige kandidaten betekent: geen open water.
 */
export function dichtstbijzijndWater(p: Punt, antwoord: unknown): Water | null {
  // Overpass meldt een time-out of te weinig geheugen met HTTP 200, een remark en lege of halve elements
  const remark = object(antwoord)?.remark;
  if (typeof remark === "string" && /runtime error|query timed out|out of memory/i.test(remark)) {
    throw new Error(`Overpass: ${remark}`);
  }
  const elementen = object(antwoord)?.elements;
  if (!Array.isArray(elementen)) throw new Error("Overpass: onverwacht antwoord");
  let beste: Water | null = null;
  for (const el of elementen) {
    const o = object(el);
    const k = o ? kandidaat(o) : undefined;
    if (!k) continue;
    let afstand = Infinity;
    let punt: Punt = p;
    if (k.vlak && k.buiten.some((r) => puntInRing(p, r)) && !k.binnen.some((r) => puntInRing(p, r))) {
      afstand = 0;
    } else {
      for (const lijn of [...k.buiten, ...k.binnen]) {
        const r = dichtstePuntOpLijn(p, lijn);
        if (r.afstand < afstand) {
          afstand = r.afstand;
          punt = r.punt;
        }
      }
    }
    if (Number.isFinite(afstand) && (!beste || afstand < beste.afstand)) beste = { afstand, naam: k.naam, punt, ...(k.kust ? { soort: "kust" as const } : {}) };
  }
  return beste;
}

/**
 * Meet het dichtstbijzijnde open water binnen de zoekstraal (10 km): één POST naar Overpass. Een HTTP-fout geeft
 * een Error met de status; geen antwoord binnen de tijdslimiet (standaard 40 s) geeft ook een Error.
 */
export async function meetWater(
  p: Punt,
  f: typeof fetch = fetch,
  tijdslimietMs: number = TIJDSLIMIET_MS,
): Promise<Water | null> {
  const antwoord = await f(BASIS, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `data=${encodeURIComponent(waterVraag(p, ZOEKSTRAAL_M))}`,
    signal: AbortSignal.timeout(tijdslimietMs),
  });
  if (!antwoord.ok) throw new Error(`HTTP ${antwoord.status}`);
  return dichtstbijzijndWater(p, await antwoord.json());
}
