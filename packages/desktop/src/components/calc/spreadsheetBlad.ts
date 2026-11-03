import { useEffect, useSyncExternalStore } from "react";
import i18next from "../../i18n/config";
import { base64Bytes, grootteTekst, PDF_GROOT_BYTES } from "../../store/pdfBijlage";
import {
  bladnaamVoorWerkmap, LEGE_WERKMAP, lijktOpWerkmap, type SpreadsheetBestand,
} from "../../store/spreadsheetBlad";
import { base64NaarBytes, bytesNaarBase64 } from "./pdfBlad";

/*
 * Spreadsheet-bladen in de app: een werkmap kiezen en wegschrijven, en de
 * werkbladen tekenen voor het afdrukvoorbeeld en de afdruk.
 *
 * Wat een spreadsheet-blad ís en hoe het in het projectbestand staat, staat in
 * store/spreadsheetBlad.ts. De editor staat in SpreadsheetEditor.tsx.
 *
 * Tekenen
 * -------
 * De rekenkern tekent de cellen zelf naar PNG, met opmaak en rasterlijnen zoals
 * op het scherm. Een werkblad dat niet op één vel past, gaat in stukken langs de
 * rijgrenzen; te breed wordt kleiner, tot de breedte van de bladspiegel. De
 * kern en zijn WASM worden pas geladen bij de eerste afdruk.
 */

/** Tekenschaal: 2 is 192 dpi op ware grootte, scherp genoeg voor tekst op papier. */
const TEKENSCHAAL = 2;
const MM_PER_PX = 25.4 / 96;
/** Ruimte boven het eerste vel voor de kop van het blad, als bij een PDF-blad. */
const KOP_RUIMTE = 20;
/** Ruimte voor de naam van het werkblad boven de cellen. */
const NAAM_RUIMTE = 7;
/** Meer vellen dan dit komen niet op papier; een melding zegt dat het er meer zijn. */
const MAX_VELLEN = 60;
/** Zoveel getekende werkmappen blijven bewaard als niets ze meer toont. */
const BEWAARD = 6;

/** Eén stuk werkblad op papier, in millimeter. */
export interface WerkmapVel {
  /** De naam van het werkblad; leeg als de werkmap er maar één heeft. */
  blad: string;
  url: string;
  breedte: number;
  hoogte: number;
  /** Vervolg van hetzelfde werkblad: begint op een eigen vel. */
  vervolg: boolean;
}

export interface WerkmapStand {
  status: "laden" | "klaar" | "fout";
  vellen: WerkmapVel[];
  /** De werkmap past niet op MAX_VELLEN vellen. */
  afgekapt?: boolean;
  fout?: string;
}

interface Ingang {
  stand: WerkmapStand;
  gebruik: number;
}

const LADEN: WerkmapStand = { status: "laden", vellen: [] };
const cache = new Map<string, Ingang>();
const luisteraars = new Set<() => void>();
/** Telt elke melding; het afdrukvoorbeeld verdeelt opnieuw als hij verandert. */
let versie = 0;

function meld() {
  versie += 1;
  for (const l of luisteraars) l();
}

function abonneer(l: () => void) {
  luisteraars.add(l);
  return () => {
    luisteraars.delete(l);
  };
}

function ruimOp() {
  for (const [sleutel, ingang] of cache) {
    if (cache.size <= BEWAARD) return;
    if (ingang.gebruik > 0 || ingang.stand.status === "laden") continue;
    for (const v of ingang.stand.vellen) URL.revokeObjectURL(v.url);
    cache.delete(sleutel);
  }
}

function pngMaat(png: Uint8Array): { breedte: number; hoogte: number } {
  const v = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { breedte: v.getUint32(16), hoogte: v.getUint32(20) };
}

function pngUrl(png: Uint8Array): string {
  return URL.createObjectURL(new Blob([png as Uint8Array<ArrayBuffer>], { type: "image/png" }));
}

/** "B2:F40" naar zijn kolommen en rijen. Geen geldig bereik: null. */
function leesBereik(bereik: string): { van: string; tot: string; eerste: number; laatste: number } | null {
  const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(bereik);
  if (!m) return null;
  return { van: m[1], tot: m[3] ?? m[1], eerste: Number(m[2]), laatste: Number(m[4] ?? m[2]) };
}

