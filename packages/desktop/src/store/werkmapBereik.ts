/**
 * Een bereik uit een werkmap (.xlsx) als tabel in het rapport.
 *
 * De verwijzing is een bereiknaam ("Belastingen") of een werkblad met cellen
 * ("Belastingen!B4:F20", "'Blad 1'!$A$1:$C$9"). Een bereiknaam wordt bij elke
 * lezing opnieuw opgezocht in de werkmap: zijn rijen in het bereik ingevoegd en
 * is het bereik daardoor groter, dan groeit de tabel mee.
 *
 * De cellen komen als tekst zoals de werkmap ze toont: getallen in hun
 * getalnotatie, formules als hun uitkomst. De eerste rij is de kop van de tabel;
 * lege rijen en kolommen aan het eind van het bereik vallen weg. Een kolom met
 * alleen getallen staat rechts uitgelijnd.
 *
 * Het lezen zelf doet de rekenkern van het spreadsheet-blad (`@betteroffice/xlsx`);
 * dit bestand krijgt alleen wat daarvan nodig is (`BereikLezer`), zodat
 * scripts/check-gekoppelde-bestanden.mjs het in Node kan toetsen.
 *
 * Ook het werkmapsjabloon staat hier: per onderdeel de naam, de plek in het
 * project en de verwijzing, om bij een nieuw project op een andere werkmap toe te
 * passen.
 */

/** Het deel van een geopende werkmap dat hier nodig is. */
export interface BereikLezer {
  listDefinedNames(): { items: { name: string; refersTo: string; scope: number | null; hidden?: boolean }[] };
  readCells(verzoek: { ranges: { sheetId: string; range: { kind: "a1"; a1: string } }[] }):
    | {
      ok: true;
      sheets: { sheetId: string; name: string }[];
      ranges: { cells: { displayText: string; value: { kind: string } }[][] }[];
    }
    | { ok: false; failure?: { code?: string; message?: string } };
}

export type Verwijzing =
  | { soort: "naam"; naam: string }
  | { soort: "cellen"; blad: string; a1: string };

/** Meer cellen dan dit leest de app niet in één tabel. */
export const MAX_CELLEN = 20_000;

const CELLEN = /^([A-Z]{1,3})(\d{1,7})(?::([A-Z]{1,3})(\d{1,7}))?$/;

/**
 * Leest een verwijzing: een naam, of een werkblad met cellen. Een `=` vooraan
 * en `$` mogen. Iets anders: null.
 */
export function ontleedVerwijzing(tekst: string): Verwijzing | null {
  const t = tekst.trim().replace(/^=/, "").trim();
  if (t === "") return null;
  const uitroep = t.lastIndexOf("!");
  if (uitroep > 0) {
    let blad = t.slice(0, uitroep).trim();
    if (/^'.*'$/.test(blad)) blad = blad.slice(1, -1).replace(/''/g, "'");
    const a1 = t.slice(uitroep + 1).replace(/\$/g, "").trim().toUpperCase();
    if (blad === "" || !CELLEN.test(a1)) return null;
    return { soort: "cellen", blad, a1 };
  }
  if (/^[\p{L}_\\][\p{L}\p{N}_.\\]*$/u.test(t) && !CELLEN.test(t.toUpperCase())) return { soort: "naam", naam: t };
  return null;
}

/** De verwijzing als tekst, zoals hij in het blad en het sjabloon staat. */
export function verwijzingTekst(v: Verwijzing): string {
  if (v.soort === "naam") return v.naam;
  const blad = /^[\p{L}_][\p{L}\p{N}_.]*$/u.test(v.blad) ? v.blad : `'${v.blad.replace(/'/g, "''")}'`;
  return `${blad}!${v.a1}`;
}

function kolomNummer(letters: string): number {
  let n = 0;
  for (const c of letters) n = n * 26 + (c.charCodeAt(0) - 64);
  return n;
}

/** Aantal rijen en kolommen van "B4:F20"; één cel is 1 × 1. */
export function bereikMaat(a1: string): { rijen: number; kolommen: number } | null {
  const m = CELLEN.exec(a1);
  if (!m) return null;
  const [, k1, r1, k2 = k1, r2 = r1] = m;
  return {
    rijen: Math.abs(Number(r2) - Number(r1)) + 1,
    kolommen: Math.abs(kolomNummer(k2) - kolomNummer(k1)) + 1,
  };
}

export type BereikReden =
  | "ongeldig"
  | "naamOntbreekt"
  | "naamKapot"
  | "meerdereGebieden"
  | "bladOntbreekt"
  | "teGroot"
  | "leesFout";

export type GelezenBereik =
  | {
    ok: true;
    /** Het werkblad en de cellen die gelezen zijn; bij een naam wat de naam nu aanwijst. */
    blad: string;
    a1: string;
    /** De tekst per cel, zoals de werkmap hem toont. */
    rijen: string[][];
    /** Per cel: is het een getal? */
    getallen: boolean[][];
  }
  | { ok: false; reden: BereikReden; detail?: string };

