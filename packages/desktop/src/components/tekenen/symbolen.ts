/**
 * Parametrische symbolen voor het tabblad Tekenen: staalprofielen en hout op
 * ware grootte (doorsnede, en een profiel ook als boven- of zijaanzicht),
 * schematisering (ligger, opleggingen, lasten, veren, windverband, scharnier)
 * en maatvoering (stramien, peilmaat, paalpuntniveau).
 *
 * Een symbool is een Vorm met `soort: "symbool"`, een `sym` en twee soorten
 * parameters:
 *   • `p`  maten die aan het blad te koppelen zijn: de plaats (x y, x1 y1 x2 y2
 *          of x y w h) en de profielmaten (h, b, t_w, …, in mm);
 *   • `o`  keuzes en teksten: familie en maat, aanzicht, type oplegging, label,
 *          lastwaarde (een getal of een uitdrukking uit het blad).
 *
 * Een symbool tekent zich in twee delen: `kern` is de geometrie in zijn eigen
 * assenstelsel en komt één keer in `<defs><symbol>`, `los` zijn de labels van
 * dit exemplaar. In de code staat een exemplaar als
 * `<use href="#…" data-symbool="…" data-…>` met zijn parameters als
 * data-attribuut (code.ts). Alles zwart-wit: de kleur komt van het exemplaar
 * (standaard bijna zwart), wit alleen als afdekking.
 *
 * Geen imports van de app: scripts/check-tekenen-symbolen.mjs laadt dit in Node.
 */
import {
  fmt,
  nieuweVorm,
  opCirkel,
  plaatsingVan,
  waardeMm,
  waardeTekst,
  waardeVan,
  isMmSleutel,
  type Maat,
  type Opgelost,
  type Plaatsing,
  type Stijl,
  type Vorm,
} from "./model.ts";
import { deel, getal, isGetal, lengte, maal, neg, plus, type Term, type Uit } from "./term.ts";
import {
  ALLE_PROFIELMATEN,
  HOUTMATEN,
  MATEN_VAN,
  PX_PER_MM,
  dichtsteMaat,
  familie,
  kokerRadiusFactor,
  leesHoutmaat,
  profielRij,
} from "./staalprofielen.ts";

export type SymboolId =
  | "staal"
  | "hout"
  | "ligger"
  | "oplegging"
  | "puntlast"
  | "qlast"
  | "moment"
  | "scharnier"
  | "veren"
  | "windverband"
  | "stramien"
  | "peil"
  | "paalpunt"
  | "wand"
  | "kanaalplaat"
  | "kanaalplaatdoorsnede"
  | "niveau";

export type SymboolGroep = "profielen" | "schema" | "peilen" | "constructie";

/** De symbolen die op ware grootte tekenen: ze hebben een tekenschaal (`schaal`). */
export const SCHAAL_SYMBOLEN: readonly SymboolId[] = ["staal", "hout", "wand", "kanaalplaat", "kanaalplaatdoorsnede"];

/** Een veld in het eigenschappenpaneel; het label is `veld.<k>` in tekenen.json. */
export type Veld =
  | { k: string; soort: "keuze"; opties: readonly string[]; vertaal?: boolean }
  | { k: string; soort: "tekst" | "waarde" | "vink" }
  | { k: string; soort: "getal"; min?: number; max?: number; stap?: number };

/** Wat een symbool bij het tekenen krijgt. */
export interface Teken {
  v: Vorm;
  u: Uit;
  o: (k: string) => string;
  n: (k: string, standaard: number) => number;
  /** Een term of getal als attribuutwaarde. */
  g: (t: Term | number, decimalen?: number) => string;
  kleur: string;
  d: number;
  grootte: number;
  kader: Kader;
}

/** De geometrie (in het assenstelsel van het symbool) en wat er per exemplaar bij staat. */
export interface Beeld {
  kern: string[];
  los?: string[];
}

export interface SymboolDef {
  id: SymboolId;
  groep: SymboolGroep;
  plaatsing: Plaatsing;
  /** Standaardkeuzes. Een keuze die de standaard heeft, hoeft niet in de code. */
  o: Record<string, string>;
  velden: readonly Veld[];
  /** Standaard lijndikte; anders die van het lint. */
  dikte?: number;
  /** Standaard vulling; undefined: het symbool gebruikt geen vulling. */
  vulling?: string | null;
  /** Het symbool heeft tekst: de tekstgrootte telt. */
  tekst?: boolean;
  /** De koppelbare maten naast de plaats (profielmaten in mm). */
  maten?: readonly string[];
  teken(c: Teken): Beeld;
}

// ─── Kader: van de lokale tekening van een symbool naar de tekening ──────────

export interface Kader {
  O: [Term, Term];
  U: [Term, Term];
  V: [Term, Term];
  /** Langs een lijn: de lengte; anders 0. */
  L: Term;
  /** Hetzelfde als getal (voor wat geen formule kan zijn). */
  Lschat: number;
  globaal(lx: Term | number, ly: Term | number): [Term, Term];
}

const T = (t: Term | number): Term => (typeof t === "number" ? getal(t) : t);
const rondHoek = (x: number) => (Math.abs(x) < 1e-12 ? 0 : Math.round(x * 1e9) / 1e9);

/** Beeldpunten per mm van het profiel bij de schaal van het symbool. */
export const profielSchaal = (o: Record<string, string>) => PX_PER_MM / Math.max(0.01, Number(o.schaal) || 10);

function maakKader(v: Vorm, u: Uit): Kader {
  const soort = plaatsingVan(v);
  const o = v.o ?? {};
  let O: [Term, Term];
  let U: [Term, Term] = [getal(1), getal(0)];
  let V: [Term, Term] = [getal(0), getal(1)];
  let L: Term = getal(0);
  let Lschat = 0;
  if (soort === "lijn") {
    const X1 = u.maat("x1"), Y1 = u.maat("y1"), X2 = u.maat("x2"), Y2 = u.maat("y2");
    O = [X1, Y1];
    const dx = plus(X2, neg(X1));
    const dy = plus(Y2, neg(Y1));
    L = lengte(dx, dy);
    Lschat = Math.hypot(u.schatting("x2") - u.schatting("x1"), u.schatting("y2") - u.schatting("y1"));
    if (isGetal(L) && L.n < 1e-9) {
      L = getal(0);
    } else {
      U = [deel(dx, L), deel(dy, L)];
      V = [neg(U[1]), U[0]];
    }
    // Een gekoppelde lengte (een profiel in aanzicht): de punten geven dan alleen de richting.
    if (v.p.lengte?.e) {
      const k = profielSchaal(o);
      L = maal(u.maatMm("lengte"), getal(k));
      Lschat = u.schatting("lengte") * k;
    }
  } else {
    O = [u.maat("x"), u.maat("y")];
    if (soort === "punt") {
      const a = ((Number(o.hoek) || 0) * Math.PI) / 180;
      const c = rondHoek(Math.cos(a)), s = rondHoek(Math.sin(a));
      const sx = o.spiegel === "1" ? -1 : 1;
      U = [getal(sx * c), getal(sx * s)];
      V = [getal(-s), getal(c)];
    }
  }
  const globaal = (lx: Term | number, ly: Term | number): [Term, Term] => [
    plus(O[0], maal(T(lx), U[0]), maal(T(ly), V[0])),
    plus(O[1], maal(T(lx), U[1]), maal(T(ly), V[1])),
  ];
  return { O, U, V, L, Lschat, globaal };
}

const isEen = (t: Term, n: number) => isGetal(t) && Math.abs(t.n - n) < 1e-12;

/** De plaatsing van het kader als `transform`: verschoven, gedraaid en gespiegeld. */
function kaderTransform(c: Teken): string {
  const { O, U, V } = c.kader;
  const recht = isEen(U[0], 1) && isEen(U[1], 0) && isEen(V[0], 0) && isEen(V[1], 1);
  return recht
    ? `translate(${c.g(O[0])} ${c.g(O[1])})`
    : `matrix(${c.g(U[0], 4)} ${c.g(U[1], 4)} ${c.g(V[0], 4)} ${c.g(V[1], 4)} ${c.g(O[0])} ${c.g(O[1])})`;
}

// ─── Kleine bouwstenen ────────────────────────────────────────────────────────

const lijn = (c: Teken, x1: Term | number, y1: Term | number, x2: Term | number, y2: Term | number, stijl = "") =>
  `<line x1="${c.g(x1)}" y1="${c.g(y1)}" x2="${c.g(x2)}" y2="${c.g(y2)}"${stijl ? ` style="${stijl}"` : ""}/>`;

const veelhoek = (punten: [number, number][], stijl = "") =>
  `<polygon points="${punten.map(([x, y]) => `${fmt(x)},${fmt(y)}`).join(" ")}"${stijl ? ` style="${stijl}"` : ""}/>`;

const dun = (c: Teken) => `stroke-width:${fmt(Math.max(0.35, c.d * 0.5))}`;
const hartStijl = (c: Teken) => `stroke-width:${fmt(Math.max(0.35, c.d * 0.25))}; stroke-dasharray:8 2 1.5 2`;

