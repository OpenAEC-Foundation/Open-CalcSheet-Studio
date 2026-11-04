/**
 * Elke tegel in het scherm "Module toevoegen" heeft een eigen compact beeld: de modules
 * uit de catalogus, de bladen in de Library en de tegels buiten de catalogus
 * (`TEGEL_BEELD` in ModuleKiezer.tsx). De maat en de verhouding zijn gelijk aan die van
 * de getekende beelden, zie docs/modulebeelden.md.
 */
import { existsSync, readdirSync, statSync, readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const bron = readFileSync("packages/desktop/src/components/calc/projectTree.ts", "utf8");
const catalogus = bron.split("export const moduleCatalogus:")[1] ?? "";
const templateIds = [...catalogus.matchAll(/templateId: "([^"]+)"/g)].map((m) => m[1]);
const kiezer = readFileSync("packages/desktop/src/components/calc/ModuleKiezer.tsx", "utf8");
const tegelBlok = kiezer.match(/const TEGEL_BEELD = \{([\s\S]*?)\} as const/)?.[1] ?? "";
const tegels = [...tegelBlok.matchAll(/:\s*"([^"]+)"/g)].map((m) => m[1]);
const ids = [...templateIds, ...tegels];
const map = "packages/desktop/src/assets/module-beelden";
const ontbrekend = ids.filter((id) => !existsSync(join(map, `${id}.webp`)));
const teGroot = ids.filter((id) => existsSync(join(map, `${id}.webp`)) && statSync(join(map, `${id}.webp`)).size > 200_000);
const namen = new Set(readdirSync(map));
const dubbeleIds = ids.filter((id, i) => ids.indexOf(id) !== i);
for (const id of ids) namen.delete(`${id}.webp`);
namen.delete("schijfwerking.webp"); // Oud blad blijft beschikbaar in bestaande projecten.

// Eén maat en één verhouding: het vak op het scherm is 180 × 104 en snijdt anders bij.
const andereMaat = [];
for (const id of ids) {
  const pad = join(map, `${id}.webp`);
  if (!existsSync(pad)) continue;
  const { width, height, format } = await sharp(pad).metadata();
  if (format !== "webp" || width < 360 || Math.abs(width / height - 180 / 104) > 0.02) andereMaat.push(`${id} (${width}×${height})`);
}
// Een tegel zonder beeld: de naam staat wel in de lijst, maar het beeld wordt nergens gebruikt.
const nietGebruikt = Object.entries({
  tekening: "TEGEL_BEELD.tekening", fem: "TEGEL_BEELD.fem", jupyter: "TEGEL_BEELD.jupyter", marimo: "TEGEL_BEELD.marimo",
  markdown: "TEGEL_BEELD.markdown", markdownImport: "TEGEL_BEELD.markdownImport",
}).filter(([, gebruik]) => !kiezer.includes(`{${gebruik}}`)).map(([naam]) => naam);
// Marimo staat in hetzelfde scherm als Jupyter, op dezelfde manier.
const marimoIn = kiezer.includes("MARIMO_KEUZE") && kiezer.includes("voegLeegMarimoToe");
// De Library-tegel krijgt zijn beeld ook zonder modulestatus.
const zonderStatus = !/\{status && item\.templateId && <ModuleAfbeelding/.test(kiezer) && /\{item\.templateId && <ModuleAfbeelding/.test(kiezer);

if (ontbrekend.length || teGroot.length || dubbeleIds.length || namen.size || andereMaat.length || nietGebruikt.length || !marimoIn || !zonderStatus) {
  if (ontbrekend.length) console.error("Geen eigen beeld:", ontbrekend.join(", "));
  if (teGroot.length) console.error("Beeld groter dan 200 kB:", teGroot.join(", "));
  if (dubbeleIds.length) console.error("Dubbele module-id:", dubbeleIds.join(", "));
  if (namen.size) console.error("Ongebruikte beelden:", [...namen].join(", "));
  if (andereMaat.length) console.error("Andere maat of verhouding:", andereMaat.join(", "));
  if (nietGebruikt.length) console.error("Beeld niet op zijn tegel:", nietGebruikt.join(", "));
  if (!marimoIn) console.error("Marimo ontbreekt in het scherm Module toevoegen.");
  if (!zonderStatus) console.error("Een tegel zonder status krijgt geen beeld.");
  process.exitCode = 1;
} else {
  console.log(`${templateIds.length} modules en bladen en ${tegels.length} losse tegels hebben elk een eigen beeld.`);
}
