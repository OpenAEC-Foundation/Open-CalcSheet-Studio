import { create } from "zustand";

/**
 * De paginanummers uit het laatste afdrukvoorbeeld van het rapport, per anker van de
 * inhoudsopgave, en het aantal pagina's. Het zijpaneel toont ze naast de nummers
 * (components/calc/InhoudLijst.tsx), en boven de uitdraai van een blad staat waar het komt
 * (components/calc/RapportPlek.tsx). Niet opgeslagen: ze zijn er pas na het verdelen over
 * vellen, en dat doet het voorbeeld.
 */
export const useInhoudPaginas = create<{ paginas: Record<string, number>; totaal?: number }>(() => ({ paginas: {} }));
