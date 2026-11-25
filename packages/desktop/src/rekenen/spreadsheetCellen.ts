/**
 * Celwaarden uit de werkmap van een spreadsheet-blad, voor een invoerveld dat aan een cel
 * gekoppeld is (`#3.Blad1!B4 kN`, core/src/verwijzing.ts).
 *
 * De werkmap staat als XLSX in het blad (store/spreadsheetBlad.ts). Hier wordt hij direct
 * gelezen: uitpakken en de XML van het werkblad doorzoeken, zonder de rekenkern van de
 * spreadsheet. Zo werkt het ook in een worker en in de controlescripts, en is het
 * synchroon. Van een formule telt de uitkomst zoals de editor hem bij het bewaren in het
 * bestand zette (`<v>`); de editor schrijft die bij elke wijziging mee.
 *
 * Alleen een getal is een waarde. Een lege cel, tekst, een ja/nee-waarde, een
 * formulefout (`#DIV/0!`) of een formule zonder uitkomst geeft een fout met een code
 * (CelFout); de rekenkern maakt daar de melding van.
 *
 * Puur en zonder React: verwijzingen.ts, de rekenworkers en scripts/check-spreadsheet-invoer.mjs
 * laden dit.
 */
import { strFromU8, unzipSync } from "fflate";
import { celNaam, type CelVerwijzing, type CelWaarde } from "@ifc-calc/core";

interface Werkmap {
  /** De werkbladen in volgorde, met het pad van hun XML in het pakket. */
  bladen: { naam: string; pad: string }[];
  /** De inhoud van elk uitgepakt deel, op pad. */
  delen: Record<string, Uint8Array>;
  /** De werkbladen die al als tekst gelezen zijn. */
  xml: Map<string, string>;
  gedeeld: string[] | null;
}

/** De laatst gelezen werkmappen, op hun inhoud: bij elke doorrekening opnieuw uitpakken is zonde. */
const gelezen = new Map<string, Werkmap | null>();
const BEWAARD = 8;

const ENTITEITEN: Readonly<Record<string, string>> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function ontcijfer(tekst: string): string {
  return tekst.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-z]+);/g, (heel, naam: string) => {
    if (naam[0] !== "#") return ENTITEITEN[naam] ?? heel;
    const code = naam[1] === "x" ? parseInt(naam.slice(2), 16) : parseInt(naam.slice(1), 10);
    try {
      return String.fromCodePoint(code);
    } catch {
      return heel;
    }
  });
}

function kenmerk(tag: string, naam: string): string | undefined {
  const m = tag.match(new RegExp(`\\s${naam}="([^"]*)"`));
  return m ? ontcijfer(m[1]) : undefined;
}

