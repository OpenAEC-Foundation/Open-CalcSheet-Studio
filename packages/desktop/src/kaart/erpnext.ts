/**
 * De locatie uit een ERPNext-projectveld: coördinaten of een adres.
 * Alleen imports van ./punt.ts, zodat de controlescripts het direct in Node laden; de
 * Tauri-aanroepen staan in tauri/erpnext.ts.
 */
import { leesCoordinaten, type Punt } from "./punt.ts";

/** Hoeveel tekens van de ERPNext-tekst naar de zoekdienst gaan. */
export const MAX_ZOEKTEKST = 200;

export interface Plek {
  punt: Punt;
  naam: string;
}

/**
 * Maakt van de tekst uit ERPNext een punt. De tekst komt van buiten en is onbetrouwbaar:
 * hij wordt getrimd en begrensd. Coördinaten gaan direct (de tekst is dan de naam), een adres
 * gaat naar `zoek` en de eerste uitkomst telt. Leeg, of niets gevonden: null. Een fout van
 * `zoek` komt door naar de aanroeper.
 */
export async function locatieUitErp(tekst: string, zoek: (t: string) => Promise<Plek[]>): Promise<Plek | null> {
  const schoon = tekst.trim().slice(0, MAX_ZOEKTEKST).trim();
  if (!schoon) return null;
  const punt = leesCoordinaten(schoon);
  if (punt) return { punt, naam: schoon };
  const gevonden = await zoek(schoon);
  return gevonden[0] ?? null;
}
