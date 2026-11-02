/**
 * Controle van de balklaag als IFCX (IFC5) en van wat het 3D-beeld daaruit leest.
 *
 * De generator (packages/core/src/balklaagIfcx.ts) maakt van de invoer en de
 * uitkomsten van een balklaagblad een IFCX-document; de lezer
 * (packages/core/src/ifcxLezen.ts) stelt dat samen tot elementen met geometrie en
 * attributen. Het 3D-beeld krijgt niets anders dan dat document. Dit script
 * bewaakt:
 *   1. de specificatie: de kop, geen velden die er niet horen, elk attribuut
 *      volgens zijn schema (scripts/fixtures/ifcx-schemas.json is de inhoud van
 *      de bestanden op ifcx.dev), paden zonder `/`, doelen die bestaan, de vorm
 *      van de mesh en de plaatsing;
 *   2. het aantal balken bij h.o.h. en breedte, en het representatieve stuk bij
 *      een grote vloer;
 *   3. de maten: de lezer haalt uit de JSON precies dezelfde maten terug als de
 *      invoer, op elk statisch schema;
 *   4. de plaat, ook bij de T-balk, de opleggingen en de raveling;
 *   5. de attributen op elk element, de unity check uit het blad;
 *   6. de knopen voor het projectbestand: vaste paden, afgeleid van het blad-id;
 *   7. het blad zelf: `@ifcx` in de uitwerking, aan- en uitzetten, op papier of
 *      niet, gelijke invoer geeft een gelijk document.
 *
 * Draaien:  node scripts/check-balklaag-ifcx.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  parse, evaluate, render, extractScope, leesIfcx, ifcxNaarScene, drieDSvg, ifcxVoorBlad,
  balklaagIfcxDocument, balklaagIfcxKnopen, balklaagIfcxKnopenUitScope, balklaagAantalBalken,
  BALKLAAG_IFCX_SCHEMAS, BALKLAAG_MAX_BALKEN,
} from "../packages/core/dist/index.js";
import { laadTemplate } from "./lib/refcheck.mjs";

const hier = dirname(fileURLToPath(import.meta.url));
const STANDAARD = JSON.parse(readFileSync(join(hier, "fixtures/ifcx-schemas.json"), "utf8"));

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};
const dichtbij = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

/** Het basisgeval: 71×221 C24, h.o.h. 450, 5 m breed, overspanning 5050, opleglengte 50. */
const BASIS = {
  b: 71, h: 221, hoh: 450, schema: 1, onderslag: false, tBalk: false, Lth: 5050, aOpl: 50, aSteun: 50,
  aOver: 0, Lveld2: 0, bSparing: 0, lStaart: 0, tVloer: 18, bVloer: 5000, sterkteklasse: "C24", dichtheid: 420,
  plaat: null, uc: { max: 0.87, buiging: 0.5, afschuiving: 0.2, oplegdruk: 0.3, doorbuiging: 0.87 },
};
const lees = (invoer) => {
  const doc = balklaagIfcxDocument({ ...BASIS, ...invoer });
  const gelezen = leesIfcx(JSON.parse(JSON.stringify(doc)));
  return { doc, gelezen, el: gelezen.elementen };
};
const van = (el, klasse) => el.filter((e) => e.klasse === klasse);
const maten = (e) => [0, 1, 2].map((k) => Math.round((e.grenzen.max[k] - e.grenzen.min[k]) * 1e6) / 1e3);

// ── De toets volgens de specificatie ────────────────────────────────────────
/** Zoals ValidateAttributeValue in src/ifcx-core/schema/schema-validation.ts van de specificatie. */
function toetsWaarde(desc, v, pad, schemas) {
  if (desc.optional && v === undefined) return;
  for (const id of desc.inherits ?? []) toetsWaarde(schemas[id].value, v, pad, schemas);
  const t = desc.dataType;
  if ((t === "Boolean" && typeof v !== "boolean")
    || ((t === "String" || t === "DateTime" || t === "Enum" || t === "Reference") && typeof v !== "string")
    || ((t === "Integer" || t === "Real") && typeof v !== "number")
    || (t === "Object" && typeof v !== "object")) throw new Error(`${pad}: verwacht ${t}, staat ${JSON.stringify(v)}`);
  if (t === "Integer" && !Number.isInteger(v)) throw new Error(`${pad}: verwacht een geheel getal`);
  if (t === "Enum" && !desc.enumRestrictions.options.includes(v)) throw new Error(`${pad}: ${v} staat niet in de keuzes`);
  if (t === "Object" && desc.objectRestrictions) {
    for (const [k, d] of Object.entries(desc.objectRestrictions.values)) {
      if (d.optional && !Object.hasOwn(v, k)) continue;
      if (!Object.hasOwn(v, k)) throw new Error(`${pad}: sleutel ${k} ontbreekt`);
      toetsWaarde(d, v[k], `${pad}.${k}`, schemas);
    }
  }
  if (t === "Array") {
    if (!Array.isArray(v)) throw new Error(`${pad}: verwacht een lijst`);
    v.forEach((w, i) => toetsWaarde(desc.arrayRestrictions.value, w, `${pad}[${i}]`, schemas));
  }
}

