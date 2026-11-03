/**
 * Het voorbeeld onder een node, als regels: voor het scherm en voor papier.
 *
 * Eén uitgang: de waarde, of per regel een element van de lijst met zijn nummer.
 * Meer uitgangen (een codeblok): per uitgang een regel met de naam ervoor.
 */
import type { NodeUitkomst } from "./rekenen.ts";
import { isLijst, waardeTekst } from "./waarde.ts";

export interface VoorbeeldRegel {
  label?: string;
  tekst: string;
}

export interface Voorbeeld {
  regels: VoorbeeldRegel[];
  /** Zoveel elementen van de lijst staan er niet meer bij. */
  rest: number;
  /** De uitgang is een lijst: het aantal elementen, ook als de lijst leeg is. */
  aantal?: number;
}

const MAX_REGELS = 8;

export function voorbeeldVan(u: NodeUitkomst | undefined, maxRegels = MAX_REGELS): Voorbeeld {
  if (!u) return { regels: [], rest: 0 };
  const namen = u.poorten.uitgangen.filter((n) => u.waarden[n] !== undefined);
  if (namen.length === 1 && u.poorten.uitgangen.length === 1) {
    const w = u.waarden[namen[0]];
    if (!isLijst(w)) return { regels: [{ tekst: waardeTekst(w) }], rest: 0 };
    return {
      regels: w.slice(0, maxRegels).map((e, i) => ({ label: String(i + 1), tekst: waardeTekst(e, 8) })),
      rest: Math.max(0, w.length - maxRegels),
      aantal: w.length,
    };
  }
  return {
    regels: namen.slice(0, maxRegels).map((n) => ({ label: n, tekst: waardeTekst(u.waarden[n], 8) })),
    rest: Math.max(0, namen.length - maxRegels),
  };
}
