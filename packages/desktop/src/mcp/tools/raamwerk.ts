/**
 * De 2D-rekenkern voor raamwerken via MCP en REST: `frame_solve`.
 *
 * Rekent een vlak raamwerk door met de kern van de rekentaal
 * (packages/core/src/raamwerk.ts: verplaatsingsmethode, exact binnen de
 * staaftheorie, met α_cr). Los van het project: er verandert niets.
 *
 * Twee manieren van invoeren:
 *   • vrij: knopen, staven, opleggingen en lasten;
 *   • een portaal als standaard element: overspanning, kolomhoogte, dakhelling,
 *     voeten scharnierend of ingeklemd, profielen, en de lasten per lastgeval
 *     op dak en wanden. De tool maakt daar knopen en staven van (met de klok
 *     mee, zodat de binnenkant de rechterkant van elke staaf is) en geeft dat
 *     model terug.
 *
 * Lasten hebben een lastgeval (`case`); een combinatie geeft per lastgeval een
 * factor. Zonder combinaties komt er per lastgeval een uitkomst met factor 1.
 *
 * Eenheden: m, kN, kN/m, kNm; EI in kNm², EA en GA in kN; verplaatsingen in mm,
 * rotaties in mrad. Een profiel uit de profieltabel (components/calc/profielen.ts)
 * geeft EI, EA en het eigen gewicht met E = 210 000 N/mm² en 78,5 kN/m³.
 */
import {
  raamwerkKnik, raamwerkOplossing, raamwerkReacties, raamwerkSamenvatting, raamwerkStatus, raamwerkVerplaatsingen,
} from "@ifc-calc/core";
import type { JsonSchema, McpToolDef } from "../contracts.ts";
import { PROFIELEN, type Profiel } from "../../components/calc/profielen.ts";
import { LEZEN, fout, objectSchema, ok } from "./hulp.ts";

// ── Afspraken met de kern ─────────────────────────────────────────────────────

const SOORT = { distributed: 1, point: 2, node: 3 } as const;
const RICHTING = { x: 1, y: 2, "y-projected": 3, perpendicular: 4, axial: 5, moment: 6 } as const;
const STAAL_E = 210000; // N/mm²
const STAAL_GEWICHT = 78.5; // kN/m³
/** Onder α_cr = 10 tellen de tweedeordeeffecten mee (NEN-EN 1993-1-1, 5.2.1(3)). */
const ACR_GRENS = 10;
const MAX_KNOPEN = 1000;

type Getal = number;
interface Staaf {
  nr: number;
  naam: string;
  van: number;
  naar: number;
  EI: Getal;
  EA: Getal;
  GA: Getal;
  scharnierBegin: boolean;
  scharnierEind: boolean;
  profiel?: string;
  gewicht: Getal; // kN/m
  L: Getal;
}
interface Last {
  geval: string;
  soort: keyof typeof SOORT;
  nr: number;
  a: Getal;
  b: Getal;
  qa: Getal;
  qb: Getal;
  richting: keyof typeof RICHTING;
}
interface Model {
  knopen: [Getal, Getal][];
  staven: Staaf[];
  opleggingen: { knoop: number; x: boolean; y: boolean; rotatie: boolean }[];
  lasten: Last[];
}

class Invoerfout extends Error {}

// ── Hulpjes ────────────────────────────────────────────────────────────────

const isGetal = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
function getal(v: unknown, wat: string, standaard?: number): number {
  if (v === undefined || v === null) {
    if (standaard !== undefined) return standaard;
    throw new Invoerfout(`${wat} is missing.`);
  }
  if (!isGetal(v)) throw new Invoerfout(`${wat} must be a number.`);
  return v;
}
function positief(v: unknown, wat: string): number {
  const n = getal(v, wat);
  if (!(n > 0)) throw new Invoerfout(`${wat} must be greater than 0.`);
  return n;
}
/** Zes significante cijfers, zonder −0. */
const rond = (v: number) => (v === 0 || !Number.isFinite(v) ? 0 : Number(v.toPrecision(6)) + 0);

