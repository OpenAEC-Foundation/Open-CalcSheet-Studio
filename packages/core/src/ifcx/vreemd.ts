/**
 * Gegevens van een ander programma in een projectbestand: bij het openen apart
 * houden, bij het opslaan weer terugzetten.
 *
 * Binnen OpenAEC leest en schrijft elk programma hetzelfde IFCX. Een andere
 * Studio kan in een projectbestand dus een eigen knoop zetten (een materiaal, een
 * sondering), of een attribuut toevoegen aan een knoop die deze app schrijft (een
 * categorie op een gekoppelde balk). Die gegevens zijn niet van deze app: ze
 * blijven bij opnieuw opslaan staan zoals ze waren, met hun pad, hun verwijzingen
 * en de schema's en imports die ze nodig hebben.
 *
 * Wat van deze app is, volgt uit wat ze zelf schrijft. Bij het openen bouwt de
 * app het document opnieuw op uit wat ze heeft gelezen (`eigen`); het verschil met
 * het bestand (`bron`) is vreemd:
 *
 *   knoop      een pad dat de app niet schrijft en dat geen attribuut `ocss::`
 *              draagt. Een knoop met `ocss::` die de app niet meer schrijft, is
 *              een eigen knoop van een verwijderd blad en vervalt.
 *   attribuut  op een pad dat de app wel schrijft: een attribuut dat de app daar
 *              niet zet, en dat niet in `ocss::` staat.
 *   kind       op zo'n pad: een naam onder `children` of `inherits` die de app
 *              daar niet gebruikt.
 *   schema     een beschrijving die de app niet schrijft, buiten `ocss::`, behalve
 *              als alleen eigen knopen hem gebruikten.
 *   import     elke import die de app zelf nooit schrijft.
 *
 * Waar een vreemd attribuut of kind dezelfde naam krijgt als iets dat de app later
 * zelf schrijft, wint de app: het is dan haar eigen gegeven geworden.
 *
 * De vergelijking is met wat déze versie van de app schrijft. Knopen met hetzelfde
 * pad worden samengesteld zoals IFCX dat doet (de laatste wint per attribuut), en
 * komen samen terug in één knoop.
 */
import type { IfcxBestand, IfcxImport, IfcxKnoop, IfcxSchema } from './typen.js';
import { platteKnopen } from './document.js';
import { EIGEN_IMPORTS, importsVoor } from './namespace.js';

/** Alles in een projectbestand dat van een ander programma komt. */
export interface IfcxVreemd {
  imports: IfcxImport[];
  schemas: Record<string, IfcxSchema>;
  /** Hele knopen, of het vreemde deel van een knoop die de app ook schrijft. */
  knopen: IfcxKnoop[];
}

/** De eigen namespace, ook in de spelling van de vorige app-naam (document.ts). */
const isEigenAttribuut = (a: string) => a.startsWith('ocss::') || a.startsWith('oscs::');

type Verwijzingen = Record<string, string | null>;

const heeft = (o: object | undefined, naam: string) => !!o && Object.prototype.hasOwnProperty.call(o, naam);

/** De namen uit `bron` die niet in `eigen` staan. */
function verschil(bron: Verwijzingen | undefined, eigen: Verwijzingen | undefined): Verwijzingen {
  const uit: Verwijzingen = {};
  for (const [naam, doel] of Object.entries(bron ?? {})) {
    if (!heeft(eigen, naam)) uit[naam] = doel;
  }
  return uit;
}

/** Een knoop zonder lege velden; `undefined` als er niets overblijft dan het pad. */
function knoopMetInhoud(path: string, children: Verwijzingen, inherits: Verwijzingen, attributes: Record<string, unknown>): IfcxKnoop | undefined {
  const k: IfcxKnoop = { path };
  if (Object.keys(children).length > 0) k.children = children;
  if (Object.keys(inherits).length > 0) k.inherits = inherits;
  if (Object.keys(attributes).length > 0) k.attributes = attributes;
  return k.children || k.inherits || k.attributes ? k : undefined;
}

/**
 * Het vreemde deel van `bron`, vergeleken met `eigen`: het document dat de app uit
 * dezelfde inhoud schrijft. `undefined` als er niets vreemds in staat.
 */
