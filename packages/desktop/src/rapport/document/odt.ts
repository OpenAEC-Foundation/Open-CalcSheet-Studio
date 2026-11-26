/**
 * Het rapport als ODT (OpenDocument-tekst), met de hand opgebouwd en met fflate gezipt.
 *
 * `mimetype` staat als eerste in het pakket en ongecomprimeerd: zo herkent een lezer
 * het formaat. Koppen krijgen de stijlen Heading 1–3 met hun hoofdstukniveau. Een
 * formule is een ingebed formuleobject (`Object N/content.xml`) met de MathML van KaTeX
 * erin, dus bewerkbaar in de formule-editor. Afbeeldingen staan in `Pictures/`.
 */
import { strToU8, zipSync, type Zippable } from "fflate";
import { leesXml, platteTekst, schrijfXml, xmlTekst, type XmlElement } from "./xml.ts";
import { rooster, type Alinea, type DocBlok, type RapportDocument, type Run, type Tabel, type TekstRun } from "./model.ts";

const NS = [
  'xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"',
  'xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"',
  'xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"',
  'xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"',
  'xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0"',
  'xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"',
  'xmlns:xlink="http://www.w3.org/1999/xlink"',
  'xmlns:dc="http://purl.org/dc/elements/1.1/"',
  'xmlns:meta="urn:oasis:names:tc:opendocument:xmlns:meta:1.0"',
  'xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0"',
  'xmlns:math="http://www.w3.org/1998/Math/MathML"',
].join(" ");

const MATHML = "http://www.w3.org/1998/Math/MathML";

/** Tekst met de witruimte zoals ODT die wil: meer spaties als `text:s`. */
function odtTekst(s: string): string {
  return s.split(/( {2,}|^ )/).map((stuk, i) => {
    if (i % 2 === 0) return xmlTekst(stuk);
    return stuk.length === 1 ? "<text:s/>" : `<text:s text:c="${stuk.length}"/>`;
  }).join("");
}

/** De automatische stijlen die tijdens het schrijven nodig blijken. */
class Stijlen {
  tekst = new Map<string, string>();
  alinea = new Map<string, string>();
  formules: { pad: string; xml: string }[] = [];

  tekstStijl(r: TekstRun): string | null {
    const delen = [
      r.vet ? 'fo:font-weight="bold"' : "",
      r.cursief ? 'fo:font-style="italic"' : "",
      r.onderstreept ? 'style:text-underline-style="solid" style:text-underline-width="auto" style:text-underline-color="font-color"' : "",
      r.positie === "sub" ? 'style:text-position="sub 58%"' : r.positie === "sup" ? 'style:text-position="super 58%"' : "",
      r.mono ? 'style:font-name="Consolas" fo:font-family="Consolas"' : "",
      r.kleur ? `fo:color="#${r.kleur}"` : "",
    ].filter(Boolean);
    if (delen.length === 0) return null;
    const sleutel = delen.join(" ");
    let naam = this.tekst.get(sleutel);
    if (!naam) this.tekst.set(sleutel, (naam = `T${this.tekst.size + 1}`));
    return naam;
  }

  alineaStijl(a: Alinea): string {
    const basis = a.kop ? `Heading_20_${a.kop}` : a.stijl === "momentopname" ? "Momentopname" : a.stijl === "code" ? "Code" : "Standard";
    const delen = [
      a.nieuwePagina ? 'fo:break-before="page"' : "",
      a.uitlijning ? `fo:text-align="${a.uitlijning === "midden" ? "center" : "end"}"` : "",
      a.inspringen ? `fo:margin-left="${(a.inspringen * 6).toFixed(1)}mm"` : "",
    ].filter(Boolean);
    if (delen.length === 0) return basis;
    const sleutel = `${basis}|${delen.join(" ")}`;
    let naam = this.alinea.get(sleutel);
    if (!naam) this.alinea.set(sleutel, (naam = `P${this.alinea.size + 1}`));
    return naam;
  }

  xml(): string {
    const tekst = [...this.tekst].map(([eig, naam]) => `<style:style style:name="${naam}" style:family="text"><style:text-properties ${eig}/></style:style>`);
    const alinea = [...this.alinea].map(([sleutel, naam]) => {
      const [basis, eig] = sleutel.split("|");
      return `<style:style style:name="${naam}" style:family="paragraph" style:parent-style-name="${basis}"><style:paragraph-properties ${eig}/></style:style>`;
    });
    return [...tekst, ...alinea].join("");
  }
}

/**
 * Accenten zoals de formule-editor van ODT ze kent: KaTeX schrijft `^` en `ˉ` boven een
 * letter, de editor verwacht de tekens van een accent.
 */
