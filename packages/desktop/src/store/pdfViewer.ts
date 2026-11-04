import { create } from "zustand";
import { DIKTEN, KLEUREN, type PdfGereedschap } from "./pdfAantekeningen.ts";

/**
 * De PDF-viewer die openstaat, voor het lint: net als `useSpreadsheetEditor` bij de werkmap. De
 * viewer meldt zich aan met zijn stand en zijn opdrachten; het lint leest die en roept ze aan.
 */

export interface PdfViewerOpdrachten {
  naarPagina: (pagina: number) => void;
  zoomIn: () => void;
  zoomUit: () => void;
  passendBreedte: () => void;
  passendPagina: () => void;
  verwijderKeuze: () => void;
  allesWissen: () => void;
  zetOpPapier: (aan: boolean) => void;
}

interface PdfViewerStand {
  zichtbaar: boolean;
  pagina: number;
  aantal: number;
  procent: number;
  zoomModus: "start" | "breedte" | "pagina" | "vast";
  heeftKeuze: boolean;
  heeftAantekeningen: boolean;
  opPapier: boolean;
  opdrachten: PdfViewerOpdrachten | null;
  /** Blijft bewaard tussen bladen en sessies van het lint: de pen ligt waar je hem neerlegde. */
  gereedschap: PdfGereedschap;
  kleur: string;
  dikte: number;
}

export const usePdfViewer = create<PdfViewerStand>(() => ({
  zichtbaar: false,
  pagina: 0,
  aantal: 0,
  procent: 100,
  zoomModus: "start",
  heeftKeuze: false,
  heeftAantekeningen: false,
  opPapier: true,
  opdrachten: null,
  gereedschap: "kies",
  kleur: KLEUREN[0],
  dikte: DIKTEN[1],
}));
