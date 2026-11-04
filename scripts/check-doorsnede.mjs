/**
 * Controlescript voor de module Spanningen in een doorsnede
 * (templates/doorsnede-spanningen.ts). Toepassing en aannames staan in
 * docs/doorsnede-spanningen.md.
 *
 * Geen referentieberekening: de gevallen zijn fictief en met de hand uitgewerkt, in het
 * commentaar, buiten het blad om. Daarnaast een tweede weg: dit script kent de vormen als
 * koorden (welk stuk materiaal ligt op deze hoogte), integreert daarover numeriek en
 * gebruikt de rekenkern niet. Een verwachting alleen aanpassen met een handberekening die
 * aantoont dat de nieuwe waarde juist is.
 *
 *   1. Handberekening per vorm: grootheden, normaalspanning, schuifspanning.
 *   2. IPE 300 en alle profielen: de boekwaarden, dus ook de afronding.
 *   3. Numeriek over de doorsnede: A, zwaartepunt en I, ∫σ dA = N, ∫σ·z dA = M_y,
 *      ∫σ·y dA = M_z en ∫τ dA = V, ook op de lijnen van het beeld.
 *   4. Tekenafspraak: wat positief is, in het blad en in de tekening.
 *   5. Vergelijkingsspanning: handgevallen, een eigen fijn rooster per vorm en willekeurige
 *      maten en lasten, ook op een onterecht 'voldoet'.
 *   6. Grenswaarde f_y: oordeel alleen met een grenswaarde, en dan het juiste.
 *   7. Ongeldige invoer: een melding, geen NaN en geen oordeel.
 *   8. Beeld en blad: dezelfde doorsnede, het veld, de neutrale lijn en de pieken.
 *   9. Taal, catalogus en vertalingen.
 *
 * Draaien:  node scripts/check-doorsnede.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { readFileSync } from "node:fs";
import { parse, evaluate, render } from "../packages/core/dist/index.js";
import { laadTemplate } from "./lib/refcheck.mjs";

const { leesResultaat, leesGetallen } = await import("../packages/desktop/src/components/calc/bladLezen.ts");
const { PROFIELEN } = await import("../packages/desktop/src/components/calc/profielen.ts");
const { maakDoorsnede, schuifLijn } = await import("../packages/desktop/src/components/calc/doorsnedeDefinitie.ts");
const { tekenDoorsnede, kleurVan, TEKST_SLEUTELS, VELD_STROKEN } = await import("../packages/desktop/src/components/calc/doorsnedeTekening.ts");
const { bronVoorUitvoer } = await import("../packages/desktop/src/templates/vertalingen.ts");

const tpl = laadTemplate("doorsnede-spanningen.ts");
const SCOPE = { CC: 2, RC: 2, K_FI: 1, DesignLife: 50, rekenwijze: 1 };
const REKEN_FOUT = ["Error", "Undefined symbol", "NaN", "niet gedefinieerd", "Unexpected type", "Infinity", "is not defined"];

let fouten = 0;
let getest = 0;
const waar = (wat, ok, detail = "") => {
  getest++;
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${wat}${ok || !detail ? "" : ` — ${detail}`}`);
};
/** Dichtbij, relatief; bij een verwachting van 0 absoluut met `abs`. */
const gelijk = (a, b, tol = 1.5e-3, abs = 1e-6) => Number.isFinite(a) && Math.abs(a - b) <= Math.max(tol * Math.abs(b), abs);

