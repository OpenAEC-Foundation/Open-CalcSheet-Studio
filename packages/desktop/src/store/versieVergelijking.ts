/**
 * Wat er verschilt tussen een versie en haar oudertak: per blad de invoer, de rekentekst en de
 * uitkomsten, en daarnaast wat er in het rapport en de projectgegevens anders is.
 *
 * Bladen worden op `id` vergeleken, niet op naam: een hernoemd blad is hetzelfde blad, en een blad dat
 * in de ene versie niet bestaat is toegevoegd of vervallen. De uitkomsten komen uit de bestaande
 * doorrekening (`bladenVoorIfc` en `leesUitkomst`, dezelfde route als het projectbestand), niet uit een
 * eigen rekenpad; en omdat die per blad bewaard blijft, rekent alleen opnieuw wat is veranderd.
 *
 * Een blad vergelijkt zijn invoer zoals hij echt meetelt. Een veld dat in de ene versie nog leeg is en
 * in de andere de standaardwaarde heeft gekregen (dat gebeurt bij het eerste openen), is geen wijziging.
 * Zo ook de projectgegevens: een veld dat een oudere versie nog niet kende, telt als zijn standaard, en
 * het land en de generatie tellen zoals ze gelden (normkeuzeVan), niet zoals ze zijn opgeslagen.
 *
 * Zonder React en zonder stores: scripts/check-versies.mjs laadt dit bestand in Node.
 */
import { leesUitkomst, type BladUitkomstGegevens, type IfcCalcSheet } from "@ifc-calc/core";
import { heeftSleutel, heeftTekst, knopenVan, opzetVan, titelVan, zelfdeWaarde, zoekKnoop, type Knoop } from "../rapport/opzet.ts";
import { inTaal } from "../rapport/meertalig.ts";
import type { LokaleInvoer, Rapport } from "../rapport/model.ts";
import { lokaalVan, normkeuzeVan, veldZichtbaar } from "../rapport/normen/keuze.ts";
import { MAX_VERANDERINGEN, type BestandsDeel, type Verandering, type WijzigingsDeel, type Wijzigingsregel } from "../rapport/wijzigingen.ts";
import { bladenVoorIfc } from "./projectIfcx.ts";
import { legeGegevens } from "./projectGegevens.ts";
import { isLosBlad } from "./spreadsheetBlad.ts";
import type { Exemplaar } from "./projectStore";
import { inhoudVan, ouderVan, type VersieInhoud, type VersieLijst } from "./versies.ts";

export interface BladVerschil {
  id: string;
  naam: string;
  soort: "erbij" | "weg" | "gewijzigd";
  /** Alleen bij een hernoemd blad. */
  oudeNaam?: string;
  invoer: Verandering[];
  /** De regels die anders zijn; null als de tekst gelijk is. */
  rekentekst: { eraf: string[]; erbij: string[] } | null;
  uitkomsten: Verandering[];
  /** Alleen als het eindoordeel anders is. */
  oordeel: { van: string; naar: string } | null;
  bestand: BestandsDeel[];
}

const IS_UC = /^uc(?:$|_)/i;

/** Gelijk als tekst, of als hetzelfde getal: "4,20" en "4.2" zijn dezelfde invoer. */
function zelfdeInvoer(a: string | undefined, b: string | undefined): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined || a.trim() === "" || b.trim() === "") return false;
  const x = Number(a.replace(",", "."));
  return Number.isFinite(x) && x === Number(b.replace(",", "."));
}

/** De uitkomst van een doorgerekend blad, zoals die in het projectbestand komt. Een blad zonder rekentekst heeft er geen. */
function uitkomstVan(blad: IfcCalcSheet | undefined): BladUitkomstGegevens | null {
  if (!blad || isLosBlad(blad)) return null;
  return leesUitkomst(blad.nodes, blad.naam, blad.resultaat, blad.fout);
}

/** De uitkomsten die anders zijn; de unity checks voorop, en wat niet op papier komt niet. */
function veranderdeUitkomsten(a: BladUitkomstGegevens | null, b: BladUitkomstGegevens | null): Verandering[] {
  const lees = (u: BladUitkomstGegevens | null) => new Map((u?.variabelen ?? []).filter((v) => !v.verborgen).map((v) => [v.naam, v.tekst]));
  const oud = lees(a);
  const nieuw = lees(b);
  const uit: Verandering[] = [];
  for (const naam of new Set([...nieuw.keys(), ...oud.keys()])) {
    const van = oud.get(naam);
    const naar = nieuw.get(naam);
    if (van !== naar) uit.push({ naam, ...(van !== undefined ? { van } : {}), ...(naar !== undefined ? { naar } : {}) });
  }
  return [...uit.filter((v) => IS_UC.test(v.naam)), ...uit.filter((v) => !IS_UC.test(v.naam))];
}

