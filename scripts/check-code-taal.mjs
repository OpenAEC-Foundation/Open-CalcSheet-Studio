/**
 * Controle van de tab Code en de naam van een blad in de taal van de app.
 *
 * De rekentekst in het project blijft de bron: de rekenversie, Bladen bijwerken, de
 * invoersleutels en de parametrische beelden lezen die. De tab Code toont de tekst in de
 * taal van de app en zet een bewerking regel voor regel terug in de bron. Toetst:
 *
 *   1  de naam van een nieuw blad in de taal van de app, ook via de API; bestaande en
 *      eigen namen blijven staan;
 *   2  per module: de tab Code toont geen Nederlandse tekst, heeft evenveel regels als de
 *      bron, en is in het Nederlands de bron zelf;
 *   3  de getoonde tekst rekent hetzelfde: dezelfde invoervelden, getallen en oordelen;
 *   4  terugzetten: wat niet is aangeraakt, blijft de bron, en een regel weer terugzetten
 *      geeft de oude bron en dus de oude rekenversie;
 *   5  de rekenversie, eigen code en verouderd: niets verspringt zonder bewerking;
 *   6  de beelden en de vertaling herkennen het blad ook als de kop is aangepast;
 *   7  het andersom: Engelse tekst in een Nederlands rapport;
 *   8  de echte editor in jsdom: wat er staat, en wat een bewerking met de store doet.
 *
 * Draaien:  node scripts/check-code-taal.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { evaluate, parse, render } from "../packages/core/dist/index.js";
import { laadTemplate } from "./lib/refcheck.mjs";

const { codeTeksten } = await import("../packages/desktop/src/components/calc/uitvoerTaal.ts");
const { bronNaBewerking, bronVoorUitvoer, codeInTaal, hoortBij, vertalingVoor } = await import("../packages/desktop/src/templates/vertalingen.ts");
const { heeftEigenCode, invoervelden, isVerouderd, rekenversie } = await import("../packages/desktop/src/components/calc/bladVersie.ts");
const { leesGetallen, leesResultaat } = await import("../packages/desktop/src/components/calc/bladLezen.ts");
const { balklaagKent } = await import("../packages/desktop/src/components/calc/balklaagBlad.ts");

let fouten = 0;
function toets(naam, ok, detail) {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${naam}${ok || detail === undefined ? "" : `\n         ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
}
const gelijk = (naam, kreeg, verwacht) => toets(naam, JSON.stringify(kreeg) === JSON.stringify(verwacht), `kreeg ${JSON.stringify(kreeg)?.slice(0, 300)}, verwacht ${JSON.stringify(verwacht)?.slice(0, 300)}`);
const kop = (t) => console.log(`\n${t}`);

/** De kale bladtekst: zonder de TypeScript eromheen, zoals de app hem invoegt. */
const blad = (bestand, begin) => {
  const t = laadTemplate(bestand);
  return t.slice(t.indexOf(begin));
};
const PROJECT = { CC: 2, K_FI: 1, rekenwijze: 0, DesignLife: 50, RC: 2 };
const BALKLAAG = {
  profiel: "12", sterkteklasse: "2", klimaat: "1", duurklasse: "2", ligger: "1", doorsnede: "1", schema: "1",
  L_d: "5000", a_opl: "50", hoh: "600", t_vloer: "18", E_beschot: "7000", b_vloer: "3",
  G_k: "1.0", Q_k: "1.75", F_k: "2", belastingcat: "2", controleer: "1", grensfactor: "0.004", grens_bij: "0.003",
  controleer_trilling: "1", "ζ": "0.01", a_tril: "1", b_tril: "120", g_bl: "0", a_steun: "0", n_w: "2", klasse_w: "0", l_sparing: "0",
};
const POER = {
  l_poer: "2100", b_poer: "580", h_poer: "900", a_hoh: "1400", e_p: "50", t_in: "50",
  paalvorm: "1", p_x: "350", p_y: "350", kolomvorm: "1", c_x: "400", c_y: "400",
  betonklasse: "30", betonstaal: "2", milieu: "2", ondergrond: "1", d_g: "16", c_o: "60", c_z: "40",
  n_t: "6", d_t: "25", s_t: "70", lagen: "1", vorm_t: "2", l_op: "600", D_m: "125",
  d_s: "12", s_s: "100", n_s: "4", n_z: "5", d_z: "12", n_b: "3", d_b: "12", n_hp: "2", d_hp: "12", n_dw: "3", d_dw: "16",
  F_Ed: "1800", F_fr: "1200", dwars: "1",
};
const MODULES = [
  { id: "balklaag", marker: "Balklaag", bron: blad("balklaag.ts", '"Balklaag —'), gevallen: [{ ...BALKLAAG }, { ...BALKLAAG, schema: "2", a_over: "900" }, { ...BALKLAAG, schema: "4", b_sparing: "2400", l_staart: "1800" }] },
  { id: "ligger", marker: "Ligger van hout of staal", bron: blad("ligger.ts", '"Ligger van hout of staal'), gevallen: [{}, { materiaal: "2" }, { systeem: "3" }] },
  { id: "tweepaalspoer", marker: "Tweepaalspoer", bron: blad("tweepaalspoer.ts", '"Tweepaalspoer —'), gevallen: [{ ...POER }, { ...POER, dwars: "0" }, { ...POER, n_t: "2" }] },
  { id: "doorsnede-spanningen", marker: "Spanningen in een doorsnede", bron: blad("doorsnede-spanningen.ts", '"Spanningen in een doorsnede —'), gevallen: [{ vorm: "1", profiel: "24", N_x: "-200", M_y: "100", M_z: "10", V_y: "10", V_z: "80", f_y: "0" }, { vorm: "2", b: "100", h: "200", N_x: "-200", M_y: "100", M_z: "10", V_y: "10", V_z: "80", f_y: "235" }] },
  { id: "rekentaal-demo", marker: null, bron: blad("rekentaal-demo.ts", '"Open CalcSheet Studio demo'), gevallen: [{}] },
];

