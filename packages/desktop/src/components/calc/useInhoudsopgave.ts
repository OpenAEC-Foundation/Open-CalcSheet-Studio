import { useMemo } from "react";
import i18next from "i18next";
import { INHOUD_PLEK, inhoudHtml, inhoudVanBladen } from "../../rapport/inhoudVanBladen";
import { BIJLAGE_A } from "../../rapport/opzet";
import { inTaal } from "../../rapport/meertalig";
import { useProjectStore } from "../../store/projectStore";

/**
 * De uitwerking van een blad met de inhoudsopgave erin, als het blad de plek ervoor heeft
 * (`<div data-inhoudsopgave></div>`, het Voorblad): gemaakt uit de bladen van het project
 * (rapport/inhoudVanBladen.ts), in de taal van het rapport. Op het scherm (Preview.tsx) en
 * op papier (UitwerkingHtml.tsx) hetzelfde.
 */
export function useInhoudsopgave(html: string): string {
  const metInhoud = html.includes(INHOUD_PLEK);
  const exemplaren = useProjectStore((s) => (metInhoud ? s.exemplaren : null));
  const taal = useProjectStore((s) => s.rapport.taal);
  return useMemo(() => {
    if (!exemplaren) return html;
    const t = i18next.getFixedT(taal, "rapport");
    return html.replace(INHOUD_PLEK, inhoudHtml(inhoudVanBladen(exemplaren, inTaal(BIJLAGE_A, taal)), t("afdruk.inhoud.titel")));
  }, [html, exemplaren, taal]);
}
