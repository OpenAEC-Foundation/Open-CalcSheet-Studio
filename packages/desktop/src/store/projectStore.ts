import { create } from "zustand";
import {
  afgeleideProjectId,
  leesProjectId,
  nieuweProjectId,
  zetProjectEenheden,
  zetProjectTekst,
  type ElementRef,
  type IfcxVreemd,
  type VastgelegdeToets,
} from "@ifc-calc/core";
import { wisSessie, zetVastgelegd } from "../rekenen/toetsCache";
import { ruweEigenEenheden } from "./projectEenheden";
import { projectTekstVan } from "./projectBlad";
import { getSetting, setSetting } from "../store";
import { legeGegevens, type ProjectGegevens } from "./projectGegevens";
import i18next, { LANGUAGES } from "../i18n/config";
import { leesTaal, normaliseerRapport, type Rapport } from "../rapport/model";
import { metSymbolen } from "../rapport/belastingBronnen";
import { leesPad } from "../rapport/pad";
import { datumTekst } from "../rapport/revisies";
import { standaardTeksten } from "../rapport/standaardteksten";
import { isNieuwRapport, wisselTaal, zetVeldOpPad } from "../rapport/taalwissel";
import { landVoorLocale, metLandUit, metLokaal, NEDERLAND, normkeuzeVan, pasRapportAan, pasTemplateToeOpProject } from "../rapport/normen/keuze";
import { nieuwRapportVolgens, standaardTemplateVan, type Template } from "../rapport/template";
import { useTemplateStore } from "./rapportTemplates";
import { rekenversie } from "../components/calc/bladVersie";
import { normaliseerExemplaren } from "./projectBestand";
import { PDF_BLAD, type PdfBijlage } from "./pdfBijlage";
import type { PdfAantekening } from "./pdfAantekeningen";
import { SPREADSHEET_BLAD, type SpreadsheetBestand } from "./spreadsheetBlad";
import { MARKDOWN_BLAD, type MarkdownBestand } from "./markdownBlad";
import { CANVAS_BLAD } from "./canvasBlad";
import { GRAAF_BLAD } from "./graafBlad";
import { legeGraaf, type Graaf } from "../graaf/model";
import { TEKEN_BLAD, type TekenVel } from "./tekenBlad";
import { JUPYTER_BLAD, type JupyterWerkmap } from "./jupyterBlad";
import { MARIMO_BLAD, type MarimoNotebook } from "./marimoBlad";
import { metBladRefs } from "./bladRefs";
import { variantInvoer, type Varianten } from "./varianten";
import type { Controle, Registratie } from "./controle";
import type { IncludeKopie } from "./includes";

const STORE_KEY = "projectState";

/** Vaste id van het projectgegevens-formulier; geen exemplaar, wel selecteerbaar. */
export const PROJECT_ID = "__projectgegevens__";

/**
 * Vaste id van het rapport in de projectboom; net als PROJECT_ID geen
 * exemplaar, wel selecteerbaar. Exemplaar-ids beginnen met "ex-", dus een
 * `__x__`-id kan nooit met een blad botsen.
 */
export const RAPPORT_ID = "__rapport__";

/**
 * Eén rekenblad in het project.
 *
 * Een exemplaar draagt zijn **eigen kopie** van de rekentekst en zijn **eigen**
 * invoerwaarden. Drie balklagen naast elkaar zijn dus drie volledig losse
 * berekeningen: wat je in de ene invult raakt de andere niet, ook al heten de
 * variabelen hetzelfde. Dat is precies waar het oude model op stukliep — daar
 * was er één platte waardenmap voor de hele app, zodat `N_Ed` van de kolom en
 * `N_Ed` van de wand hetzelfde vakje waren.
 *
 * `templateId` is alleen herkomst: waaruit is dit exemplaar ontstaan. De tekst
 * volgt het sjabloon niet meer zodra hij is ingevoegd — een opgeleverde
 * berekening moet over vijf jaar nog hetzelfde uitrekenen, ook als het sjabloon
 * intussen is verbeterd.
 */
export interface Exemplaar {
  id: string;
  /**
   * Het kenmerk waarmee een ander blad naar dit blad verwijst: `#1.R_paal` neemt
   * de waarde R_paal uit het blad met ref "1" over (rekenen/verwijzingen.ts). Een
   * nummer dat de app geeft bij het toevoegen; het blijft gelijk bij verplaatsen
   * en verwijderen van andere bladen, en wordt niet opnieuw uitgedeeld.
   */
  ref?: string;
  naam: string;
  templateId: string;
  source: string;
  /**
   * De rekenversie van de moduletekst waaruit dit blad is ingevoegd, of
   * waarnaar het voor het laatst is bijgewerkt (components/calc/bladVersie.ts).
   * Zo is te onderscheiden of de module intussen een nieuwere rekenversie
   * heeft (bronVersie ≠ die van de module) of dat de gebruiker de rekentekst
   * zelf heeft aangepast (bronVersie ≠ die van `source`).
   *
   * Ontbreekt bij bladen van vóór dit veld en bij een los geopend blad zonder
   * module; die vergelijken hun tekst rechtstreeks met de module.
   */
  bronVersie?: string;
  /** Invoerwaarden van dit exemplaar, per variabelenaam. */
  waarden: Record<string, string>;
  /**
   * Elementen in een bronmodel waar dit blad over gaat.
   *
   * Leeg (of afwezig) betekent: losstaande berekening — de IFC-export maakt dan
   * zelf een element aan onder de naam van dit exemplaar. Staat er wél iets in,
   * dan draagt de export de toetsing over op díé elementen, zodat één balklaag-
   * berekening aan alle balken van die laag hangt.
   *
   * Het aanwijzen zelf komt later, samen met het inladen van een model. De
   * koppeling wordt bewust nooit geraden: welk element een toetsing beschrijft
   * weet alleen de constructeur.
   */
  elementen?: ElementRef[];
  /**
   * Alleen bij een PDF-blad (`templateId` PDF_BLAD, zie store/pdfBijlage.ts):
   * het PDF-bestand zelf, base64-gecodeerd. Een PDF-blad heeft een lege
   * `source` en geen invoer; in het rapport komen zijn pagina's op de plek
   * van het blad.
   */
  pdf?: PdfBijlage;
  /**
   * Alleen bij een spreadsheet-blad (`templateId` SPREADSHEET_BLAD, zie
   * store/spreadsheetBlad.ts): de werkmap zelf, base64-gecodeerd.
   */
  xlsx?: SpreadsheetBestand;
  /**
   * Alleen bij een Markdown-blad (`templateId` MARKDOWN_BLAD, zie
   * store/markdownBlad.ts): de tekst, met de afbeeldingen die erbij horen.
   */
  md?: MarkdownBestand;
  /**
   * Alleen bij een grafblad (`templateId` GRAAF_BLAD, zie store/graafBlad.ts):
   * de nodes en verbindingen. De uitkomsten staan er niet in; die rekent
   * graaf/rekenen.ts bij elke wijziging opnieuw uit.
   */
  graaf?: Graaf;
  /**
   * Alleen bij een tekenblad (`templateId` TEKEN_BLAD, zie store/tekenBlad.ts):
   * het vel met zijn views.
   */
  tekenvel?: TekenVel;
  /**
   * Alleen bij een Jupyter-blad (`templateId` JUPYTER_BLAD, zie store/jupyterBlad.ts):
   * de werkmap als ZIP, base64-gecodeerd.
   */
  jupyter?: JupyterWerkmap;
  /** Alleen bij een Marimo-blad (`templateId` MARIMO_BLAD, zie store/marimoBlad.ts): het notebook. */
  marimo?: MarimoNotebook;
  /**
   * De antwoorden van Open FEM Studio op de `@toets`-blokken van dit blad, op de hash
   * van hun invoer (rekenen/toetsCache.ts). Zo toont een opgeleverd blad zijn
   * uitkomst ook zonder FEM Studio, en gaat er niets opnieuw naar FEM Studio zolang
   * de invoer gelijk blijft. Ontbreekt bij een blad zonder toetsblok.
   */
  toetsingen?: Record<string, VastgelegdeToets>;
  /**
   * Varianten van dit blad: dezelfde tekst met andere invoer, naast elkaar doorgerekend
   * (store/varianten.ts). Ontbreekt bij een blad zonder varianten.
   */
  varianten?: Varianten;
  /**
   * De toetsregistratie van dit blad (vier ogen, store/controle.ts): elke controle met de
   * hash van de gecontroleerde stand. Ontbreekt bij een blad dat niet is gecontroleerd.
   */
  controle?: Controle;
  /**
   * De bestanden op schijf die dit blad met `#include` invoegt, met een kopie van de
   * laatst gelezen tekst (store/includes.ts). Ontbreekt bij een blad zonder.
   */
  includes?: IncludeKopie[];
}

