/**
 * Leest terug wat er in een SVG getekend staat, voor de controles op de tekeningen
 * in de formulebibliotheek: elk element met zijn plaats op het blad, dus met de
 * `transform`s van de groepen eromheen verrekend. Een browser heeft de controle niet
 * nodig: rechte lijnen, bogen en Bézierkrommen laten zich hier gewoon narekenen.
 */

const STAP_KROMME = 24;
/** Breedte van een letter bij 12 px, ruim genomen: tekst heeft hier geen echte maat. */
const LETTERBREEDTE = 6.2;

const eenheid = [1, 0, 0, 1, 0, 0];
const maal = (m, n) => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const pas = (m, [x, y]) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

function leesTransform(tekst) {
  let m = eenheid;
  for (const [, soort, args] of tekst.matchAll(/(translate|scale|rotate)\(([^)]*)\)/g)) {
    const a = args.trim().split(/[\s,]+/).map(Number);
    if (soort === "translate") m = maal(m, [1, 0, 0, 1, a[0], a[1] ?? 0]);
    if (soort === "scale") m = maal(m, [a[0], 0, 0, a[1] ?? a[0], 0, 0]);
    if (soort === "rotate") {
      const h = (a[0] * Math.PI) / 180;
      m = maal(m, [Math.cos(h), Math.sin(h), -Math.sin(h), Math.cos(h), 0, 0]);
    }
  }
  return m;
}

/** De stukken van een pad, met absolute punten: { soort, van, naar, c1, c2, r }. */
export function leesPad(d) {
  const tokens = d.match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/g) ?? [];
  const stukken = [];
  let i = 0;
  let nu = [0, 0];
  let begin = [0, 0];
  let cmd = "";
  const getal = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[i])) cmd = tokens[i++];
    const rel = cmd === cmd.toLowerCase();
    const basis = rel ? nu : [0, 0];
    switch (cmd.toUpperCase()) {
      case "M": {
        nu = [basis[0] + getal(), basis[1] + getal()];
        begin = nu;
        cmd = rel ? "l" : "L";
        break;
      }
      case "L": {
        const naar = [basis[0] + getal(), basis[1] + getal()];
        stukken.push({ soort: "L", van: nu, naar });
        nu = naar;
        break;
      }
      case "H": {
        const naar = [basis[0] + getal(), nu[1]];
        stukken.push({ soort: "L", van: nu, naar });
        nu = naar;
        break;
      }
      case "V": {
        const naar = [nu[0], basis[1] + getal()];
        stukken.push({ soort: "L", van: nu, naar });
        nu = naar;
        break;
      }
      case "Q": {
        const c1 = [basis[0] + getal(), basis[1] + getal()];
        const naar = [basis[0] + getal(), basis[1] + getal()];
        stukken.push({ soort: "Q", van: nu, c1, naar });
        nu = naar;
        break;
      }
      case "C": {
        const c1 = [basis[0] + getal(), basis[1] + getal()];
        const c2 = [basis[0] + getal(), basis[1] + getal()];
        const naar = [basis[0] + getal(), basis[1] + getal()];
        stukken.push({ soort: "C", van: nu, c1, c2, naar });
        nu = naar;
        break;
      }
      case "A": {
        const r = getal();
        getal(); // ry: de bogen hier zijn cirkelbogen
        getal(); // draaiing
        const groot = getal();
        const richting = getal();
        const naar = [basis[0] + getal(), basis[1] + getal()];
        stukken.push({ soort: "A", van: nu, r, groot, richting, naar });
        nu = naar;
        break;
      }
      case "Z":
        stukken.push({ soort: "Z", van: nu, naar: begin });
        nu = begin;
        break;
      default:
        throw new Error(`pad: onbekende opdracht ${cmd}`);
    }
    if (cmd.toUpperCase() === "Z") cmd = "";
  }
  return stukken;
}

