/**
 * Controlescript voor de T-balk van de Balklaag: een houten vloerbalk met de
 * vloerplaat als meewerkende flens, verlijmd, volgens NEN-EN 1995-1-1 §9.1.2.
 *
 * De T-balk is nog niet nagerekend op referentiebladen. Dit script toetst het
 * blad tegen een handberekening (de rekensom staat bij elke set) en tegen een
 * onafhankelijke uitwerking hieronder in JavaScript:
 *
 *   1  enkelvoudige ligger, OSB/3 met de hoofdas loodrecht op de balken:
 *      meewerkende breedte (9.10) en tabel 9.1, de getransformeerde doorsnede,
 *      de spanningen in balk (6.17) en plaat (9.13), de afschuiving van de balk
 *      en de rolschuif in de lijmnaad (9.12), de kruipfactor van de
 *      samengestelde doorsnede, w_fin, f_1 en de combinatie met alleen G;
 *   2  twee velden: de getrokken flens bij het steunpunt (9.14) met de
 *      meewerkende breedte zonder plaatplooi, en de balk in druk (6.19);
 *   3  multiplex met fabrikantgegevens, een brede balk op een dunne plaat: de
 *      reductie (8h_f/b_w)^0,8 in (9.12) en de vrije flensbreedte (§9.1.2(5));
 *   4  spaanplaat: k_mod, k_mod,G en k_def als invoer, γ_M = 1,3, tabel 9.1
 *      met 0,2·l en 30·h_f;
 *   5  onvolledige of ongeldige plaatgegevens: het blad rekent verder met de
 *      balk alleen en de slotzin zegt "niet getoetst";
 *   6  T-balk bij een onderslag of raveelbalk: niet van toepassing, het blad
 *      rekent exact als de rechthoekige balk;
 *   7  de rechthoekige balk is de standaard, en het beeld kent de keuzes.
 *
 * De invoerwaarden van multiplex en spaanplaat in set 3 en 4 zijn testinvoer,
 * geen materiaalwaarden: die horen van de fabrikant te komen.
 *
 * Draaien:  node scripts/check-balklaag-tbalk.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { parse, evaluate, render } from "../packages/core/dist/index.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { laadTemplate, afronden } from "./lib/refcheck.mjs";

const ast = parse(laadTemplate("balklaag.ts"));
const hier = dirname(fileURLToPath(import.meta.url));
const PROJECT = { CC: 2, K_FI: 1 };

/** Het basisgeval van check-balklaag.mjs: 71×221 C24, klimaatklasse 1, middellang, CC2. */
const BASIS = {
  profiel: "12", sterkteklasse: "2", klimaat: "1", duurklasse: "2", schema: "1", ligger: "1",
  L_d: "5000", a_opl: "50", hoh: "600", t_vloer: "18", E_beschot: "7000", b_vloer: "5",
  a_over: "0", L_veld2: "0", a_steun: "0", b_sparing: "0", l_staart: "0", b_ond: "0", b_zelf: "0", h_zelf: "0",
  G_k: "1.0", Q_k: "1.75", F_k: "2", g_bl: "0", belastingcat: "2",
  "ψ_0_zelf": "0", "ψ_2_zelf": "0", controleer: "1", grensfactor: "0.004", grens_bij: "0.003",
  controleer_trilling: "1", "ζ": "0.01", a_tril: "1", b_tril: "120",
};
/** De T-balk met OSB/3, hoofdas loodrecht op de balken. */
const T_OSB = { doorsnede: "2", plaat: "4" };

const getal = (s) => parseFloat(String(s).replace(",", "."));

/** Rekent het blad door (norm-stand): de laatste zichtbare waarde per naam en de platte tekst. */
function reken(invoer, rekenwijze = 0) {
  const nodes = evaluate(ast, { ...BASIS, ...invoer }, { ...PROJECT, rekenwijze });
  const alle = {};
  const loop = (lijst) => {
    for (const n of lijst) {
      if (n.type === "assignment" || n.type === "var-display") {
        const w = getal(n.result);
        if (Number.isFinite(w)) alle[n.name] = w;
      }
      if (Array.isArray(n.children)) loop(n.children);
    }
  };
  loop(nodes);
  const tekst = render(nodes).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return { alle, tekst };
}

