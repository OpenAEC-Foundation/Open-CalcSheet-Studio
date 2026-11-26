/**
 * Controle van een invoerveld dat zijn waarde uit een cel van een spreadsheet-blad neemt
 * (`#2.Sheet1!B4 kN`).
 *
 * Toetst:
 *   • de schrijfwijze: lezen, terugschrijven met aanhalingstekens, en dat een
 *     celverwijzing geen gewone verwijzing (`#1.R_paal`) is;
 *   • het lezen van de cel uit de werkmap: een getal, de uitkomst van een formule, en elke
 *     fout (leeg, tekst, ja/nee, #DIV/0!, formule zonder uitkomst, onbekend werkblad,
 *     kapotte werkmap);
 *   • doorrekenen, met de hand nagerekend: F = 12,5 kN uit B4, M = F · 4 m = 50 kNm,
 *     UC = 50/100 = 0,50 → voldoet; met 30 in B4 is M = 120 kNm en UC = 1,20 → voldoet niet;
 *   • de eenheid: zonder eenheid in de koppeling die van het veld, met eenheid omgerekend
 *     (12,5 kN = 12 500 N), een onverenigbare eenheid of een eenheid in een veld zonder is
 *     een fout;
 *   • elke fout geeft een melding op het blad en in de uitwerking, geen UC en geen
 *     "voldoet", ook niet van de vorige geldige uitkomst; in het Engels en bij een
 *     verborgen veld net zo;
 *   • een wijziging in de cel geeft een andere sleutel voor de doorrekening, een wijziging
 *     elders in de werkmap niet;
 *   • hernoemen, verwijderen en vervangen van het spreadsheet-blad, en opslaan en opnieuw
 *     openen van het projectbestand (ook de uitkomst in het IFCX).
 *
 * Draaien:  node scripts/check-spreadsheet-invoer.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import {
  celNaam, celVerwijzingenIn, celVerwijzingTekst, evaluateMetScope, isVerwijzingInvoer, leesCelVerwijzing, leesVerwijzing, parse, render,
  vervangVerwijzingen, verwijzingenIn,
} from "../packages/core/dist/index.js";
import { scopeMetVerwijzingen, verwezenBladen } from "../packages/desktop/src/rekenen/verwijzingen.ts";
import { leesCel, werkbladNamen } from "../packages/desktop/src/rekenen/spreadsheetCellen.ts";
import { LEGE_WERKMAP, SPREADSHEET_BLAD } from "../packages/desktop/src/store/spreadsheetBlad.ts";
import { bouwProjectBestand, leesProjectBestand, PROJECT_FORMAAT_VERSIE } from "../packages/desktop/src/store/projectBestand.ts";
import { bladenVoorIfc } from "../packages/desktop/src/store/projectIfcx.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";
import { leesGetypt } from "../packages/desktop/src/components/calc/invoer/velden.ts";

const { leesResultaat } = await import("../packages/desktop/src/components/calc/bladLezen.ts");

const hier = dirname(fileURLToPath(import.meta.url));
const pakket = join(hier, "../node_modules/@betteroffice/xlsx/dist");

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) fouten++;
}
const dichtbij = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const inEenheid = (v, e) => (v && typeof v.toNumber === "function" ? v.toNumber(e) : NaN);

console.log("\nDe schrijfwijze");
{
  const v = leesCelVerwijzing(" #2.Sheet1!$b$4 kN/m ");
  meld(v?.ref === "2" && v.blad === "Sheet1" && v.cel === "B4" && v.eenheid === "kN/m", "#2.Sheet1!$b$4 kN/m: blad 2, werkblad Sheet1, cel B4, eenheid kN/m", JSON.stringify(v));
  const q = leesCelVerwijzing("#vloer.'Lasten ''vloer'''!C12");
  meld(q?.ref === "vloer" && q.blad === "Lasten 'vloer'" && q.cel === "C12" && q.eenheid === "", "een werkblad met spatie en aanhalingsteken tussen enkele aanhalingstekens", JSON.stringify(q));
  meld(celVerwijzingTekst(q) === "#vloer.'Lasten ''vloer'''!C12" && celVerwijzingTekst({ ref: "3", blad: "Blad1", cel: "B4", eenheid: "kN" }) === "#3.Blad1!B4 kN",
    "terugschrijven geeft dezelfde tekst; aanhalingstekens alleen als het moet");
  meld(leesCelVerwijzing("#2.R_paal") === null && leesCelVerwijzing("12 kN") === null && leesCelVerwijzing("#2.Sheet1!B0") === null, "geen cel: een gewone verwijzing, een getal, rij 0");
  meld(leesVerwijzing("#2.Sheet1!B4") === null && verwijzingenIn("", { F: "#2.Sheet1!B4" }).length === 0, "een celverwijzing is geen verwijzing naar een waarde");
  meld(vervangVerwijzingen("x = #1.n! + 1").includes("ref__1__n!"), "#1.n! (faculteit) blijft een gewone verwijzing");
  meld(isVerwijzingInvoer("#2.Sheet1!B4 kN") && isVerwijzingInvoer("#1.R_paal") && !isVerwijzingInvoer("12"), "isVerwijzingInvoer: beide soorten");
  meld(JSON.stringify(leesGetypt({ eenheid: "kN", toonEenheid: "kN" }, " #2.Sheet1!B4 kN ")) === JSON.stringify({ waarde: "#2.Sheet1!B4 kN" }),
    "het invoerscherm neemt een getypte koppeling over zoals hij is");
  meld(celVerwijzingenIn({ a: "#2.Sheet1!B4", b: "#2.Sheet1!b4 kN", c: "5" }).length === 1, "celVerwijzingenIn: elke cel één keer");
}

console.log("\nDe werkmap maken (rekenkern van de spreadsheet)");
const { initWasm, openWorkbook } = await import(new URL(`file:///${pakket.replace(/\\/g, "/")}/index.js`).href);
await initWasm(readFileSync(join(pakket, "generated/xlsx_wasm_bg.wasm")));

/** Een werkmap met in Sheet1 kolom B: B4 = getal, B5 = B4·2, B6 = 1/0, B7 tekst, B8 leeg, B9 ja, B10 een getal ernaast. */
function maakWerkmap(b4, b10 = "7") {
  const wb = openWorkbook(new Uint8Array(Buffer.from(LEGE_WERKMAP, "base64")));
  const cellen = { 3: b4, 4: "=B4*2", 5: "=1/0", 6: "staal", 8: "TRUE", 9: b10 };
  for (const [rij, invoer] of Object.entries(cellen)) wb.editCell(0, Number(rij), 1, invoer);
  const bytes = wb.save();
  wb.dispose();
  return Buffer.from(bytes).toString("base64");
}
/** Past de XML van een werkmap aan: een ander werkblad, of een cel zoals uit een ander programma. */
function bewerk(data, pas) {
  const delen = unzipSync(new Uint8Array(Buffer.from(data, "base64")));
  pas(delen);
  return Buffer.from(zipSync(delen)).toString("base64");
}
const WERKMAP = maakWerkmap("12.5");
meld(JSON.stringify(werkbladNamen(WERKMAP)) === JSON.stringify(["Sheet1"]), "de werkmap heeft werkblad Sheet1");

