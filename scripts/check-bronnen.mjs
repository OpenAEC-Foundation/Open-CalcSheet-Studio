/**
 * Een normartikel koppelen aan de pagina in een eigen PDF: `@bron` (core: bronBlok.ts, app:
 * components/calc/bronnen.ts en BronVenster.tsx).
 *
 * Wat er moet gelden:
 *   - `@bron #4 p. 57 "NEN-EN 1995-1-1, 6.1.7(2)"` geeft een tekstregel met het doel en de
 *     pagina in data-attributen; ook `p.57`, `pagina 57`, `page 57`, een pad tussen
 *     aanhalingstekens en een adres;
 *   - een pad of adres blijft letterlijk: de kern maakt van `norm.pdf` geen `norm_pdf`, en
 *     van `#4` geen verwijzing naar een waarde;
 *   - wat in het blad staat, komt nooit als html op de pagina (een `<script>` in de tekst
 *     wordt tekst);
 *   - het rekenen verandert er niet door, en binnen `#hide` staat de regel er niet;
 *   - op papier en op het scherm "Bron:" ervoor, en de plek: het PDF-blad met zijn naam, of
 *     de bestandsnaam, en de pagina;
 *   - een klik op een verwijzing naar een PDF-blad opent dat blad; een blad dat er niet is
 *     of geen PDF is, geeft een melding.
 *
 * Draaien:  node scripts/check-bronnen.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { parse, evaluate, render, leesBron, bronHtml } from "../packages/core/dist/index.js";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";
import { PDF_BLAD } from "../packages/desktop/src/store/pdfBijlage.ts";

// De app-kant gaat via de echte bundel in jsdom: bronnen.ts gebruikt de stores.
const { laadRapportAfdruk } = await import("./lib/rapport-html.mjs");
const m = await laadRapportAfdruk();
const { bronnenInvullen, bronSoort } = m;

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};

console.log("Lezen");
const gevallen = [
  ['#4 p. 57 "NEN-EN 1995-1-1, 6.1.7(2)"', { doel: "#4", pagina: 57, tekst: "NEN-EN 1995-1-1, 6.1.7(2)" }],
  ['#4 p.57 "A"', { doel: "#4", pagina: 57, tekst: "A" }],
  ['"D:\\Normen\\NEN-EN 1993.pdf" pagina 41 "B"', { doel: "D:\\Normen\\NEN-EN 1993.pdf", pagina: 41, tekst: "B" }],
  ["https://voorbeeld.nl/norm.pdf page 3", { doel: "https://voorbeeld.nl/norm.pdf", pagina: 3, tekst: "" }],
  ['#2 "zonder pagina"', { doel: "#2", pagina: null, tekst: "zonder pagina" }],
  ["#2 p. 0", { doel: "#2", pagina: null, tekst: "" }],
];
for (const [regel, verwacht] of gevallen) {
  const b = leesBron(regel);
  meld(JSON.stringify(b) === JSON.stringify(verwacht), `@bron ${regel}`, JSON.stringify(b));
}
meld(bronSoort("#4") === "blad" && bronSoort("https://x.nl/a.pdf") === "adres" && bronSoort("C:\\a.pdf") === "pad", "de soort van het doel");

console.log("\nIn de kern");
const BRON = `"Proef
a = 2
@bron #4 p.57 "NEN-EN 1995-1-1, 6.1.7(2)"
@bron D:/normen/en1993.pdf p. 9 "NEN-EN 1993-1-1, 6.2.5"
@bron https://voorbeeld.nl/norm.pdf p. 3 "Norm"
@bron #4 p. 1 "<script>alert(1)</script>"
#hide
@bron #4 p. 2 "verborgen"
#show
b = 2*a
`;
const html = render(evaluate(parse(BRON), {}));
meld(html.includes('data-bron="#4" data-pagina="57"'), "#4 en p.57 blijven letterlijk", html.match(/data-bron="#4"[^>]*/)?.[0]);
meld(html.includes('data-bron="D:/normen/en1993.pdf" data-pagina="9"'), "een pad met een punt blijft letterlijk");
meld(html.includes('data-bron="https://voorbeeld.nl/norm.pdf"'), "een adres blijft letterlijk");
meld(!html.includes("<script>") && html.includes("&lt;script&gt;"), "een <script> in de omschrijving wordt tekst");
meld(!html.includes("verborgen"), "binnen #hide staat de regel er niet");
const zonder = render(evaluate(parse(BRON.replace(/^@bron.*$/gm, "")), {}));
meld((html.match(/class="calc-line"/g) ?? []).length === (zonder.match(/class="calc-line"/g) ?? []).length && html.includes("b = 2·a") === zonder.includes("b = 2·a"),
  "het rekenen verandert er niet door");
