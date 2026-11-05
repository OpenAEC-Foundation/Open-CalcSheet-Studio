/**
 * De gewichtenbibliotheek: losse regels met een eigen gewicht en hun bron, als eigen
 * bestand (`*.weightlibrary`, JSON). De app levert er één mee (library/gewichten/,
 * gewichtenLaden.ts); een eigen bibliotheek kun je openen, aanvullen, samenvoegen en delen.
 *
 * Een regel heeft de eenheden van gewichten.ts: d in m, ρ in kN/m³, p in kN/m². Een
 * ingevulde p gaat voor d × ρ. Een rapport bewaart de getallen, niet de verwijzing:
 * een bestaand rapport verandert dus niet als de bibliotheek verandert.
 *
 * Een bestand is invoer van buiten. Elk veld wordt gecontroleerd en alleen wat klopt komt
 * mee; één kapotte regel en het hele bestand wordt geweigerd, met de plek erbij, en de
 * stand blijft zoals hij was. Een afwijking die de gebruiker zelf moet beoordelen
 * (p tegen d × ρ, een verdachte orde van grootte) leest wel, met een melding.
 *
 * Puur: geen React en geen Tauri, zodat scripts/check-gewichten.mjs er ook mee rekent.
 * Het kiezen en wegschrijven staat in gewichtenBestand.ts, de stand in
 * store/gewichtenBibliotheek.ts.
 */
import { alsLaag, type Gewicht } from "./gewichten.ts";
import { inTaal, type Meertalig } from "./meertalig.ts";
import type { Gevellaag, Laag, Opbouw } from "./model.ts";
import { fmt, getal, rond } from "./normwaarden.ts";

export const BIBLIOTHEEK_FORMAAT = "open-calcsheet-weight-library";
export const BIBLIOTHEEK_VERSIE = 1;
export const BIBLIOTHEEK_EXTENSIE = "weightlibrary";

/** 1 kg ≙ 0,00981 kN, zoals in de bladen van leveranciers wordt omgerekend. */
export const KG_NAAR_KN = 0.00981;

export const CATEGORIEEN = [
  "materialen",
  "vloeren",
  "wanden",
  "daken",
  "gevels",
  "afwerkingen",
  "plafonds-installaties",
  "grond",
  "opslag",
] as const;
export type Categorie = (typeof CATEGORIEEN)[number];

export const TOESTANDEN = ["droog", "nat", "verzadigd"] as const;
export type Toestand = (typeof TOESTANDEN)[number];

export interface Bron {
  titel: string;
  url?: string;
  /** JJJJ, JJJJ-MM of JJJJ-MM-DD: de datum van het blad, of de dag van lezen als er geen op staat. */
  datum?: string;
}

export interface Gewichtregel {
  id: string;
  categorie: Categorie;
  naam: Meertalig;
  /** Dikte [m]. */
  d?: number;
  /** Volumiek gewicht [kN/m³]. */
  rho?: number;
  /** Gewicht per m² [kN/m²]; gaat voor d × ρ. */
  p?: number;
  toestand?: Toestand;
  leverancier?: string;
  regio?: string;
  opmerking?: Meertalig;
  bron: Bron;
}

export interface Bibliotheek {
  formaat: typeof BIBLIOTHEEK_FORMAAT;
  versie: number;
  naam: Meertalig;
  regels: Gewichtregel[];
}

/**
 * Wat per categorie aannemelijk is. Een waarde daarbuiten is meestal een verwisselde eenheid:
 * kg/m³ in plaats van kN/m³, mm in plaats van m. De controle op de meegeleverde gegevens
 * eist het; in een eigen bestand leest het wel, met een melding.
 */
export const BANDBREEDTE: Record<Categorie, { p: [number, number]; rho: [number, number]; d: [number, number] }> = {
  materialen: { p: [0.005, 2], rho: [0.1, 120], d: [0.0003, 1] },
  vloeren: { p: [0.05, 13], rho: [3, 30], d: [0.0003, 2] },
  wanden: { p: [0.03, 8], rho: [2, 30], d: [0.003, 1.5] },
  daken: { p: [0.005, 4], rho: [0.5, 90], d: [0.0003, 1.2] },
  gevels: { p: [0.005, 3], rho: [2, 30], d: [0.0003, 1] },
  afwerkingen: { p: [0.005, 3], rho: [0.5, 30], d: [0.0003, 0.3] },
  "plafonds-installaties": { p: [0.005, 1.5], rho: [0.1, 90], d: [0.0003, 1] },
  grond: { p: [0.05, 50], rho: [4, 26], d: [0.01, 10] },
  opslag: { p: [0.05, 100], rho: [0.3, 50], d: [0.01, 20] },
};

