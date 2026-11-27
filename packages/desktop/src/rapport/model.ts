/**
 * Het constructierapport van een project: documentgegevens, teksten,
 * uitgangspunten en belastingen.
 *
 * Alleen gegevens en standaardwaarden: geen React, en imports met waarden alleen uit
 * deze map en uit kaart/ (met extensie .ts, zonder React), zodat scripts/check-rapport.mjs dit bestand rechtstreeks
 * kan laden. Invoer staat als tekst opgeslagen, net als de projectgegevens: wat de
 * gebruiker typte ("0,56") blijft staan, rekenen gebeurt pas bij het opmaken.
 *
 * Wat de app meelevert is meertalig, met Engels als bron (meertalig.ts). Een rapport
 * bewaart de tekst in zijn eigen taal (`Rapport.taal`), zoals de gebruiker hem ziet.
 */
import { BRONTAAL, bundel, decimaleKomma as kommaTaal } from "../i18n/talen.ts";
import { inTaal, leesMeertalig, leesTaal, mt, RAPPORTTEKSTEN, type Meertalig } from "./meertalig.ts";
import { normaliseerSituatie, type Situatie } from "./situatie.ts";
import { metSymbolen } from "./belastingBronnen.ts";
import { EN1990_FACTOREN, EN1990_PSI } from "./normen/en1990.ts";
import { LANDEN, TWEEDE_GENERATIE_TEKST } from "./normen/landen.ts";
import { leesWeggehaald, normaliseerOpzet, type Knoop, type Weggehaald } from "./opzet.ts";
import { leesVarianten, type Tekstvariant } from "./standaardteksten.ts";

export { leesTaal };

export type Fase = "" | "SO" | "VO" | "DO" | "TO" | "UO";
export const FASEN: readonly Fase[] = ["SO", "VO", "DO", "TO", "UO"];

export type RevisieStatus = "concept" | "ter goedkeuring" | "definitief";
export const REVISIE_STATUSSEN: readonly RevisieStatus[] = ["concept", "ter goedkeuring", "definitief"];

export interface Revisie {
  code: string;
  /** dd-mm-jjjj */
  datum: string;
  omschrijving: string;
  status: RevisieStatus;
}

export interface Constructeur {
  /** Met titel, zoals hij op het voorblad staat: "Ing. A. de Vries". */
  naam: string;
  telefoon: string;
  email: string;
}

export interface Huisstijl {
  /** Hoofdstuktitels en de rapporttitel. */
  hoofdkleur: string;
  /** Paragraafkoppen, labels op het voorblad, ondertitel, kopregels van tabellen. */
  accentkleur: string;
  /** Tekst in tabellen. */
  tabeltekst: string;
  /** Ingevulde waarden in tabellen. */
  invoerkleur: string;
  /** CSS font-family. */
  lettertype: string;
}

export interface BureauProfiel {
  naam: string;
  adres: string;
  postcode: string;
  plaats: string;
  telefoon: string;
  email: string;
  /** data-URL of "". */
  logo: string;
  /** Het logo in de kop van elke pagina en in de titelhoek van een tekening. Op het voorblad staat het altijd. */
  logoInKop: boolean;
  /** data-URL of "": over de volle paginabreedte onderaan elke pagina. */
  voetafbeelding: string;
  /** De kop van elke pagina als template (rapport/kopVoet.ts): links|midden|rechts; leeg: zoals altijd. */
  kopTekst?: string;
  /** De voet van elke pagina als template; leeg: zoals altijd. */
  voetTekst?: string;
  huisstijl: Huisstijl;
  constructeurs: Constructeur[];
}

export const STANDAARD_HUISSTIJL: Huisstijl = {
  hoofdkleur: "#1f3a5f",
  accentkleur: "#2f7d6d",
  tabeltekst: "#1f2937",
  invoerkleur: "#1d4ed8",
  lettertype: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
};

/**
 * De huisstijl van een rapport: wat bij een bureau hoort en niet bij de berekening. Dat is
 * het bureauprofiel (naam, adres, logo, logo in de kop, voetafbeelding, kleuren en
 * lettertype); de kop en de voet van elke pagina en het voorblad worden daaruit opgemaakt.
 *
 *   "bureau"   het bureauprofiel uit de instellingen of vastgelegd in het project (standaard)
 *   "openaec"  de standaard die in de app zit: OpenAEC, zonder logo of voetafbeelding
 *
 * De keuze staat in het rapport (Rapport.huisstijlBron) en gaat zo mee in de IFCX.
 */
export type HuisstijlBron = "bureau" | "openaec";

export const HUISSTIJL_BRONNEN: readonly HuisstijlBron[] = ["bureau", "openaec"];

/** De huisstijl die in de app zit: wit papier, zwarte koppen, amber als accent, Space Grotesk. */
export const OPENAEC_BUREAU: BureauProfiel = {
  naam: "OpenAEC",
  adres: "",
  postcode: "",
  plaats: "",
  telefoon: "",
  email: "",
  logo: "",
  logoInKop: false,
  voetafbeelding: "",
  kopTekst: "{project}||{blad}",
  voetTekst: "OpenAEC|{pagina} / {paginas}|{datum}",
  huisstijl: {
    hoofdkleur: "#111111",
    accentkleur: "#d97706",
    tabeltekst: "#1f2937",
    invoerkleur: "#b45309",
    lettertype: '"Space Grotesk", Inter, system-ui, sans-serif',
  },
  constructeurs: [],
};

/**
 * De lettertypen in de keuzelijst. Inter en Space Grotesk levert de app zelf mee; de rest
 * staat op vrijwel elke Windows-computer en valt anders terug op wat erachter staat.
 */
export const LETTERTYPEN: readonly { naam: string; css: string }[] = [
  { naam: "Segoe UI", css: STANDAARD_HUISSTIJL.lettertype },
  { naam: "Arial", css: "Arial, Helvetica, sans-serif" },
  { naam: "Calibri", css: "Calibri, Carlito, Arial, sans-serif" },
  { naam: "Tahoma", css: "Tahoma, Verdana, sans-serif" },
  { naam: "Verdana", css: "Verdana, Geneva, sans-serif" },
  { naam: "Inter", css: "Inter, system-ui, sans-serif" },
  { naam: "Space Grotesk", css: '"Space Grotesk", system-ui, sans-serif' },
  { naam: "Cambria", css: "Cambria, Georgia, serif" },
  { naam: "Georgia", css: 'Georgia, "Times New Roman", serif' },
  { naam: "Times New Roman", css: '"Times New Roman", Times, serif' },
];

/** Wijkt deze huisstijl af van de standaard? Zo niet, dan houden losse bladen hun eigen opmaak. */
export function heeftEigenHuisstijl(h: Huisstijl): boolean {
  return (Object.keys(STANDAARD_HUISSTIJL) as (keyof Huisstijl)[]).some((k) => h[k] !== STANDAARD_HUISSTIJL[k]);
}

