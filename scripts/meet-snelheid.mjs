/**
 * Meet hoe snel de gebouwde app is: de bundels, het opstarten en de gewone
 * handelingen. Geen controle (geen check-*): de tijden hangen af van de machine en
 * zijn alleen te vergelijken met een meting op dezelfde machine.
 *
 * Het script serveert een gebouwde dist met `vite preview` op een vrije poort en
 * bedient die in een headless Chrome of Edge via het DevTools-protocol, met de
 * ingebouwde WebSocket van Node. Het gebruikt de echte knoppen, want in een
 * productiebouw is er geen `window.__ocs`. Elke ronde begint met een eigen, leeg
 * profiel en zonder browsercache, zoals een eerste start.
 *
 *   Bundels       eerste lading (wat index.html meteen laadt) en totaal, ruw en met gzip
 *   Opstarten     tot de schil er staat, en tot de hoofddraad daarna tot rust komt
 *   Kiezer        Module toevoegen openen
 *   Invoegen      een module invoegen, tot de uitwerking er staat
 *   Toets         een waarde in het beeld wijzigen, tot het venster dat laat zien
 *   Doorrekenen   hetzelfde, tot de nieuwe uitwerking er staat
 *   Wisselen      naar een ander blad dat al is doorgerekend
 *   Voorbeeld     het afdrukvoorbeeld van het blad, tot de vellen klaar zijn
 *
 * Draaien:  npm run build --workspace=@openaec/calcsheet-studio
 *           node scripts/meet-snelheid.mjs [--dist map] [--keer 5] [--uit meting.json] [--rem 4] [--profiel map]
 *
 *   --dist  de gebouwde map; standaard packages/desktop/dist
 *   --keer  aantal rondes; standaard 5. De tabel toont de mediaan.
 *   --uit   schrijft de ruwe uitkomsten als JSON
 *   --rem   vertraagt de processor van de pagina met deze factor
 *   --profiel  schrijft per handeling een .cpuprofile in deze map (voor DevTools)
 *
 * Bij elke handeling staat ook de tijd op de hoofddraad: wat het venster bevroor.
 * Rekentijd in de worker telt daar niet in mee, in de doorlooptijd wel.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BROWSERS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

function optie(naam, standaard) {
  const i = process.argv.indexOf(`--${naam}`);
  return i > 0 ? process.argv[i + 1] : standaard;
}
const DIST = resolve(optie("dist", join(REPO, "packages/desktop/dist")));
const KEER = Number(optie("keer", 5));
const UIT = optie("uit", null);
const REM = Number(optie("rem", 1));
const PROFIEL = optie("profiel", null);

const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const kb = (n) => `${(n / 1024).toFixed(0)} kB`;
const mediaan = (l) => {
  const s = [...l].sort((a, b) => a - b);
  return s.length === 0 ? NaN : s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};

// ── Bundels ───────────────────────────────────────────────────────────────────

function alleBestanden(map) {
  return readdirSync(map, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? alleBestanden(join(map, e.name)) : [join(map, e.name)],
  );
}

function meetBundels() {
  const html = readFileSync(join(DIST, "index.html"), "utf8");
  const verwijzingen = [...html.matchAll(/<(?:script|link)\b[^>]*>/g)].map((m) => m[0]);
  const js = [];
  const css = [];
  for (const v of verwijzingen) {
    const pad = /(?:src|href)="\/?([^"]+)"/.exec(v)?.[1];
    if (!pad || !existsSync(join(DIST, pad))) continue;
    if (/\.m?js$/.test(pad)) js.push(pad);
    else if (/\.css$/.test(pad)) css.push(pad);
  }
  const grootte = (lijst) => lijst.reduce((s, p) => {
    const inhoud = readFileSync(join(DIST, p));
    return { ruw: s.ruw + inhoud.length, gzip: s.gzip + gzipSync(inhoud).length };
  }, { ruw: 0, gzip: 0 });
  const bestanden = alleBestanden(DIST);
  const soort = (re) => bestanden.filter((b) => re.test(b)).reduce((s, b) => s + statSync(b).size, 0);
  return {
    eersteJs: grootte(js),
    eersteCss: grootte(css),
    eersteBestanden: [...js, ...css],
    totaal: bestanden.reduce((s, b) => s + statSync(b).size, 0),
    totaalJs: soort(/\.m?js$/),
    totaalCss: soort(/\.css$/),
    totaalWasm: soort(/\.wasm$/),
    totaalLettertypen: soort(/\.(woff2?|ttf)$/),
    aantal: bestanden.length,
  };
}

// ── Browser ───────────────────────────────────────────────────────────────────

const vrijePoort = () => new Promise((ja, nee) => {
  const s = createServer();
  s.on("error", nee);
  s.listen(0, "::1", () => {
    const { port } = s.address();
    s.close(() => ja(port));
  });
});

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.volgende = 0;
    this.open = new Map();
    this.luisteraars = new Set();
    ws.addEventListener("message", (ev) => {
      const b = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString("utf8"));
      if (b.id === undefined) {
        for (const f of this.luisteraars) f(b);
        return;
      }
      const w = this.open.get(b.id);
      if (!w) return;
      this.open.delete(b.id);
      if (b.error) w.nee(new Error(`${w.methode}: ${b.error.message}`));
      else w.ja(b.result);
    });
    ws.addEventListener("close", () => {
      for (const w of this.open.values()) w.nee(new Error("de browser is weg"));
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
}

async function startBrowser(pad, profiel) {
  const proc = spawn(pad, [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profiel}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1600,1000",
    "about:blank",
  ], { stdio: "ignore" });
  const bestand = join(profiel, "DevToolsActivePort");
  for (let i = 0; i < 150 && !existsSync(bestand); i++) await wacht(100);
  const poort = Number(readFileSync(bestand, "utf8").split(/\r?\n/)[0]);
  const versie = await (await fetch(`http://127.0.0.1:${poort}/json/version`)).json();
  return { proc, cdp: await Cdp.verbind(versie.webSocketDebuggerUrl), naam: versie.Browser };
}

/**
 * Staat in de pagina vóór de app laadt: legt de tijd vast waarop de schil er staat
 * en wanneer de hoofddraad daarna rust vindt, en geeft de handelingen hun klok.
 */