function doorreken(waarden, bron = tpl) {
  const nodes = evaluate(parse(bron), waarden, SCOPE);
  const html = render(nodes);
  const tekst = html.replace(/<annotation[\s\S]*?<\/annotation>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return { uit: leesGetallen(nodes), tekst, html, r: leesResultaat(nodes, "x"), nodes };
}
function toets(r, verwacht, tol = 1.5e-3) {
  for (const [naam, doel] of Object.entries(verwacht)) {
    const ons = r.uit[naam];
    const ok = ons !== undefined && gelijk(ons, doel, tol);
    getest++;
    if (!ok) fouten++;
    console.log(`  ${ok ? "OK    " : "FOUT  "} ${naam.padEnd(9)} blad ${String(ons === undefined ? "—" : Number(ons.toPrecision(6))).padStart(10)}   hand ${doel}`);
  }
}
function geenFouten(r, wat) {
  const s = REKEN_FOUT.find((f) => r.tekst.includes(f));
  waar(`${wat}: geen foutmelding of NaN`, !s, s ? r.tekst.slice(Math.max(0, r.tekst.indexOf(s) - 80), r.tekst.indexOf(s) + 80) : "");
}

// ── De gevallen ─────────────────────────────────────────────────────────────
const IPE = { vorm: "1", profiel: "24", N_x: "-200", M_y: "100", M_z: "10", V_y: "10", V_z: "80", f_y: "0" };
const RH = { vorm: "2", b: "100", h: "200", N_x: "50", M_y: "20", M_z: "5", V_y: "15", V_z: "30", f_y: "0" };
const RO = { vorm: "3", D: "100", N_x: "0", M_y: "3", M_z: "4", V_y: "40", V_z: "30", f_y: "0" };
const BU = { vorm: "4", D: "100", t: "10", N_x: "40", M_y: "3", M_z: "-4", V_y: "-30", V_z: "30", f_y: "0" };
const KO = { vorm: "5", b: "100", h: "200", t_w: "5", t_f: "8", N_x: "-80", M_y: "15", M_z: "5", V_y: "20", V_z: "50", f_y: "0" };
const TE = { vorm: "6", b: "150", h: "200", t_w: "10", t_f: "15", N_x: "-60", M_y: "25", M_z: "4", V_y: "20", V_z: "40", f_y: "0" };
const UU = { vorm: "7", b: "100", h: "200", t_w: "8", t_f: "12", N_x: "100", M_y: "30", M_z: "-2", V_y: "10", V_z: "50", f_y: "0" };
const NUL = { N_x: "0", M_y: "0", M_z: "0", V_y: "0", V_z: "0", f_y: "0" };
const eigenI = { vorm: "1", profiel: "0", h: "300", b: "150", t_w: "7.1", t_f: "10.7", r: "15" };

// ── 1. Handberekening per vorm ──────────────────────────────────────────────
console.log("\n1. Handberekening per vorm");
console.log("  Rechthoek 100 × 200");
{
  const r = doorreken(RH);
  geenFouten(r, "rechthoek");
  toets(r, {
    // A = 100·200; I_y = 100·200³/12 = 6667 cm⁴; I_z = 200·100³/12 = 1667 cm⁴; W_y = 6667/10 = 666,7 cm³; W_z = 1667/5 = 333,3 cm³.
    A: 20000, y_c: 50, z_c: 100, I_y: 6666.67, I_z: 1666.67, W_y: 666.667, W_z: 333.333,
    // S_y = 100·100·50 = 500 cm³; S_z = 200·50·25 = 250 cm³.
    S_y: 500, S_z: 250,
    // σ_N = 50e3/20000 = 2,5; k_y = 20e6/6,667e7 = 0,3; k_z = 5e6/1,667e7 = 0,3.
    // σ_max = 2,5 + 0,3·100 + 0,3·50 = 47,5; σ_min = 2,5 − 30 − 15 = −42,5.
    "σ_N": 2.5, k_y: 0.3, k_z: 0.3, "σ_max": 47.5, "σ_min": -42.5,
    // Neutrale lijn: |σ_N|/√(k_y² + k_z²) = 2,5/0,4243 = 5,893. Langs de lijn (k_y; −k_z) = (0,3; −0,3): −45°, tegen de klok in.
    e_n: 5.8926, "α_n": -45,
    // τ_z = 1,5·30e3/20000 = 2,25; τ_y = 1,5·15e3/20000 = 1,125.
    "τ_z_max": 2.25, "τ_y_max": 1.125,
  });
}
console.log("  Rond Ø100");
{
  const r = doorreken(RO);
  geenFouten(r, "rond");
  toets(r, {
    // A = π·50² = 7854; I = π·100⁴/64 = 490,9 cm⁴; W = 490,9/5 = 98,17 cm³; S = ⅔·50³ = 83,33 cm³.
    A: 7853.98, y_c: 50, z_c: 50, I_y: 490.874, I_z: 490.874, W_y: 98.1748, W_z: 98.1748, S_y: 83.3333, S_z: 83.3333,
    // Geen N; M = √(3² + 4²) = 5 kNm in de schuine richting: σ = 5e6/98175 = 50,93.
    "σ_N": 0, "σ_max": 50.9296, "σ_min": -50.9296,
    // τ = 4/3·V/A: 4/3·30e3/7854 = 5,093 en 4/3·40e3/7854 = 6,791.
    "τ_z_max": 5.09296, "τ_y_max": 6.79061,
  });
}
console.log("  Buis Ø100 × 10");
{
  const r = doorreken(BU);
  geenFouten(r, "buis");
  toets(r, {
    // A = π(50² − 40²) = 2827; I = π/4(50⁴ − 40⁴) = 289,8 cm⁴; W = 57,96 cm³; S = ⅔(50³ − 40³) = 40,67 cm³.
    A: 2827.43, I_y: 289.812, I_z: 289.812, W_y: 57.9624, S_y: 40.6667,
    // σ_N = 40e3/2827 = 14,15; M = 5 kNm: 5e6/57962 = 86,26; σ_max = 100,41; σ_min = −72,12.
    "σ_N": 14.1471, "σ_max": 100.41, "σ_min": -72.1157,
    // τ = V·S/(I·2t) = 30e3·40667/(2,898e6·20) = 21,05, in beide richtingen.
    "τ_z_max": 21.0481, "τ_y_max": 21.0481,
  });
}
console.log("  Koker 100 × 200, t_w = 5, t_f = 8");
{
  const r = doorreken(KO);
  geenFouten(r, "koker");
  toets(r, {
    // A = 100·200 − 90·184 = 3440. I_y = (100·200³ − 90·184³)/12 = 1995 cm⁴; I_z = (200·100³ − 184·90³)/12 = 548,9 cm⁴.
    A: 3440, I_y: 1994.54, I_z: 548.867, W_y: 199.454, W_z: 109.773,
    // S_y = 100·100²/2 − 90·92²/2 = 119,12 cm³; S_z = 200·50²/2 − 184·45²/2 = 63,7 cm³.
    S_y: 119.12, S_z: 63.7,
    // σ_N = −80e3/3440 = −23,26; k_y = 15e6/1,9945e7 = 0,7521; k_z = 5e6/5,4887e6 = 0,9110;
    // σ_max = −23,26 + 75,21 + 45,55 = 97,50; σ_min = −144,01.
    "σ_N": -23.2558, k_y: 0.752054, k_z: 0.910968, "σ_max": 97.498, "σ_min": -144.01,
    // τ_z = 50e3·119120/(1,9945e7·10) = 29,86; τ_y = 20e3·63700/(5,4887e6·16) = 14,51.
    "τ_z_max": 29.8615, "τ_y_max": 14.5072,
  });
}
console.log("  T 150 × 200, t_w = 10, t_f = 15");
{
  const r = doorreken(TE);
  geenFouten(r, "T");
  toets(r, {
    // A = 2250 + 1850 = 4100; z_c = (2250·7,5 + 1850·107,5)/4100 = 52,62 vanaf de bovenrand.
    // I_y = 150·15³/12 + 2250·45,12² + 10·185³/12 + 1850·54,88² = 1547 cm⁴; I_z = 15·150³/12 + 185·10³/12 = 423,4 cm⁴.
    A: 4100, y_c: 75, z_c: 52.622, I_y: 1547.1, I_z: 423.417,
    // W_y aan de verste rand, 147,38: 104,97 cm³. W_z = 423,4/7,5 = 56,46 cm³.
    W_y: 104.975, W_z: 56.4556,
    // S_y = 2250·45,12 + 10·37,62²/2 = 108,6 cm³; S_z = 15·150²/8 + 185·10²/8 = 44,5 cm³.
    S_y: 108.601, S_z: 44.5,
    // σ_N = −14,63; k_y = 1,616; k_z = 0,9447. De uiterste hoeken: flens rechtsboven of lijf onder.
    // σ_max = −14,63 + 1,616·147,38 + 0,9447·5 = 228,24; σ_min = −14,63 − 1,616·52,62 − 0,9447·75 = −170,52.
    "σ_N": -14.6341, k_y: 1.61593, k_z: 0.944696, "σ_max": 228.242, "σ_min": -170.52,
    // τ_z op de zwaartelijn, in het lijf: 40e3·108601/(1,5471e7·10) = 28,08.
    // τ_y net buiten het lijf: 20e3·(15·(75² − 5²)/2)/(4,2342e6·15) = 13,23.
    "τ_z_max": 28.0788, "τ_y_max": 13.2257,
  });
}
console.log("  U 100 × 200, t_w = 8, t_f = 12");
{
  const r = doorreken(UU);
  geenFouten(r, "U");
  toets(r, {
    // A = 1600 + 2·1104 = 3808; y_c = (1600·4 + 2208·54)/3808 = 32,99 vanaf de rug.
    // I_y = (8·200³ + 92·(200³ − 176³))/12 = 2487 cm⁴. I_z = 200·8³/12 + 1600·28,99² + 2·12·92³/12 + 2208·21,01² = 388,5 cm⁴.
    A: 3808, y_c: 32.9916, z_c: 100, I_y: 2486.97, I_z: 388.524,
    // W_z aan de verste rand, 67,01: 57,98 cm³.
    W_y: 248.697, W_z: 57.9813,
    // S_y = 1104·94 + 8·100²/2 = 143,8 cm³; S_z = 2·12·67,01²/2 = 53,88 cm³.
    S_y: 143.776, S_z: 53.8815,
    // σ_N = 26,26; k_y = 1,2063; k_z = −0,5148. σ_max = 26,26 + 120,63 + 0,5148·32,99 = 163,87; σ_min = 26,26 − 120,63 − 0,5148·67,01 = −128,86.
    "σ_N": 26.2605, k_y: 1.20629, k_z: -0.514769, "σ_max": 163.872, "σ_min": -128.862,
    // τ_z = 50e3·143776/(2,487e7·8) = 36,13; τ_y op de zwaartelijn, in de flenzen: 10e3·53881/(3,8852e6·24) = 5,778.
    "τ_z_max": 36.1323, "τ_y_max": 5.77845,
  });
}

// ── 2. De profieltabel ──────────────────────────────────────────────────────
console.log("\n2. IPE 300 en de profieltabel: boekwaarden, dus ook de afronding");
{
  const r = doorreken(IPE);
  geenFouten(r, "IPE 300");
  toets(r, {
    // Boek: A = 53,81 cm²; I_y = 8356 cm⁴; I_z = 603,8 cm⁴; W_el,y = 557,1 cm³; W_el,z = 80,50 cm³. S = W_pl/2 = 314,2 cm³ en 62,6 cm³.
    A: 5381, y_c: 75, z_c: 150, I_y: 8356, I_z: 603.8, W_y: 557.1, W_z: 80.5, S_y: 314.2, S_z: 62.61,
    // σ_N = −200e3/5381 = −37,17; k_y = 100e6/8356e4 = 1,1967; k_z = 10e6/603,8e4 = 1,6562.
    // σ_max = −37,17 + 179,51 + 124,21 = 266,55; σ_min = −340,89.
    "σ_N": -37.167, k_y: 1.1967, k_z: 1.6562, "σ_max": 266.55, "σ_min": -340.89,
    // τ_z = 80e3·314,2e3/(8356e4·7,1) = 42,37.
    "τ_z_max": 42.37,
  });
  // τ_y: net in de afronding, waar de hoogte nog nauwelijks groeit. Op het einde van de
  // afronding: 10e3·(75² − 18,55²)/2/603,8e4 = 4,373; de piek ligt iets binnen de afronding, tot 0,5 % hoger.
  waar(`τ_y,max = ${r.uit["τ_y_max"]?.toPrecision(4)}, tussen 4,373 en 4,395`, r.uit["τ_y_max"] >= 4.37 && r.uit["τ_y_max"] <= 4.395);
  const zelf = doorreken({ ...IPE, ...eigenI });
  const velden = ["A", "I_y", "I_z", "W_y", "W_z", "S_y", "S_z", "σ_max", "σ_min", "τ_z_max", "τ_y_max", "σ_v_max"];
  const anders = velden.filter((k) => !gelijk(zelf.uit[k], r.uit[k], 1e-9));
  waar("eigen maten met de maten van een IPE 300 geven hetzelfde", anders.length === 0, anders.join(", "));
  let mis = 0;
  for (const [id, p] of Object.entries(PROFIELEN)) {
    const q = doorreken({ ...NUL, vorm: "1", profiel: id });
    const ok = gelijk(q.uit.A, p.A / 1e0, 1.5e-3) && gelijk(q.uit.I_y * 1e4, p.Iy, 1.5e-3) && gelijk(q.uit.I_z * 1e4, p.Iz, 1.5e-3) && gelijk(q.uit.W_y * 1e3, p.Wely, 1.5e-3);
    if (!ok) {
      mis++;
      console.log(`         ${p.naam}: A ${q.uit.A}, I_y ${q.uit.I_y}, I_z ${q.uit.I_z}, W_y ${q.uit.W_y}`);
    }
  }
  waar(`alle ${Object.keys(PROFIELEN).length} profielen: A, I_y, I_z en W_y uit de maten gelijk aan de tabel`, mis === 0);
  const r0 = doorreken({ ...NUL, vorm: "1", profiel: "0", h: "200", b: "100", t_w: "6", t_f: "10", r: "0" });
  // Zonder afronding: A = 2·100·10 + 180·6 = 3080; I_y = (100·200³ − 94·180³)/12 = 2098 cm⁴.
  toets(r0, { A: 3080, I_y: 2098.27 });
}

// ── 3. Numeriek over de doorsnede ───────────────────────────────────────────
/*
 * De vormen als koorden, los van de rekenkern. Met y vanaf de linkerrand en z vanaf de
 * bovenrand: `iv(z)` is het materiaal op hoogte z, in y; `ivY(y)` het materiaal op plaats y, in z.
 * De afronding van een I is een blok r × r min een kwart cirkel.
 */
function maakVorm(w) {
  const g = (k) => parseFloat(w[k]);
  const vorm = Number(w.vorm);
  if (vorm === 1) {
    const p = w.profiel !== "0" ? PROFIELEN[w.profiel] : null;
    const [h, b, tw, tf, r] = p ? [p.h, p.b, p.tw, p.tf, p.r] : [g("h"), g("b"), g("t_w"), g("t_f"), g("r")];
    const extra = (d) => (d < r ? r - Math.sqrt(r * r - (r - d) * (r - d)) : 0);
    return {
      B: b, H: h, h, b, tw, tf, r,
      knipZ: [tf, tf + r, h - tf - r, h - tf], knipY: [b / 2 - tw / 2 - r, b / 2 - tw / 2, b / 2 + tw / 2, b / 2 + tw / 2 + r],
      iv(z) {
        if (z < tf || z > h - tf) return [[0, b]];
        const hw = tw / 2 + extra(Math.min(z - tf, h - tf - z));
        return [[b / 2 - hw, b / 2 + hw]];
      },
      ivY(y) {
        const u = Math.abs(y - b / 2);
        if (u < tw / 2) return [[0, h]];
        const e = extra(u - tw / 2);
        return [[0, tf + e], [h - tf - e, h]];
      },
    };
  }
  if (vorm === 2) {
    const [b, h] = [g("b"), g("h")];
    return { B: b, H: h, h, b, knipZ: [], knipY: [], iv: () => [[0, b]], ivY: () => [[0, h]] };
  }
  if (vorm === 3 || vorm === 4) {
    const D = g("D");
    const R = D / 2;
    const Ri = vorm === 4 ? R - g("t") : 0;
    const iv = (u) => {
      const c = Math.sqrt(Math.max(R * R - (u - R) * (u - R), 0));
      if (Math.abs(u - R) >= Ri) return [[R - c, R + c]];
      const i = Math.sqrt(Ri * Ri - (u - R) * (u - R));
      return [[R - c, R - i], [R + i, R + c]];
    };
    return { B: D, H: D, D, R, Ri, t: vorm === 4 ? g("t") : 0, knipZ: vorm === 4 ? [R - Ri, R + Ri] : [], knipY: vorm === 4 ? [R - Ri, R + Ri] : [], iv, ivY: iv };
  }
  const [b, h, tw, tf] = [g("b"), g("h"), g("t_w"), g("t_f")];
  if (vorm === 5) {
    return {
      B: b, H: h, h, b, tw, tf, knipZ: [tf, h - tf], knipY: [tw, b - tw],
      iv: (z) => (z < tf || z > h - tf ? [[0, b]] : [[0, tw], [b - tw, b]]),
      ivY: (y) => (y < tw || y > b - tw ? [[0, h]] : [[0, tf], [h - tf, h]]),
    };
  }
  if (vorm === 6) {
    return {
      B: b, H: h, h, b, tw, tf, knipZ: [tf], knipY: [b / 2 - tw / 2, b / 2 + tw / 2],
      iv: (z) => (z < tf ? [[0, b]] : [[b / 2 - tw / 2, b / 2 + tw / 2]]),
      ivY: (y) => (Math.abs(y - b / 2) < tw / 2 ? [[0, h]] : [[0, tf]]),
    };
  }
  return {
    B: b, H: h, h, b, tw, tf, knipZ: [tf, h - tf], knipY: [tw],
    iv: (z) => (z < tf || z > h - tf ? [[0, b]] : [[0, tw]]),
    ivY: (y) => (y < tw ? [[0, h]] : [[0, tf], [h - tf, h]]),
  };
}

/** Stroken van 0 tot L die precies op de knikpunten beginnen; `f(midden, breedte)` per strook. */
function stroken(L, knip, nPerDeel, f) {
  const grenzen = [0, ...knip.filter((k) => k > 0 && k < L).sort((a, c) => a - c), L];
  for (let d = 0; d + 1 < grenzen.length; d++) {
    const [a, c] = [grenzen[d], grenzen[d + 1]];
    const n = Math.max(40, Math.round(nPerDeel * ((c - a) / L)));
    const ds = (c - a) / n;
    for (let i = 0; i < n; i++) f(a + (i + 0.5) * ds, ds);
  }
}

/** A, zwaartepunt, I en de tabellen van S/b in beide richtingen, zonder de rekenkern. */
function integreer(v) {
  let A = 0, Sy = 0, Sz = 0;
  stroken(v.H, v.knipZ, 8000, (z, dz) => {
    for (const [a, c] of v.iv(z)) {
      A += (c - a) * dz;
      Sy += ((c * c - a * a) / 2) * dz;
      Sz += z * (c - a) * dz;
    }
  });
  const yc = Sy / A, zc = Sz / A;
  let Iy = 0, Iz = 0;
  stroken(v.H, v.knipZ, 8000, (z, dz) => {
    for (const [a, c] of v.iv(z)) {
      Iy += (z - zc) ** 2 * (c - a) * dz;
      Iz += (((c - yc) ** 3 - (a - yc) ** 3) / 3) * dz;
    }
  });
  // S/b op de hoogte z: het deel boven de lijn, om de zwaartelijn.
  const tabelZ = [];
  let S = 0;
  stroken(v.H, v.knipZ, 8000, (z, dz) => {
    const b = v.iv(z).reduce((s, [a, c]) => s + c - a, 0);
    const dS = (zc - z) * b * dz;
    tabelZ.push({ s: z - zc, q: (S + dS / 2) / b, b, ds: dz });
    S += dS;
  });
  const tabelY = [];
  S = 0;
  stroken(v.B, v.knipY, 8000, (y, dy) => {
    const b = v.ivY(y).reduce((s, [a, c]) => s + c - a, 0);
    const dS = (yc - y) * b * dy;
    tabelY.push({ s: y - yc, q: (S + dS / 2) / b, b, ds: dy });
    S += dS;
  });
  return { A, yc, zc, Iy, Iz, tabelZ, tabelY };
}

/** σ over de doorsnede met de uitkomsten van het blad: [∫σ dA, ∫σ·z dA, ∫σ·y dA], in N en N·mm. */
function integreerSpanning(v, m, s0, k1, k2) {
  let N = 0, My = 0, Mz = 0;
  stroken(v.H, v.knipZ, 8000, (z, dz) => {
    const zz = z - m.zc;
    for (const [a, c] of v.iv(z)) {
      const [ya, yb] = [a - m.yc, c - m.yc];
      const f0 = (s0 + k1 * zz) * (yb - ya) + (k2 * (yb * yb - ya * ya)) / 2;
      N += f0 * dz;
      My += f0 * zz * dz;
      Mz += ((s0 + k1 * zz) * ((yb * yb - ya * ya) / 2) + (k2 * (yb ** 3 - ya ** 3)) / 3) * dz;
    }
  });
  return [N, My, Mz];
}

/** Waarde van S/b uit een tabel, op de plaats s; een opzoeking op de dichtstbijzijnde strook. */
const opzoek = (tab) => {
  const eerste = tab[0].s, laatste = tab[tab.length - 1].s;
  return (s) => {
    let lo = 0, hi = tab.length - 1;
    const x = Math.min(Math.max(s, eerste), laatste);
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (tab[m].s <= x) lo = m;
      else hi = m;
    }
    return Math.abs(tab[lo].s - x) <= Math.abs(tab[hi].s - x) ? tab[lo].q : tab[hi].q;
  };
};

