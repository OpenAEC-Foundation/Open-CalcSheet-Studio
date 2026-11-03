import { useTranslation } from "react-i18next";
import { BIJLAGE_A, staatInHoofdstuk } from "../../../rapport/opzet";
import { useProjectStore } from "../../../store/projectStore";
import { bladVoorOpzet } from "../../calc/bladSoorten";
import { bijlageLetter, verplaatst } from "./hulp";
import { Sectie } from "./velden";

/**
 * Sectie Bijlagen. Bijlage A is altijd de uitgebreide uitwerking van de
 * berekeningen; eigen bijlagen (een constructieoverzicht, een sondering)
 * staan alleen met hun titel in de inhoud.
 */
export default function BijlagenSectie() {
  const { t } = useTranslation("rapport");
  const bijlagen = useProjectStore((s) => s.rapport.bijlagen);
  const rapport = useProjectStore((s) => s.rapport);
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const zet = useProjectStore((s) => s.zetRapportVeld);
  const werkBij = useProjectStore((s) => s.werkRapportBij);

  const wijzig = (fn: (lijst: string[]) => string[]) =>
    werkBij((r) => ({ ...r, bijlagen: fn(r.bijlagen) }));

  // Bijlage A bestaat alleen als er minstens één uitwerking in staat.
  const metA = exemplaren.some((e) => !staatInHoofdstuk(rapport, bladVoorOpzet(e)));

  // Zelfde telling als bijlagen() in rapport/opzet.ts: een bijlage zonder titel telt niet mee.
  let volgnummer = 0;
  const letters = bijlagen.map((t) => (t.trim() === "" ? "–" : bijlageLetter(volgnummer++)));

  return (
    <Sectie
      id="bijlagen"
      titel={t("secties.bijlagen")}
      intro={t("bijlagen.intro")}
    >
      <ol className="rapport-bijlagen">
        <li>
          <span className="rapport-letter">A</span>
          {/* De titel van bijlage A zoals hij in het rapport staat, dus Nederlands. */}
          <span className="rapport-vast">
            {BIJLAGE_A}
            {metA ? "" : ` — ${t("bijlagen.vervalt")}`}
          </span>
        </li>
        {bijlagen.map((titel, i) => (
          <li key={i}>
            <span className="rapport-letter">{letters[i]}</span>
            <input
              type="text"
              value={titel}
              placeholder={t("bijlagen.titelVoorbeeld")}
              aria-label={t("bijlagen.titelVan", { letter: letters[i] })}
              onChange={(e) => zet(`bijlagen.${i}`, e.target.value)}
            />
            <button
              type="button"
              className="rapport-icoon"
              title={t("algemeen.omhoog")}
              disabled={i === 0}
              onClick={() => wijzig((l) => verplaatst(l, i, -1))}
            >
              ↑
            </button>
            <button
              type="button"
              className="rapport-icoon"
              title={t("algemeen.omlaag")}
              disabled={i === bijlagen.length - 1}
              onClick={() => wijzig((l) => verplaatst(l, i, 1))}
            >
              ↓
            </button>
            <button
              type="button"
              className="rapport-icoon"
              title={t("bijlagen.verwijderen")}
              onClick={() => wijzig((l) => l.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </li>
        ))}
      </ol>
      <button type="button" className="rapport-knop" onClick={() => wijzig((l) => [...l, ""])}>
        + {t("bijlagen.toevoegen")}
      </button>
    </Sectie>
  );
}
