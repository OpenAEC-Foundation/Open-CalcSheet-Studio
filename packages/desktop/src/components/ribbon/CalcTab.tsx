import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { openSearchPanel } from "@codemirror/search";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import RibbonButtonStack from "./RibbonButtonStack";
import {
  projectIcon,
  settingsIcon,
  helpIcon,
  startIcon,
  aboutIcon,
  undoIcon,
  redoIcon,
  previewIcon,
  printSheetIcon,
  reportIcon,
  moduleIcon,
  pasteIcon,
  cutIcon,
  copyIcon,
  searchIcon,
  blankSheetIcon,
} from "./calcIcons";
import { useProjectStore, PROJECT_ID, RAPPORT_ID } from "../../store/projectStore";
import { usePrintStore } from "../../store/printStore";
import { useModuleKiezer } from "../../store/moduleKiezer";
import { useEditorViewStore } from "../../store/editorViewStore";

interface CalcTabProps {
  /** Opent de instellingen, eventueel op een bepaalde tab ("about"). */
  onSettingsClick?: (tab?: string) => void;
  onHelpClick?: () => void;
  onWelkomClick?: () => void;
}

/** Het sjabloon-id van een blad dat leeg begint; het hoort bij geen module. */
const LEEG_BLAD = "leeg";

/**
 * Start: wat je bij het rekenen het meest nodig hebt. Nieuw, Openen en
 * Opslaan staan onder Bestand en in de titelbalk; de rekentaal staat in de
 * eigen tabs die verschijnen als de code in beeld is.
 */
