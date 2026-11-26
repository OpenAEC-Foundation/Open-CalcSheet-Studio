import { leesIfcx, type IfcxElement } from "@ifc-calc/core";

/*
 * Poeren en palen uit een palenplan: een IFCX met IfcFooting en IfcPile, zoals een
 * tekenprogramma of een ander rekenblad dat schrijft. Per poer de palen eronder, en
 * daaruit de invoer van een poerblad: de tweepaalspoer bij twee palen, de poer op drie of
 * vier palen bij drie of vier (templates/tweepaalspoer.ts, meerpaalspoer.ts).
 *
 * Hoe er gelezen wordt (alles via leesIfcx van de kern, in meters; hier in mm):
 *   - een poer is een element met de klasse IfcFooting; zijn grondvlak is het onderste
 *     vlakke vlak van zijn geometrie, anders de omhullende rechthoek;
 *   - een paal hoort bij de poer als zijn hart (het midden van de omhullende) binnen dat
 *     grondvlak ligt; zijn maat is zijn grondvlak gemeten in de assen van de poer, rond als
 *     zijn doorsnede twaalf of meer hoeken heeft; de inbedding is de bovenkant van de paal
 *     min de onderkant van de poer;
 *   - een kolom (IfcColumn) met zijn hart binnen het grondvlak geeft de kolommaat;
 *   - de vaste id van een poer is `ocss::poer::id`, anders zijn naam, anders zijn pad;
 *     van een paal `ocss::paal::id`, zijn naam of zijn pad;
 *   - kolomlasten mogen op de poer staan: `ocss::poer::N_Ed`, `ocss::poer::N_fr` in kN en
 *     `ocss::poer::M_Edx`, `ocss::poer::M_Edy` in kNm. Zonder blijft de invoer van het blad.
 *
 * Het blad legt de palen symmetrisch om de kolom, in zijn eigen assen. De plaats en de
 * draaiing van de poer in het plan gaan mee als `plan_x`, `plan_y`, `plan_z` (mm) en
 * `plan_hoek` (graden), zodat de IFC-uitvoer de poer terugzet waar hij in het plan staat.
 * Wat niet in die vorm past (palen niet in een rechthoek of gelijkzijdige driehoek, de
 * kolom niet in het midden, palen van verschillende maat) staat in de meldingen; de poer
 * wordt dan toch overgenomen, met de maten zoals hieronder bepaald, of helemaal niet als
 * het aantal palen niet past.
 *
 * Laadt zonder React of stores: scripts/check-poer-koppeling.mjs gebruikt dit in Node.
 */

export type P2 = [number, number];

export interface PlanPaal {
  id: string;
  /** Hart in het plan, mm. */
  x: number;
  y: number;
  bx: number;
  by: number;
  rond: boolean;
  /** Bovenkant, mm. */
  kop: number;
}

export interface PlanPoer {
  id: string;
  naam: string;
  /** Het pad van de poer in het document. */
  pad: string;
  palen: PlanPaal[];
  /** Het blad dat bij deze poer hoort; null als het aantal palen niet past. */
  templateId: "tweepaalspoer" | "meerpaalspoer" | null;
  /** De invoer van het blad, als tekst zoals in een exemplaar; ook de koppelvelden. */
  waarden: Record<string, string>;
  /** De ids van de palen in de volgorde van de poerdefinitie. */
  paalIds: string[];
  meldingen: PlanMelding[];
}

/**
 * Een melding bij het lezen, als code: geenPoeren, lossePalen (n), dubbeleId (id), aantalPalen (n),
 * nietSymmetrisch, geenRechthoek, palenRechthoek, palenDriehoek, vormDriehoek, ongelijkePalen,
 * kolomMidden, of ifcx met de tekst van de lezer.
 */
export interface PlanMelding {
  code: string;
  n?: number;
  id?: string;
  tekst?: string;
}

export interface Palenplan {
  poeren: PlanPoer[];
  meldingen: PlanMelding[];
}

/** De waarden van een blad die bij de koppeling met een palenplan horen. */
export const PLAN_VELD = {
  id: "poer_id",
  bron: "plan_bron",
  inhoud: "plan_inhoud",
  paalIds: "paal_ids",
  x: "plan_x",
  y: "plan_y",
  z: "plan_z",
  hoek: "plan_hoek",
} as const;