/**
 * De huisstijl als CSS-variabelen, voor op de wortel van een uitdraai. Een leeg veld valt
 * terug op de standaard. `--rpa-*` is het rapport (RapportAfdruk.css); `--pr-*` is de opmaak
 * van een blad (PrintDocument.css), en die verandert alleen bij een eigen huisstijl.
 */
export function huisstijlVariabelen(h: Huisstijl): Record<string, string> {
  const s = STANDAARD_HUISSTIJL;
  const hoofd = h.hoofdkleur || s.hoofdkleur;
  const accent = h.accentkleur || s.accentkleur;
  const tabel = h.tabeltekst || s.tabeltekst;
  const letter = h.lettertype || s.lettertype;
  const rapport = {
    "--rpa-hoofd": hoofd,
    "--rpa-accent": accent,
    "--rpa-tabel": tabel,
    "--rpa-invoer": h.invoerkleur || s.invoerkleur,
    "--rpa-font": letter,
  };
  if (!heeftEigenHuisstijl(h)) return rapport;
  return {
    ...rapport,
    "--pr-accent": accent,
    "--pr-tekst": tabel,
    "--pr-kopkleur": hoofd,
    "--pr-kop": letter,
    "--pr-letter": letter,
    "--pr-kern-letter": letter,
    "--pr-kern-kop": hoofd,
  };
}

/**
 * Een lettertypelijst die veilig in een stijlregel of SVG-attribuut kan, met enkele
 * aanhalingstekens. Een profiel kan via een project van iemand anders komen; wat iets anders
 * is dan namen, geeft een lege tekst.
 */
export function veiligLettertype(s: string): string {
  return /^[\p{L}\p{N} ,"'_-]+$/u.test(s) ? s.replace(/"/g, "'") : "";
}

export function leegBureau(): BureauProfiel {
  return {
    naam: "", adres: "", postcode: "", plaats: "", telefoon: "", email: "",
    logo: "", logoInKop: true, voetafbeelding: "",
    huisstijl: { ...STANDAARD_HUISSTIJL },
    constructeurs: [],
  };
}

/** 2.2 Rol binnen het project en bereik rapport. */
export interface Rol {
  rol: string;
  architect: string;
  datumOnderlegger: string;
}

export interface Brandeisen {
  /** Minuten, of "-" voor geen eis. */
  hoofddraagconstructie: string;
  brandscheiding: string;
  vluchtroute: string;
  /** Verwijzing naar de regelgeving, rechts van de tabel. */
  verwijzing: string;
}

export interface Materiaalregel { type: string; soort: string; opmerking: string; }
export interface Bevestigingsregel { type: string; kwaliteit: string; }
export interface Conserveringsregel { onderdeel: string; systeem: string; }
/** 4.8: één eis per kolom; leeg = geen eis in die kolom. */
export interface Vervormingsregel { onderdeel: string; ueind: string; ubij: string; uhor: string; }

export interface BestaandeSituatie {
  /** false = paragraaf 4.6 valt weg (nieuwbouw). */
  opnemen: boolean;
  bouwjaar: string;
  bron: string;
  /** "Ja" of "Nee". */
  berekeningBeschikbaar: string;
  materiaalgegevensBeschikbaar: string;
}

export interface Uitgangspunten {
  soortBouwwerk: string;
  brand: Brandeisen;
  materialen: Materiaalregel[];
  materialenNoot: string;
  bevestiging: Bevestigingsregel[];
  conservering: Conserveringsregel[];
  conserveringSlot: string;
  bestaand: BestaandeSituatie;
  vervormingen: Vervormingsregel[];
}

export interface Windcoefficient { omschrijving: string; c: string; }
export interface Wind {
  /** m */
  gebouwhoogte: string;
  cscd: string;
  coefficienten: Windcoefficient[];
}

/** 5.4: één belastingklasse; `categorie` is een id uit CATEGORIEEN (normwaarden.ts). */
export interface Belastingklasse {
  categorie: string;
  /** kN/m², alleen bij vloeren; "" = geen. */
  lichteScheidingswanden: string;
  /** graden, alleen bij daken. */
  dakhelling: string;
  /** kN/m¹, alleen bij daken. */
  qlast: string;
  /** Eigen q_k in kN/m²; "" of afwezig = de waarde uit de tabel. Bij categorie E verplicht. */
  qk?: string;
  /** Eigen Q_k in kN; "" of afwezig = de waarde uit de tabel. Bij categorie E verplicht. */
  Qk?: string;
  /** De naam waaronder q_k in de rekenbladen bestaat (rapport/belastingBronnen.ts). */
  symbool?: string;
}

/** Een laag in een vlakopbouw: p = d × ρ, of de ingevulde p als die er staat. */
export interface Laag { naam: string; d: string; rho: string; p: string; }
/** Een laag in een gevelopbouw: q = p × h × vulling. */
export interface Gevellaag { naam: string; p: string; h: string; vulling: string; }

/**
 * Wat een opbouw tot een los blok maakt: het symbool waaronder zijn som in de rekenbladen
 * bestaat (rapport/belastingBronnen.ts), en zijn plek op het canvas van 5.5 in px. Zonder
 * plek zet het canvas hem zelf neer.
 */
export interface Blokplek { symbool?: string; x?: number; y?: number; }

export type Opbouw =
  | ({ soort: "vlak"; naam: string; lagen: Laag[] } & Blokplek)
  | ({ soort: "gevel"; naam: string; lagen: Gevellaag[] } & Blokplek);

export interface Belastingen {
  wind: Wind;
  klassen: Belastingklasse[];
  vloerenDaken: Opbouw[];
  wanden: Opbouw[];
}

/** Wat de locatie levert: per grootheid (normen/landen.ts) de getypte waarde, en waar die vandaan komt. */
export interface LokaalBlok {
  waarden: Record<string, string>;
  bron: string;
}

/** 4.5 in een Eurocode-land: de factoren als invoer, in de kolommen van de Nederlandse tabel. */
export interface Factorregel { groep: string; naam: string; gGinf: string; gGsup: string; gQ1: string; gQi: string; }
export interface Psiregel { naam: string; psi0: string; psi1: string; psi2: string; }
/** 4.5 buiten de Eurocodes: de combinatie zoals die norm hem schrijft, bijvoorbeeld "1.2D + 1.6L". */
export interface Combinatieregel { naam: string; formule: string; }
/** 5.4 buiten Nederland: geen tabel om uit te kiezen, dus q_k en Q_k zijn invoer. */
export interface LokaleKlasse { omschrijving: string; qk: string; Qk: string; }

/**
 * Wat er in een rapport buiten de Nederlandse tabellen wordt ingevuld (normen/keuze.ts). Per
 * land apart: een waarde uit het ene land gaat niet stil mee naar het andere.
 */