export default function CalcTab({ onSettingsClick, onHelpClick, onWelkomClick }: CalcTabProps) {
  const { t } = useTranslation("ribbon");
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const ongedaan = useProjectStore((s) => s.ongedaan);
  const opnieuw = useProjectStore((s) => s.opnieuw);
  const kanOngedaan = useProjectStore((s) => s.verleden.length > 0);
  const kanOpnieuw = useProjectStore((s) => s.toekomst.length > 0);
  const afdrukken = usePrintStore((s) => s.afdrukken);
  const toonVoorbeeld = usePrintStore((s) => s.toonVoorbeeld);
  const activeId = useProjectStore((s) => s.activeId);
  const openModuleKiezer = useModuleKiezer((s) => s.openen);
  const view = useEditorViewStore((s) => s.view);

  // Klembord en zoeken werken op de code in de editor.
  const kopieer = useCallback(async (knip: boolean) => {
    if (!view) return;
    const { from, to } = view.state.selection.main;
    if (from === to) return;
    await navigator.clipboard.writeText(view.state.sliceDoc(from, to));
    if (knip) view.dispatch({ changes: { from, to, insert: "" }, userEvent: "delete.cut" });
    view.focus();
  }, [view]);

  const plak = useCallback(async () => {
    if (!view) return;
    const tekst = await navigator.clipboard.readText();
    const { from, to } = view.state.selection.main;
    view.dispatch({
      changes: { from, to, insert: tekst },
      selection: { anchor: from + tekst.length },
      userEvent: "input.paste",
      scrollIntoView: true,
    });
    view.focus();
  }, [view]);

  const zoek = useCallback(() => {
    if (view) openSearchPanel(view);
  }, [view]);

  /** Een leeg blad om zelf een berekening in te schrijven. */
  const leegBlad = useCallback(() => {
    const id = useProjectStore.getState().voegToe(LEEG_BLAD, "Blad", "\"Nieuw blad\n\n");
    // Net als bij een module: het blad staat meteen in de naamgeefstand.
    useModuleKiezer.setState({ nieuwId: id });
  }, []);

  /**
   * Afdrukken via de browser, niet via de rapportengine.
   *
   * `documentToReport` (de weg naar de Rust-engine) slaat svg- en image-knopen
   * over, dus daar komt geen enkele tekening uit. Bovendien is die engine een
   * pad-afhankelijkheid naar de `openaec-reports`-repo; zonder die repo is de
   * app niet eens te bouwen. Deze weg print exact wat de uitwerking toont —
   * formules, tekeningen en afbeeldingen — en in de printdialoog kies je
   * "Opslaan als PDF". Zie docs/backlog.md.
   *
   * Ook zonder rekenbladen: dan is het rapport een uitgangspuntendocument,
   * zonder hoofdstuk Berekeningen en zonder bijlage A (rapport/opzet.ts).
   */
  const handlePrint = useCallback(() => {
    // Het hele project is het rapport: voorblad, hoofdstukken en bijlage A.
    afdrukken(null, "rapport");
  }, [afdrukken]);

  /** Alleen de berekening die openstaat, als losse uitdraai met een titelblok. */
  const bladOpen = exemplaren.some((e) => e.id === activeId);
  const handlePrintBlad = useCallback(() => {
    if (!useProjectStore.getState().exemplaren.some((e) => e.id === activeId)) {
      alert(t("werkruimte:bestand.eerstBladOpenen"));
      return;
    }
    afdrukken([activeId], "bladen");
  }, [afdrukken, activeId, t]);

  const handleVoorbeeld = useCallback(() => {
    // Het voorbeeld van het project is het rapportvoorbeeld, bij de knoop Rapport;
    // net als bij afdrukken ook zonder rekenbladen.
    useProjectStore.getState().zetVerborgen("rapport", false);
    useProjectStore.getState().selecteer(RAPPORT_ID);
    toonVoorbeeld(null, "rapport");
  }, [toonVoorbeeld]);

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        <RibbonGroup label={t("calc.general")}>
          <RibbonButton
            icon={projectIcon}
            label={t("calc.project")}
            size="large"
            onClick={() => {
              const s = useProjectStore.getState();
              s.zetVerborgen("gegevens", false);
              s.selecteer(PROJECT_ID);
            }}
          />
          <RibbonButton icon={settingsIcon} label={t("calc.settings")} size="large" onClick={() => onSettingsClick?.()} />
        </RibbonGroup>

        <RibbonGroup label={t("calc.clipboard", "Klembord")}>
          <RibbonButton icon={pasteIcon} label={t("calc.paste", "Plakken")} size="large" disabled={!view} onClick={plak} />
          <RibbonButtonStack>
            <RibbonButton icon={cutIcon} label={t("calc.cut", "Knippen")} size="small" disabled={!view} onClick={() => kopieer(true)} />
            <RibbonButton icon={copyIcon} label={t("calc.copy", "Kopiëren")} size="small" disabled={!view} onClick={() => kopieer(false)} />
          </RibbonButtonStack>
        </RibbonGroup>

        <RibbonGroup label={t("calc.edit", "Bewerken")}>
          <RibbonButtonStack>
            <RibbonButton
              icon={undoIcon}
              label={t("calc.undo", "Ongedaan")}
              size="small"
              disabled={!kanOngedaan}
              onClick={ongedaan}
            />
            <RibbonButton
              icon={redoIcon}
              label={t("calc.redo", "Opnieuw")}
              size="small"
              disabled={!kanOpnieuw}
              onClick={opnieuw}
            />
            <RibbonButton icon={searchIcon} label={t("calc.find", "Zoeken")} size="small" disabled={!view} onClick={zoek} />
          </RibbonButtonStack>
        </RibbonGroup>

        <RibbonGroup label={t("calc.sheets", "Bladen")}>
          <RibbonButton icon={moduleIcon} label={t("calc.module", "Module")} size="large" onClick={() => openModuleKiezer()} />
          <RibbonButton icon={blankSheetIcon} label={t("calc.blankSheet", "Leeg blad")} size="large" onClick={leegBlad} />
        </RibbonGroup>

        <RibbonGroup label={t("calc.output", "Uitvoer")}>
          <RibbonButton
            icon={previewIcon}
            label={t("calc.preview", "Voorbeeld")}
            size="large"
            onClick={handleVoorbeeld}
          />
          <RibbonButton
            icon={printSheetIcon}
            label={t("calc.pdfSheet", "PDF blad")}
            size="large"
            disabled={!bladOpen}
            onClick={handlePrintBlad}
          />
          <RibbonButton
            icon={reportIcon}
            label={t("calc.report")}
            size="large"
            onClick={handlePrint}
          />
        </RibbonGroup>

        <RibbonGroup label={t("calc.help")}>
          <RibbonButton icon={startIcon} label={t("calc.start")} size="large" onClick={() => onWelkomClick?.()} />
          <RibbonButton icon={helpIcon} label={t("calc.helpButton")} size="large" onClick={() => onHelpClick?.()} />
          <RibbonButton icon={aboutIcon} label={t("calc.about")} size="large" onClick={() => onSettingsClick?.("about")} />
        </RibbonGroup>
      </div>
    </div>
  );
}
