/**
 * De ERPNext-koppeling aan de kant van de frontend (src-tauri/src/erpnext.rs).
 *
 * Het adres, de API-sleutel en de veldnaam staan in de instellingen onder `erpnext`. Het
 * API-geheim staat daar nooit: dat bewaart Rust in de sleutelbos van het
 * besturingssysteem, en het komt niet terug naar de frontend. De frontend kan alleen
 * vragen of er een geheim is.
 *
 * Het geheim hoort bij de herkomst van het adres (schema, host en poort): bewaren en
 * vragen gaan dus altijd met het adres erbij. Na een ander adres is er geen geheim, tot
 * er een voor dat adres is bewaard.
 *
 * Het verzoek zelf gaat via Rust, vanwege CORS. In de browser (npm run dev) bestaan de
 * commando's niet: dan is er geen geheim, en weigert het verzoek.
 */
import { getSetting, setSetting, setSettingOfFout } from "../store";

/** Wat in de instellingen staat, onder de sleutel `erpnext`. */
export interface ErpnextInstellingen {
  /** Het adres van de installatie, bijv. https://erp.voorbeeld.nl */
  adres: string;
  /** De API-sleutel van de gebruiker (niet het geheim). */
  sleutel: string;
  /** Het eigen veld bij het Project met het adres of de coördinaten. */
  veld: string;
}

export const ERPNEXT_STANDAARDVELD = "custom_location";

export const ERPNEXT_STANDAARD: ErpnextInstellingen = {
  adres: "",
  sleutel: "",
  veld: ERPNEXT_STANDAARDVELD,
};

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Netjes gemaakt: zonder spaties eromheen, en zonder veldnaam de standaardnaam. */
export function normaliseerErpnext(w: Partial<ErpnextInstellingen> | null | undefined): ErpnextInstellingen {
  const tekst = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  return {
    adres: tekst(w?.adres).replace(/\/+$/, ""),
    sleutel: tekst(w?.sleutel),
    veld: tekst(w?.veld) || ERPNEXT_STANDAARDVELD,
  };
}

export async function leesErpnextInstellingen(): Promise<ErpnextInstellingen> {
  return normaliseerErpnext(await getSetting<Partial<ErpnextInstellingen>>("erpnext", ERPNEXT_STANDAARD));
}

/**
 * Bewaart de instellingen. In de desktop-app komt een fout terug, zodat de gebruiker hem
 * ziet; in de browser is er geen opslag en gaat het stil, zoals bij de andere instellingen.
 */
export async function bewaarErpnextInstellingen(w: ErpnextInstellingen): Promise<void> {
  if (isTauri()) await setSettingOfFout("erpnext", normaliseerErpnext(w));
  else await setSetting("erpnext", normaliseerErpnext(w));
}

/** Zijn adres, sleutel en veld ingevuld? Het geheim vraag je apart met heeftErpnextGeheim. */
export function erpnextIngevuld(w: ErpnextInstellingen): boolean {
  return w.adres !== "" && w.sleutel !== "" && w.veld !== "";
}

/**
 * Staat er een API-geheim in de sleutelbos voor de herkomst van `adres`? Een leeg of
 * ongeldig adres, of buiten de desktop-app: nee.
 */
export async function heeftErpnextGeheim(adres: string): Promise<boolean> {
  if (!isTauri() || adres.trim() === "") return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("erpnext_heeft_geheim", { adres: adres.trim() }).catch(() => false);
}

/**
 * Bewaart het API-geheim voor de herkomst van `adres` in de sleutelbos; een leeg geheim
 * wist het. Een ongeldig adres geeft een fout, en dan wordt er niets bewaard.
 */
export async function zetErpnextGeheim(adres: string, geheim: string): Promise<void> {
  if (!isTauri()) throw new Error("ERPNext: desktop app only");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("erpnext_zet_geheim", { adres: adres.trim(), geheim });
}

/**
 * De tekst van het locatieveld van project `project` (de naam in ERPNext, dus het
 * projectnummer); "" als het veld leeg is. Een fout komt terug als tekst, met de
 * HTTP-status als die er is ("HTTP 404 …"). Zonder geheim voor dit adres: de fout
 * "no API secret in the keychain", en er gaat geen verzoek uit.
 */
export async function erpnextProjectVeld(w: ErpnextInstellingen, project: string): Promise<string> {
  if (!isTauri()) throw new Error("ERPNext: desktop app only");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("erpnext_project_veld", {
    adres: w.adres,
    sleutel: w.sleutel,
    project,
    veld: w.veld,
  });
}
