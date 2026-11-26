/**
 * Toetsregistratie per blad (vier ogen): store/controle.ts, de tab Controle en de kop op
 * papier.
 *
 * Wat er moet gelden:
 *   - de sha256 is de echte sha256 (gelijk aan node:crypto);
 *   - de hash van een blad hangt af van de rekentekst, de invoer en de uitkomst, en van niets
 *     anders: niet van de volgorde van de invoer, niet van CRLF, niet van rekenruis voorbij
 *     12 significante cijfers, niet van de taal;
 *   - na een vrijgave geeft elke wijziging van rekentekst, invoer of uitkomst "vervallen", met
 *     het deel dat veranderd is. Een andere gevolgklasse in de projectgegevens verandert
 *     alleen de uitkomst van een blad dat ermee rekent;
 *   - een afgekeurd blad is nooit vrijgegeven, ook niet als een bestand dat zegt;
 *   - de registratie gaat mee in het projectbestand (ocss::blad::controle) en terug;
 *   - een kopie van een blad neemt de controle niet mee;
 *   - de export (CSV en JSON) heeft elke registratie, met of de vrijgave nog geldt;
 *   - op papier staat de stand in de kop van het blad, alleen bij een blad met een controle.
 *
 * Draaien:  node scripts/check-controle.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { createHash } from "node:crypto";
import {
  bladHash, controleCsv, controleJson, controleRegels, controleStand, leesControle, nieuweRegistratie, sha256,
} from "../packages/desktop/src/store/controle.ts";
import { bouwProjectBestand, leesProjectBestand, PROJECT_FORMAAT_VERSIE } from "../packages/desktop/src/store/projectBestand.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";

/** Een klein blad dat met K_FI uit de projectgegevens rekent: q_d = 1,2·K_FI·q. */
const PROEF = `"Proef — EN 1990
q = ?{2}*(kN/m)
q_d = 1.2*K_FI*q
UC_max = q_d/(10 kN/m)
`;

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};

console.log("sha256");
for (const s of ["", "abc", "a".repeat(55), "a".repeat(56), "a".repeat(64), "a".repeat(1000), "γ_M0 = 1.0 ✓ € 漢字", "x\r\ny"]) {
  const echt = createHash("sha256").update(s, "utf8").digest("hex");
  meld(sha256(s) === echt, `sha256 van ${JSON.stringify(s.length > 20 ? s.slice(0, 12) + "…" : s)} (${s.length} tekens)`, sha256(s));
}

console.log("\nDe hash van een blad");
const u = { uc: 0.5, voldoet: true, getallen: { a: 1, b: 2.000000000000001 } };
const h1 = bladHash("x = 1\ny = 2\n", { L: "5", F: "3" }, u);
meld(JSON.stringify(h1) === JSON.stringify(bladHash("x = 1\r\ny = 2\r\n", { F: "3", L: "5" }, { ...u, getallen: { b: 2, a: 1 } })),
  "zelfde hash bij CRLF, een andere volgorde van de invoer en rekenruis");
const h2 = bladHash("x = 1\ny = 3\n", { L: "5", F: "3" }, u);
meld(h2.rekentekst !== h1.rekentekst && h2.invoer === h1.invoer && h2.uitkomst === h1.uitkomst && h2.totaal !== h1.totaal, "een andere rekentekst: alleen die hash en het geheel");
const h3 = bladHash("x = 1\ny = 2\n", { L: "6", F: "3" }, u);
meld(h3.invoer !== h1.invoer && h3.rekentekst === h1.rekentekst, "andere invoer: de hash van de invoer");
const h4 = bladHash("x = 1\ny = 2\n", { L: "5", F: "3" }, { ...u, getallen: { a: 1, b: 2.0001 } });
meld(h4.uitkomst !== h1.uitkomst && h4.invoer === h1.invoer, "een ander getal in de uitwerking: de hash van de uitkomst");
const h5 = bladHash("x = 1\ny = 2\n", { L: "5", F: "3" }, { ...u, voldoet: false });
meld(h5.uitkomst !== h1.uitkomst, "een ander oordeel: de hash van de uitkomst");