// ── 2. Wat de tab Code toont ────────────────────────────────────────────────
kop("2. De tab Code in het Engels");
/** Nederlandse woorden; de korte alleen in kleine letters, want EN is ook een normnummer. */
const NL = /\b(?:het|een|van|bij|met|voor|uit|naar|niet|geen|alleen|maar|ook|dan|wordt|worden|staat|staan|veld|balk|balken|ligger|steunpunt|oplegging|opleggingen|overstek|doorbuiging|buiging|afschuiving|oplegdruk|trilling|trillingen|raveelbalk|wisselbalk|sparing|onderslag|balklaag|veranderlijk|voldoet|voldoen|toets|toetsing|invoer|hoogte|breedte|lengte|lasten|puntlast|belasting|belastingen|belastinggeval|combinatie|combinaties|omhullende|maatgevend|maatgevende|eigen|gewicht|kruip|eindstand|grootste|kleinste|zakking|dwarskracht|staal|hout|profiel|materiaal|doorsnede|klasse|tabel|formule|samenvatting|aangenomen|paal|palen|poer|kolom|wapening|beugel|beugels|staaf|staven|trekband|invullen|geldig|ongeldig|deze|hier|moet|mag|kan|zoals|wanneer|omdat|waar|tussen|onder|boven|tegen|alle|elke|geeft|heeft|komt|blijft)\b/i;
const NL_KLEIN = /\b(?:de|en|op|als|te|om|is de|zijn)\b/;
const leesbaar = (t) => t.replace(/<(sub|sup|code)>[^<]*<\/\1>/g, " ").replace(/<[^>]+>/g, " ").replace(/\bEN \d[\d-]*/g, " ");
for (const m of MODULES) {
  const code = codeInTaal(m.bron, "en");
  gelijk(`${m.id}: evenveel regels als de bron`, code.split("\n").length, m.bron.split("\n").length);
  toets(`${m.id}: in het Nederlands de bron zelf`, codeInTaal(m.bron, "nl") === m.bron);
  toets(`${m.id}: in het Engels niet de bron`, code !== m.bron);
  toets(`${m.id}: de tekst krijgt geen taal op het 3D-blok`, !/\btaal=/.test(code));
  const rest = codeTeksten(code).filter((k) => NL.test(leesbaar(k)) || NL_KLEIN.test(leesbaar(k)));
  toets(`${m.id}: geen Nederlandse tekst, ook niet op verborgen regels of in commentaar (${codeTeksten(code).length} stukjes)`, rest.length === 0, `${rest.length} over:\n         ${rest.slice(0, 40).join("\n         ")}`);
  gelijk(`${m.id}: nog een keer vertalen verandert niets`, codeInTaal(code, "en") === code, true);
  const v = vertalingVoor(m.bron, "en");
  const zonder = Object.values(v.code ?? {}).filter((w) => w.includes("'"));
  gelijk(`${m.id}: geen rechte apostrof in een vertaling voor de code`, zonder, []);
  const stukjes = new Set(codeTeksten(m.bron));
  gelijk(`${m.id}: geen vervallen regels in de tabel voor de code`, Object.keys(v.code ?? {}).filter((k) => !stukjes.has(k)), []);
}
gelijk("een eigen blad blijft zoals het is", codeInTaal('"Eigen blad\n\'Eigen tekst\nx = 1', "en"), '"Eigen blad\n\'Eigen tekst\nx = 1');

