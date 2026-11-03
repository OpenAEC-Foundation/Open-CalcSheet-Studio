/**
 * Controlescript voor de wisselbalk bij een raveelbalk (§8a van de balklaag), en voor
 * wat er bij die ronde in het hele blad bijkwam: tekens en eenheden in de lijnen en de
 * tekening vooraan.
 *
 *   1  een geval met de hand nagerekend, in kN, m en mm;
 *   2  hetzelfde geval met de ligger-oplosser uit de kern, als onafhankelijke controle
 *      van M, V, reacties en doorbuiging;
 *   3  een tweede raveelbalk, een puntlast buiten het midden, een eigen sterkteklasse,
 *      de vrije puntlast als maatgevende last, en een raveelbalk buiten de overspanning;
 *   4  elke UC telt mee in UC_max; de andere schema's kennen de wisselbalk niet;
 *   5  de tekens in de vlakken en de eenheden bij de waarden, in elke lijn;
 *   6  de tekening staat vooraan, en dat verandert geen uitkomst.
 *
 * Draaien:  node scripts/check-balklaag-wisselbalk.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { parse, evaluate, render, liggerOplossing, liggerReacties, liggerExtremen, liggerInterpoleer } from "../packages/core/dist/index.js";
import { laadTemplate } from "./lib/refcheck.mjs";

const ast = parse(laadTemplate("balklaag.ts"));
const PROJECT = { CC: 2, K_FI: 1, rekenwijze: 0 };

/** 71×221 C24 h.o.h. 600, klimaatklasse 1, middellang; categorie B: ψ_0 = 0,5, ψ_2 = 0,3. */
const BASIS = {
  profiel: "12", sterkteklasse: "2", klimaat: "1", duurklasse: "2", schema: "4", ligger: "1", doorsnede: "1",
  L_d: "5000", a_opl: "50", hoh: "600", t_vloer: "18", E_beschot: "7000", b_vloer: "3",
  G_k: "1.0", Q_k: "1.75", F_k: "2", belastingcat: "2", controleer: "1", grensfactor: "0.004", grens_bij: "0.003",
  controleer_trilling: "1", "ζ": "0.01", a_tril: "1", b_tril: "120", g_bl: "0", a_steun: "0",
  a_over: "0", L_veld2: "0", b_ond: "0", b_zelf: "0", h_zelf: "0", "ψ_0_zelf": "0", "ψ_2_zelf": "0",
  b_sparing: "2400", l_staart: "1800", l_sparing: "0", L_w: "0", b_w: "71", h_w: "246", n_w: "2", klasse_w: "0",
};

const getal = (s) => parseFloat(String(s).replace(",", "."));
function reken(invoer = {}, project = PROJECT) {
  const nodes = evaluate(ast, { ...BASIS, ...invoer }, project);
  const alle = {};
  const loop = (lijst) => {
    for (const n of lijst) {
      if (n.type === "assignment" || n.type === "var-display") {
        const w = typeof n.waarde === "number" ? n.waarde : getal(n.result);
        if (Number.isFinite(w)) alle[n.name] = w;
      }
      if (Array.isArray(n.children)) loop(n.children);
    }
  };
  loop(nodes);
  return { nodes, alle, html: render(nodes) };
}

let fouten = 0;
const toon = (v) => (v === undefined || !Number.isFinite(v) ? String(v ?? "—") : String(Number(v.toPrecision(6))));
function gelijk(label, ons, doel, rel = 1e-3) {
  const ok = Number.isFinite(ons) && Math.abs(ons - doel) <= rel * Math.abs(doel) + 1e-9;
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${label.padEnd(46)} blad ${toon(ons).padStart(10)}   verwacht ${toon(doel)}`);
}
function waar(label, ok, detail = "") {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${label}${!ok && detail ? `  -> ${detail}` : ""}`);
}

