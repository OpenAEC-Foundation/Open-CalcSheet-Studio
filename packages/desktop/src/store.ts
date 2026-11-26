import { load, type Store } from "@tauri-apps/plugin-store";
import { IN_WERKPLEK } from "./werkplek/werkplek";

let _store: Store | null = null;

async function getStore(): Promise<Store> {
  if (!_store) {
    _store = await load("preferences.json", { autoSave: true, defaults: {} });
  }
  return _store;
}

// ── De werkplek van de SuperCloud ──────────────────────────────────────────
// Het frame heeft geen opslag. De instellingen gaan daar naar de host
// (`window.openaecHost.settings`, contract in docs/supercloud-werkplek.md), met
// een kopie in het geheugen zodat een tweede keer lezen niet opnieuw vraagt.
// Zonder host blijven ze alleen in het geheugen.

interface HostInstellingen {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<unknown>;
}

const werkplekKopie = new Map<string, unknown>();

/**
 * Wat niet naar de host gaat, alleen in het geheugen: het open project (dat staat in
 * Docs), de recente bestanden (die mag een volgende pagina niet zomaar openen) en de
 * sleutel van de MCP-brug (die draait alleen in de desktop-app).
 */
const ALLEEN_GEHEUGEN = new Set(["projectState", "recentFiles", "mcpToken"]);

function hostInstellingen(): HostInstellingen | null {
  const s = (window as { openaecHost?: { settings?: HostInstellingen } }).openaecHost?.settings;
  return s && typeof s.get === "function" && typeof s.set === "function" ? s : null;
}

/** Een waarde van de host: soms als JSON-tekst, soms al gelezen. */
function leesHostWaarde(waarde: unknown): unknown {
  if (typeof waarde !== "string") return waarde;
  try {
    return JSON.parse(waarde);
  } catch {
    return waarde;
  }
}

async function werkplekLees<T>(key: string, fallback: T): Promise<T> {
  if (werkplekKopie.has(key)) return (werkplekKopie.get(key) as T | null) ?? fallback;
  const host = ALLEEN_GEHEUGEN.has(key) ? null : hostInstellingen();
  if (!host) return fallback;
  try {
    const waarde = leesHostWaarde(await host.get(key)) as T | null | undefined;
    werkplekKopie.set(key, waarde ?? null);
    return waarde ?? fallback;
  } catch {
    return fallback;
  }
}

async function werkplekBewaar<T>(key: string, value: T): Promise<void> {
  werkplekKopie.set(key, value);
  if (!ALLEEN_GEHEUGEN.has(key)) await hostInstellingen()?.set(key, value);
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  if (IN_WERKPLEK) return werkplekLees(key, fallback);
  try {
    const store = await getStore();
    const value = await store.get<T>(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  if (IN_WERKPLEK) {
    await werkplekBewaar(key, value).catch(() => {
      // Alleen in het geheugen: de host antwoordde niet.
    });
    return;
  }
  try {
    const store = await getStore();
    await store.set(key, value);
  } catch {
    // silently fail if store unavailable
  }
}

/**
 * Als setSetting, maar een fout komt terug in plaats van stil te verdwijnen, en de
 * waarde staat daarna op schijf (niet pas bij het automatisch bewaren). Voor instellingen
 * waarvan de gebruiker moet weten dat ze niet bewaard zijn.
 */
export async function setSettingOfFout<T>(key: string, value: T): Promise<void> {
  if (IN_WERKPLEK) return werkplekBewaar(key, value);
  const store = await getStore();
  await store.set(key, value);
  await store.save();
}
