/**
 * Het rapport opgebouwd uit de bladen van het project (Rapport.uitBladen).
 *
 * Er is dan geen vaste hoofdstukindeling meer: elk blad met een rol is een hoofdstuk of een
 * paragraaf, in de volgorde van de projectboom. Een hoofdstuk krijgt het volgende nummer
 * (1, 2, …); een paragraaf hoort bij het hoofdstuk erboven (2.1, 2.2, …). De koppen in de
 * rekentekst van een hoofdstuk (`# Kop`) zijn ook paragrafen en tellen in dezelfde reeks
 * mee, vóór de paragraafbladen die erop volgen. Een blad zonder rol staat in bijlage A,
 * zoals een rekenblad altijd al deed.
 *
 * De titelregel van een blad (`"Titel`) vervalt in het rapport: de kop is de naam van het
 * blad, met zijn nummer.
 *
 * Puur en zonder React: de controlescripts laden dit bestand.
 */

/** De rol van een blad in het rapport; zonder rol staat het in bijlage A. */
export type BladRol = "hoofdstuk" | "paragraaf";

export const BLAD_ROLLEN: readonly BladRol[] = ["hoofdstuk", "paragraaf"];

export function isBladRol(x: unknown): x is BladRol {
  return x === "hoofdstuk" || x === "paragraaf";
}

/** Een regel in een blok dat geen rekentekst is (`@svg … @end`): daar is `#` geen kop. */
const BLOK_START_RE = /^@(svg|3d|fem|last|js|select|toets|kern)\b/i;
const BLOK_EIND_RE = /^@end\s*$/i;

/** De titelregel van een blad (`"Titel`), zonder de grondslag achter een streepje; leeg als er geen is. */
export function titelUitBron(source: string): string {
  for (const regel of source.split("\n")) {
    const t = regel.trim();
    if (t.startsWith('"')) return t.slice(1).trim();
    if (t !== "") return "";
  }
  return "";
}

/**
 * De koppen van het eerste niveau in een rekentekst (`# Kop`), in volgorde. Niet de
 * titelregel, en niet wat in een blok als `@svg` staat. Een kop in een `#if` die niet
 * loopt, telt hier wel mee: dat weet alleen de doorrekening.
 */
export function koppenUitBron(source: string): string[] {
  const uit: string[] = [];
  let inBlok = false;
  for (const regel of source.split("\n")) {
    const t = regel.trim();
    if (inBlok) {
      if (BLOK_EIND_RE.test(t)) inBlok = false;
      continue;
    }
    if (BLOK_START_RE.test(t)) {
      inBlok = true;
      continue;
    }
    const m = t.match(/^#\s+(.+)$/);
    if (m) uit.push(m[1].trim());
  }
  return uit;
}

/** Een kop uit een blad zoals het rapport hem zet: met zijn nummer (leeg: geen) en zijn anker. */
export interface GenummerdeKop {
  nummer: string;
  titel: string;
  anker: string;
}

/** Het anker van de i-de kop (vanaf 0) van een blad. */
export const kopAnker = (bladId: string, i: number) => `${bladId}-kop-${i + 1}`;

const escapeHtml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/**
 * De uitwerking van een blad voor in het rapport: de titelregel eruit, en de koppen van
 * het eerste niveau als paragraafkop van het rapport, met hun nummer en hun anker voor de
 * inhoudsopgave. Staan er in de uitwerking meer koppen dan `koppen` (of andere), dan
 * blijven die zonder nummer staan.
 */
export function uitwerkingInRapport(html: string, titel: string, koppen: readonly GenummerdeKop[]): string {
  let titelWeg = titel === "";
  let i = 0;
  const titelHtml = escapeHtml(titel);
  return html.replace(/<h1>([\s\S]*?)<\/h1>/g, (_heel, tekst: string) => {
    if (!titelWeg && (tekst === titelHtml || tekst.split(/\s+—\s+/)[0] === titelHtml.split(/\s+—\s+/)[0])) {
      titelWeg = true;
      return "";
    }
    titelWeg = true;
    const kop = koppen[i++];
    if (!kop) return `<h3 class="rpa-h3">${tekst}</h3>`;
    const nummer = kop.nummer ? `${escapeHtml(kop.nummer)} ` : "";
    const klasse = kop.nummer ? "rpa-h2" : "rpa-h3";
    const tag = kop.nummer ? "h2" : "h3";
    return `<${tag} class="${klasse}" data-inhoud="${escapeHtml(kop.anker)}">${nummer}${tekst}</${tag}>`;
  });
}
