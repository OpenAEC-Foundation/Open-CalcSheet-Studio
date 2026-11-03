/**
 * De soorten nodes: hun poorten en wat ze uitrekenen.
 *
 * Alle rekenwerk met eenheden gaat via de rekenkern, zodat `6 m + 1500 mm` hier
 * hetzelfde uitkomt als in een rekenblad. De teksten staan in de vertalingen
 * (werkruimte.json, `graaf.soort.*` en `graaf.poort.*`).
 */
import { analyseerRekenblok, rekenRekenblok, rekenUitdrukking, rekenWaarde } from "@ifc-calc/core";
import type { GraafNode, NodeSoort } from "./model.ts";
import { alsLijstWaarde, afstand, isGeometrie, isGrootheid, isLijst, type Geometrie, type Punt, type Waarde } from "./waarde.ts";

export interface PoortDef {
  naam: string;
  /** Krijgt de hele lijst; zonder dit rekent de node per element. */
  lijst?: boolean;
  /** Wat in het veld staat zolang er geen verbinding is. */
  standaard?: string;
  /** Geen veld op de node: alleen via een verbinding (een punt, een lijst). */
  geenVeld?: boolean;
  /** Mag leeg blijven. */
  optioneel?: boolean;
}

/** Een melding bij een node; de tekst komt uit de vertalingen (`graaf.fout.<code>`). */
export class GraafFout extends Error {
  code: string;
  gegevens: Record<string, string | number>;
  constructor(code: string, gegevens: Record<string, string | number> = {}) {
    super(code);
    this.code = code;
    this.gegevens = gegevens;
  }
}

export interface RekenContext {
  node: GraafNode;
  /** Een fout die de andere uitgangen laat staan (een codeblok met één mislukte regel). */
  meld: (code: string, gegevens: Record<string, string | number>) => void;
}

export interface NodeDef {
  soort: NodeSoort;
  groep: "invoer" | "lijst" | "reken" | "geometrie";
  /** Breedte op het vlak, in px. */
  breedte: number;
  ingangen: PoortDef[];
  uitgangen: string[];
  reken: (w: Record<string, Waarde>, c: RekenContext) => Record<string, Waarde>;
}

/** Eén lijst van meer elementen is bijna altijd een vergissing in de stap, en houdt de app op. */
export const MAX_ELEMENTEN = 10000;

const NUL: Punt = [0, 0, 0];

/** Een maat in mm: een lengte, of een getal zonder eenheid (dat telt in mm, zoals in een `@3d`-blok). */
function lengte(w: Waarde, naam: string): number {
  if (typeof w === "number" && Number.isFinite(w)) return w;
  if (isGrootheid(w)) {
    try {
      return w.toNumber("mm");
    } catch {
      throw new GraafFout("geenLengte", { naam });
    }
  }
  throw new GraafFout("geenLengte", { naam });
}

function punt(w: Waarde, naam: string): Punt {
  if (isGeometrie(w) && w.geometrie === "punt") return w.p;
  throw new GraafFout("geenPunt", { naam });
}

const grootheidGeenFout = (fn: () => Waarde): Waarde => {
  try {
    return fn();
  } catch (err) {
    throw new GraafFout("reken", { tekst: (err as Error).message });
  }
};

/**
 * Van, tot, stap: `van + i·stap`, elk element los uit de rekenkern, zodat de
 * afrondfout van de stap niet oploopt. De bovengrens telt mee als hij er op
 * 1e-9 stap na op valt: 1/0,1 is in drijvende komma net geen 10.
 */
function reeks(van: Waarde, tot: Waarde, stap: Waarde): Waarde[] {
  const n = grootheidGeenFout(() => rekenUitdrukking("(tot - van) / stap", { van, tot, stap }));
  if (typeof n !== "number") throw new GraafFout("reeksEenheid");
  if (!Number.isFinite(n)) throw new GraafFout("stapNul");
  if (n < -1e-9) throw new GraafFout("stapRichting");
  const aantal = Math.floor(n + 1e-9) + 1;
  if (aantal > MAX_ELEMENTEN) throw new GraafFout("teVeelElementen", { max: MAX_ELEMENTEN });
  const uit: Waarde[] = [];
  for (let i = 0; i < aantal; i++) uit.push(rekenUitdrukking("van + i * stap", { van, i, stap }));
  return uit;
}

function som(lijst: Waarde[]): Waarde {
  if (lijst.length === 0) return 0;
  return lijst.slice(1).reduce(
    (a, b) => grootheidGeenFout(() => rekenUitdrukking("a + b", { a, b })),
    lijst[0],
  );
}

