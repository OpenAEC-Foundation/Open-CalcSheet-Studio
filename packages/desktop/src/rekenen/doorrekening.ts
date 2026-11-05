/**
 * Doorrekenen van het blad dat openstaat, in een worker in plaats van op de
 * UI-thread.
 *
 * De uitwerking en het parametrische beeld vragen allebei om de doorrekening
 * van hetzelfde blad met dezelfde invoer. Ze delen één berekening: gelijke
 * verzoeken hebben dezelfde sleutel. De worker rekent er één tegelijk; komen
 * er tijdens het rekenen nieuwe binnen (typen, lintknoppen), dan telt alleen
 * de laatste. Tot de nieuwe uitkomst er is, blijft de vorige van hetzelfde
 * blad staan, zodat het beeld niet leeg flitst.
 *
 * De afdruk rekent niet via dit pad: daar moet elk blad klaar zijn voordat er
 * papier uit komt (bladResultaat.ts, bladDoorrekenen.ts).
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import i18next from "i18next";
import type { AngleMode } from "@ifc-calc/core";
import type { BladUitkomst, Resultaat } from "../components/calc/bladLezen";
import type { CanvasUitwerking } from "../components/calc/canvasRekenen";
import { rekentaalIncludes, rekentaalImageUrls } from "../templates/rekentaal-includes";

export interface RekenVerzoek {
  sleutel: string;
  source: string;
  waarden: Record<string, string>;
  scope: Record<string, unknown>;
  naam: string;
  hoekmodus: string;
  /** De taal van de uitvoer: de taal van de app (templates/vertalingen.ts). */
  taal?: string;
  includes: [string, string][];
  imageUrls: [string, string][];
}

export interface RekenAntwoord {
  sleutel: string;
  html: string;
  /** Bij een canvas-blad: de uitwerking per eenheid (components/calc/canvasRekenen.ts). */
  eenheden?: CanvasUitwerking[];
  uitkomst: BladUitkomst | null;
}

export interface Doorrekening {
  html: string;
  eenheden?: CanvasUitwerking[];
  uitkomst: BladUitkomst | null;
}

/** Zoveel uitkomsten blijven bewaard, voor heen en weer wisselen tussen bladen. */
const BEWAARD = 12;

let hoekmodus: AngleMode = "deg";
let worker: Worker | null = null;
let bezig: RekenVerzoek | null = null;
let wachtend: RekenVerzoek | null = null;
const uitkomsten = new Map<string, Doorrekening>();
/** De laatst bekende uitkomst per blad, voor de UC in de projectboom. */
const perBlad = new Map<string, Resultaat>();
const luisteraars = new Set<() => void>();

function meld() {
  for (const l of luisteraars) l();
}

/** Start de worker alvast, zodat het eerste blad niet ook nog op de rekenkern hoeft te wachten. */
export function warmRekenWorker() {
  deWorker();
}

function deWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./rekenWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<RekenAntwoord>) => {
      const { sleutel, html, eenheden, uitkomst } = e.data;
      uitkomsten.set(sleutel, { html, eenheden, uitkomst });
      while (uitkomsten.size > BEWAARD) uitkomsten.delete(uitkomsten.keys().next().value!);
      bezig = null;
      const volgende = wachtend;
      wachtend = null;
      if (volgende && !uitkomsten.has(volgende.sleutel)) stuur(volgende);
      meld();
    };
  }
  return worker;
}

function stuur(v: RekenVerzoek) {
  bezig = v;
  deWorker().postMessage(v);
}

function vraag(v: RekenVerzoek) {
  if (uitkomsten.has(v.sleutel) || bezig?.sleutel === v.sleutel) return;
  if (bezig) wachtend = v;
  else stuur(v);
}

/**
 * Hoeken in graden, radialen of gon, voor de UI-thread én de worker. Een andere
 * stand maakt alle bewaarde uitkomsten ongeldig.
 */
export function zetHoekmodus(mode: AngleMode) {
  // De rekenkern op de UI-thread laadt los van het eerste scherm. Wat hem gebruikt, draait
  // pas nadat dit is uitgevoerd: die import lost op zodra de kern er is, vóór het volgende
  // tekenen of verzoek.
  void import("@ifc-calc/core").then((kern) => kern.setAngleMode(mode));
  if (mode === hoekmodus) return;
  hoekmodus = mode;
  uitkomsten.clear();
  meld();
}

function abonneer(l: () => void) {
  luisteraars.add(l);
  return () => {
    luisteraars.delete(l);
  };
}

/**
 * Waar een doorrekening van afhangt, als één tekst. De invoegsels van de rekentaal staan
 * er niet bij: die veranderen niet zolang de app draait.
 */
export function rekenSleutel(
  taal: string,
  naam: string,
  scope: Record<string, unknown>,
  waarden: Record<string, string>,
  source: string,
): string {
  return [hoekmodus, taal, naam, JSON.stringify(scope), JSON.stringify(waarden), source].join("\u0000");
}

/** Wat de worker voor deze sleutel al uitrekende, voor de afdruk (bladDoorrekenen.ts). */
export function bewaardeDoorrekening(sleutel: string): Doorrekening | null {
  return uitkomsten.get(sleutel) ?? null;
}

/**
 * De UC en het oordeel van een blad, zodra het in deze sessie is doorgerekend;
 * tot dan null. Rekent zelf niets: de projectboom laat alleen zien wat de
 * werkruimte al uitrekende.
 */
export function useBladResultaat(blad: string): Resultaat | null {
  return useSyncExternalStore(abonneer, () => perBlad.get(blad) ?? null);
}

/**
 * De doorrekening van een blad, met `bezig` zolang de uitkomst voor deze
 * invoer er nog niet is. `blad` (het id) bepaalt of de vorige uitkomst mag
 * blijven staan: alleen van hetzelfde blad, nooit van een ander.
 */
export function useDoorrekening(
  blad: string | undefined,
  source: string,
  waarden: Record<string, string>,
  scope: Record<string, unknown>,
  naam: string,
): { doorrekening: Doorrekening | null; bezig: boolean } {
  // Elke render opnieuw: de hoekmodus is geen React-toestand, en een wissel
  // ervan moet een nieuwe sleutel geven (zetHoekmodus meldt de wissel). Zo ook de
  // taal: de uitvoer volgt de app, en wie deze hook gebruikt, tekent bij een
  // taalwissel opnieuw (useTranslation in de uitwerking en in het beeld).
  const taal = i18next.language ?? "";
  const sleutel = rekenSleutel(taal, naam, scope, waarden, source);
  const hier = useSyncExternalStore(abonneer, () => uitkomsten.get(sleutel) ?? null);

  useEffect(() => {
    if (!source.trim()) return;
    vraag({
      sleutel, source, waarden, scope, naam, hoekmodus, taal,
      includes: [...rekentaalIncludes], imageUrls: [...rekentaalImageUrls],
    });
  }, [sleutel, source, waarden, scope, naam, taal]);

  const resultaat = hier?.uitkomst?.resultaat;
  useEffect(() => {
    if (!blad || !resultaat || perBlad.get(blad) === resultaat) return;
    perBlad.set(blad, resultaat);
    meld();
  }, [blad, resultaat]);

  const vorige = useRef<{ blad: string | undefined; d: Doorrekening } | null>(null);
  if (hier) vorige.current = { blad, d: hier };
  const terugval = vorige.current && vorige.current.blad === blad ? vorige.current.d : null;
  return { doorrekening: hier ?? terugval, bezig: !hier };
}