console.log("\nCellen lezen");
{
  meld(leesCel(WERKMAP, "Sheet1", "B4") === 12.5, "B4 = 12,5");
  meld(leesCel(WERKMAP, "Sheet1", "B5") === 25, "B5 = B4·2 = 25: de uitkomst van de formule");
  const div = leesCel(WERKMAP, "Sheet1", "B6");
  meld(div?.fout === "formulefout" && div.detail === "#DIV/0!", "B6 = 1/0: formulefout #DIV/0!", JSON.stringify(div));
  const tekst = leesCel(WERKMAP, "Sheet1", "B7");
  meld(tekst?.fout === "tekst" && tekst.detail === "staal", "B7: tekst, geen getal", JSON.stringify(tekst));
  meld(leesCel(WERKMAP, "Sheet1", "B8")?.fout === "leeg", "B8: leeg");
  meld(leesCel(WERKMAP, "Sheet1", "B9")?.fout === "tekst", "B9: een ja/nee-waarde is geen getal");
  meld(leesCel(WERKMAP, "Sheet1", "Z99")?.fout === "leeg", "een cel buiten het gebruikte bereik: leeg");
  meld(leesCel(WERKMAP, "Blad9", "B4")?.fout === "werkblad", "een onbekend werkblad");
  meld(leesCel("bm90IGVlbiB3ZXJrbWFw", "Sheet1", "B4")?.fout === "werkmap" && leesCel(undefined, "Sheet1", "B4")?.fout === "werkmap", "een kapotte of ontbrekende werkmap");
  // Zoals uit een ander programma: gedeelde tekst, een formule zonder opgeslagen uitkomst, een werkblad met spatie.
  const ander = bewerk(WERKMAP, (d) => {
    d["xl/workbook.xml"] = strToU8(strFromU8(d["xl/workbook.xml"]).replace('name="Sheet1"', 'name="Lasten &amp; vloer"'));
    d["xl/sharedStrings.xml"] = strToU8('<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>HEA 200</t></si></sst>');
    d["xl/worksheets/sheet1.xml"] = strToU8(strFromU8(d["xl/worksheets/sheet1.xml"])
      .replace(/<c r="B5"><f>B4\*2<\/f><v>25<\/v><\/c>/, '<c r="B5"><f>B4*2</f></c>')
      .replace(/<c r="B10"><v>7<\/v><\/c>/, '<c r="B10" t="s"><v>0</v></c>'));
  });
  meld(JSON.stringify(werkbladNamen(ander)) === JSON.stringify(["Lasten & vloer"]), "een werkblad met & in de naam");
  meld(leesCel(ander, "Lasten & vloer", "B4") === 12.5, "de cel uit dat werkblad");
  meld(leesCel(ander, "Lasten & vloer", "B5")?.fout === "geen-waarde", "een formule zonder opgeslagen uitkomst: geen waarde");
  const gedeeld = leesCel(ander, "Lasten & vloer", "B10");
  meld(gedeeld?.fout === "tekst" && gedeeld.detail === "HEA 200", "gedeelde tekst is tekst", JSON.stringify(gedeeld));
}

