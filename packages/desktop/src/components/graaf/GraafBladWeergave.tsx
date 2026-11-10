import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { drieDSvg } from "@ifc-calc/core";
import { useProjectStore, type Exemplaar } from "../../store/projectStore";
import {
  dupliceer, kopieerKeuze, legeGraaf, ontkoppel, plak, uitkomstVerborgen, verbind, verplaatsKeuze, verwijderKeuze, voegNodeToe, wisselGeheel,
  groepeer, hefGroepOp, voegTekstToe, wisselIngeklapt, wisselLabel, zetGroepNaam, zetInvoer, zetNodeNaam, zetSchuif, zetTekst, zetUit,
  zetVerborgen,
  type Graaf, type GraafStuk, type GraafVerbinding, type NodeSoort,
} from "../../graaf/model";
import { groepKader, ingeklaptKaart, ingeklaptVan, zichtbarePoortPlek, type Maat } from "../../graaf/groepen";
import { GraafGroepKader, type GroepActies } from "./GraafGroepKader";
import { GraafTekstBlok, MIN_BREEDTE, type TekstActies } from "./GraafTekstBlok";
import { waardeTekst } from "../../graaf/waarde";
import { GraafMenu, type MenuItem } from "./GraafMenu";
import { leesStuk, stukAlsTekst } from "../../graaf/klembord";
import { voegRecentToe } from "../../graaf/recent";
import { waardeKleur } from "./graafKleur";
import { GraafCatalogus, SLEEP_TYPE } from "./GraafCatalogus";
import { nodeBreedte, nodeDef, poortPlek, poortenVan, verbindingMidden, verbindingPad } from "../../graaf/nodes";
import { actieveVerbindingen, rekenGraaf } from "../../graaf/rekenen";
import { graafScene } from "../../graaf/scene";
import { voorbeeldGraaf } from "../../graaf/voorbeeldGraaf";
import Icoon from "../Icoon";
import { GraafNodeKaart, type NodeActies } from "./GraafNodeKaart";
import { GraafZoekmenu } from "./GraafZoekmenu";
import { nodeNaam } from "./graafTeksten";
import { leesGrafBestandIn } from "./grafbladToevoegen";
import type { GraafAchtergrond } from "./graafAchtergrond";
import "./GraafBlad.css";

/*
 * Het vlak van een grafblad: nodes en verbindingen op een onbeperkt vlak, met het
 * 3D-voorbeeld op de achtergrond.
 *
 * Bediening
 *   klik op een node                    alleen die node kiezen
 *   Ctrl+klik op een node               node bij de keuze of eraf (op macOS Cmd)
 *   links slepen op een node            de keuze verschuiven (een node buiten de keuze: alleen die)
 *   links slepen op een poort           verbinding trekken (loslaten op niets: zoekmenu)
 *   links slepen op een lege plek       kader: kiest wat er helemaal in ligt; met Shift erbij
 *   Alt+slepen op een lege plek         3D-voorbeeld draaien (graafAchtergrond.ts); met de
 *                                       knop "3D draaien" aan ook zonder Alt
 *   rechts of midden slepen             vlak schuiven
 *   scrollen                            zoomen; met shift het 3D-voorbeeld
 *   dubbelklik op een lege plek         zoekmenu voor een nieuwe node
 *   Delete                              de keuze of de gekozen verbinding weg
 *   Ctrl+A / Escape                     alles kiezen / niets meer kiezen
 *   Ctrl+C, Ctrl+X, Ctrl+V              kopiëren, knippen, plakken (ook naar een ander grafblad)
 *   Ctrl+D                              de keuze dupliceren
 *   Ctrl+G / Ctrl+Shift+G               de keuze groeperen / de groep opheffen
 *   klik of slepen op de titel van een groep   zijn leden kiezen en verschuiven (GraafGroepKader.tsx)
 *   T                                   een losse tekst op de plek van de muis (GraafTekstBlok.tsx)
 *   rechtsklik                          menu voor een node, verbinding, groep, tekst of lege plek
 *   F2                                  de gekozen node hernoemen
 *   H                                   het oogje van de keuze: uitkomst tonen of verbergen
 *   Ctrl+F                              zoeken in de catalogus (GraafCatalogus.tsx)
 *   slepen uit de catalogus             de node komt waar je loslaat
 *
 * Het beeld (schuif en zoom) hoort niet bij het project: het blijft staan zolang
 * de app openstaat en maakt het project niet gewijzigd. Rekenen gaat vanzelf bij
 * elke wijziging van de graaf (`useMemo`). De keuze, het kader en de verschuiving
 * tijdens het slepen zitten in eigen staat; een verschuiving komt pas bij het
 * loslaten in het project, als één stap ongedaan maken.
 */

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 2.5;

interface Beeld {
  x: number;
  y: number;
  z: number;
}

/** Het beeld per blad, zolang de app openstaat. */
const beelden = new Map<string, Beeld>();

const LEEG: Graaf = legeGraaf();

/** De maat van het zoekmenu (GraafBlad.css): het blijft binnen het vlak. */
const MENU_BREEDTE = 260;
const MENU_HOOGTE = 340;

/** Een gekozen verbinding, aan zijn ingang herkend (er is er één per ingang). */
type Lijn = { naarNode: string; naarPoort: string } | null;

