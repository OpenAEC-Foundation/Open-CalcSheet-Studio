/**
 * Het model van een tekening uit het tabblad Tekenen.
 *
 * Een tekening is een `@svg … @end`-blok in het rekenblad. Elke maat is een
 * getal in px (de viewBox) of een koppeling: een uitdrukking uit het blad. In
 * de code wordt een koppeling `{{naam}}`; een uitdrukking die geen kale naam
 * is, rekent eerst verborgen uit in een hulpvariabele (code.ts). Zo verandert
 * de tekening mee met de invoer van het blad.
 */

/** Wat het blad geeft voor een koppeling; `eenheid` zegt of de waarde een eenheid heeft (`200 mm`). */
export type Opgelost = ((e: string) => number | undefined) & { eenheid?: (e: string) => boolean | undefined };

/** De kleur van maatvoering: een rustig donkerblauw, in zwart-wit afgedrukt nog goed leesbaar. */
export const MAATKLEUR = "#1E3A8A";
/** De standaardafstand van een maatlijn tot wat hij meet, in px op papier (ongeveer 8 mm). */
export const MAAT_AFSTAND = 30;
/** Het gat tussen het gemeten punt en het begin van de hulplijn. */
export const MAAT_GAT = 3;

/** Een maat in px; met een koppeling (`e`) volgt hij het blad en is `v` de laatst bekende waarde. */
export interface Maat {
  v: number;
  e?: string;
  /** Een mm-maat die de vorige keer met eenheid omrekende: dat geldt tot het blad iets anders zegt. */
  mm?: boolean;
}

export type Soort = "lijn" | "pijl" | "rechthoek" | "cirkel" | "polylijn" | "tekst" | "maat" | "boog" | "symbool";
/** `schema`: een ligger op twee steunpunten met q-last en maatlijn in één keer. */
export type Gereedschap = "selecteer" | Soort | "schema";
export type Anker = "start" | "middle" | "end";

export interface Vorm {
  id: string;
  soort: Soort;
  /** De maten: x1 y1 x2 y2 · x y w h · cx cy r · x y (tekst) · x0 y0 x1 y1 … (polylijn). */
  p: Record<string, Maat>;
  /** Lijnkleur; bij tekst de tekstkleur. null: geen lijn. */
  lijn: string | null;
  dikte: number;
  /** Vulkleur; null: geen vulling. */
  vulling: string | null;
  streep: boolean;
  /** Tekst of maatlabel; mag `{{uitdrukking}}` bevatten. */
  tekst?: string;
  /** De tekst is opmaak (`<tspan>` …) uit een bestaand blok, geen platte tekst. */
  opmaak?: boolean;
  grootte?: number;
  anker?: Anker;
  /** Polylijn: gesloten (veelhoek). */
  gesloten?: boolean;
  /** Overige attributen van een bestaand element: ze gaan ongewijzigd terug. */
  extra?: [string, string][];
  /** Overige stijlregels (`style`) van een bestaand element. */
  stijlRest?: string;
  /** Symbool: welk parametrisch symbool (symbolen.ts). */
  sym?: string;
  /** Symbool: keuzes en teksten, zoals profielmaat, type oplegging, label of lastwaarde. */
  o?: Record<string, string>;
  /** Maatlijn: de oude vorm uit een bestaand blok, met schuine tikken en zonder afstand. */
  tik?: boolean;
}

/** Een element dat de editor niet kent (path, ellipse, g, …): het blijft zoals het was. */
export interface Vast {
  id: string;
  soort: "vast";
  markup: string;
}

export type Element = Vorm | Vast;

export interface Tekening {
  /** Naam van de tekening (`tek1`); ook het voorvoegsel van de hulpvariabelen. */
  naam: string;
  /** Linkerbovenhoek van de viewBox. */
  x0: number;
  y0: number;
  breed: Maat;
  hoog: Maat;
  elementen: Element[];
  /** Overige attributen van `<svg>` uit een bestaand blok. */
  wortel: [string, string][];
  /** De editor beheert `style` van `<svg>` (breedte volgt de viewBox). */
  eigenStijl: boolean;
}

export interface Stijl {
  lijn: string;
  dikte: number;
  vulling: string | null;
  streep: boolean;
  grootte: number;
}

