import { create } from "zustand";
import { FORMULES, type Formule, type LibraryGroep, type Tekst } from "../components/ribbon/formules.ts";

/**
 * De voorbeelden van de Library. Ze zitten niet in de installer: de app haalt ze bij
 * het opstarten uit de map library/ van de openbare repository, zodat een fout in een
 * voorbeeld meteen bij iedereen hersteld is (docs/library.md). De laatste stand staat in
 * de instellingen, voor als er geen verbinding is; zie libraryLaden.ts.
 *
 * Dit deel is puur en laadt ook in Node, voor de controlescripts en de API. Wat er
 * binnenkomt is invoer van buiten: het moet helemaal kloppen, anders blijft de vorige
 * stand staan. In een blad komt een voorbeeld pas als de gebruiker het invoegt, en dan
 * gelden dezelfde regels als voor tekst uit een bestand van iemand anders.
 */

export const LIBRARY_BRON = "https://raw.githubusercontent.com/OpenAEC-Foundation/Open-CalcSheet-Studio/main/library";

/** De versie van index.json die deze app begrijpt. */
const FORMAAT = 1;
const MAX_TEKENS = 256 * 1024;
const MAX_VOORBEELDEN = 500;
const TIJDLIMIET_MS = 15000;

const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PAD = /^[a-z0-9-]+(\/[a-z0-9-]+)*\.(nl|en)\.cpd$/;

export interface LibraryInhoud {
  groepen: LibraryGroep[];
  voorbeelden: Formule[];
  /** Wanneer deze stand is opgehaald, als ISO-tijd. */
  opgehaald: string;
}

/** De index vraagt een nieuwere app: opnieuw proberen helpt dan niet. */
export class LibraryTeNieuw extends Error {}

const isTekst = (x: unknown): x is Tekst =>
  typeof x === "object" && x !== null && typeof (x as Tekst).nl === "string" && typeof (x as Tekst).en === "string";

const isSoort = (x: unknown): x is Formule["soort"] => x === undefined || x === "grafiek" || x === "tekening";

const isTekstLijst = (x: unknown): x is string[] => Array.isArray(x) && x.every((v) => typeof v === "string");

function isGroep(x: unknown): x is LibraryGroep {
  const g = x as LibraryGroep | null;
  return typeof g === "object" && g !== null && typeof g.id === "string" && ID.test(g.id) && isTekst(g.naam) && isTekst(g.onder);
}

/** Eén regel uit de index, nog zonder de tekst van het blad. */
type IndexRegel = Omit<Formule, "code" | "codeEn"> & { nl: string; en: string };

function isRegel(x: unknown, groepen: Set<string>): x is IndexRegel {
  const r = x as IndexRegel | null;
  return typeof r === "object" && r !== null
    && typeof r.id === "string" && ID.test(r.id)
    && typeof r.groep === "string"
    && typeof r.library === "string" && groepen.has(r.library)
    && isTekst(r.naam)
    && (r.bron === undefined || typeof r.bron === "string")
    && (r.uitleg === undefined || isTekst(r.uitleg))
    && (r.projectvariabelen === undefined || isTekstLijst(r.projectvariabelen))
    && isSoort(r.soort)
    && (r.beeld === undefined || (typeof r.beeld === "string" && ID.test(r.beeld)))
    && typeof r.nl === "string" && PAD.test(r.nl)
    && typeof r.en === "string" && PAD.test(r.en);
}

/** Een id die de ingebouwde formules ook gebruiken, zou er twee keer staan. */
const bestaandeIds = new Set(FORMULES.map((f) => f.id));

