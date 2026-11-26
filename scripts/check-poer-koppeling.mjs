/**
 * Controle van de koppeling van de poerbladen met een palenplan en van de revisies van het
 * wapeningsdetail: packages/desktop/src/components/calc/palenplan.ts, poerRevisie.ts, de
 * koppeling in poerIfcx.ts en meerpaalIfcx.ts, en store/projectIfcx.ts.
 *
 * De proef is een klein, verzonnen palenplan (scripts/lib/palenplan-proef.mjs, als bestand
 * scripts/fixtures/palenplan-proef.ifcx) met twee poeren:
 *   P1  vier palen 320 × 320 h.o.h. 1000 × 1000, poer 1700 × 1700 × 900, hart (6000, 4000),
 *       onderkant −1200, paalkop 50 in de poer, kolom 400 × 400, N_Ed = 1800, N_fr = 1300 kN;
 *   P2  drie ronde palen Ø360, driehoek h.o.h. 1200, rand 400, hart (12000, 4000), 30°
 *       gedraaid, kolom 400 × 400.
 *
 *   1. Het plan: geldig IFCX, het bestand gelijk aan de bouwer, de lezer zonder meldingen.
 *   2. Wat het blad overneemt: per poer het blad en de invoer, de palen in de volgorde van
 *      de definitie, de plaats en de draaiing (met de hand nagerekend, hieronder).
 *   3. De bladen rekenen met die invoer door en voldoen; de palen van de poer in de IFCX
 *      staan, teruggezet in het plan, op de palen van het plan, met hun ids.
 *   4. Revisies: een eerste revisie, vastleggen, een wijziging van de wapening geeft een
 *      nieuwe revisie met de lijst van wat er veranderde, terug naar dezelfde inhoud geeft
 *      geen nieuwe; het nummer in de titel van het DXF en in de IFCX.
 *   5. Een gewijzigd palenplan: het blad ziet wat er in het plan veranderde, en na het
 *      overnemen is er een nieuwe revisie.
 *   6. Het projectbestand: beide poeren met hun id, revisie en plaats; de STEP.
 *   7. Wat niet past: vijf palen, een kolom uit het midden, ongelijke palen, een leeg
 *      document; de tweepaalspoer uit een plan.
 *
 * Handberekening (mm, graden):
 *   P1  palen op (5500; 3500), (6500; 3500), (6500; 4500), (5500; 4500); het midden is
 *       (6000; 4000), dus a_x = a_y = 1000; het grondvlak 1700 × 1700; h = −300 − (−1200) = 900;
 *       t_in = −1150 − (−1200) = 50. De volgorde van de definitie (−,−), (+,−), (+,+), (−,+)
 *       geeft P1-1, P1-2, P1-3, P1-4. Recht: plan_hoek = 0.
 *   P2  R = 1200/√3 = 692,82; de palen op 120°, 240° en 0° (90° + 30° enz.):
 *       (12000 − 346,41; 4000 + 600), (12000 − 346,41; 4000 − 600), (12000 + 692,82; 4000);
 *       onderling 1200 uit elkaar. De paal het dichtst bij 90° is die op 120°: plan_hoek = 30.
 *       De rand: de afstand van een paalhart tot de rand, 400. Rond: de omgeschreven
 *       cirkel van de 16-hoek, Ø360.
 *   Teruggezet: een paal van de definitie op (x, y) komt in het plan op
 *       (x·cos h − y·sin h + 12000, x·sin h + y·cos h + 4000); paal 1 op (0; 692,82) geeft
 *       (−346,41 + 12000; 600 + 4000): de eerste paal van het plan.
 *
 * Draaien:  node scripts/check-poer-koppeling.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse, evaluate, render, leesIfcx } from "../packages/core/dist/index.js";
import { laadTemplate } from "./lib/refcheck.mjs";
import { afwijkingen } from "./lib/ifcx-specificatie.mjs";
import { palenplanProef } from "./lib/palenplan-proef.mjs";

const { leesResultaat, leesGetallen } = await import("../packages/desktop/src/components/calc/bladLezen.ts");
const { leesPalenplan, vergelijkMetPlan, leesKoppeling, koppelingVoorIfcx, planInhoud, PLAN_VELD } = await import("../packages/desktop/src/components/calc/palenplan.ts");
const { revisieInhoud, leesRevisie, huidigeRevisie, vastleggen, verschil, REVISIE_VELD } = await import("../packages/desktop/src/components/calc/poerRevisie.ts");
const { maakMeerpaalPoer } = await import("../packages/desktop/src/components/calc/meerpaalDefinitie.ts");
const { maakPoer } = await import("../packages/desktop/src/components/calc/poerDefinitie.ts");
const { meerpaalVorm, tweepaalVorm, maakDetail, detailNaarDxf } = await import("../packages/desktop/src/components/calc/poerDxf.ts");
const { meerpaalIfcxDocument } = await import("../packages/desktop/src/components/calc/meerpaalIfcx.ts");
const { poerIfcxDocument } = await import("../packages/desktop/src/components/calc/poerIfcx.ts");
const { projectIfcx, projectStep } = await import("../packages/desktop/src/store/projectIfcx.ts");

let fouten = 0;
let getest = 0;
const waar = (wat, ok, detail = "") => {
  getest++;
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${wat}${ok || !detail ? "" : ` — ${detail}`}`);
};
const dichtbij = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
const SCOPE = { CC: 2, RC: 2, K_FI: 1, DesignLife: 50, rekenwijze: 1 };
const MEER = laadTemplate("meerpaalspoer.ts");
const TWEE = laadTemplate("tweepaalspoer.ts");
function doorreken(bron, waarden) {
  const nodes = evaluate(parse(bron), waarden, SCOPE);
  const tekst = render(nodes).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return { uit: leesGetallen(nodes), r: leesResultaat(nodes, "x"), tekst };
}
/** Zoals het blad een waarde leest: de invoer, anders de beginwaarde van het blad. */
const BEGIN = { n_p: 4, a_x: 1000, a_y: 1000, l_poer: 1700, b_poer: 1700, a_3: 1200, r_rand: 400, h_poer: 900, e_p: 50, t_in: 50,
  paalvorm: 1, p_x: 320, p_y: 320, kolomvorm: 1, c_x: 400, c_y: 400, c_o: 75, c_z: 40, n_t: 5, d_t: 20, s_t: 80, vorm_t: 2, l_op: 500, D_m: 200,
  d_n: 12, s_n: 150, n_z: 3, d_z: 12 };
