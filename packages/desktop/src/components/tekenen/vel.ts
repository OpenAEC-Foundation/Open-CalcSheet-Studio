/**
 * Het vel van een tekenblad: van de tekening in echte maat naar het papier, en de
 * rekenregels van views op een vel (zie store/tekenBlad.ts voor het model).
 *
 * In een view is één eenheid één millimeter in het echt. Bij het tekenen op papier
 * gaat elke maat met `pxPerMm(schaal)` naar beeldpunten op papier; lijndiktes,
 * tekstgroottes en de maat van een oplegging of stramienbol staan al in px op
 * papier en blijven dus even groot bij elke schaal. Een profiel, wand of vloer
 * heeft zijn maten in mm en krijgt de schaal van de view als tekenschaal.
 *
 * Alle views van een vel delen één `<defs>`: twee keer hetzelfde profiel op
 * dezelfde schaal is één `<symbol>` en twee `<use>`, ook over views heen.
 *
 * Geen React en geen store: scripts/check-tekenblad.mjs laadt dit in Node.
 */
import { isMmSleutel, nieuweVorm, type Element, type Maat, type Stijl, type Tekening, type Vorm } from "./model.ts";
import { kernGetal, schrijfElementen, veilig } from "./code.ts";
import { nieuwSymbool, SCHAAL_SYMBOLEN, type SymboolId } from "./symbolen.ts";
import { PX_PER_MM } from "./staalprofielen.ts";
import { VEL_SCHALEN, velMaat, type Ligging, type Papierformaat, type TekenVel, type TekenView } from "../../store/tekenBlad.ts";

/** De tekenschaal van een symbool in de modelmaat: precies één eenheid per mm (`profielSchaal`). */
export const MODEL_SCHAAL = PX_PER_MM;

/** Beeldpunten op papier per mm in het echt, op schaal 1 : n. */
export const pxPerMm = (n: number) => PX_PER_MM / n;

/** De rand van het vel tot de tekenrand, in mm. */
export const VEL_RAND = 10;
/** De titelhoek rechtsonder, in mm. */
export const TITELHOEK = { breedte: 80, hoogte: 18 };
/** Ruimte onder een view voor zijn titel, in mm. */
export const TITEL_RUIMTE = 7;
/** De letters van de viewtitel en de titelhoek, in mm op papier. */
const TITEL_LETTER = 3.4;

const rond = (n: number, f = 1000) => Math.round(n * f) / f;

/** Een geheel getal als maatlabel volgt altijd de geometrie; een eigen tekst blijft staan. */
const isGetalLabel = (s: string | undefined) => !s?.trim() || /^\d+$/.test(s.trim());

/** Een vorm in echte maat als dezelfde vorm in px op papier, op schaal 1 : n. */
export function vormOpPapier(v: Vorm, n: number): Vorm {
  const k = pxPerMm(n);
  const p: Record<string, Maat> = {};
  for (const [s, m] of Object.entries(v.p)) {
    p[s] = isMmSleutel(v, s) || s === "a1" || s === "a2" ? { v: m.v } : { v: m.v * k };
  }
  const uit: Vorm = { ...v, p };
  if (v.soort === "maat" && isGetalLabel(v.tekst)) {
    const mm = Math.hypot((v.p.x2?.v ?? 0) - (v.p.x1?.v ?? 0), (v.p.y2?.v ?? 0) - (v.p.y1?.v ?? 0));
    uit.tekst = kernGetal(Math.round(mm));
  }
  if (v.soort === "symbool" && (SCHAAL_SYMBOLEN as readonly (string | undefined)[]).includes(v.sym)) {
    const model = Number(v.o?.schaal) || MODEL_SCHAAL;
    uit.o = { ...(v.o ?? {}), schaal: String(rond((n * model) / MODEL_SCHAAL, 1e6)) };
  }
  return uit;
}

export const elementOpPapier = (el: Element, n: number): Element => (el.soort === "vast" ? el : vormOpPapier(el, n));

/** De maat van wat een view laat zien, in mm in het echt. */
export const viewBereik = (view: Pick<TekenView, "breedte" | "hoogte" | "schaal">) => ({
  breedte: view.breedte * view.schaal,
  hoogte: view.hoogte * view.schaal,
});

