/**
 * De normen van een project: per norm de editie en de nationale bijlage die in dit project
 * gelden, vastgelegd in de projectgegevens onder `normen_editie` (een JSON-lijst). Zo gaan ze
 * mee in het projectbestand (IFCX, `ocss::project`), het herstelbestand, ongedaan maken en de
 * API (`project_data_set`), en staan ze op het voorblad en in de kop van elk blad.
 *
 * Geen variabele voor de bladen (projectScope rekent alleen met PROJECT_VELDEN): een editie
 * verandert niets aan een uitkomst. De app vult hier niets in wat de gebruiker niet zelf
 * kiest; een editie die niet is ingevuld, staat op papier als "niet vastgelegd".
 *
 * Samenhang met de landenkeuze (pull request #30): de onderwerpen hieronder zijn dezelfde
 * sleutels als `Onderwerp` in `rapport/normen/landen.ts` daar, en `bladNormen` leest de
 * normen van een blad op dezelfde manier als `bladNormUit` daar. Komt die keuze erbij, dan
 * kan een lijst hier worden ingevuld uit de normen van het gekozen land, en blijft wat de
 * gebruiker hier vastlegde de bron voor de afdruk.
 */

import type { ProjectGegevens } from "./projectGegevens";

export const NORMEN_SLEUTEL = "normen_editie";

/** De onderwerpen van de landenkeuze (#30), plus `overig` voor wat daar niet onder valt. */
export const NORM_ONDERWERPEN = [
  "belastingen", "wind", "sneeuw", "aardbeving", "beton", "staal", "hout", "metselwerk", "funderingen", "overig",
] as const;

export type NormOnderwerp = (typeof NORM_ONDERWERPEN)[number];

export interface ProjectNorm {
  onderwerp: NormOnderwerp;
  /** De aanduiding, zoals NEN-EN 1995-1-1. */
  norm: string;
  /** De editie met wijzigingsbladen, zoals 2005+C1:2006+A1:2008; leeg = niet vastgelegd. */
  editie: string;
  /** De nationale bijlage met haar editie, zoals NB:2013; leeg = niet vastgelegd. */
  nb: string;
}

const isOnderwerp = (x: unknown): x is NormOnderwerp => (NORM_ONDERWERPEN as readonly unknown[]).includes(x);

/** De vastgelegde normen; een kapotte of ontbrekende lijst is leeg. Lege regels blijven staan (het formulier). */
export function normenVan(g: ProjectGegevens): ProjectNorm[] {
  const ruw = g[NORMEN_SLEUTEL];
  if (!ruw) return [];
  try {
    const lijst = JSON.parse(ruw);
    if (!Array.isArray(lijst)) return [];
    return lijst
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
      .map((r) => ({
        onderwerp: isOnderwerp(r.onderwerp) ? r.onderwerp : "overig",
        norm: typeof r.norm === "string" ? r.norm : "",
        editie: typeof r.editie === "string" ? r.editie : "",
        nb: typeof r.nb === "string" ? r.nb : "",
      }));
  } catch {
    return [];
  }
}

/** De lijst als tekst voor de projectgegevens. */
export function normenTekst(lijst: readonly ProjectNorm[]): string {
  return JSON.stringify(lijst.map(({ onderwerp, norm, editie, nb }) => ({ onderwerp, norm, editie, nb })));
}

/** De regels die er op papier toe doen: met een aanduiding. */
export function vastgelegdeNormen(g: ProjectGegevens): ProjectNorm[] {
  return normenVan(g).filter((n) => n.norm.trim() !== "");
}

/** `NEN-EN 1995-1-1` → `EN 1995-1-1`: het deel waarop een blad en een regel elkaar vinden. */
export function enDeel(aanduiding: string): string | null {
  const m = /\bEN\s?(199\d(?:-\d+){0,2})\b/.exec(aanduiding);
  return m ? `EN ${m[1]}` : null;
}

/**
 * Op welke Eurocodes rust een rekentekst? Elke `EN 199x(-y-z)` in de tekst, en EN 1990 als
 * het blad K_FI gebruikt. Hetzelfde als de normen uit `bladNormUit` in #30.
 */
export function bladNormen(source: string): string[] {
  const delen = new Set<string>();
  for (const m of source.matchAll(/\bEN\s?(199\d(?:-\d+){0,2})/g)) delen.add(`EN ${m[1]}`);
  if (/\bK_FI\b/.test(source)) delen.add("EN 1990");
  return [...delen].sort();
}

/** Valt een deel (EN 1991-1-4) onder een vastgelegde regel (EN 1991-1-4, of EN 1991 voor alle delen)? */
function dekt(regel: ProjectNorm, deel: string): boolean {
  const r = enDeel(regel.norm);
  return r !== null && (r === deel || deel.startsWith(`${r}-`));
}

export interface BladNorm {
  /** Het deel zoals het blad het noemt. */
  deel: string;
  /** De vastgelegde regel, of null als het project dit deel niet noemt. */
  regel: ProjectNorm | null;
}

/**
 * De normen van een blad met wat het project ervan vastlegt, voor de kop van het blad. Leeg
 * als het project niets vastlegt (dan blijft de kop zoals hij was) of het blad geen
 * Eurocode noemt.
 */
export function normenVoorBlad(g: ProjectGegevens, source: string): BladNorm[] {
  const lijst = vastgelegdeNormen(g);
  if (lijst.length === 0) return [];
  return bladNormen(source).map((deel) => ({ deel, regel: lijst.find((r) => dekt(r, deel)) ?? null }));
}

/** Het onderwerp bij een deel van de Eurocodes, voor een nieuwe regel. */
export function onderwerpVan(deel: string): NormOnderwerp {
  const n = deel.replace(/^EN\s?/, "");
  if (n.startsWith("1990") || n === "1991-1-1" || n === "1991") return "belastingen";
  if (n.startsWith("1991-1-4")) return "wind";
  if (n.startsWith("1991-1-3")) return "sneeuw";
  if (n.startsWith("1991")) return "belastingen";
  if (n.startsWith("1992")) return "beton";
  if (n.startsWith("1993")) return "staal";
  if (n.startsWith("1994")) return "staal";
  if (n.startsWith("1995")) return "hout";
  if (n.startsWith("1996")) return "metselwerk";
  if (n.startsWith("1997")) return "funderingen";
  if (n.startsWith("1998")) return "aardbeving";
  return "overig";
}

/**
 * Nieuwe regels voor de normen die de bladen noemen en het project nog niet dekt: alleen de
 * aanduiding en het onderwerp. Editie en nationale bijlage vult de gebruiker in.
 */
export function normenUitBladen(huidig: readonly ProjectNorm[], bronnen: readonly string[]): ProjectNorm[] {
  const delen = new Set<string>();
  for (const s of bronnen) for (const d of bladNormen(s)) delen.add(d);
  const nieuw: ProjectNorm[] = [];
  for (const deel of [...delen].sort()) {
    if (huidig.some((r) => dekt(r, deel)) || nieuw.some((r) => dekt(r, deel))) continue;
    nieuw.push({ onderwerp: onderwerpVan(deel), norm: deel, editie: "", nb: "" });
  }
  return nieuw;
}