function slotzin(tekst) {
  const i = tekst.lastIndexOf("Maatgevende UC");
  return i < 0 ? "" : tekst.slice(i, i + 240);
}

let fouten = 0;
const toon = (v) => (v === undefined || !Number.isFinite(v) ? String(v ?? "—") : String(Number(v.toPrecision(5))));

/** Het blad drukt vier significante cijfers af: een relatieve marge. */
function gelijk(label, ons, doel, { rel = 2e-3, abs = 1e-4 } = {}) {
  const ok = Number.isFinite(ons) && Math.abs(ons - doel) <= rel * Math.abs(doel) + abs;
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${label.padEnd(48)} blad ${toon(ons).padStart(11)}   verwacht ${toon(doel)}`);
}

function waar(label, ok, toelichting = "") {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${label}${toelichting ? `   (${toelichting})` : ""}`);
}

// ── Onafhankelijke uitwerking ────────────────────────────────────────────
// Getransformeerde T-doorsnede in hout: balk b×h onder een plaat (be × hf)
// met verhouding n = E_plaat/E_hout. Afstanden vanaf de bovenkant van de plaat,
// in mm; I in mm⁴.
function tDoorsnede(b, h, hf, be, n) {
  const A = b * h;
  const Af = n * be * hf;
  const z = (Af * hf / 2 + A * (hf + h / 2)) / (Af + A);
  const I = (b * h ** 3) / 12 + A * (hf + h / 2 - z) ** 2 + n * ((be * hf ** 3) / 12 + be * hf * (z - hf / 2) ** 2);
  // Statisch moment van de plaat en van het deel van de balk onder de neutrale lijn.
  const Sf = Af * (z - hf / 2);
  const Sw = z >= hf ? (b * (hf + h - z) ** 2) / 2 : b * h * (hf + h / 2 - z);
  return { z, I, Sf, Sw };
}

/** M in kNm, V in kN; spanningen in N/mm². */
const spanningen = (d, b, h, hf, n, M, V) => ({
  sN: (M * 1e6 * (hf + h / 2 - d.z)) / d.I,
  sM: (M * 1e6 * h) / 2 / d.I,
  sF: (n * M * 1e6 * (d.z - hf / 2)) / d.I,
  tauW: (V * 1e3 * d.Sw) / (d.I * b),
  tauR: (V * 1e3 * d.Sf) / (d.I * b),
});

// ── 1. Enkelvoudige ligger, OSB/3 ⊥ ──────────────────────────────────────