console.log("\nDoorrekenen");
const BRON = [
  "F = ?{10}*(kN)",
  "n = ?{1}",
  "M = F*4 m",
  "UC_max = M/(100 kN*m)",
  "#if UC_max <= 1",
  "'Maatgevende UC voldoet",
  "#else",
  "'Maatgevende UC voldoet niet",
  "#end if",
].join("\n");
const spreadsheet = (data, naam = "Lasten") => ({ id: "ex-xlsx", ref: "2", naam, templateId: SPREADSHEET_BLAD, source: "", waarden: {}, elementen: [], xlsx: { bestandsnaam: "lasten.xlsx", data } });
const rekenblad = (waarden, source = BRON) => ({ id: "ex-reken", ref: "1", naam: "Ligger", templateId: "", source, waarden, elementen: [] });

/** Zoals de afdruk en het rapport (bladDoorrekenen.ts): verwijzingen oplossen, rekenen, de uitwerking en het oordeel. */
function reken(blad, alle, evalOpties = {}) {
  const scope = scopeMetVerwijzingen(blad.source, blad.waarden, {}, verwezenBladen(blad.source, blad.waarden, alle), {}, evalOpties);
  const { nodes, scope: uit } = evaluateMetScope(parse(blad.source, {}), blad.waarden, scope, evalOpties);
  const html = render(nodes);
  return { nodes, scope: uit, html, r: leesResultaat(nodes, blad.naam), veld: nodes.find((n) => n.type === "input-prompt" && n.name === "F") };
}
const zonderOordeel = (u) => u.r.uc === null && u.r.voldoet === null && u.r.nietGetoetst === true && !/voldoet|Maatgevende/.test(u.html);

