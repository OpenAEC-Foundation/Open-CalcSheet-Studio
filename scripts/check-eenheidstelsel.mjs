/**
 * Eenheden (issue #22): Amerikaanse eenheden, eigen eenheden in een blad en het
 * eenhedenstelsel dat alleen de weergave omrekent
 * (docs/superpowers/specs/2026-11-06-eenheden-design.md).
 *
 * Handberekening van de omrekeningen:
 *   1 psi = 6894,757 Pa, 1 ksi = 1000 psi    → 235 N/mm² = 235e6 / 6,894757e6 = 34,08 ksi
 *   1 lbf = 4,448222 N, 1 ft = 0,3048 m
 *   1 plf = lbf/ft = 14,594 N/m, 1 klf = 1000 plf  → 10 kN/m = 10000 / 14594 = 0,6852 klf
 *   1 psf = lbf/ft² = 47,880 Pa              → 2,4 kN/m² = 2400 / 47,880 = 50,13 psf
 *   1 ksf = 1000 psf                          → 100 kN/m² = 100000 / 47880 = 2,089 ksf
 *   1 pcf = lbf/ft³ = 157,09 N/m³             → 25 kN/m³ = 25000 / 157,09 = 159,1 pcf
 *
 * Draaien:  node scripts/check-eenheidstelsel.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { parse, evaluate } from "../packages/core/dist/index.js";

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};

/** Alle nodes van een doorgerekend blad, ook die in blokken. */
function alleNodes(lijst, uit = []) {
  for (const n of lijst) {
    uit.push(n);
    if (Array.isArray(n.children)) alleNodes(n.children, uit);
  }
  return uit;
}

/** De laatste uitkomst van `naam` in een blad. */
function node(bron, naam, opties) {
  const nodes = alleNodes(evaluate(parse(bron), {}, {}, opties));
  return nodes.filter((n) => n.name === naam && typeof n.result === "string").pop();
}
const uitkomst = (bron, naam, opties) => node(bron, naam, opties)?.result;

console.log("Amerikaanse eenheden");
const gelijk = (bron, naam, verwacht, wat) => {
  const u = uitkomst(bron, naam);
  meld(u === verwacht, wat ?? `${bron.split("\n").pop()} → ${verwacht}`, u);
};
gelijk("s = 235 N/mm^2\nx = s to ksi", "x", "34.08 ksi");
gelijk("q = 10 kN/m\nx = q to klf", "x", "0.6852 klf");
gelijk("p = 2.4 kN/m^2\nx = p to psf", "x", "50.13 psf");
gelijk("p = 100 kN/m^2\nx = p to ksf", "x", "2.089 ksf");
gelijk("q = 1 kN/m\nx = q to plf", "x", "68.52 plf");
gelijk("g = 25 kN/m^3\nx = g to pcf", "x", "159.1 pcf");
gelijk("p = 50 psf\nx = p to kN/m^2", "x", "2.394 kN / m^2", "een getal met een nieuwe eenheid wordt herkend: 50 psf → 2.394 kN/m²");
gelijk("ksi = 2\ny = 3*ksi", "y", "6", "een variabele met de naam van een nieuwe eenheid blijft een variabele");

if (fouten > 0) {
  console.error(`\nEenheden: ${fouten} afwijking(en).`);
  process.exit(1);
}
console.log("\nEenheden: alles klopt.");
