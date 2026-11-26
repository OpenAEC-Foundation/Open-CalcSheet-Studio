/**
 * Van de bladen in het project naar het IFCX-document en de STEP: de brug tussen
 * de app en de kern (packages/core/src/ifcx/).
 *
 * Elk blad wordt hier doorgerekend, met de projectgegevens als startwaarden en
 * zijn eigen invoer, langs dezelfde route als de afdruk en de API. Een blad dat
 * omvalt blijft in het document staan, met de fout erbij: alleen de uitkomst
 * ontbreekt dan. Een blad zonder rekentekst (PDF, werkmap, Markdown, graaf, tekening,
 * Jupyter) heeft niets om door te rekenen.
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
  metVreemdeGegevens,
  type ElementRef,
  type IfcxVreemd,
  type VastgelegdeToets,
} from "@ifc-calc/core";
import { projectScope } from "./projectGegevens.ts";
import { belastingenVoorIfc } from "../rapport/belastingBronnen.ts";
import type { PdfBijlage } from "./pdfBijlage.ts";
import { isLosBlad, type SpreadsheetBestand } from "./spreadsheetBlad.ts";
import type { MarkdownBestand } from "./markdownBlad.ts";
import type { Graaf } from "../graaf/model.ts";
import { tekenVelVoorBestand, type TekenVel } from "./tekenBlad.ts";
import type { JupyterWerkmap } from "./jupyterBlad.ts";
import type { MarimoNotebook } from "./marimoBlad.ts";
import type { Varianten } from "./varianten.ts";
import { leesBron, rekenDoor } from "../mcp/rekenen.ts";
import { gebruikteToetsingen, toetsVersie } from "../rekenen/toetsCache.ts";
import { variantToetsHashes } from "../rekenen/varianten.ts";
import { scopeMetVerwijzingen, verwezenBladen } from "../rekenen/verwijzingen.ts";
import { maakPoer } from "../components/calc/poerDefinitie.ts";
import { poerIfcxKnopen } from "../components/calc/poerIfcx.ts";
import { maakMeerpaalPoer } from "../components/calc/meerpaalDefinitie.ts";
import { meerpaalIfcxKnopen } from "../components/calc/meerpaalIfcx.ts";

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
  graaf?: Graaf;
  tekenvel?: TekenVel;
  jupyter?: JupyterWerkmap;
  marimo?: MarimoNotebook;
  toetsingen?: Record<string, VastgelegdeToets>;
  varianten?: Varianten;
}

/** Wat dit bestand van een project nodig heeft. */
export interface ProjectVoorIfc {
  versie: number;
  /** De blijvende identiteit van het project; zonder volgt hij uit nummer en naam (core: ifcx/identiteit.ts). */
  id?: string;
  naam: string;
  gegevens: Record<string, string>;
  exemplaren: BladVoorIfc[];
  rapport?: unknown;
  verborgen?: { gegevens?: boolean; rapport?: boolean };
  /** Gegevens van een ander programma uit het geopende bestand; ze komen ongewijzigd terug. */
  vreemd?: IfcxVreemd;
}

/** Ook de antwoorden van FEM Studio tellen: een nieuw antwoord geeft een andere uitkomst. */
const bewaard = new WeakMap<object, { gegevens: object; toetsV: number; blad: IfcCalcSheet }>();

/**
 * Eén blad, doorgerekend, zoals de kern het wil. Zonder doorrekenen: alleen de velden van het blad.
 * Een blad dat naar een ander blad of een spreadsheetcel verwijst (`#1.R_paal`, `#3.Blad1!B4`),
 * rekent met die waarden (rekenen/verwijzingen.ts); de bewaarde uitkomst geldt dan niet, want
 * het andere blad kan veranderd zijn.
 */
