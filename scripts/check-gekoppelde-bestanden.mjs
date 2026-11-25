/**
 * Controle van gekoppelde bestanden: een RTF-bestand of een werkmapbereik als blad,
 * dat vanzelf bijwerkt als de bron verandert.
 *
 * Toetst:
 *   • de RTF-lezer op een reeks proef-RTF's: alinea's, vet, cursief, onderstreept,
 *     lijsten (`\pntext`, `\listtext`, `\ls`), koppen, tabellen, unicode (`\uN`,
 *     `\ucN`, paren), codepagina's (`\'hh` in 1252 en 1250), geneste en onbekende
 *     groepen, afbeeldingen, en dat de uitkomst als Markdown de juiste html geeft;
 *   • een werkmapbereik: op bereiknaam en op werkblad met cellen, getallen zoals de
 *     werkmap ze toont, formules als hun uitkomst, groei van een benoemd bereik na
 *     een ingevoegde rij, en een ontbrekend bereik, werkblad of kapotte naam;
 *   • de paden: absoluut en relatief tot het projectbestand, Windows en POSIX;
 *   • het bijwerken met echte bestanden op schijf: ongewijzigd, gewijzigd, alleen
 *     opnieuw opgeslagen, een verplaatste projectmap, een ontbrekende bron;
 *   • opslaan en heropenen van het project met de koppeling en de bewaarde kopie,
 *     en het IFCX volgens de specificatie;
 *   • dat een ontbrekende bron een melding geeft en de kopie nooit stil als actueel
 *     doorgaat, ook niet zolang de bron nog niet bekeken is;
 *   • het werkmapsjabloon: bewaren, lezen, toepassen op een andere werkmap;
 *   • de wachter: nooit twee controles tegelijk, en een verzoek tussendoor niet kwijt.
 *
 * De werkmappen en RTF-bestanden maakt dit script zelf.
 *
 * Draaien:  node scripts/check-gekoppelde-bestanden.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, renameSync, statSync, utimesSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { zipSync, strToU8 } from "fflate";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { rtfNaarMarkdown, lijktOpRtf } from "../packages/desktop/src/store/rtfLezer.ts";
import {
  bereikNaarMarkdown, bereikNamen, leesBereik, leesSjabloon, maakSjabloon, ontleedVerwijzing, plekVoor, toetsSjabloon,
  verwijzingTekst, werkbladen, MAX_CELLEN,
} from "../packages/desktop/src/store/werkmapBereik.ts";
import {
  controleerKoppeling, inhoudHash, kandidaatPaden, leesKoppeling, losOp, mapVan, meldingVoor, metPlek, relatiefPad, Wachter,
} from "../packages/desktop/src/store/koppeling.ts";
import { maakOmzetter } from "../packages/desktop/src/store/koppelingOmzetten.ts";
import { leesMarkdownBestand, MARKDOWN_BLAD } from "../packages/desktop/src/store/markdownBlad.ts";
import { bouwProjectBestand, leesProjectBestand, PROJECT_FORMAAT_VERSIE } from "../packages/desktop/src/store/projectBestand.ts";
import { bladenVoorIfc, projectIfcx } from "../packages/desktop/src/store/projectIfcx.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";
import { maakOpschoner } from "../packages/desktop/src/components/calc/uitwerkingRegels.ts";
import { markdownVoorScherm } from "../packages/desktop/src/components/calc/markdownRegels.ts";
import { afwijkingen } from "./lib/ifcx-specificatie.mjs";

const hier = dirname(fileURLToPath(import.meta.url));

let fouten = 0;
/** Gelijk, ongeacht de volgorde van de sleutels. */
const zelfde = (a, b) => JSON.stringify(a, Object.keys(a ?? {}).sort()) === JSON.stringify(b, Object.keys(b ?? {}).sort());
function meld(ok, tekst, detail) {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}${ok || detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`);
  if (!ok) fouten++;
}

const { window } = new JSDOM("");
globalThis.DOMParser = window.DOMParser;
const schoon = maakOpschoner(createDOMPurify(window));
const html = (md, beelden) => new window.DOMParser().parseFromString(markdownVoorScherm(md, beelden, schoon), "text/html").body;

// De rekenkern van het spreadsheet-blad, zoals check-spreadsheet.mjs hem laadt.
const pakket = join(hier, "../node_modules/@betteroffice/xlsx/dist");
const { initWasm, openWorkbook } = await import(new URL(`file:///${pakket.replace(/\\/g, "/")}/index.js`).href);
await initWasm(readFileSync(join(pakket, "generated/xlsx_wasm_bg.wasm")));
const openWerkmap = async (bytes) => {
  const wb = openWorkbook(bytes);
  return { listDefinedNames: () => wb.listDefinedNames(), readCells: (v) => wb.readCells(v), sluit: () => wb.dispose() };
};
const omzetten = maakOmzetter(openWerkmap);

// ── RTF ───────────────────────────────────────────────────────────────────────

console.log("\nRTF-lezer");
const rtf = (body, kop = "") => String.raw`{\rtf1\ansi\ansicpg1252\deff0{\fonttbl{\f0\fswiss Arial;}{\f1\fnil\fcharset2 Symbol;}}` + kop + body + "}";

{
  const r = rtfNaarMarkdown(rtf(String.raw`\pard Een {\b vet} woord, {\i cursief}, {\ul onderstreept} en {\b\i beide}.\par
\pard Tweede alinea met \b aan\b0  en uit.\par`));
  meld(r.tekst.includes("<strong>vet</strong>"), "vet", r.tekst);
  meld(r.tekst.includes("<em>cursief</em>"), "cursief", r.tekst);
  meld(r.tekst.includes("<u>onderstreept</u>"), "onderstreept");
  meld(r.tekst.includes("<strong><em>beide</em></strong>"), "vet en cursief samen");
  meld(/<strong>aan<\/strong> en uit/.test(r.tekst), "\\b en \\b0 zonder groep", r.tekst);
  meld(r.tekst.split("\n\n").length === 2, "twee alinea's, gescheiden door een witregel", r.tekst);
  const dom = html(r.tekst);
  meld(dom.querySelectorAll("p").length === 2 && dom.querySelector("p strong")?.textContent === "vet" && dom.querySelector("p em")?.textContent === "cursief", "als html: twee alinea's met strong en em");
}

{
  const r = rtfNaarMarkdown(rtf(String.raw`{\pntext\f1\'b7\tab}\pard\li720\fi-360 Punt een\par
{\pntext\f1\'b7\tab}Punt twee\par
{\pntext\f1\'b7\tab}\pard\li1440\fi-360 Dieper\par
\pard Tussen.\par
{\listtext 1.\tab}\pard\ls2\ilvl0 Stap een\par
{\listtext 2.\tab}Stap twee\par
\pard\ls3\ilvl0 Zonder teken\par`));
  meld(/^- Punt een\n- Punt twee\n {4}- Dieper$/m.test(r.tekst), "opsomming met \\pntext, met een dieper niveau", r.tekst);
  meld(/^1\. Stap een\n2\. Stap twee$/m.test(r.tekst), "genummerde lijst met \\listtext", r.tekst);
  meld(/^- Zonder teken$/m.test(r.tekst), "een lijstalinea (\\ls) zonder eigen teken wordt een opsomming", r.tekst);
  const dom = html(r.tekst);
  meld(dom.querySelectorAll("ul > li").length >= 3 && dom.querySelectorAll("ol > li").length === 2, "als html: ul en ol met hun punten", dom.innerHTML.slice(0, 200));
  meld(dom.querySelector("ul ul li")?.textContent === "Dieper", "het diepere punt staat in een lijst in de lijst");
  meld(!dom.querySelector("pre"), "een ingesprongen lijst wordt geen codeblok");
}

{
  const r = rtfNaarMarkdown(rtf(String.raw`\pard Prijs \u8364? en \uc0\u8364  zonder vervanging, \uc1\u-10179?\u-8704? en \u20013?\u25991?.\par`));
  meld(r.tekst.includes("Prijs € en € zonder vervanging"), "\\uN met en zonder vervangend teken (\\uc0)", r.tekst);
  meld(r.tekst.includes("😀"), "een paar \\uN met negatieve waarden wordt één teken");
  meld(r.tekst.includes("中文"), "unicode buiten Latijn");
}

{
  const r = rtfNaarMarkdown(rtf(String.raw`\pard Caf\'e9 kost \'80 3, \'93citaat\'94 \endash{} klaar\'85\par`));
  meld(r.tekst.includes("Café kost € 3, “citaat” – klaar…"), "codepagina 1252 met \\'hh, ook € en aanhalingstekens", r.tekst);
  const r2 = rtfNaarMarkdown(String.raw`{\rtf1\ansi\ansicpg1250 \pard \'8au\'9a\'ed\par}`);
  meld(r2.tekst.trim() === "Šuší", "codepagina 1250 uit \\ansicpg", r2.tekst);
  const r3 = rtfNaarMarkdown(new Uint8Array([...strToU8(String.raw`{\rtf1\ansi \pard Na`), 0xef, ...strToU8(String.raw`ve\par}`)]));
  meld(r3.tekst.trim() === "Naïve", "een hoge byte zonder escape gaat ook door de codepagina", r3.tekst);
}

{
  const kop = String.raw`{\colortbl;\red255\green0\blue0;}{\stylesheet{\ql Normal;}{\s1\ql\outlinelevel0 heading 1;}{\s2 kop 2;}{\*\cs10 Default Paragraph Font;}}{\*\generator Proef 1.0;}{\info{\title Titel}{\author Niemand}}`;
  const r = rtfNaarMarkdown(rtf(String.raw`\pard\s1 Uitgangspunten\par
\pard\s2 Belastingen\par
\pard\outlinelevel2 Derde niveau\par
\pard {\*\onbekend weg {\geneste groep} ermee}Zichtbaar{\field{\*\fldinst HYPERLINK "https://x"}{\fldrslt de link}} en {\header niet}{\footnote ook niet}tekst.\par`, kop));
  meld(/^# Uitgangspunten$/m.test(r.tekst) && /^## Belastingen$/m.test(r.tekst) && /^### Derde niveau$/m.test(r.tekst), "koppen uit de stijlenlijst en \\outlinelevel", r.tekst);
  meld(r.tekst.includes("Zichtbaarde link en tekst."), "onbekende \\*-groep (genest), veldcode, kop- en voettekst vallen weg; de uitkomst van het veld blijft", r.tekst);
  meld(!/Arial|Normal|Titel|Niemand|Proef|red255|Default/.test(r.tekst), "lettertypen, kleuren, stijlnamen en documentgegevens komen niet in de tekst");
}

{
  const r = rtfNaarMarkdown(rtf(String.raw`\pard Ster * en _laag_ en [haak] en <tag> en a|b en \\ en \{\}.\par
\pard # geen kop\par
\pard 3. geen lijst\par
\pard Regel een\line regel twee\tab na tab\par`));
  const dom = html(r.tekst);
  const p = [...dom.querySelectorAll("p")].map((x) => x.textContent);
  meld(p[0] === "Ster * en _laag_ en [haak] en <tag> en a|b en \\ en {}.", "tekens van Markdown en html blijven gewone tekst", p[0]);
  meld(p[1] === "# geen kop" && p[2] === "3. geen lijst", "een alinea die met # of 3. begint, wordt geen kop of lijst", p.slice(1, 3));
  meld(dom.querySelectorAll("p br").length === 1 && p[3]?.includes("na tab"), "\\line wordt een regeleinde, een tab blijft ruimte", p[3]);
}

{
  const r = rtfNaarMarkdown(rtf(String.raw`\pard Voor.\par
\trowd\cellx1000\cellx2000\pard\intbl Kop A\cell Kop B\cell\row
\trowd\cellx1000\cellx2000\pard\intbl {\b 1,5}\cell 2 | 3\cell\row
\pard Na de tabel.\par`));
  const dom = html(r.tekst);
  const cellen = [...dom.querySelectorAll("table th, table td")].map((c) => c.textContent);
  meld(JSON.stringify(cellen) === JSON.stringify(["Kop A", "Kop B", "1,5", "2 | 3"]), "een tabel met kop, en | als teken in een cel", cellen);
  meld(dom.querySelector("table td strong")?.textContent === "1,5", "opmaak in een cel blijft");
  meld(dom.firstElementChild?.textContent === "Voor." && dom.lastElementChild?.textContent === "Na de tabel.", "tekst voor en na de tabel op zijn plek");
}

{
  const png = "89504e470d0a1a0a0000000d49484452";
  const r = rtfNaarMarkdown(rtf(String.raw`\pard Figuur:\par
{\*\shppict{\pict\pngblip\picw1\pich1 ` + png + String.raw`}}{\nonshppict{\pict\wmetafile8 0100}}\par
{\pict\emfblip 01000000}\par`));
  const naam = Object.keys(r.beelden)[0];
  meld(Object.keys(r.beelden).length === 1 && /^rtf-beeld-1\.png$/.test(naam) && r.beelden[naam].startsWith("data:image/png;base64,iVBORw0KGgo"), "een PNG-afbeelding gaat mee als data-URL", r.beelden);
  meld(r.tekst.includes(`![](${naam})`), "en staat als afbeelding in de tekst");
  meld(JSON.stringify(r.meldingen) === JSON.stringify(["beeld:emf"]), "een EMF-afbeelding wordt gemeld; het alternatief naast een PNG niet", r.meldingen);
  meld(html(r.tekst, r.beelden).querySelector("img")?.getAttribute("src")?.startsWith("data:image/png"), "de afbeelding komt in de html uit het project");
}

meld(lijktOpRtf(strToU8("  {\\rtf1 x}")) && !lijktOpRtf(strToU8("{\\rtx")) && !lijktOpRtf(strToU8("PK")), "een RTF-bestand herkennen aan zijn begin");
meld(rtfNaarMarkdown("{\\rtf1 {\\b open").tekst.includes("<strong>open</strong>"), "een afgebroken bestand geeft wat er staat, zonder fout");

// ── Werkmap ───────────────────────────────────────────────────────────────────

console.log("\nWerkmapbereik");

const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const kolom = (k) => String.fromCharCode(65 + k);
/**
 * Een werkmap als XLSX. Een cel: tekst, getal, of { f, v } voor een formule.
 * `opmaak: true` geeft getallen de notatie #,##0.00.
 */
function maakWerkmap({ bladen, namen = {} }) {
  const cel = (w, r, k) => {
    const ref = `${kolom(k)}${r + 1}`;
    if (w === null || w === undefined) return "";
    if (typeof w === "number") return `<c r="${ref}" s="1"><v>${w}</v></c>`;
    if (typeof w === "object") return `<c r="${ref}" s="1"><f>${esc(w.f)}</f>${w.v === undefined ? "" : `<v>${w.v}</v>`}</c>`;
    return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(w)}</t></is></c>`;
  };
  const bestanden = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${bladen.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${bladen.map((b, i) => `<sheet name="${esc(b.naam)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets>${Object.keys(namen).length ? `<definedNames>${Object.entries(namen).map(([n, r]) => `<definedName name="${esc(n)}">${esc(r)}</definedName>`).join("")}</definedNames>` : ""}</workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${bladen.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rIdS" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="1"><font><sz val="11"/><name val="Arial"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="164" applyNumberFormat="1"/></cellXfs></styleSheet>`,
  };
  bladen.forEach((b, i) => {
    bestanden[`xl/worksheets/sheet${i + 1}.xml`] = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${b.rijen.map((rij, r) => `<row r="${r + 1}">${rij.map((w, k) => cel(w, r, k)).join("")}</row>`).join("")}</sheetData></worksheet>`;
  });
  return zipSync(Object.fromEntries(Object.entries(bestanden).map(([k, v]) => [k, strToU8(v)])));
}

