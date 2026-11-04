/**
 * Controle van het 3D-model van de tweepaalspoer: het IFCX-document uit
 * packages/desktop/src/components/calc/poerIfcx.ts en wat het beeld daaruit leest.
 *
 * Het model rekent niet: alles moet uit dezelfde definitie komen als de tekening
 * (poerDefinitie.ts). Dit script bewaakt daarom:
 *   1. de specificatie, net als bij de balklaag (scripts/lib/ifcx-specificatie.mjs);
 *   2. het model tegen de definitie en de tekening: de maten van poer, palen en kolom, en
 *      het aantal en de plaats van elke staaf, op de drie referentiegevallen uit
 *      check-tweepaalspoer.mjs;
 *   3. een wijziging: de paalafstand en het aantal staven komen meteen door;
 *   4. onzinnige invoer tijdens het typen: geen fouten, en een grens aan het aantal staven;
 *   5. de IFC-uitvoer: het blad in het projectbestand en in de STEP;
 *   6. de teksten in beide talen, zonder uitkomsten van het blad in het document.
 *
 * Draaien:  node scripts/check-poer-ifcx.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { readFileSync } from "node:fs";
import { leesIfcx, ifcxNaarScene, bouwProjectStep } from "../packages/core/dist/index.js";
import { afwijkingen, STANDAARD } from "./lib/ifcx-specificatie.mjs";
import { laadTemplate } from "./lib/refcheck.mjs";

const { maakPoer, staafTelling } = await import("../packages/desktop/src/components/calc/poerDefinitie.ts");
const { tekenPoer, POER_KLEUREN } = await import("../packages/desktop/src/components/calc/poerTekening.ts");
const { poerIfcxDocument, poerIfcxKnopen, poerModelTelling, POER_MAX_PER_SOORT, POER_IFCX_SCHEMAS } = await import("../packages/desktop/src/components/calc/poerIfcx.ts");
const { projectIfcx, bladenVoorIfc, projectStep } = await import("../packages/desktop/src/store/projectIfcx.ts");
const { bouwProjectBestand, leesProjectBestand } = await import("../packages/desktop/src/store/projectBestand.ts");

let fouten = 0;
let getest = 0;
const waar = (wat, ok, detail = "") => {
  getest++;
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : ` -> ${detail}`}`);
};

const locale = (taal) => JSON.parse(readFileSync(new URL(`../packages/desktop/src/i18n/locales/${taal}/beelden.json`, import.meta.url), "utf8")).tweepaalspoer;
const talen = { nl: locale("nl"), en: locale("en") };

/** De invoer van de drie referentiegevallen, verzonnen, zoals in check-tweepaalspoer.mjs. */
const GEMEEN = {
  l_poer: "2100", b_poer: "580", h_poer: "900", a_hoh: "1400", e_p: "50", t_in: "50",
  paalvorm: "1", p_x: "350", p_y: "350", kolomvorm: "1", c_x: "400", c_y: "400",
  d_g: "16", c_o: "60", c_z: "40", n_t: "6", d_t: "25", s_t: "70", lagen: "1", vorm_t: "2", l_op: "600", D_m: "125",
  d_s: "12", s_s: "100", n_s: "4", n_z: "5", d_z: "12", n_b: "3", d_b: "12", n_hp: "2", d_hp: "12", n_dw: "3", d_dw: "16",
};
const GEVALLEN = {
  "geval 1, vierkant en omgebogen": GEMEEN,
  "geval 2, rond en twee lagen": { ...GEMEEN, paalvorm: "2", kolomvorm: "2", n_t: "8", lagen: "2", h_poer: "1100", l_poer: "2600", a_hoh: "1800", p_x: "450", c_x: "500" },
  "geval 3, rechte staaf": { ...GEMEEN, vorm_t: "1", n_t: "4", n_s: "3", n_hp: "0", n_z: "0", n_b: "0", n_dw: "0" },
};
const lees = (bron) => (naam) => {
  const w = bron[naam];
  return w === undefined || w === "" ? 0 : parseFloat(String(w).replace(",", "."));
};
const poerVan = (invoer) => maakPoer(lees(invoer));
const gelezen = (p, opties) => leesIfcx(JSON.parse(JSON.stringify(poerIfcxDocument(p, opties))));
const dichtbij = (a, b, tol = 2e-6) => Math.abs(a - b) <= tol;
const klasse = (els, k) => els.filter((e) => e.klasse === k);
const metNaam = (els, voorvoegsel) => els.filter((e) => e.naam.startsWith(voorvoegsel));
const kleurVan = (hex) => `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16)).toString(16).padStart(2, "0")).join("")}`;
const midden = (e, k) => (e.grenzen.min[k] + e.grenzen.max[k]) / 2;
const NL = talen.nl.model;

