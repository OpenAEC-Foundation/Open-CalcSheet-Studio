import { useMemo, useRef, type ReactNode } from "react";
import i18next, { type i18n } from "i18next";
import { I18nextProvider } from "react-i18next";
import type { Exemplaar } from "../../store/projectStore";
import { ExemplaarContext } from "../../store/actiefBlad";
import { designerVoor } from "./designerKeuze";
import { ucTekst, type Resultaat } from "./bladResultaat";
import { rekenversie } from "./bladVersie";
import { isPdfBlad } from "../../store/pdfBijlage";
import { PdfBladAfdruk } from "./PdfBladWeergave";
import { MATEN, type Maten } from "./paginering";
import { useDrieDAfdruk } from "./drieDBlok";
import { useIfcxAfdruk } from "./ifcxBlok";
import { useIframeAfdruk } from "./iframeBlok";
import { useJsAfdruk } from "./jsBlok";
import { schoonUitwerking } from "./uitwerkingOpschonen";
import "./PrintDocument.css";

/*
 * Eén rekenblad op papier. Staat los van PrintDocument omdat ook het
 * constructierapport het gebruikt (bijlage A); zo importeren het rapport en
 * PrintDocument elkaar niet over en weer.
 */

/*
 * De uitdraai is een Nederlands document, ook als de app in een andere taal
 * staat. Het rekenblad zelf is Nederlands; de parametrische beelden halen hun
 * teksten uit i18n (namespace "beelden") en volgen anders de taal van het
 * scherm. Daarom tekent PrintBlad ze met een eigen, Nederlandse kopie van
 * i18next. Die deelt de vertalingen met de app en wordt één keer gemaakt, bij
 * het eerste blad op papier: dan is de app-instantie zeker al ingesteld.
 */
let nederlands: i18n | null = null;
function nederlandseVertaling(): i18n {
  nederlands ??= i18next.cloneInstance({ lng: "nl" });
  return nederlands;
}

/**
 * De uitwerking van een blad op papier. Een 3D-blok (`@3d`, `@ifcx`) wordt hier een
 * stilstaande afbeelding (drieDBlok.ts, ifcxBlok.ts) en een bevestigde `@iframe`
 * de pagina (iframeBlok.ts), en een uitgevoerd `@js` zijn afbeelding of venster
 * (jsBlok.ts); het afdrukken wacht daarop. `bladId`: van welk blad dit is, want
 * alleen wat op dat blad is bevestigd, wordt uitgevoerd.
 */
export function UitwerkingHtml({ html, bladId }: { html: string; bladId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useDrieDAfdruk(ref, html);
  useIfcxAfdruk(ref, html);
  useIframeAfdruk(ref, html);
  useJsAfdruk(ref, html, bladId);
  // Hetzelfde object zolang de html gelijk blijft: React 19 zet de html bij
  // elk nieuw object opnieuw neer, en dan was de afbeelding weer weg.
  const inhoud = useMemo(() => ({ __html: schoonUitwerking(html) }), [html]);
  return <div ref={ref} className="ifc-calc" dangerouslySetInnerHTML={inhoud} />;
}

/** Het oordeel als klein label: groen, rood of neutraal. */
export function Oordeel({ r }: { r: Resultaat }) {
  if (r.voldoet === null) return <span className="print-oordeel neutraal">—</span>;
  return (
    <span className={`print-oordeel ${r.voldoet ? "goed" : "fout"}`}>
      {r.voldoet ? "voldoet" : "voldoet niet"}
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
 * Een PDF-blad gaat naar PdfBladAfdruk: zijn pagina's elk op een eigen vel,
 * geschaald binnen de bladspiegel van `maten` (de losse bladen of het
 * rapport). Een projectregel heeft het niet; er is niets mee gerekend.
 */
export function PrintBlad({ ex, html, nummer, resultaat, projectregel, titelInKop = false, maten = MATEN.bladen }: {
  ex: Exemplaar; html: string; nummer: number | string; resultaat: Resultaat; projectregel?: ReactNode;
  titelInKop?: boolean; maten?: Maten;
}) {
  if (isPdfBlad(ex)) return <PdfBladAfdruk ex={ex} nummer={nummer} maten={maten} />;
  // Het beeld tekent zichzelf uit de waarden van dít exemplaar, niet uit het
  // blad dat toevallig openstaat. `alleenLezen` houdt tegen dat het afdrukken
  // standaardwaarden aanvult of iets anders aan het project verandert. De
  // Nederlandse vertaling houdt de teksten van het beeld gelijk aan het blad.
  const beeld = designerVoor(ex.source);
  const onderkop = [resultaat.norm, projectregel ? "" : `rekenversie ${rekenversie(ex.source)}`]
    .filter(Boolean)
    .join(" · ");
  return (
    <section className={titelInKop && resultaat.norm ? "print-blad print-titel-in-kop" : "print-blad"}>
      <header className="print-blad-kop">
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
          <I18nextProvider i18n={nederlandseVertaling()}>
            <ExemplaarContext.Provider value={{ exemplaar: ex, alleenLezen: true }}>
              {beeld}
            </ExemplaarContext.Provider>
          </I18nextProvider>
        </div>
      )}
      <UitwerkingHtml html={html} bladId={ex.id} />
    </section>
  );
}