/** Een kader dat nu getrokken wordt, op het vlak. */
interface Kader {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Wat zijn eigen klik en dubbelklik regelt: daar begint geen kader en opent geen
 * zoekmenu (nodes, losse teksten, groepstitels en -kaarten, lijnen, balk, menu's).
 */
const ZELF_KLIK = "[data-graaf-node], [data-graaf-tekst], [data-graaf-groep], .graaf-lijn-raak, .graaf-balk, .graaf-zoekmenu, .graaf-menu, .graaf-leeg";

/** Zo ver moet de muis bewegen voordat een klik een sleep wordt, in px op het scherm. */
const DREMPEL = 3;

const ctrl = (e: { ctrlKey: boolean; metaKey: boolean }) => e.ctrlKey || e.metaKey;

/** Of de catalogus open staat: de app onthoudt het, het project niet. */
const CATALOGUS = "ocss.graaf.catalogus";
function leesCatalogusOpen(): boolean {
  try {
    return localStorage.getItem(CATALOGUS) !== "dicht";
  } catch {
    return true;
  }
}
function bewaarCatalogusOpen(open: boolean) {
  try {
    localStorage.setItem(CATALOGUS, open ? "open" : "dicht");
  } catch {
    // Geen opslag: dan alleen voor nu.
  }
}

/** Een verbinding die nu getrokken wordt, vanaf een poort naar de muis. */
interface Trek {
  kant: "in" | "uit";
  node: string;
  poort: string;
  x: number;
  y: number;
}

interface Menu {
  /** In px binnen het vlak. */
  x: number;
  y: number;
  /** Op het vlak, waar de node komt. */
  vlakX: number;
  vlakY: number;
  /** De poort waarvan de verbinding kwam: de nieuwe node wordt erop aangesloten. */
  koppel?: { kant: "in" | "uit"; node: string; poort: string };
  /** "Node ertussen": de nieuwe node komt in deze verbinding. */
  tussen?: GraafVerbinding;
}

/** Het rechtsklikmenu dat openstaat, met de plek in het vlak. */
interface Contextmenu {
  x: number;
  y: number;
  titel?: string;
  items: MenuItem[];
  /** Bij een verbinding: zijn waarde staat op de lijn zolang het menu open is. */
  lijn?: Lijn;
}

/** Het laatst gekopieerde stuk, voor "Plakken" in het menu (het klembord lezen mag niet zomaar). */
let laatsteStuk: GraafStuk | null = null;

/** Kop van het paneel: hoeveel er op het vlak staat. */
export function GraafBladInfo({ ex }: { ex: Exemplaar }) {
  const { t } = useTranslation("werkruimte");
  const g = ex.graaf ?? LEEG;
  return <span className="pdf-info-tekst">{t("graaf.info", { nodes: g.nodes.length, verbindingen: g.verbindingen.length })}</span>;
}

export function GraafBladWeergave({ ex }: { ex: Exemplaar }) {
  const { t } = useTranslation("werkruimte");
  const id = ex.id;
  const graaf = ex.graaf ?? LEEG;
  const uitkomst = useMemo(() => rekenGraaf(graaf), [graaf]);
  const scene = useMemo(() => graafScene(uitkomst.geometrie), [uitkomst]);

  const vlak = useRef<HTMLDivElement>(null);
  const drieD = useRef<HTMLDivElement>(null);
  const achtergrond = useRef<GraafAchtergrond | null>(null);
  const [geen3d, setGeen3d] = useState(false);
  const [beeld, setBeeldStaat] = useState<Beeld>(() => beelden.get(id) ?? { x: 40, y: 40, z: 1 });
  const beeldRef = useRef(beeld);
  /** De verschuiving van de keuze tijdens het slepen, op het vlak. */
  const [verschuiving, setVerschuiving] = useState<{ dx: number; dy: number } | null>(null);
  const [trek, setTrek] = useState<Trek | null>(null);
  /** De gekozen nodes (later ook teksten), als ids. */
  const [keuze, setKeuzeStaat] = useState<ReadonlySet<string>>(() => new Set());
  const keuzeRef = useRef(keuze);
  const [lijn, setLijn] = useState<Lijn>(null);
  const [kader, setKader] = useState<Kader | null>(null);
  /** De knop "3D draaien": slepen op een lege plek draait dan het voorbeeld in plaats van een kader. */
  const [draaien, setDraaien] = useState(false);
  const draaienRef = useRef(draaien);
  draaienRef.current = draaien;
  /** De laatste plek van de muis op het vlak: daar komt geplakt werk. */
  const muis = useRef<{ x: number; y: number } | null>(null);
  const [catalogus, setCatalogus] = useState(leesCatalogusOpen);
  const [aangewezen, setAangewezen] = useState<NodeSoort | null>(null);
  /** De node waarvan de naam in bewerking staat (dubbelklik, F2, het menu). */
  const [hernoemId, setHernoemId] = useState<string | null>(null);
  const [hernoemGroep, setHernoemGroep] = useState<string | null>(null);
  /** De breedte van een tekstblok tijdens het slepen aan zijn rand. */
  const [tekstBreedte, setTekstBreedte] = useState<{ id: string; breedte: number } | null>(null);
  /** Een net gemaakt tekstblok: de cursor in zijn titel. */
  const [focusTekst, setFocusTekst] = useState<string | null>(null);
  /** De maat van kaarten en tekstblokken uit de DOM, voor de kaders van groepen. */
  const [gemeten, setGemeten] = useState<ReadonlyMap<string, { b: number; h: number }>>(() => new Map());
  const [contextmenu, setContextmenu] = useState<Contextmenu | null>(null);
  const zoekRef = useRef<HTMLInputElement>(null);
  const wisselCatalogus = (open: boolean) => {
    setCatalogus(open);
    bewaarCatalogusOpen(open);
  };
  const [menu, setMenu] = useState<Menu | null>(null);
  const sceneRef = useRef(scene);
  sceneRef.current = scene;

  const zetKeuze = useCallback((k: ReadonlySet<string>) => {
    keuzeRef.current = k;
    setKeuzeStaat(k);
    if (k.size > 0) setLijn(null);
  }, []);

  const zetBeeld = useCallback((b: Beeld) => {
    beeldRef.current = b;
    beelden.set(id, b);
    setBeeldStaat(b);
  }, [id]);

  /** De graaf uit de store, niet uit de render: een actie kan na een andere komen. */
  const huidig = useCallback((): Graaf => useProjectStore.getState().exemplaren.find((e) => e.id === id)?.graaf ?? LEEG, [id]);
  const zet = useCallback((g: Graaf, sleutel?: string) => useProjectStore.getState().zetGraaf(id, g, sleutel), [id]);

  /** Een punt op het scherm als plek op het vlak. */
  const opVlak = useCallback((clientX: number, clientY: number) => {
    const r = vlak.current!.getBoundingClientRect();
    const b = beeldRef.current;
    return { x: (clientX - r.left - b.x) / b.z, y: (clientY - r.top - b.y) / b.z };
  }, []);

  /** Past alle nodes in beeld; de hoogte van een node staat in de DOM. */
  const passend = useCallback(() => {
    const v = vlak.current;
    if (!v) return;
    const kaarten = [...v.querySelectorAll<HTMLElement>("[data-graaf-node]")];
    if (kaarten.length === 0) {
      zetBeeld({ x: 40, y: 40, z: 1 });
      return;
    }
    const opId = new Map(huidig().nodes.map((n) => [n.id, n]));
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const k of kaarten) {
      const n = opId.get(k.dataset.graafNode ?? "");
      if (!n) continue;
      x0 = Math.min(x0, n.x);
      y0 = Math.min(y0, n.y);
      x1 = Math.max(x1, n.x + k.offsetWidth);
      y1 = Math.max(y1, n.y + k.offsetHeight);
    }
    const marge = 40;
    const z = Math.min(1, Math.max(MIN_ZOOM, Math.min((v.clientWidth - 2 * marge) / (x1 - x0), (v.clientHeight - 2 * marge) / (y1 - y0))));
    zetBeeld({
      x: (v.clientWidth - (x1 - x0) * z) / 2 - x0 * z,
      y: (v.clientHeight - (y1 - y0) * z) / 2 - y0 * z,
      z,
    });
  }, [huidig, zetBeeld]);

  // Een blad dat voor het eerst opent, staat passend in beeld.
  useLayoutEffect(() => {
    if (!beelden.has(id) && graaf.nodes.length > 0) passend();
    // Alleen bij het openen van het blad.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Na het laden van het voorbeeld: pas als de nodes er staan is hun hoogte bekend.
  const moetPassen = useRef(false);
  useLayoutEffect(() => {
    if (!moetPassen.current) return;
    moetPassen.current = false;
    passend();
  }, [graaf, passend]);

  // ── Het 3D-voorbeeld ────────────────────────────────────────────────────────

  useEffect(() => {
    let weg = false;
    let eigen: GraafAchtergrond | null = null;
    void import("./graafAchtergrond")
      .then((m) => {
        if (weg || !drieD.current) return;
        eigen = new m.GraafAchtergrond(drieD.current, sceneRef.current);
        achtergrond.current = eigen;
      })
      .catch((err) => {
        console.warn("Geen WebGL; het grafblad toont een stilstaande projectie.", err);
        if (!weg) setGeen3d(true);
      });
    return () => {
      weg = true;
      eigen?.dispose();
      achtergrond.current = null;
    };
  }, []);

  useEffect(() => {
    achtergrond.current?.toon(scene);
  }, [scene]);

  // ── Schuiven en zoomen ──────────────────────────────────────────────────────

  useEffect(() => {
    const v = vlak.current;
    if (!v) return;
    const wiel = (e: WheelEvent) => {
      const doel = e.target as HTMLElement;
      // Een lang codeblok scrolt zelf, zolang het de muis heeft.
      if (doel.tagName === "TEXTAREA" && doel.scrollHeight > doel.clientHeight) return;
      if (doel.closest(".graaf-zoekmenu")) return;
      e.preventDefault();
      const delta = e.deltaY || e.deltaX;
      if (e.shiftKey) {
        achtergrond.current?.zoom(Math.exp(delta * 0.001));
        return;
      }
      const b = beeldRef.current;
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, b.z * Math.exp(-delta * 0.001)));
      const r = v.getBoundingClientRect();
      const px = e.clientX - r.left;
      const py = e.clientY - r.top;
      zetBeeld({ x: px - ((px - b.x) / b.z) * z, y: py - ((py - b.y) / b.z) * z, z });
    };
    v.addEventListener("wheel", wiel, { passive: false });
    return () => v.removeEventListener("wheel", wiel);
  }, [zetBeeld]);

  /**
   * Vóór het 3D-doek de klik ziet (capture-fase): draaien alleen met Alt of met de
   * knop aan. Anders laat het doek de klik liggen en trekt het vlak een kader.
   */
  const opPointerDownCapture = (e: ReactPointerEvent<HTMLDivElement>) => {
    achtergrond.current?.zetDraaien(e.altKey || draaienRef.current);
  };

  /** De nodes en hun maat zoals ze op het vlak staan; de hoogte staat alleen in de DOM. */
  const kaartMaten = useCallback(() => {
    const maten = new Map<string, { b: number; h: number }>();
    for (const k of vlak.current?.querySelectorAll<HTMLElement>("[data-graaf-node]") ?? []) {
      if (k.dataset.graafNode) maten.set(k.dataset.graafNode, { b: k.offsetWidth, h: k.offsetHeight });
    }
    for (const k of vlak.current?.querySelectorAll<HTMLElement>("[data-graaf-tekst]") ?? []) {
      if (k.dataset.graafTekst) maten.set(k.dataset.graafTekst, { b: k.offsetWidth, h: k.offsetHeight });
    }
    return maten;
  }, []);

  /** Een kader vanaf een lege plek: bij loslaten kiest het wat er helemaal in ligt. */
  const beginKader = (e: ReactPointerEvent<HTMLDivElement>) => {
    const begin = opVlak(e.clientX, e.clientY);
    const scherm = { x: e.clientX, y: e.clientY };
    const erbij = e.shiftKey;
    let bewogen = false;
    const beweeg = (m: PointerEvent) => {
      if (!bewogen && Math.hypot(m.clientX - scherm.x, m.clientY - scherm.y) < DREMPEL) return;
      bewogen = true;
      const p = opVlak(m.clientX, m.clientY);
      setKader({ x0: begin.x, y0: begin.y, x1: p.x, y1: p.y });
    };
    const klaar = (m: PointerEvent) => {
      window.removeEventListener("pointermove", beweeg);
      window.removeEventListener("pointerup", klaar);
      window.removeEventListener("pointercancel", klaar);
      setKader(null);
      if (!bewogen) {
        if (!erbij) zetKeuze(new Set());
        return;
      }
      const p = opVlak(m.clientX, m.clientY);
      const [x0, x1] = [Math.min(begin.x, p.x), Math.max(begin.x, p.x)];
      const [y0, y1] = [Math.min(begin.y, p.y), Math.max(begin.y, p.y)];
      const maten = kaartMaten();
      const g = huidig();
      const binnen = [...g.nodes, ...(g.teksten ?? [])].filter((n) => {
        const m2 = maten.get(n.id);
        return !!m2 && n.x >= x0 && n.y >= y0 && n.x + m2.b <= x1 && n.y + m2.h <= y1;
      }).map((n) => n.id);
      // Een ingeklapte groep telt als zijn kaart: ligt die erin, dan komen al zijn leden mee.
      for (const k of vlak.current?.querySelectorAll<HTMLElement>(".graaf-groep-kaart[data-graaf-groep]") ?? []) {
        const kx = parseFloat(k.style.left);
        const ky = parseFloat(k.style.top);
        if (kx >= x0 && ky >= y0 && kx + k.offsetWidth <= x1 && ky + k.offsetHeight <= y1) {
          binnen.push(...(g.groepen?.find((gr) => gr.id === k.dataset.graafGroep)?.leden ?? []));
        }
      }
      zetKeuze(new Set(erbij ? [...keuzeRef.current, ...binnen] : binnen));
    };
    window.addEventListener("pointermove", beweeg);
    window.addEventListener("pointerup", klaar);
    window.addEventListener("pointercancel", klaar);
  };

  const opPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const doel = e.target as HTMLElement;
    if (menu) setMenu(null);
    if (e.button === 1 || e.button === 2) {
      e.preventDefault();
      // Slepen schuift het vlak; rechts klikken zonder te bewegen opent het menu.
      const begin = { x: e.clientX, y: e.clientY, b: beeldRef.current };
      const rechts = e.button === 2;
      let schuift = false;
      const beweeg = (m: PointerEvent) => {
        if (!schuift && Math.hypot(m.clientX - begin.x, m.clientY - begin.y) < 4) return;
        schuift = true;
        zetBeeld({ ...begin.b, x: begin.b.x + m.clientX - begin.x, y: begin.b.y + m.clientY - begin.y });
      };
      const klaar = (m: PointerEvent) => {
        window.removeEventListener("pointermove", beweeg);
        window.removeEventListener("pointerup", klaar);
        window.removeEventListener("pointercancel", klaar);
        if (rechts && !schuift && m.type === "pointerup") openMenu(doel, m.clientX, m.clientY);
      };
      window.addEventListener("pointermove", beweeg);
      window.addEventListener("pointerup", klaar);
      window.addEventListener("pointercancel", klaar);
      return;
    }
    vlak.current?.focus({ preventScroll: true });
    // Nodes, teksten, groepen en lijnen regelen hun eigen klik; alleen een lege plek trekt een kader.
    if (e.button !== 0 || doel.closest(ZELF_KLIK)) return;
    setLijn(null);
    // Met Alt of de draaiknop draait het 3D-doek; anders een kader.
    if (!e.altKey && !draaienRef.current) beginKader(e);
  };