/** Het beeld legt zijn lijn op deze plaatsen; `waarde(s)` lineair tussen twee punten. */
function integreerLijn(lijn, breedte, onder, boven) {
  let som = 0;
  for (let i = 0; i + 1 < lijn.length; i++) {
    const [s0, t0] = lijn[i];
    const [s1, t1] = lijn[i + 1];
    if (s1 <= s0) continue;
    const m = (s0 + s1) / 2;
    if (m < onder || m > boven) continue;
    som += ((t0 + t1) / 2) * breedte(m) * (s1 - s0);
  }
  return som;
}

const ALLE = [
  ["rechthoek", RH], ["rond", RO], ["buis", BU], ["koker", KO], ["T", TE], ["U", UU], ["IPE 300", IPE],
  ["I, eigen maten", { ...IPE, ...eigenI, h: "400", b: "200", t_w: "8", t_f: "14", r: "12" }],
  // De zwaartelijn in de flens: de hoogste τ_z ligt op de overgang, in het smalle lijf.
  ["T, lage", { vorm: "6", b: "300", h: "60", t_w: "10", t_f: "30", N_x: "10", M_y: "2", M_z: "3", V_y: "20", V_z: "40", f_y: "0" }],
  // De zwaartelijn in de rug: de hoogste τ_y ligt op de overgang, in de twee flenzen.
  ["U, smalle", { vorm: "7", b: "40", h: "300", t_w: "30", t_f: "10", N_x: "10", M_y: "2", M_z: "0.5", V_y: "5", V_z: "40", f_y: "0" }],
];
const meetkunde = new Map();
console.log("\n3. Numeriek over de doorsnede, zonder de rekenkern");
for (const [naam, w] of ALLE) {
  const v = maakVorm(w);
  const m = integreer(v);
  meetkunde.set(naam, { v, m });
  const r = doorreken(w);
  const u = r.uit;
  const ok = gelijk(u.A, m.A, 5e-4) && gelijk(u.y_c, m.yc, 5e-4) && gelijk(u.z_c, m.zc, 5e-4) && gelijk(u.I_y * 1e4, m.Iy, 5e-4) && gelijk(u.I_z * 1e4, m.Iz, 5e-4);
  waar(`${naam}: A, zwaartepunt, I_y en I_z`, ok, `A ${u.A}/${m.A}, y_c ${u.y_c}/${m.yc}, z_c ${u.z_c}/${m.zc}, I_y ${u.I_y * 1e4}/${m.Iy}, I_z ${u.I_z * 1e4}/${m.Iz}`);
  const [Nn, My, Mz] = integreerSpanning(v, m, u["σ_N"], u.k_y, u.k_z);
  const [Nd, Myd, Mzd] = [parseFloat(w.N_x) * 1e3, parseFloat(w.M_y) * 1e6, parseFloat(w.M_z) * 1e6];
  waar(`${naam}: ∫σ dA = N`, gelijk(Nn, Nd, 2e-3, 5), `${Nn} tegen ${Nd}`);
  waar(`${naam}: ∫σ·z dA = M_y`, gelijk(My, Myd, 2e-3, 5e3), `${My} tegen ${Myd}`);
  waar(`${naam}: ∫σ·y dA = M_z`, gelijk(Mz, Mzd, 2e-3, 5e3), `${Mz} tegen ${Mzd}`);

  // τ op de lijnen van het beeld: de vorm uit de definitie, de piek uit het blad.
  const def = maakDoorsnede((k) => (k in w ? parseFloat(w[k]) : 0));
  const [Vy, Vz] = [parseFloat(w.V_y) * 1e3, parseFloat(w.V_z) * 1e3];
  const lz = schuifLijn(def, "z");
  const ly = schuifLijn(def, "y");
  const qzMax = Math.max(...lz.map((p) => p.q));
  const qyMax = Math.max(...ly.map((p) => p.q));
  const tz = lz.map((p) => [p.s, (Math.sign(Vz) * u["τ_z_max"] * p.q) / qzMax]);
  const ty = ly.map((p) => [p.s, (Math.sign(Vy) * u["τ_y_max"] * p.q) / qyMax]);
  const bz = (s) => v.iv(s + m.zc).reduce((t, [a, c]) => t + c - a, 0);
  const hy = (s) => v.ivY(s + m.yc).reduce((t, [a, c]) => t + c - a, 0);
  const Iz_ = integreerLijn(tz, bz, -m.zc, v.H - m.zc);
  const Iy_ = integreerLijn(ty, hy, -m.yc, v.B - m.yc);
  waar(`${naam}: ∫τ dA = V_z op de lijn van het beeld`, gelijk(Iz_, Vz, 4e-3, 5), `${Iz_} tegen ${Vz}`);
  waar(`${naam}: ∫τ dA = V_y op de lijn van het beeld`, gelijk(Iy_, Vy, 4e-3, 5), `${Iy_} tegen ${Vy}`);
  // De pieken: het blad tegen de eigen tabel, langs de andere weg.
  const pz = Math.max(...m.tabelZ.map((t) => t.q)) * Math.abs(Vz) / m.Iy;
  const py = Math.max(...m.tabelY.map((t) => t.q)) * Math.abs(Vy) / m.Iz;
  waar(`${naam}: τ_z,max = ${u["τ_z_max"]?.toPrecision(4)}, langs de andere weg ${pz.toPrecision(4)}`, gelijk(u["τ_z_max"], pz, 3e-3, 1e-3));
  waar(`${naam}: τ_y,max = ${u["τ_y_max"]?.toPrecision(4)}, langs de andere weg ${py.toPrecision(4)}`, gelijk(u["τ_y_max"], py, 3e-3, 1e-3));
}

