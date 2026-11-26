/**
 * Een project in het geheugen, voor de rekendienst zonder venster (packages/headless/,
 * docs/rekendienst.md).
 *
 * Dezelfde vorm als de omgeving van de app (mcp/omgeving.ts), zodat de tools uit de
 * registry (mcp/tools.ts) er ongewijzigd op draaien. Wat de tools van de projectstore
 * merken, doet dit net zo: een nieuw blad heet "<basis> <n>" en wordt geselecteerd, een
 * kopie staat direct na het origineel en krijgt een eigen kenmerk (metBladRefs), elke
 * wijziging zet `dirty` en is ongedaan te maken, en een stuk rapport wordt na een
 * wijziging weer geldig gemaakt (normaliseerRapport, metSymbolen).
 *
 * Wat een dienst zonder venster niet heeft, meldt hij met NOT_AVAILABLE: bestanden op
 * paden (een verzoek mag geen pad van de server noemen), de online modulebibliotheek,
 * de weergave van de werkruimte en de printdialoog. Een project komt binnen als inhoud
 * (`laad`) en gaat eruit als inhoud (`inhoud`).
 *
 * Laadt zonder React of stores (imports met `.ts`).
 */
import type { IfcxVreemd } from "@ifc-calc/core";
import { legeGegevens } from "../../store/projectGegevens.ts";
import { normaliseerRapport, standaardRapport, type Rapport } from "../../rapport/model.ts";
import { metSymbolen } from "../../rapport/belastingBronnen.ts";
import { datumTekst } from "../../rapport/revisies.ts";
import { standaardTeksten } from "../../rapport/standaardteksten.ts";
import { leesPad, zetOpPad } from "../../rapport/pad.ts";
import { metBladRefs } from "../../store/bladRefs.ts";
import { rekenversie } from "../../components/calc/bladVersie.ts";
import { bouwProjectBestand, leesProjectBestand, PROJECT_FORMAAT_VERSIE } from "../../store/projectBestand.ts";
import { bladenVoorIfc } from "../../store/projectIfcx.ts";
import type { Exemplaar } from "../../store/projectStore";
import { McpFout, type McpInstellingen, type McpOmgeving, type McpPdf } from "../contracts.ts";

/** Dezelfde vaste ids als de projectstore (PROJECT_ID, RAPPORT_ID). */
export const PROJECT_ID = "__projectgegevens__";
export const RAPPORT_ID = "__rapport__";

const GEEN_VENSTER = "The calculation service has no window";

export interface GeheugenOpties {
  /** De moduleteksten per templateId (templates/index.ts in de app). */
  sjablonen: Readonly<Record<string, string>>;
  /** De naam van een module, of null; in de app moduleNaam (components/calc/moduleNaam.ts). */
  moduleNaam: (templateId: string) => string | null;
  /** De naam van een groep in de catalogus. */
  groepNaam: (id: string, label: string) => string;
  /** De taal van de dienst: de taal van een nieuw rapport en van de uitvoer. */
  taal: string;
}

/** De stand van een project in het geheugen. */
export interface GeheugenStand {
  projectNaam: string;
  gegevens: Record<string, string>;
  exemplaren: Exemplaar[];
  activeId: string;
  dirty: boolean;
  verborgen: { gegevens?: boolean; rapport?: boolean };
  vreemd?: IfcxVreemd;
  rapport: Rapport;
}

interface Momentopname {
  exemplaren: Exemplaar[];
  gegevens: Record<string, string>;
  rapport: Rapport;
  activeId: string;
}