function controleerIndex(index: unknown): { groepen: LibraryGroep[]; regels: IndexRegel[] } {
  const i = index as { formaat?: unknown; groepen?: unknown; voorbeelden?: unknown } | null;
  if (typeof i !== "object" || i === null || typeof i.formaat !== "number") throw new Error("index.json is onleesbaar");
  if (i.formaat > FORMAAT) throw new LibraryTeNieuw(`formaat ${i.formaat}`);
  if (!Array.isArray(i.groepen) || !i.groepen.every(isGroep)) throw new Error("index.json: ongeldige groep");
  const groepen = i.groepen as LibraryGroep[];
  const groepIds = new Set(groepen.map((g) => g.id));
  const lijst: unknown = i.voorbeelden;
  if (!Array.isArray(lijst) || lijst.length > MAX_VOORBEELDEN) throw new Error("index.json: ongeldige lijst");
  const regels: IndexRegel[] = [];
  const gezien = new Set<string>();
  for (const r of lijst) {
    if (!isRegel(r, groepIds)) throw new Error("index.json: ongeldig voorbeeld");
    if (gezien.has(r.id) || bestaandeIds.has(r.id)) throw new Error(`index.json: dubbel id ${r.id}`);
    gezien.add(r.id);
    regels.push(r);
  }
  return { groepen, regels };
}

/** De tekst van een blad: regeleinden gelijk, en geen lege regels aan het eind. */
const schoon = (tekst: string) => tekst.replace(/\r\n?/g, "\n").replace(/\n+$/, "");

/**
 * Haalt de hele Library op. Lukt één bestand niet, dan gooit dit: liever de vorige
 * complete stand dan een halve.
 */
export async function haalLibrary(bron: string, lees: typeof fetch = fetch): Promise<LibraryInhoud> {
  const haal = async (pad: string) => {
    const antwoord = await lees(`${bron}/${pad}`, { cache: "no-store", signal: AbortSignal.timeout(TIJDLIMIET_MS) });
    if (!antwoord.ok) throw new Error(`${pad}: HTTP ${antwoord.status}`);
    const tekst = await antwoord.text();
    if (tekst.length > MAX_TEKENS) throw new Error(`${pad}: te groot`);
    return tekst;
  };
  const { groepen, regels } = controleerIndex(JSON.parse(await haal("index.json")));
  const voorbeelden = await Promise.all(regels.map(async ({ nl, en, ...regel }): Promise<Formule> => {
    const [code, codeEn] = await Promise.all([haal(nl), haal(en)]);
    return { ...regel, code: schoon(code), codeEn: schoon(codeEn) };
  }));
  return { groepen, voorbeelden, opgehaald: new Date().toISOString() };
}

/** De stand uit de instellingen, of null als die er niet is of niet meer klopt. */
export function leesBewaardeLibrary(x: unknown): LibraryInhoud | null {
  const b = x as LibraryInhoud | null;
  if (typeof b !== "object" || b === null || typeof b.opgehaald !== "string") return null;
  if (!Array.isArray(b.groepen) || !b.groepen.every(isGroep) || !Array.isArray(b.voorbeelden)) return null;
  const groepen = new Set(b.groepen.map((g) => g.id));
  const geldig = b.voorbeelden.every((f) =>
    typeof f.id === "string" && ID.test(f.id) && !bestaandeIds.has(f.id)
    && typeof f.groep === "string" && typeof f.library === "string" && groepen.has(f.library)
    && isTekst(f.naam) && isSoort(f.soort)
    && typeof f.code === "string" && typeof f.codeEn === "string");
  return geldig ? b : null;
}

interface LibraryStand {
  groepen: LibraryGroep[];
  voorbeelden: Formule[];
  opgehaald: string | null;
  bezig: boolean;
  fout: "verbinding" | "teNieuw" | null;
}

export const useLibrary = create<LibraryStand>(() => ({
  groepen: [],
  voorbeelden: [],
  opgehaald: null,
  bezig: true,
  fout: null,
}));

/** Alles voor het formulevenster en de API: de ingebouwde formules plus de Library. */
export const alleFormules = (): Formule[] => [...FORMULES, ...useLibrary.getState().voorbeelden];
