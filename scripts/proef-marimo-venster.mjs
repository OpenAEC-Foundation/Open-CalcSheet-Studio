/**
 * Proef van het Marimo-blad in het echte venster: een Tauri-build, WebView2 en Python dat
 * echt rekent. Vraagt een build en een bureaublad, en draait dus niet mee in check-alles;
 * zie scripts/check-marimo.mjs voor wat zonder venster kan.
 *
 * Toetst:
 *   • bij het openen draait niets;
 *   • na Run rekent het notebook, met numpy en matplotlib, zonder internet;
 *   • een schuif verplaatsen: de cel die de waarde gebruikt, volgt;
 *   • een cel bewerken en meteen opslaan: de laatste tekst komt in het projectbestand, en
 *     alleen openen schrijft niets weg;
 *   • opslaan: het notebook en de uitvoer komen in het projectbestand;
 *   • de afscherming: geen verzoek naar buiten, vanuit de pagina en vanuit Python;
 *   • afdrukvoorbeeld en opnieuw openen, zonder dat de kernel iets doet.
 *
 * Bouwen, met een eigen identifier: de opgeslagen appstaat hangt daaraan, en deze proef
 * opent en bewaart projecten.
 *   npm run tauri build --workspace=@openaec/calcsheet-studio -- --no-bundle
 *     -c "{\"identifier\":\"studio.openstructuralcalculation.proef\"}"
 *
 * Draaien:  node scripts/proef-marimo-venster.mjs <pad-naar-exe> <map-voor-uitvoer>
 */
import { createServer } from "node:http";
import { createSocket } from "node:dgram";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bouwProjectBestand, leesProjectBestand, PROJECT_FORMAAT_VERSIE } from "../packages/desktop/src/store/projectBestand.ts";
import { bladenVoorIfc } from "../packages/desktop/src/store/projectIfcx.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";
import { MARIMO_BLAD } from "../packages/desktop/src/store/marimoBlad.ts";
import { startApp } from "./lib/jupyter-venster.mjs";

const [exe, UIT] = process.argv.slice(2);
if (!exe || !UIT) {
  console.error("Gebruik: node scripts/proef-marimo-venster.mjs <pad-naar-exe> <map-voor-uitvoer>");
  process.exit(2);
}
mkdirSync(UIT, { recursive: true });

let fouten = 0;
const kop = (t) => console.log(`\n${t}`);
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}${detail ? `  (${String(detail).slice(0, 200)})` : ""}`);
  if (!ok) fouten++;
}
const wacht = (ms) => new Promise((klaar) => setTimeout(klaar, ms));

// Een luisterpost: wat er toch naar buiten gaat, komt hier binnen.
const hits = [];
const web = createServer((req, res) => {
  hits.push(`http ${req.method} ${req.url}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.end("gelekt");
});
await new Promise((klaar) => web.listen(0, "127.0.0.1", klaar));
const POST = web.address().port;
const udp = createSocket("udp4");
udp.on("message", (_b, r) => hits.push(`udp ${r.address}:${r.port}`));
await new Promise((klaar) => udp.bind(0, "127.0.0.1", klaar));

const NOTEBOOK = `import marimo

__generated_with = "0.25.2"
app = marimo.App()


@app.cell
def _():
    import marimo as mo
    import numpy as np
    import matplotlib.pyplot as plt
    return mo, np, plt


@app.cell
def _(mo):
    overspanning = mo.ui.slider(2, 12, value=6, step=0.5, label="L (m)")
    overspanning
    return (overspanning,)


@app.cell
def _(mo, np, overspanning, plt):
    L = overspanning.value
    x = np.linspace(0, L, 21)
    plt.figure(figsize=(4, 2))
    plt.plot(x, 5 * x * (L - x) / 2)
    mo.vstack([mo.md(f"M_max = **{5 * L**2 / 8:.2f} kNm**"), plt.gca()])
    return


@app.cell
async def _(mo):
    import js
    import pyodide.http
    uitkomst = []
    for naam, poging in {
        "js.fetch": lambda: js.fetch("http://127.0.0.1:${POST}/js-fetch"),
        "pyfetch": lambda: pyodide.http.pyfetch("http://127.0.0.1:${POST}/pyfetch"),
    }.items():
        try:
            await poging()
            uitkomst.append(f"{naam}: GELUKT")
        except Exception:
            uitkomst.append(f"{naam}: geweigerd")
    mo.md("NET " + "; ".join(uitkomst))
    return


if __name__ == "__main__":
    app.run()
`;

