import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import RibbonGroup from "./RibbonGroup";
import RibbonButton from "./RibbonButton";
import RibbonButtonStack from "./RibbonButtonStack";
import { Uitklap } from "./CalcPadTab";
import {
  autoSomIcon, copyIcon, cutIcon, functieIcon, kolomInvoegenIcon, kolomPassendIcon, omlaagIcon, pasteIcon, rechtsIcon,
  rijInvoegenIcon, rijPassendIcon, sorteerIcon, vastzettenIcon, verwijderIcon,
} from "./calcIcons";
import { useSpreadsheetEditor } from "../../store/spreadsheetEditor";
import { kopieer, plakKlembord } from "../calc/spreadsheetKlembord";
import { FUNCTIES, type Functie } from "../calc/spreadsheetLogica";
import {
  doorvoeren, kolommenInvoegen, kolommenVerwijderen, passendeBreedte, passendeHoogte, rijenInvoegen, rijenVerwijderen,
  sorteren, uitvoeren, vastzetten, voegFunctieIn, type Vastzetten,
} from "../calc/spreadsheetOpdrachten";

const VASTZETTEN: Vastzetten[] = ["rij", "kolom", "cel", "uit"];

/** Grote knop met een menu eronder, in dezelfde stijl als de menu's van CalcPAD. */
function MenuKnop<T extends string>({ icon, label, title, uit, keuzes, kies }: {
  icon: string;
  label: string;
  title: string;
  uit: boolean;
  keuzes: { id: T; naam: string; uitleg?: string }[];
  kies: (id: T) => void;
}) {
  const [open, setOpen] = useState(false);
  const anker = useRef<HTMLSpanElement>(null);
  return (
    <span ref={anker} className="calcpad-menu-anker">
      <RibbonButton icon={icon} label={`${label} ▾`} title={title} size="large" active={open} disabled={uit} onClick={() => setOpen((o) => !o)} />
      {open && anker.current &&
        createPortal(
          <Uitklap anker={anker.current} onSluit={() => setOpen(false)} className="calcpad-menu spreadsheet-menu">
            <section className="calcpad-menu-sectie">
              {keuzes.map((k) => (
                <button
                  key={k.id}
                  type="button"
                  role="menuitem"
                  className="calcpad-menu-rij"
                  title={k.uitleg}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    setOpen(false);
                    kies(k.id);
                  }}
                >
                  <span className="calcpad-menu-naam">{k.naam}</span>
                  {k.uitleg && <span className="spreadsheet-menu-uitleg">{k.uitleg}</span>}
                </button>
              ))}
            </section>
          </Uitklap>,
          document.body,
        )}
    </span>
  );
}

/**
 * Het tabblad Spreadsheet: verschijnt als een spreadsheet-blad open is. De opmaak
 * staat in de werkbalk van de editor zelf; hier wat die niet heeft. Een knop neemt
 * de focus niet over, zodat een formule die openstaat open blijft.
 */
