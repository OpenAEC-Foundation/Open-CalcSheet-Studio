/**
 * De graaf van een grafblad: nodes en verbindingen, als gewone JSON.
 *
 * Dit is wat er in het projectbestand staat (`Exemplaar.graaf`, IFCX-attribuut
 * `ocss::blad::graaf`). Uitkomsten staan er niet in: die rekent rekenen.ts bij
 * elke wijziging opnieuw uit. Elke bewerking hieronder geeft een nieuw object
 * terug, zodat ongedaan maken in de projectstore werkt zoals bij de andere bladen.
 *
 * Versie 2 voegt groepen, losse teksten en een paar velden per node en verbinding
 * toe (het oogje, uitschakelen, de schuif van een getal, het label op een lijn). Een
 * graaf van versie 1 leest en rekent zoals hij was.
 *
 * Geen React en geen store: controlescripts laden dit bestand in Node.
 */

export const GRAAF_VERSIE = 2;

/** De soorten nodes van deze versie. Zie nodes.ts. */
export type NodeSoort =
  | "getal" | "tekst" | "waarOnwaar" | "bekijken"
  | "reeks" | "reeksAantal" | "lijstMaken" | "aantal" | "som" | "gemiddelde" | "element" | "eerste" | "laatste" | "grootste" | "kleinste"
  | "omkeren" | "sorteren" | "plat" | "opschonen" | "nemen" | "overslaan" | "lijstenSamen" | "lijstBevat" | "isLeeg" | "filter"
  | "codeblok" | "optellen" | "aftrekken" | "vermenigvuldigen" | "delen" | "rest" | "macht" | "absoluut" | "wortel"
  | "afronden" | "omlaag" | "omhoog" | "minimum" | "maximum" | "sinus" | "cosinus" | "tangens" | "pi"
  | "gelijk" | "ongelijk" | "kleiner" | "groter" | "kleinerGelijk" | "groterGelijk" | "en" | "of" | "niet" | "als"
  | "aantalWaar" | "allesWaar" | "ietsWaar"
  | "tekstenSamen" | "tekstenMetScheider" | "tekstLengte" | "hoofdletters" | "kleineLetters" | "tekstBevat" | "begintMet"
  | "vervangen" | "splitsen" | "naarTekst" | "naarGetal"
  | "punt" | "lijn" | "balk" | "doos" | "puntDelen" | "lijnPunten" | "lengteVan" | "afstandTussen"
  | "ingelezen";

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
  /** Uitkomst verborgen (true) of getoond (false); zonder: de standaard van de soort (`uitkomstVerborgen`). */
  verborgen?: boolean;
  /** Uitgeschakeld: de node rekent niet en zijn uitgangen hebben geen waarde. */
  uit?: true;
  /** Getal: de schuif en min/max/stap staan open. */
  schuif?: true;
}

export interface GraafVerbinding {
  vanNode: string;
  vanPoort: string;
  naarNode: string;
  naarPoort: string;
  /** Het label met de waarde staat blijvend op de lijn. */
  label?: true;
}

/** Een kader met een naam om een paar nodes en teksten; het kader zelf rekent zich uit. */
export interface GraafGroep {
  id: string;
  naam: string;
  /** Ids van nodes en losse teksten. Een id hoort bij hooguit één groep. */
  leden: string[];
  ingeklapt?: true;
}

/** Een los tekstblok op het vlak, zonder poorten. */
export interface GraafTekst {
  id: string;
  x: number;
  y: number;
  breedte: number;
  titel?: string;
  tekst: string;
}

export interface Graaf {
  versie: number;
  nodes: GraafNode[];
  verbindingen: GraafVerbinding[];
  groepen?: GraafGroep[];
  teksten?: GraafTekst[];
}

/** Een stuk graaf om te kopiëren en te plakken: alleen de verbindingen binnen het stuk. */
export interface GraafStuk {
  nodes: GraafNode[];
  verbindingen: GraafVerbinding[];
  teksten: GraafTekst[];
  groepen: GraafGroep[];
}

export function legeGraaf(): Graaf {
  return { versie: GRAAF_VERSIE, nodes: [], verbindingen: [] };
}

