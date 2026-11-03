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
 *   • oude bestanden en onbruikbare werkmappen blijven leesbaar;
 *   • het gereedschap, met de hand nagerekend: =A1*B1, PRODUCT en de andere
 *     functies, relatieve verwijzingen na kopiëren en doorvoeren, verwijzingen na
 *     rijen en kolommen invoegen en verwijderen, sorteren, cellen aanwijzen, het
 *     klembord en de maten, en dat elke bewerking één stap ongedaan maken is;
 *   • de vellen: de lijnen in het raster en de afdruk rekenen hetzelfde, en elke
 *     getekende afbeelding past op zijn vel.
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
import {
  bereikA1, bereikTussen, bereikVoorstel, breedtePx, breedteTekens, doelBereik, functieTekst, FUNCTIES, heeftKoprij, hoogtePunten,
  hoogtePx, invoerVoorKern, leesHtmlTabel, leesNederlands, leesTsv, magVerwijzingHier, naarHtml, naarTsv, ontleedAdres, ontleedBereik,
  richtingNaar, somPlan, sorteerVolgorde, verschuifFormule, verwijzingenIn, vulLijn, zelfdeTekst, zetVerwijzing,
} from "../packages/desktop/src/components/calc/spreadsheetLogica.ts";
import { KOP_RUIMTE, MAX_VELLEN, MM_PER_PX, NAAM_RUIMTE, velLijnen, verdeelRijen, verdeelWerkmap } from "../packages/desktop/src/components/calc/spreadsheetVellen.ts";
import { MATEN, SPELING } from "../packages/desktop/src/components/calc/paginering.ts";

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

console.log("\nFormules in de rekenkern");
const proef = openWorkbook(leeg);
const sheetId = proef.sheetInfo().sheetIds[0];
const lees = (a1) => proef.readCells({ ranges: [{ sheetId, range: { kind: "a1", a1 } }] }).ranges[0].cells[0][0];
const getal = (a1) => lees(a1).value.value;
const zet = (a1, invoer) => { const c = ontleedAdres(a1); proef.editCell(0, c.row, c.col, invoer); };
// Nagerekend: A1 = 2, B1 = 3, A2 = 4, B2 = 5.
zet("A1", "2"); zet("B1", "3"); zet("A2", "4"); zet("B2", "5");
zet("C1", "=A1*B1");
meld(getal("C1") === 6, "=A1*B1 is 2 × 3 = 6");
zet("D1", "=PRODUCT(A1:B2)");
meld(getal("D1") === 120, "=PRODUCT(A1:B2) is 2 × 3 × 4 × 5 = 120");
const functies = [
  ["SUM(A1:B2)", 14, "SUM is 2 + 3 + 4 + 5 = 14"],
  ["AVERAGE(A1:B2)", 3.5, "AVERAGE is 14 / 4 = 3,5"],
  ["MIN(A1:B2)", 2, "MIN is 2"],
  ["MAX(A1:B2)", 5, "MAX is 5"],
  ["COUNT(A1:B2)", 4, "COUNT is 4 getallen"],
  ["IF(A1>1,10,20)", 10, "IF: 2 > 1, dus 10"],
  ["ROUND(1.2345,2)", 1.23, "ROUND(1,2345; 2) is 1,23"],
  ["ABS(-3)", 3, "ABS(-3) is 3"],
];
for (const [f, verwacht, tekst] of functies) { zet("E1", `=${f}`); meld(dichtbij(getal("E1"), verwacht), tekst); }
zet("E1", "");
meld(FUNCTIES.length === 9 && FUNCTIES.every((f) => functies.some(([t]) => t.startsWith(f)) || f === "PRODUCT"), "de functiekiezer heeft precies de nagerekende functies");

console.log("\nVerwijzingen na kopiëren en doorvoeren");
meld(verschuifFormule("A1*B1", 1, 0) === "A2*B2", "een rij omlaag: =A1*B1 wordt =A2*B2");
meld(verschuifFormule("A1*B1", 0, 2) === "C1*D1", "twee kolommen naar rechts: =A1*B1 wordt =C1*D1");
meld(verschuifFormule("$A1*B$1", 3, 1) === "$A4*C$1", "absolute delen blijven staan");
meld(verschuifFormule("SUM(A1:B2)", 2, 1) === "SUM(B3:C4)", "een bereik schuift als geheel");
meld(verschuifFormule('IF(A1>0,"B2",C3)', 1, 0) === 'IF(A2>0,"B2",C4)', "tekst tussen aanhalingstekens blijft staan");
meld(verschuifFormule("LOG10(A1)+A1B", 1, 0) === "LOG10(A2)+A1B", "een functienaam of ander woord is geen verwijzing");
meld(verschuifFormule("'Blad 1'!A1+Blad2!B2", 1, 0) === "'Blad 1'!A2+Blad2!B3", "een bladnaam blijft staan, de verwijzing erachter schuift");
meld(verschuifFormule("SUM(B:B)+SUM(2:2)", 1, 1) === "SUM(C:C)+SUM(3:3)", "hele kolommen en rijen schuiven mee");
meld(verschuifFormule("A1", -1, 0) === "#REF!", "buiten het werkblad wordt het #REF!");

