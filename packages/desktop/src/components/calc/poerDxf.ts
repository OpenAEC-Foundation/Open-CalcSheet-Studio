import beelden from "../../i18n/locales/nl/beelden.json" with { type: "json" };
import type { PoerDefinitie } from "./poerDefinitie.ts";
import { koorde, stavenMeerpaal, type MeerpaalDefinitie, type P2 } from "./meerpaalDefinitie.ts";
import { afgerondPad, maakStaaflijst, zijdenKort, stavenTweepaal, type P3, type Staaf, type StaafSoort, type Staaflijst } from "./poerStaven.ts";

/*
 * Het wapeningsdetail van een poer als DXF (R12, ASCII) en als SVG: een bemaatte
 * plattegrond, twee doorsneden met de getoetste staven, en de staaflijst. DXF en SVG
 * komen uit dezelfde lijst met lijnen, cirkels en teksten.
 *
 * Hier wordt niet gerekend: de vorm van de poer en elke staaf komen uit de poerdefinitie
 * (poerDefinitie.ts, meerpaalDefinitie.ts) via poerStaven.ts, dezelfde als de staaflijst
 * en de IFC-uitvoer. Een doorsnede tekent de staven die evenwijdig aan het snedevlak
 * binnen het venster liggen als lijn, en de staven die het vlak snijden als cirkel.
 *
 * Lagen: BETON (poer, palen, kolom), WAPENING (hartlijnen en doorsneden van de staven),
 * MAATVOERING en TEKST. Maten in mm, de tekening op ware grootte.
 *
 * Geen imports buiten de poerbestanden en de teksten: het controlescript laadt dit bestand in Node.
 */

export const DXF_LAGEN = ["BETON", "WAPENING", "MAATVOERING", "TEKST"] as const;
export type DxfLaag = (typeof DXF_LAGEN)[number];

type Prim =
  | { soort: "lijn"; laag: DxfLaag; a: P2; b: P2; streep?: boolean }
  | { soort: "lijnen"; laag: DxfLaag; punten: P2[]; dicht: boolean; streep?: boolean }
  | { soort: "cirkel"; laag: DxfLaag; c: P2; r: number; streep?: boolean }
  | { soort: "tekst"; laag: DxfLaag; p: P2; t: string; hoogte: number; uitlijn: "links" | "midden" | "rechts" };

export interface Snede {
  naam: string;
  /** Het vlak: "xz" is y = waarde, "yz" is x = waarde. */
  vlak: "xz" | "yz";
  waarde: number;
  /** Staven evenwijdig aan het vlak tot zo ver ervandaan staan als lijn in de doorsnede. */
  venster: number;
}

/** Wat de tekening van een poer nodig heeft; voor twee, drie en vier palen gelijk. */
export interface PoerVorm {
  omtrek: P2[];
  h: number;
  palen: P2[];
  paal: { rond: boolean; x: number; y: number; inbedding: number };
  kolom: { rond: boolean; x: number; y: number };
  staven: Staaf[];
  snedes: Snede[];
  /** Bij drie palen: de schuine banden kruisen, de banden liggen in drie lagen. Dat staat onder de staaflijst. */
  kruisend?: boolean;
}

export interface DetailTeksten {
  bovenaanzicht: string;
  doorsnede: string;
  staaflijst: string;
  merk: string;
  aantal: string;
  diameter: string;
  vorm: string;
  zijden: string;
  lengte: string;
  totaal: string;
  massa: string;
  totaalMassa: string;
  verlopend: string;
  maten: string;
  kruisend: string;
  soorten: Record<StaafSoort, string>;
  /** Een getal in de notatie van de taal. */
  getal?: (w: number, decimalen: number) => string;
}

/** De Nederlandse teksten; het beeld geeft die in de taal van de app mee. */
export const DETAIL_NL: DetailTeksten = beelden.poerDetail;

/** Zo ver steken paal en kolom buiten de poer in de doorsnede; ze zijn langer. */
const PAAL_AANZET = 300;
const KOLOM_AANZET = 300;

