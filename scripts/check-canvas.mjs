/**
 * Controle van het canvas-blad.
 *
 * Toetst:
 *   • de volgorde op positie: van boven naar beneden, bij gelijke hoogte van
 *     links naar rechts, en de bron staat altijd in die volgorde;
 *   • een variabele bestaat voor alles wat lager staat, en verschuiven verandert
 *     de uitkomst (met de hand nagerekend);
 *   • een fout blijft bij zijn eenheid, ook een blok dat niet wordt gesloten;
 *   • het merkteken breekt de rekentaal niet: een lezer zonder canvas-blad ziet
 *     een gewoon rekenblad met dezelfde uitkomsten;
 *   • opslaan en heropenen geeft hetzelfde, oude bestanden blijven leesbaar;
 *   • de verdeling over de vellen: een eenheid valt nooit over de vouw;
 *   • zoomen met Ctrl en scrollen: de richting, heen en terug, en de grenzen.
 *
 * Draaien:  node scripts/check-canvas.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { parse, evaluate, render } from "../packages/core/dist/index.js";
import {
  CANVAS_BLAD, EERSTE_VEL, EENHEID_MERK, INVOER_BREEDTE, RASTER_MM, VEL_BREEDTE, VEL_HOOGTE,
  isCanvasBlad, heeftEenheden, leesEenheden, schrijfEenheden, zetEenheid, verwijderEenheid,
  nieuwId, maxBreedte, opRaster, klemOpVel, velVan, velBegin, naastDeVouw, legOpVellen,
  ZOOM_MIN, ZOOM_MAX, zoomNaWiel,
} from "../packages/desktop/src/store/canvasBlad.ts";
import { rekenEenhedenDoor, rekenUitwerking } from "../packages/desktop/src/components/calc/canvasRekenen.ts";
import { bronVoorUitvoer } from "../packages/desktop/src/templates/vertalingen.ts";
import { liggerEn } from "../packages/desktop/src/templates/ligger.en.ts";
import { rekenDoor } from "../packages/desktop/src/mcp/rekenen.ts";
import { bouwProjectBestand, leesProjectBestand, PROJECT_FORMAAT_VERSIE, normaliseerExemplaar } from "../packages/desktop/src/store/projectBestand.ts";
import { bladenVoorIfc, projectIfcx } from "../packages/desktop/src/store/projectIfcx.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";
import { isLosBlad } from "../packages/desktop/src/store/spreadsheetBlad.ts";

let fouten = 0;
function meld(ok, tekst) {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}`);
  if (!ok) fouten++;
}
const dichtbij = (a, b) => Math.abs(a - b) < 1e-9;

/** Een eenheid met een vaste id, om de bron leesbaar op te bouwen. */
const E = (id, x, y, tekst) => ({ id, x, y, tekst });
/** De doorrekening van een stel eenheden, met de uitkomsten op id en het blad erbij. */
function reken(eenheden, waarden = {}, scope = {}) {
  const bron = schrijfEenheden(eenheden);
  const uit = rekenEenhedenDoor(bron, waarden, scope);
  const perId = Object.fromEntries(uit.map((u) => [u.eenheid.id, u]));
  return { bron, uit, perId };
}
/** De uitkomst van `naam` in deze eenheid: het getal, of de tekst van een fout. */
function waarde(u, naam) {
  const n = u?.nodes.find((k) => k.type === "assignment" && k.name === naam);
  if (!n) return undefined;
  return typeof n.waarde === "number" ? n.waarde : n.result;
}
const isFout = (w) => typeof w === "string" && w.startsWith("Error");