const LASTEN = [
  ["Belasting", "q (kN/m²)", "γ", "qd"],
  ["Eigen gewicht", 2.5, 1.2, { f: "B2*C2", v: 3 }],
  ["Veranderlijk", 1.75, 1.5, { f: "B3*C3" }],
];
const werkmapV1 = maakWerkmap({
  bladen: [{ naam: "Lasten blad", rijen: [...LASTEN, [], ["Totaal", null, null, { f: "SUM(D2:D3)" }]] }, { naam: "Leeg", rijen: [] }],
  namen: { Belastingen: "'Lasten blad'!$A$1:$D$3", Kapot: "#REF!$A$1:$B$2", Twee: "'Lasten blad'!$A$1:$A$2,'Lasten blad'!$C$1:$C$2" },
});
// De gebruiker voegt binnen het bereik een rij in; de naam groeit mee, zoals een werkmap dat doet.
const werkmapV2 = maakWerkmap({
  bladen: [{ naam: "Lasten blad", rijen: [...LASTEN.slice(0, 3), ["Sneeuw", 0.56, 1.5, { f: "B4*C4" }], [], ["Totaal", null, null, { f: "SUM(D2:D4)" }]] }],
  namen: { Belastingen: "'Lasten blad'!$A$1:$D$4" },
});

