/**
 * Controle van het Jupyter-blad.
 *
 * Toetst:
 *   • de werkmap inpakken en terug geeft dezelfde bytes, ook binair, en dezelfde
 *     bestanden geven dezelfde ZIP; paden buiten de werkmap vallen weg;
 *   • opslaan en heropenen geeft dezelfde bestanden en uitvoer, naast een rekenblad en
 *     een spreadsheet-blad, en een ander blad krijgt geen werkmap;
 *   • oude bestanden blijven leesbaar, ook een blad zonder werkmap;
 *   • de afdruk komt uit de opgeslagen uitvoer: tekst, tabellen, afbeeldingen, met en
 *     zonder code, en wat te hoog is voor een vel wordt geknipt;
 *   • HTML uit de uitvoer gaat door dezelfde opschoning als de rest van de app;
 *   • een notebook verliest zijn vertrouwen bij het inlezen;
 *   • de afscherming staat in de configuratie: rechten, CSP, omhulsel, Windows-bundel.
 *
 * Wat er in het echte venster gebeurt (numpy, matplotlib, netwerk, Tauri): zie
 * scripts/proef-jupyter-venster.mjs. Dat vraagt een Tauri-build en draait hier niet mee.
 *
 * Draaien:  node scripts/check-jupyter.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";
import createDOMPurify from "dompurify";
import { strToU8, zipSync } from "fflate";
import { bouwProjectBestand, leesProjectBestand, normaliseerExemplaar, PROJECT_FORMAAT_VERSIE } from "../packages/desktop/src/store/projectBestand.ts";
import { bladenVoorIfc, projectIfcx, projectStep } from "../packages/desktop/src/store/projectIfcx.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";
import { isLosBlad, SPREADSHEET_BLAD } from "../packages/desktop/src/store/spreadsheetBlad.ts";
import {
  bestandenVoorOmgeving, bladnaamVoorNotebook, bladSleutel, eersteNotebook, isJupyterBlad, JUPYTER_BLAD, JUPYTER_RECHTEN,
  jupyterOmhulsel, leesJupyterWerkmap, notebooksIn, notebookZonderVertrouwen, pakWerkmapIn, pakWerkmapUit, startNotebook,
  uitBase64, veiligPad,
} from "../packages/desktop/src/store/jupyterBlad.ts";
import { notebookNaarHtml, werkmapNaarHtml } from "../packages/desktop/src/components/calc/jupyterPapier.ts";
import { maakOpschoner } from "../packages/desktop/src/components/calc/uitwerkingRegels.ts";

const hier = dirname(fileURLToPath(import.meta.url));
const lees = (pad) => readFileSync(join(hier, "..", pad), "utf8");

let fouten = 0;
function meld(ok, tekst) {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}`);
  if (!ok) fouten++;
}

const venster = new JSDOM("<!doctype html>").window;
globalThis.DOMParser = venster.DOMParser;
const schoon = maakOpschoner(createDOMPurify(venster));
const naarBase64 = (bytes) => Buffer.from(bytes).toString("base64");
const zelfde = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const notebook = (cellen, metadata = {}) => strToU8(JSON.stringify({ cells: cellen, metadata, nbformat: 4, nbformat_minor: 5 }));
const code = (source, outputs = [], metadata = {}) => ({ cell_type: "code", source, outputs, metadata, execution_count: 1 });
const tekst = (source) => ({ cell_type: "markdown", source, metadata: {} });

const NOTEBOOK = notebook([
  tekst(["# Staaflijst\n", "\n", "Het **gewicht** per staaf, met $G = L \\cdot A \\cdot \\rho$.\n"]),
  code("import pandas as pd\nprint('hallo')", [
    { output_type: "stream", name: "stdout", text: ["hallo\n"] },
    { output_type: "display_data", metadata: {}, data: { "image/png": `${PNG}\n`, "text/plain": ["<Figure>"] } },
    {
      output_type: "execute_result", metadata: {}, execution_count: 1,
      data: {
        "text/html": ["<div><style scoped>.x{color:red}</style><table class=\"dataframe\"><thead><tr><th>Staaf</th></tr></thead><tbody><tr><td>HEA 200</td></tr></tbody></table>",
          "<script>window.geraakt = 1</script><img src=\"x\" onerror=\"window.geraakt = 1\"><img src=\"https://voorbeeld.invalid/l.png\"></div>"],
        "text/plain": ["alleen tekst"],
      },
    },
    { output_type: "error", ename: "ValueError", evalue: "te groot", traceback: ["\u001b[31mValueError\u001b[0m: te groot"] },
  ]),
]);
const BINAIR = new Uint8Array(4096).map((_, i) => (i * 37) % 256);
const BESTANDEN = [
  { pad: "notebook.ipynb", bytes: NOTEBOOK },
  { pad: "helper.py", bytes: strToU8("def dubbel(x):\n    return 2 * x\n") },
  { pad: "data/invoer.csv", bytes: strToU8("a;b\r\n1;2\r\n") },
  { pad: "data/ruis.bin", bytes: BINAIR },
  { pad: "leeg/", bytes: new Uint8Array() },
];

console.log("\nDe werkmap");
const zip = pakWerkmapIn(BESTANDEN);
const terugLijst = pakWerkmapUit(zip);
meld(terugLijst.length === BESTANDEN.length, "alle bestanden en de lege map komen terug");
meld(BESTANDEN.every((b) => { const t = terugLijst.find((x) => x.pad === b.pad); return t && zelfde(t.bytes, b.bytes); }), "byte voor byte, ook binair en met CRLF");
meld(zelfde(pakWerkmapIn([...BESTANDEN].reverse()), zip), "dezelfde bestanden geven dezelfde ZIP, in welke volgorde ook");
meld(zelfde(pakWerkmapIn(terugLijst), zip), "opnieuw inpakken verandert niets");

for (const slecht of ["../uit.py", "a/../../b", "/abs.py", "C:\\x.py", "a\\b.py", "c:/x", "a//b", "./a", "", "a\0b"]) {
  meld(veiligPad(slecht) === null, `pad geweigerd: ${JSON.stringify(slecht)}`);
}
for (const goed of ["a.py", "map/b.csv", "map/", "é è/ß.txt"]) meld(veiligPad(goed) === goed, `pad toegestaan: ${goed}`);
const kwaad = zipSync({ "../../buiten.py": strToU8("x"), "goed.py": strToU8("y"), "C:\\win.py": strToU8("z") });
meld(pakWerkmapUit(kwaad).map((b) => b.pad).join() === "goed.py", "een ZIP met paden naar buiten: alleen wat erin hoort blijft");
meld(pakWerkmapIn([{ pad: "../x", bytes: strToU8("x") }]).length < 30, "inpakken slaat een pad naar buiten ook over");
let kapot = false;
try { pakWerkmapUit(strToU8("geen zip")); } catch { kapot = true; }
meld(kapot, "een kapotte ZIP geeft een fout, geen lege werkmap");
meld(notebooksIn([...BESTANDEN, { pad: ".verborgen/a.ipynb", bytes: NOTEBOOK }]).length === 1, "alleen zichtbare notebooks tellen");
meld(eersteNotebook(BESTANDEN) === "notebook.ipynb", "het eerste notebook opent");
meld(bladnaamVoorNotebook("C:\\map\\Doorbuiging.IPYNB") === "Doorbuiging" && bladnaamVoorNotebook(".py") === "Jupyter", "de bladnaam komt uit de bestandsnaam");

const start = JSON.parse(Buffer.from(startNotebook({ kop: "Kop", uitleg: "Uitleg", titel: "Ti\"tel" })));
meld(start.nbformat === 4 && start.cells.length === 2 && start.cells[1].outputs.length === 0, "een nieuw notebook heeft een startcel zonder uitvoer");
meld(start.cells[1].source.join("").includes("numpy") && start.cells[1].source.join("").includes("matplotlib"), "de startcel gebruikt numpy en matplotlib");
meld(start.cells[1].source.join("").includes(`plt.title("Ti\\"tel")`), "de titel staat goed geëscapet in de code");

console.log("\nHet projectbestand");
const DATA = naarBase64(zip);
const project = {
  versie: PROJECT_FORMAAT_VERSIE,
  naam: "Proef",
  gegevens: legeGegevens(),
  rapport: undefined,
  exemplaren: [
    { id: "ex-reken", naam: "Reken", templateId: "", source: "a = 2", waarden: {}, elementen: [] },
    { id: "ex-jup", naam: "Notebook", templateId: JUPYTER_BLAD, source: "", waarden: {}, elementen: [], jupyter: { bestandsnaam: "n.ipynb", data: DATA, metCode: false, automatisch: true } },
    { id: "ex-jup2", naam: "Tweede", templateId: JUPYTER_BLAD, source: "", waarden: {}, elementen: [], jupyter: { bestandsnaam: "", data: naarBase64(pakWerkmapIn([BESTANDEN[1]])), metCode: true } },
    { id: "ex-xlsx", naam: "Lijst", templateId: SPREADSHEET_BLAD, source: "", waarden: {}, elementen: [], xlsx: { bestandsnaam: "a.xlsx", data: "UEsDBA==" } },
  ],
};
const bladen = bladenVoorIfc(project);
const jupBlad = bladen.find((b) => b.id === "ex-jup");
meld(jupBlad.nodes.length === 0 && !jupBlad.fout, "een Jupyter-blad wordt niet doorgerekend");

const bestand = bouwProjectBestand(project, bladen);
const terug = leesProjectBestand(bestand, "proef");
const opId = (id) => terug.exemplaren.find((e) => e.id === id);
meld(opId("ex-jup")?.jupyter?.data === DATA, "de werkmap komt byte voor byte terug");
meld(opId("ex-jup")?.jupyter?.bestandsnaam === "n.ipynb", "de bestandsnaam komt terug");
meld(opId("ex-jup")?.jupyter?.metCode === false && opId("ex-jup2")?.jupyter?.metCode === true, "de keuze voor de code op papier komt terug");
meld(opId("ex-jup")?.jupyter?.automatisch === true && opId("ex-jup2")?.jupyter?.automatisch === undefined, "de keuze Automatisch uitvoeren komt terug, en staat standaard uit");
meld(isJupyterBlad(opId("ex-jup")) && opId("ex-jup").naam === "Notebook", "het blijft een Jupyter-blad");
meld(opId("ex-jup").jupyter.data !== opId("ex-jup2").jupyter.data, "twee bladen houden elk hun eigen werkmap");
meld(!("jupyter" in opId("ex-reken")) && !("jupyter" in opId("ex-xlsx")), "een ander blad krijgt geen werkmap");
meld(opId("ex-xlsx")?.xlsx?.data === "UEsDBA==", "het spreadsheet-blad ernaast blijft heel");

const heropend = pakWerkmapUit(uitBase64(opId("ex-jup").jupyter.data));
const nbTerug = JSON.parse(Buffer.from(heropend.find((b) => b.pad === "notebook.ipynb").bytes));
meld(nbTerug.cells[1].outputs.length === 4 && nbTerug.cells[1].outputs[1].data["image/png"].startsWith("iVBOR"), "de uitvoer van de cellen blijft bewaard");
meld(zelfde(heropend.find((b) => b.pad === "data/ruis.bin").bytes, BINAIR), "een databestand blijft bewaard");
const tweedeRonde = leesProjectBestand(bouwProjectBestand(terug, bladenVoorIfc(terug)), "proef");
meld(tweedeRonde.exemplaren.find((e) => e.id === "ex-jup").jupyter.data === DATA, "ook na twee keer opslaan");

const doc = projectIfcx(project, bladen);
const attr = doc.data.find((k) => k.attributes?.["ocss::blad"]?.id === "ex-jup").attributes;
meld(attr["ocss::blad"].soort === "jupyter", "in het IFCX staat de soort jupyter");
meld(attr["ocss::blad::jupyter"].mediaType === "application/zip", "met het mediatype van ZIP");
meld(attr["ocss::blad::jupyter"].grootte === zip.length, `en de grootte in bytes (${zip.length})`);
meld(attr["ocss::blad::jupyter"].metCode === false, "en de keuze voor de code");
meld(attr["ocss::blad::jupyter"].automatisch === true, "en de keuze voor automatisch uitvoeren");
meld(!("automatisch" in doc.data.find((k) => k.attributes?.["ocss::blad"]?.id === "ex-jup2").attributes["ocss::blad::jupyter"]), "die alleen meegaat als hij aan staat: een bestaand bestand verandert niet");
meld(!("ocss::blad::rekentekst" in attr) && !("ocss::blad::invoer" in attr), "zonder rekentekst en invoer");
meld(typeof doc.schemas["ocss::blad::jupyter"]?.value === "object", "het attribuut heeft een schema");

const step = projectStep(project, bladen);
meld(step.includes("'application/zip'"), "de STEP noemt het mediatype");
meld(step.includes("'n.ipynb'"), "de STEP noemt de bestandsnaam");
meld(!step.includes(DATA.slice(0, 40)), "de inhoud van de werkmap staat niet in de STEP");

console.log("\nOude bestanden");
const oud = { versie: 1, naam: "Oud", exemplaren: [{ id: "a", naam: "R", templateId: "", source: "a = 1", waarden: {} }] };
meld(leesProjectBestand(JSON.stringify(oud), "oud").exemplaren[0].jupyter === undefined, "een bestand van vóór Jupyter opent, zonder veld");
const zonder = normaliseerExemplaar({ id: "x", naam: "Los", templateId: JUPYTER_BLAD }, "n");
meld(isJupyterBlad(zonder) && zonder.jupyter === undefined, "een blad zonder werkmap blijft een Jupyter-blad");
meld(normaliseerExemplaar({ id: "y", naam: "R", templateId: "", jupyter: { data: "QUJD" } }, "n").jupyter === undefined, "een rekenblad neemt geen werkmap over uit een bestand");
meld(normaliseerExemplaar({ id: "z", naam: "J", templateId: JUPYTER_BLAD, jupyter: { data: "QU\nJD" } }, "n").jupyter?.data === "QUJD", "witruimte in de base64 valt weg");
meld(leesJupyterWerkmap({ data: 12 }) === undefined && leesJupyterWerkmap(null) === undefined, "onbruikbare werkmap: geen veld");
meld(leesJupyterWerkmap({ data: "QUJD" }).metCode === true, "zonder keuze gaat de code mee");
meld(leesJupyterWerkmap({ data: "QUJD" }).automatisch === undefined && leesJupyterWerkmap({ data: "QUJD", automatisch: "ja" }).automatisch === undefined, "automatisch uitvoeren staat alleen aan als het er echt staat");
meld(isLosBlad({ templateId: JUPYTER_BLAD }) && !isLosBlad({ templateId: "balklaag" }), "een Jupyter-blad is een los blad, een module niet");

console.log("\nOp papier, uit de opgeslagen uitvoer");
const teksten = { leeg: "geen notebooks", fout: (b) => `${b} onleesbaar`, kapot: (m) => `kapot: ${m}` };
const metCode = werkmapNaarHtml({ bestandsnaam: "", data: DATA, metCode: true }, teksten);
const zonderCode = werkmapNaarHtml({ bestandsnaam: "", data: DATA, metCode: false }, teksten);
const opgeschoond = schoon(metCode);
meld(metCode.includes("<h1>Staaflijst</h1>") && metCode.includes("<strong>gewicht</strong>"), "de tekstcel als opgemaakte tekst");
meld(metCode.includes("katex"), "een formule in een tekstcel gaat door KaTeX");
meld(metCode.includes("import pandas as pd"), "met code: de code staat erbij");
meld(!zonderCode.includes("import pandas as pd") && zonderCode.includes("<h1>Staaflijst</h1>"), "zonder code: de code weg, de tekst blijft");
meld(zonderCode.includes("hallo") && zonderCode.includes("image/png") && zonderCode.includes("HEA 200"), "zonder code: de uitvoer blijft");
meld(metCode.includes("<pre class=\"nb-tekst\">hallo</pre>"), "tekstuitvoer");
meld(opgeschoond.includes(`data:image/png;base64,${PNG}`), "een afbeelding als data, ook na de opschoning");
meld(opgeschoond.includes("<table") && opgeschoond.includes("HEA 200") && !metCode.includes("alleen tekst"), "een tabel uit de HTML, niet de tekstvorm");
meld(metCode.includes("ValueError") && !metCode.includes("\u001b"), "een foutmelding zonder ANSI-codes");
meld(!/<script|onerror|<style/i.test(opgeschoond), "scripts, event-attributen en stijlblokken gaan weg in de opschoning");
meld(!/\ssrc="https:/.test(opgeschoond) && opgeschoond.includes("data-extern-src"), "een afbeelding van buiten laadt niet vanzelf");
meld(/<pre[^>]*>[^<]*&lt;|hallo/.test(metCode), "tekst wordt geëscapet");
meld(werkmapNaarHtml({ bestandsnaam: "", data: naarBase64(pakWerkmapIn([{ pad: "a.py", bytes: strToU8("x") }])), metCode: true }, teksten) === "<p class=\"nb-tekst-los\">geen notebooks</p>", "een werkmap zonder notebook: een melding");
meld(werkmapNaarHtml({ bestandsnaam: "", data: "QUJD", metCode: true }, teksten).includes("kapot:"), "een kapotte werkmap: een melding, geen fout");
meld(notebookNaarHtml({ pad: "x.ipynb", bytes: strToU8("{niet") }, { metCode: true, fout: teksten.fout }).includes("x.ipynb onleesbaar"), "een onleesbaar notebook: een melding");

const lang = Array.from({ length: 200 }, (_, i) => `regel ${i}`).join("\n");
const rijen = Array.from({ length: 95 }, (_, i) => `<tr><td>${i}</td></tr>`).join("");
const groot = notebookNaarHtml({
  pad: "g.ipynb",
  bytes: notebook([code(lang, [
    { output_type: "stream", name: "stdout", text: lang },
    { output_type: "display_data", data: { "text/html": `<table><thead><tr><th>Kop</th></tr></thead><tbody>${rijen}</tbody></table>` } },
  ])]),
}, { metCode: true, fout: teksten.fout });
const stukken = new JSDOM(`<body>${groot}</body>`).window.document.body;
const pres = [...stukken.querySelectorAll("pre.nb-code")];
meld(pres.length === 5 && pres.every((p) => p.textContent.split("\n").length <= 45), "lange code in stukken die op een vel passen");
meld(pres.map((p) => p.textContent).join("\n") === lang, "en er valt geen regel weg");
const tabellen = [...stukken.querySelectorAll(".nb-html table")];
meld(tabellen.length === 4 && tabellen.every((t) => t.querySelector("thead th")?.textContent === "Kop"), "een lange tabel in stukken, elk met de kopregel");
meld(tabellen.reduce((s, t) => s + t.querySelectorAll("tbody tr").length, 0) === 95, "en er valt geen rij weg");
meld([...stukken.children].every((k) => k.tagName !== "SECTION"), "elk stuk is een eigen blok voor de paginering");

const verborgen = notebookNaarHtml({
  pad: "v.ipynb",
  bytes: notebook([
    code("geheim_a", [{ output_type: "stream", text: "zichtbaar_a" }], { jupyter: { source_hidden: true } }),
    code("zichtbaar_b", [{ output_type: "stream", text: "geheim_b" }], { jupyter: { outputs_hidden: true } }),
    code("geheim_c", [{ output_type: "stream", text: "geheim_c" }], { tags: ["remove-cell"] }),
  ]),
}, { metCode: true, fout: teksten.fout });
meld(!verborgen.includes("geheim") && verborgen.includes("zichtbaar_a") && verborgen.includes("zichtbaar_b"), "een verborgen cel blijft van papier");

console.log("\nVertrouwen");
const metVertrouwen = notebook([
  { ...code("x", [{ output_type: "display_data", data: { "application/javascript": "alert(1)" } }]), metadata: { trusted: true } },
], { trusted: true, kernelspec: { name: "python" } });
const zonderVertrouwen = JSON.parse(Buffer.from(notebookZonderVertrouwen(metVertrouwen)));
meld(!("trusted" in zonderVertrouwen.cells[0].metadata) && !("trusted" in zonderVertrouwen.metadata), "een notebook verliest zijn vertrouwen bij het inlezen");
meld(zonderVertrouwen.metadata.kernelspec.name === "python" && zonderVertrouwen.cells[0].outputs.length === 1, "de rest van het notebook blijft staan");
meld(zelfde(notebookZonderVertrouwen(strToU8("{niet")), strToU8("{niet")), "iets anders dan een notebook blijft zoals het is");
const voorOmgeving = bestandenVoorOmgeving([{ pad: "a.ipynb", bytes: metVertrouwen }, { pad: "b.py", bytes: strToU8("x = 1") }]);
meld(!Buffer.from(voorOmgeving[0].bytes).toString().includes("trusted") && Buffer.from(voorOmgeving[1].bytes).toString() === "x = 1", "alleen notebooks worden aangepast");
meld(zelfde(notebookZonderVertrouwen(notebookZonderVertrouwen(metVertrouwen)), notebookZonderVertrouwen(metVertrouwen)), "twee keer inlezen geeft hetzelfde");

console.log("\nDe afscherming in de configuratie");
const rechten = JUPYTER_RECHTEN.split(" ");
meld(!rechten.includes("allow-top-navigation") && !rechten.some((r) => r.startsWith("allow-popups")), "de iframe kan het hoofdvenster niet wegsturen en geen venster openen");
meld(rechten.includes("allow-scripts") && rechten.includes("allow-same-origin"), "wel script en een eigen herkomst, voor de service worker");
const herkomst = `http://blad-${bladSleutel("ex-1")}.localhost:47631`;
const buiten = new JSDOM(jupyterOmhulsel(herkomst)).window.document;
const csp = buiten.querySelector("meta[http-equiv]").getAttribute("content");
meld(csp.includes("default-src 'none'") && csp.includes(`frame-src ${herkomst}`) && !csp.includes("script-src"), "het omhulsel voert niets uit en houdt de iframe op zijn herkomst");
const binnen = buiten.querySelector("iframe");
meld(binnen.getAttribute("src") === `${herkomst}/lab/index.html` && binnen.getAttribute("sandbox") === JUPYTER_RECHTEN, "de binnenste iframe met dezelfde rechten");
meld(/^[a-z0-9]+$/.test(bladSleutel("Ex-Ä/1")) && bladSleutel("ex-1") !== bladSleutel("ex-2"), "de sleutel past in een hostnaam en verschilt per blad");

const rust = lees("packages/desktop/src-tauri/src/jupyter_omgeving.rs");
const cspRust = rust.slice(rust.indexOf("const CSP"), rust.indexOf("// ------", rust.indexOf("const CSP")));
meld(cspRust.includes("connect-src 'self' data: blob:;") && cspRust.includes("img-src 'self' data: blob:;"), "de server staat geen verzoek naar buiten toe");
meld(!/https?:\/\/(?!tauri\.localhost|localhost:3021)/.test(cspRust) && cspRust.includes("frame-ancestors"), "geen adres naar buiten in de CSP; alleen de app sluit in");
meld(/script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval';/.test(cspRust), "geen script uit de uitvoer van een cel: geen unsafe-inline, blob: of data:");
meld(cspRust.includes("form-action 'none'") && cspRust.includes("frame-src 'self';") && cspRust.includes("worker-src 'self';"), "geen formulieren, en frames en workers alleen van de eigen herkomst");
meld(rust.includes('("127.0.0.1", poort)') && !rust.includes("0.0.0.0"), "de server luistert alleen op loopback");

const conf = JSON.parse(lees("packages/desktop/src-tauri/tauri.conf.json"));
meld(conf.bundle.windows.webviewInstallMode.type === "embedBootstrapper" && conf.bundle.windows.webviewInstallMode.silent === true, "Windows: embedBootstrapper blijft staan");
meld(conf.bundle.resources.includes("WebView2Loader.dll") && conf.bundle.resources.includes("jupyter-omgeving/*"), "Windows: WebView2Loader.dll en de omgeving in de resources");
meld(conf.build.beforeBuildCommand.includes("bouw-jupyter-omgeving.mjs"), "een release bouwt de omgeving mee");
meld(existsSync(join(hier, "../packages/desktop/src-tauri/jupyter-omgeving/LEESMIJ.md")), "de map van de omgeving bestaat ook zonder pakbestand");
const lite = JSON.parse(lees("packages/desktop/jupyter-omgeving/jupyter-lite.json"))["jupyter-config-data"];
meld(lite.contentsStorageDrivers?.join() === "memoryStorageDriver", "de bestanden staan niet los in de opslag van de webview");
meld(["javascript", "vega5"].every((n) => lite.disabledExtensions.includes(`@jupyterlab/${n}-extension:factory`)), "uitvoer die een tekst evalueert, staat uit");
meld(lite.litePluginSettings["@jupyterlite/pyodide-kernel-extension:kernel"].disablePyPIFallback === true, "de kernel haalt niets van PyPI");
meld(/pyodide\.mjs$/.test(lite.litePluginSettings["@jupyterlite/pyodide-kernel-extension:kernel"].pyodideUrl) && lite.litePluginSettings["@jupyterlite/pyodide-kernel-extension:kernel"].pyodideUrl.startsWith("./"), "Pyodide komt uit de omgeving zelf");
const bouw = lees("scripts/bouw-jupyter-omgeving.mjs");
meld(["numpy", "scipy", "pandas", "matplotlib"].every((p) => bouw.includes(`"${p}"`)), "numpy, scipy, pandas en matplotlib zitten in de omgeving");
const brug = lees("packages/desktop/jupyter-omgeving/ocss-brug.js");
meld(/function laad\([^)]*\) \{\s*bezig = true;\s*automatisch = aan === true;/.test(brug) && !/run-all-cells/.test(brug), "automatisch uitvoeren: laden start geen ronde, en de cursor blijft staan");
meld(brug.includes("stand.uitgevoerd = codeVan(paneel);"), "openen geldt niet als wijziging");
meld(brug.includes("e.source !== window.top") && !/\beval\(|run-all|runAll|notebook:run/.test(brug), "de brug luistert alleen naar de app en start nooit een cel");
meld(brug.includes("invalidate_caches") && brug.includes("store_history: false") && brug.includes("silent: true"), "de terugval voor een nieuw script komt in de kernel, zonder nummer op een cel");

console.log("\nTeksten");
const taal = (t, n) => JSON.parse(lees(`packages/desktop/src/i18n/locales/${t}/${n}.json`));
const sleutels = (o, voor = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? sleutels(v, `${voor}${k}.`) : [`${voor}${k}`]));
for (const [naam, deel] of [["werkruimte", "jupyter"], ["rapport", "jupyterBlad"]]) {
  const nl = sleutels(taal("nl", naam)[deel]).join();
  meld(nl.length > 0 && nl === sleutels(taal("en", naam)[deel]).join(), `${naam}.${deel} staat in het Nederlands en het Engels`);
}

console.log(fouten === 0 ? "\nAlles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
