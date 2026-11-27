/**
 * De kop en de voet van elke pagina als template, uit de huisstijl (BureauProfiel.kopTekst,
 * BureauProfiel.voetTekst). Drie delen, gescheiden door `|`: links, midden en rechts. In de
 * tekst vult de afdruk in:
 *
 *   {bureau}   de naam van het bureau
 *   {project}  het projectnummer en de projectnaam
 *   {blad}     het onderdeel of de naam van het blad
 *   {pagina}   het paginanummer, {paginas} het aantal pagina's
 *   {datum}    de datum van de afdruk
 *
 * Een leeg template: de kop en de voet zoals de app ze altijd maakte.
 *
 * Puur en zonder React: de controlescripts laden dit bestand.
 */

export interface KopVoetWaarden {
  bureau: string;
  project: string;
  blad: string;
  pagina: number;
  paginas: number;
  datum: string;
}

/** De drie delen van een template (links, midden, rechts), ingevuld; null als het template leeg is. */
export function vulKopVoet(template: string | undefined, w: KopVoetWaarden): [string, string, string] | null {
  if (!template?.trim()) return null;
  const vul = (s: string) =>
    s.replace(/\{(bureau|project|blad|pagina|paginas|datum)\}/g, (_m, k: keyof KopVoetWaarden) => String(w[k] ?? "")).trim();
  const [links = "", midden = "", rechts = ""] = template.split("|");
  return [vul(links), vul(midden), vul(rechts)];
}
