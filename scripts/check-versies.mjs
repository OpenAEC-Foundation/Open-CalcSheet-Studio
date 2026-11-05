/**
 * Controle van de versies in het projectbestand (store/versies.ts).
 *
 *   1  de inhoudshash: gelijk aan SHA-256 van node:crypto;
 *   2  het model: maken, wisselen, terug naar het origineel, een oude versie bewerken, en de
 *      revisietabel die de lijn van de versie volgt;
 *   3  ongedaan maken loopt per versie en nooit door een wissel heen;
 *   4  het projectbestand: opslaan en heropenen, een oud bestand, een bestand in een oudere app;
 *   5  grote bijlagen staan één keer in het bestand, op hun inhoudshash;
 *   6  een bestand met kapotte versies opent de laatste bruikbare stand;
 *   7  vergelijken met de oudertak: toegevoegd, verwijderd, hernoemd, invoer, rekentekst en
 *      uitkomsten uit de bestaande doorrekening; wisselen verandert geen enkel getal;
 *   8  de lijst per pagina: de regels, de toelichting die blijft, en de opzet met het blok. *
 * Draaien:  node scripts/check-versies.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { createHash } from "node:crypto";
import { sha256 } from "../packages/desktop/src/store/inhoudshash.ts";
import {
  actieveVersie, beginVersies, hernoemVersie, inhoudVan, lijnVan, magVerwijderen, nieuweVersie, ouderVan, revisieVan, rijIsVast, schrijfVersies, verwijderVersie, versieGegevens, wissel,
} from "../packages/desktop/src/store/versies.ts";
import { standaardRapport } from "../packages/desktop/src/rapport/model.ts";
import { standaardTeksten } from "../packages/desktop/src/rapport/standaardteksten.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";
import { rapportStatus } from "../packages/desktop/src/rapport/revisies.ts";
import { bouwProjectBestand, leesProjectBestand, PROJECT_FORMAAT_VERSIE, versiesUitOpslag } from "../packages/desktop/src/store/projectBestand.ts";
import { PDF_BLAD } from "../packages/desktop/src/store/pdfBijlage.ts";
import { SPREADSHEET_BLAD } from "../packages/desktop/src/store/spreadsheetBlad.ts";
import { MARKDOWN_BLAD } from "../packages/desktop/src/store/markdownBlad.ts";
import { GRAAF_BLAD } from "../packages/desktop/src/store/graafBlad.ts";
import { TEKEN_BLAD } from "../packages/desktop/src/store/tekenBlad.ts";
import { JUPYTER_BLAD } from "../packages/desktop/src/store/jupyterBlad.ts";
import { MARIMO_BLAD } from "../packages/desktop/src/store/marimoBlad.ts";
import { legeGraaf } from "../packages/desktop/src/graaf/model.ts";
import { bladenVoorIfc } from "../packages/desktop/src/store/projectIfcx.ts";
import { maakWijzigingen, metVerseLijst, regelVerschil, vergelijkBladen } from "../packages/desktop/src/store/versieVergelijking.ts";
import { keuzesZonderVerschil, keuzeVan, MAX_VERANDERINGEN, metKeuze, plekVanRegel, weggehaaldeRegels, zichtbareRegels } from "../packages/desktop/src/rapport/wijzigingen.ts";
import {
  bouwOpzet, heeftTekst, inhoudsopgave, inhoudVoorPaneel, knopenVan, OPZET, opzetVan, REKENBLOKKEN,
} from "../packages/desktop/src/rapport/opzet.ts";
import { normaliseerRapport } from "../packages/desktop/src/rapport/model.ts";
import { ongeplaatsteBlokken, plaatsBlok, verwijderKnoop } from "../packages/desktop/src/rapport/template.ts";
import { paneelGroepen } from "../packages/desktop/src/components/rapport/paneel/hulp.ts";
import { bouwProjectStep, isProjectIfcx, leesProjectIfcx, leesUitkomst, OCSS_SCHEMAS } from "../packages/core/dist/index.js";
import { afwijkingen } from "./lib/ifcx-specificatie.mjs";

let fouten = 0;
function toets(naam, ok, detail) {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${naam}${ok || detail === undefined ? "" : `\n         ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
}
/** Diepe vergelijking; de volgorde van sleutels telt niet. */
function zelfde(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && zelfde(a[k], b[k]));
}
/** Hoogstens een stuk: een bijlage is megabytes groot. */
const kort = (x) => {
  const t = JSON.stringify(x, (_k, v) => (typeof v === "string" && v.length > 200 ? `${v.slice(0, 40)}… (${v.length} tekens)` : v)) ?? "undefined";
  return t.length > 1500 ? `${t.slice(0, 1500)}…` : t;
};
const gelijk = (naam, kreeg, verwacht) => toets(naam, zelfde(kreeg, verwacht), `kreeg ${kort(kreeg)}, verwacht ${kort(verwacht)}`);
const kop = (t) => console.log(`\n${t}`);

const VANDAAG = "05-11-2026";
const LATER = "12-11-2026";
const GEEN_BLAD = "__projectgegevens__";

const nieuwRapport = (taal = "nl") => standaardRapport(VANDAAG, standaardTeksten(taal), taal);
const blad = (id, naam, waarden = {}, source = "x = 1\n") => ({ id, naam, templateId: "", source, waarden, elementen: [] });

/** Een stand zoals in de store: de werkstand bovenaan, en de versies. */
function beginStand(exemplaren = [blad("ex-a", "Blad A", { L: "4,2" }), blad("ex-b", "Blad B")]) {
  return {
    exemplaren,
    gegevens: { ...legeGegevens(), project_naam: "Proef" },
    rapport: nieuwRapport(),
    activeId: exemplaren[0]?.id ?? GEEN_BLAD,
    versies: beginVersies(),
    verleden: [],
    toekomst: [],
    stapels: {},
  };
}
const maak = (s, id, omschrijving = "", datum = LATER) => ({ ...s, ...nieuweVersie(s, { id, datum, naam: "", omschrijving }) });
const naar = (s, id) => ({ ...s, ...wissel(s, id, GEEN_BLAD) });
/** Wat een bewerking in de store doet: een punt in de geschiedenis en een nieuw object. */
function zetWaarde(s, id, naam, waarde) {
  const punt = { exemplaren: s.exemplaren, gegevens: s.gegevens, rapport: s.rapport, activeId: s.activeId };
  return {
    ...s,
    verleden: [...s.verleden, punt],
    toekomst: [],
    exemplaren: s.exemplaren.map((e) => (e.id === id ? { ...e, waarden: { ...e.waarden, [naam]: waarde } } : e)),
  };
}
function ongedaan(s) {
  const vorige = s.verleden.at(-1);
  if (!vorige) return s;
  return { ...s, ...vorige, verleden: s.verleden.slice(0, -1), toekomst: [...s.toekomst, { exemplaren: s.exemplaren, gegevens: s.gegevens, rapport: s.rapport, activeId: s.activeId }] };
}
const waarde = (s, id, naam) => s.exemplaren.find((e) => e.id === id)?.waarden[naam];
const codes = (r) => r.revisies.map((x) => x.code);