meld(bronHtml({ doel: '"x', pagina: null, tekst: "" }).includes('data-bron="&quot;x"'), "een aanhalingsteken in het doel wordt ontsnapt");

console.log("\nIngevuld voor scherm en papier");
const t = { label: "Bron:", blad: (ref, naam) => (naam ? `blad ${ref} ${naam}` : `blad ${ref}, niet in dit project`), pagina: (n) => `p. ${n}` };
const bladen = [{ ref: "4", naam: "Normtekst hout" }];
const ingevuld = bronnenInvullen(html, t, bladen);
meld(ingevuld.includes('<span class="calc-bron-label">Bron: </span><a class="calc-bron-link" role="link" tabindex="0">NEN-EN 1995-1-1, 6.1.7(2)</a><span class="calc-bron-plek"> (blad #4 Normtekst hout, p. 57)</span>'),
  "een PDF-blad: label, link en de naam van het blad met de pagina");
meld(ingevuld.includes("(en1993.pdf, p. 9)") && ingevuld.includes("(norm.pdf, p. 3)"), "een pad of adres: de bestandsnaam met de pagina");
meld(bronnenInvullen(html, t, []).includes("(blad #4, niet in dit project, p. 57)"), "een blad dat er niet is, zegt dat");
meld(ingevuld.includes('data-bron-soort="blad"') && ingevuld.includes('data-bron-soort="pad"') && ingevuld.includes('data-bron-soort="adres"'), "de soort staat erbij");
meld(bronnenInvullen("<p>niets</p>", t, bladen) === "<p>niets</p>", "zonder verwijzing blijft de html gelijk");

console.log("\nIn de app (jsdom): papier en openen");
await m.i18next.changeLanguage("nl");
const reken = { id: "r", ref: "1", naam: "Ligger", templateId: "", source: BRON, waarden: {}, elementen: [] };
const pdf = { id: "p", ref: "4", naam: "Normtekst hout", templateId: PDF_BLAD, source: "", waarden: {}, elementen: [] };
const tekst = { id: "t", ref: "5", naam: "Notitie", templateId: "", source: "a = 1\n", waarden: {}, elementen: [] };
m.useProjectStore.getState().laadProject({ projectNaam: "Proef", gegevens: legeGegevens(), exemplaren: [reken, pdf, tekst] });
const papier = m.tekenUitdraai();
meld(papier.includes("Bron: </span>") && papier.includes("(blad #4 Normtekst hout, p. 57)"), "op papier de bronvermelding met het PDF-blad en de pagina");
await m.i18next.changeLanguage("en");
meld(m.tekenUitdraai().includes("Source: </span>") && m.tekenUitdraai().includes("(sheet #4 Normtekst hout, p. 57)"), "in het Engels");
const meldingen = { geenBlad: "geen blad", geenPdf: "geen pdf", alleenApp: "alleen app" };
meld((await m.openBron("#4", 57, meldingen)) === null && m.useProjectStore.getState().activeId === "p", "een klik op #4 opent het PDF-blad");
meld((await m.openBron("#9", 1, meldingen)) === "geen blad", "een blad dat er niet is: melding");
meld((await m.openBron("#5", 1, meldingen)) === "geen pdf", "een blad dat geen PDF is: melding");
meld((await m.openBron("D:/normen/a.pdf", 3, meldingen)) === "alleen app", "een pad op schijf in de browser: melding");
meld((await m.openBron("D:/normen/a.docx", 3, meldingen)) === "geen pdf", "een pad dat geen PDF is: melding");

console.log(fouten === 0 ? "\nBronnen: alles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