/** Zo ver mogen palen afwijken van de vorm die het blad kent, mm. */
const TOL = 5;

const ATTR = {
  poerId: "ocss::poer::id",
  paalId: "ocss::paal::id",
  naam: "bsi::ifc::prop::Name",
  N_Ed: "ocss::poer::N_Ed",
  N_fr: "ocss::poer::N_fr",
  M_Edx: "ocss::poer::M_Edx",
  M_Edy: "ocss::poer::M_Edy",
} as const;

const getal = (w: number) => String(Math.round(w * 10) / 10);
const tekst = (w: unknown) => (typeof w === "string" && w.trim() ? w.trim() : typeof w === "number" ? String(w) : null);

/** Het midden van de omhullende in plan, in mm. */
const midden = (e: IfcxElement): P2 => [((e.grenzen.min[0] + e.grenzen.max[0]) / 2) * 1000, ((e.grenzen.min[1] + e.grenzen.max[1]) / 2) * 1000];

/** Tegen de klok in, het begin bij het punt met de kleinste x en dan y. */
function tegenDeKlok(veelhoek: P2[]): P2[] {
  let opp = 0;
  for (let i = 0; i < veelhoek.length; i++) {
    const a = veelhoek[i];
    const b = veelhoek[(i + 1) % veelhoek.length];
    opp += a[0] * b[1] - b[0] * a[1];
  }
  return opp < 0 ? [...veelhoek].reverse() : veelhoek;
}

/** Punten die op een rechte lijn tussen hun buren liggen, vallen weg. */
function zonderTussenpunten(veelhoek: P2[]): P2[] {
  const n = veelhoek.length;
  if (n < 4) return veelhoek;
  return veelhoek.filter((p, i) => {
    const a = veelhoek[(i - 1 + n) % n];
    const b = veelhoek[(i + 1) % n];
    const kruis = (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]);
    return Math.abs(kruis) > 1e-6 * Math.hypot(b[0] - a[0], b[1] - a[1]) ** 2;
  });
}

/** De bolle omhullende van punten, tegen de klok in (monotone ketting). */
function omhullende(punten: P2[]): P2[] {
  const p = [...new Map(punten.map((q) => [`${q[0].toFixed(3)},${q[1].toFixed(3)}`, q])).values()].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const kruis = (o: P2, a: P2, b: P2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const onder: P2[] = [];
  for (const q of p) {
    while (onder.length >= 2 && kruis(onder[onder.length - 2], onder[onder.length - 1], q) <= 1e-9) onder.pop();
    onder.push(q);
  }
  const boven: P2[] = [];
  for (const q of [...p].reverse()) {
    while (boven.length >= 2 && kruis(boven[boven.length - 2], boven[boven.length - 1], q) <= 1e-9) boven.pop();
    boven.push(q);
  }
  return [...onder.slice(0, -1), ...boven.slice(0, -1)];
}

/**
 * Het grondvlak van een element in mm: de omhullende van zijn liggende vlakken onderaan,
 * en zonder die bovenaan; zonder liggende vlakken de omhullende rechthoek. Een poer, paal
 * of kolom is in plan bol: de omhullende is dan het vlak zelf.
 */
export function grondvlak(e: IfcxElement): P2[] {
  const liggend = e.vlakken.filter((v) => v.punten.length >= 3 && v.punten.every((p) => Math.abs(p[2] - v.punten[0][2]) < 1e-6));
  const op = (z: number) => liggend.filter((v) => Math.abs(v.punten[0][2] - z) < 1e-6).flatMap((v) => v.punten.map((p) => [p[0] * 1000, p[1] * 1000] as P2));
  let punten = omhullende(op(e.grenzen.min[2]));
  if (punten.length < 3) punten = omhullende(op(e.grenzen.max[2]));
  if (punten.length < 3) {
    punten = [[e.grenzen.min[0], e.grenzen.min[1]], [e.grenzen.max[0], e.grenzen.min[1]], [e.grenzen.max[0], e.grenzen.max[1]], [e.grenzen.min[0], e.grenzen.max[1]]].map(([x, y]) => [x * 1000, y * 1000]);
  }
  return zonderTussenpunten(tegenDeKlok(punten));
}

function binnen(veelhoek: P2[], [x, y]: P2): boolean {
  return veelhoek.every((a, i) => {
    const b = veelhoek[(i + 1) % veelhoek.length];
    return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) >= -1e-6 * Math.hypot(b[0] - a[0], b[1] - a[1]);
  });
}

