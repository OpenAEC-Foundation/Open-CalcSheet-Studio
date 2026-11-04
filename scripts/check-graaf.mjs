/**
 * Controle van het grafblad.
 *
 * Toetst, met de hand nagerekend (de som staat bij de verwachting):
 *   • lijsten met eenheden: reeks, aantal, som, element, per element rekenen;
 *   • codeblok: welke namen ingangen worden, eenheden, een naam die mathjs anders
 *     stil als eenheid leest, wat niet meerekent (`@js`);
 *   • een cirkel en een fout blijven bij de node en houden de rest niet tegen;
 *   • geometrie in mm, ook uit lijsten, en de scène voor het 3D-voorbeeld;
 *   • opslaan en heropenen: de graaf komt gelijk terug, met dezelfde uitkomsten;
 *   • papier: de SVG en de bekijk-tabel; oude bestanden blijven leesbaar;
 *   • de basisnodes voor rekenen, logica, lijsten en tekst, met de hand nagerekend;
 *   • een grafbestand inlezen: nodes, verbindingen, plek, codeblokken en wat niet meerekent.
 *
 * Draaien:  node scripts/check-graaf.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { analyseerRekenblok, rekenWaarde, uitkomstTekst } from "@ifc-calc/core";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  legeGraaf, leesGraaf, ontkoppel, verbind, verwijderNode, voegNodeToe, wisselGeheel, zetInvoer, zetNodeNaam,
} from "../packages/desktop/src/graaf/model.ts";
import { MAX_ELEMENTEN, NODE_SOORTEN, nodeDef, poortenVan, poortPlek } from "../packages/desktop/src/graaf/nodes.ts";
import { bekijkUitkomsten, rekenGraaf } from "../packages/desktop/src/graaf/rekenen.ts";
import { graafScene } from "../packages/desktop/src/graaf/scene.ts";
import { graafSvg } from "../packages/desktop/src/graaf/papier.ts";
import { GrafBestandFout, leesGrafBestand, vertaalCodeblok } from "../packages/desktop/src/graaf/grafBestand.ts";
import { voorbeeldVan } from "../packages/desktop/src/graaf/voorbeeld.ts";
import { waardeTekst } from "../packages/desktop/src/graaf/waarde.ts";
import { GRAAF_BLAD, isGraafBlad } from "../packages/desktop/src/store/graafBlad.ts";
import { isLosBlad } from "../packages/desktop/src/store/spreadsheetBlad.ts";
import { bouwProjectBestand, leesProjectBestand, normaliseerExemplaar, PROJECT_FORMAAT_VERSIE } from "../packages/desktop/src/store/projectBestand.ts";
import { bladenVoorIfc, projectIfcx, projectStep } from "../packages/desktop/src/store/projectIfcx.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";

let fouten = 0;
function meld(ok, tekst) {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}`);
  if (!ok) fouten++;
}
const dichtbij = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
/** Een waarde in een eenheid; een getal zonder eenheid blijft een getal. */
const inE = (w, e) => (typeof w === "number" ? w : w.toNumber(e));
const lijstGelijk = (w, verwacht, e) =>
  Array.isArray(w) && w.length === verwacht.length && w.every((x, i) => dichtbij(inE(x, e), verwacht[i]));

/** Bouwt een graaf uit `[id, soort, invoer]` en verbindingen `van.poort -> naar.poort`. */
function bouw(nodes, lijnen = []) {
  let g = legeGraaf();
  const ids = {};
  for (const [naam, soort, invoer] of nodes) {
    const r = voegNodeToe(g, soort, 0, 0);
    g = r.graaf;
    ids[naam] = r.id;
    for (const [k, w] of Object.entries(invoer ?? {})) g = zetInvoer(g, r.id, k, w);
  }
  for (const l of lijnen) {
    const [links, rechts] = l.split("->").map((d) => d.trim().split("."));
    g = verbind(g, { vanNode: ids[links[0]], vanPoort: links[1], naarNode: ids[rechts[0]], naarPoort: rechts[1] });
  }
  return { g, ids };
}
const code = (m, id) => m.nodes[id].fouten.map((f) => f.code);

console.log("\nLijsten met eenheden");
{
  // 0 m tot 6 m in stappen van 1,5 m: (6 − 0)/1,5 = 4 stappen, dus 5 elementen: 0; 1,5; 3; 4,5; 6.
  const { g, ids } = bouw(
    [
      ["r", "reeks", { van: "0 m", tot: "6 m", stap: "1.5 m" }],
      ["n", "aantal"],
      ["s", "som"],
      ["e", "element", { index: "3" }],
    ],
    ["r.lijst -> n.lijst", "r.lijst -> s.lijst", "r.lijst -> e.lijst"],
  );
  const m = rekenGraaf(g);
  meld(lijstGelijk(m.nodes[ids.r].waarden.lijst, [0, 1.5, 3, 4.5, 6], "m"), "reeks 0 m … 6 m, stap 1,5 m: 0; 1,5; 3; 4,5; 6 m");
  meld(m.nodes[ids.n].waarden.aantal === 5, "aantal = 5");
  // 0 + 1,5 + 3 + 4,5 + 6 = 15 m.
  meld(dichtbij(m.nodes[ids.s].waarden.som.toNumber("m"), 15), "som = 15 m");
  meld(dichtbij(m.nodes[ids.e].waarden.element.toNumber("m"), 3), "element 3 = 3 m (1-gebaseerd, zoals v.(3) in een blad)");
  meld(waardeTekst(m.nodes[ids.s].waarden.som) === "15 m", "de som wordt getoond als 15 m");

  // Gemengde eenheden: (6000 mm − 0 m)/1,5 m = 4 stappen; 4,5 m = 4500 mm.
  const gem = bouw([["r", "reeks", { van: "0 m", tot: "6000 mm", stap: "1.5 m" }]]);
  const rg = rekenGraaf(gem.g).nodes[gem.ids.r].waarden.lijst;
  meld(rg.length === 5 && dichtbij(rg[3].toNumber("mm"), 4500), "gemengde eenheden: 0 m … 6000 mm, stap 1,5 m, element 4 = 4500 mm");

  // 1/0,1 is in drijvende komma 10,000000000000002 of 9,99…: de bovengrens telt mee.
  const fijn = bouw([["r", "reeks", { van: "0", tot: "1", stap: "0.1" }]]);
  const rf = rekenGraaf(fijn.g).nodes[fijn.ids.r].waarden.lijst;
  meld(rf.length === 11 && dichtbij(rf[10], 1), "reeks 0 … 1, stap 0,1: 11 elementen, het laatste is 1");
  // 3 × 0,1 = 0,30000000000000004 in drijvende komma: elk element los, geen oplopende fout.
  meld(dichtbij(rf[7], 0.7, 1e-12), "element 8 is 0,7");

  const terug = bouw([["r", "reeks", { van: "10", tot: "0", stap: "-2.5" }]]);
  meld(lijstGelijk(rekenGraaf(terug.g).nodes[terug.ids.r].waarden.lijst, [10, 7.5, 5, 2.5, 0]), "aflopende reeks: 10 … 0, stap −2,5");

  const fout = (invoer) => {
    const b = bouw([["r", "reeks", invoer]]);
    return code(rekenGraaf(b.g), b.ids.r)[0];
  };
  meld(fout({ van: "0", tot: "1", stap: "0" }) === "stapNul", "stap 0 is een fout");
  meld(fout({ van: "0", tot: "10", stap: "-1" }) === "stapRichting", "een stap de verkeerde kant op is een fout");
  meld(fout({ van: "0 m", tot: "6 m", stap: "1 s" }) === "reeksEenheid", "stap in seconden bij een reeks in meters is een fout");
  meld(fout({ van: "0", tot: "6 m", stap: "1 m" }) === "reken", "van zonder eenheid bij tot in meters is een fout");
  meld(fout({ van: "0", tot: "1e7", stap: "1" }) === "teVeelElementen", `meer dan ${MAX_ELEMENTEN} elementen is een fout, geen vastgelopen app`);

  const buiten = bouw([["r", "reeks", { van: "1", tot: "3" }], ["e", "element", { index: "4" }]], ["r.lijst -> e.lijst"]);
  meld(code(rekenGraaf(buiten.g), buiten.ids.e)[0] === "indexBuitenBereik", "element buiten de lijst is een fout");

  // Index zelf een lijst: lijst [1, 2, 3], index [1, 3] → [1, 3].
  const multi = bouw(
    [["r", "reeks", { van: "1", tot: "3" }], ["i", "reeks", { van: "1", tot: "3", stap: "2" }], ["e", "element"]],
    ["r.lijst -> e.lijst", "i.lijst -> e.index"],
  );
  meld(lijstGelijk(rekenGraaf(multi.g).nodes[multi.ids.e].waarden.element, [1, 3]), "een lijst aan de index geeft per index een element");

  const leeg = bouw([["s", "som"]]);
  meld(code(rekenGraaf(leeg.g), leeg.ids.s)[0] === "ingangOntbreekt", "een som zonder lijst meldt de ontbrekende ingang");

  // Eenheden die niet optellen: 1 m + 1 s kan niet.
  const mis = bouw(
    [["c", "codeblok", { code: "a = 1 m\nb2 = 1 s" }], ["b", "bekijken"], ["s", "som"]],
    ["c.a -> s.lijst"],
  );
  meld(dichtbij(rekenGraaf(mis.g).nodes[mis.ids.s].waarden.som.toNumber("m"), 1), "de som van één waarde is die waarde");
}

