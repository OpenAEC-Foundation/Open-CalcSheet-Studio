/**
 * De proef van de werkplek van de OpenAEC SuperCloud (scripts/check-platformbouw.mjs).
 *
 * Bootst de werkplek na met een eigen server op een vrije poort (vanaf 3055):
 *
 *   /            een gastpagina met <iframe sandbox="allow-scripts allow-modals">
 *                en een nagebootste Docs (gast.js): bestanden met versies en
 *                instellingen, in het geheugen van de gastpagina;
 *   /app/…       de platformbundel, met de koppen van de werkplek: dezelfde sandbox
 *                als CSP-kop, alles alleen binnen de eigen bundel, geen inline
 *                script en geen eval, en CORS voor het opaque frame;
 *   /app/nep-brug.js
 *                vóór de app in index.html, zoals de brug van de SuperCloud: zet
 *                `window.openaecHost` neer (contract in docs/supercloud-werkplek.md)
 *                en praat met de gastpagina via postMessage.
 *
 * Daarna stuurt het een headless Chrome of Edge aan via het DevTools-protocol (de
 * ingebouwde WebSocket van Node) en kijkt het in alle frames en workers naar
 * fouten in de console, naar verzoeken buiten de bundel en naar wat de app via de
 * host opent en opslaat.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { extname, join, normalize, sep } from "node:path";

const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

const SOORTEN = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".cpd": "text/plain; charset=utf-8",
  ".geojson": "application/json",
};

/** De CSP van een app-document in de werkplek, voor de bundel op `eigen`. */
function cspApp(eigen) {
  return [
    "sandbox allow-scripts allow-modals",
    "default-src 'none'",
    `script-src ${eigen} 'wasm-unsafe-eval'`,
    `worker-src ${eigen} blob:`,
    `style-src ${eigen} 'unsafe-inline'`,
    `img-src ${eigen} data: blob:`,
    `font-src ${eigen} data:`,
    `media-src ${eigen} data: blob:`,
    `connect-src ${eigen}`,
    "form-action 'none'",
    "base-uri 'none'",
    "object-src 'none'",
  ].join("; ");
}

/** De gastpagina: alleen een frame en het script van de nagebootste Docs. */
const GASTPAGINA = `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"><title>Werkplekproef</title><link rel="icon" href="data:,">
<script src="/gast.js"></script>
<style>html,body{margin:0;height:100%}iframe{border:0;width:100%;height:100%}</style>
</head><body><iframe id="app" sandbox="allow-scripts allow-modals" src="/app/index.html"></iframe></body></html>`;

/**
 * De nagebootste Docs aan de kant van de gastpagina. Antwoordt alleen aan het eigen
 * frame. `window.__proef` houdt bij wat er gebeurde.
 */