  // ── De nodes ────────────────────────────────────────────────────────────────

  /**
   * Klik of sleep op een node of tekst (`id`), of op de titel van een groep (`leden`):
   * Ctrl+klik zet hem bij de keuze of haalt hem eraf; anders schuift de keuze mee.
   */
  const beginSleep = useCallback((e: ReactPointerEvent, id: string | null, leden?: readonly string[]) => {
    vlak.current?.focus({ preventScroll: true });
    if (ctrl(e)) {
      // Ctrl+klik: erbij of eraf; bij een groep al zijn leden tegelijk.
      const ids = leden ?? (id ? [id] : []);
      const k = new Set(keuzeRef.current);
      const allemaal = ids.length > 0 && ids.every((x) => k.has(x));
      for (const x of ids) {
        if (allemaal) k.delete(x);
        else k.add(x);
      }
      zetKeuze(k);
      return;
    }
    // Een groep: zijn leden. Een node of tekst buiten de keuze: alleen die. Erin: de hele keuze.
    const keuzeNu = leden ? new Set(leden) : keuzeRef.current.has(id!) ? keuzeRef.current : new Set([id!]);
    if (keuzeNu !== keuzeRef.current) zetKeuze(keuzeNu);
    setLijn(null);
    {
      const begin = { x: e.clientX, y: e.clientY };
      let d = { dx: 0, dy: 0 };
      let bewogen = false;
      const beweeg = (m: PointerEvent) => {
        if (!bewogen && Math.hypot(m.clientX - begin.x, m.clientY - begin.y) < DREMPEL) return;
        const z = beeldRef.current.z;
        d = { dx: Math.round((m.clientX - begin.x) / z), dy: Math.round((m.clientY - begin.y) / z) };
        bewogen = true;
        setVerschuiving(d);
      };
      const klaar = () => {
        window.removeEventListener("pointermove", beweeg);
        window.removeEventListener("pointerup", klaar);
        window.removeEventListener("pointercancel", klaar);
        if (bewogen && (d.dx !== 0 || d.dy !== 0)) zet(verplaatsKeuze(huidig(), [...keuzeNu], d.dx, d.dy));
        setVerschuiving(null);
      };
      window.addEventListener("pointermove", beweeg);
      window.addEventListener("pointerup", klaar);
      window.addEventListener("pointercancel", klaar);
    }
  }, [huidig, zet, zetKeuze]);

