/**
 * Meegeleverde tekstvarianten per tekstonderdeel van het rapport.
 *
 * Engels is de bron, Nederlands een vertaling (meertalig.ts). Een rapport bewaart de tekst
 * in zijn eigen taal; wisselen van taal zoekt de variant in welke taal dan ook
 * (taalwissel.ts). Daarom moet elke variant in elke taal uniek zijn binnen zijn tekst-id.
 *
 * Neutraal geformuleerd: geen bureau-, persoons-, project- of productnamen.
 * Wat per project of bureau verschilt gaat via invulvelden ({adviseur},
 * {projectnaam}, … — zie invullen.ts). Een bureau legt zijn eigen varianten
 * vast in de instellingen; die komen in het keuzemenu naast deze.
 *
 * De tekst-ids zijn de knoop-ids uit opzet.ts. Regelopmaak (invullen.ts): een
 * regel is een rij in het rapport, een lege regel een nieuwe alinea, een regel
 * die met "-" begint een opsommingsregel, een korte regel die op ":" eindigt
 * een vette subkop. Een meegeleverde tekst heeft geen subkoppen: een zin die
 * op ":" eindigt is hier altijd een inleidende zin van meer dan vijf woorden.
 */
import { inTaal, leesMeertalig, type Meertalig } from "./meertalig.ts";
import { heeftSleutel, isGeldigId } from "./opzet.ts";

export interface Tekstvariant { label: Meertalig; tekst: Meertalig; }

/** Eén variant: label en tekst in het Engels, dan in het Nederlands. */
const v = (labelEn: string, labelNl: string, en: string | string[], nl: string | string[]): Tekstvariant => ({
  label: { en: labelEn, nl: labelNl },
  tekst: {
    en: Array.isArray(en) ? en.join("\n") : en,
    nl: Array.isArray(nl) ? nl.join("\n") : nl,
  },
});

