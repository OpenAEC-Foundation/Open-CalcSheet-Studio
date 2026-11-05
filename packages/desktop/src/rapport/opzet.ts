/**
 * De hoofdstukindeling van het constructierapport, op één plek vastgelegd.
 *
 * OPZET is het ingebouwde template: alle onderdelen die een rapport volgens ons format
 * kán hebben. Een rapport kan een eigen kopie hebben (Rapport.opzet, zie template.ts);
 * opzetVan() geeft wat er voor dit rapport geldt. bouwOpzet() maakt daar de indeling van
 * één rapport van: lege optionele onderdelen vallen weg, de nummering loopt daarna door,
 * en hoofdstuk Berekeningen krijgt per rekenblad een paragraaf. Zonder rekenbladen (een
 * uitgangspuntendocument) valt Berekeningen zelf weg. Paneel, inhoudsopgave en afdruk lezen
 * allemaal deze uitkomst, zodat ze het nooit oneens zijn over wat "4.6" is.
 *
 * De titels zijn meertalig; bouwOpzet() geeft ze in rapport.taal. De ids en de ankers
 * (`data-inhoud`) veranderen niet met de taal.
 */
import { inTaal, leesMeertalig, type Meertalig } from "./meertalig.ts";
import type { Rapport } from "./model.ts";

export type Inhoud =
  | "tekst" | "rol"
  | "bouwwerk" | "brand" | "materialen" | "conservering" | "factoren" | "bestaand" | "vervormingen"
  | "sneeuw" | "wind" | "veranderlijk" | "blijvend"
  | "berekeningen";

export interface Knoop {
  /** Ook de sleutel in rapport.teksten als inhoud "tekst" is (of een tekst bij een tabel heeft). */
  id: string;
  titel: Meertalig;
  /**
   * Kop als het rapport geen bestaande situatie beschrijft (nieuwbouw, zie
   * beschrijftBestaand); anders geldt `titel`. Alleen de kop verandert: de
   * tekst blijft onder hetzelfde id staan. Geldt alleen met
   * rapport.opmaak.constructieprincipe (sinds versie 3 van de rapportopbouw).
   */
  titelNieuwbouw?: Meertalig;
  /** 1 hoofdstuk, 2 paragraaf (genummerd), 3 blok (vet, lijn eronder), 4 subblok (vet-cursief). */
  niveau: 1 | 2 | 3 | 4;
  inhoud?: Inhoud;
  /** Weglaten als er niets in staat. */
  optioneel?: boolean;
  /** Standaard: begint op een nieuwe pagina. */
  nieuwePagina?: boolean;
  /** Inspringen van de inhoud in kolommen (hoofdstuk 4 en 5 springen één kolom in). */
  inspringen?: 0 | 1;
  kinderen?: Knoop[];
}

/** Een tekstonderdeel: kop plus tekst uit rapport.teksten, optioneel. */
function tekst(id: string, titel: Meertalig, niveau: 3 | 4): Knoop {
  return { id, titel, niveau, inhoud: "tekst", optioneel: true };
}

/** Maakt een waarde onveranderlijk, tot op de bodem. */
function diepVast<T>(x: T): T {
  if (x !== null && typeof x === "object") {
    for (const v of Object.values(x)) diepVast(v);
    Object.freeze(x);
  }
  return x;
}