async function tekenVellen(data: string, breedte: number, hoogte: number): Promise<WerkmapStand> {
  const { initWasm, openWorkbook } = await import("@betteroffice/xlsx");
  await initWasm();
  const wb = openWorkbook(base64NaarBytes(data));
  try {
    const inhoud = wb.exportStructured({ includeDefinedNames: false, maxCells: 1_000_000, maxBytes: 16 * 1024 * 1024 });
    if (!inhoud.ok) throw new Error(inhoud.failure.message);
    const bladen = inhoud.content.sheets.filter((b) => b.kind === "worksheet" && b.usedRange);
    const vellen: WerkmapVel[] = [];
    let afgekapt = false;

    for (const blad of bladen) {
      const bereik = leesBereik(blad.usedRange ?? "");
      if (!bereik || blad.anchor.kind !== "sheet") continue;
      wb.setActiveSheet(blad.anchor.sheet.index);
      const naam = bladen.length > 1 ? blad.anchor.sheet.name : "";
      const ruimte = (eerste: boolean) => hoogte - (vellen.length === 0 && eerste ? KOP_RUIMTE : 0) - (naam ? NAAM_RUIMTE : 0);
      const stuk = (van: number, tot: number) =>
        wb.renderRangePng({ range: `${bereik.van}${van}:${bereik.tot}${tot}`, scale: TEKENSCHAAL });

      const heel = stuk(bereik.eerste, bereik.laatste);
      const maat = pngMaat(heel);
      const opWareGrootte = (maat.breedte / TEKENSCHAAL) * MM_PER_PX;
      const schaal = Math.min(1, breedte / opWareGrootte);
      const mm = (px: number) => (px / TEKENSCHAAL) * MM_PER_PX * schaal;
      const voeg = (png: Uint8Array, vervolg: boolean) => {
        const m = pngMaat(png);
        vellen.push({ blad: vervolg ? "" : naam, url: pngUrl(png), breedte: mm(m.breedte), hoogte: mm(m.hoogte), vervolg });
      };

      if (mm(maat.hoogte) <= ruimte(true)) {
        voeg(heel, false);
        continue;
      }

      // Te hoog: in stukken langs de rijgrenzen, met de gemiddelde rijhoogte als schatting.
      const rijen = bereik.laatste - bereik.eerste + 1;
      const perRij = mm(maat.hoogte) / rijen;
      let rij = bereik.eerste;
      let eerste = true;
      while (rij <= bereik.laatste) {
        if (vellen.length >= MAX_VELLEN) {
          afgekapt = true;
          break;
        }
        const beschikbaar = ruimte(eerste);
        let aantal = Math.min(Math.max(1, Math.floor(beschikbaar / perRij)), bereik.laatste - rij + 1);
        let png = stuk(rij, rij + aantal - 1);
        while (aantal > 1 && mm(pngMaat(png).hoogte) > beschikbaar) {
          aantal -= 1;
          png = stuk(rij, rij + aantal - 1);
        }
        voeg(png, !eerste);
        rij += aantal;
        eerste = false;
        // Tussendoor ademhalen: de kern tekent op de hoofdthread.
        await new Promise((ok) => setTimeout(ok));
      }
      if (afgekapt) break;
    }
    return { status: "klaar", vellen, afgekapt };
  } finally {
    wb.dispose();
  }
}

function gebruik(sleutel: string, data: string, breedte: number, hoogte: number): Ingang {
  let ingang = cache.get(sleutel);
  if (!ingang) {
    const nieuw: Ingang = { stand: LADEN, gebruik: 0 };
    ingang = nieuw;
    cache.set(sleutel, nieuw);
    tekenVellen(data, breedte, hoogte)
      .catch((err): WerkmapStand => {
        console.error("Werkmap tekenen mislukt:", err);
        return { status: "fout", vellen: [], fout: (err as Error)?.message ?? String(err) };
      })
      .then((stand) => {
        nieuw.stand = stand;
        meld();
      });
  } else {
    // Achteraan zetten: de volgorde van de Map is die van het laatste gebruik.
    cache.delete(sleutel);
    cache.set(sleutel, ingang);
  }
  ingang.gebruik += 1;
  ruimOp();
  return ingang;
}