/** Een view als tekening voor de editor: het kader in echte maat, de vormen zoals ze zijn. */
export function tekeningVanView(view: TekenView): Tekening {
  const { breedte, hoogte } = viewBereik(view);
  return {
    naam: "view",
    x0: view.x0,
    y0: view.y0,
    breed: { v: breedte },
    hoog: { v: hoogte },
    elementen: view.elementen,
    wortel: [],
    eigenStijl: false,
  };
}

/** Het raster dat bij een schaal past, in mm in het echt: ongeveer 2 tot 5 mm op papier. */
export function rasterVoorSchaal(n: number): number {
  if (n <= 2) return 5;
  if (n <= 5) return 10;
  if (n <= 10) return 25;
  if (n <= 25) return 50;
  if (n <= 50) return 100;
  if (n <= 100) return 250;
  if (n <= 250) return 500;
  return 1000;
}

/** Een andere schaal: het kader op papier blijft, het midden van wat je ziet ook. De vormen veranderen niet. */
export function zetViewSchaal(view: TekenView, n: number): TekenView {
  if (!(n > 0) || n === view.schaal) return view;
  const oud = viewBereik(view);
  const nieuw = viewBereik({ ...view, schaal: n });
  return {
    ...view,
    schaal: n,
    x0: rond(view.x0 + (oud.breedte - nieuw.breedte) / 2),
    y0: rond(view.y0 + (oud.hoogte - nieuw.hoogte) / 2),
  };
}

/** Het ruwe gebied waarin views kunnen staan, in mm op papier. */
function tekenvlak(vel: Pick<TekenVel, "formaat" | "ligging">) {
  const m = velMaat(vel);
  return { x: VEL_RAND + 5, y: VEL_RAND + 5, r: m.breedte - VEL_RAND - 5, o: m.hoogte - VEL_RAND - 5 };
}

interface Vak {
  x: number;
  y: number;
  breedte: number;
  hoogte: number;
}

const overlapt = (a: Vak, b: Vak) =>
  a.x < b.x + b.breedte && b.x < a.x + a.breedte && a.y < b.y + b.hoogte && b.y < a.y + a.hoogte;

/** Bezet: de views met hun titel eronder, en de titelhoek. */
function bezetVakken(vel: TekenVel): Vak[] {
  const m = velMaat(vel);
  return [
    ...vel.views.map((v) => ({ x: v.x - 3, y: v.y - 3, breedte: v.breedte + 6, hoogte: v.hoogte + TITEL_RUIMTE + 6 })),
    { x: m.breedte - VEL_RAND - TITELHOEK.breedte - 3, y: m.hoogte - VEL_RAND - TITELHOEK.hoogte - 3, breedte: TITELHOEK.breedte + 3, hoogte: TITELHOEK.hoogte + 3 },
  ];
}

/**
 * De grootste vrije plek voor een nieuwe view: rechts van of onder wat er al
 * staat. De eerste view krijgt zo'n zestig procent van de breedte, zodat er naast
 * hem plaats blijft voor een tweede. Past er niets meer, dan iets verschoven over
 * de laatste heen; schuiven doe je daarna zelf.
 */
export function vrijePlek(vel: TekenVel): Vak {
  const g = tekenvlak(vel);
  const bezet = bezetVakken(vel);
  const xs = [g.x, ...vel.views.map((v) => v.x + v.breedte + 8)];
  const ys = [g.y, ...vel.views.map((v) => v.y + v.hoogte + TITEL_RUIMTE + 6)];
  const maxB = vel.views.length === 0 ? Math.round((g.r - g.x) * 0.6) : g.r - g.x;
  let beste: Vak | null = null;
  for (const x of xs) {
    for (const y of ys) {
      if (x >= g.r || y >= g.o) continue;
      const start: Vak = { x, y, breedte: 1, hoogte: 1 };
      if (bezet.some((b) => overlapt(start, b))) continue;
      // Rek eerst naar rechts en dan omlaag, tot er iets in de weg staat.
      let r = Math.min(g.r, x + maxB);
      for (const b of bezet) if (b.x >= x && b.y < y + 1 && b.y + b.hoogte > y) r = Math.min(r, b.x);
      let o = g.o - TITEL_RUIMTE;
      for (const b of bezet) if (b.x < r && b.x + b.breedte > x && b.y >= y) o = Math.min(o, b.y - TITEL_RUIMTE);
      const vak: Vak = { x, y, breedte: Math.floor(r - x), hoogte: Math.floor(o - y) };
      if (vak.breedte < 40 || vak.hoogte < 30) continue;
      if (!beste || vak.breedte * vak.hoogte > beste.breedte * beste.hoogte) beste = vak;
    }
  }
  if (beste) return beste;
  const laatste = vel.views[vel.views.length - 1];
  const breedte = Math.min(100, g.r - g.x);
  const hoogte = Math.min(80, g.o - g.y);
  return {
    x: Math.min((laatste?.x ?? g.x) + 10, g.r - breedte),
    y: Math.min((laatste?.y ?? g.y) + 10, g.o - hoogte),
    breedte,
    hoogte,
  };
}

