/**
 * Het JavaScript-blok (`@js … @end`) in de app.
 *
 * De kern schrijft een kader met de code, de waarden van het blad en de titel
 * (packages/core/src/jsBlok.ts). Hier komt daar een venster in, en pas als de
 * gebruiker dat wil: een bestand kan van iemand anders komen. Eerst een plaatshouder
 * met de hosts en een knop. Na de klik blijft dat blad uitvoeren tot het bestand
 * gesloten wordt, ook als de code wijzigt, zolang er geen nieuwe host bij komt. Een
 * pas geopend bestand vraagt opnieuw, en er wordt niets bewaard.
 *
 *   uitwerking     het venster staat in de laag boven de uitwerking, net als een
 *                  iframe (iframeBlok.ts), zodat het blijft bestaan als de uitwerking
 *                  wordt vervangen. Nieuwe waarden gaan als bericht als het script
 *                  `calc.bijWijziging` gebruikt: de camera blijft dan staan. Anders
 *                  begint het script opnieuw.
 *   afdruk         in het vak zelf (`vulJsIn`, `useJsAfdruk`). Het venster krijgt de
 *                  vraag om een afbeelding: een canvas drukt vaak leeg af. Geen canvas
 *                  en wel html: dan drukt het venster zelf af, als bij `@iframe`. Niet
 *                  uitgevoerd, mislukt of niet op tijd: het kader met de titel.
 *                  Zolang het loopt draagt het blok `data-afdruk-laadt`.
 *
 * Het venster bestaat uit twee frames in elkaar, zodat een script niet kan wegnavigeren
 * (jsRegels.ts). Hier is dat één iframe: de buitenste. Een script dat vastloopt of toch
 * probeert weg te gaan, wordt gestopt: dat ziet de app aan een uitblijvend antwoord en
 * aan een bericht van het venster, of aan een tweede `load` als het buitenste frame
 * ooit zelf zou verdwijnen. Wat het venster stuurt, gaat door `leesBericht` en wordt
 * nooit als html gebruikt.
 */
import { useLayoutEffect, useSyncExternalStore, type RefObject } from "react";
import { useProjectStore } from "../../store/projectStore";
import looptijd from "./jsLooptijd.js?raw";
import { geldigeHost, jsAttributen, jsSrcdoc, leesBericht } from "./jsRegels";

/** Zolang wacht een afdruk op het script. Daarna komt het kader op papier. */
const MAX_AFDRUK_MS = 20000;
const PING_MS = 2000;
/** Zoveel pings zonder antwoord: het script loopt vast. */
const MAX_ZONDER_ANTWOORD = 4;

// ── Bevestigen ────────────────────────────────────────────────────────────────

/** Per blad: de hosts die bij de klik zichtbaar waren. Alleen in deze sessie. */
const bevestigd = new Map<string, Set<string>>();
let versie = 0;
const luisteraars = new Set<() => void>();

function meld() {
  versie += 1;
  for (const l of luisteraars) l();
}

function abonneer(l: () => void) {
  luisteraars.add(l);
  return () => {
    luisteraars.delete(l);
  };
}

/** Verandert als er iets is bevestigd of vergeten; het afdrukvoorbeeld verdeelt dan opnieuw. */
export function useJsVersie(): number {
  return useSyncExternalStore(abonneer, () => versie);
}

function magUitvoeren(blad: string | undefined, netwerk: readonly string[]): boolean {
  if (!blad) return false;
  const hosts = bevestigd.get(blad);
  return !!hosts && netwerk.every((h) => hosts.has(h));
}

function bevestig(blad: string, netwerk: readonly string[]) {
  const hosts = bevestigd.get(blad) ?? new Set<string>();
  for (const h of netwerk) hosts.add(h);
  bevestigd.set(blad, hosts);
  meld();
}

/*
 * Een ander bestand: alles vergeten. `laadProject` en `nieuwProject` vervangen in één
 * keer de bladen en de gegevens, en beginnen met een schone geschiedenis; ongedaan
 * maken zet juist `dirty`. Ook bij hetzelfde bestand opnieuw openen.
 */
useProjectStore.subscribe((s, v) => {
  if (bevestigd.size === 0) return;
  if (s.exemplaren !== v.exemplaren && s.gegevens !== v.gegevens && !s.dirty && s.verleden.length === 0 && s.toekomst.length === 0) {
    bevestigd.clear();
    meld();
  }
});

// ── De bibliotheek ────────────────────────────────────────────────────────────

let drie: Promise<{ core: string; module: string; orbit: string }> | null = null;

