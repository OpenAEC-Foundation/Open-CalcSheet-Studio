/**
 * Een formuleregel in de uitwerking: afbreken en scrollen.
 *
 *   1. Het muiswiel scrolt altijd het blad. Geen regel in de CSS van de app of
 *      in de kernopmaak maakt van een formuleblok (`.katex-display`) een
 *      scrollvak: geen `overflow` (ook niet `overflow-x`) op hidden, auto of
 *      scroll. Bij `overflow-x: hidden` wordt `overflow-y` vanzelf `auto`, en een
 *      breuk die een paar pixels hoger is dan haar vak ving dan het wiel.
 *   2. Een te lange regel breekt af, liefst bij een `=`. De rekenkern zet de
 *      stukken van een formuleregel per `=` in een groep (`span.calc-deel`), in
 *      een rij die afbreekt; een groep breekt binnen zichzelf bij `+`, `−` of `·`.
 *      Er gaat niets verloren: dezelfde tekst, dezelfde MathML, de uitkomst met
 *      eenheid in de laatste groep. Een korte regel heeft dezelfde tekst en
 *      MathML als zonder groepen.
 *
 * Dat de regel op papier ook echt binnen de bladspiegel blijft, meet
 * scripts/check-rapport-pdf.mjs in een echte browser.
 *
 * Draaien:  node scripts/check-formuleregel.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import katex from "katex";
import { JSDOM } from "jsdom";
import { parse, evaluate, render, defaultStyles } from "../packages/core/dist/index.js";

const hier = dirname(fileURLToPath(import.meta.url));
const SRC = join(hier, "../packages/desktop/src");

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};

console.log("Het muiswiel boven een formule");
/** Alle CSS-bestanden onder een map. */
const cssBestanden = (map) => readdirSync(map, { withFileTypes: true }).flatMap((d) =>
  d.isDirectory() ? cssBestanden(join(map, d.name)) : d.name.endsWith(".css") ? [join(map, d.name)] : []);
/** Regels als [selector, declaraties], zonder commentaar; @media e.d. worden platgeslagen. */
const regels = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}@;]+)\{([^{}]*)\}/g)]
  .map((m) => [m[1].trim(), m[2]]);
const SCROLLVAK = /(?:^|;)\s*overflow(?:-x|-y)?\s*:\s*(hidden|auto|scroll|overlay)\b/;
const fout113 = [];
for (const [naam, css] of [["defaultStyles (renderer.ts)", defaultStyles], ...cssBestanden(SRC).map((p) => [p.slice(SRC.length + 1), readFileSync(p, "utf8")])]) {
  for (const [sel, decl] of regels(css)) {
    // Alleen een selector die op het formuleblok zelf eindigt.
    const opBlok = sel.split(",").some((s) => /\.katex-display\s*$/.test(s.trim()));
    if (opBlok && SCROLLVAK.test(decl)) fout113.push(`${naam}: ${sel.replace(/\s+/g, " ")} { ${decl.trim().replace(/\s+/g, " ")} }`);
  }
}
meld(fout113.length === 0, "geen CSS maakt van .katex-display een scrollvak", fout113.join(" | "));
meld(/\.calc-line \.katex-display \{[^}]*overflow:\s*visible/.test(defaultStyles), "de kernopmaak zet overflow: visible op het formuleblok");

console.log("\nEen te lange regel breekt af");
const { window } = new JSDOM("");
const dom = (html) => {
  const d = window.document.createElement("div");
  d.innerHTML = html;
  return d;
};
const LANG = [
  "a_lange_naam_een = 12.345",
  "b_lange_naam_twee = 23.456",
  "c_lange_naam_drie = 34.567",
  "d_lange_naam_vier = 45.678",
  "resultaat = a_lange_naam_een*b_lange_naam_twee + c_lange_naam_drie*d_lange_naam_vier + a_lange_naam_een*c_lange_naam_drie + b_lange_naam_twee*d_lange_naam_vier + a_lange_naam_een*d_lange_naam_vier",
  "M = a_lange_naam_een*1 kN*6 m/8 + b_lange_naam_twee*1 kN*6 m/4",
  "k = 2",
  "kort = k*3",
].join("\n");
const html = render(evaluate(parse(LANG), {}));
const lijnen = [...dom(html).querySelectorAll(".calc-line")];
const regel = (naam) => lijnen.find((l) => l.querySelector("annotation")?.textContent.trimStart().startsWith(naam));