const project = {
  versie: PROJECT_FORMAAT_VERSIE,
  naam: "Proef",
  gegevens: legeGegevens(),
  rapport: undefined,
  exemplaren: [{ id: "ex-m", naam: "Blad M", templateId: MARIMO_BLAD, source: "", waarden: {}, marimo: { bestandsnaam: "", code: NOTEBOOK, metCode: true, uitvoer: [] } }],
};
const PROJECT = join(UIT, "proef.ifccalculation");
writeFileSync(PROJECT, bouwProjectBestand(project, bladenVoorIfc(project)));
const leesBlad = () => leesProjectBestand(readFileSync(PROJECT, "utf8"), "proef").exemplaren[0];

const OPSLAG = join(UIT, "opslag");
rmSync(OPSLAG, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });

const kiesBlad = (s, naam) => s.voerUit(`[...document.querySelectorAll('.pb-naam')].find((e) => e.textContent.includes(${JSON.stringify(naam)})).closest('button').click()`);
const frameVan = (s) => s.wachtOp(async () => {
  for (const [sessie, f] of s.frames) {
    if (f.type !== "iframe") continue;
    const herkomst = await s.voerUit("location.origin", sessie).catch(() => "");
    if (/^http:\/\/blad-.*\.localhost/.test(herkomst)) return sessie;
  }
  return null;
}, { tekst: "de omgeving", ms: 60000 });
const foto = async (s, naam) => writeFileSync(join(UIT, naam), await s.foto());
/** Alle tekst, ook in schaduw-DOM. */
/** Een echte afbeelding, ook in schaduw-DOM. */
const HEEFT_BEELD = `(() => { const zoek = (w) => { for (const n of w.querySelectorAll('*')) { if (n.localName === 'img' && n.naturalWidth > 100) return 1; if (n.shadowRoot && zoek(n.shadowRoot)) return 1; } return 0; }; return zoek(document); })()`;
const ALLE_TEKST = `(() => { const lees = (w) => [...w.childNodes].map((n) => n.nodeType === 3 ? n.textContent : n.nodeType === 1 ? (n.shadowRoot ? lees(n.shadowRoot) : '') + lees(n) : '').join(' '); return lees(document.body); })()`;

