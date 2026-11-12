/**
 * Controle van de staven in het blok `@fem` (packages/core/src/femStaafBlok.ts,
 * femStaven.ts, femStaafResultaat.ts): een blad bouwt een staafwerk op, Open FEM Studio
 * rekent het door (`solve_open_fem_3d_batch`) en het blad rekent verder met de
 * snedekrachten, de doorbuiging, de reacties en de knikfactor.
 *
 * Toetst, zonder FEM Studio (de antwoorden van de echte server staan vastgelegd in
 * scripts/fixtures/fem/staven-*.json):
 *   • het lezen van het blok: de regels voor staven, fouten per regel, een model met
 *     platen en staven door elkaar;
 *   • het rekenmodel: de knopen, een staaf die doorloopt over een knoop op zijn as, de
 *     delen per staaf, een puntlast op een staaf als tussenknoop, scharnieren,
 *     opleggingen, een vlak model dat uit het vlak gehouden is;
 *   • de JSON tegen het schema van solve_open_fem_3d_batch (uit tools/list van de server,
 *     zonder de teksten);
 *   • de hash: dezelfde invoer in mm of in m geeft hetzelfde antwoord; lineair vraagt
 *     een andere factor in een combinatie niets nieuws, bij tweede orde wel;
 *   • zonder FEM Studio: wacht in de werkruimte, NIET GEREKEND elders en bij een fout,
 *     en dan geen enkele uitkomst in de scope;
 *   • met de vastgelegde antwoorden: de bekende oplossingen hieronder, de combinaties
 *     als lineaire som, de omhullende, de waarde op een plaats langs een staaf, de
 *     knoopverplaatsing, de reacties, de beelden op papier en in 3D, een verwijzing uit
 *     een ander blad;
 *   • vastleggen: het verzoek zoals het bewaard wordt geeft dezelfde JSON als wat
 *     verzonden is, het antwoord wordt compact bewaard en teruggelezen, een fout van één
 *     rekengeval is een fout van het geheel;
 *   • de houttoets: de snedekrachten per staaf als `forces_envelope` voor
 *     `check_timber_beams`, tegen het schema van die tool, met het antwoord van de
 *     echte server.
 *
 * De bekende oplossingen (hout 71 × 196 mm, E = 11000 N/mm², tenzij anders):
 *   I = 71·196³/12 = 4,45498·10⁷ mm⁴, EI = 490,05 kNm².
 *   • Ligger op twee steunpunten, L = 4 m, q = 2 kN/m:
 *       M = qL²/8 = 4,000 kNm; V = qL/2 = 4,000 kN;
 *       w = 5qL⁴/(384EI) = 5·2·256/(384·490,05) = 13,604 mm;
 *       M(L/4) = q·x·(L − x)/2 = 2·1·3/2 = 3,000 kNm;
 *       w(L/8) = q·x·(L³ − 2Lx² + x³)/(24EI) = 2·0,5·62,125/(24·490,05) = 5,282 mm.
 *   • Driescharnierspant, L = 8 m, nok 3 m, q = 2 kN/m per meter grondvlak:
 *       V = qL/2 = 8,000 kN; H = qL²/(8h) = 2·64/24 = 5,333 kN;
 *       N aan de voet = −(H·cos α + V·sin α) = −(5,333·0,8 + 8·0,6) = −9,067 kN;
 *       M(x) = V·x − q·x²/2 − H·0,75·x = 4x − x², grootst bij x = 2 m: 4,000 kNm.
 *   • Sporenkap met hanenbalk, L = 8 m, nok 4 m, hanenbalk op 2,5 m, q = 2 kN/m per
 *     meter grondvlak, één vast steunpunt en een rol. De halve kap, momenten om de nok:
 *       R·4 − q·4·2 − T·(4 − 2,5) = 0 met R = 8 kN: T = (32 − 16)/1,5 = 10,667 kN (trek);
 *       M in het spoor bij de hanenbalk (x = 2,5 m): R·2,5 − q·2,5²/2 = 13,750 kNm.
 *   • Euler, H = 3 m, N = 10 kN, twee scharnieren:
 *       α_cr = π²EI/(H²·N) = 9,8696·490,05/(9·10) = 53,740.
 *   • Tweede orde, ingeklemde stijl H = 3 m, N = 30 kN, dwarskracht 1 kN aan de top:
 *       k = √(N/EI) = 0,24742 1/m; M_voet = F·tan(kH)/k = 3,707 kNm (eerste orde 3,000);
 *       u_top = (F/N)·(tan(kH)/k − H) = 23,575 mm; α_cr = π²EI/(4H²·N) = 4,478.
 *   • Ruimtelijk, haakse uitkraging 2 m en 1 m, F = 5 kN op het eind, EI = 630 kNm²,
 *     GI_t = 80769·4·10⁻⁶·10³ = 323,08 kNm²:
 *       M_y in A = −F·2 = −10 kNm; wringing in de eerste staaf F·1 = 5 kNm;
 *       u = F·1³/(3EI) + F·2³/(3EI) + (F·1·2/GI_t)·1 = 2,646 + 21,164 + 30,952 = 54,762 mm.
 *   • Kruis van trekstangen in een portaal van 4 × 3 m, wind 10 kN:
 *       N diagonaal = 10/(4/5) = 12,500 kN, de andere valt weg; regel −10; stijl −7,5.
 *   • Spant met gordingen, L = 8 m, nok 3 m, F = 6 kN op de nok en halverwege elk been:
 *       R = 1,5·F = 9 kN; trekbalk: (R·4 − F·2)/3 = 8,000 kN;
 *       M in het been onder de gording = F·4/4 = 6,000 kNm;
 *       N in het been onder de gording −(8·0,8 + 9·0,6) = −11,800, erboven −(8·0,8 + 3·0,6) = −8,200 kN.
 *
 * De antwoorden maakt scripts/proef-fem-staven.mjs opnieuw met de echte server.
 *
 * Draaien:  node scripts/check-fem-staven.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { existsSync, readFileSync } from "node:fs";
import * as core from "../packages/core/dist/index.js";
import * as cache from "../packages/desktop/src/rekenen/toetsCache.ts";
import { scopeMetVerwijzingen } from "../packages/desktop/src/rekenen/verwijzingen.ts";
import { DRIESCHARNIER, EULER, HANENBALK, KAP, KRUIS, LIGGER, RUIMTE, SPANT, STAVEN_BLADEN, TWEEDE } from "./fixtures/fem/staven-bladen.mjs";

const { alsAntwoord, evaluate, evaluateMetScope, parse, render, toetsToolToegestaan } = core;

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}${ok || !detail ? "" : "  -> " + detail}`);
  if (!ok) fouten++;
}
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
const pct = (a, b) => `${((100 * (a - b)) / b).toFixed(3)} %`;
/** Een getal naast zijn bekende oplossing, met de afwijking in de uitvoer. */
function naast(naam, waarde, verwacht, grens = 1e-3, eenheid = "") {
  const ok = Number.isFinite(waarde) && rel(waarde, verwacht) <= grens;
  meld(ok, `${naam}: FEM Studio ${Number(waarde).toFixed(4)}${eenheid}, met de hand ${verwacht.toFixed(4)}${eenheid} (${pct(waarde, verwacht)})`);
}
const fixtureUrl = (naam) => new URL(`./fixtures/fem/${naam}`, import.meta.url);
const leesFixture = (naam) => (existsSync(fixtureUrl(naam)) ? JSON.parse(readFileSync(fixtureUrl(naam), "utf8")) : null);

