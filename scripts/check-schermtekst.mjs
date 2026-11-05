/**
 * Bewaakt dat wat de gebruiker ziet uit de vertaalbestanden komt.
 *
 * Zoekt in de broncode (components, store, mcp, tauri, normen, App.tsx) met de parser van
 * TypeScript naar letterlijke tekst op de plekken die op het scherm komen:
 *
 *   1  tekst in JSX;
 *   2  de attributen title, placeholder, aria-label, alt en label;
 *   3  een terugvaltekst in t("sleutel", "tekst"): die verdoezelt een ontbrekende vertaling;
 *   4  alert, confirm en de titel van een bestandsvenster;
 *   5  new Error met een Nederlandse tekst: die komt in een melding terecht.
 *
 * Symbolen, eenheden, formules en productnamen zijn geen tekst om te vertalen: die staan
 * in TOEGESTAAN. Daarnaast:
 *
 *   6  elke vertaalsleutel bestaat in elke taal, en geen enkele taal heeft een sleutel
 *      meer dan de andere; zolang een sleutel ontbreekt, valt de app stil terug;
 *   7  een vaste sleutel in t("…") bestaat in de namespace van zijn onderdeel.
 *
 * Draaien:  node scripts/check-schermtekst.mjs
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));
const SRC = join(hier, "../packages/desktop/src");
const ts = createRequire(import.meta.url)("typescript");

let fouten = 0;
function meld(ok, tekst, regels = []) {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${tekst}`);
  if (!ok) for (const r of regels.slice(0, 60)) console.log(`         ${r}`);
}

/** Geen tekst om te vertalen: symbolen, indices, eenheden, formules, codes en namen. */
const TOEGESTAAN = new Set([
  // Indices en namen van grootheden.
  "mean", "mod", "mod,G", "def", "UC", "max", "min", "bl", "fin", "inst", "ef", "bij", "eind", "hor", "rep", "FI", "Ed", "y,Ed", "z,Ed", "Gkj;inf", "Gkj;sup",
  // Eenheden.
  "mm", "mm,", "px", "kN", "kNm", "kNm.", "kN/m", "kN/m²", "kN/m¹", "(kN/m²)", "(kN)", "a (mm/kN)", "[kN/m²]", "15.69 kNm",
  // Formules en codes.
  "· UC =", "M_Ed = q_d*L^2/8", "IFCX JSON", "IFC4x3 STEP", "STEP", "IFCX", "6.3.1.2 NEN-EN 1991-1-1",
  // Namen.
  "OA", "Open CalcSheet Studio", "Tauri + React + TypeScript", "LGPL-3.0",
  // Tekens.
  "&middot;", "&times;",
]);

/** Woorden waaraan een Nederlandse foutmelding te herkennen is. */
const NL_WOORD = /\b(?:het|een|van|bij|met|voor|uit|naar|niet|geen|alleen|maar|ook|wordt|worden|kon|kan|mag|moet|bestand|blad|mislukt|ontbreekt|onleesbaar|ongeldig|ongeldige|onbekend|onbekende|groter|lezen|opslaan|openen)\b/i;

const MAPPEN = ["components", "store", "mcp", "tauri", "normen", "App.tsx"];
/** Vertaalbestanden in de vorm van code, en de tweetalige formulebibliotheek. */
const OVERSLAAN = new Set([join("components", "calc", "spreadsheetNl.ts")]);

const bestanden = [];
const loop = (p) => {
  if (statSync(p).isDirectory()) for (const f of readdirSync(p)) loop(join(p, f));
  else if (/\.tsx?$/.test(p) && !OVERSLAAN.has(relative(SRC, p))) bestanden.push(p);
};
for (const m of MAPPEN) loop(join(SRC, m));

const ATTRIBUTEN = new Set(["title", "placeholder", "aria-label", "alt", "label"]);
const heeftLetters = (t) => /\p{L}{2}/u.test(t);
const vondsten = { jsx: [], attribuut: [], terugval: [], melding: [], fout: [] };

/** De tekst van een literal, ook als die in een {} staat; anders undefined. */
function literal(n) {
  if (!n) return undefined;
  if (ts.isJsxExpression(n)) return literal(n.expression);
  if (ts.isStringLiteralLike(n)) return n.text;
  if (ts.isParenthesizedExpression(n)) return literal(n.expression);
  return undefined;
}
/** Ook een sjabloon met invullingen, voor een melding: alleen de vaste stukken tellen. */
function literalOfSjabloon(n) {
  if (n && ts.isTemplateExpression(n)) return [n.head.text, ...n.templateSpans.map((s) => s.literal.text)].join(" ");
  if (n && ts.isBinaryExpression(n)) return `${literalOfSjabloon(n.left) ?? ""} ${literalOfSjabloon(n.right) ?? ""}`;
  if (n && ts.isConditionalExpression(n)) return `${literalOfSjabloon(n.whenTrue) ?? ""} ${literalOfSjabloon(n.whenFalse) ?? ""}`;
  return literal(n);
}