console.log("\nDe volgorde op positie");
{
  const { bron, uit } = reken([
    E("c", 0, 40, "c = 3"),
    E("rechts", 90, 20, "r = 2"),
    E("links", 10, 20, "l = 1"),
    E("boven", 120, 5, "t = 0"),
  ]);
  meld(uit.map((u) => u.eenheid.id).join() === "boven,links,rechts,c", "van boven naar beneden, bij gelijke hoogte van links naar rechts");
  const volgorde = leesEenheden(bron).map((e) => e.id).join();
  meld(volgorde === "boven,links,rechts,c", "de bron staat in de volgorde van doorrekenen");
  meld(bron.indexOf("t = 0") < bron.indexOf("l = 1") && bron.indexOf("l = 1") < bron.indexOf("r = 2"), "ook de tekst staat in die volgorde");
  // Ook wat op een andere manier in de bron kwam (de API, de code), leest op positie.
  const omgekeerd = [
    `${EENHEID_MERK} id=b x=0 y=50`, "b = a*2",
    `${EENHEID_MERK} id=a x=0 y=10`, "a = 4",
  ].join("\n");
  const los = rekenEenhedenDoor(omgekeerd, {}, {});
  meld(los[0].eenheid.id === "a" && dichtbij(waarde(los[1], "b"), 8), "een bron die niet op positie staat, rekent toch op positie: a = 4, b = 4·2 = 8");
}

console.log("\nEen variabele bestaat voor alles wat lager staat");
{
  // a = 2, b = a·3 = 6, a = 5, c = a·3 = 15.
  const onder = [E("a1", 0, 10, "a = 2"), E("b", 0, 20, "b = a*3"), E("a2", 0, 30, "a = 5"), E("c", 0, 40, "c = a*3")];
  const { perId } = reken(onder);
  meld(dichtbij(waarde(perId.b, "b"), 6), "b = a·3 = 2·3 = 6 met de bovenste a");
  meld(dichtbij(waarde(perId.c, "c"), 15), "c = a·3 = 5·3 = 15 met de a die er direct boven staat");

  // De tweede a omhoog, boven b: nu b = 5·3 = 15. Alles rekent opnieuw.
  const verschoven = zetEenheid(schrijfEenheden(onder), "a2", { y: 15 });
  const opnieuw = Object.fromEntries(rekenEenhedenDoor(verschoven, {}, {}).map((u) => [u.eenheid.id, u]));
  meld(dichtbij(waarde(opnieuw.b, "b"), 15), "a = 5 omhoog boven b: b = 5·3 = 15");
  meld(dichtbij(waarde(opnieuw.c, "c"), 15), "c blijft 5·3 = 15");

  // b boven elke a: daar bestaat a nog niet. De fout staat bij b en verder nergens.
  const bovenaan = zetEenheid(schrijfEenheden(onder), "b", { y: 5 });
  const hoog = Object.fromEntries(rekenEenhedenDoor(bovenaan, {}, {}).map((u) => [u.eenheid.id, u]));
  meld(isFout(waarde(hoog.b, "b")), "b boven elke a: a bestaat daar nog niet, b krijgt een fout");
  meld(dichtbij(waarde(hoog.c, "c"), 15), "c eronder rekent gewoon door: 5·3 = 15");

  // Naast elkaar op gelijke hoogte: links rekent eerst.
  const naast = reken([E("r", 90, 10, "q = p + 1"), E("l", 10, 10, "p = 1")]);
  meld(dichtbij(waarde(naast.perId.r, "q"), 2), "rechts ziet wat links op gelijke hoogte staat: q = 1 + 1 = 2");
  const gewisseld = reken([E("r", 10, 10, "q = p + 1"), E("l", 90, 10, "p = 1")]);
  meld(isFout(waarde(gewisseld.perId.r, "q")), "links ziet niet wat rechts op gelijke hoogte staat");

  // Eenheden en de projectgegevens gaan mee; #round geldt vanaf zijn eigen plek.
  const { perId: metEenheid } = reken([E("l", 0, 0, "L = 5 m"), E("m", 0, 10, "M = q*L^2/8 to kN*m")], {}, { q: 8 * 1 });
  meld(isFout(waarde(metEenheid.m, "M")) === true, "q = 8 zonder eenheid geeft in M een fout in plaats van een stille waarde");
  const invoer = reken([E("f", 0, 0, "F = ?{10} kN"), E("d", 0, 10, "V = F*2")], { F: "25" });
  meld(invoer.perId.d.nodes[0].result.startsWith("50"), "de invoer van het blad rekent mee: V = 25·2 = 50 kN");
}