/** De naam van een nieuwe eigen bibliotheek. */
export const LEEG_EIGEN: Meertalig = { en: "My weights", nl: "Mijn gewichten" };

const MAX_TEKENS = 32 * 1024 * 1024;
const MAX_REGELS = 50_000;
const MAX_TEKST = 500;

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const TAALCODE = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
const DATUM = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/;

// ── Lezen ───────────────────────────────────────────────────────────────────

export type Leesfout =
  | { soort: "geenJson" }
  | { soort: "teGroot" }
  | { soort: "geenBibliotheek" }
  | { soort: "teNieuw"; versie: number }
  | { soort: "dubbelId"; id: string }
  /** `nummer` telt vanaf 1, in de volgorde van het bestand. */
  | { soort: "regel"; nummer: number; veld: string; id?: string };

export type Aandachtspunt =
  | { soort: "tegenstrijdig"; d_rho: number }
  | { soort: "ordeVanGrootte"; veld: "d" | "rho" | "p" };

export type Leesuitslag =
  | { ok: true; bibliotheek: Bibliotheek; aandacht: { id: string; punten: Aandachtspunt[] }[] }
  | { ok: false; fout: Leesfout };

/** Een gewone tekst met inhoud; null als het iets anders is. */
function tekstVeld(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const t = x.trim();
  return t !== "" && t.length <= MAX_TEKST ? t : null;
}

/** Tekst per taal met in elk geval Engels; null als er iets niet klopt. */
function leesMeertalig(x: unknown): Meertalig | null {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return null;
  const uit: Record<string, string> = {};
  // De eigen sleutels, ook een letterlijke __proto__ uit JSON.parse: die valt op de taalcode.
  for (const sleutel of Object.keys(x)) {
    if (!TAALCODE.test(sleutel)) return null;
    const t = tekstVeld((x as Record<string, unknown>)[sleutel]);
    if (t === null) return null;
    uit[sleutel] = t;
  }
  if (uit.en === undefined) return null;
  // Engels vooraan, de rest in de volgorde van het bestand.
  return { en: uit.en, ...uit } as Meertalig;
}

const isGetal = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x) && x > 0;

/** Alleen een web-adres: `javascript:` of `file:` opent niet vanuit een gedeeld bestand. */
function leesUrl(x: string): string | null {
  try {
    const u = new URL(x);
    return (u.protocol === "https:" || u.protocol === "http:") && x.length <= 2000 ? x : null;
  } catch {
    return null;
  }
}

type Regelfout = { veld: string; id?: string };

