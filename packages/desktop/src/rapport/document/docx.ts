/**
 * Het rapport als DOCX (WordprocessingML), met de hand opgebouwd en met fflate gezipt.
 *
 * Koppen krijgen de ingebouwde stijlen Heading 1–3, zodat een tekstverwerker ze als
 * kop herkent (en in zijn eigen taal "Kop 1" noemt). Formules worden OMML-vergelijkingen
 * (mathmlNaarOmml.ts), afbeeldingen staan als PNG of JPEG in `word/media`. De voet van
 * elke pagina noemt project, revisie en exportmoment, met het paginanummer.
 */
import { strToU8, zipSync, type Zippable } from "fflate";
import { mathmlNaarOmml } from "./mathmlNaarOmml.ts";
import { rooster, type Alinea, type DocBlok, type RapportDocument, type Run, type Tabel, type TekstRun } from "./model.ts";
import { xmlTekst } from "./xml.ts";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const M = "http://schemas.openxmlformats.org/officeDocument/2006/math";
const WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture";
const PR = "http://schemas.openxmlformats.org/package/2006/relationships";

/** EMU per mm: de maat van afbeeldingen in DrawingML. */
const EMU_MM = 36000;
/** Twintigste punt per mm: de maat van marges en inspringen. */
const TWIP_MM = 56.6929;

/** Een formule die niet om te zetten is, wordt platte tekst; nooit een lege plek. */
function formule(r: Extract<Run, { soort: "formule" }>): string {
  try {
    return mathmlNaarOmml(r.mathml, r.blok);
  } catch {
    return tekstRun({ soort: "tekst", tekst: r.tekst, cursief: true });
  }
}

function tekstRun(r: TekstRun): string {
  const pr = [
    r.mono ? '<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/>' : "",
    r.vet ? "<w:b/>" : "",
    r.cursief ? "<w:i/>" : "",
    r.kleur ? `<w:color w:val="${r.kleur}"/>` : "",
    r.onderstreept ? '<w:u w:val="single"/>' : "",
    r.positie ? `<w:vertAlign w:val="${r.positie === "sub" ? "subscript" : "superscript"}"/>` : "",
  ].join("");
  return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ""}<w:t xml:space="preserve">${xmlTekst(r.tekst)}</w:t></w:r>`;
}

function beeldRun(d: RapportDocument, index: number): string {
  const b = d.beelden[index];
  if (!b) return "";
  const cx = Math.round(b.breedteMm * EMU_MM);
  const cy = Math.round(b.hoogteMm * EMU_MM);
  const id = index + 1;
  return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>` +
    `<wp:docPr id="${id}" name="Afbeelding ${id}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>` +
    `<a:graphic><a:graphicData uri="${PIC}"><pic:pic><pic:nvPicPr><pic:cNvPr id="${id}" name="beeld${id}.${b.type === "jpeg" ? "jpg" : "png"}"/><pic:cNvPicPr/></pic:nvPicPr>` +
    `<pic:blipFill><a:blip r:embed="rIdBeeld${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
    `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>` +
    `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

function runs(d: RapportDocument, lijst: Run[]): string {
  return lijst.map((r) => {
    switch (r.soort) {
      case "tekst": return tekstRun(r);
      case "formule": return formule(r);
      case "beeld": return beeldRun(d, r.beeld);
      case "regeleinde": return "<w:r><w:br/></w:r>";
      case "tab": return "<w:r><w:tab/></w:r>";
    }
  }).join("");
}

function alinea(d: RapportDocument, a: Alinea): string {
  // Een formule op een eigen regel is zelf al een alinea in OMML (m:oMathPara).
  const stijl = a.kop ? `Heading${a.kop}` : a.stijl === "momentopname" ? "Momentopname" : a.stijl === "code" ? "Code" : "";
  const pr = [
    stijl ? `<w:pStyle w:val="${stijl}"/>` : "",
    a.nieuwePagina ? "<w:pageBreakBefore/>" : "",
    a.inspringen ? `<w:ind w:left="${Math.round(a.inspringen * 6 * TWIP_MM)}"/>` : "",
    a.uitlijning ? `<w:jc w:val="${a.uitlijning === "midden" ? "center" : "right"}"/>` : "",
  ].join("");
  return `<w:p>${pr ? `<w:pPr>${pr}</w:pPr>` : ""}${runs(d, a.runs)}</w:p>`;
}

