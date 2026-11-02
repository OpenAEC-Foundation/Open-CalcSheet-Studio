/**
 * Vectoren en matrices volgens de rekentaal van CalcPAD.
 *
 * In CalcPAD scheidt `|` de RIJEN van een matrix en `;` de elementen binnen
 * een rij: `[1; 2 | 3; 4]` heeft de rijen [1, 2] en [3, 4]. De kern las de
 * `|`-delen eerder als kolommen. Elke matrix stond daardoor gekanteld: A*B
 * en een niet-symmetrisch stelsel gaven een fout antwoord, en n_rows, n_cols,
 * A.(i; j) en de opzoekfuncties waren op die kanteling gebouwd. Daarnaast
 * loste lsolve alleen een onderdriehoeksmatrix op (stil fout bij elke andere),
 * ging `A.(i; j) = …` als tekst door, en stond een matrix als ruwe tekst in de
 * uitwerking.
 *
 * Deze controle legt de uitkomsten vast die CalcPAD geeft, met de hand of uit
 * de voorbeelden in de CalcPAD-handleiding nagerekend:
 *   • A = [1; 2 | 3; 4], B = [5; 6 | 7; 8]:  A·B = [19; 22 | 43; 50],
 *     Aᵀ = [1; 3 | 2; 4], A·[1; 1] = [3; 7]
 *   • inverse([4; 7 | 2; 6]) = [0,6; −0,7 | −0,2; 0,4], det = 4·6 − 7·2 = 10
 *   • [1; 2 | 3; 4]·x = [5; 6]:  x = [−4; 4,5]  (niet-symmetrisch)
 *   • K = [2; −1; 0 | −1; 2; −1 | 0; −1; 1], F = [0; 0; 1]:  u = [1; 2; 3]
 *     (drie veren in serie, k = 1, kracht 1 op het eind)
 *   • handleiding: [8; 6; −4 | 6; 12; −3 | −4; −3; 9]·x = [10; 20; 30]
 *     → x = [2,5; 1,6667; 5]
 *   • met eenheden: K = [2; −1 | −1; 1]·1000 kN/m, F = [0; 10] kN
 *     → u = [0,01; 0,02] m; een balkelement met kN/m, kN en kNm geeft de
 *     verplaatsing in m en de rotatie dimensieloos
 *   • de profieltabel [id | b | h] met hlookup: zoeken in rij 1, terug uit
 *     rij 2 of 3 — zoals de rekenbladen balklaag en ligger hem gebruiken
 *
 * Draaien:  node scripts/check-matrices.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { parse, evaluate, extractScope, render } from "../packages/core/dist/index.js";

let fouten = 0;
let getest = 0;
const meld = (ok, wat, detail = "") => {
  getest++;
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};
const kop = (t) => console.log(`\n${t}`);

/** De scope na het doorrekenen van een blad. */
const scopeVan = (bron, waarden = {}) => extractScope(parse(bron), waarden);
/** De uitgerekende knopen van een blad. */
const knopenVan = (bron, waarden = {}) => evaluate(parse(bron), waarden);

/** Een vector of matrix als (geneste) lijst getallen; met `eenheid` omgerekend naar die eenheid. */
function getallen(v, eenheid) {
  const a = v && typeof v.toArray === "function" ? v.toArray() : v;
  const omzet = (x) => {
    if (Array.isArray(x)) return x.map(omzet);
    if (x && typeof x.toNumber === "function") return eenheid ? x.toNumber(eenheid) : x.toNumber();
    return x;
  };
  return omzet(a);
}
const afm = (v) => (v && typeof v.size === "function" ? v.size() : null);

/** Gelijk, element voor element, binnen een relatieve tolerantie. */
function gelijk(a, b, tol = 1e-9) {
  if (Array.isArray(b)) return Array.isArray(a) && a.length === b.length && b.every((x, i) => gelijk(a[i], x, tol));
  return typeof a === "number" && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
}
const toon = (x) => JSON.stringify(x);
const isGelijk = (wat, a, b, tol) => meld(gelijk(a, b, tol), wat, `${toon(a)} ≠ ${toon(b)}`);

/** De LaTeX van alle formuleregels in de HTML. */
const latexVan = (html) =>
  [...html.matchAll(/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/g)].map((m) => m[1].replace(/&amp;/g, "&"));

