import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useDesigner, Dim, UitkomstKop } from "./designerKit";
import { useBladUitkomst } from "./bladResultaat";
import { maakPoer } from "./poerDefinitie";
import { tekenPoer, type TekeningTeksten } from "./poerTekening";
import { useActiefExemplaar, useAlleenLezen } from "../../store/actiefBlad";
import { bewaarAls } from "../../store/ifcInhoud";
import "./VoetplaatDesigner.css";

/**
 * Parametrisch beeld bij het blad "Tweepaalspoer" (templates/tweepaalspoer.ts):
 * bovenaanzicht, langsdoorsnede en dwarsdoorsnede met de gekozen staven.
 *
 * Het beeld rekent niet: de staven komen uit de invoer via de poerdefinitie
 * (poerDefinitie.ts), het staafwerk en het oordeel uit het doorgerekende blad. De SVG
 * op het scherm, op papier en in de download is dezelfde tekst (poerTekening.ts).
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

  if (!ctx.actief) return null;
  const { d, set, box, wrapRef } = ctx;

  const poer = maakPoer(d, uitkomst?.getallen ?? {});
  // Op papier kleiner dan de bladbreedte: de afdruk moet kort blijven.
  const tekening = tekenPoer(poer, teksten, alleenLezen ? Math.min(box.w, 430) : box.w, !alleenLezen);
  const inhoud = { __html: tekening.svg };

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
    <div className="vd-panel" data-afdrukhoogte="inhoud">
      <UitkomstKop titel={t("tweepaalspoer.titel")} uitkomst={uitkomst} />

      <div className="vd-body" style={{ flex: 1, minHeight: 0, alignItems: "stretch" }}>
        <div className="vd-controls vd-compact" style={{ alignSelf: "stretch", overflowY: "auto", minHeight: 0 }}>
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

        <div ref={wrapRef} className="vd-canvases" style={{ flex: 1, minWidth: 0, borderLeft: "1px solid var(--theme-border-subtle, #d1d5db)", paddingLeft: 18 }}>
          <div className="vd-canvas">
            <div className="vd-stage" style={{ width: tekening.breedte, height: tekening.hoogte, background: "transparent", border: "none", borderRadius: 0 }}>
              <div className="vd-svg" dangerouslySetInnerHTML={inhoud} />
              {!alleenLezen && tekening.maten.map((m) => (
                <Dim key={m.naam} ctx={ctx} name={m.naam} value={m.waarde} x={m.x} y={m.y} label={m.label} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="vd-foot">
        <span>{t("tweepaalspoer.klik")}</span>
        <button type="button" className="settings-btn settings-btn-secondary" onClick={bewaar}>{t("tweepaalspoer.bewaarSvg")}</button>
      </div>
    </div>
  );
}
