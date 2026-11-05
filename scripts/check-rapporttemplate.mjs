/**
 * Controle van het rapporttemplate: het bestand, de eigen opzet in een rapport en de bewerkingen.
 *
 *   1  het ingebouwde template: vast, niet te overschrijven, en een rapport zonder eigen opzet
 *      blijft precies wat het was;
 *   2  een template lezen: een kapot bestand verandert niets, een onbekende inhoud, een dubbel
 *      id, een rekenblok dat twee keer staat en ander onzin in een veld worden hersteld en gemeld;
 *   3  bewerken: toevoegen, hernoemen in de taal van het rapport, verplaatsen met de nummering
 *      erbij, verwijderen en terugzetten met behoud van tekst, rekenblokken plaatsen;
 *   4  een template zonder hoofdstuk Berekeningen terwijl er bladen zijn;
 *   5  toepassen: het rapport houdt zijn eigen kopie, eigen tekst blijft, nieuwe tekst volgt de
 *      taal, en terug naar het ingebouwde template;
 *   6  de eigen templates in de instellingen, met één als standaard;
 *   7  de echte afdruk: paneel, inhoudsopgave en koppen zijn het eens over de nummers, en een
 *      oud rapport krijgt er geen veld bij;
 *   8  het echte paneel: de sectie Report structure doet wat ze zegt, en het formulier eronder
 *      volgt de opzet;
 *   9  het projectbestand: de eigen opzet gaat erin mee.
 *
 * Draaien:  node scripts/check-rapporttemplate.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { normaliseerRapport, RAPPORT_VERSIE, standaardRapport, STANDAARD_HUISSTIJL } from "../packages/desktop/src/rapport/model.ts";
import {
  beschrijftBestaand, bijlageAnker, bijlageBladAnker, bijlageRegels, bijlagen, bladenInBijlage, bouwOpzet, heeftBerekeningen, inhoudsopgave,
  inhoudVoorPaneel, knopenVan, normaliseerOpzet, OPZET, opzetVan, REKENBLOKKEN, staatInHoofdstuk, TEKST_IDS, tekstIds, titelVan,
} from "../packages/desktop/src/rapport/opzet.ts";
import { STANDAARD_IN_NIEUW_RAPPORT, STANDAARD_TEKSTEN, standaardTeksten, variantenVan } from "../packages/desktop/src/rapport/standaardteksten.ts";
import { inTaal, inTaalGezet, leesMeertalig } from "../packages/desktop/src/rapport/meertalig.ts";
import {
  hernoemKnoop, ingebouwdTemplate, leesTemplate, metEigenTemplate, metStandaardTemplate, nieuwRapportVolgens, normaliseerEigenTemplates,
  ongeplaatsteBlokken, pasTemplateToe, plaatsBlok, schrijfTemplate, springKnoop, standaardTemplateVan, TEMPLATE_FORMAAT, TEMPLATE_VERSIE,
  templateUitRapport, terugNaarIngebouwd, vergeetKnoop, verplaatsKnoop, verwijderKnoop, voegKnoopToe, zetKnoopTerug, zonderEigenTemplate,
} from "../packages/desktop/src/rapport/template.ts";
import { isNieuwRapport, metTekst, wisselTaal } from "../packages/desktop/src/rapport/taalwissel.ts";
import { paneelGroepen } from "../packages/desktop/src/components/rapport/paneel/hulp.ts";
import { bouwProjectBestand, leesProjectBestand } from "../packages/desktop/src/store/projectBestand.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";
import { OCSS_SCHEMAS } from "../packages/core/dist/index.js";

let fouten = 0;
function toets(naam, ok, detail) {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${naam}${ok || detail === undefined ? "" : `\n         ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
}
/** Diepe vergelijking; de volgorde van sleutels telt niet. */
function zelfde(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && zelfde(a[k], b[k]));
}
const gelijk = (naam, kreeg, verwacht) => toets(naam, zelfde(kreeg, verwacht), `kreeg ${JSON.stringify(kreeg)}, verwacht ${JSON.stringify(verwacht)}`);
const kop = (t) => console.log(`\n${t}`);
const kloon = (x) => JSON.parse(JSON.stringify(x));

const VANDAAG = "05-11-2026";
const nieuw = (taal = "en") => standaardRapport(VANDAAG, standaardTeksten(taal), taal);
const opnieuwGelezen = (r) => normaliseerRapport(kloon(r), VANDAAG, standaardTeksten);
const BLADEN = [{ id: "ex-a", naam: "Blad A" }, { id: "ex-b", naam: "Blad B", plek: "hoofdstuk" }, { id: "ex-c", naam: "Blad C" }];
/** De nummers en koppen zoals de inhoudsopgave ze noemt. */
const regels = (r, bladen = []) => inhoudsopgave(bouwOpzet(r, bladen), true).map((i) => `${i.nummer} ${i.titel}`);
const ids = (opzet) => knopenVan(opzet).map((k) => k.id);
const bestand = (over = {}) => JSON.stringify({ ...kloon(ingebouwdTemplate()), naam: { en: "Own format" }, ...over });

// ── 1. Het ingebouwde template ──────────────────────────────────────────────
kop("1. Het ingebouwde template");
{
  const t = ingebouwdTemplate();
  gelijk("het formaat en de versie", [t.formaat, t.versie, TEMPLATE_FORMAAT, TEMPLATE_VERSIE], ["open-calcsheet-report-template", 1, "open-calcsheet-report-template", 1]);
  gelijk("de naam is meertalig, Engels voorop", t.naam.en, "Standard report");
  gelijk("het is OPZET", t.opzet, OPZET);
  toets("een eigen kopie, niet OPZET zelf", t.opzet !== OPZET && t.opzet[0] !== OPZET[0]);
  gelijk("de teksten zijn de standaardteksten", t.teksten, STANDAARD_TEKSTEN);
  gelijk("wat in een nieuw rapport leeg begint, staat erbij", [...t.leeg].sort(), Object.keys(STANDAARD_TEKSTEN).filter((id) => !STANDAARD_IN_NIEUW_RAPPORT.includes(id)).sort());
  gelijk("de nieuwste opmaak", t.opmaak, { constructieprincipe: true, subkoppen: true, bladenInInhoud: true });

  let vast = false;
  try {
    OPZET[0].titel.en = "Kapot";
  } catch {
    vast = true;
  }
  toets("OPZET is niet te wijzigen", vast && OPZET[0].titel.en === "Introduction");
  const kopie = ingebouwdTemplate();
  kopie.opzet[0].titel.en = "Eigen kop";
  kopie.teksten.inleiding = [];
  gelijk("een bewerkte kopie raakt het ingebouwde niet", [ingebouwdTemplate().opzet[0].titel.en, ingebouwdTemplate().teksten.inleiding.length > 0], ["Introduction", true]);

  gelijk("TEKST_IDS volgt uit OPZET", [...TEKST_IDS], tekstIds(OPZET));
  gelijk("opzetVan: zonder eigen opzet het ingebouwde", opzetVan(nieuw()) === OPZET, true);

  // Bestaande rapporten: geen nieuw veld, dezelfde uitkomst.
  const r = opnieuwGelezen(nieuw("nl"));
  for (const veld of ["opzet", "varianten", "weggehaald", "template", "huisstijl"]) toets(`een rapport zonder template heeft geen veld ${veld}`, !(veld in r));
  gelijk("de versie van de rapportopbouw blijft", RAPPORT_VERSIE, 5);
  const gekopieerd = { ...nieuw("nl"), opzet: kloon(OPZET) };
  gelijk("een kopie van de opzet geeft dezelfde indeling", bouwOpzet(gekopieerd, BLADEN), bouwOpzet(nieuw("nl"), BLADEN));
  gelijk("en dezelfde inhoud voor het zijpaneel", inhoudVoorPaneel(gekopieerd, BLADEN), inhoudVoorPaneel(nieuw("nl"), BLADEN));
  gelijk("het paneel: drie teksthoofdstukken, dan Uitgangspunten, Belastingen, Berekeningen",
    paneelGroepen(OPZET).map((g) => (g.soort === "teksten" ? g.knopen.map((k) => k.id) : g.soort)),
    [["inleiding", "projectgegevens", "constructie"], "uitgangspunten", "belastingen", "berekeningen"]);
}