{
  const goed = reken(rekenblad({ F: "#2.Sheet1!B4" }), [rekenblad({}), spreadsheet(WERKMAP)]);
  meld(dichtbij(inEenheid(goed.scope.F, "kN"), 12.5), "F = #2.Sheet1!B4 → 12,5 kN (eenheid van het veld)", String(goed.scope.F));
  meld(dichtbij(inEenheid(goed.scope.M, "kN*m"), 50), "M = 12,5 · 4 = 50 kNm", String(goed.scope.M));
  meld(goed.r.uc !== null && dichtbij(goed.r.uc, 0.5, 1e-6) && goed.r.voldoet === true, "UC = 0,50 → voldoet", JSON.stringify(goed.r));
  meld(goed.veld?.koppeling?.bron === "#2.Sheet1!B4" && goed.veld.koppeling.waarde === "12.5 kN" && goed.veld.currentValue === "#2.Sheet1!B4",
    "het veld toont de verwijzing, en de koppeling de waarde 12.5 kN", JSON.stringify(goed.veld));
  meld(goed.html.includes("calc-koppeling") && goed.html.includes('value="#2.Sheet1!B4"'), "de uitwerking toont de verwijzing en de waarde ernaast");

  // De bron verandert: 30 in B4.
  const nieuw = maakWerkmap("30");
  const anders = reken(rekenblad({ F: "#2.Sheet1!B4" }), [spreadsheet(nieuw)]);
  meld(dichtbij(inEenheid(anders.scope.M, "kN*m"), 120) && anders.r.voldoet === false && dichtbij(anders.r.uc, 1.2, 1e-6),
    "30 in B4: M = 120 kNm, UC = 1,20 → voldoet niet", JSON.stringify(anders.r));
  const sleutel = (data) => JSON.stringify(verwezenBladen(BRON, { F: "#2.Sheet1!B4" }, [spreadsheet(data)]));
  meld(sleutel(WERKMAP) !== sleutel(nieuw), "een andere waarde in de cel geeft een andere sleutel: de vorige uitkomst geldt niet meer");
  meld(sleutel(WERKMAP) === sleutel(maakWerkmap("12.5", "99")), "een wijziging in een andere cel niet");
  meld(verwezenBladen(BRON, { F: "#2.Sheet1!B4" }, [spreadsheet(WERKMAP)])[0]?.cellen?.[celNaam("2", "Sheet1", "B4")] === 12.5, "de waarde gaat mee met het blad (cellen)");

  const formule = reken(rekenblad({ F: "#2.Sheet1!B5" }), [spreadsheet(WERKMAP)]);
  meld(dichtbij(inEenheid(formule.scope.F, "kN"), 25), "F = #2.Sheet1!B5 (formule B4·2) → 25 kN");

  // Via een ander blad: blad 3 neemt M uit blad 1, en blad 1 neemt F uit de cel.
  const via = reken({ id: "ex-3", ref: "3", naam: "Via", templateId: "", source: "W = #1.M/2", waarden: {} }, [rekenblad({ F: "#2.Sheet1!B4" }), spreadsheet(WERKMAP)]);
  meld(dichtbij(inEenheid(via.scope.W, "kN*m"), 25), "via via: #1.M/2 = 25 kNm, met F uit de cel", String(via.scope.W));
}