/** Een pad uit termen. */
class Pad {
  private s: string[] = [];
  private g: (t: Term | number) => string;
  constructor(g: (t: Term | number) => string) {
    this.g = g;
  }
  M(x: Term | number, y: Term | number) { this.s.push(`M ${this.g(x)} ${this.g(y)}`); return this; }
  H(x: Term | number) { this.s.push(`H ${this.g(x)}`); return this; }
  V(y: Term | number) { this.s.push(`V ${this.g(y)}`); return this; }
  /** Een boog met straal r naar (x, y); `klok`: met de klok mee. */
  A(r: Term | number, x: Term | number, y: Term | number, klok: boolean, groot = false) {
    this.s.push(`A ${this.g(r)} ${this.g(r)} 0 ${groot ? 1 : 0} ${klok ? 1 : 0} ${this.g(x)} ${this.g(y)}`);
    return this;
  }
  Z() { this.s.push("Z"); return this; }
  toString() { return this.s.join(" "); }
}

/** Arcering: korte schuine streepjes onder (x0 … x1, y), naar linksonder; één pad. */
function arcering(c: Teken, x0: number, x1: number, y: number, slag: number, aantal: number): string {
  const stap = (x1 - x0) / Math.max(1, aantal - 1);
  const d: string[] = [];
  for (let i = 0; i < aantal; i++) d.push(`M ${fmt(x0 + i * stap)} ${fmt(y)} l ${fmt(-slag)} ${fmt(slag)}`);
  return `<path d="${d.join(" ")}" style="fill:none; ${dun(c)}"/>`;
}

/** Een geschatte tekstbreedte, voor kaders en basislijnen. */
export function tekstBreedte(s: string, grootte: number): number {
  return s.replace(/\{\{[^{}]*\}\}/g, "00000").length * grootte * 0.56;
}

/** Een tekstelement; de inhoud gaat veilig door de rekenkern. */
function tekst(
  c: Teken,
  x: Term | number,
  y: Term | number,
  inhoud: string,
  o: { anker?: "start" | "middle" | "end"; midden?: boolean; grootte?: number; vet?: boolean; transform?: string } = {},
): string {
  const a = o.anker && o.anker !== "start" ? ` text-anchor="${o.anker}"` : "";
  const m = o.midden ? ` dominant-baseline="central"` : "";
  const g = ` font-size="${fmt(o.grootte ?? c.grootte)}"`;
  const vet = o.vet ? "; font-weight:600" : "";
  const tf = o.transform ? ` transform="${o.transform}"` : "";
  return `<text x="${c.g(x)}" y="${c.g(y)}"${a}${m}${g}${tf} style="fill:${c.kleur}; stroke:none${vet}">${c.u.tekst(inhoud)}</text>`;
}

/**
 * Een label dat rechtop blijft, ook als het symbool gedraaid is: bij het
 * lokale punt (lx, ly), weg in de lokale richting (rx, ry).
 */
function etiket(c: Teken, lx: Term | number, ly: Term | number, rx: number, ry: number, inhoud: string): string {
  if (!inhoud.trim()) return "";
  const [X, Y] = c.kader.globaal(lx, ly);
  const { U, V } = c.kader;
  const n = (t: Term) => (isGetal(t) ? t.n : 0);
  const gx = rx * n(U[0]) + ry * n(V[0]);
  const gy = rx * n(U[1]) + ry * n(V[1]);
  const marge = 3;
  if (Math.abs(gy) >= Math.abs(gx)) {
    const y = gy < 0 ? plus(Y, getal(-marge)) : plus(Y, getal(marge + c.grootte * 0.8));
    return tekst(c, X, y, inhoud, { anker: "middle" });
  }
  return tekst(c, plus(X, getal(gx > 0 ? marge : -marge)), Y, inhoud, { anker: gx > 0 ? "start" : "end", midden: true });
}

/**
 * Een label recht boven een doorsnede, ook als die gedraaid is: boven de
 * omhullende van (±halfB, ±halfH) om de plaats van het symbool.
 */
function etiketBoven(c: Teken, halfB: Term, halfH: Term, inhoud: string): string {
  if (!inhoud.trim()) return "";
  const a = ((Number(c.o("hoek")) || 0) * Math.PI) / 180;
  const ext = plus(maal(halfH, getal(Math.abs(rondHoek(Math.cos(a))))), maal(halfB, getal(Math.abs(rondHoek(Math.sin(a))))));
  const [X, Y] = c.kader.O;
  return tekst(c, X, plus(Y, neg(ext), getal(-3)), inhoud, { anker: "middle" });
}

/** Naam = waarde eenheid; zonder waarde alleen de naam. */
export function lastLabel(o: Record<string, string>, waardeSleutel = "waarde"): string {
  const w = waardeTekst(o[waardeSleutel]);
  const naam = (o.naam ?? "").trim();
  if (!w) return naam;
  const e = (o.eenheid ?? "").trim();
  return `${naam ? `${naam} = ` : ""}${w}${e ? ` ${e}` : ""}`;
}

/** Afmetingen van een pijlpunt bij een lijndikte (lasten: iets slanker dan de pijl). */
const punt = (d: number) => ({ L: 6 + 2.5 * d, W: 2.2 + 1.1 * d });

// ─── Staalprofielen ──────────────────────────────────────────────────────────

/** De doorsnede; het middelpunt ligt op de plaats van het symbool. */
function staalDoorsnede(c: Teken): Beeld {
  const f = familie(c.o("familie"));
  const k = profielSchaal(c.v.o ?? {});
  const m = (s: string) => maal(c.u.maatMm(s), getal(k));
  const H = m("h"), B = m("b");
  const h2 = maal(H, getal(0.5)), b2 = maal(B, getal(0.5));
  const nh2 = neg(h2), nb2 = neg(b2);
  const pad = new Pad(c.g);
  let regel: string;

  if (f.vorm === "i" || f.vorm === "u") {
    const TW = m("tw"), TF = m("tf"), R = m("r");
    const binnenBoven = plus(nh2, TF);
    const binnenOnder = plus(h2, neg(TF));
    if (f.vorm === "i") {
      const w2 = maal(TW, getal(0.5));
      pad.M(nb2, nh2).H(b2).V(binnenBoven).H(plus(w2, R))
        .A(R, w2, plus(binnenBoven, R), false).V(plus(binnenOnder, neg(R)))
        .A(R, plus(w2, R), binnenOnder, false).H(b2).V(h2).H(nb2).V(binnenOnder).H(neg(plus(w2, R)))
        .A(R, neg(w2), plus(binnenOnder, neg(R)), false).V(plus(binnenBoven, R))
        .A(R, neg(plus(w2, R)), binnenBoven, false).H(nb2).Z();
    } else {
      const lijf = plus(nb2, TW);
      pad.M(nb2, nh2).H(b2).V(binnenBoven).H(plus(lijf, R))
        .A(R, lijf, plus(binnenBoven, R), false).V(plus(binnenOnder, neg(R)))
        .A(R, plus(lijf, R), binnenOnder, false).H(b2).V(h2).H(nb2).Z();
    }
    regel = `<path d="${pad}" style="stroke:none"/>`;
  } else if (f.vorm === "koker") {
    const t = c.u.schatting("t");
    const Tm = m("t");
    const RO = maal(Tm, getal(kokerRadiusFactor(t)));
    const RI = plus(RO, neg(Tm));
    const rond = (x0: Term, y0: Term, x1: Term, y1: Term, r: Term) =>
      pad.M(plus(x0, r), y0).H(plus(x1, neg(r))).A(r, x1, plus(y0, r), true).V(plus(y1, neg(r)))
        .A(r, plus(x1, neg(r)), y1, true).H(plus(x0, r)).A(r, x0, plus(y1, neg(r)), true).V(plus(y0, r))
        .A(r, plus(x0, r), y0, true).Z();
    rond(nb2, nh2, b2, h2, RO);
    rond(plus(nb2, Tm), plus(nh2, Tm), plus(b2, neg(Tm)), plus(h2, neg(Tm)), RI);
    regel = `<path d="${pad}" fill-rule="evenodd" style="stroke:none"/>`;
  } else {
    const Tm = m("t"), R = m("r");
    const poot = plus(nb2, Tm);
    const been = plus(h2, neg(Tm));
    pad.M(nb2, nh2).H(poot).V(plus(been, neg(R))).A(R, plus(poot, R), been, false).H(b2).V(h2).H(nb2).Z();
    regel = `<path d="${pad}" style="stroke:none"/>`;
  }

  const kern = [regel];
  const hart = c.o("hartlijn") !== "0";
  if (hart) {
    const bx = maal(B, getal(0.65)), hy = maal(H, getal(0.65));
    kern.push(lijn(c, neg(bx), 0, bx, 0, hartStijl(c)), lijn(c, 0, neg(hy), 0, hy, hartStijl(c)));
  }
  const los: string[] = [];
  if (c.o("label") === "1") {
    const f2 = hart ? 0.65 : 0.5;
    los.push(etiketBoven(c, maal(B, getal(f2)), maal(H, getal(f2)), c.o("tekst") || c.o("maat")));
  }
  return { kern, los };
}

