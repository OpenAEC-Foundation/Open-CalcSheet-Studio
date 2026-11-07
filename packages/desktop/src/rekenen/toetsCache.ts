/**
 * De antwoorden van Open FEM Studio op `@toets`-blokken, in deze sessie, op de
 * hash van hun invoer (packages/core/src/toetsBlok.ts).
 *
 * Zuiver, zonder React of Tauri: de rekenworker en de API (mcp/rekenen.ts) laden
 * dit ook. Het vragen zelf staat in femToetsing.ts. Vastleggen in het
 * projectbestand komt in de volgende stap; tot dan geldt een antwoord tot de app
 * sluit.
 */
import type { EvalOpties, EvaluatedNode, ToetsAntwoord, ToetsVerzoek } from "@ifc-calc/core";

const antwoorden = new Map<string, ToetsAntwoord>();
let versie = 0;
const luisteraars = new Set<() => void>();

/** Alle antwoorden, voor `EvalOpties.toetsingen`. */
export function toetsingenNu(): Record<string, ToetsAntwoord> {
  return Object.fromEntries(antwoorden);
}

/** Telt op bij elk nieuw antwoord: een doorrekening met een oudere versie is verouderd. */
export function toetsVersie(): number {
  return versie;
}

export function heeftToetsAntwoord(hash: string): boolean {
  return antwoorden.has(hash);
}

export function zetToetsAntwoord(hash: string, antwoord: ToetsAntwoord): void {
  antwoorden.set(hash, antwoord);
  versie++;
  for (const l of luisteraars) l();
}

export function abonneerToetsingen(l: () => void): () => void {
  luisteraars.add(l);
  return () => {
    luisteraars.delete(l);
  };
}

/**
 * De opties met de antwoorden erbij. `vragen` alleen in de werkruimte: daar gaat
 * een verzoek naar FEM Studio. Elders (afdruk, rapport, API) staat een blok zonder
 * antwoord als niet getoetst.
 */
export function metToetsingen(opties: EvalOpties, modus: "vragen" | "lezen", taal?: string): EvalOpties {
  return { ...opties, toetsingen: toetsingenNu(), toetsModus: modus, ...(taal ? { taal } : {}) };
}

/** De verzoeken in een doorgerekend blad, ook in de takken van een `#if`. */
export function verzamelVerzoeken(nodes: readonly EvaluatedNode[]): ToetsVerzoek[] {
  const uit: ToetsVerzoek[] = [];
  const loop = (lijst: readonly EvaluatedNode[]) => {
    for (const n of lijst) {
      if (n.type === "toets" && n.verzoek) uit.push(n.verzoek);
      const kinderen = (n as { children?: EvaluatedNode[] }).children;
      if (Array.isArray(kinderen)) loop(kinderen);
    }
  };
  loop(nodes);
  return uit;
}
