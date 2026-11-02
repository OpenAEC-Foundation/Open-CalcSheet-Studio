/**
 * De regels voor het venster van een `@js`-blok: de rechten, de CSP, de srcdoc en
 * wat er aan berichten uit het venster wordt aangenomen. Zonder imports en zonder
 * DOM, zodat scripts/check-js-blok.mjs dit bestand rechtstreeks in Node kan laden.
 *
 * Het bestand kan van iemand anders komen, dus het script krijgt niets:
 *   - `sandbox="allow-scripts"`, zonder `allow-same-origin`: een eigen, afgeschermde
 *     herkomst. Geen toegang tot de app, opslag, cookies of Tauri. Geen pop-ups,
 *     formulieren, modale vensters of navigatie van de app.
 *   - een CSP in de srcdoc: standaard geen netwerk. Alleen inline script en stijl,
 *     afbeeldingen uit data: en blob:. Een host komt erbij als het blok hem noemt,
 *     en die staat dan bij de bevestiging.
 *   - berichten uit het venster zijn gegevens: een afbeelding als data:image/png,
 *     een hoogte, een foutmelding als tekst. Nooit html.
 *
 * Wat in de html staat, is niet te vertrouwen: een tekstregel kan die nabootsen.
 * Daarom worden de hosts hier opnieuw getoetst, en komen de rechten van hier.
 */

/** De enige rechten die een script krijgt. */
export const JS_SANDBOX = "allow-scripts";

const HOST_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?::\d{1,5})?$/;

/** Mag deze host in de CSP? Een strikte naam: een `;` of spatie maakt anders een eigen regel. */
export function geldigeHost(host: string): boolean {
  return HOST_RE.test(host);
}

/** De CSP van het venster. `bibliotheek`: er komt een bibliotheek als blob-module. */
export function jsCsp(netwerk: readonly string[], bibliotheek: boolean): string {
  const hosts = netwerk.filter(geldigeHost).map((h) => ` https://${h}`).join("");
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline'${bibliotheek ? " blob:" : ""}${hosts}`,
    `style-src 'unsafe-inline'${hosts}`,
    `img-src data: blob:${hosts}`,
    `font-src data:${hosts}`,
    `media-src data: blob:${hosts}`,
    `connect-src ${hosts ? hosts.trim() : "'none'"}`,
    "worker-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join("; ");
}

/** De attributen van het iframe; `srcdoc` komt erbij. */
export function jsAttributen(titel: string): Record<string, string> {
  return {
    sandbox: JS_SANDBOX,
    referrerpolicy: "no-referrer",
    allow: "",
    title: titel,
  };
}

export interface JsStart {
  code: string;
  /** Rechtstreeks de tekst uit de uitwerking: JSON van de waarden van het blad. */
  waarden: unknown;
  netwerk: readonly string[];
  bibliotheken: readonly string[];
  opPapier: boolean;
}

/** JSON die veilig in een inline script staat: `</script` kan er niet in voorkomen. */
function jsonVoorScript(waarde: unknown): string {
  return JSON.stringify(waarde)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e");
}

function escapeAttribuut(tekst: string): string {
  return tekst.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * De hele pagina van het venster. De CSP staat vooraan, vóór elk script. De code
 * zit als JSON in het startscript en komt pas daarna als script in de pagina; zo kan
 * een `</script>` in een tekst van het blok de pagina niet doorbreken.
 */
export function jsSrcdoc(looptijd: string, start: JsStart): string {
  const netwerk = start.netwerk.filter(geldigeHost);
  const csp = jsCsp(netwerk, start.bibliotheken.length > 0);
  return "<!doctype html><html lang=\"nl\"><head><meta charset=\"utf-8\">"
    + `<meta http-equiv="Content-Security-Policy" content="${escapeAttribuut(csp)}">`
    + "<style>html,body{margin:0;height:100%}body{font:14px/1.45 'Segoe UI',system-ui,sans-serif;color:#1c1917;background:#fff;overflow:auto}</style>"
    + "</head><body>"
    + `<script>window.__calcStart=${jsonVoorScript({ ...start, netwerk })};</script>`
    + `<script>${looptijd.replace(/<\/script/gi, "<\\/script")}</script>`
    + "</body></html>";
}

/** Een afbeelding uit het venster: alleen een PNG als base64, en niet onbeperkt groot. */
const PNG_RE = /^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/;
const MAX_AFBEELDING = 40 * 1024 * 1024;

export function geldigePng(tekst: unknown): tekst is string {
  return typeof tekst === "string" && tekst.length <= MAX_AFBEELDING && PNG_RE.test(tekst);
}

/** Wat het venster mag zeggen. Alles wat hier niet in past, wordt genegeerd. */
export type JsBericht =
  | { soort: "geladen" | "luistert" | "pong" }
  | { soort: "klaar"; luistert: boolean }
  | { soort: "fout"; tekst: string }
  | { soort: "hoogte"; px: number }
  | { soort: "vraag-bibliotheek"; naam: "three" }
  | { soort: "afdruk"; id: number; dataUrl: string | null; mislukt: boolean; leeg: boolean };

/** Hoogte op het scherm in px: dezelfde grenzen als `hoogte=` (20 tot 230 mm). */
export const JS_MIN_PX = 76;
export const JS_MAX_PX = 870;

/** Leest een bericht uit het venster; null als het niet is wat is afgesproken. */
export function leesBericht(data: unknown): JsBericht | null {
  if (typeof data !== "object" || data === null) return null;
  const b = data as Record<string, unknown>;
  switch (b.soort) {
    case "geladen":
    case "luistert":
    case "pong":
      return { soort: b.soort };
    case "klaar":
      return { soort: "klaar", luistert: b.luistert === true };
    case "fout":
      return typeof b.tekst === "string" ? { soort: "fout", tekst: b.tekst.slice(0, 500) } : null;
    case "hoogte":
      if (typeof b.px !== "number" || !Number.isFinite(b.px)) return null;
      return { soort: "hoogte", px: Math.round(Math.min(JS_MAX_PX, Math.max(JS_MIN_PX, b.px))) };
    case "vraag-bibliotheek":
      return b.naam === "three" ? { soort: "vraag-bibliotheek", naam: "three" } : null;
    case "afdruk":
      if (typeof b.id !== "number") return null;
      if (b.dataUrl !== null && !geldigePng(b.dataUrl)) {
        return { soort: "afdruk", id: b.id, dataUrl: null, mislukt: true, leeg: b.leeg === true };
      }
      return { soort: "afdruk", id: b.id, dataUrl: b.dataUrl as string | null, mislukt: b.mislukt === true, leeg: b.leeg === true };
    default:
      return null;
  }
}
