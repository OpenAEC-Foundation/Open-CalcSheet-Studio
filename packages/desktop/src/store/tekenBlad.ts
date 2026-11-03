/**
 * Een tekenblad: een leeg vel op papierformaat met één of meer views, als blad
 * in het project, naast de rekenbladen, PDF-bladen en spreadsheets. Elke view
 * heeft een eigen plek op het vel, een eigen schaal en een eigen titel.
 *
 * Een tekenblad is een gewoon exemplaar (store/projectStore.ts) met `templateId`
 * TEKEN_BLAD, een lege `source` en geen invoer. Het vel zelf staat in `tekenvel`.
 *
 * Twee maatsystemen, net als bij een echt vel:
 *   • plek en maat van een view staan in mm op papier;
 *   • wat er in een view getekend staat, staat in mm in het echt (modelmaat).
 * Een andere schaal verandert dus niets aan wat er getekend is; lijndiktes, tekst
 * en symbolen blijven op papier even groot (components/tekenen/vel.ts).
 *
 * Puur en zonder React: projectBestand.ts gebruikt dit bestand, en de
 * controlescripts laden dat rechtstreeks in Node.
 */
import { reserveerId, type Anker, type Maat, type Soort, type Vorm } from "../components/tekenen/model.ts";
import { normaliseer, SCHAAL_SYMBOLEN, symboolDef } from "../components/tekenen/symbolen.ts";
import { PX_PER_MM } from "../components/tekenen/staalprofielen.ts";

/** `templateId` van een tekenblad. Geen module: er is geen sjabloon met deze naam. */
export const TEKEN_BLAD = "tekenblad";

export const PAPIERFORMATEN = ["A4", "A3", "A2"] as const;
export type Papierformaat = (typeof PAPIERFORMATEN)[number];
export const LIGGINGEN = ["staand", "liggend"] as const;
export type Ligging = (typeof LIGGINGEN)[number];

/** Korte en lange zijde in mm, volgens ISO 216. */
export const PAPIER: Record<Papierformaat, { kort: number; lang: number }> = {
  A4: { kort: 210, lang: 297 },
  A3: { kort: 297, lang: 420 },
  A2: { kort: 420, lang: 594 },
};

/** De schalen om uit te kiezen; een eigen 1 : n mag ook. */
export const VEL_SCHALEN = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000] as const;

export interface TekenView {
  id: string;
  titel: string;
  /** Linkerbovenhoek en maat op het vel, in mm op papier. */
  x: number;
  y: number;
  breedte: number;
  hoogte: number;
  /** De schaal 1 : n. */
  schaal: number;
  /** Welk punt van de tekening in de linkerbovenhoek staat, in mm in het echt. */
  x0: number;
  y0: number;
  /** De getekende vormen, in mm in het echt. */
  elementen: Vorm[];
}

export interface TekenVel {
  formaat: Papierformaat;
  ligging: Ligging;
  views: TekenView[];
}

/** Is dit blad een tekenblad? Ook als het vel ontbreekt. */
export function isTekenBlad(ex: { templateId?: string }): boolean {
  return ex.templateId === TEKEN_BLAD;
}

/** Breedte en hoogte van het vel in mm. */
export function velMaat(vel: Pick<TekenVel, "formaat" | "ligging">): { breedte: number; hoogte: number } {
  const p = PAPIER[vel.formaat];
  return vel.ligging === "liggend" ? { breedte: p.lang, hoogte: p.kort } : { breedte: p.kort, hoogte: p.lang };
}

/*
 * De symbolen die op ware grootte tekenen rekenen met hun tekenschaal
 * (`profielSchaal` in symbolen.ts). In de modelmaat is één eenheid één mm: die
 * schaal staat dan vast op PX_PER_MM. In het bestand staat hij niet: daar zou hij
 * lezen als een tekenschaal, terwijl de schaal van de view de echte is.
 */
const heeftSchaal = (v: Vorm) => v.soort === "symbool" && (SCHAAL_SYMBOLEN as readonly (string | undefined)[]).includes(v.sym);

const SOORTEN: readonly Soort[] = ["lijn", "pijl", "rechthoek", "cirkel", "polylijn", "tekst", "maat", "boog", "symbool"];
const ANKERS: readonly Anker[] = ["start", "middle", "end"];
const KLEUR = /^#[0-9a-f]{3,8}$/i;
const SLEUTEL = /^[A-Za-z_]\w{0,31}$/;

const eindig = (w: unknown): w is number => typeof w === "number" && Number.isFinite(w);
const beperk = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

function leesKleur(w: unknown, standaard: string | null): string | null {
  if (w === null) return null;
  return typeof w === "string" && KLEUR.test(w) ? w : standaard;
}

/**
 * Eén vorm uit een bestand. Een projectbestand kan van iemand anders komen en de
 * vormen komen als SVG in beeld: alleen wat de editor zelf schrijft, gaat door.
 * Geen vrije opmaak, geen extra attributen en geen onbekende elementen, en een
 * maat is een getal: een tekenblad heeft geen rekenblad om aan te koppelen.
 */
