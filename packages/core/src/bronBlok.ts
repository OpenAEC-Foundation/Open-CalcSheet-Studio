/**
 * Een verwijzing naar een normartikel in een eigen PDF: de regel `@bron`.
 *
 * Schrijfwijze
 * ------------
 *   @bron #4 p. 57 "NEN-EN 1995-1-1, 6.1.7(2)"
 *   @bron "D:\Normen\NEN-EN 1993-1-1.pdf" p. 41 "NEN-EN 1993-1-1, 6.2.5"
 *   @bron https://voorbeeld.nl/norm.pdf p. 3
 *
 * Eerst het doel: het kenmerk van een PDF-blad in het project (`#4`), een pad op schijf of
 * een adres (http of https). Een pad met spaties staat tussen dubbele aanhalingstekens.
 * Daarna het paginanummer (`p. 57`, `p.57`, `pagina 57` of `page 57`), en tot slot tussen
 * aanhalingstekens wat er staat: de norm en het artikel. Pagina en omschrijving mogen weg.
 *
 * De kern rekent niets en opent niets. Hij schrijft een tekstregel met de verwijzing in
 * data-attributen; de app maakt hem op het scherm klikbaar (de PDF opent op die pagina)
 * en zet op papier de bron erbij, met de naam van het PDF-blad of het bestand
 * (packages/desktop/src/components/calc/bronnen.ts). Geen normtekst in het blad: alleen
 * nummers en een omschrijving van de gebruiker.
 *
 * Uitvoer
 * -------
 *   <span class="calc-bron" data-bron="#4" data-pagina="57">
 *     <span class="calc-bron-tekst">NEN-EN 1995-1-1, 6.1.7(2)</span>
 *     <span class="calc-bron-plek"> (#4, p. 57)</span>
 *   </span>
 */

export const BRON_RE = /^@bron(?:\s+(.*))?$/i;

export interface BronVerwijzing {
  /** `#4`, een pad of een adres; leeg als de regel geen doel noemt. */
  doel: string;
  /** Het paginanummer, of null zonder pagina. */
  pagina: number | null;
  /** De omschrijving tussen aanhalingstekens; leeg zonder. */
  tekst: string;
}

/** Leest wat na `@bron` staat. */
export function leesBron(rest: string): BronVerwijzing {
  let s = rest.trim();
  let doel = '';
  const gequoot = /^"([^"]*)"\s*/.exec(s);
  if (gequoot) {
    doel = gequoot[1].trim();
    s = s.slice(gequoot[0].length);
  } else {
    const woord = /^(\S+)\s*/.exec(s);
    if (woord && !/^(?:p\.?|pagina|page)$/i.test(woord[1]) && !woord[1].startsWith('"')) {
      doel = woord[1];
      s = s.slice(woord[0].length);
    }
  }
  let pagina: number | null = null;
  // `p.57` komt hier als `p[57]` aan: de kern leest een punt in een naam als index.
  const pag = /^(?:p\.?\s*|p\[|pagina\s+|page\s+)(\d+)\]?\s*/i.exec(s);
  if (pag) {
    pagina = Number(pag[1]);
    s = s.slice(pag[0].length);
  }
  const tekst = /^"([^"]*)"/.exec(s)?.[1].trim() ?? s.trim();
  return { doel, pagina: pagina !== null && pagina >= 1 ? pagina : null, tekst };
}

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** De plek als korte tekst: `#4, p. 57`, of de bestandsnaam van een pad of adres. */
export function bronPlek(b: BronVerwijzing): string {
  const naam = b.doel.startsWith('#') ? b.doel : b.doel.split(/[\\/]/).filter(Boolean).pop() ?? b.doel;
  return [naam, b.pagina !== null ? `p. ${b.pagina}` : ''].filter(Boolean).join(', ');
}

/** De html van een verwijzing (zie boven). */
export function bronHtml(b: BronVerwijzing): string {
  const tekst = b.tekst || bronPlek(b);
  const plek = b.tekst ? bronPlek(b) : '';
  return `<span class="calc-bron" data-bron="${attr(b.doel)}"${b.pagina !== null ? ` data-pagina="${b.pagina}"` : ''}>`
    + `<span class="calc-bron-tekst">${attr(tekst)}</span>`
    + (plek ? `<span class="calc-bron-plek"> (${attr(plek)})</span>` : '')
    + '</span>';
}
