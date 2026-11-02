/**
 * MCP-requestafhandeling: sessies en een wachtrij, los van Tauri.
 *
 * Herkomst: overgenomen uit Open Planner Studio
 * (`src/services/mcp/requestHandler.ts`, OpenAEC Foundation,
 * LGPL-3.0-or-later). Weggelaten wat daar Planner-eigen is: het drift-anker
 * per sessie (deze app heeft één project open, geen tabbladen) en het
 * activiteitenlog.
 *
 * SESSIES (MCP streamable HTTP, `Mcp-Session-Id`). Elke geslaagde `initialize`
 * krijgt een nieuwe sessie-id; Rust zet die als header op het antwoord en geeft
 * de header van latere requests door. Elk request behalve `initialize` moet een
 * bekende sessie-id dragen: ontbreekt de header, dan `400` met een JSON-RPC-fout;
 * is hij onbekend (na een nieuw token of een herstart van de app), dan `404`
 * zonder body, waarna de client volgens de spec opnieuw initialiseert.
 *
 * REST. Een request met `kind: "rest"` gaat naar `verwerkRest` (rest.ts), zonder
 * sessie: het token is genoeg. Het antwoord draagt de HTTP-status die rest.ts
 * koos; Rust neemt die over.
 *
 * WACHTRIJ. Requests lopen strikt na elkaar, MCP en REST door elkaar. Rust houdt er ook maar één
 * tegelijk in de lucht, maar geeft dat slot na zijn time-out (120 s) vrij
 * terwijl de webview misschien nog rekent; zonder deze keten liep het volgende
 * request daar doorheen. Een request dat al door Rust is opgegeven wordt niet
 * meer uitgevoerd (`MCP_WACHTRIJ_GRENS_MS`): liever een fout dan een mutatie
 * die de client als mislukt ziet en opnieuw stuurt.
 */

/** Zoveel sessies onthoudt de app; een nieuwe boven die grens verdringt de oudste. */
export const MCP_MAX_SESSIES = 32;

/** Iets onder de 120 s van Rust (`RESPONSE_TIMEOUT` in mcp_bridge.rs). */
export const MCP_WACHTRIJ_GRENS_MS = 110_000;

/**
 * Eén request zoals Rust het doorgeeft: de body plus de `Mcp-Session-Id`-header
 * als die er was. Een REST-request (onder /api/v1) heeft `kind: "rest"` en
 * draagt methode en pad (met query); het kent geen MCP-sessie.
 */
export interface McpRequestEvent {
  id: number;
  body: string;
  sessionId?: string | null;
  kind?: "rest";
  method?: string;
  path?: string;
}

/**
 * Het antwoord terug naar Rust. `sessionId` ⇒ Rust zet de `Mcp-Session-Id`-header;
 * `status` ⇒ `400` (sessie-header ontbreekt, met JSON-RPC-fout als body) of
 * `404` (onbekende sessie, zonder body).
 */
export interface McpResponseEvent {
  id: number;
  body: string;
  sessionId?: string;
  status?: number;
}

export interface McpSessies {
  has(id: string): boolean;
  /** Opent een nieuwe sessie; verdringt zo nodig de oudste. */
  open(): string;
  /** Alle sessies weg (nieuw token: oude koppelingen gelden niet meer). */
  clear(): void;
  size(): number;
}

export function maakSessies(nieuweId: () => string = willekeurigeId, max = MCP_MAX_SESSIES): McpSessies {
  // Set-volgorde = volgorde van openen; de oudste gaat eerst.
  const sessies = new Set<string>();
  return {
    has: (id) => sessies.has(id),
    open: () => {
      while (sessies.size >= max) sessies.delete(sessies.values().next().value!);
      const id = nieuweId();
      sessies.add(id);
      return id;
    },
    clear: () => sessies.clear(),
    size: () => sessies.size,
  };
}

function willekeurigeId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

export interface RequestHandlerDeps {
  /** Echt: Tauri `emit`. */
  emit: (event: string, payload: unknown) => void | Promise<void>;
  /** Verwerkt de rauwe JSON-RPC-body (echt: `verwerkMcpBericht`). */
  verwerk: (body: string) => string | Promise<string>;
  /** Verwerkt een REST-request (echt: `verwerkRest`). Ontbreekt hij, dan 404. */
  verwerkRest?: (methode: string, pad: string, body: string) => Promise<{ status: number; body: string }>;
  sessies: McpSessies;
  /** Klok in ms (test-injectie). */
  nu?: () => number;
}