const getalStd = (w: number, n: number) => (Math.round(w * 10 ** n) / 10 ** n).toFixed(n);

// ── vormen ─────────────────────────────────────────────────────────────────

/** De tweepaalspoer: A-A in de lengte door de palen, B-B dwars boven de rechterpaal. */
export function tweepaalVorm(p: PoerDefinitie): PoerVorm {
  return {
    omtrek: [[-p.l / 2, -p.b / 2], [p.l / 2, -p.b / 2], [p.l / 2, p.b / 2], [-p.l / 2, p.b / 2]],
    h: p.h,
    palen: p.paalX.map((x) => [x, 0] as P2),
    paal: p.paal,
    kolom: p.kolom,
    staven: stavenTweepaal(p),
    snedes: [
      { naam: "A", vlak: "xz", waarde: 0, venster: p.b / 2 },
      { naam: "B", vlak: "yz", waarde: p.paalX[1], venster: Math.max(p.paal.x / 2, p.beugels.s / 2) },
    ],
  };
}

/** Drie of vier palen: A-A door een band in x, B-B door een band in y (bij drie palen door de bovenste paal). */
export function meerpaalVorm(m: MeerpaalDefinitie): PoerVorm {
  const venster = m.band.breedte / 2 + m.band.d;
  const snedes: Snede[] = m.n === 4
    ? [{ naam: "A", vlak: "xz", waarde: m.maten.a_y / 2, venster }, { naam: "B", vlak: "yz", waarde: m.maten.a_x / 2, venster }]
    : [{ naam: "A", vlak: "xz", waarde: m.palen[1][1], venster }, { naam: "B", vlak: "yz", waarde: 0, venster }];
  return { omtrek: m.omtrek, h: m.h, palen: m.palen, paal: m.paal, kolom: m.kolom, staven: stavenMeerpaal(m), snedes, kruisend: m.n === 3 };
}

// ── de tekening als lijnen, cirkels en teksten ──────────────────────────────

export interface Aanzicht {
  naam: string;
  /** De omtrek van het beton in tekeningcoördinaten: hier binnen horen de staven. */
  kader: { x0: number; y0: number; x1: number; y1: number };
}

export interface Detail {
  prims: Prim[];
  aanzichten: Aanzicht[];
  /** Het aantal staven in de plattegrond: één lijn per staaf. */
  stavenInPlan: number;
}

export interface DetailOpties {
  titel: string;
  status: string;
  teksten?: DetailTeksten;
  staaflijst?: Staaflijst;
}

function grenzen(punten: P2[]) {
  const xs = punten.map((p) => p[0]);
  const ys = punten.map((p) => p[1]);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
}

/** Rechthoek als gesloten lijn. */
const rechthoek = (laag: DxfLaag, x0: number, y0: number, x1: number, y1: number, streep = false): Prim =>
  ({ soort: "lijnen", laag, punten: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], dicht: true, streep });

/** Een ketting horizontale maten op hoogte y, met hulplijnen tot yRef. */
function maatH(uit: Prim[], xs: number[], y: number, yRef: number | null, th: number, tekst: (w: number) => string) {
  const k = [...new Set(xs.map((x) => Math.round(x * 1000) / 1000))].sort((a, b) => a - b);
  if (k.length < 2) return;
  uit.push({ soort: "lijn", laag: "MAATVOERING", a: [k[0], y], b: [k[k.length - 1], y] });
  for (const x of k) {
    uit.push({ soort: "lijn", laag: "MAATVOERING", a: [x - th / 3, y - th / 3], b: [x + th / 3, y + th / 3] });
    if (yRef !== null) uit.push({ soort: "lijn", laag: "MAATVOERING", a: [x, yRef], b: [x, y + (y > yRef ? th / 3 : -th / 3)] });
  }
  for (let i = 0; i + 1 < k.length; i++) {
    uit.push({ soort: "tekst", laag: "MAATVOERING", p: [(k[i] + k[i + 1]) / 2, y + th * 0.3], t: tekst(k[i + 1] - k[i]), hoogte: th, uitlijn: "midden" });
  }
}

