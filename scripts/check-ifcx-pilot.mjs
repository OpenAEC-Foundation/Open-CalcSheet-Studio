/**
 * Controlescript voor de proef met een gekoppelde toetsing (issue #66): een
 * buigtoets van een funderingsbalk, met `elementen` op het IFCX-pad van die balk
 * in het referentiemodel, in een projectbestand waarin ook een andere Studio
 * gegevens heeft gezet.
 *
 *   fixture        scripts/fixtures/ifcx-pilot/funderingsbalk.ifccalculation:
 *                  één blad (funderingsbalk-buiging.cpd) aan de balk
 *                  /elements/0900886be4fa5a0fab2c5a3b2c6282be, plus een vreemde
 *                  knoop (het materiaal van de balk) en vreemde attributen op de
 *                  balk, met hun schema's en hun import
 *   openen         het bestand opent als project; de vreemde gegevens gaan apart
 *                  mee (`vreemd`), en opslaan zonder wijziging geeft hetzelfde
 *                  bestand, afgezien van het tijdstempel
 *   wijzigen       M_Ed van 180 naar 240 kNm en opslaan: de vreemde knoop, de
 *                  vreemde attributen, hun waarden, paden, verwijzingen, schema's
 *                  en imports blijven gelijk; dezelfde balk en hetzelfde blad
 *                  (zelfde pad) tonen de nieuwe uitkomst in `ocss::blad::uitkomst`
 *                  en `ocss::element`; het resultaat is
 *                  funderingsbalk-gewijzigd.ifccalculation, dat de IFCX Explorer
 *                  in zijn eigen test leest
 *   niet getoetst  een invoer waarbij het blad geen oordeel geeft, staat er als
 *                  `geen_oordeel`, nooit als `voldoet`
 *   blad weg       zonder het blad vervallen de eigen knopen; de vreemde blijven
 *   hernoemen      een andere projectnaam en een ander nummer: dezelfde paden, en
 *                  de vreemde gegevens blijven aan hetzelfde blad en dezelfde balk
 *
 * Opnieuw maken van de twee fixtures (alleen na een bewuste wijziging):
 *   node scripts/check-ifcx-pilot.mjs --schrijf
 *
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 * Draaien:  node scripts/check-ifcx-pilot.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { padVanElement, platteKnopen } from "../packages/core/dist/index.js";
import { bouwProjectBestand, leesProjectBestand, PROJECT_FORMAAT_VERSIE } from "../packages/desktop/src/store/projectBestand.ts";
import { bladenVoorIfc } from "../packages/desktop/src/store/projectIfcx.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";

let fouten = 0;
let aantal = 0;
const meld = (ok, wat, detail = "") => {
  aantal++;
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};

const MAP = new URL("./fixtures/ifcx-pilot/", import.meta.url);
const BESTAND = new URL("funderingsbalk.ifccalculation", MAP);
const GEWIJZIGD = new URL("funderingsbalk-gewijzigd.ifccalculation", MAP);
/** Met LF, ook in een werkkopie met CRLF (de Windows-job in ci.yml). */
const lees = (url) => readFileSync(url, "utf8").replace(/\r\n/g, "\n");
const BRON = lees(new URL("funderingsbalk-buiging.cpd", MAP));
const TIJD = "2026-11-25T00:00:00.000Z";

/** De balk uit het referentiemodel van de IFCX Explorer: zijn pad is zijn identiteit. */
const BALK = "/elements/0900886be4fa5a0fab2c5a3b2c6282be";
/** Het materiaal van die balk in hetzelfde model; een knoop die deze app niet kent. */
const MATERIAAL = "/materials/57414cd8d24659a5bd49ebb498949707";
const VREEMDE_IMPORT = { uri: "urn:openaec:school:schema" };
/** Zoals de andere Studio ze beschrijft. */
const VREEMDE_SCHEMAS = {
  "openaec::assignedMaterials": { value: { dataType: "Array", arrayRestrictions: { value: { dataType: "Reference" } } } },
  "openaec::material": { value: { dataType: "Object", objectRestrictions: { values: { name: { dataType: "String" } } } } },
  "openaec::reference::category": { value: { dataType: "String" } },
};
const VREEMD_OP_BALK = {
  "openaec::reference::category": "Fundering",
  "openaec::assignedMaterials": [MATERIAAL],
};
const VREEMDE_KNOOP = { path: MATERIAAL, attributes: { "openaec::material": { name: "Beton C30/37" } } };

const INVOER = { b: "400", h: "500", a_s: "60", A_s: "1257", M_Ed: "180", betonklasse: "30" };

