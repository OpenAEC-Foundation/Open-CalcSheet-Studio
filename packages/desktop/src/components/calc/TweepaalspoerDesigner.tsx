import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useDesigner, Dim, UitkomstKop } from "./designerKit";
import { useBladUitkomst } from "./bladResultaat";
import { maakPoer } from "./poerDefinitie";
import { tekenPoer, TEKENING_MIN_BREEDTE, type TekeningTeksten } from "./poerTekening";
import PoerModel from "./PoerModel";
import { useActiefExemplaar, useAlleenLezen } from "../../store/actiefBlad";
import { bewaarAls } from "../../store/ifcInhoud";
import "./VoetplaatDesigner.css";

/**
 * Parametrisch beeld bij het blad "Tweepaalspoer" (templates/tweepaalspoer.ts):
 * bovenaanzicht, langsdoorsnede en dwarsdoorsnede met de gekozen staven, en op het scherm
 * een draaibaar 3D-model (PoerModel.tsx) uit dezelfde definitie.
 *
 * Het beeld rekent niet: de staven komen uit de invoer via de poerdefinitie
 * (poerDefinitie.ts), het staafwerk en het oordeel uit het doorgerekende blad. De SVG
 * op het scherm, op papier en in de download is dezelfde tekst (poerTekening.ts).
 *
 * De indeling hangt af van de maat van het paneel; de tekening staat in rust altijd
 * helemaal in beeld:
 *   breed    tekening en model naast elkaar;
 *   gewoon   het model onder de tekening, de invoer links;
 *   krap     idem, met een smallere invoerkolom; past de tekening dan nog niet, dan schaalt hij;
 *   smal     de invoerkolom laat te weinig over: alles onder elkaar, en het paneel scrollt.
 */
const MARKER = "Tweepaalspoer";

// Een fictief voorbeeld. De dwarsstabiliteit staat bewust op 'niet aangetoond': dat is
// een bevestiging van de gebruiker, en het blad geeft zonder haar geen eindoordeel.
const DEFAULTS: Record<string, number> = {
  l_poer: 2100, b_poer: 580, h_poer: 900, a_hoh: 1400, e_p: 50, t_in: 50,
  paalvorm: 1, p_x: 350, p_y: 350, kolomvorm: 1, c_x: 400, c_y: 400,
  betonklasse: 30, betonstaal: 2, milieu: 2, ondergrond: 1, d_g: 16, c_o: 60, c_z: 40,
  n_t: 6, d_t: 25, s_t: 70, lagen: 1, vorm_t: 2, l_op: 600, D_m: 125,
  d_s: 12, s_s: 100, n_s: 4, n_z: 5, d_z: 12, n_b: 3, d_b: 12, n_hp: 2, d_hp: 12,
  F_Ed: 1800, F_fr: 1200, dwars: 0,
};

const DIAMETERS = [8, 10, 12, 16, 20, 25, 32];

/** Onder deze paneelbreedte past de invoerkolom niet meer naast de tekening. */
const SMAL_PANEEL = 560;
/** Onder deze paneelbreedte krijgt de invoerkolom deze breedte. */
const KRAP_PANEEL = 680;
const KRAP_INVOER = 220;
/** Vanaf deze kolombreedte staan tekening en model naast elkaar; de tekening krijgt dan dit deel. */
const NAAST_KOLOM = 720;
const NAAST_DEEL = 0.5;
const MODEL_MIN = 200;
const MODEL_KOP = 20;
const TUSSENRUIMTE = 14;

/** De breedte waarbij de tekening niet hoger is dan `maxHoogte`, en hooguit `maxBreedte` breed. */
function breedteBijHoogte(hoogteBij: (breedte: number) => number, maxBreedte: number, maxHoogte: number): number {
  if (maxBreedte <= TEKENING_MIN_BREEDTE || hoogteBij(maxBreedte) <= maxHoogte) return maxBreedte;
  if (hoogteBij(TEKENING_MIN_BREEDTE) >= maxHoogte) return TEKENING_MIN_BREEDTE;
  let klein = TEKENING_MIN_BREEDTE;
  let groot = maxBreedte;
  for (let i = 0; i < 7; i++) {
    const midden = (klein + groot) / 2;
    if (hoogteBij(midden) <= maxHoogte) klein = midden;
    else groot = midden;
  }
  return Math.floor(klein);
}

