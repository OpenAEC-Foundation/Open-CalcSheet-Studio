import { useEffect, useRef, type CSSProperties } from "react";
import i18next from "i18next";
import { useTranslation } from "react-i18next";
import { useProjectStore } from "../../store/projectStore";
import { useHoofdstukMaken } from "../../store/hoofdstukMaken";
import { hoofdstukkenUitAfdruk, VOORBLAD } from "../../rapport/hoofdstukkenAlsBladen";
import { huisstijlVariabelen } from "../../rapport/model";
import RapportAfdruk from "../rapport/afdruk/RapportAfdruk";
import { useRapportBureau } from "../rapport/afdruk/useRapportWeergave";
import { MATEN } from "./paginering";
import { leesEenheden, schrijfEenheden } from "../../store/canvasBlad";
import Icoon from "../Icoon";

/**
 * "Hoofdstukken als bladen" in de projectboom, en de modules H1 tot en met H5: maakt van
 * de hoofdstukken van het rapport bladen met code (rapport/hoofdstukkenAlsBladen.ts), met
 * dezelfde uitdraai. Het rapport wordt daarvoor even buiten beeld opgemaakt, op de breedte
 * van het papier, en daaruit gelezen. Hoofdstuk 5 wordt een canvasblad.
 */
export default function RapportAlsBladen() {
  const { t } = useTranslation("rapport");
  const vraag = useHoofdstukMaken((s) => s.vraag);
  const maak = useHoofdstukMaken((s) => s.maak);
  return (
    <>
      <button className="pb-rij pb-toevoegen" title={t("alsBladen.uitleg")} disabled={vraag !== null} onClick={() => maak([])}>
        <Icoon id="report.generate" />
        <span className="pb-naam">{t("alsBladen.knop")}</span>
      </button>
      {vraag !== null && <Omzetten ankers={vraag} />}
    </>
  );
}

/** Het rapport buiten beeld; zodra het stil staat, worden de gevraagde hoofdstukken bladen. */
function Omzetten({ ankers }: { ankers: string[] }) {
  const { t } = useTranslation("rapport");
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
      const alle = hoofdstukkenUitAfdruk(wortel, {
        gebouwhoogte: wind.gebouwhoogte,
        coefficienten: wind.coefficienten.map((c) => c.c),
        belastingen: s.rapport.belastingen,
      });
      const gevraagd = ankers.length ? alle.filter((h) => ankers.includes(h.anker)) : alle;
      // Een bestaand blad opnieuw (na het venster van 5.5): dezelfde plekken, de nieuwe invoer.
      const vervang = useHoofdstukMaken.getState().vervang;
      const oud = vervang ? useProjectStore.getState().exemplaren.find((e) => e.id === vervang) : undefined;
      if (oud && gevraagd[0]) {
        const plek = new Map(leesEenheden(oud.source).map((e) => [e.id, e]));
        const nieuw = gevraagd[0].canvas
          ? schrijfEenheden(leesEenheden(gevraagd[0].bron).map((e) => ({ ...e, x: plek.get(e.id)?.x ?? e.x, y: plek.get(e.id)?.y ?? e.y }))) + "\n"
          : gevraagd[0].bron;
        useProjectStore.getState().zetBron(oud.id, nieuw);
        const invoer = Object.fromEntries([...nieuw.matchAll(/^([\p{L}_][\p{L}\p{N}_]*) = \?\{([^}]*)\}/gmu)].map((m) => [m[1], m[2]]));
        if (Object.keys(invoer).length) useProjectStore.getState().zetWaarden(oud.id, invoer);
        useHoofdstukMaken.getState().klaar();
        return;
      }
      const ids = gevraagd.map((h) => {
        // De naam in de taal van het rapport, zoals de titels van de hoofdstukken.
        const naam = h.anker === VOORBLAD ? i18next.getFixedT(s.rapport.taal, "rapport")("alsBladen.voorblad") : `H${h.nummer} ${h.titel}`;
        const st = useProjectStore.getState();
        const id = h.canvas ? st.voegCanvasToe(naam) : st.voegToe("leeg", naam, h.bron);
        if (h.canvas) useProjectStore.getState().zetBron(id, h.bron);
        // Precies "H1 Inleiding", zonder volgnummer erachter.
        useProjectStore.getState().hernoem(id, naam);
        // Vooraan in de boom, na de hoofdstukbladen die er al staan: het rapport begint met het
        // voorblad en de hoofdstukken, de andere bladen volgen als bijlage.
        for (;;) {
          const lijst = useProjectStore.getState().exemplaren;
          const i = lijst.findIndex((e) => e.id === id);
          const doel = lijst.findIndex((e) => e.id !== id && !e.source.includes("rpa-in-blad"));
          if (doel < 0 || i <= doel) break;
          useProjectStore.getState().verplaats(id, -1);
          if (useProjectStore.getState().exemplaren.findIndex((e) => e.id === id) === i) break;
        }
        return id;
      });
      if (ids[0]) useProjectStore.getState().selecteer(ids[0]);
      useHoofdstukMaken.getState().klaar();
    }, 300);
    return () => window.clearInterval(timer);
  }, [ankers, t]);
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
