import { useTranslation } from "react-i18next";
import { STELSELS, projectEenheidFouten, type Grootheid } from "@ifc-calc/core";
import { useProjectStore } from "../../store/projectStore";
import {
  GROOTHEID_KEUZES,
  eigenStelselVan,
  ruweEigenEenheden,
  stelselKeuzeVan,
  type EigenEenheid,
} from "../../store/projectEenheden";

/** Een eenheid zoals de rekenkern hem schrijft, netjes in beeld: kN / m^2 → kN/m², kip ft → kip·ft. */
export function eenheidInBeeld(e: string): string {
  return e
    .replace(/\s*\/\s*/g, "/")
    .replace(/\^2/g, "²")
    .replace(/\^3/g, "³")
    .replace(/\^4/g, "⁴")
    .replace(/ /g, "·");
}

/**
 * Onder het keuzeveld voor het eenhedenstelsel in de projectgegevens: bij "eigen" de
 * eenheid per grootheid, en altijd de eigen eenheden van het project. Alles staat in de
 * projectgegevens (store/projectEenheden.ts), dus ongedaan maken en opslaan werken vanzelf.
 */
export default function EenhedenEditor() {
  const { t } = useTranslation("werkruimte");
  const gegevens = useProjectStore((s) => s.gegevens);
  const zetGegeven = useProjectStore((s) => s.zetGegeven);
  const keuze = stelselKeuzeVan(gegevens);
  const eigen = { ...STELSELS["si-mm"], ...eigenStelselVan(gegevens) };
  // De ruwe lijst: ook een regel die nog wordt ingevuld, blijft staan.
  const ruw = ruweEigenEenheden(gegevens);
  // De meldingen per regel; de store werkt ze bij zodra de lijst verandert (projectStore.ts).
  const fouten = projectEenheidFouten();

  const zetEigen = (g: Grootheid, eenheid: string) =>
    zetGegeven("eenheden_eigen", JSON.stringify({ ...eigenStelselVan(gegevens), [g]: eenheid }));
  const zetLijst = (nieuw: EigenEenheid[]) => zetGegeven("eenheden_lijst", JSON.stringify(nieuw));

  return (
    <div className="pg-eenheden">
      {keuze === "eigen" && (
        <div className="pg-eenheden-eigen">
          {(Object.keys(GROOTHEID_KEUZES) as Grootheid[]).map((g) => (
            <label className="pg-veld pg-veld-smal" key={g}>
              <span className="pg-label">{t(`gegevens.eenheden.grootheden.${g}`)}</span>
              <select value={eigen[g]} onChange={(e) => zetEigen(g, e.target.value)}>
                {GROOTHEID_KEUZES[g].map((e) => (
                  <option key={e} value={e}>{eenheidInBeeld(e)}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      )}
      <div className="pg-eenheden-lijst">
        <span className="pg-label">{t("gegevens.eenheden.eigenEenheden")}</span>
        <span className="pg-hint">{t("gegevens.eenheden.eigenEenhedenHint")}</span>
        {ruw.map((r, i) => (
          <div className="pg-eenheid-rij" key={i}>
            <input
              type="text"
              aria-label={t("gegevens.eenheden.naam")}
              placeholder={t("gegevens.eenheden.naamVoorbeeld")}
              value={r.naam}
              onChange={(e) => zetLijst(ruw.map((x, j) => (j === i ? { ...x, naam: e.target.value } : x)))}
            />
            <span>=</span>
            <input
              type="text"
              aria-label={t("gegevens.eenheden.uitdrukking")}
              placeholder={t("gegevens.eenheden.uitdrukkingVoorbeeld")}
              value={r.uitdrukking}
              onChange={(e) => zetLijst(ruw.map((x, j) => (j === i ? { ...x, uitdrukking: e.target.value } : x)))}
            />
            <button type="button" onClick={() => zetLijst(ruw.filter((_, j) => j !== i))}>
              {t("gegevens.eenheden.verwijder")}
            </button>
            {fouten.has(i) && <span className="pg-eenheid-fout">{fouten.get(i)!.replace(/^Error:\s*/, "")}</span>}
          </div>
        ))}
        <button type="button" className="pg-eenheid-erbij" onClick={() => zetLijst([...ruw, { naam: "", uitdrukking: "" }])}>
          {t("gegevens.eenheden.erbij")}
        </button>
      </div>
    </div>
  );
}
