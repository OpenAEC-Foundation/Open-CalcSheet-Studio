/**
 * Wat de keuze van het land betekent voor een project: welke normen er gelden, of de
 * Nederlandse tabellen uit normwaarden.ts gelden, wat een nieuw rapport meekrijgt, en op welke
 * norm een rekenblad rust als die afwijkt.
 *
 * De keuze staat in de projectgegevens (`land`, `eurocode_generatie`); de invoer die erbij
 * hoort in het rapport (`Rapport.lokaal`). Zonder React en zonder stores, zodat
 * scripts/check-normen.mjs dit rechtstreeks laadt.
 *
 * De grens: alleen Nederland met de eerste generatie rekent met de Nederlandse tabellen
 * (`nlTabellen`). Daarbuiten komt geen getal uit normwaarden.ts op papier, ook niet als
 * standaardwaarde: wat niet is ingevuld, blijft leeg.
 */
import { inTaal } from "../meertalig.ts";
import {
  inNotatie, leesLand, MEEGELEVERD, standaardBevestiging, standaardMaterialen, standaardVervormingen, standaardWindcoefficienten,
  type LokaleInvoer, type Rapport,
} from "../model.ts";
import { STANDAARD_TEKSTEN } from "../standaardteksten.ts";
import { pasTemplateToe, type Template } from "../template.ts";
import { EN1990_FACTOREN, EN1990_PSI } from "./en1990.ts";
import {
  GEEN_BIJLAGE, LANDEN, ONDERWERPEN, LOCATIE_ONDERWERPEN, TWEEDE_GENERATIE, TWEEDE_GENERATIE_TEKST,
  type Grootheid, type Land, type LocatieOnderwerp, type Norm, type Onderwerp,
} from "./landen.ts";

export type Generatie = 1 | 2;

export interface Normkeuze {
  land: Land;
  /** Altijd 1 buiten de Eurocodes. */
  generatie: Generatie;
  /** Geldt de Eurocode als stelsel (met of zonder nationale bijlage)? */
  eurocode: boolean;
  /** Rekent dit project met de Nederlandse tabellen (normwaarden.ts)? */
  nlTabellen: boolean;
}

export { leesLand };

export function landVanCode(code: unknown): Land | undefined {
  return LANDEN.find((l) => l.code === code);
}

/**
 * Een taal zonder regio, zoals een WebView die geeft bij een Nederlandstalig Windows: de taal
 * met één duidelijk thuisland. Bewust niet "en": dat zegt niets over de plek.
 */
const TAAL_ZONDER_REGIO: Readonly<Record<string, string>> = {
  nl: "NL", de: "DE", fr: "FR", da: "DK", sv: "SE", nb: "NO", nn: "NO", no: "NO", fi: "FI", es: "ES", it: "IT", pl: "PL",
};

/**
 * Het land van een nieuw project: de regio van de locale als die in de lijst staat, anders de
 * Eurocode zonder nationale bijlage. "nl-NL" → NL, "de-CH" → CH, "en-UK" en "en-GB" → GB.
 */
export function landVoorLocale(locale: string | null | undefined): string {
  const delen = (locale ?? "").trim().replace(/_/g, "-").split("-");
  const regio = delen.slice(1).find((d) => /^[A-Za-z]{2}$/.test(d))?.toUpperCase();
  if (regio) return leesLand(regio === "UK" ? "GB" : regio) ?? GEEN_BIJLAGE;
  return TAAL_ZONDER_REGIO[delen[0].toLowerCase()] ?? GEEN_BIJLAGE;
}

/**
 * De keuze uit de projectgegevens. Zonder het veld `land`: een oud project, dus Nederland. Een
 * code die niet in de lijst staat krijgt de Eurocode zonder bijlage en nooit de Nederlandse
 * tabellen.
 */
export function normkeuzeVan(g: Readonly<Record<string, string | undefined>>): Normkeuze {
  const land = landVanCode(g.land ?? "NL") ?? (landVanCode(GEEN_BIJLAGE) as Land);
  const eurocode = land.stelsel === "eurocode";
  const generatie: Generatie = eurocode && g.eurocode_generatie === "2" ? 2 : 1;
  return { land, generatie, eurocode, nlTabellen: land.code === "NL" && generatie === 1 };
}

/** De keuze van een oud project. */
export const NEDERLAND: Normkeuze = normkeuzeVan({});