export interface LokaleInvoer {
  /** De klasse uit de norm van dit land (risk category, importance category), als tekst. */
  veiligheid: string;
  /** `q`: de stuwdruk waarmee 5.2 rekent, in kN/m²; ingevuld, niet afgeleid. */
  wind: LokaalBlok & { q: string };
  /** `s`: de sneeuwbelasting op een plat dak, in kN/m²; ingevuld, niet afgeleid. */
  sneeuw: LokaalBlok & { s: string };
  aardbeving: LokaalBlok;
  factoren: Factorregel[];
  psi: Psiregel[];
  combinaties: Combinatieregel[];
  klassen: LokaleKlasse[];
}

/**
 * Opmaakkeuzes die met een versie van de rapportopbouw zijn bijgekomen
 * (RAPPORT_VERSIE). Een nieuw rapport heeft ze aan; een ouder rapport krijgt
 * bij het openen het oude gedrag als eigen keuze, en de gebruiker kan ze in
 * het paneel zelf omzetten.
 */
export interface Opmaak {
  /** 3.1: het blok Wijziging heet bij nieuwbouw Constructieprincipe (titelVan in opzet.ts). */
  constructieprincipe: boolean;
  /** Een korte regel die op ":" eindigt komt als vette subkop in de afdruk (tekstRegels in invullen.ts). */
  subkoppen: boolean;
  /**
   * De inhoudsopgave noemt ook de bladen: in hoofdstuk Berekeningen de bladen met hun
   * uitwerking daar, onder bijlage A de rest (inhoudsopgave in opzet.ts).
   */
  bladenInInhoud: boolean;
  /**
   * Alleen `false` wordt bewaard: een blad met zijn uitwerking in bijlage A heeft dan geen
   * paragraaf in hoofdstuk Berekeningen en telt daar niet mee in de nummering (bladKnopen
   * in opzet.ts). Zonder dit veld heeft elk blad er een, met de verwijzing naar de bijlage.
   */
  bijlageParagrafen?: boolean;
}

/** Een afbeelding onder de tekst van een paragraaf, zoals een overzichtstekening. */
export interface Rapportbeeld {
  /** data-URL van een PNG of JPEG. */
  data: string;
  bijschrift: string;
  /** Breedte in procenten van de tekstbreedte: BEELD_BREEDTE.min t/m 100. */
  breedte: number;
}

export const BEELD_BREEDTE = { min: 20, max: 100, standaard: 100 } as const;

/** Is dit een afbeelding die het rapport kan tonen? Alleen PNG en JPEG, als data-URL. */
export function isBeeldData(s: unknown): s is string {
  return typeof s === "string" && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(s);
}

export interface Rapport {
  /**
   * Versie van de rapportopbouw waarmee dit rapport is gemaakt (RAPPORT_VERSIE).
   * Ontbreekt in rapporten van vóór versie 2; normaliseerRapport werkt die bij.
   */
  versie: number;
  /** De taal van het rapport op papier: koppen, vaste woorden, teksten en rekenbladen. */
  taal: string;
  /**
   * Per tekst-id de taal waarin de gebruiker die tekst typte. Staat die taal anders dan
   * `taal`, dan meldt het paneel dat de tekst nog vertaald moet worden (taalwissel.ts).
   * Een meegeleverde variant heeft hier geen regel: die wisselt mee.
   */
  tekstTaal: Record<string, string>;
  titel: string;
  kenmerk: string;
  fase: Fase;
  normen: string;
  /** Adresregels onder de opdrachtgever, gescheiden door "\n". */
  opdrachtgeverAdres: string;
  verantwoordelijk: string;
  uitvoerend: string;
  revisies: Revisie[];
  /** Per tekst-id (zie opzet.ts) de tekst. */
  teksten: Record<string, string>;
  rol: Rol;
  uitgangspunten: Uitgangspunten;
  belastingen: Belastingen;
  /** Per tekst-id (zie opzet.ts) de afbeeldingen onder de tekst van die paragraaf. */
  beelden: Record<string, Rapportbeeld[]>;
  /** Per exemplaar-id een eigen toelichting voor hoofdstuk Berekeningen. */
  toelichting: Record<string, string>;
  /** Per exemplaar-id: uitwerking in het hoofdstuk zelf in plaats van in bijlage A. */
  inHoofdstuk: Record<string, boolean>;
  /**
   * Per knoop-id uit opzet.ts: het blad (exemplaar-id) dat dit onderdeel invult. Het rapport
   * toont daar de uitwerking van het blad, onder de kop en het nummer van het onderdeel; het
   * blad staat dan niet meer in Berekeningen of bijlage A.
   */
  bladVoor: Record<string, string>;
  /**
   * Het rapport is opgebouwd uit de bladen van het project (rapport/uitBladen.ts): de vaste
   * hoofdstukindeling vervalt, en elk blad met een rol in `bladRol` is een hoofdstuk of een
   * paragraaf, in de volgorde van de projectboom.
   */
  uitBladen?: boolean;
  /** Per exemplaar-id: "hoofdstuk" of "paragraaf". Zonder rol staat een blad in bijlage A. */
  bladRol: Record<string, string>;
  /** Welke huisstijl de kop, de voet en het voorblad opmaakt (HuisstijlBron); zonder: het bureau. */
  huisstijlBron?: HuisstijlBron;
  /** Titels van eigen bijlagen (B, C, …); bijlage A is altijd de uitwerking. */
  bijlagen: string[];
  /** Per knoop-id uit opzet.ts: begint op een nieuwe pagina (overschrijft de standaard). */
  nieuwePagina: Record<string, boolean>;
  opmaak: Opmaak;
  /**
   * De pagina Situatie met kaarten van de plek van het project. Ontbreekt zolang er geen
   * kaarten zijn gemaakt; een nieuw optioneel veld, dus RAPPORT_VERSIE blijft gelijk.
   */
  situatie?: Situatie;
  /** Vastgelegde kopie van het bureauprofiel. */
  bureau: BureauProfiel;
  /**
   * Per land de invoer buiten de Nederlandse tabellen. Ontbreekt in een Nederlands rapport,
   * dus een oud rapport verandert niet.
   */
  lokaal?: Record<string, LokaleInvoer>;
  /**
   * De eigen kopie van de hoofdstukindeling (opzet.ts), zoals `bureau` een kopie van het
   * profiel is: een gewijzigd template verandert dit rapport niet. Ontbreekt: het ingebouwde
   * template. De velden hieronder ontbreken ook zolang ze niets zeggen.
   */
  opzet?: Knoop[];
  /** Per tekst-id de varianten uit het template, waar die afwijken van de meegeleverde. */
  varianten?: Record<string, Tekstvariant[]>;
  /** Uit de opzet gehaald en terug te zetten; de tekst staat nog in `teksten`. */
  weggehaald?: Weggehaald[];
  /** Het template waar dit rapport mee begon. Het land van het project staat in de projectgegevens; hier wat het template zei. */
  template?: TemplateHerkomst;
  /** De huisstijl uit het template; gaat boven die van het bureau. */
  huisstijl?: Huisstijl;
}

