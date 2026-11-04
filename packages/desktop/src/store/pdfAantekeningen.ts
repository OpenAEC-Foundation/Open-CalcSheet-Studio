/*
 * Aantekeningen op een PDF-blad, en het rekenwerk achter het zoomen.
 *
 * Een aantekening hoort bij een pagina en staat in punten van die pagina (1/72 inch, oorsprong
 * linksboven, na rotatie). Zo is hij onafhankelijk van de zoom en ligt hij op papier op dezelfde
 * plek. De PDF zelf verandert niet: de aantekeningen staan ernaast in het projectbestand.
 *
 * De tekening is SVG-tekst, voor het scherm en het papier dezelfde. Die tekst gaat als markup de
 * pagina in, en een aantekening kan uit een bestand van iemand anders komen. Daarom laat
 * `leesAantekeningen` alleen getallen, een kleurcode en een schoon id door, en is tekst altijd
 * ontsnapt.
 *
 * Geen imports: het controlescript (scripts/check-pdf-viewer.mjs) laadt dit bestand in Node.
 */

export type PdfPunt = [number, number];

interface Basis {
  id: string;
  /** Paginanummer vanaf 0. */
  pagina: number;
  kleur: string;
  /** Lijndikte in punten. */
  dikte: number;
}

export type PdfAantekening =
  | (Basis & { soort: "pen" | "markeer"; punten: PdfPunt[] })
  | (Basis & { soort: "pijl"; van: PdfPunt; naar: PdfPunt })
  | (Basis & { soort: "kader" | "wolk"; x: number; y: number; b: number; h: number })
  | (Basis & { soort: "tekst"; x: number; y: number; tekst: string; grootte: number });

/** Het gereedschap op het lint, in deze volgorde. */
export const GEREEDSCHAP = ["kies", "pen", "markeer", "tekst", "pijl", "kader", "wolk"] as const;
export type PdfGereedschap = (typeof GEREEDSCHAP)[number];

export const KLEUREN = ["#dc2626", "#2563eb", "#16a34a", "#f59e0b", "#111827"];
export const DIKTEN = [1, 2, 4];
export const MAX_DIKTE = 40;

const MAX_AANTEKENINGEN = 5000;
const MAX_PUNTEN = 20000;
const MAX_TEKST = 5000;

// ── Zoomen ────────────────────────────────────────────────────────────────────

export const ZOOM_MIN = 25;
export const ZOOM_MAX = 800;
const ZOOM_STAPPEN = [25, 50, 75, 100, 125, 150, 200, 300, 400, 600, 800];

/** De ruimte in het paneel naast en onder de pagina: zie .pdf-weergave. */
const MARGE_B = 32;
const MARGE_H = 52;

/** 100 % is de ware grootte: een punt is 96/72 pixel. */
export const puntNaarPixel = (punten: number, procent: number) => (punten * 96 * procent) / (72 * 100);

export function beperkZoom(procent: number): number {
  if (!Number.isFinite(procent)) return 100;
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, procent));
}

/** De zoom waarbij de pagina past: op de breedte, of helemaal in beeld. */
export function passendeZoom(breedte: number, hoogte: number, paneelB: number, paneelH: number, modus: "breedte" | "pagina"): number {
  const opB = ((paneelB - MARGE_B) / Math.max(1, puntNaarPixel(breedte, 100))) * 100;
  if (modus === "breedte") return beperkZoom(opB);
  const opH = ((paneelH - MARGE_H) / Math.max(1, puntNaarPixel(hoogte, 100))) * 100;
  return beperkZoom(Math.min(opB, opH));
}

/** De volgende vaste stap omhoog (1) of omlaag (-1), ook vanaf een tussenwaarde. */
export function zoomStap(procent: number, richting: 1 | -1): number {
  if (richting > 0) return ZOOM_STAPPEN.find((s) => s > procent + 0.01) ?? ZOOM_MAX;
  return [...ZOOM_STAPPEN].reverse().find((s) => s < procent - 0.01) ?? ZOOM_MIN;
}

