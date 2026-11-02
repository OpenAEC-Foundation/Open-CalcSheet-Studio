import { useTranslation } from "react-i18next";
import { useProjectStore } from "../store/projectStore";
import { version } from "../../package.json";
import McpStatusItem from "../mcp/McpStatusItem";
import "./StatusBar.css";

export default function StatusBar() {
  const { t } = useTranslation();
  const aantalBladen = useProjectStore((s) => s.exemplaren.length);

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <div className="status-item">
          <span className="status-item-label">{t("ready")}</span>
        </div>
        <div className="status-separator" />
        <div className="status-item">
          <span className="status-item-label">{t("werkruimte:browser.bladen")}:</span>
          <span className="status-item-value">{aantalBladen}</span>
        </div>
      </div>

      <div className="status-bar-center">
        <span className="status-item-label" style={{ fontSize: "11px" }}>
          {t("appName")} v{version}
        </span>
      </div>

      <div className="status-bar-right">
        <McpStatusItem />
        <div className="status-separator" />
        <div className="status-item">
          <span className="status-item-label">{t("zoom")}:</span>
          <span className="status-item-value">100%</span>
        </div>
      </div>
    </div>
  );
}
