import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { inhoudVoorPaneel } from "../../rapport/opzet";
import { plekVanBlad, type Plekstuk } from "../../rapport/plek";
import { isBladRol } from "../../rapport/uitBladen";
import { useInhoudPaginas } from "../../store/inhoudPaginas";
import { usePrintStore } from "../../store/printStore";
import { RAPPORT_ID, useProjectStore } from "../../store/projectStore";
import { useRapportSprong } from "../../store/rapportSprong";
import { bladVoorOpzet } from "./bladSoorten";
import "./RapportPlek.css";

/** De pagina's van een stuk: `p. 14` of `p. 14–15`; zonder voorbeeld niets. */
function paginaTekst(s: Plekstuk, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (s.van === undefined) return "";
  return s.tot !== undefined && s.tot > s.van ? t("plek.paginas", { van: s.van, tot: s.tot }) : t("plek.pagina", { van: s.van });
}

/** De plekken van een blad in het rapport, met hun pagina's. */
export function useRapportPlek(bladId: string | undefined): Plekstuk[] {
  const rapport = useProjectStore((s) => s.rapport);
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const { paginas, totaal } = useInhoudPaginas();
  const regels = useMemo(() => inhoudVoorPaneel(rapport, exemplaren.map(bladVoorOpzet)), [rapport, exemplaren]);
  return useMemo(() => (bladId ? plekVanBlad(regels, bladId, paginas, totaal) : []), [regels, bladId, paginas, totaal]);
}

/**
 * Waar dit blad in het rapport komt, vast in de kop van de uitdraai:
 * "Rapport › 6.2 · A.2 p. 14–15". Een klik op een stuk opent het rapport op die plek, met
 * het voorbeeld ernaast op die pagina. De pagina's staan er zodra het rapport een keer is
 * opgemaakt; ze komen uit het laatste voorbeeld.
 */
export default function RapportPlek({ blad }: { blad: string }) {
  const { t } = useTranslation("werkruimte");
  const stukken = useRapportPlek(blad);
  const selecteer = useProjectStore((s) => s.selecteer);
  const spring = useRapportSprong((s) => s.spring);
  const sluitVoorbeeld = usePrintStore((s) => s.sluitVoorbeeld);
  const uitBladen = useProjectStore((s) => s.rapport.uitBladen === true);
  const rol = useProjectStore((s) => s.rapport.bladRol?.[blad] ?? "");
  const werkBij = useProjectStore((s) => s.werkRapportBij);
  // Uit bladen opgebouwd: hier kies je wat dit blad in het rapport is.
  const keuze = uitBladen ? (
    <select
      className="rapport-plek-rol"
      value={isBladRol(rol) ? rol : ""}
      title={t("plek.rolUitleg")}
      aria-label={t("plek.rolUitleg")}
      onChange={(e) => {
        const nieuw = e.target.value;
        werkBij((r) => {
          const { [blad]: _weg, ...rest } = r.bladRol ?? {};
          return { ...r, bladRol: nieuw ? { ...rest, [blad]: nieuw } : rest };
        });
      }}
    >
      <option value="hoofdstuk">{t("plek.rolHoofdstuk")}</option>
      <option value="paragraaf">{t("plek.rolParagraaf")}</option>
      <option value="">{t("plek.rolBijlage")}</option>
    </select>
  ) : null;
  if (stukken.length === 0) return keuze ? <span className="rapport-plek">{keuze}</span> : null;
  const zonderPaginas = stukken.every((s) => s.van === undefined);
  return (
    <span className="rapport-plek" title={zonderPaginas ? t("plek.uitlegZonderPaginas") : t("plek.uitleg")}>
      {keuze}
      <span className="rapport-plek-rapport">{t("plek.rapport")}</span>
      <span className="rapport-plek-pijl" aria-hidden="true">›</span>
      {stukken.map((s, i) => (
        <span key={s.anker} className="rapport-plek-stuk">
          {i > 0 && <span className="rapport-plek-scheiding" aria-hidden="true">·</span>}
          <button
            type="button"
            onClick={() => {
              // Het voorbeeld van een blad gaat dicht: het rapport heeft zijn eigen voorbeeld.
              sluitVoorbeeld();
              selecteer(RAPPORT_ID);
              spring(s.anker);
            }}
            title={t(s.bijlage ? "plek.naarBijlage" : "plek.naarHoofdstuk", { nummer: s.nummer, titel: s.titel })}
          >
            <b>{s.nummer}</b>
            {s.van !== undefined && <span className="rapport-plek-pagina"> {paginaTekst(s, t)}</span>}
          </button>
        </span>
      ))}
    </span>
  );
}

export { paginaTekst };
