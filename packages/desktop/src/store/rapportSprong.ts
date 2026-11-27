import { create } from "zustand";

/**
 * Een sprong naar een plek in het rapport: een klik op een regel van de inhoud in het
 * zijpaneel (components/calc/InhoudLijst.tsx). Het invulpaneel schuift naar die paragraaf
 * en het voorbeeld ernaast naar het vel waar hij staat. `teller` loopt op bij elke klik,
 * zodat een tweede klik op dezelfde regel opnieuw springt.
 */
export const useRapportSprong = create<{ anker: string | null; teller: number; spring: (anker: string) => void }>((set) => ({
  anker: null,
  teller: 0,
  spring: (anker) => set((s) => ({ anker, teller: s.teller + 1 })),
}));