function leesVorm(x: unknown): Vorm | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const e = x as Record<string, unknown>;
  if (!SOORTEN.includes(e.soort as Soort)) return null;
  const soort = e.soort as Soort;
  const p: Record<string, Maat> = {};
  if (e.p && typeof e.p === "object" && !Array.isArray(e.p)) {
    for (const [k, m] of Object.entries(e.p as Record<string, unknown>)) {
      const v = m && typeof m === "object" ? (m as { v?: unknown }).v : undefined;
      if (SLEUTEL.test(k) && eindig(v)) p[k] = { v };
    }
  }
  const sym = typeof e.sym === "string" && symboolDef(e.sym) ? e.sym : undefined;
  if (soort === "symbool" && !sym) return null;
  const v: Vorm = {
    id: typeof e.id === "string" && e.id ? e.id : "",
    soort,
    p,
    lijn: leesKleur(e.lijn, "#000000"),
    dikte: eindig(e.dikte) && e.dikte > 0 ? beperk(e.dikte, 0.05, 50) : 1,
    vulling: leesKleur(e.vulling, null),
    streep: e.streep === true,
  };
  if (typeof e.tekst === "string") v.tekst = e.tekst.slice(0, 2000);
  if (eindig(e.grootte) && e.grootte > 0) v.grootte = beperk(e.grootte, 1, 400);
  if (ANKERS.includes(e.anker as Anker)) v.anker = e.anker as Anker;
  if (e.gesloten === true) v.gesloten = true;
  if (e.tik === true) v.tik = true;
  if (soort === "polylijn" && e.stijlRest === "stroke-linejoin:round") v.stijlRest = "stroke-linejoin:round";
  if (sym) v.sym = sym;
  if (e.o && typeof e.o === "object" && !Array.isArray(e.o)) {
    const o: Record<string, string> = {};
    for (const [k, w] of Object.entries(e.o as Record<string, unknown>)) {
      if (SLEUTEL.test(k) && typeof w === "string") o[k] = w.slice(0, 500);
    }
    if (Object.keys(o).length > 0) v.o = o;
  }
  if (heeftSchaal(v) && !v.o?.schaal) v.o = { ...(v.o ?? {}), schaal: String(PX_PER_MM) };
  if (v.soort !== "symbool") return v;
  // De keuzes in de volgorde van het symbool: wat uit het bestand komt, schrijft zo hetzelfde weg.
  const o: Record<string, string> = {};
  for (const k of Object.keys(symboolDef(sym)?.o ?? {})) if (v.o?.[k] !== undefined) o[k] = v.o[k];
  return normaliseer({ ...v, o: { ...o, ...v.o } });
}

/** Elke vorm een eigen id; de editor maakt daarna geen id dat al bestaat. */
function leesElementen(x: unknown): Vorm[] {
  if (!Array.isArray(x)) return [];
  const gezien = new Set<string>();
  const uit: Vorm[] = [];
  for (const e of x) {
    const v = leesVorm(e);
    if (!v) continue;
    if (v.id) reserveerId(v.id);
    uit.push(v);
  }
  return uit.map((v) => {
    if (!v.id || gezien.has(v.id)) v = { ...v, id: reserveerId() };
    gezien.add(v.id);
    return v;
  });
}

function leesView(x: unknown, i: number): TekenView | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const e = x as Record<string, unknown>;
  const getal = (w: unknown, standaard: number) => (eindig(w) ? w : standaard);
  const breedte = beperk(getal(e.breedte, 100), 5, 2000);
  const hoogte = beperk(getal(e.hoogte, 100), 5, 2000);
  const schaal = eindig(e.schaal) && e.schaal > 0 ? beperk(e.schaal, 0.01, 100000) : 50;
  return {
    id: typeof e.id === "string" && e.id ? e.id : `view-${i + 1}`,
    titel: typeof e.titel === "string" ? e.titel.slice(0, 200) : "",
    x: getal(e.x, 10),
    y: getal(e.y, 10),
    breedte,
    hoogte,
    schaal,
    x0: getal(e.x0, 0),
    y0: getal(e.y0, 0),
    elementen: leesElementen(e.elementen),
  };
}

/** Het vel uit een bestand of de opgeslagen staat van de app; wat onbruikbaar is, valt weg of krijgt zijn standaard. */
export function leesTekenVel(x: unknown): TekenVel | undefined {
  if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
  const e = x as Record<string, unknown>;
  const views = Array.isArray(e.views) ? e.views.map(leesView).filter((v): v is TekenView => v !== null) : [];
  const ids = new Set<string>();
  return {
    formaat: PAPIERFORMATEN.includes(e.formaat as Papierformaat) ? (e.formaat as Papierformaat) : "A3",
    ligging: LIGGINGEN.includes(e.ligging as Ligging) ? (e.ligging as Ligging) : "liggend",
    views: views.map((v, i) => {
      const id = ids.has(v.id) ? `view-${i + 1}-${ids.size}` : v.id;
      ids.add(id);
      return id === v.id ? v : { ...v, id };
    }),
  };
}

/** Het vel zoals het in het bestand komt: zonder de vaste schaal van de modelmaat (zie boven). */
export function tekenVelVoorBestand(vel: TekenVel): TekenVel {
  return {
    ...vel,
    views: vel.views.map((view) => ({
      ...view,
      elementen: view.elementen.map((v) => {
        if (!heeftSchaal(v) || Number(v.o?.schaal) !== PX_PER_MM) return v;
        const o = { ...(v.o ?? {}) };
        delete o.schaal;
        return { ...v, o };
      }),
    })),
  };
}