/** Het ingebouwde template. Vast: wie iets wil veranderen, werkt in een kopie (template.ts). */
export const OPZET: readonly Knoop[] = diepVast<Knoop[]>([
  { id: "inleiding", titel: { en: "Introduction", nl: "Inleiding" }, niveau: 1, inhoud: "tekst", nieuwePagina: true },
  {
    // Sinds versie 2 van de rapportopbouw op een nieuwe pagina; oudere rapporten houden hun opmaak (model.ts).
    id: "projectgegevens", titel: { en: "Project details", nl: "Projectgegevens" }, niveau: 1, nieuwePagina: true,
    kinderen: [
      { id: "projectomschrijving", titel: { en: "Project description", nl: "Projectomschrijving" }, niveau: 2, inhoud: "tekst" },
      { id: "rol", titel: { en: "Role in the project and scope of this report", nl: "Rol binnen het project en bereik rapport" }, niveau: 2, inhoud: "rol" },
    ],
  },
  {
    id: "constructie", titel: { en: "Structure", nl: "Constructie" }, niveau: 1, nieuwePagina: true,
    kinderen: [
      {
        id: "toelichting", titel: { en: "Description of the structure", nl: "Toelichting constructie" }, niveau: 2,
        kinderen: [
          {
            id: "bestaand", titel: { en: "Existing situation", nl: "Bestaande situatie" }, niveau: 3, optioneel: true,
            kinderen: [
              tekst("bestaand-verticaal", { en: "Vertical load path", nl: "Verticale belastingafdracht" }, 4),
              tekst("bestaand-stabiliteit", { en: "Stability", nl: "Stabiliteit" }, 4),
              tekst("bestaand-fundatie", { en: "Foundation", nl: "Fundatie" }, 4),
              tekst("bestaand-beoordeling", { en: "Assessment of the existing structure", nl: "Beoordeling bestaande constructie" }, 4),
            ],
          },
          // Bij nieuwbouw is er niets om te wijzigen: dan beschrijft dit blok het constructieprincipe.
          // Sinds versie 3 van de rapportopbouw; oudere rapporten houden Wijziging (model.ts).
          {
            ...tekst("wijziging", { en: "Alteration", nl: "Wijziging" }, 3),
            titelNieuwbouw: { en: "Structural concept", nl: "Constructieprincipe" },
          },
          tekst("belendingen", { en: "Adjoining buildings", nl: "Belendingen" }, 3),
        ],
      },
      {
        id: "uitvoering", titel: { en: "Notes for construction", nl: "Aandachtspunten bij uitvoering" }, niveau: 2, nieuwePagina: true,
        kinderen: [
          tekst("uitvoering-bestaand", { en: "Existing situation", nl: "Bestaande situatie" }, 3),
          tekst("uitvoering-verbouw", { en: "Alteration, renovation", nl: "Verbouw, renovatie" }, 3),
          tekst("uitvoering-nieuwbouw", { en: "New construction", nl: "Nieuwbouw" }, 3),
        ],
      },
    ],
  },
  {
    id: "uitgangspunten", titel: { en: "Design basis", nl: "Uitgangspunten" }, niveau: 1, nieuwePagina: true, inspringen: 1,
    kinderen: [
      { id: "bouwwerk", titel: { en: "Structural design basis", nl: "Constructieve uitgangspunten bouwwerk" }, niveau: 2, inhoud: "bouwwerk" },
      { id: "brand", titel: { en: "Structural fire design", nl: "Bouwconstructies bij brand" }, niveau: 2, inhoud: "brand" },
      { id: "materialen", titel: { en: "Materials", nl: "Toegepaste materialen" }, niveau: 2, inhoud: "materialen" },
      { id: "conservering", titel: { en: "Corrosion protection of steelwork", nl: "Conservering staalconstructie" }, niveau: 2, inhoud: "conservering" },
      { id: "factoren", titel: { en: "Partial factors and combinations of actions", nl: "Belastingfactoren en belastingcombinaties" }, niveau: 2, inhoud: "factoren" },
      // Valt weg als uitgangspunten.bestaand.opnemen false is (nieuwbouw).
      { id: "bestaand-situatie", titel: { en: "Existing situation", nl: "Bestaande situatie" }, niveau: 2, inhoud: "bestaand", optioneel: true },
      { id: "trillingen", titel: { en: "Vibrations", nl: "Trillingen" }, niveau: 2, inhoud: "tekst" },
      // De tekst `vervormingen` is de inleidende zin boven de tabel.
      { id: "vervormingen", titel: { en: "Deformations and horizontal displacements", nl: "Vervormingen en horizontale verplaatsingen" }, niveau: 2, inhoud: "vervormingen" },
      { id: "montage", titel: { en: "Erection and construction stages", nl: "Montage en bouwfase" }, niveau: 2, inhoud: "tekst" },
      { id: "rekenprogrammatuur", titel: { en: "Calculation software", nl: "Toegepaste rekenprogrammatuur" }, niveau: 2, inhoud: "tekst" },
      { id: "temperatuur", titel: { en: "Thermal actions", nl: "Temperatuursinvloeden" }, niveau: 2, inhoud: "tekst" },
      { id: "aardbeving", titel: { en: "Seismic actions", nl: "Aardbevingen" }, niveau: 2, inhoud: "tekst" },
    ],
  },
  {
    id: "belastingen", titel: { en: "Loads", nl: "Belastingen" }, niveau: 1, nieuwePagina: true, inspringen: 1,
    kinderen: [
      // De tekst `sneeuw` staat onder de berekening van s.
      { id: "sneeuw", titel: { en: "Snow loads(Q)", nl: "Sneeuwbelastingen(Q)" }, niveau: 2, inhoud: "sneeuw" },
      { id: "wind", titel: { en: "Wind loads(Q)", nl: "Windbelastingen(Q)" }, niveau: 2, inhoud: "wind" },
      { id: "regenwater", titel: { en: "Rainwater ponding(Q)", nl: "Regenwateraccumulatie(Q)" }, niveau: 2, inhoud: "tekst" },
      { id: "veranderlijk", titel: { en: "Other variable loads(Q)", nl: "Overige veranderlijke belastingen(Q)" }, niveau: 2, inhoud: "veranderlijk" },
      // Valt weg zonder opbouwen.
      { id: "blijvend", titel: { en: "Permanent loads(G)", nl: "Blijvende belastingen(G)" }, niveau: 2, inhoud: "blijvend", optioneel: true },
    ],
  },
  // Valt weg zonder rekenbladen.
  { id: "berekeningen", titel: { en: "Calculations", nl: "Berekeningen" }, niveau: 1, inhoud: "berekeningen", optioneel: true, nieuwePagina: true },
]);

