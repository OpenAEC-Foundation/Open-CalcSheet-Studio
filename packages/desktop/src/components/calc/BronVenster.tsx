import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../Modal";
import { useBronVenster } from "./bronnen";
import { bronPagina } from "./pdfBlad";

/**
 * Een PDF van schijf, geopend vanuit een verwijzing (`@bron "pad.pdf" p. 57`): één pagina
 * tegelijk, met vorige en volgende. Alleen in de app: de browser kan geen pad lezen. Het
 * bestand wordt bij elke opening opnieuw gelezen en niet bewaard.
 */
export default function BronVenster() {
  const { t } = useTranslation("werkruimte");
  const pad = useBronVenster((s) => s.pad);
  const gevraagd = useBronVenster((s) => s.pagina);
  const [bytes, zetBytes] = useState<Uint8Array | null>(null);
  const [pagina, zetPagina] = useState(gevraagd);
  const [beeld, zetBeeld] = useState<{ url: string; aantal: number } | null>(null);
  const [fout, zetFout] = useState<string | null>(null);

  useEffect(() => {
    zetBytes(null);
    zetBeeld(null);
    zetFout(null);
    zetPagina(gevraagd);
    if (!pad) return;
    let weg = false;
    (async () => {
      try {
        const { readFile } = await import("@tauri-apps/plugin-fs");
        const b = await readFile(pad);
        if (!weg) zetBytes(b);
      } catch (err) {
        if (!weg) zetFout(t("bron.leesFout", { pad, fout: (err as Error).message ?? String(err) }));
      }
    })();
    return () => {
      weg = true;
    };
  }, [pad, gevraagd, t]);

  useEffect(() => {
    if (!bytes) return;
    let weg = false;
    let url: string | null = null;
    bronPagina(bytes, pagina)
      .then((p) => {
        url = p.url;
        if (weg) URL.revokeObjectURL(p.url);
        else zetBeeld({ url: p.url, aantal: p.aantal });
      })
      .catch((err) => {
        if (!weg) zetFout(t("bron.pdfFout", { fout: (err as Error).message ?? String(err) }));
      });
    return () => {
      weg = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [bytes, pagina, t]);

  const sluit = () => useBronVenster.setState({ pad: null });
  const naam = pad?.split(/[\\/]/).pop() ?? "";
  return (
    <Modal open={!!pad} onClose={sluit} title={t("bron.venster", { naam })} width={820} height="88vh">
      <div className="bron-venster">
        <div className="bron-venster-balk">
          <button type="button" disabled={pagina <= 1} onClick={() => zetPagina((p) => p - 1)}>{t("bron.vorige")}</button>
          <span>{beeld ? t("bron.paginaVan", { pagina, aantal: beeld.aantal }) : t("bron.laden")}</span>
          <button type="button" disabled={!beeld || pagina >= beeld.aantal} onClick={() => zetPagina((p) => p + 1)}>{t("bron.volgende")}</button>
          <span className="bron-venster-pad" title={pad ?? ""}>{pad}</span>
        </div>
        {fout && <p className="bron-venster-fout">{fout}</p>}
        {beeld && <img className="bron-venster-pagina" src={beeld.url} alt={t("bron.paginaVan", { pagina, aantal: beeld.aantal })} />}
      </div>
    </Modal>
  );
}
