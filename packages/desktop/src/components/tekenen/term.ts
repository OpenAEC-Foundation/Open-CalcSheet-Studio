/**
 * Rekenen met maten die een getal zijn of een uitdrukking uit het blad.
 *
 * Een parametrisch symbool tekent zijn lijnen uit een paar maten. Ligt een
 * maat vast, dan is alles een getal; volgt hij het blad (`h`, `L*schaal`), dan
 * wordt elke afgeleide maat een formule, die code.ts verborgen laat uitrekenen
 * in een hulpvariabele. Een formule is hier een lineaire combinatie
 * Σ factor·deel + vast, zodat schalen en verschuiven samenvallen tot één
 * factor en één getal (`h*0.188976 + 97`, niet `h*0.377953*0.5 + 100 - 3`).
 *
 * Geen imports van de app: scripts/check-tekenen-symbolen.mjs laadt dit
 * bestand rechtstreeks in Node.
 */

/** Σ factor·deel + c. Een deel is een naam, een functie of iets tussen haakjes. */
export interface Formule {
  a: [string, number][];
  c: number;
}

export type Term = { n: number } | { f: Formule };

export const getal = (n: number): Term => ({ n });
export const isGetal = (t: Term): t is { n: number } => "n" in t;
const NUL = 1e-12;

/** Een naam (of ander los deel) als term. */
export const naamTerm = (deel: string): Term => ({ f: { a: [[deel, 1]], c: 0 } });

/** Getal op 6 decimalen zonder overbodige nullen. */
function zes(n: number): string {
  const r = Math.round(n * 1e6) / 1e6;
  return Object.is(r, -0) || r === 0 ? "0" : String(r);
}

function vereenvoudig(f: Formule): Term {
  const a = f.a.filter(([, k]) => Math.abs(k) > NUL);
  return a.length === 0 ? getal(f.c) : { f: { a, c: f.c } };
}

/** Een term als formule in de rekentaal. */
export function tekst(t: Term): string {
  if (isGetal(t)) return zes(t.n);
  let s = "";
  for (const [deel, k] of t.f.a) {
    const m = Math.abs(k);
    const stuk = Math.abs(m - 1) < NUL ? deel : `${deel}*${zes(m)}`;
    s += s === "" ? (k < 0 ? `-${stuk}` : stuk) : k < 0 ? ` - ${stuk}` : ` + ${stuk}`;
  }
  if (Math.abs(t.f.c) > 1e-9) s += t.f.c < 0 ? ` - ${zes(-t.f.c)}` : ` + ${zes(t.f.c)}`;
  return s;
}

/** Een term als los deel: een getal of naam zoals hij is, anders tussen haakjes. */
function los(t: Term): string {
  if (isGetal(t)) return t.n < 0 ? `(${zes(t.n)})` : zes(t.n);
  const { a, c } = t.f;
  if (a.length === 1 && Math.abs(a[0][1] - 1) < NUL && Math.abs(c) < 1e-9) return a[0][0];
  return `(${tekst(t)})`;
}

export function plus(...ts: Term[]): Term {
  const a = new Map<string, number>();
  let c = 0;
  for (const t of ts) {
    if (isGetal(t)) {
      c += t.n;
      continue;
    }
    for (const [deel, k] of t.f.a) a.set(deel, (a.get(deel) ?? 0) + k);
    c += t.f.c;
  }
  return vereenvoudig({ a: [...a], c });
}

function schaal(t: Term, k: number): Term {
  if (isGetal(t)) return getal(t.n * k);
  return vereenvoudig({ a: t.f.a.map(([d, f]) => [d, f * k]), c: t.f.c * k });
}

export const neg = (t: Term): Term => schaal(t, -1);
export const min = (a: Term, b: Term): Term => plus(a, neg(b));

export function maal(a: Term, b: Term): Term {
  if (isGetal(a)) return schaal(b, a.n);
  if (isGetal(b)) return schaal(a, b.n);
  return naamTerm(`(${los(a)}*${los(b)})`);
}

export function deel(a: Term, b: Term): Term {
  if (isGetal(b)) return schaal(a, 1 / b.n);
  if (isGetal(a) && a.n === 0) return getal(0);
  return naamTerm(`(${los(a)}/${los(b)})`);
}

/** Een functie van de rekentaal (`abs`, `sqrt`). */
export const functie = (naam: "abs" | "sqrt", t: Term): Term =>
  isGetal(t) ? getal(naam === "abs" ? Math.abs(t.n) : Math.sqrt(t.n)) : naamTerm(`${naam}(${tekst(t)})`);

/** De lengte van (dx, dy), zo kort als het kan: een horizontale maat heeft genoeg aan `abs()`. */
export function lengte(dx: Term, dy: Term): Term {
  if (isGetal(dx) && isGetal(dy)) return getal(Math.hypot(dx.n, dy.n));
  if (isGetal(dy) && dy.n === 0) return functie("abs", dx);
  if (isGetal(dx) && dx.n === 0) return functie("abs", dy);
  return naamTerm(`sqrt(${los(dx)}^2 + ${los(dy)}^2)`);
}

/**
 * Hoe een symbool zijn maten en teksten in de code zet. code.ts levert hem:
 * in de code wordt een formule `{{hulpvariabele}}`, in het beeld van de editor
 * staat er het getal dat het blad geeft.
 */
export interface Uit {
  /** Een maat van het symbool (`x`, `y`, `w`, …) als term. */
  maat(k: string): Term;
  /**
   * Een profielmaat of lengte in mm als term. Heeft de koppeling een eenheid
   * (`h = 240 mm`, `L = 6 m`), dan rekent hij verborgen om: `L/(1 mm)` is 6000.
   */
  maatMm(k: string): Term;
  /** De waarde die de maat nu heeft (voor wat geen formule kan zijn, zoals een aantal pijlen). */
  schatting(k: string): number;
  /** Een term als attribuutwaarde: een getal, of `{{naam}}`. */
  getal(t: Term, decimalen?: number): string;
  /** Tekst met `{{uitdrukking}}`, veilig voor de rekenkern. */
  tekst(s: string): string;
}