/**
 * Onderdelen die de gebruiker uit de projectboom heeft gehaald. Alleen de
 * weergave: de projectgegevens en het rapport blijven bewaard en komen met
 * hun inhoud terug als je ze weer toevoegt.
 */
export interface Verborgen {
  gegevens?: boolean;
  rapport?: boolean;
}

interface Persisted {
  /** Ontbreekt in opslag van vóór de projectidentiteit; dan volgt hij uit nummer en naam. */
  projectId?: string;
  projectNaam: string;
  bestandspad: string | null;
  gegevens: ProjectGegevens;
  exemplaren: Exemplaar[];
  activeId: string;
  /** Ontbreekt in opslag en bestanden van vóór het constructierapport. */
  rapport?: Rapport;
  /** Ontbreekt als niets verborgen is. */
  verborgen?: Verborgen;
  /** Gegevens van een ander programma uit het geopende bestand (core: ifcx/vreemd.ts). */
  vreemd?: IfcxVreemd;
}

interface ProjectState {
  /**
   * De blijvende identiteit van het project, een UUID: de wortel van het IFCX, waar alle
   * paden en GlobalId's van afhangen. Hernoemen of een ander projectnummer verandert hem
   * niet. Nieuw project: een nieuwe. Openen: die uit het bestand. Opslaan als: dezelfde.
   */
  projectId: string;
  projectNaam: string;
  bestandspad: string | null;
  gegevens: ProjectGegevens;
  exemplaren: Exemplaar[];
  /** Het constructierapport van dit project; zie rapport/model.ts. */
  rapport: Rapport;
  /** Wat er in de werkruimte staat: een exemplaar-id, PROJECT_ID of RAPPORT_ID. */
  activeId: string;
  /** Uit de projectboom gehaald (projectgegevens, rapport). */
  verborgen: Verborgen;
  /**
   * Wat een ander programma in het geopende bestand zette. De app wijzigt het niet;
   * het gaat bij opslaan ongewijzigd terug (projectBestand.ts).
   */
  vreemd?: IfcxVreemd;
  dirty: boolean;
  /** Stapels voor ongedaan maken; niet opgeslagen, alleen voor deze sessie. */
  verleden: Momentopname[];
  toekomst: Momentopname[];

  selecteer: (id: string) => void;
  /**
   * Projectgegevens of rapport uit de projectboom halen of terugzetten. Staat
   * het onderdeel open als je het verbergt, dan opent het eerste blad.
   */
  zetVerborgen: (onderdeel: keyof Verborgen, verborgen: boolean) => void;
  voegToe: (templateId: string, basisNaam: string, source: string) => string;
  /** Een PDF-blad achteraan; de naam krijgt alleen een nummer als hij al bestaat. */
  voegPdfToe: (naam: string, pdf: PdfBijlage) => string;
  /** Een ander PDF-bestand voor een PDF-blad; naam en plaats blijven. */
  zetPdf: (id: string, pdf: PdfBijlage) => void;
  /** De aantekeningen op een PDF-blad; elke wijziging is één stap ongedaan maken. */
  zetPdfAantekeningen: (id: string, aantekeningen: PdfAantekening[]) => void;
  /** Of de aantekeningen op een PDF-blad ook op papier komen. */
  zetPdfOpPapier: (id: string, aan: boolean) => void;
  /** Een spreadsheet-blad achteraan; de naam krijgt alleen een nummer als hij al bestaat. */
  voegSpreadsheetToe: (naam: string, xlsx: SpreadsheetBestand) => string;
  /** De werkmap van een spreadsheet-blad; opeenvolgende bewerkingen tellen als één stap ongedaan maken. */
  zetSpreadsheet: (id: string, xlsx: SpreadsheetBestand) => void;
  /** Een Markdown-blad achteraan; de naam krijgt alleen een nummer als hij al bestaat. */
  voegMarkdownToe: (naam: string, md: MarkdownBestand) => string;
  /** De tekst van een Markdown-blad; doortypen telt als één stap ongedaan maken. */
  zetMarkdown: (id: string, md: MarkdownBestand) => void;
  /**
   * Gekoppelde bladen (store/koppeling.ts) op hun plek tussen de bladen, in één stap
   * ongedaan maken. `plek` telt in de lijst zoals die na de vorige in deze reeks is;
   * zonder: achteraan. Het eerste wordt het actieve blad. Geeft de nieuwe id's.
   */
  voegGekoppeldeToe: (bladen: { naam: string; md: MarkdownBestand; plek?: number }[]) => string[];
  /**
   * De nieuwe inhoud van een gekoppeld blad uit zijn bron. Geen stap in de
   * geschiedenis: de gebruiker deed niets. `inhoud`: de tekst veranderde, dus het
   * project is gewijzigd; zonder alleen het pad, en dat gaat mee bij het volgende opslaan.
   */
  werkKoppelingBij: (id: string, md: MarkdownBestand, inhoud: boolean) => void;
  /**
   * De gelezen `#include`-bestanden van een blad (store/includes.ts). Geen stap in de
   * geschiedenis; `inhoud`: een tekst veranderde, dus het project is gewijzigd.
   */
  zetIncludes: (id: string, includes: IncludeKopie[], inhoud: boolean) => void;
  /** Een leeg canvas-blad achteraan; de naam krijgt alleen een nummer als hij al bestaat. */
  voegCanvasToe: (naam: string) => string;
  /** Een leeg grafblad achteraan; de naam krijgt alleen een nummer als hij al bestaat. */
  voegGraafToe: (naam: string) => string;
  /**
   * De graaf van een grafblad. `sleutel`: doorgaan met dezelfde bewerking (typen
   * in een veld, de schuif) is één stap ongedaan maken; zonder is het een eigen stap.
   */
  zetGraaf: (id: string, graaf: Graaf, sleutel?: string) => void;
  /** Een tekenblad achteraan; de naam krijgt alleen een nummer als hij al bestaat. */
  voegTekenbladToe: (naam: string, tekenvel: TekenVel) => string;
  /** Het vel van een tekenblad; opeenvolgende bewerkingen tellen als één stap ongedaan maken. */
  zetTekenVel: (id: string, tekenvel: TekenVel) => void;
  /** Een Jupyter-blad achteraan; de naam krijgt alleen een nummer als hij al bestaat. */
  voegJupyterToe: (naam: string, jupyter: JupyterWerkmap) => string;
  /** De werkmap van een Jupyter-blad; opeenvolgende wijzigingen tellen als één stap ongedaan maken. */
  zetJupyter: (id: string, jupyter: JupyterWerkmap) => void;
  /** Een Marimo-blad achteraan; de naam krijgt alleen een nummer als hij al bestaat. */
  voegMarimoToe: (naam: string, marimo: MarimoNotebook) => string;
  /** Het notebook van een Marimo-blad; opeenvolgende wijzigingen tellen als één stap ongedaan maken. */
  zetMarimo: (id: string, marimo: MarimoNotebook) => void;
  dupliceer: (id: string) => string | null;
  hernoem: (id: string, naam: string) => void;
  verwijder: (id: string) => void;
  verplaats: (id: string, richting: -1 | 1) => void;

