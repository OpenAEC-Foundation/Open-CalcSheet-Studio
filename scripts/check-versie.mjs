/**
 * Het versienummer: staat het overal gelijk, en doet scripts/versie.mjs wat het
 * belooft? De proef voor het zetten draait op een kopie in een tijdelijke map.
 */
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { controleerVelden, isoWeek, leesVelden, leesVersie, VERSIEVELDEN, volgendeVersie, zetVersie } from "./versie.mjs";

const repoMap = fileURLToPath(new URL("..", import.meta.url));
let fouten = 0;
function klopt(naam, gelijk) {
  console.log(`  ${gelijk ? "✓" : "✗"} ${naam}`);
  if (!gelijk) fouten++;
}
function faalt(naam, actie, bevat = "") {
  try {
    actie();
    klopt(`${naam}: had moeten falen`, false);
  } catch (fout) {
    klopt(naam, fout.message.includes(bevat));
  }
}

console.log("De velden in deze repo");
const nu = controleerVelden();
klopt(`alle ${VERSIEVELDEN.length} velden staan op ${nu}`, leesVelden().every((v) => v.waarde === nu));

console.log("ISO-week");
// Handmatig uit de kalender. 1 januari 2026 is een donderdag, dus week 1 van 2026
// begint op maandag 29 december 2025.
//   3 nov 2026 (di): donderdag 5 nov is dag 309, 309/7 = 44,1 → week 45.
//   31 dec 2026 (do): dag 365, 365/7 = 52,1 → week 53.
//   1 jan 2027 (vr): de donderdag ervoor is 31 dec 2026 → 2026, week 53.
//   4 jan 2027 (ma): donderdag 7 jan is dag 7 → 2027, week 1.
//   30 dec 2024 (ma): donderdag 2 jan 2025 is dag 2 → 2025, week 1.
for (const [datum, jaar, week] of [
  ["2026-11-03", 2026, 45],
  ["2026-12-31", 2026, 53],
  ["2027-01-01", 2026, 53],
  ["2027-01-04", 2027, 1],
  ["2024-12-30", 2025, 1],
]) {
  const uit = isoWeek(datum);
  klopt(`${datum} → ${jaar} week ${week}`, uit.jaar === jaar && uit.week === week);
}

console.log("Vorm van het nummer");
for (const goed of ["2026.44.0", "2026.3.0", "2026.53.12"]) {
  klopt(`${goed} is geldig`, leesVersie(goed).length === 3);
}
// 2025 heeft 52 weken: 28 december 2025 valt in week 52.
for (const fout of ["2026-43", "2026.03.0", "v2026.44.0", "2026.44", "2026.44.00", "2026.44.0-nightly", "2026.44.0\n", "2025.53.0", "2026.54.0", "0.1.0", ""]) {
  faalt(`${JSON.stringify(fout)} is ongeldig`, () => leesVersie(fout), "geen geldig nummer");
}

console.log("Volgende nummer");
const WEEK45 = "2026-11-03";
const proeven = [
  ["eerste release van de week", WEEK45, ["nightly", "v0.1.0"], "2026.44.0", "2026.45.0"],
  ["volgnummer boven de hoogste tag", WEEK45, ["v2026.45.0", "v2026.45.1", "v2026.44.3"], "2026.45.1", "2026.45.2"],
  ["nieuwe week begint weer bij 0", "2026-11-09", ["v2026.45.1"], "2026.45.1", "2026.46.0"],
  ["nog niet getagd nummer blijft vrij", WEEK45, ["v2026.44.0"], "2026.45.0", "2026.45.0"],
  ["handmatig vooruitgezet nummer wint", WEEK45, [], "2026.46.2", "2026.46.2"],
  ["nooit lager dan de hoogste tag", WEEK45, ["v2026.47.1"], "2026.44.0", "2026.47.2"],
  ["jaarwisseling", "2027-01-04", ["v2026.53.4"], "2026.53.4", "2027.1.0"],
];
for (const [naam, datum, tags, huidig, verwacht] of proeven) {
  const uit = volgendeVersie(datum, tags, huidig);
  klopt(`${naam}: ${uit}`, uit === verwacht);
}

console.log("Zetten en controleren op een kopie");
const kopie = mkdtempSync(join(tmpdir(), "versie-"));
try {
  const paden = new Set(VERSIEVELDEN.map((v) => v.pad));
  for (const pad of paden) {
    mkdirSync(dirname(join(kopie, pad)), { recursive: true });
    copyFileSync(join(repoMap, pad), join(kopie, pad));
  }
  const lees = (pad) => readFileSync(join(kopie, pad), "utf8");
  const vreemdeVersies = () => [...lees("packages/desktop/src-tauri/Cargo.lock").matchAll(/^version = "/gm)].length;
  const aantalVoor = vreemdeVersies();

  // Hoger dan wat er nu staat, zodat de proef blijft werken na elke release.
  const [jaar] = leesVersie(nu);
  const doel = `${jaar + 1}.1.3`;
  zetVersie(doel, kopie);
  klopt(`zet ${doel} raakt alle velden`, leesVelden(kopie).every((v) => v.waarde === doel));
  klopt("controle op het gezette nummer slaagt", controleerVelden(doel, kopie) === doel);
  klopt("Cargo.lock: alleen de app-regel is gewijzigd", vreemdeVersies() === aantalVoor);
  klopt("Cargo.lock: afhankelijkheid met eigen 0.1.0 blijft staan", /name = "openaec-core"\r?\nversion = "0\.1\.0"/.test(lees("packages/desktop/src-tauri/Cargo.lock")));
  klopt("package-lock: mathjs blijft op zijn eigen versie", /"node_modules\/mathjs"\s*:\s*\{\s*"version"\s*:\s*"13\./.test(lees("package-lock.json")));
  klopt("tweede keer zetten verandert niets", (() => {
    const voor = lees("package-lock.json");
    zetVersie(doel, kopie);
    return lees("package-lock.json") === voor;
  })());

  faalt("lager nummer wordt geweigerd", () => zetVersie(nu, kopie), "lager");
  faalt("ongeldig nummer wordt geweigerd", () => zetVersie("2026-43", kopie), "geen geldig nummer");
  faalt("controle tegen een ander nummer faalt", () => controleerVelden(`${jaar + 1}.1.4`, kopie), "wijken af");

  for (const v of VERSIEVELDEN) {
    const naam = v.veld ? `${v.pad} (${v.veld})` : v.pad;
    const heel = lees(v.pad);
    writeFileSync(join(kopie, v.pad), heel.replace(v.patroon, (_, voor, _oud, na) => `${voor}0.1.0${na}`));
    faalt(`afwijking in ${naam} wordt gezien`, () => controleerVelden(undefined, kopie), naam);
    writeFileSync(join(kopie, v.pad), heel);
  }

  const heel = lees("packages/desktop/src-tauri/Cargo.toml");
  writeFileSync(join(kopie, "packages/desktop/src-tauri/Cargo.toml"), heel.replace('name = "open-calcsheet-studio"', 'name = "andere-naam"'));
  const voorLock = lees("package-lock.json");
  faalt("onvindbaar veld stopt het zetten", () => zetVersie(`${jaar + 1}.1.5`, kopie), "Cargo.toml");
  klopt("en laat de andere bestanden ongemoeid", lees("package-lock.json") === voorLock);
} finally {
  rmSync(kopie, { recursive: true, force: true });
}

if (fouten > 0) {
  console.error(`\n${fouten} controle(s) gezakt.`);
  process.exit(1);
}
console.log("\nHet versienummer klopt.");
