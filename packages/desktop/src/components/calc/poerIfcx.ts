import {
  BALKLAAG_IFCX_IMPORTS, BALKLAAG_IFCX_SCHEMAS, ifcKlasse, ifcxBlokMesh, uuidVan,
  type IfcxBestand, type IfcxKnoop, type IfcxSchema,
} from "@ifc-calc/core";
import beelden from "../../i18n/locales/nl/beelden.json" with { type: "json" };
import type { PoerDefinitie } from "./poerDefinitie.ts";
import { POER_KLEUREN } from "./poerTekening.ts";

/*
 * De tweepaalspoer als IFCX (IFC5): de poer als doorzichtig betonvolume, twee palen, de
 * kolom en de wapeningskorf. Het 3D-beeld (PoerModel.tsx) en de IFC-uitvoer
 * (store/projectIfcx.ts) lezen dit document, net als bij de balklaag.
 *
 * Hier wordt niet gerekend: de maten en de plaats van elke staaf komen uit de definitie
 * (poerDefinitie.ts), dezelfde als de tekening (poerTekening.ts), en de kleuren ook. Een
 * uitkomst van het blad staat er niet in: het document verandert alleen als de poer zelf
 * verandert.
 *
 * Eén vorm is een eigen knoop; de staven nemen die over met `inherits` en krijgen alleen
 * een eigen plaatsing, zoals de balken in balklaagIfcx.ts. Alle lengtes in de definitie
 * in mm, in het document in meter; de oorsprong ligt op de onderkant van de poer, midden
 * in de poer, met x langs de paallijn en z omhoog.
 *
 * Laadt zonder React of stores: de controle (scripts/check-poer-ifcx.mjs) en de
 * IFC-uitvoer gebruiken dit bestand ook in Node.
 */

/** De namen in het document; ze staan in locales/{nl,en}/beelden.json onder tweepaalspoer.model. */
export type PoerModelTeksten = typeof beelden.tweepaalspoer.model;

const NEDERLANDS: PoerModelTeksten = beelden.tweepaalspoer.model;

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
  aantal: "ocss::calc::aantalStaven",
  getoond: "ocss::calc::aantalGetoond",
  opmerking: "ocss::calc::opmerking",
} as const;

/** De beschrijving van de eigen attributen in een los document. */
export const POER_IFCX_SCHEMAS: Record<string, IfcxSchema> = {
  [ATTR.diameter]: { value: { dataType: "Real", quantityKind: "Length" } },
  [ATTR.aantal]: { value: { dataType: "Integer" } },
  [ATTR.getoond]: BALKLAAG_IFCX_SCHEMAS[ATTR.getoond],
  [ATTR.opmerking]: BALKLAAG_IFCX_SCHEMAS[ATTR.opmerking],
};

/** Het betonvolume is doorzichtig: de korf moet er doorheen te zien zijn. */
const BETON_KLEUR = "#a8adb5";
const BETON_DEKKING = 0.2;
/** Zo lang is de aanzet van een paal en van de kolom in het beeld; de tekening knipt ze ook af. */
const PAAL_AANZET = 400;
const KOLOM_AANZET = 300;
/** Een staaf als achthoek en een ronde paal of kolom als 32-hoek: fijner valt niet op, en het blijft licht. */
const ZIJDEN_STAAF = 8;
const ZIJDEN_ROND = 32;
/** Een ombuiging in zoveel stukken per kwart cirkel; de kleine hoeken van een beugel met minder. */
const BOOG_STUKKEN = 5;
const HOEK_STUKKEN = 3;
/** De straal van de hoeken in een beugel en een haarspeld, in staafdiameters; zoals de doorsnede op de tekening. */
const HOEK_STRAAL = 2;
/**
 * Zoveel staven per soort staan hooguit in het beeld. Tijdens het typen komt een hart-op-hart
 * van 1 mm voorbij; zonder grens loopt de app dan vast op duizenden beugels.
 */
export const POER_MAX_PER_SOORT = 60;
/** Zoveel gesloten beugels hooguit op één plaats in de lengte. */
const POER_MAX_LUSSEN = 8;
/** Zoveel beugels hooguit in het hele model; een beugel kost de meeste vlakken. */
const POER_MAX_BEUGELS = 120;

