/**
 * Controlescript voor de module Tweepaalspoer (templates/tweepaalspoer.ts). De
 * toetsset en het toepassingsgebied staan in docs/tweepaalspoer-toetsing.md.
 *
 * Geen referentieberekening beschikbaar: alle gevallen zijn fictief en met de hand
 * uitgewerkt (in het commentaar), buiten het blad om. Een verwachting alleen aanpassen
 * met een handberekening die aantoont dat de nieuwe waarde juist is.
 *
 *   1. Referentiegeval 1: vierkante palen, rechthoekige kolom, één laag, omgebogen staven.
 *   2. Referentiegeval 2: ronde palen en kolom, twee lagen, h ≥ 1000 mm, XC4.
 *   3. Referentiegeval 3: rechte staaf, XC1.
 *   4. Gevallen die niet voldoen: per toets één oorzaak.
 *   5. Grensgevallen: net wel en net niet, ook een UC die op 1,00 zou afronden.
 *   6. De vier toestanden: voldoet, voldoet niet, niet getoetst, niet van toepassing;
 *      ongeldige invoer en buiten het toepassingsgebied.
 *   7. Project en belasting: gevolgklasse, ontwerplevensduur, milieu, ondergrond.
 *   8. Eén definitie: tekening en blad zijn het eens over de staven, ook na een wijziging.
 *   9. Opslaan, heropenen en bijwerken: niets gaat verloren, niets wordt stil gunstiger.
 *
 * Draaien:  node scripts/check-tweepaalspoer.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parse, evaluate, render } from "../packages/core/dist/index.js";
import { laadTemplate } from "./lib/refcheck.mjs";

const { leesResultaat, leesGetallen, ucTekst } = await import("../packages/desktop/src/components/calc/bladLezen.ts");
const { maakPoer, staafTelling } = await import("../packages/desktop/src/components/calc/poerDefinitie.ts");
const { tekenPoer } = await import("../packages/desktop/src/components/calc/poerTekening.ts");
const { bronVoorUitvoer } = await import("../packages/desktop/src/templates/vertalingen.ts");
const { invoervelden, isVerouderd, rekenversie, vergelijkInvoer, vergelijkUitkomst } = await import("../packages/desktop/src/components/calc/bladVersie.ts");
const { bouwProjectBestand, leesProjectBestand } = await import("../packages/desktop/src/store/projectBestand.ts");

const hier = dirname(fileURLToPath(import.meta.url));
const tpl = laadTemplate("tweepaalspoer.ts");
const SCOPE = { CC: 2, RC: 2, K_FI: 1, DesignLife: 50, rekenwijze: 1 };

let fouten = 0;
let getest = 0;
const waar = (wat, ok, detail = "") => {
  getest++;
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${wat}${ok || !detail ? "" : ` — ${detail}`}`);
};

/** Doorrekenen: onafgeronde uitkomsten, platte tekst en het oordeel van het blad. */
function doorreken(waarden, scope = SCOPE, bron = tpl) {
  const nodes = evaluate(parse(bron), waarden, scope);
  const html = render(nodes);
  const tekst = html.replace(/<annotation[\s\S]*?<\/annotation>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return { uit: leesGetallen(nodes), tekst, html, r: leesResultaat(nodes, "x"), nodes };
}
function toets(r, verwacht, tol = 1.5e-3) {
  for (const [naam, doel] of Object.entries(verwacht)) {
    getest++;
    const ons = r.uit[naam];
    const ok = ons !== undefined && Math.abs(ons - doel) <= tol * Math.max(Math.abs(doel), 1e-9);
    if (!ok) fouten++;
    console.log(`  ${ok ? "OK    " : "FOUT  "} ${naam.padEnd(9)} blad ${String(ons === undefined ? "—" : Number(ons.toPrecision(6))).padStart(10)}   hand ${doel}`);
  }
}
function geenFouten(r, wat) {
  const signaal = ["Error", "Undefined symbol", "NaN", "niet gedefinieerd", "Unexpected type", "Infinity"].find((s) => r.tekst.includes(s));
  waar(`${wat}: geen foutmelding of NaN`, !signaal, signaal ? r.tekst.slice(Math.max(0, r.tekst.indexOf(signaal) - 80), r.tekst.indexOf(signaal) + 80) : "");
}
const voldoet = (r) => r.r.voldoet === true && r.r.uc !== null && !r.r.nietGetoetst;
const voldoetNiet = (r) => r.r.voldoet === false && r.r.uc !== null && r.r.uc > 1 && !r.r.nietGetoetst;
const nietGetoetst = (r) => r.r.voldoet === null && r.r.uc === null && r.r.nietGetoetst === true && !r.tekst.includes("Maatgevende UC");

// ── 1. Referentiegeval 1 ────────────────────────────────────────────────────
console.log("\n1. Referentiegeval: poer 2100×580×900, palen 350×350 h.o.h. 1400, kolom 400×400, C30/37, 6Ø25, F_Ed = 1800 kN");
const RC1 = {
  l_poer: "2100", b_poer: "580", h_poer: "900", a_hoh: "1400", e_p: "50", t_in: "50",
  paalvorm: "1", p_x: "350", p_y: "350", kolomvorm: "1", c_x: "400", c_y: "400",
  betonklasse: "30", betonstaal: "2", milieu: "2", ondergrond: "1", d_g: "16", c_o: "60", c_z: "40",
  n_t: "6", d_t: "25", s_t: "70", lagen: "1", vorm_t: "2", l_op: "600", D_m: "125",
  d_s: "12", s_s: "100", n_s: "4", n_z: "5", d_z: "12", n_b: "3", d_b: "12", n_hp: "2", d_hp: "12",
  F_Ed: "1800", F_fr: "1200", dwars: "1",
};
{
  const r = doorreken(RC1);
  geenFouten(r, "geval 1");
  toets(r, {
    // Sterkten: f_cd = 30/1,5 = 20; f_yd = 500/1,15 = 434,8; ν′ = 1 − 30/250 = 0,88; ν = 0,6·0,88 = 0,528.
    f_cd: 20, f_yd: 434.78, "ν_s": 0.88, "ν_v": 0.528,
    // A_s = 6·π·25²/4 = 2945 mm². Hart trekband: 60 + 12 + 12,5 = 84,5; d = 900 − 84,5 = 815,5.
    A_s: 2945.2, a_t: 84.5, d_eff: 815.5,
    // a_v = 700 − 175 − 200 − 50 = 275.
    a_v: 275,
    // Eigen gewicht 25·2,1·0,58·0,9 = 27,405 kN. F_tot = 1800 + 1,35·27,405 = 1837,0; BGT 1227,4.
    G_poer: 27.405, F_tot: 1837.0, F_fr_t: 1227.4,
    // R_Ed = 918,5·(1 + 2·50/1400) = 918,5·1,07143 = 984,1 kN. Arm 700 + 50 − 400/4 = 650.
    R_Ed: 984.11, l_t: 650,
    // M_t = 918,5·0,650 = 597,0 kNm. Dwars op de paallijn: 1837,0·0,05 = 91,85 kNm.
    M_t: 597.02, M_dwars: 91.85,
    // Knoopgrens 1,0·0,88·20 = 17,6. Drukzone: ξ = 2·597,0e6/(400·17,6·815,5²) = 0,2550;
    // x = 815,5·(1 − √0,7450) = 111,6; d − x/2 = 759,7 > 0,9·d = 733,95, dus z = 733,95 en x_c = 163,1.
    "σ_ccc": 17.6, z_u: 733.95, x_c: 163.1,
    // T = 597,0e3/733,95 = 813,4 kN. θ = atan(733,95/650) = 48,47°. F_c = 984,1/sin θ = 984,1/0,7486 = 1314,6.
    T_Ed: 813.44, "θ_g": 48.47, F_c: 1314.6, H_s: 980.4,
    // T_Rd = 2945,2·434,78 = 1280,5 kN; UC = 813,4/1280,5 = 0,635.
    T_Rd: 1280.5, UC_T: 0.6352,
    // A_s,min1 = (2,9·580·900²/6)/(0,9·815,5·434,78) = 227,1e6/319,1e3 = 711,6; A_s,min2 = 1,25·813,4e3/434,78 = 2339; kleinste 711,6.
    A_smin: 711.58, UC_A: 0.2416,
    // σ_0 = 1800e3/400² = 11,25. a_A = 200·sin θ + 163,1·cos θ = 149,7 + 108,1 = 257,9; σ_A = 1314,6e3/(257,9·400) = 12,75.
    "σ_0": 11.25, "σ_A": 12.745, UC_ccc: 0.7241,
    // Knoop paal: k = 0,85; grens 0,85·0,88·20 = 14,96. σ_1 = 984,1e3/350² = 8,03.
    // a_B = 350·sin θ + 2·(84,5 − 50)·cos θ = 262,0 + 45,7 = 307,8; σ_B = 1314,6e3/(307,8·350) = 12,20; UC = 12,20/14,96 = 0,816.
    k_n: 0.85, "σ_cct": 14.96, "σ_1": 8.0335, "σ_B": 12.204, UC_cct: 0.8158,
    // b_ef = 0,5·980,4 + 0,65·350 = 717,7 > 580, dus 580. Gemiddelde breedte (257,9 + 307,8)/2 = 282,8.
    // σ_m = 1314,6e3/(282,8·580) = 8,01; grens 0,6·0,88·20 = 10,56; UC 0,759.
    "σ_m": 8.0141, "σ_d": 10.56, UC_d: 0.7589,
    // Splijt in het vlak, per helft van de diagonaal: T = ¼·(1 − 0,7·257,9/980,4)·1314,6 = 268,1 kN.
    // Beugels in a_v: ⌊275/100⌋ = 2 met 4 sneden Ø12: 904,8 mm²; zijstaven 2·5·113,1 = 1131 mm².
    // R = 434,78·(904,8·0,6628 + 1131·0,7486)/2/1000 = 314,5 kN; UC 0,853.
    n_sb: 2, T_sx: 268.13, R_sx: 314.46, UC_sx: 0.8527,
    // Splijt dwars: b = 580 > H/2 = 490, dus (6.59). Paalzijde: T = ¼·(1 − 0,7·350/980,4)·1314,6 = 246,5 kN.
    // Haarspelden 2·113,1 + onderbenen ⌊(137,5 + 350)/100⌋ = 4 · 2 · 113,1 = 1131 mm²; R = 491,7 kN.
    T_sp: 246.51, R_sp: 491.73,
    // Kolomzijde: T = ¼·(1 − 0,7·400/980,4)·1314,6 = 234,8 kN. Bovenbenen ⌊(137,5 + 200)/100⌋ = 3 · 2 · 113,1 = 678,6 mm²; R = 295,0 kN.
    T_sk: 234.78, R_sk: 295.04,
    // Haarspeld: l_b,rqd = 12/4·434,78/3 = 434,8 ≤ 776 beschikbaar: 0,560. UC = max(0,501; 0,796; 0,560) = 0,796.
    UC_sy: 0.7958,
    // V_max = 0,5·580·815,5·0,528·20 = 2497,4 kN; UC = 984,1/2497,4 = 0,394.
    V_max: 2497.4, UC_V: 0.3941,
    // Langs de kolom alleen de twee vlakken naar de palen: u = 2·400. v_k = 1,15·1800e3/(800·815,5) = 3,173.
    // u_0p = min(350 + 2446,5; 350 + 700) = 1050; v_p = 1,4·984,1e3/(1050·815,5) = 1,609. v_Rd = 0,4·0,528·20 = 4,224; UC = 0,751.
    v_k: 3.1729, v_p: 1.609, v_Rd: 4.224, UC_v: 0.7512,
    // f_ctd = 2,0/1,5; f_bd = 2,25·1,333 = 3,0. σ_sd = 813,4e3/2945,2 = 276,2; l_b,rqd = 25/4·276,2/3 = 575,4.
    // c_d = min(45/2; 102,5) = 22,5 < 3Ø: α_1 = 1; α_2 = 1. l_bd = 575,4.
    f_bd: 3, l_rqd: 575.39, c_d: 22.5, "α_1": 1, "α_2": 1, l_bd: 575.39,
    // Recht deel: 1050 − 40 − (700 − 175 + 50) − 12,5 = 422,5. Langs de hartlijn: 422,5 + 600 − 0,4292·75 = 990,3.
    l_h: 422.5, l_av: 990.31, UC_l: 0.5810,
    // Doorn: tabel 5Ø = 125. Rest 575,4 − 422,5 = 152,9 > 5Ø, dus ook (8.1):
    // F_bt = 490,9·276,2·(1 − 422,5/575,4) = 36,0 kN; a_b = min(35; 115) = 35; D = 36024·(1/35 + 1/50)/20 = 87,5 < 125.
    // Been: 84,5 + 600 + 40 = 724,5 ≤ 900; 5Ø recht na de bocht: 125 + 75 = 200 ≤ 600. UC_D = 125/125 = 1.
    D_nodig: 125, UC_D: 1,
    // BGT: hefboomsarm min(733,95; 0,2·(1400 + 1800) = 640) = 640 (a ≥ h).
    // T_fr = 1227,4/2·650/640 = 623,3 kN; σ_s = 211,6 N/mm².
    z_s: 640, "σ_s": 211.63,
    // α_e = 200000/33000 = 6,06; ρ = 2945,2/(580·815,5) = 0,00623; x_e = 195,4.
    // h_c,ef = min(2,5·84,5; (900 − 195,4)/3; 450) = 211,25. ρ_p = 2945,2/(580·211,25) = 0,02404.
    // k_2 = 1 − 211,25/(2·704,6) = 0,8501. s_r,max = 3,4·72 + 0,8·0,8501·0,425·25/0,02404 = 244,8 + 300,6 = 545,4;
    // bovengrens max((50 − 24)·25; 15·25) = 650, dus 545,4.
    s_rmax: 545.4,
    // ε = (211,6 − 0,4·2,9/0,02404·(1 + 6,06·0,02404))/200000 = (211,6 − 55,3)/200000 = 0,000782; ondergrens 0,6·211,6/200000 = 0,000635.
    "ε_w": 0.0007817,
    // w_k = 545,4·0,000782 = 0,426 mm.
    w_k: 0.42634,
    // Grens XC2: 0,30·k_x; c_nom = max(max(12; 25; 10) + 5; 25 + 10) = 35; k_x = 60/35 = 1,714; w_lim = 0,514.
    // UC = max(0,829; σ_s/f_yk = 0,423) = 0,829.
    w_lim: 0.51429, UC_w: 0.8290,
    // Vrije ruimte: trekband 45 ≥ max(25; 21; 20) = 25: 0,556. Beugels per rij: 100/2 = 50, vrij 38: 21/38 = 0,553.
    // Boven de paal liggen haarspelden en onderbenen op één hoogte: 350/(2 + 3,5·2) = 38,9, vrij 26,9: 21/26,9 = 0,781.
    // Onderste zijstaaf boven de trekband: (84,5 + 12,5 + 6)/(72 + 129,3) = 0,512. Grootste 0,781.
    UC_sp: 0.7810,
    // Band 375; zone 350 + 2·(84,5 − 50) = 419: 0,895. Band met haarspelden 375 + 24 = 399 in de binnenmaat 476: 0,838.
    b_band: 375, UC_bd: 0.8950,
    // Kleinste diameters: 8/25, 5/12, 6/12, 6/12, 8/12: 0,667.
    UC_min: 0.6667,
    // Wapening boven de kop: 50/60. Rand: (40 + 50)/min(175; 115) = 0,783. Dekking 35/60; 30/72; 30/40; 30/40; 30/52: 0,75.
    UC_kop: 0.8333, UC_rd: 0.7826, c_reqo: 35, c_reqz: 30, UC_dek: 0.75,
    // Net: 580 mm²/m. Eén been aan het vlak: 113,1·1000/100 = 1131; zijstaven 5·113,1·1000/776 = 728,7: 580/728,7 = 0,796.
    UC_net: 0.7959,
    // Beugels: langs 100/300 = 0,333; dwars hart-op-hart (580 − 80 − 12)/3 = 162,7: 162,7/500 = 0,325; ρ_w ruim boven ρ_w,min.
    UC_bg: 0.3333,
  });
  waar("geval 1 voldoet; de hoogste UC is precies 1 (de doorn), UC_max = 1,00", voldoet(r) && r.r.uc === 1, JSON.stringify(r.r));
  waar("de slotregel noemt 'Poer voldoet'", /Maatgevende UC = 1 .*Poer voldoet/.test(r.tekst), r.tekst.slice(-300));
  waar("huidwapening: niet van toepassing bij h < 1000 mm", /Huidwapening 7\.3\.3\(3\) — niet van toepassing/.test(r.tekst));
  waar("V_Rd,c en pons op u_1 staan als niet van toepassing", /6\.2\.2\(7\), 6\.4\.4 — niet van toepassing/.test(r.tekst));
  waar("de samenvatting rondt naar boven af (0,6352 → 0,64)", /Trekband 6\.5\.3 0\.64 voldoet/.test(r.tekst), r.tekst.slice(r.tekst.indexOf("Trekband 6.5.3"), r.tekst.indexOf("Trekband 6.5.3") + 40));
}

// ── 2. Referentiegeval 2 ────────────────────────────────────────────────────
console.log("\n2. Referentiegeval: ronde palen Ø450, ronde kolom Ø500, poer 2800×800×1200, C35/45, XC4, 12Ø25 in twee lagen");
const RC2 = {
  ...RC1, l_poer: "2800", b_poer: "800", h_poer: "1200", a_hoh: "1800", e_p: "75", t_in: "75",
  paalvorm: "2", p_x: "450", kolomvorm: "2", c_x: "500", betonklasse: "35", milieu: "3", c_o: "85", c_z: "45",
  n_t: "12", s_t: "75", lagen: "2", l_op: "800", D_m: "125", d_s: "16", s_s: "125", n_s: "4", n_z: "6", d_z: "16", n_hp: "3", d_hp: "16",
  F_Ed: "3200", F_fr: "2200",
};
{
  const r = doorreken(RC2);
  geenFouten(r, "geval 2");
  toets(r, {
    // Twee lagen: vrij tussen de lagen max(25; 21; 20) = 25. Hart: 85 + 16 + 12,5 + (25 + 25)/2 = 138,5; d = 1061,5.
    a_t: 138.5, d_eff: 1061.5, A_s: 5890.5,
    // Eigen gewicht 25·2,8·0,8·1,2 = 67,2; F_tot = 3200 + 1,35·67,2 = 3290,7.
    G_poer: 67.2, F_tot: 3290.72,
    // R_Ed = 1645,36·(1 + 150/1800) = 1782,5. Halve cirkel: e_k = 2·500/(3π) = 106,1; arm 900 + 75 − 106,1 = 868,9.
    R_Ed: 1782.47, l_t: 868.9,
    // M_t = 1645,36·0,8689 = 1429,6 kNm. Gelijkwaardig vierkant 500·√π/2 = 443,1.
    // σ_ccc = (1 − 35/250)·35/1,5 = 20,07; ξ = 2·1429,6e6/(443,1·20,07·1061,5²) = 0,2854; x = 164,2;
    // d − x/2 = 979,4 > 0,9·d = 955,35; z = 955,35; x_c = 212,3.
    M_t: 1429.6, "σ_ccc": 20.067, z_u: 955.35, x_c: 212.3,
    // T = 1429,6e3/955,35 = 1496,5 kN; θ = atan(955,35/868,9) = 47,71°; F_c = 1782,5/0,7399 = 2409,4.
    T_Ed: 1496.5, "θ_g": 47.713, F_c: 2409.4, H_s: 1291.4,
    // σ_0 = 3200e3/(π·500²/4) = 16,30; σ_1 = 1782,5e3/(π·450²/4) = 11,21.
    "σ_0": 16.297, "σ_1": 11.207, UC_ccc: 0.8834, UC_cct: 0.9310,
    UC_T: 0.5843, UC_d: 0.7280, UC_sx: 0.8057, UC_V: 0.3487,
    // Dwars: gelijkwaardig 398,8 aan de paal, 443,1 aan de kolom. Bovenbenen ⌊(175 + 250)/125⌋ = 3 · 2 · 201,1 = 1206 mm²; R = 524,5.
    // T = ¼·(1 − 0,7·443,1/1291,4)·2409,4 = 457,7 kN; UC 0,873.
    T_sk: 457.68, R_sk: 524.51, T_sp: 472.15, R_sp: 1136.4, UC_sy: 0.8726,
    // Langs de kolom 2·443,1: v_k = 1,15·3200e3/(886,2·1061,5) = 3,912; v_Rd = 0,4·0,516·23,33 = 4,816; UC 0,812.
    v_k: 3.9119, UC_v: 0.8123,
    // De bovenste laag ligt 50 naar binnen: 1400 − 45 − (900 − 225 + 75) − 50 − 12,5 = 542,5.
    l_h: 542.5, l_rqd: 481.15, l_av: 1310.3, UC_l: 0.3672,
    // BGT: a ≥ h: 0,2·(1800 + 2400) = 840. T_fr = 2267,2/2·868,9/840 = 1172,6; σ_s = 199,1.
    z_s: 840, "σ_s": 199.07,
    // s_r,max = min(643,9; max(22·25; 375) = 550) = 550; de bovengrens van de NB geldt hier.
    s_rmax: 550,
    // XC4: c_dur = 30; c_nom = max(35; 40) = 40; k_x = min(2; 85/40) = 2: w_lim = 0,60.
    w_k: 0.37741, w_lim: 0.6, UC_w: 0.6290,
    // Huidwapening bij h ≥ 1000: 0,4·0,5·3,2·800·1200/2/500 = 614,4; aanwezig 2·6·201,1 = 2413.
    A_huid: 614.4, UC_h: 0.2546,
    // Net op het zijvlak: 800 mm²/m. Alleen het buitenste been ligt aan het vlak: 201,1·1000/125 = 1608; zijstaven 6·201,1·1000/1038 = 1162: 0,688.
    UC_net: 0.6884,
    // Zone op de hoogte van de onderste laag: 398,8 + 2·(85 + 16 + 12,5 − 75) = 475,8; band 400: 0,841.
    UC_bd: 0.8407,
  });
  waar("geval 2 voldoet", voldoet(r), JSON.stringify(r.r));
  waar("huidwapening staat als toets op het blad", /Huidwapening 7\.3\.3\(3\) 0\.26 voldoet/.test(r.tekst));
}

// ── 3. Referentiegeval 3 ────────────────────────────────────────────────────
console.log("\n3. Referentiegeval: rechte staven, XC1, C25/30, 4Ø16, kolom 450×350");
const RC3 = {
  ...RC1, l_poer: "2300", b_poer: "570", h_poer: "850", a_hoh: "1300", e_p: "25", t_in: "50", p_x: "320", p_y: "320",
  c_x: "450", c_y: "350", betonklasse: "25", milieu: "1", d_g: "16", c_o: "60", c_z: "35",
  n_t: "4", d_t: "16", s_t: "60", vorm_t: "1", d_s: "10", s_s: "100", n_s: "2", n_z: "4", n_hp: "2", d_hp: "10",
  F_Ed: "500", F_fr: "350",
};
{
  const r = doorreken(RC3);
  geenFouten(r, "geval 3");
  toets(r, {
    a_t: 78, d_eff: 772, F_tot: 537.61, T_Ed: 217.62,
    // Rechte staaf: c_d = min(44/2; 187; 70) = 22; α_2 = 1 − 0,15·(22 − 16)/16 = 0,9438; α_1 = 1.
    // f_bd = 2,25·1,8/1,5 = 2,7; σ_sd = 217,62e3/804,2 = 270,6; l_b,rqd = 4·270,6/2,7 = 400,9; l_bd = 0,9438·400,9 = 378,3.
    c_d: 22, "α_1": 1, "α_2": 0.94375, l_rqd: 400.87, l_bd: 378.32,
    // Beschikbaar: 1150 − 35 − (650 − 160 + 25) = 600, geen been.
    l_h: 600, l_av: 600, UC_l: 0.6305,
    // A_s,min1 = (2,6·570·850²/6)/(0,9·772·434,78) = 590,8; UC = 590,8/804,2 = 0,735.
    A_smin: 590.75, UC_A: 0.7345,
    // XC1: grens 0,40 zonder k_x (de grens gaat daar om het uiterlijk). c_w = 70:
    // s_r,max = min(3,4·70 + …; 480) = 480. w_k = 480·0,000661 = 0,3171.
    s_rmax: 480, w_k: 0.31713, w_lim: 0.4, UC_w: 0.7928,
    // Dekking XC1, werkvloer: c_dur = 15; max(20; 25) = 25; c_o = 60.
    c_reqo: 25, c_reqz: 20,
    // Bovenbenen ⌊(120 + 225)/100⌋ = 3 · 1 · 78,5 = 235,6 mm²; R = 102,4. T_sk = ¼·(1 − 0,7·350/894)·359,2 = 65,2.
    T_sk: 65.181, R_sk: 102.44, UC_sy: 0.6363,
    // Dwars hart-op-hart: 570 − 70 − 10 = 490; 490/500 = 0,98.
    UC_bg: 0.98,
  });
  waar("geval 3 voldoet", voldoet(r), JSON.stringify(r.r));
  waar("ombuiging: niet van toepassing bij een rechte staaf", /Ombuiging en been 8\.3 — niet van toepassing/.test(r.tekst));
  waar("geen doorn op het blad bij een rechte staaf", r.uit.D_nodig === undefined);
}

// ── 4. Gevallen die niet voldoen ────────────────────────────────────────────
console.log("\n4. Gevallen die niet voldoen");
const GEVALLEN_NIET = [
  // T_Ed = 814 kN op 2Ø25 = 427 kN: UC 1,91.
  ["te weinig trekband", { n_t: "2", s_t: "70" }, "UC_T", (u) => u > 1.8],
  // σ_1 = R/A: paal 200×200 → 984,8e3/40000 = 24,6 > 14,96.
  ["paal te klein voor de knoop", { p_x: "200", p_y: "200" }, "UC_cct", (u) => u > 1],
  // σ_0 = 1800e3/(200·400) = 22,5 > 17,6.
  ["kolom te klein", { c_x: "200", c_y: "400" }, "UC_ccc", (u) => Math.abs(u - 22.5 / 17.6) < 1e-3],
  ["geen beugels in a_v en geen zijstaven", { s_s: "400", n_z: "0" }, "UC_sx", (u) => u > 1],
  ["geen haarspelden en grote beugelafstand", { n_hp: "0", s_s: "300" }, "UC_sy", (u) => u > 1],
  // Recht einde: beschikbaar 435, l_b,rqd 575,8.
  ["rechte staaf te kort", { vorm_t: "1" }, "UC_l", (u) => u > 1],
  // Doorn 4Ø = 100 < 5Ø = 125 voor Ø25.
  ["doorn te klein", { D_m: "100" }, "UC_D", (u) => u > 1.2],
  // Been 800: 84,5 + 800 + 40 = 924,5 > 900.
  ["been past niet in de hoogte", { l_op: "800" }, "UC_D", (u) => u > 1],
  ["scheurwijdte te groot", { F_fr: "1800", milieu: "4", c_o: "60" }, "UC_w", (u) => u > 1],
  ["staven staan te dicht", { s_t: "45" }, "UC_sp", (u) => u > 1],
  ["trekband breder dan de zone boven de paal", { s_t: "100" }, "UC_bd", (u) => u > 1],
  ["staaf kleiner dan Ø8", { d_t: "6", s_t: "60", n_t: "20" }, "UC_min", (u) => u > 1],
  ["paal te dicht bij de rand", { b_poer: "500", s_t: "60" }, "UC_rd", (u) => u > 1],
  ["dekking te klein op de grond", { ondergrond: "2" }, "UC_dek", (u) => u > 1],
  ["te weinig zijstaven voor het net van 9.7", { n_z: "2" }, "UC_net", (u) => u > 1],
  ["beugels te ver uit elkaar", { s_s: "350" }, "UC_bg", (u) => u > 1],
  // Een noemer van 0 of minder mag een overschrijding niet onder de 1 houden.
  ["staven overlappen elkaar (h.o.h. kleiner dan Ø)", { s_t: "20" }, "UC_sp", (u) => u === 99],
  ["staven raken elkaar (h.o.h. gelijk aan Ø)", { s_t: "25" }, "UC_sp", (u) => u === 99],
  ["dekking groter dan de halve breedte", { c_z: "320" }, "UC_bd", (u) => u === 99],
  ["recht staafeinde zonder lengte", { vorm_t: "1", l_poer: "1460", p_x: "60", p_y: "60" }, "UC_l", (u) => u === 99],
];
for (const [wat, invoer, naam, test] of GEVALLEN_NIET) {
  const r = doorreken({ ...RC1, ...invoer });
  waar(`${wat}: ${naam} = ${r.uit[naam]?.toFixed(3)}, oordeel voldoet niet`, test(r.uit[naam]) && voldoetNiet(r), JSON.stringify(r.r));
}
{
  // Zonder haarspelden: k = 0,75 in plaats van 0,85 (de NB koppelt k_2 aan haarspelden). UC_cct = 0,8158·0,85/0,75 = 0,9245.
  const r = doorreken({ ...RC1, n_hp: "0" });
  toets(r, { k_n: 0.75, UC_cct: 0.9245 });
  // Bij drie sneden: één gesloten beugel en een los been, dus één onderbeen per beugel (floor(3/2)).
  // Paal: 2·113,1 + 4·1·113,1 = 678,6: R = 295,0. Kolom: 3·1·113,1: R = 147,5.
  toets(doorreken({ ...RC1, n_s: "3" }), { R_sp: 295.0, R_sk: 147.52 });
  // Zonder zijstaven blijven de beugels: 904,8·cos θ·434,78/2 = 130,4 kN < T = 268 kN.
  toets(doorreken({ ...RC1, n_z: "0" }), { R_sx: 130.37 });

  console.log("\n   Ongunstige en onmogelijke invoer die geen 'voldoet' mag geven");
  // De benen van de beugels hart-op-hart, niet de binnenmaat: b = 600, 2 sneden: (600 − 80 − 12)/1 = 508 > 500.
  const benen = doorreken({ ...RC1, b_poer: "600", n_s: "2" });
  toets(benen, { UC_bg: 1.016 });
  waar("beugelbenen 508 mm uit elkaar: voldoet niet", voldoetNiet(benen));
  // Splijtkracht per helft van de diagonaal (figuur 6.25): de staven tellen voor de helft.
  const helft = doorreken({ ...RC1, l_poer: "1630", b_poer: "600", h_poer: "797", a_hoh: "1100", e_p: "1", t_in: "55", p_x: "400", p_y: "500", c_x: "600", c_y: "300", betonklasse: "40", betonstaal: "3", milieu: "1", d_g: "16", c_o: "80", n_t: "8", d_t: "20", s_t: "51", lagen: "2", l_op: "500", D_m: "120", d_s: "10", n_s: "2", n_z: "2", d_z: "16", n_hp: "6", d_hp: "16", F_Ed: "2500", F_fr: "1250" });
  waar(`splijtkracht in het vlak: UC_sx = ${helft.uit.UC_sx?.toFixed(2)}, voldoet niet`, helft.uit.UC_sx > 1 && voldoetNiet(helft), JSON.stringify(helft.r));
  // Hoge poer: T_fr = 512 kN op 4Ø16: σ_s = 637 N/mm² boven f_yk: (7.9) geldt daar niet.
  const hoog = doorreken({ ...RC1, l_poer: "1820", b_poer: "550", h_poer: "1735", a_hoh: "1100", e_p: "75", t_in: "60", p_x: "450", p_y: "300", kolomvorm: "2", c_x: "300", betonklasse: "40", betonstaal: "3", milieu: "3", d_g: "22", c_o: "80", c_z: "50", n_t: "4", d_t: "16", s_t: "53", l_op: "800", D_m: "128", d_s: "10", s_s: "50", n_s: "2", n_z: "18", d_z: "8", n_hp: "4", d_hp: "16", F_Ed: "1161", F_fr: "1161" });
  toets(hoog, { z_s: 660, "σ_s": 636.8 });
  waar(`hoge poer: σ_s boven de vloeigrens, UC_w = ${hoog.uit.UC_w?.toFixed(2)}, voldoet niet`, hoog.uit.UC_w > 1.2 && voldoetNiet(hoog), JSON.stringify(hoog.r));
  // Onmogelijke staven: elk een eigen vrije ruimte.
  for (const [wat, invoer] of [["beugels 8 h.o.h. bij Ø12", { s_s: "8" }], ["120 zijstaven per vlak", { n_z: "120" }], ["60 beugelsneden", { n_s: "60" }], ["200 haarspelden", { n_hp: "200" }], ["40 bovenstaven", { n_b: "40" }]]) {
    const u = doorreken({ ...RC1, ...invoer });
    waar(`${wat}: UC_sp = ${u.uit.UC_sp}, voldoet niet`, u.uit.UC_sp === 99 && voldoetNiet(u), JSON.stringify(u.r));
  }
  // Benen per rij: 12 sneden om de 60 mm zijn 6 benen Ø12 per rij: 60/6 = 10 < Ø12.
  const benenRij = doorreken({ ...RC1, n_s: "12", s_s: "60" });
  waar(`6 benen per rij van 60 mm: UC_sp = ${benenRij.uit.UC_sp}, voldoet niet`, benenRij.uit.UC_sp === 99 && voldoetNiet(benenRij), JSON.stringify(benenRij.r));
  // Haarspelden liggen op de hoogte van de onderbenen: s = 60, Ø16: 350/(2 + 5,83·2) = 25,6, vrij 9,6: 21/9,6 = 2,19.
  const tussen = doorreken({ ...RC1, s_s: "60", d_hp: "16" });
  toets(tussen, { UC_sp: 2.19 }, 5e-3);
  waar("haarspeld Ø16 tussen onderbenen om de 60 mm: voldoet niet", voldoetNiet(tussen));
  // De band met de haarspelden moet binnen de beugels passen: 6·91 + 25 = 571; 571 + 24 = 595; binnenmaat 690 − 80 − 24 = 586.
  toets(doorreken({ ...RC1, b_poer: "690", p_y: "650", n_t: "14", s_t: "91", lagen: "2" }), { b_band: 571, UC_bd: 595 / 586 });
  // De onderste zijstaaf mag niet door de trekband lopen: twee lagen, bovenkant 134,5 + 12,5 = 147; n_z = 16: 72 + 45,65 = 117,65.
  // (134,5 + 12,5 + 6)/117,65 = 1,30.
  toets(doorreken({ ...RC1, n_t: "12", lagen: "2", n_z: "16" }), { UC_sp: 1.3005 });
  // Een haarspeld dikker dan de beugel: de trekband schuift omhoog, de dekking telt op de haarspeld.
  // Hart 60 + 25 + 12,5 = 97,5. Bij c_o = 35: c_nom = max(max(25; 25; 10) + 5; 35) = 35.
  toets(doorreken({ ...RC1, d_hp: "25" }), { a_t: 97.5 });
  toets(doorreken({ ...RC1, d_hp: "25", c_o: "35", t_in: "30" }), { a_t: 72.5, c_reqo: 35 });
  // 0/0 mag een overschrijding elders niet maskeren: T_sk = 0 (kolom even breed als de poer, (6.58)) en R_sk = 0 (geen beugel binnen bereik).
  // De trekband is daar 1Ø12 en dus veel te klein.
  const nulnul = doorreken({ ...RC1, betonklasse: "25", l_poer: "1300", b_poer: "350", h_poer: "1500", a_hoh: "800", e_p: "25", t_in: "40", p_x: "250", p_y: "200", c_x: "350", c_y: "350", c_o: "50", c_z: "30", n_t: "1", d_t: "12", D_m: "48", l_op: "150", d_s: "8", s_s: "300", n_s: "6", n_hp: "0", F_Ed: "900", F_fr: "100" });
  waar(`kracht nul zonder staal: UC_T = ${nulnul.uit.UC_T?.toFixed(2)}, voldoet niet en geen NaN`, voldoetNiet(nulnul) && !nulnul.tekst.includes("NaN"), JSON.stringify(nulnul.r));
  waar("een kracht van nul geeft UC 0 aan de kolomzijde", nulnul.uit.T_sk === 0 && nulnul.uit.R_sk === 0);
  // Te dunne staven: haarspeld Ø2 geeft geen k_2 en geen oordeel 'voldoet'; zijstaaf Ø4; bovenstaaf Ø1.
  for (const [wat, invoer, verwacht] of [["haarspeld Ø2", { d_hp: "2" }, 4], ["haarspeld Ø7", { d_hp: "7" }, 8 / 7], ["zijstaaf Ø4", { d_z: "4" }, 1.5], ["bovenstaaf Ø1", { d_b: "1" }, 6]]) {
    const u = doorreken({ ...RC1, ...invoer });
    waar(`${wat}: UC_min = ${u.uit.UC_min?.toFixed(2)}, voldoet niet`, Math.abs(u.uit.UC_min - verwacht) < 1e-9 && voldoetNiet(u), JSON.stringify(u.r));
  }
  // Omgebogen staaf zonder 5Ø recht na de bocht: geen haak volgens figuur 8.1. l_op = 150, Ø25, doorn 125: (125 + 75)/150.
  const haak = doorreken({ ...RC1, l_op: "150" });
  toets(haak, { UC_D: 200 / 150 });
  waar("been korter dan 5Ø na de bocht: voldoet niet", voldoetNiet(haak));
  // Pons: kolom 800×930 in een poer van 930 breed: twee vlakken, u = 1860. d = 1070 − 164 = 906.
  // v_k = 1,15·5000e3/(1860·906) = 3,412; v_Rd = 0,4·0,6·0,92·13,33 = 2,944: UC = 1,159.
  const pons = doorreken({ ...RC1, l_poer: "2830", b_poer: "930", h_poer: "1070", a_hoh: "1600", e_p: "25", t_in: "55", p_x: "700", p_y: "700", c_x: "800", c_y: "930", betonklasse: "20", betonstaal: "3", d_g: "22", c_o: "100", n_t: "10", d_t: "32", s_t: "74", lagen: "2", l_op: "800", D_m: "192", d_s: "16", s_s: "200", n_z: "5", d_z: "16", n_hp: "6", d_hp: "16", F_Ed: "5000", F_fr: "1500" });
  toets(pons, { d_eff: 906, v_k: 3.412, UC_v: 1.159 });
  // Dekking op het staafeinde: Ø32 vraagt 37 mm, ook aan de kopse kant. 37/30 = 1,233.
  const kop = doorreken({ ...RC1, n_t: "4", d_t: "32", s_t: "100", c_z: "30", D_m: "160" });
  toets(kop, { UC_dek: 37 / 30 });
  waar("dekking 30 op een been Ø32: voldoet niet", voldoetNiet(kop));
  // Korrel groter dan 32 mm: c_min,b + 5 mm (tabel 4.2). XC1, Ø16: max(16 + 5; 15; 10) + 5 = 26.
  toets(doorreken({ ...RC1, milieu: "1", d_s: "16", d_g: "40" }), { c_reqz: 26 });
  // Een lege ontwerplevensduur of gevolgklasse rekent niet stil met iets anders door.
  const { DesignLife: _dl, ...zonderLeven } = SCOPE;
  void _dl;
  const leeg = doorreken({ ...RC1, c_o: "60", c_z: "20" }, zonderLeven);
  waar("geen ontwerplevensduur in het project: geen oordeel", nietGetoetst(leeg) && /ontwerplevensduur/.test(leeg.tekst), JSON.stringify(leeg.r));
  const { CC: _cc, ...zonderCC } = SCOPE;
  void _cc;
  waar("geen gevolgklasse in het project: geen oordeel", nietGetoetst(doorreken(RC1, zonderCC)));
  // De kolomzijde bij de splijtkracht dwars: alleen bovenbenen. Twee sneden, s = 150: ⌊337,5/150⌋ = 2: R = 98,3 kN < T = 234,8.
  const kolomzijde = doorreken({ ...RC1, n_s: "2", s_s: "150" });
  toets(kolomzijde, { R_sk: 98.35 });
  waar("te weinig bovenbenen: voldoet niet", kolomzijde.uit.UC_sy > 1 && voldoetNiet(kolomzijde));
  // De haarspeld moet zijn lengte hebben: Ø25: 25/4·434,78/3 = 905,8 > 776 beschikbaar: 1,167.
  const lang = doorreken({ ...RC1, n_hp: "1", d_hp: "25" });
  waar(`haarspeld Ø25 past niet: UC_sy = ${lang.uit.UC_sy?.toFixed(3)}, voldoet niet`, Math.abs(lang.uit.UC_sy - 905.8 / 776) < 1e-3 && voldoetNiet(lang), JSON.stringify(lang.r));
  // Brede poer: de rand ligt verder dan 5(c + Ø/2) van de staaf: (7.14). b = 2000: c_1 = 812,5 > 422,5.
  // ρ = 2945,2/(2000·815,5) = 0,001806; α_e·ρ = 0,010944; x_e = 815,5·(√(0,00011977 + 0,021888) − 0,010944) = 112,1; s_r,max = 1,3·787,9 = 1024,3.
  toets(doorreken({ ...RC1, b_poer: "2000", n_s: "6" }), { s_rmax: 1024.3 });
}

// ── 5. Grensgevallen ────────────────────────────────────────────────────────
console.log("\n5. Grensgevallen");
{
  // Een geval waarin alleen de trekband knelt: F_Ed zo gekozen dat UC_T vlak bij 1 ligt.
  const basis = { ...RC1, n_t: "3", s_t: "100", D_m: "250", F_fr: "200" };
  const ucVoor = (f) => doorreken({ ...basis, F_Ed: String(f) }).uit.UC_T;
  const zoek = (doel) => {
    let lo = 500, hi = 3000;
    for (let i = 0; i < 40; i++) {
      const m = (lo + hi) / 2;
      if (ucVoor(m) < doel) lo = m;
      else hi = m;
    }
    return (lo + hi) / 2;
  };
  const net = doorreken({ ...basis, F_Ed: String(zoek(1.004)) });
  waar(`UC_T = ${net.uit.UC_T.toFixed(4)}: voldoet niet, ook al zou dat op 1,00 afronden`, voldoetNiet(net) && Math.abs(net.uit.UC_T - 1.004) < 1e-4, JSON.stringify(net.r));
  waar("UC_max staat er als 1,01 en niet als 1,00", net.uit.UC_max === 1.01 && net.r.uc === 1.01, String(net.uit.UC_max));
  waar("in de samenvatting ook 1,01", /Trekband 6\.5\.3 1\.01 voldoet niet/.test(net.tekst), net.tekst.slice(net.tekst.indexOf("Trekband 6.5.3"), net.tekst.indexOf("Trekband 6.5.3") + 40));
  waar("de kop leest dat als 1,01", ucTekst(net.r.uc).replace(",", ".") === "1.01", ucTekst(net.r.uc));
  const klein = doorreken({ ...basis, F_Ed: String(zoek(1.00004)) });
  waar(`UC_T = ${klein.uit.UC_T.toFixed(5)}: ook een overschrijding van 0,004 % telt`, voldoetNiet(klein) && klein.uit.UC_max === 1.01, JSON.stringify(klein.r));
  const onder = doorreken({ ...basis, F_Ed: String(zoek(0.9996)) });
  waar(`UC_T = ${onder.uit.UC_T.toFixed(4)}: voldoet`, voldoet(onder), JSON.stringify(onder.r));

  // θ = 45° ligt bij z = l_t = 650: 0,9·d = 650 → d = 722,2 → h = 806,7.
  // h = 806: z = 0,9·721,5 = 649,35, θ = 44,97°, buiten het blad. h = 807: z = 650,25, θ = 45,01°, binnen het blad.
  const h806 = doorreken({ ...RC1, h_poer: "806" });
  const h807 = doorreken({ ...RC1, h_poer: "807" });
  waar(`h = 806: θ = ${h806.uit.θ_g.toFixed(3)}° < 45°, niet getoetst`, nietGetoetst(h806), JSON.stringify(h806.r));
  waar(`h = 807: θ = ${h807.uit.θ_g.toFixed(3)}° ≥ 45°, wel een oordeel`, !h807.r.nietGetoetst && h807.r.voldoet !== null, JSON.stringify(h807.r));

  // a_v = 700 − 175 − c_x/2 − 50: 0 bij c_x = 950.
  const av0 = doorreken({ ...RC1, c_x: "950" });
  waar("a_v = 0: niet getoetst", nietGetoetst(av0) && Math.abs(av0.uit.a_v) < 1e-9, JSON.stringify(av0.uit.a_v));
  const av1 = doorreken({ ...RC1, c_x: "948" });
  waar("a_v = 1 mm: wel een oordeel", !av1.r.nietGetoetst && av1.r.voldoet !== null && Math.abs(av1.uit.a_v - 1) < 1e-9, JSON.stringify(av1.r));

  // Inbedding: alleen de wapening moet boven de paalkop liggen. 50 mm uit figuur 9.11 hoort bij 9.8.1(5), dat dit blad niet gebruikt.
  waar("inbedding 0 mm: mag", voldoet(doorreken({ ...RC1, t_in: "0" })));
  const t60 = doorreken({ ...RC1, t_in: "60" });
  waar(`paalkop tot c_o = 60: UC_kop = ${t60.uit.UC_kop}, voldoet`, voldoet(t60) && t60.uit.UC_kop === 1, JSON.stringify(t60.r));
  const t61 = doorreken({ ...RC1, t_in: "61" });
  waar(`paalkop 61 boven c_o = 60: UC_kop = ${t61.uit.UC_kop.toFixed(3)}, voldoet niet`, voldoetNiet(t61));

  // Huidwapening aan de grens h = 1000 mm.
  const h999 = doorreken({ ...RC1, h_poer: "999" });
  const h1000 = doorreken({ ...RC1, h_poer: "1000" });
  waar("h = 999: geen huidwapening getoetst", h999.uit.A_huid === undefined && /Huidwapening 7\.3\.3\(3\) — niet van toepassing/.test(h999.tekst));
  // A_huid = 0,4·0,5·2,9·580·1000/2/500 = 336,4.
  toets(h1000, { A_huid: 336.4 });

  // (6.58) tot en met b ≤ H/2, daarboven (6.59). Bij b = 480: H/2 = 490,2.
  const b480 = doorreken({ ...RC1, b_poer: "480", s_t: "50", n_t: "3", p_y: "350" });
  const verwacht = 0.25 * (480 - 350) / 480 * b480.uit.F_c;
  toets(b480, { T_sp: Number(verwacht.toFixed(2)) });
  waar(`b = 480 ≤ H/2 = ${(b480.uit.H_s / 2).toFixed(1)}: (6.58)`, b480.uit.H_s / 2 >= 480);

  // Een kleine kolom: dan bepaalt de drukzone de arm en niet 0,9·d.
  // c = 320×320 (σ_0 = 17,58 < 17,6): ξ = 2·M/(320·17,6·d²); l_t = 700 + 50 − 80 = 670.
  const k = doorreken({ ...RC1, c_x: "320", c_y: "320" });
  const M = 1836.997 / 2 * 670;
  const xi = (2 * M * 1000) / (320 * 17.6 * 815.5 ** 2);
  const zHand = 815.5 - (815.5 * (1 - Math.sqrt(1 - xi))) / 2;
  toets(k, { M_t: Number((M / 1000).toFixed(2)), z_u: Number(Math.min(zHand, 733.95).toFixed(2)) });
  // Een drukzone die niet past: ξ > 1 valt als UC op en geeft nooit 'voldoet'. Palen dicht bij elkaar houden θ boven 45°:
  // a = 700, kolom 300×60, F = 4000: G = 18,3; F_tot = 4024,7; l_t = 350 + 50 − 75 = 325; M = 2012,4·0,325 = 654 kNm;
  // ξ = 2·654e6/(60·17,6·815,5²) = 1,86 > 1, dus z = d/2 = 407,75; θ = atan(407,75/325) = 51,4°.
  // σ_0 = 4000e3/(300·60) = 222,2; UC_ccc = 222,2/17,6 = 12,63.
  const smal = doorreken({ ...RC1, a_hoh: "700", l_poer: "1400", p_x: "200", p_y: "200", c_x: "300", c_y: "60", F_Ed: "4000", F_fr: "1000" });
  waar(`kolom 60 breed: θ = ${smal.uit.θ_g?.toFixed(1)}°, UC_ccc = ${smal.uit.UC_ccc?.toFixed(2)}, voldoet niet`, voldoetNiet(smal) && Math.abs(smal.uit.UC_ccc - 12.63) < 0.01 && Math.abs(smal.uit.z_u - 407.75) < 1e-6, JSON.stringify(smal.r));

  // BGT-last gelijk aan UGT-last mag; groter niet.
  waar("F_fr = F_Ed: geldig", !doorreken({ ...RC1, F_fr: "1800" }).tekst.includes("Ongeldig"));
}

// ── 6. De vier toestanden ───────────────────────────────────────────────────
console.log("\n6. Voldoet, voldoet niet, niet getoetst, niet van toepassing");
{
  const zonder = doorreken({ ...RC1, dwars: "0" });
  waar("dwarsstabiliteit niet aangetoond: geen UC_max en geen 'voldoet'", nietGetoetst(zonder) && zonder.uit.UC_max === undefined, JSON.stringify(zonder.r));
  waar("de regel 'niet getoetst' staat in de samenvatting", /Dwarsstabiliteit, H en M — — niet getoetst/.test(zonder.tekst), zonder.tekst.slice(-420));
  const { dwars, ...geenDwars } = RC1;
  void dwars;
  waar("geen waarde voor de dwarsstabiliteit: als niet aangetoond", nietGetoetst(doorreken(geenDwars)));
  // De paalafwijking is verplichte invoer (9.8.1(1)); 0 of een half ingevuld veld is geen uitspraak.
  for (const [wat, e] of [["0", "0"], ["leeg", ""], ["tekst", "abc"]]) {
    const r = doorreken({ ...RC1, e_p: e });
    waar(`paalafwijking ${wat}: niet getoetst, met de reden erbij`, nietGetoetst(r) && /Paalafwijking 9\.8\.1\(1\) — niet getoetst/.test(r.tekst) && /geen paalafwijking ingevoerd/.test(r.tekst), JSON.stringify(r.r));
  }
  const nulFout = doorreken({ ...RC1, e_p: "0", n_t: "2" });
  waar("geen paalafwijking en toch te weinig trekband: voldoet niet", voldoetNiet(nulFout), JSON.stringify(nulFout.r));
  const fout = doorreken({ ...RC1, dwars: "0", n_t: "2" });
  waar("een overschrijding gaat voor: voldoet niet, ook zonder de bevestiging", voldoetNiet(fout), JSON.stringify(fout.r));

  for (const [wat, invoer] of [
    ["alles leeg", Object.fromEntries(Object.keys(RC1).map((k) => [k, ""]))],
    ["F_Ed = 0", { F_Ed: "0" }],
    ["trek in de kolom", { F_Ed: "-100", F_fr: "-100" }],
    ["BGT-last groter dan UGT-last", { F_fr: "1900" }],
    ["paal buiten de poer", { l_poer: "1700" }],
    ["palen raken elkaar", { a_hoh: "340" }],
    ["kolom breder dan de poer", { c_y: "700" }],
    ["half aantal staven", { n_t: "2.5" }],
    ["één beugelsnede", { n_s: "1" }],
    ["geen beugeldiameter", { d_s: "0" }],
    ["zijstaven zonder diameter", { d_z: "0" }],
    ["trekband hoger dan de poer", { h_poer: "80" }],
    ["trekband niet boven de paalkop", { t_in: "90" }],
    ["omgebogen zonder been", { l_op: "0" }],
    ["omgebogen zonder doorn", { D_m: "0" }],
  ]) {
    const r = doorreken({ ...RC1, ...invoer });
    waar(`ongeldig, ${wat}: niet getoetst`, nietGetoetst(r) && /Eindoordeel: ongeldige invoer/.test(r.tekst), JSON.stringify(r.r));
    geenFouten(r, `  ${wat}`);
  }

  for (const [wat, invoer] of [
    ["B500A", { betonstaal: "1" }],
    ["Ø40", { d_t: "40", s_t: "90" }],
    ["θ < 45°", { a_hoh: "1650", l_poer: "2400" }],
  ]) {
    const r = doorreken({ ...RC1, ...invoer });
    waar(`buiten het toepassingsgebied, ${wat}: niet getoetst`, nietGetoetst(r) && /Eindoordeel: niet getoetst/.test(r.tekst), JSON.stringify(r.r));
  }
  waar("B500C: gewoon binnen het blad", voldoet(doorreken({ ...RC1, betonstaal: "3" })));

  const nvt = doorreken(RC3).tekst;
  waar("de vier toestanden hebben een eigen woord (niet van toepassing)", nvt.includes("niet van toepassing"));
  // ⌊275/290⌋ = 0 beugels in a_v en geen zijstaven: geen weerstand in het vlak.
  const nul = doorreken({ ...RC1, n_z: "0", s_s: "290" });
  waar("geen wapening door de diagonaal: UC = ∞, voldoet niet", nul.uit.UC_sx === Infinity && voldoetNiet(nul) && nul.r.uc === Infinity, JSON.stringify(nul.r));
  // Een rekenfout in de invoer mag nooit in de rekentak of bij 'voldoet' uitkomen: een keuzelijst die ontbreekt.
  const kapot = doorreken({ ...RC1, betonklasse: "" });
  waar("betonklasse zonder keuze: geen oordeel 'voldoet'", kapot.r.voldoet !== true && kapot.r.uc === null, JSON.stringify(kapot.r));
  const kapot2 = doorreken({ ...RC1, milieu: "9" });
  waar("milieuklasse buiten de lijst: rekent als de zwaarste", kapot2.uit.c_reqo === 50, String(kapot2.uit.c_reqo));
}

// ── 7. Project en belasting ─────────────────────────────────────────────────
console.log("\n7. Gevolgklasse, ontwerplevensduur, milieu en ondergrond");
{
  // Factor 6.10a per gevolgklasse (NB.4, NB.5): 1,2, 1,35 en 1,5. G = 27,405.
  toets(doorreken(RC1, { ...SCOPE, CC: 3, K_FI: 1.1 }), { F_tot: 1841.11 });
  toets(doorreken(RC1, { ...SCOPE, CC: 1, K_FI: 0.9 }), { F_tot: 1832.89 });
  // 100 jaar: S6 = S4 + 10 mm. XC2: c_dur = 35; c_nom = max(40; 45) = 45.
  toets(doorreken(RC1, { ...SCOPE, DesignLife: 100 }), { c_reqo: 45, c_reqz: 40 });
  // 15 jaar: geen reductie (de tabel kent die niet); blijft S4.
  toets(doorreken(RC1, { ...SCOPE, DesignLife: 15 }), { c_reqo: 35 });
  // Op de grond: k_2 = c_dur + 50 = 75, ook op de zijkanten.
  toets(doorreken({ ...RC1, ondergrond: "2", c_o: "80", c_z: "80", t_in: "50" }), { c_reqo: 75, c_reqz: 75, UC_dek: 0.9375 });
  // Tabel 4.4N (NB), S4; c_nom = max(c_dur + 5; c_dur + 10).
  for (const [m, c] of [["1", 25], ["2", 35], ["3", 40], ["4", 45], ["5", 50], ["6", 50]]) {
    toets(doorreken({ ...RC1, milieu: m }), { c_reqo: c });
  }
  // Grens scheurwijdte: 0,30 bij XC2 t/m XC4, 0,20 bij XD en XS, met k_x; 0,40 bij XC1 zonder k_x.
  toets(doorreken({ ...RC1, milieu: "1" }), { w_lim: 0.4 });
  toets(doorreken({ ...RC1, milieu: "4", c_o: "90" }), { w_lim: 0.4 }); // k_x = 90/45 = 2: 0,20·2.
  toets(doorreken({ ...RC1, milieu: "4", c_o: "135" }), { w_lim: 0.4 }); // k_x blijft 2.
  // Eén staaf Ø32: de staafafstand is geen maat meer. d = 900 − 60 − 12 − 16 = 812; ρ = 804/(580·812) = 0,001708; α_e·ρ = 0,01035;
  // x_e = 812·(√(0,01035² + 2·0,01035) − 0,01035) = 108,7; s_r,max = 1,3·(900 − 108,7) = 1028,7 (7.14).
  toets(doorreken({ ...RC1, n_t: "1", d_t: "32" }), { s_rmax: 1028.7 });
  // Staven verder uit elkaar dan 5(c + Ø/2) = 5·(72 + 12,5) = 422,5: ook (7.14).
  const ae = 200000 / 33000, rho = (2 * Math.PI * 25 ** 2 / 4) / (580 * 815.5);
  const ver = doorreken({ ...RC1, n_t: "2", s_t: "430" });
  toets(ver, { s_rmax: 1.3 * (900 - 815.5 * (Math.sqrt((ae * rho) ** 2 + 2 * ae * rho) - ae * rho)) });
}

// ── 8. Eén definitie voor blad, tekening en afdruk ──────────────────────────
console.log("\n8. De tekening en het blad gebruiken dezelfde poer");
const lees = (bron) => (naam) => {
  const w = bron[naam];
  return w === undefined || w === "" ? 0 : parseFloat(String(w).replace(",", "."));
};
const talen = {};
for (const taal of ["nl", "en"]) {
  talen[taal] = JSON.parse(readFileSync(join(hier, `../packages/desktop/src/i18n/locales/${taal}/beelden.json`), "utf8")).tweepaalspoer;
}
const tel = (svg, staaf) => (svg.match(new RegExp(`data-staaf="${staaf}"`, "g")) ?? []).length;
function vergelijk(wat, invoer) {
  const r = doorreken(invoer);
  const p = maakPoer(lees(invoer), r.uit);
  const t = staafTelling(p);
  const n_t = parseInt(invoer.n_t);
  waar(`${wat}: ${n_t} trekbandstaven op de tekening`, t.trekband === n_t, String(t.trekband));
  waar(`${wat}: hart trekband ${p.trekband.aT} gelijk aan het blad`, Math.abs(p.trekband.aT - r.uit.a_t) < 1e-9, `${r.uit.a_t}`);
  waar(`${wat}: nuttige hoogte gelijk aan het blad`, Math.abs(p.h - p.trekband.aT - r.uit.d_eff) < 1e-9);
  const breedte = (Math.max(...p.trekband.lagen[0].y) - Math.min(...p.trekband.lagen[0].y)) + p.trekband.d;
  waar(`${wat}: bandbreedte gelijk aan het blad`, Math.abs(breedte - r.uit.b_band) < 1e-9, `${breedte} tegen ${r.uit.b_band}`);
  // Het blad telt ⌊a_v/s⌋ beugels tussen kolom en paal. Dat is de ondergrens voor elk venster van die lengte.
  const links = p.kolom.x / 2 + parseFloat(invoer.e_p), rechts = links + r.uit.a_v;
  const inVak = p.beugels.x.filter((x) => x >= links - 1e-9 && x <= rechts + 1e-9).length;
  waar(`${wat}: ${inVak} beugels tussen kolom en paal, het blad telt ${r.uit.n_sb}`, inVak >= r.uit.n_sb);
  waar(`${wat}: staafwerk uit het blad overgenomen`, p.model && p.model.z === r.uit.z_u && p.model.hoek === r.uit.θ_g);
  // De lijn op de tekening staat onder dezelfde hoek als het blad rekent: van de kolomknoop naar de paalknoop met de afwijking.
  const hoekTekening = (Math.atan(p.model.z / p.model.lT) * 180) / Math.PI;
  waar(`${wat}: hoek op de tekening gelijk aan het blad`, Math.abs(hoekTekening - r.uit.θ_g) < 1e-9, `${hoekTekening} tegen ${r.uit.θ_g}`);
  // Het rechte deel op de tekening en in de verankering: van de binnenkant van de paal tot het einde van de bovenste laag.
  const xBinnen = p.a / 2 - p.paal.x / 2 + parseFloat(invoer.e_p);
  const lTekening = p.trekband.xEind[p.trekband.xEind.length - 1] - xBinnen;
  waar(`${wat}: recht deel ${lTekening} gelijk aan het blad`, Math.abs(lTekening - r.uit.l_h) < 1e-9, `${lTekening} tegen ${r.uit.l_h}`);
  // De afstand van de beugelbenen op de tekening is die van het blad, en de haarspeld gebruikt zijn volle lengte.
  if (p.beugels.y.length > 1) {
    const stap = p.beugels.y[1] - p.beugels.y[0];
    const verwachtStap = (p.b - 2 * p.c_z - p.beugels.d) / (p.beugels.sneden - 1);
    waar(`${wat}: beugelbenen ${stap.toFixed(1)} hart-op-hart`, Math.abs(stap - verwachtStap) < 1e-9);
  }
  for (const taal of ["nl", "en"]) {
    const { svg } = tekenPoer(p, talen[taal], 900);
    waar(`${wat} (${taal}): SVG met elke staaf`, tel(svg, "trekband") === n_t && tel(svg, "trekband-dwars") === n_t && tel(svg, "beugel") === t.beugels
      && tel(svg, "zij-dwars") === t.zij && tel(svg, "boven-dwars") === t.boven && tel(svg, "haarspeld") === t.haarspelden,
      `${tel(svg, "trekband")}, ${tel(svg, "trekband-dwars")}, ${tel(svg, "beugel")}/${t.beugels}, ${tel(svg, "zij-dwars")}/${t.zij}, ${tel(svg, "boven-dwars")}/${t.boven}, ${tel(svg, "haarspeld")}/${t.haarspelden}`);
    waar(`${wat} (${taal}): de gekozen staaf staat in de legenda`, svg.includes(`${n_t}Ø${parseFloat(invoer.d_t)}`) && svg.includes(`Ø${parseFloat(invoer.d_s)}-${parseFloat(invoer.s_s)}`));
    waar(`${wat} (${taal}): geldige SVG met alleen getallen als maat`, svg.startsWith("<svg") && !/NaN|Infinity|undefined/.test(svg));
  }
  return p;
}
{
  const p1 = vergelijk("geval 1", RC1);
  vergelijk("geval 2", RC2);
  vergelijk("geval 3", RC3);
  // Een wijziging in de invoer komt door in het blad én in de tekening.
  const hoger = { ...RC1, h_poer: "1000" };
  const p2 = maakPoer(lees(hoger), doorreken(hoger).uit);
  waar("hogere poer: blad en tekening gaan mee", p2.h === 1000 && p2.model.d === 915.5 && p2.model.d !== p1.model.d && p2.beugels.zBoven > p1.beugels.zBoven);
  const hoogteA = tekenPoer(p1, talen.nl, 900).hoogte, hoogteB = tekenPoer(p2, talen.nl, 900).hoogte;
  waar("hogere poer: de doorsnede wordt hoger getekend", hoogteB > hoogteA);
  const dikker = { ...RC1, d_t: "32", s_t: "85" };
  const p3 = maakPoer(lees(dikker), doorreken(dikker).uit);
  waar("dikkere staaf: tekening en blad volgen", p3.trekband.d === 32 && Math.abs(p3.trekband.aT - doorreken(dikker).uit.a_t) < 1e-9);
  const omschakel = maakPoer(lees({ ...RC1, vorm_t: "1" }));
  waar("rechte staaf: geen been op de tekening", omschakel.trekband.lOp === 0 && !tekenPoer(omschakel, talen.nl, 900).svg.includes(" Q "));
  waar("omgebogen staaf: been op de tekening", tekenPoer(p1, talen.nl, 900).svg.includes(" Q "));
  const zonderBlad = maakPoer(lees({ ...RC1, F_Ed: "0" }), doorreken({ ...RC1, F_Ed: "0" }).uit);
  waar("ongeldige invoer: de tekening staat er, zonder staafwerk", zonderBlad.model === null && tekenPoer(zonderBlad, talen.nl, 900).svg.startsWith("<svg"));
  // Wat niet klopt, wordt niet stil verbeterd: 7 staven in 2 lagen zijn er 4 + 3.
  const oneven = maakPoer(lees({ ...RC2, n_t: "7" }));
  waar("oneven aantal in twee lagen: 4 + 3, niets verzonnen", oneven.trekband.lagen[0].y.length === 4 && oneven.trekband.lagen[1].y.length === 3);
  // Beide talen hebben alle teksten, en de Engelse tekening is Engels.
  const sleutels = Object.keys(talen.nl);
  waar("nl en en kennen dezelfde sleutels", JSON.stringify(sleutels) === JSON.stringify(Object.keys(talen.en)));
  const svgEn = tekenPoer(p1, talen.en, 900).svg.replace(/<[^>]+>/g, " ");
  waar("geen Nederlandse woorden op de Engelse tekening", !/\b(?:bovenaanzicht|doorsnede|trekband|beugel|zijstaven|bovenstaven|haarspeld|laag|lagen|omgebogen|been|doorn|sneden|dekking|geen|h\.o\.h)\b/i.test(svgEn), svgEn);
  // Een haarspeld dikker dan de beugel: tekening en blad houden de trekband op dezelfde hoogte.
  const dik = { ...RC1, d_hp: "25" };
  const pDik = maakPoer(lees(dik), doorreken(dik).uit);
  waar("haarspeld Ø25: hart trekband gelijk aan het blad, haarspeld op eigen hoogte", Math.abs(pDik.trekband.aT - doorreken(dik).uit.a_t) < 1e-9 && pDik.haarspelden.z === 72.5);
  // De tweede snede: vier sneden zijn twee gesloten beugels, drie sneden één beugel en een los been.
  const vier = tekenPoer(maakPoer(lees(RC2)), talen.nl, 900).svg;
  waar("vier sneden: twee gesloten beugels in de doorsnede", tel(vier, "beugel-dwars") === 2, String(tel(vier, "beugel-dwars")));
  const drie = tekenPoer(maakPoer(lees({ ...RC1, n_s: "3" })), talen.nl, 900).svg;
  waar("drie sneden: één gesloten beugel", tel(drie, "beugel-dwars") === 1, String(tel(drie, "beugel-dwars")));
  // Interactief: de vier klikbare maten staan niet ook als tekst in de SVG.
  const klik = tekenPoer(p1, talen.nl, 900, true);
  waar("in het beeld vier klikbare maten", klik.maten.map((m) => m.naam).sort().join() === "a_hoh,b_poer,h_poer,l_poer");
  waar("klikbare maat niet dubbel in beeld", !/>1400</.test(klik.svg));
  waar("los bestand en afdruk: de maat staat in de tekening", />1400</.test(tekenPoer(p1, talen.nl, 900).svg));
}

// ── De uitvoer in het Engels: hetzelfde oordeel ─────────────────────────────
console.log("\n   De uitvoer in de taal van de app");
{
  for (const [wat, invoer] of [["voldoet", RC1], ["voldoet niet", { ...RC1, n_t: "2" }], ["niet getoetst", { ...RC1, dwars: "0" }], ["ongeldig", { ...RC1, F_Ed: "0" }], ["buiten het blad", { ...RC1, betonstaal: "1" }]]) {
    const nl = doorreken(invoer);
    const u = bronVoorUitvoer(tpl, "en");
    const en = doorreken(invoer, SCOPE, u.bron);
    waar(`${wat}: in beide talen hetzelfde oordeel`, nl.r.voldoet === en.r.voldoet && nl.r.uc === en.r.uc && !!nl.r.nietGetoetst === !!en.r.nietGetoetst, `${JSON.stringify(nl.r)} tegen ${JSON.stringify(en.r)}`);
    const zelfde = Object.keys(nl.uit).filter((k) => nl.uit[k] !== en.uit[k]);
    waar(`${wat}: dezelfde getallen`, zelfde.length === 0, zelfde.join(", "));
  }
}

// ── 9. Opslaan, heropenen, bijwerken ────────────────────────────────────────
console.log("\n9. Opslaan, heropenen en bijwerken");
{
  const bron = tpl;
  const ex = { id: "ex-1", naam: "Poer P1", templateId: "tweepaalspoer", source: bron, waarden: { ...RC2 }, elementen: [], bronVersie: rekenversie(bron) };
  const tekst = bouwProjectBestand({ versie: 2, naam: "Proef", gegevens: {}, exemplaren: [ex] }, null);
  const terug = leesProjectBestand(tekst, "proef").exemplaren[0];
  waar("invoer en staafindeling blijven na opslaan en heropenen", JSON.stringify(terug.waarden) === JSON.stringify(RC2), JSON.stringify(terug.waarden));
  waar("de rekentekst blijft", terug.source === bron);
  waar("de bronversie blijft", terug.bronVersie === rekenversie(bron));
  const a = doorreken(ex.waarden), b = doorreken(terug.waarden, SCOPE, terug.source);
  waar("na heropenen dezelfde uitkomst", JSON.stringify(a.uit) === JSON.stringify(b.uit) && a.r.voldoet === b.r.voldoet);
  const ta = maakPoer(lees(ex.waarden), a.uit), tb = maakPoer(lees(terug.waarden), b.uit);
  waar("na heropenen dezelfde tekening", tekenPoer(ta, talen.nl, 800).svg === tekenPoer(tb, talen.nl, 800).svg);
  waar("een blad met de actuele tekst is niet verouderd", !isVerouderd(terug, { tweepaalspoer: bron }));

  const uitkomst = (r) => ({ resultaat: r.r, getallen: r.uit });

  // Een oudere tekst zonder de bevestiging van de dwarsstabiliteit, die dus wel 'voldoet' gaf.
  const oud = bron.replace(/@select dwars[\s\S]*?@end\r?\n/, "dwars = 1\n");
  const vervallen = invoervelden(parse(oud)).some((v) => v.naam === "dwars");
  waar("oude tekst: de keuze bestaat daar nog niet", !vervallen);
  const velden = vergelijkInvoer({ ...RC1 }, invoervelden(parse(oud)), invoervelden(parse(bron)));
  const { dwars: _d, ...oudeInvoer } = RC1;
  void _d;
  const oudR = doorreken(oudeInvoer, SCOPE, oud);
  const nieuwR = doorreken(oudeInvoer);
  waar("oud blad: voldeed zonder de bevestiging", voldoet(oudR), JSON.stringify(oudR.r));
  waar("bijgewerkt: nieuw veld op de veilige stand, geen 'voldoet' meer", nietGetoetst(nieuwR), JSON.stringify(nieuwR.r));
  const v = vergelijkUitkomst(uitkomst(oudR), uitkomst(nieuwR));
  waar("het vergelijkingsscherm meldt de wijziging van het oordeel", v.oordeelVeranderd && v.oordeelNieuw === null, JSON.stringify(v));
  waar("de bestaande invoer blijft bij bijwerken", velden.vervallen.length === 0 && velden.waarden.n_t === RC1.n_t);

  // Een nieuwere tekst die gunstiger uitkomt, is zichtbaar in de vergelijking en gebeurt nooit stil.
  const gunstig = bron.replace("σ_d = 0.6*ν_s*f_cd", "σ_d = 0.9*ν_s*f_cd");
  const g = vergelijkUitkomst(uitkomst(doorreken(RC1)), uitkomst(doorreken(RC1, SCOPE, gunstig)));
  waar("een gunstiger rekenregel staat in de vergelijking", g.ucVariabelen.some((u) => u.naam === "UC_d" && u.nieuw < u.oud), JSON.stringify(g.ucVariabelen));
  const verouderd = { ...terug, source: bron, bronVersie: rekenversie(bron) };
  waar("en het blad heet dan verouderd: bijwerken is een eigen stap", isVerouderd(verouderd, { tweepaalspoer: gunstig }));
}

console.log(`\nTweepaalspoer: ${getest} controles, ${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