/** Wat een nieuwe node in zijn velden heeft staan. */
const BEGIN: Partial<Record<string, Record<string, string>>> = {
  getal: { waarde: "1", min: "0", max: "10", stap: "0.1", eenheid: "" },
  tekst: { tekst: "" },
  waarOnwaar: { waarde: "true" },
  lijstMaken: { aantal: "3" },
  codeblok: { code: "y = x * 2" },
};

/** Het volgende vrije id met dit voorvoegsel (`n`, `t`, `g`): één meer dan het hoogste. */
function volgendId(voor: string, ids: Iterable<string>): string {
  let hoogste = 0;
  const patroon = new RegExp(`^${voor}(\\d+)$`);
  for (const id of ids) {
    const m = patroon.exec(id);
    if (m) hoogste = Math.max(hoogste, Number(m[1]));
  }
  return `${voor}${hoogste + 1}`;
}

export function nieuweNodeId(graaf: Graaf): string {
  return volgendId("n", graaf.nodes.map((n) => n.id));
}

export function voegNodeToe(graaf: Graaf, soort: string, x: number, y: number): { graaf: Graaf; id: string } {
  const id = nieuweNodeId(graaf);
  const begin = BEGIN[soort];
  const node: GraafNode = { id, soort, x, y, ...(begin ? { invoer: { ...begin } } : {}) };
  return { graaf: { ...graaf, nodes: [...graaf.nodes, node] }, id };
}

