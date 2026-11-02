import { schoonSvgDeel } from "../calc/uitwerkingOpschonen";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { beeldVan, kernGetal } from "./code";
import {
  boogEind,
  grepen,
  isVorm,
  maatNormaal,
  nieuweVorm,
  opCirkel,
  plaatsingVan,
  sleepGreep,
  verschuif,
  waardeVan,
  MAAT_AFSTAND,
  type Gereedschap,
  type Opgelost,
  type Vorm,
} from "./model";
import { draaiKeuze, getekend, nieuwSymbool, plaatsingKeuze, spiegelKeuze, type SnapPunt } from "./symbolen";
import { ortho, snapset, zoekSnap } from "./snap";
import { PX_PER_MM } from "./staalprofielen";
import { draaiing, metNieuwId, pasToe, schaling, spiegeling, type Omzetting } from "./bewerk";
import {
  commandoVan,
  doelVan,
  eersteStap,
  gereedschapVan,
  leesGetal,
  leesInvoer,
  omzettingen,
  type CommandoNaam,
  type Sessie,
} from "./commando";
import {
  gekozenVormen,
  kiesGereedschap,
  kopieerSelectie,
  onthoudSelectie,
  ongedaan,
  opnieuw,
  plakKlembord,
  useTeken,
  verwijderSelectie,
  wijzig,
  wijzigVormen,
  zetRaster,
} from "./tekenStore";

interface Punt {
  x: number;
  y: number;
}

type Sleep =
  | { soort: "verplaats"; vormen: Vorm[]; anker: Punt; greep: Punt; sleutel: string }
  | { soort: "greep"; id: string; k: string; vorm: Vorm; sleutel: string; basis: Punt | null }
  | { soort: "kader"; a: Punt; erbij: boolean };

/**
 * Een vorm in aanbouw. Stap 1: de muisknop is net neer (slepen maakt hem af).
 * Stap 2: een klik zette het eerste punt, de volgende klik het laatste.
 * Stap 3: een maatlijn heeft zijn twee punten en vraagt nog om kant en afstand.
 */
interface Concept {
  vorm: Vorm;
  a: Punt;
  stap: 1 | 2 | 3;
}

const rond = (n: number) => Math.round(n * 100) / 100;

/** Een lijn onder een veelvoud van 45°: met Shift. */
function richtHoek(a: Punt, b: Punt): Punt {
  const d = Math.hypot(b.x - a.x, b.y - a.y);
  const hoek = Math.round(Math.atan2(b.y - a.y, b.x - a.x) / (Math.PI / 4)) * (Math.PI / 4);
  return { x: rond(a.x + d * Math.cos(hoek)), y: rond(a.y + d * Math.sin(hoek)) };
}

/** Tekent dit gereedschap een lijn (ortho en Shift richten hem)? */
function lijnachtig(g: Gereedschap, sym: string, o: Record<string, string>): boolean {
  if (g === "lijn" || g === "pijl" || g === "maat" || g === "polylijn" || g === "schema") return true;
  return g === "symbool" && plaatsingKeuze(sym, o) === "lijn";
}

/** Een rechthoek uit twee hoeken; met Shift een vierkant. */
function vak(a: Punt, p: Punt, vierkant: boolean) {
  let w = p.x - a.x;
  let h = p.y - a.y;
  if (vierkant) {
    const z = Math.max(Math.abs(w), Math.abs(h));
    w = Math.sign(w || 1) * z;
    h = Math.sign(h || 1) * z;
  }
  const m = (n: number) => ({ v: rond(n) });
  return { x: m(Math.min(a.x, a.x + w)), y: m(Math.min(a.y, a.y + h)), w: m(Math.abs(w)), h: m(Math.abs(h)) };
}

/** De vorm in aanbouw bijwerken naar het punt onder de muis (al gesnapt en gericht). */
function bouw(v: Vorm, a: Punt, p: Punt, shift: boolean): Vorm {
  const m = (n: number) => ({ v: rond(n) });
  switch (v.soort) {
    case "lijn":
    case "pijl":
    case "maat":
      return { ...v, p: { ...v.p, x2: m(p.x), y2: m(p.y) } };
    case "rechthoek":
      return { ...v, p: vak(a, p, shift) };
    case "cirkel":
      return { ...v, p: { ...v.p, r: m(Math.hypot(p.x - a.x, p.y - a.y)) } };
    case "polylijn": {
      let n = 0;
      while (v.p[`x${n + 1}`]) n++;
      return { ...v, p: { ...v.p, [`x${n}`]: m(p.x), [`y${n}`]: m(p.y) } };
    }
    case "symbool":
      if (plaatsingVan(v) === "vak") return { ...v, p: vak(a, p, shift) };
      return { ...v, p: { ...v.p, x2: m(p.x), y2: m(p.y) } };
    default:
      return v;
  }
}

/** Is de vorm groot genoeg om te bewaren? */
function heeftMaat(v: Vorm): boolean {
  const w = (k: string) => v.p[k]?.v ?? 0;
  switch (v.soort) {
    case "rechthoek":
      return w("w") > 0.5 && w("h") > 0.5;
    case "cirkel":
      return w("r") > 0.5;
    case "symbool":
      if (plaatsingVan(v) === "vak") return w("w") > 0.5 && w("h") > 0.5;
      return Math.hypot(w("x2") - w("x1"), w("y2") - w("y1")) > 0.5;
    default:
      return Math.hypot(w("x2") - w("x1"), w("y2") - w("y1")) > 0.5;
  }
}

/** Een polylijn afronden: het meelopende punt eraf en dubbele punten weg. */
function rondPolylijnAf(v: Vorm, gesloten: boolean): Vorm | null {
  const punten: Punt[] = [];
  for (let i = 0; v.p[`x${i}`]; i++) punten.push({ x: v.p[`x${i}`].v, y: v.p[`y${i}`].v });
  punten.pop();
  const uniek = punten.filter((p, i) => i === 0 || p.x !== punten[i - 1].x || p.y !== punten[i - 1].y);
  if (gesloten && uniek.length > 1 && uniek[0].x === uniek[uniek.length - 1].x && uniek[0].y === uniek[uniek.length - 1].y) uniek.pop();
  if (uniek.length < 2) return null;
  const p: Vorm["p"] = {};
  uniek.forEach((q, i) => {
    p[`x${i}`] = { v: q.x };
    p[`y${i}`] = { v: q.y };
  });
  return { ...v, p, gesloten: gesloten && uniek.length > 2 };
}

/** Een lijn leest van links naar rechts, of van onder naar boven. */
function richt(v: Vorm): Vorm {
  const { x1, y1, x2, y2 } = v.p;
  const om = x2.v < x1.v || (x2.v === x1.v && y2.v > y1.v);
  return om ? { ...v, p: { ...v.p, x1: x2, y1: y2, x2: x1, y2: y1 } } : v;
}

