import { useTranslation } from "react-i18next";
import { inTaal } from "../../rapport/meertalig";
import { dekkingVan, normenVan, type Normkeuze } from "../../rapport/normen/keuze";
import { ONDERWERPEN, OVERGANG } from "../../rapport/normen/landen";
import BronLink from "./BronLink";

/**
 * Welke normen er bij deze keuze gelden: per onderwerp de norm, de editie, de uitgever en een
 * link naar de bron. Wat niet bij een officiële of betrouwbare bron is bevestigd, staat als nog
 * te bevestigen; een land waarvan niet alles is bevestigd, zegt dat bovenaan.
 */
export default function NormenOverzicht({ keuze }: { keuze: Normkeuze }) {
  const { t, i18n } = useTranslation("werkruimte");
  const taal = i18n.language;
  const normen = normenVan(keuze);
  const land = inTaal(keuze.land.naam, taal);
  const tweede = keuze.generatie === 2;
  return (
    <div className="pg-normen">
      <p className="pg-hint">
        {tweede ? t("normen.tweedeGeneratie", { land }) : t(dekkingVan(keuze.land) === "compleet" ? "normen.compleet" : "normen.verwijzing", { land })}
      </p>
      <table>
        <thead>
          <tr>
            <th>{t("normen.onderwerp")}</th>
            <th>{t("normen.norm")}</th>
            <th>{t("normen.editieKop")}</th>
            <th>{t("normen.uitgever")}</th>
          </tr>
        </thead>
        <tbody>
          {ONDERWERPEN.map((o) => {
            const n = normen[o];
            return (
              <tr key={o}>
                <td>{t(`normen.onderwerpen.${o}`)}</td>
                <td>
                  <BronLink url={n.url} klasse="pg-normlink">{n.aanduiding}</BronLink>
                  {n.opmerking && <span className="pg-hint">{inTaal(n.opmerking, taal)}</span>}
                </td>
                <td>{n.editie ?? <i>{t("normen.teBevestigen")}</i>}</td>
                <td>{n.uitgever}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="pg-hint">
        {inTaal(keuze.land.aanwijzing.tekst, taal)}{" "}
        <BronLink url={keuze.land.aanwijzing.url} klasse="pg-normlink">{t("normen.bron")}</BronLink>
      </p>
      {keuze.eurocode && (
        <p className="pg-hint">
          {t("normen.overgang", { publicatie: OVERGANG.publicatie, intrekking: OVERGANG.intrekking })}{" "}
          <BronLink url={OVERGANG.url} klasse="pg-normlink">{t("normen.bron")}</BronLink>
        </p>
      )}
    </div>
  );
}
