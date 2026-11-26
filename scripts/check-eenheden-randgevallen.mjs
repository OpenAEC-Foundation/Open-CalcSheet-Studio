/**
 * Eenheden aan de rand: nulwaarden, temperatuur, toerental en elektrische eenheden. Openbare
 * gevallen bij de eenheden van de rekenkern (packages/core/src/eenheden.ts), naast
 * check-eenheden (eenheden met alleen een noemer) en check-eenheidstelsel (US en het stelsel).
 *
 * Handberekeningen:
 *   Nul
 *     0 kN → N = 0 N; 0 mm · 5 mm = 0 mm²; 0 kN / 2 m = 0 kN/m; max(0 kN; −1 kN) = 0 kN.
 *     1 kN / 0 m = ∞ kN/m (geen fout), 0/0 = NaN. In US customary: 0 kN = 0 kip.
 *     Een invoerveld met 0 in mm toont in m ook 0, en 0 m terug in een veld in mm is 0.
 *   Temperatuur
 *     20 °C = 20 + 273,15 = 293,15 K; 293,15 K = 20 °C; 68 °F = (68 − 32)·5/9 = 20 °C;
 *     0 °C = 273,15 K. Een toename: 20 °C + 10 K = 30 °C.
 *     α·ΔT met α = 1,2·10⁻⁵ 1/K en ΔT = 30 K: 3,6·10⁻⁴. In een product geldt een
 *     temperatuur in °C als verschil: α·(30 °C − 10 °C) = 1,2·10⁻⁵ · 20 = 2,4·10⁻⁴, met
 *     α in 1/K of in 1/°C.
 *     Valkuil (vastgelegd, en zo beschreven in docs/rekentaal.md): 30 °C − 10 °C blijft
 *     20 °C, en `to K` maakt daar 293,15 K van, een absolute temperatuur. Reken een
 *     verschil dus in K.
 *     Het stelsel rekent een temperatuur nooit om: in US customary blijft 20 °C 20 °C.
 *   Toerental
 *     rpm is een frequentie: 1500 rpm = 1500/60 = 25 Hz; 50 Hz = 3000 rpm.
 *     ω = 2·π·n = 2·π·25 = 157,08 1/s; P = M·ω = 0,5 kNm · 157,08 1/s = 78,54 kW.
 *   Elektrisch
 *     P = U·I = 230 V · 10 A = 2300 W = 2,3 kW; R = U/I = 23 Ω (ohm);
 *     E = P·t = 2,3 kW · 3 h = 6,9 kWh; driefasig P = √3 · 400 V · 16 A = 11 085 W;
 *     Q = I·t = 2 A · 3600 s = 7200 C; 250 mA = 0,25 A; 10 kV = 10 000 V; 4,7 kΩ = 4700 Ω;
 *     S = 230 V · 10 A = 2300 VA.
 *     Een variabele gaat voor een eenheid: na A = 300 mm² is 10 A gelijk aan 10 · 300 = 3000 mm².
 *
 * Draaien:  node scripts/check-eenheden-randgevallen.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { parse, evaluate, render, STELSELS, toonInvoer, invoerNaarBron } from "../packages/core/dist/index.js";

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};
const ongeveer = (a, b) => typeof a === "number" && (a === b || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b)));

function plat(lijst, uit = []) {
  for (const n of lijst) {
    if (Array.isArray(n.children)) plat(n.children, uit);
    else uit.push(n);
  }
  return uit;
}

/** De laatste uitkomst per naam, eventueel in een stelsel. */
function reken(bron, stelsel) {
  const knopen = evaluate(parse(bron), {}, {}, stelsel ? { stelsel: STELSELS[stelsel] } : {});
  const uit = {};
  for (const n of plat(knopen)) if (n.type === "assignment") uit[n.name] = n;
  return { uit, knopen };
}

/** Uitkomst als tekst en het onafgeronde getal. */
function is(r, naam, tekst, getal) {
  const n = r.uit[naam];
  const ok = n?.result === tekst && (getal === undefined || ongeveer(n?.waarde, getal));
  meld(ok, `${naam} = ${tekst}`, `${n?.result} (${n?.waarde})`);
}

// ─── Nul ─────────────────────────────────────────────────────────
console.log("Nulwaarden");
{
  const r = reken(`F_0 = 0 kN
F_N = F_0 to N
A_0 = 0 mm*5 mm
s_0 = F_0/(2 m)
m_x = max(0 kN; -1 kN)
q_0 = 1 kN/(0 m)
r_00 = 0/0
`);
  is(r, "F_0", "0 kN", 0);
  is(r, "F_N", "0 N", 0);
  is(r, "A_0", "0 mm^2", 0);
  is(r, "s_0", "0 kN / m", 0);
  is(r, "m_x", "0 kN", 0);
  is(r, "q_0", "∞ kN / m", Infinity);
  meld(r.uit.r_00?.result === "NaN", "0/0 = NaN, geen uitzondering", r.uit.r_00?.result);
  const html = render(r.knopen);
  meld(!html.includes("Error"), "nulwaarden geven geen foutmelding in de uitwerking");
  const us = reken("F_0 = 0 kN\nA_0 = 0 mm*5 mm\n", "us");
  meld(us.uit.F_0?.inStelsel?.result === "0 kip", "US customary: 0 kN in beeld als 0 kip", JSON.stringify(us.uit.F_0?.inStelsel));
  meld(toonInvoer("0", "mm", "m") === "0", "invoerveld: 0 mm toont in m als 0", toonInvoer("0", "mm", "m"));
  const terug = invoerNaarBron("0 m", "m", "mm");
  meld("waarde" in terug && Number(terug.waarde) === 0, "invoerveld: 0 m terug in een veld in mm is 0", JSON.stringify(terug));
  const nulVeld = evaluate(parse("F = ?{0}*(kN)\nG = 2*F\n"), {});
  const g = plat(nulVeld).find((n) => n.name === "G");
  meld(g?.result === "0 kN", "invoerveld met standaardwaarde 0: 2·F = 0 kN", g?.result);
}

