import { useEffect, useMemo, useRef, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { useProjectStore, type Exemplaar } from "../../store/projectStore";
import { LIGGINGEN, PAPIERFORMATEN, velMaat, type Ligging, type Papierformaat, type TekenVel, type TekenView } from "../../store/tekenBlad";
import TekenVlak from "../tekenen/TekenVlak";
import TekenPaneel, { GetalVeld } from "../tekenen/TekenPaneel";
import { SchaalKeuze } from "../tekenen/ViewPaneel";
import { meld, openView, sluitView, useTeken } from "../tekenen/tekenStore";
import { nieuweView, nieuwVel, paginaNaam, schaalTekst, velInhoud, velSvg, viewBereik, zetVelFormaat, zetViewSchaal } from "../tekenen/vel";
import { kernGetal } from "../tekenen/code";
import { PX_PER_MM } from "../tekenen/staalprofielen";
import type { Opgelost } from "../tekenen/model";
import type { Proef } from "../tekenen/waarden";
import { schoonSvgDeel, schoonUitwerking } from "./uitwerkingOpschonen";
import { papier } from "./pdfBlad";
import "../tekenen/Tekenen.css";
import "./Tekenblad.css";

/*
 * Een tekenblad in beeld en op papier (zie store/tekenBlad.ts en tekenen/vel.ts).
 *
 * In de werkruimte twee standen. Op het vel kies, verplaats en vergroot je views
 * en stel je het papier in. Dubbelklik op een view en je tekent erin, met dezelfde
 * editor als in een rekenblad: het lint Tekenen, de commando's, snappen en ortho.
 *
 * Op papier: het vel op zijn eigen formaat, in de losse afdruk en in het rapport.
 */

/** Een tekenblad heeft geen rekenblad: geen koppeling heeft een waarde. */
const GEEN_WAARDEN: Opgelost = Object.assign((() => undefined) as (e: string) => number | undefined, {
  eenheid: () => undefined,
});
const LEGE_PROEF: Proef = { per: new Map(), variabelen: [], bezig: false };
/** Tekst tussen `{{…}}` is hier gewoon tekst. */
const tekstZelf = (e: string) => e;

export function TekenbladWeergave({ ex }: { ex: Exemplaar }) {
  const inBewerking = useTeken((s) => s.vel?.exId === ex.id);
  // Weg van dit blad of naar het afdrukvoorbeeld: de editor gaat dicht, de tekening staat al in het project.
  useEffect(() => () => sluitView(), [ex.id]);
  return inBewerking ? <ViewBewerken ex={ex} /> : <VelOverzicht ex={ex} />;
}

/** Kop van het paneel: formaat en aantal views. */
export function TekenbladInfo({ ex }: { ex: Exemplaar }) {
  const { t } = useTranslation("werkruimte");
  const vel = ex.tekenvel;
  if (!vel) return null;
  const tekst = `${vel.formaat} ${t(`tekenblad.ligging.${vel.ligging}`).toLowerCase()} · ${t("tekenblad.aantalViews", { count: vel.views.length })}`;
  return <span className="pdf-info"><span className="pdf-info-tekst" title={tekst}>{tekst}</span></span>;
}

/** Tekenen in één view. */
function ViewBewerken({ ex }: { ex: Exemplaar }) {
  const { t } = useTranslation("werkruimte");
  const { t: tt } = useTranslation("tekenen");
  const vel = useTeken((s) => s.vel);
  const melding = useTeken((s) => s.melding);
  const view = ex.tekenvel?.views.find((v) => v.id === vel?.viewId);
  if (!view) return null;
  const bereik = viewBereik(view);
  return (
    <div className="tk-ingebed" role="region" aria-label={view.titel}>
      <div className="tk-kop">
        <button className="tk-knop" onClick={sluitView} title={tt("lint.terugNaarVelTip")}>← {tt("lint.terugNaarVel")}</button>
        <span className="tk-titel">{view.titel || t("tekenblad.view")}</span>
        <span className="tk-doel">
          {schaalTekst(view.schaal)} · {t("tekenblad.bereik", { b: kernGetal(Math.round(bereik.breedte)), h: kernGetal(Math.round(bereik.hoogte)) })}
        </span>
      </div>
      {melding && (
        <div className={`tk-melding${melding.fout ? " fout" : ""}`}>
          <span>{tt(melding.sleutel, melding.opties ?? {})}</span>
          <button className="tk-sluit" onClick={() => meld(null)} aria-label={tt("lint.sluiten")}>×</button>
        </div>
      )}
      <div className="tk-lichaam">
        <TekenVlak opgelost={GEEN_WAARDEN} tekstVan={tekstZelf} />
        <TekenPaneel proef={LEGE_PROEF} opgelost={GEEN_WAARDEN} />
      </div>
    </div>
  );
}

/** De hoeken waaraan een view van maat verandert. */
const HOEKEN = ["nw", "ne", "sw", "se"] as const;
type Hoek = (typeof HOEKEN)[number];

type Sleep =
  | { soort: "schuif"; id: string; start: { x: number; y: number }; van: TekenView }
  | { soort: "maat"; id: string; hoek: Hoek; start: { x: number; y: number }; van: TekenView };

/** De kleinste view, in mm op papier. */
const MIN_VIEW = { breedte: 20, hoogte: 15 };
const opMm = (n: number) => Math.round(n);

/** Het vel: views kiezen, verplaatsen en van maat veranderen. */
function VelOverzicht({ ex }: { ex: Exemplaar }) {
  const { t } = useTranslation("werkruimte");
  const project = useProjectStore((s) => s.projectNaam);
  const zet = useProjectStore((s) => s.zetTekenVel);
  const keuze = useTeken((s) => s.velKeuze);
  const svg = useRef<SVGSVGElement>(null);
  const sleep = useRef<Sleep | null>(null);
  const vel = ex.tekenvel;

  const inhoud = useMemo(
    () => (vel ? { __html: schoonSvgDeel(velInhoud(vel, { naam: ex.naam, project })) } : { __html: "" }),
    [vel, ex.naam, project],
  );

  if (!vel) {
    return (
      <div className="tv-leeg">
        <p className="pdf-melding">{t("tekenblad.ontbreekt")}</p>
        <button className="tk-knop" onClick={() => zet(ex.id, nieuwVel(t("tekenblad.viewNaam", { n: 1 })))}>{t("tekenblad.nieuwVel")}</button>
      </div>
    );
  }
  const m = velMaat(vel);
  const gekozen = vel.views.find((v) => v.id === keuze) ?? null;
  const zetViews = (views: TekenView[]) => zet(ex.id, { ...vel, views });
  const wijzigV = (id: string, f: (v: TekenView) => TekenView) => zetViews(vel.views.map((v) => (v.id === id ? f(v) : v)));
  const kies = (id: string | null) => useTeken.setState({ velKeuze: id });

  const naarMm = (e: { clientX: number; clientY: number }) => {
    const ctm = svg.current?.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };
  const begin = (e: ReactPointerEvent<SVGElement>, s: Sleep) => {
    e.stopPropagation();
    kies(s.id);
    sleep.current = s;
    svg.current?.setPointerCapture(e.pointerId);
  };
  const beweeg = (e: ReactPointerEvent<SVGSVGElement>) => {
    const s = sleep.current;
    if (!s) return;
    const p = naarMm(e);
    const dx = opMm(p.x - s.start.x), dy = opMm(p.y - s.start.y);
    const v = s.van;
    if (s.soort === "schuif") {
      const x = Math.max(0, Math.min(m.breedte - v.breedte, v.x + dx));
      const y = Math.max(0, Math.min(m.hoogte - v.hoogte, v.y + dy));
      wijzigV(s.id, (o) => ({ ...o, x, y }));
      return;
    }
    // De overstaande hoek blijft liggen; wat er in de view staat, blijft op zijn plek op papier.
    const links = s.hoek.includes("w"), boven = s.hoek.startsWith("n");
    const breedte = Math.max(MIN_VIEW.breedte, links ? v.breedte - dx : v.breedte + dx);
    const hoogte = Math.max(MIN_VIEW.hoogte, boven ? v.hoogte - dy : v.hoogte + dy);
    const x = links ? v.x + v.breedte - breedte : v.x;
    const y = boven ? v.y + v.hoogte - hoogte : v.y;
    wijzigV(s.id, (o) => ({
      ...o,
      x,
      y,
      breedte,
      hoogte,
      x0: v.x0 + (x - v.x) * v.schaal,
      y0: v.y0 + (y - v.y) * v.schaal,
    }));
  };
  const los = (e: ReactPointerEvent<SVGSVGElement>) => {
    sleep.current = null;
    if (svg.current?.hasPointerCapture(e.pointerId)) svg.current.releasePointerCapture(e.pointerId);
  };

  // Op het vlak en niet op de view: met de muis gevangen komt de klik binnen op de <svg>.
  const dubbelklik = (e: ReactMouseEvent<SVGSVGElement>) => {
    const p = naarMm(e);
    const v = [...vel.views].reverse().find((o) => p.x >= o.x && p.x <= o.x + o.breedte && p.y >= o.y && p.y <= o.y + o.hoogte);
    if (v) openView(ex.id, v.id);
  };

  const voegViewToe = () => {
    const v = nieuweView(vel, t("tekenblad.viewNaam", { n: vel.views.length + 1 }));
    zetViews([...vel.views, v]);
    kies(v.id);
  };
  const verwijder = (v: TekenView) => {
    if (v.elementen.length > 0 && !confirm(t("tekenblad.verwijderVraag", { naam: v.titel || t("tekenblad.view") }))) return;
    zetViews(vel.views.filter((o) => o.id !== v.id));
    kies(null);
  };
  const zetFormaat = (formaat: Papierformaat, ligging: Ligging) => zet(ex.id, zetVelFormaat(vel, formaat, ligging));

  const greep = 3;
  return (
    <div className="tv-werk">
      <div className="tv-vlak">
        <svg
          ref={svg}
          className="tv-svg"
          data-oa-theme="light"
          viewBox={`-6 -6 ${m.breedte + 12} ${m.hoogte + 12}`}
          preserveAspectRatio="xMidYMid meet"
          onPointerDown={() => kies(null)}
          onPointerMove={beweeg}
          onPointerUp={los}
          onPointerCancel={los}
          onDoubleClick={dubbelklik}
        >
          <rect className="tv-papier" x={0} y={0} width={m.breedte} height={m.hoogte} />
          <g className="tv-inhoud" transform={`scale(${1 / PX_PER_MM})`} pointerEvents="none" dangerouslySetInnerHTML={inhoud} />
          {vel.views.map((v) => {
            const aan = v.id === keuze;
            return (
              <g key={v.id}>
                <rect
                  className={`tv-view${aan ? " gekozen" : ""}`}
                  x={v.x}
                  y={v.y}
                  width={v.breedte}
                  height={v.hoogte}
                  onPointerDown={(e) => begin(e, { soort: "schuif", id: v.id, start: naarMm(e), van: v })}
                >
                  <title>{t("tekenblad.viewTip", { naam: v.titel || t("tekenblad.view") })}</title>
                </rect>
                {aan && HOEKEN.map((h) => (
                  <rect
                    key={h}
                    className={`tv-greep tv-greep-${h}`}
                    x={(h.includes("w") ? v.x : v.x + v.breedte) - greep / 2}
                    y={(h.startsWith("n") ? v.y : v.y + v.hoogte) - greep / 2}
                    width={greep}
                    height={greep}
                    onPointerDown={(e) => begin(e, { soort: "maat", id: v.id, hoek: h, start: naarMm(e), van: v })}
                  />
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      <VelPaneel
        vel={vel}
        gekozen={gekozen}
        zetFormaat={zetFormaat}
        kies={kies}
        voegToe={voegViewToe}
        wijzig={wijzigV}
        verwijder={verwijder}
        teken={(id) => openView(ex.id, id)}
      />
    </div>
  );
}

function VelPaneel({ vel, gekozen, zetFormaat, kies, voegToe, wijzig, verwijder, teken }: {
  vel: TekenVel;
  gekozen: TekenView | null;
  zetFormaat: (f: Papierformaat, l: Ligging) => void;
  kies: (id: string | null) => void;
  voegToe: () => void;
  wijzig: (id: string, f: (v: TekenView) => TekenView) => void;
  verwijder: (v: TekenView) => void;
  teken: (id: string) => void;
}) {
  const { t } = useTranslation("werkruimte");
  return (
    <div className="tk-paneel">
      <section className="tk-sectie">
        <div className="tk-sectie-kop"><span>{t("tekenblad.papier")}</span></div>
        <div className="tk-rij">
          <label>{t("tekenblad.formaat")}</label>
          <select className="tk-veld" value={vel.formaat} onChange={(e) => zetFormaat(e.target.value as Papierformaat, vel.ligging)}>
            {PAPIERFORMATEN.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div className="tk-rij">
          <label>{t("tekenblad.liggingLabel")}</label>
          <select className="tk-veld" value={vel.ligging} onChange={(e) => zetFormaat(vel.formaat, e.target.value as Ligging)}>
            {LIGGINGEN.map((l) => <option key={l} value={l}>{t(`tekenblad.ligging.${l}`)}</option>)}
          </select>
        </div>
      </section>

      <section className="tk-sectie">
        <div className="tk-sectie-kop">
          <span>{t("tekenblad.views")}</span>
          <button className="tk-knop-klein" onClick={voegToe} title={t("tekenblad.viewToevoegenTip")}>{t("tekenblad.viewToevoegen")}</button>
        </div>
        {vel.views.length === 0 && <p className="tk-uitleg tk-zacht">{t("tekenblad.geenViews")}</p>}
        <div className="tv-lijst">
          {vel.views.map((v) => (
            <button
              key={v.id}
              className={`tv-rij${gekozen?.id === v.id ? " gekozen" : ""}`}
              onClick={() => kies(v.id)}
              onDoubleClick={() => teken(v.id)}
            >
              <span className="tv-rij-naam">{v.titel || t("tekenblad.view")}</span>
              <span className="tv-rij-schaal">{schaalTekst(v.schaal)}</span>
            </button>
          ))}
        </div>
      </section>

      {gekozen ? (
        <section className="tk-sectie">
          <div className="tk-sectie-kop"><span>{gekozen.titel || t("tekenblad.view")}</span></div>
          <div className="tk-knoppen">
            <button className="tk-knop primair" onClick={() => teken(gekozen.id)}>{t("tekenblad.tekenen")}</button>
            <button className="tk-knop" onClick={() => verwijder(gekozen)}>{t("tekenblad.verwijderen")}</button>
          </div>
          <div className="tk-rij">
            <label>{t("tekenblad.titel")}</label>
            <input className="tk-veld" value={gekozen.titel} onChange={(e) => wijzig(gekozen.id, (v) => ({ ...v, titel: e.target.value }))} />
          </div>
          <SchaalKeuze waarde={gekozen.schaal} onZet={(n) => wijzig(gekozen.id, (v) => zetViewSchaal(v, n))} />
          <div className="tk-rij">
            <label>{t("tekenblad.x")}</label>
            <GetalVeld waarde={gekozen.x} stap={5} onZet={(n) => wijzig(gekozen.id, (v) => ({ ...v, x: n }))} />
          </div>
          <div className="tk-rij">
            <label>{t("tekenblad.y")}</label>
            <GetalVeld waarde={gekozen.y} stap={5} onZet={(n) => wijzig(gekozen.id, (v) => ({ ...v, y: n }))} />
          </div>
          <div className="tk-rij">
            <label>{t("tekenblad.breedte")}</label>
            <GetalVeld waarde={gekozen.breedte} min={MIN_VIEW.breedte} stap={5} onZet={(n) => wijzig(gekozen.id, (v) => ({ ...v, breedte: n }))} />
          </div>
          <div className="tk-rij">
            <label>{t("tekenblad.hoogte")}</label>
            <GetalVeld waarde={gekozen.hoogte} min={MIN_VIEW.hoogte} stap={5} onZet={(n) => wijzig(gekozen.id, (v) => ({ ...v, hoogte: n }))} />
          </div>
          <p className="tk-uitleg tk-zacht">{t("tekenblad.plekUitleg")}</p>
        </section>
      ) : (
        <section className="tk-sectie">
          <p className="tk-uitleg tk-zacht">{t("tekenblad.uitleg")}</p>
        </section>
      )}
    </div>
  );
}

/**
 * Het vel op papier, op zijn eigen formaat en op een eigen pagina. `page` kiest de
 * `@page`-regel van dat formaat (Tekenblad.css); in het afdrukvoorbeeld zet
 * AfdrukVoorbeeld.tsx het vel op die maat met de `data-vel-*`-attributen.
 */
export function TekenvelOpPapier({ ex }: { ex: Exemplaar }) {
  const project = useProjectStore((s) => s.projectNaam);
  const vel = ex.tekenvel;
  const inhoud = useMemo(
    () => (vel ? { __html: schoonUitwerking(velSvg(vel, { naam: ex.naam, project })) } : null),
    [vel, ex.naam, project],
  );
  const t = papier();
  if (!vel || !inhoud) return <p className="print-pdf-melding">{t("tekenBlad.ontbreekt")}</p>;
  const m = velMaat(vel);
  const pagina = paginaNaam(vel);
  const stijl: CSSProperties & { page: string } = { width: `${m.breedte}mm`, height: `${m.hoogte}mm`, page: pagina };
  return (
    <figure
      className="print-tekenvel print-nieuw-vel print-vel-af"
      data-vel-pagina={pagina}
      data-vel-breedte={m.breedte}
      data-vel-hoogte={m.hoogte}
      style={stijl}
      dangerouslySetInnerHTML={inhoud}
    />
  );
}

/** Een tekenblad als eigen onderdeel van de uitdraai. De naam staat in de titelhoek van het vel. */
export function TekenbladAfdruk({ ex }: { ex: Exemplaar }) {
  return (
    <section className="print-blad print-tekenblad">
      <TekenvelOpPapier ex={ex} />
    </section>
  );
}