export interface TemplateHerkomst {
  naam: Meertalig;
  land?: string;
}

/**
 * De huidige versie van de rapportopbouw. Verandert een standaard zo dat een
 * opgeslagen rapport er anders door uit zou komen, dan gaat de versie omhoog
 * en legt normaliseerRapport voor oudere rapporten het oude gedrag vast:
 *
 *   1  alles van vóór het versienummer;
 *   2  hoofdstuk Projectgegevens begint standaard op een nieuwe pagina
 *      (nieuwePagina in OPZET, opzet.ts). Een ouder rapport zonder eigen
 *      keuze krijgt nieuwePagina.projectgegevens = false: daar liep het
 *      hoofdstuk door na de inleiding, en dat blijft zo.
 *   3  het blok Wijziging in 3.1 heet bij nieuwbouw Constructieprincipe, en
 *      een korte regel die op ":" eindigt wordt een vette subkop (Opmaak).
 *      Een ouder rapport zonder eigen keuze krijgt opmaak.constructieprincipe
 *      en opmaak.subkoppen = false: de kop blijft Wijziging en de teksten
 *      blijven zonder subkoppen.
 *   4  de inhoudsopgave noemt ook de bladen (Opmaak). Een ouder rapport zonder
 *      eigen keuze krijgt opmaak.bladenInInhoud = false: de inhoudsopgave blijft
 *      even lang, en de vellen erna verschuiven niet.
 *   5  het rapport heeft een taal en de meegeleverde teksten zijn meertalig. Een
 *      ouder rapport krijgt taal = "nl", want zijn inhoud is Nederlands, en wat
 *      erin ontbreekt wordt Nederlands aangevuld.
 */
export const RAPPORT_VERSIE = 5;

// ── Wat de app meelevert ────────────────────────────────────────────────────
// Elke waarde die in een nieuw rapport staat of als suggestie wordt aangeboden, in elke
// taal. Wisselen van taal zoekt hierin (taalwissel.ts): een waarde die gelijk is aan een
// regel hier, wisselt mee; eigen invoer blijft staan.

/** De meegeleverde tekst op standaard.<sleutel> in rapportteksten.json. */
const st = (sleutel: string): Meertalig => mt(`standaard.${sleutel}`);

/** Een lijst uit standaard.<sleutel>: even lang als in het Engels, de bron. */
function stLijst(sleutel: string): Meertalig[] {
  const bron = bundel(BRONTAAL, RAPPORTTEKSTEN)?.standaard as Record<string, readonly unknown[]>;
  return bron[sleutel].map((_, i) => st(`${sleutel}.${i}`));
}

/** Suggesties voor de rapporttitel; de eerste is de standaard. */
export const TITELS: readonly Meertalig[] = stLijst("titels");

/** Suggesties voor de rol in 2.2; de eerste is de standaard. */
export const ROLLEN: readonly Meertalig[] = stLijst("rollen");

/** Suggesties voor de soort bouwwerk in 4.1; de eerste is de standaard. */
export const SOORTEN_BOUWWERK: readonly Meertalig[] = stLijst("soortenBouwwerk");

const NORMEN = st("normen");
const EERSTE_UITGAVE = st("eersteUitgave");
const NIET_VAN_TOEPASSING = st("nietVanToepassing");

const MATERIAAL_TYPE = stLijst("materiaalType");
const MATERIAAL_OPMERKING = stLijst("materiaalOpmerking");
/** 4.3: de standaardregels; de sterkteklassen zijn codes en blijven in elke taal gelijk. */
const MATERIALEN: readonly { type: Meertalig; soort: string; opmerking: Meertalig | string }[] = [
  { type: MATERIAAL_TYPE[0], soort: "C20/25", opmerking: MATERIAAL_OPMERKING[0] },
  { type: MATERIAAL_TYPE[1], soort: "C24", opmerking: "" },
  { type: MATERIAAL_TYPE[2], soort: "CE2+", opmerking: "" },
  { type: MATERIAAL_TYPE[3], soort: "B500", opmerking: "" },
  { type: MATERIAAL_TYPE[4], soort: "S235", opmerking: "JR" },
  { type: MATERIAAL_TYPE[5], soort: "K50", opmerking: "" },
];
const MATERIALEN_NOOT = st("materialenNoot");
const BEVESTIGING_TYPE = stLijst("bevestiging");
const BEVESTIGING: readonly { type: Meertalig; kwaliteit: string }[] = [
  { type: BEVESTIGING_TYPE[0], kwaliteit: "8.8" },
  { type: BEVESTIGING_TYPE[1], kwaliteit: "4.6" },
  { type: BEVESTIGING_TYPE[2], kwaliteit: "5.8" },
];
const CONSERVERING_ONDERDEEL = stLijst("conserveringOnderdeel");
const CONSERVERING_SYSTEEM = stLijst("conserveringSysteem");
const CONSERVERING: readonly { onderdeel: Meertalig; systeem: Meertalig }[] =
  CONSERVERING_ONDERDEEL.map((onderdeel, i) => ({ onderdeel, systeem: CONSERVERING_SYSTEEM[i] }));
const CONSERVERING_SLOT = st("conserveringSlot");
const VERVORMING_ONDERDEEL = stLijst("vervormingOnderdeel");
/** 4.8: de eisen zijn getallen en symbolen; die krijgen de notatie van de taal (standaardVervormingen). */
const VERVORMINGEN: readonly { onderdeel: Meertalig; ueind: string; ubij: string; uhor: string }[] = [
  { onderdeel: VERVORMING_ONDERDEEL[0], ueind: "0,004l_rep", ubij: "0,004l_rep", uhor: "" },
  { onderdeel: VERVORMING_ONDERDEEL[1], ueind: "0,004l_rep", ubij: "0,003l_rep", uhor: "" },
  { onderdeel: VERVORMING_ONDERDEEL[2], ueind: "", ubij: "0,002l_rep", uhor: "" },
  { onderdeel: VERVORMING_ONDERDEEL[3], ueind: "", ubij: "", uhor: "H/300" },
  { onderdeel: VERVORMING_ONDERDEEL[4], ueind: "", ubij: "", uhor: "< 20 mm" },
];

const meertalig = (x: Meertalig | string): x is Meertalig => typeof x !== "string";