// ─── 1. Opbouw: per | een rij ─────────────────────────────────────────────
kop("1. Matrixliteraal: `|` scheidt de rijen, `;` de elementen");
{
  const s = scopeVan(`A = [1; 2 | 3; 4]
B = [1; 2; 3 | 4; 5; 6]
a12 = A.(1; 2)
a21 = A.(2; 1)
b13 = B.(1; 3)
m = n_rows(B)
n = n_cols(B)
v = [1; 2; 3]
v2 = v.2
k = 3
vk = v.k
nv = n_rows(v)
R = [1 | 2; 3 | 4; 5; 6]
a = [1; 2; 4]
V = [a | 2*a + 1]
w = [0; a; 6]`);
  isGelijk("A = [1; 2 | 3; 4] heeft rijen [1, 2] en [3, 4]", getallen(s.A), [[1, 2], [3, 4]]);
  meld(s.a12 === 2 && s.a21 === 3, "A.(1; 2) = 2 en A.(2; 1) = 3 (rij, kolom)", `${s.a12}, ${s.a21}`);
  meld(s.m === 2 && s.n === 3 && s.b13 === 3, "[1; 2; 3 | 4; 5; 6]: n_rows 2, n_cols 3, B.(1; 3) = 3", `${s.m}, ${s.n}, ${s.b13}`);
  meld(s.v2 === 2 && s.vk === 3 && s.nv === 3, "vector: v.2, v.k en n_rows", `${s.v2}, ${s.vk}, ${s.nv}`);
  isGelijk("kortere rijen worden met nullen aangevuld", getallen(s.R), [[1, 0, 0], [2, 3, 0], [4, 5, 6]]);
  isGelijk("een vector als element vult een hele rij: [a | 2*a + 1]", getallen(s.V), [[1, 2, 4], [3, 5, 9]]);
  isGelijk("een vector in een vector wordt uitgevouwen: [0; a; 6]", getallen(s.w), [0, 1, 2, 4, 6]);
  const tekst = knopenVan("'Profieltabel [id | b | h]").map((n) => n.text).join("");
  meld(tekst.includes("[id | b | h]"), "tekst met [id | b | h] blijft tekst", tekst);
}

// ─── 2. Rekenen ──────────────────────────────────────────────────────────
kop("2. Product, transponeren, inverse en determinant");
{
  const s = scopeVan(`A = [1; 2 | 3; 4]
B = [5; 6 | 7; 8]
C = A*B
w = A*[1; 1]
At = transp(A)
At2 = transpose(A)
M = [4; 7 | 2; 6]
Mi = inverse(M)
Mi2 = inv(M)
d = det(M)
I = M*Mi
r = rank([1; 2; 3 | 4; 5; 6 | 7; 8; 9])
t = trace([1; 2; 3 | 4; 5; 6 | 7; 8; 9])
e = eigenvals([2; -1 | -1; 2])`);
  isGelijk("A·B = [19; 22 | 43; 50]", getallen(s.C), [[19, 22], [43, 50]]);
  isGelijk("A·[1; 1] = [3; 7]", getallen(s.w), [3, 7]);
  isGelijk("transp(A) = [1; 3 | 2; 4]", getallen(s.At), [[1, 3], [2, 4]]);
  isGelijk("transpose(A) is hetzelfde", getallen(s.At2), [[1, 3], [2, 4]]);
  isGelijk("inverse([4; 7 | 2; 6]) = [0,6; −0,7 | −0,2; 0,4]", getallen(s.Mi), [[0.6, -0.7], [-0.2, 0.4]]);
  isGelijk("inv() is hetzelfde", getallen(s.Mi2), [[0.6, -0.7], [-0.2, 0.4]]);
  meld(gelijk(s.d, 10), "det = 10", String(s.d));
  isGelijk("M·M⁻¹ = I", getallen(s.I), [[1, 0], [0, 1]]);
  meld(s.r === 2, "rank([1; 2; 3 | 4; 5; 6 | 7; 8; 9]) = 2", String(s.r));
  meld(s.t === 15, "trace = 15", String(s.t));
  isGelijk("eigenvals([2; −1 | −1; 2]) = [1; 3]", getallen(s.e), [1, 3]);
}

