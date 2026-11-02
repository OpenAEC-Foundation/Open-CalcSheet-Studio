/**
 * Vaste gegevens van de MCP-koppeling en de tekst waarmee een client verbindt.
 * Zonder imports, zodat de controle (scripts/check-mcp.mjs) het in Node laadt.
 */

/**
 * De standaardpoort van de MCP-brug. Bewust een vaste, hoge poort, zodat een
 * eenmaal ingestelde client blijft werken; naast die van de andere
 * OpenAEC-programma's (Open Planner Studio: 3877). Te wijzigen in
 * Instellingen > AI-assistent (MCP). Zie docs/mcp.md.
 */
export const MCP_STANDAARD_POORT = 3879;

/** De naam waaronder een client de server registreert (en `serverInfo.name`). */
export const MCP_SERVERNAAM = "open-calcsheet-studio";

/** Een poort die de brug mag gebruiken: een geheel getal boven de systeempoorten. */
export function geldigePoort(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1024 && n <= 65535;
}

/** Het adres van de MCP-server. Altijd loopback: de brug luistert nergens anders. */
export function mcpAdres(poort: number): string {
  return `http://127.0.0.1:${poort}/mcp`;
}

/**
 * De regel voor Claude Code. De header staat bewust achteraan: `--header` neemt
 * meerdere waarden, en vóór de naam zou hij die naam opslokken.
 */
export function claudeCodeCommando(poort: number, token: string): string {
  return `claude mcp add --transport http --scope user ${MCP_SERVERNAAM} ${mcpAdres(poort)} --header "Authorization: Bearer ${token}"`;
}

/** Een configuratieblok voor clients die een `mcpServers`-JSON lezen. */
export function clientConfiguratie(poort: number, token: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        [MCP_SERVERNAAM]: {
          type: "http",
          url: mcpAdres(poort),
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );
}

/** Een vers Bearer-token: 32 willekeurige bytes, hex (64 tekens). */
export function nieuwToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/** Het basisadres van de REST-API (zelfde brug, zelfde poort en token als MCP). */
export function restBasis(poort: number): string {
  return `http://127.0.0.1:${poort}/api/v1`;
}

/** De OpenAPI-specificatie; als enige route zonder token te lezen. */
export function openApiAdres(poort: number): string {
  return `${restBasis(poort)}/openapi.json`;
}

/** Een eerste REST-aanroep: het open project lezen. */
export function curlVoorbeeld(poort: number, token: string): string {
  return `curl -H "Authorization: Bearer ${token}" ${restBasis(poort)}/project`;
}
