import { useEffect, useSyncExternalStore } from "react";
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from "pdfjs-dist";
import i18next from "../../i18n/config";
import {
  bladnaamVoor, grootteTekst, lijktOpPdf, PDF_GROOT_BYTES, type PdfBijlage,
} from "../../store/pdfBijlage";

/*
 * PDF-bladen in de app: een PDF kiezen en inlezen, en zijn pagina's tekenen
 * voor de werkruimte, het afdrukvoorbeeld en de afdruk.
 *
 * Wat een PDF-blad ís en hoe het in het projectbestand staat, staat in
 * store/pdfBijlage.ts. Hier alleen wat de browser nodig heeft.
 *
 * Tekenen
 * -------
 * pdf.js tekent elke pagina één keer op een canvas; dat wordt een PNG achter
 * een object-URL. Werkruimte, afdrukvoorbeeld en afdruk tonen alle drie die
 * afbeeldingen, zodat een PDF in een sessie maar één keer wordt getekend. De
 * sleutel is de base64-tekst zelf: twee bladen met hetzelfde bestand (een
 * duplicaat) delen hun pagina's, en een vervangen bestand wordt vanzelf
 * opnieuw getekend.
 *
 * De maten van de pagina's zijn er al voordat de afbeeldingen klaar zijn, zodat
 * de afdruk de vellen meteen goed kan verdelen. Een pagina die nog getekend
 * wordt, draagt in de afdruk `data-afdruk-laadt`; het printen wacht daarop
 * (components/rapport/afdruk/drukvellen.ts).
 *
 * pdf.js zelf wordt pas geladen bij het eerste PDF-blad, niet bij het starten.
 */

/** Eén pagina: de maten in punten (1/72 inch, na rotatie) en de getekende afbeelding. */
export interface PdfPagina {
  breedte: number;
  hoogte: number;
  /** Object-URL van de PNG; null zolang de pagina nog getekend wordt. */
  url: string | null;
  /** Het tekenen van deze pagina is mislukt; de rest van de PDF staat er wel. */
  mislukt?: boolean;
}

export interface PdfStand {
  status: "laden" | "klaar" | "fout";
  /** Leeg zolang het bestand nog wordt gelezen. */
  paginas: PdfPagina[];
  fout?: string;
}

/**
 * Tekenschaal: 2 is 144 dpi. Een A4 op een vel van het rapport wordt ongeveer
 * 84 % zo groot afgedrukt, dus effectief zo'n 170 dpi: scherp genoeg voor
 * tekst en tekeningen, zonder dat een PDF van vijftig pagina's minuten kost.
 */
export const TEKENSCHAAL = 2;
/** Een grote tekening (A0) wordt niet groter getekend dan dit aantal pixels. */
const MAX_PIXELS = 8_000_000;
/** Zoveel PDF's blijven getekend bewaard als niets ze meer toont. */
const BEWAARD = 12;

const LADEN: PdfStand = { status: "laden", paginas: [] };

interface Ingang {
  /** Wat de weergaven zien; verandert alleen bij het melden. */
  stand: PdfStand;
  /** De nieuwste stand, nog niet gemeld. */
  volgende: PdfStand | null;
  /** Hoeveel weergaven deze PDF nu tonen; alleen een ongebruikte ingang mag weg. */
  gebruik: number;
  /** Uit de cache gehaald: stoppen met tekenen en niets meer melden. */
  weg: boolean;
}

const cache = new Map<string, Ingang>();
const luisteraars = new Set<() => void>();
/** Telt elke melding; het afdrukvoorbeeld verdeelt opnieuw als hij verandert. */
let versie = 0;
let meldTimer: ReturnType<typeof setTimeout> | null = null;

const laatste = (ingang: Ingang) => ingang.volgende ?? ingang.stand;

/**
 * Meldt de wijzigingen aan de weergaven. Gebundeld: een PDF van dertig
 * pagina's zou anders dertig keer het hele afdrukvoorbeeld opnieuw verdelen.
 * `direct` voor de maten en het einde van het laden, zodat de afdruk niet
 * onnodig wacht. Pas hier veranderen de standen die de weergaven lezen, zoals
 * useSyncExternalStore dat wil.
 */
