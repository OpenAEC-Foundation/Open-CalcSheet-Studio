/**
 * De lijst met wijzigingen per versie: docs/CHANGELOG.md. Een wijziging staat
 * eerst onder "## Nog niet uitgebracht"; `node scripts/versie.mjs zet JJJJ.W.N`
 * maakt daar de sectie "## vJJJJ.W.N — JJJJ-MM-DD" van. De release-workflow zet
 * die sectie in de release-tekst en stopt als hij ontbreekt of leeg is.
 *
 * Draaien:
 *   node scripts/wijzigingen.mjs tekst 2026.45.0   de wijzigingen van deze versie
 *
 * De tests staan in check-wijzigingen.mjs.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoMap = fileURLToPath(new URL("..", import.meta.url));

export const CHANGELOG = "docs/CHANGELOG.md";
export const NIEUW = "## Nog niet uitgebracht";

/** Het stuk vóór de eerste kop en de secties, elk met zijn kop en regels. */
function leesSecties(tekst) {
  const secties = [];
  const inleiding = [];
  for (const regel of tekst.split(/\r?\n/)) {
    if (regel.startsWith("## ")) secties.push({ kop: regel.trimEnd(), regels: [] });
    else (secties.at(-1)?.regels ?? inleiding).push(regel);
  }
  return { inleiding, secties };
}

const zonderLegeRanden = (regels) => regels.join("\n").trim();
const isVan = (sectie, versie) => sectie.kop.split(/\s+/)[1] === `v${versie}`;
const heeftOpsomming = (inhoud) => /^- \S/m.test(inhoud);

/** De wijzigingen van precies deze versie, of null als die er niet zijn. */
export function wijzigingenVan(tekst, versie) {
  const sectie = leesSecties(tekst).secties.find((s) => isVan(s, versie));
  const inhoud = sectie ? zonderLegeRanden(sectie.regels) : "";
  return heeftOpsomming(inhoud) ? inhoud : null;
}

/**
 * Maakt van "Nog niet uitgebracht" de sectie van deze versie. Bestaat die al,
 * na een mislukte release die het nummer hergebruikt, dan komt het nieuwe erbij.
 * Geeft de nieuwe tekst terug, met dezelfde regeleinden.
 */
export function brengUit(tekst, versie, datum) {
  const { inleiding, secties } = leesSecties(tekst);
  const nieuw = secties.find((s) => s.kop === NIEUW);
  if (!nieuw) throw new Error(`${CHANGELOG}: de kop "${NIEUW}" ontbreekt.`);

  const toegevoegd = zonderLegeRanden(nieuw.regels);
  const bestaand = secties.find((s) => isVan(s, versie));
  const inhoud = [bestaand ? zonderLegeRanden(bestaand.regels) : "", toegevoegd].filter(Boolean).join("\n");
  if (!heeftOpsomming(inhoud)) {
    throw new Error(`Geen wijzigingen voor v${versie}: zet ze in ${CHANGELOG} onder "${NIEUW}".`);
  }

  nieuw.regels = [];
  if (bestaand) bestaand.regels = [inhoud];
  else secties.splice(secties.indexOf(nieuw) + 1, 0, { kop: `## v${versie} — ${datum}`, regels: [inhoud] });

  const delen = [zonderLegeRanden(inleiding), ...secties.map((s) => [s.kop, zonderLegeRanden(s.regels)].filter(Boolean).join("\n\n"))];
  const uit = `${delen.join("\n\n")}\n`;
  return tekst.includes("\r\n") ? uit.replace(/\n/g, "\r\n") : uit;
}

/** Voor `versie.mjs zet`: de nieuwe tekst van de changelog, nog niet geschreven. */
export function bereidUitbrengenVoor(versie, datum, map = repoMap) {
  return brengUit(readFileSync(join(map, CHANGELOG), "utf8"), versie, datum);
}

export function schrijfChangelog(tekst, map = repoMap) {
  writeFileSync(join(map, CHANGELOG), tekst);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [opdracht, versie, ...rest] = process.argv.slice(2);
  try {
    if (opdracht !== "tekst" || !versie || rest.length > 0) throw new Error("Gebruik: node scripts/wijzigingen.mjs tekst JJJJ.W.N");
    const inhoud = wijzigingenVan(readFileSync(join(repoMap, CHANGELOG), "utf8"), versie);
    if (inhoud === null) throw new Error(`${CHANGELOG}: geen wijzigingen voor v${versie}. Zet ze onder "${NIEUW}" en breng ze uit met node scripts/versie.mjs zet ${versie}.`);
    console.log(inhoud);
  } catch (fout) {
    console.error(fout instanceof Error ? fout.message : String(fout));
    process.exit(1);
  }
}
