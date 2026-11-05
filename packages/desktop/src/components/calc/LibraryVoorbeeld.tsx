import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { defaultStyles, evaluate, parse, render } from "@ifc-calc/core";
import { useProjectStore } from "../../store/projectStore";
import { useProjectScope } from "../../store/actiefBlad";
import { isLosBlad } from "../../store/spreadsheetBlad";
import { useLibrary } from "../../store/library";
import Icoon from "../Icoon";
import { codeVan, type Formule, type Tekst } from "../ribbon/formules";
import { formuleBeeld } from "../ribbon/formuleBeeld";
import { nieuwBladMetFormule, voegFormuleIn } from "../ribbon/formuleInvoegen";
import { schoonUitwerking } from "./uitwerkingOpschonen";
import "katex/dist/katex.min.css";
import "../settings/SettingsDialog.css";
import "./Preview.css";
import "./LibrarySectie.css";

/*
 * Het voorbeeld uit de Library (LibrarySectie.tsx): de uitwerking in een vak naast het
 * paneel, met Invoegen en Nieuw blad. Apart, want het rekent en dat hoort niet bij het
 * eerste scherm.
 */

/** De stijlen van de kern; de uitwerking zet ze pas als er een blad open is. */
function zorgVoorKernstijlen() {
  if (document.querySelector('style[data-ifc-calc="core-styles"]')) return;
  const style = document.createElement("style");
  style.textContent = defaultStyles;
  style.dataset.ifcCalc = "core-styles";
  document.head.appendChild(style);
}

/**
 * De uitwerking van een fragment. Direct in plaats van via de reken-worker: het
 * zijn een paar regels, en de worker houdt maar één wachtend verzoek vast, dat
 * dan dat van het open blad zou verdringen. Zonder de ingevulde waarden
 * (`#nosub`): die passen niet in dit vak; in het blad staan ze er wel.
 */
function rekenDoor(code: string, scope: Record<string, unknown>): { html: string; fout: string | null } {
  try {
    return { html: schoonUitwerking(render(evaluate(parse(`#nosub\n${code}`), {}, { ...scope }))), fout: null };
  } catch (err) {
    return { html: "", fout: (err as Error).message };
  }
}

/** Maat en plaats van het vak: naast het paneel, met de onderkant gelijk. */
function meetPlek(paneel: Element | null | undefined) {
  const r = paneel?.getBoundingClientRect();
  const links = (r?.right ?? 240) + 6;
  return {
    left: links,
    bottom: Math.max(window.innerHeight - (r?.bottom ?? window.innerHeight) + 6, 6),
    maxHeight: Math.max((r?.height ?? window.innerHeight) - 12, 200),
    width: Math.min(520, Math.max(window.innerWidth - links - 8, 260)),
  };
}

export default function VoorbeeldVak({ f, anker, onSluit }: { f: Formule; anker: HTMLElement | null; onSluit: () => void }) {
  const { t, i18n } = useTranslation("library");
  const taal = (w: Tekst) => (i18n.language?.startsWith("en") ? w.en : w.nl) || w.nl;
  const scope = useProjectScope();
  const blad = useProjectStore((s) => s.exemplaren.find((e) => e.id === s.activeId));
  const open = blad && !isLosBlad(blad) ? blad : null;
  const groep = useLibrary((s) => s.groepen.find((g) => g.id === f.library));
  const vak = useRef<HTMLDivElement>(null);
  const invoegKnop = useRef<HTMLButtonElement>(null);

  const [plek, setPlek] = useState(() => meetPlek(anker?.closest(".left-panel")));
  useEffect(() => {
    const opnieuw = () => setPlek(meetPlek(anker?.closest(".left-panel")));
    window.addEventListener("resize", opnieuw);
    return () => window.removeEventListener("resize", opnieuw);
  }, [anker]);

  useEffect(zorgVoorKernstijlen, []);
  // Enter voegt in; Escape gaat terug naar de rij.
  useEffect(() => invoegKnop.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    const buiten = (e: PointerEvent) => {
      const doel = e.target as Element | null;
      if (doel && (vak.current?.contains(doel) || doel.closest?.("[data-library-rij]"))) return;
      onSluit();
    };
    const toets = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onSluit();
      anker?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", buiten, true);
    document.addEventListener("keydown", toets);
    return () => {
      document.removeEventListener("pointerdown", buiten, true);
      document.removeEventListener("keydown", toets);
    };
  }, [anker, onSluit]);

  const { html, fout } = useMemo(() => rekenDoor(codeVan(f, i18n.language), scope), [f, i18n.language, scope]);
  const inhoud = useMemo(() => ({ __html: html }), [html]);
  const plaatje = useMemo(() => formuleBeeld(f), [f]);

  return createPortal(
    <div className="lib-vak" ref={vak} role="dialog" aria-label={taal(f.naam)} style={plek}>
      <div className="lib-vak-kop">
        <span className="lib-vak-titel">{groep ? `${taal(groep.naam)} · ${taal(groep.onder)}` : taal(f.naam)}</span>
        <button className="lib-vak-sluit" onClick={onSluit} title={t("sluiten")} aria-label={t("sluiten")}>
          <Icoon id="ui.close" />
        </button>
      </div>
      {plaatje && <div className="lib-vak-beeld" dangerouslySetInnerHTML={{ __html: plaatje }} />}
      {/* Papier, net als de uitwerking: in elk thema licht. */}
      <div className="lib-papier calc-preview-content" data-oa-theme="light">
        {fout ? <p className="calc-text">{t("rekenfout", { fout })}</p> : <div dangerouslySetInnerHTML={inhoud} />}
      </div>
      <div className="lib-vak-voet">
        <span className="lib-vak-plek" title={open ? t("opCursor", { naam: open.naam }) : t("geenBlad")}>
          {open ? t("opCursor", { naam: open.naam }) : t("geenBlad")}
        </span>
        <button className="settings-btn settings-btn-secondary" title={t("nieuwBladUitleg")}
          onClick={() => { onSluit(); nieuwBladMetFormule(f, i18n.language); }}>
          {t("nieuwBlad")}
        </button>
        <button ref={invoegKnop} className="settings-btn settings-btn-primary" title={t("invoegenUitleg")}
          onClick={() => { onSluit(); voegFormuleIn(f, i18n.language); }}>
          {t("invoegen")}
        </button>
      </div>
    </div>,
    document.body,
  );
}
