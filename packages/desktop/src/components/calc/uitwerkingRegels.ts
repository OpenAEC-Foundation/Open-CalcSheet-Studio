/**
 * De opschoning van de uitwerking: wat er van de html van de kern in het document
 * mag komen. Een rekenblad kan van iemand anders komen, en een tekstregel (`'…`) of
 * `@svg`-blok gaat rechtstreeks de html in. In het hoofddocument heeft een script
 * toegang tot alles, ook tot Tauri; dat is precies wat de sandbox van `@js` en
 * `@iframe` moet voorkomen.
 *
 * Weg gaan: scripts, event-attributen, `javascript:`-adressen, iframes, object,
 * embed, formulieren, meta, base en link. DOMPurify doet het echte werk; hier staat
 * wat er voor deze app bovenop of bij moet:
 *
 *   `use`, `semantics`, `annotation`
 *       Staan bij DOMPurify standaard uit. De tekeningen uit Tekenen gebruiken
 *       `<use href="#…">`, en de formules van KaTeX MathML met een annotatie.
 *   een `use` wijst alleen naar deze pagina (`#…`)
 *       Een extern of `data:`-adres kan een eigen SVG met scripts binnenhalen.
 *   CSS: geen `url()` of `image-set()` naar buiten, `@import` of `position: fixed`
 *       Een stijl kan een verzoek naar buiten doen, of de hele app met iets anders
 *       bedekken. Dat geldt ook voor de SVG-attributen die een `url()` aannemen.
 *   geen adres naar buiten dat vanzelf laadt
 *       Een tekstregel kan een waarde in het adres zetten: `<img src="https://…?L={{L}}">`
 *       stuurt die dan weg, alleen al door het blad te openen. Een afbeelding krijgt
 *       daarom `data-extern-src` en laadt pas na bevestiging (iframeBlok.ts); voor de
 *       rest (video, geluid, `<image>` in een filter) vervalt het adres. Een link blijft:
 *       die gaat pas open als je erop klikt, en dan in de systeembrowser
 *       (uitwerkingOpschonen.ts).
 *   `<style>` alleen binnen SVG
 *       Een geplakte tekening heeft dat vaak nodig. Een los stijlblok niet.
 *
 * Geen imports van buiten en geen DOM, zodat scripts/check-js-blok.mjs dit bestand
 * in Node met jsdom kan laden; uitwerkingOpschonen.ts is de kant van de browser.
 */
import type { Config, DOMPurify } from "dompurify";

const SVG_NS = "http://www.w3.org/2000/svg";
const HTML_NS = "http://www.w3.org/1999/xhtml";
/** MathML-namen, hier alleen van belang als de browser ze als html heeft gelezen. */
const MATHML_IN_HTML = /^m(?:row|i|n|o|s|text|sup|sub|subsup|frac|sqrt|root|style|table|tr|td|space|padded|phantom|over|under|underover)$/;

export const OPSCHOON_CONFIG: Config = {
  ADD_TAGS: ["use", "semantics", "annotation"],
  ADD_ATTR: ["encoding", "xlink:href"],
  FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "meta", "base", "link", "frame", "frameset", "applet", "noscript", "template", "foreignobject"],
  FORBID_ATTR: ["srcdoc", "formaction", "action", "ping", "background", "srcset", "poster"],
  ALLOW_DATA_ATTR: true,
  ALLOW_ARIA_ATTR: true,
  KEEP_CONTENT: true,
};