/** Per veld wat de app er kan neerzetten; wisselTaal zoekt hierin (taalwissel.ts). */
export const MEEGELEVERD = {
  titel: TITELS,
  normen: [NORMEN, ...LANDEN.filter((l) => l.normenTekst.en !== NORMEN.en).map((l) => l.normenTekst), TWEEDE_GENERATIE_TEKST],
  rol: ROLLEN,
  architect: [NIET_VAN_TOEPASSING],
  datumOnderlegger: [NIET_VAN_TOEPASSING],
  soortBouwwerk: SOORTEN_BOUWWERK,
  revisie: [EERSTE_UITGAVE],
  materiaalType: MATERIALEN.map((m) => m.type),
  materiaalOpmerking: MATERIALEN.map((m) => m.opmerking).filter(meertalig),
  materialenNoot: [MATERIALEN_NOOT],
  bevestiging: BEVESTIGING.map((b) => b.type),
  conserveringOnderdeel: CONSERVERING.map((c) => c.onderdeel),
  conserveringSysteem: CONSERVERING.map((c) => c.systeem),
  conserveringSlot: [CONSERVERING_SLOT],
  vervormingOnderdeel: VERVORMINGEN.map((v) => v.onderdeel),
  factorNaam: EN1990_FACTOREN.map((f) => f.naam),
  psiNaam: EN1990_PSI.map((p) => p.naam),
} as const satisfies Record<string, readonly Meertalig[]>;

/**
 * Schrijft deze taal een getal met een decimale komma? Dat staat in de lijst van talen
 * (i18n/talen.ts). Het vaste getal in een meegeleverde waarde staat hier met een komma.
 */
export function decimaleKomma(taal: string): boolean {
  return kommaTaal(taal);
}

/**
 * Een getal als tekst in de notatie van de taal, ook binnen een eis als "0,004l_rep":
 * alleen een scheidingsteken tussen twee cijfers verandert. Voor wat de app meelevert en
 * bij het wisselen van taal; invoer op zich blijft staan zoals hij getypt is.
 */
export function inNotatie(s: string, taal: string): string {
  return decimaleKomma(taal) ? s.replace(/(\d)\.(\d)/g, "$1,$2") : s.replace(/(\d),(\d)/g, "$1.$2");
}

// ── Standaardwaarden ────────────────────────────────────────────────────────
// Elke aanroep bouwt verse objecten en lijsten: een rapport dat de store
// bijwerkt mag nooit een lijst delen met het volgende nieuwe rapport.

function standaardRol(taal: string): Rol {
  return { rol: inTaal(ROLLEN[0], taal), architect: inTaal(NIET_VAN_TOEPASSING, taal), datumOnderlegger: inTaal(NIET_VAN_TOEPASSING, taal) };
}

/** 4.3: de standaardregels, met de klassen uit de EN. */
export function standaardMaterialen(taal: string): Materiaalregel[] {
  return MATERIALEN.map((m) => ({
    type: inTaal(m.type, taal),
    soort: m.soort,
    opmerking: typeof m.opmerking === "string" ? m.opmerking : inTaal(m.opmerking, taal),
  }));
}

export function standaardBevestiging(taal: string): Bevestigingsregel[] {
  return BEVESTIGING.map((b) => ({ type: inTaal(b.type, taal), kwaliteit: b.kwaliteit }));
}

/** 4.8: de eisen die de Nederlandse bijlage geeft, in de notatie van de taal. */
export function standaardVervormingen(taal: string): Vervormingsregel[] {
  // `_rep` blijft tekst: de afdruk zet het als subscript.
  return VERVORMINGEN.map((v) => ({
    onderdeel: inTaal(v.onderdeel, taal),
    ueind: inNotatie(v.ueind, taal),
    ubij: inNotatie(v.ubij, taal),
    uhor: inNotatie(v.uhor, taal),
  }));
}

function standaardUitgangspunten(taal: string): Uitgangspunten {
  return {
    soortBouwwerk: inTaal(SOORTEN_BOUWWERK[0], taal),
    brand: { hoofddraagconstructie: "-", brandscheiding: "-", vluchtroute: "-", verwijzing: "" },
    materialen: standaardMaterialen(taal),
    materialenNoot: inTaal(MATERIALEN_NOOT, taal),
    bevestiging: standaardBevestiging(taal),
    conservering: CONSERVERING.map((c) => ({ onderdeel: inTaal(c.onderdeel, taal), systeem: inTaal(c.systeem, taal) })),
    conserveringSlot: inTaal(CONSERVERING_SLOT, taal),
    bestaand: {
      opnemen: false, bouwjaar: "", bron: "",
      // Een code: de afdruk zet hem in de taal van het rapport.
      berekeningBeschikbaar: "Ja", materiaalgegevensBeschikbaar: "Ja",
    },
    vervormingen: standaardVervormingen(taal),
  };
}

/** 5.2: de coëfficiënten waarmee een nieuw rapport begint. */
export function standaardWindcoefficienten(taal: string): Windcoefficient[] {
  return ["0,04", "0,40", "0,80", "1,10"].map((c) => ({ omschrijving: "", c: inNotatie(c, taal) }));
}

function standaardBelastingen(taal: string): Belastingen {
  const n = (s: string) => inNotatie(s, taal);
  return {
    wind: {
      gebouwhoogte: "",
      cscd: "1",
      coefficienten: standaardWindcoefficienten(taal),
    },
    klassen: [
      { categorie: "A-vloer", lichteScheidingswanden: n("0,80"), dakhelling: "", qlast: "", symbool: "q_k1" },
      { categorie: "H-dak", lichteScheidingswanden: "", dakhelling: "0", qlast: n("2,0"), symbool: "q_k2" },
    ],
    vloerenDaken: [],
    wanden: [],
  };
}

/** Een nieuw rapport in deze taal. `vandaag` in dd-mm-jjjj; `teksten` komen uit de standaardteksten. */
export function standaardRapport(vandaag: string, teksten: Record<string, string>, taal = "en"): Rapport {
  return {
    versie: RAPPORT_VERSIE,
    taal,
    tekstTaal: {},
    titel: inTaal(TITELS[0], taal),
    kenmerk: "",
    fase: "",
    normen: inTaal(NORMEN, taal),
    opdrachtgeverAdres: "",
    verantwoordelijk: "",
    uitvoerend: "",
    revisies: [{ code: "A", datum: vandaag, omschrijving: inTaal(EERSTE_UITGAVE, taal), status: "concept" }],
    teksten: { ...teksten },
    rol: standaardRol(taal),
    uitgangspunten: standaardUitgangspunten(taal),
    belastingen: standaardBelastingen(taal),
    beelden: {},
    toelichting: {},
    inHoofdstuk: {},
    bladVoor: {},
    bladRol: {},
    bijlagen: [],
    nieuwePagina: {},
    opmaak: { constructieprincipe: true, subkoppen: true, bladenInInhoud: true },
    bureau: leegBureau(),
  };
}

// ── Normaliseren ────────────────────────────────────────────────────────────
// Een rapport komt uit een projectbestand of uit de opslag, en dus mogelijk
// van een oudere of nieuwere versie, of met de hand bewerkt. Alles wordt per
// veld gecontroleerd: wat ontbreekt of een verkeerd type heeft wordt de
// standaard, onbekende velden vallen weg, en lijsten houden alleen de
// elementen die een object zijn. Een lege tekst ("") is wél geldig: die heeft
// de gebruiker zelf leeggemaakt. Een rapport van een oudere versie van de
// rapportopbouw (RAPPORT_VERSIE) houdt zijn opmaak: wat bij die versie de
// standaard was, wordt een eigen keuze in het rapport.