// ── 2. Lezen ────────────────────────────────────────────────────────────────
kop("2. Een template lezen");
{
  const zegt = (raw, fout) => {
    const u = leesTemplate(raw);
    toets(`kapot: ${fout}`, u.ok === false && u.fout === fout, u);
  };
  zegt("", "geenJson");
  zegt("{ dit is geen json", "geenJson");
  zegt("[1, 2]", "geenTemplate");
  zegt("null", "geenTemplate");
  zegt('"tekst"', "geenTemplate");
  zegt(JSON.stringify({ formaat: "iets-anders", opzet: OPZET }), "geenTemplate");
  zegt(JSON.stringify({ formaat: TEMPLATE_FORMAAT }), "geenOpzet");
  zegt(JSON.stringify({ formaat: TEMPLATE_FORMAAT, opzet: "x" }), "geenOpzet");
  zegt(JSON.stringify({ formaat: TEMPLATE_FORMAAT, opzet: [] }), "geenOpzet");
  zegt(JSON.stringify({ formaat: TEMPLATE_FORMAAT, opzet: [1, "x", null] }), "geenOpzet");
  zegt(" ".repeat(11_000_000), "teGroot");
  // Een absurd diep bestand mag niet vastlopen op de stapel.
  const diep = leesTemplate(`{"formaat":"${TEMPLATE_FORMAAT}","opzet":${'[{"id":"a","titel":"a","kinderen":'.repeat(50000)}[]${"}]".repeat(50000)}}`);
  toets("een absurd diep bestand loopt niet vast", diep.ok && diep.meldingen.some((m) => m.soort === "teDiep") && knopenVan(diep.template.opzet).every((k) => k.niveau <= 4));

  const heen = leesTemplate(schrijfTemplate(ingebouwdTemplate()));
  toets("het ingebouwde template leest zichzelf zonder meldingen", heen.ok && heen.meldingen.length === 0, heen.meldingen);
  gelijk("heen en weer verandert niets", heen.template, ingebouwdTemplate());
  const naamUitBestand = leesTemplate(JSON.stringify({ formaat: TEMPLATE_FORMAAT, opzet: [{ id: "a", titel: { en: "A" } }] }), "Mijn format");
  gelijk("zonder naam de bestandsnaam", naamUitBestand.template.naam.en, "Mijn format");
  gelijk("zonder opmaak de nieuwste", naamUitBestand.template.opmaak, { constructieprincipe: true, subkoppen: true, bladenInInhoud: true });
  gelijk("een template uit een nieuwere versie wordt gelezen, met een melding", leesTemplate(bestand({ versie: 99 })).meldingen.map((m) => m.soort), ["nieuwereVersie"]);

  /** De opzet na het lezen, plus de soorten melding. */
  const lees = (opzet) => {
    const u = normaliseerOpzet(opzet);
    return [u.opzet, u.meldingen.map((m) => m.soort)];
  };

  // Onbekende inhoud.
  {
    const [o, m] = lees([
      { id: "a", titel: { en: "A" }, inhoud: "tekst" },
      { id: "b", titel: { en: "B" }, inhoud: "geotechniek" },
      { id: "c", titel: { en: "C" }, inhoud: "geotechniek", kinderen: [{ id: "d", titel: { en: "D" }, inhoud: "tekst" }] },
    ]);
    gelijk("onbekende inhoud zonder kinderen valt weg", ids(o), ["a", "c", "d"]);
    gelijk("met kinderen blijft hij een kop zonder inhoud", o[1].inhoud, undefined);
    gelijk("en het wordt gemeld", m, ["onbekendeInhoud", "onbekendeInhoud"]);
    toets("een onbekende inhoud bereikt de afdruk niet", knopenVan(o).every((k) => k.inhoud === undefined || k.inhoud === "tekst"));
  }

  // Dubbel id.
  {
    const [o, m] = lees([
      { id: "a", titel: { en: "Eerste" }, inhoud: "tekst" },
      { id: "a", titel: { en: "Tweede" }, inhoud: "tekst" },
      { id: "b", titel: { en: "B" }, kinderen: [{ id: "a", titel: { en: "Derde" }, inhoud: "tekst" }] },
    ]);
    gelijk("elk id één keer", new Set(ids(o)).size, 4);
    gelijk("de eerste houdt zijn id", o[0].titel.en, "Eerste");
    gelijk("de rest blijft staan met een eigen id", [o[1].titel.en, o[2].kinderen[0].titel.en], ["Tweede", "Derde"]);
    gelijk("gemeld", m, ["dubbelId", "dubbelId"]);
  }

  // Een nieuw id botst niet met een id dat verderop in het bestand staat.
  {
    const [o] = lees([{ titel: { en: "Zonder id" }, inhoud: "tekst" }, { id: "eigen-1", titel: { en: "X" }, inhoud: "tekst" }]);
    gelijk("een nieuw id botst met niets", new Set(ids(o)).size, 2);
    gelijk("het bestaande id blijft", o[1].id, "eigen-1");
  }

  // Elk rekenblok hooguit één keer, onder zijn eigen id.
  {
    const [o, m] = lees([
      { id: "wind", titel: { en: "Wind" }, inhoud: "wind" },
      { id: "x", titel: { en: "Wind 2" }, inhoud: "wind" },
      { id: "y", titel: { en: "Sneeuw" }, inhoud: "sneeuw" },
    ]);
    gelijk("de tweede valt weg", ids(o), ["wind", "sneeuw"]);
    gelijk("een rekenblok krijgt zijn vaste id: daar hangen zijn tekst en keuzes aan", o[1].id, "sneeuw");
    gelijk("en houdt zijn eigen kop", o[1].titel.en, "Sneeuw");
    gelijk("gemeld", m, ["dubbelBlok"]);
    const [z] = lees([{ inhoud: "wind" }]);
    gelijk("een rekenblok zonder titel krijgt de titel uit de lijst", z[0].titel.en, "Wind loads(Q)");
    const [t] = lees([{ id: "wind", titel: { en: "Eigen tekst" }, inhoud: "tekst" }]);
    toets("een tekstblok mag het id van een rekenblok niet hebben", t[0].id !== "wind" && t[0].inhoud === "tekst");
    const [k, km] = lees([{ id: "a", titel: { en: "A" }, kinderen: [{ id: "wind", inhoud: "wind", kinderen: [{ id: "b", titel: { en: "B" }, inhoud: "tekst" }] }] }]);
    gelijk("een rekenblok heeft geen kinderen: die komen ernaast", [k[0].kinderen.map((c) => c.id), k[0].kinderen[0].kinderen], [["wind", "b"], undefined]);
    gelijk("gemeld", km, ["blokMetKinderen"]);
  }

  // Berekeningen hoort op het hoogste niveau: daar staan de bladen onder.
  {
    const [o, m] = lees([{ id: "a", titel: { en: "A" }, kinderen: [{ id: "berekeningen", inhoud: "berekeningen" }] }, { id: "b", titel: { en: "B" } }]);
    gelijk("Berekeningen gaat naar het hoogste niveau", [o.map((k) => k.id), o.at(-1).niveau], [["a", "b", "berekeningen"], 1]);
    gelijk("gemeld", m, ["berekeningenVerplaatst"]);
  }

  // Niveaus.
  {
    const [o] = lees([{ id: "a", titel: { en: "A" }, niveau: 3, kinderen: [{ id: "b", titel: { en: "B" }, niveau: 1 }] }]);
    gelijk("het niveau volgt de diepte, niet wat er staat", [o[0].niveau, o[0].kinderen[0].niveau], [1, 2]);
    const [d, m] = lees([{ id: "a", titel: { en: "a" }, kinderen: [{ id: "b", titel: { en: "b" }, kinderen: [{ id: "c", titel: { en: "c" }, kinderen: [{ id: "d", titel: { en: "d" }, kinderen: [{ id: "e", titel: { en: "e" } }] }] }] }] }]);
    gelijk("dieper dan niveau 4 komt ernaast", [knopenVan(d).map((k) => k.niveau), ids(d)], [[1, 2, 3, 4, 4], ["a", "b", "c", "d", "e"]]);
    gelijk("gemeld", m, ["teDiep"]);
  }

  // Id's die in een pad, een object of op papier iets anders betekenen.
  for (const slecht of ["__proto__", "constructor", "toString", "a.b", "1", "12", "", "met spatie", 'a"b', "ex-a", "bijlage-A", null, 3, {}]) {
    const [o, m] = lees([{ id: slecht, titel: { en: "X" }, inhoud: "tekst" }]);
    toets(`geen geldig id: ${JSON.stringify(slecht)}`, o[0].id !== slecht && /^[a-z][a-z0-9-]*$/i.test(o[0].id) && m.includes("ongeldigId"), o[0]);
  }
  {
    const r = { ...nieuw(), opzet: lees([{ id: "constructor", titel: { en: "X" }, inhoud: "tekst", optioneel: true }])[0] };
    toets("bouwOpzet loopt daar niet op vast", Array.isArray(bouwOpzet(r, [])));
  }

  // Velden.
  {
    const [o] = lees([{
      id: "a", titel: { nl: "Alleen Nederlands", xx_YY: "weg", de: 3 }, titelNieuwbouw: 4, inhoud: "tekst", optioneel: "ja", nieuwePagina: "ja", inspringen: 7, onzin: true,
    }]);
    gelijk("alleen wat klopt blijft", o[0], { id: "a", titel: { en: "Alleen Nederlands", nl: "Alleen Nederlands" }, niveau: 1, inhoud: "tekst" });
    const [g, m] = lees([{ id: "a", titel: 5, inhoud: "tekst" }]);
    gelijk("een onleesbare titel: het id staat er, en het wordt gemeld", [g[0].titel, m], [{ en: "a" }, ["geenTitel"]]);
    gelijk("leesMeertalig: lege taal valt terug op wat er wel staat", leesMeertalig({ en: "", nl: "Kop" }), { en: "Kop", nl: "Kop" });
    gelijk("leesMeertalig: niets leesbaars", [leesMeertalig({ en: " " }), leesMeertalig(3), leesMeertalig([]), leesMeertalig(null)], [undefined, undefined, undefined, undefined]);
    toets("leesMeertalig: geen prototype via een taalcode", !("x" in (leesMeertalig(JSON.parse('{"en":"a","__proto__":{"x":1}}')) ?? {})));
  }

  // De rest van het bestand.
  {
    const u = leesTemplate(JSON.stringify({
      formaat: TEMPLATE_FORMAAT, versie: 1, naam: { en: "Format" },
      opzet: [{ id: "a", titel: { en: "A" }, inhoud: "tekst" }, { id: "b", titel: { en: "B" }, inhoud: "tekst" }, { id: "wind", inhoud: "wind" }],
      teksten: {
        a: [{ label: { en: "L" }, tekst: { en: "Tekst" } }, { label: 3, tekst: { en: "Zonder label" } }, { label: { en: "Leeg" }, tekst: { en: " " } }, "onzin"],
        b: "geen lijst",
        weg: [{ label: { en: "L" }, tekst: { en: "Bij een onderdeel dat er niet is" } }],
        __proto__: [{ label: { en: "L" }, tekst: { en: "T" } }],
      },
      leeg: ["a", "weg", 3],
      opmaak: { constructieprincipe: false, subkoppen: "ja" },
      huisstijl: { hoofdkleur: "url(https://voorbeeld.invalid/x)", accentkleur: "#123456", tabeltekst: 3, invoerkleur: "rgb(1, 2, 3)", lettertype: "x; background: url(y)" },
      land: "NL",
    }));
    toets("gelezen", u.ok);
    const t = u.template;
    gelijk("varianten: alleen wat klopt, bij een onderdeel dat er is", [Object.keys(t.teksten), t.teksten.a.map((v) => v.tekst.en)], [["a"], ["Tekst", "Zonder label"]]);
    toets("een variant zonder label krijgt er een", typeof t.teksten.a[1].label.en === "string" && t.teksten.a[1].label.en !== "");
    gelijk("leeg: alleen tekst-id's", t.leeg, ["a"]);
    gelijk("opmaak per veld", t.opmaak, { constructieprincipe: false, subkoppen: true, bladenInInhoud: true });
    gelijk("huisstijl: alleen veilige waarden", t.huisstijl, { hoofdkleur: STANDAARD_HUISSTIJL.hoofdkleur, accentkleur: "#123456", tabeltekst: STANDAARD_HUISSTIJL.tabeltekst, invoerkleur: "rgb(1, 2, 3)", lettertype: STANDAARD_HUISSTIJL.lettertype });
    gelijk("land blijft bewaard", t.land, "NL");
    toets("en gaat mee terug in het bestand", JSON.parse(schrijfTemplate(t)).land === "NL");
    toets("geen land: geen veld", !("land" in ingebouwdTemplate()) && !("land" in JSON.parse(schrijfTemplate(ingebouwdTemplate()))));
    gelijk("een onzinnig land valt weg", leesTemplate(bestand({ land: { a: 1 } })).template.land, undefined);
  }
}