console.log("\n1. Enkelvoudige ligger 71×221 C24, L = 5,05 m, h.o.h. 600, OSB/3 18 mm met de hoofdas ⊥ op de balken");
{
  // Meewerkende breedte (§9.1.2(3), tabel 9.1, OSB: 0,15·l en 25·h_f):
  //   b_f = 600 − 71 = 529 mm; 0,15·5050 = 757,5; 25·18 = 450 → b_c,ef = 450,
  //   b_ef = 450 + 71 = 521 mm (9.10). §9.1.2(5): 529/(2·450) = 0,5878.
  // Plaat (EN 12369-1, OSB/3, 10 < t ≤ 18, dwars op de hoofdas): f_c = 12,7,
  //   f_t = 7,0, f_r = 1,0, E = 3000 N/mm². n_E = 3000/11000 = 0,27273.
  // Doorsnede: A = 15 691 mm², I_y = 71·221³/12 = 63 863 678 mm⁴,
  //   n·A_f = 0,27273·521·18 = 2557,6 mm²,
  //   z_c = (2557,6·9 + 15 691·128,5)/(2557,6 + 15 691) = 111,75 mm,
  //   I_ef = 63 863 678 + 15 691·16,749² + 2557,6·(18²/12 + 102,75²) = 95 337 400 mm⁴,
  //   EI_ef = 11 000·95 337 400 = 1048,7 kNm².
  // UGT: P_g,k = 0,6 + 0,071·0,221·420·9,81/1000 = 0,66465 kN/m, q = 1,05 kN/m;
  //   6.10b: M = (1,2·0,66465 + 1,5·1,05)·5,05²/8 = 7,5634 kNm, V = 5,9908 kN.
  // Balk met de plaat na volle kruip: n_fin = 0,27273·1,6/2,5 = 0,17455,
  //   z = 117,21 mm, I = 85 074 900 mm⁴;
  //   σ_t,0,d = 7,5634e6·11,288/85,075e6 = 1,0036; σ_m,d = 7,5634e6·110,5/85,075e6 = 9,8238;
  //   f_t,0,d = 0,8·14,5/1,3 = 8,9231; f_m,d = 0,8·24/1,3 = 14,769;
  //   (6.17): 1,0036/8,9231 + 9,8238/14,769 = 0,7776 (rechthoekig: 0,8861).
  // Plaat momentaan: σ_f,c,d = 0,27273·7,5634e6·102,75/95,337e6 = 2,2231;
  //   f_f,c,d = 0,70·12,7/1,2 = 7,4083 → (9.13) 0,3001.
  // Afschuiving balk: S = 71·121,79²/2 = 526 552 mm³,
  //   τ_d = 5990,8·526 552/(85,075e6·71) = 0,5222 → /2,4615 = 0,2122.
  // Lijmnaad: S_f = 2557,6·102,75 = 262 801 mm³,
  //   τ_r,d = 5990,8·262 801/(95,337e6·71) = 0,2326; f_r,d = 0,70·1,0/1,2 = 0,5833;
  //   8·h_f = 144 ≥ 71, dus geen reductie → (9.12) 0,3987.
  // Kruip: volle kruip EI_fin = 11 000/1,6·85,075e6 → k = 1048,7/584,9 − 1 = 0,7930;
  //   met ψ_2 = 0,3 (E/1,18 en E_f/1,45): EI = 840,49 kNm² → (1,24774 − 1)/0,3 = 0,8258;
  //   k_def,ef = 0,8258.
  // w_fin: u_g = 5·0,66465·5050⁴/(384·EI) = 5,3671, u_q = 8,4789 mm (u_Q = 4,00 kleiner);
  //   w_fin = 1,8258·5,3671 + (1 + 0,3·0,8258)·8,4789 = 20,379 mm.
  // f_1 = π/(2·5,05²)·√(1 747 853/112,92) = 7,663 Hz (≤ 8 Hz: niet aangetoond).
  const { alle: a, tekst } = reken(T_OSB);
  gelijk("b_c,ef = min(529; 757,5; 450) = 450 mm", a.b_c_ef, 450, { rel: 0, abs: 1e-6 });
  gelijk("b_ef = 521 mm (9.10)", a.b_ef, 521, { rel: 0, abs: 1e-6 });
  gelijk("UC_bf = 529/900 (§9.1.2(5))", a.UC_bf, 529 / 900);
  gelijk("f_f,c,k = 12,7 (EN 12369-1, ⊥)", a.f_f_c_k, 12.7, { rel: 0, abs: 1e-9 });
  gelijk("f_f,t,k = 7,0", a.f_f_t_k, 7.0, { rel: 0, abs: 1e-9 });
  gelijk("E_f = 3000", a.E_f, 3000, { rel: 0, abs: 1e-9 });
  gelijk("k_mod,f = 0,70 (OSB/3, kk 1, middellang)", a.k_mod_f, 0.7, { rel: 0, abs: 1e-9 });
  gelijk("k_def,f = 1,50", a.k_def_f, 1.5, { rel: 0, abs: 1e-9 });
  gelijk("n_E = 0,27273", a.n_E, 0.27273);
  gelijk("z_c = 111,75 mm", a.z_c, 111.75);
  gelijk("I_ef = 95 337 400 mm⁴", a.I_ef, 95337400);
  gelijk("EI_ef = 1048,7 kNm²", a.EI_ef, 1048.7);
  gelijk("M_Ed,v = 7,5634 kNm", a.M_Ed_v, 7.5634);
  gelijk("σ_t,0,d = 1,0036", a["σ_t_0_d"], 1.0036);
  gelijk("σ_m,d = 9,8238", a["σ_m_d"], 9.8238);
  gelijk("UC_lijf,v = 0,7776 (6.17)", a.UC_lijf_v, 0.7776);
  gelijk("UC_buiging = 0,7776", a.UC_buiging, 0.7776);
  gelijk("σ_f,c,d = 2,2231", a["σ_f_c_d"], 2.2231);
  gelijk("UC_flens = 0,3001 (9.13)", a.UC_flens, 0.3001);
  gelijk("τ_d = 0,5222", a["τ_d"], 0.5222);
  gelijk("UC_afsch = 0,2122", a.UC_afsch, 0.2122);
  gelijk("τ_r,d = 0,2326", a["τ_r_d"], 0.2326);
  gelijk("UC_lijm = 0,3987 (9.12)", a.UC_lijm, 0.3987);
  gelijk("k_def,ef = 0,8258", a.k_def_ef, 0.8258);
  gelijk("w_fin = 20,379 mm", a.w_fin, 20.379);
  gelijk("f_1 = 7,663 Hz", a.f_1, 7.663);
  // Alleen permanent: M = 1,35·0,66465·3,1878 = 2,8604 kNm, k_mod,G = 0,6 (hout)
  //   en 0,40 (OSB/3): balk 0,3796/6,6923 + 3,7152/11,077 = 0,3921 (maatgevend);
  //   plaat 0,8408/4,2333 = 0,1986; lijmnaad 0,08796/0,3333 = 0,2639.
  gelijk("UC_G,f = 0,1986", a.UC_G_f, 0.1986);
  gelijk("UC_G,r = 0,2639", a.UC_G_r, 0.2639);
  gelijk("UC_G = 0,3921", a.UC_G, 0.3921);

  // Dezelfde uitkomsten uit de onafhankelijke uitwerking hierboven.
  const b = 71, h = 221, hf = 18, be = 521, nE = 3000 / 11000, nFin = nE * 1.6 / 2.5;
  const dl = tDoorsnede(b, h, hf, be, nFin), df = tDoorsnede(b, h, hf, be, nE);
  const M = a.M_Ed_v, V = a.V_z_Ed;
  const sl = spanningen(dl, b, h, hf, nFin, M, V), sf = spanningen(df, b, h, hf, nE, M, V);
  gelijk("JS: (6.17)", a.UC_lijf_v, sl.sN / (0.8 * 14.5 / 1.3) + sl.sM / (0.8 * 24 / 1.3), { rel: 1e-4 });
  gelijk("JS: (9.13)", a.UC_f_c, sf.sF / (0.7 * 12.7 / 1.2), { rel: 1e-4 });
  gelijk("JS: τ_d balk", a["τ_d"], sl.tauW, { rel: 1e-3 });
  gelijk("JS: τ_r,d lijmnaad", a["τ_r_d"], sf.tauR, { rel: 1e-3 });
  // Kruip: E-moduli per materiaal gedeeld door (1 + c·k_def), c = 1 en c = ψ_2.
  const EIc = (c) => (11000 / (1 + c * 0.6)) * tDoorsnede(b, h, hf, be, nE * (1 + c * 0.6) / (1 + c * 1.5)).I;
  const EI0 = 11000 * df.I;
  const kdef = Math.max(EI0 / EIc(1) - 1, (EI0 / EIc(0.3) - 1) / 0.3);
  gelijk("JS: k_def,ef", a.k_def_ef, kdef, { rel: 1e-4 });

  waar("het blad meldt: nog te controleren", /Nog te controleren: de toetsing van de T-balk is nog niet nagerekend/.test(tekst));
  // Stijfheid (7.3): w = k_r·1 kN·L³/(48·EI_ef) = 781,96·5050³/(48·1,0487e12)
  //   = 2,0006 mm/kN tegen a = 1 → maatgevend (rechthoekig: 2,987).
  gelijk("UC_tril_a = w/F met EI_ef = 2,0006", a.UC_tril_a, 2.0006);
  gelijk("UC_max = UC_trilling", a.UC_max, a.UC_trilling, { rel: 0, abs: 1e-9 });
  waar("de slotzin: voldoet niet", /Balklaag voldoet niet/.test(slotzin(tekst)));
  waar("de verlijmde verbinding staat bij de aannames", /Aangenomen bij de T-balk: de vloerplaat is over de volle lengte op de balk gelijmd/.test(tekst));
  // OSB/3 met de hoofdas evenwijdig aan de balken: de waarden langs de hoofdas.
  const ev = reken({ ...T_OSB, plaat: "3" }).alle;
  gelijk("hoofdas ∥: f_f,c,k = 15,4, E_f = 3800", ev.f_f_c_k + ev.E_f / 1000, 15.4 + 3.8, { rel: 0, abs: 1e-9 });
  // Klimaatklasse 2: k_mod = 0,55, k_def = 2,25 (OSB/3).
  const k2 = reken({ ...T_OSB, klimaat: "2" }).alle;
  gelijk("klimaatklasse 2: k_mod,f = 0,55", k2.k_mod_f, 0.55, { rel: 0, abs: 1e-9 });
  gelijk("klimaatklasse 2: k_def,f = 2,25", k2.k_def_f, 2.25, { rel: 0, abs: 1e-9 });
}