/** Staat dit veld van de projectgegevens op het formulier bij deze keuze? */
export function veldZichtbaar(naam: string, k: Normkeuze): boolean {
  if (naam === "windgebied" || naam === "terreincategorie") return k.nlTabellen;
  if (naam === "eurocode_generatie") return k.eurocode;
  return true;
}

/**
 * Is alles van dit land bevestigd? "verwijzing": een editie of een grootheid is nog te
 * bevestigen, en dat zegt het scherm erbij.
 */
export function dekkingVan(land: Land): "compleet" | "verwijzing" {
  const normen = ONDERWERPEN.every((o) => land.normen[o].editie !== null);
  const locatie = LOCATIE_ONDERWERPEN.every((o) => {
    const l = land.locatie[o];
    return l.geenGrootheid === true || (l.grootheden.length > 0 && l.grootheden.every((g) => g.bevestigd));
  });
  return normen && locatie ? "compleet" : "verwijzing";
}

/** De normen die bij deze keuze gelden: die van het land, of de EN van de tweede generatie. */
export function normenVan(k: Normkeuze): Readonly<Record<Onderwerp, Norm>> {
  return k.generatie === 2 ? TWEEDE_GENERATIE : k.land.normen;
}

/** Wat op het voorblad staat bij deze keuze. */
export function normenTekstVan(k: Normkeuze, taal: string): string {
  return inTaal(k.generatie === 2 ? TWEEDE_GENERATIE_TEKST : k.land.normenTekst, taal);
}

/**
 * De grootheden om in te vullen. Niet vastgesteld welke het zijn: één vrij veld, en als niet
 * bevestigd. Aantoonbaar geen: niets.
 */
export function groothedenVan(land: Land, onderwerp: LocatieOnderwerp): readonly Grootheid[] {
  const l = land.locatie[onderwerp];
  if (l.geenGrootheid) return [];
  if (l.grootheden.length > 0) return l.grootheden;
  return [{
    id: "vrij",
    symbool: "",
    naam: { en: "Location value (see the standard)", nl: "Locatiewaarde (zie de norm)" },
    eenheid: "",
    url: land.normen[onderwerp].url,
    bevestigd: false,
  }];
}

// ── De invoer ───────────────────────────────────────────────────────────────

/**
 * Waar de invoer van een land mee begint. Locatiewaarden, q_k en Q_k zijn leeg: die komen uit een
 * kaart of een nationale bijlage, niet uit het geheugen. Een Eurocode-land krijgt de aanbevolen
 * waarden uit EN 1990 (eerste generatie); daarbuiten vult de gebruiker de combinaties zelf in.
 */
export function standaardLokaal(k: Normkeuze, taal: string): LokaleInvoer {
  const n = (s: string) => inNotatie(s, taal);
  const aanbevolen = k.eurocode && k.generatie === 1;
  return {
    veiligheid: "",
    wind: { waarden: {}, bron: "", q: "" },
    sneeuw: { waarden: {}, bron: "", s: "" },
    aardbeving: { waarden: {}, bron: "" },
    factoren: !aanbevolen ? [] : EN1990_FACTOREN.map((f) => ({
      groep: f.groep,
      naam: inTaal(f.naam, taal),
      gGinf: n(f.cellen[0]),
      gGsup: n(f.cellen[1]),
      gQ1: n(f.cellen[2]),
      gQi: n(f.cellen[3]),
    })),
    psi: !aanbevolen ? [] : EN1990_PSI.map((p) => ({ naam: inTaal(p.naam, taal), psi0: n(p.psi[0]), psi1: n(p.psi[1]), psi2: n(p.psi[2]) })),
    combinaties: [],
    klassen: !k.eurocode ? [] : [EN1990_PSI[0], EN1990_PSI[7]].map((p) => ({ omschrijving: inTaal(p.naam, taal), qk: "", Qk: "" })),
  };
}

/** De invoer van dit land in dit rapport, aangevuld: een pad kan er half iets in hebben gezet. */
export function lokaalVan(r: Rapport, k: Normkeuze): LokaleInvoer {
  const s = standaardLokaal(k, r.taal);
  const l = r.lokaal?.[k.land.code];
  if (!l) return s;
  return { ...s, ...l, wind: { ...s.wind, ...l.wind }, sneeuw: { ...s.sneeuw, ...l.sneeuw }, aardbeving: { ...s.aardbeving, ...l.aardbeving } };
}

