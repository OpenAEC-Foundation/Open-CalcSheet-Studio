/**
 * Het versienummer van deze repo: JJJJ.W.N, dus ISO-weekjaar, ISO-week zonder
 * voorloopnul en een volgnummer binnen de week dat bij 0 begint. De git-tag is
 * hetzelfde nummer met een v ervoor: v2026.45.0.
 *
 * Draaien:
 *   node scripts/versie.mjs controleer             alle velden gelijk en geldig?
 *                                                  (ook de licentievelden)
 *   node scripts/versie.mjs controleer 2026.45.0   alle velden gelijk aan dit nummer?
 *   node scripts/versie.mjs zet 2026.45.0          zet het nummer overal en maakt
 *                                                  van "Nog niet uitgebracht" in
 *                                                  docs/CHANGELOG.md de sectie van
 *                                                  dit nummer (zie wijzigingen.mjs)
 *   node scripts/versie.mjs volgende               het nummer van de volgende release
 *
 * Alleen eigen pakketvelden staan in het register: de versies van afhankelijkheden,
 * rekenbladen, modules en het projectbestand hebben hun eigen levensloop. Een
 * tweede register, LICENTIEVELDEN, bewaakt dat elk eigen pakket dezelfde licentie
 * noemt als LICENSE. De tests staan in check-versie.mjs.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bereidUitbrengenVoor, schrijfChangelog } from "./wijzigingen.mjs";

const repoMap = fileURLToPath(new URL("..", import.meta.url));

const JSON_VELD = /("version"\s*:\s*")([^"]*)(")/g;
const OVER_REGEL = /("version"\s*:\s*"Open CalcSheet Studio v)([^"]*)(")/g;

/** Per veld: bestand, omschrijving en een patroon met het nummer als tweede groep. */
export const VERSIEVELDEN = [
  { pad: "packages/core/package.json", patroon: JSON_VELD },
  { pad: "packages/desktop/package.json", patroon: JSON_VELD },
  { pad: "packages/desktop/src-tauri/tauri.conf.json", patroon: JSON_VELD },
  {
    pad: "packages/desktop/src-tauri/Cargo.toml",
    patroon: /(\[package\]\r?\nname = "open-calcsheet-studio"\r?\nversion = ")([^"]*)(")/g,
  },
  {
    pad: "packages/desktop/src-tauri/Cargo.lock",
    patroon: /(\[\[package\]\]\r?\nname = "open-calcsheet-studio"\r?\nversion = ")([^"]*)(")/g,
  },
  ...["fem-brug/Cargo.toml", "fem-brug/Cargo.lock", "Cargo.lock"].map((bestand) => ({
    pad: "packages/desktop/src-tauri/" + bestand,
    veld: "ocss-fem-brug",
    patroon: /(\nname = "ocss-fem-brug"\r?\nversion = ")([^"]*)(")/g,
  })),
  {
    pad: "package-lock.json",
    veld: "packages/core",
    patroon: /("packages\/core"\s*:\s*\{\s*"name"\s*:\s*"@ifc-calc\/core",\s*"version"\s*:\s*")([^"]*)(")/g,
  },
  {
    pad: "package-lock.json",
    veld: "packages/desktop",
    patroon: /("packages\/desktop"\s*:\s*\{\s*"name"\s*:\s*"@openaec\/calcsheet-studio",\s*"version"\s*:\s*")([^"]*)(")/g,
  },
  { pad: "packages/desktop/src/i18n/locales/nl/common.json", patroon: OVER_REGEL },
  { pad: "packages/desktop/src/i18n/locales/en/common.json", patroon: OVER_REGEL },
];

/**
 * De licentie van de eigen pakketten: dezelfde als LICENSE in de root (LGPL-3.0,
 * zonder "of later") en de README's. De meegeleverde FEM-server in
 * src-tauri/fem-studio heeft zijn eigen licentie (AGPL-3.0) en staat hier bewust niet in.
 */
export const LICENTIE = "LGPL-3.0-only";

const JSON_LICENTIE = /("license"\s*:\s*")([^"]*)(")/g;
// Alleen in de [package]-sectie, tot de volgende sectie.
const CARGO_LICENTIE = /(\[package\]\r?\n(?:(?!\[)[^\n]*\n)*?license = ")([^"]*)(")/g;
const lockLicentie = (pad, naam) =>
  new RegExp(`("${pad}"\\s*:\\s*\\{\\s*"name"\\s*:\\s*"${naam}",(?:\\s*"version"\\s*:\\s*"[^"]*",)?\\s*"license"\\s*:\\s*")([^"]*)(")`, "g");

/** Per licentieveld: bestand, omschrijving en een patroon met de licentie als tweede groep. */
export const LICENTIEVELDEN = [
  { pad: "package.json", patroon: JSON_LICENTIE },
  { pad: "packages/core/package.json", patroon: JSON_LICENTIE },
  { pad: "packages/desktop/package.json", patroon: JSON_LICENTIE },
  { pad: "packages/desktop/src-tauri/Cargo.toml", patroon: CARGO_LICENTIE },
  { pad: "packages/desktop/src-tauri/fem-brug/Cargo.toml", patroon: CARGO_LICENTIE },
  { pad: "package-lock.json", veld: "root", patroon: lockLicentie("", "open-calcsheet-studio") },
  { pad: "package-lock.json", veld: "packages/core", patroon: lockLicentie("packages/core", "@ifc-calc/core") },
  { pad: "package-lock.json", veld: "packages/desktop", patroon: lockLicentie("packages/desktop", "@openaec/calcsheet-studio") },
];

const naamVan = (v) => (v.veld ? `${v.pad} (${v.veld})` : v.pad);

/**
 * Fout als een licentieveld ontbreekt, dubbel staat of iets anders zegt dan
 * LICENTIE, of als LICENSE en de README's niet dezelfde licentie noemen.
 */
export function controleerLicenties(map = repoMap) {
  const fouten = [];
  for (const v of LICENTIEVELDEN) {
    const waarden = [...readFileSync(join(map, v.pad), "utf8").matchAll(v.patroon)].map((m) => m[2]);
    if (waarden.length !== 1) fouten.push(`  ${naamVan(v)}: verwachtte één licentieveld, vond er ${waarden.length}`);
    else if (waarden[0] !== LICENTIE) fouten.push(`  ${naamVan(v)}: ${waarden[0]}`);
  }
  const licentie = readFileSync(join(map, "LICENSE"), "utf8");
  if (!/^\s*GNU LESSER GENERAL PUBLIC LICENSE\s+Version 3, 29 June 2007/.test(licentie)) {
    fouten.push("  LICENSE: is niet de tekst van de LGPL-3.0");
  }
  for (const readme of ["README.md", "README.nl.md"]) {
    const tekst = readFileSync(join(map, readme), "utf8");
    if (!/^LGPL-3\.0\. /m.test(tekst) || /LGPL-3\.0(?:\+|-or-later| or later| of later)/i.test(tekst)) {
      fouten.push(`  ${readme}: noemt niet LGPL-3.0 (zonder "of later")`);
    }
  }
  if (fouten.length > 0) throw new Error(`Licentievelden wijken af van ${LICENTIE}:\n${fouten.join("\n")}`);
  return LICENTIE;
}

/** ISO-weekjaar en -week; de donderdag van de week bepaalt allebei. */
export function isoWeek(datum) {
  const d = new Date(`${datum}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum) || !Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== datum) {
    throw new Error(`Ongeldige datum "${datum}", verwacht JJJJ-MM-DD.`);
  }
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const jaar = d.getUTCFullYear();
  const week = Math.ceil(((d.getTime() - Date.UTC(jaar, 0, 1)) / 86_400_000 + 1) / 7);
  return { jaar, week };
}

/** [jaar, week, volgnummer] van een geldig nummer; anders een fout. */
export function leesVersie(versie) {
  const m = /^([1-9]\d{3})\.([1-9]\d?)\.(0|[1-9]\d*)$/.exec(versie);
  if (m) {
    const [jaar, week, volgnummer] = m.slice(1).map(Number);
    // 28 december valt altijd in de laatste week van zijn jaar.
    if (week <= isoWeek(`${jaar}-12-28`).week && Number.isSafeInteger(volgnummer)) return [jaar, week, volgnummer];
  }
  throw new Error(`"${versie}" is geen geldig nummer JJJJ.W.N (week zonder voorloopnul, volgnummer vanaf 0).`);
}

function vergelijk(a, b) {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
}

/**
 * Het nummer van de volgende release: de week van `datum`, en altijd hoger dan
 * de hoogste tag. Een nummer dat al in de bestanden staat maar nog geen tag
 * heeft, is nog vrij: dat wordt hergebruikt, ook na een mislukte release.
 */
export function volgendeVersie(datum, tags, huidig) {
  const { jaar, week } = isoWeek(datum);
  let volgende = [jaar, week, 0];
  for (const tag of tags) {
    let getagd;
    try {
      if (!tag.startsWith("v")) continue;
      getagd = leesVersie(tag.slice(1));
    } catch {
      continue; // nightly en oude tags tellen niet mee
    }
    if (vergelijk(getagd, volgende) >= 0) volgende = [getagd[0], getagd[1], getagd[2] + 1];
  }
  if (huidig && vergelijk(leesVersie(huidig), volgende) > 0) volgende = leesVersie(huidig);
  return volgende.join(".");
}

/** De huidige waarde van elk veld. Een veld dat niet precies één keer voorkomt, is een fout. */
export function leesVelden(map = repoMap) {
  return VERSIEVELDEN.map((v) => {
    const waarden = [...readFileSync(join(map, v.pad), "utf8").matchAll(v.patroon)].map((m) => m[2]);
    if (waarden.length !== 1) throw new Error(`${naamVan(v)}: verwachtte één versieveld, vond er ${waarden.length}.`);
    return { naam: naamVan(v), waarde: waarden[0] };
  });
}

/** Fout als een veld ongeldig is, afwijkt van de rest of van `verwacht`. Geeft het nummer terug. */
export function controleerVelden(verwacht, map = repoMap) {
  if (verwacht !== undefined) leesVersie(verwacht);
  const velden = leesVelden(map);
  // Zonder opgegeven nummer is de meerderheid de maat, zodat de melding het afwijkende veld noemt.
  const telling = (w) => velden.filter((v) => v.waarde === w).length;
  const doel = verwacht ?? velden.map((v) => v.waarde).sort((a, b) => telling(b) - telling(a))[0];
  const afwijkend = velden.filter((v) => v.waarde !== doel);
  if (afwijkend.length > 0) {
    throw new Error(
      `Versievelden wijken af van ${doel}:\n` +
        afwijkend.map((v) => `  ${v.naam}: ${v.waarde}`).join("\n") +
        `\nZet ze gelijk met: node scripts/versie.mjs zet ${verwacht ?? "JJJJ.W.N"}`,
    );
  }
  leesVersie(doel);
  return doel;
}

/** Zet het nummer overal. Bereidt alles eerst voor, zodat een fout niets half achterlaat. */
export function zetVersie(versie, map = repoMap) {
  const nieuw = leesVersie(versie);
  const huidig = JSON.parse(readFileSync(join(map, "packages/desktop/package.json"), "utf8")).version;
  if (vergelijk(nieuw, leesVersie(huidig)) < 0) throw new Error(`${versie} is lager dan de huidige versie ${huidig}.`);
  leesVelden(map);
  const inhoud = new Map();
  for (const v of VERSIEVELDEN) {
    const tekst = inhoud.get(v.pad) ?? readFileSync(join(map, v.pad), "utf8");
    inhoud.set(v.pad, tekst.replace(v.patroon, (_, voor, _oud, na) => `${voor}${versie}${na}`));
  }
  for (const [pad, tekst] of inhoud) writeFileSync(join(map, pad), tekst);
}

/** De v-tags op origin. Een onbereikbare origin blokkeert: een nummer raden mag niet. */
function tagsOpOrigin() {
  const uit = execFileSync("git", ["ls-remote", "--tags", "--refs", "origin", "v*"], {
    cwd: repoMap,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    timeout: 30_000,
  });
  return uit.split(/\r?\n/).filter(Boolean).map((regel) => regel.split("\t")[1].replace("refs/tags/", ""));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [opdracht, nummer, ...rest] = process.argv.slice(2);
  try {
    if (rest.length > 0) throw new Error("Te veel argumenten.");
    if (opdracht === "controleer") {
      console.log(`Alle versievelden staan op ${controleerVelden(nummer)}.`);
      console.log(`Alle licentievelden staan op ${controleerLicenties()}.`);
    } else if (opdracht === "zet" && nummer) {
      // De changelog eerst voorbereiden: geen wijzigingen, dan blijft ook het nummer staan.
      const changelog = bereidUitbrengenVoor(nummer, new Date().toISOString().slice(0, 10));
      zetVersie(nummer);
      schrijfChangelog(changelog);
      console.log(`Alle versievelden staan nu op ${controleerVelden(nummer)}.`);
    } else if (opdracht === "volgende" && !nummer) {
      const vandaag = new Date().toISOString().slice(0, 10);
      console.log(volgendeVersie(vandaag, tagsOpOrigin(), controleerVelden()));
    } else {
      throw new Error("Gebruik: node scripts/versie.mjs controleer [JJJJ.W.N] | zet JJJJ.W.N | volgende");
    }
  } catch (fout) {
    console.error(fout instanceof Error ? fout.message : String(fout));
    process.exit(1);
  }
}
