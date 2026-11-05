import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

/**
 * De lettertypen van KaTeX alleen als WOFF2. Het stijlblad noemt elk lettertype ook als
 * WOFF en TTF, voor browsers van voor 2016; de webviews van deze app kiezen altijd het
 * eerste. Zonder dit gaan veertig ongebruikte bestanden mee in de installer.
 */
function katexAlleenWoff2(): Plugin {
  return {
    name: "katex-alleen-woff2",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("katex/dist/katex") || !/\.css(\?|$)/.test(id)) return null;
      return code.replace(/,\s*url\([^)]+\.woff\) format\("woff"\),\s*url\([^)]+\.ttf\) format\("truetype"\)/g, "");
    },
  };
}

// https://vite.dev/config/
export default defineConfig(async ({ command }) => ({
  plugins: [katexAlleenWoff2(), react()],

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