export function verwijderNode(graaf: Graaf, id: string): Graaf {
  return verwijderKeuze(graaf, [id]);
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

/**
 * Een node met zijn velden in een vaste volgorde, zodat opslaan en weer inlezen
 * precies dezelfde JSON geeft, in welke volgorde de velden ook gezet zijn.
 */
function netNode(n: GraafNode): GraafNode {
  return {
    id: n.id,
    soort: n.soort,
    x: n.x,
    y: n.y,
    ...(n.naam !== undefined ? { naam: n.naam } : {}),
    ...(n.invoer !== undefined ? { invoer: n.invoer } : {}),
    ...(n.geheel !== undefined ? { geheel: n.geheel } : {}),
    ...(n.verborgen !== undefined ? { verborgen: n.verborgen } : {}),
    ...(n.uit ? { uit: true as const } : {}),
    ...(n.schuif ? { schuif: true as const } : {}),
  };
}

function netTekst(t: GraafTekst): GraafTekst {
  return { id: t.id, x: t.x, y: t.y, breedte: t.breedte, ...(t.titel ? { titel: t.titel } : {}), tekst: t.tekst };
}

function netGroep(g: GraafGroep): GraafGroep {
  return { id: g.id, naam: g.naam, leden: g.leden, ...(g.ingeklapt ? { ingeklapt: true as const } : {}) };
}

/** Een graaf met deze groepen en teksten; een lege lijst valt weg. Met groepen of teksten is het versie 2. */
function metDelen(graaf: Graaf, groepen: GraafGroep[] | undefined, teksten: GraafTekst[] | undefined): Graaf {
  const v2 = !!groepen?.length || !!teksten?.length;
  return {
    versie: v2 ? Math.max(graaf.versie, GRAAF_VERSIE) : graaf.versie,
    nodes: graaf.nodes,
    verbindingen: graaf.verbindingen,
    ...(groepen?.length ? { groepen } : {}),
    ...(teksten?.length ? { teksten } : {}),
  };
}

function werkNodeBij(graaf: Graaf, id: string, fn: (n: GraafNode) => GraafNode): Graaf {
  return { ...graaf, nodes: graaf.nodes.map((n) => (n.id === id ? netNode(fn(n)) : n)) };
}

function werkNodesBij(graaf: Graaf, ids: readonly string[], fn: (n: GraafNode) => GraafNode): Graaf {
  const keuze = new Set(ids);
  return { ...graaf, versie: Math.max(graaf.versie, GRAAF_VERSIE), nodes: graaf.nodes.map((n) => (keuze.has(n.id) ? netNode(fn(n)) : n)) };
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

// ── Versie 2: het oogje, uitschakelen, de schuif, het label ──────────────────

/** Bij deze soorten staat de waarde al in het veld: de uitkomst is standaard verborgen. */
const STANDAARD_VERBORGEN = new Set(["getal", "tekst", "waarOnwaar"]);

/** Of de uitkomst onder de node verborgen is. De bekijk-node toont hem altijd. */
export function uitkomstVerborgen(node: GraafNode): boolean {
  if (node.soort === "bekijken") return false;
  return node.verborgen ?? STANDAARD_VERBORGEN.has(node.soort);
}

export function zetVerborgen(graaf: Graaf, ids: readonly string[], verborgen: boolean): Graaf {
  return werkNodesBij(graaf, ids, (n) => ({ ...n, verborgen }));
}

export function zetUit(graaf: Graaf, ids: readonly string[], uit: boolean): Graaf {
  return werkNodesBij(graaf, ids, (n) => {
    const { uit: _oud, ...rest } = n;
    return uit ? { ...rest, uit: true } : rest;
  });
}

export function zetSchuif(graaf: Graaf, id: string, open: boolean): Graaf {
  return werkNodesBij(graaf, [id], (n) => {
    const { schuif: _oud, ...rest } = n;
    return open ? { ...rest, schuif: true } : rest;
  });
}

/** Zet het label met de waarde op de verbinding aan deze ingang aan of uit. */
export function wisselLabel(graaf: Graaf, naarNode: string, naarPoort: string): Graaf {
  return {
    ...graaf,
    versie: Math.max(graaf.versie, GRAAF_VERSIE),
    verbindingen: graaf.verbindingen.map((v) => {
      if (!opIngang(v, naarNode, naarPoort)) return v;
      const { label, ...rest } = v;
      return label ? rest : { ...rest, label: true };
    }),
  };
}

// ── Een keuze van nodes en teksten ────────────────────────────────────────────

/** Verschuift de nodes en teksten in de keuze. */
export function verplaatsKeuze(graaf: Graaf, ids: readonly string[], dx: number, dy: number): Graaf {
  const keuze = new Set(ids);
  return {
    ...graaf,
    nodes: graaf.nodes.map((n) => (keuze.has(n.id) ? { ...n, x: n.x + dx, y: n.y + dy } : n)),
    ...(graaf.teksten ? { teksten: graaf.teksten.map((t) => (keuze.has(t.id) ? { ...t, x: t.x + dx, y: t.y + dy } : t)) } : {}),
  };
}

/** Haalt nodes en teksten weg, met hun verbindingen. Ze gaan uit hun groep; een lege groep verdwijnt. */
export function verwijderKeuze(graaf: Graaf, ids: readonly string[]): Graaf {
  const weg = new Set(ids);
  const zonder: Graaf = {
    ...graaf,
    nodes: graaf.nodes.filter((n) => !weg.has(n.id)),
    verbindingen: graaf.verbindingen.filter((v) => !weg.has(v.vanNode) && !weg.has(v.naarNode)),
  };
  const groepen = graaf.groepen
    ?.map((g) => ({ ...g, leden: g.leden.filter((l) => !weg.has(l)) }))
    .filter((g) => g.leden.length > 0);
  return metDelen(zonder, groepen, graaf.teksten?.filter((t) => !weg.has(t.id)));
}

/**
 * Een kopie van de keuze: de nodes en teksten, de verbindingen tussen gekozen nodes,
 * en een groep alleen als al zijn leden gekozen zijn.
 */
export function kopieerKeuze(graaf: Graaf, ids: readonly string[]): GraafStuk {
  const keuze = new Set(ids);
  return {
    nodes: graaf.nodes.filter((n) => keuze.has(n.id)),
    verbindingen: graaf.verbindingen.filter((v) => keuze.has(v.vanNode) && keuze.has(v.naarNode)),
    teksten: (graaf.teksten ?? []).filter((t) => keuze.has(t.id)),
    groepen: (graaf.groepen ?? []).filter((g) => g.leden.length > 0 && g.leden.every((l) => keuze.has(l))),
  };
}

/**
 * Plakt een stuk graaf met nieuwe ids, met zijn linkerbovenhoek op (x, y). Geeft de
 * ids van de geplakte nodes en teksten terug: dat wordt de nieuwe keuze.
 */
export function plak(graaf: Graaf, stuk: GraafStuk, x: number, y: number): { graaf: Graaf; ids: string[] } {
  const plekken = [...stuk.nodes, ...stuk.teksten];
  if (plekken.length === 0) return { graaf, ids: [] };
  const dx = x - Math.min(...plekken.map((p) => p.x));
  const dy = y - Math.min(...plekken.map((p) => p.y));
  const nieuw = new Map<string, string>();
  const nodeIds = graaf.nodes.map((n) => n.id);
  const nodes = stuk.nodes.map((n) => {
    const id = volgendId("n", nodeIds);
    nodeIds.push(id);
    nieuw.set(n.id, id);
    return netNode({ ...n, id, x: n.x + dx, y: n.y + dy });
  });
  const tekstIds = (graaf.teksten ?? []).map((t) => t.id);
  const teksten = stuk.teksten.map((t) => {
    const id = volgendId("t", tekstIds);
    tekstIds.push(id);
    nieuw.set(t.id, id);
    return netTekst({ ...t, id, x: t.x + dx, y: t.y + dy });
  });
  const verbindingen = stuk.verbindingen
    .filter((v) => nieuw.has(v.vanNode) && nieuw.has(v.naarNode))
    .map((v) => ({ ...v, vanNode: nieuw.get(v.vanNode)!, naarNode: nieuw.get(v.naarNode)! }));
  const groepIds = (graaf.groepen ?? []).map((g) => g.id);
  const groepen = stuk.groepen
    .map((g) => ({ ...g, leden: g.leden.filter((l) => nieuw.has(l)).map((l) => nieuw.get(l)!) }))
    .filter((g) => g.leden.length > 0)
    .map((g) => {
      const id = volgendId("g", groepIds);
      groepIds.push(id);
      return netGroep({ ...g, id });
    });
  const samen: Graaf = { ...graaf, nodes: [...graaf.nodes, ...nodes], verbindingen: [...graaf.verbindingen, ...verbindingen] };
  return {
    graaf: metDelen(samen, [...(graaf.groepen ?? []), ...groepen], [...(graaf.teksten ?? []), ...teksten]),
    ids: [...nodes.map((n) => n.id), ...teksten.map((t) => t.id)],
  };
}

/** Kopieert de keuze en plakt hem 20 px naar rechts en naar onder. */
export function dupliceer(graaf: Graaf, ids: readonly string[]): { graaf: Graaf; ids: string[] } {
  const stuk = kopieerKeuze(graaf, ids);
  const plekken = [...stuk.nodes, ...stuk.teksten];
  if (plekken.length === 0) return { graaf, ids: [] };
  return plak(graaf, stuk, Math.min(...plekken.map((p) => p.x)) + 20, Math.min(...plekken.map((p) => p.y)) + 20);
}

// ── Groepen ───────────────────────────────────────────────────────────────────

export function groepVan(graaf: Graaf, id: string): GraafGroep | undefined {
  return graaf.groepen?.find((g) => g.leden.includes(id));
}

/** Een nieuwe groep om de keuze. Wat al in een groep zat, gaat daar uit; een lege groep verdwijnt. */
export function groepeer(graaf: Graaf, ids: readonly string[], naam: string): { graaf: Graaf; id: string } {
  const bestaat = new Set([...graaf.nodes.map((n) => n.id), ...(graaf.teksten ?? []).map((t) => t.id)]);
  const leden = [...new Set(ids)].filter((i) => bestaat.has(i));
  const keuze = new Set(leden);
  const oud = (graaf.groepen ?? [])
    .map((g) => ({ ...g, leden: g.leden.filter((l) => !keuze.has(l)) }))
    .filter((g) => g.leden.length > 0);
  const id = volgendId("g", (graaf.groepen ?? []).map((g) => g.id));
  return { graaf: metDelen(graaf, [...oud, netGroep({ id, naam, leden })], graaf.teksten), id };
}

export function hefGroepOp(graaf: Graaf, groep: string): Graaf {
  return metDelen(graaf, graaf.groepen?.filter((g) => g.id !== groep), graaf.teksten);
}

function werkGroepBij(graaf: Graaf, groep: string, fn: (g: GraafGroep) => GraafGroep): Graaf {
  return metDelen(graaf, graaf.groepen?.map((g) => (g.id === groep ? netGroep(fn(g)) : g)), graaf.teksten);
}

export function zetGroepNaam(graaf: Graaf, groep: string, naam: string): Graaf {
  return werkGroepBij(graaf, groep, (g) => ({ ...g, naam }));
}

export function wisselIngeklapt(graaf: Graaf, groep: string): Graaf {
  return werkGroepBij(graaf, groep, (g) => {
    const { ingeklapt, ...rest } = g;
    return ingeklapt ? rest : { ...rest, ingeklapt: true };
  });
}

// ── Losse teksten ─────────────────────────────────────────────────────────────

export function voegTekstToe(graaf: Graaf, x: number, y: number): { graaf: Graaf; id: string } {
  const id = volgendId("t", (graaf.teksten ?? []).map((t) => t.id));
  const tekst: GraafTekst = { id, x, y, breedte: 240, tekst: "" };
  return { graaf: metDelen(graaf, graaf.groepen, [...(graaf.teksten ?? []), tekst]), id };
}

export function zetTekst(graaf: Graaf, id: string, wat: { titel?: string; tekst?: string; breedte?: number }): Graaf {
  return metDelen(
    graaf,
    graaf.groepen,
    graaf.teksten?.map((t) => (t.id === id ? netTekst({ ...t, ...wat }) : t)),
  );
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
  if (typeof e.verborgen === "boolean") node.verborgen = e.verborgen;
  if (e.uit === true) node.uit = true;
  if (e.schuif === true) node.schuif = true;
  return netNode(node);
}

function leesTekst(x: unknown): GraafTekst | null {
  if (!x || typeof x !== "object") return null;
  const e = x as Record<string, unknown>;
  if (!isTekst(e.id) || !e.id) return null;
  return netTekst({
    id: e.id,
    x: isEindig(e.x) ? e.x : 0,
    y: isEindig(e.y) ? e.y : 0,
    breedte: isEindig(e.breedte) && e.breedte > 0 ? e.breedte : 240,
    ...(isTekst(e.titel) && e.titel ? { titel: e.titel } : {}),
    tekst: isTekst(e.tekst) ? e.tekst : "",
  });
}

/**
 * Een graaf uit een bestand of de opgeslagen staat van de app. Wat niet klopt
 * valt weg: een node zonder id, dubbele ids, een verbinding naar een node die er
 * niet is. Een tweede verbinding op dezelfde ingang: de laatste telt. Een groep
 * houdt alleen leden die er zijn en nog in geen eerdere groep zaten; een groep
 * zonder leden valt weg.
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
    graaf = verbind(graaf, {
      vanNode: v.vanNode, vanPoort: v.vanPoort, naarNode: v.naarNode, naarPoort: v.naarPoort,
      ...(v.label === true ? { label: true as const } : {}),
    });
  }

  const teksten: GraafTekst[] = [];
  for (const r of Array.isArray(e.teksten) ? e.teksten : []) {
    const t = leesTekst(r);
    if (t && !ids.has(t.id)) {
      ids.add(t.id);
      teksten.push(t);
    }
  }
  const groepen: GraafGroep[] = [];
  const ingedeeld = new Set<string>();
  const groepIds = new Set<string>();
  for (const r of Array.isArray(e.groepen) ? e.groepen : []) {
    if (!r || typeof r !== "object") continue;
    const g = r as Record<string, unknown>;
    if (!isTekst(g.id) || !g.id || groepIds.has(g.id)) continue;
    const leden = [...new Set((Array.isArray(g.leden) ? g.leden : []).filter(isTekst))].filter((l) => ids.has(l) && !ingedeeld.has(l));
    if (leden.length === 0) continue;
    groepIds.add(g.id);
    for (const l of leden) ingedeeld.add(l);
    groepen.push(netGroep({ id: g.id, naam: isTekst(g.naam) ? g.naam : "", leden, ...(g.ingeklapt === true ? { ingeklapt: true as const } : {}) }));
  }
  return metDelen(graaf, groepen, teksten);
}
