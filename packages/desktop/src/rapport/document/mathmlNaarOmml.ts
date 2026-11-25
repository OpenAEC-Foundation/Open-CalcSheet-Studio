/**
 * MathML naar OMML: een formule uit KaTeX als bewerkbare vergelijking in een DOCX-bestand.
 *
 * KaTeX zet naast zijn HTML een MathML-kopie van elke formule (`.katex-mathml math`).
 * Deze omzetting kent wat KaTeX daarin schrijft: rijen, letters, getallen, tekens,
 * tekst, ruimte, indices boven en onder, breuken, wortels, accenten, strepen, accolades,
 * sommen, matrices en haakjes. Een knoop die hij niet kent, komt als platte tekst in de
 * vergelijking; hij valt nooit weg.
 *
 * Zonder DOM: de invoer is de MathML als tekst (xml.ts leest hem).
 */
import { elementen, leesXml, platteTekst, xmlTekst, type XmlElement } from "./xml.ts";

/** Grote operatoren: met hun grenzen en de term erachter een `m:nary`. */
const NARY = new Set(["∑", "∏", "∐", "∫", "∬", "∭", "∮", "⋃", "⋂", "⋁", "⋀", "⨁", "⨂"]);

/** Een accentteken van KaTeX en het combinerende teken dat OMML verwacht. */
const ACCENT: Record<string, string> = {
  "^": "̂", "ˆ": "̂", "ˉ": "̄", "¯": "̄", "~": "̃", "˜": "̃",
  "˙": "̇", "¨": "̈", "ˇ": "̌", "´": "́", "`": "̀", "˘": "̆",
  "→": "⃗", "⃗": "⃗", "←": "⃖", "˚": "̊",
};

/** Strepen boven of onder: een `m:bar`. */
const STREEP = new Set(["‾", "¯", "_", "―", "−", "ˉ"]);

/** Accolades en haken boven of onder: een `m:groupChr`. */
const GROEP = new Set(["⏟", "⏞", "⏜", "⏝", "⎴", "⎵", "︷", "︸"]);

/** Tekens die niets tonen: functietoepassing, onzichtbaar maal, scheiding en plus. */
const ONZICHTBAAR = /[⁡-⁤​]/g;

/** Opties voor één run: rechtop, vet, en of het tekst is. */
interface RunStijl { sty?: "p" | "b" | "bi" | "i"; tekst?: boolean }

/**
 * De kleur van `mstyle mathcolor` waarbinnen de omzetting nu is (KaTeX kleurt een
 * uitkomst), als `RRGGBB`. De omzetting loopt in één keer door, dus een stapel volstaat.
 */
const kleuren: string[] = [];

function run(tekst: string, stijl: RunStijl = {}): string {
  const t = tekst.replace(ONZICHTBAAR, "");
  if (!t) return "";
  const eigen = [stijl.tekst ? "<m:nor/>" : "", stijl.sty ? `<m:sty m:val="${stijl.sty}"/>` : ""].join("");
  const rPr = eigen ? `<m:rPr>${eigen}</m:rPr>` : "";
  const kleur = kleuren[kleuren.length - 1];
  const wPr = `<w:rPr><w:rFonts w:ascii="Cambria Math" w:hAnsi="Cambria Math"/>${kleur ? `<w:color w:val="${kleur}"/>` : ""}</w:rPr>`;
  return `<m:r>${rPr}${wPr}<m:t xml:space="preserve">${xmlTekst(t)}</m:t></m:r>`;
}

