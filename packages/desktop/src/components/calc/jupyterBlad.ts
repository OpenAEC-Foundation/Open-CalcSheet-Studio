import i18next from "../../i18n/config";
import { base64Bytes, grootteTekst } from "../../store/pdfBijlage";
import {
  bladnaamVoorNotebook, notebooksIn, pakWerkmapIn, pakWerkmapUit, START_NOTEBOOK, startNotebook, uitBase64,
  type JupyterWerkmap, type WerkmapBestand,
} from "../../store/jupyterBlad";
import { bytesNaarBase64 } from "./pdfBlad";

/*
 * Jupyter-bladen in de app: een nieuw blad, bestanden inlezen en de werkmap
 * wegschrijven. Wat een Jupyter-blad ís, staat in store/jupyterBlad.ts.
 */

const isTauri = () => "__TAURI_INTERNALS__" in window;

/** Het notebook van een nieuw blad, met de teksten in de taal van de app. */
function startBestand(): WerkmapBestand {
  const t = i18next.getFixedT(null, "werkruimte");
  return {
    pad: START_NOTEBOOK,
    bytes: startNotebook({ kop: t("jupyter.start.kop"), uitleg: t("jupyter.start.uitleg"), titel: t("jupyter.start.titel") }),
  };
}

async function naarWerkmap(bestanden: WerkmapBestand[], bestandsnaam = ""): Promise<JupyterWerkmap> {
  return { bestandsnaam, data: await bytesNaarBase64(pakWerkmapIn(bestanden)), metCode: true };
}

/** Een nieuw blad met een notebook met een korte startcel, achteraan het project. */
export function voegLeegJupyterToe(voegToe: (naam: string, jupyter: JupyterWerkmap) => string): void {
  void naarWerkmap([startBestand()])
    .then((werkmap) => voegToe(i18next.t("werkruimte:jupyter.nieuweNaam"), werkmap))
    .catch((err) => {
      console.error("Jupyter-blad maken mislukt:", err);
      alert(i18next.t("werkruimte:jupyter.lezenMislukt", { fout: (err as Error)?.message ?? String(err) }));
    });
}

/** Kiest een of meer bestanden; ook in de browser, voor de ontwikkelserver. */
export async function kiesBestanden(extensies: string[] | null, filter?: string): Promise<{ naam: string; bytes: Uint8Array }[]> {
  const t = i18next.getFixedT(null, "werkruimte");
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const gekozen = await open({
      title: t("jupyter.kiesTitel"),
      multiple: true,
      directory: false,
      filters: extensies ? [{ name: filter ?? t("jupyter.filter"), extensions: extensies }] : undefined,
    });
    if (!gekozen) return [];
    const paden = Array.isArray(gekozen) ? gekozen : [gekozen];
    return Promise.all(paden.map(async (pad) => ({ naam: pad.split(/[\\/]/).pop() ?? pad, bytes: await readFile(pad) })));
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    if (extensies) input.accept = extensies.map((e) => `.${e}`).join(",");
    input.onchange = () => {
      Promise.all([...(input.files ?? [])].map(async (f) => ({ naam: f.name, bytes: new Uint8Array(await f.arrayBuffer()) })))
        .then(resolve)
        .catch(reject);
    };
    input.oncancel = () => resolve([]);
    input.click();
  });
}

/** Voegt gekozen bestanden samen tot de lijst van een werkmap; een ZIP is een hele werkmap. */
function samenvoegen(gekozen: { naam: string; bytes: Uint8Array }[], bestaand: WerkmapBestand[]): WerkmapBestand[] {
  const lijst = new Map(bestaand.map((b) => [b.pad, b]));
  for (const { naam, bytes } of gekozen) {
    if (/\.zip$/i.test(naam)) {
      for (const b of pakWerkmapUit(bytes)) lijst.set(b.pad, b);
    } else {
      lijst.set(naam, { pad: naam, bytes });
    }
  }
  return [...lijst.values()];
}

/**
 * Bestaande notebooks en scripts als nieuw blad. Zonder notebook komt er een bij
 * met de startcel, zodat er iets is om de scripts vanuit te gebruiken.
 */
export async function voegNotebookToe(voegToe: (naam: string, jupyter: JupyterWerkmap) => string): Promise<void> {
  try {
    const gekozen = await kiesBestanden(["ipynb", "py", "zip"]);
    if (gekozen.length === 0) return;
    let bestanden = samenvoegen(gekozen, []);
    if (notebooksIn(bestanden).length === 0) bestanden = [startBestand(), ...bestanden];
    const eerste = gekozen[0].naam;
    voegToe(bladnaamVoorNotebook(eerste), await naarWerkmap(bestanden, eerste));
  } catch (err) {
    console.error("Notebook inlezen mislukt:", err);
    alert(i18next.t("werkruimte:jupyter.lezenMislukt", { fout: (err as Error)?.message ?? String(err) }));
  }
}

/** Kiest bestanden voor een bestaand blad: elke soort, ook databestanden. Geeft de nieuwe lijst. */
export async function kiesExtraBestanden(werkmap: JupyterWerkmap | undefined): Promise<WerkmapBestand[] | null> {
  const gekozen = await kiesBestanden(null);
  if (gekozen.length === 0) return null;
  return samenvoegen(gekozen, werkmap ? pakWerkmapUit(uitBase64(werkmap.data)) : []);
}

/** Schrijft de werkmap weg als los ZIP-bestand. */
export async function exporteerJupyter(naam: string, werkmap: JupyterWerkmap): Promise<void> {
  const bestand = `${naam.replace(/[\\/:*?"<>|]+/g, "-").trim() || "Jupyter"}.zip`;
  const bytes = uitBase64(werkmap.data);
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const pad = await save({
      defaultPath: bestand,
      filters: [{ name: i18next.t("werkruimte:jupyter.filterZip"), extensions: ["zip"] }],
    });
    if (pad) await writeFile(pad, bytes);
    return;
  }
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = bestand;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** De grootte van een werkmap, voor in de kop van het paneel. */
export function jupyterGrootte(werkmap: JupyterWerkmap): string {
  return grootteTekst(base64Bytes(werkmap.data), i18next.language);
}
