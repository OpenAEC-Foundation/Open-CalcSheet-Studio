/**
 * Controle van het spreadsheet-blad.
 *
 * Toetst:
 *   • de lege werkmap van een nieuw blad opent in de rekenkern, en formules
 *     rekenen door na opslaan en opnieuw openen (met de hand nagerekend);
 *   • de werkmap komt byte voor byte terug uit het projectbestand (IFCX), naast
 *     een rekenblad en een PDF-blad, en een ander blad krijgt geen werkmap;
 *   • een spreadsheet-blad wordt niet doorgerekend en krijgt geen rekentekst,
 *     invoer of oordeel, en de STEP noemt het als bijlage met het juiste type;
 *   • oude bestanden en onbruikbare werkmappen blijven leesbaar.
 *
 * Draaien:  node scripts/check-spreadsheet.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { bouwProjectBestand, leesProjectBestand, PROJECT_FORMAAT_VERSIE, normaliseerExemplaar } from "../packages/desktop/src/store/projectBestand.ts";
import { bladenVoorIfc, projectIfcx, projectStep } from "../packages/desktop/src/store/projectIfcx.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";
import {
  bladnaamVoorWerkmap, bewaarOpenWerkmappen, isLosBlad, isSpreadsheetBlad, LEGE_WERKMAP, leesSpreadsheetBestand,
  lijktOpWerkmap, registreerBewaarder, SPREADSHEET_BLAD,
} from "../packages/desktop/src/store/spreadsheetBlad.ts";

const hier = dirname(fileURLToPath(import.meta.url));
const pakket = join(hier, "../node_modules/@betteroffice/xlsx/dist");

let fouten = 0;
function meld(ok, tekst) {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}`);
  if (!ok) fouten++;
}
const dichtbij = (a, b) => Math.abs(a - b) < 1e-9;

console.log("\nDe rekenkern");
const { initWasm, openWorkbook, exportXlsxStructured, isPngExportAvailable } = await import(new URL(`file:///${pakket.replace(/\\/g, "/")}/index.js`).href);
await initWasm(readFileSync(join(pakket, "generated/xlsx_wasm_bg.wasm")));

const leeg = new Uint8Array(Buffer.from(LEGE_WERKMAP, "base64"));
meld(lijktOpWerkmap(leeg), "de lege werkmap is een ZIP-pakket");
const wb = openWorkbook(leeg);
meld(wb.sheetInfo().sheetNames.length === 1, "de lege werkmap heeft één werkblad");

// Staaflijst: gewicht = L × A × 7850 kg/m³. HEA 200: 6 × 5383e-6 × 7850 = 253,5393 kg;
// HEB 300: 4,5 × 14910e-6 × 7850 = 526,69575 kg; samen 780,23505 kg.
const rijen = [
  ["Staaf", "L", "A", "G"],
  ["HEA 200", "6", "5383", "=B2*C2*7850/1000000"],
  ["HEB 300", "4.5", "14910", "=B3*C3*7850/1000000"],
  ["Totaal", "", "", "=SUM(D2:D3)"],
];
rijen.forEach((r, i) => r.forEach((w, k) => { if (w !== "") wb.editCell(0, i, k, w); }));
const bytes = wb.save();
meld(isPngExportAvailable(), "de rekenkern kan naar PNG tekenen, voor op papier");
const png = wb.renderRangePng({ range: "A1:D4", scale: 2 });
meld(png[0] === 0x89 && png[1] === 0x50, "een bereik tekent als PNG");
wb.dispose();

const inhoud = await exportXlsxStructured(new Uint8Array(bytes));
const cel = (a1) => inhoud.sheets[0].cells.find((c) => c.anchor.a1 === a1);
meld(dichtbij(cel("D2").value.value, 253.5393), "HEA 200 weegt 253,5393 kg na opnieuw openen");
meld(dichtbij(cel("D3").value.value, 526.69575), "HEB 300 weegt 526,69575 kg na opnieuw openen");
meld(dichtbij(cel("D4").value.value, 780.23505), "het totaal is 780,23505 kg");
meld(cel("D4").formula === "SUM(D2:D3)", "de formule blijft bewaard, niet alleen de uitkomst");

console.log("\nHet projectbestand");
const DATA = Buffer.from(bytes).toString("base64");
const project = {
  versie: PROJECT_FORMAAT_VERSIE,
  naam: "Proef",
  gegevens: legeGegevens(),
  rapport: undefined,
  exemplaren: [
    { id: "ex-reken", naam: "Reken", templateId: "", source: "a = 2", waarden: {}, elementen: [] },
    { id: "ex-xlsx", naam: "Staaflijst", templateId: SPREADSHEET_BLAD, source: "", waarden: {}, elementen: [], xlsx: { bestandsnaam: "staaflijst.xlsx", data: DATA } },
    { id: "ex-pdf", naam: "Bijlage", templateId: "pdf", source: "", waarden: {}, elementen: [], pdf: { bestandsnaam: "b.pdf", data: "JVBERi0=" } },
  ],
};
const bladen = bladenVoorIfc(project);
const xlsxBlad = bladen.find((b) => b.id === "ex-xlsx");
meld(xlsxBlad.nodes.length === 0 && !xlsxBlad.fout, "een spreadsheet-blad wordt niet doorgerekend");

const tekst = bouwProjectBestand(project, bladen);
const terug = leesProjectBestand(tekst, "proef");
const opId = (id) => terug.exemplaren.find((e) => e.id === id);
meld(opId("ex-xlsx")?.xlsx?.data === DATA, "de werkmap komt byte voor byte terug");
meld(opId("ex-xlsx")?.xlsx?.bestandsnaam === "staaflijst.xlsx", "de bestandsnaam komt terug");
meld(opId("ex-xlsx")?.templateId === SPREADSHEET_BLAD && isSpreadsheetBlad(opId("ex-xlsx")), "het blijft een spreadsheet-blad");
meld(!("xlsx" in opId("ex-reken")) && !("xlsx" in opId("ex-pdf")), "een ander blad krijgt geen werkmap");
meld(opId("ex-pdf")?.pdf?.data === "JVBERi0=", "het PDF-blad ernaast blijft heel");

const doc = projectIfcx(project, bladen);
const knoop = doc.data.find((k) => k.attributes?.["ocss::blad"]?.id === "ex-xlsx");
const attr = knoop.attributes;
meld(attr["ocss::blad"].soort === "spreadsheet", "in het IFCX staat de soort spreadsheet");
meld(attr["ocss::blad::xlsx"].mediaType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "met het mediatype van XLSX");
meld(attr["ocss::blad::xlsx"].grootte === bytes.length, `en de grootte in bytes (${bytes.length})`);
meld(!("ocss::blad::rekentekst" in attr) && !("ocss::blad::invoer" in attr), "zonder rekentekst en invoer");

const step = projectStep(project, bladen);
meld(step.includes("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"), "de STEP noemt het mediatype");
meld(step.includes("'staaflijst.xlsx'"), "de STEP noemt de bestandsnaam");
meld(!step.includes(DATA.slice(0, 40)), "de inhoud van de werkmap staat niet in de STEP");

console.log("\nRanden");
meld(leesSpreadsheetBestand({ bestandsnaam: "a.xlsx", data: "QU\nJD" })?.data === "QUJD", "witruimte in de base64 valt weg");
meld(leesSpreadsheetBestand({ data: 12 }) === undefined && leesSpreadsheetBestand(null) === undefined, "geen werkmap: geen veld");
const zonder = normaliseerExemplaar({ id: "x", naam: "Los", templateId: SPREADSHEET_BLAD }, "n");
meld(isSpreadsheetBlad(zonder) && zonder.xlsx === undefined, "een blad zonder werkmap blijft een spreadsheet-blad");
meld(normaliseerExemplaar({ id: "y", naam: "R", templateId: "", xlsx: { data: "QUJD" } }, "n").xlsx === undefined, "een rekenblad neemt geen werkmap over uit een bestand");
meld(isLosBlad({ templateId: "pdf" }) && isLosBlad({ templateId: SPREADSHEET_BLAD }) && !isLosBlad({ templateId: "balklaag" }), "PDF en spreadsheet zijn losse bladen, een module niet");
meld(!lijktOpWerkmap(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])), "een PDF lijkt niet op een werkmap");
meld(bladnaamVoorWerkmap("C:\\map\\Staaflijst.XLSX") === "Staaflijst" && bladnaamVoorWerkmap(".xlsx") === "Spreadsheet", "de bladnaam komt uit de bestandsnaam");

let bewaard = 0;
const afmelden = registreerBewaarder(async () => { bewaard++; });
registreerBewaarder(async () => { throw new Error("proef"); })();
await bewaarOpenWerkmappen();
afmelden();
await bewaarOpenWerkmappen();
meld(bewaard === 1, "opslaan vraagt een open editor om zijn stand, en daarna niet meer");

console.log(fouten === 0 ? "\nAlles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
