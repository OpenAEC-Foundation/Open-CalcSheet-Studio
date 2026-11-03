import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { XlsxEditor, type XlsxEditorApi } from "@betteroffice/xlsx-react";
import { useProjectStore, type Exemplaar } from "../../store/projectStore";
import { LEGE_WERKMAP, registreerBewaarder } from "../../store/spreadsheetBlad";
import { useSpreadsheetEditor } from "../../store/spreadsheetEditor";
import { base64NaarBytes, bytesNaarBase64 } from "./pdfBlad";
import { spreadsheetNl } from "./spreadsheetNl";
import { koppenPlugin } from "./spreadsheetKoppen";
import { laagPlugin } from "./spreadsheetLaag";
import { normaliseerOpenVeld, startAanwijzen } from "./spreadsheetAanwijzen";
import { kopieer, naWijziging, plak, plakKlembord, wisKopieKader } from "./spreadsheetKlembord";
import { doorvoeren, uitvoeren, voegFunctieIn } from "./spreadsheetOpdrachten";

/** Zo lang na de laatste wijziging gaat de werkmap naar het project. */
const BEWAAR_NA_MS = 400;

/*
 * De editor van een spreadsheet-blad. Apart bestand, zodat de rekenkern en zijn
 * WASM pas laden bij het eerste spreadsheet-blad (SpreadsheetBladWeergave.tsx).
 *
 * De editor draait met `legacySyncApi`: de rekenkern op de hoofdthread, met
 * `api.handle` erbij. Alleen daarmee kunnen rijen en kolommen erin en eruit,
 * kolombreedte en vastzetten, en zijn cellen met opmaak samen één stap ongedaan
 * maken; de async-API kent die bewerkingen niet. Het pakket laat deze weg in 0.6
 * vervallen, dus de versie staat vast op 0.5.1 (package.json).
 *
 * De editor is de baas zolang hij openstaat; de werkmap in het project volgt hem
 * kort na elke wijziging, en bij het sluiten. Verandert de werkmap in het project
 * door iets anders (ongedaan maken, een ander bestand inlezen), dan laadt de
 * editor die opnieuw.
 */
export default function SpreadsheetEditor({ ex }: { ex: Exemplaar }) {
  const { i18n } = useTranslation("werkruimte");
  const data = ex.xlsx?.data ?? LEGE_WERKMAP;
  const id = ex.id;
  const [bestand, setBestand] = useState(() => base64NaarBytes(data));
  const [fout, setFout] = useState<string | null>(null);

  const api = useRef<XlsxEditorApi | null>(null);
  /** De versie die in het project staat; null tot de editor klaar is met laden. */
  const versie = useRef<string | null>(null);
  /** De werkmap die deze editor heeft gelezen of geschreven. */
  const eigen = useRef(data);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Bewaren na elkaar: een tragere eerdere ronde mag een latere niet overschrijven. */
  const rij = useRef<Promise<void>>(Promise.resolve());
  // De laag voor de kolomletters en rijnummers moet er zijn voordat de editor tekent.
  const [koppenLaag, setKoppenLaag] = useState<HTMLDivElement | null>(null);
  const plugins = useMemo(() => (koppenLaag ? [koppenPlugin(koppenLaag), laagPlugin()] : []), [koppenLaag]);

  /**
   * De vastgelegde werkmap naar het project. Dit raakt een open cel niet: `api.version()`
   * zou hem sluiten, en dat mag niet terwijl iemand nog aan een formule bezig is.
   */
  const bewaarVastgelegd = useCallback(async (a: XlsxEditorApi) => {
    if (versie.current === null) return;
    const nu = a.handle.version();
    if (nu === versie.current) return;
    const inhoud = await bytesNaarBase64(a.handle.save());
    versie.current = nu;
    eigen.current = inhoud;
    const s = useProjectStore.getState();
    const blad = s.exemplaren.find((e) => e.id === id);
    if (blad) s.zetSpreadsheet(id, { bestandsnaam: blad.xlsx?.bestandsnaam ?? "", data: inhoud });
  }, [id]);

  /** Bij wisselen van blad of opslaan: ook een cel die nog openstaat gaat mee. */
  const bewaar = useCallback(() => {
    const a = api.current;
    const ronde = rij.current.then(async () => {
      if (!a) return;
      normaliseerOpenVeld();
      // Een geweigerde invoer blijft in de cel staan; de rest van de werkmap gaat wel mee.
      await a.flushPendingInput().catch(() => undefined);
      await bewaarVastgelegd(a);
    });
    rij.current = ronde.catch(() => undefined);
    return ronde;
  }, [bewaarVastgelegd]);

  const gewijzigd = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      const a = api.current;
      if (!a) return;
      const ronde = rij.current.then(() => bewaarVastgelegd(a));
      rij.current = ronde.catch(() => undefined);
      ronde.catch((err) => console.error("Spreadsheet bewaren mislukt:", err));
    }, BEWAAR_NA_MS);
  }, [bewaarVastgelegd]);

  const gereed = useCallback((a: XlsxEditorApi) => {
    api.current = a;
    versie.current = a.handle.version();
    const stand = () => {
      const { canUndo, canRedo } = a.handle.historyState();
      useSpreadsheetEditor.setState({ kanOngedaan: canUndo, kanOpnieuw: canRedo });
    };
    useSpreadsheetEditor.setState({ api: a, kopie: null, markeringen: [] });
    stand();
    const stopAanwijzen = startAanwijzen(a);
    // Elke wijziging, ook ongedaan maken en wat buiten de editor om gaat.
    const stopWijzigingen = a.handle.onUpdate(() => {
      stand();
      naWijziging();
      gewijzigd();
    });
    return () => {
      stopWijzigingen();
      stopAanwijzen();
      if (api.current === a) api.current = null;
      if (useSpreadsheetEditor.getState().api === a) useSpreadsheetEditor.setState({ api: null, bereik: null, focus: null, markeringen: [], kopie: null });
    };
  }, [gewijzigd]);

  // Bij het wisselen van blad of weergave: wat nog openstaat eerst naar het project.
  useEffect(() => {
    const afmelden = registreerBewaarder(bewaar);
    return () => {
      afmelden();
      if (timer.current) clearTimeout(timer.current);
      // De rekenkern gaat zo weg, dus meteen; het blad wisselen wachtte al op een volledige ronde.
      const a = api.current;
      if (a) bewaarVastgelegd(a).catch((err) => console.error("Spreadsheet bewaren mislukt:", err));
    };
  }, [bewaar, bewaarVastgelegd]);

  // De werkmap is van buitenaf veranderd.
  useEffect(() => {
    if (data === eigen.current) return;
    eigen.current = data;
    versie.current = null;
    setFout(null);
    setBestand(base64NaarBytes(data));
  }, [data]);

  useEffect(() => startToetsen(), []);

  return (
    <div className="spreadsheet-weergave">
      {fout && <p className="pdf-melding fout">{fout}</p>}
      {koppenLaag && (
        <XlsxEditor
          legacySyncApi
          file={bestand}
          fileName={`${ex.naam}.xlsx`}
          onReady={gereed}
          onError={(err) => {
            console.error("Spreadsheet:", err);
            setFout(err.message);
          }}
          // Ctrl+S is voor het project (useSneltoetsen.ts), niet voor een los bestand.
          onSaveRequest={() => false}
          i18n={i18n.language.startsWith("nl") ? spreadsheetNl : undefined}
          className="spreadsheet-editor"
          plugins={plugins}
        />
      )}
      <div ref={setKoppenLaag} className="spreadsheet-koppen" aria-hidden="true" />
    </div>
  );
}

