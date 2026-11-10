import { useEffect, useMemo, useState, type CSSProperties, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import type { NodeSoort } from "../../graaf/model";
import { GROEP_ICOON, nodeDef, nodeIcoon, type NodeDef } from "../../graaf/nodes";
import { leesRecent } from "../../graaf/recent";
import { GROEPEN, soortenVan, zoekNodes } from "../../graaf/zoeken";
import Icoon from "../Icoon";
import { groepKleur } from "./graafKleur";

/*
 * De catalogus links naast het vlak: zoeken, recent gebruikt en alle nodes per groep.
 *
 *   slepen naar het vlak       de node komt waar je loslaat (GraafBladWeergave, onDrop)
 *   Enter of dubbelklik        de node komt midden in beeld, of rechts naast de gekozen node
 *   pijltjes in het zoekveld   door de treffers
 *
 * Bij de aangewezen regel staat de uitleg eronder. Welke groepen open staan, is
 * schermstaat; of het paneel open staat, onthoudt GraafBladWeergave.
 */

/** Het type van wat een regel meegeeft bij slepen: de soort. */
export const SLEEP_TYPE = "application/x-ocss-node";

function Regel({ soort, aangewezen, onWijs, onKies }: {
  soort: NodeSoort;
  aangewezen: boolean;
  onWijs: () => void;
  onKies: () => void;
}) {
  const { t } = useTranslation("werkruimte");
  const def = nodeDef(soort);
  return (
    <div
      role="option"
      aria-selected={aangewezen}
      tabIndex={-1}
      className={`graaf-cat-regel${aangewezen ? " aangewezen" : ""}`}
      style={def ? ({ "--groep": groepKleur(def.groep) } as CSSProperties) : undefined}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(SLEEP_TYPE, soort);
        e.dataTransfer.effectAllowed = "copy";
      }}
      onClick={onWijs}
      onDoubleClick={onKies}
    >
      <span className="graaf-cat-icoon" aria-hidden="true">
        <Icoon id={nodeIcoon(soort)} uit="graaf" />
      </span>
      <span className="graaf-cat-naam">{t(`graaf.soort.${soort}`)}</span>
      {aangewezen && <span className="graaf-cat-uitleg">{t(`graaf.uitleg.${soort}`)}</span>}
    </div>
  );
}

export function GraafCatalogus({ onKies, aangewezen, zetAangewezen, zoekRef }: {
  onKies: (soort: NodeSoort) => void;
  /** De soort die nu aangewezen is (ook van buiten: "Uitleg bij deze node"). */
  aangewezen: NodeSoort | null;
  zetAangewezen: (soort: NodeSoort | null) => void;
  /** Het zoekveld, zodat Ctrl+F er de cursor in kan zetten. */
  zoekRef: RefObject<HTMLInputElement | null>;
}) {
  const { t, i18n } = useTranslation("werkruimte");
  const [zoek, setZoek] = useState("");
  const [open, setOpen] = useState<ReadonlySet<NodeDef["groep"]>>(() => new Set());
  // Elke weergave opnieuw: ook een node uit het zoekmenu of door slepen komt erin.
  const recent = leesRecent();

  const treffers = useMemo(() => {
    const anders = i18n.getFixedT(i18n.language?.startsWith("en") ? "nl" : "en", "werkruimte");
    return zoekNodes(zoek, (k) => t(k), (k) => anders(k));
  }, [zoek, t, i18n]);

  // Een soort die van buiten wordt aangewezen: zijn groep gaat open.
  useEffect(() => {
    const groep = aangewezen ? nodeDef(aangewezen)?.groep : undefined;
    if (groep) setOpen((o) => (o.has(groep) ? o : new Set([...o, groep])));
  }, [aangewezen]);

  const kies = (soort: NodeSoort) => onKies(soort);

  const wisselGroep = (g: NodeDef["groep"]) =>
    setOpen((o) => {
      const n = new Set(o);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  const recentSoorten = recent.filter((s): s is NodeSoort => !!nodeDef(s));

  return (
    <aside className="graaf-catalogus" aria-label={t("graaf.catalogus.titel")}>
      <div className="graaf-cat-zoek">
        <Icoon id="view.search" uit="graaf" />
        <input
          ref={zoekRef}
          value={zoek}
          placeholder={t("graaf.zoeken")}
          aria-label={t("graaf.zoeken")}
          onChange={(e) => {
            setZoek(e.target.value);
            zetAangewezen(null);
          }}
          onKeyDown={(e) => {
            if (!zoek || treffers.length === 0) return;
            const i = aangewezen ? treffers.indexOf(aangewezen) : -1;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              zetAangewezen(treffers[Math.min(i + 1, treffers.length - 1)]);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              zetAangewezen(treffers[Math.max(i - 1, 0)]);
            } else if (e.key === "Enter") {
              kies(aangewezen && treffers.includes(aangewezen) ? aangewezen : treffers[0]);
            } else if (e.key === "Escape") {
              setZoek("");
            }
          }}
        />
      </div>

      <div className="graaf-cat-lijst" role="listbox">
        {zoek ? (
          treffers.length === 0 ? (
            <div className="graaf-cat-leeg">{t("graaf.geenTreffers")}</div>
          ) : (
            treffers.map((s) => (
              <Regel key={s} soort={s} aangewezen={aangewezen === s} onWijs={() => zetAangewezen(s)} onKies={() => kies(s)} />
            ))
          )
        ) : (
          <>
            {recentSoorten.length > 0 && (
              <>
                <div className="graaf-cat-kop">{t("graaf.catalogus.recent")}</div>
                {recentSoorten.map((s) => (
                  <Regel key={`r-${s}`} soort={s} aangewezen={false} onWijs={() => zetAangewezen(s)} onKies={() => kies(s)} />
                ))}
              </>
            )}
            <div className="graaf-cat-kop">{t("graaf.catalogus.alle")}</div>
            {GROEPEN.map((g) => {
              const soorten = soortenVan(g);
              const isOpen = open.has(g);
              return (
                <div key={g} className="graaf-cat-groep">
                  <button
                    type="button"
                    className="graaf-cat-groepkop"
                    aria-expanded={isOpen}
                    style={{ "--groep": groepKleur(g) } as CSSProperties}
                    onClick={() => wisselGroep(g)}
                  >
                    <span className="graaf-cat-pijl" aria-hidden="true">{isOpen ? "▾" : "▸"}</span>
                    <span className="graaf-cat-icoon" aria-hidden="true">
                      <Icoon id={GROEP_ICOON[g]} uit="graaf" />
                    </span>
                    <span className="graaf-cat-naam">{t(`graaf.catalogus.groep.${g}`)}</span>
                    <span className="graaf-cat-aantal">{soorten.length}</span>
                  </button>
                  {isOpen && soorten.map((s) => (
                    <Regel key={s} soort={s} aangewezen={aangewezen === s} onWijs={() => zetAangewezen(s)} onKies={() => kies(s)} />
                  ))}
                </div>
              );
            })}
          </>
        )}
      </div>
    </aside>
  );
}