// De volledige weg: uit de rekenkern lezen, verschuiven en terugzetten. C1 = A1*B1 naar C2: 4 × 5 = 20.
const leesCel = (a1) => { const c = lees(a1); return { waarde: c.value, formule: c.formula }; };
const zetOps = (naar, cel) => ({ type: "setCell", sheet: 0, at: ontleedAdres(naar), cell: cel.formule !== null ? { formula: cel.formule } : { value: cel.waarde } });
proef.applyOps([zetOps("C2", { ...leesCel("C1"), formule: verschuifFormule(leesCel("C1").formule, 1, 0) })]);
meld(lees("C2").formula === "A2*B2" && getal("C2") === 20, "C1 gekopieerd naar C2: =A2*B2 is 4 × 5 = 20");
proef.undo();
meld(lees("C2").formula === null && lees("C2").displayText === "", "ongedaan maken haalt het weg");

// Doorvoeren omlaag: =A1*2 in F1 naar F2 en F3 is 2×2, 4×2 en (lege A3) 0.
zet("F1", "=A1*2");
const lijn = vulLijn([leesCel("F1")], [1, 2], (afstand) => ({ rijen: afstand, kolommen: 0 }));
meld(lijn[0].formule === "A2*2" && lijn[1].formule === "A3*2", "doorvoeren omlaag schuift per rij: =A2*2, =A3*2");
const stappenVoor = proef.historyState().undoDepth;
proef.patchRangeStyle(0, "F1", { bold: true });
const opmaakBron = proef.captureFormat(0, "F1");
proef.applyOps([zetOps("F2", lijn[0]), zetOps("F3", lijn[1]), { type: "applyRangeFormat", sheet: 0, range: { start: ontleedAdres("F2"), end: ontleedAdres("F3") }, format: opmaakBron }]);
meld(getal("F2") === 8 && getal("F3") === 0, "F2 = 4 × 2 = 8, F3 = 0 × 2 = 0");
meld(proef.selectionFormatting(0, "F3").bold === true, "de opmaak gaat mee: setCell vóór de opmaak in de lijst");
meld(proef.historyState().undoDepth === stappenVoor + 2, "cellen en opmaak samen zijn één stap ongedaan maken");
proef.undo();
meld(lees("F2").formula === null && lees("F3").formula === null, "één keer ongedaan maken haalt alles weg");
proef.undo();
const naarRechts = vulLijn([{ waarde: { kind: "empty" }, formule: "A1+1" }], [1], (afstand) => ({ rijen: 0, kolommen: afstand }));
meld(naarRechts[0].formule === "B1+1", "doorvoeren naar rechts schuift per kolom");

const getalBron = (value) => ({ waarde: { kind: "number", value }, formule: null });
const reeks = vulLijn([getalBron(1), getalBron(3)], [2, 3, -1], () => ({ rijen: 0, kolommen: 0 }), true);
meld(reeks.map((c) => c.waarde.value).join() === "5,7,-1", "de vulgreep zet 1, 3 voort: 5, 7, en ervoor -1");
const kommareeks = vulLijn([getalBron(0.1), getalBron(0.2)], [2], () => ({ rijen: 0, kolommen: 0 }), true);
meld(kommareeks[0].waarde.value === 0.3, "zonder rekenruis: 0,1, 0,2 gaat door met precies 0,3");
meld(vulLijn([getalBron(4)], [1, 2], () => ({ rijen: 0, kolommen: 0 }), true).every((c) => c.waarde.value === 4), "één getal herhaalt zich");
const weken = vulLijn([{ waarde: { kind: "text", value: "Week 1" }, formule: null }], [1, 2], () => ({ rijen: 0, kolommen: 0 }), true);
meld(weken[1].waarde.value === "Week 3", "tekst met een getal telt door: Week 1, 2, 3");
const herhaal = vulLijn([getalBron(1), getalBron(2)], [2, 3], () => ({ rijen: 0, kolommen: 0 }));
meld(herhaal.map((c) => c.waarde.value).join() === "1,2", "doorvoeren zonder reeks herhaalt de bron");
meld(JSON.stringify(richtingNaar({ top: 0, left: 0, bottom: 0, right: 0 }, { row: 3, col: 1 })) === '{"richting":"omlaag","aantal":3}', "de vulgreep kiest de grootste afstand");
meld(JSON.stringify(doelBereik({ top: 2, left: 1, bottom: 3, right: 1 }, "omhoog", 2)) === '{"top":0,"left":1,"bottom":1,"right":1}', "vullen omhoog: het bereik erboven");