// ── 3. Bewerken ─────────────────────────────────────────────────────────────
kop("3. De opzet bewerken");
{
  const r0 = nieuw("en");

  // Toevoegen.
  const r1 = voegKnoopToe(r0, null);
  const hoofdstuk = r1.opzet.at(-1);
  gelijk("een nieuw hoofdstuk: achteraan, niveau 1, met een eigen id", [hoofdstuk.niveau, hoofdstuk.inhoud, r1.opzet.length], [1, "tekst", OPZET.length + 1]);
  toets("het begint op een nieuwe pagina, zoals elk hoofdstuk", hoofdstuk.nieuwePagina === true);
  toets("het ingebouwde blijft", opzetVan(r0) === OPZET && OPZET.length === 6);
  const r2 = voegKnoopToe(r1, hoofdstuk.id);
  const paragraaf = r2.opzet.at(-1).kinderen[0];
  gelijk("een paragraaf eronder is niveau 2", paragraaf.niveau, 2);
  const r3 = voegKnoopToe(r2, paragraaf.id);
  const blok = r3.opzet.at(-1).kinderen[0].kinderen[0];
  gelijk("een tekstblok eronder is niveau 3", blok.niveau, 3);
  const r4 = voegKnoopToe(r3, blok.id);
  gelijk("en daaronder niveau 4", r4.opzet.at(-1).kinderen[0].kinderen[0].kinderen[0].niveau, 4);
  const diepste = r4.opzet.at(-1).kinderen[0].kinderen[0].kinderen[0];
  toets("onder niveau 4 kan niets meer", voegKnoopToe(r4, diepste.id) === r4);
  toets("onder een rekenblok kan niets", voegKnoopToe(r0, "wind") === r0);
  toets("onder een onbekend id kan niets", voegKnoopToe(r0, "bestaat-niet") === r0);
  gelijk("elk nieuw id is uniek", new Set(ids(r4.opzet)).size, ids(r4.opzet).length);
  gelijk("een nieuw onderdeel valt weg zolang het leeg is", regels(r4).at(-1), regels(r0).at(-1));
  const r5 = metTekst(r4, paragraaf.id, "Eigen paragraaf");
  gelijk("met tekst komt het erin, met nummers", regels(r5, []).slice(-2).map((s) => s.split(" ")[0]), ["6", "6.1"]);

  // Een id dat ooit tekst had, wordt niet opnieuw uitgedeeld.
  const metOudeTekst = verwijderKnoop(metTekst(voegKnoopToe(r0, null), voegKnoopToe(r0, null).opzet.at(-1).id, "Oude tekst"), voegKnoopToe(r0, null).opzet.at(-1).id);
  const weerNieuw = voegKnoopToe(metOudeTekst, null);
  toets("een nieuw onderdeel erft geen oude tekst", (weerNieuw.teksten[weerNieuw.opzet.at(-1).id] ?? "") === "", weerNieuw.opzet.at(-1));

  // Hernoemen: de taal van het rapport.
  const en = hernoemKnoop(r0, "inleiding", "Summary");
  gelijk("een Engels rapport: de Engelse kop", en.opzet[0].titel, { en: "Summary", nl: "Inleiding" });
  const nl = hernoemKnoop(nieuw("nl"), "inleiding", "Samenvatting");
  gelijk("een Nederlands rapport: de Nederlandse kop, Engels blijft", nl.opzet[0].titel, { en: "Introduction", nl: "Samenvatting" });
  gelijk("op papier in de taal van het rapport", regels(nl)[0], "1 Samenvatting");
  gelijk("na wisselen van taal de andere kop", regels(wisselTaal(nl, "en"))[0], "1 Introduction");
  gelijk("OPZET zelf blijft", OPZET[0].titel.nl, "Inleiding");

  const nieuwInNl = voegKnoopToe(nieuw("nl"), null);
  const idNl = nieuwInNl.opzet.at(-1).id;
  gelijk("een nieuw onderdeel staat in de taal van het rapport", inTaal(nieuwInNl.opzet.at(-1).titel, "nl"), "Nieuw hoofdstuk");
  const getypt = hernoemKnoop(nieuwInNl, idNl, "Mijn kop");
  gelijk("een getypte kop hoort bij de taal van het rapport", getypt.opzet.at(-1).titel.nl, "Mijn kop");
  gelijk("een andere taal valt terug op wat er wel staat", [inTaal(getypt.opzet.at(-1).titel, "en"), inTaal(getypt.opzet.at(-1).titel, "de")], ["Mijn kop", "Mijn kop"]);
  const vertaald = hernoemKnoop(wisselTaal(getypt, "en"), idNl, "My heading");
  gelijk("daarna in het Engels: beide talen naast elkaar", vertaald.opzet.at(-1).titel, { en: "My heading", nl: "Mijn kop" });
  gelijk("inTaalGezet: Engels is geen kopie meer, dan blijft het staan", inTaalGezet({ en: "A", nl: "B" }, "nl", "C"), { en: "A", nl: "C" });
  gelijk("inTaalGezet: Engels was een kopie, dan gaat het mee", inTaalGezet({ en: "A", nl: "A" }, "nl", "C"), { en: "C", nl: "C" });
  gelijk("inTaalGezet: een derde taal", inTaalGezet({ en: "A" }, "de", "C"), { en: "A", de: "C" });

  // titelNieuwbouw: de kop die je ziet is de kop die je hernoemt.
  const bouw = metTekst(r0, "wijziging", "Tekst");
  const kopWijziging = (r) => titelVan(knopenVan(opzetVan(r)).find((k) => k.id === "wijziging"), r);
  gelijk("bij nieuwbouw geldt titelNieuwbouw", kopWijziging(bouw), "Structural concept");
  const hernoemd = hernoemKnoop(bouw, "wijziging", "Concept");
  gelijk("hernoemen bij nieuwbouw raakt die kop", [kopWijziging(hernoemd), knopenVan(hernoemd.opzet).find((k) => k.id === "wijziging").titel.en], ["Concept", "Alteration"]);
  toets("onbekend id: niets", hernoemKnoop(r0, "bestaat-niet", "x") === r0);

  // Verplaatsen en de nummering.
  const omlaag = verplaatsKnoop(r0, "inleiding", 1);
  gelijk("omlaag: de nummers lopen mee", regels(omlaag).filter((s) => /^\d+ /.test(s)).slice(0, 2), ["1 Project details", "2 Introduction"]);
  gelijk("en de paragrafen ook", regels(omlaag).filter((s) => s.startsWith("1.")).slice(0, 2), ["1.1 Project description", "1.2 Role in the project and scope of this report"]);
  toets("aan de rand gebeurt niets", verplaatsKnoop(r0, "inleiding", -1) === r0 && verplaatsKnoop(r0, "berekeningen", 1) === r0);
  toets("heen en terug: weer het ingebouwde, zonder eigen opzet", !("opzet" in verplaatsKnoop(omlaag, "inleiding", -1)));

  // Over een ouder heen: een paragraaf gaat naar het volgende hoofdstuk.
  const overOuder = verplaatsKnoop(r0, "rol", 1);
  gelijk("onderaan een hoofdstuk: naar het begin van het volgende", overOuder.opzet[2].kinderen.map((k) => k.id), ["rol", "toelichting", "uitvoering"]);
  gelijk("en uit het oude weg", overOuder.opzet[1].kinderen.map((k) => k.id), ["projectomschrijving"]);
  const terugOver = verplaatsKnoop(overOuder, "rol", -1);
  gelijk("en terug: achteraan het vorige", ids(terugOver.opzet ?? OPZET), ids(OPZET));
  gelijk("omhoog over een ouder heen: een tekstonderdeel kan ouder zijn", verplaatsKnoop(r0, "projectomschrijving", -1).opzet[0].kinderen.map((k) => k.id), ["projectomschrijving"]);
  toets("een rekenblok is geen ouder: onderaan Belastingen staat alleen nog Berekeningen", verplaatsKnoop(r0, "blijvend", 1) === r0);

  // Dieper en hoger.
  const dieper = springKnoop(r0, "rol", 1);
  gelijk("dieper: onder de vorige, met het niveau erbij", [dieper.opzet[1].kinderen[0].kinderen[0].id, dieper.opzet[1].kinderen[0].kinderen[0].niveau], ["rol", 3]);
  const hoger = springKnoop(r0, "rol", -1);
  gelijk("hoger: na zijn ouder, als hoofdstuk", [hoger.opzet[2].id, hoger.opzet[2].niveau], ["rol", 1]);
  gelijk("de nummering past zich aan", regels(hoger).filter((s) => /^\d+ /.test(s))[2], "3 Role in the project and scope of this report");
  gelijk("een hele tak gaat mee", (() => {
    const t = springKnoop(r0, "toelichting", -1);
    const k = knopenVan(t.opzet).filter((x) => ["toelichting", "bestaand", "bestaand-stabiliteit"].includes(x.id));
    return k.map((x) => x.niveau);
  })(), [1, 2, 3]);
  toets("hoger dan een hoofdstuk kan niet", springKnoop(r0, "inleiding", -1) === r0);
  toets("dieper zonder vorige kan niet", springKnoop(r0, "projectomschrijving", 1) === r0 && springKnoop(r0, "inleiding", 1) === r0);
  toets("dieper onder een rekenblok kan niet", springKnoop(r0, "regenwater", 1) === r0);
  toets("niet dieper dan niveau 4: Constructie heeft al vier niveaus", springKnoop(r0, "constructie", 1) === r0);
  gelijk("wel als de tak nog past", knopenVan(springKnoop(r0, "uitvoering", 1).opzet).filter((k) => k.id.startsWith("uitvoering")).map((k) => k.niveau), [3, 4, 4, 4]);
  toets("Berekeningen blijft op het hoogste niveau", springKnoop(r0, "berekeningen", 1) === r0);
  const naIsDe = verplaatsKnoop(r0, "projectgegevens", 1);
  gelijk("een heel hoofdstuk verplaatsen houdt zijn paragrafen", naIsDe.opzet[2].kinderen.map((k) => k.id), ["projectomschrijving", "rol"]);

  // Na elke bewerking is de opzet nog steeds geldig.
  for (const [naam, r] of [["omlaag", omlaag], ["over een ouder", overOuder], ["dieper", dieper], ["hoger", hoger], ["toegevoegd", r5]]) {
    const u = normaliseerOpzet(kloon(r.opzet));
    gelijk(`na ${naam}: lezen geeft geen melding en geen verschil`, [u.meldingen, u.opzet], [[], r.opzet]);
  }

  // Verwijderen en terugzetten: de tekst blijft.
  const getoond = metTekst(r0, "belendingen", "Tekst over de buren");
  const zonder = verwijderKnoop(getoond, "belendingen");
  toets("weg uit de opzet", !ids(zonder.opzet).includes("belendingen"));
  gelijk("de tekst blijft in het rapport", zonder.teksten.belendingen, "Tekst over de buren");
  toets("en het rapport noemt hem niet meer", !regels(zonder).some((s) => s.includes("Adjoining")) && !bouwOpzetHeeft(zonder, "belendingen"));
  gelijk("het onderdeel staat in de lijst om terug te zetten", zonder.weggehaald.map((w) => [w.knoop.id, w.ouder]), [["belendingen", "toelichting"]]);
  const terug = zetKnoopTerug(zonder, "belendingen");
  gelijk("terugzetten: op zijn plek, met zijn tekst", [bouwOpzetHeeft(terug, "belendingen"), terug.teksten.belendingen, "weggehaald" in terug], [true, "Tekst over de buren", false]);
  toets("en precies het ingebouwde: geen eigen opzet meer", !("opzet" in terug));

  const hoofdstukWeg = verwijderKnoop(r0, "constructie");
  gelijk("een heel hoofdstuk met zijn tekst", hoofdstukWeg.weggehaald[0].knoop.kinderen.length, 2);
  gelijk("de nummers schuiven door", regels(hoofdstukWeg).filter((s) => /^\d+ /.test(s)), ["1 Introduction", "2 Project details", "3 Design basis", "4 Loads"]);
  const hoofdstukTerug = zetKnoopTerug(hoofdstukWeg, "constructie");
  toets("en terug", !("opzet" in hoofdstukTerug), hoofdstukTerug.opzet?.map((k) => k.id));
  const ouderWeg = verwijderKnoop(verwijderKnoop(getoond, "belendingen"), "toelichting");
  const zonderOuder = zetKnoopTerug(ouderWeg, "belendingen");
  gelijk("is de ouder weg, dan op het hoogste niveau", [zonderOuder.opzet.at(-1).id, zonderOuder.opzet.at(-1).niveau], ["belendingen", 1]);
  toets("onbekend id: niets", zetKnoopTerug(zonder, "bestaat-niet") === zonder && verwijderKnoop(r0, "bestaat-niet") === r0 && vergeetKnoop(zonder, "bestaat-niet") === zonder);
  const vergeten = vergeetKnoop(zonder, "belendingen");
  toets("vergeten: uit de lijst, en de tekst weg", !("weggehaald" in vergeten) && !("belendingen" in vergeten.teksten));
  const leegNieuw = voegKnoopToe(r0, null);
  const leegWeg = verwijderKnoop(leegNieuw, leegNieuw.opzet.at(-1).id);
  toets("een leeg eigen onderdeel bewaren we niet: daar is niets om terug te zetten", !("weggehaald" in leegWeg) && !("opzet" in leegWeg));
  gelijk("de lijst overleeft opslaan en openen", opnieuwGelezen(zonder).weggehaald, zonder.weggehaald);

  // Rekenblokken.
  gelijk("alle rekenblokken", REKENBLOKKEN.map((k) => k.inhoud), ["rol", "bouwwerk", "brand", "materialen", "conservering", "factoren", "bestaand", "vervormingen", "sneeuw", "wind", "veranderlijk", "blijvend", "berekeningen"]);
  gelijk("in het ingebouwde template staan ze allemaal", ongeplaatsteBlokken(r0), []);
  toets("een geplaatst blok kan niet nog eens", plaatsBlok(r0, "wind", "belastingen") === r0);
  const windWeg = verwijderKnoop(r0, "wind");
  toets("een rekenblok weghalen zet het niet in de lijst: je plaatst het weer uit de lijst", !("weggehaald" in windWeg));
  gelijk("en het staat in de lijst om te plaatsen", ongeplaatsteBlokken(windWeg).map((k) => k.id), ["wind"]);
  const windElders = plaatsBlok(windWeg, "wind", "inleiding");
  gelijk("plaatsen: onder een eigen ouder", [windElders.opzet[0].kinderen[0].id, windElders.opzet[0].kinderen[0].inhoud, windElders.opzet[0].kinderen[0].niveau], ["wind", "wind", 2]);
  gelijk("en met de gegevens die het rapport al heeft", windElders.belastingen, r0.belastingen);
  toets("het blok houdt op een andere plek zijn inspringen", windElders.opzet[0].kinderen[0].inspringen === 1);
  const windTerug = plaatsBlok(windWeg, "wind", "belastingen");
  toets("op zijn oude plek zonder eigen inspringen: dat erft het", knopenVan(windTerug.opzet).find((k) => k.id === "wind").inspringen === undefined);
  toets("onder een rekenblok kan niets worden geplaatst", plaatsBlok(windWeg, "wind", "sneeuw") === windWeg);
  const zonderBerekeningen = verwijderKnoop(r0, "berekeningen");
  gelijk("Berekeningen komt altijd op het hoogste niveau", opzetVan(plaatsBlok(zonderBerekeningen, "berekeningen", "inleiding")).at(-1).id, "berekeningen");
  gelijk("een rekenblok met tekst houdt zijn tekst", plaatsBlok(verwijderKnoop(metTekst(r0, "sneeuw", "Eigen"), "sneeuw"), "sneeuw", "belastingen").teksten.sneeuw, "Eigen");
  // Een blok dat in een weggehaald hoofdstuk zit, wordt niet dubbel als dat terugkomt.
  const blokInTak = verwijderKnoop(r0, "belastingen");
  gelijk("een blok uit een weggehaald hoofdstuk staat in de lijst", ongeplaatsteBlokken(blokInTak).map((k) => k.id), ["sneeuw", "wind", "veranderlijk", "blijvend"]);
  const eerstGeplaatst = plaatsBlok(blokInTak, "wind", "inleiding");
  const takTerug = zetKnoopTerug(eerstGeplaatst, "belastingen");
  gelijk("en komt niet dubbel als het hoofdstuk terugkomt", ids(takTerug.opzet).filter((id) => id === "wind").length, 1);
  gelijk("alle id's blijven uniek", new Set(ids(takTerug.opzet)).size, ids(takTerug.opzet).length);

  // De opzet gaat mee in het projectbestand.
  const opgeslagen = opnieuwGelezen(r5);
  gelijk("na opslaan en openen dezelfde opzet", opgeslagen.opzet, r5.opzet);
  gelijk("en dezelfde nummers", regels(opgeslagen), regels(r5));
  gelijk("kapotte opzet in een rapport: het ingebouwde", "opzet" in opnieuwGelezen({ ...nieuw(), opzet: "x" }), false);
  gelijk("alleen onzin: het ingebouwde", "opzet" in opnieuwGelezen({ ...nieuw(), opzet: [1, 2] }), false);
  gelijk("een lege opzet is een keuze: alles weggehaald", opnieuwGelezen({ ...nieuw(), opzet: [] }).opzet, []);
  gelijk("en dan heeft het rapport geen hoofdstukken", bouwOpzet({ ...nieuw(), opzet: [] }, []), []);
  gelijk("beschrijftBestaand leest de opzet van het rapport", beschrijftBestaand({ ...metTekst(r0, "bestaand-stabiliteit", "Tekst"), opzet: kloon(OPZET).filter((k) => k.id !== "constructie") }), false);
  toets("met het blok wel", beschrijftBestaand(metTekst(r0, "bestaand-stabiliteit", "Tekst")));
  const opgenomen = { ...r0, uitgangspunten: { ...r0.uitgangspunten, bestaand: { ...r0.uitgangspunten.bestaand, opnemen: true } } };
  toets("4.6 opgenomen telt als bestaand", beschrijftBestaand(opgenomen));
  toets("maar niet als het blok niet meer in de opzet staat: daar is de keuze niet meer te zien", !beschrijftBestaand(verwijderKnoop(opgenomen, "bestaand-situatie")));
  gelijk("een tekstknoop met kinderen valt niet weg als alleen het kind iets heeft", (() => {
    const v = voegKnoopToe(r0, null);
    const h = v.opzet.at(-1).id;
    const w = voegKnoopToe(v, h);
    return regels(metTekst(w, w.opzet.at(-1).kinderen[0].id, "Tekst")).at(-1).split(" ")[0];
  })(), "6.1");
}

