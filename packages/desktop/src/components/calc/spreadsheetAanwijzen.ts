import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import { useSpreadsheetEditor, type Markering } from "../../store/spreadsheetEditor";
import {
  bereikA1, bereikTussen, invoerVoorKern, kolomLetters, magVerwijzingHier, verwijzingenIn, zetVerwijzing,
  type Bereik, type Cel,
} from "./spreadsheetLogica";

/*
 * Cellen aanwijzen in een formule. De editor kent dat niet: een klik in het raster
 * sluit de open cel en selecteert de aangeklikte. Terwijl een formule openstaat in
 * de cel of de formulebalk vangt dit bestand de muis af vóór de editor, zet de
 * verwijzing op de cursorplek en laat het toetsenbord in het invoerveld, zodat
 * typen gewoon doorgaat. Slepen maakt er een bereik van. Is de formule op die plek
 * al af (`=A1*2`, cursor achteraan), dan is een klik gewoon naar die cel gaan.
 *
 * Het veld zelf blijft van de editor: tekst gaat erin zoals typen dat doet.
 */

const VELDEN = '[data-testid="xlsx-cell-editor"], [data-testid="xlsx-formula-input"]';
const RASTER = '[data-testid="xlsx-scroll"]';

/** De kleuren waarmee verwijzingen in een open formule hun kader krijgen. */
export const VERWIJZINGSKLEUREN = ["#2b6cd8", "#c43d3d", "#7a3fc4", "#1f8a4c", "#c4721f", "#b8379a", "#2a8d96", "#7d6a12"];

type Veld = HTMLInputElement;

/** Het invoerveld van de editor waar de cursor in staat, of null. */
export function openFormuleVeld(): Veld | null {
  const a = document.activeElement;
  return a instanceof HTMLInputElement && a.matches(VELDEN) && a.closest(".spreadsheet-editor") ? a : null;
}

/** Zet de tekst van het veld zoals typen dat doet, met de cursor erna. */
export function zetVeld(veld: Veld, tekst: string, begin: number, eind = begin): void {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(veld, tekst);
  veld.dispatchEvent(new Event("input", { bubbles: true }));
  veld.setSelectionRange(begin, eind);
  // React kan het veld bij het bijwerken de cursor kosten.
  requestAnimationFrame(() => {
    if (document.activeElement === veld && veld.value === tekst) veld.setSelectionRange(begin, eind);
  });
}

/** De verwijzing die net is aangewezen; een volgende klik vervangt hem, tot er getypt wordt. */
interface Aanwijzing {
  veld: Veld;
  tekst: string;
  begin: number;
  eind: number;
  start: Cel;
}

let aangewezen: Aanwijzing | null = null;

export function zetAangewezen(a: Aanwijzing | null): void {
  aangewezen = a;
}

function nogAangewezen(veld: Veld): Aanwijzing | null {
  const a = aangewezen;
  const geldig = a && a.veld === veld && a.tekst === veld.value && veld.selectionStart === a.eind && veld.selectionEnd === a.eind;
  return geldig ? a : null;
}

/** De kaders van de verwijzingen in de open formule. */
function werkMarkeringenBij(): void {
  const veld = openFormuleVeld();
  const huidig = useSpreadsheetEditor.getState().markeringen;
  const nieuw: Markering[] = [];
  if (veld?.value.startsWith("=")) {
    const a = aangewezen?.tekst === veld.value ? aangewezen : null;
    verwijzingenIn(veld.value).forEach((v, i) => {
      nieuw.push({
        blad: v.blad,
        bereik: v.bereik,
        kleur: VERWIJZINGSKLEUREN[i % VERWIJZINGSKLEUREN.length],
        aangewezen: a !== null && v.begin === a.begin && v.eind === a.eind,
      });
    });
  }
  if (JSON.stringify(nieuw) !== JSON.stringify(huidig)) useSpreadsheetEditor.setState({ markeringen: nieuw });
}

/**
 * Wat een gebruiker typte omzetten naar wat de rekenkern leest, voor de cel sluit:
 * `1,5` is anders tekst, en `=IF(A1>1;1;0)` geen formule.
 */
function normaliseer(veld: Veld): void {
  const nieuw = invoerVoorKern(veld.value);
  if (nieuw !== veld.value) zetVeld(veld, nieuw, nieuw.length);
}

export function normaliseerOpenVeld(): void {
  const veld = openFormuleVeld();
  if (veld) normaliseer(veld);
}

let peil: CanvasRenderingContext2D | null = null;

