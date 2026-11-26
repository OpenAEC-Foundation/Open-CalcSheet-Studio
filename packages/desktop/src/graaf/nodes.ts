/**
 * De soorten nodes: hun poorten en wat ze uitrekenen.
 *
 * Alle rekenwerk met eenheden gaat via de rekenkern, zodat `6 m + 1500 mm` hier
 * hetzelfde uitkomt als in een rekenblad. De teksten staan in de vertalingen
 * (werkruimte.json, `graaf.soort.*` en `graaf.poort.*`).
 */
import { analyseerRekenblok, rekenRekenblok, rekenUitdrukking, rekenWaarde } from "@ifc-calc/core";
import type { GraafNode, NodeSoort } from "./model.ts";
import { alsLijstWaarde, afstand, isGeometrie, isGrootheid, isLijst, waardeTekst, type Geometrie, type Punt, type Waarde } from "./waarde.ts";

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
  /** Het veld is letterlijk tekst, geen uitdrukking in de rekentaal. */
  tekst?: boolean;
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
  groep: "invoer" | "lijst" | "reken" | "logica" | "tekst" | "geometrie";
  /** Breedte op het vlak, in px. */
  breedte: number;
  /** Een eigen icoon (een id uit de Blueprint, in public/icons/graaf.svg); anders dat van de groep. */
  icoon?: string;
  ingangen: PoortDef[];
  uitgangen: string[];
  reken: (w: Record<string, Waarde>, c: RekenContext) => Record<string, Waarde>;
}

/** Het icoon van elke groep: ids uit de OpenAEC Blueprint, in public/icons/graaf.svg. */
export const GROEP_ICOON: Record<NodeDef["groep"], string> = {
  invoer: "form.field-group",
  lijst: "view.list",
  reken: "budget.add-formula",
  logica: "field.checkbox",
  tekst: "draw.text",
  geometrie: "draw.polyline",
};

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

const alsLijst = (w: Waarde): Waarde[] => (isLijst(w) ? w : [w]);

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

/** `basis`: het nummer van het eerste element. Een nieuwe node telt vanaf 1, een ingelezen bestand soms vanaf 0. */
function element(lijst: Waarde[], index: Waarde, basis: number): Waarde {
  if (typeof index !== "number" || !Number.isInteger(index)) throw new GraafFout("indexGeenGeheel");
  const plek = index - basis;
  if (plek < 0 || plek >= lijst.length) throw new GraafFout("indexBuitenBereik", { index, aantal: lijst.length });
  return lijst[plek];
}

/** Van, aantal, stap: `van + i·stap`, elk element los uit de rekenkern. */
function reeksAantal(van: Waarde, aantal: Waarde, stap: Waarde): Waarde[] {
  if (typeof aantal !== "number" || !Number.isInteger(aantal) || aantal < 0) throw new GraafFout("geenAantal");
  if (aantal > MAX_ELEMENTEN) throw new GraafFout("teVeelElementen", { max: MAX_ELEMENTEN });
  const uit: Waarde[] = [];
  for (let i = 0; i < aantal; i++) uit.push(grootheidGeenFout(() => rekenUitdrukking("van + i * stap", { van, i, stap })));
  return uit;
}

const uitdrukking = (tekst: string, w: Record<string, Waarde>): Waarde => grootheidGeenFout(() => rekenUitdrukking(tekst, w));

const isWaar = (w: Waarde): boolean => {
  if (typeof w !== "boolean") throw new GraafFout("geenWaarOnwaar");
  return w;
};

/** Gelijk: tekst vergelijkt als tekst, de rest met zijn eenheid. */
function zijnGelijk(a: Waarde, b: Waarde): boolean {
  if (typeof a === "string" || typeof b === "string" || typeof a === "boolean" || typeof b === "boolean") return a === b;
  return uitdrukking("a == b", { a, b }) === true;
}

function grootsteVan(lijst: Waarde[], functie: "max" | "min"): Waarde {
  if (lijst.length === 0) throw new GraafFout("lijstLeeg");
  return lijst.slice(1).reduce((a, b) => uitdrukking(`${functie}(a, b)`, { a, b }), lijst[0]);
}

