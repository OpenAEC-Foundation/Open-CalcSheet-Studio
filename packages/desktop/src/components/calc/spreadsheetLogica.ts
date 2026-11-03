/*
 * Het gereedschap van een spreadsheet-blad, zonder DOM, React of rekenkern:
 * verwijzingen lezen en verschuiven, een verwijzing in een open formule zetten,
 * AutoSom en functies, doorvoeren, sorteren, het klembord als tekst en HTML en
 * Nederlandse invoer. check-spreadsheet.mjs laadt dit bestand rechtstreeks.
 *
 * Grotendeels overgenomen uit Open Office Studio (Apache-2.0), src/lint/rekenblad-logica.ts,
 * rekenblad-reeks.ts, src/rekenblad/klembordLogica.ts, maten.ts en src/rekenbladinvoer.ts.
 * Alles telt rijen en kolommen vanaf 0; een formule staat hier zonder de "=".
 */

export interface Cel {
  row: number;
  col: number;
}

export interface Bereik {
  top: number;
  left: number;
  bottom: number;
  right: number;
}

/** Zoals de rekenkern een cel teruggeeft (XlsxCellValue). */
export type Waarde =
  | { kind: "empty" }
  | { kind: "number"; value: number }
  | { kind: "text"; value: string }
  | { kind: "bool"; value: boolean }
  | { kind: "error"; value: string };

/** Een cel om te kopiëren, door te voeren of te sorteren. */
export interface BronCel {
  waarde: Waarde;
  /** De formule zonder "=", of null. */
  formule: string | null;
}

/** De grootste werkmap die het XLSX-formaat kent. */
export const MAX_RIJEN = 1_048_576;
export const MAX_KOLOMMEN = 16_384;

export function kolomLetters(col: number): string {
  let letters = "";
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}

export function kolomNummer(letters: string): number {
  let n = 0;
  for (const teken of letters.toUpperCase()) n = n * 26 + teken.charCodeAt(0) - 64;
  return n - 1;
}

export const adres = ({ row, col }: Cel): string => `${kolomLetters(col)}${row + 1}`;

export function ontleedAdres(tekst: string): Cel | null {
  const m = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/.exec(tekst.trim());
  if (!m) return null;
  const cel = { row: Number(m[2]) - 1, col: kolomNummer(m[1]) };
  return cel.row >= 0 && cel.row < MAX_RIJEN && cel.col >= 0 && cel.col < MAX_KOLOMMEN ? cel : null;
}

export function ontleedBereik(tekst: string): Bereik | null {
  const delen = tekst.trim().split(":");
  if (delen.length > 2) return null;
  const a = ontleedAdres(delen[0]);
  const b = delen.length === 2 ? ontleedAdres(delen[1]) : a;
  if (!a || !b) return null;
  return bereikTussen(a, b);
}

export function bereikTussen(a: Cel, b: Cel): Bereik {
  return {
    top: Math.min(a.row, b.row),
    left: Math.min(a.col, b.col),
    bottom: Math.max(a.row, b.row),
    right: Math.max(a.col, b.col),
  };
}

/** "B2" voor één cel, anders "B2:D5". */
export function bereikA1(b: Bereik): string {
  const begin = adres({ row: b.top, col: b.left });
  return b.top === b.bottom && b.left === b.right ? begin : `${begin}:${adres({ row: b.bottom, col: b.right })}`;
}

export const aantalCellen = (b: Bereik): number => (b.bottom - b.top + 1) * (b.right - b.left + 1);
export const heleKolom = (b: Bereik): boolean => b.top === 0 && b.bottom === MAX_RIJEN - 1;
export const heleRij = (b: Bereik): boolean => b.left === 0 && b.right === MAX_KOLOMMEN - 1;

// ── Verwijzingen in formules ──────────────────────────────────────────────

const TEKST_IN_FORMULE = `"(?:[^"]|"")*"`;
const BLADNAAM = `'(?:[^']|'')+'`;
const CELVERWIJZING = "(?<![A-Za-z0-9_.$])(\\$?)([A-Za-z]{1,3})(\\$?)(\\d{1,7})(?![A-Za-z0-9_(!.])";
const HELE_KOLOM = "(?<![A-Za-z0-9_.$])(\\$?)([A-Za-z]{1,3}):(\\$?)([A-Za-z]{1,3})(?![A-Za-z0-9_(!.:])";
const HELE_RIJ = "(?<![A-Za-z0-9_.$:])(\\$?)(\\d{1,7}):(\\$?)(\\d{1,7})(?![A-Za-z0-9_(!.:])";