console.log("\nEen fout blijft bij zijn eenheid");
{
  const gevallen = [
    ["een syntaxfout", "x = (1 +"],
    ["een onbekende naam", "x = bestaat_niet*2"],
    ["een #if zonder #end if", "#if 1 > 0\nx = 1"],
    ["een #if die niet doorgaat, zonder #end if", "#if 1 < 0\nx = 1"],
    ["een #hide zonder #show", "#hide\nx = 1"],
    ["een @svg zonder @end", "@svg\n<svg></svg>"],
    ["een @select zonder @end", '@select k "Keuze"\nA = 1'],
    ["een @3d zonder @end", "@3d\nbalk 0 0 0 1 0 0 1 1"],
    ["een #break buiten een lus", "#break"],
    ["een #continue buiten een lus", "#continue"],
    ["een #repeat zonder #loop", "#repeat 2\nx = 1"],
    ["een #def zonder #end def", "#def m(a)\n'a"],
    ["een tekenreeks die niet sluit", 'x = "open'],
  ];
  for (const [naam, tekst] of gevallen) {
    const { perId } = reken([E("voor", 0, 0, "a = 2"), E("fout", 0, 10, tekst), E("na", 0, 20, "b = a*3")]);
    const goed = dichtbij(waarde(perId.voor, "a"), 2) && dichtbij(waarde(perId.na, "b"), 6);
    meld(goed && perId.na.nodes.length === 1, `${naam}: de eenheid eronder rekent gewoon door (b = 2·3 = 6)`);
  }
  const { perId } = reken([E("fout", 0, 0, "x = (1 +"), E("na", 0, 10, "y = x")]);
  meld(isFout(waarde(perId.fout, "x")), "de fout staat bij de eenheid zelf");
  meld(render(perId.fout.nodes).includes("calc-error"), "en komt in de uitwerking als foutregel");

  // Wat buiten de vangnetten van de kern omvalt: een invoer die bij het lezen werpt.
  const omval = {};
  Object.defineProperty(omval, "F", { get() { throw new Error("proef"); }, enumerable: true });
  const val = reken([E("voor", 0, 0, "a = 2"), E("f", 0, 10, "F = ?{1}"), E("na", 0, 20, "b = a*3")], omval);
  meld(dichtbij(waarde(val.perId.voor, "a"), 2) && dichtbij(waarde(val.perId.na, "b"), 6), "valt een eenheid helemaal om, dan rekenen de andere door: b = 2·3 = 6");
  meld(val.perId.f.nodes[0]?.text === "Error: proef", "en de melding staat bij die eenheid");

  // Opdrachten lopen door naar wat lager staat, net als in een gewoon blad; #hide blijft in zijn eenheid.
  const opdracht = reken([E("o", 0, 0, "#val"), E("a", 0, 10, "a = 1 + 1"), E("h", 0, 20, "#hide\nc = 3"), E("z", 0, 30, "d = c + a")]);
  meld(opdracht.perId.a.nodes[0].weergave === "val", "#val geldt ook voor de eenheid eronder");
  meld(opdracht.perId.h.nodes.length === 0, "#hide verbergt wat in zijn eigen eenheid staat");
  meld(dichtbij(waarde(opdracht.perId.z, "d"), 5), "en de eenheid eronder rekent ermee en blijft zichtbaar: 3 + 2 = 5");
}

