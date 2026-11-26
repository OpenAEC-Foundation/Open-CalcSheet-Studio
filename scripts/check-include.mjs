/**
 * `#include` van een `.cpd`-bestand op schijf.
 *
 * Toetst:
 *   • de kern (include.ts): de sleutel van een relatief, genest en absoluut pad;
 *     geneste includes; een ingebouwd bestand vanuit een ingevoegd bestand; een
 *     ontbrekend bestand en een kring geven een melding met het gevraagde pad, in
 *     het Nederlands, Engels en Litouws, op het scherm en op papier (dezelfde html);
 *     zonder tabel blijft `#include` zonder gevolg, zoals eerst;
 *   • het lezen in de app (store/includes.ts) met echte bestanden op schijf: relatief
 *     tot het projectbestand, genest vanaf de map van het ingevoegde bestand,
 *     absoluut; een kring blijft niet hangen; gelijke bytes houden de kopie en zijn
 *     datum, nieuwe bytes geven een nieuwe kopie; een ontbrekend bestand, de browser
 *     en een nog niet opgeslagen project vallen terug op de kopie, of melden zonder;
 *   • opslaan en heropenen: de kopie gaat mee in het projectbestand (en in het IFCX
 *     volgens de specificatie), de `#include` blijft een verwijzing, en het project
 *     opent en rekent ook zonder het bestand, met de melding dat de kopie geldt.
 *
 * De bestanden maakt dit script zelf, in een tijdelijke map.
 *
 * Draaien:  node scripts/check-include.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parse, evaluateMetScope, render, includeSleutel, leesmoment } from "../packages/core/dist/index.js";
import { leesIncludes, includeTabel, padOpSchijf, leesIncludeKopieen } from "../packages/desktop/src/store/includes.ts";
import { bouwProjectBestand, leesProjectBestand, PROJECT_FORMAAT_VERSIE } from "../packages/desktop/src/store/projectBestand.ts";
import { bladenVoorIfc, projectIfcx } from "../packages/desktop/src/store/projectIfcx.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";
import { afwijkingen } from "./lib/ifcx-specificatie.mjs";

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + (typeof detail === "string" ? detail : JSON.stringify(detail))}`);
};
const reken = (bron, includes, includeStaat, taal = "nl") =>
  evaluateMetScope(parse(bron, includes ? { includes, ...(includeStaat ? { includeStaat } : {}) } : {}), {}, {}, { taal });
const meldingen = (nodes) => nodes.filter((n) => n.includeMelding).map((n) => n.text);

console.log("Sleutels");
meld(includeSleutel("lib/constants.cpd") === "lib/constants.cpd", "relatief in het blad: zoals het er staat");
meld(includeSleutel("more.cpd", "lib/constants.cpd") === "lib/more.cpd", "genest: vanaf de map van het ingevoegde bestand");
meld(includeSleutel("../gedeeld.cpd", "lib/constants.cpd") === "gedeeld.cpd", "genest met ..", includeSleutel("../gedeeld.cpd", "lib/constants.cpd"));
meld(includeSleutel("./lib\\a.cpd") === "lib/a.cpd", "./ en een backslash: genormaliseerd", includeSleutel("./lib\\a.cpd"));
meld(includeSleutel("C:\\data\\a.cpd") === "C:\\data\\a.cpd" && includeSleutel("/home/x/a.cpd") === "/home/x/a.cpd", "absoluut: zoals het er staat");
meld(includeSleutel("b.cpd", "C:\\data\\a.cpd") === "C:\\data\\b.cpd", "genest in een absoluut bestand: in dezelfde map", includeSleutel("b.cpd", "C:\\data\\a.cpd"));
meld(includeSleutel('"lib/a.cpd"') === "lib/a.cpd", "aanhalingstekens vallen weg");

console.log("\nDe kern: invoegen en melden");
{
  const tabel = new Map([
    ["lib/constants.cpd", "my_pi = 3.14\n#include more.cpd\n#include detail.svg"],
    ["lib/more.cpd", "e_2 = 2.72"],
    ["detail.svg", "'ingebouwd"],
    ["a.cpd", "x_a = 1\n#include b.cpd"],
    ["b.cpd", "x_b = 2\n#include a.cpd"],
  ]);
  const { scope, nodes } = reken("#include lib/constants.cpd\nr = my_pi*2\nq = e_2", tabel);
  meld(Math.abs(scope.r - 6.28) < 1e-9, "my_pi uit lib/constants.cpd", String(scope.r));
  meld(Math.abs(scope.q - 2.72) < 1e-9, "genest: lib/more.cpd vanuit lib/constants.cpd", String(scope.q));
  meld(JSON.stringify(nodes).includes("ingebouwd") && meldingen(nodes).length === 0, "een ingebouwd bestand vanuit een ingevoegd bestand, zonder melding", meldingen(nodes));

  const kring = reken("#include a.cpd\ny = x_a + x_b", tabel);
  meld(kring.scope.y === 3, "een kring: elk bestand één keer ingevoegd", String(kring.scope.y));
  const mk = meldingen(kring.nodes);
  meld(mk.length === 1 && mk[0].includes("kring") && mk[0].includes("a.cpd → b.cpd → a.cpd"), "een kring wordt gemeld, met de keten", mk);

  const weg = reken("#include lib/weg.cpd\nz = 1", tabel);
  const mw = meldingen(weg.nodes);
  meld(mw.length === 1 && mw[0].includes("lib/weg.cpd") && mw[0].includes("niet gevonden"), "een ontbrekend bestand: melding met het gevraagde pad", mw);
  meld(weg.scope.z === 1, "de rest van het blad rekent door");
  const html = render(weg.nodes);
  meld(/<p class="calc-text calc-include-melding calc-include-fout" data-include="lib\/weg\.cpd">#include lib\/weg\.cpd: bestand niet gevonden/.test(html),
    "in de uitwerking een rode regel (dezelfde html op het scherm en op papier)", html.slice(0, 200));
  meld(meldingen(reken("#include lib/weg.cpd", tabel, undefined, "en").nodes)[0]?.includes("file not found"), "in het Engels");
  meld(meldingen(reken("#include lib/weg.cpd", tabel, undefined, "lt").nodes)[0]?.includes("failas nerastas"), "in het Litouws");

  const zonder = reken("#include lib/constants.cpd\nz = 1");
  meld(meldingen(zonder.nodes).length === 0 && zonder.scope.z === 1, "zonder tabel blijft #include zonder gevolg, zoals eerst");

  const staat = new Map([
    ["lib/constants.cpd", { soort: "kopie", reden: "ontbreekt", gelezenOp: "2026-11-20T09:30:00.000Z", gezocht: "C:\\proj\\lib\\constants.cpd" }],
    ["lib/weg.cpd", { soort: "geenToegang" }],
    ["nieuw.cpd", { soort: "nietOpgeslagen" }],
  ]);
  const k = reken("#include lib/constants.cpd\nr = my_pi\n#include lib/weg.cpd\n#include nieuw.cpd", tabel, staat);
  const mkop = meldingen(k.nodes);
  meld(Math.abs(k.scope.r - 3.14) < 1e-9 && mkop[0]?.includes(`kopie van ${leesmoment("2026-11-20T09:30:00.000Z")}`) && mkop[0].includes("C:\\proj\\lib\\constants.cpd"),
    "de kopie geldt: rekent, met een melding van wanneer en waar gezocht", mkop[0]);
  meld(/calc-include-waarschuwing/.test(render(k.nodes)), "de kopie is een waarschuwing, geen fout");
  meld(mkop[1]?.includes("alleen de desktop-app"), "zonder bestandstoegang (browser): een duidelijke melding", mkop[1]);
  meld(mkop[2]?.includes("sla het project eerst op"), "een project dat nog niet is opgeslagen: een duidelijke melding", mkop[2]);
}

console.log("\nLezen van schijf");
const map = mkdtempSync(join(tmpdir(), "include-"));
try {
  const proj = join(map, "project");
  mkdirSync(join(proj, "lib"), { recursive: true });
  const projectPad = join(proj, "main.ifcx");
  writeFileSync(join(proj, "lib", "constants.cpd"), "my_pi = 3.14\r\n#include more.cpd\r\n");
  writeFileSync(join(proj, "lib", "more.cpd"), "\uFEFFe_2 = 2.72\n");
  const absoluut = join(map, "elders.cpd");
  writeFileSync(absoluut, "g_0 = 9.81\n");
  writeFileSync(join(proj, "kring_a.cpd"), "#include kring_b.cpd\n");
  writeFileSync(join(proj, "kring_b.cpd"), "#include kring_a.cpd\n");
  const toegang = {
    async lees(pad) {
      try {
        return new Uint8Array(readFileSync(pad));
      } catch {
        return null;
      }
    },
  };
  const basis = new Map([["detail.svg", "x"]]);
  const bron = `#include lib/constants.cpd\n#include ${absoluut}\n#include kring_a.cpd\n#include detail.svg\nr = my_pi*e_2*g_0`;
  let t = 0;
  const nu = () => new Date(Date.UTC(2026, 10, 26, 10, 0, t++));
  const g1 = await leesIncludes(bron, { basis, projectPad, toegang, nu });
  const sleutels = g1.kopieen.map((k) => k.sleutel);
  meld(JSON.stringify(sleutels) === JSON.stringify(["lib/constants.cpd", "lib/more.cpd", absoluut, "kring_a.cpd", "kring_b.cpd"]),
    "relatief, genest, absoluut en een kring: elk één keer, het ingebouwde niet", sleutels);
  meld(Object.keys(g1.staat).length === 0, "alles gevonden: geen melding", g1.staat);
  meld(g1.kopieen[0].tekst === "my_pi = 3.14\n#include more.cpd\n" && g1.kopieen[1].tekst === "e_2 = 2.72\n", "CRLF en BOM vallen weg");
  meld(g1.kopieen[0].pad === join(proj, "lib", "constants.cpd"), "het pad waar gelezen is", g1.kopieen[0].pad);
  const tabel = includeTabel(basis, [{ includes: g1.kopieen }]);
  const r1 = reken(bron, tabel);
  meld(Math.abs(r1.scope.r - 3.14 * 2.72 * 9.81) < 1e-9, "het blad rekent met de gelezen bestanden", String(r1.scope.r));
  meld(meldingen(r1.nodes).length === 1 && meldingen(r1.nodes)[0].includes("kring"), "de kring meldt de kern", meldingen(r1.nodes));

  const g2 = await leesIncludes(bron, { basis, projectPad, toegang, vorige: g1.kopieen, nu });
  meld(g2.kopieen.every((k, i) => k === g1.kopieen[i]), "gelijke bytes: dezelfde kopie, met zijn datum");
  writeFileSync(join(proj, "lib", "more.cpd"), "e_2 = 3\n");
  const g3 = await leesIncludes(bron, { basis, projectPad, toegang, vorige: g2.kopieen, nu });
  const more3 = g3.kopieen.find((k) => k.sleutel === "lib/more.cpd");
  meld(more3.tekst === "e_2 = 3\n" && more3.gelezenOp !== g1.kopieen[1].gelezenOp && g3.kopieen[0] === g2.kopieen[0], "een gewijzigd bestand: een nieuwe kopie, de rest blijft");

  rmSync(join(proj, "lib", "constants.cpd"));
  const g4 = await leesIncludes(bron, { basis, projectPad, toegang, vorige: g3.kopieen, nu });
  meld(g4.staat["lib/constants.cpd"]?.soort === "kopie" && g4.staat["lib/constants.cpd"].reden === "ontbreekt"
    && g4.staat["lib/constants.cpd"].gezocht === join(proj, "lib", "constants.cpd") && g4.kopieen[0] === g3.kopieen[0],
    "het bestand is weg: de kopie geldt, met waar gezocht is", g4.staat);
  meld(g4.kopieen.some((k) => k.sleutel === "lib/more.cpd"), "en wat erin genest stond, wordt nog gelezen");
  const g5 = await leesIncludes("#include lib/weg.cpd", { basis, projectPad, toegang, nu });
  meld(g5.staat["lib/weg.cpd"]?.soort === "ontbreekt" && g5.kopieen.length === 0, "nooit gelezen en weg: ontbreekt", g5.staat);
  const g6 = await leesIncludes(bron, { basis, projectPad, toegang: null, vorige: g3.kopieen, nu });
  meld(g6.staat["lib/constants.cpd"]?.soort === "kopie" && g6.staat["lib/constants.cpd"].reden === "geenToegang", "in de browser: de kopie, met die reden");
  const g7 = await leesIncludes("#include lib/a.cpd", { basis, projectPad: null, toegang, nu });
  meld(g7.staat["lib/a.cpd"]?.soort === "nietOpgeslagen", "nog niet opgeslagen en geen kopie: nietOpgeslagen", g7.staat);
  const g8 = await leesIncludes(`#include ${absoluut}`, { basis, projectPad: null, toegang, nu });
  meld(g8.kopieen.length === 1 && Object.keys(g8.staat).length === 0, "een absoluut pad leest ook zonder projectbestand");
  meld(padOpSchijf("lib/a.cpd", "/home/x/p/main.ifcx") === "/home/x/p/lib/a.cpd" && padOpSchijf("lib/a.cpd", "C:\\p\\main.ifcx") === "C:\\p\\lib\\a.cpd",
    "het pad op schijf, POSIX en Windows");

  console.log("\nOpslaan en heropenen");
  const project = {
    versie: PROJECT_FORMAAT_VERSIE,
    naam: "Proef include",
    gegevens: legeGegevens(),
    rapport: undefined,
    exemplaren: [
      { id: "ex-main", naam: "Main", templateId: "", source: bron, waarden: {}, elementen: [], includes: g3.kopieen },
      { id: "ex-los", naam: "Los", templateId: "", source: "a = 1", waarden: {}, elementen: [] },
    ],
  };
  const bladen = bladenVoorIfc(project);
  const bestand = bouwProjectBestand(project, bladen);
  const afw = afwijkingen(projectIfcx(project, bladen));
  meld(afw.length === 0, "het IFCX met includes voldoet aan de specificatie", afw.slice(0, 5));
  const terug = leesProjectBestand(bestand, "proef");
  const main = terug.exemplaren.find((e) => e.id === "ex-main");
  meld(main?.source === bron, "de #include blijft in de rekentekst: een verwijzing");
  meld(JSON.stringify(main?.includes) === JSON.stringify(g3.kopieen), "de kopieën gaan mee in het projectbestand", main?.includes?.map((k) => k.sleutel));
  meld(terug.exemplaren.find((e) => e.id === "ex-los")?.includes === undefined && (bestand.match(/ocss::blad::includes"\s*:\s*\[/g) ?? []).length === 1, "een blad zonder #include krijgt geen veld");
  meld(leesIncludeKopieen([{ sleutel: "a.cpd" }, { sleutel: "", tekst: "x" }, "x"]) === undefined, "onbruikbare kopieën vallen weg");

  // Het bestand is weg en het project wordt op een andere plek geopend: het rekent met de kopie.
  rmSync(proj, { recursive: true, force: true });
  rmSync(absoluut);
  const elders = await leesIncludes(main.source, { basis, projectPad: join(map, "ander", "main.ifcx"), toegang, vorige: main.includes, nu });
  const staatMap = new Map(Object.entries(elders.staat));
  const r2 = reken(main.source, includeTabel(basis, [{ includes: elders.kopieen }]), staatMap);
  meld(Math.abs(r2.scope.r - 3.14 * 3 * 9.81) < 1e-9, "zonder de bestanden rekent het project met de kopie", String(r2.scope.r));
  const m2 = meldingen(r2.nodes);
  meld(m2.filter((m) => m.includes("de kopie van")).length === 5, "elk bestand dat uit de kopie komt, meldt dat (ook op papier)", m2);
} finally {
  rmSync(map, { recursive: true, force: true });
}

console.log(fouten === 0 ? "\nAlle controles geslaagd." : `\n${fouten} controle(s) gezakt.`);
process.exit(fouten === 0 ? 0 : 1);
