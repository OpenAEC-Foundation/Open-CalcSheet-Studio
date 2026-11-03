import { uitvoerBron, type BladVertaling, type UitvoerBron } from "../components/calc/uitvoerTaal.ts";
import { balklaagEn } from "./balklaag.en.ts";
import { calcpadDemoEn } from "./calcpad-demo.en.ts";
import { liggerEn } from "./ligger.en.ts";

/**
 * Welke vertaling hoort bij een bladtekst. De koppeling loopt via de kop van het blad,
 * net als bij de parametrische beelden (designerKeuze.tsx). De bron is Nederlands: in
 * die taal is er niets te vertalen.
 */
const ENGELS: BladVertaling[] = [liggerEn, balklaagEn, calcpadDemoEn];

export function vertalingVoor(bron: string, taal: string | undefined): BladVertaling | null {
  if (!taal || taal.startsWith("nl")) return null;
  return ENGELS.find((v) => bron.includes(v.marker)) ?? null;
}

/** De tekst om door te rekenen voor de uitvoer in deze taal, met de weergavenamen. */
export function bronVoorUitvoer(bron: string, taal: string | undefined): UitvoerBron {
  return uitvoerBron(bron, vertalingVoor(bron, taal), "en");
}

/** De naam zoals hij in de uitvoer staat, voor wat een beeld over een invoer zegt. */
export function weergaveNaamVoor(bron: string, taal: string | undefined, naam: string): string {
  return vertalingVoor(bron, taal)?.namen[naam] ?? naam;
}