// ── 1. De inhoudshash ───────────────────────────────────────────────────────
kop("1. De inhoudshash");
{
  const voor = (t) => createHash("sha256").update(t, "utf8").digest("hex");
  gelijk("de lege tekst", sha256(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  gelijk("abc", sha256("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  for (const lengte of [1, 55, 56, 57, 63, 64, 65, 119, 120, 1000, 100_003]) {
    const tekst = "JVBERi0xLjQK".repeat(Math.ceil(lengte / 12)).slice(0, lengte);
    gelijk(`${lengte} tekens, gelijk aan node:crypto`, sha256(tekst), voor(tekst));
  }
  gelijk("niet-ASCII gaat als UTF-8", sha256("γ_G = 1,2·K_FI — ψ₀ 😀"), voor("γ_G = 1,2·K_FI — ψ₀ 😀"));
  const groot = "A".repeat(20_000_000);
  const begin = performance.now();
  const uitkomst = sha256(groot);
  const duur = performance.now() - begin;
  gelijk("20 MB base64", uitkomst, voor(groot));
  toets(`en dat is snel genoeg om bij het opslaan te doen (${Math.round(duur)} ms)`, duur < 5000, `${Math.round(duur)} ms`);
}

// ── 2. Het model ────────────────────────────────────────────────────────────
kop("2. Maken, wisselen en terug");
{
  let s = beginStand();
  gelijk("een project begint als één versie", s.versies.lijst.length, 1);
  toets("en die heeft geen ouder", ouderVan(s.versies, s.versies.actief) === undefined);
  const eersteId = s.versies.actief;
  gelijk("de eerste versie noemt de laatste revisie", versieGegevens(s, actieveVersie(s.versies)).code, "A");
  toets("de rijen van één versie blijven vrij", s.rapport.revisies.every((r) => !rijIsVast(r, s.versies).cellen));

  const origineel = { exemplaren: s.exemplaren, gegevens: s.gegevens, rapport: s.rapport };
  s = maak(s, "v-b", "Kolom versterkt");
  gelijk("Nieuwe versie maakt een tak", s.versies.lijst.map((v) => [v.id, v.ouder]), [[eersteId, undefined], ["v-b", eersteId]]);
  gelijk("en die staat open", s.versies.actief, "v-b");
  gelijk("elke versie is een regel in de revisietabel", codes(s.rapport), ["A", "B"]);
  gelijk("met de datum en omschrijving van de versie", [s.rapport.revisies[1].datum, s.rapport.revisies[1].omschrijving, s.rapport.revisies[1].status], [LATER, "Kolom versterkt", "concept"]);
  gelijk("de versie leest zijn gegevens uit zijn eigen regel", versieGegevens(s, actieveVersie(s.versies)), { code: "B", datum: LATER, omschrijving: "Kolom versterkt", status: "concept" });
  gelijk("de rapportstatus op het voorblad volgt", rapportStatus(s.rapport.revisies), "concept");
  toets("de bladen zijn gedeeld, niet gekopieerd: het kost geen geheugen", s.exemplaren === origineel.exemplaren && s.gegevens === origineel.gegevens);
  toets("het origineel is bewaard", inhoudVan(s, eersteId).exemplaren === origineel.exemplaren);
  gelijk("en zijn rapport heeft nog één regel", codes(inhoudVan(s, eersteId).rapport), ["A"]);
  toets("de actieve versie houdt geen kopie: de werkstand is de enige bron", actieveVersie(s.versies).inhoud === undefined);

  s = zetWaarde(s, "ex-a", "L", "5,0");
  gelijk("wat je wijzigt, staat in de nieuwe versie", waarde(s, "ex-a", "L"), "5,0");
  gelijk("en niet in het origineel", inhoudVan(s, eersteId).exemplaren.find((e) => e.id === "ex-a").waarden.L, "4,2");

  s = naar(s, eersteId);
  gelijk("terug naar het origineel", waarde(s, "ex-a", "L"), "4,2");
  gelijk("het rapport van het origineel", codes(s.rapport), ["A"]);
  toets("niets gekopieerd bij terugkeren", s.exemplaren === origineel.exemplaren);
  gelijk("de andere versie heeft zijn wijziging nog", inhoudVan(s, "v-b").exemplaren.find((e) => e.id === "ex-a").waarden.L, "5,0");
  const zelfdeStand = wissel(s, eersteId, GEEN_BLAD);
  toets("naar de versie die al open staat: niets", zelfdeStand === s);
  toets("naar een onbekende versie: niets", wissel(s, "v-bestaat-niet", GEEN_BLAD) === s);

  // Een oude versie blijft bewerkbaar: het is een tak.
  s = zetWaarde(s, "ex-b", "b", "75");
  gelijk("het origineel is bewerkbaar", waarde(s, "ex-b", "b"), "75");
  gelijk("en dat raakt de tak niet", inhoudVan(s, "v-b").exemplaren.find((e) => e.id === "ex-b").waarden.b, undefined);
  s = naar(s, "v-b");
  gelijk("heen en weer verliest niets: de tak", [waarde(s, "ex-a", "L"), waarde(s, "ex-b", "b")], ["5,0", undefined]);
  s = naar(s, eersteId);
  gelijk("en het origineel", [waarde(s, "ex-a", "L"), waarde(s, "ex-b", "b")], ["4,2", "75"]);

  // Een tweede tak op het origineel: een eigen code, en alleen zijn eigen lijn op het voorblad.
  s = maak(s, "v-c", "Andere oplossing");
  gelijk("een tweede tak krijgt een code die nog vrij is", versieGegevens(s, actieveVersie(s.versies)).code, "C");
  gelijk("op het voorblad de lijn van deze versie, niet de andere tak", codes(s.rapport), ["A", "C"]);
  gelijk("de lijn", lijnVan(s.versies, "v-c").map((v) => v.id), [eersteId, "v-c"]);
  s = maak(s, "v-d", "Verder op C");
  gelijk("een kleinkind", [codes(s.rapport), lijnVan(s.versies, "v-d").map((v) => v.id)], [["A", "C", "D"], [eersteId, "v-c", "v-d"]]);

  // De regel van een andere versie staat vast; die van de eigen versie is te bewerken, niet weg te halen.
  const [rijA, rijC, rijD] = s.rapport.revisies;
  toets("de eigen regel is te bewerken", !rijIsVast(rijD, s.versies).cellen);
  toets("maar hoort bij de versie: niet weg te halen", rijIsVast(rijD, s.versies).verwijderen);
  toets("de regel van een eerdere versie staat vast", rijIsVast(rijA, s.versies).cellen && rijIsVast(rijC, s.versies).cellen);
  toets("een eigen regel zonder versie blijft vrij", !rijIsVast({ code: "X", datum: "", omschrijving: "", status: "concept" }, s.versies).cellen);

  // Wat de eerdere versie later zelf zegt, volgt op het voorblad na een wissel.
  s = naar(s, "v-c");
  s = { ...s, rapport: { ...s.rapport, revisies: s.rapport.revisies.map((r) => (r.versieId === "v-c" ? { ...r, omschrijving: "Tweede oplossing", datum: "20-11-2026" } : r)) } };
  s = naar(s, "v-d");
  gelijk("de regel van C in D volgt C", [s.rapport.revisies[1].omschrijving, s.rapport.revisies[1].datum], ["Tweede oplossing", "20-11-2026"]);

  // Een blad dat in de andere versie niet bestaat.
  s = naar(s, "v-d");
  const metBlad = { ...s, exemplaren: [...s.exemplaren, blad("ex-nieuw", "Alleen in D")], activeId: "ex-nieuw" };
  const terug = naar(metBlad, "v-c");
  toets("het blad dat openstaat bestaat in de andere versie niet: dan het eerste blad", terug.activeId === "ex-a", terug.activeId);
  const leeg = naar({ ...maak(beginStand([]), "v-2"), activeId: "__rapport__" }, beginVersies().actief);
  gelijk("het rapport blijft open staan", leeg.activeId, "__rapport__");
  const zonderBladen = naar({ ...maak(beginStand([]), "v-2"), exemplaren: [blad("ex-x", "X")], activeId: "ex-x" }, beginVersies().actief);
  gelijk("zonder bladen naar de projectgegevens", zonderBladen.activeId, GEEN_BLAD);
  const metRapport = naar({ ...s, activeId: "ex-b" }, "v-b");
  gelijk("een blad dat er wel is, blijft open", metRapport.activeId, "ex-b");
}

kop("2b. Een versie weghalen");
{
  let s = beginStand();
  const eerste = s.versies.actief;
  s = maak(s, "v-b");
  s = maak(s, "v-c");
  toets("de actieve versie kan niet weg", !magVerwijderen(s.versies, "v-c"));
  toets("het origineel ook niet", !magVerwijderen(s.versies, eerste));
  toets("een versie ertussen wel", magVerwijderen(s.versies, "v-b"));
  gelijk("wat niet mag, verandert niets", verwijderVersie(s, "v-c") === s, true);
  s = { ...s, ...verwijderVersie(s, "v-b") };
  gelijk("de kinderen hangen aan zijn ouder", s.versies.lijst.map((v) => [v.id, v.ouder]), [[eerste, undefined], ["v-c", eerste]]);
  gelijk("zijn regel blijft staan in het rapport: daar is deze versie uit ontstaan", codes(s.rapport), ["A", "B", "C"]);
  toets("en is weer een gewone regel", !rijIsVast(s.rapport.revisies[1], s.versies).cellen && !("versieId" in s.rapport.revisies[1]));
}

// ── 3. Ongedaan maken ───────────────────────────────────────────────────────
kop("3. Ongedaan maken per versie");
{
  let s = beginStand();
  const eerste = s.versies.actief;
  s = zetWaarde(s, "ex-a", "L", "4,5");
  s = zetWaarde(s, "ex-a", "L", "4,6");
  s = maak(s, "v-b");
  gelijk("een nieuwe versie begint zonder geschiedenis", [s.verleden.length, s.toekomst.length], [0, 0]);
  gelijk("ongedaan maken doet dan niets: het loopt niet terug naar voor de tak", waarde(ongedaan(s), "ex-a", "L"), "4,6");
  s = zetWaarde(s, "ex-a", "L", "9,9");
  s = naar(s, eerste);
  gelijk("na de wissel: de stappen van het origineel", s.verleden.length, 2);
  s = ongedaan(s);
  gelijk("ongedaan maken raakt alleen deze versie", waarde(s, "ex-a", "L"), "4,5");
  gelijk("de andere versie houdt zijn waarde", inhoudVan(s, "v-b").exemplaren.find((e) => e.id === "ex-a").waarden.L, "9,9");
  s = naar(s, "v-b");
  gelijk("in de tak: één eigen stap", s.verleden.length, 1);
  gelijk("de opnieuw-stappen van het origineel gaan niet mee", s.toekomst.length, 0);
  s = ongedaan(s);
  gelijk("terug op het punt van de tak", waarde(s, "ex-a", "L"), "4,6");
  s = ongedaan(s);
  gelijk("en niet verder", waarde(s, "ex-a", "L"), "4,6");
  s = naar(s, eerste);
  gelijk("het origineel kent zijn opnieuw-stap nog", s.toekomst.length, 1);
  gelijk("en is niet stil veranderd", waarde(s, "ex-a", "L"), "4,5");
}

// ── 4. Het projectbestand ───────────────────────────────────────────────────
kop("4. Opslaan en heropenen");
/** Wat de app schrijft: de werkstand in de knopen, de versies erbij. */
const schrijf = (s) => bouwProjectBestand({ versie: PROJECT_FORMAAT_VERSIE, naam: "Proef", gegevens: s.gegevens, exemplaren: s.exemplaren, rapport: s.rapport, versies: s.versies }, null);
/** Wat de app leest, als stand. */
function heropen(tekst) {
  const g = leesProjectBestand(tekst, "proef");
  return { ...g, activeId: g.exemplaren[0]?.id ?? GEEN_BLAD, versies: g.versies ?? beginVersies(), verleden: [], toekomst: [], stapels: {} };
}
const inhoudVanDoc = (tekst) => {
  const { header: _kop, ...rest } = JSON.parse(tekst);
  return rest;
};
const versieAttribuut = (tekst) => JSON.parse(tekst).data.find((k) => k.attributes?.["ocss::versies"])?.attributes["ocss::versies"];
{
  // Een bestand zonder versies.
  const oud = beginStand();
  const tekstOud = schrijf(oud);
  toets("één versie zonder eigen naam: geen attribuut in het bestand", versieAttribuut(tekstOud) === undefined);
  toets("en geen knoop", !tekstOud.includes('"Versies"'));
  gelijk("het bestand is tot op de letter wat het zonder versies was", inhoudVanDoc(tekstOud), inhoudVanDoc(bouwProjectBestand({ versie: PROJECT_FORMAAT_VERSIE, naam: "Proef", gegevens: oud.gegevens, exemplaren: oud.exemplaren, rapport: oud.rapport }, null)));
  gelijk("de formaatversie blijft", [PROJECT_FORMAAT_VERSIE, JSON.parse(tekstOud).header.dataVersion], [2, "2.0.0"]);
  const geopend = leesProjectBestand(tekstOud, "proef");
  toets("een oud bestand heeft geen versies om te lezen", geopend.versies === undefined && geopend.versieMeldingen === undefined);
  const stand = heropen(tekstOud);
  gelijk("en is na het openen één versie", [stand.versies.lijst.length, versieGegevens(stand, actieveVersie(stand.versies)).code], [1, "A"]);
  gelijk("met al zijn bladen", stand.exemplaren.map((e) => [e.id, e.waarden]), oud.exemplaren.map((e) => [e.id, e.waarden]));

  // Een eigen naam is wel iets om te bewaren.
  const genoemd = { ...oud, versies: hernoemVersie(oud.versies, oud.versies.actief, "Origineel") };
  gelijk("een eigen naam gaat mee", actieveVersie(heropen(schrijf(genoemd)).versies).naam, "Origineel");

  // Een bestand met versies.
  let s = beginStand();
  const eerste = s.versies.actief;
  s = maak(s, "v-b", "Kolom versterkt");
  s = zetWaarde(s, "ex-a", "L", "5,0");
  s = { ...s, verleden: [], toekomst: [] };
  s = maak(s, "v-c", "Nog een stap");
  s = { ...s, exemplaren: s.exemplaren.filter((e) => e.id !== "ex-b"), activeId: "ex-a" };
  const tekst = schrijf(s);
  const a = versieAttribuut(tekst);
  gelijk("de lijst in het bestand", a.lijst.map((v) => [v.id, v.code, v.datum, v.omschrijving, v.ouder]), [[eerste, "A", VANDAAG, s.versies.lijst.length && inhoudVan(s, eerste).rapport.revisies[0].omschrijving, undefined], ["v-b", "B", LATER, "Kolom versterkt", eerste], ["v-c", "C", LATER, "Nog een stap", "v-b"]]);
  gelijk("de vorm uit het ontwerp", Object.keys(a.lijst[0]).sort(), ["code", "datum", "id", "inhoud", "naam", "omschrijving"]);
  toets("de actieve versie heeft er geen inhoud: die staat in de knopen", !("inhoud" in a.lijst[2]) && a.actief === "v-c");
  const doc = JSON.parse(tekst);
  gelijk("het bestand blijft geldig IFCX", afwijkingen(doc), []);
  toets("met het schema van de versies erin", !!doc.schemas["ocss::versies"] && !!OCSS_SCHEMAS["ocss::versies"]);
  gelijk("alleen de bladen van de actieve versie staan als blad in het bestand", doc.data.filter((k) => k.attributes?.["ocss::blad"]).map((k) => k.attributes["ocss::blad"].id), ["ex-a"]);

  const terug = heropen(tekst);
  gelijk("de lijst komt terug", terug.versies.lijst.map((v) => [v.id, v.ouder]), s.versies.lijst.map((v) => [v.id, v.ouder]));
  gelijk("op de versie die open stond", terug.versies.actief, "v-c");
  toets("zonder meldingen", terug.versieMeldingen === undefined, terug.versieMeldingen);
  gelijk("de werkstand", [waarde(terug, "ex-a", "L"), terug.exemplaren.length, codes(terug.rapport)], ["5,0", 1, ["A", "B", "C"]]);
  gelijk("de rapporten komen terug", codes(inhoudVan(terug, "v-b").rapport), ["A", "B"]);
  gelijk("elke versie met haar bladen", [inhoudVan(terug, eerste).exemplaren.map((e) => e.waarden.L), inhoudVan(terug, "v-b").exemplaren.map((e) => e.waarden.L)], [["4,2", undefined], ["5,0", undefined]]);
  gelijk("en haar gegevens", inhoudVan(terug, eerste).gegevens, inhoudVan(s, eerste).gegevens);
  gelijk("de koppeling in de revisietabel blijft", terug.rapport.revisies.map((r) => r.versieId), [eerste, "v-b", "v-c"]);
  toets("en de regels staan weer vast", rijIsVast(terug.rapport.revisies[0], terug.versies).cellen);

  // Opslaan, openen en opslaan geeft dezelfde inhoud.
  gelijk("opslaan, openen, opslaan: dezelfde inhoud", inhoudVanDoc(schrijf(terug)), inhoudVanDoc(tekst));
  let w = naar(terug, eerste);
  gelijk("wisselen na het openen", waarde(w, "ex-a", "L"), "4,2");
  const w2 = heropen(schrijf(w));
  gelijk("ook andersom opgeslagen", [w2.versies.actief, waarde(w2, "ex-a", "L"), inhoudVan(w2, "v-c").exemplaren.length], [eerste, "4,2", 1]);

  // De lijst met wijzigingen is afgeleid; wat de gebruiker ermee deed niet.
  const metLijst = { ...s, rapport: { ...s.rapport, wijzigingen: { "blad:ex-a": { toelichting: "Eigen tekst" } }, wijzigingsLijst: [{ sleutel: "blad:ex-a", doel: "blad", id: "ex-a", titel: "Blad A", delen: [{ soort: "erbij" }] }] } };
  const lijstTekst = schrijf(metLijst);
  toets("de lijst zelf staat niet in het bestand", !lijstTekst.includes("wijzigingsLijst"));
  gelijk("de toelichting wel", heropen(lijstTekst).rapport.wijzigingen, { "blad:ex-a": { toelichting: "Eigen tekst" } });
}

kop("4b. Een bestand met versies in een oudere app");
{
  let s = beginStand();
  s = maak(s, "v-b", "Kolom versterkt");
  s = zetWaarde(s, "ex-a", "L", "5,0");
  const tekst = schrijf(s);
  // Een oudere app kent het attribuut niet: hij leest wat hij kent en laat de rest liggen.
  const doc = JSON.parse(tekst);
  const zonderKennis = { ...doc, data: doc.data.filter((k) => !k.attributes?.["ocss::versies"]) };
  toets("hij herkent zijn eigen projectbestand", isProjectIfcx(doc));
  const ruw = leesProjectIfcx(doc);
  gelijk("en leest de actieve versie als een gewoon project", ruw.exemplaren.map((e) => [e.id, e.waarden]), s.exemplaren.map((e) => [e.id, e.waarden]));
  gelijk("de formaatversie is dezelfde", ruw.formaatversie, 2);
  gelijk("het maakt niet uit of het attribuut er is", { ...leesProjectIfcx(zonderKennis), versies: undefined }, { ...ruw, versies: undefined });
  toets("het hele project is te lezen zonder de versies", leesProjectBestand(JSON.stringify(zonderKennis), "proef").exemplaren.length === 2);
  gelijk("het voorblad noemt de revisies ook daar", ruw.rapport.revisies.map((r) => r.code), ["A", "B"]);
  const step = bouwProjectStep(doc);
  gelijk("en een STEP uit dit bestand kent één project", step.match(/IFCPROJECT\(/g)?.length, 1);
}

// ── 5. Grote bijlagen ───────────────────────────────────────────────────────
kop("5. Grote bijlagen staan één keer in het bestand");
{
  // 2 MB aan base64: bewust geen herhaling, en zonder opvulling.
  const groot = (zaad, lengte = 2_000_000) => {
    let uit = "";
    let n = zaad;
    while (uit.length < lengte) {
      n = (n * 1103515245 + 12345) % 2147483648;
      uit += n.toString(36).padStart(7, "A");
    }
    return Buffer.from(uit.slice(0, lengte)).toString("base64");
  };
  const pdf = groot(1);
  const xlsx = groot(2);
  const zip = groot(3);
  const logo = `data:image/png;base64,${groot(4, 300_000)}`;
  const beeld = `data:image/png;base64,${groot(5, 200_000)}`;
  const graaf = { ...legeGraaf() };
  const vel = { formaat: "A4", ligging: "staand", views: [{ id: "view-1", titel: "Aanzicht", x: 10, y: 10, breedte: 100, hoogte: 100, schaal: 50, x0: 0, y0: 0, elementen: [] }] };
  const bladen = () => [
    blad("ex-reken", "Rekenblad", { L: "4,2" }, `"Lange tekst\n${"x = 1\n".repeat(600)}`),
    { id: "ex-pdf", naam: "PDF", templateId: PDF_BLAD, source: "", waarden: {}, elementen: [], pdf: { bestandsnaam: "a.pdf", data: pdf } },
    { id: "ex-xlsx", naam: "Werkmap", templateId: SPREADSHEET_BLAD, source: "", waarden: {}, elementen: [], xlsx: { bestandsnaam: "a.xlsx", data: xlsx } },
    { id: "ex-md", naam: "Tekst", templateId: MARKDOWN_BLAD, source: "", waarden: {}, elementen: [], md: { bestandsnaam: "a.md", tekst: "# Kop\n\nTekst.", beelden: { "a.png": beeld } } },
    { id: "ex-graaf", naam: "Graaf", templateId: GRAAF_BLAD, source: "", waarden: {}, elementen: [], graaf },
    { id: "ex-teken", naam: "Tekening", templateId: TEKEN_BLAD, source: "", waarden: {}, elementen: [], tekenvel: vel },
    { id: "ex-jup", naam: "Notebook", templateId: JUPYTER_BLAD, source: "", waarden: {}, elementen: [], jupyter: { bestandsnaam: "a.zip", data: zip, metCode: true } },
    { id: "ex-mar", naam: "Marimo", templateId: MARIMO_BLAD, source: "", waarden: {}, elementen: [], marimo: { bestandsnaam: "a.py", code: "print(1)", metCode: true, uitvoer: ["<p>1</p>"] } },
  ];
  let s = beginStand(bladen());
  s = { ...s, rapport: { ...s.rapport, bureau: { ...s.rapport.bureau, naam: "Bureau", logo, voetafbeelding: logo } } };
  const zonder = schrijf(s).length;
  const eersteId = s.versies.actief;
  s = maak(s, "v-1a");
  const een = schrijf(s).length;
  let tien = s;
  for (let i = 2; i <= 10; i++) tien = maak(tien, `v-${i}a`, `Versie ${i}`);
  const metTien = schrijf(tien);
  const groei = (metTien.length - zonder) / zonder;
  const aantalKeer = (t, deel) => t.split(deel).length - 1;
  toets(`tien versies erbij: het bestand groeit ${(groei * 100).toFixed(1)}% (${Math.round(zonder / 1e6)} MB, ${Math.round(metTien.length / 1e6 * 10) / 10} MB)`, groei < 0.25, { zonder, metTien: metTien.length });
  toets(`één versie erbij: ${((een - zonder) / zonder * 100).toFixed(1)}%`, (een - zonder) / zonder < 0.05);
  for (const [naam, tekst] of [["de PDF", pdf], ["de werkmap", xlsx], ["de notebook", zip], ["de afbeelding in Markdown", beeld]]) {
    gelijk(`${naam} staat één keer in het bestand`, aantalKeer(metTien, tekst), 1);
  }

  // Terug uit het bestand, per versie.
  const terug = heropen(metTien);
  toets("zonder meldingen", terug.versieMeldingen === undefined, terug.versieMeldingen);
  const vanOud = inhoudVan(terug, eersteId);
  const zoek = (i, id) => i.exemplaren.find((e) => e.id === id);
  gelijk("elke bijlage komt terug in de oude versie", [zoek(vanOud, "ex-pdf").pdf.data === pdf, zoek(vanOud, "ex-xlsx").xlsx.data === xlsx, zoek(vanOud, "ex-jup").jupyter.data === zip, zoek(vanOud, "ex-md").md.beelden["a.png"] === beeld], [true, true, true, true]);
  gelijk("ook de rekentekst", zoek(vanOud, "ex-reken").source, bladen()[0].source);
  gelijk("het logo van het bureau", [vanOud.rapport.bureau.logo === logo, vanOud.rapport.bureau.voetafbeelding === logo], [true, true]);
  gelijk("de andere soorten bladen", [typeof zoek(vanOud, "ex-graaf").graaf, zoek(vanOud, "ex-teken").tekenvel?.views.length, zoek(vanOud, "ex-mar").marimo.code], ["object", vel.views.length, "print(1)"]);
  gelijk("en in de actieve versie", [zoek(terug, "ex-pdf").pdf.data === pdf, zoek(terug, "ex-xlsx").xlsx.data === xlsx], [true, true]);
  const eerstVerschil = (x, y, pad = "") => {
    if (Object.is(x, y)) return null;
    if (typeof x !== "object" || typeof y !== "object" || x === null || y === null) return `${pad}: ${kort(x)} tegenover ${kort(y)}`;
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
      const v = eerstVerschil(x[k], y[k], `${pad}.${k}`);
      if (v) return v;
    }
    return null;
  };
  const verschil = eerstVerschil(inhoudVanDoc(schrijf(terug)), inhoudVanDoc(metTien));
  toets("opslaan, openen, opslaan: dezelfde inhoud", verschil === null, verschil ?? "");

  // De opgeslagen staat van de app, net zo ingepakt: anders staat de PDF daar elke wissel elf keer.
  const ingepakt = JSON.stringify(schrijfVersies(tien.versies, tien));
  gelijk("de opgeslagen staat bewaart hem niet per versie", aantalKeer(ingepakt, pdf), 0);
  const uitOpslag = versiesUitOpslag(JSON.parse(ingepakt), tien, "proef");
  gelijk("en komt terug", [uitOpslag.lijst.length, uitOpslag.actief, zoek(uitOpslag.lijst[0].inhoud, "ex-pdf").pdf.data === pdf], [11, tien.versies.actief, true]);
  gelijk("een project met één versie heeft daar niets bij", schrijfVersies(beginVersies(), beginStand()), undefined);

  // Een PDF die alleen in een andere versie staat, ook één keer; en een andere PDF apart.
  let t = beginStand(bladen());
  t = maak(t, "v-b");
  t = { ...t, exemplaren: t.exemplaren.filter((e) => e.id !== "ex-pdf") };
  t = maak(t, "v-c");
  const alleenElders = schrijf(t);
  gelijk("een PDF die de actieve versie niet heeft, staat er ook één keer in", aantalKeer(alleenElders, pdf), 1);
  gelijk("onder zijn hash", Object.keys(versieAttribuut(alleenElders).bijlagen).includes(sha256(pdf)), true);
  gelijk("en komt terug", zoek(inhoudVan(heropen(alleenElders), t.versies.lijst[0].id), "ex-pdf").pdf.data === pdf, true);

  let v = beginStand(bladen());
  v = maak(v, "v-b");
  const anderePdf = groot(99);
  v = { ...v, exemplaren: v.exemplaren.map((e) => (e.id === "ex-pdf" ? { ...e, pdf: { ...e.pdf, data: anderePdf } } : e)) };
  const twee = schrijf(v);
  gelijk("een vervangen PDF: beide staan erin, elk één keer", [aantalKeer(twee, pdf), aantalKeer(twee, anderePdf)], [1, 1]);
  gelijk("en elke versie houdt de hare", [zoek(inhoudVan(heropen(twee), v.versies.lijst[0].id), "ex-pdf").pdf.data === pdf, zoek(heropen(twee), "ex-pdf").pdf.data === anderePdf], [true, true]);

  // Aantekeningen maken een ander object, niet een andere PDF.
  let n = beginStand(bladen());
  n = maak(n, "v-b");
  n = { ...n, exemplaren: n.exemplaren.map((e) => (e.id === "ex-pdf" ? { ...e, pdf: { ...e.pdf, opPapier: false } } : e)) };
  gelijk("alleen een andere stand op dezelfde PDF: nog steeds één keer", aantalKeer(schrijf(n), pdf), 1);

  // Een verwijderde versie laat geen bijlage achter.
  let d = beginStand(bladen());
  d = maak(d, "v-b");
  d = { ...d, exemplaren: d.exemplaren.map((e) => (e.id === "ex-pdf" ? { ...e, pdf: { ...e.pdf, data: anderePdf } } : e)) };
  d = maak(d, "v-c");
  d = { ...d, exemplaren: d.exemplaren.map((e) => (e.id === "ex-pdf" ? { ...e, pdf: { ...e.pdf, data: pdf } } : e)) };
  d = { ...d, ...verwijderVersie(d, "v-b") };
  gelijk("na verwijderen is de bijlage ook weg uit het bestand", aantalKeer(schrijf(d), anderePdf), 0);
}

// ── 6. Kapotte versies ──────────────────────────────────────────────────────
kop("6. Een bestand met kapotte versies");
{
  let s = beginStand();
  const eerste = s.versies.actief;
  s = maak(s, "v-b", "Tweede");
  s = zetWaarde(s, "ex-a", "L", "5,0");
  s = maak(s, "v-c", "Derde");
  const heel = JSON.parse(schrijf(s));
  /** Hetzelfde bestand met een bewerking op de versies. */
  const met = (fn) => {
    const d = structuredClone(heel);
    const k = d.data.find((x) => x.attributes?.["ocss::versies"]);
    const uit = fn(k.attributes["ocss::versies"], k);
    if (uit !== undefined) k.attributes["ocss::versies"] = uit;
    return heropen(JSON.stringify(d));
  };
  const bruikbaar = (g, wat) => {
    gelijk(`${wat}: de laatste bruikbare stand staat open`, [waarde(g, "ex-a", "L"), codes(g.rapport)], ["5,0", ["A", "B", "C"]]);
    toets(`${wat}: de melding zegt het`, (g.versieMeldingen?.length ?? 0) > 0, g.versieMeldingen);
  };
  for (const [wat, waardeNu] of [["geen object", "kapot"], ["een getal", 12], ["null", null], ["een lege lijst", { lijst: [] }], ["geen lijst", { lijst: "x" }]]) {
    const g = met(() => waardeNu);
    if (waardeNu === null) {
      gelijk(`${wat}: de stand staat open`, waarde(g, "ex-a", "L"), "5,0");
    } else {
      bruikbaar(g, wat);
      gelijk(`${wat}: één versie`, g.versies.lijst.length, 1);
    }
  }
  const zonderInhoud = met((a) => { delete a.lijst[0].inhoud; });
  bruikbaar(zonderInhoud, "een versie zonder inhoud");
  gelijk("de andere blijven", zonderInhoud.versies.lijst.map((v) => v.id), ["v-b", "v-c"]);
  gelijk("en de melding noemt de code", zonderInhoud.versieMeldingen, [{ soort: "versieWeg", code: "A" }]);
  toets("zijn kind heeft geen ouder meer", zonderInhoud.versies.lijst[0].ouder === undefined);

  const kapotRapport = met((a) => { a.lijst[1].inhoud.rapport = "weg"; });
  bruikbaar(kapotRapport, "een versie zonder rapport");
  gelijk("die valt weg", kapotRapport.versies.lijst.map((v) => v.id), [eerste, "v-c"]);

  bruikbaar(met((a) => { a.lijst[1] = "onzin"; }), "een regel die geen versie is");
  bruikbaar(met((a) => { a.lijst[1].id = "constructor"; }), "een onmogelijk id");
  bruikbaar(met((a) => { a.lijst[1].id = eerste; }), "een dubbel id");
  const geenActief = met((a) => { a.actief = "v-weg"; });
  bruikbaar(geenActief, "een actieve versie die niet in de lijst staat");
  toets("de knopen worden een eigen versie", geenActief.versies.lijst.some((v) => v.id === geenActief.versies.actief) && actieveVersie(geenActief.versies).inhoud === undefined);
  gelijk("de versies met een inhoud blijven erbij", geenActief.versies.lijst.filter((v) => v.inhoud).map((v) => v.id), [eerste, "v-b"]);
  const kring = met((a) => { a.lijst[0].ouder = "v-c"; });
  toets("een kring in de ouders loopt niet vast", lijnVan(kring.versies, "v-c").length <= 3 && lijnVan(kring.versies, "v-c")[0].ouder === undefined, lijnVan(kring.versies, "v-c"));
  const andereOuder = met((a) => { a.lijst[1].ouder = "v-niet"; });
  gelijk("een ouder die er niet is, vervalt", ouderVan(andereOuder.versies, "v-b"), undefined);

  // Een bijlage die ontbreekt of niet bij zijn hash past: de versie blijft, de bijlage niet.
  const pdfData = Buffer.from("%PDF-1.4\n".repeat(400)).toString("base64");
  let p = beginStand([{ id: "ex-pdf", naam: "PDF", templateId: PDF_BLAD, source: "", waarden: {}, elementen: [], pdf: { bestandsnaam: "a.pdf", data: pdfData } }, blad("ex-a", "A", { L: "1" })]);
  const pEerste = p.versies.actief;
  p = maak(p, "v-b");
  p = { ...p, exemplaren: p.exemplaren.filter((e) => e.id !== "ex-pdf") };
  const heelP = JSON.parse(schrijf(p));
  const hash = sha256(pdfData);
  const metP = (fn) => {
    const d = structuredClone(heelP);
    fn(d.data.find((x) => x.attributes?.["ocss::versies"]).attributes["ocss::versies"]);
    return heropen(JSON.stringify(d));
  };
  gelijk("de bijlage staat onder zijn hash", Object.keys(heelP.data.find((x) => x.attributes?.["ocss::versies"]).attributes["ocss::versies"].bijlagen), [hash]);
  for (const [wat, fn] of [
    ["een bijlage die ontbreekt", (a) => { delete a.bijlagen[hash]; }],
    ["een bijlage die niet bij zijn hash past", (a) => { a.bijlagen[hash] = pdfData.slice(4); }],
    ["een bijlage die geen tekst is", (a) => { a.bijlagen[hash] = 3; }],
    ["geen bijlagen", (a) => { delete a.bijlagen; }],
  ]) {
    const g = metP(fn);
    gelijk(`${wat}: de versie blijft, met een melding`, g.versieMeldingen, [{ soort: "bijlageWeg", aantal: 1, code: "A" }]);
    const b = inhoudVan(g, pEerste).exemplaren;
    toets(`${wat}: het blad is er nog, zonder bestand`, b.some((e) => e.id === "ex-pdf" && !e.pdf) && b.find((e) => e.id === "ex-a").waarden.L === "1");
  }
  gelijk("een onmogelijke aanwijzing", metP((a) => { a.lijst[0].inhoud.exemplaren[0].pdf.data = { $bijlage: "../geheim" }; }).versieMeldingen, [{ soort: "bijlageWeg", aantal: 1, code: "A" }]);

  // Een bestand van iemand anders mag niets aan Object.prototype veranderen.
  const vals = JSON.parse(schrijf(s));
  const a = vals.data.find((x) => x.attributes?.["ocss::versies"]).attributes["ocss::versies"];
  const valsTekst = JSON.stringify(vals).replace('"exemplaren":', '"__proto__":{"gehackt":true},"exemplaren":');
  const gelezen = leesProjectBestand(valsTekst, "proef");
  toets("__proto__ in een versie raakt niets", ({}).gehackt === undefined && gelezen.versies.lijst.length === a.lijst.length);
}

// ── 7. Vergelijken ──────────────────────────────────────────────────────────
kop("7. Vergelijken met de oudertak");
const BLAD_BALK = "# Balk van hout — EN 1995\nb = ?{100}mm\nh = ?{300}mm\nM_Ed = 12.5*kN*m\nf_m_d = 13.6*N/mm^2\nW_y = b*h^2/6\nUC_buiging = M_Ed/(W_y*f_m_d)\nUC_max = UC_buiging\n";
const BLAD_CC = "# Factor\nf = CC*2\n";
const balk = (id = "ex-balk", naam = "Balk 1", waarden = {}) => blad(id, naam, waarden, BLAD_BALK);
const inhoud = (s) => ({ exemplaren: s.exemplaren, gegevens: s.gegevens, rapport: s.rapport });
const metBlad = (s, id, fn) => ({ ...s, exemplaren: s.exemplaren.map((e) => (e.id === id ? fn(e) : e)) });
{
  const begin = () => ({ ...beginStand([balk(), blad("ex-weg", "Vervalt"), blad("ex-cc", "Factor", {}, BLAD_CC)]), gegevens: { ...legeGegevens(), CC: "2" } });
  const a = begin();
  gelijk("gelijke stand: geen verschil", vergelijkBladen(inhoud(a), inhoud(a)), []);

  // Toegevoegd, verwijderd, hernoemd: op id, niet op naam.
  const b = {
    ...a,
    exemplaren: [
      { ...a.exemplaren[0], naam: "Balk 1 begane grond" },
      a.exemplaren[2],
      blad("ex-nieuw", "Nieuw blad"),
      blad("ex-naam", "Vervalt"),
    ],
  };
  const v = vergelijkBladen(inhoud(a), inhoud(b));
  gelijk("de soorten", v.map((x) => [x.id, x.soort]), [["ex-balk", "gewijzigd"], ["ex-nieuw", "erbij"], ["ex-naam", "erbij"], ["ex-weg", "weg"]]);
  gelijk("hernoemd: het is hetzelfde blad", [v[0].oudeNaam, v[0].naam, v[0].invoer, v[0].uitkomsten, v[0].rekentekst], ["Balk 1", "Balk 1 begane grond", [], [], null]);
  gelijk("een blad met de naam van een vervallen blad is een ander blad", v.filter((x) => x.naam === "Vervalt").map((x) => [x.id, x.soort]), [["ex-naam", "erbij"], ["ex-weg", "weg"]]);

  // Invoer en uitkomsten, uit de bestaande doorrekening.
  const c = metBlad(a, "ex-balk", (e) => ({ ...e, waarden: { h: "200" } }));
  const [balkVerschil] = vergelijkBladen(inhoud(a), inhoud(c));
  gelijk("de invoer die anders is, zoals hij meetelt", balkVerschil.invoer, [{ naam: "h", van: "300", naar: "200" }]);
  const uit = (i) => {
    const b0 = bladenVoorIfc(i).find((x) => x.id === "ex-balk");
    return leesUitkomst(b0.nodes, b0.naam, b0.resultaat, b0.fout);
  };
  const tekst = (u, naam) => u.variabelen.find((x) => x.naam === naam).tekst;
  gelijk("de uitkomsten komen uit de bestaande doorrekening", balkVerschil.uitkomsten.find((x) => x.naam === "UC_max"), { naam: "UC_max", van: tekst(uit(inhoud(a)), "UC_max"), naar: tekst(uit(inhoud(c)), "UC_max") });
  // Handberekening: W = 100·300²/6 = 1,5·10⁶ mm³, σ = 12,5·10⁶/1,5·10⁶ = 8,33 N/mm², UC = 8,33/13,6 = 0,613.
  // Met h = 200: W = 666 667 mm³, σ = 18,75 N/mm², UC = 18,75/13,6 = 1,379.
  toets("en kloppen met de hand: 0,613 en 1,379", Math.abs(uit(inhoud(a)).uc - 0.6127) < 0.001 && Math.abs(uit(inhoud(c)).uc - 1.3787) < 0.001, [uit(inhoud(a)).uc, uit(inhoud(c)).uc]);
  gelijk("de unity checks staan voorop", balkVerschil.uitkomsten.slice(0, 2).map((x) => x.naam), ["UC_buiging", "UC_max"]);
  gelijk("het oordeel is anders", balkVerschil.oordeel, { van: "voldoet", naar: "voldoet_niet" });

  // Geen schijnverschillen.
  const seed = metBlad(a, "ex-balk", (e) => ({ ...e, waarden: { b: "100", h: "300" } }));
  gelijk("een aangevulde standaardwaarde is geen wijziging", vergelijkBladen(inhoud(a), inhoud(seed)), []);
  const notatie = (x) => metBlad(a, "ex-balk", (e) => ({ ...e, waarden: { h: x } }));
  gelijk("4,20 en 4.2 zijn dezelfde invoer", vergelijkBladen(inhoud(notatie("300,0")), inhoud(notatie("300"))), []);
  const crlf = metBlad(a, "ex-balk", (e) => ({ ...e, source: BLAD_BALK.replace(/\n/g, "\r\n") }));
  gelijk("regeleinden tellen niet", vergelijkBladen(inhoud(a), inhoud(crlf)), []);

  // Rekentekst.
  const d = metBlad(a, "ex-cc", (e) => ({ ...e, source: `${BLAD_CC}g = f + 1\n` }));
  gelijk("een regel erbij in de rekentekst", vergelijkBladen(inhoud(a), inhoud(d))[0].rekentekst, { eraf: [], erbij: ["g = f + 1"] });
  gelijk("een gewijzigde regel", regelVerschil("a\nb\nc", "a\nx\nc"), { eraf: ["b"], erbij: ["x"] });
  gelijk("gelijke tekst", regelVerschil("a", "a"), null);

  // Projectgegevens werken door in de uitkomst, ook bij een blad zonder eigen wijziging.
  const e = { ...a, gegevens: { ...a.gegevens, CC: "3" } };
  const cc = vergelijkBladen(inhoud(a), inhoud(e)).find((x) => x.id === "ex-cc");
  gelijk("een andere gevolgklasse: de uitkomst volgt", cc?.uitkomsten.find((x) => x.naam === "f"), { naam: "f", van: "4", naar: "6" });

  // Een blad dat omvalt, zonder stil oordeel.
  const kapot = metBlad(a, "ex-balk", (x) => ({ ...x, source: "# Kapot\nx = 1/onbekend_ding(\n" }));
  const fout = console.error;
  console.error = () => {};
  const kv = vergelijkBladen(inhoud(a), inhoud(kapot))[0];
  console.error = fout;
  gelijk("een blad dat omvalt: niet doorgerekend", kv.oordeel, { van: "voldoet", naar: "niet_doorgerekend" });

  // Andere soorten bladen.
  const pdfBlad = (data, extra = {}) => ({ id: "ex-pdf", naam: "PDF", templateId: PDF_BLAD, source: "", waarden: {}, elementen: [], pdf: { bestandsnaam: "a.pdf", data, ...extra } });
  const bestand = (x, y) => vergelijkBladen(inhoud(beginStand([x])), inhoud(beginStand([y])))[0]?.bestand;
  gelijk("een vervangen PDF", bestand(pdfBlad("QUJD"), pdfBlad("REVG")), ["pdf"]);
  gelijk("aantekeningen op dezelfde PDF", bestand(pdfBlad("QUJD"), pdfBlad("QUJD", { opPapier: false })), ["aantekeningen"]);
  const mdBlad = (tekst2) => ({ id: "ex-md", naam: "T", templateId: MARKDOWN_BLAD, source: "", waarden: {}, elementen: [], md: { bestandsnaam: "a.md", tekst: tekst2 } });
  gelijk("een andere Markdown-tekst", bestand(mdBlad("a"), mdBlad("b")), ["tekst"]);
  const xl = (data) => ({ id: "ex-x", naam: "X", templateId: SPREADSHEET_BLAD, source: "", waarden: {}, elementen: [], xlsx: { bestandsnaam: "a.xlsx", data } });
  gelijk("een andere werkmap", bestand(xl("QUJD"), xl("REVG")), ["werkmap"]);

  // Wisselen verandert geen enkel getal.
  let s = { ...beginStand([balk("ex-balk", "Balk 1", { h: "280" }), blad("ex-cc", "Factor", {}, BLAD_CC)]), gegevens: { ...legeGegevens(), CC: "2" } };
  const eerste = s.versies.actief;
  const getallen = (x) => JSON.stringify(bladenVoorIfc(x).map((b0) => ({ id: b0.id, u: leesUitkomst(b0.nodes, b0.naam, b0.resultaat, b0.fout) })));
  const voor = getallen(s);
  s = maak(s, "v-b");
  gelijk("een nieuwe versie: dezelfde getallen", getallen(s), voor);
  s = metBlad(s, "ex-balk", (x) => ({ ...x, waarden: { h: "200" } }));
  const inB = getallen(s);
  toets("de wijziging telt in de nieuwe versie", inB !== voor);
  for (let i = 0; i < 3; i++) {
    s = naar(s, eerste);
    gelijk(`wissel ${i + 1}: het origineel rekent hetzelfde`, getallen(s), voor);
    s = naar(s, "v-b");
    gelijk(`wissel ${i + 1}: de tak rekent hetzelfde`, getallen(s), inB);
  }
  const terug = heropen(schrijf(s));
  gelijk("na opslaan en heropenen: de tak", getallen(terug), inB);
  gelijk("en het origineel", getallen(naar(terug, eerste)), voor);
}

// ── 8. De lijst per pagina ──────────────────────────────────────────────────
kop("8. De lijst per pagina");
{
  const r0 = nieuwRapport("en");
  const begin = () => {
    const s = { ...beginStand([balk(), blad("ex-weg", "Vervalt"), blad("ex-cc", "Factor", {}, BLAD_CC)]), rapport: r0, gegevens: { ...legeGegevens(), CC: "2" } };
    return maak(s, "v-b");
  };
  const ouderVanStand = (s) => inhoudVan(s, s.versies.lijst[0].id);
  const regels = (s) => maakWijzigingen(ouderVanStand(s), inhoud(s));

  let s = begin();
  gelijk("een verse tak: geen regels, ook niet door zijn regel in de revisietabel", regels(s), []);
  toets("zonder verschil blijft het hetzelfde rapport", metVerseLijst(s) === s.rapport);
  gelijk("het origineel heeft geen lijst", metVerseLijst(naar(s, s.versies.lijst[0].id)).wijzigingsLijst, undefined);

  s = metBlad(s, "ex-balk", (e) => ({ ...e, waarden: { h: "200" } }));
  s = { ...s, exemplaren: [...s.exemplaren.filter((e) => e.id !== "ex-weg"), blad("ex-nieuw", "Nieuw blad")] };
  s = { ...s, gegevens: { ...s.gegevens, CC: "3", project_naam: "Andere naam", locatie: "Elders" } };
  s = { ...s, rapport: { ...s.rapport, kenmerk: "2026-001", teksten: { ...s.rapport.teksten, inleiding: "Andere inleiding", belendingen: "Nieuwe tekst" }, uitgangspunten: { ...s.rapport.uitgangspunten, soortBouwwerk: "Office" }, toelichting: { "ex-cc": "Toelichting op factor" } } };
  const lijst = regels(s);
  gelijk("de regels, in de volgorde van het rapport", lijst.map((r) => r.sleutel), ["voorblad", "knoop:inleiding", "knoop:belendingen", "knoop:bouwwerk", "gegevens", "blad:ex-balk", "blad:ex-cc", "blad:ex-nieuw", "blad:ex-weg"]);
  const van = (sleutel) => lijst.find((r) => r.sleutel === sleutel);
  gelijk("het voorblad: de gegevens en wat in het rapport staat", van("voorblad").delen, [{ soort: "gegevens", lijst: [{ naam: "project_naam", van: "", naar: "Andere naam" }], meer: 0 }, { soort: "inhoud" }]);
  gelijk("een tekst", van("knoop:inleiding").delen, [{ soort: "tekst" }]);
  gelijk("een tekst die er nieuw is", van("knoop:belendingen").delen, [{ soort: "erbij" }]);
  gelijk("de kop in de taal van het rapport", van("knoop:inleiding").titel, "Introduction");
  gelijk("een rekenblok met zijn gegevens", van("knoop:bouwwerk").delen, [{ soort: "inhoud" }, { soort: "gegevens", lijst: [{ naam: "CC", van: "2", naar: "3" }], meer: 0 }]);
  gelijk("gegevens zonder eigen plek op papier", van("gegevens").delen, [{ soort: "gegevens", lijst: [{ naam: "locatie", van: "", naar: "Elders" }], meer: 0 }]);
  gelijk("een blad: de invoer, het oordeel en de uitkomst", van("blad:ex-balk").delen.map((d) => d.soort), ["invoer", "oordeel", "uitkomst"]);
  gelijk("een blad met alleen een andere uitkomst, en een andere toelichting", van("blad:ex-cc").delen.map((d) => d.soort), ["uitkomst", "tekst"]);
  gelijk("een blad erbij", van("blad:ex-nieuw").delen, [{ soort: "erbij" }]);
  gelijk("een blad weg, met zijn oude naam", [van("blad:ex-weg").delen, van("blad:ex-weg").titel], [[{ soort: "weg" }], "Vervalt"]);

  // Op papier beknopt.
  const veel = metBlad(s, "ex-balk", (e) => ({ ...e, source: Array.from({ length: 12 }, (_, i) => `x${i} = ?{${i}}`).join("\n") }));
  const veelOuder = { ...ouderVanStand(s), exemplaren: [blad("ex-balk", "Balk 1", {}, Array.from({ length: 12 }, (_, i) => `x${i} = ?{${i + 1}}`).join("\n"))] };
  const delen = maakWijzigingen(veelOuder, inhoud(veel)).find((r) => r.sleutel === "blad:ex-balk").delen;
  const inv = delen.find((d) => d.soort === "invoer");
  gelijk("op papier hoogstens een paar waarden, de rest telt", [inv.lijst.length, inv.meer], [MAX_VERANDERINGEN, 12 - MAX_VERANDERINGEN]);

  // Bijwerken: hetzelfde object als er niets is veranderd, en de keuzes blijven.
  const r1 = metVerseLijst(s);
  gelijk("de lijst staat in het rapport", r1.wijzigingsLijst.length, lijst.length);
  s = { ...s, rapport: r1 };
  toets("opnieuw maken zonder verschil: hetzelfde rapport", metVerseLijst(s) === s.rapport);

  // De keuzes van de gebruiker.
  s = { ...s, rapport: metKeuze(s.rapport, "blad:ex-balk", { toelichting: "Balk is hoger gemaakt" }) };
  s = { ...s, rapport: metKeuze(s.rapport, "knoop:inleiding", { tekst: "Inleiding herschreven" }) };
  s = { ...s, rapport: metKeuze(s.rapport, "blad:ex-nieuw", { weg: true }) };
  toets("hetzelfde nog eens: hetzelfde rapport", metKeuze(s.rapport, "blad:ex-nieuw", { weg: true }) === s.rapport);
  gelijk("een regel weghalen", [zichtbareRegels(s.rapport).some((r) => r.sleutel === "blad:ex-nieuw"), weggehaaldeRegels(s.rapport).map((r) => r.sleutel)], [false, ["blad:ex-nieuw"]]);

  // Opnieuw maken na een wijziging.
  s = metBlad(s, "ex-balk", (e) => ({ ...e, waarden: { h: "250" } }));
  s = { ...s, rapport: metVerseLijst(s) };
  gelijk("de lijst is bijgewerkt", s.rapport.wijzigingsLijst.find((r) => r.sleutel === "blad:ex-balk").delen.find((d) => d.soort === "invoer").lijst[0].naar, "250");
  gelijk("de toelichting blijft behouden", keuzeVan(s.rapport, "blad:ex-balk").toelichting, "Balk is hoger gemaakt");
  gelijk("de eigen tekst ook", keuzeVan(s.rapport, "knoop:inleiding").tekst, "Inleiding herschreven");
  gelijk("en wat weg is, blijft weg", weggehaaldeRegels(s.rapport).map((r) => r.sleutel), ["blad:ex-nieuw"]);

  // Het verschil verdwijnt: de tekst komt niet op papier, en is niet weg.
  const oudeInleiding = ouderVanStand(s).rapport.teksten.inleiding;
  s = { ...s, rapport: { ...s.rapport, teksten: { ...s.rapport.teksten, inleiding: oudeInleiding } } };
  s = { ...s, rapport: metVerseLijst(s) };
  toets("geen verschil meer: de regel is weg uit de lijst", !s.rapport.wijzigingsLijst.some((r) => r.sleutel === "knoop:inleiding"));
  gelijk("de tekst blijft bewaard", keuzesZonderVerschil(s.rapport), [{ sleutel: "knoop:inleiding", keuze: { tekst: "Inleiding herschreven" } }]);
  s = { ...s, rapport: { ...s.rapport, teksten: { ...s.rapport.teksten, inleiding: "Weer anders" } } };
  s = { ...s, rapport: metVerseLijst(s) };
  gelijk("het verschil komt terug, en de tekst ook", [s.rapport.wijzigingsLijst.some((r) => r.sleutel === "knoop:inleiding"), keuzeVan(s.rapport, "knoop:inleiding").tekst], [true, "Inleiding herschreven"]);

  // Alleen een blad dat alles terugzet.
  const terugGezet = metKeuze(metKeuze(s.rapport, "blad:ex-balk", { toelichting: "" }), "knoop:inleiding", { tekst: undefined });
  gelijk("een lege eigen tekst mag even bestaan, terwijl iemand typt", keuzeVan(metKeuze(s.rapport, "knoop:inleiding", { tekst: "" }), "knoop:inleiding").tekst, "");
  gelijk("leeg is geen keuze", [keuzeVan(terugGezet, "blad:ex-balk"), keuzeVan(terugGezet, "knoop:inleiding")], [{}, {}]);

  // Opslaan en heropenen.
  const gelezen = heropen(schrijf(s));
  gelijk("de keuzes gaan mee in het bestand", gelezen.rapport.wijzigingen, s.rapport.wijzigingen);
  toets("de lijst is afgeleid: die maakt de app opnieuw", gelezen.rapport.wijzigingsLijst === undefined);
  gelijk("en is dan dezelfde", metVerseLijst(gelezen).wijzigingsLijst, s.rapport.wijzigingsLijst);
  gelijk("onzin in een bestand valt weg", normaliseerRapport({ wijzigingen: { a: { toelichting: 3, tekst: "" }, b: "x", c: { weg: true, tekst: "t", bla: 1 } }, wijzigingsLijst: [1] }, VANDAAG, standaardTeksten).wijzigingen, { c: { tekst: "t", weg: true } });
  toets("en een lijst uit een bestand wordt niet gelezen", !("wijzigingsLijst" in normaliseerRapport({ wijzigingsLijst: [1] }, VANDAAG, standaardTeksten)));

  // De opzet: het blok staat erin, en een rapport zonder lijst blijft precies wat het was.
  toets("het blok staat in de lijst met rekenblokken", REKENBLOKKEN.some((k) => k.inhoud === "wijzigingen"));
  toets("en in het ingebouwde template, zodat een nieuwe versie hem meteen toont", knopenVan(OPZET).some((k) => k.inhoud === "wijzigingen"));
  toets("met een vast id, zonder tekst", !heeftTekst(knopenVan(OPZET).find((k) => k.inhoud === "wijzigingen")));
  const kaal = nieuwRapport("en");
  const nummers = (r, bladen = []) => inhoudsopgave(bouwOpzet(r, bladen), true).map((i) => `${i.nummer} ${i.titel}`);
  toets("zonder lijst valt het blok weg", !bouwOpzet(kaal, []).some((k) => k.inhoud === "wijzigingen"));
  const metLijstR = { ...kaal, wijzigingsLijst: [{ sleutel: "voorblad", doel: "voorblad", titel: "", delen: [{ soort: "inhoud" }] }] };
  const blok = bouwOpzet(metLijstR, []).find((k) => k.inhoud === "wijzigingen");
  toets("met een lijst staat het erin, zonder nummer", blok && blok.nummer === "");
  gelijk("de nummers van de hoofdstukken veranderen niet", nummers(metLijstR), nummers(kaal));
  gelijk("en het zijpaneel ook niet", inhoudVoorPaneel(metLijstR, []).map((r) => r.nummer), inhoudVoorPaneel(kaal, []).map((r) => r.nummer));
  const alleenWeg = { ...metLijstR, wijzigingen: { voorblad: { weg: true } } };
  toets("alle regels weggehaald: het blok valt weg", !bouwOpzet(alleenWeg, []).some((k) => k.inhoud === "wijzigingen"));
  gelijk("het paneel: geen teksthoofdstuk, het blok heeft een eigen sectie", paneelGroepen(OPZET).flatMap((g) => (g.soort === "teksten" ? g.knopen.map((k) => k.id) : [g.soort])).includes("wijzigingen"), false);

  // Verplaatsen in de opzet.
  const zonder = verwijderKnoop(metLijstR, "wijzigingen");
  toets("weghalen kan, en dan valt de lijst weg", !bouwOpzet(zonder, []).some((k) => k.inhoud === "wijzigingen"));
  toets("en het blok staat weer in de lijst om te plaatsen", ongeplaatsteBlokken(zonder).some((k) => k.inhoud === "wijzigingen"));
  const onder = plaatsBlok(zonder, "wijzigingen", "projectgegevens");
  const genest = bouwOpzet(onder, []).find((k) => k.id === "projectgegevens").kinderen.at(-1);
  gelijk("onder een hoofdstuk is het een gewone paragraaf met een nummer", [genest.inhoud, genest.nummer], ["wijzigingen", "2.3"]);
  const terugBoven = plaatsBlok(zonder, "wijzigingen", null);
  gelijk("op het hoogste niveau weer bij de inhoudsopgave", bouwOpzet(terugBoven, []).find((k) => k.inhoud === "wijzigingen").nummer, "");
  gelijk("een oud template zonder het blok: geen lijst, en verder niets", opzetVan(zonder).some((k) => k.inhoud === "wijzigingen"), false);

  // Waar een regel op papier staat.
  const k = bouwOpzet({ ...metLijstR, inHoofdstuk: { "ex-b": true } }, [{ id: "ex-a", naam: "A" }, { id: "ex-b", naam: "B" }]);
  const bijlage = [{ blad: { id: "ex-a", naam: "A" }, nummer: "A.1" }];
  const plek = (doel, id) => plekVanRegel({ sleutel: "x", doel, id, titel: "", delen: [] }, k, bijlage);
  gelijk("een blad in bijlage A: het anker daar", plek("blad", "ex-a"), { nummer: "A.1", anker: "bijlage-blad-ex-a" });
  gelijk("een blad in het hoofdstuk: zijn paragraaf", plek("blad", "ex-b"), { nummer: "6.2", anker: "ex-b" });
  gelijk("een onderdeel van het rapport", plek("knoop", "brand"), { nummer: "4.2", anker: "brand" });
  gelijk("het voorblad is pagina 1", plek("voorblad"), { nummer: "", pagina: 1 });
  gelijk("wat vervallen is, heeft geen pagina", [plek("blad", "ex-weg"), plek("knoop", "bestaat-niet"), plek("gegevens")], [{ nummer: "" }, { nummer: "" }, { nummer: "" }]);
}

console.log(fouten === 0 ? "\nVersies: alles klopt." : `\n${fouten} controle(s) gezakt.`);
process.exit(fouten === 0 ? 0 : 1);