const sleutelVan = (naam: string) => naam.replace(/\s+/g, "").toUpperCase();
const PROFIEL_OP_NAAM = new Map<string, Profiel>(Object.values(PROFIELEN).map((p) => [sleutelVan(p.naam), p]));

/** EI, EA en eigen gewicht van een doorsnede: een profiel uit de tabel, of EI en EA zelf. */
function doorsnede(d: Record<string, unknown>, wat: string): { EI: number; EA: number; GA: number; gewicht: number; profiel?: string } {
  const GA = d.GA === undefined ? 0 : getal(d.GA, `${wat}.GA`);
  if (typeof d.profile === "string") {
    const p = PROFIEL_OP_NAAM.get(sleutelVan(d.profile));
    if (!p) throw new Invoerfout(`${wat}.profile "${d.profile}" is not in the profile table (HEA, HEB, HEM, IPE, …; e.g. "HEA 200").`);
    const E = getal(d.E, `${wat}.E`, STAAL_E) * 1000; // N/mm² → kN/m²
    return {
      EI: d.EI !== undefined ? positief(d.EI, `${wat}.EI`) : E * p.Iy * 1e-12,
      EA: d.EA !== undefined ? positief(d.EA, `${wat}.EA`) : E * p.A * 1e-6,
      GA,
      gewicht: d.weight !== undefined ? getal(d.weight, `${wat}.weight`) : STAAL_GEWICHT * p.A * 1e-6,
      profiel: p.naam,
    };
  }
  return {
    EI: positief(d.EI, `${wat}.EI`),
    EA: positief(d.EA, `${wat}.EA`),
    GA,
    gewicht: d.weight !== undefined ? getal(d.weight, `${wat}.weight`) : 0,
  };
}

const lengte = (m: Model, s: { van: number; naar: number }) => {
  const [x1, y1] = m.knopen[s.van - 1];
  const [x2, y2] = m.knopen[s.naar - 1];
  return Math.hypot(x2 - x1, y2 - y1);
};

// ── Vrije invoer ──────────────────────────────────────────────────────────

function vrijModel(args: Record<string, unknown>): Model {
  const nodes = args.nodes as Record<string, unknown>[] | undefined;
  const members = args.members as Record<string, unknown>[] | undefined;
  const supports = args.supports as Record<string, unknown>[] | undefined;
  if (!nodes?.length || !members?.length || !supports?.length) {
    throw new Invoerfout("Give nodes, members and supports, or a portal.");
  }
  if (nodes.length > MAX_KNOPEN) throw new Invoerfout(`At most ${MAX_KNOPEN} nodes.`);
  const m: Model = { knopen: [], staven: [], opleggingen: [], lasten: [] };
  nodes.forEach((n, i) => m.knopen.push([getal(n.x, `nodes[${i}].x`), getal(n.y, `nodes[${i}].y`)]));
  const knoop = (v: unknown, wat: string) => {
    const k = getal(v, wat);
    if (!Number.isInteger(k) || k < 1 || k > m.knopen.length) throw new Invoerfout(`${wat} = ${k}: no such node (1 … ${m.knopen.length}).`);
    return k;
  };
  members.forEach((s, i) => {
    const wat = `members[${i}]`;
    const van = knoop(s.from, `${wat}.from`);
    const naar = knoop(s.to, `${wat}.to`);
    const d = doorsnede(s, wat);
    const staaf: Staaf = {
      nr: i + 1, naam: typeof s.name === "string" ? s.name : `member ${i + 1}`, van, naar, ...d,
      scharnierBegin: s.hingeStart === true, scharnierEind: s.hingeEnd === true, L: 0,
    };
    staaf.L = lengte(m, staaf);
    if (!(staaf.L > 0)) throw new Invoerfout(`${wat} has length 0.`);
    m.staven.push(staaf);
  });
  supports.forEach((o, i) => {
    const wat = `supports[${i}]`;
    const type = o.type ?? "pinned";
    const basis = type === "fixed" ? [true, true, true] : type === "roller" ? [false, true, false] : [true, true, false];
    m.opleggingen.push({
      knoop: knoop(o.node, `${wat}.node`),
      x: typeof o.x === "boolean" ? o.x : basis[0],
      y: typeof o.y === "boolean" ? o.y : basis[1],
      rotatie: typeof o.rotation === "boolean" ? o.rotation : basis[2],
    });
  });
  ((args.loads as Record<string, unknown>[] | undefined) ?? []).forEach((l, i) => {
    const wat = `loads[${i}]`;
    const soort = (l.kind ?? "distributed") as keyof typeof SOORT;
    const richting = (l.direction ?? "y") as keyof typeof RICHTING;
    const geval = typeof l.case === "string" && l.case ? l.case : "1";
    if (soort === "node") {
      const waarde = getal(l.value ?? l.q, `${wat}.value`);
      m.lasten.push({ geval, soort, nr: knoop(l.node, `${wat}.node`), a: 0, b: 0, qa: waarde, qb: 0, richting });
      return;
    }
    const nr = getal(l.member, `${wat}.member`);
    if (!Number.isInteger(nr) || nr < 1 || nr > m.staven.length) throw new Invoerfout(`${wat}.member = ${nr}: no such member (1 … ${m.staven.length}).`);
    if (soort === "point") {
      m.lasten.push({ geval, soort, nr, a: getal(l.a, `${wat}.a`), b: 0, qa: getal(l.value ?? l.q, `${wat}.value`), qb: 0, richting });
      return;
    }
    const qa = getal(l.q ?? l.qa, `${wat}.q`);
    m.lasten.push({
      geval, soort, nr, richting, qa,
      qb: l.qb !== undefined ? getal(l.qb, `${wat}.qb`) : qa,
      a: getal(l.a, `${wat}.a`, 0),
      b: getal(l.b, `${wat}.b`, m.staven[nr - 1].L),
    });
  });
  return m;
}

