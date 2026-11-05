/**
 * Bewaakt wat de app meteen laadt: de zware bibliotheken horen niet in de eerste lading.
 *
 * Eén statische import op de verkeerde plek haalt zo de rekenkern of CodeMirror terug in
 * wat bij elke start wordt ingelezen, en dat merkt niemand tot het venster traag opent.
 * Deze controle bouwt de app naar een tijdelijke map en loopt vanaf de ingang de statische
 * imports af. Hij kijkt naar welke pakketten erin zitten en niet naar tijden of hashes;
 * de grens op de grootte staat ruim, zodat gewone groei geen alarm geeft.
 *
 * Gemeten is de snelheid zelf met scripts/meet-snelheid.mjs.
 *
 * Draaien:  node scripts/check-eerste-lading.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));
const REPO = join(hier, "..");
const DESKTOP = join(REPO, "packages/desktop");

/** Pakketten die pas laden als hun scherm in beeld komt. */
const NIET_IN_EERSTE_LADING = [
  "mathjs", "katex", "decimal.js", "typed-function",
  "@codemirror/", "@lezer/", "@uiw/",
  "leaflet", "react-leaflet",
  "three", "camera-controls", "@thatopen/", "web-ifc",
  "pdfjs-dist", "@betteroffice/",
  "dompurify",
];
/** De rekenkern zelf, behalve wat het bestandsformaat nodig heeft. */
const KERN_NIET = ["evaluator.js", "parser.js", "renderer.js", "latex.js"];
/** Nu 1,5 MB; meer dan dit is geen groei meer maar een import die teruggekomen is. */
const MAX_EERSTE_JS = 2.5 * 1024 * 1024;

const pakketVan = (id) => {
  const pad = id.replace(/\\/g, "/");
  const i = pad.lastIndexOf("node_modules/");
  if (i < 0) return null;
  const delen = pad.slice(i + 13).split("/");
  return delen[0].startsWith("@") ? `${delen[0]}/${delen[1]}` : delen[0];
};

const { build } = await import(pathToFileURL(join(REPO, "node_modules/vite/dist/node/index.js")).href);
const uit = mkdtempSync(join(tmpdir(), "eerste-lading-"));
const stukken = new Map();
let fouten = 0;
const klopt = (naam, goed, detail) => {
  console.log(`  ${goed ? "OK    " : "FOUT  "} ${naam}${goed || !detail ? "" : `: ${detail}`}`);
  if (!goed) fouten++;
};

try {
  process.chdir(DESKTOP);
  await build({
    root: DESKTOP,
    logLevel: "error",
    build: { outDir: uit, emptyOutDir: true },
    plugins: [{
      name: "lees-stukken",
      generateBundle(_o, bundel) {
        for (const [naam, stuk] of Object.entries(bundel)) if (stuk.type === "chunk") stukken.set(naam, stuk);
      },
    }],
  });

  const ingang = [...stukken.values()].find((s) => s.isEntry);
  const eerste = new Set();
  const loop = (naam) => {
    if (eerste.has(naam) || !stukken.has(naam)) return;
    eerste.add(naam);
    for (const i of stukken.get(naam).imports) loop(i);
  };
  loop(ingang.fileName);

  // De stijlen van KaTeX en Leaflet laden wel meteen (stijlen.ts); het gaat om de code.
  const modules = [...eerste].flatMap((n) => Object.keys(stukken.get(n).modules)).filter((m) => !/\.css(\?|$)/.test(m));
  const pakketten = new Set(modules.map(pakketVan).filter(Boolean));
  const grootte = [...eerste].reduce((som, n) => som + Buffer.byteLength(stukken.get(n).code), 0);

  console.log(`Eerste lading: ${(grootte / 1024).toFixed(0)} kB JavaScript in ${eerste.size} bestand(en)`);
  for (const verboden of NIET_IN_EERSTE_LADING) {
    const treffers = [...pakketten].filter((p) => (verboden.endsWith("/") ? p.startsWith(verboden) : p === verboden));
    klopt(`${verboden} niet in de eerste lading`, treffers.length === 0, treffers.join(", "));
  }
  const kern = modules.map((m) => m.replace(/\\/g, "/")).filter((m) => m.includes("/packages/core/dist/"));
  for (const bestand of KERN_NIET) {
    klopt(`kern/${bestand} niet in de eerste lading`, !kern.some((m) => m.endsWith(`/${bestand}`)));
  }
  klopt(`eerste lading onder ${MAX_EERSTE_JS / 1024 / 1024} MB`, grootte < MAX_EERSTE_JS, `${(grootte / 1048576).toFixed(2)} MB`);

  // De lettertypen van KaTeX alleen als WOFF2 (vite.config.ts).
  const bestanden = readdirSync(join(uit, "assets"));
  klopt("KaTeX alleen als WOFF2", !bestanden.some((f) => /^KaTeX.*\.(woff|ttf)$/.test(f)));
  klopt("KaTeX als WOFF2 aanwezig", bestanden.some((f) => /^KaTeX.*\.woff2$/.test(f)));

  // Eerst de stijlen, op hun vaste volgorde: anders verandert de cascade (stijlen.ts).
  const main = readFileSync(join(DESKTOP, "src/main.tsx"), "utf8");
  klopt("main.tsx laadt de stijlen vóór de app", main.indexOf('"./stijlen"') >= 0 && main.indexOf('"./stijlen"') < main.indexOf('"./App"'));
} finally {
  rmSync(uit, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

console.log(fouten === 0 ? "\nDe eerste lading is licht." : `\n${fouten} controle(s) gezakt.`);
process.exit(fouten === 0 ? 0 : 1);