function bouwOpzetHeeft(r, id) {
  return ids(bouwOpzet(r, []).map((k) => ({ ...k, kinderen: k.kinderen }))).includes(id);
}

// ── 4. Geen hoofdstuk Berekeningen ──────────────────────────────────────────
kop("4. Een template zonder Berekeningen, terwijl er bladen zijn");
{
  const r = verwijderKnoop(nieuw("en"), "berekeningen");
  toets("geen Berekeningen in de opzet", !heeftBerekeningen(r));
  toets("met wel", heeftBerekeningen(nieuw("en")));
  const knopen = bouwOpzet(r, BLADEN);
  toets("geen knoop voor de bladen", !knopen.some((k) => k.inhoud === "berekeningen"));
  gelijk("alle bladen in bijlage A, op volgorde", bladenInBijlage(r, BLADEN).map((b) => [b.blad.id, b.nummer]), [["ex-a", "A.1"], ["ex-b", "A.2"], ["ex-c", "A.3"]]);
  toets("ook een blad dat in het hoofdstuk hoort: er is geen hoofdstuk", !staatInHoofdstuk(r, BLADEN[1]));
  const metKeuze = { ...r, inHoofdstuk: { "ex-c": true } };
  toets("ook als de gebruiker het hoofdstuk koos", !staatInHoofdstuk(metKeuze, BLADEN[2]) && bladenInBijlage(metKeuze, BLADEN).length === 3);
  gelijk("bijlage A staat in de lijst", bijlagen(r, BLADEN).map((b) => b.letter), ["A"]);
  gelijk("de inhoudsopgave noemt de bladen onder de bijlage", bijlageRegels(r, BLADEN).map((i) => [i.nummer, i.titel, i.anker]), [
    ["A.1", "Blad A", bijlageBladAnker("ex-a")],
    ["A.2", "Blad B", bijlageBladAnker("ex-b")],
    ["A.3", "Blad C", bijlageBladAnker("ex-c")],
  ]);
  const paneel = inhoudVoorPaneel(r, BLADEN);
  gelijk("het zijpaneel: de bijlage en zijn bladen, die elk hun blad openen", paneel.slice(-4).map((p) => [p.nummer, p.bladId]), [["A", undefined], ["A.1", "ex-a"], ["A.2", "ex-b"], ["A.3", "ex-c"]]);
  gelijk("het zijpaneel: elk anker één keer", new Set(paneel.map((p) => p.anker)).size, paneel.length);
  toets("een eigen bijlage houdt zijn letter", bijlagen({ ...r, bijlagen: ["Tekening"] }, BLADEN).map((b) => b.letter).join() === "A,B" && bijlagen({ ...r, bijlagen: ["Tekening"] }, []).map((b) => b.letter).join() === "B");

  // Met het hoofdstuk: precies zoals het was.
  const met = { ...nieuw("en"), inHoofdstuk: { "ex-c": true } };
  gelijk("met Berekeningen: de keuze telt", bladenInBijlage(met, BLADEN).map((b) => [b.blad.id, b.nummer]), [["ex-a", "A.1"]]);
  gelijk("en de nummers zijn die van bouwOpzet", bouwOpzet(met, BLADEN).at(-1).kinderen.filter((k) => k.blad.bijlage).map((k) => k.blad.bijlage), ["A.1"]);
  gelijk("Berekeningen terugzetten kan altijd", plaatsBlok(r, "berekeningen", null).opzet ?? "ingebouwd", "ingebouwd");
  gelijk("een eigen bijlageRegels komt overeen met de regels van het hoofdstuk", bijlageRegels(met, BLADEN).map((i) => i.anker), [bijlageBladAnker("ex-a")]);
  gelijk("zonder bladen geen bijlage A", bijlagen(r, []).length, 0);
  gelijk("het anker van de bijlage", bijlageAnker("A"), "bijlage-A");
}

