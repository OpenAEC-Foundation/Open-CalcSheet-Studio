/**
 * Een formuleregel in de uitwerking: scrollen.
 *
 *   1. Het muiswiel scrolt altijd het blad. Geen regel in de CSS van de app of
 *      in de kernopmaak maakt van een formuleblok (`.katex-display`) een
 *      scrollvak: geen `overflow` (ook niet `overflow-x`) op hidden, auto of
 *      scroll. Bij `overflow-x: hidden` wordt `overflow-y` vanzelf `auto`, en een
 *      breuk die een paar pixels hoger is dan haar vak ving dan het wiel.
 *
 * Draaien:  node scripts/check-formuleregel.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { defaultStyles } from "../packages/core/dist/index.js";

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

console.log(fouten === 0 ? "\nAlle controles geslaagd." : `\n${fouten} controle(s) gezakt.`);
process.exit(fouten === 0 ? 0 : 1);