console.log("\nPer element rekenen");
{
  // M = q·L²/8 met q = 5 kN/m: L = 2 m → 5·4/8 = 2,5; L = 4 m → 5·16/8 = 10; L = 6 m → 5·36/8 = 22,5 kNm.
  // Samen 2,5 + 10 + 22,5 = 35 kNm.
  const { g, ids } = bouw(
    [
      ["L", "reeks", { van: "2 m", tot: "6 m", stap: "2 m" }],
      ["q", "getal", { waarde: "5", eenheid: "kN/m" }],
      ["c", "codeblok", { code: "M = q*L^2/8" }],
      ["s", "som"],
    ],
    ["L.lijst -> c.L", "q.waarde -> c.q", "c.M -> s.lijst"],
  );
  const m = rekenGraaf(g);
  meld(lijstGelijk(m.nodes[ids.c].waarden.M, [2.5, 10, 22.5], "kN m"), "M = q·L²/8 per L: 2,5; 10; 22,5 kNm");
  meld(dichtbij(m.nodes[ids.s].waarden.som.toNumber("kN m"), 35), "de som over de lijst is 35 kNm");
  meld(waardeTekst(m.nodes[ids.s].waarden.som) === "35 kN m", "met de eenheid in beeld");

  // Twee lijsten lopen samen op tot de kortste op is: [1, 2, 3] + [10, 20] = [11, 22].
  const samen = bouw(
    [
      ["a", "reeks", { van: "1", tot: "3" }],
      ["b", "reeks", { van: "10", tot: "20", stap: "10" }],
      ["c", "codeblok", { code: "y = a + b" }],
    ],
    ["a.lijst -> c.a", "b.lijst -> c.b"],
  );
  meld(lijstGelijk(rekenGraaf(samen.g).nodes[samen.ids.c].waarden.y, [11, 22]), "twee lijsten lopen samen tot de kortste op is: 11; 22");

  // Een lijst van lijsten loopt dieper mee: reeks(van = [1, 2], tot = 3) = [[1, 2, 3], [2, 3]]; maal twee.
  const diep = bouw(
    [
      ["v", "reeks", { van: "1", tot: "2" }],
      ["r", "reeks", { tot: "3" }],
      ["c", "codeblok", { code: "y = x*2" }],
    ],
    ["v.lijst -> r.van", "r.lijst -> c.x"],
  );
  const d = rekenGraaf(diep.g).nodes[diep.ids.c].waarden.y;
  meld(d.length === 2 && lijstGelijk(d[0], [2, 4, 6]) && lijstGelijk(d[1], [4, 6]), "een lijst van lijsten geeft een lijst van lijsten");

  // Hele lijst als vector: som(1 m; 2 m; 3 m) = 6 m, lengte 3.
  let geheel = bouw(
    [["v", "reeks", { van: "1 m", tot: "3 m", stap: "1 m" }], ["c", "codeblok", { code: "t = sum(v)\nn = len(v)" }]],
    ["v.lijst -> c.v"],
  );
  geheel.g = wisselGeheel(geheel.g, geheel.ids.c, "v");
  const h = rekenGraaf(geheel.g).nodes[geheel.ids.c];
  meld(dichtbij(h.waarden.t.toNumber("m"), 6) && h.waarden.n === 3, "een ingang op hele lijst krijgt de vector: som 6 m, lengte 3");
  geheel.g = wisselGeheel(geheel.g, geheel.ids.c, "v");
  meld(rekenGraaf(geheel.g).nodes[geheel.ids.c].waarden.t.length === 3, "terug op per element geeft weer een lijst");

  // Een vector uit het blok wordt een gewone lijst.
  const vec = bouw([["c", "codeblok", { code: "v = [1; 2; 3] * 2 m" }], ["n", "aantal"]], ["c.v -> n.lijst"]);
  const mv = rekenGraaf(vec.g);
  meld(mv.nodes[vec.ids.n].waarden.aantal === 3 && lijstGelijk(mv.nodes[vec.ids.c].waarden.v, [2, 4, 6], "m"), "een vector uit een codeblok is een lijst: 2; 4; 6 m");
}