/**
 * Een profiel in boven- of zijaanzicht: een band over de lengte van de ligger,
 * met de hartlijn op de twee geplaatste punten. De bandbreedte volgt uit maat
 * en schaal; de lengte is vrij. Binnenlijnen: wat je ziet doorgetrokken, wat
 * erachter valt gestreept.
 */
function staalAanzicht(c: Teken): Beeld {
  const az = c.o("aanzicht");
  const f = familie(c.o("familie"));
  const k = profielSchaal(c.v.o ?? {});
  const m = (s: string) => maal(c.u.maatMm(s), getal(k));
  const { L } = c.kader;
  const band = az === "boven" ? m("b") : m("h");
  const half = maal(band, getal(0.5));
  const zijde = c.o("spiegel") === "1" ? -1 : 1;
  const kern = [`<rect x="0" y="${c.g(neg(half))}" width="${c.g(L)}" height="${c.g(band)}" style="fill:none"/>`];
  const gestreept = `${dun(c)}; stroke-dasharray:6 3`;
  const opY = (y: Term, stijl: string) => kern.push(lijn(c, 0, maal(y, getal(zijde)), L, maal(y, getal(zijde)), stijl));
  if (f.vorm === "koker") {
    // Een koker: de wanden liggen erachter.
    const y = plus(half, neg(m("t")));
    opY(y, gestreept);
    opY(neg(y), gestreept);
  } else if (f.vorm === "hoek") {
    // Bovenaanzicht: de staande poot langs één rand; zijaanzicht: de liggende poot onderaan.
    opY(az === "boven" ? plus(neg(half), m("t")) : plus(half, neg(m("t"))), dun(c));
  } else if (az === "zij") {
    // Zijaanzicht: de flenzen zijn zichtbare randen.
    const y = plus(half, neg(m("tf")));
    opY(y, dun(c));
    opY(neg(y), dun(c));
  } else if (f.vorm === "u") {
    // Bovenaanzicht van een U: het lijf langs één rand.
    opY(plus(neg(half), m("tw")), dun(c));
  } else {
    // Bovenaanzicht van een I: het lijf ligt onder de flens.
    const y = maal(m("tw"), getal(0.5));
    opY(y, gestreept);
    opY(neg(y), gestreept);
  }
  if (c.o("hartlijn") !== "0") kern.push(lijn(c, maal(L, getal(-0.08)), 0, maal(L, getal(1.08)), 0, hartStijl(c)));
  const los: string[] = [];
  if (c.o("label") === "1") {
    const inhoud = c.o("tekst") || c.o("maat");
    if (inhoud.trim()) {
      los.push(tekst(c, maal(L, getal(0.5)), plus(neg(half), getal(-3)), inhoud, { anker: "middle", transform: kaderTransform(c) }));
    }
  }
  return { kern, los };
}

const isAanzicht = (o: Record<string, string> | undefined) => !!o?.aanzicht && o.aanzicht !== "doorsnede";

function staalTeken(c: Teken): Beeld {
  return isAanzicht(c.v.o) ? staalAanzicht(c) : staalDoorsnede(c);
}

// ─── Hout ────────────────────────────────────────────────────────────────────

/** Een profielmaat als tekst: een gekoppelde maat volgt het blad. */
function maatTekst(m: Maat | undefined): string {
  if (!m) return "";
  return m.e ? `{{${m.e}}}` : String(Math.round(m.v * 10) / 10);
}

function houtTeken(c: Teken): Beeld {
  const k = profielSchaal(c.v.o ?? {});
  const B = maal(c.u.maatMm("b"), getal(k)), H = maal(c.u.maatMm("h"), getal(k));
  const x0 = neg(maal(B, getal(0.5))), y0 = neg(maal(H, getal(0.5)));
  const x1 = maal(B, getal(0.5)), y1 = maal(H, getal(0.5));
  const kern = [`<rect x="${c.g(x0)}" y="${c.g(y0)}" width="${c.g(B)}" height="${c.g(H)}"/>`];
  const kruis = c.o("kruis");
  if (kruis !== "geen") kern.push(lijn(c, x0, y0, x1, y1, dun(c)));
  if (kruis === "kruis") kern.push(lijn(c, x0, y1, x1, y0, dun(c)));
  const los: string[] = [];
  if (c.o("label") === "1") {
    los.push(etiketBoven(c, x1, y1, c.o("tekst") || `${maatTekst(c.v.p.b)} × ${maatTekst(c.v.p.h)}`));
  }
  return { kern, los };
}

// ─── Schematisering ──────────────────────────────────────────────────────────

function liggerTeken(c: Teken): Beeld {
  return { kern: [lijn(c, 0, 0, c.kader.L, 0)] };
}

function opleggingTeken(c: Teken): Beeld {
  const s = c.n("grootte", 20);
  const type = c.o("type");
  if (type === "inklemming") {
    return {
      kern: [
        lijn(c, -0.6 * s, 0, 0.6 * s, 0, `stroke-width:${fmt(2 * c.d)}`),
        arcering(c, -0.45 * s, 0.6 * s, c.d, 0.25 * s, 6),
      ],
    };
  }
  const voet = type === "rol" ? 0.58 * s : 0.75 * s;
  const kern = [veelhoek([[0, 0], [-0.45 * s, voet], [0.45 * s, voet]])];
  let grond = voet;
  if (type === "rol") {
    const rr = 0.075 * s;
    for (const x of [-0.27 * s, 0, 0.27 * s]) {
      kern.push(`<circle cx="${fmt(x)}" cy="${fmt(voet + rr)}" r="${fmt(rr)}" style="fill:none; ${dun(c)}"/>`);
    }
    grond = voet + 2 * rr;
  }
  kern.push(lijn(c, -0.7 * s, grond, 0.7 * s, grond), arcering(c, -0.55 * s, 0.7 * s, grond, 0.2 * s, 6));
  return { kern };
}

function puntlastTeken(c: Teken): Beeld {
  const L = c.n("lengte", 40);
  const { L: pl, W } = punt(c.d);
  return {
    kern: [
      lijn(c, 0, -L, 0, -pl + 0.5),
      veelhoek([[0, 0], [-W, -pl], [W, -pl]], `fill:${c.kleur}; stroke:none`),
    ],
    los: [etiket(c, 0, -L, 0, -1, lastLabel(c.v.o ?? {}))],
  };
}

function momentTeken(c: Teken): Beeld {
  const R = c.n("straal", 16);
  const klok = c.o("richting") !== "linksom";
  const a0 = klok ? 135 : 45;
  const a1 = klok ? 405 : -225;
  const p0 = opCirkel(0, 0, R, a0);
  const p1 = opCirkel(0, 0, R, a1);
  const rad = (a1 * Math.PI) / 180;
  const t = klok ? [-Math.sin(rad), Math.cos(rad)] : [Math.sin(rad), -Math.cos(rad)];
  const nrm = [-t[1], t[0]];
  const { L: pl, W } = punt(c.d);
  const tip: [number, number] = [p1.x + t[0] * pl * 0.6, p1.y + t[1] * pl * 0.6];
  const voet = [p1.x - t[0] * pl * 0.4, p1.y - t[1] * pl * 0.4];
  return {
    kern: [
      `<path d="M ${fmt(p0.x)} ${fmt(p0.y)} A ${fmt(R)} ${fmt(R)} 0 1 ${klok ? 1 : 0} ${fmt(voet[0])} ${fmt(voet[1])}" style="fill:none"/>`,
      veelhoek([tip, [voet[0] + nrm[0] * W, voet[1] + nrm[1] * W], [voet[0] - nrm[0] * W, voet[1] - nrm[1] * W]], `fill:${c.kleur}; stroke:none`),
    ],
    los: [etiket(c, 0, -R, 0, -1, lastLabel(c.v.o ?? {}))],
  };
}

function scharnierTeken(c: Teken): Beeld {
  return { kern: [`<circle cx="0" cy="0" r="${fmt(c.n("straal", 4))}"/>`] };
}

/** Verticale ligging bij spiegelen: de last of de veren aan de andere kant van de lijn. */
const kant = (c: Teken) => (c.o("spiegel") === "1" ? -1 : 1);