/** Rond: een doorsnede met twaalf of meer hoeken. */
const isRond = (e: IfcxElement) => e.vlakken.some((v) => v.rand && v.punten.length >= 12 && v.punten.every((p) => Math.abs(p[2] - v.punten[0][2]) < 1e-6));

/** De afstand van een punt tot de lijn door a en b. */
function totLijn(p: P2, a: P2, b: P2): number {
  const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return Math.abs((b[0] - a[0]) * (a[1] - p[1]) - (a[0] - p[0]) * (b[1] - a[1])) / l;
}

/** De uitersten van een veelhoek langs een richting u, vanuit c. */
function langs(veelhoek: P2[], c: P2, u: P2): [number, number] {
  const w = veelhoek.map((p) => (p[0] - c[0]) * u[0] + (p[1] - c[1]) * u[1]);
  return [Math.min(...w), Math.max(...w)];
}

const graden = (u: P2) => (Math.atan2(u[1], u[0]) * 180) / Math.PI;
const draai = (u: P2): P2 => [-u[1], u[0]];

/**
 * De maat van een paal of kolom in de assen van het blad: zijn grondvlak langs u en dwars
 * daarop. Zo heeft een paal die met de poer is meegedraaid ook zijn eigen maat.
 */
function maatIn(e: IfcxElement, u: P2): { x: number; y: number; rond: boolean } {
  const vlak = grondvlak(e);
  const c = midden(e);
  const [x0, x1] = langs(vlak, c, u);
  const [y0, y1] = langs(vlak, c, draai(u));
  const rond = isRond(e);
  // Rond: de omgeschreven cirkel van de veelhoek, zoals een programma een cirkel als veelhoek schrijft.
  const d = 2 * Math.max(...vlak.map((p) => Math.hypot(p[0] - c[0], p[1] - c[1])));
  return rond ? { x: d, y: d, rond } : { x: x1 - x0, y: y1 - y0, rond };
}

/** Een id: het eigen attribuut, anders de naam, anders het pad. */
const idVan = (e: IfcxElement, attr: string) => tekst(e.attributen[attr]) ?? tekst(e.attributen[ATTR.naam]) ?? e.pad;

/**
 * De poeren uit een palenplan. Meldingen als code; het beeld zet ze in de taal van de app
 * (beelden.json, poerKoppeling.meldingen). Gooit niet.
 */
export function leesPalenplan(document: unknown): Palenplan {
  const gelezen = leesIfcx(document);
  const meldingen: PlanMelding[] = gelezen.meldingen.map((tekst) => ({ code: "ifcx", tekst }));
  const poeren = gelezen.elementen.filter((e) => e.klasse === "IfcFooting");
  const palen = gelezen.elementen.filter((e) => e.klasse === "IfcPile");
  const kolommen = gelezen.elementen.filter((e) => e.klasse === "IfcColumn");
  if (poeren.length === 0) meldingen.push({ code: "geenPoeren" });
  const gebruikt = new Set<IfcxElement>();
  const uit = poeren.map((poer) => {
    const vlak = grondvlak(poer);
    const eigen = palen.filter((p) => !gebruikt.has(p) && binnen(vlak, midden(p)));
    eigen.forEach((p) => gebruikt.add(p));
    const kolom = kolommen.find((k) => binnen(vlak, midden(k)));
    return leesPoer(poer, vlak, eigen, kolom ?? null);
  });
  const los = palen.filter((p) => !gebruikt.has(p)).length;
  if (los > 0) meldingen.push({ code: "lossePalen", n: los });
  const ids = uit.map((p) => p.id);
  for (const id of new Set(ids)) if (ids.filter((x) => x === id).length > 1) meldingen.push({ code: "dubbeleId", id });
  return { poeren: uit, meldingen };
}

