import { uuidVan } from './ifcx/identiteit.js';
import { ifcKlasse } from './ifcx/namespace.js';
import type { IfcxBestand, IfcxImport, IfcxKnoop, IfcxSchema } from './ifcx/typen.js';

/**
 * Een stukje houten balklaag als IFCX (IFC5): de balken met hun doorsnede,
 * h.o.h.-afstand en overspanning, de vloerplaat en de opleggingen, of bij een
 * raveelbalk de raveling langs de sparing. Elk element draagt zijn naam,
 * materiaal, sterkteklasse, maten en unity check als attributen.
 *
 * Wat de specificatie zegt, en waar dit bestand zich aan houdt
 * (buildingSMART/IFC5-development, schema/ifcx.tsp en de voorbeelden, gecontroleerd
 * tegen de bestanden op ifcx.dev):
 *   - `header` met `id`, `ifcxVersion: "ifcx_alpha"`, `dataVersion`, `author` en
 *     `timestamp`, alle vijf verplicht;
 *   - een `path` is een identiteit zonder `/`; hier een vaste UUID, afgeleid van
 *     het blad (ifcx/identiteit.ts);
 *   - `usd::usdgeom::mesh`: `points` als [[x, y, z], …] en `faceVertexIndices` als
 *     driehoeken, zonder `faceVertexCounts`;
 *   - `usd::xformop`: `transform` als 4×4 op rijen, de verplaatsing op de laatste rij;
 *   - maten in meters, z omhoog, zoals alle voorbeelden;
 *   - elk attribuut heeft een beschrijving onder `schemas` of in een import; wat de
 *     standaard niet kent (de unity check), staat onder `ocss::calc::…`.
 *
 * Assen: x langs de balken met x = 0 op het hart van de eerste oplegging, y dwars
 * op de balken met y = 0 op het hart van de eerste balk, z = 0 onder de balken.
 *
 * Eén profiel en één materiaal zijn een eigen knoop; de balken nemen die over met
 * `inherits` en krijgen alleen een eigen plaatsing, zoals de ramen in
 * `hello-wall.ifcx`. Een balklaag van twaalf balken blijft zo klein genoeg om
 * bij elke herberekening in de uitwerking te staan.
 */

/** De invoer en de uitkomsten van een balklaagblad. Lengtes in mm. */
export interface BalklaagInvoer {
  /** Breedte en hoogte van de balk. */
  b: number;
  h: number;
  hoh: number;
  /** 1 enkelvoudig, 2 overstek, 3 twee velden, 4 raveelbalk. */
  schema: number;
  /** De ligger is een onderslag: één balk, zonder vloerplaat. */
  onderslag: boolean;
  /** De vloerplaat werkt mee als flens. */
  tBalk: boolean;
  /** Theoretische overspanning (van het eerste veld), hart op hart van de opleggingen. */
  Lth: number;
  aOpl: number;
  /** Opleglengte op het tussensteunpunt. */
  aSteun: number;
  aOver: number;
  Lveld2: number;
  bSparing: number;
  lStaart: number;
  tVloer: number;
  /** Breedte van het vloerveld; null als het blad die niet kent. */
  bVloer: number | null;
  sterkteklasse: string;
  /** Dichtheid in kg/m³; null als het blad die niet kent. */
  dichtheid: number | null;
  /** De soort plaat bij een T-balk: "OSB/3", "Multiplex", …; zonder T-balk null. */
  plaat: string | null;
  /** De unity checks van het blad, voor zover die er zijn. */
  uc: {
    max?: number;
    buiging?: number;
    afschuiving?: number;
    oplegdruk?: number;
    kip?: number;
    blijvend?: number;
    doorbuiging?: number;
    bijkomend?: number;
    trilling?: number;
    flens?: number;
    lijmnaad?: number;
    flensbreedte?: number;
  };
}

/** Zoveel balken toont een beeld hooguit; bij een grotere vloer is het een representatief stuk. */
export const BALKLAAG_MAX_BALKEN = 12;
/** Zoveel balken als het blad geen breedte van het vloerveld kent (de trillingstoets staat uit). */
const ZONDER_BREEDTE = 5;

