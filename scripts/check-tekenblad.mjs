/**
 * Controle van de bladsoort Tekenblad (store/tekenBlad.ts, components/tekenen/vel.ts).
 *
 * Toetst:
 *   • het papier: A4, A3 en A2, staand en liggend, in mm volgens ISO 216;
 *   • schaal en maten, met de hand nagerekend: wat in het echt een maat heeft,
 *     komt op die schaal op papier, en een andere schaal verandert de tekening
 *     niet; lijndikte en tekst blijven op papier even groot;
 *   • de elementen: wand, kanaalplaat, stramien met maatvoering, niveau, en de
 *     schematiseringen, met de kleuren en arceringen van Open PDF Studio;
 *   • de bediening rekent in echte maat: snappen, verplaatsen, draaien;
 *   • twee keer hetzelfde profiel is één `<symbol>`, ook over views heen;
 *   • opslaan en heropenen geeft hetzelfde vel, naast een rekenblad en een PDF;
 *   • oude bestanden blijven leesbaar, en een bestand van iemand anders kan via het
 *     vel geen eigen opmaak of scripts binnenbrengen.
 *
 * Draaien:  node scripts/check-tekenblad.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { DOMParser, Node } from "./lib/mini-dom.mjs";

globalThis.DOMParser = DOMParser;
globalThis.Node = Node;

const hier = dirname(fileURLToPath(import.meta.url));
const src = join(hier, "../packages/desktop/src");
const laad = (pad) => import(pathToFileURL(join(src, pad)).href);

const TB = await laad("store/tekenBlad.ts");
const V = await laad("components/tekenen/vel.ts");
const Y = await laad("components/tekenen/symbolen.ts");
const M = await laad("components/tekenen/model.ts");
const SN = await laad("components/tekenen/snap.ts");
const BW = await laad("components/tekenen/bewerk.ts");
const CM = await laad("components/tekenen/commando.ts");
const PB = await laad("store/projectBestand.ts");
const PI = await laad("store/projectIfcx.ts");
const PG = await laad("store/projectGegevens.ts");
const SB = await laad("store/spreadsheetBlad.ts");

let fouten = 0;
function meld(ok, tekst) {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}`);
  if (!ok) fouten++;
}
const dicht = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
/** Beeldpunten op papier per mm op papier: 96 dpi. */
const PX = 96 / 25.4;
const stijl = { ...M.STANDAARD_STIJL, lijn: "#000000", dikte: 1 };
const inModel = (o = {}) => ({ schaal: String(V.MODEL_SCHAAL), ...o });
const telMatches = (s, re) => [...s.matchAll(re)].length;
/** Vergelijken op inhoud: de volgorde van de sleutels telt niet. */
const orden = (x) => (Array.isArray(x) ? x.map(orden) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, orden(x[k])])) : x);
const inhoud = (x) => JSON.stringify(orden(x));

console.log("\nPapier");
for (const [formaat, kort, lang] of [["A4", 210, 297], ["A3", 297, 420], ["A2", 420, 594]]) {
  const st = TB.velMaat({ formaat, ligging: "staand" });
  const li = TB.velMaat({ formaat, ligging: "liggend" });
  meld(st.breedte === kort && st.hoogte === lang && li.breedte === lang && li.hoogte === kort, `${formaat}: ${kort} × ${lang} mm, staand en liggend`);
}
const a3 = V.velSvg(V.nieuwVel("V"));
meld(a3.includes('width="420mm"') && a3.includes('height="297mm"'), "een nieuw vel is A3 liggend, op zijn echte maat in mm");
// 420 mm × 96/25,4 = 1587,40 px; 297 mm × 96/25,4 = 1122,52 px.
meld(a3.includes('viewBox="0 0 1587.4 1122.52"'), "de viewBox van A3 liggend is 1587,4 × 1122,52 px (96 dpi)");

