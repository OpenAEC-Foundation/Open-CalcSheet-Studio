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
 *   - geen WebRTC. Dat gaat buiten elke CSP om, naar elke host, en elk nieuw frame heeft het
 *     opnieuw. Daarom haalt een opstartscript van de app het weg uit elk document, vóór elk
 *     ander script (src-tauri/src/geen_webrtc.js). Heeft dat hier niet gedraaid, dan start de
 *     code niet (jsLooptijd.js). Gemeten in het echte venster: scripts/proef-js-webrtc.mjs.
 *   - twee vensters in elkaar. Een CSP houdt het wegnavigeren van een venster zelf niet
 *     tegen, de `frame-src` van zijn ouder wel. Daarom draait het script in een binnenste
 *     venster, met het buitenste als ouder: `location.href`, een `<meta refresh>` of een
 *     link naar buiten gaat niet door, ook niet naar een host uit `netwerk=`. Een srcdoc
 *     valt zelf niet onder `frame-src`. Het buitenste venster geeft alleen berichten
 *     door, en het binnenste kan het niet navigeren: dat verbiedt de sandbox.
 *   - geen inline script meer zodra de omgeving staat (jsLooptijd.js): de code zelf komt
 *     als blob. Een frame dat het script zelf maakt, erft die regel en een blob van een
 *     ander frame kan het niet lezen, dus daar draait niets. Behalve met `netwerk=`: dan mag
 *     zo'n frame script van die host laden, want daar geldt dezelfde CSP. De bevestiging noemt
 *     die host, en verder dan die host komt het script daarmee niet.
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

/**
 * De CSP van beide vensters. De binnenste srcdoc erft die van de buitenste en dan gelden
 * ze allebei; daarom is het dezelfde. `blob:` is voor de code en de bibliotheek.
 */
export function jsCsp(netwerk: readonly string[]): string {
  const hosts = netwerk.filter(geldigeHost).map((h) => ` https://${h}`).join("");
  return [
    "default-src 'none'",
    `script-src 'unsafe-inline' blob:${hosts}`,
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

/** De attributen van beide iframes; `srcdoc` komt erbij. */
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
  /** Niet starten als WebRTC er nog is. Staat aan, tenzij een ontwikkelversie het uitzet (jsBlok.ts). */
  webrtcToets?: boolean;
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

/** Het begin van beide pagina's. De CSP staat vooraan, vóór elk script. */
function jsKop(csp: string, stijl: string): string {
  return "<!doctype html><html lang=\"nl\"><head><meta charset=\"utf-8\">"
    + `<meta http-equiv="Content-Security-Policy" content="${escapeAttribuut(csp)}">`
    + `<style>${stijl}</style></head><body>`;
}

/**
 * De pagina waarin het script draait. De code zit als JSON in het startscript en komt
 * pas daarna als script in de pagina; zo kan een `</script>` in een tekst van het blok
 * de pagina niet doorbreken.
 */
export function jsBinnenSrcdoc(looptijd: string, start: JsStart): string {
  const netwerk = start.netwerk.filter(geldigeHost);
  return jsKop(
    jsCsp(netwerk),
    "html,body{margin:0;height:100%}body{font:14px/1.45 'Segoe UI',system-ui,sans-serif;color:#1c1917;background:#fff;overflow:auto}",
  )
    + `<script>window.__calcStart=${jsonVoorScript({ ...start, netwerk })};</script>`
    + `<script>${looptijd.replace(/<\/script/gi, "<\\/script")}</script>`
    + "</body></html>";
}

/** Wat het buitenste venster doorgeeft. De app leest het daarna zelf na (`leesBericht`). */
export const JS_NAAR_APP = ["geladen", "klaar", "luistert", "pong", "fout", "hoogte", "vraag-bibliotheek", "afdruk"];
export const JS_NAAR_SCRIPT = ["ping", "waarden", "afdruk", "bibliotheek"];

/**
 * Het script van het buitenste venster: berichten doorgeven, tussen het binnenste venster
 * en de app, en van niemand anders. Laadt het binnenste venster een tweede keer, dan is
 * de pagina van het script weg (geblokkeerd of niet): dat meldt het, en het venster gaat weg.
 */
const BUITEN_SCRIPT = `(function () {
  var naarApp = ${JSON.stringify(JS_NAAR_APP)};
  var naarScript = ${JSON.stringify(JS_NAAR_SCRIPT)};
  var app = window.parent;
  var keer = 0;
  function binnen() { return document.querySelector("iframe"); }
  window.addEventListener("message", function (e) {
    var f = binnen();
    var b = e.data;
    if (!f || !b || typeof b !== "object") return;
    if (e.source === f.contentWindow) {
      if (naarApp.indexOf(b.soort) >= 0) app.postMessage(b, "*");
    } else if (e.source === app) {
      if (naarScript.indexOf(b.soort) >= 0) f.contentWindow.postMessage(b, "*");
    }
  });
  document.addEventListener("load", function (e) {
    if (e.target !== binnen() || ++keer < 2) return;
    app.postMessage({ soort: "weg" }, "*");
    e.target.remove();
  }, true);
})();`;

/**
 * De hele pagina van het venster: het buitenste venster, met het binnenste erin. Dat staat
 * als attribuut in de pagina, dus de code en de waarden zijn daar alleen tekst.
 */
export function jsSrcdoc(looptijd: string, start: JsStart, titel = ""): string {
  const netwerk = start.netwerk.filter(geldigeHost);
  const rechten = Object.entries(jsAttributen(titel)).map(([naam, waarde]) => ` ${naam}="${escapeAttribuut(waarde)}"`).join("");
  return jsKop(
    jsCsp(netwerk),
    "html,body,iframe{display:block;margin:0;border:0;width:100%;height:100%;overflow:hidden}",
  )
    + `<script>${BUITEN_SCRIPT}</script>`
    + `<iframe${rechten} srcdoc="${escapeAttribuut(jsBinnenSrcdoc(looptijd, start))}"></iframe>`
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
  | { soort: "geladen" | "luistert" | "pong" | "weg" }
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
    case "weg":
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