/** Eén regel: een nieuw object met alleen de bekende velden, in een vaste volgorde. */
function leesRegel(x: unknown): Gewichtregel | Regelfout {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return { veld: "regel" };
  const r = x as Record<string, unknown>;
  if (typeof r.id !== "string" || !ID.test(r.id) || r.id.length > 200) return { veld: "id" };
  const id = r.id;
  if (!CATEGORIEEN.includes(r.categorie as Categorie)) return { veld: "categorie", id };
  const naam = leesMeertalig(r.naam);
  if (naam === null) return { veld: "naam", id };
  for (const veld of ["d", "rho", "p"] as const) {
    if (r[veld] !== undefined && !isGetal(r[veld])) return { veld, id };
  }
  if (r.p === undefined && r.rho === undefined) return { veld: "waarde", id };
  if (r.toestand !== undefined && !TOESTANDEN.includes(r.toestand as Toestand)) return { veld: "toestand", id };
  for (const veld of ["leverancier", "regio"] as const) {
    if (r[veld] !== undefined && tekstVeld(r[veld]) === null) return { veld, id };
  }
  const opmerking = r.opmerking === undefined ? undefined : leesMeertalig(r.opmerking);
  if (opmerking === null) return { veld: "opmerking", id };
  if (typeof r.bron !== "object" || r.bron === null || Array.isArray(r.bron)) return { veld: "bron", id };
  const b = r.bron as Record<string, unknown>;
  const titel = tekstVeld(b.titel);
  if (titel === null) return { veld: "bron.titel", id };
  const url = typeof b.url === "string" ? leesUrl(b.url) : undefined;
  if (b.url !== undefined && !url) return { veld: "bron.url", id };
  if (b.datum !== undefined && (typeof b.datum !== "string" || !DATUM.test(b.datum))) return { veld: "bron.datum", id };
  return {
    id,
    categorie: r.categorie as Categorie,
    naam,
    ...(r.d !== undefined ? { d: r.d as number } : {}),
    ...(r.rho !== undefined ? { rho: r.rho as number } : {}),
    ...(r.p !== undefined ? { p: r.p as number } : {}),
    ...(r.toestand !== undefined ? { toestand: r.toestand as Toestand } : {}),
    ...(r.leverancier !== undefined ? { leverancier: tekstVeld(r.leverancier) as string } : {}),
    ...(r.regio !== undefined ? { regio: tekstVeld(r.regio) as string } : {}),
    ...(opmerking ? { opmerking } : {}),
    bron: { titel, ...(url ? { url } : {}), ...(b.datum !== undefined ? { datum: b.datum as string } : {}) },
  };
}

const isRegelfout = (x: Gewichtregel | Regelfout): x is Regelfout => "veld" in x;

/** p en d × ρ apart, en de orde van grootte per categorie. Leeg als er niets opvalt. */
export function aandachtspunten(r: Gewichtregel): Aandachtspunt[] {
  const uit: Aandachtspunt[] = [];
  if (r.p !== undefined && r.d !== undefined && r.rho !== undefined) {
    const d_rho = r.d * r.rho;
    if (Math.abs(r.p - d_rho) > 0.05 * Math.max(r.p, d_rho)) uit.push({ soort: "tegenstrijdig", d_rho });
  }
  const band = BANDBREEDTE[r.categorie];
  for (const veld of ["d", "rho", "p"] as const) {
    const v = r[veld];
    if (v !== undefined && (v < band[veld][0] || v > band[veld][1])) uit.push({ soort: "ordeVanGrootte", veld });
  }
  return uit;
}

/** Een ingelezen JSON-waarde als bibliotheek. */
export function leesBibliotheek(x: unknown): Leesuitslag {
  if (typeof x !== "object" || x === null || Array.isArray(x)) return { ok: false, fout: { soort: "geenBibliotheek" } };
  const b = x as Record<string, unknown>;
  if (b.formaat !== BIBLIOTHEEK_FORMAAT || typeof b.versie !== "number" || !Number.isInteger(b.versie)) {
    return { ok: false, fout: { soort: "geenBibliotheek" } };
  }
  if (b.versie > BIBLIOTHEEK_VERSIE) return { ok: false, fout: { soort: "teNieuw", versie: b.versie } };
  const naam = leesMeertalig(b.naam);
  if (naam === null || !Array.isArray(b.regels) || b.regels.length > MAX_REGELS) {
    return { ok: false, fout: { soort: "geenBibliotheek" } };
  }
  const regels: Gewichtregel[] = [];
  const gezien = new Set<string>();
  const aandacht: { id: string; punten: Aandachtspunt[] }[] = [];
  for (const [i, ruw] of b.regels.entries()) {
    const r = leesRegel(ruw);
    if (isRegelfout(r)) return { ok: false, fout: { soort: "regel", nummer: i + 1, ...r } };
    if (gezien.has(r.id)) return { ok: false, fout: { soort: "dubbelId", id: r.id } };
    gezien.add(r.id);
    regels.push(r);
    const punten = aandachtspunten(r);
    if (punten.length > 0) aandacht.push({ id: r.id, punten });
  }
  return { ok: true, bibliotheek: { formaat: BIBLIOTHEEK_FORMAAT, versie: BIBLIOTHEEK_VERSIE, naam, regels }, aandacht };
}

