import { useTranslation } from "react-i18next";
import { useProjectStore, PROJECT_ID, RAPPORT_ID, VERSIES_ID } from "../store/projectStore";
import { revisieVan } from "../store/versies";
import "./DocumentBar.css";

/**
 * Balk boven de werkruimte: welk projectbestand open is, en welk rekenblad
 * daarbinnen. Eén project is één bestand, dus één tab — de bladen erin zijn
 * geen losse documenten maar onderdelen van dezelfde berekening; je kiest ze
 * in de projectboom. Het amberkleurige stipje betekent: nog niet opgeslagen. Heeft het project meer
 * versies, dan staat de code van de versie erbij: je moet altijd zien waar je in werkt.
 */
export default function DocumentBar() {
  const { t } = useTranslation("werkruimte");
  const projectNaam = useProjectStore((s) => s.projectNaam);
  const dirty = useProjectStore((s) => s.dirty);
  const activeId = useProjectStore((s) => s.activeId);
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const versieCode = useProjectStore((s) => (s.versies.lijst.length > 1 ? (revisieVan(s.versies.actief, s.rapport)?.code ?? "") : ""));

  const bladNaam =
    activeId === PROJECT_ID
      ? t("algemeen.projectgegevens")
      : activeId === RAPPORT_ID
        ? t("algemeen.rapport")
        : activeId === VERSIES_ID
          ? t("versies.titel")
          : (exemplaren.find((e) => e.id === activeId)?.naam ?? null);

  const title = `${projectNaam || t("bestand.naamloos")}.ifccalculation`;

  return (
    <div className="document-bar">
      <div className="document-tabs">
        <button className="document-tab active" type="button" title={title}>
          <span className="document-tab-title">{title}</span>
          {versieCode && <span className="document-tab-blad">{t("versies.inBalk", { code: versieCode })}</span>}
          {bladNaam && <span className="document-tab-blad">› {bladNaam}</span>}
          {dirty && <span className="document-tab-modified" title={t("bestand.nietOpgeslagen")} />}
        </button>
      </div>
    </div>
  );
}
