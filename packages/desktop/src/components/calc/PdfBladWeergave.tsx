import { useTranslation } from "react-i18next";
import { useProjectStore, type Exemplaar } from "../../store/projectStore";
import { base64Bytes, grootteTekst } from "../../store/pdfBijlage";
import { kiesPdfBijlage, papier, usePdfPaginas } from "./pdfBlad";
import { SPELING, type Maten } from "./paginering";
import "./PdfBladWeergave.css";

/*
 * Een PDF-blad in beeld en op papier (zie store/pdfBijlage.ts en pdfBlad.ts).
 *
 * In de werkruimte: de pagina's onder elkaar, zoals in een PDF-lezer. Op
 * papier: elke pagina een eigen vel, passend geschaald binnen de bladspiegel,
 * met de loopkop en -voet van de uitdraai of de voet van het rapport eromheen.
 * De eerste pagina laat boven zich ruimte voor de kop van het blad.
 */

/** Millimeter per punt (1/72 inch). */
const MM_PER_PT = 25.4 / 72;

/**
 * Ruimte boven de eerste pagina, in millimeter: de kop van het blad (losse
 * uitdraai en bijlage A) of de paragraafkop in hoofdstuk Berekeningen. Ruim
 * genomen; een pagina die er net niet onder past, zou de kop alleen op een
 * vel laten staan.
 */
const KOP_RUIMTE = 20;

/** Werkruimte: de pagina's van de PDF onder elkaar. */
export function PdfBladWeergave({ ex }: { ex: Exemplaar }) {
  const { t } = useTranslation("werkruimte");
  const stand = usePdfPaginas(ex.pdf?.data);
  return (
    <div className="pdf-weergave">
      {!ex.pdf ? (
        <p className="pdf-melding">{t("pdf.ontbreekt")}</p>
      ) : stand?.status === "fout" && stand.paginas.length === 0 ? (
        <p className="pdf-melding fout">{t("pdf.fout", { fout: stand.fout })}</p>
      ) : !stand || stand.paginas.length === 0 ? (
        <p className="pdf-melding">{t("pdf.laden")}</p>
      ) : (
        <div className="pdf-weergave-paginas">
          {stand.paginas.map((p, i) => (
            <div
              key={i}
              className="pdf-weergave-pagina"
              // Tot de ware grootte (96 dpi) maal 1,25, en smaller als het paneel smaller is.
              style={{ maxWidth: `${Math.round((p.breedte * 96 * 1.25) / 72)}px`, aspectRatio: `${p.breedte} / ${p.hoogte}` }}
            >
              {p.url ? (
                <img src={p.url} alt={t("pdf.pagina", { nummer: i + 1 })} draggable={false} />
              ) : (
                <span>{t(p.mislukt ? "pdf.paginaMislukt" : "pdf.paginaLaden", { nummer: i + 1 })}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Kop van het paneel: bestandsnaam, aantal pagina's en grootte, en vervangen. */
export function PdfBladInfo({ ex }: { ex: Exemplaar }) {
  const { t, i18n } = useTranslation("werkruimte");
  const stand = usePdfPaginas(ex.pdf?.data);
  const zetPdf = useProjectStore((s) => s.zetPdf);
  const delen = ex.pdf
    ? [
        ex.pdf.bestandsnaam,
        stand && stand.paginas.length > 0 ? t("pdf.paginas", { count: stand.paginas.length }) : "",
        grootteTekst(base64Bytes(ex.pdf.data), i18n.language),
      ]
    : [];
  const vervang = async () => {
    try {
      const pdf = await kiesPdfBijlage();
      if (pdf) zetPdf(ex.id, pdf);
    } catch (err) {
      console.error("PDF vervangen mislukt:", err);
      alert(t("pdf.lezenMislukt", { fout: (err as Error)?.message ?? String(err) }));
    }
  };
  return (
    <span className="pdf-info">
      <span className="pdf-info-tekst" title={delen.filter(Boolean).join(" · ")}>{delen.filter(Boolean).join(" · ")}</span>
      <button className="pdf-vervang" onClick={() => void vervang()} title={t("pdf.vervangenUitleg")}>
        {t("pdf.vervangen")}
      </button>
    </span>
  );
}

/**
 * De pagina's op papier, elk op een eigen vel en passend geschaald binnen de
 * bladspiegel van `maten`. De eerste pagina deelt zijn vel met de kop erboven;
 * na elke pagina begint een nieuw vel (`print-nieuw-vel` en `print-vel-af`, zie
 * paginering.ts), zodat ook de volgende paragraaf niet op het vel van een
 * liggende pagina doorloopt. Een pagina die nog getekend wordt draagt
 * `data-afdruk-laadt`; het printen wacht daarop.
 *
 * Het afdrukonderdeel van een PDF-blad (bladSoorten.tsx): in hoofdstuk Berekeningen
 * onder de paragraafkop, in de losse uitdraai en bijlage A onder de kop van het blad.
 */
export function PdfPaginas({ ex, maten }: { ex: Exemplaar; maten: Maten }) {
  const stand = usePdfPaginas(ex.pdf?.data);
  const t = papier();
  if (!ex.pdf) return <p className="print-pdf-melding">{t("pdfBlad.ontbreekt")}</p>;
  if (!stand || stand.paginas.length === 0) {
    return stand?.status === "fout" ? (
      <p className="print-pdf-melding">{t("pdfBlad.fout", { fout: stand.fout })}</p>
    ) : (
      <p className="print-pdf-melding" data-afdruk-laadt="">{t("pdfBlad.laden")}</p>
    );
  }
  // Rekenblad en rapport rekenen met de speling onderaan (AfdrukVoorbeeld).
  const breedte = maten.inhoud.breedte;
  const hoogte = maten.inhoud.hoogte - SPELING;
  return (
    <>
      {stand.paginas.map((p, i) => {
        const b = p.breedte * MM_PER_PT;
        const h = p.hoogte * MM_PER_PT;
        const schaal = Math.min(breedte / b, (hoogte - (i === 0 ? KOP_RUIMTE : 0)) / h);
        const klaar = p.url !== null || p.mislukt === true;
        return (
          <figure
            key={i}
            className={i === 0 ? "print-pdf-pagina print-vel-af" : "print-pdf-pagina print-nieuw-vel print-vel-af"}
            style={{ width: `${(b * schaal).toFixed(2)}mm`, height: `${(h * schaal).toFixed(2)}mm` }}
            data-afdruk-laadt={klaar ? undefined : ""}
          >
            {p.url ? (
              <img src={p.url} alt="" />
            ) : p.mislukt ? (
              <span>{t("pdfBlad.paginaMislukt", { nummer: i + 1 })}</span>
            ) : null}
          </figure>
        );
      })}
    </>
  );
}
