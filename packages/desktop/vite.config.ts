import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * De platformbouw voor de werkplek van de OpenAEC SuperCloud (`npm run
 * build:platform`, docs/supercloud-werkplek.md): de icoonsprites in index.html,
 * want een <use> naar een los SVG-bestand wordt in een frame met opaque origin
 * geweigerd (calcIcons.ts).
 */
function spritesInline() {
  return {
    name: "openaec-sprites-inline",
    transformIndexHtml(html: string) {
      const sprites = ["standard", "calculations", "spreadsheet", "pdf"]
        .map((naam) => readFileSync(new URL(`./public/icons/${naam}.svg`, import.meta.url), "utf8").replace(/<\?xml[^>]*>\s*/, ""))
        .join("");
      return html.replace("<body>", `<body>${sprites}`);
    },
  };
}

/**
 * De platformbouw: de Library (map library/) gaat mee in de bundel, onder
 * `library/`. De werkplek heeft geen netwerk buiten de bundel.
 */
function libraryInBundel() {
  const wortel = fileURLToPath(new URL("../../library", import.meta.url));
  const bestanden = (map: string): string[] =>
    readdirSync(map).flatMap((naam) => {
      const pad = join(map, naam);
      return statSync(pad).isDirectory() ? bestanden(pad) : [pad];
    });
  return {
    name: "openaec-library-in-bundel",
    generateBundle(this: { emitFile(f: { type: "asset"; fileName: string; source: Uint8Array }): void }) {
      for (const pad of bestanden(wortel)) {
        if (!/\.(json|cpd)$/.test(pad)) continue;
        this.emitFile({ type: "asset", fileName: `library/${relative(wortel, pad).replace(/\\/g, "/")}`, source: readFileSync(pad) });
      }
    },
  };
}

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

/**
 * De pagina's voor het rapport van de rekendienst zonder venster (`--mode rekendienst`,
 * scripts/bouw-rekendienst.mjs, docs/rekendienst.md): de gewone app, met de Library in de
 * bundel en de haak `window.__ocs` (main.tsx), waarmee headless Chromium het project laadt
 * en het rapport afdrukt.
 */
const plugins = (mode: string) =>
  mode === "platform" ? [react(), spritesInline(), libraryInBundel()] : mode === "rekendienst" ? [react(), libraryInBundel()] : [react()];

// https://vite.dev/config/
export default defineConfig(async ({ command, mode }) => ({
  plugins: plugins(mode),

  define: {
    // De Library zit niet in de app; in de dev-server komt hij uit de map library/,
    // in de platformbouw uit de bundel zelf.
    __LIBRARY_DEV__: JSON.stringify(
      mode === "platform" || mode === "rekendienst" ? "./library" : command === "serve" ? `/@fs${new URL("../../library", import.meta.url).pathname}` : "",
    ),
    // De werkplek van de SuperCloud (src/werkplek/werkplek.ts).
    __WERKPLEK__: JSON.stringify(mode === "platform"),
  },

  // De spreadsheetkern laadt zijn WASM en worker relatief aan import.meta.url;
  // prebundelen verbreekt die paden.
  worker: { format: "es" as const },
  optimizeDeps: { exclude: ["@betteroffice/xlsx", "@betteroffice/xlsx-react"] },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 3021,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 3011,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