const VERSCHUIF = new RegExp(`${TEKST_IN_FORMULE}|${BLADNAAM}|${HELE_KOLOM}|${HELE_RIJ}|${CELVERWIJZING}`, "g");

/**
 * Verschuift de relatieve verwijzingen in een formule, zoals bij kopiëren en
 * doorvoeren. Absolute delen ($A$1) blijven staan; tekst tussen aanhalingstekens
 * en bladnamen blijven ongemoeid. Komt een verwijzing buiten het werkblad, dan
 * wordt hij #REF!.
 */
export function verschuifFormule(formule: string, rijen: number, kolommen: number): string {
  return formule.replace(VERSCHUIF, (heel, ka1, k1, ka2, k2, ra1, r1, ra2, r2, ka, letters, ra, cijfers) => {
    if (k1 !== undefined) {
      const van = ka1 ? kolomNummer(k1) : kolomNummer(k1) + kolommen;
      const tot = ka2 ? kolomNummer(k2) : kolomNummer(k2) + kolommen;
      if (kolomNummer(k1) >= MAX_KOLOMMEN || kolomNummer(k2) >= MAX_KOLOMMEN) return heel;
      if (van < 0 || tot < 0 || van >= MAX_KOLOMMEN || tot >= MAX_KOLOMMEN) return "#REF!";
      return `${ka1}${kolomLetters(van)}:${ka2}${kolomLetters(tot)}`;
    }
    if (r1 !== undefined) {
      const van = ra1 ? Number(r1) : Number(r1) + rijen;
      const tot = ra2 ? Number(r2) : Number(r2) + rijen;
      if (van < 1 || tot < 1 || van > MAX_RIJEN || tot > MAX_RIJEN) return "#REF!";
      return `${ra1}${van}:${ra2}${tot}`;
    }
    if (letters === undefined) return heel;
    const col = kolomNummer(letters);
    const row = Number(cijfers) - 1;
    if (col >= MAX_KOLOMMEN || row < 0 || row >= MAX_RIJEN) return heel;
    const c = ka ? col : col + kolommen;
    const r = ra ? row : row + rijen;
    if (c < 0 || r < 0 || c >= MAX_KOLOMMEN || r >= MAX_RIJEN) return "#REF!";
    return `${ka}${kolomLetters(c)}${ra}${r + 1}`;
  });
}

export interface GevondenVerwijzing {
  begin: number;
  eind: number;
  /** De bladnaam als die in de verwijzing staat, anders null: dit werkblad. */
  blad: string | null;
  bereik: Bereik;
}

const GEVONDEN = new RegExp(
  `${TEKST_IN_FORMULE}|(?:(?:(${BLADNAAM})|([A-Za-z_][\\w.]*))!)?${CELVERWIJZING}(?::${CELVERWIJZING})?`,
  "g",
);

/** De celverwijzingen in een open formule (met "="), om ze in het raster aan te wijzen. */
export function verwijzingenIn(tekst: string): GevondenVerwijzing[] {
  const uit: GevondenVerwijzing[] = [];
  for (const m of tekst.matchAll(GEVONDEN)) {
    if (m[4] === undefined) continue;
    const a = ontleedAdres(`${m[4]}${m[6]}`);
    const b = m[8] !== undefined ? ontleedAdres(`${m[8]}${m[10]}`) : a;
    if (!a || !b) continue;
    const blad = m[1] ? m[1].slice(1, -1).replace(/''/g, "'") : (m[2] ?? null);
    uit.push({ begin: m.index, eind: m.index + m[0].length, blad, bereik: bereikTussen(a, b) });
  }
  return uit;
}

/** Staat de plek in een tekst tussen aanhalingstekens? */
function inTekst(tekst: string, plek: number): boolean {
  let binnen = false;
  for (let i = 0; i < plek; i++) if (tekst[i] === '"') binnen = !binnen;
  return binnen;
}

/**
 * Past op deze plek een verwijzing? Dat kan alleen waar de formule een waarde
 * verwacht: na "=", een bewerking, "(", "," of ":", en niet midden in een woord
 * of in tekst. `eind` is het eind van de geselecteerde tekst, die dan vervalt.
 * In een afgeronde formule (`=A1*2`, cursor achteraan) is een klik dus geen
 * verwijzing maar gewoon naar die cel gaan.
 */
