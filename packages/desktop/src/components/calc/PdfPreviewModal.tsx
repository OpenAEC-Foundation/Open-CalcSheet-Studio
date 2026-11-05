import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../Modal";
import "./PdfPreviewModal.css";

interface PdfPreviewModalProps {
  open: boolean;
  onClose: () => void;
  /** Project name; used both for the modal title and as default file name on save. */
  projectName: string;
  /** Async generator that returns the absolute temp file path to a freshly rendered PDF. */
  generate: () => Promise<string>;
  /** Async save handler — opens a save dialog and writes the PDF to user-chosen location. */
  onSave?: () => Promise<string | null>;
}

export default function PdfPreviewModal({
  open,
  onClose,
  projectName,
  generate,
  onSave,
}: PdfPreviewModalProps) {
  const { t } = useTranslation("werkruimte");
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setSrc(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setError(null);
    (async () => {
      try {
        const path = await generate();
        if (cancelled) return;
        // Convert the absolute filesystem path to a URL the webview can load.
        const { convertFileSrc } = await import("@tauri-apps/api/core");
        const url = convertFileSrc(path);
        // Cache-buster — temp file name already changes per render but be safe.
        setSrc(`${url}?t=${Date.now()}`);
      } catch (err) {
        if (!cancelled) setError((err as Error).message ?? String(err));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, generate]);

  const handleSaveClick = async () => {
    if (!onSave || saving) return;
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("pdfVoorbeeld.titel", { naam: projectName })} width={920}>
      <div className="pdf-preview-modal-body">
        {busy && (
          <div className="pdf-preview-state">
            <p>{t("pdfVoorbeeld.bezig")}</p>
            <small>{t("pdfVoorbeeld.bezigUitleg")}</small>
          </div>
        )}
        {error && (
          <div className="pdf-preview-state pdf-preview-error">
            <p>{t("pdfVoorbeeld.mislukt")}</p>
            <pre>{error}</pre>
          </div>
        )}
        {src && !busy && (
          <iframe
            className="pdf-preview-frame"
            src={src}
            title={t("pdfVoorbeeld.kader", { naam: projectName })}
          />
        )}
      </div>

      <div className="pdf-preview-modal-footer">
        <button className="pdf-preview-btn pdf-preview-btn-ghost" type="button" onClick={onClose}>
          {t("pdfVoorbeeld.sluiten")}
        </button>
        {onSave && (
          <button
            className="pdf-preview-btn pdf-preview-btn-primary"
            type="button"
            onClick={handleSaveClick}
            disabled={saving || !src}
          >
            {saving ? t("pdfVoorbeeld.opslaan") : t("pdfVoorbeeld.opslaanAls")}
          </button>
        )}
      </div>
    </Modal>
  );
}