// ── 2. Twee velden: getrokken flens bij het steunpunt ────────────────────

console.log("\n2. Twee velden 4,00 + 4,00 m, OSB/3 ⊥ 18 mm — de plaat getrokken bij het tussensteunpunt");
{
  // l bij het steunpunt = 0,25·(4000 + 4000) = 2000 mm → 0,15·2000 = 300 mm;
  //   b_t,ef = 300 (geen plaatplooi in een getrokken flens), b_ef,s = 371 mm.
  // In het veld l = 0,85·4000 = 3400 → 510; met 25·18 = 450: b_c,ef = 450.
  // Steunmoment 6.10b, beide velden vol: (1,2·0,66465 + 1,5·1,05)·4²/8 = 4,7452 kNm.
  // Plaat momentaan, b = 371: n·A_f = 1821,3, z = 116,07, I = 87 216 200 mm⁴;
  //   σ_f,t,d = 0,27273·4,7452e6·107,07/87,216e6 = 1,5888; f_f,t,d = 0,70·7,0/1,2
  //   = 4,0833 → (9.14) 0,3891.
  // Balk na volle kruip: n·A_f = 1165,6, z = 120,24, I = 79 389 400 mm⁴;
  //   σ_c,0,d = 4,7452e6·8,263/79,389e6 = 0,4939, σ_m,d = 6,6047;
  //   (6.19): (0,4939/12,923)² + 6,6047/14,769 = 0,4486; uiterste vezel
  //   (0,4939 + 6,6047)/14,769 = 0,4806 → UC_buiging = 0,4806.
  const { alle: a } = reken({ ...T_OSB, schema: "3", L_d: "3950", L_veld2: "4000" });
  gelijk("b_c,ef = 450 mm", a.b_c_ef, 450, { rel: 0, abs: 1e-6 });
  gelijk("b_t,ef = 0,15·2000 = 300 mm", a.b_t_ef, 300, { rel: 0, abs: 1e-6 });
  gelijk("b_ef,s = 371 mm", a.b_ef_s, 371, { rel: 0, abs: 1e-6 });
  gelijk("M_Ed,s = 4,7452 kNm", a.M_Ed_s, 4.7452);
  gelijk("σ_f,t,d = 1,5888", a["σ_f_t_d"], 1.5888);
  gelijk("UC_f,t = 0,3891 (9.14)", a.UC_f_t, 0.3891);
  gelijk("UC_lijf,s = 0,4486 (6.19)", a.UC_lijf_s, 0.4486);
  gelijk("UC_buiging = 0,4806", a.UC_buiging, 0.4806);
  // Lijmnaad met de grootste S_f/I van de twee breedtes, en V_z,Ed uit het blad.
  const dV = tDoorsnede(71, 221, 18, 521, 3 / 11), dS = tDoorsnede(71, 221, 18, 371, 3 / 11);
  const tau = (a.V_z_Ed * 1e3 * Math.max(dV.Sf / dV.I, dS.Sf / dS.I)) / 71;
  gelijk("τ_r,d = V·max(S_f/I)/b_w", a["τ_r_d"], tau, { rel: 1e-3 });
  // Overstek 1,20 m: l bij het steunpunt = 2·a = 2400 → 0,15·2400 = 360, b_ef,s = 431.
  const o = reken({ ...T_OSB, schema: "2", L_d: "3950", a_over: "1200" }).alle;
  gelijk("overstek: b_ef,s = 431 mm", o.b_ef_s, 431, { rel: 0, abs: 1e-6 });
}

