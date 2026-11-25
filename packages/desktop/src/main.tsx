import React from "react";
import ReactDOM from "react-dom/client";
// Ontwerp 0.4: lettertypen en tokens uit het webpakket van de OpenAEC Blueprint.
import "./openaec/openaec-fonts.css";
import "./openaec/openaec-tokens.css";
import "./i18n/config";
import App from "./App";
import { version } from "../package.json";
import { IN_WERKPLEK, zetPopupOmweg, zetWorkerOmweg } from "./werkplek/werkplek";
import { useProjectStore } from "./store/projectStore";
import { usePrintStore } from "./store/printStore";
import { useBureauStore } from "./store/bureauProfiel";
import { leesProjectBestand } from "./store/projectBestand";
import { wachtOpDrukbeelden, wachtOpVellen, zetDrukvellenKlaar } from "./components/rapport/afdruk/drukvellen";
import "./themes.css";
import "./App.css";

// Alleen tijdens ontwikkeling: de stores op `window`, voor scripts/rapport-pdf.mjs.
// Dat script stuurt een headless browser aan en moet dezelfde stores raken als
// de app. Zelf importeren via een URL gaat mis zodra Vite een module heeft
// vernieuwd: de app laadt dan `…/projectStore.ts?t=…`, een losse kopie met een
// eigen store. In een productiebouw valt dit blok weg.
if (import.meta.env.DEV) {
  window.__ocs = { useProjectStore, usePrintStore, useBureauStore, leesProjectBestand, wachtOpVellen, zetDrukvellenKlaar, wachtOpDrukbeelden };
}

// De werkplek van de OpenAEC SuperCloud (alleen de platformbouw): workers in een
// opaque frame, popups als melding, en de assistent krijgt dezelfde tools als
// de MCP-server, via window.__OPDS_APP__ (mcp/werkplek.ts). De tools alleen als
// de host er is.
if (IN_WERKPLEK) {
  zetWorkerOmweg();
  zetPopupOmweg();
  const werkplekTools = () => {
    if (!(window as { openaecHost?: unknown }).openaecHost) return false;
    void import("./mcp/werkplek").then((m) => m.installeerWerkplekTools(version));
    return true;
  };
  if (!werkplekTools()) window.addEventListener("openaec-host-ready", () => void werkplekTools(), { once: true });
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
