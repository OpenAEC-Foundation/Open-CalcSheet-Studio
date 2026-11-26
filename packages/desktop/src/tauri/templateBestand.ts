import i18next from "i18next";
import { TEMPLATE_EXTENSIE } from "../rapport/template";

/**
 * Een rapporttemplate openen en bewaren: de dialoog van Tauri, en in de browser de
 * File System Access API of anders een bestandskiezer en een download. Wat een template ís,
 * staat in rapport/template.ts. Opslaan gaat hier: er is geen "huidig" bestand om te overschrijven.
 */

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

type BestandsKiezer = Window & {
  showOpenFilePicker?: (options?: object) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: object) => Promise<FileSystemFileHandle>;
};

const geannuleerd = (err: unknown) => err instanceof DOMException && err.name === "AbortError";
const veiligeNaam = (naam: string) => naam.replace(/[\\/:*?"<>|]+/g, " ").trim() || "report";
const zonderExtensie = (naam: string) => naam.replace(/\.[^.\\/]+$/, "");
const filterNaam = () => i18next.t("rapport:opzet.filter");
const browserType = () => ({ description: filterNaam(), accept: { "application/json": [`.${TEMPLATE_EXTENSIE}`] } });

export interface GeopendTemplate {
  /** De bestandsnaam zonder extensie: de naam als het bestand er zelf geen noemt. */
  naam: string;
  raw: string;
}

/** Kiest een template; null als de gebruiker annuleert. */
export async function openTemplateBestand(): Promise<GeopendTemplate | null> {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const gekozen = await open({
      title: i18next.t("rapport:opzet.openenTitel"),
      multiple: false,
      directory: false,
      filters: [{ name: filterNaam(), extensions: [TEMPLATE_EXTENSIE] }],
    });
    if (!gekozen || typeof gekozen !== "string") return null;
    return { naam: zonderExtensie(gekozen.split(/[\\/]/).pop() ?? gekozen), raw: await readTextFile(gekozen) };
  }

  const kies = (window as BestandsKiezer).showOpenFilePicker;
  if (kies) {
    try {
      const [handle] = await kies.call(window, { types: [browserType()] });
      if (!handle) return null;
      return { naam: zonderExtensie(handle.name), raw: await (await handle.getFile()).text() };
    } catch (err) {
      if (geannuleerd(err)) return null;
      throw err;
    }
  }

  return new Promise((klaar, mis) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `.${TEMPLATE_EXTENSIE}`;
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return klaar(null);
      f.text().then((raw) => klaar({ naam: zonderExtensie(f.name), raw })).catch(mis);
    };
    input.oncancel = () => klaar(null);
    input.click();
  });
}

/** Schrijft een template weg onder een gekozen naam; geeft de bestandsnaam, of null als de gebruiker annuleert. */
export async function bewaarTemplateBestand(inhoud: string, naam: string): Promise<string | null> {
  const bestand = `${veiligeNaam(naam)}.${TEMPLATE_EXTENSIE}`;

  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const pad = await save({
      title: i18next.t("rapport:opzet.bewarenTitel"),
      defaultPath: bestand,
      filters: [{ name: filterNaam(), extensions: [TEMPLATE_EXTENSIE] }],
    });
    if (!pad) return null;
    await writeTextFile(pad, inhoud);
    return pad.split(/[\\/]/).pop() ?? pad;
  }

  const kies = (window as BestandsKiezer).showSaveFilePicker;
  if (kies) {
    try {
      const handle = await kies.call(window, { suggestedName: bestand, types: [browserType()] });
      const schrijf = await handle.createWritable();
      await schrijf.write(inhoud);
      await schrijf.close();
      return handle.name;
    } catch (err) {
      if (geannuleerd(err)) return null;
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
  return bestand;
}