/** De scrollstand waarbij de plek onder de muis blijft staan. */
export const scrollNaZoom = (scroll: number, cursor: number, oud: number, nieuw: number) => ((scroll + cursor) * nieuw) / oud - cursor;

/** Zoveel pixels hooguit voor een scherp getekende pagina: één pagina kost dan rond 100 MB. */
const MAX_SCHERP_PIXELS = 24_000_000;

/**
 * De schaal om een pagina scherp te tekenen, in pixels per punt. Null als de gewone afbeelding
 * (`basis` pixels per punt) goed genoeg is, of als de grens op het geheugen er niets aan toevoegt.
 */
export function scherpeSchaal(breedte: number, hoogte: number, procent: number, schermSchaal: number, basis: number): number | null {
  const nodig = ((96 / 72) * procent * schermSchaal) / 100;
  if (nodig <= basis * 1.1) return null;
  const schaal = Math.min(nodig, Math.sqrt(MAX_SCHERP_PIXELS / Math.max(1, breedte * hoogte)));
  return schaal <= basis * 1.1 ? null : schaal;
}

// ── Lezen uit het projectbestand ──────────────────────────────────────────────

const isGetal = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const isPunt = (x: unknown): x is PdfPunt => Array.isArray(x) && x.length === 2 && isGetal(x[0]) && isGetal(x[1]);

function leesBasis(x: Record<string, unknown>, i: number): Basis | null {
  if (!isGetal(x.pagina) || x.pagina < 0 || !Number.isInteger(x.pagina)) return null;
  const id = String(x.id ?? "").replace(/[^\w-]/g, "").slice(0, 64) || `a${i}`;
  const kleur = typeof x.kleur === "string" && /^#[0-9a-f]{6}$/i.test(x.kleur) ? x.kleur : KLEUREN[0];
  const dikte = isGetal(x.dikte) ? Math.min(MAX_DIKTE, Math.max(0.1, x.dikte)) : DIKTEN[1];
  return { id, pagina: x.pagina, kleur, dikte };
}

/** De aantekeningen uit een bestand: wat niet klopt, valt weg. */
export function leesAantekeningen(x: unknown): PdfAantekening[] {
  if (!Array.isArray(x)) return [];
  const uit: PdfAantekening[] = [];
  x.slice(0, MAX_AANTEKENINGEN).forEach((rauw, i) => {
    if (!rauw || typeof rauw !== "object") return;
    const r = rauw as Record<string, unknown>;
    const basis = leesBasis(r, i);
    if (!basis) return;
    if (r.soort === "pen" || r.soort === "markeer") {
      if (Array.isArray(r.punten) && r.punten.length >= 2 && r.punten.length <= MAX_PUNTEN && r.punten.every(isPunt)) {
        uit.push({ ...basis, soort: r.soort, punten: r.punten as PdfPunt[] });
      }
    } else if (r.soort === "pijl") {
      if (isPunt(r.van) && isPunt(r.naar)) uit.push({ ...basis, soort: "pijl", van: r.van, naar: r.naar });
    } else if (r.soort === "kader" || r.soort === "wolk") {
      if (isGetal(r.x) && isGetal(r.y) && isGetal(r.b) && isGetal(r.h) && r.b >= 0 && r.h >= 0) {
        uit.push({ ...basis, soort: r.soort, x: r.x, y: r.y, b: r.b, h: r.h });
      }
    } else if (r.soort === "tekst") {
      if (isGetal(r.x) && isGetal(r.y) && typeof r.tekst === "string" && r.tekst.trim() !== "") {
        const grootte = isGetal(r.grootte) ? Math.min(96, Math.max(6, r.grootte)) : 12;
        uit.push({ ...basis, soort: "tekst", x: r.x, y: r.y, tekst: r.tekst.slice(0, MAX_TEKST), grootte });
      }
    }
  });
  return uit;
}

// ── Tekenen ───────────────────────────────────────────────────────────────────

