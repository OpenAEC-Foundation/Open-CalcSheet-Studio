/**
 * Doorrekenen in de rekendienst zonder venster (packages/headless/, docs/rekendienst.md),
 * met dezelfde regels als de app.
 *
 * Wat de projectstore in de app bij elke wijziging aan de rekenkern doorgeeft
 * (store/projectStore.ts), zet `activeer` hier vóór elke doorrekening: de projecttekst
 * (de belastingen uit hoofdstuk 5 en de eigen elementen van de projectgegevens), de eigen
 * eenheden van het project en de vastgelegde antwoorden van FEM Studio in de bladen. Die
 * staan in de kern en in toetsCache.ts als één stand per proces; een dienst met meer
 * projecten zet ze daarom steeds opnieuw, synchroon vlak voor het rekenen.
 *
 * De getallen komen langs de weg van de API van de app (mcp/tools/hulp.ts `rekenBlad`):
 * de projectgegevens als scope, de verwijzingen naar andere bladen en spreadsheetcellen,
 * uitkomsten in de eenheden van het blad. De uitwerking (HTML) langs de weg van de
 * afdruk (components/calc/bladDoorrekenen.ts): in de taal van de uitvoer en in het
 * eenhedenstelsel van het project.
 *
 * `@toets`-, `@fem`- en `@kern`-blokken: `vraagFem` doet wat de app vóór het afdrukken
 * doet (rekenen/femToetsing.ts `werkToetsingenBij`): de bladen doorrekenen alsof ze in de
 * werkruimte staan, elk verzoek zonder antwoord naar FEM Studio sturen, en het antwoord
 * bij het blad vastleggen. Hoe FEM Studio bereikt wordt, geeft de dienst mee
 * (`FemVerbinding`). Zonder FEM Studio staat een blok zonder vastgelegd antwoord als
 * niet getoetst, net als in de app zonder server.
 *
 * Laadt zonder React of stores (imports met `.ts`).
 */
import {
  alsAntwoord,
  femBewaar,
  femVerzoekArgumenten,
  kernAanroepen,
  kernVerzoekBewaard,
  render,
  schemaHash,
  zetProjectEenheden,
  zetProjectTekst,
  type ToetsHerkomst,
  type ToetsVerzoek,
  type VastgelegdeToets,
} from "@ifc-calc/core";
import { projectScope } from "../../store/projectGegevens.ts";
import { projectTekstVan } from "../../store/projectBlad.ts";
import { evalOptiesVan, ruweEigenEenheden } from "../../store/projectEenheden.ts";
import { isLosBlad } from "../../store/spreadsheetBlad.ts";
import { variantInvoer } from "../../store/varianten.ts";
import { rekentaalIncludes, rekentaalImageUrls } from "../../templates/rekentaal-includes.ts";
import { bronVoorUitvoer } from "../../templates/vertalingen.ts";
import { rekenUitwerking } from "../../components/calc/canvasRekenen.ts";
import { scopeMetVerwijzingen, verwezenBladen } from "../../rekenen/verwijzingen.ts";
import {
  HEEFT_FEM_BLOK,
  heeftToetsAntwoord,
  metToetsingen,
  nieuwVastTeLeggen,
  toetsHashes,
  toetsingenNu,
  verzamelVerzoeken,
  wisSessie,
  zetFem,
  zetToetsAntwoord,
  zetVastgelegd,
} from "../../rekenen/toetsCache.ts";
import { jsonGetal, regels, rekenDoor, ucWaarden } from "../rekenen.ts";
import { bladSoort, rekenBlad, resultaatJson } from "../tools/hulp.ts";
import type { GeheugenProject, GeheugenStand } from "./geheugen.ts";

/**
 * Zet de stand van dit project in de rekenkern, zoals de projectstore dat in de app doet.
 * Synchroon aanroepen vlak voor het rekenen: een ander project kan intussen aan de beurt
 * zijn geweest.
 */