{
  const wb = await openWerkmap(werkmapV1);
  meld(JSON.stringify(bereikNamen(wb)) === JSON.stringify(["Belastingen", "Twee"]), "de bereiknamen voor de keuzelijst, zonder kapotte namen", bereikNamen(wb));
  meld(JSON.stringify(werkbladen(wb)) === JSON.stringify(["Lasten blad", "Leeg"]), "de werkbladen");
  const b = leesBereik(wb, "Belastingen");
  meld(b.ok && b.blad === "Lasten blad" && b.a1 === "A1:D3", "een bereiknaam wijst naar werkblad en cellen", b);
  meld(b.ok && b.rijen[1][1] === "2.50" && b.rijen[2][1] === "1.75", "getallen zoals de werkmap ze toont (#,##0.00)", b.ok && b.rijen);
  meld(b.ok && b.rijen[1][3] === "3.00" && b.rijen[2][3] === "2.63", "formules als hun uitkomst, ook zonder bewaarde uitkomst", b.ok && b.rijen.map((r) => r[3]));
  const md = b.ok ? bereikNaarMarkdown(b) : "";
  meld(md.split("\n")[1] === "| --- | --- | ---: | ---: |" || md.split("\n")[1] === "| --- | ---: | ---: | ---: |", "kolommen met alleen getallen rechts uitgelijnd", md.split("\n")[1]);
  const dom = html(md);
  meld(dom.querySelectorAll("thead th").length === 4 && dom.querySelectorAll("tbody tr").length === 2, "als html: een tabel met kop en twee rijen");
  meld(dom.querySelector("thead th")?.textContent === "Belasting" && dom.querySelectorAll("thead th")[1]?.textContent === "q (kN/m²)", "de kop is de eerste rij, tekens blijven");
  const c = leesBereik(wb, "'Lasten blad'!$A$2:$B$3");
  meld(c.ok && c.rijen.length === 2 && c.rijen[0][0] === "Eigen gewicht", "werkblad met cellen, met aanhalingstekens en $", c);
  const leeg = leesBereik(wb, "'Lasten blad'!A1:F9");
  meld(leeg.ok && leeg.rijen.length === 5 && leeg.rijen[3].every((c) => c === "") && leeg.rijen.every((r) => r.length === 4), "lege rijen en kolommen aan het eind vallen weg, een lege rij ertussen niet", leeg.ok && leeg.rijen.length);
  meld(leesBereik(wb, "belastingen").ok, "een bereiknaam zonder op hoofdletters te letten");
  const weg = leesBereik(wb, "Windlast");
  meld(!weg.ok && weg.reden === "naamOntbreekt" && weg.detail === "Windlast", "een ontbrekende bereiknaam", weg);
  const geenBlad = leesBereik(wb, "Wind!A1:B2");
  meld(!geenBlad.ok && geenBlad.reden === "bladOntbreekt", "een ontbrekend werkblad", geenBlad);
  const kapot = leesBereik(wb, "Kapot");
  meld(!kapot.ok && kapot.reden === "naamKapot", "een bereiknaam die naar verwijderde cellen wijst", kapot);
  const twee = leesBereik(wb, "Twee");
  meld(!twee.ok && twee.reden === "meerdereGebieden", "een bereiknaam met twee gebieden", twee);
  const groot = leesBereik(wb, "'Lasten blad'!A1:Z1000");
  meld(!groot.ok && groot.reden === "teGroot" && 26 * 1000 > MAX_CELLEN, "een te groot bereik", groot);
  meld(!leesBereik(wb, "A1:B2").ok && leesBereik(wb, "A1:B2").reden === "ongeldig", "cellen zonder werkblad zijn geen verwijzing");
  wb.sluit();
}

