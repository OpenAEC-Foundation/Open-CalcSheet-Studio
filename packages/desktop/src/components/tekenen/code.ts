/**
 * Van tekening naar rekentaal en terug.
 *
 * Een tekening wordt een `@svg … @end`-blok. De rekenkern vult daarin
 * `{{naam}}` in met de waarde van een variabele, zonder eenheid; een formule
 * past daar niet. Een koppeling die geen kale naam is (`h*schaal`), rekent
 * daarom eerst verborgen uit in een hulpvariabele vlak boven het blok:
 *
 *     #hide
 *     'Tekening tek1: maten uit het blad
 *     tek1_1 = h*schaal
 *     #show
 *     @svg
 *     <svg data-tekening="tek1" viewBox="0 0 480 320" …>
 *       <rect x="40" y="40" width="{{b}}" height="{{tek1_1}}" …/>
 *     </svg>
 *     @end
 *
 * Zo verandert de tekening mee als de invoer van het blad verandert. Een pijl
 * en een maatlijn draaien mee met hun eindpunten: hun richting rekent, als een
 * eindpunt gekoppeld is, ook verborgen uit (geen markers met een id, die in een
 * verborgen kopie van de uitwerking hun punt kwijtraken).
 *
 * Bij "Tekening bewerken" leest `leesTekening` een blok weer in, ook een
 * blok dat met de hand of uit een bestand is gemaakt: wat de editor niet kent,
 * blijft ongewijzigd staan.
 *
 * Een parametrisch symbool staat één keer in `<defs><symbol id="…">` en elk
 * exemplaar is een `<use href="#…" data-…>` met zijn plaatsing en parameters;
 * labels staan los ernaast (`<text data-bij="1">`, bij het lezen overgeslagen
 * en opnieuw gemaakt). Het id volgt uit de inhoud: dezelfde tekst na het
 * invullen van `{{…}}` is dezelfde geometrie, ook als een ander blad of een
 * kloon op een afdrukvel hetzelfde id gebruikt. Een gekoppelde maat staat
 * daarom als `{{naam}}` in het id: twee bladen met een andere waarde hebben
 * zo een ander id.
 */
import {
  boogEind,
  fmt,
  isMmSleutel,
  isNaam,
  isVorm,
  legeTekening,
  mmUitdrukking,
  nieuwId,
  schoonUitdrukking,
  waardeMm,
  waardeVan,
  zonderMm,
  MAAT_GAT,
  STANDAARD_BREED,
  STANDAARD_HOOG,
  STANDAARD_STIJL,
  type Anker,
  type Element,
  type Maat,
  type Opgelost,
  type Tekening,
  type Vorm,
} from "./model.ts";
import * as R from "./term.ts";
import { nieuwSymbool, normaliseer, symboolDef, symboolDelen, symboolSlug, type SymboolId } from "./symbolen.ts";
import { familie, leesHoutmaat, profielRij } from "./staalprofielen.ts";

// ─── Blokken in de bron ──────────────────────────────────────────────

export interface Blok {
  /** Eerste regel (vanaf 0): de hulpregels erboven, of `@svg`. */
  van: number;
  /** Regel van `@svg`. */
  svg: number;
  /** Regel van `@end`. */
  eind: number;
  /** `data-tekening` van de tekening, als het blok er een heeft. */
  naam: string | null;
  /** Tekenpositie van het begin van regel `van`. */
  begin: number;
  /** Tekenpositie van het einde van regel `eind` (zonder regeleinde). */
  einde: number;
}

const SVG_BEGIN = /^@svg\s*$/;
const SVG_EIND = /^@end\s*$/;

function regelBegins(regels: string[]): number[] {
  const uit: number[] = [];
  let o = 0;
  for (const r of regels) {
    uit.push(o);
    o += r.length + 1;
  }
  return uit;
}

/** De hulpregels vlak boven `@svg` (regel i) horen bij het blok. */
function hulpBegin(regels: string[], i: number, naam: string): number {
  const hulp = new RegExp(`^${naam}_\\d+\\s*=`);
  const kop = new RegExp(`^'[^']*\\b${naam}:`);
  const isHulp = (r: string) => hulp.test(r.trim()) || kop.test(r.trim());
  if (i > 0 && regels[i - 1].trim() === "#show") {
    let k = i - 2;
    let n = 0;
    while (k >= 0 && isHulp(regels[k])) {
      k--;
      n++;
    }
    return n > 0 && k >= 0 && regels[k].trim() === "#hide" ? k : i;
  }
  let k = i - 1;
  while (k >= 0 && isHulp(regels[k])) k--;
  return k + 1;
}

/** Alle `@svg`-blokken in de bron. */
export function zoekBlokken(bron: string): Blok[] {
  const regels = bron.split("\n");
  const begins = regelBegins(regels);
  const uit: Blok[] = [];
  for (let i = 0; i < regels.length; i++) {
    if (!SVG_BEGIN.test(regels[i].trim())) continue;
    let j = i + 1;
    while (j < regels.length && !SVG_EIND.test(regels[j].trim())) j++;
    if (j >= regels.length) break;
    const inhoud = regels.slice(i + 1, j).join("\n");
    const naam = /data-tekening="([A-Za-z_]\w*)"/.exec(inhoud)?.[1] ?? null;
    const van = naam ? hulpBegin(regels, i, naam) : i;
    uit.push({ van, svg: i, eind: j, naam, begin: begins[van], einde: begins[j] + regels[j].length });
    i = j;
  }
  return uit;
}

const regelVan = (bron: string, pos: number) => bron.slice(0, pos).split("\n").length - 1;

/** Het blok waar de cursor in staat (ook op de hulpregels erboven). */
export function blokBij(bron: string, pos: number): Blok | null {
  const r = regelVan(bron, pos);
  return zoekBlokken(bron).find((b) => b.van <= r && r <= b.eind) ?? null;
}

export function blokMetNaam(bron: string, naam: string): Blok | null {
  return zoekBlokken(bron).find((b) => b.naam === naam) ?? null;
}

/** De tekst van een blok. */
export const blokTekst = (bron: string, b: Blok) => bron.slice(b.begin, b.einde);

/** Staat deze plek in een verborgen deel (`#hide` zonder `#show` erna)? */
export function verborgenBij(bron: string, pos: number): boolean {
  const regels = bron.slice(0, pos).split("\n");
  regels.pop();
  for (let i = regels.length - 1; i >= 0; i--) {
    const t = regels[i].trim();
    if (t === "#hide") return true;
    if (t === "#show") return false;
  }
  return false;
}