function leesPoer(poer: IfcxElement, vlak: P2[], paalElementen: IfcxElement[], kolom: IfcxElement | null): PlanPoer {
  const meldingen: PlanMelding[] = [];
  const id = idVan(poer, ATTR.poerId);
  const naam = tekst(poer.attributen[ATTR.naam]) ?? id;
  const onder = poer.grenzen.min[2] * 1000;
  const h = (poer.grenzen.max[2] - poer.grenzen.min[2]) * 1000;
  const palen: PlanPaal[] = paalElementen.map((e) => {
    const [x, y] = midden(e);
    return {
      id: idVan(e, ATTR.paalId), x, y,
      bx: (e.grenzen.max[0] - e.grenzen.min[0]) * 1000,
      by: (e.grenzen.max[1] - e.grenzen.min[1]) * 1000,
      rond: isRond(e), kop: e.grenzen.max[2] * 1000,
    };
  });
  const n = palen.length;
  const leeg: PlanPoer = { id, naam, pad: poer.pad, palen, templateId: null, waarden: {}, paalIds: [], meldingen };
  if (n < 2 || n > 4) {
    meldingen.push({ code: "aantalPalen", n });
    return leeg;
  }
  const c: P2 = [palen.reduce((s, p) => s + p.x, 0) / n, palen.reduce((s, p) => s + p.y, 0) / n];
  const w: Record<string, string> = {};
  let u: P2 = [1, 0];
  let volgorde: PlanPaal[] = palen;

  if (n === 2) {
    const [a, b] = [...palen].sort((p, q) => p.x - q.x || p.y - q.y);
    const l = Math.hypot(b.x - a.x, b.y - a.y);
    u = [(b.x - a.x) / l, (b.y - a.y) / l];
    const [l0, l1] = langs(vlak, c, u);
    const [b0, b1] = langs(vlak, c, draai(u));
    if (Math.abs(l0 + l1) > TOL || Math.abs(b0 + b1) > TOL) meldingen.push({ code: "nietSymmetrisch" });
    Object.assign(w, { l_poer: getal(l1 - l0), b_poer: getal(b1 - b0), a_hoh: getal(l) });
    volgorde = [a, b];
  } else if (n === 4) {
    // De assen van de poer: de rand van het grondvlak die het best langs x ligt.
    const randen = vlak.map((p, i) => {
      const q = vlak[(i + 1) % vlak.length];
      const l = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
      return [(q[0] - p[0]) / l, (q[1] - p[1]) / l] as P2;
    });
    u = randen.reduce((best, r) => (Math.abs(r[0]) > Math.abs(best[0]) ? r : best), randen[0] ?? [1, 0]);
    if (u[0] < 0) u = [-u[0], -u[1]];
    const v = draai(u);
    const lokaal = palen.map((p) => ({ p, s: (p.x - c[0]) * u[0] + (p.y - c[1]) * u[1], t: (p.x - c[0]) * v[0] + (p.y - c[1]) * v[1] }));
    const a_x = lokaal.reduce((s, q) => s + Math.abs(q.s), 0) / 2;
    const a_y = lokaal.reduce((s, q) => s + Math.abs(q.t), 0) / 2;
    if (vlak.length !== 4) meldingen.push({ code: "geenRechthoek" });
    if (lokaal.some((q) => Math.abs(Math.abs(q.s) - a_x / 2) > TOL || Math.abs(Math.abs(q.t) - a_y / 2) > TOL)) meldingen.push({ code: "palenRechthoek" });
    const [l0, l1] = langs(vlak, c, u);
    const [b0, b1] = langs(vlak, c, v);
    if (Math.abs(l0 + l1) > TOL || Math.abs(b0 + b1) > TOL) meldingen.push({ code: "nietSymmetrisch" });
    Object.assign(w, { n_p: "4", a_x: getal(a_x), a_y: getal(a_y), l_poer: getal(l1 - l0), b_poer: getal(b1 - b0) });
    // De volgorde van de definitie: (−,−), (+,−), (+,+), (−,+).
    const plek = (sx: number, sy: number) => lokaal.find((q) => Math.sign(q.s) === sx && Math.sign(q.t) === sy)?.p;
    const geordend = [plek(-1, -1), plek(1, -1), plek(1, 1), plek(-1, 1)];
    volgorde = geordend.every(Boolean) ? (geordend as PlanPaal[]) : palen;
  } else {
    const afstanden = [0, 1, 2].map((k) => Math.hypot(palen[(k + 1) % 3].x - palen[k].x, palen[(k + 1) % 3].y - palen[k].y));
    const a_3 = afstanden.reduce((s, d) => s + d, 0) / 3;
    if (afstanden.some((d) => Math.abs(d - a_3) > TOL)) meldingen.push({ code: "palenDriehoek" });
    // De bovenste paal van het blad (op 90°) is de paal die het dichtst bij 90° staat;
    // daarna tegen de klok in, zoals de definitie.
    const hoek = (p: PlanPaal) => Math.atan2(p.y - c[1], p.x - c[0]);
    const afstand90 = (p: PlanPaal) => Math.abs(Math.atan2(Math.sin(hoek(p) - Math.PI / 2), Math.cos(hoek(p) - Math.PI / 2)));
    const boven = [...palen].sort((p, q) => afstand90(p) - afstand90(q))[0];
    const rest = palen.filter((p) => p !== boven).sort((p, q) => {
      const rel = (r: PlanPaal) => (hoek(r) - hoek(boven) + 4 * Math.PI) % (2 * Math.PI);
      return rel(p) - rel(q);
    });
    volgorde = [boven, ...rest];
    const φ = hoek(boven) - Math.PI / 2;
    u = [Math.cos(φ), Math.sin(φ)];
    // De rand: de kleinste afstand van een paalhart tot een rand van het grondvlak.
    const randen = vlak.map((p, i) => [p, vlak[(i + 1) % vlak.length]] as [P2, P2]);
    const r_rand = Math.min(...palen.map((p) => Math.min(...randen.map(([a, b]) => totLijn([p.x, p.y], a, b)))));
    const verst = Math.max(...randen.map(([a, b]) => Math.min(...palen.map((p) => totLijn([p.x, p.y], a, b)))));
    if (vlak.length !== 6 || verst - r_rand > TOL) meldingen.push({ code: "vormDriehoek" });
    Object.assign(w, { n_p: "3", a_3: getal(a_3), r_rand: getal(r_rand) });
  }

  w.h_poer = getal(h);
  const maten = paalElementen.map((e) => maatIn(e, u));
  const p0 = maten[0];
  if (maten.some((m) => Math.abs(m.x - p0.x) > 1 || Math.abs(m.y - p0.y) > 1 || m.rond !== p0.rond)) meldingen.push({ code: "ongelijkePalen" });
  const px = Math.max(...maten.map((m) => m.x));
  const py = Math.max(...maten.map((m) => m.y));
  Object.assign(w, p0.rond ? { paalvorm: "2", p_x: getal(px) } : { paalvorm: "1", p_x: getal(px), p_y: getal(py) });
  const kop = Math.min(...palen.map((p) => p.kop));
  if (kop > onder + 0.5) w.t_in = getal(kop - onder);
  if (kolom) {
    const km = maatIn(kolom, u);
    Object.assign(w, km.rond ? { kolomvorm: "2", c_x: getal(km.x) } : { kolomvorm: "1", c_x: getal(km.x), c_y: getal(km.y) });
    const [kx, ky] = midden(kolom);
    if (Math.hypot(kx - c[0], ky - c[1]) > TOL) meldingen.push({ code: "kolomMidden" });
  }

  // Kolomlasten, als het plan ze heeft. De tweepaalspoer heet ze F_Ed en F_fr.
  const last = (attr: string) => {
    const v = poer.attributen[attr];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  };
  const twee = n === 2;
  const N_Ed = last(ATTR.N_Ed);
  const N_fr = last(ATTR.N_fr);
  if (N_Ed !== null) w[twee ? "F_Ed" : "N_Ed"] = getal(N_Ed);
  if (N_fr !== null) w[twee ? "F_fr" : "N_fr"] = getal(N_fr);
  if (!twee) {
    const mx = last(ATTR.M_Edx);
    const my = last(ATTR.M_Edy);
    if (mx !== null) w.M_Edx = getal(mx);
    if (my !== null) w.M_Edy = getal(my);
  }

  const paalIds = volgorde.map((p) => p.id);
  const inhoud = planInhoud(w, paalIds);
  Object.assign(w, {
    [PLAN_VELD.id]: id,
    [PLAN_VELD.paalIds]: paalIds.join(";"),
    [PLAN_VELD.x]: getal(c[0]),
    [PLAN_VELD.y]: getal(c[1]),
    [PLAN_VELD.z]: getal(onder),
    [PLAN_VELD.hoek]: getal(graden(u)),
    [PLAN_VELD.inhoud]: inhoud,
  });
  return { ...leeg, templateId: twee ? "tweepaalspoer" : "meerpaalspoer", waarden: w, paalIds };
}