{
  const v1 = await openWerkmap(werkmapV1);
  const v2 = await openWerkmap(werkmapV2);
  const voor = leesBereik(v1, "Belastingen");
  const na = leesBereik(v2, "Belastingen");
  meld(voor.ok && na.ok && voor.rijen.length === 3 && na.rijen.length === 4 && na.rijen[3][0] === "Sneeuw" && na.a1 === "A1:D4", "na een ingevoegde rij groeit het benoemde bereik mee", na.ok && na.rijen);
  const vast = leesBereik(v2, "'Lasten blad'!A1:D3");
  meld(vast.ok && vast.rijen.length === 3, "vaste cellen groeien niet mee");
  v1.sluit();
  v2.sluit();
}

const verwijzingen = [
  ["Belastingen", { soort: "naam", naam: "Belastingen" }],
  ["=Belastingen", { soort: "naam", naam: "Belastingen" }],
  ["Belastingen!B4:F20", { soort: "cellen", blad: "Belastingen", a1: "B4:F20" }],
  ["'Blad 1'!$a$1:$c$9", { soort: "cellen", blad: "Blad 1", a1: "A1:C9" }],
  ["'O''Neill'!A1", { soort: "cellen", blad: "O'Neill", a1: "A1" }],
  ["B4", null],
  ["Blad!", null],
  ["", null],
];
for (const [tekst, verwacht] of verwijzingen) {
  meld(JSON.stringify(ontleedVerwijzing(tekst)) === JSON.stringify(verwacht), `verwijzing "${tekst}"`, ontleedVerwijzing(tekst));
}
meld(verwijzingTekst({ soort: "cellen", blad: "Blad 1", a1: "A1:B2" }) === "'Blad 1'!A1:B2" && verwijzingTekst({ soort: "cellen", blad: "Lasten", a1: "A1" }) === "Lasten!A1", "een verwijzing terug als tekst");