export const STANDAARD_STIJL: Stijl = {
  lijn: "#1F2937",
  dikte: 2,
  vulling: null,
  streep: false,
  grootte: 14,
};

export const STANDAARD_BREED = 480;
export const STANDAARD_HOOG = 320;

let teller = 0;
export const nieuwId = () => `v${++teller}`;

/**
 * Een id uit een bestand: de teller gaat erboven, zodat de editor het niet nog
 * eens uitdeelt. Zonder id: een nieuw id.
 */
export function reserveerId(id?: string): string {
  if (id === undefined) return nieuwId();
  const m = /^v(\d+)$/.exec(id);
  if (m) teller = Math.max(teller, Number(m[1]));
  return id;
}

export const isVorm = (e: Element): e is Vorm => e.soort !== "vast";

const MM_SLEUTELS = ["h", "b", "tw", "tf", "r", "t", "lengte"];
/** Staat deze maat van de vorm in mm (profielmaat, lengte in aanzicht) en niet in px? */
export const isMmSleutel = (v: Vorm, k: string) =>
  v.soort === "symbool" && (v.sym === "staal" || v.sym === "hout") && MM_SLEUTELS.includes(k);

/** Past `{{…}}` in de rekenkern zonder hulpvariabele? Alleen een kale naam (\w+). */
export const isNaam = (e: string) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(e);