function gesorteerd(lijst: Waarde[]): Waarde[] {
  if (lijst.every((e) => typeof e === "string")) return [...lijst].sort((a, b) => String(a).localeCompare(String(b)));
  return [...lijst].sort((a, b) => (uitdrukking("a < b", { a, b }) === true ? -1 : uitdrukking("b < a", { a, b }) === true ? 1 : 0));
}

function platVan(w: Waarde): Waarde[] {
  return isLijst(w) ? w.flatMap(platVan) : [w];
}

function telling(w: Waarde, naam: string): number {
  if (typeof w !== "number" || !Number.isInteger(w) || w < 0) throw new GraafFout("geenAantal", { naam });
  return w;
}

/** Tekst uit een poort: een getal of lijst schrijft zich zoals het op de node staat. */
const alsTekst = (w: Waarde) => (typeof w === "string" ? w : waardeTekst(w));

const mmNaar = (n: number): Waarde => rekenWaarde(`${n} mm`);

/** Sinus en dergelijke: een getal zonder eenheid telt in graden, een hoek met eenheid in die eenheid. */
function hoekFunctie(functie: "sin" | "cos" | "tan", w: Waarde): Waarde {
  return typeof w === "number" ? uitdrukking(`${functie}(x * 1 deg)`, { x: w }) : uitdrukking(`${functie}(x)`, { x: w });
}

const A_B: PoortDef[] = [{ naam: "a", standaard: "0" }, { naam: "b", standaard: "0" }];
const LIJST: PoortDef = { naam: "lijst", lijst: true, geenVeld: true };
const TEKST: PoortDef = { naam: "tekst", tekst: true, standaard: "" };

const eenOpEen = (soort: NodeSoort, tekst: string): NodeDef => ({
  soort, groep: "reken", breedte: 170, ingangen: [{ naam: "waarde", standaard: "0" }], uitgangen: ["uit"],
  reken: (w) => ({ uit: uitdrukking(tekst, { x: w.waarde }) }),
});
const tweeOpEen = (soort: NodeSoort, tekst: string, groep: NodeDef["groep"] = "reken"): NodeDef => ({
  soort, groep, breedte: 170, ingangen: A_B, uitgangen: ["uit"],
  reken: (w) => ({ uit: uitdrukking(tekst, { a: w.a, b: w.b }) }),
});
const lijstOpEen = (soort: NodeSoort, fn: (l: Waarde[]) => Waarde): NodeDef => ({
  soort, groep: "lijst", breedte: 170, ingangen: [LIJST], uitgangen: ["uit"],
  reken: (w) => ({ uit: fn(alsLijst(w.lijst)) }),
});
const tekstOpEen = (soort: NodeSoort, fn: (s: string) => Waarde): NodeDef => ({
  soort, groep: "tekst", breedte: 190, ingangen: [TEKST], uitgangen: ["uit"],
  reken: (w) => ({ uit: fn(alsTekst(w.tekst)) }),
});
const tekstMetZoek = (soort: NodeSoort, fn: (s: string, zoek: string) => Waarde): NodeDef => ({
  soort, groep: "tekst", breedte: 220, ingangen: [TEKST, { naam: "zoek", tekst: true, standaard: "" }], uitgangen: ["uit"],
  reken: (w) => ({ uit: fn(alsTekst(w.tekst), alsTekst(w.zoek)) }),
});

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

