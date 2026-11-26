import i18next from "i18next";

/**
 * Een tekstbestand bewaren dat de app zelf maakt (de export van de toetsregistratie): in de
 * app met het bestandsvenster, in de browser met de bestandskiezer, anders als download.
 * Zelfde weg als het los bewaren van een IFCX (ifcxBewaren.ts).
 */

type MetBestandsKiezer = Window & {
  showSaveFilePicker?: (opties?: object) => Promise<FileSystemFileHandle>;
};

export async function bewaarTekst(inhoud: string, bestand: string, soort: { naam: string; extensie: string; mime: string }): Promise<boolean> {
  if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const pad = await save({
      title: i18next.t("werkruimte:controle.exportTitel"),
      defaultPath: bestand,
      filters: [{ name: soort.naam, extensions: [soort.extensie] }],
    });
    if (!pad) return false;
    await writeTextFile(pad, inhoud);
    return true;
  }
  const kies = (window as MetBestandsKiezer).showSaveFilePicker;
  if (kies) {
    try {
      const handle = await kies.call(window, {
        suggestedName: bestand,
        types: [{ description: soort.naam, accept: { [soort.mime]: [`.${soort.extensie}`] } }],
      });
      const schrijf = await handle.createWritable();
      await schrijf.write(inhoud);
      await schrijf.close();
      return true;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return false;
      throw err;
    }
  }
  const url = URL.createObjectURL(new Blob([inhoud], { type: `${soort.mime};charset=utf-8` }));
  const a = document.createElement("a");
  a.href = url;
  a.download = bestand;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
}
