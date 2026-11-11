/**
 * Controle van het meeleveren van Open FEM Studio (scripts/haal-fem-server.mjs).
 *
 * Toetst:
 *   • versie.json is geldig: een versie, de repository, een tag en per platform
 *     een bestand met een sha256 van 64 hextekens;
 *   • de keuze van het bestand per platform, ook als er (nog) geen is;
 *   • de controle van de sha256: goed, fout, en een bestand dat er niet is;
 *   • fem-studio/* staat in bundle.resources en het ophalen in beforeBuildCommand,
 *     de server zelf staat niet in git;
 *   • de namen in de release van FEM Studio (openaec-mcp-server_<versie>_<platform>)
 *     en het vullen van versie.json uit SHA256SUMS (pin-fem-server.mjs);
 *   • de workflows: alleen de stap "FEM Studio ophalen" krijgt FEM_STUDIO_TOKEN, de
 *     handtekening wordt vóór het bouwen gecontroleerd, de controles zoeken de server
 *     in de installers, en de release-tekst zegt of hij is meegeleverd.
 *
 * Het ophalen zelf (gh release download) toetst dit script niet: dat vraagt
 * toegang tot de release van FEM Studio. De Rust-kant heeft eigen tests
 * (packages/desktop/src-tauri/fem-brug: cargo test, en met de echte server
 * cargo test -- --ignored).
 *
 * Draaien:  node scripts/check-fem-server.mjs
 */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ditPlatform, kiesBestand, klopt, leesSha256Sums, leesVersie, PLATFORMEN, serverNaam } from "./haal-fem-server.mjs";
import { maakVersie } from "./pin-fem-server.mjs";