/** Een punt op een stuk, t van 0 tot 1. */
function opStuk(s, t) {
  const u = 1 - t;
  if (s.soort === "Q") {
    return [0, 1].map((k) => u * u * s.van[k] + 2 * u * t * s.c1[k] + t * t * s.naar[k]);
  }
  if (s.soort === "C") {
    return [0, 1].map((k) => u * u * u * s.van[k] + 3 * u * u * t * s.c1[k] + 3 * u * t * t * s.c2[k] + t * t * t * s.naar[k]);
  }
  return [0, 1].map((k) => u * s.van[k] + t * s.naar[k]);
}

/**
 * De y van een pad op plaats x, op de stukken die van links naar rechts lopen: zo
 * telt de sluitlijn van een vlak langs de nullijn niet mee.
 */
export function yOpPad(stukken, x) {
  for (const s of stukken) {
    if (s.soort === "Z" || s.naar[0] <= s.van[0]) continue;
    if (x < s.van[0] - 1e-6 || x > s.naar[0] + 1e-6) continue;
    let lo = 0;
    let hi = 1;
    for (let k = 0; k < 50; k++) {
      const t = (lo + hi) / 2;
      if (opStuk(s, t)[0] < x) lo = t;
      else hi = t;
    }
    return opStuk(s, (lo + hi) / 2)[1];
  }
  return null;
}

function puntenVanPad(d) {
  const uit = [];
  for (const s of leesPad(d)) {
    uit.push(s.van, s.naar);
    if (s.soort === "Q" || s.soort === "C") {
      for (let k = 1; k < STAP_KROMME; k++) uit.push(opStuk(s, k / STAP_KROMME));
    }
    if (s.soort === "A") uit.push(...puntenOpBoog(s));
  }
  return uit;
}

/** Punten op een cirkelboog, volgens de omrekening in de SVG-specificatie (F.6.5). */
function puntenOpBoog({ van, naar, r, groot, richting }) {
  const dx = (van[0] - naar[0]) / 2;
  const dy = (van[1] - naar[1]) / 2;
  const half = Math.hypot(dx, dy);
  if (half === 0 || r === 0) return [];
  const straal = Math.max(r, half);
  const teken = groot !== richting ? 1 : -1;
  const h = teken * Math.sqrt(Math.max(straal * straal - half * half, 0));
  const cx = (van[0] + naar[0]) / 2 + (h * dy) / half;
  const cy = (van[1] + naar[1]) / 2 - (h * dx) / half;
  const a = Math.atan2(van[1] - cy, van[0] - cx);
  let b = Math.atan2(naar[1] - cy, naar[0] - cx);
  if (richting === 1 && b < a) b += 2 * Math.PI;
  if (richting === 0 && b > a) b -= 2 * Math.PI;
  return Array.from({ length: STAP_KROMME - 1 }, (_, k) => {
    const hoek = a + ((b - a) * (k + 1)) / STAP_KROMME;
    return [cx + straal * Math.cos(hoek), cy + straal * Math.sin(hoek)];
  });
}

const getal = (a, naam, standaard = 0) => (a[naam] === undefined ? standaard : Number(a[naam]));