const GAST_JS = `"use strict";
(function () {
  var docs = new Map();
  var instellingen = new Map();
  var volgende = 2;
  var proef = (window.__proef = { opgeslagen: [], geopend: [], instellingen: {}, fouten: [] });
  var klaar = fetch("/start.ifccalculation").then(function (r) { return r.arrayBuffer(); }).then(function (b) {
    docs.set("doc-1", { name: "Werkplekproef.ifccalculation", versies: [new Uint8Array(b)] });
  });
  function bestand(id) {
    var d = docs.get(String(id));
    if (!d) throw new Error("niet_gevonden: " + id);
    return d;
  }
  var behandel = {
    open: function (v) {
      var d = bestand(v.bestand);
      var n = v.versie ? Number(v.versie) : d.versies.length;
      proef.geopend.push({ id: v.bestand, versie: n });
      var bytes = d.versies[n - 1].slice();
      return { id: v.bestand, name: d.name, version: n, readOnly: n !== d.versies.length, bytes: bytes.buffer };
    },
    opslaan: function (v) {
      var bytes = new Uint8Array(v.bytes);
      var id = v.opties.id;
      if (id) bestand(id).versies.push(bytes);
      else {
        if (!/\\.ifccalculation$/i.test(String(v.opties.name || ""))) throw new Error("soort_niet_toegestaan");
        id = "doc-" + volgende++;
        docs.set(id, { name: String(v.opties.name), versies: [bytes] });
      }
      var d = bestand(id);
      proef.opgeslagen.push({ id: id, name: d.name, version: d.versies.length, nieuw: !v.opties.id, tekst: new TextDecoder().decode(bytes) });
      return { id: id, name: d.name, version: d.versies.length };
    },
    lijst: function () {
      return Array.from(docs, function (e) { return { id: e[0], name: e[1].name, modified: "2026-11-25T10:00:00Z" }; });
    },
    versies: function (v) {
      return bestand(v.bestand).versies.map(function (_, i) { return { version: i + 1, modified: "2026-11-25T10:00:00Z" }; }).reverse();
    },
    instelling: function (v) {
      if (v.waarde === undefined) return instellingen.has(v.sleutel) ? instellingen.get(v.sleutel) : null;
      instellingen.set(v.sleutel, v.waarde);
      proef.instellingen[v.sleutel] = v.waarde;
      return null;
    },
  };
  window.addEventListener("message", function (e) {
    var frame = document.getElementById("app");
    if (!frame || e.source !== frame.contentWindow) return;
    var v = e.data;
    if (!v || v.proef !== 1 || typeof v.id !== "number" || !behandel[v.soort]) return;
    klaar.then(function () { return behandel[v.soort](v); }).then(function (waarde) {
      frame.contentWindow.postMessage({ proef: 1, antwoord: v.id, ok: true, waarde: waarde }, "*");
    }, function (fout) {
      proef.fouten.push(String(fout && fout.message || fout));
      frame.contentWindow.postMessage({ proef: 1, antwoord: v.id, ok: false, fout: String(fout && fout.message || fout) }, "*");
    });
  });
})();
`;

/** De nagebootste brug in het frame: `window.openaecHost`, vóór de app. */
const NEP_BRUG_JS = `"use strict";
(function () {
  var teller = 0;
  var wachtend = {};
  window.addEventListener("message", function (e) {
    if (e.source !== window.parent) return;
    var v = e.data;
    if (!v || v.proef !== 1 || typeof v.antwoord !== "number" || !wachtend[v.antwoord]) return;
    var w = wachtend[v.antwoord];
    delete wachtend[v.antwoord];
    if (v.ok) w.ja(v.waarde);
    else w.nee(new Error(v.fout));
  });
  function vraag(soort, extra) {
    teller += 1;
    var id = teller;
    return new Promise(function (ja, nee) {
      wachtend[id] = { ja: ja, nee: nee };
      window.parent.postMessage(Object.assign({ proef: 1, id: id, soort: soort }, extra || {}), "*");
    });
  }
  window.openaecHost = {
    taal: "nl",
    thema: "light",
    initialFileId: "doc-1",
    open: function (id, versie) { return vraag("open", { bestand: String(id), versie: versie }); },
    save: function (bytes, opties) { return vraag("opslaan", { bytes: bytes, opties: opties || {} }); },
    list: function () { return vraag("lijst"); },
    versions: function (id) { return vraag("versies", { bestand: String(id) }); },
    settings: {
      get: function (sleutel) { return vraag("instelling", { sleutel: String(sleutel) }); },
      set: function (sleutel, waarde) { return vraag("instelling", { sleutel: String(sleutel), waarde: JSON.stringify(waarde === undefined ? null : waarde) }); },
      delete: function (sleutel) { return vraag("instelling", { sleutel: String(sleutel), waarde: "null" }); },
    },
  };
  window.dispatchEvent(new Event("openaec-host-ready"));
})();
`;

