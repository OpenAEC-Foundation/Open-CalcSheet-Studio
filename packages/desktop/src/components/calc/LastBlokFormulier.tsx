import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Belastingbron } from "../../rapport/belastingBronnen";
import { fmt } from "../../rapport/normwaarden";
import { leesLast, schrijfLast, type LastBlok, type LastRegel } from "../../store/lastBlok";
import "./LastBlokFormulier.css";

/*
 * Een lastblok (`@last`) op het canvas als formulier: een naam, een symbool, lijnlast of
 * puntlast, en per regel een belasting uit hoofdstuk 5 van het rapport met de breedte,
 * het oppervlak of de lengte waarmee hij telt. Het formulier schrijft gewone rekentekst;
 * het blok rekent en tekent de rekenkern (lastBlok.ts in de kern).
 *
 * Een regel kiest zijn belasting uit de lijst van hoofdstuk 5 (rapport/belastingBronnen.ts)
 * of is een eigen uitdrukking. Wijzigt de opbouw in hoofdstuk 5, dan rekent het blok mee.
 */

const EIGEN = "\u0000eigen";

/** Een nieuw, leeg lastblok met een symbool dat nog vrij is. */
export function nieuwLastBlok(bezet: ReadonlySet<string>): string {
  let n = 1;
  while (bezet.has(`q_${n}`)) n++;
  return schrijfLast({ symbool: `q_${n}`, naam: "", soort: "lijn", regels: [{ soort: "G", bron: "", factoren: [] }] });
}

