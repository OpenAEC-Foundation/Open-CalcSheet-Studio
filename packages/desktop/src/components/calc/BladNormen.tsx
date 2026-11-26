import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useProjectStore } from "../../store/projectStore";
import { projectScope } from "../../store/projectGegevens";
import { normenVoorBlad, type ProjectNorm } from "../../store/projectNormen";
import { projectNbKeuzes, type NbKeuze } from "./nbKeuzes";
import "./BladNormen.css";

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

/**
 * De gekozen waarden uit de nationale bijlage van een blad: de gemerkte waarden van het blad
 * (`//@nb`, nbKeuzes.ts) en wat het via de projectgegevens gebruikt (K_FI, windgebied,
 * terreincategorie). Daarboven de nationale bijlage die het project voor de normen van het
 * blad vastlegt (projectNormen.ts). Op het scherm onder de uitwerking, op papier onder het
 * blad. Zonder merkteken en zonder projectwaarde: niets.
 */
export function NbKeuzesTabel({ source, nb, papier }: { source: string; nb?: NbKeuze[]; papier?: boolean }) {
  const { t } = useTranslation("beelden");
  const gegevens = useProjectStore((s) => s.gegevens);
  const scope = useMemo(() => projectScope(gegevens), [gegevens]);
  // Op papier alleen bij een blad dat zelf keuzes merkt: een opgeleverd blad zonder merkteken
  // blijft op papier zoals het was, en de uitdraai blijft kort. Op het scherm altijd.
  if (papier && !nb?.length) return null;
  const project = projectNbKeuzes(source, scope);
  const rijen = [...(nb ?? []), ...project];
  if (rijen.length === 0) return null;
  const bijlagen = normenVoorBlad(gegevens, source)
    .filter((n) => n.regel?.nb.trim())
    .map((n) => `${n.regel!.norm.trim()} ${n.regel!.nb.trim()}`);
  const uniek = [...new Set(bijlagen)];
  return (
    <section className={papier ? "nb-keuzes nb-keuzes-papier" : "nb-keuzes"}>
      <p className="nb-keuzes-kop">{t("afdruk.nbKeuzesKop")}</p>
      <p className="nb-keuzes-bijlage">
        {uniek.length ? t("afdruk.nbVolgensProject", { bijlagen: uniek.join("; ") }) : t("afdruk.nbNietInProject")}
      </p>
      <table>
        <thead>
          <tr>
            <th>{t("afdruk.nbSymbool")}</th>
            <th>{t("afdruk.nbWaarde")}</th>
            <th>{t("afdruk.nbArtikel")}</th>
          </tr>
        </thead>
        <tbody>
          {rijen.map((r) => (
            <tr key={`${r.project ? "p" : "b"}-${r.naam}`}>
              <td><code>{r.naam}</code></td>
              <td>{r.waarde ?? <i>{t("afdruk.nbNietBerekend")}</i>}</td>
              <td>{r.artikel}{r.project && <span className="nb-keuzes-bron"> · {t("afdruk.nbUitProject")}</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