// ── 4. Tekenafspraak ────────────────────────────────────────────────────────
console.log("\n4. Tekenafspraak: N trek positief, M_y trek bij +z (onder), M_z trek bij +y (rechts)");
{
  const basis = { ...NUL, vorm: "2", b: "100", h: "200" };
  // N = 10 kN geeft 0,5 N/mm²: dat breekt de gelijkheid tussen de twee randen.
  const a = doorreken({ ...basis, N_x: "10", M_y: "5" });
  waar("N trek en M_y positief: de hoogste spanning ligt onder (z > 0)", a.uit.z_v > 0 && a.uit["σ_N"] > 0 && a.uit.k_y > 0, `z_v = ${a.uit.z_v}`);
  const b = doorreken({ ...basis, N_x: "10", M_z: "5" });
  waar("N trek en M_z positief: de hoogste spanning ligt rechts (y > 0)", b.uit.y_v > 0 && b.uit.k_z > 0, `y_v = ${b.uit.y_v}`);
  const c = doorreken({ ...basis, N_x: "-10", M_y: "5" });
  waar("N druk en M_y positief: de hoogste |σ| ligt boven (z < 0)", c.uit.z_v < 0, `z_v = ${c.uit.z_v}`);
  const d = doorreken({ ...basis, N_x: "-10", M_z: "-5" });
  waar("N druk en M_z negatief: de hoogste |σ| ligt rechts (y > 0)", d.uit.y_v > 0, `y_v = ${d.uit.y_v}`);
  // Een T: de flens boven, dus het zwaartepunt ligt boven het midden.
  const t = doorreken(TE);
  waar("T: de flens ligt boven", t.uit.z_c < 100, `z_c = ${t.uit.z_c}`);
  // Een U: de rug links.
  const u = doorreken(UU);
  waar("U: de rug ligt links", u.uit.y_c < 50, `y_c = ${u.uit.y_c}`);
}

