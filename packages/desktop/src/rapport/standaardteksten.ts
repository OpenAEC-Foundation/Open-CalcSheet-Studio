/**
 * Meegeleverde tekstvarianten per tekstonderdeel van het rapport.
 *
 * De teksten staan per taal in i18n/locales/<taal>/rapportteksten.json (teksten). Engels
 * is de bron, elke andere taal een vertaling (meertalig.ts). Een rapport bewaart de tekst
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
import { BRONTAAL, bundel } from "../i18n/talen.ts";
import { inTaal, leesMeertalig, mt, RAPPORTTEKSTEN, type Meertalig } from "./meertalig.ts";
import { heeftSleutel, isGeldigId } from "./opzet.ts";

export interface Tekstvariant { label: Meertalig; tekst: Meertalig; }

/** De teksten in de brontaal: hun indeling (tekst-ids en varianten) geldt voor elke taal. */
const BRON = bundel(BRONTAAL, RAPPORTTEKSTEN)?.teksten as Record<string, readonly unknown[]>;

/**
 * Per tekst-id de meegeleverde varianten; de eerste is de standaard in een nieuw rapport.
 * De teksten zelf staan in rapportteksten.json onder teksten.<id>.<n>.label en .tekst.
 */
export const STANDAARD_TEKSTEN: Record<string, readonly Tekstvariant[]> = Object.fromEntries(
  Object.entries(BRON).map(([id, lijst]) => [
    id,
    lijst.map((_, n) => ({ label: mt(`teksten.${id}.${n}.label`), tekst: mt(`teksten.${id}.${n}.tekst`) })),
  ]),
);

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