/** Zet de invoer klaar als die er nog niet is: het paneel schrijft erin. Nederland heeft er geen. */
export function metLokaal(r: Rapport, k: Normkeuze): Rapport {
  if (k.nlTabellen || r.lokaal?.[k.land.code]) return r;
  return { ...r, lokaal: { ...r.lokaal, [k.land.code]: standaardLokaal(k, r.taal) } };
}

// ── Wisselen van land of generatie ──────────────────────────────────────────

const gelijk = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Wat de app zelf neerzette, wisselt mee; eigen tekst en eigen getallen blijven staan. Heen en
 * terug zonder iets in te vullen geeft precies het rapport van het begin.
 */
export function pasRapportAan(r: Rapport, van: Normkeuze, naar: Normkeuze): Rapport {
  if (van.land.code === naar.land.code && van.generatie === naar.generatie) return r;
  const { taal } = r;
  const u = r.uitgangspunten;

  // De lijst op het voorblad.
  const meegeleverd = MEEGELEVERD.normen.some((m) => Object.values(m).includes(r.normen));
  const normen = meegeleverd ? normenTekstVan(naar, taal) : r.normen;

  // De vervormingseisen komen uit de Nederlandse bijlage, de klassen uit de EN.
  const nlEisen = standaardVervormingen(taal);
  const legeEisen = nlEisen.map((v) => ({ ...v, ueind: "", ubij: "", uhor: "" }));
  const vervormingen = !naar.nlTabellen && gelijk(u.vervormingen, nlEisen) ? legeEisen
    : naar.nlTabellen && gelijk(u.vervormingen, legeEisen) ? nlEisen
    : u.vervormingen;
  const enMaterialen = standaardMaterialen(taal);
  const legeMaterialen = enMaterialen.map((m) => ({ ...m, soort: "", opmerking: "" }));
  const materialen = !naar.eurocode && gelijk(u.materialen, enMaterialen) ? legeMaterialen
    : naar.eurocode && gelijk(u.materialen, legeMaterialen) ? enMaterialen
    : u.materialen;
  const enBevestiging = standaardBevestiging(taal);
  const legeBevestiging = enBevestiging.map((b) => ({ ...b, kwaliteit: "" }));
  const bevestiging = !naar.eurocode && gelijk(u.bevestiging, enBevestiging) ? legeBevestiging
    : naar.eurocode && gelijk(u.bevestiging, legeBevestiging) ? enBevestiging
    : u.bevestiging;

  // De coëfficiënten in een nieuw rapport zijn een Nederlandse gewoonte, geen gegeven van elders.
  const b = r.belastingen;
  const nlCoefficienten = standaardWindcoefficienten(taal);
  const coefficienten = !naar.nlTabellen && gelijk(b.wind.coefficienten, nlCoefficienten) ? []
    : naar.nlTabellen && b.wind.coefficienten.length === 0 ? nlCoefficienten
    : b.wind.coefficienten;

  // De invoer per land. Onaangeraakt blijft die niet achter als je weggaat.
  const lokaal = { ...r.lokaal };
  const code = van.land.code;
  const verlaat = code !== naar.land.code || naar.nlTabellen;
  if (lokaal[code] && verlaat && gelijk(lokaal[code], standaardLokaal(van, taal))) delete lokaal[code];
  if (!naar.nlTabellen) {
    const hier = lokaal[naar.land.code];
    const s = standaardLokaal(naar, taal);
    if (!hier) {
      lokaal[naar.land.code] = s;
    } else {
      // Een andere generatie: de aanbevolen waarden uit de eerste gelden niet voor de tweede.
      const eerste = standaardLokaal({ ...naar, generatie: 1 }, taal);
      const tweede = standaardLokaal({ ...naar, generatie: 2 }, taal);
      const onaangeraakt = <T>(lijst: T[], a: T[], b: T[], nieuw: T[]) => (gelijk(lijst, a) || gelijk(lijst, b) ? nieuw : lijst);
      lokaal[naar.land.code] = {
        ...hier,
        factoren: onaangeraakt(hier.factoren, eerste.factoren, tweede.factoren, s.factoren),
        psi: onaangeraakt(hier.psi, eerste.psi, tweede.psi, s.psi),
      };
    }
  }

  const { lokaal: _oud, ...rest } = r;
  return metLandTekst({
    ...rest,
    normen,
    uitgangspunten: { ...u, vervormingen, materialen, bevestiging },
    belastingen: { ...b, wind: { ...b.wind, coefficienten } },
    ...(Object.keys(lokaal).length > 0 ? { lokaal } : {}),
  }, naar);
}