export function vreemdeGegevens(bron: IfcxBestand, eigen: IfcxBestand): IfcxVreemd | undefined {
  const eigenKnopen = platteKnopen(eigen.data);
  const knopen: IfcxKnoop[] = [];
  const vreemdGebruikt = new Set<string>();
  const eigenGebruikt = new Set<string>();

  for (const k of platteKnopen(bron.data ?? []).values()) {
    const attrs = k.attributes ?? {};
    const e = eigenKnopen.get(k.path);
    if (!e) {
      // Een eigen knoop die de app niet meer schrijft, of een knoop van een ander.
      if (Object.keys(attrs).some(isEigenAttribuut)) {
        for (const a of Object.keys(attrs)) eigenGebruikt.add(a);
        continue;
      }
      const heel = knoopMetInhoud(k.path, { ...k.children }, { ...k.inherits }, { ...attrs });
      // Een knoop met alleen een pad zegt niets, maar hij is er wel: houd hem.
      knopen.push(heel ?? { path: k.path });
      for (const a of Object.keys(attrs)) vreemdGebruikt.add(a);
      continue;
    }
    const vreemd: Record<string, unknown> = {};
    for (const [a, w] of Object.entries(attrs)) {
      if (isEigenAttribuut(a) || heeft(e.attributes, a)) {
        eigenGebruikt.add(a);
      } else {
        vreemd[a] = w;
        vreemdGebruikt.add(a);
      }
    }
    const deel = knoopMetInhoud(k.path, verschil(k.children, e.children), verschil(k.inherits, e.inherits), vreemd);
    if (deel) knopen.push(deel);
  }

  const schemas: Record<string, IfcxSchema> = {};
  for (const [a, s] of Object.entries(bron.schemas ?? {})) {
    if (isEigenAttribuut(a) || heeft(eigen.schemas, a)) continue;
    if (eigenGebruikt.has(a) && !vreemdGebruikt.has(a)) continue;
    schemas[a] = s;
  }
  const eigenUris = new Set(eigen.imports.map((i) => i.uri));
  const imports = (bron.imports ?? []).filter((i) => i && typeof i.uri === 'string' && !eigenUris.has(i.uri) && !EIGEN_IMPORTS.has(i.uri));

  if (knopen.length === 0 && imports.length === 0 && Object.keys(schemas).length === 0) return undefined;
  return { imports, schemas, knopen };
}

/** Voegt `extra` toe aan `eigen`, zonder iets van `eigen` te overschrijven. */
function aanvullen<T>(eigen: Record<string, T> | undefined, extra: Record<string, T> | undefined): Record<string, T> | undefined {
  if (!extra) return eigen;
  const uit: Record<string, T> = { ...eigen };
  for (const [naam, w] of Object.entries(extra)) if (!heeft(uit, naam)) uit[naam] = w;
  return uit;
}

/**
 * Het document van de app, met de vreemde gegevens weer erin. Wat de app zelf
 * schrijft, gaat voor; de rest komt erbij, op zijn eigen pad.
 */
export function metVreemdeGegevens(doc: IfcxBestand, vreemd: IfcxVreemd | undefined): IfcxBestand {
  if (!vreemd || (vreemd.knopen.length === 0 && vreemd.imports.length === 0 && Object.keys(vreemd.schemas).length === 0)) return doc;
  const data = [...doc.data];
  const plek = new Map(data.map((k, i) => [k.path, i]));
  const vreemdeAttributen = new Set<string>();
  for (const v of vreemd.knopen) {
    for (const a of Object.keys(v.attributes ?? {})) vreemdeAttributen.add(a);
    const i = plek.get(v.path);
    if (i === undefined) {
      plek.set(v.path, data.length);
      data.push(JSON.parse(JSON.stringify(v)) as IfcxKnoop);
      continue;
    }
    const k = data[i];
    const samen: IfcxKnoop = { ...k };
    const children = aanvullen(k.children, v.children);
    const inherits = aanvullen(k.inherits, v.inherits);
    const attributes = aanvullen(k.attributes, v.attributes);
    if (children) samen.children = children;
    if (inherits) samen.inherits = inherits;
    if (attributes) samen.attributes = attributes;
    data[i] = samen;
  }

  // De imports van de ander, en die van de standaard die zijn attributen nodig hebben.
  const imports = [...doc.imports];
  const uris = new Set(imports.map((i) => i.uri));
  for (const i of [...vreemd.imports, ...importsVoor(vreemdeAttributen)]) {
    if (uris.has(i.uri)) continue;
    uris.add(i.uri);
    imports.push({ ...i });
  }

  return { ...doc, imports, schemas: aanvullen(doc.schemas, vreemd.schemas) ?? {}, data };
}
