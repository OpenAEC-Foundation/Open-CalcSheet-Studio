/**
 * Een grafbestand inlezen (`.dyn`, JSON): de nodes, hun verbindingen en hun plek.
 *
 * Wat een node hier ook kan, wordt een gewone node (nodes.ts). Wat niet, blijft staan als
 * node van de soort `ingelezen`, met zijn naam en poorten: de opbouw van de graaf blijft zo
 * zichtbaar, en de melding zegt welke node nog vervangen moet worden. Er draait niets uit het
 * bestand: geen scripts, en geen code buiten de rekentaal van een codeblok.
 *
 * Geen React en geen store: controlescripts laden dit bestand in Node.
 */
import { GRAAF_VERSIE, leesGraaf, type Graaf, type GraafNode, type GraafVerbinding, type NodeSoort } from "./model.ts";
import { nodeDef } from "./nodes.ts";

/** Waarom een bestand niet te lezen is; de tekst komt uit de vertalingen (`graaf.import.<code>`). */
export type GrafBestandCode = "geenJson" | "oudeIndeling" | "geenGraaf" | "teGroot";

export class GrafBestandFout extends Error {
  code: GrafBestandCode;
  constructor(code: GrafBestandCode) {
    super(code);
    this.code = code;
  }
}

export interface GrafBestandVerslag {
  graaf: Graaf;
  /** De naam in het bestand, of leeg. */
  naam: string;
  /** Zoveel nodes rekenen hier mee. */
  overgenomen: number;
  /** De namen van de nodes die niet meerekenen, elk één keer. */
  nietOvergenomen: string[];
  /** Verbindingen op een ingang die hier niet bestaat (een optie als `ignoreCase`). */
  verbindingenWeg: number;
}

/** Meer dan dit is geen graaf die iemand met de hand onderhoudt, en houdt de app op. */
const MAX_NODES = 5000;
const MAX_TEKENS = 64 * 1024 * 1024;

/** De plek in het bestand maal dit: de nodes hier zijn hoger, met hun velden en voorbeeld. */
const SCHAAL_X = 1.3;
const SCHAAL_Y = 1.6;
const RAND = 40;

interface RuwePoort {
  Id?: unknown;
  Name?: unknown;
}

interface RuweNode {
  Id?: unknown;
  NodeType?: unknown;
  ConcreteType?: unknown;
  FunctionSignature?: unknown;
  Code?: unknown;
  InputValue?: unknown;
  MinimumValue?: unknown;
  MaximumValue?: unknown;
  StepValue?: unknown;
  NumberType?: unknown;
  Inputs?: RuwePoort[];
  Outputs?: RuwePoort[];
}

interface Koppeling {
  soort: NodeSoort;
  /** De ingangen op volgorde van het bestand; zonder: die van de soort. */
  in?: string[];
  /** De uitgangen op volgorde van het bestand; zonder: die van de soort. */
  uit?: string[];
  invoer?: Record<string, string>;
  /** Zoveel ingangen kan de soort aan; meer in het bestand rekent verkeerd, en blijft dus staan. */
  hoogstens?: number;
}

const GEOMETRIE = "Autodesk.DesignScript.Geometry";

