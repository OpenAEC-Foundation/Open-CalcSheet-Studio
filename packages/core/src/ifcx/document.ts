/**
 * Het hele project als één geldig IFCX-document, en weer terug.
 *
 * De boom:
 *
 *   Project (IfcProject)                  ocss::project: gegevens, verborgen
 *   ├─ Site (IfcSite)
 *   │  └─ Gebouw (IfcBuilding)
 *   │     └─ Bouwlaag (IfcBuildingStorey)
 *   │        ├─ element (IfcBeam, …)      ocss::element: verwijst naar zijn toetsing
 *   │        └─ geometrie van een blad
 *   ├─ Rekenbladen
 *   │  └─ blad (IfcGroup)                 ocss::blad, ::rekentekst, ::invoer,
 *   │     │                               ::elementen, ::pdf, ::uitkomst
 *   │     └─ figuur                       ocss::figuur
 *   └─ Constructierapport                 ocss::rapport
 *
 * Een blad is een IfcGroup en geen element: een kruipfactor of een bout is geen
 * bouwdeel. Zo staat elk blad in het document, en hangt een herkend of gekoppeld
 * element er alleen aan.
 *
 * Teruglezen gebruikt alleen wat hieronder als bron telt: projectnaam, gegevens,
 * verborgen onderdelen, rapport en per blad naam, id, templateId, bronVersie,
 * rekentekst, invoer, elementen en PDF. Uitkomsten, figuren en elementen zijn
 * afgeleid: de app rekent ze opnieuw uit bij het openen en opslaan.
 */
import type { ElementRef, GraafGegevens, IfcCalcSheet, IfcGenerationOptions } from '../ifc-generator.js';
import type { IfcxBestand, IfcxKnoop, IfcxSchema } from './typen.js';
import { padVanElement, uuidVan } from './identiteit.js';
import { ATTR, IFCX_VERSIE, OCSS_SCHEMAS, beschrijfWaarde, ifcKlasse, importsVoor, isGeimporteerd } from './namespace.js';
import { herken, type ElementSoort, type HerkendElement, type Herkenning } from './herkenning.js';
import { leesFiguren, leesUitkomst, type UitkomstStatus } from './uitkomst.js';

const APP_NAAM = 'Open CalcSheet Studio';
const PDF_SOORT = 'pdf';
const SPREADSHEET_SOORT = 'spreadsheet';
const XLSX_MEDIATYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const GRAAF_SOORT = 'graaf';

export interface IfcxProjectInvoer {
  naam: string;
  /** De formaatversie van het projectbestand; komt in `header.dataVersion`. */
  formaatversie?: number;
  gegevens?: Record<string, string>;
  bladen: IfcCalcSheet[];
  /** Het constructierapport; komt ongewijzigd in `ocss::rapport`. */
  rapport?: unknown;
  verborgen?: { gegevens?: boolean; rapport?: boolean };
}

/** Eén blad zoals het uit een document terugkomt: de velden van een exemplaar. */
export interface IfcxGelezenBlad {
  id: string;
  naam: string;
  templateId: string;
  source: string;
  waarden: Record<string, string>;
  elementen: ElementRef[];
  bronVersie?: string;
  pdf?: { bestandsnaam: string; data: string };
  xlsx?: { bestandsnaam: string; data: string };
  graaf?: GraafGegevens;
}

export interface IfcxGelezenProject {
  formaatversie: number;
  naam: string;
  gegevens: Record<string, string>;
  exemplaren: IfcxGelezenBlad[];
  rapport?: unknown;
  verborgen?: { gegevens?: boolean; rapport?: boolean };
}

const KLASSE_VAN: Record<ElementSoort, string> = { paal: 'IfcPile', fundering: 'IfcFooting', balk: 'IfcBeam' };

