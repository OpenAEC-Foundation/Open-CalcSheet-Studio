/**
 * Hoofdstuk 5 als blad (rapport/belastingenAlsBlad.ts) en een blad dat een onderdeel van het
 * rapport invult (Rapport.bladVoor, rapport/opzet.ts).
 *
 * Handberekening:
 *   vloer: druklaag 0,05 m · 20 kN/m³ = 1,0 + kanaalplaat 2,9 = 3,9 kN/m²  (g_v1)
 *   gevel: 2,1 kN/m² · 3 m · 0,9 = 5,67 kN/m                               (g_w1)
 *   klasse A-vloer: 1,75 + 0,8 (lichte scheidingswanden) = 2,55 kN/m²      (q_k1)
 *   dak H bij 0°: 1,0 kN/m²                                                 (q_k2)
 * De rekentekst geeft via #global dezelfde waarden als het formulier (belastingBronnen.ts).
 *
 * Draaien:  node scripts/check-belastingen-blad.mjs   (vereist een gebouwde core)
 */
import { parse, evaluateMetScope, globaleNamen, globaleRegels } from "../packages/core/dist/index.js";
import { blijvendAlsRekentekst, veranderlijkAlsRekentekst, zonderOnderdeel } from "../packages/desktop/src/rapport/belastingenAlsBlad.ts";
import { belastingBronnen, metSymbolen } from "../packages/desktop/src/rapport/belastingBronnen.ts";
import { standaardRapport, normaliseerRapport } from "../packages/desktop/src/rapport/model.ts";
import { bouwOpzet, bijlagen, bladenInBijlage, inhoudVoorPaneel, invullendeBladen } from "../packages/desktop/src/rapport/opzet.ts";

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};
const gelijk = (wat, kreeg, verwacht) => meld(JSON.stringify(kreeg) === JSON.stringify(verwacht), wat, `${JSON.stringify(kreeg)} ≠ ${JSON.stringify(verwacht)}`);

const r0 = standaardRapport("2026-11-27", {}, "nl");
const belastingen = metSymbolen({
  ...r0.belastingen,
  vloerenDaken: [{ soort: "vlak", naam: "Vloer begane grond", lagen: [
    { naam: "Druklaag", d: "0,05", rho: "20", p: "" },
    { naam: "Kanaalplaat 200", d: "", rho: "", p: "2,9" },
  ] }],
  wanden: [{ soort: "gevel", naam: "Gevel metselwerk's", lagen: [{ naam: "Steen", p: "2,1", h: "3", vulling: "90%" }] }],
});

console.log("Rekentekst uit het formulier");
const kop = { vloerenDaken: "Vloeren en daken", wanden: "Wanden", zonderNaam: "zonder naam" };
const blijvend = blijvendAlsRekentekst(belastingen, kop);
const veranderlijk = veranderlijkAlsRekentekst(belastingen, "nl");
const globaal = (bron) => {
  const { scope } = evaluateMetScope(parse(bron), {}, {}, {});
  return globaleRegels(scope, globaleNamen(bron));
};
const gb = globaal(blijvend);
const gv = globaal(veranderlijk);
gelijk("5.5: g_v1 en g_w1 in kN/m² en kN/m", gb.regels, ["g_v1 = 3.9 kN/m^2", "g_w1 = 5.67 kN/m"]);
gelijk("5.4: q_k1 met de toeslag, q_k2 bij de dakhelling", gv.regels, ["q_k1 = 2.55 kN/m^2", "q_k2 = 1 kN/m^2"]);
const formulier = Object.fromEntries(belastingBronnen(belastingen).bronnen.map((b) => [b.symbool, b.waarde]));
const blad = Object.fromEntries([...gb.regels, ...gv.regels].map((r) => [r.split(" = ")[0], Number(r.split(" = ")[1].split(" ")[0])]));
gelijk("dezelfde waarden als het formulier", blad, formulier);
meld(!/'s\b/.test(blijvend.split("\n").find((r) => r.startsWith("## Gevel")) ?? "x") && blijvend.includes("metselwerk’s"),
  "een apostrof in een naam wordt een typografische (geen wissel naar tekst)");
