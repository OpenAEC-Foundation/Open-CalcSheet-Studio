/**
 * Een stuk graaf op het klembord: kopiëren en plakken binnen een grafblad en
 * tussen grafbladen.
 *
 * Het klembord krijgt gewone tekst (JSON) met de sleutel `ocss-graafstuk`. Wat
 * er bij plakken anders op staat (gewone tekst, JSON van iets anders, een kapot
 * stuk) is geen stuk graaf: `leesStuk` geeft dan null en er gebeurt niets.
 *
 * Geen React en geen store: controlescripts laden dit bestand in Node.
 */
import { GRAAF_VERSIE, leesGraaf, type GraafStuk } from "./model.ts";

const SLEUTEL = "ocss-graafstuk";

export function stukAlsTekst(stuk: GraafStuk): string {
  return JSON.stringify({ [SLEUTEL]: 1, ...stuk });
}

export function leesStuk(tekst: string): GraafStuk | null {
  let x: unknown;
  try {
    x = JSON.parse(tekst);
  } catch {
    return null;
  }
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const e = x as Record<string, unknown>;
  if (e[SLEUTEL] !== 1 || !Array.isArray(e.nodes)) return null;
  // Opgeruimd zoals een graaf uit een bestand.
  const g = leesGraaf({ versie: GRAAF_VERSIE, nodes: e.nodes, verbindingen: e.verbindingen, teksten: e.teksten, groepen: e.groepen });
  if (!g) return null;
  return { nodes: g.nodes, verbindingen: g.verbindingen, teksten: g.teksten ?? [], groepen: g.groepen ?? [] };
}
