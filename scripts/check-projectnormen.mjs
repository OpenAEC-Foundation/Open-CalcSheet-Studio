/**
 * Normeditie en nationale bijlage per project (store/projectNormen.ts): de vastlegging in de
 * projectgegevens, het lezen van de normen uit een blad, de regel in de kop van een blad en
 * de tabel op het voorblad, en de weg door het projectbestand.
 *
 * Wat er moet gelden:
 *   - een project zonder vastlegging: geen regel in de kop van een blad (een oud rapport
 *     blijft tot op de letter gelijk, check-rapport-talen), en op het voorblad de zin dat
 *     de edities niet zijn vastgelegd;
 *   - met een vastlegging: per Eurocode die het blad noemt de editie en de NB, of dat ze
 *     ontbreken; een regel "EN 1991" dekt EN 1991-1-1 en EN 1991-1-4;
 *   - de app vult nooit zelf een editie in: "uit de bladen" geeft alleen aanduidingen;
 *   - een kapotte lijst geeft geen fout en geldt als leeg;
 *   - de vastlegging is geen variabele in de bladen en gaat mee in het IFCX.
 *
 * Draaien:  node scripts/check-projectnormen.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import {
  NORMEN_SLEUTEL, NORM_ONDERWERPEN, bladNormen, enDeel, normenTekst, normenUitBladen, normenVan, normenVoorBlad, onderwerpVan,
  vastgelegdeNormen,
} from "../packages/desktop/src/store/projectNormen.ts";
import { legeGegevens, projectScope } from "../packages/desktop/src/store/projectGegevens.ts";
import { bouwProjectBestand, leesProjectBestand, PROJECT_FORMAAT_VERSIE } from "../packages/desktop/src/store/projectBestand.ts";

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};

const HOUT = `"Houten ligger — EN 1995-1-1
γ_G = 1.2*K_FI
'Wind volgens EN 1991-1-4 en vloerbelasting volgens EN 1991-1-1
q = 2 kN/m
`;

console.log("De vastlegging lezen");
meld(normenVan({}).length === 0, "zonder sleutel: geen normen");
meld(normenVan({ [NORMEN_SLEUTEL]: "[kapot" }).length === 0, "kapotte JSON: leeg, geen fout");
meld(normenVan({ [NORMEN_SLEUTEL]: '{"norm":"x"}' }).length === 0, "geen lijst: leeg");
const gelezen = normenVan({ [NORMEN_SLEUTEL]: '[{"onderwerp":"hout","norm":"NEN-EN 1995-1-1","editie":"2005","nb":"NB:2013"},{"onderwerp":"bestaat-niet","norm":7},null]' });
meld(gelezen.length === 2 && gelezen[0].nb === "NB:2013" && gelezen[1].onderwerp === "overig" && gelezen[1].norm === "",
  "een onbekend onderwerp wordt overig, een fout type een lege tekst, null valt weg", JSON.stringify(gelezen));
meld(vastgelegdeNormen({ [NORMEN_SLEUTEL]: normenTekst(gelezen) }).length === 1, "een regel zonder aanduiding telt op papier niet mee");
meld(NORM_ONDERWERPEN.join() === "belastingen,wind,sneeuw,aardbeving,beton,staal,hout,metselwerk,funderingen,overig",
  "de onderwerpen van de landenkeuze (#30), plus overig");

console.log("\nDe normen van een blad");
meld(enDeel("NEN-EN 1995-1-1+C1+A1:2011/NB:2013") === "EN 1995-1-1", "NEN-EN 1995-1-1+C1+A1 → EN 1995-1-1", enDeel("NEN-EN 1995-1-1+C1+A1:2011/NB:2013"));
meld(enDeel("NEN 9997-1") === null, "NEN 9997-1 is geen Eurocode-deel");
meld(JSON.stringify(bladNormen(HOUT)) === JSON.stringify(["EN 1990", "EN 1991-1-1", "EN 1991-1-4", "EN 1995-1-1"]),
  "uit de tekst, en EN 1990 door K_FI", JSON.stringify(bladNormen(HOUT)));
meld(onderwerpVan("EN 1991-1-4") === "wind" && onderwerpVan("EN 1995-1-1") === "hout" && onderwerpVan("EN 1990") === "belastingen",
  "onderwerp bij een deel");

console.log("\nDe kop van een blad");
meld(normenVoorBlad({}, HOUT).length === 0, "project zonder vastlegging: niets in de kop");
const project = {
  [NORMEN_SLEUTEL]: normenTekst([
    { onderwerp: "hout", norm: "NEN-EN 1995-1-1", editie: "2005+C1:2006+A1:2008", nb: "NB:2013" },
    { onderwerp: "belastingen", norm: "NEN-EN 1991", editie: "", nb: "" },
  ]),
};
const kop = normenVoorBlad(project, HOUT);
const per = Object.fromEntries(kop.map((k) => [k.deel, k.regel?.norm ?? null]));
meld(per["EN 1995-1-1"] === "NEN-EN 1995-1-1", "EN 1995-1-1 vindt zijn regel", JSON.stringify(per));
meld(per["EN 1991-1-4"] === "NEN-EN 1991" && per["EN 1991-1-1"] === "NEN-EN 1991", "NEN-EN 1991 dekt de delen van EN 1991");
meld(per["EN 1990"] === null, "EN 1990 staat niet in het project: niet vastgelegd");

console.log("\nUit de bladen");
const uit = normenUitBladen(normenVan(project), [HOUT, '"Kolom — EN 1993-1-1\n']);
meld(JSON.stringify(uit.map((r) => r.norm)) === JSON.stringify(["EN 1990", "EN 1993-1-1"]), "alleen wat het project nog niet dekt", JSON.stringify(uit));
meld(uit.every((r) => r.editie === "" && r.nb === ""), "zonder editie en zonder NB: die kiest de constructeur");
meld(normenUitBladen([], [HOUT, HOUT]).length === 4, "een deel één keer, ook uit twee bladen");

console.log("\nGeen variabele, wel in het bestand");
const g = { ...legeGegevens(), ...project };
meld(!(NORMEN_SLEUTEL in projectScope(g)), "normen_editie staat niet in de scope van de bladen");
const bestand = bouwProjectBestand(
  { versie: PROJECT_FORMAAT_VERSIE, naam: "Normen", gegevens: g, exemplaren: [{ id: "a", naam: "Ligger", templateId: "", source: HOUT, waarden: {}, elementen: [] }] },
  null,
);
const terug = leesProjectBestand(bestand, "normen");
meld(terug.gegevens[NORMEN_SLEUTEL] === project[NORMEN_SLEUTEL], "opslaan en openen geeft dezelfde vastlegging");
meld(bestand.includes("ocss::project") && bestand.includes("NEN-EN 1995-1-1"), "de vastlegging staat in ocss::project van het IFCX");

console.log("\nOp papier (de echte afdruk in jsdom)");
const { laadRapportAfdruk } = await import("./lib/rapport-html.mjs");
const m = await laadRapportAfdruk();
await m.i18next.changeLanguage("nl");
const blad = (id) => ({ id, naam: `Ligger ${id}`, templateId: "", source: HOUT, waarden: {}, elementen: [] });
m.useProjectStore.getState().laadProject({ projectNaam: "Proef", gegevens: legeGegevens(), exemplaren: [blad("a"), blad("b")] });
let html = m.tekenUitdraai();
meld(html.includes("Normen en nationale bijlagen") && html.includes("niet vastgelegd in de projectgegevens"),
  "zonder vastlegging: het voorblad zegt dat de edities niet zijn vastgelegd");
meld(!html.includes("print-blad-normen"), "zonder vastlegging: geen normregel in de kop van een blad");
m.useProjectStore.getState().laadProject({ projectNaam: "Proef", gegevens: g, exemplaren: [blad("a"), blad("b")] });
html = m.tekenUitdraai();
meld(html.includes("<td>NEN-EN 1995-1-1</td><td>2005+C1:2006+A1:2008</td><td>NB:2013</td>"), "het voorblad heeft de tabel met de editie en de NB");
meld(html.includes("<td>NEN-EN 1991</td><td><i>niet vastgelegd</i></td><td><i>niet vastgelegd</i></td>"), "een lege editie staat als niet vastgelegd");
const regel = html.match(/<span class="print-blad-norm print-blad-normen">([^<]*)<\/span>/)?.[1] ?? "";
meld(regel.includes("NEN-EN 1995-1-1, editie 2005+C1:2006+A1:2008, nationale bijlage NB:2013"), "de kop van het blad noemt editie en NB", regel);
meld(regel.includes("EN 1990 niet vastgelegd in het project"), "en zegt wat het project niet vastlegt", regel);
meld((regel.match(/NEN-EN 1991,/g) ?? []).length === 1, "een regel die twee delen dekt, één keer", regel);
meld((html.match(/print-blad-normen/g) ?? []).length === 2, "in de kop van beide bladen");
await m.i18next.changeLanguage("en");
html = m.tekenUitdraai();
meld(html.includes("Standards and national annexes") && html.includes("national annex NB:2013"), "in het Engels");
const rapport = m.teken();
meld(rapport.includes("print-blad-normen"), "ook in bijlage A van het rapport");

console.log(fouten === 0 ? "\nNormen per project: alles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
