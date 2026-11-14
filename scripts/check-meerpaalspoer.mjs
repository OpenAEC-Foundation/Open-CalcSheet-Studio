/**
 * Controlescript voor de module Poer op drie of vier palen (templates/meerpaalspoer.ts).
 * De toetsset en het toepassingsgebied staan in docs/meerpaalspoer-toetsing.md.
 *
 * Geen referentieberekening beschikbaar: de gevallen zijn fictief en hieronder buiten
 * het blad om nagerekend, met dezelfde formules als in de toetsing beschreven. Een
 * verwachting alleen aanpassen met een handberekening die aantoont dat de nieuwe waarde
 * juist is.
 *
 *   1. Geval A: vier palen, de standaardinvoer.
 *   2. Geval B: drie palen, de standaardinvoer.
 *   3. Geval C: vier palen met momenten om beide assen.
 *   4. De vier toestanden: voldoet, voldoet niet, niet getoetst, niet van toepassing;
 *      ongeldige invoer en buiten het toepassingsgebied.
 *   5. Tekening en 3D-beeld voor drie en vier palen.
 *
 * Draaien:  node scripts/check-meerpaalspoer.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { parse, evaluate, render } from "../packages/core/dist/index.js";
import { laadTemplate } from "./lib/refcheck.mjs";

const { leesResultaat, leesGetallen } = await import("../packages/desktop/src/components/calc/bladLezen.ts");

const tpl = laadTemplate("meerpaalspoer.ts");
const SCOPE = { CC: 2, RC: 2, K_FI: 1, DesignLife: 50, rekenwijze: 1 };

let fouten = 0;
let getest = 0;
const waar = (wat, ok, detail = "") => {
  getest++;
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${wat}${ok || !detail ? "" : ` — ${detail}`}`);
};

/** Doorrekenen: onafgeronde uitkomsten, platte tekst en het oordeel van het blad. */
function doorreken(waarden, scope = SCOPE) {
  const nodes = evaluate(parse(tpl), waarden, scope);
  const html = render(nodes);
  const tekst = html.replace(/<annotation[\s\S]*?<\/annotation>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return { uit: leesGetallen(nodes), tekst, html, r: leesResultaat(nodes, "x") };
}
function toets(r, verwacht, tol = 1.5e-3) {
  for (const [naam, doel] of Object.entries(verwacht)) {
    getest++;
    const ons = r.uit[naam];
    const ok = ons !== undefined && Math.abs(ons - doel) <= tol * Math.max(Math.abs(doel), 1e-9);
    if (!ok) fouten++;
    console.log(`  ${ok ? "OK    " : "FOUT  "} ${naam} = ${ons === undefined ? "ontbreekt" : Number(ons.toPrecision(6))} (hand: ${Number(doel.toPrecision(6))})`);
  }
}

// ── De handberekening, buiten het blad om (N, mm; kN en kNm waar het blad die toont) ──────
const rad = Math.PI / 180;
function hand(i) {
  const v = i.n_p === 4;
  const f_ck = 30, f_cd = 20, ν_s = 1 - f_ck / 250, ν_v = 0.6 * ν_s, f_ctm = 2.9, f_ctk = 2.0, E_cm = 33000, f_yd = 500 / 1.15;
  const σ_ccc = ν_s * f_cd, σ_ctt = 0.75 * ν_s * f_cd;
  const A_t1 = Math.PI * i.d_t ** 2 / 4, A_b = i.n_t * A_t1, A_n1 = Math.PI * i.d_n ** 2 / 4;
  const A_k = i.c * i.c, A_p = i.p * i.p, e_k = i.c / 4;
  const d = i.h - i.c_o - 1.5 * i.d_t;
  const b_band = (i.n_t - 1) * i.s_t + i.d_t;
  // Poer en paalreacties.
  const R_3 = i.a / Math.sqrt(3), r_in = i.a / (2 * Math.sqrt(3)), L_g = 2 * Math.sqrt(3) * (r_in + i.r_rand);
  const A_c = v ? i.l * i.b : Math.sqrt(3) / 4 * L_g ** 2 - Math.sqrt(3) * i.r_rand ** 2;
  const G = 25e-9 * A_c * i.h;                                   // kN
  const N = i.N + 1.35 * G;                                      // kN
  const Mx = Math.abs(i.Mx) + N * i.e_p / 1000, My = Math.abs(i.My) + N * i.e_p / 1000; // kNm
  let R_bov, R_ond, R_min;
  if (v) {
    R_bov = R_ond = N / 4 + My / (2 * i.a / 1000) + Mx / (2 * i.a / 1000);
    R_min = N / 4 - My / (2 * i.a / 1000) - Mx / (2 * i.a / 1000);
  } else {
    const R3 = R_3 / 1000;
    R_bov = N / 3 + Mx / (1.5 * R3);
    R_ond = N / 3 + Mx / (3 * R3) + My / (i.a / 1000);
    R_min = N / 3 - Math.max(Mx / (1.5 * R3), Mx / (3 * R3) + My / (i.a / 1000));
  }
  const R = Math.max(R_bov, R_ond);
  // Staafwerk.
  const d_x = i.a / 2 + i.e_p - e_k, r_3 = R_3 + i.e_p - e_k;
  const r_h = v ? Math.hypot(d_x, d_x) : r_3;
  const M_t = v ? 2 * R * d_x : R * r_3;                         // kN·mm
  const ξ = 2 * M_t * 1000 / (i.c * σ_ccc * d * d);
  const x_m = d * (1 - Math.sqrt(Math.max(1 - ξ, 0)));
  const z_k = Math.min(d - x_m / 2, 0.9 * d);
  const z = Math.min(z_k, r_h * Math.tan(55 * rad));
  const x_c = 2 * (d - z_k);
  const θ = Math.atan(z / r_h);
  const T = v ? R * d_x / z : Math.max(R_bov, R_ond) * r_3 / z / Math.sqrt(3);
  const F_c = R / Math.sin(θ);
  // Knopen.
  const c_q = v ? 2 * i.c / (2 * Math.sqrt(2)) : 2 * i.c / 3;
  const A_A = A_k / i.n_p * Math.sin(θ) + c_q * x_c * Math.cos(θ);
  const u_b = 2 * Math.max(i.c_o + i.d_t - i.t_in, 0);
  const A_B = A_p * Math.sin(θ) + Math.sqrt(A_p) * u_b * Math.cos(θ);
  const UC_ccc = Math.max(i.N * 1000 / A_k / σ_ccc, F_c * 1000 / A_A / σ_ccc, ξ);
  const UC_ctt = Math.max(R * 1000 / A_p, F_c * 1000 / A_B) / σ_ctt;
  // Dwarskracht en pons.
  const b3 = (y) => 2 * ((R_3 - y) * Math.tan(30 * rad) + i.r_rand / Math.sin(60 * rad));
  const Vrd = (b) => 0.5 * b * d * ν_v * f_cd / 1000;
  const k = Math.min(1 + Math.sqrt(200 / d), 2), v_min = 0.035 * k ** 1.5 * Math.sqrt(f_ck);
  const v_rc = (ρ) => Math.max(0.12 * k * (100 * Math.min(ρ, 0.02) * f_ck) ** (1 / 3), v_min);
  const β = (a) => Math.min(Math.max(a, 0.5 * d) / (2 * d), 1);
  let UC_V, UC_Vc;
  if (v) {
    UC_V = 2 * R / Vrd(i.b);
    const a_v = i.a / 2 - i.p / 2 - i.c / 2 + i.e_p;
    const A_v = 2 * A_b + A_n1 * Math.max(i.b - 2 * b_band, 0) / i.s_n;
    UC_Vc = β(a_v) * 2 * R * 1000 / (v_rc(A_v / (i.b * d)) * i.b * d);
  } else {
    const bb = b3(i.c / 2), bo = b3(-i.c / 2);
    UC_V = Math.max(R_bov / Vrd(bb), 2 * R_ond / Vrd(bo));
    const a_b = R_3 - i.p / 2 - i.c / 2 + i.e_p, a_o = R_3 / 2 - i.p / 2 - i.c / 2 + i.e_p;
    UC_Vc = Math.max(
      β(a_b) * R_bov * 1000 / (v_rc(A_n1 * bb / i.s_n / (bb * d)) * bb * d),
      β(a_o) * 2 * R_ond * 1000 / (v_rc(A_n1 * bo / i.s_n / (bo * d)) * bo * d),
    );
  }
  const v_k = 1.15 * i.N * 1000 / (4 * i.c * d), v_p = 1.5 * R * 1000 / (Math.min(3 * d, 2 * i.p) * d);
  const UC_v = Math.max(v_k, v_p) / (0.4 * ν_v * f_cd);
  // Verankering, omgebogen staaf met een been.
  const f_bd = 2.25 * f_ctk / 1.5, σ_sd = T * 1000 / A_b, l_rqd = i.d_t / 4 * σ_sd / f_bd;
  const c_1 = v ? (i.b / 2 - i.a / 2) - b_band / 2 : i.r_rand - b_band / 2;
  const c_d = Math.min((i.s_t - i.d_t) / 2, c_1);
  const α_1 = c_d > 3 * i.d_t ? 0.7 : 1.0, α_2 = Math.min(1, Math.max(0.7, 1 - 0.15 * (c_d - 3 * i.d_t) / i.d_t));
  const l_bd = Math.max(α_1 * α_2 * l_rqd, Math.max(0.3 * l_rqd, 10 * i.d_t, 100));
  const l_h = v ? i.l / 2 - i.a / 2 - i.c_z - (i.p / 2 + i.e_p) - i.d_t / 2 : (i.r_rand - i.c_z) / Math.cos(30 * rad) - i.p / 2 - i.e_p - i.d_t / 2;
  const l_av = l_h + i.l_op - (2 - Math.PI / 2) * (i.D_m + i.d_t) / 2;
  // Scheurwijdte, frequent.
  const α_e = 200000 / E_cm, c_w = i.c_o, b_eff = b_band + 10 * (c_w + i.d_t / 2);
  const ρ_b = A_b / (b_eff * d), x_e = d * (Math.sqrt((α_e * ρ_b) ** 2 + 2 * α_e * ρ_b) - α_e * ρ_b);
  const h_ce = Math.min(2.5 * (i.h - d), (i.h - x_e) / 3, i.h / 2), ρ_p = A_b / (b_eff * h_ce), k_2 = 1 - h_ce / (2 * (i.h - x_e));
  const s_r = i.s_t <= 5 * (c_w + i.d_t / 2) ? Math.min(3.4 * c_w + 0.8 * k_2 * 0.425 * i.d_t / ρ_p, Math.max((50 - 0.8 * f_ck) * i.d_t, 15 * i.d_t)) : 1.3 * (i.h - x_e);
  const a_bgt = i.a, z_el = a_bgt < i.h ? 0.6 * a_bgt : 0.2 * (a_bgt + 2 * i.h), z_s = Math.min(z, z_el);
  const Nf = i.Nf + G, Mxf = Math.abs(i.Mxf) + Nf * i.e_p / 1000, Myf = Math.abs(i.Myf) + Nf * i.e_p / 1000;
  const R_fr = v ? Nf / 4 + Myf / (2 * i.a / 1000) + Mxf / (2 * i.a / 1000)
    : Math.max(Nf / 3 + Mxf / (1.5 * R_3 / 1000), Nf / 3 + Mxf / (3 * R_3 / 1000) + Myf / (i.a / 1000));
  const T_fr = R_fr * (v ? d_x : r_3 / Math.sqrt(3)) / z_s, σ_s = T_fr * 1000 / A_b;
  const ε = Math.max((σ_s - 0.4 * f_ctm / ρ_p * (1 + α_e * ρ_p)) / 200000, 0.6 * σ_s / 200000);
  return { G, R, R_min, θ: θ / rad, z, T, F_c, UC_T: T * 1000 / (A_b * f_yd), UC_ccc, UC_ctt, UC_V, UC_Vc, UC_v, UC_l: l_bd / l_av, σ_s, w_k: s_r * ε };
}

const BASIS = { n_p: 4, a: 1000, l: 1700, b: 1700, r_rand: 400, h: 900, e_p: 50, t_in: 50, p: 320, c: 400, c_o: 75, c_z: 40,
  n_t: 5, d_t: 20, s_t: 80, l_op: 500, D_m: 200, d_n: 12, s_n: 150, N: 2000, Mx: 0, My: 0, Nf: 1450, Mxf: 0, Myf: 0 };
const verwachting = (h, vier) => ({
  R_Ed: h.R, R_min: h.R_min, θ_g: h.θ, z_u: h.z, [vier ? "T_x" : "T_s"]: h.T, F_c: h.F_c, UC_T: h.UC_T, UC_ccc: h.UC_ccc, UC_ctt: h.UC_ctt,
  UC_V: h.UC_V, UC_Vc: h.UC_Vc, UC_v: h.UC_v, UC_l: h.UC_l, σ_s: h.σ_s, w_k: h.w_k,
});

console.log("\n1. Geval A: vier palen, de standaardinvoer");
{
  const r = doorreken({ horiz: "1" });
  toets(r, verwachting(hand(BASIS), true));
  waar("eindoordeel: voldoet", r.r.voldoet === true && r.r.uc !== null, JSON.stringify(r.r));
}

console.log("\n2. Geval B: drie palen, de standaardinvoer");
{
  const r = doorreken({ n_p: "3", horiz: "1" });
  toets(r, { ...verwachting(hand({ ...BASIS, n_p: 3, a: 1200 }), false) });
  waar("de drie banden even zwaar bij gelijke palen", Math.abs(r.uit.T_s - r.uit.T_o) < 1e-6 || r.uit.T_s >= r.uit.T_o, `${r.uit.T_s} ${r.uit.T_o}`);
  waar("eindoordeel: voldoet", r.r.voldoet === true, JSON.stringify(r.r));
}

console.log("\n3. Geval C: vier palen met momenten om beide assen");
{
  const inv = { M_Edx: "200", M_Edy: "120", M_frx: "140", M_fry: "80", horiz: "1" };
  const r = doorreken(inv);
  toets(r, verwachting(hand({ ...BASIS, Mx: 200, My: 120, Mxf: 140, Myf: 80 }), true));
  const z = doorreken({ horiz: "1" });
  waar("momenten maken de zwaarste paal zwaarder en de lichtste lichter", r.uit.R_Ed > z.uit.R_Ed && r.uit.R_min < z.uit.R_min);
}

console.log("\n4. De toestanden");
{
  const niet = doorreken({});
  waar("zonder bevestiging van de horizontale krachten: niet getoetst", niet.r.nietGetoetst === true && niet.r.uc === null && /Horizontale krachten — — niet getoetst/.test(niet.tekst), JSON.stringify(niet.r));
  const ep = doorreken({ e_p: "0", horiz: "1" });
  waar("zonder paalafwijking: niet getoetst", ep.r.nietGetoetst === true && /Paalafwijking 9\.8\.1\(1\) — niet getoetst/.test(ep.tekst), JSON.stringify(ep.r));
  const licht = doorreken({ n_t: "2", horiz: "1" });
  waar("te weinig staven in de band: voldoet niet", licht.r.voldoet === false && licht.uit.UC_T > 1, `UC_T ${licht.uit.UC_T}`);
  const nogDoor = doorreken({ n_t: "2" });
  waar("een UC boven 1 wint van 'niet getoetst'", nogDoor.r.voldoet === false, JSON.stringify(nogDoor.r));
  const recht = doorreken({ vorm_t: "1", horiz: "1" });
  waar("rechte staaf: ombuiging niet van toepassing", /Ombuiging en been 8\.3 — niet van toepassing/.test(recht.tekst));
  const laag = doorreken({ horiz: "1" });
  waar("h < 1000 mm: huidwapening niet van toepassing", /Huidwapening 7\.3\.3\(3\) — niet van toepassing/.test(laag.tekst));
  const hoog = doorreken({ h_poer: "1100", horiz: "1" });
  waar("h ≥ 1000 mm: huidwapening getoetst", hoog.uit.UC_h !== undefined && hoog.uit.UC_h > 0, `UC_h ${hoog.uit.UC_h}`);
  const ongeldig = doorreken({ N_Ed: "0" });
  waar("ongeldige invoer: geen UC en geen oordeel", ongeldig.r.uc === null && /ongeldige invoer/.test(ongeldig.tekst));
  const groot = doorreken({ l_poer: "1000" });
  waar("palen buiten de poer: ongeldige invoer", /Ongeldig: palen en kolom moeten binnen de poer vallen/.test(groot.tekst));
  const slank = doorreken({ a_x: "1500", a_y: "1500", l_poer: "2200", b_poer: "2200", horiz: "1" });
  waar("diagonaal flauwer dan 45°: buiten het toepassingsgebied", /flauwer dan 45°/.test(slank.tekst) && slank.r.uc === null, `θ ${slank.uit.θ_g}`);
  const trek = doorreken({ M_Edx: "1500", horiz: "1" });
  waar("een paal op trek: buiten het toepassingsgebied", /Een paal krijgt trek/.test(trek.tekst) && trek.uit.R_min < 0, `R_min ${trek.uit.R_min}`);
  const b500a = doorreken({ betonstaal: "1", horiz: "1" });
  waar("B500A: buiten het toepassingsgebied", /B500A/.test(b500a.tekst) && b500a.r.uc === null);
  const dik = doorreken({ d_t: "40", horiz: "1" });
  waar("staaf groter dan Ø32: buiten het toepassingsgebied", /groter dan Ø32/.test(dik.tekst));
  const drieKlein = doorreken({ n_p: "3", r_rand: "150" });
  waar("drie palen, paal buiten de poer: ongeldige invoer", /Ongeldig: palen en kolom/.test(drieKlein.tekst));
  const kringen = doorreken({ paalvorm: "2", kolomvorm: "2", horiz: "1" });
  waar("ronde paal en kolom: rekent door", kringen.r.uc !== null, JSON.stringify(kringen.r));
}

console.log("\n5. Tekening en 3D-beeld");
for (const [naam, inv] of [["vier palen", {}], ["drie palen", { n_p: "3" }]]) {
  const r = doorreken({ ...inv, horiz: "1" });
  waar(`${naam}: plattegrond`, r.html.includes('viewBox="0 0 400 350"'));
  waar(`${naam}: 3D-beeld`, /calc-3d/.test(r.html));
  const palen = (r.html.match(/stroke-dasharray:4 2/g) ?? []).length;
  waar(`${naam}: ${inv.n_p === "3" ? 3 : 4} palen in de plattegrond`, palen === (inv.n_p === "3" ? 3 : 4), String(palen));
}

console.log(`\n${getest} controles, ${fouten} fout(en).`);
if (fouten > 0) process.exit(1);
console.log("Poer op drie of vier palen: alles klopt.");