function element(lijst: Waarde[], index: Waarde): Waarde {
  if (typeof index !== "number" || !Number.isInteger(index)) throw new GraafFout("indexGeenGeheel");
  if (index < 1 || index > lijst.length) throw new GraafFout("indexBuitenBereik", { index, aantal: lijst.length });
  return lijst[index - 1];
}

const alsLijst = (w: Waarde): Waarde[] => (isLijst(w) ? w : [w]);

/** De doorsnede van een codeblok: de waarden die het blok binnengaan moeten rekenbaar zijn. */
function rekenCodeblok(w: Record<string, Waarde>, c: RekenContext): Record<string, Waarde> {
  const invoer: Record<string, unknown> = {};
  for (const [naam, waarde] of Object.entries(w)) {
    if (isLijst(waarde) ? waarde.some(isGeometrie) : isGeometrie(waarde)) throw new GraafFout("geometrieInBlok", { naam });
    // Een hele lijst gaat als vector het blok in, zoals `v = [1; 2; 3]` in een blad.
    invoer[naam] = isLijst(waarde) ? rekenUitdrukking("matrix(v)", { v: waarde }) : waarde;
  }
  const { uitgangen, fouten } = rekenRekenblok(c.node.invoer?.code ?? "", invoer);
  for (const f of fouten) c.meld("blok", { naam: f.naam, tekst: f.tekst });
  const uit: Record<string, Waarde> = {};
  for (const [naam, waarde] of Object.entries(uitgangen)) uit[naam] = alsLijstWaarde(waarde);
  return uit;
}

const lijnVan = (w: Record<string, Waarde>) => {
  const van = punt(w.van, "van");
  const naar = punt(w.naar, "naar");
  if (afstand(van, naar) === 0) throw new GraafFout("nulLengte");
  return { van, naar };
};

const DEFS: Record<NodeSoort, NodeDef> = {
  getal: {
    soort: "getal",
    groep: "invoer",
    breedte: 220,
    ingangen: [],
    uitgangen: ["waarde"],
    reken: (_w, c) => {
      const { waarde = "0", eenheid = "" } = c.node.invoer ?? {};
      try {
        return { waarde: rekenWaarde(`${waarde} ${eenheid}`.trim()) };
      } catch (err) {
        throw new GraafFout("veld", { naam: "waarde", tekst: (err as Error).message });
      }
    },
  },
  tekst: {
    soort: "tekst",
    groep: "invoer",
    breedte: 200,
    ingangen: [],
    uitgangen: ["tekst"],
    reken: (_w, c) => ({ tekst: c.node.invoer?.tekst ?? "" }),
  },
  reeks: {
    soort: "reeks",
    groep: "lijst",
    breedte: 200,
    ingangen: [{ naam: "van", standaard: "0" }, { naam: "tot", standaard: "10" }, { naam: "stap", standaard: "1" }],
    uitgangen: ["lijst"],
    reken: (w) => ({ lijst: reeks(w.van, w.tot, w.stap) }),
  },
  aantal: {
    soort: "aantal",
    groep: "lijst",
    breedte: 170,
    ingangen: [{ naam: "lijst", lijst: true, geenVeld: true }],
    uitgangen: ["aantal"],
    reken: (w) => ({ aantal: alsLijst(w.lijst).length }),
  },
  som: {
    soort: "som",
    groep: "lijst",
    breedte: 170,
    ingangen: [{ naam: "lijst", lijst: true, geenVeld: true }],
    uitgangen: ["som"],
    reken: (w) => ({ som: som(alsLijst(w.lijst)) }),
  },
  element: {
    soort: "element",
    groep: "lijst",
    breedte: 190,
    ingangen: [{ naam: "lijst", lijst: true, geenVeld: true }, { naam: "index", standaard: "1" }],
    uitgangen: ["element"],
    reken: (w) => ({ element: element(alsLijst(w.lijst), w.index) }),
  },
  bekijken: {
    soort: "bekijken",
    groep: "invoer",
    breedte: 200,
    ingangen: [{ naam: "waarde", lijst: true, geenVeld: true }],
    uitgangen: ["waarde"],
    reken: (w) => ({ waarde: w.waarde }),
  },
  codeblok: {
    soort: "codeblok",
    groep: "reken",
    breedte: 280,
    ingangen: [],
    uitgangen: [],
    reken: rekenCodeblok,
  },
  punt: {
    soort: "punt",
    groep: "geometrie",
    breedte: 210,
    ingangen: [{ naam: "x", standaard: "0 mm" }, { naam: "y", standaard: "0 mm" }, { naam: "z", standaard: "0 mm" }],
    uitgangen: ["punt"],
    reken: (w) => ({ punt: { geometrie: "punt", p: [lengte(w.x, "x"), lengte(w.y, "y"), lengte(w.z, "z")] } satisfies Geometrie }),
  },
  lijn: {
    soort: "lijn",
    groep: "geometrie",
    breedte: 170,
    ingangen: [{ naam: "van", geenVeld: true }, { naam: "naar", geenVeld: true }],
    uitgangen: ["lijn"],
    reken: (w) => ({ lijn: { geometrie: "lijn", ...lijnVan(w) } satisfies Geometrie }),
  },
  balk: {
    soort: "balk",
    groep: "geometrie",
    breedte: 250,
    ingangen: [
      { naam: "van", geenVeld: true },
      { naam: "naar", geenVeld: true },
      { naam: "b", standaard: "200 mm" },
      { naam: "h", standaard: "400 mm" },
    ],
    uitgangen: ["balk"],
    reken: (w) => {
      const b = lengte(w.b, "b");
      const h = lengte(w.h, "h");
      if (b <= 0 || h <= 0) throw new GraafFout("geenMaat");
      return { balk: { geometrie: "balk", ...lijnVan(w), b, h } satisfies Geometrie };
    },
  },
  doos: {
    soort: "doos",
    groep: "geometrie",
    breedte: 200,
    ingangen: [
      { naam: "hoek", geenVeld: true, optioneel: true },
      { naam: "dx", standaard: "1000 mm" },
      { naam: "dy", standaard: "1000 mm" },
      { naam: "dz", standaard: "1000 mm" },
    ],
    uitgangen: ["doos"],
    reken: (w) => {
      const maat: Punt = [lengte(w.dx, "dx"), lengte(w.dy, "dy"), lengte(w.dz, "dz")];
      if (maat.some((m) => m <= 0)) throw new GraafFout("geenMaat");
      return { doos: { geometrie: "doos", hoek: w.hoek === undefined ? NUL : punt(w.hoek, "hoek"), maat } satisfies Geometrie };
    },
  },
};

