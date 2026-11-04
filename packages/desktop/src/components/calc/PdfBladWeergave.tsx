import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { useProjectStore, type Exemplaar } from "../../store/projectStore";
import { base64Bytes, grootteTekst } from "../../store/pdfBijlage";
import {
  beperkZoom, dunUit, kaderUit, paginaSvg, passendeZoom, puntNaarPixel, scherpeSchaal, scrollNaZoom, verschuif, zoomStap,
  type PdfAantekening, type PdfPunt,
} from "../../store/pdfAantekeningen";
import { usePdfViewer } from "../../store/pdfViewer";
import { kiesPdfBijlage, papier, sluitScherp, TEKENSCHAAL, tekenScherp, usePdfPaginas } from "./pdfBlad";
import { SPELING, type Maten } from "./paginering";
import "./PdfBladWeergave.css";

/*
 * Een PDF-blad in beeld en op papier (zie store/pdfBijlage.ts en pdfBlad.ts).
 *
 * In de werkruimte: de pagina's onder elkaar, zoals in een PDF-lezer, met zoomen en
 * aantekenen. Op papier: elke pagina een eigen vel, passend geschaald binnen de
 * bladspiegel, met de loopkop en -voet van de uitdraai of de voet van het rapport
 * eromheen, en de aantekeningen erop tenzij die van het papier zijn gehaald.
 * De eerste pagina laat boven zich ruimte voor de kop van het blad.
 */

/** Millimeter per punt (1/72 inch). */
const MM_PER_PT = 25.4 / 72;

/**
 * Ruimte boven de eerste pagina, in millimeter: de kop van het blad (losse
 * uitdraai en bijlage A) of de paragraafkop in hoofdstuk Berekeningen. Ruim
 * genomen; een pagina die er net niet onder past, zou de kop alleen op een
 * vel laten staan.
 */
const KOP_RUIMTE = 20;

