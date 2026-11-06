import { STELSELS, type EvalOpties, type Grootheid, type Stelsel } from "@ifc-calc/core";
import type { ProjectGegevens } from "./projectGegevens";

/**
 * Het eenhedenstelsel van een project (docs/superpowers/specs/2026-11-06-eenheden-design.md).
 *
 * Het staat in de projectgegevens, zodat opslaan, het herstelbestand, IFCX, ongedaan
 * maken en oude bestanden vanzelf meewerken:
 *   eenheden         de keuze (een keuzeveld in PROJECT_VELDEN); ontbreekt = "blad"
 *   eenheden_eigen   bij "eigen": de eenheid per grootheid, als JSON
 *   eenheden_lijst   de eigen eenheden van het project, als JSON [{ naam, uitdrukking }]
 */

export type StelselKeuze = "blad" | "si-mm" | "si-m" | "us" | "eigen";

export const STELSEL_KEUZES: readonly StelselKeuze[] = ["blad", "si-mm", "si-m", "us", "eigen"];

/** Een eigen eenheid van het project: `kipf` = `1000 lbf`. */
export interface EigenEenheid {
  naam: string;
  uitdrukking: string;
}

/** De keuzes per grootheid bij "eigen", in de schrijfwijze van de rekenkern. */
export const GROOTHEID_KEUZES: Record<Grootheid, string[]> = {
  lengte: ["m", "mm", "ft", "in"],
  maat: ["mm", "cm", "m", "in"],
  oppervlakte: ["m^2", "ft^2"],
  doorsnedeOppervlakte: ["mm^2", "cm^2", "in^2"],
  weerstandsmoment: ["mm^3", "cm^3", "in^3"],
  traagheidsmoment: ["mm^4", "cm^4", "in^4"],
  kracht: ["N", "kN", "MN", "lbf", "kip"],
  moment: ["N mm", "kN m", "lbf in", "kip in", "kip ft"],
  lijnlast: ["kN / m", "N / mm", "plf", "klf"],
  vlakbelasting: ["kN / m^2", "kPa", "psf", "ksf"],
  spanning: ["N / mm^2", "MPa", "GPa", "psi", "ksi"],
  volumegewicht: ["kN / m^3", "pcf"],
  massa: ["kg", "t", "lb"],
};

/** Een JSON-tekst uit de projectgegevens; kapot of afwezig geeft `leeg`. */
function leesJson<T>(tekst: string | undefined, leeg: T, past: (x: unknown) => x is T): T {
  if (!tekst) return leeg;
  try {
    const x: unknown = JSON.parse(tekst);
    return past(x) ? x : leeg;
  } catch {
    return leeg;
  }
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** De eenheid per grootheid bij "eigen"; alleen bekende grootheden met een tekst. */
export function eigenStelselVan(g: ProjectGegevens): Stelsel {
  const ruw = leesJson<Record<string, unknown>>(g.eenheden_eigen, {}, isObject);
  const uit: Stelsel = {};
  for (const grootheid of Object.keys(GROOTHEID_KEUZES) as Grootheid[]) {
    const e = ruw[grootheid];
    if (typeof e === "string" && e.trim()) uit[grootheid] = e;
  }
  return uit;
}

/** De eigen eenheden van het project; een onvolledige regel valt weg. */
export function eigenEenhedenVan(g: ProjectGegevens): EigenEenheid[] {
  const ruw = leesJson<unknown[]>(g.eenheden_lijst, [], Array.isArray);
  return ruw.flatMap((r) =>
    isObject(r) && typeof r.naam === "string" && typeof r.uitdrukking === "string" && r.naam.trim() && r.uitdrukking.trim()
      ? [{ naam: r.naam.trim(), uitdrukking: r.uitdrukking.trim() }]
      : [],
  );
}

/** De keuze van het project; een onbekende waarde telt als "blad". */
export function stelselKeuzeVan(g: ProjectGegevens): StelselKeuze {
  const k = g.eenheden as StelselKeuze | undefined;
  return k && STELSEL_KEUZES.includes(k) ? k : "blad";
}

/** Wat de rekenkern van het project meekrijgt (EvalOpties). */
export function evalOptiesVan(g: ProjectGegevens): EvalOpties {
  const keuze = stelselKeuzeVan(g);
  const eigenEenheden = eigenEenhedenVan(g);
  const stelsel: Stelsel | undefined = keuze === "blad"
    ? undefined
    : keuze === "eigen"
      ? { ...STELSELS["si-mm"], ...eigenStelselVan(g) }
      : STELSELS[keuze];
  return { ...(stelsel ? { stelsel } : {}), eigenEenheden };
}

/** De namen van de eigen eenheden van het project, voor het lezen van de bladen (ParseOptions.eenheden). */
export function eigenNamenVan(g: ProjectGegevens): string[] {
  return eigenEenhedenVan(g).map((e) => e.naam);
}