// ── 1. De specificatie ───────────────────────────────────────────────────────
console.log("\n1. Geldig IFCX");
for (const [naam, invoer] of Object.entries(GEVALLEN)) {
  const doc = poerIfcxDocument(poerVan(invoer));
  const a = afwijkingen(JSON.parse(JSON.stringify(doc)));
  waar(`${naam}: volgens de specificatie`, a.length === 0, a.slice(0, 4).join(" | "));
  const uit = leesIfcx(JSON.parse(JSON.stringify(doc)));
  waar(`${naam}: de lezer heeft geen meldingen`, uit.meldingen.length === 0, uit.meldingen.join(" | "));
  const eigen = new Set(doc.data.flatMap((k) => Object.keys(k.attributes ?? {})).filter((x) => !STANDAARD[x]));
  waar(`${naam}: wat de standaard niet kent, staat onder ocss:: met een schema`, [...eigen].every((x) => x.startsWith("ocss::") && POER_IFCX_SCHEMAS[x]), [...eigen].join(" "));
}

// ── 2. Het model tegen de definitie en de tekening ───────────────────────────
console.log("\n2. Het model volgt de definitie en de tekening");
function vergelijk(naam, invoer) {
  const p = poerVan(invoer);
  const { elementen: els } = gelezen(p);
  const t = staafTelling(p);

  const poer = klasse(els, "IfcFooting")[0];
  waar(`${naam}: één poer met de maten uit de invoer`, klasse(els, "IfcFooting").length === 1
    && dichtbij(poer.grenzen.max[0] - poer.grenzen.min[0], p.l / 1000) && dichtbij(poer.grenzen.max[1] - poer.grenzen.min[1], p.b / 1000) && dichtbij(poer.grenzen.max[2], p.h / 1000) && poer.grenzen.min[2] === 0);
  waar(`${naam}: het beton is doorzichtig, de staven zijn dekkend`, poer.opaciteit < 0.5 && klasse(els, "IfcReinforcingBar").every((e) => e.opaciteit === 1));

  const palen = klasse(els, "IfcPile");
  waar(`${naam}: twee palen op de hart-op-hart van de tekening`, palen.length === 2 && palen.every((e, i) => dichtbij(midden(e, 0), p.paalX[i] / 1000)));
  waar(`${naam}: de paal is ${p.paal.rond ? "rond" : "vierkant"} met de ingevoerde maat en inbedding`, palen.every((e) =>
    dichtbij(e.grenzen.max[0] - e.grenzen.min[0], p.paal.x / 1000) && dichtbij(e.grenzen.max[1] - e.grenzen.min[1], p.paal.y / 1000) && dichtbij(e.grenzen.max[2], p.paal.inbedding / 1000))
    && palen[0].vlakken.length > (p.paal.rond ? 20 : 5));
  const kolom = klasse(els, "IfcColumn")[0];
  waar(`${naam}: de kolom staat midden op de poer`, dichtbij(midden(kolom, 0), 0) && dichtbij(midden(kolom, 1), 0) && dichtbij(kolom.grenzen.min[2], p.h / 1000)
    && dichtbij(kolom.grenzen.max[0] - kolom.grenzen.min[0], p.kolom.x / 1000) && dichtbij(kolom.grenzen.max[1] - kolom.grenzen.min[1], p.kolom.y / 1000));

  // Elke staaf, in aantal en op zijn plaats. De tekening telt hetzelfde (data-staaf in de SVG).
  const { svg } = tekenPoer(p, talen.nl, 900);
  const inSvg = (s) => (svg.match(new RegExp(`data-staaf="${s}"`, "g")) ?? []).length;
  const trek = metNaam(els, NL.trekband);
  waar(`${naam}: ${t.trekband} trekbandstaven, gelijk aan de tekening`, trek.length === t.trekband && trek.length === inSvg("trekband"), `${trek.length}, ${inSvg("trekband")}`);
  const verwachtY = p.trekband.lagen.flatMap((l) => l.y.map((y) => y / 1000));
  waar(`${naam}: elke trekbandstaaf op de y van de definitie`, trek.every((e, i) => dichtbij(midden(e, 1), verwachtY[i])));
  const onder = p.trekband.lagen.flatMap((l, i) => l.y.map(() => [l.z, p.trekband.xEind[i]]));
  waar(`${naam}: de trekband op de hoogte en tot het eind van de definitie, met de staafdikte`, trek.every((e, i) =>
    dichtbij(e.grenzen.min[2], (onder[i][0] - p.trekband.d / 2) / 1000, 1e-4)
    && dichtbij(e.grenzen.max[0], (onder[i][1] + (p.trekband.omgebogen ? p.trekband.d / 2 : 0)) / 1000, 1e-4)));
  if (p.trekband.omgebogen) {
    waar(`${naam}: het been tot de hoogte van de definitie`, trek.every((e, i) => dichtbij(e.grenzen.max[2], (onder[i][0] + p.trekband.lOp) / 1000, 1e-4)));
  } else {
    waar(`${naam}: een rechte staaf heeft geen been`, trek.every((e, i) => dichtbij(e.grenzen.max[2], (onder[i][0] + p.trekband.d / 2) / 1000, 1e-4)));
  }

  const beugels = metNaam(els, NL.beugel);
  const perPlaats = Math.floor(p.beugels.y.length / 2) + p.beugels.y.length % 2;
  waar(`${naam}: ${t.beugels} beugelplaatsen × ${perPlaats}`, beugels.length === t.beugels * perPlaats && t.beugels === inSvg("beugel"), String(beugels.length));
  const xs = [...new Set(beugels.map((e) => midden(e, 0).toFixed(5)))].map(Number);
  waar(`${naam}: de beugels op de plaatsen uit de definitie`, xs.length === t.beugels && xs.every((x, i) => dichtbij(x, p.beugels.x[i] / 1000, 1e-5)));
  // Een gesloten beugel loopt om het hart van zijn benen, een los been (oneven snede) tot dat hart.
  const marge = (p.beugels.d / 2 + 0.1) / 1000;
  waar(`${naam}: de beugels van onder- tot bovenbeen`, beugels.every((e) =>
    Math.abs(e.grenzen.min[2] - p.beugels.zOnder / 1000) <= marge && Math.abs(e.grenzen.max[2] - p.beugels.zBoven / 1000) <= marge));

  const zij = metNaam(els, NL.zijstaaf);
  waar(`${naam}: ${t.zij} zijstaven, gelijk aan de tekening`, zij.length === t.zij && zij.length === inSvg("zij-dwars"));
  waar(`${naam}: de zijstaven op de y en z van de definitie`, zij.every((e) => dichtbij(Math.abs(midden(e, 1)), p.zij.y / 1000, 1e-5) && p.zij.z.some((z) => dichtbij(midden(e, 2), z / 1000, 1e-5))));
  const boven = metNaam(els, NL.bovenstaaf);
  waar(`${naam}: ${t.boven} bovenstaven, gelijk aan de tekening`, boven.length === t.boven && boven.length === inSvg("boven-dwars"));
  waar(`${naam}: de bovenstaven op de y en z van de definitie`, boven.every((e, i) => dichtbij(midden(e, 1), p.boven.y[i] / 1000, 1e-5) && dichtbij(midden(e, 2), p.boven.z / 1000, 1e-5)));
  const hp = metNaam(els, NL.haarspeld);
  waar(`${naam}: ${t.haarspelden} haarspelden, gelijk aan de tekening`, hp.length === t.haarspelden && hp.length === inSvg("haarspeld"));
  waar(`${naam}: de haarspelden op de x van de definitie`, hp.every((e, i) => dichtbij(midden(e, 0), p.haarspelden.x[i] / 1000, 1e-5)));

  const dw = metNaam(els, NL.dwarsstaaf);
  waar(`${naam}: ${t.dwarsstaven} dwarsstaven, gelijk aan de tekening`, dw.length === t.dwarsstaven && dw.length === inSvg("dwarsstaaf") && dw.length === inSvg("dwarsstaaf-langs"), `${dw.length}, ${inSvg("dwarsstaaf")}`);
  waar(`${naam}: de dwarsstaven op de x en z van de definitie, dwars door de poer`, dw.every((e, i) => dichtbij(midden(e, 0), p.dwarsstaven.x[i] / 1000, 1e-5) && dichtbij(midden(e, 2), p.dwarsstaven.z[i] / 1000, 1e-5)
    && dichtbij(e.grenzen.max[1], p.dwarsstaven.y / 1000, 1e-4) && dichtbij(e.grenzen.min[1], -p.dwarsstaven.y / 1000, 1e-4)));
  waar(`${naam}: de dwarsstaven in hun eigen kleur`, dw.every((e) => e.kleur === kleurVan(POER_KLEUREN.dwarsstaaf)));
  waar(`${naam}: de staven in de kleuren van de tekening`,
    trek.every((e) => e.kleur === kleurVan(POER_KLEUREN.trekband)) && beugels.every((e) => e.kleur === kleurVan(POER_KLEUREN.beugel))
    && [...zij, ...boven].every((e) => e.kleur === kleurVan(POER_KLEUREN.overig)) && hp.every((e) => e.kleur === kleurVan(POER_KLEUREN.haarspeld)));
  const scene = ifcxNaarScene({ elementen: els, meldingen: [] });
  const staafVlakken = scene.elementen.filter((e) => klasse(els, "IfcReinforcingBar").some((b) => b.pad === e.pad));
  waar(`${naam}: staven zonder omtreklijn, het beton met`, staafVlakken.every((e) => e.vlakken.every((v) => !v.rand)) && scene.elementen.find((e) => e.pad === poer.pad).vlakken.every((v) => v.rand));
  const telling = poerModelTelling(p);
  waar(`${naam}: de telling klopt met wat er staat`, telling.getoond === klasse(els, "IfcReinforcingBar").length && telling.totaal === telling.getoond);
}
for (const [naam, invoer] of Object.entries(GEVALLEN)) vergelijk(naam, invoer);

