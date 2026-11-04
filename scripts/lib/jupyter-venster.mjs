/**
 * Stuurt de echte Tauri-app aan via het protocol voor ontwikkelaarsgereedschap van
 * WebView2. Alleen voor de handmatige proef `scripts/proef-jupyter-venster.mjs`; de
 * gewone controles draaien zonder venster.
 *
 * De app start met een eigen opslagmap en een eigen poort, zodat een draaiende app van
 * de gebruiker er niets van merkt.
 */
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";

const wacht = (ms) => new Promise((klaar) => setTimeout(klaar, ms));

export async function startApp({ exe, map, poort = 9377, argumenten = [] }) {
  mkdirSync(map, { recursive: true });
  const proces = spawn(exe, argumenten, {
    stdio: "ignore",
    env: {
      ...process.env,
      WEBVIEW2_USER_DATA_FOLDER: map,
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${poort}`,
    },
  });
  let doel = null;
  for (let i = 0; i < 120 && !doel; i++) {
    await wacht(500);
    try {
      const lijst = await (await fetch(`http://127.0.0.1:${poort}/json`)).json();
      doel = lijst.find((t) => t.type === "page" && !t.url.startsWith("devtools"));
    } catch {
      // Het venster is er nog niet.
    }
  }
  if (!doel) {
    proces.kill();
    throw new Error("Het venster verscheen niet.");
  }
  const sessie = await Verbinding.open(doel.webSocketDebuggerUrl);
  await sessie.stuur("Page.enable");
  await sessie.stuur("Runtime.enable");
  await sessie.stuur("Emulation.setFocusEmulationEnabled", { enabled: true });
  await sessie.stuur("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
  return { proces, sessie, stop: () => proces.kill() };
}

/**
 * Is het notebook klaar voor een opdracht? De kernel moet klaar zijn en het notebook het
 * actieve tabblad. JupyterLab kiest dat tabblad op focus, en die heeft een iframe niet
 * vanzelf: gemeten bij een derde van de starts, met een kernel die gewoon klaar stond.
 * Een gebruiker klikt in het notebook; de proef maakt het hier actief.
 */
export const NOTEBOOK_KLAAR = `(() => {
  const shell = window.jupyterapp?.shell;
  const w = shell && [...shell.widgets("main")].find((x) => x.sessionContext);
  if (w?.sessionContext.session?.kernel?.status !== "idle") return 0;
  if (shell.currentWidget !== w) shell.activateById(w.id);
  return shell.currentWidget === w ? 1 : 0;
})()`;

/** Eén WebSocket met sessies per iframe (`flatten`). */
class Verbinding {
  static open(url) {
    return new Promise((klaar, mis) => {
      const ws = new WebSocket(url);
      ws.onopen = () => klaar(new Verbinding(ws));
      ws.onerror = (e) => mis(new Error(`WebSocket: ${e.message ?? e.type}`));
    });
  }

  constructor(ws) {
    this.ws = ws;
    this.teller = 0;
    this.open = new Map();
    /** sessionId → { url, type } van de iframes die de browser apart draait. */
    this.frames = new Map();
    this.gebeurtenissen = [];
    ws.onclose = () => {
      for (const { mis } of this.open.values()) mis(new Error("Het venster is weg."));
      this.open.clear();
      this.dicht = true;
    };
    ws.onmessage = (e) => {
      const b = JSON.parse(e.data);
      if (b.id && this.open.has(b.id)) {
        const { klaar, mis } = this.open.get(b.id);
        this.open.delete(b.id);
        if (b.error) mis(new Error(`${b.error.message} ${b.error.data ?? ""}`));
        else klaar(b.result);
        return;
      }
      if (b.method === "Target.attachedToTarget") {
        this.frames.set(b.params.sessionId, b.params.targetInfo);
        this.stuur("Runtime.enable", {}, b.params.sessionId).catch(() => {});
        this.stuur("Network.enable", {}, b.params.sessionId).catch(() => {});
        // JupyterLab kiest zijn actieve tabblad op focus, en een proefvenster staat vaak op
        // de achtergrond. Zonder dit doet Alles uitvoeren dan niets.
        this.stuur("Emulation.setFocusEmulationEnabled", { enabled: true }, b.params.sessionId).catch(() => {});
        this.stuur("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }, b.params.sessionId).catch(() => {});
      } else if (b.method === "Target.detachedFromTarget") {
        this.frames.delete(b.params.sessionId);
      } else if (b.method === "Target.targetInfoChanged") {
        for (const [s, info] of this.frames) if (info.targetId === b.params.targetInfo.targetId) this.frames.set(s, b.params.targetInfo);
      }
      this.gebeurtenissen.push(b);
      if (this.gebeurtenissen.length > 5000) this.gebeurtenissen.shift();
    };
  }

  stuur(method, params = {}, sessionId) {
    const id = ++this.teller;
    return new Promise((klaar, mis) => {
      if (this.dicht) throw new Error("Het venster is weg.");
      this.open.set(id, { klaar, mis });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  /** Voert uit in een sessie (of het hoofdvenster); een belofte wordt afgewacht. */
  async voerUit(expression, sessionId) {
    const r = await this.stuur("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sessionId);
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  }

  /** De sessie van het eerste frame waarvan de URL aan `test` voldoet. */
  sessieVan(test) {
    for (const [s, info] of this.frames) if (test(info.url ?? "")) return s;
    return null;
  }

  async wachtOp(fn, { ms = 180000, stap = 500, tekst = "voorwaarde" } = {}) {
    const eind = Date.now() + ms;
    let laatste;
    while (Date.now() < eind) {
      if (this.dicht) throw new Error("Het venster is weg.");
      try {
        laatste = await fn();
        if (laatste) return laatste;
      } catch (err) {
        laatste = err;
      }
      await wacht(stap);
    }
    throw new Error(`Wachten op ${tekst} duurde te lang (${laatste?.message ?? laatste}).`);
  }

  /** Een schermafbeelding van het hoofdvenster, als bytes. */
  async foto() {
    const r = await this.stuur("Page.captureScreenshot", { format: "png" });
    return Buffer.from(r.data, "base64");
  }
}
