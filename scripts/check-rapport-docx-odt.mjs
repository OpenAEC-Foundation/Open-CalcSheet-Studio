/**
 * Controle van de export van het rapport naar DOCX en ODT (packages/desktop/src/rapport/document/).
 *
 * Zonder browser: de omzetting van MathML naar OMML en het opbouwen van de pakketten zijn
 * gewone functies. Het uitlezen van de afdruk (uitAfdruk.ts) heeft een browser nodig en
 * staat hier niet in. Toetst:
 *
 *   1  de lezer van MathML: goed gevormde XML wordt een boom, kapotte XML een fout;
 *   2  MathML van KaTeX naar OMML: breuk, index, macht, beide, wortels, Griekse letters,
 *      eenheden rechtop als één woord, een matrix tussen haken, een som met grenzen, accenten,
 *      een kleur, en een rij in een `mi` (`\boldsymbol`); een onbekende knoop houdt zijn tekst;
 *   3  de MathML voor de formule-editor van ODT: `/` als operator, geen `accent="true"`;
 *   4  het DOCX-pakket: een geldige zip met alle verplichte onderdelen, elke XML goed gevormd,
 *      elke relatie naar een bestand dat er is, koppen als Heading 1–3, een vergelijking,
 *      een tabel met samengevoegde cellen, een afbeelding en een pagina-einde;
 *   5  het ODT-pakket: `mimetype` eerst en ongecomprimeerd, het manifest noemt elk onderdeel,
 *      elke XML goed gevormd, een formule als ingebed object;
 *   6  de toetsstatus blijft staan: "NIET GETOETST" komt letterlijk in beide documenten;
 *   7  de printstore: `rapportNaarDocument` zet het rapport klaar en `klaar` ruimt op.
 *
 * Draaien:  node scripts/check-rapport-docx-odt.mjs
 */
import { createRequire } from "node:module";
import { unzipSync, strFromU8 } from "fflate";
import { JSDOM } from "jsdom";
import { leesXml, platteTekst } from "../packages/desktop/src/rapport/document/xml.ts";
import { mathmlNaarOmml } from "../packages/desktop/src/rapport/document/mathmlNaarOmml.ts";
import { bouwDocx } from "../packages/desktop/src/rapport/document/docx.ts";
import { bouwOdt, voorFormuleEditor } from "../packages/desktop/src/rapport/document/odt.ts";
import { rooster } from "../packages/desktop/src/rapport/document/model.ts";
import { usePrintStore } from "../packages/desktop/src/store/printStore.ts";

const katex = createRequire(import.meta.url)("katex");
const { window } = new JSDOM("");

