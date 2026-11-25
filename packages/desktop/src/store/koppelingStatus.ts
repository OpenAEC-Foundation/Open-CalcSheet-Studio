import { create } from "zustand";
import type { BronStaat } from "./koppeling";

/*
 * Hoe het nu met de bron van elk gekoppeld blad staat (store/koppeling.ts). Alleen
 * in het geheugen: het project bewaart de kopie en het moment van de laatste
 * lezing, niet of de bron er nu is.
 */

export type KoppelingStaat = BronStaat;

export interface KoppelingStand {
  staat: KoppelingStaat;
  /** Bij "fout": de reden, als sleutel onder `koppeling.reden` in rapport.json. */
  reden?: string;
  detail?: string;
  /** Wat bij de laatste lezing niet meeging, zoals een afbeelding in een ander formaat. */
  meldingen?: string[];
}

interface KoppelingStatusState {
  per: Record<string, KoppelingStand>;
  zet: (id: string, stand: KoppelingStand) => void;
  /** Zet meerdere bladen in één keer; wat gelijk is, blijft hetzelfde object. */
  zetVeel: (standen: Record<string, KoppelingStand>) => void;
}

const gelijk = (a: KoppelingStand | undefined, b: KoppelingStand) =>
  !!a && a.staat === b.staat && a.reden === b.reden && a.detail === b.detail && (a.meldingen ?? []).join() === (b.meldingen ?? []).join();

export const useKoppelingStatus = create<KoppelingStatusState>((set) => ({
  per: {},
  zet: (id, stand) => set((s) => (gelijk(s.per[id], stand) ? s : { per: { ...s.per, [id]: stand } })),
  zetVeel: (standen) =>
    set((s) => {
      const anders = Object.entries(standen).filter(([id, st]) => !gelijk(s.per[id], st));
      return anders.length === 0 ? s : { per: { ...s.per, ...Object.fromEntries(anders) } };
    }),
}));