/** De overgenomen invoer als vaste tekst: `naam=waarde;…`, gesorteerd. Zo ziet het blad wat er in het plan veranderde. */
export function planInhoud(waarden: Record<string, string>, paalIds: string[]): string {
  return [...Object.entries(waarden).map(([k, v]) => `${k}=${v}`), `palen=${paalIds.join(",")}`].sort().join(";");
}

function leesInhoud(tekst: string | undefined): Record<string, string> {
  const uit: Record<string, string> = {};
  for (const deel of (tekst ?? "").split(";")) {
    const i = deel.indexOf("=");
    if (i > 0) uit[deel.slice(0, i)] = deel.slice(i + 1);
  }
  return uit;
}

export interface PlanVerschil {
  naam: string;
  /** Wat er nu in het blad staat. */
  blad: string;
  /** Wat het plan zegt. */
  plan: string;
  /** Het plan is veranderd sinds het blad het overnam; anders is het blad zelf aangepast. */
  inPlan: boolean;
}

/**
 * Waar het blad en het plan verschillen, voor de invoer die het plan levert. De koppelvelden
 * (plaats, draaiing, ids) tellen ook: een verplaatste poer of een andere paal is een verschil.
 */
export function vergelijkMetPlan(bladWaarden: Readonly<Record<string, string | undefined>>, poer: PlanPoer): PlanVerschil[] {
  const vorig = leesInhoud(bladWaarden[PLAN_VELD.inhoud]);
  const uit: PlanVerschil[] = [];
  for (const [naam, plan] of Object.entries(poer.waarden)) {
    if (naam === PLAN_VELD.inhoud) continue;
    const blad = String(bladWaarden[naam] ?? "");
    const gelijk = blad === plan || (Number.isFinite(parseFloat(blad.replace(",", "."))) && Math.abs(parseFloat(blad.replace(",", ".")) - parseFloat(plan)) < 0.05);
    if (gelijk) continue;
    const toen = naam === PLAN_VELD.paalIds ? vorig.palen?.replace(/,/g, ";") : vorig[naam];
    uit.push({ naam, blad, plan, inPlan: toen !== undefined && toen !== plan });
  }
  return uit;
}

