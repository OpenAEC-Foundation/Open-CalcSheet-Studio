/**
 * Bouwt de rekendienst zonder venster (docs/rekendienst.md):
 *
 *   • packages/headless/dist/rekendienst.mjs — de dienst als één bestand voor Node 24
 *     (esbuild): de rekenkern, de tools van de app, de moduleteksten en de vertalingen
 *     erin. Alleen Node is nodig om hem te draaien.
 *   • met --paginas ook packages/desktop/dist-rekendienst/ — de pagina's waarmee headless
 *     Chromium het rapport als PDF maakt (`vite build --mode rekendienst`). Zonder die map
 *     geeft report_pdf NOT_AVAILABLE; de rest werkt.
 *
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 *
 *   node scripts/bouw-rekendienst.mjs [--paginas] [--uit <bestand>]
 */
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { talenPlugin } from "./lib/talen.mjs";
import { viteAchtervoegsels } from "./lib/vite-achtervoegsels.mjs";

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const i = args.indexOf("--uit");
const uit = i >= 0 ? resolve(args[i + 1]) : join(WORTEL, "packages/headless/dist/rekendienst.mjs");

if (!existsSync(join(WORTEL, "packages/core/dist/index.js"))) {
  console.error("packages/core/dist ontbreekt: bouw eerst de core met `npm --prefix packages/core run build`.");
  process.exit(1);
}

await build({
  entryPoints: [join(WORTEL, "packages/headless/src/ingang.mjs")],
  bundle: true,
  outfile: uit,
  format: "esm",
  platform: "node",
  target: "node24",
  mainFields: ["module", "main"],
  logLevel: "warning",
  plugins: [viteAchtervoegsels, talenPlugin],
  loader: { ".css": "empty", ".png": "dataurl", ".svg": "text", ".webp": "dataurl", ".woff": "empty", ".woff2": "empty", ".ttf": "empty", ".wasm": "empty", ".geojson": "text" },
  define: {
    __LIBRARY_DEV__: '""',
    __WERKPLEK__: "false",
    "import.meta.env.DEV": "false",
    "import.meta.env.PROD": "true",
    "import.meta.env.MODE": '"rekendienst"',
    "import.meta.env.BASE_URL": '"/"',
  },
  banner: { js: "import { createRequire as __maakRequire } from 'node:module'; const require = __maakRequire(import.meta.url);" },
  legalComments: "eof",
});
console.log(`Geschreven: ${uit} (${Math.round(statSync(uit).size / 1024)} kB)`);

if (args.includes("--paginas")) {
  const desktop = join(WORTEL, "packages/desktop");
  const vite = join(WORTEL, "node_modules/vite/bin/vite.js");
  const r = spawnSync(process.execPath, [vite, "build", "--mode", "rekendienst", "--base", "./", "--outDir", "dist-rekendienst", "--logLevel", "warn"], {
    cwd: desktop,
    stdio: "inherit",
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
  console.log(`Geschreven: ${join(desktop, "dist-rekendienst")}`);
}