function meld(direct = false) {
  if (meldTimer) clearTimeout(meldTimer);
  const roep = () => {
    meldTimer = null;
    for (const ingang of cache.values()) {
      if (ingang.volgende) ingang.stand = ingang.volgende;
      ingang.volgende = null;
    }
    versie += 1;
    for (const l of luisteraars) l();
  };
  if (direct) roep();
  else meldTimer = setTimeout(roep, 250);
}

function abonneer(l: () => void) {
  luisteraars.add(l);
  return () => {
    luisteraars.delete(l);
  };
}

function zet(ingang: Ingang, stand: PdfStand, direct = false) {
  if (ingang.weg) return;
  ingang.volgende = stand;
  meld(direct);
}

/** Ruimt getekende PDF's op die niets meer toont, tot er hooguit BEWAARD over zijn. */
function ruimOp() {
  for (const [sleutel, ingang] of cache) {
    if (cache.size <= BEWAARD) return;
    if (ingang.gebruik > 0 || laatste(ingang).status === "laden") continue;
    ingang.weg = true;
    for (const p of laatste(ingang).paginas) if (p.url) URL.revokeObjectURL(p.url);
    cache.delete(sleutel);
  }
}

// ── pdf.js ────────────────────────────────────────────────────────────────────

type PdfJs = typeof import("pdfjs-dist");
let pdfjsLaden: Promise<PdfJs> | null = null;

/** pdf.js met zijn worker; de worker-URL komt van Vite, ook in de gebouwde app. */
function pdfjs(): Promise<PdfJs> {
  pdfjsLaden ??= Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ])
    .then(([lib, worker]) => {
      lib.GlobalWorkerOptions.workerSrc = worker.default;
      return lib;
    })
    .catch((err) => {
      // Een volgende poging mag het opnieuw proberen.
      pdfjsLaden = null;
      throw err;
    });
  return pdfjsLaden;
}

/**
 * Eén pagina tegelijk, over alle PDF's heen: een groot canvas kost tientallen
 * megabytes, en zo blijft de app tijdens het tekenen bruikbaar.
 */
let rij: Promise<unknown> = Promise.resolve();
function inRij<T>(taak: () => Promise<T>): Promise<T> {
  const p = rij.then(taak, taak);
  rij = p.catch(() => undefined);
  return p;
}

async function tekenPagina(doc: PDFDocumentProxy, nummer: number): Promise<string> {
  const pagina = await doc.getPage(nummer);
  const basis = pagina.getViewport({ scale: 1 });
  const schaal = Math.min(TEKENSCHAAL, Math.sqrt(MAX_PIXELS / Math.max(1, basis.width * basis.height)));
  const viewport = pagina.getViewport({ scale: schaal });
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(viewport.width));
  canvas.height = Math.max(1, Math.ceil(viewport.height));
  try {
    // Wit papier: een pagina zonder eigen achtergrond is anders doorzichtig.
    await pagina.render({ canvas, viewport, background: "#ffffff" }).promise;
    const blob = await new Promise<Blob>((ok, mis) =>
      canvas.toBlob((b) => (b ? ok(b) : mis(new Error("canvas.toBlob gaf niets terug"))), "image/png"),
    );
    return URL.createObjectURL(blob);
  } finally {
    // Het geheugen van het canvas meteen vrijgeven, niet pas bij de GC.
    canvas.width = 0;
    canvas.height = 0;
    pagina.cleanup();
  }
}

// ── Scherp tekenen bij inzoomen ───────────────────────────────────────────────

/** Het laatst gebruikte document voor het scherp tekenen: bij inzoomen is dat vrijwel altijd hetzelfde. */
let scherp: { data: string; doc: Promise<PDFDocumentProxy> } | null = null;

function scherpDocument(data: string): Promise<PDFDocumentProxy> {
  if (scherp?.data === data) return scherp.doc;
  sluitScherp();
  const doc = pdfjs().then((lib) => lib.getDocument({ data: base64NaarBytes(data), verbosity: lib.VerbosityLevel.ERRORS }).promise);
  scherp = { data, doc };
  return doc;
}

