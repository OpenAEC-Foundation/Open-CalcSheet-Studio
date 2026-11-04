/**
 * De plaatjes bij de formules en de voorbeelden van de Library
 * (packages/desktop/src/components/ribbon/formuleBeeld.ts):
 *
 *   • elke formule en elk voorbeeld heeft er een, en elk plaatje wordt gebruikt;
 *   • bij de formules is elk plaatje anders;
 *   • geldige opmaak, tekst binnen het vlak en alleen stijlen die bestaan;
 *   • een naam uit de index van de Library bereikt alleen de eigen plaatjes;
 *   • elk ligger-standaardgeval heeft naast de last ook de momentenlijn, met de vorm
 *     die erbij hoort: positief naar beneden, aan de trekzijde.
 *
 * Draaien:  node scripts/check-formulebeeld.mjs
 */
import { readFileSync } from "node:fs";
import { FORMULES } from "../packages/desktop/src/components/ribbon/formules.ts";
import { BEELD_NAMEN, formuleBeeld } from "../packages/desktop/src/components/ribbon/formuleBeeld.ts";
import { laadLibrary } from "./lib/library.mjs";

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) fouten++;
}

const css = readFileSync(new URL("../packages/desktop/src/components/ribbon/FormuleVenster.css", import.meta.url), "utf8");
const { voorbeelden } = await laadLibrary();

console.log("Dekking");
const zonder = [...FORMULES, ...voorbeelden].filter((f) => formuleBeeld(f) === null);
meld(zonder.length === 0, `${FORMULES.length} formules en ${voorbeelden.length} voorbeelden hebben een plaatje`, zonder.map((f) => f.id).join(", "));
meld(voorbeelden.every((f) => typeof f.beeld === "string"), "elk voorbeeld noemt zijn plaatje in de index");
const gebruikt = new Set([...FORMULES, ...voorbeelden].map((f) => f.beeld ?? f.id));
const over = BEELD_NAMEN.filter((n) => !gebruikt.has(n));
meld(over.length === 0, "elk plaatje wordt gebruikt", over.join(", "));
const perPlaatje = new Map();
for (const f of FORMULES) perPlaatje.set(formuleBeeld(f), [...(perPlaatje.get(formuleBeeld(f)) ?? []), f.id]);
const gelijk = [...perPlaatje.values()].filter((v) => v.length > 1);
meld(gelijk.length === 0, "bij de formules is elk plaatje anders", gelijk.map((v) => v.join(" = ")).join("; "));

console.log("\nOpmaak");
const onbekend = new Set();
const buiten = [];
const kapot = [];
for (const naam of BEELD_NAMEN) {
  const s = formuleBeeld({ id: naam });
  if (!s.startsWith('<svg class="fb" viewBox="0 0 160 90"') || !s.endsWith("</svg>")) kapot.push(naam);
  // Elke geopende tekst of tspan moet ook dicht; de rest sluit zichzelf.
  for (const tag of ["text", "tspan"]) {
    if ((s.match(new RegExp(`<${tag}[ >]`, "g")) ?? []).length !== (s.match(new RegExp(`</${tag}>`, "g")) ?? []).length) kapot.push(naam);
  }
  if (/undefined|NaN/.test(s)) kapot.push(naam);
  for (const [, k] of s.matchAll(/class="(fb-[a-z]+)"/g)) if (!new RegExp(`\\.${k}\\b`).test(css)) onbekend.add(k);
  for (const [, x, y] of s.matchAll(/<text class="fb-t" x="([-\d.]+)" y="([-\d.]+)"/g)) {
    // De letters staan boven hun y; een index zakt nog iets.
    if (Number(x) < 0 || Number(x) > 160 || Number(y) < 8 || Number(y) > 88) buiten.push(`${naam} (${x}, ${y})`);
  }
}
meld(kapot.length === 0, "geldige opmaak", [...new Set(kapot)].join(", "));
meld(onbekend.size === 0, "alleen stijlen uit FormuleVenster.css", [...onbekend].join(", "));
meld(buiten.length === 0, "alle tekst binnen het vlak", buiten.join("; "));

