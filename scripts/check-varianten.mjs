/**
 * Controle van de varianten van een blad (packages/desktop/src/store/varianten.ts,
 * rekenen/varianten.ts, store/projectBestand.ts en het attribuut
 * `ocss::blad::varianten` in packages/core/src/ifcx/).
 *
 * Toetst:
 *   • het model: de invoer van een variant (het blad plus de eigen waarden van de
 *     gekozen velden), een nieuwe naam, een cel zetten en wissen, velden weghalen,
 *     plakken uit een werkmap, een reeks, en het lezen van wat van buiten komt;
 *   • het bestand: opslaan en openen geeft dezelfde varianten, met een schema.
 *
 * Draaien:  node scripts/check-varianten.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import {
  leesVarianten,
  nieuweVariant,
  plakBlok,
  reeksWaarden,
  variantInvoer,
  zetCel,
  zetVelden,
} from "../packages/desktop/src/store/varianten.ts";
import { bouwProjectBestand, leesProjectBestand, PROJECT_FORMAAT_VERSIE } from "../packages/desktop/src/store/projectBestand.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}${ok || !detail ? "" : "  -> " + detail}`);
  if (!ok) fouten++;
}
const json = (x) => JSON.stringify(x);

console.log("Model");
{
  const v1 = { id: "a", naam: "V1", waarden: { h: "250", x: "9" } };
  meld(json(variantInvoer({ b: "75", h: "225" }, v1, ["h"])) === json({ b: "75", h: "250" }),
    "de invoer van een variant: het blad, plus de eigen waarden van de gekozen velden");
  meld(json(variantInvoer({ b: "75", h: "225" }, { id: "a", naam: "V1", waarden: { h: "" } }, ["h"])) === json({ b: "75", h: "225" }),
    "een lege eigen waarde volgt het blad");
  meld(json(variantInvoer({ b: "75" }, { id: "a", naam: "V1", waarden: { L_9: "4" } }, ["L_9"])) === json({ b: "75", L_9: "4" }),
    "een veld dat het blad (nog) niet heeft, gaat gewoon mee: de kern kent het dan niet");

  meld(nieuweVariant([{ id: "a", naam: "V1", waarden: {} }, { id: "b", naam: "V3", waarden: {} }]).naam === "V2",
    "een nieuwe variant krijgt het eerste vrije nummer");
  const n1 = nieuweVariant([]);
  const n2 = nieuweVariant([n1]);
  meld(n1.id !== n2.id && /^var-/.test(n1.id) && json(n1.waarden) === "{}", "een nieuwe variant heeft een eigen id en geen eigen waarden");
  meld(json(nieuweVariant([], { h: "300" }).waarden) === json({ h: "300" }), "of de meegegeven waarden");

  const vs = {
    velden: ["h", "L_1"],
    uitkomsten: [],
    lijst: [{ id: "a", naam: "V1", waarden: { h: "250", L_1: "4,5" }, gezocht: ["h"] }],
  };
  const gewist = zetCel(vs, "a", "h", "");
  meld(!("h" in gewist.lijst[0].waarden) && gewist.lijst[0].waarden.L_1 === "4,5", "een lege cel wist de eigen waarde");
  meld(!gewist.lijst[0].gezocht?.includes("h"), "en het teken van optimaliseren");
  meld(vs.lijst[0].waarden.h === "250", "het oude object blijft ongemoeid (ongedaan maken)");
  const getypt = zetCel(vs, "a", "h", "275");
  meld(getypt.lijst[0].waarden.h === "275" && !getypt.lijst[0].gezocht?.includes("h"), "typen zet de waarde en haalt het teken van optimaliseren weg");
  const minder = zetVelden(vs, ["L_1"]);
  meld(json(minder.velden) === json(["L_1"]) && !("h" in minder.lijst[0].waarden) && !minder.lijst[0].gezocht?.length,
    "een veld weghalen wist zijn eigen waarden en zijn teken");

  const plak = plakBlok({ velden: ["h", "L_1"], uitkomsten: [], lijst: [{ id: "a", naam: "V1", waarden: {} }] },
    "250\t275\t300\r\n4,5\t\t5\r\n", 0, 0);
  meld(plak.lijst.length === 3, "plakken: varianten erbij als het blok verder loopt, geen lege door de laatste regel", String(plak.lijst.length));
  meld(json(plak.lijst.map((v) => v.waarden)) === json([{ h: "250", L_1: "4,5" }, { h: "275" }, { h: "300", L_1: "5" }]),
    "plakken: rijen zijn velden, kolommen varianten, een lege cel volgt het blad", json(plak.lijst.map((v) => v.waarden)));
  meld(json(plak.lijst.map((v) => v.naam)) === json(["V1", "V2", "V3"]), "de nieuwe varianten heten V2 en V3");
  const plakMidden = plakBlok(plak, "9", 1, 2);
  meld(plakMidden.lijst[2].waarden.L_1 === "9" && plakMidden.lijst[2].waarden.h === "300", "plakken vanaf een gekozen cel");
  const plakTeVeel = plakBlok(plak, "1\n2\n3", 1, 0);
  meld(plakTeVeel.lijst[0].waarden.L_1 === "1" && json(plakTeVeel.velden) === json(["h", "L_1"]), "rijen voorbij het laatste veld vallen weg");
  const plakFout = plakBlok(plak, "abc\t260", 0, 0, (veld, w) => (/^\d+$/.test(w) ? w : null));
  meld(plakFout.lijst[0].waarden.h === "250" && plakFout.lijst[1].waarden.h === "260", "een ongeldige waarde laat de cel zoals hij was");

  meld(json(reeksWaarden(3, 4.5, 0.5)) === json([3, 3.5, 4, 4.5]), "een reeks van–tot–stap, met het eind erbij");
  meld(json(reeksWaarden(0.1, 0.3, 0.1)) === json([0.1, 0.2, 0.3]), "zonder afrondingsfouten in de getallen", json(reeksWaarden(0.1, 0.3, 0.1)));
  meld(json(reeksWaarden(5, 3, 1)) === json([5, 4, 3]), "ook aflopend");
  meld(json(reeksWaarden(0, 1, 0)) === "[]" && json(reeksWaarden(0, 1, NaN)) === "[]", "een stap van nul of geen getal: niets");
  meld(reeksWaarden(0, 100, 1).length === 50, "hoogstens 50 waarden");

  meld(leesVarianten(null) === undefined && leesVarianten({}) === undefined, "niets bruikbaars: geen varianten");
  const gelezen = leesVarianten({
    velden: ["h", 3, "L_1"],
    uitkomsten: ["w_fin", null],
    opPapier: true,
    lijst: [
      { id: "a", naam: "V1", waarden: { h: 250, L_1: "4" }, gezocht: ["h", 2] },
      { id: "a", naam: "", waarden: "kapot" },
      "geen variant",
    ],
    zoek: { veld: "h", van: "150", tot: "400", stap: "25", grens: 0.9 },
  });
  meld(json(gelezen?.velden) === json(["h", "L_1"]) && json(gelezen?.uitkomsten) === json(["w_fin"]), "alleen tekst in velden en uitkomsten");
  meld(gelezen?.lijst.length === 2 && json(gelezen.lijst[0].waarden) === json({ L_1: "4" }), "alleen tekst als waarde", json(gelezen?.lijst));
  meld(gelezen?.lijst[1].id !== "a" && gelezen?.lijst[1].naam === "V2" && json(gelezen?.lijst[1].waarden) === "{}",
    "een dubbel id krijgt een nieuw id, een lege naam een vrije");
  meld(json(gelezen?.lijst[0].gezocht) === json(["h"]) && gelezen?.opPapier === true && gelezen?.zoek?.grens === 0.9, "teken, vinkje en zoekopdracht blijven");
  meld(leesVarianten({ velden: [], uitkomsten: [], lijst: [] }) === undefined, "lege varianten: geen varianten");
  meld(leesVarianten({ velden: ["h"], lijst: [], zoek: { veld: 3 } })?.zoek === undefined, "een kapotte zoekopdracht valt weg");
}

console.log("\nBestand");
{
  const varianten = {
    velden: ["h", "L_1"],
    uitkomsten: ["w_fin"],
    opPapier: true,
    zoek: { veld: "h", van: "150", tot: "400", stap: "25", grens: 1 },
    lijst: [
      { id: "var-1", naam: "V1", waarden: { h: "250" }, gezocht: ["h"] },
      { id: "var-2", naam: "lang", waarden: { L_1: "4,5", h: "275" } },
    ],
  };
  const project = (vs) => ({
    versie: PROJECT_FORMAAT_VERSIE,
    naam: "Varianten",
    gegevens: legeGegevens(),
    exemplaren: [{ id: "ex-1", naam: "Ligger", templateId: "", source: "h = ?*(mm)\nL_1 = ?*(m)", waarden: { h: "225" }, elementen: [], ...(vs ? { varianten: vs } : {}) }],
  });
  const tekst = bouwProjectBestand(project(varianten), null);
  const doc = JSON.parse(tekst);
  meld(Object.keys(doc.schemas ?? {}).includes("ocss::blad::varianten"), "het attribuut heeft een schema in het bestand");
  const terug = leesProjectBestand(tekst, "x").exemplaren[0].varianten;
  meld(json(terug) === json(leesVarianten(varianten)), "opslaan en openen: dezelfde varianten", json(terug));
  meld(terug?.lijst[1].waarden.L_1 === "4,5", "een komma blijft een komma");
  const zonder = bouwProjectBestand(project(undefined), null);
  meld(!zonder.includes("ocss::blad::varianten\":") || !JSON.stringify(JSON.parse(zonder).data).includes("ocss::blad::varianten"),
    "een blad zonder varianten schrijft het attribuut niet");
  meld(leesProjectBestand(zonder, "x").exemplaren[0].varianten === undefined, "en opent zonder varianten");
}

console.log(fouten ? `\n${fouten} fout(en)` : "\nAlles in orde");
process.exit(fouten ? 1 : 0);
