import { useMemo } from "react";
import { useProjectStore } from "../../store/projectStore";
import { evalOptiesVan } from "../../store/projectEenheden";
import { beeldEenheden, type BeeldEenheden } from "./beeldEenheden";

/**
 * Het eenhedenstelsel van het project voor een beeld, een tabel of een veld
 * (beeldEenheden.ts). Alleen de keuze en de eigen keuze per grootheid tellen; een
 * wijziging in de rest van de projectgegevens maakt niets nieuw.
 */
export function useBeeldEenheden(): BeeldEenheden {
  const keuze = useProjectStore((s) => s.gegevens.eenheden);
  const eigen = useProjectStore((s) => s.gegevens.eenheden_eigen);
  return useMemo(
    () => beeldEenheden(evalOptiesVan({ eenheden: keuze, eenheden_eigen: eigen }).stelsel),
    [keuze, eigen],
  );
}
