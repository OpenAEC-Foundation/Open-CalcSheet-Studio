/**
 * Controle van de parametrische symbolen in het tabblad Tekenen
 * (packages/desktop/src/components/tekenen/: symbolen.ts, staalprofielen.ts,
 * term.ts en het schrijven en lezen in code.ts).
 *
 *   • profieltabel  — één bron: wat de aanvulling in staalprofielen.ts heeft,
 *                     staat niet in components/calc/profielen.ts, en wat uit
 *                     profielen.ts komt, heeft daar precies dezelfde maten.
 *                     Een steekproef van tabeloppervlakken rekent de
 *                     aanvulling na; elk profiel heeft zinnige verhoudingen.
 *   • tekening      — elke doorsnede in de code heeft de maten van de tabel:
 *                     omhullende b × h, lijf, flens en wand op de juiste plek,
 *                     en het getekende oppervlak (met de afrondingen als
 *                     bogen) gelijk aan dat uit de maten.
 *   • aanzichten    — elk profiel in boven- en zijaanzicht heeft de bandbreedte,
 *                     binnenlijnen en lengte die bij maat en schaal horen.
 *   • herbruikbaar  — twee gelijke profielen zijn één <symbol> en twee <use>,
 *                     en het id volgt de inhoud (ook een gekoppelde maat).
 *   • heen en terug — een tekening met alle symbolen, ook met koppelingen aan
 *                     het blad en tekst met leestekens, gaat via de code terug
 *                     in de editor met dezelfde parameters, en opnieuw
 *                     geschreven is de code letter voor letter gelijk.
 *   • oude vorm     — blokken met <g data-symbool> en maatlijnen met tikken
 *                     lezen nog; symbolen gaan bij opslaan over op <use>.
 *   • maatlijn      — afstand, hulplijnen, rondjes, kleur en tekst aan de
 *                     buitenkant, heen en terug.
 *   • commando's    — getypte commando's en coördinaten, en verplaatsen,
 *                     draaien, spiegelen en schalen van elke soort vorm.
 *   • rekenkern     — het blok gaat ongeschonden door parse/evaluate/render:
 *                     alleen `{{…}}` wordt een getal, de teksten blijven heel,
 *                     elke <use> heeft zijn <symbol>, en de gekoppelde waarden
 *                     (ook met eenheid) staan in de tekening.
 *
 * Draaien:  node scripts/check-tekenen-symbolen.mjs   (vereist een gebouwde core
 * en een Node die TypeScript rechtstreeks laadt, 22.18 of nieuwer)
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { DOMParser, Node, ontcijfer } from "./lib/mini-dom.mjs";
import { parse, evaluate, render } from "../packages/core/dist/index.js";

globalThis.DOMParser = DOMParser;
globalThis.Node = Node;

const hier = dirname(fileURLToPath(import.meta.url));
const TEKENEN = join(hier, "../packages/desktop/src/components/tekenen");
const laad = (pad) => import(pathToFileURL(pad).href);
const P = await laad(join(hier, "../packages/desktop/src/components/calc/profielen.ts"));
const S = await laad(join(TEKENEN, "staalprofielen.ts"));
const Y = await laad(join(TEKENEN, "symbolen.ts"));
const M = await laad(join(TEKENEN, "model.ts"));
const C = await laad(join(TEKENEN, "code.ts"));
const B = await laad(join(TEKENEN, "bewerk.ts"));
const K = await laad(join(TEKENEN, "commando.ts"));

let fouten = 0;
let goed = 0;
function meld(ok, naam, detail = "") {
  if (ok) {
    goed++;
    return;
  }
  fouten++;
  console.log(`  FOUT   ${naam}${detail ? `\n         ${detail}` : ""}`);
}
const kop = (s) => console.log(`\n${s}`);
const bijna = (a, b, tol) => Math.abs(a - b) <= tol;

// ─────────────────────────────────────────────────────────────────────────
kop("Profieltabel: één bron");
{
  const inTabel = new Set([...Object.values(P.PROFIELEN), ...Object.values(P.HOEKSTALEN)].map((p) => p.naam));
  const dubbel = S.aanvullingNamen().filter((n) => inTabel.has(n));
  meld(dubbel.length === 0, "de aanvulling heeft geen profiel dat ook in profielen.ts staat", dubbel.join(", "));

  const alle = S.FAMILIES.flatMap((f) => f.rijen.map((r) => r.naam));
  meld(new Set(alle).size === alle.length, "elke profielnaam komt één keer voor");
  for (const f of S.FAMILIES) {
    meld(f.rijen.some((r) => r.naam === f.standaard), `${f.id}: de standaardmaat ${f.standaard} bestaat`);
  }

  let n = 0;
  for (const p of Object.values(P.PROFIELEN)) {
    const fam = S.FAMILIES.find((f) => p.naam.startsWith(`${f.id} `));
    const rij = fam && S.profielRij(fam, p.naam);
    meld(!!rij && rij.bron === "profielen", `${p.naam} komt in de tekening uit profielen.ts`);
    if (!rij) continue;
    for (const k of ["h", "b", "tw", "tf", "r"]) meld(rij.maten[k] === p[k], `${p.naam}: ${k} gelijk aan profielen.ts`, `${rij.maten[k]} ≠ ${p[k]}`);
    n++;
  }
  for (const l of Object.values(P.HOEKSTALEN)) {
    const rij = S.profielRij(S.familie("hoek"), l.naam);
    meld(!!rij && rij.bron === "profielen", `${l.naam} komt in de tekening uit profielen.ts`);
    if (!rij) continue;
    meld(rij.maten.h === l.h && rij.maten.b === l.h && rij.maten.t === l.t && rij.maten.r === l.r1, `${l.naam}: maten gelijk aan profielen.ts`);
    n++;
  }
  console.log(`  ${n} profielen uit profielen.ts, ${S.aanvullingNamen().length} in de aanvulling`);

  // Zinnige verhoudingen.
  for (const f of S.FAMILIES) {
    for (const r of f.rijen) {
      const m = r.maten;
      const ok =
        f.vorm === "koker" ? m.t > 0 && 2 * m.t < Math.min(m.b, m.h)
        : f.vorm === "hoek" ? m.t > 0 && m.t < Math.min(m.b, m.h) && m.r >= 0
        : m.tw > 0 && m.tw < m.b && m.tf > 0 && 2 * m.tf < m.h && m.r >= 0 && m.tw + 2 * m.r < m.b;
      meld(ok, `${r.naam}: zinnige maten`, JSON.stringify(m));
    }
  }

  // Steekproef: oppervlak uit de maten tegen de tabelwaarde (cm²).
  const STEEKPROEF = {
    "HEA 280": 97.26, "HEA 400": 159.0, "HEA 1000": 346.8, "HEB 280": 131.4, "HEB 500": 238.6, "HEB 1000": 400.0,
    "HEM 100": 53.24, "HEM 200": 131.3, "HEM 300": 303.1, "HEM 600": 363.7, "HEM 1000": 444.2,
    "IPE 80": 7.64, "IPE 220": 33.37, "IPE 450": 98.82, "IPE 600": 156.0,
  };
  for (const [naam, A] of Object.entries(STEEKPROEF)) {
    const fam = S.FAMILIES.find((f) => naam.startsWith(`${f.id} `));
    const m = S.profielRij(fam, naam)?.maten;
    const opp = m && (2 * m.b * m.tf + (m.h - 2 * m.tf) * m.tw + (4 - Math.PI) * m.r ** 2) / 100;
    meld(m && bijna(opp, A, A * 0.001 + 0.01), `${naam}: oppervlak uit de maten ${opp?.toFixed(2)} cm² = tabel ${A} cm²`);
  }
  // En de profielen uit profielen.ts tegen hun eigen A.
  for (const p of Object.values(P.PROFIELEN)) {
    const opp = 2 * p.b * p.tf + (p.h - 2 * p.tf) * p.tw + (4 - Math.PI) * p.r ** 2;
    meld(bijna(opp, p.A, p.A * 0.002), `${p.naam}: oppervlak uit de maten = A van profielen.ts`, `${opp} ≠ ${p.A}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Een pad (M H V A Z, absoluut) als deelpaden met hun eindpunten en bogen.
function leesPad(d) {
  const tk = d.match(/[MHVAZ]|-?\d+(?:\.\d+)?(?:e-?\d+)?/g);
  const delen = [];
  let deel = null, x = 0, y = 0, i = 0;
  const n = () => Number(tk[i++]);
  while (i < tk.length) {
    const c = tk[i++];
    if (c === "M") { x = n(); y = n(); deel = { punten: [[x, y]], bogen: [] }; delen.push(deel); }
    else if (c === "H") { x = n(); deel.punten.push([x, y]); }
    else if (c === "V") { y = n(); deel.punten.push([x, y]); }
    else if (c === "A") {
      const r = n(); n(); n(); const groot = n(); const klok = n(); const x2 = n(), y2 = n();
      deel.bogen.push({ r, groot, klok, a: [x, y], b: [x2, y2] });
      x = x2; y = y2; deel.punten.push([x, y]);
    } else if (c === "Z") { /* gesloten */ }
    else throw new Error(`onverwacht ${c}`);
  }
  return delen;
}