function lijnOfBalk(w: Waarde): { van: Punt; naar: Punt } {
  if (isGeometrie(w) && (w.geometrie === "lijn" || w.geometrie === "balk")) return { van: w.van, naar: w.naar };
  throw new GraafFout("geenLijn");
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
  waarOnwaar: {
    soort: "waarOnwaar",
    groep: "invoer",
    breedte: 170,
    ingangen: [],
    uitgangen: ["waarde"],
    reken: (_w, c) => ({ waarde: c.node.invoer?.waarde !== "false" }),
  },
  reeks: {
    soort: "reeks",
    groep: "lijst",
    breedte: 200,
    ingangen: [{ naam: "van", standaard: "0" }, { naam: "tot", standaard: "10" }, { naam: "stap", standaard: "1" }],
    uitgangen: ["lijst"],
    reken: (w) => ({ lijst: reeks(w.van, w.tot, w.stap) }),
  },
  reeksAantal: {
    soort: "reeksAantal",
    groep: "lijst",
    breedte: 200,
    ingangen: [{ naam: "van", standaard: "0" }, { naam: "aantal", standaard: "10" }, { naam: "stap", standaard: "1" }],
    uitgangen: ["lijst"],
    reken: (w) => ({ lijst: reeksAantal(w.van, w.aantal, w.stap) }),
  },
  lijstMaken: {
    soort: "lijstMaken",
    groep: "lijst",
    breedte: 170,
    ingangen: [],
    uitgangen: ["lijst"],
    // Een lege ingang telt niet mee: je hoeft niet alles te verbinden.
    reken: (w, c) => ({ lijst: poortenVan(c.node).ingangen.map((p) => w[p.naam]).filter((e) => e !== undefined) }),
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
  gemiddelde: lijstOpEen("gemiddelde", (l) => {
    if (l.length === 0) throw new GraafFout("lijstLeeg");
    return uitdrukking("s / n", { s: som(l), n: l.length });
  }),
  element: {
    soort: "element",
    groep: "lijst",
    breedte: 190,
    ingangen: [{ naam: "lijst", lijst: true, geenVeld: true }, { naam: "index", standaard: "1" }],
    uitgangen: ["element"],
    reken: (w, c) => ({ element: element(alsLijst(w.lijst), w.index, c.node.invoer?.basis === "0" ? 0 : 1) }),
  },
  eerste: lijstOpEen("eerste", (l) => {
    if (l.length === 0) throw new GraafFout("lijstLeeg");
    return l[0];
  }),
  laatste: lijstOpEen("laatste", (l) => {
    if (l.length === 0) throw new GraafFout("lijstLeeg");
    return l[l.length - 1];
  }),
  grootste: lijstOpEen("grootste", (l) => grootsteVan(l, "max")),
  kleinste: lijstOpEen("kleinste", (l) => grootsteVan(l, "min")),
  omkeren: lijstOpEen("omkeren", (l) => [...l].reverse()),
  sorteren: lijstOpEen("sorteren", gesorteerd),
  plat: lijstOpEen("plat", platVan),
  opschonen: lijstOpEen("opschonen", (l) => l.filter((e) => e !== null && e !== undefined && !(isLijst(e) && e.length === 0))),
  isLeeg: lijstOpEen("isLeeg", (l) => l.length === 0),
  aantalWaar: lijstOpEen("aantalWaar", (l) => l.filter((e) => e === true).length),
  allesWaar: lijstOpEen("allesWaar", (l) => l.every((e) => e === true)),
  ietsWaar: lijstOpEen("ietsWaar", (l) => l.some((e) => e === true)),
  nemen: {
    soort: "nemen",
    groep: "lijst",
    breedte: 190,
    ingangen: [LIJST, { naam: "aantal", standaard: "1" }],
    uitgangen: ["uit"],
    reken: (w) => ({ uit: alsLijst(w.lijst).slice(0, telling(w.aantal, "aantal")) }),
  },
  overslaan: {
    soort: "overslaan",
    groep: "lijst",
    breedte: 190,
    ingangen: [LIJST, { naam: "aantal", standaard: "1" }],
    uitgangen: ["uit"],
    reken: (w) => ({ uit: alsLijst(w.lijst).slice(telling(w.aantal, "aantal")) }),
  },
  lijstenSamen: {
    soort: "lijstenSamen",
    groep: "lijst",
    breedte: 170,
    ingangen: [{ naam: "a", lijst: true, geenVeld: true }, { naam: "b", lijst: true, geenVeld: true }],
    uitgangen: ["uit"],
    reken: (w) => ({ uit: [...alsLijst(w.a), ...alsLijst(w.b)] }),
  },
  lijstBevat: {
    soort: "lijstBevat",
    groep: "lijst",
    breedte: 190,
    ingangen: [LIJST, { naam: "waarde", lijst: true, geenVeld: true }],
    uitgangen: ["uit"],
    reken: (w) => ({ uit: alsLijst(w.lijst).some((e) => zijnGelijk(e, w.waarde)) }),
  },
  filter: {
    soort: "filter",
    groep: "lijst",
    breedte: 190,
    ingangen: [LIJST, { naam: "masker", lijst: true, geenVeld: true }],
    uitgangen: ["in", "buiten"],
    reken: (w) => {
      const lijst = alsLijst(w.lijst);
      const masker = alsLijst(w.masker);
      if (masker.length !== lijst.length) throw new GraafFout("maskerLengte", { lijst: lijst.length, masker: masker.length });
      return {
        in: lijst.filter((_e, i) => isWaar(masker[i])),
        buiten: lijst.filter((_e, i) => !isWaar(masker[i])),
      };
    },
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
    icoon: "category.code",
    ingangen: [],
    uitgangen: [],
    reken: rekenCodeblok,
  },
  optellen: tweeOpEen("optellen", "a + b"),
  aftrekken: tweeOpEen("aftrekken", "a - b"),
  vermenigvuldigen: tweeOpEen("vermenigvuldigen", "a * b"),
  delen: tweeOpEen("delen", "a / b"),
  rest: tweeOpEen("rest", "mod(a, b)"),
  macht: tweeOpEen("macht", "a ^ b"),
  minimum: tweeOpEen("minimum", "min(a, b)"),
  maximum: tweeOpEen("maximum", "max(a, b)"),
  absoluut: eenOpEen("absoluut", "abs(x)"),
  wortel: eenOpEen("wortel", "sqrt(x)"),
  afronden: eenOpEen("afronden", "round(x)"),
  omlaag: eenOpEen("omlaag", "floor(x)"),
  omhoog: eenOpEen("omhoog", "ceil(x)"),
  sinus: { ...eenOpEen("sinus", ""), reken: (w) => ({ uit: hoekFunctie("sin", w.waarde) }) },
  cosinus: { ...eenOpEen("cosinus", ""), reken: (w) => ({ uit: hoekFunctie("cos", w.waarde) }) },
  tangens: { ...eenOpEen("tangens", ""), reken: (w) => ({ uit: hoekFunctie("tan", w.waarde) }) },
  pi: { soort: "pi", groep: "reken", breedte: 150, ingangen: [], uitgangen: ["uit"], reken: () => ({ uit: Math.PI }) },
  gelijk: { ...tweeOpEen("gelijk", "", "logica"), reken: (w) => ({ uit: zijnGelijk(w.a, w.b) }) },
  ongelijk: { ...tweeOpEen("ongelijk", "", "logica"), reken: (w) => ({ uit: !zijnGelijk(w.a, w.b) }) },
  kleiner: tweeOpEen("kleiner", "a < b", "logica"),
  groter: tweeOpEen("groter", "a > b", "logica"),
  kleinerGelijk: tweeOpEen("kleinerGelijk", "a <= b", "logica"),
  groterGelijk: tweeOpEen("groterGelijk", "a >= b", "logica"),
  en: { ...tweeOpEen("en", "", "logica"), ingangen: [{ naam: "a", standaard: "true" }, { naam: "b", standaard: "true" }], reken: (w) => ({ uit: isWaar(w.a) && isWaar(w.b) }) },
  of: { ...tweeOpEen("of", "", "logica"), ingangen: [{ naam: "a", standaard: "false" }, { naam: "b", standaard: "false" }], reken: (w) => ({ uit: isWaar(w.a) || isWaar(w.b) }) },
  niet: {
    soort: "niet",
    groep: "logica",
    breedte: 150,
    ingangen: [{ naam: "waarde", standaard: "true" }],
    uitgangen: ["uit"],
    reken: (w) => ({ uit: !isWaar(w.waarde) }),
  },
  als: {
    soort: "als",
    groep: "logica",
    breedte: 200,
    ingangen: [{ naam: "voorwaarde", standaard: "true" }, { naam: "dan", standaard: "1" }, { naam: "anders", standaard: "0" }],
    uitgangen: ["uit"],
    reken: (w) => ({ uit: isWaar(w.voorwaarde) ? w.dan : w.anders }),
  },
  tekstenSamen: {
    soort: "tekstenSamen",
    groep: "tekst",
    breedte: 220,
    ingangen: [{ naam: "a", tekst: true, standaard: "" }, { naam: "b", tekst: true, standaard: "" }],
    uitgangen: ["uit"],
    reken: (w) => ({ uit: alsTekst(w.a) + alsTekst(w.b) }),
  },
  tekstenMetScheider: {
    soort: "tekstenMetScheider",
    groep: "tekst",
    breedte: 220,
    ingangen: [{ naam: "scheider", tekst: true, standaard: ", " }, { naam: "a", tekst: true, standaard: "" }, { naam: "b", tekst: true, standaard: "" }],
    uitgangen: ["uit"],
    reken: (w) => ({ uit: alsTekst(w.a) + alsTekst(w.scheider) + alsTekst(w.b) }),
  },
  tekstLengte: tekstOpEen("tekstLengte", (s) => [...s].length),
  hoofdletters: tekstOpEen("hoofdletters", (s) => s.toUpperCase()),
  kleineLetters: tekstOpEen("kleineLetters", (s) => s.toLowerCase()),
  tekstBevat: tekstMetZoek("tekstBevat", (s, zoek) => s.includes(zoek)),
  begintMet: tekstMetZoek("begintMet", (s, zoek) => s.startsWith(zoek)),
  vervangen: {
    soort: "vervangen",
    groep: "tekst",
    breedte: 220,
    ingangen: [TEKST, { naam: "zoek", tekst: true, standaard: "" }, { naam: "door", tekst: true, standaard: "" }],
    uitgangen: ["uit"],
    reken: (w) => {
      const zoek = alsTekst(w.zoek);
      return { uit: zoek ? alsTekst(w.tekst).split(zoek).join(alsTekst(w.door)) : alsTekst(w.tekst) };
    },
  },
  splitsen: {
    soort: "splitsen",
    groep: "tekst",
    breedte: 220,
    ingangen: [TEKST, { naam: "scheider", tekst: true, standaard: ", " }],
    uitgangen: ["uit"],
    reken: (w) => {
      const scheider = alsTekst(w.scheider);
      return { uit: scheider ? alsTekst(w.tekst).split(scheider) : [alsTekst(w.tekst)] };
    },
  },
  naarTekst: {
    soort: "naarTekst",
    groep: "tekst",
    breedte: 170,
    ingangen: [{ naam: "waarde", lijst: true, geenVeld: true }],
    uitgangen: ["uit"],
    reken: (w) => ({ uit: alsTekst(w.waarde) }),
  },
  naarGetal: tekstOpEen("naarGetal", (s) => grootheidGeenFout(() => rekenWaarde(s))),
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
    icoon: "draw.line",
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
  puntDelen: {
    soort: "puntDelen",
    groep: "geometrie",
    breedte: 170,
    ingangen: [{ naam: "punt", geenVeld: true }],
    uitgangen: ["x", "y", "z"],
    reken: (w) => {
      const [x, y, z] = punt(w.punt, "punt");
      return { x: mmNaar(x), y: mmNaar(y), z: mmNaar(z) };
    },
  },
  lijnPunten: {
    soort: "lijnPunten",
    groep: "geometrie",
    breedte: 170,
    ingangen: [{ naam: "lijn", geenVeld: true }],
    uitgangen: ["van", "naar"],
    reken: (w) => {
      const { van, naar } = lijnOfBalk(w.lijn);
      return { van: { geometrie: "punt", p: van } satisfies Geometrie, naar: { geometrie: "punt", p: naar } satisfies Geometrie };
    },
  },
  lengteVan: {
    soort: "lengteVan",
    groep: "geometrie",
    breedte: 170,
    ingangen: [{ naam: "lijn", geenVeld: true }],
    uitgangen: ["uit"],
    reken: (w) => {
      const { van, naar } = lijnOfBalk(w.lijn);
      return { uit: mmNaar(afstand(van, naar)) };
    },
  },
  afstandTussen: {
    soort: "afstandTussen",
    groep: "geometrie",
    breedte: 170,
    ingangen: [{ naam: "van", geenVeld: true }, { naam: "naar", geenVeld: true }],
    uitgangen: ["uit"],
    reken: (w) => ({ uit: mmNaar(afstand(punt(w.van, "van"), punt(w.naar, "naar"))) }),
  },
  ingelezen: {
    soort: "ingelezen",
    groep: "invoer",
    breedte: 220,
    ingangen: [],
    uitgangen: [],
    reken: (_w, c) => {
      throw new GraafFout("nietOvergenomen", { bron: c.node.invoer?.bron ?? "" });
    },
  },
};

/** Op deze volgorde in het zoekmenu. Een ingelezen node kies je niet: die komt uit een bestand. */
export const NODE_SOORTEN = (Object.keys(DEFS) as NodeSoort[]).filter((s) => s !== "ingelezen");

export function nodeDef(soort: string): NodeDef | undefined {
  return Object.prototype.hasOwnProperty.call(DEFS, soort) ? DEFS[soort as NodeSoort] : undefined;
}

/** Het icoon van een soort: zijn eigen, anders dat van zijn groep; een onbekende soort krijgt een waarschuwing. */
export function nodeIcoon(soort: string): string {
  const def = nodeDef(soort);
  return def ? (def.icoon ?? GROEP_ICOON[def.groep]) : "status.warning";
}

export interface Poorten {
  ingangen: PoortDef[];
  uitgangen: string[];
}

const GEEN_POORTEN: Poorten = { ingangen: [], uitgangen: [] };

/** Meer ingangen op een lijst past niet op een node; een grotere lijst is een reeks of een codeblok. */
export const MAX_LIJST_INGANGEN = 64;

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
  if (node.soort === "lijstMaken") {
    const aantal = Math.min(MAX_LIJST_INGANGEN, Math.max(1, Math.floor(Number(node.invoer?.aantal)) || 1));
    return {
      ingangen: Array.from({ length: aantal }, (_x, i) => ({ naam: `item${i + 1}`, lijst: true, geenVeld: true, optioneel: true })),
      uitgangen: def.uitgangen,
    };
  }
  if (node.soort === "ingelezen") {
    const namen = (s: string | undefined) => (s ? s.split("\n").filter(Boolean) : []);
    return {
      ingangen: namen(node.invoer?.ingangen).map((naam) => ({ naam, geenVeld: true, optioneel: true })),
      uitgangen: namen(node.invoer?.uitgangen),
    };
  }
  if (node.soort !== "codeblok") return def;
  const a = analyseerRekenblok(node.invoer?.code ?? "");
  return {
    ingangen: a.ingangen.map((naam) => ({ naam, lijst: node.geheel?.includes(naam) ?? false })),
    uitgangen: a.uitgangen,
  };
}

// ── De maten op het vlak ──────────────────────────────────────────────────────

/** Hoogte van de kop van een node, in px op het vlak: icoon, naam en daaronder de soort. */
export const KOP_HOOGTE = 34;
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

/**
 * Het midden van een verbinding (t = 0,5 op de S-curve hieronder): daar staat het
 * label met de waarde. De twee hulppunten liggen op de hoogte van hun eigen poort
 * en even ver naar binnen, dus het midden is precies het gemiddelde van de poorten.
 */
export function verbindingMidden(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Een S-curve tussen twee poorten. */
export function verbindingPad(a: { x: number; y: number }, b: { x: number; y: number }): string {
  const d = Math.max(40, Math.abs(b.x - a.x) * 0.5);
  return `M ${a.x} ${a.y} C ${a.x + d} ${a.y}, ${b.x - d} ${b.y}, ${b.x} ${b.y}`;
}
