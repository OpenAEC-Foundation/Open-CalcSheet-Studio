/**
 * Kleine regels van de rekentaal die elders niet bewaakt worden.
 *
 *   1. `and()`, `or()` en `xor()` met drie of meer delen nemen alle delen mee,
 *      net als `And()`, `Or()` en `Xor()`, voor elke plaats van het onware of
 *      ware deel; ook binnen `#if`. Twee delen, de operator `a and b` en een
 *      matrix (elementsgewijs) blijven zoals ze waren.
 *   2. Een procentteken in een naam (`F_1%50`) hoort bij de naam: `F_1%50` en
 *      `F_1_50` zijn twee variabelen, apart in de scope en in de uitwerking, en
 *      in beeld staat het procent. `50%` en `a % b` blijven rekenen.
 *
 * Draaien:  node scripts/check-rekentaal.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { parse, evaluateMetScope, render, verwijzingNaam } from "../packages/core/dist/index.js";

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};
const reken = (bron) => evaluateMetScope(parse(bron), {});
const waar = (v) => (typeof v === "boolean" ? v : Boolean(Number(v)));
/** De teksten die een blad toont (uitleg tussen aanhalingstekens). */
const teksten = (nodes) => JSON.stringify(nodes);

console.log("Logische functies met drie of meer delen");
const voor = "a = 1\nb = 2\nc = 4\n";
// Drie voorwaarden; per geval welke onwaar is (of geen).
const delen = (onwaar) => ["a ≡ 1", "b ≡ 2", "c ≡ 4"].map((d, i) => (i === onwaar ? d.replace("≡", "≠") : d));
for (const onwaar of [-1, 0, 1, 2]) {
  const d = delen(onwaar).join("; ");
  const { scope } = reken(`${voor}r_en = and(${d})\nR_en = And(${d})\nr_of = or(${d})\nR_of = Or(${d})\nr_x = xor(${d})\nR_x = Xor(${d})`);
  const plaats = onwaar < 0 ? "alle waar" : `deel ${onwaar + 1} onwaar`;
  meld(waar(scope.r_en) === waar(scope.R_en) && waar(scope.r_en) === (onwaar < 0), `and() = And() (${plaats})`, `${scope.r_en} / ${scope.R_en}`);
  meld(waar(scope.r_of) === waar(scope.R_of) && waar(scope.r_of), `or() = Or() (${plaats})`, `${scope.r_of} / ${scope.R_of}`);
  meld(waar(scope.r_x) === waar(scope.R_x), `xor() = Xor() (${plaats})`, `${scope.r_x} / ${scope.R_x}`);
}
// Vier delen, het ware deel steeds op een andere plaats.
for (let p = 0; p < 4; p++) {
  const d = [0, 1, 2, 3].map((i) => (i === p ? "1 ≡ 1" : "1 ≡ 2")).join("; ");
  const { scope } = reken(`r = or(${d})\ns = and(${d})`);
  meld(waar(scope.r) === true && waar(scope.s) === false, `vier delen, alleen deel ${p + 1} waar: or waar, and onwaar`, `${scope.r} / ${scope.s}`);
}

console.log("\nBinnen #if");
for (const onwaar of [0, 1, 2]) {
  const { nodes } = reken(`${voor}#if and(${delen(onwaar).join("; ")})\n'alle voorwaarden waar'\n#else\n'minstens één voorwaarde onwaar'\n#end if`);
  const t = teksten(nodes);
  meld(t.includes("minstens één voorwaarde onwaar") && !t.includes("alle voorwaarden waar"), `#if and(…) met deel ${onwaar + 1} onwaar kiest #else`);
}
{
  const { nodes } = reken(`${voor}#if or(a ≡ 2; b ≡ 3; c ≡ 4)\n'een deel waar'\n#else\n'geen deel waar'\n#end if`);
  meld(teksten(nodes).includes("een deel waar") && !teksten(nodes).includes("geen deel waar"), "#if or(…) met alleen het derde deel waar kiest #if");
}

