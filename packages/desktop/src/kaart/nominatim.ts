/**
 * Adressen zoeken bij Nominatim (OpenStreetMap), wereldwijd. Alleen op verzoek
 * van de gebruiker (Enter of de knop), nooit tijdens het typen, en hooguit
 * één vraag per seconde. Importeert alleen ./punt.ts, zodat de controle-
 * scripts het direct in Node laden.
 */
import { leesPunt, type Punt } from "./punt.ts";

export interface Uitkomst {
  punt: Punt;
  naam: string;
}

const BASIS = "https://nominatim.openstreetmap.org/search";
const MIN_TUSSENTIJD_MS = 1000;
const TIJDSLIMIET_MS = 10000;

/** De geldige regels uit een antwoord (format=jsonv2); de rest valt weg. */
export function parseNominatim(json: unknown): Uitkomst[] {
  if (!Array.isArray(json)) return [];
  const uit: Uitkomst[] = [];
  for (const regel of json) {
    if (!regel || typeof regel !== "object") continue;
    const r = regel as { lat?: unknown; lon?: unknown; display_name?: unknown };
    if (typeof r.lat !== "string" || typeof r.lon !== "string") continue;
    const punt = leesPunt(JSON.stringify({ lat: Number(r.lat), lon: Number(r.lon) }));
    if (!punt) continue;
    uit.push({ punt, naam: typeof r.display_name === "string" ? r.display_name : "" });
  }
  return uit;
}

const slaap = (ms: number) => new Promise<void>((klaar) => setTimeout(klaar, ms));

let laatsteStart = 0;
let wachtrij: Promise<void> = Promise.resolve();

/** Wacht tot de vorige vraag minstens een seconde geleden begon; vragen komen in volgorde. */
function wachtOpBeurt(): Promise<void> {
  const beurt = wachtrij.then(async () => {
    while (Date.now() - laatsteStart < MIN_TUSSENTIJD_MS) {
      await slaap(Math.max(1, MIN_TUSSENTIJD_MS - (Date.now() - laatsteStart)));
    }
    laatsteStart = Date.now();
  });
  wachtrij = beurt;
  return beurt;
}

/**
 * Zoekt een adres of plaats; maximaal 5 uitkomsten. Een HTTP-fout geeft een Error met de status;
 * geen antwoord binnen de tijdslimiet (standaard 10 s) geeft ook een Error.
 */
export async function zoekAdres(
  tekst: string,
  taal: string,
  f: typeof fetch = fetch,
  tijdslimietMs: number = TIJDSLIMIET_MS,
): Promise<Uitkomst[]> {
  await wachtOpBeurt();
  const url = `${BASIS}?format=jsonv2&limit=5&q=${encodeURIComponent(tekst)}`;
  const antwoord = await f(url, {
    headers: { "Accept-Language": taal },
    signal: AbortSignal.timeout(tijdslimietMs),
  });
  if (!antwoord.ok) throw new Error(`HTTP ${antwoord.status}`);
  return parseNominatim(await antwoord.json());
}