const lees = (w) => (naam) => {
  const v = parseFloat(String(w[naam] ?? "").replace(",", "."));
  return Number.isFinite(v) ? v : (BEGIN[naam] ?? 0);
};
const vormVan = (w) => meerpaalVorm(maakMeerpaalPoer(lees(w)));

// ── 1. Het plan ──────────────────────────────────────────────────────────────
console.log("\n1. Het palenplan");
const planDoc = palenplanProef();
const bestand = JSON.parse(readFileSync(fileURLToPath(new URL("./fixtures/palenplan-proef.ifcx", import.meta.url)), "utf8"));
waar("scripts/fixtures/palenplan-proef.ifcx is wat de bouwer maakt", JSON.stringify(bestand) === JSON.stringify(planDoc));
const fout = afwijkingen(JSON.parse(JSON.stringify(planDoc)));
waar("het plan is geldig volgens de specificatie", fout.length === 0, fout.slice(0, 3).join(" | "));
const plan = leesPalenplan(planDoc);
waar("twee poeren, P1 en P2, zonder meldingen", plan.poeren.map((p) => p.id).join() === "P1,P2" && plan.meldingen.length === 0 && plan.poeren.every((p) => p.meldingen.length === 0),
  JSON.stringify([plan.meldingen, ...plan.poeren.map((p) => p.meldingen)]));
const [P1, P2] = plan.poeren;

// ── 2. Wat het blad overneemt ────────────────────────────────────────────────
console.log("\n2. Wat het blad overneemt");
const verwacht1 = { n_p: "4", a_x: "1000", a_y: "1000", l_poer: "1700", b_poer: "1700", h_poer: "900", paalvorm: "1", p_x: "320", p_y: "320", t_in: "50",
  kolomvorm: "1", c_x: "400", c_y: "400", N_Ed: "1800", N_fr: "1300", poer_id: "P1", paal_ids: "P1-1;P1-2;P1-3;P1-4", plan_x: "6000", plan_y: "4000", plan_z: "-1200", plan_hoek: "0" };