function qlastTeken(c: Teken): Beeld {
  const { L } = c.kader;
  const s = kant(c);
  const vrij = 2.5;
  const H1 = c.n("hoogte", 24);
  const trap = c.o("trapezium") === "1";
  const H2 = trap ? c.n("hoogte2", 36) : H1;
  const { L: pl, W } = punt(c.d * 0.8);
  const n = Math.min(40, Math.max(1, Math.round(c.kader.Lschat / 28))) + 1;
  // Alle schachten in één pad en alle punten in één pad: dat scheelt veel regels.
  const schachten: string[] = [];
  const punten: string[] = [];
  for (let i = 0; i < n; i++) {
    const f = i / (n - 1);
    const X = c.g(maal(L, getal(f)));
    schachten.push(`M ${X} ${fmt(-s * (vrij + H1 + (H2 - H1) * f))} V ${fmt(-s * (vrij + pl - 0.5))}`);
    punten.push(`M ${X} ${fmt(-s * vrij)} l ${fmt(-W)} ${fmt(-s * pl)} h ${fmt(2 * W)} Z`);
  }
  const kern = [
    lijn(c, 0, -s * (vrij + H1), L, -s * (vrij + H2)),
    `<path d="${schachten.join(" ")}" style="fill:none"/>`,
    `<path d="${punten.join(" ")}" style="fill:${c.kleur}; stroke:none"/>`,
  ];
  const o = c.v.o ?? {};
  const hoogte = (h: number) => (s > 0 ? -(vrij + h) - 4 : vrij + h + 4 + c.grootte * 0.8);
  const tf = kaderTransform(c);
  const los: string[] = [];
  if (trap) {
    const l1 = lastLabel(o), l2 = lastLabel({ ...o, naam: o.naam2 ?? "" }, "waarde2");
    // Beide labels boven het hoogste eind: zo loopt de schuine bovenlijn niet door een label.
    const hoog = Math.max(H1, H2);
    if (l1) los.push(tekst(c, 0, hoogte(hoog), l1, { transform: tf }));
    if (l2) los.push(tekst(c, L, hoogte(hoog), l2, { anker: "end", transform: tf }));
  } else {
    const l = lastLabel(o);
    if (l) los.push(tekst(c, maal(L, getal(0.5)), hoogte(H1), l, { anker: "middle", transform: tf }));
  }
  return { kern, los };
}

function verenTeken(c: Teken): Beeld {
  const { L } = c.kader;
  const s = kant(c);
  const vrij = 2.5;
  const H = c.n("hoogte", 22);
  const n = Math.min(40, Math.max(2, Math.round(c.n("aantal", 5))));
  const a = Math.min(5, (c.kader.Lschat / Math.max(1, n - 1)) * 0.3) || 4;
  // Eén veer als relatief pad, met een grondstreep en twee schuine streepjes.
  const punten: [number, number][] = [[0, 0], [0, 0.15 * H]];
  for (let i = 0; i < 6; i++) punten.push([i % 2 === 0 ? a : -a, (0.15 + (0.7 * (i + 0.5)) / 6) * H]);
  punten.push([0, 0.85 * H], [0, H]);
  let veer = "";
  for (let i = 1; i < punten.length; i++) {
    veer += ` l ${fmt(punten[i][0] - punten[i - 1][0])} ${fmt(s * (punten[i][1] - punten[i - 1][1]))}`;
  }
  const u = 0.8 * a;
  veer += ` m ${fmt(-1.6 * a)} 0 h ${fmt(3.2 * a)} m ${fmt(-2.2 * a)} 0 l ${fmt(-u)} ${fmt(s * u)} m ${fmt(2.2 * a)} ${fmt(-s * u)} l ${fmt(-u)} ${fmt(s * u)}`;
  const d: string[] = [];
  for (let i = 0; i < n; i++) d.push(`M ${c.g(maal(L, getal(i / (n - 1))))} ${fmt(s * vrij)}${veer}`);
  return { kern: [`<path d="${d.join(" ")}" style="fill:none"/>`] };
}

function windverbandTeken(c: Teken): Beeld {
  const W = c.u.maat("w"), H = c.u.maat("h");
  const kern: string[] = [];
  if (c.o("kader") !== "0") kern.push(`<rect x="0" y="0" width="${c.g(W)}" height="${c.g(H)}" style="fill:none"/>`);
  kern.push(lijn(c, 0, H, W, 0));
  if (c.o("type") !== "enkel") kern.push(lijn(c, 0, 0, W, H));
  return { kern };
}

// ─── Maatvoering en peilen ───────────────────────────────────────────────────

function stramienTeken(c: Teken): Beeld {
  const r = c.n("straal", 10);
  const { L } = c.kader;
  const bollen = c.o("bollen");
  const kern = [lijn(c, 0, 0, L, 0, `stroke-dasharray:${fmt(8 + 3 * c.d)} ${fmt(2 + c.d)} ${fmt(1 + c.d)} ${fmt(2 + c.d)}`)];
  const los: string[] = [];
  const bol = (lx: Term) => {
    kern.push(`<circle cx="${c.g(lx)}" cy="0" r="${fmt(r)}" style="fill:#FFFFFF"/>`);
    // De letter blijft rechtop, ook bij een schuine of verticale stramienlijn.
    const [cx, cy] = c.kader.globaal(lx, 0);
    los.push(tekst(c, cx, cy, c.o("label"), { anker: "middle", midden: true, grootte: Math.round(r * 11) / 10 }));
  };
  if (bollen !== "einde") bol(getal(-r));
  if (bollen === "einde" || bollen === "beide") bol(plus(L, getal(r)));
  return { kern, los };
}

function peilTeken(c: Teken): Beeld {
  const g = c.grootte;
  const t = 0.5 * g, th = 0.7 * g;
  const inhoud = c.o("tekst");
  const breed = Math.max(3 * g, tekstBreedte(inhoud, g) + t);
  const kern = [
    veelhoek([[0, 0], [-t, -th], [t, -th]], c.o("gevuld") === "1" ? `fill:${c.kleur}` : "fill:none"),
    lijn(c, -1.6 * t, -th, breed, -th),
  ];
  const los: string[] = [];
  if (inhoud.trim()) {
    const [x, y] = c.kader.globaal(-t, -th - 0.3 * g);
    los.push(tekst(c, x, y, inhoud));
  }
  return { kern, los };
}

/** Paalpuntniveau: een kader met tekst, het niveau een getal of een uitdrukking uit het blad. */
export function paalpuntTekst(o: Record<string, string>): string {
  const n = waardeTekst(o.niveau);
  return [`${(o.voor ?? "").trim()}${o.voor?.trim() ? ":" : ""}`, (o.ref ?? "").trim(), n ? `${n} m` : ""].filter(Boolean).join(" ");
}

function paalpuntTeken(c: Teken): Beeld {
  const g = c.grootte;
  const inhoud = paalpuntTekst(c.v.o ?? {});
  const w = tekstBreedte(inhoud, g) + g;
  const h = 1.8 * g;
  const [X, Y] = c.kader.O;
  return {
    kern: [`<rect x="${fmt(-w / 2)}" y="${fmt(-h / 2)}" width="${fmt(w)}" height="${fmt(h)}" style="fill:none"/>`],
    los: [tekst(c, X, Y, inhoud, { anker: "middle", midden: true, vet: true })],
  };
}

// ─── Wanden en vloeren ───────────────────────────────────────────────────────

/** Hoe een materiaal arceert: lijnen onder 45° (ook als paar) of de zigzag van isolatie. */
type Arcering = "paar" | "dicht" | "links" | "rechts" | "zigzag" | "geen";

export interface WandMateriaal {
  id: string;
  /** De achtergrondkleur; null: geen vlak. */
  vlak: string | null;
  /** De kleur van de arcering. */
  lijn: string;
  arcering: Arcering;
}

/**
 * De materialen van een wand, met de arceerkleuren van Open PDF Studio (de
 * NEN 47-regels daar): een vlak in de materiaalkleur met een lijnpatroon erover.
 * De steek van het patroon ligt vast op papier en loopt met de wand mee.
 */
export const WAND_MATERIALEN: readonly WandMateriaal[] = [
  { id: "metselwerk", vlak: "#CD7C61", lijn: "#000000", arcering: "paar" },
  { id: "kalkzandsteen", vlak: "#C0C0C0", lijn: "#000000", arcering: "dicht" },
  { id: "prefab", vlak: "#808080", lijn: "#000000", arcering: "links" },
  { id: "beton", vlak: "#9C9C9C", lijn: "#000000", arcering: "rechts" },
  { id: "steenwol", vlak: "#B3A04A", lijn: "#6F6328", arcering: "zigzag" },
  { id: "glaswol", vlak: "#FBE98A", lijn: "#B3A14E", arcering: "zigzag" },
  { id: "pir", vlak: "#F2EEC9", lijn: "#B0A978", arcering: "zigzag" },
  { id: "eps", vlak: "#DBDBE3", lijn: "#94949F", arcering: "zigzag" },
  { id: "kooltherm", vlak: "#D98D7D", lijn: "#96544A", arcering: "zigzag" },
  { id: "pur", vlak: "#CCD4B4", lijn: "#8B9470", arcering: "zigzag" },
  { id: "geen", vlak: null, lijn: "#000000", arcering: "geen" },
];

/** De steek van een arcering loodrecht op de lijnen, in px op papier. */
const STEEK: Partial<Record<Arcering, number>> = { paar: 11, dicht: 3.5, links: 6, rechts: 6 };
/** De afstand tussen de twee lijnen van een paar (metselwerk). */
const PAAR_GAT = 2.2;
const ARCEERLIJN = 0.35;

/**
 * Lijnen onder 45° door een band (0 … L, y0 … y0 + t), analytisch afgekapt op de
 * band; `om` spiegelt de richting. Eén pad: dat scheelt veel elementen.
 */
