/**
 * Een canvas-blad: formules als losse eenheden vrij op een vel, in plaats van
 * onder elkaar in één tekst. Doorgerekend wordt op positie: van boven naar
 * beneden, bij gelijke hoogte van links naar rechts. Een variabele bestaat voor
 * alles wat lager staat.
 *
 * Een canvas-blad is een gewoon exemplaar (store/projectStore.ts) met
 * `templateId` CANVAS_BLAD en gewone rekentekst in `source`: per eenheid een
 * merkteken met de positie, daarna zijn tekst, in de volgorde van doorrekenen.
 *
 *   //@eenheid id=e1 x=10 y=15
 *   a = 2 m
 *
 *   //@eenheid id=e2 x=60 y=15
 *   b = a*3
 *
 * Het merkteken is voor de rekentaal commentaar. Zo blijven projectbestand,
 * IFCX en API werken zoals bij elk rekenblad, en leest een lezer zonder
 * canvas-blad gewoon een rekenblad met dezelfde uitkomsten.
 *
 * Puur en zonder React of de rekenkern: de rekenworker en de controlescripts
 * laden dit bestand rechtstreeks. Het doorrekenen staat in
 * components/calc/canvasRekenen.ts.
 */
import { INHOUD } from "../components/calc/paginering.ts";

/** `templateId` van een canvas-blad. Geen module: er is geen sjabloon met deze naam. */
export const CANVAS_BLAD = "canvas";

/** Begin van het merkteken: een commentaarregel voor de rekentaal. */
export const EENHEID_MERK = "//@eenheid";

/** Het raster om op uit te lijnen, in millimeter. */
export const RASTER_MM = 5;

/** De breedte om op te plaatsen: de bladspiegel van een A4. */
export const VEL_BREEDTE = INHOUD.breedte;

/*
 * De hoogte van een vel om op te plaatsen, in millimeter. Op de vouwen valt ook
 * een rasterlijn. Het passen zit in de ruimte: een vel is hoogstens zo hoog als
 * de vulhoogte van de losse bladen (249 mm), en het rapport heeft meer. Het
 * eerste vel is lager, want daar staat de kop van het blad boven.
 */
export const VEL_HOOGTE = 245;
export const EERSTE_VEL = 220;

/** Eén eenheid op het canvas; x en y in millimeter vanaf de linkerbovenhoek. */
export interface Eenheid {
  id: string;
  x: number;
  y: number;
  /** De rekentekst, zonder lege regels eromheen. */
  tekst: string;
}

/** Is dit blad een canvas-blad? */
export function isCanvasBlad(ex: { templateId?: string }): boolean {
  return ex.templateId === CANVAS_BLAD;
}

const MERK_RE = /^\s*\/\/@eenheid\b(.*)$/;

/** Staat er in deze tekst minstens één eenheid? Anders is het een gewone rekentekst. */
export function heeftEenheden(bron: string): boolean {
  return /^\s*\/\/@eenheid\b/m.test(bron);
}

/** Verder dan dit staat niets op het canvas, in millimeter: ruim 200 vellen. */
const MAX_POSITIE = 50000;

/**
 * Een getal uit het merkteken; wat geen getal is of negatief, wordt 0. Een
 * uitschieter uit de API of de code mag geen duizenden lege vellen opleveren.
 */
function maat(tekst: string, naam: string): number {
  const m = tekst.match(new RegExp(`\\b${naam}=(-?[\\d.]+)`));
  const n = m ? parseFloat(m[1]) : 0;
  return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_POSITIE) : 0;
}

/** De volgorde van doorrekenen: van boven naar beneden, dan van links naar rechts. */
function opPositie(a: Eenheid, b: Eenheid): number {
  return a.y - b.y || a.x - b.x;
}

/** De eerste id die nog vrij is: `e1`, `e2`, … */
export function nieuwId(bezet: { has(id: string): boolean }): string {
  for (let n = 1; ; n++) {
    if (!bezet.has(`e${n}`)) return `e${n}`;
  }
}