const n = (w: number) => String(Math.round(w * 100) / 100);
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** De letters van een tekst: een eigen lettertype zou op een andere computer anders uitvallen. */
const LETTER = "Arial, Helvetica, sans-serif";

/** Een omkadering met bogen, zoals een wijzigingswolk op een tekening. */
export function wolkPad(x: number, y: number, b: number, h: number, boog = 14): string {
  const hoeken: PdfPunt[] = [[x, y], [x + b, y], [x + b, y + h], [x, y + h], [x, y]];
  let pad = `M${n(x)} ${n(y)}`;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = hoeken[i];
    const [cx, cy] = hoeken[i + 1];
    const lengte = Math.hypot(cx - ax, cy - ay);
    const aantal = Math.max(1, Math.round(lengte / boog));
    const straal = (lengte / aantal) * 0.6;
    for (let k = 1; k <= aantal; k++) {
      pad += `A${n(straal)} ${n(straal)} 0 0 1 ${n(ax + ((cx - ax) * k) / aantal)} ${n(ay + ((cy - ay) * k) / aantal)}`;
    }
  }
  return `${pad}Z`;
}

const lijnPad = (punten: PdfPunt[]) => punten.map(([x, y], i) => `${i === 0 ? "M" : "L"}${n(x)} ${n(y)}`).join("");

/** De breedte die een regel ongeveer inneemt; alleen voor het kader en het aanklikken. */
const regels = (tekst: string) => tekst.split(/\r?\n/);