type Los = Record<string, unknown>;

/** Een gewoon object (geen lijst, geen null), anders undefined. */
function object(x: unknown): Los | undefined {
  return x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Los) : undefined;
}

function tekst(x: unknown, standaard: string): string {
  return typeof x === "string" ? x : standaard;
}

/**
 * Een lijst uit het bestand. Geen lijst → de standaard; wel een lijst → alleen
 * de elementen die een object zijn, elk genormaliseerd. `normaliseer` mag een
 * element afwijzen met null (bijvoorbeeld een opbouw van een onbekende soort).
 */
function lijst<T>(x: unknown, standaard: T[], normaliseer: (o: Los) => T | null): T[] {
  if (!Array.isArray(x)) return standaard;
  const uit: T[] = [];
  for (const el of x) {
    const o = object(el);
    if (!o) continue;
    const n = normaliseer(o);
    if (n !== null) uit.push(n);
  }
  return uit;
}

/** Tekstwaarden per sleutel, over `basis` heen; andere typen vallen weg. */
function tekstRecord(x: unknown, basis: Record<string, string> = {}): Record<string, string> {
  const uit: Record<string, string> = { ...basis };
  const o = object(x);
  if (o) for (const [k, v] of Object.entries(o)) if (typeof v === "string") uit[k] = v;
  return uit;
}

/** Afbeeldingen per tekst-id. Wat geen PNG of JPEG is, valt weg; een lege lijst ook. */
function beeldenRecord(x: unknown): Record<string, Rapportbeeld[]> {
  const uit: Record<string, Rapportbeeld[]> = {};
  const o = object(x);
  if (!o) return uit;
  for (const [k, v] of Object.entries(o)) {
    const beelden = lijst<Rapportbeeld>(v, [], (b) => {
      if (!isBeeldData(b.data)) return null;
      const breedte = typeof b.breedte === "number" && Number.isFinite(b.breedte) ? b.breedte : Number(b.breedte);
      return {
        data: b.data,
        bijschrift: tekst(b.bijschrift, ""),
        breedte: Number.isFinite(breedte) && breedte > 0
          ? Math.round(Math.min(BEELD_BREEDTE.max, Math.max(BEELD_BREEDTE.min, breedte)))
          : BEELD_BREEDTE.standaard,
      };
    });
    if (beelden.length) uit[k] = beelden;
  }
  return uit;
}

/** Ja/nee-waarden per sleutel; andere typen vallen weg. */
function waarheidRecord(x: unknown): Record<string, boolean> {
  const uit: Record<string, boolean> = {};
  const o = object(x);
  if (o) for (const [k, v] of Object.entries(o)) if (typeof v === "boolean") uit[k] = v;
  return uit;
}

/** Symbool en plek van een blok; een plek alleen als beide maten een getal zijn. */
function blokplek(o: Los): Blokplek {
  const uit: Blokplek = {};
  if (typeof o.symbool === "string" && o.symbool.trim()) uit.symbool = o.symbool.trim();
  if (typeof o.x === "number" && typeof o.y === "number" && Number.isFinite(o.x) && Number.isFinite(o.y)) {
    uit.x = Math.max(0, o.x);
    uit.y = Math.max(0, o.y);
  }
  return uit;
}

function normaliseerOpbouw(o: Los): Opbouw | null {
  const naam = tekst(o.naam, "");
  if (o.soort === "vlak") {
    return {
      ...blokplek(o),
      soort: "vlak", naam,
      lagen: lijst(o.lagen, [], (l): Laag => ({
        naam: tekst(l.naam, ""), d: tekst(l.d, ""), rho: tekst(l.rho, ""), p: tekst(l.p, ""),
      })),
    };
  }
  if (o.soort === "gevel") {
    return {
      ...blokplek(o),
      soort: "gevel", naam,
      lagen: lijst(o.lagen, [], (l): Gevellaag => ({
        naam: tekst(l.naam, ""), p: tekst(l.p, ""), h: tekst(l.h, ""), vulling: tekst(l.vulling, ""),
      })),
    };
  }
  return null;
}

function normaliseerBlok(x: unknown): LokaalBlok {
  const o = object(x) ?? {};
  return { waarden: tekstRecord(o.waarden), bron: tekst(o.bron, "") };
}

/** De lokale invoer uit een bestand: alleen landen uit de lijst, en elk veld gecontroleerd. */
function normaliseerLokaal(x: unknown): Record<string, LokaleInvoer> | undefined {
  const o = object(x);
  if (!o) return undefined;
  const uit: Record<string, LokaleInvoer> = {};
  for (const [code, v] of Object.entries(o)) {
    const l = object(v);
    if (!l || !LANDEN.some((land) => land.code === code)) continue;
    uit[code] = {
      veiligheid: tekst(l.veiligheid, ""),
      wind: { ...normaliseerBlok(l.wind), q: tekst(object(l.wind)?.q, "") },
      sneeuw: { ...normaliseerBlok(l.sneeuw), s: tekst(object(l.sneeuw)?.s, "") },
      aardbeving: normaliseerBlok(l.aardbeving),
      factoren: lijst(l.factoren, [], (r): Factorregel => ({
        groep: tekst(r.groep, ""), naam: tekst(r.naam, ""), gGinf: tekst(r.gGinf, ""), gGsup: tekst(r.gGsup, ""), gQ1: tekst(r.gQ1, ""), gQi: tekst(r.gQi, ""),
      })),
      psi: lijst(l.psi, [], (r): Psiregel => ({ naam: tekst(r.naam, ""), psi0: tekst(r.psi0, ""), psi1: tekst(r.psi1, ""), psi2: tekst(r.psi2, "") })),
      combinaties: lijst(l.combinaties, [], (r): Combinatieregel => ({ naam: tekst(r.naam, ""), formule: tekst(r.formule, "") })),
      klassen: lijst(l.klassen, [], (r): LokaleKlasse => ({ omschrijving: tekst(r.omschrijving, ""), qk: tekst(r.qk, ""), Qk: tekst(r.Qk, "") })),
    };
  }
  return Object.keys(uit).length > 0 ? uit : undefined;
}

/**
 * Een bureauprofiel uit een bestand of de instellingen. Huisstijlvelden die
 * leeg zijn krijgen de standaard: een lege kleur of een leeg lettertype is
 * nooit bedoeld en zou de afdruk kleurloos maken.
 */
