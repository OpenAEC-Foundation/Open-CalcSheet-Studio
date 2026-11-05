import { Suspense, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLibrary } from "../../store/library";
import { werkLibraryBij } from "../../store/libraryLaden";
import { lui } from "../lui";
import Icoon from "../Icoon";
import type { Formule, Tekst } from "../ribbon/formules";
import { voegFormuleIn } from "../ribbon/formuleInvoegen";
import "../settings/SettingsDialog.css";
import "./LibrarySectie.css";

const VoorbeeldVak = lui(() => import("./LibraryVoorbeeld"));
const FormuleVenster = lui(() => import("../ribbon/FormuleVenster"));

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
      <Suspense fallback={null}>
        {gekozen && <VoorbeeldVak key={gekozen.f.id} f={gekozen.f} anker={gekozen.anker} onSluit={sluit} />}
        {zoekt && <FormuleVenster open onSluit={() => setZoekt(false)} />}
      </Suspense>
    </div>
  );
}
