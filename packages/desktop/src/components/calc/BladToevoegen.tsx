import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProjectStore } from "../../store/projectStore";
import { useModuleKiezer } from "../../store/moduleKiezer";
import { voegLeegSpreadsheetToe, voegWerkmapToe } from "./spreadsheetBlad";
import { voegLeegMarkdownToe, voegMarkdownBestandToe } from "./markdownBlad";
import { voegLeegGrafbladToe } from "../graaf/leegGrafblad";
import { voegLeegJupyterToe, voegNotebookToe } from "./jupyterBlad";
import { voegLeegMarimoToe, voegMarimoBestandToe } from "./marimoBlad";
import { voegPdfBladToe } from "./pdfBlad";
import { Uitklap } from "../ribbon/Uitklap";
import Icoon from "../Icoon";

/**
 * Eén knop onder de bladen, met daarachter alle soorten: nieuw of uit een bestand. In het
 * lint staan ze wel los naast elkaar.
 */

interface Keuze {
  naam: string;
  uitleg: string;
  icoon: string;
  uit?: "calculations";
  actie: () => void;
}

function Kolom({ kop, keuzes, onKies }: { kop: string; keuzes: Keuze[]; onKies: (k: Keuze) => void }) {
  return (
    <section className="rekentaal-menu-sectie">
      <div className="rekentaal-menu-kop">{kop}</div>
      {keuzes.map((k) => (
        <button key={k.naam} type="button" role="menuitem" className="rekentaal-menu-rij" title={k.uitleg} onClick={() => onKies(k)}>
          <Icoon id={k.icoon} uit={k.uit} />
          <span>{k.naam}</span>
        </button>
      ))}
    </section>
  );
}

export default function BladToevoegen() {
  const { t: tw } = useTranslation("werkruimte");
  const anker = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const openModuleKiezer = useModuleKiezer((s) => s.openen);
  const voegTekenbladToe = useModuleKiezer((s) => s.voegTekenbladToe);
  const voegLeegBladToe = useModuleKiezer((s) => s.voegLeegBladToe);
  const voegPdfToe = useProjectStore((s) => s.voegPdfToe);
  const voegSpreadsheetToe = useProjectStore((s) => s.voegSpreadsheetToe);
  const voegMarkdownToe = useProjectStore((s) => s.voegMarkdownToe);
  const voegCanvasToe = useProjectStore((s) => s.voegCanvasToe);
  const voegJupyterToe = useProjectStore((s) => s.voegJupyterToe);
  const voegMarimoToe = useProjectStore((s) => s.voegMarimoToe);

  const nieuw: Keuze[] = [
    { naam: tw("browser.toevoegen.module"), uitleg: tw("browser.moduleToevoegenUitleg"), icoon: "calculation.module-picker", uit: "calculations", actie: () => openModuleKiezer() },
    { naam: tw("browser.toevoegen.leeg"), uitleg: tw("browser.toevoegen.leegUitleg"), icoon: "file.new", actie: voegLeegBladToe },
    { naam: tw("browser.toevoegen.spreadsheet"), uitleg: tw("spreadsheet.toevoegenUitleg"), icoon: "spreadsheet.sheet-add", uit: "calculations", actie: () => voegLeegSpreadsheetToe(voegSpreadsheetToe) },
    { naam: tw("browser.toevoegen.canvas"), uitleg: tw("canvas.toevoegenUitleg"), icoon: "report.workspace", uit: "calculations", actie: () => voegCanvasToe(tw("canvas.nieuweNaam")) },
    { naam: tw("browser.toevoegen.graaf"), uitleg: tw("graaf.toevoegenUitleg"), icoon: "panel.model-tree", actie: voegLeegGrafbladToe },
    { naam: tw("browser.toevoegen.tekening"), uitleg: tw("browser.toevoegen.tekeningUitleg"), icoon: "draw.freehand", actie: () => voegTekenbladToe(tw("kiezer.leeg.tekening"), tw("tekenblad.viewNaam", { n: 1 })) },
    { naam: tw("browser.toevoegen.jupyter"), uitleg: tw("jupyter.toevoegenUitleg"), icoon: "file.structure", uit: "calculations", actie: () => voegLeegJupyterToe(voegJupyterToe) },
    { naam: tw("browser.toevoegen.marimo"), uitleg: tw("marimo.toevoegenUitleg"), icoon: "data.chart", actie: () => voegLeegMarimoToe(voegMarimoToe) },
    { naam: tw("browser.toevoegen.markdown"), uitleg: tw("markdown.toevoegenUitleg"), icoon: "report.template", actie: () => voegLeegMarkdownToe(voegMarkdownToe) },
  ];
  const uitBestand: Keuze[] = [
    { naam: tw("browser.toevoegen.pdf"), uitleg: tw("pdf.toevoegenUitleg"), icoon: "file.import", uit: "calculations", actie: () => void voegPdfBladToe(voegPdfToe) },
    { naam: tw("browser.toevoegen.xlsx"), uitleg: tw("spreadsheet.importerenUitleg"), icoon: "data.table", actie: () => void voegWerkmapToe(voegSpreadsheetToe) },
    { naam: tw("browser.toevoegen.markdownBestand"), uitleg: tw("markdown.importerenUitleg"), icoon: "report.template", actie: () => void voegMarkdownBestandToe(voegMarkdownToe) },
    { naam: tw("browser.toevoegen.grafBestand"), uitleg: tw("graaf.importerenUitleg"), icoon: "panel.model-tree", actie: () => void import("../graaf/grafbladToevoegen").then((m) => m.leesGrafBestandIn()) },
    { naam: tw("browser.toevoegen.notebook"), uitleg: tw("jupyter.importerenUitleg"), icoon: "file.structure", uit: "calculations", actie: () => void voegNotebookToe(voegJupyterToe) },
    { naam: tw("browser.toevoegen.marimoBestand"), uitleg: tw("marimo.importerenUitleg"), icoon: "data.chart", actie: () => void voegMarimoBestandToe(voegMarimoToe) },
  ];

  const kies = (k: Keuze) => {
    setOpen(false);
    k.actie();
  };

  return (
    <div className="pb-blad-toevoegen" ref={anker}>
      <button type="button" className="pb-rij pb-toevoegen" aria-haspopup="menu" aria-expanded={open}
        title={tw("browser.toevoegen.uitleg")} onClick={() => setOpen((o) => !o)}>
        <svg className="pb-plus" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M7 2v10M2 7h10" />
        </svg>
        <span className="pb-naam">{tw("browser.toevoegen.knop")}</span>
      </button>
      {open && anker.current && (
        <Uitklap anker={anker.current} onSluit={() => setOpen(false)} className="rekentaal-menu">
          <Kolom kop={tw("browser.toevoegen.nieuw")} keuzes={nieuw} onKies={kies} />
          <Kolom kop={tw("browser.toevoegen.bestand")} keuzes={uitBestand} onKies={kies} />
        </Uitklap>
      )}
    </div>
  );
}
