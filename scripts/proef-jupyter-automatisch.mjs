/**
 * Proef van de keuze Automatisch uitvoeren bij een Jupyter-blad, in het echte venster. Vraagt
 * een build en een bureaublad, en draait dus niet mee in check-alles; zie
 * scripts/check-jupyter.mjs voor wat zonder venster kan.
 *
 * Toetst:
 *   • zonder de keuze rekent een wijziging niet;
 *   • de keuze aanzetten rekent alles door;
 *   • typen rekent na een korte pauze, en de cursor blijft staan waar hij stond;
 *   • na een fout staat er geen oude uitkomst onder gewijzigde invoer;
 *   • uitvoer en tekstcellen starten geen nieuwe ronde;
 *   • de keuze komt in het projectbestand, en bij opnieuw openen draait er nog steeds niets
 *     tot de eerste wijziging;
 *   • de keuze uitzetten stopt het rekenen.
 *
 * Bouwen, met een eigen identifier: de opgeslagen appstaat hangt daaraan, en deze proef
 * opent en bewaart projecten.
 *   npm run tauri build --workspace=@openaec/calcsheet-studio -- --no-bundle
 *     -c "{\"identifier\":\"studio.openstructuralcalculation.proef\"}"
 *
 * Draaien:  node scripts/proef-jupyter-automatisch.mjs <pad-naar-exe> <map-voor-uitvoer>
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { strToU8 } from "fflate";
import { startApp } from "./lib/jupyter-venster.mjs";
import { bouwProjectBestand, leesProjectBestand, PROJECT_FORMAAT_VERSIE } from "../packages/desktop/src/store/projectBestand.ts";
import { bladenVoorIfc } from "../packages/desktop/src/store/projectIfcx.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";
import { JUPYTER_BLAD, pakWerkmapIn } from "../packages/desktop/src/store/jupyterBlad.ts";

const [exe, uitMap] = process.argv.slice(2);
if (!exe || !uitMap) {
  console.error("Gebruik: node scripts/proef-jupyter-automatisch.mjs <pad-naar-exe> <map-voor-uitvoer>");
  process.exit(2);
}
const UIT = resolve(uitMap);
const OPSLAG = join(UIT, "opslag");
rmSync(OPSLAG, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
mkdirSync(UIT, { recursive: true });

let fouten = 0;
function meld(ok, tekst, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}${extra ? `  (${String(extra).slice(0, 200)})` : ""}`);
  if (!ok) fouten++;
}
const kop = (t) => console.log(`\n${t}`);
const wacht = (ms) => new Promise((klaar) => setTimeout(klaar, ms));

const code = (id, source) => ({ cell_type: "code", id, metadata: {}, execution_count: null, outputs: [], source });
const notebook = strToU8(`${JSON.stringify({
  cells: [
    { cell_type: "markdown", id: "t", metadata: {}, source: "# Ligger" },
    code("invoer", "a = 3"),
    code("uit", "print('uitkomst', a * 2)"),
    code("np", "import numpy as np\nprint('som', np.arange(4).sum())"),
  ],
  metadata: { kernelspec: { display_name: "Python (Pyodide)", language: "python", name: "python" } },
  nbformat: 4,
  nbformat_minor: 5,
}, null, 1)}\n`);
const project = {
  versie: PROJECT_FORMAAT_VERSIE, naam: "Proef", gegevens: legeGegevens(), rapport: undefined,
  exemplaren: [{
    id: "ex-a", naam: "Blad A", templateId: JUPYTER_BLAD, source: "", waarden: {}, elementen: [],
    jupyter: { bestandsnaam: "", data: Buffer.from(pakWerkmapIn([{ pad: "notebook.ipynb", bytes: notebook }])).toString("base64"), metCode: true },
  }],
};
const PROJECT = join(UIT, "proef.ifccalculation");
writeFileSync(PROJECT, bouwProjectBestand(project, bladenVoorIfc(project)));
const leesBlad = () => leesProjectBestand(readFileSync(PROJECT, "utf8"), "proef").exemplaren[0];

const PANEEL = `[...window.jupyterapp.shell.widgets('main')].find((x) => x.sessionContext)`;
/** Open het blad en wacht op de kernel. Geeft de sessie van de iframe. */
async function openBlad(s) {
  await s.wachtOp(() => s.voerUit(`[...document.querySelectorAll('.pb-naam')].some((e) => e.textContent.includes('Blad A')) ? 1 : 0`), { tekst: "de projectboom", ms: 60000 });
  await s.voerUit(`document.querySelector('.welkom-paneel button[aria-label]')?.click()`);
  await s.voerUit(`[...document.querySelectorAll('.pb-naam')].find((e) => e.textContent.includes('Blad A')).closest('button').click()`);
  const f = await s.wachtOp(async () => {
    for (const [sessie, info] of s.frames) {
      if (info.type !== "iframe") continue;
      const h = await s.voerUit("location.origin", sessie).catch(() => "");
      if (/^http:\/\/blad-.*\.localhost/.test(h)) return sessie;
    }
    return null;
  }, { tekst: "de omgeving", ms: 60000 });
  await s.wachtOp(() => s.voerUit(`(() => { const p = window.jupyterapp && ${PANEEL}; return p?.sessionContext.session?.kernel?.status === 'idle' && p.content.widgets.length === 4 ? 1 : 0; })()`, f), { tekst: "de kernel", ms: 180000 });
  return f;
}
/** De uitvoer van alle cellen, uit het model: ook wat niet in beeld staat. */
const uitvoer = (s, f) => s.voerUit(`JSON.stringify(${PANEEL}.content.widgets.filter((c) => c.model.type === 'code').map((c) => c.model.toJSON().outputs.map((u) => [].concat(u.text ?? u.evalue ?? '').join('')).join('').trim()))`, f);
const nummers = (s, f) => s.voerUit(`JSON.stringify(${PANEEL}.content.widgets.filter((c) => c.model.type === 'code').map((c) => c.model.executionCount))`, f);
const wachtOpUitvoer = (s, f, patroon, tekst) => s.wachtOp(async () => patroon.test(await uitvoer(s, f)), { tekst, ms: 120000 });
/** Zet de cursor aan het eind van de eerste codecel. */
const cursorInInvoer = (s, f) => s.voerUit(`(() => {
  const p = ${PANEEL};
  p.content.activeCellIndex = 1;
  p.content.mode = 'edit';
  const e = p.content.activeCell.editor;
  e.focus();
  e.setCursorPosition(e.getPositionAt(e.model.sharedModel.getSource().length));
})()`, f);
const typ = (s, f, tekst) => s.stuur("Input.insertText", { text: tekst }, f);
const keuze = `[...document.querySelectorAll('.jupyter-keuze')].find((l) => /Automatisch|automatically/.test(l.textContent)).querySelector('input')`;