// ── 1. De handberekening ──────────────────────────────────────────────────
console.log("\n1. Met de hand: wisselbalk 2×71×246 C24, L = 5,05 m, raveelbalk op a = 1,80 m");
const r = reken();
const a = r.alle;
// De raveelbalk, 71×221 over L_th = 2400 + 50 = 2450 mm, belaste breedte 1800/2 = 900 mm:
//   g_balk = 0,071·0,221·420·9,81/1000                = 0,06465 kN/m
//   P_g,k  = 0,900·1,00 + 0,06465                     = 0,96465 kN/m
//   q_q,k  = 0,900·1,75                               = 1,575 kN/m
//   F_G    = 0,96465·2,45/2                           = 1,18170 kN
//   F_Q    = 1,575·2,45/2                             = 1,92938 kN
gelijk("P_g,k = 0,96465 kN/m", a.P_g_k, 0.96465);
gelijk("q_q,k = 1,575 kN/m", a.q_q_k, 1.575);
gelijk("F_G,w = 1,1817 kN, oplegreactie permanent", a.F_G_w, 1.1817);
gelijk("F_Q,w = 1,92938 kN, oplegreactie veranderlijk", a.F_Q_w, 1.92938);
// De wisselbalk: 2×71 = 142 mm breed, 246 mm hoog, strook h.o.h. = 0,600 m:
//   A   = 142·246                                     = 34 932 mm²
//   g_w = 0,034932·420·9,81/1000                      = 0,14393 kN/m
//   w_G = 0,600·1,00 + 0,14393                        = 0,74393 kN/m
//   w_Q = 0,600·1,75                                  = 1,050 kN/m
gelijk("L_w,th = L_d + a_opl = 5050 mm", a.L_w_th, 5050);
gelijk("b_w,t = 2·71 = 142 mm", a.b_w_t, 142);
gelijk("w_G,w = 0,74393 kN/m", a.w_G_w, 0.74393);
gelijk("w_Q,w = 1,050 kN/m", a.w_Q_w, 1.05);
// UGT 6.10b, maatgevend: γ_G = 1,2 en γ_Q = 1,5, L = 5,05 m, a = 1,80 m, b = 3,25 m:
//   w   = 1,2·0,74393 + 1,5·1,05                      = 2,46772 kN/m
//   P   = 1,2·1,1817 + 1,5·1,92938                    = 4,31211 kN
//   R_A = w·L/2 + P·b/L = 6,23099 + 2,77515           = 9,00614 kN
//   R_B = w·L/2 + P·a/L = 6,23099 + 1,53699           = 7,76798 kN
//   rechts van de puntlast: V = 9,00614 − 2,46772·1,8 − 4,31211 = 0,25213 kN > 0,
//   dus de top ligt op x = (9,00614 − 4,31211)/2,46772 = 1,90220 m
//   M   = 9,00614·1,9022 − 2,46772·1,9022²/2 − 4,31211·0,1022 = 12,2263 kNm
gelijk("M_Ed,w = 12,2263 kNm", a.M_Ed_w, 12.2263);
gelijk("R_A,w = V_Ed,w = 9,00614 kN", a.R_A_w, 9.00614);
gelijk("R_B,w = 7,76798 kN", a.R_B_w, 7.76798);
gelijk("V_Ed,w = 9,00614 kN", a.V_Ed_w, 9.00614);
// Toetsen, k_mod = 0,80, γ_M = 1,3, k_h = 1 (h = 246 ≥ 150):
//   f_m,d = 0,8·24/1,3 = 14,7692; W = 142·246²/6 = 1 432 212 mm³;
//   UC_m  = 12,2263·10⁶/(1 432 212·14,7692)            = 0,57800
//   f_v,d = 0,8·4,0/1,3 = 2,46154;
//   UC_v  = 1,5·9006,14/(34 932·2,46154)               = 0,15711
//   f_c,90,d = 0,8·2,5/1,3 = 1,53846; k_c,90 = 1,5; A_c = 142·(50 + 30) = 11 360 mm²;
//   UC_c  = 9006,14/(11 360·1,5·1,53846)               = 0,34354
gelijk("UC_w,m = 0,57800", a.UC_w_m, 0.578);
gelijk("UC_w,v = 0,15711", a.UC_w_v, 0.15711);
gelijk("UC_w,c90 = 0,34354", a.UC_w_c90, 0.34354);
// Alleen permanent, 6.10a: γ_G,a = 1,35, k_mod,G = 0,60:
//   R_A = 0,74393·2,525 + 1,1817·3,25/5,05 = 2,63892 kN; V rechts van de last 0,11814 kN,
//   dus x = 1,8 + 0,11814/0,74393 = 1,95880 m; M = 5,16912 − 1,42719 − 0,18765 = 3,55428 kNm;
//   UC_m = 1,35·3,55428·10⁶/(1 432 212·0,6·24/1,3)     = 0,30245; afschuiving en oplegdruk lager
gelijk("UC_w,G = 0,30245", a.UC_w_G, 0.30245);
// BGT, EI = 11000·142·246³/12 = 1,93778·10¹² N·mm² = 1937,78 kNm², k_def = 0,6, ψ_2 = 0,3.
// In de norm-stand: de vrije puntlast telt als hij de grootste eindstand geeft; hier niet:
//   F·L³/(48·EI) = 2·5,05³·1000/(48·1937,78) = 2,76 mm tegen ruim 8 mm onder de verdeelde last.
// De eindstand ligt op de top van de lijn; de waarden staan bij het draaien hieronder.
const EI = (11000 * 142 * 246 ** 3) / 12 / 1e9; // kNm²
gelijk("EI = 1937,78 kNm²", EI, 1937.78, 1e-4);
const zakking = (x, w, F, a1, L) => {
  const b = L - a1;
  const up = x <= a1 ? (F * b * x * (L * L - b * b - x * x)) / (6 * L) : (F * a1 * (L - x) * (L * L - a1 * a1 - (L - x) * (L - x))) / (6 * L);
  return (1000 / EI) * ((w * x * (L ** 3 - 2 * L * x * x + x ** 3)) / 24 + up);
};
const uF = (x) => (1.6 * zakking(x, 0.74393, 1.1817, 1.8, 5.05)) + (1.18 * zakking(x, 1.05, 1.92938, 1.8, 5.05));
let xTop = 0;
for (let x = 0; x <= 5.05; x += 0.0005) if (uF(x) > uF(xTop)) xTop = x;
const uG = zakking(xTop, 0.74393, 1.1817, 1.8, 5.05);
const uQ = zakking(xTop, 1.05, 1.92938, 1.8, 5.05);
gelijk("u_g,w, formule op de top", a.u_g_w, uG, 2e-3);
gelijk("u_var,w, formule op de top", a.u_var_w, uQ, 2e-3);
gelijk("w_fin,w = 1,6·u_g + 1,18·u_q", a.w_fin_w, 1.6 * uG + 1.18 * uQ, 2e-3);
gelijk("w_bij,w = w_fin − u_g", a.w_bij_w, 0.6 * uG + 1.18 * uQ, 2e-3);
gelijk("UC_w,fin = w_fin/(0,004·5050)", a.UC_w_fin, (1.6 * uG + 1.18 * uQ) / 20.2, 2e-3);
gelijk("UC_w,bij = w_bij/(0,003·5050)", a.UC_w_bij, (0.6 * uG + 1.18 * uQ) / 15.15, 2e-3);
gelijk("UC_wb = de grootste", a.UC_wb, Math.max(a.UC_w_m, a.UC_w_v, a.UC_w_c90, a.UC_w_G, a.UC_w_fin, a.UC_w_bij), 1e-9);
console.log(`       x = ${xTop.toFixed(3)} m: u_g = ${uG.toFixed(3)} mm, u_q = ${uQ.toFixed(3)} mm, w_fin = ${(1.6 * uG + 1.18 * uQ).toFixed(3)} mm`);