export default function TweepaalspoerDesigner() {
  const ctx = useDesigner(MARKER, DEFAULTS);
  const uitkomst = useBladUitkomst();
  const exemplaar = useActiefExemplaar();
  const alleenLezen = useAlleenLezen();
  const { t } = useTranslation("beelden");

  const teksten: TekeningTeksten = useMemo(() => ({
    bovenaanzicht: t("tweepaalspoer.bovenaanzicht"),
    langsdoorsnede: t("tweepaalspoer.langsdoorsnede"),
    dwarsdoorsnede: t("tweepaalspoer.dwarsdoorsnede"),
    trekband: t("tweepaalspoer.trekband"),
    beugels: t("tweepaalspoer.beugels"),
    zijstaven: t("tweepaalspoer.zijstaven"),
    bovenstaven: t("tweepaalspoer.bovenstaven"),
    haarspelden: t("tweepaalspoer.haarspelden"),
    laag: t("tweepaalspoer.laag"),
    lagen: t("tweepaalspoer.lagen"),
    hoh: t("tweepaalspoer.hoh"),
    rechteStaaf: t("tweepaalspoer.rechteStaaf"),
    omgebogen: t("tweepaalspoer.omgebogen"),
    been: t("tweepaalspoer.been"),
    doorn: t("tweepaalspoer.doorn"),
    sneden: t("tweepaalspoer.sneden"),
    perZijvlak: t("tweepaalspoer.perZijvlak"),
    perPaal: t("tweepaalspoer.perPaal"),
    geen: t("tweepaalspoer.geen"),
    dekkingOnder: t("tweepaalspoer.dekkingOnder"),
    dekkingZij: t("tweepaalspoer.dekkingZij"),
    staafwerk: t("tweepaalspoer.staafwerk"),
  }), [t]);

  // De breedte van het hele paneel: die hangt niet af van de indeling, de maat van de
  // tekeningkolom wel. Daarop kiezen zou de indeling heen en weer laten springen.
  const paneelRef = useRef<HTMLDivElement>(null);
  const [paneelBreedte, setPaneelBreedte] = useState(0);
  useEffect(() => {
    const el = paneelRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setPaneelBreedte(entries[0].contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ctx.actief]);

  if (!ctx.actief) return null;
  const { d, set, box, wrapRef } = ctx;

  const poer = maakPoer(d, uitkomst?.getallen ?? {});
  const smal = !alleenLezen && paneelBreedte > 0 && paneelBreedte < SMAL_PANEEL;
  const krap = !alleenLezen && !smal && paneelBreedte > 0 && paneelBreedte < KRAP_PANEEL;
  const naast = !alleenLezen && !smal && box.w >= NAAST_KOLOM;
  const hoogteBij = (breedte: number) => tekenPoer(poer, teksten, breedte, true).hoogte;
  // Op papier kleiner dan de bladbreedte: de afdruk moet kort blijven.
  const beschikbaar = alleenLezen ? Math.min(box.w, 430)
    : smal ? box.w
    : naast ? breedteBijHoogte(hoogteBij, Math.round(box.w * NAAST_DEEL), box.h)
    : breedteBijHoogte(hoogteBij, box.w, box.h - MODEL_MIN - MODEL_KOP - TUSSENRUIMTE);
  const tekening = tekenPoer(poer, teksten, beschikbaar, !alleenLezen);
  // Is de kolom smaller dan de kleinste tekening, dan schaalt het hele vak mee: anders valt er iets weg.
  const schaal = Math.min(1, beschikbaar / tekening.breedte);
  const inhoud = { __html: tekening.svg };
  // Naast elkaar even hoog als de tekening: een hoger vak voegt niets toe, de poer is laag.
  const modelHoogte = naast ? Math.max(MODEL_MIN, Math.min(box.h, tekening.hoogte * schaal) - MODEL_KOP)
    : smal ? Math.min(380, Math.max(240, Math.round(box.w * 0.62)))
    : Math.max(MODEL_MIN, Math.floor(box.h - tekening.hoogte * schaal - MODEL_KOP - TUSSENRUIMTE));

  const getal = (naam: string, stap = 10) => (
    <input type="number" step={stap} value={d(naam)}
      onChange={(e) => set(naam, parseFloat(e.target.value.replace(",", ".")) || 0)} />
  );
  const diameter = (naam: string) => (
    <select value={Math.round(d(naam))} onChange={(e) => set(naam, parseInt(e.target.value))}>
      {DIAMETERS.map((w) => <option key={w} value={w}>Ø{w}</option>)}
    </select>
  );

  const bewaar = () => {
    const naam = (exemplaar?.naam ?? MARKER).replace(/[^\p{L}\p{N} _-]+/gu, "").trim() || MARKER;
    // Altijd de tekst met de maten erin: een los bestand heeft geen knoppen.
    const los = tekenPoer(poer, teksten, Math.max(box.w, 900));
    bewaarAls(los.svg, `${naam}.svg`, "image/svg+xml");
  };

  return (
    <div ref={paneelRef} className="vd-panel" data-afdrukhoogte="inhoud">
      <UitkomstKop titel={t("tweepaalspoer.titel")} uitkomst={uitkomst} />

      <div className="vd-body" style={smal ? { flex: "none", flexDirection: "column", alignItems: "stretch" } : { flex: 1, minHeight: 0, alignItems: "stretch" }}>
        <div className="vd-controls vd-compact" style={smal ? { order: 1, width: "auto" }
          : { alignSelf: "stretch", overflowY: "auto", minHeight: 0, ...(krap ? { width: KRAP_INVOER } : {}) }}>
          <span className="vd-ctrl-h">{t("tweepaalspoer.koppen.geometrie")}</span>
          <label>{t("tweepaalspoer.velden.paalvorm")}
            <select value={Math.round(d("paalvorm"))} onChange={(e) => set("paalvorm", parseInt(e.target.value))}>
              <option value={1}>{t("tweepaalspoer.keuzes.vierkant")}</option>
              <option value={2}>{t("tweepaalspoer.keuzes.rond")}</option>
            </select>
          </label>
          <label>{t("tweepaalspoer.velden.kolomvorm")}
            <select value={Math.round(d("kolomvorm"))} onChange={(e) => set("kolomvorm", parseInt(e.target.value))}>
              <option value={1}>{t("tweepaalspoer.keuzes.rechthoekig")}</option>
              <option value={2}>{t("tweepaalspoer.keuzes.rond")}</option>
            </select>
          </label>
          <label>{t("tweepaalspoer.velden.afwijking")}{getal("e_p")}</label>

          <span className="vd-ctrl-h">{t("tweepaalspoer.trekband")}</span>
          <label>{t("tweepaalspoer.velden.aantal")}{getal("n_t", 1)}</label>
          <label>{t("tweepaalspoer.velden.diameter")}{diameter("d_t")}</label>
          <label>{t("tweepaalspoer.velden.hoh")}{getal("s_t", 5)}</label>
          <label>{t("tweepaalspoer.velden.lagen")}
            <select value={Math.round(d("lagen"))} onChange={(e) => set("lagen", parseInt(e.target.value))}>
              <option value={1}>1</option>
              <option value={2}>2</option>
            </select>
          </label>
          <label>{t("tweepaalspoer.velden.vorm")}
            <select value={Math.round(d("vorm_t"))} onChange={(e) => set("vorm_t", parseInt(e.target.value))}>
              <option value={2}>{t("tweepaalspoer.omgebogen")}</option>
              <option value={1}>{t("tweepaalspoer.rechteStaaf")}</option>
            </select>
          </label>
          {Math.round(d("vorm_t")) === 2 && (
            <>
              <label>{t("tweepaalspoer.velden.been")}{getal("l_op", 25)}</label>
              <label>{t("tweepaalspoer.velden.doorn")}{getal("D_m", 5)}</label>
            </>
          )}

          <span className="vd-ctrl-h">{t("tweepaalspoer.beugels")}</span>
          <label>{t("tweepaalspoer.velden.diameter")}{diameter("d_s")}</label>
          <label>{t("tweepaalspoer.velden.hoh")}{getal("s_s", 25)}</label>
          <label>{t("tweepaalspoer.velden.sneden")}{getal("n_s", 2)}</label>

          <span className="vd-ctrl-h">{t("tweepaalspoer.koppen.overig")}</span>
          <label>{t("tweepaalspoer.velden.zijstaven")}{getal("n_z", 1)}</label>
          <label>{t("tweepaalspoer.velden.zijDiameter")}{diameter("d_z")}</label>
          <label>{t("tweepaalspoer.velden.haarspelden")}{getal("n_hp", 1)}</label>
          <label>{t("tweepaalspoer.velden.haarspeldDiameter")}{diameter("d_hp")}</label>

          <span className="vd-ctrl-h">{t("tweepaalspoer.koppen.dwars")}</span>
          <label>{t("tweepaalspoer.velden.dwars")}
            <select value={Math.round(d("dwars"))} onChange={(e) => set("dwars", parseInt(e.target.value))}>
              <option value={0}>{t("tweepaalspoer.keuzes.nietAangetoond")}</option>
              <option value={1}>{t("tweepaalspoer.keuzes.aangetoond")}</option>
            </select>
          </label>
          <span className="gd-note">{t("tweepaalspoer.noot")}</span>
        </div>

        <div ref={wrapRef} className="vd-canvases" style={{
          ...(smal ? { flex: "none", overflow: "visible" } : { flex: 1, borderLeft: "1px solid var(--theme-border-subtle, #d1d5db)", paddingLeft: 18 }),
          ...(naast ? { flexDirection: "row", alignItems: "flex-start" } : {}),
          minWidth: 0,
        }}>
          <div className="vd-canvas" style={{ flex: "none" }}>
            <div className="vd-stage" style={{ width: tekening.breedte * schaal, height: tekening.hoogte * schaal, background: "transparent", border: "none", borderRadius: 0 }}>
              <div className="vd-svg vd-svg-pas" dangerouslySetInnerHTML={inhoud} />
              {!alleenLezen && tekening.maten.map((m) => (
                <Dim key={m.naam} ctx={ctx} name={m.naam} value={m.waarde} x={m.x * schaal} y={m.y * schaal} label={m.label} />
              ))}
            </div>
          </div>
          {!alleenLezen && <PoerModel poer={poer} hoogte={modelHoogte} naast={naast} />}
        </div>
      </div>

      <div className="vd-foot">
        <span>{t("tweepaalspoer.klik")}</span>
        <button type="button" className="settings-btn settings-btn-secondary" onClick={bewaar}>{t("tweepaalspoer.bewaarSvg")}</button>
      </div>
    </div>
  );
}