/** Alle regels voor een geldig bestand; geeft de afwijkingen. */
function afwijkingen(doc) {
  const uit = [];
  const hoogste = Object.keys(doc).sort().join(",");
  if (hoogste !== "data,header,imports,schemas") uit.push(`velden op het hoogste niveau: ${hoogste}`);
  for (const k of ["id", "ifcxVersion", "dataVersion", "author", "timestamp"]) {
    if (typeof doc.header?.[k] !== "string" || doc.header[k] === "") uit.push(`header.${k} ontbreekt`);
  }
  if (doc.header?.ifcxVersion !== "ifcx_alpha") uit.push(`ifcxVersion is ${doc.header?.ifcxVersion}`);
  const schemas = { ...STANDAARD, ...doc.schemas };
  const paden = new Set(doc.data.map((k) => k.path));
  const gezien = new Set();
  for (const k of doc.data) {
    if (typeof k.path !== "string" || k.path.includes("/")) uit.push(`pad met een /: ${k.path}`);
    if (gezien.has(k.path)) uit.push(`dubbel pad: ${k.path}`);
    gezien.add(k.path);
    const velden = Object.keys(k).filter((v) => !["path", "children", "inherits", "attributes"].includes(v));
    if (velden.length) uit.push(`knoop met andere velden: ${velden.join(",")}`);
    for (const veld of ["children", "inherits"]) {
      for (const [naam, doel] of Object.entries(k[veld] ?? {})) {
        if (naam.includes("/")) uit.push(`naam met een /: ${naam}`);
        if (doel !== null && !paden.has(doel.split("/")[0])) uit.push(`doel bestaat niet: ${naam} -> ${doel}`);
      }
    }
    for (const [a, w] of Object.entries(k.attributes ?? {})) {
      if (!schemas[a]) {
        uit.push(`geen schema voor ${a}`);
        continue;
      }
      try {
        toetsWaarde(schemas[a].value, w, a, schemas);
      } catch (e) {
        uit.push(e.message);
      }
    }
    const mesh = k.attributes?.["usd::usdgeom::mesh"];
    if (mesh) {
      if ("faceVertexCounts" in mesh) uit.push("mesh met faceVertexCounts: staat niet in usd@v1");
      if (!mesh.points.every((p) => Array.isArray(p) && p.length === 3)) uit.push("mesh: points zijn geen [x, y, z]");
      if (mesh.faceVertexIndices.length % 3 !== 0) uit.push("mesh: geen driehoeken");
      if (!mesh.faceVertexIndices.every((i) => Number.isInteger(i) && i >= 0 && i < mesh.points.length)) uit.push("mesh: index buiten de punten");
    }
    const t = k.attributes?.["usd::xformop"]?.transform;
    if (t && !(t.length === 4 && t.every((r) => r.length === 4))) uit.push("transform is geen 4×4");
    if (t && !(t[0][3] === 0 && t[1][3] === 0 && t[2][3] === 0 && t[3][3] === 1)) uit.push("transform: de verplaatsing hoort op de laatste rij");
  }
  // Wortels en kringen, zoals FindRootsOrCycles.
  const doelen = new Set(doc.data.flatMap((k) => [...Object.values(k.children ?? {}), ...Object.values(k.inherits ?? {})]));
  const wortels = doc.data.filter((k) => !doelen.has(k.path));
  if (wortels.length !== 1) uit.push(`${wortels.length} wortels in plaats van één`);
  return uit;
}

