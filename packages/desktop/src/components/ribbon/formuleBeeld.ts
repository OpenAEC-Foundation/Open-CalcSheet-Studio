/**
 * Een plaatje bij elke formule: een schets die laat zien waar de formule over gaat, niet
 * de uitwerking. Getekend als SVG op een vlak van 160 × 90, met alleen symbolen als tekst,
 * dus in elke taal hetzelfde. De kleuren komen uit het thema (FormuleVenster.css).
 *
 * Een formule vindt haar plaatje op id; een voorbeeld uit de Library noemt in zijn index het
 * plaatje dat erbij hoort (`beeld`). Puur en zonder React: scripts/check-formulebeeld.mjs
 * controleert dat elke formule er een heeft en dat elk plaatje anders is.
 */

// ─── Tekenen ────────────────────────────────────────────────────────

const svg = (...delen: string[]) => `<svg class="fb" viewBox="0 0 160 90" aria-hidden="true">${delen.join("")}</svg>`;

/** Een lijn of vorm; `k` is de stijl: l lijn, d dik, a accent, m maatlijn, s streep-punt. */
const pad = (d: string, k = "l") => `<path class="fb-${k}" d="${d}"/>`;
const lijn = (x1: number, y1: number, x2: number, y2: number, k = "l") => pad(`M${x1} ${y1}L${x2} ${y2}`, k);
/** Een vlak; `k` is de stijl: v materiaal, b accent, h licht. */
const vak = (x: number, y: number, w: number, h: number, k = "v") => `<rect class="fb-${k}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
const vorm = (d: string, k = "v") => `<path class="fb-${k}" d="${d}"/>`;
const rond = (x: number, y: number, r: number, k = "v") => `<circle class="fb-${k}" cx="${x}" cy="${y}" r="${r}"/>`;

/** Een pijl van (x1,y1) naar (x2,y2). */
function pijl(x1: number, y1: number, x2: number, y2: number, k = "a") {
  const hoek = Math.atan2(y2 - y1, x2 - x1);
  const punt = (d: number) => `${(x2 - 5 * Math.cos(hoek + d)).toFixed(1)} ${(y2 - 5 * Math.sin(hoek + d)).toFixed(1)}`;
  return lijn(x1, y1, x2, y2, k) + vorm(`M${x2} ${y2}L${punt(0.45)}L${punt(-0.45)}Z`, k === "a" ? "ak" : "lk");
}

/** Tekst; `index` komt eronder, zoals in `M_Ed`. */
function tekst(x: number, y: number, s: string, index = "", a: "start" | "middle" | "end" = "middle") {
  const sub = index ? `<tspan class="fb-i" dy="2.5">${index}</tspan>` : "";
  return `<text class="fb-t" x="${x}" y="${y}" text-anchor="${a}">${s}${sub}</text>`;
}

/** Een maatlijn met streepjes aan de eind en de maat erbij; liggend staat de maat eronder, of erboven met `boven`. */
function maat(x1: number, y1: number, x2: number, y2: number, s: string, index = "", boven = false) {
  const lig = y1 === y2;
  const st = (x: number, y: number) => (lig ? lijn(x, y - 2.5, x, y + 2.5, "m") : lijn(x - 2.5, y, x + 2.5, y, "m"));
  const label = lig ? tekst((x1 + x2) / 2, boven ? y1 - 4 : y1 + 11, s, index) : tekst(x1 + 5, (y1 + y2) / 2 + 3.5, s, index, "start");
  return lijn(x1, y1, x2, y2, "m") + st(x1, y1) + st(x2, y2) + label;
}

// ─── Liggers ────────────────────────────────────────────────────────

const Y = 44;
const A = 26;
const B = 134;

const scharnier = (x: number) => vorm(`M${x} ${Y + 1}L${x - 5} ${Y + 9}L${x + 5} ${Y + 9}Z`, "n") + lijn(x - 7, Y + 11, x + 7, Y + 11);
const rol = (x: number) => vorm(`M${x} ${Y + 1}L${x - 5} ${Y + 9}L${x + 5} ${Y + 9}Z`, "n") + lijn(x - 7, Y + 12, x + 7, Y + 12);
/** Een inklemming: een muur met arcering, naar links (-1) of rechts (1). */
function klem(x: number, kant: 1 | -1) {
  const naar = x + kant * 5;
  const streep = [Y - 12, Y - 5, Y + 2, Y + 9].map((y) => lijn(x, y, naar, y + 5, "m")).join("");
  return pad(`M${x} ${Y - 14}V${Y + 14}`, "d") + streep;
}
const balk = (x1 = A, x2 = B) => lijn(x1, Y, x2, Y, "d");

function verdeeld(x1 = A, x2 = B, naam = "q") {
  const n = Math.max(2, Math.round((x2 - x1) / 18));
  const pijlen = Array.from({ length: n + 1 }, (_, i) => {
    const x = x1 + ((x2 - x1) * i) / n;
    return pijl(x, Y - 17, x, Y - 2);
  }).join("");
  return lijn(x1, Y - 17, x2, Y - 17, "a") + pijlen + tekst((x1 + x2) / 2, Y - 21, naam);
}

const punt = (x: number, naam = "F") => pijl(x, Y - 24, x, Y - 2) + tekst(x + 7, Y - 18, naam);

/** De trilvorm of doorbuiging als streeplijn. */
const buigvorm = (d: string) => pad(d, "s");

// ─── Liggers met momentenlijn ───────────────────────────────────────

const M_BOVEN = 46;
const M_ONDER = 71;
const rond1 = (n: number) => String(Number(n.toFixed(1)));

/**
 * De momentenlijn als vlak, op de schaal die in de ruimte past. Aan de trekzijde, zoals
 * in de Nederlandse constructiepraktijk: een positief moment staat onder de nullijn.
 */
function momentVlak(punten: [number, number][]) {
  const groot = Math.max(0, ...punten.map((p) => p[1]));
  const klein = Math.max(0, ...punten.map((p) => -p[1]));
  const schaal = (M_ONDER - M_BOVEN) / (groot + klein || 1);
  const nul = Number((M_BOVEN + klein * schaal).toFixed(1));
  const x1 = punten[0][0];
  const x2 = punten[punten.length - 1][0];
  const d = `M${x1} ${nul}${punten.map(([x, m]) => `L${rond1(x)} ${rond1(nul + m * schaal)}`).join("")}L${x2} ${nul}Z`;
  return `<path class="fb-b" data-nul="${nul}" d="${d}"/>` + lijn(x1, nul, x2, nul) + tekst(x2 + 8, nul + 3.5, "M");
}

/** Rechte stukken tussen de knikken: bij puntlasten. Elk punt is [x, M]. */
const knikken = (...punten: [number, number][]) => momentVlak(punten);

/** Een kromme lijn: `m(s)` geeft het moment op s = 0 tot 1 van de hele ligger. */
function kromme(x1: number, x2: number, m: (s: number) => number) {
  const n = 54;
  return momentVlak(Array.from({ length: n + 1 }, (_, i) => [x1 + ((x2 - x1) * i) / n, m(i / n)] as [number, number]));
}

/** De maat onder de momentenlijn. */
const onderM = (x1: number, x2: number, s = "L") => maat(x1, 76, x2, 76, s);

/** De ligger met zijn last schuift omhoog; daaronder de momentenlijn en de maten. */
const ligger = (boven: string[], ...onder: string[]) => svg(`<g transform="translate(0 -14)">${boven.join("")}</g>`, ...onder);

// ─── Doorsneden ─────────────────────────────────────────────────────

function assen(x: number, y: number, rx: number, ry: number) {
  return lijn(x - rx, y, x + rx, y, "s") + lijn(x, y - ry, x, y + ry, "s") + tekst(x + rx + 5, y + 3.5, "y") + tekst(x + 3, y - ry + 7, "z", "", "start");
}

/** Een I-profiel, in het midden op (x, y). */
function iProfiel(x: number, y: number, b: number, h: number, tf: number, tw: number, k = "v") {
  const l = x - b / 2;
  const r = x + b / 2;
  const t = y - h / 2;
  const o = y + h / 2;
  const a = x - tw / 2;
  const c = x + tw / 2;
  return vorm(`M${l} ${t}H${r}V${t + tf}H${c}V${o - tf}H${r}V${o}H${l}V${o - tf}H${a}V${t + tf}H${l}Z`, k);
}

/** Een doorsnede links en de spanningsfiguur rechts, met dezelfde hoogte. */
const SX = 46;
const SY = 45;
const SH = 56;
const rechthoek = (x = SX, y = SY, b = 32, h = SH, k = "v") => vak(x - b / 2, y - h / 2, b, h, k);
const nullijn = (x1: number, x2: number, y = SY) => lijn(x1, y, x2, y, "s");

/** Spanningsfiguur: `boven` en `onder` zijn breedtes, positief naar rechts, om de lijn op x. */
function spanning(x: number, boven: number, beneden: number, y = SY, h = SH, k = "b") {
  const t = y - h / 2;
  const o = y + h / 2;
  if (boven * beneden < 0) {
    const m = t + (h * Math.abs(boven)) / (Math.abs(boven) + Math.abs(beneden));
    return vorm(`M${x} ${t}H${x + boven}L${x} ${m}L${x + beneden} ${o}H${x}Z`, k) + lijn(x, t, x, o);
  }
  return vorm(`M${x} ${t}H${x + boven}L${x + beneden} ${o}H${x}Z`, k) + lijn(x, t, x, o);
}

function parabool(x: number, breed: number, y = SY, h = SH, k = "b") {
  const t = y - h / 2;
  const o = y + h / 2;
  return vorm(`M${x} ${t}Q${x + 2 * breed} ${y} ${x} ${o}Z`, k) + lijn(x, t, x, o);
}

/** Een staaf van links naar rechts. */
const staaf = (x = 40, w = 80, y = 37, h = 16, k = "v") => vak(x, y, w, h, k);

/** Hout: een staaf met draadrichting. */
function hout(x: number, y: number, w: number, h: number, staand = false) {
  const lijnen: string[] = [];
  if (staand) for (let i = 1; i < 4; i++) lijnen.push(lijn(x + (w * i) / 4, y + 3, x + (w * i) / 4, y + h - 3, "m"));
  else for (let i = 1; i < 4; i++) lijnen.push(lijn(x + 3, y + (h * i) / 4, x + w - 3, y + (h * i) / 4, "m"));
  return vak(x, y, w, h, "h") + lijnen.join("");
}

// ─── Grafieken ──────────────────────────────────────────────────────

const OX = 30;
const OY = 72;
const asjes = (x: string, y: string, ix = "", iy = "") =>
  pijl(OX, OY, 142, OY, "l") + pijl(OX, OY, OX, 10, "l") + tekst(146, OY + 11, x, ix, "end") + tekst(OX + 5, 15, y, iy, "start");

// ─── Sommen en verhoudingen ─────────────────────────────────────────

interface Blok { s: string; i?: string; f?: string; fi?: string; h: number; k?: string }

/** Blokken naast elkaar met een plus ertussen: een belastingcombinatie. */
function som(...blokken: Blok[]) {
  const w = 30;
  const tussen = 12;
  const totaal = blokken.length * w + (blokken.length - 1) * tussen;
  let x = (160 - totaal) / 2;
  const uit: string[] = [];
  blokken.forEach((b, n) => {
    uit.push(vak(x, 76 - b.h, w, b.h, b.k ?? "b"));
    uit.push(tekst(x + w / 2, 76 - b.h / 2 + 4, b.s, b.i ?? ""));
    if (b.f) uit.push(tekst(x + w / 2, 76 - b.h - 5, b.f, b.fi ?? ""));
    if (n < blokken.length - 1) uit.push(tekst(x + w + tussen / 2, 60, "+"));
    x += w + tussen;
  });
  return uit.join("") + lijn(10, 76, 150, 76);
}

/** Twee staven: van de karakteristieke naar de rekenwaarde. */
function vanNaar(van: string, vi: string, naar: string, ni: string, hoog: number, laag: number, factor: string, fi = "", onderPijl = "") {
  return (
    vak(40, 76 - hoog, 24, hoog, "h") + tekst(52, 76 - hoog - 5, van, vi) +
    vak(96, 76 - laag, 24, laag, "b") + tekst(108, 76 - laag - 5, naar, ni) +
    pijl(68, 56, 92, 56, "l") + tekst(80, 50, factor, fi) + (onderPijl ? tekst(80, 69, "/γ", onderPijl) : "") + lijn(26, 76, 134, 76)
  );
}

// ─── Stukjes die vaker terugkomen ───────────────────────────────────

const gebouw = (x = 86, b = 40, h = 50) => vak(x, 72 - h, b, h, "h") + lijn(16, 72, 146, 72);

/** Het windprofiel: een kromme die met de hoogte toeneemt. */
const windkromme = (x0 = 28, breed = 44, k = "a") => pad(`M${x0 + 6} 72C${x0 + 12} 50 ${x0 + breed - 8} 34 ${x0 + breed} 14`, k);

const betonbalk = (x = 20, w = 120, y = 28, h = 30) => vak(x, y, w, h, "h");

/** Een rechthoekige betondoorsnede met wapening onder. */
function betonDoorsnede(x: number, y: number, b: number, h: number, staven = 3, marge = 7) {
  const o = y + h / 2 - marge;
  const uit = [vak(x - b / 2, y - h / 2, b, h, "h")];
  for (let i = 0; i < staven; i++) uit.push(rond(x - b / 2 + marge + (i * (b - 2 * marge)) / Math.max(1, staven - 1), o, 2.4, "z"));
  return uit.join("");
}

const plaat = (x: number, y: number, w: number, h: number) => vak(x, y, w, h, "h");
const bout = (x: number, y: number, h: number) => vak(x - 3, y, 6, h, "z") + vak(x - 6, y - 4, 12, 4, "z") + vak(x - 6, y + h, 12, 4, "z");

/** Een lasnaad tussen twee platen, met de keelmaat. */
const las = () => plaat(30, 56, 100, 12) + plaat(74, 18, 12, 38) + vorm("M86 56V40L102 56Z", "b") + lijn(86, 56, 94, 48, "l");

// ─── De plaatjes ────────────────────────────────────────────────────

const BEELDEN: Record<string, () => string> = {
  // Mechanica: liggers
  "ligger-twee-steunpunten-q": () => ligger([balk(), scharnier(A), rol(B), verdeeld()], kromme(A, B, (s) => s * (1 - s)), onderM(A, B)),
  "ligger-twee-steunpunten-f-midden": () => ligger([balk(), scharnier(A), rol(B), punt(80)], knikken([A, 0], [80, 1], [B, 0]), onderM(A, B)),
  "ligger-twee-steunpunten-f-willekeurig": () => ligger([balk(), scharnier(A), rol(B), punt(64)], knikken([A, 0], [64, 1], [B, 0]), onderM(A, 64, "a"), onderM(64, B, "b")),
  "ligger-twee-steunpunten-twee-f": () => ligger([balk(), scharnier(A), rol(B), punt(58), punt(102)], knikken([A, 0], [58, 1], [102, 1], [B, 0]), onderM(A, 58, "a"), onderM(102, B, "a")),
  "ligger-twee-steunpunten-driehoekslast": () => ligger([balk(), scharnier(A), rol(B), lijn(A, Y - 2, B, Y - 22, "a"), pijl(53, Y - 7, 53, Y - 2), pijl(80, Y - 12, 80, Y - 2), pijl(107, Y - 17, 107, Y - 2), pijl(B, Y - 22, B, Y - 2), tekst(B - 8, Y - 25, "q")], kromme(A, B, (s) => s - s ** 3), onderM(A, B)),
  "ligger-ingeklemd-q": () => ligger([balk(), klem(A, -1), klem(B, 1), verdeeld()], kromme(A, B, (s) => -1 / 12 + (s * (1 - s)) / 2), onderM(A, B)),
  "ligger-ingeklemd-f-midden": () => ligger([balk(), klem(A, -1), klem(B, 1), punt(80)], knikken([A, -1], [80, 1], [B, -1]), onderM(A, B)),
  "ligger-eenzijdig-ingeklemd-q": () => ligger([balk(), klem(A, -1), rol(B), verdeeld()], kromme(A, B, (s) => -1 / 8 + (5 * s) / 8 - (s * s) / 2), onderM(A, B)),
  "ligger-eenzijdig-ingeklemd-f-midden": () => ligger([balk(), klem(A, -1), rol(B), punt(80)], knikken([A, -3 / 16], [80, 5 / 32], [B, 0]), onderM(A, 80, "L/2"), onderM(80, B, "L/2")),
  "uitkraging-q": () => ligger([balk(), klem(A, -1), verdeeld()], kromme(A, B, (s) => -((1 - s) ** 2)), onderM(A, B)),
  "uitkraging-f": () => ligger([balk(), klem(A, -1), punt(B)], knikken([A, -1], [B, 0]), onderM(A, B)),
  "ligger-overstek-q": () => {
    // Veld 76, overstek 32: M = R_A·x − q·x²/2 tot B, daarna het moment van de overstek alleen.
    const a = 32 / 76;
    const m = (s: number) => {
      const x = (s * (B - A)) / 76;
      return x <= 1 ? ((1 - a * a) * x) / 2 - (x * x) / 2 : -((1 + a - x) ** 2) / 2;
    };
    return ligger([balk(), scharnier(A), rol(102), verdeeld()], kromme(A, B, m), onderM(A, 102), onderM(102, B, "a"));
  },
  "ligger-twee-velden-q": () => {
    const m = (s: number) => {
      const u = Math.min(2 * s, 2 - 2 * s);
      return (3 * u) / 8 - (u * u) / 2;
    };
    return ligger([balk(), scharnier(A), rol(80), rol(B), verdeeld()], kromme(A, B, m), onderM(A, 80), onderM(80, B));
  },
  "ligger-twee-velden-f-midden": () => ligger([balk(), scharnier(A), rol(80), rol(B), punt(53), punt(107)], knikken([A, 0], [53, 5 / 32], [80, -3 / 16], [107, 5 / 32], [B, 0]), onderM(A, 80), onderM(80, B)),
  "ligger-drie-velden-q": () => {
    const m = (s: number) => {
      const x = Math.min(3 * s, 3 - 3 * s);
      return x <= 1 ? 0.4 * x - (x * x) / 2 : -0.1 + 0.5 * (x - 1) * (2 - x);
    };
    return ligger([balk(), scharnier(A), rol(62), rol(98), rol(B), verdeeld()], kromme(A, B, m), onderM(A, 62), onderM(62, 98), onderM(98, B));
  },
  "ligger-twee-steunpunten-q-op-x": () => ligger([balk(), scharnier(A), rol(B), verdeeld(), lijn(70, Y - 8, 70, Y + 8, "s")], kromme(A, B, (s) => s * (1 - s)), lijn(70, 38, 70, 70, "s"), tekst(86, 42, "M, V"), onderM(A, 70, "x")),

  // Mechanica: doorsnedegrootheden
  "doorsnede-rechthoek": () => svg(rechthoek(70, 38, 36, 52), assen(70, 38, 26, 32), maat(52, 71, 88, 71, "b"), maat(100, 12, 100, 64, "h")),
  "doorsnede-cirkel": () => svg(rond(70, 38, 28), assen(70, 38, 34, 33), maat(42, 71, 98, 71, "d")),
  "doorsnede-buis": () => svg(rond(70, 38, 28), rond(70, 38, 21, "w"), assen(70, 38, 34, 33), maat(42, 71, 98, 71, "D"), tekst(100, 18, "t", "", "start")),
  "doorsnede-koker": () => svg(vak(50, 12, 40, 52), vak(56, 18, 28, 40, "w"), assen(70, 38, 26, 32), maat(50, 71, 90, 71, "b"), maat(102, 12, 102, 64, "h"), tekst(46, 22, "t", "", "end")),
  "doorsnede-i-profiel": () => svg(iProfiel(70, 38, 44, 52, 8, 6), assen(70, 38, 28, 32), maat(48, 71, 92, 71, "b"), maat(106, 12, 106, 64, "h"), tekst(95, 22, "t", "f", "start"), tekst(62, 30, "t", "w", "end")),
  "doorsnede-driehoek": () => svg(vorm("M70 12L44 64H96Z"), lijn(36, 47, 104, 47, "s"), tekst(110, 51, "y"), maat(44, 71, 96, 71, "b"), maat(118, 12, 118, 64, "h")),
  "doorsnede-steiner": () => svg(rechthoek(70, 28, 48, 18), lijn(36, 28, 108, 28, "s"), tekst(116, 32, "y", "0"), lijn(36, 68, 108, 68, "s"), tekst(116, 72, "y"), maat(100, 28, 100, 68, "a"), tekst(70, 14, "A")),
  "doorsnede-samengesteld": () => svg(vak(42, 14, 56, 12), vak(64, 26, 12, 46), rond(70, 20, 2, "z"), rond(70, 49, 2, "z"), lijn(32, 34, 108, 34, "s"), tekst(116, 38, "y"), maat(118, 20, 118, 34, "a", "1"), maat(124, 34, 124, 49, "a", "2")),
  "doorsnede-traagheidsstraal": () => svg(rechthoek(58, 44, 36, 58), lijn(30, 44, 86, 44, "s"), pijl(58, 44, 58, 24), tekst(64, 34, "i", "", "start"), tekst(122, 42, "i ="), tekst(122, 58, "√(I/A)")),

  // Mechanica: spanning en vervorming
  "spanning-normaalkracht": () => svg(staaf(), pijl(40, 45, 18, 45), pijl(120, 45, 142, 45), tekst(24, 38, "N"), tekst(136, 38, "N"), tekst(80, 49, "A"), tekst(80, 74, "σ = N/A")),
  "spanning-buiging": () => svg(rechthoek(), nullijn(24, 120), spanning(96, 24, -24), tekst(46, 13, "M"), tekst(126, 21, "σ", "", "start")),
  "spanning-normaalkracht-en-buiging": () => svg(rechthoek(), nullijn(24, 120), spanning(96, 34, -12), tekst(46, 13, "N, M"), tekst(134, 21, "σ", "max", "start")),
  "schuifspanning-rechthoek": () => svg(rechthoek(), nullijn(24, 116), parabool(96, 16), pijl(46, 28, 46, 62), tekst(58, 40, "V"), tekst(120, 49, "τ", "max", "start")),
  "schuifspanning-cirkel": () => svg(rond(46, 45, 28), nullijn(10, 116), parabool(96, 16), pijl(46, 28, 46, 62), tekst(58, 40, "V"), tekst(120, 49, "τ", "max", "start")),
  "schuifspanning-algemeen": () => svg(iProfiel(46, 45, 40, 56, 7, 6), vak(26, 17, 40, 7, "b"), vak(43, 24, 6, 13, "b"), lijn(20, 37, 72, 37, "s"), tekst(18, 41, "b", "", "end"), tekst(74, 24, "S", "", "start"), parabool(100, 14), tekst(120, 49, "τ", "", "start")),
  "hooke-lengteverandering": () => svg(staaf(24, 90), pad("M24 30H128V58H24", "s"), pijl(128, 44, 148, 44), tekst(142, 37, "F"), maat(24, 70, 114, 70, "L"), maat(114, 16, 128, 16, "ΔL")),
  "thermische-uitzetting": () => svg(staaf(30, 90), pad("M30 30H134V58H30", "s"), pijl(120, 44, 133, 44, "l"), tekst(75, 49, "ΔT"), maat(30, 70, 120, 70, "L"), maat(120, 16, 134, 16, "ΔL")),
  "torsie-cirkel": () => svg(vak(32, 28, 96, 32), pad("M32 28C24 28 24 60 32 60"), pad("M128 28C136 28 136 60 128 60"), pad("M116 16C136 16 144 34 138 52", "a"), vorm("M138 52L133 46L141 44Z", "ak"), tekst(146, 22, "T", "", "end"), lijn(32, 44, 128, 44, "s"), tekst(80, 78, "τ, d")),
  "torsie-dunwandig-gesloten": () => svg(vak(40, 16, 72, 54), vak(46, 22, 60, 42, "w"), pijl(56, 19, 96, 19), pijl(109, 26, 109, 60), pijl(96, 67, 56, 67), pijl(43, 60, 43, 26), tekst(76, 48, "A", "m"), tekst(120, 24, "t", "", "start")),
  "vergelijkingsspanning-von-mises": () => svg(vak(58, 23, 44, 44), pijl(102, 45, 126, 45), pijl(58, 45, 34, 45), tekst(134, 42, "σ"), pijl(62, 18, 98, 18), pijl(98, 72, 62, 72), tekst(80, 13, "τ"), tekst(80, 49, "σ", "v")),
  "hoofdspanningen": () => svg(vorm("M80 18L108 40L86 68L58 46Z"), pijl(94, 29, 110, 9), pijl(72, 57, 56, 77), tekst(120, 15, "σ", "1"), pijl(97, 54, 118, 70), pijl(69, 32, 48, 16), tekst(128, 72, "σ", "2"), lijn(40, 45, 62, 45, "s"), tekst(32, 40, "θ")),

  // Mechanica: knik, kip en trilling
  "euler-knikkracht": () => svg(lijn(60, 16, 60, 74, "d"), buigvorm("M60 16Q84 45 60 74"), pijl(60, 0, 60, 14), tekst(68, 10, "F", "", "start"), vorm("M60 75L55 83H65Z", "n"), maat(100, 16, 100, 74, "L", "cr")),
  "slankheid-euler-spanning": () => svg(asjes("λ", "σ", "", "cr"), pad("M62 18C70 40 92 60 136 66", "a"), lijn(OX, 18, 62, 18, "s"), tekst(OX - 3, 24, "f", "y", "end"), lijn(62, 18, 62, OY, "m"), tekst(62, 84, "λ", "1")),
  "kritiek-kipmoment": () => svg(lijn(24, 45, 136, 45, "d"), buigvorm("M24 45Q80 8 136 45"), lijn(24, 36, 24, 54), lijn(136, 36, 136, 54), maat(24, 64, 136, 64, "L"), tekst(80, 22, "M", "cr")),
  "eigenfrequentie-ligger-twee-steunpunten": () => svg(balk(), scharnier(A), rol(B), buigvorm(`M${A} ${Y}Q80 ${Y + 28} ${B} ${Y}`), tekst(80, 24, "f", "1"), tekst(80, 83, "m, EI")),
  "eigenfrequentie-uitkraging": () => svg(balk(), klem(A, -1), buigvorm(`M${A} ${Y}Q90 ${Y} ${B} ${Y + 24}`), tekst(80, 24, "f", "1"), tekst(80, 83, "m, EI")),
  "eigenfrequentie-ligger-ingeklemd": () => svg(balk(), klem(A, -1), klem(B, 1), buigvorm(`M${A} ${Y}C55 ${Y} 60 ${Y + 18} 80 ${Y + 18}S105 ${Y} ${B} ${Y}`), tekst(80, 24, "f", "1"), tekst(80, 83, "m, EI")),

  // EN 1990
  "en1990-combinatie-6-10": () => svg(som({ s: "G", i: "k", f: "γ", fi: "G", h: 34, k: "h" }, { s: "Q", i: "k,1", f: "γ", fi: "Q", h: 26 }, { s: "Q", i: "k,2", f: "γ·ψ", fi: "0", h: 18 })),
  "en1990-combinatie-6-10a-nb": () => svg(som({ s: "G", i: "k", f: "γ", fi: "G", h: 44, k: "h" }, { s: "Q", i: "k,1", f: "γ·ψ", fi: "0,1", h: 18 }, { s: "Q", i: "k,2", f: "γ·ψ", fi: "0,2", h: 18 })),
  "en1990-combinatie-6-10b-nb": () => svg(som({ s: "G", i: "k", f: "ξ·γ", fi: "G", h: 34, k: "h" }, { s: "Q", i: "k,1", f: "γ", fi: "Q", h: 30 }, { s: "Q", i: "k,2", f: "γ·ψ", fi: "0,2", h: 18 })),
  "en1990-kfi": () => svg(vak(32, 46, 24, 30, "h"), tekst(44, 41, "0,9"), tekst(44, 86, "RC1"), vak(68, 40, 24, 36, "h"), tekst(80, 35, "1,0"), tekst(80, 86, "RC2"), vak(104, 32, 24, 44, "b"), tekst(116, 27, "1,1"), tekst(116, 86, "RC3"), tekst(80, 14, "K", "FI"), lijn(20, 76, 140, 76)),
  "en1990-karakteristieke-combinatie": () => svg(som({ s: "G", i: "k", h: 30, k: "h" }, { s: "Q", i: "k,1", h: 28 }, { s: "Q", i: "k,i", f: "ψ", fi: "0", h: 18 })),
  "en1990-frequente-combinatie": () => svg(som({ s: "G", i: "k", h: 30, k: "h" }, { s: "Q", i: "k,1", f: "ψ", fi: "1", h: 22 }, { s: "Q", i: "k,i", f: "ψ", fi: "2", h: 18 })),
  "en1990-quasi-blijvende-combinatie": () => svg(som({ s: "G", i: "k", h: 30, k: "h" }, { s: "Q", i: "k", f: "ψ", fi: "2", h: 18 })),
  "en1990-buitengewone-combinatie": () => svg(som({ s: "G", i: "k", h: 26, k: "h" }, { s: "A", i: "d", h: 44, k: "n" }, { s: "Q", i: "k", f: "ψ", fi: "1", h: 18 })),
  "en1990-seismische-combinatie": () => svg(som({ s: "G", i: "k", h: 26, k: "h" }, { s: "A", i: "Ed", h: 40, k: "n" }, { s: "Q", i: "k", f: "ψ", fi: "2", h: 18 })),
  "en1990-evenwicht-equ": () => svg(vak(52, 28, 56, 44, "h"), lijn(24, 72, 136, 72), pijl(28, 42, 52, 42), tekst(32, 35, "E", "dst"), pijl(80, 8, 80, 44), tekst(88, 18, "E", "stb", "start"), rond(108, 72, 2.5, "z")),
  "en1990-rekenwaarde-belasting": () => svg(vanNaar("F", "k", "F", "d", 30, 46, "γ", "f")),
  "en1990-rekenwaarde-materiaal": () => svg(vanNaar("X", "k", "X", "d", 46, 30, "1/γ", "M")),
  "en1990-toets-ed-rd": () => svg(vak(44, 44, 26, 32, "b"), tekst(57, 38, "E", "d"), vak(90, 28, 26, 48, "h"), tekst(103, 22, "R", "d"), tekst(80, 62, "≤"), lijn(30, 76, 130, 76)),

  // EN 1991
  "en1991-basiswindsnelheid": () => svg(gebouw(70, 40, 50), pijl(18, 50, 66, 50), tekst(42, 44, "v", "b"), maat(118, 22, 118, 72, "10 m")),
  "en1991-ruwheidsfactor": () => svg(asjes("c", "z", "r"), pad("M38 72C46 50 78 30 120 14", "a"), pad("M62 72C70 56 86 34 104 14", "s"), tekst(126, 24, "z", "0", "start")),
  "en1991-gemiddelde-windsnelheid": () => svg(gebouw(), windkromme(), pijl(28, 60, 42, 60), pijl(28, 42, 56, 42), pijl(28, 24, 68, 24), tekst(50, 12, "v", "m", "start")),
  "en1991-turbulentie-intensiteit": () => svg(asjes("t", "v"), lijn(OX, 38, 136, 38, "s"), pad("M34 38L42 30L50 44L58 28L66 46L74 32L82 42L90 26L98 48L106 34L114 42L122 30L130 40", "a"), tekst(142, 30, "v", "m", "end"), tekst(84, 62, "I", "v")),
  "en1991-piekstuwdruk": () => svg(gebouw(), windkromme(26, 46), pijl(26, 30, 66, 30), tekst(50, 22, "q", "p", "start")),
  "en1991-basisstuwdruk": () => svg(vanNaar("q", "b", "q", "p", 22, 48, "c", "e")),
  "en1991-winddruk-op-vlakken": () => svg(gebouw(58, 44, 46), pijl(30, 40, 56, 40), pijl(30, 58, 56, 58), tekst(38, 32, "c", "pe"), pijl(104, 40, 128, 40), pijl(104, 58, 128, 58), tekst(120, 32, "c", "pe"), pijl(70, 50, 62, 50, "l"), pijl(90, 50, 98, 50, "l"), tekst(80, 40, "c", "pi")),
  "en1991-windkracht": () => svg(gebouw(70, 44, 54), pijl(24, 42, 68, 42), tekst(44, 34, "F", "w"), maat(124, 42, 124, 72, "z", "e")),
  "en1991-wrijvingskracht": () => svg(vorm("M24 72V34H136V72", "h"), pijl(36, 28, 62, 28), pijl(70, 28, 96, 28), pijl(104, 28, 130, 28), tekst(82, 18, "F", "fr"), lijn(14, 72, 146, 72)),
  "en1991-cpe-belast-oppervlak": () => svg(asjes("A", "c", "", "pe"), pad("M48 30L118 56", "a"), lijn(48, 30, 48, OY, "m"), lijn(118, 56, 118, OY, "m"), tekst(48, 84, "1"), tekst(118, 84, "10"), tekst(54, 28, "c", "pe,1", "start"), tekst(112, 46, "c", "pe,10", "start")),
  "en1991-sneeuwbelasting-dak": () => svg(pad("M28 72V46L80 24L132 46V72"), lijn(16, 72, 144, 72), ...[46, 66, 94, 114].map((x) => pijl(x, 6, x, x < 80 ? 44 - (x - 28) * 0.42 - 2 : 44 - (132 - x) * 0.42 - 2)), tekst(80, 12, "s")),
  "en1991-sneeuw-buitengewoon": () => svg(vorm("M24 44H136V72H24Z", "h"), vorm("M104 44Q126 42 136 22V44Z", "b"), lijn(136, 16, 136, 72), lijn(14, 72, 146, 72), tekst(112, 28, "s", "Ad", "end"), lijn(24, 44, 104, 44, "a")),
  "en1991-reductie-oppervlak": () => svg(vak(34, 16, 92, 56, "h"), vak(52, 16, 56, 38, "b"), lijn(70, 16, 70, 54, "m"), lijn(90, 16, 90, 54, "m"), lijn(52, 36, 108, 36, "m"), tekst(80, 31, "A"), tekst(80, 66, "α", "A")),
  "en1991-reductie-verdiepingen": () => svg(...[20, 34, 48, 62].map((y) => vak(40, y, 56, 14, "h")), lijn(68, 8, 68, 76, "d"), lijn(24, 76, 112, 76), pijl(68, 2, 68, 18), tekst(112, 34, "n", "", "start"), tekst(112, 54, "α", "n", "start")),

  // EN 1992
  "en1992-fcd": () => svg(asjes("ε", "σ", "c", "c"), pad(`M${OX} ${OY}Q62 26 78 26H122`, "a"), lijn(OX, 26, 78, 26, "s"), tekst(OX - 3, 30, "f", "cd", "end"), lijn(78, 26, 78, OY, "m"), tekst(78, 84, "ε", "c2"), tekst(118, 84, "ε", "cu2")),
  "en1992-fctd": () => svg(vorm("M36 26H60L68 36H92L100 26H124V64H100L92 54H68L60 64H36Z", "h"), pijl(36, 45, 14, 45), pijl(124, 45, 146, 45), tekst(80, 49, "f", "ctd")),
  "en1992-fyd": () => svg(asjes("ε", "σ", "s", "s"), pad(`M${OX} ${OY}L64 28H128`, "a"), lijn(OX, 28, 64, 28, "s"), tekst(OX - 3, 32, "f", "yd", "end"), pad(`M${OX} ${OY}L60 18H128`, "m"), tekst(OX + 40, 14, "f", "yk", "start")),
  "en1992-betoneigenschappen": () => svg(asjes("ε", "σ"), pad(`M${OX} ${OY}Q70 16 118 24`, "a"), lijn(OX, OY, 66, 16, "s"), tekst(46, 30, "E", "cm", "end"), tekst(120, 18, "f", "cm", "end")),
  "en1992-buigwapening-rechthoek": () => svg(betonDoorsnede(40, 45, 34, 56), maat(68, 17, 68, 66, "d"), vak(96, 17, 16, 18, "b"), tekst(122, 30, "N", "c", "start"), pijl(96, 66, 118, 66), tekst(122, 70, "N", "s", "start"), lijn(92, 17, 92, 73), tekst(40, 13, "M", "Ed")),
  "en1992-momentcapaciteit-rechthoek": () => svg(betonDoorsnede(40, 45, 34, 56), vak(96, 17, 16, 18, "b"), pijl(96, 66, 118, 66), lijn(92, 17, 92, 73), maat(126, 26, 126, 66, "z"), tekst(40, 13, "M", "Rd"), tekst(88, 30, "x", "", "end")),
  "en1992-minimale-langswapening": () => svg(betonDoorsnede(56, 36, 56, 46, 2), maat(28, 68, 84, 68, "b", "t"), maat(96, 13, 96, 52, "d"), tekst(56, 44, "A", "s,min")),
  "en1992-dwarskracht-zonder-wapening": () => svg(betonbalk(), lijn(26, 53, 134, 53), pad("M52 58C60 50 70 38 88 30", "a"), pijl(38, 68, 38, 58), tekst(28, 78, "V", "Ed"), tekst(104, 74, "V", "Rd,c")),
  "en1992-dwarskrachtwapening": () => svg(betonbalk(), lijn(26, 53, 134, 53), lijn(26, 33, 134, 33), ...[46, 66, 86, 106].map((x) => lijn(x, 33, x, 53, "a")), pad("M46 53L66 33M66 53L86 33M86 53L106 33", "s"), tekst(76, 22, "θ"), tekst(58, 74, "V", "Rd,s"), tekst(112, 74, "V", "Rd,max")),
  "en1992-minimale-dwarskrachtwapening": () => svg(betonbalk(), lijn(26, 53, 134, 53), lijn(26, 33, 134, 33), ...[46, 80, 114].map((x) => lijn(x, 33, x, 53, "a")), maat(46, 64, 80, 64, "s", "l,max"), tekst(116, 74, "ρ", "w,min")),
  "en1992-verankeringslengte": () => svg(vak(62, 18, 80, 40, "h"), lijn(14, 38, 130, 38, "d"), pijl(40, 31, 16, 31), tekst(30, 24, "F", "s"), maat(62, 66, 130, 66, "l", "bd")),
  "en1992-overlappingslengte": () => svg(vak(14, 18, 132, 40, "h"), lijn(14, 34, 102, 34, "d"), lijn(58, 42, 146, 42, "d"), maat(58, 66, 102, 66, "l", "0")),
  "en1992-effectieve-overspanning": () => svg(vak(14, 24, 132, 16, "h"), vak(22, 40, 18, 32, "n"), vak(120, 40, 18, 32, "n"), maat(40, 60, 120, 60, "l", "n"), lijn(31, 16, 129, 16, "a"), tekst(80, 12, "l", "eff")),
  "en1992-meewerkende-flensbreedte": () => svg(vak(20, 22, 106, 12, "h"), vak(59, 34, 28, 34, "h"), maat(20, 15, 126, 15, "b", "eff", true), maat(59, 73, 87, 73, "b", "w"), tekst(130, 32, "h", "f", "start")),
  "en1992-slankheid-kolom": () => svg(vak(52, 16, 16, 58, "h"), buigvorm("M60 16Q80 45 60 74"), pijl(60, 0, 60, 14), tekst(68, 10, "N", "Ed", "start"), lijn(40, 74, 80, 74), maat(100, 16, 100, 74, "l", "0"), tekst(128, 50, "λ")),
  "en1992-betondekking": () => svg(vak(30, 16, 100, 60, "h"), rond(100, 46, 8, "z"), maat(108, 26, 130, 26, "c", "nom"), lijn(100, 54, 100, 76, "m"), tekst(92, 68, "c", "", "end")),
  "en1992-scheurwijdte": () => svg(vak(26, 30, 108, 28, "h"), lijn(14, 44, 146, 44, "d"), lijn(58, 30, 58, 58, "a"), lijn(102, 30, 102, 58, "a"), pijl(26, 44, 10, 44, "l"), pijl(134, 44, 150, 44, "l"), maat(58, 68, 102, 68, "s", "r,max"), tekst(102, 24, "w", "k")),
  "en1992-minimale-scheurwapening": () => svg(vak(44, 14, 36, 62, "h"), vak(44, 45, 36, 31, "b"), lijn(36, 45, 92, 45, "s"), rond(52, 68, 2.4, "z"), rond(62, 68, 2.4, "z"), rond(72, 68, 2.4, "z"), tekst(62, 60, "A", "ct"), tekst(100, 72, "A", "s,min", "start")),
  "en1992-pons": () => svg(vak(66, 31, 28, 28, "n"), pad("M58 11H102C114 11 122 19 122 31V59C122 71 114 79 102 79H58C46 79 38 71 38 59V31C38 19 46 11 58 11Z", "s"), maat(94, 45, 122, 45, "2d"), tekst(140, 20, "u", "1")),
  "en1992-geconcentreerde-last": () => svg(vak(26, 30, 108, 44, "h"), vak(66, 30, 28, 6, "b"), pad("M66 36L44 74M94 36L116 74", "s"), pijl(80, 4, 80, 28), tekst(90, 14, "F", "Rdu", "start"), tekst(60, 26, "A", "c0", "end"), tekst(80, 68, "A", "c1")),
  "en1992-slankheid-doorbuiging": () => svg(vak(26, 24, 108, 20, "h"), scharnier(26), rol(134), buigvorm(`M26 ${Y}Q80 ${Y + 16} 134 ${Y}`), maat(26, 68, 134, 68, "l"), maat(142, 24, 142, 40, "d")),
  "en1992-kolomwapening": () => svg(vak(46, 16, 48, 58, "h"), ...[[54, 24], [86, 24], [54, 45], [86, 45], [54, 66], [86, 66]].map(([x, y]) => rond(x, y, 2.8, "z")), tekst(70, 49, "A", "c"), tekst(100, 40, "A", "s,min", "start")),

  // EN 1993
  "en1993-doorsnedeklasse": () => svg(iProfiel(60, 45, 56, 66, 9, 7), vak(32, 12, 24, 9, "b"), vak(56.5, 21, 7, 48, "b"), tekst(44, 8, "c/t"), tekst(66, 49, "c/t", "", "start"), tekst(110, 50, "ε", "", "start")),
  "en1993-trek": () => svg(staaf(36, 88, 26, 36), rond(62, 36, 3.5, "w"), rond(62, 52, 3.5, "w"), rond(98, 36, 3.5, "w"), rond(98, 52, 3.5, "w"), pijl(36, 44, 12, 44), pijl(124, 44, 148, 44), tekst(18, 36, "N"), tekst(142, 36, "N"), maat(36, 72, 124, 72, "A", "net")),
  "en1993-druk": () => svg(iProfiel(60, 48, 44, 40, 7, 6), pijl(60, 4, 60, 26), tekst(70, 16, "N", "c,Rd", "start"), tekst(112, 52, "A", "", "start")),
  "en1993-buiging": () => svg(iProfiel(44, 45, 40, 56, 7, 6), nullijn(18, 124), vorm("M96 17H116V45H96Z", "b"), vorm("M96 45H76V73H96Z", "b"), lijn(96, 17, 96, 73), tekst(44, 9, "M", "c,Rd"), tekst(120, 32, "f", "y", "start")),
  "en1993-dwarskracht": () => svg(iProfiel(56, 45, 44, 62, 8, 6), vak(53, 22, 6, 46, "b"), pijl(94, 22, 94, 66), tekst(104, 48, "V", "pl,Rd", "start"), tekst(46, 49, "A", "v", "end")),
  "en1993-buiging-en-dwarskracht": () => svg(iProfiel(44, 45, 40, 56, 7, 6), vak(41, 24, 6, 42, "b"), vorm("M96 17H116V24H104V45H96Z", "b"), vorm("M96 45H88V66H76V73H96Z", "b"), lijn(96, 17, 96, 73), tekst(44, 9, "M, V"), tekst(116, 44, "1−ρ", "", "start")),
  "en1993-afschuifplooi": () => svg(vak(24, 18, 112, 50, "h"), lijn(24, 18, 136, 18, "d"), lijn(24, 68, 136, 68, "d"), pad("M44 64L66 22M72 64L94 22M100 64L122 22", "a"), maat(144, 18, 144, 68, "h", "w"), tekst(80, 82, "t", "w")),
  "en1993-buiging-en-normaalkracht": () => svg(iProfiel(44, 45, 40, 56, 7, 6), lijn(18, 52, 124, 52, "s"), vorm("M96 17H116V52H96Z", "b"), vorm("M96 52H76V73H96Z", "b"), lijn(96, 17, 96, 73), tekst(44, 9, "N, M"), tekst(120, 32, "f", "y", "start")),
  "en1993-lineaire-interactie": () => svg(vak(16, 30, 30, 28, "b"), tekst(31, 48, "N"), tekst(52, 48, "+"), vak(58, 30, 30, 28, "b"), tekst(73, 48, "M", "y"), tekst(94, 48, "+"), vak(100, 30, 30, 28, "b"), tekst(115, 48, "M", "z"), tekst(142, 48, "≤ 1")),
  "en1993-biaxiale-buiging": () => svg(asjes("M", "M", "y", "z"), pad(`M${OX} 20C86 20 118 44 118 ${OY}`, "a"), tekst(OX + 6, 34, "M", "N,z", "start"), tekst(118, 84, "M", "N,y"), tekst(90, 26, "α, β", "", "start")),
  "en1993-knik": () => svg(iProfiel(38, 45, 30, 36, 6, 5), pijl(70, 4, 70, 18), lijn(70, 18, 70, 76, "d"), buigvorm("M70 18Q88 47 70 76"), tekst(80, 12, "N", "b,Rd", "start"), maat(100, 18, 100, 76, "L", "cr"), tekst(126, 50, "χ", "", "start")),
  "en1993-relatieve-slankheid-ncr": () => svg(asjes("λ̄", "χ"), pad(`M${OX} 22H50C72 28 96 56 136 66`, "a"), lijn(84, 46, 84, OY, "m"), lijn(OX, 46, 84, 46, "m"), tekst(84, 84, "λ̄"), tekst(OX - 3, 50, "χ", "", "end")),
  "en1993-kip-algemeen": () => svg(iProfiel(30, 45, 26, 42, 5, 4), lijn(58, 45, 140, 45, "d"), buigvorm("M58 45Q99 12 140 45"), lijn(58, 36, 58, 54), lijn(140, 36, 140, 54), tekst(99, 22, "χ", "LT"), maat(58, 64, 140, 64, "L")),
  "en1993-kip-gewalst": () => svg(asjes("λ̄", "χ", "LT", "LT"), pad(`M${OX} 22H58C78 30 100 54 136 62`, "a"), pad(`M${OX} 22H44C66 34 96 60 136 67`, "s"), iProfiel(116, 28, 22, 26, 4, 3)),
  "en1993-bout-afschuiving": () => svg(plaat(26, 34, 60, 10), plaat(74, 44, 60, 10), bout(80, 26, 36), lijn(62, 44, 98, 44, "s"), pijl(26, 39, 8, 39), pijl(134, 49, 152, 49), tekst(14, 32, "F", "v"), tekst(146, 42, "F", "v")),
  "en1993-bout-trek": () => svg(plaat(30, 34, 100, 10), plaat(30, 46, 100, 10), bout(80, 28, 34), pijl(80, 20, 80, 2), pijl(80, 70, 80, 88), tekst(92, 12, "F", "t", "start"), tekst(92, 84, "F", "t", "start")),
  "en1993-bout-afschuiving-en-trek": () => svg(plaat(26, 34, 60, 10), plaat(74, 44, 60, 10), bout(80, 26, 36), pijl(80, 18, 80, 2), pijl(134, 49, 152, 49), tekst(92, 12, "F", "t", "start"), tekst(146, 42, "F", "v")),
  "en1993-bout-stuik": () => svg(plaat(34, 22, 112, 46), rond(64, 45, 8, "w"), rond(64, 45, 5.5, "z"), pijl(100, 45, 72, 45), tekst(90, 38, "F", "b"), maat(34, 76, 64, 76, "e", "1"), tekst(64, 18, "d", "0")),
  "en1993-voorgespannen-bout": () => svg(plaat(26, 34, 60, 10), plaat(74, 44, 60, 10), bout(80, 26, 36), pijl(80, 14, 80, 22, "a"), pijl(80, 76, 80, 68, "a"), tekst(92, 16, "F", "p", "start"), pijl(112, 42, 92, 42, "l"), tekst(118, 36, "μ", "", "start"), tekst(20, 70, "F", "s,Rd", "start")),
  "en1993-hoeklas-vereenvoudigd": () => svg(las(), tekst(102, 44, "a", "", "start"), tekst(46, 40, "F", "w,Rd")),
  "en1993-hoeklas-richtingsmethode": () => svg(las(), pijl(94, 48, 106, 60), tekst(112, 72, "σ", "⊥", "start"), pijl(94, 48, 106, 36), tekst(110, 34, "τ", "⊥", "start"), rond(94, 48, 2, "z"), tekst(58, 44, "τ", "∥", "end")),

  // EN 1995
  "en1995-rekenwaarde-sterkte": () => svg(vanNaar("f", "k", "f", "d", 46, 30, "k", "mod", "M")),
  "en1995-kmod-kdef": () => svg(...[[26, 60, "P"], [46, 66, "L"], [66, 72, "M"], [86, 80, "S"], [106, 88, "I"]].map(([x, h, s]) => vak(x as number, 76 - (h as number) * 0.7, 18, (h as number) * 0.7, "h") + tekst((x as number) + 9, 72, s as string)), tekst(132, 26, "k", "mod", "start"), lijn(20, 76, 130, 76)),
  "en1995-kh-massief": () => svg(asjes("h", "k", "", "h"), pad(`M${OX} 26C50 36 72 50 92 58H134`, "a"), lijn(92, 58, 92, OY, "m"), tekst(92, 84, "150"), tekst(OX + 22, 28, "1,3", "", "start")),
  "en1995-kh-gelamineerd": () => svg(asjes("h", "k", "", "h"), pad(`M${OX} 36C56 44 86 54 116 58H134`, "a"), lijn(116, 58, 116, OY, "m"), tekst(116, 84, "600"), tekst(OX + 22, 36, "1,1", "", "start")),
  "en1995-buiging": () => svg(hout(50, 14, 40, 62, true), assen(70, 45, 26, 34), pad("M112 30C124 30 124 60 112 60", "a"), tekst(124, 24, "M", "y", "start"), pad("M56 84C64 80 76 80 84 84", "a"), tekst(96, 86, "M", "z", "start")),
  "en1995-afschuiving": () => svg(hout(16, 22, 66, 46), pijl(38, 30, 38, 60), tekst(50, 48, "V"), parabool(100, 16, 45, 46), tekst(120, 49, "τ", "d", "start"), lijn(16, 34, 34, 34, "a"), tekst(64, 18, "k", "cr")),
  "en1995-oplegdruk": () => svg(hout(14, 18, 132, 30), vak(62, 48, 36, 20, "n"), pijl(80, 2, 80, 16), tekst(92, 12, "F", "c,90", "start"), pad("M62 48L52 18M98 48L108 18", "s"), maat(52, 74, 108, 74, "l", "ef")),
  "en1995-trek-evenwijdig": () => svg(hout(36, 30, 88, 28), pijl(36, 44, 12, 44), pijl(124, 44, 148, 44), tekst(18, 36, "F", "t"), tekst(142, 36, "F", "t"), tekst(80, 72, "f", "t,0")),
  "en1995-druk-evenwijdig": () => svg(hout(36, 30, 88, 28), pijl(12, 44, 34, 44), pijl(148, 44, 126, 44), tekst(18, 36, "F", "c"), tekst(142, 36, "F", "c"), tekst(80, 72, "f", "c,0")),
  "en1995-druk-onder-hoek": () => svg(hout(26, 40, 108, 32), vorm("M68 40L88 16L108 40Z", "h"), pijl(116, 2, 96, 26), tekst(124, 12, "F", "c,α", "start"), tekst(62, 34, "α", "", "end")),
  "en1995-buiging-en-trek": () => svg(hout(30, 17, 32, 56, true), nullijn(24, 120), spanning(96, -8, 30), pijl(30, 45, 10, 45), tekst(14, 38, "N", "t"), tekst(46, 12, "M")),
  "en1995-buiging-en-druk": () => svg(hout(30, 17, 32, 56, true), nullijn(24, 120), spanning(96, 30, -8), pijl(8, 45, 28, 45), tekst(14, 38, "N", "c"), tekst(46, 12, "M")),
  "en1995-knik-kolom": () => svg(hout(52, 16, 16, 58, true), buigvorm("M60 16Q80 45 60 74"), pijl(60, 0, 60, 14), tekst(70, 10, "N", "", "start"), maat(100, 16, 100, 74, "l", "ef"), tekst(128, 50, "k", "c", "start")),
  "en1995-kip": () => svg(hout(24, 22, 14, 50, true), tekst(31, 16, "b, h"), hout(62, 34, 86, 22), buigvorm("M62 45Q105 12 148 45"), tekst(105, 22, "k", "crit"), maat(62, 68, 148, 68, "l", "ef")),
  "en1995-torsie": () => svg(hout(52, 16, 56, 58, true), pijl(58, 22, 102, 22), pijl(102, 22, 102, 68), pijl(102, 68, 58, 68), pijl(58, 68, 58, 22), tekst(80, 49, "T"), tekst(122, 46, "τ", "tor", "start")),
  "en1995-doorbuiging-eindwaarde": () => svg(balk(), scharnier(A), rol(B), pad(`M${A} ${Y}Q80 ${Y + 18} ${B} ${Y}`, "s"), pad(`M${A} ${Y}Q80 ${Y + 40} ${B} ${Y}`, "a"), tekst(102, Y + 12, "w", "inst", "start"), tekst(80, 80, "w", "fin")),
  "en1995-vloertrilling-eigenfrequentie": () => svg(lijn(20, 30, 140, 30, "d"), ...[32, 56, 80, 104, 128].map((x) => vak(x - 4, 30, 8, 12, "h")), buigvorm("M20 56Q80 88 140 56"), tekst(80, 22, "f", "1"), maat(20, 48, 140, 48, "l")),
  "en1995-stuiksterkte-bout": () => svg(hout(22, 20, 116, 50), rond(80, 45, 13, "z"), ...[[60, 45], [64, 32], [64, 58]].map(([x, y]) => pijl(x as number - 12, y as number, x as number, y as number)), tekst(36, 30, "f", "h"), tekst(104, 49, "d", "", "start")),
  "en1995-vloeimoment-bout": () => svg(pad("M40 22L76 44L120 44L156 66", "d"), rond(76, 44, 3, "a"), rond(120, 44, 3, "a"), pad("M60 14C68 12 76 18 76 26", "a"), tekst(98, 26, "M", "y,Rk"), tekst(98, 62, "d")),
  "en1995-spijker": () => svg(hout(20, 22, 120, 20), hout(20, 42, 120, 28), lijn(80, 8, 80, 62, "d"), lijn(72, 8, 88, 8, "d"), tekst(92, 14, "d", "", "start"), tekst(112, 34, "f", "h"), tekst(112, 60, "M", "y")),
  "en1995-johansen-enkelsnedig": () => svg(hout(20, 22, 120, 22), hout(20, 44, 120, 26), pad("M80 16L80 36L88 50L88 76", "d"), lijn(14, 44, 146, 44, "s"), tekst(10, 37, "t", "1", "start"), tekst(10, 62, "t", "2", "start"), pijl(116, 33, 140, 33), tekst(124, 16, "F", "v,Rk")),
  "en1995-johansen-dubbelsnedig": () => svg(hout(20, 12, 120, 18), hout(20, 30, 120, 30), hout(20, 60, 120, 18), lijn(80, 6, 80, 84, "d"), lijn(14, 30, 146, 30, "s"), lijn(14, 60, 146, 60, "s"), tekst(10, 24, "t", "1", "start"), tekst(10, 48, "t", "2", "start"), pijl(116, 45, 140, 45)),
  "en1995-effectief-aantal-bouten": () => svg(hout(14, 30, 132, 28), ...[42, 66, 90, 114].map((x) => rond(x, 44, 4, "z")), pijl(146, 44, 156, 44), maat(42, 68, 66, 68, "a", "1"), tekst(112, 80, "n", "ef")),
  "en1995-rekenwaarde-verbinding": () => svg(vanNaar("F", "v,Rk", "F", "v,Rd", 46, 30, "k", "mod", "M")),
};

/** Het plaatje bij een formule of voorbeeld, als SVG-tekst; zonder plaatje `null`. */
export function formuleBeeld(f: { id: string; beeld?: string }): string | null {
  // De naam kan uit de index van de Library komen: alleen eigen plaatjes, geen `constructor`.
  const naam = f.beeld ?? f.id;
  return Object.prototype.hasOwnProperty.call(BEELDEN, naam) ? BEELDEN[naam]() : null;
}

/** Alle namen, voor de controle. */
export const BEELD_NAMEN = Object.keys(BEELDEN);