  zetBron: (id: string, source: string) => void;
  zetWaarde: (id: string, naam: string, waarde: string) => void;
  /**
   * Meerdere waarden van één blad tegelijk, in één stap van de geschiedenis: een poer uit
   * een palenplan, of een vastgelegde revisie (components/calc/PoerKoppeling.tsx).
   */
  zetWaarden: (id: string, waarden: Record<string, string>) => void;
  /** Vult ontbrekende waarden aan; bestaande blijven staan. */
  seedWaarden: (id: string, defaults: Record<string, string>) => void;
  /**
   * Zet bladen over op een nieuwe rekentekst, elk met zijn bijgewerkte
   * invoer: "Bijwerken" in het vergelijkingsscherm. De rekenversie van die
   * tekst wordt de nieuwe bronversie van het blad. Eén stap in de
   * geschiedenis, ook voor meerdere bladen tegelijk. Zie
   * components/calc/bladVersie.ts.
   */
  werkBladenBij: (wijzigingen: { id: string; source: string; waarden: Record<string, string> }[]) => void;

  /** Legt vast welke elementen uit een bronmodel dit blad toetst. */
  zetElementen: (id: string, elementen: ElementRef[]) => void;
  /**
   * Antwoorden van FEM Studio bij een blad, naast of in plaats van wat er al was
   * (rekenen/femToetsing.ts). Geen stap in de geschiedenis: het is geen bewerking,
   * en na ongedaan maken legt de werkruimte ze opnieuw vast.
   */
  zetToetsingen: (id: string, bij: Record<string, VastgelegdeToets>) => void;

  /**
   * De varianten van een blad (store/varianten.ts); `undefined` haalt ze weg. Eén stap
   * ongedaan maken; met `sleutel` (een cel) is doortypen in dezelfde cel één stap.
   */
  zetVarianten: (id: string, varianten: Varianten | undefined, sleutel?: string) => void;
  /** Een controle (vier ogen) erbij voor een blad; de eerdere blijven staan. Eén stap ongedaan maken. */
  registreerControle: (id: string, registratie: Registratie) => void;
  /** De invoer van een variant wordt de invoer van het blad. Eén stap ongedaan maken. */
  neemVariantOver: (id: string, variantId: string) => void;
  /**
   * Een kopie van het blad, direct erachter, met de invoer van een variant en zonder
   * varianten. Geeft het id van het nieuwe blad, of null.
   */
  variantAlsBlad: (id: string, variantId: string) => string | null;

  zetGegeven: (naam: string, waarde: string) => void;
  /** Meerdere projectgegevens in één wijziging (één stap ongedaan maken). */
  zetGegevens: (waarden: Record<string, string>) => void;
  zetProjectNaam: (naam: string) => void;

  /**
   * Zet één veld van het rapport, aangewezen met een pad zoals
   * "belastingen.wind.gebouwhoogte" of "revisies.0.omschrijving" (cijfers zijn
   * indexen). Doortypen in hetzelfde veld is één stap in de geschiedenis.
   */
  zetRapportVeld: (pad: string, waarde: string | boolean) => void;
  /**
   * Structurele wijziging van het rapport: een revisie, tabelregel, opbouw of
   * bijlage erbij of eraf, of "Bijwerken uit bureauprofiel". Altijd een eigen
   * stap in de geschiedenis. `fn` krijgt het huidige rapport en geeft een
   * nieuw object terug; het oude blijft ongemoeid. Met `sleutel` is doortypen
   * één stap, zoals bij een veld: een titel in de opzet heeft geen vast pad.
   */
  werkRapportBij: (fn: (r: Rapport) => Rapport, sleutel?: string) => void;
  /** Past een template toe op dit project: het rapport, en het land als het template er een heeft. Eén stap ongedaan maken. */
  pasTemplateToe: (t: Template) => void;

  ongedaan: () => void;
  opnieuw: () => void;

  nieuwProject: () => void;
  laadProject: (p: Partial<Persisted>) => void;
  markeerOpgeslagen: (bestandspad: string) => void;
}

/**
 * Toestand waar "ongedaan maken" naar terugkeert.
 *
 * Alleen verwijzingen: omdat elke mutatie een nieuw object maakt en de rest
 * ongemoeid laat, delen opeenvolgende momentopnamen bijna alles met elkaar.
 * Honderd stappen geschiedenis kost daardoor nauwelijks geheugen.
 */
interface Momentopname {
  exemplaren: Exemplaar[];
  gegevens: ProjectGegevens;
  rapport: Rapport;
  activeId: string;
}

const MAX_GESCHIEDENIS = 200;
/** Binnen deze tijd telt doortypen in hetzelfde veld als één stap. */
const SAMENVOEG_MS = 700;

let laatsteSleutel: string | null = null;
let laatsteTijd = 0;

/**
 * Zet een punt in de geschiedenis vóór een wijziging.
 *
 * `sleutel` maakt samenvoegen mogelijk: typ je in hetzelfde veld door, dan is
 * dat één stap en niet één per aanslag. Een `null`-sleutel is altijd een eigen
 * stap — dat zijn de handelingen waarvan je wilt dat ze los terugdraaibaar
 * zijn: invoegen, verwijderen, hernoemen, verplaatsen.
 */
