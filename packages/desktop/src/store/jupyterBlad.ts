/**
 * Een Jupyter-blad: een eigen werkmap met notebooks, Python-scripts en databestanden,
 * als blad in het project. Bewerken en rekenen gebeurt in de Jupyter-omgeving
 * (components/calc/JupyterVenster.tsx); hier staat de werkmap zelf.
 *
 * Een Jupyter-blad is een gewoon exemplaar (store/projectStore.ts) met `templateId`
 * JUPYTER_BLAD, een lege `source` en geen invoer. De werkmap staat erin als ZIP in
 * base64 (`jupyter`), zodat het projectbestand overdraagbaar blijft: wie het project
 * opent, heeft de bestanden en de uitvoer van de cellen erbij.
 *
 * Een werkmap kan van iemand anders komen. Paden worden daarom gecontroleerd, en een
 * notebook verliest bij het inlezen zijn vertrouwen: zo draait de JavaScript in de
 * opgeslagen uitvoer niet vanzelf als het blad opent.
 *
 * Puur en zonder React: projectBestand.ts gebruikt dit bestand, en de controlescripts
 * laden dat rechtstreeks in Node.
 */
import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from "fflate";

/** `templateId` van een Jupyter-blad. Geen module: er is geen sjabloon met deze naam. */
export const JUPYTER_BLAD = "jupyter";

/** Boven deze omvang (uitgepakt) weigert de app een werkmap: het projectbestand wordt onhandelbaar. */
export const WERKMAP_MAX_BYTES = 512 * 1024 * 1024;

/** De naam van het notebook in een nieuw blad. */
export const START_NOTEBOOK = "notebook.ipynb";

/** De werkmap van een Jupyter-blad. */
export interface JupyterWerkmap {
  /** De naam waaronder de werkmap is ingelezen; leeg bij een nieuw blad. */
  bestandsnaam: string;
  /** De werkmap als ZIP, base64-gecodeerd (zonder `data:`-voorvoegsel). */
  data: string;
  /** Gaat de code mee op papier, of alleen de tekst en de uitvoer? */
  metCode: boolean;
  /**
   * Alle cellen opnieuw uitvoeren na een wijziging. Bij het openen draait er ook dan niets:
   * een project kan van iemand anders komen, en de eerste wijziging is van de gebruiker.
   */
  automatisch?: boolean;
}

/** Eén bestand in de werkmap. Een pad dat op `/` eindigt, is een lege map. */
export interface WerkmapBestand {
  pad: string;
  bytes: Uint8Array;
}

/** Is dit blad een Jupyter-blad? Ook als de werkmap ontbreekt. */
export function isJupyterBlad(ex: { templateId?: string }): boolean {
  return ex.templateId === JUPYTER_BLAD;
}

/** De werkmap uit een bestand of de opgeslagen staat van de app. */
export function leesJupyterWerkmap(x: unknown): JupyterWerkmap | undefined {
  if (!x || typeof x !== "object") return undefined;
  const w = x as { bestandsnaam?: unknown; data?: unknown; metCode?: unknown; automatisch?: unknown };
  if (typeof w.data !== "string") return undefined;
  return {
    bestandsnaam: typeof w.bestandsnaam === "string" ? w.bestandsnaam : "",
    data: w.data.replace(/\s+/g, ""),
    metCode: w.metCode !== false,
    ...(w.automatisch === true ? { automatisch: true } : {}),
  };
}

/**
 * Een pad binnen de werkmap, of null als het er niet in hoort: absoluut, met `..`,
 * met een stationsletter of backslash. Een ZIP van iemand anders kan zo niet buiten
 * de werkmap schrijven en de omgeving niet in de war brengen.
 */
export function veiligPad(pad: string): string | null {
  if (typeof pad !== "string" || !pad || /[\\:\0]/.test(pad) || pad.startsWith("/")) return null;
  const map = pad.endsWith("/");
  const delen = (map ? pad.slice(0, -1) : pad).split("/");
  if (delen.some((d) => !d || d === "." || d === "..")) return null;
  return pad;
}

