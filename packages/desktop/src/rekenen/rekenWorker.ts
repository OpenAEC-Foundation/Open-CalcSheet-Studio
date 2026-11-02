/// <reference lib="webworker" />
/**
 * Rekent een blad door buiten de UI-thread: inlezen, doorrekenen en de
 * uitwerking opbouwen, plus wat het parametrische beeld nodig heeft.
 *
 * Een groot blad (de balklaag) kost meer dan een seconde. Op de UI-thread
 * bevroor het venster daarom bij elke toetsaanslag. Zie rekenen/doorrekening.ts
 * voor wie de verzoeken stuurt.
 */
import { parse, evaluate, render, setAngleMode, type AngleMode } from "@ifc-calc/core";
import { leesGetallen, leesResultaat, metRefNamen } from "../components/calc/bladLezen";
import type { RekenVerzoek, RekenAntwoord } from "./doorrekening";

self.onmessage = (e: MessageEvent<RekenVerzoek>) => {
  const v = e.data;
  let antwoord: RekenAntwoord;
  try {
    setAngleMode(v.hoekmodus as AngleMode);
    const ast = parse(v.source, { includes: new Map(v.includes), imageUrls: new Map(v.imageUrls) });
    const nodes = evaluate(ast, v.waarden, v.scope);
    antwoord = {
      sleutel: v.sleutel,
      html: render(nodes),
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
