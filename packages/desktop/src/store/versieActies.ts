import i18next from "../i18n/config";
import { vergeetBladResultaten } from "../rekenen/doorrekening";
import { useInhoudPaginas } from "./inhoudPaginas";
import { useProjectStore } from "./projectStore";
import { bewaarOpenWerkmappen } from "./spreadsheetBlad";
import type { VersieMelding } from "./versies";

/**
 * De knoppen van de versies: wisselen en een nieuwe versie maken. De regels zelf staan in
 * store/versies.ts; hier staat wat er met de open app omheen moet gebeuren.
 *
 * Eerst bewaren wat nog openstaat, in de versie waar het getypt is. Een veld legt vast als het de focus
 * verliest, een PDF-aantekening net daarna (setTimeout in PdfBladWeergave), en een open werkmap of
 * notebook meldt zich met registreerBewaarder. Pas daarna wisselt de stand; zo komt een laatste
 * wijziging niet in de verkeerde versie terecht.
 */
async function bewaarWatOpenStaat(): Promise<void> {
  const open = document.activeElement;
  if (open instanceof HTMLElement && open !== document.body) open.blur();
  await new Promise((klaar) => setTimeout(klaar, 0));
  await bewaarOpenWerkmappen();
}

/**
 * Wat bij de vorige versie hoorde en los van de stand wordt bewaard: de paginanummers uit het laatste
 * afdrukvoorbeeld en de UC's in de projectboom. Beide komen vanzelf terug als er is gerekend.
 */
function vergeetAfgeleid(): void {
  useInhoudPaginas.setState({ paginas: {} });
  vergeetBladResultaten();
}

/** Naar een andere versie, zonder iets te verliezen. */
export async function wisselNaarVersie(id: string): Promise<void> {
  if (id === useProjectStore.getState().versies.actief) return;
  await bewaarWatOpenStaat();
  useProjectStore.getState().wisselVersie(id);
  vergeetAfgeleid();
}

/** Een nieuwe versie uit de huidige stand; die staat daarna open. */
export async function maakNieuweVersie(opties: { naam?: string; omschrijving?: string } = {}): Promise<void> {
  await bewaarWatOpenStaat();
  useProjectStore.getState().maakVersie(opties);
}

/** Wat er aan de versies in een geopend bestand niet klopte. De actieve versie staat dan gewoon open. */
export function meldVersieProblemen(gelezen: { versieMeldingen?: VersieMelding[] }): void {
  const meldingen = gelezen.versieMeldingen;
  if (!meldingen || meldingen.length === 0) return;
  const regels = meldingen.map((m) => i18next.t(`werkruimte:versies.meldingen.${m.soort}`, { code: m.code ?? "?", count: m.aantal ?? 1 }));
  alert([i18next.t("werkruimte:versies.meldingen.kop"), ...regels].join("\n"));
}