// ── 3. Een wijziging komt meteen door ────────────────────────────────────────
console.log("\n3. Een wijziging");
{
  const basis = poerVan(GEMEEN);
  const a = gelezen(basis).elementen;
  const verder = gelezen(poerVan({ ...GEMEEN, a_hoh: "1000" })).elementen;
  waar("paalafstand 1000: de palen schuiven mee", dichtbij(midden(klasse(verder, "IfcPile")[1], 0), 0.5) && !dichtbij(midden(klasse(a, "IfcPile")[1], 0), 0.5));
  waar("paalafstand 1000: de haarspelden schuiven mee", dichtbij(midden(metNaam(verder, NL.haarspeld)[0], 0), (-500 - 350 / 4) / 1000, 1e-5));
  const minder = gelezen(poerVan({ ...GEMEEN, n_t: "3" })).elementen;
  waar("3 staven in plaats van 6: 3 in het model", metNaam(minder, NL.trekband).length === 3 && metNaam(a, NL.trekband).length === 6);
  const hoger = gelezen(poerVan({ ...GEMEEN, h_poer: "1200" })).elementen;
  waar("hogere poer: de kolom staat erbovenop", dichtbij(klasse(hoger, "IfcColumn")[0].grenzen.min[2], 1.2));
  const zelfde = JSON.stringify(poerIfcxDocument(poerVan(GEMEEN)));
  waar("gelijke invoer geeft een gelijk document", zelfde === JSON.stringify(poerIfcxDocument(poerVan({ ...GEMEEN }))));
  waar("andere invoer geeft een ander document", zelfde !== JSON.stringify(poerIfcxDocument(poerVan({ ...GEMEEN, n_t: "5" }))));
  // De uitkomst van het blad hoort niet in het document: een herberekening bouwt niets opnieuw.
  // Alleen de dwarsstaven volgen de diagonaal; bij een andere arm schuiven die mee.
  const uitkomst = { z_u: 734, θ_g: 48, d_eff: 816, x_c: 100, l_t: 700 };
  const zonderDw = { ...GEMEEN, n_dw: "0" };
  waar("de uitkomsten van het blad veranderen de rest van het document niet", maakPoer(lees(zonderDw), uitkomst).model !== null && JSON.stringify(poerIfcxDocument(maakPoer(lees(zonderDw), uitkomst))) === JSON.stringify(poerIfcxDocument(poerVan(zonderDw))));
  const dwMetUitkomst = maakPoer(lees(GEMEEN), uitkomst).dwarsstaven;
  // Op 1/12 van de diagonaal: x = 100 + 700·11/12 = 741,67; z = 84,5 + 734/12 = 145,67.
  waar("de dwarsstaven volgen de arm uit het blad", dichtbij(dwMetUitkomst.x[6], 741.67, 0.01) && dichtbij(dwMetUitkomst.z[6], 145.67, 0.01), `${dwMetUitkomst.x[6]}, ${dwMetUitkomst.z[6]}`);
}