/** Per tekst-id de meegeleverde varianten; de eerste is de standaard in een nieuw rapport. */
export const STANDAARD_TEKSTEN: Record<string, readonly Tekstvariant[]> = {
  // ── 1 Inleiding ──
  inleiding: [
    v("Main calculation", "Hoofdberekening",
      [
        "At the request of the client, {adviseur} presents structural advice for the above project in this report.",
        "",
        "The advice is based on the information provided.",
        "",
        "This report contains the main calculation of the structure.",
        "For the detailed engineering, additional calculations are still to be carried out by others and reviewed by {adviseur}:",
        "-Drawings and calculations of proprietary floor systems;",
        "-Drawings and calculations of the steel structure;",
        "-Cone penetration tests and foundation advice;",
      ],
      [
        "Ten behoeve van het genoemde project brengt {adviseur} op verzoek van de opdrachtgever in dit rapport een constructieadvies uit.",
        "",
        "Het advies is gebaseerd op de verstrekte gegevens.",
        "",
        "Dit rapport omvat de hoofdberekening van de constructie.",
        "Voor de detailengineering dienen nog aanvullende berekeningen door derden te worden uitgevoerd, die door {adviseur} worden gecontroleerd:",
        "-Tekeningen en berekeningen systeemvloeren;",
        "-Tekeningen en berekeningen staalconstructie;",
        "-Sondering en funderingsadvies;",
      ]),
    v("Design basis only", "Alleen uitgangspunten",
      [
        "At the request of the client, {adviseur} presents structural advice for the above project in this report.",
        "",
        "The advice is based on the information provided.",
        "",
        "This report sets out the design basis of the structure.",
      ],
      [
        "Ten behoeve van het genoemde project brengt {adviseur} op verzoek van de opdrachtgever in dit rapport een constructieadvies uit.",
        "",
        "Het advies is gebaseerd op de verstrekte gegevens.",
        "",
        "Dit rapport omvat de uitgangspunten van de constructie.",
      ]),
  ],

  // ── 2 Projectgegevens ──
  projectomschrijving: [
    v("Extension", "Aanbouw", "The project comprises the construction of an extension.", "Het project omvat het realiseren van een aanbouw."),
    v("Roof extension", "Dakopbouw", "The project comprises the construction of a roof extension.", "Het project omvat het realiseren van een dakopbouw."),
    v("New house", "Nieuwbouw woning", "The project comprises the construction of a new house.", "Het project omvat het realiseren van een woonhuis."),
    v("Alteration", "Verbouwing", "The project comprises the alteration of an existing building.", "Het project omvat de verbouwing van een bestaand pand."),
  ],
  rol: [
    v("Commission: structural advice", "Opdracht constructieadvies",
      "{adviseur} has been commissioned to provide the structural advice for this project.",
      "{adviseur} heeft opdracht voor het constructieadvies voor dit project."),
    v("Commission: independent check", "Opdracht toetsing",
      "{adviseur} has been commissioned to check the structure of this project.",
      "{adviseur} heeft opdracht voor het toetsen van de constructie van dit project."),
  ],

  // ── 3.1 Toelichting constructie: bestaande situatie ──
  "bestaand-verticaal": [
    v("Timber joists on masonry", "Houten balklagen op metselwerk",
      "The floors consist of timber joists. These transfer the loads through the masonry walls to the foundation.",
      "De vloeren bestaan uit houten balklagen. Deze dragen via de gemetselde bouwmuren af naar de fundering."),
    v("Purlin roof and timber joists", "Gordingenkap en houten balklagen",
      "The roof is a purlin roof. The floors consist of timber joists.\nThese transfer the loads through the masonry walls and a loadbearing internal wall to the foundation.",
      "Het dak bestaat uit een gordingenkap. De vloeren bestaan uit houten balklagen.\nDeze dragen via de gemetselde bouwmuren en een dragende tussenwand af naar de fundering."),
    v("Concrete floors on loadbearing walls", "Betonvloeren op dragende wanden",
      "The floors are concrete floors. These transfer the loads through the loadbearing walls to the foundation.",
      "De vloeren bestaan uit betonvloeren. Deze dragen via de dragende wanden af naar de fundering."),
  ],
  "bestaand-stabiliteit": [
    v("Masonry walls", "Gemetselde bouwmuren", "Stability is provided by the masonry walls.", "De stabiliteit wordt verzorgd door de gemetselde bouwmuren."),
    v("Shear walls and diaphragm action", "Stabiliteitswanden en schijfwerking",
      "Stability is provided by the shear walls, in combination with the diaphragm action of the floors.",
      "De stabiliteit wordt verzorgd door de stabiliteitswanden, in combinatie met de schijfwerking van de vloeren."),
  ],
  "bestaand-fundatie": [
    v("Unknown, presumably shallow", "Onbekend, vermoedelijk op staal",
      "No archive information is available. The building presumably has a shallow foundation.",
      "Er zijn geen archiefgegevens bekend. Vermoedelijk is het gebouw op staal gefundeerd."),
    v("Shallow foundation", "Op staal",
      "According to the archive information, the building has a shallow foundation.",
      "Het gebouw is volgens de archiefgegevens op staal gefundeerd."),
    v("Piled foundation", "Op palen",
      "According to the archive information, the building has a piled foundation.",
      "Het gebouw is volgens de archiefgegevens op palen gefundeerd."),
  ],
  "bestaand-beoordeling": [
    v("No reason for doubt", "Geen aanleiding tot twijfel",
      "There is no reason to doubt the quality of construction of the existing structure.",
      "Er is geen aanleiding om te twijfelen aan de bouwkwaliteit van de bestaande constructie."),
    v("Assess on site", "Beoordelen in het werk",
      "The condition of the existing structure is not known. It will be assessed on site before the works start.",
      "De staat van de bestaande constructie is niet bekend. Deze wordt voor aanvang van de werkzaamheden in het werk beoordeeld."),
  ],

  // ── 3.1 Toelichting constructie: wijziging en belendingen ──
  wijziging: [
    v("Opening in a loadbearing wall", "Doorbraak in dragende wand",
      [
        "An opening is made in a loadbearing wall, with a steel portal frame.",
        "Stability is provided by the remaining part of the wall.",
        "Vertical loads are transferred to the existing foundation through the columns and the lower beam.",
      ],
      [
        "Er wordt een doorbraak gemaakt in een dragende wand met een stalen portaal.",
        "De stabiliteit wordt verzorgd door het resterende deel van de wand.",
        "De verticale belastingafdracht naar de fundering gaat via de kolommen en de onderligger naar de bestaande fundering.",
      ]),
    v("Extension with timber joists", "Aanbouw met houten balklaag",
      "The extension has a timber joist roof, which transfers the loads through loadbearing walls to a new shallow foundation.",
      "De aanbouw wordt gerealiseerd met een houten balklaag als dak, die via dragende wanden afdraagt naar een nieuwe fundering op staal."),
  ],
  belendingen: [
    v("Not considered", "Niet beschouwd",
      "The structural influence of adjoining buildings is not considered in this calculation.",
      "De constructieve invloed van belendingen is in deze berekening niet beschouwd."),
  ],

  // ── 3.2 Aandachtspunten bij uitvoering ──
  "uitvoering-bestaand": [
    v("Check dimensions", "Maatvoering controleren",
      "-Dimensions are based on archive documents and/or the architect's drawing.\n-Dimensions must be verified on site.",
      "-Maatvoering is gebaseerd op archiefstukken en/of de tekening van de architect.\n-Maatvoering moet in het werk worden gecontroleerd."),
  ],
  "uitvoering-verbouw": [
    v("Propping at new openings", "Stempelen bij nieuwe openingen",
      "-When making new openings in existing masonry, provide adequate propping to the wall and the surrounding structure.",
      "-Bij het maken van nieuwe openingen in bestaand metselwerk de wand en de omliggende constructie voldoende stempelen."),
    v("Demolition sequence", "Volgorde van slopen",
      "-Remove loadbearing elements only after the new structure is in place or the load has been temporarily supported.",
      "-Dragende onderdelen pas verwijderen als de nieuwe constructie is aangebracht of de belasting tijdelijk is opgevangen."),
  ],
  "uitvoering-nieuwbouw": [
    v("Shallow foundation", "Fundering op staal",
      "-Shallow foundation: establish the bearing stratum during excavation.\n-Have the reinforcement inspected before casting.",
      "-Fundering op staal: de draagkrachtige laag vaststellen tijdens het ontgraven.\n-Wapening voor het storten laten controleren."),
    v("Piled foundation", "Paalfundering",
      "-Send the piling records and pile deviations to the structural engineer.\n-Inspect the reinforcement of the foundation and of all floor pours.",
      "-Kalenderstaten en paalafwijkingen naar de constructeur sturen.\n-Wapeningscontroles van de fundering en van alle vloerstorts."),
  ],

  // ── 4 Uitgangspunten ──
  trillingen: [
    v("Floor vibrations", "Trillingen bij vloeren",
      "Vibration calculations are carried out for floor structures.\nVibrations are not considered further for other elements.",
      "Bij vloerconstructies worden trillingsberekeningen uitgevoerd.\nVoor overige onderdelen worden trillingen verder niet beschouwd."),
    v("Not considered", "Niet beschouwd", "Vibrations are not considered in this calculation.", "Trillingen worden in deze berekening niet beschouwd."),
  ],
  vervormingen: [
    v("Standard", "Standaard", "The deformation limits below apply to this project.", "De onderstaande vervormingseisen worden gehanteerd voor dit project."),
  ],
  montage: [
    v("Final stage", "Eindfase",
      "This calculation considers the structure in its final stage. The various construction stages, such as propping, are not included.",
      "Deze berekening gaat uit van de constructie in de eindfase. Het berekenen van de verschillende bouwfasen, zoals onderstempeling, is niet meegenomen."),
  ],
  rekenprogrammatuur: [
    v("Open CalcSheet Studio", "Open CalcSheet Studio",
      "The calculations in this report were prepared with Open CalcSheet Studio.",
      "De berekeningen in dit rapport zijn opgesteld met Open CalcSheet Studio."),
    v("Open CalcSheet Studio with appendices", "Open CalcSheet Studio met bijlagen",
      "The calculations in this report were prepared with Open CalcSheet Studio.\nCalculations made with other software are in the appendices, which state the version used.",
      "De berekeningen in dit rapport zijn opgesteld met Open CalcSheet Studio.\nBerekeningen met andere rekenprogrammatuur staan in de bijlagen; daarin is de gebruikte versie benoemd."),
  ],
  temperatuur: [
    v("Not applicable", "Niet aan de orde", "No particular thermal actions apply to this project.", "Bij dit project zijn geen bijzondere temperatuursinvloeden aan de orde."),
    v("Per element", "Per onderdeel", "Thermal actions are considered for the elements concerned.", "Temperatuursinvloeden worden bij de desbetreffende onderdelen beschouwd."),
  ],
  aardbeving: [
    v("Not required", "Niet voorgeschreven", "No seismic design situation is required.", "Er is geen aardbevingsontwerpsituatie voorgeschreven."),
    // Buiten de Nederlandse tabellen de standaard: daar is "niet voorgeschreven" niet vanzelf waar (normen/keuze.ts).
    v("According to the location", "Volgens de locatie",
      "Seismic actions follow from the standard that applies at the location.",
      "De aardbevingsbelasting volgt uit de norm die op de locatie geldt."),
  ],

  // ── 5 Belastingen ──
  sneeuw: [
    v("Standard", "Standaard",
      "Snow drift and snow loads on pitched roofs are calculated for the elements concerned, where applicable.",
      "Sneeuwophoping en sneeuwbelasting op hellende daken worden bij de desbetreffende onderdelen berekend, indien van toepassing."),
  ],
  regenwater: [
    v("Not applicable", "Niet van toepassing", "Not applicable", "Niet van toepassing"),
    v("Per roof element", "Per dakonderdeel",
      "Water ponding on flat roofs is calculated for the roof elements concerned.",
      "Wateraccumulatie op platte daken wordt bij de desbetreffende dakonderdelen berekend."),
  ],
};

