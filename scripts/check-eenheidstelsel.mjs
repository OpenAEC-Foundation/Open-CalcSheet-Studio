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
import { parse, evaluate, exprToLatex, render } from "../packages/core/dist/index.js";

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

console.log("\nOpmaak");
const psi = exprToLatex("50 psi");
meld(psi.includes("\\text{psi}") && !psi.includes("\\psi"), "50 psi staat als eenheid, niet als ψ", psi);
const psi0 = exprToLatex("psi_0 * 2");
meld(psi0.includes("\\psi"), "de variabele ψ₀ blijft Grieks", psi0);
for (const e of ["kip", "lbf"]) {
  const l = exprToLatex(`3 ${e}`);
  meld(l.includes(`\\text{${e}}`), `3 ${e} staat als eenheid`, l);
}
const kipFt = uitkomst("F = 10 kip\na = 2 ft\nM = a*F", "M");
meld(/kip ft$/.test(kipFt ?? ""), "een moment in kip en ft: de lengte achteraan (kip ft), ook als ft eerst staat", kipFt);
const psiVar = exprToLatex("psi * 2");
meld(psiVar.includes("\\psi"), "een variabele psi (ψ) blijft Grieks", psiVar);

console.log("\nEigen eenheden");
gelijk(".kipf = 1000 lbf\nF = 3 kipf\nG = F to kN", "G", "13.34 kN", "een eigen eenheid uit een andere: 3 kipf = 13.34 kN");
gelijk(".EUR = 1\n.USD = 0.92 EUR\nP = 100 USD to EUR", "P", "92 EUR", "een nieuwe basiseenheid, met het getal vast aan de eenheid: 100 USD = 92 EUR");
const lek = uitkomst("F = 3 kipf", "F") ?? "";
meld(lek.startsWith("Error:"), "een eigen eenheid geldt niet in het volgende blad", lek);
/** De node van de definitieregel `.naam = …`. */
const definitie = (bron, naam) => alleNodes(evaluate(parse(bron))).find((n) => n.type === "eenheid-def" && n.name === naam);
const kN = definitie(".kN = 2 N", "kN");
meld(String(kN?.result ?? "").startsWith("Error:"), "een eigen eenheid met de naam van een bestaande geeft een fout", kN?.result);
gelijk(".kN = 2 N\nF = 1 kN to N", "F", "1000 N", "en de bestaande eenheid blijft wat hij was: 1 kN = 1000 N");
const dozijn = definitie(".dozijn = 12", "dozijn");
meld(String(dozijn?.result ?? "").startsWith("Error:"), "een getal zonder eenheid anders dan 1 geeft een fout", dozijn?.result);
const variabele = definitie("a = 2\n.a = 3 N", "a");
meld(String(variabele?.result ?? "").startsWith("Error:"), "een eigen eenheid met de naam van een variabele geeft een fout", variabele?.result);
for (const bron of [".5", ".Opmerking zonder is-teken"]) {
  const nodes = parse(bron);
  meld(!nodes.some((n) => n.type === "eenheid-def"), `"${bron}" is geen definitie van een eenheid`, JSON.stringify(nodes));
}
const html = render(evaluate(parse(".kipf = 1000 lbf")));
meld(html.includes("kipf") && html.includes("lbf") && !html.includes(".kipf") && !html.includes("Error"),
  "de definitieregel staat in beeld als eenheid, zonder de punt", html.slice(0, 200));

if (fouten > 0) {
  console.error(`\nEenheden: ${fouten} afwijking(en).`);
  process.exit(1);
}
console.log("\nEenheden: alles klopt.");