function schuineLijnen(L: number, y0: number, t: number, steek: number, om: boolean, verschuif = 0): string {
  const stap = steek * Math.SQRT2;
  const d: string[] = [];
  for (let c = verschuif; c < L + t; c += stap) {
    // Punt op de lijn: (c − s, y0 + s) voor s in 0 … t, binnen 0 … L.
    const s0 = Math.max(0, c - L);
    const s1 = Math.min(t, c);
    if (s1 <= s0) continue;
    const y = (s: number) => (om ? y0 + t - s : y0 + s);
    d.push(`M ${fmt(c - s0)} ${fmt(y(s0))} L ${fmt(c - s1)} ${fmt(y(s1))}`);
  }
  return d.join(" ");
}

/** De zigzag van isolatie: benen onder 60° over de hele dikte, de punten net binnen de rand. */
function zigzag(L: number, t: number): string {
  const amp = t * 0.46;
  const stap = Math.max(t / Math.tan(Math.PI / 3), 0.5);
  const d = [`M 0 ${fmt(-amp)}`];
  let x = 0;
  let kant = 1;
  while (x < L) {
    const volgende = x + stap;
    if (volgende >= L) {
      // Het laatste been stopt op het eind van de wand.
      const f = (L - x) / stap;
      d.push(`L ${fmt(L)} ${fmt(kant * amp * (2 * f - 1))}`);
      break;
    }
    d.push(`L ${fmt(volgende)} ${fmt(kant * amp)}`);
    x = volgende;
    kant = -kant;
  }
  return d.join(" ");
}

/** De schatting voor wat alleen als getal kan: een arcering rekent niet mee met het blad. */
const lengteNu = (c: Teken) => (isGetal(c.kader.L) ? c.kader.L.n : c.kader.Lschat);

/** Een wand: een band om zijn hartlijn, dikte in mm op schaal, met de arcering van zijn materiaal. */
function wandTeken(c: Teken): Beeld {
  const k = profielSchaal(c.v.o ?? {});
  const t = Math.max(0.5, c.n("dikteMm", 100) * k);
  const mat = WAND_MATERIALEN.find((m) => m.id === c.o("materiaal")) ?? WAND_MATERIALEN[0];
  const L = lengteNu(c);
  const kern: string[] = [];
  const band = (stijl: string) => `<rect x="0" y="${fmt(-t / 2)}" width="${c.g(c.kader.L)}" height="${fmt(t)}" style="${stijl}"/>`;
  if (mat.vlak) kern.push(band(`fill:${mat.vlak}; stroke:none`));
  const steek = STEEK[mat.arcering];
  let d = "";
  if (mat.arcering === "zigzag") d = zigzag(L, t);
  else if (steek) {
    d = schuineLijnen(L, -t / 2, t, steek, mat.arcering === "rechts");
    if (mat.arcering === "paar") d += ` ${schuineLijnen(L, -t / 2, t, steek, false, PAAR_GAT * Math.SQRT2)}`;
  }
  if (d) kern.push(`<path d="${d}" style="fill:none; stroke:${mat.lijn}; stroke-width:${ARCEERLIJN}; stroke-dasharray:none"/>`);
  kern.push(band("fill:none"));
  return { kern };
}

/** Een kanaalplaat in doorsnede: de hoogte, het aantal kanalen en hun maat, in mm. */
export interface Kanaalplaat {
  h: number;
  kanalen: number;
  breed: number;
  hoog: number;
  steek: number;
}

/** De gangbare standaardplaat van 1200 mm per hoogte, zoals Open PDF Studio ze tekent. */
export const KANAALPLATEN: readonly Kanaalplaat[] = [
  { h: 150, kanalen: 11, breed: 65, hoog: 80, steek: 100 },
  { h: 200, kanalen: 7, breed: 117, hoog: 129, steek: 157 },
  { h: 260, kanalen: 7, breed: 117, hoog: 180, steek: 157 },
  { h: 320, kanalen: 5, breed: 166, hoog: 237, steek: 221 },
  { h: 400, kanalen: 5, breed: 164, hoog: 317, steek: 221 },
  { h: 500, kanalen: 5, breed: 164, hoog: 417, steek: 221 },
];

/** De breedte van een plaat, in mm. */
const PLAATBREEDTE = 1200;
/** Beton in doorsnede: grijs met een donkere arcering, de kanalen wit. */
const BETON_VLAK = "#8A8A8A";
const BETON_LIJN = "#3C3C3C";
const kanaalplaatVan = (o: Record<string, string>) => KANAALPLATEN.find((p) => String(p.h) === o.hoogteMm) ?? KANAALPLATEN[1];

/**
 * Een kanaalplaatvloer in bovenaanzicht: het veld met de naden tussen de platen
 * (evenwijdig aan de overspanning, om de 1200 mm) en een pijl in de
 * overspanningsrichting.
 */
function kanaalplaatTeken(c: Teken): Beeld {
  const o = c.v.o ?? {};
  const k = profielSchaal(o);
  const W = c.u.schatting("w"), H = c.u.schatting("h");
  const langsX = c.o("richting") !== "y";
  const strook = Math.max(0.5, PLAATBREEDTE * k);
  const kern = [`<rect x="0" y="0" width="${c.g(c.u.maat("w"))}" height="${c.g(c.u.maat("h"))}"/>`];
  const naden: string[] = [];
  const dwars = langsX ? H : W;
  for (let a = strook; a < dwars - 0.01 && naden.length < 400; a += strook) {
    naden.push(langsX ? `M 0 ${fmt(a)} H ${fmt(W)}` : `M ${fmt(a)} 0 V ${fmt(H)}`);
  }
  if (naden.length > 0) kern.push(`<path d="${naden.join(" ")}" style="fill:none; ${dun(c)}"/>`);
  // De overspanningspijl: een lijn met twee open punten, midden in het veld.
  const langs = langsX ? W : H;
  const mid = (langsX ? H : W) / 2;
  const kop = Math.min(9, langs * 0.08);
  const p = (a: number, b: number) => (langsX ? `${fmt(a)} ${fmt(mid + b)}` : `${fmt(mid + b)} ${fmt(a)}`);
  const a0 = langs * 0.08, a1 = langs * 0.92;
  kern.push(
    `<path d="M ${p(a0, 0)} L ${p(a1, 0)} M ${p(a0 + kop, -kop * 0.4)} L ${p(a0, 0)} L ${p(a0 + kop, kop * 0.4)} M ${p(a1 - kop, -kop * 0.4)} L ${p(a1, 0)} L ${p(a1 - kop, kop * 0.4)}" style="fill:none"/>`,
  );
  const inhoud = c.o("tekst") || `KP ${kanaalplaatVan(o).h}`;
  const [lx, ly] = c.kader.globaal(langsX ? W / 2 : mid + 4, langsX ? mid - 4 : H / 2);
  return { kern, los: [tekst(c, lx, ly, inhoud, langsX ? { anker: "middle" } : {})] };
}

/**
 * Een kanaalplaatvloer in doorsnede: de lijn is de bovenkant, de platen liggen
 * eronder met hun kanalen. Beton is grijs gearceerd, de kanalen zijn wit.
 */
function kanaalplaatDoorsnedeTeken(c: Teken): Beeld {
  const o = c.v.o ?? {};
  const k = profielSchaal(o);
  const plaat = kanaalplaatVan(o);
  const h = plaat.h * k;
  const L = lengteNu(c);
  const kern = [
    `<rect x="0" y="0" width="${c.g(c.kader.L)}" height="${fmt(h)}" style="fill:${BETON_VLAK}; stroke:none"/>`,
    `<path d="${schuineLijnen(L, 0, h, 6, false)}" style="fill:none; stroke:${BETON_LIJN}; stroke-width:${ARCEERLIJN}; stroke-dasharray:none"/>`,
  ];
  const bk = plaat.breed * k, hk = plaat.hoog * k;
  const y = (h - hk) / 2;
  const breed = PLAATBREEDTE * k;
  const n = Math.min(400, Math.ceil(L / Math.max(breed, 0.5) - 1e-6));
  const kanalen: string[] = [];
  const naden: string[] = [];
  for (let i = 0; i < n; i++) {
    const x0 = i * breed;
    if (i > 0) naden.push(`M ${fmt(x0)} 0 V ${fmt(h)}`);
    for (let j = 0; j < plaat.kanalen; j++) {
      const x = x0 + (PLAATBREEDTE / 2 + (j - (plaat.kanalen - 1) / 2) * plaat.steek - plaat.breed / 2) * k;
      if (x + bk > L) continue;
      kanalen.push(`<rect x="${fmt(x)}" y="${fmt(y)}" width="${fmt(bk)}" height="${fmt(hk)}" rx="${fmt(bk / 2)}"/>`);
    }
  }
  if (kanalen.length > 0) kern.push(`<g style="fill:#FFFFFF; stroke-width:${ARCEERLIJN}">${kanalen.join("")}</g>`);
  if (naden.length > 0) kern.push(`<path d="${naden.join(" ")}" style="fill:none; ${dun(c)}"/>`);
  kern.push(`<rect x="0" y="0" width="${c.g(c.kader.L)}" height="${fmt(h)}" style="fill:none"/>`);
  return { kern };
}