/** Idem verticaal op x; de tekst staat links van de lijn. */
function maatV(uit: Prim[], ys: number[], x: number, xRef: number | null, th: number, tekst: (w: number) => string) {
  const k = [...new Set(ys.map((y) => Math.round(y * 1000) / 1000))].sort((a, b) => a - b);
  if (k.length < 2) return;
  uit.push({ soort: "lijn", laag: "MAATVOERING", a: [x, k[0]], b: [x, k[k.length - 1]] });
  for (const y of k) {
    uit.push({ soort: "lijn", laag: "MAATVOERING", a: [x - th / 3, y - th / 3], b: [x + th / 3, y + th / 3] });
    if (xRef !== null) uit.push({ soort: "lijn", laag: "MAATVOERING", a: [xRef, y], b: [x + (x > xRef ? th / 3 : -th / 3), y] });
  }
  for (let i = 0; i + 1 < k.length; i++) {
    uit.push({ soort: "tekst", laag: "MAATVOERING", p: [x + (x > (xRef ?? x) ? th * 0.4 : -th * 0.4), (k[i] + k[i + 1]) / 2 - th / 2], t: tekst(k[i + 1] - k[i]), hoogte: th, uitlijn: x > (xRef ?? x) ? "links" : "rechts" });
  }
}

/** Paal of kolom in het bovenaanzicht. */
function vorm2(uit: Prim[], laag: DxfLaag, rond: boolean, cx: number, cy: number, bx: number, by: number, streep: boolean) {
  if (!(bx > 0 && by > 0)) return;
  uit.push(rond ? { soort: "cirkel", laag, c: [cx, cy], r: bx / 2, streep } : rechthoek(laag, cx - bx / 2, cy - by / 2, cx + bx / 2, cy + by / 2, streep));
}

/** De breedte van een paal of kolom in een snedevlak op afstand δ van zijn hart; 0 als het vlak hem mist. */
function snedeBreedte(rond: boolean, maatDwars: number, maatLangs: number, δ: number): number {
  if (rond) {
    const r = maatDwars / 2;
    return Math.abs(δ) < r ? 2 * Math.sqrt(r * r - δ * δ) : 0;
  }
  return Math.abs(δ) < maatDwars / 2 ? maatLangs : 0;
}

