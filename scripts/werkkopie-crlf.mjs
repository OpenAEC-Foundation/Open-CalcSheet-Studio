/**
 * Bewijst met een byte-telling dat de werkkopie CRLF heeft, voor de Windows-job
 * `checks` in ci.yml. Zonder CRLF toetst die job hetzelfde als de job op Linux en
 * mist hij de fouten waarvoor hij er is.
 *
 * Alleen de bestandenlijst komt uit git; de regeleinden telt dit script zelf uit de
 * bytes. Niet met grep: dat verbergt onder Windows de CR's zonder -U.
 *
 * Heet bewust niet check-*.mjs: op een LF-werkkopie hoort dit te zakken, dus het
 * hoort niet in check-alles.
 *
 * Draaien:  node scripts/werkkopie-crlf.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const wortel = fileURLToPath(new URL("..", import.meta.url));
const lijst = execFileSync("git", ["ls-files", "--eol", "-z"], {
  cwd: wortel,
  encoding: "utf8",
  maxBuffer: 1 << 26,
});

let bestanden = 0;
let crlf = 0;
let kaleLf = 0;
const metKaleLf = [];
for (const regel of lijst.split("\0")) {
  // Bijvoorbeeld "i/lf    w/crlf  attr/                 \tscripts/versie.mjs".
  const [kenmerken, pad] = regel.split("\t");
  // Alleen tekst waarover core.autocrlf beslist; een attribuut als `*.sh text eol=lf`
  // (zie .gitattributes) gaat daar bewust boven.
  if (!/^i\/lf\s.*attr\/\s*$/.test(kenmerken)) continue;

  const bytes = readFileSync(join(wortel, pad));
  let kaal = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 0x0a) continue;
    if (bytes[i - 1] === 0x0d) crlf++;
    else kaal++;
  }
  bestanden++;
  kaleLf += kaal;
  if (kaal > 0) metKaleLf.push(`${pad} (${kaal})`);
}

console.log(`${bestanden} tekstbestanden: ${crlf} regeleinden CRLF, ${kaleLf} kale LF.`);
if (crlf === 0 || metKaleLf.length > 0) {
  for (const b of metKaleLf.slice(0, 10)) console.error(`  kale LF: ${b}`);
  if (metKaleLf.length > 10) console.error(`  … en nog ${metKaleLf.length - 10} bestanden`);
  console.error("De werkkopie heeft geen CRLF. Staat core.autocrlf=true vóór de checkout?");
  process.exit(1);
}
console.log("De werkkopie heeft CRLF.");
