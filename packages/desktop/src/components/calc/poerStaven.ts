import type { PoerDefinitie } from "./poerDefinitie.ts";

/*
 * De staven van een poer als losse staven: per staaf de hartlijn als hoekpunten, de
 * diameter, de buigstraal en de vorm. De staaflijst, het DXF-detail en de IFC-wapening
 * lezen allemaal deze lijst, zodat ze dezelfde staven tellen als de tekening en de toets.
 *
 * Hier wordt niet getoetst. De plaats van elke staaf komt uit de poerdefinitie
 * (poerDefinitie.ts voor twee palen, meerpaalDefinitie.ts voor drie of vier); hier
 * komen alleen de lengte, de vormcode en het merk erbij.
 *
 * Afspraken voor de staaflijst (ook in docs/tweepaalspoer-toetsing.md):
 *   - zijlengtes zijn hartmaten, van knik tot knik;
 *   - de lengte van een staaf is de lengte langs de hartlijn: de rechte delen, met in
 *     elke knik een boog met de buigstraal r op het hart van de staaf;
 *   - een omgebogen trekband buigt om de ingevoerde doorn; beugels, haarspelden en
 *     randbeugels om de kleinste doorn uit tabel 8.1N (4Ø tot Ø16, daarboven 7Ø);
 *   - een gesloten beugel heeft twee haken van 135° met max(5Ø; 50 mm) recht (figuur 8.5);
 *   - massa met 7850 kg/m³.
 *
 * Vormcodes, eigen nummering naar de gangbare indeling:
 *   00 rechte staaf, 21 U-vorm (twee knikken van 90°, benen naar één kant),
 *   51 gesloten rechthoekige beugel met twee haken, 99 bijzondere vorm (zijlengtes in volgorde).
 *
 * Geen imports buiten de typen: het controlescript laadt dit bestand in Node.
 * Alle maten in mm.
 */

export type P3 = [number, number, number];

export type StaafSoort =
  | "trekband" | "beugel" | "zijstaaf" | "bovenstaaf" | "haarspeld" | "dwarsstaaf"
  | "band" | "net" | "randbeugel";

export interface Staaf {
  soort: StaafSoort;
  /** Vaste naam van de groep waar de staaf bij hoort, bijvoorbeeld "trekband/1" of "band/x". */
  sleutel: string;
  d: number;
  /** Hoekpunten van de hartlijn. */
  pad: P3[];
  gesloten: boolean;
  /** Buigstraal op het hart van de staaf. */
  r: number;
  /** Aantal haken van 135°. */
  haken: number;
  vorm: "00" | "21" | "51" | "99";
  /**
   * Staven met dezelfde reeks krijgen één merk, ook als hun lengte verschilt (een
   * verlopend net onder een driehoekige poer). Zonder reeks bepaalt de vorm het merk.
   */
  reeks?: string;
}

export interface StaafRegel {
  merk: number;
  soort: StaafSoort;
  /** De sleutels van de staven in deze regel. */
  sleutels: string[];
  aantal: number;
  d: number;
  vorm: Staaf["vorm"];
  /** Zijlengtes, hartmaten; leeg bij een verlopende reeks. */
  zijden: number[];
  /** Lengte per staaf; bij een verlopende reeks de kortste en de langste. */
  lengte: number;
  lengteMax: number;
  verlopend: boolean;
  /** Totale lengte van de regel, onafgerond. */
  totaal: number;
  haken: number;
}

export interface DiameterTotaal {
  d: number;
  aantal: number;
  /** Lengte in m en massa in kg, onafgerond. */
  lengte: number;
  massa: number;
}

export interface Staaflijst {
  regels: StaafRegel[];
  perDiameter: DiameterTotaal[];
  massa: number;
  /** Het merk van elke sleutel. */
  merkVan: Record<string, number>;
}

/** Dichtheid van betonstaal, kg/mm³. */
const STAAL = 7850e-9;

/** De kleinste doorndiameter uit tabel 8.1N: 4Ø tot en met Ø16, daarboven 7Ø. */
export function doornMin(d: number): number {
  return d <= 16 ? 4 * d : 7 * d;
}

/** De buigstraal op het hart van de staaf bij de kleinste doorn. */
export function buigStraal(d: number): number {
  return (doornMin(d) + d) / 2;
}

