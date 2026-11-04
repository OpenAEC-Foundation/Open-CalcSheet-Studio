/**
 * Linticonen uit de B2-set van de OpenAEC Blueprint (ontwerp 0.4).
 *
 * public/icons/standard.svg is de sprite van de standaardapplicatie,
 * public/icons/calculations.svg die van Calculations; beide komen ongewijzigd
 * uit `web/icons/` van de Blueprint. public/icons/spreadsheet.svg bevat alleen de
 * symbolen voor de tab Spreadsheet, ongewijzigd uit andere sprites daar, omdat die
 * sprites zelf een megabyte zijn. Elk icoon staat er in 16 en 24 px in: een
 * grote knop toont het 24 px-ontwerp, een kleine het 16 px-ontwerp (zie
 * Ribbon.css). Een nieuw icoon: kies het id uit de Blueprint, niet zelf tekenen.
 */

export type Sprite = "standard" | "calculations" | "spreadsheet";

export const sprite = (naam: Sprite) => `${import.meta.env.BASE_URL}icons/${naam}.svg`;

/** Een B2-icoon als markup voor RibbonButton: beide maten, CSS toont de juiste. */
export function b2(id: string, uit: Sprite = "calculations"): string {
  const url = sprite(uit);
  return (
    `<svg class="oa-icon oa-b2-24" aria-hidden="true"><use href="${url}#i24-${id}"/></svg>` +
    `<svg class="oa-icon oa-b2-16" aria-hidden="true"><use href="${url}#i16-${id}"/></svg>`
  );
}

const ontsnap = (t: string) =>
  t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Een teken van de rekentaal in het icoonvak, zoals op het toetsenblok van
 * CalcPAD: `#if`, `√`, `mm`. Voor wat geen B2-icoon heeft.
 */
export function glyph(teken: string): string {
  return `<span class="calcpad-glyph" aria-hidden="true">${ontsnap(teken)}</span>`;
}

// Start
export const projectIcon = b2("project.properties", "standard");
export const settingsIcon = b2("ui.settings", "standard");
export const helpIcon = b2("ui.help", "standard");
export const aboutIcon = b2("ui.about");
export const startIcon = b2("ui.whats-new");
export const pasteIcon = b2("edit.paste", "standard");
export const cutIcon = b2("edit.cut", "standard");
export const copyIcon = b2("edit.copy", "standard");
export const undoIcon = b2("edit.undo");
export const redoIcon = b2("edit.redo");
export const searchIcon = b2("view.search", "standard");
export const moduleIcon = b2("calculation.module-picker");
export const extensionsIcon = b2("extensions.manage", "standard");
export const blankSheetIcon = b2("file.new");
export const spreadsheetIcon = b2("spreadsheet.sheet-add");
export const markdownIcon = b2("report.template", "standard");
export const canvasIcon = b2("report.workspace");
export const graafIcon = b2("panel.model-tree");
export const jupyterIcon = b2("file.structure");
export const marimoIcon = b2("data.chart", "standard");
export const previewIcon = b2("view.report-preview", "standard");
export const printSheetIcon = b2("report.print-entry");
export const reportIcon = b2("report.generate", "standard");

// Spreadsheet
export const autoSomIcon = glyph("Σ");
export const functieIcon = b2("budget.add-formula", "spreadsheet");
export const omlaagIcon = b2("list.move-down", "spreadsheet");
export const rechtsIcon = b2("nav.forward", "spreadsheet");
export const rijInvoegenIcon = b2("frame.row-add", "spreadsheet");
export const kolomInvoegenIcon = b2("frame.column-add", "spreadsheet");
export const kolomPassendIcon = b2("view.fit-width", "spreadsheet");
export const rijPassendIcon = b2("view.fit-height", "spreadsheet");
export const sorteerIcon = b2("list.sort-fields", "spreadsheet");
export const vastzettenIcon = b2("object.lock", "spreadsheet");
export const papierrandIcon = b2("view.fit-page", "spreadsheet");

// Tekenen
export const tekeningNieuwIcon = b2("file.new");
export const tekeningBewerkenIcon = b2("assistant.draw");
export const selecteerIcon = glyph("↖");
export const lijnIcon = b2("draw.line", "standard");
export const pijlIcon = b2("draw.arrow", "standard");
export const rechthoekIcon = b2("draw.rectangle", "standard");
export const cirkelIcon = b2("draw.circle", "standard");
export const polylijnIcon = b2("draw.freehand", "standard");
export const tekstIcon = b2("draw.text");
export const maatlijnIcon = b2("measure.distance", "standard");
export const rasterIcon = b2("data.table", "standard");
export const snapIcon = b2("view.fit", "standard");
export const verwijderIcon = b2("edit.delete");
export const tekeningInvoegenIcon = b2("data.apply");
export const tekeningSluitenIcon = b2("ui.close", "standard");