console.log("\nCodeblok");
{
  const a = (t) => analyseerRekenblok(t);
  const gelijk = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  meld(gelijk(a("M = q*L^2/8").ingangen, ["q", "L"]) && gelijk(a("M = q*L^2/8").uitgangen, ["M"]), "wat niet is gedefinieerd is ingang, wat wel is uitgang");
  meld(gelijk(a("q = 5 kN/m\nM = q*L^2/8").ingangen, ["L"]), "een naam die eerst wordt gedefinieerd is geen ingang");
  meld(gelijk(a("x = 2*y\ny = 3").ingangen, ["y"]), "gebruikt vóór de definitie: dan is het een ingang");
  // Dit zijn namen die mathjs zonder ingang stil als eenheid of constante leest.
  meld(gelijk(a("A = b*h\nN2 = 2 L\nz = e*F").ingangen, ["b", "h", "L", "e", "F"]), "b, h, L, e en F worden ingangen, geen bit, uur, liter, Euler of farad");
  meld(gelijk(a("x = EA*2 + 3 EA").ingangen, ["EA"]), "EA is een stijfheid, geen exa-ampère");
  meld(gelijk(a("v = 9.81 m/s^2\nq = 5 kN/m\nM = 2 kN*m\nA = 3 m^2\nc = 3 kW/(m^2*K)\nr = 1/2 m\nf = -5 N").ingangen, []), "eenheden achter een getal zijn geen ingangen");
  meld(gelijk(a("f = 2 m*L\ng = 5 kN/m*s").ingangen, ["L", "s"]), "een naam achter een maalteken blijft een ingang");
  meld(gelijk(a("x = (a + b) mm\ny = F/mm^2\nz = w to kN*m").ingangen, ["a", "b", "F", "w"]), "onmiskenbare eenheden en wat rechts van to staat zijn geen ingangen");
  meld(gelijk(a("y = max(a; pi)\nz = sqrt(b)").ingangen, ["a", "b"]), "functies en pi zijn geen ingangen");
  meld(gelijk(a("f(x) = x + c\nc = 2\ny = f(1)").ingangen, []) && gelijk(a("f(x) = x + c\nc = 2\ny = f(1)").uitgangen, ["c", "y"]), "een functie is geen uitgang, en mag vóór zijn namen staan");
  meld(gelijk(a("#for i = 1 : n\ns = i\n#loop").uitgangen, ["s"]) && gelijk(a("#for i = 1 : n\ns = i\n#loop").ingangen, ["n"]), "een lusteller is geen uitgang");
  meld(gelijk(a("#hide\nh2 = 3\n#show\nr = h2").uitgangen, ["r"]), "wat onder #hide staat is geen uitgang");
  meld(gelijk(a("#if L > 3 m\nz = 1\n#else\nz = 2\n#end if").ingangen, ["L"]) && gelijk(a("#if L > 3 m\nz = 1\n#else\nz = 2\n#end if").uitgangen, ["z"]), "#if: de voorwaarde telt mee, z is één uitgang");

  // Niet verbonden: geen uitkomst, dus ook niet stil met liters rekenen.
  const los = bouw([["c", "codeblok", { code: "q = 5 kN/m\nM = q*L^2/8" }]]);
  const ml = rekenGraaf(los.g).nodes[los.ids.c];
  meld(ml.fouten[0]?.code === "ingangOntbreekt" && ml.fouten[0].gegevens.naam === "L", "een losse ingang geeft een melding bij de node");
  meld(ml.waarden.M === undefined, "en geen uitkomst in kN L²/m");

  // In het veld van de ingang: q·L²/8 = 5·6²/8 = 22,5 kNm.
  const veld = bouw([["c", "codeblok", { code: "q = 5 kN/m\nM = q*L^2/8", L: "6 m" }]]);
  const mvv = rekenGraaf(veld.g).nodes[veld.ids.c];
  meld(mvv.fouten.length === 0 && dichtbij(mvv.waarden.M.toNumber("kN m"), 22.5), "een waarde in het veld van de ingang: M = 22,5 kNm");
  meld(dichtbij(mvv.waarden.q.toNumber("kN/m"), 5), "ook q is een uitgang");

  // Een ingang die `code` heet overschrijft de code niet: y = 3 · 2 = 6.
  let botsing = bouw([["c", "codeblok", { code: "y = code * 2" }]]);
  botsing.g = zetInvoer(botsing.g, botsing.ids.c, "@code", "3");
  const mb = rekenGraaf(botsing.g).nodes[botsing.ids.c];
  meld(mb.waarden.y === 6 && botsing.g.nodes[0].invoer.code === "y = code * 2", "een ingang met de naam code botst niet met de code zelf");

  // Eenheden werken door: σ = M/W = 22,5 kNm / (300 mm · (500 mm)²/6) = 22,5e6 Nmm / 12,5e6 mm³ = 1,8 N/mm².
  const door = bouw(
    [
      ["m", "getal", { waarde: "22.5", eenheid: "kN*m" }],
      ["c", "codeblok", { code: "W = b*h^2/6\nσ = M/W to N/mm^2", b: "300 mm", h: "500 mm" }],
    ],
    ["m.waarde -> c.M"],
  );
  const md = rekenGraaf(door.g).nodes[door.ids.c];
  meld(dichtbij(md.waarden["σ"].toNumber("N/mm^2"), 1.8), "σ = M/W = 1,8 N/mm², over de eenheden heen");
  meld(waardeTekst(md.waarden["σ"]) === "1.8 N / mm^2", "en zo getoond");

  // Geen JavaScript: een @js-blok komt niet bij de evaluator.
  const js = a("y = 2\n@js\nglobalThis.__graafJs = 1\n@end\nz = y + 1");
  meld(js.meldingen.includes("@js") && !js.fout, "@js in een codeblok wordt gemeld");
  const jg = bouw([["c", "codeblok", { code: "y = 2\n@js\nglobalThis.__graafJs = 1\n@end\nz = y + 1" }]]);
  const mj = rekenGraaf(jg.g).nodes[jg.ids.c];
  meld(mj.meldingen[0]?.code === "nietInBlok" && mj.waarden.z === 3, "de rest rekent gewoon: z = 3");
  meld(globalThis.__graafJs === undefined, "en de code is niet uitgevoerd");
  meld(a("@iframe https://voorbeeld.nl\nx = 1").meldingen.includes("@iframe"), "@iframe wordt ook gemeld");

  // Geometrie kan het blok niet in.
  const gb = bouw([["p", "punt"], ["c", "codeblok", { code: "y = x" }]], ["p.punt -> c.x"]);
  meld(code(rekenGraaf(gb.g), gb.ids.c)[0] === "geometrieInBlok", "geometrie aan een codeblok is een melding");

  // Poorten volgen de code, een slapende verbinding komt terug.
  let wissel = bouw([["g", "getal", { waarde: "2" }], ["c", "codeblok", { code: "y = x * 3" }]], ["g.waarde -> c.x"]);
  meld(rekenGraaf(wissel.g).nodes[wissel.ids.c].waarden.y === 6, "y = 2 · 3 = 6");
  wissel.g = zetInvoer(wissel.g, wissel.ids.c, "code", "y = a * 3");
  const slaap = rekenGraaf(wissel.g).nodes[wissel.ids.c];
  meld(slaap.fouten[0]?.gegevens.naam === "a" && wissel.g.verbindingen.length === 1, "een andere naam: de oude verbinding slaapt en blijft bewaard");
  wissel.g = zetInvoer(wissel.g, wissel.ids.c, "code", "y = x * 4");
  meld(rekenGraaf(wissel.g).nodes[wissel.ids.c].waarden.y === 8, "de naam terug: de verbinding doet weer mee, y = 8");

  // Tijdens het typen: een regel die nog niet af is laat de rest van het blok staan.
  const halfAf = bouw([["g", "getal", { waarde: "2" }], ["c", "codeblok", { code: "y = x * 3\nz = (y +" }]], ["g.waarde -> c.x"]);
  const mh = rekenGraaf(halfAf.g).nodes[halfAf.ids.c];
  meld(gelijk(mh.poorten.ingangen.map((p) => p.naam), ["x"]) && gelijk(mh.poorten.uitgangen, ["y", "z"]), "een regel die nog niet af is: de poorten blijven staan");
  meld(mh.waarden.y === 6 && mh.fouten[0]?.code === "blok" && mh.fouten[0].gegevens.naam === "z", "y rekent gewoon door en de fout staat bij z");

  // Een onleesbaar blok houdt niets tegen.
  const kapot = bouw([["c", "codeblok", { code: "y = (1 +" }], ["g", "getal", { waarde: "3" }]]);
  const mk = rekenGraaf(kapot.g);
  meld(mk.nodes[kapot.ids.c].fouten.length > 0 && mk.nodes[kapot.ids.g].waarden.waarde === 3, "een syntaxfout blijft bij de node");
}

console.log("\nCirkels en fouten");
{
  // a → b → a is een cirkel; c hangt eraan, d staat er los van; e rekent gewoon.
  const { g, ids } = bouw(
    [
      ["a", "codeblok", { code: "y = x + 1" }],
      ["b", "codeblok", { code: "y = x + 1" }],
      ["c", "codeblok", { code: "y = x + 1" }],
      ["d", "getal", { waarde: "2" }],
      ["e", "codeblok", { code: "y = x + 1" }],
    ],
    ["a.y -> b.x", "b.y -> a.x", "b.y -> c.x", "d.waarde -> e.x"],
  );
  const m = rekenGraaf(g);
  meld(code(m, ids.a)[0] === "cirkel" && code(m, ids.b)[0] === "cirkel", "de twee nodes op de cirkel krijgen de melding");
  meld(code(m, ids.c)[0] === "ingangZonderWaarde", "een node erachter meldt dat zijn ingang geen waarde heeft");
  meld(m.nodes[ids.e].waarden.y === 3 && m.nodes[ids.e].fouten.length === 0, "de rest rekent door: 2 + 1 = 3");

  const zelf = bouw([["a", "codeblok", { code: "y = x + 1" }]], ["a.y -> a.x"]);
  meld(code(rekenGraaf(zelf.g), zelf.ids.a)[0] === "cirkel", "een verbinding naar zichzelf is ook een cirkel");

  // Volgorde: de bron staat later in de lijst dan de node die hem gebruikt.
  const omgekeerd = bouw([["c", "codeblok", { code: "y = x * 2" }], ["g", "getal", { waarde: "21" }]], ["g.waarde -> c.x"]);
  meld(rekenGraaf(omgekeerd.g).nodes[omgekeerd.ids.c].waarden.y === 42, "de volgorde van rekenen volgt de verbindingen, niet de lijst");

  // Eén regel faalt: 1 m + 1 s kan niet; b2 = 2 blijft, en wat aan a hangt meldt het.
  const deel = bouw(
    [
      ["c", "codeblok", { code: "a = 1 m + 1 s\nb2 = 2" }],
      ["o", "codeblok", { code: "y = x" }],
      ["p", "codeblok", { code: "y = x * 2" }],
    ],
    ["c.a -> o.x", "c.b2 -> p.x"],
  );
  const md = rekenGraaf(deel.g);
  meld(code(md, deel.ids.c)[0] === "blok" && md.nodes[deel.ids.c].fouten[0].gegevens.naam === "a", "de mislukte regel staat bij de node, met zijn naam");
  meld(md.nodes[deel.ids.c].waarden.b2 === 2 && md.nodes[deel.ids.p].waarden.y === 4, "de andere uitgang rekent door: 2 · 2 = 4");
  meld(code(md, deel.ids.o)[0] === "ingangZonderWaarde", "en wat aan de mislukte uitgang hangt meldt het");

  // Eén element mislukt: geen lijst met gaten.
  const gat = bouw(
    [["r", "reeks", { van: "0", tot: "2" }], ["c", "codeblok", { code: "y = 1 m + x * 1 s" }]],
    ["r.lijst -> c.x"],
  );
  const mg = rekenGraaf(gat.g).nodes[gat.ids.c];
  meld(mg.waarden.y === undefined && mg.fouten.length > 0, "een mislukt element: de uitgang heeft geen waarde");

  const veld = bouw([["p", "punt", { x: "5 qq" }]]);
  meld(code(rekenGraaf(veld.g), veld.ids.p)[0] === "veld", "een onleesbaar veld is een melding bij de node");

  const onbekend = rekenGraaf({ versie: 1, nodes: [{ id: "n1", soort: "uit-de-toekomst", x: 0, y: 0 }], verbindingen: [] });
  meld(onbekend.nodes.n1.fouten[0].code === "onbekendeSoort", "een onbekende soort blijft staan, met een melding");
}