const ODT_ACCENT: Record<string, string> = { "^": "ˆ", "ˉ": "¯", "‾": "¯", "⃗": "→", "~": "˜" };

/**
 * Past de MathML van KaTeX aan voor de formule-editor van ODT. Een `mi` met een teken dat
 * geen letter of cijfer is (de `/` in `kN/m²`) wordt een `mo`, en accenten krijgen het
 * teken dat de editor kent, zonder `accent="true"`. Verder blijft alles staan.
 */
export function voorFormuleEditor(el: XmlElement): XmlElement {
  const kinderen = el.kinderen.map((k) => (typeof k === "string" ? k : voorFormuleEditor(k)));
  // KaTeX zet bij `\boldsymbol` een hele rij in een `mi`; de editor leest dat als tekst.
  if (["mi", "mn", "mo", "mtext"].includes(el.naam) && kinderen.some((k) => typeof k !== "string")) {
    return { naam: "mrow", attr: {}, kinderen: kinderen.filter((k) => typeof k !== "string") };
  }
  if (el.naam === "mi" && !/[\p{L}\p{N}]/u.test(platteTekst(el))) {
    const { mathvariant: _weg, ...attr } = el.attr;
    void _weg;
    return { naam: "mo", attr, kinderen };
  }
  if (el.naam === "mover" || el.naam === "munder") {
    const accent = kinderen.filter((k): k is XmlElement => typeof k !== "string")[1];
    const t = accent ? platteTekst(accent).trim() : "";
    if (accent && ODT_ACCENT[t]) accent.kinderen = [ODT_ACCENT[t]];
    // Met `accent="true"` laat de editor het teken weg; zonder staat het erboven.
    const { accent: _a, accentunder: _o, ...attr } = el.attr;
    void _a;
    void _o;
    return { ...el, attr, kinderen };
  }
  return { ...el, kinderen };
}

/** Een formule als ingebed object; lukt de MathML niet, dan platte tekst. */
function formule(s: Stijlen, r: Extract<Run, { soort: "formule" }>): string {
  let mathml: string;
  try {
    mathml = schrijfXml(voorFormuleEditor(leesXml(r.mathml)), MATHML);
  } catch {
    return tekstRun(s, { soort: "tekst", tekst: r.tekst, cursief: true });
  }
  const pad = `Object ${s.formules.length + 1}`;
  s.formules.push({ pad, xml: `<?xml version="1.0" encoding="UTF-8"?>\n${mathml}` });
  // Zonder maat: de editor rekent hem zelf uit. Een opgegeven maat rekt de formule op.
  return `<draw:frame draw:style-name="Formule" draw:name="Formule${s.formules.length}" text:anchor-type="as-char" draw:z-index="0">` +
    `<draw:object xlink:href="./${pad}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`;
}

function tekstRun(s: Stijlen, r: TekstRun): string {
  const naam = s.tekstStijl(r);
  const t = odtTekst(r.tekst);
  return naam ? `<text:span text:style-name="${naam}">${t}</text:span>` : t;
}

function beeld(d: RapportDocument, index: number): string {
  const b = d.beelden[index];
  if (!b) return "";
  return `<draw:frame draw:style-name="Beeld" draw:name="Afbeelding${index + 1}" text:anchor-type="as-char" svg:width="${b.breedteMm.toFixed(2)}mm" svg:height="${b.hoogteMm.toFixed(2)}mm" draw:z-index="0">` +
    `<draw:image xlink:href="Pictures/${beeldNaam(b, index)}" xlink:type="simple" xlink:show="embed" xlink:actuate="onLoad"/></draw:frame>`;
}

const beeldNaam = (b: { type: string }, i: number) => `beeld${i + 1}.${b.type === "jpeg" ? "jpg" : "png"}`;

function runs(d: RapportDocument, s: Stijlen, lijst: Run[]): string {
  return lijst.map((r) => {
    switch (r.soort) {
      case "tekst": return tekstRun(s, r);
      case "formule": return formule(s, r);
      case "beeld": return beeld(d, r.beeld);
      case "regeleinde": return "<text:line-break/>";
      case "tab": return "<text:tab/>";
    }
  }).join("");
}

function alinea(d: RapportDocument, s: Stijlen, a: Alinea): string {
  const stijl = s.alineaStijl(a);
  const binnen = runs(d, s, a.runs);
  return a.kop
    ? `<text:h text:style-name="${stijl}" text:outline-level="${a.kop}">${binnen}</text:h>`
    : `<text:p text:style-name="${stijl}">${binnen}</text:p>`;
}

