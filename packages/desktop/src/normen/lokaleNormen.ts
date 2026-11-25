/**
 * Persoonlijke normbestanden blijven in de lokale applicatieopslag. Alleen
 * nummer, editie en bestandsnaam worden in de catalogus getoond; de PDF wordt
 * nooit aan een projectbestand of de broncode toegevoegd.
 *
 * In de werkplek van de SuperCloud heeft het frame geen IndexedDB: daar blijven
 * ze alleen in het geheugen, tot de pagina sluit (src/werkplek/werkplek.ts).
 */
import { IN_WERKPLEK } from "../werkplek/werkplek";

export interface LokaleNorm {
  id: string;
  nummer: string;
  editie: string;
  bestandsnaam: string;
  toegevoegd: string;
  pdf: Blob;
}

const DATABASE = "open-calculations-lokale-normen";
const STORE = "normen";

/** De normbestanden in de werkplek: alleen in het geheugen. */
const geheugen = new Map<string, LokaleNorm>();

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(i18next.t("werkruimte:normbestanden.opslagNietBeschikbaar")));
  });
}

function leesVerzoek<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error(i18next.t("werkruimte:normbestanden.lezenMislukt")));
  });
}

function wachtOpTransactie(transactie: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transactie.oncomplete = () => resolve();
    transactie.onerror = () => reject(transactie.error ?? new Error(i18next.t("werkruimte:normbestanden.opslaanMislukt")));
    transactie.onabort = () => reject(transactie.error ?? new Error(i18next.t("werkruimte:normbestanden.opslaanAfgebroken")));
  });
}

async function alleNormen(): Promise<LokaleNorm[]> {
  if (IN_WERKPLEK) return [...geheugen.values()];
  const database = await openDatabase();
  try {
    const transactie = database.transaction(STORE, "readonly");
    return await leesVerzoek<LokaleNorm[]>(transactie.objectStore(STORE).getAll());
  } finally {
    database.close();
  }
}

export async function lijstLokaleNormen(): Promise<Omit<LokaleNorm, "pdf">[]> {
  const items = await alleNormen();
  return items.map(({ pdf: _pdf, ...gegevens }) => gegevens)
    .sort((a, b) => a.nummer.localeCompare(b.nummer, "nl") || a.editie.localeCompare(b.editie, "nl"));
}

export async function leesLokaleNorm(id: string): Promise<Blob | null> {
  if (IN_WERKPLEK) return geheugen.get(id)?.pdf ?? null;
  const database = await openDatabase();
  try {
    const transactie = database.transaction(STORE, "readonly");
    const item = await leesVerzoek<LokaleNorm | undefined>(transactie.objectStore(STORE).get(id));
    return item?.pdf ?? null;
  } finally {
    database.close();
  }
}

export async function voegLokaleNormToe(nummer: string, editie: string, bestand: File): Promise<void> {
  const begin = new TextDecoder().decode(await bestand.slice(0, 5).arrayBuffer());
  if (begin !== "%PDF-") throw new Error(i18next.t("werkruimte:normbestanden.geenPdf"));
  if (bestand.size > 100 * 1024 * 1024) throw new Error(i18next.t("werkruimte:normbestanden.teGroot"));
  const norm: LokaleNorm = {
    id: crypto.randomUUID(),
    nummer: nummer.trim(),
    editie: editie.trim(),
    bestandsnaam: bestand.name,
    toegevoegd: new Date().toISOString(),
    pdf: bestand,
  };
  if (IN_WERKPLEK) {
    geheugen.set(norm.id, norm);
    return;
  }
  const database = await openDatabase();
  try {
    const transactie = database.transaction(STORE, "readwrite");
    const klaar = wachtOpTransactie(transactie);
    transactie.objectStore(STORE).put(norm);
    await klaar;
  } finally {
    database.close();
  }
}

export async function verwijderLokaleNorm(id: string): Promise<void> {
  if (IN_WERKPLEK) {
    geheugen.delete(id);
    return;
  }
  const database = await openDatabase();
  try {
    const transactie = database.transaction(STORE, "readwrite");
    const klaar = wachtOpTransactie(transactie);
    transactie.objectStore(STORE).delete(id);
    await klaar;
  } finally {
    database.close();
  }
}import i18next from "i18next";