console.log("\nEén verbinding per ingang");
{
  const { g, ids } = bouw([["a", "getal", { waarde: "1" }], ["b", "getal", { waarde: "2" }], ["c", "codeblok", { code: "y = x" }]], ["a.waarde -> c.x"]);
  const nieuw = verbind(g, { vanNode: ids.b, vanPoort: "waarde", naarNode: ids.c, naarPoort: "x" });
  meld(nieuw.verbindingen.length === 1 && rekenGraaf(nieuw).nodes[ids.c].waarden.y === 2, "een nieuwe verbinding vervangt de oude");
  meld(ontkoppel(nieuw, ids.c, "x").verbindingen.length === 0, "ontkoppelen haalt hem weg");
  meld(verwijderNode(nieuw, ids.b).verbindingen.length === 0, "een node weg: zijn verbindingen ook");
  meld(g.verbindingen[0].vanNode === ids.a, "het oude object blijft ongemoeid, voor ongedaan maken");
}

console.log("\nGeometrie");
{
  // Lengtes in mm: 6 m = 6000 mm; een getal zonder eenheid telt in mm.
  const { g, ids } = bouw(
    [
      ["a", "punt", { x: "0 m", y: "1000", z: "3 m" }],
      ["b", "punt", { x: "6 m", z: "3000 mm" }],
      ["l", "lijn"],
      ["k", "balk", { b: "0.2 m", h: "400 mm" }],
      ["d", "doos", { dx: "2 m", dy: "1 m", dz: "500" }],
    ],
    ["a.punt -> l.van", "b.punt -> l.naar", "a.punt -> k.van", "b.punt -> k.naar", "a.punt -> d.hoek"],
  );
  const m = rekenGraaf(g);
  const p = m.nodes[ids.a].waarden.punt.p;
  meld(p[0] === 0 && p[1] === 1000 && p[2] === 3000, "punt (0 m; 1000; 3 m) = (0; 1000; 3000) mm");
  const k = m.nodes[ids.k].waarden.balk;
  meld(k.b === 200 && k.h === 400 && k.naar[0] === 6000, "balk van 6 m met 200 × 400 mm");
  meld(waardeTekst(k).includes("6082.76"), "lengte √(6000² + 1000²) = 6082,76 mm in het voorbeeld");
  const dd = m.nodes[ids.d].waarden.doos;
  meld(dd.hoek[1] === 1000 && dd.maat[0] === 2000 && dd.maat[2] === 500, "doos op de hoek van a: 2000 × 1000 × 500 mm");

  const s = graafScene(m.geometrie);
  const per = (soort) => s.elementen.filter((e) => e.soort === soort).length;
  meld(s.eenheid === "mm" && per("knoop") === 2 && per("staaf") === 1 && per("balk") === 1 && per("doos") === 1, "in de scène: 2 punten, 1 lijn, 1 balk, 1 doos");

  // Lijsten: 4 punten om de 2 m langs x, kolommen van 3 m erop.
  const rij = bouw(
    [
      ["x", "reeks", { van: "0 m", tot: "6 m", stap: "2 m" }],
      ["o", "punt"],
      ["t", "punt", { z: "3 m" }],
      ["k", "balk", { b: "200 mm", h: "200 mm" }],
      ["v", "bekijken"],
    ],
    ["x.lijst -> o.x", "x.lijst -> t.x", "o.punt -> k.van", "t.punt -> k.naar", "k.balk -> v.waarde"],
  );
  const mr = rekenGraaf(rij.g);
  const balken = mr.nodes[rij.ids.k].waarden.balk;
  meld(balken.length === 4 && balken[3].van[0] === 6000 && balken[3].naar[2] === 3000, "een lijst loopt mee tot in de balk: 4 kolommen, de laatste op x = 6000 mm");
  meld(graafScene(mr.geometrie).elementen.filter((e) => e.soort === "balk").length === 4, "een bekijk-node telt de geometrie niet dubbel");

  const verkeerd = bouw([["p", "punt", { x: "5 kN" }]]);
  meld(code(rekenGraaf(verkeerd.g), verkeerd.ids.p)[0] === "geenLengte", "een kracht als x is een melding");
  const nul = bouw([["a", "punt"], ["l", "lijn"]], ["a.punt -> l.van", "a.punt -> l.naar"]);
  meld(code(rekenGraaf(nul.g), nul.ids.l)[0] === "nulLengte", "een lijn van een punt naar zichzelf is een melding");
  const geenPunt = bouw([["g", "getal"], ["l", "lijn"]], ["g.waarde -> l.van"]);
  meld(code(rekenGraaf(geenPunt.g), geenPunt.ids.l)[0] === "ingangOntbreekt", "een lijn met één ingang mist de andere");
  const zonderHoek = bouw([["d", "doos"]]);
  meld(rekenGraaf(zonderHoek.g).nodes[zonderHoek.ids.d].waarden.doos.hoek[0] === 0, "een doos zonder hoek staat in de oorsprong");
}

console.log("\nDe node");
{
  meld(NODE_SOORTEN.every((s) => nodeDef(s).soort === s), `${NODE_SOORTEN.length} soorten, elk met een definitie`);
  meld(nodeDef("toString") === undefined, "een naam van Object is geen soort");
  const { g, ids } = bouw([["c", "codeblok", { code: "y = a + b\nz = a" }]]);
  const n = g.nodes.find((x) => x.id === ids.c);
  const pp = poortenVan(n);
  const p1 = poortPlek(n, pp, "in", "b");
  const p2 = poortPlek(n, pp, "uit", "z");
  meld(p1.x === n.x && p2.x > n.x && p1.y === p2.y, "ingang 2 en uitgang 2 staan op dezelfde rij");
  meld(poortPlek(n, pp, "in", "weg") === null, "een poort die er niet is heeft geen plek");

  const lang = bouw([["r", "reeks", { van: "1", tot: "20" }]]);
  const v = voorbeeldVan(rekenGraaf(lang.g).nodes[lang.ids.r]);
  meld(v.regels.length === 8 && v.rest === 12 && v.aantal === 20, "het voorbeeld toont 8 elementen en zegt hoeveel er nog zijn");
  const twee = bouw([["c", "codeblok", { code: "a = 1 m\nb2 = 2" }]]);
  const vt = voorbeeldVan(rekenGraaf(twee.g).nodes[twee.ids.c]);
  meld(vt.regels[0].label === "a" && vt.regels[0].tekst === "1 m" && vt.regels[1].tekst === "2", "bij meer uitgangen staat de naam ervoor");

  let naam = bouw([["b", "bekijken"]]);
  naam.g = zetNodeNaam(naam.g, naam.ids.b, "  Moment  ");
  meld(naam.g.nodes[0].naam === "Moment" && zetNodeNaam(naam.g, naam.ids.b, " ").nodes[0].naam === undefined, "een eigen naam, en leeg is weer geen naam");
}