const STERKTEKLASSEN: Readonly<Record<number, string>> = { 1: 'C18', 2: 'C24', 3: 'C30', 4: 'GL24h', 5: 'GL28h' };
const PLATEN: Readonly<Record<number, string>> = {
  1: 'Multiplex', 2: 'Multiplex', 3: 'OSB/3', 4: 'OSB/3', 5: 'Spaanplaat of vezelplaat',
};

const ATTR = {
  klasse: 'bsi::ifc::class',
  materiaal: 'bsi::ifc::material',
  naam: 'bsi::ifc::prop::Name',
  omschrijving: 'bsi::ifc::prop::Description',
  type: 'bsi::ifc::prop::TypeName',
  lengte: 'bsi::ifc::prop::Length',
  breedte: 'bsi::ifc::prop::Width',
  hoogte: 'bsi::ifc::prop::Height',
  dikte: 'bsi::ifc::prop::Depth',
  doorsnede: 'bsi::ifc::prop::CrossSectionArea',
  volume: 'bsi::ifc::prop::NetVolume',
  sterkteklasse: 'bsi::ifc-mat::prop::StrengthClass',
  dichtheid: 'bsi::ifc-mat::prop::MassDensity',
  kleur: 'bsi::ifc::presentation::diffuseColor',
  dekking: 'bsi::ifc::presentation::opacity',
  mesh: 'usd::usdgeom::mesh',
  plaatsing: 'usd::xformop',
  uc: 'ocss::calc::unityCheck',
  toetsen: 'ocss::calc::toetsen',
  hoh: 'ocss::calc::hartOpHart',
  overspanning: 'ocss::calc::overspanning',
  aantal: 'ocss::calc::aantalBalken',
  getoond: 'ocss::calc::aantalGetoond',
  opmerking: 'ocss::calc::opmerking',
} as const;

/** Wat de attributen van dit bestand beschrijft: de bestanden van de standaard. */
export const BALKLAAG_IFCX_IMPORTS: IfcxImport[] = [
  { uri: 'https://ifcx.dev/@standards.buildingsmart.org/ifc/core/ifc@v5a.ifcx' },
  { uri: 'https://ifcx.dev/@standards.buildingsmart.org/ifc/core/prop@v5a.ifcx' },
  { uri: 'https://ifcx.dev/@standards.buildingsmart.org/ifc/ifc-mat/ifc-mat@v1.0.0.ifcx' },
  { uri: 'https://ifcx.dev/@openusd.org/usd@v1.ifcx' },
];

/** De beschrijving van de eigen attributen. */
export const BALKLAAG_IFCX_SCHEMAS: Record<string, IfcxSchema> = {
  [ATTR.uc]: { value: { dataType: 'Real' } },
  [ATTR.toetsen]: { value: { dataType: 'Object' } },
  [ATTR.hoh]: { value: { dataType: 'Real', quantityKind: 'Length' } },
  [ATTR.overspanning]: { value: { dataType: 'Real', quantityKind: 'Length' } },
  [ATTR.aantal]: { value: { dataType: 'Integer' } },
  [ATTR.getoond]: { value: { dataType: 'Integer' } },
  [ATTR.opmerking]: { value: { dataType: 'String' } },
};

// Kleuren als fracties, zoals `diffuseColor` ze wil: hout en plaat in de kleuren
// van de tekeningen, de oplegging grijs. Op papier blijven de randen het verschil maken.
const HOUT = [0.89, 0.753, 0.541];
const PLAATKLEUR = [0.941, 0.878, 0.753];
const GRIJS = [0.722, 0.702, 0.671];
/** De plaat is doorzichtig: anders is er van bovenaf geen balk te zien. */
const PLAAT_DEKKING = 0.45;
/** Hoogte van een oplegging in het beeld; het blad zegt daar niets over. */
const OPLEGGING_HOOGTE = 100;
/** Hoe ver een raveling doorloopt voorbij de raveelbalk, in het beeld. */
const STOMP_MIN = 1000;

