import { useCallback, useEffect, useLayoutEffect, useState, type RefObject } from "react";
import { pxPerMm } from "./paginering";

/** Gemeten breedte en hoogte per eenheid van een canvas-blad, in millimeter. */
export type EenheidMaten = Record<string, { b: number; h: number }>;

/**
 * Meet de eenheden (`data-eenheid`) in de wortel, na elke render en als hun maat
 * verandert: een letter of afbeelding die later binnenkomt, verandert de hoogte.
 * Gedeeld door het canvas (CanvasBladWeergave.tsx) en de uitdraai (CanvasVellen
 * in PrintBlad.tsx).
 */
export function useEenheidMaten(wortel: RefObject<HTMLElement | null>): EenheidMaten {
  const [maten, zetMaten] = useState<EenheidMaten>({});
  const meet = useCallback(() => {
    const el = wortel.current;
    if (!el) return;
    const mm = pxPerMm();
    const nieuw: EenheidMaten = {};
    el.querySelectorAll<HTMLElement>("[data-eenheid]").forEach((e) => {
      nieuw[e.dataset.eenheid!] = { b: Math.max(e.offsetWidth, e.scrollWidth) / mm, h: e.offsetHeight / mm };
    });
    zetMaten((oud) => {
      const sleutels = Object.keys(nieuw);
      const gelijk = sleutels.length === Object.keys(oud).length && sleutels.every((k) => (
        oud[k] && Math.abs(oud[k].b - nieuw[k].b) < 0.05 && Math.abs(oud[k].h - nieuw[k].h) < 0.05
      ));
      return gelijk ? oud : nieuw;
    });
  }, [wortel]);
  useLayoutEffect(meet);
  useEffect(() => {
    const el = wortel.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(meet);
    el.querySelectorAll("[data-eenheid]").forEach((e) => ro.observe(e));
    return () => ro.disconnect();
  });
  return maten;
}
