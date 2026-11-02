/**
 * Van de eenheid achter een uitkomst ("kN / m", "N / mm^2") naar het maattype en
 * de eenheid in STEP. Het getal blijft zoals het op het blad staat; de eenheid
 * staat erbij in `IfcPropertySingleValue.Unit`, tenzij dat de eenheid van het
 * project is.
 *
 * Wat niet te herkennen is, krijgt een `IfcContextDependentUnit` met de tekst
 * zoals hij er staat: het getal en de eenheid blijven dan samen bewaard.
 */

export type Toevoegen = (entiteit: string) => string;

interface Basis {
  /** Naam in IFC. */
  si: string;
  soort: string;
  /** Macht van [lengte, kracht, massa, tijd, hoek, temperatuur]. */
  dim: readonly [number, number, number, number, number, number];
}

const LENGTE: Basis = { si: 'METRE', soort: 'LENGTHUNIT', dim: [1, 0, 0, 0, 0, 0] };
const KRACHT: Basis = { si: 'NEWTON', soort: 'FORCEUNIT', dim: [0, 1, 0, 0, 0, 0] };
const SPANNING: Basis = { si: 'PASCAL', soort: 'PRESSUREUNIT', dim: [-2, 1, 0, 0, 0, 0] };
const MASSA: Basis = { si: 'GRAM', soort: 'MASSUNIT', dim: [0, 0, 1, 0, 0, 0] };
const TIJD: Basis = { si: 'SECOND', soort: 'TIMEUNIT', dim: [0, 0, 0, 1, 0, 0] };
const HOEK: Basis = { si: 'RADIAN', soort: 'PLANEANGLEUNIT', dim: [0, 0, 0, 0, 1, 0] };
const KELVIN: Basis = { si: 'KELVIN', soort: 'THERMODYNAMICTEMPERATUREUNIT', dim: [0, 0, 0, 0, 0, 1] };
const CELSIUS: Basis = { si: 'DEGREE_CELSIUS', soort: 'THERMODYNAMICTEMPERATUREUNIT', dim: [0, 0, 0, 0, 0, 1] };
const FREQUENTIE: Basis = { si: 'HERTZ', soort: 'FREQUENCYUNIT', dim: [0, 0, 0, -1, 0, 0] };
const ENERGIE: Basis = { si: 'JOULE', soort: 'ENERGYUNIT', dim: [1, 1, 0, 0, 0, 0] };
const VERMOGEN: Basis = { si: 'WATT', soort: 'POWERUNIT', dim: [1, 1, 0, -1, 0, 0] };

interface Teken {
  basis?: Basis;
  /** Voorvoegsel in IFC, en de waarde ervan. */
  prefix?: string;
  factor: number;
  /** Graden: geen SI-eenheid, maar afgeleid van de radiaal. */
  graden?: boolean;
}

const TEKENS: Record<string, Teken> = {
  mm: { basis: LENGTE, prefix: 'MILLI', factor: 1e-3 },
  cm: { basis: LENGTE, prefix: 'CENTI', factor: 1e-2 },
  dm: { basis: LENGTE, prefix: 'DECI', factor: 1e-1 },
  m: { basis: LENGTE, factor: 1 },
  km: { basis: LENGTE, prefix: 'KILO', factor: 1e3 },
  N: { basis: KRACHT, factor: 1 },
  kN: { basis: KRACHT, prefix: 'KILO', factor: 1e3 },
  MN: { basis: KRACHT, prefix: 'MEGA', factor: 1e6 },
  GN: { basis: KRACHT, prefix: 'GIGA', factor: 1e9 },
  Pa: { basis: SPANNING, factor: 1 },
  kPa: { basis: SPANNING, prefix: 'KILO', factor: 1e3 },
  MPa: { basis: SPANNING, prefix: 'MEGA', factor: 1e6 },
  GPa: { basis: SPANNING, prefix: 'GIGA', factor: 1e9 },
  g: { basis: MASSA, factor: 1e-3 },
  kg: { basis: MASSA, prefix: 'KILO', factor: 1 },
  t: { basis: MASSA, prefix: 'MEGA', factor: 1e3 },
  s: { basis: TIJD, factor: 1 },
  ms: { basis: TIJD, prefix: 'MILLI', factor: 1e-3 },
  rad: { basis: HOEK, factor: 1 },
  deg: { basis: HOEK, factor: Math.PI / 180, graden: true },
  '°': { basis: HOEK, factor: Math.PI / 180, graden: true },
  K: { basis: KELVIN, factor: 1 },
  degC: { basis: CELSIUS, factor: 1 },
  '°C': { basis: CELSIUS, factor: 1 },
  Hz: { basis: FREQUENTIE, factor: 1 },
  J: { basis: ENERGIE, factor: 1 },
  kJ: { basis: ENERGIE, prefix: 'KILO', factor: 1e3 },
  W: { basis: VERMOGEN, factor: 1 },
  kW: { basis: VERMOGEN, prefix: 'KILO', factor: 1e3 },
};

