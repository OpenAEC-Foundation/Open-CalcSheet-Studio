import { useMemo, useRef } from "react";
import { useDrieDAfdruk } from "./drieDBlok";
import { useInhoudsopgave } from "./useInhoudsopgave";
import { useIfcxAfdruk } from "./ifcxBlok";
import { useIframeAfdruk } from "./iframeBlok";
import { useJsAfdruk } from "./jsBlok";
import { metDecimaalKomma, taalMetKomma } from "@ifc-calc/core";
import { schoonUitwerking } from "./uitwerkingOpschonen";
import { useAfdrukTaal } from "./afdrukTaal";
import { useTranslation } from "react-i18next";
import { useProjectStore } from "../../store/projectStore";
import { bladenUitSleutel, bladNamenSleutel, bronnenInvullen, bronTeksten } from "./bronnen";

/**
 * De uitwerking van een blad op papier. Een 3D-blok (`@3d`, `@ifcx`) wordt hier een
 * stilstaande afbeelding (drieDBlok.ts, ifcxBlok.ts) en een bevestigde `@iframe`
 * de pagina (iframeBlok.ts), en een uitgevoerd `@js` zijn afbeelding of venster
 * (jsBlok.ts); het afdrukken wacht daarop. `bladId`: van welk blad dit is, want
 * alleen wat op dat blad is bevestigd, wordt uitgevoerd.
 */
export function UitwerkingHtml({ html, bladId }: { html: string; bladId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useDrieDAfdruk(ref, html);
  useIfcxAfdruk(ref, html);
  useIframeAfdruk(ref, html);
  useJsAfdruk(ref, html, bladId);
  // Hetzelfde object zolang de html gelijk blijft: React 19 zet de html bij
  // elk nieuw object opnieuw neer, en dan was de afbeelding weer weg.
  // Op papier in een taal met een komma staan de getallen met een komma; de rekentaal en
  // het scherm houden de punt.
  const komma = taalMetKomma(useAfdrukTaal());
  // Een verwijzing met `@bron` krijgt op papier de bron erbij: het PDF-blad of het bestand en de pagina (bronnen.ts).
  const { t } = useTranslation("beelden");
  const bladNamen = useProjectStore((s) => bladNamenSleutel(s.exemplaren));
  // Een blad met de plek voor de inhoudsopgave (het Voorblad): die wordt gemaakt uit de bladen.
  const metOpgave = useInhoudsopgave(html);
  const inhoud = useMemo(() => {
    const schoon = bronnenInvullen(schoonUitwerking(metOpgave), bronTeksten(t), bladenUitSleutel(bladNamen));
    return { __html: komma ? metDecimaalKomma(schoon) : schoon };
  }, [metOpgave, komma, t, bladNamen]);
  return <div ref={ref} className="ifc-calc" dangerouslySetInnerHTML={inhoud} />;
}