function metGeschiedenis(s: ProjectState, sleutel: string | null) {
  const nu = Date.now();
  const samenvoegen =
    sleutel !== null && sleutel === laatsteSleutel && nu - laatsteTijd < SAMENVOEG_MS;
  laatsteSleutel = sleutel;
  laatsteTijd = nu;
  if (samenvoegen) return { toekomst: [] as Momentopname[] };
  const punt: Momentopname = {
    exemplaren: s.exemplaren,
    gegevens: s.gegevens,
    rapport: s.rapport,
    activeId: s.activeId,
  };
  return {
    verleden: [...s.verleden, punt].slice(-MAX_GESCHIEDENIS),
    toekomst: [] as Momentopname[],
  };
}

let teller = 0;
function nieuweId(): string {
  teller += 1;
  return `ex-${Date.now().toString(36)}-${teller.toString(36)}`;
}

/**
 * "Balklaag" wordt "Balklaag 1", de volgende "Balklaag 2".
 *
 * Zoekt het eerste vrije nummer in plaats van te tellen: na het verwijderen van
 * "Balklaag 1" zou tellen opnieuw "Balklaag 2" opleveren, en dan heb je twee
 * bladen met dezelfde naam in je uitdraai.
 */
function vrijeNaam(exemplaren: Exemplaar[], basisNaam: string, altijdNummeren = true): string {
  const bezet = new Set(exemplaren.map((e) => e.naam));
  if (!altijdNummeren && !bezet.has(basisNaam)) return basisNaam;
  for (let n = 1; ; n++) {
    const kandidaat = `${basisNaam} ${n}`;
    if (!bezet.has(kandidaat)) return kandidaat;
  }
}

/** De taal van de app, voor wat er nieuw wordt gemaakt. */
const appTaal = () => leesTaal(i18next.language) ?? "en";

/** Het template waarmee een nieuw rapport begint; null is het ingebouwde. */
const standaardTemplate = () => standaardTemplateVan(useTemplateStore.getState());

/**
 * De regio van het systeem. Een WebView geeft de taal van de gebruiker, en die zegt weinig over
 * de plek: een Engelstalig Windows in Nederland geeft "en-US". In de app komt de werkelijke
 * regio bij het opstarten binnen (locale in plugin-os, onderaan dit bestand).
 */
let systeemLocale: string | undefined = typeof navigator === "undefined" ? undefined : navigator.language;

/** De gegevens van een nieuw project: elk veld op zijn standaard en het land van het systeem, of dat uit het standaardtemplate. */
const nieuweGegevens = (): ProjectGegevens => metLandUit({ ...legeGegevens(), land: landVoorLocale(systeemLocale) }, standaardTemplate());

/**
 * Een nieuw rapport in de taal van de app, volgens het standaardtemplate: revisie A van vandaag,
 * aangepast aan het land van het project.
 */
function nieuwRapport(gegevens: ProjectGegevens): Rapport {
  return pasRapportAan(nieuwRapportVolgens(datumTekst(new Date()), appTaal(), standaardTemplate()), NEDERLAND, normkeuzeVan(gegevens));
}

/** De naam van een project dat nog geen naam heeft, in de taal van de app. */
const nieuweProjectNaam = () => i18next.t("werkruimte:project.nieuweNaam");

/**
 * Een rapport van buiten de store — uit de opslag of een ingelezen bestand —
 * aangevuld tot een volledig rapport. Ontbreekt het (opslag of bestand van
 * vóór het constructierapport), dan komt er een nieuw rapport.
 */
function rapportUit(x: unknown, gegevens: ProjectGegevens): Rapport {
  if (!x) return nieuwRapport(gegevens);
  // Een project van een ander land heeft zijn invoer klaar staan: het paneel schrijft erin.
  return metLokaal(normaliseerRapport(x, datumTekst(new Date()), standaardTeksten, appTaal()), normkeuzeVan(gegevens));
}

const beginGegevens = nieuweGegevens();

