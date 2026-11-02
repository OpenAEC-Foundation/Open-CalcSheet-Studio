import type { DrieDScene, Punt3D } from './types.js';
import type { DrieDVlak } from './drieD.js';

/**
 * Leest een IFCX-document (IFC5, buildingSMART/IFC5-development): de samenstelling
 * van de knopen, de plaatsing en de geometrie. Het 3D-beeld van een blad leest
 * alleen dit: alles wat het toont, komt uit het document.
 *
 * Samenstellen gaat zoals in src/ifcx-core/composition/compose.ts van de
 * specificatie:
 *   - knopen met hetzelfde `path` worden samengevoegd, de laatste wint per
 *     attribuut, en `null` onder `children` of `inherits` haalt een naam weg;
 *   - een knoop neemt de attributen en kinderen over van wat hij `inherits`,
 *     daarna volgen zijn `children` en zijn eigen attributen;
 *   - een doel in `children` of `inherits` kan een pad de boom in zijn
 *     (`<knoop>/a/b`), en een knoop met het pad `<knoop>/a` geeft een aanvulling
 *     op het kind `a`;
 *   - wortels zijn de knopen waar niets naar wijst en zonder `/` in hun pad.
 *
 * Geometrie:
 *   `usd::usdgeom::mesh`   `points` als [[x, y, z], …], `faceVertexIndices` als
 *                          driehoeken, in meters, z omhoog (zoals de voorbeelden)
 *   `usd::xformop`         `transform`: 4×4 op rijen, de verplaatsing op de
 *                          laatste rij; geldt voor de knoop en al zijn kinderen
 *   `usd::usdgeom::visibility`   `invisible` laat de mesh weg
 *   `bsi::ifc::presentation::…`  kleur en dekking; de dichtstbijzijnde telt,
 *                          van de mesh omhoog door de boom
 *
 * Een element is de dichtstbijzijnde knoop met `bsi::ifc::class`. Een klasse
 * zonder geometrie (project, verdieping, …) is geen element.
 */

interface RuweKnoop {
  path: string;
  children?: Record<string, string | null>;
  inherits?: Record<string, string | null>;
  attributes?: Record<string, unknown>;
}

interface Voorlopig {
  children: Record<string, string | null>;
  inherits: Record<string, string>;
  attributes: Record<string, unknown>;
}

interface Samengesteld {
  attributes: Map<string, unknown>;
  children: Map<string, Samengesteld>;
}

/** Eén element uit het document. Maten in meters. */
export interface IfcxElement {
  /** Het samengestelde pad, met de namen uit `children`: `wortel/Balk_01`. */
  pad: string;
  naam: string;
  /** De IFC-klasse: `IfcBeam`. */
  klasse: string;
  /** Alle attributen van het element, ook de overgenomen, zonder geometrie, plaatsing en presentatie. */
  attributen: Record<string, unknown>;
  /** De vlakken op hun plaats in de wereld; bij elkaar horende driehoeken zijn weer één vlak. */
  vlakken: DrieDVlak[];
  /** Kleur als `#rrggbb`. */
  kleur: string;
  /** 1 is dekkend. */
  opaciteit: number;
  grenzen: { min: Punt3D; max: Punt3D };
}

export interface IfcxGelezen {
  elementen: IfcxElement[];
  /** Wat niet te lezen was: een onbekend doel, een kring, een mesh zonder punten. */
  meldingen: string[];
}

const KLASSE = 'bsi::ifc::class';
const NAAM = 'bsi::ifc::prop::Name';
const MESH = 'usd::usdgeom::mesh';
const PLAATSING = 'usd::xformop';
const ZICHTBAAR = 'usd::usdgeom::visibility';
const KLEUR = 'bsi::ifc::presentation::diffuseColor';
const DEKKING = 'bsi::ifc::presentation::opacity';
const STANDAARDKLEUR = '#a8a29e';

const kop = (pad: string) => pad.split('/')[0];
const staart = (pad: string) => pad.split('/').slice(1).join('/');

