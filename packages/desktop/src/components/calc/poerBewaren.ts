import i18next from "i18next";

/*
 * Een tekstbestand van het blad bewaren, zoals het DXF-detail van een poer: in de app
 * via de bewaardialoog van het systeem, in de browser met de bestandskiezer als die er is,
 * anders als download. Dezelfde weg als ifcxBewaren.ts.
 */

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Een bestandsnaam zonder tekens die een bestandssysteem weigert. */
export const veiligeBestandsnaam = (naam: string, standaard: string) => naam.replace(/[\\/:*?"<>|]+/g, " ").trim() || standaard;

type MetBestandsKiezer = Window & {
  showSaveFilePicker?: (opties?: object) => Promise<FileSystemFileHandle>;
};

export async function bewaarTekstBestand(inhoud: string, bestand: string, soort: { naam: string; extensie: string; mime: string }): Promise<void> {
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const pad = await save({
      title: soort.naam,
      defaultPath: bestand,
      filters: [{ name: soort.naam, extensions: [soort.extensie] }, { name: i18next.t("beelden:poerDetail.alleBestanden"), extensions: ["*"] }],
    });
    if (pad) await writeTextFile(pad, inhoud);
    return;
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
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) throw err;
    }
    return;
  }

  const url = URL.createObjectURL(new Blob([inhoud], { type: soort.mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = bestand;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
