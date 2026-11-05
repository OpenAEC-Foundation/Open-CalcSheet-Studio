import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { REVISIE_STATUSSEN, type Revisie, type RevisieStatus } from "../../rapport/model";
import { useProjectStore, RAPPORT_ID } from "../../store/projectStore";
import { maakNieuweVersie, wisselNaarVersie } from "../../store/versieActies";
import { vergelijkBladen, type BladVerschil } from "../../store/versieVergelijking";
import { inhoudVan, magVerwijderen, ouderVan, revisieVan, versieGegevens, type Versie, type VersieInhoud, type VersieLijst } from "../../store/versies";
import { knopenVan, opzetVan } from "../../rapport/opzet";
import { Keuze, Sectie, Veld } from "../rapport/paneel/velden";
import "../rapport/RapportPanel.css";

/** Sleutel van de naam van een status, zoals in de revisietabel. */
const STATUS_SLEUTEL: Record<RevisieStatus, string> = {
  concept: "revisies.statussen.concept",
  "ter goedkeuring": "revisies.statussen.terGoedkeuring",
  definitief: "revisies.statussen.definitief",
};

type Stand = VersieInhoud & { versies: VersieLijst };

/**
 * Het paneel met de versies van dit project: alle versies, de gegevens van de versie die openstaat, en
 * per blad wat er anders is dan in de oudertak. De bediening staat in de opmaak van het rapportpaneel.
 */
export default function VersiesPaneel() {
  const { t } = useTranslation("werkruimte");
  const versies = useProjectStore((s) => s.versies);
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const gegevens = useProjectStore((s) => s.gegevens);
  const rapport = useProjectStore((s) => s.rapport);
  const stand: Stand = { versies, exemplaren, gegevens, rapport };
  const actief = versies.lijst.find((v) => v.id === versies.actief);
  const ouder = ouderVan(versies, versies.actief);

  return (
    <div className="rapport-panel">
      <div className="rapport-kop">
        <h1>{t("versies.titel")}</h1>
        <p>{t("versies.intro")}</p>
      </div>
      <VersieTabel stand={stand} />
      {actief && <DezeVersie versie={actief} stand={stand} />}
      {ouder ? <Vergelijking ouder={ouder} stand={stand} /> : (
        <section className="rapport-groep" data-sectie="vergelijking">
          <p className="rapport-melding-blok rustig">{t("versies.geenOuder")}</p>
        </section>
      )}
    </div>
  );
}