// ── 4. Onzin tijdens het typen ───────────────────────────────────────────────
console.log("\n4. Invoer die niet klopt");
{
  waar("geen volume: geen document", poerIfcxDocument(poerVan({ ...GEMEEN, l_poer: "0" })) === null && poerIfcxKnopen(poerVan({ ...GEMEEN, h_poer: "" }), "x") === null);
  const dicht = poerVan({ ...GEMEEN, s_s: "1", n_t: "900", n_z: "300", n_b: "500", n_hp: "400", n_s: "60", n_dw: "400" });
  const doc = poerIfcxDocument(dicht);
  const uit = leesIfcx(JSON.parse(JSON.stringify(doc)));
  const telling = poerModelTelling(dicht);
  waar(`een hart-op-hart van 1 mm blijft te tekenen (${uit.elementen.length} elementen)`, uit.meldingen.length === 0 && uit.elementen.length <= 500 && telling.getoond < telling.totaal, `${telling.getoond} van ${telling.totaal}`);
  waar("hooguit 120 beugels in het model", metNaam(uit.elementen, NL.beugel).length <= 120, String(metNaam(uit.elementen, NL.beugel).length));
  waar("per soort hooguit de grens", metNaam(uit.elementen, NL.trekband).length <= POER_MAX_PER_SOORT * 2 && metNaam(uit.elementen, NL.bovenstaaf).length === POER_MAX_PER_SOORT);
  const korf = doc.data.find((k) => k.attributes?.["ocss::calc::aantalStaven"] !== undefined);
  waar("het document zegt hoeveel er getoond zijn", korf.attributes["ocss::calc::aantalStaven"] === telling.totaal && korf.attributes["ocss::calc::aantalGetoond"] === telling.getoond);
  for (const [naam, invoer] of [
    ["klein been en grote doorn", { ...GEMEEN, l_op: "10", D_m: "500" }],
    ["dekking groter dan de poer", { ...GEMEEN, c_z: "2000", c_o: "2000" }],
    ["geen staven", { ...GEMEEN, n_t: "0", n_s: "0", n_z: "0", n_b: "0", n_hp: "0", n_dw: "0" }],
    ["diameter nul", { ...GEMEEN, d_t: "0", d_s: "0", d_z: "0", d_b: "0", d_hp: "0", d_dw: "0" }],
    ["geen palen of kolom", { ...GEMEEN, p_x: "0", p_y: "0", c_x: "0", c_y: "0" }],
    ["twee sneden", { ...GEMEEN, n_s: "2" }],
    ["één snede", { ...GEMEEN, n_s: "1" }],
  ]) {
    const d = poerIfcxDocument(poerVan(invoer));
    const u = leesIfcx(JSON.parse(JSON.stringify(d)));
    const kapot = /NaN|Infinity|null/.test(JSON.stringify(d.data.filter((k) => k.attributes?.["usd::usdgeom::mesh"])));
    waar(`${naam}: een geldig document`, !kapot && afwijkingen(JSON.parse(JSON.stringify(d))).length === 0 && u.meldingen.length === 0, afwijkingen(JSON.parse(JSON.stringify(d))).slice(0, 2).join(" | "));
  }
}

