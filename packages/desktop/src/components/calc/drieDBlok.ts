/**
 * Het 3D-blok (`@3d … @end`) in de app.
 *
 * De rekenkern schrijft per blok `<div class="calc-3d" data-scene="…">` met
 * de scène als JSON en een stilstaande projectie als SVG (packages/core/src/
 * drieD.ts). Hier komt daar het beeld van de app overheen:
 *
 *   uitwerking      een draaibaar beeld (Preview.tsx, `DrieDBeelden`). Het
 *                   blijft bestaan over herberekeningen heen: typen in een
 *                   invoerveld vervangt de hele uitwerking, en het beeld
 *                   verhuist dan naar het nieuwe blok in plaats van opnieuw te
 *                   beginnen. Opgeruimd wordt pas als het blok verdwijnt.
 *   afdruk          een stilstaande afbeelding (PNG) op de plaats van de
 *                   projectie (`useDrieDAfdruk`, in PrintBlad en het rapport).
 *                   Zolang die getekend wordt, draagt het blok
 *                   `data-afdruk-laadt`; het afdrukken wacht daarop
 *                   (rapport/afdruk/drukvellen.ts), en het afdrukvoorbeeld
 *                   verdeelt opnieuw zodra hij er is (`useDrieDVersie`).
 *
 * three.js wordt pas geladen bij het eerste 3D-blok (drieDWeergave.ts). Zonder
 * WebGL blijft de projectie van de kern staan, op het scherm en op papier.
 */
import { useLayoutEffect, useSyncExternalStore, type RefObject } from "react";
import type { DrieDScene } from "@ifc-calc/core";
import type { DrieDTeksten, Kijker } from "./drieDWeergave";

type Weergave = typeof import("./drieDWeergave");

let weergave: Weergave | null = null;
let laden: Promise<Weergave> | null = null;
/** WebGL ontbreekt of weigert: dan niet bij elke herberekening opnieuw proberen. */
let geenWebGL = false;

function laadWeergave(): Promise<Weergave> {
  laden ??= import("./drieDWeergave")
    .then((m) => (weergave = m))
    .catch((err) => {
      // Een volgende poging mag het opnieuw proberen.
      laden = null;
      throw err;
    });
  return laden;
}

function leesScene(blok: HTMLElement): DrieDScene | null {
  try {
    return JSON.parse(blok.dataset.scene ?? "") as DrieDScene;
  } catch {
    return null;
  }
}

/**
 * De draaibare beelden van één uitwerking, op volgorde van de blokken. Na
 * elke doorrekening `koppel`; bij het sluiten van de uitwerking `sluit`.
 */
export class DrieDBeelden {
  private kijkers: (Kijker | null)[] = [];
  /** Het blad waarvan de beelden zijn; een ander blad begint met verse beelden. */
  private blad: string | undefined;
  private generatie = 0;
  private gesloten = false;
  private readonly teksten: () => DrieDTeksten;

  constructor(teksten: () => DrieDTeksten) {
    this.teksten = teksten;
  }

  /**
   * Geeft elk `.calc-3d` onder `wortel` een draaibaar beeld. `blad`: welk
   * blad er openstaat; bij een ander blad beginnen de beelden opnieuw, met
   * het standpunt uit dat blad.
   */
  koppel(wortel: HTMLElement | null, blad?: string) {
    const generatie = ++this.generatie;
    if (blad !== this.blad) {
      this.ruimOp(0);
      this.blad = blad;
    }
    const blokken = wortel ? [...wortel.querySelectorAll<HTMLElement>(".calc-3d")] : [];
    if (blokken.length === 0 || geenWebGL) {
      this.ruimOp(0);
      return;
    }
    if (!weergave) {
      // Eerst three.js laden; tot dan staat de projectie er.
      laadWeergave()
        .then(() => {
          if (generatie === this.generatie && !this.gesloten && wortel?.isConnected) this.koppel(wortel, blad);
        })
        .catch((err) => console.error("3D-weergave laden mislukt:", err));
      return;
    }
    blokken.forEach((blok, i) => {
      const scene = leesScene(blok);
      const vak = blok.querySelector<HTMLElement>(".calc-3d-beeld");
      if (!scene || !vak || geenWebGL) return;
      const json = blok.dataset.scene ?? "";
      const kijker = this.kijkers[i];
      if (kijker) {
        kijker.verhuis(vak, scene, json);
        return;
      }
      try {
        this.kijkers[i] = new weergave!.Kijker(vak, scene, json, this.teksten());
      } catch (err) {
        console.warn("Geen WebGL; het 3D-blok blijft een stilstaande projectie.", err);
        geenWebGL = true;
        this.kijkers[i] = null;
      }
    });
    this.ruimOp(blokken.length);
  }