/** De hele tekening: titel, plattegrond, de doorsneden naast elkaar eronder, en de staaflijst. */
export function maakDetail(v: PoerVorm, opties: DetailOpties): Detail {
  const t = opties.teksten ?? DETAIL_NL;
  const g = t.getal ?? getalStd;
  const lijst = opties.staaflijst ?? maakStaaflijst(v.staven);
  const uit: Prim[] = [];
  const aanzichten: Aanzicht[] = [];
  const plan = grenzen(v.omtrek);
  const S = Math.max(plan.x1 - plan.x0, plan.y1 - plan.y0, v.h, 500);
  const th = Math.max(20, Math.round(S / 70));
  const tussen = Math.max(4 * th, S * 0.12);
  const getalMaat = (w: number) => g(w, 0);
  const paden = v.staven.map((s) => afgerondPad(s, 3));

  // ── titel ────────────────────────────────────────────────────────────────
  uit.push({ soort: "tekst", laag: "TEKST", p: [plan.x0, plan.y1 + tussen + 2.6 * th], t: `${opties.titel} - ${opties.status}`, hoogte: th * 1.4, uitlijn: "links" });
  uit.push({ soort: "tekst", laag: "TEKST", p: [plan.x0, plan.y1 + tussen + 0.9 * th], t: t.maten, hoogte: th * 0.8, uitlijn: "links" });

  // ── plattegrond ──────────────────────────────────────────────────────────
  uit.push({ soort: "tekst", laag: "TEKST", p: [plan.x0, plan.y1 + th * 1.2], t: t.bovenaanzicht, hoogte: th, uitlijn: "links" });
  uit.push({ soort: "lijnen", laag: "BETON", punten: v.omtrek, dicht: true });
  for (const [x, y] of v.palen) vorm2(uit, "BETON", v.paal.rond, x, y, v.paal.x, v.paal.y, true);
  vorm2(uit, "BETON", v.kolom.rond, 0, 0, v.kolom.x, v.kolom.y, false);
  let stavenInPlan = 0;
  paden.forEach((pad, i) => {
    const pts: P2[] = [];
    for (const [x, y] of pad) {
      const laatste = pts[pts.length - 1];
      if (!laatste || Math.hypot(x - laatste[0], y - laatste[1]) > 0.05) pts.push([x, y]);
    }
    // Een staande staaf (een los beugelbeen) is in de plattegrond een stip.
    if (pts.length < 2) uit.push({ soort: "cirkel", laag: "WAPENING", c: pts[0], r: v.staven[i].d / 2 });
    else uit.push({ soort: "lijnen", laag: "WAPENING", punten: pts, dicht: v.staven[i].gesloten });
    stavenInPlan++;
  });
  aanzichten.push({ naam: t.bovenaanzicht, kader: plan });
  // snedelijnen
  for (const sn of v.snedes) {
    const m = th * 1.5;
    if (sn.vlak === "xz") {
      for (const [a, b, lx] of [[plan.x0 - 2 * m, plan.x0 - m / 2, plan.x0 - 1.25 * m], [plan.x1 + m / 2, plan.x1 + 2 * m, plan.x1 + 1.25 * m]]) {
        uit.push({ soort: "lijn", laag: "TEKST", a: [a, sn.waarde], b: [b, sn.waarde] });
        uit.push({ soort: "tekst", laag: "TEKST", p: [lx, sn.waarde + th * 0.3], t: sn.naam, hoogte: th, uitlijn: "midden" });
      }
    } else {
      for (const [a, b, ly] of [[plan.y0 - 2 * m, plan.y0 - m / 2, plan.y0 - 2.4 * m], [plan.y1 + m / 2, plan.y1 + 2 * m, plan.y1 + 2.1 * m]]) {
        uit.push({ soort: "lijn", laag: "TEKST", a: [sn.waarde, a], b: [sn.waarde, b] });
        uit.push({ soort: "tekst", laag: "TEKST", p: [sn.waarde + th * 0.5, ly], t: sn.naam, hoogte: th, uitlijn: "links" });
      }
    }
  }
  // maten: de palen in een ketting met de randen, en het geheel
  const palenX = v.palen.map((p) => p[0]);
  const palenY = v.palen.map((p) => p[1]);
  maatH(uit, [plan.x0, ...palenX, plan.x1], plan.y0 - 3 * th, plan.y0, th, getalMaat);
  maatH(uit, [plan.x0, plan.x1], plan.y0 - 5 * th, plan.y0, th, getalMaat);
  maatV(uit, [plan.y0, plan.y1], plan.x0 - 4 * th, plan.x0, th, getalMaat);
  if (new Set(palenY.map((y) => Math.round(y))).size > 1) maatV(uit, [plan.y0, ...palenY, plan.y1], plan.x1 + 4 * th, plan.x1, th, getalMaat);

  // ── doorsneden ───────────────────────────────────────────────────────────
  let xLinks = plan.x0;
  const zTop = plan.y0 - 7 * th - tussen - KOLOM_AANZET;
  let laagste = zTop - v.h - PAAL_AANZET;
  for (const sn of v.snedes) {
    const n = sn.vlak === "xz" ? 1 : 0;
    const u = sn.vlak === "xz" ? 0 : 1;
    const k = koorde(v.omtrek, n === 1 ? 1 : 0, sn.waarde);
    if (!k) continue;
    // De doorsnede ligt met z = 0 op zBasis, en met zijn linkerrand op xLinks.
    const dx = xLinks - k[0];
    const zBasis = zTop - v.h;
    const P = (uu: number, z: number): P2 => [uu + dx, zBasis + z];
    uit.push({ soort: "tekst", laag: "TEKST", p: P(k[0], v.h + KOLOM_AANZET + th * 0.6), t: `${t.doorsnede} ${sn.naam}-${sn.naam}`, hoogte: th, uitlijn: "links" });
    uit.push({ soort: "lijnen", laag: "BETON", punten: [P(k[0], 0), P(k[1], 0), P(k[1], v.h), P(k[0], v.h)], dicht: true });
    for (const pl of v.palen) {
      const b = snedeBreedte(v.paal.rond, n === 1 ? v.paal.y : v.paal.x, n === 1 ? v.paal.x : v.paal.y, pl[n] - sn.waarde);
      if (b > 0) {
        const [a0, a1] = [pl[u] - b / 2, pl[u] + b / 2];
        uit.push({ soort: "lijnen", laag: "BETON", punten: [P(a0, -PAAL_AANZET), P(a1, -PAAL_AANZET), P(a1, v.paal.inbedding), P(a0, v.paal.inbedding)], dicht: true });
      }
    }
    const kb = snedeBreedte(v.kolom.rond, n === 1 ? v.kolom.y : v.kolom.x, n === 1 ? v.kolom.x : v.kolom.y, -sn.waarde);
    if (kb > 0) uit.push({ soort: "lijnen", laag: "BETON", punten: [P(-kb / 2, v.h), P(kb / 2, v.h), P(kb / 2, v.h + KOLOM_AANZET), P(-kb / 2, v.h + KOLOM_AANZET)], dicht: true });
    // staven
    paden.forEach((pad, i) => {
      const s = v.staven[i];
      const m = pad.length;
      const stukken = s.gesloten ? m : m - 1;
      let reeks: P2[] = [];
      const sluit = () => {
        if (reeks.length >= 2) uit.push({ soort: "lijnen", laag: "WAPENING", punten: reeks, dicht: false });
        reeks = [];
      };
      for (let j = 0; j < stukken; j++) {
        const a = pad[j];
        const b = pad[(j + 1) % m];
        const da = a[n] - sn.waarde;
        const db = b[n] - sn.waarde;
        const lengte = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
        const evenwijdig = lengte > 0 && Math.abs(db - da) <= 0.3 * lengte;
        if (evenwijdig && Math.abs(da) <= sn.venster && Math.abs(db) <= sn.venster) {
          if (reeks.length === 0) reeks.push(P(a[u], a[2]));
          reeks.push(P(b[u], b[2]));
          continue;
        }
        sluit();
        if (!evenwijdig && ((da < 0 && db >= 0) || (da > 0 && db <= 0)) && da !== db) {
          const f = da / (da - db);
          const q: P3 = [a[0] + f * (b[0] - a[0]), a[1] + f * (b[1] - a[1]), a[2] + f * (b[2] - a[2])];
          uit.push({ soort: "cirkel", laag: "WAPENING", c: P(q[u], q[2]), r: s.d / 2 });
        }
      }
      sluit();
    });
    // maten
    maatH(uit, [k[0], k[1]].map((w) => w + dx), zBasis - PAAL_AANZET - 2 * th, zBasis, th, getalMaat);
    maatV(uit, [zBasis, zBasis + v.h], xLinks - 3 * th, xLinks, th, getalMaat);
    aanzichten.push({ naam: `${t.doorsnede} ${sn.naam}-${sn.naam}`, kader: { x0: k[0] + dx, y0: zBasis, x1: k[1] + dx, y1: zBasis + v.h } });
    xLinks += k[1] - k[0] + tussen + 4 * th;
    laagste = Math.min(laagste, zBasis - PAAL_AANZET - 4 * th);
  }

  // ── staaflijst ───────────────────────────────────────────────────────────
  const kop = [t.merk, t.aantal, t.diameter, t.vorm, t.zijden, t.lengte, t.totaal];
  const rijen = lijst.regels.map((r) => [
    String(r.merk), String(r.aantal), g(r.d, 0), r.vorm,
    r.verlopend ? t.verlopend : zijdenKort(r).map((z) => g(z, 0)).join("/"),
    r.verlopend ? `${g(r.lengte, 0)}-${g(r.lengteMax, 0)}` : g(r.lengte, 0),
    g(r.totaal / 1000, 2),
  ]);
  // Elke kolom zo breed als zijn langste tekst, met wat ruimte erachter.
  const teken = th * 0.9 * 0.75;
  const kolX: number[] = [];
  kop.reduce((x, k, i) => {
    kolX.push(x);
    return x + Math.max(k.length, ...rijen.map((r) => r[i].length)) * teken + th * 1.2;
  }, plan.x0);
  let y = laagste - tussen;
  uit.push({ soort: "tekst", laag: "TEKST", p: [plan.x0, y], t: `${t.staaflijst} - ${opties.status}`, hoogte: th * 1.2, uitlijn: "links" });
  y -= 2 * th;
  kop.forEach((k, i) => uit.push({ soort: "tekst", laag: "TEKST", p: [kolX[i], y], t: k, hoogte: th * 0.9, uitlijn: "links" }));
  for (const cellen of rijen) {
    y -= 1.5 * th;
    cellen.forEach((c, i) => uit.push({ soort: "tekst", laag: "TEKST", p: [kolX[i], y], t: c, hoogte: th * 0.9, uitlijn: "links" }));
  }
  y -= 2 * th;
  for (const pd of lijst.perDiameter) {
    uit.push({ soort: "tekst", laag: "TEKST", p: [plan.x0, y], t: `${t.diameter}${g(pd.d, 0)}: ${g(pd.lengte, 2)} m, ${g(pd.massa, 1)} kg`, hoogte: th * 0.9, uitlijn: "links" });
    y -= 1.5 * th;
  }
  uit.push({ soort: "tekst", laag: "TEKST", p: [plan.x0, y], t: `${t.totaalMassa}: ${g(lijst.massa, 1)} kg`, hoogte: th * 0.9, uitlijn: "links" });
  if (v.kruisend) {
    y -= 1.5 * th;
    uit.push({ soort: "tekst", laag: "TEKST", p: [plan.x0, y], t: t.kruisend, hoogte: th * 0.9, uitlijn: "links" });
  }

  return { prims: uit, aanzichten, stavenInPlan };
}