export default function SpreadsheetTab() {
  const { t } = useTranslation("ribbon");
  const klaar = useSpreadsheetEditor((s) => s.api !== null);
  const uit = !klaar;
  const functies = FUNCTIES.map((f) => ({ id: f, naam: f, uitleg: t(`spreadsheet.functie.${f}`) }));
  return (
    <div className="ribbon-content" onMouseDown={(e) => e.preventDefault()}>
      <div className="ribbon-groups">
        <RibbonGroup label={t("calc.clipboard")}>
          <RibbonButton icon={pasteIcon} label={t("calc.paste")} size="large" disabled={uit} onClick={() => uitvoeren(plakKlembord)} />
          <RibbonButtonStack>
            <RibbonButton icon={cutIcon} label={t("calc.cut")} size="small" disabled={uit} onClick={() => uitvoeren(() => kopieer(true))} />
            <RibbonButton icon={copyIcon} label={t("calc.copy")} size="small" disabled={uit} onClick={() => uitvoeren(() => kopieer(false))} />
          </RibbonButtonStack>
        </RibbonGroup>

        <RibbonGroup label={t("spreadsheet.groep.functies")}>
          <RibbonButton
            icon={autoSomIcon}
            label={t("spreadsheet.autoSom")}
            title={t("spreadsheet.autoSomUitleg")}
            size="large"
            disabled={uit}
            onClick={() => uitvoeren(() => voegFunctieIn("SUM"))}
          />
          <MenuKnop<Functie>
            icon={functieIcon}
            label={t("spreadsheet.functies")}
            title={t("spreadsheet.functiesUitleg")}
            uit={uit}
            keuzes={functies}
            kies={(f) => uitvoeren(() => voegFunctieIn(f))}
          />
        </RibbonGroup>

        <RibbonGroup label={t("spreadsheet.groep.doorvoeren")}>
          <RibbonButtonStack>
            <RibbonButton icon={omlaagIcon} label={t("spreadsheet.omlaag")} title={t("spreadsheet.omlaagUitleg")} size="small" disabled={uit} onClick={() => uitvoeren(() => doorvoeren("omlaag"))} />
            <RibbonButton icon={rechtsIcon} label={t("spreadsheet.rechts")} title={t("spreadsheet.rechtsUitleg")} size="small" disabled={uit} onClick={() => uitvoeren(() => doorvoeren("rechts"))} />
          </RibbonButtonStack>
        </RibbonGroup>

        <RibbonGroup label={t("spreadsheet.groep.rijenKolommen")}>
          <RibbonButtonStack>
            <RibbonButton icon={rijInvoegenIcon} label={t("spreadsheet.rijInvoegen")} title={t("spreadsheet.rijInvoegenUitleg")} size="small" disabled={uit} onClick={() => uitvoeren(rijenInvoegen)} />
            <RibbonButton icon={verwijderIcon} label={t("spreadsheet.rijVerwijderen")} size="small" disabled={uit} onClick={() => uitvoeren(rijenVerwijderen)} />
          </RibbonButtonStack>
          <RibbonButtonStack>
            <RibbonButton icon={kolomInvoegenIcon} label={t("spreadsheet.kolomInvoegen")} title={t("spreadsheet.kolomInvoegenUitleg")} size="small" disabled={uit} onClick={() => uitvoeren(kolommenInvoegen)} />
            <RibbonButton icon={verwijderIcon} label={t("spreadsheet.kolomVerwijderen")} size="small" disabled={uit} onClick={() => uitvoeren(kolommenVerwijderen)} />
          </RibbonButtonStack>
        </RibbonGroup>

        <RibbonGroup label={t("spreadsheet.groep.maat")}>
          <RibbonButtonStack>
            <RibbonButton icon={kolomPassendIcon} label={t("spreadsheet.kolomPassend")} size="small" disabled={uit} onClick={() => uitvoeren(() => passendeBreedte())} />
            <RibbonButton icon={rijPassendIcon} label={t("spreadsheet.rijPassend")} size="small" disabled={uit} onClick={() => uitvoeren(() => passendeHoogte())} />
          </RibbonButtonStack>
        </RibbonGroup>

        <RibbonGroup label={t("spreadsheet.groep.sorteren")}>
          <RibbonButtonStack>
            <RibbonButton icon={sorteerIcon} label={t("spreadsheet.oplopend")} title={t("spreadsheet.sorteerUitleg")} size="small" disabled={uit} onClick={() => uitvoeren(() => sorteren(false))} />
            <RibbonButton icon={sorteerIcon} label={t("spreadsheet.aflopend")} title={t("spreadsheet.sorteerUitleg")} size="small" disabled={uit} onClick={() => uitvoeren(() => sorteren(true))} />
          </RibbonButtonStack>
        </RibbonGroup>

        <RibbonGroup label={t("spreadsheet.groep.beeld")}>
          <MenuKnop<Vastzetten>
            icon={vastzettenIcon}
            label={t("spreadsheet.vastzetten")}
            title={t("spreadsheet.vastzettenUitleg")}
            uit={uit}
            keuzes={VASTZETTEN.map((id) => ({ id, naam: t(`spreadsheet.vast.${id}`) }))}
            kies={(soort) => uitvoeren(() => vastzetten(soort))}
          />
        </RibbonGroup>
      </div>
    </div>
  );
}
