import { useTranslation } from "react-i18next";
import { useDesigner, UitkomstKop } from "./designerKit";
import { useBladUitkomst } from "./bladResultaat";
import { maakMeerpaalPoer } from "./meerpaalDefinitie";
import { meerpaalIfcxDocument, type MeerpaalModelTeksten } from "./meerpaalIfcx";
import { detailNaarSvg, maakDetail, meerpaalVorm } from "./poerDxf";
import PoerStaaflijst, { useDetailTeksten, useTekeningStatus } from "./PoerStaaflijst";
import PoerKoppeling, { usePoerRevisie } from "./PoerKoppeling";
import { bewaarIfcx } from "./ifcxBewaren";
import { useActiefExemplaar, useAlleenLezen } from "../../store/actiefBlad";
import "./VoetplaatDesigner.css";

/**
 * Beeld bij het blad "Poer op drie of vier palen" (templates/meerpaalspoer.ts): de
 * staaflijst, en op het scherm het wapeningsdetail (plattegrond en twee doorsneden) met
 * de knoppen voor het DXF-detail en de IFCX met de wapening, en de koppeling met een
 * palenplan en de revisie van het detail (PoerKoppeling.tsx).
 *
 * Het beeld rekent niet. De staven komen uit de invoer via meerpaalDefinitie.ts, dezelfde
 * als de IFC-uitvoer; het oordeel uit het doorgerekende blad. De plattegrond en het
 * 3D-beeld van het blad zelf blijven in de uitwerking staan. Op papier alleen de staaflijst:
 * het blad blijft kort.
 */
const MARKER = "Poer op drie of vier palen";

/** De beginwaarden van het blad (?{…} in templates/meerpaalspoer.ts). */
const DEFAULTS: Record<string, number> = {
  n_p: 4, a_x: 1000, a_y: 1000, l_poer: 1700, b_poer: 1700, a_3: 1200, r_rand: 400, h_poer: 900, e_p: 50, t_in: 50,
  paalvorm: 1, p_x: 320, p_y: 320, kolomvorm: 1, c_x: 400, c_y: 400,
  betonklasse: 30, betonstaal: 2, milieu: 2, ondergrond: 1, d_g: 16, c_o: 75, c_z: 40,
  n_t: 5, d_t: 20, s_t: 80, vorm_t: 2, l_op: 500, D_m: 200, d_n: 12, s_n: 150, n_z: 3, d_z: 12,
  N_Ed: 2000, M_Edx: 0, M_Edy: 0, N_fr: 1450, M_frx: 0, M_fry: 0, horiz: 0,
};

export default function MeerpaalspoerDesigner() {
  const ctx = useDesigner(MARKER, DEFAULTS);
  const uitkomst = useBladUitkomst();
  const exemplaar = useActiefExemplaar();
  const alleenLezen = useAlleenLezen();
  const { t } = useTranslation("beelden");
  const teksten = useDetailTeksten();
  const status = useTekeningStatus(ctx.d, uitkomst);
  const poer = ctx.actief ? maakMeerpaalPoer(ctx.d) : null;
  const vorm = poer ? meerpaalVorm(poer) : null;
  const rev = usePoerRevisie(vorm);
  if (!ctx.actief || !poer || !vorm) return null;
  const { d, set, box, wrapRef } = ctx;

  const naam = exemplaar?.naam ?? MARKER;

  const bewaarModel = () => {
    const doc = meerpaalIfcxDocument(poer, {
      bladId: exemplaar?.id,
      teksten: t("poerDetail.model", { returnObjects: true }) as unknown as MeerpaalModelTeksten,
      koppeling: rev.koppeling,
    });
    if (!doc) return;
    rev.vastleggen();
    void bewaarIfcx(JSON.stringify(doc), naam, undefined);
  };
  const detail = alleenLezen ? null : detailNaarSvg(maakDetail(vorm, { titel: naam, status: status.tekst, revisie: rev.label, teksten }), Math.max(320, Math.min(box.w, 900)));

  return (
    <div className="vd-panel" data-afdrukhoogte="inhoud">
      <UitkomstKop titel={t("poerDetail.titel")} uitkomst={uitkomst} />
      <PoerStaaflijst vorm={vorm} titel={naam} bestand={naam} d={d} set={set} uitkomst={uitkomst} alleenLezen={alleenLezen}
        extra={<button type="button" className="settings-btn settings-btn-secondary" onClick={bewaarModel}>{t("poerDetail.bewaarIfcx")}</button>} />
      {!alleenLezen && <PoerKoppeling templateId="meerpaalspoer" vorm={vorm} />}
      {!alleenLezen && (
        <div ref={wrapRef} style={{ padding: "6px 16px 14px", flex: "none" }}>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4 }}>{t("poerDetail.detailKop")}</div>
          {detail && <div className="poer-detail-svg" style={{ maxWidth: "100%", overflowX: "auto" }} dangerouslySetInnerHTML={{ __html: detail.svg }} />}
        </div>
      )}
    </div>
  );
}