/** Samengetrokken schrijfwijzen die een blad kan gebruiken. */
const SAMEN: Record<string, string[]> = { kNm: ['kN', 'm'], Nm: ['N', 'm'], Nmm: ['N', 'mm'], kNmm: ['kN', 'mm'] };

export interface Stuk {
  teken: Teken;
  exp: number;
}

/** Leest "kN / m", "N / mm^2", "kN m": de stukken met hun macht, of null als het niet lukt. */
export function leesEenheid(tekst: string): Stuk[] | null {
  const delen = tekst.replace(/[()]/g, ' ').replace(/[·*]/g, ' ').split('/');
  const uit: Stuk[] = [];
  for (let d = 0; d < delen.length; d++) {
    const teken = d === 0 ? 1 : -1;
    for (const woord of delen[d].trim().split(/\s+/).filter(Boolean)) {
      if (woord === '1') continue;
      const m = woord.match(/^([A-Za-z°]+)(?:\^(-?\d+))?$/);
      if (!m) return null;
      const exp = m[2] ? parseInt(m[2], 10) : 1;
      for (const naam of SAMEN[m[1]] ?? [m[1]]) {
        const t = TEKENS[naam];
        if (!t) return null;
        uit.push({ teken: t, exp: exp * teken });
      }
    }
  }
  return uit.length > 0 ? uit : null;
}

function dimensies(stukken: Stuk[]): number[] {
  const d = [0, 0, 0, 0, 0, 0];
  for (const s of stukken) {
    const b = s.teken.basis!.dim;
    for (let i = 0; i < 6; i++) d[i] += b[i] * s.exp;
  }
  return d;
}

interface Maat {
  /** Maattype in STEP. */
  type: string;
  /** IfcDerivedUnitEnum bij samengestelde eenheden. */
  afgeleid?: string;
}

/** Maattype per dimensie (macht van lengte, kracht, massa, tijd, hoek, temperatuur). */
const MATEN: Record<string, Maat> = {
  '1,0,0,0,0,0': { type: 'IFCLENGTHMEASURE' },
  '2,0,0,0,0,0': { type: 'IFCAREAMEASURE' },
  '3,0,0,0,0,0': { type: 'IFCVOLUMEMEASURE' },
  '4,0,0,0,0,0': { type: 'IFCMOMENTOFINERTIAMEASURE', afgeleid: 'MOMENTOFINERTIAUNIT' },
  '6,0,0,0,0,0': { type: 'IFCWARPINGCONSTANTMEASURE', afgeleid: 'WARPINGCONSTANTUNIT' },
  '0,1,0,0,0,0': { type: 'IFCFORCEMEASURE' },
  '-2,1,0,0,0,0': { type: 'IFCPRESSUREMEASURE' },
  '-1,1,0,0,0,0': { type: 'IFCLINEARFORCEMEASURE', afgeleid: 'LINEARFORCEUNIT' },
  '1,1,0,0,0,0': { type: 'IFCTORQUEMEASURE', afgeleid: 'TORQUEUNIT' },
  '0,0,1,0,0,0': { type: 'IFCMASSMEASURE' },
  '-3,0,1,0,0,0': { type: 'IFCMASSDENSITYMEASURE', afgeleid: 'MASSDENSITYUNIT' },
  '-1,0,1,0,0,0': { type: 'IFCMASSPERLENGTHMEASURE', afgeleid: 'MASSPERLENGTHUNIT' },
  '-2,0,1,0,0,0': { type: 'IFCAREADENSITYMEASURE', afgeleid: 'AREADENSITYUNIT' },
  '0,0,0,1,0,0': { type: 'IFCTIMEMEASURE' },
  '0,0,0,0,1,0': { type: 'IFCPLANEANGLEMEASURE' },
  '0,0,0,0,0,1': { type: 'IFCTHERMODYNAMICTEMPERATUREMEASURE' },
  '0,0,0,-1,0,0': { type: 'IFCFREQUENCYMEASURE' },
  '1,0,0,-1,0,0': { type: 'IFCLINEARVELOCITYMEASURE', afgeleid: 'LINEARVELOCITYUNIT' },
  '1,0,0,-2,0,0': { type: 'IFCACCELERATIONMEASURE', afgeleid: 'ACCELERATIONUNIT' },
  '1,1,0,-1,0,0': { type: 'IFCPOWERMEASURE' },
  '-1,0,0,0,0,0': { type: 'IFCCURVATUREMEASURE', afgeleid: 'CURVATUREUNIT' },
};

