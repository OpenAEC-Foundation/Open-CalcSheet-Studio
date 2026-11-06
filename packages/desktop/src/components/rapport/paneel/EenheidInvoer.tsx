import { useState } from "react";
import { eenheidUitBeeld, invoerNaarBron } from "@ifc-calc/core";
import { useBeeldEenheden } from "../../calc/useBeeldEenheden";

/**
 * Een tekstveld van het rapport met een eenheid, in het eenhedenstelsel van het project
 * (docs/superpowers/specs/2026-11-06-eenheden-design.md, "Het rapport").
 *
 * Opgeslagen wordt in de eigen eenheid van het rapport (`eenheid`, zoals "kN/m²"): in US
 * customary staat 2,4 kN/m² als 50,1 psf in het veld, en 50 psf getypt wordt 2,394 kN/m².
 * Een getal met een eenheid erachter ("12 in") geldt in die eenheid. Wat geen waarde is
 * voor dit veld ("3 kip" in een veld in psf), krijgt een rode rand en wordt niet opgeslagen.
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
  // Wat je typt, blijft staan zolang het veld de focus heeft; anders sprong "2," meteen terug.
  const [tekst, setTekst] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const doel = eenheden.doel(eenheid);
  if (!doel) {
    return (
      <input type="text" value={waarde} placeholder={placeholder} list={lijst} className={className}
        onChange={(e) => onWijzig(e.target.value)} />
    );
  }
  const inBeeld = eenheden.invoer(waarde, eenheid);
  const klasse = [className, fout ? "rapport-invoer-fout" : ""].filter(Boolean).join(" ") || undefined;
  return (
    <input type="text" value={tekst ?? inBeeld} placeholder={placeholder} list={lijst} className={klasse}
      title={fout ?? undefined} aria-invalid={fout ? true : undefined}
      onFocus={() => setTekst(inBeeld)}
      onBlur={() => { setTekst(null); setFout(null); }}
      onChange={(e) => {
        const v = e.target.value;
        setTekst(v);
        const terug = invoerNaarBron(v, doel, eenheidUitBeeld(eenheid));
        if ("fout" in terug) {
          setFout(terug.fout);
          return;
        }
        setFout(null);
        // Terug naar wat er stond: de opgeslagen waarde houden, anders loopt hij weg (2,4 → 2,39999).
        if (v.trim() === inBeeld) return;
        onWijzig(terug.waarde);
      }} />
  );
}
