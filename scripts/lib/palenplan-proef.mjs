/**
 * Een klein, verzonnen palenplan als IFCX, voor scripts/check-poer-koppeling.mjs en om in
 * de app te proberen (scripts/fixtures/palenplan-proef.ifcx is dezelfde inhoud).
 *
 * Twee poeren met hun palen en een kolom erop:
 *   P1  vier palen 320 × 320 h.o.h. 1000 × 1000 onder een poer 1700 × 1700 × 900, hart
 *       op (6000, 4000), onderkant op −1200; kolom 400 × 400; kolomlasten N_Ed = 1800 kN
 *       en N_fr = 1300 kN als attribuut op de poer. Recht, de palen 50 mm in de poer.
 *   P2  drie ronde palen Ø360 in een gelijkzijdige driehoek h.o.h. 1200, rand 400, hart
 *       op (12000, 4000), onderkant op −1200, 30° gedraaid (de bovenste paal op 120°);
 *       kolom 400 × 400 (meegedraaid). Geen lasten: het blad houdt zijn eigen invoer.
 * De poeren staan met een verplaatsing (en P2 met een draaiing) in `usd::xformop`, de palen
 * en kolommen met hun coördinaten in het plan: zo leest de lezer beide vormen.
 *
 * `wijziging` maakt een tweede versie van het plan: { p1: { a_x, l } } schuift de palen
 * van P1 in x uit elkaar en maakt de poer langer.
 */
import { BALKLAAG_IFCX_IMPORTS, ifcKlasse, uuidVan } from "../../packages/core/dist/index.js";

const m = (mm) => Math.round(mm * 1e3) / 1e6;

/** Een prisma met een bolle veelhoek (mm, tegen de klok in) als grondvlak, z0..z1 in mm. */
function prisma(veelhoek, z0, z1) {
  const n = veelhoek.length;
  const points = [...veelhoek.map(([x, y]) => [m(x), m(y), m(z0)]), ...veelhoek.map(([x, y]) => [m(x), m(y), m(z1)])];
  const faceVertexIndices = [];
  for (let i = 1; i + 1 < n; i++) faceVertexIndices.push(0, i + 1, i, n, n + i, n + i + 1);
  for (let i = 0; i < n; i++) {
    const k = (i + 1) % n;
    faceVertexIndices.push(i, k, n + k, i, n + k, n + i);
  }
  return { points, faceVertexIndices };
}
const rechthoek = (cx, cy, bx, by) => [[cx - bx / 2, cy - by / 2], [cx + bx / 2, cy - by / 2], [cx + bx / 2, cy + by / 2], [cx - bx / 2, cy + by / 2]];
const cirkel = (cx, cy, d, n = 16) => Array.from({ length: n }, (_, i) => [cx + (d / 2) * Math.cos((2 * Math.PI * i) / n), cy + (d / 2) * Math.sin((2 * Math.PI * i) / n)]);
const draai = ([x, y], h) => [x * Math.cos(h) - y * Math.sin(h), x * Math.sin(h) + y * Math.cos(h)];

