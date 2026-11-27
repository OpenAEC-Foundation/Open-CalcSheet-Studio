import { create } from "zustand";

/**
 * De hoofdstukmodules H1 tot en met H5 (components/calc/projectTree.ts): een module
 * toevoegen vraagt hier om dat hoofdstuk, en RapportAlsBladen.tsx maakt het blad uit het
 * rapport, met dezelfde uitdraai. H5 wordt een canvasblad.
 */
export const HOOFDSTUK_MODULES: Readonly<Record<string, string>> = {
  "rapport-h1": "inleiding",
  "rapport-h2": "projectgegevens",
  "rapport-h3": "constructie",
  "rapport-h4": "uitgangspunten",
  "rapport-h5": "belastingen",
};

export const useHoofdstukMaken = create<{
  /** De ankers van de gevraagde hoofdstukken; leeg: alle. null: niets gevraagd. */
  vraag: string[] | null;
  maak: (ankers: string[]) => void;
  klaar: () => void;
}>((set) => ({
  vraag: null,
  maak: (ankers) => set({ vraag: ankers }),
  klaar: () => set({ vraag: null }),
}));
