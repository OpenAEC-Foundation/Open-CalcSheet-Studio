import i18next from "i18next";
/**
 * Het IFCX los bewaren (knop "IFCX opslaan" bij het 3D-beeld). De kop krijgt het
 * tijdstip van bewaren, en de paden worden afgeleid van het blad: in de uitwerking
 * zijn ze voor elk blad gelijk, en twee bewaarde bladen mogen elkaars knopen niet
 * overschrijven als ze samen worden ingelezen.
 */
import { ifcxVoorBlad, type IfcxBestand } from "@ifc-calc/core";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const veiligeNaam = (naam: string) => naam.replace(/[\\/:*?"<>|]+/g, " ").trim() || "balklaag";

type MetBestandsKiezer = Window & {
  showSaveFilePicker?: (opties?: object) => Promise<FileSystemFileHandle>;
};

export async function bewaarIfcx(json: string, naam: string, blad: string | undefined): Promise<void> {
  const bron = JSON.parse(json) as IfcxBestand;
  const document_ = blad ? ifcxVoorBlad(bron, blad) : bron;
  const inhoud = JSON.stringify({
    ...document_,
    header: { ...document_.header, id: `${veiligeNaam(naam)}.ifcx`, timestamp: new Date().toISOString() },
  }, null, 2);
  const bestand = `${veiligeNaam(naam)}.ifcx`;

  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeTextFile } = await import("@tauri-apps/plugin-fs");
    const pad = await save({
      title: i18next.t("werkruimte:ifcxBewaren.titel"),
      defaultPath: bestand,
      filters: [{ name: "IFCX", extensions: ["ifcx"] }, { name: i18next.t("werkruimte:ifcxBewaren.alleBestanden"), extensions: ["*"] }],
    });
    if (pad) await writeTextFile(pad, inhoud);
    return;
  }

  const kies = (window as MetBestandsKiezer).showSaveFilePicker;
  if (kies) {
    try {
      const handle = await kies.call(window, {
        suggestedName: bestand,
        types: [{ description: "IFCX", accept: { "application/json": [".ifcx"] } }],
      });
      const schrijf = await handle.createWritable();
      await schrijf.write(inhoud);
      await schrijf.close();
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) throw err;
    }
    return;
  }

  const url = URL.createObjectURL(new Blob([inhoud], { type: "application/json;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = bestand;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