export function activeer(s: Pick<GeheugenStand, "gegevens" | "rapport" | "exemplaren">): void {
  zetProjectEenheden(ruweEigenEenheden(s.gegevens));
  zetProjectTekst(projectTekstVan(s.gegevens, s.rapport.belastingen, s.rapport.taal, s.exemplaren) ?? null);
  zetVastgelegd(s.exemplaren.map((e) => e.toetsingen));
}

// ── FEM Studio ───────────────────────────────────────────────────────────────

/** Hoe de dienst FEM Studio bereikt (packages/headless/fem.mjs). */
export interface FemVerbinding {
  /** Of de server er is, met zijn versie en de sha256 van het programma. */
  status(): Promise<{ beschikbaar: boolean; versie?: string | null; sha256?: string | null; reden?: string | null }>;
  /** `tools/list` van de server. */
  tools(): Promise<unknown>;
  /** Eén toets of opzoeking; gooit bij een fout met de melding. */
  aanroep(tool: string, argumenten: Record<string, unknown>): Promise<unknown>;
}

/** Wat `vraagFem` deed. */
export interface FemVerslag {
  /** Of FEM Studio er was. */
  beschikbaar: boolean;
  versie?: string;
  /** Zoveel verzoeken gingen naar FEM Studio; zoveel kwamen terug met een fout. */
  gevraagd: number;
  fouten: number;
  /** Na `maxMs` gestopt: wat dan nog geen antwoord had, staat als niet getoetst. */
  afgebroken: boolean;
}

const MAX_RONDES = 10;

/**
 * Vraagt FEM Studio om de antwoorden die de bladen van dit project nog missen en legt ze
 * bij de bladen vast; dezelfde rondes als `werkToetsingenBij` in de app. Een blok dat de
 * uitkomst van een ander gebruikt, komt een ronde later. Begint met een lege sessie: het
 * project krijgt precies de antwoorden die het zelf vraagt, en een fout van een vorige
 * keer wordt opnieuw geprobeerd. Niet twee tegelijk aanroepen (de sessie is er één per
 * proces): de dienst zet ze in een rij.
 */
export async function vraagFem(project: GeheugenProject, verbinding: FemVerbinding | null, maxMs = 120_000): Promise<FemVerslag> {
  wisSessie();
  const verslag: FemVerslag = { beschikbaar: false, gevraagd: 0, fouten: 0, afgebroken: false };
  const heeftBlok = project.stand().exemplaren.some((e) => !isLosBlad(e) && HEEFT_FEM_BLOK.test(e.source));
  if (!verbinding || !heeftBlok) return verslag;
  const status = await verbinding.status().catch(() => ({ beschikbaar: false }) as const);
  if (!status.beschikbaar) return verslag;
  verslag.beschikbaar = true;
  if ("versie" in status && status.versie) verslag.versie = status.versie;
  let schemas: Record<string, string> = {};
  try {
    const lijst = (await verbinding.tools()) as { tools?: { name?: unknown; inputSchema?: unknown }[] } | null;
    schemas = Object.fromEntries(
      (lijst?.tools ?? [])
        .filter((t): t is { name: string; inputSchema?: unknown } => typeof t?.name === "string")
        .map((t) => [t.name, schemaHash(t.inputSchema)]),
    );
  } catch {
    // Zonder schema's: dan alleen de versie vergelijken.
  }
  zetFem({ versie: verslag.versie, schemas });
  const herkomst = (tool: string): ToetsHerkomst => ({
    ...(verslag.versie ? { versie: verslag.versie } : {}),
    ...("sha256" in status && status.sha256 ? { sha256: status.sha256 } : {}),
    ...(schemas[tool] ? { schema: schemas[tool] } : {}),
  });

  const tot = Date.now() + maxMs;
  for (let ronde = 0; ronde < MAX_RONDES; ronde++) {
    const verzoeken = verzoekenVan(project);
    const nieuw = new Map<string, ToetsVerzoek>();
    for (const v of verzoeken) if (!heeftToetsAntwoord(v.hash) && !nieuw.has(v.hash)) nieuw.set(v.hash, v);
    if (nieuw.size === 0) break;
    const rest = tot - Date.now();
    if (rest <= 0) {
      verslag.afgebroken = true;
      break;
    }
    let klok: ReturnType<typeof setTimeout> | undefined;
    const opTijd = await Promise.race([
      Promise.all([...nieuw.values()].map((v) => vraagEen(v, verbinding, herkomst, verslag))).then(() => true),
      new Promise<boolean>((klaar) => {
        klok = setTimeout(() => klaar(false), rest);
      }),
    ]);
    clearTimeout(klok);
    if (!opTijd) {
      verslag.afgebroken = true;
      break;
    }
  }
  // De laatste ronde legt de antwoorden van de vorige bij de bladen vast.
  verzoekenVan(project);
  return verslag;
}

