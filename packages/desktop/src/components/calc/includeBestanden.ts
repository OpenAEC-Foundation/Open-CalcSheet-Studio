import type { IncludeStaat } from "@ifc-calc/core";
import { useProjectStore, type Exemplaar } from "../../store/projectStore";
import { heeftInclude, includeTabel, leesIncludes, zelfdeKopieen, type IncludeToegang } from "../../store/includes";
import { ingebouwdeIncludes, zetProjectIncludes } from "../../templates/rekentaal-includes";
import { isTauri } from "./koppelingen";

/*
 * `#include` van een `.cpd`-bestand op schijf, in de app. Wat een ingevoegd bestand
 * ís en hoe het gelezen wordt, staat in store/includes.ts.
 *
 * De wachter van de gekoppelde bestanden (koppelingen.ts) roept `controleerIncludes`
 * aan: bij het openen van een project, bij focus van het venster, vóór het
 * afdrukvoorbeeld en het afdrukken, en in de app elke twee seconden. Die leest per
 * rekenblad met een `#include` de bestanden opnieuw en legt een nieuwe kopie bij het
 * blad vast als de bytes veranderd zijn.
 *
 * De tabel voor het inlezen (templates/rekentaal-includes.ts) volgt de bladen: bij elke
 * wijziging van de bladen komen de kopieën er meteen in, zodat een geopend project ook
 * vóór de eerste lezing rekent met wat het bewaarde.
 */

/** Het bestandssysteem via Tauri: de bytes, of null als het bestand er niet is. */
const tauriToegang: IncludeToegang = {
  async lees(pad) {
    // Dezelfde rechten als de gekoppelde bestanden (koppelingen.ts): stat en readFile.
    const { stat, readFile } = await import("@tauri-apps/plugin-fs");
    try {
      if (!(await stat(pad)).isFile) return null;
      return await readFile(pad);
    } catch {
      return null;
    }
  },
};

/** Per blad de stand van zijn bestanden, van de laatste controle. Alleen in het geheugen. */
const staatPerBlad = new Map<string, Record<string, IncludeStaat>>();

/** Zet de tabel voor het inlezen gelijk aan de kopieën van de bladen en de laatste stand. */
export function werkIncludeTabelBij(exemplaren: readonly Exemplaar[] = useProjectStore.getState().exemplaren): void {
  const ids = new Set(exemplaren.map((e) => e.id));
  for (const id of [...staatPerBlad.keys()]) if (!ids.has(id)) staatPerBlad.delete(id);
  const staat = new Map<string, IncludeStaat>();
  for (const per of staatPerBlad.values()) for (const [k, v] of Object.entries(per)) if (!staat.has(k)) staat.set(k, v);
  zetProjectIncludes(includeTabel(ingebouwdeIncludes, exemplaren), staat);
}

/** Leest de `#include`-bestanden van alle rekenbladen opnieuw (store/includes.ts). */
export async function controleerIncludes(): Promise<void> {
  const toegang = isTauri() ? tauriToegang : null;
  for (const blad of useProjectStore.getState().exemplaren) {
    if (!heeftInclude(blad.source)) {
      staatPerBlad.delete(blad.id);
      // Geen #include meer: de kopieën horen niet meer bij het blad.
      if (blad.includes?.length) useProjectStore.getState().zetIncludes(blad.id, [], true);
      continue;
    }
    const projectPad = useProjectStore.getState().bestandspad;
    const gelezen = await leesIncludes(blad.source, { basis: ingebouwdeIncludes, vorige: blad.includes, projectPad, toegang });
    // Het blad kan intussen weg of anders zijn; dan telt deze lezing niet.
    const nu = useProjectStore.getState().exemplaren.find((e) => e.id === blad.id);
    if (!nu || nu.source !== blad.source || nu.includes !== blad.includes) continue;
    staatPerBlad.set(blad.id, gelezen.staat);
    if (!zelfdeKopieen(blad.includes, gelezen.kopieen)) {
      const inhoud = !zelfdeKopieen(
        (blad.includes ?? []).map((k) => ({ ...k, gelezenOp: "", pad: "" })),
        gelezen.kopieen.map((k) => ({ ...k, gelezenOp: "", pad: "" })),
      );
      useProjectStore.getState().zetIncludes(blad.id, gelezen.kopieen, inhoud);
    }
  }
  werkIncludeTabelBij();
}

/** De sleutel voor de wachter: welke bladen welke `#include`-regels hebben. */
export function includeBewaakSleutel(exemplaren: readonly Exemplaar[]): string {
  return exemplaren
    .filter((e) => heeftInclude(e.source))
    .map((e) => `${e.id}|${(e.source.match(/^[ \t]*#include\s+\S+/gm) ?? []).join(",")}`)
    .join("\n");
}