// ── Het portaal als standaard element ──────────────────────────────────────

const PORTAAL_LASTEN = ["roof", "roofLeft", "roofRight", "roofWindLeft", "roofWindRight", "wallLeft", "wallRight"] as const;

function portaalModel(p: Record<string, unknown>): Model {
  const L = positief(p.span, "portal.span");
  const h = positief(p.height, "portal.height");
  const helling = getal(p.pitch, "portal.pitch", 0);
  if (helling < 0 || helling >= 60) throw new Invoerfout("portal.pitch must be between 0 and 60 degrees.");
  const nokScharnier = p.ridgeHinge === true;
  const ingeklemd = p.feet === "fixed";
  const kolom = doorsnede((p.column ?? {}) as Record<string, unknown>, "portal.column");
  const regel = doorsnede((p.rafter ?? p.column ?? {}) as Record<string, unknown>, "portal.rafter");
  const geknikt = helling > 0 || nokScharnier;
  const nok = h + (L / 2) * Math.tan((helling * Math.PI) / 180);

  // Met de klok mee: linkerkolom omhoog, de regel naar rechts, de rechterkolom omlaag.
  const m: Model = {
    knopen: geknikt ? [[0, 0], [0, h], [L / 2, nok], [L, h], [L, 0]] : [[0, 0], [0, h], [L, h], [L, 0]],
    staven: [],
    opleggingen: [],
    lasten: [],
  };
  const staaf = (van: number, naar: number, naam: string, d: typeof kolom, eind = false) => {
    const s: Staaf = { nr: m.staven.length + 1, naam, van, naar, ...d, scharnierBegin: false, scharnierEind: eind, L: 0 };
    s.L = lengte(m, s);
    m.staven.push(s);
  };
  staaf(1, 2, "column left", kolom);
  if (geknikt) {
    staaf(2, 3, "rafter left", regel, nokScharnier);
    staaf(3, 4, "rafter right", regel);
    staaf(4, 5, "column right", kolom);
  } else {
    staaf(2, 3, "rafter", regel);
    staaf(3, 4, "column right", kolom);
  }
  const voeten = [1, m.knopen.length];
  for (const k of voeten) m.opleggingen.push({ knoop: k, x: true, y: true, rotatie: ingeklemd });

  // De lasten per lastgeval. Op de regel: verticaal per m horizontale projectie
  // (roof), of loodrecht op het dakvlak (roofWind, druk positief). Op de wanden:
  // loodrecht, druk (naar binnen) positief, zuiging negatief.
  const kolomL = 1;
  const kolomR = m.staven.length;
  const delen = (kant: "links" | "rechts"): { nr: number; a: number; b: number }[] => {
    if (geknikt) {
      const s = m.staven[kant === "links" ? 1 : 2];
      return [{ nr: s.nr, a: 0, b: s.L }];
    }
    return [{ nr: 2, a: kant === "links" ? 0 : L / 2, b: kant === "links" ? L / 2 : L }];
  };
  const gevallen = (p.loads as Record<string, unknown>[] | undefined) ?? [];
  gevallen.forEach((g, i) => {
    const wat = `portal.loads[${i}]`;
    const geval = typeof g.case === "string" && g.case ? g.case : String(i + 1);
    const zet = (nr: number, a: number, b: number, q: number, richting: keyof typeof RICHTING) => {
      if (q !== 0) m.lasten.push({ geval, soort: "distributed", nr, a, b, qa: q, qb: q, richting });
    };
    const veld = (naam: (typeof PORTAAL_LASTEN)[number]) => getal(g[naam], `${wat}.${naam}`, 0);
    const dak = veld("roof");
    // Links en rechts gelijk op een platte regel: één last over de hele regel.
    const perKant = (links: number, rechts: number, richting: keyof typeof RICHTING) => {
      if (!geknikt && links === rechts) return zet(2, 0, L, links, richting);
      for (const d of delen("links")) zet(d.nr, d.a, d.b, links, richting);
      for (const d of delen("rechts")) zet(d.nr, d.a, d.b, rechts, richting);
    };
    perKant(dak + veld("roofLeft"), dak + veld("roofRight"), "y-projected");
    perKant(veld("roofWindLeft"), veld("roofWindRight"), "perpendicular");
    zet(kolomL, 0, h, veld("wallLeft"), "perpendicular");
    zet(kolomR, 0, h, veld("wallRight"), "perpendicular");
  });
  return m;
}