  const acties = useMemo<NodeActies>(() => ({
    beginSlepen: (e, node) => beginSleep(e, node.id),
    beginTrekken: (e, node, kant, naam) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      vlak.current?.focus({ preventScroll: true });
      // Een ingang met een verbinding: de verbinding komt los en hangt aan de muis.
      const bestaand = kant === "in"
        ? huidig().verbindingen.find((v) => v.naarNode === node.id && v.naarPoort === naam)
        : undefined;
      const start: Trek = bestaand
        ? { kant: "uit", node: bestaand.vanNode, poort: bestaand.vanPoort, ...opVlak(e.clientX, e.clientY) }
        : { kant, node: node.id, poort: naam, ...opVlak(e.clientX, e.clientY) };
      if (bestaand) zet(ontkoppel(huidig(), node.id, naam));
      setTrek(start);
      const beweeg = (m: PointerEvent) => setTrek({ ...start, ...opVlak(m.clientX, m.clientY) });
      const klaar = (m: PointerEvent) => {
        window.removeEventListener("pointermove", beweeg);
        window.removeEventListener("pointerup", klaar);
        window.removeEventListener("pointercancel", klaar);
        setTrek(null);
        const doel = (document.elementFromPoint(m.clientX, m.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-graaf-poort]");
        const andereKant = start.kant === "uit" ? "in" : "uit";
        if (doel && doel.dataset.graafPoort === andereKant && doel.dataset.node && doel.dataset.naam) {
          const v: GraafVerbinding = start.kant === "uit"
            ? { vanNode: start.node, vanPoort: start.poort, naarNode: doel.dataset.node, naarPoort: doel.dataset.naam }
            : { vanNode: doel.dataset.node, vanPoort: doel.dataset.naam, naarNode: start.node, naarPoort: start.poort };
          zet(verbind(huidig(), v));
          return;
        }
        // Op een lege plek: het zoekmenu, en de nieuwe node sluit aan.
        if (!doel && m.type === "pointerup" && !bestaand) {
          const r = vlak.current!.getBoundingClientRect();
          const p = opVlak(m.clientX, m.clientY);
          setMenu({
            x: m.clientX - r.left,
            y: m.clientY - r.top,
            vlakX: p.x,
            vlakY: p.y,
            koppel: { kant: start.kant, node: start.node, poort: start.poort },
          });
        }
      };
      window.addEventListener("pointermove", beweeg);
      window.addEventListener("pointerup", klaar);
      window.addEventListener("pointercancel", klaar);
    },
    zetVeld: (nodeId, naam, waarde) => zet(zetInvoer(huidig(), nodeId, naam, waarde), `veld:${nodeId}:${naam}`),
    zetNaam: (nodeId, naam) => zet(zetNodeNaam(huidig(), nodeId, naam)),
    wisselGeheel: (nodeId, naam) => zet(wisselGeheel(huidig(), nodeId, naam)),
    verwijder: (nodeId) => {
      zet(verwijderKeuze(huidig(), [nodeId]));
      const k = new Set(keuzeRef.current);
      k.delete(nodeId);
      zetKeuze(k);
    },
    zetVerborgen: (ids, verborgen) => {
      // Het oogje van een gekozen node geldt voor de hele keuze.
      const k = keuzeRef.current;
      const voor = ids.length === 1 && k.has(ids[0]) && k.size > 1
        ? huidig().nodes.filter((n) => k.has(n.id) && n.soort !== "bekijken").map((n) => n.id)
        : ids;
      zet(zetVerborgen(huidig(), voor, verborgen));
    },
    zetSchuif: (nodeId, open) => zet(zetSchuif(huidig(), nodeId, open)),
    hernoem: (nodeId) => {
      setHernoemId(nodeId);
      if (nodeId === null) vlak.current?.focus({ preventScroll: true });
    },
  }), [beginSleep, huidig, opVlak, zet, zetKeuze]);

  const groepActies = useMemo<GroepActies>(() => ({
    beginSlepen: (e, groep) => beginSleep(e, null, groep.leden),
    wisselIngeklapt: (groepId) => zet(wisselIngeklapt(huidig(), groepId)),
    zetNaam: (groepId, naam) => zet(zetGroepNaam(huidig(), groepId, naam)),
    hernoem: (groepId) => {
      setHernoemGroep(groepId);
      if (groepId === null) vlak.current?.focus({ preventScroll: true });
    },
  }), [beginSleep, huidig, zet]);

  const tekstActies = useMemo<TekstActies>(() => ({
    beginSlepen: (e, tekstId) => beginSleep(e, tekstId),
    zet: (tekstId, wat, sleutel) => zet(zetTekst(huidig(), tekstId, wat), sleutel ? `tekst:${tekstId}:${sleutel}` : undefined),
    beginBreedte: (e, tekst) => {
      e.stopPropagation();
      e.preventDefault();
      const begin = e.clientX;
      let breedte = tekst.breedte;
      const beweeg = (m: PointerEvent) => {
        breedte = Math.max(MIN_BREEDTE, Math.round(tekst.breedte + (m.clientX - begin) / beeldRef.current.z));
        setTekstBreedte({ id: tekst.id, breedte });
      };
      const klaar = () => {
        window.removeEventListener("pointermove", beweeg);
        window.removeEventListener("pointerup", klaar);
        window.removeEventListener("pointercancel", klaar);
        if (breedte !== tekst.breedte) zet(zetTekst(huidig(), tekst.id, { breedte }));
        setTekstBreedte(null);
      };
      window.addEventListener("pointermove", beweeg);
      window.addEventListener("pointerup", klaar);
      window.addEventListener("pointercancel", klaar);
    },
  }), [beginSleep, huidig, zet]);