export const useProjectStore = create<ProjectState>((zet, get) => {
  // Elke wijziging van de bladen loopt hierlangs: zo krijgt een nieuw blad zijn
  // kenmerk, waar het ook wordt toegevoegd, en een tweede blad met hetzelfde
  // kenmerk een eigen (metBladRefs). Verandert er niets, dan dezelfde lijst.
  const set = ((deel: Parameters<typeof zet>[0]) =>
    zet((s) => {
      const uit = typeof deel === "function" ? deel(s) : deel;
      if (!uit || !("exemplaren" in uit) || !uit.exemplaren) return uit;
      const metRefs = metBladRefs(uit.exemplaren);
      return metRefs === uit.exemplaren ? uit : { ...uit, exemplaren: metRefs };
    })) as typeof zet;
  return {
  projectId: nieuweProjectId(),
  projectNaam: nieuweProjectNaam(),
  bestandspad: null,
  gegevens: beginGegevens,
  exemplaren: [],
  rapport: nieuwRapport(beginGegevens),
  activeId: PROJECT_ID,
  verborgen: {},
  dirty: false,
  verleden: [],
  toekomst: [],

  selecteer: (id) => set({ activeId: id }),
  zetVerborgen: (onderdeel, verborgen) =>
    set((s) => {
      const knoop = onderdeel === "gegevens" ? PROJECT_ID : RAPPORT_ID;
      const weg = verborgen && s.activeId === knoop;
      return {
        verborgen: { ...s.verborgen, [onderdeel]: verborgen || undefined },
        activeId: weg ? (s.exemplaren[0]?.id ?? "") : s.activeId,
        dirty: true,
      };
    }),

  voegToe: (templateId, basisNaam, source) => {
    const id = nieuweId();
    set((s) => ({
      ...metGeschiedenis(s, null),
      exemplaren: [
        ...s.exemplaren,
        {
          id,
          naam: vrijeNaam(s.exemplaren, basisNaam),
          templateId,
          source,
          // De tekst is die van de module: zijn rekenversie is de bron.
          bronVersie: rekenversie(source),
          waarden: {},
        },
      ],
      activeId: id,
      dirty: true,
    }));
    return id;
  },

  voegPdfToe: (naam, pdf) => {
    const id = nieuweId();
    set((s) => ({
      ...metGeschiedenis(s, null),
      exemplaren: [
        ...s.exemplaren,
        { id, naam: vrijeNaam(s.exemplaren, naam, false), templateId: PDF_BLAD, source: "", waarden: {}, pdf },
      ],
      activeId: id,
      dirty: true,
    }));
    return id;
  },

  zetPdf: (id, pdf) =>
    set((s) => {
      if (!s.exemplaren.some((e) => e.id === id)) return s;
      return {
        ...metGeschiedenis(s, null),
        exemplaren: s.exemplaren.map((e) => (e.id === id ? { ...e, pdf } : e)),
        dirty: true,
      };
    }),

  zetPdfAantekeningen: (id, aantekeningen) =>
    set((s) => {
      if (!s.exemplaren.some((e) => e.id === id && e.pdf)) return s;
      return {
        ...metGeschiedenis(s, null),
        exemplaren: s.exemplaren.map((e) => {
          if (e.id !== id || !e.pdf) return e;
          const { aantekeningen: _oud, ...rest } = e.pdf;
          return { ...e, pdf: aantekeningen.length > 0 ? { ...rest, aantekeningen } : rest };
        }),
        dirty: true,
      };
    }),

  zetPdfOpPapier: (id, aan) =>
    set((s) => {
      if (!s.exemplaren.some((e) => e.id === id && e.pdf)) return s;
      return {
        ...metGeschiedenis(s, null),
        exemplaren: s.exemplaren.map((e) => {
          if (e.id !== id || !e.pdf) return e;
          const { opPapier: _oud, ...rest } = e.pdf;
          return { ...e, pdf: aan ? rest : { ...rest, opPapier: false } };
        }),
        dirty: true,
      };
    }),

  voegSpreadsheetToe: (naam, xlsx) => {
    const id = nieuweId();
    set((s) => ({
      ...metGeschiedenis(s, null),
      exemplaren: [
        ...s.exemplaren,
        { id, naam: vrijeNaam(s.exemplaren, naam, false), templateId: SPREADSHEET_BLAD, source: "", waarden: {}, xlsx },
      ],
      activeId: id,
      dirty: true,
    }));
    return id;
  },

  zetSpreadsheet: (id, xlsx) =>
    set((s) => {
      if (!s.exemplaren.some((e) => e.id === id)) return s;
      return {
        ...metGeschiedenis(s, `xlsx:${id}`),
        exemplaren: s.exemplaren.map((e) => (e.id === id ? { ...e, xlsx } : e)),
        dirty: true,
      };
    }),

  voegMarkdownToe: (naam, md) => {
    const id = nieuweId();
    set((s) => ({
      ...metGeschiedenis(s, null),
      exemplaren: [
        ...s.exemplaren,
        { id, naam: vrijeNaam(s.exemplaren, naam, false), templateId: MARKDOWN_BLAD, source: "", waarden: {}, md },
      ],
      activeId: id,
      dirty: true,
    }));
    return id;
  },

  zetMarkdown: (id, md) =>
    set((s) => {
      if (!s.exemplaren.some((e) => e.id === id)) return s;
      return {
        ...metGeschiedenis(s, `md:${id}`),
        exemplaren: s.exemplaren.map((e) => (e.id === id ? { ...e, md } : e)),
        dirty: true,
      };
    }),

  voegGekoppeldeToe: (bladen) => {
    const ids: string[] = [];
    set((s) => {
      const lijst = [...s.exemplaren];
      for (const b of bladen) {
        const id = nieuweId();
        ids.push(id);
        const ex: Exemplaar = { id, naam: vrijeNaam(lijst, b.naam, false), templateId: MARKDOWN_BLAD, source: "", waarden: {}, md: b.md };
        lijst.splice(Math.max(0, Math.min(b.plek ?? lijst.length, lijst.length)), 0, ex);
      }
      if (ids.length === 0) return s;
      return { ...metGeschiedenis(s, null), exemplaren: lijst, activeId: ids[0], dirty: true };
    });
    return ids;
  },

  werkKoppelingBij: (id, md, inhoud) =>
    set((s) => {
      if (!s.exemplaren.some((e) => e.id === id)) return s;
      return {
        exemplaren: s.exemplaren.map((e) => (e.id === id ? { ...e, md } : e)),
        ...(inhoud ? { dirty: true } : {}),
      };
    }),

  zetIncludes: (id, includes, inhoud) =>
    set((s) => {
      if (!s.exemplaren.some((e) => e.id === id)) return s;
      return {
        exemplaren: s.exemplaren.map((e) => {
          if (e.id !== id) return e;
          const { includes: _oud, ...rest } = e;
          return includes.length > 0 ? { ...rest, includes } : rest;
        }),
        ...(inhoud ? { dirty: true } : {}),
      };
    }),

  voegCanvasToe: (naam) => {
    const id = nieuweId();
    set((s) => ({
      ...metGeschiedenis(s, null),
      exemplaren: [
        ...s.exemplaren,
        { id, naam: vrijeNaam(s.exemplaren, naam, false), templateId: CANVAS_BLAD, source: "", waarden: {} },
      ],
      activeId: id,
      dirty: true,
    }));
    return id;
  },
  voegGraafToe: (naam) => {
    const id = nieuweId();
    set((s) => ({
      ...metGeschiedenis(s, null),
      exemplaren: [
        ...s.exemplaren,
        { id, naam: vrijeNaam(s.exemplaren, naam, false), templateId: GRAAF_BLAD, source: "", waarden: {}, graaf: legeGraaf() },
      ],
      activeId: id,
      dirty: true,
    }));
    return id;
  },

  zetGraaf: (id, graaf, sleutel) =>
    set((s) => {
      if (!s.exemplaren.some((e) => e.id === id)) return s;
      return {
        ...metGeschiedenis(s, sleutel ? `graaf:${id}:${sleutel}` : null),
        exemplaren: s.exemplaren.map((e) => (e.id === id ? { ...e, graaf } : e)),
        dirty: true,
      };
    }),

  voegTekenbladToe: (naam, tekenvel) => {
    const id = nieuweId();
    set((s) => ({
      ...metGeschiedenis(s, null),
      exemplaren: [
        ...s.exemplaren,
        { id, naam: vrijeNaam(s.exemplaren, naam, false), templateId: TEKEN_BLAD, source: "", waarden: {}, tekenvel },
      ],
      activeId: id,
      dirty: true,
    }));
    return id;
  },

  zetTekenVel: (id, tekenvel) =>
    set((s) => {
      if (!s.exemplaren.some((e) => e.id === id)) return s;
      return {
        ...metGeschiedenis(s, `tekenvel:${id}`),
        exemplaren: s.exemplaren.map((e) => (e.id === id ? { ...e, tekenvel } : e)),
        dirty: true,
      };
    }),

  voegJupyterToe: (naam, jupyter) => {
    const id = nieuweId();
    set((s) => ({
      ...metGeschiedenis(s, null),
      exemplaren: [
        ...s.exemplaren,
        { id, naam: vrijeNaam(s.exemplaren, naam, false), templateId: JUPYTER_BLAD, source: "", waarden: {}, jupyter },
      ],
      activeId: id,
      dirty: true,
    }));
    return id;
  },

  zetJupyter: (id, jupyter) =>
    set((s) => {
      if (!s.exemplaren.some((e) => e.id === id)) return s;
      return {
        ...metGeschiedenis(s, `jupyter:${id}`),
        exemplaren: s.exemplaren.map((e) => (e.id === id ? { ...e, jupyter } : e)),
        dirty: true,
      };
    }),

  voegMarimoToe: (naam, marimo) => {
    const id = nieuweId();
    set((s) => ({
      ...metGeschiedenis(s, null),
      exemplaren: [
        ...s.exemplaren,
        { id, naam: vrijeNaam(s.exemplaren, naam, false), templateId: MARIMO_BLAD, source: "", waarden: {}, marimo },
      ],
      activeId: id,
      dirty: true,
    }));
    return id;
  },

  zetMarimo: (id, marimo) =>
    set((s) => {
      if (!s.exemplaren.some((e) => e.id === id)) return s;
      return {
        ...metGeschiedenis(s, `marimo:${id}`),
        exemplaren: s.exemplaren.map((e) => (e.id === id ? { ...e, marimo } : e)),
        dirty: true,
      };
    }),

  dupliceer: (id) => {
    const gevonden = get().exemplaren.find((e) => e.id === id);
    if (!gevonden) return null;
    // Zonder het kenmerk van het origineel: de kopie krijgt een eigen (metBladRefs). Ook
    // zonder de controle: een vrijgave hoort bij het blad dat gecontroleerd is.
    const { ref: _ref, controle: _controle, ...bron } = gevonden;
    const nieuw: Exemplaar = {
      ...bron,
      id: nieuweId(),
      naam: vrijeNaam(get().exemplaren, `${bron.naam} (kopie)`, false),
      waarden: { ...bron.waarden },
    };
    set((s) => {
      const i = s.exemplaren.findIndex((e) => e.id === id);
      const lijst = [...s.exemplaren];
      lijst.splice(i + 1, 0, nieuw);
      return { ...metGeschiedenis(s, null), exemplaren: lijst, activeId: nieuw.id, dirty: true };
    });
    return nieuw.id;
  },

  hernoem: (id, naam) =>
    set((s) => ({
      ...metGeschiedenis(s, null),
      exemplaren: s.exemplaren.map((e) => (e.id === id ? { ...e, naam } : e)),
      dirty: true,
    })),

  verwijder: (id) =>
    set((s) => {
      const i = s.exemplaren.findIndex((e) => e.id === id);
      const rest = s.exemplaren.filter((e) => e.id !== id);
      const active =
        s.activeId !== id ? s.activeId : (rest[Math.min(i, rest.length - 1)]?.id ?? PROJECT_ID);
      return { ...metGeschiedenis(s, null), exemplaren: rest, activeId: active, dirty: true };
    }),

  verplaats: (id, richting) =>
    set((s) => {
      const i = s.exemplaren.findIndex((e) => e.id === id);
      const j = i + richting;
      if (i < 0 || j < 0 || j >= s.exemplaren.length) return s;
      const lijst = [...s.exemplaren];
      const bewaar = lijst[i];
      lijst[i] = lijst[j];
      lijst[j] = bewaar;
      return { ...metGeschiedenis(s, null), exemplaren: lijst, dirty: true };
    }),

  zetBron: (id, source) =>
    set((s) => {
      if (!s.exemplaren.some((e) => e.id === id)) return s;
      return {
      ...metGeschiedenis(s, `bron:${id}`),
      exemplaren: s.exemplaren.map((e) => (e.id === id ? { ...e, source } : e)),
      dirty: true,
      };
    }),

  zetWaarde: (id, naam, waarde) =>
    set((s) => {
      if (!s.exemplaren.some((e) => e.id === id)) return s;
      return {
      ...metGeschiedenis(s, `waarde:${id}:${naam}`),
      exemplaren: s.exemplaren.map((e) =>
        e.id === id ? { ...e, waarden: { ...e.waarden, [naam]: waarde } } : e,
      ),
      dirty: true,
      };
    }),

  zetWaarden: (id, waarden) =>
    set((s) => {
      if (!s.exemplaren.some((e) => e.id === id) || Object.keys(waarden).length === 0) return s;
      return {
        ...metGeschiedenis(s, null),
        exemplaren: s.exemplaren.map((e) => (e.id === id ? { ...e, waarden: { ...e.waarden, ...waarden } } : e)),
        dirty: true,
      };
    }),

  seedWaarden: (id, defaults) =>
    set((s) => {
      const ex = s.exemplaren.find((e) => e.id === id);
      if (!ex) return s;
      let veranderd = false;
      const samen = { ...ex.waarden };
      for (const [k, v] of Object.entries(defaults)) {
        if (samen[k] === undefined || samen[k] === "") {
          samen[k] = v;
          veranderd = true;
        }
      }
      // Geen ontbrekende sleutels betekent geen update, anders blijft React
      // rondpompen tussen designer en store.
      if (!veranderd) return s;
      return {
        exemplaren: s.exemplaren.map((e) => (e.id === id ? { ...e, waarden: samen } : e)),
      };
    }),

  werkBladenBij: (wijzigingen) =>
    set((s) => {
      const per = new Map(wijzigingen.map((w) => [w.id, w]));
      if (!s.exemplaren.some((e) => per.has(e.id))) return s;
      return {
        ...metGeschiedenis(s, null),
        exemplaren: s.exemplaren.map((e) => {
          const w = per.get(e.id);
          return w ? { ...e, source: w.source, bronVersie: rekenversie(w.source), waarden: { ...w.waarden } } : e;
        }),
        dirty: true,
      };
    }),

  zetElementen: (id, elementen) =>
    set((s) => ({
      ...metGeschiedenis(s, null),
      exemplaren: s.exemplaren.map((e) => (e.id === id ? { ...e, elementen } : e)),
      dirty: true,
    })),

  zetToetsingen: (id, bij) =>
    set((s) => ({
      exemplaren: s.exemplaren.map((e) => (e.id === id ? { ...e, toetsingen: { ...e.toetsingen, ...bij } } : e)),
      dirty: true,
    })),

  zetVarianten: (id, varianten, sleutel) =>
    set((s) => {
      const ex = s.exemplaren.find((e) => e.id === id);
      if (!ex || ex.varianten === varianten) return s;
      return {
        ...metGeschiedenis(s, sleutel ? `varianten:${id}:${sleutel}` : null),
        exemplaren: s.exemplaren.map((e) => {
          if (e.id !== id) return e;
          const { varianten: _weg, ...rest } = e;
          return varianten ? { ...rest, varianten } : rest;
        }),
        dirty: true,
      };
    }),

  registreerControle: (id, registratie) =>
    set((s) => {
      if (!s.exemplaren.some((e) => e.id === id)) return s;
      return {
        ...metGeschiedenis(s, null),
        exemplaren: s.exemplaren.map((e) =>
          e.id === id ? { ...e, controle: { registraties: [...(e.controle?.registraties ?? []), registratie] } } : e,
        ),
        dirty: true,
      };
    }),

  neemVariantOver: (id, variantId) =>
    set((s) => {
      const ex = s.exemplaren.find((e) => e.id === id);
      const v = ex?.varianten?.lijst.find((x) => x.id === variantId);
      if (!ex || !v) return s;
      const waarden = variantInvoer(ex.waarden, v, ex.varianten!.velden);
      return {
        ...metGeschiedenis(s, null),
        exemplaren: s.exemplaren.map((e) => (e.id === id ? { ...e, waarden } : e)),
        dirty: true,
      };
    }),

  variantAlsBlad: (id, variantId) => {
    const bron = get().exemplaren.find((e) => e.id === id);
    const v = bron?.varianten?.lijst.find((x) => x.id === variantId);
    if (!bron || !v) return null;
    // Een eigen blad: een eigen kenmerk (metBladRefs), en zonder de varianten van het blad.
    const { varianten, ref: _ref, controle: _controle, ...rest } = bron;
    const nieuw: Exemplaar = {
      ...rest,
      id: nieuweId(),
      naam: vrijeNaam(get().exemplaren, `${bron.naam} – ${v.naam}`, false),
      waarden: variantInvoer(bron.waarden, v, varianten!.velden),
    };
    set((s) => {
      const i = s.exemplaren.findIndex((e) => e.id === id);
      const lijst = [...s.exemplaren];
      lijst.splice(i + 1, 0, nieuw);
      return { ...metGeschiedenis(s, null), exemplaren: lijst, dirty: true };
    });
    return nieuw.id;
  },

  zetGegeven: (naam, waarde) =>
    set((s) => {
      const gegevens = { ...s.gegevens, [naam]: waarde };
      return {
        ...metGeschiedenis(s, `gegeven:${naam}`),
        gegevens,
        // Het rapport volgt het land en de generatie; bij een ander veld blijft het hetzelfde object.
        rapport: naam === "land" || naam === "eurocode_generatie"
          ? pasRapportAan(s.rapport, normkeuzeVan(s.gegevens), normkeuzeVan(gegevens))
          : s.rapport,
        dirty: true,
      };
    }),

  zetGegevens: (waarden) =>
    set((s) => ({
      ...metGeschiedenis(s, null),
      gegevens: { ...s.gegevens, ...waarden },
      dirty: true,
    })),

  zetProjectNaam: (naam) => set({ projectNaam: naam, dirty: true }),

  zetRapportVeld: (pad, waarde) =>
    set((s) => ({
      ...metGeschiedenis(s, `rapport:${pad}`),
      rapport: zetVeldOpPad(s.rapport, leesPad(pad), waarde),
      dirty: true,
    })),

  werkRapportBij: (fn, sleutel) =>
    set((s) => {
      const nieuw = fn(s.rapport);
      // Hetzelfde object terug betekent: niets veranderd. Dan ook geen lege
      // stap in de geschiedenis en geen "niet opgeslagen".
      if (nieuw === s.rapport) return s;
      // Een nieuwe opbouw of belastingklasse krijgt hier zijn symbool voor de rekenbladen.
      const belastingen = metSymbolen(nieuw.belastingen);
      const rapport = belastingen === nieuw.belastingen ? nieuw : { ...nieuw, belastingen };
      return { ...metGeschiedenis(s, sleutel ?? null), rapport, dirty: true };
    }),

  pasTemplateToe: (t) =>
    set((s) => ({ ...metGeschiedenis(s, null), ...pasTemplateToeOpProject(s.gegevens, s.rapport, t), dirty: true })),

  ongedaan: () =>
    set((s) => {
      const vorige = s.verleden[s.verleden.length - 1];
      if (!vorige) return s;
      laatsteSleutel = null;
      return {
        verleden: s.verleden.slice(0, -1),
        toekomst: [
          ...s.toekomst,
          {
            exemplaren: s.exemplaren,
            gegevens: s.gegevens,
            rapport: s.rapport,
            activeId: s.activeId,
          },
        ],
        exemplaren: vorige.exemplaren,
        gegevens: vorige.gegevens,
        rapport: vorige.rapport,
        activeId: vorige.activeId,
        dirty: true,
      };
    }),

  opnieuw: () =>
    set((s) => {
      const volgende = s.toekomst[s.toekomst.length - 1];
      if (!volgende) return s;
      laatsteSleutel = null;
      return {
        toekomst: s.toekomst.slice(0, -1),
        verleden: [
          ...s.verleden,
          {
            exemplaren: s.exemplaren,
            gegevens: s.gegevens,
            rapport: s.rapport,
            activeId: s.activeId,
          },
        ].slice(-MAX_GESCHIEDENIS),
        exemplaren: volgende.exemplaren,
        gegevens: volgende.gegevens,
        rapport: volgende.rapport,
        activeId: volgende.activeId,
        dirty: true,
      };
    }),

  nieuwProject: () => {
    wisSessie();
    // Het eenhedenstelsel uit Instellingen, tab Units; daarna hoort het bij het project.
    const gegevens = { ...nieuweGegevens(), eenheden: stelselVoorNieuw };
    set({
      verborgen: {},
      vreemd: undefined,
      // Een nieuw project is een ander project, ook met dezelfde naam en hetzelfde nummer.
      projectId: nieuweProjectId(),
      projectNaam: nieuweProjectNaam(),
      bestandspad: null,
      gegevens,
      exemplaren: [],
      rapport: nieuwRapport(gegevens),
      activeId: PROJECT_ID,
      dirty: false,
      verleden: [],
      toekomst: [],
    });
  },

  laadProject: (p) => {
    // Een antwoord uit een ander project mag een vastgelegd antwoord niet vanzelf vervangen.
    wisSessie();
    // Zonder veld `land`: een oud project, dus Nederland (legeGegevens).
    const gegevens = { ...legeGegevens(), ...(p.gegevens ?? {}) };
    set({
      verborgen: p.verborgen ?? {},
      vreemd: p.vreemd,
      projectId: idVan(p),
      projectNaam: p.projectNaam ?? nieuweProjectNaam(),
      bestandspad: p.bestandspad ?? null,
      gegevens,
      exemplaren: p.exemplaren ?? [],
      rapport: rapportUit(p.rapport, gegevens),
      activeId: p.exemplaren?.[0]?.id ?? PROJECT_ID,
      dirty: false,
      verleden: [],
      toekomst: [],
    });
  },

  markeerOpgeslagen: (bestandspad) => set({ bestandspad, dirty: false }),
  };
});

