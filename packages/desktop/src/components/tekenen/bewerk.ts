/**
 * Bewerkingen op een vorm: verplaatsen, kopiëren, draaien, spiegelen en
 * schalen. Eén transformatie voor alle soorten: een `Omzetting` beschrijft wat
 * er met een punt gebeurt en wat er met hoek, spiegeling en maat gebeurt.
 * Gekoppelde maten volgen het blad en blijven staan, net als bij verschuiven.
 */
import {
  aantalPunten,
  boogEind,
  nieuwId,
  nieuweMaatVorm,
  plaatsingVan,
  verschuif,
  zetMaat,
  type Vorm,
} from "./model.ts";
import { normaliseer, SCHAAL_SYMBOLEN, type SymboolId } from "./symbolen.ts";

export interface Punt {
  x: number;
  y: number;
}

/** Wat een bewerking doet: een punt omzetten, plus de hoek, de spiegelas en de factor. */
export interface Omzetting {
  punt(p: Punt): Punt;
  /** Rotatie in graden (positief is met de klok mee). */
  hoek: number;
  /** Spiegelen om een as onder deze hoek (graden); undefined: niet spiegelen. */
  as?: number;
  /** Schaalfactor. */
  factor: number;
}

const rond = (n: number) => Math.round(n * 100) / 100;
const normHoek = (a: number) => {
  const r = Math.round(a * 100) / 100;
  return ((r % 360) + 360) % 360;
};

export const verplaatsing = (dx: number, dy: number): Omzetting => ({
  punt: (p) => ({ x: p.x + dx, y: p.y + dy }),
  hoek: 0,
  factor: 1,
});