// ── 1. De specificatie ──────────────────────────────────────────────────────
console.log("\n1. Geldig IFCX");
{
  const gevallen = {
    "enkelvoudig": {},
    "overstek": { schema: 2, aOver: 800 },
    "twee velden": { schema: 3, Lveld2: 3000, aSteun: 90 },
    "raveelbalk": { schema: 4, bSparing: 2400, lStaart: 1800, Lth: 2450 },
    "onderslag": { onderslag: true, bVloer: null },
    "T-balk": { tBalk: true, plaat: "OSB/3", uc: { max: 0.9, flens: 0.4, lijmnaad: 0.7, flensbreedte: 0.2 } },
    "zonder uitkomst": { uc: {} },
    "GL28h zonder dichtheid": { sterkteklasse: "GL28h", dichtheid: null },
  };
  for (const [naam, invoer] of Object.entries(gevallen)) {
    const { doc, gelezen } = lees(invoer);
    const a = afwijkingen(doc);
    meld(a.length === 0, `${naam}: volgens de specificatie`, a.slice(0, 4).join(" | "));
    meld(gelezen.meldingen.length === 0, `${naam}: de lezer heeft geen meldingen`, gelezen.meldingen.join(" | "));
  }
  const { doc } = lees({});
  meld(doc.header.ifcxVersion === "ifcx_alpha" && doc.header.dataVersion === "1.0.0", "ifcxVersion en dataVersion zoals in de voorbeelden");
  const uris = doc.imports.map((i) => i.uri);
  meld(uris.every((u) => u.startsWith("https://ifcx.dev/")) && uris.length === 4, "alleen imports die bestaan, op ifcx.dev", uris.join(" "));
  const eigen = new Set(doc.data.flatMap((k) => Object.keys(k.attributes ?? {})).filter((a) => !STANDAARD[a]));
  meld([...eigen].every((a) => a.startsWith("ocss::") && BALKLAAG_IFCX_SCHEMAS[a]), "wat de standaard niet kent, staat onder ocss:: met een schema", [...eigen].join(" "));
  const lagen = ["IfcProject", "IfcSite", "IfcBuilding", "IfcBuildingStorey", "IfcElementAssembly"];
  const klassen = doc.data.map((k) => k.attributes?.["bsi::ifc::class"]?.code);
  meld(lagen.every((l) => klassen.includes(l)), "de ruimtelijke boom van project tot verdieping");
  const kl = doc.data.map((k) => k.attributes?.["bsi::ifc::class"]).filter(Boolean);
  meld(kl.every((c) => c.uri === `https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/${c.code}`), "elke klasse met de uri van de voorbeelden");

  // De lezer is de lezer van de specificatie: ook een aanvulling op een kind en een
  // weggehaald kind of erfdeel, en een onzichtbare mesh.
  const proef = leesIfcx({
    data: [
      { path: "w", children: { A: "a", B: "b" } },
      { path: "a", inherits: { t: "t" }, attributes: { "bsi::ifc::class": { code: "IfcBeam", uri: "" }, "usd::xformop": { transform: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [1, 2, 3, 1]] } } },
      { path: "t", children: { L: "m", V: "v" }, attributes: { "bsi::ifc::prop::Name": "uit t" } },
      { path: "m", attributes: { "usd::usdgeom::mesh": { points: [[0, 0, 0], [1, 0, 0], [0, 1, 0]], faceVertexIndices: [0, 1, 2] } } },
      { path: "v", attributes: { "usd::usdgeom::mesh": { points: [[9, 9, 9], [8, 9, 9], [9, 8, 9]], faceVertexIndices: [0, 1, 2] }, "usd::usdgeom::visibility": { visibility: "invisible" } } },
      { path: "b", attributes: { "bsi::ifc::prop::Name": "eerst" } },
      { path: "b", attributes: { "bsi::ifc::prop::Name": "daarna" } },
      { path: "w/A", attributes: { "bsi::ifc::prop::Name": "aanvulling op A" } },
    ],
  });
  const e = proef.elementen[0];
  meld(proef.elementen.length === 1 && e.naam === "aanvulling op A", "een knoop `wortel/kind` vult het kind aan", JSON.stringify(proef.elementen.map((x) => x.naam)));
  meld(e && dichtbij(e.grenzen.min[0], 1) && dichtbij(e.grenzen.max[1], 3) && dichtbij(e.grenzen.min[2], 3), "de plaatsing staat op de laatste rij en werkt door op de kinderen", JSON.stringify(e?.grenzen));
  meld(e && e.grenzen.max[0] < 5, "een onzichtbare mesh telt niet mee");
  const kring = leesIfcx({ data: [{ path: "a", children: { b: "b" } }, { path: "b", children: { a: "a" } }] });
  meld(kring.meldingen.length > 0 && kring.elementen.length === 0, "een kring geeft een melding, geen vastloper");
  meld(/onbekend doel/.test(leesIfcx({ data: [{ path: "a", children: { b: "weg" } }] }).meldingen.join()) === false, "een doel dat nergens staat, is een lege knoop, zoals bij de specificatie");
  meld(/onbekend doel weg.x/.test(leesIfcx({ data: [{ path: "a", children: { b: "weg/x" } }] }).meldingen.join()), "een pad de boom in dat niet bestaat, geeft een melding");
  meld(leesIfcx(null).meldingen.length === 1, "geen document: een melding");
}

