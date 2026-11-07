import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { useProjectStore, type Exemplaar } from "../../store/projectStore";
import { useProjectScope } from "../../store/actiefBlad";
import {
  heeftEenheden, INVOER_BREEDTE, klemOpVel, leesEenheden, maxBreedte, naastDeVouw, nieuwId, opRaster, schrijfEenheden,
  splitsOpKoppen, stapelOnderElkaar, velBegin, velVan, verwijderEenheid, VEL_BREEDTE, zetEenheid, zoomNaWiel, type Eenheid,
} from "../../store/canvasBlad";
import { registreerBewaarder } from "../../store/spreadsheetBlad";
import { huisstijlVariabelen } from "../../rapport/model";
import { useRapportBureau } from "../rapport/afdruk/useRapportWeergave";
import { useDoorrekening } from "../../rekenen/doorrekening";
import Icoon from "../Icoon";
import { zorgVoorKernstijlen } from "./bladDoorrekenen";
import { useEenheidMaten } from "./canvasMaten";
import { pxPerMm } from "./paginering";
import { schoonUitwerking } from "./uitwerkingOpschonen";
import "katex/dist/katex.min.css";
import "./PrintDocument.css";
import "./CanvasBladWeergave.css";

/*
 * Een canvas-blad in de werkruimte (zie store/canvasBlad.ts): een vel met de
 * breedte van een A4 waarop formules als losse eenheden staan. Klik op een lege
 * plek voor een nieuwe, klik op een eenheid om hem te bewerken, sleep hem om hem
 * te verplaatsen. De doorrekening loopt via de worker, net als elk blad; hij
 * begint als een eenheid wordt verlaten of neergezet.
 *
 * De eenheden staan op het vel in de opmaak van de uitdraai (`print-opmaak`), in
 * millimeter: wat hier op een plek past, past daar op papier ook.
 */

/** Zoveel moet de muis bewegen voordat een klik een sleepbeweging wordt, in px. */
const SLEEP_DREMPEL = 4;

/** De uitkomst van één eenheid. Hetzelfde object zolang de html gelijk blijft, zie Preview.tsx. */
const Uitkomst = memo(function Uitkomst({ html }: { html: string }) {
  const inhoud = useMemo(() => ({ __html: schoonUitwerking(html) }), [html]);
  return <div className="ifc-calc" dangerouslySetInnerHTML={inhoud} />;
});

/** Levert de html iets op dat op het vel te zien is? Een eenheid met alleen `#hide` niet. */
const heeftInhoud = (html: string) => /<(?:svg|img|input|select|iframe|canvas)\b/i.test(html) || html.replace(/<[^>]*>/g, "").trim() !== "";

/** De eenheid waarvan het invoerveld open staat; bij een nieuwe staat hij nog niet in de bron. */
type OpenEenheid = Eenheid;

/** Wat er tijdens het slepen gebeurt: de eenheid, de startpunten, en of er al bewogen is. */
interface Sleep {
  id: string;
  px: number;
  py: number;
  x: number;
  y: number;
  bewogen: boolean;
}