// ── DXF ────────────────────────────────────────────────────────────────────

/** DXF R12 kent alleen ASCII veilig: Ø wordt %%c, ° wordt %%d, de rest zonder accenten. */
function dxfTekst(t: string): string {
  return t
    .replace(/Ø/g, "%%c").replace(/°/g, "%%d").replace(/×/g, "x").replace(/[–—]/g, "-")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^\x20-\x7e]/g, "?");
}

const KLEUR: Record<DxfLaag, number> = { BETON: 8, WAPENING: 1, MAATVOERING: 5, TEKST: 7 };

const getalDxf = (w: number) => {
  const r = Math.round(w * 1000) / 1000;
  return Object.is(r, -0) ? "0" : String(r);
};

/** Het detail als DXF-tekst, R12 (AC1009), met CRLF-vrije regels. */
export function detailNaarDxf(detail: Detail): string {
  const r: string[] = [];
  const paar = (code: number, waarde: string | number) => r.push(String(code), typeof waarde === "number" ? getalDxf(waarde) : waarde);
  const alle = detail.prims.flatMap((p) => p.soort === "lijn" ? [p.a, p.b] : p.soort === "lijnen" ? p.punten : p.soort === "cirkel" ? [[p.c[0] - p.r, p.c[1] - p.r], [p.c[0] + p.r, p.c[1] + p.r]] as P2[] : [p.p]);
  const gr = grenzen(alle.length ? alle : [[0, 0]]);

  paar(0, "SECTION"); paar(2, "HEADER");
  paar(9, "$ACADVER"); paar(1, "AC1009");
  paar(9, "$INSBASE"); paar(10, 0); paar(20, 0); paar(30, 0);
  paar(9, "$EXTMIN"); paar(10, gr.x0); paar(20, gr.y0); paar(30, 0);
  paar(9, "$EXTMAX"); paar(10, gr.x1); paar(20, gr.y1); paar(30, 0);
  paar(9, "$LTSCALE"); paar(40, 10);
  paar(0, "ENDSEC");

  paar(0, "SECTION"); paar(2, "TABLES");
  paar(0, "TABLE"); paar(2, "LTYPE"); paar(70, 2);
  paar(0, "LTYPE"); paar(2, "CONTINUOUS"); paar(70, 0); paar(3, "Solid line"); paar(72, 65); paar(73, 0); paar(40, 0);
  paar(0, "LTYPE"); paar(2, "STREEP"); paar(70, 0); paar(3, "__ __ __"); paar(72, 65); paar(73, 2); paar(40, 15); paar(49, 10); paar(49, -5);
  paar(0, "ENDTAB");
  paar(0, "TABLE"); paar(2, "LAYER"); paar(70, DXF_LAGEN.length + 1);
  for (const [naam, kleur] of [["0", 7], ...DXF_LAGEN.map((l) => [l, KLEUR[l]])] as [string, number][]) {
    paar(0, "LAYER"); paar(2, naam); paar(70, 0); paar(62, kleur); paar(6, "CONTINUOUS");
  }
  paar(0, "ENDTAB");
  paar(0, "TABLE"); paar(2, "STYLE"); paar(70, 1);
  paar(0, "STYLE"); paar(2, "STANDARD"); paar(70, 0); paar(40, 0); paar(41, 1); paar(50, 0); paar(71, 0); paar(42, 2.5); paar(3, "txt"); paar(4, "");
  paar(0, "ENDTAB");
  paar(0, "ENDSEC");

  paar(0, "SECTION"); paar(2, "ENTITIES");
  for (const p of detail.prims) {
    if (p.soort === "lijn") {
      paar(0, "LINE"); paar(8, p.laag); if (p.streep) paar(6, "STREEP");
      paar(10, p.a[0]); paar(20, p.a[1]); paar(30, 0); paar(11, p.b[0]); paar(21, p.b[1]); paar(31, 0);
    } else if (p.soort === "lijnen") {
      paar(0, "POLYLINE"); paar(8, p.laag); if (p.streep) paar(6, "STREEP"); paar(66, 1); paar(10, 0); paar(20, 0); paar(30, 0); paar(70, p.dicht ? 1 : 0);
      for (const [x, y] of p.punten) {
        paar(0, "VERTEX"); paar(8, p.laag); paar(10, x); paar(20, y); paar(30, 0);
      }
      paar(0, "SEQEND"); paar(8, p.laag);
    } else if (p.soort === "cirkel") {
      paar(0, "CIRCLE"); paar(8, p.laag); if (p.streep) paar(6, "STREEP"); paar(10, p.c[0]); paar(20, p.c[1]); paar(30, 0); paar(40, p.r);
    } else {
      paar(0, "TEXT"); paar(8, p.laag); paar(10, p.p[0]); paar(20, p.p[1]); paar(30, 0); paar(40, p.hoogte); paar(1, dxfTekst(p.t));
      if (p.uitlijn !== "links") {
        paar(72, p.uitlijn === "midden" ? 1 : 2); paar(11, p.p[0]); paar(21, p.p[1]); paar(31, 0);
      }
    }
  }
  paar(0, "ENDSEC");
  paar(0, "EOF");
  return r.join("\n") + "\n";
}