// ─── 3. Stelsels oplossen ────────────────────────────────────────────────
kop("3. lsolve, clsolve en msolve: algemene oplosser, platte vector");
{
  const s = scopeVan(`A = [1; 2 | 3; 4]
x = lsolve(A; [5; 6])
K = [2; -1; 0 | -1; 2; -1 | 0; -1; 1]
F = [0; 0; 1]
u = lsolve(K; F)
uc = clsolve(K; F)
H = [8; 6; -4 | 6; 12; -3 | -4; -3; 9]
h = lsolve(H; [10; 20; 30])
X = msolve(H; join_cols([10; 20; 30]; [40; 50; 60]))
c = H*h`);
  isGelijk("niet-symmetrisch: [1; 2 | 3; 4]·x = [5; 6] → x = [−4; 4,5]", getallen(s.x), [-4, 4.5]);
  meld(toon(afm(s.x)) === "[2]", "de uitkomst is een platte vector", toon(afm(s.x)));
  isGelijk("stijfheidsmatrix 3×3: u = [1; 2; 3]", getallen(s.u), [1, 2, 3]);
  isGelijk("clsolve geeft hetzelfde", getallen(s.uc), [1, 2, 3]);
  isGelijk("handleiding: x = [2,5; 1,6667; 5]", getallen(s.h), [2.5, 5 / 3, 5]);
  isGelijk("controle H·x = b", getallen(s.c), [10, 20, 30]);
  isGelijk("msolve: per kolom van B een oplossing", getallen(s.X), [[2.5, 61 / 7], [5 / 3, 8 / 3], [5, 80 / 7]]);
  const fout = knopenVan("S = lsolve([1; 2; 3 | 4; 5; 6 | 7; 8; 9]; [1; 2; 3])")[0];
  meld(/singulier/.test(fout?.result ?? ""), "een singuliere matrix geeft een foutmelding, geen stil antwoord", fout?.result);
}

kop("4. lsolve met eenheden");
{
  const s = scopeVan(`K = [2; -1 | -1; 1]*1000 kN/m
F = [0; 10] kN
u = lsolve(K; F)
u_1 = u.1
EI = 210000 N/mm^2*8356 cm^4
L = 6 m
k = [12*EI/L^3; 6*EI/L^2 | 6*EI/L^2; 4*EI/L]
P = [10 kN; 0 kN*m]
r = lsolve(k; P)
w = r.1
φ = r.2`);
  isGelijk("K in kN/m, F in kN: u = [0,01; 0,02] m", getallen(s.u, "m"), [0.01, 0.02]);
  meld(gelijk(s.u_1?.toNumber?.("m"), 0.01), "u.1 is een lengte: 0,01 m", String(s.u_1));
  const EI = 210e6 * 8356e-8; // kNm²
  const k11 = (12 * EI) / 216, k12 = (6 * EI) / 36, k22 = (4 * EI) / 6;
  const det = k11 * k22 - k12 * k12;
  meld(gelijk(s.w?.toNumber?.("m"), (10 * k22) / det, 1e-9), "balkelement: verplaatsing in m", String(s.w));
  meld(typeof s["φ"] === "number" && gelijk(s["φ"], (-10 * k12) / det, 1e-9), "balkelement: rotatie dimensieloos (rad)", String(s["φ"]));
  const n = knopenVan("K = [2; -1 | -1; 1]*1000 kN/m\nF = [0; 10] kN\nu = lsolve(K; F)").find((x) => x.name === "u");
  meld(n?.unit === "m" && n?.matrix?.eenheid === "m", "de uitwerking toont de vector in m", `${n?.result} / ${n?.unit}`);
}