/** De opzet die voor dit rapport geldt: zijn eigen kopie, of anders het ingebouwde template. */
export function opzetVan(r: Pick<Rapport, "opzet">): readonly Knoop[] {
  return r.opzet ?? OPZET;
}

/** Alle knopen in de volgorde van het rapport, diepte eerst. */
export function knopenVan(lijst: readonly Knoop[]): Knoop[] {
  return lijst.flatMap((k) => [k, ...knopenVan(k.kinderen ?? [])]);
}

/** Heeft deze knoop inhoud die de app zelf uitrekent en invult? Dan kun je hem plaatsen, niet vervangen. */
export function isRekenblok(k: Pick<Knoop, "inhoud">): boolean {
  return k.inhoud !== undefined && k.inhoud !== "tekst";
}

/**
 * Alle rekenblokken, in de volgorde van het ingebouwde template. Hun id ligt vast: daar hangen
 * hun tekst (MET_TEKST) en de keuze voor een nieuwe pagina aan. `inspringen` is wat ze in het
 * ingebouwde template van hun hoofdstuk erven: elders houden ze daarmee hetzelfde beeld.
 */
export const REKENBLOKKEN: readonly Knoop[] = diepVast((() => {
  const uit: Knoop[] = [];
  const loop = (lijst: readonly Knoop[], inspringen: 0 | 1 | undefined) => {
    for (const k of lijst) {
      const erft = k.inspringen ?? inspringen;
      if (isRekenblok(k)) {
        const { kinderen: _geen, nieuwePagina: _pagina, ...blok } = k;
        uit.push(erft === undefined ? blok : { ...blok, inspringen: erft });
      }
      loop(k.kinderen ?? [], erft);
    }
  };
  loop(OPZET, undefined);
  return uit;
})());

/** Inhoudssoorten met een tekst in rapport.teksten naast hun tabel. */
const MET_TEKST: readonly Inhoud[] = ["rol", "vervormingen", "sneeuw"];

/** Heeft deze knoop een tekst in rapport.teksten (onder zijn eigen id)? */
export function heeftTekst(k: Knoop): boolean {
  return k.inhoud === "tekst" || (k.inhoud !== undefined && MET_TEKST.includes(k.inhoud));
}

/** De tekst-ids van een opzet in de volgorde van het rapport: de sleutels van rapport.teksten. */
export function tekstIds(opzet: readonly Knoop[]): string[] {
  return knopenVan(opzet).filter(heeftTekst).map((k) => k.id);
}

/** De tekst-ids van het ingebouwde template. */
export const TEKST_IDS: readonly string[] = tekstIds(OPZET);

// ── Een opzet uit een bestand ───────────────────────────────────────────────
// Een opzet komt uit een template of een projectbestand, en dus mogelijk van iemand anders
// of met de hand bewerkt. Daarna gelden in de hele app deze regels: elk id één keer en
// veilig als sleutel, elk rekenblok hooguit één keer onder zijn vaste id en zonder kinderen,
// Berekeningen op het hoogste niveau, en een niveau gelijk aan de diepte (hoofdstuk 1 tot
// subblok 4), zodat alleen paragrafen een nummer krijgen.