const app = await startApp({ exe, map: OPSLAG, poort: 9381, argumenten: [PROJECT] });
const s = app.sessie;
try {
  const f = await openBlad(s);

  kop("Zonder de keuze");
  meld((await uitvoer(s, f)) === '["","",""]', "bij het openen heeft niets gedraaid", await uitvoer(s, f));
  meld((await s.voerUit(`${keuze}.checked`)) === false, "de keuze staat standaard uit");
  await cursorInInvoer(s, f);
  await typ(s, f, " # opmerking");
  await wacht(4000);
  meld((await uitvoer(s, f)) === '["","",""]', "een wijziging rekent niet", await uitvoer(s, f));

  kop("De keuze aan");
  await s.voerUit(`${keuze}.click()`);
  await wachtOpUitvoer(s, f, /uitkomst 6.*som 6/, "de eerste ronde");
  meld(true, "aanzetten rekent alles door: uitkomst 6, som 6", await uitvoer(s, f));
  const eerste = JSON.parse(await nummers(s, f));
  meld(eerste[1] === eerste[0] + 1 && eerste[2] === eerste[1] + 1, "de cellen tellen op volgorde", eerste.join());
  await wacht(3000);
  meld((await nummers(s, f)) === JSON.stringify(eerste), "de uitvoer start geen nieuwe ronde", await nummers(s, f));

  kop("Typen");
  await s.voerUit(`(() => { const p = ${PANEEL}; p.content.activeCellIndex = 1; p.content.mode = 'edit'; const e = p.content.activeCell.editor; e.focus(); e.model.sharedModel.setSource('a = 5'); e.setCursorPosition(e.getPositionAt(5)); })()`, f);
  await wachtOpUitvoer(s, f, /uitkomst 10/, "de uitkomst na a = 5");
  meld(true, "de invoer veranderd: de uitkomst volgt, 10", await uitvoer(s, f));
  await wacht(500);
  const plek = await s.voerUit(`JSON.stringify((() => { const p = ${PANEEL}; const e = p.content.activeCell.editor; return { cel: p.content.activeCellIndex, modus: p.content.mode, cursor: e.getOffsetAt(e.getCursorPosition()), focus: e.hasFocus() }; })())`, f);
  meld(plek === '{"cel":1,"modus":"edit","cursor":5,"focus":true}', "de cursor staat nog op dezelfde plek", plek);
  await typ(s, f, "0");
  await wachtOpUitvoer(s, f, /uitkomst 100/, "de uitkomst na het typen");
  meld(true, "doortypen gaat op die plek verder: a = 50, uitkomst 100");
  meld(await s.voerUit(`${PANEEL}.content.activeCell.model.sharedModel.getSource()`, f) === "a = 50", "de cel bevat precies wat er getypt is");
  writeFileSync(join(UIT, "1-automatisch.png"), await s.foto());

  kop("Een fout tijdens het typen");
  await typ(s, f, " +");
  await s.wachtOp(async () => /invalid syntax|SyntaxError/i.test(await uitvoer(s, f)), { tekst: "de foutmelding", ms: 60000 });
  await wacht(500);
  const metFout = JSON.parse(await uitvoer(s, f));
  meld(metFout[1] === "" && metFout[2] === "", "onder de fout staat geen oude uitkomst", JSON.stringify(metFout));
  await typ(s, f, " 1");
  await wachtOpUitvoer(s, f, /uitkomst 102.*som 6/, "het herstel");
  meld(true, "de fout hersteld: alles rekent weer, uitkomst 102");

  kop("Een tekstcel");
  const voorTekst = await nummers(s, f);
  await s.voerUit(`${PANEEL}.model.sharedModel.cells[0].setSource('# Andere kop')`, f);
  await wacht(3000);
  meld((await nummers(s, f)) === voorTekst, "een tekstcel wijzigen start geen ronde");

  kop("Opslaan");
  const voor = readFileSync(PROJECT, "utf8");
  await s.voerUit(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))`);
  await s.wachtOp(() => readFileSync(PROJECT, "utf8") !== voor, { tekst: "het projectbestand", ms: 30000 });
  meld(leesBlad().jupyter?.automatisch === true, "de keuze staat in het projectbestand");
} catch (err) {
  meld(false, `onverwacht: ${err.message}`);
  writeFileSync(join(UIT, "fout.png"), await s.foto());
} finally {
  app.stop();
}

await wacht(2000);
kop("Opnieuw openen");
const app2 = await startApp({ exe, map: OPSLAG, poort: 9381, argumenten: [PROJECT] });
const s2 = app2.sessie;
try {
  const f = await openBlad(s2);
  meld(await s2.voerUit(`${keuze}.checked`) === true, "de keuze staat nog aan");
  const bij = await nummers(s2, f);
  const uitBij = await uitvoer(s2, f);
  meld(/uitkomst 102/.test(uitBij), "de opgeslagen uitvoer staat er", uitBij);
  await wacht(5000);
  meld((await nummers(s2, f)) === bij && !(await s2.voerUit(`${PANEEL}.context.model.dirty`, f)), "bij het openen draait er niets", await nummers(s2, f));
  const leeg = await s2.voerUit(`new Promise((klaar) => { const fut = ${PANEEL}.sessionContext.session.kernel.requestExecute({ code: "print('a' in globals())", store_history: false }); let u = ''; fut.onIOPub = (m) => { if (m.header.msg_type === 'stream') u += m.content.text; }; fut.done.then(() => klaar(u.trim())); })`, f);
  meld(leeg === "False", "de kernel is nog leeg", leeg);
  await cursorInInvoer(s2, f);
  await typ(s2, f, "0");
  // De cel stond op a = 50 + 1; een nul erachter maakt 50 + 10.
  await wachtOpUitvoer(s2, f, /uitkomst 120.*som 6/, "de eerste ronde na openen");
  meld(true, "de eerste wijziging rekent alles door, ook de cellen eronder: uitkomst 120");

  kop("De keuze uit");
  await s2.voerUit(`${keuze}.click()`);
  await wacht(1000);
  const bijUit = await nummers(s2, f);
  await cursorInInvoer(s2, f);
  await typ(s2, f, "0");
  await wacht(4000);
  meld((await nummers(s2, f)) === bijUit, "uitzetten: een wijziging rekent niet meer", await nummers(s2, f));
} catch (err) {
  meld(false, `onverwacht: ${err.message}`);
  writeFileSync(join(UIT, "fout2.png"), await s2.foto());
} finally {
  app2.stop();
}

console.log(fouten === 0 ? "\nAlles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