/** Oppervlak van een deelpad: schoenveter over de eindpunten plus de cirkelsegmenten van de bogen. */
function oppervlak(deel) {
  let s = 0;
  const p = deel.punten;
  for (let i = 0; i < p.length; i++) {
    const [x1, y1] = p[i], [x2, y2] = p[(i + 1) % p.length];
    s += x1 * y2 - x2 * y1;
  }
  let a = s / 2;
  for (const b of deel.bogen) {
    const koorde = Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]);
    if (b.r < 1e-9 || koorde < 1e-9) continue;
    let th = 2 * Math.asin(Math.min(1, koorde / (2 * b.r)));
    if (b.groot) th = 2 * Math.PI - th;
    a += (b.klok ? 1 : -1) * (b.r ** 2 / 2) * (th - Math.sin(th));
  }
  return a;
}

const omhulling = (punten) => {
  const xs = punten.map((p) => p[0]), ys = punten.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

kop("Tekening: doorsneden op de maten van de tabel");
{
  const stijl = M.STANDAARD_STIJL;
  const k = S.PX_PER_MM; // schaal 1:1
  let n = 0;
  for (const f of S.FAMILIES) {
    for (const r of f.rijen) {
      const v = Y.nieuwSymbool("staal", { x: 0, y: 0 }, stijl, { familie: f.id, maat: r.naam, schaal: "1", hartlijn: "0", label: "0" });
      const t = M.legeTekening("tek1");
      t.elementen.push(v);
      const blok = C.schrijfTekening(t, { verborgen: false, kop: "x" });
      const d = /<path d="([^"]+)"/.exec(blok)?.[1];
      if (!d) { meld(false, `${r.naam}: een pad in de code`); continue; }
      const delen = leesPad(d);
      const m = r.maten;
      const o = omhulling(delen[0].punten);
      const tol = 0.011;
      meld(bijna(o.x1 - o.x0, m.b * k, tol) && bijna(o.y1 - o.y0, m.h * k, tol),
        `${r.naam}: omhullende b × h = ${m.b} × ${m.h} mm`, `${((o.x1 - o.x0) / k).toFixed(2)} × ${((o.y1 - o.y0) / k).toFixed(2)}`);
      meld(bijna(o.x0, -m.b * k / 2, tol) && bijna(o.y0, -m.h * k / 2, tol), `${r.naam}: het midden op het invoegpunt`);
      const xs = new Set(delen[0].punten.map((p) => p[0].toFixed(2)));
      const ys = new Set(delen[0].punten.map((p) => p[1].toFixed(2)));
      const heeftX = (x) => [...xs].some((s) => bijna(Number(s), x, tol));
      const heeftY = (y) => [...ys].some((s) => bijna(Number(s), y, tol));
      let A, Ad;
      if (f.vorm === "i") {
        meld(heeftX(m.tw * k / 2) && heeftX(-m.tw * k / 2), `${r.naam}: lijf t_w = ${m.tw} mm`);
        meld(heeftY(-m.h * k / 2 + m.tf * k) && heeftY(m.h * k / 2 - m.tf * k), `${r.naam}: flens t_f = ${m.tf} mm`);
        A = 2 * m.b * m.tf + (m.h - 2 * m.tf) * m.tw + (4 - Math.PI) * m.r ** 2;
        Ad = oppervlak(delen[0]) / k ** 2;
      } else if (f.vorm === "u") {
        meld(heeftX(-m.b * k / 2 + m.tw * k), `${r.naam}: lijf t_w = ${m.tw} mm`);
        meld(heeftY(-m.h * k / 2 + m.tf * k), `${r.naam}: flens t_f = ${m.tf} mm`);
        A = 2 * m.b * m.tf + (m.h - 2 * m.tf) * m.tw + (2 - Math.PI / 2) * m.r ** 2;
        Ad = oppervlak(delen[0]) / k ** 2;
      } else if (f.vorm === "koker") {
        const binnen = omhulling(delen[1]?.punten ?? [[0, 0]]);
        meld(delen.length === 2 && bijna(binnen.x1 - binnen.x0, (m.b - 2 * m.t) * k, tol) && bijna(binnen.y1 - binnen.y0, (m.h - 2 * m.t) * k, tol),
          `${r.naam}: wand t = ${m.t} mm`);
        const ro = S.kokerRadiusFactor(m.t) * m.t, ri = ro - m.t;
        A = m.b * m.h - (4 - Math.PI) * ro ** 2 - ((m.b - 2 * m.t) * (m.h - 2 * m.t) - (4 - Math.PI) * ri ** 2);
        Ad = (Math.abs(oppervlak(delen[0])) - Math.abs(oppervlak(delen[1]))) / k ** 2;
      } else {
        meld(heeftX(-m.b * k / 2 + m.t * k) && heeftY(m.h * k / 2 - m.t * k), `${r.naam}: dikte t = ${m.t} mm`);
        A = m.t * (m.h + m.b - m.t) + (1 - Math.PI / 4) * m.r ** 2;
        Ad = oppervlak(delen[0]) / k ** 2;
      }
      meld(bijna(Ad, A, A * 0.002), `${r.naam}: getekend oppervlak = oppervlak uit de maten (afrondingen goed om)`, `${Ad.toFixed(1)} ≠ ${A.toFixed(1)} mm²`);
      n++;
    }
  }
  console.log(`  ${n} doorsneden nagemeten`);

  // Tekenschaal: 1:10 is een tiende van ware grootte op papier.
  const v = Y.nieuwSymbool("staal", { x: 0, y: 0 }, stijl, { familie: "HEB", maat: "HEB 240", schaal: "10", hartlijn: "0", label: "0" });
  const t = M.legeTekening("tek1");
  t.elementen.push(v);
  const o = omhulling(leesPad(/<path d="([^"]+)"/.exec(C.schrijfTekening(t, { verborgen: false, kop: "x" }))[1])[0].punten);
  meld(bijna(o.y1 - o.y0, 24 * k, 0.02), "HEB 240 op 1:10: 24 mm op papier", `${((o.y1 - o.y0) / k).toFixed(2)} mm`);
}

