import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../Modal";
import { FORMULES, FORMULE_GROEPEN, type Formule, type Tekst } from "./formules";
import { voegIn } from "./invoegen";
import { metEditor } from "../../store/codeVerzoek";
import "../settings/SettingsDialog.css";
import "./FormuleVenster.css";

/**
 * De formulebibliotheek: mechanica en normformules (formules.ts), doorzoekbaar
 * per groep. Invoegen zet het fragment — invoer met voorbeeldwaarden en de
 * formules — op de cursor in het blad; staat de code niet in beeld, dan eerst
 * de code erbij (store/codeVerzoek.ts).
 */
export default function FormuleVenster({ open, onSluit }: { open: boolean; onSluit: () => void }) {
  const { t, i18n } = useTranslation("calcpad");
  const { t: tc } = useTranslation();
  const taal = (w: Tekst) => (i18n.language?.startsWith("en") ? w.en : w.nl) || w.nl;
  const [groep, setGroep] = useState<string | null>(null);
  const [zoek, setZoek] = useState("");
  const [gekozen, setGekozen] = useState<Formule | null>(null);

  const lijst = useMemo(() => {
    const z = zoek.trim().toLowerCase();
    return FORMULES.filter((f) => (groep === null || f.groep === groep) && (!z ||
      [f.naam.nl, f.naam.en, f.uitleg?.nl ?? "", f.uitleg?.en ?? "", f.bron ?? "", f.code].some((x) => x.toLowerCase().includes(z))));
  }, [groep, zoek]);

  const invoegen = (f: Formule | null) => {
    if (!f) return;
    onSluit();
    metEditor((view) => voegIn(view, { glyph: "ƒ", tekst: f.code, regel: true }));
  };

  const footer = (
    <>
      <span className="fv-aantal">{t("formules.aantal", { count: lijst.length })}</span>
      <div className="settings-footer-right">
        <button className="settings-btn settings-btn-secondary" onClick={onSluit}>{tc("cancel")}</button>
        <button className="settings-btn settings-btn-primary" disabled={!gekozen} onClick={() => invoegen(gekozen)}>
          {t("formules.invoegen")}
        </button>
      </div>
    </>
  );

  return (
    <Modal open={open} onClose={onSluit} title={t("formules.titel")} width={Math.min(1000, window.innerWidth - 32)}
      height={Math.min(720, window.innerHeight - 64)} className="formule-venster" footer={footer}>
      <div className="settings-body">
        <div className="settings-sidebar">
          <button className={`settings-tab${groep === null ? " active" : ""}`} onClick={() => setGroep(null)}>
            {t("formules.alle")}
          </button>
          {FORMULE_GROEPEN.map((g) => (
            <button key={g.id} className={`settings-tab${groep === g.id ? " active" : ""}`} onClick={() => setGroep(g.id)}>
              {taal(g.naam)}
            </button>
          ))}
        </div>
        <div className="settings-content fv-inhoud">
          <input className="fv-zoek" type="search" autoFocus value={zoek} placeholder={t("formules.zoeken")}
            aria-label={t("formules.zoeken")} onChange={(e) => setZoek(e.target.value)} />
          <div className="fv-lijst">
            {lijst.map((f) => (
              <button key={f.id} type="button" className={`fv-rij${gekozen?.id === f.id ? " gekozen" : ""}`}
                onClick={() => setGekozen(f)} onDoubleClick={() => invoegen(f)}>
                <span className="fv-kop">
                  <strong>{taal(f.naam)}</strong>
                  {f.bron && <span className="fv-bron">{f.bron}</span>}
                </span>
                {f.uitleg && <span className="fv-uitleg">{taal(f.uitleg)}</span>}
                {gekozen?.id === f.id && <pre className="fv-code">{f.code}</pre>}
              </button>
            ))}
            {lijst.length === 0 && <p className="fv-leeg">{t("formules.niets")}</p>}
          </div>
        </div>
      </div>
    </Modal>
  );
}
