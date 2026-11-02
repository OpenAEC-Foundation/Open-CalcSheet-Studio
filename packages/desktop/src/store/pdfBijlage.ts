/**
 * Een PDF-blad: een PDF-bestand dat als blad in het project staat, tussen de
 * rekenbladen. Bijvoorbeeld het rapport-PDF van een FEM-model, of een
 * berekening van de leverancier. In het constructierapport komt het op zijn
 * plek in hoofdstuk Berekeningen, met de pagina's in bijlage A of in het
 * hoofdstuk zelf, net als een rekenblad.
 *
 * Een PDF-blad is een gewoon exemplaar (store/projectStore.ts) met
 * `templateId` PDF_BLAD, een lege `source` en geen invoer. Het bestand zelf
 * staat erin als base64 (`pdf`), zodat het projectbestand overdraagbaar blijft:
 * wie het project opent, heeft de PDF erbij.
 *
 * Puur en zonder waarde-imports: projectBestand.ts gebruikt dit bestand, en
 * de controlescripts laden dat rechtstreeks in Node.
 */

/** `templateId` van een PDF-blad. Geen module: er is geen sjabloon met deze naam. */
export const PDF_BLAD = "pdf";

/** Boven deze grootte vraagt de app eerst of het bestand er echt in moet. */
export const PDF_GROOT_BYTES = 20 * 1024 * 1024;

/** Het PDF-bestand van een PDF-blad. */
export interface PdfBijlage {
  /** De oorspronkelijke bestandsnaam, met extensie (bv. "hal-fem-rapport.pdf"). */
  bestandsnaam: string;
  /** De inhoud van het bestand, base64-gecodeerd (zonder `data:`-voorvoegsel). */
  data: string;
}

/** Is dit blad een PDF-blad? Ook als het bestand ontbreekt (zie leesPdfBijlage). */
export function isPdfBlad(ex: { templateId?: string }): boolean {
  return ex.templateId === PDF_BLAD;
}

/**
 * Het PDF-bestand uit een bestand of de opgeslagen staat van de app. Alleen
 * een object met tekst als `data` telt; witruimte in de base64 (een met de
 * hand opgemaakt bestand) valt weg. Iets anders: undefined. Het blad blijft
 * dan een PDF-blad, maar zonder bestand; de werkruimte en de afdruk zeggen
 * dat.
 */
export function leesPdfBijlage(x: unknown): PdfBijlage | undefined {
  if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
  const p = x as Partial<Record<keyof PdfBijlage, unknown>>;
  if (typeof p.data !== "string") return undefined;
  const data = /\s/.test(p.data) ? p.data.replace(/\s+/g, "") : p.data;
  if (data === "") return undefined;
  return { bestandsnaam: typeof p.bestandsnaam === "string" ? p.bestandsnaam : "", data };
}

/** Het aantal bytes dat een base64-tekst voorstelt. */
export function base64Bytes(data: string): number {
  const opvulling = data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((data.length * 3) / 4) - opvulling);
}

/** "1,2 MB" of "340 kB", voor in de werkruimte en de waarschuwing. */
export function grootteTekst(bytes: number, taal = "nl"): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) return `${mb.toLocaleString(taal, { maximumFractionDigits: 1 })} MB`;
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString(taal)} kB`;
}

/** De bestandsnaam zonder map en zonder `.pdf`: de naam van een nieuw blad. */
export function bladnaamVoor(bestandsnaam: string): string {
  const los = bestandsnaam.split(/[\\/]/).pop() ?? bestandsnaam;
  return los.replace(/\.pdf$/i, "").trim() || "PDF";
}

/** Begint de inhoud als een PDF ("%PDF-" in de eerste kilobyte, zoals lezers het toestaan)? */
export function lijktOpPdf(bytes: Uint8Array): boolean {
  const kop = String.fromCharCode(...bytes.subarray(0, 1024));
  return kop.includes("%PDF-");
}
