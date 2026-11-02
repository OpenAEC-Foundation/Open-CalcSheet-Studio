/**
 * De html van de kern, opgeschoond voor het document (uitwerkingRegels.ts). Dit is de
 * enige weg van de kern naar de pagina: de uitwerking op het scherm (Preview.tsx) en op
 * papier (PrintBlad.tsx, ook voor het afdrukvoorbeeld en het rapport).
 */
import DOMPurify from "dompurify";
import { maakOpschoner } from "./uitwerkingRegels";

export const schoonUitwerking = maakOpschoner(DOMPurify);

/**
 * Een stuk SVG zonder eigen `<svg>`, voor binnen een bestaande tekening
 * (tekenen/TekenVlak.tsx). Los gelezen zou `<image>` een html-`<img>` worden; daarom
 * met een `<svg>` eromheen, die er daarna weer af gaat.
 */
export function schoonSvgDeel(markup: string): string {
  return schoonUitwerking(`<svg>${markup}</svg>`).replace(/^<svg>/, "").replace(/<\/svg>$/, "");
}