const zonderTijd = (doc) => ({ ...doc, header: { ...doc.header, timestamp: "" } });
const metTijd = (tekst) => JSON.stringify({ ...JSON.parse(tekst), header: { ...JSON.parse(tekst).header, timestamp: TIJD } }, null, 2) + "\n";

/** Opslaan zoals de app het doet (hooks/useBestandActies.ts `projectInhoud`). */
function opslaan(p) {
  const payload = {
    versie: PROJECT_FORMAAT_VERSIE,
    id: p.projectId,
    naam: p.projectNaam,
    gegevens: p.gegevens,
    exemplaren: p.exemplaren,
    rapport: p.rapport,
    verborgen: p.verborgen,
    vreemd: p.vreemd,
  };
  return bouwProjectBestand(payload, bladenVoorIfc(payload));
}

/** Het bestand zoals een andere Studio het achterliet: het eigen document, met zijn gegevens erbij. */
function maakFixture() {
  const blad = { id: "ex-funderingsbalk", naam: "Funderingsbalk BB 400x500", templateId: "", source: BRON, waarden: INVOER, elementen: [{ id: BALK, naam: "Funderingsbalk BB 400x500" }] };
  const eigen = JSON.parse(opslaan({ projectNaam: "Proef funderingsbalk", gegevens: legeGegevens(), exemplaren: [blad] }));
  eigen.imports.push(VREEMDE_IMPORT);
  Object.assign(eigen.schemas, VREEMDE_SCHEMAS);
  const balk = eigen.data.find((k) => k.path === BALK);
  Object.assign(balk.attributes, VREEMD_OP_BALK);
  eigen.data.push(VREEMDE_KNOOP);
  return metTijd(JSON.stringify(eigen));
}

const knopenVan = (doc) => platteKnopen(doc.data);
const bladKnoop = (doc) => doc.data.find((k) => k.attributes?.["ocss::blad"]);

if (process.argv.includes("--schrijf")) {
  const tekst = maakFixture();
  writeFileSync(BESTAND, tekst);
  const p = leesProjectBestand(tekst, "funderingsbalk");
  p.exemplaren = p.exemplaren.map((ex) => ({ ...ex, waarden: { ...ex.waarden, M_Ed: "240" } }));
  writeFileSync(GEWIJZIGD, metTijd(opslaan(p)));
  console.log("Fixtures geschreven.");
}

// ── De fixture ───────────────────────────────────────────────────────────────
console.log("De fixture:");
const ruw = lees(BESTAND);
const bron = JSON.parse(ruw);
{
  const blad = bladKnoop(bron);
  const elementen = blad?.attributes["ocss::blad::elementen"];
  meld(Array.isArray(elementen) && elementen.length === 1 && elementen[0].id === BALK, "het blad wijst naar de balk uit het referentiemodel", JSON.stringify(elementen));
  meld(padVanElement(BALK) === BALK, "het pad van de balk blijft zijn eigen pad, met `/`", padVanElement(BALK));
  const balk = knopenVan(bron).get(BALK);
  meld(balk?.attributes["bsi::ifc::class"]?.code === "IfcBeam", "de balk is een IfcBeam", balk?.attributes["bsi::ifc::class"]?.code);
  const toets = balk?.attributes["ocss::element"]?.toetsingen?.[0];
  meld(toets?.ref === blad?.path, "de balk verwijst naar zijn toetsing", JSON.stringify(toets));
  const u = blad?.attributes["ocss::blad::uitkomst"];
  meld(u?.status === "voldoet" && u?.norm === "EN 1992-1-1" && Math.abs(u.uc - 0.8115) < 0.0005, "de uitkomst: voldoet, EN 1992-1-1, UC 0,81", JSON.stringify({ status: u?.status, norm: u?.norm, uc: u?.uc }));
  meld(isDeepStrictEqual(knopenVan(bron).get(MATERIAAL), { ...VREEMDE_KNOOP, children: {}, inherits: {} }), "de vreemde knoop staat erin");
  meld(Object.entries(VREEMD_OP_BALK).every(([a, w]) => isDeepStrictEqual(balk?.attributes[a], w)), "de vreemde attributen staan op de balk");
  meld(bron.imports.some((i) => i.uri === VREEMDE_IMPORT.uri) && Object.keys(VREEMDE_SCHEMAS).every((a) => bron.schemas[a]), "hun import en schema's staan erin");
  meld(ruw === maakFixture(), "de fixture is wat dit script ervan maakt (anders: --schrijf na een bewuste wijziging)");
}

