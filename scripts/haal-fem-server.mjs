/**
 * Haalt de server van Open FEM Studio op voor de bundel van de app.
 *
 * CalcSheet levert de server mee in `packages/desktop/src-tauri/fem-studio/` en
 * start hem headless voor de normtoetsingen (src-tauri/src/fem_studio.rs).
 * `fem-studio/versie.json` pint de versie en per platform het bestand uit de
 * release van FEM Studio, met zijn sha256:
 *
 *   { "versie": "2026.45.0", "repo": "OpenAEC-Foundation/open-fem-studio",
 *     "tag": "v2026.45.0",
 *     "bestanden": { "windows-x64": { "naam": "…", "sha256": "…" }, … } }
 *
 * De platformen heten windows-x64, macos-universal en linux-x64.
 *
 * Draaien:
 *   node scripts/haal-fem-server.mjs              ophalen (CI, met GH_TOKEN)
 *   node scripts/haal-fem-server.mjs --als-nodig  niets doen als de server er al is
 *                                                 en klopt (beforeBuildCommand)
 *
 * Zonder bestand voor dit platform, of zonder GH_TOKEN, bouwt de app zonder
 * server; dat meldt het script en het sluit af met 0. Een server met een
 * verkeerde sha256 wordt verwijderd en geeft afsluitcode 1: die mag nooit in
 * een bundel komen.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, chmodSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));
export const MAP = join(hier, "..", "packages", "desktop", "src-tauri", "fem-studio");
export const SERVER = join(MAP, process.platform === "win32" ? "openaec-mcp-server.exe" : "openaec-mcp-server");

/** De naam van dit platform in `bestanden`. */
export function ditPlatform(platform = process.platform) {
  if (platform === "win32") return "windows-x64";
  if (platform === "darwin") return "macos-universal";
  return "linux-x64";
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

function main() {
  const alsNodig = process.argv.includes("--als-nodig");
  const versie = leesVersie();
  const platform = ditPlatform();
  const bestand = kiesBestand(versie, platform);
  if (!bestand) {
    console.log(`FEM Studio ${versie.versie}: geen server voor ${platform} in versie.json; de app bouwt zonder (niet meegeleverd).`);
    return;
  }
  if (existsSync(SERVER)) {
    if (klopt(SERVER, bestand.sha256)) {
      console.log(`FEM Studio ${versie.versie}: de server is er en klopt.`);
      return;
    }
    // Een oude of beschadigde server: weg, en opnieuw ophalen.
    rmSync(SERVER, { force: true });
  }
  if (!process.env.GH_TOKEN) {
    const melding = `FEM Studio ${versie.versie}: geen GH_TOKEN om de server op te halen; de app bouwt zonder (niet meegeleverd).`;
    console.log(alsNodig ? melding : `::warning::${melding}`);
    return;
  }
  haal(versie, bestand);
  console.log(`FEM Studio ${versie.versie}: ${bestand.naam} opgehaald en gecontroleerd.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