/** Een naam voor onder `children`: geen `/`, geen getal alleen (dat husselt de volgorde), en uniek. */
function kindNaam(naam: string, gebruikt: Set<string>): string {
  let basis = naam.normalize('NFKD').replace(/[^A-Za-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
  if (!basis) basis = 'Knoop';
  if (/^[0-9]/.test(basis)) basis = `_${basis}`;
  let kandidaat = basis;
  for (let n = 2; gebruikt.has(kandidaat); n++) kandidaat = `${basis}_${n}`;
  gebruikt.add(kandidaat);
  return kandidaat;
}

function metInhoud(obj: Record<string, string>): Record<string, string> | undefined {
  return Object.keys(obj).length > 0 ? obj : undefined;
}

function pdfBytes(data: string): number {
  const opvulling = data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((data.length * 3) / 4) - opvulling);
}

const paren = (r: Record<string, string> | undefined) =>
  Object.entries(r ?? {}).map(([naam, waarde]) => ({ naam, waarde: String(waarde) }));

/** De graaf als attribuut: de velden van een node als paren, zoals de invoer van een rekenblad. */
function graafAttribuut(g: GraafGegevens) {
  return {
    versie: g.versie,
    nodes: g.nodes.map(({ invoer, ...n }) => ({ ...n, ...(invoer ? { invoer: paren(invoer) } : {}) })),
    verbindingen: g.verbindingen,
  };
}

/** De graaf uit een attribuut; het model leest hem daarna nog na (leesGraaf). */
function graafUitAttribuut(x: unknown): GraafGegevens | undefined {
  const g = x as { versie?: unknown; nodes?: unknown; verbindingen?: unknown } | undefined;
  if (!g || !Array.isArray(g.nodes)) return undefined;
  return {
    versie: typeof g.versie === 'number' ? g.versie : 1,
    nodes: g.nodes.map((n) => {
      const { invoer, ...rest } = n as Omit<GraafGegevens['nodes'][number], 'invoer'> & { invoer?: unknown };
      return { ...rest, ...(invoer ? { invoer: uitParen(invoer) } : {}) };
    }),
    verbindingen: Array.isArray(g.verbindingen) ? (g.verbindingen as GraafGegevens['verbindingen']) : [],
  };
}

/** Maten van een herkend element, in meter: de eenheid van de voorbeelden van buildingSMART. */
function maten(e: HerkendElement): Record<string, number> {
  const uit: Record<string, number> = {};
  if (e.lengte !== undefined) uit[ATTR.lengte] = e.lengte / 1000;
  if (e.breedte !== undefined) uit[ATTR.breedte] = e.breedte / 1000;
  if (e.hoogte !== undefined) uit[ATTR.hoogte] = e.hoogte / 1000;
  return uit;
}

interface ElementInBouw {
  knoop: IfcxKnoop;
  toetsingen: Array<{ ref: string; blad: string; status: UitkomstStatus; uc?: number }>;
}

/** Het project als IFCX-document. Twee keer bouwen geeft dezelfde paden. */
export function bouwProjectIfcx(invoer: IfcxProjectInvoer, opties: IfcGenerationOptions = {}): IfcxBestand {
  const gegevens = invoer.gegevens ?? {};
  const wortel = uuidVan(`project/${gegevens.project_nummer ?? ''}/${invoer.naam}`);
  const onder = (deel: string) => uuidVan(`${wortel}/${deel}`);

  const bladen = invoer.bladen;
  const formaatversie = invoer.formaatversie ?? 2;

  const data: IfcxKnoop[] = [];
  const herkend = bladen.map((b): Herkenning => (b.templateId === PDF_SOORT ? { elementen: [] } : herken(b.nodes)));

  // ── Ruimtelijke boom ──────────────────────────────────────────────────────
  const siteP = onder('site');
  const gebouwP = onder('gebouw');
  const aantalLagen = Math.max(1, ...herkend.map((h) => h.bouwlagen ?? 1));
  const gebouwhoogte = herkend.map((h) => h.gebouwhoogte).find((x) => x);
  const lagen: Array<{ pad: string; naam: string; peilMm: number; kinderen: Record<string, string>; namen: Set<string> }> = [];
  for (let i = 0; i < aantalLagen; i++) {
    lagen.push({
      pad: onder(`bouwlaag/${i}`),
      naam: i === 0 ? 'Begane grond' : `${i + 1}e bouwlaag`,
      peilMm: gebouwhoogte ? (i * gebouwhoogte) / aantalLagen : i * 3000,
      kinderen: {},
      namen: new Set(),
    });
  }
  const eersteLaag = lagen[0];

  // ── Rekenbladen en elementen ──────────────────────────────────────────────
  const bladenP = onder('rekenbladen');
  const bladKinderen: Record<string, string> = {};
  const bladNamen = new Set<string>();
  const bladKnopen: IfcxKnoop[] = [];
  const elementen = new Map<string, ElementInBouw>();
  const geometrieKnopen: IfcxKnoop[] = [];

  bladen.forEach((blad, i) => {
    const sleutel = blad.id || `blad-${i + 1}`;
    const pad = onder(`blad/${sleutel}`);
    const isPdf = blad.templateId === PDF_SOORT;
    const isSpreadsheet = blad.templateId === SPREADSHEET_SOORT;
    const isGraaf = blad.templateId === GRAAF_SOORT;
    // Een PDF, werkmap of graaf heeft geen rekentekst, geen invoer en geen oordeel.
    const isLos = isPdf || isSpreadsheet || isGraaf;
    bladKinderen[kindNaam(`B${String(i + 1).padStart(3, '0')}_${blad.naam}`, bladNamen)] = pad;

    const uitkomst = leesUitkomst(blad.nodes, blad.naam, isLos ? { voldoet: null, uc: null } : blad.resultaat, blad.fout);
    const toetsing = {
      ref: pad,
      blad: blad.naam,
      status: uitkomst.status,
      ...(uitkomst.uc !== undefined ? { uc: uitkomst.uc } : {}),
    };

    const attributes: Record<string, unknown> = {
      [ATTR.klasse]: ifcKlasse('IfcGroup'),
      [ATTR.naam]: blad.naam,
      [ATTR.blad]: {
        id: sleutel,
        volgorde: i,
        templateId: blad.templateId ?? '',
        soort: isPdf ? 'pdf' : isSpreadsheet ? 'spreadsheet' : isGraaf ? 'graaf' : 'rekenblad',
        ...(blad.module ? { module: blad.module } : {}),
        ...(blad.bronVersie ? { bronVersie: blad.bronVersie } : {}),
      },
    };
    if (uitkomst.norm) attributes[ATTR.omschrijving] = uitkomst.norm;
    if (!isLos || blad.source) attributes[ATTR.rekentekst] = blad.source ?? '';
    if (!isLos || Object.keys(blad.waarden ?? {}).length > 0) attributes[ATTR.invoer] = paren(blad.waarden);
    if (blad.elementen && blad.elementen.length > 0) attributes[ATTR.elementen] = blad.elementen;
    if (blad.pdf) {
      attributes[ATTR.pdf] = {
        bestandsnaam: blad.pdf.bestandsnaam,
        mediaType: 'application/pdf',
        grootte: pdfBytes(blad.pdf.data),
        data: blad.pdf.data,
      };
    }
    if (blad.xlsx) {
      attributes[ATTR.xlsx] = {
        bestandsnaam: blad.xlsx.bestandsnaam,
        mediaType: XLSX_MEDIATYPE,
        grootte: pdfBytes(blad.xlsx.data),
        data: blad.xlsx.data,
      };
    }
    if (blad.graaf) attributes[ATTR.graaf] = graafAttribuut(blad.graaf);
    attributes[ATTR.uitkomst] = uitkomst;

    // Figuren: de tekeningen en 3D-beelden staan ook in de rekentekst; hier zijn ze als zodanig te vinden.
    const figuurKinderen: Record<string, string> = {};
    const figuurNamen = new Set<string>();
    for (const figuur of leesFiguren(blad.nodes)) {
      const figuurPad = uuidVan(`${pad}/figuur/${figuur.volgnummer}`);
      figuurKinderen[kindNaam(`Figuur_${figuur.volgnummer}`, figuurNamen)] = figuurPad;
      bladKnopen.push({
        path: figuurPad,
        attributes: {
          [ATTR.naam]: figuur.kop ?? `Figuur ${figuur.volgnummer}`,
          [ATTR.figuur]: figuur,
        },
      });
    }

    const knoop: IfcxKnoop = { path: pad, attributes };
    if (Object.keys(figuurKinderen).length > 0) knoop.children = figuurKinderen;
    bladKnopen.push(knoop);

    // Elementen: aangewezen door de constructeur, anders herkend aan de variabelenamen.
    const soorten = herkend[i].elementen;
    const gekoppeld = blad.elementen ?? [];
    if (gekoppeld.length > 0) {
      const soort = soorten[0];
      for (const ref of gekoppeld) {
        const elementPad = padVanElement(ref.id);
        voegElementToe(elementPad, ref.naam || blad.naam, soort, {
          bron: 'gekoppeld',
          ...(soort ? { soort: soort.soort } : {}),
          bronId: ref.id,
          ...(ref.naam ? { bronNaam: ref.naam } : {}),
        }, toetsing);
      }
    } else {
      soorten.forEach((soort) => {
        const elementNaam = soorten.length > 1 ? `${blad.naam} (${soort.soort})` : blad.naam;
        voegElementToe(uuidVan(`${pad}/element/${soort.soort}`), elementNaam, soort, {
          bron: 'herkend',
          soort: soort.soort,
        }, toetsing);
      });
    }

    // Geometrie van het blad: onder de bouwlaag, en elk element erin verwijst naar zijn toetsing.
    const geometrie = blad.geometrie ?? [];
    // Wortels: waar binnen dit blad niets naar wijst, ook niet met `inherits`.
    const kinderen = new Set(
      geometrie.flatMap((k) => [...Object.values(k.children ?? {}), ...Object.values(k.inherits ?? {})]).filter((x): x is string => typeof x === 'string'),
    );
    for (const k of geometrie) {
      const klasse = k.attributes?.[ATTR.klasse] as { code?: unknown; uri?: unknown } | undefined;
      const kopie: IfcxKnoop = klasse
        ? {
            ...k,
            attributes: {
              ...k.attributes,
              // Het schema van `bsi::ifc::class` eist ook de uri.
              ...(typeof klasse.code === 'string' && typeof klasse.uri !== 'string' ? { [ATTR.klasse]: ifcKlasse(klasse.code) } : {}),
              [ATTR.element]: mengToetsing(k.attributes?.[ATTR.element], toetsing),
            },
          }
        : k;
      geometrieKnopen.push(kopie);
      if (!kinderen.has(k.path)) {
        const naam = k.attributes?.[ATTR.naam];
        eersteLaag.kinderen[kindNaam(typeof naam === 'string' ? naam : blad.naam, eersteLaag.namen)] = k.path;
      }
    }
  });

  function voegElementToe(
    pad: string,
    naam: string,
    soort: HerkendElement | undefined,
    herkomst: Record<string, unknown>,
    toetsing: ElementInBouw['toetsingen'][number],
  ) {
    let e = elementen.get(pad);
    if (!e) {
      e = {
        knoop: {
          path: pad,
          attributes: {
            [ATTR.klasse]: ifcKlasse(soort ? KLASSE_VAN[soort.soort] : 'IfcBuildingElementProxy'),
            [ATTR.naam]: naam,
            ...(soort ? maten(soort) : {}),
            [ATTR.element]: herkomst,
          },
        },
        toetsingen: [],
      };
      elementen.set(pad, e);
      eersteLaag.kinderen[kindNaam(naam, eersteLaag.namen)] = pad;
    }
    e.toetsingen.push(toetsing);
  }

  // ── Knopen op een rij ─────────────────────────────────────────────────────
  const projectKinderen: Record<string, string> = { Site: siteP, Rekenbladen: bladenP };
  const rapportP = onder('rapport');
  const heeftRapport = invoer.rapport !== undefined && invoer.rapport !== null;
  if (heeftRapport) projectKinderen.Constructierapport = rapportP;

  data.push({
    path: wortel,
    children: projectKinderen,
    attributes: {
      [ATTR.klasse]: ifcKlasse('IfcProject'),
      [ATTR.naam]: invoer.naam,
      [ATTR.project]: {
        formaatversie,
        gegevens: paren(gegevens),
        ...(invoer.verborgen && Object.values(invoer.verborgen).some(Boolean) ? { verborgen: schoonVerborgen(invoer.verborgen) } : {}),
      },
    },
  });
  data.push({
    path: siteP,
    children: { Gebouw: gebouwP },
    attributes: { [ATTR.klasse]: ifcKlasse('IfcSite'), [ATTR.naam]: 'Site' },
  });
  const laagKinderen: Record<string, string> = {};
  const laagNamen = new Set<string>();
  for (const l of lagen) laagKinderen[kindNaam(l.naam, laagNamen)] = l.pad;
  data.push({
    path: gebouwP,
    children: laagKinderen,
    attributes: { [ATTR.klasse]: ifcKlasse('IfcBuilding'), [ATTR.naam]: 'Hoofdgebouw' },
  });
  for (const l of lagen) {
    const knoop: IfcxKnoop = {
      path: l.pad,
      attributes: { [ATTR.klasse]: ifcKlasse('IfcBuildingStorey'), [ATTR.naam]: l.naam, [ATTR.peil]: l.peilMm / 1000 },
    };
    const kinderen = metInhoud(l.kinderen);
    if (kinderen) knoop.children = kinderen;
    data.push(knoop);
  }
  for (const { knoop, toetsingen } of elementen.values()) {
    data.push({
      ...knoop,
      attributes: {
        ...knoop.attributes,
        [ATTR.element]: { ...(knoop.attributes?.[ATTR.element] as object), toetsingen },
      },
    });
  }
  data.push(...geometrieKnopen);

  const bladenKnoop: IfcxKnoop = { path: bladenP, attributes: { [ATTR.naam]: 'Rekenbladen' } };
  const bk = metInhoud(bladKinderen);
  if (bk) bladenKnoop.children = bk;
  data.push(bladenKnoop);
  data.push(...bladKnopen);

  if (heeftRapport) {
    const titel = (invoer.rapport as { titel?: unknown }).titel;
    data.push({
      path: rapportP,
      attributes: {
        [ATTR.naam]: typeof titel === 'string' && titel ? titel : 'Constructierapport',
        [ATTR.rapport]: invoer.rapport,
      },
    });
  }

  // ── Schema's: de eigen, plus een beschrijving voor wat van buiten komt ────
  const schemas: Record<string, IfcxSchema> = {};
  const gebruikt = new Set<string>();
  for (const k of data) for (const a of Object.keys(k.attributes ?? {})) gebruikt.add(a);
  for (const a of Object.keys(OCSS_SCHEMAS)) if (gebruikt.has(a)) schemas[a] = OCSS_SCHEMAS[a];
  for (const k of data) {
    for (const [a, w] of Object.entries(k.attributes ?? {})) {
      if (!schemas[a] && !isGeimporteerd(a)) schemas[a] = { value: beschrijfWaarde(w) };
    }
  }

  return {
    header: {
      id: `ocss:project:${wortel}`,
      ifcxVersion: IFCX_VERSIE,
      dataVersion: `${formaatversie}.0.0`,
      author: opties.author ?? (gegevens.constructeur || APP_NAAM),
      timestamp: opties.timestamp ?? new Date().toISOString(),
    },
    imports: importsVoor(gebruikt),
    schemas,
    data,
  };
}

function schoonVerborgen(v: { gegevens?: boolean; rapport?: boolean }) {
  return { ...(v.gegevens ? { gegevens: true } : {}), ...(v.rapport ? { rapport: true } : {}) };
}

function mengToetsing(bestaand: unknown, toetsing: ElementInBouw['toetsingen'][number]) {
  const e = (bestaand && typeof bestaand === 'object' ? bestaand : {}) as { bron?: string; toetsingen?: unknown[] };
  return { ...e, bron: e.bron ?? 'geometrie', toetsingen: [...(e.toetsingen ?? []), toetsing] };
}

// ── Lezen ───────────────────────────────────────────────────────────────────

/**
 * Knopen met hetzelfde pad samengevoegd, de laatste wint per attribuut: zoals
 * IFCX ze samenstelt. Zelf schrijven we elk pad één keer, maar een bestand kan
 * met een ander gereedschap zijn aangevuld.
 */
export function platteKnopen(data: readonly IfcxKnoop[]): Map<string, IfcxKnoop> {
  const uit = new Map<string, IfcxKnoop>();
  for (const k of data) {
    const hier = uit.get(k.path);
    if (!hier) {
      uit.set(k.path, { ...k, children: { ...k.children }, inherits: { ...k.inherits }, attributes: { ...k.attributes } });
      continue;
    }
    Object.assign(hier.children!, k.children);
    Object.assign(hier.inherits!, k.inherits);
    Object.assign(hier.attributes!, k.attributes);
  }
  return uit;
}

/** Is dit een projectbestand van dit programma in het IFCX-formaat? */
export function isProjectIfcx(x: unknown): x is IfcxBestand {
  if (!x || typeof x !== 'object') return false;
  const d = x as Partial<IfcxBestand>;
  return typeof d.header?.ifcxVersion === 'string' && Array.isArray(d.data) &&
    d.data.some((k) => k && typeof k === 'object' &&
      !!(k.attributes?.[ATTR.project] || k.attributes?.[`${OUDE_NAAMRUIMTE}project`]));
}

/**
 * Bestanden uit de eerste dagen van dit formaat dragen de naamruimte van de
 * vorige app-naam. Bij het lezen krijgen hun attributen de huidige; opnieuw
 * opslaan schrijft ze dus in de huidige weg.
 */
const OUDE_NAAMRUIMTE = 'oscs::';

function metHuidigeNaamruimte(doc: IfcxBestand): IfcxBestand {
  return {
    ...doc,
    data: doc.data.map((k) => k.attributes
      ? {
          ...k,
          attributes: Object.fromEntries(Object.entries(k.attributes).map(([a, w]) =>
            [a.startsWith(OUDE_NAAMRUIMTE) ? `ocss::${a.slice(OUDE_NAAMRUIMTE.length)}` : a, w])),
        }
      : k),
  };
}

/** Is dit een IFCX-document, ongeacht van wie? */
export function isIfcxBestand(x: unknown): boolean {
  if (!x || typeof x !== 'object') return false;
  const d = x as Partial<IfcxBestand>;
  return typeof d.header?.ifcxVersion === 'string' && Array.isArray(d.data);
}

function tekstVan(x: unknown): string {
  return typeof x === 'string' ? x : '';
}

function uitParen(x: unknown): Record<string, string> {
  if (!Array.isArray(x)) return {};
  return Object.fromEntries(
    x.filter((p) => p && typeof p === 'object' && typeof p.naam === 'string')
      .map((p) => [p.naam as string, typeof p.waarde === 'string' ? p.waarde : String(p.waarde ?? '')]),
  );
}

/** Leest de inhoud van een project terug. Afgeleide gegevens blijven liggen: die rekent de app zelf. */
export function leesProjectIfcx(doc: IfcxBestand): IfcxGelezenProject {
  const knopen = [...platteKnopen(metHuidigeNaamruimte(doc).data).values()];
  const wortel = knopen.find((k) => k.attributes?.[ATTR.project]);
  if (!wortel) throw new Error('Dit IFCX-bestand bevat geen project van deze app.');
  const project = wortel.attributes![ATTR.project] as { formaatversie?: unknown; gegevens?: unknown; verborgen?: unknown };

  const bladKnopen = knopen.filter((k) => k.attributes?.[ATTR.blad]);
  bladKnopen.sort((a, b) => {
    const va = (a.attributes![ATTR.blad] as { volgorde?: number }).volgorde ?? 0;
    const vb = (b.attributes![ATTR.blad] as { volgorde?: number }).volgorde ?? 0;
    return va - vb;
  });

  const exemplaren = bladKnopen.map((k): IfcxGelezenBlad => {
    const a = k.attributes!;
    const b = a[ATTR.blad] as { id?: unknown; templateId?: unknown; bronVersie?: unknown };
    const pdf = a[ATTR.pdf] as { bestandsnaam?: unknown; data?: unknown } | undefined;
    const xlsx = a[ATTR.xlsx] as { bestandsnaam?: unknown; data?: unknown } | undefined;
    const graaf = graafUitAttribuut(a[ATTR.graaf]);
    const blad: IfcxGelezenBlad = {
      id: tekstVan(b.id),
      naam: tekstVan(a[ATTR.naam]),
      templateId: tekstVan(b.templateId),
      source: tekstVan(a[ATTR.rekentekst]),
      waarden: uitParen(a[ATTR.invoer]),
      elementen: Array.isArray(a[ATTR.elementen]) ? (a[ATTR.elementen] as ElementRef[]) : [],
    };
    if (typeof b.bronVersie === 'string') blad.bronVersie = b.bronVersie;
    if (pdf && typeof pdf.data === 'string') blad.pdf = { bestandsnaam: tekstVan(pdf.bestandsnaam), data: pdf.data };
    if (xlsx && typeof xlsx.data === 'string') blad.xlsx = { bestandsnaam: tekstVan(xlsx.bestandsnaam), data: xlsx.data };
    if (graaf) blad.graaf = graaf;
    return blad;
  });

  const rapportKnoop = knopen.find((k) => k.attributes?.[ATTR.rapport]);
  const uit: IfcxGelezenProject = {
    formaatversie: typeof project.formaatversie === 'number' ? project.formaatversie : 2,
    naam: tekstVan(wortel.attributes![ATTR.naam]),
    gegevens: uitParen(project.gegevens),
    exemplaren,
  };
  if (rapportKnoop) uit.rapport = rapportKnoop.attributes![ATTR.rapport];
  if (project.verborgen && typeof project.verborgen === 'object') uit.verborgen = project.verborgen as IfcxGelezenProject['verborgen'];
  return uit;
}