const verwacht2 = { n_p: "3", a_3: "1200", r_rand: "400", h_poer: "900", paalvorm: "2", p_x: "360", t_in: "50", kolomvorm: "1", c_x: "400", c_y: "400",
  poer_id: "P2", paal_ids: "P2-1;P2-2;P2-3", plan_x: "12000", plan_y: "4000", plan_z: "-1200", plan_hoek: "30" };
for (const [p, verwacht] of [[P1, verwacht1], [P2, verwacht2]]) {
  const mis = Object.entries(verwacht).filter(([k, v]) => p.waarden[k] !== v);
  waar(`${p.id}: blad ${p.templateId}, invoer zoals met de hand bepaald`, p.templateId === "meerpaalspoer" && mis.length === 0, mis.map(([k, v]) => `${k} ${p.waarden[k]} ≠ ${v}`).join(", "));
  waar(`${p.id}: geen invoer die het plan niet kent (de wapening en de lasten zonder attribuut blijven van het blad)`, !("n_t" in p.waarden) && !("d_t" in p.waarden) && (p.id === "P1" || !("N_Ed" in p.waarden)));
  waar(`${p.id}: de inhoud van het plan staat bij de waarden`, p.waarden[PLAN_VELD.inhoud] === planInhoud(Object.fromEntries(Object.entries(p.waarden).filter(([k]) => !k.startsWith("plan_") && k !== "poer_id" && k !== "paal_ids")), p.paalIds));
}

// ── 3. Doorrekenen en terugzetten ────────────────────────────────────────────
console.log("\n3. De bladen rekenen door; de palen staan terug op het plan");
for (const p of [P1, P2]) {
  const w = { ...p.waarden, horiz: "1" };
  const blad = doorreken(MEER, w);
  waar(`${p.id}: het blad rekent met de invoer uit het plan en voldoet (UC ${blad.uit.UC_max})`, blad.r.voldoet === true && blad.r.uc !== null, JSON.stringify(blad.r));
  if (p.id === "P1") waar("P1: de kolomlast uit het plan: N_Ed = 1800 kN, R_Ed kleiner dan bij 2000", dichtbij(blad.uit.N_tot, 1800 + 1.35 * 25 * 1.7 * 1.7 * 0.9, 1e-6), String(blad.uit.N_tot));
  const m = maakMeerpaalPoer(lees(w));
  const k = koppelingVoorIfcx(w, 1);
  const doc = meerpaalIfcxDocument(m, { bladId: `blad-${p.id}`, koppeling: k });
  const a = afwijkingen(JSON.parse(JSON.stringify(doc)));
  waar(`${p.id}: de IFCX met koppeling is geldig`, a.length === 0, a.slice(0, 3).join(" | "));
  const uit = leesIfcx(JSON.parse(JSON.stringify(doc)));
  const palen = uit.elementen.filter((e) => e.klasse === "IfcPile");
  // Het hart van een paal op de onderkant van de poer: het midden van zijn omhullende in plan.
  const plek = palen.map((e) => [((e.grenzen.min[0] + e.grenzen.max[0]) / 2) * 1000, ((e.grenzen.min[1] + e.grenzen.max[1]) / 2) * 1000, e.attributen["ocss::paal::id"]]);
  const raak = p.palen.every((q) => plek.some(([x, y, id]) => dichtbij(x, q.x, 0.5) && dichtbij(y, q.y, 0.5) && id === q.id));
  waar(`${p.id}: elke paal staat op zijn paal in het plan, met dezelfde id`, palen.length === p.palen.length && raak, JSON.stringify(plek.map(([x, y, id]) => [Math.round(x), Math.round(y), id])));
  const voet = uit.elementen.find((e) => e.klasse === "IfcFooting");
  waar(`${p.id}: de poer staat met zijn onderkant op −1200 en heeft zijn id`, dichtbij(voet.grenzen.min[2], -1.2, 1e-6) && voet.attributen["ocss::poer::id"] === p.id);
  const wortel = doc.data.find((n) => n.attributes?.["ocss::revisie"] !== undefined);
  waar(`${p.id}: de wortel draagt de id en revisie 1`, wortel && wortel.attributes["ocss::poer::id"] === p.id && wortel.attributes["ocss::revisie"] === 1);
}