// ── 5. Toepassen ────────────────────────────────────────────────────────────
kop("5. Een template toepassen");
{
  /** Een eigen format: eigen volgorde, eigen hoofdstuk en eigen teksten, in twee talen. */
  const format = () => {
    const t = leesTemplate(JSON.stringify({
      formaat: TEMPLATE_FORMAAT, versie: 1, naam: { en: "Own format", nl: "Eigen format" },
      opzet: [
        { id: "samenvatting", titel: { en: "Summary", nl: "Samenvatting" }, inhoud: "tekst", nieuwePagina: true },
        { id: "inleiding", titel: { en: "Scope", nl: "Scope" }, inhoud: "tekst" },
        { id: "wind", titel: { en: "Wind", nl: "Wind" }, inhoud: "wind", inspringen: 1 },
      ],
      teksten: {
        samenvatting: [{ label: { en: "Short", nl: "Kort" }, tekst: { en: "Summary text", nl: "Samenvattende tekst" } }],
        inleiding: [{ label: { en: "Our scope", nl: "Onze scope" }, tekst: { en: "Our scope text", nl: "Onze scopetekst" } }],
      },
      opmaak: { constructieprincipe: true, subkoppen: false, bladenInInhoud: false },
      huisstijl: { hoofdkleur: "#112233", accentkleur: "#445566", tabeltekst: "#000000", invoerkleur: "#0000ff", lettertype: "Arial, Helvetica, sans-serif" },
      land: "BE",
    })).template;
    return t;
  };
  const t = format();

  const r = pasTemplateToe(nieuw("nl"), t);
  gelijk("de opzet van het template", ids(r.opzet), ["samenvatting", "inleiding", "wind"]);
  gelijk("de koppen in de taal van het rapport", regels(r), ["1 Samenvatting", "2 Scope", "3 Wind"]);
  gelijk("een nieuw onderdeel krijgt de eerste tekst, in de taal van het rapport", r.teksten.samenvatting, "Samenvattende tekst");
  gelijk("een standaardtekst die niemand aanraakte, volgt het template", r.teksten.inleiding, "Onze scopetekst");
  gelijk("de opmaak van het template", r.opmaak, t.opmaak);
  gelijk("de huisstijl", r.huisstijl, t.huisstijl);
  gelijk("naam en land gaan mee", r.template, { naam: t.naam, land: "BE" });
  toets("het rapport heeft een eigen kopie", r.opzet !== t.opzet && r.opzet[0] !== t.opzet[0]);
  const voor = kloon(r.opzet);
  t.opzet[0].titel.nl = "Later gewijzigd in het template";
  t.opzet.pop();
  gelijk("een gewijzigd template verandert het rapport niet", r.opzet, voor);
  gelijk("de varianten gaan mee", variantenVan(r, "samenvatting").map((v) => v.tekst.en), ["Summary text"]);
  gelijk("een onderdeel zonder eigen varianten houdt de standaardteksten", variantenVan(r, "trillingen"), STANDAARD_TEKSTEN.trillingen);
  gelijk("alleen wat afwijkt wordt bewaard", Object.keys(r.varianten).sort(), ["inleiding", "samenvatting"]);
  gelijk("na opslaan en openen hetzelfde", opnieuwGelezen(r), r);

  // Wisselen van taal volgt de varianten van het template.
  const omgewisseld = wisselTaal(r, "en");
  gelijk("wisselen van taal: de tekst uit het template wisselt mee", [omgewisseld.teksten.samenvatting, omgewisseld.teksten.inleiding], ["Summary text", "Our scope text"]);
  gelijk("en de koppen", regels(omgewisseld), ["1 Summary", "2 Scope", "3 Wind"]);
  toets("een template-tekst telt niet als eigen tekst", !("samenvatting" in omgewisseld.tekstTaal));
  toets("een taal zonder vertaling valt terug op Engels", wisselTaal(r, "fr").teksten.samenvatting === "Summary text" && regels(wisselTaal(r, "fr"))[0] === "1 Summary");

  // Eigen tekst blijft.
  const eigen = metTekst(metTekst(nieuw("nl"), "inleiding", "Mijn eigen inleiding"), "belendingen", "Over de buren");
  const na = pasTemplateToe(eigen, format());
  gelijk("getypte tekst blijft staan, ook in een onderdeel dat het template ook heeft", na.teksten.inleiding, "Mijn eigen inleiding");
  gelijk("en houdt zijn taal", na.tekstTaal.inleiding, "nl");
  gelijk("tekst in een onderdeel dat wegvalt blijft in het rapport", na.teksten.belendingen, "Over de buren");
  gelijk("en is terug te zetten", na.weggehaald.map((w) => [w.knoop.id, w.ouder]), [["belendingen", "toelichting"]]);
  toets("een onaangeraakte standaardtekst staat daar niet tussen", !na.weggehaald.some((w) => w.knoop.id === "trillingen"));
  gelijk("terugzetten: op het hoogste niveau, met de tekst", (() => {
    const w = zetKnoopTerug(na, "belendingen");
    return [w.opzet.at(-1).id, w.opzet.at(-1).niveau, w.teksten.belendingen];
  })(), ["belendingen", 1, "Over de buren"]);

  // Een eigen nieuwe-pagina-keuze wijkt voor het template.
  const pagina = pasTemplateToe({ ...nieuw("nl"), nieuwePagina: { samenvatting: false, "ex-a": true, projectgegevens: false } }, format());
  gelijk("de keuze voor een pagina komt uit het template; bij een blad blijft hij", pagina.nieuwePagina, { "ex-a": true, projectgegevens: false });

  // Terug naar het ingebouwde template.
  const ingebouwd = terugNaarIngebouwd(na);
  for (const veld of ["opzet", "varianten", "template", "huisstijl"]) toets(`terug: geen ${veld} meer`, !(veld in ingebouwd));
  gelijk("terug: de indeling van het ingebouwde", regels(ingebouwd).filter((s) => /^\d+ /.test(s)), ["1 Inleiding", "2 Projectgegevens", "3 Constructie", "4 Uitgangspunten", "5 Belastingen"]);
  gelijk("terug: eigen tekst blijft", [ingebouwd.teksten.inleiding, ingebouwd.teksten.belendingen], ["Mijn eigen inleiding", "Over de buren"]);
  gelijk("terug: het ingebouwde is weer heel, dus het onderdeel staat er weer", "weggehaald" in ingebouwd, false);
  const terugVers = terugNaarIngebouwd(pasTemplateToe(nieuw("nl"), format()));
  gelijk("terug: tekst uit het template wordt weer de standaard", terugVers.teksten.inleiding, standaardTeksten("nl").inleiding);
  gelijk("terug: een eigen onderdeel met getypte tekst is terug te zetten", (() => {
    const v = metTekst(pasTemplateToe(nieuw("nl"), format()), "samenvatting", "Typte ik zelf");
    return terugNaarIngebouwd(v).weggehaald.map((w) => w.knoop.id);
  })(), ["samenvatting"]);
  const niets = nieuw("nl");
  toets("terug bij het ingebouwde: niets te doen", terugNaarIngebouwd(niets) === niets);
  const oudeOpmaak = { ...verplaatsKnoop(nieuw("nl"), "inleiding", 1), opmaak: { constructieprincipe: false, subkoppen: false, bladenInInhoud: false } };
  gelijk("terug: de eigen opmaak van het rapport blijft", terugNaarIngebouwd(oudeOpmaak).opmaak, oudeOpmaak.opmaak);

  // Een nieuw rapport volgens een template.
  const vers = nieuwRapportVolgens(VANDAAG, "nl", format());
  gelijk("een nieuw rapport volgens het template", [regels(vers), vers.teksten.samenvatting, vers.versie, vers.revisies[0].datum], [["1 Samenvatting", "2 Scope", "3 Wind"], "Samenvattende tekst", RAPPORT_VERSIE, VANDAAG]);
  gelijk("zonder template het ingebouwde", nieuwRapportVolgens(VANDAAG, "nl", null), nieuw("nl"));
  toets("zo'n rapport telt als nieuw", isNieuwRapport(vers, format()));
  toets("ook na opslaan en openen", isNieuwRapport(opnieuwGelezen(vers), format()));
  toets("niet als je iets typt", !isNieuwRapport(metTekst(vers, "samenvatting", "Getypt"), format()));
  toets("en een ingebouwd rapport telt niet als nieuw volgens een template", !isNieuwRapport(nieuw("nl"), format()));
  toets("zonder template het oude gedrag", isNieuwRapport(nieuw("nl")) && !isNieuwRapport(vers));
  const wisselVers = wisselTaal(vers, "en");
  toets("na wisselen van taal is het nog steeds nieuw", isNieuwRapport(wisselVers, format()), wisselVers.teksten);

  // Wat begint leeg.
  const leeg = nieuwRapportVolgens(VANDAAG, "en", ingebouwdTemplate());
  gelijk("het ingebouwde template toepassen: precies een nieuw rapport", leeg, nieuw("en"));
  const eersteTekst = leesTemplate(bestand({ leeg: ["trillingen"] })).template;
  gelijk("leeg in het template: een onaangeraakte tekst gaat weg", nieuwRapportVolgens(VANDAAG, "en", eersteTekst).teksten.trillingen, "");

  // Een template maken uit een rapport.
  let bron = verplaatsKnoop(nieuw("nl"), "inleiding", 1);
  bron = hernoemKnoop(bron, "inleiding", "Aanleiding");
  bron = metTekst(bron, "inleiding", "Onze vaste aanleiding");
  bron = metTekst(bron, "trillingen", "");
  bron = { ...bron, nieuwePagina: { montage: true, projectgegevens: false, "ex-a": true } };
  const gemaakt = templateUitRapport(bron, { en: "Ours" });
  gelijk("de naam", gemaakt.naam, { en: "Ours" });
  gelijk("de opzet van het rapport", ids(gemaakt.opzet), ids(bron.opzet));
  gelijk("getypte tekst wordt de eerste variant", [gemaakt.teksten.inleiding[0].tekst.nl, gemaakt.teksten.inleiding[0].tekst.en], ["Onze vaste aanleiding", "Onze vaste aanleiding"]);
  gelijk("de varianten blijven erachter", gemaakt.teksten.inleiding.slice(1), STANDAARD_TEKSTEN.inleiding);
  toets("wat leeg is, begint leeg", gemaakt.leeg.includes("trillingen"));
  gelijk("een gekozen pagina-indeling gaat mee", [knopenVan(gemaakt.opzet).find((k) => k.id === "montage").nieuwePagina, knopenVan(gemaakt.opzet).find((k) => k.id === "projectgegevens").nieuwePagina], [true, undefined]);
  gelijk("een template bevat geen pagina-keuze van een blad", knopenVan(gemaakt.opzet).some((k) => k.id === "ex-a"), false);
  gelijk("de opmaak", gemaakt.opmaak, bron.opmaak);
  toets("geen eigen huisstijl: geen veld", !("huisstijl" in gemaakt));
  gelijk("een huisstijl die de app meegeeft", templateUitRapport(bron, { en: "Ours" }, { ...STANDAARD_HUISSTIJL, hoofdkleur: "#000000" }).huisstijl.hoofdkleur, "#000000");
  gelijk("land blijft doorgegeven", templateUitRapport(pasTemplateToe(nieuw("en"), format()), { en: "Ours" }).land, "BE");
  const weerNieuw = nieuwRapportVolgens("01-01-2027", "nl", leesTemplate(schrijfTemplate(gemaakt)).template);
  gelijk("een nieuw rapport uit dat bestand: dezelfde koppen", regels(weerNieuw).filter((s) => /^\d+ /.test(s)), regels(bron).filter((s) => /^\d+ /.test(s)));
  gelijk("en de tekst", [weerNieuw.teksten.inleiding, weerNieuw.teksten.trillingen], ["Onze vaste aanleiding", ""]);
  gelijk("en de pagina's", bouwOpzet(weerNieuw, []).map((k) => k.nieuwePagina), bouwOpzet(bron, []).map((k) => k.nieuwePagina));
  const tweemaal = templateUitRapport(pasTemplateToe(nieuw("nl"), gemaakt), { en: "Ours" });
  gelijk("opnieuw als template: geen dubbele varianten", tweemaal.teksten.inleiding.length, gemaakt.teksten.inleiding.length);
  const vanEngels = templateUitRapport(metTekst(nieuw("en"), "inleiding", "Own text"), { en: "Ours" });
  gelijk("een Engels rapport: alleen Engels", vanEngels.teksten.inleiding[0].tekst, { en: "Own text" });
  const inAndereTaal = wisselTaal(metTekst(nieuw("nl"), "inleiding", "Nederlandse tekst"), "en");
  gelijk("een tekst in een andere taal: bij de taal waarin hij is getypt", templateUitRapport(inAndereTaal, { en: "Ours" }).teksten.inleiding[0].tekst, { en: "Nederlandse tekst", nl: "Nederlandse tekst" });
  toets("een ongewijzigd ingebouwd rapport geeft het ingebouwde template, onder de eigen naam", zelfde(templateUitRapport(nieuw("en"), { en: "Ours" }).opzet, OPZET));
}

