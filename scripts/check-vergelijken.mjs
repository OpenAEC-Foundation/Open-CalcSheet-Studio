/**
 * Twee versies van een project of blad vergelijken (store/vergelijken.ts en
 * components/calc/VergelijkVenster.tsx).
 *
 * Wat er moet gelden:
 *   - het regelverschil is minimaal: het aantal gelijke regels is de langste gemeenschappelijke
 *     deelrij (nagerekend met een eigen tabel op 2000 willekeurige paren), en links en rechts
 *     staan alle regels van beide versies op volgorde;
 *   - regeleinden van Windows tellen niet; een gewijzigde regel staat tegenover zijn oude;
 *   - een groot blad (de balklaag, ruim 3000 regels) met een paar wijzigingen is snel klaar;
 *   - bladen worden gekoppeld op id, dan op kenmerk, dan op naam; de rest staat alleen aan
 *     één kant;
 *   - invoer en uitkomsten per naam naast elkaar, met het relatieve verschil bij twee getallen
 *     met dezelfde eenheid;
 *   - de uitkomsten van het gekozen bestand rekenen met de projectgegevens van dat bestand.
 *
 * Handwerk bij het proefblad: q_d = 1,2·K_FI·q. Met q = 2 kN/m en CC2 (K_FI = 1,0) is q_d =
 * 2,4 kN/m; met q = 3 kN/m 3,6 kN/m (+50 %); met q = 2 en CC3 (K_FI = 1,1) 2,64 kN/m (+10 %).
 *
 * Draaien:  node scripts/check-vergelijken.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { koppelBladen, metContext, paarSoort, regelVerschil, tabelVerschil } from "../packages/desktop/src/store/vergelijken.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";
import { balklaag } from "../packages/desktop/src/templates/balklaag.ts";

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};

console.log("Het regelverschil");
const lcs = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = a[i - 1] === b[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]);
  return d[a.length][b.length];
};
// Een vaste reeks, zodat een fout altijd terugkomt.
let zaad = 12345;
const toeval = () => ((zaad = (zaad * 1103515245 + 12345) % 2147483648) / 2147483648);
let mis = 0;
for (let t = 0; t < 2000; t++) {
  const rij = () => Array.from({ length: Math.floor(toeval() * 10) }, () => "abcd"[Math.floor(toeval() * 4)]);
  const a = rij();
  const b = rij();
  const v = regelVerschil(a.join("\n"), b.join("\n"));
  const L = v.filter((x) => x.links).map((x) => x.links.tekst);
  const R = v.filter((x) => x.rechts).map((x) => x.rechts.tekst);
  const A = a.join("\n").split("\n");
  const B = b.join("\n").split("\n");
  if (L.join("\n") !== A.join("\n") || R.join("\n") !== B.join("\n") || v.filter((x) => x.soort === "gelijk").length !== lcs(A, B)) mis++;
}
meld(mis === 0, "2000 willekeurige paren: alle regels op volgorde, en minimaal", `${mis} mis`);
const v1 = regelVerschil("a\nb\nc\n", "a\r\nB\r\nc\r\nd\r\n");
meld(JSON.stringify(v1.map((r) => r.soort)) === JSON.stringify(["gelijk", "gewijzigd", "gelijk", "erbij", "gelijk"]), "CRLF telt niet; b → B gewijzigd, d erbij", JSON.stringify(v1.map((r) => r.soort)));
meld(v1[1].links.nr === 2 && v1[1].rechts.nr === 2 && v1[1].rechts.tekst === "B", "de regelnummers van beide kanten");
const ctx = metContext(regelVerschil(Array.from({ length: 40 }, (_, i) => `r${i}`).join("\n"), Array.from({ length: 40 }, (_, i) => (i === 20 ? "X" : `r${i}`)).join("\n")), 2);
meld(ctx.length === 5 && ctx[2].soort === "gewijzigd", "met context: twee regels eromheen, zonder sprong aan de randen", JSON.stringify(ctx.map((r) => r?.soort ?? null)));
const groot = balklaag.split("\n");
const anders = [...groot];
anders.splice(100, 1, "x = 1");
anders.splice(2000, 0, "y = 2", "z = 3");
anders.splice(3000, 3);
const start = performance.now();
const vg = regelVerschil(balklaag, anders.join("\n"));
const duur = performance.now() - start;
meld(duur < 1000, `de balklaag (${groot.length} regels) met vier wijzigingen in ${Math.round(duur)} ms`);
meld(vg.filter((r) => r.soort !== "gelijk").length === 6, "en precies die wijzigingen (1 gewijzigd, 2 erbij, 3 weg)", String(vg.filter((r) => r.soort !== "gelijk").length));

console.log("\nBladen koppelen");
const b = (id, ref, naam, source = "a = 1", waarden = {}) => ({ id, ref, naam, source, waarden });
const hier = [b("1", "1", "Ligger"), b("2", "2", "Kolom"), b("3", "3", "Poer"), b("4", "7", "Wand")];
const daar = [b("x", "2", "Kolom oud"), b("1", "9", "Ligger"), b("y", "8", "Poer"), b("z", "5", "Trap")];
const paren = koppelBladen(hier, daar);
const per = Object.fromEntries(paren.map((p) => [p.hier?.naam ?? `alleen ${p.daar.naam}`, `${p.daar?.naam ?? "-"}/${p.op}`]));
meld(per.Ligger === "Ligger/id", "op id", per.Ligger);
meld(per.Kolom === "Kolom oud/ref", "op kenmerk", per.Kolom);
meld(per.Poer === "Poer/naam", "op naam", per.Poer);
meld(per.Wand === "-/null" && per["alleen Trap"] === "Trap/null", "de rest aan één kant", JSON.stringify(per));
meld(paarSoort({ hier: b("1", "1", "A", "a = 1\n"), daar: b("1", "1", "A", "a = 1\r\n") }) === "gelijk", "gelijk ondanks CRLF");
meld(paarSoort({ hier: b("1", "1", "A", "a = 1", { q: "2" }), daar: b("1", "1", "A", "a = 1", { q: "3" }) }) === "gewijzigd", "andere invoer: gewijzigd");

console.log("\nTabellen");
const tab = tabelVerschil({ a: "2.4 kN / m", b: "1", c: "5 m" }, { a: "3.6 kN / m", b: "1", d: "x", c: "5000 mm" });
const r = Object.fromEntries(tab.map((x) => [x.naam, x]));
meld(Math.abs(r.a.verschil - 0.5) < 1e-12 && !r.a.gelijk, "2,4 → 3,6 kN/m: +50 %", JSON.stringify(r.a));
meld(r.b.gelijk && r.b.verschil === undefined, "gelijk: geen verschil");
meld(r.c.verschil === undefined && !r.c.gelijk, "een andere eenheid: geen procent (5 m tegen 5000 mm)");
meld(r.d.links === undefined && r.d.rechts === "x", "alleen rechts");

console.log("\nUitkomsten met de projectgegevens van elk bestand (in jsdom)");
const { laadRapportAfdruk } = await import("./lib/rapport-html.mjs");
const m = await laadRapportAfdruk();
const PROEF = `"Proef — EN 1990
q = ?{2}*(kN/m)
q_d = 1.2*K_FI*q
UC_max = q_d/(10 kN/m)
`;
const ex = (q) => ({ id: "p", ref: "1", naam: "Proef", templateId: "", source: PROEF, waarden: { q }, elementen: [] });
const g2 = legeGegevens();
const g3 = { ...legeGegevens(), CC: "3" };
const u2 = m.bladUitkomsten(ex("2"), [ex("2")], g2);
const u3 = m.bladUitkomsten(ex("3"), [ex("3")], g2);
const uCC = m.bladUitkomsten(ex("2"), [ex("2")], g3);
meld(u2.waarden.q_d === "2.4 kN / m" && u3.waarden.q_d === "3.6 kN / m" && uCC.waarden.q_d === "2.64 kN / m", "q_d = 2,4 / 3,6 / 2,64 kN/m", `${u2.waarden.q_d} / ${u3.waarden.q_d} / ${uCC.waarden.q_d}`);
meld(Math.abs(u2.resultaat.uc - 0.24) < 1e-12 && u2.resultaat.voldoet === true, "UC 0,24, voldoet", JSON.stringify(u2.resultaat));
const tq = tabelVerschil(u2.waarden, uCC.waarden).find((x) => x.naam === "q_d");
meld(Math.abs(tq.verschil - 0.1) < 1e-12, "CC3 tegenover CC2: q_d +10 %", JSON.stringify(tq));
const kapot = m.bladUitkomsten({ ...ex("2"), source: "@fem\n" }, [], g2);
meld(kapot.resultaat === null || kapot.fout !== undefined || Object.keys(kapot.waarden).length === 0, "een blad dat niet rekent, geeft geen uitkomsten en geen uitzondering");

console.log(fouten === 0 ? "\nVergelijken: alles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