/** Geeft het document van het scherp tekenen vrij; de viewer roept dit aan als hij dichtgaat. */
export function sluitScherp() {
  if (!scherp) return;
  void scherp.doc.then((doc) => doc.loadingTask.destroy()).catch(() => undefined);
  scherp = null;
}

/**
 * Tekent een pagina op `schaal` pixels per punt in `doel`. Het oude beeld blijft staan tot het
 * nieuwe klaar is. `nogNodig` zegt of de uitkomst nog gewenst is: tijdens het zoomen verandert de
 * schaal sneller dan pdf.js kan tekenen.
 */
export function tekenScherp(data: string, nummer: number, schaal: number, doel: HTMLCanvasElement, nogNodig: () => boolean): Promise<void> {
  return inRij(async () => {
    if (!nogNodig()) return;
    const doc = await scherpDocument(data);
    const pagina = await doc.getPage(nummer + 1);
    const viewport = pagina.getViewport({ scale: schaal });
    const tijdelijk = document.createElement("canvas");
    tijdelijk.width = Math.max(1, Math.ceil(viewport.width));
    tijdelijk.height = Math.max(1, Math.ceil(viewport.height));
    try {
      await pagina.render({ canvas: tijdelijk, viewport, background: "#ffffff" }).promise;
      if (!nogNodig()) return;
      doel.width = tijdelijk.width;
      doel.height = tijdelijk.height;
      doel.getContext("2d")?.drawImage(tijdelijk, 0, 0);
    } finally {
      tijdelijk.width = 0;
      tijdelijk.height = 0;
      pagina.cleanup();
    }
  });
}

async function laad(data: string, ingang: Ingang) {
  let taak: PDFDocumentLoadingTask | null = null;
  try {
    const lib = await pdfjs();
    taak = lib.getDocument({ data: base64NaarBytes(data), verbosity: lib.VerbosityLevel.ERRORS });
    const doc = await taak.promise;
    let paginas: PdfPagina[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const v = (await doc.getPage(n)).getViewport({ scale: 1 });
      paginas.push({ breedte: v.width, hoogte: v.height, url: null });
    }
    // De maten eerst: daarmee kan de afdruk de vellen al verdelen.
    zet(ingang, { status: "laden", paginas }, true);
    for (let n = 1; n <= paginas.length; n++) {
      if (ingang.weg) return;
      let pagina: PdfPagina;
      try {
        pagina = { ...paginas[n - 1], url: await inRij(() => tekenPagina(doc, n)) };
      } catch (err) {
        console.error(`PDF-pagina ${n} tekenen mislukt:`, err);
        pagina = { ...paginas[n - 1], mislukt: true };
      }
      paginas = paginas.map((p, i) => (i === n - 1 ? pagina : p));
      zet(ingang, { status: "laden", paginas }, n === paginas.length);
    }
    zet(ingang, { status: "klaar", paginas }, true);
  } catch (err) {
    console.error("PDF lezen mislukt:", err);
    // Wat al getekend was blijft staan; zonder pagina's alleen de melding.
    const paginas = laatste(ingang).paginas.map((p) => (p.url ? p : { ...p, mislukt: true }));
    zet(ingang, { status: "fout", paginas, fout: (err as Error)?.message ?? String(err) }, true);
  } finally {
    // Geeft het document in de worker vrij; de afbeeldingen blijven.
    void taak?.destroy();
  }
}

/** Begint met tekenen als dat nog niet gebeurt, en telt een gebruiker. */
function gebruik(data: string): Ingang {
  let ingang = cache.get(data);
  if (!ingang) {
    ingang = { stand: LADEN, volgende: null, gebruik: 0, weg: false };
    cache.set(data, ingang);
    void laad(data, ingang);
  } else {
    // Achteraan zetten: de volgorde van de Map is die van het laatste gebruik.
    cache.delete(data);
    cache.set(data, ingang);
  }
  ingang.gebruik += 1;
  ruimOp();
  return ingang;
}

/**
 * De pagina's van een PDF-blad, getekend of nog onderweg. `undefined` (een
 * blad zonder bestand) geeft null.
 */
export function usePdfPaginas(data: string | undefined): PdfStand | null {
  const stand = useSyncExternalStore(abonneer, () => (data ? (cache.get(data)?.stand ?? LADEN) : null));
  useEffect(() => {
    if (!data) return;
    const ingang = gebruik(data);
    return () => {
      ingang.gebruik -= 1;
    };
  }, [data]);
  return stand;
}