function naarKleur(rgb: unknown): string | null {
  if (!Array.isArray(rgb) || rgb.length < 3) return null;
  const c = (v: unknown) => Math.max(0, Math.min(255, Math.round(Number(v) * 255))).toString(16).padStart(2, '0');
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}

type Matrix = number[][];
const EENHEID: Matrix = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];

function isMatrix(m: unknown): m is Matrix {
  return Array.isArray(m) && m.length === 4 && m.every((r) => Array.isArray(r) && r.length === 4 && r.every((v) => typeof v === 'number'));
}

function maalMatrix(a: Matrix, b: Matrix): Matrix {
  return a.map((rij) => [0, 1, 2, 3].map((k) => rij[0] * b[0][k] + rij[1] * b[1][k] + rij[2] * b[2][k] + rij[3] * b[3][k]));
}

/** Rijvector maal matrix: de verplaatsing staat op de laatste rij. */
function plaats(p: number[], m: Matrix): Punt3D {
  const rond = (v: number) => Math.round(v * 1e9) / 1e9;
  return [
    rond(p[0] * m[0][0] + p[1] * m[1][0] + p[2] * m[2][0] + m[3][0]),
    rond(p[0] * m[0][1] + p[1] * m[1][1] + p[2] * m[2][1] + m[3][1]),
    rond(p[0] * m[0][2] + p[1] * m[1][2] + p[2] * m[2][2] + m[3][2]),
  ];
}

const sleutel = (p: Punt3D) => `${p[0].toFixed(6)},${p[1].toFixed(6)},${p[2].toFixed(6)}`;

/**
 * Driehoeken die in één vlak liggen en aan elkaar vastzitten, weer als één
 * veelhoek: een bovenvlak van twee driehoeken is voor de omtreklijn één vlak. Per
 * vlak vallen de ribben die twee keer voorkomen (heen en terug) weg; blijft er
 * één gesloten ring over, dan is dat de veelhoek. Anders blijven het driehoeken,
 * zonder omtreklijn.
 */
function naarVlakken(punten: Punt3D[], driehoeken: number[]): DrieDVlak[] {
  const groepen = new Map<string, [number, number, number][]>();
  for (let i = 0; i + 2 < driehoeken.length; i += 3) {
    const [a, b, c] = [punten[driehoeken[i]], punten[driehoeken[i + 1]], punten[driehoeken[i + 2]]];
    if (!a || !b || !c) continue;
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const l = Math.hypot(n[0], n[1], n[2]);
    if (l < 1e-12) continue;
    const e = n.map((w) => w / l);
    const d = e[0] * a[0] + e[1] * a[1] + e[2] * a[2];
    const vlak = `${e.map((w) => w.toFixed(5)).join(',')}|${d.toFixed(6)}`;
    const groep = groepen.get(vlak);
    const drie: [number, number, number] = [driehoeken[i], driehoeken[i + 1], driehoeken[i + 2]];
    if (groep) groep.push(drie);
    else groepen.set(vlak, [drie]);
  }
  const uit: DrieDVlak[] = [];
  for (const groep of groepen.values()) {
    const ribben = new Map<string, { naar: string; punt: Punt3D }>();
    for (const drie of groep) {
      for (let k = 0; k < 3; k++) {
        const p = punten[drie[k]];
        const q = punten[drie[(k + 1) % 3]];
        const [sp, sq] = [sleutel(p), sleutel(q)];
        if (ribben.get(sq)?.naar === sp) ribben.delete(sq);
        else ribben.set(sp, { naar: sq, punt: p });
      }
    }
    const ring: Punt3D[] = [];
    const start = ribben.keys().next().value;
    let hier = start;
    while (hier !== undefined && ring.length <= ribben.size) {
      const r = ribben.get(hier);
      if (!r) break;
      ring.push(r.punt);
      hier = r.naar;
      if (hier === start) break;
    }
    if (hier === start && ring.length === ribben.size && ring.length >= 3) {
      uit.push({ punten: ring, rand: true });
    } else {
      for (const drie of groep) uit.push({ punten: drie.map((k) => punten[k]), rand: false });
    }
  }
  return uit;
}

