/**
 * IFC4X3 STEP, gemaakt uit het IFCX-document. Zo vertellen de twee hetzelfde:
 * er is één bouwer (document.ts), en dit is de vertaling.
 *
 * Project → Site → Gebouw → Bouwlaag via IfcRelAggregates, de elementen via
 * IfcRelContainedInSpatialStructure, en elk object heeft de GlobalId die bij
 * zijn IFCX-pad hoort.
 *
 * Elk blad wordt twee dingen:
 *   - een IfcDocumentInformation met IfcRelAssociatesDocument. Een rekenblad is
 *     een document: het heeft een kenmerk, een naam en een versie, en het pad
 *     in het IFCX staat in Location. De rekentekst zelf en een PDF staan alleen
 *     in het IFCX; een veld in STEP is daar niet voor bedoeld.
 *   - een IfcGroup. Een property set moet aan een object hangen, en een blad
 *     zonder element heeft er geen. Een elementproxy zou een bouwdeel verzinnen
 *     dat er niet is; een groep is precies wat het is, de verzameling die dit
 *     blad toetst. Aan de groep hangen de property sets en het document, en via
 *     IfcRelAssignsToGroup de elementen. De elementen krijgen dezelfde sets en
 *     hetzelfde document, want daar kijkt iemand die in een viewer op een balk
 *     klikt.
 *
 * De property sets heten `OCSS_…` en niet `Pset_…`: dat voorvoegsel is van de
 * standaard.
 */
import type { IfcGenerationOptions } from '../ifc-generator.js';
import type { IfcxBestand, IfcxKnoop } from './typen.js';
import { platteKnopen } from './document.js';
import { ifcGuid, isUuid, uuidVan } from './identiteit.js';
import { Eenheden, reeel, stepTekst } from './eenheden.js';
import { ATTR } from './namespace.js';
import type { BladUitkomstGegevens } from './uitkomst.js';

/** Elementen die rechtstreeks in STEP kunnen; de rest wordt een proxy met de klasse als ObjectType. */
const ELEMENT_KLASSEN = new Set([
  'IfcBeam', 'IfcColumn', 'IfcMember', 'IfcPlate', 'IfcSlab', 'IfcWall', 'IfcFooting', 'IfcPile',
  'IfcBuildingElementProxy', 'IfcCovering', 'IfcRoof', 'IfcRailing', 'IfcBearing', 'IfcElementAssembly',
  'IfcReinforcingBar',
]);

/** Wat van een element niet als eigenschap in STEP hoort: dat staat er al op een andere manier. */
const GEEN_EIGENSCHAP = new Set<string>([ATTR.klasse, ATTR.naam, ATTR.omschrijving, ATTR.element, ATTR.mesh, ATTR.plaatsing, 'bsi::ifc::material']);

const MAX_LABEL = 255;

const label = (t: string) => stepTekst(t.length > MAX_LABEL ? t.slice(0, MAX_LABEL) : t);
const optLabel = (t: unknown) => (typeof t === 'string' && t ? label(t) : '$');
const optTekst = (t: unknown) => (typeof t === 'string' && t ? stepTekst(t) : '$');

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'project';
}

/** Vermenigvuldigt rijmatrices, in de schrijfwijze van USD: [x y z 1] · M. */
function maal(a: number[][], b: number[][]): number[][] {
  return a.map((rij) => b[0].map((_, j) => rij.reduce((s, v, k) => s + v * b[k][j], 0)));
}

const EENHEID: number[][] = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];

function plaatsingVan(k: IfcxKnoop): number[][] | null {
  const m = (k.attributes?.[ATTR.plaatsing] as { transform?: unknown } | undefined)?.transform;
  if (!Array.isArray(m) || m.length !== 4 || m.some((r) => !Array.isArray(r) || r.length !== 4)) return null;
  return m as number[][];
}

/** Driehoeken uit een mesh; `faceVertexCounts` is optioneel, zonder staan ze per drie. */
function driehoeken(mesh: { faceVertexIndices?: unknown; faceVertexCounts?: unknown }): number[][] {
  const index = Array.isArray(mesh.faceVertexIndices) ? (mesh.faceVertexIndices as number[]) : [];
  const uit: number[][] = [];
  if (Array.isArray(mesh.faceVertexCounts)) {
    let i = 0;
    for (const aantal of mesh.faceVertexCounts as number[]) {
      for (let j = 1; j < aantal - 1; j++) uit.push([index[i], index[i + j], index[i + j + 1]]);
      i += aantal;
    }
  } else {
    for (let i = 0; i + 2 < index.length; i += 3) uit.push([index[i], index[i + 1], index[i + 2]]);
  }
  return uit;
}

