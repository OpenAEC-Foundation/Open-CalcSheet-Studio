/**
 * Bibliotheek met gewichten voor de opbouwen in 5.5 Blijvende belastingen.
 *
 * Twee lijsten, beide te kiezen via "uit bibliotheek" in het rapportpaneel:
 *   OPBOUWEN     complete opbouwen per bouwdeel (vloer, dak, wand), in te
 *                voegen als nieuwe vlakopbouw;
 *   LAAGGROEPEN  losse lagen per groep (vloerelementen, houtskeletbouw,
 *                materialen, …), in te voegen in een opbouw die er al staat.
 *
 * Een laag heeft een gewicht per m² (p) of een dikte en volumiek gewicht (d en
 * ρ), zoals in opbouw.ts: een ingevulde p gaat voor d × ρ. Een materiaal met
 * alleen ρ komt zonder d in de opbouw; de dikte vult de constructeur in.
 * Eenheden: d in m, ρ in kN/m³, p in kN/m².
 *
 * De waarden komen uit een eigen gewichtenoverzicht en zijn nagelopen op
 * eenheid en orde van grootte (scripts/check-rapport.mjs). Niet opgenomen:
 * veranderlijke belastingen, korrelvolumieke massa's van toeslagmaterialen
 * (dat is geen stortgewicht) en waarden die alleen als bereik bekend zijn.
 *
 * Dit is de korte lijst in het keuzemenu. De volledige bibliotheek, per
 * leverancier en met een bron bij elke waarde, staat in library/gewichten/ en
 * gewichtenBibliotheek.ts; die bevat ook deze regels.
 */
import type { Gevellaag, Laag, Opbouw } from "./model.ts";
import { inTaal, mt, mtMet, type Meertalig } from "./meertalig.ts";
import { fmt } from "./normwaarden.ts";
import { vlakOpbouw } from "./opbouw.ts";

export type Bouwdeel = "vloer" | "dak" | "wand";

/**
 * Eén laag uit de bibliotheek. Getallen, zodat de controle ermee kan rekenen. De namen
 * staan per taal in rapportteksten.json (gewichten); de opbouw krijgt ze in de taal van
 * het rapport.
 */
export interface Gewicht {
  naam: Meertalig;
  /** Dikte [m]. */
  d?: number;
  /** Volumiek gewicht [kN/m³]. */
  rho?: number;
  /** Gewicht per m² [kN/m²]; gaat voor d × ρ. */
  p?: number;
  /** Korte toelichting in het keuzemenu. */
  opmerking?: Meertalig;
}

export interface Bibliotheekopbouw {
  bouwdeel: Bouwdeel;
  naam: Meertalig;
  lagen: readonly Gewicht[];
}

export interface Laaggroep {
  naam: Meertalig;
  /** Bij welke bouwdelen de groep in het keuzemenu staat. */
  bouwdelen: readonly Bouwdeel[];
  lagen: readonly Gewicht[];
}

const ALLE: readonly Bouwdeel[] = ["vloer", "dak", "wand"];

/** Naam en opmerking uit rapportteksten.json. */
const laag = (sleutel: string) => mt(`gewichten.lagen.${sleutel}`);
const opm = (sleutel: string) => mt(`gewichten.opmerkingen.${sleutel}`);
const groep = (sleutel: string) => mt(`gewichten.groepen.${sleutel}`);

// ── Elementen ───────────────────────────────────────────────────────────────

const kanaalplaat = (h: number, p: number): Gewicht => ({ naam: mtMet("gewichten.lagen.kanaalplaat", { h }), p });
const verzwaard = (h: number, p: number): Gewicht => ({
  naam: mtMet("gewichten.lagen.kanaalplaatVerzwaard", { h }),
  p,
  opmerking: opm("woningscheidend"),
});
const kernactivering = (h: number, p: number): Gewicht => ({
  naam: mtMet("gewichten.lagen.kernactivering", { h }),
  p,
});

const VLOERELEMENTEN: readonly Gewicht[] = [
  kanaalplaat(150, 2.64),
  kanaalplaat(200, 3.03),
  kanaalplaat(260, 3.76),
  kanaalplaat(320, 4.43),
  kanaalplaat(400, 5.48),
  verzwaard(200, 3.82),
  verzwaard(260, 5.05),
  kernactivering(200, 3.78),
  kernactivering(260, 4.99),
  kernactivering(320, 5.94),
  { naam: laag("combinatievloer"), p: 2.45 },
  { naam: laag("ribcassette"), p: 2.6 },
  { naam: laag("gipsvezel"), p: 0.38 },
  { naam: laag("renovatieDroog"), p: 0.4 },
  { naam: laag("renovatieHalfdroog"), p: 0.88 },
  { naam: laag("renovatieStandaard"), p: 1.72 },
];

const HOUTVEZELCEMENT: Gewicht = { naam: laag("houtvezelcement"), p: 0.95 };
const BESTAAND: readonly Gewicht[] = [{ naam: laag("bims"), rho: 10 }, HOUTVEZELCEMENT];