/** Alle punten van een element, in zijn eigen stelsel. */
function puntenVan(el) {
  const a = el.attrs;
  switch (el.tag) {
    case "line":
      return [[getal(a, "x1"), getal(a, "y1")], [getal(a, "x2"), getal(a, "y2")]];
    case "rect": {
      const [x, y, w, h] = [getal(a, "x"), getal(a, "y"), getal(a, "width"), getal(a, "height")];
      return [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
    }
    case "circle": {
      const [x, y, r] = [getal(a, "cx"), getal(a, "cy"), getal(a, "r")];
      return [[x - r, y], [x + r, y], [x, y - r], [x, y + r]];
    }
    case "polygon":
    case "polyline":
      return (a.points ?? "").trim().split(/\s+/).map((p) => p.split(",").map(Number));
    case "path":
      return puntenVanPad(a.d ?? "");
    case "text": {
      const grootte = Number(a.style?.match(/font-size:\s*([\d.]+)px/)?.[1] ?? 12);
      const breedte = [...el.tekst].length * LETTERBREEDTE * (grootte / 12);
      const links = { start: 0, middle: 0.5, end: 1 }[a["text-anchor"] ?? "start"] * breedte;
      const y = getal(a, "y") + getal(a, "dy");
      const x = getal(a, "x") + getal(a, "dx");
      return [[x - links, y], [x + breedte - links, y]];
    }
    default:
      return [];
  }
}

/**
 * Leest een SVG. Geeft de maat van het vak en de elementen met `klasse`, `attrs`,
 * `tekst` (bij een <text>, zonder de opmaak) en `punten` op het blad.
 */
export function leesSvg(svg) {
  const elementen = [];
  const stapel = [eenheid];
  const viewBox = svg.match(/viewBox="([^"]*)"/)?.[1].trim().split(/\s+/).map(Number) ?? [0, 0, 0, 0];
  const TAG = /<(\/?)([a-zA-Z]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>/g;
  let m;
  let open = null;
  while ((m = TAG.exec(svg))) {
    const [geheel, sluit, tag, ruw, zelf] = m;
    if (sluit) {
      if (tag === "text" && open) {
        open.tekst = svg.slice(open.eindTag, m.index).replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
        open.punten = puntenVan(open).map((p) => pas(open.matrix, p));
        elementen.push(open);
        open = null;
      }
      if (tag === "g" || tag === "text") stapel.pop();
      continue;
    }
    const attrs = Object.fromEntries([...ruw.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, n, w]) => [n, w]));
    const matrix = attrs.transform ? maal(stapel.at(-1), leesTransform(attrs.transform)) : stapel.at(-1);
    if (tag === "g") {
      elementen.push({ tag, attrs, klasse: attrs.class ?? "", matrix, tekst: "", punten: [] });
      stapel.push(matrix);
    } else if (tag === "text") {
      stapel.push(matrix);
      open = { tag, attrs, klasse: attrs.class ?? "", matrix, eindTag: m.index + geheel.length, tekst: "", punten: [] };
    } else if (tag !== "svg" && tag !== "tspan") {
      const el = { tag, attrs, klasse: attrs.class ?? "", matrix, tekst: "" };
      el.punten = puntenVan(el).map((p) => pas(matrix, p));
      elementen.push(el);
    }
    void zelf;
  }
  return { breedte: viewBox[2], hoogte: viewBox[3], elementen };
}

/** Wat buiten het vak valt, of geen eindig getal is; leeg als alles klopt. */
export function buitenVak(gelezen, marge = 1) {
  const uit = [];
  for (const el of gelezen.elementen) {
    for (const [x, y] of el.punten) {
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        uit.push(`${el.tag} ${el.klasse} heeft een maat die geen getal is`);
        break;
      }
      if (x < -marge || y < -marge || x > gelezen.breedte + marge || y > gelezen.hoogte + marge) {
        uit.push(`${el.tag} ${el.klasse} "${el.tekst}" op (${x.toFixed(1)}, ${y.toFixed(1)}) in een vak van ${gelezen.breedte} × ${gelezen.hoogte}`);
        break;
      }
    }
  }
  return uit;
}

/** De omhullende van alle punten van deze elementen: [links, boven, rechts, onder]. */
export function omhullende(elementen) {
  const xs = elementen.flatMap((el) => el.punten.map((p) => p[0]));
  const ys = elementen.flatMap((el) => el.punten.map((p) => p[1]));
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

/** Een getal uit de tekst `naam = getal …` in de tekening; `null` als die tekst er niet staat. */
export function getalInTekst(gelezen, naam) {
  for (const el of gelezen.elementen) {
    if (el.tag !== "text" || !el.tekst.startsWith(`${naam} = `)) continue;
    const n = Number(el.tekst.slice(naam.length + 3).split(" ")[0]);
    return { waarde: n, element: el };
  }
  return null;
}
