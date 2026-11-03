/**
 * Een spreadsheet-blad: een werkmap (XLSX) die als blad in het project staat,
 * tussen de rekenbladen. Voor wat beter in een tabel past dan in rekentekst,
 * zoals een staaflijst of een hoeveelheidsoverzicht. In het rapport komt het op
 * zijn plek in hoofdstuk Berekeningen, net als een PDF-blad.
 *
 * Een spreadsheet-blad is een gewoon exemplaar (store/projectStore.ts) met
 * `templateId` SPREADSHEET_BLAD, een lege `source` en geen invoer. De werkmap
 * zelf staat erin als base64 (`xlsx`), zodat het projectbestand overdraagbaar
 * blijft: wie het project opent, heeft de werkmap erbij.
 *
 * Puur en zonder React: projectBestand.ts gebruikt dit bestand, en de
 * controlescripts laden dat rechtstreeks in Node.
 */
import { isPdfBlad, leesPdfBijlage } from "./pdfBijlage.ts";

/** `templateId` van een spreadsheet-blad. Geen module: er is geen sjabloon met deze naam. */
export const SPREADSHEET_BLAD = "spreadsheet";

/** De werkmap van een nieuw blad: één leeg werkblad, base64-gecodeerd. */
export const LEGE_WERKMAP = "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";

/** De werkmap van een spreadsheet-blad. */
export interface SpreadsheetBestand {
  /** De oorspronkelijke bestandsnaam, met extensie; leeg bij een nieuw blad. */
  bestandsnaam: string;
  /** De inhoud van het bestand, base64-gecodeerd (zonder `data:`-voorvoegsel). */
  data: string;
}

/** Is dit blad een spreadsheet-blad? Ook als de werkmap ontbreekt. */
export function isSpreadsheetBlad(ex: { templateId?: string }): boolean {
  return ex.templateId === SPREADSHEET_BLAD;
}

/** Een blad zonder rekentekst en invoer: een PDF of een werkmap. */
export function isLosBlad(ex: { templateId?: string }): boolean {
  return isPdfBlad(ex) || isSpreadsheetBlad(ex);
}

/** De werkmap uit een bestand of de opgeslagen staat van de app; zelfde vorm als een PDF. */
export function leesSpreadsheetBestand(x: unknown): SpreadsheetBestand | undefined {
  return leesPdfBijlage(x);
}

/** Begint de inhoud als een ZIP-pakket, zoals elk XLSX-bestand? */
export function lijktOpWerkmap(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/** De bestandsnaam zonder map en zonder extensie: de naam van een nieuw blad. */
export function bladnaamVoorWerkmap(bestandsnaam: string): string {
  const los = bestandsnaam.split(/[\\/]/).pop() ?? bestandsnaam;
  return los.replace(/\.xlsx?$/i, "").trim() || "Spreadsheet";
}

/*
 * De open editor houdt wijzigingen eerst zelf vast en schrijft ze kort daarna
 * naar het project. Opslaan vraagt hem eerst om zijn laatste stand, ook van een
 * cel die nog openstaat.
 */
const bewaarders = new Set<() => Promise<void>>();

export function registreerBewaarder(bewaar: () => Promise<void>): () => void {
  bewaarders.add(bewaar);
  return () => {
    bewaarders.delete(bewaar);
  };
}

/** Zet wat in een open editor staat in het project. Een fout houdt het opslaan niet tegen. */
export async function bewaarOpenWerkmappen(): Promise<void> {
  await Promise.all(
    [...bewaarders].map((bewaar) => bewaar().catch((err) => console.error("Spreadsheet bewaren mislukt:", err))),
  );
}
