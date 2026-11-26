/**
 * De toetsregistratie van een blad: de controle door een tweede constructeur (vier ogen).
 *
 * Per blad een lijst registraties (`Exemplaar.controle`, in het projectbestand
 * `ocss::blad::controle`): wie, op welke datum, met welke uitkomst en opmerkingen, en of het
 * blad daarmee is vrijgegeven. Elke registratie legt de sha256 vast van de stand die
 * gecontroleerd is: de rekentekst, de invoer en de uitkomst (de UC, het oordeel en elk
 * getal van de uitwerking), en van die drie samen. Verandert er daarna iets, dan klopt de
 * hash niet meer en zegt het blad dat de vrijgave niet meer geldt, met wat er veranderd is.
 *
 * Vergrendelen gebeurt met de hash, niet door het blad dicht te zetten: een constructeur
 * mag na een vrijgave verder rekenen, maar dan staat er overal (tab Controle, kop op papier)
 * dat de vrijgave vervallen is, tot er een nieuwe controle is.
 *
 * Zonder React, zodat de controles het direct kunnen nagaan (scripts/check-controle.mjs).
 */

import type { ControleGegevens } from "@ifc-calc/core";

export type ControleUitkomst = "akkoord" | "opmerkingen" | "afgekeurd";
export const CONTROLE_UITKOMSTEN: readonly ControleUitkomst[] = ["akkoord", "opmerkingen", "afgekeurd"];

export interface BladHash {
  rekentekst: string;
  invoer: string;
  uitkomst: string;
  totaal: string;
}

export interface Registratie {
  id: string;
  controleur: string;
  /** JJJJ-MM-DD. */
  datum: string;
  uitkomst: ControleUitkomst;
  opmerkingen: string;
  /** Vrijgegeven: kan alleen bij akkoord of akkoord met opmerkingen. */
  vrijgegeven: boolean;
  /** Het moment van vastleggen (ISO 8601). */
  tijd: string;
  /** De rekenversie van de bladtekst (bladVersie.ts), ter informatie. */
  rekenversie?: string;
  hash: BladHash;
}

export interface Controle {
  registraties: Registratie[];
}

// ── sha256 ────────────────────────────────────────────────────────────────
// Synchroon en zonder afhankelijkheden: de hash moet in de worker, de afdruk en de
// controles hetzelfde zijn, en crypto.subtle is alleen asynchroon.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

/** De sha256 van een tekst (UTF-8), als 64 hexadecimale tekens. */
export function sha256(tekst: string): string {
  const data = new TextEncoder().encode(tekst);
  const lengte = data.length;
  const blokken = Math.ceil((lengte + 9) / 64);
  const buf = new Uint8Array(blokken * 64);
  buf.set(data);
  buf[lengte] = 0x80;
  const bits = lengte * 8;
  const dv = new DataView(buf.buffer);
  dv.setUint32(buf.length - 8, Math.floor(bits / 0x100000000));
  dv.setUint32(buf.length - 4, bits >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));
  for (let b = 0; b < blokken; b++) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(b * 64 + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, bb, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & bb) ^ (a & c) ^ (bb & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g; g = f; f = e; e = (d + t1) >>> 0;
      d = c; c = bb; bb = a; a = (t1 + t2) >>> 0;
    }
    h[0] = (h[0] + a) >>> 0; h[1] = (h[1] + bb) >>> 0; h[2] = (h[2] + c) >>> 0; h[3] = (h[3] + d) >>> 0;
    h[4] = (h[4] + e) >>> 0; h[5] = (h[5] + f) >>> 0; h[6] = (h[6] + g) >>> 0; h[7] = (h[7] + hh) >>> 0;
  }
  return [...h].map((x) => x.toString(16).padStart(8, "0")).join("");
}

// ── De vingerafdruk van een blad ──────────────────────────────────────────

/** Wat er van de uitkomst in de hash gaat: het oordeel en elk getal van de uitwerking. */
export interface UitkomstVoorHash {
  uc: number | null;
  voldoet: boolean | null;
  nietGetoetst?: boolean;
  getallen: Record<string, number>;
}

/** Een getal op 12 significante cijfers, zodat rekenruis van de laatste bit niet telt. */
const getal12 = (w: number) => (Number.isFinite(w) ? Number(w.toPrecision(12)) : String(w));