/**
 * De sneltoetsen op het raster: het klembord, doorvoeren en AutoSom. Vóór de editor,
 * die zelf alleen platte tekst kopieert en plakt. In een invoerveld blijven ze van de
 * browser: dan gaat het om de tekst in dat veld.
 */
function startToetsen(): () => void {
  const vang = document.createElement("textarea");
  vang.className = "spreadsheet-plakvang";
  vang.setAttribute("aria-hidden", "true");
  vang.tabIndex = -1;
  document.body.appendChild(vang);
  /** Wacht de vang op een plakactie? De browser plakt daar in, met HTML en tekst. */
  let plakken = false;

  const inRaster = (doel: EventTarget | null): boolean => {
    const el = doel instanceof Element ? doel : null;
    if (!el?.closest('.spreadsheet-editor [data-testid="xlsx-workspace"], .spreadsheet-editor [data-testid="xlsx-scroll"]')) return false;
    return !(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement);
  };
  const terug = () => {
    useSpreadsheetEditor.getState().api?.focus();
  };

  const opToets = (e: KeyboardEvent) => {
    const doel = e.target;
    // Een cel die sluit met deze toets: invoer omzetten voor de rekenkern hem leest.
    if ((e.key === "Enter" || e.key === "Tab") && doel instanceof HTMLInputElement && doel.closest(".spreadsheet-editor")) {
      normaliseerOpenVeld();
      return;
    }
    if (!inRaster(doel)) return;
    if (e.key === "Escape") {
      wisKopieKader();
      return;
    }
    if (e.altKey && e.key === "=") {
      e.preventDefault();
      e.stopImmediatePropagation();
      uitvoeren(() => voegFunctieIn("SUM"));
      return;
    }
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const letter = e.key.toLowerCase();
    if (letter === "c" || letter === "x") {
      e.preventDefault();
      e.stopImmediatePropagation();
      uitvoeren(() => kopieer(letter === "x"));
    } else if (letter === "v") {
      // Niet tegenhouden bij de browser: die plakt in de vang.
      e.stopImmediatePropagation();
      plakken = true;
      vang.focus({ preventScroll: true });
      window.setTimeout(() => {
        // Geen paste-gebeurtenis (leeg of geweigerd klembord): via de klembord-API.
        if (!plakken) return;
        plakken = false;
        terug();
        uitvoeren(plakKlembord);
      }, 300);
    } else if (letter === "d" || letter === "r") {
      e.preventDefault();
      e.stopImmediatePropagation();
      uitvoeren(() => doorvoeren(letter === "d" ? "omlaag" : "rechts"));
    }
  };

  const opPlakken = (e: ClipboardEvent) => {
    if (e.target !== vang) return;
    e.preventDefault();
    if (!plakken) return;
    plakken = false;
    const inhoud = { tekst: e.clipboardData?.getData("text/plain") ?? "", html: e.clipboardData?.getData("text/html") || undefined };
    terug();
    uitvoeren(() => plak(inhoud));
  };

  window.addEventListener("keydown", opToets, true);
  document.addEventListener("paste", opPlakken, true);
  return () => {
    window.removeEventListener("keydown", opToets, true);
    document.removeEventListener("paste", opPlakken, true);
    vang.remove();
  };
}