/** Wat er bij het lezen is hersteld; de app zet het in de taal van de gebruiker. */
export interface OpzetMelding {
  soort: "geenKnoop" | "onbekendeInhoud" | "dubbelId" | "ongeldigId" | "dubbelBlok" | "geenTitel" | "teDiep" | "blokMetKinderen" | "berekeningenVerplaatst" | "teVeel";
  /** Het onderdeel waar het om gaat, zoals het in het bestand staat. */
  id?: string;
  /** De waarde die niet klopte. */
  waarde?: string;
}

/**
 * Bruikbaar als id: een sleutel in rapport.teksten, een stuk van een pad (leesPad, dus geen
 * punt en geen alleen-cijfers) en een anker op papier. Niets wat elk object al heeft
 * ("constructor"), en niet de vorm van het anker van een blad of een bijlage.
 */
export function isGeldigId(x: unknown): x is string {
  return typeof x === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(x) && !(x in Object.prototype) && !/^(?:ex|bijlage)-/.test(x);
}

const BLOK_VAN = new Map<unknown, Knoop>(REKENBLOKKEN.map((k) => [k.inhoud, k]));
const BLOK_IDS = new Set<unknown>(REKENBLOKKEN.map((k) => k.id));
const MAX_KNOPEN = 2000;
const MAX_DIEPTE = 32;

/** Een id dat nergens in `bezet` staat. Bezet is ook wat ooit tekst had: een nieuw onderdeel erft niets. */
export function vrijId(bezet: ReadonlySet<string>): string {
  for (let n = 1; ; n++) {
    const id = `eigen-${n}`;
    if (!bezet.has(id)) return id;
  }
}

const object = (x: unknown) => (x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : undefined);

/**
 * Een opzet uit een bestand, per veld gecontroleerd. Wat niet klopt, wordt hersteld als dat kan
 * en valt anders weg; beide komen in `meldingen`. Geen lijst geeft een lege opzet.
 */