let fouten = 0;
function meld(ok, tekst) {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}`);
  if (!ok) fouten++;
}

const hier = dirname(fileURLToPath(import.meta.url));
const tauriMap = join(hier, "..", "packages", "desktop", "src-tauri");

console.log("\nversie.json");
{
  const v = leesVersie();
  meld(/^\d{4}\.\d{1,2}\.\d+$/.test(v.versie), `een versie als jaar.week.nummer: ${v.versie}`);
  meld(v.repo === "OpenAEC-Foundation/open-fem-studio" && v.tag === `v${v.versie}`, "de repository en de tag bij die versie");
  const bestanden = Object.entries(v.bestanden ?? {});
  meld(bestanden.every(([p]) => PLATFORMEN.includes(p)), "alleen bekende platformen");
  meld(bestanden.every(([p]) => kiesBestand(v, p) !== null), "elk bestand met een naam en een sha256 van 64 hextekens");
  meld(bestanden.every(([p, b]) => b.naam === serverNaam(v.versie, p)), "elk bestand heet openaec-mcp-server_<versie>_<platform>");
}

console.log("\nDe namen in de release van FEM Studio en SHA256SUMS");
{
  meld(serverNaam("2026.46.0", "windows-x64") === "openaec-mcp-server_2026.46.0_windows-x64.exe", "Windows met .exe");
  meld(serverNaam("2026.46.0", "macos-universal") === "openaec-mcp-server_2026.46.0_macos-universal", "macOS zonder extensie");
  meld(serverNaam("2026.46.0", "linux-x64") === "openaec-mcp-server_2026.46.0_linux-x64", "Linux zonder extensie");
  const a = "a".repeat(64);
  const b = "B".repeat(64);
  const sums = [
    `${a}  Open.FEM.Studio_2026.46.0_x64-setup.exe`,
    `${a}  openaec-mcp-server_2026.46.0_windows-x64.exe`,
    `${b} *openaec-mcp-server_2026.46.0_linux-x64`,
    `${a}  openaec-mcp-server_2026.45.0_macos-universal`,
    "",
  ].join("\r\n");
  const gelezen = leesSha256Sums(sums, "2026.46.0");
  meld(gelezen["windows-x64"]?.sha256 === a, "een regel met twee spaties");
  meld(gelezen["linux-x64"]?.sha256 === "b".repeat(64), "een regel met * (binair), de hash in kleine letters");
  meld(gelezen["macos-universal"] === undefined, "een server van een andere versie telt niet");
  meld(Object.keys(gelezen).length === 2, "de installers tellen niet");
  const nieuw = maakVersie("2026.46.0", gelezen);
  meld(nieuw.repo === "OpenAEC-Foundation/open-fem-studio" && nieuw.tag === "v2026.46.0", "pin-fem-server: de repository en de tag");
  meld(kiesBestand(nieuw, "windows-x64")?.naam === "openaec-mcp-server_2026.46.0_windows-x64.exe", "pin-fem-server: haal-fem-server vindt het bestand");
}

console.log("\nHet bestand per platform");
{
  const leeg = { versie: "2026.45.0", bestanden: {} };
  meld(kiesBestand(leeg, "windows-x64") === null, "zonder bestanden: geen server, de app bouwt zonder");
  const sha = "a".repeat(64);
  const met = { bestanden: { "linux-x64": { naam: "openaec-mcp-server-linux-x64", sha256: sha } } };
  meld(kiesBestand(met, "linux-x64")?.naam === "openaec-mcp-server-linux-x64", "een platform dat erin staat");
  meld(kiesBestand(met, "macos-universal") === null, "een platform dat er niet in staat");
  meld(kiesBestand({ bestanden: { "linux-x64": { naam: "x", sha256: "kort" } } }, "linux-x64") === null, "een sha256 die geen 64 hextekens is, telt niet");
  meld(ditPlatform("win32") === "windows-x64" && ditPlatform("darwin") === "macos-universal" && ditPlatform("linux") === "linux-x64", "de platformnamen");
}

console.log("\nDe sha256");
{
  const map = mkdtempSync(join(tmpdir(), "check-fem-server-"));
  try {
    const pad = join(map, "server");
    writeFileSync(pad, "proef");
    const goed = createHash("sha256").update("proef").digest("hex");
    meld(klopt(pad, goed), "de goede hash klopt");
    meld(klopt(pad, goed.toUpperCase()), "ook in hoofdletters");
    meld(!klopt(pad, "0".repeat(64)), "een andere hash klopt niet");
    meld(!klopt(join(map, "weg"), goed), "een bestand dat er niet is, klopt niet");
  } finally {
    rmSync(map, { recursive: true, force: true });
  }
}

console.log("\nDe bundel");
{
  const conf = JSON.parse(readFileSync(join(tauriMap, "tauri.conf.json"), "utf8"));
  meld(conf.bundle.resources.includes("fem-studio/*"), "fem-studio/* staat in bundle.resources");
  meld(/haal-fem-server\.mjs --als-nodig/.test(conf.build.beforeBuildCommand), "beforeBuildCommand haalt de server als dat nodig is");
  const negeer = readFileSync(join(hier, "..", ".gitignore"), "utf8");
  meld(negeer.includes("packages/desktop/src-tauri/fem-studio/openaec-mcp-server"), "de server zelf staat niet in git");
}

console.log("\nDe workflows");
{
  const lees = (pad) => readFileSync(join(hier, "..", pad), "utf8").replace(/\r\n/g, "\n");
  const ondertekend = lees(".github/workflows/desktop-ondertekend.yml");
  // De stappen van de jobs, elk vanaf "      - " tot de volgende, zonder commentaar.
  const stappen = ondertekend
    .split("\n")
    .filter((r) => !r.trim().startsWith("#"))
    .join("\n")
    .split(/\n(?=      - )/);
  const metToken = stappen.filter((s) => s.includes("FEM_STUDIO_TOKEN"));
  meld(metToken.length === 3 && metToken.every((s) => s.includes("name: FEM Studio ophalen") && s.includes("GH_TOKEN: ${{ secrets.FEM_STUDIO_TOKEN }}")),
    "alleen de drie stappen 'FEM Studio ophalen' krijgen FEM_STUDIO_TOKEN");
  const anders = [".github/workflows/release.yml", ".github/workflows/nightly.yml", ".github/workflows/build.yml",
    ".github/workflows/release-concept.yml", ".github/workflows/release-controleren.yml", ".github/workflows/ci.yml"];
  meld(anders.every((pad) => !lees(pad).includes("FEM_STUDIO_TOKEN")), "geen andere workflow noemt FEM_STUDIO_TOKEN");
  const voor = (a, b) => ondertekend.includes(a) && ondertekend.indexOf(a) < ondertekend.indexOf(b);
  meld(voor("windows-controleren.ps1 -Bestand packages/desktop/src-tauri/fem-studio/openaec-mcp-server.exe", "name: Build and sign Tauri app"),
    "Windows: de handtekening van de server vóór het bouwen");
  meld(voor("macos-controleren.sh --fem-server packages/desktop/src-tauri/fem-studio/openaec-mcp-server", "name: Build, sign and notarize Tauri app"),
    "macOS: de handtekening van de server vóór het bouwen en notariseren");
  meld((ondertekend.match(/FEM_STUDIO_VEREIST: \$\{\{ steps\.fem\.outputs\.status == 'meegeleverd' \}\}/g) ?? []).length === 3,
    "de controle van de installers eist de server op elk platform waar hij is opgehaald");
  for (const w of ["release", "nightly"]) {
    const tekst = lees(`.github/workflows/${w}.yml`);
    meld(tekst.includes("${{ needs.bouwen.outputs.fem-studio-tekst }}"), `${w}: de release-tekst zegt of FEM Studio is meegeleverd`);
    meld(tekst.includes("fem-studio: ${{ needs.bouwen.outputs.fem-studio-platformen }}"), `${w}: de controle van het concept weet waar de server in moet`);
  }
  const controleren = lees(".github/workflows/release-controleren.yml");
  meld(["windows-x64", "macos-universal", "linux-x64"].every((p) => controleren.includes(`contains(inputs.fem-studio, '${p}')`)),
    "release-controleren: per platform of de server vereist is");
}

console.log("\nDe controlescripts");
{
  const lees = (pad) => readFileSync(join(hier, "release", pad), "utf8");
  meld(lees("windows-controleren.ps1").includes("'fem-studio'") && lees("windows-controleren.ps1").includes("FEM_STUDIO_VEREIST"),
    "Windows: zoekt fem-studio\\openaec-mcp-server.exe in de installatie");
  meld(lees("macos-controleren.sh").includes("Contents/Resources/fem-studio/openaec-mcp-server"), "macOS: zoekt de server in de app");
  meld(/runtime/.test(lees("macos-controleren.sh")) && lees("macos-controleren.sh").includes("controleer_fem_server"),
    "macOS: Developer ID, hardened runtime en tijdstempel van de server");
  meld(lees("linux-controleren.sh").includes("fem-studio/openaec-mcp-server") && lees("linux-controleren.sh").includes("--appimage-extract"),
    "Linux: zoekt de server in de .deb en de .AppImage");
}

console.log(fouten === 0 ? "\nAlles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