console.log("\nOpslaan en heropenen");
{
  // De voorbeeldgraaf: drie overspanningen, momenten, som en een balk.
  const { g, ids } = bouw(
    [
      ["L", "reeks", { van: "2 m", tot: "6 m", stap: "2 m" }],
      ["q", "getal", { waarde: "5", eenheid: "kN/m", min: "0", max: "20", stap: "0.5" }],
      ["c", "codeblok", { code: "M = q*L^2/8" }],
      ["s", "som"],
      ["v", "bekijken"],
      ["a", "punt"],
      ["b", "punt", { x: "6 m" }],
      ["k", "balk"],
    ],
    ["L.lijst -> c.L", "q.waarde -> c.q", "c.M -> s.lijst", "s.som -> v.waarde", "a.punt -> k.van", "b.punt -> k.naar"],
  );
  const graaf = wisselGeheel(zetNodeNaam(g, ids.v, "Totaal <moment>"), ids.c, "q");
  const project = {
    versie: PROJECT_FORMAAT_VERSIE,
    naam: "Proef",
    gegevens: legeGegevens(),
    rapport: undefined,
    exemplaren: [
      { id: "ex-reken", naam: "Reken", templateId: "", source: "a = 2", waarden: {}, elementen: [] },
      { id: "ex-graaf", naam: "Momenten", templateId: GRAAF_BLAD, source: "", waarden: {}, elementen: [], graaf },
    ],
  };
  const bladen = bladenVoorIfc(project);
  const blad = bladen.find((b) => b.id === "ex-graaf");
  meld(blad.nodes.length === 0 && !blad.fout, "een grafblad wordt niet als rekentekst doorgerekend");

  const tekst = bouwProjectBestand(project, bladen);
  const terug = leesProjectBestand(tekst, "proef");
  const her = terug.exemplaren.find((e) => e.id === "ex-graaf");
  meld(isGraafBlad(her) && isLosBlad(her), "het blijft een grafblad");
  meld(JSON.stringify(her.graaf) === JSON.stringify(graaf), "de graaf komt precies zo terug");
  const voor = rekenGraaf(graaf);
  const na = rekenGraaf(her.graaf);
  meld(dichtbij(na.nodes[ids.s].waarden.som.toNumber("kN m"), 35) && waardeTekst(na.nodes[ids.s].waarden.som) === waardeTekst(voor.nodes[ids.s].waarden.som), "de uitkomst na heropenen is dezelfde: 35 kNm");
  meld(na.geometrie.length === voor.geometrie.length, "de geometrie ook");
  meld(!("graaf" in terug.exemplaren.find((e) => e.id === "ex-reken")), "een rekenblad krijgt geen graaf");

  const doc = projectIfcx(project, bladen);
  const attr = doc.data.find((k) => k.attributes?.["ocss::blad"]?.id === "ex-graaf").attributes;
  meld(attr["ocss::blad"].soort === "graaf", "in het IFCX staat de soort graaf");
  meld(Array.isArray(attr["ocss::blad::graaf"].nodes) && attr["ocss::blad::graaf"].verbindingen.length === 6, "de graaf staat in een eigen attribuut");
  meld(Array.isArray(attr["ocss::blad::graaf"].nodes.find((n) => n.soort === "getal").invoer), "de velden van een node als paren, volgens het schema");
  meld(!("ocss::blad::rekentekst" in attr) && !("ocss::blad::invoer" in attr), "zonder rekentekst en invoer");
  meld(doc.schemas["ocss::blad::graaf"] !== undefined, "het schema staat in het bestand");
  const step = projectStep(project, bladen);
  meld(step.includes("application/json") && step.includes("'Momenten'"), "de STEP noemt het blad, met het type");

  // Oudere bestanden en beschadigde graven.
  const oud = normaliseerExemplaar({ id: "o", naam: "Los", templateId: GRAAF_BLAD }, "n");
  meld(isGraafBlad(oud) && oud.graaf === undefined, "een grafblad zonder graaf blijft een grafblad");
  meld(normaliseerExemplaar({ id: "y", naam: "R", templateId: "", graaf: { nodes: [] } }, "n").graaf === undefined, "een rekenblad neemt geen graaf over uit een bestand");
  const bestandZonder = JSON.parse(tekst);
  for (const k of bestandZonder.data) delete k.attributes?.["ocss::blad::graaf"];
  meld(leesProjectBestand(JSON.stringify(bestandZonder), "proef").exemplaren.length === 2, "een bestand zonder het attribuut blijft leesbaar");
  const schoon = leesGraaf({
    nodes: [{ id: "n1", soort: "getal", x: "fout" }, { id: "n1", soort: "som" }, { soort: "som" }, { id: "n2", soort: "som", invoer: { a: 1, b: "x" } }],
    verbindingen: [
      { vanNode: "n1", vanPoort: "waarde", naarNode: "n9", naarPoort: "lijst" },
      { vanNode: "n1", vanPoort: "waarde", naarNode: "n2", naarPoort: "lijst" },
      { vanNode: "n2", vanPoort: "som", naarNode: "n2", naarPoort: "lijst" },
      { vanNode: 3 },
    ],
  });
  meld(schoon.nodes.length === 2 && schoon.nodes[0].x === 0, "dubbele ids en nodes zonder id vallen weg, een fout getal wordt 0");
  meld(schoon.verbindingen.length === 1 && schoon.verbindingen[0].vanNode === "n2", "per ingang één verbinding, de laatste telt; naar een onbekende node valt weg");
  meld(JSON.stringify(schoon.nodes[1].invoer) === '{"b":"x"}', "een veld dat geen tekst is valt weg");
  meld(leesGraaf(null) === undefined && leesGraaf({}) === undefined, "geen graaf: geen veld");
}