// ─────────────────────────────────────────────────────────────────────────
kop("Aanzichten: band, binnenlijnen en lengte");
{
  const stijl = M.STANDAARD_STIJL;
  const k = S.PX_PER_MM / 10; // schaal 1:10
  const uit = (v) => {
    const t = M.legeTekening("tek1");
    t.elementen.push(v);
    return C.schrijfTekening(t, { verborgen: false, kop: "x" });
  };
  let n = 0;
  for (const f of S.FAMILIES) {
    const r = S.profielRij(f, f.standaard);
    const m = r.maten;
    for (const az of ["boven", "zij"]) {
      const L = 300;
      const v = Y.nieuwSymbool("staal", { x1: 0, y1: 0, x2: L, y2: 0 }, stijl, { familie: f.id, maat: f.standaard, schaal: "10", aanzicht: az, hartlijn: "0", label: "0" });
      const code = uit(v);
      const band = (az === "boven" ? m.b : m.h) * k;
      const rect = /<rect x="0" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/.exec(code);
      meld(!!rect && bijna(Number(rect[3]), band, 0.011) && bijna(Number(rect[1]), -band / 2, 0.011) && bijna(Number(rect[2]), L, 0.011),
        `${f.standaard} ${az}: band ${band.toFixed(2)} px over de lengte, om de hartlijn`, rect?.[0]);
      // De binnenlijnen die het hoort te hebben.
      const ys = [...code.matchAll(/<line x1="0" y1="([-\d.]+)" x2="[\d.]+" y2="[-\d.]+"( style="[^"]*")?/g)].map((x) => [Number(x[1]), x[2] ?? ""]);
      const half = band / 2;
      const verwacht =
        f.vorm === "koker" ? [half - m.t * k, -(half - m.t * k)]
        : f.vorm === "hoek" ? [az === "boven" ? -half + m.t * k : half - m.t * k]
        : az === "zij" ? [half - m.tf * k, -(half - m.tf * k)]
        : f.vorm === "u" ? [-half + m.tw * k]
        : [m.tw * k / 2, -m.tw * k / 2];
      const gestreept = f.vorm === "koker" || (f.vorm === "i" && az === "boven");
      meld(ys.length === verwacht.length && verwacht.every((y) => ys.some(([a]) => bijna(a, y, 0.011))),
        `${f.standaard} ${az}: binnenlijnen op de juiste plek`, JSON.stringify(ys));
      meld(ys.every(([, st]) => st.includes("dasharray") === gestreept), `${f.standaard} ${az}: ${gestreept ? "gestreept (erachter)" : "doorgetrokken (zichtbaar)"}`);
      n++;
    }
  }
  console.log(`  ${n} aanzichten nagemeten`);

  // Wisselen in het paneel: van een punt naar twee punten en terug.
  const d = Y.nieuwSymbool("staal", { x: 200, y: 100 }, stijl, { familie: "HEB", maat: "HEB 240" });
  const z = Y.zetOptie(d, "aanzicht", "zij");
  meld(M.plaatsingVan(z) === "lijn" && bijna((z.p.x1.v + z.p.x2.v) / 2, 200, 0.01) && z.p.y1.v === 100, "doorsnede naar zijaanzicht: de band rond dezelfde plek");
  const b = Y.zetOptie(z, "aanzicht", "boven");
  meld(b.p.x1.v === z.p.x1.v && b.p.x2.v === z.p.x2.v, "zij naar boven: de lengte blijft");
  const t = Y.zetOptie(b, "aanzicht", "doorsnede");
  meld(M.plaatsingVan(t) === "punt" && bijna(t.p.x.v, 200, 0.01) && t.p.y.v === 100 && !t.p.x1, "terug naar doorsnede: weer op zijn punt");
  // De lengte in mm: slepen en koppelen.
  const w = Y.getekend(z);
  const met = Y.zetAanzichtLengte(z, { v: 1000 });
  meld(bijna(Math.hypot(met.p.x2.v - met.p.x1.v, met.p.y2.v - met.p.y1.v), 1000 * k, 0.02), "lengte 1000 mm is 1000 mm op schaal", String(w("x2")));
  const gek = Y.zetAanzichtLengte(z, { v: 1000, e: "L" });
  const opgelost = Object.assign((e) => (e === "L" ? 6 : e === "L/(1 mm)" ? 6000 : undefined), { eenheid: (e) => (e === "L" ? true : undefined) });
  const wg = Y.getekend(gek, opgelost);
  meld(bijna(wg("x2") - wg("x1"), 6000 * k, 0.02), "lengte gekoppeld aan L = 6 m: 6000 mm op schaal", String(wg("x2") - wg("x1")));
  const codeG = C.schrijfTekening(Object.assign(M.legeTekening("tek1"), { elementen: [gek] }), { verborgen: false, kop: "x", bekend: opgelost });
  meld(/tek1_\d+ = L\/\(1 mm\)/.test(codeG), "de koppeling rekent verborgen om: L/(1 mm)", codeG.split("\n").slice(0, 6).join(" | "));
  const terugG = C.leesTekening(codeG, "tek1").tekening.elementen[0];
  meld(terugG.p.lengte?.e === "L", "terug uit de code staat er weer L", JSON.stringify(terugG.p.lengte));
  meld(C.schrijfTekening(Object.assign(M.legeTekening("tek1"), { elementen: [terugG] }), { verborgen: false, kop: "x" }) === codeG,
    "ook zonder proef blijft de omrekening staan");
}

// ─────────────────────────────────────────────────────────────────────────
kop("Herbruikbaar: één definitie, meer exemplaren");
{
  const stijl = M.STANDAARD_STIJL;
  const schrijf = (...v) => C.schrijfTekening(Object.assign(M.legeTekening("tek1"), { elementen: v }), { verborgen: false, kop: "x" });
  const tel = (s, re) => (s.match(re) ?? []).length;
  const heb = (x, o = {}) => Y.nieuwSymbool("staal", { x, y: 50 }, stijl, { familie: "HEB", maat: "HEB 240", ...o });

  const twee = schrijf(heb(100), heb(250));
  meld(tel(twee, /<symbol /g) === 1 && tel(twee, /<use /g) === 2, "twee keer HEB 240: één <symbol> en twee <use>", `${tel(twee, /<symbol /g)} en ${tel(twee, /<use /g)}`);
  meld(tel(twee, /<defs>/g) === 1 && twee.indexOf("<defs>") < twee.indexOf("<use "), "de definitie staat in <defs>, vóór de exemplaren");
  meld(/<symbol id="sym-HEB-240-1op10-\w+" overflow="visible">/.test(twee), "een leesbaar id: type, maat en schaal");
  meld(twee.split("\n").length < 20, `zichtbaar korter: ${twee.split("\n").length} regels`);
  meld(!/data-h=|data-tw=/.test(twee), "profielmaten uit de tabel staan niet in elke regel");

  meld(tel(schrijf(heb(100), heb(250, { hoek: "90" })), /<symbol /g) === 1, "draaiing is van het exemplaar: nog steeds één definitie");
  meld(tel(schrijf(heb(100), heb(250, { label: "0" })), /<symbol /g) === 1, "het label staat buiten het symbool");
  meld(tel(schrijf(heb(100), heb(250, { maat: "HEB 300" })), /<symbol /g) === 2, "een andere maat: een eigen definitie");
  meld(tel(schrijf(heb(100), heb(250, { schaal: "20" })), /<symbol /g) === 2, "een andere schaal: een eigen definitie");
  const a = /id="(sym-[^"]+)"/.exec(schrijf(heb(100)))[1];
  const andere = C.schrijfTekening(Object.assign(M.legeTekening("tek7"), { elementen: [heb(400)] }), { verborgen: false, kop: "x" });
  meld(a === /id="(sym-[^"]+)"/.exec(andere)[1], "dezelfde geometrie heeft in elke tekening hetzelfde id");

  // Gekoppeld: het id bevat de waarde, zodat twee bladen niet botsen.
  const g = heb(100);
  g.p.h = { v: 240, e: "h_p" };
  const gekop = schrijf(g, heb(250));
  meld(tel(gekop, /<symbol /g) === 2, "een gekoppelde maat heeft een eigen definitie");
  const idG = /id="(sym-[^"]*\{\{h_p\}\})"/.exec(gekop)?.[1];
  meld(!!idG, "de koppeling staat als {{…}} in het id", gekop.split("\n").find((r) => r.includes("<symbol")));
  const rek = (h) => render(evaluate(parse(`"x\nh_p = ${h}\n${gekop}\n`)));
  const ids = (html) => [...html.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]);
  meld(ids(rek(240))[0] !== ids(rek(400))[0], "twee bladen met een andere waarde: een ander id", `${ids(rek(240))[0]} / ${ids(rek(400))[0]}`);
  meld(ids(rek(240))[0] === ids(rek(240))[0], "dezelfde waarde: hetzelfde id");

  // Op alle gelijke toepassen.
  meld(Y.gelijkSleutel(heb(1)) === Y.gelijkSleutel(heb(2, { hoek: "90", tekst: "x" })), "gelijk: zelfde type en maat, ook gedraaid of met een eigen label");
  meld(Y.gelijkSleutel(heb(1)) !== Y.gelijkSleutel(heb(2, { maat: "HEB 300" })), "niet gelijk: een andere maat");
}

