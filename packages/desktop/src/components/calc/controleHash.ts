import i18next from "i18next";
import { rekentaalIncludes, rekentaalImageUrls } from "../../templates/rekentaal-includes";
import { projectScope, type ProjectGegevens } from "../../store/projectGegevens";
import { evalOptiesVan } from "../../store/projectEenheden";
import { projectTekstVan } from "../../store/projectBlad";
import { isLosBlad } from "../../store/spreadsheetBlad";
import { bladHash, type BladHash } from "../../store/controle";
import type { Exemplaar } from "../../store/projectStore";
import type { Belastingen } from "../../rapport/model";
import { metToetsingen } from "../../rekenen/toetsCache";
import { scopeMetVerwijzingen, verwezenBladen } from "../../rekenen/verwijzingen";
import { leesGetallen, leesResultaat, metRefNamen } from "./bladLezen";
import { rekenUitwerking } from "./canvasRekenen";

/**
 * De hash van een blad zoals het nu is (store/controle.ts): de rekentekst, de invoer en de
 * uitkomst. Rekent het blad door zoals de uitwerking: met de projectgegevens, de belastingen
 * van het rapport en de eigen elementen van de projectgegevens, de bladen waarnaar het
 * verwijst en de vastgelegde antwoorden van FEM Studio (alleen lezen). Altijd op de bron
 * (de Nederlandse rekentekst), dus in elke taal dezelfde hash. Een blad zonder rekentekst
 * (PDF, werkmap) heeft geen uitkomst; een blad dat niet doorrekent geeft null.
 */
export function bladHashNu(
  ex: Exemplaar,
  alle: readonly Exemplaar[],
  gegevens: ProjectGegevens,
  belastingen?: Belastingen,
  rapportTaal?: string,
): BladHash | null {
  if (isLosBlad(ex)) return bladHash(ex.source, ex.waarden, { uc: null, voldoet: null, getallen: {} });
  try {
    const project = projectTekstVan(gegevens, belastingen, rapportTaal);
    const evalOpties = metToetsingen({ ...evalOptiesVan(gegevens), ...(project ? { project } : {}) }, "lezen", i18next.language);
    const opties = { includes: rekentaalIncludes, imageUrls: rekentaalImageUrls, eenheden: (evalOpties.eigenEenheden ?? []).map((e) => e.naam) };
    const scope = scopeMetVerwijzingen(ex.source, ex.waarden, projectScope(gegevens), verwezenBladen(ex.source, ex.waarden, alle), opties, evalOpties);
    const { nodes } = rekenUitwerking(ex.source, ex.waarden, scope, opties, undefined, evalOpties);
    const r = leesResultaat(nodes, ex.naam);
    return bladHash(ex.source, ex.waarden, {
      uc: r.uc,
      voldoet: r.voldoet,
      nietGetoetst: r.nietGetoetst,
      getallen: metRefNamen(leesGetallen(nodes), ex.source),
    });
  } catch {
    return null;
  }
}
