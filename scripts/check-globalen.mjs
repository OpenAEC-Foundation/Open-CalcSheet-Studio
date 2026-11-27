/**
 * Globale variabelen: `#global` in een blad (core/src/globaal.ts, rekenen/globalen.ts).
 * Wat een blad tussen `#global` en `#end global` toekent, kent elk ander blad.
 *
 * Handberekening:
 *   blad "Belastingen": g_v1 = 0,25 + 0,18 = 0,43 kN/m², q_k1 = 2,5 kN/m² (invoer 3 → 3 kN/m²),
 *                       ψ_0 = 0,7 (één regel), los = 1 m (niet globaal)
 *   blad "Ligger":      q_Ed = (1,2·0,43 + 1,5·3)·1 m = 5,016 kN/m, M = q_Ed·(5 m)²/8 = 15,675 kNm
 *   blad "Kolom":       N = M / 1 m = 15,675 kN (komt van het blad erboven)
 *   blad "Eerder":      gebruikt M, staat bovenaan: rekent bij de globalen zonder M (melding),
 *                       maar kent M daarna wel, net als elk blad
 *   twee bladen met dezelfde naam: de onderste geldt, de naam staat in `dubbel`
 *
 * Draaien:  node scripts/check-globalen.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { parse, evaluateMetScope, globaleNamen, globaleRegels, haalGlobaalWeg, heeftGlobaal, waardeAlsRekentekst } from "../packages/core/dist/index.js";
import { globalenVan } from "../packages/desktop/src/rekenen/globalen.ts";
import { projectTekstVan } from "../packages/desktop/src/store/projectBlad.ts";
import { projectScope, legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";
import { evalOptiesVan } from "../packages/desktop/src/store/projectEenheden.ts";

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};
const dichtbij = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const in_ = (v, e) => (v && typeof v.toNumber === "function" ? v.toNumber(e) : NaN);

const belastingen = [
  '"Belastingen',
  "#global",
  "g_v1 = 0.25 kN/m^2 + 0.18 kN/m^2",
  "q_k1 = ?{2.5} kN/m^2",
  "f(x) = x^2",
  "#end global",
  "#global ψ_0 = 0.7",
  "los = 1 m",
].join("\n");

console.log("Lezen");
meld(JSON.stringify(globaleNamen(belastingen)) === JSON.stringify(["g_v1", "q_k1", "ψ_0"]),
  "globaleNamen: blok en losse regel, geen functie en niets buiten het blok", JSON.stringify(globaleNamen(belastingen)));
meld(heeftGlobaal(belastingen) && !heeftGlobaal("'tekst over #global\nx = 1"), "heeftGlobaal: alleen een regel die met #global begint");
const zonder = haalGlobaalWeg(belastingen);
meld(zonder.split("\n").length === belastingen.split("\n").length && !/#global|#end global/i.test(zonder) && zonder.includes("ψ_0 = 0.7"),
  "haalGlobaalWeg: zelfde aantal regels, de opdrachten weg, de losse regel blijft");
meld(globaleNamen("#GLOBAL\nx = 1\n#End Global\ny = 2").join() === "x", "hoofdletterongevoelig, zoals #If en #End if");
meld(globaleNamen("#global\n'uitleg = geen toekenning\n\"Titel = ook niet\nV_b,0 = 2 kN\n#end global").join() === "V_b_0",
  "tekst en titel tellen niet; een komma-index zoals in de scope");

console.log("\nWaarden als rekentekst");
const s = evaluateMetScope(parse("a = 12.5 kN*m\nb = 210000 N/mm^2\nc = 2 kN/(m*s)\nd = 3\ne = \"tekst\"\nf = [1; 2]"), {}, {}, {}).scope;
meld(waardeAlsRekentekst(s.a) === "12.5 kN*m", "kN·m", waardeAlsRekentekst(s.a));
meld(waardeAlsRekentekst(s.b) === "210000 N/mm^2", "N/mm²", waardeAlsRekentekst(s.b));
meld(waardeAlsRekentekst(s.c) === "2 kN/(m*s)", "samengestelde noemer", waardeAlsRekentekst(s.c));
meld(waardeAlsRekentekst(s.d) === "3", "getal zonder eenheid");
const r = globaleRegels(s, ["a", "e", "f", "weg"]);
meld(r.regels.length === 1 && r.overgeslagen.join() === "e,f,weg", "tekst, matrix en een onbekende naam worden overgeslagen", JSON.stringify(r));

console.log("\nIn het project");
const g = legeGegevens();
const basis = { scope: projectScope(g), evalOpties: evalOptiesVan(g) };
const ligger = "#global\nq_Ed = (1.2*g_v1 + 1.5*q_k1)*1 m\nM = q_Ed*(5 m)^2/8\n#end global";
const kolom = "N = M / (1 m)";
const eerder = "#global\nM2 = 2*M\n#end global";
const bladen = [
  { naam: "Eerder", ref: "1", source: eerder, waarden: {} },
  { naam: "Belastingen", ref: "2", source: belastingen, waarden: { q_k1: "3" } },
  { naam: "Ligger", ref: "3", source: ligger, waarden: {} },
  { naam: "Kolom", ref: "4", source: kolom, waarden: {} },
];
const gl = globalenVan(bladen, basis);
meld(gl.herkomst.g_v1 === "Belastingen" && gl.herkomst.M === "Ligger", "herkomst per variabele", JSON.stringify(gl.herkomst));
meld(gl.bron.includes("q_k1 = 3 kN/m^2"), "de invoer van het blad telt (q_k1 = 3)", gl.bron);
meld(!gl.herkomst.los, "een variabele buiten #global blijft in zijn blad");
meld(!gl.herkomst.M2 && gl.overgeslagen.some((o) => o.blad === "Eerder" && o.naam === "M2"),
  "een blad bovenaan kent de globalen van de bladen eronder niet: M2 krijgt geen waarde", JSON.stringify(gl.overgeslagen));
meld(dichtbij(in_(evaluateMetScope(parse("t = q_Ed"), {}, {}, { project: { bron: gl.bron } }).scope.t, "kN/m"), 5.016), "Ligger: q_Ed = 5,016 kN/m");
meld(globalenVan(bladen, basis) === gl, "zelfde bladen: dezelfde uitkomst uit het geheugen");

const tekst = projectTekstVan(g, undefined, undefined, bladen);
const reken = (bron) => evaluateMetScope(parse(bron), {}, projectScope(g), { ...evalOptiesVan(g), project: tekst }).scope;
const k = reken(kolom);
meld(dichtbij(in_(k.N, "kN"), 15.675), "Kolom: N = M / 1 m = 15,675 kN", String(k.N));
const e = reken("x = M + 0 kN*m");
meld(dichtbij(in_(e.x, "kN*m"), 15.675), "ook een blad hoger in de boom kent M na het bepalen", String(e.x));
const eigen = reken("g_v1 = 1 kN/m^2\ny = g_v1");
meld(dichtbij(in_(eigen.y, "kN/m^2"), 1), "een blad mag een globale naam overschrijven");

const dubbel = globalenVan([
  { naam: "A", source: "#global x = 1", waarden: {} },
  { naam: "B", source: "#global x = 2", waarden: {} },
], basis);
meld(dubbel.dubbel.join() === "x" && dubbel.bron === "x = 2" && dubbel.herkomst.x === "B", "dezelfde naam in twee bladen: de onderste geldt", JSON.stringify(dubbel));
meld(globalenVan([{ source: "x = 1", waarden: {} }], basis).bron === "", "zonder #global: niets");

console.log(fouten ? `\n${fouten} fout(en)` : "\nAlles in orde");
process.exit(fouten ? 1 : 0);