/**
 * De identiteit van een geladen of herstelde stand. Zonder bruikbare id (opslag van
 * vóór de projectidentiteit) de id uit nummer en naam: de wortel die het project tot
 * nu toe in zijn exports had.
 */
function idVan(p: Partial<Persisted>): string {
  return leesProjectId(p.projectId) ?? afgeleideProjectId(p.projectNaam ?? nieuweProjectNaam(), p.gegevens?.project_nummer);
}

/** Is dit de naam die de app zelf aan een nieuw project gaf, in welke taal dan ook? */
const isStandaardNaam = (naam: string) =>
  LANGUAGES.some((l) => i18next.t("werkruimte:project.nieuweNaam", { lng: l.code }) === naam);

/*
 * De bewaarde taal van de app komt pas na het maken van de store binnen, en je kunt hem
 * wisselen voordat je iets hebt gedaan. Een project waar nog niemand aan heeft gezeten,
 * volgt dan de app. Iets dat is geopend of aangeraakt, houdt zijn eigen taal.
 */
function volgTaalVanApp() {
  const s = useProjectStore.getState();
  const taal = appTaal();
  if (s.dirty || s.bestandspad || s.exemplaren.length > 0 || s.rapport.taal === taal || !isNieuwRapport(s.rapport, standaardTemplate(), normkeuzeVan(s.gegevens))) return;
  useProjectStore.setState({
    rapport: wisselTaal(s.rapport, taal),
    ...(isStandaardNaam(s.projectNaam) ? { projectNaam: nieuweProjectNaam() } : {}),
  });
}
i18next.on("languageChanged", volgTaalVanApp);