const naarM = (mm: number) => Math.round(mm * 1e3) / 1e6;
const getal = (w: number) => (Math.round(w * 100) / 100).toString();
const fracties = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/** Materiaal uit de lijst van IFC; IFC heeft geen eigen klasse per materiaal. */
const materiaalCode = (code: string) => ({ code, uri: "https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/IfcMaterial" });

const verplaatsing = (x: number, y: number, z: number) => ({
  transform: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [naarM(x), naarM(y), naarM(z), 1]],
});

/** Een selectie gelijk verdeeld over de lijst, met de eerste en de laatste erbij. */
function beperk<T>(lijst: T[], max: number): T[] {
  if (lijst.length <= max) return lijst;
  return Array.from({ length: max }, (_, i) => lijst[Math.round((i * (lijst.length - 1)) / (max - 1))]);
}

type P2 = [number, number];

/**
 * Een pad met afgeronde hoeken: elke hoek wordt een kwart cirkel met straal `r`. Alle
 * hoeken in een poer zijn recht. Is een been korter dan de straal, dan wordt de straal kleiner.
 */
function afgerond(punten: P2[], r: number, stukken: number, gesloten = false): P2[] {
  const n = punten.length;
  if (r <= 0 || n < 3) return punten;
  const uit: P2[] = [];
  for (let i = 0; i < n; i++) {
    const hier = punten[i];
    const voor = punten[(i - 1 + n) % n];
    const na = punten[(i + 1) % n];
    if (!gesloten && (i === 0 || i === n - 1)) {
      uit.push(hier);
      continue;
    }
    const la = Math.hypot(voor[0] - hier[0], voor[1] - hier[1]);
    const lb = Math.hypot(na[0] - hier[0], na[1] - hier[1]);
    if (!(la > 0 && lb > 0)) {
      uit.push(hier);
      continue;
    }
    // Bij een gesloten pad delen twee hoeken één been.
    const straal = Math.min(r, gesloten ? Math.min(la, lb) / 2 : Math.min(la, lb));
    const u: P2 = [(voor[0] - hier[0]) / la, (voor[1] - hier[1]) / la];
    const v: P2 = [(na[0] - hier[0]) / lb, (na[1] - hier[1]) / lb];
    const m: P2 = [hier[0] + (u[0] + v[0]) * straal, hier[1] + (u[1] + v[1]) * straal];
    for (let k = 0; k <= stukken; k++) {
      const h = (k / stukken) * (Math.PI / 2);
      uit.push([
        m[0] - straal * (v[0] * Math.cos(h) + u[0] * Math.sin(h)),
        m[1] - straal * (v[1] * Math.cos(h) + u[1] * Math.sin(h)),
      ]);
    }
  }
  return uit;
}

/**
 * Een staaf als buis om een pad in een vlak: `xz` (de langsrichting, y = 0) of `yz` (de
 * dwarsrichting, x = 0). Elk punt krijgt een ring in het vlak van de hoek, zodat de
 * doorsnede overal gelijk blijft; een open pad krijgt twee kapjes.
 */
