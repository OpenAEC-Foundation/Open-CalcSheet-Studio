/**
 * Het rapport afdrukken zoals het afdrukvoorbeeld het toont.
 *
 * Het voorbeeld bouwt zelf exacte A4-vellen, met de voetafbeelding onderaan
 * en het paginanummer rechts. Laat je de browser het rapport zelf pagineren,
 * dan zet hij de vastgezette voet bij een eigen paginaformaat op de verkeerde
 * plek en vallen koppen weg. Daarom gaat een kopie van díe vellen naar de
 * printer: wat je in het voorbeeld ziet, komt op papier.
 *
 * Die printer is de printdialoog of, bij de knop Rapport (PDF), een bestand. De app
 * blijft daarbij op het scherm staan; alleen de afdruk ziet de kopie (RapportAfdruk.css).
 */

import i18next from "../../../i18n/config";
import { meldRapportPdfFout, schrijfRapportPdf } from "../../../tauri/rapportPdf";
import { iframesNaarDruk } from "../../calc/iframeBlok";

const VELLEN = ".av-vellen-binnen .av-pagina";

/**
 * Wat nog getekend wordt: de pagina's van een PDF-blad (components/calc/
 * PdfBladWeergave.tsx). Zolang er zo'n element is, is de afdruk nog niet compleet.
 */
const LAADT = "[data-afdruk-laadt]";

/** Zo lang mag het tekenen van PDF-bladen hooguit stilstaan voordat de afdruk opgeeft. */
const MAX_LADEN_MS = 180000;

/** Een langere stilte tussen twee keer kijken: de hoofdthread was bezig, dus er gebeurt iets. */
const BEZIG_MS = 1000;

/**
 * Wacht tot het voorbeeld zijn vellen heeft gebouwd en het aantal stil staat,
 * tot er in de meetopstelling en op de vellen niets meer wordt getekend, en tot er
 * geen nieuwe verdeling op komst is (`data-opnieuw`, AfdrukVoorbeeld.tsx): anders
 * gaat er een kopie van vellen naar de printer die het voorbeeld net vervangt.
 *
 * `maxMs` is hoe lang er niets mag gebeuren, niet hoe lang het mag duren: de bladen
 * doorrekenen zet de hoofdthread vast, en bij een groot project kost de eerste
 * verdeling zo tien seconden. Zolang PDF-pagina's laden, geldt de ruimere grens
 * MAX_LADEN_MS.
 */
export function wachtOpVellen(maxMs = 10000): Promise<HTMLElement[]> {
  return new Promise((klaar, mis) => {
    let beweging = Date.now();
    let vorigeKeer = beweging;
    let vorige = -1;
    const kijk = () => {
      const nu = Date.now();
      const vellen = [...document.querySelectorAll<HTMLElement>(VELLEN)];
      const laadt = document.querySelector(`.av-meet ${LAADT}, .av-vellen-binnen ${LAADT}`) !== null;
      const opnieuw = document.querySelector(".av-meet[data-opnieuw]") !== null;
      if (vellen.length > 0 && vellen.length === vorige && !laadt && !opnieuw) return klaar(vellen);
      if (opnieuw || vellen.length !== vorige || nu - vorigeKeer > BEZIG_MS) beweging = nu;
      vorige = vellen.length;
      vorigeKeer = nu;
      if (nu - beweging > (laadt ? MAX_LADEN_MS : maxMs)) {
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
 * Wacht tot de afbeeldingen op de kopie er zijn: een PDF-pagina is een afbeelding,
 * en die mag niet als leeg vak op papier komen. Een afbeelding die niet lukt, houdt
 * de afdruk niet tegen.
 */
export async function wachtOpDrukbeelden(): Promise<void> {
  await Promise.all([...document.querySelectorAll<HTMLImageElement>(".rpa-drukvellen img")]
    .map((b) => (b.complete ? null : b.decode().catch(() => null))));
}

/**
 * Schrijft de klaargezette vellen naar een bestand. Lukt dat niet, dan zegt een melding
 * waarom en geeft dit `false`: de aanroeper valt terug op de printdialoog, waar je een
 * andere plek kunt kiezen.
 */
export async function vellenNaarPdf(pad: string): Promise<boolean> {
  try {
    await schrijfRapportPdf(pad);
    return true;
  } catch (err) {
    await meldRapportPdfFout(pad, err);
    return false;
  }
}

/**
 * Zet een kopie van de vellen klaar om af te drukken; op papier is er niets anders
 * dan die kopie. Geeft de functie terug die alles weer opruimt.
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
