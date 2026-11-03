/**
 * De html van de kern, opgeschoond voor het document (uitwerkingRegels.ts). Dit is de
 * enige weg van de kern naar de pagina: de uitwerking op het scherm (Preview.tsx) en op
 * papier (PrintBlad.tsx, ook voor het afdrukvoorbeeld en het rapport).
 */
import DOMPurify from "dompurify";
import { linkNaarBuiten, maakOpschoner } from "./uitwerkingRegels";

export const schoonUitwerking = maakOpschoner(DOMPurify);

async function openBuiten(url: string) {
  if ("__TAURI_INTERNALS__" in window) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * Een link in de uitwerking laat de app niet verdwijnen: hij opent in de systeembrowser,
 * en wat niet naar buiten kan (een eigen protocol, een pad in de app) doet niets. Een
 * verwijzing binnen de pagina (`#…`) blijft gewoon werken.
 */
function opLink(e: MouseEvent) {
  const a = e.target instanceof Element ? e.target.closest("a") : null;
  if (!a || e.defaultPrevented || !a.closest(".calc-preview-content, .ifc-calc")) return;
  const adres = a.getAttribute("href") ?? a.getAttribute("xlink:href") ?? "";
  if (adres.startsWith("#")) return;
  e.preventDefault();
  const url = linkNaarBuiten(adres);
  if (url) void openBuiten(url);
}
document.addEventListener("click", opLink);
document.addEventListener("auxclick", opLink);

/**
 * Een stuk SVG zonder eigen `<svg>`, voor binnen een bestaande tekening
 * (tekenen/TekenVlak.tsx). Los gelezen zou `<image>` een html-`<img>` worden; daarom
 * met een `<svg>` eromheen, die er daarna weer af gaat.
 */
export function schoonSvgDeel(markup: string): string {
  return schoonUitwerking(`<svg>${markup}</svg>`).replace(/^<svg>/, "").replace(/<\/svg>$/, "");
}