// ── 3. Multiplex, brede balk op een dunne plaat ──────────────────────────

console.log("\n3. Multiplex 9 mm (buitenfineer ⊥), balk 96×221 h.o.h. 600 — testinvoer f_c 13, f_t 11, f_r 0,9, E 4500");
{
  // Tabel 9.1, multiplex ⊥: 0,1·l en 25·h_f. b_f = 600 − 96 = 504 mm;
  //   0,1·5050 = 505; 25·9 = 225 → b_c,ef = 225, b_ef = 321 mm.
  // §9.1.2(5): 504/(2·225) = 1,12 > 1 → voldoet niet (nader plooionderzoek).
  // (9.12): b_w = 96 > 8·9 = 72 → (72/96)^0,8 = 0,79425.
  // Multiplex: k_mod = die van massief hout (0,80), k_def = 0,80 (kk 1), γ_M = 1,2.
  const inv = { doorsnede: "2", plaat: "2", profiel: "17", t_vloer: "9", f_f_c_k: "13", f_f_t_k: "11", f_r_k: "0.9", E_f: "4500" };
  const { alle: a, tekst } = reken(inv);
  gelijk("b_c,ef = 225 mm", a.b_c_ef, 225, { rel: 0, abs: 1e-6 });
  gelijk("UC_bf = 504/450 = 1,12", a.UC_bf, 1.12);
  waar("§9.1.2(5) voldoet niet en telt mee", a.UC_max >= 1.12 - 1e-9 && /nader onderzoek naar plaatplooi/.test(tekst));
  gelijk("k_bw = (72/96)^0,8 = 0,79425", a.k_bw, 0.79425);
  gelijk("k_mod,f = k_mod = 0,80", a.k_mod_f, 0.8, { rel: 0, abs: 1e-9 });
  gelijk("k_def,f = 0,80", a.k_def_f, 0.8, { rel: 0, abs: 1e-9 });
  gelijk("γ_M,f = 1,2", a["γ_M_f"], 1.2, { rel: 0, abs: 1e-9 });
  const d = tDoorsnede(96, 221, 9, 321, 4500 / 11000);
  const tau = (a.V_z_Ed * 1e3 * d.Sf) / (d.I * 96);
  gelijk("UC_lijm = τ_r,d/(0,79425·0,8·0,9/1,2)", a.UC_lijm, tau / (0.79425 * 0.8 * 0.9 / 1.2), { rel: 1e-3 });
}