// ── Doorrekenen ─────────────────────────────────────────────────────────────

function matrices(m: Model) {
  return {
    kn: m.knopen.map(([x, y]) => [x, y]),
    st: m.staven.map((s) => [s.van, s.naar, s.EI, s.EA, s.scharnierBegin ? 1 : 0, s.scharnierEind ? 1 : 0, s.GA]),
    op: m.opleggingen.map((o) => [o.knoop, o.x ? 1 : 0, o.y ? 1 : 0, o.rotatie ? 1 : 0]),
    last: m.lasten.length
      ? m.lasten.map((l) => [l.nr, SOORT[l.soort], l.a, l.b, l.qa, l.qb, RICHTING[l.richting]])
      : [[0, 0, 0, 0, 0, 0, 0]],
  };
}

function staafUitkomst(R: number[][], s: Staaf) {
  const [Nmin, Nmax, Vmin, Vmax, Mmin, Mmax, M0, , Mhalf, , ML, , wmin, wmax] = raamwerkSamenvatting(R, s.nr);
  return {
    member: s.nr, name: s.naam, L: rond(s.L),
    N_min: rond(Nmin), N_max: rond(Nmax), V_min: rond(Vmin), V_max: rond(Vmax),
    M_min: rond(Mmin), M_max: rond(Mmax), M_start: rond(M0), M_mid: rond(Mhalf), M_end: rond(ML),
    w_max: rond(1000 * Math.max(Math.abs(wmin), Math.abs(wmax))),
  };
}

