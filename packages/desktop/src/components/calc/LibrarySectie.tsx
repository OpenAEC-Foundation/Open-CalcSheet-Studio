import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { defaultStyles, evaluate, parse, render } from "@ifc-calc/core";
import { useProjectStore } from "../../store/projectStore";
import { useProjectScope } from "../../store/actiefBlad";
import { isLosBlad } from "../../store/spreadsheetBlad";
import { useLibrary } from "../../store/library";
import { werkLibraryBij } from "../../store/libraryLaden";
import Icoon from "../Icoon";
import FormuleVenster from "../ribbon/FormuleVenster";
import { codeVan, type Formule, type Tekst } from "../ribbon/formules";
import { formuleBeeld } from "../ribbon/formuleBeeld";
import { nieuwBladMetFormule, voegFormuleIn } from "../ribbon/formuleInvoegen";
import { schoonUitwerking } from "./uitwerkingOpschonen";
import "katex/dist/katex.min.css";
import "../settings/SettingsDialog.css";
import "./Preview.css";
import "./LibrarySectie.css";

/**
 * De Library in het projectpaneel: een handvol voorbeelden uit de Eurocodes en
 * de klassieke mechanica. De voorbeelden komen bij het opstarten uit de repository
 * (store/library.ts) en staan ook in het formulevenster en de API; dit is alleen
 * de etalage. Een klik toont de uitwerking in een vak naast het paneel, met
 * Invoegen en Nieuw blad.
 */

function Chevron({ open }: { open: boolean }) {
  return (
    <svg className={`panel-section-chevron${open ? " open" : ""}`} width="10" height="10" viewBox="0 0 10 10"
      fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="2,3 5,6 8,3" />
    </svg>
  );
}

// ─── Welke delen dicht staan: alleen voor deze gebruiker, niet in het project ──

const SLEUTEL = "openaec.calcsheet.library";

interface Stand {
  sectieDicht: boolean;
  groepenDicht: string[];
}

function leesStand(): Stand {
  try {
    const s = JSON.parse(localStorage.getItem(SLEUTEL) ?? "{}") as Partial<Stand>;
    return {
      sectieDicht: s.sectieDicht === true,
      groepenDicht: Array.isArray(s.groepenDicht) ? s.groepenDicht : [],
    };
  } catch {
    return { sectieDicht: false, groepenDicht: [] };
  }
}

function bewaarStand(s: Stand) {
  try {
    localStorage.setItem(SLEUTEL, JSON.stringify(s));
  } catch {
    // Geen opslag beschikbaar: dan onthoudt het paneel het alleen deze sessie.
  }
}

// ─── Het voorbeeld ──────────────────────────────────────────────────────────

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

function VoorbeeldVak({ f, anker, onSluit }: { f: Formule; anker: HTMLElement | null; onSluit: () => void }) {
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

// ─── De sectie in het paneel ────────────────────────────────────────────────

function ItemIcoon({ f }: { f: Formule }) {
  if (f.soort === "grafiek") return <Icoon id="data.chart" />;
  if (f.soort === "tekening") return <Icoon id="draw.freehand" />;
  return <span className="lib-glyph" aria-hidden="true">ƒ</span>;
}

/** Wat het ophalen te melden heeft; met een bewaarde stand blijft de lijst gewoon staan. */
function LibraryMelding() {
  const { t, i18n } = useTranslation("library");
  const { voorbeelden, opgehaald, bezig, fout } = useLibrary();
  if (bezig) return voorbeelden.length === 0 ? <p className="lib-melding">{t("ophalen")}</p> : null;
  if (fout === null) return null;
  const datum = opgehaald ? new Date(opgehaald).toLocaleDateString(i18n.language) : null;
  return (
    <p className="lib-melding">
      {fout === "teNieuw" ? t("teNieuw") : datum ? t("nietBijgewerkt", { datum }) : t("nietOpgehaald")}
      {fout === "verbinding" && (
        <button className="lib-opnieuw" onClick={() => void werkLibraryBij()}>{t("opnieuw")}</button>
      )}
    </p>
  );
}

export default function LibrarySectie() {
  const { t, i18n } = useTranslation("library");
  const taal = (w: Tekst) => (i18n.language?.startsWith("en") ? w.en : w.nl) || w.nl;
  const groepen = useLibrary((s) => s.groepen);
  const voorbeelden = useLibrary((s) => s.voorbeelden);
  const [stand, setStand] = useState(leesStand);
  const [gekozen, setGekozen] = useState<{ f: Formule; anker: HTMLElement } | null>(null);
  const [zoekt, setZoekt] = useState(false);
  const sluit = useCallback(() => setGekozen(null), []);

  const wijzig = (nieuw: Stand) => {
    setStand(nieuw);
    bewaarStand(nieuw);
  };
  const wisselGroep = (id: string) => {
    const dicht = stand.groepenDicht.includes(id);
    wijzig({ ...stand, groepenDicht: dicht ? stand.groepenDicht.filter((g) => g !== id) : [...stand.groepenDicht, id] });
  };
  const open = !stand.sectieDicht;

  return (
    <div className={`panel-section lib-sectie${open ? " open" : ""}`}>
      <button className="panel-section-header" aria-expanded={open} title={t("uitleg")}
        onClick={() => { sluit(); wijzig({ ...stand, sectieDicht: open }); }}>
        <Chevron open={open} />
        <span className="panel-section-title">{t("titel")}</span>
        <span className="pb-teller">{voorbeelden.length}</span>
      </button>
      {open && (
        <div className="lib-lijst">
          <LibraryMelding />
          {groepen.map((g) => {
            const groepOpen = !stand.groepenDicht.includes(g.id);
            const items = voorbeelden.filter((f) => f.library === g.id);
            return (
              <div className="lib-groep" key={g.id}>
                <button className="lib-groep-kop" aria-expanded={groepOpen} onClick={() => wisselGroep(g.id)}
                  title={`${taal(g.naam)}, ${taal(g.onder)}`}>
                  <Chevron open={groepOpen} />
                  <span className="lib-groep-naam">{taal(g.naam)}</span>
                  <span className="lib-groep-onder">{taal(g.onder)}</span>
                </button>
                {groepOpen && items.map((f) => (
                  <button key={f.id} data-library-rij type="button" aria-haspopup="dialog"
                    aria-expanded={gekozen?.f.id === f.id}
                    className={`pb-rij lib-rij${gekozen?.f.id === f.id ? " gekozen" : ""}`}
                    title={`${taal(f.naam)}\n${f.bron ?? ""}`}
                    onClick={(e) => {
                      const anker = e.currentTarget;
                      setGekozen((g2) => (g2?.f.id === f.id ? null : { f, anker }));
                    }}
                    onDoubleClick={() => { sluit(); voegFormuleIn(f, i18n.language); }}>
                    <ItemIcoon f={f} />
                    <span className="pb-naam">{taal(f.naam)}</span>
                  </button>
                ))}
              </div>
            );
          })}
          {/* Alle andere fragmenten staan in hetzelfde formulevenster als in het lint. */}
          <button className="pb-rij pb-toevoegen" onClick={() => setZoekt(true)} title={t("alleFormulesUitleg")}>
            <Icoon id="view.search" />
            <span className="pb-naam">{t("alleFormules")}</span>
          </button>
        </div>
      )}
      {gekozen && <VoorbeeldVak key={gekozen.f.id} f={gekozen.f} anker={gekozen.anker} onSluit={sluit} />}
      {zoekt && <FormuleVenster open onSluit={() => setZoekt(false)} />}
    </div>
  );
}
