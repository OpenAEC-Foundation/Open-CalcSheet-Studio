import { memo, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import type { GraafGroep } from "../../graaf/model";
import type { Maat } from "../../graaf/groepen";

/*
 * Een groep op het vlak: een zacht kader in de accentkleur om de leden, met de naam
 * bovenaan; ingeklapt een kaart met de naam en het aantal leden. Alleen de titel
 * (en de kaart) vangt de muis: klikken kiest de leden, slepen verschuift ze, het
 * pijltje klapt in en uit, dubbelklik op de naam hernoemt.
 */

export interface GroepActies {
  /** Een klik of sleep op de titel: de leden kiezen en verschuiven. */
  beginSlepen: (e: ReactPointerEvent, groep: GraafGroep) => void;
  wisselIngeklapt: (id: string) => void;
  zetNaam: (id: string, naam: string) => void;
  /** Hernoemen beginnen of stoppen (null). */
  hernoem: (id: string | null) => void;
}

export const GraafGroepKader = memo(function GraafGroepKader({ groep, maat, gekozen, hernoemt, acties }: {
  groep: GraafGroep;
  maat: Maat;
  /** Alle leden zijn gekozen. */
  gekozen: boolean;
  hernoemt: boolean;
  acties: GroepActies;
}) {
  const { t } = useTranslation("werkruimte");
  const ingeklapt = !!groep.ingeklapt;
  const titel = hernoemt ? (
    <input
      className="graaf-veld graaf-groep-naamveld"
      autoFocus
      defaultValue={groep.naam}
      onPointerDown={(e) => e.stopPropagation()}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => {
        acties.zetNaam(groep.id, e.target.value.trim() || groep.naam);
        acties.hernoem(null);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") acties.hernoem(null);
      }}
    />
  ) : (
    <span className="graaf-groep-naam" title={t("graaf.hernoemen")} onDoubleClick={() => acties.hernoem(groep.id)}>{groep.naam}</span>
  );
  const pijl = (
    <button
      type="button"
      className="graaf-groep-pijl"
      aria-expanded={!ingeklapt}
      title={t(ingeklapt ? "graaf.groep.uitklappen" : "graaf.groep.inklappen")}
      aria-label={t(ingeklapt ? "graaf.groep.uitklappen" : "graaf.groep.inklappen")}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={() => acties.wisselIngeklapt(groep.id)}
    >
      {ingeklapt ? "▸" : "▾"}
    </button>
  );

  if (ingeklapt) {
    return (
      <div
        className={`graaf-groep-kaart${gekozen ? " gekozen" : ""}`}
        style={{ left: maat.x, top: maat.y, width: maat.b, height: maat.h }}
        data-graaf-groep={groep.id}
        onPointerDown={(e) => {
          if (e.button === 0) acties.beginSlepen(e, groep);
        }}
      >
        <div className="graaf-groep-titel">{pijl}{titel}</div>
        <div className="graaf-groep-aantal">{t("graaf.groep.leden", { count: groep.leden.length })}</div>
      </div>
    );
  }
  return (
    <div className={`graaf-groep${gekozen ? " gekozen" : ""}`} style={{ left: maat.x, top: maat.y, width: maat.b, height: maat.h }}>
      <div
        className="graaf-groep-titel"
        data-graaf-groep={groep.id}
        onPointerDown={(e) => {
          if (e.button === 0) acties.beginSlepen(e, groep);
        }}
      >
        {pijl}
        {titel}
      </div>
    </div>
  );
});
