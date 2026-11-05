/**
 * Het constructierapport als html, zonder browser en zonder dev-server.
 *
 * Bundelt de echte afdruk (components/rapport/afdruk/RapportAfdruk.tsx) met esbuild en
 * tekent die met react-dom in jsdom. Zo doorzoekt een controle precies wat de app op
 * de vellen zet. Geen react-dom/server: zustand geeft daar de beginstand van de store,
 * niet de stand van het project. Wat alleen een browser kan (meten, PDF-pagina's
 * tekenen, een 3D-blok) gebeurt hier niet; dat doet scripts/check-rapport-pdf.mjs.
 *
 * Wat vite regelt en esbuild niet kent, staat hier met de hand: `?raw` en `?url`,
 * import.meta.glob, import.meta.env en __LIBRARY_DEV__.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const hier = dirname(fileURLToPath(import.meta.url));
const WORTEL = join(hier, "../..");
const SRC = join(WORTEL, "packages/desktop/src");

/** Wat vite met een achtervoegsel regelt: `?raw` is de tekst van het bestand, `?url` hier een lege tekst. */
const viteAchtervoegsels = {
  name: "vite-achtervoegsels",
  setup(b) {
    b.onResolve({ filter: /\?(raw|url)$/ }, (a) => {
      const [pad, soort] = a.path.split("?");
      return { path: resolve(a.resolveDir, pad), namespace: `vite-${soort}` };
    });
    b.onLoad({ filter: /.*/, namespace: "vite-raw" }, (a) => ({
      contents: `export default ${JSON.stringify(leesOfLeeg(a.path))};`,
      loader: "js",
    }));
    b.onLoad({ filter: /.*/, namespace: "vite-url" }, () => ({ contents: 'export default "";', loader: "js" }));
    // import.meta.glob bestaat alleen in vite; de beelden van de modules staan niet op papier.
    b.onLoad({ filter: /ModuleAfbeelding\.tsx$/ }, (a) => ({
      contents: readFileSync(a.path, "utf8").replace(/import\.meta\.glob\([\s\S]*?\)\s*(as [^;]+)?;/, "({});"),
      loader: "tsx",
    }));
  },
};

function leesOfLeeg(pad) {
  try {
    return readFileSync(pad, "utf8");
  } catch {
    return "";
  }
}

const INGANG = `
  import { createElement } from "react";
  import { flushSync } from "react-dom";
  import { createRoot } from "react-dom/client";
  import i18next from "./i18n/config";
  import RapportAfdruk from "./components/rapport/afdruk/RapportAfdruk";
  import RapportPanel from "./components/rapport/RapportPanel";
  import { useProjectStore } from "./store/projectStore";
  import { useBureauStore } from "./store/bureauProfiel";
  import { useTemplateStore } from "./store/rapportTemplates";
  import { useModuleKiezer } from "./store/moduleKiezer";
  import { useEditorViewStore } from "./store/editorViewStore";
  import Editor from "./components/calc/Editor";
  import VersieSectie from "./components/calc/VersieSectie";
  import VersiesPaneel from "./components/calc/VersiesPaneel";
  import { maakNieuweVersie, meldVersieProblemen, wisselNaarVersie } from "./store/versieActies";
  import { registreerBewaarder } from "./store/spreadsheetBlad";

  export { i18next, useProjectStore, useBureauStore, useTemplateStore, useModuleKiezer, flushSync };
  export { maakNieuweVersie, meldVersieProblemen, registreerBewaarder, wisselNaarVersie };

  /** Een onderdeel van de versies in het document, om in te klikken. */
  const ONDERDELEN = { VersieSectie, VersiesPaneel };
  export function tekenOnderdeel(naam) {
    const plek = document.createElement("div");
    document.body.appendChild(plek);
    const wortel = createRoot(plek);
    flushSync(() => wortel.render(createElement(ONDERDELEN[naam])));
    return { plek, weg: () => { wortel.unmount(); plek.remove(); } };
  }

  /** De echte tab Code: wat erin staat, en typen of weghalen aan het eind van een regel. */
  export function tekenEditor() {
    const plek = document.createElement("div");
    document.body.append(plek);
    const wortel = createRoot(plek);
    flushSync(() => wortel.render(createElement(Editor)));
    const view = () => useEditorViewStore.getState().view;
    return {
      tekst: () => view().state.doc.toString(),
      typ: (regel, tekst) => view().dispatch({ changes: { from: view().state.doc.line(regel + 1).to, insert: tekst }, userEvent: "input" }),
      haalWeg: (regel, n) => {
        const { to } = view().state.doc.line(regel + 1);
        view().dispatch({ changes: { from: to - n, to }, userEvent: "delete" });
      },
      sluit: () => {
        wortel.unmount();
        plek.remove();
      },
    };
  }

  export function teken() {
    const plek = document.createElement("div");
    const wortel = createRoot(plek);
    flushSync(() => wortel.render(createElement(RapportAfdruk)));
    const html = plek.innerHTML;
    wortel.unmount();
    return html;
  }

  /** Het rapportpaneel in het document, om in te klikken. Geeft de plek en wat hem weer weghaalt. */
  export function tekenPaneel() {
    const plek = document.createElement("div");
    document.body.appendChild(plek);
    const wortel = createRoot(plek);
    flushSync(() => wortel.render(createElement(RapportPanel)));
    return { plek, weg: () => { wortel.unmount(); plek.remove(); } };
  }
`;