/** De tekst van een bestand als bibliotheek. */
export function leesBibliotheekTekst(tekst: string): Leesuitslag {
  if (tekst.length > MAX_TEKENS) return { ok: false, fout: { soort: "teGroot" } };
  let data: unknown;
  try {
    data = JSON.parse(tekst);
  } catch {
    return { ok: false, fout: { soort: "geenJson" } };
  }
  return leesBibliotheek(data);
}

/** De delen van de meegeleverde bibliotheek (één per categorie) als één geheel. */
export function verenigDelen(delen: unknown[]): Leesuitslag {
  return leesBibliotheek({
    formaat: BIBLIOTHEEK_FORMAAT,
    versie: BIBLIOTHEEK_VERSIE,
    naam: { en: "Weights library", nl: "Gewichtenbibliotheek" },
    regels: delen.flatMap((d) => {
      const regels = (d as { regels?: unknown } | null)?.regels;
      return Array.isArray(regels) ? regels : [];
    }),
  });
}

/**
 * Als tekst voor een bestand. Elke regel staat op één regel tekst, zodat een wijziging bij
 * het vergelijken van twee bestanden één regel raakt en niet tien.
 */
export function bibliotheekAlsTekst(b: Bibliotheek): string {
  const regels = b.regels.map((r) => `    ${JSON.stringify(r)}`).join(",\n");
  return `{\n  "formaat": ${JSON.stringify(b.formaat)},\n  "versie": ${b.versie},\n  "naam": ${JSON.stringify(b.naam)},\n  "regels": [\n${regels}\n  ]\n}\n`;
}

// ── De eigen bibliotheek ────────────────────────────────────────────────────

/** Wat de gebruiker zelf heeft geopend of aangevuld. */
export interface EigenStand {
  eigen: Bibliotheek | null;
  /** Er is iets veranderd dat nog niet naar een bestand is geschreven. */
  gewijzigd: boolean;
}

export type Bestandsuitslag =
  | { stand: EigenStand; fout: null; aantal: number; aandacht: number; samen?: Samenvoeging }
  | { stand: EigenStand; fout: Leesfout };

function leegEigen(): Bibliotheek {
  return { formaat: BIBLIOTHEEK_FORMAAT, versie: BIBLIOTHEEK_VERSIE, naam: { ...LEEG_EIGEN }, regels: [] };
}

/** Een bestand openen als eigen bibliotheek. Lukt het niet, dan precies dezelfde stand terug. */
export function openBestand(stand: EigenStand, tekst: string): Bestandsuitslag {
  const u = leesBibliotheekTekst(tekst);
  if (!u.ok) return { stand, fout: u.fout };
  return {
    stand: { eigen: u.bibliotheek, gewijzigd: false },
    fout: null,
    aantal: u.bibliotheek.regels.length,
    aandacht: u.aandacht.length,
  };
}

export interface Samenvoeging {
  bibliotheek: Bibliotheek;
  /** Nieuwe regels, met of zonder nieuw id. */
  toegevoegd: number;
  /** Regels die er al precies zo in stonden. */
  gelijk: number;
  /** Regels met een bestaand id en een andere inhoud; die kregen een nieuw id. */
  hernoemd: number;
}

/** Het eerste vrije id: `id`, `id-2`, `id-3`… */
function vrijId(id: string, bezet: (id: string) => boolean): string {
  if (!bezet(id)) return id;
  for (let n = 2; ; n++) {
    const kandidaat = `${id}-${n}`;
    if (!bezet(kandidaat)) return kandidaat;
  }
}

/**
 * Twee bibliotheken samen. Een regel met hetzelfde id en dezelfde inhoud komt één keer voor;
 * met een andere inhoud blijven beide bestaan en krijgt de nieuwe een eigen id, want welke
 * waarde klopt, weet alleen de gebruiker. Nogmaals samenvoegen voegt niets opnieuw toe.
 */