// ── 3. De getoonde tekst rekent hetzelfde ───────────────────────────────────
kop("3. Dezelfde invoer, getallen en oordelen");
for (const m of MODULES) {
  const code = codeInTaal(m.bron, "en");
  const velden = (t) => invoervelden(parse(t)).map((f) => [f.naam, f.soort, f.beginwaarde, f.eenheid, f.keuzes.map((k) => k.value)]);
  gelijk(`${m.id}: dezelfde invoervelden`, velden(code), velden(m.bron));
  for (const invoer of m.gevallen) {
    const a = evaluate(parse(m.bron), invoer, PROJECT);
    const b = evaluate(parse(code), invoer, PROJECT);
    const ga = leesGetallen(a);
    const gb = leesGetallen(b);
    const verschil = Object.keys({ ...ga, ...gb }).filter((k) => !Object.is(ga[k], gb[k]));
    gelijk(`${m.id} ${JSON.stringify(invoer).slice(0, 40)}: dezelfde getallen (${Object.keys(ga).length})`, verschil, []);
    const ra = leesResultaat(a, "x");
    const rb = leesResultaat(b, "x");
    gelijk(`${m.id}: hetzelfde oordeel`, [rb.uc, rb.voldoet, !!rb.nietGetoetst], [ra.uc, ra.voldoet, !!ra.nietGetoetst]);
  }
}