interface Vlakken {
  punten: number[][];
  driehoeken: number[][];
}

export interface StepOpties extends IfcGenerationOptions {
  /** Versie van het programma, voor IfcApplication; anders de formaatversie van het document. */
  appVersie?: string;
}

/** Het project als STEP (IFC4X3_ADD2). */
export function bouwProjectStep(doc: IfcxBestand, opties: StepOpties = {}): string {
  const platte = platteKnopen(doc.data);

  // Een knoop neemt de attributen en kinderen over van wat hij `inherits`; zijn
  // eigen `children` en `attributes` gaan daaroverheen. Zo stelt IFCX hem samen.
  const samengesteld = new Map<string, IfcxKnoop>();
  const stelSamen = (pad: string, bezig: Set<string>): IfcxKnoop | undefined => {
    const klaar = samengesteld.get(pad);
    if (klaar) return klaar;
    const k = platte.get(pad);
    if (!k) return undefined;
    const attributes: Record<string, unknown> = {};
    const children: Record<string, string | null> = {};
    const nu = new Set(bezig).add(pad);
    for (const doel of Object.values(k.inherits ?? {})) {
      if (typeof doel !== 'string' || nu.has(doel)) continue;
      const bron = stelSamen(doel, nu);
      if (bron) {
        Object.assign(attributes, bron.attributes);
        Object.assign(children, bron.children);
      }
    }
    for (const [naam, doel] of Object.entries(k.children ?? {})) {
      if (doel === null) delete children[naam];
      else children[naam] = doel;
    }
    Object.assign(attributes, k.attributes);
    const uit: IfcxKnoop = { path: pad, children, attributes };
    samengesteld.set(pad, uit);
    return uit;
  };
  for (const pad of platte.keys()) stelSamen(pad, new Set());
  const knopen = samengesteld;
  const lijst = [...knopen.values()];

  const klasseVan = (k: IfcxKnoop | undefined) => (k?.attributes?.[ATTR.klasse] as { code?: string } | undefined)?.code;
  const naamVan = (k: IfcxKnoop | undefined) => {
    const n = k?.attributes?.[ATTR.naam];
    return typeof n === 'string' ? n : '';
  };
  const kinderenVan = (k: IfcxKnoop) =>
    Object.values(k.children ?? {}).map((p) => (typeof p === 'string' ? knopen.get(p) : undefined)).filter((x): x is IfcxKnoop => !!x);
  const onzichtbaar = (k: IfcxKnoop) =>
    (k.attributes?.['usd::usdgeom::visibility'] as { visibility?: string } | undefined)?.visibility === 'invisible';

  const wortel = lijst.find((k) => klasseVan(k) === 'IfcProject');
  if (!wortel) throw new Error('Dit IFCX-document heeft geen IfcProject.');

  const regels: string[] = [];
  let volgend = 1;
  const voeg = (entiteit: string): string => {
    const id = `#${volgend++}`;
    regels.push(`${id}=${entiteit};`);
    return id;
  };

  // ── Eigenaar ──────────────────────────────────────────────────────────────
  const timestamp = opties.timestamp ?? doc.header.timestamp;
  const tijd = Date.parse(timestamp);
  const unix = Number.isFinite(tijd) ? Math.floor(tijd / 1000) : 0;
  const auteur = opties.author ?? doc.header.author ?? 'Open CalcSheet Studio';
  const organisatie = opties.organization ?? 'OpenAEC Foundation';
  const persoon = voeg(`IFCPERSON($,${label(auteur)},$,$,$,$,$,$)`);
  const org = voeg(`IFCORGANIZATION($,${label(organisatie)},$,$,$)`);
  const persoonOrg = voeg(`IFCPERSONANDORGANIZATION(${persoon},${org},$)`);
  const app = voeg(`IFCAPPLICATION(${org},${label(opties.appVersie ?? doc.header.dataVersion)},'Open CalcSheet Studio','OCSS')`);
  const oh = voeg(`IFCOWNERHISTORY(${persoonOrg},${app},$,$,$,$,$,${unix})`);

  // ── Eenheden en context ───────────────────────────────────────────────────
  const eenheden = new Eenheden(voeg);
  const projectEenheden = [
    eenheden.projectEenheid('LENGTHUNIT', 'MILLI', 'METRE'),
    eenheden.projectEenheid('AREAUNIT', undefined, 'SQUARE_METRE'),
    eenheden.projectEenheid('VOLUMEUNIT', undefined, 'CUBIC_METRE'),
    eenheden.projectEenheid('PLANEANGLEUNIT', undefined, 'RADIAN'),
    eenheden.projectEenheid('FORCEUNIT', 'KILO', 'NEWTON'),
    eenheden.projectEenheid('PRESSUREUNIT', 'MEGA', 'PASCAL'),
    eenheden.projectEenheid('MASSUNIT', 'KILO', 'GRAM'),
    eenheden.projectEenheid('TIMEUNIT', undefined, 'SECOND'),
  ];
  const toewijzing = voeg(`IFCUNITASSIGNMENT((${projectEenheden.join(',')}))`);
  const oorsprong = voeg('IFCCARTESIANPOINT((0.,0.,0.))');
  const assen = voeg(`IFCAXIS2PLACEMENT3D(${oorsprong},$,$)`);
  const context = voeg(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,${assen},$)`);
  let lichaam: string | null = null;
  const lichaamContext = () => {
    lichaam ??= voeg(`IFCGEOMETRICREPRESENTATIONSUBCONTEXT('Body','Model',*,*,*,*,${context},$,.MODEL_VIEW.,$)`);
    return lichaam;
  };

  const guid = (pad: string) => stepTekst(ifcGuid(pad));
  const rolGuid = (pad: string, rol: string) => stepTekst(ifcGuid(uuidVan(`${pad}#${rol}`)));

  // ── Ruimtelijke boom ──────────────────────────────────────────────────────
  const project = wortel.attributes?.[ATTR.project] as { gegevens?: Array<{ naam: string; waarde: string }> } | undefined;
  const gegevens = project?.gegevens ?? [];
  const gegeven = (naam: string) => gegevens.find((g) => g.naam === naam)?.waarde;
  const rapportKnoop = lijst.find((k) => k.attributes?.[ATTR.rapport]);
  const rapport = rapportKnoop?.attributes?.[ATTR.rapport] as {
    titel?: string; kenmerk?: string; fase?: string; revisies?: Array<{ code?: string; datum?: string; status?: string }>;
  } | undefined;
  const projectNaam = naamVan(wortel) || 'Project';
  const langeNaam = gegeven('project_naam');
  const ifcProject = voeg(
    `IFCPROJECT(${guid(wortel.path)},${oh},${label(projectNaam)},${optTekst(gegeven('onderdeel'))},$,` +
    `${langeNaam && langeNaam !== projectNaam ? label(langeNaam) : '$'},${optLabel(rapport?.fase)},(${context}),${toewijzing})`,
  );

  const siteKnoop = kinderenVan(wortel).find((k) => klasseVan(k) === 'IfcSite');
  const gebouwKnoop = siteKnoop && kinderenVan(siteKnoop).find((k) => klasseVan(k) === 'IfcBuilding');
  const lagen = gebouwKnoop ? kinderenVan(gebouwKnoop).filter((k) => klasseVan(k) === 'IfcBuildingStorey') : [];

  const sitePlek = voeg(`IFCLOCALPLACEMENT($,${assen})`);
  const site = voeg(`IFCSITE(${guid(siteKnoop?.path ?? `${wortel.path}/site`)},${oh},${label(naamVan(siteKnoop) || 'Site')},$,$,${sitePlek},$,$,.ELEMENT.,$,$,$,$,$)`);
  const gebouwPlek = voeg(`IFCLOCALPLACEMENT(${sitePlek},${assen})`);
  const gebouw = voeg(`IFCBUILDING(${guid(gebouwKnoop?.path ?? `${wortel.path}/gebouw`)},${oh},${label(naamVan(gebouwKnoop) || 'Gebouw')},$,$,${gebouwPlek},$,$,.ELEMENT.,$,$,$)`);

  const elementVan = new Map<string, string>();
  const laagIds: string[] = [];
  const bevatting: Array<{ laag: string; laagPad: string; elementen: string[] }> = [];

  /** De vlakken van een element: zijn eigen mesh en die van kinderen zonder klasse, in meter. */
  const verzamelVlakken = (k: IfcxKnoop, m: number[][], uit: Vlakken) => {
    const eigen = plaatsingVan(k);
    const hier = eigen ? maal(eigen, m) : m;
    const mesh = k.attributes?.[ATTR.mesh] as { points?: unknown; faceVertexIndices?: unknown; faceVertexCounts?: unknown } | undefined;
    if (mesh && Array.isArray(mesh.points) && !onzichtbaar(k)) {
      const start = uit.punten.length;
      for (const p of mesh.points as number[][]) {
        const [x, y, z] = p;
        uit.punten.push([
          x * hier[0][0] + y * hier[1][0] + z * hier[2][0] + hier[3][0],
          x * hier[0][1] + y * hier[1][1] + z * hier[2][1] + hier[3][1],
          x * hier[0][2] + y * hier[1][2] + z * hier[2][2] + hier[3][2],
        ]);
      }
      for (const d of driehoeken(mesh)) uit.driehoeken.push(d.map((i) => i + start));
    }
    for (const kind of kinderenVan(k)) if (!klasseVan(kind)) verzamelVlakken(kind, hier, uit);
  };

  const vormVan = (k: IfcxKnoop, m: number[][]): string => {
    const v: Vlakken = { punten: [], driehoeken: [] };
    verzamelVlakken(k, m, v);
    if (v.punten.length === 0 || v.driehoeken.length === 0) return '$';
    // IFCX rekent in meter, dit bestand in millimeter.
    const punten = v.punten.map((p) => `(${p.map((c) => reeel(c * 1000)).join(',')})`).join(',');
    const lijstPunten = voeg(`IFCCARTESIANPOINTLIST3D((${punten}),$)`);
    const vlakken = v.driehoeken.map((d) => `(${d.map((i) => i + 1).join(',')})`).join(',');
    const set = voeg(`IFCTRIANGULATEDFACESET(${lijstPunten},$,$,(${vlakken}),$)`);
    const vorm = voeg(`IFCSHAPEREPRESENTATION(${lichaamContext()},'Body','Tessellation',(${set}))`);
    return voeg(`IFCPRODUCTDEFINITIONSHAPE($,$,(${vorm}))`);
  };

  const heeftMesh = (k: IfcxKnoop): boolean =>
    !!k.attributes?.[ATTR.mesh] || kinderenVan(k).some((c) => !klasseVan(c) && heeftMesh(c));

  // Een knoop met `inherits` kan op twee plekken voorkomen; een GlobalId maar op een.
  const gebruikteGuids = new Set<string>();
  const elementGuid = (k: IfcxKnoop, plek: string): string => {
    const g = ifcGuid(k.path);
    if (!gebruikteGuids.has(g)) {
      gebruikteGuids.add(g);
      return stepTekst(g);
    }
    return stepTekst(ifcGuid(uuidVan(plek)));
  };

  const aggregaties: Array<{ pad: string; ouder: string; delen: string[] }> = [];
  const materialen = new Map<string, string[]>();
  const elementEigenschappen: Array<{ pad: string; id: string; k: IfcxKnoop }> = [];

  /** Een element in STEP, met zijn vorm en zijn plaats. */
  const maakElement = (k: IfcxKnoop, m: number[][], laagPlek: string, plek: string): string => {
    const code = klasseVan(k);
    const entiteit = code && ELEMENT_KLASSEN.has(code) ? code : 'IfcBuildingElementProxy';
    const plaats = voeg(`IFCLOCALPLACEMENT(${laagPlek},${assen})`);
    const vorm = vormVan(k, m);
    const gegevensElement = k.attributes?.[ATTR.element] as { bronId?: string } | undefined;
    const objectType = entiteit !== code && code ? label(code) : '$';
    const tag = optLabel(gegevensElement?.bronId);
    const type = entiteit === 'IfcBeam' ? '.BEAM.'
      : entiteit === 'IfcFooting' ? '.PAD_FOOTING.'
      : '.NOTDEFINED.';
    const diameter = k.attributes?.['ocss::calc::diameter'];
    const slot = entiteit === 'IfcPile' ? `${type},$`
      : entiteit === 'IfcElementAssembly' ? `$,${type}`
      // SteelGrade, NominalDiameter, CrossSectionArea, BarLength, PredefinedType, BarSurface
      : entiteit === 'IfcReinforcingBar' ? `$,${typeof diameter === 'number' ? reeel(diameter * 1000) : '$'},$,$,${type},$`
      : type;
    const id = voeg(
      `${entiteit.toUpperCase()}(${elementGuid(k, plek)},${oh},${optLabel(naamVan(k))},${optTekst(k.attributes?.[ATTR.omschrijving])},${objectType},${plaats},${vorm},${tag},${slot})`,
    );
    if (!elementVan.has(k.path)) elementVan.set(k.path, id);
    elementEigenschappen.push({ pad: plek, id, k });
    const materiaal = (k.attributes?.['bsi::ifc::material'] as { code?: string } | undefined)?.code;
    if (materiaal) materialen.set(materiaal, [...(materialen.get(materiaal) ?? []), id]);
    return id;
  };

  lagen.forEach((laagKnoop, i) => {
    const peil = laagKnoop.attributes?.[ATTR.peil];
    const peilMm = typeof peil === 'number' ? peil * 1000 : 0;
    const punt = voeg(`IFCCARTESIANPOINT((0.,0.,${reeel(peilMm)}))`);
    const laagAssen = voeg(`IFCAXIS2PLACEMENT3D(${punt},$,$)`);
    const laagPlek = voeg(`IFCLOCALPLACEMENT(${gebouwPlek},${laagAssen})`);
    const laag = voeg(`IFCBUILDINGSTOREY(${guid(laagKnoop.path)},${oh},${label(naamVan(laagKnoop) || `Bouwlaag ${i + 1}`)},$,$,${laagPlek},$,$,.ELEMENT.,${reeel(peilMm)})`);
    laagIds.push(laag);

    const elementen: string[] = [];
    /** Geeft de elementen die hier bovenaan staan: de delen van een samenstelling hangen aan hun ouder. */
    const loop = (k: IfcxKnoop, m: number[][], plek: string): string[] => {
      const eigen = plaatsingVan(k);
      const hier = eigen ? maal(eigen, m) : m;
      const code = klasseVan(k);
      const isElement = !!code || heeftMesh(k);
      const ik = isElement ? maakElement(k, m, laagPlek, plek) : null;
      const delen: string[] = [];
      for (const [naam, doel] of Object.entries(k.children ?? {})) {
        const kind = typeof doel === 'string' ? knopen.get(doel) : undefined;
        if (kind && (klasseVan(kind) || !isElement)) delen.push(...loop(kind, hier, `${plek}/${naam}`));
      }
      if (!ik) return delen;
      if (delen.length > 0) aggregaties.push({ pad: plek, ouder: ik, delen });
      return [ik];
    };
    for (const [naam, doel] of Object.entries(laagKnoop.children ?? {})) {
      const kind = typeof doel === 'string' ? knopen.get(doel) : undefined;
      if (kind) elementen.push(...loop(kind, EENHEID, `${laagKnoop.path}/${naam}`));
    }
    bevatting.push({ laag, laagPad: laagKnoop.path, elementen });
  });

  voeg(`IFCRELAGGREGATES(${rolGuid(wortel.path, 'aggregeert')},${oh},$,$,${ifcProject},(${site}))`);
  voeg(`IFCRELAGGREGATES(${rolGuid(siteKnoop?.path ?? wortel.path, 'aggregeert-site')},${oh},$,$,${site},(${gebouw}))`);
  if (laagIds.length > 0) {
    voeg(`IFCRELAGGREGATES(${rolGuid(gebouwKnoop?.path ?? wortel.path, 'aggregeert-gebouw')},${oh},$,$,${gebouw},(${laagIds.join(',')}))`);
  }
  for (const b of bevatting) {
    if (b.elementen.length > 0) {
      voeg(`IFCRELCONTAINEDINSPATIALSTRUCTURE(${rolGuid(b.laagPad, 'bevat')},${oh},$,$,(${b.elementen.join(',')}),${b.laag})`);
    }
  }
  for (const a of aggregaties) {
    voeg(`IFCRELAGGREGATES(${rolGuid(a.pad, 'delen')},${oh},$,$,${a.ouder},(${a.delen.join(',')}))`);
  }
  for (const [code, ids] of materialen) {
    const materiaal = voeg(`IFCMATERIAL(${label(code)},$,$)`);
    voeg(`IFCRELASSOCIATESMATERIAL(${rolGuid(wortel.path, `materiaal/${code}`)},${oh},$,$,(${ids.join(',')}),${materiaal})`);
  }

  // ── Eigenschappen ─────────────────────────────────────────────────────────
  type Eigenschap = { naam: string; waarde: string; spec?: string; eenheid?: string };
  const tekstWaarde = (t: string): string => (t.length <= MAX_LABEL ? `IFCLABEL(${stepTekst(t)})` : `IFCTEXT(${stepTekst(t)})`);

  const metEenheid = (naam: string, waarde: number, eenheid: string | undefined): { waarde: string; eenheid?: string } => {
    if (!eenheid) return { waarde: `IFCREAL(${reeel(waarde)})` };
    const maat = eenheden.maatVoor(eenheid, naam);
    return { waarde: `${maat.type}(${reeel(waarde)})`, eenheid: maat.eenheid };
  };

  const maakSet = (naam: string, rol: string, eigen: Eigenschap[], op: string[], pad: string) => {
    if (eigen.length === 0 || op.length === 0) return;
    // De namen in een set moeten uniek zijn; de laatste telt, net als op het blad.
    const uniek = new Map<string, Eigenschap>();
    for (const e of eigen) {
      const sleutel = e.naam.slice(0, MAX_LABEL);
      uniek.delete(sleutel);
      uniek.set(sleutel, { ...e, naam: sleutel });
    }
    const ids = [...uniek.values()].map((e) =>
      voeg(`IFCPROPERTYSINGLEVALUE(${stepTekst(e.naam)},${optTekst(e.spec)},${e.waarde},${e.eenheid && e.eenheid !== '$' ? e.eenheid : '$'})`),
    );
    const set = voeg(`IFCPROPERTYSET(${rolGuid(pad, `set-${rol}`)},${oh},${label(naam)},$,(${ids.join(',')}))`);
    voeg(`IFCRELDEFINESBYPROPERTIES(${rolGuid(pad, `definieert-${rol}`)},${oh},$,$,(${op.join(',')}),${set})`);
  };

  maakSet('OCSS_Projectgegevens', 'gegevens',
    gegevens.map((g) => ({ naam: g.naam, waarde: tekstWaarde(g.waarde) })), [ifcProject], wortel.path);

  // De maten en overige gegevens van elk element. Lengtes in IFCX in meter, hier in millimeter.
  const LENGTES = new Set<string>([ATTR.lengte, ATTR.breedte, ATTR.hoogte, 'bsi::ifc::prop::Depth', 'ocss::calc::diameter']);
  for (const { pad, id, k } of elementEigenschappen) {
    const eigen: Eigenschap[] = [];
    for (const [a, w] of Object.entries(k.attributes ?? {})) {
      if (GEEN_EIGENSCHAP.has(a) || a.startsWith('usd::') || a.startsWith('bsi::ifc::presentation::')) continue;
      const naam = a.split('::').pop() ?? a;
      if (typeof w === 'number' && Number.isFinite(w)) {
        eigen.push({ naam, waarde: LENGTES.has(a) ? `IFCLENGTHMEASURE(${reeel(w * 1000)})` : `IFCREAL(${reeel(w)})` });
      } else if (typeof w === 'string') {
        eigen.push({ naam, waarde: tekstWaarde(w) });
      } else if (typeof w === 'boolean') {
        eigen.push({ naam, waarde: `IFCBOOLEAN(.${w ? 'T' : 'F'}.)` });
      }
    }
    maakSet('OCSS_Element', 'element', eigen, [id], pad);
  }

  // ── Rapport ───────────────────────────────────────────────────────────────
  if (rapportKnoop && rapport) {
    const laatste = rapport.revisies?.[rapport.revisies.length - 1];
    const status = laatste?.status === 'definitief' ? '.FINAL.'
      : laatste?.status === 'ter goedkeuring' ? '.FINALDRAFT.'
      : laatste?.status === 'concept' ? '.DRAFT.'
      : '$';
    const doc2 = voeg(
      `IFCDOCUMENTINFORMATION(${label(rapport.kenmerk || 'rapport')},${label(naamVan(rapportKnoop) || 'Constructierapport')},$,` +
      `${stepTekst(`urn:uuid:${rapportKnoop.path}`)},'Constructierapport',$,$,${optLabel(laatste?.code)},$,$,$,$,$,$,$,$,${status})`,
    );
    voeg(`IFCRELASSOCIATESDOCUMENT(${rolGuid(rapportKnoop.path, 'document')},${oh},$,$,(${ifcProject}),${doc2})`);
  }

  // ── Bladen ────────────────────────────────────────────────────────────────
  const bladKnopen = lijst
    .filter((k) => k.attributes?.[ATTR.blad])
    .sort((a, b) => ((a.attributes![ATTR.blad] as { volgorde: number }).volgorde) - ((b.attributes![ATTR.blad] as { volgorde: number }).volgorde));

  // Welke elementen horen bij welk blad: het element noemt zijn toetsingen.
  const elementenVanBlad = new Map<string, string[]>();
  for (const k of lijst) {
    const toetsingen = (k.attributes?.[ATTR.element] as { toetsingen?: Array<{ ref?: string }> } | undefined)?.toetsingen;
    const id = elementVan.get(k.path);
    if (!toetsingen || !id) continue;
    for (const t of toetsingen) {
      if (typeof t.ref !== 'string') continue;
      const rij = elementenVanBlad.get(t.ref);
      if (rij) {
        if (!rij.includes(id)) rij.push(id);
      } else {
        elementenVanBlad.set(t.ref, [id]);
      }
    }
  }

  // Een object mag een set met dezelfde naam maar één keer dragen; een element aan twee bladen krijgt _2.
  const setsOpObject = new Map<string, number>();
  const setNaam = (basis: string, op: string[]): string => {
    let hoogste = 0;
    for (const id of op) hoogste = Math.max(hoogste, setsOpObject.get(`${basis}|${id}`) ?? 0);
    for (const id of op) setsOpObject.set(`${basis}|${id}`, hoogste + 1);
    return hoogste === 0 ? basis : `${basis}_${hoogste + 1}`;
  };

  for (const k of bladKnopen) {
    const a = k.attributes!;
    const blad = a[ATTR.blad] as { id: string; templateId: string; soort: string; module?: string; bronVersie?: string };
    const uitkomst = a[ATTR.uitkomst] as BladUitkomstGegevens | undefined;
    const pdf = (a[ATTR.pdf] ?? a[ATTR.xlsx] ?? a[ATTR.markdown] ?? a[ATTR.jupyter]) as { bestandsnaam?: string; mediaType?: string; grootte?: number } | undefined;
    const invoer = (a[ATTR.invoer] as Array<{ naam: string; waarde: string }> | undefined) ?? [];
    const naam = naamVan(k) || blad.id;
    const isBijlage = blad.soort === 'pdf' || blad.soort === 'spreadsheet' || blad.soort === 'markdown' || blad.soort === 'graaf' || blad.soort === 'tekenblad' || blad.soort === 'jupyter' || blad.soort === 'marimo';

    const groep = voeg(`IFCGROUP(${guid(k.path)},${oh},${label(naam)},${optTekst(uitkomst?.norm)},'Rekenblad')`);
    const elementen = elementenVanBlad.get(k.path) ?? [];
    if (elementen.length > 0) {
      voeg(`IFCRELASSIGNSTOGROUP(${rolGuid(k.path, 'groep')},${oh},$,$,(${elementen.join(',')}),$,${groep})`);
    }

    const docInfo = voeg(
      `IFCDOCUMENTINFORMATION(${label(blad.id)},${label(naam)},${optTekst(uitkomst?.titel)},` +
      `${stepTekst(`urn:uuid:${isUuid(k.path) ? k.path : ifcGuid(k.path)}`)},${isBijlage ? "'Bijlage'" : "'Constructieve toetsing'"},$,$,` +
      `${optLabel(blad.bronVersie)},$,$,$,$,${blad.soort === 'graaf' ? "'application/json'" : isBijlage && pdf?.mediaType ? stepTekst(pdf.mediaType) : "'text/plain'"},$,$,$,$)`,
    );
    const op = [groep, ...elementen];
    voeg(`IFCRELASSOCIATESDOCUMENT(${rolGuid(k.path, 'document')},${oh},$,$,(${op.join(',')}),${docInfo})`);

    // Toetsing: oordeel, norm en de unity checks.
    const toetsing: Eigenschap[] = [
      { naam: 'Blad', waarde: tekstWaarde(naam) },
      { naam: 'BladId', waarde: tekstWaarde(blad.id) },
    ];
    if (blad.templateId) toetsing.push({ naam: 'Module', waarde: tekstWaarde(blad.module || blad.templateId) });
    if (blad.bronVersie) toetsing.push({ naam: 'Rekenversie', waarde: tekstWaarde(blad.bronVersie) });
    if (uitkomst) {
      toetsing.push({ naam: 'Titel', waarde: tekstWaarde(uitkomst.titel) });
      if (uitkomst.norm) toetsing.push({ naam: 'Norm', waarde: tekstWaarde(uitkomst.norm) });
      toetsing.push({ naam: 'Status', waarde: tekstWaarde(uitkomst.status) });
      if (uitkomst.status === 'voldoet' || uitkomst.status === 'voldoet_niet') {
        toetsing.push({ naam: 'Voldoet', waarde: `IFCBOOLEAN(.${uitkomst.status === 'voldoet' ? 'T' : 'F'}.)` });
      }
      if (uitkomst.uc !== undefined) toetsing.push({ naam: 'Maatgevende_UC', waarde: `IFCRATIOMEASURE(${reeel(uitkomst.uc)})` });
      else if (uitkomst.ucTekst) toetsing.push({ naam: 'Maatgevende_UC', waarde: tekstWaarde(uitkomst.ucTekst) });
      if (uitkomst.fout) toetsing.push({ naam: 'Fout', waarde: tekstWaarde(uitkomst.fout) });
      for (const uc of uitkomst.unityChecks) {
        toetsing.push({
          naam: uc.naam,
          waarde: uc.waarde !== undefined ? `IFCRATIOMEASURE(${reeel(uc.waarde)})` : tekstWaarde(uc.tekst),
        });
      }
    }
    if (pdf) {
      if (pdf.bestandsnaam) toetsing.push({ naam: 'Bestandsnaam', waarde: tekstWaarde(pdf.bestandsnaam) });
      if (typeof pdf.grootte === 'number') toetsing.push({ naam: 'Bytes', waarde: `IFCINTEGER(${pdf.grootte})` });
    }
    maakSet(setNaam('OCSS_Toetsing', op), 'toetsing', toetsing, op, k.path);

    // Invoer: met eenheid als het blad die noemt.
    const velden = new Map((uitkomst?.invoervelden ?? []).map((v) => [v.naam, v]));
    const invoerSet: Eigenschap[] = invoer.map((p) => {
      const veld = velden.get(p.naam);
      if (veld?.getal !== undefined) {
        return { naam: p.naam, spec: veld.label ?? veld.keuzeTekst, ...metEenheid(p.naam, veld.getal, veld.eenheid) };
      }
      return { naam: p.naam, spec: veld?.label ?? veld?.keuzeTekst, waarde: tekstWaarde(p.waarde) };
    });
    maakSet(setNaam('OCSS_Invoer', op), 'invoer', invoerSet, op, k.path);

    // Uitkomsten: elke variabele met maattype, eenheid en formule.
    const uitkomsten: Eigenschap[] = (uitkomst?.variabelen ?? []).map((v) => {
      const spec = v.formule;
      if (v.waarde !== undefined) return { naam: v.naam, spec, ...metEenheid(v.naam, v.waarde, v.eenheid) };
      return { naam: v.naam, spec, waarde: tekstWaarde(v.tekst) };
    });
    maakSet(setNaam('OCSS_Uitkomsten', op), 'uitkomsten', uitkomsten, op, k.path);
  }

  // ── Bestand ───────────────────────────────────────────────────────────────
  const stempel = Number.isFinite(tijd) ? new Date(tijd).toISOString().replace(/\.\d{3}Z$/, '') : '1970-01-01T00:00:00';
  return [
    'ISO-10303-21;',
    'HEADER;',
    "FILE_DESCRIPTION(('ViewDefinition [DesignTransferView]'),'2;1');",
    `FILE_NAME(${stepTekst(`${slug(projectNaam)}.ifc`)},'${stempel}',(${label(auteur)}),(${label(organisatie)}),'Open CalcSheet Studio','OCSS','');`,
    "FILE_SCHEMA(('IFC4X3_ADD2'));",
    'ENDSEC;',
    'DATA;',
    ...regels,
    'ENDSEC;',
    'END-ISO-10303-21;',
    '',
  ].join('\n');
}