/** De omhullende rechthoek, voor het selectiekader. */
export function grenzen(a: PdfAantekening): { x: number; y: number; b: number; h: number } {
  switch (a.soort) {
    case "pen":
    case "markeer": {
      const xs = a.punten.map((p) => p[0]);
      const ys = a.punten.map((p) => p[1]);
      return { x: Math.min(...xs), y: Math.min(...ys), b: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
    }
    case "pijl":
      return kaderUit(a.van, a.naar);
    case "kader":
    case "wolk":
      return { x: a.x, y: a.y, b: a.b, h: a.h };
    case "tekst": {
      const r = regels(a.tekst);
      return { x: a.x, y: a.y, b: Math.max(...r.map((t) => t.length)) * a.grootte * 0.55, h: r.length * a.grootte * 1.2 };
    }
  }
}

/** Een aantekening als SVG-tekst. Een dunne lijn krijgt een brede onzichtbare rand om hem aan te klikken. */
export function aantekeningSvg(a: PdfAantekening): string {
  const groep = (inhoud: string, extra = "") =>
    `<g data-aantekening="${esc(a.id)}" fill="none" stroke="${esc(a.kleur)}" stroke-width="${n(a.dikte)}" stroke-linecap="round" stroke-linejoin="round"${extra}>${inhoud}</g>`;
  const raak = (vorm: string) => `<path d="${vorm}" stroke="transparent" stroke-width="${n(Math.max(a.dikte, 8))}" stroke-opacity="0"/>`;
  switch (a.soort) {
    case "pen":
      return groep(raak(lijnPad(a.punten)) + `<path d="${lijnPad(a.punten)}"/>`);
    case "markeer":
      return groep(`<path d="${lijnPad(a.punten)}" stroke-opacity="0.38" style="mix-blend-mode:multiply"/>`);
    case "pijl": {
      const [ax, ay] = a.van;
      const [bx, by] = a.naar;
      const lengte = Math.hypot(bx - ax, by - ay) || 1;
      const ux = (bx - ax) / lengte;
      const uy = (by - ay) / lengte;
      const kop = Math.max(8, 5 * a.dikte);
      const voetX = bx - ux * kop;
      const voetY = by - uy * kop;
      const breed = kop * 0.4;
      const hoeken = `${n(bx)},${n(by)} ${n(voetX - uy * breed)},${n(voetY + ux * breed)} ${n(voetX + uy * breed)},${n(voetY - ux * breed)}`;
      const lijn = `M${n(ax)} ${n(ay)}L${n(voetX)} ${n(voetY)}`;
      return groep(raak(lijn) + `<path d="${lijn}"/><polygon points="${hoeken}" fill="${esc(a.kleur)}" stroke="none"/>`);
    }
    case "kader":
      return groep(raak(`M${n(a.x)} ${n(a.y)}h${n(a.b)}v${n(a.h)}h${n(-a.b)}Z`) + `<rect x="${n(a.x)}" y="${n(a.y)}" width="${n(a.b)}" height="${n(a.h)}" fill="none"/>`);
    case "wolk": {
      const pad = wolkPad(a.x, a.y, a.b, a.h);
      return groep(raak(pad) + `<path d="${pad}"/>`);
    }
    case "tekst": {
      const r = regels(a.tekst);
      const vak = grenzen(a);
      const spans = r.map((t, i) => `<tspan x="${n(a.x)}" dy="${i === 0 ? "0" : "1.2em"}">${esc(t) || " "}</tspan>`).join("");
      return groep(
        `<rect x="${n(vak.x)}" y="${n(vak.y)}" width="${n(vak.b)}" height="${n(vak.h)}" fill="transparent" stroke="none"/>` +
        `<text x="${n(a.x)}" y="${n(a.y + a.grootte * 0.9)}" font-size="${n(a.grootte)}" font-family="${LETTER}" fill="${esc(a.kleur)}" stroke="none">${spans}</text>`,
      );
    }
  }
}

/** De hele laag van één pagina, in punten van die pagina. `geselecteerd` krijgt een stippelkader. */
export function paginaSvg(alle: PdfAantekening[], pagina: number, breedte: number, hoogte: number, geselecteerd?: string | null): string {
  const hier = alle.filter((a) => a.pagina === pagina);
  const keuze = geselecteerd ? hier.find((a) => a.id === geselecteerd) : undefined;
  let kader = "";
  if (keuze) {
    const g = grenzen(keuze);
    const ruim = Math.max(3, keuze.dikte);
    kader = `<rect data-selectie="" x="${n(g.x - ruim)}" y="${n(g.y - ruim)}" width="${n(g.b + 2 * ruim)}" height="${n(g.h + 2 * ruim)}" fill="none" stroke="#d97706" stroke-width="1" stroke-dasharray="4 3" vector-effect="non-scaling-stroke"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(breedte)} ${n(hoogte)}" preserveAspectRatio="none" width="100%" height="100%">${hier.map(aantekeningSvg).join("")}${kader}</svg>`;
}

// ── Bewerken ──────────────────────────────────────────────────────────────────

/** Minder punten uit de muis: dichtbij het vorige vervalt, begin en eind blijven. */
export function dunUit(punten: PdfPunt[], afstand: number): PdfPunt[] {
  if (punten.length <= 2) return punten;
  const uit: PdfPunt[] = [punten[0]];
  for (let i = 1; i < punten.length - 1; i++) {
    const [x, y] = uit[uit.length - 1];
    if (Math.hypot(punten[i][0] - x, punten[i][1] - y) >= afstand) uit.push(punten[i]);
  }
  uit.push(punten[punten.length - 1]);
  return uit;
}

export function verschuif(a: PdfAantekening, dx: number, dy: number): PdfAantekening {
  switch (a.soort) {
    case "pen":
    case "markeer":
      return { ...a, punten: a.punten.map(([x, y]) => [x + dx, y + dy] as PdfPunt) };
    case "pijl":
      return { ...a, van: [a.van[0] + dx, a.van[1] + dy], naar: [a.naar[0] + dx, a.naar[1] + dy] };
    default:
      return { ...a, x: a.x + dx, y: a.y + dy };
  }
}

/** De rechthoek tussen twee punten, in welke richting er ook is getrokken. */
export function kaderUit(a: PdfPunt, b: PdfPunt): { x: number; y: number; b: number; h: number } {
  return { x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), b: Math.abs(a[0] - b[0]), h: Math.abs(a[1] - b[1]) };
}