/** Wat er aan de invoer anders is, zoals die meetelt in de berekening. */
function veranderdeInvoer(a: Exemplaar, b: Exemplaar, ua: BladUitkomstGegevens | null, ub: BladUitkomstGegevens | null, gelijkeUitkomst: boolean): Verandering[] {
  const velden = (u: BladUitkomstGegevens | null) => new Map((u?.invoervelden ?? []).map((v) => [v.naam, v.waarde]));
  const oud = velden(ua);
  const nieuw = velden(ub);
  const uit: Verandering[] = [];
  for (const naam of new Set([...nieuw.keys(), ...oud.keys(), ...Object.keys(b.waarden), ...Object.keys(a.waarden)])) {
    const van = oud.get(naam) ?? (heeftSleutel(a.waarden, naam) ? a.waarden[naam] : undefined);
    const naar = nieuw.get(naam) ?? (heeftSleutel(b.waarden, naam) ? b.waarden[naam] : undefined);
    if (zelfdeInvoer(van, naar)) continue;
    // Aan één kant nog niets, en de uitkomst blijft gelijk: een aangevulde standaardwaarde.
    if ((van === undefined || naar === undefined) && gelijkeUitkomst) continue;
    uit.push({ naam, ...(van !== undefined ? { van } : {}), ...(naar !== undefined ? { naar } : {}) });
  }
  return uit;
}

/** De regels die anders zijn: wat voor en achter gelijk is, valt weg. Regeleinden tellen niet. */
export function regelVerschil(oud: string, nieuw: string): { eraf: string[]; erbij: string[] } | null {
  if (oud === nieuw) return null;
  const a = oud.split(/\r?\n/);
  const b = nieuw.split(/\r?\n/);
  let voor = 0;
  while (voor < a.length && voor < b.length && a[voor] === b[voor]) voor++;
  let achter = 0;
  while (achter < a.length - voor && achter < b.length - voor && a[a.length - 1 - achter] === b[b.length - 1 - achter]) achter++;
  const eraf = a.slice(voor, a.length - achter);
  const erbij = b.slice(voor, b.length - achter);
  return eraf.length === 0 && erbij.length === 0 ? null : { eraf, erbij };
}

/** Wat er aan de bestanden op een blad anders is. */
function veranderdeBestanden(a: Exemplaar, b: Exemplaar): BestandsDeel[] {
  const uit: BestandsDeel[] = [];
  if (a.pdf?.data !== b.pdf?.data) uit.push("pdf");
  else if (!zelfdeWaarde(a.pdf?.aantekeningen ?? [], b.pdf?.aantekeningen ?? []) || a.pdf?.opPapier !== b.pdf?.opPapier) uit.push("aantekeningen");
  if (a.xlsx?.data !== b.xlsx?.data) uit.push("werkmap");
  if (a.md?.tekst !== b.md?.tekst || !zelfdeWaarde(a.md?.beelden ?? {}, b.md?.beelden ?? {})) uit.push("tekst");
  if (!zelfdeWaarde(a.graaf ?? null, b.graaf ?? null)) uit.push("graaf");
  if (!zelfdeWaarde(a.tekenvel ?? null, b.tekenvel ?? null)) uit.push("tekening");
  if (a.jupyter?.data !== b.jupyter?.data || a.marimo?.code !== b.marimo?.code) uit.push("notebook");
  if (!zelfdeWaarde(a.elementen ?? [], b.elementen ?? [])) uit.push("elementen");
  return uit;
}