// ── Paden ─────────────────────────────────────────────────────────────────────

console.log("\nPaden");
const paden = [
  [relatiefPad("C:\\Proj\\2026", "C:\\Proj\\2026\\bron\\lasten.xlsx"), "bron/lasten.xlsx"],
  [relatiefPad("c:\\proj\\2026", "C:\\Proj\\Bronnen\\x.rtf"), "../Bronnen/x.rtf"],
  [relatiefPad("C:\\Proj", "D:\\x.rtf"), undefined],
  [relatiefPad("/home/a/proj", "/home/a/proj/x.rtf"), "x.rtf"],
  [relatiefPad("/home/a/proj", "/home/A/x.rtf"), "../../A/x.rtf"],
  [losOp("D:\\Nieuw\\2026", "bron/lasten.xlsx"), "D:\\Nieuw\\2026\\bron\\lasten.xlsx"],
  [losOp("D:\\Nieuw", "../x.rtf"), "D:\\x.rtf"],
  [losOp("/srv/p", "../b/x.rtf"), "/srv/b/x.rtf"],
  [losOp("\\\\server\\deel\\p", "x.rtf"), "\\\\server\\deel\\p\\x.rtf"],
  [mapVan("C:\\Proj\\project.ifcx"), "C:\\Proj"],
  [mapVan("C:\\project.ifcx"), "C:\\"],
  [losOp(mapVan("C:\\project.ifcx"), "a/b.rtf"), "C:\\a\\b.rtf"],
];
paden.forEach(([kreeg, verwacht], i) => meld(kreeg === verwacht, `pad ${i + 1}: ${verwacht}`, kreeg));
{
  const k = { soort: "rtf", pad: "C:\\Oud\\p\\bron.rtf", relatief: "bron.rtf", gelezenOp: "", hash: "" };
  meld(JSON.stringify(kandidaatPaden(k, "D:\\Nieuw\\p\\project.ifcx")) === JSON.stringify(["D:\\Nieuw\\p\\bron.rtf", "C:\\Oud\\p\\bron.rtf"]), "eerst naast het project zoeken, dan op het absolute pad");
  meld(JSON.stringify(kandidaatPaden(k, null)) === JSON.stringify(["C:\\Oud\\p\\bron.rtf"]), "zonder projectbestand alleen het absolute pad");
  meld(metPlek(k, "C:\\Oud\\p\\bron.rtf", "C:\\Oud\\p\\nieuw\\project.ifcx").relatief === "../bron.rtf", "na opslaan elders een nieuw relatief pad");
}

// ── Bijwerken met bestanden op schijf ─────────────────────────────────────────

console.log("\nBijwerken");
const tmp = mkdtempSync(join(tmpdir(), "ocss-koppeling-"));
const toegang = {
  async wijzigingstijd(pad) {
    try {
      const s = statSync(pad);
      return s.isFile() ? s.mtimeMs : null;
    } catch {
      return null;
    }
  },
  async lees(pad) {
    return new Uint8Array(readFileSync(pad));
  },
};
/** Schrijft een bestand met een wijzigingstijd die zeker anders is dan de vorige. */
let klok = Date.parse("2026-01-01T00:00:00Z") / 1000;
function schrijf(pad, bytes) {
  mkdirSync(dirname(pad), { recursive: true });
  writeFileSync(pad, bytes);
  klok += 60;
  utimesSync(pad, klok, klok);
}

