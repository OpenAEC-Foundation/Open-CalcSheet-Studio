/**
 * Waar een blad in het rapport komt: zijn paragraaf in het hoofdstuk Berekeningen en zijn
 * uitwerking in bijlage A, elk met de pagina's waarop ze staan.
 *
 * De nummers komen uit de inhoud van het zijpaneel (opzet.ts, inhoudVoorPaneel), de
 * pagina's uit het laatste afdrukvoorbeeld van het rapport (store/inhoudPaginas.ts). Een
 * stuk loopt tot de pagina vóór het volgende stuk op hetzelfde of een hoger niveau; het
 * laatste tot de laatste pagina. Begint het volgende stuk op dezelfde pagina, dan is het
 * één pagina.
 *
 * Puur en zonder React: de controlescripts laden dit bestand.
 */
import type { PaneelRegel } from "./opzet.ts";

/** Eén plek van een blad: een paragraaf of zijn uitwerking in de bijlage. */
export interface Plekstuk {
  nummer: string;
  titel: string;
  anker: string;
  /** In bijlage A (de uitwerking) of in een hoofdstuk. */
  bijlage: boolean;
  /** De eerste en de laatste pagina; ontbreekt zolang er geen voorbeeld is opgemaakt. */
  van?: number;
  tot?: number;
}

/**
 * De plekken van dit blad in het rapport, in de volgorde van het rapport; leeg als het blad
 * er niet in staat. `totaal` is het aantal pagina's, voor het laatste stuk.
 */
export function plekVanBlad(
  regels: readonly PaneelRegel[],
  bladId: string,
  paginas: Readonly<Record<string, number>> = {},
  totaal?: number,
): Plekstuk[] {
  const uit: Plekstuk[] = [];
  regels.forEach((r, i) => {
    if (r.bladId !== bladId) return;
    const stuk: Plekstuk = { nummer: r.nummer, titel: r.titel, anker: r.anker, bijlage: r.anker.startsWith("bijlage-blad-") };
    const van = paginas[r.anker];
    if (van !== undefined) {
      stuk.van = van;
      // Het volgende stuk op hetzelfde of een hoger niveau, met een pagina.
      const volgende = regels.slice(i + 1).find((v) => v.niveau <= r.niveau && paginas[v.anker] !== undefined);
      const eind = volgende ? paginas[volgende.anker] - 1 : totaal;
      stuk.tot = eind !== undefined && eind >= van ? eind : van;
    }
    uit.push(stuk);
  });
  return uit;
}

/** De pagina's van deze stukken, als set; voor het markeren van vellen. */
export function paginasVan(stukken: readonly Plekstuk[]): Set<number> {
  const uit = new Set<number>();
  for (const s of stukken) {
    if (s.van === undefined) continue;
    for (let p = s.van; p <= (s.tot ?? s.van); p++) uit.add(p);
  }
  return uit;
}