/**
 * De eenheden uit een rekentekst, in de volgorde van doorrekenen. Ook wat op een
 * andere manier in de tekst kwam, leest zo: de API of de code kan de volgorde of
 * een id door elkaar halen, en tekst vóór het eerste merkteken blijft een
 * eenheid bovenaan. Een eenheid zonder tekst vervalt.
 */
export function leesEenheden(bron: string): Eenheid[] {
  const uit: { id: string; x: number; y: number; regels: string[] }[] = [];
  for (const regel of bron.split(/\r?\n/)) {
    const m = regel.match(MERK_RE);
    if (m) {
      uit.push({ id: m[1].match(/\bid=([\w-]+)/)?.[1] ?? "", x: maat(m[1], "x"), y: maat(m[1], "y"), regels: [] });
    } else {
      if (uit.length === 0) uit.push({ id: "", x: 0, y: 0, regels: [] });
      uit[uit.length - 1].regels.push(regel);
    }
  }
  const bezet = new Set<string>();
  const eenheden: Eenheid[] = [];
  for (const e of uit) {
    const tekst = e.regels.join("\n").trim();
    if (!tekst) continue;
    const id = e.id && !bezet.has(e.id) ? e.id : nieuwId({ has: (i) => bezet.has(i) || uit.some((a) => a.id === i) });
    bezet.add(id);
    eenheden.push({ id, x: e.x, y: e.y, tekst });
  }
  return eenheden.sort(opPositie);
}

/** Een getal in het merkteken: geen lange staart achter de komma. */
const inMerk = (n: number) => String(Math.round(n * 100) / 100);

/**
 * De rekentekst bij deze eenheden, in de volgorde van doorrekenen. Een merkteken
 * in de ingetypte tekst wordt gewoon commentaar: het mag de eenheid niet splitsen.
 */
export function schrijfEenheden(eenheden: Eenheid[]): string {
  return eenheden
    .map((e) => ({ ...e, tekst: e.tekst.trim() }))
    .filter((e) => e.tekst !== "")
    .sort(opPositie)
    .map((e) => {
      const tekst = e.tekst.replace(/^(\s*)\/\/@eenheid\b/gm, "$1// @eenheid");
      return `${EENHEID_MERK} id=${e.id} x=${inMerk(e.x)} y=${inMerk(e.y)}\n${tekst}`;
    })
    .join("\n\n");
}

/** Wijzigt één eenheid in de rekentekst; bestaat hij nog niet, dan komt hij erbij. */
export function zetEenheid(bron: string, id: string, deel: Partial<Omit<Eenheid, "id">>): string {
  const eenheden = leesEenheden(bron);
  const bestaat = eenheden.some((e) => e.id === id);
  return schrijfEenheden(
    bestaat
      ? eenheden.map((e) => (e.id === id ? { ...e, ...deel } : e))
      : [...eenheden, { id, x: 0, y: 0, tekst: "", ...deel }],
  );
}

/** Haalt één eenheid uit de rekentekst. */
export function verwijderEenheid(bron: string, id: string): string {
  return schrijfEenheden(leesEenheden(bron).filter((e) => e.id !== id));
}

// ── Een gewoon rekenblad op het canvas ──────────────────────────────────

/** Een kop in de rekentaal: `# 1. Invoer`; een opdracht als `#if` heeft geen spatie na de #. */
const KOP_RE = /^#+\s/;
/** Blokken van meer regels die met `@end` sluiten. */
const BLOK_START_RE = /^@(svg|select|3d|js)\b/i;
const BLOK_EIND_RE = /^@end\s*$/i;
/** Wat een nesting opent en sluit: voorwaarden, lussen en macro's. */
const OPEN_RE = /^#(if|for|repeat|while)\b/i;
const DEF_OPEN_RE = /^#def\s+[^=]*\([^)]*\)\s*$/i;
const SLUIT_RE = /^#(end\s+if|loop|end\s+repeat|end\s+def)\b/i;