/**
 * Een maatlijn leest van links naar rechts; het label is de lengte in mm op de
 * tekenschaal: bij 1:10 is 454 px op het vlak 1201 mm in het echt.
 */
function richtMaat(v: Vorm, tekenschaal: number): Vorm {
  const r = richt(v);
  const { x1, y1, x2, y2 } = r.p;
  const mm = (Math.hypot(x2.v - x1.v, y2.v - y1.v) / PX_PER_MM) * tekenschaal;
  return { ...r, tekst: kernGetal(Math.round(mm)) };
}

/** De cirkel door drie punten, als boog van a via m naar c; null als ze op één lijn liggen. */
function boogDoor(a: Punt, m: Punt, c: Punt) {
  const d = 2 * (a.x * (m.y - c.y) + m.x * (c.y - a.y) + c.x * (a.y - m.y));
  if (Math.abs(d) < 1e-9) return null;
  const k = (p: Punt) => p.x * p.x + p.y * p.y;
  const cx = (k(a) * (m.y - c.y) + k(m) * (c.y - a.y) + k(c) * (a.y - m.y)) / d;
  const cy = (k(a) * (c.x - m.x) + k(m) * (a.x - c.x) + k(c) * (m.x - a.x)) / d;
  const r = Math.hypot(a.x - cx, a.y - cy);
  const hoek = (p: Punt) => (Math.atan2(p.y - cy, p.x - cx) * 180) / Math.PI;
  const [ha, hm, hc] = [hoek(a), hoek(m), hoek(c)];
  // De boog loopt met de klok mee van a1 naar a2; ligt m daar niet op, dan andersom.
  const mee = boogEind(ha, hm) <= boogEind(ha, hc);
  const [a1, a2] = mee ? [ha, hc] : [hc, ha];
  return { cx: rond(cx), cy: rond(cy), r: rond(r), a1: rond(a1), a2: rond(a2) };
}

interface Props {
  opgelost: Opgelost;
  tekstVan: (e: string) => string | undefined;
}

