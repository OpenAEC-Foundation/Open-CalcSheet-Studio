/**
 * De README's volgens de README-standaard van OpenAEC Blueprint
 * (templates/README-standaard.md daar):
 *
 *   • README.md en README.nl.md, met de taalkeuze op de eerste regel en dezelfde opbouw;
 *   • dezelfde beelden in dezelfde volgorde, die er ook zijn, allemaal gebruikt, hoogstens
 *     150 kB en 1280 tot 1600 px breed, en met een script dat ze opnieuw maakt;
 *   • links binnen de repository die kloppen, en getallen die uit de repository volgen.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const BEELDMAP = join(WORTEL, "docs/images/readme");
const MAX_BYTES = 150 * 1024;

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) fouten++;
}

const lees = (naam) => readFileSync(join(WORTEL, naam), "utf8").replace(/\r\n/g, "\n");
const en = lees("README.md");
const nl = lees("README.nl.md");

console.log("Bestanden en opbouw");
meld(en.startsWith("**English** · [Nederlands](README.nl.md)"), "README.md begint met de taalkeuze");
meld(nl.startsWith("[English](README.md) · **Nederlands**"), "README.nl.md begint met de taalkeuze");
const koppen = (t) => [...t.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
const OPBOUW = ["Try it", "Download", "Why use it?", "Screenshots", "Interoperability", "MCP", "Testing and reliability", "Current limitations", "Under the hood", "Contributing", "Quick start (developers)", "License"];
const volgorde = OPBOUW.map((k) => koppen(en).indexOf(k));
meld(volgorde.every((i) => i >= 0) && volgorde.every((i, n) => n === 0 || i > volgorde[n - 1]), "de secties van de standaard staan er, in volgorde", OPBOUW.filter((k) => !koppen(en).includes(k)).join(", "));
meld(koppen(en).length === koppen(nl).length, "beide talen hebben evenveel secties", `${koppen(en).length} en ${koppen(nl).length}`);

console.log("\nBeelden");
const beelden = (t) => [...t.matchAll(/docs\/images\/readme\/([\w.-]+)/g)].map((m) => m[1]);
const inEn = beelden(en);
const inNl = beelden(nl);
meld(inEn.join() === inNl.join(), "dezelfde beelden in dezelfde volgorde", `${inEn.join()} / ${inNl.join()}`);
meld(new Set(inEn).size === inEn.length, "elk beeld één keer");
meld(inEn.length >= 5, `${inEn.length} beelden: een hoofdbeeld en minstens vier in de galerij`);
const opSchijf = existsSync(BEELDMAP) ? readdirSync(BEELDMAP) : [];
const ontbreekt = inEn.filter((b) => !opSchijf.includes(b));
meld(ontbreekt.length === 0, "elk beeld bestaat", ontbreekt.join(", "));
const ongebruikt = opSchijf.filter((b) => !inEn.includes(b));
meld(ongebruikt.length === 0, "elk bestand in docs/images/readme wordt gebruikt", ongebruikt.join(", "));
for (const b of opSchijf.filter((x) => x.endsWith(".png"))) {
  const pad = join(BEELDMAP, b);
  const kop = readFileSync(pad).subarray(0, 24);
  const breedte = kop.readUInt32BE(16);
  const groot = statSync(pad).size;
  meld(groot <= MAX_BYTES && breedte >= 1280 && breedte <= 1600, `${b}: ${Math.round(groot / 1024)} kB, ${breedte} px breed`);
}
meld(en.includes("scripts/maak-readme-beelden.mjs") && existsSync(join(WORTEL, "scripts/maak-readme-beelden.mjs")), "de README noemt het script dat de beelden maakt");

console.log("\nLinks en getallen");
for (const [naam, tekst] of [["README.md", en], ["README.nl.md", nl]]) {
  const stuk = [...tekst.matchAll(/\]\((?!https?:|#|mailto:)([^)#\s]+)/g)].map((m) => m[1]).filter((p) => !existsSync(join(WORTEL, p)));
  meld(stuk.length === 0, `${naam}: elke link binnen de repository bestaat`, stuk.join(", "));
}
const scripts = readdirSync(join(WORTEL, "scripts")).filter((f) => /^check-.*\.mjs$/.test(f) && f !== "check-alles.mjs").length;
meld(en.includes(`**${scripts} check scripts**`) && nl.includes(`**${scripts} controlescripts**`), `het aantal controlescripts klopt: ${scripts}`);

console.log(fouten === 0 ? "\nAlles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
