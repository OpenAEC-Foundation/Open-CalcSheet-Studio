import { useTranslation } from "react-i18next";
import { MCP_STATUSKLEUR, useMcpStatus } from "./status";

/**
 * "MCP: live" in de statusbalk, met een bolletje in de kleur van de toestand.
 * Pauze en alleen-lezen staan erachter, want die verklaren waarom een
 * assistent "niets doet". De tooltip noemt het adres van MCP en de REST-API.
 */
export default function McpStatusItem() {
  const { t } = useTranslation("common");
  const s = useMcpStatus();
  const sleutel: Record<typeof s.toestand, string> = {
    uit: "mcp.uit",
    start: "mcp.start",
    live: "mcp.live",
    "poort-bezet": "mcp.poortBezet",
    fout: "mcp.fout",
    "niet-beschikbaar": "mcp.nietBeschikbaar",
  };
  const extra = s.toestand === "live" ? [s.gepauzeerd && t("mcp.gepauzeerd"), s.alleenLezen && t("mcp.alleenLezen")].filter(Boolean) : [];
  const tooltip =
    s.toestand === "niet-beschikbaar"
      ? t("mcp.tooltipBrowser")
      : [t("mcp.tooltip", { adres: `http://127.0.0.1:${s.poort}` }), s.melding].filter(Boolean).join("\n");
  return (
    <div className="status-item" title={tooltip}>
      <span
        style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", background: MCP_STATUSKLEUR[s.toestand] }}
      />
      <span className="status-item-label">{t("mcp.label")}:</span>
      <span className="status-item-value">{[t(sleutel[s.toestand]), ...extra].join(" · ")}</span>
    </div>
  );
}