// ── 4. Revisies ──────────────────────────────────────────────────────────────
console.log("\n4. Revisies van het detail");
{
  let w = { ...P1.waarden, horiz: "1" };
  const stand0 = leesRevisie(w);
  const i1 = revisieInhoud(vormVan(w));
  const r1 = huidigeRevisie(stand0, i1);
  waar("een nieuw blad: revisie 1, nog niet vastgelegd", r1.nr === 1 && !r1.vastgelegd && stand0.nr === 0);
  const vast1 = vastleggen(stand0, i1, "2026-11-26");
  w = { ...w, ...vast1 };
  const r1b = huidigeRevisie(leesRevisie(w), revisieInhoud(vormVan(w)));
  waar("vastgelegd: revisie 1 met datum, niets om mee te vergelijken", r1b.nr === 1 && r1b.vastgelegd && r1b.datum === "2026-11-26" && r1b.wijzigingen.length === 0);
  waar("nog eens vastleggen zonder wijziging doet niets", vastleggen(leesRevisie(w), revisieInhoud(vormVan(w)), "2026-11-27") === null);
  waar("dezelfde invoer opnieuw doorgerekend: dezelfde inhoud", JSON.stringify(revisieInhoud(vormVan({ ...w }))) === w[REVISIE_VELD.inhoud]);
  // De wapening verandert: banden van Ø25 in plaats van Ø20.
  const w2 = { ...w, d_t: "25" };
  const r2 = huidigeRevisie(leesRevisie(w2), revisieInhoud(vormVan(w2)));
  const band = r2.wijzigingen.find((x) => x.sleutel.startsWith("staaf band/x"));
  waar("banden Ø25: revisie 2, sinds 1, de band 20 × Ø20 → 20 × Ø25", r2.nr === 2 && !r2.vastgelegd && r2.sinds === 1 && band && band.oud.startsWith("20 × Ø20") && band.nieuw.startsWith("20 × Ø25"), JSON.stringify(r2.wijzigingen.slice(0, 3)));
  waar("de poer voldoet ook met Ø25", doorreken(MEER, w2).r.voldoet === true);
  // Terug naar Ø20: weer revisie 1, niets veranderd.
  const terug = huidigeRevisie(leesRevisie(w2), revisieInhoud(vormVan({ ...w2, d_t: "20" })));
  waar("terug naar de vastgelegde inhoud: weer revisie 1", terug.nr === 1 && terug.vastgelegd);
  const vast2 = vastleggen(leesRevisie(w2), revisieInhoud(vormVan(w2)), "2026-11-27");
  const w3 = { ...w2, ...vast2 };
  const r2b = huidigeRevisie(leesRevisie(w3), revisieInhoud(vormVan(w3)));
  waar("revisie 2 vastgelegd: de lijst toont wat er ten opzichte van 1 veranderde", r2b.nr === 2 && r2b.vastgelegd && r2b.sinds === 1 && r2b.wijzigingen.some((x) => x.sleutel.startsWith("staaf band/x")));
  waar("de lijst van revisie 2 is het verschil tussen de twee vastgelegde inhouden", JSON.stringify(r2b.wijzigingen) === JSON.stringify(verschil(JSON.parse(w3[REVISIE_VELD.vorig]), JSON.parse(w3[REVISIE_VELD.inhoud]))));
  // In de titel van het DXF en in de IFCX.
  const dxf = detailNaarDxf(maakDetail(vormVan(w3), { titel: "Poer P1", status: "Ontwerpschema", revisie: `revisie ${r2b.nr}` }));
  waar("het DXF heeft de revisie in de titel en boven de staaflijst", dxf.includes("Poer P1 - Ontwerpschema - revisie 2") && dxf.includes("Staaflijst - Ontwerpschema - revisie 2"));
  const doc = meerpaalIfcxDocument(maakMeerpaalPoer(lees(w3)), { bladId: "blad-P1", koppeling: koppelingVoorIfcx(w3, r2b.nr) });
  waar("de IFCX heeft ocss::revisie = 2", doc.data.some((n) => n.attributes?.["ocss::revisie"] === 2));
  // De hogere band bij drie palen telt ook: een andere laag is een andere inhoud.
  const i3 = revisieInhoud(vormVan({ ...P2.waarden }));
  waar("drie palen: de hoogte van elke band staat in de inhoud (85, 105, 125)", i3["hoogte band/2"] === "85" && i3["hoogte band/1"] === "105" && i3["hoogte band/3"] === "125", JSON.stringify([i3["hoogte band/1"], i3["hoogte band/2"], i3["hoogte band/3"]]));
  const iHoger = revisieInhoud(vormVan({ ...P2.waarden, c_o: "85" }));
  waar("een andere dekking onder: een andere inhoud, dus een nieuwe revisie", verschil(i3, iHoger).some((x) => x.sleutel.startsWith("hoogte band")));
  // Strings in de waarden storen het blad niet.
  waar("de revisievelden in de waarden veranderen de uitkomst van het blad niet", doorreken(MEER, w3).uit.UC_max === doorreken(MEER, { ...w2 }).uit.UC_max && doorreken(MEER, w3).r.voldoet === true);
}