export function palenplanProef(wijziging = {}) {
  const pad = (naam) => uuidVan(`palenplan-proef/${naam}`);
  const data = [];
  const klasse = (code) => ({ "bsi::ifc::class": ifcKlasse(code) });
  const element = (naam, code, attributen, veelhoek, z0, z1, plaatsing) => {
    const lichaam = pad(`${naam}/lichaam`);
    data.push({ path: lichaam, attributes: { "usd::usdgeom::mesh": prisma(veelhoek, z0, z1) } });
    data.push({
      path: pad(naam),
      children: { Lichaam: lichaam },
      attributes: { ...klasse(code), ...attributen, ...(plaatsing ? { "usd::xformop": plaatsing } : {}) },
    });
    return pad(naam);
  };
  const verschuif = (x, y, z, hoek = 0) => {
    const c = Math.round(Math.cos(hoek) * 1e12) / 1e12;
    const s = Math.round(Math.sin(hoek) * 1e12) / 1e12;
    return { transform: [[c, s, 0, 0], [-s, c, 0, 0], [0, 0, 1, 0], [m(x), m(y), m(z), 1]] };
  };
  const onder = -1200;
  const h = 900;
  const kinderen = {};

  // ── P1: vier palen ─────────────────────────────────────────────────────────
  {
    const a_x = wijziging.p1?.a_x ?? 1000;
    const a_y = 1000;
    const l = wijziging.p1?.l ?? 1700;
    const [cx, cy] = [6000, 4000];
    kinderen.P1 = element("P1", "IfcFooting", {
      "bsi::ifc::prop::Name": "Poer P1", "ocss::poer::id": "P1", "ocss::poer::N_Ed": 1800, "ocss::poer::N_fr": 1300,
    }, rechthoek(0, 0, l, 1700), 0, h, verschuif(cx, cy, onder));
    [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy], i) => {
      kinderen[`P1_paal_${i + 1}`] = element(`P1/paal/${i + 1}`, "IfcPile", { "bsi::ifc::prop::Name": `Paal P1-${i + 1}`, "ocss::paal::id": `P1-${i + 1}` },
        rechthoek(cx + (sx * a_x) / 2, cy + (sy * a_y) / 2, 320, 320), -13000, onder + 50);
    });
    kinderen.P1_kolom = element("P1/kolom", "IfcColumn", { "bsi::ifc::prop::Name": "Kolom K1" }, rechthoek(cx, cy, 400, 400), onder + h, onder + h + 3000);
  }

  // ── P2: drie palen, 30° gedraaid ──────────────────────────────────────────
  {
    const a_3 = 1200;
    const r = 400;
    const R = a_3 / Math.sqrt(3);
    const [cx, cy] = [12000, 4000];
    const hoek = Math.PI / 6;
    const t = r * Math.tan(Math.PI / 6);
    // De omtrek in de eigen assen, tegen de klok in: per paal de twee hoeken van de afschuining.
    const omtrek = [0, 1, 2].flatMap((k) => {
      const φ = ((90 + 120 * k) * Math.PI) / 180;
      const [px, py] = [R * Math.cos(φ), R * Math.sin(φ)];
      return [-1, 1].map((s) => [px + r * Math.cos(φ) - s * t * Math.sin(φ), py + r * Math.sin(φ) + s * t * Math.cos(φ)]);
    });
    kinderen.P2 = element("P2", "IfcFooting", { "bsi::ifc::prop::Name": "Poer P2", "ocss::poer::id": "P2" },
      omtrek, 0, h, verschuif(cx, cy, onder, hoek));
    [0, 1, 2].forEach((k) => {
      const φ = ((90 + 120 * k) * Math.PI) / 180;
      const [px, py] = draai([R * Math.cos(φ), R * Math.sin(φ)], hoek);
      kinderen[`P2_paal_${k + 1}`] = element(`P2/paal/${k + 1}`, "IfcPile", { "bsi::ifc::prop::Name": `Paal P2-${k + 1}`, "ocss::paal::id": `P2-${k + 1}` },
        cirkel(cx + px, cy + py, 360), -13000, onder + 50);
    });
    kinderen.P2_kolom = element("P2/kolom", "IfcColumn", { "bsi::ifc::prop::Name": "Kolom K2" },
      rechthoek(0, 0, 400, 400).map((p) => draai(p, hoek)).map(([x, y]) => [cx + x, cy + y]), onder + h, onder + h + 3000);
  }

  const laag = (naam, code, titel, k) => ({ path: pad(naam), children: k, attributes: { ...klasse(code), "bsi::ifc::prop::Name": titel } });
  return {
    header: { id: "palenplan-proef.ifcx", ifcxVersion: "ifcx_alpha", dataVersion: "1.0.0", author: "proef", timestamp: "2026-01-01T00:00:00Z" },
    imports: BALKLAAG_IFCX_IMPORTS,
    schemas: {
      "ocss::poer::id": { value: { dataType: "String" } },
      "ocss::paal::id": { value: { dataType: "String" } },
      "ocss::poer::N_Ed": { value: { dataType: "Real" } },
      "ocss::poer::N_fr": { value: { dataType: "Real" } },
    },
    data: [
      laag("project", "IfcProject", "Proefproject palenplan", { Terrein: pad("terrein") }),
      laag("terrein", "IfcSite", "Terrein", { Gebouw: pad("gebouw") }),
      laag("gebouw", "IfcBuilding", "Gebouw", { Fundering: pad("fundering") }),
      laag("fundering", "IfcBuildingStorey", "Fundering", kinderen),
      ...data,
    ],
  };
}
