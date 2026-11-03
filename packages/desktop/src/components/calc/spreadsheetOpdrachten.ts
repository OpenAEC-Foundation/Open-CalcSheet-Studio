import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import i18next from "../../i18n/config";
import { useSpreadsheetEditor } from "../../store/spreadsheetEditor";
import {
  aantalCellen, bereikA1, bereikTussen, bereikVoorstel, breedteTekens, breedteVoorTekst, CELMARGE, celVoorstel,
  doelBereik, functieTekst, heleKolom, heleRij, heeftKoprij, hoogtePunten, kolomLetters, leesNederlands, magVerwijzingHier,
  MAX_KOLOMMEN, MAX_RIJEN, somPlan, sorteerVolgorde, verschuifFormule, vulLijn,
  type Bereik, type BronCel, type Cel, type Functie, type VulRichting, type Waarde,
} from "./spreadsheetLogica";
import { normaliseerOpenVeld, openCelMetTekst, openFormuleVeld, zetAangewezen, zetVeld } from "./spreadsheetAanwijzen";

/*
 * Wat het lint, de sneltoetsen en de koppen met een spreadsheet doen. De async-API
 * van de editor kent rijen invoegen, kolombreedte en vastzetten niet, dus dit werkt
 * op de synchrone `api.handle` (SpreadsheetEditor.tsx zet `legacySyncApi` aan).
 *
 * Elke bewerking is één `applyOps`: een lijst bewerkingen is daar één stap ongedaan
 * maken, ook als er cellen en opmaak samen in zitten. `setCell` wist de opmaak van de
 * cel, dus de opmaak komt in dezelfde lijst ná de cellen. De editor tekent bij elke
 * wijziging opnieuw, en via `onUpdate` komt die ook in het project.
 */

/** Een melding voor de gebruiker, geen programmeerfout. */
export class Melding extends Error {}

const melding = (sleutel: string, opties?: Record<string, unknown>) =>
  i18next.t(`werkruimte:spreadsheet.melding.${sleutel}`, opties) as string;

/** Grootste bereik dat in één keer gekopieerd, doorgevoerd of gesorteerd wordt. */
export const MAX_CELLEN = 500_000;
/** Zoveel cellen meten we hooguit om een kolom of rij passend te maken. */
const MAX_TE_METEN = 20_000;

/** Voert een opdracht uit en toont wat misgaat. */
export function uitvoeren(actie: () => unknown): void {
  void Promise.resolve()
    .then(actie)
    .catch((fout) => {
      if (fout instanceof Melding) {
        alert(fout.message);
        return;
      }
      console.error("Spreadsheet:", fout);
      alert(melding("mislukt", { fout: (fout as Error)?.message ?? String(fout) }));
    });
}

export interface Doel {
  api: XlsxEditorApi;
  blad: number;
  sheetId: string;
  bereik: Bereik;
  focus: Cel;
}

/** Het actieve werkblad en de selectie; zonder selectie een melding. */
export function selectie(): Doel {
  const { api, blad, sheetId, bereik, focus } = useSpreadsheetEditor.getState();
  if (!api) throw new Melding(melding("geenEditor"));
  if (!bereik || !focus) throw new Melding(melding("kiesCel"));
  return { api, blad, sheetId, bereik, focus };
}

/**
 * De selectie, na het sluiten van een cel die nog openstaat. Een werkblad met
 * beveiliging laat de editor niet schrijven; `applyOps` zou dat wel doen.
 */
async function schrijfbaar(): Promise<Doel> {
  const d = selectie();
  await sluitInvoer(d.api);
  const uit = selectie();
  const lezing = uit.api.handle.readCells({ ranges: [] });
  if (lezing.ok && lezing.sheets[uit.blad]?.editable === false) throw new Melding(melding("beveiligd"));
  return uit;
}

export async function sluitInvoer(api: XlsxEditorApi): Promise<void> {
  try {
    normaliseerOpenVeld();
    await api.flushPendingInput();
  } catch {
    throw new Melding(melding("invoerGeweigerd"));
  }
}

export const rechthoek = (b: Bereik) => ({ start: { row: b.top, col: b.left }, end: { row: b.bottom, col: b.right } });

export function celOp(blad: number, at: Cel, cel: BronCel): unknown {
  return {
    type: "setCell",
    sheet: blad,
    at,
    cell: cel.formule !== null ? { formula: cel.formule } : { value: cel.waarde },
  };
}

