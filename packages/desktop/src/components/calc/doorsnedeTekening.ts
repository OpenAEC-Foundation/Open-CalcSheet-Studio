import { schuifLijn, type DoorsnedeDefinitie, type Punt } from "./doorsnedeDefinitie.ts";

/*
 * De tekening van het blad Spanningen in een doorsnede als SVG-tekst: de doorsnede op schaal
 * met het spanningsveld, de neutrale lijn en de assen, en de diagrammen van σ en τ langs de
 * assen. Het beeld, de afdruk en de download gebruiken dezelfde tekst. Alles staat in de SVG
 * zelf: een los bestand heeft geen stijlblad.
 *
 * De getallen komen uit het blad (`uit`), onafgerond. De spanning is lineair in y en z, dus
 * het veld loopt in de richting van de gradiënt en de neutrale lijn volgt uit dezelfde drie
 * getallen. De vorm van τ komt uit de rekenkern (schuifLijn), de piek uit het blad.
 *
 * Teksten komen van de aanroeper, in de taal van de app.
 */

/** De teksten die de tekening vraagt; ze staan in locales/{nl,en}/beelden.json onder doorsnede.tekening. */
export const TEKST_SLEUTELS = [
  "komma", "ongeldig", "nogNiet", "sigmaZ", "sigmaY", "tauZ", "tauY", "eenheid",
  "neutraal", "neutraalBuiten", "geenMoment", "maxLegenda", "minLegenda", "vLegenda", "tauZLegenda", "tauYLegenda", "afspraak1", "afspraak2",
] as const;
export type DoorsnedeTeksten = Record<(typeof TEKST_SLEUTELS)[number], string>;

export interface DoorsnedeMaat {
  /** Naam van de invoer in het blad. */
  naam: string;
  waarde: number;
  x: number;
  y: number;
  label: string;
}

export interface DoorsnedeTekening {
  svg: string;
  breedte: number;
  hoogte: number;
  /** De maten die het beeld klikbaar maakt. */
  maten: DoorsnedeMaat[];
  /** Pixels per mm van de doorsnede, en het zwaartepunt in pixels. */
  schaal: number;
  oorsprong: { x: number; y: number };
  /** De diagrammen als [plaats, waarde]: voor de controle. */
  lijnen: { sigmaZ: Punt[]; tauZ: Punt[]; sigmaY: Punt[]; tauY: Punt[] };
  /** Zoals een spanning in de tekening staat. */
  fmt: (w: number) => string;
}

const LIJN = "#374151";
const TREK = "#b91c1c";
const DRUK = "#1d4ed8";
const SCHUIF = "#0f766e";
const MAAT = "#2563eb";
const TEKST = "#1f2937";
const GRIJS = "#6b7280";

/** Smaller wordt het onleesbaar; een smaller vak schaalt de hele tekening (DoorsnedeDesigner.tsx). */
export const DOORSNEDE_MIN_BREEDTE = 340;
/** In zoveel stroken loopt het veld van σ_min naar σ_max: geen stappen te zien. */
export const VELD_STROKEN = 64;

const r = (w: number) => (Math.round(w * 100) / 100).toString();
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const clamp = (w: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, w));

/** Tekst met onderschrift: `V_z` wordt V met een kleine z. */
function metIndex(t: string): string {
  return esc(t).replace(/_(\{[^}]+\}|[\p{L}\p{N},]+)/gu, (_m, i: string) =>
    `<tspan dy="2" font-size="0.8em">${i.replace(/[{}]/g, "")}</tspan><tspan dy="-2">&#8203;</tspan>`);
}
const lijn = (x1: number, y1: number, x2: number, y2: number, kleur: string, breed: number, extra = "") =>
  `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="${kleur}" stroke-width="${r(breed)}"${extra}/>`;
const tekst = (x: number, y: number, t: string, anker = "start", kleur = TEKST, grootte = 10, extra = "") =>
  `<text x="${r(x)}" y="${r(y)}" text-anchor="${anker}" fill="${kleur}" font-size="${grootte}" font-family="Arial, Helvetica, sans-serif"${extra}>${metIndex(t)}</text>`;