/**
 * Maakt de handler voor `mcp://request`. Het antwoord gaat terug als
 * `mcp://response` met hetzelfde Rust-id — ook bij een notificatie (lege body),
 * want Rust wacht op elk id een antwoord.
 */
export function maakRequestHandler(deps: RequestHandlerDeps): (payload: McpRequestEvent) => Promise<void> {
  const nu = deps.nu ?? Date.now;
  let staart: Promise<void> = Promise.resolve();

  const verwerkRestEen = async (payload: McpRequestEvent, binnen: number): Promise<void> => {
    let antwoord: { status: number; body: string };
    if (nu() - binnen >= MCP_WACHTRIJ_GRENS_MS) {
      antwoord = { status: 504, body: JSON.stringify({ error: { code: "TIMEOUT", message: "not executed, waited too long in the queue" } }) };
    } else if (!deps.verwerkRest) {
      antwoord = { status: 404, body: JSON.stringify({ error: { code: "NOT_FOUND", message: "No REST API." } }) };
    } else {
      try {
        antwoord = await deps.verwerkRest(payload.method ?? "GET", payload.path ?? "/", payload.body);
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        antwoord = { status: 500, body: JSON.stringify({ error: { code: "INTERNAL", message: `Internal error: ${message}` } }) };
      }
    }
    await deps.emit("mcp://response", { id: payload.id, body: antwoord.body, status: antwoord.status } satisfies McpResponseEvent);
  };

  const verwerkEen = async (payload: McpRequestEvent, binnen: number): Promise<void> => {
    if (payload.kind === "rest") return verwerkRestEen(payload, binnen);
    const isInitialize = methodeVan(payload.body) === "initialize";
    const sessie = typeof payload.sessionId === "string" && payload.sessionId !== "" ? payload.sessionId : null;
    if (!isInitialize) {
      if (sessie === null) {
        await deps.emit("mcp://response", { id: payload.id, body: geenSessie(payload.body), status: 400 } satisfies McpResponseEvent);
        return;
      }
      if (!deps.sessies.has(sessie)) {
        await deps.emit("mcp://response", { id: payload.id, body: "", status: 404 } satisfies McpResponseEvent);
        return;
      }
    }
    let body: string;
    try {
      body = nu() - binnen >= MCP_WACHTRIJ_GRENS_MS ? teLangGewacht(payload.body) : await deps.verwerk(payload.body);
    } catch (e) {
      // Vangnet buiten de dispatcher: altijd een JSON-RPC-fout terug, anders
      // wacht de client tot de time-out van Rust.
      body = interneFout(payload.body, e);
    }
    const antwoord: McpResponseEvent = { id: payload.id, body };
    if (isInitialize && isGeslaagd(body)) antwoord.sessionId = deps.sessies.open();
    await deps.emit("mcp://response", antwoord);
  };

  return (payload) => {
    const binnen = nu();
    const run = staart.then(() => verwerkEen(payload, binnen));
    staart = run.catch((e) => {
      console.error("MCP: antwoord versturen mislukt:", e);
    });
    return run;
  };
}

function idVan(rauw: string): { id: unknown; notificatie: boolean } {
  try {
    const p = JSON.parse(rauw) as Record<string, unknown>;
    if (p && typeof p === "object" && !Array.isArray(p)) return { id: p.id ?? null, notificatie: !("id" in p) };
  } catch {
    /* onleesbaar: id null */
  }
  return { id: null, notificatie: false };
}

function methodeVan(rauw: string): string | null {
  try {
    const p = JSON.parse(rauw) as { method?: unknown };
    return p && typeof p === "object" && typeof p.method === "string" ? p.method : null;
  } catch {
    return null;
  }
}

function isGeslaagd(rauw: string): boolean {
  try {
    const p = JSON.parse(rauw) as Record<string, unknown>;
    return !!p && typeof p === "object" && "result" in p && !("error" in p);
  } catch {
    return false;
  }
}

function geenSessie(rauw: string): string {
  return JSON.stringify({
    jsonrpc: "2.0",
    id: idVan(rauw).id,
    error: { code: -32600, message: "Bad Request: missing Mcp-Session-Id header; send initialize first and include the session id it returns" },
  });
}

function teLangGewacht(rauw: string): string {
  const { id, notificatie } = idVan(rauw);
  if (notificatie) return "";
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32001, message: "timeout: not executed, waited too long in the queue" } });
}

function interneFout(rauw: string, e: unknown): string {
  const { id, notificatie } = idVan(rauw);
  if (notificatie) return "";
  const message = e instanceof Error ? e.message : String(e);
  return JSON.stringify({ jsonrpc: "2.0", id, error: { code: -32603, message: `Internal error: ${message}` } });
}
