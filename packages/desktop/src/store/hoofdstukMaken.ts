import { create } from "zustand";

/**
 * De hoofdstukmodules H1 tot en met H5 (components/calc/projectTree.ts): een module
 * toevoegen vraagt hier om dat hoofdstuk, en RapportAlsBladen.tsx maakt het blad uit het
 * rapport, met dezelfde uitdraai. H5 wordt een canvasblad.
 */
export const HOOFDSTUK_MODULES: Readonly<Record<string, string>> = {
  "rapport-voorblad": "voorblad",
  "rapport-h1": "inleiding",
  "rapport-h2": "projectgegevens",
  "rapport-h3": "constructie",
  "rapport-h4": "uitgangspunten",
  "rapport-h5": "belastingen",
  "rapport-h6": "berekeningen",
};

export const useHoofdstukMaken = create<{
  /** De ankers van de gevraagde hoofdstukken; leeg: alle. null: niets gevraagd. */
  vraag: string[] | null;
  /** Dit blad opnieuw maken in plaats van een nieuw blad: na het venster van 5.5 (BlijvendVenster.tsx). */
  vervang: string | null;
  maak: (ankers: string[], vervang?: string) => void;
  klaar: () => void;
}>((set) => ({
  vraag: null,
  vervang: null,
  maak: (ankers, vervang) => set({ vraag: ankers, vervang: vervang ?? null }),
  klaar: () => set({ vraag: null, vervang: null }),
}));
