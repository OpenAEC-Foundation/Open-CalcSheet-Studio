import {
  afgeleideProjectId,
  bouwProjectIfcx,
  leesProjectId,
  isIfcxBestand,
  isProjectIfcx,
  leesProjectIfcx,
  leesVastgelegdeToetsingen,
  metVreemdeGegevens,
  vreemdeGegevens,
  type IfcCalcSheet,
  type IfcxBestand,
  type IfcxVreemd,
} from "@ifc-calc/core";
import { bladenVoorIfc } from "./projectIfcx.ts";
import { gebruikteToetsingen } from "../rekenen/toetsCache.ts";
import { legeGegevens, type ProjectGegevens } from "./projectGegevens.ts";
import type { Exemplaar, Verborgen } from "./projectStore";
import { normaliseerRapport, type Rapport } from "../rapport/model.ts";
import { belastingenVoorIfc } from "../rapport/belastingBronnen.ts";
import { datumTekst } from "../rapport/revisies.ts";
import { standaardTeksten } from "../rapport/standaardteksten.ts";
import { leesRekenversie } from "../components/calc/bladVersie.ts";
import { isPdfBlad, leesPdfBijlage } from "./pdfBijlage.ts";
import { isSpreadsheetBlad, leesSpreadsheetBestand } from "./spreadsheetBlad.ts";
import { isMarkdownBlad, leesMarkdownBestand } from "./markdownBlad.ts";
import { isGraafBlad } from "./graafBlad.ts";
import { leesGraaf } from "../graaf/model.ts";
import { isTekenBlad, leesTekenVel, tekenVelVoorBestand } from "./tekenBlad.ts";
import { isJupyterBlad, leesJupyterWerkmap } from "./jupyterBlad.ts";
import { isMarimoBlad, leesMarimoNotebook } from "./marimoBlad.ts";
import { leesVarianten } from "./varianten.ts";
import { controleVoorBestand, leesControle } from "./controle.ts";
import { leesIncludeKopieen } from "./includes.ts";

/**
 * Het projectbestand: één `.ifccalculation` met de héle berekening erin.
 *
 * Formaat (versie 2)
 * ------------------
 * Het bestand is zuiver IFCX: alleen `header`, `imports`, `schemas` en `data`
 * op het hoogste niveau, en alles staat als attribuut op een knoop. Dezelfde
 * inhoud met de extensie `.ifcx` is hetzelfde bestand. De opbouw staat in
 * packages/core/src/ifcx/document.ts en docs/projectmodel.md, de namespace in
 * packages/core/src/ifcx/namespace.ts.
 *
 * Wat telt bij het openen: projectnaam, gegevens, verborgen onderdelen, rapport
 * en per blad naam, id, templateId, bronVersie, rekentekst, invoer, elementen,
 * de antwoorden van FEM Studio (`toetsingen`, rekenen/toetsCache.ts) en het
 * bestand van een PDF-, spreadsheet- of Markdown-blad. De uitkomsten, figuren en elementen in het bestand zijn afgeleid, voor
 * andere lezers: de app rekent ze opnieuw uit de tekst en de invoer.
 *
 * Eerdere vormen blijven openen; bij opnieuw opslaan worden ze versie 2:
 *
 *   1. versie 1 — een los IFCX-achtig document met daarnaast de eigen velden
 *      `source` en `project`. Soms alleen `project`.
 *   2. een los blad — JSON met `source.content`.
 *   3. kale rekentekst — een `.cpd`.
 *
 * Een bestand zonder `project` (vorm 2 en 3) wordt geopend als een project met
 * één exemplaar, zodat er nooit werk verloren gaat.
 *
 * `toetsingen` gaat mee zoals het blad het nog gebruikt: een antwoord voor een
 * invoer die niet meer op het blad staat, valt bij het opslaan weg. Het eerste opslaan over een
 * oud bestand heen laat een kopie achter: zie `bewaarOudeVersie` in
 * tauri/fileOps.ts.
 *
 * `rapport` is optioneel: een bestand van vóór het constructierapport krijgt bij
 * openen een nieuw rapport met de standaardwaarden. Het rapport heeft een eigen
 * `versie` (RAPPORT_VERSIE in rapport/model.ts): een rapport van een oudere
 * opbouw houdt bij het openen zijn opmaak.
 *
 * `bronVersie` is de rekenversie van de module bij invoegen of het laatste
 * bijwerken (components/calc/bladVersie.ts). Ook die is optioneel: een blad
 * zonder vergelijkt zijn tekst met de module.
 *
 * Een PDF-blad (store/pdfBijlage.ts) is een exemplaar met `templateId` "pdf", een
 * lege `source` en daarnaast `pdf`: `{ bestandsnaam, data }`, met in `data` het
 * hele PDF-bestand als base64. Zo zit de PDF in het projectbestand en blijft het
 * project overdraagbaar.
 *
 * Gegevens van een ander programma in het bestand (een eigen knoop, of een eigen
 * attribuut op een knoop van deze app) gaan bij het openen mee als `vreemd` en
 * komen bij het opslaan ongewijzigd terug: zie packages/core/src/ifcx/vreemd.ts.
 *
 * Het project heeft een blijvende identiteit, een UUID: het pad van de wortel van
 * het IFCX. Alle andere paden en GlobalId's hangen daaraan, niet aan projectnaam of
 * -nummer. Een nieuw project krijgt een willekeurige id (store/projectStore.ts); een
 * bestand van vóór de id heeft als wortel de UUID uit nummer en naam staan, en die
 * wordt bij het openen zijn id. Het beleid staat in docs/ifc-export.md.
 */