/** Een niveau: een streeplijn op de hoogte van het niveau, met het peilteken aan het begin. */
function niveauTeken(c: Teken): Beeld {
  const p = peilTeken(c);
  return {
    kern: [lijn(c, 0, 0, c.kader.L, 0, `${dun(c)}; stroke-dasharray:${fmt(6 + 2 * c.d)} ${fmt(2 + c.d)}`), ...p.kern],
    los: p.los,
  };
}

// ─── De lijst ────────────────────────────────────────────────────────────────

const HOEKEN = ["0", "90", "180", "270"];

export const AANZICHTEN = ["doorsnede", "boven", "zij"] as const;

export const SYMBOLEN: Record<SymboolId, SymboolDef> = {
  staal: {
    id: "staal",
    groep: "profielen",
    plaatsing: "punt",
    o: { familie: "HEB", maat: "HEB 200", schaal: "10", aanzicht: "doorsnede", hoek: "0", spiegel: "0", hartlijn: "1", label: "1", tekst: "" },
    velden: [
      { k: "aanzicht", soort: "keuze", opties: AANZICHTEN, vertaal: true },
      { k: "hoek", soort: "keuze", opties: HOEKEN },
      { k: "spiegel", soort: "vink" },
      { k: "hartlijn", soort: "vink" },
      { k: "label", soort: "vink" },
      { k: "tekst", soort: "tekst" },
    ],
    dikte: 1,
    vulling: "#1F2937",
    tekst: true,
    maten: [...ALLE_PROFIELMATEN, "lengte"],
    teken: staalTeken,
  },
  hout: {
    id: "hout",
    groep: "profielen",
    plaatsing: "punt",
    o: { maat: "71 x 196", schaal: "10", hoek: "0", kruis: "kruis", label: "1", tekst: "" },
    velden: [
      { k: "kruis", soort: "keuze", opties: ["kruis", "enkel", "geen"], vertaal: true },
      { k: "hoek", soort: "keuze", opties: HOEKEN },
      { k: "label", soort: "vink" },
      { k: "tekst", soort: "tekst" },
    ],
    dikte: 1,
    vulling: "#FFFFFF",
    tekst: true,
    maten: ["b", "h"],
    teken: houtTeken,
  },
  ligger: {
    id: "ligger",
    groep: "schema",
    plaatsing: "lijn",
    o: {},
    velden: [],
    dikte: 3,
    teken: liggerTeken,
  },
  oplegging: {
    id: "oplegging",
    groep: "schema",
    plaatsing: "punt",
    o: { type: "scharnier", hoek: "0", grootte: "20" },
    velden: [
      { k: "type", soort: "keuze", opties: ["scharnier", "rol", "inklemming"], vertaal: true },
      { k: "hoek", soort: "keuze", opties: HOEKEN },
      { k: "grootte", soort: "getal", min: 6, stap: 2 },
    ],
    dikte: 1.25,
    vulling: null,
    teken: opleggingTeken,
  },
  puntlast: {
    id: "puntlast",
    groep: "schema",
    plaatsing: "punt",
    o: { naam: "F", waarde: "", eenheid: "kN", lengte: "40", hoek: "0" },
    velden: [
      { k: "naam", soort: "tekst" },
      { k: "waarde", soort: "waarde" },
      { k: "eenheid", soort: "tekst" },
      { k: "lengte", soort: "getal", min: 10, stap: 5 },
      { k: "hoek", soort: "keuze", opties: ["0", "45", "90", "135", "180", "225", "270", "315"] },
    ],
    dikte: 1.25,
    tekst: true,
    teken: puntlastTeken,
  },
  qlast: {
    id: "qlast",
    groep: "schema",
    plaatsing: "lijn",
    o: { naam: "q", waarde: "", eenheid: "kN/m", hoogte: "24", trapezium: "0", naam2: "q", waarde2: "", hoogte2: "36", spiegel: "0" },
    velden: [
      { k: "naam", soort: "tekst" },
      { k: "waarde", soort: "waarde" },
      { k: "eenheid", soort: "tekst" },
      { k: "hoogte", soort: "getal", min: 4, stap: 2 },
      { k: "trapezium", soort: "vink" },
      { k: "naam2", soort: "tekst" },
      { k: "waarde2", soort: "waarde" },
      { k: "hoogte2", soort: "getal", min: 4, stap: 2 },
      { k: "spiegel", soort: "vink" },
    ],
    dikte: 1,
    tekst: true,
    teken: qlastTeken,
  },
  moment: {
    id: "moment",
    groep: "schema",
    plaatsing: "punt",
    o: { naam: "M", waarde: "", eenheid: "kNm", richting: "rechtsom", straal: "16" },
    velden: [
      { k: "naam", soort: "tekst" },
      { k: "waarde", soort: "waarde" },
      { k: "eenheid", soort: "tekst" },
      { k: "richting", soort: "keuze", opties: ["rechtsom", "linksom"], vertaal: true },
      { k: "straal", soort: "getal", min: 6, stap: 2 },
    ],
    dikte: 1.25,
    tekst: true,
    teken: momentTeken,
  },
  scharnier: {
    id: "scharnier",
    groep: "schema",
    plaatsing: "punt",
    o: { straal: "4" },
    velden: [{ k: "straal", soort: "getal", min: 1, stap: 0.5 }],
    dikte: 1.25,
    vulling: "#FFFFFF",
    teken: scharnierTeken,
  },
  veren: {
    id: "veren",
    groep: "schema",
    plaatsing: "lijn",
    o: { aantal: "5", hoogte: "22", spiegel: "0" },
    velden: [
      { k: "aantal", soort: "getal", min: 2, max: 40, stap: 1 },
      { k: "hoogte", soort: "getal", min: 6, stap: 2 },
      { k: "spiegel", soort: "vink" },
    ],
    dikte: 1,
    teken: verenTeken,
  },
  windverband: {
    id: "windverband",
    groep: "schema",
    plaatsing: "vak",
    o: { type: "kruis", kader: "1" },
    velden: [
      { k: "type", soort: "keuze", opties: ["kruis", "enkel"], vertaal: true },
      { k: "kader", soort: "vink" },
    ],
    dikte: 1.25,
    teken: windverbandTeken,
  },
  stramien: {
    id: "stramien",
    groep: "peilen",
    plaatsing: "lijn",
    o: { label: "A", bollen: "begin", straal: "10" },
    velden: [
      { k: "label", soort: "tekst" },
      { k: "bollen", soort: "keuze", opties: ["begin", "einde", "beide"], vertaal: true },
      { k: "straal", soort: "getal", min: 4, stap: 1 },
    ],
    dikte: 0.75,
    tekst: true,
    teken: stramienTeken,
  },
  peil: {
    id: "peil",
    groep: "peilen",
    plaatsing: "punt",
    o: { tekst: "P = 0", gevuld: "0" },
    velden: [
      { k: "tekst", soort: "tekst" },
      { k: "gevuld", soort: "vink" },
    ],
    dikte: 1,
    tekst: true,
    teken: peilTeken,
  },
  paalpunt: {
    id: "paalpunt",
    groep: "peilen",
    plaatsing: "punt",
    o: { voor: "Paalpuntniveau", ref: "NAP", niveau: "-14,0" },
    velden: [
      { k: "voor", soort: "tekst" },
      { k: "ref", soort: "tekst" },
      { k: "niveau", soort: "waarde" },
    ],
    dikte: 1,
    tekst: true,
    teken: paalpuntTeken,
  },
  wand: {
    id: "wand",
    groep: "constructie",
    plaatsing: "lijn",
    o: { materiaal: "metselwerk", dikteMm: "100", schaal: "10" },
    velden: [
      { k: "materiaal", soort: "keuze", opties: WAND_MATERIALEN.map((m) => m.id), vertaal: true },
      { k: "dikteMm", soort: "getal", min: 1, stap: 10 },
    ],
    dikte: 0.75,
    teken: wandTeken,
  },
  kanaalplaat: {
    id: "kanaalplaat",
    groep: "constructie",
    plaatsing: "vak",
    o: { hoogteMm: "200", richting: "x", tekst: "", schaal: "10" },
    velden: [
      { k: "hoogteMm", soort: "keuze", opties: KANAALPLATEN.map((p) => String(p.h)) },
      { k: "richting", soort: "keuze", opties: ["x", "y"], vertaal: true },
      { k: "tekst", soort: "tekst" },
    ],
    dikte: 0.75,
    vulling: null,
    tekst: true,
    teken: kanaalplaatTeken,
  },
  kanaalplaatdoorsnede: {
    id: "kanaalplaatdoorsnede",
    groep: "constructie",
    plaatsing: "lijn",
    o: { hoogteMm: "200", schaal: "10" },
    velden: [{ k: "hoogteMm", soort: "keuze", opties: KANAALPLATEN.map((p) => String(p.h)) }],
    dikte: 0.75,
    teken: kanaalplaatDoorsnedeTeken,
  },
  niveau: {
    id: "niveau",
    groep: "peilen",
    plaatsing: "lijn",
    o: { tekst: "P = 0", gevuld: "0" },
    velden: [
      { k: "tekst", soort: "tekst" },
      { k: "gevuld", soort: "vink" },
    ],
    dikte: 1,
    tekst: true,
    teken: niveauTeken,
  },
};

