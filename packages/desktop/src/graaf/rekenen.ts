/**
 * Rekent een graaf door: in topologische volgorde, node voor node.
 *
 * Een cirkel en een fout blijven bij de node waar ze ontstaan. Een node erachter
 * krijgt de melding dat zijn ingang geen waarde heeft; de rest van de graaf rekent
 * gewoon door. Lijsten lopen mee: een lijst aan een enkelvoudige ingang rekent de
 * node per element, en de uitgang is dan een lijst.
 *
 * Bij meer lijsten tegelijk loopt het mee tot de kortste op is, en een losse
 * waarde telt voor elk element (`rekenPerElement`). Zuiver: zonder React of store.
 */
import { analyseerRekenblok, rekenWaarde } from "@ifc-calc/core";
import type { Graaf, GraafNode, GraafVerbinding } from "./model.ts";
import { GraafFout, MAX_ELEMENTEN, nodeDef, poortenVan, veldSleutel, type NodeDef, type PoortDef, type Poorten } from "./nodes.ts";
import { geometrieUit, isLijst, type Geometrie, type Waarde } from "./waarde.ts";

export interface GraafMelding {
  code: string;
  gegevens: Record<string, string | number>;
}

export interface NodeUitkomst {
  poorten: Poorten;
  /** De uitgangen met een waarde; een uitgang zonder waarde ontbreekt. */
  waarden: Record<string, Waarde>;
  /** Waarom (een deel van) de node niets oplevert. */
  fouten: GraafMelding[];
  /** Iets om op te letten, maar de node rekent wel. */
  meldingen: GraafMelding[];
}

export interface GraafUitkomst {
  nodes: Record<string, NodeUitkomst>;
  /** De doorgerekende volgorde. */
  volgorde: string[];
  /** Alle geometrie van de graaf, voor het 3D-voorbeeld. */
  geometrie: Geometrie[];
}

/**
 * De verbindingen die nu meedoen. Een verbinding op een poort die er niet meer is
 * (een naam uit de code van een codeblok gehaald) slaapt: hij blijft bewaard en
 * doet weer mee zodra de naam terugkomt, maar telt nu niet.
 */
export function actieveVerbindingen(graaf: Graaf, poorten: Map<string, Poorten>): GraafVerbinding[] {
  return graaf.verbindingen.filter((v) => {
    const van = poorten.get(v.vanNode);
    const naar = poorten.get(v.naarNode);
    return !!van && !!naar && van.uitgangen.includes(v.vanPoort) && naar.ingangen.some((p) => p.naam === v.naarPoort);
  });
}

/**
 * Sterk samenhangende delen (Tarjan): levert de nodes in topologische volgorde en
 * welke op een cirkel liggen. Een losse node met een verbinding naar zichzelf
 * ligt ook op een cirkel.
 */
function ordening(nodes: GraafNode[], verbindingen: GraafVerbinding[]): { volgorde: string[]; cirkel: Set<string> } {
  const naar = new Map<string, string[]>();
  for (const n of nodes) naar.set(n.id, []);
  const cirkel = new Set<string>();
  for (const v of verbindingen) {
    naar.get(v.vanNode)!.push(v.naarNode);
    if (v.vanNode === v.naarNode) cirkel.add(v.vanNode);
  }
  const index = new Map<string, number>();
  const laag = new Map<string, number>();
  const opStapel = new Set<string>();
  const stapel: string[] = [];
  const omgekeerd: string[] = [];
  let teller = 0;
  const bezoek = (id: string) => {
    index.set(id, teller);
    laag.set(id, teller);
    teller += 1;
    stapel.push(id);
    opStapel.add(id);
    for (const m of naar.get(id)!) {
      if (!index.has(m)) {
        bezoek(m);
        laag.set(id, Math.min(laag.get(id)!, laag.get(m)!));
      } else if (opStapel.has(m)) {
        laag.set(id, Math.min(laag.get(id)!, index.get(m)!));
      }
    }
    if (laag.get(id) === index.get(id)) {
      const deel: string[] = [];
      let w: string;
      do {
        w = stapel.pop()!;
        opStapel.delete(w);
        deel.push(w);
      } while (w !== id);
      if (deel.length > 1) for (const d of deel) cirkel.add(d);
      omgekeerd.push(...deel);
    }
  };
  for (const n of nodes) if (!index.has(n.id)) bezoek(n.id);
  return { volgorde: omgekeerd.reverse(), cirkel };
}

