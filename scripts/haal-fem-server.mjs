/**
 * Haalt de server van Open FEM Studio op voor de bundel van de app.
 *
 * CalcSheet levert de server mee in `packages/desktop/src-tauri/fem-studio/` en
 * start hem headless voor de normtoetsingen (src-tauri/src/fem_studio.rs).
 * `fem-studio/versie.json` pint de versie en per platform het bestand uit de
 * release van FEM Studio, met zijn sha256:
 *
 *   { "versie": "2026.46.0", "repo": "OpenAEC-Foundation/open-fem-studio",
 *     "tag": "v2026.46.0",
 *     "bestanden": { "windows-x64": { "naam": "…", "sha256": "…" }, … } }
 *
 * De platformen heten windows-x64, macos-universal en linux-x64. In de release van
 * FEM Studio heet het bestand openaec-mcp-server_<versie>_<platform>, op Windows met
 * .exe (zie serverNaam). `node scripts/pin-fem-server.mjs <tag>` vult versie.json
 * uit de SHA256SUMS van die release.
 *
 * De server is ondertekend door FEM Studio en gaat ongewijzigd mee: Tauri tekent
 * een resource niet. De workflow controleert die handtekening vóór het bouwen
 * (scripts/release/*-controleren.*).
 *
 * Draaien:
 *   node scripts/haal-fem-server.mjs              ophalen (CI, met GH_TOKEN)
 *   node scripts/haal-fem-server.mjs --als-nodig  niets doen als de server er al is
 *                                                 en klopt (beforeBuildCommand)
 *
 * Zonder bestand voor dit platform, of zonder GH_TOKEN, bouwt de app zonder
 * server; dat meldt het script (in de workflow als waarschuwing) en het sluit af
 * met 0. Een server met een verkeerde sha256 wordt verwijderd en geeft afsluitcode
 * 1: die mag nooit in een bundel komen. Een mislukte download (een token zonder
 * toegang, een verkeerde tag) geeft ook 1: dan klopt er iets niet dat een mens
 * moet zien.
 *
 * In de workflow schrijft het script naar GITHUB_OUTPUT: status (meegeleverd of
 * niet-meegeleverd), versie en platform.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdtempSync, readFileSync, renameSync, rmSync, chmodSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));
export const MAP = join(hier, "..", "packages", "desktop", "src-tauri", "fem-studio");
export const SERVER = join(MAP, process.platform === "win32" ? "openaec-mcp-server.exe" : "openaec-mcp-server");
export const PLATFORMEN = ["windows-x64", "macos-universal", "linux-x64"];

/** De naam van dit platform in `bestanden`. */
export function ditPlatform(platform = process.platform) {
  if (platform === "win32") return "windows-x64";
  if (platform === "darwin") return "macos-universal";
  return "linux-x64";
}

/** De naam van de losse server in een release van FEM Studio. */
export function serverNaam(versie, platform) {
  return `openaec-mcp-server_${versie}_${platform}${platform.startsWith("windows") ? ".exe" : ""}`;
}

/**
 * De bestanden voor versie.json uit de tekst van SHA256SUMS ("<hash>  <naam>" of
 * "<hash> *<naam>"): per platform de server van deze versie, als die erin staat.
 */
export function leesSha256Sums(tekst, versie) {
  const hashes = new Map();
  for (const regel of tekst.split(/\r?\n/)) {
    const m = /^([0-9a-f]{64}) [ *](.+)$/i.exec(regel.trim());
    if (m) hashes.set(m[2], m[1].toLowerCase());
  }
  const bestanden = {};
  for (const platform of PLATFORMEN) {
    const naam = serverNaam(versie, platform);
    if (hashes.has(naam)) bestanden[platform] = { naam, sha256: hashes.get(naam) };
  }
  return bestanden;
}

/** Het bestand voor een platform, of null als er (nog) geen is. */
export function kiesBestand(versie, platform) {
  const b = versie?.bestanden?.[platform];
  return b && typeof b.naam === "string" && /^[0-9a-f]{64}$/i.test(b.sha256 ?? "") ? b : null;
}

/** Of het bestand op `pad` deze sha256 heeft. */
export function klopt(pad, sha256) {
  if (!existsSync(pad)) return false;
  const hash = createHash("sha256").update(readFileSync(pad)).digest("hex");
  return hash.toLowerCase() === String(sha256).toLowerCase();
}

export function leesVersie() {
  return JSON.parse(readFileSync(join(MAP, "versie.json"), "utf8"));
}

function haal(versie, bestand) {
  const tijdelijk = mkdtempSync(join(tmpdir(), "fem-server-"));
  try {
    execFileSync("gh", ["release", "download", versie.tag, "--repo", versie.repo, "--pattern", bestand.naam, "--dir", tijdelijk], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    const [naam] = readdirSync(tijdelijk);
    const pad = join(tijdelijk, naam ?? bestand.naam);
    if (!klopt(pad, bestand.sha256)) {
      console.error(`FEM Studio: ${bestand.naam} heeft niet de sha256 uit versie.json; niet meegeleverd.`);
      process.exit(1);
    }
    renameSync(pad, SERVER);
    if (process.platform !== "win32") chmodSync(SERVER, 0o755);
  } finally {
    rmSync(tijdelijk, { recursive: true, force: true });
  }
}

/** De uitkomst voor de workflow: de uitvoer van de stap en een regel in de samenvatting. */
function meldWorkflow(status, versie, platform, tekst) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `status=${status}\nversie=${versie}\nplatform=${platform}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## FEM Studio (${platform})\n\n${tekst}\n\n`);
  }
}

function main() {
  const alsNodig = process.argv.includes("--als-nodig");
  const versie = leesVersie();
  const platform = ditPlatform();
  const bestand = kiesBestand(versie, platform);
  // In de bouwstap (--als-nodig) is de server al opgehaald of bewust niet: geen
  // tweede waarschuwing en geen uitvoer voor de workflow.
  const nietMeegeleverd = (reden) => {
    const melding = `FEM Studio ${versie.versie}: ${reden}; de app bouwt zonder (niet meegeleverd).`;
    console.log(alsNodig ? melding : `::warning::${melding}`);
    if (!alsNodig) meldWorkflow("niet-meegeleverd", versie.versie, platform, `**Niet meegeleverd**: ${reden}.`);
  };
  const meegeleverd = (melding) => {
    console.log(`FEM Studio ${versie.versie}: ${melding}`);
    if (!alsNodig) meldWorkflow("meegeleverd", versie.versie, platform, `Meegeleverd: \`${bestand.naam}\`, sha256 \`${bestand.sha256}\`.`);
  };
  if (!bestand) {
    nietMeegeleverd(`geen server voor ${platform} in versie.json`);
    return;
  }
  if (existsSync(SERVER)) {
    if (klopt(SERVER, bestand.sha256)) {
      meegeleverd("de server is er en klopt.");
      return;
    }
    // Een oude of beschadigde server: weg, en opnieuw ophalen.
    rmSync(SERVER, { force: true });
  }
  if (!process.env.GH_TOKEN) {
    nietMeegeleverd("geen GH_TOKEN om de server op te halen (in de workflow: het secret FEM_STUDIO_TOKEN)");
    return;
  }
  haal(versie, bestand);
  meegeleverd(`${bestand.naam} opgehaald en gecontroleerd.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
