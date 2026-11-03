/**
 * De geometrie van een graaf als scène van de rekenkern (DrieDScene): dezelfde
 * vorm als een `@3d`-blok, zodat het draaibare beeld, de stilstaande projectie en
 * de afbeelding op papier allemaal met de bestaande weergave werken.
 */
import { DRIE_D_KLEUREN, type DrieDElement, type DrieDScene } from "@ifc-calc/core";
import type { Geometrie, Punt } from "./waarde.ts";

const KLEUR_PUNT = DRIE_D_KLEUREN.blauw;
const KLEUR_LIJN = DRIE_D_KLEUREN.lijn;
const KLEUR_BALK = DRIE_D_KLEUREN.staal;
const KLEUR_DOOS = DRIE_D_KLEUREN.beton;

function puntenVan(g: Geometrie): Punt[] {
  switch (g.geometrie) {
    case "punt":
      return [g.p];
    case "lijn":
    case "balk":
      return [g.van, g.naar];
    case "doos":
      return [g.hoek, [g.hoek[0] + g.maat[0], g.hoek[1] + g.maat[1], g.hoek[2] + g.maat[2]]];
  }
}

/** De grootte van het geheel: een punt schaalt ermee, want het heeft zelf geen maat. */
function omvang(geometrie: Geometrie[]): number {
  const min: Punt = [Infinity, Infinity, Infinity];
  const max: Punt = [-Infinity, -Infinity, -Infinity];
  for (const g of geometrie) {
    for (const p of puntenVan(g)) {
      for (let as = 0; as < 3; as++) {
        min[as] = Math.min(min[as], p[as]);
        max[as] = Math.max(max[as], p[as]);
      }
    }
  }
  const d = Math.hypot(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  return Number.isFinite(d) && d > 0 ? d : 1000;
}

export function graafScene(geometrie: Geometrie[]): DrieDScene {
  const r = omvang(geometrie) * 0.006;
  const elementen: DrieDElement[] = geometrie.map((g): DrieDElement => {
    switch (g.geometrie) {
      case "punt":
        return { soort: "knoop", plek: g.p, r, kleur: KLEUR_PUNT };
      case "lijn":
        return { soort: "staaf", van: g.van, naar: g.naar, kleur: KLEUR_LIJN };
      case "balk":
        return { soort: "balk", van: g.van, naar: g.naar, b: g.b, h: g.h, kleur: KLEUR_BALK };
      case "doos":
        return { soort: "doos", hoek: g.hoek, maat: g.maat, kleur: KLEUR_DOOS };
    }
  });
  return { eenheid: "mm", camera: "iso", raster: true, assen: true, hoogte: 320, elementen };
}
