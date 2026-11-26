/**
 * De referentieset van de rekentaal: een vastgelegde versie van wat de taal doet, als
 * openbare gevallen met invoer en verwachte uitkomst (docs/rekentaal.md, "Referentieversie").
 *
 * Elk geval in scripts/fixtures/rekentaal-referentie/ bestaat uit twee bestanden:
 *   NNN-naam.cpd    de rekentekst, zoals een gebruiker hem schrijft;
 *   NNN-naam.json   wat eruit moet komen. Velden (alle behalve onderdeel en
 *                   omschrijving zijn optioneel):
 *     onderdeel, omschrijving   waar het geval over gaat;
 *     invoer                    waarden voor invoervelden en keuzelijsten;
 *     scope                     waarden die vóór het blad bestaan (projectgegevens,
 *                               verwijzingen als ref__2__R_paal);
 *     includes                  bestanden voor #include, naam → inhoud;
 *     uitkomst                  naam → de laatste uitkomst als tekst, letterlijk;
 *     reeks                     naam → alle uitkomsten van die naam op volgorde
 *                               (toekenningen en getoonde waarden);
 *     eenheid                   naam → de eenheid van de laatste uitkomst;
 *     getallen                  naam → het onafgeronde getal (relatief 1e-9);
 *     fout                      naam → een stuk van de foutmelding op die regel;
 *     ontbreekt                 namen die niet mogen bestaan;
 *     html / geenHtml           stukken die wel / niet in de uitwerking staan;
 *     latex                     naam → een stuk van de formule (TeX) van die regel;
 *     regels                    het aantal formuleregels in beeld.
 *
 * De versie: referentie.json in dezelfde map houdt de versies bij, elk met de sha256 van
 * de gevallen. Verander je een geval of komt er een bij, dan zakt deze controle tot er
 * een nieuwe versie bij staat, met dezelfde versie in docs/rekentaal.md. Een verwachting
 * wijzigen betekent dat de taal anders rekent: dat is een nieuwe referentieversie, met in
 * `wijziging` wat er anders is. `node scripts/check-rekentaal-referentie.mjs --hash` geeft
 * de hash van de gevallen zoals ze nu zijn.
 *
 * Draaien:  node scripts/check-rekentaal-referentie.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, evaluate, render } from "../packages/core/dist/index.js";

const hier = dirname(fileURLToPath(import.meta.url));
const MAP = join(hier, "fixtures", "rekentaal-referentie");
const DOCS = join(hier, "..", "docs", "rekentaal.md");
const MINIMUM = 40;

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  if (!ok || process.env.UITGEBREID) console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
  return ok;
};

/** Zonder regeleinden van Windows: de werkkopie in CI heeft CRLF. */
const lees = (pad) => readFileSync(pad, "utf8").replace(/\r\n/g, "\n");

const bestanden = readdirSync(MAP).sort();
const gevallen = bestanden.filter((f) => /^\d{3}-.+\.cpd$/.test(f)).map((f) => f.replace(/\.cpd$/, ""));

/** De hash van de set: naam en inhoud van elk geval, op volgorde. */
function setHash() {
  const h = createHash("sha256");
  for (const f of bestanden.filter((f) => /^\d{3}-.+\.(cpd|json)$/.test(f))) {
    h.update(f + "\n");
    h.update(lees(join(MAP, f)));
    h.update("\n");
  }
  return h.digest("hex");
}

if (process.argv.includes("--hash")) {
  console.log(setHash());
  process.exit(0);
}

/** Alle knopen van een doorgerekend blad, ook die in een tak of een lus. */
function plat(lijst, uit = []) {
  for (const n of lijst) {
    if (Array.isArray(n.children)) plat(n.children, uit);
    else uit.push(n);
  }
  return uit;
}

const tex = (html) => (html.match(/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/) ?? [])[1]?.replace(/&amp;/g, "&") ?? "";

console.log("De opbouw van de set");
meld(gevallen.length >= MINIMUM, `minstens ${MINIMUM} gevallen`, `${gevallen.length}`);
for (const f of bestanden.filter((f) => f.endsWith(".json") && f !== "referentie.json")) {
  meld(gevallen.includes(f.replace(/\.json$/, "")), `${f} hoort bij een .cpd`);
}
const nummers = gevallen.map((g) => g.slice(0, 3));
meld(new Set(nummers).size === nummers.length, "elk nummer één keer", nummers.join(","));