/** De lengte van één haak van 135°: de boog op het hart en het rechte eind (figuur 8.5). */
export function haakLengte(d: number, r: number): number {
  return (3 * Math.PI / 4) * r + Math.max(5 * d, 50);
}

const verschil = (a: P3, b: P3): P3 => [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
const lengteVan = (v: P3) => Math.hypot(v[0], v[1], v[2]);

/** De lengtes van de rechte stukken tussen de hoekpunten (bij een gesloten staaf ook de laatste). */
export function zijlengtes(s: Pick<Staaf, "pad" | "gesloten">): number[] {
  const n = s.pad.length;
  const stukken = s.gesloten ? n : n - 1;
  return Array.from({ length: Math.max(0, stukken) }, (_, i) => lengteVan(verschil(s.pad[i], s.pad[(i + 1) % n])));
}

/**
 * De hoek waarover de staaf in elk hoekpunt draait, in radialen. Een open staaf draait
 * niet in zijn eerste en laatste punt.
 */
function knikken(s: Pick<Staaf, "pad" | "gesloten">): number[] {
  const n = s.pad.length;
  const uit: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!s.gesloten && (i === 0 || i === n - 1)) continue;
    const a = verschil(s.pad[(i - 1 + n) % n], s.pad[i]);
    const b = verschil(s.pad[i], s.pad[(i + 1) % n]);
    const la = lengteVan(a);
    const lb = lengteVan(b);
    if (!(la > 0 && lb > 0)) continue;
    const cos = Math.max(-1, Math.min(1, (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb)));
    const hoek = Math.acos(cos);
    if (hoek > 1e-9) uit.push(hoek);
  }
  return uit;
}

/**
 * De lengte van een staaf langs zijn hartlijn: de zijlengtes, min in elke knik over φ het
 * stuk 2·r·tan(φ/2) dat de boog afsnijdt, plus de boog r·φ zelf, plus de haken.
 * Bij een knik van 90° is dat per knik (2 − π/2)·r korter dan de zijlengtes samen.
 */
export function staafLengte(s: Staaf): number {
  const recht = zijlengtes(s).reduce((a, b) => a + b, 0);
  const bogen = knikken(s).reduce((som, φ) => som + 2 * s.r * Math.tan(φ / 2) - s.r * φ, 0);
  return recht - bogen + s.haken * haakLengte(s.d, s.r);
}

/** Kilogram per meter van een staaf. */
export function massaPerMeter(d: number): number {
  return STAAL * Math.PI * d * d / 4 * 1000;
}

/** Een staaf met de vorm die bij zijn pad hoort. */
function maak(soort: StaafSoort, sleutel: string, d: number, pad: P3[], opties: { gesloten?: boolean; r?: number; haken?: number; reeks?: string } = {}): Staaf {
  const gesloten = opties.gesloten ?? false;
  const haken = opties.haken ?? 0;
  const vorm: Staaf["vorm"] = pad.length === 2 ? "00"
    : !gesloten && pad.length === 4 ? "21"
    : gesloten && pad.length === 4 && haken === 2 ? "51"
    : "99";
  return { soort, sleutel, d, pad, gesloten, r: opties.r ?? 0, haken, vorm, ...(opties.reeks ? { reeks: opties.reeks } : {}) };
}

export const maakStaaf = maak;

/** Is de staaf er echt: een diameter en een lengte. */
export const bestaat = (s: Staaf) => s.d > 0 && zijlengtes(s).some((l) => l > 1e-6) && s.pad.every((p) => p.every(Number.isFinite));

/**
 * De staven van een tweepaalspoer, uit dezelfde definitie als de tekening en het 3D-model.
 * De volgorde is die van de legenda: trekband, beugels, zijstaven, bovenstaven,
 * haarspelden, dwarsstaven.
 */
