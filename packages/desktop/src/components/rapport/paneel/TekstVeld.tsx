import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { EigenVariant } from "../../../rapport/bureau";
import { INVULVELDEN, SUBKOP_WOORDEN, type Invulwaarden } from "../../../rapport/invullen";
import { inTaal } from "../../../rapport/meertalig";
import { variantenVan } from "../../../rapport/standaardteksten";
import { andereTaalVan, metTekst } from "../../../rapport/taalwissel";
import { useBureauStore } from "../../../store/bureauProfiel";
import { useProjectStore } from "../../../store/projectStore";
import { uittreksel } from "./hulp";
import { GroeiVeld, SubkopMelding, Vink } from "./velden";

const GEEN_EIGEN: readonly EigenVariant[] = [];

/**
 * Eén tekstonderdeel van het rapport (rapport.teksten[id]) met zijn
 * standaardteksten.
 *
 * "Standaardtekst ▾" toont de varianten van het template van dit rapport (anders de
 * meegeleverde) en de eigen varianten uit de instellingen. Kiezen vervangt de tekst; staat er al iets anders,
 * dan vraagt het eerst om bevestiging. Het vervangen is één eigen stap in
 * ongedaan maken. "Bewaar als eigen variant" legt de tekst van nu vast onder
 * een naam, voor dit onderdeel in elk volgend rapport.
 *
 * Het label van een meegeleverde variant volgt de taal van de app, de tekst komt in de
 * taal van het rapport. Staat de tekst nog in een andere taal (na het wisselen van taal),
 * dan zegt het veld dat.
 */
