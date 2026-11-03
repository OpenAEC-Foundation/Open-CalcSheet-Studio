/**
 * Controle van het Markdown-blad.
 *
 * Toetst:
 *   • de tekst komt teken voor teken terug uit het projectbestand (IFCX), naast een
 *     rekenblad en een PDF-blad, en een ander blad krijgt geen tekst;
 *   • een Markdown-blad wordt niet doorgerekend, krijgt geen rekentekst, invoer of
 *     oordeel, en de STEP noemt het als bijlage met het juiste type;
 *   • wat in de html komt: koppen, lijsten, tabellen, code en afbeeldingen, en wat
 *     de opschoning eruit haalt, met de regel voor afbeeldingen van buiten;
 *   • op papier gaat lange inhoud in stukken, zonder dat er iets verloren gaat;
 *   • de koppen voor de inhoudsopgave;
 *   • de afbeeldingen naast een bestand: wat wel en niet gelezen wordt;
 *   • oude bestanden en onbruikbare velden blijven leesbaar.
 *
 * Draaien:  node scripts/check-markdown.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import createDOMPurify from "dompurify";
import { JSDOM } from "jsdom";
import { bouwProjectBestand, leesProjectBestand, normaliseerExemplaar, PROJECT_FORMAAT_VERSIE } from "../packages/desktop/src/store/projectBestand.ts";
import { bladenVoorIfc, projectIfcx, projectStep } from "../packages/desktop/src/store/projectIfcx.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";
import { isLosBlad } from "../packages/desktop/src/store/spreadsheetBlad.ts";
import {
  bladnaamVoorMarkdown, isMarkdownBlad, leesMarkdownBestand, MARKDOWN_BLAD, tekstUitBytes,
} from "../packages/desktop/src/store/markdownBlad.ts";
import { maakOpschoner } from "../packages/desktop/src/components/calc/uitwerkingRegels.ts";
import {
  beeldAdressen, isRelatiefAdres, koppenVoorInhoud, leesMarkdown, markdownVoorPapier, markdownVoorScherm, verzamelBeelden,
} from "../packages/desktop/src/components/calc/markdownRegels.ts";
import { logboekTekst, notitieTekst, LANG } from "./lib/gemengd-project.mjs";

let fouten = 0;
function meld(ok, tekst, detail) {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}${ok || detail === undefined ? "" : `   (${JSON.stringify(detail)})`}`);
  if (!ok) fouten++;
}

const { window } = new JSDOM("");
globalThis.DOMParser = window.DOMParser;
const schoon = maakOpschoner(createDOMPurify(window));
const dom = (html) => new window.DOMParser().parseFromString(html, "text/html").body;

console.log("\nHet projectbestand");
const TEKST = "# Kop\r\n\r\nÉén regel met ü, € en \"aanhalingstekens\".\n\n- een\n- twee\n";
const BEELD = "data:image/png;base64,iVBORw0KGgo=";
const project = {
  versie: PROJECT_FORMAAT_VERSIE,
  naam: "Proef",
  gegevens: legeGegevens(),
  rapport: undefined,
  exemplaren: [
    { id: "ex-reken", naam: "Reken", templateId: "", source: "a = 2", waarden: {}, elementen: [] },
    {
      id: "ex-md", naam: "Notitie", templateId: MARKDOWN_BLAD, source: "", waarden: {}, elementen: [],
      md: { bestandsnaam: "notitie.md", tekst: TEKST, beelden: { "foto.png": BEELD }, koppenUit: true },
    },
    { id: "ex-pdf", naam: "Bijlage", templateId: "pdf", source: "", waarden: {}, elementen: [], pdf: { bestandsnaam: "b.pdf", data: "JVBERi0=" } },
    { id: "ex-md-leeg", naam: "Leeg", templateId: MARKDOWN_BLAD, source: "", waarden: {}, elementen: [], md: { bestandsnaam: "", tekst: "" } },
  ],
};
const bladen = bladenVoorIfc(project);
const mdBlad = bladen.find((b) => b.id === "ex-md");
meld(mdBlad.nodes.length === 0 && !mdBlad.fout, "een Markdown-blad wordt niet doorgerekend");

const opgeslagen = bouwProjectBestand(project, bladen);
const terug = leesProjectBestand(opgeslagen, "proef");
const opId = (id) => terug.exemplaren.find((e) => e.id === id);
meld(opId("ex-md")?.md?.tekst === TEKST, "de tekst komt teken voor teken terug, ook de regeleinden");
meld(opId("ex-md")?.md?.bestandsnaam === "notitie.md", "de bestandsnaam komt terug");
meld(opId("ex-md")?.md?.beelden?.["foto.png"] === BEELD, "de afbeeldingen komen terug");
meld(opId("ex-md")?.md?.koppenUit === true, "de keuze voor de inhoudsopgave komt terug");
meld(opId("ex-md")?.templateId === MARKDOWN_BLAD && isMarkdownBlad(opId("ex-md")), "het blijft een Markdown-blad");
meld(opId("ex-md")?.source === "", "de rekentekst blijft leeg");
meld(opId("ex-md-leeg")?.md?.tekst === "", "een lege tekst blijft een lege tekst");
meld(!("md" in opId("ex-reken")) && !("md" in opId("ex-pdf")), "een ander blad krijgt geen tekst");
meld(opId("ex-pdf")?.pdf?.data === "JVBERi0=", "het PDF-blad ernaast blijft heel");
const nogEens = bouwProjectBestand({ ...project, exemplaren: terug.exemplaren }, bladenVoorIfc({ ...project, exemplaren: terug.exemplaren }));
meld(leesProjectBestand(nogEens, "proef").exemplaren.find((e) => e.id === "ex-md")?.md?.tekst === TEKST, "ook na een tweede keer opslaan");

const doc = projectIfcx(project, bladen);
const attr = doc.data.find((k) => k.attributes?.["ocss::blad"]?.id === "ex-md").attributes;
meld(attr["ocss::blad"].soort === "markdown", "in het IFCX staat de soort markdown");
meld(attr["ocss::blad::markdown"].mediaType === "text/markdown", "met het mediatype van Markdown");
meld(attr["ocss::blad::markdown"].tekst === TEKST, "en de tekst als gewone tekst, niet gecodeerd");
meld(attr["ocss::blad::markdown"].grootte === Buffer.byteLength(TEKST), `en de grootte in bytes (${Buffer.byteLength(TEKST)})`);
meld(!("ocss::blad::rekentekst" in attr) && !("ocss::blad::invoer" in attr), "zonder rekentekst en invoer");
meld(attr["ocss::blad::uitkomst"].status === "geen_oordeel", "zonder oordeel");
meld(Boolean(doc.schemas["ocss::blad::markdown"]), "het schema staat in het bestand");

const step = projectStep(project, bladen);
meld(step.includes("'text/markdown'"), "de STEP noemt het mediatype");
meld(step.includes("'notitie.md'"), "de STEP noemt de bestandsnaam");
meld(!step.includes("aanhalingstekens"), "de tekst zelf staat niet in de STEP");

console.log("\nDe html");
const { html, koppen } = leesMarkdown("# Een\n\nTekst **vet**\n\n## Twee `code` &amp; *meer*\n\n- a\n- b\n\n1. c\n\n| K | L |\n|---|--:|\n| 1 | 2 |\n\n```js\nlet a = 1;\n```\n\n~~weg~~\n");
const b = dom(html);
meld(b.querySelector("h1")?.textContent === "Een" && b.querySelector("h2") !== null, "koppen");
meld(b.querySelectorAll("ul li").length === 2 && b.querySelectorAll("ol li").length === 1, "lijsten, met en zonder nummer");
meld(b.querySelector("table th")?.textContent === "K" && b.querySelector("td[align=right]")?.textContent === "2", "tabellen, met uitlijning");
meld(b.querySelector("pre code")?.textContent === "let a = 1;\n", "code");
meld(b.querySelector("del")?.textContent === "weg", "doorgehaalde tekst");
meld(koppen.length === 2 && koppen[1].tekst === "Twee code & meer" && koppen[1].niveau === 2, "de kop als platte tekst", koppen);

console.log("\nDe opschoning");
const kwaad = [
  "<script>window.x = 1</script>",
  "<img src=x onerror=\"window.x = 1\">",
  "[klik](javascript:alert(1))",
  "<iframe src=\"https://voorbeeld.invalid/\"></iframe>",
  "<a href=\"https://voorbeeld.invalid\" onclick=\"window.x = 1\">link</a>",
  "<style>body { display: none }</style>",
  "<svg><script>window.x = 1</script></svg>",
].join("\n\n");
const schoonDom = dom(markdownVoorScherm(kwaad, undefined, schoon));
meld(!schoonDom.querySelector("script, iframe, style"), "geen script, iframe of stijlblok");
meld(!schoonDom.innerHTML.includes("onerror") && !schoonDom.innerHTML.includes("onclick"), "geen event-attributen");
meld(!schoonDom.innerHTML.includes("javascript:"), "geen javascript:-adressen");
meld(schoonDom.querySelector("a[href='https://voorbeeld.invalid']") !== null, "een gewone link blijft");

const beelden = dom(markdownVoorScherm(
  "![a](https://voorbeeld.invalid/a.png)\n\n![b](data:image/png;base64,QUJD)\n\n![c](foto.png)\n\n![d](./map/d.png)\n\n![e](C:\\geheim\\e.png)\n",
  { "map/d.png": BEELD },
  schoon,
));
const buiten = beelden.querySelector("img[data-extern-src]");
meld(buiten?.getAttribute("data-extern-src") === "https://voorbeeld.invalid/a.png" && !buiten.hasAttribute("src"),
  "een afbeelding van buiten laadt niet vanzelf: het adres staat in data-extern-src");
meld(beelden.querySelector("img[src^='data:image/png;base64,QUJD']") !== null, "een data-URL blijft staan");
meld(beelden.querySelector(`img[src='${BEELD}']`) !== null, "een afbeelding uit het project komt op zijn plek, ook met ./ ervoor");
const weg = [...beelden.querySelectorAll(".md-beeld-weg")].map((e) => e.textContent);
meld(weg.includes("foto.png"), "een afbeelding die er niet is, wordt een melding met het adres", weg);
meld(beelden.querySelectorAll("img:not([src]):not([data-extern-src])").length === 0, "er blijft geen lege afbeelding staan");

console.log("\nOp papier");
const papier = (tekst, naam = "Blad", extra = {}) => dom(markdownVoorPapier({ tekst, ...extra }, { id: "ex", naam }, schoon));

// Elke lijstregel een eigen blok, en de nummering loopt door.
const lijst = papier("3. een\n4. twee\n   - dieper\n5. drie\n");
const kinderen = [...lijst.children].map((k) => `${k.localName}:${k.getAttribute("start") ?? ""}:${k.textContent.trim()}`);
meld(JSON.stringify(kinderen) === JSON.stringify(["ol:3:een", "ol:4:twee", "ul::dieper", "ol:5:drie"]),
  "een lijst gaat per regel in stukken, ook de lijst erin; de nummering loopt door", kinderen);
meld(lijst.lastElementChild.classList.contains("md-slot"), "het laatste stuk houdt de ruimte onder de lijst");

// Tabel: één tabel per rij, met dezelfde kolommen. "Omschrijving" is 12 tekens tegen 4 (ondergrens): 75 % om 25 %.
const tabel = papier("| Nr | Omschrijving |\n|---|---|\n| 1 | a |\n| 2 | b |\n");
const delen = [...tabel.querySelectorAll("table")];
meld(delen.length === 3 && delen.every((t) => t.querySelectorAll("tr").length === 1), "een tabel gaat per rij in stukken");
meld(delen[0].classList.contains("md-kopregel") && delen[0].classList.contains("rpa-houd") && delen[0].querySelector("thead") !== null,
  "de kopregel blijft bij de eerste rij");
const breedtes = delen.map((t) => [...t.querySelectorAll("col")].map((c) => c.getAttribute("style")).join());
meld(new Set(breedtes).size === 1 && breedtes[0] === "width:25.00%,width:75.00%", "alle stukken hebben dezelfde kolommen", breedtes[0]);

const code = papier("```\neen\n\ndrie\n```\n");
const regels = [...code.querySelectorAll("pre")];
meld(regels.length === 3 && regels[2].textContent === "drie" && regels[1].textContent === " ", "code gaat per regel in stukken; een lege regel houdt zijn hoogte");
meld(regels[0].classList.contains("md-code-eerste") && regels[2].classList.contains("md-code-laatste"), "de eerste en laatste regel zijn gemarkeerd");

const citaat = papier("> een\n>\n> - lijst\n> - lijst\n");
meld(citaat.querySelector(".md-citaat > p") !== null && citaat.querySelectorAll(".md-citaat > ul").length === 2 && !citaat.querySelector("blockquote"),
  "een citaat wordt een wikkel, en wat erin staat gaat ook in stukken");

const lang = logboekTekst();
const logboek = papier(lang, "Logboek");
const alineas = [...logboek.querySelectorAll("p")];
meld(alineas.length > 1 && alineas.every((p) => p.textContent.length <= 3200), "een lange alinea gaat in stukken van hooguit 3200 tekens", alineas.map((p) => p.textContent.length));
const zinnen = alineas.map((p) => p.textContent).join("").match(/zin nummer \d+/g) ?? [];
meld(zinnen.length === LANG.zinnen && zinnen.every((z, i) => z === `zin nummer ${i + 1}`), "elke zin staat er, op volgorde en één keer", zinnen.length);
meld(logboek.querySelectorAll("ol").length === LANG.lijst && logboek.querySelectorAll("tbody").length === LANG.tabel && logboek.querySelectorAll("pre").length === LANG.code,
  "elke lijstregel, tabelrij en regel code is een eigen blok");
const logTekst = logboek.textContent;
meld(logTekst.includes(`Lijstregel ${LANG.lijst}`) && logTekst.includes(`Tabelregel ${LANG.tabel}`) && logTekst.includes(`Coderegel ${LANG.code}`) && logTekst.includes("Einde van de alinea."),
  "ook de laatste van elk staat er");

const metKop = papier("# Blad\n\nTekst\n\n# Tweede\n", "Blad");
meld(metKop.querySelector("h1")?.textContent === "Tweede", "een eerste kop gelijk aan de naam van het blad vervalt: die staat er al boven");
meld(metKop.querySelector("h1")?.getAttribute("data-inhoud") === "ex#1", "een kop krijgt zijn plek voor de inhoudsopgave");
meld(papier("Tekst\n\n# Blad\n", "Blad").querySelector("h1") !== null, "een kop verderop met die naam blijft staan");
meld(!papier(`<img src=x onerror="window.x = 1">`).innerHTML.includes("onerror"), "ook op papier opgeschoond");
meld(papier("![c](foto.png)\n").querySelector(".md-beeld-weg")?.textContent === "foto.png", "ook op papier een melding bij een ontbrekende afbeelding");

console.log("\nDe inhoudsopgave");
const blad = { id: "ex", naam: "Notitie" };
const titels = (tekst) => koppenVoorInhoud(tekst, blad).map((k) => k.titel);
meld(JSON.stringify(titels("# Een\n## Twee\n### Drie\n#### Vier\n")) === JSON.stringify(["Een", "Twee"]), "alleen de bovenste twee niveaus");
meld(JSON.stringify(titels("## Twee\n### Drie\n#### Vier\n")) === JSON.stringify(["Twee", "Drie"]), "ook als het bestand met ## begint");
meld(JSON.stringify(titels("# Notitie\n## Twee\n")) === JSON.stringify(["Twee"]), "een eerste kop gelijk aan de naam telt niet");
meld(JSON.stringify(titels("Tekst\n\n# Notitie\n")) === JSON.stringify(["Notitie"]), "een kop verderop met die naam wel");
meld(JSON.stringify(koppenVoorInhoud("# Een\n## Twee\n", blad).map((k) => k.anker)) === JSON.stringify(["ex#0", "ex#1"]), "het anker is het volgnummer van de kop");
meld(titels("Alleen tekst\n").length === 0, "zonder koppen geen regels");
// Dezelfde ankers op papier en in de inhoudsopgave, ook als de eerste kop wegvalt.
const notitie = papier(notitieTekst(), "Uitgangspunten fundering");
const ankers = [...notitie.querySelectorAll("[data-inhoud]")].map((k) => k.getAttribute("data-inhoud"));
const inhoud = koppenVoorInhoud(notitieTekst(), { id: "ex", naam: "Uitgangspunten fundering" }).map((k) => k.anker);
meld(inhoud.length === 2 && inhoud.every((a) => ankers.includes(a)), "elke regel in de inhoudsopgave heeft zijn kop op papier", { inhoud, ankers });

console.log("\nAfbeeldingen naast een bestand");
const map = mkdtempSync(join(tmpdir(), "markdown-controle-"));
try {
  writeFileSync(join(map, "a.png"), Buffer.from([1, 2, 3]));
  writeFileSync(join(map, "groot.png"), Buffer.alloc(11 * 1024 * 1024));
  const tekst = [
    "![a](a.png)", "![a2](./a.png)", "<img src=\"a.png\">", "![weg](bestaat-niet.png)", "![groot](groot.png)",
    "![buiten](https://voorbeeld.invalid/x.png)", "![stam](C:\\geheim\\x.png)", "![server](\\\\server\\deel\\x.png)", "![absoluut](/etc/x.png)",
    "![geen beeld](notitie.txt)", "![data](data:image/png;base64,QUJD)",
  ].join("\n\n");
  const gelezenPaden = [];
  const leesBestand = async (pad) => {
    gelezenPaden.push(pad);
    return readFileSync(join(map, pad));
  };
  const gevonden = await verzamelBeelden(tekst, leesBestand, async (b) => Buffer.from(b).toString("base64"));
  meld(gevonden?.["a.png"] === "data:image/png;base64,AQID", "een afbeelding naast het bestand wordt een data-URL, met het type uit de extensie", gevonden);
  meld(!gevonden?.["groot.png"] && gelezenPaden.includes("groot.png"), "wat te groot is, blijft weg");
  meld(!gevonden?.["bestaat-niet.png"], "wat niet bestaat, blijft weg zonder het inlezen te stoppen");
  const buitenBoek = gelezenPaden.filter((p) => /^[a-z]:|^[\\/]|^https?:|\.txt$/i.test(p) || p.includes("\\"));
  meld(buitenBoek.length === 0, "geen stam, serverpad, adres van buiten of ander bestand wordt gelezen", buitenBoek);
  meld(await verzamelBeelden("Geen afbeeldingen\n", leesBestand, async () => "") === undefined, "zonder afbeeldingen geen veld");
  meld(JSON.stringify(beeldAdressen("![a](a.png)\n\n![b](a.png)\n")) === JSON.stringify(["a.png"]), "hetzelfde adres één keer");
} finally {
  rmSync(map, { recursive: true, force: true });
}
meld(isRelatiefAdres("a/b.png") && isRelatiefAdres("../b.png"), "een pad naast de tekst is relatief");
meld(!["https://x/y", "data:x", "C:\\x", "\\\\s\\x", "/x", "#x", ""].some(isRelatiefAdres), "een schema, stam, serverpad of anker niet");

console.log("\nRanden");
meld(leesMarkdownBestand({ tekst: 12 }) === undefined && leesMarkdownBestand(null) === undefined && leesMarkdownBestand([]) === undefined, "geen tekst: geen veld");
const zonder = normaliseerExemplaar({ id: "x", naam: "Los", templateId: MARKDOWN_BLAD }, "n");
meld(isMarkdownBlad(zonder) && zonder.md === undefined, "een blad zonder tekst blijft een Markdown-blad");
meld(normaliseerExemplaar({ id: "y", naam: "R", templateId: "", md: { tekst: "a" } }, "n").md === undefined, "een rekenblad neemt geen tekst over uit een bestand");
const vreemd = leesMarkdownBestand({ tekst: "a", beelden: { a: BEELD, b: "https://voorbeeld.invalid/x.png", c: 12 } });
meld(JSON.stringify(Object.keys(vreemd.beelden)) === JSON.stringify(["a"]), "een afbeelding in een bestand moet een data-URL zijn: een adres zou vanzelf laden");
meld(leesMarkdownBestand({ tekst: "a", beelden: { b: "x" } }).beelden === undefined, "zonder bruikbare afbeeldingen geen veld");
meld(isLosBlad({ templateId: MARKDOWN_BLAD }), "een Markdown-blad is een los blad");
meld(bladnaamVoorMarkdown("C:\\map\\Notitie.MD") === "Notitie" && bladnaamVoorMarkdown("a/b.markdown") === "b" && bladnaamVoorMarkdown(".md") === "Markdown", "de bladnaam komt uit de bestandsnaam");
meld(tekstUitBytes(new Uint8Array([0xef, 0xbb, 0xbf, 0x41])) === "A", "de markering aan het begin van een bestand valt weg");
meld(tekstUitBytes(new Uint8Array([0x25, 0x50, 0x00, 0x46])) === null, "een bestand met een nul-teken is geen tekst");
meld(tekstUitBytes(new Uint8Array([0xc3, 0xa9])) === "é" && tekstUitBytes(new Uint8Array([0xe9])) === "é", "UTF-8, en anders de codering van een oudere Windows-editor");
meld(tekstUitBytes(new Uint8Array([0xff, 0xfe, 0xe9, 0x00])) === "é", "UTF-16 met zijn markering");
meld(markdownVoorScherm("", undefined, schoon) === "", "een lege tekst geeft niets");

console.log(fouten === 0 ? "\nAlles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