meld(!blijvend.startsWith('"'), "geen titelregel: in het rapport staat de kop van het onderdeel erboven");
gelijk("zonder 5.5: alleen de opbouwen weg", [zonderOnderdeel(belastingen, "blijvend").vloerenDaken.length, zonderOnderdeel(belastingen, "blijvend").klassen.length], [0, belastingen.klassen.length]);
gelijk("zonder 5.4: alleen de klassen weg", [zonderOnderdeel(belastingen, "veranderlijk").klassen.length, zonderOnderdeel(belastingen, "veranderlijk").wanden.length], [0, 1]);

console.log("\nEen blad vult een onderdeel van het rapport");
const bladen = [{ id: "ex-1", naam: "Ligger 1" }, { id: "ex-2", naam: "Blijvende belastingen" }];
const zonder = { ...r0, belastingen };
const met = { ...zonder, belastingen: zonderOnderdeel(belastingen, "blijvend"), bladVoor: { blijvend: "ex-2" } };
const hoofdstuk5 = (r) => bouwOpzet(r, bladen).find((k) => k.id === "belastingen");
const k55 = hoofdstuk5(met).kinderen.find((k) => k.id === "blijvend");
const k55zonder = hoofdstuk5(zonder).kinderen.find((k) => k.id === "blijvend");
gelijk("5.5 blijft 5.5, met de kop van het onderdeel", [k55?.nummer, k55?.titel], [k55zonder?.nummer, k55zonder?.titel]);
gelijk("met de uitwerking van het blad op die plek", k55?.blad, { id: "ex-2", naam: "Blijvende belastingen", bijlage: "", vult: true });
meld(k55?.kinderen.length === 0 && !k55?.inhoud, "en niet meer het formulier van het rapport");
gelijk("het blad staat niet in Berekeningen", bouwOpzet(met, bladen).find((k) => k.id === "berekeningen")?.kinderen.map((k) => k.id), ["ex-1"]);
gelijk("en niet in bijlage A", bladenInBijlage(met, bladen).map((b) => b.blad.id), ["ex-1"]);
gelijk("invullendeBladen", [...invullendeBladen(met, bladen)], ["ex-2"]);
const paneel = inhoudVoorPaneel(met, bladen).find((r) => r.anker === "blijvend");
meld(paneel?.bladId === "ex-2", "in de inhoud opent 5.5 het blad", JSON.stringify(paneel));
const alleenVuller = [{ id: "ex-2", naam: "Blijvende belastingen" }];
meld(!bouwOpzet(met, alleenVuller).some((k) => k.id === "berekeningen") && bijlagen(met, alleenVuller).every((b) => b.letter !== "A"),
  "is dat het enige blad: geen hoofdstuk Berekeningen en geen bijlage A");
const weg = bouwOpzet(met, [bladen[0]]);
meld(!weg.find((k) => k.id === "belastingen").kinderen.some((k) => k.id === "blijvend"),
  "het blad is verwijderd: 5.5 valt terug op het (lege) formulier en valt dan weg");

console.log("\nOpslaan en openen");
const terug = normaliseerRapport(JSON.parse(JSON.stringify(met)));
gelijk("bladVoor blijft bewaard", (terug.rapport ?? terug).bladVoor, { blijvend: "ex-2" });
gelijk("een rapport zonder bladVoor krijgt een leeg", (normaliseerRapport(JSON.parse(JSON.stringify({ ...zonder, bladVoor: undefined }))).rapport ?? normaliseerRapport(JSON.parse(JSON.stringify({ ...zonder, bladVoor: undefined })))).bladVoor, {});

console.log(fouten ? `\n${fouten} fout(en)` : "\nAlles in orde");
process.exit(fouten ? 1 : 0);