/** Per blad wat er verschilt met de oudertak, in de volgorde van de bladen; wat vervallen is, achteraan. */
export function vergelijkBladen(oud: VersieInhoud, nieuw: VersieInhoud): BladVerschil[] {
  const opId = (lijst: readonly IfcCalcSheet[]) => new Map(lijst.map((b) => [b.id, b]));
  const oudeBladen = opId(bladenVoorIfc(oud));
  const nieuweBladen = opId(bladenVoorIfc(nieuw));
  const vroeger = new Map(oud.exemplaren.map((e) => [e.id, e]));
  const leeg = { invoer: [], rekentekst: null, uitkomsten: [], oordeel: null, bestand: [] };
  const uit: BladVerschil[] = [];
  for (const b of nieuw.exemplaren) {
    const a = vroeger.get(b.id);
    if (!a) {
      uit.push({ id: b.id, naam: b.naam, soort: "erbij", ...leeg });
      continue;
    }
    const ua = uitkomstVan(oudeBladen.get(a.id));
    const ub = uitkomstVan(nieuweBladen.get(b.id));
    const uitkomsten = veranderdeUitkomsten(ua, ub);
    const oordeel = ua && ub && ua.status !== ub.status ? { van: ua.status, naar: ub.status } : null;
    const verschil: BladVerschil = {
      id: b.id,
      naam: b.naam,
      soort: "gewijzigd",
      ...(a.naam !== b.naam ? { oudeNaam: a.naam } : {}),
      invoer: veranderdeInvoer(a, b, ua, ub, uitkomsten.length === 0 && oordeel === null),
      rekentekst: regelVerschil(a.source, b.source),
      uitkomsten,
      oordeel,
      bestand: veranderdeBestanden(a, b),
    };
    if (verschil.oudeNaam !== undefined || verschil.invoer.length > 0 || verschil.rekentekst || uitkomsten.length > 0 || oordeel || verschil.bestand.length > 0) uit.push(verschil);
  }
  const nu = new Set(nieuw.exemplaren.map((e) => e.id));
  for (const a of oud.exemplaren) if (!nu.has(a.id)) uit.push({ id: a.id, naam: a.naam, soort: "weg", ...leeg });
  return uit;
}

/** Een rijtje voor op papier: de eerste paar, en hoeveel er meer zijn. */
function beknopt(soort: "invoer" | "uitkomst" | "gegevens", lijst: readonly Verandering[]): WijzigingsDeel {
  return { soort, lijst: lijst.slice(0, MAX_VERANDERINGEN), meer: Math.max(0, lijst.length - MAX_VERANDERINGEN) };
}

/** De delen van de regel van een blad. */
function bladDelen(v: BladVerschil, toelichtingAnders: boolean): WijzigingsDeel[] {
  if (v.soort !== "gewijzigd") return [{ soort: v.soort }];
  const uit: WijzigingsDeel[] = [];
  if (v.oudeNaam !== undefined) uit.push({ soort: "hernoemd", van: v.oudeNaam });
  if (v.invoer.length > 0) uit.push(beknopt("invoer", v.invoer));
  if (v.rekentekst) uit.push({ soort: "rekentekst", regels: Math.max(v.rekentekst.eraf.length, v.rekentekst.erbij.length) });
  for (const wat of v.bestand) uit.push({ soort: "bestand", wat });
  if (v.oordeel) uit.push({ soort: "oordeel", ...v.oordeel });
  if (v.uitkomsten.length > 0) uit.push(beknopt("uitkomst", v.uitkomsten));
  if (toelichtingAnders) uit.push({ soort: "tekst" });
  return uit;
}

/**
 * Wat er in dit rapport voor zijn land is ingevuld. Met de Nederlandse tabellen niets: dan staat dit
 * niet op papier, ook niet als er nog invoer van een ander land in het rapport zit.
 */
interface Landinvoer {
  code: string;
  invoer: LokaleInvoer;
}

function landinvoerVan(i: VersieInhoud): Landinvoer | null {
  const k = normkeuzeVan(i.gegevens);
  return k.nlTabellen ? null : { code: k.land.code, invoer: lokaalVan(i.rapport, k) };
}

/**
 * Waar de gegevens van een rekenblok in het rapport staan, per knoop. Locatiewaarden horen bij hun land:
 * in een ander land is het een andere grootheid, ook als er nog niets is ingevuld.
 */
const BLOK_INHOUD: Record<string, (r: Rapport, land: Landinvoer | null) => unknown> = {
  rol: (r) => r.rol,
  bouwwerk: (r, land) => [r.uitgangspunten.soortBouwwerk, land?.invoer.veiligheid],
  brand: (r) => r.uitgangspunten.brand,
  materialen: (r) => [r.uitgangspunten.materialen, r.uitgangspunten.materialenNoot, r.uitgangspunten.bevestiging],
  conservering: (r) => [r.uitgangspunten.conservering, r.uitgangspunten.conserveringSlot],
  factoren: (_r, land) => land && [land.invoer.factoren, land.invoer.psi, land.invoer.combinaties],
  "bestaand-situatie": (r) => r.uitgangspunten.bestaand,
  vervormingen: (r) => r.uitgangspunten.vervormingen,
  aardbeving: (_r, land) => land && [land.code, land.invoer.aardbeving],
  sneeuw: (_r, land) => land && [land.code, land.invoer.sneeuw],
  wind: (r, land) => [r.belastingen.wind, land && [land.code, land.invoer.wind]],
  veranderlijk: (r, land) => [r.belastingen.klassen, land?.invoer.klassen],
  blijvend: (r) => [r.belastingen.vloerenDaken, r.belastingen.wanden],
};