function buis(pad: P2[], vlak: "xz" | "yz", straal: number, gesloten = false) {
  const n = pad.length;
  const points: number[][] = [];
  const faceVertexIndices: number[] = [];
  const richting = (a: P2, b: P2): P2 => {
    const l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    return [(b[0] - a[0]) / l, (b[1] - a[1]) / l];
  };
  for (let i = 0; i < n; i++) {
    const heen = gesloten || i > 0 ? richting(pad[(i - 1 + n) % n], pad[i]) : null;
    const weer = gesloten || i < n - 1 ? richting(pad[i], pad[(i + 1) % n]) : null;
    const a = heen ?? weer!;
    const b = weer ?? heen!;
    const t: P2 = [a[0] + b[0], a[1] + b[1]];
    const l = Math.hypot(t[0], t[1]) || 1;
    const raak: P2 = [t[0] / l, t[1] / l];
    // In de hoek is de ring iets breder: de buis houdt zo overal zijn dikte.
    const breder = 1 / Math.max(0.5, raak[0] * a[0] + raak[1] * a[1]);
    for (let j = 0; j < ZIJDEN_STAAF; j++) {
      const h = (j / ZIJDEN_STAAF) * 2 * Math.PI;
      const inVlak = straal * Math.cos(h) * breder;
      const dwars = straal * Math.sin(h);
      const p = pad[i][0] - raak[1] * inVlak;
      const q = pad[i][1] + raak[0] * inVlak;
      points.push(vlak === "xz" ? [naarM(p), naarM(dwars), naarM(q)] : [naarM(dwars), naarM(p), naarM(q)]);
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

/** Een staande cilinder, in mm, om (0, 0). */
function cilinder(diameter: number, z0: number, z1: number) {
  const r = diameter / 2;
  const points: number[][] = [];
  const faceVertexIndices: number[] = [];
  // Elk vlak zijn eigen punten is niet nodig: de lezer maakt per vlak zijn eigen normaal.
  for (const z of [z0, z1]) {
    for (let j = 0; j < ZIJDEN_ROND; j++) {
      const h = (j / ZIJDEN_ROND) * 2 * Math.PI;
      points.push([naarM(r * Math.cos(h)), naarM(r * Math.sin(h)), naarM(z)]);
    }
  }
  for (let j = 0; j < ZIJDEN_ROND; j++) {
    const k = (j + 1) % ZIJDEN_ROND;
    faceVertexIndices.push(j, k, ZIJDEN_ROND + k, j, ZIJDEN_ROND + k, ZIJDEN_ROND + j);
  }
  for (let j = 1; j + 1 < ZIJDEN_ROND; j++) {
    faceVertexIndices.push(0, j + 1, j);
    faceVertexIndices.push(ZIJDEN_ROND, ZIJDEN_ROND + j, ZIJDEN_ROND + j + 1);
  }
  return { points, faceVertexIndices };
}

/** De staven die in het model komen, op één plek: het document en de telling lezen dit. */
function stavenVan(p: PoerDefinitie) {
  const tb = p.trekband;
  const bg = p.beugels;
  const lussen = Math.floor(bg.y.length / 2);
  const perPlaats = Math.min(lussen, POER_MAX_LUSSEN) + bg.y.length % 2;
  const beugelPlaatsen = Math.min(POER_MAX_PER_SOORT, Math.floor(POER_MAX_BEUGELS / Math.max(1, perPlaats)));
  return {
    trekband: tb.d > 0 ? tb.lagen.map((laag) => ({ totaal: laag.y.length, y: beperk(laag.y, POER_MAX_PER_SOORT) })) : [],
    beugelX: bg.d > 0 ? beperk(bg.x, beugelPlaatsen) : [],
    beugelXTotaal: bg.d > 0 ? bg.x.length : 0,
    lussenTotaal: lussen,
    lussen: Array.from({ length: Math.min(lussen, POER_MAX_LUSSEN) }, (_, i) => [bg.y[i], bg.y[bg.y.length - 1 - i]] as P2),
    been: bg.y.length % 2 === 1 ? bg.y[(bg.y.length - 1) / 2] : null,
    zijZ: p.zij.d > 0 ? beperk(p.zij.z, POER_MAX_PER_SOORT) : [],
    zijZTotaal: p.zij.d > 0 ? p.zij.z.length : 0,
    bovenY: p.boven.d > 0 ? beperk(p.boven.y, POER_MAX_PER_SOORT) : [],
    bovenYTotaal: p.boven.d > 0 ? p.boven.y.length : 0,
    haarspeldX: p.haarspelden.d > 0 ? beperk(p.haarspelden.x, POER_MAX_PER_SOORT) : [],
    haarspeldXTotaal: p.haarspelden.d > 0 ? p.haarspelden.x.length : 0,
  };
}

/** Hoeveel staven de poer heeft en hoeveel er in het model staan. Een beugel is één staaf. */
export function poerModelTelling(p: PoerDefinitie): { totaal: number; getoond: number } {
  const s = stavenVan(p);
  const perPlaats = s.lussenTotaal + (s.been !== null ? 1 : 0);
  const perPlaatsGetoond = s.lussen.length + (s.been !== null ? 1 : 0);
  return {
    totaal: s.trekband.reduce((som, l) => som + l.totaal, 0) + s.beugelXTotaal * perPlaats + 2 * s.zijZTotaal + s.bovenYTotaal + s.haarspeldXTotaal,
    getoond: s.trekband.reduce((som, l) => som + l.y.length, 0) + s.beugelX.length * perPlaatsGetoond + 2 * s.zijZ.length + s.bovenY.length + s.haarspeldX.length,
  };
}

/**
 * De poer van één blad als IFCX-knopen, zonder kop en zonder de ruimtelijke boom eromheen.
 * De eerste knoop is de wortel (IfcElementAssembly); de paden zijn vaste UUID's, afgeleid
 * van `bladId`. Null als de poer geen volume heeft: dan is er niets te tekenen.
 */
export function poerIfcxKnopen(p: PoerDefinitie, bladId: string, t: PoerModelTeksten = NEDERLANDS): IfcxKnoop[] | null {
  if (!(p.l > 0 && p.b > 0 && p.h > 0)) return null;
  const pad = (naam: string) => uuidVan(`${bladId}/tweepaalspoer/${naam}`);
  const knopen: IfcxKnoop[] = [];
  const kinderen: Record<string, string> = {};
  const korf: Record<string, string> = {};

  const materiaal = (naam: string, kleur: string, dekking = 1, code?: string) => {
    const m = pad(`materiaal/${naam}`);
    knopen.push({
      path: m,
      attributes: {
        ...(code ? { [ATTR.materiaal]: materiaalCode(code) } : {}),
        [ATTR.kleur]: fracties(kleur),
        [ATTR.dekking]: dekking,
      },
    });
    return m;
  };
  /** Een vorm: een knoop zonder klasse, die een element overneemt met `inherits`. */
  const vorm = (naam: string, mesh: object) => {
    const v = pad(`vorm/${naam}`);
    const lichaam = pad(`vorm/${naam}/lichaam`);
    knopen.push({ path: lichaam, attributes: { [ATTR.mesh]: mesh } });
    knopen.push({ path: v, children: { Lichaam: lichaam } });
    return v;
  };

  // ── Beton, palen en kolom ────────────────────────────────────────────────
  const beton = materiaal("beton", BETON_KLEUR, BETON_DEKKING, "CONCRETE");
  const poerVorm = vorm("poer", ifcxBlokMesh(-p.l / 2, p.l / 2, -p.b / 2, p.b / 2, 0, p.h));
  const poerPad = pad("poer");
  knopen.push({
    path: poerPad,
    inherits: { vorm: poerVorm, materiaal: beton },
    attributes: {
      [ATTR.klasse]: ifcKlasse("IfcFooting"),
      [ATTR.naam]: t.poer,
      [ATTR.lengte]: naarM(p.l),
      [ATTR.breedte]: naarM(p.b),
      [ATTR.hoogte]: naarM(p.h),
    },
  });
  kinderen.Poer = poerPad;

  const staand = (naam: string, rond: boolean, x: number, y: number, z0: number, z1: number) =>
    vorm(naam, rond ? cilinder(x, z0, z1) : ifcxBlokMesh(-x / 2, x / 2, -y / 2, y / 2, z0, z1));
  const maatTekst = (rond: boolean, x: number, y: number) => (rond ? `Ø${getal(x)}` : `${getal(x)}×${getal(y)}`);

  if (p.paal.x > 0 && p.paal.y > 0) {
    const paalVorm = staand("paal", p.paal.rond, p.paal.x, p.paal.y, -PAAL_AANZET, p.paal.inbedding);
    const paalMat = materiaal("paal", POER_KLEUREN.paal, 1, "CONCRETE");
    p.paalX.forEach((x, i) => {
      const q = pad(`paal/${i + 1}`);
      knopen.push({
        path: q,
        inherits: { vorm: paalVorm, materiaal: paalMat },
        attributes: {
          [ATTR.klasse]: ifcKlasse("IfcPile"),
          [ATTR.naam]: `${t.paal} ${i + 1}`,
          [ATTR.type]: maatTekst(p.paal.rond, p.paal.x, p.paal.y),
          [ATTR.breedte]: naarM(p.paal.x),
          [ATTR.dikte]: naarM(p.paal.y),
          [ATTR.opmerking]: t.alleenAanzet,
          [ATTR.plaatsing]: verplaatsing(x, 0, 0),
        },
      });
      kinderen[`Paal_${i + 1}`] = q;
    });
  }
  if (p.kolom.x > 0 && p.kolom.y > 0) {
    const kolomVorm = staand("kolom", p.kolom.rond, p.kolom.x, p.kolom.y, p.h, p.h + KOLOM_AANZET);
    const q = pad("kolom");
    knopen.push({
      path: q,
      inherits: { vorm: kolomVorm, materiaal: materiaal("kolom", POER_KLEUREN.kolom, 1, "CONCRETE") },
      attributes: {
        [ATTR.klasse]: ifcKlasse("IfcColumn"),
        [ATTR.naam]: t.kolom,
        [ATTR.type]: maatTekst(p.kolom.rond, p.kolom.x, p.kolom.y),
        [ATTR.breedte]: naarM(p.kolom.x),
        [ATTR.dikte]: naarM(p.kolom.y),
        [ATTR.opmerking]: t.alleenAanzet,
      },
    });
    kinderen.Kolom = q;
  }

  // ── De wapeningskorf ─────────────────────────────────────────────────────
  const s = stavenVan(p);
  /** Een staaf: een vorm uit de korf, met zijn plaatsing, naam en diameter. */
  const staaf = (kind: string, naam: string, vormPad: string, matPad: string, d: number, x: number, y: number, z: number) => {
    const q = pad(`staaf/${kind}`);
    knopen.push({
      path: q,
      inherits: { vorm: vormPad, materiaal: matPad },
      attributes: {
        [ATTR.klasse]: ifcKlasse("IfcReinforcingBar"),
        [ATTR.naam]: naam,
        [ATTR.type]: `Ø${getal(d)}`,
        [ATTR.diameter]: naarM(d),
        [ATTR.plaatsing]: verplaatsing(x, y, z),
      },
    });
    korf[kind] = q;
  };
  const nummer = (i: number) => String(i + 1).padStart(2, "0");
  const staal = (naam: string, kleur: string) => materiaal(naam, kleur, 1, "STEEL");

  const tb = p.trekband;
  if (s.trekband.some((rij) => rij.y.length > 0)) {
    const mat = staal("trekband", POER_KLEUREN.trekband);
    let teller = 0;
    s.trekband.forEach((rij, i) => {
      if (rij.y.length === 0) return;
      const e = tb.xEind[i];
      const z = tb.lagen[i].z;
      const lijn: P2[] = tb.omgebogen
        ? afgerond([[-e, z + tb.lOp], [-e, z], [e, z], [e, z + tb.lOp]], (tb.doorn + tb.d) / 2, BOOG_STUKKEN)
        : [[-e, z], [e, z]];
      const v = vorm(`trekband/${i + 1}`, buis(lijn, "xz", tb.d / 2));
      for (const y of rij.y) {
        staaf(`Trekband_${nummer(teller)}`, `${t.trekband} ${teller + 1}`, v, mat, tb.d, 0, y, 0);
        teller++;
      }
    });
  }

  const bg = p.beugels;
  if (s.beugelX.length > 0 && (s.lussen.length > 0 || s.been !== null)) {
    const mat = staal("beugel", POER_KLEUREN.beugel);
    const hoek = HOEK_STRAAL * bg.d;
    const lusVormen = s.lussen.map(([a, c], i) => vorm(`beugel/${i + 1}`, buis(
      afgerond([[a, bg.zOnder], [c, bg.zOnder], [c, bg.zBoven], [a, bg.zBoven]], hoek, HOEK_STUKKEN, true), "yz", bg.d / 2, true,
    )));
    const beenVorm = s.been !== null ? vorm("beugel/been", buis([[s.been, bg.zOnder], [s.been, bg.zBoven]], "yz", bg.d / 2)) : null;
    let teller = 0;
    for (const x of s.beugelX) {
      for (const v of lusVormen) {
        staaf(`Beugel_${nummer(teller)}`, `${t.beugel} ${teller + 1}`, v, mat, bg.d, x, 0, 0);
        teller++;
      }
      if (beenVorm) {
        staaf(`Beugel_${nummer(teller)}`, `${t.beugel} ${teller + 1}`, beenVorm, mat, bg.d, x, 0, 0);
        teller++;
      }
    }
  }

  const xStaaf = p.l / 2 - p.c_z;
  if (s.zijZ.length > 0) {
    const mat = staal("zijstaaf", POER_KLEUREN.overig);
    const v = vorm("zijstaaf", buis([[-xStaaf, 0], [xStaaf, 0]], "xz", p.zij.d / 2));
    let teller = 0;
    for (const z of s.zijZ) {
      for (const y of [-p.zij.y, p.zij.y]) {
        staaf(`Zijstaaf_${nummer(teller)}`, `${t.zijstaaf} ${teller + 1}`, v, mat, p.zij.d, 0, y, z);
        teller++;
      }
    }
  }
  if (s.bovenY.length > 0) {
    const mat = staal("bovenstaaf", POER_KLEUREN.overig);
    const v = vorm("bovenstaaf", buis([[-xStaaf, 0], [xStaaf, 0]], "xz", p.boven.d / 2));
    s.bovenY.forEach((y, i) => staaf(`Bovenstaaf_${nummer(i)}`, `${t.bovenstaaf} ${i + 1}`, v, mat, p.boven.d, 0, y, p.boven.z));
  }
  if (s.haarspeldX.length > 0) {
    const hp = p.haarspelden;
    const mat = staal("haarspeld", POER_KLEUREN.haarspeld);
    // De breedte om de trekband, zoals in de dwarsdoorsnede op de tekening.
    const yH = Math.max(0, tb.lagen[0]?.y.length ? Math.max(...tb.lagen[0].y) : 0) + tb.d / 2 + hp.d;
    const v = vorm("haarspeld", buis(
      afgerond([[-yH, hp.zBoven], [-yH, hp.z], [yH, hp.z], [yH, hp.zBoven]], HOEK_STRAAL * hp.d, HOEK_STUKKEN), "yz", hp.d / 2,
    ));
    s.haarspeldX.forEach((x, i) => staaf(`Haarspeld_${nummer(i)}`, `${t.haarspeld} ${i + 1}`, v, mat, hp.d, x, 0, 0));
  }

  const telling = poerModelTelling(p);
  if (Object.keys(korf).length > 0) {
    const q = pad("korf");
    knopen.push({
      path: q,
      children: korf,
      attributes: {
        [ATTR.klasse]: ifcKlasse("IfcElementAssembly"),
        [ATTR.naam]: t.korf,
        [ATTR.aantal]: telling.totaal,
        [ATTR.getoond]: telling.getoond,
      },
    });
    kinderen.Wapeningskorf = q;
  }

  const wortel: IfcxKnoop = {
    path: pad("wortel"),
    children: kinderen,
    attributes: {
      [ATTR.klasse]: ifcKlasse("IfcElementAssembly"),
      [ATTR.naam]: t.tweepaalspoer,
      [ATTR.omschrijving]: `${t.tweepaalspoer} ${getal(p.l)}×${getal(p.b)}×${getal(p.h)}, ${t.hartOpHart} ${getal(p.a)}`,
    },
  };
  return [wortel, ...knopen];
}

/**
 * De poer als compleet IFCX-bestand: kop, imports, schema's, de ruimtelijke boom en de
 * knopen, met een vast tijdstip: gelijke invoer geeft zo een gelijk document. Bij het
 * bewaren komt het echte tijdstip erin (ifcxBewaren.ts).
 */
export function poerIfcxDocument(p: PoerDefinitie, opties: { bladId?: string; teksten?: PoerModelTeksten } = {}): IfcxBestand | null {
  const bladId = opties.bladId ?? "tweepaalspoer";
  const t = opties.teksten ?? NEDERLANDS;
  const knopen = poerIfcxKnopen(p, bladId, t);
  if (!knopen) return null;
  const pad = (naam: string) => uuidVan(`${bladId}/tweepaalspoer/ruimte/${naam}`);
  const laag = (naam: string, klasse: string, titel: string, kinderen: Record<string, string>): IfcxKnoop => ({
    path: pad(naam),
    children: kinderen,
    attributes: { [ATTR.klasse]: ifcKlasse(klasse), [ATTR.naam]: titel },
  });
  return {
    header: {
      id: `${bladId}.ifcx`,
      ifcxVersion: "ifcx_alpha",
      dataVersion: "1.0.0",
      author: "Open CalcSheet Studio",
      timestamp: "2026-01-01T00:00:00Z",
    },
    imports: BALKLAAG_IFCX_IMPORTS,
    schemas: POER_IFCX_SCHEMAS,
    data: [
      laag("project", "IfcProject", t.project, { Terrein: pad("terrein") }),
      laag("terrein", "IfcSite", t.terrein, { Gebouw: pad("gebouw") }),
      laag("gebouw", "IfcBuilding", t.gebouw, { Verdieping: pad("verdieping") }),
      laag("verdieping", "IfcBuildingStorey", t.verdieping, { Tweepaalspoer: knopen[0].path }),
      ...knopen,
    ],
  };
}