/** De werkbladen op papier, getekend of nog onderweg. Zonder werkmap: null. */
export function useWerkmapVellen(data: string | undefined, breedte: number, hoogte: number): WerkmapStand | null {
  const sleutel = data ? `${breedte}|${hoogte}|${data}` : null;
  const stand = useSyncExternalStore(abonneer, () => (sleutel ? (cache.get(sleutel)?.stand ?? LADEN) : null));
  useEffect(() => {
    if (!sleutel || !data) return;
    const ingang = gebruik(sleutel, data, breedte, hoogte);
    return () => {
      ingang.gebruik -= 1;
    };
  }, [sleutel, data, breedte, hoogte]);
  return stand;
}

/** Verandert bij elke getekende werkmap; voor het opnieuw verdelen van het afdrukvoorbeeld. */
export function useWerkmapVersie(): number {
  return useSyncExternalStore(abonneer, () => versie);
}

// ── Kiezen en wegschrijven ────────────────────────────────────────────────────

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function kiesBestand(): Promise<{ bestandsnaam: string; bytes: Uint8Array } | null> {
  const t = i18next.getFixedT(null, "werkruimte");
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const pad = await open({
      title: t("spreadsheet.kiesTitel"),
      multiple: false,
      directory: false,
      filters: [{ name: t("spreadsheet.filter"), extensions: ["xlsx"] }],
    });
    if (!pad || typeof pad !== "string") return null;
    return { bestandsnaam: pad.split(/[\\/]/).pop() ?? pad, bytes: await readFile(pad) };
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      f.arrayBuffer()
        .then((buf) => resolve({ bestandsnaam: f.name, bytes: new Uint8Array(buf) }))
        .catch(reject);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * Kiest een XLSX-bestand, met de controles: lijkt het op een werkmap, en is het
 * niet zo groot dat het projectbestand onhandelbaar wordt. Null bij annuleren
 * of afwijzen; een leesfout gaat door naar de aanroeper.
 */
export async function kiesWerkmap(): Promise<SpreadsheetBestand | null> {
  const t = i18next.getFixedT(null, "werkruimte");
  const gekozen = await kiesBestand();
  if (!gekozen) return null;
  const naam = gekozen.bestandsnaam;
  if (!lijktOpWerkmap(gekozen.bytes)) {
    alert(t("spreadsheet.geenWerkmap", { naam }));
    return null;
  }
  if (gekozen.bytes.length > PDF_GROOT_BYTES) {
    const grootte = grootteTekst(gekozen.bytes.length, i18next.language);
    if (!confirm(t("spreadsheet.groot", { naam, grootte }))) return null;
  }
  return { bestandsnaam: naam, data: await bytesNaarBase64(gekozen.bytes) };
}

/** Een nieuw blad met een lege werkmap, achteraan het project. */
export function voegLeegSpreadsheetToe(voegToe: (naam: string, xlsx: SpreadsheetBestand) => string): string {
  return voegToe(i18next.t("werkruimte:spreadsheet.nieuweNaam"), { bestandsnaam: "", data: LEGE_WERKMAP });
}

/** Kiest een XLSX-bestand en zet het als nieuw blad achteraan het project. */
export async function voegWerkmapToe(voegToe: (naam: string, xlsx: SpreadsheetBestand) => string): Promise<void> {
  try {
    const xlsx = await kiesWerkmap();
    if (xlsx) voegToe(bladnaamVoorWerkmap(xlsx.bestandsnaam), xlsx);
  } catch (err) {
    console.error("Werkmap toevoegen mislukt:", err);
    alert(i18next.t("werkruimte:spreadsheet.lezenMislukt", { fout: (err as Error)?.message ?? String(err) }));
  }
}

/** Schrijft de werkmap weg als los XLSX-bestand, om elders verder te bewerken. */
export async function exporteerWerkmap(naam: string, xlsx: SpreadsheetBestand): Promise<void> {
  const bestand = `${naam.replace(/[\\/:*?"<>|]+/g, "-").trim() || "Spreadsheet"}.xlsx`;
  const bytes = base64NaarBytes(xlsx.data);
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const pad = await save({
      defaultPath: bestand,
      filters: [{ name: i18next.t("werkruimte:spreadsheet.filter"), extensions: ["xlsx"] }],
    });
    if (pad) await writeFile(pad, bytes);
    return;
  }
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }));
  const a = document.createElement("a");
  a.href = url;
  a.download = bestand;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** De grootte van een werkmap, voor in de kop van het paneel. */
export function werkmapGrootte(xlsx: SpreadsheetBestand): string {
  return grootteTekst(base64Bytes(xlsx.data), i18next.language);
}