/** Waarden en formules van een bereik, rij voor rij. */
export function leesCellen(d: Pick<Doel, "api" | "sheetId">, b: Bereik): BronCel[][] {
  const lezing = d.api.handle.readCells({
    ranges: [{ sheetId: d.sheetId, range: { kind: "rowCol", ...rechthoek(b) } }],
  });
  if (!lezing.ok) throw new Melding(lezing.failure.message);
  return lezing.ranges[0].cells.map((rij) => rij.map((c) => ({ waarde: c.value as Waarde, formule: c.formula })));
}

/** Hele kolommen of rijen beperken tot wat gevuld is; niemand wil een miljoen lege rijen. */
export function binnenGebruikt(d: Pick<Doel, "api" | "blad">, b: Bereik): Bereik {
  if (b.bottom < MAX_RIJEN - 1 && b.right < MAX_KOLOMMEN - 1) return b;
  const gebruikt = d.api.handle.selectionData(d.blad, 0, 0, "usedRange").usedRange;
  if (!gebruikt) return { ...b, bottom: b.top, right: b.left };
  return {
    ...b,
    bottom: Math.max(b.top, Math.min(b.bottom, gebruikt.bottom)),
    right: Math.max(b.left, Math.min(b.right, gebruikt.right)),
  };
}

function nietTeGroot(b: Bereik): void {
  if (aantalCellen(b) > MAX_CELLEN) throw new Melding(melding("teGroot"));
}

// ── Ongedaan maken ────────────────────────────────────────────────────────

/** Vanaf een knop buiten de editor; het toetsenbord gaat terug naar het raster. */
function geschiedenis(opdracht: "undo" | "redo"): void {
  const { api } = useSpreadsheetEditor.getState();
  if (!api) return;
  void api.commands.execute(opdracht, null);
  api.focus();
}

export const ongedaan = () => geschiedenis("undo");
export const opnieuw = () => geschiedenis("redo");

// ── Rijen en kolommen ─────────────────────────────────────────────────────

/** De rijen waarop een opdracht werkt; een hele kolom geselecteerd telt als de actieve rij. */
const rijenVan = (d: Doel) => (heleKolom(d.bereik) ? { van: d.focus.row, tot: d.focus.row } : { van: d.bereik.top, tot: d.bereik.bottom });
const kolommenVan = (d: Doel) => (heleRij(d.bereik) ? { van: d.focus.col, tot: d.focus.col } : { van: d.bereik.left, tot: d.bereik.right });

export async function rijenInvoegen(): Promise<void> {
  const d = await schrijfbaar();
  const { van, tot } = rijenVan(d);
  d.api.handle.applyOps([{ type: "insertRows", sheet: d.blad, at: van, count: tot - van + 1 }]);
  d.api.focus();
}

export async function rijenVerwijderen(): Promise<void> {
  const d = await schrijfbaar();
  const { van, tot } = rijenVan(d);
  d.api.handle.applyOps([{ type: "deleteRows", sheet: d.blad, at: van, count: tot - van + 1 }]);
  d.api.focus();
}

export async function kolommenInvoegen(): Promise<void> {
  const d = await schrijfbaar();
  const { van, tot } = kolommenVan(d);
  d.api.handle.applyOps([{ type: "insertCols", sheet: d.blad, at: van, count: tot - van + 1 }]);
  d.api.focus();
}

export async function kolommenVerwijderen(): Promise<void> {
  const d = await schrijfbaar();
  const { van, tot } = kolommenVan(d);
  d.api.handle.applyOps([{ type: "deleteCols", sheet: d.blad, at: van, count: tot - van + 1 }]);
  d.api.focus();
}

// ── Vastzetten ────────────────────────────────────────────────────────────

export type Vastzetten = "cel" | "rij" | "kolom" | "uit";

export async function vastzetten(soort: Vastzetten): Promise<void> {
  const d = await schrijfbaar();
  let pane: { rows: number; cols: number; top_left: Cel } | null = null;
  if (soort === "rij") pane = { rows: 1, cols: 0, top_left: { row: 1, col: 0 } };
  if (soort === "kolom") pane = { rows: 0, cols: 1, top_left: { row: 0, col: 1 } };
  if (soort === "cel") {
    if (d.focus.row === 0 && d.focus.col === 0) throw new Melding(melding("vastzettenCel"));
    pane = { rows: d.focus.row, cols: d.focus.col, top_left: d.focus };
  }
  d.api.handle.applyOps([{ type: "setFreezePane", sheet: d.blad, pane }]);
  d.api.focus();
}