export function rekenRaamwerk(args: Record<string, unknown>): Record<string, unknown> {
  const m = args.portal ? portaalModel(args.portal as Record<string, unknown>) : vrijModel(args);

  if (typeof args.selfWeight === "string" && args.selfWeight) {
    for (const s of m.staven) {
      if (s.gewicht > 0) m.lasten.push({ geval: args.selfWeight, soort: "distributed", nr: s.nr, a: 0, b: s.L, qa: s.gewicht, qb: s.gewicht, richting: "y" });
    }
  }

  const { kn, st, op, last } = matrices(m);
  const status = raamwerkStatus(kn, st, op);
  if (status === 0) throw new Invoerfout("The frame is not valid: check the node numbers, member lengths, EI and EA.");
  if (status === -1) throw new Invoerfout("The frame is a mechanism: add a support or remove a hinge.");

  const gevallen = [...new Set(m.lasten.map((l) => l.geval))];
  const opgegeven = (args.combinations as { name?: unknown; factors?: unknown }[] | undefined) ?? [];
  const combinaties = opgegeven.length
    ? opgegeven.map((c, i) => {
      const factoren = (c.factors ?? {}) as Record<string, unknown>;
      for (const [g, f] of Object.entries(factoren)) {
        if (!gevallen.includes(g)) throw new Invoerfout(`combinations[${i}]: no load case "${g}" (cases: ${gevallen.join(", ") || "none"}).`);
        getal(f, `combinations[${i}].factors.${g}`);
      }
      return { naam: typeof c.name === "string" && c.name ? c.name : `combination ${i + 1}`, factoren: factoren as Record<string, number> };
    })
    : gevallen.map((g) => ({ naam: g, factoren: { [g]: 1 } }));
  if (!combinaties.length) combinaties.push({ naam: "no loads", factoren: {} });

  const metPunten = args.points === true;
  const metKnik = args.buckling !== false;
  const uitkomsten = combinaties.map((c) => {
    const f = m.lasten.length ? m.lasten.map((l) => c.factoren[l.geval] ?? 0) : [0];
    const R = raamwerkOplossing(kn, st, op, last, f, 1);
    const acr = metKnik ? raamwerkKnik(kn, st, op, last, f) : null;
    return {
      combination: c.naam,
      factors: c.factoren,
      ...(acr !== null ? { alphaCr: acr >= 1e6 ? null : rond(acr), secondOrder: acr < ACR_GRENS } : {}),
      reactions: raamwerkReacties(kn, st, op, last, f).map(([k, Rx, Ry, M]) => ({ node: k, Rx: rond(Rx), Ry: rond(Ry), M: rond(M) })),
      displacements: raamwerkVerplaatsingen(kn, st, op, last, f).map(([k, ux, uy, phi]) => ({
        node: k, ux: rond(1000 * ux), uy: rond(1000 * uy), phi: rond(1000 * phi),
      })),
      members: m.staven.map((s) => staafUitkomst(R, s)),
      ...(metPunten ? { points: R.map((r) => r.map(rond)) } : {}),
    };
  });

  const omhullende = uitkomsten.length > 1
    ? m.staven.map((s, i) => {
      const per = uitkomsten.map((u) => u.members[i]);
      return {
        member: s.nr, name: s.naam,
        N_min: Math.min(...per.map((p) => p.N_min)), N_max: Math.max(...per.map((p) => p.N_max)),
        V_min: Math.min(...per.map((p) => p.V_min)), V_max: Math.max(...per.map((p) => p.V_max)),
        M_min: Math.min(...per.map((p) => p.M_min)), M_max: Math.max(...per.map((p) => p.M_max)),
      };
    })
    : undefined;

  return {
    units: { length: "m", force: "kN", moment: "kNm", EI: "kNm2", EA: "kN", displacement: "mm", rotation: "mrad" },
    conventions:
      "x to the right, y upwards. Loads in y: downwards positive. Perpendicular loads: positive towards the right side of the member (seen from start to end); in a portal that is the inside, so pressure is positive. " +
      "Reactions act on the frame; moments and rotations clockwise positive. N: tension positive. M: positive with tension on the right side of the member (in a portal: the inside). " +
      "alphaCr: elastic critical load factor of the combination (null: no compression); secondOrder: alphaCr < 10 (EN 1993-1-1 5.2.1).",
    model: {
      nodes: m.knopen.map(([x, y], i) => ({ node: i + 1, x: rond(x), y: rond(y) })),
      members: m.staven.map((s) => ({
        member: s.nr, name: s.naam, from: s.van, to: s.naar, L: rond(s.L), EI: rond(s.EI), EA: rond(s.EA),
        ...(s.GA ? { GA: rond(s.GA) } : {}), ...(s.profiel ? { profile: s.profiel } : {}),
        ...(s.gewicht ? { weight: rond(s.gewicht) } : {}),
        ...(s.scharnierBegin ? { hingeStart: true } : {}), ...(s.scharnierEind ? { hingeEnd: true } : {}),
      })),
      supports: m.opleggingen.map((o) => ({ node: o.knoop, x: o.x, y: o.y, rotation: o.rotatie })),
      loads: m.lasten.map((l) => ({
        case: l.geval, kind: l.soort, ...(l.soort === "node" ? { node: l.nr } : { member: l.nr }),
        ...(l.soort === "distributed" ? { a: rond(l.a), b: rond(l.b), qa: rond(l.qa), qb: rond(l.qb) } : { a: rond(l.a), value: rond(l.qa) }),
        direction: l.richting,
      })),
      loadCases: gevallen,
    },
    results: uitkomsten,
    ...(omhullende ? { envelope: omhullende } : {}),
  };
}