// ── Openen en opslaan zonder wijziging ──────────────────────────────────────
console.log("Openen en opslaan zonder wijziging:");
const gelezen = leesProjectBestand(ruw, "funderingsbalk");
{
  const v = gelezen.vreemd;
  meld(!!v, "de vreemde gegevens gaan apart mee");
  meld(isDeepStrictEqual(v?.imports, [VREEMDE_IMPORT]), "precies de vreemde import", JSON.stringify(v?.imports));
  meld(isDeepStrictEqual(v?.schemas, VREEMDE_SCHEMAS), "precies de vreemde schema's", Object.keys(v?.schemas ?? {}).join(", "));
  meld(isDeepStrictEqual(v?.knopen, [{ path: BALK, attributes: VREEMD_OP_BALK }, VREEMDE_KNOOP]), "precies de vreemde knoop en de vreemde attributen", JSON.stringify(v?.knopen));
  meld(gelezen.exemplaren.length === 1 && gelezen.exemplaren[0].elementen[0]?.id === BALK, "het blad houdt zijn koppeling");
  meld(isDeepStrictEqual(zonderTijd(JSON.parse(opslaan(gelezen))), zonderTijd(bron)), "opslaan geeft hetzelfde bestand, afgezien van het tijdstempel");
}

// ── Invoer wijzigen en opslaan ──────────────────────────────────────────────
console.log("Invoer wijzigen en opslaan:");
const gewijzigd = { ...gelezen, exemplaren: gelezen.exemplaren.map((ex) => ({ ...ex, waarden: { ...ex.waarden, M_Ed: "240" } })) };
const nieuwTekst = opslaan(gewijzigd);
const nieuw = JSON.parse(nieuwTekst);
{
  const voor = knopenVan(bron);
  const na = knopenVan(nieuw);
  meld(isDeepStrictEqual(na.get(MATERIAAL), voor.get(MATERIAAL)), "de vreemde knoop is gelijk: pad en waarden");
  const balkVoor = voor.get(BALK);
  const balkNa = na.get(BALK);
  meld(!!balkNa, "de balk heeft hetzelfde pad");
  meld(Object.keys(VREEMD_OP_BALK).every((a) => isDeepStrictEqual(balkNa?.attributes[a], balkVoor.attributes[a])), "de vreemde attributen op de balk zijn gelijk");
  const doelen = balkNa?.attributes["openaec::assignedMaterials"] ?? [];
  meld(doelen.length === 1 && doelen.every((d) => na.has(d)), "de verwijzing van de balk naar het materiaal wijst naar een bestaande knoop");
  meld(Object.keys(VREEMDE_SCHEMAS).every((a) => isDeepStrictEqual(nieuw.schemas[a], bron.schemas[a])), "de schema's van de vreemde attributen zijn gelijk");
  meld(nieuw.imports.filter((i) => i.uri === VREEMDE_IMPORT.uri).length === 1 && isDeepStrictEqual(nieuw.imports, bron.imports), "de imports zijn gelijk");
  meld(isDeepStrictEqual([...na.keys()].sort(), [...voor.keys()].sort()), "dezelfde paden, geen erbij en geen weg");
  // Elk attribuut heeft een beschrijving: in het bestand, of uit een import van de standaard.
  const zonder = [];
  for (const k of nieuw.data) for (const a of Object.keys(k.attributes ?? {})) {
    if (!nieuw.schemas[a] && !/^(bsi|usd)::/.test(a)) zonder.push(a);
  }
  meld(zonder.length === 0, "elk attribuut heeft een schema", [...new Set(zonder)].join(", "));

  const bladVoor = bladKnoop(bron);
  const bladNa = bladKnoop(nieuw);
  meld(bladNa?.path === bladVoor?.path, "het blad heeft hetzelfde pad", `${bladVoor?.path} / ${bladNa?.path}`);
  const u = bladNa?.attributes["ocss::blad::uitkomst"];
  meld(u?.status === "voldoet_niet" && Math.abs(u.uc - 240 / 221.8) < 0.001, "de nieuwe uitkomst: voldoet niet, UC 1,08", JSON.stringify({ status: u?.status, uc: u?.uc }));
  const veld = u?.invoervelden?.find((v) => v.naam === "M_Ed");
  meld(veld?.waarde === "240" && veld?.eenheid === "kN*m", "het gewijzigde invoerveld, met eenheid", JSON.stringify(veld));
  const toets = balkNa?.attributes["ocss::element"]?.toetsingen?.[0];
  meld(toets?.ref === bladNa?.path && toets?.status === "voldoet_niet" && toets?.uc === u?.uc, "de balk verwijst naar dezelfde toetsing, met de nieuwe uitkomst", JSON.stringify(toets));

  const verwacht = lees(GEWIJZIGD);
  meld(isDeepStrictEqual(zonderTijd(nieuw), zonderTijd(JSON.parse(verwacht))), "gelijk aan funderingsbalk-gewijzigd.ifccalculation (de invoer van de Explorer-test)");

  const opnieuw = leesProjectBestand(nieuwTekst, "funderingsbalk");
  meld(isDeepStrictEqual(opnieuw.vreemd, gelezen.vreemd), "opnieuw openen geeft dezelfde vreemde gegevens");
  meld(isDeepStrictEqual(zonderTijd(JSON.parse(opslaan(opnieuw))), zonderTijd(nieuw)), "en opnieuw opslaan hetzelfde bestand");
}