console.log("\nRijen en kolommen invoegen en verwijderen");
const invoer = (a1) => { const c = ontleedAdres(a1); return proef.cell(0, c.row, c.col).input; };
proef.applyOps([{ type: "insertRows", sheet: 0, at: 0, count: 1 }]);
meld(invoer("C2") === "=A2*B2" && getal("C2") === 6, "een rij erboven: =A1*B1 wordt =A2*B2, nog steeds 6");
meld(invoer("D2") === "=PRODUCT(A2:B3)" && getal("D2") === 120, "het bereik schuift mee, nog steeds 120");
proef.undo();
meld(invoer("C1") === "=A1*B1", "ongedaan maken zet het terug");
proef.applyOps([{ type: "insertRows", sheet: 0, at: 1, count: 2 }]);
meld(invoer("D1") === "=PRODUCT(A1:B4)" && getal("D1") === 120, "rijen midden in een bereik: het bereik groeit mee en de uitkomst blijft 120");
proef.undo();
proef.applyOps([{ type: "insertCols", sheet: 0, at: 1, count: 1 }]);
meld(invoer("D1") === "=A1*C1" && getal("D1") === 6, "een kolom ertussen: =A1*C1");
proef.undo();
proef.applyOps([{ type: "deleteRows", sheet: 0, at: 1, count: 1 }]);
meld(invoer("D1") === "=PRODUCT(A1:B1)" && getal("D1") === 6, "rij 2 weg: het bereik krimpt, 2 × 3 = 6");
proef.undo();
proef.applyOps([{ type: "deleteCols", sheet: 0, at: 0, count: 1 }]);
meld(invoer("B1").includes("#REF!") && lees("B1").value.kind === "error", "de kolom weg waar een formule naar wijst: #REF!, geen stille uitkomst");
proef.undo();
meld(invoer("C1") === "=A1*B1" && getal("D1") === 120, "en terug");
zet("J1", "7"); zet("J2", "=J1*2");
proef.moveRange(0, "J1", "K1");
meld(invoer("J2") === "=K1*2" && getal("J2") === 14, "knippen en plakken: verwijzingen naar de verplaatste cel gaan mee, 7 × 2 = 14");
proef.undo();
let geweigerd = false;
try { proef.moveRange(0, "A1", "H1"); } catch { geweigerd = true; }
meld(geweigerd, "een cel uit een bereik verplaatsen weigert de rekenkern; spreadsheetKlembord.ts valt dan terug op kopiëren en leegmaken");
zet("J2", ""); zet("J1", "");

console.log("\nSorteren");
const waarde = (value) => ({ kind: "number", value });
const tekstW = (value) => ({ kind: "text", value });
const leegW = { kind: "empty" };
const tabel = [[waarde(3), tekstW("c")], [waarde(1), tekstW("a")], [leegW, tekstW("x")], [waarde(2), tekstW("b")]];
meld(sorteerVolgorde(tabel, 0, false).join() === "1,3,0,2", "oplopend op getal, lege cellen onderaan");
meld(sorteerVolgorde(tabel, 0, true).join() === "0,3,1,2", "aflopend, lege cellen nog steeds onderaan");
meld(sorteerVolgorde([[tekstW("HEA 200")], [tekstW("HEA 100")], [waarde(5)]], 0, false).join() === "2,1,0", "getallen voor tekst, tekst op alfabet en getal");
meld(heeftKoprij([[tekstW("Staaf"), tekstW("L")], [tekstW("HEA"), waarde(6)]]), "een tekstregel boven getallen is een kopregel");
meld(!heeftKoprij([[waarde(1)], [waarde(2)]]), "getallen bovenaan zijn geen kopregel");
meld(verschuifFormule("A2*2", 2, 0) === "A4*2", "een formule verhuist mee met zijn rij");

