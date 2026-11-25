import { create } from "zustand";
import i18next from "../../i18n/config";
import { useProjectStore } from "../../store/projectStore";
import type { MarkdownBestand } from "../../store/markdownBlad";
import {
  controleerKoppeling, inhoudHash, isGekoppeld, metPlek, naamVan, Wachter,
  type BronKoppeling, type BronToegang, type KoppelingSoort, type VorigeControle,
} from "../../store/koppeling";
import { lijktOpRtf, rtfNaarMarkdown } from "../../store/rtfLezer";
import {
  bereikNaarMarkdown, bereikNamen, leesSjabloon, maakSjabloon, toetsSjabloon, werkbladen,
  type BereikLezer, type GelezenBereik, type SjabloonOnderdeel, type WerkmapSjabloon,
} from "../../store/werkmapBereik";
import { maakOmzetter, type OpenWerkmap } from "../../store/koppelingOmzetten";
import { useKoppelingStatus, type KoppelingStand } from "../../store/koppelingStatus";
import { lijktOpWerkmap } from "../../store/spreadsheetBlad";

/*
 * Gekoppelde bestanden in de app: een RTF-bestand of een werkmapbereik kiezen,
 * en de bron van elk gekoppeld blad bewaken. Wat een koppeling ís, staat in
 * store/koppeling.ts; de vensters en de melding in GekoppeldeBestanden.tsx.
 *
 * Bewaken
 * -------
 * Eén wachter (`wachter`) controleert alle gekoppelde bladen: bij het openen van
 * een project, bij focus van het venster, vóór het afdrukvoorbeeld en het
 * afdrukken, en elke twee seconden. Een controle kijkt eerst alleen naar de
 * wijzigingstijd (`stat`); pas als die anders is, leest hij het bestand. De
 * bestandswatcher van Tauri staat in deze versie van de app niet aan (die vraagt een
 * extra onderdeel in de Rust-kant); de wijzigingstijd per twee seconden doet
 * hetzelfde werk, alleen iets later.
 *
 * In de browser is er geen bestandstoegang: daar geldt alleen de bewaarde kopie, en
 * het blad zegt dat.
 */

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Om de hoeveel ms de wijzigingstijd van de bronnen wordt bekeken. */
export const WACHT_MS = 2000;

/** Het bestandssysteem via Tauri. */
const tauriToegang: BronToegang = {
  async wijzigingstijd(pad) {
    const { stat } = await import("@tauri-apps/plugin-fs");
    try {
      const info = await stat(pad);
      if (!info.isFile) return null;
      return info.mtime ? info.mtime.getTime() : info.size;
    } catch {
      return null;
    }
  },
  async lees(pad) {
    const { readFile } = await import("@tauri-apps/plugin-fs");
    return readFile(pad);
  },
};

// ── Werkmap openen ────────────────────────────────────────────────────────────

export async function openWerkmap(bytes: Uint8Array): Promise<OpenWerkmap> {
  const { initWasm, openWorkbook } = await import("@betteroffice/xlsx");
  await initWasm();
  const wb = openWorkbook(bytes);
  return {
    listDefinedNames: () => wb.listDefinedNames(),
    readCells: (verzoek) => wb.readCells(verzoek) as ReturnType<BereikLezer["readCells"]>,
    sluit: () => wb.dispose(),
  };
}

// ── Omzetten ──────────────────────────────────────────────────────────────────

/** Van de bytes van de bron naar de tekst van het blad (store/koppelingOmzetten.ts). */
export const omzetten = maakOmzetter(openWerkmap);

// ── Bewaken ───────────────────────────────────────────────────────────────────

/** Wat de vorige controle per blad zag; alleen in het geheugen. */
const gezien = new Map<string, VorigeControle>();

function gekoppeldeBladen() {
  return useProjectStore.getState().exemplaren.filter((e) => isGekoppeld(e.md));
}