export function stavenTweepaal(p: PoerDefinitie): Staaf[] {
  const uit: Staaf[] = [];
  const tb = p.trekband;
  tb.lagen.forEach((laag, i) => {
    const e = tb.xEind[i];
    const z = laag.z;
    for (const y of laag.y) {
      uit.push(tb.omgebogen
        ? maak("trekband", `trekband/${i + 1}`, tb.d, [[-e, y, z + tb.lOp], [-e, y, z], [e, y, z], [e, y, z + tb.lOp]], { r: (tb.doorn + tb.d) / 2 })
        : maak("trekband", `trekband/${i + 1}`, tb.d, [[-e, y, z], [e, y, z]]));
    }
  });
  const bg = p.beugels;
  const lussen = Math.floor(bg.y.length / 2);
  for (const x of bg.x) {
    for (let i = 0; i < lussen; i++) {
      const a = bg.y[i];
      const c = bg.y[bg.y.length - 1 - i];
      uit.push(maak("beugel", `beugel/${i + 1}`, bg.d, [[x, a, bg.zOnder], [x, c, bg.zOnder], [x, c, bg.zBoven], [x, a, bg.zBoven]], { gesloten: true, r: buigStraal(bg.d), haken: 2 }));
    }
    if (bg.y.length % 2 === 1) {
      const m = bg.y[(bg.y.length - 1) / 2];
      uit.push(maak("beugel", "beugel/been", bg.d, [[x, m, bg.zOnder], [x, m, bg.zBoven]]));
    }
  }
  const xs = p.l / 2 - p.c_z;
  for (const z of p.zij.z) {
    for (const y of [-p.zij.y, p.zij.y]) uit.push(maak("zijstaaf", "zijstaaf", p.zij.d, [[-xs, y, z], [xs, y, z]]));
  }
  for (const y of p.boven.y) uit.push(maak("bovenstaaf", "bovenstaaf", p.boven.d, [[-xs, y, p.boven.z], [xs, y, p.boven.z]]));
  const hp = p.haarspelden;
  for (const x of hp.x) {
    uit.push(maak("haarspeld", "haarspeld", hp.d, [[x, -hp.y, hp.zBoven], [x, -hp.y, hp.z], [x, hp.y, hp.z], [x, hp.y, hp.zBoven]], { r: buigStraal(hp.d) }));
  }
  const dw = p.dwarsstaven;
  dw.x.forEach((x, i) => uit.push(maak("dwarsstaaf", "dwarsstaaf", dw.d, [[x, -dw.y, dw.z[i]], [x, dw.y, dw.z[i]]])));
  return uit.filter(bestaat);
}

/** De zijlengtes zoals de staaflijst ze toont: bij een rechthoekige beugel (51) de twee maten, anders alle. */
export function zijdenKort(r: Pick<StaafRegel, "vorm" | "zijden">): number[] {
  return r.vorm === "51" ? r.zijden.slice(0, 2) : r.zijden;
}

/** Een zijlengte of lengte op hele millimeters: zo vergelijkt de staaflijst twee staven. */
const mm = (w: number) => Math.round(w);

/**
 * De staaflijst: gelijke staven onder één merk, genummerd in de volgorde waarin ze voor
 * het eerst voorkomen. Gelijk is: zelfde soort, diameter, vorm, haken en zijlengtes op de
 * millimeter, of dezelfde reeks.
 */
export function maakStaaflijst(staven: Staaf[]): Staaflijst {
  const regels: StaafRegel[] = [];
  const perSleutel = new Map<string, StaafRegel>();
  const merkVan: Record<string, number> = {};
  for (const s of staven) {
    const zijden = zijlengtes(s);
    const lengte = staafLengte(s);
    const sleutel = s.reeks
      ? `reeks|${s.reeks}|${s.d}`
      : [s.soort, s.d, s.vorm, s.haken, s.gesloten ? 1 : 0, zijden.map(mm).join("/"), mm(lengte)].join("|");
    let regel = perSleutel.get(sleutel);
    if (!regel) {
      regel = {
        merk: regels.length + 1, soort: s.soort, sleutels: [], aantal: 0, d: s.d, vorm: s.vorm,
        zijden: s.reeks ? [] : zijden, lengte, lengteMax: lengte, verlopend: !!s.reeks, totaal: 0, haken: s.haken,
      };
      regels.push(regel);
      perSleutel.set(sleutel, regel);
    }
    regel.aantal++;
    regel.totaal += lengte;
    regel.lengte = Math.min(regel.lengte, lengte);
    regel.lengteMax = Math.max(regel.lengteMax, lengte);
    if (!regel.sleutels.includes(s.sleutel)) regel.sleutels.push(s.sleutel);
    merkVan[s.sleutel] ??= regel.merk;
  }
  const diameters = [...new Set(regels.map((r) => r.d))].sort((a, b) => a - b);
  const perDiameter = diameters.map((d) => {
    const deze = regels.filter((r) => r.d === d);
    const lengte = deze.reduce((som, r) => som + r.totaal, 0) / 1000;
    return { d, aantal: deze.reduce((som, r) => som + r.aantal, 0), lengte, massa: lengte * massaPerMeter(d) };
  });
  return { regels, perDiameter, massa: perDiameter.reduce((som, r) => som + r.massa, 0), merkVan };
}