const IN_PAGINA = String.raw`(() => {
  const m = (window.__meet = { t: {}, lang: [] });
  const volgendFrame = () => new Promise((r) => {
    let klaar = false;
    const af = () => { if (!klaar) { klaar = true; r(); } };
    requestAnimationFrame(() => setTimeout(af, 0));
    setTimeout(af, 200);
  });
  m.tot = async (test, ms = 120000) => {
    const einde = performance.now() + ms;
    while (performance.now() < einde) {
      if (test()) return;
      await new Promise((r) => setTimeout(r, 2));
    }
    throw new Error("niet gehaald binnen de tijd: " + test);
  };
  // De doorlooptijd van een handeling, tot en met het eerstvolgende frame erna.
  m.handeling = async (start, klaar) => {
    const t0 = performance.now();
    start();
    await m.tot(klaar);
    await volgendFrame();
    return performance.now() - t0;
  };
  const kijk = () => {
    if (m.t.schil || !document.querySelector(".project-browser")) return;
    m.t.schil = performance.now();
    ob.disconnect();
    volgendFrame().then(() => {
      m.t.getekend = performance.now();
      requestIdleCallback(() => { m.t.rustig = performance.now(); }, { timeout: 30000 });
    });
  };
  const ob = new MutationObserver(kijk);
  ob.observe(document, { childList: true, subtree: true });
  m.zet = (el, waarde) => {
    const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, waarde);
    el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  };
  m.uitwerking = () => document.querySelector(".calc-preview-content");
  m.rekenKlaar = () => {
    const p = document.querySelector(".calc-preview");
    return p && !p.classList.contains("rekent") && m.uitwerking()?.querySelector(".ifc-calc");
  };
  // De app start in een browser in het Engels; de namen dus in beide talen.
  m.TEGELS = { balklaag: /^(Timber joist floor|Balklaag)/, ligger: /^(Beam|Ligger)/ };
  m.tegel = (soort) => [...document.querySelectorAll(".mk-tegel")].find((t) => m.TEGELS[soort].test(t.querySelector(".mk-naam")?.textContent.trim() ?? ""));
  m.voorbeeldTab = () => [...document.querySelectorAll(".split-tab")].find((t) => /^(Print preview|Afdrukvoorbeeld)/.test(t.textContent.trim()));
  m.bladRij = (naam) => [...document.querySelectorAll(".pb-open")].find((t) => t.querySelector(".pb-naam")?.textContent.trim() === naam);
})();`;

