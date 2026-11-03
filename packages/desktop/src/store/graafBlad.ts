/**
 * Een grafblad: een rekening als graaf van nodes en verbindingen, tussen de
 * rekenbladen in het project. In het rapport komt het op zijn plek in hoofdstuk
 * Berekeningen, net als een PDF- of spreadsheet-blad.
 *
 * Een grafblad is een gewoon exemplaar (store/projectStore.ts) met `templateId`
 * GRAAF_BLAD, een lege `source` en geen invoer. De graaf zelf staat in `graaf`
 * (graaf/model.ts); de uitkomsten worden telkens opnieuw uitgerekend.
 *
 * Puur en zonder React: projectBestand.ts gebruikt dit bestand, en de
 * controlescripts laden dat rechtstreeks in Node.
 */

/** `templateId` van een grafblad. Geen module: er is geen sjabloon met deze naam. */
export const GRAAF_BLAD = "graaf";

/** Is dit blad een grafblad? Ook als de graaf zelf ontbreekt. */
export function isGraafBlad(ex: { templateId?: string }): boolean {
  return ex.templateId === GRAAF_BLAD;
}