console.log("\nDe eenheid");
{
  const met = (waarde, alle = [spreadsheet(WERKMAP)]) => reken(rekenblad({ F: waarde }), alle);
  meld(dichtbij(inEenheid(met("#2.Sheet1!B4 kN").scope.F, "kN"), 12.5), "met kN in de koppeling: 12,5 kN");
  const inN = met("#2.Sheet1!B4 N");
  meld(dichtbij(inEenheid(inN.scope.F, "N"), 12.5) && dichtbij(inEenheid(inN.scope.F, "kN"), 0.0125), "12,5 N in een veld in kN: omgerekend naar 0,0125 kN", String(inN.scope.F));
  const fout = met("#2.Sheet1!B4 m");
  meld(fout.scope.F === undefined && /past niet bij de eenheid/.test(fout.veld?.koppeling?.fout ?? "") && zonderOordeel(fout),
    "12,5 m in een veld in kN: geweigerd, geen waarde en geen oordeel", fout.veld?.koppeling?.fout);
  meld(/onbekende eenheid/.test(met("#2.Sheet1!B4 kNx").veld?.koppeling?.fout ?? ""), "een onbekende eenheid in de koppeling: geweigerd");
  const kaal = reken(rekenblad({ n: "#2.Sheet1!B4" }, "n = ?{1}\nm = 2*n"), [spreadsheet(WERKMAP)]);
  meld(kaal.scope.m === 25, "een veld zonder eenheid: een kaal getal, 2 · 12,5 = 25", String(kaal.scope.m));
  const kaalMet = reken(rekenblad({ n: "#2.Sheet1!B4 kN" }, "n = ?{1}\nm = 2*n"), [spreadsheet(WERKMAP)]);
  meld(kaalMet.scope.n === undefined && /past niet/.test(kaalMet.nodes.find((x) => x.type === "input-prompt")?.koppeling?.fout ?? ""),
    "kN in de koppeling van een veld zonder eenheid: geweigerd, geen stille omzetting");
}

