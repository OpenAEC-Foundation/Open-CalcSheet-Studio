import { Fragment, useDeferredValue, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import Modal from "../../Modal";
import ThemedSelect from "../../ThemedSelect";
import {
  aandachtspunten,
  CATEGORIEEN,
  effectieveP,
  filterOpties,
  filterRegels,
  zichtbareRegels,
  zoekIndex,
  type Bestandsuitslag,
  type Gewichtregel,
  type Leesfout,
} from "../../../rapport/gewichtenBibliotheek";
import { openBron } from "../../../rapport/gewichtenBestand";
import { inTaal } from "../../../rapport/meertalig";
import {
  bewaarBestand,
  laadGewichten,
  openEigen,
  sluitEigen,
  useGewichten,
  verwijderEigenRegel,
  voegBestandSamen,
  voegEigenRegelToe,
  type BewaarKeuze,
} from "../../../store/gewichtenBibliotheek";
import RegelFormulier from "./RegelFormulier";
import "../../settings/SettingsDialog.css";
import "../../ThemedSelect.css";
import "./GewichtenVenster.css";

/** Zo veel rijen in één keer; meer rijen maken het typen in het zoekveld traag. */
const STAP = 200;

/** Waar een regel vandaan komt, als filter. */
type Herkomst = "" | "meegeleverd" | "eigen";

function foutTekst(t: TFunction<"gewichten">, fout: Leesfout): string {
  switch (fout.soort) {
    case "regel":
      return t("fout.regel", { nummer: fout.nummer, id: fout.id ?? "", veld: t(`veldNaam.${fout.veld.replace(".", "_")}`) });
    case "dubbelId":
      return t("fout.dubbelId", { id: fout.id });
    case "teNieuw":
      return t("fout.teNieuw", { versie: fout.versie });
    default:
      return t(`fout.${fout.soort}`);
  }
}

/**
 * De gewichtenbibliotheek: zoeken en filteren op categorie, leverancier en regio. Vanuit een opbouw
 * voegt een klik de regel in; vanuit het projectpaneel is het alleen bladeren. Een eigen bibliotheek
 * openen, aanvullen, samenvoegen en als bestand bewaren kan vanuit beide.
 */
export default function GewichtenVenster({ open, onSluit, onInvoegen, kanInvoegen, doel }: {
  open: boolean;
  onSluit: () => void;
  /** Zonder deze is het alleen bladeren. */
  onInvoegen?: (r: Gewichtregel) => void;
  /** Bijvoorbeeld: een gevellaag kan niet zonder gewicht per m². */
  kanInvoegen?: (r: Gewichtregel) => boolean;
  /** Waar het invoegen in terechtkomt, voor de tekst onder de lijst. */
  doel?: string;
}) {
  const { t, i18n } = useTranslation("gewichten");
  const taal = (i18n.language ?? "en").split("-")[0];
  const meegeleverd = useGewichten((s) => s.meegeleverd);
  const laadFout = useGewichten((s) => s.laadFout);
  const eigen = useGewichten((s) => s.eigen);
  const gewijzigd = useGewichten((s) => s.gewijzigd);

  const [zoek, setZoek] = useState("");
  const [categorie, setCategorie] = useState("");
  const [leverancier, setLeverancier] = useState("");
  const [regio, setRegio] = useState("");
  const [herkomst, setHerkomst] = useState<Herkomst>("");
  const [limiet, setLimiet] = useState(STAP);
  const [formulier, setFormulier] = useState(false);
  const [melding, setMelding] = useState<{ fout: boolean; tekst: string } | null>(null);

  useEffect(() => {
    if (open) void laadGewichten();
  }, [open]);

  const zichtbaar = useMemo(() => zichtbareRegels(meegeleverd ?? [], eigen), [meegeleverd, eigen]);
  const eigenIds = useMemo(() => new Set(eigen?.regels.map((r) => r.id) ?? []), [eigen]);
  // Een nieuw id mag ook niet gelijk zijn aan een meegeleverd: dan zou de nieuwe regel die verbergen.
  const alleIds = useMemo(() => new Set(zichtbaar.map((z) => z.regel.id)), [zichtbaar]);
  const regels = useMemo(
    () => zichtbaar.filter((z) => !herkomst || (herkomst === "eigen") === z.eigen).map((z) => z.regel),
    [zichtbaar, herkomst],
  );
  const index = useMemo(() => zoekIndex(regels, taal), [regels, taal]);
  const zoekNu = useDeferredValue(zoek);
  const gevonden = useMemo(
    () => filterRegels(index, { tekst: zoekNu, categorie, leverancier, regio }),
    [index, zoekNu, categorie, leverancier, regio],
  );
  useEffect(() => setLimiet(STAP), [gevonden]);

  const categorieen = useMemo(
    () => [{ value: "", label: t("filter.alleCategorieen") }, ...CATEGORIEEN.map((c) => ({ value: c, label: t(`categorie.${c}`) }))],
    [t],
  );
  const leveranciers = useMemo(
    () => [{ value: "", label: t("filter.alleLeveranciers") }, ...filterOpties(regels, "leverancier").map((v) => ({ value: v, label: v }))],
    [regels, t],
  );
  const regios = useMemo(
    () => [{ value: "", label: t("filter.alleRegios") }, ...filterOpties(regels, "regio").map((v) => ({ value: v, label: v }))],
    [regels, t],
  );
  const herkomsten = useMemo(
    () => [
      { value: "", label: t("filter.alleHerkomst") },
      { value: "meegeleverd", label: t("filter.meegeleverd") },
      { value: "eigen", label: t("filter.eigen") },
    ],
    [t],
  );

  const dialoog = { titel: t("bestand.openen"), filter: t("bestand.filter") };

  /** Een bestandsactie: wat er ook misgaat, de stand blijft en er komt een melding. */
  const voerUit = async (actie: () => Promise<void>) => {
    setMelding(null);
    try {
      await actie();
    } catch (err) {
      console.error("Gewichtenbibliotheek:", err);
      setMelding({ fout: true, tekst: t("fout.bestand", { fout: (err as Error)?.message ?? String(err) }) });
    }
  };

  const toonUitslag = (u: Bestandsuitslag | null, klaar: (u: Extract<Bestandsuitslag, { fout: null }>) => string) => {
    if (!u) return;
    if (u.fout !== null) setMelding({ fout: true, tekst: foutTekst(t, u.fout) });
    else {
      const extra = u.aandacht > 0 ? ` ${t("aandacht.inBestand", { count: u.aandacht })}` : "";
      setMelding({ fout: false, tekst: klaar(u) + extra });
    }
  };

  const openen = () =>
    voerUit(async () => {
      if (gewijzigd && !confirm(t("vervangVraag"))) return;
      const u = await openEigen(dialoog);
      toonUitslag(u, (o) => t("gemeld.geopend", { count: o.aantal }));
      if (u?.fout === null) setHerkomst("");
    });

  const samenvoegen = () =>
    voerUit(async () => {
      const u = await voegBestandSamen({ ...dialoog, titel: t("bestand.samenvoegen") });
      toonUitslag(u, (o) => t("gemeld.samengevoegd", {
        toegevoegd: o.samen?.toegevoegd ?? 0,
        gelijk: o.samen?.gelijk ?? 0,
        hernoemd: o.samen?.hernoemd ?? 0,
      }));
    });

  /** Wat "Opslaan als" bewaart, volgt het filter op herkomst. */
  const keuze: BewaarKeuze = herkomst === "eigen" ? "eigen" : herkomst === "meegeleverd" ? "meegeleverd" : "alles";
  const opslaan = () =>
    voerUit(async () => {
      const aantal = await bewaarBestand(keuze, { en: "Weights library", nl: "Gewichtenbibliotheek" }, taal, { ...dialoog, titel: t("bestand.opslaan") });
      if (aantal !== null) setMelding({ fout: false, tekst: t("gemeld.bewaard", { count: aantal }) });
    });

  const sluit = () => {
    if (gewijzigd && !confirm(t("sluitVraag"))) return;
    sluitEigen();
    setHerkomst("");
    setMelding(null);
  };

  const getal = (v: number | undefined, decimalen: number) =>
    v === undefined ? "" : v.toLocaleString(taal, { maximumFractionDigits: decimalen, useGrouping: false });

  const voet = (
    <>
      <div className="gew-voet-links">
        <button type="button" className="settings-btn settings-btn-secondary" title={t("knop.openenUitleg")} onClick={() => void openen()}>
          {t("knop.openen")}
        </button>
        <button type="button" className="settings-btn settings-btn-secondary" title={t("knop.samenvoegenUitleg")} onClick={() => void samenvoegen()}>
          {t("knop.samenvoegen")}
        </button>
        <button type="button" className="settings-btn settings-btn-secondary" title={t(`knop.opslaanUitleg.${keuze}`)}
          disabled={meegeleverd === null || (keuze === "eigen" && !eigen)} onClick={() => void opslaan()}>
          {t("knop.opslaan")}
        </button>
        <button type="button" className="settings-btn settings-btn-secondary" aria-expanded={formulier} onClick={() => setFormulier((f) => !f)}>
          {t("knop.regelToevoegen")}
        </button>
      </div>
      <div className="settings-footer-right">
        <button type="button" className="settings-btn settings-btn-primary" onClick={onSluit}>{t("sluiten")}</button>
      </div>
    </>
  );

  return (
    <Modal open={open} onClose={onSluit} title={t("titel")} width={Math.min(1180, window.innerWidth - 32)}
      height={Math.min(780, window.innerHeight - 48)} className="gew-venster" footer={voet}>
      <div className="gew-filters">
        <input className="gew-zoek" type="search" autoFocus value={zoek} placeholder={t("zoeken")} aria-label={t("zoeken")}
          onChange={(e) => setZoek(e.target.value)} />
        <ThemedSelect value={categorie} options={categorieen} onChange={setCategorie} />
        <ThemedSelect value={leverancier} options={leveranciers} onChange={setLeverancier} />
        <ThemedSelect value={regio} options={regios} onChange={setRegio} />
        <ThemedSelect value={herkomst} options={herkomsten} onChange={(v) => setHerkomst(v as Herkomst)} />
      </div>

      <div className="gew-status" role="status">
        <span>{meegeleverd === null && !laadFout ? t("laden") : t("aantal", { gevonden: gevonden.length, totaal: regels.length })}</span>
        {onInvoegen && doel && <span className="gew-doel">{t("invoegenIn", { doel })}</span>}
        {eigen && (
          <span className="gew-eigen-stand">
            {t(gewijzigd ? "eigenGewijzigd" : "eigenStand", { naam: inTaal(eigen.naam, taal), count: eigen.regels.length })}
            <button type="button" className="gew-tekstknop" onClick={sluit}>{t("knop.eigenSluiten")}</button>
          </span>
        )}
      </div>

      {laadFout && (
        <p className="gew-melding gew-melding-fout" role="alert">
          {t("laadFout")} <button type="button" className="gew-tekstknop" onClick={() => void laadGewichten()}>{t("opnieuw")}</button>
        </p>
      )}
      {melding && <p className={`gew-melding${melding.fout ? " gew-melding-fout" : ""}`} role={melding.fout ? "alert" : "status"}>{melding.tekst}</p>}

      {formulier && (
        <RegelFormulier
          bestaand={alleIds}
          opAnnuleer={() => setFormulier(false)}
          opBewaar={(r) => {
            voegEigenRegelToe(r);
            setFormulier(false);
            setMelding({ fout: false, tekst: t("gemeld.toegevoegd", { naam: inTaal(r.naam, taal) }) });
          }}
        />
      )}

      <div className="gew-lijst">
        <table className="gew-tabel">
          <thead>
            <tr>
              <th>{t("kolom.naam")}</th>
              <th>{t("kolom.leverancier")}</th>
              <th>{t("kolom.regio")}</th>
              <th className="gew-getal">{t("kolom.d")}</th>
              <th className="gew-getal">{t("kolom.rho")}</th>
              <th className="gew-getal">{t("kolom.p")}</th>
              <th>{t("kolom.bron")}</th>
              <th aria-label={t("kolom.actie")} />
            </tr>
          </thead>
          <tbody>
            {gevonden.slice(0, limiet).map((r, i, lijst) => (
              <Fragment key={r.id}>
                {(i === 0 || lijst[i - 1].categorie !== r.categorie) && (
                  <tr className="gew-groep"><td colSpan={8}>{t(`categorie.${r.categorie}`)}</td></tr>
                )}
                <Rij
                  regel={r}
                  eigen={eigenIds.has(r.id)}
                  taal={taal}
                  getal={getal}
                  actie={
                    <>
                      {onInvoegen && (
                        <button type="button" className="settings-btn settings-btn-secondary gew-invoegen"
                          disabled={kanInvoegen ? !kanInvoegen(r) : false}
                          title={kanInvoegen && !kanInvoegen(r) ? t("nietInvoegbaar") : t("invoegenUitleg")}
                          onClick={() => {
                            onInvoegen(r);
                            setMelding({ fout: false, tekst: t("gemeld.ingevoegd", { naam: inTaal(r.naam, taal) }) });
                          }}>
                          {t("invoegen")}
                        </button>
                      )}
                      {eigenIds.has(r.id) && (
                        <button type="button" className="gew-weg" title={t("verwijderen")} aria-label={t("verwijderen")}
                          onClick={() => {
                            if (confirm(t("verwijderVraag", { naam: inTaal(r.naam, taal) }))) verwijderEigenRegel(r.id);
                          }}>
                          ✕
                        </button>
                      )}
                    </>
                  }
                />
              </Fragment>
            ))}
          </tbody>
        </table>
        {gevonden.length > limiet && (
          <button type="button" className="settings-btn settings-btn-secondary gew-meer" onClick={() => setLimiet((l) => l + STAP)}>
            {t("meerTonen", { rest: gevonden.length - limiet })}
          </button>
        )}
        {meegeleverd !== null && gevonden.length === 0 && <p className="gew-leeg">{t("niets")}</p>}
      </div>
    </Modal>
  );
}

function Rij({ regel: r, eigen, taal, getal, actie }: {
  regel: Gewichtregel;
  eigen: boolean;
  taal: string;
  getal: (v: number | undefined, decimalen: number) => string;
  actie: ReactNode;
}) {
  const { t } = useTranslation("gewichten");
  const p = effectieveP(r);
  const punten = aandachtspunten(r);
  const aandacht = punten
    .map((a) => (a.soort === "tegenstrijdig" ? t("aandacht.tegenstrijdig", { waarde: getal(a.d_rho, 3) }) : t("aandacht.ordeVanGrootte", { veld: t(`veldNaam.${a.veld}`) })))
    .join(" ");
  return (
    <tr>
      <td>
        <span className="gew-naam">{inTaal(r.naam, taal)}</span>
        {r.toestand && <span className="gew-kenmerk">{t(`toestand.${r.toestand}`)}</span>}
        {eigen && <span className="gew-kenmerk">{t("filter.eigen")}</span>}
        {aandacht && <span className="gew-kenmerk gew-aandacht" title={aandacht}>{t("aandacht.kort")}</span>}
        {r.opmerking && <span className="gew-opmerking">{inTaal(r.opmerking, taal)}</span>}
      </td>
      <td>{r.leverancier}</td>
      <td>{r.regio}</td>
      <td className="gew-getal">{getal(r.d, 4)}</td>
      <td className="gew-getal">{getal(r.rho, 3)}</td>
      <td className={`gew-getal${r.p === undefined ? " gew-afgeleid" : ""}`} title={r.p === undefined && p !== undefined ? t("afgeleid") : undefined}>{getal(p, 3)}</td>
      <td className="gew-bron">
        {r.bron.url ? (
          <a href={r.bron.url} target="_blank" rel="noreferrer noopener" title={r.bron.url}
            onClick={(e) => {
              e.preventDefault();
              void openBron(r.bron.url as string);
            }}>
            {r.bron.titel}
          </a>
        ) : (
          r.bron.titel
        )}
        {r.bron.datum && <span className="gew-datum">{r.bron.datum}</span>}
      </td>
      <td className="gew-actie">{actie}</td>
    </tr>
  );
}
