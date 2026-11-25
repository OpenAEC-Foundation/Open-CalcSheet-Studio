/**
 * Het rapport als bewerkbaar document: DOCX of ODT (rapport/document/).
 *
 * De weg is die van de PDF: Bestand › Exporteren zet het rapport klaar
 * (`rapportNaarDocument` in de printstore), App.tsx laat de afdruk opbouwen en roept
 * daarna `maakRapportDocument` aan. Dat leest de afdruk uit, noemt wat niet mee kan
 * en laat de gebruiker dan nog afbreken, en schrijft het bestand: in de app via de
 * dialoog Opslaan, in de browser als download.
 *
 * Het document is een momentopname. Het project zelf verandert niet.
 */
import i18next from "../i18n/config";
import { usePrintStore, type DocumentFormaat } from "../store/printStore";
import { useProjectStore } from "../store/projectStore";
import { datumTekst } from "../rapport/revisies";
import { leesAfdruk, type NietMee } from "../rapport/document/uitAfdruk";
import { bouwDocx } from "../rapport/document/docx";
import { bouwOdt } from "../rapport/document/odt";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const MIME: Record<DocumentFormaat, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  odt: "application/vnd.oasis.opendocument.text",
};

/** Start de export; App.tsx bouwt eerst de afdruk op en roept dan `maakRapportDocument`. */
export function rapportAlsDocument(formaat: DocumentFormaat): void {
  usePrintStore.getState().rapportNaarDocument(formaat);
}

/** Een regel per onderdeel dat niet meegaat, in de taal van de app. */
function nietMeeRegel(n: NietMee): string {
  const t = i18next.getFixedT(null, "werkruimte");
  switch (n.soort) {
    case "pdf": return t("document.nietMee.pdf", { naam: n.naam, count: n.aantal });
    case "iframe": return t("document.nietMee.iframe", { naam: n.naam });
    case "js": return t("document.nietMee.js");
    case "ingebed": return t("document.nietMee.ingebed", { naam: n.naam });
    case "beeld": return t("document.nietMee.beeld", { count: n.aantal });
  }
}

/** Vraagt of de export door mag gaan zonder deze onderdelen. */
async function magZonder(nietMee: NietMee[]): Promise<boolean> {
  const lijst = nietMee.map((n) => `• ${nietMeeRegel(n)}`).join("\n");
  const vraag = i18next.t("werkruimte:document.nietMeeVraag", { lijst });
  if (isTauri()) {
    const { ask } = await import("@tauri-apps/plugin-dialog");
    return ask(vraag, {
      title: i18next.t("werkruimte:document.nietMeeTitel"),
      kind: "warning",
      okLabel: i18next.t("werkruimte:document.toch"),
      cancelLabel: i18next.t("werkruimte:document.afbreken"),
    });
  }
  return window.confirm(vraag);
}

/** De bestandsnaam: de naam van het project, zonder tekens die een pad niet mag hebben. */
function bestandsnaam(naam: string, formaat: DocumentFormaat): string {
  return `${(naam.trim() || "rapport").replace(/[\\/:*?"<>|]/g, "_")}.${formaat}`;
}

/** Schrijft het document weg: in de app via Opslaan (in de map van het project), anders als download. */
async function schrijf(bytes: Uint8Array, naam: string, formaat: DocumentFormaat, projectPad: string | null): Promise<void> {
  const bestand = bestandsnaam(naam, formaat);
  if (isTauri()) {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");
    const scheiding = projectPad?.match(/[\\/]/)?.[0];
    const map = projectPad && scheiding ? projectPad.slice(0, projectPad.lastIndexOf(scheiding)) : null;
    const gekozen = await save({
      title: i18next.t("werkruimte:document.opslaanTitel"),
      defaultPath: map ? `${map}${scheiding}${bestand}` : bestand,
      filters: [{ name: i18next.t(`werkruimte:document.filter.${formaat}`), extensions: [formaat] }],
    });
    if (!gekozen) return;
    const pad = gekozen.toLowerCase().endsWith(`.${formaat}`) ? gekozen : `${gekozen}.${formaat}`;
    try {
      await writeFile(pad, bytes);
    } catch (err) {
      const { message } = await import("@tauri-apps/plugin-dialog");
      await message(i18next.t("werkruimte:document.schrijvenMislukt", { pad, fout: String(err) }), { kind: "warning" });
    }
    return;
  }
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: MIME[formaat] }));
  const a = document.createElement("a");
  a.href = url;
  a.download = bestand;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/**
 * Maakt het document van de afdruk die nu klaarstaat (de meetopstelling van het
 * afdrukvoorbeeld). Geeft het aantal bytes, of `null` als de gebruiker afbrak.
 */
export async function maakRapportDocument(formaat: DocumentFormaat): Promise<number | null> {
  const wortel = document.querySelector<HTMLElement>(".av-meet .rpa-wortel");
  if (!wortel) throw new Error(i18next.t("werkruimte:fouten.geenVellen"));
  const { projectNaam, gegevens, rapport, bestandspad } = useProjectStore.getState();
  const taal = rapport.taal;
  const t = i18next.getFixedT(taal, "rapport");
  const project = gegevens.project_naam || projectNaam;
  const revisie = rapport.revisies[rapport.revisies.length - 1]?.code || t("documentExport.zonderRevisie");
  const nu = new Date();
  const tijd = nu.toLocaleTimeString(taal, { hour: "2-digit", minute: "2-digit" });
  const moment = `${datumTekst(nu)} ${tijd}`;
  const { document: doc, nietMee } = await leesAfdruk(wortel, {
    titel: project,
    taal,
    momentopname: t("documentExport.momentopname", { project, revisie, moment }),
    voettekst: t("documentExport.voet", { project, revisie, moment }),
    gemaakt: nu,
  }, t);
  if (nietMee.length > 0 && !(await magZonder(nietMee))) return null;
  const bytes = formaat === "docx" ? bouwDocx(doc) : bouwOdt(doc);
  await schrijf(bytes, project, formaat, bestandspad);
  return bytes.length;
}
