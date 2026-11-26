/**
 * De rekendienst als HTTP-server en als MCP over stdio (docs/rekendienst.md).
 *
 * HTTP, op één poort:
 *   GET  /v1/health            zonder sleutel: of de dienst draait, met FEM Studio en PDF
 *   GET  /v1/openapi.json      zonder sleutel: de specificatie
 *   GET  /v1/tools             elke tool met zijn schema en routes
 *   POST /v1/tools/{naam}      elke tool, met de MCP-argumenten als body
 *   POST /mcp                  MCP (streamable HTTP, alleen JSON-antwoorden), met sessies
 *   /api/v1/…                  dezelfde routes als de REST-API van de desktop-app (rest.ts)
 * `/v1/…` is hetzelfde als `/api/v1/…`: het gezamenlijke contract van OpenAEC en de
 * paden van de app wijzen naar dezelfde afhandeling.
 *
 * Grenzen: een API-sleutel (Bearer) voor alles behalve gezondheid en specificatie, een
 * grens aan de grootte van een verzoek (413), een maximum aan gelijktijdige verzoeken
 * (429), een time-out (504) en geen Origin-header (403, zoals de app: een browser komt
 * er niet rechtstreeks in). Een verzoek noemt nooit een pad op de server.
 *
 * Elk MCP-sessie heeft een eigen project in het geheugen; een REST-verzoek met de header
 * `Mcp-Session-Id` van een open sessie werkt op dat project, zonder die header op een
 * nieuw, leeg project. Sessies vervallen na `sessieMinuten` zonder verzoek.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { createInterface } from "node:readline";

const JSON_KOP = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };

const foutBody = (code, message) => JSON.stringify({ error: { code, message } });

function gelijkeSleutel(gegeven, sleutels) {
  const a = createHash("sha256").update(gegeven).digest();
  let raak = false;
  for (const s of sleutels) {
    const b = createHash("sha256").update(s).digest();
    if (timingSafeEqual(a, b)) raak = true;
  }
  return raak;
}

/** Leest de body, hooguit `max` bytes; daarboven null. */
function leesBody(req, max) {
  return new Promise((ja, nee) => {
    const lengte = Number(req.headers["content-length"] ?? 0);
    if (lengte > max) {
      req.resume();
      ja(null);
      return;
    }
    const delen = [];
    let totaal = 0;
    let teGroot = false;
    req.on("data", (d) => {
      totaal += d.length;
      if (totaal > max) teGroot = true;
      else delen.push(d);
    });
    req.on("end", () => ja(teGroot ? null : Buffer.concat(delen).toString("utf8")));
    req.on("error", nee);
  });
}

/**
 * Maakt de dienst. `rekenen` levert wat de bundel van de app geeft (ingang.mjs):
 * `tools(projectVan)`, `nieuwProject()`, `verwerkMcpBericht`, `verwerkRest`, `openapi`.
 */
