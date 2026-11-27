/**
 * De plek van een blad in het rapport (rapport/plek.ts): zijn paragraaf in hoofdstuk
 * Berekeningen en zijn uitwerking in bijlage A, met de pagina's uit het voorbeeld.
 *
 * Handwerk: een rapport met twee bladen. Pagina's uit een opgemaakt voorbeeld van 20
 * pagina's: hoofdstuk 6 op 9, 6.1 op 9, 6.2 op 10, bijlage A op 12, A.1 op 12, A.2 op 16.
 *   blad 1: 6.1 p. 9–9 (6.2 begint op 10), A.1 p. 12–15 (A.2 op 16)
 *   blad 2: 6.2 p. 10–11 (bijlage A op 12), A.2 p. 16–20 (het laatste stuk: tot het einde)
 *   een blad dat op dezelfde pagina eindigt als het volgende begint: één pagina
 *   zonder voorbeeld: de nummers, geen pagina's
 *
 * Draaien:  node scripts/check-rapport-plek.mjs
 */
import { plekVanBlad, paginasVan } from "../packages/desktop/src/rapport/plek.ts";
import { inhoudVoorPaneel, bijlageBladAnker } from "../packages/desktop/src/rapport/opzet.ts";
import { standaardRapport } from "../packages/desktop/src/rapport/model.ts";

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};
const gelijk = (wat, kreeg, verwacht) => meld(JSON.stringify(kreeg) === JSON.stringify(verwacht), wat, `${JSON.stringify(kreeg)} ≠ ${JSON.stringify(verwacht)}`);

console.log("Met een eigen inhoud");
const regels = [
  { nummer: "6", titel: "Berekeningen", niveau: 1, anker: "berekeningen" },
  { nummer: "6.1", titel: "Ligger", niveau: 2, anker: "b1", bladId: "b1" },
  { nummer: "6.2", titel: "Kolom", niveau: 2, anker: "b2", bladId: "b2" },
  { nummer: "A", titel: "Uitgebreide uitwerking", niveau: 1, anker: "bijlage-A" },
  { nummer: "A.1", titel: "Ligger", niveau: 2, anker: "bijlage-blad-b1", bladId: "b1" },
  { nummer: "A.2", titel: "Kolom", niveau: 2, anker: "bijlage-blad-b2", bladId: "b2" },
];
const paginas = { berekeningen: 9, b1: 9, b2: 10, "bijlage-A": 12, "bijlage-blad-b1": 12, "bijlage-blad-b2": 16 };
const p1 = plekVanBlad(regels, "b1", paginas, 20);
gelijk("blad 1: paragraaf en uitwerking", p1.map((s) => [s.nummer, s.bijlage, s.van, s.tot]), [["6.1", false, 9, 9], ["A.1", true, 12, 15]]);
const p2 = plekVanBlad(regels, "b2", paginas, 20);
gelijk("blad 2: de paragraaf loopt tot bijlage A, de uitwerking tot het einde", p2.map((s) => [s.nummer, s.van, s.tot]), [["6.2", 10, 11], ["A.2", 16, 20]]);
gelijk("de pagina's om te markeren", [...paginasVan(p2)], [10, 11, 16, 17, 18, 19, 20]);
gelijk("zelfde pagina als het volgende stuk: één pagina", plekVanBlad(regels, "b1", { ...paginas, b2: 9 }, 20)[0].tot, 9);
gelijk("zonder voorbeeld: alleen de nummers", plekVanBlad(regels, "b1").map((s) => [s.nummer, s.van ?? null]), [["6.1", null], ["A.1", null]]);
gelijk("zonder totaal: het laatste stuk één pagina", plekVanBlad(regels, "b2", paginas)[1].tot, 16);
gelijk("een blad dat er niet in staat", plekVanBlad(regels, "x", paginas, 20), []);

console.log("\nMet de inhoud van een echt rapport");
const r = standaardRapport("2026-11-27", {}, "nl");
const bladen = [
  { id: "ex-1", naam: "Ligger 1", koppen: [] },
  { id: "ex-2", naam: "Kolom 1", koppen: [] },
];
const echt = inhoudVoorPaneel(r, bladen);
const plek = plekVanBlad(echt, "ex-2");
meld(plek.length >= 1 && plek.some((s) => s.anker === bijlageBladAnker("ex-2") && s.bijlage), "het tweede blad staat in bijlage A", JSON.stringify(plek));
meld(plek.every((s) => s.titel === "Kolom 1"), "met zijn naam als titel");

console.log(fouten ? `\n${fouten} fout(en)` : "\nAlles in orde");
process.exit(fouten ? 1 : 0);