export function normaliseerOpzet(x: unknown, begin: Knoop["niveau"] = 1): { opzet: Knoop[]; meldingen: OpzetMelding[] } {
  const meldingen: OpzetMelding[] = [];
  // Elk id in het bestand telt als bezet, ook als het verderop staat: een nieuw id botst met niets.
  const bezet = new Set<string>();
  const verzamel = (lijst: unknown, diepte: number) => {
    if (!Array.isArray(lijst) || diepte > MAX_DIEPTE) return;
    for (const el of lijst as unknown[]) {
      const o = object(el);
      if (typeof o?.id === "string") bezet.add(o.id);
      verzamel(o?.kinderen, diepte + 1);
    }
  };
  verzamel(x, 0);

  const gezien = new Set<string>();
  const naarWortel: Knoop[] = [];
  let aantal = 0;
  const nieuwId = () => {
    const id = vrijId(bezet);
    bezet.add(id);
    return id;
  };

  const lees = (lijst: unknown, niveau: Knoop["niveau"], diepte: number): Knoop[] => {
    if (!Array.isArray(lijst)) return [];
    if (diepte > MAX_DIEPTE) {
      meldingen.push({ soort: "teDiep" });
      return [];
    }
    const uit: Knoop[] = [];
    for (const el of lijst as unknown[]) {
      if (aantal >= MAX_KNOPEN) {
        if (!meldingen.some((m) => m.soort === "teVeel")) meldingen.push({ soort: "teVeel" });
        break;
      }
      const o = object(el);
      if (!o) {
        meldingen.push({ soort: "geenKnoop" });
        continue;
      }
      aantal++;
      const genoemd = typeof o.id === "string" ? o.id : undefined;
      const blok = BLOK_VAN.get(o.inhoud);
      const inhoud = blok?.inhoud ?? (o.inhoud === "tekst" ? "tekst" : undefined);
      const onbekend = o.inhoud !== undefined && inhoud === undefined;
      if (onbekend) meldingen.push({ soort: "onbekendeInhoud", id: genoemd, waarde: String(o.inhoud) });
      const nieuwePagina = o.nieuwePagina === true ? { nieuwePagina: true } : {};
      const inspringen = o.inspringen === 0 || o.inspringen === 1 ? { inspringen: o.inspringen as 0 | 1 } : {};

      if (blok) {
        // Een rekenblok rekent zelf: wat eronder staat, komt ernaast.
        const naast = lees(o.kinderen, niveau, diepte + 1);
        if (naast.length > 0) meldingen.push({ soort: "blokMetKinderen", id: blok.id });
        if (gezien.has(blok.id)) {
          meldingen.push({ soort: "dubbelBlok", id: blok.id });
          uit.push(...naast);
          continue;
        }
        gezien.add(blok.id);
        const knoop: Knoop = {
          id: blok.id,
          titel: leesMeertalig(o.titel) ?? { ...blok.titel },
          niveau,
          inhoud: blok.inhoud,
          ...(blok.optioneel ? { optioneel: true } : {}),
          ...nieuwePagina,
          ...inspringen,
        };
        if (blok.inhoud === "berekeningen" && niveau !== 1) {
          meldingen.push({ soort: "berekeningenVerplaatst", id: blok.id });
          naarWortel.push({ ...knoop, niveau: 1 });
          uit.push(...naast);
          continue;
        }
        uit.push(knoop, ...naast);
        continue;
      }

      // Een onbekende inhoud zonder kinderen: er blijft niets over om te tonen.
      if (onbekend && !(Array.isArray(o.kinderen) && o.kinderen.length > 0)) continue;

      let id = genoemd ?? "";
      if (!isGeldigId(o.id) || BLOK_IDS.has(o.id)) {
        meldingen.push({ soort: "ongeldigId", waarde: typeof o.id === "string" ? o.id : "" });
        id = nieuwId();
      } else if (gezien.has(id)) {
        meldingen.push({ soort: "dubbelId", id });
        id = nieuwId();
      }
      gezien.add(id);

      let titel = leesMeertalig(o.titel);
      if (!titel) {
        meldingen.push({ soort: "geenTitel", id });
        titel = { en: id };
      }
      const titelNieuwbouw = leesMeertalig(o.titelNieuwbouw);
      const knoop: Knoop = {
        id,
        titel,
        ...(titelNieuwbouw ? { titelNieuwbouw } : {}),
        niveau,
        ...(inhoud ? { inhoud } : {}),
        ...(o.optioneel === true ? { optioneel: true } : {}),
        ...nieuwePagina,
        ...inspringen,
      };
      if (niveau === 4) {
        const naast = lees(o.kinderen, 4, diepte + 1);
        if (naast.length > 0) meldingen.push({ soort: "teDiep", id });
        uit.push(knoop, ...naast);
        continue;
      }
      const kinderen = lees(o.kinderen, (niveau + 1) as Knoop["niveau"], diepte + 1);
      uit.push(kinderen.length > 0 ? { ...knoop, kinderen } : knoop);
    }
    return uit;
  };

  return { opzet: [...lees(x, begin, 0), ...naarWortel], meldingen };
}

/** Een onderdeel dat uit de opzet is gehaald. Zijn tekst staat nog in rapport.teksten. */
export interface Weggehaald {
  knoop: Knoop;
  /** Waar het stond, om het daar terug te zetten: de ouder, of null voor het hoogste niveau. */
  ouder: string | null;
  plek: number;
}

/** De lijst weggehaalde onderdelen uit een bestand. */
export function leesWeggehaald(x: unknown): Weggehaald[] {
  if (!Array.isArray(x)) return [];
  const uit: Weggehaald[] = [];
  for (const el of x as unknown[]) {
    const o = object(el);
    const k = object(o?.knoop);
    if (!o || !k) continue;
    const begin = k.niveau === 2 || k.niveau === 3 || k.niveau === 4 ? k.niveau : 1;
    const knoop = normaliseerOpzet([k], begin).opzet[0];
    if (!knoop) continue;
    uit.push({
      knoop,
      ouder: isGeldigId(o.ouder) ? o.ouder : null,
      plek: typeof o.plek === "number" && Number.isInteger(o.plek) && o.plek >= 0 ? o.plek : 0,
    });
  }
  return uit;
}

/** Heeft dit object deze sleutel zelf? Een id uit een bestand mag niet bij Object.prototype uitkomen. */
export function heeftSleutel(o: object, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(o, k);
}

/** Zijn twee waarden inhoudelijk gelijk? De volgorde van de sleutels telt niet. */
export function zelfdeWaarde(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a === null || b === null || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const x = a as Record<string, unknown>;
  const y = b as Record<string, unknown>;
  const sleutels = Object.keys(x);
  return sleutels.length === Object.keys(y).length && sleutels.every((k) => heeftSleutel(y, k) && zelfdeWaarde(x[k], y[k]));
}

