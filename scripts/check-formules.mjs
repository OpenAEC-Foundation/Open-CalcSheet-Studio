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
 * Bij de liggers en de doorsnedegrootheden (formuleTekening.ts) bewaakt hij ook de
 * tekening die in het blad met de invoer meebeweegt:
 *
 *   5. de ligger tegen een handberekening: het getal bij de momentenlijn en een
 *      paar punten op de lijn, los van het fragment opgeschreven, en met het
 *      positieve moment onder de ligger; de doorsnede op schaal met de zwaartelijn
 *      op de plaats die de hand geeft;
 *   6. beide talen: dezelfde rekenregels, dezelfde tekening, andere tekst;
 *   7. invoer 0 en extreme verhoudingen: nergens NaN of `{{…}}`, en de tekening
 *      blijft in zijn vak;
 *   8. alles achter elkaar in één blad: de hulpvariabelen van een tekening raken
 *      geen enkele waarde van een ander fragment.
 *
 * Draaien:  node scripts/check-formules.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { parse, evaluate, render } from "../packages/core/dist/index.js";
import { FORMULES, FORMULE_GROEPEN, codeVan } from "../packages/desktop/src/components/ribbon/formules.ts";
import { buitenVak, getalInTekst, leesPad, leesSvg, omhullende, yOpPad } from "./lib/svg-maten.mjs";
import { laadLibrary } from "./lib/library.mjs";

// De voorbeelden van de Library staan in dezelfde groepen; check-library.mjs rekent ze na.
const { voorbeelden: LIBRARY } = await laadLibrary();
const inGroep = (g) => [...FORMULES, ...LIBRARY].filter((f) => f.groep === g.id);

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
  const aantal = inGroep(g).length;
  meld(aantal > 0, `groep ${g.id}: ${aantal} formules`, "lege groep");
}
console.log(`  ${FORMULE_GROEPEN.map((g) => `${g.id} ${inGroep(g).length}`).join(" · ")}`);

// ─── 2. Elk fragment rekent foutloos door ───────────────────────────
console.log("\nElk fragment rekent met de kern zonder foutmelding:");
const TOEWIJZING = /^\s*[\p{L}_][\p{L}\p{N}_,]*\s*=/u;
/**
 * De regels met en zonder #hide: een verborgen toewijzing (hulpvariabelen voor
 * een tekening) rekent wel mee, maar komt niet terug als knoop.
 */
