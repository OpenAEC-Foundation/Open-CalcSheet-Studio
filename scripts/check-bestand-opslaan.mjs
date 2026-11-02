/**
 * Regressie voor browseropslag: Opslaan als kiest een bestand; Opslaan schrijft
 * daarna zonder tweede dialoog over datzelfde bestand. Een nieuw gekozen
 * bestand vervangt de handle voor de volgende Opslaan-actie.
 *
 * Daarna een project met een PDF-blad (store/pdfBijlage.ts) heen en terug:
 * opbouwen, opslaan, openen en inlezen. De PDF moet byte voor byte terugkomen,
 * een gewoon blad mag er geen veld bij krijgen, en een bestand met een
 * ongeldig of misplaatst PDF-veld valt terug zonder te breken.
 */
import { readFileSync } from "node:fs";
import ts from "typescript";
import { bouwProjectBestand, leesProjectBestand, normaliseerExemplaar, PROJECT_FORMAAT_VERSIE } from
  "../packages/desktop/src/store/projectBestand.ts";
import { base64Bytes, bladnaamVoor, isPdfBlad, leesPdfBijlage, lijktOpPdf, PDF_BLAD } from
  "../packages/desktop/src/store/pdfBijlage.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";

const bron = readFileSync(new URL("../packages/desktop/src/tauri/fileOps.ts", import.meta.url), "utf8");
const js = ts.transpileModule(bron, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;

let dialoogAantal = 0;
const bestanden = new Map();
function handle(naam) {
  return {
    name: naam,
    async createWritable() {
      return {
        async write(inhoud) { bestanden.set(naam, inhoud); },
        async close() {},
      };
    },
    async getFile() { return { async text() { return bestanden.get(naam); } }; },
  };
}
/** Het bestand dat de open-dialoog "kiest". */
let teOpenen = "blad-1.ifccalculation";
globalThis.window = {
  async showSaveFilePicker() { dialoogAantal++; return handle(`blad-${dialoogAantal}.ifccalculation`); },
  async showOpenFilePicker() { return [handle(teOpenen)]; },
};

const opslaan = await import(`data:text/javascript,${encodeURIComponent(js)}`);
const eerste = await opslaan.saveCalculationFile("versie 1", "blad");
if (eerste !== "blad-1.ifccalculation" || !opslaan.kanDirectOpslaan(eerste)) {
  throw new Error("Opslaan als heeft geen overschrijfbaar bestand gekozen");
}
await opslaan.schrijfCalculationFile(eerste, "versie 2");
if (dialoogAantal !== 1 || bestanden.get(eerste) !== "versie 2") {
  throw new Error("Opslaan overschrijft het gekozen bestand niet direct");
}
const tweede = await opslaan.saveCalculationFile("nieuw", "blad", eerste);
if (tweede === eerste || opslaan.kanDirectOpslaan(eerste) || !opslaan.kanDirectOpslaan(tweede)) {
  throw new Error("Opslaan als heeft de bestandskoppeling niet vervangen");
}
const geopend = await opslaan.openCalculationFile();
if (geopend?.raw !== "versie 2" || !opslaan.kanDirectOpslaan(eerste)) {
  throw new Error("Openen heeft de bestandskoppeling niet hersteld");
}
console.log("Browseropslag: Opslaan, Opslaan als en Openen akkoord.");

// ── PDF-blad ─────────────────────────────────────────────────────────────────

/** Een PDF-kop met alle 256 bytewaarden erachter: base64 moet ook binair heel blijven. */
const pdfBytes = Buffer.concat([
  Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1"),
  Buffer.from(Array.from({ length: 256 }, (_, i) => i)),
  Buffer.from("\n%%EOF\n", "latin1"),
]);
const pdfData = pdfBytes.toString("base64");
const rekenblad = {
  id: "ex-1", naam: "Balklaag 1", templateId: "balklaag", source: '"Balklaag\n', waarden: { L: "4,2" }, elementen: [],
};
const pdfBlad = {
  id: "ex-pdf", naam: "FEM-rapport hal", templateId: PDF_BLAD, source: "", waarden: {}, elementen: [],
  pdf: { bestandsnaam: "FEM-rapport hal.pdf", data: pdfData },
};
const tekst = bouwProjectBestand(
  { versie: PROJECT_FORMAAT_VERSIE, naam: "Proef", gegevens: legeGegevens(), exemplaren: [pdfBlad, rekenblad] },
  null,
);
const pdfPad = await opslaan.saveCalculationFile(tekst, "Proef");
teOpenen = pdfPad;
const pdfGeopend = await opslaan.openCalculationFile();
const gelezen = leesProjectBestand(pdfGeopend.raw, pdfGeopend.name);
const [terugPdf, terugBlad] = gelezen.exemplaren;

const fouten = [];
const eis = (ok, tekst) => { if (!ok) fouten.push(tekst); };
eis(gelezen.exemplaren.length === 2, `twee bladen terug verwacht, kreeg ${gelezen.exemplaren.length}`);
eis(isPdfBlad(terugPdf) && terugPdf.naam === pdfBlad.naam && terugPdf.source === "", "het PDF-blad komt niet als PDF-blad terug");
eis(terugPdf.pdf?.bestandsnaam === "FEM-rapport hal.pdf", "de bestandsnaam van de PDF is weg");
eis(terugPdf.pdf?.data === pdfData, "de base64 van de PDF is veranderd");
eis(Buffer.from(terugPdf.pdf?.data ?? "", "base64").equals(pdfBytes), "de PDF komt niet byte voor byte terug");
eis(!("pdf" in terugBlad) && terugBlad.waarden.L === "4,2", "het rekenblad is veranderd of kreeg een PDF-veld");
const opgeslagen = JSON.parse(pdfGeopend.raw);
eis(JSON.stringify(Object.keys(opgeslagen)) === JSON.stringify(["header", "imports", "schemas", "data"]),
  "het bestand heeft andere velden dan IFCX toestaat");
eis(opgeslagen.data.some((k) => k.attributes?.["ocss::blad::rekentekst"] === rekenblad.source),
  "de rekentekst staat niet op zijn blad in het bestand");
eis(base64Bytes(pdfData) === pdfBytes.length, `base64Bytes: ${base64Bytes(pdfData)} in plaats van ${pdfBytes.length}`);
eis(lijktOpPdf(new Uint8Array(pdfBytes)) && !lijktOpPdf(new Uint8Array(Buffer.from("PK\x03\x04"))), "lijktOpPdf herkent niet goed");
eis(bladnaamVoor("C:\\map\\Hal fase 2.PDF") === "Hal fase 2", "bladnaamVoor haalt map of extensie niet weg");

// Robuust bij een met de hand aangepast bestand.
eis(leesPdfBijlage({ data: 5 }) === undefined && leesPdfBijlage("x") === undefined, "een ongeldig PDF-veld blijft staan");
eis(leesPdfBijlage({ data: " JVBE\nRi0x " })?.data === "JVBERi0x", "witruimte in de base64 blijft staan");
const zonderBestand = normaliseerExemplaar({ ...pdfBlad, pdf: { data: 12 } }, "x");
eis(isPdfBlad(zonderBestand) && !("pdf" in zonderBestand), "een PDF-blad met een kapot bestand breekt het inlezen");
const misplaatst = normaliseerExemplaar({ ...rekenblad, pdf: { bestandsnaam: "a.pdf", data: pdfData } }, "x");
eis(!("pdf" in misplaatst), "een rekenblad houdt een PDF-veld");

// Een project van vóór de PDF-bladen leest precies als voorheen: geen nieuwe velden.
const oud = leesProjectBestand(
  bouwProjectBestand({ versie: PROJECT_FORMAAT_VERSIE, naam: "Oud", gegevens: legeGegevens(), exemplaren: [rekenblad] }, null),
  "Oud",
);
eis(JSON.stringify(Object.keys(oud.exemplaren[0]).sort()) === JSON.stringify(Object.keys(rekenblad).sort()),
  `een oud blad kreeg andere velden: ${Object.keys(oud.exemplaren[0]).join(", ")}`);

if (fouten.length > 0) throw new Error(`PDF-blad in het projectbestand:\n  ${fouten.join("\n  ")}`);
console.log("PDF-blad: opslaan en openen geven de PDF byte voor byte terug; oude projecten ongewijzigd.");