/** Een knoop zoals hij in dit rapport voorkomt: met nummer, zijn kop in rapport.taal, en zonder wat wegvalt. */
export interface Rapportknoop extends Omit<Knoop, "titel" | "titelNieuwbouw" | "nieuwePagina" | "kinderen"> {
  titel: string;
  nummer: string;
  nieuwePagina: boolean;
  kinderen: Rapportknoop[];
  blad?: { id: string; naam: string; bijlage: string; koppen?: readonly Inhoudskop[] };
}

/** Waar de uitwerking van een blad staat. */
export type BladPlek = "hoofdstuk" | "bijlage";

/** Een regel onder de naam van een blad in de inhoudsopgave, zoals een kop uit een bestand. */
export interface Inhoudskop {
  titel: string;
  /** Staat op papier als `data-inhoud` op die kop. */
  anker: string;
}

export interface Blad {
  id: string;
  naam: string;
  /** Waar de uitwerking staat zolang de gebruiker niets koos; zonder: in de bijlage. */
  plek?: BladPlek;
  koppen?: readonly Inhoudskop[];
}

/** Heeft dit rapport een hoofdstuk Berekeningen? Zo niet, dan staan alle bladen in bijlage A. */
export function heeftBerekeningen(r: Pick<Rapport, "opzet">): boolean {
  return opzetVan(r).some((k) => k.inhoud === "berekeningen");
}

/**
 * Staat de uitwerking van dit blad in het hoofdstuk zelf? De keuze in het rapport wint van de
 * soort; zonder hoofdstuk Berekeningen is er geen andere plek dan de bijlage.
 */
export function staatInHoofdstuk(r: Rapport, b: Pick<Blad, "id" | "plek">): boolean {
  return heeftBerekeningen(r) && (r.inHoofdstuk[b.id] ?? b.plek === "hoofdstuk");
}

/** De bladen in bijlage A met hun nummer (A.1, A.2, …), in de volgorde van het project. */
export function bladenInBijlage(r: Rapport, bladen: readonly Blad[]): { blad: Blad; nummer: string }[] {
  return bladen.filter((b) => !staatInHoofdstuk(r, b)).map((blad, i) => ({ blad, nummer: `A.${i + 1}` }));
}

/**
 * Staat er niets in? Een tekstknoop is leeg als zijn getrimde tekst leeg is en al zijn
 * kinderen leeg zijn; een knoop zonder eigen inhoud als al zijn kinderen leeg zijn. 4.6, 5.5 en
 * Berekeningen hebben een eigen regel; de overige tabellen zijn nooit leeg.
 */
function isLeeg(k: Knoop, r: Rapport, bladen: readonly Blad[]): boolean {
  switch (k.inhoud) {
    case "tekst":
      return (r.teksten[k.id] ?? "").trim() === "" && (k.kinderen ?? []).every((c) => isLeeg(c, r, bladen));
    case "bestaand":
      return !r.uitgangspunten.bestaand.opnemen;
    case "blijvend":
      return r.belastingen.vloerenDaken.length === 0 && r.belastingen.wanden.length === 0;
    case "berekeningen":
      return bladen.length === 0;
    case undefined:
      return (k.kinderen ?? []).every((c) => isLeeg(c, r, bladen));
    default:
      return false;
  }
}

/** Niet-optionele knopen blijven altijd staan, ook als ze leeg zijn. */
function valtWeg(k: Knoop, r: Rapport, bladen: readonly Blad[]): boolean {
  return k.optioneel === true && isLeeg(k, r, bladen);
}

/** Een knoop op id, diepte eerst. */
export function zoekKnoop(id: string, lijst: readonly Knoop[]): Knoop | undefined {
  for (const k of lijst) {
    const gevonden = k.id === id ? k : zoekKnoop(id, k.kinderen ?? []);
    if (gevonden) return gevonden;
  }
  return undefined;
}

/**
 * Beschrijft dit rapport een bestaande situatie (verbouw), of is het
 * nieuwbouw? Bestaand als 4.6 Bestaande situatie is opgenomen, of als het
 * blok Bestaande situatie in 3.1 tekst heeft: dan staat er iets boven het
 * blok Wijziging waar het een wijziging van is. Alleen wat in de opzet van dit rapport staat, telt.
 */
