/**
 * Een verwijzing naar een normartikel in een eigen PDF (`@bron`, core: bronBlok.ts).
 *
 * De kern schrijft `<span class="calc-bron" data-bron="#4" data-pagina="57">…</span>`. Hier:
 *   - `bronnenInvullen`: de tekst eromheen, in de taal van de uitvoer: "Bron:" ervoor, en
 *     de plek met de naam van het PDF-blad of het bestand en de pagina. Zo staat het op
 *     papier als bronvermelding, en op het scherm als link;
 *   - `openBron`: een klik op het scherm. Een PDF-blad in het project opent in de app op
 *     die pagina; een adres opent in de browser met `#page=`; een pad op schijf opent in
 *     een venster van de app op die pagina (BronVenster.tsx).
 *
 * Een blad kan van iemand anders komen: een pad wordt alleen gelezen na een klik van de
 * gebruiker, alleen een .pdf, en er wordt niets uitgevoerd.
 */
import { create } from "zustand";
import { useProjectStore, type Exemplaar } from "../../store/projectStore";
import { isPdfBlad } from "../../store/pdfBijlage";
import { usePdfViewer } from "../../store/pdfViewer";
import { openBuiten } from "../../werkplek/werkplek";
import type { TFunction } from "i18next";

/** De teksten bij een verwijzing in de taal van `t` (beelden.json, onder `afdruk`). */
export function bronTeksten(t: TFunction | ((s: string, o?: Record<string, unknown>) => string)): BronTeksten {
  const v = t as (s: string, o?: Record<string, unknown>) => string;
  return {
    label: v("afdruk.bronLabel"),
    blad: (ref, naam) => (naam ? v("afdruk.bronBlad", { ref, naam }) : v("afdruk.bronBladOnbekend", { ref })),
    pagina: (n) => v("afdruk.bronPagina", { n }),
  };
}

export type BronSoort = "blad" | "adres" | "pad";

export function bronSoort(doel: string): BronSoort {
  if (/^#[A-Za-z0-9_]+$/.test(doel)) return "blad";
  if (/^https?:\/\//i.test(doel)) return "adres";
  return "pad";
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const ontsnap = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export interface BronTeksten {
  /** "Bron:" */
  label: string;
  /** "blad {{ref}} {{naam}}" */
  blad: (ref: string, naam: string | null) => string;
  /** "p. {{n}}" */
  pagina: (n: number) => string;
}

const BRON_RE = /<span class="calc-bron" data-bron="([^"]*)"(?: data-pagina="(\d+)")?><span class="calc-bron-tekst">([\s\S]*?)<\/span>(?:<span class="calc-bron-plek">[\s\S]*?<\/span>)?<\/span>/g;

/**
 * Vult de verwijzingen in een uitwerking in: een label ervoor, en de plek met de naam van
 * het PDF-blad (of de bestandsnaam) en de pagina. `bladen`: de bladen van het project, voor
 * de naam bij `#4`.
 */
export function bronnenInvullen(html: string, t: BronTeksten, bladen: readonly Pick<Exemplaar, "ref" | "naam">[]): string {
  if (!html.includes("calc-bron")) return html;
  return html.replace(BRON_RE, (_heel, doelEsc: string, pag: string | undefined, tekst: string) => {
    const doel = ontsnap(doelEsc);
    const soort = bronSoort(doel);
    const pagina = pag ? Number(pag) : null;
    const naam = soort === "blad"
      ? t.blad(doel, bladen.find((b) => `#${b.ref}` === doel)?.naam ?? null)
      : doel.split(/[\\/]/).filter(Boolean).pop() ?? doel;
    const plek = [naam, pagina !== null ? t.pagina(pagina) : ""].filter(Boolean).join(", ");
    return `<span class="calc-bron" data-bron="${esc(doel)}"${pagina !== null ? ` data-pagina="${pagina}"` : ""} data-bron-soort="${soort}">`
      + `<span class="calc-bron-label">${esc(t.label)} </span>`
      + `<a class="calc-bron-link" role="link" tabindex="0">${tekst}</a>`
      + `<span class="calc-bron-plek"> (${esc(plek)})</span></span>`;
  });
}

/** Kenmerk en naam van elk blad als één tekst: verandert alleen als een kenmerk of naam verandert. */
export const bladNamenSleutel = (bladen: readonly Pick<Exemplaar, "ref" | "naam">[]) =>
  bladen.map((b) => `${b.ref ?? ""}\u0000${b.naam}`).join("\u0001");

/** Terug naar een lijst voor `bronnenInvullen`. */
export const bladenUitSleutel = (sleutel: string): Pick<Exemplaar, "ref" | "naam">[] =>
  sleutel ? sleutel.split("\u0001").map((r) => {
    const [ref, naam] = r.split("\u0000");
    return { ref: ref || undefined, naam };
  }) : [];

// ── Openen ────────────────────────────────────────────────────────────────

/** Het venster met een PDF van schijf (BronVenster.tsx). */
export const useBronVenster = create<{ pad: string | null; pagina: number; melding: string | null }>(() => ({
  pad: null,
  pagina: 1,
  melding: null,
}));

/** Wacht tot de PDF-viewer van het geopende blad klaar is en gaat dan naar de pagina. */
function naarPaginaZodraKlaar(pagina: number) {
  const probeer = () => {
    const s = usePdfViewer.getState();
    if (s.opdrachten && s.aantal > 0) {
      s.opdrachten.naarPagina(Math.min(pagina, s.aantal));
      return true;
    }
    return false;
  };
  if (probeer()) return;
  const stop = usePdfViewer.subscribe(() => {
    if (probeer()) stop();
  });
  // Laadt de PDF niet binnen 15 s, dan houdt het wachten op.
  setTimeout(stop, 15000);
}

/** Opent een verwijzing. Geeft een melding terug als het niet kan (in de taal van de app). */
export async function openBron(doel: string, pagina: number | null, meldingen: { geenBlad: string; geenPdf: string; alleenApp: string }): Promise<string | null> {
  const soort = bronSoort(doel);
  if (soort === "blad") {
    const ex = useProjectStore.getState().exemplaren.find((e) => `#${e.ref}` === doel);
    if (!ex) return meldingen.geenBlad;
    if (!isPdfBlad(ex)) return meldingen.geenPdf;
    // Een ander blad: de viewer van het vorige blad meldt zich af, die van dit blad aan.
    usePdfViewer.setState({ opdrachten: null, aantal: 0 });
    useProjectStore.getState().selecteer(ex.id);
    if (pagina !== null) naarPaginaZodraKlaar(pagina);
    return null;
  }
  if (soort === "adres") {
    await openBuiten(pagina !== null ? `${doel.replace(/#.*$/, "")}#page=${pagina}` : doel);
    return null;
  }
  if (!/\.pdf$/i.test(doel)) return meldingen.geenPdf;
  if (!("__TAURI_INTERNALS__" in window)) return meldingen.alleenApp;
  useBronVenster.setState({ pad: doel, pagina: pagina ?? 1, melding: null });
  return null;
}
