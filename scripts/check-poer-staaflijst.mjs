/**
 * Controle van de staaflijst, het DXF-detail en de IFC-wapening van de poeren:
 * packages/desktop/src/components/calc/poerStaven.ts, meerpaalDefinitie.ts, poerDxf.ts,
 * meerpaalIfcx.ts en de merken in poerIfcx.ts.
 *
 *   1. Staaflengtes met de hand nagerekend (hieronder uitgeschreven).
 *   2. De staaflijst tegen de tekening en de toets: dezelfde aantallen, diameters en
 *      plaatsen, en het been van de trekband waar het blad de verankering meet (l_h).
 *   3. Elke staaf binnen de poer, met de dekking.
 *   4. Het DXF: begint met 0/SECTION, eindigt met EOF, de lagen bestaan, elke staaf in
 *      de plattegrond, de wapening binnen het beton van elk aanzicht, en de lezer van de
 *      app leest het zonder fouten.
 *   5. De IFCX: per staaf een IfcReinforcingBar met geometrie, merk en diameter; geldig
 *      volgens de specificatie, ook in het projectbestand en de STEP.
 *   6. De status van de tekening: vrijgegeven alleen als het blad "voldoet" zegt; een
 *      ontbrekende verplichte toets of ongeldige invoer geeft nooit "voldoet".
 *   7. Onzin tijdens het typen: geen NaN en geen fout.
 *   8. Drie palen: de kruisende banden in drie lagen, in de staven, de staaflijst, het DXF
 *      en de IFCX.
 *
 * Handberekening (mm). Afspraken: zijlengtes hart op hart van de knikken, de lengte langs
 * de hartlijn; een knik van 90° met buigstraal r op het hart is (2 − π/2)·r korter dan de
 * twee zijlengtes samen; een haak van 135° is 3π/4·r + max(5Ø; 50); de kleinste doorn is
 * 4Ø tot Ø16 (r = 2,5Ø op het hart), daarboven 7Ø (r = 4Ø).
 *
 * Tweepaalspoer, geval 1 (2100 × 580 × 900, palen 350 h.o.h. 1400, e_p = 50, c_o = 60,
 * c_z = 40, 6Ø25 omgebogen met been 600 en doorn 125, beugels Ø12-100 met 4 sneden):
 *   trekband   hart been e = 2100/2 − 40 − 25/2 = 997,5; r = (125 + 25)/2 = 75
 *              L = 2·600 + 2·997,5 − 2·(2 − π/2)·75 = 3195 − 64,38 = 3130,62
 *              recht deel vanaf de binnenkant paal: 997,5 − (1400/2 − 350/2 + 50) = 422,5 = l_h van het blad
 *   beugel 1   sneden op y = ±244 en ±81,33 (244 = 290 − 40 − 6); buitenste lus 488 × 788
 *              (z van 60 + 6 = 66 tot 900 − 40 − 6 = 854); r = 2,5·12 = 30
 *              L = 2·(488 + 788) − 4·(2 − π/2)·30 + 2·(3π/4·30 + max(60; 50))
 *                = 2552 − 51,50 + 261,37 = 2761,87
 *   beugel 2   162,67 × 788: 1901,33 − 51,50 + 261,37 = 2111,20
 *   aantal     beugelplaatsen floor((2100 − 80 − 12)/100) + 1 = 21, elk 2 lussen
 *   haarspeld  benen op y = ±(175 + 12,5 + 12) = ±199,5, van z = 66 tot 900 − 40 − 12 = 848:
 *              L = 2·782 + 399 − 2·(2 − π/2)·30 = 1963 − 25,75 = 1937,25
 *   zijstaaf   2100 − 2·40 = 2020; dwarsstaaf 2·(290 − 40 − 12 − 8) = 460
 *   massa Ø25  π·25²/4·7850e-9·1000 = 3,8534 kg/m; 6·3,13062·3,8534 = 72,38 kg
 *
 * Poer op vier palen, de standaardinvoer (1700 × 1700 × 900, palen 320 h.o.h. 1000,
 * e_p = 50, c_o = 75, c_z = 40, 5Ø20-80 omgebogen met been 500 en doorn 200, net Ø12-150,
 * 3 randbeugels Ø12):
 *   band       het been staat binnen de randbeugel: hart 1700/2 − 40 − 12 − 20/2 = 788;
 *              r = (200 + 20)/2 = 110
 *              L = 2·500 + 2·788 − 2·(2 − π/2)·110 = 2576 − 94,42 = 2481,58
 *              l_h = 788 − 1000/2 − 320/2 − 50 = 78 (blad: l_h4)
 *   randbeugel lus 1608 × 1608 (1700 − 2·(40 + 6)), r = 30:
 *              L = 4·1608 − 4·(2 − π/2)·30 + 2·(3π/4·30 + 60) = 6432 − 51,50 + 261,37 = 6641,87
 *   net        stopt tegen het been: 1700 − 2·(40 + 12 + 20) = 1556; per richting
 *              ceil(1556/150) + 1 = 12 staven op 1556/11 = 141,45 h.o.h.
 *
 * Poer op drie palen, de standaardinvoer (driehoek h.o.h. 1200, rand 400): de buitenste
 * staaf van een band ligt (5 − 1)/2·80 = 160 naar buiten en raakt de afschuining het eerst:
 *   t = (400 − 40 − 12 − 10 − 160·sin 30°)/cos 30° = 258/0,86603 = 297,91 voorbij het paalhart
 *   L = 2·500 + (1200 + 2·297,91) − 2·(2 − π/2)·110 = 2795,82 − 94,42 = 2701,40
 *   l_h = 297,91 − 160 − 50 = 87,91 (blad: l_h3)
 *   lagen: de schuine banden kruisen boven de bovenste paal. Onderin de band tussen de
 *   onderste palen (hart 75 + 10 = 85), daarop de linker schuine band (105), de rechter een
 *   laag hoger (125). Het net ligt op de derde laag: 75 + 3·20 + 6 = 141 en 153; de
 *   randbeugels op 135 + k·(900 − 135 − 40)/4 = 316,25, 497,5 en 678,75. De lengtes blijven
 *   gelijk: de drie banden houden één merk, en onder de staaflijst staat de volgorde.
 *
 * Draaien:  node scripts/check-poer-staaflijst.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { parse, evaluate, render, leesIfcx, bouwProjectStep } from "../packages/core/dist/index.js";
import { laadTemplate } from "./lib/refcheck.mjs";
import { afwijkingen } from "./lib/ifcx-specificatie.mjs";

const { leesResultaat, leesGetallen } = await import("../packages/desktop/src/components/calc/bladLezen.ts");
const { maakPoer, staafTelling } = await import("../packages/desktop/src/components/calc/poerDefinitie.ts");
const { tekenPoer } = await import("../packages/desktop/src/components/calc/poerTekening.ts");
const { stavenTweepaal, maakStaaflijst, staafLengte, afgerondPad, buigStraal, haakLengte, massaPerMeter } = await import("../packages/desktop/src/components/calc/poerStaven.ts");
const { maakMeerpaalPoer, stavenMeerpaal, binnenOmtrek, koorde } = await import("../packages/desktop/src/components/calc/meerpaalDefinitie.ts");
const { tweepaalVorm, meerpaalVorm, maakDetail, detailNaarDxf, detailNaarSvg, tekeningStatus, DXF_LAGEN, DETAIL_NL } = await import("../packages/desktop/src/components/calc/poerDxf.ts");
const { poerIfcxDocument } = await import("../packages/desktop/src/components/calc/poerIfcx.ts");
const { meerpaalIfcxDocument } = await import("../packages/desktop/src/components/calc/meerpaalIfcx.ts");
const { projectIfcx, projectStep, bladenVoorIfc } = await import("../packages/desktop/src/store/projectIfcx.ts");
const { leesDxf, dxfNaarSvg } = await import("../packages/desktop/src/components/ribbon/dxfNaarSvg.ts");

let fouten = 0;
let getest = 0;
const waar = (wat, ok, detail = "") => {
  getest++;
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${wat}${ok || !detail ? "" : ` — ${detail}`}`);
};
const dichtbij = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
const SCOPE = { CC: 2, RC: 2, K_FI: 1, DesignLife: 50, rekenwijze: 1 };
const TWEE = laadTemplate("tweepaalspoer.ts");
const MEER = laadTemplate("meerpaalspoer.ts");
function doorreken(bron, waarden) {
  const nodes = evaluate(parse(bron), waarden, SCOPE);
  const tekst = render(nodes).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return { uit: leesGetallen(nodes), r: leesResultaat(nodes, "x"), tekst };
}
const lees = (bron) => (naam) => {
  const w = bron[naam];
  return w === undefined || w === "" ? 0 : parseFloat(String(w).replace(",", "."));
};

// De invoer, verzonnen; de tweepaalspoer zoals in check-tweepaalspoer.mjs en check-poer-ifcx.mjs.
const GEMEEN = {
  l_poer: "2100", b_poer: "580", h_poer: "900", a_hoh: "1400", e_p: "50", t_in: "50",
  paalvorm: "1", p_x: "350", p_y: "350", kolomvorm: "1", c_x: "400", c_y: "400",
  betonklasse: "30", betonstaal: "2", milieu: "2", ondergrond: "1",
  d_g: "16", c_o: "60", c_z: "40", n_t: "6", d_t: "25", s_t: "70", lagen: "1", vorm_t: "2", l_op: "600", D_m: "125",
  d_s: "12", s_s: "100", n_s: "4", n_z: "5", d_z: "12", n_b: "3", d_b: "12", n_hp: "2", d_hp: "12", n_dw: "3", d_dw: "16",
  F_Ed: "1800", F_fr: "1200", dwars: "1",
};
const TWEE_GEVALLEN = {
  "twee palen, geval 1": GEMEEN,
  "twee palen, rond en twee lagen": { ...GEMEEN, paalvorm: "2", kolomvorm: "2", n_t: "8", lagen: "2", h_poer: "1100", l_poer: "2600", a_hoh: "1800", p_x: "450", c_x: "500" },
  "twee palen, rechte staaf en drie sneden": { ...GEMEEN, vorm_t: "1", n_t: "4", n_s: "3", n_hp: "0", n_z: "0", n_b: "0", n_dw: "0" },
};
const MEER_BASIS = {
  n_p: "4", a_x: "1000", a_y: "1000", l_poer: "1700", b_poer: "1700", a_3: "1200", r_rand: "400", h_poer: "900", e_p: "50", t_in: "50",
  paalvorm: "1", p_x: "320", p_y: "320", kolomvorm: "1", c_x: "400", c_y: "400", betonklasse: "30", betonstaal: "2", milieu: "2", ondergrond: "1",
  d_g: "16", c_o: "75", c_z: "40", n_t: "5", d_t: "20", s_t: "80", vorm_t: "2", l_op: "500", D_m: "200", d_n: "12", s_n: "150", n_z: "3", d_z: "12",
  N_Ed: "2000", M_Edx: "0", M_Edy: "0", N_fr: "1450", M_frx: "0", M_fry: "0", horiz: "1",
};
const MEER_GEVALLEN = {
  "vier palen, standaard": MEER_BASIS,
  "drie palen, standaard": { ...MEER_BASIS, n_p: "3" },
  "vier palen, rechthoekig, rond en recht": { ...MEER_BASIS, a_x: "1100", l_poer: "1800", h_poer: "1000", paalvorm: "2", kolomvorm: "2", vorm_t: "1", n_z: "0" },
  "drie palen, ronde paal en zonder net": { ...MEER_BASIS, n_p: "3", paalvorm: "2", d_n: "0", n_t: "4" },
};
const regelVan = (lijst, soort, i = 0) => lijst.regels.filter((r) => r.soort === soort)[i];

// ── 1. Handberekening ────────────────────────────────────────────────────────
console.log("\n1. Staaflengtes met de hand nagerekend");
{
  waar("buigstraal Ø12 = 30 (doorn 4Ø), Ø20 = 80 (doorn 7Ø)", buigStraal(12) === 30 && buigStraal(20) === 80);
  waar("haak Ø12, r = 30: 3π/4·30 + 60 = 130,69", dichtbij(haakLengte(12, 30), 130.686, 0.001));
  const p = maakPoer(lees(GEMEEN));
  const lijst = maakStaaflijst(stavenTweepaal(p));
  const verwacht = [
    ["trekband", 0, 6, 25, "21", [600, 1995, 600], 3130.62],
    ["beugel", 0, 21, 12, "51", [488, 788, 488, 788], 2761.87],
    ["beugel", 1, 21, 12, "51", [162.67, 788, 162.67, 788], 2111.20],
    ["zijstaaf", 0, 10, 12, "00", [2020], 2020],
    ["bovenstaaf", 0, 3, 12, "00", [2020], 2020],
    ["haarspeld", 0, 4, 12, "21", [782, 399, 782], 1937.25],
    ["dwarsstaaf", 0, 12, 16, "00", [460], 460],
  ];
  for (const [soort, i, aantal, d, vorm, zijden, lengte] of verwacht) {
    const r = regelVan(lijst, soort, i);
    waar(`twee palen, ${soort}${i ? ` ${i + 1}` : ""}: ${aantal}Ø${d}, vorm ${vorm}, L = ${lengte}`,
      r && r.aantal === aantal && r.d === d && r.vorm === vorm && dichtbij(r.lengte, lengte) && r.zijden.every((z, k) => dichtbij(z, zijden[k])),
      r ? `${r.aantal}Ø${r.d} ${r.vorm} ${r.zijden.map((z) => z.toFixed(2)).join("/")} L ${r.lengte.toFixed(2)}` : "ontbreekt");
  }
  waar("twee palen: zeven merken", lijst.regels.length === 7, String(lijst.regels.length));
  const ø25 = lijst.perDiameter.find((x) => x.d === 25);
  waar("massa Ø25: 3,8534 kg/m, 6 staven samen 72,38 kg", dichtbij(massaPerMeter(25), 3.8534, 1e-4) && dichtbij(ø25.massa, 72.38, 0.01), `${ø25?.massa}`);
  waar("totale massa is de som per diameter", dichtbij(lijst.massa, lijst.perDiameter.reduce((s, x) => s + x.massa, 0), 1e-9));

  const vier = maakStaaflijst(stavenMeerpaal(maakMeerpaalPoer(lees(MEER_BASIS))));
  const band = regelVan(vier, "band");
  waar("vier palen, band: 20Ø20, 500/1576/500, L = 2481,58", band && band.aantal === 20 && band.d === 20 && band.vorm === "21" && dichtbij(band.lengte, 2481.58) && dichtbij(band.zijden[1], 1576), `${band?.aantal} ${band?.lengte}`);
  const rand = regelVan(vier, "randbeugel");
  waar("vier palen, randbeugel: 3Ø12, 1608 × 1608, L = 6641,87", rand && rand.aantal === 3 && rand.vorm === "51" && dichtbij(rand.lengte, 6641.87) && dichtbij(rand.zijden[0], 1608), `${rand?.aantal} ${rand?.lengte}`);
  const net = regelVan(vier, "net");
  waar("vier palen, net: 2 × 12 staven Ø12 van 1556", net && net.aantal === 24 && dichtbij(net.lengte, 1556) && !net.verlopend, `${net?.aantal} ${net?.lengte}`);

  const drie = maakMeerpaalPoer(lees({ ...MEER_BASIS, n_p: "3" }));
  waar("drie palen: de band loopt 297,91 voorbij het paalhart", dichtbij(drie.uitsteek.x, 297.91), String(drie.uitsteek.x));
  const drieBand = regelVan(maakStaaflijst(stavenMeerpaal(drie)), "band");
  waar("drie palen, band: 15Ø20, L = 2701,40, de drie banden onder één merk", drieBand && drieBand.aantal === 15 && dichtbij(drieBand.lengte, 2701.40), `${drieBand?.aantal} ${drieBand?.lengte}`);
}

// ── 2. Staaflijst, tekening en toets ─────────────────────────────────────────
console.log("\n2. De staaflijst tegen de tekening en de toets");
for (const [naam, invoer] of Object.entries(TWEE_GEVALLEN)) {
  const blad = doorreken(TWEE, invoer);
  const p = maakPoer(lees(invoer), blad.uit);
  const staven = stavenTweepaal(p);
  const lijst = maakStaaflijst(staven);
  const tel = staafTelling(p);
  const som = (soort) => lijst.regels.filter((r) => r.soort === soort).reduce((s, r) => s + r.aantal, 0);
  const { svg } = tekenPoer(p, { ...Object.fromEntries(["bovenaanzicht", "langsdoorsnede", "dwarsdoorsnede", "trekband", "beugels", "zijstaven", "bovenstaven", "haarspelden", "dwarsstaven", "laag", "lagen", "hoh", "rechteStaaf", "omgebogen", "been", "doorn", "sneden", "perZijvlak", "perPaal", "perHelft", "geen", "dekkingOnder", "dekkingZij", "staafwerk"].map((k) => [k, k])) }, 900);
  const inSvg = (s) => (svg.match(new RegExp(`data-staaf="${s}"`, "g")) ?? []).length;
  const lussen = Math.floor(p.beugels.y.length / 2) + (p.beugels.y.length % 2);
  waar(`${naam}: trekband ${som("trekband")} = n_t = tekening`, som("trekband") === Number(invoer.n_t) && som("trekband") === tel.trekband && som("trekband") === inSvg("trekband"));
  waar(`${naam}: beugels ${som("beugel")} = plaatsen × lussen in de tekening`, som("beugel") === tel.beugels * lussen && tel.beugels === inSvg("beugel"));
  waar(`${naam}: zijstaven, bovenstaven, haarspelden en dwarsstaven als in de tekening`,
    som("zijstaaf") === tel.zij && som("bovenstaaf") === tel.boven && som("haarspeld") === tel.haarspelden && som("dwarsstaaf") === tel.dwarsstaven
    && som("zijstaaf") === inSvg("zij-dwars") && som("haarspeld") === inSvg("haarspeld") && som("dwarsstaaf") === inSvg("dwarsstaaf"));
  const tb = lijst.regels.filter((r) => r.soort === "trekband");
  const A = tb.reduce((s, r) => s + r.aantal * Math.PI * r.d ** 2 / 4, 0);
  waar(`${naam}: staalvlak trekband = A_s van het blad (${blad.uit.A_s?.toFixed(1)} mm²)`, dichtbij(A, blad.uit.A_s, 0.05), `${A}`);
  waar(`${naam}: diameters = invoer`, tb.every((r) => r.d === Number(invoer.d_t)) && lijst.regels.filter((r) => r.soort === "beugel").every((r) => r.d === Number(invoer.d_s)));
  // De bovenste laag is het kortst; daar meet het blad de verankering.
  const laag = p.trekband.lagen.length - 1;
  const e = p.trekband.xEind[laag];
  const l_h = e - (p.a / 2 - p.paal.x / 2 + Number(invoer.e_p));
  waar(`${naam}: recht deel van de staaf vanaf de paal = l_h van het blad (${blad.uit.l_h?.toFixed(1)})`, dichtbij(l_h, blad.uit.l_h, 0.01), `${l_h}`);
  const trek = staven.filter((s) => s.soort === "trekband" && s.sleutel === `trekband/${laag + 1}`);
  const r_m = (p.trekband.doorn + p.trekband.d) / 2;
  const verwachtL = p.trekband.omgebogen ? 2 * e + 2 * p.trekband.lOp - 2 * (2 - Math.PI / 2) * r_m : 2 * e;
  waar(`${naam}: lengte bovenste laag = 2e + 2·been − 2(2 − π/2)r`, trek.every((s) => dichtbij(staafLengte(s), verwachtL)));
  // De halve staaf voorbij de binnenkant van de paal is wat het blad als verankering telt.
  const halfVoorbij = staafLengte(trek[0]) / 2 - (p.a / 2 - p.paal.x / 2 + Number(invoer.e_p));
  waar(`${naam}: halve staaf voorbij de binnenkant van de paal = l_av van het blad (${blad.uit.l_av?.toFixed(2)})`, dichtbij(halfVoorbij, blad.uit.l_av, 0.01), `${halfVoorbij}`);
}
for (const [naam, invoer] of Object.entries(MEER_GEVALLEN)) {
  const blad = doorreken(MEER, invoer);
  const m = maakMeerpaalPoer(lees(invoer));
  const staven = stavenMeerpaal(m);
  const lijst = maakStaaflijst(staven);
  const vier = m.n === 4;
  const banden = staven.filter((s) => s.soort === "band");
  waar(`${naam}: ${vier ? 4 : 3} banden van n_t = ${invoer.n_t} staven Ø${invoer.d_t}`, banden.length === (vier ? 4 : 3) * Number(invoer.n_t) && banden.every((s) => s.d === Number(invoer.d_t)));
  waar(`${naam}: staalvlak per band = A_b van het blad (${blad.uit.A_b?.toFixed(1)} mm²)`, dichtbij(banden.length / (vier ? 4 : 3) * Math.PI * Number(invoer.d_t) ** 2 / 4, blad.uit.A_b, 0.05));
  const p_l = Math.max(Number(invoer.p_x), invoer.paalvorm === "2" ? Number(invoer.p_x) : Number(invoer.p_y));
  const l_h = Math.min(m.uitsteek.x, m.uitsteek.y) - p_l / 2 - Number(invoer.e_p);
  waar(`${naam}: recht deel van de band vanaf de paal = l_h van het blad (${blad.uit.l_h?.toFixed(2)})`, dichtbij(l_h, blad.uit.l_h, 0.01), `${l_h}`);
  const rand = staven.filter((s) => s.soort === "randbeugel");
  waar(`${naam}: ${invoer.n_z} randbeugels Ø${invoer.d_z}`, rand.length === Number(invoer.n_z) && rand.every((s) => s.d === Number(invoer.d_z)));
  // Het net: ten minste zoveel staven als de toets in rekening brengt (A_s,min en V_Rd,c).
  const d_n = Number(invoer.d_n);
  if (d_n > 0) {
    const s_n = Number(invoer.s_n);
    const b_band = (Number(invoer.n_t) - 1) * Number(invoer.s_t) + Number(invoer.d_t);
    if (vier) {
      for (const [as, breedte, sleutel] of [[1, Number(invoer.b_poer), "net/x"], [0, Number(invoer.l_poer), "net/y"]]) {
        const n = staven.filter((s) => s.sleutel === sleutel).length;
        waar(`${naam}: ${sleutel} ${n} staven ≥ (breedte − 2·b_band)/s_n = ${((breedte - 2 * b_band) / s_n).toFixed(2)} uit de toets, h.o.h. ≤ ${s_n}`,
          n >= (breedte - 2 * b_band) / s_n && staven.filter((s) => s.sleutel === sleutel).map((s) => s.pad[0][as]).sort((a, b) => a - b).every((w, i, r) => i === 0 || w - r[i - 1] <= s_n + 1e-6));
      }
    } else {
      // De toets telt bij drie palen floor((b − 2δ_e/cos 30°)/s_n) staven door de doorsnede.
      const R = Number(invoer.a_3) / Math.sqrt(3);
      const b3 = (y) => 2 * ((R - y) * Math.tan(Math.PI / 6) + Number(invoer.r_rand) / Math.sin(Math.PI / 3));
      const δe = Number(invoer.c_z) + (invoer.vorm_t === "2" ? (Number(invoer.n_z) > 0 ? Number(invoer.d_z) : 0) + Number(invoer.d_t) : 0);
      const c_y = invoer.kolomvorm === "2" ? Number(invoer.c_x) * Math.sqrt(Math.PI) / 2 : Number(invoer.c_y);
      for (const y0 of [0, c_y / 2, -c_y / 2]) {
        const toets = Math.floor(Math.max(b3(y0) - 2 * δe / Math.cos(Math.PI / 6), 0) / s_n);
        const kruisen = staven.filter((s) => s.sleutel === "net/y" && Math.min(s.pad[0][1], s.pad[1][1]) <= y0 && Math.max(s.pad[0][1], s.pad[1][1]) >= y0).length;
        waar(`${naam}: ${kruisen} netstaven door y = ${y0.toFixed(0)} ≥ ${toets} in de toets`, kruisen >= toets && toets > 0);
      }
      waar(`${naam}: het net verloopt, één merk per richting`, lijst.regels.filter((r) => r.soort === "net").every((r) => r.verlopend) && lijst.regels.filter((r) => r.soort === "net").length === 2);
    }
  } else {
    waar(`${naam}: zonder net geen netstaven`, !staven.some((s) => s.soort === "net"));
  }
}

// ── 3. Elke staaf binnen de poer, met de dekking ─────────────────────────────
console.log("\n3. Elke staaf binnen de poer, met de dekking");
function binnenVeelhoek(veelhoek, [x, y], tol = 1e-6) {
  return veelhoek.every((a, i) => {
    const b = veelhoek[(i + 1) % veelhoek.length];
    return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) >= -tol * Math.hypot(b[0] - a[0], b[1] - a[1]);
  });
}
const binnen = (naam, omtrek, h, c_o, c_z, staven) => {
  // Het einde van een staaf houdt de dekking tot zijn kopvlak: het hart van de staaf tot c_z.
  // Langs een vlak houdt de staaf de dekking tot zijn buitenkant: het midden van elk stuk tot c_z + Ø/2.
  const kern = binnenOmtrek(omtrek, c_z - 1e-6);
  const buiten = staven.filter((s) => {
    const zijkant = binnenOmtrek(omtrek, c_z + s.d / 2 - 1e-6);
    const pad = afgerondPad(s, 4);
    const punten = pad.some(([x, y, z]) => !binnenVeelhoek(kern, [x, y], 1e-4) || z < c_o - 1e-6 || z > h - c_z + 1e-6);
    const n = s.gesloten ? pad.length : pad.length - 1;
    const stukken = Array.from({ length: n }, (_, i) => {
      const a = pad[i];
      const b = pad[(i + 1) % pad.length];
      return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    }).some(([x, y, z]) => !binnenVeelhoek(zijkant, [x, y], 1e-4) || z - s.d / 2 < c_o - 1e-6 || z + s.d / 2 > h - c_z + 1e-6);
    return punten || stukken;
  });
  waar(`${naam}: alle ${staven.length} staven binnen de dekking (zij en boven c_z, onder c_o)`, buiten.length === 0, buiten.slice(0, 3).map((s) => s.sleutel).join(", "));
};
for (const [naam, invoer] of Object.entries(TWEE_GEVALLEN)) {
  const p = maakPoer(lees(invoer));
  const v = tweepaalVorm(p);
  // Bij de tweepaalspoer is c_o de afstand tot de onderkant van de beugel.
  binnen(naam, v.omtrek, p.h, p.c_o, p.c_z, v.staven);
}
for (const [naam, invoer] of Object.entries(MEER_GEVALLEN)) {
  const m = maakMeerpaalPoer(lees(invoer));
  binnen(naam, m.omtrek, m.h, m.c_o, m.c_z, stavenMeerpaal(m));
}

// ── 4. Het DXF ───────────────────────────────────────────────────────────────
console.log("\n4. Het DXF-detail");
/** Een kleine lezer: groepcode en waarde per twee regels, entiteiten met laag en punten. */
function leesEigen(tekst) {
  const regels = tekst.split("\n");
  if (regels[regels.length - 1] === "") regels.pop();
  const paren = [];
  for (let i = 0; i + 1 < regels.length; i += 2) paren.push([Number(regels[i].trim()), regels[i + 1]]);
  const lagen = new Set();
  const entiteiten = [];
  let sectie = null;
  let huidig = null;
  for (let i = 0; i < paren.length; i++) {
    const [c, w] = paren[i];
    if (c === 0 && w === "SECTION") { sectie = paren[i + 1][1]; continue; }
    if (c === 0 && w === "ENDSEC") { sectie = null; continue; }
    if (sectie === "TABLES" && c === 0 && w === "LAYER") lagen.add(paren[i + 1][0] === 2 ? paren[i + 1][1] : "?");
    if (sectie === "ENTITIES") {
      if (c === 0) {
        huidig = { soort: w, laag: null, punten: [], tekst: null, r: 0 };
        entiteiten.push(huidig);
      } else if (huidig) {
        if (c === 8) huidig.laag = w;
        if (c === 10) huidig.punten.push([Number(w), Number(paren[i + 1][1])]);
        if (c === 40) huidig.r = Number(w);
        if (c === 1) huidig.tekst = w;
      }
    }
  }
  // De punten van een POLYLINE staan in zijn VERTEX-en.
  const samen = [];
  for (const e of entiteiten) {
    if (e.soort === "VERTEX") samen[samen.length - 1].punten.push(...e.punten);
    else if (e.soort !== "SEQEND") samen.push(e.soort === "POLYLINE" ? { ...e, punten: [] } : e);
  }
  return { paren, lagen, entiteiten: samen };
}
const alleGevallen = [
  ...Object.entries(TWEE_GEVALLEN).map(([n, inv]) => [n, tweepaalVorm(maakPoer(lees(inv)))]),
  ...Object.entries(MEER_GEVALLEN).map(([n, inv]) => [n, meerpaalVorm(maakMeerpaalPoer(lees(inv)))]),
];
for (const [naam, vorm] of alleGevallen) {
  const detail = maakDetail(vorm, { titel: "Poer P1", status: DETAIL_NL.ontwerp });
  const dxf = detailNaarDxf(detail);
  const { paren, lagen, entiteiten } = leesEigen(dxf);
  waar(`${naam}: begint met 0/SECTION en eindigt met EOF`, dxf.startsWith("0\nSECTION\n") && dxf.trimEnd().endsWith("0\nEOF"));
  waar(`${naam}: R12 (AC1009), alleen ASCII, geen NaN`, dxf.includes("$ACADVER\n1\nAC1009") && /^[\x0a\x20-\x7e]*$/.test(dxf) && !/NaN|Infinity|undefined/.test(dxf));
  waar(`${naam}: de lagen BETON, WAPENING, MAATVOERING en TEKST bestaan`, DXF_LAGEN.every((l) => lagen.has(l)), [...lagen].join(","));
  waar(`${naam}: elke entiteit op een bestaande laag`, entiteiten.every((e) => lagen.has(e.laag)), entiteiten.filter((e) => !lagen.has(e.laag)).map((e) => e.soort).slice(0, 3).join(","));
  waar(`${naam}: elke laag heeft iets`, DXF_LAGEN.every((l) => entiteiten.some((e) => e.laag === l)));
  waar(`${naam}: groepcodes en waarden in paren`, paren.every(([c]) => Number.isInteger(c)));
  waar(`${naam}: één lijn per staaf in de plattegrond (${detail.stavenInPlan} = ${vorm.staven.length})`, detail.stavenInPlan === vorm.staven.length);
  const wapening = entiteiten.filter((e) => e.laag === "WAPENING");
  const tol = 1;
  const erbuiten = wapening.filter((e) => {
    const pts = e.soort === "CIRCLE" ? e.punten.flatMap(([x, y]) => [[x - e.r, y - e.r], [x + e.r, y + e.r]]) : e.punten;
    return !detail.aanzichten.some(({ kader: k }) => pts.every(([x, y]) => x >= k.x0 - tol && x <= k.x1 + tol && y >= k.y0 - tol && y <= k.y1 + tol));
  });
  waar(`${naam}: alle ${wapening.length} wapeningsentiteiten binnen het beton van hun aanzicht`, erbuiten.length === 0, erbuiten.slice(0, 2).map((e) => `${e.soort} ${JSON.stringify(e.punten.slice(0, 2))}`).join(" | "));
  waar(`${naam}: drie aanzichten (plattegrond en twee doorsneden)`, detail.aanzichten.length === 3, detail.aanzichten.map((a) => a.naam).join(", "));
  const plan = detail.aanzichten[0].kader;
  const planStaven = wapening.filter((e) => (e.soort === "POLYLINE" || e.soort === "CIRCLE") && e.punten.every(([x, y]) => x >= plan.x0 - tol && x <= plan.x1 + tol && y >= plan.y0 - tol && y <= plan.y1 + tol));
  waar(`${naam}: in de plattegrond evenveel staaflijnen als in de staaflijst`, planStaven.length === maakStaaflijst(vorm.staven).regels.reduce((s, r) => s + r.aantal, 0), `${planStaven.length}`);
  const merken = entiteiten.filter((e) => e.laag === "TEKST" && e.soort === "TEXT").map((e) => e.tekst);
  waar(`${naam}: de staaflijst en de status staan in de tekening`, merken.some((t) => t.startsWith("Staaflijst - Ontwerpschema")) && merken.some((t) => t === "Poer P1 - Ontwerpschema"));
  let gelezen = null;
  let fout = "";
  try {
    gelezen = dxfNaarSvg(leesDxf(new TextEncoder().encode(dxf)));
  } catch (err) {
    fout = err.message;
  }
  waar(`${naam}: de DXF-lezer van de app leest het (${gelezen?.elementen ?? 0} elementen)`, gelezen && gelezen.elementen > 50 && gelezen.svg.startsWith("<svg"), fout);
  const svg = detailNaarSvg(detail, 800).svg;
  waar(`${naam}: dezelfde tekening als SVG, zonder NaN`, svg.startsWith("<svg") && !/NaN/.test(svg) && (svg.match(/<polyline|<polygon/g) ?? []).length >= vorm.staven.length);
}
{
  const p = maakPoer(lees(GEMEEN));
  const a = detailNaarDxf(maakDetail(tweepaalVorm(p), { titel: "P", status: "x" }));
  const b = detailNaarDxf(maakDetail(tweepaalVorm(maakPoer(lees({ ...GEMEEN, h_poer: "1000" }))), { titel: "P", status: "x" }));
  waar("een hogere poer geeft een andere tekening", a !== b);
  waar("gelijke invoer geeft hetzelfde DXF", a === detailNaarDxf(maakDetail(tweepaalVorm(maakPoer(lees({ ...GEMEEN }))), { titel: "P", status: "x" })));
  const en = detailNaarDxf(maakDetail(tweepaalVorm(p), { titel: "P", status: "Design scheme", teksten: { ...DETAIL_NL, staaflijst: "Bar schedule", bovenaanzicht: "Plan" } }));
  waar("de teksten komen van de aanroeper (Engels)", en.includes("Bar schedule - Design scheme") && en.includes("\nPlan\n"));
  waar("Ø staat als %%c in het DXF", a.includes("%%c25:"));
}

