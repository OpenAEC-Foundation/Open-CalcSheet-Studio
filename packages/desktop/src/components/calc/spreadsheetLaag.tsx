import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { defineXlsxPlugin, type XlsxPlugin, type XlsxPluginContext, type XlsxPluginGeometry, type XlsxPluginSelection } from "@betteroffice/xlsx-react";
import { useSpreadsheetEditor } from "../../store/spreadsheetEditor";
import { openFormuleVeld } from "./spreadsheetAanwijzen";
import { bereikTussen, doelBereik, richtingNaar, type Bereik, type VulRichting } from "./spreadsheetLogica";
import { uitvoeren, vul, vulTotEinde } from "./spreadsheetOpdrachten";

/*
 * De eigen laag boven het raster, als plugin van de editor: de kaders van de
 * verwijzingen in een open formule (spreadsheetAanwijzen.ts), het kader om wat op
 * het klembord staat en de vulgreep. De plugin houdt ook de selectie bij in de store,
 * voor het lint en de sneltoetsen.
 */

function meldSelectie(selectie: XlsxPluginSelection): void {
  if (!selectie) {
    useSpreadsheetEditor.setState({ bereik: null, focus: null });
    return;
  }
  const cellen = selectie.cells;
  useSpreadsheetEditor.setState({
    blad: selectie.sheetIndex,
    sheetId: selectie.sheetId,
    bereik: cellen ? (cellen.range ?? bereikTussen(cellen.anchor, cellen.focus)) : null,
    focus: cellen ? { row: cellen.focus.row, col: cellen.focus.col } : null,
  });
}

function Vulgreep({ bereik, sheetId, geometry }: { bereik: Bereik; sheetId: string; geometry: XlsxPluginGeometry }) {
  const { t } = useTranslation("werkruimte");
  const api = useSpreadsheetEditor((s) => s.api);
  const [voorbeeld, setVoorbeeld] = useState<{ doel: Bereik; richting: VulRichting } | null>(null);
  const hoek = geometry.getCellRect({ sheetId, row: bereik.bottom, col: bereik.right });
  if (!api || !hoek) return null;

  const begin = (e: ReactPointerEvent<HTMLDivElement>) => {
    // Terwijl een formule openstaat is een klik hier een cel aanwijzen.
    if (e.button !== 0 || openFormuleVeld()) return;
    e.preventDefault();
    e.stopPropagation();
    const element = e.currentTarget;
    const raster = element.closest<HTMLElement>('[data-testid="xlsx-scroll"]');
    if (!raster) return;
    element.setPointerCapture(e.pointerId);
    let laatste = { x: e.clientX, y: e.clientY };
    let doel: { doel: Bereik; richting: VulRichting } | null = null;
    let rol = 0;
    const werk = () => {
      const vak = raster.getBoundingClientRect();
      const cel = api.getPositionAtPoint(
        Math.min(Math.max(laatste.x, vak.left + 1), vak.left + raster.clientWidth - 2),
        Math.min(Math.max(laatste.y, vak.top + 1), vak.top + raster.clientHeight - 2),
      );
      if (!cel) return;
      const r = richtingNaar(bereik, cel);
      doel = r ? { doel: doelBereik(bereik, r.richting, r.aantal), richting: r.richting } : null;
      setVoorbeeld(doel);
    };
    const schuif = () => {
      rol = 0;
      const vak = raster.getBoundingClientRect();
      const dx = laatste.x > vak.right - 8 ? 24 : laatste.x < vak.left + 8 ? -24 : 0;
      const dy = laatste.y > vak.bottom - 8 ? 24 : laatste.y < vak.top + 8 ? -24 : 0;
      if (dx || dy) {
        raster.scrollBy(dx, dy);
        werk();
        rol = requestAnimationFrame(schuif);
      }
    };
    const beweeg = (m: PointerEvent) => {
      laatste = { x: m.clientX, y: m.clientY };
      werk();
      if (!rol) rol = requestAnimationFrame(schuif);
    };
    const los = () => {
      cancelAnimationFrame(rol);
      element.removeEventListener("pointermove", beweeg);
      element.removeEventListener("pointerup", los);
      element.removeEventListener("pointercancel", los);
      setVoorbeeld(null);
      if (doel) {
        const { doel: naar, richting } = doel;
        uitvoeren(() => vul(bereik, naar, richting, true));
      }
    };
    element.addEventListener("pointermove", beweeg);
    element.addEventListener("pointerup", los);
    element.addEventListener("pointercancel", los);
  };

  const vak = voorbeeld
    ? geometry.getRangeRect({ sheetId, range: bereikTussen({ row: Math.min(bereik.top, voorbeeld.doel.top), col: Math.min(bereik.left, voorbeeld.doel.left) }, { row: Math.max(bereik.bottom, voorbeeld.doel.bottom), col: Math.max(bereik.right, voorbeeld.doel.right) }) })
    : null;

  return (
    <>
      <div
        className="spreadsheet-vulgreep"
        title={t("spreadsheet.vulgreep")}
        style={{ left: hoek.x + hoek.width - 4, top: hoek.y + hoek.height - 4 }}
        onPointerDown={begin}
        onDoubleClick={(e) => {
          e.stopPropagation();
          uitvoeren(() => vulTotEinde(bereik));
        }}
      />
      {vak && <div className="spreadsheet-vulvoorbeeld" style={{ left: vak.x, top: vak.y, width: vak.width, height: vak.height }} />}
    </>
  );
}