/** Op het deel van de functienaam vóór de `@`. */
const FUNCTIES: Record<string, Koppeling> = {
  "+": { soort: "optellen" },
  "-": { soort: "aftrekken" },
  "*": { soort: "vermenigvuldigen" },
  "/": { soort: "delen" },
  "%": { soort: "rest" },
  "==": { soort: "gelijk" },
  "!=": { soort: "ongelijk" },
  "<": { soort: "kleiner" },
  ">": { soort: "groter" },
  "<=": { soort: "kleinerGelijk" },
  ">=": { soort: "groterGelijk" },
  "&&": { soort: "en" },
  "||": { soort: "of" },
  Not: { soort: "niet" },
  "DSCore.Math.Sin": { soort: "sinus" },
  "DSCore.Math.Cos": { soort: "cosinus" },
  "DSCore.Math.Tan": { soort: "tangens" },
  "DSCore.Math.Abs": { soort: "absoluut" },
  "DSCore.Math.Sqrt": { soort: "wortel" },
  "DSCore.Math.Round": { soort: "afronden", hoogstens: 1 },
  "DSCore.Math.Floor": { soort: "omlaag" },
  "DSCore.Math.Ceiling": { soort: "omhoog" },
  "DSCore.Math.Pow": { soort: "macht" },
  "DSCore.Math.Min": { soort: "minimum" },
  "DSCore.Math.Max": { soort: "maximum" },
  "DSCore.Math.PI": { soort: "pi" },
  "DSCore.Math.Sum": { soort: "som" },
  "DSCore.Math.Average": { soort: "gemiddelde" },
  "DSCore.List.Count": { soort: "aantal" },
  // De index telt in het bestand vanaf 0; hier is 1 het eerste element.
  "DSCore.List.GetItemAtIndex": { soort: "element", invoer: { basis: "0" } },
  "DSCore.List.FirstItem": { soort: "eerste" },
  "DSCore.List.LastItem": { soort: "laatste" },
  "DSCore.List.Reverse": { soort: "omkeren" },
  "DSCore.List.Sort": { soort: "sorteren" },
  "DSCore.List.Flatten": { soort: "plat" },
  "DSCore.List.Clean": { soort: "opschonen" },
  "DSCore.List.MaximumItem": { soort: "grootste" },
  "DSCore.List.MinimumItem": { soort: "kleinste" },
  "DSCore.List.TakeItems": { soort: "nemen" },
  "DSCore.List.DropItems": { soort: "overslaan" },
  "DSCore.List.Join": { soort: "lijstenSamen", hoogstens: 2 },
  "DSCore.List.Contains": { soort: "lijstBevat" },
  "DSCore.List.IsEmpty": { soort: "isLeeg" },
  "DSCore.List.FilterByBoolMask": { soort: "filter" },
  "DSCore.List.CountTrue": { soort: "aantalWaar" },
  "DSCore.List.AllTrue": { soort: "allesWaar" },
  "DSCore.List.AnyTrue": { soort: "ietsWaar" },
  "DSCore.String.Concat": { soort: "tekstenSamen", hoogstens: 2 },
  "DSCore.String.Join": { soort: "tekstenMetScheider", hoogstens: 3 },
  "DSCore.String.Replace": { soort: "vervangen" },
  "DSCore.String.Split": { soort: "splitsen" },
  "DSCore.String.Contains": { soort: "tekstBevat" },
  "DSCore.String.StartsWith": { soort: "begintMet" },
  "DSCore.String.ToUpper": { soort: "hoofdletters" },
  "DSCore.String.ToLower": { soort: "kleineLetters" },
  "DSCore.String.Length": { soort: "tekstLengte" },
  "DSCore.String.ToNumber": { soort: "naarGetal" },
  [`${GEOMETRIE}.Point.ByCoordinates`]: { soort: "punt" },
  [`${GEOMETRIE}.Point.Origin`]: { soort: "punt", in: [] },
  [`${GEOMETRIE}.Line.ByStartPointEndPoint`]: { soort: "lijn" },
  [`${GEOMETRIE}.Point.X`]: { soort: "puntDelen", uit: ["x"] },
  [`${GEOMETRIE}.Point.Y`]: { soort: "puntDelen", uit: ["y"] },
  [`${GEOMETRIE}.Point.Z`]: { soort: "puntDelen", uit: ["z"] },
  [`${GEOMETRIE}.Curve.Length`]: { soort: "lengteVan" },
  [`${GEOMETRIE}.Curve.StartPoint`]: { soort: "lijnPunten", uit: ["van"] },
  [`${GEOMETRIE}.Curve.EndPoint`]: { soort: "lijnPunten", uit: ["naar"] },
  [`${GEOMETRIE}.Geometry.DistanceTo`]: { soort: "afstandTussen" },
  [`${GEOMETRIE}.Point.DistanceTo`]: { soort: "afstandTussen" },
};

/** Op de klasse in `ConcreteType`. */
const TYPEN: Record<string, Koppeling> = {
  "CoreNodeModels.Watch": { soort: "bekijken", in: ["waarde"], uit: ["waarde"] },
  "CoreNodeModels.Logic.RefactoredIf": { soort: "als" },
  "CoreNodeModels.Logic.If": { soort: "als" },
  "CoreNodeModels.Logic.And": { soort: "en", hoogstens: 2 },
  "CoreNodeModels.Logic.Or": { soort: "of", hoogstens: 2 },
  "CoreNodeModels.Range": { soort: "reeks" },
  "CoreNodeModels.Sequence": { soort: "reeksAantal" },
  "CoreNodeModels.FromObject": { soort: "naarTekst" },
  "CoreNodeModels.Equals": { soort: "gelijk", hoogstens: 2 },
};