export function normaliseerBureau(x: unknown): BureauProfiel {
  const s = leegBureau();
  const o = object(x);
  if (!o) return s;
  const h = object(o.huisstijl) ?? {};
  const stijl = (v: unknown, standaard: string) => tekst(v, standaard) || standaard;
  return {
    naam: tekst(o.naam, ""),
    adres: tekst(o.adres, ""),
    postcode: tekst(o.postcode, ""),
    plaats: tekst(o.plaats, ""),
    telefoon: tekst(o.telefoon, ""),
    email: tekst(o.email, ""),
    logo: tekst(o.logo, ""),
    logoInKop: o.logoInKop !== false,
    voetafbeelding: tekst(o.voetafbeelding, ""),
    ...(tekst(o.kopTekst, "").trim() ? { kopTekst: tekst(o.kopTekst, "") } : {}),
    ...(tekst(o.voetTekst, "").trim() ? { voetTekst: tekst(o.voetTekst, "") } : {}),
    huisstijl: {
      hoofdkleur: stijl(h.hoofdkleur, s.huisstijl.hoofdkleur),
      accentkleur: stijl(h.accentkleur, s.huisstijl.accentkleur),
      tabeltekst: stijl(h.tabeltekst, s.huisstijl.tabeltekst),
      invoerkleur: stijl(h.invoerkleur, s.huisstijl.invoerkleur),
      lettertype: stijl(h.lettertype, s.huisstijl.lettertype),
    },
    constructeurs: lijst(o.constructeurs, [], (c): Constructeur => ({
      naam: tekst(c.naam, ""), telefoon: tekst(c.telefoon, ""), email: tekst(c.email, ""),
    })),
  };
}

