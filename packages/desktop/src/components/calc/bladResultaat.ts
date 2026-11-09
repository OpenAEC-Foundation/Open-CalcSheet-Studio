import { useMemo } from "react";
import i18next from "i18next";
import { parse, evaluate } from "@ifc-calc/core";
import type { AstNode } from "@ifc-calc/core";
import { rekentaalIncludes, rekentaalImageUrls } from "../../templates/rekentaal-includes";
import { useActiefExemplaar, useAlleenLezen, useProjectScope } from "../../store/actiefBlad";
import { leesGetallen, leesResultaat, metRefNamen, ucTekst, type BladUitkomst, type Resultaat } from "./bladLezen";
import { useDoorrekening } from "../../rekenen/doorrekening";
import { metToetsingen } from "../../rekenen/toetsCache";

export { ucTekst, leesResultaat, leesGetallen, metRefNamen } from "./bladLezen";
export type { Resultaat, BladUitkomst } from "./bladLezen";

/** Leest een bladtekst in, met dezelfde includes en afbeeldingen als de uitwerking. */
export function leesBlad(source: string): AstNode[] {
  return parse(source, { includes: rekentaalIncludes, imageUrls: rekentaalImageUrls });
}

/**
 * Rekent een blad door met de gegeven invoer en projectgegevens. Los van de
 * hook, zodat een beeld het blad ook met een ándere invoer kan doorrekenen —
 * de ontwerpknop van de balklaag probeert zo de profielen uit de lijst. Een
 * al ingelezen blad scheelt dan het inlezen per poging.
 */
export function rekenBladDoor(
  blad: string | AstNode[],
  waarden: Record<string, string>,
  scope: Record<string, unknown>,
  naam: string,
): BladUitkomst | null {
  try {
    const ast = typeof blad === "string" ? leesBlad(blad) : blad;
    // Een @toets-blok leest zijn vastgelegde antwoord; hier gaat niets naar FEM Studio.
    const nodes = evaluate(ast, waarden, scope, metToetsingen({}, "lezen"));
    const getallen = leesGetallen(nodes);
    return {
      resultaat: leesResultaat(nodes, naam),
      getallen: typeof blad === "string" ? metRefNamen(getallen, blad) : getallen,
    };
  } catch {
    return null;
  }
}

/**
 * Rekent het blad dat het beeld tekent door: normaal het actieve blad, in de
 * afdruk het blad van de afdrukcontext. Met dezelfde invoer en
 * projectgegevens als de uitwerking ernaast, dus met dezelfde uitkomst.
 *
 * In de werkruimte rekent de worker (rekenen/doorrekening.ts), samen met de
 * uitwerking: het venster bevriest dan niet bij een groot blad. In de afdruk
 * (alleen lezen) direct, want daar moet elk beeld af zijn voordat er papier
 * uit komt.
 */
export function useBladUitkomst(): BladUitkomst | null {
  const exemplaar = useActiefExemplaar();
  const scope = useProjectScope();
  const alleenLezen = useAlleenLezen();
  const source = exemplaar?.source ?? "";
  const waarden = exemplaar?.waarden ?? GEEN_WAARDEN;
  const naam = exemplaar?.naam ?? "";
  const direct = useMemo(
    () => (alleenLezen && source ? rekenBladDoor(source, waarden, scope, naam) : null),
    [alleenLezen, source, waarden, scope, naam],
  );
  const { doorrekening } = useDoorrekening(exemplaar?.id, alleenLezen ? "" : source, waarden, scope, naam);
  return alleenLezen ? direct : (doorrekening?.uitkomst ?? null);
}

const GEEN_WAARDEN: Record<string, string> = {};

/** De automatische samenvatting voor hoofdstuk Berekeningen: "Houten balklaag — UC 0,82, voldoet.", in de taal van het rapport. */
export function samenvatting(r: Resultaat, taal: string): string {
  const delen: string[] = [];
  if (r.uc !== null) delen.push(`UC ${ucTekst(r.uc, taal)}`);
  if (r.voldoet !== null) delen.push(i18next.t(r.voldoet ? "beelden:afdruk.voldoet" : "beelden:afdruk.voldoetNiet", { lng: taal }));
  else if (r.nietGetoetst) delen.push(i18next.t("beelden:kit.nietGetoetst", { lng: taal }));
  return delen.length > 0 ? `${r.titel} — ${delen.join(", ")}.` : `${r.titel}.`;
}