function Laag({ context, geometry }: { context: XlsxPluginContext<null>; geometry: XlsxPluginGeometry }) {
  const markeringen = useSpreadsheetEditor((s) => s.markeringen);
  const kopie = useSpreadsheetEditor((s) => s.kopie);
  const bereik = useSpreadsheetEditor((s) => s.bereik);
  const api = useSpreadsheetEditor((s) => s.api);
  const sheetId = geometry.layout.sheetId;
  const naam = api ? (() => {
    const info = api.handle.sheetInfo();
    return info.sheetNames[info.sheetIds.indexOf(sheetId)]?.toLowerCase();
  })() : undefined;
  const kader = kopie?.sheetId === sheetId ? geometry.getRangeRect({ sheetId, range: kopie.bereik }) : null;
  return (
    <>
      {markeringen
        .filter((m) => m.blad === null || m.blad.toLowerCase() === naam)
        .map((m, i) => {
          const r = geometry.getRangeRect({ sheetId, range: m.bereik });
          return r ? (
            <div
              key={i}
              className={`spreadsheet-markering${m.aangewezen ? " aangewezen" : ""}`}
              data-bereik={`${m.bereik.top}:${m.bereik.left}:${m.bereik.bottom}:${m.bereik.right}`}
              style={{ left: r.x, top: r.y, width: r.width, height: r.height, borderColor: m.kleur, background: `${m.kleur}14` }}
            />
          ) : null;
        })}
      {kader && (
        <div
          className={`spreadsheet-kopiekader${kopie?.knippen ? " knippen" : ""}`}
          style={{ left: kader.x, top: kader.y, width: kader.width, height: kader.height }}
        />
      )}
      {bereik && !markeringen.length && !context.snapshot.readOnly && <Vulgreep bereik={bereik} sheetId={sheetId} geometry={geometry} />}
    </>
  );
}

/** De plugin voor één editor. */
export function laagPlugin(): XlsxPlugin {
  return defineXlsxPlugin<null>({
    id: "openaec-spreadsheetlaag",
    createState: () => null,
    initialize(context) {
      meldSelectie(context.snapshot.selection);
    },
    onEvent(context, event) {
      if (event.type === "selection-change") meldSelectie(event.selection);
      else if (event.type === "load") {
        useSpreadsheetEditor.setState({ markeringen: [], kopie: null });
        meldSelectie(context.snapshot.selection);
      }
    },
    overlay: Laag,
  });
}