// Een algemene @page in een later stijlbestand gaat in de browser boven een benoemde regel in een
// eerder bestand: dan komt een vel van A3 stil op A4 terecht. Daarom staan ze ná de algemene regel.
const printCss = readFileSync(join(src, "components/calc/PrintDocument.css"), "utf8");
const algemeen = printCss.search(/@page\s*\{/);
for (const [formaat, ligging] of [["A4", "staand"], ["A4", "liggend"], ["A3", "staand"], ["A3", "liggend"], ["A2", "staand"], ["A2", "liggend"]]) {
  const m = TB.velMaat({ formaat, ligging });
  const regel = `@page ${V.paginaNaam({ formaat, ligging })} { size: ${m.breedte}mm ${m.hoogte}mm; margin: 0;`;
  meld(printCss.indexOf(regel) > algemeen && algemeen >= 0, `${formaat} ${ligging} heeft een eigen @page van ${m.breedte} × ${m.hoogte} mm, ná de algemene regel`);
}

console.log("\nSchaal en maten, met de hand nagerekend");
const lijn = M.nieuweVorm("lijn", { x1: 0, y1: 0, x2: 5400, y2: 0 }, stijl);
// 5400 mm op 1:50 is 108 mm op papier: 108 × 96/25,4 = 408,1890 px.
meld(dicht(V.vormOpPapier(lijn, 50).p.x2.v, 408.18898, 1e-4), "5400 mm op 1:50 is 108 mm op papier (408,19 px)");
// Op 1:100 is dat 54 mm: de helft.
meld(dicht(V.vormOpPapier(lijn, 100).p.x2.v, 204.09449, 1e-4), "5400 mm op 1:100 is 54 mm op papier (204,09 px)");
meld(V.vormOpPapier(lijn, 100).dikte === lijn.dikte && V.vormOpPapier(lijn, 5).dikte === lijn.dikte, "de lijndikte staat in px op papier en verandert niet met de schaal");
const txt = M.nieuweVorm("tekst", { x: 1000, y: 2000 }, stijl, { tekst: "T" });
meld(V.vormOpPapier(txt, 100).grootte === txt.grootte, "de tekstgrootte staat in px op papier en verandert niet met de schaal");
// Een view van 100 × 80 mm op 1:50 laat 5000 × 4000 mm zien; op 1:100 het dubbele.
meld(V.viewBereik({ breedte: 100, hoogte: 80, schaal: 50 }).breedte === 5000 && V.viewBereik({ breedte: 100, hoogte: 80, schaal: 100 }).hoogte === 8000, "wat een view laat zien: papiermaat × schaal");

const view = { id: "a", titel: "A", x: 20, y: 20, breedte: 100, hoogte: 80, schaal: 50, x0: 1000, y0: 2000, elementen: [lijn] };
const op100 = V.zetViewSchaal(view, 100);
meld(op100.elementen === view.elementen && op100.x === 20 && op100.breedte === 100, "een andere schaal laat de tekening en het kader op papier staan");
// Midden was 1000 + 5000/2 = 3500; op 1:100 is de view 10000 breed: x0 = 3500 − 5000 = −1500.
meld(op100.x0 === -1500 && op100.y0 === 0, "het midden van wat je ziet blijft op zijn plek (x0 −1500, y0 0)");
meld(V.zetViewSchaal(V.zetViewSchaal(view, 100), 50).x0 === view.x0, "terug op de oude schaal staat alles weer zoals het was");
const tv = V.tekeningVanView(view);
meld(tv.breed.v === 5000 && tv.hoog.v === 4000 && tv.x0 === 1000 && tv.elementen === view.elementen, "de editor krijgt het bereik in echte maat en de vormen zoals ze zijn");

console.log("\nMaatlijnen volgen de echte maat");
const maat = M.nieuweVorm("maat", { x1: 0, y1: 0, x2: 5400, y2: 0, offset: -500 }, stijl, { tekst: "5400" });
meld(V.vormOpPapier(maat, 50).tekst === "5400" && V.vormOpPapier(maat, 200).tekst === "5400", "het label is op elke schaal de echte maat");
const langer = { ...maat, p: { ...maat.p, x2: { v: 7200 } } };
meld(V.vormOpPapier(langer, 50).tekst === "7200", "wordt de maatlijn langer, dan volgt een getal als label");
meld(V.vormOpPapier({ ...maat, tekst: "L" }, 50).tekst === "L", "een eigen tekst als label blijft staan");
// De afstand tot wat hij meet is in het echt −500 mm: −10 mm op papier op 1:50 = −37,795 px.
meld(dicht(V.vormOpPapier(maat, 50).p.offset.v, -37.79528, 1e-4), "de afstand van een maatlijn staat in echte maat en schaalt mee");

console.log("\nStaal op schaal");
const heb = Y.nieuwSymbool("staal", { x: 0, y: 0 }, stijl, inModel({ familie: "HEB", maat: "HEB 200" }));
const heb50 = V.vormOpPapier(heb, 50);
// De tekenschaal wordt die van de view: 1:50; HEB 200 is 200 mm breed: 4 mm op papier = 15,118 px.
meld(heb50.o.schaal === "50" && dicht(Y.profielSchaal(heb50.o) * heb50.p.b.v, 15.11811, 1e-4), "HEB 200 op 1:50 is 4 mm breed op papier (15,12 px)");
meld(heb50.p.b.v === 200 && heb50.p.tw.v === heb.p.tw.v, "de profielmaten blijven in mm");
const ligger = Y.nieuwSymbool("staal", { x1: 0, y1: 0, x2: 6000, y2: 0 }, stijl, inModel({ familie: "IPE", maat: "IPE 300", aanzicht: "boven" }));
// Een ligger van 6000 mm op 1:50: 120 mm op papier = 453,54 px.
meld(dicht(V.vormOpPapier(ligger, 50).p.x2.v, 453.54331, 1e-4), "een ligger in aanzicht heeft zijn echte lengte op schaal");
meld(dicht(Y.aanzichtLengte(ligger, Y.getekend(ligger)), 6000), "in de modelmaat meet de ligger 6000 mm");

console.log("\nStramien met assen en maatvoering");
meld(JSON.stringify(V.leesVeldmaten("5400 5400 7200")) === "[5400,5400,7200]", "veldmaten: 5400 5400 7200");
meld(JSON.stringify(V.leesVeldmaten("3x5400 7200")) === "[5400,5400,5400,7200]", "veldmaten: 3x5400 7200");
meld(V.leesVeldmaten("5,4 6") === null, "een maat in meters (5,4) wordt niet stilletjes 5 mm");
meld(V.leesVeldmaten("abc") === null && V.leesVeldmaten("") === null, "onleesbare veldmaten geven niets");
meld(V.asLetter(0) === "A" && V.asLetter(25) === "Z" && V.asLetter(26) === "AA" && V.asLetter(27) === "AB", "asletters A … Z, AA, AB");
const raster = V.stramienRaster({ x: [5400, 5400, 7200], y: [6000, 6000], x0: 1000, y0: 2000, uitloop: 1500, maatvoering: true }, stijl);
const assen = raster.filter((v) => v.sym === "stramien");
const maten = raster.filter((v) => v.soort === "maat");
// 4 verticale assen en 3 horizontale.
meld(assen.length === 7, "3 velden x en 2 velden y geven 4 + 3 assen");
meld(assen.slice(0, 4).map((a) => a.o.label).join() === "1,2,3,4" && assen.slice(4).map((a) => a.o.label).join() === "A,B,C", "de assen heten 1, 2, 3, 4 en A, B, C");
// x-posities: 1000, 6400, 11800, 19000.
meld(assen.slice(0, 4).map((a) => a.p.x1.v).join() === "1000,6400,11800,19000", "de verticale assen staan op 1000, 6400, 11800 en 19000");
// y-posities: 2000, 8000, 14000; de lijnen lopen 1500 door: 500 … 15500.
meld(assen.slice(4).map((a) => a.p.y1.v).join() === "2000,8000,14000" && assen[0].p.y1.v === 500 && assen[0].p.y2.v === 15500, "de horizontale assen staan op 2000, 8000 en 14000, de lijnen lopen 1500 mm door");
meld(assen.every((a) => a.lijn === "#000000"), "stramienen zijn zwart, net als in Open PDF Studio");
const labels = maten.map((v) => V.vormOpPapier(v, 100).tekst).sort();
// Per veld 5400, 5400, 7200 en 6000, 6000; totaal 18000 en 12000.
meld(labels.join() === ["12000", "18000", "5400", "5400", "6000", "6000", "7200"].sort().join(), "de maatketens: elk veld en de totalen 18000 en 12000");
const zonder = V.stramienRaster({ x: [5400], y: [6000], x0: 0, y0: 0, uitloop: 1000, maatvoering: false }, stijl);
meld(zonder.every((v) => v.soort !== "maat") && zonder.length === 4, "zonder maatvoering alleen de assen");
const stramienSvg = V.velSvg({ formaat: "A3", ligging: "liggend", views: [{ ...view, x0: 0, y0: 0, elementen: raster }] });
meld(stramienSvg.includes("stroke-dasharray"), "een stramienlijn is een streep-puntlijn");

console.log("\nWanden en vloeren: maten en kleuren");
const wand = Y.nieuwSymbool("wand", { x1: 0, y1: 0, x2: 4000, y2: 0 }, stijl, inModel({ materiaal: "metselwerk", dikteMm: "100" }));
const wandSvg = V.velSvg({ formaat: "A3", ligging: "liggend", views: [{ ...view, x0: 0, y0: 0, elementen: [wand] }] });
// 100 mm op 1:50 is 2 mm op papier = 7,559 px; 4000 mm is 80 mm = 302,36 px.
meld(wandSvg.includes('height="7.56"') && wandSvg.includes('width="302.36"'), "een wand van 100 × 4000 mm op 1:50: 7,56 × 302,36 px");
for (const m of Y.WAND_MATERIALEN.filter((x) => x.id !== "geen")) {
  const w = { ...wand, o: { ...wand.o, materiaal: m.id } };
  const s = V.velSvg({ formaat: "A3", ligging: "liggend", views: [{ ...view, elementen: [w] }] });
  meld(s.includes(`fill:${m.vlak}`) && s.includes(`stroke:${m.lijn}`), `${m.id}: vlak ${m.vlak}, arcering ${m.lijn}`);
}
// De kleuren uit de afspraken van Open PDF Studio; hier met de hand vastgelegd.
const kleur = (id) => Y.WAND_MATERIALEN.find((m) => m.id === id).vlak;
meld(kleur("metselwerk") === "#CD7C61" && kleur("kalkzandsteen") === "#C0C0C0" && kleur("prefab") === "#808080", "metselwerk #CD7C61, kalkzandsteen #C0C0C0, prefab #808080");
const geen = V.velSvg({ formaat: "A3", ligging: "liggend", views: [{ ...view, elementen: [{ ...wand, o: { ...wand.o, materiaal: "geen" } }] }] });
meld(!/fill:#CD7C61/.test(geen), "'geen arcering' heeft geen vlak");

const veld = Y.nieuwSymbool("kanaalplaat", { x: 0, y: 0, w: 6000, h: 3600 }, stijl, inModel({ hoogteMm: "200", richting: "x" }));
const veldSvg = V.velSvg({ formaat: "A3", ligging: "liggend", views: [{ ...view, x0: 0, y0: 0, elementen: [veld] }] });
// Veld 3600 breed, platen 1200: naden op 1200 en 2400; op 1:50 is dat 24 mm = 90,71 px en 181,42 px.
meld(veldSvg.includes("M 0 90.71 H") && veldSvg.includes("M 0 181.42 H") && !veldSvg.includes("M 0 272.13 H"), "kanaalplaatveld 3600 mm: naden om de 1200 mm, geen naad op de rand");
meld(veldSvg.includes("KP 200"), "het veld draagt zijn plaathoogte");
const veldY = { ...veld, o: { ...veld.o, richting: "y" } };
const veldYSvg = V.velSvg({ formaat: "A3", ligging: "liggend", views: [{ ...view, x0: 0, y0: 0, elementen: [veldY] }] });
// Overspanning verticaal: de naden staan nu verticaal, om de 1200 mm over 6000: 4 stuks.
meld(telMatches(veldYSvg, /M [\d.]+ 0 V 272\.13/g) === 4, "overspanning verticaal: de naden staan verticaal");

const doorsnede = Y.nieuwSymbool("kanaalplaatdoorsnede", { x1: 0, y1: 0, x2: 2400, y2: 0 }, stijl, inModel({ hoogteMm: "200" }));
const dsSvg = V.velSvg({ formaat: "A3", ligging: "liggend", views: [{ ...view, x0: 0, y0: 0, elementen: [doorsnede] }] });
meld(dsSvg.includes("fill:#8A8A8A") && dsSvg.includes("stroke:#3C3C3C"), "beton in doorsnede: grijs #8A8A8A met arcering #3C3C3C");
// Twee platen van 1200 mm met elk 7 kanalen.
meld(telMatches(dsSvg, /<rect [^>]*rx="/g) === 14, "twee platen van 200 mm hoog: 14 kanalen");
const niveau = Y.nieuwSymbool("niveau", { x1: 0, y1: 0, x2: 5000, y2: 0 }, stijl, { tekst: "+3000" });
const nivSvg = V.velSvg({ formaat: "A3", ligging: "liggend", views: [{ ...view, x0: 0, y0: 0, elementen: [niveau] }] });
meld(nivSvg.includes("stroke-dasharray") && nivSvg.includes("&#43;3000"), "een niveau: een streeplijn met zijn peiltekst");

console.log("\nSchematisering op het vel");
for (const [sym, plek, o] of [
  ["ligger", { x1: 0, y1: 0, x2: 5000, y2: 0 }, {}],
  ["oplegging", { x: 0, y: 0 }, { type: "scharnier" }],
  ["oplegging", { x: 5000, y: 0 }, { type: "rol" }],
  ["oplegging", { x: 0, y: 0 }, { type: "inklemming" }],
  ["qlast", { x1: 0, y1: 0, x2: 5000, y2: 0 }, { waarde: "12,5" }],
  ["puntlast", { x: 2500, y: 0 }, { waarde: "20" }],
  ["moment", { x: 0, y: 0 }, {}],
  ["veren", { x1: 0, y1: 0, x2: 5000, y2: 0 }, {}],
  ["windverband", { x: 0, y: 0, w: 2000, h: 2000 }, {}],
  ["peil", { x: 0, y: 0 }, {}],
]) {
  const v = Y.nieuwSymbool(sym, plek, stijl, o);
  const s = V.velSvg({ formaat: "A4", ligging: "staand", views: [{ ...view, elementen: [v] }] });
  meld(s.includes(`data-symbool="${sym}"`) && !s.includes("NaN") && !s.includes("{{"), `${sym}${o.type ? ` (${o.type})` : ""} staat op het vel`);
}
const pl = V.vormOpPapier(Y.nieuwSymbool("oplegging", { x: 2500, y: 0 }, stijl, { grootte: "20" }), 100);
meld(pl.o.grootte === "20" && dicht(pl.p.x.v, 94.4882, 1e-3), "een oplegging blijft op papier even groot, zijn plek schaalt mee");

console.log("\nDe bediening rekent in echte maat");
const opLijn = M.nieuweVorm("lijn", { x1: 1000, y1: 1000, x2: 6400, y2: 1000 }, stijl);
const tek = { ...M.legeTekening("view"), elementen: [opLijn, wand] };
const niets = Object.assign(() => undefined, { eenheid: () => undefined });
const set = SN.snapset(tek, niets);
const eind = SN.zoekSnap(set, { x: 6390, y: 1003 }, 50);
meld(eind && eind.x === 6400 && eind.y === 1000 && eind.soort === "eind", "snappen op een eindpunt: 6400, 1000");
const mid = SN.zoekSnap(set, { x: 3705, y: 1002 }, 50);
meld(mid && mid.x === 3700 && mid.soort === "midden", "snappen op het midden: 3700");
const hebOp = Y.nieuwSymbool("staal", { x: 3000, y: 5000 }, stijl, inModel({ familie: "HEB", maat: "HEB 200" }));
const hoeken = Y.symboolSnap(hebOp, Y.getekend(hebOp, niets)).punten;
// HEB 200 is 200 × 200 mm: de hoeken liggen 100 mm van het midden, in echte maat.
meld(hoeken.some((p) => p.x === 2900 && p.y === 4900) && hoeken.some((p) => p.x === 3100 && p.y === 5100), "een kolom snapt op zijn hoeken: ±100 mm om het midden");
const ortho = SN.ortho({ x: 0, y: 0 }, { x: 5400, y: 200 });
meld(ortho.x === 5400 && ortho.y === 0, "ortho: horizontaal of verticaal");
const naar = CM.doelVan(CM.leesInvoer("5400,0"), { x: 1000, y: 1000 }, null, false);
meld(naar.x === 6400 && naar.y === 1000, "een getypte verplaatsing is in mm: 5400,0");
const w0 = Y.getekend(wand, niets);
const verplaatst = BW.pasToe(wand, BW.verplaatsing(1000, 500), w0);
meld(verplaatst.p.x1.v === 1000 && verplaatst.p.y2.v === 500 && verplaatst.o.dikteMm === "100", "verplaatsen: de plek schuift, de dikte blijft");
const gedraaid = BW.pasToe(wand, BW.draaiing({ x: 0, y: 0 }, 90), w0);
meld(dicht(gedraaid.p.y2.v, 4000) && dicht(gedraaid.p.x2.v, 0), "draaien: een wand van 4000 mm blijft 4000 mm lang");
const gekopieerd = M.verschuif(raster[0], 5400, 0);
meld(gekopieerd.p.x1.v === 6400, "een stramienlijn verschuift in mm");

console.log("\nTwee keer hetzelfde profiel is één symbool");
const k1 = Y.nieuwSymbool("staal", { x: 0, y: 0 }, stijl, inModel({ familie: "HEB", maat: "HEB 200" }));
const k2 = Y.nieuwSymbool("staal", { x: 5400, y: 0 }, stijl, inModel({ familie: "HEB", maat: "HEB 200" }));
const k3 = Y.nieuwSymbool("staal", { x: 0, y: 6000 }, stijl, inModel({ familie: "HEB", maat: "HEB 200" }));
const velZelfde = { formaat: "A3", ligging: "liggend", views: [{ ...view, id: "a", elementen: [k1, k2] }, { ...view, id: "b", x: 200, elementen: [k3] }] };
const zelfde = V.velSvg(velZelfde);
meld(telMatches(zelfde, /<symbol /g) === 1 && telMatches(zelfde, /<use /g) === 3, "drie gelijke kolommen in twee views: één <symbol> en drie <use>");
const velAnders = { ...velZelfde, views: [velZelfde.views[0], { ...velZelfde.views[1], schaal: 20 }] };
const anders = V.velSvg(velAnders);
meld(telMatches(anders, /<symbol /g) === 2 && telMatches(anders, /<use /g) === 3, "op een andere schaal is het een eigen symbool");

console.log("\nViews op het vel");
for (const [formaat, ligging] of [["A4", "staand"], ["A4", "liggend"], ["A3", "liggend"], ["A3", "staand"], ["A2", "liggend"], ["A2", "staand"]]) {
  let vel = { formaat, ligging, views: [] };
  for (let i = 0; i < 3; i++) vel = { ...vel, views: [...vel.views, V.nieuweView(vel, `V${i + 1}`)] };
  const m = TB.velMaat(vel);
  const binnen = vel.views.every((v) => v.x >= 0 && v.y >= 0 && v.x + v.breedte <= m.breedte && v.y + v.hoogte <= m.hoogte);
  const [a, b] = vel.views;
  const los = a.x + a.breedte <= b.x || b.x + b.breedte <= a.x || a.y + a.hoogte <= b.y || b.y + b.hoogte <= a.y;
  meld(binnen && los, `${formaat} ${ligging}: drie views op het vel, de eerste twee los van elkaar`);
}
const v1 = V.nieuwVel("V");
meld(v1.views.length === 1 && v1.views[0].titel === "V" && v1.views[0].schaal === 50 && v1.views[0].elementen.length === 0, "een nieuw vel heeft één lege view op 1:50");
const metElement = { ...v1, views: [{ ...v1.views[0], x: 300, breedte: 200, elementen: [lijn] }] };
const kleiner = V.zetVelFormaat(metElement, "A4", "staand");
const k4 = kleiner.views[0];
meld(k4.x >= 0 && k4.x + k4.breedte <= 210 && k4.elementen === metElement.views[0].elementen, "kleiner papier: de view schuift terug op het vel, de tekening blijft ongemoeid");
const tweeSvg = V.velSvg({ formaat: "A3", ligging: "liggend", views: [{ ...view, titel: "Plattegrond" }, { ...view, id: "b", titel: "Doorsnede A", x: 150, schaal: 20 }] }, { naam: "Vel 1", project: "Proef" });
meld(telMatches(tweeSvg, /<svg data-view=/g) === 2, "twee views, elk een eigen kader dat afknipt");
meld(tweeSvg.includes("1:50") && tweeSvg.includes("1:20"), "elke view staat op het vel met zijn eigen schaal");
const uitlees = new DOMParser().parseFromString(tweeSvg, "image/svg+xml");
meld(!!uitlees && !tweeSvg.includes("NaN"), "de SVG van het vel is leesbaar en heeft geen ongeldige getallen");

console.log("\nOpslaan en heropenen");
const velBewaar = {
  formaat: "A2",
  ligging: "staand",
  views: [
    { id: "p", titel: "Plattegrond", x: 25, y: 25, breedte: 300, hoogte: 200, schaal: 50, x0: -2000, y0: -1500, elementen: [...raster, wand, heb, veld, doorsnede, maat, txt] },
    { id: "d", titel: "Détail & <kop>", x: 25, y: 260, breedte: 150, hoogte: 100, schaal: 10, x0: 0, y0: 0, elementen: [ligger, niveau] },
  ],
};
const exemplaren = [
  { id: "r1", naam: "Rekenblad", templateId: "leeg", source: "'Hallo\na = 1", waarden: {}, elementen: [] },
  { id: "t1", naam: "Tekening", templateId: TB.TEKEN_BLAD, source: "", waarden: {}, elementen: [], tekenvel: velBewaar },
  { id: "p1", naam: "Bijlage", templateId: "pdf", source: "", waarden: {}, elementen: [], pdf: { bestandsnaam: "a.pdf", data: "JVBERi0=" } },
];
const payload = { naam: "Proef", gegevens: PG.legeGegevens(), exemplaren, rapport: undefined, verborgen: {} };
const tekst = PB.bouwProjectBestand(payload, null);
const terug = PB.leesProjectBestand(tekst, "proef");
const tb = terug.exemplaren.find((e) => e.id === "t1");
meld(tb && TB.isTekenBlad(tb), "het tekenblad komt terug als tekenblad");
meld(inhoud(tb.tekenvel) === inhoud(velBewaar), "het vel komt terug met dezelfde inhoud: papier, views, schaal en vormen");
meld(V.velSvg(tb.tekenvel) === V.velSvg(velBewaar), "heropend tekent het vel precies hetzelfde");
const opnieuw = PB.bouwProjectBestand({ ...payload, exemplaren: terug.exemplaren }, null);
const doc = JSON.parse(tekst);
const doc2 = JSON.parse(opnieuw);
const velIn = (d) => d.data.find((k) => k.attributes?.["ocss::blad::tekenvel"])?.attributes["ocss::blad::tekenvel"];
meld(inhoud(velIn(doc)) === inhoud(velIn(doc2)), "nog eens opslaan geeft hetzelfde vel in het bestand");
const derde = PB.bouwProjectBestand({ ...payload, exemplaren: PB.leesProjectBestand(opnieuw, "proef").exemplaren }, null);
meld(JSON.stringify(velIn(JSON.parse(derde))) === JSON.stringify(velIn(doc2)), "en daarna blijft het vel in het bestand letter voor letter gelijk");
const attr = velIn(doc);
meld(attr?.formaat === "A2" && attr.views.length === 2 && attr.views[1].schaal === 10, "het vel staat onder het eigen attribuut ocss::blad::tekenvel");
meld(!!doc.schemas?.["ocss::blad::tekenvel"], "het attribuut staat beschreven onder schemas");
const alleBlad = doc.data.filter((k) => k.attributes?.["ocss::blad"]);
meld(alleBlad.find((k) => k.attributes["ocss::blad"].id === "t1").attributes["ocss::blad"].soort === "tekenblad", "de soort van het blad is tekenblad");
meld(alleBlad.filter((k) => k.attributes["ocss::blad::tekenvel"]).length === 1, "een rekenblad of PDF krijgt geen vel");
meld(!tekst.includes(String(V.MODEL_SCHAAL)), "de vaste schaal van de modelmaat staat niet in het bestand");
const rb = terug.exemplaren.find((e) => e.id === "r1");
const pdf = terug.exemplaren.find((e) => e.id === "p1");
meld(rb.source === exemplaren[0].source && pdf.pdf?.data === "JVBERi0=" && !rb.tekenvel && !pdf.tekenvel, "het rekenblad en de PDF ernaast blijven zoals ze waren");
const doorgerekend = PI.bladenVoorIfc(payload);
const uitIfc = doorgerekend.find((b) => b.id === "t1");
meld(uitIfc.nodes.length === 0 && !!uitIfc.tekenvel && SB.isLosBlad({ templateId: TB.TEKEN_BLAD }), "een tekenblad wordt niet doorgerekend");
const step = PI.projectStep(payload);
meld(/'Tekening'/.test(step) && /'Bijlage'/.test(step), "de STEP noemt het tekenblad als bijlage");
const metUitkomst = PB.bouwProjectBestand(payload, doorgerekend);
meld(inhoud(velIn(JSON.parse(metUitkomst))) === inhoud(attr), "ook met doorgerekende bladen erbij staat hetzelfde vel in het bestand");
const herstel = PB.normaliseerExemplaar(JSON.parse(JSON.stringify(exemplaren[1])), "x");
meld(inhoud(herstel.tekenvel) === inhoud(velBewaar), "de opgeslagen staat van de app herstelt hetzelfde vel");

console.log("\nOude en onbruikbare bestanden");
const oudBlad = { project: { naam: "Oud", gegevens: {}, exemplaren: [{ id: "x", naam: "Oud blad", templateId: "leeg", source: "a = 1", waarden: {} }] } };
const oud = PB.leesProjectBestand(JSON.stringify(oudBlad), "oud");
meld(oud.exemplaren.length === 1 && oud.exemplaren[0].source === "a = 1" && !oud.exemplaren[0].tekenvel, "een bestand van vóór het tekenblad leest gewoon");
const oudDoc = JSON.parse(PB.bouwProjectBestand({ ...payload, exemplaren: [exemplaren[0]] }, null));
meld(!JSON.stringify(oudDoc.data).includes("ocss::blad::tekenvel"), "een project zonder tekenblad schrijft geen vel-attribuut");
meld(PB.leesProjectBestand(JSON.stringify(oudDoc), "oud").exemplaren.length === 1, "een IFCX-bestand zonder vel leest gewoon");
const zonderVel = PB.normaliseerExemplaar({ id: "t", naam: "T", templateId: TB.TEKEN_BLAD }, "x");
meld(zonderVel && !zonderVel.tekenvel && TB.isTekenBlad(zonderVel), "een tekenblad zonder vel blijft een blad, met een melding in beeld");
meld(TB.leesTekenVel(null) === undefined && TB.leesTekenVel("vel") === undefined && TB.leesTekenVel([]) === undefined, "onzin is geen vel");
const gaten = TB.leesTekenVel({ formaat: "A0", ligging: "scheef", views: [null, 3, { titel: 5 }, { id: "a", schaal: -3, breedte: "x", elementen: "y" }] });
meld(gaten.formaat === "A3" && gaten.ligging === "liggend" && gaten.views.length === 2, "een onbekend formaat krijgt A3 liggend; wat geen view is, valt weg");
meld(gaten.views[1].schaal === 50 && gaten.views[1].breedte === 100 && gaten.views[1].elementen.length === 0, "een onbruikbare schaal of maat krijgt zijn standaard");
meld(new Set(TB.leesTekenVel({ views: [{ id: "a" }, { id: "a" }] }).views.map((v) => v.id)).size === 2, "twee views met hetzelfde id krijgen elk een eigen id");
const dubbel = TB.leesTekenVel({ views: [{ id: "a", elementen: [{ id: "v9", soort: "lijn", p: {} }, { id: "v9", soort: "lijn", p: {} }] }] }).views[0].elementen;
meld(dubbel[0].id !== dubbel[1].id, "twee vormen met hetzelfde id krijgen elk een eigen id");
meld(M.nieuwId() !== "v9" && Number(M.nieuwId().slice(1)) > 9, "een nieuw id botst niet met een id uit het bestand");

console.log("\nEen bestand van iemand anders");
const kwaad = TB.leesTekenVel({
  formaat: "A4",
  ligging: "staand",
  views: [{
    id: "a\"><script>alert(1)</script>",
    titel: "<img src=x onerror=alert(1)>",
    elementen: [
      { soort: "vast", id: "1", markup: "<script>alert(1)</script>" },
      { soort: "tekst", id: "2", p: { x: { v: 1 }, y: { v: 1 } }, tekst: "<script>alert(2)</script>", opmaak: true, lijn: "red;background:url(http://x)", extra: [["onload", "alert(3)"]], stijlRest: "background:url(http://x)" },
      { soort: "lijn", id: "3", p: { x1: { v: 0, e: "geheim" }, y1: { v: 0 }, x2: { v: 10 }, y2: { v: 0 } }, lijn: "#000", dikte: 1 },
      { soort: "symbool", id: "4", sym: "bestaatniet", p: {} },
      { soort: "symbool", id: "5", sym: "staal", p: { x: { v: 0 }, y: { v: 0 } }, o: { tekst: "\"><script>alert(4)</script>", label: "1" }, lijn: "#000", dikte: 1 },
    ],
  }],
});
const metLogo = V.velSvg(V.nieuwVel("V"), { logo: "data:image/png;base64,iVBORw0KGgo=", lettertype: "Georgia, serif" });
meld(metLogo.includes('<image href="data:image/png;base64,iVBORw0KGgo="') && metLogo.includes("font-family:Georgia, serif"), "het logo en de letter van het bureau staan op het vel");
meld(!V.velSvg(V.nieuwVel("V"), { logo: 'x" onload="alert(1)' }).includes("<image") && !V.velSvg(V.nieuwVel("V"), { logo: "http://voorbeeld.invalid/a.png" }).includes("<image"), "alleen een ingebedde afbeelding komt op het vel");
meld(!V.velSvg(V.nieuwVel("V")).includes("<image"), "zonder logo geen afbeelding");
const kwaadSvg = V.velSvg(kwaad, { naam: "<script>alert(5)</script>" });
meld(kwaad.views[0].elementen.length === 3, "een onbekend element en een onbekend symbool vallen weg");
meld(!/<script|<img|onload=|onerror="/i.test(kwaadSvg), "geen script, afbeelding of event-attribuut in de SVG van het vel");
meld(!/url\(/.test(kwaadSvg), "een kleur of stijl uit het bestand haalt niets van buiten");
const kw = kwaad.views[0].elementen;
meld(kw[0].extra === undefined && kw[0].opmaak === undefined && kw[0].stijlRest === undefined, "extra attributen en vrije opmaak gaan niet mee");
meld(kw[1].p.x1.e === undefined, "een maat is een getal: geen koppeling aan een rekenblad");

console.log("");
if (fouten > 0) {
  console.log(`${fouten} controle(s) gezakt.`);
  process.exit(1);
}
console.log("Tekenblad: alle controles goed.");