const HALO = ' paint-order="stroke" stroke="#ffffff" stroke-width="2.5" stroke-linejoin="round"';

/** Tussen wit en de kleur van trek of druk, volgens σ/S. */
export function kleurVan(w: number, S: number): string {
  if (!(S > 0)) return "rgb(255,255,255)";
  const t = clamp(Math.abs(w) / S, 0, 1);
  const doel = w >= 0 ? [185, 28, 28] : [29, 78, 216];
  const m = doel.map((c) => Math.round(255 + (c - 255) * t));
  return `rgb(${m[0]},${m[1]},${m[2]})`;
}

/** Het deel van een bolle vorm waarvoor nx·y + nz·z ≥ c. */
function knip(rand: Punt[], nx: number, nz: number, c: number): Punt[] {
  const uit: Punt[] = [];
  rand.forEach((p, i) => {
    const q = rand[(i + 1) % rand.length];
    const dp = nx * p[0] + nz * p[1] - c;
    const dq = nx * q[0] + nz * q[1] - c;
    if (dp >= 0) uit.push(p);
    if (dp * dq < 0) {
      const f = dp / (dp - dq);
      uit.push([p[0] + (q[0] - p[0]) * f, p[1] + (q[1] - p[1]) * f]);
    }
  });
  return uit;
}

/** Een stuk van een lijn binnen een rechthoek (Liang-Barsky); null als er niets overblijft. */
function binnen(p: Punt, q: Punt, xa: number, xb: number, ya: number, yb: number): [Punt, Punt] | null {
  let t0 = 0, t1 = 1;
  const d: Punt = [q[0] - p[0], q[1] - p[1]];
  for (const [a, c] of [[-d[0], p[0] - xa], [d[0], xb - p[0]], [-d[1], p[1] - ya], [d[1], yb - p[1]]] as const) {
    if (a === 0) {
      if (c < 0) return null;
      continue;
    }
    const f = c / a;
    if (a < 0) t0 = Math.max(t0, f);
    else t1 = Math.min(t1, f);
    if (t0 > t1) return null;
  }
  return [[p[0] + t0 * d[0], p[1] + t0 * d[1]], [p[0] + t1 * d[0], p[1] + t1 * d[1]]];
}

interface Diagram {
  /** De plaats van de as en de richting: `v` voor een staand diagram (waarde naar rechts), `h` voor een liggend (waarde omlaag). */
  soort: "v" | "h";
  x0: number;
  y0: number;
  /** De ruimte voor de waarden. */
  maat: number;
  /** Van plaats s naar de pixel langs de as. */
  plek: (s: number) => number;
  punten: Punt[];
  kleurPlus: string;
  kleurMin: string;
  /** Welke punten een getal krijgen. */
  labels: Punt[];
  /** `eind`: de twee uiteinden van een rechte lijn, tegenover het vlak. `piek`: in het vlak, bij de top. */
  soortLabel: "eind" | "piek";
  fmt: (w: number) => string;
  /** De naam voor de controle. */
  deel: string;
}

/** Punten op een lijn, met een punt erbij waar de waarde door nul gaat. */
function metNul(punten: Punt[]): Punt[] {
  const uit: Punt[] = [];
  punten.forEach((p, i) => {
    if (i > 0) {
      const q = punten[i - 1];
      if (q[1] * p[1] < 0 && p[0] !== q[0]) uit.push([q[0] + ((p[0] - q[0]) * q[1]) / (q[1] - p[1]), 0]);
    }
    uit.push(p);
  });
  return uit;
}