/** three als tekst, voor het venster: lui geladen, en het blijft in de app zonder netwerk. */
function laadDrie() {
  drie ??= Promise.all([
    import("../../../../../node_modules/three/build/three.core.js?raw"),
    import("../../../../../node_modules/three/build/three.module.js?raw"),
    import("../../../../../node_modules/three/examples/jsm/controls/OrbitControls.js?raw"),
  ]).then(([core, module, orbit]) => ({ core: core.default, module: module.default, orbit: orbit.default }));
  return drie;
}

// ── Het venster ───────────────────────────────────────────────────────────────

interface JsInhoud {
  code: string;
  waardenTekst: string;
  netwerk: string[];
  bibliotheken: string[];
  titel: string;
}

/** Leest een blok. Wat niet klopt (een nagemaakt blok in een tekstregel), is er niet. */
function leesBlok(blok: HTMLElement): JsInhoud | null {
  try {
    const code = JSON.parse(blok.dataset.jsCode ?? "");
    const waardenTekst = blok.dataset.jsWaarden ?? "{}";
    if (typeof code !== "string") return null;
    JSON.parse(waardenTekst);
    return {
      code,
      waardenTekst,
      netwerk: (blok.dataset.jsNetwerk ?? "").split(",").filter(geldigeHost),
      bibliotheken: (blok.dataset.jsBibliotheek ?? "").split(",").filter((b) => b === "three"),
      titel: blok.dataset.jsTitel ?? "JavaScript",
    };
  } catch {
    return null;
  }
}

interface Omgeving {
  opGeladen?: (luistert: boolean) => void;
  opFout?: (tekst: string) => void;
  opHoogte?: (px: number) => void;
  /** Het venster is gestopt: vastgelopen, of weggenavigeerd. */
  opGestopt?: (reden: "vast" | "weg") => void;
}

/** Waar de berichten heen gaan: het venster dat ze stuurde, en geen ander. */
const vensters = new Map<MessageEventSource, Venster>();

window.addEventListener("message", (e) => {
  const v = e.source ? vensters.get(e.source) : undefined;
  if (v) v.ontvang(e.data);
});

class Venster {
  readonly iframe: HTMLIFrameElement;
  luistert = false;
  klaar = false;
  private readonly omgeving: Omgeving;
  private ping = 0;
  private zonderAntwoord = 0;
  private laden = 0;
  private weg = false;
  private volgendeId = 1;
  private readonly wacht = new Map<number, (b: { dataUrl: string | null; mislukt: boolean; leeg: boolean }) => void>();
  private opKlaar: (() => void)[] = [];

  constructor(inhoud: JsInhoud, opPapier: boolean, omgeving: Omgeving) {
    this.omgeving = omgeving;
    const iframe = document.createElement("iframe");
    iframe.className = "calc-iframe-inhoud";
    for (const [naam, waarde] of Object.entries(jsAttributen(inhoud.titel))) iframe.setAttribute(naam, waarde);
    iframe.addEventListener("load", () => {
      // De srcdoc laadt één keer. Een tweede keer is het venster toch weggenavigeerd.
      if (++this.laden > 1) this.stop("weg");
    });
    iframe.srcdoc = jsSrcdoc(looptijd, {
      code: inhoud.code,
      waarden: JSON.parse(inhoud.waardenTekst),
      netwerk: inhoud.netwerk,
      bibliotheken: inhoud.bibliotheken,
      opPapier,
      // In een gewone browser is er geen opstartscript dat WebRTC weghaalt (jsLooptijd.js).
      webrtcToets: !import.meta.env.DEV,
    }, inhoud.titel);
    this.iframe = iframe;
  }

  /** Na het plaatsen in de pagina: dan is er een venster om naar te luisteren. */
  start() {
    const w = this.iframe.contentWindow;
    if (w) vensters.set(w, this);
    this.ping = window.setInterval(() => {
      if (++this.zonderAntwoord > MAX_ZONDER_ANTWOORD) {
        this.stop("vast");
        return;
      }
      this.stuur({ soort: "ping" });
    }, PING_MS);
  }

  private stuur(bericht: unknown) {
    // Het venster heeft een eigen, ondoorzichtige herkomst; "*" is de enige die past.
    this.iframe.contentWindow?.postMessage(bericht, "*");
  }

