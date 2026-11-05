import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Huisstijl } from "../../../rapport/model";
import { useBureauStore } from "../../../store/bureauProfiel";
import { useProjectStore } from "../../../store/projectStore";
import { adresRegel, lettertypeNaam, zelfdeBureau } from "./hulp";
import { Sectie } from "./velden";

/** De vier kleuren van de huisstijl; het label staat in rapport.json onder bureau.kleuren. */
const KLEUREN: readonly Exclude<keyof Huisstijl, "lettertype">[] = [
  "hoofdkleur",
  "accentkleur",
  "tabeltekst",
  "invoerkleur",
];

/**
 * Sectie Bureau: de kopie van het bureauprofiel die in dit rapport is
 * vastgelegd.
 *
 * Een rapport bewaart zijn eigen kopie, zodat een uitgebracht rapport niet
 * verandert als het profiel later wijzigt (een nieuw logo, een constructeur
 * die vertrekt). Bijwerken is een bewuste stap, en één stap in ongedaan
 * maken.
 */
export default function BureauSectie() {
  const { t } = useTranslation("rapport");
  const bureau = useProjectStore((s) => s.rapport.bureau);
  // De huisstijl uit het template gaat op papier voor; toon dan ook die.
  const huisstijl = useProjectStore((s) => s.rapport.huisstijl) ?? bureau.huisstijl;
  const werkBij = useProjectStore((s) => s.werkRapportBij);
  const profiel = useBureauStore((s) => s.profiel);

  const gelijk = useMemo(() => zelfdeBureau(bureau, profiel), [bureau, profiel]);
  const vastgelegd = bureau.naam.trim() !== "";
  const profielIngevuld = profiel.naam.trim() !== "";

  const bijwerken = () => {
    if (vastgelegd && !confirm(t("bureau.bijwerkenVraag"))) {
      return;
    }
    werkBij((r) => ({ ...r, bureau: structuredClone(profiel) }));
  };

  let melding: string;
  if (!vastgelegd && !profielIngevuld) {
    melding = t("bureau.geenProfiel");
  } else if (!vastgelegd) {
    melding = t("bureau.nietVastgelegd");
  } else if (!profielIngevuld) {
    melding = t("bureau.profielLeeg");
  } else if (gelijk) {
    melding = t("bureau.gelijk");
  } else {
    melding = t("bureau.wijktAf");
  }

  return (
    <Sectie
      id="bureau"
      titel={t("secties.bureau")}
      intro={t("bureau.intro")}
    >
      <p className={`rapport-melding-blok${vastgelegd && gelijk ? " rustig" : ""}`}>{melding}</p>

      {vastgelegd && (
        <div className="rapport-bureau">
          <dl>
            <dt>{t("bureau.naam")}</dt>
            <dd>{bureau.naam}</dd>
            <dt>{t("bureau.adres")}</dt>
            <dd>{adresRegel(bureau) || "—"}</dd>
            <dt>{t("bureau.telefoon")}</dt>
            <dd>{bureau.telefoon || "—"}</dd>
            <dt>{t("bureau.email")}</dt>
            <dd>{bureau.email || "—"}</dd>
            <dt>{t("bureau.constructeurs")}</dt>
            <dd>
              {bureau.constructeurs.length === 0 ? (
                "—"
              ) : (
                <ul>
                  {bureau.constructeurs.map((c, i) => (
                    <li key={i}>{[c.naam, c.telefoon, c.email].filter((s) => s.trim() !== "").join(" · ")}</li>
                  ))}
                </ul>
              )}
            </dd>
            <dt>{t("bureau.huisstijl")}</dt>
            <dd>
              <span className="rapport-kleuren">
                {KLEUREN.map((veld) => (
                  <span className="rapport-kleur" key={veld}>
                    <span className="rapport-staal" style={{ background: huisstijl[veld] }} />
                    {t(`bureau.kleuren.${veld}`)}
                  </span>
                ))}
              </span>
              <span className="rapport-lettertype" style={{ fontFamily: huisstijl.lettertype }}>
                {lettertypeNaam(huisstijl.lettertype) || "—"}
              </span>
            </dd>
          </dl>
          {bureau.logo ? (
            <img className="rapport-beeld" src={bureau.logo} alt={t("bureau.logo")} />
          ) : (
            <span className="rapport-hint">{t("bureau.geenLogo")}</span>
          )}
        </div>
      )}
      {vastgelegd && bureau.voetafbeelding && (
        <img className="rapport-voetbeeld" src={bureau.voetafbeelding} alt={t("bureau.voetafbeelding")} />
      )}

      <button
        type="button"
        className="rapport-knop rapport-knop-primair"
        disabled={!profielIngevuld || gelijk}
        onClick={bijwerken}
      >
        {t("bureau.bijwerken")}
      </button>
    </Sectie>
  );
}