/** Vaste tijd in elke ZIP: dezelfde bestanden geven zo dezelfde bytes. */
const ZIP_TIJD = new Date(2000, 0, 1);

/** Pakt de bestanden in; onveilige paden vallen weg, de volgorde ligt vast. */
export function pakWerkmapIn(bestanden: readonly WerkmapBestand[]): Uint8Array {
  const invoer: Zippable = {};
  const opPad = [...bestanden].sort((a, b) => (a.pad < b.pad ? -1 : a.pad > b.pad ? 1 : 0));
  for (const { pad, bytes } of opPad) {
    if (veiligPad(pad)) invoer[pad] = [bytes, { level: pad.endsWith("/") ? 0 : 6 }];
  }
  return zipSync(invoer, { mtime: ZIP_TIJD });
}

/** De werkmap past niet; de app zet de melding in de taal van de gebruiker (werkruimte:jupyter.teGroot). */
export class WerkmapTeGrootFout extends Error {
  readonly mb: number;
  constructor(mb: number) {
    super(`The work folder is larger than ${mb} MB.`);
    this.mb = mb;
  }
}

/** Pakt een werkmap uit. Een kapotte of te grote ZIP geeft een fout; onveilige paden vallen weg. */
export function pakWerkmapUit(zip: Uint8Array): WerkmapBestand[] {
  let totaal = 0;
  const uit = unzipSync(zip, {
    filter: (f) => {
      totaal += f.originalSize;
      if (totaal > WERKMAP_MAX_BYTES) throw new WerkmapTeGrootFout(WERKMAP_MAX_BYTES / 1024 / 1024);
      return veiligPad(f.name) !== null;
    },
  });
  return Object.keys(uit).sort().map((pad) => ({ pad, bytes: uit[pad] }));
}

/** De notebooks in een werkmap, op pad gesorteerd; verborgen mappen tellen niet mee. */
export function notebooksIn(bestanden: readonly WerkmapBestand[]): WerkmapBestand[] {
  return bestanden.filter(({ pad }) => /\.ipynb$/i.test(pad) && !pad.split("/").some((d) => d.startsWith(".")));
}

/**
 * Een notebook zoals het de omgeving in gaat: zonder vertrouwen, en met de opmaak
 * die de omgeving zelf ook schrijft (zo telt alleen openen niet als wijziging). Uitvoer
 * met JavaScript of HTML draait of toont dan pas na opnieuw uitvoeren. Geen geldig
 * notebook: de bytes blijven zoals ze zijn.
 */
export function notebookZonderVertrouwen(bytes: Uint8Array): Uint8Array {
  try {
    const nb = JSON.parse(strFromU8(bytes)) as { metadata?: Record<string, unknown>; cells?: unknown };
    if (nb.metadata) delete nb.metadata.trusted;
    if (Array.isArray(nb.cells)) {
      for (const cel of nb.cells as { metadata?: Record<string, unknown> }[]) {
        if (cel?.metadata) delete cel.metadata.trusted;
      }
    }
    return strToU8(`${JSON.stringify(nb, null, 1)}\n`);
  } catch {
    return bytes;
  }
}

/** De bestanden voor de omgeving: elk notebook zonder vertrouwen. */
export function bestandenVoorOmgeving(bestanden: readonly WerkmapBestand[]): WerkmapBestand[] {
  return bestanden.map((b) => (/\.ipynb$/i.test(b.pad) ? { pad: b.pad, bytes: notebookZonderVertrouwen(b.bytes) } : b));
}

/** Teksten van het notebook in een nieuw blad; in de taal van de app. */
export interface StartTeksten {
  kop: string;
  uitleg: string;
  titel: string;
}

