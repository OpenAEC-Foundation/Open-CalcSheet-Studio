import { create } from "zustand";
import type { XlsxEditorApi } from "@betteroffice/xlsx-react";
import type { Bereik, Cel } from "../components/calc/spreadsheetLogica";

/**
 * De spreadsheet-editor die openstaat, voor wat buiten de editor staat: het lint
 * en de sneltoetsen. De editor meldt zich aan en houdt hier zijn selectie bij; net
 * als `useEditorViewStore` voor de code. Alleen typen uit het pakket, zodat de
 * rekenkern niet meelaadt met het lint.
 */

/** Een verwijzing die in het raster een kader krijgt zolang een formule openstaat. */
export interface Markering {
  /** De bladnaam als die in de verwijzing staat; null is het actieve werkblad. */
  blad: string | null;
  bereik: Bereik;
  kleur: string;
  /** Net met de muis aangewezen: een dikker kader. */
  aangewezen: boolean;
}

const VELLIJNEN = "openaec.spreadsheet.vellijnen";

function leesVelLijnen(): boolean {
  try {
    return localStorage.getItem(VELLIJNEN) !== "uit";
  } catch {
    return true;
  }
}

/** De papierrand in het raster aan of uit; een voorkeur, geen deel van het project. */
export function zetVelLijnen(aan: boolean): void {
  useSpreadsheetEditor.setState({ velLijnen: aan });
  try {
    localStorage.setItem(VELLIJNEN, aan ? "aan" : "uit");
  } catch {
    // Alleen een gemak.
  }
}

/** Het bereik op het klembord, met het lopende kader eromheen. */
export interface KopieKader {
  sheetId: string;
  bereik: Bereik;
  knippen: boolean;
}

interface SpreadsheetEditorStaat {
  /**
   * Staat een spreadsheet-blad in de werkruimte? De editor blijft ook geparkeerd
   * leven (SpreadsheetBladWeergave.tsx); dan is `api` er wel, maar is hij niet in beeld.
   */
  zichtbaar: boolean;
  api: XlsxEditorApi | null;
  /** Het actieve werkblad, zoals de editor het meldt. */
  blad: number;
  sheetId: string;
  /** De selectie op dat werkblad; null als er niets geselecteerd is. */
  bereik: Bereik | null;
  /** De actieve cel. */
  focus: Cel | null;
  markeringen: Markering[];
  kopie: KopieKader | null;
  kanOngedaan: boolean;
  kanOpnieuw: boolean;
  /** Tekent het raster waar een afgedrukt vel eindigt? */
  velLijnen: boolean;
}

export const useSpreadsheetEditor = create<SpreadsheetEditorStaat>(() => ({
  zichtbaar: false,
  api: null,
  blad: 0,
  sheetId: "",
  bereik: null,
  focus: null,
  markeringen: [],
  kopie: null,
  kanOngedaan: false,
  kanOpnieuw: false,
  velLijnen: leesVelLijnen(),
}));