function base64NaarBytes(data: string): Uint8Array {
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function pakUit(data: string): Werkmap | null {
  try {
    const delen = unzipSync(base64NaarBytes(data), {
      filter: (f) => f.name.startsWith("xl/") && (f.name.endsWith(".xml") || f.name.endsWith(".rels")),
    });
    const boek = delen["xl/workbook.xml"];
    if (!boek) return null;
    const relaties = new Map<string, string>();
    const rels = delen["xl/_rels/workbook.xml.rels"];
    if (rels) {
      for (const tag of strFromU8(rels).match(/<Relationship\b[^>]*>/g) ?? []) {
        const id = kenmerk(tag, "Id");
        const doel = kenmerk(tag, "Target");
        if (id && doel) relaties.set(id, doel.startsWith("/") ? doel.slice(1) : `xl/${doel.replace(/^\.\//, "")}`);
      }
    }
    const bladen: Werkmap["bladen"] = [];
    for (const tag of strFromU8(boek).match(/<sheet\b[^>]*>/g) ?? []) {
      const naam = kenmerk(tag, "name");
      const id = kenmerk(tag, "r:id");
      const pad = id ? relaties.get(id) : undefined;
      if (naam !== undefined && pad) bladen.push({ naam, pad });
    }
    return { bladen, delen, xml: new Map(), gedeeld: null };
  } catch {
    return null;
  }
}

function werkmap(data: string): Werkmap | null {
  if (gelezen.has(data)) return gelezen.get(data)!;
  const wm = pakUit(data);
  gelezen.set(data, wm);
  while (gelezen.size > BEWAARD) gelezen.delete(gelezen.keys().next().value!);
  return wm;
}

/** De namen van de werkbladen, in volgorde; null als de werkmap niet te lezen is. */
export function werkbladNamen(data: string | undefined): string[] | null {
  const wm = data ? werkmap(data) : null;
  return wm ? wm.bladen.map((b) => b.naam) : null;
}

function gedeeldeTekst(wm: Werkmap, i: number): string {
  if (!wm.gedeeld) {
    const deel = wm.delen["xl/sharedStrings.xml"];
    wm.gedeeld = deel
      ? (strFromU8(deel).match(/<si\b[\s\S]*?<\/si>/g) ?? []).map((si) =>
        ontcijfer((si.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join("")))
      : [];
  }
  return wm.gedeeld[i] ?? "";
}

/** Een celadres als `B4`: kolomletters en rijnummer, zonder `$`. */
const ADRES_RE = /^[A-Z]{1,3}[1-9][0-9]{0,6}$/;

/**
 * De waarde van één cel. `data`: de werkmap van het blad (base64), `blad`: de naam van het
 * werkblad, `cel`: het adres (`B4`).
 */
export function leesCel(data: string | undefined, blad: string, cel: string): CelWaarde {
  const wm = data ? werkmap(data) : null;
  if (!wm) return { fout: "werkmap" };
  const werkblad = wm.bladen.find((b) => b.naam === blad);
  if (!werkblad) return { fout: "werkblad" };
  const adres = cel.replace(/\$/g, "").toUpperCase();
  if (!ADRES_RE.test(adres)) return { fout: "leeg" };
  let xml = wm.xml.get(werkblad.pad);
  if (xml === undefined) {
    const deel = wm.delen[werkblad.pad];
    xml = deel ? strFromU8(deel) : "";
    wm.xml.set(werkblad.pad, xml);
  }
  const m = xml.match(new RegExp(`<c\\s(?=[^>]*\\br="${adres}")([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`));
  if (!m) return { fout: "leeg" };
  const kop = ` ${m[1]}`;
  const inhoud = m[2] ?? "";
  const soort = kenmerk(kop, "t") ?? "n";
  const formule = /<f\b/.test(inhoud);
  const v = inhoud.match(/<v>([\s\S]*?)<\/v>/);
  const waarde = v ? ontcijfer(v[1]) : undefined;
  if (soort === "inlineStr") {
    const tekst = ontcijfer((inhoud.match(/<t\b[^>]*>([\s\S]*?)<\/t>/g) ?? []).map((t) => t.replace(/<[^>]+>/g, "")).join(""));
    return tekst === "" ? { fout: "leeg" } : { fout: "tekst", detail: tekst };
  }
  if (waarde === undefined || waarde === "") return formule ? { fout: "geen-waarde" } : { fout: "leeg" };
  if (soort === "e") return { fout: "formulefout", detail: waarde };
  if (soort === "s") {
    const tekst = gedeeldeTekst(wm, Number(waarde));
    return tekst === "" ? { fout: "leeg" } : { fout: "tekst", detail: tekst };
  }
  if (soort === "str") return waarde === "" ? { fout: "leeg" } : { fout: "tekst", detail: waarde };
  if (soort === "b") return { fout: "tekst", detail: waarde === "1" ? "TRUE" : "FALSE" };
  const getal = Number(waarde);
  return Number.isFinite(getal) ? getal : { fout: "tekst", detail: waarde };
}

/** Een blad waaruit cellen gelezen kunnen worden. */
export interface CelBron {
  templateId?: string;
  xlsx?: { data: string };
}

/**
 * De waarden van de gevraagde cellen, op hun naam in de scope (`celNaam`). Is het blad
 * geen spreadsheet-blad, dan krijgt elke cel die fout.
 */
export function celWaarden(bron: CelBron, spreadsheet: boolean, cellen: readonly CelVerwijzing[]): Record<string, CelWaarde> {
  const uit: Record<string, CelWaarde> = {};
  for (const c of cellen) {
    uit[celNaam(c.ref, c.blad, c.cel)] = spreadsheet ? leesCel(bron.xlsx?.data, c.blad, c.cel) : { fout: "geen-spreadsheet" };
  }
  return uit;
}
