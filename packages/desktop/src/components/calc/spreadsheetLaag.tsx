import { Fragment, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { defineXlsxPlugin, type XlsxPlugin, type XlsxPluginContext, type XlsxPluginGeometry, type XlsxPluginSelection } from "@betteroffice/xlsx-react";
import { useSpreadsheetEditor } from "../../store/spreadsheetEditor";
import { MATEN, SPELING } from "./paginering";
import { openFormuleVeld } from "./spreadsheetAanwijzen";
import { zichtbareSporen } from "./spreadsheetKoppen";
import { bereikTussen, doelBereik, MAX_KOLOMMEN, MAX_RIJEN, richtingNaar, type Bereik, type VulRichting } from "./spreadsheetLogica";
import { uitvoeren, vul, vulTotEinde } from "./spreadsheetOpdrachten";
import { velLijnen, type VelKern } from "./spreadsheetVellen";

/*
 * De eigen laag boven het raster, als plugin van de editor: de kaders van de
 * verwijzingen in een open formule (spreadsheetAanwijzen.ts), het kader om wat op
 * het klembord staat, de vulgreep en de rand van het papier. De plugin houdt ook de
 * selectie bij in de store, voor het lint en de sneltoetsen.
 */

const MAX_RIJ = MAX_RIJEN - 1;
const MAX_KOLOM = MAX_KOLOMMEN - 1;
/** De bladspiegel van de losse uitdraai, zoals SpreadsheetVellen die aan het blad geeft. */
const UITDRAAI = { breedte: MATEN.bladen.inhoud.breedte, hoogte: MATEN.bladen.inhoud.hoogte - SPELING };

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

/**
 * Waar een afgedrukt vel eindigt: een stippellijn rechts en onder elk vel, met een
 * hoek op het punt waar ze elkaar raken. Dezelfde berekening als de afdruk van dit blad
 * als losse uitdraai (spreadsheetVellen.ts). Scrollen en zoomen volgen uit de geometrie
 * van het getekende beeld; de berekening zelf loopt alleen als de werkmap verandert.
 */
function Vellijnen({ blad, sheetId, geometry, kern }: { blad: number; sheetId: string; geometry: XlsxPluginGeometry; kern: VelKern }) {
  const { t } = useTranslation("werkruimte");
  const versie = geometry.layout.version;
  // eslint-disable-next-line react-hooks/exhaustive-deps -- de versie is hier juist de reden om opnieuw te rekenen
  const lijnen = useMemo(() => velLijnen(kern, blad, UITDRAAI), [kern, blad, versie]);
  const zoom = geometry.layout.zoom;
  const kolommen = zichtbareSporen((van, tot) => geometry.getRangeRect({ sheetId, range: { top: 0, bottom: MAX_RIJ, left: van, right: tot } }), MAX_KOLOM, "x");
  const rijen = zichtbareSporen((van, tot) => geometry.getRangeRect({ sheetId, range: { left: 0, right: MAX_KOLOM, top: van, bottom: tot } }), MAX_RIJ, "y");
  if (!kolommen.length || !rijen.length) return null;
  const breedte = kolommen[kolommen.length - 1].positie + kolommen[kolommen.length - 1].grootte;
  const hoogte = rijen[rijen.length - 1].positie + rijen[rijen.length - 1].grootte;

  /** De plek in de overlay; buiten beeld links of rechts geeft de rand daarvan, met `binnen` onwaar. */
  const plekX = (kolom: number, px: number, vol: number): { x: number; binnen: boolean } => {
    if (kolom > kolommen[kolommen.length - 1].nummer) return { x: breedte, binnen: false };
    const spoor = kolommen.find((k) => k.nummer === kolom);
    if (!spoor) return { x: kolommen[0].positie, binnen: false };
    // Een kolom die half uit beeld loopt: tel vanaf de kant die wel zichtbaar is.
    const afgekapt = spoor.grootte < vol * zoom - 0.5;
    const rechtsAf = afgekapt && spoor.positie + spoor.grootte >= breedte - 0.5;
    const x = afgekapt && !rechtsAf ? spoor.positie + spoor.grootte - (vol - px) * zoom : spoor.positie + px * zoom;
    return x > breedte ? { x: breedte, binnen: false } : { x, binnen: x >= spoor.positie - 0.5 };
  };
  const rand = plekX(lijnen.rechtsKolom, lijnen.rechtsBinnen, lijnen.rechtsKolomBreedte);
  const links = plekX(lijnen.links, 0, 0).x;
  const bovenSpoor = rijen.find((r) => r.nummer === lijnen.boven);
  const boven = bovenSpoor?.positie ?? (lijnen.boven > rijen[rijen.length - 1].nummer ? hoogte : rijen[0].positie);

  /** De onderkant van een rij; null als die buiten beeld valt of erdoor wordt afgekapt. */
  const onderkant = (rij: number): number | null => {
    const spoor = rijen.find((r) => r.nummer === rij);
    if (!spoor) return null;
    const onder = spoor.positie + spoor.grootte;
    const vol = (kern.cellRect(blad, rij, 0).h) * zoom;
    return spoor.grootte < vol - 0.5 && onder >= hoogte - 0.5 ? null : onder;
  };

  // De rand rechts loopt tot het laatste vel; is dat voorbij het beeld, dan tot de onderkant.
  const laatste = lijnen.vellen[lijnen.vellen.length - 1];
  const eind = lijnen.vol && laatste && laatste.tot < rijen[0].nummer ? null : (lijnen.vol && laatste ? onderkant(laatste.tot) ?? hoogte : hoogte);

  return (
    <div className="spreadsheet-vellijnen">
      {rand.binnen && eind !== null && eind > boven && (
        <div className="spreadsheet-vellijn staand" style={{ left: rand.x, top: boven, height: eind - boven }} />
      )}
      {rand.binnen && lijnen.schaal < 0.999 && boven < hoogte && (
        <span className="spreadsheet-veltekst" style={{ left: rand.x, top: boven }}>
          {t("spreadsheet.schaalOpPapier", { procent: Math.round(lijnen.schaal * 100) })}
        </span>
      )}
      {lijnen.vellen.map((vel) => {
        const y = onderkant(vel.tot);
        if (y === null || rand.x <= links) return null;
        const stijl = vel.metInhoud ? "" : " zonder-inhoud";
        return (
          <Fragment key={vel.nummer}>
            <div className={`spreadsheet-vellijn liggend${stijl}`} style={{ left: links, top: y, width: rand.x - links }} />
            {rand.binnen && <div className={`spreadsheet-velhoek${stijl}`} style={{ left: rand.x - 13, top: y - 13 }} />}
            <span className={`spreadsheet-veltekst boven${stijl}`} style={{ left: (rand.binnen ? rand.x : breedte) - 16, top: y }}>
              {t("spreadsheet.vel", { nummer: vel.nummer })}
            </span>
          </Fragment>
        );
      })}
    </div>
  );
}

function Laag({ context, geometry }: { context: XlsxPluginContext<null>; geometry: XlsxPluginGeometry }) {
  const markeringen = useSpreadsheetEditor((s) => s.markeringen);
  const kopie = useSpreadsheetEditor((s) => s.kopie);
  const bereik = useSpreadsheetEditor((s) => s.bereik);
  const api = useSpreadsheetEditor((s) => s.api);
  const metVellijnen = useSpreadsheetEditor((s) => s.velLijnen);
  const sheetId = geometry.layout.sheetId;
  const info = api?.handle.sheetInfo();
  const blad = info ? info.sheetIds.indexOf(sheetId) : -1;
  const naam = info?.sheetNames[blad]?.toLowerCase();
  const kader = kopie?.sheetId === sheetId ? geometry.getRangeRect({ sheetId, range: kopie.bereik }) : null;
  return (
    <>
      {metVellijnen && api && blad >= 0 && <Vellijnen blad={blad} sheetId={sheetId} geometry={geometry} kern={api.handle} />}
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