const naarM = (mm: number) => Math.round(mm * 1e3) / 1e6;
const uitM = (m: number) => Math.round(m * 1e6) / 1e6;
/** `bsi::ifc::material` wil een code en een uri; IFC zelf heeft geen klasse per materiaal. */
const WOOD = { code: 'WOOD', uri: 'https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/IfcMaterial' };

/** Een blok met de kanten evenwijdig aan de assen, in mm; 24 punten, want elk vlak heeft zijn eigen normaal. */
function blok(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
  const [a, b, c, d, e, f] = [x0, x1, y0, y1, z0, z1].map(naarM);
  const vlakken: number[][][] = [
    [[a, c, e], [a, d, e], [b, d, e], [b, c, e]], // onder
    [[a, c, f], [b, c, f], [b, d, f], [a, d, f]], // boven
    [[a, c, e], [b, c, e], [b, c, f], [a, c, f]], // voor
    [[b, d, e], [a, d, e], [a, d, f], [b, d, f]], // achter
    [[a, d, e], [a, c, e], [a, c, f], [a, d, f]], // links
    [[b, c, e], [b, d, e], [b, d, f], [b, c, f]], // rechts
  ];
  const points: number[][] = [];
  const faceVertexIndices: number[] = [];
  for (const vlak of vlakken) {
    const i = points.length;
    points.push(...vlak);
    faceVertexIndices.push(i, i + 1, i + 2, i, i + 2, i + 3);
  }
  return { points, faceVertexIndices };
}

const verplaatsing = (x: number, y: number, z: number) => ({
  transform: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [naarM(x), naarM(y), naarM(z), 1]],
});

const eindig = (w: Record<string, number | undefined>): Record<string, number> =>
  Object.fromEntries(Object.entries(w).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1])));

/** De maatgevende waarde van een rij unity checks; null als er geen enkele is. */
function grootste(w: Record<string, number>): number | null {
  const v = Object.values(w);
  return v.length ? Math.max(...v) : null;
}

/** Het aantal balken bij deze breedte en h.o.h.: de eerste op 0, dan elke h.o.h. één, en minstens twee. */
export function balklaagAantalBalken(bVloer: number | null, hoh: number): number {
  if (!(hoh > 0)) return 2;
  if (bVloer === null || !(bVloer > 0)) return ZONDER_BREEDTE;
  return Math.max(2, Math.floor(bVloer / hoh + 1e-9) + 1);
}

/**
 * Het stuk balklaag van één blad als IFCX-knopen, zonder kop en zonder de
 * ruimtelijke boom eromheen. De eerste knoop is de wortel van dit blad
 * (IfcElementAssembly); de paden zijn vaste UUID's, afgeleid van `bladId` en de
 * plek in de balklaag, dus gelijk bij elke herberekening.
 *
 * Voor het projectbestand: `IfcCalcSheet.geometrie`. De knopen gebruiken de
 * imports in BALKLAAG_IFCX_IMPORTS en de beschrijvingen in BALKLAAG_IFCX_SCHEMAS.
 */
