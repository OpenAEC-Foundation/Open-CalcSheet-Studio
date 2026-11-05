import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { REVISIE_STATUSSEN, type Revisie, type RevisieStatus } from "../../../rapport/model";
import { datumTekst, rapportStatus, volgendeCode } from "../../../rapport/revisies";
import { useProjectStore } from "../../../store/projectStore";
import { rijIsVast } from "../../../store/versies";
import RijenTabel, { type Kolom } from "./RijenTabel";
import { Sectie, useRapport } from "./velden";

/**
 * Sleutel van de naam van een status. De status zelf is een code; het paneel toont
 * hem in de taal van de app, het voorblad in de taal van het rapport.
 */
const STATUS_SLEUTEL: Record<RevisieStatus, string> = {
  concept: "revisies.statussen.concept",
  "ter goedkeuring": "revisies.statussen.terGoedkeuring",
  definitief: "revisies.statussen.definitief",
};

function kolommen(t: TFunction<"rapport">): Kolom<Revisie>[] {
  return [
    { sleutel: "code", kop: t("revisies.revisie"), breedte: "5em" },
    { sleutel: "datum", kop: t("revisies.datum"), breedte: "8.5em", placeholder: t("algemeen.datumVoorbeeld") },
    { sleutel: "omschrijving", kop: t("algemeen.omschrijving") },
    {
      sleutel: "status",
      kop: t("revisies.status"),
      breedte: "9.5em",
      keuzes: REVISIE_STATUSSEN.map((s) => ({ waarde: s, label: t(STATUS_SLEUTEL[s]) })),
    },
  ];
}

/** Een nieuwe revisie: de volgende code (A → B, 1 → 2) en de datum van vandaag. */
function nieuweRevisie(lijst: readonly Revisie[]): Revisie {
  return {
    code: volgendeCode([...lijst]),
    datum: datumTekst(new Date()),
    omschrijving: "",
    status: "concept",
  };
}

/**
 * Sectie Revisies. De eerste revisie geeft de eerste datum van het rapport,
 * de laatste de rapportstatus; beide staan op het voorblad.
 */
export default function RevisieSectie() {
  const { t } = useTranslation("rapport");
  const revisies = useRapport().revisies;
  const versies = useProjectStore((s) => s.versies);
  const status = rapportStatus(revisies);
  const statusSleutel = STATUS_SLEUTEL[status as RevisieStatus];
  return (
    <Sectie id="revisies" titel={t("secties.revisies")} intro={t("revisies.intro")}>
      <RijenTabel<Revisie>
        pad="revisies"
        rijen={revisies}
        kolommen={kolommen(t)}
        verplaatsbaar={false}
        nieuweRij={nieuweRevisie}
        toevoegen={t("revisies.toevoegen")}
        leeg={t("revisies.leeg")}
        vast={(rij) => rijIsVast(rij, versies)}
      />
      {versies.lijst.length > 1 && <p className="rapport-hint">{t("revisies.versieUitleg")}</p>}
      <p className="rapport-hint">
        {t("revisies.rapportstatus")} <strong>{statusSleutel ? t(statusSleutel) : status || "—"}</strong>
      </p>
    </Sectie>
  );
}
