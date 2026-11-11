/**
 * De invoervelden van een blad zoals de tabel Varianten ze toont: met het label uit het
 * blad en de kop waaronder ze staan. Zuiver, zonder React: scripts/check-varianten.mjs
 * laadt dit in Node.
 */
import type { AstNode } from "@ifc-calc/core";
import { invoervelden, type Invoerveld } from "../bladVersie.ts";

export interface VariantVeld extends Invoerveld {
  /** De uitleg naast het veld in het blad ("hoogte"), of bij een keuzelijst zijn label. */
  label: string;
  /** De kop waaronder het veld in het blad staat; leeg vóór de eerste kop. */
  kop: string;
}

const zonderHtml = (t: string) => t.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** Wat na een `?`-veld op dezelfde regel staat: ", hoogte" wordt "hoogte". */
const naastVeld = (t: string) => zonderHtml(t).replace(/^[,;:–—-]\s*/, "");

/**
 * De invoervelden van een ingelezen blad, in de volgorde van het blad, met label en
 * kop. Een naam die twee keer voorkomt, telt één keer (`invoervelden`), met de kop van
 * de eerste keer. Staat hij in meer takken met een ander label ("lengte van de
 * uitkraging", "veld 1"), dan staan die labels er allemaal, één keer.
 */
export function variantVelden(ast: AstNode[]): VariantVeld[] {
  const extra = new Map<string, { labels: string[]; kop: string }>();
  let kop = "";
  const loop = (lijst: AstNode[]) => {
    lijst.forEach((n, i) => {
      if (n.type === "heading") kop = zonderHtml(n.text);
      else if (n.type === "conditional") {
        for (const tak of n.branches) loop(tak.body);
        loop(n.elseBody);
      } else if (n.type === "repeat") loop(n.body);
      else if (n.type === "input-prompt" || n.type === "select") {
        const volgende = lijst[i + 1];
        const label =
          n.type === "select"
            ? zonderHtml(n.label)
            : volgende?.type === "text" && volgende.inline
              ? naastVeld(volgende.text)
              : "";
        const al = extra.get(n.name) ?? { labels: [], kop };
        if (label && label !== n.name && !al.labels.includes(label)) al.labels.push(label);
        extra.set(n.name, al);
      }
    });
  };
  loop(ast);
  return invoervelden(ast).map((v) => {
    const e = extra.get(v.naam);
    return { ...v, label: e?.labels.join(" / ") ?? "", kop: e?.kop ?? "" };
  });
}
