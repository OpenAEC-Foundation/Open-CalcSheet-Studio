/**
 * Het iframe-blok (`@iframe …`) in de app.
 *
 * De kern schrijft een kader met het adres (packages/core/src/iframeBlok.ts). Een
 * rekenblad kan van iemand anders komen, dus hier komt pas iets binnen als de
 * gebruiker de herkomst heeft bevestigd met de knop in dat kader. Dat geldt voor
 * deze sessie en alleen voor die herkomst (schema, host, poort): een ander
 * domein in hetzelfde of een ander blad vraagt opnieuw, en er wordt niets
 * bewaard. De rechten staan in iframeRegels.ts.
 *
 *   uitwerking     het iframe staat in een eigen laag boven de uitwerking, op de
 *                  plek van het kader (`IframeBeelden`). Een iframe dat uit de
 *                  pagina verdwijnt, begint opnieuw, en typen in een invoerveld
 *                  vervangt de hele uitwerking. In die laag blijft het staan.
 *   afdrukvoorbeeld, afdruk
 *                  in het kader zelf (`vulIframesIn`, `useIframeAfdruk`). Het
 *                  kader blijft eronder staan: niet bevestigd, of niet op tijd
 *                  geladen, en het kader met het adres komt op papier. Zolang het
 *                  laadt draagt het blok `data-afdruk-laadt`, en het afdrukken
 *                  wacht daarop (rapport/afdruk/drukvellen.ts).
 *   rapport        dat drukt een kopie van de vellen af, en een gekopieerd iframe
 *                  begint opnieuw en komt leeg op papier. Daarom verhuizen de
 *                  geladen iframes tijdens het afdrukken naar de kopie
 *                  (`iframesNaarDruk`); `moveBefore` laadt ze niet opnieuw. Kent
 *                  de browser dat niet, dan komt het kader op papier.
 *
 * De hoogte staat vast in de kern, dus de verdeling over de vellen verandert niet
 * als er een iframe in komt.
 *
 * Een afbeelding van buiten (`@img(https://…)`, `<img src="https://…">`) valt onder
 * dezelfde bevestiging: het adres kan een waarde uit het blad bevatten, en de opschoning
 * heeft het daarom in `data-extern-src` gezet (uitwerkingRegels.ts). Op het scherm komt
 * er per herkomst een knop bij (`IframeBeelden`). Op papier staat er zonder bevestiging
 * alleen de naam van de host (`useIframeAfdruk`).
 */
import { useLayoutEffect, useSyncExternalStore, type RefObject } from "react";
import { herkomstVan, iframeAttributen, magLaden } from "./iframeRegels";

/** Zo lang wacht een afdruk op een externe pagina. Daarna komt het kader op papier. */
const MAX_LADEN_MS = 8000;

const BLOK = ".calc-iframe[data-iframe-url]";
const INHOUD = "iframe.calc-iframe-inhoud";

// ── Bevestigen ────────────────────────────────────────────────────────────────

const bevestigd = new Set<string>();
let versie = 0;
const luisteraars = new Set<() => void>();

function abonneer(l: () => void) {
  luisteraars.add(l);
  return () => {
    luisteraars.delete(l);
  };
}

/** Verandert als er een herkomst is bevestigd; het afdrukvoorbeeld verdeelt dan opnieuw. */
export function useIframeVersie(): number {
  return useSyncExternalStore(abonneer, () => versie);
}

function isBevestigd(url: string): boolean {
  return bevestigd.has(herkomstVan(url));
}

function bevestig(url: string) {
  bevestigd.add(herkomstVan(url));
  versie += 1;
  for (const l of luisteraars) l();
}

function maakIframe(url: string, scripts: boolean, titel: string): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  iframe.className = "calc-iframe-inhoud";
  const { src, ...rest } = iframeAttributen(url, scripts, titel);
  // Eerst de rechten, dan pas het adres.
  for (const [naam, waarde] of Object.entries(rest)) iframe.setAttribute(naam, waarde);
  iframe.src = src;
  return iframe;
}

/** Wat er in een blok staat; null als het adres niet (meer) mag. */
function leesBlok(blok: HTMLElement): { url: string; scripts: boolean; titel: string } | null {
  const url = magLaden(blok.dataset.iframeUrl ?? "");
  if (!url) return null;
  return { url, scripts: blok.dataset.iframeScripts === "ja", titel: blok.dataset.iframeTitel ?? url };
}

// ── Afbeeldingen van buiten ───────────────────────────────────────────────────

/**
 * Zet het adres terug op wat is bevestigd. De rest toont de naam van de host; met
 * `knop` komt er per herkomst een knop om te bevestigen achter de eerste afbeelding.
 */