// ── 4. Terugzetten ──────────────────────────────────────────────────────────
kop("4. Een bewerking gaat regel voor regel terug in de bron");
{
  const { bron } = MODULES[1];
  const code = codeInTaal(bron, "en");
  const regels = code.split("\n");
  const bronRegels = bron.split("\n");
  toets("niets veranderd: de bron", bronNaBewerking(bron, code, code) === bron);
  // De eerste regel met tekst die vertaald is, en niet de titel.
  const i = regels.findIndex((r, j) => j > 0 && r !== bronRegels[j] && r.startsWith("#"));
  const ander = [...regels];
  ander[i] = `${regels[i]} (own note)`;
  const s1 = bronNaBewerking(bron, code, ander.join("\n"));
  gelijk("één regel aangepast: alleen die regel verschilt in de bron", s1.split("\n").flatMap((r, j) => (r === bronRegels[j] ? [] : [j])), [i]);
  gelijk("en daar staat wat er getypt is", s1.split("\n")[i], ander[i]);
  const bij = [...regels.slice(0, i + 1), "x_eigen = 1", ...regels.slice(i + 1)];
  const s2 = bronNaBewerking(bron, code, bij.join("\n"));
  gelijk("een regel erbij: de rest blijft de bron", s2.split("\n"), [...bronRegels.slice(0, i + 1), "x_eigen = 1", ...bronRegels.slice(i + 1)]);
  const weg = regels.filter((_, j) => j !== i);
  gelijk("een regel weg: de rest blijft de bron", bronNaBewerking(bron, code, weg.join("\n")).split("\n"), bronRegels.filter((_, j) => j !== i));
  // Twee regels, ver uit elkaar, in één keer (zoeken en vervangen): de regels ertussen blijven de bron.
  const j = regels.length - 5;
  const twee = [...regels];
  twee[i] += " a";
  twee[j] += " b";
  gelijk("twee regels tegelijk: alleen die twee", bronNaBewerking(bron, code, twee.join("\n")).split("\n").flatMap((r, k) => (r === bronRegels[k] ? [] : [k])), [i, j]);
  // Typen en weer weghalen: de bron komt terug, met zijn eigen rekenversie.
  const schoon = { bron, code };
  toets("terugzetten: de oude bron", bronNaBewerking(s1, ander.join("\n"), code, schoon) === bron);
  // Opnieuw bewerken op een bewerkte tekst blijft kloppen.
  const nogEens = [...ander];
  nogEens[i + 1] = `${nogEens[i + 1]}`;
  gelijk("verder bewerken: de eerste bewerking blijft staan", bronNaBewerking(s1, ander.join("\n"), nogEens.join("\n")), s1);
  toets("met een andere regelindeling: de nieuwe tekst", bronNaBewerking("a\nb", "c", "d\ne") === "d\ne");
}

// ── 5. Rekenversie, eigen code, verouderd ───────────────────────────────────
kop("5. De rekenversie verspringt niet");
for (const m of MODULES) {
  const ex = { templateId: m.id, source: m.bron, bronVersie: rekenversie(m.bron) };
  const sjablonen = { [m.id]: m.bron };
  const voor = rekenversie(ex.source);
  codeInTaal(m.bron, "en");
  gelijk(`${m.id}: de rekenversie blijft`, rekenversie(ex.source), voor);
  toets(`${m.id}: geen eigen code zonder bewerking`, !heeftEigenCode(ex));
  toets(`${m.id}: niet verouderd zonder bewerking`, !isVerouderd(ex, sjablonen));
  const code = codeInTaal(m.bron, "en");
  const r = code.split("\n");
  const i = r.findIndex((x, j) => j > 0 && x.startsWith("#") && /\p{L}{3}/u.test(x));
  const anders = [...r];
  anders[i] += " x";
  const s = bronNaBewerking(m.bron, code, anders.join("\n"));
  toets(`${m.id}: een echte bewerking is eigen code, met een eigen rekenversie`, heeftEigenCode({ ...ex, source: s }) && rekenversie(s) !== voor);
  toets(`${m.id}: en maakt het blad niet verouderd`, !isVerouderd({ ...ex, source: s }, sjablonen));
  const terug = bronNaBewerking(s, anders.join("\n"), code, { bron: m.bron, code });
  toets(`${m.id}: weer teruggezet: de oude rekenversie en geen eigen code`, rekenversie(terug) === voor && !heeftEigenCode({ ...ex, source: terug }));
}

