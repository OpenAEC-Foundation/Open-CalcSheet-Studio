/**
 * Van de bladen in het project naar het IFCX-document en de STEP: de brug tussen
 * de app en de kern (packages/core/src/ifcx/).
 *
 * Elk blad wordt hier doorgerekend, met de projectgegevens als startwaarden en
 * zijn eigen invoer, langs dezelfde route als de afdruk en de API. Een blad dat
 * omvalt blijft in het document staan, met de fout erbij: alleen de uitkomst
 * ontbreekt dan. Een PDF-, spreadsheet- of Markdown-blad heeft niets om door te rekenen.
 *
 * De uitkomst van een blad blijft bewaard zolang het blad en de projectgegevens
 * niet veranderen: bij opslaan en in de IFC-tab hoeft dan alleen opnieuw wat
 * gewijzigd is. Een blad is onveranderlijk; een wijziging maakt een nieuw object
 * (projectStore.ts).
 *
 * Laadt zonder React of stores, zodat de controle (scripts/check-ifcx.mjs) dit
 * bestand in Node gebruikt.
 */
import {
  balklaagIfcxKnopenUitScope,
  bouwProjectIfcx,
  bouwProjectStep,
  extractScope,
  type IfcCalcSheet,
  type IfcxBestand,
  type ElementRef,
} from "@ifc-calc/core";
import { projectScope } from "./projectGegevens.ts";
import type { PdfBijlage } from "./pdfBijlage.ts";
import { isLosBlad, type SpreadsheetBestand } from "./spreadsheetBlad.ts";
import type { MarkdownBestand } from "./markdownBlad.ts";
import { leesBron, rekenDoor } from "../mcp/rekenen.ts";

/** Wat dit bestand van een blad nodig heeft; een uittreksel van `Exemplaar`. */
export interface BladVoorIfc {
  id: string;
  naam: string;
  templateId: string;
  source: string;
  waarden: Record<string, string>;
  bronVersie?: string;
  elementen?: ElementRef[];
  pdf?: PdfBijlage;
  xlsx?: SpreadsheetBestand;
  md?: MarkdownBestand;
}

/** Wat dit bestand van een project nodig heeft. */
export interface ProjectVoorIfc {
  versie: number;
  naam: string;
  gegevens: Record<string, string>;
  exemplaren: BladVoorIfc[];
  rapport?: unknown;
  verborgen?: { gegevens?: boolean; rapport?: boolean };
}

const bewaard = new WeakMap<object, { gegevens: object; blad: IfcCalcSheet }>();

/** Eén blad, doorgerekend, zoals de kern het wil. Zonder doorrekenen: alleen de velden van het blad. */
function bladVoorIfc(ex: BladVoorIfc, gegevens: Record<string, string>): IfcCalcSheet {
  const hier = bewaard.get(ex);
  if (hier && hier.gegevens === gegevens) return hier.blad;

  const blad: IfcCalcSheet = {
    id: ex.id,
    naam: ex.naam,
    templateId: ex.templateId,
    source: ex.source,
    waarden: ex.waarden,
    bronVersie: ex.bronVersie,
    elementen: ex.elementen,
    pdf: ex.pdf,
    xlsx: ex.xlsx,
    md: ex.md,
    nodes: [],
  };
  if (!isLosBlad(ex)) {
    try {
      const { nodes, resultaat } = rekenDoor(ex.source, ex.waarden, projectScope(gegevens), ex.naam);
      blad.nodes = nodes;
      blad.resultaat = resultaat;
      // Een balklaagblad levert ook zijn balken en plaat als elementen met geometrie.
      if (ex.templateId === "balklaag") {
        const scope = extractScope(leesBron(ex.source), ex.waarden, projectScope(gegevens));
        blad.geometrie = balklaagIfcxKnopenUitScope(ex.id, scope) ?? undefined;
      }
    } catch (err) {
      blad.fout = (err as Error).message;
      console.error(`Blad "${ex.naam}" kon niet worden doorgerekend:`, err);
    }
  }
  bewaard.set(ex, { gegevens, blad });
  return blad;
}

/** Alle bladen van het project, doorgerekend. */
export function bladenVoorIfc(project: Pick<ProjectVoorIfc, "exemplaren" | "gegevens">): IfcCalcSheet[] {
  return project.exemplaren.map((ex) => bladVoorIfc(ex, project.gegevens));
}

/** Het project als IFCX-document. `bladen` zijn de doorgerekende bladen; zonder rekent dit ze door. */
export function projectIfcx(project: ProjectVoorIfc, bladen?: IfcCalcSheet[]): IfcxBestand {
  return bouwProjectIfcx({
    naam: project.naam,
    formaatversie: project.versie,
    gegevens: project.gegevens,
    bladen: bladen ?? bladenVoorIfc(project),
    rapport: project.rapport,
    verborgen: project.verborgen,
  });
}

/** Het project als STEP, uit hetzelfde document als het IFCX. */
export function projectStep(project: ProjectVoorIfc, bladen?: IfcCalcSheet[]): string {
  return bouwProjectStep(projectIfcx(project, bladen));
}
