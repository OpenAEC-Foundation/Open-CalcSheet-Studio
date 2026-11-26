import {
  BALKLAAG_IFCX_IMPORTS, ifcKlasse, ifcxBlokMesh, uuidVan,
  type IfcxBestand, type IfcxKnoop,
} from "@ifc-calc/core";
import beelden from "../../i18n/locales/nl/beelden.json" with { type: "json" };
import { stavenMeerpaal, type MeerpaalDefinitie, type P2 } from "./meerpaalDefinitie.ts";
import { POER_IFCX_SCHEMAS, koppelAttributen, paalIdAttribuut, poerIdAttribuut, type PoerKoppelingIfcx } from "./poerIfcx.ts";
import { POER_KLEUREN } from "./poerTekening.ts";
import { afgerondPad, maakStaaflijst, staafLengte, type P3, type Staaf } from "./poerStaven.ts";

/*
 * De poer op drie of vier palen als IFCX (IFC5): de poer als doorzichtig betonvolume
 * met zijn eigen omtrek, de palen en de kolom als aanzet, en elke staaf als een losse
 * IfcReinforcingBar met zijn geometrie: een buis langs de hartlijn, met de bochten.
 * Elke staaf draagt zijn merk uit de staaflijst, zijn diameter en zijn lengte.
 *
 * Hier wordt niet gerekend: de vorm en de staven komen uit meerpaalDefinitie.ts via
 * poerStaven.ts, dezelfde als de staaflijst en het DXF-detail. De opbouw volgt
 * poerIfcx.ts (de tweepaalspoer): een vorm per staaf, overgenomen met `inherits`.
 *
 * Laadt zonder React of stores: de controle en de IFC-uitvoer (store/projectIfcx.ts)
 * gebruiken dit bestand in Node.
 */

export type MeerpaalModelTeksten = typeof beelden.poerDetail.model;
const NEDERLANDS: MeerpaalModelTeksten = beelden.poerDetail.model;

const ATTR = {
  klasse: "bsi::ifc::class",
  materiaal: "bsi::ifc::material",
  naam: "bsi::ifc::prop::Name",
  omschrijving: "bsi::ifc::prop::Description",
  type: "bsi::ifc::prop::TypeName",
  lengte: "bsi::ifc::prop::Length",
  breedte: "bsi::ifc::prop::Width",
  hoogte: "bsi::ifc::prop::Height",
  dikte: "bsi::ifc::prop::Depth",
  kleur: "bsi::ifc::presentation::diffuseColor",
  dekking: "bsi::ifc::presentation::opacity",
  mesh: "usd::usdgeom::mesh",
  plaatsing: "usd::xformop",
  diameter: "ocss::calc::diameter",
  merk: "ocss::calc::merk",
  aantal: "ocss::calc::aantalStaven",
  opmerking: "ocss::calc::opmerking",
} as const;

const BETON_KLEUR = "#a8adb5";
const BETON_DEKKING = 0.2;
const PAAL_AANZET = 400;
const KOLOM_AANZET = 300;
const ZIJDEN_STAAF = 8;
const ZIJDEN_ROND = 32;
/** Meer staven dan dit komt er niet in het document: dan klopt de invoer niet. */
export const MEERPAAL_MAX_STAVEN = 2000;

const naarM = (mm: number) => Math.round(mm * 1e3) / 1e6;
const getal = (w: number) => (Math.round(w * 100) / 100).toString();
const fracties = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const materiaalCode = (code: string) => ({ code, uri: "https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/IfcMaterial" });
const verplaatsing = (x: number, y: number, z: number) => ({
  transform: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [naarM(x), naarM(y), naarM(z), 1]],
});

