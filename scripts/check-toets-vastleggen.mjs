/**
 * Controle van het vastleggen van de antwoorden van Open FEM Studio bij een blad
 * (packages/desktop/src/rekenen/toetsCache.ts, store/projectBestand.ts,
 * store/projectIfcx.ts).
 *
 * Toetst, zonder FEM Studio en zonder de app (het antwoord komt uit de fixture
 * scripts/fixtures/toets-staal.json):
 *   • de sessiecache: de vastgelegde antwoorden van de bladen, een fout naast een
 *     vastgelegd antwoord (een waarschuwing), opnieuw toetsen, een ander project,
 *     de FEM Studio van nu alleen in de modus vragen;
 *   • wat er bij een blad vastgelegd wordt: een nieuw antwoord, het antwoord van een
 *     ander blad met dezelfde invoer, en nooit vanzelf over een eigen antwoord heen;
 *   • opslaan: een antwoord dat het blad niet meer gebruikt, valt weg, behalve als
 *     een blok geen hash heeft of er niet doorgerekend is;
 *   • openen: een blad rekent met zijn vastgelegde antwoord, zonder FEM Studio, ook
 *     uit de opgeslagen staat van de app.
 *
 * Draaien:  node scripts/check-toets-vastleggen.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { readFileSync } from "node:fs";
import { alsAntwoord, evaluate, parse } from "../packages/core/dist/index.js";
import * as cache from "../packages/desktop/src/rekenen/toetsCache.ts";
import {
  bouwProjectBestand,
  leesProjectBestand,
  normaliseerExemplaren,
  PROJECT_FORMAAT_VERSIE,
} from "../packages/desktop/src/store/projectBestand.ts";
import { bladenVoorIfc } from "../packages/desktop/src/store/projectIfcx.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}${ok || !detail ? "" : "  -> " + detail}`);
  if (!ok) fouten++;
}

const fixture = JSON.parse(readFileSync(new URL("./fixtures/toets-staal.json", import.meta.url), "utf8"));
const antwoord = fixture.staal.structuredContent;
/** De uitkomst van een blad is afgerond op vier cijfers (bladLezen.ts). */
const dichtbij = (a, b) => Math.abs(a - b) <= 5e-5;

const bron = (h) => [`h = ${h}`, "@toets kolom = check_steel_beam", '  profile_name = "HEA200"', "  length_m = h", "@end", "UC_max = kolom.uc_max"].join("\n");
const toetsVan = (nodes) => nodes.find((n) => n.type === "toets");
const hashVan = (tekst) => toetsVan(evaluate(parse(tekst), {}, {}, { toetsModus: "vragen" })).hash;
const vast = (datum) => ({
  tool: "check_steel_beam",
  verzoek: { profile_name: "HEA200", length_m: 4 },
  uitkomst: antwoord,
  datum,
  herkomst: { versie: "2026.44.2", sha256: "0".repeat(64), schema: "s0123456789abcdef" },
});

const h4 = hashVan(bron("4 m"));
const h5 = hashVan(bron("5 m"));
const h3 = hashVan(bron("3 m"));
const A = vast("2026-11-01T08:00:00.000Z");
const ouder = vast("2026-10-01T08:00:00.000Z");

console.log("\nDe sessiecache");
{
  meld(Object.keys(cache.toetsingenNu()).length === 0, "leeg begin");
  let v = cache.toetsVersie();
  const blad1 = { [h4]: A };
  cache.zetVastgelegd([blad1, undefined]);
  meld(cache.toetsingenNu()[h4]?.ok === true && cache.toetsingenNu()[h4].datum === A.datum && cache.toetsVersie() > v, "het vastgelegde antwoord van een blad");
  v = cache.toetsVersie();
  cache.zetVastgelegd([undefined, blad1]);
  meld(cache.toetsVersie() === v, "dezelfde antwoorden: de versie blijft gelijk, typen rekent niets extra");

  cache.zetToetsAntwoord(h4, { ok: false, melding: "time-out" });
  const metFout = cache.toetsingenNu()[h4];
  meld(metFout.ok && metFout.waarschuwing === "time-out" && metFout.datum === A.datum, "een fout naast een vastgelegd antwoord: het oude blijft, met de fout als waarschuwing");
  cache.zetToetsAntwoord(h5, { ok: false, melding: "geen verbinding" });
  meld(cache.toetsingenNu()[h5]?.ok === false && cache.heeftToetsAntwoord(h5), "een fout zonder vastgelegd antwoord: de fout, en geen nieuw verzoek");
  meld(cache.nieuwVastTeLeggen(undefined, [h5]) === null, "een fout wordt niet vastgelegd");

  cache.zetOpnieuw(h4);
  meld(!(h4 in cache.toetsingenNu()) && !cache.heeftToetsAntwoord(h4), "opnieuw toetsen: het antwoord telt even niet");
  const k = toetsVan(evaluate(parse(bron("4 m")), {}, {}, cache.metToetsingen({}, "vragen")));
  meld(k.status === "wacht" && k.verzoek?.hash === h4, "het blok wacht en geeft weer een verzoek mee");
  meld(cache.nieuwVastTeLeggen(blad1, [h4]) === null, "tijdens het wachten verandert er niets aan het blad");
  const B = vast("2026-11-07T08:00:00.000Z");
  cache.zetToetsAntwoord(h4, alsAntwoord(B), B);
  meld(cache.toetsingenNu()[h4].datum === B.datum && !cache.toetsingenNu()[h4].waarschuwing, "het nieuwe antwoord gaat voor het vastgelegde");
  meld(cache.nieuwVastTeLeggen(blad1, [h4])?.[h4] === B, "en komt bij het blad, over het oude heen");
  meld(cache.nieuwVastTeLeggen({ [h4]: B }, [h4]) === null, "staat het er al, dan verandert er niets");

  cache.wisSessie();
  meld(cache.toetsingenNu()[h4]?.datum === A.datum && !(h5 in cache.toetsingenNu()), "een ander project: de antwoorden van de sessie gelden niet meer, de vastgelegde wel");
  meld(cache.nieuwVastTeLeggen(undefined, [h4])?.[h4] === A, "een blad met dezelfde invoer krijgt het antwoord van het andere blad");
  meld(cache.nieuwVastTeLeggen({ [h4]: ouder }, [h4]) === null, "maar een eigen antwoord blijft staan: nooit vanzelf vervangen");
  cache.zetVastgelegd([{ [h4]: ouder }, blad1]);
  meld(cache.toetsingenNu()[h4].datum === A.datum, "twee bladen met dezelfde invoer: het nieuwste antwoord telt");

  cache.zetFem({ versie: "2026.46.1", schemas: {} });
  meld(cache.metToetsingen({}, "vragen").fem?.versie === "2026.46.1" && !("fem" in cache.metToetsingen({}, "lezen")), "de FEM Studio van nu alleen in de modus vragen");
  cache.zetFem(undefined);
  cache.zetVastgelegd([]);
}