function tabel(d: RapportDocument, t: Tabel): string {
  const { vakken, kolommen } = rooster(t);
  const breedte = Math.round(170 * TWIP_MM / kolommen);
  const grid = Array.from({ length: kolommen }, () => `<w:gridCol w:w="${breedte}"/>`).join("");
  const rijen = vakken.map((rij) => {
    const cellen: string[] = [];
    rij.forEach((vak, k) => {
      if (vak.bedekt && vak.zelfdeRij) return;
      // Van een cel die over meer kolommen en rijen loopt, staat in de rijen eronder alleen
      // het eerste vak, als voortzetting.
      if (vak.bedekt && k > 0 && rij[k - 1].cel === vak.cel) return;
      const span = vak.cel.kolommen > 1 ? `<w:gridSpan w:val="${vak.cel.kolommen}"/>` : "";
      const merge = vak.bedekt ? "<w:vMerge/>" : vak.cel.rijen > 1 ? '<w:vMerge w:val="restart"/>' : "";
      const binnen = vak.bedekt || vak.cel.alineas.length === 0
        ? "<w:p/>"
        : vak.cel.alineas.map((a) => alinea(d, vak.cel.kop ? { ...a, runs: a.runs.map((r) => (r.soort === "tekst" ? { ...r, vet: true } : r)) } : a)).join("");
      cellen.push(`<w:tc><w:tcPr><w:tcW w:w="${breedte * Math.max(1, vak.cel.kolommen)}" w:type="dxa"/>${span}${merge}</w:tcPr>${binnen}</w:tc>`);
    });
    const kop = rij.some((v) => !v.bedekt && v.cel.kop) && rij.every((v) => v.cel.kop) ? "<w:trPr><w:tblHeader/></w:trPr>" : "";
    return `<w:tr>${kop}${cellen.join("")}</w:tr>`;
  }).join("");
  const voor = t.nieuwePagina ? '<w:p><w:r><w:br w:type="page"/></w:r></w:p>' : "";
  return `${voor}<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/></w:tblPr>` +
    `<w:tblGrid>${grid}</w:tblGrid>${rijen}</w:tbl><w:p/>`;
}

function blok(d: RapportDocument, b: DocBlok): string {
  return b.soort === "tabel" ? tabel(d, b) : alinea(d, b);
}

function documentXml(d: RapportDocument): string {
  const marge = Math.round(20 * TWIP_MM);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:document xmlns:w="${W}" xmlns:r="${R}" xmlns:m="${M}" xmlns:wp="${WP}" xmlns:a="${A}" xmlns:pic="${PIC}"><w:body>` +
    d.blokken.map((b) => blok(d, b)).join("") +
    `<w:sectPr><w:footerReference w:type="default" r:id="rIdVoet"/><w:pgSz w:w="11906" w:h="16838"/>` +
    `<w:pgMar w:top="${marge}" w:right="${marge}" w:bottom="${marge}" w:left="${marge}" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>` +
    `</w:body></w:document>`;
}

function voetXml(d: RapportDocument): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:ftr xmlns:w="${W}" xmlns:r="${R}"><w:p><w:pPr><w:pStyle w:val="Footer"/><w:tabs><w:tab w:val="right" w:pos="${Math.round(170 * TWIP_MM)}"/></w:tabs></w:pPr>` +
    `<w:r><w:t xml:space="preserve">${xmlTekst(d.voettekst)}</w:t></w:r><w:r><w:tab/></w:r>` +
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>` +
    `</w:p></w:ftr>`;
}

function stijlenXml(d: RapportDocument): string {
  const font = xmlTekst(d.lettertype || "Arial");
  const kop = (n: number, grootte: number) =>
    `<w:style w:type="paragraph" w:styleId="Heading${n}"><w:name w:val="heading ${n}"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>` +
    `<w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="${n === 1 ? 360 : 240}" w:after="120"/><w:outlineLvl w:val="${n - 1}"/></w:pPr>` +
    `<w:rPr><w:b/><w:sz w:val="${grootte}"/><w:szCs w:val="${grootte}"/></w:rPr></w:style>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<w:styles xmlns:w="${W}">` +
    `<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}" w:eastAsia="${font}"/><w:sz w:val="20"/><w:szCs w:val="20"/><w:lang w:val="${xmlTekst(d.taal)}"/></w:rPr></w:rPrDefault>` +
    `<w:pPrDefault><w:pPr><w:spacing w:after="80" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>` +
    `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>` +
    kop(1, 32) + kop(2, 26) + kop(3, 22) +
    `<w:style w:type="paragraph" w:customStyle="1" w:styleId="Momentopname"><w:name w:val="Momentopname"/><w:basedOn w:val="Normal"/>` +
    `<w:pPr><w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="999999"/><w:bottom w:val="single" w:sz="4" w:space="4" w:color="999999"/></w:pBdr><w:spacing w:after="240"/></w:pPr>` +
    `<w:rPr><w:i/><w:color w:val="555555"/><w:sz w:val="18"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:customStyle="1" w:styleId="Code"><w:name w:val="Code"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="0"/></w:pPr>` +
    `<w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas"/><w:sz w:val="18"/></w:rPr></w:style>` +
    `<w:style w:type="paragraph" w:styleId="Footer"><w:name w:val="footer"/><w:basedOn w:val="Normal"/><w:rPr><w:color w:val="555555"/><w:sz w:val="16"/></w:rPr></w:style>` +
    `<w:style w:type="table" w:default="1" w:styleId="TableNormal"><w:name w:val="Normal Table"/><w:tblPr><w:tblInd w:w="0" w:type="dxa"/>` +
    `<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>` +
    `<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:basedOn w:val="TableNormal"/><w:pPr><w:spacing w:after="0"/></w:pPr><w:tblPr><w:tblBorders>` +
    ["top", "left", "bottom", "right", "insideH", "insideV"].map((k) => `<w:${k} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`).join("") +
    `</w:tblBorders></w:tblPr></w:style>` +
    `</w:styles>`;
}