// ── 5. Een gewijzigd palenplan ───────────────────────────────────────────────
console.log("\n5. Het palenplan verandert");
{
  // Het blad heeft P1 overgenomen en revisie 1 vastgelegd.
  let w = { ...P1.waarden, horiz: "1" };
  w = { ...w, ...vastleggen(leesRevisie(w), revisieInhoud(vormVan(w)), "2026-11-26") };
  const gelijk = vergelijkMetPlan(w, P1);
  waar("het blad en het plan zijn gelijk", gelijk.length === 0, JSON.stringify(gelijk));
  // De gebruiker past in het blad de paalmaat aan: dat is een verschil, maar niet in het plan.
  const zelf = vergelijkMetPlan({ ...w, p_x: "350" }, P1);
  waar("p_x in het blad aangepast: verschil, 'anders in het blad'", zelf.length === 1 && zelf[0].naam === "p_x" && zelf[0].inPlan === false, JSON.stringify(zelf));
  // Het plan verandert: de palen van P1 1100 uit elkaar in x, de poer 1800 lang.
  const nieuw = leesPalenplan(palenplanProef({ p1: { a_x: 1100, l: 1800 } }));
  const N1 = nieuw.poeren.find((p) => p.id === "P1");
  const v = vergelijkMetPlan(w, N1);
  const namen = v.map((x) => x.naam).sort().join();
  waar("het blad ziet a_x 1000 → 1100 en l_poer 1700 → 1800, veranderd in het plan", namen === "a_x,l_poer" && v.every((x) => x.inPlan), JSON.stringify(v));
  waar("P2 is in het nieuwe plan niet veranderd", vergelijkMetPlan({ ...P2.waarden }, nieuw.poeren.find((p) => p.id === "P2")).length === 0);
  // Overnemen: de waarden uit het plan; de wapening blijft.
  const na = { ...w, ...N1.waarden };
  const r = huidigeRevisie(leesRevisie(na), revisieInhoud(vormVan(na)));
  waar("na het overnemen: revisie 2, met de poer en de palen in de lijst", r.nr === 2 && !r.vastgelegd && r.wijzigingen.some((x) => x.sleutel === "poer") && r.wijzigingen.some((x) => x.sleutel === "palen"), JSON.stringify(r.wijzigingen.map((x) => x.sleutel)));
  waar("na het overnemen is er geen verschil meer met het plan", vergelijkMetPlan(na, N1).length === 0);
  waar("het blad rekent met de nieuwe palen en voldoet", doorreken(MEER, na).r.voldoet === true && dichtbij(doorreken(MEER, na).uit.r_h, Math.hypot(550 + 50 - 100, 500 + 50 - 100), 1e-6));
  waar("de poer houdt zijn id", leesKoppeling(na).poerId === "P1");
}