export function voegSamen(doel: Bibliotheek, erbij: Bibliotheek): Samenvoeging {
  const regels = [...doel.regels];
  const perId = new Map(regels.map((r) => [r.id, r]));
  const inhoud = new Set(regels.map((r) => JSON.stringify({ ...r, id: "" })));
  let toegevoegd = 0;
  let gelijk = 0;
  let hernoemd = 0;
  for (const r of erbij.regels) {
    const bestaand = perId.get(r.id);
    if (bestaand && JSON.stringify(bestaand) === JSON.stringify(r)) {
      gelijk++;
      continue;
    }
    if (bestaand && inhoud.has(JSON.stringify({ ...r, id: "" }))) {
      gelijk++;
      continue;
    }
    const id = vrijId(r.id, (x) => perId.has(x));
    if (id !== r.id) hernoemd++;
    const nieuw = id === r.id ? r : { ...r, id };
    regels.push(nieuw);
    perId.set(id, nieuw);
    inhoud.add(JSON.stringify({ ...nieuw, id: "" }));
    toegevoegd++;
  }
  return { bibliotheek: { ...doel, regels }, toegevoegd, gelijk, hernoemd };
}

/** Een bestand samenvoegen met de eigen bibliotheek. Lukt het niet, dan dezelfde stand terug. */
export function samenvoegenBestand(stand: EigenStand, tekst: string): Bestandsuitslag {
  const u = leesBibliotheekTekst(tekst);
  if (!u.ok) return { stand, fout: u.fout };
  const samen = voegSamen(stand.eigen ?? leegEigen(), u.bibliotheek);
  return {
    stand: { eigen: samen.bibliotheek, gewijzigd: true },
    fout: null,
    aantal: u.bibliotheek.regels.length,
    aandacht: u.aandacht.length,
    samen,
  };
}

export function voegRegelToe(stand: EigenStand, regel: Gewichtregel): EigenStand {
  const eigen = stand.eigen ?? leegEigen();
  return { eigen: { ...eigen, regels: [...eigen.regels, regel] }, gewijzigd: true };
}

export function verwijderRegel(stand: EigenStand, id: string): EigenStand {
  if (!stand.eigen) return stand;
  return { eigen: { ...stand.eigen, regels: stand.eigen.regels.filter((r) => r.id !== id) }, gewijzigd: true };
}

/** Wat het invulformulier meegeeft; getallen als tekst, met een komma of een punt. */
export interface RegelInvoer {
  naamEn: string;
  naamNl: string;
  categorie: Categorie;
  d: string;
  rho: string;
  rhoEenheid: "kN/m3" | "kg/m3";
  p: string;
  pEenheid: "kN/m2" | "kg/m2";
  toestand: "" | Toestand;
  leverancier: string;
  regio: string;
  opmerkingEn: string;
  opmerkingNl: string;
  bronTitel: string;
  bronUrl: string;
  bronDatum: string;
}

export const LEGE_INVOER: RegelInvoer = {
  naamEn: "",
  naamNl: "",
  categorie: "materialen",
  d: "",
  rho: "",
  rhoEenheid: "kN/m3",
  p: "",
  pEenheid: "kN/m2",
  toestand: "",
  leverancier: "",
  regio: "",
  opmerkingEn: "",
  opmerkingNl: "",
  bronTitel: "",
  bronUrl: "",
  bronDatum: "",
};

/** Drie decimalen, zonder zwevendekommaruis: 18,1485 → 18,149. */
const opDrie = (v: number) => rond(v, 3);

/** "Mijn vloer 200" → "mijn-vloer-200". */
function alsId(tekst: string): string {
  const s = tekst.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return s.slice(0, 100).replace(/-+$/, "") || "regel";
}

/**
 * Een nieuwe regel uit het formulier, of het veld dat niet klopt. Een waarde in kg gaat om naar
 * kN, en de omrekening komt in de opmerking te staan zodat hij aan de waarde te zien blijft.
 */