/** De server van de proef op de eerste vrije poort vanaf `vanaf`. */
export async function startProefServer(bundel, startbestand, vanaf = 3055) {
  const verzoeken = [];
  let eigen = "";
  const server = createServer((req, res) => {
    const pad = decodeURIComponent(new URL(req.url, "http://x").pathname);
    verzoeken.push(pad);
    const stuur = (status, soort, inhoud, koppen = {}) => {
      res.writeHead(status, { "Content-Type": soort, "Cache-Control": "no-store", ...koppen });
      res.end(inhoud);
    };
    if (pad === "/") return stuur(200, SOORTEN[".html"], GASTPAGINA);
    if (pad === "/gast.js") return stuur(200, SOORTEN[".js"], GAST_JS);
    if (pad === "/start.ifccalculation") return stuur(200, "application/octet-stream", startbestand);
    if (!pad.startsWith("/app/")) return stuur(404, "text/plain", "niet gevonden");
    const koppen = {
      "Content-Security-Policy": cspApp(eigen),
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    };
    const deel = pad.slice("/app/".length);
    if (deel === "nep-brug.js") return stuur(200, SOORTEN[".js"], NEP_BRUG_JS, koppen);
    const bestand = normalize(join(bundel, deel || "index.html"));
    if (!bestand.startsWith(normalize(bundel) + sep) || !existsSync(bestand) || !statSync(bestand).isFile()) {
      return stuur(404, "text/plain", "niet gevonden", koppen);
    }
    let inhoud = readFileSync(bestand);
    if (deel === "index.html") {
      // Zoals de werkplek: de brug als eerste script, vóór de app.
      inhoud = inhoud.toString("utf8").replace("<script", '<script src="./nep-brug.js"></script><script');
    }
    stuur(200, SOORTEN[extname(bestand)] ?? "application/octet-stream", inhoud, koppen);
  });
  for (let poort = vanaf; poort < vanaf + 50; poort++) {
    const gelukt = await new Promise((ja) => {
      server.once("error", () => ja(false));
      server.listen(poort, "127.0.0.1", () => ja(true));
    });
    if (gelukt) {
      eigen = `http://127.0.0.1:${poort}/app/`;
      return { poort, adres: `http://127.0.0.1:${poort}`, verzoeken, sluit: () => new Promise((r) => server.close(r)) };
    }
  }
  throw new Error(`geen vrije poort vanaf ${vanaf}`);
}

/** Minimale DevTools-client: commando's met antwoord, en luisteraars voor gebeurtenissen. */
class Cdp {
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
      for (const w of this.open.values()) w.nee(new Error("de verbinding met de browser is verbroken"));
      this.open.clear();
    });
  }

  static async verbind(url) {
    const ws = new WebSocket(url);
    await new Promise((ja, nee) => {
      ws.addEventListener("open", ja, { once: true });
      ws.addEventListener("error", () => nee(new Error(`geen verbinding met ${url}`)), { once: true });
    });
    return new Cdp(ws);
  }

  stuur(methode, params = {}, sessionId) {
    const id = ++this.volgende;
    this.ws.send(JSON.stringify(sessionId ? { id, method: methode, params, sessionId } : { id, method: methode, params }));
    return new Promise((ja, nee) => this.open.set(id, { ja, nee, methode }));
  }

  sluit() {
    try {
      this.ws.close();
    } catch {
      // al dicht
    }
  }
}

