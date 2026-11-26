import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { inTaal } from "../../rapport/meertalig";
import type { Normkeuze, NormAfwijking } from "../../rapport/normen/keuze";
import { useBladNorm, useNormkeuze } from "../../store/actiefBlad";
import type { Exemplaar } from "../../store/projectStore";
import { usePapier } from "./afdrukTaal";
import "../rapport/RapportPanel.css";
import "./BladVersie.css";

/*
 * Op welke norm een blad rust, als die afwijkt van het land van het project. De rekenbladen
 * rusten op de Eurocodes met de Nederlandse bijlage (of de eerste generatie); in een ander land
 * mogen ze niet de schijn wekken dat ze aan de daar geldende norm zijn getoetst. In een
 * Nederlands project geeft dit niets, op het scherm en op papier.
 */

/** De melding in de taal van `t` (namespace rapport) en de naam van het land in `taal`. */
export function bladNormTekst(t: TFunction<"rapport">, a: NormAfwijking, k: Normkeuze, taal: string): string {
  return t(`afdruk.bladNorm.${a.soort}`, { normen: a.normen, land: inTaal(k.land.naam, taal) });
}

/** Onder de kop van een blad op papier, in de taal van de uitdraai. */
export function BladNormRegel({ ex }: { ex: Exemplaar }) {
  const papier = usePapier();
  const { i18n } = useTranslation();
  const k = useNormkeuze();
  const a = useBladNorm(ex.source);
  if (!a) return null;
  return <p className="print-normmelding">{bladNormTekst(papier, a, k, i18n.language)}</p>;
}

/** Boven een geopend blad, in de taal van de app. */
export function BladNormMelding({ ex }: { ex: Exemplaar }) {
  const { t, i18n } = useTranslation("rapport");
  const k = useNormkeuze();
  const a = useBladNorm(ex.source);
  if (!a) return null;
  return (
    <div className="bv-melding rapport-melding-blok" role="status">
      <span className="bv-melding-tekst">{bladNormTekst(t, a, k, i18n.language)}</span>
    </div>
  );
}