export function maakRegel(i: RegelInvoer, bestaand: ReadonlySet<string>): { regel: Gewichtregel; veld?: undefined } | { veld: string; regel?: undefined } {
  const naamEn = i.naamEn.trim() || i.naamNl.trim();
  if (!naamEn) return { veld: "naam" };
  const getalVan = (s: string) => (s.trim() === "" ? undefined : getal(s));
  const d = getalVan(i.d);
  const rhoIn = getalVan(i.rho);
  const pIn = getalVan(i.p);
  if (d !== undefined && !isGetal(d)) return { veld: "d" };
  if (rhoIn !== undefined && !isGetal(rhoIn)) return { veld: "rho" };
  if (pIn !== undefined && !isGetal(pIn)) return { veld: "p" };
  if (rhoIn === undefined && pIn === undefined) return { veld: "waarde" };
  const bronTitel = i.bronTitel.trim();
  if (!bronTitel) return { veld: "bron.titel" };
  const url = i.bronUrl.trim();
  if (url && !leesUrl(url)) return { veld: "bron.url" };
  const datum = i.bronDatum.trim();
  if (datum && !DATUM.test(datum)) return { veld: "bron.datum" };

  const pKg = i.pEenheid === "kg/m2" ? pIn : undefined;
  const rhoKg = i.rhoEenheid === "kg/m3" ? rhoIn : undefined;
  const reken = [
    pKg !== undefined ? `${pKg} kg/m² × 0.00981` : "",
    rhoKg !== undefined ? `${rhoKg} kg/m³ × 0.00981` : "",
  ].filter(Boolean).join("; ");
  const samen = (tekst: string, som: string) => [tekst.trim(), som].filter(Boolean).join("; ");
  const opEn = samen(i.opmerkingEn, reken);
  const opNl = samen(i.opmerkingNl, reken.replace(/0\.00981/g, "0,00981"));

  const naamNl = i.naamNl.trim() || (i.naamEn.trim() ? "" : naamEn);
  const uit = leesRegel({
    id: vrijId(`eigen-${alsId(naamEn)}`, (x) => bestaand.has(x)),
    categorie: i.categorie,
    naam: { en: naamEn, ...(naamNl ? { nl: naamNl } : {}) },
    d,
    rho: rhoIn === undefined ? undefined : rhoKg !== undefined ? opDrie(rhoKg * KG_NAAR_KN) : rhoIn,
    p: pIn === undefined ? undefined : pKg !== undefined ? opDrie(pKg * KG_NAAR_KN) : pIn,
    toestand: i.toestand || undefined,
    leverancier: i.leverancier.trim() || undefined,
    regio: i.regio.trim() || undefined,
    opmerking: opEn || opNl ? { en: opEn || opNl, ...(opNl ? { nl: opNl } : {}) } : undefined,
    bron: { titel: bronTitel, url: url || undefined, datum: datum || undefined },
  });
  return isRegelfout(uit) ? { veld: uit.veld } : { regel: uit };
}

// ── Bladeren ────────────────────────────────────────────────────────────────

export interface ZichtbareRegel {
  regel: Gewichtregel;
  /** Komt uit de eigen bibliotheek; alleen die regels kun je weghalen. */
  eigen: boolean;
}

/** Wat er te zien is: de eigen regels, en de meegeleverde voor zover die geen eigen versie hebben. */
export function zichtbareRegels(meegeleverd: readonly Gewichtregel[], eigen: Bibliotheek | null): ZichtbareRegel[] {
  const eigenIds = new Set(eigen?.regels.map((r) => r.id) ?? []);
  return [
    ...(eigen?.regels.map((regel) => ({ regel, eigen: true })) ?? []),
    ...meegeleverd.filter((r) => !eigenIds.has(r.id)).map((regel) => ({ regel, eigen: false })),
  ];
}

/** Per categorie, dan op naam met getallen op grootte: 200 mm vóór 1000 mm. */
export function sorteerRegels(regels: readonly Gewichtregel[], taal: string): Gewichtregel[] {
  const orde = new Intl.Collator(taal, { numeric: true, sensitivity: "base" });
  return [...regels].sort(
    (a, b) =>
      CATEGORIEEN.indexOf(a.categorie) - CATEGORIEEN.indexOf(b.categorie) ||
      orde.compare(inTaal(a.naam, taal), inTaal(b.naam, taal)) ||
      a.id.localeCompare(b.id),
  );
}