console.log("\nDe rekentaal blijft heel");
{
  const merk = `${EENHEID_MERK} id=a x=12.5 y=40`;
  meld(parse(merk).length === 0, "het merkteken levert voor de rekentaal niets op");
  meld(merk.startsWith("//"), "het is een gewoon commentaar, dus ook een oudere lezer slaat het over");

  // Hetzelfde blad gelezen als gewone rekentekst, zonder iets van eenheden te weten.
  const eenheden = [
    E("kop", 0, 0, '"Ligger — proefblad'),
    E("b", 0, 20, "b = 200 mm', breedte'"),
    E("h", 60, 20, "h = 300 mm"),
    E("w", 0, 40, "W = b*h^2/6 to mm^3"),
    E("uc", 0, 60, "UC_max = 0.8"),
    E("slot", 0, 80, "'Maatgevende UC = 0,80 → voldoet"),
  ];
  const bron = schrijfEenheden(eenheden);
  const kaal = evaluate(parse(bron), {}, {});
  const perEenheid = rekenEenhedenDoor(bron, {}, {}).flatMap((u) => u.nodes);
  const kort = (nodes) => nodes.map((n) => `${n.type}:${n.name ?? ""}:${n.result ?? n.text ?? ""}`).join("|");
  meld(kort(kaal) === kort(perEenheid), "als gewone tekst dezelfde regels als eenheid voor eenheid");
  // W = 200·300²/6 = 3 000 000 mm³.
  const w = kaal.find((n) => n.name === "W");
  meld(dichtbij(w.waarde, 3000000), "W = 200·300²/6 = 3 000 000 mm³");

  const met = schrijfEenheden([E("a", 0, 0, `x = 1\n${EENHEID_MERK} id=vals x=0 y=0\ny = 2`)]);
  const terug = leesEenheden(met);
  meld(terug.length === 1 && terug[0].tekst.includes("y = 2"), "een merkteken in de ingetypte tekst splitst de eenheid niet");

  meld(leesEenheden("").length === 0, "een lege bron heeft geen eenheden");
  const zonder = leesEenheden("a = 1\nb = 2");
  meld(zonder.length === 1 && zonder[0].x === 0 && zonder[0].y === 0 && zonder[0].tekst === "a = 1\nb = 2", "tekst zonder merkteken wordt één eenheid bovenaan");
  const voor = leesEenheden(`a = 1\n${EENHEID_MERK} id=z x=0 y=50\nb = a`);
  meld(voor.length === 2 && voor[0].tekst === "a = 1" && voor[1].id === "z", "tekst vóór het eerste merkteken blijft bewaard");
  const vreemd = leesEenheden(`${EENHEID_MERK} id=q x=abc y=-20\na = 1\n${EENHEID_MERK} id=q x=5 y=9999999\nb = 2`);
  meld(vreemd[0].x === 0 && vreemd[0].y === 0, "een positie die geen getal is of negatief, wordt 0");
  meld(vreemd[0].id !== vreemd[1].id, "twee keer dezelfde id wordt uit elkaar gehouden");
  meld(velVan(vreemd[1].y) < 250, "een uitschieter in de positie levert geen duizenden vellen op");
  meld(!heeftEenheden("a = 1") && heeftEenheden(`${EENHEID_MERK} id=a x=0 y=0\na = 1`), "een blad zonder merkteken rekent gewoon door");
  meld(leesEenheden(schrijfEenheden([E("a", 0, 0, "   ")])).length === 0, "een lege eenheid verdwijnt uit de bron");
  meld(verwijderEenheid(schrijfEenheden([E("a", 0, 0, "a = 1"), E("b", 0, 9, "b = 2")]), "a").includes("id=a") === false, "verwijderen haalt merkteken en tekst weg");
  const ids = new Set(); for (let i = 0; i < 50; i++) ids.add(nieuwId(ids));
  meld(ids.size === 50, "een nieuwe id is steeds een andere");

  // Dezelfde route voor de API en het IFCX: een fout blijft ook daar bij zijn eenheid.
  const route = rekenDoor(schrijfEenheden([E("f", 0, 0, "#if 1 < 0\nx = 1"), E("u", 0, 10, "UC_max = 0.5")]), {}, {}, "Proef");
  meld(route.resultaat.uc === 0.5, "de rekenroute van API en IFCX leest de UC onder een blok zonder #end if");

  // De route van de worker en de afdruk: een gewone tekst blijft één uitwerking.
  const gewoon = rekenUitwerking("a = 2\nb = a*3", {}, {}, {});
  meld(gewoon.eenheden === undefined && gewoon.html.includes("calc-line"), "een gewone tekst heeft geen eenheden");
  const opEenheden = rekenUitwerking(bron, {}, {}, {});
  meld(opEenheden.eenheden.length === eenheden.length, "een tekst met merktekens levert elke eenheid apart");
  meld(opEenheden.eenheden.every((e) => e.html.includes('class="ifc-calc"')), "elk in de opmaak van de uitwerking");
  meld(opEenheden.eenheden[1].x === 0 && opEenheden.eenheden[1].y === 20 && opEenheden.eenheden[2].x === 60, "met zijn positie");

  // De vertaling van de uitvoer laat de merktekens staan.
  const vertaald = bronVoorUitvoer(schrijfEenheden([E("a", 0, 0, `"${liggerEn.marker}`), E("b", 30, 10, "x = 1")]), "en");
  meld(leesEenheden(vertaald.bron).map((e) => `${e.id}:${e.x}:${e.y}`).join() === "a:0:0,b:30:10", "de vertaling van de uitvoer laat de merktekens staan");
}

