import { useRef, useState } from "react";
import { decimaleKomma } from "../../../rapport/model";
import { useProjectStore } from "../../../store/projectStore";
import { useBeeldEenheden } from "../../calc/useBeeldEenheden";

/**
 * Een tekstveld van het rapport met een eenheid, in het eenhedenstelsel van het project
 * (docs/superpowers/specs/2026-11-06-eenheden-design.md, "Het rapport").
 *
 * Opgeslagen wordt in de eigen eenheid van het rapport (`eenheid`, zoals "kN/m²"), op zes
 * cijfers en met de decimale komma van de taal van het rapport: in US customary staat
 * 2,4 kN/m² als 50,125 psf in het veld, en 50 psf getypt wordt 2,39401 kN/m². Een getal met
 * een eenheid erachter ("12 m") geldt in die eenheid. Wat geen waarde is voor dit veld
 * ("3 kip" in een veld in psf), krijgt een rode rand en wordt niet opgeslagen.
 * Rekent het stelsel de eenheid niet om, dan is het een gewoon tekstveld, zoals altijd.
 */
export function EenheidInvoer({ waarde, eenheid, onWijzig, placeholder, lijst, className }: {
  waarde: string;
  eenheid: string;
  onWijzig: (waarde: string) => void;
  placeholder?: string;
  lijst?: string;
  className?: string;
}) {
  const eenheden = useBeeldEenheden();
  const komma = useProjectStore((s) => decimaleKomma(s.rapport.taal));
  // Wat je typt, blijft staan zolang het veld de focus heeft; anders sprong "2," meteen terug.
  const [tekst, setTekst] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  // Wat er bij de focus stond, in beeld en opgeslagen: typ je dat terug, dan komt precies de
  // oude waarde terug in plaats van een omgerekende benadering (2,4 → 2,39999).
  const begin = useRef<{ tekst: string; waarde: string } | null>(null);
  if (!eenheden.doel(eenheid)) {
    return (
      <input type="text" value={waarde} placeholder={placeholder} list={lijst} className={className}
        onChange={(e) => onWijzig(e.target.value)} />
    );
  }
  const inBeeld = komma ? eenheden.invoer(waarde, eenheid).replace(".", ",") : eenheden.invoer(waarde, eenheid);
  const klasse = [className, fout ? "rapport-invoer-fout" : ""].filter(Boolean).join(" ") || undefined;
  return (
    <input type="text" value={tekst ?? inBeeld} placeholder={placeholder} list={lijst} className={klasse}
      title={fout ?? undefined} aria-invalid={fout ? true : undefined}
      onFocus={() => {
        begin.current = { tekst: inBeeld, waarde };
        setTekst(inBeeld);
      }}
      onBlur={() => {
        begin.current = null;
        setTekst(null);
        setFout(null);
      }}
      onChange={(e) => {
        const v = e.target.value;
        setTekst(v);
        if (begin.current && v.trim() === begin.current.tekst) {
          setFout(null);
          if (waarde !== begin.current.waarde) onWijzig(begin.current.waarde);
          return;
        }
        const terug = eenheden.opslag(v, eenheid, komma);
        if (terug === null) return;
        if ("fout" in terug) {
          setFout(terug.fout);
          return;
        }
        setFout(null);
        onWijzig(terug.waarde);
      }} />
  );
}