try {
  const projMap = join(tmp, "project-a");
  const projPad = join(projMap, "project.ifcx");
  const bronPad = join(projMap, "bronnen", "lasten.xlsx");
  schrijf(bronPad, werkmapV1);
  const k0 = metPlek({ soort: "werkmapbereik", pad: bronPad, verwijzing: "Belastingen", gelezenOp: "2026-01-01T00:00:00.000Z", hash: inhoudHash(werkmapV1) }, bronPad, projPad);
  meld(k0.relatief === "bronnen/lasten.xlsx", "de koppeling krijgt een pad relatief tot het project", k0.relatief);
  const wb = await openWerkmap(werkmapV1);
  let md = { bestandsnaam: "lasten.xlsx", tekst: bereikNaarMarkdown(leesBereik(wb, "Belastingen")), koppeling: k0 };
  wb.sluit();
  const nu = () => new Date("2026-02-02T10:00:00Z");

  let c = await controleerKoppeling(md, { projectPad: projPad, toegang, omzetten, nu });
  meld(c.staat === "ongewijzigd" && !c.koppeling, "dezelfde bytes: niets te doen", c.staat);
  const vorige = c.gezien;
  let gelezen = 0;
  const tellend = { ...toegang, lees: async (p) => (gelezen++, toegang.lees(p)) };
  c = await controleerKoppeling(md, { projectPad: projPad, toegang: tellend, omzetten, vorige, nu });
  meld(c.staat === "ongewijzigd" && gelezen === 0, "dezelfde wijzigingstijd: het bestand wordt niet eens gelezen", gelezen);

  schrijf(bronPad, werkmapV2);
  c = await controleerKoppeling(md, { projectPad: projPad, toegang: tellend, omzetten, vorige, nu });
  meld(c.staat === "bijgewerkt" && gelezen === 1, "na opslaan van de werkmap: bijgewerkt", c.staat);
  meld(c.staat === "bijgewerkt" && c.md.tekst.includes("Sneeuw") && c.md.koppeling.hash === inhoudHash(werkmapV2) && c.md.koppeling.gelezenOp === "2026-02-02T10:00:00.000Z", "de nieuwe rij staat erin, met nieuwe hash en leesmoment");
  md = c.md;
  const vorige2 = c.gezien;

  schrijf(bronPad, werkmapV2);
  c = await controleerKoppeling(md, { projectPad: projPad, toegang, omzetten, vorige: vorige2, nu });
  meld(c.staat === "ongewijzigd", "opnieuw opgeslagen zonder wijziging: het blad blijft gelijk", c.staat);

  // Het bereik verdwijnt uit de werkmap: de kopie blijft, met een fout.
  const zonderNaam = maakWerkmap({ bladen: [{ naam: "Lasten blad", rijen: LASTEN }] });
  schrijf(bronPad, zonderNaam);
  c = await controleerKoppeling(md, { projectPad: projPad, toegang, omzetten, vorige: vorige2, nu });
  meld(c.staat === "fout" && c.reden === "naamOntbreekt", "het benoemde bereik is weg: een fout, geen nieuwe tekst", c);
  const zonderBlad = maakWerkmap({ bladen: [{ naam: "Anders", rijen: LASTEN }] });
  schrijf(bronPad, zonderBlad);
  c = await controleerKoppeling({ ...md, koppeling: { ...md.koppeling, verwijzing: "'Lasten blad'!A1:D3" } }, { projectPad: projPad, toegang, omzetten, nu });
  meld(c.staat === "fout" && c.reden === "bladOntbreekt", "het werkblad is weg: een fout", c);
  schrijf(bronPad, strToU8("geen werkmap"));
  c = await controleerKoppeling(md, { projectPad: projPad, toegang, omzetten, nu });
  meld(c.staat === "fout" && c.reden === "geenWerkmap", "een ander bestand op dezelfde plek: een fout", c);
  schrijf(bronPad, werkmapV2);

  // De hele projectmap verhuist: de bron wordt gevonden via het relatieve pad.
  const projMapB = join(tmp, "elders", "project-b");
  mkdirSync(dirname(projMapB), { recursive: true });
  renameSync(projMap, projMapB);
  c = await controleerKoppeling(md, { projectPad: join(projMapB, "project.ifcx"), toegang, omzetten, nu });
  const nieuwPad = join(projMapB, "bronnen", "lasten.xlsx");
  meld(c.staat === "ongewijzigd" && c.koppeling?.pad === nieuwPad, "een verplaatste projectmap: de bron naast het project, het absolute pad bijgewerkt", c);

  // Zonder projectbestand en met een oud absoluut pad: ontbreekt.
  c = await controleerKoppeling(md, { projectPad: null, toegang, omzetten, nu });
  meld(c.staat === "ontbreekt" && c.gezocht.length === 1, "de bron staat niet op het absolute pad en er is geen projectbestand: ontbreekt", c);

  // RTF: overschrijven met een nieuwe versie op dezelfde plek.
  const rtfPad = join(projMapB, "toelichting.rtf");
  const rtfV1 = strToU8(rtf(String.raw`\pard Versie {\b een}.\par`));
  const rtfV2 = strToU8(rtf(String.raw`\pard Versie {\b twee}.\par{\pntext\'b7\tab}\pard\li720 punt\par`));
  schrijf(rtfPad, rtfV1);
  const r1 = rtfNaarMarkdown(rtfV1);
  let rmd = { bestandsnaam: "toelichting.rtf", tekst: r1.tekst, koppeling: metPlek({ soort: "rtf", pad: rtfPad, gelezenOp: "2026-01-01T00:00:00.000Z", hash: inhoudHash(rtfV1) }, rtfPad, join(projMapB, "project.ifcx")) };
  schrijf(`${rtfPad}.nieuw`, rtfV2);
  rmSync(rtfPad);
  renameSync(`${rtfPad}.nieuw`, rtfPad);
  klok += 60;
  utimesSync(rtfPad, klok, klok);
  c = await controleerKoppeling(rmd, { projectPad: join(projMapB, "project.ifcx"), toegang, omzetten, nu });
  meld(c.staat === "bijgewerkt" && c.md.tekst.includes("<strong>twee</strong>") && c.md.tekst.includes("- punt"), "een RTF-bestand vervangen door een nieuwe versie: bijgewerkt", c.staat === "bijgewerkt" && c.md.tekst);
  rmd = c.md;
  rmSync(rtfPad);
  c = await controleerKoppeling(rmd, { projectPad: join(projMapB, "project.ifcx"), toegang, omzetten, nu });
  meld(c.staat === "ontbreekt", "het RTF-bestand is weg: ontbreekt, en de tekst blijft de kopie", c.staat);
  meld(rmd.tekst.includes("twee") && existsSync(projMapB), "de kopie in het blad is niet aangeraakt");

  // ── Opslaan en heropenen ───────────────────────────────────────────────────
  console.log("\nOpslaan en heropenen");
  const project = {
    versie: PROJECT_FORMAAT_VERSIE,
    naam: "Proef koppeling",
    gegevens: legeGegevens(),
    rapport: undefined,
    exemplaren: [
      { id: "ex-reken", naam: "Reken", templateId: "", source: "a = 2", waarden: {}, elementen: [] },
      { id: "ex-bereik", naam: "Belastingen", templateId: MARKDOWN_BLAD, source: "", waarden: {}, elementen: [], md },
      { id: "ex-rtf", naam: "Toelichting", templateId: MARKDOWN_BLAD, source: "", waarden: {}, elementen: [], md: { ...rmd, beelden: { "rtf-beeld-1.png": "data:image/png;base64,iVBORw0KGgo=" } } },
    ],
  };
  const bladen = bladenVoorIfc(project);
  const doc = projectIfcx(project, bladen);
  const afw = afwijkingen(doc);
  meld(afw.length === 0, "het IFCX met koppelingen voldoet aan de specificatie", afw.slice(0, 5));
  const terug = leesProjectBestand(bouwProjectBestand(project, bladen), "proef");
  const b = terug.exemplaren.find((e) => e.id === "ex-bereik");
  const r = terug.exemplaren.find((e) => e.id === "ex-rtf");
  meld(zelfde(b?.md?.koppeling, md.koppeling), "de koppeling van het werkmapbereik komt terug", b?.md?.koppeling);
  meld(b?.md?.tekst === md.tekst, "de bewaarde kopie komt teken voor teken terug");
  meld(zelfde(r?.md?.koppeling, rmd.koppeling) && r?.md?.beelden?.["rtf-beeld-1.png"], "de koppeling en afbeeldingen van het RTF-blad komen terug");
  meld(b?.md?.koppeling?.relatief === "bronnen/lasten.xlsx", "met het relatieve pad");
  meld(leesMarkdownBestand({ tekst: "x", koppeling: { soort: "onzin", pad: "x" } })?.koppeling === undefined, "een onbruikbare koppeling valt weg, de tekst blijft");
  meld(leesKoppeling({ soort: "werkmapbereik", pad: "x.xlsx", gelezenOp: "", hash: "" }) === undefined, "een werkmapbereik zonder verwijzing is geen koppeling");
  meld(leesMarkdownBestand({ tekst: "x" })?.koppeling === undefined, "een gewoon Markdown-blad blijft ongekoppeld");
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

// ── Melding ───────────────────────────────────────────────────────────────────

console.log("\nMelding bij een ontbrekende bron");
{
  const k = { soort: "rtf", pad: "C:\\p\\toelichting.rtf", gelezenOp: "2026-02-02T10:00:00.000Z", hash: "x" };
  const opties = (toegang) => ({ bestandstoegang: toegang, datum: "2 feb 2026 11:00" });
  const m1 = meldingVoor(k, { staat: "ontbreekt" }, opties(true));
  meld(m1?.sleutel === "koppeling.ontbreekt" && m1.waarden.bestand === "toelichting.rtf" && m1.waarden.datum === "2 feb 2026 11:00", "ontbreekt: een melding met bestand en datum van de laatste lezing", m1);
  meld(meldingVoor(k, { staat: "fout", reden: "naamOntbreekt" }, opties(true))?.waarden.reden === "koppeling.reden.naamOntbreekt", "niet bij te werken: een melding met de reden");
  meld(meldingVoor(k, undefined, opties(false))?.sleutel === "koppeling.geenToegang", "in de browser zonder stand: alleen de bewaarde kopie, met melding");
  const m4 = meldingVoor(k, undefined, opties(true));
  meld(m4?.sleutel === "koppeling.lezen" && m4.laadt === true, "in de app zolang de bron niet bekeken is: lezen, en de afdruk wacht");
  meld(meldingVoor(k, { staat: "actueel" }, opties(true)) === null, "alleen een actuele kopie heeft geen melding");
  for (const taal of ["nl", "en"]) {
    const t = JSON.parse(readFileSync(join(hier, `../packages/desktop/src/i18n/locales/${taal}/rapport.json`), "utf8"));
    const kp = t.koppeling;
    const goed = ["ontbreekt", "fout", "geenToegang"].every((s) => kp?.[s]?.includes("{{datum}}") && kp[s].includes("{{bestand}}"))
      && ["naamOntbreekt", "naamKapot", "meerdereGebieden", "bladOntbreekt", "teGroot", "leesFout", "geenRtf", "geenWerkmap", "ongeldig"].every((r) => typeof kp?.reden?.[r] === "string");
    meld(goed, `de meldingen staan in rapport.json (${taal}), met bestand en datum`);
  }
}

// ── Sjabloon ──────────────────────────────────────────────────────────────────

console.log("\nWerkmapsjabloon");
{
  const bladen = [
    { naam: "Uitgangspunten" },
    { naam: "Belastingen", md: { koppeling: { soort: "werkmapbereik", verwijzing: "Belastingen" } } },
    { naam: "Toelichting", md: { koppeling: { soort: "rtf" } } },
    { naam: "Vloer", md: { koppeling: { soort: "werkmapbereik", verwijzing: "'Lasten blad'!A1:B3" } } },
    { naam: "Windlast", md: { koppeling: { soort: "werkmapbereik", verwijzing: "Wind" } } },
  ];
  const sj = maakSjabloon(bladen);
  meld(sj.onderdelen.length === 3 && sj.onderdelen[0].na === "Uitgangspunten" && sj.onderdelen[0].plek === 1, "het sjabloon neemt alleen werkmapbereiken mee, met plek en blad ervoor", sj.onderdelen);
  const terug = leesSjabloon(JSON.parse(JSON.stringify(sj)));
  meld(JSON.stringify(terug) === JSON.stringify(sj), "het sjabloon komt via JSON ongewijzigd terug");
  meld(leesSjabloon({ soort: "iets anders", onderdelen: [] }) === null && leesSjabloon({ soort: sj.soort, onderdelen: [{ verwijzing: "B4" }] }) === null, "een ander bestand of zonder bruikbare onderdelen: geen sjabloon");
  // Een nieuw project: de werkmap heeft geen bereiknamen, wel het werkblad.
  const nieuweWerkmap = maakWerkmap({ bladen: [{ naam: "Lasten blad", rijen: LASTEN }], namen: { Belastingen: "'Lasten blad'!$A$1:$D$2" } });
  const wb = await openWerkmap(nieuweWerkmap);
  const getoetst = toetsSjabloon(wb, sj);
  wb.sluit();
  meld(getoetst[0].bereik.ok && getoetst[0].bereik.rijen.length === 2, "een bereiknaam in de nieuwe werkmap wordt gevonden");
  meld(getoetst[1].bereik.ok && getoetst[1].bereik.rijen[1][0] === "Eigen gewicht", "werkblad met cellen werkt ook zonder bereiknaam");
  meld(!getoetst[2].bereik.ok && getoetst[2].bereik.reden === "naamOntbreekt", "een ontbrekende bereiknaam wordt gemeld");
  meld(plekVoor(sj.onderdelen[0], ["Uitgangspunten", "Fundering"]) === 1 && plekVoor(sj.onderdelen[0], ["Fundering"]) === 1 && plekVoor({ ...sj.onderdelen[0], plek: 9 }, []) === 0, "de plek: achter het blad ervoor, anders op zijn plek of achteraan");
}

// ── Wachter ───────────────────────────────────────────────────────────────────

console.log("\nWachter");
{
  let bezig = 0;
  let maxBezig = 0;
  let rondes = 0;
  let vrij;
  const w = new Wachter(async () => {
    bezig++;
    maxBezig = Math.max(maxBezig, bezig);
    rondes++;
    if (rondes === 1) await new Promise((ok) => { vrij = ok; });
    bezig--;
  });
  const a = w.nu();
  const b = w.nu();
  const c = w.nu();
  vrij();
  await Promise.all([a, b, c]);
  meld(maxBezig === 1, "nooit twee controles tegelijk");
  meld(rondes === 2, "verzoeken tijdens een controle geven samen één controle erna", rondes);
  const fout = new Wachter(async () => { throw new Error("proef"); });
  const fouten0 = console.error;
  console.error = () => {};
  await fout.nu();
  console.error = fouten0;
  meld(true, "een fout in een controle houdt de wachter niet tegen");
}

console.log(fouten === 0 ? "\nAlle controles geslaagd." : `\n${fouten} controle(s) gezakt.`);
process.exit(fouten === 0 ? 0 : 1);