console.log("\nHet projectbestand");
{
  const eenheden = [
    E("a", 10, 15, "a = 2"),
    E("b", 95, 15, "UC_max = a/4"),
    E("c", 0, 225, "'Maatgevende UC = 0,50 → voldoet"),
  ];
  const source = schrijfEenheden(eenheden);
  const project = {
    versie: PROJECT_FORMAAT_VERSIE,
    naam: "Proef",
    gegevens: legeGegevens(),
    rapport: undefined,
    exemplaren: [
      { id: "ex-reken", naam: "Reken", templateId: "", source: "a = 2", waarden: {}, elementen: [] },
      { id: "ex-canvas", naam: "Canvas", templateId: CANVAS_BLAD, source, waarden: { F: "12" }, elementen: [] },
    ],
  };
  const bladen = bladenVoorIfc(project);
  const blad = bladen.find((b) => b.id === "ex-canvas");
  meld(blad.resultaat?.uc === 0.5, "de kop van het blad leest de UC: 2/4 = 0,50");
  meld(blad.resultaat?.voldoet === true, "en het oordeel uit de slotzin");

  const tekst = bouwProjectBestand(project, bladen);
  const terug = leesProjectBestand(tekst, "proef");
  const open = terug.exemplaren.find((e) => e.id === "ex-canvas");
  meld(open.source === source, "de bron komt letterlijk terug");
  meld(open.templateId === CANVAS_BLAD && isCanvasBlad(open), "het blijft een canvas-blad");
  meld(open.waarden.F === "12", "de invoer komt terug");
  const a = leesEenheden(source);
  const b = leesEenheden(open.source);
  meld(JSON.stringify(a) === JSON.stringify(b), "dezelfde eenheden op dezelfde posities");
  meld(dichtbij(waarde(rekenEenhedenDoor(open.source, {}, {})[1], "UC_max"), 0.5), "na heropenen dezelfde uitkomst: 2/4 = 0,50");

  const doc = projectIfcx(project, bladen);
  const knoop = doc.data.find((k) => k.attributes?.["ocss::blad"]?.id === "ex-canvas");
  meld(knoop.attributes["ocss::blad"].soort === "rekenblad", "in het IFCX is het een rekenblad");
  meld(knoop.attributes["ocss::blad::rekentekst"]?.tekst === source || JSON.stringify(knoop.attributes["ocss::blad::rekentekst"]).includes("id=a"), "met de merktekens in de rekentekst");

  meld(!isLosBlad({ templateId: CANVAS_BLAD }), "een canvas-blad is geen los blad: het heeft rekentekst");
  const zonder = normaliseerExemplaar({ id: "x", naam: "Los", templateId: CANVAS_BLAD }, "n");
  meld(isCanvasBlad(zonder) && zonder.source === "", "een canvas-blad zonder tekst opent leeg");
  const oud = leesProjectBestand(JSON.stringify({ project: { exemplaren: [{ id: "o", naam: "Oud", templateId: "leeg", source: "a = 1\nb = a", waarden: {} }] } }), "oud");
  meld(oud.exemplaren[0].source === "a = 1\nb = a" && !isCanvasBlad(oud.exemplaren[0]), "een oud bestand zonder canvas-blad blijft zoals het was");
  const kaal = leesProjectBestand("a = 1\nb = a", "kaal");
  meld(kaal.exemplaren[0].source.includes("b = a") && !isCanvasBlad(kaal.exemplaren[0]), "een kale rekentekst opent als gewoon blad");
  meld(rekenDoor("a = 1\nb = a*2", {}, {}, "Oud").getallen.b === 2, "en een gewoon blad rekent langs de gewone route: b = 1·2 = 2");
}

