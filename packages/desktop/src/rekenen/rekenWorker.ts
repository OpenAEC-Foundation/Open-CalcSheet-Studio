/// <reference lib="webworker" />
/**
 * Rekent een blad door buiten de UI-thread: inlezen, doorrekenen en de
 * uitwerking opbouwen, plus wat het parametrische beeld nodig heeft.
 *
 * Een groot blad (de balklaag) kost meer dan een seconde. Op de UI-thread
 * bevroor het venster daarom bij elke toetsaanslag. Zie rekenen/doorrekening.ts
 * voor wie de verzoeken stuurt.
 */
import { setAngleMode, type AngleMode } from "@ifc-calc/core";
import { leesGetallen, leesResultaat, metRefNamen } from "../components/calc/bladLezen";
import { rekenUitwerking } from "../components/calc/canvasRekenen";
import { bronVoorUitvoer } from "../templates/vertalingen";
import type { RekenVerzoek, RekenAntwoord } from "./doorrekening";

self.onmessage = (e: MessageEvent<RekenVerzoek>) => {
  const v = e.data;
  let antwoord: RekenAntwoord;
  try {
    setAngleMode(v.hoekmodus as AngleMode);
    // De uitvoer in de taal van de app; de getallen en het oordeel lezen hetzelfde.
    const uitvoer = bronVoorUitvoer(v.source, v.taal);
    const evalOpties = v.evalOpties ?? {};
    // De eigen eenheden van het project gelden al bij het lezen (ParseOptions.eenheden).
    const opties = {
      includes: new Map(v.includes),
      imageUrls: new Map(v.imageUrls),
      eenheden: (evalOpties.eigenEenheden ?? []).map((e) => e.naam),
    };
    const { nodes, html, eenheden } = rekenUitwerking(uitvoer.bron, v.waarden, v.scope, opties, uitvoer.namen, evalOpties);
    antwoord = {
      sleutel: v.sleutel,
      html,
      eenheden,
      uitkomst: {
        resultaat: leesResultaat(nodes, v.naam),
        getallen: metRefNamen(leesGetallen(nodes), v.source),
      },
    };
  } catch (err) {
    const msg = (err as Error).message;
    antwoord = {
      sleutel: v.sleutel,
      html: `<div class="ifc-calc"><p class="calc-text" style="color:#dc2626;">Render error: ${msg}</p></div>`,
      uitkomst: null,
    };
  }
  self.postMessage(antwoord);
};
