import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { useProjectStore, type Exemplaar } from "../../store/projectStore";
import { bewaarOpenWerkmappen } from "../../store/spreadsheetBlad";
import { isJupyterBlad, pakWerkmapIn } from "../../store/jupyterBlad";
import { useBestandActies } from "../../hooks/useBestandActies";
import { exporteerJupyter, jupyterGrootte, kiesExtraBestanden } from "./jupyterBlad";
import { bytesNaarBase64 } from "./pdfBlad";
import { JupyterVenster } from "./JupyterVenster";
import "./PdfBladWeergave.css";
import "./JupyterBlad.css";

/*
 * Een Jupyter-blad in de werkruimte (zie store/jupyterBlad.ts).
 *
 * De iframe mag niet door de DOM verhuizen: dan laadt hij opnieuw, en zijn kernel
 * en open cellen zijn weg. Daarom staan de vensters in een eigen laag, en legt
 * JupyterHouder het venster van het actieve blad over de plek die
 * JupyterBladWeergave in het paneel vrijhoudt. Wegklikken verliest zo niets: een
 * ander blad of het afdrukvoorbeeld legt het venster alleen opzij.
 */

/** Zoveel omgevingen blijven tegelijk leven; elke kernel kost honderden megabytes. */
const MAX_OPEN = 3;

let plek: HTMLElement | null = null;
const luisteraars = new Set<() => void>();

function zetPlek(el: HTMLElement | null) {
  plek = el;
  luisteraars.forEach((l) => l());
}

function abonneer(l: () => void) {
  luisteraars.add(l);
  return () => {
    luisteraars.delete(l);
  };
}

/** De plek van het venster op het scherm, zolang er een plek is. */
function useVak(el: HTMLElement | null): DOMRect | null {
  const [vak, setVak] = useState<DOMRect | null>(null);
  useLayoutEffect(() => {
    if (!el) {
      setVak(null);
      return;
    }
    const meet = () => setVak(el.getBoundingClientRect());
    meet();
    const waarnemer = new ResizeObserver(meet);
    waarnemer.observe(el);
    waarnemer.observe(document.documentElement);
    window.addEventListener("resize", meet);
    return () => {
      waarnemer.disconnect();
      window.removeEventListener("resize", meet);
    };
  }, [el]);
  return vak;
}

/** Houdt de omgevingen van de geopende Jupyter-bladen; staat altijd in de app. */
export function JupyterHouder() {
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const activeId = useProjectStore((s) => s.activeId);
  const { opslaan } = useBestandActies();
  const huidigePlek = useSyncExternalStore(abonneer, () => plek);
  const vak = useVak(huidigePlek);
  // Op volgorde van openen: een nieuwe volgorde zou de iframes in de DOM verplaatsen.
  const [open, setOpen] = useState<string[]>([]);
  const laatst = useRef(new Map<string, number>());
  const teller = useRef(0);

  const actief = exemplaren.find((e) => e.id === activeId && isJupyterBlad(e))?.id ?? null;

  useEffect(() => {
    if (actief && huidigePlek) laatst.current.set(actief, ++teller.current);
    setOpen((nu) => {
      let lijst = nu.filter((id) => exemplaren.some((e) => e.id === id && isJupyterBlad(e)));
      if (actief && huidigePlek && !lijst.includes(actief)) lijst = [...lijst, actief];
      while (lijst.length > MAX_OPEN) {
        const oudste = lijst
          .filter((id) => id !== actief)
          .reduce((a, b) => ((laatst.current.get(a) ?? 0) <= (laatst.current.get(b) ?? 0) ? a : b));
        lijst = lijst.filter((id) => id !== oudste);
      }
      return lijst.length === nu.length && lijst.every((id, i) => id === nu[i]) ? nu : lijst;
    });
  }, [actief, huidigePlek, exemplaren]);

  const opzij: CSSProperties = { left: -20000, top: 0, width: vak?.width ?? 1000, height: vak?.height ?? 700, visibility: "hidden" };

  return (
    <div className="jupyter-laag">
      {open.map((id) => (
        <JupyterVenster
          key={id}
          id={id}
          onOpslaan={() => void opslaan()}
          stijl={id === actief && vak ? { left: vak.left, top: vak.top, width: vak.width, height: vak.height } : opzij}
        />
      ))}
    </div>
  );
}

/** Werkruimte: de plek waar het venster komt zolang dit blad open is. */
export function JupyterBladWeergave() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    zetPlek(ref.current);
    return () => {
      zetPlek(null);
      void bewaarOpenWerkmappen();
    };
  }, []);
  return <div ref={ref} className="jupyter-plek" />;
}

/** Kop van het paneel: grootte, code op papier, bestanden inlezen en wegschrijven. */
export function JupyterBladInfo({ ex }: { ex: Exemplaar }) {
  const { t } = useTranslation("werkruimte");
  const zetJupyter = useProjectStore((s) => s.zetJupyter);
  const werkmap = ex.jupyter;
  const grootte = werkmap ? jupyterGrootte(werkmap) : "";
  const lees = async () => {
    try {
      await bewaarOpenWerkmappen();
      const nu = useProjectStore.getState().exemplaren.find((e) => e.id === ex.id)?.jupyter;
      const lijst = await kiesExtraBestanden(nu);
      if (!lijst) return;
      const data = await bytesNaarBase64(pakWerkmapIn(lijst));
      zetJupyter(ex.id, { bestandsnaam: nu?.bestandsnaam ?? "", metCode: nu?.metCode ?? true, data });
    } catch (err) {
      console.error("Bestanden inlezen mislukt:", err);
      alert(t("jupyter.lezenMislukt", { fout: (err as Error)?.message ?? String(err) }));
    }
  };
  const schrijf = async () => {
    try {
      await bewaarOpenWerkmappen();
      const nu = useProjectStore.getState().exemplaren.find((e) => e.id === ex.id)?.jupyter;
      if (nu) await exporteerJupyter(ex.naam, nu);
    } catch (err) {
      console.error("Werkmap wegschrijven mislukt:", err);
      alert(t("jupyter.schrijvenMislukt", { fout: (err as Error)?.message ?? String(err) }));
    }
  };
  return (
    <span className="pdf-info">
      <span className="pdf-info-tekst" title={grootte}>{grootte}</span>
      <label className="jupyter-keuze" title={t("jupyter.metCodeUitleg")}>
        <input
          type="checkbox"
          checked={werkmap?.metCode ?? true}
          disabled={!werkmap}
          onChange={(e) => werkmap && zetJupyter(ex.id, { ...werkmap, metCode: e.target.checked })}
        />
        {t("jupyter.metCode")}
      </label>
      <button className="pdf-vervang" onClick={() => void lees()} title={t("jupyter.inlezenUitleg")}>
        {t("jupyter.inlezen")}
      </button>
      <button className="pdf-vervang" onClick={() => void schrijf()} disabled={!werkmap} title={t("jupyter.exporterenUitleg")}>
        {t("jupyter.exporteren")}
      </button>
    </span>
  );
}