// ── 6. Eigen templates ──────────────────────────────────────────────────────
kop("6. Eigen templates in de instellingen");
{
  const a = leesTemplate(bestand({ naam: { en: "A" } })).template;
  const b = leesTemplate(bestand({ naam: { en: "B" } })).template;
  const begin = normaliseerEigenTemplates(null);
  gelijk("begin: niets, en het ingebouwde is de standaard", [begin, standaardTemplateVan(begin)], [{ lijst: [], standaard: null }, null]);
  const eerste = metEigenTemplate(begin, a);
  const tweede = metEigenTemplate(eerste.eigen, b);
  gelijk("toevoegen", tweede.eigen.lijst.map((e) => e.template.naam.en), ["A", "B"]);
  toets("elk een eigen id", eerste.id !== tweede.id);
  toets("het oude object blijft", eerste.eigen.lijst.length === 1 && begin.lijst.length === 0);
  const gewijzigd = metEigenTemplate(tweede.eigen, { ...a, opmaak: { ...a.opmaak, subkoppen: false } });
  gelijk("dezelfde naam vervangt, op zijn plek, onder hetzelfde id", [gewijzigd.id, gewijzigd.eigen.lijst.length, gewijzigd.eigen.lijst[0].template.opmaak.subkoppen], [eerste.id, 2, false]);
  const standaard = metStandaardTemplate(tweede.eigen, tweede.id);
  gelijk("een als standaard", standaardTemplateVan(standaard).naam.en, "B");
  toets("een onbekende kan geen standaard worden", metStandaardTemplate(tweede.eigen, "bestaat-niet") === tweede.eigen);
  gelijk("terug naar het ingebouwde als standaard", standaardTemplateVan(metStandaardTemplate(standaard, null)), null);
  gelijk("de standaard weghalen: het ingebouwde is weer de standaard", zonderEigenTemplate(standaard, tweede.id).standaard, null);
  gelijk("een andere weghalen: de standaard blijft", zonderEigenTemplate(standaard, eerste.id).standaard, tweede.id);
  toets("onbekend id: niets", zonderEigenTemplate(standaard, "bestaat-niet") === standaard);
  gelijk("bewaard en gelezen: hetzelfde", normaliseerEigenTemplates(kloon(standaard)), standaard);
  const rommel = normaliseerEigenTemplates({ standaard: "weg", lijst: [{ id: "x", template: kloon(a) }, { id: "x", template: kloon(b) }, { id: 3, template: kloon(a) }, { id: "y" }, { id: "z", template: { formaat: "anders" } }, "onzin"] });
  gelijk("uit de instellingen: wat niet klopt valt weg", [rommel.lijst.map((e) => e.id), rommel.standaard], [["x"], null]);
  gelijk("onzin in de instellingen", normaliseerEigenTemplates("x"), { lijst: [], standaard: null });
  gelijk("onzin in de lijst", normaliseerEigenTemplates({ lijst: "x", standaard: 3 }), { lijst: [], standaard: null });
  const gelezenStandaardNaam = leesTemplate(bestand({ naam: ingebouwdTemplate().naam })).template;
  const metZelfdeNaam = metEigenTemplate(begin, gelezenStandaardNaam);
  gelijk("een eigen bestand met de naam van het ingebouwde overschrijft dat niet", [metZelfdeNaam.eigen.lijst.length, zelfde(ingebouwdTemplate().opzet, OPZET)], [1, true]);
}