const DAKPANEEL: Gewicht = { naam: laag("dakpaneel"), p: 0.2 };
const DAKELEMENTEN: readonly Gewicht[] = [
  DAKPANEEL,
  { naam: laag("zonnepanelenHellend"), p: 0.25 },
  { naam: laag("zonnepanelenPlat"), p: 1.0 },
];

const DAKTUIN: readonly Gewicht[] = [
  { naam: laag("sedum"), p: 1.05, opmerking: opm("afschot") },
  { naam: laag("substraat"), rho: 14, opmerking: opm("beplanting") },
  { naam: laag("granulaat"), rho: 13, opmerking: opm("drainage") },
  { naam: laag("zand"), rho: 19 },
];

// ── Houtskeletbouw en glas ──────────────────────────────────────────────────

const GIPSPLAAT: Gewicht = { naam: laag("gipsplaat"), d: 0.012, rho: 9 };
const OSB: Gewicht = { naam: laag("osb"), d: 0.01, rho: 6 };
const HPL_PANEEL: Gewicht = { naam: laag("hpl"), p: 0.08 };
const STIJLWERK: Gewicht = {
  naam: laag("stijlwerk"),
  d: 0.1,
  rho: 5,
  p: 0.045,
  opmerking: opm("stijlwerk"),
};
const ISOLATIE: Gewicht = { naam: laag("isolatie"), p: 0.05 };

const HSB: readonly Gewicht[] = [GIPSPLAAT, OSB, HPL_PANEEL, STIJLWERK, ISOLATIE];

const GLAS_PAKKET: Gewicht = { naam: laag("glasPakket"), d: 0.025, rho: 25 };
const GLAS_STIJLEN: Gewicht = {
  naam: laag("glasStijlen"),
  p: 0.129,
  opmerking: opm("glasStijlen"),
};

const GLAS: readonly Gewicht[] = [GLAS_PAKKET, GLAS_STIJLEN];

// ── Materialen ──────────────────────────────────────────────────────────────

const STEENACHTIG: readonly Gewicht[] = [
  { naam: laag("betonInSitu"), rho: 25 },
  { naam: laag("betonPrefab"), rho: 25 },
  { naam: laag("kalkzandsteen"), rho: 18 },
  { naam: laag("metselwerk"), rho: 20 },
  { naam: laag("gipsblokken"), rho: 11 },
  { naam: laag("kleiblokken"), rho: 14 },
  { naam: laag("grind"), rho: 19 },
];

const METALEN: readonly Gewicht[] = [
  { naam: laag("staal"), rho: 78.5 },
  { naam: laag("aluminium"), rho: 27 },
];

const AFWERKING: readonly Gewicht[] = [
  { naam: laag("gipskarton"), rho: 9 },
  { naam: laag("gips"), rho: 11 },
  { naam: laag("cementdekvloer"), rho: 20 },
  { naam: laag("glas"), rho: 25 },
];

/** De losse lagen, per groep in de volgorde van het keuzemenu. */
export const LAAGGROEPEN: readonly Laaggroep[] = [
  { naam: groep("vloerelementen"), bouwdelen: ["vloer"], lagen: VLOERELEMENTEN },
  { naam: groep("bestaand"), bouwdelen: ["vloer", "dak"], lagen: BESTAAND },
  { naam: groep("dakelementen"), bouwdelen: ["dak"], lagen: DAKELEMENTEN },
  { naam: groep("daktuin"), bouwdelen: ["dak"], lagen: DAKTUIN },
  { naam: groep("hsb"), bouwdelen: ["wand"], lagen: HSB },
  { naam: groep("glas"), bouwdelen: ["dak", "wand"], lagen: GLAS },
  { naam: groep("steenachtig"), bouwdelen: ALLE, lagen: STEENACHTIG },
  { naam: groep("metalen"), bouwdelen: ALLE, lagen: METALEN },
  { naam: groep("afwerking"), bouwdelen: ALLE, lagen: AFWERKING },
];

// ── Complete opbouwen ───────────────────────────────────────────────────────

