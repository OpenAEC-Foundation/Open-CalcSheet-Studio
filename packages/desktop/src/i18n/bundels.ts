/**
 * Alle vertaalbestanden van de app, uit de mappen locales/<taal>/<namespace>.json.
 *
 * Een map telt mee als zijn taal in TALEN staat (talen.ts). Wat hier gevonden wordt gaat
 * naar i18next (config.ts) en naar het register van talen.ts, waar het rapport zijn
 * meegeleverde teksten vandaan haalt. Een taal toevoegen vraagt hier dus niets.
 *
 * import.meta.glob is van vite. De scripts die de app met esbuild bundelen, vervangen
 * deze aanroep door gewone imports (scripts/lib/talen.mjs).
 */
import { BRONTAAL, registreer, TALEN } from "./talen.ts";

type Bundel = Record<string, unknown>;

const BESTANDEN = import.meta.glob<Bundel>("./locales/*/*.json", { eager: true, import: "default" });

/** Per taal per namespace de vertalingen, zoals i18next ze als `resources` wil. */
export const RESOURCES: Record<string, Record<string, Bundel>> = {};

for (const [pad, inhoud] of Object.entries(BESTANDEN)) {
  const m = /\/locales\/([^/]+)\/([^/]+)\.json$/.exec(pad);
  if (!m || !TALEN.some((t) => t.code === m[1])) continue;
  (RESOURCES[m[1]] ??= {})[m[2]] = inhoud;
  registreer(m[1], m[2], inhoud);
}

/** De namespaces: de bestanden van de brontaal. */
export const NAMESPACES: string[] = Object.keys(RESOURCES[BRONTAAL] ?? {}).sort();
