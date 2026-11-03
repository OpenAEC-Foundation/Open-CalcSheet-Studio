/**
 * De graaf van een grafblad: nodes en verbindingen, als gewone JSON.
 *
 * Dit is wat er in het projectbestand staat (`Exemplaar.graaf`, IFCX-attribuut
 * `ocss::blad::graaf`). Uitkomsten staan er niet in: die rekent rekenen.ts bij
 * elke wijziging opnieuw uit. Elke bewerking hieronder geeft een nieuw object
 * terug, zodat ongedaan maken in de projectstore werkt zoals bij de andere bladen.
 *
 * Geen React en geen store: controlescripts laden dit bestand in Node.
 */

export const GRAAF_VERSIE = 1;

/** De soorten nodes van deze versie. Zie nodes.ts. */
export type NodeSoort =
  | "getal" | "tekst" | "reeks" | "aantal" | "som" | "element" | "bekijken" | "codeblok"
  | "punt" | "lijn" | "balk" | "doos";

export interface GraafNode {
  id: string;
  /** Een `NodeSoort`; een onbekende soort uit een nieuwer bestand blijft bewaard. */
  soort: string;
  x: number;
  y: number;
  /** Een eigen naam; anders de naam van de soort. */
  naam?: string;
  /**
   * Wat er in de velden van de node staat, als tekst zoals je hem typt: de waarde
   * van een ingang zonder verbinding (`b` → `200 mm`), de code van een codeblok.
   */
  invoer?: Record<string, string>;
  /** Codeblok: ingangen die de hele lijst krijgen in plaats van per element te rekenen. */
  geheel?: string[];
}

export interface GraafVerbinding {
  vanNode: string;
  vanPoort: string;
  naarNode: string;
  naarPoort: string;
}

export interface Graaf {
  versie: number;
  nodes: GraafNode[];
  verbindingen: GraafVerbinding[];
}

export function legeGraaf(): Graaf {
  return { versie: GRAAF_VERSIE, nodes: [], verbindingen: [] };
}

/** Wat een nieuwe node in zijn velden heeft staan. */
const BEGIN: Partial<Record<string, Record<string, string>>> = {
  getal: { waarde: "1", min: "0", max: "10", stap: "0.1", eenheid: "" },
  tekst: { tekst: "" },
  codeblok: { code: "y = x * 2" },
};

export function nieuweNodeId(graaf: Graaf): string {
  let hoogste = 0;
  for (const n of graaf.nodes) {
    const m = /^n(\d+)$/.exec(n.id);
    if (m) hoogste = Math.max(hoogste, Number(m[1]));
  }
  return `n${hoogste + 1}`;
}

export function voegNodeToe(graaf: Graaf, soort: string, x: number, y: number): { graaf: Graaf; id: string } {
  const id = nieuweNodeId(graaf);
  const begin = BEGIN[soort];
  const node: GraafNode = { id, soort, x, y, ...(begin ? { invoer: { ...begin } } : {}) };
  return { graaf: { ...graaf, nodes: [...graaf.nodes, node] }, id };
}

export function verwijderNode(graaf: Graaf, id: string): Graaf {
  return {
    ...graaf,
    nodes: graaf.nodes.filter((n) => n.id !== id),
    verbindingen: graaf.verbindingen.filter((v) => v.vanNode !== id && v.naarNode !== id),
  };
}

const opIngang = (v: GraafVerbinding, node: string, poort: string) => v.naarNode === node && v.naarPoort === poort;

/** Eén verbinding per ingang: een nieuwe vervangt wat er al aan hing. */
export function verbind(graaf: Graaf, v: GraafVerbinding): Graaf {
  return {
    ...graaf,
    verbindingen: [...graaf.verbindingen.filter((a) => !opIngang(a, v.naarNode, v.naarPoort)), v],
  };
}

export function ontkoppel(graaf: Graaf, naarNode: string, naarPoort: string): Graaf {
  return { ...graaf, verbindingen: graaf.verbindingen.filter((a) => !opIngang(a, naarNode, naarPoort)) };
}