console.log("\nDe stand");
const vrij = nieuweRegistratie({ controleur: "A. Controleur", datum: "2026-11-26", uitkomst: "akkoord", opmerkingen: "", vrijgeven: true }, h1, "abc123");
const c = { registraties: [vrij] };
meld(controleStand(undefined, h1).soort === "geen", "zonder controle: geen");
meld(controleStand(c, h1).soort === "vrijgegeven", "zelfde stand: vrijgegeven");
const v2 = controleStand(c, h2);
meld(v2.soort === "vervallen" && JSON.stringify(v2.gewijzigd) === '["rekentekst"]', "andere rekentekst: vervallen, rekentekst", JSON.stringify(v2));
const v4 = controleStand(c, h4);
meld(v4.soort === "vervallen" && JSON.stringify(v4.gewijzigd) === '["uitkomst"]', "andere uitkomst: vervallen, uitkomst", JSON.stringify(v4));
meld(controleStand(c, null).soort === "vervallen", "een blad dat niet meer rekent: vervallen");
const af = nieuweRegistratie({ controleur: "B", datum: "2026-11-27", uitkomst: "afgekeurd", opmerkingen: "Belasting ontbreekt", vrijgeven: true }, h1, undefined);
meld(af.vrijgegeven === false, "afgekeurd en toch vrijgeven aangevinkt: niet vrijgegeven");
const st = controleStand({ registraties: [vrij, af] }, h1);
meld(st.soort === "gecontroleerd" && st.laatste.uitkomst === "afgekeurd", "de laatste controle telt: afgekeurd, niet vrijgegeven");

console.log("\nLezen");
const gelezen = leesControle({ registraties: [{ ...af, vrijgegeven: true }, { ...vrij, hash: { totaal: "kapot" } }, null, { ...vrij }] });
meld(gelezen?.registraties.length === 2, "een registratie met een kapotte hash valt weg", JSON.stringify(gelezen?.registraties.length));
meld(gelezen?.registraties[0].vrijgegeven === false, "een afgekeurde registratie die vrijgegeven zegt te zijn: niet vrijgegeven");
meld(leesControle({ registraties: [] }) === undefined && leesControle("x") === undefined, "leeg of geen object: geen controle");

console.log("\nIn het projectbestand");
const ex = { id: "a", naam: "Ligger", templateId: "ligger", source: "x = 1\n", waarden: { L: "5" }, elementen: [], controle: { registraties: [vrij, af] } };
const bestand = bouwProjectBestand({ versie: PROJECT_FORMAAT_VERSIE, naam: "Proef", gegevens: legeGegevens(), exemplaren: [ex, { ...ex, id: "b", controle: undefined }] }, null);
meld(bestand.includes('"ocss::blad::controle"'), "het attribuut ocss::blad::controle staat erin");
const terug = leesProjectBestand(bestand, "proef");
meld(JSON.stringify(terug.exemplaren[0].controle) === JSON.stringify(ex.controle), "opslaan en openen geeft dezelfde registraties");
meld(terug.exemplaren[1].controle === undefined, "een blad zonder controle krijgt er geen");

console.log("\nExporteren");
const bladen = [
  { id: "a", ref: "1", naam: "Ligger; as 2", controle: { registraties: [vrij] }, nu: h1 },
  { id: "b", ref: "2", naam: "Kolom", controle: { registraties: [vrij] }, nu: h2 },
  { id: "c", ref: "3", naam: "Zonder", nu: h1 },
];
const regels = controleRegels(bladen);
meld(regels.length === 2 && regels[0].geldig === "true" && regels[1].geldig === "false", "per registratie een regel, met of de vrijgave geldt", JSON.stringify(regels.map((r) => r.geldig)));
const csv = controleCsv(bladen);
meld(csv.startsWith("﻿blad;naam;controleur;datum;uitkomst;vrijgegeven;geldig;opmerkingen;tijd;rekenversie;hash\r\n"), "CSV met kop, puntkomma en BOM");
meld(csv.includes('"Ligger; as 2"') && csv.includes(h1.totaal), "een puntkomma in een naam tussen aanhalingstekens; de volle hash");
const json = JSON.parse(controleJson(bladen, "Proef"));
meld(json.bladen.length === 2 && json.bladen[0].stand === "vrijgegeven" && json.bladen[1].stand === "vervallen", "JSON per blad met de stand", JSON.stringify(json.bladen.map((b) => b.stand)));

