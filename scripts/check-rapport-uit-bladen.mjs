/**
 * Het rapport opgebouwd uit de bladen (Rapport.uitBladen, rapport/uitBladen.ts en opzet.ts).
 *
 * Voorbeeld: vijf bladen in de projectboom.
 *   Inleiding            hoofdstuk               → 1
 *   Uitgangspunten       hoofdstuk, koppen: Bouwwerk, Materialen → 2, met 2.1 en 2.2
 *   Belastingen wind     paragraaf               → 2.3 (telt door na de koppen)
 *   Losse paragraaf      hoofdstuk               → 3
 *   Ligger               geen rol                → bijlage A.1
 *
 * Draaien:  node scripts/check-rapport-uit-bladen.mjs
 */
import { koppenUitBron, titelUitBron, uitwerkingInRapport, kopAnker } from "../packages/desktop/src/rapport/uitBladen.ts";
import { bouwOpzet, bijlagen, bladenInBijlage, inhoudsopgave, inhoudVoorPaneel, heeftBerekeningen } from "../packages/desktop/src/rapport/opzet.ts";
import { standaardRapport, normaliseerRapport } from "../packages/desktop/src/rapport/model.ts";
import { plekVanBlad } from "../packages/desktop/src/rapport/plek.ts";

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};
const gelijk = (wat, kreeg, verwacht) => meld(JSON.stringify(kreeg) === JSON.stringify(verwacht), wat, `${JSON.stringify(kreeg)} ≠ ${JSON.stringify(verwacht)}`);

console.log("Koppen uit de rekentekst");
const bron = '"Uitgangspunten — NEN-EN 1990\n\'Tekst met een # hekje\n# Bouwwerk\nCC = 2\n@svg\n# geen kop\n@end\n## Subkop\n# Materialen\n#if CC > 1\n#end if\n#global x = 1';
gelijk("koppenUitBron: alleen `# Kop`, niet in @svg, geen opdrachten", koppenUitBron(bron), ["Bouwwerk", "Materialen"]);
gelijk("titelUitBron", titelUitBron(bron), "Uitgangspunten — NEN-EN 1990");
gelijk("zonder titelregel: leeg", titelUitBron("# Kop\nx = 1"), "");

console.log("\nDe uitwerking in het rapport");
const html = "<h1>Uitgangspunten — NEN-EN 1990</h1><p>a</p><h1>Bouwwerk</h1><h2>Subkop</h2><h1>Materialen</h1><h1>Extra</h1>";
const genummerd = [
  { nummer: "2.1", titel: "Bouwwerk", anker: kopAnker("ex-2", 0) },
  { nummer: "2.2", titel: "Materialen", anker: kopAnker("ex-2", 1) },
];
const uit = uitwerkingInRapport(html, "Uitgangspunten — NEN-EN 1990", genummerd);
meld(!uit.includes("Uitgangspunten"), "de titelregel vervalt", uit);
meld(uit.includes('<h2 class="rpa-h2" data-inhoud="ex-2-kop-1">2.1 Bouwwerk</h2>'), "een kop krijgt zijn nummer en zijn anker", uit);
meld(uit.includes("<h2>Subkop</h2>"), "een subkop blijft zoals hij is");
meld(uit.includes('<h3 class="rpa-h3">Extra</h3>'), "een kop buiten de lijst blijft zonder nummer staan");
meld(uitwerkingInRapport("<h1>Kop</h1>", "", [{ nummer: "", titel: "Kop", anker: "a" }]) === '<h3 class="rpa-h3" data-inhoud="a">Kop</h3>',
  "in een paragraafblad: een kop zonder nummer");