export function balklaagIfcxKnopen(invoer: BalklaagInvoer, bladId: string): IfcxKnoop[] {
  const pad = (naam: string) => uuidVan(`${bladId}/balklaag/${naam}`);
  const { b, h, hoh, schema, onderslag, tBalk, Lth, aOpl, aSteun, aOver, Lveld2, bSparing, lStaart, tVloer, uc } = invoer;
  const type = `${b}×${h} ${invoer.sterkteklasse}`;
  const knopen: IfcxKnoop[] = [];
  const kinderen: Record<string, string> = {};

  // ── materialen ────────────────────────────────────────────────────────────
  const hout = pad('materiaal/hout');
  knopen.push({
    path: hout,
    attributes: {
      [ATTR.materiaal]: WOOD,
      [ATTR.sterkteklasse]: invoer.sterkteklasse,
      ...(invoer.dichtheid !== null ? { [ATTR.dichtheid]: invoer.dichtheid } : {}),
      [ATTR.kleur]: HOUT,
      [ATTR.dekking]: 1,
    },
  });
  const steun = pad('materiaal/oplegging');
  knopen.push({ path: steun, attributes: { [ATTR.kleur]: GRIJS, [ATTR.dekking]: 1 } });

  // ── het profiel: eigen knoop per lengte, gedeeld door de balken ───────────
  const profielen = new Map<number, string>();
  const profiel = (lengte: number): string => {
    const bestaand = profielen.get(lengte);
    if (bestaand) return bestaand;
    const p = pad(`profiel/${lengte}`);
    const lichaam = pad(`profiel/${lengte}/lichaam`);
    knopen.push({ path: lichaam, attributes: { [ATTR.mesh]: blok(0, lengte, -b / 2, b / 2, 0, h) } });
    knopen.push({
      path: p,
      children: { Lichaam: lichaam },
      attributes: {
        [ATTR.type]: type,
        [ATTR.breedte]: naarM(b),
        [ATTR.hoogte]: naarM(h),
        [ATTR.lengte]: naarM(lengte),
        [ATTR.doorsnede]: uitM(naarM(b) * naarM(h)),
        [ATTR.volume]: uitM(naarM(b) * naarM(h) * naarM(lengte)),
      },
    });
    profielen.set(lengte, p);
    return p;
  };

  /** Een balk: het profiel met een plaatsing, een naam en de uitkomst. */
  const balk = (kind: string, naam: string, lengte: number, x: number, y: number, extra: Record<string, unknown>) => {
    const p = pad(`balk/${kind}`);
    knopen.push({
      path: p,
      inherits: { profiel: profiel(lengte), materiaal: hout },
      attributes: {
        [ATTR.klasse]: ifcKlasse('IfcBeam'),
        [ATTR.naam]: naam,
        [ATTR.plaatsing]: verplaatsing(x, y, 0),
        ...extra,
      },
    });
    kinderen[kind] = p;
  };

  const toetsenBalk = eindig({
    buiging: uc.buiging, afschuiving: uc.afschuiving, oplegdruk: uc.oplegdruk, kip: uc.kip,
    blijvend: uc.blijvend, doorbuiging: uc.doorbuiging, bijkomend: uc.bijkomend, trilling: uc.trilling,
  });
  const ucBalk = Number.isFinite(uc.max) ? uc.max! : grootste(toetsenBalk);
  const metUitkomst: Record<string, unknown> = {
    [ATTR.hoh]: naarM(hoh),
    [ATTR.overspanning]: naarM(Lth),
    ...(ucBalk !== null ? { [ATTR.uc]: ucBalk } : {}),
    ...(Object.keys(toetsenBalk).length ? { [ATTR.toetsen]: toetsenBalk } : {}),
  };

  /** Een oplegging onder de balken: een strook van `breedte` langs x, over y0…y1. */
  const oplegging = (nr: number, x: number, breedte: number, y0: number, y1: number) => {
    const p = pad(`oplegging/${nr}`);
    const lichaam = pad(`oplegging/${nr}/lichaam`);
    knopen.push({ path: lichaam, attributes: { [ATTR.mesh]: blok(x - breedte / 2, x + breedte / 2, y0, y1, -OPLEGGING_HOOGTE, 0) } });
    knopen.push({
      path: p,
      children: { Lichaam: lichaam },
      inherits: { materiaal: steun },
      attributes: {
        [ATTR.klasse]: ifcKlasse('IfcBearing'),
        [ATTR.naam]: `Oplegging ${nr}`,
        [ATTR.breedte]: naarM(breedte),
        [ATTR.lengte]: naarM(y1 - y0),
        ...(Number.isFinite(uc.oplegdruk) ? { [ATTR.uc]: uc.oplegdruk } : {}),
        [ATTR.opmerking]: 'Materiaal en hoogte van de oplegging vallen buiten dit blad; de unity check is de oplegdruk op de balk (6.1.5).',
      },
    });
    kinderen[`Oplegging_${nr}`] = p;
  };

  /** De vloerplaat, uit één of meer rechthoeken (x0, x1, y0, y1). */
  const vloerplaat = (delen: [number, number, number, number][], lengte: number, breedte: number) => {
    const toetsenPlaat = eindig({ flens: uc.flens, lijmnaad: uc.lijmnaad, flensbreedte: uc.flensbreedte });
    const ucPlaat = tBalk ? grootste(toetsenPlaat) : null;
    const materiaal = pad('materiaal/plaat');
    knopen.push({
      path: materiaal,
      attributes: {
        [ATTR.materiaal]: WOOD,
        [ATTR.sterkteklasse]: invoer.plaat ?? 'niet opgegeven',
        [ATTR.kleur]: PLAATKLEUR,
        [ATTR.dekking]: PLAAT_DEKKING,
      },
    });
    const p = pad('vloerplaat');
    const kind: Record<string, string> = {};
    delen.forEach(([x0, x1, y0, y1], i) => {
      const lichaam = pad(`vloerplaat/lichaam/${i + 1}`);
      knopen.push({ path: lichaam, attributes: { [ATTR.mesh]: blok(x0, x1, y0, y1, h, h + tVloer) } });
      kind[delen.length === 1 ? 'Lichaam' : `Lichaam_${i + 1}`] = lichaam;
    });
    knopen.push({
      path: p,
      children: kind,
      inherits: { materiaal },
      attributes: {
        // Een meewerkende plaat is een constructief deel, gewoon beschot een afwerking.
        [ATTR.klasse]: ifcKlasse(tBalk ? 'IfcSlab' : 'IfcCovering'),
        [ATTR.naam]: tBalk ? `Vloerplaat ${invoer.plaat ?? ''}, meewerkend als flens`.replace('  ', ' ') : 'Beschot',
        [ATTR.lengte]: naarM(lengte),
        [ATTR.breedte]: naarM(breedte),
        [ATTR.dikte]: naarM(tVloer),
        ...(ucPlaat !== null ? { [ATTR.uc]: ucPlaat, [ATTR.toetsen]: toetsenPlaat } : {}),
        ...(tBalk ? {} : { [ATTR.opmerking]: 'Telt in dit blad mee in de trillingstoets, niet als flens; geen eigen unity check.' }),
      },
    });
    kinderen.Vloerplaat = p;
  };

  // ── de balklaag ───────────────────────────────────────────────────────────
  let omschrijving: string;
  let aantalAttr: Record<string, unknown> = {};
  const x0 = -aOpl / 2;

  if (schema === 4) {
    // Raveelbalk: de staartbalken van de muur op x = 0 tot de raveelbalk, de
    // raveelbalk tussen de dubbele wisselbalken, en daarnaast doorgaande balken.
    const xRav = lStaart;
    const stomp = Math.max(STOMP_MIN, 0.6 * lStaart);
    const xEind = xRav + b + stomp;
    const lengteDoor = xEind - x0;
    const lengteStaart = xRav - x0;
    const nStaart = Math.max(1, Math.floor(bSparing / hoh) - 1);
    for (let i = 1; i <= nStaart; i++) {
      balk(`Staartbalk_${String(i).padStart(2, '0')}`, `Staartbalk ${i}`, lengteStaart, x0, (i * bSparing) / (nStaart + 1), {
        [ATTR.opmerking]: 'Niet getoetst in dit blad; zet zijn oplegreactie af op de raveelbalk.',
      });
    }
    // De raveelbalk staat dwars: hij ligt langs y, met zijn breedte langs x.
    const pRav = pad('balk/Raveelbalk');
    const lichaamRav = pad('balk/Raveelbalk/lichaam');
    knopen.push({ path: lichaamRav, attributes: { [ATTR.mesh]: blok(xRav, xRav + b, 0, bSparing, 0, h) } });
    knopen.push({
      path: pRav,
      children: { Lichaam: lichaamRav },
      inherits: { materiaal: hout },
      attributes: {
        [ATTR.klasse]: ifcKlasse('IfcBeam'),
        [ATTR.naam]: 'Raveelbalk',
        [ATTR.type]: type,
        [ATTR.breedte]: naarM(b),
        [ATTR.hoogte]: naarM(h),
        [ATTR.lengte]: naarM(bSparing),
        ...metUitkomst,
      },
    });
    kinderen.Raveelbalk = pRav;
    // De wisselbalken: dubbel, met de binnenkant op de rand van de sparing.
    for (const [kant, y] of [['links', -b], ['rechts', bSparing + b]] as const) {
      const p = pad(`balk/Wisselbalk_${kant}`);
      const lichaam = pad(`balk/Wisselbalk_${kant}/lichaam`);
      knopen.push({ path: lichaam, attributes: { [ATTR.mesh]: blok(x0, xEind, y - b, y + b, 0, h) } });
      knopen.push({
        path: p,
        children: { Lichaam: lichaam },
        inherits: { materiaal: hout },
        attributes: {
          [ATTR.klasse]: ifcKlasse('IfcBeam'),
          [ATTR.naam]: `Wisselbalk ${kant}`,
          [ATTR.type]: `2×${type}`,
          [ATTR.breedte]: naarM(2 * b),
          [ATTR.hoogte]: naarM(h),
          [ATTR.lengte]: naarM(lengteDoor),
          [ATTR.opmerking]: 'Niet getoetst in dit blad; draagt de raveelbalk.',
        },
      });
      kinderen[`Wisselbalk_${kant}`] = p;
    }
    for (const [i, y] of [-2 * b - hoh, -2 * b - 2 * hoh, bSparing + 2 * b + hoh, bSparing + 2 * b + 2 * hoh].entries()) {
      balk(`Balk_${String(i + 1).padStart(2, '0')}`, `Doorgaande balk ${i + 1}`, lengteDoor, x0, y, {
        [ATTR.opmerking]: 'Niet getoetst in dit blad.',
      });
    }
    const yL = -2 * b - 2 * hoh - hoh / 2;
    const yR = bSparing + 2 * b + 2 * hoh + hoh / 2;
    // De plaat rond de sparing: links, rechts en het deel boven de staartbalken.
    vloerplaat([[x0, xEind, yL, 0], [x0, xEind, bSparing, yR], [x0, xRav + b, 0, bSparing]], lengteDoor, yR - yL);
    oplegging(1, 0, aOpl, yL, yR);
    omschrijving = `Raveelbalk ${type} over een sparing van ${bSparing} mm, staartlengte ${lStaart} mm, ${nStaart} staartbalken`;
  } else {
    const tweeVelden = schema === 3;
    const overstek = schema === 2;
    const xEind = tweeVelden ? Lth + Lveld2 + aOpl / 2 : overstek ? Lth + aOver : Lth + aOpl / 2;
    const lengte = xEind - x0;
    const steunen: [number, number][] = tweeVelden
      ? [[0, aOpl], [Lth, aSteun], [Lth + Lveld2, aOpl]]
      : [[0, aOpl], [Lth, aOpl]];
    if (onderslag) {
      balk('Onderslag', 'Onderslag', lengte, x0, 0, metUitkomst);
      steunen.forEach(([x, a], i) => oplegging(i + 1, x, a, -1.5 * b, 1.5 * b));
      omschrijving = `Onderslag ${type}, overspanning ${Lth} mm, lengte ${lengte} mm`;
    } else {
      const nEcht = balklaagAantalBalken(invoer.bVloer, hoh);
      const n = Math.min(nEcht, BALKLAAG_MAX_BALKEN);
      for (let i = 0; i < n; i++) {
        balk(`Balk_${String(i + 1).padStart(2, '0')}`, `Balk ${i + 1}`, lengte, x0, i * hoh, metUitkomst);
      }
      const yL = -hoh / 2;
      const yR = (n - 1) * hoh + hoh / 2;
      vloerplaat([[x0, xEind, yL, yR]], lengte, yR - yL);
      steunen.forEach(([x, a], i) => oplegging(i + 1, x, a, yL, yR));
      aantalAttr = { [ATTR.aantal]: nEcht, [ATTR.getoond]: n };
      omschrijving = `${n < nEcht ? `Representatief stuk: ${n} van de ${nEcht}` : n} balken ${type}, h.o.h. ${hoh} mm, overspanning ${Lth} mm`;
    }
  }

  const wortel: IfcxKnoop = {
    path: pad('wortel'),
    children: kinderen,
    attributes: {
      [ATTR.klasse]: ifcKlasse('IfcElementAssembly'),
      [ATTR.naam]: 'Balklaag',
      [ATTR.omschrijving]: omschrijving,
      ...aantalAttr,
      ...(Number.isFinite(uc.max) ? { [ATTR.uc]: uc.max } : {}),
    },
  };
  return [wortel, ...knopen];
}

