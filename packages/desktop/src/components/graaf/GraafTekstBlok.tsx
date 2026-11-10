import { memo, useLayoutEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import type { GraafTekst } from "../../graaf/model";

/*
 * Een losse tekst op het vlak: een titel (één regel, vet) en tekst die meegroeit.
 * Geen poorten. Kiezen en slepen gaan zoals bij een node (aan de rand of het vlak
 * van het blok, niet in de velden); de rechterrand sleept de breedte.
 */

export interface TekstActies {
  beginSlepen: (e: ReactPointerEvent, id: string) => void;
  zet: (id: string, wat: { titel?: string; tekst?: string; breedte?: number }, sleutel?: string) => void;
  /** Slepen aan de rechterrand: de nieuwe breedte, bij loslaten één stap. */
  beginBreedte: (e: ReactPointerEvent, tekst: GraafTekst) => void;
}

export const MIN_BREEDTE = 120;

export const GraafTekstBlok = memo(function GraafTekstBlok({ tekst, x, y, breedte, gekozen, focus, acties }: {
  tekst: GraafTekst;
  /** De plek en breedte zoals getoond, ook tijdens het slepen. */
  x: number;
  y: number;
  breedte: number;
  gekozen: boolean;
  /** Net gemaakt: de cursor in de titel. */
  focus: boolean;
  acties: TekstActies;
}) {
  const { t } = useTranslation("werkruimte");
  const titelRef = useRef<HTMLInputElement>(null);
  const tekstRef = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    if (focus) titelRef.current?.focus();
  }, [focus]);

  // De tekst groeit mee met wat erin staat.
  useLayoutEffect(() => {
    const el = tekstRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [tekst.tekst, breedte]);

  return (
    <div
      className={`graaf-tekstblok${gekozen ? " gekozen" : ""}`}
      style={{ left: x, top: y, width: breedte }}
      data-graaf-tekst={tekst.id}
      onPointerDown={(e) => {
        if (e.button !== 0 || (e.target as HTMLElement).closest("input, textarea, .graaf-tekst-rand")) return;
        acties.beginSlepen(e, tekst.id);
      }}
    >
      <input
        ref={titelRef}
        className="graaf-tekst-titel"
        value={tekst.titel ?? ""}
        placeholder={t("graaf.tekstblok.titel")}
        aria-label={t("graaf.tekstblok.titel")}
        onChange={(e) => acties.zet(tekst.id, { titel: e.target.value }, "titel")}
      />
      <textarea
        ref={tekstRef}
        className="graaf-tekst-inhoud"
        rows={1}
        value={tekst.tekst}
        placeholder={t("graaf.tekstblok.tekst")}
        aria-label={t("graaf.tekstblok.tekst")}
        onChange={(e) => acties.zet(tekst.id, { tekst: e.target.value }, "tekst")}
      />
      <span className="graaf-tekst-rand" title={t("graaf.tekstblok.breedte")} onPointerDown={(e) => acties.beginBreedte(e, tekst)} />
    </div>
  );
});
