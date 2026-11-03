import { useCallback } from "react";
import { useProjectStore } from "../store/projectStore";
import { bouwProjectBestand, leesProjectBestand, PROJECT_FORMAAT_VERSIE } from "../store/projectBestand";
import { bladenVoorIfc } from "../store/projectIfcx";
import { bewaarOpenWerkmappen } from "../store/spreadsheetBlad";
import {
  openCalculationFile,
  saveCalculationFile,
  schrijfCalculationFile,
  kanDirectOpslaan,
} from "../tauri/fileOps";
import i18next from "../i18n/config";
import { useRecentFiles } from "./useRecentFiles";

/**
 * Meldingen in de taal van de app, opgezocht op het moment van melden. Geen
 * useTranslation: App roept deze hook aan, en een extra hook hierin verandert
 * de hookvolgorde van App.
 */
const melding = (sleutel: string, fout?: unknown) =>
  i18next.t(`werkruimte:bestand.${sleutel}`, { fout: (fout as Error | undefined)?.message });

/**
 * Het project zoals het op schijf komt: zuiver IFCX, met het héle project in één
 * document, want binnen het OpenAEC-ecosysteem is IFCX de drager waarmee de
 * gereedschappen data uitwisselen. Elk blad wordt doorgerekend voor de uitkomsten
 * in het bestand (store/projectIfcx.ts); een blad dat omvalt blijft erin staan.
 */
export function projectInhoud(): string {
  const { projectNaam, gegevens, exemplaren, rapport, verborgen } = useProjectStore.getState();
  return bouwProjectBestand(
    { versie: PROJECT_FORMAAT_VERSIE, naam: projectNaam, gegevens, exemplaren, rapport, verborgen: Object.keys(verborgen).length ? verborgen : undefined },
    bladenVoorIfc({ exemplaren, gegevens }),
  );
}

function bestandsnaam(pad: string): string {
  return (pad.split(/[/\\]/).pop() ?? pad).replace(/\.[^.]+$/, "");
}

/**
 * Nieuw, openen, opslaan en opslaan als — één set acties voor het lint, het
 * Bestand-menu en de sneltoetsen, zodat die drie niet uit elkaar lopen.
 */
export function useBestandActies() {
  const { addRecentFile } = useRecentFiles();

  const onthoud = useCallback(
    (pad: string) =>
      addRecentFile({ path: pad, name: bestandsnaam(pad), type: "report", timestamp: Date.now() }),
    [addRecentFile],
  );

  const nieuw = useCallback(() => {
    if (useProjectStore.getState().dirty) {
      const ok = confirm(melding("wijzigingenWeggooien"));
      if (!ok) return;
    }
    useProjectStore.getState().nieuwProject();
  }, []);

  const openen = useCallback(async () => {
    try {
      const file = await openCalculationFile();
      if (!file) return;
      const store = useProjectStore.getState();
      store.laadProject(leesProjectBestand(file.raw, file.name));
      store.markeerOpgeslagen(file.path);
      await onthoud(file.path);
    } catch (err) {
      console.error("Open file failed:", err);
      alert(melding("openenMislukt", err));
    }
  }, [onthoud]);

  /** Altijd met de dialoog: een nieuwe naam of een andere map. */
  const opslaanAls = useCallback(async () => {
    try {
      await bewaarOpenWerkmappen();
      const { projectNaam, bestandspad } = useProjectStore.getState();
      const pad = await saveCalculationFile(projectInhoud(), projectNaam, bestandspad);
      if (!pad) return;
      useProjectStore.getState().markeerOpgeslagen(pad);
      await onthoud(pad);
    } catch (err) {
      console.error("Save file failed:", err);
      alert(melding("opslaanMislukt", err));
    }
  }, [onthoud]);

  /**
   * Over het geopende bestand heen. Is er nog geen bestand, of een ouder
   * formaat dat je niet ongemerkt wilt overschrijven, dan wordt het
   * "opslaan als".
   */
  const opslaan = useCallback(async () => {
    const pad = useProjectStore.getState().bestandspad;
    if (!kanDirectOpslaan(pad)) return opslaanAls();
    try {
      await bewaarOpenWerkmappen();
      await schrijfCalculationFile(pad, projectInhoud());
      useProjectStore.getState().markeerOpgeslagen(pad);
    } catch (err) {
      console.error("Save file failed:", err);
      alert(melding("opslaanMislukt", err));
    }
  }, [opslaanAls]);

  return { nieuw, openen, opslaan, opslaanAls };
}