/** Een project in het geheugen met de omgeving waarop de tools draaien. */
export interface GeheugenProject {
  omgeving: McpOmgeving;
  stand(): GeheugenStand;
  /** Laadt een projectbestand (`.ifccalculation`, IFCX of een losse rekentekst) als inhoud. */
  laad(inhoud: string, naam?: string): void;
  /** Het project als projectbestand, met de uitkomsten erin (zelfde inhoud als Opslaan in de app). */
  inhoud(): string;
  /** Legt antwoorden van FEM Studio bij een blad vast; geen stap in de geschiedenis (zetToetsingen). */
  zetToetsingen(id: string, bij: NonNullable<Exemplaar["toetsingen"]>): void;
  /** Een los project met dezelfde stand, zonder geschiedenis: om op te rekenen zonder dit project te raken. */
  kopie(): GeheugenProject;
  /** Vervangt de stand, zonder geschiedenis (voor `kopie`). */
  zetStand(stand: GeheugenStand): void;
}

const MAX_GESCHIEDENIS = 200;

let teller = 0;
function nieuweId(): string {
  teller += 1;
  return `ex-${Date.now().toString(36)}-${teller.toString(36)}`;
}

function vrijeNaam(exemplaren: readonly Exemplaar[], basis: string, altijd = true): string {
  const bezet = new Set(exemplaren.map((e) => e.naam));
  if (!altijd && !bezet.has(basis)) return basis;
  for (let n = 1; ; n++) if (!bezet.has(`${basis} ${n}`)) return `${basis} ${n}`;
}