/** Een stijl die iets ophaalt of de app bedekt. Een verwijzing binnen de tekening (`url(#a)`) mag. */
export function gevaarlijkeStijl(css: string): boolean {
  // Eerst zonder commentaar en CSS-escapes: `u\72 l(` is ook `url(`.
  const t = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\\([0-9a-f]{1,6})\s?/gi, (_m, hex: string) => String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff) || 0xfffd))
    .replace(/\\/g, "")
    .toLowerCase();
  if (/@import|expression\s*\(|behavior\s*:|-moz-binding|image-set\s*\(|\bsrc\s*\(/.test(t)) return true;
  if (/position\s*:\s*(fixed|sticky)/.test(t)) return true;
  for (const m of t.matchAll(/url\(\s*(['"]?)\s*([^)'"\s]*)/g)) {
    if (!m[2].startsWith("#") && !m[2].startsWith("data:image/")) return true;
  }
  return false;
}

/** Waar een relatief adres in dit bestand op uitkomt; alleen om het van buiten te onderscheiden. */
const HIER = "http://deze-app.invalid/";

/**
 * Het volledige adres als het de deur uit gaat, anders null. `new URL` leest het zoals de
 * browser: ook `//x.nl`, `/\x.nl` en een adres met tabs erin. `data:` en `blob:` blijven
 * hier, en een relatief adres ook. Wat `new URL` niet leest, laadt de browser ook niet.
 */
export function adresNaarBuiten(adres: string): string | null {
  try {
    const u = new URL(adres, HIER);
    return /^(https?|ftp|wss?):$/.test(u.protocol) && u.hostname !== "deze-app.invalid" ? u.href : null;
  } catch {
    return null;
  }
}

/** Waar een link in de uitwerking heen mag, buiten de app; anders null. */
export function linkNaarBuiten(adres: string): string | null {
  try {
    const u = new URL(adres, HIER);
    if (u.hostname === "deze-app.invalid") return null;
    return /^(https?|mailto):$/.test(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
}

/** SVG-attributen die een `url()` aannemen, naast `style`. */
const STIJL_ATTRIBUUT = /^(?:style|fill|stroke|filter|mask|clip-path|marker-(?:start|mid|end)|cursor)$/;

/** Hangt de regels van deze app aan een DOMPurify-instantie en geeft de opschoner. */
export function maakOpschoner(purify: DOMPurify): (html: string) => string {
  purify.addHook("uponSanitizeElement", (node, data) => {
    const el = node as Element;
    if (data.tagName === "style") {
      const inSvg = el.namespaceURI === SVG_NS;
      if (!inSvg || gevaarlijkeStijl(el.textContent ?? "")) el.parentNode?.removeChild(el);
    } else if (MATHML_IN_HTML.test(data.tagName) && el.namespaceURI === HTML_NS && el.closest?.("math")) {
      // KaTeX schrijft een vet getal als <mi><mrow>…: de browser leest die <mrow> als
      // html, en DOMPurify gooit hem met inhoud weg. De tekst blijft zo bij de schermlezer.
      el.parentNode?.replaceChild(el.ownerDocument.createTextNode(el.textContent ?? ""), el);
    }
  });
  purify.addHook("uponSanitizeAttribute", (node, data) => {
    if (STIJL_ATTRIBUUT.test(data.attrName) && gevaarlijkeStijl(data.attrValue)) data.keepAttr = false;
    if ((data.attrName === "href" || data.attrName === "xlink:href") && node.nodeName.toLowerCase() === "use"
      && !data.attrValue.trim().startsWith("#")) {
      data.keepAttr = false;
    }
  });
  purify.addHook("afterSanitizeAttributes", (node) => {
    const el = node as Element;
    if (!el.getAttribute) return;
    const soort = el.localName.toLowerCase();
    const inSvg = el.namespaceURI === SVG_NS;
    for (const naam of ["src", "href", "xlink:href"]) {
      const adres = adresNaarBuiten(el.getAttribute(naam) ?? "");
      if (!adres) continue;
      // Een href laadt vanzelf in SVG, behalve op een link. In html is hij altijd een link.
      if (naam !== "src" && (!inSvg || soort === "a")) continue;
      el.removeAttribute(naam);
      if (soort === "img" || soort === "image") el.setAttribute("data-extern-src", adres);
    }
  });
  return (html: string) => purify.sanitize(html, OPSCHOON_CONFIG) as string;
}