function werkNodeBij(graaf: Graaf, id: string, fn: (n: GraafNode) => GraafNode): Graaf {
  return { ...graaf, nodes: graaf.nodes.map((n) => (n.id === id ? fn(n) : n)) };
}

export function verplaatsNode(graaf: Graaf, id: string, x: number, y: number): Graaf {
  return werkNodeBij(graaf, id, (n) => ({ ...n, x, y }));
}

export function zetInvoer(graaf: Graaf, id: string, naam: string, waarde: string): Graaf {
  return werkNodeBij(graaf, id, (n) => ({ ...n, invoer: { ...n.invoer, [naam]: waarde } }));
}

export function zetNodeNaam(graaf: Graaf, id: string, naam: string): Graaf {
  return werkNodeBij(graaf, id, (n) => {
    const { naam: _oud, ...rest } = n;
    return naam.trim() ? { ...rest, naam: naam.trim() } : rest;
  });
}

/** Zet een ingang van een codeblok om tussen per element en de hele lijst. */
export function wisselGeheel(graaf: Graaf, id: string, naam: string): Graaf {
  return werkNodeBij(graaf, id, (n) => {
    const nu = n.geheel ?? [];
    const { geheel: _oud, ...rest } = n;
    const nieuw = nu.includes(naam) ? nu.filter((g) => g !== naam) : [...nu, naam];
    return nieuw.length > 0 ? { ...rest, geheel: nieuw } : rest;
  });
}

const isTekst = (x: unknown): x is string => typeof x === "string";
const isEindig = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);

function leesNode(x: unknown): GraafNode | null {
  if (!x || typeof x !== "object") return null;
  const e = x as Record<string, unknown>;
  if (!isTekst(e.id) || !e.id || !isTekst(e.soort)) return null;
  const node: GraafNode = { id: e.id, soort: e.soort, x: isEindig(e.x) ? e.x : 0, y: isEindig(e.y) ? e.y : 0 };
  if (isTekst(e.naam) && e.naam) node.naam = e.naam;
  if (e.invoer && typeof e.invoer === "object") {
    const invoer: Record<string, string> = {};
    for (const [k, w] of Object.entries(e.invoer as Record<string, unknown>)) {
      if (isTekst(w)) invoer[k] = w;
    }
    node.invoer = invoer;
  }
  if (Array.isArray(e.geheel)) {
    const geheel = e.geheel.filter(isTekst);
    if (geheel.length > 0) node.geheel = geheel;
  }
  return node;
}

/**
 * Een graaf uit een bestand of de opgeslagen staat van de app. Wat niet klopt
 * valt weg: een node zonder id, dubbele ids, een verbinding naar een node die er
 * niet is. Een tweede verbinding op dezelfde ingang: de laatste telt.
 */
export function leesGraaf(x: unknown): Graaf | undefined {
  if (!x || typeof x !== "object") return undefined;
  const e = x as Record<string, unknown>;
  if (!Array.isArray(e.nodes)) return undefined;
  const nodes: GraafNode[] = [];
  const ids = new Set<string>();
  for (const r of e.nodes) {
    const n = leesNode(r);
    if (n && !ids.has(n.id)) {
      ids.add(n.id);
      nodes.push(n);
    }
  }
  let graaf: Graaf = { versie: isEindig(e.versie) ? e.versie : GRAAF_VERSIE, nodes, verbindingen: [] };
  for (const r of Array.isArray(e.verbindingen) ? e.verbindingen : []) {
    if (!r || typeof r !== "object") continue;
    const v = r as Record<string, unknown>;
    if (!isTekst(v.vanNode) || !isTekst(v.vanPoort) || !isTekst(v.naarNode) || !isTekst(v.naarPoort)) continue;
    if (!ids.has(v.vanNode) || !ids.has(v.naarNode)) continue;
    graaf = verbind(graaf, { vanNode: v.vanNode, vanPoort: v.vanPoort, naarNode: v.naarNode, naarPoort: v.naarPoort });
  }
  return graaf;
}