  /** Ruimt de beelden vanaf `vanaf` op (de blokken die er niet meer zijn). */
  private ruimOp(vanaf: number) {
    for (const k of this.kijkers.slice(vanaf)) k?.dispose();
    this.kijkers.length = Math.min(this.kijkers.length, vanaf);
  }

  sluit() {
    this.gesloten = true;
    this.generatie++;
    this.ruimOp(0);
  }
}

// ── Afdruk ────────────────────────────────────────────────────────────────────

/**
 * De afbeelding op papier: de bladbreedte (178 mm ≈ 680 px) en hooguit
 * 260 px (≈ 68 mm) hoog, zodat een beeld geen half vel kost.
 */
const AFDRUK_BREEDTE = 680;
const AFDRUK_MAX_HOOGTE = 260;

/** Getekende afbeeldingen per scène; een herhaalde opbouw van de afdruk tekent ze niet opnieuw. */
const afbeeldingen = new Map<string, string>();
const BEWAARD = 24;

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

/** Verandert zodra er een 3D-afbeelding voor de afdruk klaar is; het afdrukvoorbeeld verdeelt dan opnieuw. */
export function useDrieDVersie(): number {
  return useSyncExternalStore(abonneer, () => versie);
}

function zetAfbeelding(vak: HTMLElement, url: string) {
  const img = document.createElement("img");
  img.className = "calc-3d-afbeelding";
  img.alt = "3D";
  img.src = url;
  vak.replaceChildren(img);
  vak.style.height = "auto";
}

/**
 * In een afdruk (PrintBlad, het rapport): elk 3D-blok onder `ref` wordt een
 * stilstaande afbeelding uit het standpunt van het blok. Lukt dat niet (geen
 * WebGL), dan blijft de projectie van de kern staan. Aanroepen met de html
 * die in `ref` staat: bij nieuwe html begint het opnieuw.
 */
export function useDrieDAfdruk(ref: RefObject<HTMLElement | null>, html: string) {
  useLayoutEffect(() => {
    const wortel = ref.current;
    if (!wortel || !html.includes("calc-3d")) return;
    const open: { blok: HTMLElement; vak: HTMLElement; scene: DrieDScene; sleutel: string; hoogte: number }[] = [];
    for (const blok of wortel.querySelectorAll<HTMLElement>(".calc-3d")) {
      const scene = leesScene(blok);
      const vak = blok.querySelector<HTMLElement>(".calc-3d-beeld");
      if (!scene || !vak) continue;
      const hoogte = Math.min(scene.hoogte, AFDRUK_MAX_HOOGTE);
      const sleutel = `${hoogte}|${blok.dataset.scene}`;
      const klaar = afbeeldingen.get(sleutel);
      if (klaar) {
        zetAfbeelding(vak, klaar);
        continue;
      }
      if (geenWebGL) continue;
      // Vóór het eerste verdelen en vóór het afdrukken: dit blok is nog niet klaar.
      blok.setAttribute("data-afdruk-laadt", "");
      open.push({ blok, vak, scene, sleutel, hoogte });
    }
    if (open.length === 0) return;
    let weg = false;
    void (async () => {
      let w: Weergave | null = null;
      try {
        w = await laadWeergave();
      } catch (err) {
        console.error("3D-weergave laden mislukt:", err);
      }
      for (const { blok, vak, scene, sleutel, hoogte } of open) {
        let url = afbeeldingen.get(sleutel);
        if (!url && w && !geenWebGL) {
          try {
            url = await w.naarAfbeelding(scene, AFDRUK_BREEDTE, hoogte);
            afbeeldingen.set(sleutel, url);
            while (afbeeldingen.size > BEWAARD) afbeeldingen.delete(afbeeldingen.keys().next().value!);
          } catch (err) {
            console.warn("3D-afbeelding voor de afdruk mislukt; de projectie blijft staan.", err);
            geenWebGL = true;
          }
        }
        // Opgeruimd: dit blok is weg (nieuwe html), of een nieuwe ronde neemt
        // het over (React tekent in de ontwikkelstand alles twee keer).
        if (weg) continue;
        if (url) zetAfbeelding(vak, url);
        blok.removeAttribute("data-afdruk-laadt");
      }
      meld();
    })();
    return () => {
      weg = true;
    };
  }, [ref, html]);
}
