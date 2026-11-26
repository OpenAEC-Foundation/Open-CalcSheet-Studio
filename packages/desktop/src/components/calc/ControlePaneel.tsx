import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useProjectStore, type Exemplaar } from "../../store/projectStore";
import {
  CONTROLE_UITKOMSTEN,
  bladHash,
  controleCsv,
  controleJson,
  controleStand,
  nieuweRegistratie,
  type BladHash,
  type ControleStand,
  type ControleUitkomst,
} from "../../store/controle";
import { rekenversie } from "./bladVersie";
import { bladHashNu } from "./controleHash";
import { bewaarTekst } from "./bewaarTekst";
import "./ControlePaneel.css";

/** De datum van vandaag als JJJJ-MM-DD, in de tijdzone van de gebruiker. */
function vandaag(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const kort = (h: string) => h.slice(0, 12);

/** De hash van een blad zoals het nu is, met alles waarmee het rekent. */
export function useBladHashNu(ex: Exemplaar, aan = true): BladHash | null {
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const gegevens = useProjectStore((s) => s.gegevens);
  const belastingen = useProjectStore((s) => s.rapport.belastingen);
  const rapportTaal = useProjectStore((s) => s.rapport.taal);
  return useMemo(
    () => (aan ? bladHashNu(ex, exemplaren, gegevens, belastingen, rapportTaal) : null),
    [aan, ex, exemplaren, gegevens, belastingen, rapportTaal],
  );
}

/** De stand in één zin, voor het paneel en de kop op papier. */
export function standTekst(t: (s: string, o?: Record<string, unknown>) => string, stand: ControleStand): string {
  if (stand.soort === "geen") return t("controle.standGeen");
  const r = stand.laatste;
  const wie = { naam: r.controleur, datum: r.datum, hash: kort(r.hash.totaal) };
  const delen = "gewijzigd" in stand ? stand.gewijzigd.map((d) => t(`controle.deel.${d}`)).join(", ") : "";
  if (stand.soort === "vrijgegeven") return t("controle.standVrijgegeven", wie);
  if (stand.soort === "vervallen") return t("controle.standVervallen", { ...wie, delen });
  const uitkomst = t(`controle.uitkomsten.${r.uitkomst}`);
  return delen
    ? t("controle.standGecontroleerdGewijzigd", { ...wie, uitkomst, delen })
    : t("controle.standGecontroleerd", { ...wie, uitkomst });
}

/**
 * De tab Controle van een blad: de toetsregistratie (vier ogen, store/controle.ts). Bovenaan
 * de stand van nu, daaronder een nieuwe controle vastleggen, de eerdere controles, en het
 * exporteren van alle controles van het project.
 */
export default function ControlePaneel({ ex }: { ex: Exemplaar }) {
  const { t } = useTranslation("werkruimte");
  const registreer = useProjectStore((s) => s.registreerControle);
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const gegevens = useProjectStore((s) => s.gegevens);
  const belastingen = useProjectStore((s) => s.rapport.belastingen);
  const rapportTaal = useProjectStore((s) => s.rapport.taal);
  const projectNaam = useProjectStore((s) => s.projectNaam);
  const nu = useBladHashNu(ex);
  const stand = controleStand(ex.controle, nu);
  const vorige = ex.controle?.registraties[ex.controle.registraties.length - 1];
  const [controleur, zetControleur] = useState(vorige?.controleur ?? "");
  const [datum, zetDatum] = useState(vandaag());
  const [uitkomst, zetUitkomst] = useState<ControleUitkomst>("akkoord");
  const [opmerkingen, zetOpmerkingen] = useState("");
  const [vrijgeven, zetVrijgeven] = useState(true);
  const [melding, zetMelding] = useState("");

  const kan = controleur.trim() !== "" && /^\d{4}-\d{2}-\d{2}$/.test(datum) && nu !== null;
  const vastleggen = () => {
    if (!kan || !nu) return;
    registreer(ex.id, nieuweRegistratie({ controleur, datum, uitkomst, opmerkingen, vrijgeven }, nu, rekenversie(ex.source)));
    zetOpmerkingen("");
    zetMelding(t("controle.vastgelegd"));
  };

  const exporteer = async (soort: "csv" | "json") => {
    // Alle bladen van het project, elk met zijn hash van nu.
    const bladen = exemplaren.map((e) => ({
      id: e.id, ref: e.ref, naam: e.naam, controle: e.controle,
      nu: e.controle ? bladHashNu(e, exemplaren, gegevens, belastingen, rapportTaal) : null,
    }));
    const basis = (projectNaam || "project").replace(/[\\/:*?"<>|]+/g, " ").trim();
    const gelukt = soort === "csv"
      ? await bewaarTekst(controleCsv(bladen), `${basis} - controle.csv`, { naam: "CSV", extensie: "csv", mime: "text/csv" })
      : await bewaarTekst(controleJson(bladen, projectNaam), `${basis} - controle.json`, { naam: "JSON", extensie: "json", mime: "application/json" });
    if (gelukt) zetMelding(t("controle.geexporteerd"));
  };

  const klasse = stand.soort === "vrijgegeven" ? "goed" : stand.soort === "vervallen" ? "fout" : stand.soort === "geen" ? "" : "let-op";
  const registraties = [...(ex.controle?.registraties ?? [])].reverse();

  return (
    <div className="controle-paneel">
      <header className="controle-kop">
        <h2>{t("controle.titel")}</h2>
        <p className="controle-uitleg">{t("controle.uitleg")}</p>
        <p className={`controle-stand ${klasse}`} data-stand={stand.soort}>{standTekst(t, stand)}</p>
        <p className="controle-hash">
          {nu ? t("controle.hashNu", { hash: kort(nu.totaal) }) : t("controle.rekentNiet")}
        </p>
      </header>

      <section className="controle-vak">
        <h3>{t("controle.nieuw")}</h3>
        <div className="controle-velden">
          <label>
            <span>{t("controle.controleur")}</span>
            <input type="text" value={controleur} onChange={(e) => zetControleur(e.target.value)} />
          </label>
          <label>
            <span>{t("controle.datum")}</span>
            <input type="date" value={datum} onChange={(e) => zetDatum(e.target.value)} />
          </label>
          <label>
            <span>{t("controle.uitkomst")}</span>
            <select value={uitkomst} onChange={(e) => zetUitkomst(e.target.value as ControleUitkomst)}>
              {CONTROLE_UITKOMSTEN.map((u) => (
                <option key={u} value={u}>{t(`controle.uitkomsten.${u}`)}</option>
              ))}
            </select>
          </label>
          <label className="controle-breed">
            <span>{t("controle.opmerkingen")}</span>
            <textarea rows={3} value={opmerkingen} onChange={(e) => zetOpmerkingen(e.target.value)} />
          </label>
          <label className="controle-vink">
            <input type="checkbox" checked={vrijgeven && uitkomst !== "afgekeurd"} disabled={uitkomst === "afgekeurd"}
              onChange={(e) => zetVrijgeven(e.target.checked)} />
            <span>{t("controle.vrijgeven")}</span>
          </label>
        </div>
        <div className="controle-knoppen">
          <button type="button" className="controle-hoofd" disabled={!kan} onClick={vastleggen}>{t("controle.vastleggen")}</button>
          {melding && <span className="controle-melding">{melding}</span>}
        </div>
      </section>

      <section className="controle-vak">
        <h3>{t("controle.eerder")}</h3>
        {registraties.length === 0 ? (
          <p className="controle-leeg">{t("controle.geenEerder")}</p>
        ) : (
          <table className="controle-tabel">
            <thead>
              <tr>
                <th>{t("controle.datum")}</th>
                <th>{t("controle.controleur")}</th>
                <th>{t("controle.uitkomst")}</th>
                <th>{t("controle.vrijgave")}</th>
                <th>{t("controle.opmerkingen")}</th>
                <th>{t("controle.hash")}</th>
              </tr>
            </thead>
            <tbody>
              {registraties.map((r) => (
                <tr key={r.id}>
                  <td>{r.datum}</td>
                  <td>{r.controleur}</td>
                  <td>{t(`controle.uitkomsten.${r.uitkomst}`)}</td>
                  <td>{r.vrijgegeven ? t("controle.ja") : t("controle.nee")}</td>
                  <td className="controle-opm">{r.opmerkingen}</td>
                  <td><code title={r.hash.totaal}>{kort(r.hash.totaal)}</code>{nu && r.hash.totaal === nu.totaal && <span className="controle-zelfde" title={t("controle.zelfdeUitleg")}> {t("controle.zelfde")}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="controle-vak">
        <h3>{t("controle.exporteren")}</h3>
        <p className="controle-uitleg">{t("controle.exportUitleg")}</p>
        <div className="controle-knoppen">
          <button type="button" onClick={() => void exporteer("csv")}>{t("controle.exportCsv")}</button>
          <button type="button" onClick={() => void exporteer("json")}>{t("controle.exportJson")}</button>
        </div>
      </section>
    </div>
  );
}

/**
 * Het label in de tabbalk van een blad met een controle. Vergelijkt alleen de rekentekst en
 * de invoer (snel, bij elke toetsaanslag); de tab Controle en de kop op papier rekenen ook
 * de uitkomst na.
 */
export function ControleLabel({ ex }: { ex: Exemplaar }) {
  const { t } = useTranslation("werkruimte");
  const laatste = ex.controle?.registraties[ex.controle.registraties.length - 1];
  const zelfde = useMemo(() => {
    if (!laatste) return true;
    const h = bladHash(ex.source, ex.waarden, { uc: null, voldoet: null, getallen: {} });
    return h.rekentekst === laatste.hash.rekentekst && h.invoer === laatste.hash.invoer;
  }, [ex.source, ex.waarden, laatste]);
  if (!laatste) return null;
  const [klasse, sleutel] = laatste.vrijgegeven
    ? zelfde ? ["goed", "controle.labelVrijgegeven"] : ["fout", "controle.labelVervallen"]
    : ["let-op", "controle.labelGecontroleerd"];
  return <span className={`controle-label ${klasse}`} title={t("controle.labelUitleg")}>{t(sleutel)}</span>;
}

/**
 * De controle in de kop van een blad op papier: wie, wanneer, en of de vrijgave nog geldt,
 * met de verkorte hash. Alleen bij een blad met een controle; anders blijft de kop gelijk.
 */
export function ControleKop({ ex }: { ex: Exemplaar }) {
  const { t } = useTranslation("werkruimte");
  const nu = useBladHashNu(ex, !!ex.controle);
  if (!ex.controle) return null;
  const stand = controleStand(ex.controle, nu);
  return <span className={`print-blad-norm print-blad-controle ${stand.soort}`}>{standTekst(t, stand)}</span>;
}