export const PROJECT_FORMAAT_VERSIE = 2;

/** Alleen de bekende onderdelen, en alleen als ze echt verborgen zijn. */
function leesVerborgen(v: unknown): Verborgen | undefined {
  if (!v || typeof v !== "object") return undefined;
  const o = v as Record<string, unknown>;
  const uit: Verborgen = {};
  if (o.gegevens === true) uit.gegevens = true;
  if (o.rapport === true) uit.rapport = true;
  return Object.keys(uit).length ? uit : undefined;
}

export interface ProjectPayload {
  versie: number;
  /**
   * De blijvende identiteit van het project (een UUID): de wortel van het IFCX, waar
   * alle paden en GlobalId's van afhangen. Zonder volgt hij uit nummer en naam.
   */
  id?: string;
  naam: string;
  gegevens: ProjectGegevens;
  exemplaren: Exemplaar[];
  /** Ontbreekt in bestanden van vóór het constructierapport. */
  rapport?: Rapport;
  /** Uit de projectboom gehaalde onderdelen; ontbreekt als niets verborgen is. */
  verborgen?: Verborgen;
  /** Gegevens van een ander programma uit het geopende bestand; ze gaan ongewijzigd terug. */
  vreemd?: IfcxVreemd;
}

export interface GelezenProject {
  /**
   * De identiteit uit het bestand. Een bestand zonder (een ouder formaat, een los blad)
   * krijgt de id die uit zijn nummer en naam volgt: dezelfde wortel als voorheen.
   */
  projectId: string;
  projectNaam: string;
  gegevens: ProjectGegevens;
  exemplaren: Exemplaar[];
  /** Afwezig bij een oud bestand of een los blad; laadProject maakt dan een nieuw rapport. */
  rapport?: Rapport;
  verborgen?: Verborgen;
  /** Alleen bij een IFCX-bestand waarin een ander programma iets heeft gezet. */
  vreemd?: IfcxVreemd;
}

/**
 * Bouwt de tekst die naar schijf gaat. `bladen` zijn de doorgerekende bladen
 * (store/projectIfcx.ts `bladenVoorIfc`), voor de uitkomsten in het bestand;
 * zonder staan de bladen er zonder uitkomst in. De inhoud van een blad komt altijd
 * uit `payload`.
 */
export function bouwProjectBestand(payload: ProjectPayload, bladen: IfcCalcSheet[] | null): string {
  return JSON.stringify(metVreemdeGegevens(eigenDocument(payload, bladen), payload.vreemd), null, 2);
}

/** Alleen wat de app zelf schrijft, zonder de gegevens van een ander. */
function eigenDocument(payload: ProjectPayload, bladen: IfcCalcSheet[] | null): IfcxBestand {
  const uitkomsten = new Map((bladen ?? []).map((b) => [b.id, b]));
  return bouwProjectIfcx({
    id: payload.id,
    naam: payload.naam,
    formaatversie: PROJECT_FORMAAT_VERSIE,
    gegevens: payload.gegevens,
    rapport: payload.rapport,
    belastingen: belastingenVoorIfc(payload.rapport),
    verborgen: payload.verborgen,
    bladen: payload.exemplaren.map((ex): IfcCalcSheet => ({
      nodes: [],
      ...uitkomsten.get(ex.id),
      id: ex.id,
      naam: ex.naam,
      templateId: ex.templateId,
      source: ex.source,
      waarden: ex.waarden,
      bronVersie: ex.bronVersie,
      ref: ex.ref,
      elementen: ex.elementen,
      pdf: ex.pdf,
      xlsx: ex.xlsx,
      md: ex.md,
      graaf: ex.graaf,
      ...(ex.tekenvel ? { tekenvel: tekenVelVoorBestand(ex.tekenvel) as unknown as Record<string, unknown> } : {}),
      // Doorgerekend: zoals het blad ze nog gebruikt, met die van zijn varianten (projectIfcx.ts).
      toetsingen: uitkomsten.has(ex.id) ? uitkomsten.get(ex.id)!.toetsingen : gebruikteToetsingen(ex.toetsingen, undefined),
      ...(ex.varianten ? { varianten: ex.varianten } : {}),
      ...(ex.controle ? { controle: controleVoorBestand(ex.controle) } : {}),
      ...(ex.includes?.length ? { includes: ex.includes } : {}),
    })),
  });
}