// ─────────────────────────────────────────────────────────────────────────
kop("Heen en terug: van tekening naar code en weer terug");

/** Een tekening met elk symbool, koppelingen aan het blad en tekst met leestekens. */
function proefTekening() {
  const stijl = M.STANDAARD_STIJL;
  const t = M.legeTekening("tek1");
  const zet = (v) => (t.elementen.push(v), v);
  const sym = (s, plek, o) => zet(Y.nieuwSymbool(s, plek, stijl, o));
  const profiel = sym("staal", { x: 80, y: 70 }, { familie: "HEB", maat: "HEB 240", label: "1", hoek: "90", tekst: "{{h_p}}" });
  profiel.p.h = { v: 240, e: "h_p" };
  profiel.p.b = { v: 240, e: "b_p*1" };
  sym("staal", { x: 160, y: 70 }, { familie: "koker", maat: "Koker 200x100x10", spiegel: "1" });
  sym("staal", { x: 220, y: 70 }, { familie: "hoek", maat: "L 150x90x10" });
  sym("staal", { x: 280, y: 70 }, { familie: "UNP", maat: "UNP 200" });
  const hout = sym("hout", { x: 340, y: 70 }, { maat: "71 x 196", tekst: "Balk 1.5 [b; h] 'test'" });
  hout.p.h = { v: 196, e: "h_b" };
  sym("ligger", { x1: 40, y1: 200, x2: 440, y2: 200 });
  sym("oplegging", { x: 40, y: 200 }, { type: "inklemming", hoek: "90" });
  sym("oplegging", { x: 440, y: 200 }, { type: "rol" });
  sym("qlast", { x1: 40, y1: 200, x2: 240, y2: 200 }, { waarde: "q_Ed", trapezium: "1", waarde2: "q_Ed*1.2", naam2: "q.2" });
  sym("puntlast", { x: 300, y: 200 }, { waarde: "F_Ed", hoek: "45" });
  sym("moment", { x: 380, y: 200 }, { waarde: "12,5", richting: "linksom" });
  sym("scharnier", { x: 240, y: 200 });
  sym("veren", { x1: 40, y1: 250, x2: 440, y2: 250 }, { aantal: "7", spiegel: "1" });
  const wv = sym("windverband", { x: 20, y: 260, w: 100, h: 50 }, { type: "enkel" });
  wv.p.w = { v: 100, e: "L*10" };
  sym("stramien", { x1: 200, y1: 260, x2: 200, y2: 310 }, { label: "A.1", bollen: "beide" });
  sym("peil", { x: 300, y: 300 }, { tekst: "P = {{z_vl}} m" });
  sym("paalpunt", { x: 380, y: 300 }, { niveau: "z_pp", ref: "NAP" });
  zet(M.nieuweVorm("boog", { cx: 100, cy: 100, r: 30, a1: 200, a2: 20 }, stijl));
  const l = zet(M.nieuweVorm("lijn", { x1: 10, y1: 10, x2: 100, y2: 10 }, stijl));
  l.p.x2 = { v: 100, e: "L*10" };
  zet(M.nieuweVorm("maat", { x1: 40, y1: 240, x2: 440, y2: 240, offset: 30 }, stijl, { tekst: "L = {{L}} m", o: { gat: "6" } }));
  // Een tweede dezelfde HEB, en profielen in aanzicht.
  sym("staal", { x: 400, y: 70 }, { familie: "HEB", maat: "HEB 240", label: "1", hoek: "90", tekst: "{{h_p}}" }).p.h = { v: 240, e: "h_p" };
  const az = sym("staal", { x1: 20, y1: 130, x2: 300, y2: 130 }, { familie: "IPE", maat: "IPE 300", schaal: "20", aanzicht: "zij" });
  az.p.lengte = { v: 1, e: "L*1000" };
  sym("staal", { x1: 20, y1: 160, x2: 300, y2: 160 }, { familie: "koker", maat: "K100/5", schaal: "20", aanzicht: "boven" });
  zet(M.nieuweVorm("tekst", { x: 10, y: 300 }, stijl, { tekst: "a.b en [1; 2]" }));
  return t;
}