// ── 2. De ligger-oplosser uit de kern ─────────────────────────────────────
console.log("\n2. Dezelfde ligger met de oplosser uit de kern (verplaatsingsmethode)");
/** Een ligger op twee steunpunten met de lasten uit het blad en factoren per belasting. */
function metOplosser(L, a1, a2, w, F1, F2, EIw) {
  const geo = [[0, 1], [L, 1]];
  const last = [[1, 0, L, w, w], [2, a1, 0, F1, 0], ...(F2 ? [[2, a2, 0, F2, 0]] : [])];
  const R = liggerOplossing(geo, last, EIw, undefined, 0, [a1, a2]);
  const RR = liggerReacties(geo, last, EIw);
  // Kolommen van de uitkomst: 1 = x, 2 = V, 3 = M, 4 = w (in m bij kN, m en kNm²).
  return { R, RR, M: liggerExtremen(R, 3)[0], Ra: RR[0][1], Rb: RR[1][1], w: liggerExtremen(R, 4)[0] };
}
{
  const fG = 1.2, fQ = 1.5;
  const ug = metOplosser(5.05, 1.8, 5.05, fG * a.w_G_w + fQ * a.w_Q_w, fG * a.F_G_w + fQ * a.F_Q_w, 0, EI);
  gelijk("M_Ed,w tegen de oplosser", a.M_Ed_w, ug.M);
  gelijk("R_A,w tegen de oplosser", a.R_A_w, ug.Ra);
  gelijk("R_B,w tegen de oplosser", a.R_B_w, ug.Rb);
  gelijk("V_Ed,w tegen V(0) van de oplosser", a.V_Ed_w, liggerInterpoleer(ug.R, 2, 0));
  // BGT: de zakking op dezelfde plek, los per belasting.
  const lastG = metOplosser(5.05, 1.8, 5.05, a.w_G_w, a.F_G_w, 0, EI);
  const lastQ = metOplosser(5.05, 1.8, 5.05, a.w_Q_w, a.F_Q_w, 0, EI);
  const xs = Array.from({ length: 2021 }, (_, i) => (5.05 * i) / 2020);
  const fin = xs.map((x) => 1.6 * liggerInterpoleer(lastG.R, 4, x) + 1.18 * liggerInterpoleer(lastQ.R, 4, x));
  gelijk("w_fin,w tegen de oplosser (mm)", a.w_fin_w, Math.max(...fin) * 1000, 2e-3);
  console.log(`       oplosser: M = ${ug.M.toFixed(4)} kNm, R_A = ${ug.Ra.toFixed(4)} kN, R_B = ${ug.Rb.toFixed(4)} kN, w_fin = ${(Math.max(...fin) * 1000).toFixed(3)} mm`);
}