/**
 * Wat een ander programma in het bestand zette. De app bouwt het document opnieuw op
 * uit wat ze heeft gelezen, doorgerekend zoals bij het opslaan; wat het bestand meer
 * heeft, is van een ander (core: ifcx/vreemd.ts).
 */
function vreemdUit(bron: IfcxBestand, p: GelezenProject): IfcxVreemd | undefined {
  const payload: ProjectPayload = {
    versie: PROJECT_FORMAAT_VERSIE,
    // Met de id uit het bestand: anders vallen de paden anders uit en lijkt alles vreemd.
    id: p.projectId,
    naam: p.projectNaam,
    gegevens: p.gegevens,
    exemplaren: p.exemplaren,
    rapport: p.rapport,
    verborgen: p.verborgen,
  };
  return vreemdeGegevens(bron, eigenDocument(payload, bladenVoorIfc(payload)));
}

let losTeller = 0;
function losseId(): string {
  losTeller += 1;
  return `ex-los-${Date.now().toString(36)}-${losTeller.toString(36)}`;
}

/**
 * Een IFCX-bestand zonder project van deze app. Zonder taal: de app zet de melding in de
 * taal van de gebruiker (werkruimte:bestandDialoog.geenProject), de API geeft deze tekst.
 */
export class GeenProjectFout extends Error {
  constructor() {
    super("This IFCX file does not contain a project of this app.");
  }
}

/**
 * Leest een bestand terug. Accepteert vier vormen:
 *   1. versie 2 — IFCX met een `ocss::project`
 *   2. versie 1 — JSON met `project`
 *   3. oud      — JSON met `source.content` (één rekenblad)
 *   4. kaal     — losse rekentekst (`.cpd`)
 *
 * IFCX van een ander programma is geen rekentekst: dat geeft een fout.
 */
export function leesProjectBestand(raw: string, bestandsnaam: string): GelezenProject {
  const trimmed = raw.trimStart();

  let parsed: { project?: Partial<ProjectPayload>; source?: { content?: unknown } } | null = null;
  if (trimmed.startsWith("{")) {
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      // Geen geldige JSON — behandel de inhoud als kale rekentekst.
    }
  }
  if (parsed && isIfcxBestand(parsed) && !isProjectIfcx(parsed)) {
    throw new GeenProjectFout();
  }

  if (parsed) {
    const p: { id?: unknown; naam?: unknown; gegevens?: unknown; exemplaren?: unknown; rapport?: unknown; verborgen?: unknown } | undefined =
      isProjectIfcx(parsed) ? leesProjectIfcx(parsed) : parsed.project;
    if (p && Array.isArray(p.exemplaren)) {
      const projectNaam = (typeof p.naam === "string" && p.naam) || bestandsnaam;
      const gegevens: ProjectGegevens = { ...legeGegevens(), ...((p.gegevens as ProjectGegevens | undefined) ?? {}) };
      const gelezen: GelezenProject = {
        // Uit het IFCX: het pad van de wortel. Versie 1 heeft geen id: afgeleid, zoals zijn export.
        projectId: leesProjectId(p.id) ?? afgeleideProjectId(projectNaam, gegevens.project_nummer),
        projectNaam,
        gegevens,
        exemplaren: normaliseerExemplaren(p.exemplaren, bestandsnaam),
        // Per veld gecontroleerd: het bestand kan van een andere versie van
        // de app komen of met de hand zijn aangepast. Onbekende velden
        // vallen weg, ontbrekende krijgen hun standaardwaarde.
        rapport: p.rapport
          ? normaliseerRapport(p.rapport, datumTekst(new Date()), standaardTeksten)
          : undefined,
        verborgen: leesVerborgen(p.verborgen),
      };
      if (isProjectIfcx(parsed)) {
        const vreemd = vreemdUit(parsed, gelezen);
        if (vreemd) gelezen.vreemd = vreemd;
      }
      return gelezen;
    }

    if (typeof parsed.source?.content === "string") {
      return losBlad(parsed.source.content, bestandsnaam);
    }
  }

  return losBlad(raw, bestandsnaam);
}

/**
 * Eén blad uit een bestand of uit de opgeslagen staat van de app, aangevuld
 * tot een volledig exemplaar. Beide kunnen van een andere versie van de app
 * komen of met de hand zijn aangepast: ontbrekende velden krijgen hun
 * standaardwaarde, velden van het verkeerde type ook, en een ongeldige
 * bronversie valt weg. Geen object: null.
 *
 * `naam` is de naam voor een blad zonder naam: de bestandsnaam bij het
 * openen, de projectnaam bij het herstellen van de opgeslagen staat.
 */