/** Een nieuw notebook met een korte startcel. Staat op de versie van de kernel in de omgeving. */
export function startNotebook(t: StartTeksten): Uint8Array {
  const code = [
    "import numpy as np",
    "import matplotlib.pyplot as plt",
    "",
    "x = np.linspace(0, 10, 101)",
    "plt.plot(x, np.sin(x))",
    `plt.title(${JSON.stringify(t.titel)})`,
    "plt.show()",
  ];
  const regels = (r: string[]) => r.map((l, i) => (i < r.length - 1 ? `${l}\n` : l));
  return strToU8(`${JSON.stringify({
    cells: [
      { cell_type: "markdown", id: "start-tekst", metadata: {}, source: regels([`# ${t.kop}`, "", t.uitleg]) },
      { cell_type: "code", id: "start-code", metadata: {}, execution_count: null, outputs: [], source: regels(code) },
    ],
    metadata: {
      kernelspec: { display_name: "Python (Pyodide)", language: "python", name: "python" },
      language_info: { name: "python", file_extension: ".py", mimetype: "text/x-python" },
    },
    nbformat: 4,
    nbformat_minor: 5,
  }, null, 1)}\n`);
}

/** Base64 naar bytes; `Uint8Array.fromBase64` waar de browser dat kent. */
export function uitBase64(data: string): Uint8Array {
  const u8 = Uint8Array as unknown as { fromBase64?: (s: string) => Uint8Array };
  if (typeof u8.fromBase64 === "function") return u8.fromBase64(data);
  const bin = atob(data);
  const uit = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) uit[i] = bin.charCodeAt(i);
  return uit;
}

/** De naam van een nieuw blad uit de bestandsnaam: zonder map en extensie. */
export function bladnaamVoorNotebook(bestandsnaam: string): string {
  const los = bestandsnaam.split(/[\\/]/).pop() ?? bestandsnaam;
  return los.replace(/\.(ipynb|py|zip)$/i, "").trim() || "Jupyter";
}

/** Welk notebook opent als eerste: het eerste in de werkmap. */
export function eersteNotebook(bestanden: readonly WerkmapBestand[]): string | undefined {
  return notebooksIn(bestanden)[0]?.pad;
}

/**
 * De herkomst van een blad in de omgeving: per blad een eigen host, zodat twee bladen
 * geen opslag, service worker of kernel delen. De sleutel is een hash van het id
 * (FNV-1a), omdat een hostnaam alleen kleine letters, cijfers en een streepje verdraagt.
 */
export function bladSleutel(id: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  // Twee keer met een andere start, voor minder kans op een botsing tussen bladen.
  let g = 0xcbf29ce4;
  for (let i = id.length - 1; i >= 0; i--) {
    g ^= id.charCodeAt(i);
    g = Math.imul(g, 0x01000193);
  }
  return `${(h >>> 0).toString(36)}${(g >>> 0).toString(36)}`;
}

/**
 * De rechten van beide iframes (components/calc/JupyterVenster.tsx). Geen
 * `allow-top-navigation` en geen `allow-popups`: de omgeving kan het hoofdvenster niet
 * wegsturen en geen venster openen. `allow-same-origin` is nodig voor de service worker
 * en is hier veilig: de binnenste iframe heeft een eigen herkomst, en de buitenste voert
 * niets uit.
 */
export const JUPYTER_RECHTEN = "allow-scripts allow-same-origin allow-downloads";

/**
 * De buitenste iframe om de omgeving: geen script (`default-src 'none'`), en een
 * `frame-src` die de binnenste iframe op zijn eigen herkomst houdt. Zo kan code in de
 * omgeving de pagina niet naar buiten navigeren, ook niet met een waarde in het adres.
 * De CSP uit de antwoordkoppen dekt alleen de verzoeken vanuit de pagina zelf.
 */
export function jupyterOmhulsel(herkomst: string, pad = "/lab/index.html"): string {
  const csp = `default-src 'none'; style-src 'unsafe-inline'; frame-src ${herkomst}`;
  return "<!doctype html><html><head><meta charset=\"utf-8\">"
    + `<meta http-equiv="Content-Security-Policy" content="${csp}">`
    + "<style>html,body,iframe{margin:0;padding:0;border:0;width:100%;height:100%;display:block;overflow:hidden}</style>"
    + `</head><body><iframe src="${herkomst}${pad}" sandbox="${JUPYTER_RECHTEN}" allow="clipboard-read; clipboard-write"></iframe></body></html>`;
}
