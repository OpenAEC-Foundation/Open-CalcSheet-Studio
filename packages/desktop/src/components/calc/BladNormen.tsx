import { useTranslation } from "react-i18next";
import { useProjectStore } from "../../store/projectStore";
import { normenVoorBlad, type ProjectNorm } from "../../store/projectNormen";

/** Eén vastgelegde norm als tekst: aanduiding, editie en nationale bijlage, of wat ontbreekt. */
export function normRegelTekst(t: (s: string, o?: Record<string, unknown>) => string, r: ProjectNorm): string {
  const editie = r.editie.trim() ? t("afdruk.normEditie", { editie: r.editie.trim() }) : t("afdruk.editieOnbekend");
  const nb = r.nb.trim() ? t("afdruk.normNb", { nb: r.nb.trim() }) : t("afdruk.nbOnbekend");
  return `${r.norm.trim()}, ${editie}, ${nb}`;
}

/**
 * In de kop van een blad op papier: de editie en de nationale bijlage van elke Eurocode die
 * het blad noemt, zoals het project ze vastlegt (store/projectNormen.ts). Een norm die het
 * project niet noemt, staat er als niet vastgelegd. Legt het project niets vast, dan staat
 * hier niets en blijft de kop zoals hij was.
 */
export function BladNormenRegel({ source }: { source: string }) {
  const { t } = useTranslation("beelden");
  const gegevens = useProjectStore((s) => s.gegevens);
  const normen = normenVoorBlad(gegevens, source);
  if (normen.length === 0) return null;
  // Een regel die meer delen dekt (EN 1991 voor EN 1991-1-1 en EN 1991-1-4) één keer.
  const gezien = new Set<ProjectNorm>();
  const delen: string[] = [];
  for (const { deel, regel } of normen) {
    if (regel && gezien.has(regel)) continue;
    if (regel) gezien.add(regel);
    delen.push(regel ? normRegelTekst(t, regel) : t("afdruk.nietInProject", { deel }));
  }
  return (
    <span className="print-blad-norm print-blad-normen">
      {t("afdruk.normenKort")} {delen.join("; ")}
    </span>
  );
}
