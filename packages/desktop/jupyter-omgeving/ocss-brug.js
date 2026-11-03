/*
 * De brug tussen de app en de Jupyter-omgeving. Komt met een script-tag in
 * lab/index.html (scripts/bouw-jupyter-omgeving.mjs) en draait dus in de iframe
 * van een Jupyter-blad, niet in de app.
 *
 * De bestanden staan in het geheugen van de omgeving (jupyter-lite.json): het
 * projectbestand is de enige bewaarplek. De app stuurt ze hierheen en vraagt de
 * laatste stand terug; zie components/calc/JupyterVenster.tsx.
 *
 * Van de app:     laad { bestanden, open }, vraagStand { id }, thema { donker }
 * Naar de app:    gereed, geladen, stand { id, bestanden }, gewijzigd, opslaan, fout { melding }
 *
 * Code in deze pagina kan dezelfde berichten sturen. De app behandelt ze daarom als
 * invoer van buiten: ze raken alleen de werkmap van dit blad.
 */
(function () {
  "use strict";

  const BRON = "ocss-jupyter";
  const THEMA = { licht: "JupyterLab Light", donker: "JupyterLab Dark" };
  /** Bestanden die als tekst in de omgeving horen, om ze in de editor te kunnen openen. */
  const TEKST = /\.(py|pyi|txt|md|markdown|csv|tsv|json|ya?ml|toml|ini|cfg|html?|css|js|ts|tex|xml|svg|rst|log|dat)$/i;

  /**
   * Python onthoudt per map welke bestanden erin staan en kijkt pas opnieuw als de
   * wijzigingstijd van de map verandert. Die is op /drive altijd 0, dus een script dat
   * er na de eerste import bijkomt, bleef onvindbaar (ModuleNotFoundError). Deze
   * terugval komt pas aan de beurt als een import mislukt, en zoekt dan nog één keer.
   */
  const ZOEK_OPNIEUW = `def _ocss_zoek_opnieuw():
    import importlib, importlib.machinery, sys
    class ZoekOpnieuw:
        @staticmethod
        def find_spec(naam, pad=None, doel=None):
            importlib.invalidate_caches()
            return importlib.machinery.PathFinder.find_spec(naam, pad, doel)
    if not any(getattr(f, "__name__", "") == "ZoekOpnieuw" for f in sys.meta_path):
        sys.meta_path.append(ZoekOpnieuw)
_ocss_zoek_opnieuw()
del _ocss_zoek_opnieuw`;

  let app = null;
  let bezig = false;
  let appHerkomst = "*";
  const gevolgd = new WeakSet();

  /** Zet de terugval in elke kernel van een notebook, ook na herstarten. */
  function volgKernel(widget) {
    const sessie = widget?.sessionContext;
    if (!sessie || gevolgd.has(sessie)) return;
    gevolgd.add(sessie);
    const zet = () => {
      const kernel = sessie.session?.kernel;
      if (kernel) kernel.requestExecute({ code: ZOEK_OPNIEUW, silent: true, store_history: false }, true).done.catch(() => {});
    };
    sessie.kernelChanged.connect(zet);
    sessie.statusChanged.connect((_, status) => {
      if (status === "restarting" || status === "autorestarting") zet();
    });
    sessie.ready.then(zet, () => {});
  }

  function stuur(bericht) {
    window.top.postMessage({ bron: BRON, ...bericht }, appHerkomst);
  }

  function naarBase64(bytes) {
    let uit = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      uit += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(uit);
  }

  function uitBase64(tekst) {
    const los = atob(tekst.replace(/\s+/g, ""));
    const bytes = new Uint8Array(los.length);
    for (let i = 0; i < los.length; i++) bytes[i] = los.charCodeAt(i);
    return bytes;
  }

  function naam(pad) {
    return pad.split("/").pop();
  }

  async function schrijf(contents, { pad, bytes }) {
    if (pad.endsWith("/")) {
      const map = pad.slice(0, -1);
      await contents.save(map, { type: "directory", name: naam(map), path: map });
      return;
    }
    const basis = { name: naam(pad), path: pad };
    if (/\.ipynb$/i.test(pad)) {
      try {
        const content = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        await contents.save(pad, { ...basis, type: "notebook", format: "json", content });
        return;
      } catch (err) {
        // Geen geldig notebook: als gewoon bestand bewaren, dan gaat er niets verloren.
        console.warn(`${pad} is geen geldig notebook:`, err);
      }
    }
    if (TEKST.test(pad)) {
      try {
        const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        await contents.save(pad, { ...basis, type: "file", format: "text", content });
        return;
      } catch {
        // Geen UTF-8: dan binair.
      }
    }
    await contents.save(pad, { ...basis, type: "file", format: "base64", content: naarBase64(bytes) });
  }

  /** Alle mappen die in de lijst nodig zijn, van buiten naar binnen. */
  function mappenVan(bestanden) {
    const mappen = new Set();
    for (const { pad } of bestanden) {
      const delen = pad.split("/");
      for (let i = 1; i < delen.length; i++) mappen.add(`${delen.slice(0, i).join("/")}/`);
    }
    return [...mappen].sort((a, b) => a.length - b.length);
  }

  async function laad({ bestanden, open }) {
    bezig = true;
    try {
      const contents = app.serviceManager.contents;
      for (const pad of mappenVan(bestanden)) await schrijf(contents, { pad, bytes: new Uint8Array() });
      for (const bestand of bestanden) {
        if (!bestand.pad.endsWith("/")) await schrijf(contents, bestand);
      }
      // De app opent een notebook pas als de bestanden er staan; de kernel start dan
      // wel, maar geen enkele cel draait uit zichzelf.
      if (open) await app.commands.execute("docmanager:open", { path: open, factory: "Notebook" });
    } finally {
      bezig = false;
    }
    stuur({ soort: "geladen" });
  }

  async function lijst(contents, pad, uit) {
    const map = await contents.get(pad, { content: true });
    for (const item of map.content) {
      if (item.type === "directory") {
        uit.push({ pad: `${item.path}/`, bytes: new Uint8Array() });
        await lijst(contents, item.path, uit);
      } else {
        const m = await contents.get(item.path, { content: true });
        const inhoud = m.content;
        let bytes;
        if (m.format === "base64") bytes = uitBase64(inhoud);
        else if (m.format === "json" || typeof inhoud !== "string") {
          bytes = new TextEncoder().encode(`${JSON.stringify(inhoud, null, 1)}\n`);
        } else bytes = new TextEncoder().encode(inhoud);
        uit.push({ pad: item.path, bytes });
      }
    }
    return uit;
  }

  /** Bewaart de open documenten en geeft alles terug, ook de uitvoer van de cellen. */
  async function stand({ id }) {
    const contents = app.serviceManager.contents;
    await app.commands.execute("docmanager:save-all");
    const bestanden = await lijst(contents, "", []);
    window.top.postMessage({ bron: BRON, soort: "stand", id, bestanden }, appHerkomst);
  }

  async function zetThema({ donker }) {
    const thema = donker ? THEMA.donker : THEMA.licht;
    if (app.commands.hasCommand("apputils:change-theme")) {
      await app.commands.execute("apputils:change-theme", { theme: thema });
    }
  }

  window.addEventListener("message", (e) => {
    const b = e.data;
    if (e.source !== window.top || !b || b.bron !== BRON || !app) return;
    appHerkomst = e.origin;
    const klus = b.soort === "laad" ? laad(b) : b.soort === "vraagStand" ? stand(b) : b.soort === "thema" ? zetThema(b) : null;
    klus?.catch((err) => {
      console.error("Jupyter-brug:", err);
      stuur({ soort: "fout", id: b.id, melding: String(err?.message ?? err) });
    });
  });

  // Ctrl+S bewaart ook het project, zoals overal in de app.
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") stuur({ soort: "opslaan" });
  }, true);

  async function start() {
    while (!window.jupyterapp) await new Promise((klaar) => setTimeout(klaar, 50));
    const lab = window.jupyterapp;
    await lab.started;
    await lab.restored;
    app = lab;
    lab.serviceManager.contents.fileChanged.connect(() => {
      if (!bezig) stuur({ soort: "gewijzigd" });
    });
    lab.shell.currentChanged.connect((_, { newValue }) => volgKernel(newValue));
    volgKernel(lab.shell.currentWidget);
    stuur({ soort: "gereed" });
  }

  start().catch((err) => {
    console.error("Jupyter-brug:", err);
    stuur({ soort: "fout", melding: String(err?.message ?? err) });
  });
})();