/**
 * Rekent per element zolang er een lijst aan een enkelvoudige ingang hangt.
 * Geneste lijsten lopen dieper mee en geven een geneste lijst terug.
 */
function rekenPerElement(
  ingangen: PoortDef[],
  uitgangen: string[],
  w: Record<string, Waarde>,
  doe: (w: Record<string, Waarde>) => Record<string, Waarde>,
  teller: { n: number },
): Record<string, Waarde> {
  const lijsten = ingangen.filter((p) => !p.lijst && isLijst(w[p.naam]));
  if (lijsten.length === 0) {
    teller.n += 1;
    if (teller.n > MAX_ELEMENTEN) throw new GraafFout("teVeelElementen", { max: MAX_ELEMENTEN });
    return doe(w);
  }
  const aantal = Math.min(...lijsten.map((p) => (w[p.naam] as Waarde[]).length));
  const per: Record<string, Waarde[]> = {};
  for (const u of uitgangen) per[u] = [];
  for (let i = 0; i < aantal; i++) {
    const los = { ...w };
    for (const p of lijsten) los[p.naam] = (w[p.naam] as Waarde[])[i];
    const uit = rekenPerElement(ingangen, uitgangen, los, doe, teller);
    for (const u of uitgangen) per[u].push(uit[u]);
  }
  // Mislukt één element, dan heeft de hele uitgang geen waarde: een lijst met
  // gaten zou de elementen erachter stil verschuiven.
  const uit: Record<string, Waarde> = {};
  for (const u of uitgangen) if (per[u].every((e) => e !== undefined)) uit[u] = per[u];
  return uit;
}

function rekenNode(
  node: GraafNode,
  def: NodeDef,
  poorten: Poorten,
  op: Map<string, GraafVerbinding>,
  uitkomsten: Record<string, NodeUitkomst>,
): NodeUitkomst {
  const uit: NodeUitkomst = { poorten, waarden: {}, fouten: [], meldingen: [] };

  if (node.soort === "ingelezen") {
    uit.fouten.push({ code: "nietOvergenomen", gegevens: { bron: node.invoer?.bron ?? "" } });
    return uit;
  }

  if (node.soort === "codeblok") {
    const a = analyseerRekenblok(node.invoer?.code ?? "");
    if (a.fout) uit.fouten.push({ code: "blok", gegevens: { naam: "", tekst: a.fout } });
    if (a.meldingen.length > 0) uit.meldingen.push({ code: "nietInBlok", gegevens: { blokken: a.meldingen.join(", ") } });
    if (a.fout) return uit;
  }

  const invoer: Record<string, Waarde> = {};
  for (const p of poorten.ingangen) {
    const v = op.get(`${node.id}\u0000${p.naam}`);
    if (v) {
      const w = uitkomsten[v.vanNode]?.waarden[v.vanPoort];
      if (w === undefined) uit.fouten.push({ code: "ingangZonderWaarde", gegevens: { naam: p.naam } });
      else invoer[p.naam] = w;
      continue;
    }
    if (p.tekst) {
      invoer[p.naam] = node.invoer?.[veldSleutel(node, p.naam)] ?? p.standaard ?? "";
      continue;
    }
    const tekst = (node.invoer?.[veldSleutel(node, p.naam)] ?? p.standaard ?? "").trim();
    if (!tekst) {
      if (!p.optioneel) uit.fouten.push({ code: "ingangOntbreekt", gegevens: { naam: p.naam } });
      continue;
    }
    try {
      invoer[p.naam] = rekenWaarde(tekst);
    } catch (err) {
      uit.fouten.push({ code: "veld", gegevens: { naam: p.naam, tekst: (err as Error).message } });
    }
  }
  if (uit.fouten.length > 0) return uit;

  const gezien = new Set<string>();
  const meld = (code: string, gegevens: Record<string, string | number>) => {
    const sleutel = `${code}\u0000${JSON.stringify(gegevens)}`;
    if (!gezien.has(sleutel)) {
      gezien.add(sleutel);
      uit.fouten.push({ code, gegevens });
    }
  };
  try {
    uit.waarden = rekenPerElement(poorten.ingangen, poorten.uitgangen, invoer, (w) => def.reken(w, { node, meld }), { n: 0 });
  } catch (err) {
    if (err instanceof GraafFout) uit.fouten.push({ code: err.code, gegevens: err.gegevens });
    else uit.fouten.push({ code: "reken", gegevens: { tekst: (err as Error).message } });
  }
  // Een uitgang zonder waarde en zonder reden kan niet stil blijven.
  if (uit.fouten.length === 0) {
    for (const u of poorten.uitgangen) {
      if (uit.waarden[u] === undefined) uit.fouten.push({ code: "uitgangZonderWaarde", gegevens: { naam: u } });
    }
  }
  return uit;
}