const gesorteerd = <T>(o: Record<string, T>, f: (w: T) => unknown = (w) => w) =>
  Object.fromEntries(Object.keys(o).sort().map((k) => [k, f(o[k])]));

/**
 * De hashes van een blad: de rekentekst (met regeleinden als \n), de invoer (op naam
 * gesorteerd), de uitkomst, en het geheel. Taalonafhankelijk: de rekentekst is de bron, en
 * de uitkomst bestaat uit getallen en het oordeel.
 */
export function bladHash(source: string, waarden: Record<string, string>, uitkomst: UitkomstVoorHash): BladHash {
  const rekentekst = sha256(source.replace(/\r\n/g, "\n"));
  const invoer = sha256(JSON.stringify(gesorteerd(waarden)));
  const uit = sha256(JSON.stringify({
    uc: uitkomst.uc === null ? null : getal12(uitkomst.uc),
    voldoet: uitkomst.voldoet,
    nietGetoetst: !!uitkomst.nietGetoetst,
    getallen: gesorteerd(uitkomst.getallen, getal12),
  }));
  return { rekentekst, invoer, uitkomst: uit, totaal: sha256(`${rekentekst}\n${invoer}\n${uit}`) };
}

// ── Lezen en de stand ─────────────────────────────────────────────────────

const isHash = (x: unknown): x is string => typeof x === "string" && /^[0-9a-f]{64}$/.test(x);

/** Een registratie uit een bestand, nagelezen; wat niet klopt valt weg. */
function leesRegistratie(x: unknown): Registratie | null {
  if (!x || typeof x !== "object") return null;
  const r = x as Record<string, unknown>;
  const h = r.hash as Record<string, unknown> | undefined;
  if (!h || !isHash(h.rekentekst) || !isHash(h.invoer) || !isHash(h.uitkomst) || !isHash(h.totaal)) return null;
  const uitkomst = CONTROLE_UITKOMSTEN.includes(r.uitkomst as ControleUitkomst) ? (r.uitkomst as ControleUitkomst) : null;
  if (!uitkomst || typeof r.controleur !== "string" || typeof r.datum !== "string") return null;
  return {
    id: typeof r.id === "string" && r.id ? r.id : `c-${r.tijd ?? r.datum}`,
    controleur: r.controleur,
    datum: r.datum,
    uitkomst,
    opmerkingen: typeof r.opmerkingen === "string" ? r.opmerkingen : "",
    // Een afgekeurd blad is nooit vrijgegeven, ook niet als het bestand dat zegt.
    vrijgegeven: r.vrijgegeven === true && uitkomst !== "afgekeurd",
    tijd: typeof r.tijd === "string" ? r.tijd : "",
    ...(typeof r.rekenversie === "string" ? { rekenversie: r.rekenversie } : {}),
    hash: { rekentekst: h.rekentekst, invoer: h.invoer, uitkomst: h.uitkomst, totaal: h.totaal },
  };
}

/** De controle van een blad uit een bestand of de bewaarde staat; zonder registraties: undefined. */
export function leesControle(x: unknown): Controle | undefined {
  const lijst = (x as { registraties?: unknown } | undefined)?.registraties;
  if (!Array.isArray(lijst)) return undefined;
  const registraties = lijst.map(leesRegistratie).filter((r): r is Registratie => r !== null);
  return registraties.length ? { registraties } : undefined;
}

/** Voor het bestand (core: ControleGegevens). */
export function controleVoorBestand(c: Controle): ControleGegevens {
  return { registraties: c.registraties.map((r) => ({ ...r })) };
}

export type ControleStand =
  | { soort: "geen" }
  /** De laatste registratie is een vrijgave en de stand is dezelfde. */
  | { soort: "vrijgegeven"; laatste: Registratie }
  /** De laatste registratie is een vrijgave, maar het blad is daarna veranderd. */
  | { soort: "vervallen"; laatste: Registratie; gewijzigd: (keyof Omit<BladHash, "totaal">)[] }
  /** Gecontroleerd zonder vrijgave (opmerkingen of afgekeurd); `gewijzigd` als het blad daarna veranderde. */
  | { soort: "gecontroleerd"; laatste: Registratie; gewijzigd: (keyof Omit<BladHash, "totaal">)[] };