export function magVerwijzingHier(tekst: string, begin: number, eind = begin): boolean {
  if (!tekst.startsWith("=") || begin < 1 || inTekst(tekst, begin)) return false;
  const voor = tekst.slice(0, begin).trimEnd().slice(-1);
  if (!"=+-*/^&<>(,;:".includes(voor)) return false;
  const na = tekst.slice(eind).trimStart()[0];
  return na === undefined || /[)+\-*/^&<>=,;:%]/.test(na);
}

export interface Geplaatst {
  tekst: string;
  begin: number;
  eind: number;
}

/** Zet `verwijzing` in de tekst op de plek van begin…eind. */
export function zetVerwijzing(tekst: string, begin: number, eind: number, verwijzing: string): Geplaatst {
  return { tekst: `${tekst.slice(0, begin)}${verwijzing}${tekst.slice(eind)}`, begin, eind: begin + verwijzing.length };
}

/**
 * Wat een gebruiker typt omgezet naar wat de rekenkern leest: `;` tussen
 * argumenten wordt `,`, en dan is een komma tussen cijfers een decimaalkomma
 * (`=IF(A1>1,5;1;0)`). Zonder `;` blijft een komma tussen haakjes een
 * scheidingsteken (`=ROUND(A1,2)`); buiten haakjes is hij decimaal (`=A1*1,5`).
 */
export function formuleVoorKern(tekst: string): string {
  if (!tekst.startsWith("=")) return tekst;
  const delen = tekst.split(/("(?:[^"]|"")*")/);
  const heeftPuntkomma = delen.some((deel, i) => i % 2 === 0 && deel.includes(";"));
  let diepte = 0;
  return delen
    .map((deel, i) => {
      if (i % 2) return deel;
      let uit = "";
      for (let k = 0; k < deel.length; k++) {
        const c = deel[k];
        if (c === "(") diepte++;
        else if (c === ")") diepte--;
        const tussenCijfers = c === "," && /\d/.test(deel[k - 1] ?? "") && /\d/.test(deel[k + 1] ?? "") && !/[A-Za-z$]\d*$/.test(deel.slice(0, k));
        if (c === "," && tussenCijfers && (heeftPuntkomma || diepte === 0)) uit += ".";
        else if (c === ";") uit += ",";
        else uit += c;
      }
      return uit;
    })
    .join("");
}

/**
 * Getypte invoer voor de rekenkern: een formule volgens `formuleVoorKern`, en een
 * decimaalkomma wordt een punt (`1,5`, `1.234,5`, `12,5%`). De rest blijft zoals
 * getypt; `1.234` is dus 1,234 en geen 1234.
 */
export function invoerVoorKern(tekst: string): string {
  if (tekst.startsWith("=")) return formuleVoorKern(tekst);
  const m = /^(\s*[-+]?)(\d{1,3}(?:\.\d{3})+|\d+),(\d+)(\s?%?\s*)$/.exec(tekst);
  return m ? `${m[1]}${m[2].replace(/\./g, "")}.${m[3]}${m[4]}` : tekst;
}

// ── Functies ──────────────────────────────────────────────────────────────

/** De functies in de kiezer; de rekenkern kent de Engelse namen. */
export const FUNCTIES = ["SUM", "PRODUCT", "AVERAGE", "MIN", "MAX", "COUNT", "IF", "ROUND", "ABS"] as const;
export type Functie = (typeof FUNCTIES)[number];

const isLeeg = (w: Waarde) => w.kind === "empty" || (w.kind === "text" && w.value === "");

/** Aaneengesloten getallen boven de cel, anders links ervan; lege cellen ertussen tellen niet. */
export function bereikVoorstel(cel: Cel, waarde: (c: Cel) => Waarde): Bereik | null {
  let r = cel.row - 1;
  while (r >= 0 && isLeeg(waarde({ row: r, col: cel.col }))) r--;
  let begin = r;
  while (begin >= 0 && waarde({ row: begin, col: cel.col }).kind === "number") begin--;
  if (begin < r) return { top: begin + 1, left: cel.col, bottom: r, right: cel.col };
  let c = cel.col - 1;
  while (c >= 0 && isLeeg(waarde({ row: cel.row, col: c }))) c--;
  let start = c;
  while (start >= 0 && waarde({ row: cel.row, col: start }).kind === "number") start--;
  if (start < c) return { top: cel.row, left: start + 1, bottom: cel.row, right: c };
  return null;
}