/** Leest een IFCX-document. Gooit niet: wat niet te lezen is, wordt een melding. */
export function leesIfcx(document: unknown): IfcxGelezen {
  const meldingen: string[] = [];
  const data = (document as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return { elementen: [], meldingen: ['IFCX: het document heeft geen data'] };

  // Stap 1: één voorlopige knoop per pad.
  const knopen = new Map<string, Voorlopig>();
  for (const k of data as RuweKnoop[]) {
    if (!k || typeof k.path !== 'string') continue;
    let v = knopen.get(k.path);
    if (!v) {
      v = { children: {}, inherits: {}, attributes: {} };
      knopen.set(k.path, v);
    }
    Object.assign(v.children, k.children ?? {});
    for (const [naam, doel] of Object.entries(k.inherits ?? {})) {
      if (doel === null) delete v.inherits[naam];
      else v.inherits[naam] = doel;
    }
    Object.assign(v.attributes, k.attributes ?? {});
  }

  // Wortels: waar niets naar wijst.
  const doelen = new Set<string>();
  for (const v of knopen.values()) {
    for (const d of [...Object.values(v.children), ...Object.values(v.inherits)]) {
      if (d) doelen.add(d);
    }
  }
  const wortels = [...knopen.keys()].filter((p) => !doelen.has(p) && !p.includes('/'));
  if (wortels.length === 0 && knopen.size > 0) meldingen.push('IFCX: geen wortel gevonden, de knopen wijzen in een kring naar elkaar');

  // Stap 2: samenstellen.
  function kindOp(n: Samengesteld, pad: string): Samengesteld | null {
    if (pad === '') return n;
    let hier: Samengesteld | undefined = n;
    for (const deel of pad.split('/')) {
      hier = hier.children.get(deel);
      if (!hier) return null;
    }
    return hier;
  }

  function stel(pad: string, bezig: Set<string>): Samengesteld {
    const uit: Samengesteld = { attributes: new Map(), children: new Map() };
    vul(pad, uit, bezig);
    return uit;
  }

  function haal(doel: string, bezig: Set<string>): Samengesteld | null {
    const h = kop(doel);
    if (bezig.has(h)) {
      meldingen.push(`IFCX: kring bij ${h}`);
      return null;
    }
    bezig.add(h);
    const n = stel(h, bezig);
    bezig.delete(h);
    const sub = kindOp(n, staart(doel));
    if (!sub) meldingen.push(`IFCX: onbekend doel ${doel}`);
    return sub;
  }

  function vul(pad: string, n: Samengesteld, bezig: Set<string>) {
    const v = knopen.get(pad);
    if (v) {
      for (const doel of Object.values(v.inherits)) {
        const sub = haal(doel, bezig);
        if (!sub) continue;
        for (const [naam, kind] of sub.children) n.children.set(naam, kind);
        for (const [a, w] of sub.attributes) n.attributes.set(a, w);
      }
      for (const [naam, doel] of Object.entries(v.children)) {
        if (doel === null) {
          n.children.delete(naam);
          continue;
        }
        const sub = haal(doel, bezig);
        if (sub) n.children.set(naam, sub);
      }
      for (const [a, w] of Object.entries(v.attributes)) n.attributes.set(a, w);
    }
    // Een knoop `<pad>/<naam>` is een aanvulling op dat kind.
    for (const [naam, kind] of n.children) vul(`${pad}/${naam}`, kind, bezig);
  }

  // Stap 3: door de boom, met plaatsing, kleur en het element van het moment.
  interface Bak {
    pad: string;
    naam: string;
    klasse: string;
    attributen: Record<string, unknown>;
    vlakken: DrieDVlak[];
    kleur: string | null;
    opaciteit: number;
  }
  const bakken: Bak[] = [];

  function loop(n: Samengesteld, pad: string, ouder: Matrix, kleur: string | null, opaciteit: number, bak: Bak | null) {
    const a = n.attributes;
    const t = (a.get(PLAATSING) as { transform?: unknown } | undefined)?.transform;
    const m = isMatrix(t) ? maalMatrix(t, ouder) : ouder;
    const eigenKleur = naarKleur(a.get(KLEUR)) ?? kleur;
    const dekking = a.get(DEKKING);
    const eigenDekking = typeof dekking === 'number' ? dekking : opaciteit;

    let hier = bak;
    const klasse = a.get(KLASSE) as { code?: unknown } | undefined;
    if (typeof klasse?.code === 'string' || !bak) {
      const attributen: Record<string, unknown> = {};
      for (const [k, w] of a) {
        if (!k.startsWith('usd::') && !k.startsWith('bsi::ifc::presentation::')) attributen[k] = w;
      }
      const naam = a.get(NAAM);
      hier = {
        pad,
        naam: typeof naam === 'string' ? naam : pad.split('/').pop() ?? pad,
        klasse: typeof klasse?.code === 'string' ? klasse.code : '',
        attributen,
        vlakken: [],
        kleur: eigenKleur,
        opaciteit: eigenDekking,
      };
      bakken.push(hier);
    }

    const mesh = a.get(MESH) as { points?: unknown; faceVertexIndices?: unknown } | undefined;
    const onzichtbaar = (a.get(ZICHTBAAR) as { visibility?: unknown } | undefined)?.visibility === 'invisible';
    if (mesh && !onzichtbaar && hier) {
      if (Array.isArray(mesh.points) && Array.isArray(mesh.faceVertexIndices)) {
        hier.vlakken.push(...naarVlakken((mesh.points as number[][]).map((p) => plaats(p, m)), mesh.faceVertexIndices as number[]));
        hier.kleur = eigenKleur ?? hier.kleur;
        hier.opaciteit = Math.min(hier.opaciteit, eigenDekking);
      } else {
        meldingen.push(`IFCX: mesh zonder punten bij ${pad}`);
      }
    }
    for (const [naam, kind] of n.children) loop(kind, `${pad}/${naam}`, m, eigenKleur, eigenDekking, hier);
  }

  for (const w of wortels) loop(stel(w, new Set([w])), w, EENHEID, null, 1, null);

  const elementen: IfcxElement[] = [];
  for (const b of bakken) {
    if (b.vlakken.length === 0) continue;
    const lo: Punt3D = [Infinity, Infinity, Infinity];
    const hi: Punt3D = [-Infinity, -Infinity, -Infinity];
    for (const v of b.vlakken) {
      for (const q of v.punten) {
        for (let k = 0; k < 3; k++) {
          lo[k] = Math.min(lo[k], q[k]);
          hi[k] = Math.max(hi[k], q[k]);
        }
      }
    }
    elementen.push({
      pad: b.pad, naam: b.naam, klasse: b.klasse, attributen: b.attributen, vlakken: b.vlakken,
      kleur: b.kleur ?? STANDAARDKLEUR, opaciteit: b.opaciteit, grenzen: { min: lo, max: hi },
    });
  }
  return { elementen, meldingen };
}

/**
 * Wat gelezen is als scène voor de tekenaars van `@3d`: de stilstaande projectie
 * (drieDSvg) en de afbeelding voor papier. In meters, z omhoog, zonder raster en
 * assen: een balklaag heeft die niet nodig om te lezen.
 */
export function ifcxNaarScene(gelezen: IfcxGelezen, hoogte = 320, camera: DrieDScene['camera'] = 'iso'): DrieDScene {
  return {
    eenheid: 'm',
    camera,
    raster: false,
    assen: false,
    hoogte,
    elementen: gelezen.elementen.map((e) => ({
      soort: 'vlakken' as const, vlakken: e.vlakken, kleur: e.kleur, opaciteit: e.opaciteit, pad: e.pad,
    })),
  };
}