  ontvang(data: unknown) {
    const b = leesBericht(data);
    if (!b || this.weg) return;
    this.zonderAntwoord = 0;
    switch (b.soort) {
      case "weg":
        this.stop("weg");
        break;
      case "luistert":
        this.luistert = true;
        break;
      case "klaar":
        this.klaar = true;
        this.luistert ||= b.luistert;
        this.omgeving.opGeladen?.(this.luistert);
        for (const f of this.opKlaar) f();
        this.opKlaar = [];
        break;
      case "fout":
        this.omgeving.opFout?.(b.tekst);
        break;
      case "hoogte":
        this.omgeving.opHoogte?.(b.px);
        break;
      case "vraag-bibliotheek":
        void laadDrie().then((delen) => this.stuur({ soort: "bibliotheek", delen }));
        break;
      case "afdruk":
        this.wacht.get(b.id)?.(b);
        this.wacht.delete(b.id);
        break;
    }
  }

  /** Nieuwe waarden zonder opnieuw te beginnen; alleen als het script luistert. */
  zetWaarden(waardenTekst: string) {
    this.stuur({ soort: "waarden", waarden: JSON.parse(waardenTekst) });
  }

  wachtOpKlaar(): Promise<void> {
    return this.klaar ? Promise.resolve() : new Promise((k) => this.opKlaar.push(k));
  }

  vraagAfdruk(): Promise<{ dataUrl: string | null; mislukt: boolean; leeg: boolean }> {
    const id = this.volgendeId++;
    return new Promise((k) => {
      this.wacht.set(id, k);
      this.stuur({ soort: "afdruk", id });
    });
  }

  stop(reden?: "vast" | "weg") {
    if (this.weg) return;
    this.weg = true;
    window.clearInterval(this.ping);
    const w = this.iframe.contentWindow;
    if (w) vensters.delete(w);
    this.iframe.remove();
    if (reden) this.omgeving.opGestopt?.(reden);
  }
}

// ── De uitwerking ─────────────────────────────────────────────────────────────

/** De teksten van de plaatshouder en de meldingen; ze volgen de taal van de app (calcpad.json, js). */
export interface JsTeksten {
  uitvoeren: string;
  uitleg: string;
  geenNetwerk: string;
  netwerk: (hosts: string) => string;
  bibliotheek: (naam: string) => string;
  vast: string;
  weg: string;
}

interface Beeld {
  sleutel: string;
  waardenTekst: string;
  vak: HTMLElement | null;
  venster: Venster | null;
  fout: string;
  /** Vastgelopen of weggenavigeerd: niet vanzelf opnieuw met dezelfde code en waarden. */
  gestopt: string;
  hoogtePx: number | null;
}

const sleutelVan = (i: JsInhoud) => [i.code, i.netwerk.join(), i.bibliotheken.join()].join("\u0000");

/**
 * De vensters van één uitwerking, op volgorde van de blokken. Na elke doorrekening
 * `koppel`; bij het sluiten van de uitwerking `sluit`.
 */
export class JsBeelden {
  private beelden: (Beeld | null)[] = [];
  private wortel: HTMLElement | null = null;
  private laag: HTMLElement | null = null;
  private blad: string | undefined;
  private readonly teksten: () => JsTeksten;
  private readonly ro = new ResizeObserver(() => this.plaats());
  private readonly opnieuw = () => this.koppel(this.wortel, this.laag, this.blad);

  constructor(teksten: () => JsTeksten) {
    this.teksten = teksten;
    luisteraars.add(this.opnieuw);
  }

  koppel(wortel: HTMLElement | null, laag: HTMLElement | null, blad: string | undefined) {
    if (wortel !== this.wortel) {
      this.ro.disconnect();
      if (wortel) this.ro.observe(wortel);
    }
    if (blad !== this.blad) this.ruimOp(0);
    this.wortel = wortel;
    this.laag = laag;
    this.blad = blad;
    const blokken = wortel && laag ? [...wortel.querySelectorAll<HTMLElement>(".calc-js")] : [];
    blokken.forEach((blok, i) => {
      const inhoud = leesBlok(blok);
      const vak = blok.querySelector<HTMLElement>(".calc-iframe-vak");
      const oud = this.beelden[i] ?? null;
      if (!inhoud || !vak || !magUitvoeren(blad, inhoud.netwerk)) {
        oud?.venster?.stop();
        this.beelden[i] = null;
        if (inhoud && vak) this.plaatshouder(blok, inhoud);
        return;
      }
      const sleutel = sleutelVan(inhoud);
      const beeld = oud && oud.sleutel === sleutel ? oud : this.nieuw(oud, sleutel, i);
      beeld.vak = vak;
      // Dezelfde code, nieuwe waarden: als bericht, of opnieuw beginnen.
      if (beeld.waardenTekst !== inhoud.waardenTekst) {
        const vorige = beeld.waardenTekst;
        beeld.waardenTekst = inhoud.waardenTekst;
        if (vorige && beeld.venster?.luistert) beeld.venster.zetWaarden(inhoud.waardenTekst);
        else {
          beeld.venster?.stop();
          beeld.venster = null;
          beeld.fout = "";
          beeld.gestopt = "";
        }
      }
      if (!beeld.venster && !beeld.gestopt) this.startVenster(beeld, inhoud);
      this.toonToestand(blok, beeld);
    });
    this.ruimOp(blokken.length);
    this.plaats();
  }