function zetBeelden(wortel: HTMLElement, knop?: { tekst: (host: string) => string; opKlik: () => void }) {
  for (const oud of wortel.querySelectorAll(".calc-extern-laden, .calc-extern-plek")) oud.remove();
  const gezien = new Set<string>();
  for (const el of wortel.querySelectorAll<HTMLElement>("[data-extern-src]")) {
    const url = magLaden(el.dataset.externSrc ?? "");
    if (!url) continue;
    if (isBevestigd(url)) {
      el.setAttribute(el.localName === "image" ? "href" : "src", url);
      continue;
    }
    const host = new URL(url).host;
    const plek = document.createElement("span");
    plek.className = "calc-extern-plek";
    plek.textContent = host;
    (el.closest("svg") ?? el).after(plek);
    if (!knop || gezien.has(herkomstVan(url))) continue;
    gezien.add(herkomstVan(url));
    const b = document.createElement("button");
    b.type = "button";
    b.className = "calc-iframe-laden calc-extern-laden";
    b.textContent = knop.tekst(host);
    b.addEventListener("click", () => {
      bevestig(url);
      knop.opKlik();
    });
    plek.after(b);
  }
}

// ── De uitwerking ─────────────────────────────────────────────────────────────

/** De teksten van de plaatshouder; ze volgen de taal van de app (calcpad.json, iframe). */
export interface IframeTeksten {
  laden: string;
  uitleg: string;
  scripts: string;
  beeld: (host: string) => string;
}

interface Beeld {
  url: string;
  scripts: boolean;
  iframe: HTMLIFrameElement;
  vak: HTMLElement | null;
}

/**
 * De iframes van één uitwerking, op volgorde van de blokken. Na elke doorrekening
 * `koppel`; bij het sluiten van de uitwerking `sluit`. Zelfde adres en rechten: het
 * iframe blijft staan en schuift mee, ook bij een andere hoogte of plek.
 */
export class IframeBeelden {
  private beelden: (Beeld | null)[] = [];
  private wortel: HTMLElement | null = null;
  private laag: HTMLElement | null = null;
  private readonly teksten: () => IframeTeksten;
  private readonly ro = new ResizeObserver(() => this.plaats());

  constructor(teksten: () => IframeTeksten) {
    this.teksten = teksten;
  }

  koppel(wortel: HTMLElement | null, laag: HTMLElement | null) {
    if (wortel !== this.wortel) {
      this.ro.disconnect();
      if (wortel) this.ro.observe(wortel);
    }
    this.wortel = wortel;
    this.laag = laag;
    if (wortel) zetBeelden(wortel, { tekst: (host) => this.teksten().beeld(host), opKlik: () => this.koppel(this.wortel, this.laag) });
    const blokken = wortel && laag ? [...wortel.querySelectorAll<HTMLElement>(BLOK)] : [];
    blokken.forEach((blok, i) => {
      const inhoud = leesBlok(blok);
      const vak = blok.querySelector<HTMLElement>(".calc-iframe-vak");
      const oud = this.beelden[i] ?? null;
      if (!inhoud || !vak || !isBevestigd(inhoud.url)) {
        oud?.iframe.remove();
        this.beelden[i] = null;
        if (inhoud && vak) this.plaatshouder(blok, inhoud.url, inhoud.scripts);
        return;
      }
      blok.classList.add("geladen");
      for (const weg of blok.querySelectorAll(".calc-iframe-laden, .calc-iframe-uitleg")) weg.remove();
      if (oud && oud.url === inhoud.url && oud.scripts === inhoud.scripts) {
        oud.vak = vak;
        return;
      }
      oud?.iframe.remove();
      const iframe = maakIframe(inhoud.url, inhoud.scripts, inhoud.titel);
      laag!.appendChild(iframe);
      this.beelden[i] = { url: inhoud.url, scripts: inhoud.scripts, iframe, vak };
    });
    for (const b of this.beelden.slice(blokken.length)) b?.iframe.remove();
    this.beelden.length = Math.min(this.beelden.length, blokken.length);
    this.plaats();
  }

  /** De knop in het kader. Blijft bij elke nieuwe uitwerking terugkomen tot er bevestigd is. */
  private plaatshouder(blok: HTMLElement, url: string, scripts: boolean) {
    const kader = blok.querySelector<HTMLElement>(".calc-iframe-kader");
    if (!kader || kader.querySelector(".calc-iframe-laden")) return;
    const t = this.teksten();
    const uitleg = document.createElement("span");
    uitleg.className = "calc-iframe-uitleg";
    uitleg.textContent = scripts ? `${t.uitleg} ${t.scripts}` : t.uitleg;
    const knop = document.createElement("button");
    knop.type = "button";
    knop.className = "calc-iframe-laden";
    knop.textContent = t.laden;
    knop.addEventListener("click", () => {
      bevestig(url);
      this.koppel(this.wortel, this.laag);
    });
    kader.append(uitleg, knop);
  }