// ─── 5. Element toekennen ────────────────────────────────────────────────
kop("5. Element toekennen: A.(i; j) = …, v.(i) = …, v.i = …");
{
  const s = scopeVan(`n = 3
K = matrix(n; n)
#for i = 1 : n
K.(i; i) = 2
#loop
#for i = 1 : n - 1
K.(i; i + 1) = -1
K.(i + 1; i) = -1
#loop
K.(n; n) = 1
u = lsolve(K; [0; 0; 1])
v = vector(4)
#for i = 1 : len(v)
v.(i) = i^2
#loop
a = vector(3)
#for k = 1 : 3
a.k = 10*k
#loop
B = K
K.(1; 1) = 99`);
  isGelijk("stijfheidsmatrix in een lus opgebouwd", getallen(s.B), [[2, -1, 0], [-1, 2, -1], [0, -1, 1]]);
  isGelijk("…en opgelost: u = [1; 2; 3]", getallen(s.u), [1, 2, 3]);
  isGelijk("v.(i) = i^2 in een lus", getallen(s.v), [1, 4, 9, 16]);
  isGelijk("v.k = 10*k in een lus", getallen(s.a), [10, 20, 30]);
  meld(getallen(s.K)[0][0] === 99 && getallen(s.B)[0][0] === 2, "B = K deelt niets: K.(1; 1) = 99 laat B staan");
  const knopen = knopenVan("v = vector(2)\nv.(3) = 1\nw = matrix(2; 2)\nw.(1) = 5\nz.(1) = 2");
  const res = Object.fromEntries(knopen.map((x) => [x.name, x.result]));
  meld(/buiten bereik/.test(res["v.(3)"] ?? ""), "index buiten de vector geeft een foutmelding", res["v.(3)"]);
  meld(/twee indices/.test(res["w.(1)"] ?? ""), "een matrix met één index geeft een foutmelding", res["w.(1)"]);
  meld(/niet gedefinieerd/.test(res["z.(1)"] ?? ""), "een onbekende naam geeft een foutmelding", res["z.(1)"]);
  const html = render(knopenVan("v = vector(3)\nv.(2) = 5 m"));
  meld(latexVan(html).some((l) => l.startsWith("{v}_{2} =")), "de regel toont v met de index als subscript", latexVan(html).join(" | "));
}

// ─── 6. Opzoeken in een tabel ────────────────────────────────────────────
kop("6. hlookup op een tabel [id | b | h] (zoals balklaag en ligger)");
{
  const s = scopeVan(`profielen = [1; 2; 3 | 46; 63; 71 | 96; 146; 171]
p = 2
b = hlookup(profielen; p; 1; 2)*mm
h = hlookup(profielen; p; 1; 3)*mm
bg = hlookup_ge(profielen; 2.5; 1; 2)
bl = hlookup_le(profielen; 2.5; 1; 2)
niets = hlookup(profielen; 7; 1; 2)
T = transp(profielen)
vb = vlookup(T; 3; 1; 3)
r = row(profielen; 2)
c = col(profielen; 3)
g = get(profielen; 3; 2)
t1 = take(2; 10; 20; 30)
t2 = take(1; 10; 20; 30)
t3 = take(2; [10; 20; 30])
t4 = take(2; 3; [1; 2; 5 | 3; 6; 15 | 5; 10; 25])`);
  meld(gelijk(s.b?.toNumber?.("mm"), 63) && gelijk(s.h?.toNumber?.("mm"), 146), "profiel 2: b = 63 mm, h = 146 mm", `${s.b}, ${s.h}`);
  meld(s.bg === 71 && s.bl === 63, "hlookup_ge en hlookup_le", `${s.bg}, ${s.bl}`);
  meld(s.niets === 0, "niets gevonden: 0", String(s.niets));
  meld(s.vb === 171, "vlookup zoekt in een kolom", String(s.vb));
  isGelijk("row(M; 2) is rij 2", getallen(s.r), [46, 63, 71]);
  isGelijk("col(M; 3) is kolom 3", getallen(s.c), [3, 71, 171]);
  meld(s.g === 146, "get(M; 3; 2) = rij 3, kolom 2", String(s.g));
  meld(s.t1 === 20 && s.t2 === 10, "take(n; a; b; c) met losse getallen: het n-de", `${s.t1}, ${s.t2}`);
  meld(s.t3 === 20 && s.t4 === 15, "take(n; vector) en take(i; j; M)", `${s.t3}, ${s.t4}`);
}

