import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { getSetting } from "../store";

// English
import enCommon from "./locales/en/common.json";
import enRibbon from "./locales/en/ribbon.json";
import enBackstage from "./locales/en/backstage.json";
import enSettings from "./locales/en/settings.json";
import enFeedback from "./locales/en/feedback.json";
import enWerkruimte from "./locales/en/werkruimte.json";
import enRapport from "./locales/en/rapport.json";
import enRekentaal from "./locales/en/rekentaal.json";
import enBeelden from "./locales/en/beelden.json";
import enTekenen from "./locales/en/tekenen.json";
import enLibrary from "./locales/en/library.json";
import enGewichten from "./locales/en/gewichten.json";
// Dutch
import nlCommon from "./locales/nl/common.json";
import nlRibbon from "./locales/nl/ribbon.json";
import nlBackstage from "./locales/nl/backstage.json";
import nlSettings from "./locales/nl/settings.json";
import nlFeedback from "./locales/nl/feedback.json";
import nlWerkruimte from "./locales/nl/werkruimte.json";
import nlRapport from "./locales/nl/rapport.json";
import nlRekentaal from "./locales/nl/rekentaal.json";
import nlBeelden from "./locales/nl/beelden.json";
import nlTekenen from "./locales/nl/tekenen.json";
import nlLibrary from "./locales/nl/library.json";
import nlGewichten from "./locales/nl/gewichten.json";

export const LANGUAGES = [
  { code: "auto", name: "Auto-detect" },
  { code: "en", name: "English" },
  { code: "nl", name: "Nederlands" },
];

/**
 * De taal waarin de app start zolang de gebruiker niets kiest: Engels. Met
 * "auto" in de instellingen volgt de app de taal van het systeem.
 */
export const STANDAARD_TAAL = "en";

// Van de sjabloon: common, ribbon, backstage, settings, feedback. Van deze app:
// werkruimte (project, panelen, modulekiezer), rapport (het rapportpaneel),
// rekentaal (tab Rekentaal, taalreferentie, editor), beelden (parametrische beelden)
// tekenen (tab Tekenen, de tekeneditor), library (de Library in het projectpaneel) en
// gewichten (de gewichtenbibliotheek).
const ns = ["common", "ribbon", "backstage", "settings", "feedback", "werkruimte", "rapport", "rekentaal", "beelden", "tekenen", "library", "gewichten"];

i18next
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon, ribbon: enRibbon, backstage: enBackstage, settings: enSettings, feedback: enFeedback,
        werkruimte: enWerkruimte, rapport: enRapport, rekentaal: enRekentaal, beelden: enBeelden, tekenen: enTekenen, library: enLibrary,
        gewichten: enGewichten,
      },
      nl: {
        common: nlCommon, ribbon: nlRibbon, backstage: nlBackstage, settings: nlSettings, feedback: nlFeedback,
        werkruimte: nlWerkruimte, rapport: nlRapport, rekentaal: nlRekentaal, beelden: nlBeelden, tekenen: nlTekenen, library: nlLibrary,
        gewichten: nlGewichten,
      },
    },
    ns,
    // Meteen in de standaardtaal beginnen; de bewaarde keuze volgt hieronder.
    lng: STANDAARD_TAAL,
    defaultNS: "common",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    detection: {
      order: ["navigator"],
      caches: [],
    },
  });

i18next.on("languageChanged", (lng) => {
  document.documentElement.setAttribute("lang", lng);
});

// Load saved language from Tauri store on startup
// In de werkplek van de SuperCloud gaat de taal van de gebruiker daar voor.
getSetting("language", STANDAARD_TAAL).then((lang) => {
  const host = (window as { openaecHost?: { taal?: string } }).openaecHost;
  changeLanguage(host?.taal ?? lang);
});

export function changeLanguage(lang: string) {
  if (lang === "auto") {
    const detected = navigator.language?.split("-")[0] || "en";
    const supported = Object.keys(i18next.options.resources || {});
    const finalLang = supported.includes(detected) ? detected : "en";
    return i18next.changeLanguage(finalLang);
  }
  return i18next.changeLanguage(lang);
}

export default i18next;
