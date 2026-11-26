import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { fmt } from "./designerKit";
import type { BladUitkomst } from "./bladResultaat";
import { maakStaaflijst, zijdenKort, type Staaflijst } from "./poerStaven";
import { detailNaarDxf, maakDetail, tekeningStatus, type DetailTeksten, type PoerVorm } from "./poerDxf";
import { bewaarTekstBestand, veiligeBestandsnaam } from "./poerBewaren";

/**
 * De staaflijst van een poer op het blad, met de status van de tekening en de knop voor
 * het DXF-detail. De tweepaalspoer en de poer op drie of vier palen gebruiken dit allebei.
 *
 * De staven komen uit de poerdefinitie (poerStaven.ts), dezelfde als de tekening, het
 * 3D-model en de IFC-uitvoer. Op papier staat alleen de tabel met de status in de kop;
 * de uitleg, het vinkje en de knoppen staan alleen op het scherm.
 *
 * De status is een waarde van het blad (`tekening_vrij`), zodat hij met het project wordt
 * bewaard. Vrijgegeven komt alleen in de titel als het blad zegt dat de poer voldoet.
 */
export const STATUS_VELD = "tekening_vrij";

export function useDetailTeksten(): DetailTeksten {
  const { t, i18n } = useTranslation("beelden");
  return useMemo(() => ({
    ...(t("poerDetail", { returnObjects: true }) as unknown as DetailTeksten),
    getal: (w: number, n: number) => fmt(w, n, i18n.language),
  }), [t, i18n.language]);
}

export function useTekeningStatus(d: (naam: string) => number, uitkomst: BladUitkomst | null) {
  const { t } = useTranslation("beelden");
  return tekeningStatus(Math.round(d(STATUS_VELD)) === 1, uitkomst?.resultaat.voldoet ?? null, {
    ontwerp: t("poerDetail.ontwerp"),
    vrijgegeven: t("poerDetail.vrijgegeven"),
    nietVrij: t("poerDetail.nietVrij"),
  });
}

/** `kort`: op papier, zo laag mogelijk; het blad moet kort blijven. */
export function StaaflijstTabel({ lijst, status, kort = false }: { lijst: Staaflijst; status: string; kort?: boolean }) {
  const { t, i18n } = useTranslation("beelden");
  const g = (w: number, n = 0) => fmt(w, n, i18n.language);
  const cel = { padding: kort ? "0 4px" : "1px 6px" } as const;
  const rechts = { ...cel, textAlign: "right" as const };
  return (
    <div className="poer-staaflijst" style={{ breakInside: "avoid" }}>
      <div style={{ fontWeight: 700, fontSize: kort ? 10.5 : 12, margin: kort ? "2px 0 1px" : "4px 0 2px" }}>{t("poerDetail.staaflijst")} · {status}</div>
      <table style={{ borderCollapse: "collapse", fontSize: kort ? 9.5 : 11, lineHeight: kort ? 1.05 : 1.15, fontVariantNumeric: "tabular-nums" }}>
        <thead>
          <tr style={{ borderBottom: "1.5px solid #374151" }}>
            <th style={{ ...cel, textAlign: "left" }}>{t("poerDetail.merk")}</th>
            <th style={{ ...cel, textAlign: "left" }}></th>
            <th style={rechts}>{t("poerDetail.aantal")}</th>
            <th style={rechts}>{t("poerDetail.diameter")}</th>
            <th style={{ ...cel, textAlign: "left" }}>{t("poerDetail.vorm")}</th>
            <th style={{ ...cel, textAlign: "left" }}>{t("poerDetail.zijden")}</th>
            <th style={rechts}>{t("poerDetail.lengte")}</th>
            <th style={rechts}>{t("poerDetail.totaal")}</th>
          </tr>
        </thead>
        <tbody>
          {lijst.regels.map((r) => (
            <tr key={r.merk} data-merk={r.merk} style={{ borderBottom: "1px solid #e5e7eb" }}>
              <td style={cel}>{r.merk}</td>
              <td style={cel}>{t(`poerDetail.soorten.${r.soort}`)}</td>
              <td style={rechts}>{r.aantal}</td>
              <td style={rechts}>{g(r.d)}</td>
              <td style={cel}>{r.vorm}</td>
              <td style={cel}>{r.verlopend ? t("poerDetail.verlopend") : zijdenKort(r).map((z) => g(z)).join(" / ")}</td>
              <td style={rechts}>{r.verlopend ? `${g(r.lengte)}–${g(r.lengteMax)}` : g(r.lengte)}</td>
              <td style={rechts}>{g(r.totaal / 1000, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: kort ? 9.5 : 11, marginTop: kort ? 1 : 2 }}>
        {lijst.perDiameter.map((p) => `Ø${g(p.d)}: ${g(p.lengte, 2)} m, ${g(p.massa, 1)} kg`).join(" · ")}
        {" · "}<b>{`${t("poerDetail.totaalMassa")}: ${g(lijst.massa, 1)} kg`}</b>
      </div>
    </div>
  );
}

/** De staaflijst met, op het scherm, het vinkje voor vrijgeven en de knop voor het DXF-detail. */
export default function PoerStaaflijst({ vorm, titel, bestand, d, set, uitkomst, alleenLezen, extra }: {
  vorm: PoerVorm;
  titel: string;
  bestand: string;
  d: (naam: string) => number;
  set: (naam: string, waarde: number) => void;
  uitkomst: BladUitkomst | null;
  alleenLezen: boolean;
  extra?: ReactNode;
}) {
  const { t } = useTranslation("beelden");
  const teksten = useDetailTeksten();
  const status = useTekeningStatus(d, uitkomst);
  const lijst = maakStaaflijst(vorm.staven);
  const vrij = Math.round(d(STATUS_VELD)) === 1;

  const bewaarDxf = () => {
    const detail = maakDetail(vorm, { titel, status: status.tekst, teksten, staaflijst: lijst });
    void bewaarTekstBestand(detailNaarDxf(detail), `${veiligeBestandsnaam(bestand, "poer")}.dxf`, { naam: t("poerDetail.dxfFilter"), extensie: "dxf", mime: "application/dxf" });
  };

  return (
    <div className="poer-detail" style={{ padding: alleenLezen ? "0" : "6px 16px" }}>
      <StaaflijstTabel lijst={lijst} status={status.tekst} kort={alleenLezen} />
      {!alleenLezen && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", marginTop: 6 }}>
          <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12 }}>
            <input type="checkbox" checked={vrij} onChange={(e) => set(STATUS_VELD, e.target.checked ? 1 : 0)} />
            {t("poerDetail.vrijgeven")}
          </label>
          <button type="button" className="settings-btn settings-btn-secondary" onClick={bewaarDxf}>{t("poerDetail.bewaarDxf")}</button>
          {extra}
          <span className="gd-note" style={{ flexBasis: "100%" }}>{t("poerDetail.uitleg")}</span>
        </div>
      )}
    </div>
  );
}