console.log("\nHet blad zoals het nu is (in jsdom) en op papier");
const { laadRapportAfdruk } = await import("./lib/rapport-html.mjs");
const m = await laadRapportAfdruk();
await m.i18next.changeLanguage("nl");
const blad = { id: "l", naam: "Proef 1", templateId: "", source: PROEF, waarden: { q: "2" }, elementen: [] };
const g = legeGegevens();
const nu1 = m.bladHashNu(blad, [blad], g);
const nu1nl = nu1;
await m.i18next.changeLanguage("en");
const nu1en = m.bladHashNu(blad, [blad], g);
await m.i18next.changeLanguage("nl");
meld(nu1 !== null && JSON.stringify(nu1nl) === JSON.stringify(nu1en), "het blad rekent, en in elke taal dezelfde hash");
const nuCC = m.bladHashNu(blad, [blad], { ...g, CC: "3" });
meld(nuCC.rekentekst === nu1.rekentekst && nuCC.invoer === nu1.invoer && nuCC.uitkomst !== nu1.uitkomst, "gevolgklasse 3 in het project (K_FI 1,0 → 1,1): alleen de uitkomst verandert");
const nuL = m.bladHashNu({ ...blad, waarden: { q: "3" } }, [blad], g);
meld(nuL.invoer !== nu1.invoer, "andere invoer: andere hash van de invoer");
meld(nuL.uitkomst !== nu1.uitkomst, "andere invoer: ook een andere uitkomst (q_d = 1,2·3 in plaats van 1,2·2)");

const reg = nieuweRegistratie({ controleur: "A. Controleur", datum: "2026-11-26", uitkomst: "akkoord", opmerkingen: "", vrijgeven: true }, nu1, undefined);
const metControle = { ...blad, controle: { registraties: [reg] } };

m.useProjectStore.getState().laadProject({ projectNaam: "Proef", gegevens: g, exemplaren: [metControle, { ...blad, id: "z", naam: "Zonder controle" }] });
let html = m.tekenUitdraai();
const kop = (h) => h.match(/<span class="print-blad-norm print-blad-controle [a-z]+">([^<]*)<\/span>/g) ?? [];
meld(kop(html).length === 1, "op papier alleen in de kop van het blad met een controle", String(kop(html).length));
meld(kop(html)[0]?.includes("Vrijgegeven door A. Controleur op 2026-11-26") && kop(html)[0]?.includes(nu1.totaal.slice(0, 12)), "vrijgegeven, met de verkorte hash", kop(html)[0]);
m.useProjectStore.getState().laadProject({ projectNaam: "Proef", gegevens: { ...g, CC: "3" }, exemplaren: [metControle] });
html = m.tekenUitdraai();
meld(kop(html)[0]?.includes("vrijgave geldt niet meer") && kop(html)[0]?.includes("uitkomst"), "na een andere gevolgklasse: de vrijgave geldt niet meer (uitkomst)", kop(html)[0]);

console.log("\nEen kopie van het blad");
m.useProjectStore.getState().laadProject({ projectNaam: "Proef", gegevens: g, exemplaren: [metControle] });
const kopieId = m.useProjectStore.getState().dupliceer("l");
const kopie = m.useProjectStore.getState().exemplaren.find((e) => e.id === kopieId);
meld(kopie && kopie.controle === undefined, "een kopie neemt de controle niet mee");
m.useProjectStore.getState().registreerControle("l", af);
meld(m.useProjectStore.getState().exemplaren.find((e) => e.id === "l").controle.registraties.length === 2, "een nieuwe controle komt erbij, de eerdere blijft");

console.log(fouten === 0 ? "\nToetsregistratie: alles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
