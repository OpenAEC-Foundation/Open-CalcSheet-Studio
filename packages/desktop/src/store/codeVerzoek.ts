import { create } from "zustand";
import type { EditorView } from "@codemirror/view";
import { useProjectStore } from "./projectStore";
import { useEditorViewStore } from "./editorViewStore";

/**
 * Het lint vraagt de werkruimte om de code van het open blad in beeld te
 * zetten: de tab CalcPAD staat er altijd, ook als de werkruimte Visueel +
 * Uitwerking of de IFC-weergave toont. App.tsx luistert naar de teller.
 */
export const useCodeVerzoek = create<{ teller: number }>(() => ({ teller: 0 }));

/** Is er een rekenblad open (niet de projectgegevens of het rapport)? */
export const bladOpen = (s = useProjectStore.getState()) => s.exemplaren.some((e) => e.id === s.activeId);

/** Vraag de code in beeld; false als er geen blad open is. */
export function vraagCode(): boolean {
  if (!bladOpen()) return false;
  useCodeVerzoek.setState((s) => ({ teller: s.teller + 1 }));
  return true;
}

/**
 * Doe iets met de editor zodra die er is: meteen als de code al in beeld staat,
 * anders nadat de werkruimte hem heeft getoond.
 */
export function metEditor(doe: (view: EditorView) => void) {
  const view = useEditorViewStore.getState().view;
  if (view) return doe(view);
  if (!vraagCode()) return;
  const stop = useEditorViewStore.subscribe((s) => {
    if (!s.view) return;
    stop();
    clearTimeout(opgeven);
    // Eén beeld later: de editor heeft dan zijn inhoud en maat.
    requestAnimationFrame(() => doe(s.view!));
  });
  const opgeven = setTimeout(stop, 4000);
}