// ── 5. De IFCX ───────────────────────────────────────────────────────────────
console.log("\n5. De IFC-wapening");
const staafKnopen = (doc) => doc.data.filter((k) => k.attributes?.["bsi::ifc::class"]?.code === "IfcReinforcingBar");
for (const [naam, invoer] of Object.entries(TWEE_GEVALLEN)) {
  const p = maakPoer(lees(invoer));
  const doc = poerIfcxDocument(p);
  const lijst = maakStaaflijst(stavenTweepaal(p));
  const bars = staafKnopen(doc);
  waar(`${naam}: ${bars.length} IfcReinforcingBar, evenveel als in de staaflijst`, bars.length === lijst.regels.reduce((s, r) => s + r.aantal, 0));
  waar(`${naam}: elke staaf heeft een merk uit de staaflijst, zijn diameter en zijn lengte`, bars.every((k) => {
    const regel = lijst.regels.find((r) => r.merk === k.attributes["ocss::calc::merk"]);
    return regel && dichtbij(k.attributes["ocss::calc::diameter"] * 1000, regel.d, 1e-6) && dichtbij(k.attributes["bsi::ifc::prop::Length"] * 1000, regel.lengte, 0.002);
  }));
  const a = afwijkingen(JSON.parse(JSON.stringify(doc)));
  waar(`${naam}: geldig volgens de specificatie`, a.length === 0, a.slice(0, 3).join(" | "));
}
for (const [naam, invoer] of Object.entries(MEER_GEVALLEN)) {
  const m = maakMeerpaalPoer(lees(invoer));
  const staven = stavenMeerpaal(m);
  const lijst = maakStaaflijst(staven);
  const doc = meerpaalIfcxDocument(m);
  const a = afwijkingen(JSON.parse(JSON.stringify(doc)));
  waar(`${naam}: geldig volgens de specificatie`, a.length === 0, a.slice(0, 3).join(" | "));
  const bars = staafKnopen(doc);
  waar(`${naam}: per staaf een IfcReinforcingBar (${bars.length} = ${staven.length})`, bars.length === staven.length);
  const uit = leesIfcx(JSON.parse(JSON.stringify(doc)));
  waar(`${naam}: de lezer heeft geen meldingen`, uit.meldingen.length === 0, uit.meldingen.slice(0, 2).join(" | "));
  const metVorm = uit.elementen.filter((e) => e.klasse === "IfcReinforcingBar" && e.vlakken.length >= 8);
  waar(`${naam}: elke staaf heeft geometrie, een buis langs de hartlijn`, metVorm.length === staven.length, `${metVorm.length}`);
  waar(`${naam}: merk, diameter en lengte uit de staaflijst`, bars.every((k, i) => {
    const s = staven[i];
    return k.attributes["ocss::calc::merk"] === lijst.merkVan[s.sleutel] && dichtbij(k.attributes["ocss::calc::diameter"] * 1000, s.d, 1e-6) && dichtbij(k.attributes["bsi::ifc::prop::Length"] * 1000, staafLengte(s), 0.002);
  }));
  const poer = uit.elementen.find((e) => e.klasse === "IfcFooting");
  const xs = m.omtrek.map((q) => q[0]);
  waar(`${naam}: het beton heeft de omtrek en hoogte van de poer`, poer && dichtbij(poer.grenzen.max[0] - poer.grenzen.min[0], (Math.max(...xs) - Math.min(...xs)) / 1000, 1e-5) && dichtbij(poer.grenzen.max[2], m.h / 1000, 1e-6));
  const staafGrenzen = uit.elementen.filter((e) => e.klasse === "IfcReinforcingBar");
  waar(`${naam}: de staven liggen in het beton`, staafGrenzen.every((e) => e.grenzen.min[2] >= -1e-6 && e.grenzen.max[2] <= m.h / 1000 + 1e-6
    && e.grenzen.min[0] >= poer.grenzen.min[0] - 1e-6 && e.grenzen.max[0] <= poer.grenzen.max[0] + 1e-6));
  waar(`${naam}: ${m.n} palen en een kolom`, uit.elementen.filter((e) => e.klasse === "IfcPile").length === m.n && uit.elementen.filter((e) => e.klasse === "IfcColumn").length === 1);
}
{
  // In het project: een leeg blad rekent met de beginwaarden van de bladtekst.
  const ex = { id: "ex-meer", naam: "Poer P2", templateId: "meerpaalspoer", source: MEER, waarden: {}, elementen: [] };
  const project = { versie: 2, naam: "Verzonnen project", gegevens: {}, exemplaren: [ex] };
  const [blad] = bladenVoorIfc(project);
  const m = maakMeerpaalPoer(lees(Object.fromEntries(Object.entries(MEER_BASIS))));
  const verwacht = stavenMeerpaal(m).length;
  waar("een poer op drie of vier palen krijgt in het project zijn geometrie, ook zonder ingevulde invoer", !blad.fout && (blad.geometrie?.length ?? 0) > 0, blad.fout ?? "");
  const doc = projectIfcx(project);
  const uit = leesIfcx(doc);
  waar(`het projectdocument heeft elke staaf (${verwacht})`, uit.elementen.filter((e) => e.klasse === "IfcReinforcingBar").length === verwacht);
  const step = projectStep(project);
  const tel = (t) => (step.match(new RegExp(`=${t}\\(`, "g")) ?? []).length;
  waar("de STEP heeft de poer, drie of vier palen, de kolom en elke staaf", tel("IFCFOOTING") === 1 && tel("IFCPILE") === 4 && tel("IFCCOLUMN") === 1 && tel("IFCREINFORCINGBAR") === verwacht, `${tel("IFCFOOTING")} ${tel("IFCPILE")} ${tel("IFCREINFORCINGBAR")}`);
  waar("de STEP uit het document is dezelfde", (bouwProjectStep(doc).match(/=IFCREINFORCINGBAR\(/g) ?? []).length === verwacht);
  const drie = bladenVoorIfc({ gegevens: {}, exemplaren: [{ ...ex, id: "ex-drie", waarden: { n_p: "3" } }] })[0];
  waar("drie palen in het project: drie palen in het document", (drie.geometrie ?? []).filter((k) => k.attributes?.["bsi::ifc::class"]?.code === "IfcPile").length === 3);
}

// ── 6. De status van de tekening ─────────────────────────────────────────────
console.log("\n6. Ontwerpschema of vrijgegeven voor uitvoering");
{
  const T = { ontwerp: "Ontwerpschema", vrijgegeven: "Vrijgegeven voor uitvoering", nietVrij: "niet vrij" };
  const status = (invoer, bron) => {
    const r = doorreken(bron, invoer).r;
    return { r, s: tekeningStatus(true, r.voldoet, T) };
  };
  const ok = status(MEER_BASIS, MEER);
  waar("vier palen voldoet: vrijgegeven komt in de titel", ok.r.voldoet === true && ok.s.vrijgegeven && ok.s.tekst === T.vrijgegeven, JSON.stringify(ok.r));
  const zonderH = status({ ...MEER_BASIS, horiz: "0" }, MEER);
  waar("horizontale krachten niet aangetoond (verplichte toets ontbreekt): niet vrij te geven", zonderH.r.voldoet !== true && !zonderH.s.vrijgegeven && zonderH.s.tekst.startsWith(T.ontwerp));
  const zonderEp = status({ ...GEMEEN, e_p: "0" }, TWEE);
  waar("twee palen zonder paalafwijking: niet vrij te geven", zonderEp.r.voldoet !== true && !zonderEp.s.vrijgegeven);
  const ongeldig = status({ ...MEER_BASIS, N_Ed: "0" }, MEER);
  waar("ongeldige invoer: geen oordeel en niet vrij te geven", ongeldig.r.voldoet !== true && ongeldig.r.uc === null && !ongeldig.s.vrijgegeven);
  const zwaar = status({ ...MEER_BASIS, n_t: "2" }, MEER);
  waar("poer voldoet niet: niet vrij te geven", zwaar.r.voldoet === false && !zwaar.s.vrijgegeven);
  waar("zonder vinkje altijd een ontwerpschema, ook als de poer voldoet", tekeningStatus(false, true, T).tekst === T.ontwerp && !tekeningStatus(false, true, T).vrijgegeven);
  const twee = doorreken(TWEE, GEMEEN).r;
  const dxf = detailNaarDxf(maakDetail(tweepaalVorm(maakPoer(lees(GEMEEN))), { titel: "Poer P1", status: tekeningStatus(true, twee.voldoet, T).tekst }));
  waar(`twee palen, geval 1 (${twee.voldoet ? "voldoet" : "geen voldoet"}): de status staat in de titel van het DXF`, dxf.includes(`Poer P1 - ${twee.voldoet ? T.vrijgegeven : T.ontwerp}`));
}

// ── 7. Onzin tijdens het typen ───────────────────────────────────────────────
console.log("\n7. Invoer die niet klopt");
for (const [naam, invoer, twee] of [
  ["twee palen, alles leeg", {}, true],
  ["twee palen, geen staven", { ...GEMEEN, n_t: "0", n_s: "0", n_z: "0", n_b: "0", n_hp: "0", n_dw: "0" }, true],
  ["twee palen, dekking groter dan de poer", { ...GEMEEN, c_z: "2000", c_o: "2000" }, true],
  ["meer palen, alles leeg", {}, false],
  ["drie palen, rand 0", { ...MEER_BASIS, n_p: "3", r_rand: "0" }, false],
  ["vier palen, net h.o.h. 0", { ...MEER_BASIS, s_n: "0" }, false],
  ["vier palen, diameter 0", { ...MEER_BASIS, d_t: "0", d_n: "0", d_z: "0" }, false],
]) {
  let fout = "";
  let schoon = false;
  try {
    const vorm = twee ? tweepaalVorm(maakPoer(lees(invoer))) : meerpaalVorm(maakMeerpaalPoer(lees(invoer)));
    const lijst = maakStaaflijst(vorm.staven);
    const dxf = detailNaarDxf(maakDetail(vorm, { titel: "P", status: "x" }));
    const doc = twee ? poerIfcxDocument(maakPoer(lees(invoer))) : meerpaalIfcxDocument(maakMeerpaalPoer(lees(invoer)));
    schoon = !/NaN|Infinity/.test(dxf) && lijst.regels.every((r) => Number.isFinite(r.lengte) && Number.isFinite(r.totaal))
      && (doc === null || !/NaN|Infinity|null/.test(JSON.stringify(doc.data.filter((k) => k.attributes?.["usd::usdgeom::mesh"]))));
  } catch (err) {
    fout = err.message;
  }
  waar(`${naam}: geen fout en geen NaN`, schoon && !fout, fout);
}
waar("koorde buiten de veelhoek: niets", koorde([[0, 0], [1, 0], [1, 1], [0, 1]], 1, 2) === null);

// ── 8. Kruisende banden bij drie palen ──────────────────────────────────────
console.log("\n8. Drie palen: de kruisende banden in drie lagen");
{
  const m = maakMeerpaalPoer(lees({ ...MEER_BASIS, n_p: "3" }));
  const staven = stavenMeerpaal(m);
  // De hoogte van het rechte stuk van een band: het tweede punt van een omgebogen staaf.
  const hoogte = (sleutel) => [...new Set(staven.filter((s) => s.sleutel === sleutel).map((s) => s.pad[1][2]))];
  waar("drie lagen: z = 85, 105 en 125", m.zBand.length === 3 && m.zBand.every((z, i) => dichtbij(z, [85, 105, 125][i], 1e-9)), m.zBand.join(","));
  waar("de onderste band (paal 2 naar 3) op 85, de linker schuine op 105, de rechter op 125",
    hoogte("band/2").join() === "85" && hoogte("band/1").join() === "105" && hoogte("band/3").join() === "125", `${hoogte("band/1")} ${hoogte("band/2")} ${hoogte("band/3")}`);
  const netZ = [...new Set(staven.filter((s) => s.soort === "net").map((s) => s.pad[0][2]))].sort((a, b) => a - b);
  waar("het net op de banden: 141 en 153", netZ.length === 2 && dichtbij(netZ[0], 141, 1e-9) && dichtbij(netZ[1], 153, 1e-9), netZ.join(","));
  const randZ = staven.filter((s) => s.soort === "randbeugel").map((s) => s.pad[0][2]);
  waar("randbeugels op 316,25, 497,5 en 678,75", randZ.length === 3 && randZ.every((z, i) => dichtbij(z, [316.25, 497.5, 678.75][i], 1e-9)), randZ.join(","));
  const blad = doorreken(MEER, { ...MEER_BASIS, n_p: "3" });
  waar(`de hoogste band ligt op h − d van het blad (${blad.uit.d_eff})`, dichtbij(m.h - Math.max(...m.zBand), blad.uit.d_eff, 1e-9));
  const vier = maakMeerpaalPoer(lees(MEER_BASIS));
  waar("vier palen: twee lagen, 85 en 105, het net op 121", vier.zBand.length === 2 && dichtbij(vier.zBand[1], 105, 1e-9)
    && dichtbij(Math.min(...stavenMeerpaal(vier).filter((s) => s.soort === "net").map((s) => s.pad[0][2])), 121, 1e-9));
  // De twee schuine banden kruisen boven de bovenste paal: daar mogen ze elkaar niet raken.
  const op = (sleutel) => staven.filter((s) => s.sleutel === sleutel);
  const afstand = Math.min(...op("band/1").flatMap((a) => op("band/3").map((b) => Math.abs(a.pad[1][2] - b.pad[1][2]))));
  waar("de schuine banden liggen een staafdiameter uit elkaar (hart op hart 20)", dichtbij(afstand, 20, 1e-9), String(afstand));
  const lijst = maakStaaflijst(staven);
  waar("de staaflijst: één merk voor de drie banden, 15 staven", lijst.regels.filter((r) => r.soort === "band").length === 1 && regelVan(lijst, "band").aantal === 15);
  const vorm = meerpaalVorm(m);
  waar("de vorm weet dat de banden kruisen; vier palen niet", vorm.kruisend === true && !meerpaalVorm(vier).kruisend);
  const detail = maakDetail(vorm, { titel: "P", status: "x" });
  waar("onder de staaflijst in de tekening staat de volgorde van de lagen", detail.prims.some((p) => p.soort === "tekst" && p.t === DETAIL_NL.kruisend));
  // Doorsnede B-B door de bovenste paal: de drie banden als cirkels op hun eigen hoogte.
  const bb = detail.aanzichten[2].kader;
  const cirkels = detail.prims.filter((p) => p.soort === "cirkel" && p.laag === "WAPENING" && dichtbij(p.r, 10, 1e-9)
    && p.c[0] >= bb.x0 && p.c[0] <= bb.x1 && p.c[1] >= bb.y0 && p.c[1] <= bb.y1);
  // Hoger snijdt het vlak nog de bochten naar de benen; de rechte stukken liggen op hun laag.
  const zB = [...new Set(cirkels.map((p) => Math.round((p.c[1] - bb.y0) * 1000) / 1000))].sort((a, b) => a - b);
  waar(`doorsnede B-B: de rechte stukken van de banden op 85, 105 en 125 (${zB.join(", ")})`, zB.slice(0, 3).join() === "85,105,125", zB.join(","));
  const dxf = detailNaarDxf(detail);
  waar("het DXF heeft de tekst over de lagen", dxf.includes("Banden in drie lagen"));
  const uit = leesIfcx(JSON.parse(JSON.stringify(meerpaalIfcxDocument(m))));
  const bandBars = uit.elementen.filter((e) => e.klasse === "IfcReinforcingBar" && e.naam.startsWith("Bandstaaf"));
  const onder = {};
  for (const e of bandBars) {
    // Op de millimeter: de buis is een achthoek en ligt bij een schuine staaf iets gedraaid.
    const z = Math.round(e.grenzen.min[2] * 1e3);
    onder[z] = (onder[z] ?? 0) + 1;
  }
  waar("IFCX: 5 bandstaven met hun onderkant op 75, 95 en 115 mm", onder[75] === 5 && onder[95] === 5 && onder[115] === 5, JSON.stringify(onder));
}

console.log(`\nStaaflijst, DXF en IFC-wapening: ${getest} controles, ${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