export function maakDienst(o) {
  const {
    tools, nieuwProject, verwerkMcpBericht, verwerkRest, openapiOpties, serverInfo, gezondheid,
    sleutels = [], maxBytes = 10 * 1024 * 1024, maxGelijk = 4, tijdMs = 120_000, maxSessies = 64, sessieMinuten = 30, log = () => {},
  } = o;

  /** Per sessie het project en wanneer het laatst gebruikt. */
  const sessies = new Map();
  /** De omgeving van elk project, terug naar zijn project. */
  const perOmgeving = new WeakMap();
  const maak = () => {
    const p = nieuwProject();
    perOmgeving.set(p.omgeving, p);
    return p;
  };
  const projectVan = (omgeving) => {
    const p = perOmgeving.get(omgeving);
    if (!p) throw new Error("onbekende omgeving");
    return p;
  };
  const lijst = tools({ projectVan, nieuwProject: maak });

  const ruimOp = () => {
    const grens = Date.now() - sessieMinuten * 60_000;
    for (const [id, s] of sessies) if (s.laatst < grens) sessies.delete(id);
    while (sessies.size > maxSessies) sessies.delete(sessies.keys().next().value);
  };
  const context = (project, poort) => () => ({
    omgeving: project.omgeving,
    alleenLezen: false,
    gepauzeerd: false,
    server: { naam: serverInfo.name, versie: serverInfo.version, poort },
  });

  let bezig = 0;

  /** Eén MCP-bericht op het project van een sessie; geeft { status, body, sessie? }. */
  async function mcp(body, sessieId, poort) {
    let methode = null;
    try {
      methode = JSON.parse(body)?.method ?? null;
    } catch {
      // de dispatcher meldt een onleesbare body
    }
    let sessie = null;
    if (methode === "initialize") {
      ruimOp();
      sessie = { project: maak(), laatst: Date.now() };
    } else if (sessieId) {
      sessie = sessies.get(sessieId) ?? null;
      if (!sessie) return { status: 404, body: "" };
      sessie.laatst = Date.now();
    } else {
      let id = null;
      try {
        id = JSON.parse(body)?.id ?? null;
      } catch {
        // onleesbaar
      }
      return {
        status: 400,
        body: JSON.stringify({
          jsonrpc: "2.0", id,
          error: { code: -32600, message: "Bad Request: missing Mcp-Session-Id header; send initialize first and include the session id it returns" },
        }),
      };
    }
    const antwoord = await verwerkMcpBericht(body, { tools: lijst, serverInfo, context: context(sessie.project, poort) });
    if (methode === "initialize" && antwoord.includes('"result"')) {
      const id = randomBytes(16).toString("hex");
      sessies.set(id, sessie);
      return { status: 200, body: antwoord, sessie: id };
    }
    return { status: antwoord === "" ? 202 : 200, body: antwoord };
  }

  async function behandel(req, res) {
    const poort = req.socket.localPort;
    const url = req.url ?? "/";
    const vraag = url.indexOf("?");
    const pad = (vraag >= 0 ? url.slice(0, vraag) : url).replace(/\/+$/, "") || "/";
    const query = vraag >= 0 ? url.slice(vraag) : "";
    const methode = (req.method ?? "GET").toUpperCase();
    const stuur = (status, body, kop = JSON_KOP) => {
      res.writeHead(status, kop);
      res.end(body);
    };

    if (req.headers.origin !== undefined) return stuur(403, foutBody("FORBIDDEN", "Requests with an Origin header are refused: call the service from a server, not from a browser."));

    // De paden van het contract (/v1/…) en die van de app (/api/v1/…) zijn dezelfde.
    const appPad = pad === "/v1" || pad.startsWith("/v1/") ? `/api${pad}` : pad;
    if (appPad === "/api/v1/health") {
      if (methode !== "GET") return stuur(405, foutBody("METHOD_NOT_ALLOWED", `${methode} is not allowed on ${pad}.`));
      return stuur(200, JSON.stringify({ status: "ok", ...serverInfo, ...(await gezondheid()) }));
    }
    const open = appPad === "/api/v1/openapi.json" && methode === "GET";
    if (!open) {
      const kop = req.headers.authorization ?? "";
      const m = /^Bearer\s+(.+)$/i.exec(kop);
      if (!m || !gelijkeSleutel(m[1].trim(), sleutels)) {
        req.resume();
        return stuur(401, foutBody("UNAUTHORIZED", "Missing or wrong API key: send 'Authorization: Bearer <key>'."), { ...JSON_KOP, "WWW-Authenticate": "Bearer" });
      }
    }
    if (bezig >= maxGelijk) {
      req.resume();
      return stuur(429, foutBody("TOO_BUSY", `At most ${maxGelijk} requests at a time; try again shortly.`), { ...JSON_KOP, "Retry-After": "1" });
    }
    bezig++;
    let klok;
    try {
      const body = methode === "GET" || methode === "DELETE" ? "" : await leesBody(req, maxBytes);
      if (body === null) return stuur(413, foutBody("TOO_LARGE", `The request body is larger than ${Math.round(maxBytes / 1048576)} MiB.`));
      const werk = (async () => {
        if (appPad === "/mcp") {
          const sessieId = typeof req.headers["mcp-session-id"] === "string" ? req.headers["mcp-session-id"] : null;
          if (methode === "DELETE") {
            if (!sessieId || !sessies.delete(sessieId)) return { status: 404, body: "" };
            return { status: 204, body: "" };
          }
          if (methode !== "POST") return { status: 405, body: foutBody("METHOD_NOT_ALLOWED", "Use POST /mcp (JSON responses; no event stream)."), kop: { ...JSON_KOP, Allow: "POST, DELETE" } };
          return mcp(body, sessieId, poort);
        }
        if (appPad === "/api/v1" || appPad.startsWith("/api/v1/")) {
          const sessieId = typeof req.headers["mcp-session-id"] === "string" ? req.headers["mcp-session-id"] : null;
          let project;
          if (sessieId) {
            const s = sessies.get(sessieId);
            if (!s) return { status: 404, body: foutBody("NOT_FOUND", "Unknown Mcp-Session-Id: the session has ended; leave the header out or start a new session.") };
            s.laatst = Date.now();
            project = s.project;
          } else {
            project = maak();
          }
          return verwerkRest(methode, `${appPad}${query}`, body, { tools: lijst, context: context(project, poort), openapi: openapiOpties(req) });
        }
        return { status: 404, body: foutBody("NOT_FOUND", `No route ${pad}. GET /v1/openapi.json describes the service.`) };
      })();
      const uit = await Promise.race([
        werk,
        new Promise((ja) => {
          klok = setTimeout(() => ja({ status: 504, body: foutBody("TIMEOUT", `No answer within ${tijdMs / 1000} s.`) }), tijdMs);
        }),
      ]);
      const kop = { ...(uit.kop ?? JSON_KOP), ...(uit.sessie ? { "Mcp-Session-Id": uit.sessie } : {}) };
      if (uit.status === 204 || uit.status === 202 || (uit.status === 404 && uit.body === "")) {
        res.writeHead(uit.status, uit.sessie ? { "Mcp-Session-Id": uit.sessie } : {});
        res.end();
      } else {
        stuur(uit.status, uit.body, kop);
      }
      log(`${methode} ${pad} ${uit.status}`);
    } catch (e) {
      stuur(500, foutBody("INTERNAL", `Internal error: ${e instanceof Error ? e.message : String(e)}`));
    } finally {
      clearTimeout(klok);
      bezig--;
    }
  }

  return {
    tools: lijst,
    /** Luistert op adres en poort; geeft de HTTP-server zodra hij luistert. */
    luister(adres, poort) {
      if (sleutels.length === 0) throw new Error("Geen API-sleutel: zet REKENDIENST_TOKEN (of REKENDIENST_TOKEN_BESTAND).");
      const server = createServer((req, res) => {
        behandel(req, res).catch((e) => {
          try {
            res.writeHead(500, JSON_KOP).end(foutBody("INTERNAL", String(e)));
          } catch {
            // verbinding al weg
          }
        });
      });
      server.requestTimeout = tijdMs + 10_000;
      server.headersTimeout = 30_000;
      return new Promise((ja, nee) => {
        server.once("error", nee);
        server.listen(poort, adres, () => ja(server));
      });
    },
    /**
     * MCP over stdin en stdout: één JSON-RPC-bericht per regel, één project. Zonder
     * sleutel: wie het proces start, heeft het al in handen.
     */
    stdio(invoer = process.stdin, uitvoer = process.stdout) {
      const project = maak();
      const ctx = context(project, 0);
      let staart = Promise.resolve();
      const regels = createInterface({ input: invoer });
      regels.on("line", (regel) => {
        if (!regel.trim()) return;
        staart = staart.then(async () => {
          const antwoord = await verwerkMcpBericht(regel, { tools: lijst, serverInfo, context: ctx });
          if (antwoord) uitvoer.write(`${antwoord}\n`);
        }).catch((e) => log(`stdio: ${e?.message ?? e}`));
      });
      return new Promise((klaar) => regels.on("close", () => staart.then(klaar)));
    },
  };
}
