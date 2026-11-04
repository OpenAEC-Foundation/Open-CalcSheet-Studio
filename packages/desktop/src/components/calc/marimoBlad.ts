import { strFromU8, strToU8 } from "fflate";
import i18next from "../../i18n/config";
import { bladnaamVoorMarimo, isMarimoCode, marimoStartCode, MARIMO_MAX_TEKENS, type MarimoNotebook } from "../../store/marimoBlad";
import { kiesBestanden } from "./jupyterBlad";

/*
 * Marimo-bladen in de app: een nieuw blad, een notebook inlezen en wegschrijven. Wat een
 * Marimo-blad ís, staat in store/marimoBlad.ts.
 */

const isTauri = () => "__TAURI_INTERNALS__" in window;

/** Een nieuw blad met een notebook om mee te beginnen, achteraan het project. */
export function voegLeegMarimoToe(voegToe: (naam: string, marimo: MarimoNotebook) => string): void {
  const t = i18next.getFixedT(null, "werkruimte");
  const code = marimoStartCode({ kop: t("marimo.start.kop"), uitleg: t("marimo.start.uitleg") });
  voegToe(t("marimo.nieuweNaam"), { bestandsnaam: "", code, metCode: true, uitvoer: [] });
}

/** Een bestaand notebook (`.py`) als nieuw blad. */
export async function voegMarimoBestandToe(voegToe: (naam: string, marimo: MarimoNotebook) => string): Promise<void> {
  const t = i18next.getFixedT(null, "werkruimte");
  try {
    const gekozen = await kiesBestanden(["py"], t("marimo.filter"));
    if (gekozen.length === 0) return;
    for (const { naam, bytes } of gekozen) {
      const code = strFromU8(bytes);
      if (code.length > MARIMO_MAX_TEKENS) throw new Error(t("marimo.teGroot"));
      if (!isMarimoCode(code)) throw new Error(t("marimo.geenNotebook", { bestand: naam }));
      voegToe(bladnaamVoorMarimo(naam), { bestandsnaam: naam, code, metCode: true, uitvoer: [] });
    }
  } catch (err) {
    console.error("Marimo-notebook inlezen mislukt:", err);
    alert(t("marimo.lezenMislukt", { fout: (err as Error)?.message ?? String(err) }));
  }
}

/** Schrijft het notebook weg als los `.py`-bestand. */
export async function exporteerMarimo(naam: string, nb: MarimoNotebook): Promise<void> {
  const bestand = nb.bestandsnaam || `${naam.replace(/[\\/:*?"<>|]+/g, "-").trim() || "Marimo"}.py`;
  const bytes = strToU8(nb.code);
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const pad = await save({ defaultPath: bestand, filters: [{ name: i18next.t("werkruimte:marimo.filter"), extensions: ["py"] }] });
    if (pad) await writeFile(pad, bytes);
    return;
  }
  const url = URL.createObjectURL(new Blob([bytes as Uint8Array<ArrayBuffer>], { type: "text/x-python" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = bestand;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
