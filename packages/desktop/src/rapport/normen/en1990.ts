/**
 * De aanbevolen waarden uit EN 1990:2002 + A1:2005, als begin van de invoer in een
 * Eurocode-land. Een nationale bijlage kan ze wijzigen; daarom zijn ze aan te passen en staat
 * die melding erbij. Alleen getallen en tabelnummers, geen normtekst.
 *
 * Getoetst aan openbare bronnen (zie EN1990_BRONNEN): tabel A1.2(A), A1.2(B), A1.2(C), A1.3
 * en A1.4 aan het CEN-corrigendum; tabel A1.1 aan de JRC-presentaties. Tabel A1.3 (de
 * buitengewone combinatie) laat de factoren weg: die zijn impliciet 1,00.
 *
 * De tweede generatie staat hier niet: voor EN 1990:2023 is er geen openbare bron met de
 * definitieve factoren en ψ-waarden, dus die vult de gebruiker zelf in.
 *
 * Getallen staan hier met een komma; ze krijgen de notatie van de taal (inNotatie).
 */
import { TALEN } from "../../i18n/talen.ts";
import { mt, type Meertalig } from "../meertalig.ts";

export const EN1990_BRONNEN: readonly { titel: string; url: string }[] = [
  { titel: "EN 1990:2002/A1:2005/AC:2010 (CEN)", url: "https://cms.sia.ch/de/api/getMedia/462" },
  { titel: "EN 1990, JRC, Brussels 2008", url: "https://eurocodes.jrc.ec.europa.eu/sites/default/files/2022-06/EN1990_4_Calgaro.pdf" },
];

/** Een regel van tabel A1.2 t/m A1.4; de cellen zijn γ_G,inf, γ_G,sup, γ_Q,1 en γ_Q,i. */
export interface Factorrij {
  groep: string;
  naam: Meertalig;
  cellen: readonly [string, string, string, string];
}

const zelfde = (t: string): Meertalig => Object.fromEntries(TALEN.map(({ code }) => [code, t])) as Meertalig;

export const EN1990_FACTOREN: readonly Factorrij[] = [
  { groep: "A", naam: zelfde("EQU(6.10)"), cellen: ["0,90", "1,10", "1,50", "1,50ψ0"] },
  { groep: "B", naam: zelfde("STR/GEO(6.10)"), cellen: ["1,00", "1,35", "1,50", "1,50ψ0"] },
  { groep: "B", naam: zelfde("STR/GEO(6.10a)"), cellen: ["1,00", "1,35", "1,50ψ0", "1,50ψ0"] },
  // ξ = 0,85, dus ξ·γ_G,sup = 0,85 × 1,35 ≈ 1,15.
  { groep: "B", naam: zelfde("STR/GEO(6.10b)"), cellen: ["1,00", "1,15", "1,50", "1,50ψ0"] },
  { groep: "C", naam: zelfde("STR/GEO(6.10)"), cellen: ["1,00", "1,00", "1,30", "1,30ψ0"] },
  // De nationale bijlage kiest ψ1 of ψ2 voor de overheersende veranderlijke belasting.
  { groep: "", naam: mt("normen.en1990.factoren.1"), cellen: ["1,00", "1,00", "ψ1/ψ2", "ψ2"] },
  { groep: "", naam: mt("normen.en1990.factoren.2"), cellen: ["1,00", "1,00", "1,00", "ψ0"] },
  { groep: "", naam: zelfde("Frequent(6.15b)"), cellen: ["1,00", "1,00", "ψ1", "ψ2"] },
  { groep: "", naam: mt("normen.en1990.factoren.3"), cellen: ["1,00", "1,00", "ψ2", "ψ2"] },
];

/** Tabel A1.1: ψ0, ψ1, ψ2 voor gebouwen. */
export const EN1990_PSI: readonly { naam: Meertalig; psi: readonly [string, string, string] }[] = [
  { naam: mt("normen.en1990.psi.1"), psi: ["0,7", "0,5", "0,3"] },
  { naam: mt("normen.en1990.psi.2"), psi: ["0,7", "0,5", "0,3"] },
  { naam: mt("normen.en1990.psi.3"), psi: ["0,7", "0,7", "0,6"] },
  { naam: mt("normen.en1990.psi.4"), psi: ["0,7", "0,7", "0,6"] },
  { naam: mt("normen.en1990.psi.5"), psi: ["1,0", "0,9", "0,8"] },
  { naam: mt("normen.en1990.psi.6"), psi: ["0,7", "0,7", "0,6"] },
  { naam: mt("normen.en1990.psi.7"), psi: ["0,7", "0,5", "0,3"] },
  { naam: mt("normen.en1990.psi.8"), psi: ["0", "0", "0"] },
  { naam: mt("normen.en1990.psi.9"), psi: ["0,7", "0,5", "0,2"] },
  { naam: mt("normen.en1990.psi.10"), psi: ["0,7", "0,5", "0,2"] },
  { naam: mt("normen.en1990.psi.11"), psi: ["0,5", "0,2", "0"] },
  { naam: mt("normen.en1990.psi.12"), psi: ["0,6", "0,2", "0"] },
  { naam: mt("normen.en1990.psi.13"), psi: ["0,6", "0,5", "0"] },
];