// ── Doorvoeren ────────────────────────────────────────────────────────────

/**
 * Vult `doel` vanuit `bron`, in één stap. Met `reeks` lopen getallen door (vulgreep),
 * anders herhaalt de bron zich. Formules schuiven mee; de opmaak gaat mee.
 */
export async function vul(bron: Bereik, doel: Bereik, richting: VulRichting, reeks: boolean): Promise<void> {
  const d = await schrijfbaar();
  nietTeGroot(doel);
  const cellen = leesCellen(d, bron);
  const verticaal = richting === "omlaag" || richting === "omhoog";
  const ops: unknown[] = [];
  if (verticaal) {
    const plekken = Array.from({ length: doel.bottom - doel.top + 1 }, (_, i) => doel.top + i - bron.top);
    for (let k = bron.left; k <= bron.right; k++) {
      const lijn = cellen.map((rij) => rij[k - bron.left]);
      const uit = vulLijn(lijn, plekken, (afstand) => ({ rijen: afstand, kolommen: 0 }), reeks);
      uit.forEach((cel, i) => ops.push(celOp(d.blad, { row: doel.top + i, col: k }, cel)));
    }
  } else {
    const plekken = Array.from({ length: doel.right - doel.left + 1 }, (_, i) => doel.left + i - bron.left);
    cellen.forEach((lijn, r) => {
      const uit = vulLijn(lijn, plekken, (afstand) => ({ rijen: 0, kolommen: afstand }), reeks);
      uit.forEach((cel, i) => ops.push(celOp(d.blad, { row: bron.top + r, col: doel.left + i }, cel)));
    });
  }
  ops.push({ type: "applyRangeFormat", sheet: d.blad, range: rechthoek(doel), format: d.api.handle.captureFormat(d.blad, bereikA1(bron)) });
  d.api.handle.applyOps(ops);
  const samen = bereikTussen({ row: Math.min(bron.top, doel.top), col: Math.min(bron.left, doel.left) }, { row: Math.max(bron.bottom, doel.bottom), col: Math.max(bron.right, doel.right) });
  d.api.selectCells(d.blad, { anchor: { row: samen.bottom, col: samen.right }, focus: { row: samen.top, col: samen.left } });
  d.api.focus();
}

/**
 * Doorvoeren omlaag of naar rechts. De eerste rij of kolom van de selectie gaat
 * door de rest; is de selectie één rij of kolom breed, dan komt de cel erboven of
 * links ervan erin.
 */
export async function doorvoeren(richting: "omlaag" | "rechts"): Promise<void> {
  const d = await schrijfbaar();
  const b = binnenGebruikt(d, d.bereik);
  if (richting === "omlaag") {
    if (b.top === b.bottom) {
      if (b.top === 0) return;
      const bron = { ...b, top: b.top - 1, bottom: b.top - 1 };
      await vul(bron, b, "omlaag", false);
    } else {
      await vul({ ...b, bottom: b.top }, { ...b, top: b.top + 1 }, "omlaag", false);
    }
  } else if (b.left === b.right) {
    if (b.left === 0) return;
    const bron = { ...b, left: b.left - 1, right: b.left - 1 };
    await vul(bron, b, "rechts", false);
  } else {
    await vul({ ...b, right: b.left }, { ...b, left: b.left + 1 }, "rechts", false);
  }
}

/** Dubbelklik op de vulgreep: omlaag zover als de kolom ernaast gevuld is. */
export async function vulTotEinde(bron: Bereik): Promise<void> {
  const d = await schrijfbaar();
  const naast = bron.left > 0 ? bron.left - 1 : bron.right + 1;
  const { region } = d.api.handle.selectionData(d.blad, bron.bottom, naast);
  const eind = region?.bottom ?? bron.bottom;
  if (eind <= bron.bottom) return;
  await vul(bron, doelBereik(bron, "omlaag", eind - bron.bottom), "omlaag", true);
}

// ── Functies ──────────────────────────────────────────────────────────────

const LIJSTFUNCTIES = new Set<Functie>(["SUM", "PRODUCT", "AVERAGE", "MIN", "MAX", "COUNT"]);