/** Wat ertoe doet van een vorm, zonder het id. */
/** Een gekoppelde maat bewaart alleen zijn koppeling: zijn getal komt na het lezen weer uit het blad. */
const kern = (el) => (el.soort === "vast" ? { soort: "vast", markup: el.markup } : {
  soort: el.soort, sym: el.sym, o: el.o,
  p: Object.fromEntries(Object.entries(el.p).sort(([x], [y]) => x.localeCompare(y)).map(([k, m]) => [k, m.e ? { e: m.e } : { v: m.v }])),
  lijn: el.lijn, dikte: el.soort === "tekst" ? undefined : el.dikte, vulling: el.vulling, streep: el.streep, grootte: el.grootte,
  tekst: el.tekst, gesloten: el.gesloten, tik: el.tik,
});

const t0 = proefTekening();
const code1 = C.schrijfTekening(t0, { verborgen: false, kop: "Tekening tek1" });
const uit = C.leesTekening(code1, "tek9");
meld(!("fout" in uit), "het blok is te lezen");
const t1 = uit.tekening;
meld(t1.elementen.length === t0.elementen.length, `${t0.elementen.length} elementen terug`, `${t1.elementen.length}`);
meld(t1.elementen.every((e) => e.soort !== "vast"), "geen element blijft als onbekend staan",
  t1.elementen.filter((e) => e.soort === "vast").map((e) => e.markup.slice(0, 80)).join("\n         "));
