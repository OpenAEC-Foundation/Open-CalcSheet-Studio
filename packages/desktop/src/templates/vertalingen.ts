import {
  bronNaBewerking,
  uitvoerBron,
  vertaalTerug,
  vertaalVoorCode,
  type BladVertaling,
  type UitvoerBron,
} from "../components/calc/uitvoerTaal.ts";
import { balklaagEn } from "./balklaag.en.ts";
import { rekentaalDemoEn } from "./rekentaal-demo.en.ts";
import { doorsnedeSpanningenEn } from "./doorsnede-spanningen.en.ts";
import { liggerEn } from "./ligger.en.ts";
import { tweepaalspoerEn } from "./tweepaalspoer.en.ts";

export { bronNaBewerking };

/**
 * Welke vertaling hoort bij een bladtekst. De koppeling loopt via de kop van het blad,
 * net als bij de parametrische beelden (designerKeuze.tsx). De bron is Nederlands: in
 * die taal is er niets te vertalen.
 */
const ENGELS: BladVertaling[] = [liggerEn, balklaagEn, tweepaalspoerEn, doorsnedeSpanningenEn, rekentaalDemoEn];

const inNederlands = (taal: string | undefined) => !taal || taal.startsWith("nl");

/** De tabel van dit blad, ook als de kop in de tab Code is aangepast. */
function tabelVan(bron: string): BladVertaling | null {
  return ENGELS.find((v) => bron.includes(v.marker) || bron.includes(v.markerVertaald)) ?? null;
}

export function vertalingVoor(bron: string, taal: string | undefined): BladVertaling | null {
  return inNederlands(taal) ? null : tabelVan(bron);
}

/** De tabel als dit blad helemaal vertaald is: het heeft de vertaalde kop, en niet de kop van de bron. */
function helemaalVertaald(bron: string): BladVertaling | null {
  return ENGELS.find((v) => bron.includes(v.markerVertaald) && !bron.includes(v.kenmerkBron ?? v.marker)) ?? null;
}

/**
 * De tekst om door te rekenen voor de uitvoer in deze taal, met de weergavenamen. In de
 * taal van de bron blijft een gewoon blad precies zoals het is.
 */
export function bronVoorUitvoer(bron: string, taal: string | undefined): UitvoerBron {
  if (inNederlands(taal)) {
    const v = helemaalVertaald(bron);
    return { bron: v ? vertaalTerug(bron, v) : bron };
  }
  return uitvoerBron(bron, vertalingVoor(bron, taal), "en");
}

/**
 * De bladtekst zoals de tab Code hem in deze taal toont. De bron zelf verandert niet: de
 * rekenversie, Bladen bijwerken, de invoer en de beelden blijven die lezen.
 */
export function codeInTaal(bron: string, taal: string | undefined): string {
  if (inNederlands(taal)) {
    const v = helemaalVertaald(bron);
    return v ? vertaalTerug(bron, v) : bron;
  }
  const v = tabelVan(bron);
  return v ? vertaalVoorCode(bron, v) : bron;
}

export { hoortBij } from "./hoortBij.ts";

/** De naam zoals hij in de uitvoer staat, voor wat een beeld over een invoer zegt. */
export function weergaveNaamVoor(bron: string, taal: string | undefined, naam: string): string {
  return vertalingVoor(bron, taal)?.namen[naam] ?? naam;
}
