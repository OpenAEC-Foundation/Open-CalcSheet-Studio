/*
 * Een DXF-tekening als SVG, voor een `@svg … @end`-blok in het blad.
 *
 * Eigen lezer van het tekstformaat (ASCII-DXF), zonder bibliotheek. Wat er
 * getekend wordt:
 *
 *   lijnen      LINE, LWPOLYLINE en POLYLINE (bulges worden bogen, breedte
 *               wordt lijndikte of een gevuld vlak), CIRCLE, ARC, ELLIPSE,
 *               SPLINE (benaderd door een veelhoek), LEADER, 3DFACE,
 *               de lijnen van een MULTILEADER
 *   vlakken     SOLID/TRACE; HATCH: een volle arcering gevuld, een
 *               patroonarcering als lichte tint over het vlak (zonder patroon)
 *   tekst       TEXT, ATTRIB, MTEXT (opmaakcodes weg, \P als nieuwe regel,
 *               afbreken op de kaderbreedte), de tekst van een MULTILEADER
 *   blokken     INSERT met schaal, draaiing, spiegeling en rijen/kolommen;
 *               DIMENSION en tabellen via hun anonieme blok
 *   lagen       kleur, lijndikte en lijntype van de laag; lagen die uit,
 *               bevroren of niet-plotbaar zijn blijven weg
 *
 * Coördinaten: de y-as wordt omgeklapt (tekening y omhoog, SVG y omlaag) en de
 * viewBox sluit om de tekening, met 1 % rand. Getallen worden afgerond op
 * ongeveer 1/4000 van de tekeningmaat; paden zijn relatief en per stijl
 * samengevoegd, zodat de SVG klein blijft.
 *
 * Kleuren: wit (en bijna-wit) wordt zwart op het papier; felle lichte kleuren
 * (geel, cyaan) worden donkerder, zodat ze op wit leesbaar blijven.
 *
 * Lijndikte: een maat op papier (mm, standaard 0,18), dus in beeldpunten met
 * `vector-effect="non-scaling-stroke"`: een kleiner getoonde of afgedrukte
 * tekening houdt dezelfde lijndikte, zoals bij plotten. Tekst en de breedte van
 * een brede polylijn zijn tekeningmaten en schalen wel mee.
 *
 * Het blad leest het `@svg`-blok voor een deel als rekentaal: tekst buiten
 * aanhalingstekens kan daar worden herschreven (`a.b`, `[1; 2]`, `'`). Daarom
 * staan alle leestekens in tekstinhoud als tekenverwijzing (`&#46;`), en staat
 * elk element op één regel, met zijn attributen heel.
 */

export type DxfFoutCode = "binair" | "dwg" | "ongeldig" | "leeg" | "teGroot";

/** Een tekening die niet om te zetten is; `code` zegt waarom. */
export class DxfFout extends Error {
  readonly code: DxfFoutCode;
  constructor(code: DxfFoutCode) {
    super(`DXF: ${code}`);
    this.name = "DxfFout";
    this.code = code;
  }
}

export interface DxfSvg {
  /** De `<svg>…</svg>`, één element per regel. */
  svg: string;
  /** Getekende elementen, na het uitvouwen van blokken. */
  elementen: number;
  /** Maat van de tekening in tekeneenheden. */
  breedte: number;
  hoogte: number;
  /** Het tekenpunt op de linkerbovenhoek van de viewBox: SVG (x, y) is tekening (ox + x, oy - y). */
  oorsprong: [number, number];
  /** Elementsoorten die niet getekend zijn, met hun aantal. */
  overgeslagen: Record<string, number>;
}

/** Boven dit aantal getekende elementen houden we op: dat past niet in een blad. */
export const MAX_ELEMENTEN = 250_000;

/** Grootste weergave in beeldpunten; de lijndiktes zijn op deze maat berekend. */
const MAX_BREED = 640;
const MAX_HOOG = 480;
/** Lijndikte zonder eigen waarde (mm), en de dunste die we tekenen. */
const STANDAARD_DIKTE = 0.18;
const MIN_DIKTE = 0.1;
const PX_PER_MM = 96 / 25.4;
const TAU = Math.PI * 2;
const RAD = Math.PI / 180;

// ───────────────────────────── bytes → tekst ─────────────────────────────

/** Een DWG begint met zijn versie: "AC1015", "AC1032", … */
export function isDwg(b: Uint8Array): boolean {
  return b.length >= 6 && b[0] === 0x41 && b[1] === 0x43 && b[2] >= 0x30 && b[2] <= 0x39;
}

/** Een binaire DXF heeft een vaste kop van 22 bytes: "<naam> Binary DXF\r\n\x1a\0". */
export function isBinaireDxf(b: Uint8Array): boolean {
  if (b.length < 22) return false;
  return String.fromCharCode(...b.subarray(7, 22)) === " Binary DXF\r\n\x1a\0";
}

/**
 * De bytes van een DXF als tekst. Nieuwere DXF'en zijn UTF-8; oudere staan in
 * de codetabel uit `$DWGCODEPAGE` (meestal ANSI_1252).
 */
export function leesDxf(b: Uint8Array): string {
  if (isDwg(b)) throw new DxfFout("dwg");
  if (isBinaireDxf(b)) throw new DxfFout("binair");
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(b).replace(/^﻿/, "");
  } catch {
    const latijn = new TextDecoder("windows-1252").decode(b);
    const cp = /\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*ANSI_(\d+)/i.exec(latijn)?.[1];
    if (cp && cp !== "1252") {
      try {
        return new TextDecoder(`windows-${cp}`).decode(b);
      } catch {
        /* onbekende codetabel: dan maar 1252 */
      }
    }
    return latijn;
  }
}

// ───────────────────────────── lezen ─────────────────────────────

type Paar = [number, string];

/** Eén record: alles vanaf een groepcode 0 tot de volgende. */
interface Ent {
  type: string;
  p: Paar[];
  /** De VERTEX'en van een POLYLINE, de ATTRIB'en van een INSERT. */
  kind?: Ent[];
  /** Eerste waarde per groepcode, bij het eerste gebruik opgebouwd. */
  c?: Map<number, string>;
}

function codes(e: Ent): Map<number, string> {
  if (!e.c) {
    e.c = new Map();
    for (const [k, v] of e.p) if (!e.c.has(k)) e.c.set(k, v);
  }
  return e.c;
}
function num(e: Ent, code: number, std = 0): number {
  const v = codes(e).get(code);
  if (v === undefined) return std;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : std;
}
function txt(e: Ent, code: number, std = ""): string {
  const v = codes(e).get(code);
  return v === undefined ? std : v.trim();
}
const heeft = (e: Ent, code: number) => codes(e).has(code);

interface Laag { rgb: number; uit: boolean; weg: boolean; lw: number; lt: string }
interface Blok { bx: number; by: number; ents: Ent[]; extern: boolean }
interface Tekening {
  lagen: Map<string, Laag>;
  blokken: Map<string, Blok>;
  lijntypen: Map<string, number[]>;
  stijlen: Map<string, { h: number; wf: number }>;
  ents: Ent[];
  kop: Map<string, number>;
}

const STANDAARD_LAAG: Laag = { rgb: 0xffffff, uit: false, weg: false, lw: -3, lt: "CONTINUOUS" };

function records(bron: string): Ent[] {
  const r = bron.split(/\r\n|\n|\r/);
  const uit: Ent[] = [];
  let huidig: Ent | null = null;
  for (let i = 0; i + 1 < r.length; i += 2) {
    const code = parseInt(r[i], 10);
    if (Number.isNaN(code)) {
      if (r[i].trim() === "" && i + 2 >= r.length) break;
      throw new DxfFout("ongeldig");
    }
    const waarde = r[i + 1];
    if (code === 0) {
      huidig = { type: waarde.trim().toUpperCase(), p: [] };
      if (huidig.type === "EOF") break;
      uit.push(huidig);
    } else if (code !== 999 && huidig) {
      huidig.p.push([code, waarde]);
    }
  }
  return uit;
}