/** Kleine letters, zonder accenten: "Lücking" vind je ook als "lucking". */
function zoekvorm(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export interface Zoekregel<R extends Gewichtregel = Gewichtregel> {
  regel: R;
  tekst: string;
}

/** Alles waarop een regel te vinden is, één keer opgebouwd zodat typen niet stokt. */
export function zoekIndex(regels: readonly Gewichtregel[], taal: string): Zoekregel[] {
  return sorteerRegels(regels, taal).map((regel) => ({
    regel,
    tekst: zoekvorm(
      [
        regel.id,
        ...Object.values(regel.naam),
        ...Object.values(regel.opmerking ?? {}),
        regel.leverancier ?? "",
        regel.regio ?? "",
        regel.toestand ?? "",
        regel.bron.titel,
      ].join(" "),
    ),
  }));
}

export interface GewichtenFilter {
  tekst: string;
  categorie: string;
  leverancier: string;
  regio: string;
}

/** Elk ingevuld filter telt; van de zoektekst moeten alle woorden voorkomen, in elke volgorde. */
export function filterRegels(index: readonly Zoekregel[], f: GewichtenFilter): Gewichtregel[] {
  const woorden = zoekvorm(f.tekst).split(/\s+/).filter(Boolean);
  return index
    .filter(
      ({ regel, tekst }) =>
        (!f.categorie || regel.categorie === f.categorie) &&
        (!f.leverancier || regel.leverancier === f.leverancier) &&
        (!f.regio || regel.regio === f.regio) &&
        woorden.every((w) => tekst.includes(w)),
    )
    .map((z) => z.regel);
}

/** De waarden waarop een filter kan staan, op alfabet. */
export function filterOpties(regels: readonly Gewichtregel[], veld: "leverancier" | "regio"): string[] {
  const orde = new Intl.Collator("en", { sensitivity: "base" });
  return [...new Set(regels.flatMap((r) => r[veld] ?? []))].sort(orde.compare);
}

// ── Invoegen in een opbouw ──────────────────────────────────────────────────

/** Het gewicht per m² dat de regel oplevert: een ingevulde p gaat voor d × ρ. */
export function effectieveP(r: Gewichtregel): number | undefined {
  if (r.p !== undefined) return r.p;
  return r.d !== undefined && r.rho !== undefined ? r.d * r.rho : undefined;
}

/**
 * De regel als laag van een vlakopbouw: een kopie in getallen, die daarna gewone invoer is.
 *
 * De kolom d van het rapport toont drie decimalen. Een dunne plaat (0,7 mm) zou daar 0,001 worden
 * en dan klopt d × ρ niet meer: zo'n dikte blijft leeg en het gewicht komt als p. Ook een dikte
 * zonder ρ blijft leeg, want daar valt niets mee te rekenen; hij staat in de naam.
 */
export function alsLaagUitRegel(r: Gewichtregel, taal: string): Laag {
  const naam = inTaal(r.naam, taal);
  const d = r.d !== undefined && r.rho !== undefined && Math.abs(opDrie(r.d) - r.d) < 1e-9 ? r.d : undefined;
  const p = r.p ?? (r.d !== undefined && r.rho !== undefined && d === undefined ? r.d * r.rho : undefined);
  const g: Gewicht = { naam, ...(d !== undefined ? { d } : {}), ...(r.rho !== undefined ? { rho: r.rho } : {}), ...(p !== undefined ? { p } : {}) };
  return alsLaag(g);
}

/** "kanaalplaatvloer 200 mm" → "Kanaalplaatvloer 200 mm". */
function metHoofdletter(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** De regel als nieuwe vlakopbouw van één laag, met zijn naam als kop. */
export function alsOpbouwUitRegel(r: Gewichtregel, taal: string): Opbouw {
  return { soort: "vlak", naam: metHoofdletter(inTaal(r.naam, taal)), lagen: [alsLaagUitRegel(r, taal)] };
}

/**
 * De regel als laag van een gevelopbouw: daar telt p × h × vulling, dus zonder gewicht per m²
 * (een materiaal met alleen ρ) kan het niet; dan null. Hoogte en vulling vult de constructeur in.
 */
export function alsGevellaagUitRegel(r: Gewichtregel, taal: string): Gevellaag | null {
  const p = effectieveP(r);
  if (p === undefined) return null;
  const decimalen = p < 0.1 ? 3 : 2;
  return { naam: inTaal(r.naam, taal), p: fmt(p, decimalen), h: "", vulling: "" };
}

/**
 * De taal waarin een naam in het rapport komt: die van het rapport als het die heeft, anders die
 * van de app. Zo volgt een laag na het vertalen van het rapport vanzelf `rapport.taal`.
 */
export function taalVoorRapport(rapport: object, appTaal: string): string {
  const taal = (rapport as { taal?: unknown }).taal;
  return typeof taal === "string" && taal ? taal : appTaal.split("-")[0];
}
