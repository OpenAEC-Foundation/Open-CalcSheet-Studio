import { useState } from "react";
import { useTranslation } from "react-i18next";
import { usePrintStore } from "../../store/printStore";
import { useProjectStore, VERSIES_ID } from "../../store/projectStore";
import { maakNieuweVersie, wisselNaarVersie } from "../../store/versieActies";
import { lijnVan, versieGegevens, type Versie } from "../../store/versies";

/**
 * De versies in het zijpaneel: wisselen met één klik, en "Nieuwe versie" maakt een tak van wat er nu
 * staat. Een klik op de versie die al openstaat, opent het paneel met de vergelijking en de gegevens.
 */
export default function VersieSectie() {
  const { t } = useTranslation("werkruimte");
  const versies = useProjectStore((s) => s.versies);
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const gegevens = useProjectStore((s) => s.gegevens);
  const rapport = useProjectStore((s) => s.rapport);
  const selecteer = useProjectStore((s) => s.selecteer);
  const activeId = useProjectStore((s) => s.activeId);
  const sluitVoorbeeld = usePrintStore((s) => s.sluitVoorbeeld);
  const [nieuw, setNieuw] = useState(false);
  const stand = { versies, exemplaren, gegevens, rapport };
  const openPaneel = () => {
    sluitVoorbeeld();
    selecteer(VERSIES_ID);
  };

  const rij = (v: Versie) => {
    const { code, datum, omschrijving } = versieGegevens(stand, v);
    const actief = v.id === versies.actief;
    const naam = v.naam || omschrijving || (v.ouder ? t("versies.naamMetCode", { code }) : t("versies.origineel"));
    return (
      <button
        key={v.id}
        type="button"
        className={`pb-rij pb-inhoud${actief && activeId === VERSIES_ID ? " gekozen" : ""}`}
        style={{ paddingLeft: `${(lijnVan(versies, v.id).length - 1) * 10 + 12}px`, fontWeight: actief ? 600 : undefined }}
        aria-current={actief ? "true" : undefined}
        title={actief ? t("versies.openUitleg", { naam, datum }) : t("versies.wisselUitleg", { naam, datum })}
        onClick={() => (actief ? openPaneel() : void wisselNaarVersie(v.id))}
      >
        <span className="pb-inhoud-nummer">{code}</span>
        <span className="pb-naam">{naam}</span>
        {actief && versies.lijst.length > 1 && <span className="pb-teller">{t("versies.open")}</span>}
      </button>
    );
  };

  return (
    <>
      {versies.lijst.map(rij)}
      {nieuw ? (
        <div className="pb-rij gekozen">
          <input
            className="pb-naam-invoer"
            autoFocus
            aria-label={t("versies.nieuweOmschrijving")}
            placeholder={t("versies.nieuweOmschrijving")}
            onBlur={() => setNieuw(false)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setNieuw(false);
              if (e.key !== "Enter") return;
              const omschrijving = e.currentTarget.value.trim();
              setNieuw(false);
              void maakNieuweVersie({ omschrijving });
            }}
          />
        </div>
      ) : (
        <button type="button" className="pb-rij pb-toevoegen" title={t("versies.nieuweUitleg")} onClick={() => setNieuw(true)}>
          <svg className="pb-plus" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M7 2v10M2 7h10" />
          </svg>
          <span className="pb-naam">{t("versies.nieuwe")}</span>
        </button>
      )}
    </>
  );
}