// ── 2. Het aantal balken ────────────────────────────────────────────────────
console.log("\n2. Aantal balken bij h.o.h. en breedte");
{
  const proeven = [
    [5000, 450, 12], [3000, 600, 6], [1200, 600, 3], [1199, 600, 2], [900, 450, 3], [1000, 600, 2], [200, 600, 2],
  ];
  for (const [B, hoh, n] of proeven) {
    meld(balklaagAantalBalken(B, hoh) === n, `breedte ${B}, h.o.h. ${hoh}: ${n} balken`, String(balklaagAantalBalken(B, hoh)));
    const { el } = lees({ bVloer: B, hoh });
    meld(van(el, "IfcBeam").length === Math.min(n, BALKLAAG_MAX_BALKEN), `  en zoveel staan er in het IFCX`, String(van(el, "IfcBeam").length));
    const ys = van(el, "IfcBeam").map((b) => (b.grenzen.min[1] + b.grenzen.max[1]) / 2);
    meld(ys.every((y, i) => dichtbij(y, (i * hoh) / 1000)), "  op de h.o.h.-afstand", ys.join(" "));
  }
  const groot = lees({ bVloer: 30000, hoh: 600 });
  const balken = van(groot.el, "IfcBeam");
  const wortel = groot.doc.data.find((k) => k.attributes?.["bsi::ifc::class"]?.code === "IfcElementAssembly");
  meld(balken.length === BALKLAAG_MAX_BALKEN, `een vloer van 30 m: een representatief stuk van ${BALKLAAG_MAX_BALKEN} balken`, String(balken.length));
  meld(wortel.attributes["ocss::calc::aantalBalken"] === 51 && wortel.attributes["ocss::calc::aantalGetoond"] === 12, "het echte aantal blijft te lezen", JSON.stringify(wortel.attributes));
  meld(/Representatief stuk: 12 van de 51 balken/.test(wortel.attributes["bsi::ifc::prop::Description"]), "en staat in de omschrijving");
  meld(lees({ bVloer: null }).el.filter((e) => e.klasse === "IfcBeam").length === 5, "zonder breedte (trillingstoets uit): vijf balken");
  const k = lees({ bVloer: 30000, hoh: 600 }).doc.data.length;
  meld(k < 60, `het document blijft klein: ${k} knopen bij een grote vloer`);
  const omvang = JSON.stringify(groot.doc).length;
  meld(omvang < 40000, `en ${Math.round(omvang / 1024)} kB: de balken delen hun profiel`, String(omvang));
}

// ── 3. De maten ─────────────────────────────────────────────────────────────
console.log("\n3. De lezer haalt uit de JSON dezelfde maten terug");
{
  {
    const { el } = lees({ b: 71, h: 221, hoh: 450, Lth: 5050, aOpl: 50 });
    const b = van(el, "IfcBeam")[0];
    meld(maten(b).join() === `${5050 + 50},71,221`, "enkelvoudig: L_th + a_opl, b, h", maten(b).join());
    meld(dichtbij(b.grenzen.min[0], -0.025) && dichtbij(b.grenzen.max[0], 5.075) && dichtbij(b.grenzen.min[2], 0) && dichtbij(b.grenzen.max[2], 0.221),
      "op zijn plaats: het hart van de eerste oplegging op x = 0", JSON.stringify(b.grenzen));
    const o = van(el, "IfcBearing");
    meld(o.length === 2 && dichtbij((o[0].grenzen.min[0] + o[0].grenzen.max[0]) / 2, 0) && dichtbij((o[1].grenzen.min[0] + o[1].grenzen.max[0]) / 2, 5.05) && dichtbij(maten(o[0])[0], 50),
      "twee opleggingen, hart op hart L_th, breedte a_opl", JSON.stringify(o.map(maten)));
    meld(o.every((x) => dichtbij(x.grenzen.max[2], 0)), "onder de balken");
    meld(b.attributen["bsi::ifc::prop::Width"] === 0.071 && b.attributen["bsi::ifc::prop::Height"] === 0.221 && b.attributen["bsi::ifc::prop::Length"] === 5.1,
      "de attributen zeggen hetzelfde, in meters", JSON.stringify(b.attributen));
    meld(dichtbij(b.attributen["bsi::ifc::prop::CrossSectionArea"], 0.071 * 0.221) && b.attributen["ocss::calc::hartOpHart"] === 0.45 && b.attributen["ocss::calc::overspanning"] === 5.05, "doorsnede, h.o.h. en overspanning");
  }
  {
    const { el } = lees({ schema: 2, aOver: 800, Lth: 4000, aOpl: 60 });
    const b = van(el, "IfcBeam")[0];
    meld(dichtbij(b.grenzen.min[0], -0.03) && dichtbij(b.grenzen.max[0], 4.8), "overstek: van a_opl/2 voor de oplegging tot L_th + overstek", JSON.stringify(b.grenzen));
    meld(van(el, "IfcBearing").length === 2, "twee opleggingen");
  }
  {
    const { el } = lees({ schema: 3, Lth: 3000, Lveld2: 2500, aOpl: 50, aSteun: 90 });
    const b = van(el, "IfcBeam")[0];
    const o = van(el, "IfcBearing");
    meld(dichtbij(b.grenzen.max[0], 5.525), "twee velden: tot L_th + L_veld2 + a_opl/2", JSON.stringify(b.grenzen));
    meld(o.length === 3 && dichtbij(maten(o[1])[0], 90) && dichtbij(maten(o[0])[0], 50), "drie opleggingen, de middelste met a_steun", JSON.stringify(o.map(maten)));
    meld(dichtbij((o[1].grenzen.min[0] + o[1].grenzen.max[0]) / 2, 3) && dichtbij((o[2].grenzen.min[0] + o[2].grenzen.max[0]) / 2, 5.5), "op L_th en L_th + L_veld2");
  }
  {
    const { el } = lees({ onderslag: true, b: 96, h: 271, Lth: 4000, aOpl: 100 });
    meld(van(el, "IfcBeam").length === 1 && maten(van(el, "IfcBeam")[0]).join() === "4100,96,271", "onderslag: één balk", maten(van(el, "IfcBeam")[0]).join());
    meld(!el.some((e) => e.klasse === "IfcSlab" || e.klasse === "IfcCovering"), "zonder vloerplaat, net als het beeld");
  }
}