  const voegToe = useCallback((soort: NodeSoort, m: Menu) => {
    const r = voegNodeToe(huidig(), soort, Math.round(m.vlakX), Math.round(m.vlakY));
    let g = r.graaf;
    if (m.tussen) {
      // Node ertussen: de oude verbinding gaat via de nieuwe node.
      const nieuw = g.nodes.find((n) => n.id === r.id)!;
      const p = poortenVan(nieuw);
      g = ontkoppel(g, m.tussen.naarNode, m.tussen.naarPoort);
      if (p.ingangen[0]) g = verbind(g, { vanNode: m.tussen.vanNode, vanPoort: m.tussen.vanPoort, naarNode: r.id, naarPoort: p.ingangen[0].naam });
      if (p.uitgangen[0]) g = verbind(g, { vanNode: r.id, vanPoort: p.uitgangen[0], naarNode: m.tussen.naarNode, naarPoort: m.tussen.naarPoort });
    } else if (m.koppel) {
      const nieuw = g.nodes.find((n) => n.id === r.id)!;
      const p = poortenVan(nieuw);
      if (m.koppel.kant === "uit" && p.ingangen[0]) {
        g = verbind(g, { vanNode: m.koppel.node, vanPoort: m.koppel.poort, naarNode: r.id, naarPoort: p.ingangen[0].naam });
      } else if (m.koppel.kant === "in" && p.uitgangen[0]) {
        g = verbind(g, { vanNode: r.id, vanPoort: p.uitgangen[0], naarNode: m.koppel.node, naarPoort: m.koppel.poort });
      }
    }
    zet(g);
    setMenu(null);
    zetKeuze(new Set([r.id]));
    voegRecentToe(soort);
    vlak.current?.focus({ preventScroll: true });
  }, [huidig, zet, zetKeuze]);

  /** Uit de catalogus (Enter, dubbelklik): rechts naast de enige gekozen node, anders midden in beeld. */
  const voegToeUitCatalogus = (soort: NodeSoort) => {
    const v = vlak.current!;
    const k = [...keuzeRef.current];
    const naast = k.length === 1 ? huidig().nodes.find((n) => n.id === k[0]) : undefined;
    const kaart = naast && v.querySelector<HTMLElement>(`[data-graaf-node="${naast.id}"]`);
    const r = v.getBoundingClientRect();
    const midden = opVlak(r.left + v.clientWidth / 2 - 100, r.top + v.clientHeight / 3);
    const plek = naast && kaart ? { x: naast.x + kaart.offsetWidth + 40, y: naast.y } : midden;
    voegToe(soort, { x: 0, y: 0, vlakX: plek.x, vlakY: plek.y });
  };

  // ── Groepen en losse teksten ───────────────────────────────────────────────

  /** Ctrl+G: een groep om de keuze (twee of meer), met de naam meteen in bewerking. */
  const groepeerKeuze = () => {
    const k = [...keuzeRef.current];
    if (k.length < 2) return;
    const r = groepeer(huidig(), k, t("graaf.groep.nieuw"));
    zet(r.graaf);
    setHernoemGroep(r.id);
  };

  /** Ctrl+Shift+G: de groepen waar iets uit de keuze in zit, opheffen. */
  const hefGroepenOp = () => {
    const k = keuzeRef.current;
    let g = huidig();
    for (const gr of g.groepen ?? []) if (gr.leden.some((l) => k.has(l))) g = hefGroepOp(g, gr.id);
    if (g !== huidig()) zet(g);
  };

  /** T of het menu: een tekstblok op deze plek, met de cursor in de titel. */
  const tekstHier = (p: { x: number; y: number }) => {
    const r = voegTekstToe(huidig(), Math.round(p.x), Math.round(p.y));
    zet(r.graaf);
    zetKeuze(new Set([r.id]));
    setFocusTekst(r.id);
  };

  const bewerkTekst = (id: string) => {
    setFocusTekst(null);
    requestAnimationFrame(() => setFocusTekst(id));
  };

  // ── Het rechtsklikmenu ──────────────────────────────────────────────────────

  /** Opent het menu voor wat er onder de muis ligt: een node (of de keuze), een verbinding of een lege plek. */
  const openMenu = (doel: HTMLElement, clientX: number, clientY: number) => {
    const v = vlak.current!;
    const r = v.getBoundingClientRect();
    const x = clientX - r.left;
    const y = clientY - r.top;
    const p = opVlak(clientX, clientY);
    const g = huidig();
    const kaart = doel.closest<HTMLElement>("[data-graaf-node]");
    const lijnEl = doel.closest<SVGElement>(".graaf-lijn-raak");
    if (doel.closest(".graaf-balk, .graaf-zoekmenu, .graaf-leeg")) return;

    const groepEl = doel.closest<HTMLElement>("[data-graaf-groep]");
    const groep = groepEl?.dataset.graafGroep ? g.groepen?.find((x) => x.id === groepEl.dataset.graafGroep) : undefined;
    if (groep) {
      zetKeuze(new Set(groep.leden));
      setContextmenu({
        x,
        y,
        titel: groep.naam,
        items: [
          { tekst: t("graaf.menu.hernoemen"), actie: () => setHernoemGroep(groep.id) },
          { tekst: t(groep.ingeklapt ? "graaf.groep.uitklappen" : "graaf.groep.inklappen"), actie: () => zet(wisselIngeklapt(huidig(), groep.id)) },
          { tekst: t("graaf.menu.opheffen"), toets: "Ctrl+Shift+G", actie: () => zet(hefGroepOp(huidig(), groep.id)) },
          "streep",
          {
            tekst: t("graaf.menu.metInhoudWeg"),
            gevaar: true,
            actie: () => {
              zet(verwijderKeuze(huidig(), groep.leden));
              zetKeuze(new Set());
            },
          },
        ],
      });
      return;
    }

    const tekstEl = doel.closest<HTMLElement>("[data-graaf-tekst]");
    const tekstId = tekstEl?.dataset.graafTekst;
    if (tekstId) {
      if (!keuzeRef.current.has(tekstId)) zetKeuze(new Set([tekstId]));
      setContextmenu({
        x,
        y,
        items: [
          { tekst: t("graaf.menu.tekstBewerken"), actie: () => bewerkTekst(tekstId) },
          "streep",
          {
            tekst: t("graaf.menu.verwijderen"),
            toets: "Del",
            gevaar: true,
            actie: () => {
              zet(verwijderKeuze(huidig(), [...(keuzeRef.current.has(tekstId) ? keuzeRef.current : [tekstId])]));
              zetKeuze(new Set());
            },
          },
        ],
      });
      return;
    }

    if (kaart?.dataset.graafNode) {
      // Een node buiten de keuze: eerst alleen die kiezen.
      const id = kaart.dataset.graafNode;
      const keuzeNu = keuzeRef.current.has(id) ? keuzeRef.current : new Set([id]);
      if (keuzeNu !== keuzeRef.current) zetKeuze(keuzeNu);
      const ids = [...keuzeNu];
      const nodes = g.nodes.filter((n) => keuzeNu.has(n.id));
      const node = g.nodes.find((n) => n.id === id)!;
      const metOog = nodes.filter((n) => n.soort !== "bekijken");
      const ietsTeZien = metOog.some((n) => !uitkomstVerborgen(n));
      const allesUit = nodes.every((n) => n.uit);
      setContextmenu({
        x,
        y,
        titel: ids.length > 1 ? t("graaf.menu.keuze", { count: ids.length }) : nodeNaam(t, node),
        items: [
          { tekst: t("graaf.menu.hernoemen"), toets: "F2", uit: ids.length > 1, actie: () => setHernoemId(id) },
          {
            tekst: t(ietsTeZien ? "graaf.menu.uitkomstVerbergen" : "graaf.menu.uitkomstTonen"),
            toets: "H",
            uit: metOog.length === 0,
            actie: () => zet(zetVerborgen(huidig(), metOog.map((n) => n.id), ietsTeZien)),
          },
          { tekst: t(allesUit ? "graaf.menu.inschakelen" : "graaf.menu.uitschakelen"), actie: () => zet(zetUit(huidig(), ids, !allesUit)) },
          {
            tekst: t("graaf.menu.dupliceren"),
            toets: "Ctrl+D",
            actie: () => {
              const d = dupliceer(huidig(), ids);
              zet(d.graaf);
              zetKeuze(new Set(d.ids));
            },
          },
          { tekst: t("graaf.menu.groeperen"), toets: "Ctrl+G", uit: ids.length < 2, actie: groepeerKeuze },
          "streep",
          {
            tekst: t("graaf.menu.uitleg"),
            uit: !nodeDef(node.soort),
            actie: () => {
              wisselCatalogus(true);
              setAangewezen(node.soort as NodeSoort);
            },
          },
          "streep",
          {
            tekst: t("graaf.menu.verwijderen"),
            toets: "Del",
            gevaar: true,
            actie: () => {
              zet(verwijderKeuze(huidig(), ids));
              zetKeuze(new Set());
            },
          },
        ],
      });
      return;
    }

    if (lijnEl?.dataset.naarNode && lijnEl.dataset.naarPoort) {
      const verbinding = g.verbindingen.find((a) => a.naarNode === lijnEl.dataset.naarNode && a.naarPoort === lijnEl.dataset.naarPoort);
      if (!verbinding) return;
      const l = { naarNode: verbinding.naarNode, naarPoort: verbinding.naarPoort };
      zetKeuze(new Set());
      setLijn(l);
      setContextmenu({
        x,
        y,
        lijn: l,
        items: [
          { tekst: t(verbinding.label ? "graaf.menu.labelVerbergen" : "graaf.menu.labelTonen"), actie: () => zet(wisselLabel(huidig(), l.naarNode, l.naarPoort)) },
          { tekst: t("graaf.menu.ertussen"), actie: () => setMenu({ x, y, vlakX: p.x, vlakY: p.y, tussen: verbinding }) },
          "streep",
          {
            tekst: t("graaf.menu.lijnWeg"),
            toets: "Del",
            gevaar: true,
            actie: () => {
              zet(ontkoppel(huidig(), l.naarNode, l.naarPoort));
              setLijn(null);
            },
          },
        ],
      });
      return;
    }

    setContextmenu({
      x,
      y,
      items: [
        { tekst: t("graaf.menu.nodeToevoegen"), actie: () => setMenu({ x, y, vlakX: p.x, vlakY: p.y }) },
        { tekst: t("graaf.menu.tekstHier"), toets: "T", actie: () => tekstHier(p) },
        {
          tekst: t("graaf.menu.plakken"),
          toets: "Ctrl+V",
          uit: !laatsteStuk,
          actie: () => {
            if (!laatsteStuk) return;
            const u = plak(huidig(), laatsteStuk, Math.round(p.x), Math.round(p.y));
            zet(u.graaf);
            zetKeuze(new Set(u.ids));
          },
        },
        { tekst: t("graaf.menu.allesKiezen"), toets: "Ctrl+A", actie: () => zetKeuze(new Set([...huidig().nodes.map((n) => n.id), ...(huidig().teksten ?? []).map((x) => x.id)])) },
        { tekst: t("graaf.menu.passend"), actie: passend },
      ],
    });
  };