/** Het tekenvlak: de tekening zoals de uitwerking hem toont, met de grepen erop. */
export default function TekenVlak({ opgelost, tekstVan }: Props) {
  const { t } = useTranslation("tekenen");
  const tekening = useTeken((s) => s.tekening);
  const gereedschap = useTeken((s) => s.gereedschap);
  const symbool = useTeken((s) => s.symbool);
  const schaalTekening = useTeken((s) => s.schaal);
  const stijl = useTeken((s) => s.stijl);
  const raster = useTeken((s) => s.raster);
  const gekozen = useTeken((s) => s.gekozen);
  const commando = useTeken((s) => s.commando);

  const svgRef = useRef<SVGSVGElement>(null);
  const vlakRef = useRef<HTMLDivElement>(null);
  const [schaal, setSchaal] = useState(1);
  const [muis, setMuis] = useState<Punt | null>(null);
  const [snapNu, setSnapNu] = useState<SnapPunt | null>(null);
  const [concept, setConcept] = useState<Concept | null>(null);
  const [boogPunten, setBoogPunten] = useState<Punt[]>([]);
  const [sessie, setSessie] = useState<Sessie | null>(null);
  const [regel, setRegel] = useState("");
  const [fout, setFout] = useState<string | null>(null);
  const [selKader, setSelKader] = useState<{ a: Punt; b: Punt } | null>(null);
  const [kaders, setKaders] = useState<{ id: string; x: number; y: number; width: number; height: number }[]>([]);
  const sleep = useRef<Sleep | null>(null);
  const vorigCommando = useRef<CommandoNaam | null>(null);
  const laatstePlek = useRef<Punt | null>(null);

  const W = waardeVan(tekening.breed, opgelost) || 1;
  const H = waardeVan(tekening.hoog, opgelost) || 1;
  const rand = Math.max(W, H) * 0.04 + 8;
  const vakVlak = { x: tekening.x0 - rand, y: tekening.y0 - rand, w: W + 2 * rand, h: H + 2 * rand };
  const plaatsing = gereedschap === "symbool" ? plaatsingKeuze(symbool.sym, symbool.o) : null;

  // Schermpixels per eenheid: grepen en raster houden zo hun maat op het scherm.
  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const meet = () => {
      const r = svg.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) setSchaal(Math.min(r.width / vakVlak.w, r.height / vakVlak.h));
    };
    meet();
    const ro = new ResizeObserver(meet);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [vakVlak.w, vakVlak.h]);

  const markup = useMemo(() => {
    const m = new Map<string, string>();
    for (const el of tekening.elementen) {
      const beeld = beeldVan(el, tekening.naam, opgelost, tekstVan);
      // Een "vaste" vorm is rauwe SVG uit het blad, en dat kan van iemand anders komen.
      m.set(el.id, el.soort === "vast" ? schoonSvgDeel(beeld) : beeld);
    }
    return m;
  }, [tekening.elementen, tekening.naam, opgelost, tekstVan]);

  const snaps = useMemo(() => snapset(tekening, opgelost), [tekening, opgelost]);

  // De kaders om de selectie, van wat er werkelijk getekend staat.
  useLayoutEffect(() => {
    const uit: typeof kaders = [];
    for (const id of gekozen) {
      const b = svgRef.current?.querySelector<SVGGraphicsElement>(`[data-vid="${id}"] > .tk-beeld`)?.getBBox();
      if (b && (b.width > 0 || b.height > 0)) uit.push({ id, x: b.x, y: b.y, width: b.width, height: b.height });
    }
    setKaders(uit);
  }, [gekozen, markup]);

  const naarTekening = (e: { clientX: number; clientY: number }): Punt => {
    const m = svgRef.current?.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  };

  /**
   * Het punt waar de muis heen wijst: eerst een snappunt van een vorm (Alt:
   * niet), dan het raster; vanaf `basis` met Shift onder 45°, met ortho
   * horizontaal of verticaal.
   */
  const zoek = (
    ruw: Punt,
    e: { altKey: boolean; shiftKey: boolean },
    o: { uitsluiten?: string[]; basis?: Punt | null } = {},
  ): { p: Punt; snap: SnapPunt | null } => {
    if (raster.object && !e.altKey) {
      const s = zoekSnap(snaps, ruw, 10 / schaal, o.uitsluiten);
      if (s) return { p: { x: rond(s.x), y: rond(s.y) }, snap: s };
    }
    let p = { x: rond(ruw.x), y: rond(ruw.y) };
    if (raster.snap && !e.altKey) {
      const g = raster.maat;
      p = { x: rond(Math.round(ruw.x / g) * g), y: rond(Math.round(ruw.y / g) * g) };
    }
    if (o.basis) {
      if (e.shiftKey) p = richtHoek(o.basis, p);
      else if (raster.ortho) p = ortho(o.basis, p);
    }
    return { p, snap: null };
  };

  const elementVan = (id: string): Vorm | null => {
    const el = useTeken.getState().tekening.elementen.find((e) => e.id === id);
    return el && isVorm(el) ? el : null;
  };

  /** Nieuwe vormen erbij. Bij het plaatsen van symbolen blijft het paneel op de plaatsingskeuzes. */
  const voegToe = (vormen: Vorm[], selecteer = true) => {
    if (vormen.length === 0) return;
    wijzig((tk) => ({ ...tk, elementen: [...tk.elementen, ...vormen] }));
    if (selecteer) useTeken.setState({ gekozen: [vormen[vormen.length - 1].id] });
  };

  /** Een inklemming op het uiteinde van een ligger of lijn: de arcering aan de buitenkant. */
  const hoekBijUiteinde = (p: Punt): number | null => {
    for (const el of useTeken.getState().tekening.elementen) {
      if (!isVorm(el) || !(el.soort === "lijn" || (el.soort === "symbool" && el.sym === "ligger"))) continue;
      const w = (k: string) => waardeVan(el.p[k], opgelost);
      const [x1, y1, x2, y2] = [w("x1"), w("y1"), w("x2"), w("y2")];
      const bij = (x: number, y: number) => Math.hypot(x - p.x, y - p.y) < 0.6;
      const binnen = bij(x1, y1) ? { x: x2 - x1, y: y2 - y1 } : bij(x2, y2) ? { x: x1 - x2, y: y1 - y2 } : null;
      if (binnen && Math.hypot(binnen.x, binnen.y) > 0) {
        return ((Math.round((Math.atan2(binnen.x, -binnen.y) * 180) / Math.PI) % 360) + 360) % 360;
      }
    }
    return null;
  };

  /** Een ligger op twee steunpunten met q-last en maatlijn, in één keer. */
  const zetSchema = (a: Punt, b: Punt) => {
    const [p, q] = b.x < a.x || (b.x === a.x && b.y > a.y) ? [b, a] : [a, b];
    const lijn = { x1: p.x, y1: p.y, x2: q.x, y2: q.y };
    // De maatlijn komt onder de oplegging met zijn arcering; de hulplijnen beginnen daaronder.
    const onderOplegging = 19;
    const maat = nieuweVorm("maat", { ...lijn, offset: onderOplegging + 21 }, stijl, { tekst: "L", o: { gat: String(onderOplegging + 3) } });
    const last = nieuwSymbool("qlast", lijn, stijl);
    voegToe([
      nieuwSymbool("ligger", lijn, stijl),
      nieuwSymbool("oplegging", { x: p.x, y: p.y }, stijl, { type: "scharnier" }),
      nieuwSymbool("oplegging", { x: q.x, y: q.y }, stijl, { type: "rol" }),
      maat,
      last,
    ]);
    kiesGereedschap("selecteer");
    useTeken.setState({ gekozen: [last.id], focus: last.id });
  };

  /** Een nieuw symbool van het gekozen soort op een plek. */
  const maakSymbool = (plek: Record<string, number>) => {
    const extra: Record<string, string> = { ...symbool.o };
    if (symbool.sym === "staal" || symbool.sym === "hout") extra.schaal = String(schaalTekening);
    return nieuwSymbool(symbool.sym, plek, stijl, extra);
  };

  const rondPolylijn = () => {
    if (concept?.vorm.soort !== "polylijn") return;
    const v = rondPolylijnAf(concept.vorm, false);
    if (v) voegToe([v]);
    setConcept(null);
  };

  /** Een vorm in aanbouw is klaar: een maatlijn vraagt dan nog om zijn afstand. */
  const rondConceptAf = (v: Vorm) => {
    setConcept(null);
    if (!heeftMaat(v)) return;
    if (gereedschap === "schema") return zetSchema({ x: v.p.x1.v, y: v.p.y1.v }, { x: v.p.x2.v, y: v.p.y2.v });
    if (v.soort === "maat") {
      const r = richtMaat(v, schaalTekening);
      setConcept({ vorm: { ...r, p: { ...r.p, offset: { v: MAAT_AFSTAND } } }, a: { x: r.p.x1.v, y: r.p.y1.v }, stap: 3 });
      return;
    }
    if (v.soort === "symbool") {
      const metRichting = v.sym === "qlast" || v.sym === "veren" || v.sym === "staal";
      voegToe([metRichting ? richt(v) : v], false);
      return;
    }
    voegToe([v]);
  };

  const polyBasis = (c: Concept | null): Punt | null => {
    if (c?.vorm.soort !== "polylijn") return null;
    let n = 0;
    while (c.vorm.p[`x${n + 1}`]) n++;
    return { x: c.vorm.p[`x${n - 1}`].v, y: c.vorm.p[`y${n - 1}`].v };
  };

  /** Een punt van de polylijn in aanbouw vastzetten. */
  const polyPunt = (p: Punt, shift: boolean) => {
    if (!concept) return;
    let n = 0;
    while (concept.vorm.p[`x${n + 1}`]) n++;
    const vast = bouw(concept.vorm, concept.a, p, shift);
    setConcept({ ...concept, vorm: { ...vast, p: { ...vast.p, [`x${n + 1}`]: { v: p.x }, [`y${n + 1}`]: { v: p.y } } } });
  };

  // ─── Commando's ────────────────────────────────────────────────────────────

  const wOm = (v: Vorm) => getekend(v, opgelost);

  /** De omzetting op de selectie zelf. */
  const zetOm = (om: Omzetting) => {
    wijzigVormen(useTeken.getState().gekozen, (v) => pasToe(v, om, wOm(v)));
  };

  /** Kopieën van de selectie, één per omzetting. */
  const kopieer = (oms: Omzetting[]) => {
    const vormen = gekozenVormen();
    const nieuw = oms.flatMap((om) => vormen.map((v) => metNieuwId(pasToe(v, om, wOm(v)))));
    wijzig((tk) => ({ ...tk, elementen: [...tk.elementen, ...nieuw] }));
    return nieuw;
  };

  const eindeSessie = () => {
    setSessie(null);
    setRegel("");
    setFout(null);
  };

  const startCommando = (naam: CommandoNaam) => {
    setConcept(null);
    setBoogPunten([]);
    setRegel("");
    setFout(null);
    kiesGereedschap("selecteer");
    vorigCommando.current = naam;
    const heeftSelectie = useTeken.getState().gekozen.length > 0;
    if (naam === "erase") {
      if (heeftSelectie) {
        verwijderSelectie();
        setSessie(null);
      } else setSessie({ naam, stap: "selecteer" });
      return;
    }
    setSessie(heeftSelectie ? { naam, stap: eersteStap(naam) } : { naam, stap: "selecteer" });
  };

  /** Selecteren is klaar: door naar de eerste vraag van het commando. */
  const naSelectie = (s: Sessie) => {
    if (useTeken.getState().gekozen.length === 0) return eindeSessie();
    if (s.naam === "erase") {
      verwijderSelectie();
      return eindeSessie();
    }
    setSessie({ naam: s.naam, stap: eersteStap(s.naam) });
  };

  /** Een geklikt of getypt punt binnen een commando. */
  const sessiePunt = (p: Punt) => {
    const s = sessie;
    if (!s) return;
    setRegel("");
    setFout(null);
    if (s.stap === "basis") {
      if (s.naam === "rotate") return setSessie({ ...s, stap: "hoek", basis: p });
      if (s.naam === "scale") {
        // De verste greep van de selectie is factor 1: wie hem naar een plek sleept, schaalt tot daar.
        let ref = 0;
        for (const v of gekozenVormen()) {
          for (const g of grepen(v, wOm(v))) ref = Math.max(ref, Math.hypot(g.x - p.x, g.y - p.y));
        }
        return setSessie({ ...s, stap: "factor", basis: p, ref: ref || 100 });
      }
      return setSessie({ ...s, stap: "doel", basis: p });
    }
    const oms = omzettingen(s, p);
    if (oms.length === 0) return;
    if (s.stap === "doel" && s.naam === "copy") {
      // Kopiëren herhaalt tot Esc of Enter.
      kopieer(oms);
      return;
    }
    if (s.stap === "doel" && s.naam === "mirror") return setSessie({ ...s, stap: "wissen", doel: p });
    if (s.stap === "doel" && s.naam === "array") {
      kopieer(oms);
      return eindeSessie();
    }
    zetOm(oms[0]);
    eindeSessie();
  };

  /** Getypte invoer binnen een commando. */
  const sessieInvoer = (tekst: string) => {
    const s = sessie;
    if (!s) return;
    switch (s.stap) {
      case "selecteer":
        return naSelectie(s);
      case "aantal": {
        const n = tekst ? leesGetal(tekst) : 3;
        if (n === null || n < 2) return setFout(tekst);
        setRegel("");
        return setSessie({ ...s, stap: "basis", aantal: Math.min(200, Math.round(n)) });
      }
      case "wissen": {
        if (!s.basis || !s.doel) return eindeSessie();
        const om = spiegeling(s.basis, s.doel);
        if (/^[jy]/i.test(tekst)) zetOm(om);
        else kopieer([om]);
        return eindeSessie();
      }
      case "hoek": {
        const n = leesGetal(tekst);
        if (n === null || !s.basis) return setFout(tekst);
        zetOm(draaiing(s.basis, n));
        return eindeSessie();
      }
      case "factor": {
        const n = leesGetal(tekst);
        if (n === null || n <= 0 || !s.basis) return setFout(tekst);
        zetOm(schaling(s.basis, n));
        return eindeSessie();
      }
      case "basis":
      case "doel": {
        if (!tekst) return s.naam === "copy" && s.stap === "doel" ? eindeSessie() : undefined;
        const inv = leesInvoer(tekst);
        const p = doelVan(inv, s.basis ?? { x: 0, y: 0 }, muis, raster.ortho);
        if (!p) return setFout(tekst);
        return sessiePunt({ x: rond(p.x), y: rond(p.y) });
      }
    }
  };

  /** Enter of spatie: de getypte regel uitvoeren. */
  const voerUit = () => {
    const tekst = regel.trim();
    setRegel("");
    setFout(null);
    if (concept?.stap === 3) {
      // De maatlijn op de standaardafstand, aan de kant van de muis.
      const af = concept.vorm.p.offset.v < 0 ? -MAAT_AFSTAND : MAAT_AFSTAND;
      const n = tekst ? leesGetal(tekst) : null;
      voegToe([{ ...concept.vorm, p: { ...concept.vorm.p, offset: { v: n ?? af } } }]);
      setConcept(null);
      return;
    }
    if (concept && concept.vorm.soort === "polylijn") {
      if (!tekst) return rondPolylijn();
      const b = polyBasis(concept) ?? concept.a;
      const p = doelVan(leesInvoer(tekst), b, muis, raster.ortho);
      if (!p) return setFout(tekst);
      return polyPunt({ x: rond(p.x), y: rond(p.y) }, false);
    }
    if (concept && concept.stap === 2) {
      // Een getypt eindpunt: 100,0 of een afstand.
      const p = doelVan(leesInvoer(tekst), concept.a, muis, raster.ortho);
      if (!p) return tekst ? setFout(tekst) : undefined;
      return rondConceptAf(bouw(concept.vorm, concept.a, { x: rond(p.x), y: rond(p.y) }, false));
    }
    if (sessie) return sessieInvoer(tekst);
    if (!tekst) {
      if (vorigCommando.current) startCommando(vorigCommando.current);
      return;
    }
    const naam = commandoVan(tekst);
    if (naam) return startCommando(naam);
    const g = gereedschapVan(tekst);
    if (g) return kiesGereedschap(g as Gereedschap);
    setFout(tekst);
  };

  const escape = () => {
    if (regel) return setRegel("");
    if (fout) setFout(null);
    if (sessie) return eindeSessie();
    if (concept) return setConcept(null);
    if (boogPunten.length > 0) return setBoogPunten([]);
    if (gereedschap !== "selecteer") return kiesGereedschap("selecteer");
    useTeken.setState({ gekozen: [] });
  };

  const laatsteKlikBinnen = useRef(true);
  useEffect(() => {
    const h = (e: globalThis.PointerEvent) => {
      laatsteKlikBinnen.current = !!(e.target as globalThis.Element | null)?.closest?.(".tk-venster, .ribbon-content");
    };
    window.addEventListener("pointerdown", h, true);
    return () => window.removeEventListener("pointerdown", h, true);
  }, []);

  // Ook toetsen die niet op het vlak zelf vallen, zoals na een klik op een knop in het lint.
  const toets = (e: KeyboardEvent) => {
    const doel = e.target as HTMLElement | null;
    // Typen in een veld (paneel, code, keuzelijst in het lint) start nooit een commando.
    if (doel?.closest?.("input, textarea, select, [contenteditable='true'], .cm-editor")) return;
    const actief = document.activeElement;
    const opVenster = !!actief?.closest?.(".tk-venster, .ribbon-content");
    if (actief && actief !== document.body && !opVenster) return;
    // Zonder focus (een klik op de kale achtergrond van het paneel, een knop die uitgaat) telt de
    // plek van de laatste klik: anders draait Ctrl+Z het project terug in plaats van de tekening.
    const binnen = opVenster || laatsteKlikBinnen.current;
    const ctrl = e.ctrlKey || e.metaKey;
    const k = e.key;
    const kl = k.toLowerCase();
    const sel = useTeken.getState().gekozen;
    let gedaan = true;
    if (ctrl) {
      if (!binnen) gedaan = false;
      else if (kl === "z" && !e.shiftKey) ongedaan();
      else if (kl === "y" || (kl === "z" && e.shiftKey)) opnieuw();
      else if (kl === "d") kopieerSelectie();
      else if (kl === "c" && sel.length > 0) onthoudSelectie();
      else if (kl === "x" && sel.length > 0) {
        onthoudSelectie();
        verwijderSelectie();
      } else if (kl === "v" && useTeken.getState().klembord.length > 0) plakKlembord();
      else if (kl === "a") useTeken.setState((s) => ({ gekozen: s.tekening.elementen.map((el) => el.id) }));
      else gedaan = false;
    } else if (e.altKey) gedaan = false;
    else if (k === "Delete") verwijderSelectie();
    else if (k === "Escape") escape();
    else if (k === "Enter" || k === " ") voerUit();
    else if (k === "Backspace") {
      if (regel) setRegel((r) => r.slice(0, -1));
      else gedaan = false;
    } else if (k === "F8") zetRaster({ ortho: !raster.ortho });
    else if (k.startsWith("Arrow") && sel.length > 0) {
      const stap = e.shiftKey ? raster.maat : 1;
      const dx = k === "ArrowLeft" ? -stap : k === "ArrowRight" ? stap : 0;
      const dy = k === "ArrowUp" ? -stap : k === "ArrowDown" ? stap : 0;
      wijzigVormen(sel, (v) => verschuif(v, dx, dy), `pijltje-${sel.join(",")}`);
    } else if (k.length === 1) {
      // Tijdens het plaatsen van een symbool: R draait en F spiegelt het voorbeeld.
      if (gereedschap === "symbool" && !regel && (kl === "r" || kl === "f")) {
        useTeken.setState((s) => ({
          symbool: { ...s.symbool, o: kl === "r" ? draaiKeuze(s.symbool.sym, s.symbool.o) : spiegelKeuze(s.symbool.sym, s.symbool.o) },
        }));
      } else {
        setFout(null);
        setRegel((r) => r + k);
      }
    } else gedaan = false;
    if (gedaan) {
      e.preventDefault();
      // De sneltoetsen van de app (Ctrl+Z op het blad) horen dit niet.
      e.stopPropagation();
    }
  };
  const toetsRef = useRef(toets);
  toetsRef.current = toets;
  useEffect(() => {
    const h = (e: KeyboardEvent) => toetsRef.current(e);
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, []);

  // Een commando uit het lint.
  const vorigNr = useRef(commando?.nr);
  useEffect(() => {
    if (commando && commando.nr !== vorigNr.current) {
      vorigNr.current = commando.nr;
      startCommando(commando.naam);
      vlakRef.current?.focus({ preventScroll: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commando?.nr]);

  // Een ander gereedschap: de vorm in aanbouw vervalt (een polylijn wordt eerst afgerond).
  const vorigGereedschap = useRef(gereedschap);
  useEffect(() => {
    if (vorigGereedschap.current !== gereedschap) {
      vorigGereedschap.current = gereedschap;
      if (concept?.vorm.soort === "polylijn") rondPolylijn();
      else setConcept(null);
      setBoogPunten([]);
      laatstePlek.current = null;
      if (gereedschap !== "selecteer") eindeSessie();
      vlakRef.current?.focus({ preventScroll: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gereedschap]);

  // ─── Muis ──────────────────────────────────────────────────────────────────

  /** Waarvandaan ortho en Shift richten voor de vorm in aanbouw. */
  const conceptBasis = (): Punt | null => {
    if (sessie) return sessie.basis ?? null;
    if (concept?.vorm.soort === "polylijn") return polyBasis(concept);
    if (concept && lijnachtig(gereedschap, symbool.sym, symbool.o)) return concept.a;
    if (gereedschap === "boog" && boogPunten.length > 0) return boogPunten[boogPunten.length - 1];
    if (plaatsing === "punt") return laatstePlek.current;
    return null;
  };

  const omlaag = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return;
    vlakRef.current?.focus({ preventScroll: true });
    const ruw = naarTekening(e);
    const doel = e.target as globalThis.Element;

    // Een commando dat om een punt vraagt.
    if (sessie && sessie.stap !== "selecteer") {
      if (sessie.stap === "aantal" || sessie.stap === "wissen") return;
      sessiePunt(zoek(ruw, e, { basis: sessie.basis ?? null }).p);
      return;
    }

    if (gereedschap === "selecteer") {
      const alleenKiezen = !!sessie;
      const st = useTeken.getState();
      const greep = doel.closest?.("[data-greep]") as SVGElement | null;
      if (greep && st.gekozen.length === 1 && !sessie) {
        const v = elementVan(st.gekozen[0]);
        if (v) {
          const k = greep.dataset.greep!;
          const w = wOm(v);
          // Het andere eind van een lijn: daarvandaan richten Shift en ortho.
          const ander = k === "1" ? "2" : k === "2" ? "1" : null;
          const lijnGreep = ander && v.soort !== "boog" && !(v.soort === "symbool" && plaatsingVan(v) === "vak");
          const basis = lijnGreep ? { x: w(`x${ander}`), y: w(`y${ander}`) } : null;
          sleep.current = { soort: "greep", id: v.id, k, vorm: v, sleutel: `greep-${v.id}-${Date.now()}`, basis };
          svgRef.current?.setPointerCapture(e.pointerId);
        }
        return;
      }
      const raak = (doel.closest?.("[data-vid]") as SVGElement | null)?.dataset.vid ?? null;
      if (raak) {
        if (e.shiftKey || alleenKiezen) {
          // Erbij of eraf.
          useTeken.setState((s) => ({
            gekozen: s.gekozen.includes(raak) ? s.gekozen.filter((id) => id !== raak) : [...s.gekozen, raak],
          }));
          return;
        }
        const nieuw = st.gekozen.includes(raak) ? st.gekozen : [raak];
        useTeken.setState({ gekozen: nieuw });
        const vormen = nieuw.map(elementVan).filter((v): v is Vorm => !!v);
        const eigen = elementVan(raak);
        if (eigen && vormen.length > 0) {
          // Het eerste greeppunt (de plaats van een symbool) snapt; de rest schuift mee.
          const g0 = grepen(eigen, wOm(eigen))[0];
          const anker = g0 ? { x: g0.x, y: g0.y } : ruw;
          sleep.current = { soort: "verplaats", vormen, anker, greep: { x: ruw.x - anker.x, y: ruw.y - anker.y }, sleutel: `verplaats-${Date.now()}` };
          svgRef.current?.setPointerCapture(e.pointerId);
        }
        return;
      }
      // Op een leeg stuk: een selectiekader.
      sleep.current = { soort: "kader", a: ruw, erbij: e.shiftKey || alleenKiezen };
      setSelKader({ a: ruw, b: ruw });
      svgRef.current?.setPointerCapture(e.pointerId);
      return;
    }

    const { p } = zoek(ruw, e, { basis: conceptBasis() });

    if (gereedschap === "tekst") {
      const v = nieuweVorm("tekst", { x: p.x, y: p.y }, stijl, { tekst: t("vlak.standaardTekst"), anker: "start" });
      voegToe([v]);
      useTeken.setState({ focus: v.id });
      kiesGereedschap("selecteer");
      useTeken.setState({ gekozen: [v.id] });
      return;
    }

    if (gereedschap === "boog") {
      const punten = [...boogPunten, p];
      if (punten.length < 3) return setBoogPunten(punten);
      setBoogPunten([]);
      const b = boogDoor(punten[0], punten[1], punten[2]);
      if (b) voegToe([nieuweVorm("boog", b, stijl)]);
      return;
    }

    if (gereedschap === "symbool" && plaatsing === "punt") {
      const v = maakSymbool({ x: p.x, y: p.y });
      if (symbool.sym === "oplegging" && v.o?.type === "inklemming") {
        const hoek = hoekBijUiteinde(p);
        if (hoek !== null) v.o = { ...v.o, hoek: String(hoek) };
      }
      voegToe([v], false);
      laatstePlek.current = p;
      return;
    }

    if (gereedschap === "polylijn") {
      if (concept) {
        const eerste = { x: concept.vorm.p.x0.v, y: concept.vorm.p.y0.v };
        let n = 0;
        while (concept.vorm.p[`x${n + 1}`]) n++;
        const dichtbij = Math.hypot(p.x - eerste.x, p.y - eerste.y) * schaal < 8;
        if (dichtbij && n >= 3) {
          const v = rondPolylijnAf(concept.vorm, true);
          if (v) voegToe([v]);
          setConcept(null);
          return;
        }
        polyPunt(p, e.shiftKey);
      } else {
        setConcept({ vorm: nieuweVorm("polylijn", { x0: p.x, y0: p.y, x1: p.x, y1: p.y }, stijl), a: p, stap: 2 });
      }
      return;
    }

    // Een vorm in aanbouw wacht op de loslaat van zijn tweede of derde klik.
    if (concept) return;

    let vorm: Vorm;
    if (gereedschap === "symbool" || gereedschap === "schema") {
      const sym = gereedschap === "schema" ? "ligger" : symbool.sym;
      const plek: Record<string, number> =
        plaatsing === "vak" ? { x: p.x, y: p.y, w: 0, h: 0 } : { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      vorm = gereedschap === "schema" || sym === "ligger" ? nieuwSymbool("ligger", plek, stijl) : maakSymbool(plek);
    } else {
      const soort = gereedschap as "lijn" | "pijl" | "maat" | "rechthoek" | "cirkel";
      const start: Record<string, number> =
        soort === "rechthoek" ? { x: p.x, y: p.y, w: 0, h: 0 }
        : soort === "cirkel" ? { cx: p.x, cy: p.y, r: 0 }
        : { x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      vorm = nieuweVorm(soort, start, stijl, soort === "maat" ? { tekst: "" } : {});
    }
    setConcept({ vorm, a: p, stap: 1 });
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const beweeg = (e: PointerEvent<SVGSVGElement>) => {
    const ruw = naarTekening(e);
    const s = sleep.current;
    if (s?.soort === "kader") {
      setSelKader({ a: s.a, b: ruw });
      return;
    }
    if (s?.soort === "verplaats") {
      const ids = s.vormen.map((v) => v.id);
      const { p, snap } = zoek({ x: ruw.x - s.greep.x, y: ruw.y - s.greep.y }, e, { uitsluiten: ids });
      setMuis(p);
      setSnapNu(snap);
      const dx = rond(p.x - s.anker.x), dy = rond(p.y - s.anker.y);
      wijzig((tk) => ({
        ...tk,
        elementen: tk.elementen.map((el) => {
          const v = s.vormen.find((o) => o.id === el.id);
          return v ? verschuif(v, dx, dy) : el;
        }),
      }), s.sleutel);
      return;
    }
    if (s?.soort === "greep") {
      const { p, snap } = zoek(ruw, e, { uitsluiten: [s.id], basis: s.basis });
      setMuis(p);
      setSnapNu(snap);
      const w = wOm(s.vorm);
      wijzigVormen([s.id], () => sleepGreep(s.vorm, s.k, p.x, p.y, w), s.sleutel);
      return;
    }
    const { p, snap } = zoek(ruw, e, { basis: conceptBasis() });
    setMuis(p);
    setSnapNu(gereedschap === "selecteer" && !sessie ? null : snap);
    if (concept?.stap === 3) {
      // De kant en de afstand van de maatlijn: loodrecht op de maat, tot de muis.
      const c = concept.vorm;
      const w = (k: string) => c.p[k]?.v ?? 0;
      const n = maatNormaal(w);
      const af = rond((p.x - w("x1")) * n.x + (p.y - w("y1")) * n.y);
      setConcept({ ...concept, vorm: { ...c, p: { ...c.p, offset: { v: af } } } });
    } else if (concept) {
      setConcept({ ...concept, vorm: bouw(concept.vorm, concept.a, p, e.shiftKey) });
    }
  };

  /** Het selectiekader loslaten: van links naar rechts alles erin, van rechts naar links ook wat het raakt. */
  const rondKaderAf = (s: Extract<Sleep, { soort: "kader" }>, b: Punt) => {
    setSelKader(null);
    const klein = Math.hypot(b.x - s.a.x, b.y - s.a.y) * schaal < 3;
    if (klein) {
      if (!s.erbij) useTeken.setState({ gekozen: [] });
      return;
    }
    const x0 = Math.min(s.a.x, b.x), x1 = Math.max(s.a.x, b.x);
    const y0 = Math.min(s.a.y, b.y), y1 = Math.max(s.a.y, b.y);
    const heelErin = b.x >= s.a.x;
    const treffers = useTeken.getState().tekening.elementen
      .filter((el) => {
        const r = svgRef.current?.querySelector<SVGGraphicsElement>(`[data-vid="${el.id}"] > .tk-beeld`)?.getBBox();
        if (!r) return false;
        return heelErin
          ? r.x >= x0 && r.y >= y0 && r.x + r.width <= x1 && r.y + r.height <= y1
          : !(r.x > x1 || r.x + r.width < x0 || r.y > y1 || r.y + r.height < y0);
      })
      .map((el) => el.id);
    useTeken.setState((st) => ({ gekozen: s.erbij ? [...new Set([...st.gekozen, ...treffers])] : treffers }));
  };

  const omhoog = (e: PointerEvent<SVGSVGElement>) => {
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
    const s = sleep.current;
    if (s) {
      sleep.current = null;
      if (s.soort === "kader") return rondKaderAf(s, naarTekening(e));
      useTeken.setState({ laatste: null });
      setSnapNu(null);
      return;
    }
    if (!concept || concept.vorm.soort === "polylijn") return;
    if (concept.stap === 3) {
      voegToe([concept.vorm]);
      setConcept(null);
      return;
    }
    const { p } = zoek(naarTekening(e), e, { basis: conceptBasis() });
    const v = bouw(concept.vorm, concept.a, p, e.shiftKey);
    // Een klik zonder slepen: het eerste punt staat, de volgende klik maakt het af.
    if (concept.stap === 1 && Math.hypot(p.x - concept.a.x, p.y - concept.a.y) * schaal < 4) {
      setConcept({ ...concept, vorm: v, stap: 2 });
      return;
    }
    rondConceptAf(v);
  };

  // Het voorbeeld onder de muis: een symbool dat met één klik komt, of de boog in wording.
  const voorbeeld = useMemo(() => {
    if (!muis) return null;
    if (gereedschap === "symbool" && plaatsing === "punt" && !concept) {
      return beeldVan(maakSymbool({ x: muis.x, y: muis.y }), tekening.naam, opgelost);
    }
    if (gereedschap === "boog" && boogPunten.length > 0) {
      const lijnStijl = `stroke:${stijl.lijn}; stroke-width:${stijl.dikte}; fill:none`;
      if (boogPunten.length === 1) {
        const a = boogPunten[0];
        return `<line x1="${a.x}" y1="${a.y}" x2="${muis.x}" y2="${muis.y}" style="${lijnStijl}; stroke-dasharray:4 3"/>`;
      }
      const b = boogDoor(boogPunten[0], boogPunten[1], muis);
      if (!b) return null;
      return beeldVan(nieuweVorm("boog", b, stijl), tekening.naam, opgelost);
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [muis, gereedschap, symbool, plaatsing, concept, boogPunten, stijl, schaalTekening, tekening.naam, opgelost]);

  // Het voorbeeld van een lopend commando: de selectie op de plek waar hij terechtkomt.
  const sessieBeeld = useMemo(() => {
    if (!sessie || !muis) return "";
    const oms = omzettingen(sessie, muis);
    if (oms.length === 0) return "";
    const vormen = gekozenVormen();
    return oms.flatMap((om) => vormen.map((v) => beeldVan(pasToe(v, om, wOm(v)), tekening.naam, opgelost))).join("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessie, muis, gekozen, tekening, opgelost]);

  const eenGekozen = gekozen.length === 1 ? tekening.elementen.find((e) => e.id === gekozen[0]) : undefined;
  const hg = 4.5 / schaal;
  const raakBreed = 10 / schaal;
  const g = raster.maat;
  const cursor = sessie || gereedschap !== "selecteer" ? (gereedschap === "tekst" ? "text" : "crosshair") : "default";
  const hint =
    concept?.stap === 3 ? "maatAfstand"
    : concept?.vorm.soort === "polylijn" ? "polylijnBezig"
    : concept?.stap === 2 ? "tweedePunt"
    : gereedschap === "boog" && boogPunten.length > 0 ? `boogBezig${boogPunten.length}`
    : gereedschap === "symbool" ? `symbool_${plaatsing ?? "punt"}`
    : gereedschap;
  const vraag =
    fout !== null ? t("cmd.onbekend", { tekst: fout })
    : sessie ? (sessie.stap === "selecteer" ? t("cmd.selecteer") : t(`cmd.${sessie.naam}.${sessie.stap}`))
    : t("cmd.leeg");

  return (
    <div className="tk-vlak" ref={vlakRef} tabIndex={0}>
      <svg
        ref={svgRef}
        className="tk-svg"
        data-oa-theme="light"
        viewBox={`${vakVlak.x} ${vakVlak.y} ${vakVlak.w} ${vakVlak.h}`}
        preserveAspectRatio="xMidYMid meet"
        style={{ cursor }}
        onPointerDown={omlaag}
        onPointerMove={beweeg}
        onPointerUp={omhoog}
        onPointerLeave={() => {
          setMuis(null);
          setSnapNu(null);
        }}
        onDoubleClick={() => concept?.vorm.soort === "polylijn" && rondPolylijn()}
        onContextMenu={(e) => {
          // Rechtermuis: hetzelfde als Enter.
          e.preventDefault();
          if (sessie || concept) voerUit();
        }}
      >
        <defs>
          <pattern id="tk-raster-fijn" width={g} height={g} patternUnits="userSpaceOnUse" x={tekening.x0} y={tekening.y0}>
            <path d={`M ${g} 0 L 0 0 0 ${g}`} className="tk-raster-lijn" strokeWidth={0.6 / schaal} />
          </pattern>
          <pattern id="tk-raster-grof" width={g * 5} height={g * 5} patternUnits="userSpaceOnUse" x={tekening.x0} y={tekening.y0}>
            <rect width={g * 5} height={g * 5} fill="url(#tk-raster-fijn)" />
            <path d={`M ${g * 5} 0 L 0 0 0 ${g * 5}`} className="tk-raster-lijn grof" strokeWidth={0.8 / schaal} />
          </pattern>
        </defs>
        <rect className="tk-papier" x={tekening.x0} y={tekening.y0} width={W} height={H} strokeWidth={1 / schaal} />
        {raster.toon && <rect x={tekening.x0} y={tekening.y0} width={W} height={H} fill="url(#tk-raster-grof)" pointerEvents="none" />}

        {tekening.elementen.map((el) => {
          const vlak = el.soort === "tekst" || el.soort === "vast" || (el.soort === "symbool" && plaatsingVan(el) !== "lijn");
          return (
            <g key={el.id} data-vid={el.id} className={`tk-el${vlak ? " tk-el-vlak" : ""}`}>
              <g className="tk-beeld" dangerouslySetInnerHTML={{ __html: markup.get(el.id) ?? "" }} />
              {isVorm(el) && <Raak v={el} opgelost={opgelost} breed={raakBreed} />}
            </g>
          );
        })}

        {concept && (
          <g className="tk-concept" pointerEvents="none" dangerouslySetInnerHTML={{ __html: beeldVan(concept.vorm, tekening.naam, opgelost) }} />
        )}
        {voorbeeld && <g className="tk-concept" pointerEvents="none" dangerouslySetInnerHTML={{ __html: voorbeeld }} />}
        {sessieBeeld && <g className="tk-concept" pointerEvents="none" dangerouslySetInnerHTML={{ __html: sessieBeeld }} />}
        {sessie?.basis && muis && (
          <line className="tk-hulplijn" x1={sessie.basis.x} y1={sessie.basis.y} x2={muis.x} y2={muis.y}
            strokeWidth={1 / schaal} strokeDasharray={`${4 / schaal} ${3 / schaal}`} pointerEvents="none" />
        )}
        {boogPunten.map((p, i) => (
          <circle key={i} className="tk-boogpunt" cx={p.x} cy={p.y} r={2.5 / schaal} strokeWidth={1 / schaal} pointerEvents="none" />
        ))}
        {sessie?.basis && (
          <circle className="tk-boogpunt" cx={sessie.basis.x} cy={sessie.basis.y} r={2.5 / schaal} strokeWidth={1 / schaal} pointerEvents="none" />
        )}

        {kaders.map((kader) => (
          <rect
            key={kader.id}
            className="tk-kader"
            x={kader.x - 3 / schaal}
            y={kader.y - 3 / schaal}
            width={kader.width + 6 / schaal}
            height={kader.height + 6 / schaal}
            strokeWidth={1 / schaal}
            strokeDasharray={`${4 / schaal} ${3 / schaal}`}
            pointerEvents="none"
          />
        ))}
        {selKader && (
          <rect
            className={`tk-selkader${selKader.b.x < selKader.a.x ? " raakt" : ""}`}
            x={Math.min(selKader.a.x, selKader.b.x)}
            y={Math.min(selKader.a.y, selKader.b.y)}
            width={Math.abs(selKader.b.x - selKader.a.x)}
            height={Math.abs(selKader.b.y - selKader.a.y)}
            strokeWidth={1 / schaal}
            pointerEvents="none"
          />
        )}
        {eenGekozen && isVorm(eenGekozen) && gereedschap === "selecteer" && !sessie &&
          grepen(eenGekozen, wOm(eenGekozen)).map((gr) => (
            <rect
              key={gr.k}
              data-greep={gr.k}
              className={`tk-greep${gr.vast ? " vast" : ""}`}
              x={gr.x - hg}
              y={gr.y - hg}
              width={2 * hg}
              height={2 * hg}
              rx={gr.vast ? hg : 0}
              strokeWidth={1.2 / schaal}
            >
              <title>{gr.vast ? t("vlak.greepVast") : t("vlak.greep")}</title>
            </rect>
          ))}
        {snapNu && <SnapTeken p={snapNu} s={schaal} />}
      </svg>
      <div className={`tk-cmd${sessie ? " bezig" : ""}${fout !== null ? " fout" : ""}`}>
        <span className="tk-cmd-vraag">{vraag}</span>
        <span className="tk-cmd-regel">{regel}<i className="tk-cmd-cursor" /></span>
      </div>
      <div className="tk-vlak-status">
        <span className="tk-coord">{muis ? `x ${kernGetal(muis.x)} · y ${kernGetal(muis.y)} px` : ""}</span>
        {snapNu && <span className="tk-snapnaam">{t(`snap.${snapNu.soort}`)}</span>}
        {raster.ortho && <span className="tk-snapnaam">{t("lint.ortho")}</span>}
        {gekozen.length > 1 && <span className="tk-snapnaam">{t("vlak.gekozen", { aantal: gekozen.length })}</span>}
        <span className="tk-hint">{t(`hint.${hint}`)}</span>
      </div>
    </div>
  );
}

/** Het teken van een snappunt: vierkant (eindpunt), driehoek (midden), cirkel (middelpunt), zandloper (op de lijn). */
function SnapTeken({ p, s }: { p: SnapPunt; s: number }) {
  const r = 5 / s;
  const props = { className: "tk-snap", strokeWidth: 1.4 / s, pointerEvents: "none" as const };
  switch (p.soort) {
    case "eind":
      return <rect x={p.x - r} y={p.y - r} width={2 * r} height={2 * r} {...props} />;
    case "midden":
      return <polygon points={`${p.x},${p.y - r * 1.2} ${p.x - r * 1.1},${p.y + r * 0.8} ${p.x + r * 1.1},${p.y + r * 0.8}`} {...props} />;
    case "centrum":
      return <circle cx={p.x} cy={p.y} r={r} {...props} />;
    default:
      return <polygon points={`${p.x - r},${p.y - r} ${p.x + r},${p.y - r} ${p.x - r},${p.y + r} ${p.x + r},${p.y + r}`} {...props} />;
  }
}

/** Een onzichtbare, brede rand om een vorm, zodat een dunne lijn goed te raken is. */
function Raak({ v, opgelost, breed }: { v: Vorm; opgelost: Opgelost; breed: number }) {
  const w = getekend(v, opgelost);
  const props = { className: "tk-raak", strokeWidth: breed, fill: v.vulling ? "transparent" : "none" };
  switch (v.soort) {
    case "lijn":
    case "pijl":
      return <line x1={w("x1")} y1={w("y1")} x2={w("x2")} y2={w("y2")} {...props} />;
    case "maat": {
      // De maatlijn zelf, op zijn afstand.
      const n = maatNormaal(w);
      const af = v.p.offset ? w("offset") : 0;
      return <line x1={w("x1") + n.x * af} y1={w("y1") + n.y * af} x2={w("x2") + n.x * af} y2={w("y2") + n.y * af} {...props} />;
    }
    case "rechthoek":
      return <rect x={w("x")} y={w("y")} width={Math.max(0, w("w"))} height={Math.max(0, w("h"))} {...props} />;
    case "cirkel":
      return <circle cx={w("cx")} cy={w("cy")} r={Math.max(0, w("r"))} {...props} />;
    case "polylijn": {
      const punten: string[] = [];
      for (let i = 0; v.p[`x${i}`]; i++) punten.push(`${w(`x${i}`)},${w(`y${i}`)}`);
      return v.gesloten ? <polygon points={punten.join(" ")} {...props} /> : <polyline points={punten.join(" ")} {...props} />;
    }
    case "boog": {
      const a1 = w("a1"), a2 = boogEind(a1, w("a2"));
      const p1 = opCirkel(w("cx"), w("cy"), w("r"), a1);
      const p2 = opCirkel(w("cx"), w("cy"), w("r"), a2);
      return <path d={`M ${p1.x} ${p1.y} A ${w("r")} ${w("r")} 0 ${a2 - a1 > 180 ? 1 : 0} 1 ${p2.x} ${p2.y}`} {...props} fill="none" />;
    }
    case "symbool":
      if (plaatsingVan(v) !== "lijn") return null;
      return <line x1={w("x1")} y1={w("y1")} x2={w("x2")} y2={w("y2")} {...props} fill="none" />;
    default:
      return null;
  }
}
