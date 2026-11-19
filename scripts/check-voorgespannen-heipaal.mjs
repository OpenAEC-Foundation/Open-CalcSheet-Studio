import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluate, parse } from "../packages/core/dist/index.js";

const source = readFileSync(new URL("../packages/desktop/src/templates/voorgespannen-heipaal.cpd", import.meta.url), "utf8");
const ast = parse(source);
function doorrekenen(waarden) {
  const verzamel = (nodes) => nodes.flatMap((node) => [node, ...verzamel(node.children ?? [])]);
  return verzamel(evaluate(ast, waarden));
}

// Referentiebladen: maatgevende lengte en dynamisch buitenste steunpuntsmoment.
// Handcontrole eerste profiel: q = 24 × 0,047871 kN/m; a = 0,207 × 18,5 m.
// Transport = 1,6 × q × a²/2; hijsen = 1,2 × q × a²/2.
const profielen = [
  [220, 4, 13.48, 10.11], [250, 5, 16.29, 17.68], [250, 4, 18.41, 13.80],
  [290, 6, 21.97, 23.84], [290, 5, 23.53, 17.65], [290, 5, 34.43, 34.86],
];
for (const [index, [zijde, strengen, transport, hijsen]] of profielen.entries()) {
  const nodes = doorrekenen({ profiel: String(index + 1), T_Ed: "150", M_Ed: "5" });
  const waarde = (naam) => parseFloat(nodes.find((n) => n.name === naam).result);
  assert.equal(waarde("M_tr"), transport);
  assert.equal(waarde("M_h"), hijsen);
  assert.equal(nodes.filter((n) => n.type === "plot" && n.svg.includes("<path")).length, 2);
  assert(nodes.some((n) => n.text?.includes("M33 147 h" + (zijde * 0.40 - 10) + " ")));
  const model = nodes.find((n) => n.type === "3d");
  assert.deepEqual(model.meldingen, []);
  assert.equal(model.scene.elementen[0].naar[0], zijde);
  const staven = model.scene.elementen.filter((e) => e.soort === "buis");
  const kop = staven.filter((e) => e.d === 12);
  assert.equal(staven.length - kop.length, strengen);
  assert.equal(kop.length, index === 5 ? 4 : 0);
  if (index === 5) {
    // Bij 150 kN: tussen (139; 6,3) en (167; 4,2) geeft 6,3 - 11/28 × 2,1.
    assert.equal(waarde("M_toel"), 5.475);
    assert.equal(waarde("T_Rd"), 222);
    assert(kop.every((e) => e.naar[2] === 240));
    assert(waarde("M_veld_t") > transport);
  }
}
const tekst = (t, m) => doorrekenen({ profiel: "6", T_Ed: t, M_Ed: m }).map((n) => n.text).join(" ");
assert.match(tekst("222", "0"), /Belastingpunt ligt binnen/);
assert.match(tekst("223", "0"), /Trekweerstand overschreden/);
assert.match(tekst("150", "6"), /Momentweerstand bij deze trekbelasting overschreden/);
console.log("Zes profielen, tekenmaten, momenten en grensgevallen van de trektoets gecontroleerd.");