async function controleerAlles(): Promise<void> {
  const bladen = gekoppeldeBladen();
  const status = useKoppelingStatus.getState();
  if (!isTauri()) {
    status.zetVeel(Object.fromEntries(bladen.map((b) => [b.id, { staat: "geenToegang" } as KoppelingStand])));
    return;
  }
  for (const blad of bladen) {
    const md = blad.md;
    if (!isGekoppeld(md)) continue;
    const projectPad = useProjectStore.getState().bestandspad;
    const uitkomst = await controleerKoppeling(md, { projectPad, toegang: tauriToegang, omzetten, vorige: gezien.get(blad.id) });
    // Het blad kan intussen weg of anders zijn; dan telt deze uitkomst niet.
    const nu = useProjectStore.getState().exemplaren.find((e) => e.id === blad.id);
    if (!nu || nu.md !== md) continue;
    const vorigeStand = useKoppelingStatus.getState().per[blad.id];
    switch (uitkomst.staat) {
      case "ongewijzigd":
        gezien.set(blad.id, uitkomst.gezien);
        if (uitkomst.koppeling) useProjectStore.getState().werkKoppelingBij(blad.id, { ...md, koppeling: uitkomst.koppeling }, false);
        status.zet(blad.id, { staat: "actueel", ...(vorigeStand?.meldingen ? { meldingen: vorigeStand.meldingen } : {}) });
        break;
      case "bijgewerkt":
        gezien.set(blad.id, uitkomst.gezien);
        useProjectStore.getState().werkKoppelingBij(blad.id, uitkomst.md, true);
        status.zet(blad.id, { staat: "actueel", ...(uitkomst.meldingen ? { meldingen: uitkomst.meldingen } : {}) });
        break;
      case "ontbreekt":
        gezien.delete(blad.id);
        status.zet(blad.id, { staat: "ontbreekt" });
        break;
      case "fout":
        gezien.set(blad.id, uitkomst.gezien);
        status.zet(blad.id, { staat: "fout", reden: uitkomst.reden, detail: uitkomst.detail });
        break;
    }
  }
}

/** De wachter van de app; GekoppeldeBestanden.tsx zet hem aan. */
export const wachter = new Wachter(controleerAlles);

/**
 * Vóór het afdrukken: elk gekoppeld blad meldt "lezen", zodat de afdruk wacht tot de
 * controle klaar is (`data-afdruk-laadt` in de melding op papier).
 */
export function controleerVoorAfdruk(): Promise<void> {
  if (!isTauri()) return wachter.nu();
  const status = useKoppelingStatus.getState();
  for (const b of gekoppeldeBladen()) {
    const was = status.per[b.id];
    if (was?.staat === "actueel" || was === undefined) status.zet(b.id, { ...(was ?? {}), staat: "lezen" });
  }
  // Ook bij een ongewijzigde wijzigingstijd opnieuw kijken: dat is goedkoop.
  return wachter.nu();
}

/** Vergeet wat de vorige controle zag, zodat de volgende het bestand opnieuw leest. */
export function leesOpnieuw(id: string): Promise<void> {
  gezien.delete(id);
  return wachter.nu();
}

// ── Kiezen ────────────────────────────────────────────────────────────────────

interface GekozenBron {
  /** Het absolute pad in de app; in de browser alleen de bestandsnaam. */
  pad: string;
  bytes: Uint8Array;
}

async function kiesBron(soort: KoppelingSoort): Promise<GekozenBron | null> {
  const t = i18next.getFixedT(null, "werkruimte");
  const extensies = soort === "rtf" ? ["rtf"] : ["xlsx"];
  const filter = soort === "rtf" ? t("koppeling.filterRtf") : t("spreadsheet.filter");
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const pad = await open({
      title: soort === "rtf" ? t("koppeling.kiesRtf") : t("koppeling.kiesWerkmap"),
      multiple: false,
      directory: false,
      filters: [{ name: filter, extensions: extensies }],
    });
    if (!pad || typeof pad !== "string") return null;
    return { pad, bytes: await readFile(pad) };
  }
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = extensies.map((e) => `.${e}`).join(",");
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      f.arrayBuffer().then((buf) => resolve({ pad: f.name, bytes: new Uint8Array(buf) })).catch(reject);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/** Een nieuwe koppeling voor een gekozen bron, met het pad relatief tot het project. */
function nieuweKoppeling(soort: KoppelingSoort, bron: GekozenBron, verwijzing?: string): BronKoppeling {
  const k: BronKoppeling = {
    soort,
    pad: bron.pad,
    gelezenOp: new Date().toISOString(),
    hash: inhoudHash(bron.bytes),
    ...(verwijzing ? { verwijzing } : {}),
  };
  return isTauri() ? metPlek(k, bron.pad, useProjectStore.getState().bestandspad) : k;
}

