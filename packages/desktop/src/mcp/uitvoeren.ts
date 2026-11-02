/**
 * Eén tool uitvoeren: de enige weg, voor MCP (dispatcher.ts) en REST (rest.ts).
 *
 * Volgorde: argumenten tegen het schema → pauze → alleen-lezen → de handler.
 * Een gegooide `McpFout` wordt een fout met zijn eigen code; elke andere
 * gegooide fout een `INTERNAL` met de melding (de API is alleen lokaal en met
 * token bereikbaar; de melding helpt de client, bijv. "bestand niet gevonden").
 */
import { McpFout, type JsonSchema, type McpContext, type McpToolDef, type McpToolResultaat } from "./contracts.ts";

function soortVan(w: unknown): string {
  if (w === null) return "null";
  if (Array.isArray(w)) return "array";
  if (typeof w === "number") return Number.isInteger(w) ? "integer" : "number";
  return typeof w;
}

function past(type: string, w: unknown): boolean {
  const s = soortVan(w);
  return type === s || (type === "number" && s === "integer");
}

/**
 * Controleert `w` tegen een (eenvoudig) schema. Geeft de eerste schending als
 * tekst, of null. Zonder deze poort zou elk `enum`, `required` en
 * `additionalProperties` in tools/list en de OpenAPI-specificatie puur
 * decoratief zijn.
 */
export function controleerSchema(schema: JsonSchema, w: unknown, pad = "arguments"): string | null {
  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((t) => past(t, w))) return `${pad} must be ${types.join(" or ")}`;
  }
  if (schema.enum && !schema.enum.some((e) => e === w)) {
    return `${pad} must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(", ")}`;
  }
  if (typeof w === "string" && schema.minLength !== undefined && w.length < schema.minLength) {
    return schema.minLength === 1 ? `${pad} must not be empty` : `${pad} must have at least ${schema.minLength} characters`;
  }
  if (typeof w === "number") {
    if (schema.minimum !== undefined && w < schema.minimum) return `${pad} must be >= ${schema.minimum}`;
    if (schema.maximum !== undefined && w > schema.maximum) return `${pad} must be <= ${schema.maximum}`;
  }
  if (Array.isArray(w) && schema.items) {
    for (let i = 0; i < w.length; i++) {
      const f = controleerSchema(schema.items, w[i], `${pad}[${i}]`);
      if (f) return f;
    }
  }
  if (w && typeof w === "object" && !Array.isArray(w)) {
    const obj = w as Record<string, unknown>;
    for (const naam of schema.required ?? []) {
      if (obj[naam] === undefined) return `${pad}.${naam} is required`;
    }
    for (const [naam, waarde] of Object.entries(obj)) {
      const eigen = schema.properties?.[naam];
      if (eigen) {
        const f = controleerSchema(eigen, waarde, `${pad}.${naam}`);
        if (f) return f;
      } else if (schema.additionalProperties === false) {
        return `${pad}.${naam} is not a known argument`;
      } else if (schema.additionalProperties && typeof schema.additionalProperties === "object") {
        const f = controleerSchema(schema.additionalProperties, waarde, `${pad}.${naam}`);
        if (f) return f;
      }
    }
  }
  return null;
}

const INSTELLING = "Settings > API and AI assistant";

/** Voert één tool uit met alle poorten ervoor. Gooit nooit. */
export async function voerToolUit(def: McpToolDef, args: unknown, ctx: McpContext): Promise<McpToolResultaat> {
  const schending = controleerSchema(def.inputSchema, args);
  if (schending) return { ok: false, code: "VALIDATION", error: `Invalid arguments for ${def.name}: ${schending}` };
  if (ctx.gepauzeerd) {
    return {
      ok: false,
      code: "PAUSED",
      error: `The user has paused the API and AI connection in Open CalcSheet Studio (${INSTELLING}). Ask the user to resume it.`,
    };
  }
  if (ctx.alleenLezen && (def.kind === "mutate" || def.kind === "file")) {
    return {
      ok: false,
      code: "READ_ONLY",
      error: `The API and AI connection is read-only (${INSTELLING}); ${def.name} would change the project, the app or a file. Ask the user to allow changes.`,
    };
  }
  try {
    return await def.handler(args as Record<string, unknown>, ctx);
  } catch (e) {
    if (e instanceof McpFout) return { ok: false, code: e.code, error: e.message };
    const melding = e instanceof Error ? e.message : String(e);
    return { ok: false, code: "INTERNAL", error: `Internal error in ${def.name}: ${melding}` };
  }
}