/** Eén diagram: de as, de vlakken met + en −, en de getallen. */
function tekenDiagram(d: Diagram): string {
  const pt = metNul(d.punten);
  const waarden = pt.map((p) => p[1]);
  const vlo = Math.min(0, ...waarden);
  const vhi = Math.max(0, ...waarden);
  const k = vhi > vlo ? d.maat / (vhi - vlo) : 0;
  const nul = (d.soort === "v" ? d.x0 : d.y0) + (0 - vlo) * k;
  const xy = (s: number, w: number): [number, number] => {
    const a = d.plek(s);
    const b = nul + w * k;
    return d.soort === "v" ? [b, a] : [a, b];
  };
  const uit: string[] = [];
  const vlak = (teken: 1 | -1, kleur: string) => {
    const delen = pt.map(([s, w]) => xy(s, teken > 0 ? Math.max(w, 0) : Math.min(w, 0)));
    const begin = xy(pt[0][0], 0);
    const eind = xy(pt[pt.length - 1][0], 0);
    const punten = [begin, ...delen, eind].map(([x, y]) => `${r(x)},${r(y)}`).join(" ");
    const heeft = pt.some(([, w]) => (teken > 0 ? w > 1e-9 : w < -1e-9));
    if (!heeft) return;
    uit.push(`<polygon points="${punten}" fill="${kleur}" fill-opacity="0.22" stroke="${kleur}" stroke-width="1.1" stroke-linejoin="round"/>`);
    // Het teken midden in het brede deel van het vlak, als daar ruimte is.
    const piek = Math.max(...pt.map((p) => teken * p[1]));
    const [s0, s1] = [pt[0][0], pt[pt.length - 1][0]];
    const waardeOp = (s: number) => {
      const i = pt.findIndex((p) => p[0] >= s);
      if (i <= 0) return pt[Math.max(i, 0)][1];
      const [a, c] = [pt[i - 1], pt[i]];
      return c[0] > a[0] ? a[1] + ((c[1] - a[1]) * (s - a[0])) / (c[0] - a[0]) : c[1];
    };
    const plekken = Array.from({ length: 81 }, (_, i) => s0 + ((s1 - s0) * i) / 80).filter((q) => teken * waardeOp(q) >= 0.5 * piek);
    if (plekken.length > 0) {
      const midden = (plekken[0] + plekken[plekken.length - 1]) / 2;
      const w = waardeOp(midden);
      if (teken * w * k > 14) {
        const [tx, ty] = xy(midden, w / 2);
        uit.push(tekst(tx, ty + 3.5, teken > 0 ? "+" : "−", "middle", kleur, 11, ' font-weight="700"'));
      }
    }
  };
  vlak(1, d.kleurPlus);
  vlak(-1, d.kleurMin);
  const [lo, hi] = [d.plek(pt[0][0]), d.plek(pt[pt.length - 1][0])];
  uit.push(d.soort === "v" ? lijn(nul, lo - 3, nul, hi + 3, LIJN, 0.8) : lijn(lo - 3, nul, hi + 3, nul, LIJN, 0.8));
  // De getallen. Een uiteinde staat tegenover zijn vlak, als daar plaats is; een top in het vlak.
  const PLAATS = 32;
  d.labels.forEach(([s, w]) => {
    if (Math.abs(w) < 1e-9) return;
    const [x, y] = xy(s, w);
    const kleur = w >= 0 ? d.kleurPlus : d.kleurMin;
    const opAs = d.plek(s);
    if (d.soort === "v") {
      if (d.soortLabel === "piek") {
        const naar = w >= 0 ? x - 2 : x + 2;
        uit.push(tekst(naar, clamp(y + 3, lo + 9, hi - 2), d.fmt(w), w >= 0 ? "end" : "start", kleur, 9, HALO));
        return;
      }
      const vrij = w < 0 ? d.x0 + d.maat - nul : nul - d.x0;
      const tegenover = vrij >= PLAATS;
      const naarRechts = w < 0 ? tegenover : !tegenover;
      const hoogte = opAs <= (lo + hi) / 2 ? opAs + 9 : opAs - 3;
      uit.push(tekst(nul + (naarRechts ? 3 : -3), hoogte, d.fmt(w), naarRechts ? "start" : "end", kleur, 9, HALO));
    } else {
      if (d.soortLabel === "piek") {
        uit.push(tekst(clamp(x, lo + 14, hi - 14), y + (w >= 0 ? 9 : -2), d.fmt(w), "middle", kleur, 9, HALO));
        return;
      }
      // Liggend: een negatief vlak gaat omhoog, dan het getal onder de as, en omgekeerd.
      const omhoogVrij = nul - d.y0 >= 10;
      const hoogte = w < 0 || !omhoogVrij ? nul + 10 : nul - 3;
      const links = opAs <= (lo + hi) / 2;
      uit.push(tekst(opAs + (links ? 1 : -1), hoogte, d.fmt(w), links ? "start" : "end", kleur, 9, HALO));
    }
  });
  return `<g data-deel="${d.deel}">${uit.join("")}</g>`;
}