// ── De tool ─────────────────────────────────────────────────────────────────

const getalSchema = (description: string): JsonSchema => ({ type: "number", description });
const doorsnedeVelden: Record<string, JsonSchema> = {
  profile: { type: "string", description: "Steel profile from the profile table, e.g. \"HEA 200\" or \"IPE 300\" (strong axis): gives EI, EA and self-weight." },
  EI: getalSchema("Bending stiffness [kNm2]; overrides the profile."),
  EA: getalSchema("Axial stiffness [kN]; overrides the profile."),
  GA: getalSchema("Shear stiffness kappa*G*A [kN]; optional, 0 = no shear deformation."),
  E: getalSchema("Young's modulus for the profile [N/mm2]; default 210000."),
  weight: getalSchema("Self-weight [kN/m]; default from the profile (78.5 kN/m3), else 0."),
};
const doorsnedeSchema = (wat: string): JsonSchema => ({ ...objectSchema(doorsnedeVelden), description: `${wat}: a profile, or EI and EA.` });

export const RAAMWERKTOOLS: McpToolDef[] = [
  {
    name: "frame_solve",
    kind: "read",
    description:
      "Solve a plane (2D) frame with the app's frame kernel (displacement method, exact for prismatic members, with hinges, supports and the elastic critical load factor alpha_cr). Nothing in the project changes. " +
      "Give either a free frame (nodes, members, supports, loads) or a portal frame as a standard element (portal: span, height, pitch, pinned or fixed feet, column and rafter profiles, loads per load case on roof and walls). " +
      "Loads belong to a load case; combinations give a factor per load case (without combinations: one result per load case). " +
      "Returns per combination the reactions, node displacements, N/V/M extremes per member and alpha_cr, plus the model that was solved. Units: m, kN, kNm; displacements in mm.",
    inputSchema: objectSchema({
      nodes: {
        type: "array", description: "Free frame: nodes [m]; the node number is the position in the list (from 1).",
        items: objectSchema({ x: getalSchema("x [m]"), y: getalSchema("y [m], upwards") }, ["x", "y"]),
      },
      members: {
        type: "array", description: "Free frame: members between two nodes, with a profile or EI and EA. The member number is the position in the list (from 1).",
        items: objectSchema({
          from: { type: "integer", minimum: 1, description: "Start node." },
          to: { type: "integer", minimum: 1, description: "End node." },
          name: { type: "string" },
          hingeStart: { type: "boolean", description: "Moment-free at the start." },
          hingeEnd: { type: "boolean", description: "Moment-free at the end." },
          ...doorsnedeVelden,
        }, ["from", "to"]),
      },
      supports: {
        type: "array", description: "Free frame: supports. type pinned (x, y fixed), fixed (x, y, rotation) or roller (y fixed); x, y and rotation override.",
        items: objectSchema({
          node: { type: "integer", minimum: 1 },
          type: { type: "string", enum: ["pinned", "fixed", "roller"] },
          x: { type: "boolean" }, y: { type: "boolean" }, rotation: { type: "boolean" },
        }, ["node"]),
      },
      loads: {
        type: "array", description: "Free frame: loads. distributed (q from a to b along the member, qb for a linear load), point (value at a), node (value on a node).",
        items: objectSchema({
          case: { type: "string", description: "Load case, e.g. G, Q, S, W. Default \"1\"." },
          kind: { type: "string", enum: ["distributed", "point", "node"], description: "Default distributed." },
          member: { type: "integer", minimum: 1 },
          node: { type: "integer", minimum: 1 },
          a: getalSchema("Start [m] from the start node of the member; default 0."),
          b: getalSchema("End [m]; default the member length."),
          q: getalSchema("Distributed load [kN/m], or the value of a point or node load [kN, kNm]."),
          qa: getalSchema("Distributed load at a [kN/m] (same as q)."),
          qb: getalSchema("Distributed load at b [kN/m]; default q."),
          value: getalSchema("Point or node load [kN, kNm]."),
          direction: {
            type: "string", enum: Object.keys(RICHTING),
            description: "x (to the right), y (downwards, per m member), y-projected (downwards, per m horizontal projection: snow), perpendicular (to the right side of the member), axial (from start to end), moment (clockwise). Default y.",
          },
        }),
      },
      portal: {
        ...objectSchema({
          span: getalSchema("Span L [m], centre to centre of the columns."),
          height: getalSchema("Column height h [m] up to the knee."),
          pitch: getalSchema("Roof pitch [degrees]; 0 = flat. Default 0."),
          ridgeHinge: { type: "boolean", description: "Hinge at the ridge (three-hinged portal with pinned feet)." },
          feet: { type: "string", enum: ["pinned", "fixed"], description: "Default pinned." },
          column: doorsnedeSchema("Columns"),
          rafter: doorsnedeSchema("Rafter; default the column"),
          loads: {
            type: "array", description: "Loads per load case [kN/m]. roof, roofLeft, roofRight: vertical per m horizontal projection, downwards positive (both halves, left, right). roofWindLeft, roofWindRight: perpendicular to the roof, pressure positive. wallLeft, wallRight: perpendicular to the wall, pressure (inwards) positive, suction negative.",
            items: objectSchema({
              case: { type: "string" },
              roof: getalSchema("kN/m"), roofLeft: getalSchema("kN/m"), roofRight: getalSchema("kN/m"),
              roofWindLeft: getalSchema("kN/m"), roofWindRight: getalSchema("kN/m"),
              wallLeft: getalSchema("kN/m"), wallRight: getalSchema("kN/m"),
            }),
          },
        }, ["span", "height", "column"]),
        description: "A portal frame as a standard element. Members clockwise: column left, rafter (left, right), column right; M positive with tension on the inside.",
      },
      selfWeight: { type: "string", description: "Add the self-weight of every member with a weight to this load case, e.g. \"G\"." },
      combinations: {
        type: "array", description: "Load combinations: a factor per load case, e.g. {name: \"6.10b\", factors: {G: 1.2, S: 1.5}}. A load case not named counts 0.",
        items: objectSchema({ name: { type: "string" }, factors: { type: "object", additionalProperties: { type: "number" } } }, ["factors"]),
      },
      points: { type: "boolean", description: "Also return the points along the members per combination: [member, s, x, y, N, V, M, u_x, u_y, w] (u and w in m)." },
      buckling: { type: "boolean", description: "Compute alpha_cr per combination. Default true." },
    }),
    annotations: LEZEN,
    rest: [{ method: "POST", path: "/frame" }],
    handler: (args) => {
      try {
        return ok(rekenRaamwerk(args));
      } catch (e) {
        if (e instanceof Invoerfout) return fout("VALIDATION", e.message);
        return fout("CALC_ERROR", `The frame could not be solved: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
  },
];