// ── Geen oordeel ────────────────────────────────────────────────────────────
console.log("Geen oordeel:");
{
  const p = { ...gelezen, exemplaren: gelezen.exemplaren.map((ex) => ({ ...ex, waarden: { ...ex.waarden, A_s: "6000" } })) };
  const doc = JSON.parse(opslaan(p));
  const u = bladKnoop(doc)?.attributes["ocss::blad::uitkomst"];
  meld(u?.status === "geen_oordeel" && u?.uc === undefined, "te veel wapening: geen oordeel en geen UC, niet voldoet", JSON.stringify({ status: u?.status, uc: u?.uc }));
  const toets = knopenVan(doc).get(BALK)?.attributes["ocss::element"]?.toetsingen?.[0];
  meld(toets?.status === "geen_oordeel", "ook op de balk", JSON.stringify(toets));
}

// ── Blad weg ────────────────────────────────────────────────────────────────
console.log("Zonder het blad:");
{
  const doc = JSON.parse(opslaan({ ...gelezen, exemplaren: [] }));
  const knopen = knopenVan(doc);
  meld(!doc.data.some((k) => k.attributes?.["ocss::blad"]), "het blad is weg");
  meld(isDeepStrictEqual(knopen.get(MATERIAAL), knopenVan(bron).get(MATERIAAL)), "de vreemde knoop blijft");
  const balk = knopen.get(BALK);
  meld(isDeepStrictEqual(balk?.attributes, VREEMD_OP_BALK), "op de balk blijven alleen de vreemde attributen", JSON.stringify(balk?.attributes));
  meld(Object.keys(VREEMDE_SCHEMAS).every((a) => doc.schemas[a]) && doc.imports.some((i) => i.uri === VREEMDE_IMPORT.uri), "met hun schema's en import");
}

// ── Hernoemen ───────────────────────────────────────────────────────────────
console.log("Hernoemen en een ander projectnummer:");
{
  meld(gelezen.projectId === bron.data.find((k) => k.attributes?.["ocss::project"])?.path, "het project opent met de wortel uit het bestand als id", gelezen.projectId);
  // Een andere Studio zet ook iets op het blad, waarvan het pad aan de projectwortel hangt.
  const metOpmerking = JSON.parse(ruw);
  const bladPad = bladKnoop(metOpmerking).path;
  metOpmerking.data.push({ path: bladPad, attributes: { "openaec::reference::category": "Nagekeken" } });
  const g = leesProjectBestand(JSON.stringify(metOpmerking), "funderingsbalk");
  const hernoemd = { ...g, projectNaam: "Andere naam", gegevens: { ...g.gegevens, project_nummer: "2026-099" } };
  const doc = JSON.parse(opslaan(hernoemd));
  const na = knopenVan(doc);
  meld(isDeepStrictEqual([...na.keys()].sort(), [...knopenVan(metOpmerking).keys()].sort()), "dezelfde paden, geen erbij en geen weg");
  meld(bladKnoop(doc)?.path === bladPad && na.get(bladPad)?.attributes["openaec::reference::category"] === "Nagekeken", "het vreemde attribuut zit nog op hetzelfde blad");
  meld(Object.entries(VREEMD_OP_BALK).every(([a, w]) => isDeepStrictEqual(na.get(BALK)?.attributes[a], w)) && na.get(BALK)?.attributes["ocss::element"]?.toetsingen?.[0]?.ref === bladPad, "de balk houdt zijn vreemde attributen en zijn toetsing");
  meld(doc.data[0].attributes["bsi::ifc::prop::Name"] === "Andere naam", "met de nieuwe naam");
}

console.log(`\n${aantal - fouten} van ${aantal} controles goed.`);
process.exit(fouten === 0 ? 0 : 1);
