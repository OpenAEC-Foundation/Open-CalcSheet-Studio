import { useMemo } from "react";
import type { Exemplaar } from "../../store/projectStore";
import { marimoNaarHtml } from "../../store/marimoBlad";
import type { Maten } from "./paginering";
import { papier } from "./pdfBlad";
import { UitwerkingHtml } from "./UitwerkingHtml";
import "./JupyterBlad.css";

/*
 * Een Marimo-blad op papier: per cel de code en de laatste uitvoer, zoals de app die bij het
 * bewaren heeft meegenomen. De kernel komt er niet aan te pas: dit rekent niets uit, en
 * een schuif staat op papier als zijn laatste waarde.
 */
export function MarimoPapier({ ex }: { ex: Exemplaar; maten: Maten }) {
  const t = papier();
  const html = useMemo(() => (ex.marimo ? marimoNaarHtml(ex.marimo) : ""), [ex.marimo]);
  if (!ex.marimo) return <p className="print-pdf-melding">{t("marimoBlad.ontbreekt")}</p>;
  const gedraaid = ex.marimo.uitvoer.some((u) => u.trim());
  return (
    <div className="rpa-vlak print-jupyter">
      {!gedraaid && <p className="print-pdf-melding">{t("marimoBlad.nogNietGedraaid")}</p>}
      <UitwerkingHtml html={html} bladId={ex.id} />
    </div>
  );
}
