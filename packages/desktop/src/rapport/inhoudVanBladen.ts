/**
 * De inhoudsopgave, gemaakt uit de bladen van het project: de koppen van de hoofdstukbladen
 * (H1 … H6, met hun nummer en anker in de opmaak van het rapport) en daarna de andere
 * bladen in bijlage A. Een blad dat `<div data-inhoudsopgave></div>` bevat (het Voorblad),
 * krijgt hier de inhoudsopgave (UitwerkingHtml.tsx); de paginanummers vult het
 * afdrukvoorbeeld in via `data-inhoud-doel`, net als in het rapport.
 *
 * Puur en zonder React: de controlescripts laden dit bestand.
 */
import { bijlageBladAnker } from "./opzet.ts";

export const INHOUD_PLEK = '<div data-inhoudsopgave></div>';

export interface InhoudRegel {
  nummer: string;
  titel: string;
  anker: string;
  niveau: 1 | 2;
}

const KOP_RE = /<h([12]) class="rpa-h[12][^"]*" data-inhoud="([^"]+)">([^<]+)<\/h\1>/g;

const ontsnap = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Een tekst uit de rekentekst terug: de tekens die de omzetting verving. */
const lees = (s: string) => s.replace(/&#39;/g, "'").replace(/&#36;/g, "$").replace(/&amp;/g, "&");

/**
 * De regels van de inhoudsopgave: de koppen van de bladen met de opmaak van het rapport, in
 * de volgorde van de projectboom, en de andere rekenbladen als bijlage A.1, A.2, …
 */
export function inhoudVanBladen(bladen: readonly { id: string; naam: string; source?: string }[], bijlageTitel: string): InhoudRegel[] {
  const uit: InhoudRegel[] = [];
  const bijlage: InhoudRegel[] = [];
  for (const b of bladen) {
    const bron = b.source ?? "";
    if (bron.includes("data-inhoudsopgave")) continue;
    const koppen = [...bron.matchAll(KOP_RE)];
    if (koppen.length) {
      for (const [, niveau, anker, tekst] of koppen) {
        const t = lees(tekst).trim();
        const m = t.match(/^(\d+(?:\.\d+)*)\s+(.*)$/);
        uit.push({ nummer: m ? m[1] : "", titel: m ? m[2] : t, anker, niveau: niveau === "1" ? 1 : 2 });
      }
    } else if (bron.trim()) {
      bijlage.push({ nummer: `A.${bijlage.length + 1}`, titel: b.naam, anker: bijlageBladAnker(b.id), niveau: 2 });
    }
  }
  if (bijlage.length) uit.push({ nummer: "A", titel: bijlageTitel, anker: "bijlage-A", niveau: 1 }, ...bijlage);
  return uit;
}

/** De inhoudsopgave als HTML in de opmaak van het rapport (Inhoud.tsx, raster.tsx). */
export function inhoudHtml(regels: readonly InhoudRegel[], titel: string): string {
  const cel = (k: number, n: number, inhoud: string, klasse = "") =>
    `<span class="rpa-cel${klasse ? ` ${klasse}` : ""}" style="grid-column: ${k} / span ${n}">${inhoud}</span>`;
  const rijen = regels.map((r, i) => {
    const klasse = r.niveau === 1 ? (i === 0 ? "rpa-rij rpa-io1" : "rpa-rij rpa-io1 rpa-voor") : "rpa-rij";
    return `<div class="${klasse}">${cel(2, 1, ontsnap(r.nummer))}${cel(3, 7, ontsnap(r.titel), "rpa-io-titel")}${cel(10, 1, `<span data-inhoud-doel="${ontsnap(r.anker)}"></span>`, "rpa-io-pagina")}</div>`;
  });
  return `<div class="rpa-vlak"><h1 class="rpa-h1">${ontsnap(titel)}</h1>${rijen.join("")}</div>`;
}