function splitOpHide(code) {
  const zichtbaar = [];
  const verborgen = [];
  let weg = false;
  for (const r of code.split("\n")) {
    if (/^#hide\b/i.test(r)) weg = true;
    else if (/^#show\b/i.test(r)) weg = false;
    else (weg ? verborgen : zichtbaar).push(r);
  }
  return { zichtbaar, verborgen };
}
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
    const { zichtbaar, verborgen } = splitOpHide(f.code);
    const regels = zichtbaar.filter((r) => TOEWIJZING.test(r)).length;
    if (toew.length !== regels) ok = meld(false, waar, `${regels} toewijzingsregels, maar ${toew.length} toewijzingen gelezen`) && ok;
    for (const r of verborgen) {
      const naam = TOEWIJZING.test(r) ? r.split("=")[0].trim() : "";
      if (EENHEIDSNAMEN.has(naam)) ok = meld(false, waar, `verborgen variabele "${naam}" overschaduwt een eenheid of constante`) && ok;
    }
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
  // x_M = R_A/q, uit V(x) = R_A − q·x = 0; het fragment schrijft dat zonder q, zodat q = 0 geen 0/0 geeft.
  { id: "ligger-overstek-q", naam: "x_M", verwacht: (5 * 6 * 3 - (5 * 1.5 ** 2) / 2) / 6 / 5, eenheid: "m" },
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

// ─── 4. De tekeningen bij de liggers en de doorsneden ───────────────
const LIGGER = "mechanica-ligger";
const DOORSNEDE = "mechanica-doorsnede";
const MET_TEKENING = FORMULES.filter((f) => f.groep === LIGGER || f.groep === DOORSNEDE);
const opmaak = (code) => render(evaluate(parse(code), {}, { ...PROJECT[2] }));
const tekeningUit = (html) => html.match(/<div class="calc-svg">\s*(<svg[\s\S]*?<\/svg>)/)?.[1] ?? "";
/** KaTeX bewaart de LaTeX als annotatie; daar staan vanzelf dubbele accolades in. */
const zonderLatex = (html) => html.replace(/<annotation[\s\S]*?<\/annotation>/g, "");

/** Een invoerregel: een naam met alleen een getal en eventueel een eenheid. */
const INVOER = /^([\p{L}_][\p{L}\p{N}_,]*) = (-?\d+(?:\.\d+)?)((?: [^']*)?)('.*)?$/u;
const invoerVan = (code) => splitOpHide(code).zichtbaar.map((r) => r.match(INVOER)).filter(Boolean)
  .map((m) => ({ naam: m[1], getal: Number(m[2]), eenheid: m[3] ?? "" }));
/** Het fragment met andere invoer: naam → de nieuwe tekst achter het =-teken. */
const metInvoer = (code, wijzig) => code.split("\n").map((r) => {
  const m = r.match(INVOER);
  return m && m[1] in wijzig ? `${m[1]} = ${wijzig[m[1]]}${m[4] ?? ""}` : r;
}).join("\n");

/**
 * De ligger tegen een handberekening. `M(x)`, met x in meter vanaf het linker eind, is
 * los van het fragment opgeschreven: uit de reacties en het evenwicht van een afgesneden
 * deel. `getallen` staan zo in de tekening, `lasten` en `steunen` zijn de plaatsen in
 * meter van de pijlen en de opleggingen. `verborgen`: die tekst hoort niet te zien te zijn.
 */
const veld = (q, L) => (x) => (q * x * (L - x)) / 2;
const RA_OVERSTEK = (a) => (5 * (36 - a * a)) / 12;
const overstek = (a) => (x) => (x <= 6 ? RA_OVERSTEK(a) * x - 2.5 * x * x : -2.5 * (6 + a - x) ** 2);
const tweeVeldenQ = (x) => { const u = Math.min(x, 12 - x); return (3 * 5 * 6 * u) / 8 - 2.5 * u * u; };
const tweeVeldenF = (x) => { const u = Math.min(x, 12 - x); return u <= 3 ? 6.25 * u : 6.25 * u - 20 * (u - 3); };
const drieVelden = (x) => {
  if (x <= 6) return 12 * x - 2.5 * x * x;
  if (x <= 12) return -18 + 2.5 * (x - 6) * (12 - x);
  return 12 * (18 - x) - 2.5 * (18 - x) ** 2;
};
const LIGGERS = [
  { id: "ligger-twee-steunpunten-q", lengte: 6, M: veld(5, 6), punten: [0, 1.5, 3, 4.5, 6], getallen: { Mmax: 22.5, q: 5, L: 6 }, steunen: [0, 6] },
  { id: "ligger-twee-steunpunten-q", invoer: { q: "8 kN/m", L: "4000 mm" }, lengte: 4, M: veld(8, 4), punten: [0, 1, 2, 4], getallen: { Mmax: 16, q: 8, L: 4 }, steunen: [0, 4] },
  { id: "ligger-twee-steunpunten-f-midden", lengte: 6, M: (x) => 10 * Math.min(x, 6 - x), punten: [0, 1.5, 3, 4.5, 6], getallen: { Mmax: 30, F: 20, L: 6 }, lasten: [3], steunen: [0, 6] },
  { id: "ligger-twee-steunpunten-f-willekeurig", lengte: 6, M: (x) => (x <= 2 ? (80 / 6) * x : (40 / 6) * (6 - x)), punten: [0, 1, 2, 4, 6], getallen: { Mmax: (20 * 2 * 4) / 6, F: 20, a: 2, b: 4 }, lasten: [2], steunen: [0, 6] },
  { id: "ligger-twee-steunpunten-f-willekeurig", invoer: { a: "5 m" }, lengte: 6, M: (x) => (x <= 5 ? (20 / 6) * x : (100 / 6) * (6 - x)), punten: [0, 2.5, 5, 5.5, 6], getallen: { Mmax: (20 * 5 * 1) / 6, a: 5, b: 1 }, lasten: [5], steunen: [0, 6] },
  { id: "ligger-twee-steunpunten-twee-f", lengte: 6, M: (x) => 10 * Math.min(x, 2, 6 - x), punten: [0, 1, 2, 3, 4, 5, 6], getallen: { Mmax: 20, F: 10, a: 2 }, lasten: [2, 4], steunen: [0, 6] },
  { id: "ligger-twee-steunpunten-twee-f", invoer: { a: "1 m" }, lengte: 6, M: (x) => 10 * Math.min(x, 1, 6 - x), punten: [0, 1, 3, 5, 6], getallen: { Mmax: 10, a: 1 }, lasten: [1, 5], steunen: [0, 6] },
  { id: "ligger-twee-steunpunten-driehoekslast", lengte: 6, M: (x) => (5 * 6 * x) / 6 - (5 * x ** 3) / (6 * 6), punten: [0, 1.5, 3, 6 / Math.sqrt(3), 4.5, 6], getallen: { Mmax: (5 * 36) / (9 * Math.sqrt(3)), q: 5, L: 6 }, steunen: [0, 6] },
  { id: "ligger-ingeklemd-q", lengte: 6, M: (x) => -15 + 15 * x - 2.5 * x * x, punten: [0, 1.5, 3, 4.5, 6], getallen: { Msteun: -15, Mveld: 7.5, q: 5, L: 6 }, steunen: [0, 6] },
  { id: "ligger-ingeklemd-f-midden", lengte: 6, M: (x) => -15 + 10 * Math.min(x, 6 - x), punten: [0, 1.5, 3, 4.5, 6], getallen: { Msteun: -15, Mveld: 15, F: 20, L: 6 }, lasten: [3], steunen: [0, 6] },
  { id: "ligger-eenzijdig-ingeklemd-q", lengte: 6, M: (x) => -22.5 + 18.75 * x - 2.5 * x * x, punten: [0, 1.5, 3, 3.75, 4.5, 6], getallen: { MA: -22.5, Mveld: (9 * 5 * 36) / 128, q: 5, L: 6 }, steunen: [0, 6] },
  { id: "ligger-eenzijdig-ingeklemd-f-midden", lengte: 6, M: (x) => (x <= 3 ? -22.5 + 13.75 * x : 6.25 * (6 - x)), punten: [0, 1.5, 3, 4.5, 6], getallen: { MA: -22.5, MF: 18.75, F: 20, L: 6 }, lasten: [3], steunen: [0, 6] },
  { id: "uitkraging-q", lengte: 2, M: (x) => -2.5 * (2 - x) ** 2, punten: [0, 0.5, 1, 1.5, 2], getallen: { MA: -10, q: 5, L: 2 }, steunen: [0] },
  { id: "uitkraging-f", lengte: 2, M: (x) => -10 * (2 - x), punten: [0, 1, 2], getallen: { MA: -20, F: 10, L: 2 }, lasten: [2], steunen: [0] },
  { id: "ligger-overstek-q", lengte: 7.5, M: overstek(1.5), punten: [0, 1.5, RA_OVERSTEK(1.5) / 5, 4.5, 6, 6.75, 7.5], getallen: { Mveld: RA_OVERSTEK(1.5) ** 2 / 10, MB: -5.625, q: 5, L: 6, a: 1.5 }, steunen: [0, 6] },
  // Een overstek langer dan het veld: A trekt, het hele veld is negatief, en dan hoort er geen veldmoment bij.
  { id: "ligger-overstek-q", invoer: { a: "8 m" }, lengte: 14, M: overstek(8), punten: [0, 3, 6, 10, 14], getallen: { MB: -160, a: 8 }, steunen: [0, 6], verborgen: ["Mveld"] },
  { id: "ligger-twee-velden-q", lengte: 12, M: tweeVeldenQ, punten: [0, 2.25, 3, 6, 9, 9.75, 12], getallen: { MB: -22.5, Mveld: (9 * 5 * 36) / 128, q: 5, L: 6 }, steunen: [0, 6, 12] },
  { id: "ligger-twee-velden-f-midden", lengte: 12, M: tweeVeldenF, punten: [0, 1.5, 3, 4.5, 6, 9, 12], getallen: { MB: -22.5, MF: 18.75, F: 20, L: 6 }, lasten: [3, 9], steunen: [0, 6, 12] },
  { id: "ligger-drie-velden-q", lengte: 18, M: drieVelden, punten: [0, 2.4, 6, 9, 12, 15.6, 18], getallen: { MB: -18, "Mveld,1": 14.4, "Mveld,2": 4.5, q: 5, L: 6 }, steunen: [0, 6, 12, 18] },
  { id: "ligger-twee-steunpunten-q-op-x", lengte: 6, M: veld(5, 6), punten: [0, 1.5, 3, 6], getallen: { Mmax: 22.5, Mx: 16.875, Vx: 7.5, q: 5, x: 1.5 }, steunen: [0, 6] },
  { id: "ligger-twee-steunpunten-q-op-x", invoer: { x: "4 m" }, lengte: 6, M: veld(5, 6), punten: [0, 2, 4, 6], getallen: { Mmax: 22.5, Mx: 20, Vx: -5, x: 4 }, steunen: [0, 6] },
];

/**
 * De doorsnede op schaal, in mm: `breed` × `hoog` is de omhullende van de vorm,
 * `zwaartelijn` de afstand van de bovenkant tot de zwaartelijn. De gesloten vormen hebben
 * hun zwaartelijn in het midden; driehoek en samengestelde doorsnede volgen uit ΣA·z/ΣA.
 * `as`: afstand van de zwaartelijn tot de as van Steiner. `gat`: breedte van de holte.
 * `bogen`: het aantal bogen in de omtrek.
 */
const STEINER_H = Math.sqrt((12 * 1000e4) / 5000);
const TRAAG_H = Math.sqrt((12 * 2003e4) / 7810);
const DOORSNEDEN = [
  { id: "doorsnede-rechthoek", breed: 100, hoog: 200, zwaartelijn: 100, getallen: { b: 100, h: 200 } },
  { id: "doorsnede-rechthoek", invoer: { b: "300 mm", h: "30 cm" }, breed: 300, hoog: 300, zwaartelijn: 150, getallen: { b: 300, h: 300 } },
  { id: "doorsnede-rechthoek", invoer: { b: "400 mm", h: "50 mm" }, breed: 400, hoog: 50, zwaartelijn: 25, getallen: { b: 400, h: 50 } },
  { id: "doorsnede-cirkel", breed: 100, hoog: 100, zwaartelijn: 50, getallen: { d: 100 } },
  { id: "doorsnede-buis", breed: 168.3, hoog: 168.3, zwaartelijn: 84.15, gat: 152.3, getallen: { D: 168.3, t: 8 } },
  { id: "doorsnede-koker", breed: 100, hoog: 200, zwaartelijn: 100, gat: 84, getallen: { b: 100, h: 200, t: 8 } },
  { id: "doorsnede-i-profiel", breed: 150, hoog: 300, zwaartelijn: 150, bogen: 4, getallen: { h: 300, b: 150, tw: 7.1, tf: 10.7, r: 15 } },
  // HEB 200: een H-profiel loopt langs dezelfde weg.
  { id: "doorsnede-i-profiel", invoer: { h: "200 mm", b: "200 mm", t_w: "9 mm", t_f: "15 mm", r: "18 mm" }, breed: 200, hoog: 200, zwaartelijn: 100, bogen: 4, getallen: { h: 200, b: 200, tw: 9, tf: 15, r: 18 } },
  { id: "doorsnede-i-profiel", invoer: { r: "0 mm" }, breed: 150, hoog: 300, zwaartelijn: 150, getallen: { r: 0 } },
  { id: "doorsnede-driehoek", breed: 300, hoog: 200, zwaartelijn: 200 - 200 / 3, getallen: { b: 300, h: 200, zc: 200 / 3 } },
  { id: "doorsnede-driehoek", invoer: { h: "600 mm" }, breed: 300, hoog: 600, zwaartelijn: 400, getallen: { h: 600, zc: 200 } },
  // Steiner rekent zonder vorm: de rechthoek met dezelfde A en I₀, dus h = √(12·I₀/A) en b = A/h.
  { id: "doorsnede-steiner", breed: 5000 / STEINER_H, hoog: STEINER_H, zwaartelijn: STEINER_H / 2, as: 100, grootste: STEINER_H + 100, getallen: { a: 100, Iy: 1000 + 50 * 10 ** 2 } },
  { id: "doorsnede-steiner", invoer: { a: "-50 mm" }, breed: 5000 / STEINER_H, hoog: STEINER_H, zwaartelijn: STEINER_H / 2, as: -50, grootste: STEINER_H + 50, getallen: { a: -50, Iy: 1000 + 50 * 5 ** 2 } },
  // De T-balk uit het fragment: 200 × 20 en 10 × 180, zwaartelijn op (4000·10 + 1800·110)/5800.
  { id: "doorsnede-samengesteld", breed: 200, hoog: 200, zwaartelijn: (4000 * 10 + 1800 * 110) / 5800, getallen: { zc: (4000 * 10 + 1800 * 110) / 5800, z1: 10, z2: 110 } },
  { id: "doorsnede-traagheidsstraal", breed: 7810 / TRAAG_H, hoog: TRAAG_H, zwaartelijn: TRAAG_H / 2, getallen: { iz: Math.sqrt(2003e4 / 7810) } },
];

/** Klasse op een element in de tekening. */
const metKlasse = (gelezen, klasse) => gelezen.elementen.filter((el) => el.klasse.split(" ").includes(klasse));
let handTekening = 0;
function getalKlopt(wat, gelezen, naam, verwacht) {
  const g = getalInTekst(gelezen, naam);
  if (!g) return meld(false, `${wat}: ${naam} in de tekening`, "die tekst staat er niet");
  const ok = Math.abs(g.waarde - verwacht) <= 5e-3 * Math.max(Math.abs(verwacht), 1e-6);
  if (meld(ok, `${wat}: ${naam} = ${g.waarde}`, `verwacht ${Number(verwacht.toPrecision(5))}, staat er ${g.waarde}`)) handTekening++;
  return ok;
}

console.log("\nDe momentenlijn tegen een handberekening:");
const perFormule = new Map(FORMULES.map((f) => [f.id, f]));
{
  const nu = handTekening;
  for (const g of LIGGERS) {
    const f = perFormule.get(g.id);
    const wat = `${g.id}${g.invoer ? ` (${Object.entries(g.invoer).map(([n, w]) => `${n} = ${w}`).join(", ")})` : ""}`;
    const code = g.invoer ? metInvoer(f.code, g.invoer) : f.code;
    const svg = tekeningUit(opmaak(code));
    if (!meld(svg !== "", `${wat}: tekening`, "geen tekening in de uitwerking")) continue;
    const gelezen = leesSvg(svg);
    const [lijn] = metKlasse(gelezen, "tk-moment");
    const [nul] = metKlasse(gelezen, "tk-nul");
    if (!meld(lijn && nul, `${wat}: momentenlijn en nullijn`, "niet gevonden")) continue;

    // De lijn staat op schaal: de punten met het grootste moment geven de schaal, de rest moet daarop liggen.
    const stukken = leesPad(lijn.attrs.d);
    const x0 = Number(nul.attrs.x1);
    const x1 = Number(nul.attrs.x2);
    const y0 = Number(nul.attrs.y1);
    const px = (x) => x0 + (x / g.lengte) * (x1 - x0);
    const grootste = g.punten.reduce((a, b) => (Math.abs(g.M(b)) > Math.abs(g.M(a)) ? b : a));
    const yMax = yOpPad(stukken, px(grootste));
    const schaal = (yMax - y0) / g.M(grootste);
    // Aan de trekzijde: een positief moment staat onder de ligger, en y loopt naar beneden.
    if (!meld(schaal > 0, `${wat}: het moment staat aan de trekzijde`, `op x = ${grootste} is M = ${g.M(grootste)} maar de lijn staat ${y0 - yMax} px boven de nullijn`)) continue;
    meld(Math.abs(yMax - y0) >= 30, `${wat}: de lijn benut zijn vak`, `grootste uitslag ${Math.abs(yMax - y0)} px`);
    for (const x of g.punten) {
      const y = yOpPad(stukken, px(x));
      const verwacht = y0 + g.M(x) * schaal;
      const ok = y !== null && Math.abs(y - verwacht) <= 0.6;
      if (meld(ok, `${wat}: M(${x}) = ${g.M(x).toFixed(2)}`, `verwacht y = ${verwacht.toFixed(1)}, op de lijn ${y === null ? "geen punt" : y.toFixed(1)}`)) handTekening++;
    }
    for (const [naam, waarde] of Object.entries(g.getallen)) getalKlopt(wat, gelezen, naam, waarde);
    for (const naam of g.verborgen ?? []) {
      const el = getalInTekst(gelezen, naam)?.element;
      meld(!el || /opacity:\s*0\b/.test(el.attrs.style ?? ""), `${wat}: ${naam} staat niet in beeld`);
    }
    // De pijlen en de opleggingen staan op hun plaats.
    const op = (klasse, xs) => {
      const gevonden = metKlasse(gelezen, klasse).map((el) => el.matrix[4]);
      const ok = gevonden.length === xs.length && xs.every((x, i) => Math.abs(gevonden[i] - px(x)) <= 0.6);
      meld(ok, `${wat}: ${klasse} op ${xs.join(", ")} m`, `verwacht ${xs.map((x) => px(x).toFixed(1)).join(", ")}, staat op ${gevonden.join(", ")}`);
    };
    if (g.lasten) op("tk-puntlast", g.lasten);
    op("tk-steun", g.steunen);
  }
  console.log(`  ${LIGGERS.length} gevallen, ${handTekening - nu} getallen en punten kloppen met de handberekening`);

  // De tekening verzint geen eigen getal: verander de formule in het fragment, en getal en lijn volgen.
  const andereFormule = (id, regel, nieuw) => perFormule.get(id).code.split("\n").map((r) => (r === regel ? nieuw : r)).join("\n");
  {
    const wat = "ligger-ingeklemd-q met een ander steunmoment";
    const gelezen = leesSvg(tekeningUit(opmaak(andereFormule("ligger-ingeklemd-q", "M_steun = q*L^2/12 to kN*m", "M_steun = 30 kN*m"))));
    getalKlopt(wat, gelezen, "Msteun", -30);
    const y0 = Number(metKlasse(gelezen, "tk-nul")[0].attrs.y1);
    const stukken = leesPad(metKlasse(gelezen, "tk-moment")[0].attrs.d);
    const verhouding = (y0 - yOpPad(stukken, 40)) / (yOpPad(stukken, 200) - y0);
    meld(Math.abs(verhouding - 30 / 7.5) <= 0.1, `${wat}: de lijn volgt`, `verhouding ${verhouding.toFixed(2)}, verwacht 4`);
  }
  {
    const wat = "uitkraging-f met een ander inklemmingsmoment";
    const gelezen = leesSvg(tekeningUit(opmaak(andereFormule("uitkraging-f", "M_A = F*L to kN*m", "M_A = 7 kN*m"))));
    getalKlopt(wat, gelezen, "MA", -7);
  }
}

console.log("\nDe doorsnede op schaal tegen de hand:");
{
  const nu = handTekening;
  for (const d of DOORSNEDEN) {
    const f = perFormule.get(d.id);
    const wat = `${d.id}${d.invoer ? ` (${Object.entries(d.invoer).map(([n, w]) => `${n} = ${w}`).join(", ")})` : ""}`;
    const code = d.invoer ? metInvoer(f.code, d.invoer) : f.code;
    const svg = tekeningUit(opmaak(code));
    if (!meld(svg !== "", `${wat}: tekening`, "geen tekening in de uitwerking")) continue;
    const gelezen = leesSvg(svg);
    const vorm = metKlasse(gelezen, "tk-vorm");
    const [zw] = metKlasse(gelezen, "tk-zwaartelijn");
    if (!meld(vorm.length > 0 && zw, `${wat}: vorm en zwaartelijn`, "niet gevonden")) continue;
    const [l, b, r, o] = omhullende(vorm);
    const schaal = Math.max((r - l) / d.breed, (o - b) / d.hoog);
    const px = (mm) => mm * schaal;
    // Op schaal, en de grootste maat vult het vak.
    if (meld(Math.abs(r - l - px(d.breed)) <= 0.6 && Math.abs(o - b - px(d.hoog)) <= 0.6, `${wat}: ${d.breed} × ${d.hoog} op schaal`, `${(r - l).toFixed(1)} × ${(o - b).toFixed(1)} px bij schaal ${schaal.toFixed(4)}`)) handTekening++;
    const grootste = d.grootste ?? Math.max(d.breed, d.hoog);
    meld(Math.abs(px(grootste) - 150) <= 0.6, `${wat}: de grootste maat is 150 px`, `${px(grootste).toFixed(1)} px`);
    const zy = zw.punten[0][1];
    if (meld(Math.abs(zy - b - px(d.zwaartelijn)) <= 0.6, `${wat}: zwaartelijn op ${d.zwaartelijn.toFixed(2)} mm van boven`, `op ${((zy - b) / schaal).toFixed(2)} mm`)) handTekening++;
    if (d.as !== undefined) {
      const [as] = metKlasse(gelezen, "tk-as");
      if (meld(as && Math.abs(as.punten[0][1] - zy - px(d.as)) <= 0.6, `${wat}: de as op ${d.as} mm van de zwaartelijn`, as ? `op ${((as.punten[0][1] - zy) / schaal).toFixed(1)} mm` : "geen as")) handTekening++;
    }
    if (d.gat !== undefined) {
      const holte = leesPad(vorm[0].attrs.d).filter((s) => s.soort !== "Z").flatMap((s) => [s.van[0], s.naar[0]]).filter((x) => x > l + 0.5 && x < r - 0.5);
      const breedte = Math.max(...holte) - Math.min(...holte);
      if (meld(Math.abs(breedte - px(d.gat)) <= 0.6, `${wat}: de holte is ${d.gat} mm breed`, `${(breedte / schaal).toFixed(1)} mm`)) handTekening++;
    }
    if (d.bogen !== undefined) {
      const stukken = leesPad(vorm[0].attrs.d ?? "");
      meld(vorm.length === 1 && vorm[0].tag === "path", `${wat}: één pad, geen losse rechthoeken`);
      meld(stukken.filter((s) => s.soort === "A").length === d.bogen, `${wat}: ${d.bogen} bogen in de omtrek`, `${stukken.filter((s) => s.soort === "A").length}`);
    }
    for (const [naam, waarde] of Object.entries(d.getallen)) getalKlopt(wat, gelezen, naam, waarde);
    meld(metKlasse(gelezen, "tk-hartlijn").length === 1, `${wat}: een hartlijn`);
  }
  console.log(`  ${DOORSNEDEN.length} gevallen, ${handTekening - nu} maten en getallen kloppen met de handberekening`);
}

// ─── 5. Twee talen ──────────────────────────────────────────────────
console.log("\nDe tekeningen in twee talen:");
{
  const WOORDEN_NL = /zwaartelijn|hartlijn|momentenlijn|trekzijde|rechthoek|tekening|doorbuiging|invoer/i;
  const WOORDEN_EN = /centroid|centre line|bending moment|tension side|rectangle|drawing|deflection|\binput\b/i;
  /** Wat overblijft zonder tekst en toelichting: dat moet in beide talen hetzelfde zijn. */
  const rekenregels = (code) => code.split("\n")
    .filter((r) => !r.startsWith("'") && !r.startsWith("//") && !r.trim().startsWith("<text"))
    .map((r) => r.replace(/', [^']*'$/, ""));
  const tekst = (code) => code.split("\n").filter((r) => r.startsWith("'") || r.startsWith("//") || r.trim().startsWith("<text") || /', [^']*'$/.test(r))
    .map((r) => r.replace(/<\/?[a-zA-Z][^>]*>/g, " ").replace(/\{\{\w+\}\}/g, " ")).join("\n");
  let goed2 = 0;
  for (const f of MET_TEKENING) {
    let ok = meld(typeof f.codeEn === "string" && f.codeEn !== f.code, `${f.id}: heeft een Engels fragment`);
    if (!ok) continue;
    ok = meld(codeVan(f, "en") === f.codeEn && codeVan(f, "nl") === f.code, `${f.id}: codeVan volgt de taal`) && ok;
    ok = meld(rekenregels(f.code).join("\n") === rekenregels(f.codeEn).join("\n"), `${f.id}: dezelfde rekenregels in beide talen`) && ok;
    ok = meld(!WOORDEN_EN.test(tekst(f.code)), `${f.id}: geen Engels in de Nederlandse tekst`, tekst(f.code).match(WOORDEN_EN)?.[0]) && ok;
    ok = meld(!WOORDEN_NL.test(tekst(f.codeEn)), `${f.id}: geen Nederlands in de Engelse tekst`, tekst(f.codeEn).match(WOORDEN_NL)?.[0]) && ok;
    const zonderTekst = (svg) => svg.replace(/>[^<]+</g, "><").replace(/<text[\s\S]*?<\/text>/g, "<text/>");
    ok = meld(zonderTekst(tekeningUit(opmaak(f.code))) === zonderTekst(tekeningUit(opmaak(f.codeEn))), `${f.id}: dezelfde tekening in beide talen`) && ok;
    if (ok) goed2++;
  }
  console.log(`  ${goed2} van ${MET_TEKENING.length} fragmenten rekenen en tekenen in beide talen gelijk`);
}

// ─── 6. Invoer 0 en extreme verhoudingen ────────────────────────────
console.log("\nInvoer 0 en extreme verhoudingen:");
{
  const SLECHT = /NaN|undefined|\{\{/;
  let gevallen = 0;
  let getekend = 0;
  const controleer = (f, taal, wat, wijzig) => {
    const code = metInvoer(codeVan(f, taal), wijzig);
    let html;
    try {
      html = zonderLatex(opmaak(code));
    } catch (err) {
      return meld(false, `${f.id} (${taal}) ${wat}`, `rekenkern gooit: ${err.message}`);
    }
    gevallen++;
    const svg = tekeningUit(html);
    let ok = meld(!SLECHT.test(html), `${f.id} (${taal}) ${wat}: geen NaN of {{…}}`, html.match(/.{40}(?:NaN|undefined|\{\{).{40}/s)?.[0]);
    if (svg) {
      getekend++;
      ok = meld(!/∞/.test(svg), `${f.id} (${taal}) ${wat}: geen ∞ in de tekening`) && ok;
      const buiten = buitenVak(leesSvg(svg));
      ok = meld(buiten.length === 0, `${f.id} (${taal}) ${wat}: in het vak`, buiten.join("; ")) && ok;
    }
    return ok;
  };
  for (const f of MET_TEKENING) {
    for (const taal of ["nl", "en"]) {
      const inv = invoerVan(codeVan(f, taal));
      const met = (fn) => Object.fromEntries(inv.map((i) => [i.naam, fn(i)]));
      controleer(f, taal, "alles 0", met((i) => `0${i.eenheid}`));
      controleer(f, taal, "alles 0 zonder eenheid", met(() => "0"));
      for (const a of inv) {
        controleer(f, taal, `${a.naam} = 0`, { [a.naam]: `0${a.eenheid}` });
        controleer(f, taal, `${a.naam} = 0 zonder eenheid`, { [a.naam]: "0" });
        controleer(f, taal, `${a.naam} × 1000`, { [a.naam]: `${a.getal * 1000}${a.eenheid}` });
        controleer(f, taal, `${a.naam} / 1000`, { [a.naam]: `${a.getal / 1000}${a.eenheid}` });
        controleer(f, taal, `${a.naam} × 1e6`, { [a.naam]: `${a.getal * 1e6}${a.eenheid}` });
        controleer(f, taal, `${a.naam} negatief`, { [a.naam]: `${-a.getal}${a.eenheid}` });
        for (const b of inv) {
          if (a.naam < b.naam) controleer(f, taal, `${a.naam} = ${b.naam} = 0`, { [a.naam]: `0${a.eenheid}`, [b.naam]: `0${b.eenheid}` });
        }
      }
    }
  }
  console.log(`  ${gevallen} gevallen doorgerekend, ${getekend} met een tekening`);

  // Een extreme verhouding is geen fout in de invoer: de tekening hoort er dan gewoon te staan.
  const MOET = [
    ["doorsnede-rechthoek", { b: "1 mm", h: "10000 mm" }],
    ["doorsnede-rechthoek", { b: "10000 mm", h: "1 mm" }],
    ["doorsnede-cirkel", { d: "100000 mm" }],
    ["doorsnede-buis", { D: "1000 mm", t: "1 mm" }],
    ["doorsnede-buis", { D: "100 mm", t: "50 mm" }],
    ["doorsnede-koker", { b: "20 mm", h: "2000 mm", t: "2 mm" }],
    ["doorsnede-koker", { b: "2000 mm", h: "20 mm", t: "2 mm" }],
    ["doorsnede-i-profiel", { h: "3000 mm", b: "50 mm", t_w: "2 mm", t_f: "3 mm", r: "1 mm" }],
    ["doorsnede-i-profiel", { h: "30 mm", b: "3000 mm", t_w: "2 mm", t_f: "3 mm", r: "100 mm" }],
    ["doorsnede-i-profiel", { r: "1000 mm" }],
    ["doorsnede-driehoek", { b: "1 mm", h: "10000 mm" }],
    ["doorsnede-driehoek", { b: "10000 mm", h: "1 mm" }],
    ["doorsnede-steiner", { a: "100000 mm" }],
    ["doorsnede-steiner", { I_0: "1 cm^4", A: "1000 cm^2" }],
    ["doorsnede-steiner", { I_0: "100000 cm^4", A: "1 cm^2" }],
    ["doorsnede-samengesteld", { A_1: "1 mm^2" }],
    ["doorsnede-samengesteld", { z_2: "100000 mm" }],
    ["doorsnede-traagheidsstraal", { I_z: "1 cm^4", A: "1000 cm^2" }],
    ["doorsnede-traagheidsstraal", { I_z: "100000 cm^4", A: "1 cm^2" }],
    ["ligger-twee-steunpunten-q", { q: "100000 kN/m", L: "1 mm" }],
    ["ligger-twee-steunpunten-q", { q: "0.0001 kN/m", L: "1000 m" }],
    ["ligger-twee-steunpunten-f-willekeurig", { L: "1000 m", a: "0.001 m" }],
    ["ligger-twee-steunpunten-f-willekeurig", { L: "1000 m", a: "999.999 m" }],
    ["ligger-twee-steunpunten-twee-f", { L: "1000 m", a: "0.001 m" }],
    ["ligger-twee-steunpunten-twee-f", { L: "6 m", a: "3 m" }],
    ["ligger-overstek-q", { L: "1 m", a: "1000 m" }],
    ["ligger-overstek-q", { L: "1000 m", a: "1 m" }],
    ["ligger-overstek-q", { a: "0 m" }],
    ["ligger-twee-steunpunten-q-op-x", { L: "1000 m", x: "1000 m" }],
    ["ligger-twee-steunpunten-q-op-x", { x: "0 m" }],
  ];
  let staat = 0;
  for (const [id, wijzig] of MOET) {
    const f = perFormule.get(id);
    for (const taal of ["nl", "en"]) {
      const wat = Object.entries(wijzig).map(([n, w]) => `${n} = ${w}`).join(", ");
      controleer(f, taal, wat, wijzig);
      if (meld(tekeningUit(opmaak(metInvoer(codeVan(f, taal), wijzig))) !== "", `${id} (${taal}) ${wat}: de tekening staat er`)) staat++;
    }
  }
  console.log(`  ${staat} van ${MOET.length * 2} extreme verhoudingen hebben een tekening binnen het vak`);

  // Schaal op de grootste maat: bij een extreme verhouding blijft de grootste maat 150 px.
  for (const [id, wijzig] of MOET.filter(([id]) => id.startsWith("doorsnede-"))) {
    const svg = tekeningUit(opmaak(metInvoer(perFormule.get(id).code, wijzig)));
    if (!svg) continue;
    const [l, b, r, o] = omhullende(metKlasse(leesSvg(svg), "tk-vorm"));
    const wat = Object.entries(wijzig).map(([n, w]) => `${n} = ${w}`).join(", ");
    // Bij Steiner en de samengestelde doorsnede kan de grootste maat ook de afstand zijn.
    meld(Math.max(r - l, o - b) <= 150.6, `${id} ${wat}: niet groter dan 150 px`, `${Math.max(r - l, o - b).toFixed(1)} px`);
  }
}

// ─── 7. Alles achter elkaar in één blad ─────────────────────────────
console.log("\nAlles achter elkaar in één blad:");
{
  /** Alle namen die een fragment zet, met of zonder #hide. */
  const namenIn = (code) => new Set(code.split("\n")
    .map((r) => r.match(/^\s*([\p{L}_][\p{L}\p{N}_,]*)\s*=/u)?.[1])
    .filter(Boolean).map((n) => n.replaceAll(",", "_")));
  const hulpNamen = (code) => new Set(splitOpHide(code).verborgen
    .map((r) => r.match(/^\s*([\p{L}_][\p{L}\p{N}_,]*)\s*=/u)?.[1]).filter(Boolean));
  const voorvoegsels = new Map();
  for (const f of MET_TEKENING) {
    const namen = [...hulpNamen(f.code)];
    meld(namen.length > 0, `${f.id}: hulpvariabelen achter #hide`);
    const voor = namen[0]?.split("_")[0] ?? "";
    meld(voor !== "" && namen.every((n) => n.startsWith(`${voor}_`)), `${f.id}: één voorvoegsel voor de hulpvariabelen`, namen.filter((n) => !n.startsWith(`${voor}_`)).join(", "));
    meld(!voorvoegsels.has(voor), `${f.id}: eigen voorvoegsel ${voor}`, `ook bij ${voorvoegsels.get(voor)}`);
    voorvoegsels.set(voor, f.id);
    // Geen ander fragment, ook niet uit de Library, zet of leest een naam met dit voorvoegsel.
    for (const ander of [...FORMULES, ...LIBRARY]) {
      if (ander.id === f.id) continue;
      for (const code of [ander.code, ander.codeEn ?? ""]) {
        const botst = namen.filter((n) => new RegExp(`(?<![\\p{L}\\p{N}_])${n}(?![\\p{L}\\p{N}_])`, "u").test(code));
        if (botst.length) meld(false, `${f.id}: ${botst.join(", ")} komt ook voor in ${ander.id}`);
      }
    }
    // En een fragment zet zijn eigen hulpnaam niet buiten #hide.
    const zichtbaar = namenIn(splitOpHide(f.code).zichtbaar.join("\n"));
    meld(namen.every((n) => !zichtbaar.has(n)), `${f.id}: hulpvariabelen alleen achter #hide`);
  }

  const volgordes = [
    ["voor naar achter", [...FORMULES]],
    ["achter naar voor", [...FORMULES].reverse()],
    ["alleen de tekeningen", MET_TEKENING],
  ];
  for (const [naam, lijst] of volgordes) {
    for (const taal of ["nl", "en"]) {
      const samen = lijst.map((f) => codeVan(f, taal)).join("\n");
      const v = reken(samen, PROJECT[2]);
      const nu = v.filter((n) => n.type === "assignment");
      let i = 0;
      let gelijk = true;
      for (const f of lijst) {
        for (const n of reken(codeVan(f, taal), PROJECT[2]).filter((m) => m.type === "assignment")) {
          const hier = nu[i++];
          if (!hier || hier.name !== n.name || hier.result !== n.result || hier.unit !== n.unit) {
            gelijk = meld(false, `${naam} (${taal}): ${f.id}: ${n.name}`, `los ${n.result} ${n.unit}, in het blad ${hier?.name} = ${hier?.result} ${hier?.unit}`) && gelijk;
          }
        }
      }
      // De tekening is hetzelfde als los, tot op de laatste letter.
      const tekeningen = (knopen) => knopen.filter((n) => n.type === "svg").map((n) => n.content);
      const inHetBlad = tekeningen(v);
      const los = lijst.flatMap((f) => tekeningen(reken(codeVan(f, taal), PROJECT[2])));
      gelijk = meld(inHetBlad.length === MET_TEKENING.length && inHetBlad.join("\n") === los.join("\n"), `${naam} (${taal}): de tekeningen zijn gelijk aan los`, `${inHetBlad.length} en ${los.length} tekeningen, verwacht ${MET_TEKENING.length}`) && gelijk;
      if (gelijk) console.log(`  ${naam} (${taal}): ${nu.length} uitkomsten en ${los.length} tekeningen gelijk aan los`);
    }
  }
}

console.log(`\nIn totaal ${goed + handTekening} uitkomsten tegen een handberekening: ${goed} uit de formules, ${handTekening} uit de tekeningen.`);
console.log(fouten === 0 ? "\nFormulebibliotheek in orde." : `\n${fouten} fout(en) in de formulebibliotheek.`);
process.exit(fouten === 0 ? 0 : 1);