/** Wat de IFC-uitvoer van een poerblad meekrijgt: de koppeling uit de waarden en het revisienummer. */
export function koppelingVoorIfcx(waarden: Readonly<Record<string, string | undefined>>, revisie: number) {
  const k = leesKoppeling(waarden);
  return { poerId: k.poerId, paalIds: k.paalIds, plaatsing: k.plaatsing, revisie };
}

/** De koppeling van een blad: de poer-id, de palen en de plaats in het plan; leeg als het blad niet gekoppeld is. */
export function leesKoppeling(waarden: Readonly<Record<string, string | undefined>>): {
  poerId: string | null;
  paalIds: string[];
  plaatsing: { x: number; y: number; z: number; hoek: number } | null;
} {
  const g = (k: string) => {
    const n = parseFloat(String(waarden[k] ?? "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };
  const x = g(PLAN_VELD.x);
  const y = g(PLAN_VELD.y);
  return {
    poerId: tekst(waarden[PLAN_VELD.id]),
    paalIds: String(waarden[PLAN_VELD.paalIds] ?? "").split(";").filter(Boolean),
    plaatsing: x !== null && y !== null ? { x, y, z: g(PLAN_VELD.z) ?? 0, hoek: g(PLAN_VELD.hoek) ?? 0 } : null,
  };
}