/** De cel groeit mee met wat erin staat; de editor houdt hem op de breedte van de kolom. */
function celVeldMeegroeien(veld: Veld): void {
  if (!veld.matches('[data-testid="xlsx-cell-editor"]')) return;
  peil ??= document.createElement("canvas").getContext("2d");
  if (!peil) return;
  peil.font = getComputedStyle(veld).font;
  veld.style.minWidth = `${Math.ceil(peil.measureText(veld.value).width) + 12}px`;
}

/** De cel onder de muis, ook als die buiten het raster staat: dan de rand ervan. */
function celBij(api: XlsxEditorApi, raster: HTMLElement, x: number, y: number): Cel | null {
  const vak = raster.getBoundingClientRect();
  const px = Math.min(Math.max(x, vak.left + 1), vak.left + raster.clientWidth - 2);
  const py = Math.min(Math.max(y, vak.top + 1), vak.top + raster.clientHeight - 2);
  const cel = api.getPositionAtPoint(px, py);
  return cel ? { row: cel.row, col: cel.col } : null;
}

/** Een samengevoegde cel telt als geheel; de verwijzing wijst dan het hele vak aan. */
function metSamenvoeging(api: XlsxEditorApi, b: Bereik): Bereik {
  const blad = api.handle.sheetInfo().activeSheet;
  let uit = b;
  for (const m of api.handle.mergedRanges(blad, bereikA1(b))) {
    uit = {
      top: Math.min(uit.top, m.start.row),
      left: Math.min(uit.left, m.start.col),
      bottom: Math.max(uit.bottom, m.end.row),
      right: Math.max(uit.right, m.end.col),
    };
  }
  return uit;
}

/** Waar de verwijzing komt, of null als de formule hier al af is. */
function plekVoor(veld: Veld, e: MouseEvent): { begin: number; eind: number; start: Cel | null } | null {
  const a = nogAangewezen(veld);
  if (a) {
    // Ctrl+klik: nog een argument erbij. Shift+klik: het bereik tot hier. Anders vervangen.
    if (e.ctrlKey || e.metaKey) return { begin: a.eind + 1, eind: a.eind + 1, start: null };
    return { begin: a.begin, eind: a.eind, start: e.shiftKey ? a.start : null };
  }
  const begin = veld.selectionStart ?? veld.value.length;
  const eind = veld.selectionEnd ?? begin;
  return magVerwijzingHier(veld.value, begin, eind) ? { begin, eind, start: null } : null;
}