console.log("\nDe momentenlijn bij de liggers");
{
  /**
   * Waar de lijn hoort te staan, met s = x/L over de hele ligger en M in eigen schaal:
   * het teken op een paar plaatsen, en of de lijn er krom (parabool, derde macht) of
   * recht (tussen puntlasten) is. Positief staat onder de nullijn.
   */
  const VORM = {
    "ligger-twee-steunpunten-q": { veld: true, steun: false, krom: true },
    "ligger-twee-steunpunten-f-midden": { veld: true, steun: false, krom: false },
    "ligger-twee-steunpunten-f-willekeurig": { veld: true, steun: false, krom: false },
    "ligger-twee-steunpunten-twee-f": { veld: true, steun: false, krom: false },
    "ligger-twee-steunpunten-driehoekslast": { veld: true, steun: false, krom: true },
    "ligger-ingeklemd-q": { veld: true, steun: true, krom: true },
    "ligger-ingeklemd-f-midden": { veld: true, steun: true, krom: false },
    "ligger-eenzijdig-ingeklemd-q": { veld: true, steun: true, krom: true },
    "ligger-eenzijdig-ingeklemd-f-midden": { veld: true, steun: true, krom: false },
    "uitkraging-q": { veld: false, steun: true, krom: true },
    "uitkraging-f": { veld: false, steun: true, krom: false },
    "ligger-overstek-q": { veld: true, steun: true, krom: true },
    "ligger-twee-velden-q": { veld: true, steun: true, krom: true },
    "ligger-twee-velden-f-midden": { veld: true, steun: true, krom: false },
    "ligger-drie-velden-q": { veld: true, steun: true, krom: true },
    "ligger-twee-steunpunten-q-op-x": { veld: true, steun: false, krom: true },
  };
  const liggers = FORMULES.filter((f) => f.groep === "mechanica-ligger");
  meld(liggers.length === Object.keys(VORM).length && liggers.every((f) => VORM[f.id]), `${liggers.length} liggers staan in de tabel`, liggers.filter((f) => !VORM[f.id]).map((f) => f.id).join(", "));
  for (const f of liggers) {
    const v = VORM[f.id];
    const s = formuleBeeld(f);
    const pad = s.match(/<path class="fb-b" data-nul="([\d.]+)" d="([^"]*)"/);
    if (!meld(!!pad, `${f.id}: heeft een momentenlijn`)) continue;
    const nul = Number(pad[1]);
    const ys = [...pad[2].matchAll(/[ML]([\d.]+) ([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    const onderNul = Math.max(...ys.map((p) => p[1])) - nul;
    const bovenNul = nul - Math.min(...ys.map((p) => p[1]));
    meld(v.veld === onderNul > 1, `${f.id}: ${v.veld ? "positief moment onder de nullijn" : "geen positief moment"}`, `${onderNul.toFixed(1)} onder de nullijn`);
    meld(v.steun === bovenNul > 1, `${f.id}: ${v.steun ? "negatief moment boven de nullijn" : "geen negatief moment"}`, `${bovenNul.toFixed(1)} boven de nullijn`);
    // Krom of met knikken: de richting van de lijn verandert overal een beetje, of bijna nergens.
    const lijn = ys.slice(1, -1);
    let knikken = 0;
    let bochten = 0;
    for (let i = 2; i < lijn.length; i++) {
      const a = (lijn[i - 1][1] - lijn[i - 2][1]) / (lijn[i - 1][0] - lijn[i - 2][0]);
      const b = (lijn[i][1] - lijn[i - 1][1]) / (lijn[i][0] - lijn[i - 1][0]);
      if (Math.abs(a - b) > 0.02) bochten++;
      if (Math.abs(a - b) > 0.2) knikken++;
    }
    meld(v.krom ? bochten > 8 : bochten <= 5, `${f.id}: ${v.krom ? "een kromme lijn" : "rechte stukken"}`, `${bochten} bochten, ${knikken} knikken`);
  }
}

console.log("\nNamen van buiten");
for (const naam of ["constructor", "__proto__", "toString", "bestaat-niet"]) {
  meld(formuleBeeld({ id: "x", beeld: naam }) === null, `"${naam}" geeft geen plaatje`);
}

console.log(fouten === 0 ? "\nAlles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