  private nieuw(oud: Beeld | null, sleutel: string, i: number): Beeld {
    oud?.venster?.stop();
    const b: Beeld = { sleutel, waardenTekst: "", vak: null, venster: null, fout: "", gestopt: "", hoogtePx: null };
    this.beelden[i] = b;
    return b;
  }

  private startVenster(beeld: Beeld, inhoud: JsInhoud) {
    const venster = new Venster(inhoud, false, {
      opFout: (tekst) => {
        beeld.fout = tekst;
        this.werkToestandBij();
      },
      opHoogte: (px) => {
        beeld.hoogtePx = px;
        this.werkToestandBij();
      },
      opGestopt: (reden) => {
        const t = this.teksten();
        beeld.gestopt = reden === "vast" ? t.vast : t.weg;
        beeld.venster = null;
        this.werkToestandBij();
      },
    });
    this.laag!.appendChild(venster.iframe);
    venster.start();
    beeld.venster = venster;
  }

  private werkToestandBij() {
    const blokken = this.wortel ? [...this.wortel.querySelectorAll<HTMLElement>(".calc-js")] : [];
    blokken.forEach((blok, i) => {
      const b = this.beelden[i];
      if (b) this.toonToestand(blok, b);
    });
    this.plaats();
  }

  /** Het kader bij een gestopt venster; de melding bij een fout. Altijd als tekst. */
  private toonToestand(blok: HTMLElement, beeld: Beeld) {
    blok.classList.toggle("geladen", !!beeld.venster);
    for (const weg of blok.querySelectorAll(".calc-iframe-laden, .calc-iframe-uitleg")) weg.remove();
    if (beeld.hoogtePx !== null && beeld.vak) beeld.vak.style.height = `${beeld.hoogtePx}px`;
    let melding = blok.querySelector<HTMLElement>(":scope > .calc-js-fout");
    const tekst = beeld.gestopt || beeld.fout;
    if (!tekst) {
      melding?.remove();
      return;
    }
    if (!melding) {
      melding = document.createElement("p");
      melding.className = "calc-iframe-melding calc-js-fout";
      blok.prepend(melding);
    }
    melding.textContent = tekst;
  }

  /** De knop in het kader, met wat het script krijgt. Komt bij elke nieuwe uitwerking terug. */
  private plaatshouder(blok: HTMLElement, inhoud: JsInhoud) {
    blok.classList.remove("geladen");
    const kader = blok.querySelector<HTMLElement>(".calc-iframe-kader");
    const blad = this.blad;
    if (!kader || !blad || kader.querySelector(".calc-iframe-laden")) return;
    const t = this.teksten();
    const uitleg = document.createElement("span");
    uitleg.className = "calc-iframe-uitleg";
    const delen = [t.uitleg];
    delen.push(inhoud.netwerk.length ? t.netwerk(inhoud.netwerk.join(", ")) : t.geenNetwerk);
    for (const b of inhoud.bibliotheken) delen.push(t.bibliotheek(b));
    uitleg.textContent = delen.join(" ");
    const knop = document.createElement("button");
    knop.type = "button";
    knop.className = "calc-iframe-laden";
    knop.textContent = t.uitvoeren;
    knop.addEventListener("click", () => bevestig(blad, inhoud.netwerk));
    kader.append(uitleg, knop);
  }

  private plaats() {
    if (!this.laag) return;
    const l = this.laag.getBoundingClientRect();
    for (const b of this.beelden) {
      if (!b?.venster || !b.vak) continue;
      const v = b.vak.getBoundingClientRect();
      const f = b.venster.iframe;
      const zichtbaar = v.width > 0 && v.height > 0;
      f.style.display = zichtbaar ? "" : "none";
      if (!zichtbaar) continue;
      f.style.left = `${v.left - l.left + b.vak.clientLeft}px`;
      f.style.top = `${v.top - l.top + b.vak.clientTop}px`;
      f.style.width = `${b.vak.clientWidth}px`;
      f.style.height = `${b.vak.clientHeight}px`;
    }
  }