/**
 * De vorige naam van het programma. Een opgeslagen rapport houdt zijn tekst
 * bij Toegepaste rekenprogrammatuur, ook als daar deze naam in staat: een
 * uitgebracht rapport verandert niet vanzelf. Het paneel wijst er wel op.
 */
export const VORIGE_PRODUCTNAAM = "OpenAEC Calc";

/**
 * Noemt deze tekst de vorige naam van het programma? Alleen als losse woorden
 * (woordgrenzen), ook over een regeleinde heen: "OpenAEC Calculations Studio"
 * begint met dezelfde letters, maar is niet de vorige naam. Het patroon is
 * VORIGE_PRODUCTNAAM; scripts/check-rapport.mjs houdt de twee gelijk.
 */
export function noemtVorigeProductnaam(tekst: string): boolean {
  return /\bOpenAEC\s+Calc\b/.test(tekst);
}

/**
 * De tekst-ids die in een nieuw rapport meteen hun eerste variant krijgen. De
 * overige onderdelen (bestaande situatie, wijziging, belendingen,
 * aandachtspunten) verschillen per project te veel: die beginnen leeg en
 * vallen dan uit het rapport tot de gebruiker er iets invult.
 */
export const STANDAARD_IN_NIEUW_RAPPORT: readonly string[] = [
  "inleiding", "projectomschrijving", "rol", "trillingen", "vervormingen", "montage",
  "rekenprogrammatuur", "temperatuur", "aardbeving", "sneeuw", "regenwater",
];