// ─── 7. CalcPAD-functienamen ─────────────────────────────────────────────
kop("7. CalcPAD-functienamen");
{
  const s = scopeVan(`v = [3; 1; 2]
n = len(v)
f = fill(vector(3); 7)
fi = first(v; 2)
la = last(v; 2)
sl = slice(v; 2; 3)
s = sum(10; v; [1; 1])
s1 = sum(v)
q = srss(3; 4)
gem = average(v)
p = product(v)
c = ceiling(2.1)
r = root(27; 3)
sw = switch(v.1 < 3; 1; v.1 < 6; 2; 3)
sw2 = switch(0; 1; 0; 2; 9)
mx = max(v)
cnt = count([0; 1; 2; 1; 4; 1]; 1; 4)
cnt1 = count(v)
se = search([0; 1; 2; 1; 4; 1]; 1; 3)
L = sum([2 m; 3 m; 4 m])`);
  meld(s.n === 3, "len", String(s.n));
  isGelijk("fill(vector(3); 7)", getallen(s.f), [7, 7, 7]);
  isGelijk("first(v; 2)", getallen(s.fi), [3, 1]);
  isGelijk("last(v; 2)", getallen(s.la), [1, 2]);
  isGelijk("slice(v; 2; 3)", getallen(s.sl), [1, 2]);
  meld(s.s === 18 && s.s1 === 6, "sum van getallen en vectoren door elkaar", `${s.s}, ${s.s1}`);
  meld(s.q === 5 && s.gem === 2 && s.p === 6, "srss, average, product", `${s.q}, ${s.gem}, ${s.p}`);
  meld(s.c === 3 && gelijk(s.r, 3), "ceiling, root", `${s.c}, ${s.r}`);
  meld(s.sw === 2 && s.sw2 === 9, "switch", `${s.sw}, ${s.sw2}`);
  meld(s.mx === 3, "max blijft werken", String(s.mx));
  meld(s.cnt === 2 && s.cnt1 === 3, "count(v; x; i) als in CalcPAD, count(v) als in mathjs", `${s.cnt}, ${s.cnt1}`);
  meld(s.se === 4, "search", String(s.se));
  meld(gelijk(s.L?.toNumber?.("m"), 9), "sum met eenheden", String(s.L));
}

// ─── 8. Eenheid bij het getal ────────────────────────────────────────────
kop("8. Een eenheid hoort bij het getal ervoor");
{
  const s = scopeVan(`E = 210000 N/mm^2
I = 8356 cm^4
w = 5 kN/m*(6 m)^4/(384*E*I)
q = 5 kN/m
L = 6 m
w2 = 5*q*L^4/(384*E*I)
x = 20 kN/5 kN/m
y = 3/4 mm
h = 2 m
z = 10 kN/2 m*h`);
  const ref = (5 * 1296) / (384 * 210e6 * 8356e-8); // m
  meld(gelijk(s.w?.toNumber?.("m"), ref, 1e-9), "5 kN/m*(6 m)^4/(384*E*I) = 5qL⁴/(384EI)", String(s.w));
  meld(gelijk(s.w2?.toNumber?.("m"), 5 * ref, 1e-9), "met q = 5 kN/m: 5*q*L^4/(384*E*I)", String(s.w2));
  meld(gelijk(s.x?.toNumber?.("m"), 4), "20 kN/5 kN/m = 20 kN / (5 kN/m) = 4 m", String(s.x));
  meld(gelijk(s.y?.toNumber?.("mm^-1"), 0.75), "3/4 mm = 3 / (4 mm)", String(s.y));
  meld(gelijk(s.z?.toNumber?.("kN"), 10), "10 kN/2 m*h = (10 kN / 2 m)·h", String(s.z));
}

// ─── 9. Lussen ───────────────────────────────────────────────────────────
kop("9. #repeat … #loop, #while … #loop, #continue");
{
  const s = scopeVan(`n = 0
#repeat 3
n = n + 1
#loop
x = 100
#while x > 1
x = x/2
#loop
s = 0
#for i = 1 : 5
#if i ≡ 3
#continue
#end if
s = s + i
#loop
t = 0
#Repeat
t = t + 1
#If t ≥ 4
#Break
#End if
#Loop
oud = 0
#repeat 2
oud = oud + 1
#end repeat`);
  meld(s.n === 3, "#repeat 3 … #loop", String(s.n));
  meld(s.x === 0.78125, "#while x > 1 … #loop", String(s.x));
  meld(s.s === 12, "#continue slaat i = 3 over", String(s.s));
  meld(s.t === 4, "#Repeat zonder aantal tot #Break (hoofdletters)", String(s.t));
  meld(s.oud === 2, "#repeat … #end repeat blijft werken", String(s.oud));
}

