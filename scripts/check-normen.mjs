/**
 * Controle van de normen per land.
 *
 *   1  het gegevensbestand: elk land compleet en met bron, geen verboden namen;
 *   2  de keuze van het land: een oud project is Nederlands, een nieuw project volgt de
 *      regio van het systeem;
 *   3  wind, sneeuw en aardbeving per land: de grootheden en de invoer;
 *   4  factoren per land: Nederland uit de NB-tabellen, Eurocode-landen de aanbevolen
 *      waarden uit EN 1990 als invoer, daarbuiten eigen combinaties;
 *   5  wisselen van land, onbetrouwbare invoer en wisselen van taal;
 *   6  op welke norm een blad rust, als die afwijkt van het gekozen land;
 *   7  de echte afdruk als html, in het Engels en in het Nederlands: Nederland tot op de
 *      letter als voorheen, elders geen Nederlandse uitkomst.
 *
 * De aanbevolen waarden uit EN 1990 staan hier nog eens met de hand, om tegen te toetsen.
 * Bron: CEN-corrigendum EN 1990:2002/A1:2005/AC:2010 (tabel A1.2 t/m A1.4) en de
 * JRC-presentatie EN1990_4_Calgaro.pdf (tabel A1.1, A1.2), zie rapport/normen/en1990.ts.
 *
 * Draaien:  node scripts/check-normen.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inTaal } from "../packages/desktop/src/rapport/meertalig.ts";
import {
  GEEN_BIJLAGE, LANDEN, LOCATIE_ONDERWERPEN, ONDERWERPEN, OVERGANG, TWEEDE_GENERATIE,
} from "../packages/desktop/src/rapport/normen/landen.ts";
import { EN1990_BRONNEN, EN1990_FACTOREN, EN1990_PSI } from "../packages/desktop/src/rapport/normen/en1990.ts";
import {
  bladNormUit, dekkingVan, groothedenVan, landVanCode, landVoorLocale, leesLand, lokaalVan, metLokaal, NEDERLAND, normAfwijking, normenTekstVan, normenVan,
  normkeuzeVan, pasRapportAan, standaardLokaal, veldZichtbaar,
} from "../packages/desktop/src/rapport/normen/keuze.ts";
import { MEEGELEVERD, normaliseerRapport, standaardRapport } from "../packages/desktop/src/rapport/model.ts";
import { normaliseerOpzet, OPZET, REKENBLOKKEN, TEKST_IDS, zoekKnoop } from "../packages/desktop/src/rapport/opzet.ts";
import { ongeplaatsteBlokken, plaatsBlok, verwijderKnoop } from "../packages/desktop/src/rapport/template.ts";
import { STANDAARD_TEKSTEN, standaardTeksten } from "../packages/desktop/src/rapport/standaardteksten.ts";
import { isNieuwRapport, wisselTaal } from "../packages/desktop/src/rapport/taalwissel.ts";
import { leesPad, zetOpPad } from "../packages/desktop/src/rapport/pad.ts";
import { legeGegevens, PROJECT_VELDEN, projectScope } from "../packages/desktop/src/store/projectGegevens.ts";
import { balklaag } from "../packages/desktop/src/templates/balklaag.ts";
import { ligger } from "../packages/desktop/src/templates/ligger.ts";
import { tweepaalspoer } from "../packages/desktop/src/templates/tweepaalspoer.ts";
import { doorsnedeSpanningen } from "../packages/desktop/src/templates/doorsnede-spanningen.ts";

const hier = dirname(fileURLToPath(import.meta.url));
const lees = (pad) => readFileSync(join(hier, pad), "utf8").replace(/\r\n/g, "\n");

let fouten = 0;
function toets(naam, ok, detail) {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${naam}${ok || detail === undefined ? "" : `\n         ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
}
function zelfde(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && zelfde(a[k], b[k]));
}
const gelijk = (naam, kreeg, verwacht) => toets(naam, zelfde(kreeg, verwacht), `kreeg ${JSON.stringify(kreeg)}, verwacht ${JSON.stringify(verwacht)}`);
const kop = (t) => console.log(`\n${t}`);
const kloon = (x) => JSON.parse(JSON.stringify(x));

const VANDAAG = "05-11-2026";
const nieuw = (taal) => standaardRapport(VANDAAG, standaardTeksten(taal), taal);
const keuze = (land, generatie) => normkeuzeVan({ land, ...(generatie ? { eurocode_generatie: String(generatie) } : {}) });

/** De landen die er in elk geval moeten zijn; de rest van de lijst mag groeien. */
const VERPLICHT = ["NL", GEEN_BIJLAGE, "BE", "DE", "FR", "GB", "IE", "DK", "SE", "NO", "FI", "AT", "ES", "IT", "PL", "US", "CA", "CH", "AU", "NZ", "IN"];

/**
 * Waar een bron mag staan: normalisatie-instituten, overheden, universiteiten en
 * brancheorganisaties. Een nieuwe host hoort hier bewust bij te komen: zo glipt er geen
 * commerciële normenwinkel of zone-dienst tussendoor.
 */
const BRONNEN = new Set([
  "wetten.overheid.nl", "www.nen.nl", "eurocodes.jrc.ec.europa.eu", "www.nbn.be", "app.nbn.be", "www.buildwise.be", "lirias.kuleuven.be", "publicaties.vlaanderen.be",
  "www.dibt.de", "www.dinmedia.de", "www.gfz.de", "normalisation.afnor.org", "www.boutique.afnor.org", "norminfo.afnor.org", "piles.cerema.fr", "celene.univ-orleans.fr",
  "www.legifrance.gouv.fr", "www.georisques.gouv.fr", "www.gov.uk", "knowledge.bsigroup.com", "steelconstruction.info", "nora.nerc.ac.uk", "www.earthquakes.bgs.ac.uk",
  "assets.gov.ie", "shop.standards.ie", "www.nsai.ie", "cdn.tii.ie", "researchrepository.ucd.ie", "www.bygningsreglementet.dk", "bygningsreglementet.dk", "rinfo.boverket.se", "www.sis.se",
  "www.dibk.no", "standard.no", "online.standard.no", "gudmundr.folk.ntnu.no", "ym.fi", "www.eurocodes.fi", "www.oib.or.at", "www.austrian-standards.at", "www.wko.at",
  "ulb-dok.uibk.ac.at", "meinnormenradar.austrian-standards.at", "www.boe.es", "www.codigotecnico.org", "www.transportes.gob.es", "cdn.mitma.gob.es", "www.ign.es",
  "www.gazzettaufficiale.it", "dati.mit.gov.it", "api.sejm.gov.pl", "wiedza.pkn.pl", "dos.piib.org.pl", "meil.pw.edu.pl", "shop.iccsafe.org", "www.iccsafe.org", "codes.iccsafe.org",
  "www.asce.org", "www.concrete.org", "www.aisc.org", "masonrysociety.org", "earthquake.usgs.gov", "www.fema.gov", "nrc-publications.canada.ca", "doi.org", "www.bafu.admin.ch",
  "cms.sia.ch", "shop.sia.ch", "www.esti.admin.ch", "www.schutz-vor-naturgefahren.ch", "data.geo.admin.ch", "ncc.abcb.gov.au", "aees.org.au", "www.building.govt.nz",
  "codehub.building.govt.nz", "nshm.gns.cri.nz", "www.bis.gov.in", "www.services.bis.gov.in", "www.pib.gov.in", "www.bmtpc.org", "drdo.gov.in", "www.iitk.ac.in",
]);