const tekstVan = (x: unknown) => (typeof x === "string" ? x : "");
const getalVan = (x: unknown): number | null => {
  const n = typeof x === "number" ? x : typeof x === "string" && x.trim() ? Number(x) : NaN;
  return Number.isFinite(n) ? n : null;
};
const poorten = (x: unknown): RuwePoort[] => (Array.isArray(x) ? x.filter((p) => p && typeof p === "object") : []);

/** Loopt door de tekst, en geeft alles buiten aanhalingstekens aan `fn`. */
function buitenTekst(s: string, fn: (deel: string) => string): string {
  return s.split(/("(?:[^"\\]|\\.)*")/g).map((deel, i) => (i % 2 === 1 ? deel : fn(deel))).join("");
}

/** Eén uitdrukking in de rekentaal: lijsten, reeksen en logische tekens. */
function vertaalUitdrukking(expr: string): string {
  const zonderLijsthaken = buitenTekst(expr, (d) => d.replace(/\{/g, "[").replace(/\}/g, "]"));
  const reeks = /^\s*([^"#~]+?)\.\.([^"#~]+?)(?:\.\.([^"#~]+?))?\s*$/.exec(zonderLijsthaken);
  if (reeks) {
    const [, van, tot, stap] = reeks;
    return stap ? `(${van.trim()}):(${stap.trim()}):(${tot.trim()})` : `(${van.trim()}):(${tot.trim()})`;
  }
  return buitenTekst(zonderLijsthaken, (d) => d.replace(/&&/g, " and ").replace(/\|\|/g, " or ").replace(/!(?!=)/g, " not "));
}

/** De statements van een codeblok: tot aan elke `;`, buiten tekst en haken, zonder commentaar. */
function statementsVan(code: string): string[] {
  const zonderCommentaar = buitenTekst(code, (d) => d.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, ""));
  const uit: string[] = [];
  let huidig = "";
  let diepte = 0;
  for (const deel of zonderCommentaar.split(/("(?:[^"\\]|\\.)*")/g)) {
    if (deel.startsWith('"')) {
      huidig += deel;
      continue;
    }
    for (const c of deel) {
      if (c === ";" && diepte === 0) {
        uit.push(huidig.trim());
        huidig = "";
        continue;
      }
      if ("([{".includes(c)) diepte++;
      if (")]}".includes(c)) diepte--;
      huidig += c;
    }
  }
  if (huidig.trim()) uit.push(huidig.trim());
  return uit.filter(Boolean);
}

/** Een codeblok als regels `naam = uitdrukking`. Een statement zonder naam krijgt er een. */
export function vertaalCodeblok(code: string): { regels: string[]; uitgangen: string[] } {
  const regels: string[] = [];
  const uitgangen: string[] = [];
  statementsVan(code).forEach((s, i) => {
    const m = /^([A-Za-z_]\w*)\s*=(?!=)\s*([\s\S]+)$/.exec(s);
    const naam = m ? m[1] : `uit${i + 1}`;
    regels.push(`${naam} = ${vertaalUitdrukking(m ? m[2] : s)}`);
    uitgangen.push(naam);
  });
  return { regels, uitgangen };
}

const LOSSE_TEKST = /^"((?:[^"\\]|\\.)*)"$/;

/** Een escape in een losse tekst: `\n`, `\"`. */
const zonderEscape = (s: string) => s.replace(/\\(.)/g, (_m, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : c));

interface Omzetting {
  node: Omit<GraafNode, "id" | "x" | "y">;
  ingangen: string[];
  uitgangen: string[];
  rekent: boolean;
}

