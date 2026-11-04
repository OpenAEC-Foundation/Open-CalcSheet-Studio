/**
 * Controlescript voor het Marimo-blad, zonder venster:
 *
 *   • het notebook: lezen, opslaan en heropenen (ook als IFCX), wat niet klopt valt weg;
 *   • de cellen uit de tekst van een notebook, en wat daarvan op papier komt;
 *   • de opbouw: de brug start niets uit zichzelf, de omgeving haalt niets van internet,
 *     en de teksten staan in beide talen.
 *
 * Wat alleen in het echte venster kan, staat in scripts/proef-marimo-venster.mjs.
 *
 * Draaien:  node scripts/check-marimo.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bladnaamVoorMarimo, geldigeUitvoer, isMarimoBlad, isMarimoCode, leesMarimoNotebook, marimoCellen, marimoNaarHtml, marimoStartCode,
  MARIMO_BLAD, MARIMO_MAX_TEKENS, MARIMO_MAX_UITVOER,
} from "../packages/desktop/src/store/marimoBlad.ts";
import { isLosBlad } from "../packages/desktop/src/store/spreadsheetBlad.ts";
import { bouwProjectBestand, leesProjectBestand, PROJECT_FORMAAT_VERSIE } from "../packages/desktop/src/store/projectBestand.ts";
import { bladenVoorIfc } from "../packages/desktop/src/store/projectIfcx.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";

const hier = dirname(fileURLToPath(import.meta.url));
const lees = (pad) => readFileSync(join(hier, "..", pad), "utf8");

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) fouten++;
}

const CODE = `import marimo

__generated_with = "0.25.2"
app = marimo.App()


@app.cell
def _():
    import marimo as mo
    return (mo,)


@app.cell(hide_code=True)
def _(mo):
    mo.md("Verborgen <b>code</b>")
    return


@app.cell
def _(
    mo,
    span,
):
    moment = 5.0 * span.value ** 2 / 8

    if moment > 10:
        mo.md("groot")
    return (moment,)


if __name__ == "__main__":
    app.run()
`;

console.log("Het notebook");
meld(isMarimoBlad({ templateId: MARIMO_BLAD }) && !isMarimoBlad({ templateId: "jupyter" }), "de soort herkent zijn bladen");
meld(isLosBlad({ templateId: MARIMO_BLAD }), "een Marimo-blad heeft geen rekentekst en invoer");
const nb = leesMarimoNotebook({ bestandsnaam: "a.py", code: CODE, metCode: false, uitvoer: ["<p>x</p>"] });
meld(nb?.code === CODE && nb.metCode === false && nb.uitvoer[0] === "<p>x</p>" && nb.bestandsnaam === "a.py", "lezen houdt alles");
meld(leesMarimoNotebook(null) === undefined && leesMarimoNotebook({ code: 3 }) === undefined, "geen code: geen notebook");
meld(leesMarimoNotebook({ code: "x".repeat(MARIMO_MAX_TEKENS + 1) }) === undefined, "een te groot notebook valt weg");
meld(leesMarimoNotebook({ code: "x", uitvoer: [1, 2] })?.uitvoer.length === 0, "uitvoer die geen tekst is valt weg, het notebook blijft");
meld(geldigeUitvoer(["x".repeat(MARIMO_MAX_UITVOER + 1)]) === null, "te veel uitvoer wordt niet bewaard");
meld(leesMarimoNotebook({ code: "x" })?.metCode === true, "zonder keuze gaat de code mee op papier");
meld(bladnaamVoorMarimo("C:\\map\\Ligger.py") === "Ligger" && bladnaamVoorMarimo(".py") === "Marimo", "de naam komt uit het bestand");
meld(isMarimoCode(CODE) && !isMarimoCode("print('hallo')\n"), "een gewoon Python-script is geen notebook");

console.log("\nDe cellen");
const cellen = marimoCellen(CODE);
meld(cellen.length === 3, "drie cellen", String(cellen.length));
meld(cellen[0].code === "import marimo as mo", "de functie en de return vallen weg", cellen[0].code);
meld(cellen[1].verborgen && !cellen[0].verborgen, "hide_code wordt herkend");
meld(cellen[2].code === 'moment = 5.0 * span.value ** 2 / 8\n\nif moment > 10:\n    mo.md("groot")', "een functiekop over meer regels, inspringing blijft", cellen[2].code);
meld(marimoCellen(CODE.replace(/\n/g, "\r\n")).length === 3, "regeleinden maken niet uit");
meld(marimoCellen("print('geen notebook')\n").length === 0, "zonder cellen geen cellen");

console.log("\nOp papier");
const html = marimoNaarHtml({ bestandsnaam: "", code: CODE, metCode: true, uitvoer: ["", "<p>uitleg</p>", "<p>groot</p>"] });
meld(html.includes('<pre class="nb-code">import marimo as mo</pre>'), "de code staat erop");
meld(html.includes("<p>uitleg</p>") && html.includes("<p>groot</p>"), "de uitvoer staat erop");
meld(!html.includes("Verborgen"), "verborgen code niet");
const zonder = marimoNaarHtml({ bestandsnaam: "", code: CODE, metCode: false, uitvoer: ["", "<p>uitleg</p>", ""] });
meld(!zonder.includes("nb-code") && zonder.includes("uitleg"), "zonder code: alleen de uitvoer");
const lelijk = marimoNaarHtml({ bestandsnaam: "", code: 'import marimo\n\napp = marimo.App()\n\n@app.cell\ndef _():\n    x = "<script>alert(1)</script>"\n    return\n', metCode: true, uitvoer: [] });
meld(!lelijk.includes("<script>") && lelijk.includes("&lt;script&gt;"), "code wordt geëscapet");
const lang = `import marimo\n\napp = marimo.App()\n\n@app.cell\ndef _():\n${Array.from({ length: 100 }, (_, i) => `    a${i} = ${i}`).join("\n")}\n    return\n`;
meld((marimoNaarHtml({ bestandsnaam: "", code: lang, metCode: true, uitvoer: [] }).match(/nb-code/g) ?? []).length === 3, "een lange cel wordt geknipt: de paginering kapt een te hoog blok af");

console.log("\nOpslaan en heropenen");
const project = {
  versie: PROJECT_FORMAAT_VERSIE,
  naam: "Proef",
  gegevens: legeGegevens(),
  rapport: undefined,
  exemplaren: [{ id: "ex-m", naam: "Notebook", templateId: MARIMO_BLAD, source: "", waarden: {}, marimo: { bestandsnaam: "n.py", code: CODE, metCode: false, uitvoer: ["", "<p>é &amp; ü</p>"] } }],
};
const bestand = bouwProjectBestand(project, bladenVoorIfc(project));
const terug = leesProjectBestand(bestand, "proef.ifccalculation").exemplaren[0];
meld(terug.templateId === MARIMO_BLAD && terug.marimo?.code === CODE, "het notebook komt ongewijzigd terug", JSON.stringify(terug.marimo)?.slice(0, 120));
meld(terug.marimo?.metCode === false && terug.marimo?.bestandsnaam === "n.py", "de keuzes ook");
meld(terug.marimo?.uitvoer[1] === "<p>é &amp; ü</p>", "de uitvoer ook");
const zonderTijd = (s) => s.replace(/"timestamp":\s*"[^"]*"/g, "");
meld(zonderTijd(bouwProjectBestand({ ...project, exemplaren: [terug] }, bladenVoorIfc({ ...project, exemplaren: [terug] }))) === zonderTijd(bestand), "opslaan na heropenen geeft hetzelfde bestand");
const kapot = bestand.replace(/("ocss::blad::marimo":\s*\{[\s\S]*?"uitvoer":\s*)"[^\n]*"/, '$1"geen json"');
meld(leesProjectBestand(kapot, "kapot.ifccalculation").exemplaren[0].marimo?.code === CODE, "onleesbare uitvoer kost het notebook niet");

console.log("\nHet startnotebook");
const start = marimoStartCode({ kop: "Kop", uitleg: 'Uitleg met "aanhalingstekens"' });
meld(isMarimoCode(start), "het is een notebook");
meld(marimoCellen(start).length === 4, "vier cellen");
meld(start.includes('__generated_with = "0.25.2"'), "op de versie van de omgeving");
meld(marimoStartCode({ kop: "a", uitleg: 'b""" + boos()' }).includes('b\\"\\"\\" + boos()'), "tekst kan de string niet uit");

console.log("\nDe omgeving");
const bouw = lees("scripts/bouw-jupyter-omgeving.mjs");
const brug = lees("packages/desktop/jupyter-omgeving/ocss-marimo-brug.js");
meld(/MARIMO_VERSIE = "0\.25\.2"/.test(bouw) && start.includes(`"${bouw.match(/MARIMO_VERSIE = "([^"]+)"/)[1]}"`), "het bouwscript en het startnotebook noemen dezelfde versie");
meld(bouw.includes("data-pyodide-index-url") && bouw.includes("data-pyodide-lockfile-url"), "Python en de pakketlijst komen uit de omgeving, niet van internet");
meld(bouw.includes("auto_instantiate: false"), "niets draait vanzelf bij het openen");
meld(bouw.includes("enabled: false") && bouw.includes("copilot: false"), "de assistent staat uit: die heeft netwerk nodig");
meld(/MARIMO_WIELEN[\s\S]*sha256/.test(bouw), "de extra pakketten staan vast op hash");
meld(brug.includes("e.source !== window.top") && !/\beval\(/.test(brug), "de brug luistert alleen naar de app");
meld(brug.includes("localStorage.removeItem(SLEUTEL)"), "geen oude stand uit de opslag van de webview");
meld(!/run-all|runAll|run_all/.test(brug), "de brug start nooit een cel");
const venster = lees("packages/desktop/src/components/calc/MarimoVenster.tsx");
meld(venster.includes("e.origin !== herkomst") && venster.includes("e.source !== binnen()"), "de app luistert alleen naar zijn eigen iframe");
meld(venster.includes("JUPYTER_RECHTEN"), "dezelfde rechten als een Jupyter-blad");
meld(lees("packages/desktop/jupyter-omgeving/LICENTIES.md").includes("marimo"), "de licentie staat in de lijst");

console.log("\nTeksten");
const taal = (t, n) => JSON.parse(lees(`packages/desktop/src/i18n/locales/${t}/${n}.json`));
const sleutels = (o, voor = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? sleutels(v, `${voor}${k}.`) : [`${voor}${k}`]));
for (const [naam, deel] of [["werkruimte", "marimo"], ["rapport", "marimoBlad"]]) {
  const nl = sleutels(taal("nl", naam)[deel]).join();
  const en = sleutels(taal("en", naam)[deel]).join();
  meld(nl === en && nl.length > 0, `${naam}.${deel} staat in het Nederlands en het Engels`);
}

console.log(fouten === 0 ? "\nAlles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
