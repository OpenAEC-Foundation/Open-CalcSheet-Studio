import { useMemo, useRef, useState } from "react";
import { create } from "zustand";
import { useTranslation } from "react-i18next";
import Modal from "../Modal";
import { useProjectStore, type Exemplaar } from "../../store/projectStore";
import { GeenProjectFout, leesProjectBestand, type GelezenProject } from "../../store/projectBestand";
import { koppelBladen, metContext, paarSoort, regelVerschil, tabelVerschil, type BladPaar, type TabelRij } from "../../store/vergelijken";
import { bladUitkomsten } from "./controleHash";
import { ucTekst } from "./bladLezen";
import "./VergelijkVenster.css";

/** Open of dicht; het lint opent het venster (CalcTab.tsx). */
export const useVergelijkVenster = create<{ open: boolean }>(() => ({ open: false }));

const procent = (v: number, taal: string) => `${v > 0 ? "+" : ""}${(v * 100).toLocaleString(taal, { maximumFractionDigits: 2 })} %`;

/** Een tabel met twee kolommen naast elkaar; verschillen gemarkeerd. */
function Tabel({ rijen, alleenVerschil, kop }: { rijen: TabelRij[]; alleenVerschil: boolean; kop: [string, string, string] }) {
  const { t, i18n } = useTranslation("werkruimte");
  const getoond = alleenVerschil ? rijen.filter((r) => !r.gelijk) : rijen;
  if (getoond.length === 0) return <p className="vg-leeg">{t("vergelijken.geenVerschil")}</p>;
  return (
    <table className="vg-tabel">
      <thead>
        <tr>
          <th>{kop[0]}</th>
          <th>{kop[1]}</th>
          <th>{kop[2]}</th>
          <th>{t("vergelijken.verschil")}</th>
        </tr>
      </thead>
      <tbody>
        {getoond.map((r) => (
          <tr key={r.naam} className={r.gelijk ? "" : r.links === undefined ? "vg-erbij" : r.rechts === undefined ? "vg-weg" : "vg-anders"}>
            <td><code>{r.naam}</code></td>
            <td>{r.links ?? <i>{t("vergelijken.ontbreekt")}</i>}</td>
            <td>{r.rechts ?? <i>{t("vergelijken.ontbreekt")}</i>}</td>
            <td>{r.verschil !== undefined ? procent(r.verschil, i18n.language) : ""}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** De rekentekst naast elkaar: links het project, rechts het bestand. */
function Regels({ links, rechts, heel }: { links: string; rechts: string; heel: boolean }) {
  const { t } = useTranslation("werkruimte");
  const rijen = useMemo(() => regelVerschil(links, rechts), [links, rechts]);
  const getoond = heel ? rijen : metContext(rijen, 2);
  if (!rijen.some((r) => r.soort !== "gelijk")) return <p className="vg-leeg">{t("vergelijken.tekstGelijk")}</p>;
  return (
    <table className="vg-regels">
      <tbody>
        {getoond.map((r, i) =>
          r === null ? (
            <tr key={`s${i}`} className="vg-sprong"><td colSpan={4}>…</td></tr>
          ) : (
            <tr key={i} className={`vg-${r.soort}`}>
              <td className="vg-nr">{r.links?.nr ?? ""}</td>
              <td className="vg-code vg-links">{r.links?.tekst ?? ""}</td>
              <td className="vg-nr">{r.rechts?.nr ?? ""}</td>
              <td className="vg-code vg-rechts">{r.rechts?.tekst ?? ""}</td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

/** Het oordeel als tekst: UC en voldoet/voldoet niet/niet getoetst. */
function oordeelTekst(t: (s: string, o?: Record<string, unknown>) => string, r: ReturnType<typeof bladUitkomsten>): string {
  if (r.fout) return t("vergelijken.rekentNiet");
  const res = r.resultaat;
  if (!res) return "—";
  if (res.nietGetoetst) return t("browser.nietGetoetst");
  const uc = res.uc !== null ? `UC ${ucTekst(res.uc)}` : "";
  const oordeel = res.voldoet === null ? "" : t(res.voldoet ? "vergelijken.voldoet" : "vergelijken.voldoetNiet");
  return [uc, oordeel].filter(Boolean).join(" · ") || "—";
}

function PaarDetail({ paar, daar }: { paar: BladPaar<Exemplaar>; daar: GelezenProject }) {
  const { t } = useTranslation("werkruimte");
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const gegevens = useProjectStore((s) => s.gegevens);
  const belastingen = useProjectStore((s) => s.rapport.belastingen);
  const rapportTaal = useProjectStore((s) => s.rapport.taal);
  const [heel, zetHeel] = useState(false);
  const [alleenVerschil, zetAlleenVerschil] = useState(true);
  const links = useMemo(
    () => (paar.hier ? bladUitkomsten(paar.hier, exemplaren, gegevens, belastingen, rapportTaal) : null),
    [paar.hier, exemplaren, gegevens, belastingen, rapportTaal],
  );
  const rechts = useMemo(
    () => (paar.daar ? bladUitkomsten(paar.daar, daar.exemplaren, daar.gegevens, daar.rapport?.belastingen, daar.rapport?.taal) : null),
    [paar.daar, daar],
  );
  const kop: [string, string, string] = [t("vergelijken.naam"), t("vergelijken.hier"), t("vergelijken.daar")];
  return (
    <div className="vg-detail">
      <div className="vg-opties">
        <label><input type="checkbox" checked={alleenVerschil} onChange={(e) => zetAlleenVerschil(e.target.checked)} /> {t("vergelijken.alleenVerschil")}</label>
        <label><input type="checkbox" checked={heel} onChange={(e) => zetHeel(e.target.checked)} /> {t("vergelijken.heleTekst")}</label>
      </div>

      <h4>{t("vergelijken.oordeel")}</h4>
      <table className="vg-tabel vg-oordeel">
        <tbody>
          <tr className={links && rechts && oordeelTekst(t, links) !== oordeelTekst(t, rechts) ? "vg-anders" : ""}>
            <td>{links ? oordeelTekst(t, links) : <i>{t("vergelijken.ontbreekt")}</i>}</td>
            <td>{rechts ? oordeelTekst(t, rechts) : <i>{t("vergelijken.ontbreekt")}</i>}</td>
          </tr>
        </tbody>
      </table>

      <h4>{t("vergelijken.rekentekst")}</h4>
      <Regels links={paar.hier?.source ?? ""} rechts={paar.daar?.source ?? ""} heel={heel} />

      <h4>{t("vergelijken.invoer")}</h4>
      <Tabel rijen={tabelVerschil(paar.hier?.waarden ?? {}, paar.daar?.waarden ?? {})} alleenVerschil={alleenVerschil} kop={kop} />

      <h4>{t("vergelijken.uitkomsten")}</h4>
      <Tabel rijen={tabelVerschil(links?.waarden ?? {}, rechts?.waarden ?? {})} alleenVerschil={alleenVerschil} kop={kop} />
    </div>
  );
}

/**
 * Het project dat openstaat naast een gekozen bestand: de projectgegevens, en per blad de
 * rekentekst, de invoer, het oordeel en de uitkomsten naast elkaar, met de verschillen
 * gemarkeerd (store/vergelijken.ts). Het gekozen bestand wordt alleen gelezen en
 * doorgerekend, nooit geopend of veranderd.
 */
export default function VergelijkVenster() {
  const { t } = useTranslation("werkruimte");
  const open = useVergelijkVenster((s) => s.open);
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const gegevens = useProjectStore((s) => s.gegevens);
  const [daar, zetDaar] = useState<{ naam: string; project: GelezenProject } | null>(null);
  const [fout, zetFout] = useState<string | null>(null);
  const [gekozen, zetGekozen] = useState(0);
  const kiezer = useRef<HTMLInputElement>(null);

  const paren = useMemo(() => (daar ? koppelBladen(exemplaren, daar.project.exemplaren) : []), [exemplaren, daar]);
  const gegevensRijen = useMemo(() => (daar ? tabelVerschil(gegevens, daar.project.gegevens).filter((r) => !r.gelijk) : []), [gegevens, daar]);

  const lees = async (bestand: File | undefined) => {
    if (!bestand) return;
    zetFout(null);
    try {
      const project = leesProjectBestand(await bestand.text(), bestand.name.replace(/\.[^.]+$/, ""));
      zetDaar({ naam: bestand.name, project });
      zetGekozen(0);
    } catch (err) {
      zetFout(err instanceof GeenProjectFout ? t("bestandDialoog.geenProject") : (err as Error).message);
    }
  };

  const paar = paren[gekozen];
  return (
    <Modal open={open} onClose={() => useVergelijkVenster.setState({ open: false })} title={t("vergelijken.titel")} width={1180} height="88vh">
      <div className="vg">
        <div className="vg-balk">
          <button type="button" onClick={() => kiezer.current?.click()}>{t("vergelijken.kies")}</button>
          <input ref={kiezer} type="file" accept=".ifccalculation,.ifcx,.json,.cpd" hidden
            onChange={(e) => { void lees(e.target.files?.[0]); e.target.value = ""; }} />
          <span className="vg-uitleg">{daar ? t("vergelijken.met", { naam: daar.naam }) : t("vergelijken.uitleg")}</span>
        </div>
        {fout && <p className="vg-fout">{fout}</p>}
        {daar && (
          <div className="vg-inhoud">
            <aside className="vg-lijst">
              <h4>{t("vergelijken.gegevens")}</h4>
              <p className={gegevensRijen.length ? "vg-teller vg-anders" : "vg-teller"}>
                {gegevensRijen.length ? t("vergelijken.gegevensVerschil", { count: gegevensRijen.length }) : t("vergelijken.gegevensGelijk")}
              </p>
              <h4>{t("vergelijken.bladen")}</h4>
              <ul>
                {paren.map((p, i) => {
                  const soort = paarSoort(p);
                  return (
                    <li key={i}>
                      <button type="button" className={`vg-paar vg-${soort}${i === gekozen ? " gekozen" : ""}`} onClick={() => zetGekozen(i)}>
                        <span className="vg-paar-naam">{(p.hier ?? p.daar)!.naam}</span>
                        <span className="vg-paar-soort">{t(`vergelijken.soort.${soort}`)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </aside>
            <section className="vg-rechts">
              {gegevensRijen.length > 0 && (
                <>
                  <h4>{t("vergelijken.gegevens")}</h4>
                  <Tabel rijen={gegevensRijen} alleenVerschil kop={[t("vergelijken.naam"), t("vergelijken.hier"), t("vergelijken.daar")]} />
                </>
              )}
              {paar ? <PaarDetail key={gekozen} paar={paar} daar={daar.project} /> : <p className="vg-leeg">{t("vergelijken.geenBladen")}</p>}
            </section>
          </div>
        )}
      </div>
    </Modal>
  );
}
