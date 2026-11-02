/**
 * De regels voor een iframe uit een rekenblad: wat er mag laden en met welke
 * rechten. Zonder imports en zonder DOM, zodat scripts/check-iframe.mjs dit
 * bestand rechtstreeks in Node kan laden.
 *
 * De kern toetst het adres ook (packages/core/src/iframeBlok.ts). Hier staat de
 * tweede toets met opzet los daarvan: wat hier binnenkomt, is gelezen uit de
 * html van de uitwerking, en een tekstregel in een blad kan daar van alles in
 * zetten. De rechten komen dus nooit uit die html; alleen `scripts` ja of nee.
 */

/**
 * Het enige recht dat een blad kan vragen, met `scripts` in de regel. Zonder
 * `allow-same-origin` draait zo'n pagina in een eigen, afgeschermde herkomst:
 * ze kan niet bij de app, niet bij haar eigen cookies en niet bij opslag.
 */
export const IFRAME_RECHTEN: readonly string[] = ["allow-scripts"];

/** Het adres als het mag laden (http of https, zonder inlognaam), anders null. */
export function magLaden(adres: string): string | null {
  let u: URL;
  try {
    u = new URL(adres.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  return u.href;
}

/** Waarvoor een bevestiging geldt: schema, host en poort. */
export function herkomstVan(adres: string): string {
  return new URL(adres).origin;
}

/**
 * De attributen van het iframe:
 *   sandbox          leeg: geen scripts, formulieren, pop-ups of navigatie van
 *                    de app; met `scripts` alleen allow-scripts
 *   referrerpolicy   de pagina ziet niet waar ze vandaan geladen wordt
 *   allow            leeg: geen camera, microfoon, locatie en dergelijke
 *   credentialless   geen cookies of andere gegevens van de gebruiker mee
 */
export function iframeAttributen(url: string, scripts: boolean, titel: string): Record<string, string> {
  return {
    src: url,
    sandbox: scripts ? IFRAME_RECHTEN.join(" ") : "",
    referrerpolicy: "no-referrer",
    allow: "",
    credentialless: "",
    title: titel,
  };
}