// ── 3. Andere gevallen ────────────────────────────────────────────────────
console.log("\n3. Tweede raveelbalk, midden, eigen klasse, vrije puntlast, buiten de overspanning");
{
  // Tweede raveelbalk: staart aan de andere kant 5050 − 1200 − 2400 = 1450 mm. De raveelbalk
  // wordt getoetst met de langste staart; de puntlasten hebben elk hun eigen staart.
  const t = reken({ l_staart: "1200", l_sparing: "2400" }).alle;
  gelijk("twee: l_staart,2 geeft P_g,2", t.P_g_2, (1.45 / 2) * 1.0 + 0.06465);
  gelijk("twee: F_Q,w = 1,2/2·1,75·2,45/2", t.F_Q_w, (0.6 * 1.75 * 2.45) / 2);
  gelijk("twee: F_Q,w,2 = 1,45/2·1,75·2,45/2", t.F_Q_w_2, (0.725 * 1.75 * 2.45) / 2);
  gelijk("twee: b_belast = de helft van de langste staart", t.b_belast, 725);
  const w = 1.2 * t.w_G_w + 1.5 * t.w_Q_w;
  const o = metOplosser(5.05, 1.2, 3.6, w, 1.2 * t.F_G_w + 1.5 * t.F_Q_w, 1.2 * t.F_G_w_2 + 1.5 * t.F_Q_w_2, EI);
  gelijk("twee: M_Ed,w tegen de oplosser", t.M_Ed_w, o.M);
  gelijk("twee: R_A,w tegen de oplosser", t.R_A_w, o.Ra);
  gelijk("twee: R_B,w tegen de oplosser", t.R_B_w, o.Rb);

  // Een puntlast precies in het midden: de bekende formules.
  const m = reken({ l_staart: "2525" }).alle;
  const Pm = 1.2 * m.F_G_w + 1.5 * m.F_Q_w;
  const wm = 1.2 * m.w_G_w + 1.5 * m.w_Q_w;
  gelijk("midden: M = wL²/8 + PL/4", m.M_Ed_w, (wm * 5.05 ** 2) / 8 + (Pm * 5.05) / 4);
  gelijk("midden: R = wL/2 + P/2", m.R_A_w, (wm * 5.05) / 2 + Pm / 2);

  // De vrije puntlast maatgevend: zware F_k en geen vloerlast. 6.10b: 1,2·G + 1,5·F·x(L−x)/L.
  const f = reken({ F_k: "30", Q_k: "0", b_w: "96", h_w: "271", n_w: "2" }).alle;
  gelijk("vrije puntlast: V_Ed,w = R_G + 1,5·F", f.V_Ed_w, 1.2 * (f.w_G_w * 5.05 / 2 + f.F_G_w * 3.25 / 5.05) + 1.5 * 30);
  const fG = metOplosser(5.05, 1.8, 5.05, 1.2 * f.w_G_w, 1.2 * f.F_G_w, 0, 1000);
  let mx = 0;
  for (let i = 0; i <= 96; i++) { const x = (5.05 * i) / 96; mx = Math.max(mx, liggerInterpoleer(fG.R, 3, x) + (1.5 * 30 * x * (5.05 - x)) / 5.05); }
  gelijk("vrije puntlast: M_Ed,w = omhullende (96 punten)", f.M_Ed_w, mx, 1e-3);

  // Een eigen sterkteklasse: C30 op de wisselbalk, C24 op de balklaag.
  const c = reken({ klasse_w: "3" }).alle;
  gelijk("C30: f_m,d,w = 0,8·30/1,3", c.f_m_d_w, (0.8 * 30) / 1.3);
  gelijk("C30: f_v,d,w = 0,8·4,0/1,3", c.f_v_d_w, (0.8 * 4) / 1.3);
  waar("C30: eigen dichtheid in het eigen gewicht", c.w_G_w > a.w_G_w, `${c.w_G_w} tegen ${a.w_G_w}`);
  waar("C30: de balklaag zelf blijft C24", Math.abs(c.f_m_d - a.f_m_d) < 1e-9);

  // Een lage wisselbalk: de hoogtefactor k_h op de eigen hoogte.
  const l = reken({ h_w: "120" }).alle;
  gelijk("h = 120: k_h,w = (150/120)^0,2", l.k_h_w, (150 / 120) ** 0.2);

  // Leeg of 0: de doorsnede en de overspanning van de balklaag.
  const leeg = reken({ b_w: "0", h_w: "0", L_w: "0" }).alle;
  gelijk("leeg: b_w,t = 2·b_balk", leeg.b_w_t, 142);
  gelijk("leeg: h_w,e = h_balk", leeg.h_w_e, 221);
  const eigen = reken({ L_w: "6000" }).alle;
  gelijk("eigen overspanning L_w = 6000 mm", eigen.L_w_th, 6000);

  // Een raveelbalk buiten de overspanning: niet getoetst, nooit "voldoet".
  const b = reken({ l_staart: "6000" });
  waar("buiten de overspanning: de melding", /ligt niet op de overspanning/.test(b.html.replace(/<[^>]+>/g, " ")));
  const zin = b.html.replace(/<[^>]+>/g, " ");
  waar("buiten de overspanning: het eindoordeel is niet getoetst", /Balklaag niet getoetst/.test(zin) && !/Balklaag voldoet/.test(zin));
  const d = reken({ l_sparing: "5000" });
  waar("een sparing tot voorbij de oplegging: één raveelbalk, met een melding", /rekent met één raveelbalk/.test(d.html.replace(/<[^>]+>/g, " ")) && !d.alle.F_G_w_2);
  const geenB = reken({ controleer: "0" }).alle;
  waar("zonder doorbuigingstoets: UC_wb zonder doorbuiging", geenB.UC_wb === Math.max(geenB.UC_w_m, geenB.UC_w_v, geenB.UC_w_c90, geenB.UC_w_G));
}