/** De werkelijke regio van het systeem, in de app; in een browser blijft het navigator.language. */
async function leesRegioVanSysteem() {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  try {
    const { locale } = await import("@tauri-apps/plugin-os");
    systeemLocale = (await locale()) ?? systeemLocale;
  } catch {
    // Geen regio te lezen: dan blijft het wat de WebView zegt.
  }
}

/*
 * Bij een start zonder bewaarde stand. Het beginproject, waar nog niemand aan heeft gezeten,
 * krijgt het land van het systeem; een bewaarde stand houdt zijn eigen land, ook als dat
 * bewust is gekozen, en een project dat intussen is geopend ook.
 */
async function volgRegioVanSysteem() {
  await leesRegioVanSysteem();
  const s = useProjectStore.getState();
  const land = landVoorLocale(systeemLocale);
  const van = normkeuzeVan(s.gegevens);
  if (s.gegevens !== beginGegevens || land === s.gegevens.land || s.dirty || !isNieuwRapport(s.rapport, standaardTemplate(), van)) return;
  const gegevens = { ...s.gegevens, land };
  useProjectStore.setState({ gegevens, rapport: pasRapportAan(s.rapport, van, normkeuzeVan(gegevens)) });
}

/*
 * De eigen templates komen ook pas na het maken van de store binnen, en je kunt een ander template
 * als standaard kiezen voordat je iets hebt gedaan. Een rapport waar nog niemand aan heeft gezeten,
 * begint dan opnieuw volgens de standaard; `vorige` is het template waar het zo mee begon.
 */
