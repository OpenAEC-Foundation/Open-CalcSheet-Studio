import { useMemo, useRef } from "react";
import { render } from "@ifc-calc/core";
import type { Exemplaar } from "../../store/projectStore";
import { rekenGraaf, bekijkUitkomsten } from "../../graaf/rekenen";
import { graafSvg } from "../../graaf/papier";
import { graafScene } from "../../graaf/scene";
import { waardeTekst } from "../../graaf/waarde";
import { useDrieDAfdruk } from "../calc/drieDBlok";
import { papier } from "../calc/pdfBlad";
import type { Maten } from "../calc/paginering";
import { meldingTekst, nodeNaam, poortTekst } from "./graafTeksten";
import "./GraafBlad.css";

/*
 * Een grafblad op papier: de graaf als afbeelding, het 3D-voorbeeld en de
 * uitkomsten van de bekijk-nodes in een tabel.
 *
 * Het 3D-voorbeeld is hetzelfde blok als `@3d` in een rekenblad (de kern schrijft
 * het, `useDrieDAfdruk` tekent het): dezelfde afbeelding, en het afdrukken en de
 * verdeling over de vellen wachten erop zoals bij elk 3D-blok.
 */

/** Zoveel van de bladspiegel mag de graaf hoog zijn; daaronder is nog plek voor 3D en tabel. */
const GRAAF_MAX_HOOGTE = 0.55;

/**
 * De drie delen van een grafblad, passend binnen de bladspiegel van `maten`. Los
 * te gebruiken: in hoofdstuk Berekeningen onder de paragraafkop, in de losse
 * uitdraai en bijlage A onder de kop van het blad.
 */
export function GraafVellen({ ex, maten }: { ex: Exemplaar; maten: Maten }) {
  const t = papier();
  const graaf = ex.graaf;
  const uitkomst = useMemo(() => (graaf ? rekenGraaf(graaf) : null), [graaf]);
  const tekening = useMemo(() => {
    if (!graaf || !uitkomst) return null;
    const v = (sleutel: string, opties?: Record<string, unknown>) => t(`werkruimte:${sleutel}`, opties ?? {}) as string;
    return graafSvg(graaf, uitkomst, {
      naamVan: (n) => nodeNaam(v, n),
      poort: (n, naam) => poortTekst(v, n, naam),
      melding: (m, n) => meldingTekst(v, m, n),
      meer: (count) => v("graaf.meer", { count }),
    });
    // De teksten volgen de taal van de app; de uitdraai wordt per taalwissel opnieuw opgebouwd.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graaf, uitkomst]);
  const html3d = useMemo(() => {
    if (!uitkomst || uitkomst.geometrie.length === 0) return "";
    return render([{ type: "3d", scene: graafScene(uitkomst.geometrie), meldingen: [] }]);
  }, [uitkomst]);
  const ref = useRef<HTMLDivElement>(null);
  useDrieDAfdruk(ref, html3d);
  const inhoud3d = useMemo(() => ({ __html: html3d }), [html3d]);

  if (!graaf || !uitkomst || !tekening) return <p className="print-pdf-melding">{t("graafBlad.ontbreekt")}</p>;
  if (graaf.nodes.length === 0) return <p className="print-pdf-melding">{t("graafBlad.leeg")}</p>;

  const v = (sleutel: string, opties?: Record<string, unknown>) => t(`werkruimte:${sleutel}`, opties ?? {}) as string;
  const tabel = bekijkUitkomsten(graaf, uitkomst);
  // Schaal uit de bladspiegel: de hele breedte, tenzij de graaf dan te hoog wordt.
  const maxB = maten.inhoud.breedte;
  const maxH = maten.inhoud.hoogte * GRAAF_MAX_HOOGTE;
  const schaal = Math.min(maxB / tekening.breedte, maxH / tekening.hoogte);
  return (
    <>
      <figure className="print-graaf">
        <div
          className="print-graaf-tekening"
          style={{ width: `${(tekening.breedte * schaal).toFixed(2)}mm`, height: `${(tekening.hoogte * schaal).toFixed(2)}mm` }}
          dangerouslySetInnerHTML={{ __html: tekening.svg }}
        />
      </figure>
      {html3d && <div ref={ref} className="ifc-calc" dangerouslySetInnerHTML={inhoud3d} />}
      {tabel.length > 0 && (
        <table className="print-graaf-tabel">
          <thead>
            <tr>
              <th>{t("graafBlad.naam")}</th>
              <th>{t("graafBlad.uitkomst")}</th>
            </tr>
          </thead>
          <tbody>
            {tabel.map((r) => (
              <tr key={r.id}>
                <td>{r.naam || (r.bronSoort ? v(`graaf.soort.${r.bronSoort}`, { defaultValue: r.bronSoort }) : t("graafBlad.zonderNaam"))}</td>
                <td>{r.fouten.length > 0 ? meldingTekst(v, r.fouten[0], graaf.nodes.find((n) => n.id === r.id)!) : waardeTekst(r.waarde)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

/**
 * Een grafblad als eigen onderdeel van de uitdraai: de kop met nummer en naam,
 * daaronder de delen. PrintBlad geeft zo'n blad hieraan door.
 */
export function GraafBladAfdruk({ ex, nummer, maten }: { ex: Exemplaar; nummer: number | string; maten: Maten }) {
  const t = papier();
  return (
    <section className="print-blad print-pdf">
      <header className="print-blad-kop">
        <span className="print-blad-nr">{nummer}</span>
        <span className="print-blad-titel">
          <span className="print-blad-naam">{ex.naam}</span>
          <span className="print-blad-norm">{t("graafBlad.soort")}</span>
        </span>
      </header>
      <GraafVellen ex={ex} maten={maten} />
    </section>
  );
}