// ── 4. Plaat, T-balk en raveling ────────────────────────────────────────────
console.log("\n4. Vloerplaat, T-balk en raveling");
{
  const gewoon = lees({ tVloer: 18, hoh: 450, bVloer: 1350 });
  const plaat = van(gewoon.el, "IfcCovering")[0];
  meld(!!plaat && van(gewoon.el, "IfcSlab").length === 0, "beschot: IfcCovering");
  meld(plaat && dichtbij(plaat.grenzen.min[2], 0.221) && dichtbij(plaat.grenzen.max[2], 0.239), "op de balken, zo dik als t_vloer", JSON.stringify(plaat?.grenzen));
  meld(plaat && maten(plaat)[1] === 4 * 450, "van hart tot hart tussen de balken, plus een halve h.o.h. aan elke kant", String(plaat && maten(plaat)[1]));
  meld(plaat?.opaciteit === 0.45, "doorzichtig, zodat de balken te zien blijven");
  meld(plaat?.attributen["ocss::calc::opmerking"] !== undefined && plaat?.attributen["ocss::calc::unityCheck"] === undefined, "zonder T-balk geen unity check, wel de reden");

  const t = lees({ tBalk: true, plaat: "OSB/3", tVloer: 22, uc: { max: 0.9, flens: 0.4, lijmnaad: 0.7, flensbreedte: 0.2 } });
  const slab = van(t.el, "IfcSlab")[0];
  meld(!!slab && van(t.el, "IfcCovering").length === 0, "T-balk: de plaat is IfcSlab");
  meld(slab && dichtbij(slab.grenzen.max[2] - slab.grenzen.min[2], 0.022), "met de dikte van de plaat");
  meld(slab?.attributen["bsi::ifc-mat::prop::StrengthClass"] === "OSB/3", "met de soort plaat");
  meld(slab?.attributen["ocss::calc::unityCheck"] === 0.7, "en de grootste UC van flens, lijmnaad en flensbreedte", String(slab?.attributen["ocss::calc::unityCheck"]));
  meld(slab?.attributen["ocss::calc::toetsen"]?.lijmnaad === 0.7, "per toets uit te lezen");

  const r = lees({ schema: 4, bSparing: 2400, lStaart: 1800, Lth: 2450, b: 71, h: 221, hoh: 600, aOpl: 50 });
  const staart = r.el.filter((e) => e.naam.startsWith("Staartbalk"));
  const rav = r.el.find((e) => e.naam === "Raveelbalk");
  const wissel = r.el.filter((e) => e.naam.startsWith("Wisselbalk"));
  meld(staart.length === 3, "raveel: staartbalken als in de plattegrond: floor(b_sparing/h.o.h.) − 1", String(staart.length));
  meld(rav && maten(rav).join() === "71,2400,221", "de raveelbalk dwars, over de breedte van de sparing", rav && maten(rav).join());
  meld(rav?.attributen["ocss::calc::unityCheck"] === 0.87 && rav?.attributen["ocss::calc::overspanning"] === 2.45, "met de UC en L_th van het blad");
  meld(wissel.length === 2 && maten(wissel[0])[1] === 142, "dubbele wisselbalken", JSON.stringify(wissel.map(maten)));
  meld(staart.every((s) => dichtbij(s.grenzen.max[0], rav.grenzen.min[0])), "de staartbalken komen op de raveelbalk");
  meld(wissel[0].grenzen.max[1] <= rav.grenzen.min[1] + 1e-9 && wissel[1].grenzen.min[1] >= rav.grenzen.max[1] - 1e-9, "de raveelbalk ligt tussen de wisselbalken");
  meld(staart.every((s) => s.attributen["ocss::calc::unityCheck"] === undefined && s.attributen["ocss::calc::opmerking"]), "wat het blad niet toetst, heeft geen UC");
  const covering = van(r.el, "IfcCovering")[0];
  const gat = covering.vlakken.flatMap((v) => v.punten).filter((p) => p[0] > rav.grenzen.max[0] + 1e-6 && p[1] > 0 + 1e-6 && p[1] < 2.4 - 1e-6);
  meld(gat.length === 0, "de sparing zit niet dicht: de plaat loopt eromheen", String(gat.length));
}