let viewTeller = 0;
/** Een id dat op dit vel nog niet bestaat. */
function vrijViewId(vel: TekenVel): string {
  const bezet = new Set(vel.views.map((v) => v.id));
  let id: string;
  do id = `view-${Date.now().toString(36)}-${(++viewTeller).toString(36)}`;
  while (bezet.has(id));
  return id;
}

/** Een nieuwe, lege view op de vrije plek, met de schaal van de laatste. */
export function nieuweView(vel: TekenVel, titel: string): TekenView {
  const plek = vrijePlek(vel);
  return { id: vrijViewId(vel), titel, ...plek, schaal: vel.views[vel.views.length - 1]?.schaal ?? 50, x0: 0, y0: 0, elementen: [] };
}

/** Een nieuw vel met één lege view. */
export function nieuwVel(titel: string, formaat: Papierformaat = "A3", ligging: Ligging = "liggend"): TekenVel {
  const vel: TekenVel = { formaat, ligging, views: [] };
  return { ...vel, views: [nieuweView(vel, titel)] };
}

/**
 * Een ander formaat of een andere ligging: de views blijven zoals ze zijn, maar
 * wat over de rand zou vallen, schuift terug op het vel en wordt zo nodig kleiner.
 * Wat er in een view staat, verandert niet.
 */
export function zetVelFormaat(vel: TekenVel, formaat: Papierformaat, ligging: Ligging): TekenVel {
  const m = velMaat({ formaat, ligging });
  const passend = (v: TekenView): TekenView => {
    const breedte = Math.min(v.breedte, m.breedte - 2 * VEL_RAND);
    const hoogte = Math.min(v.hoogte, m.hoogte - 2 * VEL_RAND - TITEL_RUIMTE);
    const x = Math.max(VEL_RAND, Math.min(v.x, m.breedte - VEL_RAND - breedte));
    const y = Math.max(VEL_RAND, Math.min(v.y, m.hoogte - VEL_RAND - TITEL_RUIMTE - hoogte));
    return x === v.x && y === v.y && breedte === v.breedte && hoogte === v.hoogte ? v : { ...v, x, y, breedte, hoogte };
  };
  return { formaat, ligging, views: vel.views.map(passend) };
}

/** De kleinste gangbare schaal waarop `breedte` × `hoogte` in het echt in deze view past; null als dat niet kan. */
export function passendeSchaal(view: Pick<TekenView, "breedte" | "hoogte">, breedte: number, hoogte: number): number | null {
  return VEL_SCHALEN.find((n) => breedte / n <= view.breedte && hoogte / n <= view.hoogte) ?? null;
}

// ─── Stramien ────────────────────────────────────────────────────────────────

/** `5400 5400 7200` of `3x5400 7200`: de veldmaten in mm; null als er iets niet klopt. */
export function leesVeldmaten(tekst: string): number[] | null {
  const uit: number[] = [];
  for (const stuk of tekst.trim().split(/[\s;]+/).filter(Boolean)) {
    const m = /^(?:(\d+)\s*[x*×])?(\d+(?:[.,]\d+)?)$/i.exec(stuk);
    if (!m) return null;
    const maat = Number(m[2].replace(",", "."));
    const keer = m[1] ? Number(m[1]) : 1;
    // Kleiner dan 50 mm is vrijwel zeker een maat in meters (5,4 in plaats van 5400).
    if (!(maat >= 50) || keer < 1 || keer > 60) return null;
    for (let i = 0; i < keer; i++) uit.push(maat);
  }
  return uit.length > 0 && uit.length <= 60 ? uit : null;
}

/** A, B, … Z, AA, AB: de letter van as i. */
export function asLetter(i: number): string {
  let s = "";
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s;
  return s;
}

export interface RasterOpgave {
  /** De velden in x en y, in mm in het echt. */
  x: number[];
  y: number[];
  /** Linkerbovenhoek van het eerste veld, in mm in het echt. */
  x0: number;
  y0: number;
  /** Hoe ver een stramienlijn voorbij het laatste veld loopt, in mm. */
  uitloop: number;
  maatvoering: boolean;
}

