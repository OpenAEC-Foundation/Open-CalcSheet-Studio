import { useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { modulesPerTemplate } from "./projectTree";
import { useProjectStore, PROJECT_ID, RAPPORT_ID, type Exemplaar } from "../../store/projectStore";
import { useModuleKiezer } from "../../store/moduleKiezer";
import { useBladBijwerken } from "../../store/bladBijwerken";
import { useBladResultaat } from "../../rekenen/doorrekening";
import { templates } from "../../templates";
import { heeftEigenCode, huidigeModuletekst, isVerouderd, rekenversie } from "./bladVersie";
import { isPdfBlad } from "../../store/pdfBijlage";
import { isSpreadsheetBlad } from "../../store/spreadsheetBlad";
import { isCanvasBlad } from "../../store/canvasBlad";
import { voegLeegSpreadsheetToe, voegWerkmapToe } from "./spreadsheetBlad";
import { isMarkdownBlad } from "../../store/markdownBlad";
import { voegLeegMarkdownToe, voegMarkdownBestandToe } from "./markdownBlad";
import { voegPdfBladToe } from "./pdfBlad";
import Icoon from "../Icoon";
import LibrarySectie from "./LibrarySectie";
import "./ProjectBrowser.css";
import "./BladVersie.css";

/** Een inklapbare sectie van het zijpaneel, zoals in de Blueprint-schil. */
function Sectie({ titel, teller, children }: { titel: string; teller?: number; children: ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="panel-section">
      <button className="panel-section-header" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <svg className={`panel-section-chevron${open ? " open" : ""}`} width="10" height="10" viewBox="0 0 10 10"
          fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="2,3 5,6 8,3" />
        </svg>
        <span className="panel-section-title">{titel}</span>
        {teller !== undefined && <span className="pb-teller">{teller}</span>}
      </button>
      {open && <div className="panel-section-body pb-lijst">{children}</div>}
    </div>
  );
}

/** Pijltje omhoog of omlaag voor het verplaatsen van een blad. */
const Pijl = ({ omhoog }: { omhoog: boolean }) => (
  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points={omhoog ? "2,6.5 5,3.5 8,6.5" : "2,3.5 5,6.5 8,3.5"} />
  </svg>
);

/**
 * De maatgevende UC van een blad als label: groen als het voldoet, rood als
 * het niet voldoet. Alleen als het blad in deze sessie al is doorgerekend.
 */
function UcLabel({ id }: { id: string }) {
  const { t, i18n } = useTranslation("werkruimte");
  const r = useBladResultaat(id);
  if (!r || r.uc === null) return null;
  const voldoet = r.voldoet ?? r.uc <= 1;
  const getal = Number.isFinite(r.uc)
    ? r.uc.toLocaleString(i18n.language, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : "∞";
  return (
    <span className={`pb-uc${voldoet ? " voldoet" : " voldoet-niet"}`}
      title={t(voldoet ? "browser.ucVoldoet" : "browser.ucVoldoetNiet", { uc: getal })}>
      {getal}
    </span>
  );
}

/** Eén rekenblad in het project, met hernoemen en de knopjes ernaast. */
function ExemplaarRij({
  ex,
  geselecteerd,
  metNaamInvoer,
  onNaamKlaar,
}: {
  ex: Exemplaar;
  geselecteerd: boolean;
  /** Net ingevoegd: begin direct in de naamgeef-stand. */
  metNaamInvoer: boolean;
  onNaamKlaar: () => void;
}) {
  const { t } = useTranslation();
  const { t: tw } = useTranslation("werkruimte");
  const selecteer = useProjectStore((s) => s.selecteer);
  const hernoem = useProjectStore((s) => s.hernoem);
  const dupliceer = useProjectStore((s) => s.dupliceer);
  const verwijder = useProjectStore((s) => s.verwijder);
  const verplaats = useProjectStore((s) => s.verplaats);
  const [zelfBewerken, setZelfBewerken] = useState(false);
  const bewerken = zelfBewerken || metNaamInvoer;
  const stopBewerken = () => {
    setZelfBewerken(false);
    onNaamKlaar();
  };

  const info = modulesPerTemplate[ex.templateId];
  // De modulenaam in de taal van de app; het label in de catalogus is Nederlands.
  const moduleNaam = info ? tw(`catalogus.modules.${ex.templateId}`, { defaultValue: info.label }) : "";
  const status = info?.status;
  // Modulestatus en rekenversie in de tooltip, en een eigen aanpassing van de
  // rekentekst; een blad met een nieuwere rekenversie krijgt daarnaast een
  // teken achter zijn naam.
  const verouderd = isVerouderd(ex, templates);
  const eigen = heeftEigenCode(ex);
  const nieuweVersie = verouderd ? rekenversie(huidigeModuletekst(ex, templates) ?? "") : "";
  const versieRegel = [
    status ? t(`bladVersie.status.${status}`) : "",
    `${t("bladVersie.rekenversie")} ${rekenversie(ex.source)}`,
  ].filter(Boolean).join(" · ");
  // De stip is de status van de module (hoe ver de toetsing is), niet de UC.
  // Een PDF-blad heeft geen module en geen rekenversie: een eigen icoon.
  const pdf = isPdfBlad(ex);
  const spreadsheet = isSpreadsheetBlad(ex);
  const markdown = isMarkdownBlad(ex);
  const canvas = isCanvasBlad(ex);
  const stip = pdf
    ? <Icoon id="report.cover" />
    : spreadsheet
    ? <Icoon id="data.table" />
    : markdown
    ? <Icoon id="report.template" />
    : canvas
    ? <Icoon id="report.workspace" uit="calculations" />
    : <span className={`pb-stip${status ? ` pb-status-${status}` : ""}`} aria-hidden="true" />;
  const uitleg = pdf
    ? `${ex.naam}\n${tw("pdf.rij", { bestand: ex.pdf?.bestandsnaam || "—" })}\n${tw("browser.dubbelklik")}`
    : spreadsheet
    ? `${ex.naam}\n${tw("spreadsheet.rij")}\n${tw("browser.dubbelklik")}`
    : markdown
    ? `${ex.naam}\n${tw("markdown.rij")}\n${tw("browser.dubbelklik")}`
    : canvas
    ? `${ex.naam}\n${tw("canvas.rij")}\n${tw("browser.dubbelklik")}`
    : `${ex.naam}${info ? ` — ${moduleNaam}` : ""}\n${versieRegel}` +
      (eigen ? `\n${t("bladVersie.eigenUitleg", { bron: ex.bronVersie })}` : "") +
      (verouderd ? `\n${t("bladVersie.rijVerouderd", { nieuw: nieuweVersie })}` : "") +
      `\n${tw("browser.dubbelklik")}`;

  if (bewerken) {
    return (
      <div className="pb-rij gekozen">
        {stip}
        <input
          className="pb-naam-invoer"
          defaultValue={ex.naam}
          autoFocus
          // Alles geselecteerd, zodat je bij een vers blad meteen "Dak" kunt
          // typen zonder eerst de voorgestelde naam weg te halen.
          onFocus={(e) => e.target.select()}
          onBlur={(e) => {
            const naam = e.target.value.trim();
            if (naam) hernoem(ex.id, naam);
            stopBewerken();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") stopBewerken();
          }}
        />
      </div>
    );
  }

  return (
    <div className={`pb-rij pb-blad${geselecteerd ? " gekozen" : ""}`}>
      <button
        className="pb-open"
        onClick={() => selecteer(ex.id)}
        onDoubleClick={() => setZelfBewerken(true)}
        title={uitleg}
      >
        {stip}
        <span className="pb-naam">{ex.naam}</span>
        {verouderd && <span className="bv-rij-vlag" aria-label={t("bladVersie.melding")}>↻</span>}
        <UcLabel id={ex.id} />
      </button>
      <span className="pb-acties">
        <button title={tw("browser.omhoog")} onClick={() => verplaats(ex.id, -1)}><Pijl omhoog /></button>
        <button title={tw("browser.omlaag")} onClick={() => verplaats(ex.id, 1)}><Pijl omhoog={false} /></button>
        <button title={tw("browser.hernoemen")} onClick={() => setZelfBewerken(true)}><Icoon id="draw.text" uit="calculations" /></button>
        <button title={tw("browser.dupliceren")} onClick={() => dupliceer(ex.id)}><Icoon id="edit.copy" /></button>
        <button
          title={tw("browser.verwijderen")}
          onClick={() => {
            if (confirm(tw("browser.verwijderenVraag", { naam: ex.naam }))) verwijder(ex.id);
          }}
        >
          <Icoon id="edit.delete" uit="calculations" />
        </button>
      </span>
    </div>
  );
}

/** Projectgegevens of rapport: openen, en bij hover een knopje om hem uit de boom te halen. */
function KnoopRij({ id, icoon, naam, uitleg, gekozen, onKies, onVerwijder }: {
  id: string;
  icoon: string;
  naam: string;
  uitleg: string;
  gekozen: boolean;
  onKies: () => void;
  onVerwijder: () => void;
}) {
  const { t: tw } = useTranslation("werkruimte");
  return (
    <div className={`pb-rij pb-blad pb-knoop${gekozen ? " gekozen" : ""}`} data-knoop={id}>
      <button className="pb-open" onClick={onKies} title={uitleg}>
        <Icoon id={icoon} />
        <span className="pb-naam">{naam}</span>
      </button>
      <span className="pb-acties">
        <button title={tw("browser.uitProjectHalen", { naam })} onClick={onVerwijder}>
          <Icoon id="edit.delete" uit="calculations" />
        </button>
      </span>
    </div>
  );
}

/**
 * Het zijpaneel links: het project met zijn gegevens en rapport, en de bladen
 * die erin zitten. Opbouw en opmaak volgen het linkerpaneel van de
 * Blueprint-schil (left-panel en panel-section in App.css).
 */
export default function ProjectBrowser() {
  const [collapsed, setCollapsed] = useState(false);
  // Een vers ingevoegd blad opent meteen met de naam in bewerkstand; zie
  // store/moduleKiezer.ts.
  const nieuwId = useModuleKiezer((s) => s.nieuwId);
  const naamKlaar = useModuleKiezer((s) => s.naamKlaar);
  const openModuleKiezer = useModuleKiezer((s) => s.openen);
  const voegPdfToe = useProjectStore((s) => s.voegPdfToe);
  const voegSpreadsheetToe = useProjectStore((s) => s.voegSpreadsheetToe);
  const voegMarkdownToe = useProjectStore((s) => s.voegMarkdownToe);
  const voegCanvasToe = useProjectStore((s) => s.voegCanvasToe);

  const exemplaren = useProjectStore((s) => s.exemplaren);
  const activeId = useProjectStore((s) => s.activeId);
  const selecteer = useProjectStore((s) => s.selecteer);
  const projectNaam = useProjectStore((s) => s.projectNaam);
  const verborgen = useProjectStore((s) => s.verborgen);
  const zetVerborgen = useProjectStore((s) => s.zetVerborgen);
  /** Een verborgen onderdeel terugzetten en openen. */
  const terug = (onderdeel: "gegevens" | "rapport") => {
    zetVerborgen(onderdeel, false);
    selecteer(onderdeel === "gegevens" ? PROJECT_ID : RAPPORT_ID);
  };
  const { t } = useTranslation();
  const { t: tw } = useTranslation("werkruimte");
  const openBijwerken = useBladBijwerken((s) => s.openen);
  // De bladen waarvan de module intussen een nieuwere rekenversie heeft.
  const verouderd = exemplaren.filter((ex) => isVerouderd(ex, templates));

  if (collapsed) {
    return (
      <aside className="left-panel project-browser ingeklapt">
        <button className="left-panel-collapsed-tab" onClick={() => setCollapsed(false)} title={tw("browser.uitklappen")}>
          <span>{tw("algemeen.project")}</span>
        </button>
      </aside>
    );
  }

  return (
    <aside className="left-panel project-browser">
      <div className="left-panel-toolbar">
        <span className="left-panel-title">{tw("algemeen.project")}</span>
        <button className="left-panel-close-btn" onClick={() => setCollapsed(true)} title={tw("browser.inklappen")}>
          <Icoon id="panel.left" />
        </button>
      </div>

      <div className="left-panel-body">
        {/* Wat bij het hele project hoort en niet bij één blad. */}
        {/* Projectgegevens en rapport kun je uit de boom halen; de inhoud blijft
            bewaard en komt terug met "… toevoegen". */}
        <Sectie titel={projectNaam || tw("algemeen.project")}>
          {!verborgen.gegevens && (
            <KnoopRij
              id={PROJECT_ID}
              icoon="project.properties"
              naam={tw("algemeen.projectgegevens")}
              uitleg={tw("browser.projectgegevensUitleg")}
              gekozen={activeId === PROJECT_ID}
              onKies={() => selecteer(PROJECT_ID)}
              onVerwijder={() => zetVerborgen("gegevens", true)}
            />
          )}
          {!verborgen.rapport && (
            <KnoopRij
              id={RAPPORT_ID}
              icoon="report.generate"
              naam={tw("algemeen.rapport")}
              uitleg={tw("browser.rapportUitleg")}
              gekozen={activeId === RAPPORT_ID}
              onKies={() => selecteer(RAPPORT_ID)}
              onVerwijder={() => zetVerborgen("rapport", true)}
            />
          )}
          {verborgen.gegevens && (
            <button className="pb-rij pb-toevoegen" onClick={() => terug("gegevens")}>
              <Icoon id="project.properties" />
              <span className="pb-naam">{tw("browser.gegevensToevoegen")}</span>
            </button>
          )}
          {verborgen.rapport && (
            <button className="pb-rij pb-toevoegen" onClick={() => terug("rapport")}>
              <Icoon id="report.generate" />
              <span className="pb-naam">{tw("browser.rapportToevoegen")}</span>
            </button>
          )}
        </Sectie>

        <Sectie titel={tw("browser.bladen")} teller={exemplaren.length}>
          {exemplaren.length === 0 && (
            <p className="pb-leeg">
              <Trans t={tw} i18nKey="browser.geenBladen" components={{ b: <b /> }} />
            </p>
          )}

          {exemplaren.map((ex) => (
            <ExemplaarRij
              key={ex.id}
              ex={ex}
              geselecteerd={ex.id === activeId}
              metNaamInvoer={ex.id === nieuwId}
              onNaamKlaar={naamKlaar}
            />
          ))}

          <button className="pb-rij pb-toevoegen" onClick={() => openModuleKiezer()} title={tw("browser.moduleToevoegenUitleg")}>
            <Icoon id="calculation.module-picker" uit="calculations" />
            <span className="pb-naam">{tw("browser.moduleToevoegen")}</span>
          </button>

          {/* Een PDF als blad: komt op zijn plek in hoofdstuk Berekeningen van het rapport. */}
          <button className="pb-rij pb-toevoegen" onClick={() => void voegPdfBladToe(voegPdfToe)} title={tw("pdf.toevoegenUitleg")}>
            <Icoon id="file.import" uit="calculations" />
            <span className="pb-naam">{tw("pdf.toevoegen")}</span>
          </button>

          {/* Een werkmap als blad: nieuw en leeg, of een bestaand XLSX-bestand. */}
          <button className="pb-rij pb-toevoegen" onClick={() => voegLeegSpreadsheetToe(voegSpreadsheetToe)} title={tw("spreadsheet.toevoegenUitleg")}>
            <Icoon id="spreadsheet.sheet-add" uit="calculations" />
            <span className="pb-naam">{tw("spreadsheet.toevoegen")}</span>
          </button>
          <button className="pb-rij pb-toevoegen" onClick={() => void voegWerkmapToe(voegSpreadsheetToe)} title={tw("spreadsheet.importerenUitleg")}>
            <Icoon id="data.table" />
            <span className="pb-naam">{tw("spreadsheet.importeren")}</span>
          </button>

          {/* Een Markdown-tekst als blad: nieuw en leeg, of een bestaand .md-bestand. */}
          <button className="pb-rij pb-toevoegen" onClick={() => voegLeegMarkdownToe(voegMarkdownToe)} title={tw("markdown.toevoegenUitleg")}>
            <Icoon id="report.template" />
            <span className="pb-naam">{tw("markdown.toevoegen")}</span>
          </button>
          <button className="pb-rij pb-toevoegen" onClick={() => void voegMarkdownBestandToe(voegMarkdownToe)} title={tw("markdown.importerenUitleg")}>
            <Icoon id="file.import" uit="calculations" />
            <span className="pb-naam">{tw("markdown.importeren")}</span>
          </button>

          {/* Formules als losse eenheden vrij op een vel. */}
          <button className="pb-rij pb-toevoegen" onClick={() => voegCanvasToe(tw("canvas.nieuweNaam"))} title={tw("canvas.toevoegenUitleg")}>
            <Icoon id="report.workspace" uit="calculations" />
            <span className="pb-naam">{tw("canvas.toevoegen")}</span>
          </button>

          {/* Alleen als er iets bij te werken is; bijwerken gaat altijd via de vergelijking. */}
          {verouderd.length > 0 && (
            <button className="pb-rij pb-toevoegen"
              onClick={() => openBijwerken(verouderd.map((ex) => ex.id))}
              title={t("bladVersie.alleUitleg")}>
              <Icoon id="calculation.recalculate" uit="calculations" />
              <span className="pb-naam">{t("bladVersie.alle")}</span>
              <span className="pb-teller">{verouderd.length}</span>
            </button>
          )}
        </Sectie>
      </div>

      {/* Onder de bladen, met een eigen schuifbalk: de lijst drukt ze niet weg. */}
      <LibrarySectie />
    </aside>
  );
}
