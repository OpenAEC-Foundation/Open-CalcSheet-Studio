/**
 * De herkomst van het ERPNext-adres en wat Opslaan met het geheim doet. Zuivere functies,
 * zonder opslag, zodat scripts/check-situatie.mjs ze direct kan controleren.
 */
/**
 * De herkomst (schema, host, poort) van een adres, zoals Rust die voor de sleutelbos
 * gebruikt; null voor een leeg of ongeldig adres, of een adres dat niet https:// is
 * (http://localhost mag, om te testen).
 */
export function herkomstVan(adres: string): string | null {
  try {
    const u = new URL(adres.trim());
    if (u.username || u.password) return null;
    if (u.protocol === "https:" && u.hostname !== "") return u.origin;
    if (u.protocol === "http:" && u.hostname === "localhost") return u.origin;
    return null;
  } catch {
    return null;
  }
}

/** Is dit een adres waarvoor een geheim bewaard mag worden? Leeg telt als in orde (nog niets ingevuld). */
export function adresToegestaan(adres: string): boolean {
  return adres.trim() === "" || herkomstVan(adres) !== null;
}

/**
 * Wat Opslaan met het geheim doet. `oudAdres` is het bewaarde adres, `nieuwAdres` het adres
 * in het concept. Een andere herkomst (of een leeg/ongeldig nieuw adres) wist het geheim
 * van de oude herkomst; een nieuw getypt geheim wordt voor de nieuwe herkomst bewaard.
 * Alleen een ander pad laat alles staan. `wissen` wist het geheim van de herkomst zelf.
 */
export function geheimActies(
  oudAdres: string,
  nieuwAdres: string,
  getypt: string,
  wissen: boolean,
): { wisVoor?: string; bewaarVoor?: string } {
  const oud = herkomstVan(oudAdres);
  const nieuw = herkomstVan(nieuwAdres);
  const acties: { wisVoor?: string; bewaarVoor?: string } = {};
  if (oud !== null && oud !== nieuw) acties.wisVoor = oudAdres.trim();
  else if (wissen && nieuw !== null) acties.wisVoor = nieuwAdres.trim();
  if (nieuw !== null && getypt.trim() !== "") acties.bewaarVoor = nieuwAdres.trim();
  return acties;
}
