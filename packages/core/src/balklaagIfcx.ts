import { uuidVan } from './ifcx/identiteit.js';
import { ifcKlasse } from './ifcx/namespace.js';
import type { IfcxBestand, IfcxImport, IfcxKnoop, IfcxSchema } from './ifcx/typen.js';

/**
 * Een stukje houten balklaag als IFCX (IFC5): de balken met hun doorsnede,
 * h.o.h.-afstand en overspanning, de vloerplaat en de opleggingen, of bij een
 * raveelbalk de raveling langs de sparing. Elk element draagt zijn naam,
 * materiaal, sterkteklasse, maten en unity check als attributen. De namen en
 * opmerkingen volgen de taal van de uitvoer (`taal`, standaard Nederlands); de paden
 * en de attribuutnamen van de standaard blijven gelijk.
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
  /** De wisselbalk bij een raveelbalk (schema 4); ontbreekt bij een blad uit een oudere versie. */
  wissel?: {
    /** Overspanning, hart op hart van de opleggingen. */
    L: number;
    /** Breedte per balk, hoogte en aantal samengestelde balken. */
    b: number;
    h: number;
    n: number;
    /** Lengte van de sparing langs de balken; 0: tot de oplegging, dan één raveelbalk. */
    lSparing: number;
    sterkteklasse: string;
  };
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
    /** De wisselbalk: de maatgevende en per toets. */
    wissel?: number;
    wisselBuiging?: number;
    wisselAfschuiving?: number;
    wisselOplegdruk?: number;
    wisselBlijvend?: number;
    wisselDoorbuiging?: number;
    wisselBijkomend?: number;
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

