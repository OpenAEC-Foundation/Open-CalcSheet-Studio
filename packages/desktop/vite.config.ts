import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

/**
 * De platformbouw voor de werkplek van de OpenAEC SuperCloud (`npm run
 * build:platform`): de icoonsprites in index.html, want een <use> naar een los
 * SVG-bestand wordt in een frame met opaque origin geweigerd (calcIcons.ts).
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

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async ({ command, mode }) => ({
  plugins: mode === "platform" ? [react(), spritesInline()] : [react()],

  // De Library zit niet in de app; in de dev-server komt hij uit de map library/.
  define: {
    __LIBRARY_DEV__: JSON.stringify(command === "serve" ? `/@fs${new URL("../../library", import.meta.url).pathname}` : ""),
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