// ── 6. Herkennen ────────────────────────────────────────────────────────────
kop("6. De beelden en de vertaling herkennen het blad");
for (const m of MODULES) {
  if (!m.marker) continue;
  toets(`${m.id}: de bron wordt herkend`, hoortBij(m.bron, m.marker));
  const code = codeInTaal(m.bron, "en");
  const r = code.split("\n");
  r[0] += " (own title)";
  const s = bronNaBewerking(m.bron, code, r.join("\n"));
  toets(`${m.id}: met een aangepaste kop nog steeds`, hoortBij(s, m.marker));
  toets(`${m.id}: en de vertaling ook`, vertalingVoor(s, "en") !== null);
  const velden = (t) => invoervelden(parse(t)).map((f) => f.naam);
  gelijk(`${m.id}: dezelfde invoer met een aangepaste kop`, velden(s), velden(m.bron));
  const invoer = m.gevallen[0];
  gelijk(`${m.id}: de beelden lezen dezelfde getallen`, leesGetallen(evaluate(parse(s), invoer, PROJECT)), leesGetallen(evaluate(parse(m.bron), invoer, PROJECT)));
}
toets("een ander blad wordt niet herkend", !hoortBij('"Eigen blad\nx = 1', "Balklaag"));
{
  // Het beeld van de balklaag vraagt naar wat het blad kent, ook in een Engelse regel.
  const { bron } = MODULES[0];
  const code = codeInTaal(bron, "en");
  gelijk("balklaag: de tab Code kent dezelfde onderdelen", balklaagKent(code), balklaagKent(bron));
}

// ── 7. Het andersom ─────────────────────────────────────────────────────────
kop("7. Engelse tekst in een Nederlands rapport");
for (const m of MODULES) {
  const code = codeInTaal(m.bron, "en");
  // Een bewerkte regel is eigen tekst, en die blijft staan; de rest is en blijft de bron.
  const r = code.split("\n");
  const i = r.findIndex((x, j) => j > 0 && x.startsWith("#") && /\p{L}{3}/u.test(x));
  r[i] += " x";
  const s = bronNaBewerking(m.bron, code, r.join("\n"));
  const nl = bronVoorUitvoer(s, "nl");
  toets(`${m.id}: bewerkt blad in het Nederlands: alleen de eigen regel is anders`, nl.bron === s && s.split("\n").filter((x, j) => x !== m.bron.split("\n")[j]).length === 1);
  const invoer = m.gevallen[0];
  gelijk(`${m.id}: en dezelfde getallen`, leesGetallen(evaluate(parse(nl.bron), invoer, PROJECT)), leesGetallen(evaluate(parse(m.bron), invoer, PROJECT)));
  // Een hele Engelse tekst, geplakt of via de API: dezelfde tabel, de andere kant op.
  const terug = bronVoorUitvoer(code, "nl").bron;
  const tekstNl = codeTeksten(terug).filter((k) => new Set(Object.values(vertalingVoor(m.bron, "en").tekst)).has(k) && !new Set(Object.keys(vertalingVoor(m.bron, "en").tekst)).has(k));
  gelijk(`${m.id}: hele Engelse tekst in het Nederlands: niets uit de tabel blijft Engels`, tekstNl, []);
  gelijk(`${m.id}: en dezelfde getallen`, leesGetallen(evaluate(parse(terug), invoer, PROJECT)), leesGetallen(evaluate(parse(m.bron), invoer, PROJECT)));
  gelijk(`${m.id}: dezelfde kop als de bron`, terug.split("\n")[0], m.bron.split("\n")[0]);
}
{
  // Een hele Engelse tekst in het Engels: ook de namen in beeld kloppen.
  const m = MODULES[0];
  const code = codeInTaal(m.bron, "en");
  const u = bronVoorUitvoer(code, "en");
  const html = render(evaluate(parse(u.bron), { ...BALKLAAG, schema: "4", b_sparing: "2400", l_staart: "1800" }, PROJECT), { namen: u.namen });
  toets("hele Engelse tekst in het Engels: de namen in beeld kloppen", />b_opening =<\/label>/.test(html));
  toets("een Nederlandse bron in het Nederlands blijft precies de bron", bronVoorUitvoer(m.bron, "nl").bron === m.bron);
}