function tabel(d: RapportDocument, s: Stijlen, t: Tabel, nummer: number): string {
  const { vakken, kolommen } = rooster(t);
  const rij = (r: (typeof vakken)[number]) => r.map((vak) => {
    if (vak.bedekt) return "<table:covered-table-cell/>";
    const span = [
      vak.cel.kolommen > 1 ? ` table:number-columns-spanned="${vak.cel.kolommen}"` : "",
      vak.cel.rijen > 1 ? ` table:number-rows-spanned="${vak.cel.rijen}"` : "",
    ].join("");
    const alineas = vak.cel.alineas.length === 0
      ? '<text:p text:style-name="Tabelinhoud"/>'
      : vak.cel.alineas.map((a) => {
        const metVet = vak.cel.kop ? { ...a, runs: a.runs.map((r) => (r.soort === "tekst" ? { ...r, vet: true } : r)) } : a;
        return alinea(d, s, metVet).replace('text:style-name="Standard"', 'text:style-name="Tabelinhoud"');
      }).join("");
    return `<table:table-cell table:style-name="Cel" office:value-type="string"${span}>${alineas}</table:table-cell>`;
  }).join("");
  const voor = t.nieuwePagina ? `<text:p text:style-name="${s.alineaStijl({ soort: "alinea", runs: [], nieuwePagina: true })}"/>` : "";
  return `${voor}<table:table table:name="Tabel${nummer}" table:style-name="Tabel"><table:table-column table:number-columns-repeated="${kolommen}"/>` +
    vakken.map((r) => `<table:table-row>${rij(r)}</table:table-row>`).join("") + "</table:table>";
}

function inhoudXml(d: RapportDocument, s: Stijlen): string {
  let tabellen = 0;
  const tekst = d.blokken.map((b: DocBlok) => (b.soort === "tabel" ? tabel(d, s, b, ++tabellen) : alinea(d, s, b))).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-content ${NS} office:version="1.3">` +
    lettertypen(d) +
    `<office:automatic-styles>` +
    `<style:style style:name="Tabel" style:family="table"><style:table-properties style:width="170mm" table:align="left"/></style:style>` +
    `<style:style style:name="Cel" style:family="table-cell"><style:table-cell-properties fo:padding="1mm" fo:border="0.5pt solid #000000"/></style:style>` +
    `<style:style style:name="Beeld" style:family="graphic"><style:graphic-properties style:vertical-pos="top" style:vertical-rel="baseline" fo:border="none" style:wrap="none"/></style:style>` +
    `<style:style style:name="Formule" style:family="graphic"><style:graphic-properties style:vertical-pos="middle" style:vertical-rel="text" fo:border="none" style:wrap="none"/></style:style>` +
    s.xml() +
    `</office:automatic-styles><office:body><office:text>${tekst}</office:text></office:body></office:document-content>`;
}

/**
 * De lettertypen met hun soort: ontbreekt het lettertype van de huisstijl op de computer
 * die het document opent, dan kiest de editor een letter van dezelfde soort.
 */
function lettertypen(d: RapportDocument): string {
  const font = xmlTekst(d.lettertype || "Arial");
  return `<office:font-face-decls>` +
    `<style:font-face style:name="${font}" svg:font-family="&apos;${font}&apos;" style:font-family-generic="${d.schreef ? "roman" : "swiss"}" style:font-pitch="variable"/>` +
    `<style:font-face style:name="Consolas" svg:font-family="Consolas" style:font-family-generic="modern" style:font-pitch="fixed"/>` +
    `</office:font-face-decls>`;
}

function stijlenXml(d: RapportDocument): string {
  const font = xmlTekst(d.lettertype || "Arial");
  const kop = (n: number, grootte: string) =>
    `<style:style style:name="Heading_20_${n}" style:display-name="Heading ${n}" style:family="paragraph" style:parent-style-name="Standard" style:next-style-name="Standard" style:default-outline-level="${n}" style:class="text">` +
    `<style:paragraph-properties fo:margin-top="${n === 1 ? "6mm" : "4mm"}" fo:margin-bottom="2mm" fo:keep-with-next="always"/>` +
    `<style:text-properties fo:font-size="${grootte}" fo:font-weight="bold"/></style:style>`;
  const [taal, land] = d.taal.split("-");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-styles ${NS} office:version="1.3">` +
    lettertypen(d) +
    `<office:styles>` +
    `<style:default-style style:family="paragraph"><style:paragraph-properties fo:margin-bottom="1.4mm"/>` +
    `<style:text-properties style:font-name="${font}" fo:font-family="${font}" fo:font-size="10pt" fo:language="${xmlTekst(taal)}"${land ? ` fo:country="${xmlTekst(land)}"` : ""}/></style:default-style>` +
    `<style:style style:name="Standard" style:family="paragraph" style:class="text"/>` +
    kop(1, "16pt") + kop(2, "13pt") + kop(3, "11pt") +
    `<style:style style:name="Momentopname" style:family="paragraph" style:parent-style-name="Standard">` +
    `<style:paragraph-properties fo:padding="1.5mm" fo:border-top="0.5pt solid #999999" fo:border-bottom="0.5pt solid #999999" fo:margin-bottom="4mm"/>` +
    `<style:text-properties fo:font-size="9pt" fo:font-style="italic" fo:color="#555555"/></style:style>` +
    `<style:style style:name="Code" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties fo:margin-bottom="0mm"/>` +
    `<style:text-properties style:font-name="Consolas" fo:font-family="Consolas" fo:font-size="9pt"/></style:style>` +
    `<style:style style:name="Tabelinhoud" style:family="paragraph" style:parent-style-name="Standard" style:class="extra"><style:paragraph-properties fo:margin-bottom="0mm"/></style:style>` +
    `<style:style style:name="Voet" style:family="paragraph" style:parent-style-name="Standard"><style:paragraph-properties>` +
    `<style:tab-stops><style:tab-stop style:position="170mm" style:type="right"/></style:tab-stops></style:paragraph-properties>` +
    `<style:text-properties fo:font-size="8pt" fo:color="#555555"/></style:style>` +
    `</office:styles>` +
    `<office:automatic-styles><style:page-layout style:name="A4"><style:page-layout-properties fo:page-width="210mm" fo:page-height="297mm" style:print-orientation="portrait" ` +
    `fo:margin-top="20mm" fo:margin-bottom="12mm" fo:margin-left="20mm" fo:margin-right="20mm"/>` +
    `<style:footer-style><style:header-footer-properties fo:min-height="0mm" fo:margin-top="4mm"/></style:footer-style></style:page-layout></office:automatic-styles>` +
    `<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="A4">` +
    `<style:footer><text:p text:style-name="Voet">${odtTekst(d.voettekst)}<text:tab/><text:page-number text:select-page="current">1</text:page-number></text:p></style:footer>` +
    `</style:master-page></office:master-styles></office:document-styles>`;
}