async function ronde(pad, url) {
  const profiel = mkdtempSync(join(tmpdir(), "meet-snelheid-"));
  const { proc, cdp, naam } = await startBrowser(pad, profiel);
  try {
    const { targetId } = await cdp.stuur("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.stuur("Target.attachToTarget", { targetId, flatten: true });
    const pagina = (m, p) => cdp.stuur(m, p, sessionId);
    const fouten = [];
    let geladen = 0;
    cdp.luisteraars.add((b) => {
      if (b.sessionId !== sessionId) return;
      if (b.method === "Runtime.exceptionThrown") fouten.push(b.params.exceptionDetails.exception?.description ?? b.params.exceptionDetails.text);
      if (b.method === "Network.loadingFinished") geladen += b.params.encodedDataLength;
    });
    for (const d of ["Page", "Runtime", "Network", "Performance", ...(PROFIEL ? ["Profiler"] : [])]) await pagina(`${d}.enable`);
    await pagina("Network.setCacheDisabled", { cacheDisabled: true });
    await pagina("Emulation.setFocusEmulationEnabled", { enabled: true });
    if (REM > 1) await pagina("Emulation.setCPUThrottlingRate", { rate: REM });
    await pagina("Page.addScriptToEvaluateOnNewDocument", { source: IN_PAGINA });

    const evalueer = async (expressie) => {
      const r = await pagina("Runtime.evaluate", { expression: expressie, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      return r.result.value;
    };
    const hoofddraad = async () => {
      const { metrics } = await pagina("Performance.getMetrics");
      return (metrics.find((x) => x.name === "TaskDuration")?.value ?? 0) * 1000;
    };
    /** Een handeling: doorlooptijd in de pagina, en de tijd op de hoofddraad. */
    const meet = async (naam, start, klaar) => {
      const voor = await hoofddraad();
      if (PROFIEL) await pagina("Profiler.start");
      const ms = await evalueer(`window.__meet.handeling(() => { ${start} }, () => (${klaar}))`);
      await wacht(150);
      if (PROFIEL) writeFileSync(join(PROFIEL, `${naam}.cpuprofile`), JSON.stringify((await pagina("Profiler.stop")).profile));
      return { ms, hoofddraad: (await hoofddraad()) - voor };
    };
    const m = "window.__meet";

    if (PROFIEL) await pagina("Profiler.start");
    await pagina("Page.navigate", { url });
    await evalueer(`${m}.tot(() => ${m}.t.rustig, 60000)`);
    if (PROFIEL) writeFileSync(join(PROFIEL, "opstarten.cpuprofile"), JSON.stringify((await pagina("Profiler.stop")).profile));
    const t = await evalueer(`${m}.t`);
    const verf = await evalueer(`${m}.tot(() => performance.getEntriesByName("first-contentful-paint")[0], 2000).then(() => performance.getEntriesByName("first-contentful-paint")[0].startTime, () => null)`);
    const { metrics } = await pagina("Performance.getMetrics");
    const metriek = (n) => metrics.find((x) => x.name === n)?.value ?? 0;
    const uit = {
      browser: naam,
      opstarten: {
        verf,
        schil: t.schil,
        getekend: t.getekend,
        rustig: t.rustig,
        script: metriek("ScriptDuration") * 1000,
        hoofddraad: metriek("TaskDuration") * 1000,
        geheugen: metriek("JSHeapUsedSize"),
        geladen,
      },
    };

    // Het welkomstvenster weg, als dat er staat. Eerst de tijd die iemand nodig heeft om
    // te gaan klikken: de app haalt dan wat de eerste handelingen vragen binnen.
    await wacht(2000);
    await evalueer(`document.querySelector(".welkom-sluit")?.click()`);

    const openKiezer = `document.querySelector(".pb-blad-toevoegen button").click();
      setTimeout(() => document.querySelector(".rekentaal-menu-rij").click(), 0);`;
    uit.kiezer = await meet("kiezer", openKiezer, `${m}.tegel("balklaag")`);
    await evalueer(`${m}.tegel("balklaag").click()`);
    await evalueer(`${m}.tot(() => document.querySelector(".mk-tegel.gekozen"))`);
    uit.invoegen = await meet("invoegen", `document.querySelector(".module-kiezer .settings-btn-primary").click()`, `${m}.rekenKlaar()`);
    await evalueer(`document.querySelector(".pb-naam-invoer")?.blur()`);
    await wacht(100);

    // Doorrekenen: een getal in het beeld wijzigen.
    const veld = `[...document.querySelectorAll(".werk-paneel-body input[type=number], .werk-paneel-body input:not([type])")].find((i) => !i.disabled && Number(i.value) > 0)`;
    const vind = await evalueer(`(() => { const i = ${veld}; if (!i) return null; window.__meet.veld = i; window.__meet.begin = i.value; return i.value; })()`);
    if (vind === null) throw new Error("geen invoerveld gevonden in het beeld");
    uit.doorrekenen = [];
    for (let i = 1; i <= 4; i++) {
      const waarde = String(Number(vind) * (1 + i * 0.01));
      uit.doorrekenen.push(await meet(
        `doorrekenen-${i}`,
        `${m}.oud = ${m}.uitwerking().innerHTML; ${m}.zet(${m}.veld.isConnected ? ${m}.veld : (${m}.veld = ${veld}), ${JSON.stringify(waarde)})`,
        `${m}.rekenKlaar() && ${m}.uitwerking().innerHTML !== ${m}.oud`,
      ));
    }

    // De reactie op één toets: tot het venster de wijziging laat zien, zonder op de uitkomst te wachten.
    uit.toets = [];
    for (let i = 1; i <= 3; i++) {
      // Andere waarden dan hierboven: een bewaarde uitkomst zou niets te rekenen geven.
      const waarde = String(Number(vind) * (1 + i * 0.013));
      uit.toets.push(await meet(
        `toets-${i}`,
        `${m}.zet(${m}.veld.isConnected ? ${m}.veld : (${m}.veld = ${veld}), ${JSON.stringify(waarde)})`,
        `document.querySelector(".calc-preview.rekent")`,
      ));
      await evalueer(`${m}.tot(() => ${m}.rekenKlaar())`);
      await wacht(100);
    }

    // Een tweede blad erbij, en daarna heen en weer.
    await evalueer(openKiezer);
    await evalueer(`${m}.tot(() => ${m}.tegel("ligger"))`);
    await evalueer(`${m}.tegel("ligger").click()`);
    await evalueer(`${m}.tot(() => document.querySelector(".mk-tegel.gekozen"))`);
    uit.tweedeInvoegen = await meet("tweede-invoegen", `document.querySelector(".module-kiezer .settings-btn-primary").click()`, `${m}.rekenKlaar() && document.querySelector(".pb-naam-invoer")`);
    await evalueer(`document.querySelector(".pb-naam-invoer")?.blur()`);
    await evalueer(`${m}.tot(() => ${m}.rekenKlaar())`);
    await wacht(300);
    const namen = await evalueer(`[...document.querySelectorAll(".pb-open .pb-naam")].map((n) => n.textContent.trim())`);
    const [a, b] = namen.filter((n) => !/^(Project|Report|Rapport)/.test(n));
    uit.wisselen = [];
    // Eindigt op de balklaag: het zwaarste afdrukvoorbeeld hierna.
    for (const [i, naar] of [a, b, a, b, a].entries()) {
      uit.wisselen.push(await meet(
        `wisselen-${i}`,
        `${m}.oud = ${m}.uitwerking()?.innerHTML; ${m}.bladRij(${JSON.stringify(naar)}).click()`,
        `${m}.rekenKlaar() && ${m}.uitwerking().innerHTML !== ${m}.oud`,
      ));
    }

    // Het afdrukvoorbeeld van het blad, drie keer: de eerste keer laadt ook wat erbij hoort.
    uit.voorbeeld = [];
    for (let i = 0; i < 3; i++) {
      uit.voorbeeld.push(await meet(
        `voorbeeld-${i}`,
        `${m}.voorbeeldTab().click()`,
        `document.querySelector(".av-vel") && !document.querySelector(".av-meet")?.hasAttribute("data-opnieuw")`,
      ));
      await evalueer(`[...document.querySelectorAll(".split-tab")].find((t) => t !== ${m}.voorbeeldTab() && !t.classList.contains("active"))?.click()`);
      await evalueer(`${m}.tot(() => !document.querySelector(".av-paneel"))`);
      await wacht(200);
    }
    uit.fouten = fouten;
    return uit;
  } finally {
    cdp.sluit?.();
    proc.kill();
    await wacht(300);
    // Een browser die net stopte kan zijn profiel nog even vasthouden; de meting is dan al binnen.
    try {
      rmSync(profiel, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    } catch {
      console.error(`Tijdelijk profiel blijft staan: ${profiel}`);
    }
  }
}

// ── Hoofdlijn ─────────────────────────────────────────────────────────────────

if (!existsSync(join(DIST, "index.html"))) {
  console.error(`Geen gebouwde app in ${DIST}: bouw eerst met npm run build --workspace=@openaec/calcsheet-studio.`);
  process.exit(1);
}
const browser = BROWSERS.find((p) => existsSync(p));
if (!browser) {
  console.error("Geen Chrome of Edge gevonden.");
  process.exit(1);
}

const bundels = meetBundels();
const poort = await vrijePoort();
const server = spawn(process.execPath, [join(REPO, "node_modules/vite/bin/vite.js"), "preview", "--port", String(poort), "--strictPort", "--outDir", DIST], {
  cwd: join(REPO, "packages/desktop"),
  stdio: "ignore",
});
const url = `http://localhost:${poort}/`;
for (let i = 0; i < 300; i++) {
  try {
    if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) break;
  } catch {
    // nog niet klaar
  }
  await wacht(100);
}

const rondes = [];
try {
  for (let i = 0; i < KEER; i++) {
    process.stderr.write(`ronde ${i + 1}/${KEER}\n`);
    const r = await ronde(browser, url);
    if (r.fouten.length > 0) console.error("Fouten in de pagina:", r.fouten.slice(0, 5));
    rondes.push(r);
  }
} finally {
  server.kill();
}

const samen = (kies) => mediaan(rondes.flatMap((r) => kies(r)));
const rij = (naam, ms, hd) => console.log(`${naam.padEnd(34)}${String(Math.round(ms)).padStart(8)} ms${hd === undefined ? "" : `${String(Math.round(hd)).padStart(10)} ms`}`);

console.log(`\n${rondes[0]?.browser ?? ""}, ${KEER} rondes, mediaan${REM > 1 ? `, processor ${REM}x vertraagd` : ""}\n`);
console.log("Bundels");
console.log(`  eerste lading JS   ${kb(bundels.eersteJs.ruw).padStart(10)}  gzip ${kb(bundels.eersteJs.gzip)}`);
console.log(`  eerste lading CSS  ${kb(bundels.eersteCss.ruw).padStart(10)}  gzip ${kb(bundels.eersteCss.gzip)}`);
console.log(`  totaal             ${kb(bundels.totaal).padStart(10)}  in ${bundels.aantal} bestanden`);
console.log(`    JS ${kb(bundels.totaalJs)}, CSS ${kb(bundels.totaalCss)}, WASM ${kb(bundels.totaalWasm)}, lettertypen ${kb(bundels.totaalLettertypen)}`);
console.log(`  bij de start geladen (netwerk)  ${kb(samen((r) => r.opstarten.geladen))}\n`);
console.log(`${"Opstarten".padEnd(34)}${"tijd".padStart(11)}`);
rij("  eerste verf", samen((r) => r.opstarten.verf));
rij("  schil in de pagina", samen((r) => r.opstarten.schil));
rij("  schil getekend", samen((r) => r.opstarten.getekend));
rij("  hoofddraad in rust", samen((r) => r.opstarten.rustig));
rij("  script (ScriptDuration)", samen((r) => r.opstarten.script));
rij("  hoofddraad (TaskDuration)", samen((r) => r.opstarten.hoofddraad));
console.log(`  JS-geheugen na de start           ${(samen((r) => r.opstarten.geheugen) / 1048576).toFixed(1)} MB\n`);
console.log(`${"Handeling".padEnd(34)}${"doorloop".padStart(11)}${"hoofddraad".padStart(13)}`);
const hand = (naam, kies) => rij(`  ${naam}`, samen((r) => kies(r).map((x) => x.ms)), samen((r) => kies(r).map((x) => x.hoofddraad)));
hand("Module toevoegen openen", (r) => [r.kiezer]);
hand("Module invoegen (balklaag)", (r) => [r.invoegen]);
hand("Module invoegen (ligger)", (r) => [r.tweedeInvoegen]);
hand("Reactie op één toets", (r) => r.toets);
hand("Doorrekenen (balklaag)", (r) => r.doorrekenen);
hand("Wisselen van blad", (r) => r.wisselen);
hand("Afdrukvoorbeeld, eerste keer", (r) => [r.voorbeeld[0]]);
hand("Afdrukvoorbeeld, daarna", (r) => r.voorbeeld.slice(1));

if (UIT) {
  writeFileSync(UIT, JSON.stringify({ bundels, rondes }, null, 2));
  console.log(`\nRuwe uitkomsten: ${UIT}`);
}
process.exit(0);