// ─── Temperatuur ─────────────────────────────────────────────────
console.log("\nTemperatuur");
{
  const r = reken(`T_c = 20 degC
T_k = T_c to K
T_terug = 293.15 K to degC
T_f = 68 degF to degC
T_0 = 0 degC to K
T_op = 20 degC + 10 K
ΔT = 30 K
α_T = 1.2e-5/K
ε_T = α_T*ΔT
ε_C = α_T*(30 degC - 10 degC)
α_C = 1.2e-5/degC
ε_C2 = α_C*(30 degC - 10 degC)
d_T = 30 degC - 10 degC
d_K = d_T to K
`);
  is(r, "T_k", "293.1 K", 293.15);
  is(r, "T_terug", "20 degC", 20);
  is(r, "T_f", "20 degC", 20);
  is(r, "T_0", "273.1 K", 273.15);
  is(r, "T_op", "30 degC", 30);
  is(r, "ε_T", "3.600e-4", 3.6e-4);
  meld(r.uit.ε_T?.unit === "", "α·ΔT is dimensieloos", r.uit.ε_T?.unit);
  is(r, "ε_C", "2.400e-4", 2.4e-4);
  is(r, "ε_C2", "2.400e-4", 2.4e-4);
  is(r, "d_T", "20 degC", 20);
  is(r, "d_K", "293.1 K", 293.15);
  const us = reken("T_c = 20 degC\n", "us");
  meld(us.uit.T_c?.result === "20 degC" && !us.uit.T_c?.inStelsel, "US customary rekent 20 °C niet om", JSON.stringify(us.uit.T_c?.inStelsel));
  const latex = render(reken("T_c = 20 degC\n").knopen);
  meld(latex.includes("{}^{\\circ}\\mathrm{C}"), "°C in de formule als graden Celsius");
}

// ─── Toerental ───────────────────────────────────────────────────
console.log("\nToerental");
{
  const r = reken(`n = 1500 rpm
f = n to Hz
ω = 2*pi*n to 1/s
M = 0.5 kN*m
P = M*ω to kW
n_2 = 50 Hz to rpm
`);
  is(r, "n", "1500 rpm", 1500);
  is(r, "f", "25 Hz", 25);
  is(r, "ω", "157.1 1 / s", 2 * Math.PI * 25);
  is(r, "P", "78.54 kW", 0.5 * 2 * Math.PI * 25);
  is(r, "n_2", "3000 rpm", 3000);
  const fout = reken("x = 1500 rpm + 2 m\n");
  meld(String(fout.uit.x?.result).startsWith("Error"), "rpm plus meters is een fout", fout.uit.x?.result);
}

// ─── Elektrisch ──────────────────────────────────────────────────
console.log("\nElektrische eenheden");
{
  const r = reken(`U = 230 V
I = 10 A
P = U*I to kW
R = U/I to ohm
E_e = P*3 h to kWh
P_3f = sqrt(3)*400 V*16 A to W
Q_l = 2 A*1 h to C
I_m = 250 mA to A
U_k = 10 kV to V
R_k = 4.7 kohm to ohm
S_a = U*I to VA
`);
  is(r, "P", "2.3 kW", 2.3);
  is(r, "R", "23 ohm", 23);
  is(r, "E_e", "6.9 kWh", 6.9);
  is(r, "P_3f", "11090 W", Math.sqrt(3) * 400 * 16);
  is(r, "Q_l", "7200 C", 7200);
  is(r, "I_m", "0.25 A", 0.25);
  is(r, "U_k", "10000 V", 10000);
  is(r, "R_k", "4700 ohm", 4700);
  is(r, "S_a", "2300 VA", 2300);
  const fout = reken("x = 230 V + 10 A\n");
  meld(String(fout.uit.x?.result).startsWith("Error"), "volt plus ampère is een fout", fout.uit.x?.result);
  const us = reken("U = 230 V\nP = 2.3 kW\n", "us");
  meld(us.uit.U?.result === "230 V" && !us.uit.U?.inStelsel, "US customary laat volt staan", JSON.stringify(us.uit.U?.inStelsel));
  // Een variabele gaat voor een eenheid: na A = 300 mm² is 10 A gelijk aan 3000 mm².
  const schaduw = reken("A = 300 mm^2\nI = 10 A\n");
  meld(schaduw.uit.I?.result === "3000 mm^2", "een variabele A gaat voor de ampère", schaduw.uit.I?.result);
}

console.log(fouten === 0 ? "\nAlle randgevallen van de eenheden kloppen." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