function metaXml(d: RapportDocument): string {
  const moment = d.gemaakt.replace(/\.\d+Z$/, "Z");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<office:document-meta ${NS} office:version="1.3"><office:meta>` +
    `<meta:generator>Open CalcSheet Studio</meta:generator><dc:title>${xmlTekst(d.titel)}</dc:title><dc:description>${xmlTekst(d.voettekst)}</dc:description>` +
    `<dc:language>${xmlTekst(d.taal)}</dc:language><meta:creation-date>${moment}</meta:creation-date><dc:date>${moment}</dc:date>` +
    `</office:meta></office:document-meta>`;
}

/** Het rapport als ODT-bestand. */
export function bouwOdt(d: RapportDocument): Uint8Array {
  const s = new Stijlen();
  const inhoud = inhoudXml(d, s);
  const manifest = [
    '<manifest:file-entry manifest:full-path="/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.text"/>',
    '<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>',
    '<manifest:file-entry manifest:full-path="styles.xml" manifest:media-type="text/xml"/>',
    '<manifest:file-entry manifest:full-path="meta.xml" manifest:media-type="text/xml"/>',
    ...d.beelden.map((b, i) => `<manifest:file-entry manifest:full-path="Pictures/${beeldNaam(b, i)}" manifest:media-type="image/${b.type}"/>`),
    ...s.formules.flatMap((f) => [
      `<manifest:file-entry manifest:full-path="${f.pad}/" manifest:version="1.3" manifest:media-type="application/vnd.oasis.opendocument.formula"/>`,
      `<manifest:file-entry manifest:full-path="${f.pad}/content.xml" manifest:media-type="text/xml"/>`,
    ]),
  ].join("");
  // De volgorde telt: mimetype eerst en ongecomprimeerd.
  const bestanden: Zippable = {
    mimetype: [strToU8("application/vnd.oasis.opendocument.text"), { level: 0 }],
    "META-INF/manifest.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?>\n<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.3">${manifest}</manifest:manifest>`),
    "content.xml": strToU8(inhoud),
    "styles.xml": strToU8(stijlenXml(d)),
    "meta.xml": strToU8(metaXml(d)),
  };
  d.beelden.forEach((b, i) => {
    bestanden[`Pictures/${beeldNaam(b, i)}`] = [b.bytes, { level: 0 }];
  });
  for (const f of s.formules) bestanden[`${f.pad}/content.xml`] = strToU8(f.xml);
  return zipSync(bestanden, { level: 6 });
}