  /** Zet de iframes op de plek van hun kader. */
  private plaats() {
    if (!this.laag) return;
    const l = this.laag.getBoundingClientRect();
    for (const b of this.beelden) {
      if (!b) continue;
      const v = b.vak?.getBoundingClientRect();
      const zichtbaar = !!v && v.width > 0 && v.height > 0;
      b.iframe.style.display = zichtbaar ? "" : "none";
      if (!zichtbaar) continue;
      // Binnen de rand van het vak: die hoort bij het blad.
      b.iframe.style.left = `${v.left - l.left + b.vak!.clientLeft}px`;
      b.iframe.style.top = `${v.top - l.top + b.vak!.clientTop}px`;
      b.iframe.style.width = `${b.vak!.clientWidth}px`;
      b.iframe.style.height = `${b.vak!.clientHeight}px`;
    }
  }

  sluit() {
    this.ro.disconnect();
    for (const b of this.beelden) b?.iframe.remove();
    this.beelden = [];
    this.wortel = null;
    this.laag = null;
  }
}

// ── Afdruk ────────────────────────────────────────────────────────────────────

/**
 * Zet een iframe in elk bevestigd blok onder `wortel`, voor op papier. Geeft de
 * functie die de timers en iframes weer opruimt.
 */
export function vulIframesIn(wortel: HTMLElement): () => void {
  const opruimen: (() => void)[] = [];
  for (const blok of wortel.querySelectorAll<HTMLElement>(BLOK)) {
    const inhoud = leesBlok(blok);
    const vak = blok.querySelector<HTMLElement>(".calc-iframe-vak");
    if (!inhoud || !vak || !isBevestigd(inhoud.url)) continue;
    const iframe = maakIframe(inhoud.url, inhoud.scripts, inhoud.titel);
    blok.setAttribute("data-afdruk-laadt", "");
    const klaar = () => {
      window.clearTimeout(tijd);
      blok.removeAttribute("data-afdruk-laadt");
    };
    // Niet op tijd: weg ermee. Het kader staat eronder.
    const tijd = window.setTimeout(() => {
      iframe.remove();
      klaar();
    }, MAX_LADEN_MS);
    iframe.addEventListener("load", () => {
      blok.classList.add("geladen");
      klaar();
    }, { once: true });
    vak.appendChild(iframe);
    opruimen.push(() => {
      klaar();
      iframe.remove();
      blok.classList.remove("geladen");
    });
  }
  return () => {
    for (const o of opruimen) o();
  };
}

/**
 * In een afdruk: de iframes van de uitwerking. Niet in de meetopstelling van het
 * afdrukvoorbeeld: daar is de hoogte al vast en tellen alleen de vellen
 * (AfdrukVoorbeeld.tsx); anders zou elke pagina twee keer laden. De afbeeldingen van
 * buiten wel: die bepalen de hoogte, en de vellen zijn daar een kopie van.
 */
export function useIframeAfdruk(ref: RefObject<HTMLElement | null>, html: string) {
  useLayoutEffect(() => {
    const wortel = ref.current;
    if (!wortel) return;
    zetBeelden(wortel);
    if (!html.includes("calc-iframe") || wortel.closest(".av-meet")) return;
    return vulIframesIn(wortel);
  }, [ref, html]);
}

/** Wat `moveBefore` in Chromium toevoegt: verplaatsen zonder dat een iframe opnieuw begint. */
type MetVerplaatsen = Element & { moveBefore?: (knoop: Node, voor: Node | null) => void };

/**
 * Voor het drukken van een kopie van de vellen: haalt de iframes uit de kopie
 * voordat die in de pagina komt, en geeft de functie die daarna de geladen
 * iframes van de vellen naar de kopie verhuist. Die geeft op zijn beurt de functie
 * die ze terugzet.
 */
export function iframesNaarDruk(vellen: HTMLElement[], kopie: HTMLElement): () => () => void {
  const bronnen = vellen.flatMap((v) => [...v.querySelectorAll<HTMLIFrameElement>(INHOUD)]);
  const doelen = [...kopie.querySelectorAll<HTMLIFrameElement>(INHOUD)].map((f) => {
    const vak = f.parentElement as MetVerplaatsen;
    f.remove();
    return vak;
  });
  return () => {
    const terug: (() => void)[] = [];
    doelen.forEach((vak, i) => {
      const bron = bronnen[i];
      const oud = bron?.parentElement as MetVerplaatsen | null;
      const geladen = !!bron && !!bron.closest(".calc-iframe.geladen, .calc-js.geladen");
      if (geladen && oud && vak.moveBefore && oud.moveBefore) {
        vak.moveBefore(bron, null);
        terug.push(() => oud.moveBefore!(bron, null));
      } else {
        vak.closest(".calc-iframe, .calc-js")?.classList.remove("geladen");
      }
    });
    return () => {
      for (const t of terug) t();
    };
  };
}