/** Alle versies: wisselen, weghalen en een nieuwe maken. */
function VersieTabel({ stand }: { stand: Stand }) {
  const { t } = useTranslation("werkruimte");
  const verwijder = useProjectStore((s) => s.verwijderVersie);
  const { versies } = stand;
  return (
    <Sectie id="lijst" titel={t("versies.lijst")} intro={t("versies.lijstUitleg")}>
      <table className="rapport-tabel">
        <thead>
          <tr>
            <th style={{ width: "5em" }}>{t("versies.code")}</th>
            <th style={{ width: "8.5em" }}>{t("versies.datum")}</th>
            <th>{t("versies.omschrijving")}</th>
            <th style={{ width: "5em" }}>{t("versies.ouder")}</th>
            <th style={{ width: "12em" }} aria-label={t("versies.acties")} />
          </tr>
        </thead>
        <tbody>
          {versies.lijst.map((v) => {
            const g = versieGegevens(stand, v);
            const ouder = ouderVan(versies, v.id);
            const naam = v.naam || g.omschrijving || g.code;
            return (
              <tr key={v.id} aria-current={v.id === versies.actief ? "true" : undefined}>
                <td className="rapport-tabel-afgeleid">{g.code}</td>
                <td className="rapport-tabel-afgeleid">{g.datum}</td>
                <td>{v.naam ? <><strong>{v.naam}</strong>{g.omschrijving && ` — ${g.omschrijving}`}</> : (g.omschrijving || (v.ouder ? "" : t("versies.origineel")))}</td>
                <td className="rapport-tabel-afgeleid">{ouder ? versieGegevens(stand, ouder).code : "—"}</td>
                <td className="rapport-tabel-knoppen">
                  {v.id === versies.actief ? (
                    <span className="rapport-hint">{t("versies.open")}</span>
                  ) : (
                    <>
                      <button type="button" className="rapport-knop" onClick={() => void wisselNaarVersie(v.id)}>{t("versies.openen")}</button>
                      {" "}
                      <button
                        type="button"
                        className="rapport-icoon"
                        title={t("versies.verwijderen")}
                        aria-label={t("versies.verwijderen")}
                        disabled={!magVerwijderen(versies, v.id)}
                        onClick={() => {
                          if (confirm(t("versies.verwijderenVraag", { naam }))) verwijder(v.id);
                        }}
                      >
                        ✕
                      </button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="rapport-knoppen">
        <button type="button" className="rapport-knop rapport-knop-primair" title={t("versies.nieuweUitleg")} onClick={() => void maakNieuweVersie()}>
          + {t("versies.nieuwe")}
        </button>
      </div>
    </Sectie>
  );
}

/**
 * De gegevens van de versie die openstaat. Code, datum, omschrijving en status zijn haar regel in de
 * revisietabel (dezelfde velden als in het rapport): wat je hier zet, staat op het voorblad.
 */
function DezeVersie({ versie, stand }: { versie: Versie; stand: Stand }) {
  const { t } = useTranslation("werkruimte");
  const { t: tr } = useTranslation("rapport");
  const zetNaam = useProjectStore((s) => s.zetVersieNaam);
  const selecteer = useProjectStore((s) => s.selecteer);
  const { rapport } = stand;
  const rij: Revisie | undefined = revisieVan(versie.id, rapport);
  const i = rij ? rapport.revisies.indexOf(rij) : -1;
  const heeftBlok = knopenVan(opzetVan(rapport)).some((k) => k.inhoud === "wijzigingen");
  return (
    <Sectie id="deze" titel={t("versies.deze")}>
      <label className="rapport-veld">
        <span className="rapport-label">{t("versies.naam")}</span>
        <span className="rapport-invoer">
          <input type="text" value={versie.naam} placeholder={t("versies.naamLeeg")} onChange={(e) => zetNaam(versie.id, e.target.value)} />
        </span>
      </label>
      {rij && (
        <div className="rapport-rij">
          <Veld label={t("versies.code")} pad={`revisies.${i}.code`} waarde={rij.code} />
          <Veld label={t("versies.datum")} pad={`revisies.${i}.datum`} waarde={rij.datum} placeholder={tr("algemeen.datumVoorbeeld")} />
          <Keuze
            label={t("versies.status")}
            pad={`revisies.${i}.status`}
            waarde={rij.status}
            opties={REVISIE_STATUSSEN.map((s) => ({ waarde: s, label: tr(STATUS_SLEUTEL[s]) }))}
          />
        </div>
      )}
      {rij && <Veld label={t("versies.omschrijving")} pad={`revisies.${i}.omschrijving`} waarde={rij.omschrijving} hint={t("versies.omschrijvingUitleg")} />}
      {stand.versies.lijst.length > 1 && !heeftBlok && <p className="rapport-melding-blok">{t("versies.geenBlok")}</p>}
      {stand.versies.lijst.length > 1 && heeftBlok && (
        <button type="button" className="rapport-link" onClick={() => selecteer(RAPPORT_ID)}>{t("versies.naarLijst")}</button>
      )}
    </Sectie>
  );
}

/** Regels in een vaste letter, met een teken voor wat eraf en erbij is gegaan. */
function RegelVerschil({ eraf, erbij }: { eraf: string[]; erbij: string[] }) {
  return (
    <pre className="rapport-regelverschil">
      {[...eraf.map((r) => `- ${r}`), ...erbij.map((r) => `+ ${r}`)].join("\n")}
    </pre>
  );
}

/** Een tabel met waarden die anders zijn. */
function Waarden({ kop, lijst }: { kop: string; lijst: BladVerschil["invoer"] }) {
  const { t } = useTranslation("werkruimte");
  if (lijst.length === 0) return null;
  return (
    <>
      <h6 className="rapport-subkop">{kop}</h6>
      <table className="rapport-tabel">
        <thead>
          <tr>
            <th>{t("versies.waarde")}</th>
            <th>{t("versies.eerder")}</th>
            <th>{t("versies.nu")}</th>
          </tr>
        </thead>
        <tbody>
          {lijst.map((v) => (
            <tr key={v.naam}>
              <td>{v.naam}</td>
              <td className="rapport-tabel-afgeleid">{v.van ?? "—"}</td>
              <td className="rapport-tabel-afgeleid">{v.naar ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** Per blad wat er anders is dan in de oudertak. De uitkomsten komen uit de bestaande doorrekening. */
function Vergelijking({ ouder, stand }: { ouder: Versie; stand: Stand }) {
  const { t } = useTranslation("werkruimte");
  const { exemplaren, gegevens, rapport, versies } = stand;
  const selecteer = useProjectStore((s) => s.selecteer);
  const oud = inhoudVan(stand, ouder.id);
  const verschillen = useMemo(
    () => (oud ? vergelijkBladen(oud, { exemplaren, gegevens, rapport }) : []),
    [oud, exemplaren, gegevens, rapport],
  );
  const [alles, setAlles] = useState(false);
  const code = versieGegevens({ versies, exemplaren, gegevens, rapport }, ouder).code;
  return (
    <Sectie id="vergelijking" titel={t("versies.vergelijking", { code })} intro={t("versies.vergelijkingUitleg")}>
      {verschillen.length === 0 && <p className="rapport-melding-blok rustig">{t("versies.geenVerschil")}</p>}
      {verschillen.map((v) => (
        <div key={v.id} className="rapport-kaart" data-blad={v.id}>
          <div className="rapport-kaart-kop">
            <span className="rapport-kaart-titel">{v.naam}</span>
            {v.soort !== "gewijzigd" && <span className="rapport-soort">{t(v.soort === "erbij" ? "versies.bladErbij" : "versies.bladWeg")}</span>}
            {v.oudeNaam !== undefined && <span className="rapport-soort">{t("versies.hernoemd", { naam: v.oudeNaam })}</span>}
            {v.soort !== "weg" && (
              <button type="button" className="rapport-link" onClick={() => selecteer(v.id)}>{t("versies.naarBlad")}</button>
            )}
          </div>
          {v.oordeel && <p className="rapport-melding-blok">{t("versies.oordeel", { van: t(`versies.oordelen.${v.oordeel.van}`), naar: t(`versies.oordelen.${v.oordeel.naar}`) })}</p>}
          {v.bestand.map((b) => <p key={b} className="rapport-hint">{t(`versies.bestand.${b}`)}</p>)}
          <Waarden kop={t("versies.invoer")} lijst={v.invoer} />
          {v.rekentekst && (
            <>
              <h6 className="rapport-subkop">{t("versies.rekentekst")}</h6>
              <RegelVerschil {...v.rekentekst} />
            </>
          )}
          <Waarden kop={t("versies.uitkomsten")} lijst={alles ? v.uitkomsten : v.uitkomsten.slice(0, 12)} />
          {!alles && v.uitkomsten.length > 12 && (
            <button type="button" className="rapport-link" onClick={() => setAlles(true)}>{t("versies.meerUitkomsten", { aantal: v.uitkomsten.length - 12 })}</button>
          )}
        </div>
      ))}
    </Sectie>
  );
}
