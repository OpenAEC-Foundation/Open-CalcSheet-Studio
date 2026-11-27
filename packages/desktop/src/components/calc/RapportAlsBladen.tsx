import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useProjectStore } from "../../store/projectStore";
import { hoofdstukkenUitAfdruk } from "../../rapport/hoofdstukkenAlsBladen";
import { huisstijlVariabelen } from "../../rapport/model";
import RapportAfdruk from "../rapport/afdruk/RapportAfdruk";
import { useRapportBureau } from "../rapport/afdruk/useRapportWeergave";
import { MATEN } from "./paginering";
import Icoon from "../Icoon";

/**
 * "Rapport als bladen" in de projectboom: maakt van de hoofdstukken van het rapport
 * bladen met code (rapport/hoofdstukkenAlsBladen.ts). Het rapport wordt daarvoor even
 * buiten beeld opgemaakt, op de breedte van het papier, en daaruit gelezen.
 */
export default function RapportAlsBladen() {
  const { t } = useTranslation("rapport");
  const [bezig, zetBezig] = useState(false);
  return (
    <>
      <button className="pb-rij pb-toevoegen" title={t("alsBladen.uitleg")} disabled={bezig} onClick={() => zetBezig(true)}>
        <Icoon id="report.generate" />
        <span className="pb-naam">{t("alsBladen.knop")}</span>
      </button>
      {bezig && <Omzetten klaar={() => zetBezig(false)} />}
    </>
  );
}

/** Het rapport buiten beeld; zodra het stil staat, worden de hoofdstukken bladen. */
function Omzetten({ klaar }: { klaar: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const bureau = useRapportBureau();
  useEffect(() => {
    let vorige = -1;
    let stil = 0;
    const timer = window.setInterval(() => {
      const wortel = ref.current?.querySelector<HTMLElement>(".rpa-wortel");
      const lengte = wortel?.innerHTML.length ?? 0;
      stil = lengte > 0 && lengte === vorige ? stil + 1 : 0;
      vorige = lengte;
      if (!wortel || stil < 3) return;
      window.clearInterval(timer);
      const s = useProjectStore.getState();
      const { wind } = s.rapport.belastingen;
      const hoofdstukken = hoofdstukkenUitAfdruk(wortel, { gebouwhoogte: wind.gebouwhoogte, coefficienten: wind.coefficienten.map((c) => c.c), belastingen: s.rapport.belastingen });
      const ids = hoofdstukken.map((h) => {
        if (!h.canvas) return s.voegToe("leeg", h.titel, h.bron);
        const id = useProjectStore.getState().voegCanvasToe(h.titel);
        useProjectStore.getState().zetBron(id, h.bron);
        return id;
      });
      if (ids[0]) useProjectStore.getState().selecteer(ids[0]);
      klaar();
    }, 300);
    return () => window.clearInterval(timer);
  }, [klaar]);
  return (
    <div
      ref={ref}
      className="print-opmaak"
      aria-hidden="true"
      style={{
        ...huisstijlVariabelen(bureau.huisstijl),
        position: "fixed", left: -20000, top: 0, width: `${MATEN.rapport.inhoud.breedte}mm`, visibility: "hidden",
      } as CSSProperties}
    >
      <RapportAfdruk />
    </div>
  );
}