export function beschrijftBestaand(r: Rapport): boolean {
  const opzet = opzetVan(r);
  const blok = zoekKnoop("bestaand", opzet);
  const opgenomen = r.uitgangspunten.bestaand.opnemen && knopenVan(opzet).some((k) => k.inhoud === "bestaand");
  return opgenomen || (blok !== undefined && !isLeeg(blok, r, []));
}

/**
 * De kop van een knoop in dit rapport, in rapport.taal: bij nieuwbouw
 * `titelNieuwbouw` als die er is en het rapport die kop gebruikt
 * (opmaak.constructieprincipe; een rapport van vóór versie 3 houdt bij het openen
 * Wijziging).
 */
export function titelVan(k: Knoop, r: Rapport): string {
  if (k.titelNieuwbouw === undefined || !r.opmaak.constructieprincipe || beschrijftBestaand(r)) return inTaal(k.titel, r.taal);
  return inTaal(k.titelNieuwbouw, r.taal);
}

function nieuwePaginaVoor(id: string, standaard: boolean | undefined, r: Rapport): boolean {
  return r.nieuwePagina[id] ?? standaard ?? false;
}

/**
 * Per rekenblad een paragraaf in Berekeningen. Bladen waarvan de uitwerking in
 * bijlage A staat krijgen daar een volgnummer (A.1, A.2, …); een blad met de
 * uitwerking in het hoofdstuk zelf krijgt bijlage "".
 */
function bladKnopen(nummer: string, r: Rapport, bladen: Blad[]): Rapportknoop[] {
  const inBijlage = new Map(bladenInBijlage(r, bladen).map((b) => [b.blad.id, b.nummer]));
  return bladen.map((b, i): Rapportknoop => ({
    id: b.id,
    titel: b.naam,
    niveau: 2,
    nummer: `${nummer}.${i + 1}`,
    nieuwePagina: nieuwePaginaVoor(b.id, false, r),
    kinderen: [],
    blad: {
      id: b.id,
      naam: b.naam,
      bijlage: inBijlage.get(b.id) ?? "",
      ...(b.koppen?.length ? { koppen: b.koppen } : {}),
    },
  }));
}

function bouwKnoop(k: Knoop, nummer: string, r: Rapport, bladen: Blad[]): Rapportknoop {
  const kinderen = k.inhoud === "berekeningen"
    ? bladKnopen(nummer, r, bladen)
    : (k.kinderen ?? [])
        .filter((c) => !valtWeg(c, r, bladen))
        .map((c, j) => bouwKnoop(c, c.niveau === 2 ? `${nummer}.${j + 1}` : "", r, bladen));
  const { titelNieuwbouw: _kop, ...rest } = k;
  return { ...rest, titel: titelVan(k, r), nummer, nieuwePagina: nieuwePaginaVoor(k.id, k.nieuwePagina, r), kinderen };
}

/**
 * Nummert, laat lege optionele knopen weg, voegt per blad een paragraaf toe aan
 * "berekeningen" (bijlage "A.1", "A.2", …). Zonder bladen valt "berekeningen"
 * weg; de bijlageletters (bijlagen()) houden dan hun plek: B blijft B.
 */
export function bouwOpzet(r: Rapport, bladen: Blad[]): Rapportknoop[] {
  return opzetVan(r)
    .filter((k) => !valtWeg(k, r, bladen))
    .map((k, i) => bouwKnoop(k, String(i + 1), r, bladen));
}

export interface Inhoudsregel {
  nummer: string;
  titel: string;
  /** 1 hoofdstuk, 2 paragraaf of blad, 3 kop uit een blad. */
  niveau: 1 | 2 | 3;
  /** De plek op papier (`data-inhoud`) waar het paginanummer vandaan komt. */
  anker: string;
}

/** De regel van een blad met de koppen eronder. */
function bladRegels(nummer: string, titel: string, anker: string, koppen: readonly Inhoudskop[] = []): Inhoudsregel[] {
  return [
    { nummer, titel, niveau: 2, anker },
    ...koppen.map((k): Inhoudsregel => ({ nummer: "", titel: k.titel, niveau: 3, anker: k.anker })),
  ];
}

/**
 * Hoofdstukken en paragrafen. De paragrafen van "berekeningen" staan in de
 * inhoudsopgave van dat hoofdstuk; met `metBladen` (rapport.opmaak.bladenInInhoud)
 * staan de bladen met hun uitwerking in dat hoofdstuk hier ook. De andere bladen
 * noemt bijlageRegels.
 */
