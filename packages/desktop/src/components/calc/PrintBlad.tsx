import type { ReactNode } from "react";
import i18next from "i18next";
import type { Exemplaar } from "../../store/projectStore";
import { ExemplaarContext } from "../../store/actiefBlad";
import { designerVoor } from "./designerKeuze";
import { ucTekst, type Resultaat } from "./bladResultaat";
import { rekenversie } from "./bladVersie";
import { bladSoortVan, LosBladAfdruk } from "./bladSoorten";
import { MATEN, type Maten } from "./paginering";
import { UitwerkingHtml } from "./UitwerkingHtml";
import "./PrintDocument.css";

/*
 * Eén rekenblad op papier. Staat los van PrintDocument omdat ook het
 * constructierapport het gebruikt (bijlage A); zo importeren het rapport en
 * PrintDocument elkaar niet over en weer.
 */

/*
 * De uitdraai volgt de taal van de app, net als de uitwerking op het scherm: het
 * rekenblad (bladDoorrekenen.ts) en de parametrische beelden (namespace "beelden").
 * Voor een Nederlands rapport staat de app op Nederlands. Eerder was de afdruk altijd
 * Nederlands; die keuze is vervallen.
 */

/** Het oordeel als klein label: groen, rood of neutraal. */
export function Oordeel({ r }: { r: Resultaat }) {
  if (r.nietGetoetst) return <span className="print-oordeel neutraal">{i18next.t("beelden:kit.nietGetoetst")}</span>;
  if (r.voldoet === null) return <span className="print-oordeel neutraal">—</span>;
  return (
    <span className={`print-oordeel ${r.voldoet ? "goed" : "fout"}`}>
      {i18next.t(r.voldoet ? "beelden:afdruk.voldoet" : "beelden:afdruk.voldoetNiet")}
    </span>
  );
}

/**
 * Eén rekenblad in de uitdraai: de kop, het parametrische beeld, dan de
 * uitwerking. `nummer` is het volgnummer bij de losse bladen en het
 * bijlagenummer ("A.2") in het rapport.
 *
 * De rekenversie van het blad (bladVersie.ts) staat één keer op papier: in de
 * projectregel als die er is (een losse berekening), anders achter de
 * grondslag in de kop.
 *
 * `titelInKop`: de titelkop bovenaan de uitwerking vervalt, omdat de kop al
 * naam en grondslag noemt (bijlage A van het rapport). Alleen als er een
 * grondslag is: zonder staat de titel van de module nergens anders.
 *
 * Een blad van een aangemelde soort (bladSoorten.tsx, zoals een PDF of werkmap)
 * tekent zijn eigen onderdeel, binnen de bladspiegel van `maten` (de losse bladen
 * of het rapport). Een projectregel heeft het niet; er is niets mee gerekend.
 *
 * `anker`: de plek van de kop voor de inhoudsopgave van het rapport.
 */
export function PrintBlad({ ex, html, nummer, resultaat, projectregel, titelInKop = false, maten = MATEN.bladen, anker }: {
  ex: Exemplaar; html: string; nummer: number | string; resultaat: Resultaat; projectregel?: ReactNode;
  titelInKop?: boolean; maten?: Maten; anker?: string;
}) {
  const soort = bladSoortVan(ex);
  if (soort) return <LosBladAfdruk soort={soort} ex={ex} nummer={nummer} maten={maten} anker={anker} />;
  // Het beeld tekent zichzelf uit de waarden van dít exemplaar, niet uit het
  // blad dat toevallig openstaat. `alleenLezen` houdt tegen dat het afdrukken
  // standaardwaarden aanvult of iets anders aan het project verandert.
  const beeld = designerVoor(ex.source);
  const onderkop = [resultaat.norm, projectregel ? "" : `${i18next.t("beelden:afdruk.rekenversieKlein")} ${rekenversie(ex.source)}`]
    .filter(Boolean)
    .join(" · ");
  return (
    <section className={titelInKop && resultaat.norm ? "print-blad print-titel-in-kop" : "print-blad"}>
      <header className="print-blad-kop" data-inhoud={anker}>
        <span className="print-blad-nr">{nummer}</span>
        <span className="print-blad-titel">
          <span className="print-blad-naam">{ex.naam}</span>
          {onderkop && <span className="print-blad-norm">{onderkop}</span>}
        </span>
        <span className="print-blad-uitkomst">
          {resultaat.uc !== null && <span className="print-blad-uc">UC {ucTekst(resultaat.uc)}</span>}
          <Oordeel r={resultaat} />
        </span>
      </header>
      {projectregel}
      {beeld && (
        <div className="print-beeld">
          <ExemplaarContext.Provider value={{ exemplaar: ex, alleenLezen: true }}>
            {beeld}
          </ExemplaarContext.Provider>
        </div>
      )}
      <UitwerkingHtml html={html} bladId={ex.id} />
    </section>
  );
}