// ── 4. Spaanplaat: k_mod en k_def als invoer ─────────────────────────────

console.log("\n4. Spaanplaat 22 mm — testinvoer f_c 10, f_t 7, f_r 1,5, E 2500, k_mod 0,70, k_mod,G 0,40, k_def 2,25");
{
  // Tabel 9.1, spaan-/vezelplaat: 0,2·l en 30·h_f → min(529; 1010; 660) = 529,
  //   b_ef = 600 mm. f_f,c,d = 0,70·10/1,3 = 5,3846 (γ_M = 1,3, tabel 2.3).
  const inv = { doorsnede: "2", plaat: "5", t_vloer: "22", f_f_c_k: "10", f_f_t_k: "7", f_r_k: "1.5", E_f: "2500",
    k_mod_f: "0.7", k_mod_G_f: "0.4", k_def_f: "2.25" };
  const a = reken(inv).alle;
  gelijk("b_c,ef = b_f = 529 mm", a.b_c_ef, 529, { rel: 0, abs: 1e-6 });
  gelijk("k_sv = 0,2", a.k_sv, 0.2, { rel: 0, abs: 1e-9 });
  gelijk("k_pl = 30", a.k_pl, 30, { rel: 0, abs: 1e-9 });
  gelijk("γ_M,f = 1,3", a["γ_M_f"], 1.3, { rel: 0, abs: 1e-9 });
  gelijk("f_f,c,d = 0,70·10/1,3 = 5,3846", a.f_f_c_d, 5.3846);
  gelijk("n_fin = (2500/11000)·1,6/3,25", a.n_fin, (2500 / 11000) * 1.6 / 3.25);
}

