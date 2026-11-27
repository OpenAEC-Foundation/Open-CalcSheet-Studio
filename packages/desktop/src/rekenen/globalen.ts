/**
 * De globale variabelen van het project: wat de bladen met `#global` aanbieden
 * (core/src/globaal.ts), als rekentekst voor de projecttekst.
 *
 * De bladen rekenen in de volgorde van de projectboom. Een blad met `#global` kent de
 * globale variabelen van de bladen erboven, niet die eronder: zo kan er geen kring
 * ontstaan, en volgt het de leesvolgorde van het rapport (eerst de belastingen, dan de
 * berekeningen). Daarna kent elk blad ze allemaal, ook een blad hoger in de boom.
 *
 * Bieden twee bladen dezelfde naam aan, dan geldt de onderste; dat staat in `dubbel`.
 * Een blad dat niet doorrekent, levert niets en staat in `fouten`.
 *
 * Puur en zonder React: de rekenworker en de controlescripts laden dit bestand.
 */
import { evaluateMetScope, globaleNamen, globaleRegels, heeftGlobaal, parse, type EvalOpties } from "@ifc-calc/core";
import { scopeMetVerwijzingen, verwezenBladen } from "./verwijzingen.ts";

/** Wat van een blad nodig is om zijn globale variabelen te bepalen. */
export interface GlobaalBlad {
  naam?: string;
  ref?: string;
  source: string;
  waarden: Record<string, string>;
}

export interface Globalen {
  /** De rekentekst: één regel per variabele, `g_v1 = 0.43 kN/m^2`. */
  bron: string;
  /** Per variabele het blad dat hem aanbiedt. */
  herkomst: Record<string, string>;
  /** Namen die meer dan één blad aanbiedt: de onderste geldt. */
  dubbel: string[];
  /**
   * Namen zonder bruikbare waarde, per blad: geen getal of grootheid (een tekst, een
   * matrix), of hun regel gaf een fout, bijvoorbeeld omdat ze een globale variabele van
   * een blad eronder gebruiken.
   */
  overgeslagen: { blad: string; naam: string }[];
  /** Bladen met `#global` die helemaal niet doorrekenen. */
  fouten: { blad: string; fout: string }[];
}

/** De basis waarin de bladen rekenen: de projectgegevens en de projecttekst zonder globalen. */
export interface GlobaalBasis {
  scope: Record<string, unknown>;
  evalOpties: EvalOpties;
}

const LEEG: Globalen = { bron: "", herkomst: {}, dubbel: [], overgeslagen: [], fouten: [] };

/**
 * Wat van de bladen de globale variabelen bepaalt, als tekst: de bladen met `#global`
 * en de bladen waarnaar die verwijzen. Leeg als geen blad `#global` heeft. Zo hoeft
 * wie de projecttekst volgt niet bij elke toetsaanslag in een ander blad opnieuw te rekenen.
 */
export function globaleSleutel(bladen: readonly GlobaalBlad[]): string {
  const metGlobaal = bladen.filter((b) => typeof b.source === "string" && heeftGlobaal(b.source));
  if (metGlobaal.length === 0) return "";
  return JSON.stringify(metGlobaal.map((b) => [b.ref, b.naam, b.source, b.waarden, verwezenBladen(b.source, b.waarden, bladen)]));
}

/** Alleen de laatste uitkomst: bij elke toetsaanslag in een ander blad hoeft er niets opnieuw. */
let vorige: { sleutel: string; uit: Globalen } | null = null;

export function globalenVan(bladen: readonly GlobaalBlad[], basis: GlobaalBasis): Globalen {
  const bladenSleutel = globaleSleutel(bladen);
  if (!bladenSleutel) return LEEG;
  const metGlobaal = bladen.filter((b) => typeof b.source === "string" && heeftGlobaal(b.source));
  // De bladen waarnaar ze verwijzen horen ook in de sleutel: die rekenen mee.
  const sleutel = JSON.stringify([bladenSleutel, basis.scope, basis.evalOpties]);
  if (vorige?.sleutel === sleutel) return vorige.uit;

  const regels = new Map<string, string>();
  const herkomst: Record<string, string> = {};
  const dubbel = new Set<string>();
  const overgeslagen: Globalen["overgeslagen"] = [];
  const fouten: Globalen["fouten"] = [];
  const projectBron = basis.evalOpties.project?.bron ?? "";
  const opties = { eenheden: (basis.evalOpties.eigenEenheden ?? []).map((e) => e.naam) };

  metGlobaal.forEach((blad, i) => {
    const naam = blad.naam?.trim() || blad.ref || `#${i + 1}`;
    // De globalen van de bladen erboven, na de rest van de projecttekst.
    const tot = [projectBron, ...regels.values()].filter((s) => s.trim()).join("\n");
    const evalOpties: EvalOpties = {
      ...basis.evalOpties,
      project: tot ? { ...basis.evalOpties.project, bron: tot } : undefined,
    };
    try {
      const scope = scopeMetVerwijzingen(blad.source, blad.waarden, basis.scope, verwezenBladen(blad.source, blad.waarden, bladen), opties, evalOpties);
      const uit = evaluateMetScope(parse(blad.source, opties), blad.waarden, scope, evalOpties).scope;
      const { regels: nieuw, overgeslagen: niet } = globaleRegels(uit, globaleNamen(blad.source));
      for (const regel of nieuw) {
        const variabele = regel.slice(0, regel.indexOf("=")).trim();
        if (herkomst[variabele] && herkomst[variabele] !== naam) dubbel.add(variabele);
        // Opnieuw invoegen: de onderste geldt, en staat ook onderaan in de tekst.
        regels.delete(variabele);
        regels.set(variabele, regel);
        herkomst[variabele] = naam;
      }
      for (const n of niet) overgeslagen.push({ blad: naam, naam: n });
    } catch (err) {
      fouten.push({ blad: naam, fout: (err as Error).message });
    }
  });

  const uit: Globalen = { bron: [...regels.values()].join("\n"), herkomst, dubbel: [...dubbel], overgeslagen, fouten };
  vorige = { sleutel, uit };
  return uit;
}