/** Een kleur die veilig in een stijlregel kan: geen url() en geen tweede declaratie. */
const VEILIGE_KLEUR = /^(?:#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,30}|(?:rgb|hsl)a?\([\d\s.,%/]+\))$/;

/**
 * Een huisstijl uit een bestand dat van iemand anders kan komen. Wat niet veilig in een
 * stijlregel kan, wordt de standaard. Geen object: undefined.
 */
export function leesHuisstijl(x: unknown): Huisstijl | undefined {
  const o = object(x);
  if (!o) return undefined;
  const s = STANDAARD_HUISSTIJL;
  const kleur = (v: unknown, standaard: string) => (typeof v === "string" && VEILIGE_KLEUR.test(v) ? v : standaard);
  const letter = typeof o.lettertype === "string"
    ? (LETTERTYPEN.some((l) => l.css === o.lettertype) ? o.lettertype : veiligLettertype(o.lettertype))
    : "";
  return {
    hoofdkleur: kleur(o.hoofdkleur, s.hoofdkleur),
    accentkleur: kleur(o.accentkleur, s.accentkleur),
    tabeltekst: kleur(o.tabeltekst, s.tabeltekst),
    invoerkleur: kleur(o.invoerkleur, s.invoerkleur),
    lettertype: letter || s.lettertype,
  };
}

/** Een herkomst uit een bestand; zonder leesbare naam geen herkomst. */
export function leesHerkomst(x: unknown): TemplateHerkomst | undefined {
  const o = object(x);
  const naam = o && leesMeertalig(o.naam);
  if (!o || !naam) return undefined;
  const land = leesLand(o.land);
  return land ? { naam, land } : { naam };
}

/** Een landcode uit een bestand of template; iets anders dan een code uit de lijst (normen/landen.ts) geeft undefined. */
export function leesLand(x: unknown): string | undefined {
  return LANDEN.find((l) => l.code === x)?.code;
}

/**
 * De velden van een eigen template in een rapport. Alleen wat er is en klopt komt terug: een
 * rapport zonder template krijgt er geen enkel veld bij, en een opzet die alleen uit onzin
 * bestaat geeft het ingebouwde template. Een lege lijst is wel een keuze.
 */
function templateVelden(o: Los): Partial<Rapport> {
  const uit: Partial<Rapport> = {};
  if (Array.isArray(o.opzet)) {
    const { opzet } = normaliseerOpzet(o.opzet);
    if (opzet.length > 0 || o.opzet.length === 0) uit.opzet = opzet;
  }
  const varianten = leesVarianten(o.varianten);
  if (Object.keys(varianten).length > 0) uit.varianten = varianten;
  const weggehaald = leesWeggehaald(o.weggehaald);
  if (weggehaald.length > 0) uit.weggehaald = weggehaald;
  const template = leesHerkomst(o.template);
  if (template) uit.template = template;
  const huisstijl = leesHuisstijl(o.huisstijl);
  if (huisstijl) uit.huisstijl = huisstijl;
  return uit;
}

/**
 * Een rapport uit een bestand of de opslag, aangevuld met standaardwaarden. Onbekende
 * velden vallen weg; verkeerde typen worden standaard. Geneste objecten en lijsten
 * worden per veld gecontroleerd.
 *
 * `teksten` mag een functie van de taal zijn, zodat ontbrekende teksten in de taal van
 * dit rapport komen. `nieuweTaal` geldt als er geen rapport is en voor een rapport van
 * deze versie zonder bruikbare taal; een rapport van vóór versie 5 is Nederlands.
 */
export function normaliseerRapport(
  x: unknown,
  vandaag: string,
  teksten: Record<string, string> | ((taal: string) => Record<string, string>),
  nieuweTaal = "en",
): Rapport {
  const o = object(x);
  // Zonder geldig versienummer: een rapport van vóór versie 2.
  const versie = o && typeof o.versie === "number" && Number.isInteger(o.versie) && o.versie >= 1 ? o.versie : 1;
  const taal = !o ? nieuweTaal : leesTaal(o.taal) ?? (versie < 5 ? "nl" : nieuweTaal);
  const s = standaardRapport(vandaag, typeof teksten === "function" ? teksten(taal) : teksten, taal);
  if (!o) return s;

  const rol = object(o.rol) ?? {};
  const u = object(o.uitgangspunten) ?? {};
  const su = s.uitgangspunten;
  const brand = object(u.brand) ?? {};
  const bestaand = object(u.bestaand) ?? {};
  const b = object(o.belastingen) ?? {};
  const sb = s.belastingen;
  const wind = object(b.wind) ?? {};

  const nieuwePagina = waarheidRecord(o.nieuwePagina);
  // Versie 2 zette Projectgegevens standaard op een nieuwe pagina; een ouder
  // rapport zonder eigen keuze loopt door na de inleiding, zoals het was.
  if (versie < 2 && nieuwePagina.projectgegevens === undefined) nieuwePagina.projectgegevens = false;
  // Versie 3 bracht de kop Constructieprincipe en de subkoppen; een ouder
  // rapport zonder eigen keuze houdt de kop Wijziging en tekst zonder subkoppen.
  const opmaak = object(o.opmaak) ?? {};
  const keuze = (x: unknown, standaard: boolean) => (typeof x === "boolean" ? x : versie < 3 ? false : standaard);
  const lokaal = normaliseerLokaal(o.lokaal);
  const situatie = normaliseerSituatie(o.situatie);

  return {
    // Een nieuwer rapport houdt zijn hogere versie: zijn eigen bijwerkingen zijn al gedaan.
    versie: Math.max(versie, RAPPORT_VERSIE),
    taal,
    tekstTaal: Object.fromEntries(Object.entries(tekstRecord(o.tekstTaal)).filter(([, t]) => leesTaal(t) !== undefined)),
    titel: tekst(o.titel, s.titel),
    kenmerk: tekst(o.kenmerk, s.kenmerk),
    fase: FASEN.includes(o.fase as Fase) ? (o.fase as Fase) : "",
    normen: tekst(o.normen, s.normen),
    opdrachtgeverAdres: tekst(o.opdrachtgeverAdres, s.opdrachtgeverAdres),
    verantwoordelijk: tekst(o.verantwoordelijk, s.verantwoordelijk),
    uitvoerend: tekst(o.uitvoerend, s.uitvoerend),
    revisies: lijst(o.revisies, s.revisies, (r): Revisie => ({
      code: tekst(r.code, ""),
      datum: tekst(r.datum, ""),
      omschrijving: tekst(r.omschrijving, ""),
      status: REVISIE_STATUSSEN.includes(r.status as RevisieStatus) ? (r.status as RevisieStatus) : "concept",
    })),
    // Over de standaardteksten heen: een tekst-id die in het bestand ontbreekt
    // (ouder bestand, of een onderdeel dat later is bijgekomen) krijgt zo zijn
    // standaardtekst, terwijl een bewust leeggemaakte tekst ("") leeg blijft.
    teksten: tekstRecord(o.teksten, s.teksten),
    rol: {
      rol: tekst(rol.rol, s.rol.rol),
      architect: tekst(rol.architect, s.rol.architect),
      datumOnderlegger: tekst(rol.datumOnderlegger, s.rol.datumOnderlegger),
    },
    uitgangspunten: {
      soortBouwwerk: tekst(u.soortBouwwerk, su.soortBouwwerk),
      brand: {
        hoofddraagconstructie: tekst(brand.hoofddraagconstructie, su.brand.hoofddraagconstructie),
        brandscheiding: tekst(brand.brandscheiding, su.brand.brandscheiding),
        vluchtroute: tekst(brand.vluchtroute, su.brand.vluchtroute),
        verwijzing: tekst(brand.verwijzing, su.brand.verwijzing),
      },
      materialen: lijst(u.materialen, su.materialen, (m): Materiaalregel => ({
        type: tekst(m.type, ""), soort: tekst(m.soort, ""), opmerking: tekst(m.opmerking, ""),
      })),
      materialenNoot: tekst(u.materialenNoot, su.materialenNoot),
      bevestiging: lijst(u.bevestiging, su.bevestiging, (m): Bevestigingsregel => ({
        type: tekst(m.type, ""), kwaliteit: tekst(m.kwaliteit, ""),
      })),
      conservering: lijst(u.conservering, su.conservering, (m): Conserveringsregel => ({
        onderdeel: tekst(m.onderdeel, ""), systeem: tekst(m.systeem, ""),
      })),
      conserveringSlot: tekst(u.conserveringSlot, su.conserveringSlot),
      bestaand: {
        opnemen: typeof bestaand.opnemen === "boolean" ? bestaand.opnemen : su.bestaand.opnemen,
        bouwjaar: tekst(bestaand.bouwjaar, su.bestaand.bouwjaar),
        bron: tekst(bestaand.bron, su.bestaand.bron),
        berekeningBeschikbaar: tekst(bestaand.berekeningBeschikbaar, su.bestaand.berekeningBeschikbaar),
        materiaalgegevensBeschikbaar: tekst(bestaand.materiaalgegevensBeschikbaar, su.bestaand.materiaalgegevensBeschikbaar),
      },
      vervormingen: lijst(u.vervormingen, su.vervormingen, (v): Vervormingsregel => ({
        onderdeel: tekst(v.onderdeel, ""), ueind: tekst(v.ueind, ""), ubij: tekst(v.ubij, ""), uhor: tekst(v.uhor, ""),
      })),
    },
    belastingen: metSymbolen({
      wind: {
        gebouwhoogte: tekst(wind.gebouwhoogte, sb.wind.gebouwhoogte),
        cscd: tekst(wind.cscd, sb.wind.cscd),
        coefficienten: lijst(wind.coefficienten, sb.wind.coefficienten, (c): Windcoefficient => ({
          omschrijving: tekst(c.omschrijving, ""), c: tekst(c.c, ""),
        })),
      },
      klassen: lijst(b.klassen, sb.klassen, (k): Belastingklasse => ({
        categorie: tekst(k.categorie, ""),
        lichteScheidingswanden: tekst(k.lichteScheidingswanden, ""),
        dakhelling: tekst(k.dakhelling, ""),
        qlast: tekst(k.qlast, ""),
        // Alleen als er iets staat: een rapport zonder eigen waarden blijft zoals het was.
        ...(tekst(k.qk, "").trim() ? { qk: tekst(k.qk, "") } : {}),
        ...(tekst(k.Qk, "").trim() ? { Qk: tekst(k.Qk, "") } : {}),
        ...(typeof k.symbool === "string" && k.symbool.trim() ? { symbool: k.symbool.trim() } : {}),
      })),
      vloerenDaken: lijst(b.vloerenDaken, sb.vloerenDaken, normaliseerOpbouw),
      wanden: lijst(b.wanden, sb.wanden, normaliseerOpbouw),
    }),
    beelden: beeldenRecord(o.beelden),
    toelichting: tekstRecord(o.toelichting),
    inHoofdstuk: waarheidRecord(o.inHoofdstuk),
    bladVoor: tekstRecord(o.bladVoor),
    ...(o.uitBladen === true ? { uitBladen: true } : {}),
    bladRol: tekstRecord(o.bladRol),
    ...(o.huisstijlBron === "openaec" ? { huisstijlBron: "openaec" as const } : {}),
    bijlagen: Array.isArray(o.bijlagen) ? o.bijlagen.filter((t): t is string => typeof t === "string") : s.bijlagen,
    nieuwePagina,
    opmaak: {
      constructieprincipe: keuze(opmaak.constructieprincipe, s.opmaak.constructieprincipe),
      subkoppen: keuze(opmaak.subkoppen, s.opmaak.subkoppen),
      bladenInInhoud: typeof opmaak.bladenInInhoud === "boolean" ? opmaak.bladenInInhoud : versie >= 4 && s.opmaak.bladenInInhoud,
      ...(opmaak.bijlageParagrafen === false ? { bijlageParagrafen: false } : {}),
    },
    ...(situatie ? { situatie } : {}),
    bureau: normaliseerBureau(o.bureau),
    // Alleen als het er is: zonder blijft een oud rapport tot op het veld hetzelfde.
    ...(lokaal ? { lokaal } : {}),
    ...templateVelden(o),
  };
}