// ── 5. De IFC-uitvoer ────────────────────────────────────────────────────────
console.log("\n5. De IFC-uitvoer");
{
  const ex = { id: "ex-poer", naam: "Poer P1", templateId: "tweepaalspoer", source: laadTemplate("tweepaalspoer.ts"), waarden: { ...GEMEEN, betonklasse: "30", betonstaal: "2", milieu: "2", ondergrond: "1", F_Ed: "1800", F_fr: "1200", dwars: "0" }, elementen: [] };
  const project = { versie: 2, naam: "Verzonnen project", gegevens: {}, exemplaren: [ex] };
  const [blad] = bladenVoorIfc(project);
  waar("een poerblad krijgt zijn geometrie uit de invoer", !blad.fout && (blad.geometrie?.length ?? 0) > 0, blad.fout ?? "");
  const doc = projectIfcx(project);
  const a = afwijkingen({ ...doc, data: doc.data }).filter((x) => !x.includes("wortels") && !x.includes("ocss::"));
  waar("het projectbestand is geldig IFCX", a.length === 0, a.slice(0, 3).join(" | "));
  const uit = leesIfcx(doc);
  const p = poerVan(ex.waarden);
  waar("de lezer vindt de poer, de palen en de kolom", klasse(uit.elementen, "IfcFooting").length === 1 && klasse(uit.elementen, "IfcPile").length === 2 && klasse(uit.elementen, "IfcColumn").length === 1);
  waar("en elke staaf", klasse(uit.elementen, "IfcReinforcingBar").length === poerModelTelling(p).totaal);
  const step = projectStep(project);
  const tel = (t) => (step.match(new RegExp(`=${t}\\(`, "g")) ?? []).length;
  waar("de STEP heeft de poer, de palen en de kolom", tel("IFCFOOTING") === 1 && tel("IFCPILE") === 2 && tel("IFCCOLUMN") === 1, `${tel("IFCFOOTING")}, ${tel("IFCPILE")}, ${tel("IFCCOLUMN")}`);
  waar("de STEP heeft elke staaf als wapeningsstaaf", tel("IFCREINFORCINGBAR") === poerModelTelling(p).totaal, String(tel("IFCREINFORCINGBAR")));
  const staaf = step.match(/=IFCREINFORCINGBAR\((.*)\);/)?.[1] ?? "";
  // Veertien velden, met de diameter in millimeter op de plaats van NominalDiameter.
  const velden = staaf.replace(/'[^']*'/g, "T").split(",");
  waar("een wapeningsstaaf heeft de velden van IFC4X3, met zijn diameter in mm", velden.length === 14 && parseFloat(velden[9]) === 25 && velden[12] === ".NOTDEFINED.", staaf.slice(0, 160));
  waar("de samenstelling hangt aan de bouwlaag", tel("IFCELEMENTASSEMBLY") === 2 && step.includes("IFCRELCONTAINEDINSPATIALSTRUCTURE"));
  const geopend = bouwProjectStep(doc);
  waar("de STEP uit het document is dezelfde", geopend.length > 0 && (geopend.match(/=IFCREINFORCINGBAR\(/g) ?? []).length === tel("IFCREINFORCINGBAR"));
  const leeg = bladenVoorIfc({ gegevens: {}, exemplaren: [{ ...ex, id: "ex-leeg", waarden: {} }] })[0];
  waar("een blad dat nog niet is ingevuld, heeft geen geometrie", leeg.geometrie === undefined);
  // De geometrie is afgeleid: in het bestand staat ze, bij het openen telt alleen het blad.
  const bestand = bouwProjectBestand(project, bladenVoorIfc(project));
  waar("het projectbestand draagt de korf", bestand.includes("IfcReinforcingBar"));
  const terug = leesProjectBestand(bestand, "proef").exemplaren;
  waar("heropenen geeft het blad terug, zonder de geometrie als blad", terug.length === 1 && terug[0].source === ex.source && JSON.stringify(terug[0].waarden) === JSON.stringify(ex.waarden));
  waar("en daaruit weer hetzelfde model", JSON.stringify(poerIfcxDocument(poerVan(terug[0].waarden))) === JSON.stringify(poerIfcxDocument(p)));
}

// ── 6. De teksten ────────────────────────────────────────────────────────────
console.log("\n6. De teksten");
{
  const sleutels = (t) => JSON.stringify(Object.keys(t.model));
  waar("nl en en kennen dezelfde namen", sleutels(talen.nl) === sleutels(talen.en));
  waar("nl en en hebben de kop en de melding", ["modelKop", "modelBeperkt"].every((k) => talen.nl[k] && talen.en[k]));
  const doc = poerIfcxDocument(poerVan(GEMEEN), { teksten: talen.en.model });
  const namen = doc.data.map((k) => k.attributes?.["bsi::ifc::prop::Name"]).filter(Boolean).join(" ");
  waar("het document in het Engels is Engels", !/Poer|Paal|Kolom|Beugel|Trekband|Haarspeld|Wapening/.test(namen), namen.slice(0, 200));
  const calcpad = (taal) => JSON.parse(readFileSync(new URL(`../packages/desktop/src/i18n/locales/${taal}/calcpad.json`, import.meta.url), "utf8")).ifcx.attribuut;
  waar("het paneel kent de nieuwe attributen in beide talen", ["diameter", "aantalStaven"].every((k) => calcpad("nl")[k] && calcpad("en")[k]));
  const inhoud = JSON.stringify(poerIfcxDocument(poerVan(GEMEEN)));
  waar("geen uitkomst of oordeel in het document", !/unityCheck|toetsen|voldoet/.test(inhoud));
}

console.log(`\nTweepaalspoer-model: ${getest} controles, ${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
