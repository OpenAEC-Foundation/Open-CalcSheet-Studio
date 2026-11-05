/**
 * Frontend wrappers around the openaec-core Rust PDF engine Tauri commands:
 *   - `engine_save_pdf`    → user-chosen path via save dialog
 *   - `engine_preview_pdf` → temp file path for in-app iframe preview
 *
 * Both go through `documentToReport()` to convert the evaluated document
 * into the openaec-core ReportData schema first.
 */

import i18next from "i18next";
import { documentToReport, type ReportData } from "../lib/documentToReport";
import type { EvaluatedNode } from "@ifc-calc/core";

function isTauriEnv(): boolean {
  try {
    // @ts-expect-error — runtime probe of Tauri internals
    return typeof window !== "undefined" && !!window.__TAURI_INTERNALS__;
  } catch {
    return false;
  }
}

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "_");
}

/**
 * Open a save dialog and write the generated PDF to the chosen location.
 * Returns the saved path, or `null` if the user cancelled.
 */
export async function savePdfReport(
  nodesOfReport: EvaluatedNode[] | ReportData,
  projectName: string,
): Promise<string | null> {
  if (!isTauriEnv()) {
    alert(i18next.t("werkruimte:pdfRapport.alleenApp"));
    return null;
  }

  // Een kant-en-klaar rapport (het hele project) mag er ook in; dan slaan we
  // de omzetting van één blad over.
  const report = Array.isArray(nodesOfReport)
    ? documentToReport(nodesOfReport, projectName)
    : nodesOfReport;
  const { save } = await import("@tauri-apps/plugin-dialog");
  const { invoke } = await import("@tauri-apps/api/core");

  const defaultName = `${sanitizeFileName(projectName)}.pdf`;
  const path = await save({
    title: i18next.t("werkruimte:pdfRapport.opslaanTitel"),
    defaultPath: defaultName,
    filters: [{ name: i18next.t("werkruimte:pdfRapport.filter"), extensions: ["pdf"] }],
  });
  if (!path) return null;

  const bytes = await invoke<number>("engine_save_pdf", { report, path });
  console.log(`PDF rapport opgeslagen (${bytes} bytes) → ${path}`);
  return path;
}

/**
 * Generate the PDF into the OS temp dir and return the absolute path.
 * Caller is expected to wrap the path with `convertFileSrc()` and load it
 * into an <iframe> for in-app preview.
 *
 * Throws when running outside Tauri so the caller can show a fallback UI.
 */
export async function previewPdfReport(
  nodes: EvaluatedNode[],
  projectName: string,
): Promise<string> {
  if (!isTauriEnv()) {
    throw new Error(i18next.t("werkruimte:pdfRapport.alleenApp"));
  }
  const report = documentToReport(nodes, projectName);
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<string>("engine_preview_pdf", { report });
}