export default function TekstVeld({ id, kop, hint, placeholder }: {
  /** Tekst-id uit de opzet, tevens de sleutel in rapport.teksten. */
  id: string;
  /** Links van de knoppen; meestal een <Kop>. */
  kop?: ReactNode;
  hint?: ReactNode;
  placeholder?: string;
}) {
  const { t, i18n } = useTranslation("rapport");
  const rapportTaal = useProjectStore((s) => s.rapport.taal);
  const varianten = useProjectStore((s) => variantenVan(s.rapport, id));
  const tekst = useProjectStore((s) => s.rapport.teksten[id] ?? "");
  const andereTaal = useProjectStore((s) => andereTaalVan(s.rapport, id));
  const zet = useProjectStore((s) => s.zetRapportVeld);
  const werkBij = useProjectStore((s) => s.werkRapportBij);
  const eigen = useBureauStore((s) => s.eigenTeksten[id] ?? GEEN_EIGEN);
  const voegTekstToe = useBureauStore((s) => s.voegTekstToe);
  const verwijderTekst = useBureauStore((s) => s.verwijderTekst);
  // Als gewone tekst: het label in de taal van de app, de tekst in die van het rapport.
  const meegeleverd: EigenVariant[] = varianten.map((v) => ({
    label: inTaal(v.label, i18n.language),
    tekst: inTaal(v.tekst, rapportTaal),
  }));

  const [menuOpen, setMenuOpen] = useState(false);
  /** Naam voor een nieuwe eigen variant; null zolang dat regeltje dicht is. */
  const [variantNaam, setVariantNaam] = useState<string | null>(null);
  const [melding, setMelding] = useState("");
  const knoppenRef = useRef<HTMLDivElement>(null);

  // Een klik buiten het menu of Escape sluit het.
  useEffect(() => {
    if (!menuOpen) return;
    const klik = (e: MouseEvent) => {
      if (!knoppenRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", klik);
    document.addEventListener("keydown", toets);
    return () => {
      document.removeEventListener("mousedown", klik);
      document.removeEventListener("keydown", toets);
    };
  }, [menuOpen]);

  /** Vervangt de tekst na bevestiging, als je er iets anders mee kwijtraakt. */
  const vervang = (nieuw: string, vraag: string) => {
    const huidig = tekst.trim();
    if (huidig !== "" && huidig !== nieuw.trim() && !confirm(vraag)) return;
    werkBij((r) => metTekst(r, id, nieuw));
    setMenuOpen(false);
    setMelding("");
  };

  const bewaar = () => {
    const label = (variantNaam ?? "").trim();
    if (label === "" || tekst.trim() === "") return;
    voegTekstToe(id, { label, tekst });
    setVariantNaam(null);
    setMelding(t("tekstveld.bewaard", { label }));
  };

  const variant = (v: EigenVariant, sleutel: string) => (
    <button
      key={sleutel}
      type="button"
      role="menuitem"
      className="rapport-menu-item"
      title={v.tekst}
      onClick={() => vervang(v.tekst, t("tekstveld.vervangVraag", { label: v.label }))}
    >
      <span className="rapport-menu-label">{v.label}</span>
      <span className="rapport-menu-uittreksel">{uittreksel(v.tekst)}</span>
    </button>
  );

  return (
    <div className="rapport-tekstveld">
      <div className="rapport-tekst-balk">
        {kop}
        <div className="rapport-tekst-knoppen" ref={knoppenRef}>
          <button
            type="button"
            className="rapport-knop"
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => {
              setMenuOpen((open) => !open);
              setMelding("");
            }}
          >
            {t("tekstveld.standaardtekst")}
          </button>
          <button
            type="button"
            className="rapport-knop"
            disabled={tekst.trim() === ""}
            title={t("tekstveld.bewaarTitel")}
            onClick={() => {
              setVariantNaam(t("tekstveld.eigenVariantNummer", { nummer: eigen.length + 1 }));
              setMenuOpen(false);
              setMelding("");
            }}
          >
            {t("tekstveld.bewaarAlsEigen")}
          </button>
          {menuOpen && (
            <div className="rapport-menu" role="menu">
              {meegeleverd.length > 0 && <div className="rapport-menu-groep">{t("tekstveld.meegeleverd")}</div>}
              {meegeleverd.map((v, i) => variant(v, `m${i}`))}
              {eigen.length > 0 && <div className="rapport-menu-groep">{t("tekstveld.eigenVarianten")}</div>}
              {eigen.map((v, i) => (
                <div className="rapport-menu-regel" key={`e${i}`}>
                  {variant(v, `e${i}`)}
                  <button
                    type="button"
                    className="rapport-icoon"
                    title={t("tekstveld.verwijderTitel")}
                    onClick={() => {
                      if (confirm(t("tekstveld.verwijderVraag", { label: v.label }))) verwijderTekst(id, i);
                    }}
                  >
                    ✕
                  </button>
                </div>
              ))}
              {meegeleverd.length === 0 && eigen.length === 0 && (
                <div className="rapport-menu-leeg">{t("tekstveld.geenVarianten")}</div>
              )}
              <div className="rapport-menu-scheiding" />
              <button
                type="button"
                role="menuitem"
                className="rapport-menu-item"
                disabled={tekst === ""}
                onClick={() => vervang("", t("tekstveld.leegmakenVraag"))}
              >
                <span className="rapport-menu-label">{t("tekstveld.leegmaken")}</span>
                <span className="rapport-menu-uittreksel">{t("tekstveld.leegmakenUitleg")}</span>
              </button>
            </div>
          )}
        </div>
      </div>
      <GroeiVeld waarde={tekst} onChange={(v) => zet(`teksten.${id}`, v)} placeholder={placeholder} />
      {variantNaam !== null && (
        <div className="rapport-bewaar">
          <input
            type="text"
            autoFocus
            onFocus={(e) => e.currentTarget.select()}
            value={variantNaam}
            placeholder={t("tekstveld.variantNaam")}
            onChange={(e) => setVariantNaam(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") bewaar();
              if (e.key === "Escape") setVariantNaam(null);
            }}
          />
          <button
            type="button"
            className="rapport-knop rapport-knop-primair"
            disabled={variantNaam.trim() === ""}
            onClick={bewaar}
          >
            {t("algemeen.bewaar")}
          </button>
          <button type="button" className="rapport-knop" onClick={() => setVariantNaam(null)}>
            {t("algemeen.annuleer")}
          </button>
        </div>
      )}
      {melding && <span className="rapport-melding">{melding}</span>}
      {andereTaal && (
        <span className="rapport-hint">
          {t("tekstveld.andereTaal", {
            taal: t(`document.talen.${andereTaal}`, { defaultValue: andereTaal }),
            rapportTaal: t(`document.talen.${rapportTaal}`, { defaultValue: rapportTaal }),
          })}
        </span>
      )}
      <SubkopMelding tekst={tekst} />
      {hint && <span className="rapport-hint">{hint}</span>}
    </div>
  );
}

/**
 * De invulvelden die een tekst kan gebruiken, de regelopmaak van de teksten
 * en de keuze voor subkoppen in dit rapport. Met de muis op een invulveld zie
 * je wat er nu in het rapport komt te staan.
 */
export function Invulvelden() {
  const { t } = useTranslation("rapport");
  const gegevens = useProjectStore((s) => s.gegevens);
  const rapport = useProjectStore((s) => s.rapport);
  const projectNaam = useProjectStore((s) => s.projectNaam);
  const profielNaam = useBureauStore((s) => s.profiel.naam);
  // Zelfde bronnen als bij het opmaken: projectgegevens, documentgegevens en
  // het bureau — het vastgelegde, of zolang dat leeg is het profiel.
  const waarden: Invulwaarden = {
    adviseur: rapport.bureau.naam || profielNaam,
    projectnummer: gegevens.project_nummer ?? "",
    projectnaam: gegevens.project_naam || projectNaam,
    opdrachtgever: gegevens.opdrachtgever ?? "",
    locatie: gegevens.locatie ?? "",
    verantwoordelijk: rapport.verantwoordelijk,
    uitvoerend: rapport.uitvoerend,
  };
  return (
    <div className="rapport-invulvelden">
      <span className="rapport-label">{t("invulvelden.label")}</span>
      <span className="rapport-invulvelden-lijst">
        {INVULVELDEN.map((v) => (
          <code key={v} title={waarden[v] ? t("invulvelden.nu", { waarde: waarden[v] }) : t("invulvelden.nuLeeg")}>
            {`{${v}}`}
          </code>
        ))}
      </span>
      <span className="rapport-hint">{t("invulvelden.uitleg")}</span>
      <Vink
        label={t("invulvelden.subkoppen")}
        pad="opmaak.subkoppen"
        aan={rapport.opmaak.subkoppen}
        hint={
          <>
            {t("invulvelden.subkoppenUitleg", { aantal: SUBKOP_WOORDEN })}
            {!rapport.opmaak.subkoppen && ` ${t("invulvelden.subkoppenUit")}`}
          </>
        }
      />
    </div>
  );
}
