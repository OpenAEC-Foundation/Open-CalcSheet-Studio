/**
 * Van de bytes van een bron naar de tekst van een gekoppeld blad, per soort
 * (store/koppeling.ts). Het openen van een werkmap komt van buiten: in de app de
 * rekenkern in de browser, in scripts/check-gekoppelde-bestanden.mjs dezelfde
 * rekenkern in Node.
 */
import type { Omzetter } from "./koppeling.ts";
import { lijktOpRtf, rtfNaarMarkdown } from "./rtfLezer.ts";
import { bereikNaarMarkdown, leesBereik, type BereikLezer } from "./werkmapBereik.ts";

/** Een geopende werkmap; `sluit` geeft het geheugen van de rekenkern vrij. */
export interface OpenWerkmap extends BereikLezer {
  sluit(): void;
}

/** Begint de inhoud als een ZIP-pakket, zoals elk XLSX-bestand? */
function lijktOpZip(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export function maakOmzetter(openWerkmap: (bytes: Uint8Array) => Promise<OpenWerkmap>): Omzetter {
  return async (bytes, k) => {
    if (k.soort === "rtf") {
      if (!lijktOpRtf(bytes)) return { ok: false, reden: "geenRtf" };
      const r = rtfNaarMarkdown(bytes);
      return { ok: true, tekst: r.tekst, beelden: r.beelden, meldingen: r.meldingen };
    }
    if (!lijktOpZip(bytes)) return { ok: false, reden: "geenWerkmap" };
    let wb: OpenWerkmap;
    try {
      wb = await openWerkmap(bytes);
    } catch (err) {
      return { ok: false, reden: "leesFout", detail: (err as Error)?.message };
    }
    try {
      const bereik = leesBereik(wb, k.verwijzing ?? "");
      if (!bereik.ok) return { ok: false, reden: bereik.reden, detail: bereik.detail };
      return { ok: true, tekst: bereikNaarMarkdown(bereik) };
    } finally {
      wb.sluit();
    }
  };
}
