/**
 * `#include` van een `.cpd`-bestand op schijf.
 *
 * Een rekenblad kan met `#include lib/constants.cpd` een ander rekentaalbestand
 * invoegen. Een relatief pad geldt vanaf de map van het projectbestand, in een
 * ingevoegd bestand vanaf de map van dat bestand; een absoluut pad geldt zoals
 * het er staat (core: include.ts, `includeSleutel`). De ingebouwde bestanden van
 * de app (templates/rekentaal-includes.ts) gaan voor: die worden niet op schijf
 * gezocht.
 *
 * Bij opslaan blijft de `#include` een verwijzing: het bestand op schijf is de
 * bron. Het blad bewaart wel van elk ingevoegd bestand een kopie van de laatst
 * gelezen tekst, net als een gekoppeld bestand (store/koppeling.ts). Zo opent en
 * rekent het project ook zonder het bestand, in de browser of op een andere
 * computer; het blad zegt dan, ook op papier, dat de kopie gebruikt is en van
 * wanneer die is.
 *
 * Lezen gebeurt in de app (components/calc/includeBestanden.ts), met dezelfde
 * wachter als de gekoppelde bestanden: bij openen, bij focus, vóór afdrukken en
 * elke paar seconden.
 *
 * Puur en zonder imports van waarde buiten de kern: de controlescripts laden dit
 * bestand in Node.
 */

import { includeNamen, includeSleutel, isAbsoluutPad, type IncludeStaat } from "@ifc-calc/core";
import { inhoudHash, losOp, mapVan } from "./koppeling.ts";

/** Een ingevoegd bestand met de kopie van de laatste lezing. */
export interface IncludeKopie {
  /** De sleutel zoals de kern hem maakt: relatief tot het projectbestand (met `/`), of absoluut. */
  sleutel: string;
  /** Waar het bestand laatst gelezen is (absoluut); leeg als het nooit van schijf kwam. */
  pad: string;
  /** De tekst van die lezing. */
  tekst: string;
  /** Wanneer (ISO 8601). */
  gelezenOp: string;
  /** Hash van de bytes (koppeling.ts, inhoudHash). */
  hash: string;
}

/** De kopieën uit een bestand of de opgeslagen staat; iets onbruikbaars valt weg. */
export function leesIncludeKopieen(x: unknown): IncludeKopie[] | undefined {
  if (!Array.isArray(x)) return undefined;
  const uit: IncludeKopie[] = [];
  for (const k of x) {
    if (!k || typeof k !== "object") continue;
    const r = k as Partial<Record<keyof IncludeKopie, unknown>>;
    if (typeof r.sleutel !== "string" || r.sleutel === "" || typeof r.tekst !== "string") continue;
    if (uit.some((u) => u.sleutel === r.sleutel)) continue;
    uit.push({
      sleutel: r.sleutel,
      pad: typeof r.pad === "string" ? r.pad : "",
      tekst: r.tekst,
      gelezenOp: typeof r.gelezenOp === "string" ? r.gelezenOp : "",
      hash: typeof r.hash === "string" ? r.hash : "",
    });
  }
  return uit.length > 0 ? uit : undefined;
}

/** Heeft deze bladtekst een `#include`? Snel, zonder inlezen. */
export function heeftInclude(bron: string): boolean {
  return /^[ \t]*#include\s/m.test(bron);
}

/** Waar het bestand van een sleutel op schijf staat; null als er nog geen projectbestand is. */
export function padOpSchijf(sleutel: string, projectPad: string | null | undefined): string | null {
  if (isAbsoluutPad(sleutel)) return sleutel;
  if (!projectPad || !/[\\/]/.test(projectPad)) return null;
  return losOp(mapVan(projectPad), sleutel);
}

/** Wat de app van het bestandssysteem nodig heeft: de bytes, of null als het bestand er niet is. */
export interface IncludeToegang {
  lees(pad: string): Promise<Uint8Array | null>;
}

export interface GelezenIncludes {
  /** De kopieën die het blad nu nodig heeft, in de volgorde waarin ze voorkomen. */
  kopieen: IncludeKopie[];
  /** Per sleutel waarom het bestand er niet (vers) is; een vers gelezen bestand staat er niet in. */
  staat: Record<string, IncludeStaat>;
}

