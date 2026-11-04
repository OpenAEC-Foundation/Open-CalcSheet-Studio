import { useLayoutEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import { drieDSvg, ifcxNaarScene, leesIfcx } from "@ifc-calc/core";
import { useActiefExemplaar } from "../../store/actiefBlad";
import { heeftWebGL, ifcxTeksten, IfcxBeelden } from "./ifcxBlok";
import { poerIfcxDocument, poerModelTelling, type PoerModelTeksten } from "./poerIfcx";
import type { PoerDefinitie } from "./poerDefinitie";

/**
 * Het draaibare 3D-model van de tweepaalspoer in het parametrische beeld.
 *
 * Dezelfde weg als `@ifcx balklaag` in de uitwerking: een IFCX-document (poerIfcx.ts), en
 * daaroverheen het beeld van ifcxBlok.ts en ifcxWeergave.ts, met dezelfde knoppen en
 * hetzelfde paneel. Elke wijziging in de velden of de blauwe maten geeft een nieuw document,
 * en het beeld neemt dat meteen over; de camera blijft staan als de gebruiker heeft gedraaid.
 *
 * Zonder WebGL staat er een stilstaande projectie, die elke wijziging ook volgt. Dit model
 * staat alleen op het scherm: op papier blijft de tekening het beeld.
 */
export default function PoerModel({ poer, hoogte, naast }: { poer: PoerDefinitie; hoogte: number; naast: boolean }) {
  const { t } = useTranslation("beelden");
  const { t: tc } = useTranslation("rekentaal");
  const exemplaar = useActiefExemplaar();
  const bladId = exemplaar?.id;
  const naam = exemplaar?.naam ?? "";

  const tRef = useRef(tc);
  tRef.current = tc;
  const wortelRef = useRef<HTMLDivElement>(null);
  const blokRef = useRef<HTMLDivElement>(null);
  const vakRef = useRef<HTMLDivElement>(null);
  const beelden = useRef<IfcxBeelden | null>(null);

  useLayoutEffect(() => {
    const b = new IfcxBeelden(() => ifcxTeksten(tRef.current));
    beelden.current = b;
    return () => {
      b.sluit();
      if (beelden.current === b) beelden.current = null;
    };
  }, []);

  const teksten = useMemo(() => t("tweepaalspoer.model", { returnObjects: true }) as unknown as PoerModelTeksten, [t]);
  // Een tekst, geen object: een herberekening die de poer niet raakt, bouwt niets opnieuw.
  const doc = poerIfcxDocument(poer, { teksten });
  const json = doc ? JSON.stringify(doc) : "";
  const hoogteRef = useRef(hoogte);
  hoogteRef.current = hoogte;

  useLayoutEffect(() => {
    const blok = blokRef.current;
    const vak = vakRef.current;
    if (!blok || !vak) return;
    if (json) blok.dataset.ifcx = json;
    else delete blok.dataset.ifcx;
    // De houder is verborgen als de browser de WebGL-context terugnam (ifcxWeergave.ts).
    if (!heeftWebGL() || vak.querySelector<HTMLElement>(".calc-ifcx-houder")?.style.display === "none") {
      vak.querySelector(":scope > svg")?.remove();
      if (json) vak.insertAdjacentHTML("afterbegin", drieDSvg(ifcxNaarScene(leesIfcx(JSON.parse(json)), hoogteRef.current)));
    }
    beelden.current?.koppel(wortelRef.current, bladId, naam);
  }, [json, bladId, naam]);

  const { totaal, getoond } = poerModelTelling(poer);

  return (
    <div ref={wortelRef} className={`vd-3d${naast ? "" : " vd-3d-onder"}`}>
      <div className="vd-3d-kop">
        {t("tweepaalspoer.modelKop")}
        {getoond < totaal && <span className="vd-3d-noot">{t("tweepaalspoer.modelBeperkt", { getoond, totaal })}</span>}
      </div>
      <div ref={blokRef} className="calc-ifcx">
        <div ref={vakRef} className="calc-ifcx-beeld vd-3d-beeld" style={{ height: hoogte }} />
      </div>
    </div>
  );
}