function inhoudTypen(d: RapportDocument): string {
  const png = d.beelden.some((b) => b.type === "png") ? '<Default Extension="png" ContentType="image/png"/>' : "";
  const jpg = d.beelden.some((b) => b.type === "jpeg") ? '<Default Extension="jpg" ContentType="image/jpeg"/>' : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
    `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>${png}${jpg}` +
    `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
    `<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>` +
    `<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>` +
    `<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>` +
    `<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>` +
    `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>` +
    `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>` +
    `</Types>`;
}

function kernEigenschappen(d: RapportDocument): string {
  const moment = d.gemaakt.replace(/\.\d+Z$/, "Z");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" ` +
    `xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">` +
    `<dc:title>${xmlTekst(d.titel)}</dc:title><dc:description>${xmlTekst(d.voettekst)}</dc:description><dc:language>${xmlTekst(d.taal)}</dc:language>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${moment}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${moment}</dcterms:modified>` +
    `</cp:coreProperties>`;
}

/**
 * De lettertypen met hun soort: ontbreekt het lettertype van de huisstijl op de computer
 * die het document opent, dan kiest de editor een letter van dezelfde soort.
 */
function lettertypenXml(d: RapportDocument): string {
  const font = (naam: string, familie: string, pitch = "variable") =>
    `<w:font w:name="${xmlTekst(naam)}"><w:family w:val="${familie}"/><w:pitch w:val="${pitch}"/></w:font>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:fonts xmlns:w="${W}">` +
    font(d.lettertype || "Arial", d.schreef ? "roman" : "swiss") + font("Consolas", "modern", "fixed") + font("Cambria Math", "roman") +
    `</w:fonts>`;
}

/** Het rapport als DOCX-bestand. */
export function bouwDocx(d: RapportDocument): Uint8Array {
  const relaties = d.beelden.map((b, i) =>
    `<Relationship Id="rIdBeeld${i + 1}" Type="${R}/image" Target="media/beeld${i + 1}.${b.type === "jpeg" ? "jpg" : "png"}"/>`).join("");
  const bestanden: Zippable = {
    "[Content_Types].xml": strToU8(inhoudTypen(d)),
    "_rels/.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${PR}">` +
      `<Relationship Id="rId1" Type="${R}/officeDocument" Target="word/document.xml"/>` +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>` +
      `<Relationship Id="rId3" Type="${R}/extended-properties" Target="docProps/app.xml"/></Relationships>`),
    "docProps/core.xml": strToU8(kernEigenschappen(d)),
    "docProps/app.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Open CalcSheet Studio</Application></Properties>`),
    "word/document.xml": strToU8(documentXml(d)),
    "word/styles.xml": strToU8(stijlenXml(d)),
    "word/settings.xml": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:settings xmlns:w="${W}" xmlns:m="${M}"><w:defaultTabStop w:val="709"/>` +
      `<m:mathPr><m:mathFont m:val="Cambria Math"/><m:dispDef/><m:defJc m:val="left"/></m:mathPr><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`),
    "word/footer1.xml": strToU8(voetXml(d)),
    "word/fontTable.xml": strToU8(lettertypenXml(d)),
    "word/_rels/document.xml.rels": strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="${PR}">` +
      `<Relationship Id="rIdStijlen" Type="${R}/styles" Target="styles.xml"/><Relationship Id="rIdInstellingen" Type="${R}/settings" Target="settings.xml"/>` +
      `<Relationship Id="rIdVoet" Type="${R}/footer" Target="footer1.xml"/><Relationship Id="rIdLetters" Type="${R}/fontTable" Target="fontTable.xml"/>${relaties}</Relationships>`),
  };
  d.beelden.forEach((b, i) => {
    // Al gecomprimeerd: opslaan zoals het is.
    bestanden[`word/media/beeld${i + 1}.${b.type === "jpeg" ? "jpg" : "png"}`] = [b.bytes, { level: 0 }];
  });
  return zipSync(bestanden, { level: 6 });
}