/** Luistert zolang de editor openstaat; geeft een functie terug om te stoppen. */
export function startAanwijzen(api: XlsxEditorApi): () => void {
  let slepen: { stop: () => void } | null = null;

  const opMuisOmlaag = (e: MouseEvent) => {
    if (e.button !== 0) return;
    const veld = openFormuleVeld();
    const doel = e.target instanceof Element ? e.target : null;
    const raster = doel?.closest<HTMLElement>(RASTER);
    if (!veld || !raster || doel === veld || !veld.value.startsWith("=")) return;
    // Op de schuifbalk: de browser laat schuiven, de editor mag de cel niet sluiten.
    const vak = raster.getBoundingClientRect();
    if (e.clientX >= vak.left + raster.clientWidth || e.clientY >= vak.top + raster.clientHeight) {
      e.stopImmediatePropagation();
      return;
    }
    const cel = celBij(api, raster, e.clientX, e.clientY);
    if (!cel) return;
    const plek = plekVoor(veld, e);
    if (!plek) return;
    // Vóór de editor: hij mag de cel niet sluiten en het veld de focus niet kwijtraken.
    e.preventDefault();
    e.stopImmediatePropagation();

    const start = plek.start ?? cel;
    let basis = veld.value;
    if ((e.ctrlKey || e.metaKey) && nogAangewezen(veld)) basis = `${basis.slice(0, plek.begin - 1)},${basis.slice(plek.begin - 1)}`;
    let eind = plek.eind;
    const schrijf = (naar: Cel) => {
      const verwijzing = bereikA1(metSamenvoeging(api, bereikTussen(start, naar)));
      const uit = zetVerwijzing(basis, plek.begin, eind, verwijzing);
      basis = uit.tekst;
      eind = uit.eind;
      aangewezen = { veld, tekst: uit.tekst, begin: uit.begin, eind: uit.eind, start };
      zetVeld(veld, uit.tekst, uit.eind);
    };
    schrijf(cel);

    let laatste = { x: e.clientX, y: e.clientY };
    let rol = 0;
    const werk = () => {
      const naar = celBij(api, raster, laatste.x, laatste.y);
      if (naar) schrijf(naar);
    };
    // Buiten het raster schuift het blad mee.
    const schuif = () => {
      rol = 0;
      const vak = raster.getBoundingClientRect();
      const dx = laatste.x > vak.right - 8 ? 24 : laatste.x < vak.left + 8 ? -24 : 0;
      const dy = laatste.y > vak.bottom - 8 ? 24 : laatste.y < vak.top + 8 ? -24 : 0;
      if (dx || dy) {
        raster.scrollBy(dx, dy);
        werk();
        rol = requestAnimationFrame(schuif);
      }
    };
    const beweeg = (m: MouseEvent) => {
      m.stopImmediatePropagation();
      laatste = { x: m.clientX, y: m.clientY };
      werk();
      if (!rol) rol = requestAnimationFrame(schuif);
    };
    const los = (m: MouseEvent) => {
      m.stopImmediatePropagation();
      slepen?.stop();
    };
    window.addEventListener("mousemove", beweeg, true);
    window.addEventListener("mouseup", los, true);
    slepen = {
      stop() {
        cancelAnimationFrame(rol);
        window.removeEventListener("mousemove", beweeg, true);
        window.removeEventListener("mouseup", los, true);
        slepen = null;
      },
    };
  };

  // Een dubbelklik in het raster zou een cel openen terwijl de formulebalk bezig is.
  const opDubbelklik = (e: MouseEvent) => {
    const veld = openFormuleVeld();
    const doel = e.target instanceof Element ? e.target : null;
    if (veld?.value.startsWith("=") && doel?.closest(RASTER) && doel !== veld) e.stopImmediatePropagation();
  };

  const bijwerken = (e: Event) => {
    if (e.target instanceof HTMLInputElement) celVeldMeegroeien(e.target);
    werkMarkeringenBij();
  };
  // Het veld sluit als het de focus verliest: dan moet de invoer al goed staan.
  const opVerlaten = (e: FocusEvent) => {
    if (e.target instanceof HTMLInputElement && e.target.matches(VELDEN)) normaliseer(e.target);
    setTimeout(werkMarkeringenBij);
  };
  window.addEventListener("mousedown", opMuisOmlaag, true);
  window.addEventListener("dblclick", opDubbelklik, true);
  window.addEventListener("focusout", opVerlaten, true);
  document.addEventListener("input", bijwerken, true);
  document.addEventListener("focusin", bijwerken, true);
  return () => {
    slepen?.stop();
    window.removeEventListener("mousedown", opMuisOmlaag, true);
    window.removeEventListener("dblclick", opDubbelklik, true);
    window.removeEventListener("focusout", opVerlaten, true);
    document.removeEventListener("input", bijwerken, true);
    document.removeEventListener("focusin", bijwerken, true);
    aangewezen = null;
  };
}

/**
 * Een klik op een kolom- of rijkop terwijl een formule openstaat: de hele kolom of
 * rij als verwijzing. Onwaar als er geen formule openstaat of die daar al af is; dan
 * is het gewoon selecteren.
 */
export function wijsKopAan(soort: "kolom" | "rij", nummer: number, e: MouseEvent): boolean {
  const veld = openFormuleVeld();
  if (!veld?.value.startsWith("=")) return false;
  const plek = plekVoor(veld, e);
  if (!plek) return false;
  const naam = soort === "kolom" ? kolomLetters(nummer) : String(nummer + 1);
  const start = soort === "kolom" ? { row: 0, col: nummer } : { row: nummer, col: 0 };
  const uit = zetVerwijzing(veld.value, plek.begin, plek.eind, `${naam}:${naam}`);
  aangewezen = { veld, tekst: uit.tekst, begin: uit.begin, eind: uit.eind, start };
  zetVeld(veld, uit.tekst, uit.eind);
  return true;
}

function wachtOpCelVeld(): Promise<Veld | null> {
  return new Promise((klaar) => {
    let pogingen = 0;
    const kijk = () => {
      const veld = document.querySelector<Veld>('.spreadsheet-editor [data-testid="xlsx-cell-editor"]');
      if (veld) return klaar(veld);
      if (++pogingen > 30) return klaar(null);
      setTimeout(kijk, 16);
    };
    kijk();
  });
}

/**
 * Opent de geselecteerde cel met deze tekst, met begin…eind geselecteerd. De editor
 * heeft daar geen opdracht voor; hij opent een cel als er op het raster getypt wordt.
 */
export async function openCelMetTekst(api: XlsxEditorApi, tekst: string, begin: number, eind: number): Promise<void> {
  api.focus();
  document.querySelector(`.spreadsheet-editor ${RASTER}`)?.dispatchEvent(
    new KeyboardEvent("keydown", { key: "=", code: "Equal", bubbles: true, cancelable: true }),
  );
  const veld = await wachtOpCelVeld();
  if (!veld) return;
  veld.focus();
  zetVeld(veld, tekst, begin, eind);
}
