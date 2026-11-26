/**
 * Het constructierapport als PDF, in headless Chromium: dezelfde componenten, dezelfde CSS
 * en dezelfde paginering als "Rapport (PDF)" in de app. Dezelfde weg als
 * scripts/rapport-pdf.mjs, maar op de gebouwde pagina's van de rekendienst
 * (`vite build --mode rekendienst`, met de haak `window.__ocs`) in plaats van de
 * dev-server.
 *
 *   • De pagina's komen van een eigen server op 127.0.0.1 (een vrije poort), alleen voor
 *     Chromium. Elk ander verzoek van de pagina wordt geweigerd (Fetch-domein): een blad
 *     met een afbeelding of script van buiten haalt niets op.
 *   • Eén Chromium voor de hele dienst, gestart bij het eerste rapport; per rapport een
 *     eigen browsercontext, daarna weggegooid. Stopt Chromium, dan start het volgende
 *     rapport een nieuwe.
 *   • De dienst roept dit één rapport tegelijk aan (de rij in server.mjs).
 *
 * De DevTools-client gebruikt de WebSocket van Node zelf, zonder extra afhankelijkheden.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, resolve, sep } from "node:path";

const SOORTEN = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".wasm": "application/wasm", ".cpd": "text/plain; charset=utf-8",
  ".ico": "image/x-icon", ".mp4": "video/mp4", ".geojson": "application/json", ".map": "application/json",
};

/** Waar een Chromium of Chrome kan staan, per platform; de eerste die bestaat. */
export const CHROMIUM_PADEN = [
  "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable",
  "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
];

const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

/** De gebouwde pagina's op 127.0.0.1, alleen lezen, binnen de map. */
function startPaginaServer(map) {
  const wortel = resolve(map);
  const server = createServer((req, res) => {
    let pad;
    try {
      pad = decodeURIComponent(new URL(req.url, "http://x").pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (pad.endsWith("/")) pad += "index.html";
    const bestand = normalize(join(wortel, pad));
    if (bestand !== wortel && !bestand.startsWith(wortel + sep)) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(bestand) || !statSync(bestand).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": SOORTEN[extname(bestand).toLowerCase()] ?? "application/octet-stream", "Cache-Control": "no-store" });
    res.end(readFileSync(bestand));
  });
  return new Promise((ja, nee) => {
    server.once("error", nee);
    server.listen(0, "127.0.0.1", () => ja({ server, url: `http://127.0.0.1:${server.address().port}/` }));
  });
}

/** Minimale DevTools-client: commando's met antwoord, en luisteraars voor gebeurtenissen. */
export class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.volgende = 0;
    this.open = new Map();
    this.luisteraars = new Set();
    ws.addEventListener("message", (ev) => {
      const b = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString("utf8"));
      if (b.id !== undefined) {
        const w = this.open.get(b.id);
        if (!w) return;
        this.open.delete(b.id);
        if (b.error) w.nee(new Error(`${w.methode}: ${b.error.message}`));
        else w.ja(b.result);
      } else {
        for (const f of [...this.luisteraars]) f(b);
      }
    });
    ws.addEventListener("close", () => {
      this.dicht = true;
      for (const w of this.open.values()) w.nee(new Error("de verbinding met Chromium is verbroken."));
      this.open.clear();
    });
  }

  static async verbind(url) {
    const ws = new WebSocket(url);
    await new Promise((ja, nee) => {
      ws.addEventListener("open", ja, { once: true });
      ws.addEventListener("error", () => nee(new Error(`geen verbinding met ${url}.`)), { once: true });
    });
    return new Cdp(ws);
  }

  stuur(methode, params = {}, sessionId) {
    const id = ++this.volgende;
    this.ws.send(JSON.stringify(sessionId ? { id, method: methode, params, sessionId } : { id, method: methode, params }));
    return new Promise((ja, nee) => this.open.set(id, { ja, nee, methode }));
  }

  wachtOp(filter, ms, wat) {
    return new Promise((ja, nee) => {
      const f = (b) => {
        if (!filter(b)) return;
        klaar();
        ja(b);
      };
      const t = setTimeout(() => {
        klaar();
        nee(new Error(`${wat} bleef na ${ms / 1000} s uit.`));
      }, ms);
      const klaar = () => {
        clearTimeout(t);
        this.luisteraars.delete(f);
      };
      this.luisteraars.add(f);
    });
  }
}