/** Rekent elk blad met een FEM-blok door zoals de werkruimte, legt vast wat er al is, en geeft de verzoeken. */
function verzoekenVan(project: GeheugenProject): ToetsVerzoek[] {
  const uit: ToetsVerzoek[] = [];
  const stand = project.stand();
  activeer(stand);
  const scope = projectScope(stand.gegevens);
  for (const ex of stand.exemplaren) {
    if (isLosBlad(ex) || !HEEFT_FEM_BLOK.test(ex.source)) continue;
    const vs = ex.varianten;
    const invoeren = [ex.waarden, ...(vs?.opPapier ? vs.lijst.map((v) => variantInvoer(ex.waarden, v, vs.velden)) : [])];
    for (const waarden of invoeren) {
      try {
        const metRefs = scopeMetVerwijzingen(
          ex.source, waarden, scope, verwezenBladen(ex.source, waarden, stand.exemplaren),
          { includes: rekentaalIncludes, imageUrls: rekentaalImageUrls }, metToetsingen({}, "lezen"),
        );
        const { nodes } = rekenDoor(ex.source, waarden, metRefs, ex.naam, "vragen");
        const bij = nieuwVastTeLeggen(project.stand().exemplaren.find((e) => e.id === ex.id)?.toetsingen, toetsHashes(nodes));
        if (bij) project.zetToetsingen(ex.id, bij);
        uit.push(...verzamelVerzoeken(nodes));
      } catch {
        // Een blad dat niet doorrekent, heeft geen verzoeken; de uitkomst toont de fout.
      }
    }
  }
  return uit;
}

async function vraagEen(v: ToetsVerzoek, verbinding: FemVerbinding, herkomst: (tool: string) => ToetsHerkomst, verslag: FemVerslag): Promise<void> {
  verslag.gevraagd++;
  try {
    const ruw = v.bewaar ? await verbinding.aanroep(v.tool, femVerzoekArgumenten(v)) : await kernAanroepen(v, (tool, args) => verbinding.aanroep(tool, args));
    const vast: VastgelegdeToets = {
      tool: v.tool,
      verzoek: (v.bewaar as unknown as Record<string, unknown> | undefined) ?? kernVerzoekBewaard(v),
      uitkomst: v.bewaar ? femBewaar(v.bewaar, ruw) : ruw,
      datum: new Date().toISOString(),
      herkomst: herkomst(v.tool),
    };
    zetToetsAntwoord(v.hash, alsAntwoord(vast), vast);
  } catch (e) {
    verslag.fouten++;
    zetToetsAntwoord(v.hash, { ok: false, melding: e instanceof Error ? e.message : String(e) });
  }
}

// ── Uitkomsten ───────────────────────────────────────────────────────────────

/** De FEM-blokken van een doorgerekend blad: zoveel, en zoveel zonder antwoord ("niet getoetst"). */
function femTelling(nodes: Parameters<typeof toetsHashes>[0]): { blocks: number; answered: number; notComputed: number } | undefined {
  const hashes = toetsHashes(nodes);
  if (!hashes.length) return undefined;
  const antwoorden = toetsingenNu();
  const beantwoord = hashes.filter((h) => antwoorden[h]?.ok).length;
  return { blocks: hashes.length, answered: beantwoord, notComputed: hashes.length - beantwoord };
}

export interface BladUitkomstOpties {
  /** Alleen deze bladen (id, kenmerk of naam); zonder alle bladen. */
  bladen?: readonly string[];
  /** De getallen van de bladen meegeven; standaard ja. */
  getallen?: boolean;
  /** Alleen deze getallen. */
  namen?: readonly string[];
}