const sub = (a: P3, b: P3): P3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const kruis = (a: P3, b: P3): P3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const punt = (a: P3, b: P3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const eenheid = (a: P3): P3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/**
 * Een buis om een pad in de ruimte (het veegvolume van een cirkel langs de hartlijn).
 * Elke ring staat loodrecht op de raaklijn; de ringen draaien niet om de as (het vlak van
 * de eerste ring schuift mee). Een open pad krijgt twee kapjes.
 */
export function buis3d(pad: P3[], straal: number, gesloten: boolean) {
  const n = pad.length;
  const points: number[][] = [];
  const faceVertexIndices: number[] = [];
  const raak = pad.map((p, i) => {
    const heen = gesloten || i > 0 ? eenheid(sub(p, pad[(i - 1 + n) % n])) : null;
    const weer = gesloten || i < n - 1 ? eenheid(sub(pad[(i + 1) % n], p)) : null;
    const a = heen ?? weer!;
    const b = weer ?? heen!;
    return eenheid([a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
  });
  // Een begin-as loodrecht op de eerste raaklijn.
  const t0 = raak[0];
  let normaal = eenheid(Math.abs(t0[2]) < 0.9 ? kruis(t0, [0, 0, 1]) : kruis(t0, [1, 0, 0]));
  for (let i = 0; i < n; i++) {
    const t = raak[i];
    normaal = eenheid(sub(normaal, t.map((c) => c * punt(normaal, t)) as P3));
    const binormaal = kruis(t, normaal);
    for (let j = 0; j < ZIJDEN_STAAF; j++) {
      const h = (j / ZIJDEN_STAAF) * 2 * Math.PI;
      const c = Math.cos(h) * straal;
      const s = Math.sin(h) * straal;
      points.push([0, 1, 2].map((k) => naarM(pad[i][k] + normaal[k] * c + binormaal[k] * s)));
    }
  }
  const stukken = gesloten ? n : n - 1;
  for (let i = 0; i < stukken; i++) {
    const volgend = (i + 1) % n;
    for (let j = 0; j < ZIJDEN_STAAF; j++) {
      const k = (j + 1) % ZIJDEN_STAAF;
      const [a, b, c, d] = [i * ZIJDEN_STAAF + j, i * ZIJDEN_STAAF + k, volgend * ZIJDEN_STAAF + k, volgend * ZIJDEN_STAAF + j];
      faceVertexIndices.push(a, b, c, a, c, d);
    }
  }
  if (!gesloten) {
    const eind = (n - 1) * ZIJDEN_STAAF;
    for (let j = 1; j + 1 < ZIJDEN_STAAF; j++) {
      faceVertexIndices.push(0, j + 1, j);
      faceVertexIndices.push(eind, eind + j, eind + j + 1);
    }
  }
  return { points, faceVertexIndices };
}

/** Een prisma met een bolle veelhoek tegen de klok in als grondvlak. */
function prisma(veelhoek: P2[], z0: number, z1: number) {
  const n = veelhoek.length;
  const points = [...veelhoek.map(([x, y]) => [naarM(x), naarM(y), naarM(z0)]), ...veelhoek.map(([x, y]) => [naarM(x), naarM(y), naarM(z1)])];
  const faceVertexIndices: number[] = [];
  for (let i = 1; i + 1 < n; i++) {
    faceVertexIndices.push(0, i + 1, i);
    faceVertexIndices.push(n, n + i, n + i + 1);
  }
  for (let i = 0; i < n; i++) {
    const k = (i + 1) % n;
    faceVertexIndices.push(i, k, n + k, i, n + k, n + i);
  }
  return { points, faceVertexIndices };
}

function cilinder(diameter: number, z0: number, z1: number) {
  const r = diameter / 2;
  return prisma(Array.from({ length: ZIJDEN_ROND }, (_, j) => {
    const h = (j / ZIJDEN_ROND) * 2 * Math.PI;
    return [r * Math.cos(h), r * Math.sin(h)] as P2;
  }), z0, z1);
}

/**
 * De poer van één blad als IFCX-knopen. De eerste knoop is de wortel (IfcElementAssembly);
 * de paden zijn vaste UUID's, afgeleid van `bladId`. Null als de poer geen volume heeft.
 */
export function meerpaalIfcxKnopen(m: MeerpaalDefinitie, bladId: string, t: MeerpaalModelTeksten = NEDERLANDS, koppeling: PoerKoppelingIfcx = {}): IfcxKnoop[] | null {
  if (!(m.h > 0) || m.omtrek.length < 3 || !m.omtrek.every((p) => p.every(Number.isFinite))) return null;
  const pad = (naam: string) => uuidVan(`${bladId}/meerpaalspoer/${naam}`);
  const knopen: IfcxKnoop[] = [];
  const kinderen: Record<string, string> = {};
  const korf: Record<string, string> = {};
  const materiaal = (naam: string, kleur: string, dekking: number, code: string) => {
    const q = pad(`materiaal/${naam}`);
    knopen.push({ path: q, attributes: { [ATTR.materiaal]: materiaalCode(code), [ATTR.kleur]: fracties(kleur), [ATTR.dekking]: dekking } });
    return q;
  };
  const vorm = (naam: string, mesh: object) => {
    const v = pad(`vorm/${naam}`);
    const lichaam = pad(`vorm/${naam}/lichaam`);
    knopen.push({ path: lichaam, attributes: { [ATTR.mesh]: mesh } });
    knopen.push({ path: v, children: { Lichaam: lichaam } });
    return v;
  };

  const poerPad = pad("poer");
  const xs = m.omtrek.map((p) => p[0]);
  const ys = m.omtrek.map((p) => p[1]);
  knopen.push({
    path: poerPad,
    inherits: { vorm: vorm("poer", prisma(m.omtrek, 0, m.h)), materiaal: materiaal("beton", BETON_KLEUR, BETON_DEKKING, "CONCRETE") },
    attributes: {
      [ATTR.klasse]: ifcKlasse("IfcFooting"),
      [ATTR.naam]: t.poer,
      [ATTR.lengte]: naarM(Math.max(...xs) - Math.min(...xs)),
      [ATTR.breedte]: naarM(Math.max(...ys) - Math.min(...ys)),
      [ATTR.hoogte]: naarM(m.h),
      ...poerIdAttribuut(koppeling),
    },
  });
  kinderen.Poer = poerPad;

  const maatTekst = (rond: boolean, x: number, y: number) => (rond ? `Ø${getal(x)}` : `${getal(x)}×${getal(y)}`);
  if (m.paal.x > 0 && m.paal.y > 0) {
    const paalVorm = vorm("paal", m.paal.rond ? cilinder(m.paal.x, -PAAL_AANZET, m.paal.inbedding)
      : ifcxBlokMesh(-m.paal.x / 2, m.paal.x / 2, -m.paal.y / 2, m.paal.y / 2, -PAAL_AANZET, m.paal.inbedding));
    const mat = materiaal("paal", POER_KLEUREN.paal, 1, "CONCRETE");
    m.palen.forEach(([x, y], i) => {
      const q = pad(`paal/${i + 1}`);
      knopen.push({
        path: q,
        inherits: { vorm: paalVorm, materiaal: mat },
        attributes: {
          [ATTR.klasse]: ifcKlasse("IfcPile"),
          [ATTR.naam]: `${t.paal} ${i + 1}`,
          [ATTR.type]: maatTekst(m.paal.rond, m.paal.x, m.paal.y),
          [ATTR.breedte]: naarM(m.paal.x),
          [ATTR.dikte]: naarM(m.paal.y),
          [ATTR.opmerking]: t.alleenAanzet,
          [ATTR.plaatsing]: verplaatsing(x, y, 0),
          ...paalIdAttribuut(koppeling, i),
        },
      });
      kinderen[`Paal_${i + 1}`] = q;
    });
  }
  if (m.kolom.x > 0 && m.kolom.y > 0) {
    const q = pad("kolom");
    knopen.push({
      path: q,
      inherits: {
        vorm: vorm("kolom", m.kolom.rond ? cilinder(m.kolom.x, m.h, m.h + KOLOM_AANZET)
          : ifcxBlokMesh(-m.kolom.x / 2, m.kolom.x / 2, -m.kolom.y / 2, m.kolom.y / 2, m.h, m.h + KOLOM_AANZET)),
        materiaal: materiaal("kolom", POER_KLEUREN.kolom, 1, "CONCRETE"),
      },
      attributes: {
        [ATTR.klasse]: ifcKlasse("IfcColumn"),
        [ATTR.naam]: t.kolom,
        [ATTR.type]: maatTekst(m.kolom.rond, m.kolom.x, m.kolom.y),
        [ATTR.breedte]: naarM(m.kolom.x),
        [ATTR.dikte]: naarM(m.kolom.y),
        [ATTR.opmerking]: t.alleenAanzet,
      },
    });
    kinderen.Kolom = q;
  }

  // ── de staven, elk met zijn eigen buis ───────────────────────────────────
  const staven: Staaf[] = stavenMeerpaal(m).slice(0, MEERPAAL_MAX_STAVEN);
  const lijst = maakStaaflijst(staven);
  const kleuren: Record<string, string> = { band: POER_KLEUREN.trekband, net: POER_KLEUREN.overig, randbeugel: POER_KLEUREN.beugel };
  const mats: Record<string, string> = {};
  const tellers: Record<string, number> = {};
  for (const s of staven) {
    mats[s.soort] ??= materiaal(s.soort, kleuren[s.soort] ?? POER_KLEUREN.overig, 1, "STEEL");
    const nr = (tellers[s.soort] = (tellers[s.soort] ?? 0) + 1);
    const kind = `${s.soort[0].toUpperCase()}${s.soort.slice(1)}_${String(nr).padStart(3, "0")}`;
    const v = vorm(`staaf/${kind}`, buis3d(afgerondPad(s, 4), s.d / 2, s.gesloten));
    const q = pad(`staaf/${kind}`);
    const merk = lijst.merkVan[s.sleutel];
    knopen.push({
      path: q,
      inherits: { vorm: v, materiaal: mats[s.soort] },
      attributes: {
        [ATTR.klasse]: ifcKlasse("IfcReinforcingBar"),
        [ATTR.naam]: `${t.soorten[s.soort as keyof typeof t.soorten] ?? s.soort} ${nr}`,
        [ATTR.type]: `Ø${getal(s.d)}`,
        [ATTR.diameter]: naarM(s.d),
        [ATTR.merk]: merk,
        [ATTR.lengte]: naarM(staafLengte(s)),
      },
    });
    korf[kind] = q;
  }
  if (Object.keys(korf).length > 0) {
    const q = pad("korf");
    knopen.push({ path: q, children: korf, attributes: { [ATTR.klasse]: ifcKlasse("IfcElementAssembly"), [ATTR.naam]: t.korf, [ATTR.aantal]: staven.length } });
    kinderen.Wapeningskorf = q;
  }

  const titel = m.n === 4 ? t.vierpaalspoer : t.driepaalspoer;
  const wortel: IfcxKnoop = {
    path: pad("wortel"),
    children: kinderen,
    attributes: {
      [ATTR.klasse]: ifcKlasse("IfcElementAssembly"),
      [ATTR.naam]: titel,
      [ATTR.omschrijving]: m.n === 4
        ? `${titel} ${getal(m.maten.l)}×${getal(m.maten.b)}×${getal(m.h)}, ${t.hartOpHart} ${getal(m.maten.a_x)}×${getal(m.maten.a_y)}`
        : `${titel}, ${t.hartOpHart} ${getal(m.maten.a_3)}, h = ${getal(m.h)}`,
      ...koppelAttributen(koppeling),
    },
  };
  return [wortel, ...knopen];
}

/** De poer als compleet IFCX-bestand, met een vast tijdstip: gelijke invoer geeft een gelijk document. */
export function meerpaalIfcxDocument(m: MeerpaalDefinitie, opties: { bladId?: string; teksten?: MeerpaalModelTeksten; koppeling?: PoerKoppelingIfcx } = {}): IfcxBestand | null {
  const bladId = opties.bladId ?? "meerpaalspoer";
  const t = opties.teksten ?? NEDERLANDS;
  const knopen = meerpaalIfcxKnopen(m, bladId, t, opties.koppeling);
  if (!knopen) return null;
  const pad = (naam: string) => uuidVan(`${bladId}/meerpaalspoer/ruimte/${naam}`);
  const laag = (naam: string, klasse: string, titel: string, kinderen: Record<string, string>): IfcxKnoop => ({
    path: pad(naam),
    children: kinderen,
    attributes: { [ATTR.klasse]: ifcKlasse(klasse), [ATTR.naam]: titel },
  });
  return {
    header: { id: `${bladId}.ifcx`, ifcxVersion: "ifcx_alpha", dataVersion: "1.0.0", author: "Open CalcSheet Studio", timestamp: "2026-01-01T00:00:00Z" },
    imports: BALKLAAG_IFCX_IMPORTS,
    schemas: POER_IFCX_SCHEMAS,
    data: [
      laag("project", "IfcProject", t.project, { Terrein: pad("terrein") }),
      laag("terrein", "IfcSite", t.terrein, { Gebouw: pad("gebouw") }),
      laag("gebouw", "IfcBuilding", t.gebouw, { Verdieping: pad("verdieping") }),
      laag("verdieping", "IfcBuildingStorey", t.verdieping, { Poer: knopen[0].path }),
      ...knopen,
    ],
  };
}