console.log("\nOpslaan");
{
  const project = (toetsingen, source = bron("4 m")) => ({
    versie: PROJECT_FORMAAT_VERSIE,
    naam: "Toets",
    gegevens: legeGegevens(),
    exemplaren: [{ id: "ex-1", naam: "Kolom", templateId: "", source, waarden: {}, elementen: [], toetsingen }],
  });
  const opslaan = (p) => bouwProjectBestand(p, bladenVoorIfc(p));
  const terug = (tekst) => leesProjectBestand(tekst, "x").exemplaren[0].toetsingen;
  const beide = { [h4]: A, [h3]: ouder };
  meld(Object.keys(terug(opslaan(project(beide))) ?? {}).join() === h4, "een antwoord voor een invoer die niet meer op het blad staat, valt weg");
  const veldfout = project(beide, bron("4 m").replace("length_m = h", "length_m = onbekend"));
  meld(Object.keys(terug(opslaan(veldfout)) ?? {}).length === 2, "een blok met een fout in een veld: alle antwoorden blijven, want welk hoort erbij?");
  meld(terug(opslaan(project({ [h4]: A }, "x = 1"))) === undefined, "het blok is weg: zijn antwoorden ook");
  meld(Object.keys(terug(bouwProjectBestand(project(beide), null)) ?? {}).length === 2, "zonder doorrekenen blijven ze alle");
}

console.log("\nOpenen, zonder FEM Studio");
{
  const tekst = bouwProjectBestand(
    { versie: PROJECT_FORMAAT_VERSIE, naam: "Toets", gegevens: legeGegevens(), exemplaren: [{ id: "ex-1", naam: "Kolom", templateId: "", source: bron("4 m"), waarden: {}, elementen: [], toetsingen: { [h4]: A } }] },
    null,
  );
  const geopend = leesProjectBestand(tekst, "x");
  // Wat de store bij elke wijziging doet (store/projectStore.ts).
  cache.zetVastgelegd(geopend.exemplaren.map((e) => e.toetsingen));
  const [blad] = bladenVoorIfc({ exemplaren: geopend.exemplaren, gegevens: geopend.gegevens });
  const t = toetsVan(blad.nodes);
  meld(t?.status === "klaar" && t.versie === "2026.44.2" && !t.verzoek, "het blok is getoetst, met de versie waarmee dat gebeurde");
  meld(dichtbij(blad.resultaat?.uc ?? NaN, antwoord.uc_max), "de UC van het blad is die van het vastgelegde antwoord", String(blad.resultaat?.uc));
  const doc = JSON.parse(bouwProjectBestand({ versie: PROJECT_FORMAAT_VERSIE, naam: "Toets", gegevens: geopend.gegevens, exemplaren: geopend.exemplaren }, [blad]));
  const uitkomst = doc.data.find((k) => k.attributes?.["ocss::blad"]?.id === "ex-1")?.attributes["ocss::blad::uitkomst"];
  meld(dichtbij(uitkomst?.uc ?? NaN, antwoord.uc_max), "en zo staat hij ook in het IFCX", JSON.stringify(uitkomst));

  const anders = toetsVan(evaluate(parse(bron("5 m")), {}, {}, cache.metToetsingen({}, "lezen")));
  meld(anders.status === "niet-getoetst", "een andere invoer: niet getoetst, want er is geen antwoord voor");

  const hersteld = normaliseerExemplaren([{ id: "ex-1", naam: "K", source: bron("4 m"), waarden: {}, toetsingen: { [h4]: A, kapot: { tool: "x" } } }], "p")[0];
  meld(Object.keys(hersteld.toetsingen ?? {}).join() === h4, "uit de opgeslagen staat van de app: de bruikbare antwoorden");
  meld(!("toetsingen" in normaliseerExemplaren([{ id: "ex-2", naam: "L", source: "x = 1", waarden: {} }], "p")[0]), "een blad zonder antwoorden krijgt geen leeg veld");
  cache.zetVastgelegd([]);
}

console.log(fouten === 0 ? "\nAlles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