export function maakGeheugenProject(opties: GeheugenOpties): GeheugenProject {
  const vandaag = () => datumTekst(new Date());
  const nieuwRapport = (): Rapport => standaardRapport(vandaag(), standaardTeksten(opties.taal), opties.taal);
  const leeg = (): GeheugenStand => ({
    projectNaam: "Project",
    gegevens: legeGegevens(),
    exemplaren: [],
    activeId: PROJECT_ID,
    dirty: false,
    verborgen: {},
    rapport: nieuwRapport(),
  });

  let s = leeg();
  let verleden: Momentopname[] = [];
  let toekomst: Momentopname[] = [];

  const momentopname = (): Momentopname => ({ exemplaren: s.exemplaren, gegevens: s.gegevens, rapport: s.rapport, activeId: s.activeId });
  /** Eén stap in de geschiedenis; de bladen krijgen daarna hun kenmerk (metBladRefs), zoals in de store. */
  const wijzig = (f: (s: GeheugenStand) => Partial<GeheugenStand>) => {
    verleden = [...verleden.slice(-(MAX_GESCHIEDENIS - 1)), momentopname()];
    toekomst = [];
    const deel = f(s);
    s = { ...s, ...deel, dirty: true };
    s.exemplaren = metBladRefs(s.exemplaren);
  };
  const opBlad = (id: string, f: (e: Exemplaar) => Exemplaar) => s.exemplaren.map((e) => (e.id === id ? f(e) : e));
  const voegAchteraan = (e: Exemplaar) => {
    wijzig((st) => ({ exemplaren: [...st.exemplaren, e], activeId: e.id }));
    return e.id;
  };

  const laad = (raw: string, naam = "Project") => {
    const p = leesProjectBestand(raw, naam);
    const rapport = p.rapport ? normaliseerRapport(p.rapport, vandaag(), standaardTeksten, opties.taal) : nieuwRapport();
    const belastingen = metSymbolen(rapport.belastingen);
    s = {
      projectNaam: p.projectNaam || naam,
      gegevens: { ...legeGegevens(), ...(p.gegevens ?? {}) },
      exemplaren: metBladRefs(p.exemplaren ?? []),
      activeId: p.exemplaren?.[0]?.id ?? PROJECT_ID,
      dirty: false,
      verborgen: p.verborgen ?? {},
      ...(p.vreemd ? { vreemd: p.vreemd } : {}),
      rapport: belastingen === rapport.belastingen ? rapport : { ...rapport, belastingen },
    };
    verleden = [];
    toekomst = [];
  };

  const inhoud = () => {
    const payload = {
      versie: PROJECT_FORMAAT_VERSIE,
      naam: s.projectNaam,
      gegevens: s.gegevens,
      exemplaren: s.exemplaren,
      rapport: s.rapport,
      verborgen: Object.keys(s.verborgen).length ? s.verborgen : undefined,
      vreemd: s.vreemd,
    };
    return bouwProjectBestand(payload, bladenVoorIfc(payload));
  };

  let instellingen: McpInstellingen = {
    theme: "light",
    language: opties.taal,
    textSize: "standard",
    units: { angleMode: "rad", defaultLength: "mm", defaultForce: "kN", defaultStress: "MPa", returnAngleUnits: false },
  };

  const project: GeheugenProject = {
    stand: () => s,
    laad,
    inhoud,
    zetToetsingen: (id, bij) => {
      s = { ...s, exemplaren: opBlad(id, (e) => ({ ...e, toetsingen: { ...(e.toetsingen ?? {}), ...bij } })) };
    },
    kopie: () => {
      const nieuw = maakGeheugenProject(opties);
      nieuw.zetStand(s);
      return nieuw;
    },
    zetStand: (stand) => {
      s = { ...stand };
      verleden = [];
      toekomst = [];
    },
    omgeving: {
      stand: () => ({
        projectNaam: s.projectNaam,
        bestandspad: null,
        gegevens: s.gegevens,
        exemplaren: s.exemplaren,
        activeId: s.activeId,
        dirty: s.dirty,
        verborgen: s.verborgen,
        vreemd: s.vreemd,
        rapport: s.rapport,
        stappenTerug: verleden.length,
        stappenVooruit: toekomst.length,
      }),
      sjabloon: (id) => (Object.prototype.hasOwnProperty.call(opties.sjablonen, id) ? opties.sjablonen[id] : undefined),
      moduleNaam: opties.moduleNaam,
      groepNaam: opties.groepNaam,
      speciaal: { project: PROJECT_ID, rapport: RAPPORT_ID },
      acties: {
        voegToe: (templateId, basis, source) =>
          voegAchteraan({ id: nieuweId(), naam: vrijeNaam(s.exemplaren, basis), templateId, source, bronVersie: rekenversie(source), waarden: {}, elementen: [] }),
        voegPdfToe: (naam: string, pdf: McpPdf) =>
          voegAchteraan({ id: nieuweId(), naam: vrijeNaam(s.exemplaren, naam, false), templateId: "pdf", source: "", waarden: {}, pdf } as Exemplaar),
        zetPdf: (id, pdf) => wijzig(() => ({ exemplaren: opBlad(id, (e) => ({ ...e, pdf }) as Exemplaar) })),
        dupliceer: (id) => {
          const bron = s.exemplaren.find((e) => e.id === id);
          if (!bron) return null;
          const { ref: _ref, ...rest } = bron;
          const nieuw: Exemplaar = { ...rest, id: nieuweId(), naam: vrijeNaam(s.exemplaren, `${bron.naam} (kopie)`, false), waarden: { ...bron.waarden } };
          wijzig((st) => {
            const lijst = [...st.exemplaren];
            lijst.splice(lijst.findIndex((e) => e.id === id) + 1, 0, nieuw);
            return { exemplaren: lijst, activeId: nieuw.id };
          });
          return nieuw.id;
        },
        verplaats: (id, richting) =>
          wijzig((st) => {
            const i = st.exemplaren.findIndex((e) => e.id === id);
            const j = i + richting;
            if (i < 0 || j < 0 || j >= st.exemplaren.length) return {};
            const lijst = [...st.exemplaren];
            [lijst[i], lijst[j]] = [lijst[j], lijst[i]];
            return { exemplaren: lijst };
          }),
        hernoem: (id, naam) => wijzig(() => ({ exemplaren: opBlad(id, (e) => ({ ...e, naam })) })),
        verwijder: (id) =>
          wijzig((st) => {
            const exemplaren = st.exemplaren.filter((e) => e.id !== id);
            return { exemplaren, activeId: st.activeId === id ? (exemplaren[0]?.id ?? PROJECT_ID) : st.activeId };
          }),
        selecteer: (id) => {
          s = { ...s, activeId: id };
        },
        zetBron: (id, source) => wijzig(() => ({ exemplaren: opBlad(id, (e) => ({ ...e, source })) })),
        zetWaarde: (id, naam, waarde) => wijzig(() => ({ exemplaren: opBlad(id, (e) => ({ ...e, waarden: { ...e.waarden, [naam]: waarde } })) })),
        zetGegeven: (naam, waarde) => wijzig((st) => ({ gegevens: { ...st.gegevens, [naam]: waarde } })),
        zetProjectNaam: (naam) => {
          s = { ...s, projectNaam: naam, dirty: true };
        },
        zetVerborgen: (onderdeel, verborgen) => {
          s = { ...s, verborgen: { ...s.verborgen, [onderdeel]: verborgen || undefined }, dirty: true };
        },
        zetRapportVeld: (pad, waarde) => wijzig((st) => ({ rapport: zetOpPad(st.rapport, leesPad(pad), waarde) as Rapport })),
        zetRapportDeel: (pad, waarde) =>
          wijzig((st) => {
            const rapport = normaliseerRapport(zetOpPad(st.rapport, leesPad(pad), waarde), vandaag(), standaardTeksten, opties.taal);
            const belastingen = metSymbolen(rapport.belastingen);
            return { rapport: belastingen === rapport.belastingen ? rapport : { ...rapport, belastingen } };
          }),
        ongedaan: () => {
          const vorige = verleden[verleden.length - 1];
          if (!vorige) return;
          verleden = verleden.slice(0, -1);
          toekomst = [...toekomst, momentopname()];
          s = { ...s, ...vorige, dirty: true };
        },
        opnieuw: () => {
          const volgende = toekomst[toekomst.length - 1];
          if (!volgende) return;
          toekomst = toekomst.slice(0, -1);
          verleden = [...verleden, momentopname()];
          s = { ...s, ...volgende, dirty: true };
        },
      },
      bestanden: {
        // Geen paden: een verzoek mag geen bestand op de server noemen.
        beschikbaar: () => false,
        nieuwProject: () => {
          s = leeg();
          verleden = [];
          toekomst = [];
        },
        openProject: async () => {
          throw new McpFout("NOT_AVAILABLE", `${GEEN_VENSTER} and no files by path; pass the project content to project_load.`);
        },
        bewaarProject: async () => {
          throw new McpFout("NOT_AVAILABLE", `${GEEN_VENSTER} and no files by path; project_export returns the project content.`);
        },
        recent: async () => [],
        leesBase64: async () => {
          throw new McpFout("NOT_AVAILABLE", `${GEEN_VENSTER} and no files by path; pass base64 instead.`);
        },
        schrijfTekst: async () => {
          throw new McpFout("NOT_AVAILABLE", `${GEEN_VENSTER} and writes no files.`);
        },
      },
      bibliotheek: {
        catalogus: async () => ({ modules: [], fout: "The calculation service has no online module library." }),
        geinstalleerd: () => ({}),
        installeer: async () => "The calculation service has no online module library.",
        verwijder: () => {},
      },
      instellingen: {
        lees: async () => structuredClone(instellingen),
        zet: async (w) => {
          instellingen = { ...instellingen, ...structuredClone(w) };
          return structuredClone(instellingen);
        },
      },
      weergave: {
        huidige: () => null,
        kies: () => `${GEEN_VENSTER}.`,
      },
      afdruk: {
        start: () => {
          throw new McpFout("NOT_AVAILABLE", `${GEEN_VENSTER} and no print dialog; report_pdf returns the report as PDF.`);
        },
        pdfViaEngine: async () => {
          throw new McpFout("NOT_AVAILABLE", `${GEEN_VENSTER}; report_pdf returns the report as PDF.`);
        },
        rapportPdf: async () => {
          throw new McpFout("NOT_AVAILABLE", `${GEEN_VENSTER} and writes no files; report_pdf returns the report as PDF.`);
        },
      },
    },
  };
  return project;
}