export default function LastBlokFormulier({ tekst, bronnen, uitkomst, onWijzig, onKlaar, onVerwijder, onAlsTekst }: {
  tekst: string;
  /** De belastingen uit hoofdstuk 5 van het rapport. */
  bronnen: readonly Belastingbron[];
  /** Het doorgerekende blok, zoals het straks op het blad staat. */
  uitkomst?: ReactNode;
  onWijzig: (tekst: string) => void;
  onKlaar: () => void;
  onVerwijder: () => void;
  /** Verder als gewone rekentekst, voor wat het formulier niet kan. */
  onAlsTekst: () => void;
}) {
  const { t, i18n } = useTranslation("werkruimte");
  const blok = leesLast(tekst);
  const eerste = useRef<HTMLInputElement>(null);
  useEffect(() => eerste.current?.focus(), []);
  // Het maatveld houdt zijn eigen tekst: een `;` waar nog niets achter staat, blijft staan
  // terwijl het blad alleen de gevulde factoren krijgt. Na een regel erbij of eraf opnieuw.
  const [versie, zetVersie] = useState(0);

  const zet = (deel: Partial<LastBlok>) => onWijzig(schrijfLast({ ...blok, ...deel }));
  const zetRegel = (i: number, deel: Partial<LastRegel>) =>
    zet({ regels: blok.regels.map((r, j) => (j === i ? { ...r, ...deel } : r)) });
  const bronVan = (symbool: string) => bronnen.find((b) => b.symbool === symbool);
  const waarde = (b: Belastingbron) =>
    `${fmt(b.waarde, 2, false, i18n.language)} ${b.eenheid === "kN/m" ? "kN/m" : "kN/m²"}`;
  const blijvend = bronnen.filter((b) => b.soort === "G");
  const veranderlijk = bronnen.filter((b) => b.soort === "Q");
  const punt = blok.soort === "punt";

  return (
    <div
      className="lb"
      onKeyDown={(e) => {
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || (e.target as HTMLElement).tagName === "INPUT"))) {
          e.preventDefault();
          onKlaar();
        }
      }}
    >
      <div className="lb-kop">
        <input
          ref={eerste}
          type="text"
          className="lb-naam"
          value={blok.naam}
          placeholder={t("lastblok.naamVoorbeeld")}
          aria-label={t("lastblok.naam")}
          onChange={(e) => zet({ naam: e.target.value })}
        />
        <input
          type="text"
          className="lb-symbool"
          value={blok.symbool}
          spellCheck={false}
          aria-label={t("lastblok.symbool")}
          title={t("lastblok.symboolUitleg")}
          onChange={(e) => zet({ symbool: e.target.value.replace(/\s+/g, "") })}
        />
        <select value={blok.soort} aria-label={t("lastblok.soort")} onChange={(e) => zet({ soort: e.target.value === "punt" ? "punt" : "lijn" })}>
          <option value="lijn">{t("lastblok.lijn")}</option>
          <option value="punt">{t("lastblok.punt")}</option>
        </select>
      </div>

      <div className="lb-regels">
        <div className="lb-regel lb-koppen">
          <span>{t("lastblok.belasting")}</span>
          <span>{t(punt ? "lastblok.maatPunt" : "lastblok.maatLijn")}</span>
          <span />
        </div>
        {blok.regels.map((r, i) => {
          const gekozen = bronVan(r.bron.trim());
          const eigen = !gekozen && r.bron.trim() !== "";
          return (
            <div className="lb-regel" key={i}>
              <span className="lb-bron">
                <select
                  value={gekozen ? gekozen.symbool : eigen ? EIGEN : ""}
                  aria-label={t("lastblok.belasting")}
                  onChange={(e) => {
                    if (e.target.value === EIGEN) {
                      zetRegel(i, { bron: r.bron.trim() && !gekozen ? r.bron : "0 kN/m^2" });
                      return;
                    }
                    const b = bronVan(e.target.value);
                    zetRegel(i, { bron: e.target.value, soort: b?.soort ?? r.soort });
                  }}
                >
                  <option value="">{t("lastblok.kies")}</option>
                  {blijvend.length > 0 && (
                    <optgroup label={t("lastblok.blijvend")}>
                      {blijvend.map((b) => (
                        <option key={b.symbool} value={b.symbool}>{`${b.naam || b.symbool} · ${b.symbool} = ${waarde(b)}`}</option>
                      ))}
                    </optgroup>
                  )}
                  {veranderlijk.length > 0 && (
                    <optgroup label={t("lastblok.veranderlijk")}>
                      {veranderlijk.map((b) => (
                        <option key={b.symbool} value={b.symbool}>{`${b.naam || b.symbool} · ${b.symbool} = ${waarde(b)}`}</option>
                      ))}
                    </optgroup>
                  )}
                  <option value={EIGEN}>{t("lastblok.eigen")}</option>
                </select>
                {eigen && (
                  <>
                    <input
                      type="text"
                      className="lb-eigen"
                      value={r.bron}
                      spellCheck={false}
                      aria-label={t("lastblok.eigenWaarde")}
                      placeholder={t("lastblok.eigenVoorbeeld")}
                      onChange={(e) => zetRegel(i, { bron: e.target.value })}
                    />
                    <select value={r.soort} aria-label={t("lastblok.gOfQ")} onChange={(e) => zetRegel(i, { soort: e.target.value === "Q" ? "Q" : "G" })}>
                      <option value="G">G</option>
                      <option value="Q">Q</option>
                    </select>
                  </>
                )}
              </span>
              <input
                key={versie}
                type="text"
                className="lb-maat"
                defaultValue={r.factoren.join("; ")}
                spellCheck={false}
                aria-label={t(punt ? "lastblok.maatPunt" : "lastblok.maatLijn")}
                placeholder={t(punt ? "lastblok.maatPuntVoorbeeld" : "lastblok.maatLijnVoorbeeld")}
                onChange={(e) => zetRegel(i, { factoren: e.target.value.split(";").map((f) => f.trim()) })}
              />
              <button
                type="button"
                className="lb-icoon"
                title={t("lastblok.regelWeg")}
                aria-label={t("lastblok.regelWeg")}
                disabled={blok.regels.length <= 1}
                onClick={() => {
                  zetVersie((v) => v + 1);
                  zet({ regels: blok.regels.filter((_, j) => j !== i) });
                }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>

      <div className="lb-voet">
        <button type="button" className="lb-knop lb-plus" onClick={() => zet({ regels: [...blok.regels, { soort: "G", bron: "", factoren: [] }] })}>
          + {t("lastblok.regelErbij")}
        </button>
        <span className="lb-hint">{t(punt ? "lastblok.hintPunt" : "lastblok.hintLijn")}</span>
        <button type="button" className="lb-knop" title={t("lastblok.alsTekstUitleg")} onClick={onAlsTekst}>{t("lastblok.alsTekst")}</button>
        <button type="button" className="lb-knop" onClick={onVerwijder}>{t("lastblok.verwijder")}</button>
        <button type="button" className="lb-knop lb-klaar" onClick={onKlaar}>{t("lastblok.klaar")}</button>
      </div>
      {bronnen.length === 0 && <p className="lb-melding">{t("lastblok.geenBronnen")}</p>}
      {uitkomst && blok.regels.some((r) => r.bron.trim() !== "") && <div className="lb-uitkomst">{uitkomst}</div>}
    </div>
  );
}
