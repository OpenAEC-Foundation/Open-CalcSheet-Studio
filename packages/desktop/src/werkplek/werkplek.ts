/**
 * De werkplek van de OpenAEC SuperCloud (docs/supercloud-werkplek.md).
 *
 * In de platformbouw (`npm run build:platform`) draait de app als statische
 * bundel in een frame met `sandbox="allow-scripts allow-modals"`: een opaque
 * origin, zonder netwerk buiten de bundel, zonder blijvende opslag in de
 * browser en zonder popups. Wat de app daar anders doet, gaat via dit bestand.
 *
 * `IN_WERKPLEK` is een vaste waarde van de bouw (vite.config.ts, `__WERKPLEK__`).
 * In de gewone bouw is hij `false` en valt de code voor de werkplek weg; in de
 * platformbouw valt de code voor de browser en de app weg.
 */
import i18next from "i18next";

export const IN_WERKPLEK: boolean = typeof __WERKPLEK__ === "boolean" && __WERKPLEK__;

/** De melding als iets in de werkplek niet kan; `wat` zegt wat. */
export function nietInWerkplek(wat: string): string {
  return i18next.t("werkruimte:werkplek.nietHier", { wat });
}

/**
 * Een adres buiten de app openen: in de app de systeembrowser, in de browser een
 * nieuw tabblad. In de werkplek kan dat niet (geen popups); dan een melding met
 * het adres, zodat de gebruiker het zelf kan openen.
 */
export async function openBuiten(url: string): Promise<void> {
  if (IN_WERKPLEK) {
    alert(i18next.t("werkruimte:werkplek.linkNaarBuiten", { url }));
  } else if ("__TAURI_INTERNALS__" in window) {
    const { openUrl } = await import("@tauri-apps/plugin-opener");
    await openUrl(url);
  } else {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

/**
 * Een popup kan niet in de werkplek (geen `allow-popups`); de browser zou hem
 * stil weigeren, met een fout in de console. Een bibliotheek die toch
 * `window.open` aanroept (een link in een spreadsheetcel), krijgt daarom de
 * melding met het adres. Alleen in de werkplek.
 */
export function zetPopupOmweg(): void {
  if (!IN_WERKPLEK) return;
  window.open = (url?: string | URL) => {
    if (url) alert(i18next.t("werkruimte:werkplek.linkNaarBuiten", { url: String(url) }));
    return null;
  };
}

/**
 * Kleine voorkeuren van deze browser (een paneel dicht, een vinkje): localStorage
 * buiten de werkplek. In de werkplek alleen in het geheugen, want het frame heeft
 * geen opslag; wat moet blijven, gaat via de instellingen (store.ts).
 */
const geheugen = new Map<string, string>();

export const browserVoorkeur = {
  lees(sleutel: string): string | null {
    if (IN_WERKPLEK) return geheugen.get(sleutel) ?? null;
    try {
      return localStorage.getItem(sleutel);
    } catch {
      return null;
    }
  },
  bewaar(sleutel: string, waarde: string): void {
    if (IN_WERKPLEK) {
      geheugen.set(sleutel, waarde);
      return;
    }
    try {
      localStorage.setItem(sleutel, waarde);
    } catch {
      // Geen opslag (privévenster): dan alleen deze sessie.
    }
  },
};

/**
 * Een frame met een opaque origin mag geen module-worker starten vanaf een
 * http-adres. Daarom wordt `new Worker(adres, { type: "module" })` daar een
 * klassieke worker vanaf een blob die het script met `import()` laadt. Het script
 * komt nog steeds uit de eigen bundel. Berichten die binnenkomen voordat het
 * script er is, houdt de worker vast. Alleen in de werkplek en alleen in een
 * opaque frame; staat er al zo'n vervanging van de host, dan gaat die erachter.
 */
export function zetWorkerOmweg(): void {
  if (!IN_WERKPLEK || typeof Worker === "undefined" || window.origin !== "null") return;
  const Echt = Worker;
  function Omweg(adres: string | URL, opties?: WorkerOptions): Worker {
    const url = new URL(String(adres), location.href);
    if (url.protocol === "blob:" || url.protocol === "data:" || opties?.type !== "module") return new Echt(adres, opties);
    const code =
      "var wacht = []; var vast = function (e) { wacht.push(e); };\n" +
      "self.addEventListener('message', vast);\n" +
      `import(${JSON.stringify(url.href)}).then(function () {\n` +
      "  self.removeEventListener('message', vast);\n" +
      "  wacht.forEach(function (e) { self.dispatchEvent(new MessageEvent('message', { data: e.data, ports: e.ports })); });\n" +
      "}, function (fout) { setTimeout(function () { throw fout; }); });";
    const blob = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
    return new Echt(blob, opties?.name ? { name: opties.name } : undefined);
  }
  Omweg.prototype = Echt.prototype;
  (window as unknown as { Worker: unknown }).Worker = Omweg;
}