export function draaiing(basis: Punt, graden: number): Omzetting {
  const a = (graden * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  return {
    punt: (p) => {
      const dx = p.x - basis.x, dy = p.y - basis.y;
      return { x: basis.x + c * dx - s * dy, y: basis.y + s * dx + c * dy };
    },
    hoek: graden,
    factor: 1,
  };
}

export function spiegeling(a: Punt, b: Punt): Omzetting {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l = dx * dx + dy * dy || 1;
  return {
    punt: (p) => {
      const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / l;
      const vx = a.x + t * dx, vy = a.y + t * dy;
      return { x: 2 * vx - p.x, y: 2 * vy - p.y };
    },
    hoek: 0,
    as: (Math.atan2(dy, dx) * 180) / Math.PI,
    factor: 1,
  };
}

export function schaling(basis: Punt, f: number): Omzetting {
  return {
    punt: (p) => ({ x: basis.x + (p.x - basis.x) * f, y: basis.y + (p.y - basis.y) * f }),
    hoek: 0,
    factor: f,
  };
}

/** Maten in px bij de keuzes van een symbool die meeschalen. */
const SCHAALKEUZES: Partial<Record<SymboolId, string[]>> = {
  oplegging: ["grootte"],
  puntlast: ["lengte"],
  moment: ["straal"],
  scharnier: ["straal"],
  qlast: ["hoogte", "hoogte2"],
  veren: ["hoogte"],
  stramien: ["straal"],
};

/** Is deze hoek een veelvoud van 90°? Dan blijft een rechthoek een rechthoek. */
const haaks = (a: number) => Math.abs(a / 90 - Math.round(a / 90)) < 1e-6;

/** De draai die een omzetting geeft aan iets met richting `hoek`. */
const nieuweHoek = (hoek: number, om: Omzetting) => (om.as !== undefined ? 2 * om.as - hoek + 180 : hoek + om.hoek);

function punten(v: Vorm): [string, string][] {
  if (v.soort === "polylijn") return Array.from({ length: aantalPunten(v) }, (_, i) => [`x${i}`, `y${i}`]);
  if (v.soort === "lijn" || v.soort === "pijl" || v.soort === "maat") return [["x1", "y1"], ["x2", "y2"]];
  if (v.soort === "symbool" && plaatsingVan(v) === "lijn") return [["x1", "y1"], ["x2", "y2"]];
  return [];
}

/** Zet een punt (x-sleutel, y-sleutel) om; een gekoppelde maat blijft staan. */
function zetPunt(v: Vorm, kx: string, ky: string, om: Omzetting, w: (k: string) => number): Vorm {
  const q = om.punt({ x: w(kx), y: w(ky) });
  return zetMaat(zetMaat(v, kx, rond(q.x)), ky, rond(q.y));
}

/** Een rechthoek die scheef komt te staan, wordt een gesloten polylijn. */
function alsVeelhoek(v: Vorm, om: Omzetting, w: (k: string) => number): Vorm {
  const x = w("x"), y = w("y"), b = w("w"), h = w("h");
  const p: Vorm["p"] = {};
  [{ x, y }, { x: x + b, y }, { x: x + b, y: y + h }, { x, y: y + h }].forEach((q, i) => {
    const r = om.punt(q);
    p[`x${i}`] = { v: rond(r.x) };
    p[`y${i}`] = { v: rond(r.y) };
  });
  return { ...v, soort: "polylijn", p, gesloten: true };
}

/** Een vak (rechthoek of windverband): de omhullende van de omgezette hoeken. */
function zetVak(v: Vorm, om: Omzetting, w: (k: string) => number): Vorm {
  const x = w("x"), y = w("y"), b = w("w"), h = w("h");
  const hoeken = [{ x, y }, { x: x + b, y }, { x: x + b, y: y + h }, { x, y: y + h }].map(om.punt);
  const xs = hoeken.map((q) => q.x), ys = hoeken.map((q) => q.y);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  let r = zetMaat(v, "x", rond(x0));
  r = zetMaat(r, "y", rond(y0));
  r = zetMaat(r, "w", rond(Math.max(...xs) - x0));
  return zetMaat(r, "h", rond(Math.max(...ys) - y0));
}

/** Pas een omzetting toe op een vorm. `w` geeft de maten zoals ze getekend staan. */
export function pasToe(v: Vorm, om: Omzetting, w: (k: string) => number): Vorm {
  const f = om.factor;
  const mijn = (k: string, n: number) => (r: Vorm) => zetMaat(r, k, rond(n));
  switch (v.soort) {
    case "rechthoek": {
      const scheef = om.as !== undefined ? !haaks(om.as) : !haaks(om.hoek);
      return scheef ? alsVeelhoek(v, om, w) : zetVak(v, om, w);
    }
    case "cirkel": {
      const r = zetPunt(v, "cx", "cy", om, w);
      return mijn("r", w("r") * f)(r);
    }
    case "boog": {
      let r = zetPunt(v, "cx", "cy", om, w);
      r = mijn("r", w("r") * f)(r);
      const a1 = w("a1"), a2 = boogEind(a1, w("a2"));
      if (om.as !== undefined) {
        // Spiegelen keert de looprichting om: begin en eind wisselen.
        r = mijn("a1", normHoek(2 * om.as - a2))(r);
        return mijn("a2", normHoek(2 * om.as - a1))(r);
      }
      r = mijn("a1", normHoek(a1 + om.hoek))(r);
      return mijn("a2", normHoek(a2 + om.hoek))(r);
    }
    case "tekst": {
      const r = zetPunt(v, "x", "y", om, w);
      return f !== 1 && r.grootte ? { ...r, grootte: rond(r.grootte * f) } : r;
    }
    case "maat": {
      let r = nieuweMaatVorm(v);
      for (const [kx, ky] of punten(v)) r = zetPunt(r, kx, ky, om, w);
      r = mijn("offset", (r.p.offset?.v ?? 0) * f)(r);
      if (om.as === undefined) return r;
      // Spiegelen keert de loodrechte om; begin en eind wisselen zodat hij blijft lezen.
      return { ...r, p: { ...r.p, x1: r.p.x2, y1: r.p.y2, x2: r.p.x1, y2: r.p.y1 } };
    }
    case "lijn":
    case "pijl":
    case "polylijn": {
      let r = v;
      for (const [kx, ky] of punten(v)) r = zetPunt(r, kx, ky, om, w);
      return r;
    }
    case "symbool":
      return pasToeSymbool(v, om, w);
  }
}

function pasToeSymbool(v: Vorm, om: Omzetting, w: (k: string) => number): Vorm {
  const f = om.factor;
  const o: Record<string, string> = { ...(v.o ?? {}) };
  if (f !== 1) {
    for (const k of SCHAALKEUZES[v.sym as SymboolId] ?? []) {
      const n = Number(String(o[k] ?? "").replace(",", "."));
      if (Number.isFinite(n) && n > 0) o[k] = String(rond(n * f));
    }
    // Een profiel of balk op ware grootte schaalt via zijn tekenschaal.
    if (SCHAAL_SYMBOLEN.includes(v.sym as SymboolId)) o.schaal = String(rond((Number(o.schaal) || 10) / f));
  }
  const grootte = f !== 1 && v.grootte ? { grootte: rond(v.grootte * f) } : {};
  const soort = plaatsingVan(v);
  if (soort === "lijn") {
    let r: Vorm = { ...v, o, ...grootte };
    for (const [kx, ky] of punten(v)) r = zetPunt(r, kx, ky, om, w);
    if (om.as === undefined) return normaliseer(r);
    // Een last en veren houden hun kant: begin en eind wisselen mee, net als de waarden van een trapezium.
    const metKant = v.sym === "qlast" || v.sym === "veren" || (v.sym === "staal" && o.aanzicht !== "doorsnede");
    if (!metKant) return normaliseer(r);
    if (v.sym === "qlast" && o.trapezium === "1") {
      for (const [a, b] of [["naam", "naam2"], ["waarde", "waarde2"], ["hoogte", "hoogte2"]]) {
        const x = o[a];
        o[a] = o[b];
        o[b] = x;
      }
    }
    return normaliseer({ ...r, o, p: { ...r.p, x1: r.p.x2, y1: r.p.y2, x2: r.p.x1, y2: r.p.y1 } });
  }
  if (soort === "vak") return zetVak({ ...v, o, ...grootte }, om, w);
  const r = zetPunt({ ...v, o, ...grootte }, "x", "y", om, w);
  if (om.as === undefined && om.hoek === 0) return normaliseer(r);
  const o2: Record<string, string> = { ...o };
  // Alleen wat van richting kan veranderen, krijgt een hoek (een peil of tekstkader blijft rechtop).
  if ("hoek" in o2 || v.sym === "staal" || v.sym === "hout") o2.hoek = String(normHoek(nieuweHoek(Number(o.hoek) || 0, om)));
  if (om.as !== undefined) {
    if (v.sym === "staal") o2.spiegel = o2.spiegel === "1" ? "0" : "1";
    if (v.sym === "moment") o2.richting = o2.richting === "linksom" ? "rechtsom" : "linksom";
  }
  return normaliseer({ ...r, o: o2 });
}

/** Een kopie met een nieuw id. */
export const metNieuwId = (v: Vorm): Vorm => ({ ...v, id: nieuwId() });

/** Een kopie met een nieuw id, verschoven. */
export const kopie = (v: Vorm, dx: number, dy: number): Vorm => ({ ...verschuif(v, dx, dy), id: nieuwId() });