function lees(bron: string): Tekening {
  const t: Tekening = {
    lagen: new Map(), blokken: new Map(), lijntypen: new Map(), stijlen: new Map(), ents: [], kop: new Map(),
  };
  const recs = records(bron);
  if (!recs.some((e) => e.type === "SECTION")) throw new DxfFout("ongeldig");

  let sectie = "";
  let blok: Blok | null = null;
  let bloknaam = "";
  let ouder: Ent | null = null;

  /** Een entiteit in een lijst; VERTEX en ATTRIB horen bij de entiteit ervoor. */
  const voegToe = (lijst: Ent[], e: Ent) => {
    if ((e.type === "VERTEX" || e.type === "ATTRIB") && ouder) {
      (ouder.kind ??= []).push(e);
      return;
    }
    ouder = null;
    if (e.type === "SEQEND") return;
    lijst.push(e);
    if (e.type === "POLYLINE" || (e.type === "INSERT" && num(e, 66) === 1)) ouder = e;
  };

  for (const rec of recs) {
    if (rec.type === "SECTION") {
      sectie = txt(rec, 2).toUpperCase();
      if (sectie === "HEADER") {
        let naam = "";
        for (const [c, v] of rec.p) {
          if (c === 9) naam = v.trim().toUpperCase();
          else if (naam && !t.kop.has(naam)) {
            const n = parseFloat(v);
            if (Number.isFinite(n)) t.kop.set(naam, n);
          }
        }
      }
      continue;
    }
    if (rec.type === "ENDSEC") { sectie = ""; continue; }

    if (sectie === "TABLES") {
      const naam = txt(rec, 2).toUpperCase();
      if (rec.type === "LAYER") {
        const k = num(rec, 62, 7);
        t.lagen.set(naam, {
          rgb: heeft(rec, 420) ? num(rec, 420) & 0xffffff : kleurNummer(Math.abs(k) || 7),
          uit: k < 0,
          weg: (num(rec, 70) & 1) === 1 || num(rec, 290, 1) === 0 || naam === "DEFPOINTS",
          lw: num(rec, 370, -3),
          lt: txt(rec, 6, "CONTINUOUS").toUpperCase(),
        });
      } else if (rec.type === "LTYPE") {
        const d = rec.p.filter(([c]) => c === 49).map(([, v]) => parseFloat(v)).filter(Number.isFinite);
        if (d.some((v) => v !== 0)) t.lijntypen.set(naam, d);
      } else if (rec.type === "STYLE") {
        t.stijlen.set(naam, { h: num(rec, 40), wf: num(rec, 41, 1) || 1 });
      }
    } else if (sectie === "BLOCKS") {
      if (rec.type === "BLOCK") {
        bloknaam = (txt(rec, 2) || txt(rec, 3)).toUpperCase();
        blok = { bx: num(rec, 10), by: num(rec, 20), ents: [], extern: (num(rec, 70) & 12) !== 0 };
        ouder = null;
      } else if (rec.type === "ENDBLK") {
        if (blok && bloknaam) t.blokken.set(bloknaam, blok);
        blok = null;
      } else if (blok) {
        voegToe(blok.ents, rec);
      }
    } else if (sectie === "ENTITIES") {
      voegToe(t.ents, rec);
    }
  }
  return t;
}

// ───────────────────────────── kleuren ─────────────────────────────

const KLEUR_BASIS = [0x000000, 0xff0000, 0xffff00, 0x00ff00, 0x00ffff, 0x0000ff, 0xff00ff, 0xffffff, 0x414141, 0x808080];
const GRIJZEN = [0x333333, 0x505050, 0x696969, 0x828282, 0xbebebe, 0xffffff];

/**
 * De kleur bij een DXF-kleurnummer (1–255). 10–249: 24 tinten van 15°, elk in
 * vijf helderheden, om en om verzadigd en bleek; 250–255 grijzen.
 */