console.log("\nHet raster en de vellen");
{
  meld(opRaster(12) === 10 && opRaster(13) === 15 && opRaster(-3) === 0, `op het raster van ${RASTER_MM} mm`);
  const k = klemOpVel(500, -10);
  meld(k.x <= VEL_BREEDTE && k.y === 0, "een positie blijft op het vel");
  meld(EERSTE_VEL % RASTER_MM === 0 && VEL_HOOGTE % RASTER_MM === 0, "de vouwen vallen op het raster");
  meld(maxBreedte(10) === VEL_BREEDTE - 10 && maxBreedte(170) === INVOER_BREEDTE, "een eenheid mag tot de rechterrand, en is nooit smaller dan de invoer");

  meld(velVan(0) === 0 && velVan(EERSTE_VEL - 1) === 0, "bovenaan: het eerste vel");
  meld(velVan(EERSTE_VEL) === 1 && velBegin(1) === EERSTE_VEL, "op de vouw: het volgende vel");
  meld(velVan(EERSTE_VEL + VEL_HOOGTE) === 2 && velBegin(2) === EERSTE_VEL + VEL_HOOGTE, "zo ook de vouw daarna");

  meld(naastDeVouw(EERSTE_VEL - 5, 20) === EERSTE_VEL, "over de vouw: naar het begin van het volgende vel");
  meld(naastDeVouw(EERSTE_VEL - 20, 20) === EERSTE_VEL - 20, "tot op de vouw mag blijven staan");
  meld(naastDeVouw(EERSTE_VEL - 5, VEL_HOOGTE + 50) === EERSTE_VEL - 5, "wat hoger is dan een vel, helpt verschuiven niet");

  const maat = (x, y, b, h) => ({ x, y, b, h });
  const vast = legOpVellen([maat(10, 15, 40, 20), maat(60, EERSTE_VEL + 10, 40, 20)]);
  meld(vast[0].vel === 0 && vast[0].y === 15 && vast[0].x === 10, "de positie blijft behouden op het eerste vel");
  meld(vast[1].vel === 1 && vast[1].y === 10 && vast[1].x === 60, "en op het volgende, gemeten vanaf zijn bovenrand");

  // Een eenheid die over de vouw zou vallen, begint het volgende vel; wat eronder staat schuift evenveel mee.
  // Ze staat op EERSTE_VEL − 10 met h = 30: schuift 10 mm. De volgende op EERSTE_VEL + 40 komt dan op 50.
  const over = legOpVellen([maat(0, EERSTE_VEL - 10, 40, 30), maat(0, EERSTE_VEL + 40, 40, 10)]);
  meld(over[0].vel === 1 && over[0].y === 0, "over de vouw: begint het volgende vel");
  meld(over[1].vel === 1 && over[1].y === 50, "wat eronder staat, schuift 10 mm mee: 40 + 10 = 50");
  const breed = legOpVellen([maat(150, 0, 60, 10)]);
  meld(breed[0].x === VEL_BREEDTE - 60, "te breed voor zijn plek: naar links tot hij op het vel past");
  const tebreed = legOpVellen([maat(150, 0, VEL_BREEDTE + 30, 10)]);
  meld(tebreed[0].x === 0, "breder dan het vel: tegen de linkerrand");
  const hoog = legOpVellen([maat(0, 10, 40, VEL_HOOGTE + 100)]);
  meld(hoog[0].vel === 0 && hoog[0].y === 10, "hoger dan een vel: blijft staan, verschuiven helpt niet");
}

console.log("\nZoomen met Ctrl en scrollen");
{
  // Eén tik van een muiswiel is ±100.
  meld(zoomNaWiel(1, -100) > 1, "omhoog scrollen zoomt in");
  meld(zoomNaWiel(1, 100) < 1, "omlaag scrollen zoomt uit");
  meld(Math.abs(zoomNaWiel(zoomNaWiel(1, -100), 100) - 1) < 1e-9, "een tik heen en terug: weer 100%");
  meld(zoomNaWiel(ZOOM_MAX, -100) === ZOOM_MAX, "verder inzoomen dan de bovengrens kan niet");
  meld(zoomNaWiel(ZOOM_MIN, 100) === ZOOM_MIN, "verder uitzoomen dan de ondergrens kan niet");
}

console.log(fouten === 0 ? "\nAlles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
