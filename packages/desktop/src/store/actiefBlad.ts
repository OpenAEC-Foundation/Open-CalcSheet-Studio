import { createContext, useContext, useMemo } from "react";
import { useProjectStore, type Exemplaar } from "./projectStore";
import { projectScope } from "./projectGegevens";

/**
 * Kleine haakjes rond het actieve rekenblad.
 *
 * De editor, de uitwerking en de designers hoeven niet te weten dát een project
 * uit exemplaren bestaat — ze werken met "de tekst" en "de waarden" van het
 * blad dat openstaat. Alles wat ze schrijven landt in het actieve exemplaar en
 * nergens anders; dat is de hele reden dat twee balklagen elkaar niet meer
 * kunnen overschrijven.
 */

const LEEG: Record<string, string> = {};

/** Tekst van het actieve blad (leeg als er geen blad open is). */
export function useActieveBron(): string {
  return useProjectStore((s) => s.exemplaren.find((e) => e.id === s.activeId)?.source ?? "");
}

/** Schrijft de tekst van het actieve blad terug. */
export function useZetActieveBron(): (source: string) => void {
  const activeId = useProjectStore((s) => s.activeId);
  const zetBron = useProjectStore((s) => s.zetBron);
  return useMemo(() => (source: string) => zetBron(activeId, source), [activeId, zetBron]);
}

/** Invoerwaarden van het actieve blad. */
export function useActieveWaarden(): Record<string, string> {
  return useProjectStore((s) => s.exemplaren.find((e) => e.id === s.activeId)?.waarden ?? LEEG);
}

/** Schrijft één invoerwaarde naar het actieve blad. */
export function useZetActieveWaarde(): (naam: string, waarde: string) => void {
  const activeId = useProjectStore((s) => s.activeId);
  const zetWaarde = useProjectStore((s) => s.zetWaarde);
  return useMemo(
    () => (naam: string, waarde: string) => zetWaarde(activeId, naam, waarde),
    [activeId, zetWaarde],
  );
}

/**
 * De projectvariabelen voor de evaluator. Gememoïseerd op de gegevens zelf,
 * zodat de uitwerking niet bij elke render opnieuw gerenderd wordt.
 */
export function useProjectScope(): Record<string, unknown> {
  const gegevens = useProjectStore((s) => s.gegevens);
  return useMemo(() => projectScope(gegevens), [gegevens]);
}

/**
 * Een numeriek keuzeveld uit de projectgegevens (windgebied, terreincategorie,
 * ontwerplevensduur, ...). Voor grootheden die van de locatie of het project
 * afhangen en niet van het constructiedeel.
 */
export function useProjectGetal(naam: string, standaard: number): number {
  const ruw = useProjectStore((s) => s.gegevens[naam]);
  const n = parseFloat(ruw ?? "");
  return Number.isFinite(n) ? n : standaard;
}

/**
 * Overschrijft welk blad de designers tekenen.
 *
 * Normaal tekent een designer het blad dat openstaat. De afdrukweergave heeft
 * ze alle tegelijk nodig — elk blad met zijn eigen beeld — en zet daarvoor per
 * blad deze context. `alleenLezen` houdt daarbij het schrijven tegen: een
 * afdruk hoort niets aan je project te veranderen, ook geen standaardwaarden
 * aan te vullen.
 */
export interface BladContext {
  exemplaar: Exemplaar;
  alleenLezen: boolean;
}

export const ExemplaarContext = createContext<BladContext | null>(null);

/** Het blad dat getekend moet worden: uit de context, anders het actieve. */
export function useActiefExemplaar(): Exemplaar | undefined {
  const uitContext = useContext(ExemplaarContext);
  const uitStore = useProjectStore((s) => s.exemplaren.find((e) => e.id === s.activeId));
  return uitContext?.exemplaar ?? uitStore;
}

/** true zolang de designer alleen getekend wordt, niet bediend. */
export function useAlleenLezen(): boolean {
  return useContext(ExemplaarContext)?.alleenLezen ?? false;
}
