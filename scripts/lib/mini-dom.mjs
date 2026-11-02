/**
 * Een kleine DOMParser voor Node, genoeg om een `@svg`-blok terug te lezen
 * zoals components/tekenen/code.ts dat in de app doet (DOMParser van de
 * webview). Kent: elementen met attributen, zelfsluitende tags, tekst,
 * commentaar, tekenverwijzingen (&amp; &#46; &#x2E;), querySelector op een
 * tagnaam, children, textContent, innerHTML en outerHTML.
 *
 * Geen volledige HTML-parser: hij is bedoeld voor goed gevormde SVG zoals de
 * editor en de DXF-omzetting die schrijven.
 */

export const Node = { ELEMENT_NODE: 1, TEXT_NODE: 3, COMMENT_NODE: 8 };

const NAMEN = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function ontcijfer(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (heel, c) => {
    if (c[0] === "#") {
      const n = c[1] === "x" || c[1] === "X" ? parseInt(c.slice(2), 16) : parseInt(c.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : heel;
    }
    return NAMEN[c.toLowerCase()] ?? heel;
  });
}

const tekstUit = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, "&nbsp;");
const attrUit = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/ /g, "&nbsp;");

class Knoop {
  constructor(nodeType) {
    this.nodeType = nodeType;
    this.childNodes = [];
    this.parentNode = null;
  }
  get textContent() {
    if (this.nodeType !== Node.ELEMENT_NODE) return this.data;
    return this.childNodes.map((k) => (k.nodeType === Node.COMMENT_NODE ? "" : k.textContent)).join("");
  }
}

class Tekst extends Knoop {
  constructor(data) {
    super(Node.TEXT_NODE);
    this.data = data;
  }
  get outerHTML() {
    return tekstUit(this.data);
  }
}

class Commentaar extends Knoop {
  constructor(data) {
    super(Node.COMMENT_NODE);
    this.data = data;
  }
  get outerHTML() {
    return `<!--${this.data}-->`;
  }
}

class Elem extends Knoop {
  constructor(tagName, attrs) {
    super(Node.ELEMENT_NODE);
    this.tagName = tagName;
    this.attributes = attrs;
  }
  getAttribute(n) {
    const a = this.attributes.find((x) => x.name === n) ?? this.attributes.find((x) => x.name.toLowerCase() === n.toLowerCase());
    return a ? a.value : null;
  }
  hasAttribute(n) {
    return this.getAttribute(n) !== null;
  }
  get children() {
    return this.childNodes.filter((k) => k.nodeType === Node.ELEMENT_NODE);
  }
  querySelector(tag) {
    for (const k of this.children) {
      if (k.tagName.toLowerCase() === tag.toLowerCase()) return k;
      const diep = k.querySelector(tag);
      if (diep) return diep;
    }
    return null;
  }
  get innerHTML() {
    return this.childNodes.map((k) => k.outerHTML).join("");
  }
  get outerHTML() {
    const a = this.attributes.map((x) => ` ${x.name}="${attrUit(x.value)}"`).join("");
    return `<${this.tagName}${a}>${this.innerHTML}</${this.tagName}>`;
  }
}

function leesAttributen(s) {
  const uit = [];
  for (const m of s.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
    uit.push({ name: m[1], value: ontcijfer(m[2] ?? m[3] ?? m[4] ?? "") });
  }
  return uit;
}

/** Leest markup in een boom onder `wortel`. */
function bouw(markup, wortel) {
  const stapel = [wortel];
  const top = () => stapel[stapel.length - 1];
  const re = /<!--([\s\S]*?)-->|<\/([A-Za-z][\w:-]*)\s*>|<([A-Za-z][\w:-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>|([^<]+)/g;
  for (const m of markup.matchAll(re)) {
    let k;
    if (m[1] !== undefined) {
      k = new Commentaar(m[1]);
    } else if (m[2] !== undefined) {
      const i = stapel.map((e) => e.tagName).lastIndexOf(m[2]);
      if (i > 0) stapel.length = i;
      continue;
    } else if (m[3] !== undefined) {
      k = new Elem(m[3], leesAttributen(m[4] ?? ""));
      k.parentNode = top();
      top().childNodes.push(k);
      if (!m[5]) stapel.push(k);
      continue;
    } else {
      k = new Tekst(ontcijfer(m[6]));
    }
    k.parentNode = top();
    top().childNodes.push(k);
  }
  return wortel;
}

export class DOMParser {
  parseFromString(s) {
    const body = new Elem("body", []);
    bouw(s.replace(/^<!doctype[^>]*>/i, "").replace(/^\s*<body>/i, "").replace(/<\/body>\s*$/i, ""), body);
    return { body, documentElement: body };
  }
}