/** De opties van een los document. */
export interface BalklaagDocumentOpties {
  bladId?: string;
  auteur?: string;
  /** ISO 8601. Bij het rekenen een vaste waarde: gelijke invoer geeft zo een gelijk document. */
  tijdstip?: string;
  projectNaam?: string;
}

/**
 * Het stuk balklaag als compleet IFCX-bestand: kop, imports, schema's, de
 * ruimtelijke boom (project, terrein, gebouw, verdieping) en de knopen.
 */
export function balklaagIfcxDocument(invoer: BalklaagInvoer, opties: BalklaagDocumentOpties = {}): IfcxBestand {
  const bladId = opties.bladId ?? 'balklaag';
  const knopen = balklaagIfcxKnopen(invoer, bladId);
  const pad = (naam: string) => uuidVan(`${bladId}/balklaag/ruimte/${naam}`);
  const laag = (naam: string, klasse: string, titel: string, kinderen: Record<string, string>): IfcxKnoop => ({
    path: pad(naam),
    children: kinderen,
    attributes: { [ATTR.klasse]: ifcKlasse(klasse), [ATTR.naam]: titel },
  });
  return {
    header: {
      id: `${bladId}.ifcx`,
      ifcxVersion: 'ifcx_alpha',
      dataVersion: '1.0.0',
      author: opties.auteur ?? 'Open CalcSheet Studio',
      timestamp: opties.tijdstip ?? '2026-01-01T00:00:00Z',
    },
    imports: BALKLAAG_IFCX_IMPORTS,
    schemas: BALKLAAG_IFCX_SCHEMAS,
    data: [
      laag('project', 'IfcProject', opties.projectNaam ?? 'Project', { Terrein: pad('terrein') }),
      laag('terrein', 'IfcSite', 'Terrein', { Gebouw: pad('gebouw') }),
      laag('gebouw', 'IfcBuilding', 'Gebouw', { Verdieping: pad('verdieping') }),
      laag('verdieping', 'IfcBuildingStorey', 'Verdieping', { Balklaag: knopen[0].path }),
      ...knopen,
    ],
  };
}