console.log("\nCellen aanwijzen in een formule");
meld(magVerwijzingHier("=", 1), "na = kan een verwijzing");
meld(magVerwijzingHier("=A1*", 4), "na een bewerking ook");
meld(magVerwijzingHier("=SUM(", 5) && magVerwijzingHier("=SUM(A1,", 8) && magVerwijzingHier("=SUM(A1:", 8), "na ( , en : ook");
meld(magVerwijzingHier("=SUM()", 5), "tussen de haakjes ook");
meld(!magVerwijzingHier("=A1", 3), "na een verwijzing niet: de formule is daar af");
meld(!magVerwijzingHier("=A1*2", 5), "na een getal niet");
meld(!magVerwijzingHier("=SUM(A1)", 8), "na ) niet");
meld(!magVerwijzingHier("=|A1".replace("|", ""), 1), "vlak voor een bestaande verwijzing niet");
meld(!magVerwijzingHier('="a+', 4), "in tekst niet");
meld(!magVerwijzingHier("12", 2), "in gewone tekst niet");
meld(magVerwijzingHier("=SUM(A1:A3)", 5, 10), "wel over een selectie: die wordt vervangen");
meld(zetVerwijzing("=A1*", 4, 4, "B1").tekst === "=A1*B1", "de verwijzing komt op de cursorplek");
const geplaatst = zetVerwijzing("=SUM(A1)", 5, 7, "A1:B3");
meld(geplaatst.tekst === "=SUM(A1:B3)" && geplaatst.eind === 10, "slepen vervangt de vorige verwijzing door het bereik");
meld(bereikA1(bereikTussen({ row: 2, col: 1 }, { row: 0, col: 0 })) === "A1:B3", "het bereik is genormaliseerd, ook omhoog gesleept");
const gevonden = verwijzingenIn('=A1*SUM($B$2:C3)+"D4"+Blad2!E5');
meld(gevonden.length === 3 && gevonden[1].bereik.bottom === 2 && gevonden[2].blad === "Blad2", "de verwijzingen in een formule voor de kaders; tekst telt niet");
const sporen = verwijzingenIn("=SUM(B:C)+SUM(2:4)");
meld(sporen.length === 2 && sporen[0].bereik.left === 1 && sporen[0].bereik.right === 2 && sporen[0].bereik.bottom === 1_048_575, "een hele kolom krijgt ook een kader");
meld(sporen[1].bereik.top === 1 && sporen[1].bereik.bottom === 3 && sporen[1].bereik.right === 16_383, "een hele rij ook");
meld(verwijzingenIn("=A1").length === 1 && verwijzingenIn("=LOG10(5)").length === 0, "een functienaam is geen verwijzing");

console.log("\nInvoer zoals die getypt wordt");
meld(invoerVoorKern("1,5") === "1.5" && invoerVoorKern("1.234,5") === "1234.5" && invoerVoorKern("12,5%") === "12.5%", "een decimaalkomma wordt een punt");
meld(invoerVoorKern("1.234") === "1.234" && invoerVoorKern("HEA 200,5") === "HEA 200,5", "de rest blijft zoals getypt");
meld(invoerVoorKern("=IF(A1>1,5;1;0)") === "=IF(A1>1.5,1,0)", "; tussen argumenten: de komma is dan decimaal");
meld(invoerVoorKern("=ROUND(A1,2)") === "=ROUND(A1,2)", "zonder ; blijft een komma tussen haakjes een scheidingsteken");
meld(invoerVoorKern("=A1*1,5") === "=A1*1.5", "buiten haakjes is een komma tussen cijfers decimaal");
meld(invoerVoorKern('=IF(A1>1;"a;b";"c")') === '=IF(A1>1,"a;b","c")', "tekst in een formule blijft staan");
meld(invoerVoorKern("=SUM(A1,B1)") === "=SUM(A1,B1)" && invoerVoorKern("=SUM(A1;B1)") === "=SUM(A1,B1)", "een verwijzing is geen cijfer: A1,B1 blijft");
zet("G1", invoerVoorKern("=IF(A1>1,5;10;20)"));
meld(getal("G1") === 10, "de rekenkern leest het: 2 > 1,5, dus 10");
zet("G1", invoerVoorKern("1,5"));
meld(getal("G1") === 1.5, "en 1,5 is een getal");
zet("G1", "");