// ── 7. De echte afdruk ──────────────────────────────────────────────────────
kop("7. De afdruk");
{
  const { laadRapportAfdruk } = await import("./lib/rapport-html.mjs");
  const m = await laadRapportAfdruk();
  await m.i18next.changeLanguage("en");
  const blad = (id, naam) => ({ id, naam, templateId: "markdown", source: "", waarden: {}, elementen: [], md: { bestandsnaam: "x.md", tekst: `# ${naam}\n\nTekst.`, beelden: {} } });
  const exemplaren = [blad("ex-a", "Blad A"), blad("ex-b", "Blad B")];
  const teken = (rapport) => {
    m.useProjectStore.setState({ rapport, exemplaren, gegevens: m.useProjectStore.getState().gegevens, projectNaam: "Voorbeeld" });
    const plek = document.createElement("div");
    plek.innerHTML = m.teken();
    return plek;
  };
  const ankers = (plek) => [...plek.querySelectorAll("[data-inhoud]")].map((e) => e.getAttribute("data-inhoud"));
  const inhoud = (plek) => [...plek.querySelectorAll(".rpa-inhoud .rpa-rij")].map((e) => [...e.children].map((c) => c.textContent.trim()).filter((t) => t !== "").join(" "));
  const koppen = (plek) => [...plek.querySelectorAll("h1[data-inhoud], h2[data-inhoud]")].map((e) => e.textContent.trim());

  // Een eigen format: een eigen hoofdstuk voorop, Belastingen weg, een hernoemde kop.
  let r = nieuw("en");
  r = voegKnoopToe(r, null);
  const eigen = r.opzet.at(-1).id;
  r = hernoemKnoop(r, eigen, "Executive summary");
  r = metTekst(r, eigen, "Short version of the report.");
  for (let i = 0; i < 6; i++) r = verplaatsKnoop(r, eigen, -1);
  r = verwijderKnoop(r, "belastingen");
  r = hernoemKnoop(r, "uitgangspunten", "Basis of design");
  const plek = teken(r);
  const k = koppen(plek);
  gelijk("de koppen op papier", k.filter((t) => /^\d+ /.test(t)), ["1 Executive summary", "2 Introduction", "3 Project details", "4 Structure", "5 Basis of design", "6 Calculations"]);
  toets("de eigen tekst staat erin", plek.textContent.includes("Short version of the report."));
  toets("wat weg is, staat er niet in", !plek.textContent.includes("Wind loads"));
  for (const nummer of ["1 Executive summary", "5 Basis of design", "5.1 Structural design basis", "6 Calculations", "6.1 Blad A"]) {
    toets(`de inhoudsopgave en de kop: ${nummer}`, inhoud(plek).some((t) => t.includes(nummer)) && k.includes(nummer), inhoud(plek).slice(0, 12));
  }
  // Het zijpaneel leest dezelfde bron.
  const paneel = inhoudVoorPaneel(r, exemplaren.map((e) => ({ id: e.id, naam: e.naam })));
  for (const p of paneel.filter((x) => x.niveau === 1 && !x.anker.startsWith("bijlage"))) {
    toets(`het zijpaneel en de kop: ${p.nummer} ${p.titel}`, k.includes(`${p.nummer} ${p.titel}`));
  }
  gelijk("elk anker één keer", new Set(ankers(plek)).size, ankers(plek).length);

  // Zonder Berekeningen.
  const zonder = verwijderKnoop(nieuw("en"), "berekeningen");
  const p2 = teken(zonder);
  toets("geen hoofdstuk Calculations", !koppen(p2).some((t) => /^\d+ Calculations$/.test(t)));
  toets("bijlage A staat er, met zijn kop", ankers(p2).includes("bijlage-A") && koppen(p2).some((t) => t.includes("Detailed calculations")));
  toets("met elk blad", ["Blad A", "Blad B"].every((n) => p2.textContent.includes(n)) && ankers(p2).includes(bijlageBladAnker("ex-a")) && ankers(p2).includes(bijlageBladAnker("ex-b")));
  toets("de inhoudsopgave noemt ze", inhoud(p2).some((t) => t.includes("A.1 Blad A")) && inhoud(p2).some((t) => t.includes("A.2 Blad B")), inhoud(p2));

  // De huisstijl uit het template gaat voor.
  const stijl = { ...STANDAARD_HUISSTIJL, hoofdkleur: "#112233" };
  const p3 = teken({ ...nieuw("en"), huisstijl: stijl });
  toets("de huisstijl uit het template staat op de wortel", p3.querySelector(".rpa-wortel").getAttribute("style")?.includes("#112233"), p3.querySelector(".rpa-wortel").getAttribute("style"));

  // En wat geen template heeft, blijft zoals het was.
  const gewoon = nieuw("en");
  const opgeslagen = opnieuwGelezen(gewoon);
  gelijk("een rapport zonder template, opgeslagen en geopend: geen enkel nieuw veld", Object.keys(opgeslagen).sort(), Object.keys(gewoon).sort());
  toets("en geen ander papier", teken(gewoon).innerHTML === teken(opgeslagen).innerHTML);

  // ── 8. Het paneel ─────────────────────────────────────────────────────────
  kop("8. Het paneel");
  globalThis.confirm = () => true;
  const zetStand = (rapport, bladen = exemplaren) => m.flushSync(() => m.useProjectStore.setState({ rapport, exemplaren: bladen, verleden: [], toekomst: [], dirty: false, bestandspad: null }));
  const klik = (el) => m.flushSync(() => el.click());
  /** Typen in een veld, zoals React dat ziet. */
  const typ = (el, waarde) => m.flushSync(() => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(el, waarde);
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
  const nav = (p) => [...p.querySelectorAll(".rapport-nav button")].map((b) => b.textContent);
  const secties = (p) => [...p.querySelectorAll("[data-sectie]")].map((s) => s.getAttribute("data-sectie"));
  const sectieKoppen = (p) => [...p.querySelectorAll(".rapport-groep-kop h2")].map((h) => h.textContent);
  const koppenInSectie = (p, id) => [...p.querySelector(`[data-sectie="${id}"]`).querySelectorAll(".rapport-kopregel")].map((h) => h.textContent);
  const regelVan = (p, titel) => [...p.querySelectorAll(".rapport-opzet-regel")].find((r) => r.querySelector('input[type="text"]').value === titel);
  const knopIn = (r, label) => [...r.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === label);
  const titels = (p) => [...p.querySelectorAll(".rapport-opzet-regel")].map((r) => `${r.querySelector(".rapport-opzet-nummer").textContent} ${r.querySelector('input[type="text"]').value}`.trim());

  // Het ingebouwde template: het paneel dat er altijd was, met de nieuwe sectie erbij.
  zetStand(nieuw("en"));
  const paneel0 = m.tekenPaneel();
  gelijk("de sprongbalk", nav(paneel0.plek), ["Document", "Revisions", "Report structure", "Chapters 1–3", "Design basis", "Loads", "Calculations", "Appendices", "Office"]);
  gelijk("de secties op volgorde", secties(paneel0.plek), ["document", "revisies", "opzet", "teksten-inleiding", "uitgangspunten", "belastingen", "berekeningen", "bijlagen", "bureau"]);
  gelijk("de koppen met hun nummer", sectieKoppen(paneel0.plek).filter((k) => /Chapters|Design|Loads|Calculations/.test(k)), ["Chapters 1 to 3", "4Design basis", "5Loads", "6Calculations"]);
  gelijk("elk tekst-id heeft zijn tekstvak", paneel0.plek.querySelectorAll(".rapport-tekstveld").length, TEKST_IDS.length);
  gelijk("de koppen van Uitgangspunten in de volgorde van het rapport", koppenInSectie(paneel0.plek, "uitgangspunten").slice(0, 4), ["4.1Structural design basis", "4.2Structural fire design", "4.3Materials", "4.4Corrosion protection of steelwork"]);
  gelijk("de opzet staat er helemaal in", paneel0.plek.querySelectorAll(".rapport-opzet-regel").length, knopenVan(OPZET).length);
  toets("een rekenblok is als zodanig te herkennen", regelVan(paneel0.plek, "Wind loads(Q)").querySelector(".rapport-soort")?.textContent === "calculated");
  toets("en een tekstonderdeel niet", !regelVan(paneel0.plek, "Introduction").querySelector(".rapport-soort"));
  toets("terug naar ingebouwd kan nu niet", [...paneel0.plek.querySelectorAll('[data-sectie="opzet"] .rapport-knop')].find((b) => b.textContent === "Back to built-in").disabled);
  toets("wat niet kan staat grijs", knopIn(regelVan(paneel0.plek, "Introduction"), "Move up").disabled && !knopIn(regelVan(paneel0.plek, "Introduction"), "Move down").disabled);

  // Verplaatsen.
  klik(knopIn(regelVan(paneel0.plek, "Introduction"), "Move down"));
  gelijk("omlaag: de nummers in de opzet", titels(paneel0.plek).slice(0, 4), ["1 Project details", "1.1 Project description", "1.2 Role in the project and scope of this report", "2 Introduction"]);
  gelijk("en in het formulier eronder", koppenInSectie(paneel0.plek, "teksten-projectgegevens").slice(0, 2), ["1Project details", "1.1Project description"]);
  gelijk("één stap in ongedaan maken", m.useProjectStore.getState().verleden.length, 1);
  toets("niet meer ingebouwd", !!m.useProjectStore.getState().rapport.opzet && ![...paneel0.plek.querySelectorAll('[data-sectie="opzet"] .rapport-knop')].find((b) => b.textContent === "Back to built-in").disabled);
  m.flushSync(() => m.useProjectStore.getState().ongedaan());
  toets("ongedaan: weer het ingebouwde", !("opzet" in m.useProjectStore.getState().rapport));

  // Een nieuw hoofdstuk uit het menu, en hernoemen.
  zetStand(nieuw("en"));
  const erbij = paneel0.plek.querySelector(".rapport-opzet-erbij");
  klik(erbij.querySelector("button"));
  gelijk("het menu: een nieuw hoofdstuk, geen rekenblokken zolang alles staat", [...erbij.querySelectorAll(".rapport-menu-item")].map((b) => b.textContent), ["New chapter"]);
  klik(erbij.querySelector(".rapport-menu-item"));
  const nieuwHoofdstuk = regelVan(paneel0.plek, "New chapter");
  toets("het hoofdstuk staat in de opzet", !!nieuwHoofdstuk);
  toets("en valt weg zolang het leeg is", !!nieuwHoofdstuk.querySelector(".rapport-weg"));
  typ(nieuwHoofdstuk.querySelector('input[type="text"]'), "Eigen");
  typ(paneel0.plek.querySelector(`[aria-label="Title"][value="Eigen"]`) ?? regelVan(paneel0.plek, "Eigen").querySelector('input[type="text"]'), "Eigen hoofdstuk");
  gelijk("doortypen is één stap", m.useProjectStore.getState().verleden.length, 2);
  const eigenId = m.useProjectStore.getState().rapport.opzet.at(-1).id;
  gelijk("de titel hoort bij de taal van het rapport", m.useProjectStore.getState().rapport.opzet.at(-1).titel, { en: "Eigen hoofdstuk" });
  const tekstvak = [...paneel0.plek.querySelector(`[data-sectie="teksten-${eigenId}"]`).querySelectorAll("textarea")];
  gelijk("het formulier kent het nieuwe onderdeel, met een tekstvak", [koppenInSectie(paneel0.plek, `teksten-${eigenId}`), tekstvak.length], [["Eigen hoofdstuk"], 1]);
  toets("de sprongbalk ook", nav(paneel0.plek).some((t) => t === "Chapters" || t.startsWith("Chapter")));

  // Rekenblok weghalen en terugplaatsen.
  zetStand(nieuw("en"));
  klik(knopIn(regelVan(paneel0.plek, "Wind loads(Q)"), "Remove from the report"));
  gelijk("weg uit het formulier", koppenInSectie(paneel0.plek, "belastingen").some((k) => k.includes("Wind")), false);
  gelijk("en de nummers schuiven door", koppenInSectie(paneel0.plek, "belastingen")[1], "5.2Rainwater ponding(Q)");
  toets("een rekenblok staat niet in de lijst om terug te zetten", !m.useProjectStore.getState().rapport.weggehaald);
  const plus = knopIn(regelVan(paneel0.plek, "Loads"), "Add to Loads");
  klik(plus);
  const menu = regelVan(paneel0.plek, "Loads").querySelector(".rapport-menu");
  gelijk("in het menu van het hoofdstuk: een paragraaf en het blok", [...menu.querySelectorAll(".rapport-menu-item")].map((b) => b.textContent), ["New section", "Wind loads(Q)"]);
  klik([...menu.querySelectorAll(".rapport-menu-item")][1]);
  toets("weer geplaatst", koppenInSectie(paneel0.plek, "belastingen").some((k) => k.includes("Wind")));
  toets("achteraan zijn hoofdstuk en met zijn formulier", koppenInSectie(paneel0.plek, "belastingen").at(-1).includes("Wind") && !!paneel0.plek.querySelector('[data-sectie="belastingen"] .rapport-tabel'));

  // Tekst weghalen en terugzetten.
  zetStand(metTekst(nieuw("en"), "belendingen", "Over de buren"));
  klik(knopIn(regelVan(paneel0.plek, "Adjoining buildings"), "Remove from the report"));
  const rijWeg = paneel0.plek.querySelector(".rapport-opzet-lijst li");
  toets("in de lijst om terug te zetten", rijWeg?.textContent.includes("Adjoining buildings"));
  klik(rijWeg.querySelector(".rapport-knop"));
  const terugRapport = m.useProjectStore.getState().rapport;
  gelijk("terug, met zijn tekst", [terugRapport.teksten.belendingen, "opzet" in terugRapport], ["Over de buren", false]);
  toets("en weer in het formulier", [...paneel0.plek.querySelectorAll("textarea")].some((t) => t.value === "Over de buren"));

  // Zonder Berekeningen, met bladen.
  zetStand(verwijderKnoop(nieuw("en"), "berekeningen"));
  toets("geen sectie Berekeningen", !secties(paneel0.plek).includes("berekeningen"));
  toets("en het paneel zegt waar de bladen staan", paneel0.plek.querySelector('[data-sectie="opzet"] .rapport-melding-blok:not(.rustig)')?.textContent.includes("appendix A"));
  zetStand(verwijderKnoop(nieuw("en"), "berekeningen"), []);
  toets("zonder bladen is daar niets over te zeggen", !paneel0.plek.querySelector('[data-sectie="opzet"] .rapport-melding-blok:not(.rustig)'));

  // Geen Uitgangspunten, Belastingen of teksthoofdstukken.
  let leeg = nieuw("en");
  for (const id of ["inleiding", "projectgegevens", "constructie", "uitgangspunten", "belastingen", "berekeningen"]) leeg = verwijderKnoop(leeg, id);
  zetStand(leeg);
  gelijk("alles weg: alleen wat los van de opzet staat", secties(paneel0.plek), ["document", "revisies", "opzet", "bijlagen", "bureau"]);
  gelijk("en de sprongbalk ook", nav(paneel0.plek), ["Document", "Revisions", "Report structure", "Appendices", "Office"]);
  toets("de invulvelden blijven bereikbaar", !!paneel0.plek.querySelector(".rapport-invulvelden"));

  // Een hernoemd hoofdstuk in zijn sectie.
  zetStand(hernoemKnoop(nieuw("en"), "uitgangspunten", "Basis of design"));
  gelijk("de sectie heet zoals het hoofdstuk", sectieKoppen(paneel0.plek).find((k) => k.includes("Basis")), "4Basis of design");
  toets("en de sprongbalk ook", nav(paneel0.plek).includes("Basis of design"));

  // Een template toepassen en als standaard.
  const fmt = leesTemplate(JSON.stringify({ formaat: TEMPLATE_FORMAAT, versie: 1, naam: { en: "Own format" }, opzet: [{ id: "samenvatting", titel: { en: "Summary" }, inhoud: "tekst", nieuwePagina: true }, { id: "wind", inhoud: "wind" }], teksten: { samenvatting: [{ label: { en: "Short" }, tekst: { en: "Summary text" } }] } })).template;
  zetStand(nieuw("en"));
  let templateId;
  m.flushSync(() => { templateId = m.useTemplateStore.getState().bewaar(fmt); });
  const lijstRij = paneel0.plek.querySelector('[data-sectie="opzet"] .rapport-opzet-lijst li');
  toets("de eigen templates staan in de lijst", lijstRij.textContent.includes("Own format"));
  klik(lijstRij.querySelector(".rapport-knop"));
  gelijk("toepassen: de opzet van het template", titels(paneel0.plek), ["1 Summary", "2 Wind loads(Q)"]);
  toets("de tekst staat in het tekstvak", [...paneel0.plek.querySelectorAll("textarea")].some((t) => t.value === "Summary text"));
  toets("en het rapport zegt waar het vandaan komt", paneel0.plek.querySelector('[data-sectie="opzet"] .rapport-melding-blok.rustig').textContent.includes("Own format"));
  gelijk("het menu van de tekst noemt de variant van het template", (() => {
    const balk = [...paneel0.plek.querySelectorAll(".rapport-tekstveld")].find((v) => v.querySelector("textarea")?.value === "Summary text");
    klik(balk.querySelector(".rapport-knop"));
    return [...balk.querySelectorAll(".rapport-menu-label")].map((l) => l.textContent)[0];
  })(), "Short");
  klik([...paneel0.plek.querySelectorAll('[data-sectie="opzet"] .rapport-knop')].find((b) => b.textContent === "Back to built-in"));
  toets("terug naar ingebouwd", !("opzet" in m.useProjectStore.getState().rapport) && titels(paneel0.plek)[0] === "1 Introduction");

  // De standaard voor nieuwe rapporten.
  m.flushSync(() => m.useProjectStore.getState().nieuwProject());
  gelijk("zonder standaard: het ingebouwde", "opzet" in m.useProjectStore.getState().rapport, false);
  m.flushSync(() => m.useTemplateStore.getState().zetStandaard(templateId));
  gelijk("een rapport waar niemand aan zat, volgt de nieuwe standaard", ids(opzetVan(m.useProjectStore.getState().rapport)), ["samenvatting", "wind"]);
  m.flushSync(() => m.useProjectStore.getState().nieuwProject());
  gelijk("een nieuw project ook", ids(opzetVan(m.useProjectStore.getState().rapport)), ["samenvatting", "wind"]);
  m.flushSync(() => m.useProjectStore.getState().zetRapportVeld("kenmerk", "2026-001"));
  m.flushSync(() => m.useTemplateStore.getState().zetStandaard(null));
  gelijk("een rapport waar wel iets in staat, verandert niet", ids(opzetVan(m.useProjectStore.getState().rapport)), ["samenvatting", "wind"]);
  m.flushSync(() => m.useTemplateStore.getState().verwijder(templateId));
  gelijk("en het template verwijderen raakt het ook niet", [ids(opzetVan(m.useProjectStore.getState().rapport)), m.useProjectStore.getState().rapport.template.naam.en], [["samenvatting", "wind"], "Own format"]);
  paneel0.weg();
}

// ── 9. Het projectbestand ───────────────────────────────────────────────────
kop("9. Het projectbestand");
{
  let r = verwijderKnoop(metTekst(nieuw("nl"), "belendingen", "Tekst"), "belendingen");
  r = pasTemplateToe(r, leesTemplate(bestand({ huisstijl: { ...STANDAARD_HUISSTIJL, hoofdkleur: "#112233" }, land: "NL" })).template);
  r = hernoemKnoop(r, "inleiding", "Aanleiding");
  const payload = { versie: 2, naam: "Voorbeeld", gegevens: legeGegevens(), exemplaren: [], rapport: r };
  const gelezen = leesProjectBestand(bouwProjectBestand(payload, null), "voorbeeld").rapport;
  for (const veld of ["opzet", "varianten", "weggehaald", "template", "huisstijl"]) gelijk(`het veld ${veld} gaat mee in het bestand`, gelezen[veld], r[veld]);
  gelijk("en het hele rapport komt terug", gelezen, r);
  const velden = OCSS_SCHEMAS["ocss::rapport"].value.objectRestrictions.values;
  toets("het schema van het bestand kent ze", ["opzet", "varianten", "weggehaald", "template", "huisstijl"].every((v) => velden[v]?.optional === true));
  const oud = kloon(nieuw("nl"));
  gelijk("een oud bestand zonder template blijft zonder", leesProjectBestand(bouwProjectBestand({ ...payload, rapport: oud }, null), "voorbeeld").rapport, oud);
}

console.log(fouten === 0 ? "\nRapporttemplate: alles klopt." : `\n${fouten} controle(s) gezakt.`);
process.exit(fouten === 0 ? 0 : 1);