const app = await startApp({ exe, map: OPSLAG, poort: 9379, argumenten: [PROJECT] });
const s = app.sessie;
await s.stuur("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

try {
  await s.wachtOp(() => s.voerUit(`[...document.querySelectorAll('.pb-naam')].some((e) => e.textContent.includes('Blad M')) ? 1 : 0`), { tekst: "de projectboom", ms: 60000 });
  await s.voerUit(`document.querySelector('.welkom-paneel button[aria-label]')?.click()`);

  kop("Openen");
  await kiesBlad(s, "Blad M");
  const m = await frameVan(s);
  const begin = Date.now();
  await s.wachtOp(() => s.voerUit(`document.querySelectorAll('[data-cell-id]').length >= 4 ? 1 : 0`, m), { tekst: "de cellen", ms: 120000 });
  console.log(`     cellen in beeld na ${((Date.now() - begin) / 1000).toFixed(1)} s`);
  await wacht(3000);
  await foto(s, "1-open.png");
  const fouten0 = await s.voerUit(`document.querySelector('[role=alert]')?.innerText ?? ''`, m);
  meld(!/error|failed/i.test(fouten0), "geen foutmelding bij het openen", fouten0);
  // 22.50 staat alleen in de uitvoer; de code bevat de formule.
  meld(!(await s.voerUit(ALLE_TEKST, m)).includes("22.50"), "bij het openen heeft nog niets gedraaid");

  kop("Rekenen");
  // De laatste knop is die rechtsonder, voor alle cellen; de andere horen bij een cel.
  const knop = `[...document.querySelectorAll('[data-testid="run-button"]')].at(-1)`;
  await s.wachtOp(() => s.voerUit(`${knop} && !${knop}.disabled ? 1 : 0`, m), { tekst: "de knop Run", ms: 180000 });
  console.log(`     knop Run na ${((Date.now() - begin) / 1000).toFixed(1)} s`);
  await s.wachtOp(async () => {
    await s.voerUit(`${knop}?.click()`, m);
    return (await s.voerUit(ALLE_TEKST, m)).includes("22.50");
  }, { tekst: "de uitvoer", ms: 240000, stap: 3000 });
  await wacht(1500);
  const tekst1 = await s.voerUit(ALLE_TEKST, m);
  meld(/M_max =\s*22\.50\s*kNm/.test(tekst1.replace(/\s+/g, " ")), "numpy rekent: M = 5·6²/8 = 22,50");
  meld(await s.voerUit(HEEFT_BEELD, m) === 1, "matplotlib tekent een afbeelding");
  await foto(s, "2-gedraaid.png");

  kop("Reactief");
  await s.voerUit(`(() => {
    const zoek = (w) => { for (const n of w.querySelectorAll('*')) { if (n.getAttribute('role') === 'slider') return n; if (n.shadowRoot) { const r = zoek(n.shadowRoot); if (r) return r; } } return null; };
    const schuif = zoek(document);
    schuif.focus();
    schuif.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true, composed: true }));
  })()`, m);
  // L = 6,5: 5·42,25/8 = 26,41.
  await s.wachtOp(async () => /M_max =\s*26\.41\s*kNm/.test((await s.voerUit(ALLE_TEKST, m)).replace(/\s+/g, " ")), { tekst: "de cel die de schuif gebruikt", ms: 30000 });
  meld(true, "de schuif verplaatst: de cel volgt, M = 26,41");

  kop("Afscherming");
  const net = (await s.voerUit(ALLE_TEKST, m)).replace(/\s+/g, " ");
  meld(/js\.fetch: geweigerd/.test(net), "Python: js.fetch geweigerd", net.match(/NET [^]{0,60}/)?.[0]);
  meld(/pyfetch: geweigerd/.test(net), "Python: pyfetch geweigerd");
  for (const [naam, js] of [
    ["fetch", `fetch('http://127.0.0.1:${POST}/fetch').then(() => 'GELUKT', () => 'geweigerd')`],
    ["fetch zonder CORS", `fetch('http://127.0.0.1:${POST}/nocors', { mode: 'no-cors' }).then(() => 'GELUKT', () => 'geweigerd')`],
    ["afbeelding", `new Promise((k) => { const i = new Image(); i.onload = () => k('GELUKT'); i.onerror = () => k('geweigerd'); i.src = 'http://127.0.0.1:${POST}/img'; })`],
  ]) {
    meld((await s.voerUit(js, m)) === "geweigerd", `pagina: ${naam} geweigerd`);
  }
  meld(await s.voerUit(`(() => { try { return window.top.document ? 0 : 1; } catch { return 1; } })()`, m) === 1, "de iframe kan het hoofdvenster niet lezen");
  await wacht(1000);
  meld(hits.length === 0, "de luisterpost heeft niets ontvangen", hits.join(", "));

  kop("Bewerken en meteen opslaan");
  await s.voerUit(`(() => { const c = document.querySelector('[data-cell-id] .cm-content'); c.focus(); const r = document.createRange(); r.selectNodeContents(c); r.collapse(false); const g = getSelection(); g.removeAllRanges(); g.addRange(r); })()`, m);
  await s.stuur("Input.insertText", { text: "\n# PROEFREGEL" }, m);
  const voor = readFileSync(PROJECT, "utf8");
  // Binnen de pauze van Marimo zelf: de brug moet het bewaren dus zelf vragen.
  await s.voerUit(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))`);
  await s.wachtOp(() => readFileSync(PROJECT, "utf8") !== voor, { tekst: "het projectbestand", ms: 30000 });
  const blad = leesBlad();
  meld(blad.marimo?.code.includes("# PROEFREGEL"), "de laatste tekst staat in het projectbestand");
  meld(blad.marimo?.code.includes("@app.cell") && !blad.marimo?.code.includes("#code/"), "als gewoon notebook");
  // Marimo bewaart na een korte pauze nog een keer; dat mag niets meer veranderen.
  await wacht(2500);
  meld(await s.voerUit(`document.querySelector('.document-tab-modified') ? 0 : 1`) === 1, "en het project staat daarna niet opnieuw op gewijzigd");

  kop("Opslaan");
  meld(blad.marimo?.code.includes("overspanning"), "het notebook staat in het projectbestand");
  const uitvoer = (blad.marimo?.uitvoer ?? []).join("\n");
  meld(/26\.41/.test(uitvoer), "de laatste uitvoer ook", uitvoer.slice(0, 160));
  meld(/L \(m\)\s*6\.5/.test(uitvoer.replace(/<[^>]+>/g, " ")), "met de waarde van de schuif", uitvoer.slice(0, 300));
  meld(/<img[^>]+data:image/.test(uitvoer), "met de afbeelding");

  kop("Afdrukvoorbeeld");
  await s.voerUit(`[...document.querySelectorAll('.split-tab')].find((b) => /Print preview|Afdrukvoorbeeld/.test(b.textContent)).click()`);
  await s.wachtOp(() => s.voerUit(`document.querySelector('.av-pagina-inhoud .nb-code') ? 1 : 0`), { tekst: "het afdrukvoorbeeld", ms: 20000 });
  await wacht(1000);
  const papier = await s.voerUit(`document.querySelector('.av-vellen, .print-opmaak').innerText`);
  meld(papier.includes("np.linspace"), "de code staat op papier");
  meld(/26\.41/.test(papier), "de uitvoer ook");
  meld(/L \(m\)\s*6\.5/.test(papier), "en de waarde van de schuif", papier.slice(0, 200));
  meld(await s.voerUit(`[...document.querySelectorAll('.av-pagina-inhoud img')].some((i) => i.naturalWidth > 100) ? 1 : 0`) === 1, "en de afbeelding");
  meld(await s.voerUit(`document.querySelectorAll('.av-pagina-inhoud script').length`) === 0, "zonder script");
  await foto(s, "3-papier.png");
} catch (err) {
  meld(false, `onverwacht: ${err.message}`);
  await foto(s, "fout.png").catch(() => {});
} finally {
  app.stop();
}

await wacht(1500);
kop("Opnieuw openen");
const app2 = await startApp({ exe, map: OPSLAG, poort: 9379, argumenten: [PROJECT] });
const s2 = app2.sessie;
try {
  const opgeslagen = readFileSync(PROJECT, "utf8");
  await s2.wachtOp(() => s2.voerUit(`[...document.querySelectorAll('.pb-naam')].some((e) => e.textContent.includes('Blad M')) ? 1 : 0`), { tekst: "de projectboom", ms: 60000 });
  await s2.voerUit(`document.querySelector('.welkom-paneel button[aria-label]')?.click()`);
  await kiesBlad(s2, "Blad M");
  const m2 = await frameVan(s2);
  await s2.wachtOp(() => s2.voerUit(`document.querySelectorAll('[data-cell-id]').length >= 4 ? 1 : 0`, m2), { tekst: "de cellen", ms: 120000 });
  meld(true, "het notebook opent weer");
  await s2.voerUit(`[...document.querySelectorAll('.split-tab')].find((b) => /Print preview|Afdrukvoorbeeld/.test(b.textContent)).click()`);
  await s2.wachtOp(() => s2.voerUit(`document.querySelector('.av-pagina-inhoud .nb-code') ? 1 : 0`), { tekst: "het afdrukvoorbeeld", ms: 20000 });
  await wacht(1000);
  meld(/26\.41/.test(await s2.voerUit(`document.querySelector('.av-vellen, .print-opmaak').innerText`)), "de uitvoer staat nog op papier, zonder iets uit te voeren");
  meld(readFileSync(PROJECT, "utf8") === opgeslagen, "alleen openen schrijft niets weg");
} catch (err) {
  meld(false, `onverwacht: ${err.message}`);
  await foto(s2, "fout2.png").catch(() => {});
} finally {
  app2.stop();
}

web.close();
udp.close();
console.log(fouten === 0 ? "\nAlles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