// ── SVG ────────────────────────────────────────────────────────────────────

const SVG_KLEUR: Record<DxfLaag, string> = { BETON: "#374151", WAPENING: "#b91c1c", MAATVOERING: "#2563eb", TEKST: "#1f2937" };
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Hetzelfde detail als SVG, voor het scherm; de y-as omgeklapt. `breedte` in px. */
export function detailNaarSvg(detail: Detail, breedte: number): { svg: string; breedte: number; hoogte: number } {
  const alle = detail.prims.flatMap((p) => p.soort === "lijn" ? [p.a, p.b] : p.soort === "lijnen" ? p.punten : p.soort === "cirkel" ? [[p.c[0] - p.r, p.c[1] - p.r], [p.c[0] + p.r, p.c[1] + p.r]] as P2[] : [p.p, [p.p[0] + p.t.length * p.hoogte * 0.6, p.p[1] + p.hoogte]] as P2[]);
  const gr = grenzen(alle.length ? alle : [[0, 0]]);
  const rand = (gr.x1 - gr.x0) * 0.02;
  const W = gr.x1 - gr.x0 + 2 * rand;
  const H = gr.y1 - gr.y0 + 2 * rand;
  const X = (x: number) => (x - gr.x0 + rand).toFixed(1);
  const Y = (y: number) => (gr.y1 + rand - y).toFixed(1);
  const dik = W / 900;
  const delen: string[] = [`<rect x="0" y="0" width="${W.toFixed(1)}" height="${H.toFixed(1)}" fill="#ffffff"/>`];
  for (const p of detail.prims) {
    const kleur = SVG_KLEUR[p.laag];
    const streep = "streep" in p && p.streep ? ` stroke-dasharray="${(dik * 6).toFixed(1)} ${(dik * 3).toFixed(1)}"` : "";
    const breed = (p.laag === "WAPENING" ? dik * 1.6 : p.laag === "BETON" ? dik * 1.2 : dik * 0.7).toFixed(2);
    if (p.soort === "lijn") delen.push(`<line x1="${X(p.a[0])}" y1="${Y(p.a[1])}" x2="${X(p.b[0])}" y2="${Y(p.b[1])}" stroke="${kleur}" stroke-width="${breed}"${streep}/>`);
    else if (p.soort === "lijnen") delen.push(`<${p.dicht ? "polygon" : "polyline"} points="${p.punten.map(([x, y]) => `${X(x)},${Y(y)}`).join(" ")}" fill="none" stroke="${kleur}" stroke-width="${breed}"${streep}/>`);
    else if (p.soort === "cirkel") delen.push(`<circle cx="${X(p.c[0])}" cy="${Y(p.c[1])}" r="${p.r.toFixed(1)}" fill="${p.laag === "WAPENING" ? kleur : "none"}" stroke="${kleur}" stroke-width="${breed}"${streep}/>`);
    else delen.push(`<text x="${X(p.p[0])}" y="${Y(p.p[1])}" font-size="${p.hoogte.toFixed(1)}" font-family="Arial, Helvetica, sans-serif" fill="${kleur}" text-anchor="${p.uitlijn === "links" ? "start" : p.uitlijn === "midden" ? "middle" : "end"}">${esc(p.t)}</text>`);
  }
  const hoogte = (breedte * H) / W;
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${breedte.toFixed(0)}" height="${hoogte.toFixed(0)}" viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}">${delen.join("")}</svg>`, breedte, hoogte };
}

/** De status in de titel van de tekening. Vrijgeven kan alleen als het blad "voldoet" zegt. */
export function tekeningStatus(vrijgeven: boolean, voldoet: boolean | null, t: { ontwerp: string; vrijgegeven: string; nietVrij: string }): { tekst: string; vrijgegeven: boolean } {
  if (!vrijgeven) return { tekst: t.ontwerp, vrijgegeven: false };
  if (voldoet === true) return { tekst: t.vrijgegeven, vrijgegeven: true };
  return { tekst: `${t.ontwerp} (${t.nietVrij})`, vrijgegeven: false };
}