const NL_WOORD = /\b(?:het|een|van|bij|met|voor|uit|naar|niet|geen|alleen|maar|ook|wordt|worden|zijn|staat|staan|deze|dit|dat|wel|tenzij|constructie|belasting|belastingen|uitgangspunten|bijlage|sneeuw|windgebied|terreincategorie|gebouwhoogte|hout|staal|beton|fundering|funderingen|metselwerk|aardbeving|grootheid|bron|ja|nee|norm|normen|tabel|zie)\b/i;

const allesTekst = (x) => (typeof x === "string" ? [x] : x && typeof x === "object" ? Object.values(x).flatMap(allesTekst) : []);

// ── 1. Het gegevensbestand ──────────────────────────────────────────────────
kop("1. Het gegevensbestand");
{
  const codes = LANDEN.map((l) => l.code);
  gelijk("elke code één keer", codes.length, new Set(codes).size);
  gelijk("elk verplicht land staat erin", VERPLICHT.filter((c) => !codes.includes(c)), []);
  gelijk("Nederland eerst, dan de Eurocode zonder nationale bijlage", codes.slice(0, 2), ["NL", GEEN_BIJLAGE]);
  gelijk("onderwerpen", [...ONDERWERPEN], ["belastingen", "wind", "sneeuw", "aardbeving", "beton", "staal", "hout", "metselwerk", "funderingen"]);
  gelijk("de geldige codes zijn alleen die uit de lijst", ["NL", "DE", "EUROCODE", "XX", "__proto__", "constructor", "", 3, null].map(leesLand), ["NL", "DE", "EUROCODE", undefined, undefined, undefined, undefined, undefined, undefined]);

  for (const l of LANDEN) {
    const naam = `${l.code}:`;
    const mis = [];
    if (!l.naam?.en?.trim() || !l.naam?.nl?.trim()) mis.push("naam");
    if (!l.normenTekst?.en?.trim() || !l.normenTekst?.nl?.trim()) mis.push("normenTekst");
    if (l.stelsel !== "eurocode" && l.stelsel !== "eigen") mis.push("stelsel");
    if (!l.aanwijzing?.tekst?.en?.trim() || !l.aanwijzing?.tekst?.nl?.trim() || !l.aanwijzing?.url) mis.push("aanwijzing");
    for (const o of ONDERWERPEN) {
      const n = l.normen[o];
      if (!n) { mis.push(`${o}: ontbreekt`); continue; }
      if (!n.aanduiding?.trim()) mis.push(`${o}: aanduiding`);
      if (!n.uitgever?.trim()) mis.push(`${o}: uitgever`);
      if (n.editie !== null && !n.editie?.trim()) mis.push(`${o}: editie`);
      if (!n.url?.startsWith("https://")) mis.push(`${o}: url`);
      if (n.opmerking && (!n.opmerking.en?.trim() || !n.opmerking.nl?.trim())) mis.push(`${o}: opmerking`);
    }
    for (const o of LOCATIE_ONDERWERPEN) {
      const loc = l.locatie[o];
      if (!loc) { mis.push(`locatie ${o}`); continue; }
      if (loc.grootheden.length === 0 && !loc.geenGrootheid && !loc.opmerking) mis.push(`locatie ${o}: zonder grootheid en zonder uitleg`);
      if (loc.geenGrootheid && (loc.grootheden.length > 0 || !loc.opmerking)) mis.push(`locatie ${o}: geenGrootheid vraagt een uitleg en geen grootheden`);
      for (const g of loc.grootheden) {
        if (!g.id || !g.naam?.en?.trim() || !g.naam?.nl?.trim() || !g.url?.startsWith("https://") || typeof g.bevestigd !== "boolean" || typeof g.eenheid !== "string") mis.push(`locatie ${o}: ${g.id}`);
      }
      gelijk(`${naam} ${o}: ids uniek`, new Set(loc.grootheden.map((g) => g.id)).size, loc.grootheden.length);
    }
    gelijk(`${naam} compleet en met bron`, mis, []);
    const urls = [l.aanwijzing.url, ...ONDERWERPEN.map((o) => l.normen[o].url), ...LOCATIE_ONDERWERPEN.flatMap((o) => [...l.locatie[o].grootheden.map((g) => g.url), ...(l.locatie[o].waardenUrl ? [l.locatie[o].waardenUrl] : [])])];
    gelijk(`${naam} alleen bekende bronnen`, urls.filter((u) => !BRONNEN.has(new URL(u).hostname)).map((u) => new URL(u).hostname), []);
    toets(`${naam} dekking is compleet of verwijzing`, ["compleet", "verwijzing"].includes(dekkingVan(l)));
  }

  gelijk("deze landen hebben alles bevestigd", LANDEN.filter((l) => dekkingVan(l) === "compleet").map((l) => l.code).sort(),
    ["CA", "CH", "DE", "DK", "EUROCODE", "IT", "NL", "US"].sort());

  const bron = lees("../packages/desktop/src/rapport/normen/landen.ts") + lees("../packages/desktop/src/rapport/normen/en1990.ts") + lees("../packages/desktop/src/rapport/normen/keuze.ts");
  toets("geen markering † meer uit het vooronderzoek", !bron.includes("†"));
  // Het bestand met de gegevens is pure data: geen imports met waarden.
  toets("landen.ts importeert alleen typen", [...lees("../packages/desktop/src/rapport/normen/landen.ts").matchAll(/^import (?!type)/gm)].length === 0);

  gelijk("tweede generatie: alle onderwerpen", Object.keys(TWEEDE_GENERATIE).sort(), [...ONDERWERPEN].sort());
  gelijk("tweede generatie: wat CEN aantoonbaar heeft uitgegeven", [TWEEDE_GENERATIE.belastingen.editie, TWEEDE_GENERATIE.beton.editie, TWEEDE_GENERATIE.staal.editie, TWEEDE_GENERATIE.funderingen.editie], ["2023; 2025", "2023", "2022", "2024"]);
  gelijk("tweede generatie: wat niet aantoonbaar is, staat als nog te bevestigen", [TWEEDE_GENERATIE.wind.editie, TWEEDE_GENERATIE.hout.editie], [null, null]);
  gelijk("de overgang", [OVERGANG.publicatie, OVERGANG.intrekking], ["30-09-2027", "30-03-2028"]);

  gelijk("Nederland: de edities uit bijlage II van de Omgevingsregeling", ONDERWERPEN.map((o) => landVanCode("NL").normen[o].editie), [
    "2019 + A1:2019 C2:2019 + NB:2019; 2019 + C1:2019 + NB:2019",
    "2019 + A1 + C2:2011 + NB:2019",
    "2019 + C1:2019 + A1:2019 + NB:2019",
    "2020",
    "2011 + C2:2011 + A1:2015 + NB:2016 + A1:2020",
    "2006 + C2 + A1:2016 + NB:2016",
    "2005 + C1 + A1:2011 + C1:2012 + A2:2014 + NB:2013",
    "2006 + A1:2013 + NB:2018",
    "2005 + C1 + A1:2016 + NB:2019",
  ]);
  gelijk("Nederland: de aanduiding op het voorblad blijft", [landVanCode("NL").normenTekst.en, landVanCode("NL").normenTekst.nl], ["NEN-EN 1990 to 1997", "NEN-EN 1990 t/m 1997"]);
  toets("elke voorbladtekst staat tussen wat de app meelevert", LANDEN.every((l) => MEEGELEVERD.normen.some((m) => m.en === l.normenTekst.en && m.nl === l.normenTekst.nl)));

  // Past op papier: de rij Standards loopt over zeven kolommen van 53,8 pt, 10 pt letter.
  const em = (t) => [...t].reduce((s, c) => s + (/[iljI.,;:'/ ]/.test(c) ? 0.27 : /[mwMW]/.test(c) ? 0.85 : /[A-Z]/.test(c) ? 0.62 : 0.54), 0);
  const teLang = LANDEN.flatMap((l) => ONDERWERPEN.map((o) => [l.code, o, `${l.normen[o].aanduiding} · ${l.normen[o].editie ?? "edition to be confirmed"}`]))
    .filter(([code, , t]) => code !== "NL" && em(t) * 10 > 7 * 53.8 - 2.8);
  gelijk("elke normregel past op papier", teLang.map(([c, o, t]) => `${c} ${o}: ${t}`), []);
  // Op het voorblad staat de tekst vanaf kolom 6: nog vijf kolommen.
  const voorblad = LANDEN.flatMap((l) => [l.normenTekst.en, l.normenTekst.nl]).filter((t) => em(t) * 10 > 5 * 53.8 - 2.8);
  gelijk("elke tekst op het voorblad past", voorblad, []);
  // Een grootheid staat met zijn symbool op vijf kolommen; daarachter de waarde.
  const grootheid = LANDEN.flatMap((l) => LOCATIE_ONDERWERPEN.flatMap((o) => l.locatie[o].grootheden.flatMap((g) => [`${g.naam.en} ${g.symbool}`, `${g.naam.nl} ${g.symbool}`])))
    .filter((t) => em(t) * 10 > 5 * 53.8 - 2.8);
  gelijk("elke grootheid past op papier", [...new Set(grootheid)], []);
}

// ── 2. De keuze van het land ────────────────────────────────────────────────
kop("2. De keuze van het land");
{
  const veld = PROJECT_VELDEN.find((v) => v.naam === "land");
  toets("land is een veld van de projectgegevens", veld?.type === "keuze" && veld.standaard === "NL");
  gelijk("elke code is een keuze", veld.opties.map((o) => o.waarde), LANDEN.map((l) => l.code));
  gelijk("een oud project krijgt NL: lege gegevens", legeGegevens().land, "NL");
  gelijk("een oud project krijgt NL: het veld ontbreekt", normkeuzeVan({}).land.code, "NL");
  gelijk("een onbekende code krijgt nooit de Nederlandse tabellen", [normkeuzeVan({ land: "XX" }).land.code, normkeuzeVan({ land: "XX" }).nlTabellen], [GEEN_BIJLAGE, false]);
  gelijk("de rekenbladen krijgen er geen nieuwe tekstvariabele bij", Object.keys(projectScope(legeGegevens())).includes("land"), false);

  const locales = {
    "nl-NL": "NL", "nl-BE": "BE", "fr-BE": "BE", "de-DE": "DE", "de-AT": "AT", "de-CH": "CH", "fr-FR": "FR", "fr-CA": "CA", "en-GB": "GB", "en-IE": "IE", "da-DK": "DK", "sv-SE": "SE", "nb-NO": "NO", "fi-FI": "FI",
    "es-ES": "ES", "it-IT": "IT", "pl-PL": "PL", "en-US": "US", "en-CA": "CA", "en-AU": "AU", "en-NZ": "NZ", "en-IN": "IN", "hi-IN": "IN", "en_GB": "GB", "zh-Hant-TW": GEEN_BIJLAGE, "pt-BR": GEEN_BIJLAGE, "es-EC": GEEN_BIJLAGE,
    "en-NL": "NL", "nl-NL-u-ca-gregory": "NL", en: GEEN_BIJLAGE, "en-150": GEEN_BIJLAGE, "": GEEN_BIJLAGE, "!!": GEEN_BIJLAGE, nl: "NL", de: "DE", fr: "FR",
  };
  for (const [locale, land] of Object.entries(locales)) gelijk(`locale "${locale}" → ${land}`, landVoorLocale(locale), land);
  gelijk("geen locale", [landVoorLocale(undefined), landVoorLocale(null)], [GEEN_BIJLAGE, GEEN_BIJLAGE]);

  const nl = keuze("NL");
  gelijk("Nederland: de Nederlandse tabellen, eerste generatie", [nl.nlTabellen, nl.generatie, nl.eurocode], [true, 1, true]);
  gelijk("Nederland, tweede generatie: geen tabellen uit de eerste", keuze("NL", 2).nlTabellen, false);
  gelijk("de VS kennen geen generatie", [keuze("US", 2).generatie, keuze("US").eurocode], [1, false]);
  gelijk("Duitsland: Eurocode, zonder Nederlandse tabellen", [keuze("DE").eurocode, keuze("DE").nlTabellen, keuze("DE", 2).generatie], [true, false, 2]);
  gelijk("Italië en Spanje hebben een eigen regeling die voorgaat", [keuze("IT").eurocode, keuze("ES").eurocode], [false, false]);

  gelijk("velden: Nederland ziet de windkaart", ["windgebied", "terreincategorie", "eurocode_generatie"].map((v) => veldZichtbaar(v, nl)), [true, true, true]);
  gelijk("velden: Duitsland niet", ["windgebied", "terreincategorie", "eurocode_generatie"].map((v) => veldZichtbaar(v, keuze("DE"))), [false, false, true]);
  gelijk("velden: de VS ook geen generatie", ["windgebied", "terreincategorie", "eurocode_generatie", "CC"].map((v) => veldZichtbaar(v, keuze("US"))), [false, false, false, true]);

  gelijk("de normen volgen de generatie", [normenVan(keuze("DE")).beton.aanduiding, normenVan(keuze("DE", 2)).beton.aanduiding], ["DIN EN 1992-1-1/NA", "EN 1992-1-1"]);
  gelijk("de tekst op het voorblad volgt het land", [normenTekstVan(nl, "nl"), normenTekstVan(nl, "en"), normenTekstVan(keuze("DE"), "en")], ["NEN-EN 1990 t/m 1997", "NEN-EN 1990 to 1997", landVanCode("DE").normenTekst.en]);
  toets("de tekst op het voorblad volgt de generatie", normenTekstVan(keuze("DE", 2), "en").includes("EN 1990:2023") && !normenTekstVan(keuze("DE", 2), "en").includes("DIN"));
}

// ── 3. Wind, sneeuw en aardbeving ───────────────────────────────────────────
kop("3. Wind, sneeuw en aardbeving per land");
{
  const symbolen = (c, o) => groothedenVan(landVanCode(c), o).map((g) => g.symbool);
  gelijk("Duitsland: wind", symbolen("DE", "wind"), ["", "q_b,0"]);
  gelijk("Denemarken: wind, sneeuw en aardbeving", [symbolen("DK", "wind"), symbolen("DK", "sneeuw"), symbolen("DK", "aardbeving")], [["v_b,0"], ["s_k"], ["a_g"]]);
  gelijk("Italië: de grootheden van de NTC", [symbolen("IT", "wind"), symbolen("IT", "sneeuw"), symbolen("IT", "aardbeving")], [["v_b,0"], ["q_sk"], ["a_g", "F_o", "T_C*"]]);
  gelijk("de VS", [symbolen("US", "wind"), symbolen("US", "sneeuw"), symbolen("US", "aardbeving")], [["V"], ["p_g"], ["S_S", "S_1", "S_DS", "S_D1"]]);
  gelijk("Canada", [symbolen("CA", "wind"), symbolen("CA", "sneeuw"), symbolen("CA", "aardbeving")], [["q"], ["S_s", "S_r"], ["PGA", "PGV", "S_a(T)"]]);
  gelijk("Zwitserland", [symbolen("CH", "wind"), symbolen("CH", "sneeuw"), symbolen("CH", "aardbeving")], [["q_p0"], ["h_0", "s_k"], ["", "a_gd", ""]]);
  gelijk("Zweden noemt het S_0, niet s_k", symbolen("SE", "sneeuw"), ["S_0"]);
  // Geen grootheid die geldt, en dat is bevestigd: dan is er ook niets in te vullen.
  gelijk("geen aardbevingsgrootheid: Ierland, Finland, Polen", ["IE", "FI", "PL"].map((c) => groothedenVan(landVanCode(c), "aardbeving").length), [0, 0, 0]);
  // Niet vastgesteld welke grootheid geldt: een vrij veld, en dat is zichtbaar.
  gelijk("niet vastgesteld: Zweden, aardbeving", groothedenVan(landVanCode("SE"), "aardbeving").map((g) => [g.id, g.bevestigd]), [["vrij", false]]);
  toets("een grootheid die alleen secundair bekend is, staat als niet bevestigd", groothedenVan(landVanCode("BE"), "wind").every((g) => !g.bevestigd));

  const s = standaardLokaal(keuze("DE"), "en");
  gelijk("de invoer begint leeg: geen getal uit een andere tabel", [s.wind.waarden, s.wind.bron, s.wind.q, s.sneeuw.waarden, s.sneeuw.s, s.aardbeving.waarden, s.veiligheid], [{}, "", "", {}, "", {}, ""]);
  toets("elk land: een eigen invoer", standaardLokaal(keuze("US"), "en") !== standaardLokaal(keuze("US"), "en"));

  gelijk("het tekstblok Aardbevingen is een rekenblok geworden", OPZET.find((k) => k.id === "uitgangspunten").kinderen.at(-1).inhoud, "aardbeving");
  toets("en houdt zijn tekst onder hetzelfde id", TEKST_IDS.includes("aardbeving"));
  gelijk("Nederland houdt zijn tekst", [standaardTeksten("nl").aardbeving, standaardTeksten("en").aardbeving], ["Er is geen aardbevingsontwerpsituatie voorgeschreven.", "No seismic design situation is required."]);

  // Een echt rekenblok: weg te halen en weer te plaatsen, en de tekst blijft.
  toets("aardbeving staat tussen de rekenblokken", REKENBLOKKEN.some((k) => k.id === "aardbeving" && k.inhoud === "aardbeving" && k.inspringen === 1));
  const eigen = { ...nieuw("nl"), teksten: { ...nieuw("nl").teksten, aardbeving: "Eigen tekst over de locatie." } };
  const zonder = verwijderKnoop(eigen, "aardbeving");
  toets("weghalen: het blok kan weer uit de lijst", ongeplaatsteBlokken(zonder).some((k) => k.inhoud === "aardbeving"));
  gelijk("en de tekst blijft", zonder.teksten.aardbeving, "Eigen tekst over de locatie.");
  const terug = plaatsBlok(zonder, "aardbeving", "belastingen");
  gelijk("plaatsen onder een ander hoofdstuk", [zoekKnoop("aardbeving", terug.opzet)?.inhoud, zoekKnoop("aardbeving", terug.opzet)?.niveau, terug.teksten.aardbeving], ["aardbeving", 2, "Eigen tekst over de locatie."]);
  toets("hooguit één keer", plaatsBlok(terug, "aardbeving", "uitgangspunten") === terug);
  // Een opzet van vóór het blok had hier gewone tekst: die wordt het blok, en geen los onderdeel zonder zijn tekst.
  const oud = normaliseerOpzet([{ id: "h", titel: { en: "H" }, kinderen: [{ id: "aardbeving", titel: { en: "Seismic" }, inhoud: "tekst" }] }]);
  gelijk("een oud template met aardbeving als tekst", [oud.opzet[0].kinderen[0].id, oud.opzet[0].kinderen[0].inhoud, oud.opzet[0].kinderen[0].titel.en, oud.meldingen], ["aardbeving", "aardbeving", "Seismic", []]);
}

// ── 4. Factoren ─────────────────────────────────────────────────────────────
kop("4. Factoren per land");
{
  // Met de hand uit de bron, zie boven: γ_G,inf, γ_G,sup, γ_Q,1, γ_Q,i.
  gelijk("EN 1990, tabel A1.2(A), (B), (C), A1.3 en A1.4", EN1990_FACTOREN.map((r) => [r.groep, r.naam.en, ...r.cellen]), [
    ["A", "EQU(6.10)", "0,90", "1,10", "1,50", "1,50ψ0"],
    ["B", "STR/GEO(6.10)", "1,00", "1,35", "1,50", "1,50ψ0"],
    ["B", "STR/GEO(6.10a)", "1,00", "1,35", "1,50ψ0", "1,50ψ0"],
    ["B", "STR/GEO(6.10b)", "1,00", "1,15", "1,50", "1,50ψ0"],
    ["C", "STR/GEO(6.10)", "1,00", "1,00", "1,30", "1,30ψ0"],
    ["", "Accidental(6.11a/b)", "1,00", "1,00", "ψ1/ψ2", "ψ2"],
    ["", "Characteristic(6.14b)", "1,00", "1,00", "1,00", "ψ0"],
    ["", "Frequent(6.15b)", "1,00", "1,00", "ψ1", "ψ2"],
    ["", "Quasi-perm.(6.16b)", "1,00", "1,00", "ψ2", "ψ2"],
  ]);
  gelijk("EN 1990, tabel A1.1", EN1990_PSI.map((r) => r.psi), [
    ["0,7", "0,5", "0,3"], ["0,7", "0,5", "0,3"], ["0,7", "0,7", "0,6"], ["0,7", "0,7", "0,6"], ["1,0", "0,9", "0,8"], ["0,7", "0,7", "0,6"], ["0,7", "0,5", "0,3"], ["0", "0", "0"],
    ["0,7", "0,5", "0,2"], ["0,7", "0,5", "0,2"], ["0,5", "0,2", "0"], ["0,6", "0,2", "0"], ["0,6", "0,5", "0"],
  ]);
  toets("de bron staat erbij", EN1990_BRONNEN.length >= 2 && EN1990_BRONNEN.every((b) => b.url.startsWith("https://") && b.titel.trim()));

  const de = standaardLokaal(keuze("DE"), "en");
  gelijk("Eurocode-land: de aanbevolen waarden als invoer", de.factoren[1], { groep: "B", naam: "STR/GEO(6.10)", gGinf: "1.00", gGsup: "1.35", gQ1: "1.50", gQi: "1.50ψ0" });
  gelijk("in de notatie van de taal", standaardLokaal(keuze("DE"), "nl").factoren[1].gGsup, "1,35");
  gelijk("ψ als invoer", de.psi[0], { naam: EN1990_PSI[0].naam.en, psi0: "0.7", psi1: "0.5", psi2: "0.3" });
  gelijk("geen eigen combinaties", de.combinaties, []);
  gelijk("elk Eurocode-land: dezelfde aanbevolen waarden", LANDEN.filter((l) => l.stelsel === "eurocode" && l.code !== "NL").filter((l) => !zelfde(standaardLokaal(keuze(l.code), "en").factoren, de.factoren)).map((l) => l.code), []);
  gelijk("buiten de Eurocodes: niets voorgevuld", LANDEN.filter((l) => l.stelsel === "eigen").map((l) => { const x = standaardLokaal(keuze(l.code), "en"); return x.factoren.length + x.psi.length + x.combinaties.length; }), LANDEN.filter((l) => l.stelsel === "eigen").map(() => 0));
  gelijk("tweede generatie: geen openbare waarden, dus niets voorgevuld", [standaardLokaal(keuze("DE", 2), "en").factoren, standaardLokaal(keuze("DE", 2), "en").psi], [[], []]);
  toets("q_k en Q_k komen niet uit een tabel", de.klassen.every((k) => k.qk === "" && k.Qk === ""));
}

// ── 5. Wisselen van land, onbetrouwbare invoer, wisselen van taal ───────────
kop("5. Wisselen van land");
{
  const nl = nieuw("nl");
  const nederland = NEDERLAND;
  toets("NEDERLAND is de keuze van een oud project", zelfde(nederland, normkeuzeVan({})));
  toets("zelfde keuze: hetzelfde rapport", pasRapportAan(nl, nederland, normkeuzeVan({ land: "NL", eurocode_generatie: "1" })) === nl);
  gelijk("Nederland heeft geen lokale invoer", nl.lokaal, undefined);
  toets("metLokaal: Nederland blijft hetzelfde object", metLokaal(nl, nederland) === nl);

  const de = pasRapportAan(nl, nederland, keuze("DE"));
  gelijk("de normen volgen het land", de.normen, landVanCode("DE").normenTekst.nl);
  gelijk("de invoer voor dit land staat klaar", de.lokaal.DE, standaardLokaal(keuze("DE"), "nl"));
  toets("Nederlandse eisen staan er niet stil bij", de.uitgangspunten.vervormingen.every((v) => !v.ueind && !v.ubij && !v.uhor));
  toets("de meegeleverde tekst over aardbeving wisselt: elders is die niet waar", de.teksten.aardbeving !== nl.teksten.aardbeving && STANDAARD_TEKSTEN.aardbeving.some((v) => v.tekst.nl === de.teksten.aardbeving));
  toets("materialen blijven in een Eurocode-land", de.uitgangspunten.materialen[0].soort === "C20/25");
  gelijk("en heen en terug: precies hetzelfde rapport", pasRapportAan(de, keuze("DE"), nederland), nl);

  const us = pasRapportAan(nl, nederland, keuze("US"));
  gelijk("de VS: geen Eurocode-klassen als standaard", [us.uitgangspunten.materialen[0].soort, us.uitgangspunten.bevestiging[0].kwaliteit], ["", ""]);
  gelijk("en terug", pasRapportAan(us, keuze("US"), nederland), nl);
  gelijk("Duitsland naar de VS en terug: ook hetzelfde", pasRapportAan(pasRapportAan(de, keuze("DE"), keuze("US")), keuze("US"), nederland), nl);

  // Eigen tekst blijft staan.
  const eigen = { ...nl, normen: "Eigen normenlijst", teksten: { ...nl.teksten, aardbeving: "Eigen tekst." } };
  eigen.uitgangspunten = kloon(nl.uitgangspunten);
  eigen.uitgangspunten.vervormingen[0].ueind = "L/200";
  const deEigen = pasRapportAan(eigen, nederland, keuze("DE"));
  gelijk("eigen normen, tekst en eisen blijven", [deEigen.normen, deEigen.teksten.aardbeving, deEigen.uitgangspunten.vervormingen[0].ueind], ["Eigen normenlijst", "Eigen tekst.", "L/200"]);

  // Wat je intypt, hoort bij dat land: een waarde gaat niet stil mee naar een ander land.
  const getypt = zetOpPad(de, leesPad("lokaal.DE.wind.waarden.windzone"), "2");
  const dk = pasRapportAan(getypt, keuze("DE"), keuze("DK"));
  gelijk("een ander land begint leeg", dk.lokaal.DK.wind.waarden, {});
  gelijk("terug: de waarde is er nog", pasRapportAan(dk, keuze("DK"), keuze("DE")).lokaal.DE.wind.waarden, { windzone: "2" });
  toets("onaangeraakte invoer blijft niet achter", pasRapportAan(de, keuze("DE"), keuze("DK")).lokaal.DE === undefined);

  // De generatie: de aanbevolen waarden uit de eerste gelden niet voor de tweede.
  const g2 = pasRapportAan(de, keuze("DE"), keuze("DE", 2));
  gelijk("tweede generatie: geen waarden uit de eerste", [g2.lokaal.DE.factoren, g2.lokaal.DE.psi], [[], []]);
  toets("en de normen volgen", g2.normen.includes("EN 1990:2023"));
  gelijk("terug naar de eerste: de aanbevolen waarden terug", pasRapportAan(g2, keuze("DE", 2), keuze("DE")).lokaal.DE.factoren, standaardLokaal(keuze("DE"), "nl").factoren);
  const zelf = zetOpPad(de, leesPad("lokaal.DE.factoren.1.gGsup"), "1,40");
  gelijk("eigen factoren blijven staan bij een andere generatie", pasRapportAan(zelf, keuze("DE"), keuze("DE", 2)).lokaal.DE.factoren[1].gGsup, "1,40");
  const nlg2 = pasRapportAan(nl, nederland, keuze("NL", 2));
  gelijk("Nederland, tweede generatie: eigen invoer, geen NB-tabel", [nlg2.lokaal.NL.factoren.length, nlg2.normen.includes("EN 1990:2023")], [0, true]);
  gelijk("en terug", pasRapportAan(nlg2, keuze("NL", 2), nederland), nl);

  // Onbetrouwbare invoer uit een bestand.
  const raar = { ...kloon(de), lokaal: { DE: { wind: { waarden: { a: "1", b: 3 }, bron: 4, q: "2" }, factoren: [{ naam: "x", gGsup: 3 }, 5], psi: "x", klassen: null }, "__proto__x": { wind: {} }, XX: {}, US: 3 } };
  const open = normaliseerRapport(kloon(raar), VANDAAG, standaardTeksten);
  gelijk("alleen geldige landen", Object.keys(open.lokaal), ["DE"]);
  gelijk("per veld gecontroleerd", [open.lokaal.DE.wind.waarden, open.lokaal.DE.wind.bron, open.lokaal.DE.wind.q], [{ a: "1" }, "", "2"]);
  gelijk("een rij uit een bestand krijgt al zijn velden", open.lokaal.DE.factoren, [{ groep: "", naam: "x", gGinf: "", gGsup: "", gQ1: "", gQi: "" }]);
  gelijk("lijsten die geen lijst zijn, zijn leeg", [open.lokaal.DE.psi, open.lokaal.DE.klassen, open.lokaal.DE.combinaties], [[], [], []]);
  toets("__proto__ in een bestand verandert niets", normaliseerRapport(JSON.parse('{"lokaal":{"__proto__":{"veiligheid":"x"}}}'), VANDAAG, standaardTeksten).lokaal === undefined && {}.veiligheid === undefined);
  gelijk("een oud rapport krijgt geen lokaal veld", "lokaal" in normaliseerRapport(kloon(nl), VANDAAG, standaardTeksten), false);
  gelijk("een rapport met lokale invoer komt ongeschonden terug", normaliseerRapport(kloon(de), VANDAAG, standaardTeksten), de);
  // Half ingevuld (via een pad zonder invoer): lezen vult aan met de standaard.
  const half = zetOpPad(nl, leesPad("lokaal.DE.wind.bron"), "Karte");
  gelijk("lokaalVan vult aan", [lokaalVan(half, keuze("DE")).wind.bron, lokaalVan(half, keuze("DE")).factoren.length, lokaalVan(nl, keuze("DE")).factoren.length], ["Karte", EN1990_FACTOREN.length, EN1990_FACTOREN.length]);

  // Taal.
  const en = wisselTaal(de, "en");
  gelijk("de normen wisselen mee met de taal", en.normen, landVanCode("DE").normenTekst.en);
  gelijk("de lokale invoer wisselt mee: namen en notatie", [en.lokaal.DE.factoren[6].naam, en.lokaal.DE.factoren[1].gGsup, en.lokaal.DE.psi[0].naam], ["Characteristic(6.14b)", "1.35", EN1990_PSI[0].naam.en]);
  gelijk("en terug", wisselTaal(en, "nl"), de);
  const metWaarde = zetOpPad(zetOpPad(de, leesPad("lokaal.DE.wind.q"), "0,85"), leesPad("lokaal.DE.wind.bron"), "DIBt, Liste");
  gelijk("een eigen getal gaat naar de notatie, een eigen tekst blijft", [wisselTaal(metWaarde, "en").lokaal.DE.wind.q, wisselTaal(metWaarde, "en").lokaal.DE.wind.bron], ["0.85", "DIBt, Liste"]);
  toets("nieuw in een ander land: nog steeds nieuw", isNieuwRapport(de, null, keuze("DE")) && isNieuwRapport(en, null, keuze("DE")) && !isNieuwRapport(metWaarde, null, keuze("DE")));
  toets("na opslaan en openen ook", isNieuwRapport(normaliseerRapport(kloon(de), VANDAAG, standaardTeksten), null, keuze("DE")));
  toets("Nederland zoals altijd", isNieuwRapport(nl) && isNieuwRapport(nl, null, nederland));
  gelijk("elke voorbladtekst heeft Engels en Nederlands", MEEGELEVERD.normen.filter((m) => !m.en || !m.nl), []);
}

// ── 6. Op welke norm rust een blad? ─────────────────────────────────────────
kop("6. De norm van een blad");
{
  const b = bladNormUit(balklaag);
  toets("de balklaag noemt zijn delen", b?.normen.includes("EN 1995-1-1") && b.normen.includes("EN 1990"), b);
  gelijk("en de Nederlandse bijlage", b.nederlandseBijlage, true);
  gelijk("de ligger en de tweepaalspoer ook", [bladNormUit(ligger)?.nederlandseBijlage, bladNormUit(tweepaalspoer)?.normen.includes("EN 1992-1-1")], [true, true]);
  gelijk("spanningen in een doorsnede rust op geen norm", bladNormUit(doorsnedeSpanningen), null);
  gelijk("een leeg blad", bladNormUit(""), null);
  gelijk("een eigen blad met K_FI hangt aan EN 1990", bladNormUit("γ_G = 1.2*K_FI")?.normen, ["EN 1990"]);
  gelijk("een eigen blad volgens EN zonder bijlage", bladNormUit('"Toets volgens EN 1993-1-1"')?.nederlandseBijlage, false);

  const soort = (land, gen, blad) => normAfwijking(keuze(land, gen), blad)?.soort ?? null;
  gelijk("Nederland: geen melding", soort("NL", undefined, b), null);
  gelijk("geen norm: geen melding, in elk land", ["NL", "DE", "US"].map((l) => soort(l, undefined, null)), [null, null, null]);
  gelijk("de VS: dit is geen toetsing aan de eigen norm", ["US", "CA", "CH", "AU", "NZ", "IN", "IT", "ES"].map((l) => soort(l, undefined, b)), Array(8).fill("eigen"));
  gelijk("Duitsland: de Nederlandse bijlage", soort("DE", undefined, b), "bijlage");
  gelijk("de Eurocode zonder bijlage: ook", soort(GEEN_BIJLAGE, undefined, b), "bijlage");
  gelijk("een blad zonder bijlage in Duitsland", soort("DE", undefined, { normen: ["EN 1993-1-1"], nederlandseBijlage: false }), "zonderBijlage");
  gelijk("tweede generatie: het blad rust op de eerste", [soort("DE", 2, b), soort("NL", 2, b)], ["generatie", "generatie"]);
  toets("de melding noemt de norm", normAfwijking(keuze("US"), b).normen.includes("EN 1995-1-1"));
}

// ── 7. De echte afdruk ──────────────────────────────────────────────────────
kop("7. De afdruk als html");
{
  const { laadRapportAfdruk, perRegel, zichtbareRegels } = await import("./lib/rapport-html.mjs");
  const m = await laadRapportAfdruk();
  const project = JSON.parse(lees("fixtures/rapport-oud.json"));
  const zet = (rapport, gegevens, exemplaren = project.exemplaren ?? []) => m.useProjectStore.getState().laadProject({ ...project, gegevens: { ...project.gegevens, ...gegevens }, rapport, exemplaren });

  // Nederland: tot op de letter, ook met de nieuwe velden ingevuld.
  await m.i18next.changeLanguage("nl");
  zet(project.rapport, { land: "NL", eurocode_generatie: "1" });
  const goud = lees("fixtures/rapport-oud-v4.html").trimEnd();
  const nu = perRegel(m.teken());
  toets("een Nederlands project met land en generatie: tot op de letter als het oude", nu === goud, nu.split("\n").find((r, i) => r !== goud.split("\n")[i])?.slice(0, 300));
  zet(project.rapport, {});
  toets("zonder de nieuwe velden: ook", perRegel(m.teken()) === goud);
  gelijk("een oud project is in de store Nederlands", [m.useProjectStore.getState().gegevens.land, m.useProjectStore.getState().gegevens.eurocode_generatie], ["NL", "1"]);
  toets("een oud rapport krijgt in de store geen lokale invoer", m.useProjectStore.getState().rapport.lokaal === undefined);

  // De store: een ander land kiezen past het rapport aan, en ongedaan maken zet het terug.
  const s = () => m.useProjectStore.getState();
  zet(nieuw("nl"), {});
  s().zetGegeven("land", "DE");
  gelijk("zetGegeven: het rapport volgt", s().rapport.normen, landVanCode("DE").normenTekst.nl);
  s().ongedaan();
  gelijk("ongedaan maken zet het land en het rapport terug", [s().gegevens.land, s().rapport.normen, s().rapport.lokaal], ["NL", "NEN-EN 1990 t/m 1997", undefined]);
  s().zetGegeven("land", "DE");
  s().zetGegeven("land", "NL");
  gelijk("en terug", s().rapport.normen, "NEN-EN 1990 t/m 1997");
  s().zetGegeven("eurocode_generatie", "2");
  toets("zetGegeven: ook de generatie", s().rapport.normen.includes("EN 1990:2023"));
  s().zetGegeven("eurocode_generatie", "1");
  // Een ingelezen project met een land en zonder invoer: die staat klaar, want het paneel schrijft erin.
  zet(nieuw("en"), { land: "US" });
  toets("laadProject: de invoer van het land staat klaar", s().rapport.lokaal?.US !== undefined);
  // Een nieuw project volgt de regio; in deze omgeving is die en-US.
  s().nieuwProject();
  gelijk("nieuwProject: de regio van het systeem", [navigator.language, s().gegevens.land, s().rapport.normen.includes("ASCE")], ["en-US", "US", true]);

  /** Een rapport voor dit land met alles ingevuld. */
  const ingevuld = (land, taal, gen) => {
    const k = keuze(land, gen);
    let r = wisselTaal(pasRapportAan(nieuw("nl"), NEDERLAND, k), taal);
    const zetLok = (pad, w) => { r = zetOpPad(r, leesPad(`lokaal.${land}.${pad}`), w); };
    for (const o of LOCATIE_ONDERWERPEN) {
      for (const g of groothedenVan(k.land, o)) zetLok(`${o}.waarden.${g.id}`, "7,5");
      zetLok(`${o}.bron`, "Official source");
    }
    zetLok("wind.q", "0,85");
    zetLok("sneeuw.s", "0,60");
    zetLok("veiligheid", "Class II");
    zetLok("klassen", [{ omschrijving: "Offices", qk: "2,5", Qk: "3,0" }]);
    if (!k.eurocode) zetLok("combinaties", [{ naam: "Strength", formule: "1.2D + 1.6L" }]);
    r = zetOpPad(r, leesPad("belastingen.wind.gebouwhoogte"), "9");
    r = zetOpPad(r, leesPad("uitgangspunten.bestaand.opnemen"), true);
    r = zetOpPad(r, leesPad("uitgangspunten.bestaand.bouwjaar"), "1955");
    return r;
  };
  const gegevens = (land, gen) => ({ land, windgebied: "1", terreincategorie: "3", ...(gen ? { eurocode_generatie: String(gen) } : {}) });

  /** Wat alleen uit een Nederlandse tabel kan komen: v_b,0, z_0, q_k, ψ, s en de oude voorschriften. */
  const NL_UITKOMST = /NEN-EN|\bNB[.–-]|\bNB\b|29[.,]5|24[.,]5|z0|zmin|0[.,]56|TGB 1990|GBV 19|Bbl|1[.,]75|Category A: domestic and residential|Terrain|Terrein|windgebied|Wind zone &/;

  for (const taal of ["en", "nl"]) {
    await m.i18next.changeLanguage(taal);
    for (const land of LANDEN.map((l) => l.code).filter((c) => c !== "NL")) {
      const k = keuze(land);
      zet(ingevuld(land, taal), gegevens(land), []);
      const html = m.teken();
      const regels = zichtbareRegels(html);
      const tekst = regels.join("\n");
      const rest = regels.filter((r) => NL_UITKOMST.test(r));
      toets(`${taal} ${land}: geen Nederlandse uitkomst`, rest.length === 0, rest.slice(0, 8).join(" | "));
      toets(`${taal} ${land}: de normen van dit land op het voorblad en in de lijst`, regels.includes(inTaal(k.land.normenTekst, taal)) && tekst.includes(k.land.normen.beton.aanduiding), regels.slice(0, 10).join(" | "));
      const bronTekst = taal === "nl" ? "Official source" : "Official source";
      toets(`${taal} ${land}: de ingevulde grootheden en hun bron`, tekst.includes(bronTekst) && (groothedenVan(k.land, "wind").length === 0 || html.includes(`>${taal === "nl" ? "7,5" : "7.5"}<`)));
      if (taal === "en") {
        // ÖNORM is geen Nederlands, en voor \b is Ö geen letter.
        const nl = regels.filter((r) => NL_WOORD.test(r.replace(/ÖNORM/g, "")));
        toets(`en ${land}: geen Nederlands in het rapport`, nl.length === 0, nl.slice(0, 8).join(" | "));
      }
      if (k.eurocode) {
        toets(`${taal} ${land}: de aanbevolen waarden en de melding over de nationale bijlage`, html.includes(`>${taal === "nl" ? "1,35" : "1.35"}<`) && regels.some((r) => (taal === "nl" ? /aanbevolen waarden.*nationale bijlage/i : /recommended values.*national annex/i).test(r)));
      } else {
        // In de html: zichtbareRegels laat een regel zonder woord weg.
        toets(`${taal} ${land}: de eigen combinaties, en geen Eurocode-tabel`, html.includes("1.2D + 1.6L") && !/6\.10|>β<|>K<sub>FI/.test(html));
      }
    }
  }

  // Het Nederlandse project in het Engels houdt zijn tabellen.
  await m.i18next.changeLanguage("en");
  zet(wisselTaal(ingevuldNederlands(), "en"), { land: "NL" }, []);
  const enNl = m.teken();
  toets("Nederland in het Engels: de NB-tabellen staan er", enNl.includes("6.3.1.2 NEN-EN 1991-1-1") && enNl.includes(">0.56<") && enNl.includes(">27.0<"));
  toets("en geen lijst met normen erbij", !zichtbareRegels(enNl).some((r) => /Standards applied/.test(r)));

  // Nederland, tweede generatie: de NB-tabellen gelden daar niet.
  zet(ingevuld("NL", "en", 2), gegevens("NL", 2), []);
  const g2 = zichtbareRegels(m.teken());
  toets("Nederland, tweede generatie: geen NB-tabel", !g2.some((r) => /NEN-EN|\bNB\b|0\.56|27\.0/.test(r)), g2.filter((r) => /NEN-EN|\bNB\b|0\.56|27\.0/.test(r)).slice(0, 5).join(" | "));
  toets("wel de melding dat waarden uit de norm komen", g2.some((r) => /second generation/i.test(r)));

  // Niet ingevuld: dan staat er niets dat op een uitkomst lijkt.
  zet(pasRapportAan(nieuw("en"), NEDERLAND, keuze("DE")), { land: "DE" }, []);
  const leeg = m.teken();
  toets("niet ingevuld: geen q_p en geen getal", !/kN\/m.{0,40}>\s*\d/.test(perRegel(leeg).split("\n").filter((r) => /Peak|Design pressure/.test(r)).join("")));
  toets("niet ingevuld staat er ook", zichtbareRegels(leeg).some((r) => /not entered/i.test(r)));
  toets("alleen een verwijzing of nog te bevestigen staat er ook", (() => { zet(pasRapportAan(nieuw("en"), NEDERLAND, keuze("SE")), { land: "SE" }, []); return zichtbareRegels(m.teken()).some((r) => /to be confirmed/i.test(r)); })());

  // De rekenbladen: op welke norm rust dit blad?
  const module = (id, naam, source) => ({ id, naam, templateId: id, source, waarden: {}, elementen: [] });
  const bladen = [module("ex-a", "Timber joists", balklaag), module("ex-b", "Section stresses", doorsnedeSpanningen)];
  const metHoofdstuk = (r) => ({ ...r, inHoofdstuk: { "ex-b": true } });
  zet(metHoofdstuk(ingevuld("US", "en")), gegevens("US"), bladen);
  const us = zichtbareRegels(m.teken());
  const uit = us.filter((r) => /rests on/.test(r));
  gelijk("de VS: de melding bij het blad, in hoofdstuk en in de bijlage; niet bij een blad zonder norm", uit.length, 2);
  toets("de melding noemt de Eurocode en de VS", uit.every((r) => /EN 1995-1-1/.test(r) && /United States/.test(r)), uit.join(" | "));
  toets("de VS: geen groen oordeel in de kop", !perRegel(m.teken()).split("\n").some((r) => /print-oordeel goed/.test(r)));
  await m.i18next.changeLanguage("nl");
  zet(metHoofdstuk(ingevuld("DE", "nl")), gegevens("DE"), bladen);
  const nlDe = zichtbareRegels(m.teken()).filter((r) => /rust op/.test(r));
  toets("Duitsland in het Nederlands: de melding over de Nederlandse bijlage", nlDe.length === 2 && nlDe.every((r) => /Nederlandse nationale bijlage/.test(r) && /Duitsland/.test(r)), nlDe.join(" | "));
  zet(project.rapport, { land: "NL" }, bladen);
  toets("Nederland: geen melding", !zichtbareRegels(m.teken()).some((r) => /rust op|rests on/.test(r)));
}

/** Het rapport van het Nederlandse voorbeeld met een hoogte, voor wind. */
function ingevuldNederlands() {
  return zetOpPad(nieuw("nl"), leesPad("belastingen.wind.gebouwhoogte"), "9");
}

console.log(fouten === 0 ? "\nNormen per land: alles in orde." : `\n${fouten} controle(s) gezakt.`);
process.exit(fouten === 0 ? 0 : 1);
