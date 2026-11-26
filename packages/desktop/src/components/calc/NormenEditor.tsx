import { useTranslation } from "react-i18next";
import { useProjectStore } from "../../store/projectStore";
import {
  NORMEN_SLEUTEL,
  NORM_ONDERWERPEN,
  normenTekst,
  normenUitBladen,
  normenVan,
  type NormOnderwerp,
  type ProjectNorm,
} from "../../store/projectNormen";

/**
 * De normen van het project in de projectgegevens: per norm de editie en de nationale
 * bijlage (store/projectNormen.ts). Ze staan op het voorblad en in de kop van elk blad dat
 * zo'n norm noemt. "Uit de bladen" zet de Eurocodes die de bladen noemen erbij, zonder
 * editie: die kiest de constructeur.
 */
export default function NormenEditor() {
  const { t } = useTranslation("werkruimte");
  const gegevens = useProjectStore((s) => s.gegevens);
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const zetGegeven = useProjectStore((s) => s.zetGegeven);
  const lijst = normenVan(gegevens);
  const zet = (nieuw: ProjectNorm[]) => zetGegeven(NORMEN_SLEUTEL, normenTekst(nieuw));
  const wijzig = (i: number, deel: Partial<ProjectNorm>) => zet(lijst.map((r, j) => (j === i ? { ...r, ...deel } : r)));
  const uitBladen = normenUitBladen(lijst, exemplaren.map((e) => e.source));

  return (
    <div className="pg-normen-editor">
      <p className="pg-hint">{t("gegevens.normen.uitleg")}</p>
      {lijst.length > 0 && (
        <table className="pg-normen-tabel">
          <thead>
            <tr>
              <th>{t("gegevens.normen.onderwerp")}</th>
              <th>{t("gegevens.normen.norm")}</th>
              <th>{t("gegevens.normen.editie")}</th>
              <th>{t("gegevens.normen.nb")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lijst.map((r, i) => (
              <tr key={i}>
                <td>
                  <select
                    aria-label={t("gegevens.normen.onderwerp")}
                    value={r.onderwerp}
                    onChange={(e) => wijzig(i, { onderwerp: e.target.value as NormOnderwerp })}
                  >
                    {NORM_ONDERWERPEN.map((o) => (
                      <option key={o} value={o}>{t(`gegevens.normen.onderwerpen.${o}`)}</option>
                    ))}
                  </select>
                </td>
                <td>
                  <input type="text" aria-label={t("gegevens.normen.norm")} placeholder={t("gegevens.normen.normVoorbeeld")}
                    value={r.norm} onChange={(e) => wijzig(i, { norm: e.target.value })} />
                </td>
                <td>
                  <input type="text" aria-label={t("gegevens.normen.editie")} placeholder={t("gegevens.normen.editieVoorbeeld")}
                    value={r.editie} onChange={(e) => wijzig(i, { editie: e.target.value })} />
                </td>
                <td>
                  <input type="text" aria-label={t("gegevens.normen.nb")} placeholder={t("gegevens.normen.nbVoorbeeld")}
                    value={r.nb} onChange={(e) => wijzig(i, { nb: e.target.value })} />
                </td>
                <td>
                  <button type="button" onClick={() => zet(lijst.filter((_, j) => j !== i))}>{t("gegevens.normen.verwijder")}</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {lijst.length === 0 && <p className="pg-hint pg-normen-leeg">{t("gegevens.normen.leeg")}</p>}
      <div className="pg-normen-knoppen">
        <button type="button" onClick={() => zet([...lijst, { onderwerp: "overig", norm: "", editie: "", nb: "" }])}>
          {t("gegevens.normen.erbij")}
        </button>
        <button type="button" disabled={uitBladen.length === 0} onClick={() => zet([...lijst, ...uitBladen])}
          title={uitBladen.length === 0 ? t("gegevens.normen.uitBladenGeen") : undefined}>
          {t("gegevens.normen.uitBladen", { count: uitBladen.length })}
        </button>
      </div>
    </div>
  );
}