let fouten = 0;
function meld(ok, tekst, detail) {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${tekst}${ok || detail === undefined ? "" : `\n         ${String(detail).slice(0, 400)}`}`);
}
const kop = (t) => console.log(`\n${t}`);

const M = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const WNS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

/** Leest XML met de parser van jsdom; `null` als hij niet goed gevormd is. */
function parse(xml) {
  const doc = new window.DOMParser().parseFromString(xml, "application/xml");
  return doc.getElementsByTagName("parsererror").length ? null : doc;
}

/** De MathML die KaTeX naast zijn HTML zet, zoals in de afdruk. */
function mathml(tex, blok = false) {
  const html = katex.renderToString(tex, { output: "mathml", displayMode: blok, throwOnError: false, strict: false, trust: true });
  return /<math[\s\S]*<\/math>/.exec(html)[0];
}

/** OMML van een formule, als DOM, in een wortel met de namespaces. */
function omml(tex) {
  const xml = mathmlNaarOmml(mathml(tex));
  const doc = parse(`<w:document xmlns:w="${WNS}" xmlns:m="${M}">${xml}</w:document>`);
  return { xml, doc, tel: (naam) => doc ? doc.getElementsByTagNameNS(M, naam).length : -1 };
}

// ── 1 de lezer ──────────────────────────────────────────────────────────────
kop("1  De lezer van MathML");
{
  const boom = leesXml('<math xmlns="http://www.w3.org/1998/Math/MathML"><mi mathvariant="normal">k</mi><mo>&lt;</mo><mtext>a&amp;b&#x3B3;</mtext></math>');
  meld(boom.naam === "math" && boom.kinderen.length === 3, "een element met drie kinderen");
  meld(platteTekst(boom) === "k<a&bγ", "entiteiten worden tekens", platteTekst(boom));
  let fout = null;
  try {
    leesXml("<math><mi>x</mo></math>");
  } catch (e) {
    fout = e;
  }
  meld(fout !== null, "een verkeerde sluittag geeft een fout");
}

// ── 2 MathML naar OMML ──────────────────────────────────────────────────────
kop("2  MathML naar OMML");
{
  const breuk = omml(String.raw`M_{Ed} = \frac{q_d \cdot L^2}{8}`);
  meld(breuk.doc !== null, "goed gevormde OMML", breuk.xml);
  meld(breuk.tel("f") === 1 && breuk.tel("num") === 1 && breuk.tel("den") === 1, "breuk: m:f met teller en noemer");
  meld(breuk.tel("sSub") === 2 && breuk.tel("sSup") === 1, "index en macht: m:sSub en m:sSup", `${breuk.tel("sSub")} / ${breuk.tel("sSup")}`);
  meld(/<m:t xml:space="preserve">Ed<\/m:t>/.test(breuk.xml), "de index Ed is één woord", breuk.xml);

  const beide = omml(String.raw`\sigma_{c}^{2} + x_1^3`);
  meld(beide.tel("sSubSup") === 2, "index en macht samen: m:sSubSup");
  meld(beide.xml.includes(">σ<"), "Griekse letter σ blijft staan");

  const wortel = omml(String.raw`\sqrt{x^2} + \sqrt[3]{y}`);
  meld(wortel.tel("rad") === 2, "twee wortels: m:rad");
  meld(wortel.tel("degHide") === 1 && /<m:deg><m:r>.*?>3<\/m:t>/.test(wortel.xml), "vierkantswortel zonder graad, derdemachtswortel met 3");

  const eenheid = omml(String.raw`\gamma_{M0} \leq 1{,}0 \quad \sigma = 235\ \mathrm{kN/m^2}`);
  meld(eenheid.xml.includes(">γ<") && eenheid.xml.includes(">≤<"), "γ en ≤ blijven staan");
  meld(/<m:sty m:val="p"\/><\/m:rPr>[^]*?<m:t xml:space="preserve">kN\/<\/m:t>/.test(eenheid.xml), "eenheid kN rechtop als één run", eenheid.xml);
  meld(eenheid.xml.includes(">1,0<"), "decimale komma blijft staan");

  const matrix = omml(String.raw`K = \begin{bmatrix}1 & 2 \\ 3 & 4\end{bmatrix}`);
  meld(matrix.tel("m") === 1 && matrix.tel("mr") === 2, "matrix: m:m met twee rijen");
  meld(matrix.tel("d") === 1 && /begChr m:val="\["/.test(matrix.xml) && /endChr m:val="\]"/.test(matrix.xml), "tussen rechte haken: m:d");

  const vet = omml(String.raw`K = \textcolor{#059669}{\boldsymbol{\begin{bmatrix}1 & 2 \\ 3 & 4\end{bmatrix}}}`);
  meld(vet.tel("m") === 1 && vet.tel("mr") === 2, "een uitkomst met \\boldsymbol: de matrix blijft een matrix");
  meld(vet.xml.includes('<w:color w:val="059669"/>'), "de kleur van de uitkomst gaat mee");

  const som = omml(String.raw`\sum_{i=1}^{n} x_i`);
  meld(som.tel("nary") === 1 && som.xml.includes('m:chr m:val="∑"'), "som met grenzen: m:nary met ∑");
  meld(/<m:nary>[^]*<m:e><m:sSub>/.test(som.xml), "de term na de som staat erin als m:e");

  const accent = omml(String.raw`\hat{x} + \overline{AB} + \binom{n}{k}`);
  meld(accent.tel("acc") === 1 && accent.tel("bar") === 1, "accent: m:acc, streep: m:bar");
  meld(accent.xml.includes('<m:type m:val="noBar"/>'), "binomium: breuk zonder streep");

  const onbekend = mathmlNaarOmml('<math><mrow><mi>a</mi><mfoo><mi>b</mi><mn>7</mn></mfoo></mrow></math>');
  meld(/>b7</.test(onbekend), "een onbekende knoop houdt zijn tekst", onbekend);
  meld(mathmlNaarOmml(mathml("x", true), true).startsWith("<m:oMathPara>"), "een formule op een eigen regel: m:oMathPara");
  meld(mathmlNaarOmml(mathml("x")).startsWith("<m:oMath>"), "een formule in de tekst: m:oMath");
}

// ── 3 MathML voor ODT ───────────────────────────────────────────────────────
kop("3  MathML voor de formule-editor van ODT");
{
  const schrijf = (el) => (typeof el === "string" ? el : `<${el.naam}${Object.keys(el.attr).map((k) => ` ${k}`).join("")}>${el.kinderen.map(schrijf).join("")}</${el.naam}>`);
  const deling = schrijf(voorFormuleEditor(leesXml(mathml(String.raw`\mathrm{kN/m^2}`))));
  meld(deling.includes("<mo>/</mo>"), "een / is een operator", deling);
  const hoed = schrijf(voorFormuleEditor(leesXml(mathml(String.raw`\hat{x}`))));
  meld(!hoed.includes("accent") && hoed.includes("ˆ"), "accent zonder accent=\"true\", met het teken ˆ", hoed);
  const vet = schrijf(voorFormuleEditor(leesXml(mathml(String.raw`\boldsymbol{x_1}`))));
  meld(!/<mi[^>]*><mrow/.test(vet), "geen rij in een mi", vet);
}

// ── het proefdocument ───────────────────────────────────────────────────────
// 1 × 1 pixel PNG.
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const tekst = (t, extra = {}) => ({ soort: "tekst", tekst: t, ...extra });
const alinea = (runs, extra = {}) => ({ soort: "alinea", runs, ...extra });
const cel = (t, extra = {}) => ({ alineas: [alinea([tekst(t)])], kolommen: 1, rijen: 1, ...extra });
const formule = (tex, blok = false) => ({ soort: "formule", mathml: mathml(tex, blok), tekst: tex, blok });
const DOC = {
  titel: "Proefrapport & co",
  taal: "nl",
  voettekst: "Proefrapport · revisie A · momentopname 25-11-2026 10:00",
  lettertype: "Segoe UI",
  gemaakt: "2026-11-25T09:00:00.000Z",
  beelden: [{ bytes: PNG, type: "png", breedteMm: 40, hoogteMm: 20 }],
  blokken: [
    alinea([tekst("Momentopname: getallen rekenen niet mee.")], { stijl: "momentopname" }),
    alinea([tekst("1 Inleiding")], { kop: 1 }),
    alinea([tekst("Tekst met "), tekst("vet", { vet: true }), tekst(" en x"), tekst("2", { positie: "sup" }), tekst(" en "), formule(String.raw`a^2+b^2=c^2`)]),
    alinea([formule(String.raw`N_{Rd} = \frac{A \cdot f_y}{\gamma_{M0}} = 1410\ \mathrm{kN}`, true)]),
    {
      soort: "tabel",
      rijen: [
        [cel("Kop A", { kop: true }), cel("Kop B", { kop: true, kolommen: 2 })],
        [cel("over twee rijen", { rijen: 2 }), cel("NIET GETOETST", { alineas: [alinea([tekst("NIET GETOETST", { kleur: "CC0000", vet: true })])] }), cel("x")],
        [cel("over twee kolommen", { kolommen: 2 })],
      ],
    },
    alinea([tekst("A.1 Blad")], { kop: 2, nieuwePagina: true }),
    alinea([{ soort: "beeld", beeld: 0 }]),
    alinea([tekst("Toetsing")], { kop: 3 }),
    alinea([tekst("NIET GETOETST: de toets is niet uitgevoerd")]),
  ],
};

// Het rooster van de tabel: drie rijen van drie vakken, met bedekte vakken.
kop("   Het rooster van een tabel");
{
  const { vakken, kolommen } = rooster(DOC.blokken[4]);
  meld(kolommen === 3 && vakken.every((r) => r.length === 3), "tabel: een rooster van 3 × 3");
  meld(vakken[2][0].bedekt && !vakken[2][0].zelfdeRij && vakken[0][2].bedekt && vakken[0][2].zelfdeRij, "tabel: de bedekte vakken liggen goed");
}

/** Elk XML-onderdeel van een pakket goed gevormd? Geeft de namen die dat niet zijn. */
function kapotteXml(bestanden) {
  return Object.keys(bestanden).filter((n) => /\.(xml|rels)$/.test(n) && !parse(strFromU8(bestanden[n])));
}

// ── 4 DOCX ──────────────────────────────────────────────────────────────────
kop("4  Het DOCX-pakket");
{
  const bytes = bouwDocx(DOC);
  let bestanden = {};
  try {
    bestanden = unzipSync(bytes);
  } catch (e) {
    meld(false, "een geldige zip", e.message);
  }
  const VERPLICHT = ["[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/_rels/document.xml.rels", "word/footer1.xml", "docProps/core.xml", "word/media/beeld1.png"];
  const mist = VERPLICHT.filter((n) => !bestanden[n]);
  meld(mist.length === 0, "alle verplichte onderdelen", mist.join(", "));
  const kapot = kapotteXml(bestanden);
  meld(kapot.length === 0, "elke XML goed gevormd", kapot.join(", "));

  // Elke relatie wijst naar iets dat er is; elk onderdeel heeft een inhoudstype.
  const rels = parse(strFromU8(bestanden["word/_rels/document.xml.rels"]));
  const doelen = [...rels.getElementsByTagName("Relationship")].map((r) => `word/${r.getAttribute("Target")}`);
  meld(doelen.every((d) => bestanden[d]), "elke relatie van het document wijst naar een onderdeel", doelen.filter((d) => !bestanden[d]).join(", "));
  const typen = strFromU8(bestanden["[Content_Types].xml"]);
  meld(typen.includes('Extension="png"') && typen.includes("/word/document.xml"), "inhoudstypen voor PNG en het document");

  const doc = strFromU8(bestanden["word/document.xml"]);
  const dom = parse(doc);
  const stijlen = [...dom.getElementsByTagNameNS(WNS, "pStyle")].map((s) => s.getAttributeNS(WNS, "val"));
  meld(["Heading1", "Heading2", "Heading3", "Momentopname"].every((s) => stijlen.includes(s)), "koppen als Heading 1–3, en de regel over de momentopname", stijlen.join(", "));
  const stijlXml = strFromU8(bestanden["word/styles.xml"]);
  meld(/w:styleId="Heading1"><w:name w:val="heading 1"\/>/.test(stijlXml), "Heading 1 heeft de ingebouwde naam");
  meld(dom.getElementsByTagNameNS(M, "oMath").length === 2 && dom.getElementsByTagNameNS(M, "oMathPara").length === 1, "twee vergelijkingen, waarvan één op een eigen regel");
  meld(dom.getElementsByTagNameNS(M, "f").length === 1, "de breuk is een m:f");
  meld(dom.getElementsByTagNameNS(WNS, "tbl").length === 1 && dom.getElementsByTagNameNS(WNS, "gridSpan").length === 2 && dom.getElementsByTagNameNS(WNS, "vMerge").length === 2, "tabel met cellen over twee kolommen en twee rijen");
  meld(dom.getElementsByTagNameNS(WNS, "pageBreakBefore").length === 1, "een nieuwe pagina voor het blad");
  meld(doc.includes('r:embed="rIdBeeld1"'), "de afbeelding staat in het document");
  meld((doc.match(/NIET GETOETST/g) ?? []).length === 2 && !/voldoet/i.test(doc), "NIET GETOETST staat er twee keer, en nergens voldoet");
  const voet = strFromU8(bestanden["word/footer1.xml"]);
  meld(voet.includes("momentopname 25-11-2026 10:00") && voet.includes(" PAGE "), "de voet noemt de momentopname en het paginanummer");
  meld(strFromU8(bestanden["docProps/core.xml"]).includes("Proefrapport &amp; co"), "titel in de eigenschappen, met & veilig");
}

// ── 5 ODT ───────────────────────────────────────────────────────────────────
kop("5  Het ODT-pakket");
{
  const bytes = bouwOdt(DOC);
  // De eerste lokale kop van de zip: naam, en methode 0 (opgeslagen, niet gecomprimeerd).
  const zicht = new DataView(bytes.buffer, bytes.byteOffset);
  const methode = zicht.getUint16(8, true);
  const naamLengte = zicht.getUint16(26, true);
  const extraLengte = zicht.getUint16(28, true);
  const naam = strFromU8(bytes.subarray(30, 30 + naamLengte));
  const inhoud = strFromU8(bytes.subarray(30 + naamLengte + extraLengte, 30 + naamLengte + extraLengte + 39));
  meld(zicht.getUint32(0, true) === 0x04034b50 && naam === "mimetype", "mimetype is het eerste bestand", naam);
  meld(methode === 0 && extraLengte === 0, "mimetype ongecomprimeerd en zonder extra veld", `methode ${methode}, extra ${extraLengte}`);
  meld(inhoud === "application/vnd.oasis.opendocument.text", "mimetype zegt ODT", inhoud);

  const bestanden = unzipSync(bytes);
  const VERPLICHT = ["mimetype", "META-INF/manifest.xml", "content.xml", "styles.xml", "meta.xml", "Pictures/beeld1.png", "Object 1/content.xml", "Object 2/content.xml"];
  const mist = VERPLICHT.filter((n) => !bestanden[n]);
  meld(mist.length === 0, "alle verplichte onderdelen", mist.join(", "));
  const kapot = kapotteXml(bestanden);
  meld(kapot.length === 0, "elke XML goed gevormd, ook de formules", kapot.join(", "));

  const manifest = strFromU8(bestanden["META-INF/manifest.xml"]);
  const genoemd = [...manifest.matchAll(/manifest:full-path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== "/" && !p.endsWith("/"));
  const nietGenoemd = Object.keys(bestanden).filter((n) => n !== "mimetype" && !n.startsWith("META-INF/") && !genoemd.includes(n));
  meld(nietGenoemd.length === 0 && genoemd.every((p) => bestanden[p]), "het manifest noemt elk onderdeel, en niets wat er niet is", nietGenoemd.join(", "));
  meld(manifest.includes('manifest:full-path="Object 1/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.formula"'), "een formule is een formuledocument");

  const content = strFromU8(bestanden["content.xml"]);
  meld(/<text:h text:style-name="Heading_20_1" text:outline-level="1">/.test(content), "een kop met zijn hoofdstukniveau");
  meld((content.match(/<draw:object xlink:href="\.\/Object \d+"/g) ?? []).length === 2, "twee formules als ingebed object");
  meld(content.includes("<table:covered-table-cell/>") && content.includes('table:number-rows-spanned="2"'), "tabel met samengevoegde cellen");
  meld(content.includes('fo:break-before="page"'), "een nieuwe pagina voor het blad");
  meld((content.match(/NIET GETOETST/g) ?? []).length === 2 && !/voldoet/i.test(content), "NIET GETOETST staat er twee keer, en nergens voldoet");
  const formule = parse(strFromU8(bestanden["Object 2/content.xml"]));
  meld(formule?.documentElement.namespaceURI === "http://www.w3.org/1998/Math/MathML" && formule.getElementsByTagName("mfrac").length === 1, "de formule is MathML met de breuk");
  const stijlen = strFromU8(bestanden["styles.xml"]);
  meld(stijlen.includes("momentopname 25-11-2026 10:00") && stijlen.includes("<text:page-number"), "de voet noemt de momentopname en het paginanummer");
  meld(stijlen.includes('style:font-family-generic="swiss"'), "het lettertype heeft een soort, voor een vervanger");
}

// ── 7 de printstore ─────────────────────────────────────────────────────────
kop("7  De printstore");
{
  usePrintStore.setState({ bezig: false, voorbeeld: false, selectie: ["ex-1"], soort: "bladen", pdfPad: "x.pdf", documentFormaat: null });
  usePrintStore.getState().rapportNaarDocument("odt");
  const s = usePrintStore.getState();
  meld(s.bezig && s.soort === "rapport" && s.selectie === null && s.documentFormaat === "odt" && s.pdfPad === null, "rapportNaarDocument: het hele rapport, als ODT, geen PDF");
  usePrintStore.getState().klaar();
  meld(usePrintStore.getState().documentFormaat === null && !usePrintStore.getState().bezig, "klaar ruimt het formaat op");
  usePrintStore.getState().rapportNaarDocument("docx");
  usePrintStore.getState().afdrukken(null, "rapport");
  meld(usePrintStore.getState().documentFormaat === null, "een gewone afdruk daarna is geen document");
}

console.log(fouten === 0 ? "\nAlles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
