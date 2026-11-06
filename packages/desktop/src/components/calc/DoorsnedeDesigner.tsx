import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useDesigner, Dim, UitkomstKop, IconKeuze, fmt } from "./designerKit";
import type { BeeldEenheden } from "./beeldEenheden";
import { useBladUitkomst } from "./bladResultaat";
import { maakDoorsnede, VORM } from "./doorsnedeDefinitie";
import { tekenDoorsnede, type DoorsnedeTeksten } from "./doorsnedeTekening";
import { profielOpties } from "./profielen";
import { useActiefExemplaar, useAlleenLezen } from "../../store/actiefBlad";
import { bewaarAls } from "../../store/ifcInhoud";
import "./VoetplaatDesigner.css";
import "./DoorsnedeDesigner.css";

/**
 * Parametrisch beeld bij het blad "Spanningen in een doorsnede"
 * (templates/doorsnede-spanningen.ts): kies een vorm, stel de maten en de snedekrachten in
 * en zie het spanningsveld en de diagrammen meteen meebewegen.
 *
 * Het beeld rekent de spanningen niet: de getallen komen onafgerond uit het doorgerekende
 * blad, de meetkunde uit de definitie (doorsnedeDefinitie.ts). De SVG op het scherm, op
 * papier en in de download is dezelfde tekst (doorsnedeTekening.ts).
 *
 * Boven de maat van het venster waarmee de app opent staan invoer en tekening naast elkaar.
 * Daaronder gaat de invoer in twee kolommen boven de tekening: zo blijven ze samen in beeld.
 */
const MARKER = "Spanningen in een doorsnede";

// Een fictief voorbeeld: een IPE 300 met een schuine buiging, zodat de neutrale lijn scheef loopt.
const DEFAULTS: Record<string, number> = {
  vorm: 1, profiel: 24, h: 300, b: 150, t_w: 7.1, t_f: 10.7, r: 15, D: 200, t: 10,
  N_x: -200, M_y: 100, M_z: 10, V_y: 10, V_z: 80, f_y: 0,
};

/** Onder deze paneelbreedte past de invoerkolom niet meer naast de tekening. */
const SMAL_PANEEL = 760;
/** Breder heeft geen zin: de doorsnede wordt dan niet groter, alleen de witruimte. */
const MAX_BREEDTE = 860;
/** Op papier: kleiner dan de bladbreedte, de afdruk moet kort blijven. */
const PAPIER_BREEDTE = 470;
/** De kop, de voet en de marges van het paneel: wat er niet voor de invoer en de tekening is. */
const KOP_EN_VOET = 124;
const MIN_TEKENING = 340;

/** De stap van de pijltjestoetsen per veld. */
const STAP: Record<string, number> = { h: 10, b: 10, D: 10, t: 1, t_w: 0.5, t_f: 0.5, r: 1, N_x: 10, M_y: 5, M_z: 5, V_y: 5, V_z: 5, f_y: 5 };

/** Een stap van de pijltjes in een andere eenheid, op één cijfer: 10 mm is in inch 0,4. */
function mooieStap(s: number, terugval: number): number {
  if (!Number.isFinite(s) || s <= 0) return terugval;
  const p = 10 ** Math.floor(Math.log10(s));
  return parseFloat((Math.round(s / p) * p).toPrecision(1));
}

/**
 * Een getal typen, ook met een min of een komma ervoor: de waarde gaat pas als het een getal
 * is. Een veld met type number zou een losse min leeg doorgeven. De pijltjes omhoog en omlaag
 * tellen, zodat je het veld ziet meebewegen. Het veld staat in het eenhedenstelsel van het
 * project; wat je typt, gaat terug in de eenheid van het blad (`eenheid`).
 */
