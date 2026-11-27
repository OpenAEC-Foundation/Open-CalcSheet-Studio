/**
 * De hoofdstukken van het rapport als rekentekst: elk hoofdstuk een blad waarvan de code
 * precies de opmaak van dat hoofdstuk in het rapport is. Gelezen uit de afdruk zelf (de
 * meetopstelling van het afdrukvoorbeeld), zodat de uitdraai van het blad gelijk is aan het
 * hoofdstuk. Elke regel is een tekstregel (`'…`) met een blok HTML; de rekenkern zet zo'n
 * regel letterlijk neer (renderer.ts).
 *
 * Hoofdstuk Belastingen wordt een canvasblad (store/canvasBlad.ts): elk stuk (een
 * paragraaf, een tabel, een groep opbouwen) een eenheid, onder elkaar met de hoogte die
 * het in het rapport heeft. Daarna kun je ze verslepen.
 *
 * Stap 1: de getallen staan als vaste waarden in de tekst.
 */
import { schrijfEenheden, stapelOnderElkaar, type Eenheid } from "../store/canvasBlad.ts";

/** Het hoofdstuk dat een canvasblad wordt. */
export const CANVAS_HOOFDSTUK = "belastingen";

/** Een hoofdstuk: zijn anker, zijn titel zonder nummer, en de rekentekst; `canvas` voor een canvasblad. */
export interface HoofdstukBlad {
  anker: string;
  titel: string;
  bron: string;
  canvas: boolean;
}

/** HTML op één regel, zonder rechte apostrof (die wisselt tussen tekst en rekenen) en zonder `$`. */
function regel(html: string): string {
  return "'" + html.replace(/\s*\n\s*/g, " ").replace(/'/g, "&#39;").replace(/\$/g, "&#36;");
}

/** Begint met dit stuk een hoofdstuk? Dan zijn kop: een h1 met een anker voor de inhoud. */
function hoofdstukKop(el: Element): HTMLElement | null {
  return el.querySelector<HTMLElement>("h1.rpa-h1[data-inhoud]");
}

/** Een stuk van een hoofdstuk: zijn HTML, zijn hoogte in mm, en of het een nieuwe sectie (vel) begint. */
interface Stuk {
  html: string;
  hoogte: number;
  nieuweSectie: boolean;
}

/** px naar mm, bij 96 px per inch. */
const MM = 25.4 / 96;

/**
 * De hoofdstukken uit de afdruk van het rapport (`.rpa-wortel`): alles tussen de kop van een
 * hoofdstuk en de volgende, tot bijlage A. Voorblad, situatie en inhoud vallen erbuiten.
 */
export function hoofdstukkenUitAfdruk(wortel: HTMLElement): HoofdstukBlad[] {
  const stijl = wortel.getAttribute("style") ?? "";
  const open = regel(`<div class="rpa-wortel rpa-in-blad" style="${stijl.replace(/"/g, "&quot;")}">`);
  const sluit = regel("</div>");
  const hoofdstukken: { anker: string; titel: string; stukken: Stuk[] }[] = [];
  for (const sectie of Array.from(wortel.children)) {
    if (sectie.tagName !== "SECTION") continue;
    if (sectie.classList.contains("rpa-bijlagekop")) break;
    let eerste = true;
    for (const stuk of Array.from(sectie.children)) {
      const kop = hoofdstukKop(stuk);
      if (kop) {
        const titel = (kop.textContent ?? "").trim().replace(/^\d+\s+/, "");
        hoofdstukken.push({ anker: kop.dataset.inhoud ?? "", titel, stukken: [] });
        eerste = true;
      }
      const h = hoofdstukken[hoofdstukken.length - 1];
      if (!h) continue;
      h.stukken.push({ html: stuk.outerHTML, hoogte: (stuk as HTMLElement).offsetHeight * MM, nieuweSectie: eerste });
      eerste = false;
    }
  }
  return hoofdstukken.map(({ anker, titel, stukken }) => {
    if (anker === CANVAS_HOOFDSTUK) {
      // Elk stuk een eenheid, met de opmaak van het rapport eromheen; onder elkaar.
      const eenheden: Eenheid[] = stukken.map((s, i) => ({
        id: `h${i + 1}`, x: 0, y: 0,
        tekst: [open, regel('<section class="rpa-sectie">'), regel(s.html), regel("</section>"), sluit].join("\n"),
      }));
      const hoogte = new Map(eenheden.map((e, i) => [e.id, stukken[i].hoogte]));
      return { anker, titel, canvas: true, bron: schrijfEenheden(stapelOnderElkaar(eenheden, (e) => hoogte.get(e.id))) + "\n" };
    }
    const regels = [open];
    for (const s of stukken) {
      if (s.nieuweSectie && regels.length > 1) regels.push(regel("</section>"));
      if (s.nieuweSectie) regels.push(regel('<section class="rpa-sectie">'));
      regels.push(regel(s.html));
    }
    regels.push(regel("</section>"), sluit);
    return { anker, titel, canvas: false, bron: regels.join("\n") + "\n" };
  });
}