for (const f of bestanden) {
  const bron = readFileSync(f, "utf8");
  const sf = ts.createSourceFile(f, bron, ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const plek = (n) => `${relative(SRC, f).split(sep).join("/")}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  const zie = (n) => {
    if (ts.isJsxText(n)) {
      const t = n.getText().replace(/\s+/g, " ").trim();
      if (heeftLetters(t) && !TOEGESTAAN.has(t)) vondsten.jsx.push(`${plek(n)}  ${t}`);
    }
    if (ts.isJsxAttribute(n) && ATTRIBUTEN.has(n.name.getText())) {
      const t = literal(n.initializer);
      if (t !== undefined && heeftLetters(t) && !TOEGESTAAN.has(t)) vondsten.attribuut.push(`${plek(n)}  ${n.name.getText()}="${t}"`);
    }
    if (ts.isCallExpression(n)) {
      const naam = n.expression.getText();
      if (/^(?:t|vt|tt|i18next\.t)$/.test(naam) && n.arguments.length > 1) {
        const t = literal(n.arguments[1]);
        if (t !== undefined && heeftLetters(t)) vondsten.terugval.push(`${plek(n)}  ${n.arguments[0].getText()}, "${t}"`);
      }
      if (/^(?:window\.)?(?:alert|confirm)$/.test(naam)) {
        const t = literalOfSjabloon(n.arguments[0]);
        if (t !== undefined && heeftLetters(t)) vondsten.melding.push(`${plek(n)}  ${t}`);
      }
      if (/^(?:open|save)$/.test(naam) && n.arguments[0] && ts.isObjectLiteralExpression(n.arguments[0])) {
        for (const e of n.arguments[0].properties) {
          if (ts.isPropertyAssignment(e) && e.name.getText() === "title") {
            const t = literal(e.initializer);
            if (t !== undefined && heeftLetters(t)) vondsten.melding.push(`${plek(e)}  titel "${t}"`);
          }
        }
      }
    }
    if (ts.isNewExpression(n) && n.expression.getText() === "Error") {
      const t = literalOfSjabloon(n.arguments?.[0]);
      if (t !== undefined && NL_WOORD.test(t)) vondsten.fout.push(`${plek(n)}  ${t}`);
    }
    ts.forEachChild(n, zie);
  };
  zie(sf);
}

console.log(`\nLetterlijke tekst in ${bestanden.length} bestanden`);
meld(vondsten.jsx.length === 0, `geen letterlijke tekst in JSX (${vondsten.jsx.length})`, vondsten.jsx);
meld(vondsten.attribuut.length === 0, `geen letterlijke title, placeholder, aria-label, alt of label (${vondsten.attribuut.length})`, vondsten.attribuut);
meld(vondsten.terugval.length === 0, `geen terugvaltekst in t() (${vondsten.terugval.length})`, vondsten.terugval);
meld(vondsten.melding.length === 0, `geen letterlijke tekst in alert, confirm of een bestandsvenster (${vondsten.melding.length})`, vondsten.melding);
meld(vondsten.fout.length === 0, `geen Nederlandse foutmelding in de code (${vondsten.fout.length})`, vondsten.fout);

// ── De vertaalbestanden ─────────────────────────────────────────────────────
console.log("\nDe vertaalbestanden");
const LOCALES = join(SRC, "i18n/locales");
const TALEN = readdirSync(LOCALES);
const NAMESPACES = readdirSync(join(LOCALES, TALEN[0])).map((b) => b.replace(/\.json$/, ""));
const sleutels = (o, voor = "") =>
  Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? sleutels(v, `${voor}${k}.`) : [`${voor}${k}`]));
const inhoud = {};
for (const taal of TALEN) {
  inhoud[taal] = {};
  for (const ns of NAMESPACES) inhoud[taal][ns] = new Set(sleutels(JSON.parse(readFileSync(join(LOCALES, taal, `${ns}.json`), "utf8"))));
}
for (const ns of NAMESPACES) {
  for (const taal of TALEN) {
    const anders = TALEN.filter((t) => t !== taal);
    const mist = anders.flatMap((t) => [...inhoud[t][ns]].filter((k) => !inhoud[taal][ns].has(k)).map((k) => `${k} (wel in ${t})`));
    meld(mist.length === 0, `${taal}/${ns}.json: niets ontbreekt (${inhoud[taal][ns].size} sleutels)`, mist);
  }
}

// Geen Nederlands in de Engelse vertaling. Een invulveld en `hoogte=` (rekentaal) tellen niet.
{
  const NL = /\b(?:het|een|van|bij|met|voor|uit|naar|niet|geen|alleen|maar|ook|wordt|worden|zijn|staat|staan|deze|dit|dat|wel|tenzij|bestaande|constructie|constructeur|berekening|berekeningen|belasting|belastingen|uitgangspunten|inleiding|inhoud|bijlage|toelichting|uitvoering|nieuwbouw|wijziging|stabiliteit|fundering|trillingen|vloer|vloeren|daken|wanden|gevel|gebouw|hout|staal|beton|onderdeel|datum|rapport|blad|bladen|bestand|invoer|uitvoer|kop|tekst|naam|waarde|balk|ligger|voldoet|breedte|lengte|sparing|oplegging)\b/i;
  const waarden = (o, voor) => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? waarden(v, `${voor}${k}.`) : [[`${voor}${k}`, String(v)]]));
  const nl = NAMESPACES.flatMap((ns) => waarden(JSON.parse(readFileSync(join(LOCALES, "en", `${ns}.json`), "utf8")), `${ns}:`))
    .filter(([, v]) => NL.test(v.replace(/\{\{?[^}]*\}\}?/g, " ")))
    .map(([k, v]) => `${k}: ${v.slice(0, 90)}`);
  meld(nl.length === 0, "geen Nederlandse woorden in de Engelse vertaling", nl);
}

// ── Sleutels in de code ─────────────────────────────────────────────────────
console.log("\nSleutels in de code");
const bestaat = (ns, sleutel) => TALEN.every((taal) => {
  const s = inhoud[taal][ns];
  // Een sleutel kan ook een hele groep zijn (returnObjects).
  return s && (s.has(sleutel) || s.has(`${sleutel}_one`) || s.has(`${sleutel}_other`) || [...s].some((k) => k.startsWith(`${sleutel}.`)));
});
const zoekNs = (sleutel, standaard) => {
  const m = sleutel.match(/^(\w+):(.+)$/);
  return m ? [m[1], m[2]] : [standaard, sleutel];
};
const onbekend = [];
let getoetst = 0;
for (const f of bestanden) {
  const bron = readFileSync(f, "utf8");
  if (!/useTranslation/.test(bron)) continue;
  const sf = ts.createSourceFile(f, bron, ts.ScriptTarget.Latest, true, f.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  // Per functie: de namespace van `const { t } = useTranslation("…")`.
  const zie = (n, ns) => {
    let hier = ns;
    if (ts.isFunctionLike(n) && n.body && ts.isBlock(n.body)) {
      for (const st of n.body.statements) {
        if (!ts.isVariableStatement(st)) continue;
        for (const d of st.declarationList.declarations) {
          if (!d.initializer || !ts.isCallExpression(d.initializer) || d.initializer.expression.getText() !== "useTranslation") continue;
          if (!ts.isObjectBindingPattern(d.name)) continue;
          // Alleen de naam t: `t: tt` is een tweede namespace in hetzelfde onderdeel.
          if (!d.name.elements.some((e) => e.name.getText() === "t" && !e.propertyName)) continue;
          const eerste = d.initializer.arguments[0];
          hier = eerste && ts.isStringLiteralLike(eerste) ? eerste.text : "common";
        }
      }
    }
    if (hier && ts.isCallExpression(n) && n.expression.getText() === "t" && n.arguments[0] && ts.isStringLiteralLike(n.arguments[0])) {
      const [naam, sleutel] = zoekNs(n.arguments[0].text, hier);
      getoetst++;
      if (!bestaat(naam, sleutel)) onbekend.push(`${relative(SRC, f).split(sep).join("/")}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}  ${naam}:${sleutel}`);
    }
    ts.forEachChild(n, (k) => zie(k, hier));
  };
  zie(sf, null);
}
meld(onbekend.length === 0, `${getoetst} vaste sleutels in t(), elk in elke taal`, onbekend);

console.log(fouten === 0 ? "\nSchermtekst: alles in orde." : `\n${fouten} controle(s) gezakt.`);
process.exit(fouten === 0 ? 0 : 1);