/** Werkruimte: het vel met de eenheden. */
export function CanvasBladWeergave({ ex }: { ex: Exemplaar }) {
  const { t } = useTranslation("werkruimte");
  const bureau = useRapportBureau();
  const zetBron = useProjectStore((s) => s.zetBron);
  const zetWaarde = useProjectStore((s) => s.zetWaarde);
  const scope = useProjectScope();

  useEffect(() => zorgVoorKernstijlen(), []);

  // Een gewoon rekenblad (een module, of tekst uit de API of de code) heeft geen
  // merktekens: dan staan zijn delen tussen de koppen als eenheden onder elkaar
  // (splitsOpKoppen). De tekst blijft ongemoeid tot je een eenheid verplaatst of
  // bewerkt; dan komen de merktekens met deze plekken erin. De doorrekening krijgt
  // steeds de tekst met merktekens, in de volgorde van de tekst.
  const gemerkt = heeftEenheden(ex.source);
  const delen = useMemo(() => (gemerkt ? leesEenheden(ex.source) : splitsOpKoppen(ex.source)), [ex.source, gemerkt]);
  const bron = useMemo(() => schrijfEenheden(delen), [delen]);
  const { doorrekening, bezig } = useDoorrekening(ex.id, bron, ex.waarden, scope, ex.naam);
  const htmlVan = useMemo(
    () => new Map((doorrekening?.eenheden ?? []).map((u) => [u.id, u.html])),
    [doorrekening],
  );

  const vlak = useRef<HTMLDivElement>(null);
  const maten = useEenheidMaten(vlak);
  const eenheden = useMemo(
    () => (gemerkt ? delen : stapelOnderElkaar(delen, (e) => maten[e.id]?.h)),
    [gemerkt, delen, maten],
  );
  const eenhedenRef = useRef(eenheden);
  eenhedenRef.current = eenheden;
  const [open, zetOpen] = useState<OpenEenheid | null>(null);
  const openRef = useRef<OpenEenheid | null>(null);
  openRef.current = open;
  const [gesleept, zetGesleept] = useState<{ id: string; x: number; y: number } | null>(null);
  const sleep = useRef<Sleep | null>(null);

  const schuif = useRef<HTMLDivElement>(null);
  const papier = useRef<HTMLDivElement>(null);
  const [zoom, zetZoom] = useState(1);
  const zoomDoel = useRef(1);
  const [papierHoogte, zetPapierHoogte] = useState(0);
  /** Het punt onder de muis: op het scherm, en op het vel in px bij 100 %. */
  const anker = useRef<{ cx: number; cy: number; x: number; y: number } | null>(null);

  // Ctrl en scrollen zoomt rond het punt onder de muis. Niet via onWheel: React luistert
  // passief, en dan zoomt de hele webview mee. Er kunnen meer tikken komen voordat React
  // heeft getekend, dus de getoonde schaal komt uit het vel zelf en het doel loopt door.
  useEffect(() => {
    const el = schuif.current;
    if (!el) return;
    const wiel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const p = papier.current!;
      const r = p.getBoundingClientRect();
      const getoond = r.width / p.offsetWidth;
      anker.current = { cx: e.clientX, cy: e.clientY, x: (e.clientX - r.left) / getoond, y: (e.clientY - r.top) / getoond };
      zoomDoel.current = zoomNaWiel(zoomDoel.current, e.deltaY);
      zetZoom(zoomDoel.current);
    };
    el.addEventListener("wheel", wiel, { passive: false });
    return () => el.removeEventListener("wheel", wiel);
  }, []);

  // Na een zoomstap het punt onder de muis op zijn plek houden.
  useLayoutEffect(() => {
    const el = schuif.current;
    const p = papier.current;
    const a = anker.current;
    if (!el || !p || !a) return;
    anker.current = null;
    const r = p.getBoundingClientRect();
    el.scrollLeft += r.left + a.x * zoom - a.cx;
    el.scrollTop += r.top + a.y * zoom - a.cy;
  }, [zoom]);

  /**
   * De huidige tekst uit de store: tussen twee renders kan er al iets zijn veranderd.
   * Zonder merktekens de eenheden zoals ze nu op het vel staan, zodat een wijziging
   * die plekken vastlegt.
   */
  const huidigeBron = useCallback(() => {
    const nu = useProjectStore.getState().exemplaren.find((e) => e.id === ex.id)?.source ?? "";
    return heeftEenheden(nu) ? nu : schrijfEenheden(eenhedenRef.current);
  }, [ex.id]);

  /** Zet wat in het open invoerveld staat in het blad; een leeg veld haalt de eenheid weg. */
  const bewaarOpen = useCallback(() => {
    const o = openRef.current;
    if (!o) return;
    const nu = huidigeBron();
    const oud = leesEenheden(nu).find((e) => e.id === o.id);
    const tekst = o.tekst.trim();
    if (oud ? oud.tekst === tekst : !tekst) return;
    zetBron(ex.id, tekst ? zetEenheid(nu, o.id, { x: o.x, y: o.y, tekst }) : verwijderEenheid(nu, o.id));
  }, [ex.id, huidigeBron, zetBron]);

  // Opslaan vraagt om de laatste stand, ook van een veld dat nog openstaat; net
  // als de open werkmap (store/spreadsheetBlad.ts). Weggaan van het blad bewaart ook.
  useEffect(() => registreerBewaarder(async () => bewaarOpen()), [bewaarOpen]);
  useEffect(() => bewaarOpen, [bewaarOpen]);

  // Invoervelden en keuzelijsten in de uitkomsten: bij het verlaten naar de invoer
  // van het blad. Hun html is niet van React, dus luisteren op het vlak.
  useEffect(() => {
    const el = vlak.current;
    if (!el) return;
    const opWijziging = (e: Event) => {
      const veld = e.target as HTMLInputElement | HTMLSelectElement;
      const naam = veld.dataset?.var ?? veld.dataset?.prompt;
      if (naam && veld.closest("[data-eenheid]")) zetWaarde(ex.id, naam, veld.value);
    };
    el.addEventListener("change", opWijziging);
    return () => el.removeEventListener("change", opWijziging);
  }, [ex.id, zetWaarde]);

  /** Van een plek op het scherm naar millimeters op het vel. */
  const naarMm = (clientX: number, clientY: number) => {
    const el = vlak.current!;
    const r = el.getBoundingClientRect();
    const schaal = (r.width / el.offsetWidth) * pxPerMm();
    return { x: (clientX - r.left) / schaal, y: (clientY - r.top) / schaal };
  };

  const opVlakKlik = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest(".canvas-eenheid, .canvas-invoer")) return;
    const mm = naarMm(e.clientX, e.clientY);
    const { x, y } = klemOpVel(opRaster(mm.x), opRaster(mm.y));
    zetOpen({ id: nieuwId(new Set(eenheden.map((u) => u.id))), x, y, tekst: "" });
  };

  const beginSlepen = (e: ReactPointerEvent<HTMLDivElement>, eenheid: Eenheid) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("input, select, button, a")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    sleep.current = { id: eenheid.id, px: e.clientX, py: e.clientY, x: eenheid.x, y: eenheid.y, bewogen: false };
  };

  const volgSlepen = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = sleep.current;
    if (!s) return;
    if (!s.bewogen && Math.hypot(e.clientX - s.px, e.clientY - s.py) < SLEEP_DREMPEL) return;
    s.bewogen = true;
    const nu = naarMm(e.clientX, e.clientY);
    const start = naarMm(s.px, s.py);
    zetGesleept({ id: s.id, ...klemOpVel(opRaster(s.x + nu.x - start.x), opRaster(s.y + nu.y - start.y)) });
  };

  const eindSlepen = (eenheid: Eenheid) => {
    const s = sleep.current;
    sleep.current = null;
    if (!s) return;
    if (s.bewogen && gesleept) {
      // Neerzetten over de vouw kan niet: dan begint hij het volgende vel.
      const y = naastDeVouw(gesleept.y, maten[eenheid.id]?.h ?? 0);
      if (gesleept.x !== eenheid.x || y !== eenheid.y) zetBron(ex.id, zetEenheid(huidigeBron(), eenheid.id, { x: gesleept.x, y }));
    } else if (!s.bewogen) {
      zetOpen(eenheid);
    }
    zetGesleept(null);
  };

  // Altijd een vel meer dan er gevuld is: er blijft ruimte om iets neer te zetten.
  const onderkant = Math.max(0, ...eenheden.map((u) => u.y + (maten[u.id]?.h ?? 0)), open?.y ?? 0, gesleept?.y ?? 0);
  const aantalVellen = velVan(onderkant) + 2;

  // Een schaal verandert de ruimte in de opmaak niet: die krijgt het vel van .canvas-schaal.
  useLayoutEffect(() => zetPapierHoogte(papier.current?.offsetHeight ?? 0), [aantalVellen]);

  const zichtbaar = eenheden.filter((u) => u.id !== open?.id);
  return (
    <div className="canvas-weergave" ref={schuif}>
      <div className="canvas-schaal" style={{ "--canvas-zoom": zoom, height: papierHoogte * zoom } as CSSProperties}>
      <div ref={papier} className={`canvas-papier print-opmaak${bezig ? " rekent" : ""}`} data-oa-theme="light" style={huisstijlVariabelen(bureau.huisstijl) as CSSProperties}>
        <div className="canvas-kop">{ex.naam}</div>
        <div
          ref={vlak}
          className="canvas-vlak print-blad"
          style={{ width: `${VEL_BREEDTE}mm`, height: `${velBegin(aantalVellen)}mm` }}
          onClick={opVlakKlik}
        >
          {eenheden.length === 0 && !open && <p className="canvas-uitleg">{t("canvas.uitleg")}</p>}
          {Array.from({ length: aantalVellen - 1 }, (_, i) => (
            <div key={i} className="canvas-vouw" style={{ top: `${velBegin(i + 1)}mm` }}>
              <span>{t("canvas.pagina", { nummer: i + 2 })}</span>
            </div>
          ))}
          {zichtbaar.map((u) => {
            const plek = gesleept?.id === u.id ? gesleept : u;
            const maat = maten[u.id];
            const html = htmlVan.get(u.id);
            const x = Math.max(0, Math.min(plek.x, VEL_BREEDTE - (maat?.b ?? 0)));
            const overDeVouw = !!maat && naastDeVouw(plek.y, maat.h) !== plek.y;
            return (
              <div
                key={u.id}
                className={`canvas-eenheid${gesleept?.id === u.id ? " sleept" : ""}${overDeVouw ? " over-de-vouw" : ""}`}
                data-eenheid={u.id}
                title={overDeVouw ? t("canvas.overDeVouw") : t("canvas.eenheidUitleg")}
                style={{ left: `${x}mm`, top: `${plek.y}mm`, maxWidth: `${maxBreedte(plek.x)}mm` }}
                onPointerDown={(e) => beginSlepen(e, u)}
                onPointerMove={volgSlepen}
                onPointerUp={() => eindSlepen(u)}
                onPointerCancel={() => {
                  sleep.current = null;
                  zetGesleept(null);
                }}
              >
                {html !== undefined && heeftInhoud(html) ? <Uitkomst html={html} /> : <pre className="canvas-alleen-tekst">{u.tekst}</pre>}
                <button
                  className="canvas-weg"
                  title={t("canvas.verwijderen")}
                  onClick={() => zetBron(ex.id, verwijderEenheid(huidigeBron(), u.id))}
                >
                  <Icoon id="edit.delete" uit="calculations" />
                </button>
              </div>
            );
          })}
          {open && (
            <textarea
              className="canvas-invoer"
              autoFocus
              spellCheck={false}
              value={open.tekst}
              placeholder={t("canvas.invoerVoorbeeld")}
              aria-label={t("canvas.invoerLabel")}
              style={{ left: `${Math.min(open.x, VEL_BREEDTE - INVOER_BREEDTE)}mm`, top: `${open.y}mm`, width: `${INVOER_BREEDTE}mm` }}
              onChange={(e) => zetOpen({ ...open, tekst: e.target.value })}
              onBlur={() => {
                bewaarOpen();
                zetOpen(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  // Weg zonder te bewaren.
                  openRef.current = null;
                  zetOpen(null);
                } else if (e.key === "Enter" && e.ctrlKey) {
                  e.currentTarget.blur();
                }
              }}
            />
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