/** De waarden boven en links van een cel, voor het voorstel. */
function waardenRond(d: Doel, b: Bereik): (c: Cel) => Waarde {
  const cache = new Map<string, Waarde>();
  const laad = (g: Bereik) =>
    leesCellen(d, g).forEach((rij, r) => rij.forEach((c, k) => cache.set(`${g.top + r}:${g.left + k}`, c.waarde)));
  laad({ ...b, top: Math.max(0, b.top - 2000) });
  laad({ ...b, left: Math.max(0, b.left - 200) });
  return ({ row, col }) => cache.get(`${row}:${col}`) ?? { kind: "empty" };
}

/**
 * Zet een functie neer. In een open formule op de cursorplek. Op een selectie van
 * meer cellen meteen de uitkomst eronder, per kolom. Op één cel gaat de cel open met
 * het voorstel geselecteerd: Enter neemt het aan, slepen of typen vervangt het.
 */
export async function voegFunctieIn(f: Functie): Promise<void> {
  const open = openFormuleVeld();
  if (open && (open.value === "" || open.value.startsWith("="))) {
    const { selectionStart: begin, selectionEnd: eind, value } = open;
    const b = begin ?? value.length;
    const e = eind ?? b;
    const voorvoegsel = value.startsWith("=") ? (magVerwijzingHier(value, b, e) ? "" : "+") : "=";
    const delen = functieTekst(f, null, null);
    const midden = delen.tekst.slice(1);
    const cursor = b + voorvoegsel.length + delen.begin - 1;
    zetVeld(open, `${value.slice(0, b)}${voorvoegsel}${midden}${value.slice(e)}`, cursor, cursor);
    zetAangewezen(null);
    return;
  }
  const d = await schrijfbaar();
  if (LIJSTFUNCTIES.has(f) && aantalCellen(d.bereik) > 1) {
    const b = binnenGebruikt(d, d.bereik);
    const plan = somPlan(b, (c) => leesCellen(d, { top: c.row, left: c.col, bottom: c.row, right: c.col })[0][0].waarde);
    if (!plan) throw new Melding(melding("geenPlek"));
    const ops: unknown[] = [];
    for (let k = plan.links; k <= plan.rechts; k++) {
      const letter = kolomLetters(k);
      ops.push(celOp(d.blad, { row: plan.rij, col: k }, { waarde: { kind: "empty" }, formule: `${f}(${letter}${plan.vanaf + 1}:${letter}${plan.tot + 1})` }));
    }
    const opmaak = d.api.handle.captureFormat(d.blad, bereikA1({ top: plan.rij, bottom: plan.rij, left: plan.links, right: plan.rechts }));
    ops.push({ type: "applyRangeFormat", sheet: d.blad, range: rechthoek({ top: plan.rij, bottom: plan.rij, left: plan.links, right: plan.rechts }), format: opmaak });
    d.api.handle.applyOps(ops);
    d.api.focus();
    return;
  }
  const cel = d.focus;
  const waarde = waardenRond(d, { top: cel.row, left: cel.col, bottom: cel.row, right: cel.col });
  const voorstel = functieTekst(f, bereikVoorstel(cel, waarde), celVoorstel(cel, waarde));
  await openCelMetTekst(d.api, voorstel.tekst, voorstel.begin, voorstel.eind);
}

// ── Sorteren ──────────────────────────────────────────────────────────────

/**
 * Sorteert de selectie op de kolom van de actieve cel, in één stap. Op één kolom of
 * cel de hele tabel eromheen, anders raken de rijen door elkaar; een kopregel blijft
 * staan. Een formule verhuist mee met zijn rij, de opmaak ook.
 */
