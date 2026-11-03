import { useSyncExternalStore } from "react";
import i18next from "../../i18n/config";
import { grootteTekst, PDF_GROOT_BYTES } from "../../store/pdfBijlage";
import { bladnaamVoorMarkdown, tekstUitBytes, type MarkdownBestand } from "../../store/markdownBlad";
import { bytesNaarBase64 } from "./pdfBlad";
import { verzamelBeelden } from "./markdownRegels";

/*
 * Markdown-bladen in de app: een bestand kiezen en wegschrijven.
 *
 * Wat een Markdown-blad ís en hoe het in het projectbestand staat, staat in
 * store/markdownBlad.ts; de weergave in MarkdownBladWeergave.tsx.
 */

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

interface GekozenBestand {
  bestandsnaam: string;
  bytes: Uint8Array;
  /** Leest een bestand naast het gekozen bestand; alleen in de app. */
  naast?: (pad: string) => Promise<Uint8Array>;
}

async function kiesBestand(): Promise<GekozenBestand | null> {
  const t = i18next.getFixedT(null, "werkruimte");
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const { readFile } = await import("@tauri-apps/plugin-fs");
    const pad = await open({
      title: t("markdown.kiesTitel"),
      multiple: false,
      directory: false,
      filters: [{ name: t("markdown.filter"), extensions: ["md", "markdown"] }],
    });
    if (!pad || typeof pad !== "string") return null;
    const map = pad.slice(0, Math.max(pad.lastIndexOf("/"), pad.lastIndexOf("\\")) + 1);
    return {
      bestandsnaam: pad.split(/[\\/]/).pop() ?? pad,
      bytes: await readFile(pad),
      naast: (naam) => readFile(`${map}${naam}`),
    };
  }

  // In de browser is alleen het gekozen bestand te lezen; zijn afbeeldingen niet.
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,text/markdown";
    input.onchange = () => {
      const f = input.files?.[0];
      if (!f) return resolve(null);
      f.arrayBuffer()
        .then((buf) => resolve({ bestandsnaam: f.name, bytes: new Uint8Array(buf) }))
        .catch(reject);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * Kiest een Markdown-bestand, met de controles: is het tekst, en is het niet zo
 * groot dat het projectbestand onhandelbaar wordt. Afbeeldingen naast het bestand
 * gaan mee het project in. Null bij annuleren of afwijzen; een leesfout gaat door
 * naar de aanroeper.
 */
export async function kiesMarkdown(): Promise<MarkdownBestand | null> {
  const t = i18next.getFixedT(null, "werkruimte");
  const gekozen = await kiesBestand();
  if (!gekozen) return null;
  const naam = gekozen.bestandsnaam;
  const tekst = tekstUitBytes(gekozen.bytes);
  if (tekst === null) {
    alert(t("markdown.geenTekst", { naam }));
    return null;
  }
  if (gekozen.bytes.length > PDF_GROOT_BYTES) {
    const grootte = grootteTekst(gekozen.bytes.length, i18next.language);
    if (!confirm(t("markdown.groot", { naam, grootte }))) return null;
  }
  const beelden = gekozen.naast ? await verzamelBeelden(tekst, gekozen.naast, bytesNaarBase64) : undefined;
  return { bestandsnaam: naam, tekst, ...(beelden ? { beelden } : {}) };
}

/** Een nieuw blad met een lege tekst, achteraan het project. */
export function voegLeegMarkdownToe(voegToe: (naam: string, md: MarkdownBestand) => string): string {
  return voegToe(i18next.t("werkruimte:markdown.nieuweNaam"), { bestandsnaam: "", tekst: "" });
}

/** Kiest een Markdown-bestand en zet het als nieuw blad achteraan het project. */
export async function voegMarkdownBestandToe(voegToe: (naam: string, md: MarkdownBestand) => string): Promise<void> {
  try {
    const md = await kiesMarkdown();
    if (md) voegToe(bladnaamVoorMarkdown(md.bestandsnaam), md);
  } catch (err) {
    console.error("Markdown toevoegen mislukt:", err);
    alert(i18next.t("werkruimte:markdown.lezenMislukt", { fout: (err as Error)?.message ?? String(err) }));
  }
}

/**
 * Schrijft de tekst weg als los bestand, om elders verder te bewerken. Alleen de
 * tekst, ongewijzigd: de afbeeldingen die mee het project in gingen, blijven daar
 * en staan nog waar ze stonden.
 */
export async function exporteerMarkdown(naam: string, md: MarkdownBestand): Promise<void> {
  const bestand = md.bestandsnaam || `${naam.replace(/[\\/:*?"<>|]+/g, "-").trim() || "Markdown"}.md`;
  const bytes = new TextEncoder().encode(md.tekst);
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const pad = await save({
      defaultPath: bestand,
      filters: [{ name: i18next.t("werkruimte:markdown.filter"), extensions: ["md", "markdown"] }],
    });
    if (pad) await writeFile(pad, bytes);
    return;
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: "text/markdown" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = bestand;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ── Afbeeldingen op papier ────────────────────────────────────────────────────

let versie = 0;
const luisteraars = new Set<() => void>();

/** Een afbeelding op papier is geladen: het afdrukvoorbeeld verdeelt dan opnieuw. */
export function meldBeeldGeladen() {
  versie += 1;
  for (const l of luisteraars) l();
}

/** Verandert bij elke geladen afbeelding; voor het opnieuw verdelen van het afdrukvoorbeeld. */
export function useMarkdownVersie(): number {
  return useSyncExternalStore(
    (l) => {
      luisteraars.add(l);
      return () => {
        luisteraars.delete(l);
      };
    },
    () => versie,
  );
}
