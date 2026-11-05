import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import i18next from "../../../i18n/config";
import { useInhoudPaginas } from "../../../store/inhoudPaginas";
import { useProjectStore } from "../../../store/projectStore";
import { useWijzigingenLijst } from "../../../store/useWijzigingenLijst";
import { ouderVan } from "../../../store/versies";
import { bladVoorOpzet } from "../../calc/bladSoorten";
import { bladenInBijlage, bouwOpzet } from "../../../rapport/opzet";
import {
  keuzesZonderVerschil, keuzeVan, metKeuze, plekVanRegel, regelKop, weggehaaldeRegels, wijzigingTekst, zichtbareRegels, type Wijzigingsregel,
} from "../../../rapport/wijzigingen";
import { GroeiVeld, Kop, Sectie, useRapport } from "./velden";

/**
 * De lijst met wijzigingen in het rapportpaneel: per regel de plek, wat de app erover zegt en wat de
 * gebruiker erbij wil zetten. Wat je hier doet, blijft staan als de lijst opnieuw wordt gemaakt. De
 * regels staan er zoals op papier, in de taal van het rapport: die tekst bewerk je hier.
 */
function Regels() {
  const { t } = useTranslation("rapport");
  const rapport = useRapport();
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const werkBij = useProjectStore((s) => s.werkRapportBij);
  const paginas = useInhoudPaginas((s) => s.paginas);
  const taal = rapport.taal;
  const papier = useMemo(() => i18next.getFixedT(taal, "rapport"), [taal]);
  const lijst = exemplaren.map(bladVoorOpzet);
  const knopen = bouwOpzet(rapport, lijst);
  const bijlage = bladenInBijlage(rapport, lijst);

  /** Een eigen tekst: gelijk aan wat de app zegt, is geen eigen tekst. */
  const zetTekst = (r: Wijzigingsregel, tekst: string) =>
    werkBij((x) => metKeuze(x, r.sleutel, { tekst: tekst === wijzigingTekst(r, papier, taal) ? undefined : tekst }), `rapport:wijziging:tekst:${r.sleutel}`);

  const regel = (r: Wijzigingsregel) => {
    const keuze = keuzeVan(rapport, r.sleutel);
    const plek = plekVanRegel(r, knopen, bijlage);
    const pagina = plek.pagina ?? (plek.anker ? paginas[plek.anker] : undefined);
    return (
      <div key={r.sleutel} className="rapport-kaart" data-regel={r.sleutel}>
        <div className="rapport-kaart-kop">
          {plek.nummer && <span className="rapport-nummer">{plek.nummer}</span>}
          <span className="rapport-kaart-titel">{regelKop(r, papier)}</span>
          {pagina !== undefined && <span className="rapport-soort">{t("wijzigingen.pagina", { pagina })}</span>}
          <button
            type="button"
            className="rapport-icoon"
            title={t("wijzigingen.weghalen")}
            aria-label={t("wijzigingen.weghalen")}
            onClick={() => werkBij((x) => metKeuze(x, r.sleutel, { weg: true }))}
          >
            ✕
          </button>
        </div>
        <span className="rapport-label">{t("wijzigingen.wat")}</span>
        <GroeiVeld waarde={keuze.tekst ?? wijzigingTekst(r, papier, taal)} onChange={(v) => zetTekst(r, v)} />
        {keuze.tekst !== undefined && (
          <button type="button" className="rapport-link" onClick={() => werkBij((x) => metKeuze(x, r.sleutel, { tekst: undefined }))}>
            {t("wijzigingen.tekstVanApp")}
          </button>
        )}
        <span className="rapport-label">{t("wijzigingen.toelichting")}</span>
        <GroeiVeld
          waarde={keuze.toelichting ?? ""}
          placeholder={t("wijzigingen.toelichtingLeeg")}
          onChange={(v) => werkBij((x) => metKeuze(x, r.sleutel, { toelichting: v }), `rapport:wijziging:toelichting:${r.sleutel}`)}
        />
      </div>
    );
  };

  const zichtbaar = zichtbareRegels(rapport);
  const weg = weggehaaldeRegels(rapport);
  const zonderVerschil = keuzesZonderVerschil(rapport);
  return (
    <>
      {zichtbaar.length === 0 && <p className="rapport-melding-blok rustig">{t("wijzigingen.leeg")}</p>}
      {zichtbaar.map(regel)}
      {weg.length > 0 && (
        <>
          <h6 className="rapport-subkop">{t("wijzigingen.weggehaald")}</h6>
          <ul className="rapport-opzet-lijst">
            {weg.map((r) => (
              <li key={r.sleutel}>
                <span className="rapport-kaart-titel">{regelKop(r, papier)}</span>
                <button type="button" className="rapport-knop" onClick={() => werkBij((x) => metKeuze(x, r.sleutel, { weg: undefined }))}>
                  {t("wijzigingen.terugzetten")}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {zonderVerschil.length > 0 && (
        <>
          <h6 className="rapport-subkop">{t("wijzigingen.zonderVerschil")}</h6>
          <p className="rapport-hint">{t("wijzigingen.zonderVerschilUitleg")}</p>
          <ul className="rapport-opzet-lijst">
            {zonderVerschil.map(({ sleutel, keuze }) => (
              <li key={sleutel}>
                <span className="rapport-kaart-titel">{keuze.toelichting ?? keuze.tekst}</span>
                <button
                  type="button"
                  className="rapport-icoon"
                  title={t("wijzigingen.vergeten")}
                  aria-label={t("wijzigingen.vergeten")}
                  onClick={() => werkBij((x) => metKeuze(x, sleutel, { tekst: undefined, toelichting: undefined, weg: undefined }))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

/** Heeft de versie die openstaat een oudertak? Anders is er niets om mee te vergelijken. */
const useHeeftOuder = () => useProjectStore((s) => ouderVan(s.versies, s.versies.actief) !== undefined);

/** Het blok op een plek onder een hoofdstuk: zijn kop en zijn regels, tussen de andere onderdelen. */
export function WijzigingenInvoer() {
  useWijzigingenLijst();
  const heeftOuder = useHeeftOuder();
  return (
    <>
      <Kop id="wijzigingen" />
      {heeftOuder && <Regels />}
    </>
  );
}

/**
 * De lijst op het hoogste niveau: bij de inhoudsopgave op papier, en dus niet tussen de hoofdstukken
 * in dit paneel. Zolang er geen oudertak is, is er niets om te tonen.
 */
export default function WijzigingenSectie() {
  const { t } = useTranslation("rapport");
  useWijzigingenLijst();
  const heeftOuder = useHeeftOuder();
  if (!heeftOuder) return null;
  return (
    <Sectie id="wijzigingen" titel={t("secties.wijzigingen")} intro={t("wijzigingen.intro")}>
      <Regels />
    </Sectie>
  );
}