console.log("\nFuncties en voorstellen");
const raster = { "0:0": waarde(1), "1:0": waarde(2), "2:0": waarde(3), "3:0": leegW, "5:1": waarde(4), "5:2": waarde(5) };
const uitRaster = ({ row, col }) => raster[`${row}:${col}`] ?? leegW;
meld(bereikA1(bereikVoorstel({ row: 3, col: 0 }, uitRaster)) === "A1:A3", "AutoSom onder getallen: het bereik erboven");
meld(bereikA1(bereikVoorstel({ row: 5, col: 3 }, uitRaster)) === "B6:C6", "en anders links ervan");
meld(bereikVoorstel({ row: 9, col: 9 }, uitRaster) === null, "zonder getallen geen voorstel");
const som = functieTekst("SUM", ontleedBereik("A1:A3"), null);
meld(som.tekst === "=SUM(A1:A3)" && som.tekst.slice(som.begin, som.eind) === "A1:A3", "het voorstel staat geselecteerd in de formule");
meld(functieTekst("PRODUCT", null, null).tekst === "=PRODUCT()", "zonder voorstel: de cursor tussen de haakjes");
meld(functieTekst("IF", null, { row: 0, col: 0 }).tekst === "=IF(A1>0,1,0)", "IF krijgt de cel ernaast als voorwaarde");
meld(functieTekst("ROUND", null, { row: 0, col: 1 }).tekst === "=ROUND(B1,2)", "ROUND ook");
meld(functieTekst("ABS", null, { row: 1, col: 0 }).tekst === "=ABS(A2)", "ABS ook");
const plan = somPlan({ top: 0, bottom: 2, left: 0, right: 0 }, uitRaster);
meld(plan.rij === 3 && plan.tot === 2, "op een gevulde selectie komt de som eronder");
const planLeeg = somPlan({ top: 0, bottom: 3, left: 0, right: 0 }, uitRaster);
meld(planLeeg.rij === 3 && planLeeg.tot === 2, "is de laatste cel leeg, dan daarin");
const planBezet = somPlan({ top: 0, bottom: 1, left: 0, right: 0 }, uitRaster);
meld(planBezet.rij === 3 && planBezet.tot === 1, "wat eronder staat blijft staan: de som komt in de eerste lege rij, over de selectie");

console.log("\nHet klembord als tekst");
meld(naarTsv([["a", "1"], ["b\tc", 'd"e']]) === 'a\t1\r\n"b\tc"\t"d""e"', "tabgescheiden, met aanhalingstekens waar nodig");
meld(JSON.stringify(leesTsv('a\t1\r\n"b\tc"\t"d""e"\r\n')) === JSON.stringify([["a", "1"], ["b\tc", 'd"e']]), "en weer terug");
meld(JSON.stringify(leesTsv("1\t2\n3")) === JSON.stringify([["1", "2"], ["3", ""]]), "een kortere rij wordt aangevuld");
meld(zelfdeTekst("a\r\nb\r\n", "a\nb"), "regeleinden tellen niet bij het herkennen van een eigen kopie");
const htmlTabel = naarHtml([[{ tekst: "a<b", vet: true }, { tekst: "1,5", ruw: 1.5 }]]);
meld(htmlTabel.includes("a&lt;b") && htmlTabel.includes('x:num="1.5"') && htmlTabel.includes("font-weight:bold"), "HTML met opmaak en de ruwe waarde");
meld(JSON.stringify(leesHtmlTabel(htmlTabel)) === JSON.stringify([["a<b", "1.5"]]), "een HTML-tabel terug naar cellen; de ruwe waarde gaat voor");
meld(JSON.stringify(leesHtmlTabel('<table><tr><td rowspan="2">x</td><td>y</td></tr><tr><td>z</td></tr></table>')) === JSON.stringify([["x", "y"], ["", "z"]]), "samengevoegde cellen worden uitgevouwen");
meld(leesHtmlTabel("<p>geen tabel</p>") === null, "geen tabel: de platte tekst telt");
meld(leesNederlands("1,5").invoer === "1.5" && leesNederlands("1.234,50").invoer === "1234.5", "getallen van buiten met een komma");
meld(leesNederlands("12,5%").invoer === "0.125" && leesNederlands("12,5%").notatie === "0.0%", "percentages");
meld(leesNederlands("26-10-2026").invoer === "46321", "datums: 26-10-2026 is dag 46321");
meld(leesNederlands("abc") === null && leesNederlands("=A1") === null && leesNederlands("1.5") === null, "de rest blijft zoals het is");

console.log("\nMaten");
const breedte = (k) => proef.cellPosition(0, 0, k + 1).x - proef.cellPosition(0, 0, k).x;
const hoogte = (r) => proef.cellPosition(0, r + 1, 0).y - proef.cellPosition(0, r, 0).y;
proef.applyOps([{ type: "setColWidth", sheet: 0, col: 0, width: 20 }, { type: "setRowHeight", sheet: 0, row: 0, height: 30 }]);
meld(dichtbij(breedte(0), breedtePx(20)) || Math.abs(breedte(0) - breedtePx(20)) < 0.01, "een kolom van 20 tekens is 7 × 20 + 5 = 145 px, zoals gerekend");
meld(Math.abs(hoogte(0) - hoogtePx(30)) < 0.01, "een rij van 30 punten is 40 px, zoals gerekend");
meld(Math.abs(breedteTekens(breedte(0)) - 20) < 0.01 && hoogtePunten(hoogte(0)) === 30, "en terug naar tekens en punten");
proef.undo();
meld(proef.cellRect(0, 0, 0).h === 20, "cellen en opmaak samen zijn één stap: ook breedte en hoogte");