function Veld({ waarde, stap, onWijzig, eenheid, be }: {
  waarde: number; stap: number; onWijzig: (w: number) => void; eenheid: string; be: BeeldEenheden;
}) {
  const [tekst, setTekst] = useState<string | null>(null);
  const inBeeld = be.invoer(waarde, eenheid);
  const stapInBeeld = be.doel(eenheid) ? mooieStap(be.waarde(stap, eenheid), stap) : stap;
  return (
    <input
      type="text"
      inputMode="decimal"
      value={tekst ?? inBeeld}
      onFocus={(e) => {
        setTekst(inBeeld);
        e.currentTarget.select();
      }}
      onChange={(e) => {
        const v = e.target.value;
        setTekst(v);
        if (v.trim() === "") {
          onWijzig(0);
          return;
        }
        const n = be.terug(v, eenheid);
        if (n !== null) onWijzig(n);
      }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        const nu = parseFloat(inBeeld) || 0;
        const n = Math.round((nu + (e.key === "ArrowUp" ? stapInBeeld : -stapInBeeld)) * 1000) / 1000;
        setTekst(String(n));
        onWijzig(be.terug(String(n), eenheid) ?? waarde);
      }}
      onBlur={() => setTekst(null)}
    />
  );
}

/** Pictogram van een vorm, in de tekstkleur van de tegel. */
function VormIcoon({ vorm }: { vorm: number }) {
  const pad: Record<number, ReactNode> = {
    [VORM.I]: <path d="M21 3h22v4H34.5v16H43v4H21v-4h8.5V7H21z" />,
    [VORM.RECHTHOEK]: <rect x="24" y="4" width="16" height="22" />,
    [VORM.ROND]: <circle cx="32" cy="15" r="11" />,
    [VORM.BUIS]: <path fillRule="evenodd" d="M32 4a11 11 0 1 0 0 22a11 11 0 1 0 0-22zM32 7.5a7.5 7.5 0 1 1 0 15a7.5 7.5 0 1 1 0-15z" />,
    [VORM.KOKER]: <path fillRule="evenodd" d="M23 4h18v22H23zM26.5 7.5v15h11v-15z" />,
    [VORM.T]: <path d="M20 4h24v5H34.5v18h-5V9H20z" />,
    [VORM.U]: <path d="M23 4h18v4.5H27.5v13H41V26H23z" />,
  };
  return (
    <svg viewBox="0 0 64 30" width={64} height={30} fill="currentColor" aria-hidden="true">
      {pad[vorm]}
    </svg>
  );
}

const VORMEN: { v: number; sleutel: string }[] = [
  { v: VORM.I, sleutel: "i" },
  { v: VORM.RECHTHOEK, sleutel: "rechthoek" },
  { v: VORM.ROND, sleutel: "rond" },
  { v: VORM.BUIS, sleutel: "buis" },
  { v: VORM.KOKER, sleutel: "koker" },
  { v: VORM.T, sleutel: "t" },
  { v: VORM.U, sleutel: "u" },
];