console.log("\nFouten: een melding, geen oordeel");
{
  const gevallen = [
    ["een lege cel", "#2.Sheet1!B8", [spreadsheet(WERKMAP)], /cel B8 is leeg/],
    ["tekst", "#2.Sheet1!B7", [spreadsheet(WERKMAP)], /cel B7 bevat geen getal maar "staal"/],
    ["een ja/nee-waarde", "#2.Sheet1!B9", [spreadsheet(WERKMAP)], /cel B9 bevat geen getal/],
    ["een formulefout", "#2.Sheet1!B6", [spreadsheet(WERKMAP)], /de formule in cel B6 geeft #DIV\/0!/],
    ["een ontbrekend werkblad", "#2.Blad1!B4", [spreadsheet(WERKMAP)], /blad #2 heeft geen werkblad "Blad1"/],
    ["een verwijderd blad", "#2.Sheet1!B4", [], /er is geen blad #2/],
    ["een blad dat geen spreadsheet is", "#1.Sheet1!B4", [rekenblad({})], /blad #1 is geen spreadsheet-blad/],
    ["een kapotte werkmap", "#2.Sheet1!B4", [spreadsheet("bm90IGVlbiB3ZXJrbWFw")], /de werkmap van blad #2 is niet te lezen/],
  ];
  for (const [wat, waarde, alle, melding] of gevallen) {
    const u = reken(rekenblad({ F: waarde }), alle);
    const tekst = u.veld?.koppeling?.fout ?? "";
    meld(melding.test(tekst) && u.html.includes("calc-koppeling-fout") && u.html.includes(tekst.replace(/"/g, "&quot;")) && u.scope.F === undefined && zonderOordeel(u),
      `${wat}: melding in het blad en de uitwerking, F niet gerekend, geen UC en geen "voldoet"`, `${tekst} | ${JSON.stringify(u.r)}`);
  }
  // Eerst geldig, dan leeg: de vorige uitkomst komt niet terug.
  const eerst = reken(rekenblad({ F: "#2.Sheet1!B4" }), [spreadsheet(WERKMAP)]);
  const leeg = maakWerkmap("");
  const daarna = reken(rekenblad({ F: "#2.Sheet1!B4" }), [spreadsheet(leeg)]);
  meld(eerst.r.voldoet === true && zonderOordeel(daarna), "eerst voldoet, na het leegmaken van B4 geen oordeel meer");

  const en = reken(rekenblad({ F: "#2.Sheet1!B7" }), [spreadsheet(WERKMAP)], { taal: "en" });
  meld(/link not calculated: cell B7 does not hold a number/.test(en.veld?.koppeling?.fout ?? "") && zonderOordeel(en), "in het Engels: link not calculated", en.veld?.koppeling?.fout);

  const verborgen = reken(rekenblad({ F: "#2.Sheet1!B8" }, BRON.replace("F = ?{10}*(kN)", "#hide\nF = ?{10}*(kN)\n#show")), [spreadsheet(WERKMAP)]);
  meld(verborgen.html.includes("#2.Sheet1!B8: koppeling niet gerekend: cel B8 is leeg") && zonderOordeel(verborgen),
    "een verborgen veld: de melding staat toch op het blad, en geen oordeel");

  const zonder = reken(rekenblad({ F: "20" }), [spreadsheet(WERKMAP)]);
  meld(dichtbij(inEenheid(zonder.scope.F, "kN"), 20) && zonder.r.voldoet === true && !zonder.html.includes("calc-koppeling"),
    "een blad zonder koppeling rekent zoals altijd (20 kN → UC 0,80, voldoet)");
}

console.log("\nHernoemen, verwijderen, vervangen, opslaan en opnieuw openen");
{
  const hernoemd = reken(rekenblad({ F: "#2.Sheet1!B4" }), [spreadsheet(WERKMAP, "Lasten (nieuwe naam)")]);
  meld(dichtbij(inEenheid(hernoemd.scope.F, "kN"), 12.5), "een andere naam voor het spreadsheet-blad: de verwijzing (op kenmerk #2) blijft geldig");
  const vervangen = bewerk(WERKMAP, (d) => {
    d["xl/workbook.xml"] = strToU8(strFromU8(d["xl/workbook.xml"]).replace('name="Sheet1"', 'name="Gewichten"'));
  });
  const naVervangen = reken(rekenblad({ F: "#2.Sheet1!B4" }), [spreadsheet(vervangen)]);
  meld(/geen werkblad "Sheet1"/.test(naVervangen.veld?.koppeling?.fout ?? "") && zonderOordeel(naVervangen),
    "een werkmap zonder werkblad Sheet1 in de plaats: een melding, geen oordeel");
  const herkoppeld = reken(rekenblad({ F: "#2.Gewichten!B4" }), [spreadsheet(vervangen)]);
  meld(dichtbij(inEenheid(herkoppeld.scope.F, "kN"), 12.5), "opnieuw gekoppeld aan Gewichten!B4: weer 12,5 kN");

  const project = {
    versie: PROJECT_FORMAAT_VERSIE, naam: "Koppeling", gegevens: legeGegevens(), rapport: undefined,
    exemplaren: [rekenblad({ F: "#2.Sheet1!B4 kN" }), spreadsheet(WERKMAP)],
  };
  const bladen = bladenVoorIfc(project);
  const ifc = bladen.find((b) => b.id === "ex-reken");
  meld(ifc?.resultaat?.voldoet === true && dichtbij(ifc.resultaat.uc, 0.5, 1e-6), "het IFCX rekent het blad met de cel: UC 0,50, voldoet", JSON.stringify(ifc?.resultaat));
  const terug = leesProjectBestand(bouwProjectBestand(project, bladen), "koppeling");
  const reken2 = terug.exemplaren.find((e) => e.id === "ex-reken");
  const xlsx2 = terug.exemplaren.find((e) => e.id === "ex-xlsx");
  meld(reken2?.waarden.F === "#2.Sheet1!B4 kN" && reken2.ref === "1" && xlsx2?.ref === "2" && xlsx2.xlsx?.data === WERKMAP,
    "opslaan en openen: de koppeling, de kenmerken en de werkmap komen terug", JSON.stringify(reken2?.waarden));
  const opnieuw = reken(reken2, terug.exemplaren);
  meld(dichtbij(inEenheid(opnieuw.scope.F, "kN"), 12.5) && opnieuw.r.voldoet === true, "na openen rekent het blad weer met 12,5 kN");
  const kapot = bladenVoorIfc({ ...project, exemplaren: [rekenblad({ F: "#2.Sheet1!B8" }), spreadsheet(WERKMAP)] }).find((b) => b.id === "ex-reken");
  meld(kapot?.resultaat?.voldoet === null && kapot.resultaat.uc === null && kapot.resultaat.nietGetoetst === true,
    "het IFCX van een blad met een lege cel: geen UC en geen oordeel", JSON.stringify(kapot?.resultaat));
}

console.log(fouten === 0 ? "\nAlle koppelingen met spreadsheetcellen kloppen." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