/** Verandert bij elke getekende pagina; voor het opnieuw verdelen van het afdrukvoorbeeld. */
export function usePdfVersie(): number {
  return useSyncExternalStore(abonneer, () => versie);
}

/**
 * Teksten op papier: de uitdraai volgt de taal van de app (zie PrintBlad.tsx). Ze
 * staan in rapport.json onder `pdfBlad`.
 */
export const papier = () => i18next.getFixedT(i18next.language, "rapport");

// ── Base64 ────────────────────────────────────────────────────────────────────

type MetBase64 = { fromBase64?: (tekst: string) => Uint8Array };

export function base64NaarBytes(data: string): Uint8Array {
  const u8 = Uint8Array as unknown as MetBase64;
  if (typeof u8.fromBase64 === "function") return u8.fromBase64(data);
  const bin = atob(data);
  const uit = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) uit[i] = bin.charCodeAt(i);
  return uit;
}

/** Via een data-URL: de browser codeert, ook twintig megabyte, zonder de UI vast te zetten. */
export function bytesNaarBase64(bytes: Uint8Array): Promise<string> {
  return new Promise((ok, mis) => {
    const lezer = new FileReader();
    lezer.onload = () => {
      const url = String(lezer.result);
      ok(url.slice(url.indexOf(",") + 1));
    };
    lezer.onerror = () => mis(lezer.error ?? new Error("Bestand lezen mislukt"));
    lezer.readAsDataURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/pdf" }));
  });
}

// ── Kiezen ────────────────────────────────────────────────────────────────────

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

interface GekozenBestand {
  bestandsnaam: string;
  bytes: Uint8Array;
}

/** Het bestandsvenster van het systeem (app) of een bestandsinvoer (browser). */
async function kiesBestand(): Promise<GekozenBestand | null> {
  const t = i18next.getFixedT(null, "werkruimte");
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const pad = await open({
      // De uitleg voor een FEM-model staat in de titel: dat is wat je ziet bij het kiezen.
      title: t("pdf.kiesTitel"),
      multiple: false,
      directory: false,
      filters: [{ name: t("pdf.filter"), extensions: ["pdf"] }],
    });
    if (!pad || typeof pad !== "string") return null;
    return { bestandsnaam: pad.split(/[\\/]/).pop() ?? pad, bytes: await readFile(pad) };
  }

  return new Promise<GekozenBestand | null>((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".pdf,application/pdf";
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
 * Kiest een PDF voor een PDF-blad, met de controles: is het een PDF, en is
 * hij niet zo groot dat het projectbestand onhandelbaar wordt (daar vraagt
 * hij eerst naar). Null bij annuleren of afwijzen; een leesfout gaat door
 * naar de aanroeper.
 */
export async function kiesPdfBijlage(): Promise<PdfBijlage | null> {
  const t = i18next.getFixedT(null, "werkruimte");
  const gekozen = await kiesBestand();
  if (!gekozen) return null;
  const naam = gekozen.bestandsnaam;
  if (!lijktOpPdf(gekozen.bytes)) {
    alert(t("pdf.geenPdf", { naam }));
    return null;
  }
  if (gekozen.bytes.length > PDF_GROOT_BYTES) {
    const grootte = grootteTekst(gekozen.bytes.length, i18next.language);
    if (!confirm(t("pdf.groot", { naam, grootte }))) return null;
  }
  return { bestandsnaam: naam, data: await bytesNaarBase64(gekozen.bytes) };
}

/** Kiest een PDF en zet hem als nieuw blad achteraan het project. */
export async function voegPdfBladToe(
  voegToe: (naam: string, pdf: PdfBijlage) => string,
): Promise<void> {
  try {
    const pdf = await kiesPdfBijlage();
    if (pdf) voegToe(bladnaamVoor(pdf.bestandsnaam), pdf);
  } catch (err) {
    console.error("PDF toevoegen mislukt:", err);
    alert(i18next.t("werkruimte:pdf.lezenMislukt", { fout: (err as Error)?.message ?? String(err) }));
  }
}