function meldFout(sleutel: string, err: unknown) {
  console.error("Gekoppeld bestand:", err);
  alert(i18next.t(`werkruimte:koppeling.${sleutel}`, { fout: (err as Error)?.message ?? String(err) }));
}

/** Kiest een RTF-bestand en zet het als gekoppeld blad achteraan het project. */
export async function voegRtfToe(): Promise<void> {
  const t = i18next.getFixedT(null, "werkruimte");
  try {
    const bron = await kiesBron("rtf");
    if (!bron) return;
    const naam = naamVan(bron.pad);
    if (!lijktOpRtf(bron.bytes)) {
      alert(t("koppeling.geenRtfBestand", { naam }));
      return;
    }
    const r = rtfNaarMarkdown(bron.bytes);
    const md: MarkdownBestand = { bestandsnaam: naam, tekst: r.tekst, koppeling: nieuweKoppeling("rtf", bron) };
    if (Object.keys(r.beelden).length > 0) md.beelden = r.beelden;
    const [id] = useProjectStore.getState().voegGekoppeldeToe([{ naam: naam.replace(/\.rtf$/i, "").trim() || "RTF", md }]);
    if (id) {
      useKoppelingStatus.getState().zet(id, { staat: isTauri() ? "actueel" : "geenToegang", ...(r.meldingen.length ? { meldingen: r.meldingen } : {}) });
      if (r.meldingen.length > 0) alert(t("koppeling.nietAlles", { lijst: meldingenTekst(r.meldingen) }));
    }
  } catch (err) {
    meldFout("lezenMislukt", err);
  }
}

/** De meldingen van een lezing als leesbare tekst. */
export function meldingenTekst(meldingen: readonly string[]): string {
  const t = i18next.getFixedT(null, "werkruimte");
  return meldingen.map((m) => (m.startsWith("beeld:") ? t("koppeling.beeldOvergeslagen", { formaat: m.slice(6).toUpperCase() }) : m)).join("; ");
}

// ── Werkmapbereik kiezen ──────────────────────────────────────────────────────

/** Een gekozen werkmap, open voor de vensters. */
export interface GekozenWerkmap {
  bron: GekozenBron;
  wb: OpenWerkmap;
  namen: string[];
  bladen: string[];
}

interface VensterState {
  /** Het venster voor één bereik. */
  bereik: GekozenWerkmap | null;
  /** Het venster voor een sjabloon, met per onderdeel wat de werkmap heeft. */
  sjabloon: { werkmap: GekozenWerkmap; onderdelen: { onderdeel: SjabloonOnderdeel; bereik: GelezenBereik }[] } | null;
  sluit: () => void;
}

export const useKoppelVenster = create<VensterState>((set, get) => ({
  bereik: null,
  sjabloon: null,
  sluit: () => {
    const { bereik, sjabloon } = get();
    bereik?.wb.sluit();
    sjabloon?.werkmap.wb.sluit();
    set({ bereik: null, sjabloon: null });
  },
}));

async function kiesWerkmapBron(): Promise<GekozenWerkmap | null> {
  const bron = await kiesBron("werkmapbereik");
  if (!bron) return null;
  if (!lijktOpWerkmap(bron.bytes)) {
    alert(i18next.t("werkruimte:spreadsheet.geenWerkmap", { naam: naamVan(bron.pad) }));
    return null;
  }
  const wb = await openWerkmap(bron.bytes);
  return { bron, wb, namen: bereikNamen(wb), bladen: werkbladen(wb) };
}