// ── 5. Vergelijkingsspanning ────────────────────────────────────────────────
console.log("\n5. Vergelijkingsspanning: handgevallen");
{
  const vm = (s, t) => Math.sqrt(s * s + 3 * t * t);
  // Rechthoek, alleen V_z = 100 kN: τ = 1,5·100e3/20000 = 7,5; σ_v = √3·7,5 = 12,99 in het midden.
  let r = doorreken({ ...NUL, vorm: "2", b: "100", h: "200", V_z: "100" });
  waar(`rechthoek, alleen V_z: σ_v,max = ${r.uit["σ_v_max"]?.toFixed(3)}, in het midden`, gelijk(r.uit["σ_v_max"], 12.9904) && Math.abs(r.uit.z_v) < 1e-6);
  // Rechthoek RH: de hoek met σ_max geeft 47,5; daar is τ = 0.
  r = doorreken(RH);
  waar(`rechthoek met alles: σ_v,max = ${r.uit["σ_v_max"]?.toFixed(3)}, in de hoek`, gelijk(r.uit["σ_v_max"], 47.5) && gelijk(r.uit.y_v, 50) && gelijk(r.uit.z_v, 100));
  // De hoogste waarde ligt niet in een hoek en niet op de as: 10 N/mm² uit N, 10 uit M_y aan de rand, τ_max = 10.
  // (10 + 10u)² + 3·100·(1 − u²)² heeft zijn top bij u ≈ 0,21: 20,51. Op de as en op de rand staat 20,0.
  r = doorreken({ ...NUL, vorm: "2", b: "100", h: "200", N_x: "200", M_y: "6.66667", V_z: "133.333" });
  waar(`rechthoek, top tussen as en rand: σ_v,max = ${r.uit["σ_v_max"]?.toFixed(3)}, verwacht 20,51`, gelijk(r.uit["σ_v_max"], 20.506, 2e-3));
  // IPE 300, alleen V_z = 80 kN: τ = 42,37 in het lijf op de zwaartelijn; √3·42,37 = 73,39.
  r = doorreken({ ...NUL, vorm: "1", profiel: "24", V_z: "80" });
  waar(`IPE 300, alleen V_z: σ_v,max = ${r.uit["σ_v_max"]?.toFixed(2)}, op de zwaartelijn`, gelijk(r.uit["σ_v_max"], 73.39) && Math.abs(r.uit.z_v) < 1e-6);
  // IPE 300, M_y = 100 en V_z = 80: aan de flensrand 179,5; bij de wortel van de flens komt daar de schuifstroom bij:
  // τ_f = 80e3·(75 − 18,55)·144,65/8356e4 = 7,82 en dus √(179,5² + 3·7,82²) = 180,01. De flens telt dus mee.
  r = doorreken({ ...NUL, vorm: "1", profiel: "24", M_y: "100", V_z: "80" });
  waar(`IPE 300, M_y en V_z: σ_v,max = ${r.uit["σ_v_max"]?.toFixed(2)}, in de flens bij het lijf`, gelijk(r.uit["σ_v_max"], vm(179.51, 7.817), 1e-3) && gelijk(Math.abs(r.uit.y_v), 18.55, 1e-3) && gelijk(Math.abs(r.uit.z_v), 150));
  // Buis, M_y = 3 kNm en V_y = 30 kN: op (0; +50) is σ = 3e6/57962 = 51,76 en τ = 21,05, want V_y staat loodrecht
  // op de straal daar: √(51,76² + 3·21,05²) = 63,31.
  r = doorreken({ ...NUL, vorm: "4", D: "100", t: "10", M_y: "3", V_y: "30" });
  waar(`buis, M_y en V_y: σ_v,max = ${r.uit["σ_v_max"]?.toFixed(2)}, op de plek van beide maxima`, gelijk(r.uit["σ_v_max"], 63.31, 1e-3) && gelijk(Math.abs(r.uit.z_v), 50, 1e-3));
  // Buis, alleen V: √3·21,05 = 36,46 op de zwaartelijn loodrecht op V.
  r = doorreken({ ...NUL, vorm: "4", D: "100", t: "10", V_z: "30" });
  waar(`buis, alleen V_z: σ_v,max = ${r.uit["σ_v_max"]?.toFixed(2)}`, gelijk(r.uit["σ_v_max"], 36.4564, 1e-3) && Math.abs(r.uit.z_v) < 1e-6);
  // Rond, alleen V: 4/3·V/A in het midden, ook schuin: V = 50 kN: 8,488; √3·8,488 = 14,70.
  r = doorreken({ ...NUL, vorm: "3", D: "100", V_y: "40", V_z: "30" });
  waar(`rond, schuine V: σ_v,max = ${r.uit["σ_v_max"]?.toFixed(3)}, in het midden`, gelijk(r.uit["σ_v_max"], 14.702, 1e-3) && Math.abs(r.uit.y_v) < 1e-6);
  // Koker: alleen V_z: τ_z = 29,86 op de zwaartelijn in de wanden: 51,72.
  r = doorreken({ ...NUL, vorm: "5", b: "100", h: "200", t_w: "5", t_f: "8", V_z: "50" });
  waar(`koker, alleen V_z: σ_v,max = ${r.uit["σ_v_max"]?.toFixed(2)}`, gelijk(r.uit["σ_v_max"], 51.7217, 1e-3));
  // U, alleen V_y: in de flens op de zwaartelijn τ_y = 5,778: √3·5,778 = 10,01. De flenzen voeren dat af via het lijf:
  // S = 12·(67,01² − 28,99²)/2 = 21898 mm³ bij de hartlijn van het lijf, lineair naar 0 op halve hoogte. Aan het eind
  // van het lijf, z = 88 van 94: τ = 10e3·21898·(88/94)/(3,885e6·8) = 6,60; √3·6,60 = 11,42. Het lijf is dus maatgevend.
  r = doorreken({ ...NUL, vorm: "7", b: "100", h: "200", t_w: "8", t_f: "12", V_y: "10" });
  waar(`U, alleen V_y: σ_v,max = ${r.uit["σ_v_max"]?.toFixed(2)}, in het lijf 11,42`, gelijk(r.uit["σ_v_max"], 11.42, 2e-3));
  // Geen last: alles nul, geen NaN.
  for (const [naam, w] of ALLE) {
    const q = doorreken({ ...w, ...NUL });
    const leeg = q.uit["σ_v_max"] === 0 && q.uit["σ_max"] === 0 && q.uit["σ_min"] === 0 && q.uit["τ_z_max"] === 0;
    waar(`${naam}, zonder last: alles nul`, leeg && !REKEN_FOUT.some((f) => q.tekst.includes(f)), JSON.stringify([q.uit["σ_v_max"], q.uit["σ_max"]]));
  }
}

console.log("\n   Een eigen fijn rooster per vorm, met dezelfde regels voor τ als in docs/doorsnede-spanningen.md");
/** Elke plek met een eigen τ: `plekken(fn)` roept fn(y, z, τ) aan, y en z vanaf het zwaartepunt. */
function plekken(w, v, m, Vy, Vz, fn) {
  const qz = opzoek(m.tabelZ), qy = opzoek(m.tabelY);
  const tz = (z) => (Math.abs(Vz) * qz(z)) / m.Iy;
  const ty = (y) => (Math.abs(Vy) * qy(y)) / m.Iz;
  const e = { l: m.yc, r: v.B - m.yc, t: m.zc, o: v.H - m.zc };
  const n = 240;
  const lijn = (a, c, f) => {
    for (let i = 0; i <= n; i++) f(a + ((c - a) * i) / n);
  };
  const vorm = Number(w.vorm);
  if (vorm === 2) {
    for (let i = 0; i <= n; i++) lijn(-e.t, e.o, (z) => { const y = -e.l + (v.B * i) / n; fn(y, z, Math.hypot(tz(z), ty(y))); });
  } else if (vorm === 3) {
    const V = Math.hypot(Vy, Vz);
    for (let i = 0; i <= 120; i++) for (let j = 0; j < 360; j++) {
      const ρ = (v.R * i) / 120, θ = (j * Math.PI) / 180;
      const [y, z] = [ρ * Math.cos(θ), ρ * Math.sin(θ)];
      const wn = V > 0 ? (y * Vy + z * Vz) / V : 0, un = V > 0 ? (y * Vz - z * Vy) / V : y;
      const d = v.R * v.R - wn * wn;
      fn(y, z, d > 1e-9 ? ((4 / 3) * V / m.A) * (1 - (wn * wn) / (v.R * v.R)) * Math.sqrt(1 + (un * wn) ** 2 / d ** 2) : 0);
    }
  } else if (vorm === 4) {
    const S = (2 / 3) * (v.R ** 3 - v.Ri ** 3);
    for (let j = 0; j < 1440; j++) {
      const θ = (j * Math.PI) / 720;
      const [y, z] = [v.R * Math.cos(θ), v.R * Math.sin(θ)];
      fn(y, z, (S / (m.Iy * 2 * v.t)) * Math.abs(y * Vz - z * Vy) / v.R);
    }
  } else if (vorm === 1) {
    const yr = v.tw / 2 + v.r, ef = (v.h - v.tf) / 2;
    for (const z of [-e.t, -e.t + v.tf, e.o - v.tf, e.o]) for (const k of [-1, 1]) {
      lijn(yr, v.b / 2, (a) => fn(k * a, z, (Math.abs(Vz) * (v.b / 2 - a) * ef) / m.Iy + ty(k * a)));
    }
    const t0 = ty(0);
    for (const y of [-v.tw / 2, v.tw / 2]) lijn(-(e.t - v.tf), e.o - v.tf, (z) => fn(y, z, Math.hypot(tz(z), t0)));
  } else if (vorm === 5) {
    const ef = (v.h - v.tf) / 2, ew = (v.b - v.tw) / 2, yf = v.b / 2 - v.tw, zw = v.h / 2 - v.tf;
    for (const z of [-v.h / 2, -zw, zw, v.h / 2]) lijn(-yf, yf, (y) => fn(y, z, (Math.abs(Vz) * Math.abs(y) * ef) / m.Iy + ty(y)));
    for (const y of [-v.b / 2, -yf, yf, v.b / 2]) lijn(-zw, zw, (z) => fn(y, z, tz(z) + (Math.abs(Vy) * Math.abs(z) * ew) / m.Iz));
  } else if (vorm === 6) {
    const ef = Math.abs(e.t - v.tf / 2);
    for (const z of [-e.t, -e.t + v.tf]) for (const k of [-1, 1]) {
      lijn(v.tw / 2, v.b / 2, (a) => fn(k * a, z, (Math.abs(Vz) * (v.b / 2 - a) * ef) / m.Iy + ty(k * a)));
    }
    const t0 = ty(0);
    for (const y of [-v.tw / 2, v.tw / 2]) lijn(-e.t + v.tf, e.o, (z) => fn(y, z, Math.hypot(tz(z), t0)));
  } else {
    const ef = (v.h - v.tf) / 2, yt = e.r, yr = -e.l + v.tw, yw = -e.l + v.tw / 2, zj = (v.h - v.tf) / 2, zw = v.h / 2 - v.tf;
    const Sr = (v.tf * Math.abs(yt * yt - yw * yw)) / 2;
    for (const z of [-v.h / 2, -zw, zw, v.h / 2]) lijn(yr, yt, (y) => fn(y, z, (Math.abs(Vz) * (yt - y) * ef) / m.Iy + ty(y)));
    for (const y of [-e.l, yr]) lijn(-zw, zw, (z) => fn(y, z, tz(z) + (Math.abs(Vy) * Sr * Math.abs(z)) / (zj * m.Iz * v.tw)));
  }
}
{
  // Ook met een zware dwarskracht en een kleine N: dan ligt de top eerder tussen de hoeken.
  const zwaar = (w) => ({ ...w, N_x: String(parseFloat(w.N_x) * 0.2), M_y: String(parseFloat(w.M_y) * 0.1), M_z: String(parseFloat(w.M_z) * 0.1), V_y: String(parseFloat(w.V_y) * 3), V_z: String(parseFloat(w.V_z) * 3) });
  for (const [naam, basis] of ALLE) {
    const { v, m } = meetkunde.get(naam);
    for (const [soort, w] of [["gewoon", basis], ["vooral dwarskracht", zwaar(basis)]]) {
      const r = doorreken(w);
      const [Vy, Vz] = [parseFloat(w.V_y) * 1e3, parseFloat(w.V_z) * 1e3];
      let top = 0;
      plekken(w, v, m, Vy, Vz, (y, z, τ) => {
        const s = r.uit["σ_N"] + r.uit.k_y * z + r.uit.k_z * y;
        top = Math.max(top, Math.sqrt(s * s + 3 * τ * τ));
      });
      // Nooit lager dan het fijne rooster, op een half procent na (de stap van het blad), en niet ver erboven.
      const a = r.uit["σ_v_max"];
      waar(`${naam}, ${soort}: σ_v,max = ${a?.toFixed(2)}, fijn rooster ${top.toFixed(2)}`, a >= top * 0.995 && a <= top * 1.01);
    }
  }
}