/** Wat rekent er hier niet: de poorten blijven, met een naam die uniek is. */
function ingelezen(ruw: RuweNode, naam: string, bron: string): Omzetting {
  const uniek = (lijst: RuwePoort[], voorvoegsel: string) => {
    const gezien = new Set<string>();
    return lijst.map((p, i) => {
      const n = tekstVan(p.Name).trim();
      const eigen = n && !gezien.has(n) ? n : `${voorvoegsel}${i + 1}`;
      gezien.add(eigen);
      return eigen;
    });
  };
  const ingangen = uniek(poorten(ruw.Inputs), "in");
  const uitgangen = uniek(poorten(ruw.Outputs), "uit");
  const code = tekstVan(ruw.Code);
  return {
    node: {
      soort: "ingelezen",
      naam,
      invoer: { bron, ingangen: ingangen.join("\n"), uitgangen: uitgangen.join("\n"), ...(code ? { code } : {}) },
    },
    ingangen,
    uitgangen,
    rekent: false,
  };
}

function omzetting(ruw: RuweNode, naam: string): Omzetting {
  const nodeType = tekstVan(ruw.NodeType);
  const klasse = tekstVan(ruw.ConcreteType).split(",")[0].trim();
  const ruweIn = poorten(ruw.Inputs);

  if (nodeType === "NumberInputNode") {
    const waarde = getalVan(ruw.InputValue) ?? 0;
    const min = getalVan(ruw.MinimumValue) ?? Math.min(0, waarde);
    const max = getalVan(ruw.MaximumValue) ?? (waarde > 0 ? waarde * 2 : 10);
    const stap = getalVan(ruw.StepValue) ?? (tekstVan(ruw.NumberType) === "Integer" ? 1 : 0.1);
    return {
      node: { soort: "getal", naam, invoer: { waarde: String(waarde), min: String(min), max: String(max), stap: String(stap), eenheid: "" } },
      ingangen: [],
      uitgangen: ["waarde"],
      rekent: true,
    };
  }
  if (nodeType === "StringInputNode") {
    return { node: { soort: "tekst", naam, invoer: { tekst: tekstVan(ruw.InputValue) } }, ingangen: [], uitgangen: ["tekst"], rekent: true };
  }
  if (nodeType === "BooleanInputNode") {
    return { node: { soort: "waarOnwaar", naam, invoer: { waarde: ruw.InputValue === true ? "true" : "false" } }, ingangen: [], uitgangen: ["waarde"], rekent: true };
  }
  if (nodeType === "CodeBlockNode") {
    const code = tekstVan(ruw.Code);
    const statements = statementsVan(code);
    const los = statements.length === 1 && ruweIn.length === 0 ? LOSSE_TEKST.exec(statements[0]) : null;
    if (los) return { node: { soort: "tekst", naam, invoer: { tekst: zonderEscape(los[1]) } }, ingangen: [], uitgangen: ["tekst"], rekent: true };
    const { regels, uitgangen } = vertaalCodeblok(code);
    return {
      node: { soort: "codeblok", naam, invoer: { code: regels.join("\n") } },
      ingangen: ruweIn.map((p) => tekstVan(p.Name)),
      uitgangen,
      rekent: true,
    };
  }
  if (klasse === "CoreNodeModels.CreateList") {
    const ingangen = ruweIn.map((_p, i) => `item${i + 1}`);
    return { node: { soort: "lijstMaken", naam, invoer: { aantal: String(Math.max(1, ruweIn.length)) } }, ingangen, uitgangen: ["lijst"], rekent: true };
  }

  const koppeling = nodeType === "FunctionNode" ? FUNCTIES[tekstVan(ruw.FunctionSignature).split("@")[0]] : TYPEN[klasse];
  if (!koppeling || (koppeling.hoogstens !== undefined && ruweIn.length > koppeling.hoogstens)) {
    return ingelezen(ruw, naam, tekstVan(ruw.FunctionSignature).split("@")[0] || klasse || nodeType);
  }
  const def = nodeDef(koppeling.soort)!;
  return {
    node: { soort: koppeling.soort, naam, ...(koppeling.invoer ? { invoer: koppeling.invoer } : {}) },
    ingangen: koppeling.in ?? def.ingangen.map((p) => p.naam),
    uitgangen: koppeling.uit ?? def.uitgangen,
    rekent: true,
  };
}