export function rekenGraaf(graaf: Graaf): GraafUitkomst {
  const poorten = new Map<string, Poorten>();
  for (const n of graaf.nodes) poorten.set(n.id, poortenVan(n));
  const actief = actieveVerbindingen(graaf, poorten);
  const op = new Map<string, GraafVerbinding>();
  for (const v of actief) op.set(`${v.naarNode}\u0000${v.naarPoort}`, v);

  const { volgorde, cirkel } = ordening(graaf.nodes, actief);
  const opId = new Map(graaf.nodes.map((n) => [n.id, n]));
  const nodes: Record<string, NodeUitkomst> = {};
  for (const id of volgorde) {
    const node = opId.get(id)!;
    const p = poorten.get(id)!;
    const def = nodeDef(node.soort);
    if (!def) {
      nodes[id] = { poorten: p, waarden: {}, fouten: [{ code: "onbekendeSoort", gegevens: { soort: node.soort } }], meldingen: [] };
    } else if (node.uit) {
      // Uitgeschakeld: geen waarden; een node erachter meldt een ingang zonder waarde.
      nodes[id] = { poorten: p, waarden: {}, fouten: [], meldingen: [{ code: "uitgeschakeld", gegevens: {} }] };
    } else if (cirkel.has(id)) {
      nodes[id] = { poorten: p, waarden: {}, fouten: [{ code: "cirkel", gegevens: {} }], meldingen: [] };
    } else {
      nodes[id] = rekenNode(node, def, p, op, nodes);
    }
  }

  // Een bekijk-node geeft alleen door: zijn geometrie staat er al.
  const geometrie: Geometrie[] = [];
  for (const n of graaf.nodes) {
    if (n.soort === "bekijken") continue;
    for (const w of Object.values(nodes[n.id].waarden)) geometrieUit(w, geometrie);
  }
  return { nodes, volgorde, geometrie };
}

export interface BekijkUitkomst {
  id: string;
  /** De eigen naam van de node; anders die van zijn bron, of leeg. */
  naam: string;
  /** De soort van de bron: de naam als er verder geen is. */
  bronSoort?: string;
  waarde: Waarde;
  fouten: GraafMelding[];
}

/** De bekijk-nodes op volgorde van de graaf: de tabel op papier. */
export function bekijkUitkomsten(graaf: Graaf, uitkomst: GraafUitkomst): BekijkUitkomst[] {
  return graaf.nodes.filter((n) => n.soort === "bekijken").map((n) => {
    const v = graaf.verbindingen.find((a) => a.naarNode === n.id && a.naarPoort === "waarde");
    const bron = v ? graaf.nodes.find((b) => b.id === v.vanNode) : undefined;
    const r = uitkomst.nodes[n.id];
    return {
      id: n.id,
      naam: n.naam ?? bron?.naam ?? (bron?.soort === "codeblok" && v ? v.vanPoort : ""),
      bronSoort: bron?.soort,
      waarde: r?.waarden.waarde,
      fouten: r?.fouten ?? [],
    };
  });
}