export default function DoorsnedeDesigner() {
  const ctx = useDesigner(MARKER, DEFAULTS);
  const uitkomst = useBladUitkomst();
  const exemplaar = useActiefExemplaar();
  const alleenLezen = useAlleenLezen();
  const { t, i18n } = useTranslation("beelden");
  const eenheden = ctx.eenheden;
  const teksten = useMemo(() => {
    const basis = t("doorsnede.tekening", { returnObjects: true }) as unknown as DoorsnedeTeksten;
    // In het eenhedenstelsel van het project de maten en de spanningen omgerekend, met het
    // minteken van de tekening; zonder omrekening tekent de tekening zelf in mm en N/mm².
    const opmaak = (v: number, dec: number) => {
      const s = fmt(Math.abs(v), dec, i18n.language);
      return v < 0 && Number(s.replace(",", ".")) !== 0 ? `−${s}` : s;
    };
    return {
      ...basis,
      ...(eenheden.doel("mm") ? { maat: (mm: number) => eenheden.tekst(mm, "mm", 0, opmaak) } : {}),
      ...(eenheden.doel("N/mm²") ? {
        eenheid: eenheden.eenheid("N/mm²"),
        spanning: (w: number) => opmaak(eenheden.waarde(w, "N/mm²"), eenheden.decimalen(Math.abs(w) >= 1000 ? 0 : 1, "N/mm²")),
      } : {}),
    };
  }, [t, eenheden, i18n.language]);

  // De maat van het hele paneel en van de invoer: daarmee kiest het beeld zijn indeling, en
  // zo hoog mag de tekening worden als ze er samen onder elkaar staan.
  const paneelRef = useRef<HTMLDivElement>(null);
  const invoerRef = useRef<HTMLDivElement>(null);
  const [paneel, setPaneel] = useState({ w: 0, h: 0 });
  const [invoerH, setInvoerH] = useState(0);
  useEffect(() => {
    const el = paneelRef.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setPaneel({ w: e[0].contentRect.width, h: e[0].contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ctx.actief]);
  useEffect(() => {
    const el = invoerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((e) => setInvoerH(e[0].contentRect.height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ctx.actief]);

  if (!ctx.actief) return null;
  const { d, set, box, wrapRef } = ctx;
  const vorm = Math.round(d("vorm")) || VORM.I;
  const profiel = Math.round(d("profiel"));
  const eigenMaten = vorm !== VORM.I || profiel === 0;
  const def = maakDoorsnede(d);
  const uit = uitkomst?.getallen ?? {};
  const smal = !alleenLezen && paneel.w > 0 && paneel.w < SMAL_PANEEL;

  const beschikbaar = alleenLezen ? Math.min(box.w, PAPIER_BREEDTE) : Math.min(box.w, MAX_BREEDTE);
  const maxHoogte = alleenLezen ? 450
    : smal ? Math.max(MIN_TEKENING, paneel.h - invoerH - KOP_EN_VOET)
    : Math.max(MIN_TEKENING, box.h);
  const tekening = tekenDoorsnede(def, uit, teksten, beschikbaar, !alleenLezen, maxHoogte);
  // Is de kolom smaller dan de kleinste tekening, dan schaalt het hele vak mee.
  const schaal = Math.min(1, beschikbaar / tekening.breedte);
  const inhoud = { __html: tekening.svg };

  const v = (sleutel: string) => t(`doorsnede.velden.${sleutel}`);
  /** Symbool en eenheid staan er altijd; de omschrijving valt weg als de invoer boven de tekening staat. */
  const rij = (symbool: ReactNode, eenheid: string, sleutel: string, naam = sleutel) => (
    <label title={v(sleutel)}>
      <span>{symbool} ({eenheden.eenheid(eenheid)})<span className="ds-lang">, {v(sleutel)}</span></span>
      <Veld waarde={d(naam)} stap={STAP[naam] ?? 1} eenheid={eenheid} be={eenheden} onWijzig={(w) => set(naam, w)} />
    </label>
  );

  const bewaar = () => {
    const naam = (exemplaar?.naam ?? MARKER).replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || MARKER;
    const los = tekenDoorsnede(def, uit, teksten, Math.max(box.w, 760));
    bewaarAls(los.svg, `${naam}.svg`, "image/svg+xml");
  };

  return (
    <div ref={paneelRef} className="vd-panel" data-afdrukhoogte="inhoud">
      <UitkomstKop titel={t("doorsnede.titel")} uitkomst={uitkomst} />

      <div className="vd-body" style={smal ? { flex: "none", flexDirection: "column", alignItems: "stretch" } : { flex: 1, minHeight: 0, alignItems: "stretch" }}>
        <div ref={invoerRef} className={`vd-controls vd-compact${smal ? " ds-smal" : ""}`} style={smal ? { width: "auto" } : { alignSelf: "stretch", overflowY: "auto", minHeight: 0 }}>
          <div className="ds-vormen">
            <IconKeuze
              label={t("doorsnede.koppen.vorm")}
              waarde={vorm}
              opties={VORMEN.map((o) => ({ v: o.v, label: t(`doorsnede.vormenLang.${o.sleutel}`), kort: t(`doorsnede.vormen.${o.sleutel}`), icoon: <VormIcoon vorm={o.v} /> }))}
              onChange={(w) => set("vorm", w)}
            />
          </div>

          <span className="vd-ctrl-h">{t("doorsnede.koppen.maten")}</span>
          {vorm === VORM.I && (
            <label>{v("profiel")}
              <select value={profiel} onChange={(e) => set("profiel", parseInt(e.target.value))}>
                <option value={0}>{v("eigen")}</option>
                {profielOpties().map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
              </select>
            </label>
          )}
          {(vorm === VORM.ROND || vorm === VORM.BUIS) && rij("D", "mm", "D")}
          {vorm === VORM.BUIS && rij("t", "mm", "t")}
          {eigenMaten && vorm !== VORM.ROND && vorm !== VORM.BUIS && rij("b", "mm", vorm === VORM.I || vorm === VORM.T ? "flensbreedte" : "b", "b")}
          {eigenMaten && vorm !== VORM.ROND && vorm !== VORM.BUIS && rij("h", "mm", "h")}
          {eigenMaten && (vorm === VORM.I || vorm === VORM.T) && rij(<>t<sub>w</sub></>, "mm", "t_w")}
          {eigenMaten && vorm === VORM.KOKER && rij(<>t<sub>w</sub></>, "mm", "t_wKoker", "t_w")}
          {eigenMaten && vorm === VORM.U && rij(<>t<sub>w</sub></>, "mm", "t_wU", "t_w")}
          {eigenMaten && (vorm === VORM.I || vorm === VORM.T || vorm === VORM.U) && rij(<>t<sub>f</sub></>, "mm", "t_f")}
          {eigenMaten && vorm === VORM.KOKER && rij(<>t<sub>f</sub></>, "mm", "t_fKoker", "t_f")}
          {eigenMaten && vorm === VORM.I && rij("r", "mm", "r")}

          <span className="vd-ctrl-h">{t("doorsnede.koppen.krachten")}</span>
          {rij(<>N<sub>x</sub></>, "kN", "N_x")}
          {rij(<>M<sub>y</sub></>, "kNm", "M_y")}
          {rij(<>M<sub>z</sub></>, "kNm", "M_z")}
          {rij(<>V<sub>y</sub></>, "kN", "V_y")}
          {rij(<>V<sub>z</sub></>, "kN", "V_z")}
          {rij(<>f<sub>y</sub></>, "N/mm²", "f_y")}
          <span className="gd-note ds-noot">{t("doorsnede.noot")}</span>
        </div>

        <div ref={wrapRef} className="vd-canvases" style={{
          ...(smal ? { flex: "none", overflow: "visible" } : { flex: 1, borderLeft: "1px solid var(--theme-border-subtle, #d1d5db)", paddingLeft: 18 }),
          minWidth: 0,
        }}>
          <div className="vd-canvas" style={{ flex: "none" }}>
            <div className="vd-stage" style={{ width: tekening.breedte * schaal, height: tekening.hoogte * schaal, background: "transparent", border: "none", borderRadius: 0 }}>
              <div className="vd-svg vd-svg-pas" dangerouslySetInnerHTML={inhoud} />
              {!alleenLezen && tekening.maten.map((m) => (
                <Dim key={m.naam} ctx={ctx} name={m.naam} value={m.waarde} x={m.x * schaal} y={m.y * schaal} label={m.label} eenheid="mm" />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="vd-foot">
        <span>{t("doorsnede.klik")}</span>
        <button type="button" className="settings-btn settings-btn-secondary" onClick={bewaar}>{t("doorsnede.bewaarSvg")}</button>
      </div>
    </div>
  );
}