const onderdelen = new Map();
for (const naam of gevallen) {
  let v;
  try {
    v = JSON.parse(lees(join(MAP, `${naam}.json`)));
  } catch (err) {
    meld(false, `${naam}: verwachting leesbaar`, String(err));
    continue;
  }
  meld(typeof v.onderdeel === "string" && typeof v.omschrijving === "string", `${naam}: onderdeel en omschrijving`);
  onderdelen.set(v.onderdeel, (onderdelen.get(v.onderdeel) ?? 0) + 1);

  const bron = lees(join(MAP, `${naam}.cpd`));
  const includes = new Map(Object.entries(v.includes ?? {}));
  let knopen;
  try {
    knopen = evaluate(parse(bron, { includes }), v.invoer ?? {}, v.scope ?? {});
  } catch (err) {
    meld(false, `${naam}: rekent zonder uitzondering`, String(err));
    continue;
  }
  const alle = plat(knopen);
  const uitkomsten = (n) => alle.filter((k) => (k.type === "assignment" || k.type === "var-display") && k.name === n);
  const laatste = (n) => uitkomsten(n).at(-1);
  let goed = true;

  for (const [n, verwacht] of Object.entries(v.uitkomst ?? {})) {
    goed = meld(laatste(n)?.result === verwacht, `${naam}: ${n} = ${verwacht}`, laatste(n)?.result ?? "ontbreekt") && goed;
  }
  for (const [n, verwacht] of Object.entries(v.reeks ?? {})) {
    const echt = uitkomsten(n).map((k) => k.result);
    goed = meld(JSON.stringify(echt) === JSON.stringify(verwacht), `${naam}: reeks ${n}`, JSON.stringify(echt)) && goed;
  }
  for (const [n, verwacht] of Object.entries(v.eenheid ?? {})) {
    goed = meld(laatste(n)?.unit === verwacht, `${naam}: eenheid van ${n} is "${verwacht}"`, laatste(n)?.unit) && goed;
  }
  for (const [n, verwacht] of Object.entries(v.getallen ?? {})) {
    const w = laatste(n)?.waarde;
    const ok = typeof w === "number" && Math.abs(w - verwacht) <= 1e-9 * Math.max(1, Math.abs(verwacht));
    goed = meld(ok, `${naam}: ${n} ≈ ${verwacht}`, String(w)) && goed;
  }
  for (const [n, stuk] of Object.entries(v.fout ?? {})) {
    const r = laatste(n)?.result ?? "";
    goed = meld(r.startsWith("Error") && r.includes(stuk), `${naam}: ${n} geeft de fout "${stuk}"`, r) && goed;
  }
  for (const n of v.ontbreekt ?? []) {
    goed = meld(uitkomsten(n).length === 0, `${naam}: ${n} bestaat niet`) && goed;
  }
  if (v.html || v.geenHtml || v.regels !== undefined || v.latex) {
    const html = render(knopen);
    for (const stuk of v.html ?? []) goed = meld(html.includes(stuk), `${naam}: in beeld staat ${stuk}`) && goed;
    for (const stuk of v.geenHtml ?? []) goed = meld(!html.includes(stuk), `${naam}: niet in beeld: ${stuk}`) && goed;
    if (v.regels !== undefined) {
      const aantal = (html.match(/class="calc-line"/g) ?? []).length;
      goed = meld(aantal === v.regels, `${naam}: ${v.regels} formuleregel(s) in beeld`, String(aantal)) && goed;
    }
    for (const [n, stuk] of Object.entries(v.latex ?? {})) {
      const k = laatste(n);
      const t = k ? tex(render([k])) : "";
      goed = meld(t.includes(stuk), `${naam}: de formule van ${n} toont ${stuk}`, t) && goed;
    }
  }
  console.log(`  ${goed ? "OK  " : "FOUT"} ${naam} (${v.onderdeel})`);
}

console.log("\nOnderdelen van de taal");
console.log("  " + [...onderdelen].map(([o, a]) => `${o} ${a}`).join(", "));
meld(onderdelen.size >= 10, "minstens tien onderdelen gedekt", String(onderdelen.size));

console.log("\nDe versie");
let manifest;
try {
  manifest = JSON.parse(lees(join(MAP, "referentie.json")));
} catch (err) {
  meld(false, "referentie.json leesbaar", String(err));
}
if (manifest) {
  const versies = manifest.geschiedenis ?? [];
  const huidig = versies.at(-1);
  meld(versies.length > 0 && manifest.versie === huidig?.versie, `de versie (${manifest.versie}) is de laatste in de geschiedenis`, huidig?.versie);
  const vorm = versies.every((x) => /^\d+\.\d+$/.test(x.versie) && /^[0-9a-f]{64}$/.test(x.hash) && typeof x.wijziging === "string" && x.wijziging);
  meld(vorm, "elke versie heeft een nummer, een hash en een wijziging");
  const opvolgend = versies.every((x, i) => {
    if (i === 0) return true;
    const [a1, b1] = versies[i - 1].versie.split(".").map(Number);
    const [a2, b2] = x.versie.split(".").map(Number);
    return a2 > a1 || (a2 === a1 && b2 > b1);
  });
  meld(opvolgend, "de versies lopen op");
  const hash = setHash();
  meld(
    huidig?.hash === hash,
    "de gevallen zijn die van de laatste versie",
    `de gevallen zijn veranderd: zet een nieuwe versie in referentie.json met hash ${hash} en dezelfde versie in docs/rekentaal.md`,
  );
  const docs = lees(DOCS);
  const inDocs = docs.match(/Referentieversie:\s*\*\*(\d+\.\d+)\*\*/)?.[1];
  meld(inDocs === manifest.versie, `docs/rekentaal.md noemt referentieversie ${manifest.versie}`, inDocs ?? "geen");
}

console.log(fouten === 0 ? `\n${gevallen.length} gevallen, alle groen.` : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
