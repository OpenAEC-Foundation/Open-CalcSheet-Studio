import { useState } from "react";
import { useTranslation } from "react-i18next";
import Icoon from "../../Icoon";
import GewichtenVenster from "./GewichtenVenster";

/**
 * De gewichtenbibliotheek in het projectpaneel: één regel die het venster opent om te bladeren.
 * Geen teller: die zou de gegevens bij het starten al moeten laden.
 */
export default function GewichtenSectie() {
  const { t } = useTranslation("gewichten");
  const [open, setOpen] = useState(false);
  return (
    <div className="panel-section gew-sectie">
      <button type="button" className="pb-rij pb-toevoegen" title={t("sectieUitleg")} onClick={() => setOpen(true)}>
        <Icoon id="data.table" />
        <span className="pb-naam">{t("titel")}</span>
      </button>
      {open && <GewichtenVenster open onSluit={() => setOpen(false)} />}
    </div>
  );
}