export const symboolDef = (sym: string | undefined): SymboolDef | undefined =>
  sym && Object.prototype.hasOwnProperty.call(SYMBOLEN, sym) ? SYMBOLEN[sym as SymboolId] : undefined;

/** Hoe een nieuw symbool met deze keuzes geplaatst wordt: een profiel in aanzicht langs een lijn. */
export function plaatsingKeuze(sym: string, o: Record<string, string> | undefined): Plaatsing {
  if (sym === "staal" && isAanzicht(o)) return "lijn";
  return symboolDef(sym)?.plaatsing ?? "punt";
}

/** De delen van een symbool: zijn plaatsing, zijn geometrie en de labels van dit exemplaar. */
export function symboolDelen(v: Vorm, u: Uit): { transform: string; kern: string[]; los: string[] } {
  const def = symboolDef(v.sym);
  if (!def) return { transform: "", kern: [], los: [] };
  const o = { ...def.o, ...(v.o ?? {}) };
  const vol: Vorm = { ...v, o };
  const c: Teken = {
    v: vol,
    u,
    o: (k) => o[k] ?? "",
    n: (k, standaard) => {
      const n = Number(String(o[k] ?? "").replace(",", "."));
      return Number.isFinite(n) && String(o[k] ?? "").trim() !== "" ? n : standaard;
    },
    g: (t, decimalen = 2) => u.getal(T(t), decimalen),
    kleur: v.lijn ?? "#000000",
    d: v.dikte,
    grootte: v.grootte ?? 12,
    kader: maakKader(vol, u),
  };
  const b = def.teken(c);
  return { transform: kaderTransform(c), kern: b.kern, los: (b.los ?? []).filter(Boolean) };
}

