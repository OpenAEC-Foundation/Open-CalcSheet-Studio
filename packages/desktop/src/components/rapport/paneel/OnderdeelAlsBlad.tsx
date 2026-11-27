import type { ReactNode } from "react";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { blijvendAlsRekentekst, veranderlijkAlsRekentekst, zonderOnderdeel, type Belastingonderdeel } from "../../../rapport/belastingenAlsBlad";
import { opzetVan, titelVan, zoekKnoop } from "../../../rapport/opzet";
import { useProjectStore } from "../../../store/projectStore";
import { useRapport } from "./velden";

/**
 * Een onderdeel van hoofdstuk 5 dat ook een blad kan zijn (Rapport.bladVoor): dan staat hier
 * waar het vandaan komt, met een knop naar het blad, en niet het formulier. Anders het
 * formulier, met eronder de knop die er een blad van maakt (rapport/belastingenAlsBlad.ts).
 */
export default function OnderdeelAlsBlad({ knoopId, onderdeel, children }: {
  knoopId: string;
  onderdeel: Belastingonderdeel;
  children: ReactNode;
}) {
  const { t } = useTranslation("rapport");
  const rapport = useRapport();
  const blad = useProjectStore((s) => {
    const id = s.rapport.bladVoor?.[knoopId];
    return id ? s.exemplaren.find((e) => e.id === id) : undefined;
  });
  const selecteer = useProjectStore((s) => s.selecteer);
  const werkBij = useProjectStore((s) => s.werkRapportBij);
  const vul = useProjectStore((s) => s.vulOnderdeelMetBlad);

  if (blad) {
    return (
      <div className="rapport-kaart rapport-alsblad">
        <p className="rapport-hint">{t("alsBlad.uitBlad", { naam: blad.naam })}</p>
        <div className="rapport-knoppen">
          <button type="button" className="rapport-knop" onClick={() => selecteer(blad.id)}>
            {t("alsBlad.open")}
          </button>
          <button
            type="button"
            className="rapport-knop"
            title={t("alsBlad.losUitleg")}
            onClick={() =>
              werkBij((r) => {
                const { [knoopId]: _weg, ...rest } = r.bladVoor ?? {};
                return { ...r, bladVoor: rest };
              })
            }
          >
            {t("alsBlad.los")}
          </button>
        </div>
      </div>
    );
  }

  const maak = () => {
    // De tekst staat op papier in het rapport: in de taal van het rapport.
    const rt = i18next.getFixedT(rapport.taal, "rapport");
    const knoop = zoekKnoop(knoopId, opzetVan(rapport));
    const titel = knoop ? titelVan(knoop, rapport) : knoopId;
    const source = onderdeel === "blijvend"
      ? blijvendAlsRekentekst(rapport.belastingen, {
        vloerenDaken: rt("alsBlad.vloerenDaken"),
        wanden: rt("alsBlad.wanden"),
        zonderNaam: rt("opbouw.zonderNaam"),
      })
      : veranderlijkAlsRekentekst(rapport.belastingen, rapport.taal);
    vul(knoopId, titel, source, (r) => ({ ...r, belastingen: zonderOnderdeel(r.belastingen, onderdeel) }));
  };

  return (
    <>
      {children}
      <div className="rapport-knoppen rapport-alsblad-maak">
        <button type="button" className="rapport-knop" title={t("alsBlad.maakUitleg")} onClick={maak}>
          {"</>"} {t("alsBlad.maak")}
        </button>
      </div>
    </>
  );
}
