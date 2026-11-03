import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { useActieveBron, useActieveWaarden, useProjectScope } from "../../store/actiefBlad";
import { useProjectStore } from "../../store/projectStore";
import { isTekenBlad } from "../../store/tekenBlad";
import { koppelingen, schoonUitdrukking, type Opgelost } from "./model";
import { zoekBlokken } from "./code";
import {
  bladGewisseld,
  codeVoor,
  meld,
  plekVanTekening,
  schrijfInCode,
  sluitTekenen,
  useTeken,
  zetBladWaarde,
  zoekDoel,
} from "./tekenStore";
import { useProef } from "./waarden";
import TekenVlak from "./TekenVlak";
import TekenPaneel from "./TekenPaneel";
import "./Tekenen.css";

interface Vak {
  left: number;
  top: number;
  width: number;
  height: number;
}

const MIN_BREED = 640;

/**
 * Waar het venster staat: precies over het paneel Uitwerking, zodat je "in de
 * uitwerking" tekent. Staat dat paneel niet in beeld, dan over het rechter
 * paneel van de werkruimte, en anders midden in het venster. Volgt het paneel
 * als de scheiding versleept wordt of het venster van maat verandert.
 */
function useAnker(): Vak | null {
  const [vak, setVak] = useState<Vak | null>(null);
  useEffect(() => {
    let id = 0;
    const meet = () => {
      const panelen = document.querySelectorAll<HTMLElement>(".main-view .werk-paneel");
      const doel = document.querySelector(".calc-preview")?.closest<HTMLElement>(".werk-paneel") ?? panelen[panelen.length - 1];
      const r = doel?.getBoundingClientRect();
      let n: Vak;
      if (r && r.width > 80 && r.height > 80) {
        const width = Math.min(Math.max(r.width, MIN_BREED), window.innerWidth - 16);
        n = { left: Math.max(8, r.right - width), top: r.top, width, height: r.height };
      } else {
        const width = Math.min(window.innerWidth * 0.8, 1100);
        const height = Math.min(window.innerHeight * 0.75, 760);
        n = { left: (window.innerWidth - width) / 2, top: (window.innerHeight - height) / 2, width, height };
      }
      setVak((o) =>
        o && o.left === n.left && o.top === n.top && o.width === n.width && o.height === n.height ? o : n,
      );
      id = requestAnimationFrame(meet);
    };
    meet();
    return () => cancelAnimationFrame(id);
  }, []);
  return vak;
}

/**
 * De tekeneditor van het tabblad Tekenen. Staat altijd in de app (App.tsx) en
 * toont zich als er een tekening in bewerking is en de tab actief is.
 */
export default function TekenEditor() {
  const zichtbaar = useTeken((s) => s.open && s.zichtbaar && !s.vel);
  // Een tekenblad heeft de editor in zijn eigen werkruimte (TekenbladWeergave.tsx).
  const blad = useProjectStore((s) => {
    const actief = s.exemplaren.find((e) => e.id === s.activeId);
    return !!actief && !isTekenBlad(actief);
  });
  const activeId = useProjectStore((s) => s.activeId);
  useEffect(() => {
    bladGewisseld(activeId);
  }, [activeId]);
  return zichtbaar && blad ? createPortal(<Venster />, document.body) : null;
}

function Venster() {
  const { t } = useTranslation("tekenen");
  const vak = useAnker();
  const tekening = useTeken((s) => s.tekening);
  const doel = useTeken((s) => s.doel);
  const gewijzigd = useTeken((s) => s.gewijzigd);
  const melding = useTeken((s) => s.melding);
  const bron = useActieveBron();
  const waarden = useActieveWaarden();
  const scope = useProjectScope();
  const [toonCode, setToonCode] = useState(false);

  // Alle koppelingen, en het blad tot de plek van de tekening: daarmee rekent de proef ze uit.
  const formules = useMemo(
    () => [...new Set(koppelingen(tekening).map(schoonUitdrukking).filter(Boolean))].sort(),
    [tekening],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const plek = useMemo(() => plekVanTekening(bron), [bron, doel]);
  const proef = useProef(formules, bron.slice(0, plek), waarden, scope);
  const opgelost = useMemo<Opgelost>(
    () =>
      Object.assign((e: string) => proef.per.get(schoonUitdrukking(e))?.waarde, {
        eenheid: (e: string) => {
          const k = proef.per.get(schoonUitdrukking(e));
          return k ? k.fout === "eenheid" : undefined;
        },
      }),
    [proef.per],
  );
  useEffect(() => {
    zetBladWaarde(opgelost);
    return () => zetBladWaarde(undefined);
  }, [opgelost]);
  const tekstVan = useCallback((e: string) => proef.per.get(schoonUitdrukking(e))?.tekst, [proef.per]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const code = useMemo(() => (toonCode ? codeVoor(bron, plek) : ""), [toonCode, tekening, bron, plek]);
  // De regel van `@svg` van het blok waar de tekening terechtkomt.
  const doelPlek = zoekDoel(bron, doel, tekening.naam);
  const doelBlok = doelPlek ? zoekBlokken(bron).find((b) => b.begin === doelPlek.begin) : undefined;
  const regel = doelPlek ? (doelBlok ? doelBlok.svg + 1 : bron.slice(0, doelPlek.begin).split("\n").length) : null;

  if (!vak) return null;
  return (
    <div className="tk-venster" style={vak} role="dialog" aria-label={t("venster.titel", { naam: tekening.naam })}>
      <div className="tk-kop">
        <span className="tk-titel">{t("venster.titel", { naam: tekening.naam })}</span>
        <span className="tk-doel">
          {regel !== null ? t("venster.blok", { regel }) : t("venster.nieuw")}
          {gewijzigd && <span className="tk-gewijzigd" title={t("venster.gewijzigd")}> •</span>}
        </span>
        <span className="tk-kop-knoppen">
          <button className={`tk-knop${toonCode ? " actief" : ""}`} onClick={() => setToonCode((c) => !c)}>
            {t("venster.code")}
          </button>
          <button className="tk-knop primair" onClick={schrijfInCode} title={t(regel !== null ? "lint.bijwerkenTip" : "lint.invoegenTip")}>
            {t(regel !== null ? "lint.bijwerken" : "lint.invoegen")}
          </button>
          <button className="tk-sluit" onClick={sluitTekenen} title={t("lint.sluiten")} aria-label={t("lint.sluiten")}>
            ×
          </button>
        </span>
      </div>
      {melding && (
        <div className={`tk-melding${melding.fout ? " fout" : ""}`}>
          <span>{t(melding.sleutel, melding.opties ?? {})}</span>
          <button className="tk-sluit" onClick={() => meld(null)} aria-label={t("lint.sluiten")}>×</button>
        </div>
      )}
      <div className="tk-lichaam">
        <TekenVlak opgelost={opgelost} tekstVan={tekstVan} />
        <TekenPaneel proef={proef} opgelost={opgelost} />
      </div>
      {toonCode && <textarea className="tk-code-uit" readOnly value={code} spellCheck={false} />}
    </div>
  );
}
