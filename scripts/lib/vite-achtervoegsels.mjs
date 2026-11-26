/**
 * Wat vite regelt en esbuild niet kent, voor de scripts die de app met esbuild bundelen
 * (scripts/lib/rapport-html.mjs, scripts/bouw-rekendienst.mjs): `?raw` is de tekst van
 * het bestand, `?url` hier een lege tekst, en import.meta.glob van de modulebeelden een
 * leeg object (die staan niet op papier).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function leesOfLeeg(pad) {
  try {
    return readFileSync(pad, "utf8");
  } catch {
    return "";
  }
}

export const viteAchtervoegsels = {
  name: "vite-achtervoegsels",
  setup(b) {
    b.onResolve({ filter: /\?(raw|url)$/ }, (a) => {
      const [pad, soort] = a.path.split("?");
      return { path: resolve(a.resolveDir, pad), namespace: `vite-${soort}` };
    });
    b.onLoad({ filter: /.*/, namespace: "vite-raw" }, (a) => ({
      contents: `export default ${JSON.stringify(leesOfLeeg(a.path))};`,
      loader: "js",
    }));
    b.onLoad({ filter: /.*/, namespace: "vite-url" }, () => ({ contents: 'export default "";', loader: "js" }));
    // De meegeleverde gewichtenbibliotheek laadt het rapportpaneel pas als het venster opent: niet op papier.
    b.onLoad({ filter: /(ModuleAfbeelding\.tsx|gewichtenLaden\.ts)$/ }, (a) => ({
      contents: readFileSync(a.path, "utf8").replace(/import\.meta\.glob\([\s\S]*?\)\s*(as [^;]+)?;/, "({});"),
      loader: "tsx",
    }));
  },
};
