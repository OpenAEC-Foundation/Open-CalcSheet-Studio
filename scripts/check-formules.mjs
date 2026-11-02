/**
 * Formulebibliotheek (packages/desktop/src/components/ribbon/formules.ts).
 *
 * De bibliotheek is data: per formule een fragment in de rekentaal dat de
 * gebruiker met één klik in zijn rekenblad zet. Deze controle bewaakt:
 *
 *   1. de opbouw: unieke kebab-case id's, alleen bestaande groepen, geen lege
 *      groep, naam en uitleg in het Nederlands én het Engels, een bron, en
 *      alleen scalaire rekentaal (geen matrix, geen lsolve);
 *   2. dat elk fragment met de kern (parse + evaluate) foutloos doorrekent:
 *      geen "Error" in een uitkomst of tekst, elke toewijzing een eindig getal
 *      en elke toewijzingsregel ook echt als toewijzing gelezen;
 *   3. dat geen fragment een variabele zet met de naam van een eenheid
 *      (`s`, `m`, `N`, `K`, …): die overschaduwt de eenheid in alle volgende
 *      regels van het blad zonder foutmelding, zodat `27 m/s` iets anders
 *      wordt;
 *   4. een selectie uitkomsten tegen een handberekening. Waar het kan, met een
 *      onafhankelijke weg: de grootste doorbuiging uit de doorbuigingslijn in
 *      plaats van uit de gesloten formule, een reactie uit het momenten-
 *      evenwicht.
 *
 * In de app krijgt elk blad de projectgegevens vóór de eerste regel in de
 * scope (CC en K_FI, zie store/projectGegevens.ts). Dat doet deze controle
 * ook; een fragment dat CC of K_FI gebruikt, rekent hier bovendien bij elke
 * gevolgklasse door.
 *
 * Draaien:  node scripts/check-formules.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { readFileSync } from "node:fs";
import ts from "typescript";
import { parse, evaluate } from "../packages/core/dist/index.js";

const bron = readFileSync(new URL("../packages/desktop/src/components/ribbon/formules.ts", import.meta.url), "utf8");
const js = ts.transpileModule(bron, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const { FORMULES, FORMULE_GROEPEN } = await import(`data:text/javascript,${encodeURIComponent(js)}`);

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  if (!ok || process.argv.includes("--alles")) {
    console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
  }
  return ok;
};

/** Projectgegevens zoals de app ze in elke scope zet: CC1, CC2 (standaard) en CC3. */
const PROJECT = {
  1: { CC: 1, K_FI: 0.9 },
  2: { CC: 2, K_FI: 1.0 },
  3: { CC: 3, K_FI: 1.1 },
};

/**
 * Namen die een eenheid of constante van de rekenkern zijn. `h` (uur) en `t`
 * (ton) staan er bewust niet in: als hoogte en dikte zijn ze de notatie van de
 * norm, en een uur of ton komt in een constructieblad niet voor.
 */
const EENHEIDSNAMEN = new Set([
  "m", "mm", "cm", "dm", "km", "s", "ms", "min", "N", "kN", "MN", "Pa", "kPa", "MPa", "GPa",
  "K", "degC", "deg", "rad", "g", "kg", "tonne", "Hz", "J", "W", "V", "in", "to",
  "e", "i", "pi", "tau", "phi",
]);

/** Rekent een fragment door; geeft de platte lijst van knopen. */
function reken(code, scope) {
  const uit = [];
  const loop = (lijst) => {
    for (const n of lijst) {
      uit.push(n);
      if (Array.isArray(n.children)) loop(n.children);
    }
  };
  loop(evaluate(parse(code), {}, { ...scope }));
  return uit;
}

/** Uitkomsten per (gevouwen) naam: `f_m,d` heet in de kern `f_m_d`. */
function uitkomsten(code, scope = PROJECT[2]) {
  const r = {};
  for (const n of reken(code, scope)) if (n.type === "assignment") r[n.name] = n;
  return r;
}