/** De dichtstbijzijnde gevulde cel erboven of links, voor een functie met één waarde. */
export function celVoorstel(cel: Cel, waarde: (c: Cel) => Waarde): Cel | null {
  const links = cel.col > 0 && !isLeeg(waarde({ row: cel.row, col: cel.col - 1 })) ? { row: cel.row, col: cel.col - 1 } : null;
  const boven = cel.row > 0 && !isLeeg(waarde({ row: cel.row - 1, col: cel.col })) ? { row: cel.row - 1, col: cel.col } : null;
  return links ?? boven;
}

export interface FunctieTekst {
  /** De open formule, met "=". */
  tekst: string;
  /** Wat de gebruiker waarschijnlijk wil vervangen; daarop staat de selectie. */
  begin: number;
  eind: number;
}

/**
 * De formule met een voorstel voor het bereik. Een lijstfunctie krijgt het bereik,
 * een functie met één waarde de cel ernaast. Zonder voorstel staat de cursor tussen
 * de haakjes, zodat de gebruiker de cellen kan aanwijzen.
 */
export function functieTekst(f: Functie, bereik: Bereik | null, cel: Cel | null): FunctieTekst {
  const naar = (kop: string, midden: string, staart: string): FunctieTekst => ({
    tekst: `${kop}${midden}${staart}`,
    begin: kop.length,
    eind: kop.length + midden.length,
  });
  const a1 = cel ? adres(cel) : "";
  switch (f) {
    case "IF":
      return naar("=IF(", a1 ? `${a1}>0` : "", ",1,0)");
    case "ROUND":
      return naar("=ROUND(", a1, ",2)");
    case "ABS":
      return naar("=ABS(", a1, ")");
    default:
      return naar(`=${f}(`, bereik ? bereikA1(bereik) : "", ")");
  }
}

/**
 * Waar de formule komt bij een selectie van meer cellen: in de laatste cel als die
 * leeg is (dan telt de selectie tot daar), anders in de cel eronder of ernaast.
 */
export function somPlan(bereik: Bereik, waarde: (c: Cel) => Waarde): { rij: number; vanaf: number; tot: number; links: number; rechts: number } | null {
  let laatsteLeeg = true;
  for (let c = bereik.left; c <= bereik.right; c++) if (!isLeeg(waarde({ row: bereik.bottom, col: c }))) laatsteLeeg = false;
  const rij = laatsteLeeg ? bereik.bottom : bereik.bottom + 1;
  const tot = rij - 1;
  if (tot < bereik.top || rij >= MAX_RIJEN) return null;
  return { rij, vanaf: bereik.top, tot, links: bereik.left, rechts: bereik.right };
}

// ── Doorvoeren ────────────────────────────────────────────────────────────

export type VulRichting = "omlaag" | "omhoog" | "rechts" | "links";

/** Het bereik dat erbij komt als `aantal` rijen of kolommen in `richting` worden gevuld. */
export function doelBereik(bron: Bereik, richting: VulRichting, aantal: number): Bereik {
  switch (richting) {
    case "omlaag":
      return { ...bron, top: bron.bottom + 1, bottom: bron.bottom + aantal };
    case "omhoog":
      return { ...bron, top: bron.top - aantal, bottom: bron.top - 1 };
    case "rechts":
      return { ...bron, left: bron.right + 1, right: bron.right + aantal };
    case "links":
      return { ...bron, left: bron.left - aantal, right: bron.left - 1 };
  }
}

/** De richting vanaf een bereik naar de cel onder de vulgreep; de grootste afstand wint. */
export function richtingNaar(bron: Bereik, cel: Cel): { richting: VulRichting; aantal: number } | null {
  const omlaag = cel.row - bron.bottom;
  const omhoog = bron.top - cel.row;
  const rechts = cel.col - bron.right;
  const links = bron.left - cel.col;
  const verticaal = Math.max(omlaag, omhoog);
  const horizontaal = Math.max(rechts, links);
  if (verticaal <= 0 && horizontaal <= 0) return null;
  if (verticaal >= horizontaal) return omlaag > 0 ? { richting: "omlaag", aantal: omlaag } : { richting: "omhoog", aantal: omhoog };
  return rechts > 0 ? { richting: "rechts", aantal: rechts } : { richting: "links", aantal: links };
}