// ── 5. Attributen ───────────────────────────────────────────────────────────
console.log("\n5. Naam, materiaal, sterkteklasse, maten en unity check op elk element");
{
  const { el, doc } = lees({});
  for (const b of van(el, "IfcBeam")) {
    const a = b.attributen;
    const ok = a["bsi::ifc::prop::Name"] && a["bsi::ifc::material"]?.code === "WOOD" && a["bsi::ifc-mat::prop::StrengthClass"] === "C24"
      && a["bsi::ifc-mat::prop::MassDensity"] === 420 && a["bsi::ifc::prop::Width"] > 0 && a["bsi::ifc::prop::Height"] > 0
      && a["bsi::ifc::prop::Length"] > 0 && a["ocss::calc::unityCheck"] === 0.87 && a["ocss::calc::toetsen"]?.doorbuiging === 0.87;
    if (!ok) meld(false, `${b.naam}: compleet`, JSON.stringify(a));
  }
  meld(true, `${van(el, "IfcBeam").length} balken met alle attributen`);
  const ov = van(el, "IfcBearing")[0];
  meld(ov.attributen["ocss::calc::unityCheck"] === 0.3 && ov.attributen["bsi::ifc::prop::Name"] === "Oplegging 1", "oplegging: de oplegdruk als UC", JSON.stringify(ov.attributen));
  meld(el.every((e) => !Object.keys(e.attributen).some((k) => k.startsWith("usd::") || k.startsWith("bsi::ifc::presentation"))), "geometrie en presentatie staan niet tussen de attributen");
  meld(el.filter((e) => e.klasse === "IfcBeam").every((e) => e.kleur === "#e3c08a"), "hout: de kleur uit het document", el[0].kleur);
  const meshes = doc.data.filter((k) => k.attributes?.["usd::usdgeom::mesh"]);
  meld(van(el, "IfcBeam").length > meshes.length - 3, "balken van gelijke lengte delen één mesh", String(meshes.length));
  const inf = lees({ uc: { max: Infinity, buiging: NaN, afschuiving: 0.2 } });
  meld(afwijkingen(inf.doc).length === 0 && van(inf.el, "IfcBeam")[0].attributen["ocss::calc::unityCheck"] === 0.2, "een oneindige UC komt niet in de JSON");
}

// ── 6. De knopen voor het projectbestand ────────────────────────────────────
console.log("\n6. balklaagIfcxKnopen voor het projectbestand");
{
  const a = balklaagIfcxKnopen(BASIS, "blad-1");
  const b = balklaagIfcxKnopen(BASIS, "blad-1");
  const c = balklaagIfcxKnopen(BASIS, "blad-2");
  meld(JSON.stringify(a) === JSON.stringify(b), "dezelfde invoer, dezelfde knopen");
  meld(a.every((k) => /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(k.path)), "paden zijn vaste UUID's", a[0].path);
  const pa = new Set(a.map((k) => k.path));
  meld(c.every((k) => !pa.has(k.path)), "een ander blad heeft andere paden");
  meld(a[0].attributes["bsi::ifc::class"].code === "IfcElementAssembly" && Object.keys(a[0].children).includes("Balk_01"), "de eerste knoop is de wortel van het blad");
  meld(a.every((k) => !k.header && ["path", "children", "inherits", "attributes"].some((v) => v in k)), "alleen knopen: geen kop");
  const anders = balklaagIfcxKnopen({ ...BASIS, h: 246 }, "blad-1");
  meld(a[0].path === anders[0].path, "een andere maat houdt hetzelfde pad");
  const doc = balklaagIfcxDocument(BASIS, { bladId: "blad-1" });
  meld(doc.data.some((k) => k.path === a[0].path), "het document bevat dezelfde knopen");
  const anderBlad = ifcxVoorBlad(balklaagIfcxDocument(BASIS), "blad-9");
  meld(afwijkingen(anderBlad).length === 0 && leesIfcx(anderBlad).elementen.length === 15, "ifcxVoorBlad: andere paden, zelfde model", String(leesIfcx(anderBlad).elementen.length));
}

