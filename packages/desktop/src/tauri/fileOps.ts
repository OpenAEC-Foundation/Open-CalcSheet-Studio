/**
 * File I/O helpers wrapping the Tauri dialog + fs plugins.
 *
 * Falls back gracefully in browser-dev (no Tauri runtime) by using the
 * File System Access API where available, or a stub <input type=file>.
 *
 * Bestandsformaat
 * ---------------
 * Een `.ifccalculation` is zuiver IFCX: hetzelfde bestand met de extensie
 * `.ifcx` is hetzelfde bestand. De vorm staat in `store/projectBestand.ts` en
 * packages/core/src/ifcx/.
 *
 * Oudere `.ifc-calculation`-, `.cpd`- en `.cpdz`-bestanden openen ook;
 * `store/projectBestand.ts` beslist wat een bestand voorstelt en maakt er zo
 * nodig een project met één rekenblad van.
 *
 * Geen waarde-imports: de controle (scripts/check-bestand-opslaan.mjs) laadt dit
 * bestand los.
 */

function isTauri(): boolean {
  try {
    // @ts-expect-error — runtime probe
    return typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
  } catch {
    return false;
  }
}

const SUPPORTED_FILTERS = [
  { name: "Calculations", extensions: ["ifccalculation", "ifcx", "ifc-calculation", "cpd", "cpdz"] },
  { name: "Rekentekst", extensions: ["cpd", "cpdz"] },
  { name: "OpenAEC Calculations", extensions: ["ifccalculation", "ifcx", "ifc-calculation"] },
  { name: "Alle bestanden", extensions: ["*"] },
];

export interface OpenedFile {
  path: string;
  name: string;
  /**
   * Onbewerkte bestandsinhoud. Het uitpakken gebeurt in
   * `store/projectBestand.ts`: die kent zowel het projectformaat als de oudere
   * losse-blad-vormen, en kan als enige beslissen wat een bestand voorstelt.
   */
  raw: string;
}

// De browser geeft geen bestandspad terug. Bewaar de gekozen handle gedurende
// de sessie, zodat Opslaan hetzelfde bestand kan overschrijven.
let browserHandle: FileSystemFileHandle | null = null;
let browserBestandsnaam: string | null = null;

type BestandsKiezer = Window & {
  showOpenFilePicker?: (options?: object) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: object) => Promise<FileSystemFileHandle>;
};

// ── De OpenAEC SuperCloud ──────────────────────────────────────────────────
// In de werkplek van de SuperCloud zet de omgeving `window.openaecHost` neer
// (contract: OpenAEC-Blueprint, docs/supercloud-koppeling.md). Openen, Opslaan
// en Opslaan als gaan dan naar Docs in plaats van naar schijf of een download.
// Een bestand uit Docs heeft hier het pad `docs:<id>`.

interface DocsRef { id: string; name: string; version: string | number }
interface SiteHost {
  initialFileId?: string;
  open(id: string, version?: string | number): Promise<DocsRef & { readOnly: boolean; bytes: ArrayBuffer | Uint8Array }>;
  save(bytes: Uint8Array, options: { id?: string; name?: string; expectedVersion?: string | number }): Promise<DocsRef>;
  list(): Promise<{ id: string; name: string; modified: string }[]>;
}

const DOCS = "docs:";
const docsBestanden = new Map<string, DocsRef & { readOnly: boolean }>();

/** De SuperCloud-host, of null buiten de werkplek. */
export function siteHost(): SiteHost | null {
  const host = typeof window !== "undefined" ? (window as { openaecHost?: SiteHost }).openaecHost : undefined;
  return host && typeof host.open === "function" && typeof host.save === "function" ? host : null;
}

export function isDocsPad(path: string | null): boolean {
  return !!path && path.startsWith(DOCS);
}

/** Een bestand uit Docs openen (op id, of op een pad `docs:<id>`). */
export async function openUitDocs(idOfPad: string): Promise<OpenedFile> {
  const host = siteHost();
  if (!host) throw new Error(i18next.t("werkruimte:bestandDialoog.geenBestand"));
  const id = idOfPad.startsWith(DOCS) ? idOfPad.slice(DOCS.length) : idOfPad;
  const f = await host.open(id);
  const bytes = f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes);
  const path = DOCS + f.id;
  docsBestanden.set(path, { id: f.id, name: f.name, version: f.version, readOnly: f.readOnly });
  return { path, name: stripExt(f.name), raw: new TextDecoder().decode(bytes) };
}

/** Kiezen uit de bestanden van deze tool in dezelfde map in Docs (null: geannuleerd). */
async function kiesUitDocs(host: SiteHost): Promise<OpenedFile | null> {
  const lijst = (await host.list()).filter((f) => /\.(ifccalculation|ifcx|ifc-calculation|cpd|cpdz)$/i.test(f.name));
  if (!lijst.length) {
    alert(i18next.t("werkruimte:bestandDialoog.geenDocs"));
    return null;
  }
  const keuze = prompt(
    `${i18next.t("werkruimte:bestandDialoog.kiesDocs")}\n\n` +
      lijst.map((f, i) => `${i + 1}. ${f.name}`).join("\n"),
    "1",
  );
  const nummer = keuze ? Number.parseInt(keuze, 10) : NaN;
  if (!Number.isInteger(nummer) || nummer < 1 || nummer > lijst.length) return null;
  return openUitDocs(lijst[nummer - 1].id);
}

