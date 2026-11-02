/**
 * Het rapport afdrukken zoals het afdrukvoorbeeld het toont.
 *
 * Het voorbeeld bouwt zelf exacte A4-vellen, met de voetafbeelding onderaan
 * en het paginanummer rechts. Laat je de browser het rapport zelf pagineren,
 * dan zet hij de vastgezette voet bij een eigen paginaformaat op de verkeerde
 * plek en vallen koppen weg. Daarom gaat een kopie van díe vellen naar de
 * printer: wat je in het voorbeeld ziet, komt op papier.
 */

import i18next from "../../../i18n/config";
import { iframesNaarDruk } from "../../calc/iframeBlok";

const VELLEN = ".av-vellen-binnen .av-pagina";

/**
 * Wat nog getekend wordt: de pagina's van een PDF-blad (components/calc/
 * PdfBladWeergave.tsx). Zolang er zo'n element is, is de afdruk nog niet compleet.
 */
const LAADT = "[data-afdruk-laadt]";

/** Zo lang mag het tekenen van PDF-bladen hooguit duren voordat de afdruk opgeeft. */
const MAX_LADEN_MS = 180000;

/**
 * Wacht tot het voorbeeld zijn vellen heeft gebouwd en het aantal stil staat,
 * en tot er in de meetopstelling en op de vellen niets meer wordt getekend.
 * Zolang PDF-pagina's laden, geldt de ruimere grens MAX_LADEN_MS.
 */
export function wachtOpVellen(maxMs = 10000): Promise<HTMLElement[]> {
  return new Promise((klaar, mis) => {
    const begin = Date.now();
    let vorige = -1;
    const kijk = () => {
      const vellen = [...document.querySelectorAll<HTMLElement>(VELLEN)];
      const laadt = document.querySelector(`.av-meet ${LAADT}, .av-vellen-binnen ${LAADT}`) !== null;
      if (vellen.length > 0 && vellen.length === vorige && !laadt) return klaar(vellen);
      vorige = vellen.length;
      if (Date.now() - begin > (laadt ? MAX_LADEN_MS : maxMs)) {
        return mis(new Error(laadt
          ? i18next.t("werkruimte:pdf.nietOpTijd")
          : "Het afdrukvoorbeeld van het rapport bouwde geen vellen."));
      }
      window.setTimeout(kijk, 300);
    };
    kijk();
  });
}

/**
 * Wacht tot er onder `wortel` (een selector) niets meer getekend wordt: voor
 * de losse bladen, die de browser zelf pagineert (PrintDocument). Zonder
 * PDF-blad meteen klaar.
 */
export function wachtTotGetekend(wortel: string, maxMs = MAX_LADEN_MS): Promise<void> {
  return new Promise((klaar, mis) => {
    const begin = Date.now();
    const kijk = () => {
      if (document.querySelector(`${wortel} ${LAADT}`) === null) return klaar();
      if (Date.now() - begin > maxMs) return mis(new Error(i18next.t("werkruimte:pdf.nietOpTijd")));
      window.setTimeout(kijk, 200);
    };
    kijk();
  });
}

/**
 * Zet een kopie van de vellen klaar om af te drukken en verbergt de rest van
 * de app. Geeft de functie terug die alles weer opruimt.
 */
export function zetDrukvellenKlaar(vellen: HTMLElement[]): () => void {
  const bak = document.createElement("div");
  bak.className = "rpa-drukvellen";
  for (const vel of vellen) bak.appendChild(vel.cloneNode(true));
  // Een gekopieerd iframe begint opnieuw en komt leeg op papier: de geladen
  // iframes verhuizen zolang naar de kopie.
  const verhuis = iframesNaarDruk(vellen, bak);
  document.body.appendChild(bak);
  const iframesTerug = verhuis();
  document.documentElement.classList.add("rapportdruk");
  return () => {
    iframesTerug();
    bak.remove();
    document.documentElement.classList.remove("rapportdruk");
  };
}