{
  const l = regel("\\text{resultaat}");
  const groepen = l ? [...l.querySelectorAll(".katex-html > .calc-deel")] : [];
  meld(groepen.length === 4, "resultaat = formule = ingevuld = uitkomst: vier groepen, gesplitst bij elke =", String(groepen.length));
  meld(groepen.slice(0, -1).every((g) => /=\s*$/.test(g.textContent)), "elke groep op de laatste na eindigt op =",
    JSON.stringify(groepen.map((g) => g.textContent.slice(-3))));
  meld(groepen.at(-1)?.textContent.trim() === "3931", "de uitkomst staat alleen in de laatste groep", groepen.at(-1)?.textContent);
  meld(groepen.every((g) => [...g.children].every((c) => c.classList.contains("base"))), "een groep bevat alleen de stukken van KaTeX (span.base)");
  // Hetzelfde als KaTeX zelf, zonder groepen: niets verloren, niets verdubbeld.
  const tex = l?.querySelector("annotation")?.textContent ?? "";
  const kaal = dom(katex.renderToString(tex, { displayMode: true, fleqn: true, throwOnError: false, trust: true, strict: false }));
  meld(l?.querySelector(".katex-html")?.textContent === kaal.querySelector(".katex-html")?.textContent, "dezelfde tekst als de formule zonder groepen");
  meld(l?.querySelector(".katex-mathml")?.innerHTML === kaal.querySelector(".katex-mathml")?.innerHTML, "dezelfde MathML (export en schermlezer)");
}
{
  const l = regel("M");
  const groepen = l ? [...l.querySelectorAll(".katex-html > .calc-deel")] : [];
  meld(groepen.length === 4 && /kN\s*·?\s*m\s*$/.test(groepen.at(-1).textContent.replace(/​/g, "")),
    "M: de uitkomst met eenheid aan het eind van de laatste groep", groepen.at(-1)?.textContent);
}
{
  const l = regel("\\text{kort}");
  const groepen = l ? [...l.querySelectorAll(".katex-html > .calc-deel")] : [];
  meld(groepen.length === 4 && l.querySelector(".katex-html").textContent.replace(/\s/g, "") === "kort=k⋅3=2⋅3=6",
    "een korte regel: dezelfde tekst, in groepen per =", l?.querySelector(".katex-html")?.textContent);
}
{
  // Een regel met één stuk (b = 3) krijgt geen groep; een foutregel (inline) ook niet.
  const kale = render(evaluate(parse("b = 3\nq = onbekend_ding + 1"), {}));
  const d = dom(kale);
  meld(d.querySelectorAll(".calc-deel").length === 2 && d.querySelector(".calc-error .calc-deel") === null,
    "groepen alleen in de display-vorm, niet in een foutregel", String(d.querySelectorAll(".calc-deel").length));
}
{
  const css = defaultStyles.replace(/\s+/g, " ");
  meld(/\.calc-line \.katex-display > \.katex > \.katex-html \{[^}]*display: flex;[^}]*flex-wrap: wrap;/.test(css), "de groepen staan in een rij die afbreekt");
  meld(/\.calc-line \.katex-html > \.calc-deel \{[^}]*white-space: normal;/.test(css), "binnen een groep mag de regel afbreken (white-space: normal)");
  meld(/\.calc-line \.katex-display \{[^}]*min-width: 0;/.test(css), "het formuleblok mag smaller worden dan zijn formule");
}

console.log(fouten === 0 ? "\nAlle controles geslaagd." : `\n${fouten} controle(s) gezakt.`);
process.exit(fouten === 0 ? 0 : 1);