export function normaliseerExemplaar(x: unknown, naam: string): Exemplaar | null {
  if (!x || typeof x !== "object" || Array.isArray(x)) return null;
  const e = x as Partial<Record<keyof Exemplaar, unknown>>;
  const tekst = (w: unknown) => (typeof w === "string" ? w : "");
  const ex: Exemplaar = {
    id: tekst(e.id) || losseId(),
    naam: tekst(e.naam) || naam,
    templateId: tekst(e.templateId),
    source: tekst(e.source),
    waarden: leesWaarden(e.waarden),
    // Ontbreekt in bestanden van vóór de elementkoppeling; leeg = losstaand.
    elementen: Array.isArray(e.elementen) ? (e.elementen as Exemplaar["elementen"]) : [],
  };
  // Alleen als hij er is: een blad zonder bronversie schrijft ook geen leeg veld weg.
  const bronVersie = leesRekenversie(e.bronVersie);
  if (bronVersie) ex.bronVersie = bronVersie;
  // Het kenmerk voor verwijzingen (#1.R_paal); ontbreekt het, dan geeft de store een nummer.
  if (typeof e.ref === 'string' && /^[A-Za-z0-9_]+$/.test(e.ref)) ex.ref = e.ref;
  // Idem het PDF-bestand: alleen een PDF-blad met een bruikbaar bestand krijgt het veld.
  const pdf = isPdfBlad(ex) ? leesPdfBijlage(e.pdf) : undefined;
  if (pdf) ex.pdf = pdf;
  const xlsx = isSpreadsheetBlad(ex) ? leesSpreadsheetBestand(e.xlsx) : undefined;
  if (xlsx) ex.xlsx = xlsx;
  const md = isMarkdownBlad(ex) ? leesMarkdownBestand(e.md) : undefined;
  if (md) ex.md = md;
  const graaf = isGraafBlad(ex) ? leesGraaf(e.graaf) : undefined;
  if (graaf) ex.graaf = graaf;
  const tekenvel = isTekenBlad(ex) ? leesTekenVel(e.tekenvel) : undefined;
  if (tekenvel) ex.tekenvel = tekenvel;
  const jupyter = isJupyterBlad(ex) ? leesJupyterWerkmap(e.jupyter) : undefined;
  if (jupyter) ex.jupyter = jupyter;
  const marimo = isMarimoBlad(ex) ? leesMarimoNotebook(e.marimo) : undefined;
  if (marimo) ex.marimo = marimo;
  const toetsingen = leesVastgelegdeToetsingen(e.toetsingen);
  if (toetsingen) ex.toetsingen = toetsingen;
  // Varianten van het blad (store/varianten.ts); alleen een rekenblad rekent ze door.
  const varianten = leesVarianten(e.varianten);
  if (varianten) ex.varianten = varianten;
  // De toetsregistratie (store/controle.ts): wat niet klopt, valt weg.
  const controle = leesControle(e.controle);
  if (controle) ex.controle = controle;
  // De `#include`-bestanden met hun kopie (store/includes.ts).
  const includes = leesIncludeKopieen(e.includes);
  if (includes) ex.includes = includes;
  return ex;
}

/** Alle bladen uit een lijst van buiten de app; wat geen blad is, valt weg. */
export function normaliseerExemplaren(lijst: unknown, naam: string): Exemplaar[] {
  if (!Array.isArray(lijst)) return [];
  return lijst.map((x) => normaliseerExemplaar(x, naam)).filter((e): e is Exemplaar => e !== null);
}

/**
 * De invoer van een blad: per naam een tekst. Een getal of ja/nee uit een met
 * de hand aangepast bestand wordt tekst; iets anders valt weg. De invoervelden
 * rekenen met tekst en zouden op een ander type vastlopen.
 */
function leesWaarden(x: unknown): Record<string, string> {
  if (!x || typeof x !== "object" || Array.isArray(x)) return {};
  const uit: Record<string, string> = {};
  for (const [k, v] of Object.entries(x)) {
    if (typeof v === "string") uit[k] = v;
    else if (typeof v === "number" || typeof v === "boolean") uit[k] = String(v);
  }
  return uit;
}

function losBlad(source: string, bestandsnaam: string): GelezenProject {
  const gegevens = legeGegevens();
  return {
    // Reproduceerbaar: hetzelfde bestand opent steeds met dezelfde identiteit.
    projectId: afgeleideProjectId(bestandsnaam, gegevens.project_nummer),
    projectNaam: bestandsnaam,
    gegevens,
    exemplaren: [
      { id: losseId(), naam: bestandsnaam, templateId: "", source, waarden: {}, elementen: [] },
    ],
  };
}