/**
 * Hetzelfde document met paden van een ander blad: alle paden worden opnieuw
 * afgeleid. Bij het bewaren: de uitwerking kent het blad-id niet, en twee
 * bewaarde bladen mogen elkaars knopen niet overschrijven als ze samen worden
 * ingelezen.
 */
export function ifcxVoorBlad<T extends { data: IfcxKnoop[] }>(document: T, bladId: string): T {
  const nieuw = new Map(document.data.map((k) => [k.path, uuidVan(`${bladId}/${k.path}`)]));
  const doelen = (r?: Record<string, string | null>) =>
    r && Object.fromEntries(Object.entries(r).map(([n, d]) => [n, d === null ? null : nieuw.get(d) ?? d]));
  return {
    ...document,
    data: document.data.map((k) => ({
      ...k,
      path: nieuw.get(k.path) ?? k.path,
      ...(k.children ? { children: doelen(k.children) } : {}),
      ...(k.inherits ? { inherits: doelen(k.inherits) } : {}),
    })),
  };
}

// ── Uit het doorgerekende blad ────────────────────────────────────────────

interface MetEenheid {
  toNumber(eenheid?: string): number;
  formatUnits(): string;
}

function alsMaat(v: unknown, eenheid: string): number | undefined {
  if (typeof v === 'number') return v;
  if (typeof v === 'object' && v !== null && typeof (v as MetEenheid).toNumber === 'function') {
    try {
      return (v as MetEenheid).toNumber(eenheid);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

/**
 * De invoer van de generator uit de waarden van een doorgerekend balklaagblad
 * (`extractScope`, of de scope tijdens het rekenen). Null als dit geen
 * balklaagblad is.
 */
export function balklaagInvoerUitScope(scope: Record<string, unknown>): BalklaagInvoer | null {
  const mm = (naam: string) => alsMaat(scope[naam], 'mm');
  const getal = (naam: string): number | undefined => {
    const v = scope[naam];
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    // Een verhouding met eenheden die wegvallen, staat soms nog als grootheid in de scope.
    const u = v as (MetEenheid & { dimensions?: number[] }) | undefined;
    if (u && typeof u.toNumber === 'function' && u.dimensions?.every((d) => d === 0)) return u.toNumber();
    return undefined;
  };
  /** Een unity check op vier decimalen: meer zegt een uitkomst niet. */
  const uc = (naam: string) => {
    const w = getal(naam);
    return w === undefined ? undefined : Math.round(w * 1e4) / 1e4;
  };
  const b = mm('b_balk');
  const h = mm('h_balk');
  if (!b || !h || !(b > 0) || !(h > 0)) return null;
  const rond = (v: number | undefined) => (v === undefined ? 0 : Math.round(v * 1000) / 1000);
  const bVloerM = alsMaat(scope.b_vloer, 'mm');
  const tb = getal('tb') === 1;
  const dichtheid = alsMaat(scope.ρ_mean, 'kg/m^3');
  const aOpl = rond(mm('a_opl'));
  const aSteun = rond(mm('a_steun'));
  return {
    b: rond(b),
    h: rond(h),
    hoh: rond(mm('hoh')),
    schema: getal('schema') ?? 1,
    onderslag: getal('ond') === 1,
    tBalk: tb,
    Lth: rond(mm('L_th')),
    aOpl,
    aSteun: aSteun > 0 ? aSteun : aOpl,
    aOver: rond(mm('a_over')),
    Lveld2: rond(mm('L_veld2')),
    bSparing: rond(mm('b_sparing')),
    lStaart: rond(mm('l_staart')),
    tVloer: rond(mm('t_vloer')),
    bVloer: bVloerM !== undefined && bVloerM > 0 ? rond(bVloerM) : null,
    sterkteklasse: STERKTEKLASSEN[getal('sterkteklasse') ?? 0] ?? 'onbekend',
    dichtheid: dichtheid !== undefined ? Math.round(dichtheid * 1000) / 1000 : null,
    plaat: tb ? PLATEN[getal('plaat') ?? 0] ?? null : null,
    uc: {
      max: uc('UC_max'),
      buiging: uc('UC_buiging'),
      afschuiving: uc('UC_afsch'),
      oplegdruk: uc('UC_c90'),
      kip: uc('UC_kip'),
      blijvend: uc('UC_G'),
      doorbuiging: uc('UC_doorbuiging'),
      bijkomend: uc('UC_bij'),
      trilling: uc('UC_trilling'),
      flens: uc('UC_flens'),
      lijmnaad: uc('UC_lijm'),
      flensbreedte: uc('UC_bf'),
    },
  };
}

/**
 * De knopen van een doorgerekend balklaagblad; null als dit geen balklaagblad
 * is. Dit is de functie voor `IfcCalcSheet.geometrie`:
 *
 *   geometrie: balklaagIfcxKnopenUitScope(ex.id, extractScope(parse(ex.source, opties), ex.waarden)) ?? undefined
 */
export function balklaagIfcxKnopenUitScope(bladId: string, scope: Record<string, unknown>): IfcxKnoop[] | null {
  const invoer = balklaagInvoerUitScope(scope);
  return invoer ? balklaagIfcxKnopen(invoer, bladId) : null;
}