export function kleurNummer(i: number): number {
  if (i < 10) return KLEUR_BASIS[i] ?? 0xffffff;
  if (i >= 250) return GRIJZEN[i - 250] ?? 0xffffff;
  const tint = (Math.floor(i / 10) - 1) * 15;
  const sub = i % 10;
  const v = [255, 189, 129, 104, 79][sub >> 1];
  const s = sub & 1 ? 1 / 3 : 1;
  const c = v * s;
  const x = c * (1 - Math.abs(((tint / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = tint < 60 ? [c, x, 0] : tint < 120 ? [x, c, 0] : tint < 180 ? [0, c, x]
    : tint < 240 ? [0, x, c] : tint < 300 ? [x, 0, c] : [c, 0, x];
  return (Math.floor(r + m) << 16) | (Math.floor(g + m) << 8) | Math.floor(b + m);
}

/** Een kleur zoals hij op wit papier komt: wit wordt zwart, fel-licht wordt donkerder. */
export function kleurOpPapier(rgb: number): string {
  let r = (rgb >> 16) & 255, g = (rgb >> 8) & 255, b = rgb & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  const grijs = Math.max(r, g, b) - Math.min(r, g, b) < 40;
  if (grijs && lum > 0.88) return "#000";
  if (!grijs && lum > 0.7) {
    const f = 0.55 / lum;
    r = Math.round(r * f); g = Math.round(g * f); b = Math.round(b * f);
  }
  const h = ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  return h[0] === h[1] && h[2] === h[3] && h[4] === h[5] ? `#${h[0]}${h[2]}${h[4]}` : `#${h}`;
}

// ───────────────────────────── meetkunde ─────────────────────────────

/** Affiene afbeelding: x' = a·x + c·y + e, y' = b·x + d·y + f. */
type Mat = [number, number, number, number, number, number];
const EENHEID: Mat = [1, 0, 0, 1, 0, 0];

/** m ∘ n: eerst n, dan m. */
function maal(m: Mat, n: Mat): Mat {
  return [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}
const verschuif = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
const draai = (a: number): Mat => [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
const punt = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const richting = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y, m[1] * x + m[3] * y];
const schaalVan = (m: Mat) => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));

/**
 * Het objectstelsel (OCS) van een vlakke entiteit naar wereldcoördinaten, uit
 * de extrusierichting (210/220/230) met de "willekeurige-as"-regel van DXF.
 * Een gespiegeld getekend element (extrusie 0,0,-1) krijgt zo x → -x.
 */
function ocs(e: Ent, z = num(e, 30)): Mat {
  let nx = num(e, 210), ny = num(e, 220), nz = num(e, 230, 1);
  const l = Math.hypot(nx, ny, nz);
  if (l < 1e-12) return EENHEID;
  nx /= l; ny /= l; nz /= l;
  if (Math.abs(nx) < 1e-12 && Math.abs(ny) < 1e-12 && nz > 0) return EENHEID;
  let ax: number, ay: number, az: number;
  if (Math.abs(nx) < 1 / 64 && Math.abs(ny) < 1 / 64) { ax = nz; ay = 0; az = -nx; } // Wy × N
  else { ax = -ny; ay = nx; az = 0; } // Wz × N
  const la = Math.hypot(ax, ay, az);
  ax /= la; ay /= la; az /= la;
  const bx = ny * az - nz * ay, by = nz * ax - nx * az; // N × Ax
  return [ax, ay, bx, by, nx * z, ny * z];
}

/** Ligt hoek t op de boog van a naar b (welke kant op ook)? */
function binnen(t: number, a: number, b: number): boolean {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  return lo + ((((t - lo) % TAU) + TAU) % TAU) <= hi + 1e-12;
}

/** Punten op een B-spline (eventueel rationaal), met de De Boor-recursie. */
function bspline(p: number, knopen: number[], ctrl: [number, number][], w: number[] | null, n: number): [number, number][] {
  const nc = ctrl.length;
  if (p < 1 || nc <= p) return ctrl.slice();
  let t = knopen;
  if (t.length !== nc + p + 1) {
    t = [];
    for (let i = 0; i < nc + p + 1; i++) t.push(Math.min(Math.max(i - p, 0), nc - p));
  }
  const a = t[p], b = t[nc];
  if (!(b > a)) return ctrl.slice();
  const uit: [number, number][] = [];
  for (let k = 0; k <= n; k++) {
    const u = a + ((b - a) * k) / n;
    let s = p;
    while (s < nc - 1 && t[s + 1] <= u) s++;
    const d: number[][] = [];
    for (let j = 0; j <= p; j++) {
      const i = s - p + j;
      const wi = w?.[i] ?? 1;
      d.push([ctrl[i][0] * wi, ctrl[i][1] * wi, wi]);
    }
    for (let r = 1; r <= p; r++) {
      for (let j = p; j >= r; j--) {
        const i = s - p + j;
        const noemer = t[i + p - r + 1] - t[i];
        const al = noemer === 0 ? 0 : (u - t[i]) / noemer;
        d[j] = [0, 1, 2].map((q) => (1 - al) * d[j - 1][q] + al * d[j][q]);
      }
    }
    const h = d[p][2] || 1;
    uit.push([d[p][0] / h, d[p][1] / h]);
  }
  return uit;
}

/** Een vloeiende lijn door pasPunten (Catmull-Rom), voor een spline zonder stuurpunten. */
function doorPunten(pts: [number, number][]): [number, number][] {
  if (pts.length < 3) return pts.slice();
  const uit: [number, number][] = [pts[0]];
  for (let i = 0; i + 1 < pts.length; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
    for (let k = 1; k <= 8; k++) {
      const s = k / 8, s2 = s * s, s3 = s2 * s;
      const f = (q: 0 | 1) => 0.5 * (2 * p1[q] + (-p0[q] + p2[q]) * s + (2 * p0[q] - 5 * p1[q] + 4 * p2[q] - p3[q]) * s2
        + (-p0[q] + 3 * p1[q] - 3 * p2[q] + p3[q]) * s3);
      uit.push([f(0), f(1)]);
    }
  }
  return uit;
}

// ───────────────────────────── tekst ─────────────────────────────

/** Besturingscodes van TEXT: %%c → Ø, %%d → °, %%p → ±, %%nnn, \U+xxxx. */
function tekstCodes(s: string): string {
  return s
    .replace(/%%(\d{3}|[cdpuokCDPUOK%])/g, (_, c: string) => {
      if (/^\d/.test(c)) return String.fromCharCode(parseInt(c, 10));
      switch (c.toLowerCase()) {
        case "c": return "Ø";
        case "d": return "°";
        case "p": return "±";
        case "%": return "%";
        default: return ""; // onder-/bovenstrepen aan of uit
      }
    })
    .replace(/\\U\+([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

/** De regels van een MTEXT, zonder opmaakcodes. */
function mtekstRegels(s: string): string[] {
  let uit = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === "\\" && i + 1 < s.length) {
      const k = s[++i];
      const totPuntkomma = () => {
        const eind = s.indexOf(";", i + 1);
        const stuk = s.slice(i + 1, eind < 0 ? s.length : eind);
        i = eind < 0 ? s.length : eind;
        return stuk;
      };
      switch (k) {
        case "P": case "X": case "n": uit += "\n"; break;
        case "~": uit += " "; break;
        case "\\": case "{": case "}": uit += k; break;
        case "U":
          if (s[i + 1] === "+" && /^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6))) {
            uit += String.fromCharCode(parseInt(s.slice(i + 2, i + 6), 16));
            i += 5;
          }
          break;
        case "S": {
          const delen = totPuntkomma().split(/[\^#/]/).map((d) => d.trim()).filter((d) => d !== "");
          uit += delen.join("/");
          break;
        }
        case "A": case "C": case "c": case "F": case "f": case "H": case "h": case "Q": case "q":
        case "T": case "t": case "W": case "w": case "p":
          totPuntkomma();
          break;
        case "L": case "l": case "O": case "o": case "K": case "k": case "N":
          break;
        default:
          uit += k;
      }
    } else if (ch === "{" || ch === "}") {
      // groepering van opmaak
    } else if (ch === "^" && i + 1 < s.length) {
      const k = s[++i];
      uit += k === "J" ? "\n" : k === "I" ? " " : k === " " ? "^" : "^" + k;
    } else {
      uit += ch;
    }
  }
  return tekstCodes(uit).split("\n");
}

/** Afbreken op woorden bij een geschatte tekenbreedte. */
function breekAf(regels: string[], breedte: number, teken: number): string[] {
  const max = Math.max(1, Math.floor(breedte / teken));
  const uit: string[] = [];
  for (const regel of regels) {
    if (regel.length <= max) { uit.push(regel); continue; }
    let r = "";
    for (const woord of regel.split(" ")) {
      if (r && r.length + 1 + woord.length > max) { uit.push(r); r = woord; }
      else r = r ? `${r} ${woord}` : woord;
    }
    uit.push(r);
  }
  return uit;
}

/** Tekstinhoud veilig in de SVG: alle leestekens als tekenverwijzing (zie boven). */
function tekstInhoud(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000b-\u001f￾￿]/g, "")
    .replace(/[^A-Za-z0-9 \u0080-￿]/g, (c) => `&#${c.charCodeAt(0)};`);
}

// ───────────────────────────── opbouw ─────────────────────────────

interface Boog { rx: number; ry: number; rot: number; groot: boolean; ccw: boolean }
interface Seg { x: number; y: number; b?: Boog }
/** Een deelpad in wereldcoördinaten (y omhoog). */
interface Deel { x: number; y: number; s: Seg[]; dicht: boolean }
/** Alle lijnen met dezelfde stijl: één `<path>`. */
interface Bak { kleur: string; dikte: number; eenheden: boolean; streep: number[] | null; delen: Deel[] }
interface Vlak { kleur: string; dekking: number; evenodd: boolean; delen: Deel[] }
interface Tekst {
  x: number; y: number; h: number; hoek: number; wf: number;
  anker: number; regels: string[]; lh: number; kleur: string; lengte: number;
}
interface Ctx {
  m: Mat;
  /** Laag van het omhullende blok, voor elementen op laag 0. */
  laag: string;
  /** Kleur, dikte en lijntype van het omhullende blok (BYBLOCK). */
  kleur: number;
  lw: number;
  lt: string;
  lts: number;
  pad: string[];
}
interface Hoekpunt { x: number; y: number; b: number; sw: number; ew: number }

/** Een DXF-tekening (als tekst) naar een compacte SVG. */
export function dxfNaarSvg(bron: string): DxfSvg {
  const t = lees(bron);
  const bakken = new Map<string, Bak>();
  const vlakken: Vlak[] = [];
  const vulPerKleur = new Map<string, Vlak>();
  const teksten: Tekst[] = [];
  const overgeslagen: Record<string, number> = {};
  const papier = new Map<number, string>();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let elementen = 0;

  const ltSchaal = t.kop.get("$LTSCALE") || 1;
  const pijlMaat = (t.kop.get("$DIMASZ") || 2.5) * (t.kop.get("$DIMSCALE") || 1);

  const box = (x: number, y: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  const tel = () => {
    if (++elementen > MAX_ELEMENTEN) throw new DxfFout("teGroot");
  };
  const overslaan = (type: string) => { overgeslagen[type] = (overgeslagen[type] ?? 0) + 1; };
  const hex = (rgb: number) => {
    let h = papier.get(rgb);
    if (!h) { h = kleurOpPapier(rgb); papier.set(rgb, h); }
    return h;
  };

  // ── stijl van een element ──

  interface Eig { laag: string; rgb: number; lw: number; lt: string }
  /** Laag, kleur, dikte en lijntype; null als het element niet zichtbaar is. */
  const eigenschappen = (e: Ent, ctx: Ctx): Eig | null => {
    let ln = txt(e, 8, "0").toUpperCase() || "0";
    if (ln === "0" && ctx.laag) ln = ctx.laag;
    const laag = t.lagen.get(ln) ?? STANDAARD_LAAG;
    if (laag.uit || laag.weg || ln === "DEFPOINTS" || num(e, 60) === 1) return null;
    let rgb: number;
    if (heeft(e, 420)) rgb = num(e, 420) & 0xffffff;
    else {
      const k = Math.abs(num(e, 62, 256));
      rgb = k === 0 ? ctx.kleur : k >= 256 ? laag.rgb : kleurNummer(k);
    }
    let v = num(e, 370, -1);
    if (v === -1) v = laag.lw;
    const lw = v === -2 ? ctx.lw : v >= 0 ? v / 100 : STANDAARD_DIKTE;
    let lt = txt(e, 6, "BYLAYER").toUpperCase();
    if (lt === "BYLAYER") lt = laag.lt;
    if (lt === "BYBLOCK") lt = ctx.lt;
    return { laag: ln, rgb, lw, lt };
  };

  const bak = (kleur: string, dikte: number, eenheden: boolean, streep: number[] | null): Bak => {
    const sleutel = `${kleur}|${eenheden ? "w" : ""}${dikte}|${streep?.join(",") ?? ""}`;
    let b = bakken.get(sleutel);
    if (!b) { b = { kleur, dikte, eenheden, streep, delen: [] }; bakken.set(sleutel, b); }
    return b;
  };

  /** Streeppatroon (stroke-dasharray) uit een lijntype; null voor doorgetrokken. */
  const streepVan = (lt: string, schaal: number): number[] | null => {
    const patroon = t.lijntypen.get(lt);
    if (!patroon || !(schaal > 0)) return null;
    const uit: number[] = [];
    for (const v of patroon) {
      const l = Math.abs(v) * schaal;
      const isStreep = v >= 0;
      if (uit.length % 2 === 0 === isStreep) uit.push(l);
      else if (uit.length > 0) uit[uit.length - 1] += l;
      else uit.push(0, l);
    }
    if (uit.length % 2 === 1) uit.push(0);
    if (!(uit.reduce((a, b) => a + b, 0) > 0)) return null;
    return uit.map((v) => Number(v.toPrecision(3)));
  };

  /** De lijnbak voor een element, of null als het niet zichtbaar is. */
  const lijnBak = (e: Ent, ctx: Ctx): Bak | null => {
    const eig = eigenschappen(e, ctx);
    if (!eig) return null;
    return bak(hex(eig.rgb), eig.lw, false, streepVan(eig.lt, ltSchaal * num(e, 48, 1) * ctx.lts));
  };

  const vulVlak = (kleur: string): Vlak => {
    let v = vulPerKleur.get(kleur);
    if (!v) { v = { kleur, dekking: 1, evenodd: false, delen: [] }; vulPerKleur.set(kleur, v); vlakken.push(v); }
    return v;
  };

  // ── paden ──

  const nieuwDeel = (doel: { delen: Deel[] }, x: number, y: number): Deel => {
    const d: Deel = { x, y, s: [], dicht: false };
    doel.delen.push(d);
    box(x, y);
    return d;
  };
  const lijn = (d: Deel, x: number, y: number) => { d.s.push({ x, y }); box(x, y); };

  /**
   * Boog van de ellips P(t) = C + U·cos t + V·sin t van t0 naar t1 (t1 < t0:
   * achteruit). U en V zijn toegevoegde halve middellijnen: elke affiene
   * afbeelding van een cirkel of ellips heeft deze vorm. Voor de SVG worden
   * ze omgerekend naar de hoofdassen.
   */
  const ellipsboog = (d: Deel, cx: number, cy: number, ux: number, uy: number, vx: number, vy: number,
    t0: number, t1: number, ex?: number, ey?: number) => {
    const span = t1 - t0;
    if (!(Math.abs(span) > 1e-12)) return;
    const P = (q: number): [number, number] =>
      [cx + ux * Math.cos(q) + vx * Math.sin(q), cy + uy * Math.cos(q) + vy * Math.sin(q)];
    for (const u of [Math.atan2(vx, ux), Math.atan2(vy, uy)]) {
      for (const q of [u, u + Math.PI]) if (binnen(q, t0, t1)) box(...P(q));
    }
    const eind = (k: number, n: number): [number, number] =>
      k === n && ex !== undefined && ey !== undefined ? [ex, ey] : P(t0 + (span * k) / n);
    const orient = ux * vy - uy * vx;
    const uu = ux * ux + uy * uy, vv = vx * vx + vy * vy, uv = ux * vx + uy * vy;
    if (Math.abs(orient) <= 1e-9 * (uu + vv)) {
      for (let k = 1; k <= 16; k++) lijn(d, ...eind(k, 16));
      return;
    }
    const tp = 0.5 * Math.atan2(2 * uv, uu - vv);
    const c = Math.cos(tp), s = Math.sin(tp);
    const ax = ux * c + vx * s, ay = uy * c + vy * s;
    const rx = Math.hypot(ax, ay), ry = Math.hypot(vx * c - ux * s, vy * c - uy * s);
    const rot = Math.abs(rx - ry) <= 1e-9 * rx ? 0 : (Math.atan2(ay, ax) * 180) / Math.PI;
    const ccw = span > 0 === orient > 0;
    const n = Math.abs(span) > Math.PI ? 2 : 1;
    for (let k = 1; k <= n; k++) {
      const [x, y] = eind(k, n);
      d.s.push({ x, y, b: { rx, ry, rot, groot: false, ccw } });
      box(x, y);
    }
  };

  /** Eén stuk van een polylijn, recht of (met bulge) een cirkelboog. */
  const polySegment = (d: Deel, m: Mat, a: Hoekpunt, c: Hoekpunt) => {
    const [ex, ey] = punt(m, c.x, c.y);
    const bulge = a.b;
    const dx = c.x - a.x, dy = c.y - a.y;
    if (Math.abs(bulge) < 1e-9 || (dx === 0 && dy === 0)) return lijn(d, ex, ey);
    const k = (1 - bulge * bulge) / (4 * bulge);
    const cx = (a.x + c.x) / 2 - dy * k, cy = (a.y + c.y) / 2 + dx * k;
    const r = Math.hypot(a.x - cx, a.y - cy);
    const t0 = Math.atan2(a.y - cy, a.x - cx);
    const [Cx, Cy] = punt(m, cx, cy);
    const [ux, uy] = richting(m, r, 0), [vx, vy] = richting(m, 0, r);
    ellipsboog(d, Cx, Cy, ux, uy, vx, vy, t0, t0 + 4 * Math.atan(bulge), ex, ey);
  };

  const polyPad = (doel: { delen: Deel[] }, m: Mat, pts: Hoekpunt[], dicht: boolean) => {
    if (pts.length === 0) return;
    const d = nieuwDeel(doel, ...punt(m, pts[0].x, pts[0].y));
    const n = pts.length;
    for (let i = 0; i < (dicht ? n : n - 1); i++) polySegment(d, m, pts[i], pts[(i + 1) % n]);
    if (n === 1) lijn(d, d.x, d.y);
    d.dicht = dicht && n > 1;
  };

  /** Een polylijn met (eventueel) breedte. */
  const polylijn = (st: Bak, m: Mat, pts: Hoekpunt[], dicht: boolean) => {
    const f = schaalVan(m);
    const n = pts.length;
    const stukken = dicht ? n : n - 1;
    const breed = pts.slice(0, Math.max(stukken, 1)).some((p) => p.sw > 0 || p.ew > 0);
    if (!breed) return polyPad(st, m, pts, dicht);
    const w0 = pts[0].sw;
    if (pts.slice(0, stukken).every((p) => p.sw === w0 && p.ew === w0)) {
      return polyPad(bak(st.kleur, w0 * f, true, null), m, pts, dicht);
    }
    // Wisselende breedte (een pijlpunt): rechte stukken als gevuld trapezium.
    for (let i = 0; i < stukken; i++) {
      const a = pts[i], c = pts[(i + 1) % n];
      if (a.sw === 0 && a.ew === 0) { polyPad(st, m, [a, c], false); continue; }
      if (Math.abs(a.b) > 1e-9) {
        polyPad(bak(st.kleur, ((a.sw + a.ew) / 2) * f, true, null), m, [a, { ...c, b: 0 }], false);
        continue;
      }
      const dl = Math.hypot(c.x - a.x, c.y - a.y);
      if (dl === 0) continue;
      const nx = -(c.y - a.y) / dl, ny = (c.x - a.x) / dl;
      const hoeken = [
        [a.x + nx * a.sw / 2, a.y + ny * a.sw / 2], [c.x + nx * a.ew / 2, c.y + ny * a.ew / 2],
        [c.x - nx * a.ew / 2, c.y - ny * a.ew / 2], [a.x - nx * a.sw / 2, a.y - ny * a.sw / 2],
      ].map(([x, y]) => punt(m, x, y));
      const d = nieuwDeel(vulVlak(st.kleur), ...hoeken[0]);
      for (const h of hoeken.slice(1)) lijn(d, ...h);
      d.dicht = true;
    }
  };

  /** Gevulde pijlpunt van `van` naar de punt `tip` (wereldcoördinaten vóór m). */
  const pijlpunt = (m: Mat, kleur: string, tx: number, ty: number, vx: number, vy: number, maat: number) => {
    const dl = Math.hypot(tx - vx, ty - vy);
    if (!(dl > 0) || !(maat > 0)) return;
    const ux = (tx - vx) / dl, uy = (ty - vy) / dl;
    const bx = tx - ux * maat, by = ty - uy * maat, hw = maat / 6;
    const d = nieuwDeel(vulVlak(kleur), ...punt(m, tx, ty));
    lijn(d, ...punt(m, bx - uy * hw, by + ux * hw));
    lijn(d, ...punt(m, bx + uy * hw, by - ux * hw));
    d.dicht = true;
  };

  // ── tekst ──

  /**
   * Een tekst op de basislijn (x, y) vóór afbeelding m, met richting (ux, uy).
   * anker: 0 links, 1 midden, 2 rechts. lh: regelafstand.
   */
  const zetTekst = (m: Mat, kleur: string, x: number, y: number, ux: number, uy: number, h: number, wf: number,
    anker: number, regels: string[], lh: number, lengte: number) => {
    const [X, Y] = punt(m, x, y);
    const [dx, dy] = richting(m, ux, uy), [nx, ny] = richting(m, -uy, ux);
    const ld = Math.hypot(dx, dy), ln = Math.hypot(nx, ny);
    if (!(ld > 0 && ln > 0 && h > 0)) return;
    const tk: Tekst = {
      x: X, y: Y, h: h * ln, hoek: Math.atan2(dy, dx), wf: (wf * ld) / ln,
      anker, regels, lh: lh * ln, kleur, lengte: lengte * ld,
    };
    teksten.push(tk);
    tel();
    // Omhullende geschat: 0,75 × hoogte per teken (sans-serif op 1,4 × de hoogte).
    const L = tk.lengte || Math.max(...regels.map((r) => r.length)) * 0.75 * tk.h * tk.wf;
    const x0 = anker === 1 ? -L / 2 : anker === 2 ? -L : 0;
    const c = Math.cos(tk.hoek), s = Math.sin(tk.hoek);
    for (const [px, py] of [[x0, tk.h], [x0 + L, tk.h], [x0, -(regels.length - 1) * tk.lh - 0.25 * tk.h],
      [x0 + L, -(regels.length - 1) * tk.lh - 0.25 * tk.h]]) {
      box(X + px * c - py * s, Y + px * s + py * c);
    }
  };

  const stijlVan = (e: Ent) => t.stijlen.get(txt(e, 7, "STANDARD").toUpperCase());

  /** TEXT en ATTRIB. */
  const tekstEnt = (e: Ent, ctx: Ctx, attrib: boolean) => {
    if (attrib && (num(e, 70) & 1) === 1) return;
    const s = tekstCodes(codes(e).get(1) ?? "");
    if (!s.trim()) return;
    const eig = eigenschappen(e, ctx);
    if (!eig) return;
    const stijl = stijlVan(e);
    const h = num(e, 40) || stijl?.h || 2.5;
    const wf = num(e, 41, stijl?.wf ?? 1) || 1;
    const hj = num(e, 72), vj = num(e, attrib ? 74 : 73);
    let x = num(e, 10), y = num(e, 20), r = num(e, 50) * RAD;
    let lengte = 0, anker = 0, dy = 0;
    if ((hj === 3 || hj === 5) && heeft(e, 11)) {
      const x2 = num(e, 11), y2 = num(e, 21);
      r = Math.atan2(y2 - y, x2 - x);
      lengte = Math.hypot(x2 - x, y2 - y);
    } else {
      if ((hj !== 0 || vj !== 0) && heeft(e, 11)) { x = num(e, 11); y = num(e, 21); }
      anker = hj === 1 || hj === 4 ? 1 : hj === 2 ? 2 : 0;
      dy = hj === 4 || vj === 2 ? -0.5 * h : vj === 1 ? 0.25 * h : vj === 3 ? -h : 0;
    }
    const ux = Math.cos(r), uy = Math.sin(r);
    zetTekst(maal(ctx.m, ocs(e)), hex(eig.rgb), x - uy * dy, y + ux * dy, ux, uy, h, wf, anker, [s], 0, lengte);
  };

  /** Meerregelige tekst met een aanhechtpunt (1–9: links-boven … rechts-onder). */
  const plaatsMtekst = (m: Mat, kleur: string, ruw: string, x: number, y: number, ux0: number, uy0: number,
    h: number, wf: number, aanh: number, breedte: number, regelf: number) => {
    let regels = mtekstRegels(ruw);
    if (breedte > 0) regels = breekAf(regels, breedte, 0.6 * h * wf);
    while (regels.length > 0 && !regels[regels.length - 1].trim()) regels.pop();
    if (!regels.some((r) => r.trim())) return;
    const lh = ((h * 5) / 3) * (regelf || 1);
    const n = regels.length;
    const a = Math.min(Math.max(Math.round(aanh) || 1, 1), 9);
    const rij = Math.floor((a - 1) / 3), kol = (a - 1) % 3;
    const totaal = h + (n - 1) * lh;
    const eerste = rij === 0 ? -h : rij === 1 ? totaal / 2 - h : (n - 1) * lh;
    const dl = Math.hypot(ux0, uy0) || 1;
    const ux = ux0 / dl, uy = uy0 / dl;
    zetTekst(m, kleur, x - uy * eerste, y + ux * eerste, ux, uy, h, wf, kol, regels, lh, 0);
  };

  const mtekst = (e: Ent, ctx: Ctx) => {
    const eig = eigenschappen(e, ctx);
    if (!eig) return;
    const ruw = e.p.filter(([c]) => c === 3).map(([, v]) => v).join("") + (codes(e).get(1) ?? "");
    const stijl = stijlVan(e);
    const h = num(e, 40) || stijl?.h || 2.5;
    let ux: number, uy: number;
    if (heeft(e, 11)) { ux = num(e, 11); uy = num(e, 21); }
    else [ux, uy] = richting(ocs(e), Math.cos(num(e, 50) * RAD), Math.sin(num(e, 50) * RAD));
    plaatsMtekst(ctx.m, hex(eig.rgb), ruw, num(e, 10), num(e, 20), ux, uy, h, stijl?.wf ?? 1,
      num(e, 71, 1), num(e, 41), num(e, 44, 1));
  };

  // ── arcering ──

  type Rand =
    | { s: "pl"; pts: [number, number][] }
    | { s: "boog"; cx: number; cy: number; ux: number; uy: number; vx: number; vy: number; t0: number; t1: number };

  const randBegin = (r: Rand): [number, number] => r.s === "pl" ? r.pts[0]
    : [r.cx + r.ux * Math.cos(r.t0) + r.vx * Math.sin(r.t0), r.cy + r.uy * Math.cos(r.t0) + r.vy * Math.sin(r.t0)];
  const randEind = (r: Rand): [number, number] => r.s === "pl" ? r.pts[r.pts.length - 1]
    : [r.cx + r.ux * Math.cos(r.t1) + r.vx * Math.sin(r.t1), r.cy + r.uy * Math.cos(r.t1) + r.vy * Math.sin(r.t1)];
  const omgekeerd = (r: Rand): Rand => r.s === "pl" ? { s: "pl", pts: r.pts.slice().reverse() } : { ...r, t0: r.t1, t1: r.t0 };
  const dichtbij = (a: [number, number], b: [number, number]) =>
    Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) <= 1e-8 * (1 + Math.abs(a[0]) + Math.abs(a[1]));

  /** Een lus van randen als één gesloten deelpad; randen worden zo nodig omgedraaid. */
  const randLus = (v: Vlak, m: Mat, randen: Rand[]) => {
    if (randen.length === 0) return;
    let pen = randBegin(randen[0]);
    const d = nieuwDeel(v, ...punt(m, ...pen));
    for (let r of randen) {
      if (!dichtbij(randBegin(r), pen) && dichtbij(randEind(r), pen)) r = omgekeerd(r);
      if (!dichtbij(randBegin(r), pen)) lijn(d, ...punt(m, ...randBegin(r)));
      if (r.s === "pl") for (const p of r.pts.slice(1)) lijn(d, ...punt(m, ...p));
      else {
        const [cx, cy] = punt(m, r.cx, r.cy);
        const [ux, uy] = richting(m, r.ux, r.uy), [vx, vy] = richting(m, r.vx, r.vy);
        ellipsboog(d, cx, cy, ux, uy, vx, vy, r.t0, r.t1);
      }
      pen = randEind(r);
    }
    d.dicht = true;
  };

  /** Boog als rand: hoeken in graden; een rand met de klok mee staat gespiegeld opgeslagen. */
  const randBoog = (cx: number, cy: number, ux: number, uy: number, vx: number, vy: number,
    a0: number, a1: number, ccw: boolean, param: (a: number) => number): Rand => {
    const vol = Math.abs(Math.abs(a1 - a0) - 360) < 1e-9;
    let t0: number, t1: number;
    if (ccw) {
      t0 = param(a0 * RAD); t1 = vol ? t0 + TAU : param(a1 * RAD);
      while (t1 <= t0) t1 += TAU;
    } else {
      t0 = -param(a0 * RAD); t1 = vol ? t0 - TAU : -param(a1 * RAD);
      while (t1 >= t0) t1 -= TAU;
    }
    return { s: "boog", cx, cy, ux, uy, vx, vy, t0, t1 };
  };

  const arcering = (e: Ent, ctx: Ctx) => {
    const eig = eigenschappen(e, ctx);
    if (!eig) return;
    const m = maal(ctx.m, ocs(e, num(e, 30)));
    const verloop = num(e, 450) === 1;
    const v: Vlak = { kleur: hex(eig.rgb), dekking: verloop ? 0.35 : num(e, 70) === 1 ? 1 : 0.15, evenodd: true, delen: [] };
    const p = e.p;
    let i = p.findIndex(([c]) => c === 91);
    if (i < 0) return;
    const lussen = parseInt(p[i][1], 10) || 0;
    i++;
    const getal = (k: number) => parseFloat(p[k][1]) || 0;
    for (let l = 0; l < lussen; l++) {
      while (i < p.length && p[i][0] !== 92) i++;
      if (i >= p.length) break;
      const soort = parseInt(p[i][1], 10);
      i++;
      if (soort & 2) {
        // Polylijn: 72 bulge ja/nee, 73 gesloten, 93 aantal, dan 10/20(/42).
        const pts: Hoekpunt[] = [];
        while (i < p.length && ![10, 92, 97].includes(p[i][0])) i++;
        while (i < p.length && [10, 20, 42].includes(p[i][0])) {
          const c = p[i][0];
          if (c === 10) pts.push({ x: getal(i), y: 0, b: 0, sw: 0, ew: 0 });
          else if (pts.length > 0) pts[pts.length - 1][c === 20 ? "y" : "b"] = getal(i);
          i++;
        }
        if (pts.length > 1) polyPad(v, m, pts, true);
        continue;
      }
      while (i < p.length && p[i][0] !== 93) i++;
      const aantal = i < p.length ? parseInt(p[i][1], 10) || 0 : 0;
      i++;
      const randen: Rand[] = [];
      for (let r = 0; r < aantal; r++) {
        while (i < p.length && p[i][0] !== 72) i++;
        if (i >= p.length) break;
        const typ = parseInt(p[i][1], 10);
        i++;
        const w = new Map<number, number[]>();
        while (i < p.length && ![72, 92, 97].includes(p[i][0])) {
          const lijst = w.get(p[i][0]) ?? [];
          lijst.push(getal(i));
          w.set(p[i][0], lijst);
          i++;
        }
        const g = (c: number, k = 0) => w.get(c)?.[k] ?? 0;
        if (typ === 1) {
          randen.push({ s: "pl", pts: [[g(10), g(20)], [g(11), g(21)]] });
        } else if (typ === 2) {
          const r0 = g(40);
          randen.push(randBoog(g(10), g(20), r0, 0, 0, r0, g(50), g(51), g(73) !== 0, (a) => a));
        } else if (typ === 3) {
          const mx = g(11), my = g(21), k = g(40) || 1;
          randen.push(randBoog(g(10), g(20), mx, my, -my * k, mx * k, g(50), g(51), g(73) !== 0,
            (a) => Math.atan2(Math.sin(a) / k, Math.cos(a))));
        } else if (typ === 4) {
          const xs = w.get(10) ?? [], ys = w.get(20) ?? [];
          const ctrl = xs.map((x, k): [number, number] => [x, ys[k] ?? 0]);
          const gew = g(73) !== 0 ? w.get(42) ?? null : null;
          const pts = bspline(g(94) || 3, w.get(40) ?? [], ctrl, gew, Math.min(Math.max(ctrl.length * 8, 16), 400));
          if (pts.length > 1) randen.push({ s: "pl", pts });
        }
      }
      randLus(v, m, randen);
    }
    if (v.delen.length > 0) { vlakken.push(v); tel(); }
  };

  // ── multileider ──

  const multileider = (e: Ent, ctx: Ctx) => {
    const st = lijnBak(e, ctx);
    if (!st) return;
    let diep = 0, tekst = "", tx = 0, ty = 0, th = 0, pijl = 0, aanh = 1, dx = 1, dy = 0, tw = 0;
    const leiders: { lx: number; ly: number; ddx: number; ddy: number; dl: number; lijnen: number[][] }[] = [];
    for (const [c, v] of e.p) {
      if (c === 300 && v.trim().startsWith("CONTEXT_DATA")) { diep = 1; continue; }
      if (c === 302 && v.trim().startsWith("LEADER{")) {
        diep = 2;
        leiders.push({ lx: NaN, ly: NaN, ddx: 1, ddy: 0, dl: 0, lijnen: [] });
        continue;
      }
      if (c === 304 && v.trim().startsWith("LEADER_LINE{")) { diep = 3; leiders[leiders.length - 1]?.lijnen.push([]); continue; }
      if (c === 305) { diep = 2; continue; }
      if (c === 303) { diep = 1; continue; }
      if (c === 301) { diep = 0; continue; }
      const n = parseFloat(v);
      if (diep === 1) {
        if (c === 304) tekst = v;
        else if (c === 12) tx = n; else if (c === 22) ty = n;
        else if (c === 41) th = n; else if (c === 140) pijl = n;
        else if (c === 171) aanh = n; else if (c === 13) dx = n; else if (c === 23) dy = n;
        else if (c === 43) tw = n;
      } else if (diep === 2) {
        const l = leiders[leiders.length - 1];
        if (!l) continue;
        if (c === 10) l.lx = n; else if (c === 20) l.ly = n;
        else if (c === 11) l.ddx = n; else if (c === 21) l.ddy = n; else if (c === 40) l.dl = n;
      } else if (diep === 3 && (c === 10 || c === 20)) {
        const l = leiders[leiders.length - 1];
        l?.lijnen[l.lijnen.length - 1]?.push(n);
      }
    }
    const zichtbaar = num(e, 170, 1) !== 0;
    for (const l of leiders) {
      if (!zichtbaar) break;
      const eind: [number, number] | null = Number.isFinite(l.lx) && Number.isFinite(l.ly) ? [l.lx, l.ly] : null;
      for (const lijst of l.lijnen) {
        const pts: Hoekpunt[] = [];
        for (let k = 0; k + 1 < lijst.length; k += 2) pts.push({ x: lijst[k], y: lijst[k + 1], b: 0, sw: 0, ew: 0 });
        if (eind) pts.push({ x: eind[0], y: eind[1], b: 0, sw: 0, ew: 0 });
        if (pts.length < 2) continue;
        polyPad(st, ctx.m, pts, false);
        pijlpunt(ctx.m, st.kleur, pts[0].x, pts[0].y, pts[1].x, pts[1].y, pijl);
      }
      if (eind && l.dl > 0) {
        const d = nieuwDeel(st, ...punt(ctx.m, ...eind));
        lijn(d, ...punt(ctx.m, eind[0] + l.ddx * l.dl, eind[1] + l.ddy * l.dl));
      }
    }
    if (tekst.trim() && th > 0) plaatsMtekst(ctx.m, st.kleur, tekst, tx, ty, dx, dy, th, 1, aanh, tw, 1);
    tel();
  };

  // ── blokken ──

  const blokInvoegen = (e: Ent, ctx: Ctx, naam: string, m0: Mat | null) => {
    const blok = t.blokken.get(naam.toUpperCase());
    if (!blok || blok.extern || ctx.pad.includes(naam) || ctx.pad.length > 24) return false;
    let ln = txt(e, 8, "0").toUpperCase() || "0";
    if (ln === "0" && ctx.laag) ln = ctx.laag;
    const laag = t.lagen.get(ln) ?? STANDAARD_LAAG;
    if (laag.weg || ln === "DEFPOINTS" || num(e, 60) === 1) return true;
    // Laag uit: wat in het blok op laag 0 staat valt weg, de rest blijft (zoals in een tekenprogramma).
    const eig = eigenschappen(e, ctx) ?? { laag: ln, rgb: laag.rgb, lw: STANDAARD_DIKTE, lt: "CONTINUOUS" };
    const kind = (m: Mat, schaal: number): Ctx => ({
      m, laag: eig.laag, kleur: eig.rgb, lw: eig.lw, lt: eig.lt, lts: ctx.lts * schaal, pad: [...ctx.pad, naam],
    });
    if (m0) {
      const c = kind(maal(m0, verschuif(-blok.bx, -blok.by)), 1);
      for (const b of blok.ents) teken(b, c);
      return true;
    }
    const sx = num(e, 41, 1), sy = num(e, 42, 1);
    if (sx === 0 || sy === 0) return true;
    const kolommen = Math.max(1, Math.round(num(e, 70, 1))), rijen = Math.max(1, Math.round(num(e, 71, 1)));
    if (kolommen * rijen > 10_000) throw new DxfFout("teGroot");
    const dk = num(e, 44), dr = num(e, 45);
    const basis = maal(maal(ctx.m, ocs(e)), maal(verschuif(num(e, 10), num(e, 20)), draai(num(e, 50) * RAD)));
    const sch: Mat = [sx, 0, 0, sy, -sx * blok.bx, -sy * blok.by];
    for (let r = 0; r < rijen; r++) {
      for (let k = 0; k < kolommen; k++) {
        const c = kind(maal(maal(basis, verschuif(k * dk, r * dr)), sch), Math.sqrt(Math.abs(sx * sy)));
        for (const b of blok.ents) teken(b, c);
      }
    }
    return true;
  };

  // ── per element ──

  const teken = (e: Ent, ctx: Ctx): void => {
    switch (e.type) {
      case "LINE": {
        const st = lijnBak(e, ctx);
        if (!st) return;
        const d = nieuwDeel(st, ...punt(ctx.m, num(e, 10), num(e, 20)));
        lijn(d, ...punt(ctx.m, num(e, 11), num(e, 21)));
        return tel();
      }
      case "LWPOLYLINE": {
        const st = lijnBak(e, ctx);
        if (!st) return;
        const w = num(e, 43);
        const pts: Hoekpunt[] = [];
        for (const [c, v] of e.p) {
          const n = parseFloat(v) || 0;
          if (c === 10) pts.push({ x: n, y: 0, b: 0, sw: w, ew: w });
          else if (pts.length === 0) continue;
          else if (c === 20) pts[pts.length - 1].y = n;
          else if (c === 42) pts[pts.length - 1].b = n;
          else if (c === 40) pts[pts.length - 1].sw = n;
          else if (c === 41) pts[pts.length - 1].ew = n;
        }
        if (pts.length === 0) return;
        polylijn(st, maal(ctx.m, ocs(e, num(e, 38))), pts, (num(e, 70) & 1) === 1);
        return tel();
      }
      case "POLYLINE": {
        const st = lijnBak(e, ctx);
        if (!st) return;
        const vlag = num(e, 70);
        const hoekpunten = (e.kind ?? []).filter((v) => v.type === "VERTEX");
        if (vlag & 64) {
          // Veelvlaksnet: de randen van de vlakken (negatieve index: onzichtbare rand).
          const pos = hoekpunten.filter((v) => (num(v, 70) & 64) !== 0);
          for (const f of hoekpunten.filter((v) => (num(v, 70) & 192) === 128)) {
            const idx = [71, 72, 73, 74].map((c) => num(f, c)).filter((k) => k !== 0);
            idx.forEach((a, k) => {
              const b = idx[(k + 1) % idx.length];
              const pa = pos[Math.abs(a) - 1], pb = pos[Math.abs(b) - 1];
              if (a < 0 || !pa || !pb) return;
              const d = nieuwDeel(st, ...punt(ctx.m, num(pa, 10), num(pa, 20)));
              lijn(d, ...punt(ctx.m, num(pb, 10), num(pb, 20)));
            });
          }
          return tel();
        }
        if (vlag & 16) {
          // M×N-net: lijnen langs rijen en kolommen.
          const mm = num(e, 71), nn = num(e, 72);
          const p = (i: number, j: number) => hoekpunten[i * nn + j];
          for (let i = 0; i < mm; i++) {
            const rij = Array.from({ length: nn }, (_, j) => p(i, j)).filter(Boolean)
              .map((v) => ({ x: num(v, 10), y: num(v, 20), b: 0, sw: 0, ew: 0 }));
            polyPad(st, ctx.m, rij, (vlag & 32) !== 0);
          }
          for (let j = 0; j < nn; j++) {
            const kol = Array.from({ length: mm }, (_, i) => p(i, j)).filter(Boolean)
              .map((v) => ({ x: num(v, 10), y: num(v, 20), b: 0, sw: 0, ew: 0 }));
            polyPad(st, ctx.m, kol, (vlag & 1) !== 0);
          }
          return tel();
        }
        const sw0 = num(e, 40), ew0 = num(e, 41);
        const pts = hoekpunten
          .filter((v) => (num(v, 70) & 16) === 0)
          .map((v) => ({ x: num(v, 10), y: num(v, 20), b: num(v, 42), sw: num(v, 40, sw0), ew: num(v, 41, ew0) }));
        if (pts.length === 0) return;
        polylijn(st, vlag & 8 ? ctx.m : maal(ctx.m, ocs(e)), pts, (vlag & 1) === 1);
        return tel();
      }
      case "CIRCLE":
      case "ARC": {
        const st = lijnBak(e, ctx);
        if (!st) return;
        const m = maal(ctx.m, ocs(e));
        const r = num(e, 40);
        if (!(r > 0)) return;
        let t0 = 0, t1 = TAU;
        if (e.type === "ARC") {
          t0 = num(e, 50) * RAD;
          t1 = num(e, 51) * RAD;
          while (t1 <= t0) t1 += TAU;
        }
        const [cx, cy] = punt(m, num(e, 10), num(e, 20));
        const [ux, uy] = richting(m, r, 0), [vx, vy] = richting(m, 0, r);
        const d = nieuwDeel(st, cx + ux * Math.cos(t0) + vx * Math.sin(t0), cy + uy * Math.cos(t0) + vy * Math.sin(t0));
        ellipsboog(d, cx, cy, ux, uy, vx, vy, t0, t1);
        if (e.type === "CIRCLE") d.dicht = true;
        return tel();
      }
      case "ELLIPSE": {
        const st = lijnBak(e, ctx);
        if (!st) return;
        const k = num(e, 40, 1);
        const mx = num(e, 11), my = num(e, 21), mz = num(e, 31);
        let nx = num(e, 210), ny = num(e, 220), nz = num(e, 230, 1);
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        // Kleine as: N × grote as, maal de verhouding.
        const kx = (ny * mz - nz * my) * k, ky = (nz * mx - nx * mz) * k;
        const t0 = num(e, 41);
        let t1 = num(e, 42, TAU);
        while (t1 <= t0) t1 += TAU;
        const [cx, cy] = punt(ctx.m, num(e, 10), num(e, 20));
        const [ux, uy] = richting(ctx.m, mx, my), [vx, vy] = richting(ctx.m, kx, ky);
        const d = nieuwDeel(st, cx + ux * Math.cos(t0) + vx * Math.sin(t0), cy + uy * Math.cos(t0) + vy * Math.sin(t0));
        ellipsboog(d, cx, cy, ux, uy, vx, vy, t0, t1);
        if (Math.abs(t1 - t0 - TAU) < 1e-9) d.dicht = true;
        return tel();
      }
      case "SPLINE": {
        const st = lijnBak(e, ctx);
        if (!st) return;
        const ctrl: [number, number][] = [], pas: [number, number][] = [];
        for (const [c, v] of e.p) {
          const n = parseFloat(v) || 0;
          if (c === 10) ctrl.push([n, 0]); else if (c === 20 && ctrl.length) ctrl[ctrl.length - 1][1] = n;
          else if (c === 11) pas.push([n, 0]); else if (c === 21 && pas.length) pas[pas.length - 1][1] = n;
        }
        const knopen = e.p.filter(([c]) => c === 40).map(([, v]) => parseFloat(v) || 0);
        const gew = e.p.filter(([c]) => c === 41).map(([, v]) => parseFloat(v) || 1);
        const graad = num(e, 71, 3);
        const pts = ctrl.length >= 2
          ? graad <= 1 ? ctrl : bspline(graad, knopen, ctrl, gew.length === ctrl.length ? gew : null,
            Math.min(Math.max(ctrl.length * 8, 16), 400))
          : doorPunten(pas);
        if (pts.length < 2) return;
        polyPad(st, ctx.m, pts.map(([x, y]) => ({ x, y, b: 0, sw: 0, ew: 0 })), false);
        return tel();
      }
      case "TEXT":
        return tekstEnt(e, ctx, false);
      case "ATTRIB":
        return tekstEnt(e, ctx, true);
      case "MTEXT":
        return mtekst(e, ctx);
      case "INSERT": {
        if (!blokInvoegen(e, ctx, txt(e, 2), null)) return overslaan("INSERT");
        // Attribuutwaarden staan los in het stelsel waarin het INSERT staat; op
        // laag 0 of BYBLOCK nemen ze laag en kleur van het INSERT over.
        const eig = eigenschappen(e, ctx);
        if (!eig) return;
        const ac: Ctx = { ...ctx, laag: eig.laag, kleur: eig.rgb, lw: eig.lw, lt: eig.lt };
        for (const a of e.kind ?? []) tekstEnt(a, ac, true);
        return;
      }
      case "DIMENSION":
      case "ARC_DIMENSION":
      case "LARGE_RADIAL_DIMENSION": {
        // De maatvoering is als anoniem blok getekend, op zijn plaats in de tekening.
        const m0 = maal(ctx.m, verschuif(num(e, 12), num(e, 22)));
        if (!blokInvoegen(e, ctx, txt(e, 2), m0)) overslaan(e.type);
        return;
      }
      case "HATCH":
        return arcering(e, ctx);
      case "SOLID":
      case "TRACE": {
        const eig = eigenschappen(e, ctx);
        if (!eig) return;
        const m = maal(ctx.m, ocs(e));
        const h = [10, 11, 12, 13].map((c) => (heeft(e, c) ? punt(m, num(e, c), num(e, c + 10)) : null));
        h[3] ??= h[2];
        const volgorde = [h[0], h[1], h[3], h[2]].filter((q): q is [number, number] => q !== null);
        if (volgorde.length < 3) return;
        const d = nieuwDeel(vulVlak(hex(eig.rgb)), ...volgorde[0]);
        for (const q of volgorde.slice(1)) lijn(d, ...q);
        d.dicht = true;
        return tel();
      }
      case "3DFACE": {
        const st = lijnBak(e, ctx);
        if (!st) return;
        const h = [10, 11, 12, 13].map((c) => punt(ctx.m, num(e, c), num(e, c + 10)));
        const onzichtbaar = num(e, 70);
        for (let k = 0; k < 4; k++) {
          if (onzichtbaar & (1 << k)) continue;
          const a = h[k], b = h[(k + 1) % 4];
          if (a[0] === b[0] && a[1] === b[1]) continue;
          lijn(nieuwDeel(st, ...a), ...b);
        }
        return tel();
      }
      case "LEADER": {
        const st = lijnBak(e, ctx);
        if (!st) return;
        const pts: Hoekpunt[] = [];
        for (const [c, v] of e.p) {
          if (c === 10) pts.push({ x: parseFloat(v) || 0, y: 0, b: 0, sw: 0, ew: 0 });
          else if (c === 20 && pts.length) pts[pts.length - 1].y = parseFloat(v) || 0;
        }
        if (pts.length < 2) return;
        polyPad(st, ctx.m, pts, false);
        if (num(e, 71, 1) !== 0) pijlpunt(ctx.m, st.kleur, pts[0].x, pts[0].y, pts[1].x, pts[1].y, pijlMaat * ctx.lts);
        return tel();
      }
      case "MULTILEADER":
      case "MLEADER":
        return multileider(e, ctx);
      case "ATTDEF": case "POINT": case "VIEWPORT": case "SEQEND": case "VERTEX":
        return; // definities, hulppunten en vensters: niet op papier
      default: {
        // Een tabel e.d. is een verwijzing naar een anoniem blok.
        const naam = txt(e, 2);
        if (naam.startsWith("*") && t.blokken.has(naam.toUpperCase()) && blokInvoegen(e, ctx, naam, null)) return;
        overslaan(e.type);
      }
    }
  };

  const ctx0: Ctx = { m: EENHEID, laag: "", kleur: 0xffffff, lw: STANDAARD_DIKTE, lt: "CONTINUOUS", lts: 1, pad: [] };
  const model = t.ents.filter((e) => num(e, 67) !== 1);
  for (const e of model.length > 0 ? model : t.ents) teken(e, ctx0);
  if (elementen === 0 || !(maxX >= minX)) throw new DxfFout("leeg");

  // ───────────────────────────── schrijven ─────────────────────────────

  const w = maxX - minX, h = maxY - minY;
  const maat = Math.max(w, h) || 1;
  const rand = maat * 0.01;
  const W = w + 2 * rand, H = h + 2 * rand;
  const dec = Math.max(0, Math.min(6, Math.ceil(Math.log10(4000 / maat))));
  const f = 10 ** dec;
  const X = (x: number) => Math.round((x - minX + rand) * f);
  const Y = (y: number) => Math.round((maxY - y + rand) * f);
  const getal = (n: number) => geheel(n, dec);
  const toon = Math.min(MAX_BREED, (MAX_HOOG * W) / H);
  const perPx = W / toon;

  /** Padgegevens, in stukken van hoogstens ~8000 tekens (één `<path>` per stuk). */
  const padData = (delen: Deel[]): string[] => {
    const stukken: string[] = [];
    let s = "", px = NaN, py = NaN, cmd = "", vorige = "";
    const opdracht = (c: string) => { if (c !== cmd) { s += c; cmd = c; vorige = ""; } };
    const teken_ = (tk: string) => {
      if (vorige !== "" && tk[0] !== "-" && !(tk[0] === "." && vorige.includes("."))) s += " ";
      s += tk;
      vorige = tk;
    };
    for (const d of delen) {
      if (d.s.length === 0) continue;
      if (s.length > 8000) { stukken.push(s); s = ""; px = NaN; cmd = ""; vorige = ""; }
      const sx = X(d.x), sy = Y(d.y);
      if (sx !== px || sy !== py) {
        s += "M"; cmd = "M"; vorige = "";
        teken_(getal(sx)); teken_(getal(sy));
        px = sx; py = sy;
      }
      for (const g of d.s) {
        const ex = X(g.x), ey = Y(g.y), dx = ex - px, dy = ey - py;
        if (g.b) {
          if (dx === 0 && dy === 0) continue;
          opdracht("a");
          teken_(getal(Math.max(Math.round(g.b.rx * f), 1)));
          teken_(getal(Math.max(Math.round(g.b.ry * f), 1)));
          teken_(kort(g.b.rot === 0 ? 0 : -g.b.rot, 1));
          teken_(g.b.groot ? "1" : "0");
          teken_(g.b.ccw ? "0" : "1");
        } else {
          if (dx === 0 && dy === 0 && d.s.length > 1) continue;
          opdracht("l");
        }
        teken_(getal(dx));
        teken_(getal(dy));
        px = ex; py = ey;
      }
      if (d.dicht) { s += "z"; cmd = "z"; vorige = ""; px = sx; py = sy; }
    }
    if (s) stukken.push(s);
    return stukken;
  };

  const regels: string[] = [];
  const kader = `0 0 ${getal(Math.ceil(W * f))} ${getal(Math.ceil(H * f))}`;
  regels.push(`<svg xmlns="http://www.w3.org/2000/svg" class="dxf" viewBox="${kader}" `
    + `style="width:100%;max-width:${Math.round(toon)}px" fill="none" stroke-linecap="round" stroke-linejoin="round"`
    + `${teksten.length > 0 ? ' font-family="sans-serif"' : ""}>`);
  for (const v of vlakken) {
    const a = `<path fill="${v.kleur}"${v.dekking < 1 ? ` fill-opacity="${kort(v.dekking, 2)}"` : ""}`
      + `${v.evenodd ? ' fill-rule="evenodd"' : ""}`;
    for (const d of padData(v.delen)) regels.push(`${a} d="${d}"/>`);
  }
  for (const b of bakken.values()) {
    // Een lijndikte is een maat op papier: in beeldpunten, en niet mee geschaald
    // als de tekening kleiner getoond of afgedrukt wordt (zoals bij plotten). Het
    // streeppatroon rekent dan ook in beeldpunten, op de volle weergavemaat. Een
    // brede polylijn is geometrie en schaalt wel mee.
    let a = `<path stroke="${b.kleur}"`;
    if (b.eenheden) a += ` stroke-width="${sig(b.dikte)}" stroke-linecap="butt" stroke-linejoin="miter"`;
    else a += ` stroke-width="${sig(Math.max(b.dikte, MIN_DIKTE) * PX_PER_MM)}" vector-effect="non-scaling-stroke"`;
    if (b.streep) a += ` stroke-dasharray="${b.streep.map((v) => sig(v / perPx)).join(" ")}"`;
    for (const d of padData(b.delen)) regels.push(`${a} d="${d}"/>`);
  }
  const fx = (x: number) => getal(X(x)), fy = (y: number) => getal(Y(y));
  const perKleur = new Map<string, string[]>();
  for (const tk of teksten) {
    const x = fx(tk.x), y = fy(tk.y);
    const r = kort(-(tk.hoek * 180) / Math.PI, 2);
    const wf = Math.abs(tk.wf - 1) > 1e-3;
    let a = ` font-size="${sig(tk.h * 1.4)}"`;
    if (tk.anker) a += ` text-anchor="${tk.anker === 1 ? "middle" : "end"}"`;
    if (tk.lengte > 0) a += ` textLength="${sig(tk.lengte / tk.wf)}" lengthAdjust="spacingAndGlyphs"`;
    let x0 = x, y0 = y;
    if (wf) {
      a += ` transform="translate(${x} ${y})${r !== "0" ? ` rotate(${r})` : ""} scale(${sig(tk.wf)} 1)"`;
      x0 = "0"; y0 = "0";
    } else if (r !== "0") a += ` transform="rotate(${r} ${x} ${y})"`;
    let inhoud = tekstInhoud(tk.regels[0]);
    let over = 1;
    for (const regel of tk.regels.slice(1)) {
      if (!regel.trim()) { over++; continue; }
      inhoud += `<tspan x="${x0}" dy="${sig(tk.lh * over)}">${tekstInhoud(regel)}</tspan>`;
      over = 1;
    }
    const lijst = perKleur.get(tk.kleur) ?? [];
    lijst.push(`<text x="${x0}" y="${y0}"${a}>${inhoud}</text>`);
    perKleur.set(tk.kleur, lijst);
  }
  for (const [kleur, lijst] of perKleur) regels.push(`<g fill="${kleur}">`, ...lijst, "</g>");
  regels.push("</svg>");

  return {
    svg: regels.join("\n"), elementen, breedte: w, hoogte: h, oorsprong: [minX - rand, maxY + rand], overgeslagen,
  };
}

/** Een geheel getal n als n / 10^dec, zo kort mogelijk ("0.5" → ".5"). */
function geheel(n: number, dec: number): string {
  if (dec === 0 || n === 0) return String(n);
  const s = String(Math.abs(n)).padStart(dec + 1, "0");
  const ip = s.slice(0, s.length - dec), fp = s.slice(s.length - dec).replace(/0+$/, "");
  const r = fp ? `${ip === "0" ? "" : ip}.${fp}` : ip;
  return n < 0 ? `-${r}` : r;
}

/** Een getal met hoogstens `dec` decimalen, zonder overbodige nullen. */
function kort(v: number, dec: number): string {
  const r = Number(v.toFixed(dec));
  return r === 0 ? "0" : String(r).replace(/^(-?)0\./, "$1.");
}

/** Een getal op drie significante cijfers. */
function sig(v: number): string {
  const r = Number(v.toPrecision(3));
  return r === 0 ? "0" : String(r).replace(/^(-?)0\./, "$1.");
}