// ─── 1. Opbouw ──────────────────────────────────────────────────────
console.log("Opbouw van de bibliotheek:");
const groepIds = new Set(FORMULE_GROEPEN.map((g) => g.id));
meld(groepIds.size === FORMULE_GROEPEN.length, "groep-id's zijn uniek");
const gezien = new Set();
const dubbel = [];
for (const f of FORMULES) {
  if (gezien.has(f.id)) dubbel.push(f.id);
  gezien.add(f.id);
}
meld(dubbel.length === 0, `${FORMULES.length} formules met een unieke id`, dubbel.join(", "));

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const tekstOk = (t) => t && typeof t.nl === "string" && t.nl.trim() !== "" && typeof t.en === "string" && t.en.trim() !== "";
for (const f of FORMULES) {
  const wat = `formule ${f.id}`;
  if (!KEBAB.test(f.id)) meld(false, wat, "id is geen kebab-case");
  if (!groepIds.has(f.groep)) meld(false, wat, `onbekende groep "${f.groep}"`);
  if (!tekstOk(f.naam)) meld(false, wat, "naam mist nl of en");
  if (!tekstOk(f.uitleg)) meld(false, wat, "uitleg mist nl of en");
  if (typeof f.bron !== "string" || f.bron.trim() === "") meld(false, wat, "geen bron");
  if (typeof f.code !== "string" || f.code.trim() === "") meld(false, wat, "geen code");
  // Matrixliterals en lsolve zijn in de kern nog niet betrouwbaar; de
  // bibliotheek is bewust scalair.
  if (/[[\]]|lsolve/.test(f.code ?? "")) meld(false, wat, "matrix of lsolve in het fragment");
}
for (const g of FORMULE_GROEPEN) {
  if (!tekstOk(g.naam)) meld(false, `groep ${g.id}`, "naam mist nl of en");
  const aantal = FORMULES.filter((f) => f.groep === g.id).length;
  meld(aantal > 0, `groep ${g.id}: ${aantal} formules`, "lege groep");
}
console.log(`  ${FORMULE_GROEPEN.map((g) => `${g.id} ${FORMULES.filter((f) => f.groep === g.id).length}`).join(" · ")}`);

// ─── 2. Elk fragment rekent foutloos door ───────────────────────────
console.log("\nElk fragment rekent met de kern zonder foutmelding:");
const TOEWIJZING = /^\s*[\p{L}_][\p{L}\p{N}_,]*\s*=/u;
let schoon = 0;
for (const f of FORMULES) {
  const standen = f.projectvariabelen?.length ? [1, 2, 3] : [2];
  let ok = true;
  for (const cc of standen) {
    const waar = standen.length > 1 ? `${f.id} (CC${cc})` : f.id;
    let knopen;
    try {
      knopen = reken(f.code, PROJECT[cc]);
    } catch (err) {
      ok = meld(false, waar, `rekenkern gooit: ${err.message}`) && ok;
      continue;
    }
    const toew = knopen.filter((n) => n.type === "assignment");
    const regels = f.code.split("\n").filter((r) => TOEWIJZING.test(r)).length;
    if (toew.length !== regels) ok = meld(false, waar, `${regels} toewijzingsregels, maar ${toew.length} toewijzingen gelezen`) && ok;
    for (const n of knopen) {
      const tekst = String(n.result ?? n.text ?? "");
      if (/error/i.test(tekst)) ok = meld(false, waar, `${n.name ?? n.type}: ${tekst}`) && ok;
      if (n.type === "assignment" && !Number.isFinite(n.waarde)) {
        ok = meld(false, waar, `${n.name} = ${n.result} is geen eindig getal`) && ok;
      }
      if (n.type === "assignment" && EENHEIDSNAMEN.has(n.name)) {
        ok = meld(false, waar, `variabele "${n.name}" overschaduwt een eenheid of constante`) && ok;
      }
    }
    // Een projectvariabele mag het fragment gebruiken, niet overschrijven.
    for (const p of f.projectvariabelen ?? []) {
      if (toew.some((n) => n.name === p)) ok = meld(false, waar, `zet projectvariabele ${p} zelf`) && ok;
    }
  }
  if (ok) schoon++;
}
meld(schoon === FORMULES.length, `${schoon} van ${FORMULES.length} fragmenten foutloos`);
console.log(`  ${schoon} van ${FORMULES.length} fragmenten foutloos doorgerekend`);

// ─── 3. Handberekeningen ────────────────────────────────────────────
console.log("\nUitkomsten tegen een handberekening:");

/** Grootste waarde van f op [a, b], door fijn af te tasten. */
function maxOp(f, a, b, n = 200000) {
  let m = -Infinity;
  for (let k = 0; k <= n; k++) m = Math.max(m, f(a + ((b - a) * k) / n));
  return m;
}