/**
 * Een stramien: verticale assen 1, 2, 3 … en horizontale assen A, B, C …, met de
 * bol aan de bovenkant en links en een streep-punt-lijn, en daarbuiten de
 * maatketens: per veld en, bij meer dan één veld, de totale maat.
 */
export function stramienRaster(o: RasterOpgave, stijl: Stijl): Vorm[] {
  const som = (l: number[]) => l.reduce((a, b) => a + b, 0);
  const posX = [0, ...o.x.map((_, i) => som(o.x.slice(0, i + 1)))].map((a) => o.x0 + a);
  const posY = [0, ...o.y.map((_, i) => som(o.y.slice(0, i + 1)))].map((a) => o.y0 + a);
  const y1 = o.y0 - o.uitloop, y2 = posY[posY.length - 1] + o.uitloop;
  const x1 = o.x0 - o.uitloop, x2 = posX[posX.length - 1] + o.uitloop;
  const zwart = { ...stijl, lijn: "#000000" };
  const uit: Vorm[] = [];
  const as = (sym: SymboolId, plek: Record<string, number>, label: string) => nieuwSymbool(sym, plek, zwart, { label });
  posX.forEach((x, i) => uit.push(as("stramien", { x1: x, y1, x2: x, y2 }, String(i + 1))));
  posY.forEach((y, i) => uit.push(as("stramien", { x1, y1: y, x2, y2: y }, asLetter(i))));
  if (!o.maatvoering) return uit;

  // Een maat loopt van links naar rechts of van onder naar boven; zijn normaal wijst
  // dan omlaag of naar rechts, dus een maat boven of links krijgt een negatieve afstand.
  const maat = (a: { x: number; y: number }, b: { x: number; y: number }, afstand: number) => {
    const mm = Math.hypot(b.x - a.x, b.y - a.y);
    return nieuweVorm("maat", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, offset: afstand }, stijl, { tekst: kernGetal(Math.round(mm)) });
  };
  const eerste = o.uitloop * 0.45;
  const tweede = o.uitloop * 0.8;
  for (let i = 0; i + 1 < posX.length; i++) uit.push(maat({ x: posX[i], y: o.y0 }, { x: posX[i + 1], y: o.y0 }, -eerste));
  for (let i = posY.length - 1; i > 0; i--) uit.push(maat({ x: o.x0, y: posY[i] }, { x: o.x0, y: posY[i - 1] }, -eerste));
  if (o.x.length > 1) uit.push(maat({ x: posX[0], y: o.y0 }, { x: posX[posX.length - 1], y: o.y0 }, -tweede));
  if (o.y.length > 1) uit.push(maat({ x: o.x0, y: posY[posY.length - 1] }, { x: o.x0, y: posY[0] }, -tweede));
  return uit;
}

// ─── Op papier ───────────────────────────────────────────────────────────────

const f2 = (n: number) => String(Math.round(n * 100) / 100);

/** Schaalaanduiding: 1:50. */
export const schaalTekst = (n: number) => `1:${kernGetal(n)}`;

export interface VelOpties {
  /** De naam van het blad, voor de titelhoek. */
  naam?: string;
  /** De projectnaam, voor de titelhoek. */
  project?: string;
}

/** Tekst op het vel: elk leesteken als tekenverwijzing. */
const tekstOpVel = (s: string) => veilig(s.replace(/\{\{|\}\}/g, ""));

/**
 * De titel onder een view: de naam vet en de schaal ernaast, met een streep eronder.
 * In px op papier, zoals alles op het vel.
 */
function viewTitel(v: TekenView): string {
  const x = v.x * PX_PER_MM;
  const y = (v.y + v.hoogte + TITEL_RUIMTE - 2) * PX_PER_MM;
  const g = TITEL_LETTER * PX_PER_MM;
  const titel = tekstOpVel(v.titel);
  const lijn = (v.y + v.hoogte + TITEL_RUIMTE - 0.9) * PX_PER_MM;
  return (
    `<text x="${f2(x)}" y="${f2(y)}" font-size="${f2(g)}" style="fill:#000000; stroke:none">` +
    (titel ? `<tspan font-weight="600">${titel}</tspan><tspan dx="${f2(g)}">${schaalTekst(v.schaal)}</tspan>` : schaalTekst(v.schaal)) +
    `</text><line x1="${f2(x)}" y1="${f2(lijn)}" x2="${f2((v.x + v.breedte) * PX_PER_MM)}" y2="${f2(lijn)}" style="stroke:#000000; stroke-width:0.75"/>`
  );
}

