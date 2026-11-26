/**
 * Twee versies van een project of blad vergelijken: het project dat openstaat met een gekozen
 * bestand (components/calc/VergelijkVenster.tsx). Hier alleen het rekenwerk, zonder React en
 * zonder stores, zodat scripts/check-vergelijken.mjs het direct kan nagaan:
 *   - `koppelBladen`: welk blad bij welk blad hoort (id, dan kenmerk, dan naam);
 *   - `regelVerschil`: de rekentekst regel voor regel naast elkaar (Myers), met de
 *     gewijzigde regels tegenover elkaar;
 *   - `tabelVerschil`: invoer of uitkomsten per naam naast elkaar.
 */

export interface VergelijkBlad {
  id: string;
  ref?: string;
  naam: string;
  source: string;
  waarden: Record<string, string>;
}

export type PaarSoort = "gelijk" | "gewijzigd" | "alleenHier" | "alleenDaar";

export interface BladPaar<T extends VergelijkBlad = VergelijkBlad> {
  hier: T | null;
  daar: T | null;
  /** Waarop ze gekoppeld zijn. */
  op: "id" | "ref" | "naam" | null;
}

/**
 * Koppelt de bladen van twee versies: eerst op id (een opgeslagen kopie van hetzelfde
 * project), dan op kenmerk (`#4`), dan op naam. Wat overblijft, staat alleen aan één kant.
 * De volgorde is die van het project dat openstaat, met wat alleen daar staat erachter.
 */
export function koppelBladen<T extends VergelijkBlad>(hier: readonly T[], daar: readonly T[]): BladPaar<T>[] {
  const vrij = new Set(daar);
  const paren: BladPaar<T>[] = [];
  // Eerst alle koppelingen op id, dan op kenmerk, dan op naam: anders pakt een naam een blad
  // dat verderop op id bij een ander hoort.
  const gevonden = new Map<T, { d: T; op: BladPaar["op"] }>();
  for (const stap of ["id", "ref", "naam"] as const) {
    for (const h of hier) {
      if (gevonden.has(h)) continue;
      const d = [...vrij].find((x) => (stap === "id" ? x.id === h.id : stap === "ref" ? !!h.ref && x.ref === h.ref : x.naam === h.naam));
      if (d) {
        gevonden.set(h, { d, op: stap });
        vrij.delete(d);
      }
    }
  }
  for (const h of hier) {
    const g = gevonden.get(h);
    paren.push({ hier: h, daar: g?.d ?? null, op: g?.op ?? null });
  }
  for (const d of daar) if (vrij.has(d)) paren.push({ hier: null, daar: d, op: null });
  return paren;
}

/** Is het blad aan beide kanten gelijk (rekentekst en invoer)? */
export function paarSoort(p: BladPaar): PaarSoort {
  if (!p.hier) return "alleenDaar";
  if (!p.daar) return "alleenHier";
  const tekst = (s: string) => s.replace(/\r\n/g, "\n");
  return tekst(p.hier.source) === tekst(p.daar.source) && tabelVerschil(p.hier.waarden, p.daar.waarden).every((r) => r.gelijk)
    ? "gelijk"
    : "gewijzigd";
}

// ── Regels ────────────────────────────────────────────────────────────────

export interface RegelRij {
  soort: "gelijk" | "gewijzigd" | "weg" | "erbij";
  /** De regel in het project dat openstaat, met zijn nummer (vanaf 1). */
  links?: { nr: number; tekst: string };
  /** De regel in het gekozen bestand. */
  rechts?: { nr: number; tekst: string };
}

type Stap = { soort: "gelijk" | "weg" | "erbij"; a?: number; b?: number };

/** Het kortste bewerkingsscript van a naar b (Myers, O((N+M)·D)). */
function myers(a: readonly string[], b: readonly string[]): Stap[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const v = new Map<number, number>([[1, 0]]);
  const sporen: Map<number, number>[] = [];
  for (let d = 0; d <= max; d++) {
    sporen.push(new Map(v));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1)) ? v.get(k + 1) ?? 0 : (v.get(k - 1) ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v.set(k, x);
      if (x >= n && y >= m) return terug(sporen, a.length, b.length, d);
    }
  }
  return [];
}

function terug(sporen: Map<number, number>[], n: number, m: number, dMax: number): Stap[] {
  const stappen: Stap[] = [];
  let x = n;
  let y = m;
  for (let d = dMax; d > 0; d--) {
    const v = sporen[d];
    const k = x - y;
    const omlaag = k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1));
    const vorigeK = omlaag ? k + 1 : k - 1;
    const vorigeX = v.get(vorigeK) ?? 0;
    const vorigeY = vorigeX - vorigeK;
    while (x > vorigeX && y > vorigeY) {
      stappen.push({ soort: "gelijk", a: --x, b: --y });
    }
    if (omlaag) stappen.push({ soort: "erbij", b: --y });
    else stappen.push({ soort: "weg", a: --x });
  }
  while (x > 0 && y > 0) stappen.push({ soort: "gelijk", a: --x, b: --y });
  return stappen.reverse();
}

