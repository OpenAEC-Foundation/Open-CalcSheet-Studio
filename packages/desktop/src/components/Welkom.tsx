import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Icoon from "./Icoon";
import { getSetting, setSetting } from "../store";
import { useModuleKiezer } from "../store/moduleKiezer";
import { modulesPerTemplate } from "./calc/projectTree";
import "./Welkom.css";

/** Instelling: het welkomstpaneel bij het opstarten tonen. */
const INSTELLING = "welkomBijStart";

/** Het voorbeeldblad uit de bibliotheek dat de rekentaal laat zien. */
const VOORBEELD = "rekentaal-demo";

/**
 * De rekentaal in vier regels: regel en uitleg. De regels zijn rekentaal en
 * worden niet vertaald, op de tekst van de kop na (welkom.syntax.kopVoorbeeld); de
 * uitleg staat onder welkom.syntax in werkruimte.json.
 */
const SYNTAX: [string, string][] = [
  ["# 1. Invoer", "kop"],
  ["L = 4.5 m", "waarde"],
  ["#if UC ≤ 1 … #end if", "voorwaarde"],
  ["$Plot{f(x) @ x = 0 : 10}", "grafiek"],
];

/**
 * Welkomstpaneel onderin de werkruimte: hoe de app werkt, een voorbeeld van
 * code naar uitkomst, en een snelle start (voorbeeldblad, module, leeg blad).
 * Verschijnt bij het opstarten tot je dat uitzet; via Help › Aan de slag
 * altijd terug.
 */
export default function Welkom({ onSluit }: { onSluit: () => void }) {
  const { t } = useTranslation("werkruimte");
  const { t: tc } = useTranslation();
  const [bijStart, setBijStart] = useState(true);

  useEffect(() => {
    getSetting<boolean>(INSTELLING, true).then(setBijStart);
  }, []);

  const zetBijStart = (aan: boolean) => {
    setBijStart(aan);
    void setSetting(INSTELLING, aan);
  };

  const voorbeeld = () => {
    const info = modulesPerTemplate[VOORBEELD];
    if (info) useModuleKiezer.getState().voegToe(VOORBEELD, info.label);
    onSluit();
  };
  const module = () => {
    onSluit();
    useModuleKiezer.getState().openen();
  };
  const leegBlad = () => {
    useModuleKiezer.getState().voegLeegBladToe();
    onSluit();
  };

  return (
    <section className="welkom-paneel" aria-label={t("welkom.titel")}>
      <div className="welkom-uitleg">
        <h2>{t("welkom.titel")}</h2>
        <p>{t("welkom.intro")}</p>
        <ol className="welkom-stroom">
          {(["project", "bladen", "rapport"] as const).map((stap) => (
            <li key={stap} title={t(`welkom.stap.${stap}.uitleg`)}>{t(`welkom.stap.${stap}.titel`)}</li>
          ))}
        </ol>
        {/* Wat je schrijft en wat de uitwerking ervan maakt. */}
        <div className="welkom-demo" aria-hidden="true">
          <code>M_Ed = q_d*L^2/8</code>
          <span className="welkom-pijl">→</span>
          <span className="welkom-uitkomst">
            <i>M</i><sub>Ed</sub> = <span className="welkom-breuk"><span>6.2 · 4.5²</span><span>8</span></span> = <b>15.69 kNm</b>
          </span>
        </div>
        <label className="welkom-bijstart">
          <input type="checkbox" checked={bijStart} onChange={(e) => zetBijStart(e.target.checked)} />
          {t("welkom.bijStart")}
        </label>
      </div>

      <div className="welkom-acties">
        <button className="welkom-tegel welkom-hoofd" onClick={voorbeeld}>
          <Icoon id="view.report-preview" maat={24} />
          <strong>{t("welkom.voorbeeld")}</strong>
          <span>{t("welkom.voorbeeldUitleg")}</span>
        </button>
        <button className="welkom-tegel" onClick={module}>
          <Icoon id="calculation.module-picker" uit="calculations" maat={24} />
          <strong>{t("welkom.module")}</strong>
          <span>{t("welkom.moduleUitleg")}</span>
        </button>
        <button className="welkom-tegel" onClick={leegBlad}>
          <Icoon id="file.new" maat={24} />
          <strong>{t("welkom.leegBlad")}</strong>
          <span>{t("welkom.leegBladUitleg")}</span>
        </button>
      </div>

      <div className="welkom-taal">
        <h3>{t("welkom.syntaxKop")}</h3>
        <dl>
          {SYNTAX.map(([code, sleutel]) => (
            <div key={sleutel}>
              <dt><code>{sleutel === "kop" ? t("welkom.syntax.kopVoorbeeld") : code}</code></dt>
              <dd>{t(`welkom.syntax.${sleutel}`)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <button className="welkom-sluit" onClick={onSluit} title={tc("close")} aria-label={tc("close")}>
        <Icoon id="ui.close" />
      </button>
    </section>
  );
}

/** Lees bij het opstarten of het welkomstpaneel moet verschijnen. */
export function welkomBijStart(): Promise<boolean> {
  return getSetting<boolean>(INSTELLING, true);
}
