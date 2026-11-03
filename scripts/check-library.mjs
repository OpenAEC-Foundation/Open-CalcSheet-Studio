/**
 * De Library in het projectpaneel (components/calc/LibrarySectie.tsx): een paar
 * voorbeelden uit formules.ts met `library`. Deze controle bewaakt bovenop
 * check-formules.mjs:
 *
 *   1. de indeling: elke groep een handvol voorbeelden, een bron die bij de
 *      groep past, korte namen voor een smal paneel, en per groep minstens één
 *      grafiek of tekening;
 *   2. de twee talen: Nederlands en Engels rekenen foutloos door met dezelfde
 *      toewijzingen en uitkomsten, en verschillen alleen in tekst;
 *   3. elke grafiek heeft het verwachte aantal lijnen, elke tekening rendert en
 *      nergens staat NaN of undefined in de uitwerking;
 *   4. achter elkaar in één blad rekenen alle voorbeelden hetzelfde als los:
 *      invoegen in een blad waarin al iets staat, verandert de uitkomst niet;
 *   5. de uitkomsten tegen een handberekening: los van het fragment opgeschreven,
 *      en waar het kan langs een andere weg (evenwicht terugrekenen, de
 *      schuifspanningen integreren tot de dwarskracht, de gesloten formule naast
 *      een numerieke integraal).
 *
 * Draaien:  node scripts/check-library.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { readFileSync } from "node:fs";
import ts from "typescript";
import { parse, evaluate, render } from "../packages/core/dist/index.js";

const bron = readFileSync(new URL("../packages/desktop/src/components/ribbon/formules.ts", import.meta.url), "utf8");
const js = ts.transpileModule(bron, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { FORMULES, LIBRARY_GROEPEN, codeVan } = await import(`data:text/javascript,${encodeURIComponent(js)}`);

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  if (!ok || process.argv.includes("--alles")) {
    console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
  }
  return ok;
};

/** Zoals de app elk blad begint: de projectgegevens staan in de scope. */
const PROJECT = { CC: 2, K_FI: 1.0 };

const knopen = (code) => evaluate(parse(code), {}, { ...PROJECT });
function plat(nodes) {
  const uit = [];
  const loop = (lijst) => {
    for (const n of lijst) {
      uit.push(n);
      if (Array.isArray(n.children)) loop(n.children);
    }
  };
  loop(nodes);
  return uit;
}
/** Uitkomsten per (gevouwen) naam: `M_c,Rd` heet in de kern `M_c_Rd`. */
function uitkomsten(code) {
  const r = {};
  for (const n of plat(knopen(code))) if (n.type === "assignment") r[n.name] = n;
  return r;
}

const VOORBEELDEN = FORMULES.filter((f) => f.library);
const perId = new Map(VOORBEELDEN.map((f) => [f.id, f]));

// ─── 1. De indeling ─────────────────────────────────────────────────
console.log("Indeling van de Library:");
const BRON_VAN = {
  ec2: /^NEN-EN 1992-1-1 /,
  ec3: /^NEN-EN 1993-1-1 /,
  vandepitte: /^Prof\. D\. Vandepitte, Berekening van Constructies, Deel I, /,
};
const FORMULEGROEP_VAN = { ec2: "en1992", ec3: "en1993", vandepitte: "vandepitte" };
for (const g of LIBRARY_GROEPEN) {
  const items = VOORBEELDEN.filter((f) => f.library === g.id);
  meld(items.length >= 4 && items.length <= 6, `groep ${g.id}: ${items.length} voorbeelden`, "verwacht 4 tot 6");
  meld(g.naam.nl && g.naam.en && g.onder.nl && g.onder.en, `groep ${g.id}: tekst in twee talen`);
  meld(items.some((f) => f.soort), `groep ${g.id}: een grafiek of tekening`);
  for (const f of items) {
    meld(BRON_VAN[g.id].test(f.bron ?? ""), `${f.id}: bron past bij de groep`, f.bron);
    meld(f.groep === FORMULEGROEP_VAN[g.id], `${f.id}: staat in het formulevenster onder ${FORMULEGROEP_VAN[g.id]}`, f.groep);
    // Een paneel van 240 px: wat langer is, valt weg achter een beletselteken.
    for (const naam of [f.naam.nl, f.naam.en]) meld(naam.length <= 28, `${f.id}: naam past op een smal paneel`, naam);
    meld(typeof f.codeEn === "string" && f.codeEn !== f.code, `${f.id}: heeft een Engels fragment`);
    meld(codeVan(f, "en") === f.codeEn && codeVan(f, "nl") === f.code && codeVan(f, "en-GB") === f.codeEn, `${f.id}: codeVan volgt de taal`);
  }
}
console.log(`  ${VOORBEELDEN.length} voorbeelden in ${LIBRARY_GROEPEN.length} groepen`);