/**
 * De eenheden van één STEP-bestand: elke eenheid één keer. De eerste die voor
 * een soort is aangemaakt met `projectEenheid` geldt als eenheid van het project.
 */
export class Eenheden {
  private readonly voeg: Toevoegen;
  private readonly bekend = new Map<string, string>();
  /** Per soort de eenheid uit IfcUnitAssignment. */
  private readonly vanProject = new Map<string, string>();
  private dimLoos: string | null = null;

  constructor(voeg: Toevoegen) {
    this.voeg = voeg;
  }

  private si(soort: string, prefix: string | undefined, naam: string): string {
    const sleutel = `${soort}|${prefix ?? ''}|${naam}`;
    let id = this.bekend.get(sleutel);
    if (!id) {
      id = this.voeg(`IFCSIUNIT(*,.${soort}.,${prefix ? `.${prefix}.` : '$'},.${naam}.)`);
      this.bekend.set(sleutel, id);
    }
    return id;
  }

  /** Zet de eenheid van het project voor deze soort; voor IfcUnitAssignment. */
  projectEenheid(soort: string, prefix: string | undefined, naam: string): string {
    const id = this.si(soort, prefix, naam);
    this.vanProject.set(soort, id);
    return id;
  }

  private exponenten(): string {
    this.dimLoos ??= this.voeg('IFCDIMENSIONALEXPONENTS(0,0,0,0,0,0,0)');
    return this.dimLoos;
  }

  private graden(): string {
    const sleutel = 'graden';
    let id = this.bekend.get(sleutel);
    if (!id) {
      const rad = this.si('PLANEANGLEUNIT', undefined, 'RADIAN');
      const factor = this.voeg(`IFCMEASUREWITHUNIT(IFCPLANEANGLEMEASURE(${reeel(Math.PI / 180)}),${rad})`);
      id = this.voeg(`IFCCONVERSIONBASEDUNIT(${this.exponenten()},.PLANEANGLEUNIT.,'DEGREE',${factor})`);
      this.bekend.set(sleutel, id);
    }
    return id;
  }

  /** De eenheid van één teken tot de eerste macht. */
  private benoemd(t: Teken): string {
    return t.graden ? this.graden() : this.si(t.basis!.soort, t.prefix, t.basis!.si);
  }

  private afgeleid(stukken: Stuk[], soort: string, gebruikerType?: string): string {
    const sleutel = `afg|${soort}|${gebruikerType ?? ''}|${stukken.map((s) => `${s.teken.prefix ?? ''}${s.teken.basis!.si}^${s.exp}`).join(' ')}`;
    let id = this.bekend.get(sleutel);
    if (!id) {
      const elementen = stukken.map((s) => this.voeg(`IFCDERIVEDUNITELEMENT(${this.benoemd(s.teken)},${s.exp})`));
      id = this.voeg(`IFCDERIVEDUNIT((${elementen.join(',')}),.${soort}.,${gebruikerType ? stepTekst(gebruikerType) : '$'},$)`);
      this.bekend.set(sleutel, id);
    }
    return id;
  }

  private contextEenheid(tekst: string): string {
    const sleutel = `ctx|${tekst}`;
    let id = this.bekend.get(sleutel);
    if (!id) {
      id = this.voeg(`IFCCONTEXTDEPENDENTUNIT(${this.exponenten()},.USERDEFINED.,${stepTekst(tekst)})`);
      this.bekend.set(sleutel, id);
    }
    return id;
  }

  /** De eenheid in `Unit`: niets als het de eenheid van het project is. */
  private alsNietProject(soort: string, id: string): string {
    return this.vanProject.get(soort) === id ? '$' : id;
  }