console.log("\nDe indeling uit de bladen");
const bladen = [
  { id: "ex-1", naam: "Inleiding", rapportKoppen: [] },
  { id: "ex-2", naam: "Uitgangspunten", rapportKoppen: ["Bouwwerk", "Materialen"] },
  { id: "ex-3", naam: "Belastingen wind", rapportKoppen: ["Stuwdruk"] },
  { id: "ex-4", naam: "Losse paragraaf", rapportKoppen: [] },
  { id: "ex-5", naam: "Ligger", rapportKoppen: [] },
];
const basis = standaardRapport("2026-11-27", {}, "nl");
const r = { ...basis, uitBladen: true, bladRol: { "ex-1": "hoofdstuk", "ex-2": "hoofdstuk", "ex-3": "paragraaf", "ex-4": "hoofdstuk", "ex-5": "onzin" } };
const knopen = bouwOpzet(r, bladen);
gelijk("hoofdstukken in de volgorde van de boom", knopen.map((k) => [k.nummer, k.titel, k.niveau]), [["1", "Inleiding", 1], ["2", "Uitgangspunten", 1], ["3", "Losse paragraaf", 1]]);
gelijk("de koppen van een hoofdstuk zijn zijn eerste paragrafen", knopen[1].blad.genummerd.map((k) => [k.nummer, k.titel]), [["2.1", "Bouwwerk"], ["2.2", "Materialen"]]);
gelijk("een paragraafblad telt door", knopen[1].kinderen.map((k) => [k.nummer, k.titel]), [["2.3", "Belastingen wind"]]);
gelijk("en zijn koppen hebben geen nummer", knopen[1].kinderen[0].blad.genummerd.map((k) => k.nummer), [""]);
meld(knopen.every((k) => k.blad?.vult && k.blad.bijlage === ""), "elk hoofdstuk toont de uitwerking van zijn blad");
gelijk("een blad zonder (geldige) rol staat in bijlage A", bladenInBijlage(r, bladen).map((b) => [b.blad.id, b.nummer]), [["ex-5", "A.1"]]);
gelijk("bijlage A bestaat", bijlagen(r, bladen).map((b) => b.letter), ["A"]);
meld(!heeftBerekeningen(r) && !knopen.some((k) => k.inhoud), "geen vast hoofdstuk Berekeningen en geen formulieronderdelen");
gelijk("de inhoudsopgave", inhoudsopgave(knopen, true).map((i) => `${i.nummer} ${i.titel}`),
  ["1 Inleiding", "2 Uitgangspunten", "2.1 Bouwwerk", "2.2 Materialen", "2.3 Belastingen wind", "3 Losse paragraaf"]);
const paneel = inhoudVoorPaneel(r, bladen);
gelijk("in het zijpaneel opent elk hoofdstuk zijn blad", paneel.filter((p) => p.bladId).map((p) => [p.nummer, p.bladId]),
  [["1", "ex-1"], ["2", "ex-2"], ["2.3", "ex-3"], ["3", "ex-4"], ["A.1", "ex-5"]]);
gelijk("de plek van een paragraafblad", plekVanBlad(paneel, "ex-3").map((s) => s.nummer), ["2.3"]);
gelijk("een paragraaf zonder hoofdstuk erboven is zelf een hoofdstuk",
  bouwOpzet({ ...r, bladRol: { "ex-1": "paragraaf" } }, bladen).map((k) => [k.nummer, k.niveau]), [["1", 1]]);
gelijk("geen blad met een rol: alles in bijlage A", [bouwOpzet({ ...r, bladRol: {} }, bladen).length, bladenInBijlage({ ...r, bladRol: {} }, bladen).length], [0, 5]);

console.log("\nUit en weer aan");
const uitgezet = { ...r, uitBladen: undefined };
meld(bouwOpzet(uitgezet, bladen).some((k) => k.id === "uitgangspunten"), "uitgezet: de vaste hoofdstukken zijn terug");
gelijk("en de rollen blijven bewaard", uitgezet.bladRol["ex-3"], "paragraaf");
const terug = normaliseerRapport(JSON.parse(JSON.stringify(r)));
const gelezen = terug.rapport ?? terug;
gelijk("opslaan en openen", [gelezen.uitBladen, gelezen.bladRol["ex-2"]], [true, "hoofdstuk"]);
const oud = normaliseerRapport(JSON.parse(JSON.stringify(basis)));
gelijk("een rapport van vroeger: niet uit bladen", [(oud.rapport ?? oud).uitBladen ?? null, (oud.rapport ?? oud).bladRol], [null, {}]);

console.log(fouten ? `\n${fouten} fout(en)` : "\nAlles in orde");
process.exit(fouten ? 1 : 0);