function bladVoorIfc(ex: BladVoorIfc, gegevens: Record<string, string>, alle: readonly BladVoorIfc[]): IfcCalcSheet {
  const hier = bewaard.get(ex);
  const toetsV = toetsVersie();
  const verwezen = isLosBlad(ex) ? [] : verwezenBladen(ex.source, ex.waarden, alle);
  if (verwezen.length === 0 && hier && hier.gegevens === gegevens && hier.toetsV === toetsV) return hier.blad;

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
    graaf: ex.graaf,
    ...(ex.tekenvel ? { tekenvel: tekenVelVoorBestand(ex.tekenvel) as unknown as Record<string, unknown> } : {}),
    jupyter: ex.jupyter,
    marimo: ex.marimo,
    ...(ex.varianten ? { varianten: ex.varianten } : {}),
    nodes: [],
  };
  if (!isLosBlad(ex)) {
    try {
      const basis = projectScope(gegevens);
      const scope = verwezen.length ? scopeMetVerwijzingen(ex.source, ex.waarden, basis, verwezen, {}, {}) : basis;
      const { nodes, resultaat } = rekenDoor(ex.source, ex.waarden, scope, ex.naam);
      blad.nodes = nodes;
      blad.resultaat = resultaat;
      // Een balklaagblad levert ook zijn balken en plaat als elementen met geometrie.
      if (ex.templateId === "balklaag") {
        const scope = extractScope(leesBron(ex.source), ex.waarden, projectScope(gegevens));
        blad.geometrie = balklaagIfcxKnopenUitScope(ex.id, scope) ?? undefined;
      }
      // Een tweepaalspoer: uit de invoer, via dezelfde definitie als de tekening.
      if (ex.templateId === "tweepaalspoer") {
        const lees = (naam: string) => {
          const n = parseFloat(String(ex.waarden[naam] ?? "").replace(",", "."));
          return Number.isFinite(n) ? n : 0;
        };
        blad.geometrie = poerIfcxKnopen(maakPoer(lees), ex.id) ?? undefined;
      }
      // Een poer op drie of vier palen: de invoer, en waar die leeg is de beginwaarde uit
      // de bladtekst (?{…}); via dezelfde definitie als de staaflijst en het DXF-detail.
      if (ex.templateId === "meerpaalspoer") {
        const scope = extractScope(leesBron(ex.source), ex.waarden, projectScope(gegevens));
        const lees = (naam: string) => {
          const n = parseFloat(String(ex.waarden[naam] ?? "").replace(",", "."));
          if (Number.isFinite(n)) return n;
          const v = scope[naam] as unknown;
          if (typeof v === "number") return v;
          const g = v as { toNumber?: (eenheid?: string) => number } | undefined;
          try {
            const w = g?.toNumber?.("mm");
            return typeof w === "number" && Number.isFinite(w) ? w : 0;
          } catch {
            return 0;
          }
        };
        blad.geometrie = meerpaalIfcxKnopen(maakMeerpaalPoer(lees), ex.id) ?? undefined;
      }
    } catch (err) {
      blad.fout = (err as Error).message;
      console.error(`Blad "${ex.naam}" kon niet worden doorgerekend:`, err);
    }
  }
  // Ook de antwoorden die de varianten gebruiken: zonder vallen ze bij het opslaan weg.
  blad.toetsingen = gebruikteToetsingen(ex.toetsingen, blad, isLosBlad(ex) ? [] : variantToetsHashes(ex, projectScope(gegevens)));
  bewaard.set(ex, { gegevens, toetsV, blad });
  return blad;
}

/** Alle bladen van het project, doorgerekend. */
export function bladenVoorIfc(project: Pick<ProjectVoorIfc, "exemplaren" | "gegevens">): IfcCalcSheet[] {
  return project.exemplaren.map((ex) => bladVoorIfc(ex, project.gegevens, project.exemplaren));
}

/** Het project als IFCX-document. `bladen` zijn de doorgerekende bladen; zonder rekent dit ze door. */
export function projectIfcx(project: ProjectVoorIfc, bladen?: IfcCalcSheet[]): IfcxBestand {
  return metVreemdeGegevens(bouwProjectIfcx({
    id: project.id,
    naam: project.naam,
    formaatversie: project.versie,
    gegevens: project.gegevens,
    bladen: bladen ?? bladenVoorIfc(project),
    rapport: project.rapport,
    belastingen: belastingenVoorIfc(project.rapport),
    verborgen: project.verborgen,
  }), project.vreemd);
}

/** Het project als STEP, uit hetzelfde document als het IFCX. */
export function projectStep(project: ProjectVoorIfc, bladen?: IfcCalcSheet[]): string {
  return bouwProjectStep(projectIfcx(project, bladen));
}
