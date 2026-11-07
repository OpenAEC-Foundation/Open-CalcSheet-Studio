/**
 * De verzoeken van `@toets`-blokken naar Open FEM Studio sturen.
 *
 * De werkruimte rekent een blad in de rekenworker door met `toetsModus: "vragen"`.
 * Een blok zonder antwoord geeft dan een verzoek mee (doorrekening.ts). Hier gaat
 * elk verzoek één keer naar FEM Studio (femStudio.ts). Het antwoord komt in de
 * sessiecache (toetsCache.ts), en daarna rekent het blad een ronde opnieuw, omdat
 * de versie van de cache in de sleutel van de doorrekening zit.
 *
 * Een fout wordt ook een antwoord (`ok: false`): het blok toont hem als niet
 * getoetst en vraagt niet steeds opnieuw.
 */
import { useSyncExternalStore } from "react";
import i18next from "i18next";
import type { ToetsVerzoek } from "@ifc-calc/core";
import { femStudioAanroep, femStudioStatus, FemFout } from "./femStudio";
import { abonneerToetsingen, heeftToetsAntwoord, toetsVersie, zetToetsAntwoord } from "./toetsCache";

const onderweg = new Set<string>();
let versie: Promise<string | undefined> | null = null;

/** De versie van FEM Studio, één keer gevraagd. */
function femVersie(): Promise<string | undefined> {
  versie ??= femStudioStatus()
    .then((s) => s.versie ?? undefined)
    .catch(() => undefined);
  return versie;
}

/** Stuurt elk nieuw verzoek één keer; wat al onderweg of beantwoord is, slaat hij over. */
export function vraagToetsingen(verzoeken: readonly ToetsVerzoek[]): void {
  for (const v of verzoeken) {
    if (onderweg.has(v.hash) || heeftToetsAntwoord(v.hash)) continue;
    onderweg.add(v.hash);
    void (async () => {
      try {
        const uitkomst = await femStudioAanroep(v.tool, v.argumenten);
        zetToetsAntwoord(v.hash, { ok: true, uitkomst, versie: await femVersie() });
      } catch (e) {
        const melding =
          e instanceof FemFout && e.code === "geenDesktop"
            ? i18next.t("werkruimte:toets.geenDesktop")
            : e instanceof Error
              ? e.message
              : String(e);
        zetToetsAntwoord(v.hash, { ok: false, melding });
      } finally {
        onderweg.delete(v.hash);
      }
    })();
  }
}

/** De versie van de sessiecache: verandert bij elk nieuw antwoord. */
export function useToetsVersie(): number {
  return useSyncExternalStore(abonneerToetsingen, toetsVersie);
}