  private ruimOp(vanaf: number) {
    for (const b of this.beelden.slice(vanaf)) b?.venster?.stop();
    this.beelden.length = Math.min(this.beelden.length, vanaf);
  }

  sluit() {
    luisteraars.delete(this.opnieuw);
    this.ro.disconnect();
    this.ruimOp(0);
    this.wortel = null;
    this.laag = null;
  }
}

// ── Afdruk ────────────────────────────────────────────────────────────────────

/** Getekende afbeeldingen per blok; het voorbeeld en de afdruk rekenen ze niet opnieuw uit. */
const afbeeldingen = new Map<string, string>();
const BEWAARD = 24;

function zetAfbeelding(vak: HTMLElement, url: string) {
  const img = document.createElement("img");
  img.className = "calc-js-afbeelding";
  img.alt = "";
  img.src = url;
  vak.appendChild(img);
}

/**
 * Elk uitgevoerd blok onder `wortel`, voor op papier: een afbeelding, of het venster
 * zelf als het html toont. Het blad staat in `data-js-blad` (`useJsAfdruk`). Geeft
 * de functie die de vensters en timers weer opruimt.
 */
export function vulJsIn(wortel: HTMLElement): () => void {
  const opruimen: (() => void)[] = [];
  for (const blok of wortel.querySelectorAll<HTMLElement>(".calc-js")) {
    const inhoud = leesBlok(blok);
    const vak = blok.querySelector<HTMLElement>(":scope > .calc-iframe-vak");
    if (!inhoud || !vak || !magUitvoeren(blok.dataset.jsBlad, inhoud.netwerk)) continue;
    const sleutel = [sleutelVan(inhoud), inhoud.waardenTekst].join("\u0000");
    const klaarBeeld = afbeeldingen.get(sleutel);
    if (klaarBeeld) {
      zetAfbeelding(vak, klaarBeeld);
      blok.classList.add("geladen");
      opruimen.push(() => {
        vak.querySelector(".calc-js-afbeelding")?.remove();
        blok.classList.remove("geladen");
      });
      continue;
    }
    blok.setAttribute("data-afdruk-laadt", "");
    const af = () => blok.removeAttribute("data-afdruk-laadt");
    let gefaald = false;
    const venster = new Venster(inhoud, true, {
      opFout: () => {
        gefaald = true;
      },
      // Vastgelopen of weggenavigeerd: het kader blijft staan.
      opGestopt: af,
    });
    vak.appendChild(venster.iframe);
    venster.start();
    const tijd = window.setTimeout(() => {
      venster.stop();
      af();
    }, MAX_AFDRUK_MS);
    void venster.wachtOpKlaar()
      // Een script dat met requestAnimationFrame tekent, krijgt nog even de tijd.
      .then(() => new Promise((k) => window.setTimeout(k, 200)))
      .then(() => venster.vraagAfdruk())
      .then((b) => {
        window.clearTimeout(tijd);
        if (b.mislukt || gefaald) {
          venster.stop();
        } else if (b.dataUrl) {
          afbeeldingen.set(sleutel, b.dataUrl);
          while (afbeeldingen.size > BEWAARD) afbeeldingen.delete(afbeeldingen.keys().next().value!);
          zetAfbeelding(vak, b.dataUrl);
          blok.classList.add("geladen");
          venster.stop();
        } else if (b.leeg) {
          venster.stop();
        } else {
          blok.classList.add("geladen");
        }
        af();
      });
    opruimen.push(() => {
      window.clearTimeout(tijd);
      venster.stop();
      af();
      vak.querySelector(".calc-js-afbeelding")?.remove();
      blok.classList.remove("geladen");
    });
  }
  return () => {
    for (const o of opruimen) o();
  };
}

/**
 * In een afdruk: elk blok krijgt het blad erbij. Dat overschrijft wat er staat, zodat
 * een blad in een tekstregel geen ander blad kan noemen. In de meetopstelling van het
 * afdrukvoorbeeld blijft het daarbij (AfdrukVoorbeeld.tsx vult de vellen); de echte
 * afdruk van losse bladen voert hier uit.
 */
export function useJsAfdruk(ref: RefObject<HTMLElement | null>, html: string, blad: string | undefined) {
  useLayoutEffect(() => {
    const wortel = ref.current;
    if (!wortel || !html.includes("calc-js")) return;
    for (const blok of wortel.querySelectorAll<HTMLElement>(".calc-js")) {
      if (blad) blok.dataset.jsBlad = blad;
      else delete blok.dataset.jsBlad;
    }
    if (wortel.closest(".av-meet")) return;
    return vulJsIn(wortel);
  }, [ref, html, blad]);
}