/** De stand van de controle: de laatste registratie tegen de hash van nu. */
export function controleStand(c: Controle | undefined, nu: BladHash | null): ControleStand {
  const laatste = c?.registraties[c.registraties.length - 1];
  if (!laatste) return { soort: "geen" };
  const gewijzigd = nu
    ? (["rekentekst", "invoer", "uitkomst"] as const).filter((d) => laatste.hash[d] !== nu[d])
    : [];
  if (laatste.vrijgegeven) {
    return gewijzigd.length === 0 && nu?.totaal === laatste.hash.totaal
      ? { soort: "vrijgegeven", laatste }
      : { soort: "vervallen", laatste, gewijzigd: [...gewijzigd] };
  }
  return { soort: "gecontroleerd", laatste, gewijzigd: [...gewijzigd] };
}

/** Een nieuwe registratie; een afgekeurd blad wordt nooit vrijgegeven. */
export function nieuweRegistratie(
  velden: { controleur: string; datum: string; uitkomst: ControleUitkomst; opmerkingen: string; vrijgeven: boolean },
  hash: BladHash,
  rekenversie: string | undefined,
  nu: Date = new Date(),
): Registratie {
  return {
    id: `c-${nu.getTime().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    controleur: velden.controleur.trim(),
    datum: velden.datum,
    uitkomst: velden.uitkomst,
    opmerkingen: velden.opmerkingen.trim(),
    vrijgegeven: velden.vrijgeven && velden.uitkomst !== "afgekeurd",
    tijd: nu.toISOString(),
    ...(rekenversie ? { rekenversie } : {}),
    hash,
  };
}

// ── Exporteren ────────────────────────────────────────────────────────────

export interface ExportBlad {
  id: string;
  ref?: string;
  naam: string;
  controle?: Controle;
  /** De hash van nu, om te zeggen of een vrijgave nog geldt; null als het blad niet rekent. */
  nu: BladHash | null;
}

/** Eén regel per registratie, met de stand van nu bij de laatste. */
export function controleRegels(bladen: readonly ExportBlad[]) {
  const uit: Record<string, string>[] = [];
  for (const b of bladen) {
    const regs = b.controle?.registraties ?? [];
    const stand = controleStand(b.controle, b.nu);
    regs.forEach((r, i) => {
      const laatste = i === regs.length - 1;
      uit.push({
        blad: b.ref ? `#${b.ref}` : "",
        naam: b.naam,
        controleur: r.controleur,
        datum: r.datum,
        uitkomst: r.uitkomst,
        vrijgegeven: String(r.vrijgegeven),
        geldig: !laatste ? "" : stand.soort === "vrijgegeven" ? "true" : stand.soort === "vervallen" ? "false" : "",
        opmerkingen: r.opmerkingen,
        tijd: r.tijd,
        rekenversie: r.rekenversie ?? "",
        hash: r.hash.totaal,
      });
    });
  }
  return uit;
}

const KOLOMMEN = ["blad", "naam", "controleur", "datum", "uitkomst", "vrijgegeven", "geldig", "opmerkingen", "tijd", "rekenversie", "hash"];

/** De registraties als CSV (puntkomma, UTF-8 met BOM, zodat een spreadsheet de tekens goed leest). */
export function controleCsv(bladen: readonly ExportBlad[]): string {
  const veld = (s: string) => (/[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const regels = controleRegels(bladen).map((r) => KOLOMMEN.map((k) => veld(r[k] ?? "")).join(";"));
  return "﻿" + [KOLOMMEN.join(";"), ...regels].join("\r\n") + "\r\n";
}

/** De registraties als JSON: per blad de lijst en de stand van nu. */
export function controleJson(bladen: readonly ExportBlad[], project: string): string {
  return JSON.stringify({
    project,
    gemaakt: new Date().toISOString(),
    bladen: bladen.filter((b) => b.controle?.registraties.length).map((b) => ({
      id: b.id,
      ...(b.ref ? { ref: b.ref } : {}),
      naam: b.naam,
      stand: controleStand(b.controle, b.nu).soort,
      hashNu: b.nu?.totaal ?? null,
      registraties: b.controle!.registraties,
    })),
  }, null, 2);
}
