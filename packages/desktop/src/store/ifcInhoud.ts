import { create } from "zustand";

/**
 * De IFC van het project (IFCX en STEP) zoals de IFC-weergave hem toont, zodat
 * het lint (tab IFC) hem kan exporteren of kopiëren. IfcViewerPanel vult hem;
 * buiten de IFC-weergave is hij leeg.
 */
export const useIfcInhoud = create<{ step: string; ifcx: string }>(() => ({ step: "", ifcx: "" }));

/** Een tekst als bestand opslaan via de browser (in Tauri: de downloadmap). */
export function bewaarAls(inhoud: string, naam: string, type: string) {
  const url = URL.createObjectURL(new Blob([inhoud], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = naam;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Naar het klembord, met de oude weg als terugval. */
export async function kopieer(inhoud: string) {
  try {
    await navigator.clipboard.writeText(inhoud);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = inhoud;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
  }
}