function volgStandaardTemplate(vorige: Template | null) {
  const s = useProjectStore.getState();
  if (s.dirty || s.bestandspad || s.exemplaren.length > 0 || vorige === standaardTemplate() || !isNieuwRapport(s.rapport, vorige, normkeuzeVan(s.gegevens))) return;
  // Een template met een land neemt dat land mee; zonder land blijft het land staan.
  const gegevens = metLandUit(s.gegevens, standaardTemplate());
  useProjectStore.setState({ gegevens, rapport: nieuwRapport(gegevens) });
}
useTemplateStore.subscribe((nu, vorig) => {
  if (nu.lijst !== vorig.lijst || nu.standaard !== vorig.standaard) volgStandaardTemplate(standaardTemplateVan(vorig));
});

// Persistentie -------------------------------------------------------------
// Debounced wegschrijven naar de Tauri-store, zodat de app opent waar je hem
// achterliet. Het projectbestand op schijf is iets anders; zie tauri/fileOps.

let timer: ReturnType<typeof setTimeout> | null = null;
function schedulePersist(snapshot: Persisted) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void setSetting(STORE_KEY, snapshot);
    timer = null;
  }, 400);
}

/*
 * De eigen eenheden van het project bestaan op deze kant blijvend in de rekenkern
 * (zetProjectEenheden), zodat elke route ze kent: de uitwerking, de beelden, de
 * IFCX-export, MCP en het terugrekenen van een invoerveld. Alleen bij een andere lijst
 * opnieuw. De worker krijgt ze per verzoek mee (rekenen/doorrekening.ts).
 */
let vorigeEenhedenLijst: string | undefined = "\u0000";
function volgProjectEenheden(g: ProjectGegevens) {
  if (g.eenheden_lijst === vorigeEenhedenLijst) return;
  vorigeEenhedenLijst = g.eenheden_lijst;
  zetProjectEenheden(ruweEigenEenheden(g));
}
volgProjectEenheden(useProjectStore.getState().gegevens);
useProjectStore.subscribe((s) => volgProjectEenheden(s.gegevens));

/*
 * Net zo de projecttekst: de belastingen uit hoofdstuk 5 van het rapport (`g_v1`, `q_k1`)
 * en de eigen elementen van de projectgegevens. Hij rekent vóór elk blad, ook in de
 * uitdraai, het rapport en de IFCX-export. Alleen opnieuw als een van zijn bronnen een
 * ander object is; de worker krijgt de tekst per verzoek mee (rekenen/doorrekening.ts).
 */
let vorigeProjectBronnen: readonly unknown[] = [];
function volgProjectTekst(s: Pick<ProjectState, "gegevens" | "rapport">) {
  const nu = [s.gegevens.projectblad, s.gegevens.projectblad_waarden, s.rapport.belastingen, s.rapport.taal];
  if (nu.every((b, i) => b === vorigeProjectBronnen[i])) return;
  vorigeProjectBronnen = nu;
  zetProjectTekst(projectTekstVan(s.gegevens, s.rapport.belastingen, s.rapport.taal) ?? null);
}
volgProjectTekst(useProjectStore.getState());
useProjectStore.subscribe(volgProjectTekst);

// De vastgelegde antwoorden van FEM Studio, voor elk blad en elk rekenpad (rekenen/toetsCache.ts).
zetVastgelegd(useProjectStore.getState().exemplaren.map((e) => e.toetsingen));
useProjectStore.subscribe((s, vorige) => {
  if (s.exemplaren !== vorige.exemplaren) zetVastgelegd(s.exemplaren.map((e) => e.toetsingen));
});

/** Het eenhedenstelsel voor een nieuw project (Instellingen, tab Units). */
let stelselVoorNieuw = "blad";
void getSetting<{ stelsel?: string }>("units", {})
  .then((u) => {
    if (u?.stelsel) stelselVoorNieuw = u.stelsel;
  })
  .catch(() => {});
if (typeof window !== "undefined") {
  window.addEventListener("units-changed", (e) => {
    const d = (e as CustomEvent<{ stelsel?: string }>).detail;
    if (d?.stelsel) stelselVoorNieuw = d.stelsel;
  });
}

void getSetting<Persisted | null>(STORE_KEY, null).then((saved) => {
  // De opgeslagen staat komt asynchroon binnen. Heeft de gebruiker in die
  // tussentijd al iets gedaan — een module toegevoegd, een veld ingevuld — dan
  // zou terugzetten dat werk weggooien. Alleen hydrateren als er nog niets is
  // gebeurd.
  const nu = useProjectStore.getState();
  const onaangeroerd = nu.exemplaren.length === 0 && !nu.dirty;
  if (saved && Array.isArray(saved.exemplaren) && onaangeroerd) {
    const projectNaam = saved.projectNaam ?? nieuweProjectNaam();
    const gegevens = { ...legeGegevens(), ...(saved.gegevens ?? {}) };
    useProjectStore.setState({
      projectId: idVan({ ...saved, projectNaam }),
      projectNaam,
      bestandspad: saved.bestandspad ?? null,
      gegevens,
      // Net zo aangevuld als een ingelezen bestand: de opslag kan van een
      // oudere versie van de app zijn, met bladen zonder tekst of invoer.
      exemplaren: normaliseerExemplaren(saved.exemplaren, projectNaam),
      rapport: rapportUit(saved.rapport, gegevens),
      activeId: saved.activeId ?? PROJECT_ID,
      verborgen: saved.verborgen ?? {},
      vreemd: saved.vreemd,
      dirty: false,
    });
    volgTaalVanApp();
    volgStandaardTemplate(null);
    void leesRegioVanSysteem();
  } else {
    void volgRegioVanSysteem();
  }
  // Een expliciete lijst: een nieuw veld moet hier én hierboven bij het
  // hydrateren worden toegevoegd, anders overleeft het geen herstart.
  useProjectStore.subscribe((s) =>
    schedulePersist({
      projectId: s.projectId,
      projectNaam: s.projectNaam,
      bestandspad: s.bestandspad,
      gegevens: s.gegevens,
      exemplaren: s.exemplaren,
      rapport: s.rapport,
      activeId: s.activeId,
      verborgen: s.verborgen,
      vreemd: s.vreemd,
    }),
  );
});
