import { useEffect } from "react";
import { useProjectStore } from "./projectStore";

/**
 * Houdt de lijst met wijzigingen van de actieve versie bij zolang hij in beeld is: in het
 * afdrukvoorbeeld en in het rapportpaneel. Vergelijken rekent alleen door wat is veranderd
 * (store/projectIfcx.ts bewaart de uitkomst per blad). Wat de gebruiker met de regels deed, staat er
 * los van en blijft dus staan. Geen stap in ongedaan maken en geen "niet opgeslagen": de lijst is
 * afgeleid en komt niet in het bestand.
 */
export function useWijzigingenLijst(): void {
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const gegevens = useProjectStore((s) => s.gegevens);
  const rapport = useProjectStore((s) => s.rapport);
  const versies = useProjectStore((s) => s.versies);
  const werkBij = useProjectStore((s) => s.werkWijzigingenLijstBij);
  useEffect(() => {
    werkBij();
  }, [exemplaren, gegevens, rapport, versies, werkBij]);
}