console.log("\nPapier");
{
  const { g, ids } = bouw(
    [
      ["r", "reeks", { van: "1 m", tot: "3 m", stap: "1 m" }],
      ["c", "codeblok", { code: "y = x * 2 <script>" }],
      ["s", "som"],
      ["v", "bekijken"],
      ["f", "codeblok", { code: "z = q" }],
      ["w", "bekijken"],
    ],
    ["r.lijst -> s.lijst", "s.som -> v.waarde", "f.z -> w.waarde"],
  );
  const graaf = zetNodeNaam(g, ids.v, "Totaal <a&b>");
  const m = rekenGraaf(graaf);
  const teksten = {
    naamVan: (n) => n.naam ?? n.soort,
    poort: (_n, p) => p,
    melding: (x) => x.code,
    meer: (n) => `+${n}`,
  };
  const { svg, breedte, hoogte } = graafSvg(graaf, m, teksten);
  meld(svg.startsWith("<svg") && breedte > 0 && hoogte > 0, "de graaf is een SVG met een maat");
  meld(svg.includes("Totaal &lt;a&amp;b&gt;") && !svg.includes("<a&b>") && !svg.includes("<script>"), "tekst wordt ontsnapt");
  meld(svg.includes("6 m"), "de uitkomst staat erin: 1 + 2 + 3 = 6 m");
  meld(svg.includes("ingangOntbreekt"), "een fout staat ook op papier");
  meld((svg.match(/<path d="M /g) ?? []).length >= 3, "de verbindingen zijn getekend");

  const tabel = bekijkUitkomsten(graaf, m);
  meld(tabel.length === 2 && tabel[0].naam === "Totaal <a&b>" && waardeTekst(tabel[0].waarde) === "6 m", "de bekijk-tabel: Totaal = 6 m");
  meld(tabel[0].bronSoort === "som", "met de soort van de bron, voor een bekijk-node zonder naam");
  meld(tabel[1].naam === "z" && tabel[1].fouten[0]?.code === "ingangZonderWaarde", "een bekijk-node zonder uitkomst komt er ook in, met de reden");
  meld(graafSvg(legeGraaf(), rekenGraaf(legeGraaf()), teksten).svg.startsWith("<svg"), "een lege graaf geeft ook een geldige SVG");
}

console.log("\nDe getallen en de rekenkern");
{
  meld(uitkomstTekst(rekenWaarde("5 kN/m")) === "5 kN / m", "een veld leest als de rechterkant van een toekenning");
  meld(rekenWaarde("0,5") === 0.5, "een komma is een decimaalteken");
  let fout = "";
  try {
    rekenWaarde("m");
  } catch (e) {
    fout = e.message;
  }
  meld(fout !== "", "een losse eenheid is geen waarde");
}

console.log("\nDe repo");
{
  // De teksten bestaan in beide talen.
  const hier = dirname(fileURLToPath(import.meta.url));
  const lees = (taal) => JSON.parse(readFileSync(join(hier, `../packages/desktop/src/i18n/locales/${taal}/werkruimte.json`), "utf8")).graaf;
  const nl = lees("nl");
  const en = lees("en");
  const sleutels = (o, pad = "") => Object.entries(o).flatMap(([k, w]) => (typeof w === "object" ? sleutels(w, `${pad}${k}.`) : [`${pad}${k}`]));
  const sn = sleutels(nl);
  const se = sleutels(en);
  meld(sn.length > 0 && sn.join() === se.join(), `alle ${sn.length} teksten staan in beide talen`);
  meld(NODE_SOORTEN.every((s) => nl.soort[s] && en.soort[s]), "elke soort heeft een naam");
  const codes = new Set();
  const map = join(hier, "../packages/desktop/src/graaf");
  for (const f of readdirSync(map)) {
    const pad = join(map, f);
    if (!statSync(pad).isFile()) continue;
    const bron = readFileSync(pad, "utf8");
    for (const r of bron.matchAll(/GraafFout\("(\w+)"/g)) codes.add(r[1]);
    for (const r of bron.matchAll(/code: "(\w+)"/g)) codes.add(r[1]);
    for (const r of bron.matchAll(/c\.meld\("(\w+)"/g)) codes.add(r[1]);
  }
  const zonder = [...codes].filter((c) => !nl.fout[c] || !en.fout[c]);
  meld(codes.size > 10 && zonder.length === 0, `elke melding heeft een tekst (${codes.size})${zonder.length ? `: mist ${zonder}` : ""}`);
}

// ── De basisnodes ───────────────────────────────────────────────────────────
console.log("\nDe basisnodes");
/** Rekent één node, met deze velden. Geeft de uitkomst van de node. */
const rekenEen = (soort, invoer = {}) => {
  const g = { versie: 1, nodes: [{ id: "n1", soort, x: 0, y: 0, invoer }], verbindingen: [] };
  return rekenGraaf(g).nodes.n1;
};
const tekstVan = (soort, invoer, poort = "uit") => waardeTekst(rekenEen(soort, invoer).waarden[poort]);
/** Een lijst uit een codeblok aan de ingang `lijst`, en eventuele velden. */
const metLijst = (soort, code, invoer = {}, poort = "uit") => {
  const g = {
    versie: 1,
    nodes: [{ id: "n1", soort: "codeblok", x: 0, y: 0, invoer: { code: `l = ${code}` } }, { id: "n2", soort, x: 0, y: 0, invoer }],
    verbindingen: [{ vanNode: "n1", vanPoort: "l", naarNode: "n2", naarPoort: "lijst" }],
  };
  return waardeTekst(rekenGraaf(g).nodes.n2.waarden[poort]);
};
meld(tekstVan("optellen", { a: "6 m", b: "1500 mm" }) === "7.5 m", "6 m + 1500 mm = 7,5 m", tekstVan("optellen", { a: "6 m", b: "1500 mm" }));
meld(/^5 kN \/ m$/.test(tekstVan("delen", { a: "10 kN", b: "2 m" })), "10 kN / 2 m = 5 kN/m", tekstVan("delen", { a: "10 kN", b: "2 m" }));
meld(tekstVan("macht", { a: "2", b: "10" }) === "1024", "2^10 = 1024");
meld(tekstVan("rest", { a: "7", b: "3" }) === "1", "7 mod 3 = 1");
meld(tekstVan("wortel", { waarde: "16" }) === "4", "√16 = 4");
meld(tekstVan("absoluut", { waarde: "-3 m" }) === "3 m", "|-3 m| = 3 m");
meld(tekstVan("afronden", { waarde: "2.6" }) === "3" && tekstVan("omlaag", { waarde: "2.6" }) === "2" && tekstVan("omhoog", { waarde: "2.1" }) === "3", "afronden, omlaag en omhoog");
meld(tekstVan("sinus", { waarde: "30" }) === "0.5", "sin 30 = 0,5: een getal telt in graden", tekstVan("sinus", { waarde: "30" }));
meld(tekstVan("cosinus", { waarde: "60 deg" }) === "0.5", "cos 60° = 0,5", tekstVan("cosinus", { waarde: "60 deg" }));
meld(tekstVan("minimum", { a: "1 m", b: "500 mm" }) === "500 mm", "min(1 m, 500 mm) = 500 mm", tekstVan("minimum", { a: "1 m", b: "500 mm" }));
meld(tekstVan("kleiner", { a: "1 m", b: "2000 mm" }) === "true", "1 m < 2000 mm", tekstVan("kleiner", { a: "1 m", b: "2000 mm" }));
meld(tekstVan("gelijk", { a: "1 m", b: "1000 mm" }) === "true" && tekstVan("ongelijk", { a: "1 m", b: "1000 mm" }) === "false", "1 m = 1000 mm");
meld(tekstVan("en", { a: "true", b: "false" }) === "false" && tekstVan("of", { a: "true", b: "false" }) === "true" && tekstVan("niet", { waarde: "true" }) === "false", "en, of, niet");
meld(tekstVan("als", { voorwaarde: "true", dan: "1 m", anders: "2 m" }) === "1 m" && tekstVan("als", { voorwaarde: "false", dan: "1 m", anders: "2 m" }) === "2 m", "als kiest op de voorwaarde");
meld(rekenEen("als", { voorwaarde: "3", dan: "1", anders: "2" }).fouten[0]?.code === "geenWaarOnwaar", "als zonder waar of onwaar: een melding bij de node");
meld(tekstVan("waarOnwaar", { waarde: "false" }, "waarde") === "false" && tekstVan("waarOnwaar", {}, "waarde") === "true", "waar of onwaar");
meld(/^3\.14/.test(tekstVan("pi", {})), "pi");
meld(tekstVan("reeksAantal", { van: "0 m", aantal: "3", stap: "2 m" }, "lijst") === "[0 m; 2 m; 4 m]", "reeks op aantal", tekstVan("reeksAantal", { van: "0 m", aantal: "3", stap: "2 m" }, "lijst"));
meld(rekenEen("reeksAantal", { van: "0", aantal: "1.5", stap: "1" }).fouten[0]?.code === "geenAantal", "een aantal is geheel");
meld(metLijst("gemiddelde", "[1, 2, 6]") === "3", "het gemiddelde van 1, 2 en 6 is 3");
meld(metLijst("grootste", "[1, 5, 2]") === "5" && metLijst("kleinste", "[4, 5, 2]") === "2", "grootste en kleinste");
meld(metLijst("eerste", "[1, 5, 2]") === "1" && metLijst("laatste", "[1, 5, 2]") === "2", "eerste en laatste");
meld(metLijst("omkeren", "[1, 5, 2]") === "[2; 5; 1]" && metLijst("sorteren", "[3, 1, 2]") === "[1; 2; 3]", "omkeren en sorteren");
meld(metLijst("plat", "[[1, 2], [3, 4]]") === "[1; 2; 3; 4]", "plat maken");
meld(metLijst("nemen", "[1, 2, 3]", { aantal: "2" }) === "[1; 2]" && metLijst("overslaan", "[1, 2, 3]", { aantal: "2" }) === "[3]", "nemen en overslaan");
meld(metLijst("element", "[7, 8, 9]", { index: "1" }, "element") === "7", "een nieuwe node telt vanaf 1");
meld(metLijst("element", "[7, 8, 9]", { index: "1", basis: "0" }, "element") === "8", "een ingelezen node vanaf 0");
meld(tekstVan("tekstenSamen", { a: "HEA", b: "200" }) === "HEA200", "teksten samenvoegen: een veld is letterlijk tekst");
meld(tekstVan("tekstenMetScheider", { scheider: "-", a: "a", b: "b" }) === "a-b", "teksten met scheider");
meld(tekstVan("vervangen", { tekst: "a.b.c", zoek: ".", door: "," }) === "a,b,c", "vervangen, elk voorkomen");
meld(tekstVan("splitsen", { tekst: "a;b", scheider: ";" }) === "[a; b]", "splitsen");
meld(tekstVan("hoofdletters", { tekst: "hea" }) === "HEA" && tekstVan("kleineLetters", { tekst: "HEA" }) === "hea" && tekstVan("tekstLengte", { tekst: "abc" }) === "3", "hoofdletters, kleine letters, lengte");
meld(tekstVan("tekstBevat", { tekst: "HEA 200", zoek: "200" }) === "true" && tekstVan("begintMet", { tekst: "HEA 200", zoek: "IPE" }) === "false", "bevat en begint met");
meld(tekstVan("naarGetal", { tekst: "12.5 kN" }) === "12.5 kN", "een tekst wordt een getal met eenheid");
{
  const g = {
    versie: 1,
    nodes: [
      { id: "a", soort: "punt", x: 0, y: 0, invoer: { x: "3000 mm", y: "4000 mm", z: "0 mm" } },
      { id: "b", soort: "punt", x: 0, y: 0, invoer: { x: "0 mm", y: "0 mm", z: "0 mm" } },
      { id: "l", soort: "lijn", x: 0, y: 0 },
      { id: "len", soort: "lengteVan", x: 0, y: 0 },
      { id: "afst", soort: "afstandTussen", x: 0, y: 0 },
      { id: "dl", soort: "puntDelen", x: 0, y: 0 },
      { id: "lst", soort: "lijstMaken", x: 0, y: 0, invoer: { aantal: "3" } },
      { id: "plus", soort: "optellen", x: 0, y: 0, invoer: { b: "1" } },
    ],
    verbindingen: [
      { vanNode: "a", vanPoort: "punt", naarNode: "l", naarPoort: "van" },
      { vanNode: "b", vanPoort: "punt", naarNode: "l", naarPoort: "naar" },
      { vanNode: "l", vanPoort: "lijn", naarNode: "len", naarPoort: "lijn" },
      { vanNode: "a", vanPoort: "punt", naarNode: "afst", naarPoort: "van" },
      { vanNode: "b", vanPoort: "punt", naarNode: "afst", naarPoort: "naar" },
      { vanNode: "a", vanPoort: "punt", naarNode: "dl", naarPoort: "punt" },
      { vanNode: "len", vanPoort: "uit", naarNode: "lst", naarPoort: "item1" },
      { vanNode: "afst", vanPoort: "uit", naarNode: "lst", naarPoort: "item3" },
    ],
  };
  const u = rekenGraaf(g).nodes;
  meld(waardeTekst(u.len.waarden.uit) === "5000 mm", "de lengte van een lijn: 3-4-5 geeft 5000 mm", waardeTekst(u.len.waarden.uit));
  meld(waardeTekst(u.afst.waarden.uit) === "5000 mm", "de afstand tussen twee punten");
  meld(waardeTekst(u.dl.waarden.y) === "4000 mm", "de y van een punt");
  meld(waardeTekst(u.lst.waarden.lijst) === "[5000 mm; 5000 mm]", "lijst maken: een lege ingang telt niet mee", waardeTekst(u.lst.waarden.lijst));
  meld(poortenVan(g.nodes[6]).ingangen.length === 3 && poortenVan({ ...g.nodes[6], invoer: { aantal: "99999" } }).ingangen.length === 64, "lijst maken: het aantal ingangen heeft een grens");
}
{
  const g = {
    versie: 1,
    nodes: [{ id: "r", soort: "reeks", x: 0, y: 0, invoer: { van: "1", tot: "3", stap: "1" } }, { id: "p", soort: "optellen", x: 0, y: 0, invoer: { b: "10" } }],
    verbindingen: [{ vanNode: "r", vanPoort: "lijst", naarNode: "p", naarPoort: "a" }],
  };
  meld(waardeTekst(rekenGraaf(g).nodes.p.waarden.uit) === "[11; 12; 13]", "rekent per element, zoals de andere nodes");
}

// ── Een grafbestand inlezen ─────────────────────────────────────────────────
console.log("\nEen grafbestand inlezen");
const poort = (Id, Name = "") => ({ Id, Name, Description: "", UsingDefaultValue: false, Level: 2, UseLevels: false, KeepListStructure: false });
const BESTAND = {
  Uuid: "u", IsCustomNode: false, Description: "", Name: "Proefgraaf", Inputs: [], Outputs: [],
  Nodes: [
    { ConcreteType: "CoreNodeModels.Input.DoubleSlider, CoreNodeModels", NodeType: "NumberInputNode", NumberType: "Double", MaximumValue: 12, MinimumValue: 2, StepValue: 0.5, InputValue: 6, Id: "A", Inputs: [], Outputs: [poort("Au")], Replication: "Disabled" },
    { ConcreteType: "CoreNodeModels.Input.DoubleInput, CoreNodeModels", NodeType: "NumberInputNode", NumberType: "Double", InputValue: 4, Id: "B", Inputs: [], Outputs: [poort("Bu")], Replication: "Disabled" },
    { ConcreteType: "x", NodeType: "FunctionNode", FunctionSignature: "+@var[]..[],var[]..[]", Id: "C", Inputs: [poort("Ci1", "x"), poort("Ci2", "y")], Outputs: [poort("Cu", "var")], Replication: "Auto" },
    { ConcreteType: "CoreNodeModels.Watch, CoreNodeModels", NodeType: "ExtensionNode", Id: "D", Inputs: [poort("Di")], Outputs: [poort("Du")], Replication: "Disabled" },
    { ConcreteType: "y", NodeType: "CodeBlockNode", Code: "a * 2;\nb = 0..10..5; // commentaar\n", Id: "E", Inputs: [poort("Ei", "a")], Outputs: [poort("Eu1"), poort("Eu2")], Replication: "Disabled" },
    { ConcreteType: "y", NodeType: "CodeBlockNode", Code: '"HEA 200";', Id: "F", Inputs: [], Outputs: [poort("Fu")], Replication: "Disabled" },
    { ConcreteType: "CoreNodeModels.Logic.RefactoredIf, CoreNodeModels", NodeType: "ExtensionNode", Id: "G", Inputs: [poort("Gi1", "test"), poort("Gi2", "true"), poort("Gi3", "false")], Outputs: [poort("Gu", "result")], Replication: "Disabled" },
    { ConcreteType: "CoreNodeModels.Input.BoolSelector, CoreNodeModels", NodeType: "BooleanInputNode", InputValue: true, Id: "H", Inputs: [], Outputs: [poort("Hu")], Replication: "Disabled" },
    { ConcreteType: "PythonNodeModels.PythonNode, PythonNodeModels", NodeType: "PythonScriptNode", Code: "OUT = 1", Id: "I", Inputs: [poort("Ii", "IN[0]")], Outputs: [poort("Iu", "OUT")], Replication: "Disabled" },
    { ConcreteType: "x", NodeType: "FunctionNode", FunctionSignature: "Fabrikant.Iets.Doe@double", Id: "J", Inputs: [poort("Ji", "getal")], Outputs: [poort("Ju", "uit")], Replication: "Auto" },
    { ConcreteType: "CoreNodeModels.CreateList, CoreNodeModels", NodeType: "ExtensionNode", Id: "K", Inputs: [poort("Ki1", "item0"), poort("Ki2", "item1")], Outputs: [poort("Ku", "list")], Replication: "Disabled" },
    { ConcreteType: "x", NodeType: "FunctionNode", FunctionSignature: "DSCore.List.GetItemAtIndex@var[]..[],int", Id: "L", Inputs: [poort("Li1", "list"), poort("Li2", "index")], Outputs: [poort("Lu", "item")], Replication: "Auto" },
    { ConcreteType: "x", NodeType: "FunctionNode", FunctionSignature: "DSCore.String.Contains@string,string,bool", Id: "M", Inputs: [poort("Mi1", "string"), poort("Mi2", "searchFor"), poort("Mi3", "ignoreCase")], Outputs: [poort("Mu", "bool")], Replication: "Auto" },
  ],
  Connectors: [
    { Start: "Au", End: "Ci1", Id: "c1", IsHidden: "False" },
    { Start: "Bu", End: "Ci2", Id: "c2", IsHidden: "False" },
    { Start: "Cu", End: "Di", Id: "c3", IsHidden: "False" },
    { Start: "Cu", End: "Ei", Id: "c4", IsHidden: "False" },
    { Start: "Hu", End: "Gi1", Id: "c5", IsHidden: "False" },
    { Start: "Au", End: "Gi2", Id: "c6", IsHidden: "False" },
    { Start: "Bu", End: "Gi3", Id: "c7", IsHidden: "False" },
    { Start: "Au", End: "Ki1", Id: "c8", IsHidden: "False" },
    { Start: "Bu", End: "Ki2", Id: "c9", IsHidden: "False" },
    { Start: "Ku", End: "Li1", Id: "c10", IsHidden: "False" },
    { Start: "Hu", End: "Mi3", Id: "c11", IsHidden: "False" },
    { Start: "Au", End: "Ii", Id: "c12", IsHidden: "False" },
  ],
  View: {
    NodeViews: [
      { Id: "A", Name: "Overspanning", X: 100, Y: 50, ShowGeometry: true, Excluded: false, IsSetAsInput: false, IsSetAsOutput: false },
      { Id: "C", Name: "+", X: 300, Y: 150 },
      { Id: "D", Name: "Watch", X: 500, Y: 150 },
      { Id: "E", Name: "Code Block", X: 500, Y: 400 },
      { Id: "I", Name: "Python Script", X: 700, Y: 400 },
      { Id: "J", Name: "Iets.Doe", X: 700, Y: 600 },
    ],
  },
};
const v = leesGrafBestand(JSON.stringify(BESTAND));
const op = Object.fromEntries(v.graaf.nodes.map((n, i) => [BESTAND.Nodes[i].Id, n]));
meld(v.naam === "Proefgraaf" && v.graaf.nodes.length === BESTAND.Nodes.length, "alle nodes staan erin, met de naam van de graaf");
meld(op.A.soort === "getal" && op.A.invoer.waarde === "6" && op.A.invoer.min === "2" && op.A.invoer.max === "12" && op.A.invoer.stap === "0.5" && op.A.naam === "Overspanning", "een schuif: waarde, grenzen, stap en eigen naam");
meld(op.B.soort === "getal" && op.B.invoer.waarde === "4", "een los getal");
meld(op.C.soort === "optellen" && op.C.x === Math.round(200 * 1.3) + 40 && op.C.y === Math.round(100 * 1.6) + 40, "de plek komt mee, opgeschaald voor de hogere nodes", `${op.C.x}, ${op.C.y}`);
meld(op.D.soort === "bekijken" && op.D.naam === undefined, "een bekijk-node zonder eigen naam");
meld(op.E.soort === "codeblok" && op.E.invoer.code === "uit1 = a * 2\nb = (0):(5):(10)", "een codeblok in de rekentaal, met namen en een reeks", op.E.invoer.code);
meld(op.F.soort === "tekst" && op.F.invoer.tekst === "HEA 200", "een losse tekst in een codeblok wordt een tekst-node");
meld(op.G.soort === "als" && op.H.soort === "waarOnwaar" && op.H.invoer.waarde === "true", "als en waar of onwaar");
meld(op.K.soort === "lijstMaken" && op.K.invoer.aantal === "2", "een lijst met het aantal ingangen uit het bestand");
meld(op.L.soort === "element" && op.L.invoer.basis === "0", "een index uit het bestand telt vanaf 0");
meld(op.I.soort === "ingelezen" && op.I.naam === "Python Script" && op.I.invoer.code === "OUT = 1", "een script draait niet, maar de code blijft leesbaar");
meld(op.J.soort === "ingelezen" && op.J.invoer.bron === "Fabrikant.Iets.Doe", "een onbekende node blijft staan, met zijn herkomst");
meld(!NODE_SOORTEN.includes("ingelezen"), "die kies je niet uit het menu");
meld(v.overgenomen === 11 && v.nietOvergenomen.length === 2 && v.nietOvergenomen.includes("Python Script"), "het verslag telt wat meerekent en wat niet", JSON.stringify(v.nietOvergenomen));
meld(v.verbindingenWeg === 1, "een verbinding op een optie die hier niet bestaat, valt weg en telt mee", v.verbindingenWeg);
const ur = rekenGraaf(v.graaf).nodes;
const idVan = (k) => op[k].id;
meld(waardeTekst(ur[idVan("C")].waarden.uit) === "10", "het rekent: 6 + 4 = 10");
meld(waardeTekst(ur[idVan("D")].waarden.waarde) === "10", "de bekijk-node toont het");
meld(waardeTekst(ur[idVan("E")].waarden.uit1) === "20", "het codeblok krijgt de verbinding op zijn naam: 10 · 2 = 20", JSON.stringify(ur[idVan("E")].fouten));
meld(waardeTekst(ur[idVan("E")].waarden.b) === "[0; 5; 10]", "de reeks 0..10..5 in het codeblok", waardeTekst(ur[idVan("E")].waarden.b));
meld(waardeTekst(ur[idVan("G")].waarden.uit) === "6", "als: waar kiest de eerste waarde");
meld(waardeTekst(ur[idVan("K")].waarden.lijst) === "[6; 4]", "de lijst uit twee verbindingen");
meld(waardeTekst(ur[idVan("L")].waarden.element) === "4", "een index telt daar vanaf 0: index 1 is het tweede element", JSON.stringify(ur[idVan("L")].fouten));
meld(ur[idVan("I")].fouten[0]?.code === "nietOvergenomen" && ur[idVan("I")].poorten.ingangen[0].naam === "IN[0]", "wat niet meerekent, meldt zich en houdt zijn poorten");
const opnieuw = leesGraaf(JSON.parse(JSON.stringify(v.graaf)));
meld(JSON.stringify(opnieuw) === JSON.stringify(v.graaf), "opslaan en heropenen geeft dezelfde graaf");
meld(vertaalCodeblok('a && b; !c; x != 1; "a;b";').regels.join("|") === 'uit1 = a  and  b|uit2 =  not c|uit3 = x != 1|uit4 = "a;b"', "logische tekens; een puntkomma in een tekst splitst niet", vertaalCodeblok('a && b; !c; x != 1; "a;b";').regels.join("|"));
meld(vertaalCodeblok("[1,2,3];{4,5};").regels.join("|") === "uit1 = [1,2,3]|uit2 = [4,5]", "beide vormen van een lijst");
const foutCode = (t) => { try { leesGrafBestand(t); return ""; } catch (e) { return e instanceof GrafBestandFout ? e.code : `anders: ${e.message}`; } };
meld(foutCode("{niet") === "geenJson", "geen JSON: een eigen melding");
meld(foutCode('<Workspace Version="1.3"><Elements/></Workspace>') === "oudeIndeling", "de oude XML-indeling: een eigen melding");
meld(foutCode("{}") === "geenGraaf" && foutCode("null") === "geenGraaf" && foutCode("[]") === "geenGraaf", "geen graaf: een eigen melding");
meld(foutCode(`\uFEFF${JSON.stringify(BESTAND)}`) === "", "een BOM aan het begin mag");
meld(leesGrafBestand(JSON.stringify({ Nodes: [null, 3, { NodeType: "NumberInputNode", Outputs: [null] }], Connectors: [null, { Start: 1 }], View: { NodeViews: [null] } })).graaf.nodes.length === 1, "wat niet klopt in een bestand, valt weg");
const kwaad = leesGrafBestand(JSON.stringify({ Nodes: [{ NodeType: "StringInputNode", InputValue: "<script>alert(1)</script>", Id: "x", Outputs: [poort("xu")] }], View: { NodeViews: [{ Id: "x", Name: "<img src=x onerror=alert(1)>", X: 0, Y: 0 }] } }));
const kwaadSvg = graafSvg(kwaad.graaf, rekenGraaf(kwaad.graaf), { naamVan: (n) => n.naam ?? n.soort, poort: (_n, p) => p, melding: (x) => x.code, meer: (n) => `+${n}` }).svg;
meld(kwaad.graaf.nodes[0].soort === "tekst" && !kwaadSvg.includes("<script") && !kwaadSvg.includes("<img"), "tekst uit een bestand blijft tekst op papier");

console.log(fouten === 0 ? "\nAlles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
