import type { GraafNode } from "../../graaf/model";
import type { GraafMelding } from "../../graaf/rekenen";

/*
 * De namen op een node en de meldingen, in de taal van de app. Zelfde teksten op
 * het scherm en op papier; papier leest ze met een eigen vaste vertaler.
 */

type Vertaler = (sleutel: string, opties?: Record<string, unknown>) => string;

/** De naam van een node: zijn eigen naam, of die van de soort. */
export function nodeNaam(t: Vertaler, node: GraafNode): string {
  return node.naam || t(`graaf.soort.${node.soort}`, { defaultValue: node.soort });
}

/** De naam van een poort. In een codeblok is dat de naam uit de code. */
export function poortTekst(t: Vertaler, node: GraafNode, naam: string): string {
  return node.soort === "codeblok" ? naam : t(`graaf.poort.${naam}`, { defaultValue: naam });
}

/** Een melding bij `node`; de naam van een poort erin staat in de taal van de app. */
export function meldingTekst(t: Vertaler, m: GraafMelding, node: GraafNode): string {
  const { naam } = m.gegevens;
  return t(`graaf.fout.${m.code}`, {
    defaultValue: m.code,
    ...m.gegevens,
    ...(typeof naam === "string" && naam ? { naam: poortTekst(t, node, naam) } : {}),
  });
}
