import type { ComponentType } from "react";
import type { Exemplaar } from "../../store/projectStore";
import { PDF_BLAD } from "../../store/pdfBijlage";
import { SPREADSHEET_BLAD } from "../../store/spreadsheetBlad";
import { MARKDOWN_BLAD } from "../../store/markdownBlad";
import type { Blad, BladPlek, Inhoudskop } from "../../rapport/opzet";
import type { Maten } from "./paginering";
import { papier, usePdfPaginas, usePdfVersie } from "./pdfBlad";
import { useWerkmapVersie } from "./spreadsheetBlad";
import { useMarkdownVersie } from "./markdownBlad";
import { PdfPaginas } from "./PdfBladWeergave";
import { SpreadsheetVellen } from "./SpreadsheetBladWeergave";
import { MarkdownPapier, MarkdownRapportKeuze } from "./MarkdownBladWeergave";
import { koppenVoorInhoud } from "./markdownRegels";

/*
 * De bladsoorten in de afdruk, op één plek.
 *
 * Een blad dat niet rekent (een PDF, een werkmap, een Markdown-tekst) meldt zich
 * hier aan, en de afdruk vraagt het alleen hier na: de losse uitdraai (PrintBlad),
 * het rapport (Knopen, RapportAfdruk), het doorrekenen (bladDoorrekenen) en het
 * paneel Rapport (BerekeningenSectie). Een blad zonder aanmelding is een rekenblad.
 *
 * Een nieuwe soort komt er met een paar regels bij; docs/bladsoorten.md zegt hoe.
 * Paginanummers en inhoudsopgave volgen daarna vanzelf: elk blok op een vel telt
 * mee, hoe het ook is getekend.
 */

export interface BladSoort {
  /** `templateId` van de bladen van deze soort. */
  templateId: string;
  /** De naam van de soort op papier, onder de kop en in de kolom grondslag. In de taal van de app. */
  soortTekst: () => string;
  /**
   * Het afdrukonderdeel: de inhoud van het blad onder zijn kop, binnen de
   * bladspiegel van `maten`. Elk blok is een los kind; `print-nieuw-vel` begint een
   * vers vel en `print-vel-af` sluit het af (paginering.ts). Wat nog tekent draagt
   * `data-afdruk-laadt`, en verandert daarna `useVersie`.
   */
  Afdruk: ComponentType<{ ex: Exemplaar; maten: Maten }>;
  /** Wat er achter de soort onder de kop staat, zoals de bestandsnaam. Een haak: mag een stand lezen. */
  useOnderkop?: (ex: Exemplaar) => Array<string | undefined>;
  /** Verandert als er iets klaar is getekend: het afdrukvoorbeeld verdeelt dan opnieuw. */
  useVersie?: () => number;
  /** Waar de uitwerking staat zolang de gebruiker niets koos. Zonder: in de bijlage. */
  plek?: BladPlek;
  /**
   * Regels onder de naam van het blad in de inhoudsopgave, zoals koppen uit een
   * bestand. Het anker van een regel staat op papier als `data-inhoud` op die kop.
   * Zonder: alleen de naam van het blad.
   */
  inhoudsKoppen?: (ex: Exemplaar) => Inhoudskop[];
  /** Een eigen keuze op de kaart van dit blad in het paneel Rapport. */
  RapportKeuze?: ComponentType<{ ex: Exemplaar }>;
}

const SOORTEN: readonly BladSoort[] = [
  {
    templateId: PDF_BLAD,
    soortTekst: () => papier()("pdfBlad.soort"),
    Afdruk: PdfPaginas,
    // Een getekende pagina verandert de hoogte niet, maar moet wel op de vellen komen.
    useVersie: usePdfVersie,
    useOnderkop: (ex) => {
      const stand = usePdfPaginas(ex.pdf?.data);
      return [ex.pdf?.bestandsnaam, stand && stand.paginas.length > 0 ? papier()("pdfBlad.paginas", { count: stand.paginas.length }) : ""];
    },
  },
  {
    templateId: SPREADSHEET_BLAD,
    soortTekst: () => papier()("spreadsheetBlad.soort"),
    Afdruk: SpreadsheetVellen,
    // Een getekende werkmap verandert de hoogte juist wel.
    useVersie: useWerkmapVersie,
    useOnderkop: (ex) => [ex.xlsx?.bestandsnaam],
  },
  {
    templateId: MARKDOWN_BLAD,
    soortTekst: () => papier()("markdownBlad.soort"),
    Afdruk: MarkdownPapier,
    // Een geladen afbeelding.
    useVersie: useMarkdownVersie,
    useOnderkop: (ex) => [ex.md?.bestandsnaam],
    plek: "hoofdstuk",
    inhoudsKoppen: (ex) => (ex.md && !ex.md.koppenUit ? koppenVoorInhoud(ex.md.tekst, ex) : []),
    RapportKeuze: MarkdownRapportKeuze,
  },
];

/** De aanmelding van dit blad; een rekenblad heeft er geen. */
export function bladSoortVan(ex: { templateId?: string }): BladSoort | undefined {
  return SOORTEN.find((s) => s.templateId === ex.templateId);
}

/** Verandert als een van de soorten iets klaar heeft. De lijst staat vast, dus de haken ook. */
export function useBladSoortenVersie(): string {
  return SOORTEN.map((s) => s.useVersie?.() ?? 0).join("|");
}

/** Een blad zoals de opzet van het rapport het leest (rapport/opzet.ts). */
export function bladVoorOpzet(ex: Exemplaar): Blad {
  const soort = bladSoortVan(ex);
  return { id: ex.id, naam: ex.naam, plek: soort?.plek, koppen: soort?.inhoudsKoppen?.(ex) };
}

/**
 * Een blad van een aangemelde soort als eigen onderdeel van de uitdraai: de kop
 * met nummer en naam (losse bladen: 1, 2, …; bijlage A: A.1, A.2, …), daaronder zijn
 * afdrukonderdeel. `anker`: de plek van de kop voor de inhoudsopgave.
 */
export function LosBladAfdruk({ soort, ex, nummer, maten, anker }: {
  soort: BladSoort; ex: Exemplaar; nummer: number | string; maten: Maten; anker?: string;
}) {
  // Een blad verandert niet van soort, dus deze haak blijft dezelfde.
  const extra = soort.useOnderkop?.(ex) ?? [];
  const onderkop = [soort.soortTekst(), ...extra].filter(Boolean).join(" · ");
  return (
    <section className="print-blad print-pdf">
      <header className="print-blad-kop" data-inhoud={anker}>
        <span className="print-blad-nr">{nummer}</span>
        <span className="print-blad-titel">
          <span className="print-blad-naam">{ex.naam}</span>
          <span className="print-blad-norm">{onderkop}</span>
        </span>
      </header>
      <soort.Afdruk ex={ex} maten={maten} />
    </section>
  );
}
