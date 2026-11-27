import { useTranslation } from "react-i18next";
import Modal from "../Modal";
import BelastingCanvas from "../rapport/paneel/BelastingCanvas";
import { useHoofdstukMaken } from "../../store/hoofdstukMaken";
import "../rapport/RapportPanel.css";

/**
 * 5.5 Blijvende belastingen als object op het canvasblad van H5: een klik op dat blok
 * opent dit venster met de opbouwen (BelastingCanvas: vloeren, daken, wanden, gevels, uit
 * de gewichtenbibliotheek). Ze staan bij de belastinguitgangspunten van het project
 * (rapport.belastingen), en gaan zo ook als `ocss::belasting` mee in de IFCX. Bij Klaar
 * tekent en rekent het blad opnieuw (RapportAlsBladen.tsx), met dezelfde plekken.
 */
export default function BlijvendVenster({ bladId, onSluit }: { bladId: string; onSluit: () => void }) {
  const { t } = useTranslation("rapport");
  const klaar = () => {
    useHoofdstukMaken.getState().maak(["belastingen"], bladId);
    onSluit();
  };
  return (
    <Modal
      open
      onClose={klaar}
      title={t("alsBladen.blijvendTitel")}
      width={980}
      height="80vh"
      footer={<button type="button" className="rapport-knop" onClick={klaar}>{t("opbouw.klaar")}</button>}
    >
      <div className="rapport-panel blijvend-venster">
        <BelastingCanvas />
      </div>
    </Modal>
  );
}