/** Geeft de graaf uit de tekst van een bestand. Een fout: GrafBestandFout. */
export function leesGrafBestand(tekst: string): GrafBestandVerslag {
  if (tekst.length > MAX_TEKENS) throw new GrafBestandFout("teGroot");
  const schoon = tekst.replace(/^﻿/, "").trimStart();
  // De indeling van vóór JSON.
  if (schoon.startsWith("<")) throw new GrafBestandFout("oudeIndeling");
  let d: unknown;
  try {
    d = JSON.parse(schoon);
  } catch {
    throw new GrafBestandFout("geenJson");
  }
  const bestand = d as { Name?: unknown; Nodes?: unknown; Connectors?: unknown; View?: { NodeViews?: unknown } } | null;
  if (!bestand || typeof bestand !== "object" || !Array.isArray(bestand.Nodes)) throw new GrafBestandFout("geenGraaf");
  if (bestand.Nodes.length > MAX_NODES) throw new GrafBestandFout("teGroot");

  const beelden = new Map<string, { naam: string; x: number; y: number }>();
  for (const b of Array.isArray(bestand.View?.NodeViews) ? (bestand.View!.NodeViews as Record<string, unknown>[]) : []) {
    if (b && typeof b.Id === "string") beelden.set(b.Id, { naam: tekstVan(b.Name), x: getalVan(b.X) ?? 0, y: getalVan(b.Y) ?? 0 });
  }
  const xen = [...beelden.values()].map((b) => b.x);
  const yen = [...beelden.values()].map((b) => b.y);
  const x0 = xen.length > 0 ? Math.min(...xen) : 0;
  const y0 = yen.length > 0 ? Math.min(...yen) : 0;

  const nodes: GraafNode[] = [];
  /** Een poort in het bestand: naar welke node en poort hier. */
  const uitPoorten = new Map<string, { node: string; poort: string }>();
  const inPoorten = new Map<string, { node: string; poort: string }>();
  let overgenomen = 0;
  const niet = new Set<string>();

  (bestand.Nodes as RuweNode[]).forEach((ruw, i) => {
    if (!ruw || typeof ruw !== "object") return;
    const id = `n${nodes.length + 1}`;
    const beeld = typeof ruw.Id === "string" ? beelden.get(ruw.Id) : undefined;
    const eigenNaam = beeld?.naam ?? "";
    const o = omzetting(ruw, eigenNaam);
    // Een kale bekijk-node of codeblok heeft op papier en op het vlak genoeg aan de naam van zijn soort.
    const naam = /^(watch|watch 3d|code block)$/i.test(eigenNaam) ? undefined : eigenNaam || undefined;
    const { naam: _n, ...rest } = o.node;
    nodes.push({
      id,
      ...rest,
      ...(naam ? { naam } : {}),
      x: beeld ? Math.round((beeld.x - x0) * SCHAAL_X) + RAND : RAND + (i % 6) * 320,
      y: beeld ? Math.round((beeld.y - y0) * SCHAAL_Y) + RAND : RAND + Math.floor(i / 6) * 260,
    });
    if (o.rekent) overgenomen++;
    else niet.add(eigenNaam || tekstVan(o.node.invoer?.bron));
    poorten(ruw.Inputs).forEach((p, j) => {
      if (typeof p.Id === "string" && o.ingangen[j]) inPoorten.set(p.Id, { node: id, poort: o.ingangen[j] });
    });
    poorten(ruw.Outputs).forEach((p, j) => {
      if (typeof p.Id === "string" && o.uitgangen[j]) uitPoorten.set(p.Id, { node: id, poort: o.uitgangen[j] });
    });
  });

  const verbindingen: GraafVerbinding[] = [];
  let verbindingenWeg = 0;
  for (const c of Array.isArray(bestand.Connectors) ? (bestand.Connectors as Record<string, unknown>[]) : []) {
    const van = uitPoorten.get(tekstVan(c?.Start));
    const naar = inPoorten.get(tekstVan(c?.End));
    if (van && naar) verbindingen.push({ vanNode: van.node, vanPoort: van.poort, naarNode: naar.node, naarPoort: naar.poort });
    else verbindingenWeg++;
  }

  // Door dezelfde lezer als een projectbestand: wat niet klopt, valt ook hier weg.
  const graaf = leesGraaf({ versie: GRAAF_VERSIE, nodes, verbindingen });
  if (!graaf) throw new GrafBestandFout("geenGraaf");
  return { graaf, naam: tekstVan(bestand.Name).trim(), overgenomen, nietOvergenomen: [...niet].filter(Boolean), verbindingenWeg };
}