/** Een koppeling zoals hij in de code mag staan: één regel, geen apostrof of accolades. */
export function schoonUitdrukking(e: string): string {
  return e.replace(/[\r\n]+/g, " ").replace(/['{}"]/g, "").trim();
}

/** Getal voor in de code: op 2 decimalen, zonder overbodige nullen. */
export function fmt(n: number, decimalen = 2): string {
  if (!Number.isFinite(n)) return "0";
  const f = 10 ** decimalen;
  const r = Math.round(n * f) / f;
  return Object.is(r, -0) || r === 0 ? "0" : String(r);
}

/** De waarde van een maat: uit het blad als de koppeling is uitgerekend, anders de getekende. */
export function waardeVan(m: Maat | undefined, opgelost?: (e: string) => number | undefined): number {
  if (!m) return 0;
  if (m.e && opgelost) {
    const w = opgelost(m.e);
    if (w !== undefined && Number.isFinite(w)) return w;
  }
  return m.v;
}

/**
 * Hoe een symbool geplaatst is: op een punt (x y), langs een lijn (x1 y1 x2 y2)
 * of als vak (x y w h).
 */
export type Plaatsing = "punt" | "lijn" | "vak";

export const plaatsingVan = (v: Vorm): Plaatsing => (v.p.x1 ? "lijn" : v.p.w ? "vak" : "punt");

/** Keuzes van een symbool die een getal of een uitdrukking uit het blad zijn (een lastwaarde). */
export const WAARDE_SLEUTELS = ["waarde", "waarde2", "niveau"];

/** Een waarde die als getal geschreven is (`12,5`, `-14`); anders is het een uitdrukking uit het blad. */
export const isWaardeGetal = (s: string) => /^\s*[-+]?\d+(?:[.,]\d+)?\s*$/.test(s);

/** Een lastwaarde als tekst: een getal zoals het getypt is, een uitdrukking als `{{…}}`. */
export function waardeTekst(s: string | undefined): string {
  const w = (s ?? "").trim();
  if (!w) return "";
  return isWaardeGetal(w) ? w : `{{${w}}}`;
}

/** Een uitdrukking met eenheid als kaal getal in mm: `L` wordt `L/(1 mm)`. */
export const mmFormule = (e: string) => `${isNaam(e) ? e : `(${e})`}/(1 mm)`;

/** De uitdrukking voor een mm-maat: met eenheid omgerekend, anders zoals hij is. */
export function mmUitdrukking(m: Maat, o?: Opgelost): string {
  const s = schoonUitdrukking(m.e ?? "");
  return o?.eenheid?.(s) ?? m.mm ? mmFormule(s) : s;
}

/** Terug van de omrekening naar wat de gebruiker typte, bij het lezen van een blok. */
export function zonderMm(e: string): string {
  const m = /^(.*)\/\(1 mm\)$/.exec(e.trim());
  if (!m) return e;
  const s = m[1].trim();
  return /^\(.*\)$/.test(s) ? s.slice(1, -1) : s;
}

/** De waarde van een mm-maat: uit het blad als die bekend is, anders de getekende. */
export function waardeMm(m: Maat | undefined, o?: Opgelost): number {
  if (!m) return 0;
  if (m.e && o) {
    const w = o(mmUitdrukking(m, o));
    if (w !== undefined && Number.isFinite(w)) return w;
  }
  return m.v;
}

/** Aantal punten van een polylijn. */
export function aantalPunten(v: Vorm): number {
  let n = 0;
  while (v.p[`x${n}`] !== undefined) n++;
  return n;
}

/** De maten van een vorm in vaste volgorde, voor het eigenschappenpaneel. */
export function sleutels(v: Vorm): string[] {
  switch (v.soort) {
    case "lijn":
    case "pijl":
      return ["x1", "y1", "x2", "y2"];
    case "maat":
      return ["x1", "y1", "x2", "y2", "offset"];
    case "rechthoek":
      return ["x", "y", "w", "h"];
    case "cirkel":
      return ["cx", "cy", "r"];
    case "tekst":
      return ["x", "y"];
    case "polylijn": {
      const uit: string[] = [];
      for (let i = 0; i < aantalPunten(v); i++) uit.push(`x${i}`, `y${i}`);
      return uit;
    }
    case "boog":
      return ["cx", "cy", "r", "a1", "a2"];
    case "symbool":
      return { punt: ["x", "y"], lijn: ["x1", "y1", "x2", "y2"], vak: ["x", "y", "w", "h"] }[plaatsingVan(v)];
  }
}

/** Een hoek in graden, als punt op een cirkel (y omlaag, met de klok mee). */
export const opCirkel = (cx: number, cy: number, r: number, a: number) => ({
  x: cx + r * Math.cos((a * Math.PI) / 180),
  y: cy + r * Math.sin((a * Math.PI) / 180),
});

/** Het eindpunt van een boog ligt met de klok mee na het begin, binnen één omwenteling. */
export function boogEind(a1: number, a2: number): number {
  let e = a2;
  while (e <= a1) e += 360;
  while (e > a1 + 360) e -= 360;
  return e;
}

const IS_X = /^c?x\d*$/;
const IS_Y = /^c?y\d*$/;

/** Verschuift een vorm; gekoppelde maten volgen het blad en blijven staan. */
export function verschuif(v: Vorm, dx: number, dy: number): Vorm {
  const p: Record<string, Maat> = {};
  for (const [k, m] of Object.entries(v.p)) {
    if (m.e) p[k] = m;
    else if (IS_X.test(k)) p[k] = { v: m.v + dx };
    else if (IS_Y.test(k)) p[k] = { v: m.v + dy };
    else p[k] = m;
  }
  return { ...v, p };
}

/** Zet één maat op een getal, als hij niet gekoppeld is. */
export function zetMaat(v: Vorm, k: string, waarde: number): Vorm {
  const m = v.p[k];
  if (m?.e) return v;
  return { ...v, p: { ...v.p, [k]: { v: waarde } } };
}

export interface Greep {
  /** Welke greep: "1", "2" (lijn), "nw" … (rechthoek), "c", "r" (cirkel), "p" (tekst), "0", "1", … (polylijn). */
  k: string;
  x: number;
  y: number;
  /** Alle maten die deze greep verplaatst zijn gekoppeld: hij zit vast. */
  vast: boolean;
}

/** De grepen van een vorm, op de waarden zoals ze getekend worden. */
export function grepen(v: Vorm, w: (k: string) => number): Greep[] {
  const gek = (...ks: string[]) => ks.every((k) => !!v.p[k]?.e);
  switch (v.soort) {
    case "lijn":
    case "pijl":
      return [
        { k: "1", x: w("x1"), y: w("y1"), vast: gek("x1", "y1") },
        { k: "2", x: w("x2"), y: w("y2"), vast: gek("x2", "y2") },
      ];
    case "maat": {
      const n = maatNormaal(w);
      const af = v.p.offset ? w("offset") : 0;
      return [
        { k: "1", x: w("x1"), y: w("y1"), vast: gek("x1", "y1") },
        { k: "2", x: w("x2"), y: w("y2"), vast: gek("x2", "y2") },
        { k: "o", x: (w("x1") + w("x2")) / 2 + n.x * af, y: (w("y1") + w("y2")) / 2 + n.y * af, vast: gek("offset") },
      ];
    }
    case "rechthoek": {
      const x = w("x"), y = w("y"), b = w("w"), h = w("h");
      return [
        { k: "nw", x, y, vast: gek("x", "y", "w", "h") },
        { k: "ne", x: x + b, y, vast: gek("y", "w", "h") },
        { k: "sw", x, y: y + h, vast: gek("x", "w", "h") },
        { k: "se", x: x + b, y: y + h, vast: gek("w", "h") },
      ];
    }
    case "cirkel":
      return [
        { k: "c", x: w("cx"), y: w("cy"), vast: gek("cx", "cy") },
        { k: "r", x: w("cx") + w("r"), y: w("cy"), vast: gek("r") },
      ];
    case "tekst":
      return [{ k: "p", x: w("x"), y: w("y"), vast: gek("x", "y") }];
    case "polylijn": {
      const uit: Greep[] = [];
      for (let i = 0; i < aantalPunten(v); i++) {
        uit.push({ k: String(i), x: w(`x${i}`), y: w(`y${i}`), vast: gek(`x${i}`, `y${i}`) });
      }
      return uit;
    }
    case "boog": {
      const cx = w("cx"), cy = w("cy"), r = w("r"), a1 = w("a1"), a2 = boogEind(a1, w("a2"));
      const p1 = opCirkel(cx, cy, r, a1);
      const p2 = opCirkel(cx, cy, r, a2);
      const pm = opCirkel(cx, cy, r, (a1 + a2) / 2);
      return [
        { k: "1", ...p1, vast: false },
        { k: "2", ...p2, vast: false },
        { k: "m", ...pm, vast: gek("r") },
        { k: "c", x: cx, y: cy, vast: gek("cx", "cy") },
      ];
    }
    case "symbool": {
      const soort = plaatsingVan(v);
      if (soort === "punt") return [{ k: "p", x: w("x"), y: w("y"), vast: gek("x", "y") }];
      if (soort === "lijn") {
        return [
          { k: "1", x: w("x1"), y: w("y1"), vast: gek("x1", "y1") },
          // Met een gekoppelde lengte volgt het eind het blad.
          { k: "2", x: w("x2"), y: w("y2"), vast: gek("x2", "y2") || !!v.p.lengte?.e },
        ];
      }
      return grepen({ ...v, soort: "rechthoek" }, w);
    }
  }
}

/** Een greep naar (x, y) slepen; gekoppelde maten blijven staan. */
export function sleepGreep(v: Vorm, k: string, x: number, y: number, w: (k: string) => number): Vorm {
  let r = v;
  const zet = (sl: string, n: number) => {
    r = zetMaat(r, sl, n);
  };
  switch (v.soort) {
    case "lijn":
    case "pijl":
      zet(`x${k}`, x);
      zet(`y${k}`, y);
      return r;
    case "maat": {
      const nieuw = nieuweMaatVorm(v);
      if (k === "o") {
        const n = maatNormaal(w);
        return zetMaat(nieuw, "offset", Math.round(((x - w("x1")) * n.x + (y - w("y1")) * n.y) * 100) / 100);
      }
      r = nieuw;
      zet(`x${k}`, x);
      zet(`y${k}`, y);
      return r;
    }
    case "rechthoek": {
      // De overstaande hoek blijft liggen.
      const x1 = w("x"), y1 = w("y"), x2 = x1 + w("w"), y2 = y1 + w("h");
      const ox = k.includes("w") ? x2 : x1;
      const oy = k.startsWith("n") ? y2 : y1;
      zet("x", Math.min(x, ox));
      zet("y", Math.min(y, oy));
      zet("w", Math.abs(x - ox));
      zet("h", Math.abs(y - oy));
      return r;
    }
    case "cirkel":
      if (k === "c") {
        zet("cx", x);
        zet("cy", y);
      } else {
        zet("r", Math.hypot(x - w("cx"), y - w("cy")));
      }
      return r;
    case "tekst":
      zet("x", x);
      zet("y", y);
      return r;
    case "polylijn":
      zet(`x${k}`, x);
      zet(`y${k}`, y);
      return r;
    case "boog": {
      const cx = w("cx"), cy = w("cy");
      if (k === "c") {
        zet("cx", x);
        zet("cy", y);
      } else if (k === "m") {
        zet("r", Math.round(Math.hypot(x - cx, y - cy) * 100) / 100);
      } else {
        const a = Math.round(((Math.atan2(y - cy, x - cx) * 180) / Math.PI) * 100) / 100;
        zet(k === "1" ? "a1" : "a2", a);
      }
      return r;
    }
    case "symbool": {
      const soort = plaatsingVan(v);
      if (soort === "punt") {
        zet("x", x);
        zet("y", y);
        return r;
      }
      if (soort === "lijn") {
        zet(`x${k}`, x);
        zet(`y${k}`, y);
        return r;
      }
      return { ...sleepGreep({ ...v, soort: "rechthoek" }, k, x, y, w), soort: "symbool" };
    }
  }
}

/** De loodrechte op een maatlijn: een positieve afstand ligt links-onder de leesrichting. */
export function maatNormaal(w: (k: string) => number) {
  const dx = w("x2") - w("x1"), dy = w("y2") - w("y1");
  const l = Math.hypot(dx, dy) || 1;
  return { x: -dy / l, y: dx / l };
}

/** Een maatlijn in de nieuwe vorm: een oude tik-maat krijgt een afstand en rondjes zodra je hem wijzigt. */
export function nieuweMaatVorm(v: Vorm): Vorm {
  if (!v.tik && v.p.offset) return v;
  const n: Vorm = { ...v, p: { ...v.p, offset: v.p.offset ?? { v: 0 } } };
  delete n.tik;
  return n;
}

/** Een nieuwe vorm met de stijl van het lint. */
export function nieuweVorm(soort: Soort, p: Record<string, number>, stijl: Stijl, extra: Partial<Vorm> = {}): Vorm {
  const maten: Record<string, Maat> = {};
  for (const [k, n] of Object.entries(p)) maten[k] = { v: Math.round(n * 100) / 100 };
  const vlak = soort === "rechthoek" || soort === "cirkel" || soort === "polylijn";
  if (soort === "maat" && !maten.offset) maten.offset = { v: 0 };
  return {
    id: nieuwId(),
    soort,
    p: maten,
    lijn: stijl.lijn,
    dikte: stijl.dikte,
    vulling: vlak ? stijl.vulling : null,
    streep: stijl.streep,
    ...(soort === "tekst" ? { grootte: stijl.grootte } : {}),
    // Maatvoering heeft een eigen rustige kleur, los van de constructie.
    ...(soort === "maat" ? { lijn: MAATKLEUR, dikte: 0.75, grootte: 12 } : {}),
    ...(soort === "polylijn" ? { stijlRest: "stroke-linejoin:round" } : {}),
    ...extra,
  };
}

/** Een lege tekening van de standaardmaat. */
export function legeTekening(naam: string): Tekening {
  return {
    naam,
    x0: 0,
    y0: 0,
    breed: { v: STANDAARD_BREED },
    hoog: { v: STANDAARD_HOOG },
    elementen: [],
    wortel: [],
    eigenStijl: true,
  };
}

/** Alle koppelingen van een tekening: maten en `{{…}}` in teksten. */
export function koppelingen(t: Tekening): string[] {
  const uit = new Set<string>();
  const maat = (m: Maat | undefined) => {
    if (m?.e) uit.add(m.e);
  };
  maat(t.breed);
  maat(t.hoog);
  const teksten = (...s: (string | null | undefined)[]) => {
    for (const x of s) for (const m of (x ?? "").matchAll(/\{\{([^{}]+)\}\}/g)) uit.add(m[1].trim());
  };
  teksten(...t.wortel.map(([, w]) => w));
  for (const el of t.elementen) {
    if (el.soort === "vast") {
      teksten(el.markup);
      continue;
    }
    teksten(el.tekst, el.lijn, el.vulling, el.stijlRest, ...(el.extra ?? []).map(([, w]) => w));
    for (const [k, m] of Object.entries(el.p)) {
      maat(m);
      // Een mm-maat met eenheid rekent om: ook die uitkomst moet de proef weten.
      if (m.e && isMmSleutel(el, k)) uit.add(mmFormule(schoonUitdrukking(m.e)));
    }
    for (const [k, w] of Object.entries(el.o ?? {})) {
      teksten(w);
      if (WAARDE_SLEUTELS.includes(k) && w.trim() && !isWaardeGetal(w)) uit.add(w.trim());
    }
  }
  return [...uit];
}