/** De teksten in het document, per taal. Wat de gebruiker in het viewerpaneel leest. */
const TEKST_NL = {
  balklaag: 'Balklaag', balk: (i: number) => `Balk ${i}`, onderslag: 'Onderslag',
  staartbalk: (i: number) => `Staartbalk ${i}`, staartbalk2: (i: number) => `Staartbalk ${i}, andere kant`,
  raveelbalk: 'Raveelbalk', raveelbalkNr: (i: number) => `Raveelbalk ${i}`,
  wisselbalk: (kant: 'links' | 'rechts') => `Wisselbalk ${kant}`,
  doorgaand: (i: number) => `Doorgaande balk ${i}`,
  oplegging: (i: number) => `Oplegging ${i}`,
  opleggingWissel: (kant: 'links' | 'rechts', i: number) => `Oplegging wisselbalk ${kant} ${i === 1 ? 'A' : 'B'}`,
  beschot: 'Beschot', vloerplaat: (soort: string) => `Vloerplaat ${soort}, meewerkend als flens`.replace('  ', ' '),
  nietOpgegeven: 'niet opgegeven',
  platen: {} as Record<string, string>,
  opmOplegging: 'Materiaal en hoogte van de oplegging vallen buiten dit blad; de unity check is de oplegdruk op de balk (6.1.5).',
  opmOplegRaveel: 'Materiaal en hoogte van de oplegging vallen buiten dit blad; de balken erop zijn niet getoetst.',
  opmOplegWissel: 'Materiaal en hoogte van de oplegging vallen buiten dit blad; de unity check is de oplegdruk op de wisselbalk (6.1.5).',
  opmBeschot: 'Telt in dit blad mee in de trillingstoets, niet als flens; geen eigen unity check.',
  opmStaart: 'Niet getoetst in dit blad; zet zijn oplegreactie af op de raveelbalk.',
  opmWisselOud: 'Niet getoetst in dit blad; draagt de raveelbalk.',
  opmWissel: 'Ligger op twee steunpunten over de hele overspanning, met de raveelbalk als puntlast.',
  opmDoorgaand: 'Niet getoetst in dit blad.',
  opmRaveel2: 'Getoetst met de langste staart; de raveelbalk met de kortste staart is lichter belast.',
  omsRaveel: (type: string, b: number, l: number, n: number) => `Raveelbalk ${type} over een sparing van ${b} mm, staartlengte ${l} mm, ${n} staartbalken`,
  omsWissel: (type: string, L: number) => `; wisselbalken ${type}, overspanning ${L} mm`,
  omsTweede: (l: number) => `; tweede raveelbalk op ${l} mm verder`,
  omsOnderslag: (type: string, L: number, l: number) => `Onderslag ${type}, overspanning ${L} mm, lengte ${l} mm`,
  omsBalken: (deel: string, type: string, hoh: number, L: number) => `${deel} balken ${type}, h.o.h. ${hoh} mm, overspanning ${L} mm`,
  omsDeel: (n: number, nEcht: number) => `Representatief stuk: ${n} van de ${nEcht}`,
  project: 'Project', terrein: 'Terrein', gebouw: 'Gebouw', verdieping: 'Verdieping',
};
type Teksten = typeof TEKST_NL;
const TEKST_EN: Teksten = {
  balklaag: 'Timber joist floor', balk: (i) => `Joist ${i}`, onderslag: 'Supporting beam',
  staartbalk: (i) => `Tail joist ${i}`, staartbalk2: (i) => `Tail joist ${i}, far side`,
  raveelbalk: 'Trimmer', raveelbalkNr: (i) => `Trimmer ${i}`,
  wisselbalk: (kant) => `Trimming joist ${kant === 'links' ? 'left' : 'right'}`,
  doorgaand: (i) => `Through joist ${i}`,
  oplegging: (i) => `Support ${i}`,
  opleggingWissel: (kant, i) => `Support trimming joist ${kant === 'links' ? 'left' : 'right'} ${i === 1 ? 'A' : 'B'}`,
  beschot: 'Decking', vloerplaat: (soort) => `Floor panel ${soort}, effective as flange`.replace('  ', ' '),
  nietOpgegeven: 'not specified',
  platen: { Multiplex: 'Plywood', 'Spaanplaat of vezelplaat': 'Particleboard or fibreboard' },
  opmOplegging: 'Material and height of the support are outside this sheet; the unity check is the bearing stress on the joist (6.1.5).',
  opmOplegRaveel: 'Material and height of the support are outside this sheet; the joists on it are not checked.',
  opmOplegWissel: 'Material and height of the support are outside this sheet; the unity check is the bearing stress on the trimming joist (6.1.5).',
  opmBeschot: 'Counts towards the vibration check on this sheet, not as a flange; no unity check of its own.',
  opmStaart: 'Not checked on this sheet; bears on the trimmer.',
  opmWisselOud: 'Not checked on this sheet; carries the trimmer.',
  opmWissel: 'Simply supported over the full span, with the trimmer as a point load.',
  opmDoorgaand: 'Not checked on this sheet.',
  opmRaveel2: 'Checked with the longest tail; the trimmer with the shorter tail carries less.',
  omsRaveel: (type, b, l, n) => `Trimmer ${type} across an opening of ${b} mm, tail length ${l} mm, ${n} tail joists`,
  omsWissel: (type, L) => `; trimming joists ${type}, span ${L} mm`,
  omsTweede: (l) => `; second trimmer ${l} mm further on`,
  omsOnderslag: (type, L, l) => `Supporting beam ${type}, span ${L} mm, length ${l} mm`,
  omsBalken: (deel, type, hoh, L) => `${deel} joists ${type}, c/c ${hoh} mm, span ${L} mm`,
  omsDeel: (n, nEcht) => `Representative part: ${n} of ${nEcht}`,
  project: 'Project', terrein: 'Site', gebouw: 'Building', verdieping: 'Storey',
};
const tekstVoor = (taal: string | undefined): Teksten => (taal === 'en' ? TEKST_EN : TEKST_NL);

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
export function ifcxBlokMesh(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) {
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
export function balklaagIfcxKnopen(invoer: BalklaagInvoer, bladId: string, taal?: string): IfcxKnoop[] {
  const T = tekstVoor(taal);
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
    knopen.push({ path: lichaam, attributes: { [ATTR.mesh]: ifcxBlokMesh(0, lengte, -b / 2, b / 2, 0, h) } });
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
    knopen.push({ path: lichaam, attributes: { [ATTR.mesh]: ifcxBlokMesh(x - breedte / 2, x + breedte / 2, y0, y1, -OPLEGGING_HOOGTE, 0) } });
    knopen.push({
      path: p,
      children: { Lichaam: lichaam },
      inherits: { materiaal: steun },
      attributes: {
        [ATTR.klasse]: ifcKlasse('IfcBearing'),
        [ATTR.naam]: T.oplegging(nr),
        [ATTR.breedte]: naarM(breedte),
        [ATTR.lengte]: naarM(y1 - y0),
        ...(Number.isFinite(uc.oplegdruk) ? { [ATTR.uc]: uc.oplegdruk } : {}),
        [ATTR.opmerking]: T.opmOplegging,
      },
    });
    kinderen[`Oplegging_${nr}`] = p;
  };

  /** Een blok zonder gedeeld profiel: een raveelbalk of wisselbalk, uit één of meer balken. */
  const eigenBalk = (kind: string, delen: [number, number, number, number, number, number][], attr: Record<string, unknown>) => {
    const p = pad(`balk/${kind}`);
    const kind_: Record<string, string> = {};
    delen.forEach(([xa, xb, ya, yb, za, zb], i) => {
      const lichaam = pad(`balk/${kind}/lichaam${i === 0 ? '' : `/${i + 1}`}`);
      knopen.push({ path: lichaam, attributes: { [ATTR.mesh]: ifcxBlokMesh(xa, xb, ya, yb, za, zb) } });
      kind_[delen.length === 1 ? 'Lichaam' : `Lichaam_${i + 1}`] = lichaam;
    });
    knopen.push({
      path: p,
      children: kind_,
      inherits: { materiaal: hout },
      attributes: { [ATTR.klasse]: ifcKlasse('IfcBeam'), ...attr },
    });
    kinderen[kind] = p;
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
        [ATTR.sterkteklasse]: (invoer.plaat && T.platen[invoer.plaat]) ?? invoer.plaat ?? T.nietOpgegeven,
        [ATTR.kleur]: PLAATKLEUR,
        [ATTR.dekking]: PLAAT_DEKKING,
      },
    });
    const p = pad('vloerplaat');
    const kind: Record<string, string> = {};
    delen.forEach(([x0, x1, y0, y1], i) => {
      const lichaam = pad(`vloerplaat/lichaam/${i + 1}`);
      knopen.push({ path: lichaam, attributes: { [ATTR.mesh]: ifcxBlokMesh(x0, x1, y0, y1, h, h + tVloer) } });
      kind[delen.length === 1 ? 'Lichaam' : `Lichaam_${i + 1}`] = lichaam;
    });
    knopen.push({
      path: p,
      children: kind,
      inherits: { materiaal },
      attributes: {
        // Een meewerkende plaat is een constructief deel, gewoon beschot een afwerking.
        [ATTR.klasse]: ifcKlasse(tBalk ? 'IfcSlab' : 'IfcCovering'),
        [ATTR.naam]: tBalk ? T.vloerplaat((invoer.plaat && T.platen[invoer.plaat]) || invoer.plaat || '') : T.beschot,
        [ATTR.lengte]: naarM(lengte),
        [ATTR.breedte]: naarM(breedte),
        [ATTR.dikte]: naarM(tVloer),
        ...(ucPlaat !== null ? { [ATTR.uc]: ucPlaat, [ATTR.toetsen]: toetsenPlaat } : {}),
        ...(tBalk ? {} : { [ATTR.opmerking]: T.opmBeschot }),
      },
    });
    kinderen.Vloerplaat = p;
  };

  // ── de balklaag ───────────────────────────────────────────────────────────
  let omschrijving: string;
  let aantalAttr: Record<string, unknown> = {};
  const x0 = -aOpl / 2;

  if (schema === 4) {
    // De raveling. Oplegging A op x = 0, de raveelbalk met zijn hart op l_staart. In de
    // breedte is y = 0 de ene rand van de sparing en y = b_sparing de andere. De
    // bovenkant van alle balken ligt gelijk, onder de plaat op z = h; een wisselbalk met
    // een andere hoogte krijgt een eigen oplegging, op zijn eigen onderkant.
    const w = invoer.wissel;
    const heel = !!w && w.L > lStaart;
    const nW = w?.n ?? 2;
    const bW = w?.b ?? b;
    const hW = w?.h ?? h;
    const breedteW = nW * bW;
    // Een blad uit een oudere versie kent de overspanning niet: dan alleen een stomp.
    const xEind = heel ? w.L + aOpl / 2 : lStaart + b + Math.max(STOMP_MIN, 0.6 * lStaart);
    const twee = heel && w.lSparing > 0 && lStaart + w.lSparing < w.L;
    const xRav2 = twee ? lStaart + w.lSparing : 0;
    const lengteDoor = xEind - x0;
    const nStaart = Math.max(1, Math.floor(bSparing / hoh) - 1);
    const lengteStaart = lStaart - b / 2 - x0;
    for (let i = 1; i <= nStaart; i++) {
      balk(`Staartbalk_${String(i).padStart(2, '0')}`, T.staartbalk(i), lengteStaart, x0, (i * bSparing) / (nStaart + 1), {
        [ATTR.opmerking]: T.opmStaart,
      });
    }
    if (twee) {
      for (let i = 1; i <= nStaart; i++) {
        balk(`Staartbalk_b_${String(i).padStart(2, '0')}`, T.staartbalk2(i), xEind - (xRav2 + b / 2), xRav2 + b / 2, (i * bSparing) / (nStaart + 1), {
          [ATTR.opmerking]: T.opmStaart,
        });
      }
    }
    // De raveelbalk staat dwars: hij ligt langs y, met zijn breedte langs x.
    const raveel = (kind: string, naam: string, x: number, extra: Record<string, unknown>) => eigenBalk(kind, [[x - b / 2, x + b / 2, 0, bSparing, 0, h]], {
      [ATTR.naam]: naam,
      [ATTR.type]: type,
      [ATTR.breedte]: naarM(b),
      [ATTR.hoogte]: naarM(h),
      [ATTR.lengte]: naarM(bSparing),
      ...metUitkomst,
      ...extra,
    });
    raveel('Raveelbalk', twee ? T.raveelbalkNr(1) : T.raveelbalk, lStaart, twee ? { [ATTR.opmerking]: T.opmRaveel2 } : {});
    if (twee) raveel('Raveelbalk_2', T.raveelbalkNr(2), xRav2, { [ATTR.opmerking]: T.opmRaveel2 });
    // De wisselbalken, met de binnenkant op de rand van de sparing; elke samengestelde
    // balk een eigen lichaam, zodat te zien is hoeveel het er zijn.
    const zW = h - hW;
    const typeW = `${nW > 1 ? `${nW}×` : ''}${bW}×${hW} ${w?.sterkteklasse ?? invoer.sterkteklasse}`;
    const toetsenW = eindig({
      buiging: uc.wisselBuiging, afschuiving: uc.wisselAfschuiving, oplegdruk: uc.wisselOplegdruk,
      blijvend: uc.wisselBlijvend, doorbuiging: uc.wisselDoorbuiging, bijkomend: uc.wisselBijkomend,
    });
    const ucW = Number.isFinite(uc.wissel) ? uc.wissel! : grootste(toetsenW);
    for (const [kant, yIn, teken] of [['links', 0, -1], ['rechts', bSparing, 1]] as const) {
      eigenBalk(`Wisselbalk_${kant}`, Array.from({ length: nW }, (_, i): [number, number, number, number, number, number] => {
        const ya = yIn + teken * i * bW;
        const yb = ya + teken * bW;
        return [x0, xEind, Math.min(ya, yb), Math.max(ya, yb), zW, h];
      }), {
        [ATTR.naam]: T.wisselbalk(kant),
        [ATTR.type]: typeW,
        [ATTR.breedte]: naarM(breedteW),
        [ATTR.hoogte]: naarM(hW),
        [ATTR.lengte]: naarM(lengteDoor),
        ...(heel ? { [ATTR.overspanning]: naarM(w.L) } : {}),
        [ATTR.sterkteklasse]: w?.sterkteklasse ?? invoer.sterkteklasse,
        ...(ucW !== null && heel ? { [ATTR.uc]: ucW } : {}),
        ...(Object.keys(toetsenW).length && heel ? { [ATTR.toetsen]: toetsenW } : {}),
        [ATTR.opmerking]: heel ? T.opmWissel : T.opmWisselOud,
      });
    }
    // Twee doorgaande balken aan elke kant, hart op hart vanaf de wisselbalk.
    const yOut = [-breedteW / 2 - hoh, -breedteW / 2 - 2 * hoh, bSparing + breedteW / 2 + hoh, bSparing + breedteW / 2 + 2 * hoh];
    for (const [i, y] of yOut.entries()) {
      balk(`Balk_${String(i + 1).padStart(2, '0')}`, T.doorgaand(i + 1), lengteDoor, x0, y, { [ATTR.opmerking]: T.opmDoorgaand });
    }
    const yL = yOut[1] - hoh / 2;
    const yR = yOut[3] + hoh / 2;
    // De plaat rond de sparing: links, rechts en boven de staartbalken; bij twee
    // raveelbalken ook het stuk aan de andere kant. De sparing zelf blijft open.
    const xGat = lStaart + b / 2;
    const delen: [number, number, number, number][] = [[x0, xEind, yL, 0], [x0, xEind, bSparing, yR], [x0, xGat, 0, bSparing]];
    if (twee) delen.push([xRav2 - b / 2, xEind, 0, bSparing]);
    vloerplaat(delen, lengteDoor, yR - yL);
    // De opleggingen: de wand onder de balklaag, met daarin de opleggingen van de
    // wisselbalken op hun eigen onderkant.
    const wand = (nr: number, x: number) => {
      const p = pad(`oplegging/${nr}`);
      const yIn0 = -breedteW;
      const yIn1 = bSparing + breedteW;
      const stroken: [number, number][] = [[yL, yIn0], [0, bSparing], [yIn1, yR]];
      const kind_: Record<string, string> = {};
      stroken.forEach(([ya, yb], i) => {
        const lichaam = pad(`oplegging/${nr}/lichaam${i === 0 ? '' : `/${i + 1}`}`);
        knopen.push({ path: lichaam, attributes: { [ATTR.mesh]: ifcxBlokMesh(x - aOpl / 2, x + aOpl / 2, ya, yb, -OPLEGGING_HOOGTE, 0) } });
        kind_[`Lichaam_${i + 1}`] = lichaam;
      });
      knopen.push({
        path: p,
        children: kind_,
        inherits: { materiaal: steun },
        attributes: {
          [ATTR.klasse]: ifcKlasse('IfcBearing'),
          [ATTR.naam]: T.oplegging(nr),
          [ATTR.breedte]: naarM(aOpl),
          [ATTR.lengte]: naarM(yR - yL),
          [ATTR.opmerking]: T.opmOplegRaveel,
        },
      });
      kinderen[`Oplegging_${nr}`] = p;
      for (const [kant, ya, yb] of [['links', yIn0, 0], ['rechts', bSparing, yIn1]] as const) {
        const q = pad(`oplegging/${nr}/${kant}`);
        const lichaam = pad(`oplegging/${nr}/${kant}/lichaam`);
        // Tot op de onderkant van de wisselbalk, en altijd minstens zo diep als de wand.
        knopen.push({ path: lichaam, attributes: { [ATTR.mesh]: ifcxBlokMesh(x - aOpl / 2, x + aOpl / 2, ya, yb, Math.min(zW, 0) - OPLEGGING_HOOGTE, zW) } });
        knopen.push({
          path: q,
          children: { Lichaam: lichaam },
          inherits: { materiaal: steun },
          attributes: {
            [ATTR.klasse]: ifcKlasse('IfcBearing'),
            [ATTR.naam]: T.opleggingWissel(kant, nr),
            [ATTR.breedte]: naarM(aOpl),
            [ATTR.lengte]: naarM(breedteW),
            ...(Number.isFinite(uc.wisselOplegdruk) ? { [ATTR.uc]: uc.wisselOplegdruk } : {}),
            [ATTR.opmerking]: T.opmOplegWissel,
          },
        });
        kinderen[`Oplegging_${nr}_${kant}`] = q;
      }
    };
    wand(1, 0);
    if (heel) wand(2, w.L);
    omschrijving = T.omsRaveel(type, bSparing, lStaart, nStaart)
      + (heel ? T.omsWissel(typeW, w.L) : '')
      + (twee ? T.omsTweede(w.lSparing) : '');
  } else {
    const tweeVelden = schema === 3;
    const overstek = schema === 2;
    const xEind = tweeVelden ? Lth + Lveld2 + aOpl / 2 : overstek ? Lth + aOver : Lth + aOpl / 2;
    const lengte = xEind - x0;
    const steunen: [number, number][] = tweeVelden
      ? [[0, aOpl], [Lth, aSteun], [Lth + Lveld2, aOpl]]
      : [[0, aOpl], [Lth, aOpl]];
    if (onderslag) {
      balk('Onderslag', T.onderslag, lengte, x0, 0, metUitkomst);
      steunen.forEach(([x, a], i) => oplegging(i + 1, x, a, -1.5 * b, 1.5 * b));
      omschrijving = T.omsOnderslag(type, Lth, lengte);
    } else {
      const nEcht = balklaagAantalBalken(invoer.bVloer, hoh);
      const n = Math.min(nEcht, BALKLAAG_MAX_BALKEN);
      for (let i = 0; i < n; i++) {
        balk(`Balk_${String(i + 1).padStart(2, '0')}`, T.balk(i + 1), lengte, x0, i * hoh, metUitkomst);
      }
      const yL = -hoh / 2;
      const yR = (n - 1) * hoh + hoh / 2;
      vloerplaat([[x0, xEind, yL, yR]], lengte, yR - yL);
      steunen.forEach(([x, a], i) => oplegging(i + 1, x, a, yL, yR));
      aantalAttr = { [ATTR.aantal]: nEcht, [ATTR.getoond]: n };
      omschrijving = T.omsBalken(n < nEcht ? T.omsDeel(n, nEcht) : String(n), type, hoh, Lth);
    }
  }

  const wortel: IfcxKnoop = {
    path: pad('wortel'),
    children: kinderen,
    attributes: {
      [ATTR.klasse]: ifcKlasse('IfcElementAssembly'),
      [ATTR.naam]: T.balklaag,
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
  /** De taal van de namen in het document: `en` of standaard Nederlands. */
  taal?: string;
}

/**
 * Het stuk balklaag als compleet IFCX-bestand: kop, imports, schema's, de
 * ruimtelijke boom (project, terrein, gebouw, verdieping) en de knopen.
 */
export function balklaagIfcxDocument(invoer: BalklaagInvoer, opties: BalklaagDocumentOpties = {}): IfcxBestand {
  const bladId = opties.bladId ?? 'balklaag';
  const knopen = balklaagIfcxKnopen(invoer, bladId, opties.taal);
  const T = tekstVoor(opties.taal);
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
      laag('project', 'IfcProject', opties.projectNaam ?? T.project, { Terrein: pad('terrein') }),
      laag('terrein', 'IfcSite', T.terrein, { Gebouw: pad('gebouw') }),
      laag('gebouw', 'IfcBuilding', T.gebouw, { Verdieping: pad('verdieping') }),
      laag('verdieping', 'IfcBuildingStorey', T.verdieping, { Balklaag: knopen[0].path }),
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
  // De wisselbalk: alleen bij een raveelbalk, en alleen als het blad hem kent.
  const Lw = mm('L_w_th');
  const wissel = getal('schema') === 4 && Lw !== undefined ? {
    L: rond(Lw),
    b: rond(mm('b_w_e')),
    h: rond(mm('h_w_e')),
    n: getal('n_w') ?? 2,
    lSparing: getal('tw') === 1 ? rond(mm('l_sparing')) : 0,
    sterkteklasse: STERKTEKLASSEN[getal('id_w') ?? 0] ?? 'onbekend',
  } : undefined;
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
    ...(wissel ? { wissel } : {}),
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
      wissel: uc('UC_wb'),
      wisselBuiging: uc('UC_w_m'),
      wisselAfschuiving: uc('UC_w_v'),
      wisselOplegdruk: uc('UC_w_c90'),
      wisselBlijvend: uc('UC_w_G'),
      wisselDoorbuiging: uc('UC_w_fin'),
      wisselBijkomend: uc('UC_w_bij'),
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