/** De bereiknamen in de werkmap, voor de keuzelijst; verborgen namen niet. */
export function bereikNamen(wb: Pick<BereikLezer, "listDefinedNames">): string[] {
  const namen = wb
    .listDefinedNames()
    .items.filter((n) => !n.hidden && !n.name.startsWith("_xlnm.") && !/#REF!/i.test(n.refersTo))
    .map((n) => n.name);
  return [...new Set(namen)].sort((a, b) => a.localeCompare(b));
}

/** De werkbladen in de werkmap. */
export function werkbladen(wb: Pick<BereikLezer, "readCells">): string[] {
  const r = wb.readCells({ ranges: [] });
  return r.ok ? r.sheets.map((s) => s.name) : [];
}

/** Zoekt waar een verwijzing nu naar wijst: bij een naam wat de werkmap daarvoor opgeeft. */
function cellenVan(wb: BereikLezer, v: Verwijzing): { blad: string; a1: string } | { reden: BereikReden; detail?: string } {
  if (v.soort === "cellen") return { blad: v.blad, a1: v.a1 };
  const namen = wb.listDefinedNames().items.filter((n) => n.name.toLowerCase() === v.naam.toLowerCase());
  // Een naam voor de hele werkmap gaat voor een naam op één werkblad.
  const naam = namen.find((n) => n.scope === null) ?? namen[0];
  if (!naam) return { reden: "naamOntbreekt", detail: v.naam };
  if (/#REF!/i.test(naam.refersTo)) return { reden: "naamKapot", detail: naam.refersTo };
  // Meerdere gebieden: een komma buiten aanhalingstekens.
  if (/,(?=(?:[^']*'[^']*')*[^']*$)/.test(naam.refersTo)) return { reden: "meerdereGebieden", detail: naam.refersTo };
  const doel = ontleedVerwijzing(naam.refersTo);
  if (!doel || doel.soort !== "cellen") return { reden: "ongeldig", detail: naam.refersTo };
  return doel;
}

/** Lege rijen en kolommen aan het eind vallen weg. */
function snoei(rijen: string[][], getallen: boolean[][]): void {
  while (rijen.length > 0 && rijen[rijen.length - 1].every((c) => c.trim() === "")) {
    rijen.pop();
    getallen.pop();
  }
  const breedte = Math.max(0, ...rijen.map((r) => {
    let n = r.length;
    while (n > 0 && r[n - 1].trim() === "") n--;
    return n;
  }));
  for (let i = 0; i < rijen.length; i++) {
    rijen[i] = rijen[i].slice(0, breedte);
    getallen[i] = getallen[i].slice(0, breedte);
  }
}

/** Leest het bereik van een verwijzing uit een geopende werkmap. */
export function leesBereik(wb: BereikLezer, verwijzing: string | Verwijzing): GelezenBereik {
  const v = typeof verwijzing === "string" ? ontleedVerwijzing(verwijzing) : verwijzing;
  if (!v) return { ok: false, reden: "ongeldig", detail: typeof verwijzing === "string" ? verwijzing : "" };
  const plek = cellenVan(wb, v);
  if ("reden" in plek) return { ok: false, ...plek };
  const maat = bereikMaat(plek.a1);
  if (!maat) return { ok: false, reden: "ongeldig", detail: plek.a1 };
  if (maat.rijen * maat.kolommen > MAX_CELLEN) return { ok: false, reden: "teGroot", detail: plek.a1 };
  const catalogus = wb.readCells({ ranges: [] });
  if (!catalogus.ok) return { ok: false, reden: "leesFout", detail: catalogus.failure?.message };
  const blad = catalogus.sheets.find((s) => s.name === plek.blad) ?? catalogus.sheets.find((s) => s.name.toLowerCase() === plek.blad.toLowerCase());
  if (!blad) return { ok: false, reden: "bladOntbreekt", detail: plek.blad };
  const r = wb.readCells({ ranges: [{ sheetId: blad.sheetId, range: { kind: "a1", a1: plek.a1 } }] });
  if (!r.ok) return { ok: false, reden: "leesFout", detail: r.failure?.message };
  const cellen = r.ranges[0]?.cells ?? [];
  const rijen = cellen.map((rij) => rij.map((c) => c.displayText ?? ""));
  const getallen = cellen.map((rij) => rij.map((c) => c.value?.kind === "number"));
  snoei(rijen, getallen);
  return { ok: true, blad: blad.name, a1: plek.a1, rijen, getallen };
}

/** Een cel als tekst in een Markdown-tabel: gewone tekst, op één regel. */
function celMd(tekst: string): string {
  const t = tekst.replace(/\r?\n/g, " ").trim();
  return t === "" ? " " : t.replace(/[\\`*_[\]<>|~&]/g, (c) => `\\${c}`);
}

/**
 * Het bereik als Markdown-tabel: de eerste rij als kop. Een kolom waarin onder de
 * kop alleen getallen staan (lege cellen tellen niet), staat rechts uitgelijnd.
 */
export function bereikNaarMarkdown(bereik: Extract<GelezenBereik, { ok: true }>): string {
  const { rijen, getallen } = bereik;
  if (rijen.length === 0) return "";
  const breedte = Math.max(1, ...rijen.map((r) => r.length));
  const rechts = Array.from({ length: breedte }, (_, k) => {
    const onder = rijen.slice(1).map((r, i) => ({ tekst: r[k] ?? "", getal: getallen[i + 1]?.[k] ?? false })).filter((c) => c.tekst.trim() !== "");
    return onder.length > 0 && onder.every((c) => c.getal);
  });
  const rij = (r: string[]) => `| ${Array.from({ length: breedte }, (_, k) => celMd(r[k] ?? "")).join(" | ")} |`;
  const scheiding = `| ${rechts.map((r) => (r ? "---:" : "---")).join(" | ")} |`;
  return `${[rij(rijen[0]), scheiding, ...rijen.slice(1).map(rij)].join("\n")}\n`;
}

// ── Sjabloon ──────────────────────────────────────────────────────────────────

export const SJABLOON_SOORT = "ocss-werkmapsjabloon";

/** Eén onderdeel van het sjabloon: een tabel in het rapport. */
export interface SjabloonOnderdeel {
  /** De naam van het blad. */
  naam: string;
  /** Een bereiknaam of `Blad!B4:F20`. */
  verwijzing: string;
  /** De plek tussen de bladen, vanaf 0. */
  plek: number;
  /** De naam van het blad ervoor, als dat er was: daarachter komt het, als het er is. */
  na?: string;
}

export interface WerkmapSjabloon {
  soort: typeof SJABLOON_SOORT;
  versie: 1;
  onderdelen: SjabloonOnderdeel[];
}

/** Een blad zoals het sjabloon het leest. */
interface BladVoorSjabloon {
  naam: string;
  md?: { koppeling?: { soort: string; verwijzing?: string } };
}

/** Het sjabloon uit de gekoppelde werkmapbereiken van een project, in de volgorde van de bladen. */
export function maakSjabloon(bladen: readonly BladVoorSjabloon[]): WerkmapSjabloon {
  const onderdelen: SjabloonOnderdeel[] = [];
  bladen.forEach((b, i) => {
    const k = b.md?.koppeling;
    if (k?.soort !== "werkmapbereik" || !k.verwijzing) return;
    onderdelen.push({ naam: b.naam, verwijzing: k.verwijzing, plek: i, ...(i > 0 ? { na: bladen[i - 1].naam } : {}) });
  });
  return { soort: SJABLOON_SOORT, versie: 1, onderdelen };
}

/** Een sjabloon uit een bestand. Iets anders, of zonder bruikbare onderdelen: null. */
export function leesSjabloon(x: unknown): WerkmapSjabloon | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const s = x as { soort?: unknown; onderdelen?: unknown };
  if (s.soort !== SJABLOON_SOORT || !Array.isArray(s.onderdelen)) return null;
  const onderdelen: SjabloonOnderdeel[] = [];
  for (const o of s.onderdelen as unknown[]) {
    if (!o || typeof o !== "object") continue;
    const d = o as Partial<Record<keyof SjabloonOnderdeel, unknown>>;
    if (typeof d.verwijzing !== "string" || !ontleedVerwijzing(d.verwijzing)) continue;
    onderdelen.push({
      naam: typeof d.naam === "string" && d.naam.trim() ? d.naam.trim() : d.verwijzing,
      verwijzing: d.verwijzing,
      plek: typeof d.plek === "number" && Number.isFinite(d.plek) ? Math.max(0, Math.floor(d.plek)) : Number.MAX_SAFE_INTEGER,
      ...(typeof d.na === "string" && d.na ? { na: d.na } : {}),
    });
  }
  return onderdelen.length > 0 ? { soort: SJABLOON_SOORT, versie: 1, onderdelen } : null;
}

/** Elk onderdeel met wat de gekozen werkmap ervoor heeft. */
export function toetsSjabloon(wb: BereikLezer, sjabloon: WerkmapSjabloon): { onderdeel: SjabloonOnderdeel; bereik: GelezenBereik }[] {
  return sjabloon.onderdelen.map((onderdeel) => ({ onderdeel, bereik: leesBereik(wb, onderdeel.verwijzing) }));
}

/**
 * Waar een onderdeel in het project komt: achter het blad met de naam `na` als dat
 * er is, anders op zijn plek (of achteraan als het project korter is).
 */
export function plekVoor(onderdeel: SjabloonOnderdeel, namen: readonly string[]): number {
  if (onderdeel.na) {
    const i = namen.lastIndexOf(onderdeel.na);
    if (i >= 0) return i + 1;
  }
  return Math.min(onderdeel.plek, namen.length);
}