/** Wat in het rapport op het voorblad staat. De projectgegevens ernaast staan in VOORBLAD_GEGEVENS. */
const VOORBLAD_VELDEN = ["titel", "kenmerk", "fase", "normen", "opdrachtgeverAdres", "verantwoordelijk", "uitvoerend"] as const;
const VOORBLAD_GEGEVENS = new Set(["project_nummer", "project_naam", "opdrachtgever"]);
/** Projectgegevens die in een rekenblok van het rapport staan. De rest heeft geen eigen plek op papier. */
const GEGEVENS_IN_KNOOP: Record<string, string> = {
  land: "bouwwerk", eurocode_generatie: "bouwwerk", CC: "bouwwerk", RC: "bouwwerk", DesignLife: "bouwwerk", windgebied: "wind", terreincategorie: "wind",
};

/**
 * De regels van de lijst met wijzigingen, in de volgorde van het rapport: het voorblad, de onderdelen
 * uit de opzet, dan de bladen. Elke regel heeft een sleutel die niet verandert, want daaraan hangt
 * wat de gebruiker met de regel deed.
 */
export function maakWijzigingen(oud: VersieInhoud, nieuw: VersieInhoud): Wijzigingsregel[] {
  const a = oud.rapport;
  const b = nieuw.rapport;
  const uit: Wijzigingsregel[] = [];

  // De projectgegevens, op de plek waar ze op papier staan. Een naam uit een bestand kan alles zijn, en
  // een veld dat een oudere versie nog niet kende, staat op zijn standaard. Het land en de generatie
  // zoals ze gelden: een generatie die in dit land niet bestaat, verandert niets aan het rapport.
  const standaard = legeGegevens();
  const lees = (r: Record<string, string>, naam: string) => (heeftSleutel(r, naam) ? r[naam] : "");
  const veld = (g: Record<string, string>, naam: string) => (heeftSleutel(g, naam) ? g[naam] : lees(standaard, naam));
  const knoopVan = (naam: string) => (heeftSleutel(GEGEVENS_IN_KNOOP, naam) ? GEGEVENS_IN_KNOOP[naam] : undefined);
  const keuzeOud = normkeuzeVan(oud.gegevens);
  const keuzeNieuw = normkeuzeVan(nieuw.gegevens);
  const gegevens: Verandering[] = [
    ...(keuzeOud.land.code === keuzeNieuw.land.code ? [] : [{ naam: "land", van: inTaal(keuzeOud.land.naam, b.taal), naar: inTaal(keuzeNieuw.land.naam, b.taal) }]),
    ...(keuzeOud.generatie === keuzeNieuw.generatie ? [] : [{ naam: "eurocode_generatie", van: String(keuzeOud.generatie), naar: String(keuzeNieuw.generatie) }]),
    ...Object.keys({ ...nieuw.gegevens, ...oud.gegevens })
      .filter((naam) => naam !== "land" && naam !== "eurocode_generatie" && (veldZichtbaar(naam, keuzeOud) || veldZichtbaar(naam, keuzeNieuw)))
      .filter((naam) => veld(oud.gegevens, naam) !== veld(nieuw.gegevens, naam))
      .map((naam): Verandering => ({ naam, van: veld(oud.gegevens, naam), naar: veld(nieuw.gegevens, naam) })),
  ];
  const inKnoop = (id: string) => gegevens.filter((g) => knoopVan(g.naam) === id);
  const landOud = landinvoerVan(oud);
  const landNieuw = landinvoerVan(nieuw);

  const voorblad: WijzigingsDeel[] = [];
  const opVoorblad = gegevens.filter((g) => VOORBLAD_GEGEVENS.has(g.naam));
  if (opVoorblad.length > 0) voorblad.push(beknopt("gegevens", opVoorblad));
  if (VOORBLAD_VELDEN.some((v) => a[v] !== b[v])) voorblad.push({ soort: "inhoud" });
  if (voorblad.length > 0) uit.push({ sleutel: "voorblad", doel: "voorblad", titel: "", delen: voorblad });

  // De onderdelen uit de opzet, ook wat alleen in de oudertak nog bestaat.
  const opzet = opzetVan(b);
  const ids = new Set(knopenVan(opzet).map((k) => k.id));
  const knopen: Knoop[] = [...knopenVan(opzet), ...knopenVan(opzetVan(a)).filter((k) => !ids.has(k.id))];
  for (const k of knopen) {
    const delen: WijzigingsDeel[] = [];
    const blok = heeftSleutel(BLOK_INHOUD, k.id) ? BLOK_INHOUD[k.id] : undefined;
    const nu = zoekKnoop(k.id, opzet) ?? k;
    if (heeftTekst(k)) {
      const van = (a.teksten[k.id] ?? "").trim();
      const naar = (b.teksten[k.id] ?? "").trim();
      if (van !== naar) delen.push({ soort: naar === "" ? "weg" : van === "" ? "erbij" : "tekst" });
    }
    if (blok && !zelfdeWaarde(blok(a, landOud), blok(b, landNieuw))) delen.push({ soort: "inhoud" });
    const knoopGegevens = inKnoop(k.id);
    if (knoopGegevens.length > 0) delen.push(beknopt("gegevens", knoopGegevens));
    if (delen.length > 0) uit.push({ sleutel: `knoop:${k.id}`, doel: "knoop", id: k.id, titel: titelVan(nu, b), delen });
  }

  const overig = gegevens.filter((g) => {
    const knoop = knoopVan(g.naam);
    return !VOORBLAD_GEGEVENS.has(g.naam) && (knoop === undefined || !ids.has(knoop));
  });
  if (overig.length > 0) uit.push({ sleutel: "gegevens", doel: "gegevens", titel: "", delen: [beknopt("gegevens", overig)] });
  if (!zelfdeWaarde(a.bijlagen, b.bijlagen)) uit.push({ sleutel: "bijlagen", doel: "bijlagen", titel: "", delen: [{ soort: "inhoud" }] });
  if (!zelfdeWaarde(opzetVan(a), opzetVan(b))) uit.push({ sleutel: "opzet", doel: "opzet", titel: "", delen: [{ soort: "inhoud" }] });

  // De bladen, ook als alleen hun toelichting in het rapport anders is.
  const verschillen = vergelijkBladen(oud, nieuw);
  const perBlad = new Map(verschillen.map((v) => [v.id, v]));
  const toelichtingAnders = (id: string) => lees(a.toelichting, id).trim() !== lees(b.toelichting, id).trim();
  for (const ex of nieuw.exemplaren) {
    const v = perBlad.get(ex.id);
    const anders = toelichtingAnders(ex.id) && oud.exemplaren.some((e) => e.id === ex.id);
    if (!v && !anders) continue;
    const verschil: BladVerschil = v ?? { id: ex.id, naam: ex.naam, soort: "gewijzigd", invoer: [], rekentekst: null, uitkomsten: [], oordeel: null, bestand: [] };
    uit.push({ sleutel: `blad:${ex.id}`, doel: "blad", id: ex.id, titel: ex.naam, delen: bladDelen(verschil, anders) });
  }
  for (const v of verschillen) {
    if (v.soort === "weg") uit.push({ sleutel: `blad:${v.id}`, doel: "blad", id: v.id, titel: v.naam, delen: bladDelen(v, false) });
  }
  return uit;
}

/** De oudertak van de actieve versie, als er een is. */
export function ouderInhoud(s: VersieInhoud & { versies: VersieLijst }): VersieInhoud | undefined {
  const ouder = ouderVan(s.versies, s.versies.actief);
  return ouder && inhoudVan(s, ouder.id);
}

/**
 * Het rapport met zijn lijst bijgewerkt. Hetzelfde object als er niets is veranderd, zodat de store geen
 * nieuwe stand krijgt. Zonder oudertak is er geen lijst, en de keuzes blijven bewaard.
 */
export function metVerseLijst(s: VersieInhoud & { versies: VersieLijst }): Rapport {
  const ouder = ouderInhoud(s);
  const regels = ouder ? maakWijzigingen(ouder, s) : [];
  const huidig = s.rapport.wijzigingsLijst ?? [];
  if (zelfdeWaarde(regels, huidig)) return s.rapport;
  if (regels.length > 0) return { ...s.rapport, wijzigingsLijst: regels };
  const { wijzigingsLijst: _oud, ...rest } = s.rapport;
  return rest;
}