/** Elk blad van het project doorgerekend, als JSON: dezelfde velden als sheet_evaluate, plus de FEM-blokken. */
export function bladUitkomsten(project: GeheugenProject, opties: BladUitkomstOpties = {}): Record<string, unknown>[] {
  const stand = project.stand();
  activeer(stand);
  const gekozen = opties.bladen?.length
    ? stand.exemplaren.filter((e) => opties.bladen!.some((k) => k === e.id || k === e.ref || k === e.naam))
    : stand.exemplaren;
  return gekozen.map((b) => {
    const kop = { id: b.id, ref: b.ref ?? null, name: b.naam, templateId: b.templateId, kind: bladSoort(b) };
    if (isLosBlad(b)) return { ...kop, evaluated: false };
    const uitkomst = rekenBlad(b, stand.gegevens, stand.exemplaren);
    if (!uitkomst.ok) return { ...kop, evaluated: false, error: uitkomst.fout };
    const { resultaat, getallen, nodes } = uitkomst.d;
    const data: Record<string, unknown> = { ...kop, evaluated: true, ...resultaatJson(resultaat), ucValues: ucWaarden(getallen) };
    if (opties.namen?.length) {
      data.numbers = Object.fromEntries(opties.namen.map((n) => [n, n in getallen ? jsonGetal(getallen[n]) : null]));
    } else if (opties.getallen !== false) {
      data.numbers = Object.fromEntries(Object.entries(getallen).map(([n, w]) => [n, jsonGetal(w)]));
    }
    const fem = femTelling(nodes);
    if (fem) data.fem = fem;
    return data;
  });
}

export interface TekstOpties {
  waarden: Record<string, string>;
  /** De projectgegevens als scope, of geen. */
  gegevens: Record<string, string> | null;
  /** De taal van de uitvoer (HTML). */
  taal: string;
  html: boolean;
  maxRegels: number;
  namen?: readonly string[];
}

/** Een losse rekentekst: de getallen zoals calc_evaluate, plus de uitwerking als HTML zoals op papier. */
export function rekenTekst(source: string, o: TekstOpties): Record<string, unknown> {
  const scope = o.gegevens ? projectScope(o.gegevens) : {};
  const d = rekenDoor(source, o.waarden, scope, "");
  const { regels: lijst, afgekapt } = regels(d.nodes, o.maxRegels);
  const getallen = o.namen?.length
    ? Object.fromEntries(o.namen.map((n) => [n, n in d.getallen ? jsonGetal(d.getallen[n]) : null]))
    : Object.fromEntries(Object.entries(d.getallen).map(([n, w]) => [n, jsonGetal(w)]));
  const uit: Record<string, unknown> = {
    ...resultaatJson(d.resultaat),
    numbers: getallen,
    ucValues: ucWaarden(d.getallen),
    lines: lijst,
    truncated: afgekapt,
    errorLines: lijst.filter((r) => typeof r.error === "string").length,
  };
  const fem = femTelling(d.nodes);
  if (fem) uit.fem = fem;
  if (o.html) uit.html = uitwerkingHtml(source, o.waarden, scope, o.gegevens ?? {}, o.taal);
  return uit;
}

/** De uitwerking als HTML, zoals op papier (bladDoorrekenen.ts): in de taal van de uitvoer en het stelsel van het project. */
function uitwerkingHtml(source: string, waarden: Record<string, string>, scope: Record<string, unknown>, gegevens: Record<string, string>, taal: string): string {
  const evalOpties = metToetsingen(evalOptiesVan(gegevens), "lezen", taal);
  const opties = { includes: rekentaalIncludes, imageUrls: rekentaalImageUrls, eenheden: (evalOpties.eigenEenheden ?? []).map((e) => e.naam) };
  const uitvoer = bronVoorUitvoer(source, taal);
  try {
    return rekenUitwerking(uitvoer.bron, waarden, scope, opties, uitvoer.namen, evalOpties).html;
  } catch (e) {
    return render([{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }]);
  }
}