const rest = (a: number, n: number) => ((a % n) + n) % n;

/** Rekenruis weg: 0.1 + 0.2 wordt 0.3. */
export function rond(getal: number): number {
  return Number(getal.toPrecision(14));
}

/** "Week 3" naar voor, getal en na. */
function tekstMetGetal(tekst: string): { voor: string; getal: number; na: string } | null {
  const m = /^(.*?)(\d+)(\D*)$/.exec(tekst);
  return m ? { voor: m[1], getal: Number(m[2]), na: m[3] } : null;
}

/**
 * Eén lijn doorvoeren: `bronnen` staan op de plekken 0…n-1, `plekken` zijn de
 * doelplekken daar vanaf geteld (negatief is ervoor). Met `reeks` lopen getallen en
 * "Week 1" door; anders herhaalt de bron zich. Een formule verschuift met zijn
 * afstand tot de bron, langs de richting van het vullen.
 */
export function vulLijn(
  bronnen: BronCel[],
  plekken: number[],
  verschuiving: (afstand: number) => { rijen: number; kolommen: number },
  reeks = false,
): BronCel[] {
  const n = bronnen.length;
  const kopie = (p: number): BronCel => {
    const i = rest(p, n);
    const bron = bronnen[i];
    if (bron.formule === null) return bron;
    const v = verschuiving(p - i);
    return { waarde: bron.waarde, formule: verschuifFormule(bron.formule, v.rijen, v.kolommen) };
  };
  if (!reeks || bronnen.some((b) => b.formule !== null)) return plekken.map(kopie);

  const getallen = bronnen.map((b) => (b.waarde.kind === "number" ? b.waarde.value : null));
  if (n >= 2 && getallen.every((g) => g !== null)) {
    const { helling, snijpunt } = lineaireTrend(getallen as number[]);
    return plekken.map((p) => ({ waarde: { kind: "number", value: rond(snijpunt + helling * p) }, formule: null }));
  }
  const delen = bronnen.map((b) => (b.waarde.kind === "text" ? tekstMetGetal(b.waarde.value) : null));
  const eerste = delen[0];
  if (eerste && delen.every((d) => d && d.voor === eerste.voor && d.na === eerste.na)) {
    const nummers = delen.map((d) => d!.getal);
    const stap = n > 1 ? nummers[n - 1] - nummers[n - 2] : 1;
    return plekken.map((p) => {
      const basis = p >= n ? nummers[n - 1] : nummers[0];
      const afstand = p >= n ? p - (n - 1) : p;
      const nummer = Math.max(0, basis + afstand * stap);
      return { waarde: { kind: "text", value: `${eerste.voor}${nummer}${eerste.na}` }, formule: null };
    });
  }
  return plekken.map(kopie);
}

/** De rechte door de punten (0, y₀), (1, y₁), … met de kleinste kwadraten. */
export function lineaireTrend(y: number[]): { helling: number; snijpunt: number } {
  const n = y.length;
  const gemX = (n - 1) / 2;
  const gemY = y.reduce((a, b) => a + b, 0) / n;
  let boven = 0;
  let onder = 0;
  y.forEach((w, x) => {
    boven += (x - gemX) * (w - gemY);
    onder += (x - gemX) ** 2;
  });
  const helling = onder ? boven / onder : 0;
  return { helling, snijpunt: gemY - helling * gemX };
}

// ── Sorteren ──────────────────────────────────────────────────────────────

/** Volgorde: getallen, dan tekst, dan waar/onwaar, dan fouten; lege cellen altijd onderaan. */
function rang(w: Waarde): number {
  return w.kind === "number" ? 0 : w.kind === "text" ? 1 : w.kind === "bool" ? 2 : 3;
}

function vergelijk(a: Waarde, b: Waarde, taal: Intl.Collator): number {
  const verschil = rang(a) - rang(b);
  if (verschil) return verschil;
  if (a.kind === "number" && b.kind === "number") return a.value - b.value;
  if (a.kind === "bool" && b.kind === "bool") return Number(a.value) - Number(b.value);
  if ((a.kind === "text" || a.kind === "error") && (b.kind === "text" || b.kind === "error")) return taal.compare(a.value, b.value);
  return 0;
}

