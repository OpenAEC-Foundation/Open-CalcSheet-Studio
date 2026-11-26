import { uitkomstTekst, type EvaluatedNode, type Scope } from "@ifc-calc/core";

/*
 * De gekozen waarden uit de nationale bijlage van een blad, zonder React en zonder stores,
 * zodat de rekenworker (rekenen/rekenWorker.ts) en de afdruk (bladDoorrekenen.ts) ze
 * allebei lezen.
 *
 * Een blad merkt een waarde als keuze uit de nationale bijlage met een commentaarregel:
 *
 *   γ_M0 = 1.0
 *   //@nb γ_M0 6.1(1) opm. 2B
 *
 * Voor de rekentaal is dat commentaar (net als `//@eenheid` van het canvas-blad): er
 * verandert niets aan het rekenen. Na `//@nb` komen de naam van de variabele en het
 * artikel van de bijlage. De waarde is de laatste uitkomst van die naam in het blad, zoals
 * de uitwerking hem toont. Een merkteken in een tak van `#if` die niet geldt, of bij een naam
 * die het blad niet uitrekent, telt niet mee: het merkteken is commentaar en weet niet in
 * welke tak het staat, dus de uitkomst beslist. Zo kan een blad met hout en staal beide
 * keuzes merken, en staat alleen die van het gekozen materiaal in de tabel.
 */

export interface NbKeuze {
  /** De naam zoals het merkteken hem schrijft (`γ_M0`, `V_b,0`). */
  naam: string;
  /** Het artikel of de tabel van de nationale bijlage. */
  artikel: string;
  /** De uitkomst zoals de uitwerking hem toont ("1", "0.6", "27 m / s"); null bij een projectwaarde die ontbreekt. */
  waarde: string | null;
  /** Uit de projectgegevens in plaats van uit het blad (K_FI, windgebied, terreincategorie). */
  project?: boolean;
}

/** `//@nb naam artikel` op een eigen regel. */
const MERK = /^[ \t]*\/\/@nb[ \t]+(\S+)[ \t]+(.+?)[ \t]*$/gmu;

/** De naam zoals de rekenkern hem opslaat: een komma of punt in de index wordt een streepje. */
const kernNaam = (naam: string) => naam.replace(/[.,]/g, "_");

function* knopen(lijst: EvaluatedNode[]): Generator<EvaluatedNode> {
  for (const n of lijst) {
    yield n;
    if (n.type === "conditional-branch") yield* knopen(n.children);
  }
}

/** De merktekens van een blad, op volgorde; een naam die twee keer gemerkt is, één keer (de laatste). */
export function nbMerktekens(source: string): { naam: string; artikel: string }[] {
  const uit = new Map<string, { naam: string; artikel: string }>();
  for (const m of source.matchAll(MERK)) {
    uit.delete(m[1]);
    uit.set(m[1], { naam: m[1], artikel: m[2] });
  }
  return [...uit.values()];
}

/** Een waarde uit de scope als tekst, zoals op het blad; geen functie en geen fout. */
function uitScope(scope: Scope | undefined, naam: string): string | undefined {
  if (!scope || !Object.prototype.hasOwnProperty.call(scope, naam)) return undefined;
  const w = (scope as Record<string, unknown>)[naam];
  if (w === undefined || typeof w === "function") return undefined;
  try {
    return uitkomstTekst(w);
  } catch {
    return undefined;
  }
}

/**
 * De keuzes uit de nationale bijlage van een doorgerekend blad. Een waarde die verborgen
 * staat (`#hide`) komt niet in de uitwerking; die komt uit de scope na de laatste regel.
 */
export function leesNbKeuzes(source: string, nodes: EvaluatedNode[], scope?: Scope): NbKeuze[] {
  const merken = nbMerktekens(source);
  if (merken.length === 0) return [];
  const laatste = new Map<string, string>();
  for (const n of knopen(nodes)) {
    if ((n.type === "assignment" || n.type === "var-display") && typeof n.result === "string" && !n.result.startsWith("Error")) {
      laatste.set(n.name, n.result);
    }
  }
  const uit: NbKeuze[] = [];
  for (const { naam, artikel } of merken) {
    const waarde = laatste.get(kernNaam(naam)) ?? laatste.get(naam) ?? uitScope(scope, kernNaam(naam));
    if (waarde !== undefined) uit.push({ naam, artikel, waarde });
  }
  return uit;
}

/**
 * De keuzes uit de nationale bijlage die het blad via de projectgegevens gebruikt. Alleen
 * als de rekentekst de naam noemt. Het artikel is dat uit de toelichting bij het veld
 * (store/projectGegevens.ts).
 */
export function projectNbKeuzes(source: string, scope: Record<string, unknown>): NbKeuze[] {
  const uit: NbKeuze[] = [];
  const noemt = (naam: string) => new RegExp(`(^|[^\\p{L}\\p{N}_])${naam}(?![\\p{L}\\p{N}_])`, "u").test(source.replace(/^[ \t]*\/\/.*$/gm, ""));
  const tekst = (w: unknown) => (typeof w === "number" ? String(w) : typeof w === "string" ? w : null);
  if (noemt("K_FI")) uit.push({ naam: "K_FI", artikel: "B3 / NB.4 – A1.2(B)", waarde: tekst(scope.K_FI), project: true });
  if (noemt("windgebied")) uit.push({ naam: "windgebied", artikel: "4.2(1) / NB.1", waarde: tekst(scope.windgebied), project: true });
  if (noemt("terreincategorie")) uit.push({ naam: "terreincategorie", artikel: "NB.3-4.1", waarde: tekst(scope.terreincategorie), project: true });
  return uit;
}