const vanSoort = (nodes, soort) => {
  for (const n of nodes) {
    if (n.type === soort) return n;
    const k = n.children ? vanSoort(n.children, soort) : null;
    if (k) return k;
  }
  return null;
};
const femVan = (nodes) => vanSoort(nodes, "fem");
const vragen = (bron, opties = {}) => femVan(evaluate(parse(bron), {}, {}, { toetsModus: "vragen", ...opties }));
const metAntwoorden = (bron, records, modus = "lezen", extra = {}) => {
  const toetsingen = Object.fromEntries(Object.entries(records).map(([h, v]) => [h, alsAntwoord(v)]));
  return evaluateMetScope(parse(bron), {}, {}, { toetsingen, toetsModus: modus, ...extra });
};
const inEenheid = (w, eenheid) => (w && typeof w.toNumber === "function" ? w.toNumber(eenheid) : Number(w));
const kN = (w) => inEenheid(w, "kN");
const kNm = (w) => inEenheid(w, "kN m");
const mm = (w) => inEenheid(w, "mm");

// ── Een klein JSON-schema, genoeg voor de schema's van FEM Studio ───────────────
function valideer(schema, w, pad = "$", uit = []) {
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const soort = w === null ? "null" : Array.isArray(w) ? "array" : typeof w;
  if (types.length) {
    const past = types.some((t) => t === soort || (t === "integer" && Number.isInteger(w)) || (t === "number" && soort === "number"));
    if (!past) {
      uit.push(`${pad}: ${soort}, verwacht ${types.join("|")}`);
      return uit;
    }
  }
  if (schema.enum && !schema.enum.includes(w)) uit.push(`${pad}: ${JSON.stringify(w)} niet in ${JSON.stringify(schema.enum)}`);
  if (typeof w === "number") {
    if (!Number.isFinite(w)) uit.push(`${pad}: geen eindig getal`);
    if (schema.minimum !== undefined && w < schema.minimum) uit.push(`${pad}: ${w} < ${schema.minimum}`);
    if (schema.maximum !== undefined && w > schema.maximum) uit.push(`${pad}: ${w} > ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && !(w > schema.exclusiveMinimum)) uit.push(`${pad}: ${w} ≤ ${schema.exclusiveMinimum}`);
    if (schema.exclusiveMaximum !== undefined && !(w < schema.exclusiveMaximum)) uit.push(`${pad}: ${w} ≥ ${schema.exclusiveMaximum}`);
  }
  if (soort === "array") {
    if (schema.minItems !== undefined && w.length < schema.minItems) uit.push(`${pad}: minder dan ${schema.minItems} elementen`);
    if (schema.maxItems !== undefined && w.length > schema.maxItems) uit.push(`${pad}: meer dan ${schema.maxItems} elementen`);
    if (schema.items) w.forEach((x, i) => valideer(schema.items, x, `${pad}[${i}]`, uit));
  }
  if (soort === "object") {
    for (const r of schema.required ?? []) if (!(r in w)) uit.push(`${pad}: ${r} ontbreekt`);
    for (const [k, v] of Object.entries(w)) {
      const sub = schema.properties?.[k];
      if (sub) valideer(sub, v, `${pad}.${k}`, uit);
      else if (schema.additionalProperties === false) uit.push(`${pad}: ${k} staat niet in het schema`);
    }
  }
  return uit;
}

const schema = leesFixture("solve_open_fem_3d_batch.schema.json");
const houtSchema = leesFixture("check_timber_beams.schema.json");
meld(!!schema && !!houtSchema, "de schema's van solve_open_fem_3d_batch en check_timber_beams staan in scripts/fixtures/fem/");
meld(typeof core.femStaafArgumenten === "function" && typeof core.femStaafBewaar === "function" && typeof core.FemStaafModel === "function",
  "de kern heeft het staafwerk (femStaafArgumenten, femStaafBewaar, FemStaafModel)");
if (typeof core.femStaafArgumenten !== "function") {
  console.log("\nDe staven in @fem zijn er nog niet.");
  process.exit(1);
}
const { femStaafArgumenten, femStaafBewaar, femVerzoekArgumenten, femBewaar, FemStaafModel, FEM_STAVEN_TOOL } = core;

// De vastgelegde antwoorden per blad.
const vast = Object.fromEntries(Object.keys(STAVEN_BLADEN).map((naam) => [naam, leesFixture(`staven-${naam}.json`)]));
meld(Object.values(vast).every((v) => v?.toetsingen), "de antwoorden van de echte server staan vastgelegd (scripts/fixtures/fem/staven-*.json)",
  Object.entries(vast).filter(([, v]) => !v).map(([n]) => n).join(", "));
const versie = vast.ligger?.versie ?? "";
const gerekend = (naam, modus = "lezen", extra = {}) => metAntwoorden(STAVEN_BLADEN[naam], vast[naam]?.toetsingen ?? {}, modus, extra);

// ── Lezen ───────────────────────────────────────────────────────────────────
console.log("\nHet blok lezen");
{
  const n = parse(KAP).find((x) => x.type === "fem");
  meld(n?.naam === "kap" && n.fouten.length === 0, "@fem kap … @end met staven wordt één blok zonder fouten", JSON.stringify(n?.fouten));
  const woorden = new Set((n?.regels ?? []).map((r) => r.woord));
  meld(["materiaal", "rechthoek", "knoop", "staaf", "steun", "geval", "lijnlast", "eigengewicht", "combinatie", "beeld"].every((w) => woorden.has(w)),
    "met materiaal, rechthoek, knoop, staaf, steun, geval, lijnlast, eigengewicht, combinatie en beeld", [...woorden].join(" "));
  const fout = parse("@fem x\n  staaf 0; 0\n  lijnlast a; 1\n  knoop 0; 0\n  rechthoek 1; 2\n  knoop A: 0; 0\n  knoop A: 1; 0\n@end").find((x) => x.type === "fem");
  const f = (fout?.fouten ?? []).join(" | ");
  meld(/regel 2/.test(f) && /geval/.test(f), "een lijnlast vóór het eerste geval is een fout", f);
  meld(/regel 3/.test(f) && /naam/.test(f), "een knoop zonder naam is een fout", f);
  meld(/regel 4/.test(f) && /naam/.test(f), "een rechthoek zonder naam is een fout", f);
  meld(/regel 6/.test(f) && /A/.test(f), "een naam die er al is, is een fout", f);

  const blad = (regels) => ["@fem m", "  materiaal 11000 N/mm^2; 690 N/mm^2", "  rechthoek r: 50 mm; 150 mm", ...regels, "@end"].join("\n");
  const melding = (regels) => vragen(blad(regels))?.melding ?? "";
  const basis = ["  knoop A: 0; 0", "  knoop B: 4 m; 0", "  staaf s: A; B", "  steun A; scharnier", "  steun B; rol", "  geval G", "    lijnlast s; 1 kN/m"];
  meld(vragen(blad(basis))?.status === "wacht", "een ligger van twee knopen, een staaf en twee steunen is een model", melding(basis));
  meld(/regel 5/.test(melding(["  knoop A: 0; 0", "  knoop B: 4 m; 0", "  staaf s: A; C"])) && /C/.test(melding(["  knoop A: 0; 0", "  knoop B: 4 m; 0", "  staaf s: A; C"])),
    "een staaf naar een knoop die er niet is, is een fout op die regel", melding(["  knoop A: 0; 0", "  knoop B: 4 m; 0", "  staaf s: A; C"]));
  meld(/lengte/.test(melding(["  staaf s: 0; 0; 0; 0", "  steun 0; 0; scharnier", "  geval G", "    lijnlast s; 1 kN/m"])), "een staaf zonder lengte is een fout");
  meld(/steun|oplegging/.test(melding(["  staaf s: 0; 0; 4 m; 0", "  geval G", "    lijnlast s; 1 kN/m"])), "een model zonder oplegging is een fout");
  meld(/geval/.test(melding(["  staaf s: 0; 0; 4 m; 0", "  steun 0; 0; scharnier"])), "een model zonder belastinggeval is een fout");
  meld(/t\b|staaf/.test(melding([...basis, "    lijnlast t; 1 kN/m"])) && /regel 10/.test(melding([...basis, "    lijnlast t; 1 kN/m"])), "een last op een staaf die er niet is, is een fout op die regel", melding([...basis, "    lijnlast t; 1 kN/m"]));
  meld(/buiten|langer|lengte/.test(melding([...basis, "    puntlast s; 1 kN; 5 m"])), "een puntlast voorbij het eind van de staaf is een fout", melding([...basis, "    puntlast s; 1 kN; 5 m"]));
  meld(/staaf|ligt/.test(melding([...basis.slice(0, 4), "  steun 2 m; 1 m; rol", ...basis.slice(5)])), "een steun die niet op een knoop of staaf ligt, is een fout", melding([...basis.slice(0, 4), "  steun 2 m; 1 m; rol", ...basis.slice(5)]));
  meld(/vlak|ruimtelijk|drie/.test(melding(["  knoop A: 0; 0", "  knoop B: 4 m; 0; 0", "  staaf s: A; B"])), "knopen met twee en met drie coördinaten door elkaar is een fout", melding(["  knoop A: 0; 0", "  knoop B: 4 m; 0; 0", "  staaf s: A; B"]));
  meld(/plaat|platen/.test(melding([...basis, "  plaat 0; 0; 1 m; 1 m; 100 mm"])), "platen en staven in één model: nog niet, met de reden", melding([...basis, "  plaat 0; 0; 1 m; 1 m; 100 mm"]));
  meld(/tweede|lineair/.test(melding([...basis, "  analyse plastisch"])), "een onbekende analyse is een fout", melding([...basis, "  analyse plastisch"]));
}

// ── Het rekenmodel ──────────────────────────────────────────────────────────
console.log("\nHet rekenmodel");
{
  const blok = vragen(HANENBALK);
  meld(blok?.status === "wacht" && blok.verzoeken?.length === 1, "in de werkruimte: één verzoek voor het hele staafwerk", `${blok?.status} ${blok?.melding ?? ""}`);
  const v = blok?.verzoeken?.[0];
  const m = v?.bewaar;
  meld(v?.tool === "solve_open_fem_3d_batch" && FEM_STAVEN_TOOL === v?.tool && m?.vorm === "fem-staven/1", "de tool is solve_open_fem_3d_batch, het rekenmodel fem-staven/1", `${v?.tool} ${m?.vorm}`);
  meld(m?.vlak === true && m.knopen.length === 5, "een vlak model met vijf knopen: A, B, de nok en de twee einden van de hanenbalk", JSON.stringify(m?.knopen));
  const spoor = m?.staven.find((s) => s.naam === "spoor_l");
  const haan = m?.staven.find((s) => s.naam === "hanenbalk");
  meld(!!spoor && !!haan && spoor.knopen.includes(haan.knopen[0]), "het spoor loopt door over het eind van de hanenbalk: die knoop is een tussenknoop van het spoor");
  meld(spoor?.knopen.length >= 6, "het spoor is in delen geknipt: de tussenpunten zijn knopen", String(spoor?.knopen.length));
  meld(JSON.stringify(spoor?.scharnier) === "[false,true]" && JSON.stringify(haan?.scharnier) === "[true,true]", "scharnier eind en scharnier (beide einden)");
  // De knopen van een staaf liggen op zijn as, in volgorde.
  const opAs = (s) => {
    const [a, b] = [s.knopen[0], s.knopen[s.knopen.length - 1]];
    const L = Math.hypot(m.x[b] - m.x[a], m.z[b] - m.z[a]);
    let vorige = -1;
    return s.knopen.every((k) => {
      const t = ((m.x[k] - m.x[a]) * (m.x[b] - m.x[a]) + (m.z[k] - m.z[a]) * (m.z[b] - m.z[a])) / (L * L);
      const d = Math.abs((m.x[k] - m.x[a]) * (m.z[b] - m.z[a]) - (m.z[k] - m.z[a]) * (m.x[b] - m.x[a])) / L;
      const goed = d < 1e-9 && t > vorige - 1e-12;
      vorige = t;
      return goed;
    });
  };
  meld(m?.staven.every(opAs), "de knopen van elke staaf liggen op zijn as, van begin naar eind");
  const args = v ? femVerzoekArgumenten(v) : null;
  meld(args?.requests?.length === 1 && args.requests[0].analysis === "linear", "één rekengeval, lineair", JSON.stringify(args?.requests?.map((r) => r.analysis)));
  const fout = schema && args ? valideer(schema, args) : ["geen schema"];
  meld(fout.length === 0, "de JSON past in het schema van solve_open_fem_3d_batch", fout.slice(0, 4).join("; "));
  const r0 = args?.requests?.[0];
  meld(r0?.supports.length === r0?.nodes.length && r0.supports.every((s) => s.uy && s.rx && s.rz), "vlak: elke knoop is uit het vlak gehouden (u_y, r_x en r_z vast)");
  meld(r0?.nodes.every((n) => n.y === 0), "vlak: y = 0");
  meld(r0?.sections.every((s) => s.izM4 >= 100 * s.iyM4), "vlak: de doorsnede rekent uit het vlak star, zodat de knikfactor die in het vlak is");
  const lid = r0?.members.find((x) => x.id === m.staven.indexOf(spoor) + 1);
  meld(lid?.intermediateNodeIds?.length === spoor.knopen.length - 2 && lid.releases?.myEnd === true && !lid.releases?.myStart, "het spoor is één staaf met tussenknopen en een scharnier aan het eind", JSON.stringify(lid));
  const A = r0?.supports.find((s) => s.nodeId === 1);
  const B = r0?.supports.find((s) => s.nodeId === 2);
  meld(A?.ux && A?.uz && !A?.ry && !B?.ux && B?.uz && !B?.ry, "steun A; scharnier houdt x en z, steun B; rol alleen z");
  const last = r0?.memberLoads?.[0];
  meld(last?.globalDirection === "z" && last.perProjection === true && last.qStartKnPerM === -2, "sneeuw: een globale last omlaag per meter projectie", JSON.stringify(last));

  // Een puntlast op een staaf wordt een tussenknoop met een knooplast.
  const sp = vragen(SPANT)?.verzoeken?.[0];
  const rs = sp ? femVerzoekArgumenten(sp).requests[0] : null;
  const been = sp?.bewaar.staven.find((s) => s.naam === "been_l");
  const k = been?.knopen.find((n) => Math.abs(sp.bewaar.x[n] - 2) < 1e-9 && Math.abs(sp.bewaar.z[n] - 1.5) < 1e-9);
  meld(k !== undefined && rs?.nodalLoads.some((l) => l.nodeId === k + 1 && l.fz === -6 && l.fx === 0), "een puntlast op 2,5 m van het been: een tussenknoop op (2; 1,5) met een knooplast omlaag", JSON.stringify(rs?.nodalLoads));
  meld(!rs?.memberPointLoads?.length, "geen puntlast in staafassen: die kent geen kracht langs de staaf");
  meld(valideer(schema, femVerzoekArgumenten(sp)).length === 0, "ook dit model past in het schema");

  // Ruimtelijk: de echte doorsnede, alleen de opleggingen, scharnieren om beide assen.
  const ru = vragen(RUIMTE)?.verzoeken?.[0];
  const rr = ru ? femVerzoekArgumenten(ru).requests[0] : null;
  meld(ru?.bewaar.vlak === false && rr?.supports.length === 1 && rr.supports[0].ux && rr.supports[0].rz, "ruimtelijk: alleen de oplegging, met zes vrijheidsgraden", JSON.stringify(rr?.supports));
  meld(Math.abs(rr?.sections[0].izM4 - 200e-8) < 1e-15 && Math.abs(rr.sections[0].torsionJM4 - 400e-8) < 1e-15 && Math.abs(rr.sections[0].areaM2 - 20e-4) < 1e-12, "ruimtelijk: A, I_y, I_z en I_t zoals opgegeven", JSON.stringify(rr?.sections));
  meld(valideer(schema, femVerzoekArgumenten(ru)).length === 0, "en het past in het schema");

  // Trek-alleen en twee materialen.
  const kr = vragen(KRUIS)?.verzoeken?.[0];
  const rk = kr ? femVerzoekArgumenten(kr).requests[0] : null;
  meld(rk?.members.filter((x) => x.tensionOnly).length === 2 && rk.materials.length === 2, "twee stangen die alleen trek opnemen, twee materialen", JSON.stringify(rk?.members.map((x) => x.tensionOnly)));
  meld(rk?.materials[0].gMpa === 690 && rk.materials[1].gMpa === undefined && rk.materials[1].nu === 0.3, "materiaal E; G voor hout en E; ν voor staal", JSON.stringify(rk?.materials));

  // De rekengevallen.
  const kap = vragen(KAP)?.verzoeken?.[0];
  meld(kap?.bewaar.gevallen.map((g) => g.naam).join() === "G,S,W", "lineair: de rekengevallen zijn de belastinggevallen; de combinaties telt CalcSheet op", kap?.bewaar.gevallen.map((g) => g.naam).join());
  const tw = vragen(TWEEDE)?.verzoeken?.[0];
  const rt = tw ? femVerzoekArgumenten(tw).requests : [];
  meld(tw?.bewaar.gevallen.map((g) => g.naam).join() === "UGT" && rt[0]?.analysis === "p-delta" && rt[0].bucklingModes >= 1, "tweede orde: de combinatie is het rekengeval, met de knikfactor erbij", tw?.bewaar.gevallen.map((g) => g.naam).join());
  const top = rt[0]?.nodalLoads?.find((l) => l.nodeId === 2);
  meld(top?.fz === -30 && top?.fx === 1, "met de gefactoriseerde lasten: 1,5·20 kN omlaag en 1 kN opzij", JSON.stringify(rt[0]?.nodalLoads));
  const eu = vragen(EULER)?.verzoeken?.[0];
  meld(eu && femVerzoekArgumenten(eu).requests[0].bucklingModes === 2, "knikvormen 2 vraagt twee knikvormen");
  const eg = kap ? femVerzoekArgumenten(kap).requests[0] : null;
  const A_spoor = 0.059 * 0.156;
  meld(eg?.memberLoads.some((l) => l.globalDirection === "z" && !l.perProjection && Math.abs(l.qStartKnPerM + 4.2 * A_spoor) < 1e-9), "eigengewicht: γ·A omlaag per meter staaf", JSON.stringify(eg?.memberLoads?.[0]));
  const wind = kap ? femVerzoekArgumenten(kap).requests[2] : null;
  meld(wind?.memberLoads.some((l) => l.memberId === 1 && Math.abs(l.qzStartKnPerM + 0.35 * 0.6) < 1e-12) && wind.memberLoads.some((l) => l.memberId === 2 && Math.abs(l.qzStartKnPerM - 0.25 * 0.6) < 1e-12),
    "wind lokaal: druk naar de onderzijde van het spoor, zuiging ervan af", JSON.stringify(wind?.memberLoads));
}

// ── De hash ─────────────────────────────────────────────────────────────────
console.log("\nDe hash van de invoer");
{
  const a = vragen(LIGGER);
  const b = vragen(LIGGER.replace("L = 4 m", "L = 4000 mm").replace("b = 71 mm", "b = 0.071 m"));
  meld(a?.hashes?.[0] && a.hashes[0] === b?.hashes?.[0], "dezelfde invoer in mm of in m geeft dezelfde hash");
  const c = vragen(LIGGER.replace("q = 2 kN/m", "q = 3 kN/m"));
  meld(c?.hashes?.[0] !== a?.hashes?.[0], "een andere last geeft een andere hash");
  const k1 = vragen(KAP);
  const k2 = vragen(KAP.replace("1.2*G + 1.5*S", "1.35*G + 1.5*S"));
  meld(k1?.hashes?.[0] === k2?.hashes?.[0], "lineair: een andere factor in een combinatie vraagt niets nieuws aan FEM Studio");
  const t1 = vragen(TWEEDE);
  const t2 = vragen(TWEEDE.replace("1.5*G + W", "1.35*G + W"));
  meld(t1?.hashes?.[0] && t1.hashes[0] !== t2?.hashes?.[0], "tweede orde: een andere factor is een andere berekening");
}

// ── Zonder FEM Studio ───────────────────────────────────────────────────────
console.log("\nZonder antwoord");
{
  const { nodes, scope } = evaluateMetScope(parse(KAP), {}, {}, { toetsModus: "lezen" });
  const blok = femVan(nodes);
  meld(blok?.status === "niet-gerekend", "buiten de werkruimte: niet gerekend", blok?.status);
  meld(!Object.keys(scope).some((k) => k === "kap" || k.startsWith("kap_")), "en geen enkele uitkomst in de scope", Object.keys(scope).filter((k) => k.startsWith("kap")).join(" "));
  const html = render(nodes);
  meld(/NIET GEREKEND/.test(html) && /calc-fem-fout/.test(html), "op het blad staat NIET GEREKEND");
  meld(/<svg[^>]*calc-fem-model/.test(html), "met het schema van het staafwerk: de invoer is na te kijken");
  const w = vragen(KAP);
  meld(/Open FEM Studio/.test(render([w])) && /calc-fem-wacht/.test(render([w])), "in de werkruimte: wordt gerekend door Open FEM Studio…");
  const fout = evaluateMetScope(parse(KAP), {}, {}, { toetsModus: "vragen", toetsingen: { [w.hashes[0]]: { ok: false, melding: "het model is een mechanisme" } } });
  const fb = femVan(fout.nodes);
  meld(fb?.status === "fout" && /mechanisme/.test(fb.melding) && fb.opnieuw === true && !("kap" in fout.scope), "een fout van FEM Studio: niet gerekend, met de reden en de knop opnieuw rekenen");
  const toets = vanSoort(nodes, "toets");
  meld(toets?.status === "fout" || toets?.status === "niet-getoetst", "en de houttoets die ervan afhangt, is niet getoetst", toets?.status);
}

// ── De bekende oplossingen ──────────────────────────────────────────────────
console.log(`\nDe bekende oplossingen, met de antwoorden van FEM Studio ${versie}`);
const EI = 11000e3 * (0.071 * 0.196 ** 3) / 12;
{
  console.log("  Ligger op twee steunpunten");
  const { nodes, scope } = gerekend("ligger");
  const blok = femVan(nodes);
  meld(blok?.status === "klaar", "het blad is gerekend", `${blok?.status} ${blok?.melding ?? ""}`);
  naast("M = qL²/8", kNm(scope.M_max), 4, 1e-6, " kNm");
  naast("V = qL/2", kN(scope.V_max), 4, 1e-6, " kN");
  naast("w = 5qL⁴/(384EI)", mm(scope.w_max), (5 * 2 * 4 ** 4) / (384 * EI) * 1000, 1e-5, " mm");
  naast("M op L/4", kNm(scope.M_kwart), 3, 1e-6, " kNm");
  naast("w op L/8, tussen twee knopen", mm(scope.w_achtste), ((2 * 0.5 * (64 - 2 * 4 * 0.25 + 0.125)) / (24 * EI)) * 1000, 1e-5, " mm");
  meld(Math.abs(kN(scope.ligger_Q_balk_V_min) + 4) < 1e-6 && Math.abs(kNm(scope.ligger_Q_balk_M_min)) < 1e-6 && Math.abs(kN(scope.ligger_Q_balk_N_max)) < 1e-9, "V_min = −4 kN, M_min = 0, N = 0");
  meld(Math.abs(kN(scope.ligger_Q_Rz_som) - 8) < 1e-6 && Math.abs(inEenheid(scope.ligger_balk_L, "m") - 4) < 1e-12, "ΣR_z = q·L = 8 kN; ligger.balk.L = 4 m");
  meld(blok?.staven?.gevallen?.[0] && Math.abs(blok.staven.gevallen[0].lastZ - 8) < 1e-9 && Math.abs(blok.staven.gevallen[0].reactieZ - 8) < 1e-6, "het evenwicht op het blad: Σ last = Σ R", JSON.stringify(blok?.staven?.gevallen));
}
{
  console.log("  Driescharnierspant");
  const { scope } = gerekend("driescharnier");
  naast("V = qL/2", kN(scope.V), 8, 1e-6, " kN");
  naast("H = qL²/(8h)", kN(scope.H), (2 * 64) / 24, 1e-6, " kN");
  naast("N aan de voet", kN(scope.spant_S_links_N_min), -(((2 * 64) / 24) * 0.8 + 8 * 0.6), 1e-6, " kN");
  naast("M in het spoor", kNm(scope.spant_S_links_M_max), 4, 1e-6, " kNm");
  meld(Math.abs(kN(scope.spant_S_B_Rx) + (2 * 64) / 24) < 1e-6, "de spatkracht in B is tegengesteld");
  meld(Math.abs(kNm(core.femStaafWaarde(scope.spant, "S", "links", "M", 5))) < 1e-9, "M = 0 in het scharnier in de nok");
}
{
  console.log("  Sporenkap met hanenbalk");
  const { scope } = gerekend("hanenbalk");
  naast("N in de hanenbalk (trek)", kN(scope.N_haan), (32 - 16) / 1.5, 1e-6, " kN");
  const sD = Math.hypot(2.5, 2.5);
  naast("M in het spoor bij de hanenbalk", core.femStaafWaarde(scope.kap, "S", "spoor_l", "M", sD), 13.75, 1e-6, " kNm");
  meld(Math.abs(kN(scope.kap_S_A_Rz) - 8) < 1e-6 && Math.abs(kN(scope.kap_S_A_Rx)) < 1e-6 && Math.abs(kN(scope.kap_S_B_Rz) - 8) < 1e-6, "R = 8 kN per steunpunt, geen spatkracht (de hanenbalk is de trekker)");
  meld(Math.abs(kN(scope.kap_S_hanenbalk_N_min) - kN(scope.N_haan)) < 1e-9 && Math.abs(kNm(scope.kap_S_hanenbalk_M_max)) < 1e-9, "de hanenbalk heeft alleen normaalkracht");
}
{
  console.log("  Euler");
  const { scope, nodes } = gerekend("euler");
  naast("α_cr = π²EI/(H²·N)", Number(scope.α), (Math.PI ** 2 * EI) / (9 * 10), 1e-4);
  meld(femVan(nodes)?.staven?.sets?.[0]?.alpha > 53, "de knikfactor staat in de tabel van het blok");
  meld(Math.abs(kN(scope.kolom_N_stijl_N_min) + 10) < 1e-9, "N = −10 kN (druk is negatief)");
}
{
  console.log("  Tweede orde");
  const { scope, nodes } = gerekend("tweede");
  const k = Math.sqrt(30 / EI);
  naast("M_voet = F·tan(kH)/k", kNm(scope.M_voet), Math.tan(3 * k) / k, 1e-4, " kNm");
  naast("u_top", mm(scope.u_top), (1 / 30) * (Math.tan(3 * k) / k - 3) * 1000, 1e-4, " mm");
  naast("α_cr = π²EI/(4H²·N)", Number(scope.mast_UGT_alpha_cr), (Math.PI ** 2 * EI) / (4 * 9 * 30), 1e-3);
  meld(!("mast_G_stijl_M_max" in scope) && "mast_UGT_stijl_M_max" in scope, "tweede orde: alleen de combinatie is een uitkomst, de gevallen apart niet");
  meld(femVan(nodes)?.staven?.analyse === "tweede-orde", "het blok meldt tweede orde");
  meld(kNm(scope.M_voet) > 3.5, "het moment is groter dan in eerste orde (3 kNm)");
}
{
  console.log("  Ruimtelijk");
  const { scope } = gerekend("ruimte");
  naast("M_y in de inklemming", kNm(scope.arm_F_s1_My_min), -10, 1e-6, " kNm");
  naast("wringing in de eerste staaf", Math.abs(kNm(scope.arm_F_s1_T_max) || kNm(scope.arm_F_s1_T_min)), 5, 1e-6, " kNm");
  const GJ = (210000e3 / 2.6) * 400e-8;
  naast("zakking van het eind", -mm(scope.u_C), (5 / (3 * 630) + 40 / (3 * 630) + (10 / GJ)) * 1000, 1e-4, " mm");
  meld(Math.abs(kN(scope.arm_F_A_Rz) - 5) < 1e-6 && Math.abs(Math.abs(kNm(scope.arm_F_A_Mx)) - 10) < 1e-6 && Math.abs(Math.abs(kNm(scope.arm_F_A_My)) - 5) < 1e-6, "reacties in A: R_z = 5 kN, M_x = 10 en M_y = 5 kNm");
}
{
  console.log("  Kruis van trekstangen");
  const { scope, nodes } = gerekend("kruis");
  naast("N in de dragende diagonaal", kN(scope.portaal_W_d1_N_max), 12.5, 1e-6, " kN");
  meld(Math.abs(kN(scope.portaal_W_d2_N_max)) < 1e-9 && Math.abs(kN(scope.portaal_W_d2_N_min)) < 1e-9, "de andere diagonaal valt weg: N = 0");
  meld(JSON.stringify(femVan(nodes)?.staven?.sets?.[0]?.inactief) === '["d2"]', "en het blok noemt hem", JSON.stringify(femVan(nodes)?.staven?.sets?.[0]?.inactief));
  naast("N in de regel", kN(scope.portaal_W_regel_N_min), -10, 1e-6, " kN");
  naast("N in de stijl", kN(scope.portaal_W_k2_N_min), -7.5, 1e-6, " kN");
}
{
  console.log("  Spant met gordingen");
  const { scope } = gerekend("spant");
  naast("R per steunpunt", kN(scope.spant_G_A_Rz), 9, 1e-6, " kN");
  naast("N in de trekbalk", kN(scope.spant_G_trekker_N_max), 8, 1e-6, " kN");
  naast("M in het been onder de gording", kNm(scope.spant_G_been_l_M_max), 6, 1e-6, " kNm");
  naast("N in het been onder de gording", kN(scope.spant_G_been_l_N_min), -11.8, 1e-6, " kN");
  naast("N in het been boven de gording", kN(core.femStaafWaarde(scope.spant, "G", "been_l", "N", 4)), -8.2, 1e-6, " kN");
  const V = (x) => core.femStaafWaarde(scope.spant, "G", "been_l", "V", x);
  meld(Math.abs(V(2.4) - V(2.6) - 6 * 0.8) < 1e-6, "de dwarskracht springt onder de gording met F·cos α = 4,8 kN", `${V(2.4)} ${V(2.6)}`);
}

// ── De kap uit de documentatie ──────────────────────────────────────────────
console.log("\nDe sporenkap met hanenbalk uit docs/fem-model.md");
{
  const { nodes, scope } = gerekend("kap");
  const blok = femVan(nodes);
  const kap = scope.kap;
  meld(blok?.status === "klaar" && kap instanceof FemStaafModel, "het blad is gerekend en het model staat onder zijn naam in de scope", `${blok?.status} ${blok?.melding ?? ""}`);
  // De combinatie is de lineaire som van de gevallen, op elke plaats.
  let afwijking = 0;
  for (const x of [0, 0.4, 1.1, 2.3, 3.7, 4.5]) {
    for (const g of ["N", "V", "M", "w"]) {
      const som = 1.2 * core.femStaafWaarde(kap, "G", "spoor_l", g, x) + 1.5 * core.femStaafWaarde(kap, "S", "spoor_l", g, x);
      afwijking = Math.max(afwijking, Math.abs(som - core.femStaafWaarde(kap, "UGT_S", "spoor_l", g, x)));
    }
  }
  meld(afwijking < 1e-9, "UGT_S = 1,2·G + 1,5·S op elke plaats langs het spoor (N, V, M en w)", String(afwijking));
  meld(Math.abs(kN(scope.kap_UGT_S_A_Rz) - (1.2 * kN(scope.kap_G_A_Rz) + 1.5 * kN(scope.kap_S_A_Rz))) < 1e-9, "en voor de reacties");
  // Het evenwicht per geval: de sneeuw is q per meter grondvlak maal de overspanning.
  const gev = Object.fromEntries((blok?.staven?.gevallen ?? []).map((g) => [g.naam, g]));
  meld(Math.abs(gev.S?.lastZ - 0.56 * 0.6 * 7.2) < 1e-9 && Math.abs(gev.S.reactieZ - gev.S.lastZ) < 1e-6, "sneeuw: Σ last = s·a·L = 2,419 kN = Σ R_z", JSON.stringify(gev.S));
  const Ls = Math.hypot(3.6, 3.2);
  const Lh = 7.2 - 2 * 3.6 * (2.2 / 3.2);
  const G = 2 * Ls * (0.55 * 0.6 + 4.2 * 0.059 * 0.156) + Lh * 4.2 * 0.046 * 0.121;
  meld(Math.abs(gev.G?.lastZ - G) < 1e-9 && Math.abs(gev.G.reactieZ - G) < 1e-6, `eigen gewicht: Σ last = ${G.toFixed(3)} kN = Σ R_z`, JSON.stringify(gev.G));
  const Wx = (0.35 * 0.6 + 0.25 * 0.6) * 3.2;
  const Wz = (0.35 * 0.6 - 0.25 * 0.6) * 3.6;
  meld(Math.abs(gev.W?.lastX - Wx) < 1e-9 && Math.abs(gev.W.lastZ - Wz) < 1e-9 && Math.abs(gev.W.reactieX + Wx) < 1e-6, `wind loodrecht op het dakvlak: Σ last x = ${Wx.toFixed(3)} kN, z = ${Wz.toFixed(3)} kN`, JSON.stringify(gev.W));
  // De omhullende over de combinaties.
  const combinaties = ["UGT_G", "UGT_S", "UGT_W", "BGT"];
  const mMax = Math.max(...combinaties.map((c) => kNm(scope[`kap_${c}_spoor_l_M_max`])));
  const nMin = Math.min(...combinaties.map((c) => kN(scope[`kap_${c}_hanenbalk_N_min`])));
  meld(Math.abs(kNm(scope.kap_spoor_l_M_max) - mMax) < 1e-12 && Math.abs(kN(scope.kap_hanenbalk_N_min) - nMin) < 1e-12, "de omhullende: kap.spoor_l.M_max en kap.hanenbalk.N_min over de combinaties");
  meld(Math.abs(kN(scope.kap_A_Rz_max) - Math.max(...combinaties.map((c) => kN(scope[`kap_${c}_A_Rz`])))) < 1e-12, "en kap.A.Rz_max");
  meld(Math.abs(core.femStaafWaarde(kap, "max", "spoor_l", "M", 2) - Math.max(...combinaties.map((c) => core.femStaafWaarde(kap, c, "spoor_l", "M", 2)))) < 1e-12, 'fem_staaf(kap; "max"; …) is de omhullende op een plaats');
  // Op muurplaten staat de hanenbalk onder verticale last op druk, en is er spatkracht.
  meld(kN(scope.N_haan) < 0 && kN(scope.H_A) > 0, "op muurplaten: de hanenbalk staat op druk en de muurplaat krijgt spatkracht", `${kN(scope.N_haan)} ${kN(scope.H_A)}`);
  meld(mm(scope.w_BGT) > 0 && mm(scope.w_BGT) < 50, "de doorbuiging van het spoor in de BGT is een getal in mm", String(mm(scope.w_BGT)));

  // Op het blad.
  const html = render(nodes);
  meld(/solve_open_fem_3d_batch/.test(html) && html.includes(versie), "de kop noemt de tool en de versie van FEM Studio");
  meld(/<svg[^>]*calc-fem-model/.test(html), "het schema van het staafwerk");
  meld(/<svg[^>]*calc-fem-beeld/.test(html) && /kNm/.test(html), "beeld UGT_S M: de momentenlijn als SVG, met de eenheid");
  meld(/spoor_l/.test(html) && /hanenbalk/.test(html) && /UGT_S/.test(html), "de tabellen noemen de staven en de combinaties");
  meld(!/NaN|undefined|Infinity/.test(html.replace(/<svg[\s\S]*?<\/svg>/g, "")), "geen NaN of undefined in de tabellen");
  meld(!/NaN|undefined|Infinity/.test(html), "en niet in de beelden");

  // De functies.
  const { scope: s2, nodes: n2 } = metAntwoorden([
    KAP,
    'M_2 = fem_staaf(kap; "UGT_S"; "spoor_l"; "M"; 2 m)',
    'N_2 = fem_staaf(kap; "UGT_S"; 1; "N"; 2000 mm)',
    'u_nok = fem_knoop(kap; "BGT"; "nok"; "uz")',
    'R_A = fem_knoop(kap; "UGT_S"; "A"; "Rz")',
    'R = fem_reacties(kap; "UGT_S")',
    "#hide",
    'lijn = fem_svg(kap; "UGT_W"; "V")',
    'norm = fem_svg(kap; "omhullende"; "N")',
    'vervormd = fem_svg(kap; "BGT"; "u")',
    'lasten = fem_svg(kap; "W"; "lasten")',
    "#show",
    "@3d",
    "eenheid m",
    "fem kap UGT_S M",
    "@end",
    "@3d",
    "eenheid mm",
    "fem kap BGT u",
    "@end",
  ].join("\n"), vast.kap.toetsingen);
  meld(Math.abs(kNm(s2.M_2) - core.femStaafWaarde(kap, "UGT_S", "spoor_l", "M", 2)) < 1e-12 && Math.abs(kN(s2.N_2) - core.femStaafWaarde(kap, "UGT_S", "spoor_l", "N", 2)) < 1e-12,
    "fem_staaf: de waarde op een plaats, de staaf bij naam of nummer, de plaats met eenheid");
  meld(mm(s2.u_nok) < 0 && Math.abs(kN(s2.R_A) - kN(scope.kap_UGT_S_A_Rz)) < 1e-12, "fem_knoop: de verplaatsing van de nok (omlaag is negatief) en de reactie in A");
  meld(Math.abs(mm(s2.u_nok) - mm(scope.kap_BGT_nok_uz)) < 1e-12, "dezelfde verplaatsing als kap.BGT.nok.uz");
  const R = s2.R?.toArray?.() ?? [];
  meld(R.length === 2 && Math.abs(kN(R[0][3]) - kN(scope.kap_UGT_S_A_Rz)) < 1e-12 && Math.abs(inEenheid(R[1][0], "m") - 7.2) < 1e-12, "fem_reacties: per oplegging de plaats en de reacties");
  for (const [naam, tekst] of [["lijn", "V"], ["norm", "N"], ["vervormd", "mm"], ["lasten", "kN/m"]]) {
    const svg = String(s2[naam] ?? "");
    meld(/^<svg/.test(svg) && svg.includes(tekst) && !/NaN|undefined/.test(svg), `fem_svg: ${naam} is een SVG`, svg.slice(0, 80));
  }
  const scenes = n2.filter((n) => n.type === "3d").map((n) => n.scene ?? n);
  const el = (i) => scenes[i]?.elementen ?? [];
  meld(el(0).filter((e) => e.soort === "balk").length >= 3 && el(0).some((e) => e.soort === "net"), "@3d: fem kap UGT_S M tekent de staven met hun doorsnede en de momentenlijn", JSON.stringify(el(0).map((e) => e.soort).slice(0, 12)));
  const balk = el(0).find((e) => e.soort === "balk");
  meld(balk && Math.abs(balk.b - 0.059) < 1e-9 && Math.abs(balk.h - 0.156) < 1e-9, "de doorsnede is de echte: 59 × 156 mm in een scène in m", JSON.stringify(balk));
  meld(el(1).some((e) => e.soort === "balk") && el(1).some((e) => e.soort === "tekst" && /mm/.test(e.tekst)), "@3d: fem kap BGT u tekent de vervormde stand, met de grootste verplaatsing erbij", JSON.stringify(el(1).map((e) => e.soort).slice(0, 12)));
  meld(el(0).some((e) => e.soort === "oplegging"), "met de opleggingen");

  // Uit een ander blad.
  const ander = ["M = #1.kap_UGT_S_spoor_l_M_max", 'N = fem_staaf(#1.kap; "UGT_S"; "hanenbalk"; "N"; 0.5 m)'].join("\n");
  const opties = { toetsingen: Object.fromEntries(Object.entries(vast.kap.toetsingen).map(([h, v]) => [h, alsAntwoord(v)])), toetsModus: "lezen" };
  const metRefs = scopeMetVerwijzingen(ander, {}, {}, [{ ref: "1", source: KAP, waarden: {} }], {}, opties);
  const uit = evaluateMetScope(parse(ander), {}, metRefs, opties).scope;
  meld(Math.abs(kNm(uit.M) - kNm(scope.kap_UGT_S_spoor_l_M_max)) < 1e-12 && Math.abs(kN(uit.N) - kN(scope.kap_UGT_S_hanenbalk_N_min)) < 1e-9, "uit een ander blad: #1.kap_UGT_S_spoor_l_M_max en fem_staaf(#1.kap; …)");

  // De houttoets.
  console.log("\nDe houttoets van het spoor");
  const toets = vanSoort(nodes, "toets");
  const wacht = vanSoort(metAntwoorden(KAP, Object.fromEntries(Object.entries(vast.kap.toetsingen).filter(([, v]) => v.tool !== "check_timber_beams")), "vragen").nodes, "toets");
  meld(wacht?.status === "wacht" && wacht.verzoek?.tool === "check_timber_beams", "met het antwoord op het staafwerk gaat de houttoets naar FEM Studio", `${wacht?.status} ${wacht?.melding ?? ""}`);
  const invoer = wacht?.verzoek?.argumenten;
  const hf = houtSchema && invoer ? valideer(houtSchema, invoer) : ["geen schema of geen verzoek"];
  meld(hf.length === 0, "de invoer past in het schema van check_timber_beams", hf.slice(0, 4).join("; "));
  const staaf = invoer?.inputs?.[0];
  const env = staaf?.forces_envelope ?? [];
  const perCombinatie = [1, 2, 3].map((c) => env.filter((p) => p.combination_id === c));
  meld(perCombinatie.every((p) => new Set(p.map((x) => x.position_mm)).size >= 5), "forces_envelope: per combinatie minstens vijf stations", perCombinatie.map((p) => p.length).join(" "));
  meld(Math.abs(staaf?.length_m - Ls) < 1e-9 && staaf?.width_mm === 59 && staaf?.height_mm === 156, "de lengte en de doorsnede in m en mm", JSON.stringify([staaf?.length_m, staaf?.width_mm, staaf?.height_mm]));
  const p2 = perCombinatie[1].find((p) => Math.abs(p.position_mm - 1000 * Ls) < 1e-6 === false && Math.abs(p.position_mm - 2000) < 700);
  meld(perCombinatie[1].every((p) => Math.abs(p.forces.my_ed - core.femStaafWaarde(kap, "UGT_S", "spoor_l", "M", p.position_mm / 1000)) < 1e-6 || perCombinatie[1].filter((q) => q.position_mm === p.position_mm).length > 1) && !!p2,
    "de momenten zijn die van fem_staaf op dezelfde plaats, in kNm");
  meld(perCombinatie[1].every((p) => p.forces.n_ed < 0), "N is negatief: het spoor staat op druk (positief is trek, zoals in het schema)");
  meld(Math.abs(staaf?.deflection_inst_mm + mm(scope.w_BGT)) < 1e-9, "de doorbuiging met teken: negatief is omlaag");
  meld(toets?.status === "klaar" && typeof scope.UC === "number" && scope.UC > 0, "met het vastgelegde antwoord: een UC", `${toets?.status} ${toets?.melding ?? ""} ${scope.UC}`);
  meld(/6\.1\.6|6\.2\.4|6\.3/.test(JSON.stringify(toets?.uitkomst ?? {})), "en de toetsen van NEN-EN 1995-1-1 per artikel");
  console.log(`     UC = ${Number(scope.UC).toFixed(3)}, maatgevend ${toets?.uitkomst?.staven?.[0]?.maatgevend ?? toets?.uitkomst?.maatgevend ?? "?"}`);
}

// ── Vastleggen ──────────────────────────────────────────────────────────────
console.log("\nVastleggen");
{
  const ruw = leesFixture("staven-ruw.json");
  meld(!!ruw, "een klein model met het antwoord zoals het kwam staat in scripts/fixtures/fem/staven-ruw.json");
  if (ruw) {
    meld(JSON.stringify(femStaafArgumenten(ruw.model)) === JSON.stringify(ruw.argumenten), "het bewaarde rekenmodel geeft precies de JSON die verzonden is");
    const compact = femBewaar(ruw.model, ruw.ruw);
    meld(compact.vorm === "fem-staven/1" && compact.gevallen.length === ruw.model.gevallen.length, "het antwoord wordt compact bewaard, per rekengeval");
    const g = compact.gevallen[0];
    const delen = ruw.model.staven.reduce((t, s) => t + s.knopen.length - 1, 0);
    meld(g.s.length === delen * 3 * 5 && g.u.length === ruw.model.x.length * 3 && g.R.length === ruw.model.steunen.length * 3, "vlak: per deel vijf waarden voor N, V en M, per knoop u_x, u_z en r_y, per oplegging drie reacties", `${g.s.length} ${g.u.length} ${g.R.length}`);
    meld(g.evenwicht.ok === true && Math.abs(g.som.last[2] + g.som.reactie[2]) < 1e-6, "met het evenwicht: Σ last + Σ R = 0");
    const kapot = JSON.parse(JSON.stringify(ruw.ruw));
    kapot.results[0] = { error: "het model is een mechanisme" };
    let melding = "";
    try { femStaafBewaar(ruw.model, kapot); } catch (e) { melding = e.message; }
    meld(/mechanisme/.test(melding) && melding.includes(ruw.model.gevallen[0].naam), "een fout van één rekengeval is een fout van het geheel, met het geval erbij", melding);
    const kort = JSON.parse(JSON.stringify(ruw.ruw));
    kort.results.pop();
    let m2 = "";
    try { femStaafBewaar(ruw.model, kort); } catch (e) { m2 = e.message; }
    meld(m2 !== "", "een antwoord met te weinig rekengevallen wordt niet bewaard", m2);
    const leeg = JSON.parse(JSON.stringify(ruw.ruw));
    leeg.results[0].result.displacements.pop();
    let m3 = "";
    try { femStaafBewaar(ruw.model, leeg); } catch (e) { m3 = e.message; }
    meld(/knoop/.test(m3), "een antwoord zonder de verplaatsing van een knoop ook niet", m3);
  }
  // Het antwoord hoort bij zijn eigen staafwerk: de getallen worden op het bewaarde model gelezen.
  const rec = Object.values(vast.ligger.toetsingen)[0];
  meld(rec.verzoek.vorm === "fem-staven/1" && rec.uitkomst.vorm === "fem-staven/1" && rec.tool === "solve_open_fem_3d_batch", "bij het blad staan het rekenmodel en het compacte antwoord");
  meld(JSON.stringify(rec).length < 20000, `een ligger kost ${JSON.stringify(rec).length} tekens in het projectbestand`);
  // De sessiecache en het vastleggen bij het blad.
  const blok = vragen(KAP);
  meld(cache.verzamelVerzoeken([blok]).length === 1 && cache.toetsHashes([blok]).length === 1, "de app ziet één verzoek en één hash voor het staafwerk");
  meld(cache.HEEFT_FEM_BLOK.test(KAP), "en herkent het blad als een blad dat FEM Studio iets vraagt");
  // Een ander FEM Studio dan waarmee gerekend is.
  const ouder = femVan(gerekend("ligger", "vragen", { fem: { versie: "2099.1.0", schemas: {} } }).nodes);
  meld(ouder?.status === "klaar" && ouder.verouderd?.versie === "2099.1.0" && ouder.opnieuw === true, "een antwoord van een andere versie blijft gelden, met de melding en de knop opnieuw rekenen");
}

// ── Welke tools ─────────────────────────────────────────────────────────────
console.log("\nDe tool");
{
  const tools = leesFixture(`tools-${versie}.json`) ?? [];
  meld(tools.includes("solve_open_fem_3d_batch") && tools.includes("check_timber_beams"), `de server ${versie} kent solve_open_fem_3d_batch en check_timber_beams`);
  meld(toetsToolToegestaan("solve_open_fem_3d_batch"), "een blad mag solve_open_fem_3d_batch gebruiken");
  const rust = readFileSync(new URL("../packages/desktop/src-tauri/fem-brug/src/lib.rs", import.meta.url), "utf8");
  meld(!/"requests"/.test(rust.match(/const PADEN[^;]*;/)?.[0] ?? '"requests"'), "en de Rust-kant laat het argument requests door");
}

console.log(fouten ? `\n${fouten} fout(en).` : "\nDe staven in het FEM-model kloppen.");
process.exit(fouten ? 1 : 0);
