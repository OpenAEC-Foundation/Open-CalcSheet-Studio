/**
 * Een Markdown-blad: een tekst in Markdown die als blad in het project staat,
 * tussen de rekenbladen. Voor een toelichting, een uitgangspuntennotitie of een
 * logboek. In het rapport komt het op zijn plek in hoofdstuk Berekeningen, in de
 * opmaak van het rapport, en zijn koppen kunnen in de inhoudsopgave.
 *
 * Een Markdown-blad is een gewoon exemplaar (store/projectStore.ts) met
 * `templateId` MARKDOWN_BLAD, een lege `source` en geen invoer. De tekst staat in
 * een eigen veld (`md`) en niet in `source`: die is van de rekentekst, en de
 * rekenkern, de rekenversie en *Bladen bijwerken* lezen hem.
 *
 * Puur en zonder imports: projectBestand.ts gebruikt dit bestand, en de
 * controlescripts laden dat rechtstreeks in Node.
 */

/** `templateId` van een Markdown-blad. Geen module: er is geen sjabloon met deze naam. */
export const MARKDOWN_BLAD = "markdown";

/** De tekst van een Markdown-blad. */
export interface MarkdownBestand {
  /** De oorspronkelijke bestandsnaam, met extensie; leeg bij een nieuw blad. */
  bestandsnaam: string;
  tekst: string;
  /**
   * Afbeeldingen die naast het bestand stonden: per adres zoals het in de tekst
   * staat een data-URL. Zo blijft het projectbestand overdraagbaar en verandert
   * de tekst zelf niet.
   */
  beelden?: Record<string, string>;
  /** De koppen uit de tekst blijven uit de inhoudsopgave van het rapport. */
  koppenUit?: boolean;
}

/** Is dit blad een Markdown-blad? Ook als de tekst ontbreekt. */
export function isMarkdownBlad(ex: { templateId?: string }): boolean {
  return ex.templateId === MARKDOWN_BLAD;
}

/**
 * De tekst uit een bestand of de opgeslagen staat van de app. Alleen een object
 * met tekst als `tekst` telt; een lege tekst mag (een nieuw blad). Van de
 * afbeeldingen blijven alleen data-URL's van afbeeldingen over: een ander adres
 * zou vanzelf laden, buiten de bevestiging per domein om.
 */
export function leesMarkdownBestand(x: unknown): MarkdownBestand | undefined {
  if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
  const m = x as Partial<Record<keyof MarkdownBestand, unknown>>;
  if (typeof m.tekst !== "string") return undefined;
  const uit: MarkdownBestand = {
    bestandsnaam: typeof m.bestandsnaam === "string" ? m.bestandsnaam : "",
    tekst: m.tekst,
  };
  if (m.beelden && typeof m.beelden === "object" && !Array.isArray(m.beelden)) {
    const beelden = Object.entries(m.beelden).filter(
      (e): e is [string, string] => typeof e[1] === "string" && /^data:image\//i.test(e[1]),
    );
    if (beelden.length > 0) uit.beelden = Object.fromEntries(beelden);
  }
  if (m.koppenUit === true) uit.koppenUit = true;
  return uit;
}

/** De bestandsnaam zonder map en zonder extensie: de naam van een nieuw blad. */
export function bladnaamVoorMarkdown(bestandsnaam: string): string {
  const los = bestandsnaam.split(/[\\/]/).pop() ?? bestandsnaam;
  return los.replace(/\.(md|markdown|txt)$/i, "").trim() || "Markdown";
}

/**
 * De bytes van een tekstbestand als tekst, zonder de markering aan het begin. UTF-8,
 * of UTF-16 met die markering; een bestand dat geen geldige UTF-8 is, is van een
 * oudere Windows-editor. Een ander bestand met een nul-teken is geen tekst: null.
 */
export function tekstUitBytes(bytes: Uint8Array): string | null {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes.includes(0)) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