/**
 * Leest de bestanden die een bladtekst met `#include` invoegt, ook genest. Elk bestand
 * één keer; een kring stopt hier vanzelf, de kern meldt hem. Zonder toegang (de
 * browser) of zonder projectbestand bij een relatief pad geldt de vorige kopie, als
 * die er is. Gelijke bytes houden de vorige kopie, ook zijn datum.
 */
export async function leesIncludes(
  bron: string,
  opties: {
    /** De ingebouwde bestanden: die gaan voor en worden niet gelezen. */
    basis: ReadonlyMap<string, string>;
    vorige?: readonly IncludeKopie[];
    projectPad?: string | null;
    /** null: geen bestandstoegang (de browser). */
    toegang: IncludeToegang | null;
    nu?: () => Date;
  },
): Promise<GelezenIncludes> {
  const vorige = new Map((opties.vorige ?? []).map((k) => [k.sleutel, k]));
  const kopieen: IncludeKopie[] = [];
  const staat: Record<string, IncludeStaat> = {};
  const gezien = new Set<string>();
  const nu = opties.nu ?? (() => new Date());

  const bezoek = async (tekst: string, vanaf?: string): Promise<void> => {
    for (const naam of includeNamen(tekst)) {
      const sleutel = includeSleutel(naam, vanaf);
      // Een ingebouwd bestand (ook genest, op zijn eigen naam): niet op schijf.
      if (opties.basis.has(sleutel) || (vanaf && opties.basis.has(naam))) continue;
      if (gezien.has(sleutel)) continue;
      gezien.add(sleutel);
      const oud = vorige.get(sleutel);
      const metKopie = (reden: "ontbreekt" | "geenToegang" | "nietOpgeslagen", gezocht?: string): IncludeKopie | null => {
        if (oud) {
          staat[sleutel] = { soort: "kopie", reden, gelezenOp: oud.gelezenOp, ...(gezocht ? { gezocht } : {}) };
          return oud;
        }
        staat[sleutel] = { soort: reden, ...(gezocht ? { gezocht } : {}) };
        return null;
      };
      let gekozen: IncludeKopie | null;
      const pad = padOpSchijf(sleutel, opties.projectPad);
      if (!opties.toegang) gekozen = metKopie("geenToegang");
      else if (pad === null) gekozen = metKopie("nietOpgeslagen");
      else {
        let bytes: Uint8Array | null = null;
        try {
          bytes = await opties.toegang.lees(pad);
        } catch {
          bytes = null;
        }
        if (bytes === null) gekozen = metKopie("ontbreekt", pad);
        else {
          const hash = inhoudHash(bytes);
          gekozen = oud && oud.hash === hash && oud.pad === pad
            ? oud
            : { sleutel, pad, tekst: new TextDecoder("utf-8").decode(bytes).replace(/^﻿/, "").replace(/\r\n?/g, "\n"), gelezenOp: nu().toISOString(), hash };
        }
      }
      if (!gekozen) continue;
      kopieen.push(gekozen);
      await bezoek(gekozen.tekst, sleutel);
    }
  };
  await bezoek(bron);
  return { kopieen, staat };
}

/** Zijn twee lijsten kopieën gelijk (zelfde sleutels, paden, hashes en datums)? */
export function zelfdeKopieen(a: readonly IncludeKopie[] | undefined, b: readonly IncludeKopie[] | undefined): boolean {
  const x = a ?? [];
  const y = b ?? [];
  return x.length === y.length && x.every((k, i) => k.sleutel === y[i].sleutel && k.hash === y[i].hash && k.pad === y[i].pad && k.gelezenOp === y[i].gelezenOp);
}

/**
 * De tabel voor de kern: de ingebouwde bestanden en de kopieën van alle bladen. Een
 * relatieve sleutel geldt voor het hele project (vanaf het projectbestand), dus elk blad
 * vindt ook een bestand dat een ander blad las; de jongste lezing telt.
 */
export function includeTabel(basis: ReadonlyMap<string, string>, bladen: readonly { includes?: readonly IncludeKopie[] }[]): Map<string, string> {
  const jongste = new Map<string, IncludeKopie>();
  for (const b of bladen) {
    for (const k of b.includes ?? []) {
      if (basis.has(k.sleutel)) continue;
      const was = jongste.get(k.sleutel);
      if (!was || k.gelezenOp > was.gelezenOp) jongste.set(k.sleutel, k);
    }
  }
  const tabel = new Map(basis);
  for (const [s, k] of jongste) tabel.set(s, k.tekst);
  return tabel;
}
