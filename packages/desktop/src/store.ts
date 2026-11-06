import { load, type Store } from "@tauri-apps/plugin-store";

let _store: Store | null = null;

async function getStore(): Promise<Store> {
  if (!_store) {
    _store = await load("preferences.json", { autoSave: true, defaults: {} });
  }
  return _store;
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  try {
    const store = await getStore();
    const value = await store.get<T>(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
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
  const store = await getStore();
  await store.set(key, value);
  await store.save();
}