/** De nieuwe volgorde van de rijen (indices); stabiel, en lege sleutels blijven onderaan. */
export function sorteerVolgorde(rijen: Waarde[][], sleutel: number, aflopend: boolean, taal = "nl"): number[] {
  const collator = new Intl.Collator(taal, { sensitivity: "accent", numeric: true });
  return rijen
    .map((_, i) => i)
    .sort((i, j) => {
      const a = rijen[i][sleutel] ?? { kind: "empty" };
      const b = rijen[j][sleutel] ?? { kind: "empty" };
      if (isLeeg(a) || isLeeg(b)) return Number(isLeeg(a)) - Number(isLeeg(b)) || i - j;
      return (aflopend ? -1 : 1) * vergelijk(a, b, collator) || i - j;
    });
}

/** Een kopregel: de eerste rij heeft alleen tekst, en de rij eronder minstens één getal. */
export function heeftKoprij(rijen: Waarde[][]): boolean {
  if (rijen.length < 2) return false;
  const [kop, volgende] = rijen;
  return (
    kop.some((w) => !isLeeg(w)) &&
    kop.every((w) => isLeeg(w) || w.kind === "text") &&
    volgende.some((w) => w.kind === "number" || w.kind === "bool")
  );
}

// ── Maten ─────────────────────────────────────────────────────────────────

/*
 * Nagemeten aan de rekenkern 0.5.1 (check-spreadsheet.mjs): een kolom van w tekens
 * is 7·w + 5 px breed, een rij van h punten h·4/3 px hoog. In het bestand komt
 * precies de ingestelde waarde.
 */
const CIJFER = 7;
const KOLOMRAND = 5;
export const MAX_BREEDTE = 255;
export const MAX_HOOGTE = 409;
/** Ruimte die de rekenkern links en rechts van celtekst laat, in px. */
export const CELMARGE = 4;

export function breedtePx(tekens: number): number {
  return tekens <= 0 ? 0 : tekens * CIJFER + KOLOMRAND;
}

export function breedteTekens(px: number): number {
  if (px <= 0.5) return 0;
  const tekens = px < CIJFER + KOLOMRAND ? px / (CIJFER + KOLOMRAND) : (px - KOLOMRAND) / CIJFER;
  return Math.round(Math.min(tekens, MAX_BREEDTE) * 100) / 100;
}

export function hoogtePx(punten: number): number {
  return punten <= 0 ? 0 : (punten * 4) / 3;
}

export function hoogtePunten(px: number): number {
  if (px <= 0.5) return 0;
  return Math.min(MAX_HOOGTE, Math.ceil(((px * 3) / 4) * 4) / 4);
}

/** De breedte in tekens die `px` tekst plus de celmarge toont. */
export function breedteVoorTekst(px: number): number {
  return Math.min(MAX_BREEDTE, Math.ceil(((px + 2 * CELMARGE - KOLOMRAND) / CIJFER) * 100) / 100);
}

// ── Het klembord ──────────────────────────────────────────────────────────

