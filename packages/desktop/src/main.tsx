import React from "react";
import ReactDOM from "react-dom/client";
// Ontwerp 0.4: lettertypen en tokens uit het webpakket van de OpenAEC Blueprint.
import "./openaec/openaec-fonts.css";
import "./openaec/openaec-tokens.css";
import "./i18n/config";
import App from "./App";
import { version } from "../package.json";
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

// De werkplek van de OpenAEC SuperCloud: de assistent krijgt dezelfde tools als
// de MCP-server, via window.__OPDS_APP__ (mcp/werkplek.ts). Alleen als de host er is.
function werkplekTools() {
  if ((window as { openaecHost?: unknown }).openaecHost) {
    void import("./mcp/werkplek").then((m) => m.installeerWerkplekTools(version));
    return true;
  }
  return false;
}
if (!werkplekTools()) window.addEventListener("openaec-host-ready", () => void werkplekTools(), { once: true });

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
