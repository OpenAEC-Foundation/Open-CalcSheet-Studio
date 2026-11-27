/**
 * De teksthoofdstukken van het rapport als modules (templates/rapport-tekst.ts): Inleiding,
 * Projectgegevens en Constructie. Gewone rekentekst met keuzes als invoer; de projectgegevens
 * en `adviseur` (een tekst via `#global`) staan in de tekst.
 *
 * Draaien:  node scripts/check-rapport-modules.mjs   (vereist een gebouwde core)
 */
import { parse, evaluateMetScope, render, globaleNamen, globaleRegels, waardeAlsRekentekst } from "../packages/core/dist/index.js";
import { rapportInleiding, rapportProjectgegevens, rapportConstructie } from "../packages/desktop/src/templates/rapport-tekst.ts";
import { RAPPORT_MODULES, koppenUitBron, titelUitBron } from "../packages/desktop/src/rapport/uitBladen.ts";
import { globalenVan } from "../packages/desktop/src/rekenen/globalen.ts";

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};
const gelijk = (wat, kreeg, verwacht) => meld(JSON.stringify(kreeg) === JSON.stringify(verwacht), wat, `${JSON.stringify(kreeg)} ≠ ${JSON.stringify(verwacht)}`);

const project = { project_naam: "Aanbouw Dorpsstraat", project_nummer: "1234", locatie: "Rosmalen", opdrachtgever: "Jansen", constructeur: "A. de Vries" };
/** De tekst op papier: zonder wat alleen op het scherm staat (#pre). */
const papier = (bron, waarden = {}, adviseur = "Bureau X") => {
  const r = evaluateMetScope(parse(bron), waarden, project, { project: { bron: `adviseur = ${JSON.stringify(adviseur)}` } });
  const html = render(r.nodes).replace(/<[^>]*class="[^"]*alleen-scherm[^"]*"[^>]*>[\s\S]*?<\/[a-z0-9]+>/g, "");
  return { tekst: html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "), html, scope: r.scope };
};

console.log("Tekst als globale variabele");
gelijk("een tekst als rekentekst", waardeAlsRekentekst('Bureau "X" BV'), '"Bureau \\"X\\" BV"');
const g = globalenVan([{ naam: "Projectgegevens", source: rapportProjectgegevens, waarden: {} }], { scope: project, evalOpties: {} });
gelijk("Projectgegevens geeft adviseur aan elk blad", g.bron, 'adviseur = "het adviesbureau"');
gelijk("en niets anders", globaleNamen(rapportProjectgegevens), ["adviseur"]);

console.log("\nInleiding");
const inl = papier(rapportInleiding);
meld(inl.tekst.includes("project Aanbouw Dorpsstraat brengt Bureau X op verzoek"), "de projectnaam en de adviseur staan in de tekst", inl.tekst.slice(0, 200));
meld(inl.tekst.includes("hoofdberekening") && inl.tekst.includes("Sondering en funderingsadvies"), "standaard: de hoofdberekening met de lijst");
const inl2 = papier(rapportInleiding, { omvang: "2" });
meld(inl2.tekst.includes("uitgangspunten van de constructie") && !inl2.tekst.includes("Sondering"), "keuze 2: alleen de uitgangspunten");
gelijk("geen genummerde paragrafen", koppenUitBron(rapportInleiding), []);

console.log("\nProjectgegevens");
gelijk("twee paragrafen", koppenUitBron(rapportProjectgegevens), ["Projectomschrijving", "Rol binnen het project en bereik rapport"]);
const pg = papier(rapportProjectgegevens, { soort: "4", opdracht: "2" });
meld(pg.tekst.includes("verbouwing van een bestaand pand"), "de gekozen projectomschrijving");
meld(pg.tekst.includes("Project: 1234 Aanbouw Dorpsstraat") && pg.tekst.includes("Opdrachtgever: Jansen") && pg.tekst.includes("Constructeur: A. de Vries"), "de projectgegevens", pg.tekst);
meld(pg.tekst.includes("heeft opdracht voor het toetsen"), "de gekozen opdracht");
gelijk("de eigen adviseur wint in het blad zelf", pg.scope.adviseur, "het adviesbureau");

console.log("\nConstructie");
gelijk("twee paragrafen", koppenUitBron(rapportConstructie), ["Toelichting constructie", "Aandachtspunten bij uitvoering"]);
const verbouw = papier(rapportConstructie, { verticaal: "3", fundatie: "3", wijziging: "2" });
meld(verbouw.tekst.includes("Bestaande situatie") && verbouw.tekst.includes("betonvloeren") && verbouw.tekst.includes("op palen gefundeerd"), "verbouw: de bestaande situatie volgens de keuzes");
meld(verbouw.tekst.includes("houten balklaag als dak") && verbouw.tekst.includes("voldoende stempelen"), "verbouw: de wijziging en de aandachtspunten");
const nieuw = papier(rapportConstructie, { werk: "2", fundering: "2" });
meld(nieuw.tekst.includes("Constructieprincipe") && !nieuw.tekst.includes("Bestaande situatie") && nieuw.tekst.includes("Kalenderstaten"), "nieuwbouw: constructieprincipe en de aandachtspunten voor palen", nieuw.tekst.slice(0, 300));

console.log("\nAls onderdeel van het rapport");
gelijk("elke module is een hoofdstuk", RAPPORT_MODULES, { "rapport-inleiding": "hoofdstuk", "rapport-projectgegevens": "hoofdstuk", "rapport-constructie": "hoofdstuk" });
gelijk("de titels", [rapportInleiding, rapportProjectgegevens, rapportConstructie].map(titelUitBron), ["Inleiding", "Projectgegevens", "Constructie"]);
for (const [naam, bron] of [["Inleiding", rapportInleiding], ["Projectgegevens", rapportProjectgegevens], ["Constructie", rapportConstructie]]) {
  const p = papier(bron);
  meld(!/\b(Soort project|Omvang van dit rapport|Soort werk)\b/.test(p.tekst) || p.html.includes("alleen-scherm"), `${naam}: de keuzes staan niet op papier`);
}

console.log(fouten ? `\n${fouten} fout(en)` : "\nAlles in orde");
process.exit(fouten ? 1 : 0);