// ─── 10. Weergave ────────────────────────────────────────────────────────
kop("10. Weergave van een vector of matrix");
{
  const knopen = knopenVan(`K = [2; -1 | -1; 2]
u = lsolve(K; [1; 0])
F = [0; 10] kN
G = matrix(20; 15)`);
  const html = render(knopen);
  const tex = latexVan(html);
  meld(!/katex-error|calc-error/.test(html), "geen foutmelding in de opmaak");
  meld(tex.some((l) => l.includes("\\begin{bmatrix}2 & -1 \\\\ -1 & 2\\end{bmatrix}")), "matrix als blok, rij voor rij", tex[0]);
  meld(tex.some((l) => l.includes("\\text{lsolve}") && l.includes("0.6667 & 0.3333")), "u = lsolve(K, …) = [0.6667 0.3333], afgerond als een gewone uitkomst", tex[1]);
  meld(tex.some((l) => l.includes("\\begin{bmatrix}0 & 10\\end{bmatrix} \\; \\mathrm{kN}")), "gedeelde eenheid achter de haak", tex[2]);
  meld(tex.some((l) => l.includes("\\cdots") && l.includes("\\vdots")), "een grote matrix wordt ingekort", "");
  meld(!html.includes("[["), "geen ruwe tekst [[…]]");
  const u = knopen.find((n) => n.name === "u");
  meld(u?.result === "[0.6667; 0.3333]", "de tekstvorm in CalcPAD-notatie", u?.result);
}

// ─── 11. Grafiek en numerieke blokken met eenheden ───────────────────────
kop("11. $Plot met eenheden, PlotWidth/PlotHeight, $Sum, $Area, $Slope, $Root");
{
  // M(x) = q·x·(L − x)/2 met q = 10 kN/m, L = 6 m:
  //   ∫₀ᴸ q·x dx = qL²/2 = 180 kNm,  M'(0) = qL/2 = 30 kN,  max M = qL²/8 = 45 kNm
  const bron = `q = 10 kN/m
L = 6 m
M(x) = q*x*(L - x)/2
A = $Area{q*x @ x = 0 m : L}
V = $Slope{M(x) @ x = 0 m}
Mm = $Sup{M(x) @ x = 0 m : L}
S = $Sum{k*1 kN @ k = 1 : 4}
P = $Product{k @ k = 1 : 5}
u = $Root{2 kN/mm*x - 10 kN @ x = 0 mm : 20 mm}
r = $Root{x^3 = 8 @ x = 0 : 3}
PlotWidth = 300
PlotHeight = 200
$Plot{M(x) @ x = 0 m : L}`;
  const s = scopeVan(bron);
  meld(gelijk(s.A?.toNumber?.("kN*m"), 180, 1e-9), "$Area met eenheden: qL²/2 = 180 kNm", String(s.A));
  meld(gelijk(s.V?.toNumber?.("kN"), 30, 1e-7), "$Slope met eenheden: qL/2 = 30 kN", String(s.V));
  meld(gelijk(s.Mm?.toNumber?.("kN*m"), 45, 1e-9), "$Sup met eenheden: qL²/8 = 45 kNm", String(s.Mm));
  meld(gelijk(s.S?.toNumber?.("kN"), 10) && s.P === 120, "$Sum met eenheden en $Product", `${s.S}, ${s.P}`);
  meld(gelijk(s.u?.toNumber?.("mm"), 5, 1e-9), "$Root met eenheden: x = 5 mm", String(s.u));
  meld(gelijk(s.r, 2, 1e-9), "$Root met een vergelijking: x³ = 8 → 2", String(s.r));
  const knopen = knopenVan(bron);
  const plot = knopen.find((n) => n.type === "plot");
  meld(!!plot && /<path /.test(plot.svg), "de momentenlijn met eenheden wordt getekend", plot ? "geen lijn" : "geen grafiek");
  meld(!!plot && plot.svg.includes('viewBox="0 0 300 200"'), "PlotWidth en PlotHeight bepalen de maat", plot?.svg.slice(0, 60));
  meld(!knopen.some((n) => n.type === "user-function" && n.name.startsWith("__solver_")), "de hulpfuncties van de blokken staan niet in de uitwerking");
}

console.log(
  fouten === 0
    ? `\nMatrices: alles klopt (${getest} controles).`
    : `\nMatrices: ${fouten} van ${getest} controles wijken af.`,
);
process.exit(fouten === 0 ? 0 : 1);
