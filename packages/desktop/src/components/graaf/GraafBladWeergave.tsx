import {
  useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent,
} from "react";
import { useTranslation } from "react-i18next";
import { drieDSvg } from "@ifc-calc/core";
import { useProjectStore, type Exemplaar } from "../../store/projectStore";
import {
  dupliceer, kopieerKeuze, legeGraaf, ontkoppel, plak, verbind, verplaatsKeuze, verwijderKeuze, voegNodeToe, wisselGeheel, zetInvoer, zetNodeNaam,
  type Graaf, type GraafVerbinding, type NodeSoort,
} from "../../graaf/model";
import { leesStuk, stukAlsTekst } from "../../graaf/klembord";
import { poortPlek, poortenVan, verbindingPad } from "../../graaf/nodes";
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

/** Zo ver moet de muis bewegen voordat een klik een sleep wordt, in px op het scherm. */
const DREMPEL = 3;

const ctrl = (e: { ctrlKey: boolean; metaKey: boolean }) => e.ctrlKey || e.metaKey;

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
}

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
      const binnen = huidig().nodes.filter((n) => {
        const m2 = maten.get(n.id);
        return !!m2 && n.x >= x0 && n.y >= y0 && n.x + m2.b <= x1 && n.y + m2.h <= y1;
      }).map((n) => n.id);
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
      const begin = { x: e.clientX, y: e.clientY, b: beeldRef.current };
      const beweeg = (m: PointerEvent) => zetBeeld({ ...begin.b, x: begin.b.x + m.clientX - begin.x, y: begin.b.y + m.clientY - begin.y });
      const klaar = () => {
        window.removeEventListener("pointermove", beweeg);
        window.removeEventListener("pointerup", klaar);
        window.removeEventListener("pointercancel", klaar);
      };
      window.addEventListener("pointermove", beweeg);
      window.addEventListener("pointerup", klaar);
      window.addEventListener("pointercancel", klaar);
      return;
    }
    vlak.current?.focus({ preventScroll: true });
    if (e.button !== 0 || doel.closest("[data-graaf-node], .graaf-lijn-raak, .graaf-balk, .graaf-zoekmenu, .graaf-leeg")) return;
    setLijn(null);
    // Met Alt of de draaiknop draait het 3D-doek; anders een kader.
    if (!e.altKey && !draaienRef.current) beginKader(e);
  };

  // ── De nodes ────────────────────────────────────────────────────────────────

  const acties = useMemo<NodeActies>(() => ({
    beginSlepen: (e, node) => {
      vlak.current?.focus({ preventScroll: true });
      // Ctrl+klik: bij de keuze of eraf, zonder te slepen.
      if (ctrl(e)) {
        const k = new Set(keuzeRef.current);
        if (k.has(node.id)) k.delete(node.id);
        else k.add(node.id);
        zetKeuze(k);
        return;
      }
      // Een node buiten de keuze: alleen die. Een node in de keuze: de hele keuze schuift.
      const keuzeNu = keuzeRef.current.has(node.id) ? keuzeRef.current : new Set([node.id]);
      if (keuzeNu !== keuzeRef.current) zetKeuze(keuzeNu);
      setLijn(null);
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
    },
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
  }), [huidig, opVlak, zet, zetKeuze]);

  const voegToe = useCallback((soort: NodeSoort, m: Menu) => {
    const r = voegNodeToe(huidig(), soort, Math.round(m.vlakX), Math.round(m.vlakY));
    let g = r.graaf;
    if (m.koppel) {
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
    vlak.current?.focus({ preventScroll: true });
  }, [huidig, zet, zetKeuze]);

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
      zetKeuze(new Set(huidig().nodes.map((n) => n.id)));
    } else if (ctrl(e) && e.key.toLowerCase() === "d") {
      e.preventDefault();
      if (k.size === 0) return;
      const r = dupliceer(huidig(), [...k]);
      zet(r.graaf);
      zetKeuze(new Set(r.ids));
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
      e.clipboardData.setData("text/plain", stukAlsTekst(kopieerKeuze(huidig(), [...k])));
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
    document.addEventListener("copy", opCopy);
    document.addEventListener("cut", opCut);
    document.addEventListener("paste", opPaste);
    return () => {
      document.removeEventListener("copy", opCopy);
      document.removeEventListener("cut", opCut);
      document.removeEventListener("paste", opPaste);
    };
  }, [huidig, opVlak, zet, zetKeuze]);

  // ── Tekenen ─────────────────────────────────────────────────────────────────

  const nodes = verschuiving
    ? graaf.nodes.map((n) => (keuze.has(n.id) ? { ...n, x: n.x + verschuiving.dx, y: n.y + verschuiving.dy } : n))
    : graaf.nodes;
  const opId = new Map(nodes.map((n) => [n.id, n]));
  /** De node zoals in het project: de kaart krijgt hem ongewijzigd, voor memo. */
  const origineel = new Map(graaf.nodes.map((n) => [n.id, n]));
  const poorten = new Map(nodes.map((n) => [n.id, uitkomst.nodes[n.id]?.poorten ?? poortenVan(n)]));
  const actief = actieveVerbindingen(graaf, poorten);
  const verbondenMet = (nodeId: string) => actief.filter((v) => v.naarNode === nodeId).map((v) => v.naarPoort).sort().join("\n");

  const trekPad = (() => {
    if (!trek) return null;
    const n = opId.get(trek.node);
    const p = n && poortPlek(n, poorten.get(n.id)!, trek.kant, trek.poort);
    if (!p) return null;
    const muis = { x: trek.x, y: trek.y };
    return trek.kant === "uit" ? verbindingPad(p, muis) : verbindingPad(muis, p);
  })();

  return (
    <div
      ref={vlak}
      className={`graaf-vlak${trek ? " trekt" : ""}${kader ? " kadert" : ""}`}
      tabIndex={0}
      style={{
        backgroundSize: `${24 * beeld.z}px ${24 * beeld.z}px`,
        backgroundPosition: `${beeld.x}px ${beeld.y}px`,
      }}
      onPointerDownCapture={opPointerDownCapture}
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
        if ((e.target as HTMLElement).closest("[data-graaf-node], .graaf-balk, .graaf-leeg")) return;
        const r = vlak.current!.getBoundingClientRect();
        const p = opVlak(e.clientX, e.clientY);
        setMenu({ x: e.clientX - r.left, y: e.clientY - r.top, vlakX: p.x, vlakY: p.y });
      }}
    >
      <div ref={drieD} className="graaf-3d" />
      {geen3d && uitkomst.geometrie.length > 0 && <div className="graaf-3d-projectie" dangerouslySetInnerHTML={{ __html: drieDSvg(scene) }} />}

      <div className="graaf-laag" style={{ transform: `translate(${beeld.x}px, ${beeld.y}px) scale(${beeld.z})` }}>
        <svg className="graaf-lijnen" width="1" height="1" aria-hidden="true">
          {actief.map((v) => {
            const a = poortPlek(opId.get(v.vanNode)!, poorten.get(v.vanNode)!, "uit", v.vanPoort);
            const b = poortPlek(opId.get(v.naarNode)!, poorten.get(v.naarNode)!, "in", v.naarPoort);
            if (!a || !b) return null;
            const d = verbindingPad(a, b);
            const dezeGekozen = lijn?.naarNode === v.naarNode && lijn.naarPoort === v.naarPoort;
            return (
              <g key={`${v.naarNode}\u0000${v.naarPoort}`}>
                <path d={d} className={`graaf-lijn${dezeGekozen ? " gekozen" : ""}`} />
                <path
                  d={d}
                  className="graaf-lijn-raak"
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
        {nodes.map((n) => (
          <GraafNodeKaart
            key={n.id}
            node={origineel.get(n.id)!}
            x={n.x}
            y={n.y}
            naam={nodeNaam(t, n)}
            uitkomst={uitkomst.nodes[n.id]}
            verbonden={verbondenMet(n.id)}
            gekozen={keuze.has(n.id)}
            acties={acties}
          />
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
  );
}