console.log("\nOngewijzigd");
{
  const { scope } = reken("p = and(1; 0)\nq = or(0; 1)\nu = 1 > 0 and 2 > 3\nv = 1 > 0 or 2 > 3\nM = and([1, 1, 0]; [1, 0, 1])");
  meld(waar(scope.p) === false && waar(scope.q) === true, "and/or met twee delen");
  meld(waar(scope.u) === false && waar(scope.v) === true, "de operatoren and en or");
  const m = scope.M && typeof scope.M.toArray === "function" ? scope.M.toArray() : scope.M;
  meld(JSON.stringify(m) === JSON.stringify([true, false, false]), "and met twee vectoren rekent elementsgewijs", JSON.stringify(m));
}

console.log("\nEen procentteken in een naam");
{
  const { nodes, scope } = reken("F_1%50 = 2\nF_1_50 = 3\nF_1%50\nF_1_50\nx = F_1%50*10 + F_1_50");
  const disp = nodes.filter((n) => n.type === "var-display");
  const getal = (n) => Number(String(n?.value ?? n?.result ?? "").replace(",", "."));
  meld(disp.length === 2 && getal(disp[0]) === 2 && getal(disp[1]) === 3, "F_1%50 toont 2 en F_1_50 toont 3",
    JSON.stringify(disp.map((n) => [n.name, n.value ?? n.result])));
  meld(Number(scope.x) === 23, "F_1%50*10 + F_1_50 = 23", String(scope.x));
  const namen = Object.keys(scope).filter((k) => k.startsWith("F_1"));
  meld(namen.length === 2, "twee namen in de scope", JSON.stringify(namen));
  const html = render(nodes);
  const tex = [...html.matchAll(/<annotation encoding="application\/x-tex">([^<]*)<\/annotation>/g)].map((m) => m[1]);
  meld(tex[0]?.includes("1\\%50") && !tex[1]?.includes("\\%"), "in de uitwerking staat F_{1%50} met procent en F_{1,50} zonder", JSON.stringify(tex.slice(0, 2)));
}
{
  // De bekende schrijfwijze uit de documentatie blijft rekenen, ook met een punt in de naam.
  const { scope } = reken("F_0.9G50%TotalWeight = 7 kN\nCs.Cd = 0.9\nF = Cs.Cd*F_0.9G50%TotalWeight");
  meld(Math.abs(scope.F?.toNumber?.("kN") - 6.3) < 1e-9, "F_0.9G50%TotalWeight en Cs.Cd rekenen", String(scope.F));
  // Een procent als getal of als modulo blijft een operator.
  const r = reken("p = 50%\nq = 7 % 3\nn = 12\nm = n % 5");
  meld(Number(r.scope.p) === 0.5 && Number(r.scope.q) === 1 && Number(r.scope.m) === 2, "50% en 7 % 3 en n % 5 blijven rekenen",
    `${r.scope.p} / ${r.scope.q} / ${r.scope.m}`);
}
{
  // Een waarde uit een ander blad met een procent in de naam.
  const naam = verwijzingNaam("1", "F_1%50");
  meld(naam !== verwijzingNaam("1", "F_1_50"), "#1.F_1%50 en #1.F_1_50 zijn verschillende verwijzingen", naam);
  const { scope } = evaluateMetScope(parse("y = #1.F_1%50 + #1.F_1_50"), {}, { [naam]: 2, [verwijzingNaam("1", "F_1_50")]: 3 });
  meld(Number(scope.y) === 5, "#1.F_1%50 + #1.F_1_50 = 5", String(scope.y));
}

console.log(fouten === 0 ? "\nAlle controles geslaagd." : `\n${fouten} controle(s) gezakt.`);
process.exit(fouten === 0 ? 0 : 1);
