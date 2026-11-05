import { useMemo, type ReactNode } from "react";
import i18next from "i18next";
import { I18nextProvider, useTranslation } from "react-i18next";

/*
 * De taal van een uitdraai.
 *
 * Een losse uitdraai volgt de taal van de app, het rapport zijn eigen taal
 * (rapport.taal). Alles wat op papier komt en `useTranslation` gebruikt, zoals de
 * parametrische beelden en de bladsoorten, leest de taal uit de omgeving. Daarom zet
 * het rapport hier een eigen i18next-instantie om zijn inhoud heen: de teksten zijn
 * dezelfde, alleen de taal staat vast en wisselt niet mee met de app.
 */

export function AfdrukTaal({ taal, children }: { taal: string; children: ReactNode }) {
  const instantie = useMemo(() => i18next.cloneInstance({ lng: taal }), [taal]);
  return <I18nextProvider i18n={instantie}>{children}</I18nextProvider>;
}

/** De taal van de uitdraai waar dit onderdeel in staat; buiten het rapport die van de app. */
export function useAfdrukTaal(): string {
  return useTranslation().i18n.language;
}

/** Teksten op papier uit rapport.json (`pdfBlad`, `spreadsheetBlad`, …), in de taal van de uitdraai. */
export function usePapier() {
  const { i18n } = useTranslation();
  return i18n.getFixedT(i18n.language, "rapport");
}