  /**
   * Het maattype en de eenheid voor een waarde met deze eenheid. `naam` is de
   * naam van de variabele: W en S zijn weerstandsmomenten en geen volumes, E en
   * G elasticiteitsmoduli en geen spanningen.
   */
  maatVoor(eenheid: string, naam: string): { type: string; eenheid: string } {
    const stukken = leesEenheid(eenheid);
    if (!stukken) return { type: 'IFCREAL', eenheid: this.contextEenheid(eenheid) };

    const d = dimensies(stukken).join(',');
    const maat = MATEN[d];

    // Eén teken tot de eerste macht: mm, kN, MPa, kg.
    if (stukken.length === 1 && stukken[0].exp === 1) {
      const t = stukken[0].teken;
      const type = maat?.type ?? 'IFCREAL';
      return { type, eenheid: this.alsNietProject(t.basis!.soort, this.benoemd(t)) };
    }

    // Eén lengte in het kwadraat of de derde: mm^2, m^3. W en S zijn weerstandsmomenten.
    if (stukken.length === 1 && stukken[0].teken.basis === LENGTE && (stukken[0].exp === 2 || stukken[0].exp === 3)) {
      const t = stukken[0].teken;
      if (stukken[0].exp === 3 && /^[WS](_|$)/.test(naam)) {
        return { type: 'IFCSECTIONMODULUSMEASURE', eenheid: this.afgeleid(stukken, 'SECTIONMODULUSUNIT') };
      }
      const soort = stukken[0].exp === 2 ? 'AREAUNIT' : 'VOLUMEUNIT';
      const si = stukken[0].exp === 2 ? 'SQUARE_METRE' : 'CUBIC_METRE';
      return { type: maat!.type, eenheid: this.alsNietProject(soort, this.si(soort, t.prefix, si)) };
    }

    // Kracht per oppervlak.
    if (d === '-2,1,0,0,0,0' && stukken.length === 2) {
      if (/^[EG](_|$)/.test(naam)) {
        const type = naam.startsWith('G') ? 'IFCSHEARMODULUSMEASURE' : 'IFCMODULUSOFELASTICITYMEASURE';
        const soort = naam.startsWith('G') ? 'SHEARMODULUSUNIT' : 'MODULUSOFELASTICITYUNIT';
        return { type, eenheid: this.afgeleid(stukken, soort) };
      }
      const kracht = stukken.find((s) => s.teken.basis === KRACHT);
      const lengte = stukken.find((s) => s.teken.basis === LENGTE);
      if (kracht && lengte) {
        const factor = kracht.teken.factor * lengte.teken.factor ** lengte.exp;
        // kN/m^2 en dergelijk is een vlaklast; N/mm^2 een spanning, en dat is getalsmatig MPa.
        const prefixen: Record<string, string> = { 1000000: 'MEGA', 1000000000: 'GIGA' };
        const prefix = lengte.teken.prefix ? prefixen[String(Math.round(factor))] : undefined;
        if (prefix) return { type: 'IFCPRESSUREMEASURE', eenheid: this.alsNietProject('PRESSUREUNIT', this.si('PRESSUREUNIT', prefix, 'PASCAL')) };
      }
      return { type: 'IFCPLANARFORCEMEASURE', eenheid: this.afgeleid(stukken, 'PLANARFORCEUNIT') };
    }

    // Moment per lengte blijft herkenbaar: "kN m / m" valt dimensioneel weg tot een kracht.
    if (d === '0,1,0,0,0,0' && stukken.length === 3) {
      return { type: 'IFCLINEARMOMENTMEASURE', eenheid: this.afgeleid(stukken, 'LINEARMOMENTUNIT') };
    }

    if (maat?.afgeleid) return { type: maat.type, eenheid: this.afgeleid(stukken, maat.afgeleid) };

    // Geen vast maattype, wel een eenheid die in stukken te schrijven is: "kN / m^3".
    return { type: 'IFCREAL', eenheid: this.afgeleid(stukken, 'USERDEFINED', eenheid) };
  }
}

/** Een getal als STEP-REAL: altijd met een punt. Alleen voor eindige getallen. */
export function reeel(n: number): string {
  const t = String(n);
  const e = t.search(/e/i);
  if (e >= 0) {
    const m = t.slice(0, e);
    return `${m.includes('.') ? m : `${m}.`}E${t.slice(e + 1)}`;
  }
  return t.includes('.') ? t : `${t}.`;
}

/**
 * Een tekst als STEP-string (ISO 10303-21): een apostrof dubbel, een backslash
 * dubbel, en alles buiten gewone ASCII als \X2\…\X0\ of \X4\…\X0\.
 */
export function stepTekst(tekst: string): string {
  let uit = "'";
  let rij: string[] = [];
  const sluit = () => {
    if (rij.length > 0) {
      uit += `\\X2\\${rij.join('')}\\X0\\`;
      rij = [];
    }
  };
  for (const teken of tekst) {
    const c = teken.codePointAt(0)!;
    if (c >= 0x20 && c <= 0x7e) {
      sluit();
      uit += teken === "'" ? "''" : teken === '\\' ? '\\\\' : teken;
    } else if (c <= 0xffff) {
      rij.push(c.toString(16).toUpperCase().padStart(4, '0'));
    } else {
      sluit();
      uit += `\\X4\\${c.toString(16).toUpperCase().padStart(8, '0')}\\X0\\`;
    }
  }
  sluit();
  return `${uit}'`;
}
