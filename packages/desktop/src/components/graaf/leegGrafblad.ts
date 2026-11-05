import i18next from "i18next";
import { useProjectStore } from "../../store/projectStore";

/** Een leeg grafblad achteraan het project; het opent meteen. */
export function voegLeegGrafbladToe() {
  useProjectStore.getState().voegGraafToe(i18next.t("werkruimte:graaf.nieuweNaam"));
}
