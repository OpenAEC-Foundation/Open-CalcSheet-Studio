import i18next from "i18next";
import { strFromU8 } from "fflate";
import { useProjectStore } from "../../store/projectStore";
import { GrafBestandFout, leesGrafBestand } from "../../graaf/grafBestand";
import { kiesBestanden } from "../calc/jupyterBlad";

/**
 * Leest een grafbestand in: op het blad `id`, of op een nieuw blad met de naam uit het bestand.
 * Wat niet meerekent, staat op de graaf met een melding, en wordt hier ook één keer genoemd.
 */
export async function leesGrafBestandIn(id?: string): Promise<void> {
  const t = i18next.getFixedT(null, "werkruimte");
  try {
    const gekozen = await kiesBestanden(["dyn"], t("graaf.import.filter"));
    const bestand = gekozen[0];
    if (!bestand) return;
    const verslag = leesGrafBestand(strFromU8(bestand.bytes));
    const s = useProjectStore.getState();
    const naam = verslag.naam || bestand.naam.replace(/\.[^.]*$/, "") || t("graaf.nieuweNaam");
    const doel = id ?? s.voegGraafToe(naam);
    useProjectStore.getState().zetGraaf(doel, verslag.graaf);
    if (verslag.nietOvergenomen.length > 0) {
      alert(t("graaf.import.verslag", {
        overgenomen: verslag.overgenomen,
        niet: verslag.nietOvergenomen.length,
        namen: verslag.nietOvergenomen.slice(0, 12).join(", "),
      }));
    }
  } catch (err) {
    console.error("Grafbestand inlezen mislukt:", err);
    alert(err instanceof GrafBestandFout ? t(`graaf.import.${err.code}`) : t("graaf.import.mislukt", { fout: (err as Error)?.message ?? String(err) }));
  }
}
