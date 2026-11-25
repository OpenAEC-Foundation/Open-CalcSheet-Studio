import i18next from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { getSetting } from "../store";
import { IN_WERKPLEK } from "../werkplek/werkplek";

import { NAMESPACES, RESOURCES } from "./bundels";
import { BRONTAAL, TALEN } from "./talen";

/** De keuzes voor de taal van de app: automatisch, en dan de talen uit talen.ts. */
export const LANGUAGES = [
  { code: "auto", name: "Auto-detect" },
  ...TALEN.map((t) => ({ code: t.code, name: t.naam })),
];

/**
 * De taal waarin de app start zolang de gebruiker niets kiest: Engels. Met
 * "auto" in de instellingen volgt de app de taal van het systeem.
 */
export const STANDAARD_TAAL = "en";

// De namespaces zijn de bestanden in locales/<taal>/ (bundels.ts): van de sjabloon common,
// ribbon, backstage, settings, feedback; van deze app onder meer werkruimte, rapport,
// rapportteksten (wat het rapport meelevert), rekentaal, beelden, tekenen, library en gewichten.
// In de werkplek geen taaldetectie: het frame heeft geen opslag, en de host geeft de taal.
(IN_WERKPLEK ? i18next : i18next.use(LanguageDetector))
  .use(initReactI18next)
  .init({
    resources: RESOURCES,
    ns: NAMESPACES,
    // Meteen in de standaardtaal beginnen; de bewaarde keuze volgt hieronder.
    lng: STANDAARD_TAAL,
    defaultNS: "common",
    fallbackLng: BRONTAAL,
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
// In de werkplek van de SuperCloud gaat de taal van de gebruiker daar voor; een
// taal die de app niet kent, wordt Engels. Verandert hij daar, dan meldt de host
// dat met `openaec-host-preferences`.
const hostTaal = (): string | undefined => {
  const taal = (window as { openaecHost?: { taal?: string } }).openaecHost?.taal;
  if (!taal) return undefined;
  return Object.keys(i18next.options.resources || {}).includes(taal) ? taal : "en";
};
getSetting("language", STANDAARD_TAAL).then((lang) => {
  changeLanguage(hostTaal() ?? lang);
});
if (IN_WERKPLEK) {
  window.addEventListener("openaec-host-preferences", () => {
    const taal = hostTaal();
    if (taal) void changeLanguage(taal);
  });
}

export function changeLanguage(lang: string) {
  if (lang === "auto") {
    const detected = navigator.language?.split("-")[0] || BRONTAAL;
    const finalLang = TALEN.some((t) => t.code === detected) ? detected : BRONTAAL;
    return i18next.changeLanguage(finalLang);
  }
  return i18next.changeLanguage(lang);
}

export default i18next;