/** Kiest een werkmap en opent het venster om een bereik te kiezen. */
export async function kiesWerkmapBereik(): Promise<void> {
  try {
    const werkmap = await kiesWerkmapBron();
    if (!werkmap) return;
    useKoppelVenster.getState().sluit();
    useKoppelVenster.setState({ bereik: werkmap });
  } catch (err) {
    meldFout("lezenMislukt", err);
  }
}

/** Het blad voor een bereik uit een gekozen werkmap. */
export function bladVoorBereik(werkmap: GekozenWerkmap, verwijzing: string, bereik: Extract<GelezenBereik, { ok: true }>): MarkdownBestand {
  return {
    bestandsnaam: naamVan(werkmap.bron.pad),
    tekst: bereikNaarMarkdown(bereik),
    koppeling: nieuweKoppeling("werkmapbereik", werkmap.bron, verwijzing),
  };
}

/** Zet gekoppelde bladen in het project en meldt hun stand. */
export function voegBereikenToe(bladen: { naam: string; md: MarkdownBestand; plek?: number }[]): void {
  const ids = useProjectStore.getState().voegGekoppeldeToe(bladen);
  useKoppelingStatus.getState().zetVeel(Object.fromEntries(ids.map((id) => [id, { staat: isTauri() ? "actueel" : "geenToegang" } as KoppelingStand])));
}

// ── Sjabloon ──────────────────────────────────────────────────────────────────

/** Bewaart de werkmapbereiken van het project als sjabloon (JSON). */
export async function bewaarSjabloon(): Promise<void> {
  const t = i18next.getFixedT(null, "werkruimte");
  const { exemplaren, projectNaam } = useProjectStore.getState();
  const sjabloon = maakSjabloon(exemplaren);
  if (sjabloon.onderdelen.length === 0) {
    alert(t("koppeling.sjabloonLeeg"));
    return;
  }
  const naam = `${projectNaam.replace(/[\\/:*?"<>|]+/g, "-").trim() || "werkmap"}.werkmapsjabloon.json`;
  const bytes = new TextEncoder().encode(`${JSON.stringify(sjabloon, null, 2)}\n`);
  try {
    if (isTauri()) {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeFile } = await import("@tauri-apps/plugin-fs");
      const pad = await save({ defaultPath: naam, filters: [{ name: t("koppeling.filterSjabloon"), extensions: ["json"] }] });
      if (pad) await writeFile(pad, bytes);
      return;
    }
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = naam;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (err) {
    meldFout("schrijvenMislukt", err);
  }
}

async function kiesSjabloon(): Promise<WerkmapSjabloon | null> {
  const t = i18next.getFixedT(null, "werkruimte");
  let tekst: string | null = null;
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readTextFile } = await import("@tauri-apps/plugin-fs");
    const pad = await open({ title: t("koppeling.kiesSjabloon"), multiple: false, directory: false, filters: [{ name: t("koppeling.filterSjabloon"), extensions: ["json"] }] });
    if (!pad || typeof pad !== "string") return null;
    tekst = await readTextFile(pad);
  } else {
    tekst = await new Promise<string | null>((resolve, reject) => {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".json,application/json";
      input.onchange = () => {
        const f = input.files?.[0];
        if (!f) return resolve(null);
        f.text().then(resolve).catch(reject);
      };
      input.oncancel = () => resolve(null);
      input.click();
    });
  }
  if (tekst === null) return null;
  let sjabloon: WerkmapSjabloon | null = null;
  try {
    sjabloon = leesSjabloon(JSON.parse(tekst));
  } catch {
    sjabloon = null;
  }
  if (!sjabloon) alert(t("koppeling.geenSjabloon"));
  return sjabloon;
}

/** Kiest een sjabloon en een werkmap, en opent het venster met de onderdelen. */
export async function pasSjabloonToe(): Promise<void> {
  try {
    const sjabloon = await kiesSjabloon();
    if (!sjabloon) return;
    const werkmap = await kiesWerkmapBron();
    if (!werkmap) return;
    useKoppelVenster.getState().sluit();
    useKoppelVenster.setState({ sjabloon: { werkmap, onderdelen: toetsSjabloon(werkmap.wb, sjabloon) } });
  } catch (err) {
    meldFout("lezenMislukt", err);
  }
}