/**
 * De meegeleverde tekst over aardbeving: "niet voorgeschreven" is alleen in Nederland vanzelf waar.
 * Eigen tekst blijft staan; is er niets te doen, dan komt hetzelfde object terug.
 */
export function metLandTekst(r: Rapport, k: Normkeuze): Rapport {
  const tekst = r.teksten.aardbeving;
  if (tekst === undefined) return r;
  const [nietVoorgeschreven, volgensLocatie] = STANDAARD_TEKSTEN.aardbeving;
  const isVariant = (v: typeof nietVoorgeschreven) => Object.values(v.tekst).includes(tekst);
  const aardbeving = !k.nlTabellen && isVariant(nietVoorgeschreven) ? inTaal(volgensLocatie.tekst, r.taal)
    : k.nlTabellen && isVariant(volgensLocatie) ? inTaal(nietVoorgeschreven.tekst, r.taal)
    : tekst;
  return aardbeving === tekst ? r : { ...r, teksten: { ...r.teksten, aardbeving } };
}

// ── Het land uit een template ───────────────────────────────────────────────

/** De gegevens met het land uit dit template. Zonder land, of met hetzelfde: dezelfde gegevens. */
export function metLandUit<G extends Readonly<Record<string, string | undefined>>>(g: G, t: Template | null): G {
  const land = leesLand(t?.land);
  return land && land !== g.land ? { ...g, land } : g;
}

/**
 * Past een template toe op een project. Een template met een land zet dat land in de
 * projectgegevens, en het rapport volgt; zonder land blijft het land van het project. Eerst het
 * template en dan het land: wat het template meebrengt, mag buiten Nederland niet stil de
 * Nederlandse tekst worden.
 */
export function pasTemplateToeOpProject<G extends Readonly<Record<string, string | undefined>>>(g: G, r: Rapport, t: Template): { gegevens: G; rapport: Rapport } {
  const gegevens = metLandUit(g, t);
  const naar = normkeuzeVan(gegevens);
  return { gegevens, rapport: metLandTekst(metLokaal(pasRapportAan(pasTemplateToe(r, t), normkeuzeVan(g), naar), naar), naar) };
}

// ── De norm van een rekenblad ───────────────────────────────────────────────

export interface BladNorm {
  /** De delen die de rekentekst noemt, gesorteerd: "EN 1990", "EN 1995-1-1". */
  normen: string[];
  /** Noemt de tekst de Nederlandse bijlage (NEN-EN, NB)? */
  nederlandseBijlage: boolean;
}

/**
 * Waar een rekenblad op rust, gelezen uit zijn rekentekst. Geen norm genoemd en geen K_FI: dan
 * rust het blad op geen norm (mechanica, een eigen blad) en valt er niets te melden.
 */
export function bladNormUit(source: string): BladNorm | null {
  const delen = new Set<string>();
  for (const m of source.matchAll(/\bEN\s?(199\d(?:-\d+){0,2})/g)) delen.add(`EN ${m[1]}`);
  if (/\bK_FI\b/.test(source)) delen.add("EN 1990");
  if (delen.size === 0 && /\bEurocode/.test(source)) delen.add("Eurocode");
  if (delen.size === 0) return null;
  return { normen: [...delen].sort(), nederlandseBijlage: /\bNEN-EN\b|\bNB\b/.test(source) };
}

export interface NormAfwijking {
  /**
   * eigen: een ander stelsel, dus geen toetsing aan de norm van dit land;
   * bijlage: de Eurocode, maar met de Nederlandse bijlage;
   * zonderBijlage: de Eurocode, zonder de keuzes van dit land;
   * generatie: de eerste generatie, terwijl het project op de tweede staat.
   */
  soort: "eigen" | "bijlage" | "zonderBijlage" | "generatie";
  normen: string;
}

/** Wijkt de norm van dit blad af van wat in dit project geldt? */
export function normAfwijking(k: Normkeuze, blad: BladNorm | null): NormAfwijking | null {
  if (!blad || k.nlTabellen) return null;
  const normen = blad.normen.join(", ");
  if (!k.eurocode) return { soort: "eigen", normen };
  if (k.generatie === 2) return { soort: "generatie", normen };
  return { soort: blad.nederlandseBijlage ? "bijlage" : "zonderBijlage", normen };
}