// Gemeenschappelijk voorbeeldprofiel IPE 300 (N en mm): E·I_y.
const EI = 210000 * 8356e4;
const rad = (graden) => (graden * Math.PI) / 180;

/**
 * Elke controle: formule-id, naam van de uitkomst (gevouwen), verwachte
 * waarde in de getoonde eenheid, die eenheid, en de relatieve tolerantie.
 * Een tolerantie boven 0,1 % hoort bij een afgeronde coëfficiënt in de norm
 * of het handboek (0,00652, 1/185, 0,0069) en staat er met de reden bij.
 */
const CONTROLES = [
  // Ligger op twee steunpunten, q = 5 kN/m, L = 6 m.
  { id: "ligger-twee-steunpunten-q", naam: "M_max", verwacht: (5 * 6 ** 2) / 8, eenheid: "kN m" },
  { id: "ligger-twee-steunpunten-q", naam: "w_max", verwacht: (5 * 5 * 6000 ** 4) / (384 * EI), eenheid: "mm" },
  // Puntlast 20 kN op a = 2 m: de doorbuigingslijn afgetast, links en rechts van de last.
  {
    id: "ligger-twee-steunpunten-f-willekeurig", naam: "w_max", eenheid: "mm", tol: 1e-4,
    verwacht: (() => {
      const F = 20000, L = 6000, a = 2000, b = 4000;
      return maxOp((x) => (x <= a
        ? (F * b * x * (L ** 2 - b ** 2 - x ** 2)) / (6 * EI * L)
        : (F * a * (L - x) * (L ** 2 - a ** 2 - (L - x) ** 2)) / (6 * EI * L)), 0, L);
    })(),
  },
  { id: "ligger-twee-steunpunten-f-willekeurig", naam: "R_A", verwacht: (20 * 4) / 6, eenheid: "kN" },
  // Driehoekslast: momentenlijn M(x) = qLx/6 − qx³/(6L) en de exacte doorbuigingslijn
  // q·x·(7L⁴ − 10L²x² + 3x⁴)/(360·L·EI); de formule gebruikt de afgeronde 0,00652.
  {
    id: "ligger-twee-steunpunten-driehoekslast", naam: "M_max", eenheid: "kN m",
    verwacht: maxOp((x) => (5 * 6 * x) / 6 - (5 * x ** 3) / (6 * 6), 0, 6),
  },
  {
    id: "ligger-twee-steunpunten-driehoekslast", naam: "w_max", eenheid: "mm", tol: 2e-3,
    verwacht: maxOp((x) => (5 * x * (7 * 6000 ** 4 - 10 * 6000 ** 2 * x ** 2 + 3 * x ** 4)) / (360 * 6000 * EI), 0, 6000),
  },
  // Eenzijdig ingeklemd, q: lijn q·x·(L³ − 3Lx² + 2x³)/(48EI) vanaf het scharnier; de formule gebruikt 1/185.
  {
    id: "ligger-eenzijdig-ingeklemd-q", naam: "w_max", eenheid: "mm", tol: 5e-3,
    verwacht: maxOp((x) => (5 * x * (6000 ** 3 - 3 * 6000 * x ** 2 + 2 * x ** 3)) / (48 * EI), 0, 6000),
  },
  // Eenzijdig ingeklemd, F midden: lijn F·x·(3L² − 5x²)/(96EI) tussen scharnier en last.
  {
    id: "ligger-eenzijdig-ingeklemd-f-midden", naam: "w_max", eenheid: "mm", tol: 1e-4,
    verwacht: maxOp((x) => (20000 * x * (3 * 6000 ** 2 - 5 * x ** 2)) / (96 * EI), 0, 3000),
  },
  // Overstek: reacties uit het momentenevenwicht om B en om A, veldmoment R_A²/(2q).
  { id: "ligger-overstek-q", naam: "R_A", verwacht: (5 * 6 * 3 - (5 * 1.5 ** 2) / 2) / 6, eenheid: "kN" },
  { id: "ligger-overstek-q", naam: "R_B", verwacht: (5 * 7.5 * 3.75) / 6, eenheid: "kN" },
  { id: "ligger-overstek-q", naam: "M_veld", verwacht: ((5 * 6 * 3 - (5 * 1.5 ** 2) / 2) / 6) ** 2 / (2 * 5), eenheid: "kN m" },
  // Drie velden: eindveld als ligger op twee steunpunten met q en steunmoment 0,1qL² bij B.
  {
    id: "ligger-drie-velden-q", naam: "w_max", eenheid: "mm", tol: 5e-3,
    verwacht: maxOp((x) => {
      const L = 6000, q = 5, MB = 0.1 * q * L ** 2;
      return (q * x * (L ** 3 - 2 * L * x ** 2 + x ** 3)) / (24 * EI) - (MB * x * (L ** 2 - x ** 2)) / (6 * EI * L);
    }, 0, 6000),
  },
  { id: "ligger-drie-velden-q", naam: "M_veld_1", verwacht: (0.4 * 5 * 6) ** 2 / (2 * 5), eenheid: "kN m" },

  // Doorsneden.
  { id: "doorsnede-buis", naam: "A", verwacht: (Math.PI / 4) * (168.3 ** 2 - 152.3 ** 2), eenheid: "mm^2" },
  { id: "doorsnede-i-profiel", naam: "A", verwacht: 2 * 150 * 10.7 + 278.6 * 7.1, eenheid: "mm^2" },
  { id: "doorsnede-i-profiel", naam: "W_pl_y", verwacht: 150 * 10.7 * 289.3 + (7.1 * 278.6 ** 2) / 4, eenheid: "mm^3" },
  {
    id: "doorsnede-samengesteld", naam: "I_y", eenheid: "mm^4",
    verwacht: (() => {
      const zc = (4000 * 10 + 1800 * 110) / 5800;
      return 133333 + 4000 * (10 - zc) ** 2 + 4860000 + 1800 * (110 - zc) ** 2;
    })(),
  },

  // Spanning en stabiliteit.
  { id: "schuifspanning-algemeen", naam: "τ", verwacht: (100000 * 314200) / (8356e4 * 7.1), eenheid: "N / mm^2" },
  { id: "thermische-uitzetting", naam: "ΔL", verwacht: 12e-6 * 20 * 5000, eenheid: "mm" },
  { id: "euler-knikkracht", naam: "N_cr", verwacht: (Math.PI ** 2 * 210000 * 2003e4) / 4000 ** 2 / 1000, eenheid: "kN" },
  {
    id: "kritiek-kipmoment", naam: "M_cr", eenheid: "kN m",
    verwacht: (() => {
      const E = 210000, G = 81000, Iz = 603.8e4, It = 20.12e4, Iw = 125900e6, L = 5000;
      return ((Math.PI ** 2 * E * Iz) / L ** 2) * Math.sqrt(Iw / Iz + (L ** 2 * G * It) / (Math.PI ** 2 * E * Iz)) / 1e6;
    })(),
  },
  // f_1 in SI: E·I in N·m², massa 300 kg/m.
  {
    id: "eigenfrequentie-ligger-twee-steunpunten", naam: "f_1", eenheid: "Hz",
    verwacht: (Math.PI / (2 * 36)) * Math.sqrt((210e9 * 8356e-8) / 300),
  },

  // EN 1990: 6.10a en 6.10b bij elke gevolgklasse (G 10, Q1 5, Q2 2 kN/m).
  { id: "en1990-combinatie-6-10a-nb", cc: 1, naam: "E_d", verwacht: 1.2 * 10 + 1.35 * 0.4 * 5 + 1.35 * 0.5 * 2, eenheid: "kN / m" },
  { id: "en1990-combinatie-6-10a-nb", cc: 2, naam: "E_d", verwacht: 1.35 * 10 + 1.5 * 0.4 * 5 + 1.5 * 0.5 * 2, eenheid: "kN / m" },
  { id: "en1990-combinatie-6-10a-nb", cc: 3, naam: "E_d", verwacht: 1.5 * 10 + 1.65 * 0.4 * 5 + 1.65 * 0.5 * 2, eenheid: "kN / m" },
  { id: "en1990-combinatie-6-10b-nb", cc: 2, naam: "E_d", verwacht: 1.2 * 10 + 1.5 * 5 + 1.5 * 0.5 * 2, eenheid: "kN / m" },
  { id: "en1990-combinatie-6-10b-nb", cc: 3, naam: "E_d", verwacht: 1.3 * 10 + 1.65 * 5 + 1.65 * 0.5 * 2, eenheid: "kN / m" },
  { id: "en1990-kfi", cc: 3, naam: "E_d", verwacht: 1.1 * (1.35 * 10 + 1.5 * 5), eenheid: "kN / m" },

  // EN 1991: extreme stuwdruk in terreincategorie II op 10 m, v_b = 27 m/s.
  {
    id: "en1991-piekstuwdruk", naam: "q_p", eenheid: "kN / m^2",
    verwacht: (() => {
      const ln = Math.log(10 / 0.05), vm = 0.19 * ln * 27;
      return ((1 + 7 / ln) * 0.5 * 1.25 * vm ** 2) / 1000;
    })(),
  },
  { id: "en1991-sneeuwbelasting-dak", naam: "s_1", verwacht: 0.8 * 0.7, eenheid: "kN / m^2" },

  // EN 1992.
  { id: "en1992-betoneigenschappen", naam: "f_ctm", verwacht: 0.3 * 30 ** (2 / 3), eenheid: "N / mm^2" },
  { id: "en1992-betoneigenschappen", naam: "E_cm", verwacht: 22000 * 3.8 ** 0.3, eenheid: "N / mm^2" },
  {
    id: "en1992-buigwapening-rechthoek", naam: "A_s_req", eenheid: "mm^2",
    verwacht: (() => {
      // 0,8x·b·f_cd·(d − 0,4x) = M_Ed, opgelost naar x; dan A_s = M/(z·f_yd).
      const M = 150e6, b = 300, d = 450, fcd = 20;
      const x = (d - Math.sqrt(d ** 2 - (2 * M) / (b * fcd))) / 0.8;
      return M / ((d - 0.4 * x) * 435);
    })(),
  },
  {
    id: "en1992-dwarskracht-zonder-wapening", naam: "V_Rd_c", eenheid: "kN",
    verwacht: (() => {
      const k = 1 + Math.sqrt(200 / 450), rho = 942 / (300 * 450);
      const v = Math.max((0.18 / 1.5) * k * (100 * rho * 30) ** (1 / 3), 0.035 * k ** 1.5 * Math.sqrt(30));
      return (v * 300 * 450) / 1000;
    })(),
  },
  {
    id: "en1992-dwarskrachtwapening", naam: "V_Rd_s", eenheid: "kN",
    verwacht: ((100.5 / 200) * 405 * 435 * (1 / Math.tan(rad(21.8)))) / 1000,
  },
  {
    id: "en1992-dwarskrachtwapening", naam: "V_Rd_max", eenheid: "kN",
    verwacht: (300 * 405 * 0.6 * (1 - 30 / 250) * 20) / (1 / Math.tan(rad(21.8)) + Math.tan(rad(21.8))) / 1000,
  },
  { id: "en1992-verankeringslengte", naam: "l_b_rqd", verwacht: (12 / 4) * (435 / (2.25 * 1.35)), eenheid: "mm" },
  {
    id: "en1992-scheurwijdte", naam: "w_k", eenheid: "mm",
    verwacht: (() => {
      const hcef = Math.min(2.5 * 50, (500 - 120) / 3, 250), rho = 942 / (300 * hcef), ae = 200000 / 33000;
      const de = Math.max((250 - (0.4 * 2.9 / rho) * (1 + ae * rho)) / 200000, (0.6 * 250) / 200000);
      return (3.4 * 35 + (0.8 * 0.5 * 0.425 * 20) / rho) * de;
    })(),
  },
  {
    id: "en1992-pons", naam: "v_Rd_c", eenheid: "N / mm^2",
    verwacht: (() => {
      const k = 1 + Math.sqrt(200 / 220);
      return Math.max(0.12 * k * (100 * 0.008 * 30) ** (1 / 3), 0.035 * k ** 1.5 * Math.sqrt(30));
    })(),
  },
  { id: "en1992-pons", naam: "v_Ed", verwacht: (1.15 * 500000) / ((1600 + 4 * Math.PI * 220) * 220), eenheid: "N / mm^2" },

  // EN 1993.
  { id: "en1993-dwarskracht", naam: "V_pl_Rd", verwacht: ((5381 - 2 * 150 * 10.7 + (7.1 + 30) * 10.7) * 235) / Math.sqrt(3) / 1000, eenheid: "kN" },
  {
    id: "en1993-knik", naam: "χ", eenheid: "",
    verwacht: (() => {
      const l = 4000 / (50.7 * Math.PI * Math.sqrt(210000 / 235)), p = 0.5 * (1 + 0.49 * (l - 0.2) + l ** 2);
      return 1 / (p + Math.sqrt(p ** 2 - l ** 2));
    })(),
  },
  {
    id: "en1993-kip-gewalst", naam: "χ_LT", eenheid: "",
    verwacht: (() => {
      const l = Math.sqrt((628.4e3 * 235) / 115.7e6), p = 0.5 * (1 + 0.34 * (l - 0.4) + 0.75 * l ** 2);
      return Math.min(1, 1 / l ** 2, 1 / (p + Math.sqrt(p ** 2 - 0.75 * l ** 2)));
    })(),
  },
  { id: "en1993-bout-stuik", naam: "F_b_Rd", verwacht: (2.5 * (50 / 66) * 360 * 20 * 10) / 1.25 / 1000, eenheid: "kN" },
  { id: "en1993-bout-afschuiving", naam: "F_v_Rd", verwacht: (0.6 * 800 * 245) / 1.25 / 1000, eenheid: "kN" },

  // EN 1995.
  { id: "en1995-rekenwaarde-sterkte", naam: "f_m_d", verwacht: (0.8 * 24) / 1.3, eenheid: "N / mm^2" },
  { id: "en1995-kmod-kdef", naam: "k_mod", verwacht: 0.8, eenheid: "" },
  { id: "en1995-kmod-kdef", naam: "k_def", verwacht: 0.6, eenheid: "" },
  {
    id: "en1995-knik-kolom", naam: "k_c_y", eenheid: "",
    verwacht: (() => {
      const l = (3000 / (120 / Math.sqrt(12)) / Math.PI) * Math.sqrt(21 / 7400), k = 0.5 * (1 + 0.2 * (l - 0.3) + l ** 2);
      return 1 / (k + Math.sqrt(k ** 2 - l ** 2));
    })(),
  },
  {
    id: "en1995-kip", naam: "k_crit", eenheid: "",
    verwacht: 1.56 - 0.75 * Math.sqrt(24 / ((0.78 * 75 ** 2 * 7400) / (225 * 4000))),
  },
  {
    id: "en1995-johansen-enkelsnedig", naam: "F_v_Rk", eenheid: "kN",
    // Bezwijkvorm d is hier maatgevend (β = 1).
    verwacht: ((1.05 * 25.26 * 38 * 12) / 3) * (Math.sqrt(4 + (12 * 76745) / (25.26 * 12 * 38 ** 2)) - 1) / 1000,
  },
  { id: "en1995-doorbuiging-eindwaarde", naam: "w_fin", verwacht: 5 * 1.6 + 8 * (1 + 0.3 * 0.6) + 2 * (0.5 + 0.3 * 0.6), eenheid: "mm" },
  {
    id: "en1995-vloertrilling-eigenfrequentie", naam: "f_1", eenheid: "Hz",
    // (EI)_l in N·m²/m: 11000 N/mm² · 75·225³/12 mm⁴ / 0,6 m.
    verwacht: (Math.PI / (2 * 25)) * Math.sqrt((11000e6 * ((0.075 * 0.225 ** 3) / 12)) / 0.6 / 50),
  },
];