/**
 * Tekent de doorsnede in een vlak van `breedte` pixels. `maxHoogte`: de doorsnede wordt niet
 * groter dan past. `interactief`: de maten uit `maten` krijgen geen tekst, het beeld zet er
 * knoppen op.
 */
export function tekenDoorsnede(
  def: DoorsnedeDefinitie,
  uit: Record<string, number>,
  t: DoorsnedeTeksten,
  breedte: number,
  interactief = false,
  maxHoogte = Infinity,
): DoorsnedeTekening {
  const W = Math.max(DOORSNEDE_MIN_BREEDTE, breedte);
  const getal = (w: number) => {
    const a = Math.abs(w);
    const s = (a >= 1000 ? a.toFixed(0) : a.toFixed(1)).replace(".", t.komma);
    return `${w < 0 && Number(s.replace(t.komma, ".")) !== 0 ? "−" : ""}${s}`;
  };
  const fmt = (w: number) => `${getal(w)} ${t.eenheid}`;
  const maten: DoorsnedeMaat[] = [];
  const leeg = { sigmaZ: [] as Punt[], tauZ: [] as Punt[], sigmaY: [] as Punt[], tauY: [] as Punt[] };
  const omhul = (svg: string, H: number) => `<svg xmlns="http://www.w3.org/2000/svg" width="${r(W)}" height="${r(H)}" viewBox="0 0 ${r(W)} ${r(H)}"><rect x="0" y="0" width="${r(W)}" height="${r(H)}" fill="#ffffff"/>${svg}</svg>`;

  if (!def.geldig) {
    const H = 60;
    return { svg: omhul(tekst(W / 2, 34, t.ongeldig, "middle", TREK, 11), H), breedte: W, hoogte: H, maten, schaal: 0, oorsprong: { x: 0, y: 0 }, lijnen: leeg, fmt };
  }

  // ── indeling ──────────────────────────────────────────────────────────────
  const mL = 8;
  const mR = 8;
  const mT = 8;
  const tussen = 14;
  const dB = clamp(W * 0.19, 66, 150);
  const sA = W - mL - mR - 2 * dB - 2 * tussen;
  const rH = clamp(W * 0.1, 40, 66);
  const titelH = 13;
  const benedenH = 2 * (rH + titelH + 6);
  const afspraakH = 28;
  const padLB = 26;
  const padRO = 22;
  const maxSectie = clamp(Math.min(sA * 1.3, maxHoogte - mT - benedenH - afspraakH - 8), 110, 900);
  const s = Math.min((sA - padLB - padRO) / def.B, (maxSectie - padLB - padRO) / def.H);
  const sectieH = Math.max(def.H * s + padLB + padRO, 110);
  const midX = mL + padLB + (sA - padLB - padRO) / 2;
  const midY = mT + padLB + (sectieH - padLB - padRO) / 2;
  const ox = midX + (def.yc - def.B / 2) * s;
  const oy = midY + (def.zc - def.H / 2) * s;
  const X = (y: number) => ox + y * s;
  const Y = (z: number) => oy + z * s;
  // De diagrammen volgen de schaal van de doorsnede, tenzij de doorsnede te plat is om te lezen.
  const sZ = Math.max(s, 96 / def.H);
  const sY = Math.max(s, 96 / def.B);
  const Yd = (z: number) => midY + (z + def.zc - def.H / 2) * sZ;
  const Xd = (y: number) => midX + (y + def.yc - def.B / 2) * sY;
  const [zLo, zHi] = [-def.zc, def.H - def.zc];
  const [yLo, yHi] = [-def.yc, def.B - def.yc];
  const totaalH = mT + sectieH + benedenH + afspraakH + 4;

  const svg: string[] = [];
  const padVan = (randen: Punt[][]) => randen
    .filter((l) => l.length > 2)
    .map((l) => `M ${l.map(([y, z]) => `${r(X(y))} ${r(Y(z))}`).join(" L ")} Z`)
    .join(" ");
  const omtrekD = padVan(def.omtrek);

  // ── het veld ──────────────────────────────────────────────────────────────
  const heeft = Number.isFinite(uit["σ_N"]) && Number.isFinite(uit.k_y) && Number.isFinite(uit.k_z);
  const [σN, ky, kz] = heeft ? [uit["σ_N"], uit.k_y, uit.k_z] : [0, 0, 0];
  const σ = (y: number, z: number) => σN + ky * z + kz * y;
  const σmax = heeft && Number.isFinite(uit["σ_max"]) ? uit["σ_max"] : 0;
  const σmin = heeft && Number.isFinite(uit["σ_min"]) ? uit["σ_min"] : 0;
  const S = Math.max(Math.abs(σmax), Math.abs(σmin));
  const K = Math.hypot(ky, kz);
  const vult = heeft && K > 0 && σmax - σmin > 1e-9;
  // Stroken in de richting van de neutrale lijn, en geen kleurverloop met een id: op papier
  // staat een kopie van de tekening en het origineel is verborgen. Een verwijzing naar een id
  // wijst dan naar het verborgen exemplaar. Elke strook loopt iets onder de volgende door, zodat
  // er geen naad te zien is.
  svg.push(`<g data-deel="veld">`);
  if (vult) {
    const stap = (σmax - σmin) / VELD_STROKEN;
    for (let i = 0; i < VELD_STROKEN; i++) {
      const a = σmin + i * stap;
      const onder = i === 0 ? a - stap : a;
      const boven = a + stap * (i === VELD_STROKEN - 1 ? 2 : 1.3);
      const d = padVan([knip(knip(def.omhulling, kz, ky, onder - σN), -kz, -ky, σN - boven)]);
      if (d) svg.push(`<path data-sigma="${r(a + stap / 2)}" d="${d}" fill="${kleurVan(a + stap / 2, S)}"/>`);
    }
    // De rand van de holte dekt ook de rafel van de stroken langs de omhullende; de omtrek komt erop.
    if (def.holtes.length > 0) svg.push(`<path d="${padVan(def.holtes)}" fill="#ffffff" stroke="#ffffff" stroke-width="1.6"/>`);
  } else if (heeft) {
    svg.push(`<path data-sigma="${r(σN)}" d="${omtrekD}" fill="${kleurVan(σN, S)}" fill-rule="evenodd"/>`);
  }
  svg.push(`</g><g data-deel="omtrek"><path d="${omtrekD}" fill="${heeft ? "none" : "#f3f4f6"}" fill-rule="evenodd" stroke="${LIJN}" stroke-width="1.3" stroke-linejoin="round"/></g>`);

  // ── de neutrale lijn ──────────────────────────────────────────────────────
  if (vult && σmax > 0 && σmin < 0) {
    // De voet van de loodlijn uit het zwaartepunt, dan langs de lijn.
    const [ux, uy] = [kz / K, ky / K];
    const e = -σN / K;
    const groot = 4 * Math.hypot(def.B, def.H);
    const p: Punt = [e * ux - uy * groot, e * uy + ux * groot];
    const q: Punt = [e * ux + uy * groot, e * uy - ux * groot];
    const stuk = binnen(p, q, yLo - 8 / s, yHi + 8 / s, zLo - 8 / s, zHi + 8 / s);
    if (stuk) {
      const [a, c] = stuk;
      svg.push(`<line data-deel="neutraal" x1="${r(X(a[0]))}" y1="${r(Y(a[1]))}" x2="${r(X(c[0]))}" y2="${r(Y(c[1]))}" stroke="#111827" stroke-width="1.2" stroke-dasharray="6 3"/>`);
      const eind = X(a[0]) > X(c[0]) ? a : c;
      // Niet op de naam van de y-as: die staat aan dezelfde kant.
      const opAs = Math.abs(Y(eind[1]) - oy) < 14 ? 12 : 0;
      svg.push(tekst(X(eind[0]) + 2, Y(eind[1]) - 3 + (eind[1] >= 0 ? opAs + 4 : -opAs), t.neutraal, "start", "#111827", 9, HALO));
    }
  }

  // ── de assen ──────────────────────────────────────────────────────────────
  const ASPUNT = "M 0 0 L -6 -3 L -6 3 Z";
  const xEind = X(yHi) + 16;
  const yEind = Y(zHi) + 16;
  svg.push(`<g data-deel="assen">`);
  svg.push(lijn(X(yLo) - 6, oy, xEind, oy, TEKST, 0.7, ' stroke-dasharray="8 3 2 3"'));
  svg.push(lijn(ox, Y(zLo) - 6, ox, yEind, TEKST, 0.7, ' stroke-dasharray="8 3 2 3"'));
  svg.push(`<path d="${ASPUNT}" transform="translate(${r(xEind)} ${r(oy)})" fill="${TEKST}"/>`);
  svg.push(`<path d="${ASPUNT}" transform="translate(${r(ox)} ${r(yEind)}) rotate(90)" fill="${TEKST}"/>`);
  svg.push(tekst(xEind - 4, oy - 5, "y", "middle", TEKST, 10, ' font-style="italic"'));
  svg.push(tekst(ox + 6, yEind - 2, "z", "start", TEKST, 10, ' font-style="italic"'));
  svg.push(`<circle cx="${r(ox)}" cy="${r(oy)}" r="2.6" fill="#ffffff" stroke="${TEKST}" stroke-width="0.9"/>`);
  svg.push(`</g>`);

  // ── de maten ──────────────────────────────────────────────────────────────
  const yM = Y(zLo) - 13;
  const xM = X(yLo) - 13;
  const maatB = def.vorm === 3 || def.vorm === 4 ? "D" : "b";
  const eigen = !def.profiel;
  const opKnop = interactief && eigen;
  svg.push(lijn(X(yLo), yM, X(yHi), yM, MAAT, 0.9), lijn(X(yLo), yM - 3, X(yLo), yM + 3, MAAT, 1), lijn(X(yHi), yM - 3, X(yHi), yM + 3, MAAT, 1));
  if (!opKnop) svg.push(tekst((X(yLo) + X(yHi)) / 2, yM - 3, `${maatB} = ${getal(def.B).replace(/[,.]0$/, "")}`, "middle", MAAT, 9));
  if (def.vorm !== 3 && def.vorm !== 4) {
    svg.push(lijn(xM, Y(zLo), xM, Y(zHi), MAAT, 0.9), lijn(xM - 3, Y(zLo), xM + 3, Y(zLo), MAAT, 1), lijn(xM - 3, Y(zHi), xM + 3, Y(zHi), MAAT, 1));
    const mid = (Y(zLo) + Y(zHi)) / 2;
    if (!opKnop) svg.push(`<text x="${r(xM - 3)}" y="${r(mid)}" text-anchor="middle" fill="${MAAT}" font-size="9" font-family="Arial, Helvetica, sans-serif" transform="rotate(-90 ${r(xM - 3)} ${r(mid)})">h = ${esc(getal(def.H).replace(/[,.]0$/, ""))}</text>`);
    if (opKnop) maten.push({ naam: "h", waarde: def.H, x: xM - 2, y: mid, label: "h" });
  }
  if (opKnop) maten.push({ naam: maatB, waarde: def.B, x: (X(yLo) + X(yHi)) / 2, y: yM, label: maatB });
  if (def.profiel) svg.push(tekst(mL, mT + 7, def.profiel, "start", TEKST, 11, ' font-weight="700"'));

  // ── de diagrammen ─────────────────────────────────────────────────────────
  const lijnen = { ...leeg };
  const yBoven = mT + sectieH + 6;
  const rij1 = yBoven + titelH;
  const rij2 = rij1 + rH + titelH + 6;
  const x1 = mL + sA + tussen;
  const x2 = x1 + dB + tussen;
  const τz = Number.isFinite(uit["τ_z_max"]) ? uit["τ_z_max"] : 0;
  const τy = Number.isFinite(uit["τ_y_max"]) ? uit["τ_y_max"] : 0;
  if (heeft) {
    lijnen.sigmaZ = [[zLo, σ(0, zLo)], [zHi, σ(0, zHi)]];
    lijnen.sigmaY = [[yLo, σ(yLo, 0)], [yHi, σ(yHi, 0)]];
    const lz = schuifLijn(def, "z");
    const ly = schuifLijn(def, "y");
    const qz = Math.max(...lz.map((p) => p.q));
    const qy = Math.max(...ly.map((p) => p.q));
    lijnen.tauZ = lz.map((p) => [p.s, (Math.sign(def.Vz) * τz * p.q) / qz]);
    lijnen.tauY = ly.map((p) => [p.s, (Math.sign(def.Vy) * τy * p.q) / qy]);
    const piek = (l: Punt[]): Punt[] => {
      const p = l.reduce((m, q) => (Math.abs(q[1]) > Math.abs(m[1]) ? q : m), l[0]);
      return Math.abs(p[1]) > 0 ? [p] : [];
    };
    const yTitel = Yd(zLo) - 7;
    svg.push(tekst(x1, yTitel, t.sigmaZ, "start", GRIJS, 9.5, ' font-weight="700"'));
    svg.push(tekst(x2, yTitel, t.tauZ, "start", GRIJS, 9.5, ' font-weight="700"'));
    svg.push(tekenDiagram({ soort: "v", x0: x1, y0: 0, maat: dB, plek: Yd, punten: lijnen.sigmaZ, kleurPlus: TREK, kleurMin: DRUK, labels: lijnen.sigmaZ, soortLabel: "eind", fmt: getal, deel: "sigma-z" }));
    svg.push(tekenDiagram({ soort: "v", x0: x2, y0: 0, maat: dB, plek: Yd, punten: lijnen.tauZ, kleurPlus: SCHUIF, kleurMin: SCHUIF, labels: piek(lijnen.tauZ), soortLabel: "piek", fmt: getal, deel: "tau-z" }));
    svg.push(tekst(mL, yBoven + 7, t.sigmaY, "start", GRIJS, 9.5, ' font-weight="700"'));
    svg.push(tekenDiagram({ soort: "h", x0: 0, y0: rij1, maat: rH - 10, plek: Xd, punten: lijnen.sigmaY, kleurPlus: TREK, kleurMin: DRUK, labels: lijnen.sigmaY, soortLabel: "eind", fmt: getal, deel: "sigma-y" }));
    svg.push(tekst(mL, rij1 + rH + 7, t.tauY, "start", GRIJS, 9.5, ' font-weight="700"'));
    svg.push(tekenDiagram({ soort: "h", x0: 0, y0: rij2, maat: rH - 10, plek: Xd, punten: lijnen.tauY, kleurPlus: SCHUIF, kleurMin: SCHUIF, labels: piek(lijnen.tauY), soortLabel: "piek", fmt: getal, deel: "tau-y" }));

    // ── markeringen in het veld ─────────────────────────────────────────────
    const uiterst = (fn: (a: number, c: number) => boolean) => def.hoekpunten.reduce((m, p) => (fn(σ(p[0], p[1]), σ(m[0], m[1])) ? p : m), def.hoekpunten[0]);
    const pMax = uiterst((a, c) => a > c);
    const pMin = uiterst((a, c) => a < c);
    if (vult) {
      svg.push(`<circle cx="${r(X(pMax[0]))}" cy="${r(Y(pMax[1]))}" r="3" fill="${TREK}" stroke="#ffffff" stroke-width="1"/>`);
      svg.push(`<circle cx="${r(X(pMin[0]))}" cy="${r(Y(pMin[1]))}" r="3" fill="${DRUK}" stroke="#ffffff" stroke-width="1"/>`);
    }
    if (Number.isFinite(uit.y_v) && Number.isFinite(uit.z_v) && (uit["σ_v_max"] ?? 0) > 0) {
      const [mx, my] = [X(uit.y_v), Y(uit.z_v)];
      svg.push(`<path d="M ${r(mx)} ${r(my - 4.5)} L ${r(mx + 4.5)} ${r(my)} L ${r(mx)} ${r(my + 4.5)} L ${r(mx - 4.5)} ${r(my)} Z" fill="#fbbf24" stroke="${TEKST}" stroke-width="0.9"/>`);
    }

    // ── de kleurschaal en de waarden ────────────────────────────────────────
    const lx = x1;
    const lb = W - mR - lx;
    const ly0 = yBoven + 2;
    const nulOp = σmax > σmin ? clamp((0 - σmin) / (σmax - σmin), 0, 1) : 0;
    svg.push(`<g data-deel="schaal">`);
    const vakjes = σmax > σmin ? 48 : 1;
    for (let i = 0; i < vakjes; i++) {
      const w = σmin + ((σmax - σmin) * (i + 0.5)) / vakjes;
      svg.push(`<rect x="${r(lx + (lb * i) / vakjes)}" y="${r(ly0)}" width="${r(lb / vakjes + (i < vakjes - 1 ? 0.6 : 0))}" height="9" fill="${kleurVan(w, S)}"/>`);
    }
    svg.push(`<rect x="${r(lx)}" y="${r(ly0)}" width="${r(lb)}" height="9" fill="none" stroke="${LIJN}" stroke-width="0.6"/>`);
    if (nulOp > 0 && nulOp < 1) svg.push(lijn(lx + lb * nulOp, ly0, lx + lb * nulOp, ly0 + 12, LIJN, 0.7));
    svg.push(tekst(lx, ly0 + 19, getal(σmin), "start", DRUK, 9));
    svg.push(tekst(lx + lb, ly0 + 19, getal(σmax), "end", TREK, 9));
    svg.push(tekst(lx + lb / 2, ly0 + 19, t.eenheid, "middle", GRIJS, 8.5));
    svg.push(`</g>`);
    const regels: [string, string][] = [
      [TREK, `● ${t.maxLegenda} = ${fmt(σmax)}`],
      [DRUK, `● ${t.minLegenda} = ${fmt(σmin)}`],
    ];
    if (Number.isFinite(uit["σ_v_max"])) regels.push(["#b45309", `◆ ${t.vLegenda} = ${fmt(uit["σ_v_max"])}`]);
    regels.push([SCHUIF, `${t.tauZLegenda} = ${fmt(τz)}`]);
    regels.push([SCHUIF, `${t.tauYLegenda} = ${fmt(τy)}`]);
    if (!vult) regels.push([GRIJS, t.geenMoment]);
    else if (!(σmax > 0 && σmin < 0)) regels.push([GRIJS, t.neutraalBuiten]);
    regels.forEach(([k, regel], i) => svg.push(tekst(lx, ly0 + 32 + i * 12, regel, "start", k, 9.5)));
  } else {
    svg.push(`<g data-deel="sigma-z"></g><g data-deel="tau-z"></g><g data-deel="sigma-y"></g><g data-deel="tau-y"></g><g data-deel="schaal"></g>`);
    svg.push(tekst(x1, yBoven + 10, t.nogNiet, "start", GRIJS, 9.5));
  }

  // ── de tekenafspraak ──────────────────────────────────────────────────────
  const yAfspraak = totaalH - afspraakH + 11;
  svg.push(tekst(mL, yAfspraak, t.afspraak1, "start", GRIJS, 9));
  svg.push(tekst(mL, yAfspraak + 11, t.afspraak2, "start", GRIJS, 9));

  return {
    svg: omhul(svg.join(""), totaalH),
    breedte: W, hoogte: totaalH, maten, schaal: s, oorsprong: { x: ox, y: oy }, lijnen, fmt,
  };
}
