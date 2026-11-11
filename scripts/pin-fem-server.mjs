/**
 * Vult packages/desktop/src-tauri/fem-studio/versie.json uit een release van Open
 * FEM Studio: de versie, de tag en per platform de losse server
 * (openaec-mcp-server_<versie>_<platform>) met zijn sha256 uit de SHA256SUMS van
 * die release.
 *
 * Draaien, met toegang tot de release van FEM Studio (`gh auth login` of GH_TOKEN):
 *   node scripts/pin-fem-server.mjs v2026.46.0
 *   node scripts/pin-fem-server.mjs v2026.46.0 --sums <SHA256SUMS>   zonder downloaden
 *
 * Daarna:
 *   node scripts/haal-fem-server.mjs     haalt de server voor dit platform en
 *                                        controleert de sha256
 *   node scripts/check-fem-server.mjs    toetst versie.json
 *
 * SHA256SUMS van FEM Studio heeft een losse OpenPGP-handtekening (SHA256SUMS.asc)
 * van de OpenAEC-releasesleutel (vingerafdruk in scripts/release/openaec-vingerafdruk.txt).
 * Dit script controleert die niet; wie dat wil: gpg --verify SHA256SUMS.asc SHA256SUMS.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { MAP, PLATFORMEN, leesSha256Sums } from "./haal-fem-server.mjs";

export const REPO = "OpenAEC-Foundation/open-fem-studio";

/** De inhoud van versie.json voor deze versie en bestanden. */
export function maakVersie(versie, bestanden) {
  return { versie, repo: REPO, tag: `v${versie}`, bestanden };
}

function haalSums(tag) {
  const tijdelijk = mkdtempSync(join(tmpdir(), "fem-sums-"));
  try {
    execFileSync("gh", ["release", "download", tag, "--repo", REPO, "--pattern", "SHA256SUMS", "--dir", tijdelijk], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    return readFileSync(join(tijdelijk, "SHA256SUMS"), "utf8");
  } finally {
    rmSync(tijdelijk, { recursive: true, force: true });
  }
}

function main() {
  const args = process.argv.slice(2);
  const s = args.indexOf("--sums");
  const sumsPad = s >= 0 ? args[s + 1] : null;
  const tag = args.find((a, i) => !a.startsWith("--") && !(s >= 0 && i === s + 1));
  const versie = String(tag ?? "").replace(/^v/, "");
  if (!/^\d{4}\.\d{1,2}\.\d+$/.test(versie) || (s >= 0 && !sumsPad)) {
    console.error("gebruik: node scripts/pin-fem-server.mjs vJJJJ.W.N [--sums <SHA256SUMS>]");
    process.exit(2);
  }

  const tekst = sumsPad ? readFileSync(sumsPad, "utf8") : haalSums(`v${versie}`);
  const bestanden = leesSha256Sums(tekst, versie);
  if (Object.keys(bestanden).length === 0) {
    console.error(`Geen losse server in SHA256SUMS van v${versie}. Heeft die release ze al (FEM Studio #298)?`);
    process.exit(1);
  }

  writeFileSync(join(MAP, "versie.json"), `${JSON.stringify(maakVersie(versie, bestanden), null, 2)}\n`);
  console.log(`versie.json: FEM Studio ${versie}`);
  for (const platform of PLATFORMEN) {
    const b = bestanden[platform];
    console.log(b ? `  ${platform.padEnd(16)} ${b.naam}  ${b.sha256}` : `  ${platform.padEnd(16)} ontbreekt: de app bouwt hier zonder server`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