/** Een cel als HTML voor andere programma's. */
export interface HtmlCel {
  tekst: string;
  /** De ruwe waarde van een getal, voor spreadsheets die de tabel overnemen. */
  ruw?: number;
  vet?: boolean;
  cursief?: boolean;
  kleur?: string;
  vulling?: string;
  uitlijning?: "left" | "center" | "right";
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
const html = (tekst: string) => tekst.replace(/[&<>"]/g, (c) => ESCAPES[c]);
const kleurOk = (kleur?: string) => (kleur && /^#[0-9a-f]{6}$/i.test(kleur) ? kleur : undefined);

/** Een HTML-document met één tabel, zoals spreadsheets dat op het klembord zetten. */
export function naarHtml(rijen: HtmlCel[][]): string {
  const body = rijen
    .map((rij) => {
      const cellen = rij.map((c) => {
        const stijl: string[] = [];
        if (c.vet) stijl.push("font-weight:bold");
        if (c.cursief) stijl.push("font-style:italic");
        if (kleurOk(c.kleur) && c.kleur!.toLowerCase() !== "#000000") stijl.push(`color:${c.kleur}`);
        if (kleurOk(c.vulling) && c.vulling!.toLowerCase() !== "#ffffff") stijl.push(`background:${c.vulling}`);
        const uitlijning = c.uitlijning && c.uitlijning !== "left" ? c.uitlijning : c.ruw !== undefined ? "right" : undefined;
        if (uitlijning) stijl.push(`text-align:${uitlijning}`);
        const ruw = c.ruw !== undefined && Number.isFinite(c.ruw) ? ` x:num="${c.ruw}" sdval="${c.ruw}"` : "";
        const opmaak = stijl.length ? ` style="${stijl.join(";")}"` : "";
        return `<td${ruw}${opmaak}>${html(c.tekst).replace(/\r?\n/g, "<br>")}</td>`;
      });
      return `<tr>${cellen.join("")}</tr>`;
    })
    .join("");
  return `<html><head><meta charset="utf-8"></head><body><table border="1" cellspacing="0" style="border-collapse:collapse"><tbody>${body}</tbody></table></body></html>`;
}

/** Tabgescheiden tekst; een veld met tab, regeleinde of aanhalingsteken staat tussen aanhalingstekens. */
export function naarTsv(rijen: string[][]): string {
  return rijen.map((rij) => rij.map((veld) => (/[\t\n\r"]/.test(veld) ? `"${veld.replace(/"/g, '""')}"` : veld)).join("\t")).join("\r\n");
}

/** Klembordtekst vergelijken zonder verschil in regeleinden. */
export const zelfdeTekst = (a: string, b: string): boolean => a.replace(/\r\n?/g, "\n").replace(/\n$/, "") === b.replace(/\r\n?/g, "\n").replace(/\n$/, "");

/** Tabgescheiden tekst naar rijen, ook met velden tussen aanhalingstekens. */
export function leesTsv(tekst: string): string[][] {
  const schoon = tekst.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  if (!schoon) return [];
  const rijen: string[][] = [];
  let rij: string[] = [];
  let veld = "";
  let aanhaling = false;
  for (let i = 0; i < schoon.length; i++) {
    const c = schoon[i];
    if (aanhaling) {
      if (c === '"' && schoon[i + 1] === '"') {
        veld += '"';
        i++;
      } else if (c === '"') aanhaling = false;
      else veld += c;
    } else if (c === '"' && veld === "") aanhaling = true;
    else if (c === "\t") {
      rij.push(veld);
      veld = "";
    } else if (c === "\n") {
      rij.push(veld);
      rijen.push(rij);
      rij = [];
      veld = "";
    } else veld += c;
  }
  rij.push(veld);
  rijen.push(rij);
  const breedte = Math.max(...rijen.map((r) => r.length));
  return rijen.map((r) => Array.from({ length: breedte }, (_, j) => r[j] ?? ""));
}

const ENTITEITEN: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", euro: "€", shy: "" };

function ontsnap(tekst: string): string {
  return tekst.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (heel, naam: string) => {
    if (naam[0] === "#") {
      const code = naam[1].toLowerCase() === "x" ? parseInt(naam.slice(2), 16) : Number(naam.slice(1));
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : heel;
    }
    return ENTITEITEN[naam.toLowerCase()] ?? heel;
  });
}

const attribuut = (tag: string, naam: string) =>
  new RegExp(`\\s${naam}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag)?.slice(1).find((w) => w !== undefined);

/**
 * De eerste tabel uit klembord-HTML als rijen tekst, met samengevoegde cellen
 * uitgevouwen (de tekst in de linkerbovencel). Een ruwe getalwaarde gaat voor de
 * getoonde tekst.
 */
export function leesHtmlTabel(bron: string): string[][] | null {
  const begin = bron.search(/<table[\s>]/i);
  if (begin < 0) return null;
  const rijen: string[][] = [];
  const bezet: boolean[][] = [];
  let r = 0;
  for (const [rijHtml] of bron.slice(begin).matchAll(/<tr[\s>][\s\S]*?(?=<tr[\s>]|<\/table>|$)/gi)) {
    const rij = (rijen[r] ??= []);
    let c = 0;
    for (const m of rijHtml.matchAll(/<t([dh])(\s[^>]*)?>([\s\S]*?)(?=<t[dh][\s>]|<\/tr>|$)/gi)) {
      while (bezet[r]?.[c]) c++;
      const tag = `<t${m[1]}${m[2] ?? ""}>`;
      const inhoud = m[3].replace(/<\/t[dh]>\s*$/i, "");
      const ruw = attribuut(tag, "x:num") ?? attribuut(tag, "sdval");
      const tekst =
        ruw !== undefined && ruw !== "" && Number.isFinite(Number(ruw))
          ? ruw
          : ontsnap(
              inhoud
                .replace(/<style[\s\S]*?<\/style>/gi, "")
                .replace(/\s+/g, " ")
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<\/(p|div|li)>\s*(?=<(p|div|li)[\s>])/gi, "\n")
                .replace(/<[^>]+>/g, ""),
            )
              .split("\n")
              .map((regel) => regel.replace(/ /g, " ").trim())
              .join("\n")
              .trim();
      const rs = Math.max(1, Math.min(Number(attribuut(tag, "rowspan")) || 1, 1000));
      const cs = Math.max(1, Math.min(Number(attribuut(tag, "colspan")) || 1, 1000));
      for (let i = 0; i < rs; i++) {
        for (let j = 0; j < cs; j++) {
          (bezet[r + i] ??= [])[c + j] = true;
          (rijen[r + i] ??= [])[c + j] = i === 0 && j === 0 ? tekst : "";
        }
      }
      c += cs;
    }
    if (rij.length || rijHtml.trim()) r++;
  }
  const breedte = Math.max(0, ...rijen.map((rij) => rij.length));
  if (!breedte) return null;
  return rijen.map((rij) => Array.from({ length: breedte }, (_, i) => rij[i] ?? ""));
}

// ── Nederlandse invoer ────────────────────────────────────────────────────

export interface NederlandseInvoer {
  /** De invoer zoals de rekenkern hem leest. */
  invoer: string;
  /** De getalnotatie erbij; ontbreekt als de bestaande notatie kan blijven. */
  notatie?: string;
}

const GETAL = /^([-+]?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?$/;

function nlGetal(tekst: string): number | null {
  const m = GETAL.exec(tekst);
  if (!m) return null;
  const waarde = Number(`${m[1]}${m[2].replace(/\./g, "")}${m[3] ? `.${m[3]}` : ""}`);
  return Number.isFinite(waarde) ? waarde : null;
}

function datumgetal(jaar: number, maand: number, dag: number): number | null {
  const datum = new Date(Date.UTC(jaar, maand - 1, dag));
  if (datum.getUTCFullYear() !== jaar || datum.getUTCMonth() !== maand - 1 || datum.getUTCDate() !== dag) return null;
  return (datum.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000;
}

/**
 * De rekenkern kent alleen getallen met een decimale punt; "1,5", "12,5%", "€ 1.234,50",
 * "26-10-2026" en "14:30" blijven daar tekst. Dit zet zulke invoer om. Null: laat de
 * invoer zoals hij is.
 */
export function leesNederlands(ruw: string): NederlandseInvoer | null {
  const tekst = ruw.trim();
  if (!tekst || tekst.startsWith("=") || tekst.startsWith("'")) return null;
  if ((/^[-+]?\d+$/.test(tekst) || /^[-+]?\d*\.\d+$/.test(tekst)) && !/^[-+]?\d{1,3}(\.\d{3})+$/.test(tekst)) return null;
  const kaal = nlGetal(tekst);
  if (kaal !== null) return { invoer: String(kaal) };

  const procent = /^(.+?)\s?%$/.exec(tekst);
  if (procent) {
    const waarde = nlGetal(procent[1]);
    if (waarde === null) return null;
    const n = /,(\d+)/.exec(procent[1])?.[1].length ?? 0;
    return { invoer: String(rond(waarde / 100)), notatie: n ? `0.${"0".repeat(n)}%` : "0%" };
  }
  const valuta = /^(?:€\s?(.+)|(.+?)\s?€)$/.exec(tekst);
  if (valuta) {
    const waarde = nlGetal(valuta[1] ?? valuta[2]);
    return waarde === null ? null : { invoer: String(waarde), notatie: '"€ "#,##0.00' };
  }
  const datum = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4}|\d{2})$/.exec(tekst);
  if (datum) {
    let jaar = Number(datum[3]);
    if (datum[3].length === 2) jaar += jaar < 30 ? 2000 : 1900;
    const serie = datumgetal(jaar, Number(datum[2]), Number(datum[1]));
    return serie === null ? null : { invoer: String(serie), notatie: "d-m-yyyy" };
  }
  const tijd = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(tekst);
  if (tijd) {
    const [u, m, s] = [Number(tijd[1]), Number(tijd[2]), Number(tijd[3] ?? 0)];
    if (u > 23 || m > 59 || s > 59) return null;
    return { invoer: String(rond((u * 3600 + m * 60 + s) / 86_400)), notatie: tijd[3] ? "h:mm:ss" : "h:mm" };
  }
  return null;
}