/** Een leesbaar begin van het id van een symbool: type, maat, schaal en aanzicht. */
export function symboolSlug(v: Vorm): string {
  const o = v.o ?? {};
  const delen: string[] = [v.sym ?? "symbool"];
  if (v.sym === "staal") {
    delen[0] = o.maat || familie(o.familie).id;
    delen.push(`1op${o.schaal || 10}`);
    if (isAanzicht(o)) delen.push(o.aanzicht);
  } else if (v.sym === "hout") {
    delen.push(o.maat || "eigen", `1op${o.schaal || 10}`);
  } else if (v.sym === "wand") {
    delen.push(o.materiaal, o.dikteMm, `1op${o.schaal || 10}`);
  } else if (v.sym === "kanaalplaat" || v.sym === "kanaalplaatdoorsnede") {
    delen.push(o.hoogteMm, `1op${o.schaal || 10}`);
  } else if (v.sym === "oplegging") {
    delen.push(o.type || "scharnier");
  }
  return delen.join("-").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** Keuzes die alleen dit exemplaar raken: bij "alle gelijke" tellen ze niet mee. */
const PER_EXEMPLAAR = ["hoek", "spiegel", "tekst", "label", "naam", "naam2", "waarde", "waarde2", "eenheid", "niveau", "ref", "voor"];

/** Twee symbolen met dezelfde sleutel zijn "gelijk": voor Op alle gelijke toepassen. */
export function gelijkSleutel(v: Vorm): string {
  const o = v.o ?? {};
  if (v.sym === "staal") return `staal|${familie(o.familie).id}|${o.maat || JSON.stringify(profielMaten(v).map((k) => v.p[k]?.v))}`;
  if (v.sym === "hout") return `hout|${o.maat || `${v.p.b?.v}x${v.p.h?.v}`}`;
  const rest = Object.entries(o).filter(([k]) => !PER_EXEMPLAAR.includes(k)).sort(([a], [b]) => a.localeCompare(b));
  return `${v.sym}|${JSON.stringify(rest)}`;
}

// ─── Maken, keuzes zetten ────────────────────────────────────────────────────

/** De profielmaten die bij de familie van een staalprofiel horen. */
export function profielMaten(v: Vorm): readonly string[] {
  if (v.sym === "hout") return ["b", "h"];
  if (v.sym !== "staal") return [];
  return MATEN_VAN[familie(v.o?.familie).vorm];
}

/**
 * De profielmaten bij de gekozen maat: wat niet gekoppeld is, volgt de tabel;
 * een gekoppelde maat houdt zijn koppeling. Maten die bij de vorm niet horen, vervallen.
 */
export function normaliseer(v: Vorm): Vorm {
  if (v.sym === "staal") {
    const f = familie(v.o?.familie);
    const rij = profielRij(f, v.o?.maat);
    const p: Record<string, Maat> = {};
    for (const [k, m] of Object.entries(v.p)) if (!(ALLE_PROFIELMATEN as readonly string[]).includes(k)) p[k] = m;
    for (const k of MATEN_VAN[f.vorm]) {
      const oud = v.p[k];
      const tabel = rij?.maten[k];
      if (oud?.e) p[k] = { v: tabel ?? oud.v, e: oud.e };
      else if (tabel !== undefined) p[k] = { v: tabel };
      else p[k] = oud ?? { v: f.rijen[0].maten[k] ?? 0 };
    }
    return { ...v, p, o: { ...v.o, familie: f.id } };
  }
  if (v.sym === "hout") {
    const m = leesHoutmaat(v.o?.maat);
    const p: Record<string, Maat> = {};
    for (const [k, w] of Object.entries(v.p)) if (k !== "b" && k !== "h") p[k] = w;
    for (const k of ["b", "h"] as const) {
      const oud = v.p[k];
      p[k] = oud?.e ? oud : m ? { v: m[k] } : oud ?? { v: k === "b" ? 71 : 196 };
    }
    return { ...v, p };
  }
  return v;
}

/** R tijdens het plaatsen: een kwart slag verder, als het symbool op een punt staat. */
export function draaiKeuze(sym: string, o: Record<string, string>): Record<string, string> {
  const def = symboolDef(sym);
  if (!def || plaatsingKeuze(sym, o) !== "punt" || !("hoek" in def.o)) return o;
  return { ...o, hoek: String(((Number(o.hoek) || 0) + 90) % 360) };
}

/** F tijdens het plaatsen: gespiegeld, of de last aan de andere kant van de lijn. */
export function spiegelKeuze(sym: string, o: Record<string, string>): Record<string, string> {
  const def = symboolDef(sym);
  if (!def) return o;
  const uit = { ...o };
  if (sym === "moment") uit.richting = o.richting === "linksom" ? "rechtsom" : "linksom";
  if ("spiegel" in def.o) uit.spiegel = o.spiegel === "1" ? "0" : "1";
  if ("hoek" in def.o && plaatsingKeuze(sym, o) === "punt") uit.hoek = String((360 - (Number(o.hoek) || 0)) % 360);
  return uit;
}

/** Een nieuw symbool op een plek (x y, of x1 y1 x2 y2, of x y w h), met de stijl van het lint. */
export function nieuwSymbool(sym: SymboolId, plek: Record<string, number>, stijl: Stijl, o: Record<string, string> = {}): Vorm {
  const def = SYMBOLEN[sym];
  const v = nieuweVorm("symbool", plek, stijl, { sym, o: { ...def.o, ...o } });
  v.dikte = def.dikte ?? stijl.dikte;
  // Staal is massief in de lijnkleur; hout en een scharnier dekken af met wit.
  v.vulling = def.vulling === undefined ? null : sym === "staal" ? stijl.lijn : def.vulling;
  v.streep = false;
  v.grootte = def.tekst ? 12 : undefined;
  return normaliseer(v);
}

/** De lengte in px van een profiel in aanzicht, volgens zijn twee punten. */
const aanzichtPx = (v: Vorm) => Math.hypot((v.p.x2?.v ?? 0) - (v.p.x1?.v ?? 0), (v.p.y2?.v ?? 0) - (v.p.y1?.v ?? 0));

/** Doorsnede naar aanzicht en terug: de plaats gaat over van een punt op twee punten. */
function wisselAanzicht(v: Vorm, naar: string): Vorm {
  const was = isAanzicht(v.o);
  const wordt = naar !== "doorsnede";
  if (was === wordt) return v;
  const p: Record<string, Maat> = { ...v.p };
  if (wordt) {
    const o = v.o ?? {};
    const band = (naar === "boven" ? v.p.b?.v ?? 100 : v.p.h?.v ?? 100) * profielSchaal(o);
    const L = Math.max(120, Math.round(4 * band));
    const a = ((Number(o.hoek) || 0) * Math.PI) / 180;
    const x = v.p.x?.v ?? 0, y = v.p.y?.v ?? 0;
    const dx = (Math.cos(a) * L) / 2, dy = (Math.sin(a) * L) / 2;
    delete p.x;
    delete p.y;
    const r = (n: number) => ({ v: Math.round(n * 100) / 100 });
    return { ...v, p: { x1: r(x - dx), y1: r(y - dy), x2: r(x + dx), y2: r(y + dy), ...p } };
  }
  const x = ((v.p.x1?.v ?? 0) + (v.p.x2?.v ?? 0)) / 2;
  const y = ((v.p.y1?.v ?? 0) + (v.p.y2?.v ?? 0)) / 2;
  for (const k of ["x1", "y1", "x2", "y2", "lengte"]) delete p[k];
  return { ...v, p: { x: { v: x }, y: { v: y }, ...p } };
}

/** Een keuze van een symbool zetten, met wat erbij hoort (een andere familie kiest de dichtstbijzijnde hoogte). */
export function zetOptie(v: Vorm, k: string, w: string): Vorm {
  const o: Record<string, string> = { ...(v.o ?? {}), [k]: w };
  let basis = v;
  if (v.sym === "staal" && k === "familie") {
    const f = familie(w);
    o.maat = dichtsteMaat(f, v.p.h?.v ?? 0);
  }
  if (v.sym === "staal" && k === "aanzicht") basis = wisselAanzicht(v, w);
  return normaliseer({ ...basis, o });
}

/**
 * Een profielmaat met de hand: de maat in de keuzelijst wordt "eigen" als hij
 * niet meer bij een regel van de tabel past.
 */
export function zetProfielMaat(v: Vorm, k: string, m: Maat): Vorm {
  const p = { ...v.p, [k]: m };
  const o = { ...(v.o ?? {}) };
  if (v.sym === "staal") {
    const rij = profielRij(familie(o.familie), o.maat);
    if (rij && !m.e && rij.maten[k] !== m.v) o.maat = "";
  } else if (v.sym === "hout" && !m.e) {
    const b = p.b?.v, h = p.h?.v;
    const naam = `${b} x ${h}`;
    o.maat = HOUTMATEN.includes(naam) ? naam : "";
  }
  return { ...v, p, o };
}

/** De werkelijke lengte in mm van een profiel in aanzicht. */
export const aanzichtLengte = (v: Vorm, w: (k: string) => number) =>
  v.p.lengte?.e ? w("lengte") : Math.hypot(w("x2") - w("x1"), w("y2") - w("y1")) / profielSchaal(v.o ?? {});

/** De lengte van een profiel in aanzicht zetten: een getal in mm of een koppeling aan het blad. */
export function zetAanzichtLengte(v: Vorm, m: Maat): Vorm {
  if (m.e) return normaliseer({ ...v, p: { ...v.p, lengte: m } });
  const p = { ...v.p };
  delete p.lengte;
  const k = profielSchaal(v.o ?? {});
  const px = m.v * k;
  const L = aanzichtPx(v) || 1;
  const x1 = p.x1?.v ?? 0, y1 = p.y1?.v ?? 0;
  const ux = ((p.x2?.v ?? x1 + 1) - x1) / L, uy = ((p.y2?.v ?? y1) - y1) / L;
  const r = (n: number) => Math.round(n * 100) / 100;
  if (!p.x2?.e) p.x2 = { v: r(x1 + ux * px) };
  if (!p.y2?.e) p.y2 = { v: r(y1 + uy * px) };
  return normaliseer({ ...v, p });
}

/** Gebruikt het symbool een vulling (profiel, hout, scharnier)? */
export const heeftVulling = (v: Vorm) => symboolDef(v.sym)?.vulling !== undefined && !(v.sym === "staal" && isAanzicht(v.o));

/**
 * De maten zoals ze getekend staan: een mm-maat met eenheid omgerekend, en het
 * eind van een profiel in aanzicht volgt een gekoppelde lengte.
 */
export function getekend(v: Vorm, opgelost?: Opgelost): (k: string) => number {
  return (k) => {
    if (isMmSleutel(v, k)) return waardeMm(v.p[k], opgelost);
    if (v.soort === "symbool" && v.p.lengte?.e && (k === "x2" || k === "y2")) {
      const x1 = waardeVan(v.p.x1, opgelost), y1 = waardeVan(v.p.y1, opgelost);
      const dx = waardeVan(v.p.x2, opgelost) - x1, dy = waardeVan(v.p.y2, opgelost) - y1;
      const d = Math.hypot(dx, dy) || 1;
      const L = waardeMm(v.p.lengte, opgelost) * profielSchaal(v.o ?? {});
      return k === "x2" ? x1 + (dx / d) * L : y1 + (dy / d) * L;
    }
    return waardeVan(v.p[k], opgelost);
  };
}

// ─── Snappen ─────────────────────────────────────────────────────────────────

export type SnapSoort = "eind" | "midden" | "centrum" | "op";
export interface SnapPunt {
  x: number;
  y: number;
  soort: SnapSoort;
}

/** Snappunten en lijnen van een symbool, op de waarden zoals ze getekend worden. */
export function symboolSnap(v: Vorm, w: (k: string) => number): { punten: SnapPunt[]; lijnen: [number, number, number, number][] } {
  const soort = plaatsingVan(v);
  if (soort === "lijn") {
    const [x1, y1, x2, y2] = [w("x1"), w("y1"), w("x2"), w("y2")];
    return {
      punten: [
        { x: x1, y: y1, soort: "eind" },
        { x: x2, y: y2, soort: "eind" },
        { x: (x1 + x2) / 2, y: (y1 + y2) / 2, soort: "midden" },
      ],
      lijnen: [[x1, y1, x2, y2]],
    };
  }
  if (soort === "vak") {
    const [x, y, b, h] = [w("x"), w("y"), w("w"), w("h")];
    return { punten: rechthoekPunten(x, y, b, h), lijnen: rechthoekLijnen(x, y, b, h) };
  }
  const x = w("x"), y = w("y");
  if (v.sym === "staal" || v.sym === "hout") {
    const k = profielSchaal(v.o ?? {});
    const a = (((Number(v.o?.hoek) || 0) % 180) + 180) % 180 === 90;
    const B = w("b") * k, H = w("h") * k;
    const [bb, hh] = a ? [H, B] : [B, H];
    return { punten: rechthoekPunten(x - bb / 2, y - hh / 2, bb, hh), lijnen: [] };
  }
  const centrum = v.sym === "moment" || v.sym === "scharnier" || v.sym === "paalpunt";
  return { punten: [{ x, y, soort: centrum ? "centrum" : "eind" }], lijnen: [] };
}

export function rechthoekPunten(x: number, y: number, b: number, h: number): SnapPunt[] {
  return [
    { x, y, soort: "eind" },
    { x: x + b, y, soort: "eind" },
    { x, y: y + h, soort: "eind" },
    { x: x + b, y: y + h, soort: "eind" },
    { x: x + b / 2, y, soort: "midden" },
    { x: x + b / 2, y: y + h, soort: "midden" },
    { x, y: y + h / 2, soort: "midden" },
    { x: x + b, y: y + h / 2, soort: "midden" },
    { x: x + b / 2, y: y + h / 2, soort: "centrum" },
  ];
}

export function rechthoekLijnen(x: number, y: number, b: number, h: number): [number, number, number, number][] {
  return [
    [x, y, x + b, y],
    [x + b, y, x + b, y + h],
    [x + b, y + h, x, y + h],
    [x, y + h, x, y],
  ];
}

// ─── Het lint: wat de knoppen plaatsen ───────────────────────────────────────

export interface Voorkeuze {
  /** Sleutel voor de tekst. */
  id: string;
  sym: SymboolId;
  o?: Record<string, string>;
  glyph: string;
}

export const STAAL_KEUZES: readonly Voorkeuze[] = [
  { id: "HEA", sym: "staal", o: { familie: "HEA", maat: "HEA 200" }, glyph: "I" },
  { id: "HEB", sym: "staal", o: { familie: "HEB", maat: "HEB 200" }, glyph: "I" },
  { id: "HEM", sym: "staal", o: { familie: "HEM", maat: "HEM 200" }, glyph: "I" },
  { id: "IPE", sym: "staal", o: { familie: "IPE", maat: "IPE 200" }, glyph: "I" },
  { id: "UNP", sym: "staal", o: { familie: "UNP", maat: "UNP 200" }, glyph: "[" },
  { id: "koker", sym: "staal", o: { familie: "koker", maat: "K100/5" }, glyph: "□" },
  { id: "hoek", sym: "staal", o: { familie: "hoek", maat: "L 100x100x10" }, glyph: "L" },
];

export const OPLEGGING_KEUZES: readonly Voorkeuze[] = [
  { id: "scharnier", sym: "oplegging", o: { type: "scharnier" }, glyph: "△" },
  { id: "rol", sym: "oplegging", o: { type: "rol" }, glyph: "△" },
  { id: "inklemming", sym: "oplegging", o: { type: "inklemming" }, glyph: "▨" },
];

export const GLYPH: Record<SymboolId, string> = {
  staal: "I",
  hout: "⊠",
  ligger: "━",
  oplegging: "△",
  puntlast: "↓",
  qlast: "⇊",
  moment: "↻",
  scharnier: "○",
  veren: "≀",
  windverband: "╳",
  stramien: "Ⓐ",
  peil: "▽",
  paalpunt: "⊥",
  wand: "▥",
  kanaalplaat: "▤",
  kanaalplaatdoorsnede: "◍",
  niveau: "▽",
};