/** "kanaalplaatvloer 200 mm" → "Kanaalplaatvloer 200 mm". */
function hoofdletter(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** De naam van een laag of opbouw in deze taal. */
export function naamIn(x: { naam: Meertalig }, taal = "nl"): string {
  return inTaal(x.naam, taal);
}

/** Een element als opbouw van één laag; de afwerking komt er in het rapport bij. */
const enkel = (bouwdeel: Bouwdeel, g: Gewicht): Bibliotheekopbouw => {
  const naam = {} as Meertalig;
  for (const code of Object.keys(g.naam)) {
    Object.defineProperty(naam, code, { enumerable: true, get: () => (g.naam[code] === undefined ? undefined : hoofdletter(g.naam[code])) });
  }
  return { bouwdeel, naam, lagen: [g] };
};

const opbouw = (sleutel: string) => mt(`gewichten.opbouwen.${sleutel}`);

export const OPBOUWEN: readonly Bibliotheekopbouw[] = [
  ...VLOERELEMENTEN.map((g) => enkel("vloer", g)),
  enkel("dak", DAKPANEEL),
  enkel("dak", HOUTVEZELCEMENT),
  { bouwdeel: "dak", naam: opbouw("glazenDak"), lagen: GLAS },
  {
    bouwdeel: "wand",
    naam: opbouw("hsbGipsplaat"),
    lagen: [GIPSPLAAT, OSB, STIJLWERK, ISOLATIE, OSB, GIPSPLAAT],
  },
  {
    bouwdeel: "wand",
    naam: opbouw("hsbNatteRuimte"),
    lagen: [HPL_PANEEL, OSB, STIJLWERK, ISOLATIE, OSB, HPL_PANEEL],
  },
  { bouwdeel: "wand", naam: opbouw("glazenPui"), lagen: GLAS },
];

// ── Kiezen en invoegen ──────────────────────────────────────────────────────

/** De opbouwen van deze bouwdelen, in de volgorde van OPBOUWEN. */
export function opbouwenVoor(bouwdelen: readonly Bouwdeel[]): Bibliotheekopbouw[] {
  return OPBOUWEN.filter((o) => bouwdelen.includes(o.bouwdeel));
}

/** De laaggroepen die bij ten minste één van deze bouwdelen horen. */
export function laaggroepenVoor(bouwdelen: readonly Bouwdeel[]): Laaggroep[] {
  return LAAGGROEPEN.filter((g) => g.bouwdelen.some((b) => bouwdelen.includes(b)));
}

/**
 * Een getal als invoertekst met ten minste `min` en ten hoogste `max`
 * decimalen: 0,2 → "0,20", 0,045 → "0,045", 25 → "25,0". Geen getal → "".
 */
function invoer(v: number | undefined, min: number, max: number): string {
  if (v === undefined) return "";
  const s = fmt(v, max, true);
  const [heel, dec = ""] = s.split(",");
  if (dec.length >= min) return s;
  return `${heel},${dec.padEnd(min, "0")}`;
}

/** Een bibliotheeklaag zoals hij in een vlakopbouw komt te staan, met de naam in `taal`. */
export function alsLaag(g: Gewicht, taal = "nl"): Laag {
  return { naam: naamIn(g, taal), d: invoer(g.d, 3, 3), rho: invoer(g.rho, 1, 2), p: invoer(g.p, 2, 3) };
}

/** Een bibliotheekopbouw als nieuwe vlakopbouw in het rapport, in `taal`. */
export function alsOpbouw(o: Bibliotheekopbouw, taal = "nl"): Opbouw {
  return { soort: "vlak", naam: naamIn(o, taal), lagen: o.lagen.map((g) => alsLaag(g, taal)) };
}

/** Het totaal van een bibliotheekopbouw in kN/m², met dezelfde som als het rapport. */
export function somVan(o: Bibliotheekopbouw): number {
  return vlakOpbouw(o.lagen.map((g) => alsLaag(g))).som;
}

/**
 * Een complete opbouw als één laag van een gevelopbouw: p is het totaal per
 * m², afgerond zoals het rapport de som van een vlakopbouw toont. Hoogte en
 * vulling vult de constructeur in.
 */
export function alsGevellaag(o: Bibliotheekopbouw, taal = "nl"): Gevellaag {
  return { naam: naamIn(o, taal), p: fmt(somVan(o), 2), h: "", vulling: "" };
}

/** Wat het menu onder de naam van een laag laat zien, in `taal`. */
export function omschrijving(g: Gewicht, taal = "nl"): string {
  const opmerking = g.opmerking ? inTaal(g.opmerking, taal) : undefined;
  const toe = opmerking ? ` (${opmerking})` : "";
  if (g.p !== undefined) return `${invoer(g.p, 2, 3)} kN/m²${toe}`;
  if (g.d !== undefined && g.rho !== undefined) {
    return `${invoer(g.d, 3, 3)} m × ${invoer(g.rho, 1, 2)} kN/m³ = ${fmt(g.d * g.rho, 2)} kN/m²${toe}`;
  }
  if (g.rho !== undefined) return `ρ = ${invoer(g.rho, 1, 2)} kN/m³, ${inTaal(mt("gewichten.dikteInvullen"), taal)}${toe}`;
  return opmerking ?? "";
}

/** Een rij waarin niets is ingevuld. */
function leeg(rij: object): boolean {
  return Object.values(rij).every((v) => typeof v !== "string" || v.trim() === "");
}

/**
 * Een nieuwe lijst met `rij` achteraan. Lege rijen aan het eind vervallen:
 * een nieuwe opbouw begint met één lege laag, en die hoort niet boven de
 * gekozen laag te blijven staan.
 */
export function voegToe<T extends object>(lijst: readonly T[], rij: T): T[] {
  let eind = lijst.length;
  while (eind > 0 && leeg(lijst[eind - 1])) eind--;
  return [...lijst.slice(0, eind), rij];
}