console.log("\n   Willekeurige maten en lasten: nergens onder het fijne rooster, en nooit onterecht 'voldoet'");
{
  // Vast zaad: dezelfde gevallen bij elke controle.
  let zaad = 20261104;
  const rnd = () => (zaad = (zaad * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const tussen = (a, c) => a + (c - a) * rnd();
  const teken = () => (rnd() < 0.5 ? -1 : 1);
  const kort = (x) => String(Math.round(x * 10) / 10);
  const VORMEN = {
    I: () => {
      const [h, b, tw, tf] = [tussen(100, 600), tussen(60, 300), tussen(4, 20), tussen(5, 30)];
      return { vorm: "1", profiel: "0", h: kort(h), b: kort(b), t_w: kort(Math.min(tw, b / 3)), t_f: kort(Math.min(tf, h / 5)), r: kort(tussen(0, Math.min(b / 4, h / 8))) };
    },
    rechthoek: () => ({ vorm: "2", b: kort(tussen(30, 500)), h: kort(tussen(30, 500)) }),
    rond: () => ({ vorm: "3", D: kort(tussen(30, 500)) }),
    buis: () => {
      const D = tussen(40, 500);
      return { vorm: "4", D: kort(D), t: kort(tussen(2, D / 3)) };
    },
    koker: () => {
      const [b, h] = [tussen(50, 400), tussen(50, 400)];
      return { vorm: "5", b: kort(b), h: kort(h), t_w: kort(tussen(2, b / 4)), t_f: kort(tussen(2, h / 4)) };
    },
    T: () => {
      const [b, h] = [tussen(50, 400), tussen(50, 500)];
      return { vorm: "6", b: kort(b), h: kort(h), t_w: kort(tussen(3, b / 3)), t_f: kort(tussen(3, h * 0.6)) };
    },
    U: () => {
      const [b, h] = [tussen(40, 200), tussen(60, 500)];
      return { vorm: "7", b: kort(b), h: kort(h), t_w: kort(tussen(3, b * 0.7)), t_f: kort(tussen(3, h / 3)) };
    },
  };
  for (const [naam, maak] of Object.entries(VORMEN)) {
    let laagste = Infinity, hoogste = 0, onterecht = 0, geval = "", n = 0;
    for (let k = 0; k < 8; k++) {
      const maten = maak();
      const v = maakVorm({ ...maten });
      const m = integreer(v);
      // Lasten van dezelfde orde als de maten: spanningen rond 50 N/mm², soms met de dwarskracht voorop.
      const A = m.A;
      const D = Math.max(v.H, v.B);
      const nadruk = rnd();
      const w = {
        ...maten,
        N_x: kort((teken() * tussen(0, 40) * A) / 1000),
        M_y: kort((teken() * tussen(0, 30) * A * D * (nadruk < 0.3 ? 0.02 : 0.15)) / 1e6),
        M_z: kort((teken() * tussen(0, 30) * A * D * (nadruk < 0.3 ? 0.01 : 0.08)) / 1e6),
        V_y: kort((teken() * tussen(0, 30) * A) / 1000),
        V_z: kort((teken() * tussen(0, 30) * A) / 1000),
        f_y: "0",
      };
      const r = doorreken(w);
      const a = r.uit["σ_v_max"];
      let top = 0;
      plekken(w, v, m, parseFloat(w.V_y) * 1e3, parseFloat(w.V_z) * 1e3, (y, z, τ) => {
        const s = r.uit["σ_N"] + r.uit.k_y * z + r.uit.k_z * y;
        top = Math.max(top, Math.sqrt(s * s + 3 * τ * τ));
      });
      n++;
      if (top > 0 && a / top < laagste) {
        laagste = a / top;
        geval = JSON.stringify(w);
      }
      if (top > 0) hoogste = Math.max(hoogste, a / top);
      // Een grens 1 % onder de hoogste spanning uit het fijne rooster moet zakken.
      if (top > 0) {
        const g = doorreken({ ...w, f_y: String(top * 0.99) });
        if (g.r.voldoet !== false) onterecht++;
      }
    }
    waar(`${naam}: ${n} gevallen, σ_v,max tussen ${laagste.toFixed(4)} en ${hoogste.toFixed(4)} maal het fijne rooster`, laagste >= 0.995 && hoogste <= 1.02, geval);
    waar(`${naam}: een grens 1 % onder het fijne rooster voldoet nooit`, onterecht === 0, `${onterecht} keer`);
  }
}

// ── 6. Grenswaarde ──────────────────────────────────────────────────────────
console.log("\n6. De grenswaarde f_y: oordeel alleen als er een grenswaarde is");
{
  let r = doorreken(IPE);
  waar("zonder f_y: geen UC en geen oordeel", r.r.uc === null && r.r.voldoet === null && !r.r.nietGetoetst, JSON.stringify(r.r));
  r = doorreken({ ...IPE, f_y: "235" });
  // σ_v,max ≥ 340,89: UC = 340,89/235 = 1,45.
  waar("f_y = 235: UC ≈ 1,46 en voldoet niet", r.r.voldoet === false && r.r.uc > 1.44 && r.r.uc < 1.48 && /Maatgevende UC/.test(r.tekst), JSON.stringify(r.r));
  r = doorreken({ ...IPE, f_y: "400" });
  waar("f_y = 400: UC ≈ 0,86 en voldoet", r.r.voldoet === true && r.r.uc > 0.84 && r.r.uc < 0.88, JSON.stringify(r.r));
  // Een UC die op 1,00 zou afronden telt als boven de 1: rechthoek, N geeft σ = 100,4, f_y = 100.
  r = doorreken({ ...NUL, vorm: "2", b: "100", h: "100", N_x: "1004", f_y: "100" });
  waar("UC 1,004 staat er als 1,01 en voldoet niet", r.r.voldoet === false && r.r.uc === 1.01, JSON.stringify(r.r));
  r = doorreken({ ...NUL, vorm: "2", b: "100", h: "100", N_x: "1000", f_y: "100" });
  waar("UC precies 1 voldoet", r.r.voldoet === true && r.r.uc === 1, JSON.stringify(r.r));
}

// ── 7. Ongeldige invoer ─────────────────────────────────────────────────────
console.log("\n7. Ongeldige invoer: een melding, geen NaN en geen oordeel");
{
  const ongeldig = [
    ["niets ingevuld", { vorm: "1", profiel: "0" }],
    ["I: hoogte 0", { ...IPE, ...eigenI, h: "0" }],
    ["I: flenzen raken elkaar", { ...IPE, ...eigenI, t_f: "150" }],
    ["I: lijf breder dan de flens", { ...IPE, ...eigenI, t_w: "150" }],
    ["I: afronding past niet", { ...IPE, ...eigenI, r: "100" }],
    ["I: negatieve afronding", { ...IPE, ...eigenI, r: "-1" }],
    ["rechthoek: breedte 0", { ...RH, b: "0" }],
    ["rechthoek: negatieve hoogte", { ...RH, h: "-5" }],
    ["rond: diameter 0", { ...RO, D: "0" }],
    ["buis: wanddikte 0", { ...BU, t: "0" }],
    ["buis: wanddikte groter dan de straal", { ...BU, t: "60" }],
    ["buis: wanddikte gelijk aan de straal", { ...BU, t: "50" }],
    ["koker: wanden raken elkaar", { ...KO, t_w: "50" }],
    ["koker: flenzen raken elkaar", { ...KO, t_f: "100" }],
    ["T: flens zo hoog als de doorsnede", { ...TE, t_f: "200" }],
    ["T: lijf breder dan de flens", { ...TE, t_w: "160" }],
    ["U: flenzen raken elkaar", { ...UU, t_f: "100" }],
    ["U: rug zo breed als de doorsnede", { ...UU, t_w: "100" }],
    ["negatieve grenswaarde", { ...RH, f_y: "-10" }],
  ];
  for (const [wat, w] of ongeldig) {
    const r = doorreken(w);
    const signaal = REKEN_FOUT.find((f) => r.tekst.includes(f));
    const meld = /Ongeldig/.test(r.tekst) && /Eindoordeel: ongeldige invoer/.test(r.tekst);
    waar(`${wat}: melding, geen oordeel, geen NaN`, meld && r.r.nietGetoetst === true && r.r.voldoet === null && r.r.uc === null && !signaal && r.uit["σ_v_max"] === undefined, signaal ?? JSON.stringify(r.r));
  }
  // De melding noemt wat er mis is; de opmerking over de buis uit het kader staat er letterlijk.
  const buis = doorreken({ ...BU, t: "60" });
  waar("de buis noemt de wanddikte en de straal", /wanddikte/.test(buis.tekst) && /straal/.test(buis.tekst), buis.tekst.slice(-200));
  // Elke vorm gaat in elke andere over: oude maten mogen niet stil meetellen.
  const r = doorreken({ ...RH, vorm: "3", D: "0" });
  waar("een rechthoek die rond wordt met D = 0 is ongeldig, ook met b en h ingevuld", r.r.nietGetoetst === true);
}

// ── 8. Beeld en blad ────────────────────────────────────────────────────────
console.log("\n8. Beeld en blad: dezelfde doorsnede, het veld, de neutrale lijn en de pieken");
const talen = {};
for (const taal of ["nl", "en"]) {
  talen[taal] = JSON.parse(readFileSync(new URL(`../packages/desktop/src/i18n/locales/${taal}/beelden.json`, import.meta.url), "utf8")).doorsnede;
}
{
  const TEKST = talen.nl.tekening;
  for (const [naam, w] of ALLE) {
    const r = doorreken(w);
    const lees = (k) => (k in w ? parseFloat(w[k]) : 0);
    const def = maakDoorsnede(lees);
    const u = r.uit;
    waar(`${naam}: de definitie geeft het zwaartepunt en I van het blad`, gelijk(def.yc, u.y_c, 1e-6) && gelijk(def.zc, u.z_c, 1e-6) && gelijk(def.A, u.A, 1e-6) && gelijk(def.Iy, u.I_y * 1e4, 1e-6) && gelijk(def.Iz, u.I_z * 1e4, 1e-6),
      `${def.yc}/${u.y_c}, ${def.zc}/${u.z_c}, ${def.A}/${u.A}`);
    // De hoekpunten van de definitie geven σ_max en σ_min van het blad.
    const σ = (y, z) => u["σ_N"] + u.k_y * z + u.k_z * y;
    const langs = def.hoekpunten.map(([y, z]) => σ(y, z));
    waar(`${naam}: de uitersten op de omtrek van het beeld zijn die van het blad`, gelijk(Math.max(...langs), u["σ_max"], 5e-4) && gelijk(Math.min(...langs), u["σ_min"], 5e-4), `${Math.max(...langs)} tegen ${u["σ_max"]}`);
    const t = tekenDoorsnede(def, u, TEKST, 520, false);
    const kapot = /NaN|undefined|Infinity/.exec(t.svg);
    waar(`${naam}: tekening zonder NaN of undefined`, !kapot, kapot ? t.svg.slice(Math.max(0, kapot.index - 80), kapot.index + 40) : "");
    waar(`${naam}: tekening met veld, omtrek, assen en vier diagrammen`, ["veld", "omtrek", "assen", "sigma-z", "tau-z", "sigma-y", "tau-y", "schaal"].every((x) => t.svg.includes(`data-deel="${x}"`)));
    // Geen verwijzing naar een id: op papier staat een kopie en is het origineel verborgen.
    waar(`${naam}: de tekening hangt niet aan een id`, !/\sid="|url\(#/.test(t.svg));
    // Op schaal: de omtrek in het beeld is de maat maal de schaal.
    const m = /data-deel="omtrek"[^>]*><path[^>]*d="([^"]+)"/.exec(t.svg);
    const xs = [...(m?.[1] ?? "").matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((q) => [Number(q[1]), Number(q[2])]);
    const bx = Math.max(...xs.map((q) => q[0])) - Math.min(...xs.map((q) => q[0]));
    const by = Math.max(...xs.map((q) => q[1])) - Math.min(...xs.map((q) => q[1]));
    const { B, H } = def;
    waar(`${naam}: de omtrek staat op schaal (${bx.toFixed(0)} × ${by.toFixed(0)} px)`, gelijk(bx, B * t.schaal, 5e-3, 0.3) && gelijk(by, H * t.schaal, 5e-3, 0.3));
    // Het veld: elke strook ligt op de plek van zijn spanning en heeft de kleur daarvan.
    const stroken2 = [...t.svg.matchAll(/<path data-sigma="(-?[\d.]+)" d="([^"]+)" fill="(rgb\([^"]+\))"/g)];
    const breed = u["σ_max"] - u["σ_min"];
    const S = Math.max(Math.abs(u["σ_max"]), Math.abs(u["σ_min"]));
    const stap = breed / VELD_STROKEN;
    let misplaatst = 0, verkleurd = 0;
    for (const [, sig, d, kleur] of stroken2) {
      const w = Number(sig);
      // De spanning op de strook staat afgerond in de tekening: een tint verschil mag.
      const tint = (k) => k.match(/\d+/g).map(Number);
      if (tint(kleur).some((c, i) => Math.abs(c - tint(kleurVan(w, S))[i]) > 2)) verkleurd++;
      for (const q of d.matchAll(/(-?[\d.]+) (-?[\d.]+)/g)) {
        const [y, z] = [(Number(q[1]) - t.oorsprong.x) / t.schaal, (Number(q[2]) - t.oorsprong.y) / t.schaal];
        // Een strook loopt iets door onder de volgende, de eerste en de laatste een stap verder.
        if (Math.abs(σ(y, z) - w) > 2.2 * stap + 0.5) misplaatst++;
      }
    }
    waar(`${naam}: het veld loopt in ${stroken2.length} stroken van σ_min naar σ_max`, stroken2.length >= VELD_STROKEN - 3 && Math.abs(Number(stroken2[0]?.[1]) - u["σ_min"]) <= 1.5 * stap + 0.01 && Math.abs(Number(stroken2[stroken2.length - 1]?.[1]) - u["σ_max"]) <= 1.5 * stap + 0.01, `${stroken2[0]?.[1]} en ${stroken2[stroken2.length - 1]?.[1]}`);
    waar(`${naam}: elke strook ligt op de plek van zijn spanning, met de kleur daarvan`, misplaatst === 0 && verkleurd === 0, `${misplaatst} punten, ${verkleurd} kleuren`);
    // De neutrale lijn: σ = 0 op de twee eindpunten.
    const nl = /data-deel="neutraal"[^>]*x1="(-?[\d.]+)" y1="(-?[\d.]+)" x2="(-?[\d.]+)" y2="(-?[\d.]+)"/.exec(t.svg);
    const door = u["σ_max"] > 0 && u["σ_min"] < 0;
    if (door) {
      const mm = (x, y) => [(x - t.oorsprong.x) / t.schaal, (y - t.oorsprong.y) / t.schaal];
      const [ya, za] = mm(Number(nl?.[1]), Number(nl?.[2]));
      const [yb, zb] = mm(Number(nl?.[3]), Number(nl?.[4]));
      const grens = Math.max(Math.abs(u["σ_max"]), Math.abs(u["σ_min"])) * 0.01;
      waar(`${naam}: de neutrale lijn ligt op σ = 0`, nl && Math.abs(σ(ya, za)) < grens && Math.abs(σ(yb, zb)) < grens, `${σ(ya, za)} en ${σ(yb, zb)}`);
    }
    // De diagrammen: de punten kloppen met de uitkomsten van het blad.
    const piek = (l) => Math.max(...l.map((p) => Math.abs(p[1])));
    waar(`${naam}: de piek van τ langs z is τ_z,max uit het blad`, gelijk(piek(t.lijnen.tauZ), u["τ_z_max"], 5e-3, 1e-3), `${piek(t.lijnen.tauZ)} tegen ${u["τ_z_max"]}`);
    waar(`${naam}: de piek van τ langs y is τ_y,max uit het blad`, gelijk(piek(t.lijnen.tauY), u["τ_y_max"], 5e-3, 1e-3), `${piek(t.lijnen.tauY)} tegen ${u["τ_y_max"]}`);
    const [z0, s0] = t.lijnen.sigmaZ[0];
    const [y0, s1] = t.lijnen.sigmaY[0];
    waar(`${naam}: σ langs de assen is de formule van het blad`, gelijk(s0, σ(0, z0), 1e-6, 1e-6) && gelijk(s1, σ(y0, 0), 1e-6, 1e-6));
    // De waarde in de legenda.
    const tekst = t.svg.replace(/<[^>]+>/g, " ");
    waar(`${naam}: σ_max en σ_v,max staan in de tekening`, tekst.includes(t.fmt(u["σ_max"])) && tekst.includes(t.fmt(u["σ_v_max"])));
  }
  // Rood is trek en blauw is druk, op de goede plek: bij M_y > 0 is de onderkant rood.
  {
    const w = { ...NUL, vorm: "2", b: "100", h: "200", M_y: "20" };
    const r = doorreken(w);
    const t = tekenDoorsnede(maakDoorsnede((k) => (k in w ? parseFloat(w[k]) : 0)), r.uit, TEKST, 520, false);
    const stroken2 = [...t.svg.matchAll(/<path data-sigma="(-?[\d.]+)" d="([^"]+)" fill="rgb\((\d+),(\d+),(\d+)\)"/g)];
    const opY = (m) => Math.max(...[...m[2].matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map((q) => Number(q[2])));
    const laag = stroken2[stroken2.length - 1];
    const hoog = stroken2[0];
    waar("bij M_y > 0 ligt de rode strook onder en de blauwe boven", opY(laag) > opY(hoog) && Number(laag[3]) > Number(laag[5]) && Number(hoog[5]) > Number(hoog[3]), `${laag[3]},${laag[5]} en ${hoog[3]},${hoog[5]}`);
    // Alleen normaalkracht: één kleur, zonder neutrale lijn.
    const v = { ...NUL, vorm: "2", b: "100", h: "200", N_x: "100" };
    const rv = doorreken(v);
    const tv = tekenDoorsnede(maakDoorsnede((k) => (k in v ? parseFloat(v[k]) : 0)), rv.uit, TEKST, 520, false);
    waar("alleen normaalkracht: één kleur, geen neutrale lijn", [...tv.svg.matchAll(/data-sigma=/g)].length === 1 && !tv.svg.includes('data-deel="neutraal"') && tv.svg.includes(TEKST.geenMoment.split(":")[0]));
  }
  // Ongeldig: de tekening blijft heel en zegt het.
  const def = maakDoorsnede((k) => ({ vorm: 2, b: 0, h: 200 })[k] ?? 0);
  waar("een ongeldige doorsnede is ongeldig in de definitie", def.geldig === false);
  const t = tekenDoorsnede(def, {}, TEKST, 520, false);
  waar("en de tekening zegt dat, zonder NaN", !/NaN|undefined|Infinity/.test(t.svg) && t.svg.includes(TEKST.ongeldig));
  // Blad nog niet doorgerekend: de omtrek staat er wel.
  const def2 = maakDoorsnede((k) => ({ vorm: 2, b: 100, h: 200 })[k] ?? 0);
  const t2 = tekenDoorsnede(def2, {}, TEKST, 520, true);
  waar("zonder uitkomst van het blad: de omtrek, en geen NaN", t2.svg.includes('data-deel="omtrek"') && !/NaN|undefined|Infinity/.test(t2.svg));
  waar("op een smal paneel blijft de tekening binnen de breedte", (() => {
    const r = doorreken(IPE);
    const d = maakDoorsnede((k) => (k in IPE ? parseFloat(IPE[k]) : 0));
    const s = tekenDoorsnede(d, r.uit, TEKST, 300, false);
    return s.breedte === 340 && !/x="-\d/.test(s.svg);
  })());
  // Een lang, smal en een plat vak: de diagrammen houden een leesbare maat.
  for (const [wat, w] of [["een strip 400 × 20", { ...RH, b: "400", h: "20" }], ["een strip 20 × 400", { ...RH, b: "20", h: "400" }]]) {
    const r = doorreken(w);
    const d = maakDoorsnede((k) => (k in w ? parseFloat(w[k]) : 0));
    const s = tekenDoorsnede(d, r.uit, TEKST, 520, false);
    waar(`${wat}: tekening heel, hoogte ${Math.round(s.hoogte)} px`, !/NaN|undefined|Infinity/.test(s.svg) && s.hoogte < 800);
  }
  // De maten: klikbaar als ze invoer zijn.
  const r = doorreken(IPE);
  const d = maakDoorsnede((k) => (k in IPE ? parseFloat(IPE[k]) : 0));
  waar("een profiel uit de lijst heeft geen klikbare maten", tekenDoorsnede(d, r.uit, TEKST, 520, true).maten.length === 0);
  const eig = { ...RH };
  const r2 = doorreken(eig);
  const d2 = maakDoorsnede((k) => (k in eig ? parseFloat(eig[k]) : 0));
  const mn = tekenDoorsnede(d2, r2.uit, TEKST, 520, true).maten.map((m) => m.naam).sort().join();
  waar("een rechthoek heeft klikbare maten b en h", mn === "b,h", mn);
}

// ── 9. Taal, catalogus, vertalingen ─────────────────────────────────────────
console.log("\n9. Taal, catalogus en vertalingen");
{
  const v = bronVoorUitvoer(tpl, "en");
  waar("het blad heeft een Engelse vertaling", v.bron !== tpl);
  for (const [naam, w] of ALLE) {
    const nl = doorreken(w);
    const en = doorreken(w, v.bron);
    const velden = Object.keys(nl.uit);
    const anders = velden.filter((k) => nl.uit[k] !== en.uit[k]);
    waar(`${naam}: in beide talen dezelfde getallen`, anders.length === 0, anders.join(", "));
  }
  const en = doorreken({ ...IPE, f_y: "235" }, v.bron);
  waar("de kop en het oordeel in het Engels", /Section stresses/.test(en.r.titel) && en.r.voldoet === false, JSON.stringify(en.r));
  const ok = doorreken({ ...IPE, f_y: "400" }, v.bron);
  waar("'voldoet' in het Engels", ok.r.voldoet === true && ok.r.uc !== null, JSON.stringify(ok.r));
  const fout = doorreken({ ...BU, t: "60" }, v.bron);
  waar("'ongeldig' in het Engels", fout.r.nietGetoetst === true, JSON.stringify(fout.r));

  const nlK = Object.keys(talen.nl).sort().join();
  const enK = Object.keys(talen.en).sort().join();
  waar("de beeldteksten staan in beide talen", nlK === enK && Object.keys(talen.nl.tekening).sort().join() === Object.keys(talen.en.tekening).sort().join());
  const ontbreekt = TEKST_SLEUTELS.filter((k) => !talen.nl.tekening[k] || !talen.en.tekening[k]);
  waar("elke tekst die de tekening vraagt, bestaat", ontbreekt.length === 0, ontbreekt.join(", "));

  const boom = readFileSync(new URL("../packages/desktop/src/components/calc/projectTree.ts", import.meta.url), "utf8");
  waar("de module staat in de catalogus, op 'controleren'", /templateId: "doorsnede-spanningen", status: "controleren"/.test(boom));
  const index = readFileSync(new URL("../packages/desktop/src/templates/index.ts", import.meta.url), "utf8");
  waar("het blad staat in de templates", /"doorsnede-spanningen":/.test(index));
  for (const taal of ["nl", "en"]) {
    const w = JSON.parse(readFileSync(new URL(`../packages/desktop/src/i18n/locales/${taal}/werkruimte.json`, import.meta.url), "utf8"));
    waar(`de naam in de catalogus in het ${taal === "nl" ? "Nederlands" : "Engels"}`, Boolean(w.catalogus.modules["doorsnede-spanningen"]));
  }
  // Wringing en lokale effecten staan op het blad, ook op papier: geen alleen-scherm.
  const r = doorreken(IPE);
  waar("het blad zegt dat wringing en lokale effecten er niet in zitten", /[Ww]ringing/.test(r.tekst) && /lokale effecten/.test(r.tekst));
  const opPapier = tpl.split("\n").find((l) => /ringing/.test(l) && /lokale effecten/.test(l)) ?? "";
  waar("en die regel staat ook op papier", /ook-afdruk/.test(opPapier) && !/alleen-scherm/.test(opPapier), opPapier.slice(0, 120));
  const uTekst = doorreken(UU).tekst;
  waar("een U noemt het dwarskrachtencentrum", /dwarskrachtencentrum/.test(uTekst));
}

console.log(`\nSpanningen in een doorsnede: ${getest} controles, ${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