/** Op deze volgorde in het zoekmenu. */
export const NODE_SOORTEN = Object.keys(DEFS) as NodeSoort[];

export function nodeDef(soort: string): NodeDef | undefined {
  return Object.prototype.hasOwnProperty.call(DEFS, soort) ? DEFS[soort as NodeSoort] : undefined;
}

export interface Poorten {
  ingangen: PoortDef[];
  uitgangen: string[];
}

const GEEN_POORTEN: Poorten = { ingangen: [], uitgangen: [] };

/**
 * Onder welke sleutel in `invoer` het veld van een ingang staat: de naam van de
 * ingang. Een ingang van een codeblok die `code` heet mag de code zelf niet
 * overschrijven; `@code` kan geen naam in de rekentaal zijn.
 */
export function veldSleutel(node: GraafNode, naam: string): string {
  return node.soort === "codeblok" && naam === "code" ? "@code" : naam;
}

/**
 * De poorten van een node op dit moment. Bij een codeblok volgen ze uit de code:
 * wat het blok gebruikt maar niet definieert is een ingang, wat het definieert
 * een uitgang. Een ingang is geheel als de gebruiker dat zo heeft gezet.
 */
export function poortenVan(node: GraafNode): Poorten {
  const def = nodeDef(node.soort);
  if (!def) return GEEN_POORTEN;
  if (node.soort !== "codeblok") return def;
  const a = analyseerRekenblok(node.invoer?.code ?? "");
  return {
    ingangen: a.ingangen.map((naam) => ({ naam, lijst: node.geheel?.includes(naam) ?? false })),
    uitgangen: a.uitgangen,
  };
}

// ── De maten op het vlak ──────────────────────────────────────────────────────

/** Hoogte van de kop van een node, in px op het vlak. */
export const KOP_HOOGTE = 28;
/** Hoogte van één rij poorten. De poorten staan vast bovenaan: de verbindingen hoeven niets te meten. */
export const RIJ_HOOGTE = 26;

export const nodeBreedte = (node: GraafNode) => nodeDef(node.soort)?.breedte ?? 200;

/** De plek van een poort, ten opzichte van de hoek van het vlak. */
export function poortPlek(node: GraafNode, poorten: Poorten, kant: "in" | "uit", naam: string): { x: number; y: number } | null {
  const i = kant === "in" ? poorten.ingangen.findIndex((p) => p.naam === naam) : poorten.uitgangen.indexOf(naam);
  if (i < 0) return null;
  return {
    x: kant === "in" ? node.x : node.x + nodeBreedte(node),
    y: node.y + KOP_HOOGTE + RIJ_HOOGTE * (i + 0.5),
  };
}

/** Een S-curve tussen twee poorten. */
export function verbindingPad(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const d = Math.max(40, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + d} ${a.y}, ${b.x - d} ${b.y}, ${b.x} ${b.y}`;
}
