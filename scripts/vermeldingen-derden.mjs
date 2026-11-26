/**
 * De vermeldingen van derden voor het image van de rekendienst (docker/rekendienst.Dockerfile):
 * elk npm-pakket dat in de dienst of in de pagina's van het rapport kan zitten, met zijn
 * versie, licentie en licentietekst.
 *
 * "Kan zitten": elk pakket uit package-lock.json dat geen ontwikkelpakket is en dat in
 * node_modules staat (een pakket voor een ander platform niet). Dat is ruimer dan wat de
 * bundels echt gebruiken, nooit krapper.
 *
 *   node scripts/vermeldingen-derden.mjs <uit.txt>
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const uit = process.argv[2];
if (!uit) {
  console.error("gebruik: node scripts/vermeldingen-derden.mjs <uit.txt>");
  process.exit(2);
}

const lock = JSON.parse(readFileSync(join(WORTEL, "package-lock.json"), "utf8"));
const regels = [
  "Third-party notices for the Open CalcSheet Studio calculation service image",
  "",
  "The service (rekendienst.mjs) and the report pages are built from Open CalcSheet Studio",
  "(LGPL-3.0, see LICENSE) and the npm packages below. Open FEM Studio has its own notices",
  "in fem-studio/. The Debian packages in this image (Node.js runtime, Chromium, fonts) carry",
  "their copyright files in /usr/share/doc.",
  "",
];
let aantal = 0;
for (const [pad, info] of Object.entries(lock.packages).sort(([a], [b]) => a.localeCompare(b))) {
  if (!pad.includes("node_modules/") || info.dev || info.link) continue;
  const map = join(WORTEL, pad);
  if (!existsSync(join(map, "package.json"))) continue;
  const pkg = JSON.parse(readFileSync(join(map, "package.json"), "utf8"));
  const licentie = typeof pkg.license === "string" ? pkg.license : (pkg.license?.type ?? info.license ?? "zie het pakket");
  const bestand = readdirSync(map).find((b) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(b));
  regels.push("=".repeat(78), `${pkg.name} ${pkg.version}  (${licentie})`, ...(pkg.homepage ? [pkg.homepage] : []), "");
  regels.push(bestand ? readFileSync(join(map, bestand), "utf8").trim() : `License: ${licentie} (no license file in the package)`, "");
  aantal++;
}
writeFileSync(uit, regels.join("\n") + "\n");
console.log(`Geschreven: ${uit} (${aantal} pakketten)`);
