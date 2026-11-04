import { create } from "zustand";

/**
 * De paginanummers uit het laatste afdrukvoorbeeld van het rapport, per anker van de
 * inhoudsopgave. Het zijpaneel toont ze naast de nummers (components/calc/InhoudLijst.tsx). Niet
 * opgeslagen: ze zijn er pas na het verdelen over vellen, en dat doet het voorbeeld.
 */
export const useInhoudPaginas = create<{ paginas: Record<string, number> }>(() => ({ paginas: {} }));