// ─── 2. De twee talen ───────────────────────────────────────────────
console.log("\nNederlands en Engels:");
const FOUT_IN_TEKST = /error|undefined|NaN/;
/** Rekenregels: wat overblijft zonder tekstregels, toelichtingen en tekst in een tekening. */
const rekenregels = (code) => code.split("\n")
  .filter((r) => !r.startsWith("'") && !r.startsWith("## ") && !r.trim().startsWith("<text"))
  .map((r) => r.replace(/', [^']*'$/, ""));
let tweetalig = 0;
for (const f of VOORBEELDEN) {
  let ok = true;
  const uit = {};
  for (const taal of ["nl", "en"]) {
    const code = codeVan(f, taal);
    let v;
    try {
      v = plat(knopen(code));
    } catch (err) {
      ok = meld(false, `${f.id} (${taal})`, `rekenkern gooit: ${err.message}`) && ok;
      continue;
    }
    for (const n of v) {
      const tekst = String(n.result ?? n.text ?? "");
      if (FOUT_IN_TEKST.test(tekst)) ok = meld(false, `${f.id} (${taal})`, `${n.name ?? n.type}: ${tekst.slice(0, 80)}`) && ok;
      if (n.type === "assignment" && !Number.isFinite(n.waarde)) ok = meld(false, `${f.id} (${taal})`, `${n.name} is geen eindig getal`) && ok;
    }
    uit[taal] = v.filter((n) => n.type === "assignment").map((n) => `${n.name}=${n.waarde} ${n.unit}`).join("\n");
  }
  ok = meld(uit.nl === uit.en, `${f.id}: dezelfde uitkomsten in beide talen`) && ok;
  ok = meld(rekenregels(f.code).join("\n") === rekenregels(f.codeEn).join("\n"), `${f.id}: dezelfde rekenregels in beide talen`) && ok;
  if (ok) tweetalig++;
}
console.log(`  ${tweetalig} van ${VOORBEELDEN.length} voorbeelden rekenen in beide talen gelijk`);

// ─── 3. Grafieken en tekeningen ─────────────────────────────────────
console.log("\nGrafieken en tekeningen:");
const LIJNEN = {
  "library-ec2-rekenwaarden": 1,
  "library-ec2-beugels": 3,
  "library-ec3-knik": 5,
  "library-ec3-kip": 2,
  "library-vandepitte-schuifspanning": 1,
  "library-vandepitte-euler": 2,
  "library-vandepitte-eigenfrequentie": 2,
};
let getekend = 0;
for (const f of VOORBEELDEN) {
  const html = render(knopen(f.code));
  let ok = meld(!/NaN|undefined/.test(html), `${f.id}: geen NaN of undefined in de uitwerking`);
  if (f.soort === "grafiek") {
    const svg = html.match(/<svg[^>]*class="calc-plot"[\s\S]*?<\/svg>/);
    const lijnen = (svg?.[0].match(/<path /g) ?? []).length;
    ok = meld(lijnen === LIJNEN[f.id], `${f.id}: grafiek met ${LIJNEN[f.id]} lijn(en)`, `${lijnen} lijnen gevonden`) && ok;
    // De kern schaalt elke lijn apart: lijnen met een andere eenheid komen op een
    // heel andere schaal uit, en dan staan er getallen als 1.6e+7 langs de as.
    ok = meld(!/>-?[\d.]+e[+-]\d+</.test(svg?.[0] ?? ""), `${f.id}: gewone getallen langs de assen`) && ok;
  }
  if (f.soort === "tekening") {
    const svg = html.match(/<div class="calc-svg">\s*<svg[\s\S]*?<\/svg>/)?.[0] ?? "";
    ok = meld(svg !== "", `${f.id}: tekening rendert`) && ok;
    ok = meld(!/\{\{|Error/.test(svg), `${f.id}: elke maat ingevuld`) && ok;
  }
  if (!f.soort) ok = meld(!/\$Plot|<svg/.test(f.code), `${f.id}: heeft een grafiek of tekening maar geen soort`) && ok;
  if (ok) getekend++;
}
console.log(`  ${getekend} van ${VOORBEELDEN.length} voorbeelden renderen schoon`);

// ─── 4. Alles achter elkaar in één blad ─────────────────────────────
console.log("\nAlles achter elkaar in één blad:");
{
  const samen = (taal, lijst) => lijst.map((f) => codeVan(f, taal)).join("\n");
  for (const [naam, lijst] of [["voor naar achter", VOORBEELDEN], ["achter naar voor", [...VOORBEELDEN].reverse()]]) {
    const v = plat(knopen(samen("en", lijst)));
    meld(!v.some((n) => FOUT_IN_TEKST.test(String(n.result ?? n.text ?? ""))), `${naam}: geen foutmelding`);
    // Opeenvolgende toewijzingen per fragment: dezelfde volgorde als het fragment los.
    const nu = v.filter((n) => n.type === "assignment");
    let i = 0;
    let gelijk = true;
    for (const f of lijst) {
      const los = plat(knopen(f.codeEn)).filter((n) => n.type === "assignment");
      for (const n of los) {
        const hier = nu[i++];
        if (!hier || hier.name !== n.name || Math.abs(hier.waarde - n.waarde) > 1e-9 * Math.max(Math.abs(n.waarde), 1) || hier.unit !== n.unit) {
          gelijk = meld(false, `${naam}: ${f.id}: ${n.name}`, `los ${n.waarde} ${n.unit}, in het blad ${hier?.name} = ${hier?.waarde} ${hier?.unit}`) && gelijk;
        }
      }
    }
    if (gelijk) console.log(`  ${naam}: ${nu.length} uitkomsten gelijk aan los`);
  }
}

// ─── 5. Handberekeningen ────────────────────────────────────────────
console.log("\nUitkomsten tegen een handberekening:");

// Beton C30/37 en B500.
const fcd = 30 / 1.5;
const fyd = 500 / 1.15;
const fctm = 0.3 * 30 ** (2 / 3);

// 3 × Ø20 in 300 × 500 met d = 450: de drukzone volgt uit N_c = N_s.
const As3 = 3 * Math.PI * 20 ** 2 / 4;
const xRd = (As3 * fyd) / (0.8 * fcd * 300);
const zRd = 450 - 0.4 * xRd;
const MRd = (0.8 * xRd * 300 * fcd * zRd) / 1e6; // uit de betonkant van het koppel

// M_Ed = 150 kNm: de abc-formule op 0,8x·b·f_cd·(d − 0,4x) = M_Ed.
const aq = 0.8 * 0.4 * 300 * fcd;
const bq = -0.8 * 300 * fcd * 450;
const cq = 150e6;
const xReq = (-bq - Math.sqrt(bq ** 2 - 4 * aq * cq)) / (2 * aq);
const AsReq = 0.8 * xReq * 300 * fcd / fyd; // uit N_s = N_c

// Dwarskracht: d = 450, A_sl = 942, f_ck = 30.
const k = 1 + Math.sqrt(200 / 450);
const rhoL = 942 / (300 * 450);
const vRdc = (0.18 / 1.5) * k * (100 * rhoL * 30) ** (1 / 3);
const vMin = 0.035 * k ** 1.5 * Math.sqrt(30);

// Beugels Ø8-200 tweesnedig, z = 0,9d = 405, cot θ = 2,5.
const Asw = 2 * Math.PI * 16;
const VRds = (Asw / 200) * 405 * fyd * 2.5 / 1000;
const VRdmax = (300 * 405 * 0.6 * (1 - 30 / 250) * fcd) / (2.5 + 1 / 2.5) / 1000;

// IPE 300, S235.
const ANet = 5381 - 4 * 22 * 10.7;
const NuRd = (0.9 * ANet * 360) / 1.25 / 1000;
const Av = 5381 - 2 * 150 * 10.7 + (7.1 + 2 * 15) * 10.7;
const VplRd = (Av * 235) / Math.sqrt(3) / 1000;

// HEB 200 om de zwakke as, kromme c.
const lamK = 4000 / (50.7 * Math.PI * Math.sqrt(210000 / 235));
const phiK = 0.5 * (1 + 0.49 * (lamK - 0.2) + lamK ** 2);
const chiK = 1 / (phiK + Math.sqrt(phiK ** 2 - lamK ** 2));

// IPE 300 op kip, L = 5 m, C_1 = 1,13, kromme a.
const EIz = 210000 * 603.8e4;
const Mcr = (1.13 * Math.PI ** 2 * EIz / 5000 ** 2) * Math.sqrt(125900e6 / 603.8e4 + (5000 ** 2 * 81000 * 20.12e4) / (Math.PI ** 2 * EIz)) / 1e6;
const lamLT = Math.sqrt(628.4e3 * 235 / (Mcr * 1e6));
const phiLT = 0.5 * (1 + 0.21 * (lamLT - 0.2) + lamLT ** 2);
const chiLT = 1 / (phiLT + Math.sqrt(phiLT ** 2 - lamLT ** 2));

// I-doorsnede uit platen 300 × 150 × 7,1 × 10,7; V = 100 kN.
const Iw = (150 * 300 ** 3 - (150 - 7.1) * 278.6 ** 3) / 12;
const Sf = 150 * 10.7 * 289.3 / 2;
const S0 = Sf + 7.1 * 139.3 ** 2 / 2;
/** Schuifspanningen over de doorsnede geïntegreerd: moet de dwarskracht geven. */
const schuifSom = (() => {
  const stappen = 200000;
  let som = 0;
  for (let i = 0; i < stappen; i++) {
    const y = -150 + ((i + 0.5) * 300) / stappen;
    const inLijf = Math.abs(y) < 139.3;
    const S = inLijf ? Sf + (7.1 * (139.3 ** 2 - y ** 2)) / 2 : (150 * (150 ** 2 - y ** 2)) / 2;
    som += (100000 * S) / Iw * (300 / stappen); // τ·b·dy; b valt weg tegen τ = V·S/(I·b)
  }
  return som / 1000;
})();

// Staal in N en mm: E·I_y van een IPE 300.
const EI = 210000 * 8356e4;

const CONTROLES = [
  // Eurocode 2: rekenwaarden. f_cd 20,0 · f_yd 434,8 · f_ctm 2,90 · f_ctd 1,35 N/mm².
  ["library-ec2-rekenwaarden", "f_cd", 20, "N / mm^2"],
  ["library-ec2-rekenwaarden", "f_yd", 434.78, "N / mm^2"],
  ["library-ec2-rekenwaarden", "f_ctm", fctm, "N / mm^2"],
  ["library-ec2-rekenwaarden", "f_ctd", (0.7 * fctm) / 1.5, "N / mm^2"],
  // Momentcapaciteit: x 85,4 mm · z 415,9 mm · M_Rd 170,4 kNm · UC 0,88.
  ["library-ec2-momentcapaciteit", "A_s", 942.48, "mm^2"],
  ["library-ec2-momentcapaciteit", "x", xRd, "mm"],
  ["library-ec2-momentcapaciteit", "z", zRd, "mm"],
  ["library-ec2-momentcapaciteit", "M_Rd", MRd, "kN m"],
  ["library-ec2-momentcapaciteit", "UC_M", 150 / MRd, ""],
  ["library-ec2-momentcapaciteit", "ε_s", (0.0035 * (450 - xRd)) / xRd, ""],
  // Benodigde wapening: x 74,4 mm · A_s,req 821 mm² · A_s,min 203 mm² · 3 Ø20 · UC 0,87.
  ["library-ec2-buigwapening", "x", xReq, "mm"],
  ["library-ec2-buigwapening", "A_s_req", AsReq, "mm^2"],
  ["library-ec2-buigwapening", "A_s_min", Math.max((0.26 * fctm * 300 * 450) / 500, 0.0013 * 300 * 450), "mm^2"],
  ["library-ec2-buigwapening", "n_s", 3, ""],
  ["library-ec2-buigwapening", "UC_As", AsReq / As3, ""],
  // Dwarskracht zonder beugels: v 0,551 · v_min 0,412 N/mm² · V_Rd,c 74,4 kN.
  ["library-ec2-dwarskracht", "k", 1.6667, ""],
  ["library-ec2-dwarskracht", "v_Rd_c", vRdc, "N / mm^2"],
  ["library-ec2-dwarskracht", "v_min", vMin, "N / mm^2"],
  ["library-ec2-dwarskracht", "V_Rd_c", (Math.max(vRdc, vMin) * 300 * 450) / 1000, "kN"],
  // Beugels: V_Rd,s 221,3 kN · V_Rd,max 442,4 kN · UC 0,81.
  ["library-ec2-beugels", "A_sw", 100.53, "mm^2"],
  ["library-ec2-beugels", "V_Rd_s", VRds, "kN"],
  ["library-ec2-beugels", "V_Rd_max", VRdmax, "kN"],
  ["library-ec2-beugels", "UC_V", 180 / VRds, ""],

  // Eurocode 3: trek en druk. N_pl,Rd 1264,5 · N_u,Rd 1150,7 kN · UC 0,78 en 0,71.
  ["library-ec3-normaalkracht", "A_net", ANet, "mm^2"],
  ["library-ec3-normaalkracht", "N_pl_Rd", 1264.535, "kN"],
  ["library-ec3-normaalkracht", "N_u_Rd", NuRd, "kN"],
  ["library-ec3-normaalkracht", "N_t_Rd", NuRd, "kN"],
  ["library-ec3-normaalkracht", "UC_t", 900 / NuRd, ""],
  ["library-ec3-normaalkracht", "UC_c", 900 / 1264.535, ""],
  // Moment: klasse 1 · M_c,Rd 147,7 kNm · UC 0,68.
  ["library-ec3-moment", "s_w", (300 - 2 * 10.7 - 30) / 7.1, ""],
  ["library-ec3-moment", "s_f", (150 - 7.1 - 30) / 2 / 10.7, ""],
  ["library-ec3-moment", "klasse", 1, ""],
  ["library-ec3-moment", "M_c_Rd", (628.4e3 * 235) / 1e6, "kN m"],
  ["library-ec3-moment", "UC_M", 100 / ((628.4e3 * 235) / 1e6), ""],
  // Dwarskracht: A_v 2568 mm² · V_pl,Rd 348,4 kN · UC 0,34 · plooi 0,55.
  ["library-ec3-dwarskracht", "A_v", Av, "mm^2"],
  ["library-ec3-dwarskracht", "V_pl_Rd", VplRd, "kN"],
  ["library-ec3-dwarskracht", "UC_V", 120 / VplRd, ""],
  ["library-ec3-dwarskracht", "UC_plooi", 278.6 / 7.1 / 72, ""],
  // Knik: λ̄ 0,840 · χ 0,637 (de kromme c geeft bij 0,8 en 0,9 0,662 en 0,600) · N_b,Rd 1169 kN · UC 0,68.
  ["library-ec3-knik", "λ_rel", lamK, ""],
  ["library-ec3-knik", "χ", chiK, ""],
  ["library-ec3-knik", "N_b_Rd", (chiK * 7810 * 235) / 1000, "kN"],
  ["library-ec3-knik", "UC_b", 800 / ((chiK * 7810 * 235) / 1000), ""],
  // Kip: M_cr 130,7 kNm · λ̄_LT 1,063 · χ_LT 0,622 · M_b,Rd 91,8 kNm · UC 0,76.
  ["library-ec3-kip", "M_cr_L", Mcr, "kN m"],
  ["library-ec3-kip", "λ_LT_L", lamLT, ""],
  ["library-ec3-kip", "χ_LT_L", chiLT, ""],
  ["library-ec3-kip", "M_b_Rd", (chiLT * 628.4e3 * 235) / 1e6, "kN m"],

  // Vandepitte. Jourawsky: τ_f 40,9 · τ_0 53,0 · τ_m 50,6 N/mm².
  ["library-vandepitte-schuifspanning", "I_y", Iw, "mm^4"],
  ["library-vandepitte-schuifspanning", "τ_f", (100000 * Sf) / (Iw * 7.1), "N / mm^2"],
  ["library-vandepitte-schuifspanning", "τ_0", (100000 * S0) / (Iw * 7.1), "N / mm^2"],
  ["library-vandepitte-schuifspanning", "τ_m", 100000 / (278.6 * 7.1), "N / mm^2"],
  // Mohr: φ_A = qL³/24EI = 0,00513 · w = 5qL⁴/384EI = 9,62 mm.
  ["library-vandepitte-mohr", "φ_A", (10 * 6000 ** 3) / (24 * EI), ""],
  ["library-vandepitte-mohr", "w_m", (5 * 10 * 6000 ** 4) / (384 * EI), "mm"],
  ["library-vandepitte-mohr", "w_c", (5 * 10 * 6000 ** 4) / (384 * EI), "mm"],
  // Euler: 648,7 · 2594,7 · 5295 · 10379 kN, λ_b 79,0, λ_p 93,9.
  ["library-vandepitte-euler", "N_cr_a", (Math.PI ** 2 * 210000 * 2003e4) / 8000 ** 2 / 1000, "kN"],
  ["library-vandepitte-euler", "N_cr_b", (Math.PI ** 2 * 210000 * 2003e4) / 4000 ** 2 / 1000, "kN"],
  ["library-vandepitte-euler", "N_cr_c", (Math.PI ** 2 * 210000 * 2003e4) / 2800 ** 2 / 1000, "kN"],
  ["library-vandepitte-euler", "N_cr_d", (Math.PI ** 2 * 210000 * 2003e4) / 2000 ** 2 / 1000, "kN"],
  ["library-vandepitte-euler", "λ_b", 4000 / Math.sqrt(2003e4 / 7810), ""],
  ["library-vandepitte-euler", "λ_p", 93.91, ""],
  // Eigenfrequentie: k 3899 kN/m · δ_st 2,52 mm · f 9,94 Hz (puntmassa) en 10,55 Hz (verdeeld).
  ["library-vandepitte-eigenfrequentie", "k_L", (48 * EI) / 6000 ** 3 * 1000 / 1000, "kN / m"],
  ["library-vandepitte-eigenfrequentie", "δ_st", (1000 * 9.81 * 6000 ** 3) / (48 * EI), "mm"],
  ["library-vandepitte-eigenfrequentie", "f_1", Math.sqrt((48 * 210e9 * 8356e-8) / (6 ** 3 * 1000)) / (2 * Math.PI), "Hz"],
  ["library-vandepitte-eigenfrequentie", "f_δ", Math.sqrt((48 * 210e9 * 8356e-8) / (6 ** 3 * 1000)) / (2 * Math.PI), "Hz"],
  ["library-vandepitte-eigenfrequentie", "f_2", (Math.PI / (2 * 36)) * Math.sqrt((210e9 * 8356e-8) / 300), "Hz"],
  // Virtuele arbeid: w_M = qL⁴/8EI = 5,77 mm · w_Q = qL²/2GA = 0,216 mm · 3,6 % van het totaal.
  ["library-vandepitte-virtuele-arbeid", "w_M", (10 * 3000 ** 4) / (8 * EI), "mm"],
  ["library-vandepitte-virtuele-arbeid", "w_Q", (10 * 3000 ** 2) / (2 * 81000 * 2568), "mm"],
  ["library-vandepitte-virtuele-arbeid", "w_tot", (10 * 3000 ** 4) / (8 * EI) + (10 * 3000 ** 2) / (2 * 81000 * 2568), "mm"],
  ["library-vandepitte-virtuele-arbeid", "a_Q", 0.03614, ""],
];

let goed = 0;
for (const [id, naam, verwacht, eenheid] of CONTROLES) {
  const f = perId.get(id);
  const wat = `${id}: ${naam}`;
  if (!f) { meld(false, wat, "voorbeeld bestaat niet"); continue; }
  const n = uitkomsten(f.code)[naam];
  if (!n) { meld(false, wat, "uitkomst niet gevonden"); continue; }
  // De handgetallen hierboven staan op vier cijfers; 0,1 % is dus de marge.
  const afwijking = Math.abs(n.waarde - verwacht) / Math.max(Math.abs(verwacht), 1e-12);
  const ok = afwijking <= 1e-3 && n.unit === eenheid;
  if (meld(ok, `${wat} = ${n.result}`, `verwacht ${Number(verwacht.toPrecision(6))} ${eenheid}, kreeg ${n.waarde} ${n.unit}`)) goed++;
}
console.log(`  ${goed} van ${CONTROLES.length} uitkomsten kloppen met de handberekening`);

// De schuifspanningen moeten samen de dwarskracht zijn: de formule van
// Jourawsky terug in het evenwicht.
const somOk = meld(Math.abs(schuifSom - 100) < 0.01, `∫τ·b dy over de doorsnede = ${schuifSom.toFixed(2)} kN`, "moet 100 kN zijn");
if (somOk) console.log(`  ∫τ·b dy over de doorsnede = ${schuifSom.toFixed(2)} kN, gelijk aan V_Ed`);

console.log(fouten === 0 ? "\nLibrary in orde." : `\n${fouten} fout(en) in de Library.`);
process.exit(fouten === 0 ? 0 : 1);