export function inhoudsopgave(knopen: Rapportknoop[], metBladen = false): Inhoudsregel[] {
  const regels: Inhoudsregel[] = [];
  for (const h of knopen) {
    regels.push({ nummer: h.nummer, titel: h.titel, niveau: 1, anker: h.id });
    if (h.inhoud === "berekeningen") {
      if (!metBladen) continue;
      for (const p of h.kinderen) {
        if (p.blad && !p.blad.bijlage) regels.push(...bladRegels(p.nummer, p.titel, p.id, p.blad.koppen));
      }
      continue;
    }
    for (const p of h.kinderen) {
      if (p.niveau === 2) regels.push({ nummer: p.nummer, titel: p.titel, niveau: 2, anker: p.id });
    }
  }
  return regels;
}

/** De plek van de kop van een bijlage op papier. */
export const bijlageAnker = (letter: string) => `bijlage-${letter}`;

/** De plek van een blad in bijlage A op papier: het blad heeft ook een paragraaf in hoofdstuk Berekeningen. */
export const bijlageBladAnker = (id: string) => `bijlage-blad-${id}`;

/**
 * De bladen in bijlage A, voor onder die bijlage in de inhoudsopgave (rapport.opmaak.bladenInInhoud).
 * Uit de bladen zelf en niet uit hoofdstuk Berekeningen: zonder dat hoofdstuk staan ze hier allemaal.
 */
export function bijlageRegels(r: Rapport, bladen: readonly Blad[]): Inhoudsregel[] {
  return bladenInBijlage(r, bladen).flatMap(({ blad, nummer }) =>
    bladRegels(nummer, blad.naam, bijlageBladAnker(blad.id), blad.koppen));
}

/** Een regel in het zijpaneel; `bladId` is het blad dat een klik opent. */
export interface PaneelRegel extends Inhoudsregel {
  bladId?: string;
}

/**
 * De inhoud voor het zijpaneel: alle nummers die het rapport gaat krijgen, altijd met de bladen en
 * zonder de koppen uit een blad. De hoofdstukken, bladen en bijlagen staan in dezelfde volgorde
 * als op papier en dragen dezelfde ankers, dus het voorbeeld kan er paginanummers bij zetten.
 */
export function inhoudVoorPaneel(r: Rapport, bladen: Blad[]): PaneelRegel[] {
  const knopen = bouwOpzet(r, bladen);
  const bladVan = new Map<string, string>();
  for (const b of bladen) {
    bladVan.set(b.id, b.id);
    bladVan.set(bijlageBladAnker(b.id), b.id);
  }
  const regel = (i: Inhoudsregel): PaneelRegel => {
    const bladId = bladVan.get(i.anker);
    return bladId ? { ...i, bladId } : i;
  };
  const uit = inhoudsopgave(knopen, true).filter((i) => i.niveau < 3).map(regel);
  for (const b of bijlagen(r, bladen)) {
    uit.push({ nummer: b.letter, titel: b.titel, niveau: 1, anker: bijlageAnker(b.letter) });
    if (b.letter === "A") uit.push(...bijlageRegels(r, bladen).filter((i) => i.niveau < 3).map(regel));
  }
  return uit;
}

export interface Bijlage { letter: string; titel: string }

/** Titel van bijlage A. */
export const BIJLAGE_A: Meertalig = { en: "Detailed calculations", nl: "Uitgebreide uitwerking berekeningen" };

/** 0 → A, 1 → B, … 25 → Z, 26 → AA. */
function bijlageLetter(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/**
 * A = BIJLAGE_A in rapport.taal (alleen als er een blad in de bijlage staat),
 * daarna rapport.bijlagen als B, C, …
 *
 * De letters van de eigen bijlagen liggen vast (B is altijd de eerste eigen
 * bijlage), ook als A wegvalt: tekeningen en andere stukken verwijzen ernaar.
 * Een eigen bijlage zonder titel telt niet mee.
 */
export function bijlagen(r: Rapport, bladen: Blad[]): Bijlage[] {
  const uit: Bijlage[] = [];
  if (bladen.some((b) => !staatInHoofdstuk(r, b))) uit.push({ letter: "A", titel: inTaal(BIJLAGE_A, r.taal) });
  r.bijlagen
    .map((t) => t.trim())
    .filter((t) => t !== "")
    .forEach((titel, i) => uit.push({ letter: bijlageLetter(i + 1), titel }));
  return uit;
}
