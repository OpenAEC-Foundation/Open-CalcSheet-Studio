import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLoadCaseStore } from "../../store/loadCaseStore";
import "./LoadCaseTabs.css";

/**
 * Bottom tab strip for `belastingsgeval` (load case) selection. Each tab holds
 * its own set of prompt values; switching the active tab re-runs the preview
 * against those values.
 */
export default function LoadCaseTabs() {
  const { t } = useTranslation("werkruimte");
  const cases = useLoadCaseStore((s) => s.cases);
  const activeId = useLoadCaseStore((s) => s.activeId);
  const switchTo = useLoadCaseStore((s) => s.switchTo);
  const addCase = useLoadCaseStore((s) => s.addCase);
  const removeCase = useLoadCaseStore((s) => s.removeCase);
  const renameCase = useLoadCaseStore((s) => s.renameCase);

  const [editingId, setEditingId] = useState<string | null>(null);

  const handleDoubleClick = (id: string) => setEditingId(id);
  const handleRenameBlur = (id: string, newLabel: string) => {
    const trimmed = newLabel.trim();
    if (trimmed) renameCase(id, trimmed);
    setEditingId(null);
  };

  return (
    <div className="load-case-tabs" role="tablist" aria-label={t("belastingsgevallen.titel")}>
      <div className="load-case-label">{t("belastingsgevallen.titel")}</div>
      <div className="load-case-strip">
        {cases.map((c) => {
          const isActive = c.id === activeId;
          const isEditing = c.id === editingId;
          return (
            <div
              key={c.id}
              role="tab"
              aria-selected={isActive}
              className={`load-case-tab${isActive ? " active" : ""}`}
              onClick={() => switchTo(c.id)}
              onDoubleClick={() => handleDoubleClick(c.id)}
            >
              {isEditing ? (
                <input
                  className="load-case-input"
                  autoFocus
                  defaultValue={c.label}
                  onBlur={(e) => handleRenameBlur(c.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="load-case-label-text">{c.label}</span>
              )}
              {cases.length > 1 && !isEditing && (
                <button
                  className="load-case-close"
                  title={t("belastingsgevallen.verwijderTitel", { naam: c.label })}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(t("belastingsgevallen.verwijderVraag", { naam: c.label }))) removeCase(c.id);
                  }}
                >
                  ×
                </button>
              )}
            </div>
          );
        })}
        <button
          className="load-case-add"
          title={t("belastingsgevallen.nieuw")}
          onClick={() => addCase()}
        >
          {t("belastingsgevallen.nieuwKnop")}
        </button>
      </div>
    </div>
  );
}