// ── 4. In de maatgevende UC, en alleen bij schema 4 ───────────────────────
console.log("\n4. De maatgevende UC");
{
  const zwaar = reken({ h_w: "120", n_w: "1" });
  waar("een te slappe wisselbalk stuurt UC_max", zwaar.alle.UC_max === zwaar.alle.UC_wb && zwaar.alle.UC_wb > 1, `${zwaar.alle.UC_max} / ${zwaar.alle.UC_wb}`);
  waar("en het eindoordeel volgt", /Balklaag voldoet niet/.test(zwaar.html.replace(/<[^>]+>/g, " ")));
  const ruim = reken({ b_w: "96", h_w: "271" });
  waar("een ruime wisselbalk stuurt UC_max niet", ruim.alle.UC_max > ruim.alle.UC_wb, `${ruim.alle.UC_max} / ${ruim.alle.UC_wb}`);
  for (const schema of ["1", "2", "3"]) {
    const s = reken({ schema, a_over: "900", L_veld2: "3000" });
    waar(`schema ${schema}: geen §8a in de uitwerking`, !/8a\. Wisselbalk/.test(s.html) && !("UC_wb" in s.alle) && !("L_w_th" in s.alle));
  }
}

// ── 5. Tekens en eenheden in de lijnen ────────────────────────────────────
console.log("\n5. Tekens in de vlakken, eenheden bij de waarden");
{
  const tekstenVan = (svg) => [...svg.matchAll(/<text\b[^>]*\by="([^"]+)"[^>]*>([^<]*)<\/text>/g)].map((t) => ({ y: Number(t[1]), tekst: t[2] }));
  const assen = (svg) => [...svg.matchAll(/<line x1="[^"]+" y1="([^"]+)" x2="[^"]+" y2="([^"]+)" style="stroke:#374151/g)].filter((m) => m[1] === m[2]).map((m) => Number(m[1]));
  for (const [naam, invoer] of Object.entries({
    "schema 1": { schema: "1" },
    "overstek": { schema: "2", a_over: "1200" },
    "twee velden": { schema: "3", L_veld2: "3000" },
    "raveelbalk": { schema: "4" },
  })) {
    const { html } = reken(invoer);
    const kaarten = html.match(/<svg class="bg-kaart"[\s\S]*?<\/svg>/g) ?? [];
    const groepen = [...kaarten, ...(html.match(/<svg class="(?:omhullende|wisselbalk-lijnen)"[\s\S]*?<\/svg>/g) ?? [])];
    let zonderEenheid = 0, plus = 0, min = 0, verkeerd = 0;
    for (const svg of groepen) {
      const [asM, asV] = assen(svg);
      const titelV = tekstenVan(svg).find((t) => /^V(-lijn)?( |$)/.test(t.tekst))?.y ?? asV;
      for (const t of tekstenVan(svg)) {
        if (/^-?\d+(\.\d+)?$/.test(t.tekst.trim())) zonderEenheid++;
        if (t.tekst === "+" || t.tekst === "−") {
          if (t.tekst === "+") plus++; else min++;
          // Het moment staat aan de trekzijde: positief onder de as. De dwarskracht positief erboven.
          const inM = t.y < titelV - 2;
          const onder = t.y > (inM ? asM : asV);
          if (inM ? (t.tekst === "+") !== onder : (t.tekst === "+") === onder) verkeerd++;
        }
      }
    }
    waar(`${naam}: ${groepen.length} tekeningen, elke waarde met een eenheid`, zonderEenheid === 0, `${zonderEenheid} zonder`);
    waar(`${naam}: ${plus} × + en ${min} × −, elk aan de goede kant van de as`, plus > 0 && min > 0 && verkeerd === 0, `${verkeerd} verkeerd`);
  }
  // Een veld dat omhoog buigt: geen + boven een negatief vlak.
  const { html } = reken({ schema: "3", L_d: "1500", L_veld2: "5000" });
  const kaart2 = (html.match(/<svg class="bg-kaart"[\s\S]*?<\/svg>/g) ?? [])[2] ?? "";
  waar("twee velden, belasting op het lange veld: de kaart van BG3 heeft een − in veld 1", /−<\/text>/.test(kaart2));
}

// ── 6. De tekening vooraan ────────────────────────────────────────────────
console.log("\n6. De tekening vooraan");
{
  const zonderCommentaar = laadTemplate("balklaag.ts");
  const eigen = parse(zonderCommentaar.slice(zonderCommentaar.indexOf('"Balklaag')));
  for (const [naam, invoer, delen] of [
    ["schema 1", { schema: "1" }, 1],
    ["twee velden", { schema: "3", L_veld2: "3000" }, 1],
    ["raveelbalk", { schema: "4" }, 2],
  ]) {
    const html = render(evaluate(eigen, { ...BASIS, ...invoer }, PROJECT));
    const titel = html.indexOf("<h1>Balklaag");
    const eerstVak = html.indexOf('<h1>1. Profiel');
    const tekeningen = [...html.slice(0, eerstVak).matchAll(/<svg class="vooraan/g)].length;
    waar(`${naam}: titel eerst, dan de tekening${delen > 1 ? "en" : ""}, dan §1`, titel >= 0 && titel < html.indexOf('<svg class="vooraan') && tekeningen === delen, `${tekeningen} tekeningen vooraan`);
    const invoerVeld = html.indexOf('class="calc-select');
    waar(`${naam}: vóór de invoer`, html.indexOf('<svg class="vooraan') < invoerVeld);
  }
  const met = reken({ schema: "1" }).alle;
  const kaal = reken({ schema: "1", toon_3d: "0" }).alle;
  waar("de plaats van de tekening verandert geen uitkomst", met.UC_max === kaal.UC_max);
}

console.log(fouten === 0 ? "\nWisselbalk: alles in orde." : `\n${fouten} controle(s) gezakt.`);
process.exit(fouten === 0 ? 0 : 1);
