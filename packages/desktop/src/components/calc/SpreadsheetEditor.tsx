import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { XlsxEditor, type XlsxAsyncEditorApi } from "@betteroffice/xlsx-react";
import { useProjectStore, type Exemplaar } from "../../store/projectStore";
import { LEGE_WERKMAP, registreerBewaarder } from "../../store/spreadsheetBlad";
import { base64NaarBytes, bytesNaarBase64 } from "./pdfBlad";
import { spreadsheetNl } from "./spreadsheetNl";
import { koppenPlugin } from "./spreadsheetKoppen";

/** Zo lang na de laatste wijziging gaat de werkmap naar het project. */
const BEWAAR_NA_MS = 400;

/*
 * De editor van een spreadsheet-blad. Apart bestand, zodat de rekenkern en zijn
 * WASM pas laden bij het eerste spreadsheet-blad (SpreadsheetBladWeergave.tsx).
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

  const api = useRef<XlsxAsyncEditorApi | null>(null);
  /** De versie die in het project staat; null tot de editor klaar is met laden. */
  const versie = useRef<string | null>(null);
  /** De werkmap die deze editor heeft gelezen of geschreven. */
  const eigen = useRef(data);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Bewaren na elkaar: een tragere eerdere ronde mag een latere niet overschrijven. */
  const rij = useRef<Promise<void>>(Promise.resolve());
  // De laag voor de kolomletters en rijnummers moet er zijn voordat de editor tekent.
  const [koppenLaag, setKoppenLaag] = useState<HTMLDivElement | null>(null);
  const plugins = useMemo(() => (koppenLaag ? [koppenPlugin(koppenLaag)] : []), [koppenLaag]);

  const bewaar = useCallback(() => {
    const a = api.current;
    const ronde = rij.current.then(async () => {
      if (!a || versie.current === null) return;
      // Sluit ook een cel die nog openstaat; zonder wijziging blijft het project ongemoeid.
      const nu = await a.version();
      if (nu === versie.current) return;
      const inhoud = await bytesNaarBase64(await a.save());
      versie.current = nu;
      eigen.current = inhoud;
      const s = useProjectStore.getState();
      const blad = s.exemplaren.find((e) => e.id === id);
      if (blad) s.zetSpreadsheet(id, { bestandsnaam: blad.xlsx?.bestandsnaam ?? "", data: inhoud });
    });
    rij.current = ronde.catch(() => undefined);
    return ronde;
  }, [id]);

  const gereed = useCallback((a: XlsxAsyncEditorApi) => {
    api.current = a;
    versie.current = null;
    void a.whenHydrated()
      .then(() => a.version())
      .then((v) => {
        if (api.current === a) versie.current = v;
      })
      .catch((err) => console.error("Werkmap openen mislukt:", err));
    return () => {
      if (api.current === a) api.current = null;
    };
  }, []);

  const gewijzigd = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      bewaar().catch((err) => console.error("Spreadsheet bewaren mislukt:", err));
    }, BEWAAR_NA_MS);
  }, [bewaar]);

  // Bij het wisselen van blad of weergave: wat nog openstaat eerst naar het project.
  useEffect(() => {
    const afmelden = registreerBewaarder(bewaar);
    return () => {
      afmelden();
      if (timer.current) clearTimeout(timer.current);
      bewaar().catch((err) => console.error("Spreadsheet bewaren mislukt:", err));
    };
  }, [bewaar]);

  // De werkmap is van buitenaf veranderd.
  useEffect(() => {
    if (data === eigen.current) return;
    eigen.current = data;
    versie.current = null;
    setFout(null);
    setBestand(base64NaarBytes(data));
  }, [data]);

  return (
    <div className="spreadsheet-weergave">
      {fout && <p className="pdf-melding fout">{fout}</p>}
      {koppenLaag && (
        <XlsxEditor
          file={bestand}
          fileName={`${ex.naam}.xlsx`}
          onReady={gereed}
          onChange={gewijzigd}
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
