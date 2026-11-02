import { useTranslation } from "react-i18next";
import { FASEN } from "../../../rapport/model";
import { useBureauStore } from "../../../store/bureauProfiel";
import { useProjectStore } from "../../../store/projectStore";
import { Afgeleid, Keuze, Sectie, TekstVak, Veld, useRapport, type Optie } from "./velden";

/**
 * Suggesties voor de rapporttitel; een eigen titel typen kan altijd. De titel
 * komt zo in het rapport, dus deze lijst blijft Nederlands.
 */
const TITELS = [
  "Constructieadvies & berekeningen",
  "Constructieve berekening",
  "Constructief advies",
  "Constructieve berekeningen en tekeningen",
  "Beoordeling bestaande constructie",
];

/**
 * Sectie Document: wat op het voorblad staat en niet al in de
 * projectgegevens zit.
 */
export default function DocumentSectie() {
  const { t } = useTranslation("rapport");
  const rapport = useRapport();
  const gegevens = useProjectStore((s) => s.gegevens);
  const profiel = useBureauStore((s) => s.profiel);

  // Zelfde bureau als op papier: het vastgelegde, of zolang dat leeg is het profiel.
  const bureau = rapport.bureau.naam ? rapport.bureau : profiel;
  const namen = bureau.constructeurs.map((c) => c.naam.trim()).filter((n) => n !== "");
  // Opgeslagen wordt de code (SO, VO, …); alleen de naam erachter volgt de taal.
  const faseOpties: Optie[] = [
    { waarde: "", label: t("document.faseNietVermelden") },
    ...FASEN.map((f) => ({ waarde: f, label: `${f} — ${t(`document.fasen.${f}`)}` })),
  ];
  const constructeurs: Optie[] = [
    { waarde: "", label: "—" },
    ...namen.map((n) => ({ waarde: n, label: n })),
  ];

  return (
    <Sectie
      id="document"
      titel={t("secties.document")}
      intro={t("document.intro")}
    >
      <Veld
        label={t("document.titel")}
        pad="titel"
        waarde={rapport.titel}
        lijst="rapport-titels"
        hint={t("document.titelHint")}
      />
      <datalist id="rapport-titels">
        {TITELS.map((titel) => (
          <option key={titel} value={titel} />
        ))}
      </datalist>
      <div className="rapport-rij">
        <Veld
          label={t("document.kenmerk")}
          pad="kenmerk"
          waarde={rapport.kenmerk}
          placeholder={t("document.kenmerkVoorbeeld")}
        />
        <Keuze label={t("document.fase")} pad="fase" waarde={rapport.fase} opties={faseOpties} />
      </div>
      <Veld label={t("document.normen")} pad="normen" waarde={rapport.normen} />
      <div className="rapport-rij">
        <Keuze
          label={t("document.verantwoordelijk")}
          pad="verantwoordelijk"
          waarde={rapport.verantwoordelijk}
          opties={constructeurs}
        />
        <Keuze
          label={t("document.uitvoerend")}
          pad="uitvoerend"
          waarde={rapport.uitvoerend}
          opties={constructeurs}
        />
      </div>
      {namen.length === 0 && (
        <p className="rapport-hint">{t("document.geenConstructeurs")}</p>
      )}
      <label className="rapport-veld">
        <span className="rapport-label">{t("document.adresregels")}</span>
        <TekstVak
          pad="opdrachtgeverAdres"
          waarde={rapport.opdrachtgeverAdres}
          placeholder={t("document.adresVoorbeeld")}
        />
        <span className="rapport-hint">{t("document.adresHint")}</span>
      </label>
      <Afgeleid
        uitProjectgegevens
        regels={[
          { label: t("document.projectnummer"), waarde: gegevens.project_nummer || "—" },
          { label: t("document.projectnaam"), waarde: gegevens.project_naam || "—" },
          { label: t("document.opdrachtgever"), waarde: gegevens.opdrachtgever || "—" },
          { label: t("document.locatie"), waarde: gegevens.locatie || "—" },
        ]}
      />
    </Sectie>
  );
}