/** Opslaan in Docs: met `id` een nieuwe versie, met `name` een nieuw bestand. Geeft het pad terug. */
async function bewaarInDocs(host: SiteHost, payload: string, doel: { path?: string; name?: string }): Promise<string> {
  const bytes = new TextEncoder().encode(payload);
  const bekend = doel.path ? docsBestanden.get(doel.path) : undefined;
  const ref = bekend && !bekend.readOnly
    ? await host.save(bytes, { id: bekend.id, expectedVersion: bekend.version })
    : await host.save(bytes, { name: doel.name ?? bekend?.name ?? "Berekening.ifccalculation" });
  // Een conflict geeft een kopie met een eigen id: die is daarna het geopende bestand.
  const path = DOCS + ref.id;
  docsBestanden.set(path, { ...ref, readOnly: false });
  return path;
}

function geannuleerd(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Staat er een oud formaat in deze tekst? Formaat 2 zet `ifcxVersion` meteen vooraan. */
export function isOudFormaat(raw: string): boolean {
  return !raw.slice(0, 1000).includes('"ifcxVersion"');
}

/** De naam van de kopie van een oud bestand: `<naam>.v1.bak`, in dezelfde map. */
export function kopieVanOudBestand(path: string): string {
  return `${path.replace(/\.[^.\\/]+$/, "")}.v1.bak`;
}

/** Bestanden waarvan we weten dat ze al nieuw zijn; die hoeven niet nog eens gelezen te worden. */
const alNieuw = new Set<string>();

interface FsVoorKopie {
  readTextFile(path: string): Promise<string>;
  writeTextFile(path: string, inhoud: string): Promise<void>;
}

/**
 * Vóór het eerste opslaan over een bestand in een oud formaat: een kopie ernaast,
 * één keer. Een bestaande kopie blijft staan. Lukt de kopie niet, dan gaat het
 * opslaan door, met een melding in de console: de inhoud zit ook in het nieuwe
 * bestand.
 *
 * Alleen in de app. In de browser kan een pagina niet naast een gekozen bestand
 * schrijven; daar blijft het bij de nieuwe inhoud.
 */
export async function bewaarOudeVersie(path: string, fs?: FsVoorKopie): Promise<void> {
  if (alNieuw.has(path)) return;
  const bestanden: FsVoorKopie | null = fs ?? (isTauri() ? await import("@tauri-apps/plugin-fs") : null);
  if (!bestanden) return;
  let oud: string;
  try {
    oud = await bestanden.readTextFile(path);
  } catch {
    return; // Nog geen bestand: niets te bewaren.
  }
  if (!isOudFormaat(oud)) {
    alNieuw.add(path);
    return;
  }
  const kopie = kopieVanOudBestand(path);
  try {
    await bestanden.readTextFile(kopie);
    return; // Er is al een kopie, en die is ouder dan dit bestand.
  } catch {
    // Geen kopie: maken.
  }
  try {
    await bestanden.writeTextFile(kopie, oud);
  } catch (err) {
    console.warn(`Kopie van het oude bestand niet gemaakt (${kopie}):`, err);
  }
}


/**
 * Open a `.ifc-calculation` or `.cpd` file via the OS file picker.
 * Resolves with the loaded content, or `null` if the user cancelled.
 */
export async function openCalculationFile(): Promise<OpenedFile | null> {
  const host = siteHost();
  if (host) return kiesUitDocs(host);
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");

    const picked = await open({
      title: i18next.t("werkruimte:bestandDialoog.openen"),
      multiple: false,
      directory: false,
      filters: SUPPORTED_FILTERS,
    });
    if (!picked || typeof picked !== "string") return null;

    const raw = await readTextFile(picked);
    const name = pathBaseName(picked);
    return { path: picked, name, raw };
  }

  const kies = (window as BestandsKiezer).showOpenFilePicker;
  if (kies) {
    try {
      const [handle] = await kies.call(window, {
        types: [{ description: "Berekeningen", accept: { "application/json": [".ifccalculation", ".ifcx", ".ifc-calculation", ".cpd", ".cpdz"] } }],
        excludeAcceptAllOption: false,
      });
      if (!handle) return null;
      const raw = await (await handle.getFile()).text();
      browserHandle = handle;
      browserBestandsnaam = handle.name;
      return { path: handle.name, name: stripExt(handle.name), raw };
    } catch (error) {
      if (geannuleerd(error)) return null;
      throw error;
    }
  }

  // Browser fallback: HTML <input type=file>
  return new Promise<OpenedFile | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".ifccalculation,.ifcx,.ifc-calculation,.cpd,.cpdz,.txt";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      const raw = await f.text();
      browserHandle = null;
      browserBestandsnaam = null;
      resolve({ path: f.name, name: stripExt(f.name), raw });
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

let startbestandVraag: Promise<string | null> | null = null;

/**
 * Het bestand waarmee de app is gestart: een dubbelklik in de Verkenner geeft
 * via de bestandskoppeling het pad mee op de opdrachtregel. `null` in de
 * browser of zonder bestand. Eén vraag per sessie, ook als React het effect
 * twee keer draait.
 */
export function startbestand(): Promise<string | null> {
  // In de werkplek: het bestand waarmee de gebruiker de tool uit Docs opende.
  const host = siteHost();
  if (host) return Promise.resolve(host.initialFileId ? DOCS + host.initialFileId : null);
  if (!isTauri()) return Promise.resolve(null);
  startbestandVraag ??= import("@tauri-apps/api/core").then(({ invoke }) => invoke<string | null>("startbestand"));
  return startbestandVraag;
}

function pathBaseName(p: string): string {
  const last = p.split(/[\\/]/).pop() ?? p;
  return stripExt(last);
}

function stripExt(s: string): string {
  return s.replace(/\.(ifccalculation|ifcx|ifc-calculation|cpd|cpdz|txt)$/i, "");
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}

/**
 * Kan "Opslaan" zonder dialoog over dit bestand heen schrijven? Alleen in de
 * app (de browser kent geen pad) en alleen over een bestand in het eigen
 * formaat: een geopend `.cpd` of een oud `.ifc-calculation` overschrijf je
 * niet ongemerkt, daarvoor komt eerst de dialoog.
 */
export function kanDirectOpslaan(path: string | null): path is string {
  if (path && isDocsPad(path)) {
    const docs = docsBestanden.get(path);
    return !!docs && !docs.readOnly && /\.ifccalculation$/i.test(docs.name);
  }
  return !!path && /\.ifccalculation$/i.test(path) &&
    (isTauri() || (browserHandle !== null && browserBestandsnaam === path));
}

/**
 * Schrijf een payload over een bestaand bestand heen, zonder dialoog. Geeft het
 * pad terug waar het staat: in Docs kan een conflict een kopie met een ander
 * pad opleveren.
 */
export async function schrijfCalculationFile(path: string, payload: string): Promise<string> {
  const host = siteHost();
  if (host && isDocsPad(path)) return bewaarInDocs(host, payload, { path });
  if (!isTauri()) {
    if (!browserHandle || browserBestandsnaam !== path) throw new Error(i18next.t("werkruimte:bestandDialoog.geenBestand"));
    const writable = await browserHandle.createWritable();
    await writable.write(payload);
    await writable.close();
    return path;
  }
  const { writeTextFile } = await import("@tauri-apps/plugin-fs");
  await bewaarOudeVersie(path);
  await writeTextFile(path, payload);
  alNieuw.add(path);
  return path;
}

/**
 * Schrijf een kant-en-klare payload weg als `.ifc-calculation` via een Save
 * As-dialoog. De payload wordt gebouwd door `store/projectBestand.ts` — dat
 * bepaalt de vorm, dit bestand doet alleen de schijf.
 * Staat het project al in een bestand, dan opent de dialoog in die map.
 * Het absolute pad komt terug, of `null` als de gebruiker annuleert.
 */
export async function saveCalculationFile(
  payload: string,
  defaultName: string,
  huidigPad?: string | null,
): Promise<string | null> {
  const defaultFile = `${sanitizeFileName(defaultName)}.ifccalculation`;

  const host = siteHost();
  if (host) {
    const naam = prompt(i18next.t("werkruimte:bestandDialoog.naamInDocs"), defaultFile);
    if (!naam) return null;
    const metExtensie = /\.ifccalculation$/i.test(naam) ? naam : `${naam}.ifccalculation`;
    return bewaarInDocs(host, payload, { name: sanitizeFileName(metExtensie) });
  }

  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const scheiding = huidigPad?.match(/[\\/]/)?.[0];
    const map = huidigPad && scheiding ? huidigPad.slice(0, huidigPad.lastIndexOf(scheiding)) : null;
    const path = await save({
      title: i18next.t("werkruimte:bestandDialoog.opslaanAls"),
      defaultPath: map ? `${map}${scheiding}${defaultFile}` : defaultFile,
      filters: [
        { name: "OpenAEC Calculation (IFCX)", extensions: ["ifccalculation"] },
        { name: "Alle bestanden", extensions: ["*"] },
      ],
    });
    if (!path) return null;
    await bewaarOudeVersie(path);
    await writeTextFile(path, payload);
    alNieuw.add(path);
    return path;
  }

  const kies = (window as BestandsKiezer).showSaveFilePicker;
  if (kies) {
    try {
      const handle = await kies.call(window, {
        suggestedName: defaultFile,
        types: [{ description: "Berekening", accept: { "application/json": [".ifccalculation"] } }],
      });
      const writable = await handle.createWritable();
      await writable.write(payload);
      await writable.close();
      browserHandle = handle;
      browserBestandsnaam = handle.name;
      return handle.name;
    } catch (error) {
      if (geannuleerd(error)) return null;
      throw error;
    }
  }

  // Browser fallback — download via Blob link
  const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = defaultFile;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return a.download;
}import i18next from "i18next";