// ── 6. Het projectbestand ────────────────────────────────────────────────────
console.log("\n6. Het projectbestand met beide poeren");
{
  const ex = (p, id) => ({ id, naam: `Poer ${p.id}`, templateId: "meerpaalspoer", source: MEER, waarden: { ...p.waarden, horiz: "1" }, elementen: [] });
  const project = { versie: 2, naam: "Verzonnen project", gegevens: { DesignLife: "50", CC: "2" }, exemplaren: [ex(P1, "ex-p1"), ex(P2, "ex-p2")] };
  const doc = projectIfcx(project);
  const uit = leesIfcx(doc);
  const voeten = uit.elementen.filter((e) => e.klasse === "IfcFooting");
  waar("twee poeren in het document, met hun id", voeten.length === 2 && voeten.map((e) => e.attributen["ocss::poer::id"]).sort().join() === "P1,P2");
  const midden = (e) => [((e.grenzen.min[0] + e.grenzen.max[0]) / 2) * 1000, ((e.grenzen.min[1] + e.grenzen.max[1]) / 2) * 1000];
  const v1 = voeten.find((e) => e.attributen["ocss::poer::id"] === "P1");
  waar("P1 staat op zijn plaats in het plan, (6000; 4000)", dichtbij(midden(v1)[0], 6000, 0.5) && dichtbij(midden(v1)[1], 4000, 0.5), JSON.stringify(midden(v1)));
  const palen = uit.elementen.filter((e) => e.klasse === "IfcPile");
  waar("zeven palen, elk met de id uit het plan", palen.length === 7 && palen.map((e) => e.attributen["ocss::paal::id"]).sort().join() === "P1-1,P1-2,P1-3,P1-4,P2-1,P2-2,P2-3");
  const rev = doc.data.filter((n) => n.attributes?.["ocss::revisie"] !== undefined).map((n) => n.attributes["ocss::revisie"]);
  waar("elke poer revisie 1 (nog niets vastgelegd)", rev.length === 2 && rev.every((r) => r === 1), JSON.stringify(rev));
  waar("het schema beschrijft de nieuwe attributen", ["ocss::poer::id", "ocss::paal::id", "ocss::revisie"].every((a) => doc.schemas[a]));
  const a = afwijkingen(JSON.parse(JSON.stringify(doc)));
  waar("het projectdocument is geldig volgens de specificatie", a.length === 0, a.slice(0, 3).join(" | "));
  const step = projectStep(project);
  waar("de STEP heeft twee poeren en zeven palen", (step.match(/=IFCFOOTING\(/g) ?? []).length === 2 && (step.match(/=IFCPILE\(/g) ?? []).length === 7);
  // Een vastgelegde revisie 2 komt in het document.
  const w = { ...P1.waarden, horiz: "1", d_t: "25" };
  const stand = leesRevisie({ ...P1.waarden, ...vastleggen(leesRevisie({}), revisieInhoud(vormVan({ ...P1.waarden })), "2026-11-26") });
  const vast = vastleggen(stand, revisieInhoud(vormVan(w)), "2026-11-27");
  const doc2 = projectIfcx({ ...project, exemplaren: [{ ...ex(P1, "ex-p1"), waarden: { ...w, ...vast } }] });
  waar("met een vastgelegde tweede revisie: ocss::revisie = 2 in het projectdocument", doc2.data.some((n) => n.attributes?.["ocss::revisie"] === 2));
  waar("hetzelfde project geeft dezelfde knopen", JSON.stringify(projectIfcx(project).data) === JSON.stringify(doc.data));
}

// ── 7. Wat niet past ─────────────────────────────────────────────────────────
console.log("\n7. Wat niet past");
{
  // Een vijfde paal onder P1.
  const doc = palenplanProef();
  const paal = doc.data.find((n) => n.attributes?.["ocss::paal::id"] === "P1-1");
  const lichaam = doc.data.find((n) => n.path === paal.children.Lichaam);
  const extra = JSON.parse(JSON.stringify([lichaam, paal]));
  extra[0].path = "extra-lichaam";
  extra[0].attributes["usd::usdgeom::mesh"].points = extra[0].attributes["usd::usdgeom::mesh"].points.map(([x, y, z]) => [x + 0.5, y + 0.5, z]);
  extra[1].path = "extra-paal";
  extra[1].children = { Lichaam: "extra-lichaam" };
  extra[1].attributes["ocss::paal::id"] = "P1-5";
  doc.data.find((n) => n.children?.P1).children.P1_paal_5 = "extra-paal";
  doc.data.push(...extra);
  const vijf = leesPalenplan(doc).poeren.find((p) => p.id === "P1");
  waar("vijf palen: geen blad, en een melding", vijf.templateId === null && vijf.meldingen.some((m) => m.code === "aantalPalen" && m.n === 5), JSON.stringify(vijf.meldingen));
  // Een kolom 100 mm uit het midden.
  const doc2 = palenplanProef();
  const kolom = doc2.data.find((n) => n.attributes?.["bsi::ifc::prop::Name"] === "Kolom K1");
  const kLichaam = doc2.data.find((n) => n.path === kolom.children.Lichaam);
  kLichaam.attributes["usd::usdgeom::mesh"].points = kLichaam.attributes["usd::usdgeom::mesh"].points.map(([x, y, z]) => [x + 0.1, y, z]);
  const scheef = leesPalenplan(doc2).poeren.find((p) => p.id === "P1");
  waar("een kolom uit het midden: melding, het blad zet hem in het midden", scheef.templateId === "meerpaalspoer" && scheef.meldingen.some((m) => m.code === "kolomMidden"));
  // Een lege of verkeerde invoer gooit niet.
  waar("een leeg document: geen poeren, een melding, geen fout", (() => {
    try {
      const r = leesPalenplan({});
      return r.poeren.length === 0 && r.meldingen.length > 0;
    } catch {
      return false;
    }
  })());
  waar("geen IfcFooting: de melding geenPoeren", leesPalenplan({ data: [] }).meldingen.some((m) => m.code === "geenPoeren"));
  // De tweepaalspoer: alleen de twee palen in de linkerhelft van P1 en een smallere poer.
  const doc3 = palenplanProef();
  const p1 = doc3.data.find((n) => n.attributes?.["ocss::poer::id"] === "P1");
  const p1Lichaam = doc3.data.find((n) => n.path === p1.children.Lichaam);
  // De poer 2100 × 580 met zijn hart op x = 6000 − 500, de palen P1-1 en P1-4 (x = 5500) liggen dan
  // dwars; we draaien het: een poer 580 breed in x en 2100 lang in y, over de palen op y = 3500 en 4500.
  p1Lichaam.attributes["usd::usdgeom::mesh"].points = p1Lichaam.attributes["usd::usdgeom::mesh"].points.map(([x, y, z]) => [Math.sign(x) * 0.29 - 0.5, Math.sign(y) * 1.05, z]);
  const twee = leesPalenplan(doc3).poeren.find((p) => p.id === "P1");
  waar("twee palen onder een smalle poer: de tweepaalspoer, a = 1000, l = 2100, b = 580, 90° gedraaid",
    twee.templateId === "tweepaalspoer" && twee.waarden.a_hoh === "1000" && twee.waarden.l_poer === "2100" && twee.waarden.b_poer === "580" && twee.waarden.plan_hoek === "90" && twee.waarden.F_Ed === "1800",
    JSON.stringify(twee.waarden));
  // De overige invoer zoals het beeld van de tweepaalspoer hem bij een nieuw blad zet (TweepaalspoerDesigner.tsx).
  const tw = {
    ...Object.fromEntries(Object.entries({ e_p: 50, kolomvorm: 1, c_x: 400, c_y: 400, betonklasse: 30, betonstaal: 2, milieu: 2, ondergrond: 1, d_g: 16, c_o: 60, c_z: 40,
      n_t: 6, d_t: 25, s_t: 70, lagen: 1, vorm_t: 2, l_op: 600, D_m: 125, d_s: 12, s_s: 100, n_s: 4, n_z: 5, d_z: 12, n_b: 3, d_b: 12, n_hp: 2, d_hp: 12, n_dw: 3, d_dw: 16 }).map(([k, v]) => [k, String(v)])),
    ...twee.waarden,
  };
  const pd = maakPoer((naam) => {
    const v = parseFloat(String(tw[naam] ?? "").replace(",", "."));
    return Number.isFinite(v) ? v : 0;
  });
  const dd = poerIfcxDocument(pd, { bladId: "blad-twee", koppeling: koppelingVoorIfcx(tw, huidigeRevisie(leesRevisie(tw), revisieInhoud(tweepaalVorm(pd))).nr) });
  const g = leesIfcx(JSON.parse(JSON.stringify(dd)));
  const pp = g.elementen.filter((e) => e.klasse === "IfcPile").map((e) => [Math.round(((e.grenzen.min[0] + e.grenzen.max[0]) / 2) * 1000), Math.round(((e.grenzen.min[1] + e.grenzen.max[1]) / 2) * 1000), e.attributen["ocss::paal::id"]]);
  waar("tweepaalspoer teruggezet: de palen op (5500; 3500) en (5500; 4500) met hun ids", pp.length === 2 && pp.some(([x, y, id]) => x === 5500 && y === 3500 && id === "P1-1") && pp.some(([x, y, id]) => x === 5500 && y === 4500 && id === "P1-4"), JSON.stringify(pp));
  waar("de tweepaalspoer rekent met die invoer door", doorreken(TWEE, { ...tw, dwars: "1" }).r.uc !== null);
}

console.log(`\nPalenplan en revisies: ${getest} controles, ${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