export async function sorteren(aflopend: boolean): Promise<void> {
  const d = await schrijfbaar();
  const tabel = d.bereik.left === d.bereik.right ? d.api.handle.selectionData(d.blad, d.focus.row, d.focus.col).region : null;
  const gekozen = tabel ?? (aantalCellen(d.bereik) > 1 ? binnenGebruikt(d, d.bereik) : null);
  if (!gekozen) throw new Melding(melding("sorteerLeeg"));
  nietTeGroot(gekozen);
  if (d.api.handle.mergedRanges(d.blad, bereikA1(gekozen)).length) throw new Melding(melding("sorteerSamengevoegd"));
  const alles = leesCellen(d, gekozen);
  const kop = heeftKoprij(alles.map((rij) => rij.map((c) => c.waarde))) ? 1 : 0;
  const gebied: Bereik = { ...gekozen, top: gekozen.top + kop };
  const rijen = alles.slice(kop);
  if (rijen.length < 2) return;
  const sleutel = Math.max(gekozen.left, Math.min(d.focus.col, gekozen.right)) - gekozen.left;
  const volgorde = sorteerVolgorde(rijen.map((rij) => rij.map((c) => c.waarde)), sleutel, aflopend, i18next.language);
  const opmaak = d.api.handle.captureFormat(d.blad, bereikA1(gebied));
  const breed = opmaak.columns;
  const formats = volgorde.flatMap((oud) => opmaak.formats.slice(oud * breed, (oud + 1) * breed));
  const ops: unknown[] = [];
  volgorde.forEach((oud, nieuw) => {
    rijen[oud].forEach((cel, k) => {
      const formule = cel.formule === null ? null : verschuifFormule(cel.formule, nieuw - oud, 0);
      ops.push(celOp(d.blad, { row: gebied.top + nieuw, col: gebied.left + k }, { waarde: cel.waarde, formule }));
    });
  });
  ops.push({ type: "applyRangeFormat", sheet: d.blad, range: rechthoek(gebied), format: { ...opmaak, formats } });
  d.api.handle.applyOps(ops);
  d.api.focus();
}

// ── Breedte en hoogte ─────────────────────────────────────────────────────

/** De kolommen of rijen waarop slepen aan een kop werkt: de selectie als die erin zit. */
export function sporenBij(soort: "kolom" | "rij", nummer: number): number[] {
  const { bereik } = useSpreadsheetEditor.getState();
  if (bereik) {
    const heel = soort === "kolom" ? heleKolom(bereik) : heleRij(bereik);
    const [van, tot] = soort === "kolom" ? [bereik.left, bereik.right] : [bereik.top, bereik.bottom];
    if (heel && nummer >= van && nummer <= tot) {
      return Array.from({ length: Math.min(tot - van + 1, 10_000) }, (_, i) => van + i);
    }
  }
  return [nummer];
}

export async function zetKolombreedte(kolommen: number[], px: number): Promise<void> {
  const d = await schrijfbaar();
  const width = breedteTekens(px);
  d.api.handle.applyOps(kolommen.map((col) => ({ type: "setColWidth", sheet: d.blad, col, width })));
  d.api.focus();
}

export async function zetRijhoogte(rijen: number[], px: number): Promise<void> {
  const d = await schrijfbaar();
  const height = hoogtePunten(px);
  d.api.handle.applyOps(rijen.map((row) => ({ type: "setRowHeight", sheet: d.blad, row, height })));
  d.api.focus();
}

let peil: CanvasRenderingContext2D | null = null;
function tekstBreedte(tekst: string, opmaak: { grootte: number; familie?: string; vet?: boolean; cursief?: boolean }): number {
  peil ??= document.createElement("canvas").getContext("2d");
  if (!peil) return tekst.length * 7;
  const px = (opmaak.grootte * 96) / 72;
  peil.font = `${opmaak.cursief ? "italic " : ""}${opmaak.vet ? "bold " : ""}${px}px "${opmaak.familie ?? "Calibri"}", sans-serif`;
  return peil.measureText(tekst).width;
}

function teMeten(d: Doel, b: Bereik) {
  const lezing = d.api.handle.readCells({ ranges: [{ sheetId: d.sheetId, range: { kind: "rowCol", ...rechthoek(b) } }] });
  if (!lezing.ok) return [];
  const uit: { rij: number; kolom: number; tekst: string; a1: string }[] = [];
  lezing.ranges[0].cells.forEach((rij, r) =>
    rij.forEach((c, k) => {
      if (c.displayText && uit.length < MAX_TE_METEN) uit.push({ rij: b.top + r, kolom: b.left + k, tekst: c.displayText, a1: c.a1 });
    }),
  );
  return uit;
}