/** Een naam die nog niet in het blad voorkomt: tek1, tek2, … */
export function vrijeNaam(bron: string): string {
  let max = 0;
  for (const m of bron.matchAll(/\btek(\d+)(?:"|_\d+\b)/g)) max = Math.max(max, Number(m[1]));
  return `tek${max + 1}`;
}

/** De inspringing van de `@svg`-regel, voor het terugschrijven. */
export function inspringing(bron: string, b: Blok): string {
  return /^\s*/.exec(bron.split("\n")[b.svg] ?? "")?.[0] ?? "";
}

// ─── Schrijven ───────────────────────────────────────────────────────

type Ref = { n: number } | { naam: string };

const isGetal = (r: Ref): r is { n: number } => "n" in r;

/** Een waarde in een formule: een getal (negatief tussen haakjes) of een naam. */
const inFormule = (r: Ref) => (isGetal(r) ? (r.n < 0 ? `(${fmt(r.n)})` : fmt(r.n)) : r.naam);

/** Een getal zoals de rekenkern het invult: geheel, of 4 significante cijfers. */
export function kernGetal(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return String(parseFloat(n.toPrecision(4)));
}

/**
 * Bouwt de markup. In de code (`opgelost` = null) worden koppelingen
 * `{{naam}}` en verzamelt hij de hulpvariabelen; in het beeld van de editor
 * vult hij de uitgerekende waarden in, zodat de editor toont wat de
 * uitwerking straks toont.
 */
class Bouwer {
  readonly hulp: [string, string][] = [];
  private perFormule = new Map<string, string>();
  /** De symbolen van de tekening: id → geometrie. */
  readonly defs = new Map<string, string[]>();
  private naam: string;
  private opgelost: Opgelost | null;
  /** Beeld: de waarde van een koppeling die tekst is, zoals een kleur uit het blad. */
  private tekstVan?: (e: string) => string | undefined;
  /** Code: wat het blad nu voor een koppeling geeft, voor wat geen formule kan zijn (een aantal pijlen). */
  private bekend?: Opgelost;

  constructor(
    naam: string,
    opgelost: Opgelost | null,
    tekstVan?: (e: string) => string | undefined,
    bekend?: Opgelost,
  ) {
    this.naam = naam;
    this.opgelost = opgelost;
    this.tekstVan = tekstVan;
    this.bekend = bekend;
  }

  /** Bouwt hij het beeld van de editor (alles uitgerekend) en niet de code? */
  get isBeeld() {
    return this.opgelost !== null;
  }

  /** De waarde die een maat nu heeft: uit het blad als dat bekend is, anders de laatst getekende. */
  schatting(m: Maat | undefined): number {
    return waardeVan(m, this.opgelost ?? this.bekend);
  }

  /** Hetzelfde voor een mm-maat, met de omrekening van een eenheid. */
  schattingMm(m: Maat | undefined): number {
    return waardeMm(m, this.opgelost ?? this.bekend);
  }

  /** Een mm-maat: heeft de koppeling een eenheid, dan rekent hij verborgen om naar een kaal getal. */
  maatMm(m: Maat | undefined): Ref {
    if (!m) return { n: 0 };
    if (this.opgelost) return { n: waardeMm(m, this.opgelost) };
    const e = m.e ? mmUitdrukking(m, this.bekend) : "";
    if (!e) return { n: m.v };
    return { naam: isNaam(e) ? e : this.hulpVoor(e) };
  }

  private hulpVoor(e: string): string {
    let n = this.perFormule.get(e);
    if (!n) {
      n = `${this.naam}_${this.hulp.length + 1}`;
      this.hulp.push([n, e]);
      this.perFormule.set(e, n);
    }
    return n;
  }

  maat(m: Maat | undefined): Ref {
    if (!m) return { n: 0 };
    if (this.opgelost) return { n: waardeVan(m, this.opgelost) };
    const e = m.e ? schoonUitdrukking(m.e) : "";
    if (!e) return { n: m.v };
    return { naam: isNaam(e) ? e : this.hulpVoor(e) };
  }

  /** Een afgeleide waarde: een getal als alles vast is, anders een verborgen formule. */
  afgeleid(invoer: Ref[], f: (...n: number[]) => number, formule: (...s: string[]) => string): Ref {
    if (invoer.every(isGetal)) return { n: f(...invoer.map((r) => (r as { n: number }).n)) };
    return { naam: this.hulpVoor(formule(...invoer.map(inFormule))) };
  }

  /** De naam van een verborgen formule (een kale naam blijft zichzelf). */
  formule(f: string): string {
    return isNaam(f) ? f : this.hulpVoor(f);
  }

  attr(r: Ref, decimalen = 2): string {
    return isGetal(r) ? fmt(r.n, decimalen) : `{{${r.naam}}}`;
  }

  /** `{{formule}}` in een tekst: een kale naam blijft staan, een formule krijgt een hulpvariabele. */
  plaatshouders(s: string): string {
    return s.replace(/\{\{([^{}]+)\}\}/g, (heel, binnen: string) => {
      const e = schoonUitdrukking(binnen);
      if (!e) return "";
      if (this.opgelost) {
        const w = this.opgelost(e);
        if (w !== undefined && Number.isFinite(w)) return kernGetal(w);
        return this.tekstVan?.(e) ?? heel;
      }
      return `{{${isNaam(e) ? e : this.hulpVoor(e)}}}`;
    });
  }
}

/** Een attribuutwaarde. Een apostrof zou de regel in de rekentaal splitsen. */
const esc = (s: string) =>
  s.replace(/&(?!#?\w+;)/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/'/g, "&#39;");

/**
 * Wat de rekenkern in een regel herschrijft, ook binnen een `@svg`-blok,
 * onschadelijk maken: `b.1` (wordt `b[1]`), `a_b,c` (wordt `a_b_c`), `x$`,
 * de apostrof (wisselt tekst en code) en ⟨⟩ (een invulplek van het lint).
 */
function kernVeilig(s: string): string {
  return s
    .replace(/'/g, "&#39;")
    .replace(/⟨/g, "&#10216;")
    .replace(/⟩/g, "&#10217;")
    .replace(/(?<=[\p{L}\p{N}_])\$/gu, "&#36;")
    .replace(/(?<=(?:^|[^\p{L}\p{N}_.])[\p{L}_][\p{L}\p{N}_]*)\.(?=[\p{L}\p{N}_(])/gu, "&#46;")
    .replace(/(?<=[\p{L}_][\p{L}\p{N}_]*_[\p{L}\p{N}_]*),(?=[\p{L}\p{N}_])/gu, "&#44;");
}

/**
 * Tekst en keuzes van een symbool: elk leesteken als tekenverwijzing, zoals
 * dxfNaarSvg.ts doet, zodat de rekenkern er geen rekentaal in leest (`a.b`,
 * `[1; 2]`, `'`). Alleen `{{naam}}` blijft staan; die vult de kern in.
 */
export function veilig(s: string): string {
  return s
    .split(/(\{\{\w+\}\})/g)
    .map((stuk, i) =>
      i % 2 === 1
        ? stuk
        : stuk
            .replace(/[\u0000-\u0008\u000b-\u001f￾￿]/g, "")
            .replace(/[^A-Za-z0-9 _\-\u0080-⟧⟪-�]/g, (c) => `&#${c.charCodeAt(0)};`),
    )
    .join("");
}

const termVan = (r: Ref): R.Term => (isGetal(r) ? R.getal(r.n) : R.naamTerm(r.naam));

/** Een symbool schrijft via deze brug: maten als term, termen als getal of `{{hulpvariabele}}`. */
function uitVoor(b: Bouwer, v: Vorm): R.Uit {
  return {
    maat: (k) => termVan(b.maat(v.p[k])),
    maatMm: (k) => termVan(b.maatMm(v.p[k])),
    schatting: (k) => (isMmSleutel(v, k) ? b.schattingMm(v.p[k]) : b.schatting(v.p[k])),
    getal: (t, decimalen = 2) => (R.isGetal(t) ? fmt(t.n, decimalen) : `{{${b.formule(R.tekst(t))}}}`),
    tekst: (s) => veilig(b.plaatshouders(s)),
  };
}

/**
 * Dezelfde brug voor de vingerafdruk van een symbool: een gekoppelde maat heet
 * hier `§h` in plaats van zijn hulpvariabele. Zo hangt de vingerafdruk af van de
 * geometrie en niet van de nummering in deze tekening.
 */
function vingerUit(b: Bouwer, v: Vorm): R.Uit {
  const m = (k: string): R.Term => (v.p[k]?.e ? R.naamTerm(`§${k}`) : R.getal(v.p[k]?.v ?? 0));
  return {
    maat: m,
    maatMm: m,
    schatting: (k) => (isMmSleutel(v, k) ? b.schattingMm(v.p[k]) : b.schatting(v.p[k])),
    getal: (t, decimalen = 2) => (R.isGetal(t) ? fmt(t.n, decimalen) : `{{${R.tekst(t)}}}`),
    tekst: (s) => s,
  };
}

/** Een korte vingerafdruk (FNV-1a), in letters en cijfers. */
function vinger(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Het id van een symbool: leesbaar begin, vingerafdruk van de geometrie en de
 * gekoppelde maten als `{{naam}}`. Na het invullen is het id dus gelijk als en
 * alleen als de geometrie gelijk is.
 */
function symboolId(v: Vorm, b: Bouwer): string {
  const kern = symboolDelen(v, vingerUit(b, v)).kern.join("\n");
  const links = [...new Set([...kern.matchAll(/§(\w+)/g)].map((m) => m[1]))];
  const achter = links.map((k) => `-${b.attr(isMmSleutel(v, k) ? b.maatMm(v.p[k]) : b.maat(v.p[k]))}`).join("");
  return `sym-${symboolSlug(v)}-${vinger(kern)}${achter}`;
}

/** Keuzes die altijd in de code staan, ook als ze de standaard zijn: zij zeggen wat het symbool is. */
const ALTIJD = ["familie", "maat", "schaal"];

/** De data-attributen van een exemplaar: alleen wat afwijkt van de standaard en de profieltabel. */
function symboolAttrs(v: Vorm, b: Bouwer): string {
  const def = symboolDef(v.sym);
  const attrs = [`data-symbool="${v.sym}"`];
  for (const [k, w] of Object.entries(v.o ?? {})) {
    if (w === def?.o[k] && !ALTIJD.includes(k)) continue;
    attrs.push(`data-${k}="${veilig(b.plaatshouders(w))}"`);
  }
  const rij = v.sym === "staal" ? profielRij(familie(v.o?.familie), v.o?.maat)?.maten : v.sym === "hout" ? leesHoutmaat(v.o?.maat) : null;
  for (const [k, m] of Object.entries(v.p)) {
    const mm = isMmSleutel(v, k);
    if (mm && !m.e && (rij as Record<string, number> | null | undefined)?.[k] === m.v) continue;
    attrs.push(`data-${k}="${b.attr(mm ? b.maatMm(m) : b.maat(m))}"`);
  }
  return attrs.join(" ");
}

const rondHoek = (x: number) => (Math.abs(x) < 1e-12 ? 0 : x);

/** Platte tekst als inhoud van `<text>`: de plaatshouders blijven heel. */
function tekstInhoud(s: string, opmaak: boolean): string {
  return s
    .split(/(\{\{[^{}]+\}\})/g)
    .map((stuk, i) => {
      if (i % 2 === 1) return stuk;
      const x = opmaak ? stuk : stuk.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return kernVeilig(x);
    })
    .join("");
}

function lijnStijl(v: Vorm, streep = v.streep): string[] {
  if (!v.lijn) return ["stroke:none"];
  const d = [`stroke:${v.lijn}`, `stroke-width:${fmt(v.dikte)}`];
  if (streep) d.push(`stroke-dasharray:${fmt(3 * v.dikte + 3)} ${fmt(2 * v.dikte + 2)}`);
  return d;
}

function stijl(d: string[], rest?: string): string {
  const alles = rest?.trim() ? [...d, rest.trim().replace(/;\s*$/, "")] : d;
  return ` style="${esc(alles.join("; "))}"`;
}

/** Stijl met koppelingen (`fill:{{k}}`): in de code een hulpvariabele, in het beeld de waarde. */
function stijlMet(b: Bouwer, d: string[], rest?: string): string {
  return stijl(d.map((x) => b.plaatshouders(x)), rest ? b.plaatshouders(rest) : rest);
}

function extra(v: Vorm, b: Bouwer): string {
  return (v.extra ?? []).map(([k, w]) => ` ${k}="${esc(b.plaatshouders(w))}"`).join("");
}

const kleurVan = (v: Vorm) => v.lijn ?? "#000000";

/** De afmetingen van een pijlpunt bij een lijndikte. */
export function pijlpunt(d: number) {
  const L = 7 + 3 * d;
  const W = 2.5 + 1.5 * d;
  // De punt steekt iets voorbij het eindpunt: zo dekt hij het rechte einde van een dikke lijn af.
  const T = (d * L) / (2 * W) + 0.3;
  return { L, W, T };
}

/** Een term in een afgeleide formule: een getal of een formule (samengesteld: tussen haakjes). */
type Term = { n: number } | { f: string };
const isN = (t: Term): t is { n: number } => "n" in t;
const tekst = (t: Term) => (isN(t) ? (t.n < 0 ? `(${fmt(t.n, 6)})` : fmt(t.n, 6)) : t.f);
const term = (r: Ref): Term => (isGetal(r) ? { n: r.n } : { f: r.naam });
const zonderHaakjes = (f: string) => (/^\((?:[^()]|\([^()]*\))*\)$/.test(f) ? f.slice(1, -1) : f);

/** e − a, met de vaste delen al uitgerekend. */
function verschil(e: Term, a: Term): Term {
  if (isN(e) && isN(a)) return { n: e.n - a.n };
  if (isN(a) && a.n === 0) return e;
  return { f: `(${tekst(e)} - ${tekst(a)})` };
}

/**
 * Eenheidsvector langs een lijn en de loodrechte, voor
 * `matrix(ux uy −uy ux x y)`. Liggen beide eindpunten vast, dan zijn het
 * getallen; anders rekenen ze verborgen uit, zo kort als het kan: een
 * horizontale lijn heeft genoeg aan `abs()`.
 */
function richting(b: Bouwer, X1: Ref, Y1: Ref, X2: Ref, Y2: Ref) {
  const dx = verschil(term(X2), term(X1));
  const dy = verschil(term(Y2), term(Y1));
  let lengte: Term;
  if (isN(dx) && isN(dy)) lengte = { n: Math.hypot(dx.n, dy.n) || 1 };
  else if (isN(dy) && dy.n === 0) lengte = { f: `abs(${zonderHaakjes(tekst(dx))})` };
  else if (isN(dx) && dx.n === 0) lengte = { f: `abs(${zonderHaakjes(tekst(dy))})` };
  else lengte = { f: b.formule(`sqrt(${zonderHaakjes(tekst(dx))}^2 + ${zonderHaakjes(tekst(dy))}^2)`) };
  const deel = (t: Term): Ref =>
    isN(t) && t.n === 0 ? { n: 0 } : isN(t) && isN(lengte) ? { n: t.n / lengte.n } : { naam: b.formule(`${tekst(t)}/${tekst(lengte)}`) };
  const ux = deel(dx);
  const uy = deel(dy);
  const nuy: Ref = isGetal(uy) ? { n: -uy.n } : { naam: b.formule(`-${uy.naam}`) };
  const matrix = (x: Ref, y: Ref) =>
    `matrix(${b.attr(ux, 4)} ${b.attr(uy, 4)} ${b.attr(nuy, 4)} ${b.attr(ux, 4)} ${b.attr(x)} ${b.attr(y)})`;
  return { matrix };
}

/** De regels van één element. */
function elementRegels(el: Element, b: Bouwer): string[] {
  if (!isVorm(el)) return [kernVeilig(b.plaatshouders(el.markup))];
  const v = el;
  const p = (k: string) => b.attr(b.maat(v.p[k]));
  const x = extra(v, b);
  const vul = `fill:${v.vulling ?? "none"}`;
  switch (v.soort) {
    case "lijn":
      return [`<line x1="${p("x1")}" y1="${p("y1")}" x2="${p("x2")}" y2="${p("y2")}"${x}${stijlMet(b, lijnStijl(v), v.stijlRest)}/>`];
    case "rechthoek":
      return [`<rect x="${p("x")}" y="${p("y")}" width="${p("w")}" height="${p("h")}"${x}${stijlMet(b, [vul, ...lijnStijl(v)], v.stijlRest)}/>`];
    case "cirkel":
      return [`<circle cx="${p("cx")}" cy="${p("cy")}" r="${p("r")}"${x}${stijlMet(b, [vul, ...lijnStijl(v)], v.stijlRest)}/>`];
    case "polylijn": {
      const punten: string[] = [];
      for (let i = 0; v.p[`x${i}`]; i++) punten.push(`${p(`x${i}`)},${p(`y${i}`)}`);
      const tag = v.gesloten ? "polygon" : "polyline";
      return [`<${tag} points="${punten.join(" ")}"${x}${stijlMet(b, [vul, ...lijnStijl(v)], v.stijlRest)}/>`];
    }
    case "tekst": {
      const g = v.grootte ? ` font-size="${fmt(v.grootte)}"` : "";
      const a = v.anker && v.anker !== "start" ? ` text-anchor="${v.anker}"` : "";
      const inhoud = tekstInhoud(b.plaatshouders(v.tekst ?? ""), !!v.opmaak);
      return [`<text x="${p("x")}" y="${p("y")}"${g}${a}${x}${stijlMet(b, [`fill:${kleurVan(v)}`], v.stijlRest)}>${inhoud}</text>`];
    }
    case "pijl": {
      const [X1, Y1, X2, Y2] = ["x1", "y1", "x2", "y2"].map((k) => b.maat(v.p[k]));
      const { matrix } = richting(b, X1, Y1, X2, Y2);
      const { L, W, T } = pijlpunt(v.dikte);
      return [
        `<g data-vorm="pijl"${x}>`,
        `  <line x1="${b.attr(X1)}" y1="${b.attr(Y1)}" x2="${b.attr(X2)}" y2="${b.attr(Y2)}"${stijlMet(b, lijnStijl(v), v.stijlRest)}/>`,
        `  <polygon points="${fmt(T)},0 ${fmt(T - L)},${fmt(-W)} ${fmt(T - L)},${fmt(W)}" transform="${matrix(X2, Y2)}"${stijlMet(b, [`fill:${kleurVan(v)}`, "stroke:none"])}/>`,
        `</g>`,
      ];
    }
    case "boog": {
      const u = uitVoor(b, v);
      const CX = u.maat("cx"), CY = u.maat("cy"), RR = u.maat("r");
      const a1 = waardeVan(v.p.a1);
      const a2 = boogEind(a1, waardeVan(v.p.a2));
      const op = (a: number): [R.Term, R.Term] => {
        const h = (a * Math.PI) / 180;
        return [
          R.plus(CX, R.maal(RR, R.getal(rondHoek(Math.cos(h))))),
          R.plus(CY, R.maal(RR, R.getal(rondHoek(Math.sin(h))))),
        ];
      };
      const [x1, y1] = op(a1);
      const [x2, y2] = op(a2);
      const g = (t: R.Term) => u.getal(t);
      const data = `data-vorm="boog" data-cx="${p("cx")}" data-cy="${p("cy")}" data-r="${p("r")}" data-a1="${fmt(a1)}" data-a2="${fmt(waardeVan(v.p.a2))}"`;
      const d = `M ${g(x1)} ${g(y1)} A ${g(RR)} ${g(RR)} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${g(x2)} ${g(y2)}`;
      return [`<path ${data} d="${d}"${x}${stijlMet(b, ["fill:none", ...lijnStijl(v)], v.stijlRest)}/>`];
    }
    case "symbool": {
      const w = normaliseer(v);
      const delen = symboolDelen(w, uitVoor(b, w));
      const g = w.grootte ? ` font-size="${fmt(w.grootte)}"` : "";
      const st = stijlMet(b, [`fill:${w.vulling ?? "none"}`, ...lijnStijl(w)], w.stijlRest);
      if (b.isBeeld) {
        // In de editor staat elk exemplaar voluit: daar is geen <defs> nodig.
        return [
          `<g${st}>`,
          `<g transform="${delen.transform}">`,
          ...delen.kern,
          `</g>`,
          ...delen.los,
          `</g>`,
        ];
      }
      const id = symboolId(w, b);
      if (!b.defs.has(id)) b.defs.set(id, delen.kern);
      return [
        `<use href="#${id}" ${symboolAttrs(w, b)} transform="${delen.transform}"${g}${x}${st}/>`,
        ...delen.los.map((r) => r.replace(/^<text /, `<text data-bij="1" `)),
      ];
    }
    case "maat": {
      if (!v.tik) return maatRegels(v, b, x);
      const [X1, Y1, X2, Y2] = ["x1", "y1", "x2", "y2"].map((k) => b.maat(v.p[k]));
      const { matrix } = richting(b, X1, Y1, X2, Y2);
      const MX = b.afgeleid([X1, X2], (a, c) => (a + c) / 2, (a, c) => `(${a} + ${c})/2`);
      const MY = b.afgeleid([Y1, Y2], (a, c) => (a + c) / 2, (a, c) => `(${a} + ${c})/2`);
      const s = fmt(3 + v.dikte);
      const tik = (X: Ref, Y: Ref) =>
        `  <line x1="-${s}" y1="${s}" x2="${s}" y2="-${s}" transform="${matrix(X, Y)}"${stijlMet(b, lijnStijl(v, false))}/>`;
      const g = v.grootte ? ` font-size="${fmt(v.grootte)}"` : "";
      const inhoud = tekstInhoud(b.plaatshouders(v.tekst ?? ""), !!v.opmaak);
      return [
        `<g data-vorm="maat"${x}>`,
        `  <line x1="${b.attr(X1)}" y1="${b.attr(Y1)}" x2="${b.attr(X2)}" y2="${b.attr(Y2)}"${stijlMet(b, lijnStijl(v), v.stijlRest)}/>`,
        tik(X1, Y1),
        tik(X2, Y2),
        `  <text y="${fmt(-(4 + v.dikte))}" text-anchor="middle"${g} transform="${matrix(MX, MY)}"${stijlMet(b, [`fill:${kleurVan(v)}`])}>${inhoud}</text>`,
        `</g>`,
      ];
    }
  }
}

/**
 * Een maatlijn: de twee gemeten punten en een loodrechte afstand. In zijn eigen
 * assenstelsel (x langs de maat, y loodrecht) zijn het een paar korte regels:
 * twee hulplijnen met een gat bij de constructie, de maatlijn, twee rondjes en
 * de tekst aan de buitenkant.
 */
function maatRegels(v: Vorm, b: Bouwer, x: string): string[] {
  const g = (t: R.Term, d = 2) => (R.isGetal(t) ? fmt(t.n, d) : `{{${b.formule(R.tekst(t))}}}`);
  const [X1, Y1, X2, Y2] = ["x1", "y1", "x2", "y2"].map((k) => termVan(b.maat(v.p[k])));
  const af = termVan(b.maat(v.p.offset));
  const dx = R.min(X2, X1), dy = R.min(Y2, Y1);
  const L = R.lengte(dx, dy);
  const leeg = R.isGetal(L) && L.n < 1e-9;
  const ux = leeg ? R.getal(1) : R.deel(dx, L), uy = leeg ? R.getal(0) : R.deel(dy, L);
  const tf = `matrix(${g(ux, 4)} ${g(uy, 4)} ${g(R.neg(uy), 4)} ${g(ux, 4)} ${g(X1)} ${g(Y1)})`;

  const afN = b.schatting(v.p.offset);
  const s = afN < 0 ? -1 : 1;
  const gat = Number(v.o?.gat) || MAAT_GAT;
  const voorbij = 3;
  const dun = `stroke-width:${fmt(Math.max(0.35, v.dikte * 0.6))}`;
  const r = fmt(1.5 + v.dikte * 0.75);
  const regels: string[] = [];
  if (Math.abs(afN) > gat + 1) {
    const y0 = fmt(s * gat), y1 = g(R.plus(af, R.getal(s * voorbij)));
    regels.push(`  <line x1="0" y1="${y0}" x2="0" y2="${y1}" style="${dun}"/>`);
    regels.push(`  <line x1="${g(L)}" y1="${y0}" x2="${g(L)}" y2="${y1}" style="${dun}"/>`);
  }
  regels.push(`  <line x1="0" y1="${g(af)}" x2="${g(L)}" y2="${g(af)}"/>`);
  regels.push(`  <circle cx="0" cy="${g(af)}" r="${r}" style="stroke:none"/>`);
  regels.push(`  <circle cx="${g(L)}" cy="${g(af)}" r="${r}" style="stroke:none"/>`);

  const grootte = v.grootte ?? 12;
  // Een maat die van rechts naar links loopt, leest ondersteboven: de tekst draait dan om.
  const dxN = b.schatting(v.p.x2) - b.schatting(v.p.x1);
  const dyN = b.schatting(v.p.y2) - b.schatting(v.p.y1);
  const om = dxN < -1e-9 || (Math.abs(dxN) <= 1e-9 && dyN > 1e-9);
  const buiten = s > 0 ? 4 + (om ? 0 : grootte * 0.8) : -4 - (om ? grootte * 0.8 : 0);
  const mx = R.maal(L, R.getal(0.5));
  const ty = R.plus(af, R.getal(buiten));
  const draai = om ? ` transform="rotate(180 ${g(mx)} ${g(ty)})"` : "";
  regels.push(`  <text x="${g(mx)}" y="${g(ty)}" text-anchor="middle"${draai} style="stroke:none">${tekstInhoud(b.plaatshouders(v.tekst ?? ""), !!v.opmaak)}</text>`);

  const data = ["x1", "y1", "x2", "y2", "offset"].map((k) => `data-${k}="${b.attr(b.maat(v.p[k]))}"`).join(" ");
  const gatAttr = v.o?.gat ? ` data-gat="${veilig(v.o.gat)}"` : "";
  const fs = ` font-size="${fmt(grootte)}"`;
  const kleurLijn = v.lijn ?? "#000000";
  return [
    `<g data-vorm="maat" ${data}${gatAttr}${fs} transform="${tf}"${x}${stijlMet(b, [`fill:${kleurLijn}`, ...lijnStijl(v)], v.stijlRest)}>`,
    ...regels,
    `</g>`,
  ];
}

function wortelOpen(t: Tekening, b: Bouwer): string {
  const W = b.maat(t.breed);
  const H = b.maat(t.hoog);
  const attrs = [
    `data-tekening="${t.naam}"`,
    `viewBox="${fmt(t.x0)} ${fmt(t.y0)} ${b.attr(W)} ${b.attr(H)}"`,
    `xmlns="http://www.w3.org/2000/svg"`,
  ];
  if (t.eigenStijl) attrs.push(`style="width:100%; max-width:${b.attr(W)}px;"`);
  for (const [k, w] of t.wortel) attrs.push(`${k}="${esc(b.plaatshouders(w))}"`);
  return `<svg ${attrs.join(" ")}>`;
}

export interface SchrijfOpties {
  /** Het blok komt in een verborgen deel: geen `#hide`/`#show` om de hulpregels. */
  verborgen: boolean;
  /** Toelichting boven de hulpregels (zonder apostrof). */
  kop: string;
  /**
   * Wat het blad nu voor een koppeling geeft. Een symbool tekent sommige
   * dingen uit de waarde en niet uit een formule, zoals het aantal pijlen van
   * een q-last; met een gekoppelde lengte telt dan deze waarde. En een
   * profielmaat met eenheid rekent om naar een kaal getal in mm.
   */
  bekend?: Opgelost;
}

/** De tekening als rekentaal: eventueel hulpregels, dan het `@svg`-blok. */
export function schrijfTekening(t: Tekening, opties: SchrijfOpties): string {
  const b = new Bouwer(t.naam, null, undefined, opties.bekend);
  const open = wortelOpen(t, b);
  const inhoud: string[] = [];
  for (const el of t.elementen) for (const r of elementRegels(el, b)) inhoud.push(`  ${r}`);
  const svg: string[] = [open];
  if (b.defs.size > 0) {
    svg.push("  <defs>");
    for (const [id, kern] of b.defs) {
      svg.push(`    <symbol id="${id}" overflow="visible">`, ...kern.map((r) => `      ${r}`), "    </symbol>");
    }
    svg.push("  </defs>");
  }
  svg.push(...inhoud, "</svg>");

  const regels: string[] = [];
  if (b.hulp.length > 0) {
    if (!opties.verborgen) regels.push("#hide");
    regels.push(`'${opties.kop.replace(/'/g, "")}`);
    for (const [naam, e] of b.hulp) regels.push(`${naam} = ${e}`);
    if (!opties.verborgen) regels.push("#show");
  }
  regels.push("@svg", ...svg, "@end");
  return regels.join("\n");
}

/** Markup van één element zoals de uitwerking het straks tekent, voor het beeld van de editor. */
export function beeldVan(
  el: Element,
  naam: string,
  opgelost: Opgelost,
  tekstVan?: (e: string) => string | undefined,
): string {
  return elementRegels(el, new Bouwer(naam, opgelost, tekstVan)).join("");
}

/**
 * Een klein voorbeeld van een profiel of balk, voor de keuzelijst en het menu:
 * een eigen `<svg>`, passend gemaakt op zijn vak, zonder hartlijnen en label.
 */
export function duimVan(sym: Extract<SymboolId, "staal" | "hout">, o: Record<string, string>): string {
  const keuze = { ...o, schaal: "1", hartlijn: "0", label: "0", hoek: "0", spiegel: "0", tekst: "" };
  const aanzicht = sym === "staal" && !!o.aanzicht && o.aanzicht !== "doorsnede";
  const v0 = nieuwSymbool(sym, aanzicht ? { x1: 0, y1: 0, x2: 1, y2: 0 } : { x: 0, y: 0 }, STANDAARD_STIJL, keuze);
  const k = 96 / 25.4;
  const breed = (v0.p.b?.v ?? 100) * k, hoog = (v0.p.h?.v ?? 100) * k;
  let vak: number;
  let v = v0;
  if (aanzicht) {
    const band = o.aanzicht === "boven" ? breed : hoog;
    const L = 2.4 * band;
    v = { ...v0, p: { ...v0.p, x1: { v: -L / 2 }, x2: { v: L / 2 } } };
    vak = 1.1 * L;
  } else {
    vak = 1.15 * Math.max(breed, hoog);
  }
  // Een lijn van ongeveer één beeldpunt in een vak van 32 px.
  v = { ...v, dikte: vak / 32 };
  const beeld = beeldVan(v, "duim", (() => undefined) as Opgelost);
  return `<svg viewBox="${fmt(-vak / 2)} ${fmt(-vak / 2)} ${fmt(vak)} ${fmt(vak)}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${beeld}</svg>`;
}

// ─── Lezen ───────────────────────────────────────────────────────────

/** De hulpvariabelen (naam → formule) vlak boven het blok. */
function leesHulp(regels: string[], naam: string | null): Map<string, string> {
  const uit = new Map<string, string>();
  if (!naam) return uit;
  const re = new RegExp(`^(${naam}_\\d+)\\s*=\\s*(.+)$`);
  for (const r of regels) {
    const m = re.exec(r.trim());
    if (m) uit.set(m[1], m[2].split("'")[0].trim());
  }
  return uit;
}

/** `{{tek1_3}}` terug naar `{{formule}}`. */
const terug = (s: string, hulp: Map<string, string>) =>
  s.replace(/\{\{(\w+)\}\}/g, (heel, n: string) => (hulp.has(n) ? `{{${hulp.get(n)}}}` : heel));

function leesMaat(w: string | null, hulp: Map<string, string>, terugval = 0): Maat | null {
  const t = (w ?? "").trim();
  if (t === "") return { v: 0 };
  const n = Number(t);
  if (Number.isFinite(n)) return { v: n };
  const m = /^\{\{(\w+)\}\}$/.exec(t);
  if (m) return { v: terugval, e: hulp.get(m[1]) ?? m[1] };
  return null;
}

/** De stijl van een element: `style` en de losse presentatie-attributen. */
function leesStijl(el: globalThis.Element) {
  const decl = new Map<string, string>();
  const rest: string[] = [];
  const BEHEERD = ["fill", "stroke", "stroke-width", "stroke-dasharray", "font-size", "text-anchor"];
  for (const d of (el.getAttribute("style") ?? "").split(";")) {
    const i = d.indexOf(":");
    if (i < 0) continue;
    const k = d.slice(0, i).trim().toLowerCase();
    const w = d.slice(i + 1).trim();
    if (BEHEERD.includes(k)) decl.set(k, w);
    else if (k) rest.push(`${k}:${w}`);
  }
  for (const k of BEHEERD) {
    const w = el.getAttribute(k);
    if (w !== null && !decl.has(k)) decl.set(k, w.trim());
  }
  return { decl, rest };
}

const kleur = (s: string | undefined, standaard: string | null): string | null =>
  s === undefined ? standaard : s === "none" || s === "transparent" ? null : s;

/** Attributen die het model zelf beheert, per tag. */
const EIGEN: Record<string, string[]> = {
  line: ["x1", "y1", "x2", "y2"],
  rect: ["x", "y", "width", "height"],
  circle: ["cx", "cy", "r"],
  polyline: ["points"],
  polygon: ["points"],
  text: ["x", "y"],
  g: ["data-vorm"],
};
const STIJL_ATTR = ["style", "fill", "stroke", "stroke-width", "stroke-dasharray", "font-size", "text-anchor"];

function extraAttrs(el: globalThis.Element, hulp: Map<string, string>): [string, string][] {
  const eigen = EIGEN[el.tagName.toLowerCase()] ?? [];
  const uit: [string, string][] = [];
  for (const a of Array.from(el.attributes)) {
    if (eigen.includes(a.name) || STIJL_ATTR.includes(a.name)) continue;
    uit.push([a.name, terug(a.value, hulp)]);
  }
  return uit;
}

function lijnVan(decl: Map<string, string>, rest: string[], v: Partial<Vorm>) {
  const dw = decl.get("stroke-width");
  const d = dw === undefined ? 1 : parseFloat(dw);
  if (dw !== undefined && !Number.isFinite(d)) rest.push(`stroke-width:${dw}`);
  const da = decl.get("stroke-dasharray");
  v.lijn = kleur(decl.get("stroke"), null);
  v.dikte = Number.isFinite(d) ? d : 1;
  v.streep = da !== undefined && da !== "none";
}

function leesTekst(el: globalThis.Element, hulp: Map<string, string>): { tekst: string; opmaak: boolean } {
  const opmaak = el.children.length > 0;
  return { tekst: terug(opmaak ? el.innerHTML : el.textContent ?? "", hulp), opmaak };
}

function grootteVan(decl: Map<string, string>): number | undefined {
  const g = parseFloat(decl.get("font-size") ?? "");
  return Number.isFinite(g) ? g : undefined;
}

/** Attributen buiten de data- en stijlattributen: ze gaan ongewijzigd terug. */
const overigeAttrs = (el: globalThis.Element, hulp: Map<string, string>, ook: string[] = []): [string, string][] =>
  Array.from(el.attributes)
    .filter((a) => !a.name.startsWith("data-") && !STIJL_ATTR.includes(a.name) && !ook.includes(a.name))
    .map((a) => [a.name, terug(a.value, hulp)] as [string, string]);

/** Een parametrisch symbool: de parameters staan in de data-attributen, de lijnen tekent het opnieuw. */
function leesSymbool(el: globalThis.Element, hulp: Map<string, string>): Vorm | null {
  const def = symboolDef(el.getAttribute("data-symbool") ?? undefined);
  if (!def) return null;
  // Een profiel in aanzicht staat op twee punten, ook al is staal standaard een punt.
  const plaatsing = el.hasAttribute("data-x1") ? "lijn" : def.plaatsing;
  const plek = { punt: ["x", "y"], lijn: ["x1", "y1", "x2", "y2"], vak: ["x", "y", "w", "h"] }[plaatsing];
  const maten = [...plek, ...(def.maten ?? [])];
  const p: Record<string, Maat> = {};
  const o: Record<string, string> = { ...def.o };
  for (const a of Array.from(el.attributes)) {
    if (!a.name.startsWith("data-") || a.name === "data-symbool") continue;
    const k = a.name.slice(5);
    if (maten.includes(k)) {
      const m = leesMaat(a.value, hulp);
      if (!m) return null;
      if (m.e && !plek.includes(k)) {
        const kaal = zonderMm(m.e);
        p[k] = kaal !== m.e ? { ...m, e: kaal, mm: true } : m;
      } else p[k] = m;
    } else o[k] = terug(a.value, hulp);
  }
  if (plek.some((k) => !p[k])) return null;
  const { decl, rest } = leesStijl(el);
  const v: Partial<Vorm> = { id: nieuwId(), soort: "symbool", sym: def.id, p, o };
  lijnVan(decl, rest, v);
  v.vulling = kleur(decl.get("fill"), null);
  v.grootte = grootteVan(decl);
  v.extra = overigeAttrs(el, hulp, ["href", "transform"]);
  v.stijlRest = rest.map((r) => terug(r, hulp)).join("; ");
  return normaliseer(v as Vorm);
}

/** Een maatlijn in de nieuwe vorm: alles staat in de data-attributen, de tekst in zijn `<text>`. */
function leesMaatlijn(el: globalThis.Element, hulp: Map<string, string>): Vorm | null {
  const p: Record<string, Maat> = {};
  for (const k of ["x1", "y1", "x2", "y2", "offset"]) {
    const m = leesMaat(el.getAttribute(`data-${k}`), hulp);
    if (!m) return null;
    p[k] = m;
  }
  const { decl, rest } = leesStijl(el);
  const v: Partial<Vorm> = { id: nieuwId(), soort: "maat", p, vulling: null };
  lijnVan(decl, rest, v);
  // De vulling van de groep is de kleur van rondjes en tekst: die volgt de lijn.
  v.extra = overigeAttrs(el, hulp, ["transform"]);
  v.stijlRest = rest.map((r) => terug(r, hulp)).join("; ");
  v.grootte = grootteVan(decl);
  const gat = el.getAttribute("data-gat");
  if (gat) v.o = { gat };
  const tekst = el.querySelector("text");
  if (tekst) Object.assign(v, leesTekst(tekst, hulp));
  else v.tekst = "";
  return v as Vorm;
}

/** Een boog: middelpunt, straal en hoeken staan in de data-attributen. */
function leesBoog(el: globalThis.Element, hulp: Map<string, string>): Vorm | null {
  const p: Record<string, Maat> = {};
  for (const k of ["cx", "cy", "r", "a1", "a2"]) {
    const m = leesMaat(el.getAttribute(`data-${k}`), hulp);
    if (!m) return null;
    p[k] = m;
  }
  const { decl, rest } = leesStijl(el);
  const v: Partial<Vorm> = { id: nieuwId(), soort: "boog", p, vulling: null };
  lijnVan(decl, rest, v);
  if (decl.has("fill") && decl.get("fill") !== "none") rest.push(`fill:${decl.get("fill")}`);
  v.extra = overigeAttrs(el, hulp, ["d"]);
  v.stijlRest = rest.map((r) => terug(r, hulp)).join("; ");
  return v as Vorm;
}

/** Eén element uit het blok; null: de editor kent het niet en het blijft zoals het was. */
function leesElement(el: globalThis.Element, hulp: Map<string, string>): Vorm | null {
  const tag = el.tagName.toLowerCase();
  // Een exemplaar: <use data-symbool>. De oudere vorm <g data-symbool> leest hetzelfde.
  if ((tag === "use" || tag === "g") && el.hasAttribute("data-symbool")) return leesSymbool(el, hulp);
  if (tag === "g" && el.getAttribute("data-vorm") === "maat" && el.hasAttribute("data-offset")) return leesMaatlijn(el, hulp);
  if (tag === "path" && el.getAttribute("data-vorm") === "boog") return leesBoog(el, hulp);
  const maten = (paren: [string, string][]): Record<string, Maat> | null => {
    const p: Record<string, Maat> = {};
    for (const [sleutel, attr] of paren) {
      const m = leesMaat(el.getAttribute(attr), hulp);
      if (!m) return null;
      p[sleutel] = m;
    }
    return p;
  };
  const { decl, rest } = leesStijl(el);
  const v: Partial<Vorm> = { id: nieuwId() };

  if (tag === "g") {
    const soort = el.getAttribute("data-vorm");
    if (soort !== "pijl" && soort !== "maat") return null;
    const lijn = el.querySelector("line");
    if (!lijn) return null;
    const p: Record<string, Maat> = {};
    for (const k of ["x1", "y1", "x2", "y2"]) {
      const m = leesMaat(lijn.getAttribute(k), hulp);
      if (!m) return null;
      p[k] = m;
    }
    const ls = leesStijl(lijn);
    lijnVan(ls.decl, ls.rest, v);
    Object.assign(v, { soort, p, vulling: null, extra: extraAttrs(el, hulp), stijlRest: ls.rest.join("; ") });
    if (soort === "maat") {
      // Geen afstand: de oude vorm met schuine tikken. Hij blijft zo tot je de maat wijzigt.
      v.tik = true;
      const tekst = el.querySelector("text");
      if (tekst) {
        Object.assign(v, leesTekst(tekst, hulp));
        v.grootte = grootteVan(leesStijl(tekst).decl);
        const ts = leesStijl(tekst).decl.get("fill");
        if (ts && !v.lijn) v.lijn = ts;
      } else v.tekst = "";
    }
    return v as Vorm;
  }

  let p: Record<string, Maat> | null = null;
  let soort: Vorm["soort"] | null = null;
  switch (tag) {
    case "line":
      soort = "lijn";
      p = maten([["x1", "x1"], ["y1", "y1"], ["x2", "x2"], ["y2", "y2"]]);
      break;
    case "rect":
      soort = "rechthoek";
      p = maten([["x", "x"], ["y", "y"], ["w", "width"], ["h", "height"]]);
      break;
    case "circle":
      soort = "cirkel";
      p = maten([["cx", "cx"], ["cy", "cy"], ["r", "r"]]);
      break;
    case "polyline":
    case "polygon": {
      soort = "polylijn";
      const delen = (el.getAttribute("points") ?? "").trim().split(/[\s,]+/).filter(Boolean);
      if (delen.length < 4 || delen.length % 2 === 1) return null;
      p = {};
      for (let i = 0; i < delen.length; i++) {
        const m = leesMaat(delen[i], hulp);
        if (!m) return null;
        p[`${i % 2 === 0 ? "x" : "y"}${Math.floor(i / 2)}`] = m;
      }
      v.gesloten = tag === "polygon";
      break;
    }
    case "text":
      soort = "tekst";
      p = maten([["x", "x"], ["y", "y"]]);
      break;
  }
  if (!soort || !p) return null;

  v.soort = soort;
  v.p = p;
  v.extra = extraAttrs(el, hulp);
  if (soort === "tekst") {
    Object.assign(v, leesTekst(el, hulp));
    v.lijn = kleur(decl.get("fill"), "#000000") ?? "#000000";
    v.dikte = 1;
    v.vulling = null;
    v.streep = false;
    v.grootte = grootteVan(decl);
    const a = decl.get("text-anchor");
    v.anker = a === "middle" || a === "end" ? (a as Anker) : "start";
    // Een lijn om tekst bewaart de editor niet zelf: die gaat mee in de rest.
    for (const k of ["stroke", "stroke-width", "stroke-dasharray"]) if (decl.has(k)) rest.push(`${k}:${decl.get(k)}`);
  } else {
    lijnVan(decl, rest, v);
    v.vulling = soort === "lijn" ? null : kleur(decl.get("fill"), "#000000");
    if (soort === "lijn" && decl.has("fill")) rest.push(`fill:${decl.get("fill")}`);
    for (const k of ["font-size", "text-anchor"]) if (decl.has(k)) rest.push(`${k}:${decl.get(k)}`);
  }
  v.stijlRest = rest.map((r) => terug(r, hulp)).join("; ");
  return v as Vorm;
}

export type LeesUitkomst = { tekening: Tekening } | { fout: "geenSvg" };

/** Leest een blok (eventueel met hulpregels erboven) in als tekening. */
export function leesTekening(tekst: string, reserveNaam: string): LeesUitkomst {
  const regels = tekst.split("\n");
  const i = regels.findIndex((r) => SVG_BEGIN.test(r.trim()));
  const j = regels.findIndex((r, k) => k > i && SVG_EIND.test(r.trim()));
  const inhoud = regels.slice(i + 1, j < 0 ? undefined : j).join("\n");
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${inhoud}</body>`, "text/html");
  const svg = doc.body.querySelector("svg");
  if (!svg) return { fout: "geenSvg" };

  const naam = svg.getAttribute("data-tekening") ?? reserveNaam;
  const hulp = leesHulp(regels.slice(0, Math.max(i, 0)), svg.getAttribute("data-tekening"));
  const t = legeTekening(naam);
  t.eigenStijl = svg.hasAttribute("data-tekening") || !svg.hasAttribute("style");

  const vak = (svg.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).filter(Boolean);
  const bw = parseFloat(svg.getAttribute("width") ?? "");
  const bh = parseFloat(svg.getAttribute("height") ?? "");
  const terugB = Number.isFinite(bw) ? bw : STANDAARD_BREED;
  const terugH = Number.isFinite(bh) ? bh : STANDAARD_HOOG;
  if (vak.length === 4) {
    t.x0 = Number(vak[0]) || 0;
    t.y0 = Number(vak[1]) || 0;
    t.breed = leesMaat(vak[2], hulp, terugB) ?? { v: terugB };
    t.hoog = leesMaat(vak[3], hulp, terugH) ?? { v: terugH };
  } else {
    t.breed = { v: terugB };
    t.hoog = { v: terugH };
  }
  const weg = ["viewbox", "xmlns", "data-tekening", ...(t.eigenStijl ? ["style"] : [])];
  t.wortel = Array.from(svg.attributes)
    .filter((a) => !weg.includes(a.name.toLowerCase()))
    .map((a) => [a.name, terug(a.value, hulp)] as [string, string]);

  for (const knoop of Array.from(svg.childNodes)) {
    if (knoop.nodeType === Node.COMMENT_NODE) {
      t.elementen.push({ id: nieuwId(), soort: "vast", markup: `<!--${knoop.textContent ?? ""}-->` });
    } else if (knoop.nodeType === Node.ELEMENT_NODE) {
      const el = knoop as globalThis.Element;
      const naam = el.tagName.toLowerCase();
      // De labels van een symbool maakt het opnieuw.
      if (naam === "text" && el.hasAttribute("data-bij")) continue;
      if (naam === "defs") {
        // Onze symbolen komen opnieuw uit de exemplaren; iets anders in <defs> blijft staan.
        const anders = Array.from(el.children).filter(
          (c) => !(c.tagName.toLowerCase() === "symbol" && (c.getAttribute("id") ?? "").startsWith("sym-")),
        );
        if (anders.length > 0) {
          t.elementen.push({ id: nieuwId(), soort: "vast", markup: terug(`<defs>${anders.map((c) => c.outerHTML).join("")}</defs>`, hulp) });
        }
        continue;
      }
      const vorm = leesElement(el, hulp);
      t.elementen.push(vorm ?? { id: nieuwId(), soort: "vast", markup: terug(el.outerHTML, hulp) });
    }
  }
  return { tekening: t };
}
