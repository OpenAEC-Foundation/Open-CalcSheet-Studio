/**
 * Controle van de versies in het projectbestand (store/versies.ts).
 *
 *   1  de inhoudshash: gelijk aan SHA-256 van node:crypto;
 *   2  het model: maken, wisselen, terug naar het origineel, een oude versie bewerken, en de
 *      revisietabel die de lijn van de versie volgt;
 *   3  ongedaan maken loopt per versie en nooit door een wissel heen;
 *   4  het projectbestand: opslaan en heropenen, een oud bestand, een bestand in een oudere app;
 *   5  grote bijlagen staan één keer in het bestand, op hun inhoudshash;
 *   6  een bestand met kapotte versies opent de laatste bruikbare stand.
 *
 * Draaien:  node scripts/check-versies.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { createHash } from "node:crypto";
import { sha256 } from "../packages/desktop/src/store/inhoudshash.ts";
import {
  actieveVersie, beginVersies, hernoemVersie, inhoudVan, lijnVan, magVerwijderen, nieuweVersie, ouderVan, revisieVan, rijIsVast, verwijderVersie, versieGegevens, wissel,
} from "../packages/desktop/src/store/versies.ts";
import { standaardRapport } from "../packages/desktop/src/rapport/model.ts";
import { standaardTeksten } from "../packages/desktop/src/rapport/standaardteksten.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";
import { rapportStatus } from "../packages/desktop/src/rapport/revisies.ts";
import { bouwProjectBestand, leesProjectBestand, PROJECT_FORMAAT_VERSIE } from "../packages/desktop/src/store/projectBestand.ts";
import { PDF_BLAD } from "../packages/desktop/src/store/pdfBijlage.ts";
import { SPREADSHEET_BLAD } from "../packages/desktop/src/store/spreadsheetBlad.ts";
import { MARKDOWN_BLAD } from "../packages/desktop/src/store/markdownBlad.ts";
import { GRAAF_BLAD } from "../packages/desktop/src/store/graafBlad.ts";
import { TEKEN_BLAD } from "../packages/desktop/src/store/tekenBlad.ts";
import { JUPYTER_BLAD } from "../packages/desktop/src/store/jupyterBlad.ts";
import { MARIMO_BLAD } from "../packages/desktop/src/store/marimoBlad.ts";
import { legeGraaf } from "../packages/desktop/src/graaf/model.ts";
import { isProjectIfcx, leesProjectIfcx, OCSS_SCHEMAS } from "../packages/core/dist/index.js";
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

console.log(fouten === 0 ? "\nVersies: alles klopt." : `\n${fouten} controle(s) gezakt.`);
process.exit(fouten === 0 ? 0 : 1);