// ── 1 en 8. De app zelf ─────────────────────────────────────────────────────
{
  const { laadRapportAfdruk } = await import("./lib/rapport-html.mjs");
  const a = await laadRapportAfdruk();
  const store = () => a.useProjectStore.getState();
  const leeg = () => store().laadProject({ projectNaam: "x", gegevens: {}, exemplaren: [], rapport: store().rapport });
  const namen = () => store().exemplaren.map((e) => e.naam);

  kop("1. De naam van een nieuw blad");
  await a.i18next.changeLanguage("en");
  leeg();
  for (const id of ["ligger", "balklaag", "tweepaalspoer", "doorsnede-spanningen", "rekentaal-demo"]) a.useModuleKiezer.getState().voegToe(id);
  gelijk("in het Engels", namen(), ["Beam 1", "Timber joist floor 1", "Two-pile cap 1", "Section stresses 1", "Open CalcSheet Studio demo 1"]);
  a.useModuleKiezer.getState().voegToe("ligger");
  gelijk("de volgende krijgt het volgende nummer", namen().at(-1), "Beam 2");
  await a.i18next.changeLanguage("nl");
  gelijk("een andere taal: bestaande namen blijven staan", namen().slice(0, 2), ["Beam 1", "Timber joist floor 1"]);
  a.useModuleKiezer.getState().voegToe("ligger");
  gelijk("in het Nederlands", namen().at(-1), "Ligger 1");
  a.useModuleKiezer.getState().voegToe("balklaag");
  gelijk("in het Nederlands: balklaag", namen().at(-1), "Balklaag 1");
  store().hernoem(store().exemplaren[0].id, "Eigen naam");
  a.useModuleKiezer.getState().voegToe("ligger");
  gelijk("een eigen naam blijft staan", namen()[0], "Eigen naam");
  await a.i18next.changeLanguage("en");
  leeg();
  a.useModuleKiezer.getState().voegLeegBladToe();
  gelijk("een leeg blad", [namen()[0], store().exemplaren[0].source.split("\n")[0]], ["Sheet 1", '"New sheet']);

  kop("8. De echte editor");
  const ligger = MODULES[1].bron;
  await a.i18next.changeLanguage("en");
  store().laadProject({ projectNaam: "x", gegevens: {}, exemplaren: [{ id: "ex-1", naam: "Beam 1", templateId: "ligger", source: ligger, bronVersie: rekenversie(ligger), waarden: {}, elementen: [] }], rapport: store().rapport });
  store().selecteer("ex-1");
  const e = a.tekenEditor();
  const code = codeInTaal(ligger, "en");
  await new Promise((klaar) => setTimeout(klaar, 50));
  toets("de editor toont de Engelse tekst", e.tekst() === code, e.tekst().slice(0, 120));
  toets("en de bron blijft de Nederlandse", store().exemplaren[0].source === ligger);
  const regel = code.split("\n").findIndex((x) => x.startsWith("# "));
  e.typ(regel, " x");
  await new Promise((klaar) => setTimeout(klaar, 50));
  const s1 = store().exemplaren[0].source;
  gelijk("typen: alleen die regel verandert in de bron", s1.split("\n").flatMap((r, j) => (r === ligger.split("\n")[j] ? [] : [j])), [regel]);
  toets("en de editor houdt wat er getypt is", e.tekst().split("\n")[regel] === `${code.split("\n")[regel]} x`);
  e.haalWeg(regel, 2);
  await new Promise((klaar) => setTimeout(klaar, 50));
  toets("weghalen: de oude bron, dus de oude rekenversie", store().exemplaren[0].source === ligger);
  store().ongedaan();
  store().opnieuw();
  await a.i18next.changeLanguage("nl");
  await new Promise((klaar) => setTimeout(klaar, 50));
  toets("de app op Nederlands: de editor toont de bron", e.tekst() === store().exemplaren[0].source);
  e.sluit();
}

console.log(fouten === 0 ? "\nTab Code en bladnaam in de taal van de app: alles in orde." : `\n${fouten} controle(s) gezakt.`);
process.exit(fouten === 0 ? 0 : 1);
