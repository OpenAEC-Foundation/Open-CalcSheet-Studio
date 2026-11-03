/**
 * Doorrekenen voor de MCP-tools: synchroon, op de UI-thread, niet via de worker.
 *
 * Dit is dezelfde rekenroute als die van de afdruk
 * (components/calc/bladDoorrekenen.ts `rekenBladDoor`, en voor de getallen
 * components/calc/bladResultaat.ts `rekenBladDoor`): inlezen met dezelfde
 * includes en afbeeldingen, doorrekenen met de invoer van het blad en de
 * projectgegevens als scope, en de uitkomst lezen met `leesResultaat` en
 * `leesGetallen`. Het enige verschil: hier blijven de uitgerekende knopen en
 * de foutmelding bewaard, want een AI-assistent heeft juist aan die twee iets.
 *
 * De worker (rekenen/doorrekening.ts) is er voor het typen in de werkruimte;
 * een tool moet zijn antwoord in één keer kunnen geven.
 *
 * Laadt zonder React of stores (imports met `.ts`), zodat de controle
 * (scripts/check-mcp.mjs) dit bestand in Node gebruikt.
 */
import { parse, evaluate } from "@ifc-calc/core";
import type { AstNode, EvaluatedNode } from "@ifc-calc/core";
import { calcpadIncludes, calcpadImageUrls } from "../templates/calcpad-includes.ts";
import { leesGetallen, leesResultaat, metRefNamen, type Resultaat } from "../components/calc/bladLezen.ts";
import { rekenEenhedenDoor } from "../components/calc/canvasRekenen.ts";
import { heeftEenheden } from "../store/canvasBlad.ts";

/** Leest een rekentekst in, met dezelfde includes en afbeeldingen als de uitwerking. */
export function leesBron(source: string): AstNode[] {
  return parse(source, { includes: calcpadIncludes, imageUrls: calcpadImageUrls });
}

export interface Doorrekening {
  nodes: EvaluatedNode[];
  resultaat: Resultaat;
  /** Elke zichtbare uitkomst op naam, in de eenheid van het blad. */
  getallen: Record<string, number>;
}

/** Rekent een tekst door. Werpt bij een fout in het inlezen of rekenen. */
export function rekenDoor(
  source: string,
  waarden: Record<string, string>,
  scope: Record<string, unknown>,
  naam: string,
): Doorrekening {
  // Een canvas-blad langs dezelfde route als op het scherm: een fout blijft bij zijn eenheid.
  const nodes = heeftEenheden(source)
    ? rekenEenhedenDoor(source, waarden, scope, { includes: calcpadIncludes, imageUrls: calcpadImageUrls }).flatMap((u) => u.nodes)
    : evaluate(leesBron(source), waarden, scope);
  return {
    nodes,
    resultaat: leesResultaat(nodes, naam),
    getallen: metRefNamen(leesGetallen(nodes), source),
  };
}

/** Een getal dat JSON overleeft: ∞ en NaN worden tekst. */
export function jsonGetal(n: number | null | undefined): number | string | null {
  if (n === null || n === undefined) return null;
  if (Number.isNaN(n)) return "NaN";
  if (!Number.isFinite(n)) return n > 0 ? "Infinity" : "-Infinity";
  return n;
}

/** Een uitkomst van de UC's op naam: alle getallen waarvan de naam met UC begint. */
export function ucWaarden(getallen: Record<string, number>): Record<string, number | string | null> {
  const uit: Record<string, number | string | null> = {};
  for (const [naam, w] of Object.entries(getallen)) {
    if (/^uc(?:$|_)/i.test(naam)) uit[naam] = jsonGetal(w);
  }
  return uit;
}

/** Eén regel van een doorgerekende tekst, zoals calc_evaluate hem teruggeeft. */
export type McpRegel = Record<string, unknown> & { type: string };

const zonderHtml = (t: string) => t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/**
 * De uitgerekende knopen als platte lijst regels. Een voorwaardelijk blok
 * levert zijn gekozen tak; figuren worden één regel `figure`. Na `max` regels
 * stopt de lijst (`afgekapt`).
 */
export function regels(nodes: EvaluatedNode[], max: number): { regels: McpRegel[]; afgekapt: boolean } {
  const uit: McpRegel[] = [];
  let afgekapt = false;
  const loop = (lijst: EvaluatedNode[]) => {
    for (const n of lijst) {
      if (uit.length >= max) {
        afgekapt = true;
        return;
      }
      switch (n.type) {
        case "conditional-branch":
          loop(n.children);
          break;
        case "heading":
          uit.push({ type: "heading", level: n.level, text: zonderHtml(n.text) });
          break;
        case "text": {
          const tekst = zonderHtml(n.text);
          if (tekst) uit.push({ type: "text", text: tekst });
          break;
        }
        case "assignment": {
          const regel: McpRegel = { type: "assignment", name: n.name, expression: n.expression, result: n.result };
          if (n.unit) regel.unit = n.unit;
          if (typeof n.waarde === "number") regel.value = jsonGetal(n.waarde);
          if (n.result.startsWith("Error")) regel.error = n.result;
          uit.push(regel);
          break;
        }
        case "var-display": {
          const regel: McpRegel = { type: "value", name: n.name, result: n.result };
          if (n.unit) regel.unit = n.unit;
          if (typeof n.waarde === "number") regel.value = jsonGetal(n.waarde);
          uit.push(regel);
          break;
        }
        case "input-prompt":
          uit.push({ type: "input", name: n.name, label: zonderHtml(n.label), value: n.currentValue, unit: n.unit });
          break;
        case "select":
          uit.push({
            type: "select",
            name: n.name,
            label: zonderHtml(n.label),
            selected: n.selectedValue,
            options: n.options.map((o) => ({ value: o.value, text: o.text })),
          });
          break;
        case "user-function":
          uit.push({ type: "function", name: n.name, params: n.params, expression: n.expression });
          break;
        default:
          uit.push({ type: "figure" });
      }
    }
  };
  loop(nodes);
  return { regels: uit, afgekapt };
}
