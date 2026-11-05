import { BIBLIOTHEEK_EXTENSIE } from "./gewichtenBibliotheek";

/**
 * Een gewichtenbibliotheek kiezen en wegschrijven, op dezelfde manier als de andere bestanden in
 * de app (tauri/fileOps.ts): in de app de dialogen van Tauri, in de browser de bestandskiezer van
 * het systeem en anders een <input type=file> of een downloadlink. Wat er in het bestand staat,
 * controleert gewichtenBibliotheek.ts.
 */

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

type MetBestandsKiezer = Window & {
  showOpenFilePicker?: (opties?: object) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (opties?: object) => Promise<FileSystemFileHandle>;
};

const geannuleerd = (err: unknown) => err instanceof DOMException && err.name === "AbortError";

/** De teksten van de dialoog; die komen uit de vertaalbestanden van de aanroeper. */
export interface Dialoogtekst {
  titel: string;
  filter: string;
}

const EXTENSIES = [BIBLIOTHEEK_EXTENSIE, "json"];
const BROWSER_TYPE = (filter: string) => [{ description: filter, accept: { "application/json": [`.${BIBLIOTHEEK_EXTENSIE}`, ".json"] } }];

export function veiligeBestandsnaam(naam: string): string {
  return `${naam.replace(/[\\/:*?"<>|]+/g, " ").trim() || "weights"}.${BIBLIOTHEEK_EXTENSIE}`;
}

/** Kiest een bestand en geeft de tekst, of null als de gebruiker annuleert. */
export async function kiesBibliotheekBestand(tekst: Dialoogtekst): Promise<string | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const pad = await open({
      title: tekst.titel,
      multiple: false,
      directory: false,
      filters: [{ name: tekst.filter, extensions: EXTENSIES }],
    });
    if (!pad || typeof pad !== "string") return null;
    return readTextFile(pad);
  }

  const kies = (window as MetBestandsKiezer).showOpenFilePicker;
  if (kies) {
    try {
      const [handle] = await kies.call(window, { types: BROWSER_TYPE(tekst.filter), excludeAcceptAllOption: false });
      return handle ? await (await handle.getFile()).text() : null;
    } catch (err) {
      if (geannuleerd(err)) return null;
      throw err;
    }
  }

  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `.${BIBLIOTHEEK_EXTENSIE},.json`;
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      f.text().then(resolve).catch(reject);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Schrijft de tekst weg via een dialoog. Geeft false als de gebruiker annuleert. */
export async function bewaarBibliotheekBestand(inhoud: string, naam: string, tekst: Dialoogtekst): Promise<boolean> {
  const bestand = veiligeBestandsnaam(naam);
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const pad = await save({
      title: tekst.titel,
      defaultPath: bestand,
      filters: [{ name: tekst.filter, extensions: [BIBLIOTHEEK_EXTENSIE] }],
    });
    if (!pad) return false;
    await writeTextFile(pad, inhoud);
    return true;
  }

  const kies = (window as MetBestandsKiezer).showSaveFilePicker;
  if (kies) {
    try {
      const handle = await kies.call(window, { suggestedName: bestand, types: BROWSER_TYPE(tekst.filter) });
      const schrijf = await handle.createWritable();
      await schrijf.write(inhoud);
      await schrijf.close();
      return true;
    } catch (err) {
      if (geannuleerd(err)) return false;
      throw err;
    }
  }

  const url = URL.createObjectURL(new Blob([inhoud], { type: "application/json;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = bestand;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
}

/** Een bronadres openen: buiten de app, want de pagina hoort niet in het venster van de app. */
export async function openBron(url: string): Promise<void> {
  if (isTauri()) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
