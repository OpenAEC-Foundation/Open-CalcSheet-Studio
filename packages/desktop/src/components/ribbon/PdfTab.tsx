import { useTranslation } from "react-i18next";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import { b2 } from "./calcIcons";
import { usePdfViewer } from "../../store/pdfViewer";
import { DIKTEN, GEREEDSCHAP, KLEUREN, type PdfGereedschap } from "../../store/pdfAantekeningen";
import "./PdfTab.css";

const ICOON: Record<PdfGereedschap, string> = {
  kies: b2("edit.select", "pdf"),
  pen: b2("draw.freehand", "pdf"),
  markeer: b2("annotate.highlight", "pdf"),
  tekst: b2("draw.text", "pdf"),
  pijl: b2("draw.arrow", "pdf"),
  kader: b2("draw.rectangle", "pdf"),
  wolk: b2("draw.cloud", "pdf"),
};

/** Het lint van een PDF-blad: bladeren, zoomen en aantekenen (PdfBladWeergave.tsx). */
export default function PdfTab() {
  const { t } = useTranslation("ribbon");
  const stand = usePdfViewer();
  const o = stand.opdrachten;
  const zet = usePdfViewer.setState;
  return (
    <>
      <RibbonGroup label={t("pdf.groep.pagina")}>
        <RibbonButton icon={b2("nav.back", "pdf")} label={t("pdf.vorige")} size="large" disabled={!o || stand.pagina <= 0} onClick={() => o?.naarPagina(stand.pagina - 1)} />
        <div className="pdf-lint-pagina">
          <input
            type="number"
            min={1}
            max={Math.max(1, stand.aantal)}
            aria-label={t("pdf.paginaVeld")}
            key={stand.pagina}
            defaultValue={stand.pagina + 1}
            onKeyDown={(e) => {
              if (e.key === "Enter") o?.naarPagina(Math.round(Number(e.currentTarget.value)) - 1);
            }}
          />
          <span>/ {stand.aantal}</span>
        </div>
        <RibbonButton icon={b2("nav.forward", "pdf")} label={t("pdf.volgende")} size="large" disabled={!o || stand.pagina >= stand.aantal - 1} onClick={() => o?.naarPagina(stand.pagina + 1)} />
      </RibbonGroup>

      <RibbonGroup label={t("pdf.groep.zoom")}>
        <RibbonButton icon={b2("view.zoom-out", "pdf")} label={t("pdf.zoomUit")} size="large" disabled={!o} onClick={() => o?.zoomUit()} />
        <span className="pdf-lint-zoom" title={t("pdf.zoomUitleg")}>{Math.round(stand.procent)} %</span>
        <RibbonButton icon={b2("view.zoom-in", "pdf")} label={t("pdf.zoomIn")} size="large" disabled={!o} onClick={() => o?.zoomIn()} />
        <RibbonButton icon={b2("view.fit-width", "pdf")} label={t("pdf.breedte")} size="large" active={stand.zoomModus === "breedte"} disabled={!o} onClick={() => o?.passendBreedte()} />
        <RibbonButton icon={b2("view.fit-page", "pdf")} label={t("pdf.helePagina")} size="large" active={stand.zoomModus === "pagina"} disabled={!o} onClick={() => o?.passendPagina()} />
      </RibbonGroup>

      <RibbonGroup label={t("pdf.groep.aantekenen")}>
        {GEREEDSCHAP.map((g) => (
          <RibbonButton
            key={g}
            icon={ICOON[g]}
            label={t(`pdf.gereedschap.${g}`)}
            title={t(`pdf.uitleg.${g}`)}
            size="large"
            active={stand.gereedschap === g}
            onClick={() => zet({ gereedschap: g })}
          />
        ))}
      </RibbonGroup>

      <RibbonGroup label={t("pdf.groep.stijl")}>
        <div className="pdf-lint-stijl">
          <div className="pdf-lint-rij" role="group" aria-label={t("pdf.kleur")}>
            {KLEUREN.map((k) => (
              <button
                key={k}
                type="button"
                className={`pdf-lint-kleur${stand.kleur === k ? " actief" : ""}`}
                style={{ background: k }}
                title={t("pdf.kleur")}
                aria-pressed={stand.kleur === k}
                onClick={() => zet({ kleur: k })}
              />
            ))}
          </div>
          <div className="pdf-lint-rij" role="group" aria-label={t("pdf.dikte")}>
            {DIKTEN.map((d) => (
              <button
                key={d}
                type="button"
                className={`pdf-lint-dikte${stand.dikte === d ? " actief" : ""}`}
                title={t("pdf.dikte")}
                aria-pressed={stand.dikte === d}
                onClick={() => zet({ dikte: d })}
              >
                <span style={{ height: `${d}px` }} />
              </button>
            ))}
          </div>
        </div>
      </RibbonGroup>

      <RibbonGroup label={t("pdf.groep.bewerken")}>
        <RibbonButton icon={b2("edit.delete", "pdf")} label={t("pdf.verwijderen")} size="large" disabled={!stand.heeftKeuze} onClick={() => o?.verwijderKeuze()} />
        <RibbonButton icon={b2("annotate.clear-all", "pdf")} label={t("pdf.allesWissen")} size="large" disabled={!stand.heeftAantekeningen} onClick={() => o?.allesWissen()} />
        <RibbonButton icon={b2("annotate.printable", "pdf")} label={t("pdf.opPapier")} title={t("pdf.opPapierUitleg")} size="large" active={stand.opPapier} disabled={!o} onClick={() => o?.zetOpPapier(!stand.opPapier)} />
      </RibbonGroup>
    </>
  );
}