  /** Het zoekmenu midden in beeld, voor de knop in de balk. */
  const menuInHetMidden = () => {
    const v = vlak.current!;
    const r = v.getBoundingClientRect();
    const p = opVlak(r.left + v.clientWidth / 2 - 120, r.top + v.clientHeight / 3);
    setMenu({ x: v.clientWidth / 2 - 120, y: v.clientHeight / 3, vlakX: p.x, vlakY: p.y });
  };

  const laadVoorbeeld = () => {
    moetPassen.current = true;
    zet(voorbeeldGraaf({
      aantalVelden: t("graaf.voorbeeld.aantalVelden"),
      hartOpHart: t("graaf.voorbeeld.hartOpHart"),
      hoogte: t("graaf.voorbeeld.hoogte"),
      lijnlast: t("graaf.voorbeeld.lijnlast"),
      moment: t("graaf.voorbeeld.moment"),
      kolomstramien: t("graaf.voorbeeld.kolomstramien"),
      aantalKolommen: t("graaf.voorbeeld.aantalKolommen"),
      kolommen: t("graaf.voorbeeld.kolommen"),
      liggers: t("graaf.voorbeeld.liggers"),
      fundering: t("graaf.voorbeeld.fundering"),
    }));
  };

  const opToets = (e: ReactKeyboardEvent) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    const k = keuzeRef.current;
    if (e.key === "Delete" || e.key === "Backspace") {
      if (k.size > 0) {
        zet(verwijderKeuze(huidig(), [...k]));
        zetKeuze(new Set());
      } else if (lijn) {
        zet(ontkoppel(huidig(), lijn.naarNode, lijn.naarPoort));
        setLijn(null);
      }
    } else if (e.key === "Escape") {
      zetKeuze(new Set());
      setLijn(null);
    } else if (ctrl(e) && e.key.toLowerCase() === "a") {
      e.preventDefault();
      zetKeuze(new Set([...huidig().nodes.map((n) => n.id), ...(huidig().teksten ?? []).map((x) => x.id)]));
    } else if (ctrl(e) && e.key.toLowerCase() === "g") {
      e.preventDefault();
      if (e.shiftKey) hefGroepenOp();
      else groepeerKeuze();
    } else if (!ctrl(e) && !e.altKey && e.key.toLowerCase() === "t") {
      e.preventDefault();
      const v = vlak.current!;
      const r = v.getBoundingClientRect();
      tekstHier(muis.current ?? opVlak(r.left + v.clientWidth / 2, r.top + v.clientHeight / 2));
    } else if (e.key === "F2" && k.size === 1) {
      e.preventDefault();
      setHernoemId([...k][0]);
    } else if (ctrl(e) && e.key.toLowerCase() === "f") {
      // Zoeken in de catalogus.
      e.preventDefault();
      wisselCatalogus(true);
      requestAnimationFrame(() => zoekRef.current?.focus());
    } else if (ctrl(e) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      if (k.size === 0) return;
      const r = dupliceer(huidig(), [...k]);
      zet(r.graaf);
      zetKeuze(new Set(r.ids));
    } else if (!ctrl(e) && !e.altKey && e.key.toLowerCase() === "h" && k.size > 0) {
      // Het oogje voor de keuze: staat er nog één uitkomst, dan alles verbergen; anders alles tonen.
      const g = huidig();
      const nodes = g.nodes.filter((n) => k.has(n.id) && n.soort !== "bekijken");
      const ietsTeZien = nodes.some((n) => !uitkomstVerborgen(n));
      zet(zetVerborgen(g, nodes.map((n) => n.id), ietsTeZien));
    }
  };

  // ── Kopiëren, knippen en plakken ────────────────────────────────────────────
  // Via de events van het document: een vlak zonder tekstselectie krijgt ze zelf niet.
  // Alleen als het vlak de focus heeft, en niet in een veld van een node.
  useEffect(() => {
    const opHetVlak = () => {
      const a = document.activeElement as HTMLElement | null;
      return !!a && !!vlak.current?.contains(a) && !["INPUT", "TEXTAREA", "SELECT"].includes(a.tagName);
    };
    const kopieer = (e: ClipboardEvent, knip: boolean) => {
      const k = keuzeRef.current;
      if (!opHetVlak() || k.size === 0 || !e.clipboardData) return;
      e.preventDefault();
      laatsteStuk = kopieerKeuze(huidig(), [...k]);
      e.clipboardData.setData("text/plain", stukAlsTekst(laatsteStuk));
      if (knip) {
        zet(verwijderKeuze(huidig(), [...k]));
        zetKeuze(new Set());
      }
    };
    const opCopy = (e: ClipboardEvent) => kopieer(e, false);
    const opCut = (e: ClipboardEvent) => kopieer(e, true);
    const opPaste = (e: ClipboardEvent) => {
      if (!opHetVlak()) return;
      const stuk = leesStuk(e.clipboardData?.getData("text/plain") ?? "");
      if (!stuk) return;
      e.preventDefault();
      const v = vlak.current!;
      const r = v.getBoundingClientRect();
      const plek = muis.current ?? opVlak(r.left + v.clientWidth / 2, r.top + v.clientHeight / 2);
      const uit = plak(huidig(), stuk, Math.round(plek.x), Math.round(plek.y));
      zet(uit.graaf);
      zetKeuze(new Set(uit.ids));
    };
    // WebKit (macOS) zet Kopiëren en Plakken in het menu uit zonder tekstselectie, tenzij
    // een before-event wordt afgevangen; dan komt Cmd+C/V hier toch aan.
    const toestaan = (e: Event) => {
      if (opHetVlak()) e.preventDefault();
    };
    document.addEventListener("copy", opCopy);
    document.addEventListener("cut", opCut);
    document.addEventListener("paste", opPaste);
    for (const t of ["beforecopy", "beforecut", "beforepaste"]) document.addEventListener(t, toestaan);
    return () => {
      document.removeEventListener("copy", opCopy);
      document.removeEventListener("cut", opCut);
      document.removeEventListener("paste", opPaste);
      for (const t of ["beforecopy", "beforecut", "beforepaste"]) document.removeEventListener(t, toestaan);
    };
  }, [huidig, opVlak, zet, zetKeuze]);

  // ── Tekenen ─────────────────────────────────────────────────────────────────

  const nodes = verschuiving
    ? graaf.nodes.map((n) => (keuze.has(n.id) ? { ...n, x: n.x + verschuiving.dx, y: n.y + verschuiving.dy } : n))
    : graaf.nodes;
  const opId = new Map(nodes.map((n) => [n.id, n]));
  const poorten = new Map(nodes.map((n) => [n.id, uitkomst.nodes[n.id]?.poorten ?? poortenVan(n)]));
  /** De teksten zoals getoond: verschoven tijdens het slepen, met de breedte tijdens het slepen aan de rand. */
  const teksten = (graaf.teksten ?? []).map((tk) => ({
    tk,
    x: tk.x + (verschuiving && keuze.has(tk.id) ? verschuiving.dx : 0),
    y: tk.y + (verschuiving && keuze.has(tk.id) ? verschuiving.dy : 0),
    breedte: tekstBreedte?.id === tk.id ? tekstBreedte.breedte : tk.breedte,
  }));
  /** Plek en maat van elke node en tekst, voor de kaders van groepen; zonder meting een schatting. */
  const plekMaten = new Map<string, Maat>([
    ...nodes.map((n): [string, Maat] => [n.id, { x: n.x, y: n.y, b: gemeten.get(n.id)?.b ?? nodeBreedte(n), h: gemeten.get(n.id)?.h ?? 60 }]),
    ...teksten.map((t2): [string, Maat] => [t2.tk.id, { x: t2.x, y: t2.y, b: t2.breedte, h: gemeten.get(t2.tk.id)?.h ?? 40 }]),
  ]);
  /** Wat in een ingeklapte groep zit, staat niet op het vlak. */
  const weg = new Set((graaf.groepen ?? []).filter((g) => g.ingeklapt).flatMap((g) => g.leden));
  const groepen = (graaf.groepen ?? []).flatMap((g) => {
    const maat = g.ingeklapt ? ingeklaptKaart(g, plekMaten) : groepKader(g, plekMaten);
    return maat ? [{ g, maat, gekozen: g.leden.every((l) => keuze.has(l)) }] : [];
  });
  /** Waar een verbinding aan een poort hangt; een node in een ingeklapte groep: aan de rand van de kaart. */
  const poortOpVlak = (id: string, kant: "in" | "uit", poort: string) =>
    zichtbarePoortPlek(graaf, opId.get(id)!, poorten.get(id)!, kant, poort, plekMaten);
  /** De node zoals in het project: de kaart krijgt hem ongewijzigd, voor memo. */
  const origineel = new Map(graaf.nodes.map((n) => [n.id, n]));
  /** De verbindingen die meedoen, zonder die binnen één ingeklapte groep. */
  const actief = actieveVerbindingen(graaf, poorten).filter((v) => {
    const g = ingeklaptVan(graaf, v.vanNode);
    return !g || !g.leden.includes(v.naarNode);
  });
  /** De kleur van een verbinding: die van de waarde aan zijn begin. */
  const lijnKleur = (v: GraafVerbinding) => waardeKleur(uitkomst.nodes[v.vanNode]?.waarden[v.vanPoort]);
  const verbondenMet = (nodeId: string) =>
    actief.filter((v) => v.naarNode === nodeId).map((v) => `${v.naarPoort}\t${lijnKleur(v) ?? ""}`).sort().join("\n");

  /** De labels met de waarde op een lijn: blijvend (`label`), of zolang het menu van die lijn open is. */
  const labels = actief.flatMap((v) => {
    const menuLijn = contextmenu?.lijn;
    const hier = menuLijn?.naarNode === v.naarNode && menuLijn.naarPoort === v.naarPoort;
    if (!v.label && !hier) return [];
    const w = uitkomst.nodes[v.vanNode]?.waarden[v.vanPoort];
    const a = poortOpVlak(v.vanNode, "uit", v.vanPoort);
    const b = poortOpVlak(v.naarNode, "in", v.naarPoort);
    if (!a || !b) return [];
    const m = verbindingMidden(a, b);
    const tekst = w === undefined ? "—" : waardeTekst(w);
    return [{ sleutel: `${v.naarNode}\u0000${v.naarPoort}`, x: m.x, y: m.y, kleur: lijnKleur(v), tekst: tekst.length > 40 ? `${tekst.slice(0, 39)}…` : tekst }];
  });

  // De maat van kaarten en tekstblokken na elke weergave: de kaders van groepen hangen ervan af.
  useLayoutEffect(() => {
    const nu = kaartMaten();
    const zelfde = nu.size === gemeten.size && [...nu].every(([id, m]) => gemeten.get(id)?.b === m.b && gemeten.get(id)?.h === m.h);
    if (!zelfde) setGemeten(nu);
  });

  const trekPad = (() => {
    if (!trek) return null;
    const n = opId.get(trek.node);
    const p = n && poortPlek(n, poorten.get(n.id)!, trek.kant, trek.poort);
    if (!p) return null;
    const muis = { x: trek.x, y: trek.y };
    return trek.kant === "uit" ? verbindingPad(p, muis) : verbindingPad(muis, p);
  })();

  return (
    <div className="graaf-blad">
    {catalogus && (
      <GraafCatalogus onKies={voegToeUitCatalogus} aangewezen={aangewezen} zetAangewezen={setAangewezen} zoekRef={zoekRef} />
    )}
    <div
      ref={vlak}
      className={`graaf-vlak${trek ? " trekt" : ""}${kader ? " kadert" : ""}`}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(SLEEP_TYPE)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(e) => {
        const soort = e.dataTransfer.getData(SLEEP_TYPE) as NodeSoort;
        if (!soort) return;
        e.preventDefault();
        const p = opVlak(e.clientX, e.clientY);
        voegToe(soort, { x: 0, y: 0, vlakX: Math.round(p.x), vlakY: Math.round(p.y) });
      }}
      tabIndex={0}
      style={{
        backgroundSize: `${24 * beeld.z}px ${24 * beeld.z}px`,
        backgroundPosition: `${beeld.x}px ${beeld.y}px`,
      }}
      onPointerDownCapture={opPointerDownCapture}
      onScroll={(e) => {
        // Een veld dat focus krijgt, scrolt het vlak mee; dan klopt geen muisplek meer
        // (opVlak rekent vanaf de rand). Het vlak schuift alleen via het beeld.
        const el = e.currentTarget;
        if (el.scrollTop || el.scrollLeft) {
          el.scrollTop = 0;
          el.scrollLeft = 0;
        }
      }}
      onPointerDown={opPointerDown}
      onPointerMove={(e) => {
        muis.current = opVlak(e.clientX, e.clientY);
      }}
      onMouseDown={(e) => {
        // De middenknop schuift het vlak; niet ook de browser laten automatisch scrollen.
        if (e.button === 1) e.preventDefault();
      }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={opToets}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest(ZELF_KLIK)) return;
        const r = vlak.current!.getBoundingClientRect();
        const p = opVlak(e.clientX, e.clientY);
        setMenu({ x: e.clientX - r.left, y: e.clientY - r.top, vlakX: p.x, vlakY: p.y });
      }}
    >
      <div ref={drieD} className="graaf-3d" />
      {geen3d && uitkomst.geometrie.length > 0 && <div className="graaf-3d-projectie" dangerouslySetInnerHTML={{ __html: drieDSvg(scene) }} />}

      <div className="graaf-laag" style={{ transform: `translate(${beeld.x}px, ${beeld.y}px) scale(${beeld.z})` }}>
        {groepen.filter(({ g }) => !g.ingeklapt).map(({ g, maat, gekozen }) => (
          <GraafGroepKader key={g.id} groep={g} maat={maat} gekozen={gekozen} hernoemt={hernoemGroep === g.id} acties={groepActies} />
        ))}
        <svg className="graaf-lijnen" width="1" height="1" aria-hidden="true">
          {actief.map((v) => {
            const a = poortOpVlak(v.vanNode, "uit", v.vanPoort);
            const b = poortOpVlak(v.naarNode, "in", v.naarPoort);
            if (!a || !b) return null;
            const d = verbindingPad(a, b);
            const dezeGekozen = lijn?.naarNode === v.naarNode && lijn.naarPoort === v.naarPoort;
            return (
              <g key={`${v.naarNode}\u0000${v.naarPoort}`}>
                <path d={d} className={`graaf-lijn${dezeGekozen ? " gekozen" : ""}`} style={{ "--lijn": lijnKleur(v) } as CSSProperties} />
                <path
                  d={d}
                  className="graaf-lijn-raak"
                  data-naar-node={v.naarNode}
                  data-naar-poort={v.naarPoort}
                  onPointerDown={(e) => {
                    if (e.button !== 0) return;
                    zetKeuze(new Set());
                    setLijn({ naarNode: v.naarNode, naarPoort: v.naarPoort });
                    vlak.current?.focus({ preventScroll: true });
                  }}
                />
              </g>
            );
          })}
          {trekPad && <path d={trekPad} className="graaf-lijn trek" />}
        </svg>
        {nodes.filter((n) => !weg.has(n.id)).map((n) => (
          <GraafNodeKaart
            key={n.id}
            node={origineel.get(n.id)!}
            x={n.x}
            y={n.y}
            naam={nodeNaam(t, n)}
            uitkomst={uitkomst.nodes[n.id]}
            verbonden={verbondenMet(n.id)}
            gekozen={keuze.has(n.id)}
            hernoemt={hernoemId === n.id}
            acties={acties}
          />
        ))}
        {teksten.filter(({ tk }) => !weg.has(tk.id)).map(({ tk, x, y, breedte }) => (
          <GraafTekstBlok key={tk.id} tekst={tk} x={x} y={y} breedte={breedte} gekozen={keuze.has(tk.id)} focus={focusTekst === tk.id} acties={tekstActies} />
        ))}
        {groepen.filter(({ g }) => g.ingeklapt).map(({ g, maat, gekozen }) => (
          <GraafGroepKader key={g.id} groep={g} maat={maat} gekozen={gekozen} hernoemt={hernoemGroep === g.id} acties={groepActies} />
        ))}
        {labels.map((l) => (
          <div key={l.sleutel} className="graaf-label" style={{ left: l.x, top: l.y, "--lijn": l.kleur } as CSSProperties}>{l.tekst}</div>
        ))}
      </div>

      {kader && (
        <div
          className="graaf-kader"
          style={{
            left: beeld.x + Math.min(kader.x0, kader.x1) * beeld.z,
            top: beeld.y + Math.min(kader.y0, kader.y1) * beeld.z,
            width: Math.abs(kader.x1 - kader.x0) * beeld.z,
            height: Math.abs(kader.y1 - kader.y0) * beeld.z,
          }}
        />
      )}

      <div className="graaf-balk" onDoubleClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className={`pdf-vervang graaf-icoonknop${catalogus ? " aan" : ""}`}
          aria-pressed={catalogus}
          onClick={() => wisselCatalogus(!catalogus)}
          title={t("graaf.catalogus.wissel")}
          aria-label={t("graaf.catalogus.wissel")}
        >
          <Icoon id="panel.left" />
        </button>
        <button type="button" className="pdf-vervang" onClick={menuInHetMidden}>{t("graaf.nodeToevoegen")}</button>
        <button type="button" className="pdf-vervang graaf-icoonknop" onClick={passend} title={t("graaf.passend")} aria-label={t("graaf.passend")}>
          <Icoon id="view.fit" />
        </button>
        <button type="button" className="pdf-vervang" onClick={() => achtergrond.current?.passend()} title={t("graaf.passend3dUitleg")}>{t("graaf.passend3d")}</button>
        <button
          type="button"
          className={`pdf-vervang graaf-icoonknop${draaien ? " aan" : ""}`}
          aria-pressed={draaien}
          onClick={() => setDraaien((d) => !d)}
          title={t("graaf.draaienUitleg")}
          aria-label={t("graaf.draaien")}
        >
          <Icoon id="view.orbit" />
        </button>
      </div>
      <div className="graaf-hint">{t("graaf.hint")}</div>

      {graaf.nodes.length === 0 && !menu && (
        <div className="graaf-leeg">
          <p>{t("graaf.leeg")}</p>
          <button type="button" className="pdf-vervang" onClick={laadVoorbeeld}>{t("graaf.voorbeeldLaden")}</button>
          <button type="button" className="pdf-vervang" onClick={() => void leesGrafBestandIn(id)} title={t("graaf.importerenUitleg")}>{t("graaf.importeren")}</button>
        </div>
      )}

      {contextmenu && (
        <GraafMenu
          x={contextmenu.x}
          y={contextmenu.y}
          titel={contextmenu.titel}
          items={contextmenu.items}
          onSluit={() => {
            setContextmenu(null);
            vlak.current?.focus({ preventScroll: true });
          }}
        />
      )}

      {menu && (
        <GraafZoekmenu
          x={Math.max(8, Math.min(menu.x, (vlak.current?.clientWidth ?? Infinity) - MENU_BREEDTE - 8))}
          y={Math.max(8, Math.min(menu.y, (vlak.current?.clientHeight ?? Infinity) - MENU_HOOGTE - 8))}
          onKies={(s) => voegToe(s, menu)}
          onSluit={() => {
            setMenu(null);
            vlak.current?.focus({ preventScroll: true });
          }}
        />
      )}
    </div>
    </div>
  );
}