/** Start de browser met een eigen, tijdelijk profiel en een vrije debugpoort. */
async function startBrowser(pad, profiel) {
  const proc = spawn(pad, [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profiel}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1400,900",
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let stderr = "";
  proc.stderr.on("data", (d) => {
    stderr = (stderr + d).slice(-4000);
  });
  const bestand = join(profiel, "DevToolsActivePort");
  for (let i = 0; i < 150; i++) {
    if (proc.exitCode !== null) throw new Error(`de browser stopte meteen.\n${stderr}`);
    if (existsSync(bestand)) {
      const poort = Number(readFileSync(bestand, "utf8").split(/\r?\n/)[0]);
      if (poort > 0) return { proc, poort };
    }
    await wacht(100);
  }
  proc.kill();
  throw new Error(`de browser gaf binnen 15 s geen debugpoort.\n${stderr}`);
}

/**
 * De proef zelf. `meld(ok, tekst, detail)` telt de uitkomst. Geeft wat er gezien is
 * terug, voor het verslag.
 */
export async function draaiProef({ browser, bundel, startbestand, meld, log = console.log }) {
  const server = await startProefServer(bundel, startbestand);
  log(`  proefserver op ${server.adres}`);
  const profiel = mkdtempSync(join(tmpdir(), "werkplek-proef-"));
  let b = null;
  let cdp = null;
  const fouten = [];
  const buiten = [];
  const dialogen = [];
  const workers = [];
  const contexten = new Map();
  try {
    b = await startBrowser(browser, profiel);
    const versie = await (await fetch(`http://127.0.0.1:${b.poort}/json/version`)).json();
    cdp = await Cdp.verbind(versie.webSocketDebuggerUrl);
    log(`  ${versie.Browser}`);

    // Antwoorden op dialogen: een vraag naar een naam of een nummer, en een melding.
    let antwoord = null;
    const zetAan = async (sessionId, soort) => {
      const s = (m, p) => cdp.stuur(m, p, sessionId).catch(() => {});
      await s("Runtime.enable");
      await s("Log.enable");
      await s("Network.enable");
      if (soort !== "worker") {
        await s("Page.enable");
        await s("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
      }
      await s("Runtime.runIfWaitingForDebugger");
    };
    cdp.luisteraars.add((m) => {
      const p = m.params ?? {};
      if (m.method === "Target.attachedToTarget") {
        if (p.targetInfo.type === "worker") workers.push(p.targetInfo.url);
        void zetAan(p.sessionId, p.targetInfo.type);
      } else if (m.method === "Runtime.exceptionThrown") {
        fouten.push(`uitzondering: ${p.exceptionDetails.exception?.description ?? p.exceptionDetails.text}`);
      } else if (m.method === "Runtime.consoleAPICalled" && (p.type === "error" || p.type === "assert")) {
        fouten.push(`console.error: ${p.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
      } else if (m.method === "Log.entryAdded" && p.entry.level === "error") {
        fouten.push(`${p.entry.source}: ${p.entry.text}${p.entry.url ? ` (${p.entry.url})` : ""}`);
      } else if (m.method === "Network.requestWillBeSent") {
        const url = p.request.url;
        if (!url.startsWith(`${server.adres}/`) && !/^(blob|data):/.test(url)) buiten.push(url);
      } else if (m.method === "Runtime.executionContextCreated") {
        const c = p.context;
        if (c.auxData?.isDefault && c.auxData?.frameId) contexten.set(`${m.sessionId}|${c.auxData.frameId}`, { sessionId: m.sessionId, id: c.id, frameId: c.auxData.frameId });
      } else if (m.method === "Runtime.executionContextDestroyed") {
        for (const [k, c] of contexten) if (c.sessionId === m.sessionId && c.id === p.executionContextId) contexten.delete(k);
      } else if (m.method === "Page.javascriptDialogOpening") {
        dialogen.push({ soort: p.type, tekst: p.message });
        const tekst = p.type === "prompt" ? (antwoord ?? p.defaultPrompt ?? "") : undefined;
        void cdp.stuur("Page.handleJavaScriptDialog", { accept: true, ...(tekst !== undefined ? { promptText: tekst } : {}) }, m.sessionId).catch(() => {});
      }
    });

    const { targetId } = await cdp.stuur("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.stuur("Target.attachToTarget", { targetId, flatten: true });
    await zetAan(sessionId, "page");
    const hoofd = (m, p) => cdp.stuur(m, p, sessionId);
    await hoofd("Page.navigate", { url: `${server.adres}/` });

    const evalueer = async (c, expressie) => {
      const r = await cdp.stuur("Runtime.evaluate", { expression: expressie, contextId: c.id, awaitPromise: true, returnByValue: true }, c.sessionId);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    };
    const gast = async (expressie) => {
      const r = await hoofd("Runtime.evaluate", { expression: expressie, awaitPromise: true, returnByValue: true });
      return r.result.value;
    };
    // Het frame van de app: de context die niet de gastpagina zelf is.
    const frame = async () => {
      for (const c of contexten.values()) {
        if (c.frameId === targetId) continue;
        try {
          if ((await evalueer(c, "location.pathname")) === "/app/index.html") return c;
        } catch {
          // context weg
        }
      }
      return null;
    };
    const wachtTot = async (expressie, ms, wat) => {
      const tot = Date.now() + ms;
      while (Date.now() < tot) {
        const c = await frame();
        if (c) {
          try {
            const w = await evalueer(c, expressie);
            if (w) return w;
          } catch {
            // nog niet
          }
        }
        await wacht(200);
      }
      throw new Error(`${wat} bleef na ${ms / 1000} s uit`);
    };
    const inFrame = async (expressie) => evalueer(await frame(), expressie);
    const tool = (naam, args = {}) => inFrame(`window.__OPDS_APP__.run(${JSON.stringify(naam)}, ${JSON.stringify(args)}).then((d) => JSON.stringify(d))`).then((t) => JSON.parse(t));
    const toets = (key, shift = false) => inFrame(`window.dispatchEvent(new KeyboardEvent("keydown", { key: ${JSON.stringify(key)}, ctrlKey: true, shiftKey: ${shift}, bubbles: true })), true`);
    const opgeslagen = () => gast("JSON.stringify(window.__proef.opgeslagen.map((o) => ({ id: o.id, name: o.name, version: o.version, nieuw: o.nieuw, naam: (o.tekst.match(/\"Werkplekproef[^\"]*\"/) || [''])[0] })))").then((t) => JSON.parse(t));

    // 1. De start.
    await wachtTot("document.getElementById('root')?.childElementCount > 0", 60000, "de app in het frame");
    meld(true, "de app start in een frame met sandbox=\"allow-scripts allow-modals\"");
    meld((await inFrame("window.origin")) === "null", "het frame heeft een opaque origin (window.origin is \"null\")");
    await wachtTot("!!window.__OPDS_APP__", 20000, "window.__OPDS_APP__");
    const stand = await wachtTot(
      "window.__OPDS_APP__.run('calcsheet_project_get').then((d) => d.projectName === 'Werkplekproef' ? JSON.stringify(d) : '')",
      30000,
      "het startbestand uit Docs",
    );
    const project = JSON.parse(stand);
    meld(project.projectName === "Werkplekproef", "het startbestand (initialFileId) is geopend via openaecHost.open", project.projectName);
    meld((await inFrame("document.documentElement.lang")) === "nl", "de taal komt van de host (openaecHost.taal)");
    const definities = await inFrame("window.__OPDS_APP__.definitions().then((d) => d.length)");
    meld(definities > 0, `window.__OPDS_APP__.definitions(): ${definities} tools`);
    // Het eerste blad wordt doorgerekend; dat gaat in de app via een worker.
    await wacht(3000);

    // 2. Opslaan: een nieuwe versie van het geopende bestand.
    await tool("calcsheet_project_set_name", { name: "Werkplekproef 2" });
    await toets("s");
    await wachtTotGast(gast, "window.__proef.opgeslagen.length >= 1", 15000, "Opslaan");
    let o = await opgeslagen();
    meld(o[0]?.id === "doc-1" && !o[0].nieuw && o[0].version === 2 && o[0].naam === '"Werkplekproef 2"',
      "Ctrl+S slaat een nieuwe versie op in Docs (save met id)", JSON.stringify(o[0]));

    // 3. Opslaan als: een nieuw bestand naast het geopende; daarna is dat het geopende.
    antwoord = "Proefkopie";
    await toets("s", true);
    await wachtTotGast(gast, "window.__proef.opgeslagen.length >= 2", 15000, "Opslaan als");
    o = await opgeslagen();
    meld(o[1]?.nieuw && o[1].name === "Proefkopie.ifccalculation", "Ctrl+Shift+S maakt een nieuw bestand in Docs (save met name)", JSON.stringify(o[1]));
    await tool("calcsheet_project_set_name", { name: "Werkplekproef 3" });
    await toets("s");
    await wachtTotGast(gast, "window.__proef.opgeslagen.length >= 3", 15000, "Opslaan na Opslaan als");
    o = await opgeslagen();
    meld(o[2]?.id === o[1]?.id && o[2].version === 2 && o[2].naam === '"Werkplekproef 3"', "daarna gaat Ctrl+S naar het nieuwe bestand", JSON.stringify(o[2]));

    // 4. Openen: kiezen uit de lijst van de host (list) en openen (open).
    antwoord = "1";
    await toets("o");
    const geopend = await wachtTot(
      "window.__OPDS_APP__.run('calcsheet_project_get').then((d) => d.projectName === 'Werkplekproef 2' ? d.projectName : '')",
      15000,
      "Openen uit Docs",
    );
    meld(geopend === "Werkplekproef 2", "Ctrl+O kiest uit openaecHost.list() en opent met openaecHost.open()");
    meld(dialogen.some((d) => d.soort === "prompt" && d.tekst.includes("Proefkopie.ifccalculation")), "de keuzelijst noemt de bestanden in Docs");

    // 5. Instellingen via de host, geen browseropslag.
    const instellingen = JSON.parse(await gast("JSON.stringify(Object.keys(window.__proef.instellingen))"));
    meld(instellingen.length > 0, `instellingen gaan via openaecHost.settings (${instellingen.join(", ")})`);
    const prive = instellingen.filter((k) => ["projectState", "recentFiles", "mcpToken"].includes(k));
    meld(prive.length === 0, "het open project, de recente bestanden en de MCP-sleutel blijven in het geheugen", prive.join(", "));
    const hostFouten = JSON.parse(await gast("JSON.stringify(window.__proef.fouten)"));
    meld(hostFouten.length === 0, "de host kreeg geen ongeldige verzoeken", hostFouten.join("; "));

    // 6. Wat er verder gebeurde.
    meld(workers.length > 0, `workers gestart in het opaque frame: ${workers.length}`);
    meld(buiten.length === 0, "geen verzoeken buiten de bundel", [...new Set(buiten)].join(", "));
    const meldingen = dialogen.filter((d) => d.soort === "alert");
    meld(meldingen.length === 0, "geen meldingen van een fout", meldingen.map((d) => d.tekst).join("; "));
    meld(fouten.length === 0, "geen fouten in de console (frame, gastpagina en workers)", [...new Set(fouten)].slice(0, 10).join("\n      "));

    // 7. Tegenproef: de afscherming geldt echt, en een fout in het frame wordt gezien.
    meld(await inFrame("(() => { try { return !window.localStorage; } catch { return true; } })()"), "tegenproef: localStorage is er in het frame niet");
    const voor = fouten.length;
    const geweigerd = await inFrame(`new Promise((klaar) => {
      document.addEventListener("securitypolicyviolation", (e) => klaar(e.violatedDirective), { once: true });
      const s = document.createElement("script");
      s.textContent = "window.__inlineProef = 1;";
      document.head.append(s);
      setTimeout(() => klaar(window.__inlineProef === 1 ? "uitgevoerd" : "geen melding"), 2000);
    })`);
    meld(/^script-src/.test(geweigerd), "tegenproef: de CSP weigert een inline script in het frame", geweigerd);
    await wacht(500);
    meld(fouten.length > voor, "tegenproef: die weigering komt als fout uit de console van het frame binnen");
    return { fouten, buiten, workers, dialogen, opgeslagen: o, verzoeken: server.verzoeken.length };
  } finally {
    cdp?.sluit();
    b?.proc.kill();
    await server.sluit();
    await wacht(300);
    rmSync(profiel, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

async function wachtTotGast(gast, expressie, ms, wat) {
  const tot = Date.now() + ms;
  while (Date.now() < tot) {
    if (await gast(expressie)) return;
    await wacht(200);
  }
  throw new Error(`${wat} bleef na ${ms / 1000} s uit`);
}