const GEEN: PdfAantekening[] = [];
/** De lettergrootte van een opmerking bij elke lijndikte op het lint. */
const TEKSTGROOTTE: Record<number, number> = { 1: 10, 2: 12, 4: 16 };
/** Markeren is breed: een regel tekst past eronder. */
const markeerDikte = (dikte: number) => Math.max(8, dikte * 6);
const nieuwId = () => `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

type Zoom = { modus: "start" | "breedte" | "pagina" } | { modus: "vast"; procent: number };

/** Wat de muis nu doet, tussen indrukken en loslaten. */
type Actie =
  | { soort: "schuif"; x: number; y: number; links: number; boven: number }
  | { soort: "teken"; pagina: number; punten: PdfPunt[] }
  | { soort: "trek"; pagina: number; van: PdfPunt }
  | { soort: "verplaats"; id: string; pagina: number; van: PdfPunt; dx: number; dy: number };

/** Een opmerking die getypt wordt; met `id` een bestaande. */
interface TekstInvoer {
  id?: string;
  pagina: number;
  x: number;
  y: number;
  tekst: string;
  grootte: number;
  kleur: string;
}

/** Tekent een pagina scherper dan de gewone afbeelding zodra ver is ingezoomd. */
function ScherpeLaag({ data, nummer, schaal }: { data: string; nummer: number; schaal: number }) {
  const doek = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let nodig = true;
    const wacht = setTimeout(() => {
      const c = doek.current;
      if (c) tekenScherp(data, nummer, schaal, c, () => nodig).catch((err) => console.error("PDF scherp tekenen mislukt:", err));
    }, 180);
    return () => {
      nodig = false;
      clearTimeout(wacht);
    };
  }, [data, nummer, schaal]);
  useEffect(() => () => {
    // Het geheugen van een grote pagina meteen vrijgeven als hij uit beeld gaat.
    const c = doek.current;
    if (c) {
      c.width = 0;
      c.height = 0;
    }
  }, []);
  return <canvas ref={doek} className="pdf-scherp" width={0} height={0} aria-hidden="true" />;
}

/**
 * Werkruimte: de pagina's onder elkaar, met zoomen, schuiven en aantekenen. Het lint staat in
 * PdfTab.tsx en spreekt de viewer aan via store/pdfViewer.ts. De aantekeningen staan in punten van
 * de pagina (store/pdfAantekeningen.ts), dus de zoom raakt ze niet.
 */
export function PdfBladWeergave({ ex }: { ex: Exemplaar }) {
  // Een ander blad begint met een eigen zoom en zonder keuze.
  return <PdfViewer key={ex.id} ex={ex} />;
}

function PdfViewer({ ex }: { ex: Exemplaar }) {
  const { t } = useTranslation("werkruimte");
  const stand = usePdfPaginas(ex.pdf?.data);
  const zetAantekeningen = useProjectStore((s) => s.zetPdfAantekeningen);
  const zetOpPapier = useProjectStore((s) => s.zetPdfOpPapier);
  const gereedschap = usePdfViewer((s) => s.gereedschap);
  const kleur = usePdfViewer((s) => s.kleur);
  const dikte = usePdfViewer((s) => s.dikte);

  const paginas = stand?.paginas ?? [];
  const alle = ex.pdf?.aantekeningen ?? GEEN;

  const vak = useRef<HTMLDivElement>(null);
  const [paneel, setPaneel] = useState({ b: 0, h: 0 });
  const [zoom, setZoom] = useState<Zoom>({ modus: "start" });
  const [huidig, setHuidig] = useState(0);
  const [inBeeld, setInBeeld] = useState<number[]>([]);
  const [keuze, setKeuze] = useState<string | null>(null);
  const [concept, setConcept] = useState<PdfAantekening | null>(null);
  const [sleep, setSleep] = useState<{ id: string; dx: number; dy: number } | null>(null);
  const [invoer, setInvoer] = useState<TekstInvoer | null>(null);
  const actie = useRef<Actie | null>(null);
  const spatie = useRef(false);
  const anker = useRef<{ cx: number; cy: number; oud: number; links: number; boven: number } | null>(null);

  // ── Zoom ───────────────────────────────────────────────────────────────────
  const breedste = paginas.reduce((m, p) => Math.max(m, p.breedte), 0);
  const deze = paginas[huidig] ?? paginas[0];
  const procent = useMemo(() => {
    if (zoom.modus === "vast") return zoom.procent;
    if (!deze || paneel.b === 0) return 100;
    if (zoom.modus === "pagina") return passendeZoom(deze.breedte, deze.hoogte, paneel.b, paneel.h, "pagina");
    const passend = passendeZoom(breedste, deze.hoogte, paneel.b, paneel.h, "breedte");
    // Bij het openen niet groter dan iets boven de ware grootte, ook in een breed paneel.
    return zoom.modus === "start" ? Math.min(125, passend) : passend;
  }, [zoom, deze, breedste, paneel]);

  useEffect(() => {
    const el = vak.current;
    if (!el) return;
    const meet = () => setPaneel({ b: el.clientWidth, h: el.clientHeight });
    meet();
    const ro = new ResizeObserver(meet);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const zoomNaar = useCallback((nieuw: number, cx?: number, cy?: number) => {
    const el = vak.current;
    if (!el) return;
    anker.current = { cx: cx ?? el.clientWidth / 2, cy: cy ?? el.clientHeight / 2, oud: procentRef.current, links: el.scrollLeft, boven: el.scrollTop };
    setZoom({ modus: "vast", procent: beperkZoom(nieuw) });
  }, []);
  const procentRef = useRef(procent);
  procentRef.current = procent;

  // De plek onder de muis blijft staan; passend maken houdt de pagina in beeld waar je was.
  const paginaNaZoom = useRef<number | null>(null);
  useLayoutEffect(() => {
    const el = vak.current;
    if (!el) return;
    const pagina = paginaNaZoom.current;
    if (pagina !== null) {
      paginaNaZoom.current = null;
      const doel = el.querySelector<HTMLElement>(`[data-pagina="${pagina}"]`);
      if (doel) el.scrollTop = doel.offsetTop - 12;
      return;
    }
    const a = anker.current;
    if (!a) return;
    anker.current = null;
    el.scrollLeft = scrollNaZoom(a.links, a.cx, a.oud, procent);
    el.scrollTop = scrollNaZoom(a.boven, a.cy, a.oud, procent);
  }, [procent]);

  // Ctrl en scrollen: niet passief, anders zoomt de hele webview mee.
  useEffect(() => {
    const el = vak.current;
    if (!el) return;
    const wiel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomNaar(procentRef.current * Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", wiel, { passive: false });
    return () => el.removeEventListener("wheel", wiel);
  }, [zoomNaar]);

  // ── Welke pagina's in beeld zijn ───────────────────────────────────────────
  const meetBeeld = useCallback(() => {
    const el = vak.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const midden = r.top + el.clientHeight / 2;
    const zichtbaar: number[] = [];
    let beste = -1;
    el.querySelectorAll<HTMLElement>("[data-pagina]").forEach((p, i) => {
      const q = p.getBoundingClientRect();
      if (q.bottom > r.top && q.top < r.bottom) zichtbaar.push(i);
      if (beste < 0 && q.bottom >= midden) beste = i;
    });
    if (beste >= 0) setHuidig(beste);
    setInBeeld((oud) => (oud.join() === zichtbaar.join() ? oud : zichtbaar));
  }, []);

  useEffect(() => {
    const el = vak.current;
    if (!el) return;
    let wacht = 0;
    const scroll = () => {
      cancelAnimationFrame(wacht);
      wacht = requestAnimationFrame(meetBeeld);
    };
    el.addEventListener("scroll", scroll, { passive: true });
    return () => {
      cancelAnimationFrame(wacht);
      el.removeEventListener("scroll", scroll);
    };
  }, [meetBeeld]);
  useEffect(meetBeeld, [meetBeeld, procent, paneel, paginas.length]);

  const naarPagina = useCallback((pagina: number) => {
    const el = vak.current;
    const doel = el?.querySelector<HTMLElement>(`[data-pagina="${pagina}"]`);
    if (el && doel) el.scrollTop = doel.offsetTop - 12;
  }, []);

  // ── Aantekeningen wijzigen ─────────────────────────────────────────────────
  const alleRef = useRef(alle);
  alleRef.current = alle;
  const bewaar = useCallback((lijst: PdfAantekening[]) => zetAantekeningen(ex.id, lijst), [ex.id, zetAantekeningen]);
  const verwijderKeuze = useCallback(() => {
    const id = keuzeRef.current;
    if (!id) return;
    bewaar(alleRef.current.filter((a) => a.id !== id));
    setKeuze(null);
  }, [bewaar]);
  const keuzeRef = useRef(keuze);
  keuzeRef.current = keuze;

  // Een keuze die door ongedaan maken is verdwenen, is geen keuze meer.
  useEffect(() => {
    if (keuze && !alle.some((a) => a.id === keuze)) setKeuze(null);
  }, [alle, keuze]);

  const opPapier = ex.pdf?.opPapier !== false;

  // ── Het lint ───────────────────────────────────────────────────────────────
  useEffect(() => {
    usePdfViewer.setState({
      zichtbaar: true,
      opdrachten: {
        naarPagina,
        zoomIn: () => zoomNaar(zoomStap(procentRef.current, 1)),
        zoomUit: () => zoomNaar(zoomStap(procentRef.current, -1)),
        passendBreedte: () => {
          paginaNaZoom.current = usePdfViewer.getState().pagina;
          setZoom({ modus: "breedte" });
        },
        passendPagina: () => {
          paginaNaZoom.current = usePdfViewer.getState().pagina;
          setZoom({ modus: "pagina" });
        },
        verwijderKeuze,
        allesWissen: () => {
          if (window.confirm(t("pdf.allesWissenVraag"))) {
            bewaar([]);
            setKeuze(null);
          }
        },
        zetOpPapier: (aan) => zetOpPapier(ex.id, aan),
      },
    });
    return () => {
      usePdfViewer.setState({ zichtbaar: false, opdrachten: null, gereedschap: "kies", heeftKeuze: false, heeftAantekeningen: false });
      sluitScherp();
    };
  }, [naarPagina, zoomNaar, verwijderKeuze, bewaar, zetOpPapier, ex.id, t]);

  useEffect(() => {
    usePdfViewer.setState({
      pagina: huidig,
      aantal: paginas.length,
      procent,
      zoomModus: zoom.modus,
      heeftKeuze: keuze !== null,
      heeftAantekeningen: alle.length > 0,
      opPapier,
    });
  }, [huidig, paginas.length, procent, zoom.modus, keuze, alle.length, opPapier]);

  // ── De muis op een pagina ──────────────────────────────────────────────────
  const puntOp = (e: { clientX: number; clientY: number }, el: Element, nummer: number): PdfPunt => {
    const r = el.getBoundingClientRect();
    const p = paginas[nummer];
    const x = ((e.clientX - r.left) / Math.max(1, r.width)) * p.breedte;
    const y = ((e.clientY - r.top) / Math.max(1, r.height)) * p.hoogte;
    return [Math.min(p.breedte, Math.max(0, x)), Math.min(p.hoogte, Math.max(0, y))];
  };

  const basis = (pagina: number) => ({ id: nieuwId(), pagina, kleur, dikte });

  const uitTrek = (a: Extract<Actie, { soort: "trek" }>, naar: PdfPunt): PdfAantekening | null => {
    if (gereedschap === "pijl") return { ...basis(a.pagina), soort: "pijl", van: a.van, naar };
    if (gereedschap === "kader" || gereedschap === "wolk") return { ...basis(a.pagina), soort: gereedschap, ...kaderUit(a.van, naar) };
    return null;
  };

  const invoerRef = useRef(invoer);
  invoerRef.current = invoer;
  const bewaarInvoer = useCallback(() => {
    const i = invoerRef.current;
    if (!i) return;
    // Meteen leeg: het verlaten van het veld roept dit na Ctrl+Enter nog een keer aan.
    invoerRef.current = null;
    setInvoer(null);
    const zonder = i.id ? alleRef.current.filter((a) => a.id !== i.id) : alleRef.current;
    if (i.tekst.trim() !== "") {
      bewaar([...zonder, { id: i.id ?? nieuwId(), pagina: i.pagina, soort: "tekst", kleur: i.kleur, dikte: 1, x: i.x, y: i.y, tekst: i.tekst, grootte: i.grootte }]);
    } else if (i.id) {
      bewaar(zonder);
    }
  }, [bewaar]);

  // Wie met het veld open op een knop klikt, verlaat het veld bij het indrukken. Bewaren zet de
  // knop dan opnieuw neer en de klik gaat verloren. Daarom wacht het bewaren tot na het loslaten.
  const ingedrukt = useRef(false);
  const wachtend = useRef(false);
  const veldOpen = invoer !== null;
  useEffect(() => {
    if (!veldOpen) return;
    const neer = () => {
      ingedrukt.current = true;
    };
    const op = () => {
      ingedrukt.current = false;
      if (wachtend.current) {
        wachtend.current = false;
        setTimeout(bewaarInvoer, 0);
      }
    };
    window.addEventListener("pointerdown", neer, true);
    window.addEventListener("pointerup", op, true);
    return () => {
      window.removeEventListener("pointerdown", neer, true);
      window.removeEventListener("pointerup", op, true);
    };
  }, [veldOpen, bewaarInvoer]);

  const omlaag = (e: ReactPointerEvent<HTMLDivElement>, nummer: number) => {
    const doel = e.target as Element;
    if (doel.closest("textarea")) return;
    const el = e.currentTarget;
    const punt = puntOp(e, el, nummer);
    const schuif = () => {
      const v = vak.current;
      if (v) actie.current = { soort: "schuif", x: e.clientX, y: e.clientY, links: v.scrollLeft, boven: v.scrollTop };
    };
    if (e.button === 1 || (e.button === 0 && spatie.current)) {
      e.preventDefault();
      schuif();
    } else if (e.button !== 0) {
      return;
    } else if (gereedschap === "kies") {
      const raak = doel.closest("[data-aantekening]");
      const id = raak?.getAttribute("data-aantekening") ?? null;
      setKeuze(id);
      if (id) actie.current = { soort: "verplaats", id, pagina: nummer, van: punt, dx: 0, dy: 0 };
      else schuif();
    } else if (gereedschap === "pen" || gereedschap === "markeer") {
      actie.current = { soort: "teken", pagina: nummer, punten: [punt] };
    } else if (gereedschap === "tekst") {
      if (invoer) bewaarInvoer();
      else setInvoer({ pagina: nummer, x: punt[0], y: punt[1], tekst: "", grootte: TEKSTGROOTTE[dikte] ?? 12, kleur });
      return;
    } else {
      actie.current = { soort: "trek", pagina: nummer, van: punt };
    }
    el.setPointerCapture(e.pointerId);
    vak.current?.focus({ preventScroll: true });
  };

  const beweeg = (e: ReactPointerEvent<HTMLDivElement>, nummer: number) => {
    const a = actie.current;
    if (!a) return;
    if (a.soort === "schuif") {
      const v = vak.current;
      if (v) {
        v.scrollLeft = a.links - (e.clientX - a.x);
        v.scrollTop = a.boven - (e.clientY - a.y);
      }
      return;
    }
    const punt = puntOp(e, e.currentTarget, nummer);
    if (a.soort === "teken") {
      a.punten.push(punt);
      setConcept({ ...basis(a.pagina), id: "concept", soort: gereedschap === "markeer" ? "markeer" : "pen", dikte: gereedschap === "markeer" ? markeerDikte(dikte) : dikte, punten: [...a.punten] });
    } else if (a.soort === "trek") {
      setConcept(uitTrek(a, punt));
    } else {
      a.dx = punt[0] - a.van[0];
      a.dy = punt[1] - a.van[1];
      setSleep({ id: a.id, dx: a.dx, dy: a.dy });
    }
  };

  const omhoog = (e: ReactPointerEvent<HTMLDivElement>, nummer: number) => {
    const a = actie.current;
    if (!a) return;
    actie.current = null;
    setConcept(null);
    setSleep(null);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    if (a.soort === "teken") {
      const punten = dunUit(a.punten, 0.5);
      if (punten.length < 2) return;
      const markeer = gereedschap === "markeer";
      bewaar([...alle, { ...basis(a.pagina), soort: markeer ? "markeer" : "pen", dikte: markeer ? markeerDikte(dikte) : dikte, punten }]);
    } else if (a.soort === "trek") {
      const naar = puntOp(e, e.currentTarget, nummer);
      // Een klik zonder slepen is geen vorm.
      if (Math.hypot(naar[0] - a.van[0], naar[1] - a.van[1]) < 3) return;
      const nieuw = uitTrek(a, naar);
      if (nieuw) bewaar([...alle, nieuw]);
    } else if (a.soort === "verplaats" && (a.dx !== 0 || a.dy !== 0)) {
      bewaar(alle.map((x) => (x.id === a.id ? verschuif(x, a.dx, a.dy) : x)));
    }
  };

  const dubbel = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (gereedschap !== "kies") return;
    const id = (e.target as Element).closest("[data-aantekening]")?.getAttribute("data-aantekening");
    const a = alle.find((x) => x.id === id);
    if (a?.soort === "tekst") setInvoer({ id: a.id, pagina: a.pagina, x: a.x, y: a.y, tekst: a.tekst, grootte: a.grootte, kleur: a.kleur });
  };

  const toets = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("textarea, input, select")) return;
    if ((e.key === "Delete" || e.key === "Backspace") && keuze) {
      e.preventDefault();
      verwijderKeuze();
    } else if (e.key === "Escape") {
      setKeuze(null);
      usePdfViewer.setState({ gereedschap: "kies" });
    } else if (e.key === " ") {
      spatie.current = true;
      e.preventDefault();
    } else if (e.ctrlKey || e.metaKey) {
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        zoomNaar(zoomStap(procent, 1));
      } else if (e.key === "-") {
        e.preventDefault();
        zoomNaar(zoomStap(procent, -1));
      } else if (e.key === "0") {
        e.preventDefault();
        setZoom({ modus: "breedte" });
      }
    }
  };

  // ── Tekenen ────────────────────────────────────────────────────────────────
  const getoond = useMemo(() => {
    let lijst = alle;
    if (sleep) lijst = lijst.map((a) => (a.id === sleep.id ? verschuif(a, sleep.dx, sleep.dy) : a));
    if (invoer?.id) lijst = lijst.filter((a) => a.id !== invoer.id);
    return concept ? [...lijst, concept] : lijst;
  }, [alle, sleep, concept, invoer]);

  const schermSchaal = window.devicePixelRatio || 1;

  return (
    <div
      ref={vak}
      className="pdf-weergave"
      data-gereedschap={gereedschap}
      tabIndex={0}
      onKeyDown={toets}
      onKeyUp={(e) => {
        if (e.key === " ") spatie.current = false;
      }}
    >
      {!ex.pdf ? (
        <p className="pdf-melding">{t("pdf.ontbreekt")}</p>
      ) : stand?.status === "fout" && stand.paginas.length === 0 ? (
        <p className="pdf-melding fout">{t("pdf.fout", { fout: stand.fout })}</p>
      ) : !stand || stand.paginas.length === 0 ? (
        <p className="pdf-melding">{t("pdf.laden")}</p>
      ) : (
        <div className="pdf-weergave-paginas">
          {stand.paginas.map((p, i) => {
            const schaal = inBeeld.includes(i) && p.url ? scherpeSchaal(p.breedte, p.hoogte, procent, schermSchaal, TEKENSCHAAL) : null;
            return (
              <div
                key={i}
                className="pdf-weergave-pagina"
                data-pagina={i}
                style={{ width: `${puntNaarPixel(p.breedte, procent)}px`, height: `${puntNaarPixel(p.hoogte, procent)}px` }}
                onPointerDown={(e) => omlaag(e, i)}
                onPointerMove={(e) => beweeg(e, i)}
                onPointerUp={(e) => omhoog(e, i)}
                onPointerCancel={(e) => omhoog(e, i)}
                onDoubleClick={dubbel}
                onMouseDown={(e) => {
                  // De opmerking moet zijn focus houden; de muis zou die anders meteen wegnemen.
                  if (gereedschap === "tekst" && !(e.target as Element).closest("textarea")) e.preventDefault();
                }}
              >
                {p.url ? (
                  <img src={p.url} alt={t("pdf.pagina", { nummer: i + 1 })} draggable={false} />
                ) : (
                  <span>{t(p.mislukt ? "pdf.paginaMislukt" : "pdf.paginaLaden", { nummer: i + 1 })}</span>
                )}
                {schaal !== null && ex.pdf && <ScherpeLaag data={ex.pdf.data} nummer={i} schaal={schaal} />}
                <div
                  className={`pdf-aantekeningen${gereedschap === "kies" ? " kies" : ""}`}
                  dangerouslySetInnerHTML={{ __html: paginaSvg(getoond, i, p.breedte, p.hoogte, gereedschap === "kies" ? keuze : null) }}
                />
                {invoer?.pagina === i && (
                  <textarea
                    className="pdf-tekst-invoer"
                    autoFocus
                    aria-label={t("pdf.tekstVeld")}
                    rows={Math.max(1, invoer.tekst.split("\n").length)}
                    value={invoer.tekst}
                    style={{
                      left: `${(invoer.x / p.breedte) * 100}%`,
                      top: `${(invoer.y / p.hoogte) * 100}%`,
                      fontSize: `${puntNaarPixel(invoer.grootte, procent)}px`,
                      color: invoer.kleur,
                    }}
                    onChange={(e) => {
                      const tekst = e.target.value;
                      setInvoer((o) => (o ? { ...o, tekst } : o));
                    }}
                    onBlur={() => {
                      if (ingedrukt.current) wachtend.current = true;
                      else bewaarInvoer();
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Escape") setInvoer(null);
                      else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) bewaarInvoer();
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Kop van het paneel: bestandsnaam, aantal pagina's en grootte, en vervangen. */
export function PdfBladInfo({ ex }: { ex: Exemplaar }) {
  const { t, i18n } = useTranslation("werkruimte");
  const stand = usePdfPaginas(ex.pdf?.data);
  const zetPdf = useProjectStore((s) => s.zetPdf);
  const delen = ex.pdf
    ? [
        ex.pdf.bestandsnaam,
        stand && stand.paginas.length > 0 ? t("pdf.paginas", { count: stand.paginas.length }) : "",
        grootteTekst(base64Bytes(ex.pdf.data), i18n.language),
      ]
    : [];
  const vervang = async () => {
    if (ex.pdf?.aantekeningen?.length && !window.confirm(t("pdf.vervangenAantekeningen"))) return;
    try {
      const pdf = await kiesPdfBijlage();
      if (pdf) zetPdf(ex.id, pdf);
    } catch (err) {
      console.error("PDF vervangen mislukt:", err);
      alert(t("pdf.lezenMislukt", { fout: (err as Error)?.message ?? String(err) }));
    }
  };
  return (
    <span className="pdf-info">
      <span className="pdf-info-tekst" title={delen.filter(Boolean).join(" · ")}>{delen.filter(Boolean).join(" · ")}</span>
      <button className="pdf-vervang" onClick={() => void vervang()} title={t("pdf.vervangenUitleg")}>
        {t("pdf.vervangen")}
      </button>
    </span>
  );
}

/**
 * De pagina's op papier, elk op een eigen vel en passend geschaald binnen de
 * bladspiegel van `maten`. De eerste pagina deelt zijn vel met de kop erboven;
 * na elke pagina begint een nieuw vel (`print-nieuw-vel` en `print-vel-af`, zie
 * paginering.ts), zodat ook de volgende paragraaf niet op het vel van een
 * liggende pagina doorloopt. Een pagina die nog getekend wordt draagt
 * `data-afdruk-laadt`; het printen wacht daarop.
 *
 * Het afdrukonderdeel van een PDF-blad (bladSoorten.tsx): in hoofdstuk Berekeningen
 * onder de paragraafkop, in de losse uitdraai en bijlage A onder de kop van het blad.
 */
export function PdfPaginas({ ex, maten }: { ex: Exemplaar; maten: Maten }) {
  const stand = usePdfPaginas(ex.pdf?.data);
  const t = papier();
  if (!ex.pdf) return <p className="print-pdf-melding">{t("pdfBlad.ontbreekt")}</p>;
  if (!stand || stand.paginas.length === 0) {
    return stand?.status === "fout" ? (
      <p className="print-pdf-melding">{t("pdfBlad.fout", { fout: stand.fout })}</p>
    ) : (
      <p className="print-pdf-melding" data-afdruk-laadt="">{t("pdfBlad.laden")}</p>
    );
  }
  // Rekenblad en rapport rekenen met de speling onderaan (AfdrukVoorbeeld).
  const breedte = maten.inhoud.breedte;
  const hoogte = maten.inhoud.hoogte - SPELING;
  const aantekeningen = ex.pdf.opPapier === false ? [] : ex.pdf.aantekeningen ?? [];
  return (
    <>
      {stand.paginas.map((p, i) => {
        const b = p.breedte * MM_PER_PT;
        const h = p.hoogte * MM_PER_PT;
        const schaal = Math.min(breedte / b, (hoogte - (i === 0 ? KOP_RUIMTE : 0)) / h);
        const klaar = p.url !== null || p.mislukt === true;
        return (
          <figure
            key={i}
            className={i === 0 ? "print-pdf-pagina print-vel-af" : "print-pdf-pagina print-nieuw-vel print-vel-af"}
            style={{ width: `${(b * schaal).toFixed(2)}mm`, height: `${(h * schaal).toFixed(2)}mm` }}
            data-afdruk-laadt={klaar ? undefined : ""}
          >
            {p.url ? (
              <img src={p.url} alt="" />
            ) : p.mislukt ? (
              <span>{t("pdfBlad.paginaMislukt", { nummer: i + 1 })}</span>
            ) : null}
            {aantekeningen.some((a) => a.pagina === i) && (
              <div className="print-pdf-aantekeningen" dangerouslySetInnerHTML={{ __html: paginaSvg(aantekeningen, i, p.breedte, p.hoogte) }} />
            )}
          </figure>
        );
      })}
    </>
  );
}
