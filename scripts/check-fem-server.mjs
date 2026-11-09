/**
 * Controle van het meeleveren van Open FEM Studio (scripts/haal-fem-server.mjs).
 *
 * Toetst:
 *   • versie.json is geldig: een versie, de repository, een tag en per platform
 *     een bestand met een sha256 van 64 hextekens;
 *   • de keuze van het bestand per platform, ook als er (nog) geen is;
 *   • de controle van de sha256: goed, fout, en een bestand dat er niet is;
 *   • fem-studio/* staat in bundle.resources en het ophalen in beforeBuildCommand,
 *     de server zelf staat niet in git.
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
import { ditPlatform, kiesBestand, klopt, leesVersie } from "./haal-fem-server.mjs";

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
  meld(bestanden.every(([p]) => ["windows-x64", "macos-universal", "linux-x64"].includes(p)), "alleen bekende platformen");
  meld(bestanden.every(([p]) => kiesBestand(v, p) !== null), "elk bestand met een naam en een sha256 van 64 hextekens");
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

console.log(fouten === 0 ? "\nAlles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