/** Kolommen passend bij hun breedste tekst; een lege kolom terug naar de standaardbreedte. */
export async function passendeBreedte(kolommen?: number[]): Promise<void> {
  const d = await schrijfbaar();
  const lijst = kolommen ?? Array.from({ length: Math.min(d.bereik.right - d.bereik.left + 1, 10_000) }, (_, i) => d.bereik.left + i);
  const gebruikt = d.api.handle.selectionData(d.blad, 0, 0, "usedRange").usedRange;
  const breedste = new Map<number, number>();
  if (gebruikt) {
    const b = { top: gebruikt.top, bottom: gebruikt.bottom, left: Math.min(...lijst), right: Math.max(...lijst) };
    for (const cel of teMeten(d, b)) {
      const f = d.api.handle.selectionFormatting(d.blad, cel.a1);
      const px = Math.max(...cel.tekst.split(/\r?\n/).map((regel) => tekstBreedte(regel, { grootte: f.fontSize ?? 11, familie: f.fontFamily, vet: f.bold, cursief: f.italic })));
      breedste.set(cel.kolom, Math.max(breedste.get(cel.kolom) ?? 0, px));
    }
  }
  d.api.handle.applyOps(lijst.map((col) => {
    const px = breedste.get(col);
    return { type: "setColWidth", sheet: d.blad, col, width: px ? breedteVoorTekst(px) : null };
  }));
  d.api.focus();
}

/** Rijen passend bij hun hoogste cel, met terugloop in de kolombreedte meegeteld. */
export async function passendeHoogte(rijen?: number[]): Promise<void> {
  const d = await schrijfbaar();
  const lijst = rijen ?? Array.from({ length: Math.min(d.bereik.bottom - d.bereik.top + 1, 10_000) }, (_, i) => d.bereik.top + i);
  const gebruikt = d.api.handle.selectionData(d.blad, 0, 0, "usedRange").usedRange;
  const hoogste = new Map<number, number>();
  if (gebruikt) {
    const b = { left: gebruikt.left, right: gebruikt.right, top: Math.min(...lijst), bottom: Math.max(...lijst) };
    for (const cel of teMeten(d, b)) {
      const f = d.api.handle.selectionFormatting(d.blad, cel.a1);
      const opmaak = { grootte: f.fontSize ?? 11, familie: f.fontFamily, vet: f.bold, cursief: f.italic };
      const ruimte = d.api.handle.cellRect(d.blad, cel.rij, cel.kolom).w - 2 * CELMARGE;
      const regels = f.textWrapping === "wrap"
        ? cel.tekst.split(/\r?\n/).reduce((n, regel) => n + Math.max(1, Math.ceil(tekstBreedte(regel, opmaak) / Math.max(ruimte, 1))), 0)
        : 1;
      const px = regels * ((opmaak.grootte * 96) / 72) * 1.25 + 4;
      hoogste.set(cel.rij, Math.max(hoogste.get(cel.rij) ?? 0, px));
    }
  }
  // Niet lager dan de standaardrij: zo blijft een rij met kleine letters leesbaar.
  d.api.handle.applyOps(lijst.map((row) => {
    const px = hoogste.get(row);
    return { type: "setRowHeight", sheet: d.blad, row, height: px && px > 20 ? hoogtePunten(px) : null };
  }));
  d.api.focus();
}

// ── Invoer van buiten ─────────────────────────────────────────────────────

/** Tekst van buiten als cel, en de getalnotatie die erbij hoort. */
export function invoerNaarCel(ruw: string): { cel: BronCel; notatie?: string } {
  const leeg = { waarde: { kind: "empty" } as Waarde, formule: null };
  const tekst = ruw.trim();
  if (!tekst) return { cel: leeg };
  if (tekst.startsWith("=") && tekst.length > 1) return { cel: { waarde: { kind: "empty" }, formule: tekst.slice(1) } };
  if (tekst.startsWith("'")) return { cel: { waarde: { kind: "text", value: tekst.slice(1) }, formule: null } };
  const nl = leesNederlands(tekst);
  const invoer = nl?.invoer ?? tekst;
  if (/^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/.test(invoer)) {
    return { cel: { waarde: { kind: "number", value: Number(invoer) }, formule: null }, notatie: nl?.notatie };
  }
  const procent = /^([-+]?(?:\d+\.?\d*|\.\d+))\s?%$/.exec(tekst);
  if (procent) {
    const decimalen = /\.(\d+)/.exec(procent[1])?.[1].length ?? 0;
    return {
      cel: { waarde: { kind: "number", value: Number(procent[1]) / 100 }, formule: null },
      notatie: decimalen ? `0.${"0".repeat(decimalen)}%` : "0%",
    };
  }
  if (/^(true|waar)$/i.test(tekst)) return { cel: { waarde: { kind: "bool", value: true }, formule: null } };
  if (/^(false|onwaar)$/i.test(tekst)) return { cel: { waarde: { kind: "bool", value: false }, formule: null } };
  return { cel: { waarde: { kind: "text", value: ruw }, formule: null } };
}