/** Start Chromium met een eigen, tijdelijk profiel; geeft de DevTools-client. */
export async function startChromium(pad, { taal, zonderSandbox }) {
  const profiel = mkdtempSync(join(tmpdir(), "rekendienst-chromium-"));
  const proc = spawn(pad, [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profiel}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    "--disable-extensions",
    "--disable-background-networking",
    "--disable-sync",
    "--metrics-recording-only",
    "--mute-audio",
    `--lang=${taal}`,
    "--window-size=1280,900",
    ...(zonderSandbox ? ["--no-sandbox"] : []),
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  let gestopt = false;
  proc.stderr.on("data", (d) => {
    stderr = (stderr + d).slice(-4000);
  });
  proc.on("exit", () => {
    gestopt = true;
  });
  proc.on("error", () => {
    gestopt = true;
  });
  const bestand = join(profiel, "DevToolsActivePort");
  for (let i = 0; i < 300 && !gestopt; i++) {
    if (existsSync(bestand)) {
      const poort = Number(readFileSync(bestand, "utf8").split(/\r?\n/)[0]);
      if (poort > 0) {
        const versie = await (await fetch(`http://127.0.0.1:${poort}/json/version`)).json();
        const cdp = await Cdp.verbind(versie.webSocketDebuggerUrl);
        const stop = () => {
          try {
            proc.kill();
          } catch {
            // al weg
          }
          setTimeout(() => rmSync(profiel, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }), 500);
        };
        return { cdp, proc, versie: versie.Browser, stop, levend: () => !gestopt && !cdp.dicht };
      }
    }
    await wacht(100);
  }
  try {
    proc.kill();
  } catch {
    // al weg
  }
  rmSync(profiel, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  throw new Error(`Chromium (${pad}) gaf geen debugpoort.\n${stderr.trim()}`);
}

/**
 * De maker van rapporten, of null als er geen Chromium of geen gebouwde pagina's zijn.
 * `maak(inhoud, naam)` geeft { pdf, paginas }.
 */
export function maakRapportPdf({ chromium, paginas, taal = "en", zonderSandbox = false, tijdMs = 120_000 }) {
  const pad = chromium ?? CHROMIUM_PADEN.find((p) => existsSync(p));
  if (!pad || !existsSync(pad) || !paginas || !existsSync(join(paginas, "index.html"))) return null;
  let browser = null;
  let pagina = null;

  const zorgVoor = async () => {
    pagina ??= await startPaginaServer(paginas);
    if (!browser?.levend()) {
      browser?.stop();
      browser = await startChromium(pad, { taal, zonderSandbox });
    }
    return { cdp: browser.cdp, url: pagina.url };
  };

  async function maak(inhoud, naam) {
    const { cdp, url } = await zorgVoor();
    const { browserContextId } = await cdp.stuur("Target.createBrowserContext", { disposeOnDetach: true });
    try {
      const { targetId } = await cdp.stuur("Target.createTarget", { url: "about:blank", browserContextId });
      const { sessionId } = await cdp.stuur("Target.attachToTarget", { targetId, flatten: true });
      const p = (methode, params) => cdp.stuur(methode, params, sessionId);
      const meldingen = [];
      const luister = (b) => {
        if (b.sessionId !== sessionId) return;
        if (b.method === "Runtime.exceptionThrown") meldingen.push(b.params.exceptionDetails.exception?.description ?? b.params.exceptionDetails.text);
        if (b.method === "Fetch.requestPaused") {
          const toegestaan = b.params.request.url.startsWith(url);
          void p(toegestaan ? "Fetch.continueRequest" : "Fetch.failRequest", toegestaan ? { requestId: b.params.requestId } : { requestId: b.params.requestId, errorReason: "BlockedByClient" }).catch(() => {});
        }
      };
      cdp.luisteraars.add(luister);
      try {
        await p("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
        await p("Page.enable");
        await p("Runtime.enable");
        const evalueer = async (expressie, wat) => {
          const r = await p("Runtime.evaluate", { expression: expressie, awaitPromise: true, returnByValue: true });
          if (r.exceptionDetails) throw new Error(`${wat} mislukte in de pagina: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
          return r.result.value;
        };
        const wachtTot = async (expressie, ms, fout) => {
          const tot = Date.now() + ms;
          while (Date.now() < tot) {
            if (await evalueer(expressie, "wachten")) return;
            await wacht(100);
          }
          throw new Error(`${fout}${meldingen.length ? ` (${meldingen.slice(0, 3).join("; ")})` : ""}`);
        };
        const geladen = cdp.wachtOp((b) => b.sessionId === sessionId && b.method === "Page.loadEventFired", 30_000, "het laden van de pagina's");
        await p("Page.navigate", { url });
        await geladen;
        await wachtTot("typeof window.__ocs === 'object' && window.__ocs !== null && (document.getElementById('root')?.childElementCount ?? 0) > 0", 30_000,
          "de pagina's van het rapport startten niet (geen window.__ocs)");

        // Zelfde weg als scripts/rapport-pdf.mjs en "Rapport (PDF)" in de app.
        const stand = await evalueer(`(async () => {
          const { useProjectStore, usePrintStore, leesProjectBestand, wachtOpVellen, zetDrukvellenKlaar } = window.__ocs;
          useProjectStore.getState().laadProject(leesProjectBestand(${JSON.stringify(inhoud)}, ${JSON.stringify(naam)}));
          useProjectStore.getState().selecteer("__rapport__");
          usePrintStore.getState().toonVoorbeeld(null, "rapport");
          await document.fonts.ready;
          await new Promise((r) => setTimeout(r, 1500));
          zetDrukvellenKlaar(await wachtOpVellen(${Math.max(20_000, tijdMs - 40_000)}));
          await document.fonts.ready;
          await window.__ocs.wachtOpDrukbeelden();
          await new Promise((r) => { requestAnimationFrame(() => requestAnimationFrame(r)); setTimeout(r, 1000); });
          await new Promise((r) => setTimeout(r, 500));
          const wortel = document.querySelector(".rpa-drukvellen");
          return {
            afdrukmodus: document.documentElement.classList.contains("rapportdruk"),
            tekens: wortel ? wortel.textContent.length : 0,
          };
        })()`, "het rapport klaarzetten");
        if (!stand.afdrukmodus || stand.tekens === 0) throw new Error("de vellen van het rapport kwamen niet klaar.");

        const { stream } = await p("Page.printToPDF", { preferCSSPageSize: true, printBackground: true, transferMode: "ReturnAsStream" });
        const delen = [];
        for (;;) {
          const { data, base64Encoded, eof } = await p("IO.read", { handle: stream, size: 1 << 20 });
          delen.push(Buffer.from(data, base64Encoded ? "base64" : "utf8"));
          if (eof) break;
        }
        await p("IO.close", { handle: stream });
        const pdf = Buffer.concat(delen);
        if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error("Chromium gaf geen PDF terug.");
        const aantal = (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
        return { pdf: new Uint8Array(pdf.buffer, pdf.byteOffset, pdf.length), paginas: aantal };
      } finally {
        cdp.luisteraars.delete(luister);
      }
    } finally {
      await cdp.stuur("Target.disposeBrowserContext", { browserContextId }).catch(() => {});
    }
  }

  return {
    chromium: pad,
    paginas,
    maak: (inhoud, naam) => {
      let klok;
      return Promise.race([
        maak(inhoud, naam),
        new Promise((_, nee) => {
          klok = setTimeout(() => {
            // Een Chromium die vastloopt: weg ermee, het volgende rapport start een nieuwe.
            browser?.stop();
            browser = null;
            nee(new Error(`het rapport was niet binnen ${tijdMs / 1000} s klaar.`));
          }, tijdMs);
        }),
      ]).finally(() => clearTimeout(klok));
    },
    stop() {
      browser?.stop();
      browser = null;
      pagina?.server.close();
      pagina = null;
    },
  };
}
