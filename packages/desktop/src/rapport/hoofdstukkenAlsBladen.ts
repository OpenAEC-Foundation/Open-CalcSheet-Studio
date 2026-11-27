/**
 * De hoofdstukken van het rapport als rekentekst: elk hoofdstuk een blad waarvan de code
 * precies de opmaak van dat hoofdstuk in het rapport is. Gelezen uit de afdruk zelf (de
 * meetopstelling van het afdrukvoorbeeld), zodat de uitdraai van het blad gelijk is aan het
 * hoofdstuk. Elke regel is een tekstregel (`'…`) met een blok HTML; de rekenkern zet zo'n
 * regel letterlijk neer (renderer.ts).
 *
 * Stap 1: de getallen staan als vaste waarden in de tekst.
 */

/** Een hoofdstuk: zijn titel zonder nummer, en de rekentekst. */
export interface HoofdstukBlad {
  titel: string;
  bron: string;
}

/** HTML op één regel, zonder rechte apostrof: die wisselt in de rekentaal tussen tekst en rekenen. */
function regel(html: string): string {
  return "'" + html.replace(/\s*\n\s*/g, " ").replace(/'/g, "&#39;").replace(/\$/g, "&#36;");
}

/** Begint met dit stuk een hoofdstuk? Dan zijn kop: een h1 met een anker voor de inhoud. */
function hoofdstukKop(el: Element): HTMLElement | null {
  return el.querySelector<HTMLElement>("h1.rpa-h1[data-inhoud]");
}

/**
 * De hoofdstukken uit de afdruk van het rapport (`.rpa-wortel`): alles tussen de kop van een
 * hoofdstuk en de volgende, tot bijlage A. Voorblad, situatie en inhoud vallen erbuiten.
 */
export function hoofdstukkenUitAfdruk(wortel: HTMLElement): HoofdstukBlad[] {
  const stijl = wortel.getAttribute("style") ?? "";
  const hoofdstukken: { titel: string; secties: string[][] }[] = [];
  for (const sectie of Array.from(wortel.children)) {
    if (sectie.tagName !== "SECTION") continue;
    if (sectie.classList.contains("rpa-bijlagekop")) break;
    let huidigeSectie: string[] | null = null;
    for (const stuk of Array.from(sectie.children)) {
      const kop = hoofdstukKop(stuk);
      if (kop) {
        const titel = (kop.textContent ?? "").trim().replace(/^\d+\s+/, "");
        hoofdstukken.push({ titel, secties: [] });
        huidigeSectie = null;
      }
      const h = hoofdstukken[hoofdstukken.length - 1];
      if (!h) continue;
      if (!huidigeSectie) {
        huidigeSectie = [];
        h.secties.push(huidigeSectie);
      }
      huidigeSectie.push(stuk.outerHTML);
    }
  }
  return hoofdstukken.map(({ titel, secties }) => ({
    titel,
    bron: [
      regel(`<div class="rpa-wortel rpa-in-blad" style="${stijl.replace(/"/g, "&quot;")}">`),
      ...secties.flatMap((s) => [regel('<section class="rpa-sectie">'), ...s.map(regel), regel("</section>")]),
      regel("</div>"),
    ].join("\n") + "\n",
  }));
}