/**
 * De hartlijn met afgeronde knikken: elke knik een boog met de buigstraal, in `stukken`
 * per kwart cirkel. Voor de tekening en het 3D-model; de lengte rekent staafLengte exact.
 * Is een been korter dan het stuk dat de boog nodig heeft, dan wordt de straal kleiner.
 */
export function afgerondPad(s: Pick<Staaf, "pad" | "gesloten" | "r">, stukken = 4): P3[] {
  const n = s.pad.length;
  if (!(s.r > 0) || n < 3) return s.pad.slice();
  const uit: P3[] = [];
  for (let i = 0; i < n; i++) {
    const hier = s.pad[i];
    if (!s.gesloten && (i === 0 || i === n - 1)) {
      uit.push(hier);
      continue;
    }
    const voor = s.pad[(i - 1 + n) % n];
    const na = s.pad[(i + 1) % n];
    const a = verschil(hier, voor);
    const b = verschil(hier, na);
    const la = lengteVan(a);
    const lb = lengteVan(b);
    if (!(la > 0 && lb > 0)) {
      uit.push(hier);
      continue;
    }
    const u: P3 = [a[0] / la, a[1] / la, a[2] / la];
    const v: P3 = [b[0] / lb, b[1] / lb, b[2] / lb];
    const cos = Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]));
    const tussen = Math.acos(cos);
    const φ = Math.PI - tussen;
    if (φ < 1e-6 || tussen < 1e-6) {
      uit.push(hier);
      continue;
    }
    const ruimte = s.gesloten ? Math.min(la, lb) / 2 : Math.min(la, lb);
    const r = Math.min(s.r, ruimte * Math.tan(tussen / 2));
    const t = r / Math.tan(tussen / 2);
    const p1: P3 = [hier[0] + u[0] * t, hier[1] + u[1] * t, hier[2] + u[2] * t];
    const bis: P3 = [u[0] + v[0], u[1] + v[1], u[2] + v[2]];
    const lbis = lengteVan(bis);
    const afstand = r / Math.sin(tussen / 2);
    const m: P3 = [hier[0] + (bis[0] / lbis) * afstand, hier[1] + (bis[1] / lbis) * afstand, hier[2] + (bis[2] / lbis) * afstand];
    const e1 = verschil(m, p1);
    // De tweede as van de boog: loodrecht op e1, in het vlak van de knik, naar het tweede been.
    const naar = verschil(m, [hier[0] + v[0] * t, hier[1] + v[1] * t, hier[2] + v[2] * t]);
    const proj = (naar[0] * e1[0] + naar[1] * e1[1] + naar[2] * e1[2]) / (r * r);
    const e2r: P3 = [naar[0] - proj * e1[0], naar[1] - proj * e1[1], naar[2] - proj * e1[2]];
    const l2 = lengteVan(e2r) || 1;
    const e2: P3 = [(e2r[0] / l2) * r, (e2r[1] / l2) * r, (e2r[2] / l2) * r];
    const aantal = Math.max(1, Math.ceil((φ / (Math.PI / 2)) * stukken));
    for (let k = 0; k <= aantal; k++) {
      const h = (k / aantal) * φ;
      uit.push([m[0] + e1[0] * Math.cos(h) + e2[0] * Math.sin(h), m[1] + e1[1] * Math.cos(h) + e2[1] * Math.sin(h), m[2] + e1[2] * Math.cos(h) + e2[2] * Math.sin(h)]);
    }
  }
  return uit;
}