/**
 * De rekentekst naast elkaar. Gelijke regels staan tegenover elkaar; een blok weggehaalde
 * regels gevolgd door een blok nieuwe regels wordt regel voor regel "gewijzigd", de rest
 * "weg" of "erbij". Regeleinden van Windows tellen niet.
 */
export function regelVerschil(links: string, rechts: string): RegelRij[] {
  const a = links.replace(/\r\n/g, "\n").split("\n");
  const b = rechts.replace(/\r\n/g, "\n").split("\n");
  // Gelijke kop en staart eerst: dat houdt het script klein bij een grote tekst.
  let kop = 0;
  while (kop < a.length && kop < b.length && a[kop] === b[kop]) kop++;
  let staart = 0;
  while (staart < a.length - kop && staart < b.length - kop && a[a.length - 1 - staart] === b[b.length - 1 - staart]) staart++;
  const midA = a.slice(kop, a.length - staart);
  const midB = b.slice(kop, b.length - staart);
  const stappen = myers(midA, midB).map((s) => ({ ...s, a: s.a !== undefined ? s.a + kop : undefined, b: s.b !== undefined ? s.b + kop : undefined }));
  const alle: Stap[] = [
    ...Array.from({ length: kop }, (_, i) => ({ soort: "gelijk" as const, a: i, b: i })),
    ...stappen,
    ...Array.from({ length: staart }, (_, i) => ({ soort: "gelijk" as const, a: a.length - staart + i, b: b.length - staart + i })),
  ];
  const rijen: RegelRij[] = [];
  const regel = (lijst: string[], i: number) => ({ nr: i + 1, tekst: lijst[i] });
  for (let i = 0; i < alle.length; ) {
    const s = alle[i];
    if (s.soort === "gelijk") {
      rijen.push({ soort: "gelijk", links: regel(a, s.a!), rechts: regel(b, s.b!) });
      i++;
      continue;
    }
    const weg: number[] = [];
    const erbij: number[] = [];
    while (i < alle.length && alle[i].soort === "weg") weg.push(alle[i++].a!);
    while (i < alle.length && alle[i].soort === "erbij") erbij.push(alle[i++].b!);
    const samen = Math.min(weg.length, erbij.length);
    for (let j = 0; j < samen; j++) rijen.push({ soort: "gewijzigd", links: regel(a, weg[j]), rechts: regel(b, erbij[j]) });
    for (let j = samen; j < weg.length; j++) rijen.push({ soort: "weg", links: regel(a, weg[j]) });
    for (let j = samen; j < erbij.length; j++) rijen.push({ soort: "erbij", rechts: regel(b, erbij[j]) });
  }
  return rijen;
}

/** Alleen de rijen die verschillen, met `context` gelijke regels eromheen; de rest als `null` (een sprong). */
export function metContext(rijen: readonly RegelRij[], context = 2): (RegelRij | null)[] {
  const toon = new Array<boolean>(rijen.length).fill(false);
  rijen.forEach((r, i) => {
    if (r.soort === "gelijk") return;
    for (let j = Math.max(0, i - context); j <= Math.min(rijen.length - 1, i + context); j++) toon[j] = true;
  });
  const uit: (RegelRij | null)[] = [];
  rijen.forEach((r, i) => {
    if (toon[i]) uit.push(r);
    else if (uit[uit.length - 1] !== null) uit.push(null);
  });
  if (uit[0] === null) uit.shift();
  if (uit[uit.length - 1] === null) uit.pop();
  return uit;
}

// ── Tabellen ──────────────────────────────────────────────────────────────

export interface TabelRij {
  naam: string;
  links?: string;
  rechts?: string;
  gelijk: boolean;
  /** Bij twee getallen: het relatieve verschil (rechts − links) / |links|. */
  verschil?: number;
}

/** Een getal aan het begin van een uitkomst: "13.62 N / mm^2" → 13,62. */
function getalVan(tekst: string | undefined): number | null {
  if (tekst === undefined) return null;
  const m = /^\s*(-?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/i.exec(tekst);
  return m ? Number(m[1]) : null;
}

/** De eenheid na het getal: "13.62 N / mm^2" → "N / mm^2". */
const eenheidVan = (tekst: string) => tekst.replace(/^\s*-?\d+(?:\.\d+)?(?:e[-+]?\d+)?\s*/i, "");

/**
 * Twee tabellen naam → waarde naast elkaar, op naam gesorteerd volgens de volgorde links
 * en dan rechts. Bij twee getallen met dezelfde eenheid ook het relatieve verschil.
 */
export function tabelVerschil(links: Record<string, string>, rechts: Record<string, string>): TabelRij[] {
  const namen = [...new Set([...Object.keys(links), ...Object.keys(rechts)])];
  return namen.map((naam) => {
    const l = links[naam];
    const r = rechts[naam];
    const rij: TabelRij = { naam, gelijk: l === r };
    if (l !== undefined) rij.links = l;
    if (r !== undefined) rij.rechts = r;
    const gl = getalVan(l);
    const gr = getalVan(r);
    if (!rij.gelijk && gl !== null && gr !== null && l !== undefined && r !== undefined && eenheidVan(l) === eenheidVan(r) && gl !== 0) {
      rij.verschil = (gr - gl) / Math.abs(gl);
    }
    return rij;
  });
}
