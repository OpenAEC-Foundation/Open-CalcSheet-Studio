/**
 * De commando's van het tekenvlak: wat je typt in de commandoregel en wat een
 * commando van stap tot stap vraagt. Geen React en geen store: het tekenvlak
 * voert uit, hier staat alleen de betekenis. scripts/check-tekenen-symbolen.mjs
 * laadt dit rechtstreeks in Node.
 *
 * Coördinaten na een basispunt:
 *   100,50     verschuiving dx,dy vanaf het basispunt (ook als @100,50)
 *   100        afstand in de richting basispunt → muis (met ortho: die as)
 *   100<45     afstand onder een hoek (graden, met de klok mee)
 *   =400,300   een absolute plek in de tekening
 */
import { draaiing, schaling, spiegeling, verplaatsing, type Omzetting, type Punt } from "./bewerk.ts";

export type CommandoNaam = "move" | "copy" | "rotate" | "mirror" | "scale" | "array" | "erase";

const ALIASSEN: Record<string, CommandoNaam> = {
  move: "move", m: "move", mv: "move",
  copy: "copy", co: "copy", cp: "copy",
  rotate: "rotate", ro: "rotate",
  mirror: "mirror", mi: "mirror",
  scale: "scale", sc: "scale",
  array: "array", ar: "array",
  erase: "erase", e: "erase", del: "erase", delete: "erase",
};

export const commandoVan = (tekst: string): CommandoNaam | null => ALIASSEN[tekst.trim().toLowerCase()] ?? null;

/** Tekengereedschap dat je ook kunt typen. */
const GEREEDSCHAP: Record<string, string> = {
  l: "lijn", line: "lijn",
  pl: "polylijn", pline: "polylijn",
  c: "cirkel", circle: "cirkel",
  a: "boog", arc: "boog",
  rec: "rechthoek", rectangle: "rechthoek",
  t: "tekst", text: "tekst",
  dim: "maat",
};

export const gereedschapVan = (tekst: string): string | null => GEREEDSCHAP[tekst.trim().toLowerCase()] ?? null;

export type Invoer =
  | { soort: "leeg" }
  | { soort: "afstand"; d: number }
  | { soort: "rel"; dx: number; dy: number }
  | { soort: "pool"; d: number; hoek: number }
  | { soort: "abs"; x: number; y: number }
  | { soort: "fout" };

const GETAL = /^[-+]?(\d+(\.\d*)?|\.\d+)$/;
const num = (s: string) => (GETAL.test(s.trim()) ? Number(s) : null);

/** Wat er getypt is na een basispunt. */
export function leesInvoer(tekst: string): Invoer {
  const s = tekst.trim();
  if (!s) return { soort: "leeg" };
  if (s.startsWith("=")) {
    const [x, y] = s.slice(1).split(",").map(num);
    return x !== null && x !== undefined && y !== null && y !== undefined ? { soort: "abs", x, y } : { soort: "fout" };
  }
  const r = s.startsWith("@") ? s.slice(1) : s;
  if (r.includes("<")) {
    const [d, h] = r.split("<").map(num);
    return d !== null && d !== undefined && h !== null && h !== undefined ? { soort: "pool", d, hoek: h } : { soort: "fout" };
  }
  if (r.includes(",")) {
    const delen = r.split(",").map(num);
    return delen.length === 2 && delen[0] !== null && delen[1] !== null ? { soort: "rel", dx: delen[0]!, dy: delen[1]! } : { soort: "fout" };
  }
  const d = num(r);
  return d !== null ? { soort: "afstand", d } : { soort: "fout" };
}

/** Het doelpunt bij wat er getypt is; `ortho` beperkt een afstand tot de as die de muis aanwijst. */
export function doelVan(inv: Invoer, basis: Punt, muis: Punt | null, ortho: boolean): Punt | null {
  switch (inv.soort) {
    case "rel":
      return { x: basis.x + inv.dx, y: basis.y + inv.dy };
    case "abs":
      return { x: inv.x, y: inv.y };
    case "pool": {
      const a = (inv.hoek * Math.PI) / 180;
      return { x: basis.x + inv.d * Math.cos(a), y: basis.y + inv.d * Math.sin(a) };
    }
    case "afstand": {
      let dx = muis ? muis.x - basis.x : 1;
      let dy = muis ? muis.y - basis.y : 0;
      if (ortho) {
        if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      const l = Math.hypot(dx, dy);
      if (l < 1e-9) return { x: basis.x + inv.d, y: basis.y };
      return { x: basis.x + (dx / l) * inv.d, y: basis.y + (dy / l) * inv.d };
    }
    default:
      return null;
  }
}

/** Een los getal, voor een hoek, factor of aantal; hier mag de komma een decimaalteken zijn. */
export function leesGetal(tekst: string): number | null {
  const s = tekst.trim().replace(",", ".");
  return GETAL.test(s) ? Number(s) : null;
}

export type Stap = "selecteer" | "basis" | "doel" | "hoek" | "wissen" | "factor" | "aantal";

/** Een lopend commando. */
export interface Sessie {
  naam: CommandoNaam;
  stap: Stap;
  basis?: Punt;
  /** Spiegelen: het tweede punt van de as. */
  doel?: Punt;
  /** Schalen: de afstand die factor 1 geeft. */
  ref?: number;
  /** Reeks: het aantal exemplaren, het origineel meegeteld. */
  aantal?: number;
}

export const eersteStap = (naam: CommandoNaam): Stap => (naam === "array" ? "aantal" : "basis");

/** De hoek in graden van basispunt naar p. */
export const hoekNaar = (basis: Punt, p: Punt) => (Math.atan2(p.y - basis.y, p.x - basis.x) * 180) / Math.PI;

/**
 * De omzettingen die een commando bij deze plek van de muis geeft, één per
 * exemplaar in het voorbeeld (een reeks heeft er meer).
 */
export function omzettingen(s: Sessie, p: Punt): Omzetting[] {
  const b = s.basis;
  if (!b) return [];
  const dx = p.x - b.x, dy = p.y - b.y;
  switch (s.naam) {
    case "move":
    case "copy":
      return s.stap === "doel" ? [verplaatsing(dx, dy)] : [];
    case "rotate":
      return s.stap === "hoek" ? [draaiing(b, hoekNaar(b, p))] : [];
    case "mirror":
      return s.stap === "doel" && Math.hypot(dx, dy) > 1e-6 ? [spiegeling(b, p)] : [];
    case "scale":
      return s.stap === "factor" && s.ref ? [schaling(b, Math.max(0.01, Math.round((Math.hypot(dx, dy) / s.ref) * 100) / 100))] : [];
    case "array": {
      if (s.stap !== "doel") return [];
      const n = Math.max(2, s.aantal ?? 3);
      return Array.from({ length: n - 1 }, (_, i) => verplaatsing((dx * (i + 1)) / (n - 1), (dy * (i + 1)) / (n - 1)));
    }
    default:
      return [];
  }
}
