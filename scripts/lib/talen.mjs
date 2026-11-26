/**
 * De vertalingen van de app in Node, zonder vite.
 *
 * Laden (`import "./lib/talen.mjs"`) legt alle mappen packages/desktop/src/i18n/locales/<taal>/
 * van de talen uit TALEN vast in het register van i18n/talen.ts, zoals bundels.ts dat in de
 * app doet. Zet de import bovenaan: dan staan de vertalingen klaar voordat een rapportbestand
 * ernaar vraagt.
 *
 * `talenPlugin` doet hetzelfde voor een bundel van esbuild: die kent import.meta.glob niet,
 * dus bundels.ts krijgt gewone imports van de bestanden.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BRONTAAL, registreer, TALEN } from "../../packages/desktop/src/i18n/talen.ts";

const hier = dirname(fileURLToPath(import.meta.url));
export const LOCALES = join(hier, "../../packages/desktop/src/i18n/locales");

/** De namespaces: de bestanden van de brontaal. */
export const NAMESPACES = readdirSync(join(LOCALES, BRONTAAL))
  .filter((b) => b.endsWith(".json"))
  .map((b) => b.replace(/\.json$/, ""))
  .sort();

/** De inhoud van één vertaalbestand; ontbreekt het, dan undefined. */
export function leesBundel(taal, ns) {
  const pad = join(LOCALES, taal, `${ns}.json`);
  return existsSync(pad) ? JSON.parse(readFileSync(pad, "utf8")) : undefined;
}

for (const { code } of TALEN) {
  const map = join(LOCALES, code);
  if (!existsSync(map)) continue;
  for (const bestand of readdirSync(map)) {
    if (bestand.endsWith(".json")) registreer(code, bestand.replace(/\.json$/, ""), leesBundel(code, bestand.replace(/\.json$/, "")));
  }
}

export { TALEN, BRONTAAL };

// ── Ontbrekende sleutels ────────────────────────────────────────────────────

const MEERVOUD = /_(zero|one|two|few|many|other)$/;

/** Alle sleutels van een bestand, plat: "groep.sleutel", een lijst als "lijst.0". */
export function sleutels(o, voor = "") {
  return Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? sleutels(v, `${voor}${k}.`) : [`${voor}${k}`]));
}

/**
 * Wat in een taal ontbreekt of te veel is tegenover de brontaal, per namespace, als
 * "ns:sleutel". Meervouden tellen per taal: het Engels heeft `_one` en `_other`, het
 * Litouws `_one`, `_few`, `_many` en `_other` (Intl.PluralRules). Een meervoud telt als
 * één sleutel, en moet in elke taal al zijn eigen vormen hebben.
 */
export function vergelijkSleutels(taal) {
  const vormen = new Intl.PluralRules(taal).resolvedOptions().pluralCategories;
  const mist = [];
  const teVeel = [];
  for (const ns of NAMESPACES) {
    const bron = sleutels(leesBundel(BRONTAAL, ns));
    const inhoud = leesBundel(taal, ns);
    if (!inhoud) {
      mist.push(`${ns}: het hele bestand`);
      continue;
    }
    const hier = sleutels(inhoud);
    const basis = (lijst) => new Set(lijst.map((k) => k.replace(MEERVOUD, "")));
    const bronBasis = basis(bron);
    const hierBasis = basis(hier);
    for (const k of bronBasis) if (!hierBasis.has(k)) mist.push(`${ns}:${k}`);
    for (const k of hierBasis) if (!bronBasis.has(k)) teVeel.push(`${ns}:${k}`);
    // Een meervoud in de bron: in deze taal alle vormen.
    const meervouden = new Set(bron.filter((k) => MEERVOUD.test(k)).map((k) => k.replace(MEERVOUD, "")));
    for (const m of meervouden) {
      for (const v of vormen) if (hierBasis.has(m) && !hier.includes(`${m}_${v}`)) mist.push(`${ns}:${m}_${v}`);
    }
  }
  return { mist, teVeel };
}

/** Plugin voor esbuild: bundels.ts met gewone imports in plaats van import.meta.glob. */
export const talenPlugin = {
  name: "talen",
  setup(b) {
    b.onLoad({ filter: /i18n[\\/]bundels\.ts$/ }, (a) => {
      const bestanden = TALEN.flatMap(({ code }) => {
        const map = join(LOCALES, code);
        return existsSync(map) ? readdirSync(map).filter((f) => f.endsWith(".json")).map((f) => `./locales/${code}/${f}`) : [];
      });
      const imports = bestanden.map((p, i) => `import __t${i} from ${JSON.stringify(p)};`).join("\n");
      const lijst = `({${bestanden.map((p, i) => `${JSON.stringify(p)}: __t${i}`).join(", ")}})`;
      const bron = readFileSync(a.path, "utf8").replace(/import\.meta\.glob(<[^>]*>)?\([\s\S]*?\)\s*;/, `${lijst};`);
      return { contents: `${imports}\n${bron}`, loader: "ts", resolveDir: dirname(a.path) };
    });
  },
};