/**
 * De bundel, geladen in jsdom. Geeft `teken()` (de html van het rapport dat in de store
 * staat), de store en i18next.
 */
export async function laadRapportAfdruk() {
  const map = mkdtempSync(join(tmpdir(), "rapport-html-"));
  const uit = join(map, "rapport.mjs");
  try {
    await build({
      stdin: { contents: INGANG, resolveDir: SRC, loader: "tsx" },
      bundle: true,
      outfile: uit,
      format: "esm",
      platform: "node",
      mainFields: ["module", "main"],
      conditions: ["browser", "import", "default"],
      jsx: "automatic",
      logLevel: "error",
      plugins: [viteAchtervoegsels],
      loader: {
        ".css": "empty", ".png": "dataurl", ".svg": "text", ".webp": "dataurl", ".woff": "empty", ".woff2": "empty", ".ttf": "empty",
        ".wasm": "empty", ".geojson": "text",
      },
      define: {
        __LIBRARY_DEV__: '""',
        "import.meta.env.DEV": "false",
        "import.meta.env.BASE_URL": '"/"',
      },
      banner: { js: "import { createRequire as __maakRequire } from 'node:module'; const require = __maakRequire(import.meta.url);" },
    });
    const { window } = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
    for (const naam of ["window", "document", "navigator", "localStorage", "HTMLElement", "Element", "Node", "getComputedStyle", "DOMParser", "CustomEvent", "Event", "requestAnimationFrame", "cancelAnimationFrame", "matchMedia", "MutationObserver", "Range", "DOMRect", "getSelection", "Text"]) {
      Object.defineProperty(globalThis, naam, { value: window[naam], configurable: true, writable: true });
    }
    window.matchMedia = window.matchMedia ?? (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    globalThis.matchMedia = window.matchMedia;
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    // jsdom meet niets; de editor wil wel kunnen vragen.
    window.Range.prototype.getClientRects = () => [];
    window.Range.prototype.getBoundingClientRect = () => ({ left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 });
    window.HTMLElement.prototype.getClientRects = () => [];
    const module = await import(pathToFileURL(uit).href);
    // De app zet bij het opstarten de bewaarde taal en stand terug; dat moet eerst klaar zijn.
    await new Promise((klaar) => setTimeout(klaar, 200));
    return module;
  } finally {
    // Node houdt de geladen module in het geheugen; het bestand kan weg.
    rmSync(map, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

/**
 * Html om te vergelijken: elk blok op een eigen regel, zodat een verschil te lezen is, en
 * van een formule alleen de bron. De opmaak van KaTeX hoort niet bij het rapport en
 * verandert met zijn versie.
 */
export function perRegel(html) {
  const plek = document.createElement("div");
  plek.innerHTML = html;
  for (const f of plek.querySelectorAll(".katex")) {
    const bron = f.querySelector("annotation")?.textContent ?? f.textContent;
    f.replaceWith(document.createTextNode(`$${bron}$`));
  }
  return plek.innerHTML.replace(/<(div|section|h[1-6]|p|header|table|tr)\b/g, "\n<$1").trim();
}

/** De zichtbare tekst van een stuk html, regel voor regel: wat er op papier staat. */
export function zichtbareRegels(html) {
  const plek = document.createElement("div");
  plek.innerHTML = html;
  for (const weg of plek.querySelectorAll(".katex-mathml, annotation, style, script")) weg.remove();
  const uit = [];
  const loop = (el) => {
    for (const k of el.childNodes) {
      if (k.nodeType === 3) uit.push(k.textContent);
      else if (k.nodeType === 1) {
        loop(k);
        if (/^(DIV|SECTION|H[1-6]|P|LI|TR|TD|TH|SPAN)$/.test(k.tagName)) uit.push("\n");
      }
    }
  };
  loop(plek);
  return uit.join("").split("\n").map((r) => r.trim()).filter((r) => /\p{L}{2}/u.test(r));
}