proef.applyOps([{ type: "setFreezePane", sheet: 0, pane: { rows: 1, cols: 0, top_left: { row: 1, col: 0 } } }]);
meld(proef.sheetInfo().frozenRows === 1, "de bovenste rij vastzetten");
proef.undo();
meld(proef.sheetInfo().frozenRows === 0, "en ongedaan maken");

let meldingen = 0;
const stopMelden = proef.onUpdate(() => { meldingen++; });
zet("H1", "1");
proef.applyOps([{ type: "insertRows", sheet: 0, at: 0, count: 1 }]);
proef.moveRange(0, "H2", "I2");
proef.undo();
proef.redo();
stopMelden();
meld(meldingen === 5, "elke bewerking meldt zich: invoer, invoegen, verplaatsen, ongedaan en opnieuw komen in het project");
proef.undo();
proef.undo();
proef.undo();

const opgeslagen = proef.save();
const heropend = await exportXlsxStructured(new Uint8Array(opgeslagen));
meld(heropend.sheets[0].cells.find((c) => c.anchor.a1 === "D1").formula === "PRODUCT(A1:B2)", "na opslaan en openen staat de formule er nog");
proef.dispose();

console.log("\nDe vellen op papier en in het raster");
const SPIEGEL = { breedte: MATEN.bladen.inhoud.breedte, hoogte: MATEN.bladen.inhoud.hoogte - SPELING };
meld(SPIEGEL.breedte === 178 && SPIEGEL.hoogte === 249, "de losse uitdraai: 210 − 2 × 16 = 178 mm breed, 297 − 24 − 20 − 4 = 249 mm hoog");
const pngGrootte = (png) => { const v = new DataView(png.buffer, png.byteOffset, png.byteLength); return { b: v.getUint32(16), h: v.getUint32(20) }; };
const nieuweWerkmap = (vul) => { const w = openWorkbook(leeg); vul(w); return w; };
const stukkenTekst = (blad) => blad.stukken.map((s) => `${s.van + 1}-${s.tot + 1}`).join(" ");

/**
 * Tekent elk stuk zoals spreadsheetBlad.ts dat doet en legt het naast de berekening: de
 * afbeelding past op het vel, en er had geen rij meer bij gepast.
 */
function tegenAfbeeldingen(w, spiegel) {
  const verdeling = verdeelWerkmap(w, spiegel);
  let vel = 0;
  let klopt = true;
  for (const blad of verdeling.bladen) {
    w.setActiveSheet(blad.index);
    const metNaam = verdeling.bladen.length > 1;
    blad.stukken.forEach((stuk, i) => {
      const png = pngGrootte(w.renderRangePng({ range: bereikA1({ ...blad.bereik, top: stuk.van, bottom: stuk.tot }), scale: blad.tekenschaal }));
      const mm = (px) => (px / blad.tekenschaal) * MM_PER_PX * blad.schaal;
      const ruimte = spiegel.hoogte - (vel === 0 ? KOP_RUIMTE : 0) - (metNaam ? NAAM_RUIMTE : 0);
      // De afbeelding rondt op hele pixels af, ten hoogste 0,13 mm; daarvoor is de speling van 4 mm er.
      if (mm(png.h) > ruimte + 0.2 || mm(png.b) > spiegel.breedte + 0.2) klopt = false;
      if (i < blad.stukken.length - 1) {
        const metVolgende = w.renderRangePng({ range: bereikA1({ ...blad.bereik, top: stuk.van, bottom: stuk.tot + 1 }), scale: blad.tekenschaal });
        if (mm(pngGrootte(metVolgende).h) <= ruimte - 0.2) klopt = false;
      }
      vel++;
    });
  }
  return { verdeling, klopt, vellen: vel };
}

