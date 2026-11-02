import { useTranslation } from "react-i18next";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import RibbonButtonStack from "./RibbonButtonStack";
import { b2 } from "./calcIcons";
import { useIfcInhoud, bewaarAls, kopieer } from "../../store/ifcInhoud";
import { useProjectStore } from "../../store/projectStore";

const exportIcon = b2("ifc.export", "standard");
const copyIcon = b2("edit.copy", "standard");

/**
 * Tab IFC: de werkruimte toont de IFC van het hele project (IfcViewerPanel); hier
 * exporteer of kopieer je die. Opslaan en openen van het project gaan via
 * Bestand.
 */
export default function IfcTab() {
  const { t } = useTranslation("ribbon");
  const { step, ifcx } = useIfcInhoud();
  const naam = useProjectStore((s) => s.projectNaam) || "model";

  return (
    <div className="ribbon-content">
      <div className="ribbon-groups">
        <RibbonGroup label={t("ifc.export")}>
          <RibbonButton icon={exportIcon} label={t("ifc.exportStep")} size="large" disabled={!step}
            onClick={() => bewaarAls(step, `${naam}.ifc`, "application/x-step")} />
          <RibbonButton icon={exportIcon} label={t("ifc.exportIfcx")} size="large" disabled={!ifcx}
            onClick={() => bewaarAls(ifcx, `${naam}.ifcx`, "application/json")} />
        </RibbonGroup>
        <RibbonGroup label={t("calc.clipboard")}>
          <RibbonButtonStack>
            <RibbonButton icon={copyIcon} label="STEP" size="small" title={t("werkruimte:ifc.kopieer")} disabled={!step}
              onClick={() => void kopieer(step)} />
            <RibbonButton icon={copyIcon} label="IFCX" size="small" title={t("werkruimte:ifc.kopieer")} disabled={!ifcx}
              onClick={() => void kopieer(ifcx)} />
          </RibbonButtonStack>
        </RibbonGroup>
      </div>
    </div>
  );
}
