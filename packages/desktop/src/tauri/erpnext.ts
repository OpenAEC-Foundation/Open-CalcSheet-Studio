/**
 * De ERPNext-koppeling aan de kant van de frontend (src-tauri/src/erpnext.rs).
 *
 * Het adres, de API-sleutel en de veldnaam staan in de instellingen onder `erpnext`. Het
 * API-geheim staat daar nooit: dat bewaart Rust in de sleutelbos van het
 * besturingssysteem, en het komt niet terug naar de frontend. De frontend kan alleen
 * vragen of er een geheim is.
 *
 * Het verzoek zelf gaat via Rust, vanwege CORS. In de browser (npm run dev) bestaan de
 * commando's niet: dan is er geen geheim, en weigert het verzoek.
 */
import { getSetting, setSetting } from "../store";

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

export async function bewaarErpnextInstellingen(w: ErpnextInstellingen): Promise<void> {
  await setSetting("erpnext", normaliseerErpnext(w));
}

/** Zijn adres en sleutel ingevuld? Het geheim vraag je apart met heeftErpnextGeheim. */
export function erpnextIngevuld(w: ErpnextInstellingen): boolean {
  return w.adres !== "" && w.sleutel !== "" && w.veld !== "";
}

/** Staat er een API-geheim in de sleutelbos? Buiten de desktop-app: nee. */
export async function heeftErpnextGeheim(): Promise<boolean> {
  if (!isTauri()) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("erpnext_heeft_geheim").catch(() => false);
}

/** Bewaart het API-geheim in de sleutelbos; een leeg geheim wist het. */
export async function zetErpnextGeheim(geheim: string): Promise<void> {
  if (!isTauri()) throw new Error("ERPNext: desktop app only");
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("erpnext_zet_geheim", { geheim });
}

/**
 * De tekst van het locatieveld van project `project` (de naam in ERPNext, dus het
 * projectnummer); "" als het veld leeg is. Een fout komt terug als tekst, met de
 * HTTP-status als die er is ("HTTP 404 …").
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