// Een vel met kop: (249 − 20) / (25,4/96) = 865,5 px, dus 43 rijen van 20 px (860 px). Een
// volgend vel: 249 / (25,4/96) = 941,1 px, dus 47 rijen (940 px). 100 rijen: 43 + 47 + 10.
const lang = nieuweWerkmap((w) => { for (let r = 0; r < 100; r++) w.editCell(0, r, 0, String(r)); });
const langUit = tegenAfbeeldingen(lang, SPIEGEL);
meld(stukkenTekst(langUit.verdeling.bladen[0]) === "1-43 44-90 91-100", "100 rijen: 43 op het eerste vel (met kop), 47 op het tweede, 10 op het derde");
meld(langUit.klopt, "elke getekende afbeelding past op zijn vel, en er had geen rij meer bij gepast");
const langLijnen = velLijnen(lang, 0, SPIEGEL);
meld(langLijnen.vellen[0].tot + 1 === 43 && langLijnen.vellen[1].tot + 1 === 90, "het raster zet zijn lijnen op dezelfde rijen: na rij 43 en rij 90");
meld(langLijnen.vellen[2].metInhoud && !langLijnen.vellen[3].metInhoud && langLijnen.vellen[2].tot + 1 === 137, "vel 3 loopt door tot rij 137 (90 + 47) en vel 4 is nog leeg");
meld(langLijnen.vol && langLijnen.vellen.length === MAX_VELLEN, "het raster stopt bij de grens van de afdruk");
// De rand rechts: 178 / (25,4/96) = 672,76 px; kolommen van 64,01 px: in kolom K (index 10), op 32,6 px.
meld(langLijnen.rechtsKolom === 10 && Math.abs(langLijnen.rechtsBinnen - (672.756 - 10 * 64.01172)) < 0.01 && langLijnen.schaal === 1, "de rand rechts valt 178 mm verder: in kolom K, op 32,6 px, en er wordt niet verkleind");
lang.editCell(0, 500, 0, "verder");
const langVerder = verdeelWerkmap(lang, SPIEGEL).bladen[0];
meld(stukkenTekst(langVerder).startsWith("1-43 44-90 91-137"), "wat onderaan bijkomt, verschuift de grenzen erboven niet");
lang.applyOps([{ type: "setFreezePane", sheet: 0, pane: { rows: 3, cols: 1, top_left: { row: 3, col: 1 } } }]);
meld(stukkenTekst(verdeelWerkmap(lang, SPIEGEL).bladen[0]) === stukkenTekst(langVerder), "vastgezette rijen veranderen niets aan het papier");
lang.dispose();

// Meer rijen dan de rekenkern in één afbeelding tekent (16384 px bij schaal 2 is 8192 px).
const heelLang = nieuweWerkmap((w) => { for (let r = 0; r < 1000; r++) w.editCell(0, r, 0, String(r)); });
const heelLangUit = tegenAfbeeldingen(heelLang, SPIEGEL);
meld(heelLangUit.klopt && heelLangUit.vellen === 1 + Math.ceil((1000 - 43) / 47), "1000 rijen komen op papier: 1 + ⌈957 / 47⌉ = 22 vellen, ook al past dat niet in één afbeelding");
heelLang.dispose();

// Te breed: 14 kolommen van 64,01 px is 896,16 px, als afbeelding 896,5 px. 672,76 / 896,5 = 0,7504.
// Een vel met kop is dan 865,5 / 0,7504 = 1153,4 px: 57 rijen.
const breed = nieuweWerkmap((w) => { for (let k = 0; k < 14; k++) for (let r = 0; r < 70; r++) w.editCell(0, r, k, "1"); });
const breedUit = tegenAfbeeldingen(breed, SPIEGEL);
const breedBlad = breedUit.verdeling.bladen[0];
meld(Math.abs(breedBlad.schaal - 672.756 / 896.5) < 1e-3 && breedBlad.stukken[0].tot + 1 === 57, "te breed: verkleind tot 75%, en daardoor passen er 57 rijen op het eerste vel");
meld(breedUit.klopt, "ook verkleind passen de afbeeldingen, precies binnen de breedte");
const breedLijnen = velLijnen(breed, 0, SPIEGEL);
meld(breedLijnen.vellen[0].tot + 1 === 57 && breedLijnen.schaal === breedBlad.schaal, "het raster rekent met dezelfde verkleining");
meld(breedLijnen.rechtsKolom === 14 || (breedLijnen.rechtsKolom === 13 && breedLijnen.rechtsBinnen > 63), "de rand rechts valt op het eind van de laatste kolom: er is geen tweede kolom vellen");
const breedVoor = breedLijnen.vellen[0].tot;
breed.applyOps([{ type: "setColWidth", sheet: 0, col: 0, width: 60 }]);
meld(velLijnen(breed, 0, SPIEGEL).vellen[0].tot > breedVoor, "een bredere kolom verkleint verder, en de lijnen volgen");
breed.undo();
breed.dispose();

