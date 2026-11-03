import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useProjectStore, type Exemplaar } from "../../store/projectStore";
import { bewaarOpenWerkmappen, isSpreadsheetBlad, LEGE_WERKMAP } from "../../store/spreadsheetBlad";
import { papier } from "./pdfBlad";
import { SPELING, type Maten } from "./paginering";
import { exporteerWerkmap, kiesWerkmap, useWerkmapVellen, werkmapGrootte } from "./spreadsheetBlad";
import "./PdfBladWeergave.css";
import "./SpreadsheetBladWeergave.css";

/*
 * Een spreadsheet-blad in beeld en op papier (zie store/spreadsheetBlad.ts en
 * spreadsheetBlad.ts). In de werkruimte de editor; op papier de werkbladen als
 * afbeelding, in stukken langs de rijgrenzen, met de loopkop en -voet van de
 * uitdraai of de voet van het rapport eromheen.
 */

const SpreadsheetEditor = lazy(() => import("./SpreadsheetEditor"));

/*
 * De editor blijft leven als je naar een ander blad of het afdrukvoorbeeld gaat:
 * hij bewaart asynchroon in zijn worker, en een editor die meteen weg is, neemt
 * zijn laatste invoer mee. Daarom rendert SpreadsheetHouder hem in een eigen
 * vak dat tussen de werkruimte en een verborgen parkeerplek verhuist. Terugkomen
 * is daardoor ook meteen klaar. Een ander spreadsheet-blad vervangt hem, nadat
 * het vorige is bewaard.
 */
let vak: HTMLDivElement | null = null;
let parkeerplek: HTMLDivElement | null = null;

function editorVak(): HTMLDivElement {
  if (!vak) {
    vak = document.createElement("div");
    vak.className = "spreadsheet-vak";
  }
  return vak;
}

function parkeer() {
  if (!parkeerplek) {
    parkeerplek = document.createElement("div");
    parkeerplek.style.display = "none";
    document.body.appendChild(parkeerplek);
  }
  parkeerplek.appendChild(editorVak());
}

/** Houdt de editor van het laatst geopende spreadsheet-blad; staat altijd in de app. */
export function SpreadsheetHouder() {
  const { t } = useTranslation("werkruimte");
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const activeId = useProjectStore((s) => s.activeId);
  const [openId, setOpenId] = useState<string | null>(null);
  const actief = exemplaren.find((e) => e.id === activeId && isSpreadsheetBlad(e))?.id;

  useEffect(() => {
    if (!actief || actief === openId) return;
    let vervallen = false;
    void bewaarOpenWerkmappen().then(() => {
      if (!vervallen) setOpenId(actief);
    });
    return () => {
      vervallen = true;
    };
  }, [actief, openId]);

  const open = exemplaren.find((e) => e.id === openId);
  if (!open || !isSpreadsheetBlad(open)) return null;
  return createPortal(
    <Suspense fallback={<p className="pdf-melding">{t("spreadsheet.laden")}</p>}>
      <SpreadsheetEditor key={open.id} ex={open} />
    </Suspense>,
    editorVak(),
  );
}

/** Werkruimte: de plek waar de editor staat zolang dit blad open is. */
export function SpreadsheetBladWeergave() {
  const plek = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    plek.current?.appendChild(editorVak());
    return () => {
      parkeer();
      void bewaarOpenWerkmappen();
    };
  }, []);
  return <div ref={plek} className="spreadsheet-plek" />;
}

