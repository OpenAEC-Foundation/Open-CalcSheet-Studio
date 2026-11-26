/**
 * De gekozen waarden uit de nationale bijlage per blad (components/calc/nbKeuzes.ts en
 * NbKeuzesTabel in BladNormen.tsx).
 *
 * Een blad merkt een waarde met een commentaarregel `//@nb naam artikel`. Wat er moet gelden:
 *   - het merkteken verandert niets aan het rekenen (het is commentaar);
 *   - de waarde is de laatste uitkomst van die naam, ook als hij verborgen staat (#hide);
 *   - een merkteken in een tak die niet geldt, telt niet mee (de ligger merkt γ_M0 en γ_M1
 *     voor staal; bij hout staan ze er niet);
 *   - K_FI, windgebied en terreincategorie uit de projectgegevens tellen mee als het blad
 *     ze noemt (niet als ze alleen in commentaar staan);
 *   - op papier alleen bij een blad met een merkteken; een blad zonder blijft gelijk;
 *   - de tabel noemt de nationale bijlage die het project voor de normen van het blad
 *     vastlegt (projectNormen.ts).
 *
 * Handwerk: de ligger in staal heeft γ_M0 = γ_M1 = 1,0 (NB bij NEN-EN 1993-1-1, 6.1(1)); de
 * balklaag in categorie A (vloeren in woningen) ψ_0 = 0,4 en ψ_2 = 0,3 (NB.2 – A1.1).
 *
 * Draaien:  node scripts/check-nb-keuzes.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { parse, evaluate, evaluateMetScope } from "../packages/core/dist/index.js";
import { leesNbKeuzes, nbMerktekens, projectNbKeuzes } from "../packages/desktop/src/components/calc/nbKeuzes.ts";
import { legeGegevens, projectScope } from "../packages/desktop/src/store/projectGegevens.ts";
import { NORMEN_SLEUTEL, normenTekst } from "../packages/desktop/src/store/projectNormen.ts";
import { ligger } from "../packages/desktop/src/templates/ligger.ts";
import { balklaag } from "../packages/desktop/src/templates/balklaag.ts";

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};

const reken = (bron, waarden = {}, scope = {}) => evaluateMetScope(parse(bron), waarden, scope);

console.log("Merktekens");
const BRON = `a = 2
//@nb a 6.1(1) opm. 2B
#hide
b = 3 kN
#show
//@nb b NB.4
#if a > 5
c = 1
#end if
//@nb c 7.2
V_b,0 = 27 m/s
//@nb V_b,0 4.2(1)
//@nb a 6.1(2)
`;
const merken = nbMerktekens(BRON);
meld(merken.length === 4 && merken.find((m) => m.naam === "a")?.artikel === "6.1(2)", "een naam die twee keer gemerkt is: de laatste", JSON.stringify(merken));
const zonder = evaluate(parse(BRON.replace(/^\/\/@nb.*$/gm, "")), {});
const met = evaluate(parse(BRON), {});
meld(JSON.stringify(zonder) === JSON.stringify(met), "het merkteken verandert niets aan het rekenen");
const r = reken(BRON);
const k = Object.fromEntries(leesNbKeuzes(BRON, r.nodes, r.scope).map((x) => [x.naam, x]));
meld(k.a?.waarde === "2", "a = 2 uit de uitwerking", JSON.stringify(k.a));
meld(k.b?.waarde === "3 kN", "b = 3 kN uit de scope, want verborgen", JSON.stringify(k.b));
meld(!("c" in k), "c staat in een tak die niet geldt: niet in de tabel");
meld(k["V_b,0"]?.waarde === "27 m / s", "V_b,0 met een komma in de index", JSON.stringify(k["V_b,0"]));
meld(leesNbKeuzes("x = 1\n", reken("x = 1\n").nodes).length === 0, "zonder merkteken: niets");

console.log("\nUit de projectgegevens");
const scope = projectScope({ ...legeGegevens(), CC: "3" });
const p = projectNbKeuzes("γ_G = 1.2*K_FI\nq = windgebied\n// terreincategorie alleen in commentaar\n", scope);
meld(p.length === 2 && p[0].naam === "K_FI" && p[0].waarde === "1.1" && p[0].project, "K_FI = 1,1 bij CC3, uit de projectgegevens", JSON.stringify(p));
meld(p[1]?.naam === "windgebied" && p[1].waarde === "2", "windgebied 2", JSON.stringify(p[1]));
meld(!p.some((x) => x.naam === "terreincategorie"), "een naam alleen in commentaar telt niet");
meld(projectNbKeuzes("K_FIX = 1\n", scope).length === 0, "K_FIX is geen K_FI");

console.log("\nDe modules");
const staal = reken(ligger, { materiaal: "2" }, projectScope(legeGegevens()));
const ks = Object.fromEntries(leesNbKeuzes(ligger, staal.nodes, staal.scope).map((x) => [x.naam, x.waarde]));
meld(ks["γ_M0"] === "1" && ks["γ_M1"] === "1", "ligger in staal: γ_M0 = γ_M1 = 1,0", JSON.stringify(ks));
const hout = reken(ligger, { materiaal: "1" }, projectScope(legeGegevens()));
meld(leesNbKeuzes(ligger, hout.nodes, hout.scope).length === 0, "ligger in hout: geen γ_M0 en γ_M1");
const bl = reken(balklaag, {}, projectScope(legeGegevens()));
const kb = Object.fromEntries(leesNbKeuzes(balklaag, bl.nodes, bl.scope).map((x) => [x.naam, x.waarde]));
meld(kb["ψ_0"] === "0.4" && kb["ψ_2"] === "0.3", "balklaag, categorie A: ψ_0 = 0,4 en ψ_2 = 0,3", JSON.stringify(kb));

console.log("\nOp het scherm en op papier (de echte afdruk in jsdom)");
const { laadRapportAfdruk } = await import("./lib/rapport-html.mjs");
const m = await laadRapportAfdruk();
await m.i18next.changeLanguage("nl");
const blad = (id, source, waarden = {}) => ({ id, naam: `Blad ${id}`, templateId: "", source, waarden, elementen: [] });
const gegevens = {
  ...legeGegevens(),
  [NORMEN_SLEUTEL]: normenTekst([{ onderwerp: "staal", norm: "NEN-EN 1993-1-1", editie: "2006", nb: "NB:2016" }]),
};
m.useProjectStore.getState().laadProject({
  projectNaam: "Proef", gegevens, exemplaren: [blad("a", ligger, { materiaal: "2" }), blad("b", "\"Zonder merkteken\nx = 1*K_FI\n")],
});
const html = m.tekenUitdraai();
const tabellen = html.match(/<section class="nb-keuzes nb-keuzes-papier">[\s\S]*?<\/section>/g) ?? [];
meld(tabellen.length === 1, "op papier één tabel: alleen het blad met een merkteken", String(tabellen.length));
const t = tabellen[0] ?? "";
meld(t.includes("Gekozen waarden uit de nationale bijlage"), "met de kop");
meld(t.includes("<code>γ_M0</code></td><td>1</td><td>6.1(1)</td>"), "γ_M0 = 1 met het artikel", t.slice(0, 400));
meld(t.includes("NEN-EN 1993-1-1 NB:2016"), "met de nationale bijlage uit de projectgegevens");
meld(!t.includes("<code>K_FI</code>"), "geen K_FI: de ligger noemt hem niet (hij rekent met CC)");
await m.i18next.changeLanguage("en");
meld(m.tekenUitdraai().includes("Values chosen from the national annex"), "in het Engels");

console.log(fouten === 0 ? "\nKeuzes uit de nationale bijlage: alles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