t0.elementen.forEach((e, i) => {
  const a = JSON.stringify(kern(e)), b = JSON.stringify(kern(t1.elementen[i] ?? {}));
  meld(a === b, `${e.sym ?? e.soort}: zelfde parameters terug`, `${a}\n         ${b}`);
});
const code2 = C.schrijfTekening(t1, { verborgen: false, kop: "Tekening tek1" });
meld(code1 === code2, "opnieuw geschreven is de code gelijk");
meld(!/NaN|undefined|Infinity/.test(code1), "geen NaN, undefined of Infinity in de code");
meld(!/data-[a-z0-9]+="[^"]*[.'\[\]][^"]*"/.test(code1.replace(/\d\.\d/g, "")), "keuzes en teksten zonder losse . ' [ ] (tekenverwijzingen)");

// Een q-last met een gekoppeld eindpunt: na het lezen telt de waarde uit het blad voor het aantal pijlen.
{
  const t = M.legeTekening("tek3");
  const q = Y.nieuwSymbool("qlast", { x1: 0, y1: 100, x2: 300, y2: 100 }, M.STANDAARD_STIJL, {});
  q.p.x2 = { v: 300, e: "L*50" };
  t.elementen.push(q);
  const pijlen = (s) => (s.match(/ h -?[\d.]+ Z/g) ?? []).length;
  const a = C.schrijfTekening(t, { verborgen: false, kop: "x" });
  const terug = C.leesTekening(a, "tek3").tekening;
  const b = C.schrijfTekening(terug, { verborgen: false, kop: "x", bekend: (e) => (e === "L*50" ? 300 : undefined) });
  meld(pijlen(a) === pijlen(b) && pijlen(a) > 5, `q-last met gekoppelde lengte: ${pijlen(a)} pijlen, ook na opnieuw openen`, `${pijlen(b)}`);
}

// Een gewone tekening (zonder symbolen) blijft zoals hij was.
{
  const stijl = M.STANDAARD_STIJL;
  const t = M.legeTekening("tek2");
  t.elementen.push(M.nieuweVorm("rechthoek", { x: 10, y: 10, w: 50, h: 30 }, stijl));
  t.elementen.push(M.nieuweVorm("pijl", { x1: 10, y1: 80, x2: 90, y2: 80 }, stijl));
  t.elementen.push(M.nieuweVorm("polylijn", { x0: 0, y0: 0, x1: 20, y1: 30, x2: 40, y2: 0 }, stijl));
  const a = C.schrijfTekening(t, { verborgen: false, kop: "x" });
  const b = C.schrijfTekening(C.leesTekening(a, "tek2").tekening, { verborgen: false, kop: "x" });
  meld(a === b, "een tekening zonder symbolen blijft letter voor letter gelijk");
}

// ─────────────────────────────────────────────────────────────────────────
kop("Oude vorm: bestaande blokken lezen nog");
{
  const oud = `@svg
<svg data-tekening="tek1" viewBox="0 0 480 320" xmlns="http://www.w3.org/2000/svg" style="width:100%; max-width:480px;">
  <g data-symbool="staal" data-x="100" data-y="100" data-h="240" data-b="240" data-tw="10" data-tf="17" data-r="21" data-familie="HEB" data-maat="HEB 240" data-schaal="10" data-hoek="90" data-spiegel="0" data-hartlijn="1" data-label="1" data-tekst="" font-size="12" style="fill:#1F2937; stroke:#1F2937; stroke-width:2">
    <g transform="translate(100 100)">
      <path d="M -45.35 -45.35 H 45.35 Z" style="fill:#1F2937; stroke:none"/>
    </g>
    <text x="100" y="38.04" text-anchor="middle" style="fill:#1F2937; stroke:none">HEB 240</text>
  </g>
  <g data-symbool="qlast" data-x1="40" data-y1="200" data-x2="400" data-y2="200" data-naam="q" data-waarde="q_Ed" data-eenheid="kN&#47;m" data-hoogte="24" data-trapezium="0" data-naam2="q" data-waarde2="" data-hoogte2="36" data-spiegel="0" font-size="12" style="fill:none; stroke:#1F2937; stroke-width:1">
    <g transform="translate(40 200)"><line x1="0" y1="-26.5" x2="360" y2="-26.5"/></g>
  </g>
  <g data-vorm="maat">
    <line x1="60" y1="222" x2="420" y2="222" style="stroke:#1F2937; stroke-width:1"/>
    <line x1="-4" y1="4" x2="4" y2="-4" transform="matrix(1 0 0 1 60 222)" style="stroke:#1F2937; stroke-width:1"/>
    <line x1="-4" y1="4" x2="4" y2="-4" transform="matrix(1 0 0 1 420 222)" style="stroke:#1F2937; stroke-width:1"/>
    <text y="-5" text-anchor="middle" font-size="12" transform="matrix(1 0 0 1 240 222)" style="fill:#1F2937">L = {{L}} m</text>
  </g>
</svg>
@end`;
  const t = C.leesTekening(oud, "tek9").tekening;
  const [st, q, ma] = t.elementen;
  meld(t.elementen.length === 3, "drie elementen", String(t.elementen.length));
  meld(st?.sym === "staal" && st.o.maat === "HEB 240" && st.o.hoek === "90" && st.p.x.v === 100 && st.p.tf.v === 17, "<g data-symbool> leest als bewerkbaar profiel");
  meld(q?.sym === "qlast" && q.o.waarde === "q_Ed" && q.p.x2.v === 400, "een oude q-last leest met zijn waarde");
  meld(ma?.soort === "maat" && ma.tik === true && !ma.p.offset && ma.tekst === "L = {{L}} m" && ma.lijn === "#1F2937", "een maat zonder afstand leest als oude tik-maat");
  const nieuw = C.schrijfTekening(t, { verborgen: false, kop: "x" });
  meld(!/<g data-symbool/.test(nieuw) && (nieuw.match(/<use /g) ?? []).length === 2, "bij opslaan worden symbolen <use>");
  meld(/<g data-vorm="maat">/.test(nieuw) && !/data-offset/.test(nieuw) && /x1="-4" y1="4"/.test(nieuw), "de oude maat houdt zijn tik: de tekening verspringt niet");
  const w = (k) => ma.p[k]?.v ?? 0;
  const gesleept = M.sleepGreep(ma, "2", 440, 222, w);
  meld(!gesleept.tik && gesleept.p.offset?.v === 0 && gesleept.p.x2.v === 440, "wijzig je de maat, dan krijgt hij de nieuwe vorm op afstand 0");
  meld(C.schrijfTekening(C.leesTekening(nieuw, "tek9").tekening, { verborgen: false, kop: "x" }) === nieuw, "na het omzetten is de code stabiel");
}

// ─────────────────────────────────────────────────────────────────────────
kop("Maatlijn: afstand, hulplijnen, rondjes, kleur en tekst");
{
  const stijl = M.STANDAARD_STIJL;
  const maak = (p, o = {}) => M.nieuweVorm("maat", p, stijl, { tekst: "L", ...o });
  const schrijf = (...v) => C.schrijfTekening(Object.assign(M.legeTekening("tek1"), { elementen: v }), { verborgen: false, kop: "x" });
  const v = maak({ x1: 60, y1: 100, x2: 420, y2: 100, offset: 40 }, { o: { gat: "22" } });
  meld(v.lijn === M.MAATKLEUR && M.MAATKLEUR === "#1E3A8A", "standaard een eigen donkerblauwe kleur, los van het lint");
  const code = schrijf(v);
  meld(code.includes(`stroke:${M.MAATKLEUR}`) && code.includes(`fill:${M.MAATKLEUR}`) && !/var\(--/.test(code), "de kleur staat vast in de SVG, geen thema-variabele");
  const groep = /<g data-vorm="maat"[\s\S]*?<\/g>/.exec(code)?.[0] ?? "";
  meld(/data-offset="40"/.test(groep) && /data-gat="22"/.test(groep), "afstand en gat staan in de data-attributen");
  meld(/transform="matrix\(1 0 0 1 60 100\)"/.test(groep), "hij staat op het eerste gemeten punt");
  meld(/<line x1="0" y1="22" x2="0" y2="43"/.test(groep) && /<line x1="360" y1="22" x2="360" y2="43"/.test(groep), "hulplijnen: gat bij de constructie, stukje voorbij de maatlijn");
  meld(/<line x1="0" y1="40" x2="360" y2="40"\/>/.test(groep), "de maatlijn op zijn afstand");
  meld((groep.match(/<circle cx="(0|360)" cy="40"/g) ?? []).length === 2 && !/x1="-4"/.test(groep), "rondjes op de kruisingen, geen schuine tik");
  const ty = Number(/<text x="180" y="([\d.]+)"/.exec(groep)?.[1]);
  meld(ty > 40, "de tekst staat midden op de maatlijn, aan de buitenkant", String(ty));
  const boven = maak({ x1: 60, y1: 100, x2: 420, y2: 100, offset: -30 });
  meld(Number(/<text x="180" y="(-?[\d.]+)"/.exec(schrijf(boven))?.[1]) < -30, "boven de constructie staat de tekst boven de lijn");
  const verticaal = schrijf(maak({ x1: 50, y1: 200, x2: 50, y2: 100, offset: 30 }));
  meld(/matrix\(0 -1 1 0 50 200\)/.test(verticaal), "een verticale maat leest mee (van onder naar boven)", /matrix\([^)]*\)/.exec(verticaal)?.[0]);

  // Heen en terug.
  const t2 = C.leesTekening(code, "tek1").tekening.elementen[0];
  meld(t2.soort === "maat" && !t2.tik && t2.p.offset.v === 40 && t2.o?.gat === "22" && t2.lijn === M.MAATKLEUR && t2.tekst === "L" && t2.p.x2.v === 420 && t2.grootte === 12, "heen en terug met afstand, gat, kleur en tekst", JSON.stringify(t2));
  meld(schrijf(t2) === code, "opnieuw geschreven letter voor letter gelijk");
  // Een eigen kleur en een bladvariabele.
  const eigen = schrijf({ ...maak({ x1: 0, y1: 0, x2: 100, y2: 0, offset: 20 }, { tekst: "L = {{L}} m" }), lijn: "#7C2D12" });
  meld(eigen.includes("stroke:#7C2D12") && eigen.includes("L = {{L}} m"), "kleur per maat aan te passen, en een bladvariabele in de tekst");

  // De greep op de maatlijn.
  const w = (k) => v.p[k]?.v ?? 0;
  const gr = M.grepen(v, w).find((g) => g.k === "o");
  meld(gr && gr.x === 240 && gr.y === 140, "een greep midden op de maatlijn", JSON.stringify(gr));
  const gesleept = M.sleepGreep(v, "o", 240, 170, w);
  meld(gesleept.p.offset.v === 70 && gesleept.p.x1.v === 60, "slepen aan die greep zet de afstand");
  meld(M.sleutels(v).includes("offset"), "de afstand staat als getal in het paneel");
}

// ─────────────────────────────────────────────────────────────────────────
kop("Commando's: typen en bewerken");
{
  for (const [t, naam] of [["m", "move"], ["move", "move"], ["co", "copy"], ["COPY", "copy"], ["ro", "rotate"], ["mi", "mirror"], ["sc", "scale"], ["ar", "array"], ["e", "erase"], ["erase", "erase"]]) {
    meld(K.commandoVan(t) === naam, `${t} is ${naam}`);
  }
  meld(K.commandoVan("xyz") === null, "een onbekend woord is geen commando");
  const basis = { x: 10, y: 20 };
  const doel = (s, muis = { x: 200, y: 30 }, ortho = false) => K.doelVan(K.leesInvoer(s), basis, muis, ortho);
  const pt = (p, x, y) => p && bijna(p.x, x, 1e-6) && bijna(p.y, y, 1e-6);
  meld(pt(doel("100,0"), 110, 20), "100,0 is een verschuiving");
  meld(pt(doel("@100,-5"), 110, 15), "@100,-5 ook");
  meld(pt(doel("=300,400"), 300, 400), "=300,400 is een absolute plek");
  meld(pt(doel("50<90"), 10, 70), "50<90 is een afstand onder een hoek");
  meld(pt(doel("100", { x: 200, y: 30 }, true), 110, 20), "één getal: afstand in de ortho-richting (horizontaal)");
  meld(pt(doel("100", { x: 12, y: 300 }, true), 10, 120), "één getal: afstand in de ortho-richting (verticaal)");
  meld(K.leesInvoer("abc").soort === "fout" && K.leesInvoer("").soort === "leeg", "onzin en leeg worden herkend");
  meld(K.leesGetal("1,5") === 1.5 && K.leesGetal("90") === 90 && K.leesGetal("x") === null, "een los getal mag met een komma");

  const stijl = M.STANDAARD_STIJL;
  const w = (v) => Y.getekend(v);
  const toe = (v, om) => B.pasToe(v, om, w(v));
  const lijn = M.nieuweVorm("lijn", { x1: 0, y1: 0, x2: 100, y2: 0 }, stijl);
  const d = toe(lijn, B.draaiing({ x: 0, y: 0 }, 90));
  meld(bijna(d.p.x2.v, 0, 0.01) && bijna(d.p.y2.v, 100, 0.01), "lijn: 90° met de klok mee om het basispunt");
  const sp = toe(lijn, B.spiegeling({ x: 50, y: -10 }, { x: 50, y: 10 }));
  meld(sp.p.x1.v === 100 && sp.p.x2.v === 0, "lijn: spiegelen om een verticale as");
  const sc = toe(lijn, B.schaling({ x: 0, y: 0 }, 2));
  meld(sc.p.x2.v === 200, "lijn: schalen");
  const gek = M.nieuweVorm("lijn", { x1: 0, y1: 0, x2: 100, y2: 0 }, stijl);
  gek.p.x2 = { v: 100, e: "L" };
  meld(toe(gek, B.verplaatsing(5, 0)).p.x2.e === "L", "een gekoppelde maat blijft gekoppeld");

  const rh = M.nieuweVorm("rechthoek", { x: 0, y: 0, w: 40, h: 20 }, stijl);
  const rh90 = toe(rh, B.draaiing({ x: 0, y: 0 }, 90));
  meld(rh90.soort === "rechthoek" && rh90.p.w.v === 20 && rh90.p.h.v === 40 && rh90.p.x.v === -20, "rechthoek 90°: blijft een rechthoek");
  const rh45 = toe(rh, B.draaiing({ x: 0, y: 0 }, 45));
  meld(rh45.soort === "polylijn" && rh45.gesloten && rh45.p.x3, "rechthoek 45°: wordt een gesloten polylijn");
  const ci = toe(M.nieuweVorm("cirkel", { cx: 10, cy: 0, r: 5 }, stijl), B.schaling({ x: 0, y: 0 }, 3));
  meld(ci.p.cx.v === 30 && ci.p.r.v === 15, "cirkel: schalen");
  const bo = toe(M.nieuweVorm("boog", { cx: 0, cy: 0, r: 10, a1: 180, a2: 270 }, stijl), B.draaiing({ x: 0, y: 0 }, 90));
  meld(bo.p.a1.v === 270 && bo.p.a2.v === 0, "boog: de hoeken draaien mee");
  const bs = toe(M.nieuweVorm("boog", { cx: 0, cy: 0, r: 10, a1: 180, a2: 270 }, stijl), B.spiegeling({ x: 0, y: -1 }, { x: 0, y: 1 }));
  meld(bs.p.a1.v === 270 && bs.p.a2.v === 0, "boog: spiegelen keert begin en eind om", JSON.stringify(bs.p));

  const heb = Y.nieuwSymbool("staal", { x: 100, y: 0 }, stijl, { familie: "HEB", maat: "HEB 240" });
  const h1 = toe(heb, B.draaiing({ x: 0, y: 0 }, 90));
  meld(bijna(h1.p.x.v, 0, 0.01) && bijna(h1.p.y.v, 100, 0.01) && h1.o.hoek === "90", "profiel: de plek draait om het basispunt en de hoek gaat mee");
  const h2 = toe(heb, B.spiegeling({ x: 50, y: 0 }, { x: 50, y: 10 }));
  meld(bijna(h2.p.x.v, 0, 0.01) && h2.o.spiegel === "1", "profiel: spiegelen zet hem aan de overkant, gespiegeld");
  const h3 = toe(heb, B.schaling({ x: 0, y: 0 }, 2));
  meld(h3.p.x.v === 200 && h3.o.schaal === "5" && h3.p.h.v === 240, "profiel: schalen gaat via de tekenschaal, de maat blijft");
  const q = Y.nieuwSymbool("qlast", { x1: 0, y1: 0, x2: 100, y2: 0 }, stijl, { trapezium: "1", waarde: "1", waarde2: "2" });
  const q2 = toe(q, B.spiegeling({ x: 50, y: 0 }, { x: 50, y: 1 }));
  meld(q2.p.x1.v === 0 && q2.p.x2.v === 100 && q2.o.waarde === "2" && q2.o.waarde2 === "1", "q-last: spiegelen houdt hem aan dezelfde kant, de waarden wisselen");
  const ma = M.nieuweVorm("maat", { x1: 0, y1: 0, x2: 100, y2: 0, offset: 30 }, stijl, { tekst: "L" });
  const ma2 = toe(ma, B.spiegeling({ x: 0, y: 50 }, { x: 10, y: 50 }));
  meld(ma2.p.x1.v === 100 && ma2.p.y1.v === 100 && ma2.p.offset.v === 30, "maatlijn: spiegelen houdt hem leesbaar");

  // Een lopend commando: de reeks in het voorbeeld.
  const oms = K.omzettingen({ naam: "array", stap: "doel", basis: { x: 0, y: 0 }, aantal: 4 }, { x: 90, y: 0 });
  meld(oms.length === 3 && pt(oms[2].punt({ x: 0, y: 0 }), 90, 0) && pt(oms[0].punt({ x: 0, y: 0 }), 30, 0), "reeks van 4: drie kopieën gelijk verdeeld tot het laatste punt");
  const om = K.omzettingen({ naam: "scale", stap: "factor", basis: { x: 0, y: 0 }, ref: 50 }, { x: 100, y: 0 });
  meld(om.length === 1 && om[0].factor === 2, "schalen met de muis: twee keer de referentie is factor 2");
}

// ─────────────────────────────────────────────────────────────────────────
kop("Rekenkern: het blok gaat ongeschonden door parse/evaluate/render");
{
  const blad = [
    '"Proef tekening',
    "h_p = 240",
    "b_p = 240",
    "h_b = 196",
    "L = 6",
    "q_Ed = 12.5",
    "F_Ed = 30",
    "z_vl = 2.75",
    "z_pp = -14",
    code1,
    "'Na de tekening",
  ].join("\n");
  const html = render(evaluate(parse(blad)));
  const svgIn = code1.split("\n").slice(code1.split("\n").indexOf("@svg") + 1, -1).join("\n");
  const begin = html.indexOf('<div class="calc-svg">');
  const svgUit = begin >= 0 ? html.slice(begin + 22, html.indexOf("</svg>", begin) + 6) : "";
  meld(svgUit.length > 0, "de tekening staat in de uitwerking");
  const patroon = new RegExp(
    "^" + svgIn.split(/\{\{\w+\}\}/).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("(-?\\d+(?:\\.\\d+)?(?:e[-+]?\\d+)?)") + "$",
  );
  const treffer = patroon.exec(svgUit);
  meld(!!treffer, "alleen {{…}} is vervangen, verder is het blok letter voor letter gelijk", (() => {
    const a = svgIn.split("\n"), b = svgUit.split("\n");
    const i = a.findIndex((r, j) => !new RegExp("^" + r.split(/\{\{\w+\}\}/).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[-0-9.e]+") + "$").test(b[j] ?? ""));
    return i < 0 ? "" : `regel ${i + 1}:\n         in:  ${a[i]}\n         uit: ${b[i]}`;
  })());
  meld(!/\{\{|NaN/.test(svgUit), "geen {{…}} of NaN over in de uitwerking");

  const zichtbaar = ontcijfer(svgUit.replace(/<[^>]+>/g, "\n"));
  for (const tekst of ["q = 12.5 kN/m", "q.2 = 15 kN/m", "F = 30 kN", "M = 12,5 kNm", "A.1", "P = 2.75 m", "Paalpuntniveau: NAP -14 m", "Balk 1.5 [b; h] 'test'", "a.b en [1; 2]", "L = 6 m", "240"]) {
    meld(zichtbaar.includes(tekst), `tekst in de uitwerking: ${tekst}`);
  }
  // De koppeling rekent mee: h_p = 240 op 1:10 is 90,71 px; gedraaid is dat de breedte.
  meld(/data-h="240"/.test(svgUit) && /H 45\.35|-45\.35/.test(svgUit), "het gekoppelde profiel krijgt zijn maat uit het blad (h_p = 240)");
  // Elke <use> heeft zijn <symbol>: een lege <use> mag nergens voorkomen.
  const symbolen = new Set([...svgUit.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
  const verwijzingen = [...svgUit.matchAll(/<use href="#([^"]+)"/g)].map((m) => m[1]);
  meld(verwijzingen.length > 0 && verwijzingen.every((id) => symbolen.has(id)), `${verwijzingen.length} keer <use>, elk met een <symbol>`, verwijzingen.filter((id) => !symbolen.has(id)).join(", "));
  meld(/href="#/.test(svgUit) && /<defs>/.test(svgUit), "href, # en <defs> blijven staan");
  meld([...symbolen].every((id) => /^[-\w.]+$/.test(id)), "elk id blijft één woord na het invullen", [...symbolen].join(", "));

  // Een maat met eenheid in een formule: geen NaN.
  const eenheid = Object.assign(() => undefined, { eenheid: (e) => e === "h_e" || e === "L_e" });
  const tk = Object.assign(M.legeTekening("tek1"), { elementen: [Y.nieuwSymbool("staal", { x: 100, y: 100 }, M.STANDAARD_STIJL, { familie: "HEB", maat: "HEB 240" })] });
  tk.elementen[0].p.h = { v: 240, e: "h_e" };
  const az = Y.nieuwSymbool("staal", { x1: 0, y1: 200, x2: 100, y2: 200 }, M.STANDAARD_STIJL, { familie: "IPE", maat: "IPE 300", schaal: "50", aanzicht: "zij" });
  az.p.lengte = { v: 1, e: "L_e" };
  tk.elementen.push(az);
  const metE = C.schrijfTekening(tk, { verborgen: false, kop: "x", bekend: eenheid });
  const uitE = render(evaluate(parse(`"x\nh_e = 24 cm\nL_e = 6 m\n${metE}\n`)));
  const i = uitE.indexOf('<div class="calc-svg">');
  const svgE = uitE.slice(i, uitE.indexOf("</svg>", i));
  meld(i >= 0 && !/NaN|\{\{/.test(svgE), "een koppeling met eenheid (24 cm, 6 m): geen NaN in de tekening", svgE.split("\n").find((r) => /NaN|\{\{/.test(r)));
  meld(/data-h="240"/.test(svgE), "h = 24 cm is 240 mm");
  meld(/data-lengte="6000"/.test(svgE) && /width="453\.5/.test(svgE), "L = 6 m is 6000 mm, 453,5 px op 1:50", /<rect [^>]*>/.exec(svgE)?.[0]);
  meld(/x2="60"/.test(svgUit) && /width="60"/.test(svgUit), "een gekoppelde maat (L*10, L = 6) staat als getal in de tekening");
}

console.log(`\n${goed} controles goed, ${fouten} fout.`);
process.exit(fouten === 0 ? 0 : 1);
