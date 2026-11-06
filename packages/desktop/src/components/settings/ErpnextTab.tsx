import { useTranslation } from "react-i18next";
import type { ErpnextInstellingen } from "../../tauri/erpnext";
import "./ErpnextTab.css";

/**
 * Wat de tab ERPNext tot Opslaan bijhoudt. Het geheim is alleen een nieuw getypt geheim:
 * het bewaarde geheim komt nooit uit de sleutelbos terug, de tab weet alleen of het er is.
 */
export interface ErpnextConcept {
  instellingen: ErpnextInstellingen;
  /** Een nieuw geheim; leeg laat het bewaarde staan. */
  geheim: string;
  /** Het bewaarde geheim wissen bij Opslaan. */
  wissen: boolean;
}

/**
 * Tab ERPNext in Instellingen: het adres, de API-sleutel, het API-geheim en de naam van
 * het locatieveld. Werkt zoals de andere tabs via Opslaan en Annuleren; het geheim gaat
 * bij Opslaan naar de sleutelbos, bij de herkomst van het adres (src/tauri/erpnext.ts).
 */
export default function ErpnextTab({
  concept,
  onChange,
  heeftGeheim,
  desktop,
}: {
  concept: ErpnextConcept;
  onChange: (volgende: ErpnextConcept) => void;
  /** Staat er een geheim in de sleutelbos voor het adres in het concept? */
  heeftGeheim: boolean;
  /** Draait de app als desktop-app? In de browser kan hij ERPNext niet bereiken. */
  desktop: boolean;
}) {
  const { t } = useTranslation("settings");
  const zet = (deel: Partial<ErpnextInstellingen>) =>
    onChange({ ...concept, instellingen: { ...concept.instellingen, ...deel } });

  // Het geheim hoort bij het adres: zonder adres is er niets om het bij te bewaren.
  const zonderAdres = concept.instellingen.adres.trim() === "";
  const geheimStatus = zonderAdres
    ? t("erpnext.geheimEerstAdres")
    : concept.geheim.trim() !== ""
      ? t("erpnext.geheimNieuw")
      : concept.wissen
        ? t("erpnext.geheimWist")
        : heeftGeheim
          ? t("erpnext.geheimBewaard")
          : t("erpnext.geheimGeen");

  return (
    <div className="erpnext-tab">
      <p className="settings-description erpnext-intro">{t("erpnext.intro")}</p>
      {!desktop && <p className="settings-description erpnext-waarschuwing">{t("erpnext.alleenDesktop")}</p>}

      <div className="settings-section">
        <h3>{t("erpnext.verbinding")}</h3>
        <label className="settings-row">
          <span className="settings-label">{t("erpnext.adres")}</span>
          <input
            className="settings-input erpnext-invoer"
            type="url"
            value={concept.instellingen.adres}
            placeholder={t("erpnext.adresVoorbeeld")}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => zet({ adres: e.target.value })}
          />
        </label>
        <p className="settings-description erpnext-hint">{t("erpnext.adresUitleg")}</p>

        <label className="settings-row">
          <span className="settings-label">{t("erpnext.sleutel")}</span>
          <input
            className="settings-input erpnext-invoer"
            value={concept.instellingen.sleutel}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => zet({ sleutel: e.target.value })}
          />
        </label>

        <div className="settings-row">
          <span className="settings-label">{t("erpnext.geheim")}</span>
          <span className="erpnext-rechts">
            <input
              className="settings-input erpnext-geheim"
              type="password"
              value={concept.geheim}
              aria-label={t("erpnext.geheim")}
              disabled={!desktop || zonderAdres}
              spellCheck={false}
              autoComplete="new-password"
              onChange={(e) => onChange({ ...concept, geheim: e.target.value, wissen: false })}
            />
            <button
              className="settings-btn settings-btn-secondary erpnext-knop"
              disabled={!desktop || zonderAdres || !heeftGeheim || concept.wissen}
              onClick={() => onChange({ ...concept, geheim: "", wissen: true })}
            >
              {t("erpnext.wissen")}
            </button>
          </span>
        </div>
        <p className="settings-description erpnext-hint">
          {geheimStatus} {t("erpnext.geheimUitleg")}
        </p>
      </div>

      <div className="settings-section">
        <h3>{t("erpnext.locatie")}</h3>
        <label className="settings-row">
          <span className="settings-label">{t("erpnext.veld")}</span>
          <input
            className="settings-input erpnext-invoer"
            value={concept.instellingen.veld}
            spellCheck={false}
            autoComplete="off"
            onChange={(e) => zet({ veld: e.target.value })}
          />
        </label>
        <p className="settings-description erpnext-hint">{t("erpnext.veldUitleg")}</p>
      </div>
    </div>
  );
}