// ── 7. Het blad zelf ────────────────────────────────────────────────────────
console.log("\n7. Het balklaagblad");
{
  const ast = parse(laadTemplate("balklaag.ts"));
  const PROJECT = { CC: 2, K_FI: 1, rekenwijze: 0 };
  const INV = {
    profiel: "12", sterkteklasse: "2", klimaat: "1", duurklasse: "2", schema: "1", ligger: "1", doorsnede: "1",
    L_d: "5000", a_opl: "50", hoh: "600", t_vloer: "18", E_beschot: "7000", b_vloer: "3",
    G_k: "1.0", Q_k: "1.75", F_k: "2", belastingcat: "2", controleer: "1", grensfactor: "0.004", grens_bij: "0.003",
    controleer_trilling: "1", "ζ": "0.01", a_tril: "1", b_tril: "120", g_bl: "0", a_steun: "0",
    a_over: "0", L_veld2: "0", b_sparing: "0", l_staart: "0", b_ond: "0", b_zelf: "0", h_zelf: "0",
    "ψ_0_zelf": "0", "ψ_2_zelf": "0",
  };
  const reken = (inv = {}) => {
    const nodes = evaluate(ast, { ...INV, ...inv }, PROJECT);
    return { nodes, html: render(nodes) };
  };
  const vlak = (lijst) => lijst.flatMap((n) => (n.type === "conditional-branch" ? vlak(n.children) : [n]));
  const blok = (nodes) => vlak(nodes).find((n) => n.type === "ifcx");
  const ontsnap = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

  const r = reken();
  meld(!/Error evaluating/.test(r.html), "het blad rekent zonder fout door", r.html.match(/Error evaluating[^<]*/)?.[0]);
  const b = blok(r.nodes);
  meld(!!b && b.meldingen.length === 0 && b.document, "standaard staat het beeld aan, zonder meldingen", b?.meldingen.join(" | "));
  const m = r.html.match(/<div class="calc-ifcx( alleen-scherm)?" data-ifcx="([^"]*)">/);
  meld(!!m, "de uitwerking heeft een blok met het document als JSON");
  const doc = JSON.parse(ontsnap(m?.[2] ?? "{}"));
  meld(JSON.stringify(doc) === JSON.stringify(b.document), "data-ifcx is het document");
  meld(afwijkingen(doc).length === 0, "volgens de specificatie", afwijkingen(doc).slice(0, 3).join(" | "));
  meld(m?.[1] !== undefined, "standaard niet op papier: de uitdraai blijft kort");
  const el = leesIfcx(doc).elementen;
  const balk = van(el, "IfcBeam")[0];
  meld(van(el, "IfcBeam").length === 6, "b_vloer = 3 m, h.o.h. 600: zes balken", String(van(el, "IfcBeam").length));
  meld(maten(balk).join() === "5100,71,221", "71×221, L_d = 5000 plus twee keer a_opl = 50", maten(balk).join());
  const ucUitBlad = vlak(r.nodes).filter((n) => n.name === "UC_max" && n.type === "assignment").pop();
  meld(ucUitBlad && dichtbij(balk.attributen["ocss::calc::unityCheck"], parseFloat(String(ucUitBlad.result).replace(",", ".")), 0.01),
    "de UC op de balk is de maatgevende UC van het blad", `${balk.attributen["ocss::calc::unityCheck"]} / ${ucUitBlad?.result}`);
  meld(balk.attributen["bsi::ifc-mat::prop::StrengthClass"] === "C24" && balk.attributen["bsi::ifc-mat::prop::MassDensity"] === 420, "C24 met ρ = 420 uit het blad");
  meld(/class="calc-ifcx-beeld" style="height:340px"/.test(r.html) && /<svg class="calc-3d-terugval"/.test(r.html) && /<polygon /.test(r.html), "met een stilstaande projectie, zonder WebGL te lezen");
  meld(JSON.stringify(reken().nodes) === JSON.stringify(r.nodes), "gelijke invoer, gelijk document: het beeld hoeft niet opnieuw");
  meld(/\bNaN\b|Infinity/.test(r.html.match(/<svg class="calc-3d-terugval"[\s\S]*?<\/svg>/)?.[0] ?? "") === false, "de projectie heeft alleen getallen");

  const uit = reken({ toon_3d: "0" });
  meld(!blok(uit.nodes) && !/calc-ifcx/.test(uit.html), "uit te zetten: toon_3d = 0");
  const druk = reken({ druk_3d: "1" });
  meld(!/Error evaluating/.test(druk.html), "ook met druk_3d = 1 zonder fout");
  meld(druk.html.includes('<h1>10. Model in 3D<span class="alleen-afdruk"></span></h1>'), "met een kop op papier");
  meld(/<div class="calc-ifcx" data-ifcx=/.test(druk.html), "op papier met druk_3d = 1: zonder alleen-scherm");

  const anders = blok(reken({ profiel: "14", hoh: "400" }).nodes).document;
  const balk2 = van(leesIfcx(anders).elementen, "IfcBeam")[0];
  meld(maten(balk2).join() === "5100,71,271" && balk2.attributen["ocss::calc::hartOpHart"] === 0.4, "de invoer rekent mee", maten(balk2).join());
  meld(doc.data[0].path === anders.data[0].path && doc.data.find((k) => k.attributes?.["bsi::ifc::class"]?.code === "IfcElementAssembly").path === anders.data.find((k) => k.attributes?.["bsi::ifc::class"]?.code === "IfcElementAssembly").path, "met dezelfde paden");

  const tb = blok(reken({ doorsnede: "2", plaat: "4", t_vloer: "22" }).nodes).document;
  const tel = leesIfcx(tb).elementen;
  meld(van(tel, "IfcSlab").length === 1 && van(tel, "IfcSlab")[0].attributen["bsi::ifc-mat::prop::StrengthClass"] === "OSB/3", "T-balk uit het blad: IfcSlab van OSB/3");
  meld(van(tel, "IfcSlab")[0].attributen["ocss::calc::unityCheck"] > 0, "met de UC van plaat en lijmnaad", String(van(tel, "IfcSlab")[0].attributen["ocss::calc::unityCheck"]));
  meld(afwijkingen(tb).length === 0, "volgens de specificatie");

  const twee = leesIfcx(blok(reken({ schema: "3", L_veld2: "3000", a_steun: "90" }).nodes).document).elementen;
  meld(van(twee, "IfcBearing").length === 3 && maten(van(twee, "IfcBearing")[1])[0] === 90, "twee velden uit het blad, met a_steun");
  const rav = leesIfcx(blok(reken({ schema: "4", b_sparing: "2400", l_staart: "1800" }).nodes).document).elementen;
  meld(rav.some((e) => e.naam === "Raveelbalk") && maten(rav.find((e) => e.naam === "Raveelbalk"))[1] === 2400, "raveelbalk uit het blad");
  const ond = leesIfcx(blok(reken({ ligger: "2", b_ond: "2.5" }).nodes).document).elementen;
  meld(van(ond, "IfcBeam").length === 1 && ond[0].naam === "Onderslag", "onderslag uit het blad", ond.map((e) => e.naam).join());
  const geenTril = blok(reken({ controleer_trilling: "0" }).nodes);
  meld(!!geenTril.document && geenTril.meldingen.length === 0, "trillingstoets uit: het beeld blijft");

  const k = balklaagIfcxKnopenUitScope("blad-7", extractScope(ast, INV, PROJECT));
  meld(Array.isArray(k) && k[0].attributes["bsi::ifc::class"].code === "IfcElementAssembly", "balklaagIfcxKnopenUitScope leest een doorgerekend blad");
  meld(k[0].attributes["ocss::calc::unityCheck"] === balk.attributen["ocss::calc::unityCheck"], "met de uitkomsten erbij", String(k[0].attributes["ocss::calc::unityCheck"]));
  const uitgezet = balklaagIfcxKnopenUitScope("blad-7", extractScope(ast, { ...INV, toon_3d: "0" }, PROJECT));
  meld(JSON.stringify(uitgezet) === JSON.stringify(k), "ook als het beeld op dat blad uitstaat");
  meld(balklaagIfcxKnopenUitScope("x", { a: 1 }) === null, "een ander blad: null");

  // Een oud blad zonder `@ifcx` en een `@ifcx` buiten een balklaag.
  const vreemd = evaluate(parse("a = 1\n@ifcx balklaag\n@ifcx kozijn"));
  const vr = vlak(vreemd).filter((n) => n.type === "ifcx");
  meld(vr[0].document === null && /geen balk met een doorsnede/.test(vr[0].meldingen[0]), "buiten een balklaag: een melding");
  meld(/onbekende bron "kozijn"/.test(vr[1].meldingen[0]) && /calc-3d-melding/.test(render(vreemd)), "een onbekende bron: een melding");
  meld(/data-ifcx/.test(render(vreemd)) === false, "en geen beeld");

  const svg = drieDSvg(ifcxNaarScene(leesIfcx(doc), 320));
  meld(/fill-opacity="0.45"/.test(svg), "de projectie toont de plaat doorzichtig");
}

console.log(fouten === 0 ? "\nAlle IFCX-controles groen." : `\n${fouten} IFCX-controle(s) gezakt.`);
process.exit(fouten === 0 ? 0 : 1);
