/**
 * Waarden uit een ander blad: `#1.R_paal` in een formule of een invoerveld
 * neemt R_paal over uit het blad met kenmerk 1 (Exemplaar.ref).
 *
 * De kern rekent één blad tegelijk en kent `#1.R_paal` als de naam
 * `ref__1__R_paal` (core/src/verwijzing.ts). Hier worden de bladen waarnaar
 * verwezen wordt eerst doorgerekend, met hun eigen invoer en zo nodig hun eigen
 * verwijzingen, en komt elke gevraagde waarde onder die naam in de scope.
 *
 * Een kring (blad 1 vraagt iets van 2, en 2 van 1) rekent niet rond: het blad
 * dat opnieuw aan de beurt zou komen levert niets, en de verwijzing geeft dan de
 * melding dat de waarde niet gevonden is. Alleen de rekenbladen tellen; een
 * spreadsheet of tekenblad heeft geen waarden om over te nemen.
 *
 * Een invoerveld kan ook een cel uit een spreadsheet-blad nemen: `#3.Blad1!B4 kN`. Die
 * cellen worden hier gelezen (spreadsheetCellen.ts) en gaan met het blad mee als
 * `cellen`; zo horen ze ook in de sleutel van de doorrekening, en rekent een blad opnieuw
 * zodra de cel verandert.
 */
import {
  celVerwijzingenIn, evaluateMetScope, parse, verwijzingNaam, verwijzingenIn,
  type CelVerwijzing, type CelWaarde, type EvalOpties, type ParseOptions,
} from "@ifc-calc/core";
import { isSpreadsheetBlad } from "../store/spreadsheetBlad.ts";
import { celWaarden } from "./spreadsheetCellen.ts";

/** Een blad waarnaar verwezen wordt: wat nodig is om het door te rekenen. */
export interface VerwijsBlad {
  ref: string;
  source: string;
  waarden: Record<string, string>;
  /** De gekoppelde cellen uit dit blad, op hun naam in de scope (`celNaam`). */
  cellen?: Record<string, CelWaarde>;
}

interface MetRef {
  ref?: string;
  source: string;
  waarden: Record<string, string>;
  templateId?: string;
  xlsx?: { data: string };
}

/**
 * De bladen waarnaar dit blad verwijst, en waarnaar die op hun beurt verwijzen;
 * elk blad één keer. Een onbekend kenmerk slaat over. Een spreadsheet-blad waarvan een
 * cel in een invoerveld staat, komt erbij met de waarden van die cellen.
 */
export function verwezenBladen(source: string, waarden: Record<string, string>, alle: readonly MetRef[]): VerwijsBlad[] {
  const perRef = new Map<string, MetRef>();
  for (const e of alle) if (e.ref && !perRef.has(e.ref)) perRef.set(e.ref, e);
  const uit: VerwijsBlad[] = [];
  const gezien = new Set<string>();
  // De gekoppelde cellen per blad, uit dit blad en uit elk blad waarnaar het verwijst.
  const cellen = new Map<string, CelVerwijzing[]>();
  const noteerCellen = (w: Record<string, string>) => {
    for (const c of celVerwijzingenIn(w)) {
      const lijst = cellen.get(c.ref) ?? [];
      lijst.push(c);
      cellen.set(c.ref, lijst);
    }
  };
  noteerCellen(waarden);
  const open = verwijzingenIn(source, waarden).map((v) => v.ref);
  while (open.length) {
    const ref = open.shift()!;
    if (gezien.has(ref)) continue;
    gezien.add(ref);
    const blad = perRef.get(ref);
    if (!blad || !blad.source.trim()) continue;
    uit.push({ ref, source: blad.source, waarden: blad.waarden });
    noteerCellen(blad.waarden);
    for (const v of verwijzingenIn(blad.source, blad.waarden)) if (!gezien.has(v.ref)) open.push(v.ref);
  }
  // Een blad dat er niet (meer) is, krijgt niets: het invoerveld meldt dan dat de bron ontbreekt.
  for (const [ref, lijst] of cellen) {
    const blad = perRef.get(ref);
    if (!blad) continue;
    const gelezen = celWaarden(blad, isSpreadsheetBlad(blad), lijst);
    const al = uit.find((b) => b.ref === ref);
    if (al) al.cellen = { ...al.cellen, ...gelezen };
    else uit.push({ ref, source: "", waarden: {}, cellen: gelezen });
  }
  return uit;
}

/**
 * De scope van een blad aangevuld met de waarden waarnaar het verwijst. Zonder
 * verwijzingen komt dezelfde scope terug.
 */
export function scopeMetVerwijzingen(
  source: string,
  waarden: Record<string, string>,
  scope: Record<string, unknown>,
  bladen: readonly VerwijsBlad[],
  opties: ParseOptions,
  evalOpties: EvalOpties,
): Record<string, unknown> {
  // De gekoppelde cellen, voor dit blad en voor elk blad dat het eerst doorrekent.
  let metCellen = scope;
  for (const b of bladen) if (b.cellen) metCellen = { ...metCellen, ...b.cellen };
  const nodig = verwijzingenIn(source, waarden);
  if (nodig.length === 0) return metCellen;
  scope = metCellen;
  const perRef = new Map(bladen.map((b) => [b.ref, b]));
  const doorgerekend = new Map<string, Record<string, unknown> | null>();

  // Een blad dat via via weer bij zichzelf uitkomt: de hele keten levert niets,
  // zodat het blad dat erom vraagt een fout toont in plaats van een half getal.
  class Kring extends Error {}

  const reken = (ref: string, stapel: Set<string>): Record<string, unknown> | null => {
    if (doorgerekend.has(ref)) return doorgerekend.get(ref)!;
    if (stapel.has(ref)) throw new Kring();
    const blad = perRef.get(ref);
    if (!blad) return null;
    let uitkomst: Record<string, unknown> | null = null;
    try {
      const binnen = new Set(stapel).add(ref);
      const eigen = vul(verwijzingenIn(blad.source, blad.waarden), scope, binnen, true);
      uitkomst = evaluateMetScope(parse(blad.source, opties), blad.waarden, eigen, evalOpties).scope;
    } catch (err) {
      if (err instanceof Kring) throw err;
      uitkomst = null;
    }
    doorgerekend.set(ref, uitkomst);
    return uitkomst;
  };

  const vul = (lijst: { ref: string; naam: string }[], basis: Record<string, unknown>, stapel: Set<string>, doorgeven: boolean) => {
    const uit: Record<string, unknown> = { ...basis };
    for (const v of lijst) {
      let s: Record<string, unknown> | null = null;
      try {
        s = reken(v.ref, stapel);
      } catch (err) {
        if (doorgeven && err instanceof Kring) throw err;
      }
      const waarde = s?.[v.naam.replace(/,/g, "_")];
      if (waarde !== undefined) uit[verwijzingNaam(v.ref, v.naam)] = waarde;
    }
    return uit;
  };

  return vul(nodig, scope, new Set(), false);
}
