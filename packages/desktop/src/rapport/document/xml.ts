/**
 * Kleine XML-hulpen voor de export naar DOCX en ODT: tekst veilig in XML zetten, en
 * een eenvoudige lezer voor de MathML die KaTeX naast zijn HTML zet.
 *
 * Geen DOM nodig: de omzetting naar OMML en ODT werkt zo ook in Node, waar de controle
 * (scripts/check-rapport-docx-odt.mjs) hem zonder browser toetst.
 */

/** Tekens die in XML 1.0 niet mogen staan: stuurtekens behalve tab en regeleinde. */
const VERBODEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

/** Tekst voor tussen twee tags of in een attribuut. */
export function xmlTekst(s: string): string {
  return s
    .replace(VERBODEN, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Een element uit de lezer: naam zonder voorvoegsel, attributen, en kinderen. */
export interface XmlElement {
  naam: string;
  attr: Record<string, string>;
  kinderen: XmlKnoop[];
}

export type XmlKnoop = XmlElement | string;

const BENOEMD: Record<string, string> = { lt: "<", gt: ">", amp: "&", quot: '"', apos: "'", nbsp: " " };

function ontsleutel(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z]+);/g, (heel, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : heel;
    }
    return BENOEMD[code] ?? heel;
  });
}

/** De naam zonder voorvoegsel: `m:math` en `math` zijn hier hetzelfde. */
const kaal = (naam: string) => naam.slice(naam.indexOf(":") + 1);

/**
 * Leest goed gevormde XML tot een boom. Commentaar, verwerkingsopdrachten en een
 * doctype vallen weg. Gooit een fout bij XML die niet klopt: een tag die niet sluit of
 * een verkeerde sluittag.
 */
export function leesXml(bron: string): XmlElement {
  const wortel: XmlElement = { naam: "#wortel", attr: {}, kinderen: [] };
  const stapel: XmlElement[] = [wortel];
  let i = 0;
  while (i < bron.length) {
    const lt = bron.indexOf("<", i);
    if (lt < 0) {
      voegTekst(stapel[stapel.length - 1], bron.slice(i));
      break;
    }
    if (lt > i) voegTekst(stapel[stapel.length - 1], bron.slice(i, lt));
    if (bron.startsWith("<!--", lt)) {
      const eind = bron.indexOf("-->", lt + 4);
      if (eind < 0) throw new Error("XML: commentaar sluit niet");
      i = eind + 3;
    } else if (bron.startsWith("<![CDATA[", lt)) {
      const eind = bron.indexOf("]]>", lt + 9);
      if (eind < 0) throw new Error("XML: CDATA sluit niet");
      stapel[stapel.length - 1].kinderen.push(bron.slice(lt + 9, eind));
      i = eind + 3;
    } else if (bron[lt + 1] === "?" || bron[lt + 1] === "!") {
      const eind = bron.indexOf(">", lt);
      if (eind < 0) throw new Error("XML: opdracht sluit niet");
      i = eind + 1;
    } else if (bron[lt + 1] === "/") {
      const eind = bron.indexOf(">", lt);
      if (eind < 0) throw new Error("XML: sluittag sluit niet");
      const naam = kaal(bron.slice(lt + 2, eind).trim());
      const open = stapel.pop();
      if (!open || open === wortel || open.naam !== naam) throw new Error(`XML: </${naam}> sluit <${open?.naam ?? "?"}>`);
      i = eind + 1;
    } else {
      const tag = /^<([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/.exec(bron.slice(lt));
      if (!tag) throw new Error(`XML: onleesbare tag bij positie ${lt}`);
      const el: XmlElement = { naam: kaal(tag[1]), attr: {}, kinderen: [] };
      for (const a of tag[2].matchAll(/([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        el.attr[kaal(a[1])] = ontsleutel(a[2] ?? a[3] ?? "");
      }
      stapel[stapel.length - 1].kinderen.push(el);
      if (!tag[3]) stapel.push(el);
      i = lt + tag[0].length;
    }
  }
  if (stapel.length > 1) throw new Error(`XML: <${stapel[stapel.length - 1].naam}> sluit niet`);
  const eerste = wortel.kinderen.find((k): k is XmlElement => typeof k !== "string");
  if (!eerste) throw new Error("XML: geen element");
  return eerste;
}

function voegTekst(el: XmlElement, ruw: string) {
  const tekst = ontsleutel(ruw);
  if (tekst) el.kinderen.push(tekst);
}

/** De elementen onder `el`, zonder tekst en zonder witruimte ertussen. */
export const elementen = (el: XmlElement): XmlElement[] => el.kinderen.filter((k): k is XmlElement => typeof k !== "string");

/** Alle tekst in `el`, achter elkaar. */
export function platteTekst(el: XmlKnoop): string {
  return typeof el === "string" ? el : el.kinderen.map(platteTekst).join("");
}

/** Schrijft een boom weer als XML, met `ns` als namespace op de wortel. */
export function schrijfXml(el: XmlElement, ns?: string): string {
  const attr = Object.entries(el.attr)
    .filter(([k]) => k !== "xmlns")
    .map(([k, v]) => ` ${k}="${xmlTekst(v)}"`)
    .join("");
  const nsAttr = ns ? ` xmlns="${ns}"` : "";
  if (el.kinderen.length === 0) return `<${el.naam}${nsAttr}${attr}/>`;
  const binnen = el.kinderen.map((k) => (typeof k === "string" ? xmlTekst(k) : schrijfXml(k))).join("");
  return `<${el.naam}${nsAttr}${attr}>${binnen}</${el.naam}>`;
}
