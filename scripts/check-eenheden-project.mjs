/**
 * Het eenhedenstelsel van een project (docs/superpowers/specs/2026-11-06-eenheden-design.md,
 * stap 2): de keuze in de projectgegevens, de eigen eenheden van het project, en de weg
 * naar de uitwerking.
 *
 * Draaien:  node scripts/check-eenheden-project.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { evalOptiesVan, eigenNamenVan, GROOTHEID_KEUZES } from "../packages/desktop/src/store/projectEenheden.ts";
import { PROJECT_VELDEN, projectScope, legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";
import { rekenUitwerking } from "../packages/desktop/src/components/calc/canvasRekenen.ts";

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};

console.log("De keuze in de projectgegevens");
const veld = PROJECT_VELDEN.find((v) => v.naam === "eenheden");
meld(veld?.type === "keuze" && veld?.standaard === "blad", "een keuzeveld 'eenheden' met standaard 'Zoals in het blad'", JSON.stringify(veld));
meld(!("eenheden" in projectScope(legeGegevens())), "de keuze komt niet als variabele in de bladen");
meld(evalOptiesVan({}).stelsel === undefined, "een oud project zonder de keuze: geen stelsel");
meld(evalOptiesVan({ eenheden: "us" }).stelsel?.kracht === "kip", "US customary: kracht in kip");
const eigen = evalOptiesVan({ eenheden: "eigen", eenheden_eigen: '{"kracht":"N"}' }).stelsel;
meld(eigen?.kracht === "N" && eigen?.maat === "mm", "eigen keuze: kracht in N, de rest zoals SI (mm)", JSON.stringify(eigen));
let kapot;
try {
  kapot = evalOptiesVan({ eenheden: "eigen", eenheden_eigen: "{kapot", eenheden_lijst: "[kapot" });
} catch (err) {
  kapot = String(err);
}
meld(kapot?.stelsel?.maat === "mm" && kapot?.eigenEenheden?.length === 0, "kapotte JSON geeft geen fout en geldt als leeg", JSON.stringify(kapot));
meld(Object.keys(GROOTHEID_KEUZES).length === 13 && GROOTHEID_KEUZES.kracht.includes("kip"), "keuzes per grootheid, met kip bij kracht");

console.log("\nEigen eenheden van het project");
const project = { eenheden_lijst: JSON.stringify([{ naam: "kipf", uitdrukking: "1000 lbf" }]) };
meld(JSON.stringify(eigenNamenVan(project)) === '["kipf"]', "de namen voor het lezen van de bladen", JSON.stringify(eigenNamenVan(project)));
meld(eigenNamenVan({ eenheden_lijst: "[kapot" }).length === 0, "kapotte lijst: geen namen");

console.log("\nDe uitwerking");
const us = rekenUitwerking("L = 4.5 m", {}, {}, {}, undefined, evalOptiesVan({ eenheden: "us" }));
meld(/ft/.test(us.html) && !/\bm\b/.test(us.html.replace(/<[^>]*>/g, " ").replace(/\\[a-z]+/g, "")), "een blad in US customary toont ft", us.html.slice(0, 200));
const zonder = rekenUitwerking("L = 4.5 m", {}, {}, {});
meld(zonder.html === rekenUitwerking("L = 4.5 m", {}, {}, {}, undefined, evalOptiesVan({})).html, "zonder keuze dezelfde uitwerking als zonder opties");
const kipf = rekenUitwerking("F = 2 kipf\nG = F to kN", {}, {}, { eenheden: eigenNamenVan(project) }, undefined, evalOptiesVan(project));
meld(/8\.896/.test(kipf.html), "een eigen eenheid van het project geldt in het blad: 2 kipf = 8.896 kN", kipf.html.slice(0, 300));
const ongeldig = { eenheden_lijst: JSON.stringify([{ naam: "x", uitdrukking: "3" }]) };
let breekt = false;
let html = "";
try {
  html = rekenUitwerking("a = 2", {}, {}, { eenheden: eigenNamenVan(ongeldig) }, undefined, evalOptiesVan(ongeldig)).html;
} catch {
  breekt = true;
}
meld(!breekt && /2/.test(html), "een ongeldige eigen eenheid van het project breekt het blad niet");

if (fouten > 0) {
  console.error(`\nEenheden van het project: ${fouten} afwijking(en).`);
  process.exit(1);
}
console.log("\nEenheden van het project: alles klopt.");