/** Per tekst-id de eerste variant in deze taal, voor standaardRapport(); ids zonder standaard ontbreken. */
export function standaardTeksten(taal = "en"): Record<string, string> {
  const uit: Record<string, string> = {};
  for (const id of STANDAARD_IN_NIEUW_RAPPORT) {
    const eerste = STANDAARD_TEKSTEN[id]?.[0];
    if (eerste) uit[id] = inTaal(eerste.tekst, taal);
  }
  return uit;
}

/**
 * De varianten die dit rapport bij een tekst-id aanbiedt: die uit zijn template, anders de
 * meegeleverde. Het keuzemenu en het wisselen van taal lezen allebei hier.
 */
export function variantenVan(r: { varianten?: Record<string, Tekstvariant[]> }, id: string): readonly Tekstvariant[] {
  return r.varianten?.[id] ?? (heeftSleutel(STANDAARD_TEKSTEN, id) ? STANDAARD_TEKSTEN[id] : GEEN_VARIANTEN);
}

/** Altijd dezelfde lijst: het paneel leest dit in een selector van de store. */
const GEEN_VARIANTEN: readonly Tekstvariant[] = [];

/** Eén lijst varianten uit een bestand. Zonder leesbare tekst valt een variant weg; zonder label krijgt hij een nummer. */
export function leesVariantLijst(x: unknown): Tekstvariant[] {
  if (!Array.isArray(x)) return [];
  const uit: Tekstvariant[] = [];
  for (const el of x as unknown[]) {
    if (el === null || typeof el !== "object") continue;
    const v = el as Record<string, unknown>;
    const tekst = leesMeertalig(v.tekst);
    if (tekst) uit.push({ label: leesMeertalig(v.label) ?? { en: `Variant ${uit.length + 1}` }, tekst });
  }
  return uit;
}

/** Varianten per tekst-id uit een bestand; alleen bruikbare id's met minstens één variant. */
export function leesVarianten(x: unknown): Record<string, Tekstvariant[]> {
  const uit: Record<string, Tekstvariant[]> = {};
  if (x === null || typeof x !== "object" || Array.isArray(x)) return uit;
  for (const [id, lijst] of Object.entries(x)) {
    if (!isGeldigId(id)) continue;
    const varianten = leesVariantLijst(lijst);
    if (varianten.length > 0) uit[id] = varianten;
  }
  return uit;
}