/** Kop van het paneel: bestandsnaam en grootte, inlezen en wegschrijven. */
export function SpreadsheetBladInfo({ ex }: { ex: Exemplaar }) {
  const { t } = useTranslation("werkruimte");
  const zetSpreadsheet = useProjectStore((s) => s.zetSpreadsheet);
  const delen = ex.xlsx ? [ex.xlsx.bestandsnaam, werkmapGrootte(ex.xlsx)] : [];
  const lees = async () => {
    try {
      const xlsx = await kiesWerkmap();
      if (!xlsx) return;
      if (ex.xlsx && ex.xlsx.data !== LEGE_WERKMAP && !confirm(t("spreadsheet.vervangenVraag", { naam: ex.naam }))) return;
      zetSpreadsheet(ex.id, xlsx);
    } catch (err) {
      console.error("Werkmap inlezen mislukt:", err);
      alert(t("spreadsheet.lezenMislukt", { fout: (err as Error)?.message ?? String(err) }));
    }
  };
  const schrijf = async () => {
    try {
      await bewaarOpenWerkmappen();
      const xlsx = useProjectStore.getState().exemplaren.find((e) => e.id === ex.id)?.xlsx;
      if (xlsx) await exporteerWerkmap(ex.naam, xlsx);
    } catch (err) {
      console.error("Werkmap wegschrijven mislukt:", err);
      alert(t("spreadsheet.schrijvenMislukt", { fout: (err as Error)?.message ?? String(err) }));
    }
  };
  return (
    <span className="pdf-info">
      <span className="pdf-info-tekst" title={delen.filter(Boolean).join(" · ")}>{delen.filter(Boolean).join(" · ")}</span>
      <button className="pdf-vervang" onClick={() => void lees()} title={t("spreadsheet.inlezenUitleg")}>
        {t("spreadsheet.inlezen")}
      </button>
      <button className="pdf-vervang" onClick={() => void schrijf()} disabled={!ex.xlsx} title={t("spreadsheet.exporterenUitleg")}>
        {t("spreadsheet.exporteren")}
      </button>
    </span>
  );
}

/**
 * De werkbladen op papier, passend binnen de bladspiegel van `maten`. Een stuk
 * dat nog getekend wordt draagt `data-afdruk-laadt`; het printen wacht daarop.
 * Los te gebruiken: in hoofdstuk Berekeningen onder de paragraafkop, in de losse
 * uitdraai en bijlage A onder de kop van het blad.
 */
export function SpreadsheetVellen({ ex, maten }: { ex: Exemplaar; maten: Maten }) {
  // Rekenblad en rapport rekenen met de speling onderaan (AfdrukVoorbeeld).
  const stand = useWerkmapVellen(ex.xlsx?.data, maten.inhoud.breedte, maten.inhoud.hoogte - SPELING);
  const t = papier();
  if (!ex.xlsx) return <p className="print-pdf-melding">{t("spreadsheetBlad.ontbreekt")}</p>;
  if (!stand || stand.status === "laden") {
    return <p className="print-pdf-melding" data-afdruk-laadt="">{t("spreadsheetBlad.laden")}</p>;
  }
  if (stand.status === "fout") return <p className="print-pdf-melding">{t("spreadsheetBlad.fout", { fout: stand.fout })}</p>;
  if (stand.vellen.length === 0) return <p className="print-pdf-melding">{t("spreadsheetBlad.leeg")}</p>;
  return (
    <>
      {stand.vellen.map((v, i) => (
        <figure key={i} className={v.vervolg ? "print-xlsx print-nieuw-vel" : "print-xlsx"}>
          {v.blad && <figcaption>{v.blad}</figcaption>}
          <img src={v.url} alt={v.blad} style={{ width: `${v.breedte.toFixed(2)}mm`, height: `${v.hoogte.toFixed(2)}mm` }} />
        </figure>
      ))}
      {stand.afgekapt && <p className="print-pdf-melding">{t("spreadsheetBlad.afgekapt", { count: stand.vellen.length })}</p>}
    </>
  );
}

/**
 * Een spreadsheet-blad als eigen onderdeel van de uitdraai: de kop met nummer en
 * naam, daaronder de werkbladen. PrintBlad geeft zo'n blad hieraan door.
 */
export function SpreadsheetBladAfdruk({ ex, nummer, maten }: { ex: Exemplaar; nummer: number | string; maten: Maten }) {
  const t = papier();
  const onderkop = [t("spreadsheetBlad.soort"), ex.xlsx?.bestandsnaam].filter(Boolean).join(" · ");
  return (
    <section className="print-blad print-pdf">
      <header className="print-blad-kop">
        <span className="print-blad-nr">{nummer}</span>
        <span className="print-blad-titel">
          <span className="print-blad-naam">{ex.naam}</span>
          <span className="print-blad-norm">{onderkop}</span>
        </span>
      </header>
      <SpreadsheetVellen ex={ex} maten={maten} />
    </section>
  );
}