// ── 5. Onvolledige of ongeldige plaatgegevens ───────────────────────────

console.log("\n5. Plaatgegevens onvolledig of buiten het bereik: niet getoetst, verder als rechthoekige balk");
{
  const recht = reken({}).alle;
  for (const [naam, inv] of [
    ["multiplex zonder fabrikantgegevens", { doorsnede: "2", plaat: "1" }],
    ["OSB/3 30 mm (buiten 6 < t ≤ 25)", { ...T_OSB, t_vloer: "30" }],
    ["OSB/3 in klimaatklasse 3", { ...T_OSB, klimaat: "3" }],
    ["spaanplaat zonder k_mod", { doorsnede: "2", plaat: "5", f_f_c_k: "10", f_f_t_k: "7", f_r_k: "1.5", E_f: "2500" }],
  ]) {
    const r = reken(inv);
    const zin = slotzin(r.tekst);
    waar(`${naam}: slotzin "niet getoetst"`, /niet getoetst: gegevens van de vloerplaat/.test(zin) && !/voldoet/.test(zin), zin.slice(0, 70));
    if (naam.startsWith("multiplex")) {
      gelijk(`${naam}: w_fin als rechthoekige balk`, r.alle.w_fin, recht.w_fin, { rel: 1e-12, abs: 0 });
      gelijk(`${naam}: UC_buiging als rechthoekige balk`, r.alle.UC_buiging, recht.UC_buiging, { rel: 1e-12, abs: 0 });
    }
  }
}

// ── 6. Onderslag en raveelbalk: geen T-balk ─────────────────────────────

console.log("\n6. T-balk gekozen bij een onderslag of raveelbalk: rekent als de rechthoekige balk");
{
  for (const [naam, inv] of [
    ["onderslag", { ligger: "2", b_ond: "2.5", L_d: "3000", a_opl: "100" }],
    ["raveelbalk", { schema: "4", b_sparing: "2400", l_staart: "1800", a_opl: "100" }],
  ]) {
    const recht = reken(inv), t = reken({ ...inv, ...T_OSB });
    const namen = Object.keys(recht.alle);
    const anders = namen.filter((k) => recht.alle[k] !== t.alle[k]);
    waar(`${naam}: alle ${namen.length} uitkomsten gelijk`, anders.length === 0, anders.slice(0, 5).join(", "));
    waar(`${naam}: het blad meldt dat de T-balk hier niet geldt`, /De T-balk \(§9\.1\.2\) geldt voor een balk in een balklaag/.test(t.tekst));
  }
}

// ── 7. Standaard en beeld ───────────────────────────────────────────────

console.log("\n7. De rechthoekige balk is de standaard; het beeld kent de keuzes");
{
  const zonder = reken({}), met = reken({ doorsnede: "1" });
  waar("zonder keuze rekent het blad als rechthoekige balk", !("b_ef" in zonder.alle) && !("UC_flens" in zonder.alle));
  waar("doorsnede = 1 geeft dezelfde uitkomsten", Object.keys(zonder.alle).every((k) => zonder.alle[k] === met.alle[k]));
  const bron = readFileSync(join(hier, "../packages/desktop/src/components/calc/BalklaagDesigner.tsx"), "utf8");
  const blok = bron.match(/const DEFAULTS[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? "";
  waar("startwaarde doorsnede = 1 (rechthoekig)", /\bdoorsnede:\s*1\b/.test(blok));
  waar("startwaarde plaat = 4 (OSB/3, hoofdas ⊥)", /\bplaat:\s*4\b/.test(blok));
  // Geen verzonnen standaardwaarden voor de fabrikantgegevens.
  for (const k of ["f_f_c_k", "f_f_t_k", "f_r_k", "E_f", "k_mod_f", "k_mod_G_f", "k_def_f"]) {
    waar(`geen startwaarde voor ${k} (fabrikantgegeven)`, !new RegExp(`\\b${k}:`).test(blok));
  }
}

afronden(fouten, "Balklaag — T-balk");