/**
 * Een rekentekst zonder merktekens in eenheden voor het canvas: een nieuwe eenheid
 * bij elke kop, maar alleen waar dat de tekst niet breekt. Binnen een `#if`, een
 * lus, een macro, een `@svg`/`@select`/`@3d`/`@js`-blok of een stuk tussen `#hide`
 * en `#show` blijft de kop bij de eenheid erboven: elke eenheid wordt apart
 * ingelezen (components/calc/canvasRekenen.ts). Om dezelfde reden blijft een stuk
 * met een macro, een `#def`-constante of een eigen eenheid (`.naam = …`) één eenheid
 * met alles tot waar die naam het laatst wordt gebruikt: die gelden bij het inlezen,
 * alleen binnen hun eigen eenheid. Na een `#include` splitst niets meer. De eenheden
 * staan op volgorde, y = 0, 1, 2 …: de plek op het vel geeft stapelOnderElkaar.
 */
export function splitsOpKoppen(bron: string): Eenheid[] {
  const delen: string[][] = [[]];
  let diepte = 0;
  let verborgen = false;
  let inBlok = false;
  for (const regel of bron.split(/\r?\n/)) {
    const t = regel.trim();
    const huidig = delen[delen.length - 1];
    if (!inBlok && diepte === 0 && !verborgen && KOP_RE.test(t) && huidig.some((r) => r.trim() !== "")) delen.push([]);
    delen[delen.length - 1].push(regel);
    if (inBlok) {
      if (BLOK_EIND_RE.test(t)) inBlok = false;
      continue;
    }
    if (BLOK_START_RE.test(t)) inBlok = true;
    else if (OPEN_RE.test(t) || DEF_OPEN_RE.test(t)) diepte++;
    else if (SLUIT_RE.test(t)) diepte = Math.max(0, diepte - 1);
    else if (/^#hide\b/i.test(t)) verborgen = true;
    else if (/^#show\b/i.test(t)) verborgen = false;
  }
  return houdBijElkaar(delen.map((regels) => regels.join("\n").trim()).filter((tekst) => tekst !== ""))
    .map((tekst, i) => ({ id: `e${i + 1}`, x: 0, y: i, tekst }));
}

/** Wat bij het inlezen geldt: een macro of constante (`#def naam…`) en een eigen eenheid (`.naam = …`). */
const LEESNAAM_RES = [/^#def\s+([\p{L}_][\p{L}\p{N}_]*)/u, /^\.([\p{L}_][\p{L}\p{N}_]*)\s*=/u];
const INCLUDE_RE = /^#include\b/i;

/**
 * Voegt stukken samen tot elke naam die bij het inlezen geldt, in hetzelfde stuk
 * staat als waar hij wordt gebruikt; na een `#include` gaat alles samen.
 */
function houdBijElkaar(stukken: string[]): string[] {
  const tot = stukken.map((stuk, i) => {
    let eind = i;
    for (const regel of stuk.split("\n")) {
      const t = regel.trim();
      if (INCLUDE_RE.test(t)) return stukken.length - 1;
      for (const re of LEESNAAM_RES) {
        const naam = t.match(re)?.[1];
        if (!naam) continue;
        const gebruik = new RegExp(`(?<![\\p{L}\\p{N}_])${naam}(?![\\p{L}\\p{N}_])`, "u");
        for (let j = stukken.length - 1; j > eind; j--) {
          if (gebruik.test(stukken[j])) {
            eind = j;
            break;
          }
        }
      }
    }
    return eind;
  });
  const uit: string[] = [];
  for (let i = 0; i < stukken.length; ) {
    let eind = tot[i];
    for (let k = i; k <= eind; k++) eind = Math.max(eind, tot[k]);
    uit.push(stukken.slice(i, eind + 1).join("\n\n"));
    i = eind + 1;
  }
  return uit;
}

/** De ruimte tussen twee eenheden onder elkaar, in millimeter. */
export const STAPEL_RUIMTE = 4;

/**
 * Eenheden onder elkaar op het vel, in hun volgorde, met hun gemeten hoogte (of
 * een schatting zolang ze niet gemeten zijn): niets over de vouw, alles op het raster.
 */
export function stapelOnderElkaar(eenheden: Eenheid[], hoogte: (e: Eenheid) => number | undefined): Eenheid[] {
  let y = 0;
  return eenheden.map((e) => {
    const h = hoogte(e) ?? Math.max(10, 5 * e.tekst.split("\n").length);
    // Naar boven op het raster, zodat niets op de eenheid erboven komt.
    const plek = naastDeVouw(Math.ceil(y / RASTER_MM) * RASTER_MM, h);
    y = plek + h + STAPEL_RUIMTE;
    return { ...e, x: 0, y: plek };
  });
}

/**
 * De breedte die een eenheid op deze plek mag gebruiken, in millimeter: tot de
 * rechterrand, maar nooit minder dan INVOER_BREEDTE. Staat hij verder naar rechts,
 * dan schuift hij naar links (legOpVellen); anders wordt een tekst een smalle toren.
 */
export const INVOER_BREEDTE = 80;
export function maxBreedte(x: number): number {
  return Math.max(VEL_BREEDTE - x, INVOER_BREEDTE);
}

/** De grenzen van het zoomen op het vel; 1 is 100 %. */
export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 3;

/**
 * De zoomstand na scrollen met Ctrl. Een tik van een muiswiel is ±100 en scheelt
 * ongeveer 15 %. Exponentieel, zodat een tik heen en terug op hetzelfde uitkomt;
 * knijpen op een touchpad geeft veel kleine stapjes, die vanzelf optellen.
 */
export function zoomNaWiel(zoom: number, deltaY: number): number {
  return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * Math.exp(-deltaY * 0.0015)));
}

/** Op het dichtstbijzijnde punt van het raster. */
export function opRaster(mm: number): number {
  return Math.max(0, Math.round(mm / RASTER_MM) * RASTER_MM);
}

/** Een positie die op het vel blijft: een raster breed van de rechterrand. */
export function klemOpVel(x: number, y: number): { x: number; y: number } {
  return { x: Math.min(Math.max(0, x), VEL_BREEDTE - RASTER_MM), y: Math.max(0, y) };
}

/** Op welk vel (vanaf 0) deze hoogte valt. */
export function velVan(y: number): number {
  return y < EERSTE_VEL ? 0 : 1 + Math.floor((y - EERSTE_VEL) / VEL_HOOGTE);
}

/** De hoogte op het canvas waar dit vel begint. */
export function velBegin(vel: number): number {
  return vel === 0 ? 0 : EERSTE_VEL + (vel - 1) * VEL_HOOGTE;
}

/**
 * De hoogte voor een eenheid van hoogte `h`, zonder dat hij over de vouw valt: past
 * hij niet meer op zijn vel, dan het begin van het volgende. Wat hoger is dan
 * een vel blijft staan, want verschuiven helpt dan niet.
 */
export function naastDeVouw(y: number, h: number): number {
  const einde = velBegin(velVan(y) + 1);
  return y + h <= einde || h > VEL_HOOGTE ? y : einde;
}

/** Waar een eenheid op papier komt: op welk vel, en de plek vanaf de linkerbovenhoek daarvan. */
export interface PlekOpVel {
  vel: number;
  x: number;
  y: number;
}

/**
 * De plekken op papier, voor eenheden in de volgorde van doorrekenen met hun
 * gemeten breedte en hoogte. De positie blijft behouden, op twee dingen na: wat
 * over de vouw zou vallen begint het volgende vel, en wat eronder staat schuift
 * evenveel mee, zodat er niets op elkaar komt. Wat te breed is voor zijn plek
 * schuift naar links tot het op het vel past. Zonder dit valt het er op papier
 * af zonder dat je het ziet.
 */
export function legOpVellen(eenheden: { x: number; y: number; b: number; h: number }[]): PlekOpVel[] {
  let schuif = 0;
  return eenheden.map((e) => {
    const y = naastDeVouw(e.y + schuif, e.h);
    schuif = y - e.y;
    const vel = velVan(y);
    return { vel, x: Math.max(0, Math.min(e.x, VEL_BREEDTE - e.b)), y: y - velBegin(vel) };
  });
}