const perId = new Map(FORMULES.map((f) => [f.id, f]));
let goed = 0;
for (const c of CONTROLES) {
  const f = perId.get(c.id);
  const wat = `${c.id}${c.cc ? ` (CC${c.cc})` : ""}: ${c.naam}`;
  if (!f) { meld(false, wat, "formule bestaat niet"); continue; }
  const n = uitkomsten(f.code, PROJECT[c.cc ?? 2])[c.naam];
  if (!n) { meld(false, wat, "uitkomst niet gevonden"); continue; }
  const tol = c.tol ?? 1e-3;
  const afwijking = Math.abs(n.waarde - c.verwacht) / Math.max(Math.abs(c.verwacht), 1e-12);
  const ok = afwijking <= tol && n.unit === c.eenheid;
  if (meld(ok, `${wat} = ${n.result}`, `verwacht ${Number(c.verwacht.toPrecision(6))} ${c.eenheid}, kreeg ${n.waarde} ${n.unit}`)) goed++;
}
console.log(`  ${goed} van ${CONTROLES.length} uitkomsten kloppen met de handberekening`);

console.log(fouten === 0 ? "\nFormulebibliotheek in orde." : `\n${fouten} fout(en) in de formulebibliotheek.`);
process.exit(fouten === 0 ? 0 : 1);