/** Een CSS-kleur van MathML (`#059669`, `#0a6`, `red`) als `RRGGBB`; anders niets. */
function hexVan(kleur: string | undefined): string | undefined {
  if (!kleur) return undefined;
  const k = kleur.trim().toLowerCase();
  const kort = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(k);
  if (kort) return (kort[1] + kort[1] + kort[2] + kort[2] + kort[3] + kort[3]).toUpperCase();
  if (/^#[0-9a-f]{6}$/.test(k)) return k.slice(1).toUpperCase();
  const naam: Record<string, string> = { red: "FF0000", green: "008000", blue: "0000FF", black: "000000", gray: "808080", grey: "808080", orange: "FFA500" };
  return naam[k];
}

/** Een `mi`, `mn` of `mo` waar KaTeX een hele rij in zet (`\boldsymbol`): dan is het een rij. */
const tokenMetRij = (el: XmlElement) => ["mi", "mn", "mo", "mtext"].includes(el.naam) && elementen(el).length > 0;

/** De stijl uit `mathvariant`; zonder: wat MathML voor dit element aanneemt. */
function stijlVan(el: XmlElement, standaard: RunStijl["sty"]): RunStijl["sty"] {
  switch (el.attr.mathvariant) {
    case "normal": return "p";
    case "bold": return "b";
    case "bold-italic": return "bi";
    case "italic": return "i";
    default: return standaard;
  }
}

/** Een `mspace` als spatie: hoe breder, hoe breder het teken. */
function ruimte(el: XmlElement): string {
  const m = /^(-?[\d.]+)\s*(em|ex|pt|px|mu)?$/.exec((el.attr.width ?? "").trim());
  if (!m) return "";
  let em = parseFloat(m[1]);
  if (m[2] === "ex") em *= 0.43;
  else if (m[2] === "pt") em /= 10;
  else if (m[2] === "px") em /= 16;
  else if (m[2] === "mu") em /= 18;
  if (!(em > 0.05)) return "";
  return run(em >= 1.5 ? "  " : em >= 0.9 ? " " : em >= 0.25 ? " " : " ");
}

const e = (binnen: string) => `<m:e>${binnen}</m:e>`;

/** Het enige teken van een `mo` of `mi`, of `null` als het meer of iets anders is. */
function teken(el: XmlElement | undefined): string | null {
  if (!el || (el.naam !== "mo" && el.naam !== "mi" && el.naam !== "mtext")) return null;
  const t = platteTekst(el).trim();
  return t ? t : null;
}

/** Is `el` een grote operator (∑, ∫) met grenzen? */
function isNary(el: XmlElement): boolean {
  const basis = elementen(el)[0];
  return ["msub", "msup", "msubsup", "munder", "mover", "munderover"].includes(el.naam) && basis?.naam === "mo" && NARY.has(platteTekst(basis).trim());
}

/** Een grote operator met zijn grenzen, en de term erachter als `e`. */
function nary(el: XmlElement, term: string): string {
  const [basis, a, b] = elementen(el);
  const chr = platteTekst(basis).trim();
  const onder = el.naam === "msup" || el.naam === "mover" ? null : a;
  const boven = el.naam === "msubsup" || el.naam === "munderover" ? b : el.naam === "msup" || el.naam === "mover" ? a : null;
  const plek = el.naam.startsWith("mu") || el.naam === "mover" ? "undOvr" : "subSup";
  const pr = [
    `<m:chr m:val="${xmlTekst(chr)}"/>`,
    `<m:limLoc m:val="${plek}"/>`,
    onder ? "" : '<m:subHide m:val="1"/>',
    boven ? "" : '<m:supHide m:val="1"/>',
  ].join("");
  return `<m:nary><m:naryPr>${pr}</m:naryPr><m:sub>${onder ? knoop(onder) : ""}</m:sub><m:sup>${boven ? knoop(boven) : ""}</m:sup>${e(term)}</m:nary>`;
}

/**
 * De stijl van een losse letter (`mi` met één teken): "" voor cursief zoals MathML het
 * aanneemt, anders "p", "b" of "bi". `null` voor alles wat geen losse letter is.
 */
function letterStijl(el: XmlElement): "" | NonNullable<RunStijl["sty"]> | null {
  if (el.naam !== "mi" || tokenMetRij(el) || [...platteTekst(el)].length !== 1) return null;
  return stijlVan(el, undefined) ?? "";
}

/**
 * Een rij knopen. Haakjes om de hele rij (`\left( … \right)`, een matrix) worden een
 * `m:d`; een grote operator neemt de knoop erna als zijn term.
 */
function rij(kinderen: XmlElement[]): string {
  const eerste = kinderen[0];
  const laatste = kinderen[kinderen.length - 1];
  if (kinderen.length >= 2 && eerste.naam === "mo" && laatste.naam === "mo" && eerste.attr.fence === "true" && laatste.attr.fence === "true") {
    const beg = platteTekst(eerste).trim();
    const end = platteTekst(laatste).trim();
    const chr = (c: string) => (c === "." ? "" : c);
    return `<m:d><m:dPr><m:begChr m:val="${xmlTekst(chr(beg))}"/><m:endChr m:val="${xmlTekst(chr(end))}"/></m:dPr>${e(rij(kinderen.slice(1, -1)))}</m:d>`;
  }
  let uit = "";
  for (let i = 0; i < kinderen.length; i++) {
    const k = kinderen[i];
    // Letters achter elkaar in dezelfde stijl zijn één run: "kNm" en niet "k", "N", "m".
    // Zo leest een editor een eenheid of index als één woord.
    const stijl = letterStijl(k);
    if (stijl !== null) {
      let tekst = platteTekst(k);
      while (i + 1 < kinderen.length && letterStijl(kinderen[i + 1]) === stijl) tekst += platteTekst(kinderen[++i]);
      uit += run(tekst, { sty: stijl || undefined });
      continue;
    }
    if (isNary(k)) {
      const volgende = kinderen[i + 1];
      uit += nary(k, volgende ? knoop(volgende) : "");
      if (volgende) i++;
    } else {
      uit += knoop(k);
    }
  }
  return uit;
}

/** Iets boven of onder een basis: accent, streep, accolade of grens. */
function erbij(basis: XmlElement, erbijEl: XmlElement, boven: boolean, accent: boolean): string {
  const t = teken(erbijEl);
  if (t && STREEP.has(t) && (erbijEl.attr.stretchy === "true" || !accent || t !== "ˉ")) {
    return `<m:bar><m:barPr><m:pos m:val="${boven ? "top" : "bot"}"/></m:barPr>${e(knoop(basis))}</m:bar>`;
  }
  if (t && GROEP.has(t)) {
    return `<m:groupChr><m:groupChrPr><m:chr m:val="${xmlTekst(t)}"/><m:pos m:val="${boven ? "top" : "bot"}"/><m:vertJc m:val="${boven ? "bot" : "top"}"/></m:groupChrPr>${e(knoop(basis))}</m:groupChr>`;
  }
  if (t && accent && boven && t.length <= 2) {
    const chr = ACCENT[t] ?? t;
    return `<m:acc><m:accPr><m:chr m:val="${xmlTekst(chr)}"/></m:accPr>${e(knoop(basis))}</m:acc>`;
  }
  const soort = boven ? "limUpp" : "limLow";
  return `<m:${soort}>${e(knoop(basis))}<m:lim>${knoop(erbijEl)}</m:lim></m:${soort}>`;
}

/** Een tabel als matrix: elke rij een `m:mr`, elke cel een `m:e`. */
function matrix(el: XmlElement): string {
  const rijen = elementen(el).filter((r) => r.naam === "mtr" || r.naam === "mlabeledtr");
  const kolommen = Math.max(1, ...rijen.map((r) => elementen(r).filter((c) => c.naam === "mtd").length));
  const uitlijning = (el.attr.columnalign ?? "").split(/\s+/).filter(Boolean);
  const kolomPr = Array.from({ length: kolommen }, (_, i) => {
    const jc = uitlijning[i] ?? uitlijning[uitlijning.length - 1] ?? "center";
    return `<m:mc><m:mcPr><m:count m:val="1"/><m:mcJc m:val="${jc === "left" ? "left" : jc === "right" ? "right" : "center"}"/></m:mcPr></m:mc>`;
  }).join("");
  const mr = rijen.map((r) => {
    const cellen = elementen(r).filter((c) => c.naam === "mtd");
    const leeg = Array.from({ length: kolommen - cellen.length }, () => "<m:e/>").join("");
    return `<m:mr>${cellen.map((c) => e(rij(elementen(c)))).join("")}${leeg}</m:mr>`;
  }).join("");
  return `<m:m><m:mPr><m:mcs>${kolomPr}</m:mcs></m:mPr>${mr}</m:m>`;
}

/** Eén MathML-knoop als OMML. */
function knoop(el: XmlElement): string {
  const k = elementen(el);
  if (tokenMetRij(el)) return rij(k);
  const kleur = el.naam === "mstyle" ? hexVan(el.attr.mathcolor ?? el.attr.color) : undefined;
  if (kleur) {
    kleuren.push(kleur);
    try {
      return rij(k);
    } finally {
      kleuren.pop();
    }
  }
  switch (el.naam) {
    case "math":
    case "mrow":
    case "mstyle":
    case "mpadded":
    case "mtd":
    case "merror":
      return rij(k);
    case "semantics":
      // Alleen de eerste knoop is de formule; de annotaties (TeX) zijn bijwerk.
      return k[0] ? knoop(k[0]) : "";
    case "annotation":
    case "annotation-xml":
    case "mphantom":
    case "none":
    case "mprescripts":
      return "";
    case "mi": {
      const t = platteTekst(el);
      // Eén letter is cursief, een woord (sin, max) rechtop: zo leest MathML het.
      return run(t, { sty: stijlVan(el, [...t.trim()].length > 1 ? "p" : undefined) });
    }
    case "mn":
      return run(platteTekst(el), { sty: stijlVan(el, "p") });
    case "mo":
      return run(platteTekst(el), { sty: stijlVan(el, "p") });
    case "mtext":
    case "ms":
      return run(platteTekst(el).replace(/ /g, " "), { sty: stijlVan(el, "p"), tekst: true });
    case "mspace":
      return ruimte(el);
    case "msub":
      if (k.length < 2) break;
      return `<m:sSub>${e(knoop(k[0]))}<m:sub>${knoop(k[1])}</m:sub></m:sSub>`;
    case "msup":
      if (k.length < 2) break;
      return `<m:sSup>${e(knoop(k[0]))}<m:sup>${knoop(k[1])}</m:sup></m:sSup>`;
    case "msubsup":
      if (k.length < 3) break;
      return `<m:sSubSup>${e(knoop(k[0]))}<m:sub>${knoop(k[1])}</m:sub><m:sup>${knoop(k[2])}</m:sup></m:sSubSup>`;
    case "mfrac": {
      if (k.length < 2) break;
      const zonderStreep = /^0(\.0*)?(px|em|pt)?$/.test((el.attr.linethickness ?? "").trim());
      const pr = zonderStreep ? '<m:fPr><m:type m:val="noBar"/></m:fPr>' : "";
      return `<m:f>${pr}<m:num>${knoop(k[0])}</m:num><m:den>${knoop(k[1])}</m:den></m:f>`;
    }
    case "msqrt":
      return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/>${e(rij(k))}</m:rad>`;
    case "mroot":
      if (k.length < 2) break;
      return `<m:rad><m:deg>${knoop(k[1])}</m:deg>${e(knoop(k[0]))}</m:rad>`;
    case "mover":
      if (k.length < 2) break;
      return erbij(k[0], k[1], true, el.attr.accent === "true");
    case "munder":
      if (k.length < 2) break;
      return erbij(k[0], k[1], false, el.attr.accentunder === "true");
    case "munderover":
      if (k.length < 3) break;
      return `<m:limUpp>${e(`<m:limLow>${e(knoop(k[0]))}<m:lim>${knoop(k[1])}</m:lim></m:limLow>`)}<m:lim>${knoop(k[2])}</m:lim></m:limUpp>`;
    case "mtable":
      return matrix(el);
    case "menclose":
      if ((el.attr.notation ?? "").includes("box")) return `<m:borderBox>${e(rij(k))}</m:borderBox>`;
      return rij(k);
    case "mfenced": {
      const open = el.attr.open ?? "(";
      const dicht = el.attr.close ?? ")";
      return `<m:d><m:dPr><m:begChr m:val="${xmlTekst(open)}"/><m:endChr m:val="${xmlTekst(dicht)}"/></m:dPr>${k.map((x) => e(knoop(x))).join("")}</m:d>`;
    }
  }
  // Onbekend, of te weinig kinderen: de tekst, zodat er niets wegvalt.
  return run(platteTekst(el));
}

/**
 * Zet MathML (een `<math>`-element als tekst) om naar OMML. `blok` geeft een eigen
 * alinea (`m:oMathPara`), links uitgelijnd zoals in de rekenbladen; anders een
 * `m:oMath` midden in de tekst.
 */
export function mathmlNaarOmml(mathml: string, blok = false): string {
  const wortel = leesXml(mathml);
  const binnen = knoop(wortel);
  const om = `<m:oMath>${binnen}</m:oMath>`;
  return blok ? `<m:oMathPara><m:oMathParaPr><m:jc m:val="left"/></m:oMathParaPr>${om}</m:oMathPara>` : om;
}
