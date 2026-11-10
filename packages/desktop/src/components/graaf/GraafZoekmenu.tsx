import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { NodeSoort } from "../../graaf/model";
import { zoekNodes } from "../../graaf/zoeken";

/*
 * Het zoekmenu voor een nieuwe node: opent bij dubbelklik op het vlak, of als je
 * een verbinding loslaat op een lege plek. Zoekt zoals de catalogus (zoeken.ts);
 * Enter kiest de bovenste, de pijltjes bewegen.
 */

export function GraafZoekmenu({ x, y, onKies, onSluit }: {
  /** De plek in het vlak, in px vanaf de linkerbovenhoek. */
  x: number;
  y: number;
  onKies: (soort: NodeSoort) => void;
  onSluit: () => void;
}) {
  const { t, i18n } = useTranslation("werkruimte");
  const [zoek, setZoek] = useState("");
  const [actief, setActief] = useState(0);

  const treffers = useMemo(() => {
    const anders = i18n.getFixedT(i18n.language?.startsWith("en") ? "nl" : "en", "werkruimte");
    return zoekNodes(zoek, (k) => t(k), (k) => anders(k));
  }, [zoek, t, i18n]);

  return (
    <div
      className="graaf-zoekmenu"
      style={{ left: x, top: y }}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <input
        className="graaf-zoekveld"
        autoFocus
        value={zoek}
        placeholder={t("graaf.zoeken")}
        aria-label={t("graaf.zoeken")}
        onChange={(e) => {
          setZoek(e.target.value);
          setActief(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") onSluit();
          if (e.key === "Enter" && treffers[actief]) onKies(treffers[actief]);
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActief((a) => Math.min(a + 1, treffers.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActief((a) => Math.max(a - 1, 0));
          }
        }}
      />
      <div className="graaf-zoeklijst" role="listbox">
        {treffers.length === 0 && <div className="graaf-zoekleeg">{t("graaf.geenTreffers")}</div>}
        {treffers.map((s, i) => (
          <button
            key={s}
            type="button"
            role="option"
            aria-selected={i === actief}
            className={`graaf-zoekregel${i === actief ? " actief" : ""}`}
            onPointerEnter={() => setActief(i)}
            onClick={() => onKies(s)}
          >
            <span className="graaf-zoeknaam">{t(`graaf.soort.${s}`)}</span>
            <span className="graaf-zoekuitleg">{t(`graaf.uitleg.${s}`)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