/** De titelhoek rechtsonder en de tekenrand. */
function velKader(vel: TekenVel, opties: VelOpties): string {
  const m = velMaat(vel);
  const w = (m.breedte - 2 * VEL_RAND) * PX_PER_MM, h = (m.hoogte - 2 * VEL_RAND) * PX_PER_MM;
  const r = VEL_RAND * PX_PER_MM;
  const tb = TITELHOEK.breedte * PX_PER_MM, th = TITELHOEK.hoogte * PX_PER_MM;
  const tx = r + w - tb, ty = r + h - th;
  const schalen = [...new Set(vel.views.map((v) => v.schaal))].sort((a, b) => a - b).map(schaalTekst).join(", ");
  const g = TITEL_LETTER * PX_PER_MM;
  const regel = (i: number, s: string, vet = false) =>
    s ? `<text x="${f2(tx + 2 * PX_PER_MM)}" y="${f2(ty + (i * 5 + 5.4) * PX_PER_MM)}" font-size="${f2(g)}"${vet ? ' font-weight="600"' : ""} style="fill:#000000; stroke:none">${tekstOpVel(s)}</text>` : "";
  return [
    `<rect x="${f2(r)}" y="${f2(r)}" width="${f2(w)}" height="${f2(h)}" style="fill:none; stroke:#000000; stroke-width:1"/>`,
    `<rect x="${f2(tx)}" y="${f2(ty)}" width="${f2(tb)}" height="${f2(th)}" style="fill:#FFFFFF; stroke:#000000; stroke-width:1"/>`,
    regel(0, opties.naam ?? "", true),
    regel(1, opties.project ?? ""),
    regel(2, [vel.formaat, schalen].filter(Boolean).join(" · ")),
  ].join("");
}

/** Wat er op het vel staat, in px op papier en zonder `<svg>` eromheen. */
export function velInhoud(vel: TekenVel, opties: VelOpties = {}): string {
  const m = velMaat(vel);
  const { defs, regels } = schrijfElementen(vel.views.map((v) => v.elementen.map((el) => vormOpPapier(el, v.schaal))));
  const uit: string[] = [];
  if (defs.length > 0) uit.push(`<defs>${defs.join("")}</defs>`);
  uit.push(`<rect x="0" y="0" width="${f2(m.breedte * PX_PER_MM)}" height="${f2(m.hoogte * PX_PER_MM)}" style="fill:#FFFFFF; stroke:none"/>`);
  uit.push(velKader(vel, opties));
  vel.views.forEach((v, i) => {
    const k = pxPerMm(v.schaal);
    const b = v.breedte * PX_PER_MM, h = v.hoogte * PX_PER_MM;
    // Een eigen <svg> per view: dat is het kader dat afknipt, zonder ids die dubbel kunnen zijn.
    uit.push(
      `<svg data-view="${i + 1}" x="${f2(v.x * PX_PER_MM)}" y="${f2(v.y * PX_PER_MM)}" width="${f2(b)}" height="${f2(h)}" viewBox="${f2(v.x0 * k)} ${f2(v.y0 * k)} ${f2(b)} ${f2(h)}">`,
      regels[i].join(""),
      `</svg>`,
      viewTitel(v),
    );
  });
  // Een tekenblad heeft geen rekenblad om `{{…}}` uit te rekenen: dan staat er gewoon de tekst.
  return uit.join("").replace(/\{\{([^{}]*)\}\}/g, "$1");
}

/** Het hele vel als SVG, op zijn echte maat in mm. */
export function velSvg(vel: TekenVel, opties: VelOpties = {}): string {
  const m = velMaat(vel);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" data-tekenvel="${vel.formaat}" viewBox="0 0 ${f2(m.breedte * PX_PER_MM)} ${f2(m.hoogte * PX_PER_MM)}" ` +
    `width="${m.breedte}mm" height="${m.hoogte}mm" style="font-family:Inter, system-ui, sans-serif">${velInhoud(vel, opties)}</svg>`
  );
}

/** De naam van de `@page`-regel voor dit formaat (Tekenblad.css). */
export const paginaNaam = (vel: Pick<TekenVel, "formaat" | "ligging">) => `tekenvel-${vel.formaat.toLowerCase()}-${vel.ligging}`;