// Zo breed dat een afbeelding op schaal 2 niet meer kan: 300 kolommen is 19200 px, keer 2 boven de grens.
const heelBreed = nieuweWerkmap((w) => { for (let k = 0; k < 300; k++) w.editCell(0, 0, k, "1"); });
const heelBreedUit = tegenAfbeeldingen(heelBreed, SPIEGEL);
meld(heelBreedUit.klopt && heelBreedUit.verdeling.bladen[0].tekenschaal < 1, "te breed voor de afbeelding: de tekenschaal gaat omlaag, het formaat op papier niet");
heelBreed.dispose();

// Meer werkbladen: alleen het eerste vel heeft de kop, en elk werkblad zijn naam.
const meer = nieuweWerkmap((w) => {
  w.applyOps([{ type: "addSheet", index: 1, name: "Leeg" }, { type: "addSheet", index: 2, name: "Tweede" }]);
  for (let r = 0; r < 50; r++) { w.editCell(0, r, 0, "1"); w.editCell(2, r + 1, 1, "2"); }
});
const meerUit = tegenAfbeeldingen(meer, SPIEGEL);
// Met naam: (249 − 20 − 7) / (25,4/96) = 839,1 px: 41 rijen. Zonder kop: (249 − 7) → 914,6 px: 45 rijen.
const [meerEen, meerTwee] = meerUit.verdeling.bladen;
meld(meerUit.verdeling.bladen.length === 2 && meerEen.naam === "Sheet1" && meerTwee.naam === "Tweede", "een leeg werkblad komt niet op papier, de andere met hun naam");
meld(stukkenTekst(meerEen) === "1-41 42-50" && stukkenTekst(meerTwee) === "2-46 47-51", "met naam 41 rijen op het eerste vel (met kop), daarna 45 per vel; het tweede begint bij zijn eigen eerste rij");
meld(meerUit.klopt, "en ook die afbeeldingen passen");
meld(velLijnen(meer, 2, SPIEGEL).vellen[0].nummer === 3 && velLijnen(meer, 2, SPIEGEL).vellen[0].tot + 1 === 46, "het raster van het tweede werkblad telt door: vel 3, tot rij 46");
const legeLijnen = velLijnen(meer, 1, SPIEGEL);
meld(legeLijnen.boven === 0 && legeLijnen.links === 0 && !legeLijnen.vellen[0].metInhoud, "een leeg werkblad toont het vel vanaf A1, zonder inhoud");
meer.dispose();

// Meer dan MAX_VELLEN: de melding op papier, en het raster stopt op dezelfde plek.
const teVeel = nieuweWerkmap((w) => { w.editCell(0, 0, 0, "1"); w.editCell(0, 3000, 0, "2"); });
const teVeelUit = verdeelWerkmap(teVeel, SPIEGEL);
meld(teVeelUit.afgekapt && teVeelUit.bladen[0].stukken.length === MAX_VELLEN, "meer dan 60 vellen: afgekapt, zoals de melding op papier zegt");
meld(velLijnen(teVeel, 0, SPIEGEL).vellen.length === MAX_VELLEN && velLijnen(teVeel, 0, SPIEGEL).vellen[MAX_VELLEN - 1].tot === teVeelUit.bladen[0].stukken[MAX_VELLEN - 1].tot, "het raster stopt op dezelfde rij");
teVeel.dispose();

meld(JSON.stringify(verdeelRijen((r) => r * 30, 0, 9, () => 100, 60)) === JSON.stringify([{ van: 0, tot: 2 }, { van: 3, tot: 5 }, { van: 6, tot: 8 }, { van: 9, tot: 9 }]), "rijen van 30 px op vellen van 100 px: drie per vel");
meld(JSON.stringify(verdeelRijen((r) => (r === 0 ? 0 : 500 + r), 0, 2, () => 100, 60)[0]) === JSON.stringify({ van: 0, tot: 0 }), "een rij hoger dan een vel krijgt toch een vel");

const afdrukBron = readFileSync(join(hier, "../packages/desktop/src/components/calc/spreadsheetBlad.ts"), "utf8");
const laagBron = readFileSync(join(hier, "../packages/desktop/src/components/calc/spreadsheetLaag.tsx"), "utf8");
meld(afdrukBron.includes("verdeelWerkmap(wb, { breedte, hoogte })") && !/KOP_RUIMTE|NAAM_RUIMTE|MAX_VELLEN/.test(afdrukBron), "de afdruk rekent met deze verdeling, niet met een eigen kopie");
meld(laagBron.includes("velLijnen(kern, blad, UITDRAAI)") && laagBron.includes("MATEN.bladen.inhoud.hoogte - SPELING"), "het raster gebruikt dezelfde verdeling en de bladspiegel van de uitdraai");

console.log(fouten === 0 ? "\nAlles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
