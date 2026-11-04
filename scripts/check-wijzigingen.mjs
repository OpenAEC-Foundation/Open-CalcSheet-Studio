/**
 * De lijst met wijzigingen: klopt docs/CHANGELOG.md met de versie, doet
 * scripts/wijzigingen.mjs wat het belooft, en komt de sectie in de release-tekst?
 *
 * De website leest de koppen als "## vJJJJ.W.N — datum" en telt de opsommingen in
 * de release-tekst, maar slaat een opsomming over die met een platform of met
 * "Download" begint (scripts/generate-release-notes.js in de website-repo).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { controleerVelden, leesVersie } from "./versie.mjs";
import { brengUit, CHANGELOG, NIEUW, wijzigingenVan } from "./wijzigingen.mjs";

const repoMap = fileURLToPath(new URL("..", import.meta.url));
const lees = (pad) => readFileSync(`${repoMap}${pad}`, "utf8");
let fouten = 0;
function waar(ok, wat) {
  console.log(`  ${ok ? "✓" : "✗"}  ${wat}`);
  if (!ok) fouten++;
}
function gooit(fn, deel, wat) {
  try {
    fn();
    waar(false, wat);
  } catch (fout) {
    waar(String(fout.message).includes(deel), wat);
  }
}

console.log("De changelog zelf");
const changelog = lees(CHANGELOG);
const koppen = changelog.split(/\r?\n/).filter((r) => r.startsWith("## "));
const versies = koppen.slice(1).map((k) => /^## v(\S+) — \d{4}-\d{2}-\d{2}$/.exec(k)?.[1]);
waar(koppen[0] === NIEUW, `de eerste kop is "${NIEUW}"`);
waar(versies.length > 0 && versies.every(Boolean), "elke andere kop is ## vJJJJ.W.N — JJJJ-MM-DD");
const volgorde = versies.filter(Boolean).map((v) => leesVersie(v).reduce((som, n) => som * 1000 + n, 0));
waar(volgorde.every((n, i) => i === 0 || n < volgorde[i - 1]), "de nieuwste versie staat bovenaan");
waar(versies.every((v) => v && wijzigingenVan(changelog, v) !== null), "elke versie heeft opsommingen");
waar(wijzigingenVan(changelog, controleerVelden()) !== null, "de huidige versie staat erin");
const opsommingen = changelog.split(/\r?\n/).filter((r) => r.startsWith("- "));
waar(!opsommingen.some((r) => /^- \*?\*?(Windows|macOS|Linux|Android|Snap|Download)/.test(r)), "geen opsomming die de website zou overslaan");

console.log("Een versie uitlezen");
const voorbeeld = `# Titel\n\n${NIEUW}\n\n## v2026.45.10 — 2026-11-06\n\n- tien\n\n## v2026.45.1 — 2026-11-04\n\n- een\n- twee\n`;
waar(wijzigingenVan(voorbeeld, "2026.45.1") === "- een\n- twee", "precies deze versie, niet 2026.45.10");
waar(wijzigingenVan(voorbeeld.replace(/\n/g, "\r\n"), "2026.45.1") === "- een\n- twee", "ook met CRLF in de werkkopie");
waar(wijzigingenVan(voorbeeld, "2026.45.2") === null, "een onbekende versie geeft null");
waar(wijzigingenVan(`${NIEUW}\n\n## v2026.45.3 — 2026-11-07\n\nalleen tekst\n`, "2026.45.3") === null, "een sectie zonder opsomming telt niet");

console.log("Uitbrengen");
const open = `# Titel\n\nUitleg.\n\n${NIEUW}\n\n- nieuw\n\n## v2026.45.0 — 2026-11-03\n\n- oud\n`;
const uit = brengUit(open, "2026.45.1", "2026-11-04");
waar(uit === `# Titel\n\nUitleg.\n\n${NIEUW}\n\n## v2026.45.1 — 2026-11-04\n\n- nieuw\n\n## v2026.45.0 — 2026-11-03\n\n- oud\n`, "de wijzigingen krijgen een eigen sectie, de lijst is weer leeg");
waar(brengUit(uit, "2026.45.1", "2026-11-05") === uit, "nogmaals, na een mislukte release: niets verandert");
const erbij = uit.replace(`${NIEUW}\n`, `${NIEUW}\n\n- later\n`);
waar(wijzigingenVan(brengUit(erbij, "2026.45.1", "2026-11-05"), "2026.45.1") === "- nieuw\n- later", "wat daarna is bijgekomen, gaat erbij");
waar(brengUit(open.replace(/\n/g, "\r\n"), "2026.45.1", "2026-11-04") === uit.replace(/\n/g, "\r\n"), "de regeleinden blijven zoals ze waren");
gooit(() => brengUit(`${NIEUW}\n\n## v2026.45.0 — 2026-11-03\n\n- oud\n`, "2026.45.1", "2026-11-04"), "Geen wijzigingen", "zonder wijzigingen geen nieuwe versie");
gooit(() => brengUit("# Titel\n", "2026.45.1", "2026-11-04"), NIEUW, "zonder de kop een duidelijke fout");

console.log("De release");
const release = lees(".github/workflows/release.yml");
waar(release.includes('node scripts/wijzigingen.mjs tekst "$VERSIE"'), "de workflow haalt de wijzigingen op, en stopt als die ontbreken");
waar(release.includes("wijzigingen: ${{ steps.nummer.outputs.wijzigingen }}"), "het nummer-job geeft ze door");
const tekst = release.slice(release.indexOf("tekst: |"), release.indexOf("### Downloads"));
waar(tekst.includes("${{ needs.voorbereiden.outputs.wijzigingen }}"), "ze staan in de release-tekst, boven de downloads");

console.log(fouten === 0 ? "\nWijzigingen: alles klopt." : `\nWijzigingen: ${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
