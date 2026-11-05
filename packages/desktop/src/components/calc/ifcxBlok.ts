/**
 * Het 3D-beeld uit een IFCX-document (`@ifcx …`) in de app.
 *
 * De rekenkern schrijft per blok `<div class="calc-ifcx" data-ifcx="…">` met het
 * document als JSON en een stilstaande projectie als SVG (packages/core/src/
 * ifcxBlok.ts). Hier komt daar het beeld van de app overheen, met als enige
 * invoer dat document:
 *
 *   uitwerking     een draaibaar beeld (Preview.tsx, `IfcxBeelden`), net als bij
 *                  `@3d` over herberekeningen heen: bij nieuwe invoer verhuist het
 *                  naar het nieuwe blok en blijft de camera staan.
 *   afdruk         een stilstaande afbeelding op de plaats van de projectie
 *                  (`useIfcxAfdruk`). Zolang die getekend wordt, draagt het blok
 *                  `data-afdruk-laadt`; het afdrukken wacht daarop.
 *
 * ifcxWeergave.ts (That Open) wordt pas geladen bij het eerste blok op het scherm;
 * de afdruk laadt alleen three.js (ifcxAfdruk.ts). Zonder WebGL blijft de projectie
 * van de kern staan, op het scherm en op papier, en is het IFCX nog te bewaren.
 */
import { useLayoutEffect, type RefObject } from "react";
import type { IfcxKijker, IfcxTeksten } from "./ifcxWeergave";

type Weergave = typeof import("./ifcxWeergave");

let weergave: Weergave | null = null;
let laden: Promise<Weergave> | null = null;
let geenWebGL: boolean | null = null;

export function heeftWebGL(): boolean {
  if (geenWebGL === null) {
    const proef = document.createElement("canvas");
    const gl = proef.getContext("webgl2") ?? proef.getContext("webgl");
    geenWebGL = !gl;
    (gl as WebGL2RenderingContext | null)?.getExtension("WEBGL_lose_context")?.loseContext();
  }
  return !geenWebGL;
}

function laadWeergave(): Promise<Weergave> {
  laden ??= import("./ifcxWeergave")
    .then((m) => (weergave = m))
    .catch((err) => {
      // Een volgende poging mag het opnieuw proberen.
      laden = null;
      throw err;
    });
  return laden;
}

/** De teksten van het beeld, in de taal van de app (rekentaal.json, drieD en ifcx). */
export function ifcxTeksten(vt: (sleutel: string, opties?: { defaultValue: string }) => string): IfcxTeksten {
  return {
    hint: vt("drieD.hint"),
    passend: vt("drieD.passend"),
    standpunt: {
      iso: vt("drieD.standpunt.iso"),
      voor: vt("drieD.standpunt.voor"),
      boven: vt("drieD.standpunt.boven"),
      zij: vt("drieD.standpunt.zij"),
    },
    opslaan: vt("ifcx.opslaan"),
    sluiten: vt("ifcx.sluiten"),
    attribuut: (kort) => vt(`ifcx.attribuut.${kort}`, { defaultValue: kort }),
  };
}

/**
 * Bewaren zonder draaibaar beeld: de knop staat dan op de projectie. Zonder WebGL
 * is de rest van het beeld er niet, en ook niet nodig om het bestand te krijgen.
 */
function bewaarknop(vak: HTMLElement, json: () => string, naam: string, blad: string | undefined, tekst: string) {
  if (vak.querySelector(".calc-3d-knoppen")) return;
  const balk = document.createElement("div");
  balk.className = "calc-3d-knoppen";
  const knop = document.createElement("button");
  knop.type = "button";
  knop.textContent = tekst;
  knop.addEventListener("click", () => {
    void import("./ifcxBewaren").then((m) => m.bewaarIfcx(json(), naam, blad));
  });
  balk.appendChild(knop);
  vak.appendChild(balk);
}

/**
 * De draaibare beelden van één uitwerking, op volgorde van de blokken. Na elke
 * doorrekening `koppel`; bij het sluiten van de uitwerking `sluit`.
 */
export class IfcxBeelden {
  private kijkers: (IfcxKijker | null)[] = [];
  /** Het blad waarvan de beelden zijn; een ander blad begint met verse beelden. */
  private blad: string | undefined;
  private generatie = 0;
  private gesloten = false;
  private readonly teksten: () => IfcxTeksten;

  constructor(teksten: () => IfcxTeksten) {
    this.teksten = teksten;
  }

  koppel(wortel: HTMLElement | null, blad: string | undefined, naam: string) {
    const generatie = ++this.generatie;
    if (blad !== this.blad) {
      this.ruimOp(0);
      this.blad = blad;
    }
    const blokken = wortel ? [...wortel.querySelectorAll<HTMLElement>(".calc-ifcx[data-ifcx]")] : [];
    if (blokken.length === 0) {
      this.ruimOp(0);
      return;
    }
    if (!heeftWebGL()) {
      this.ruimOp(0);
      for (const blok of blokken) {
        const vak = blok.querySelector<HTMLElement>(".calc-ifcx-beeld");
        if (vak) bewaarknop(vak, () => blok.dataset.ifcx ?? "", naam, blad, this.teksten().opslaan);
      }
      return;
    }
    if (!weergave) {
      // Eerst de viewer laden; tot dan staat de projectie er.
      laadWeergave()
        .then(() => {
          if (generatie === this.generatie && !this.gesloten && wortel?.isConnected) this.koppel(wortel, blad, naam);
        })
        .catch((err) => console.error("IFCX-weergave laden mislukt:", err));
      return;
    }
    blokken.forEach((blok, i) => {
      const vak = blok.querySelector<HTMLElement>(".calc-ifcx-beeld");
      const json = blok.dataset.ifcx ?? "";
      if (!vak) return;
      const kijker = this.kijkers[i];
      if (kijker) {
        kijker.verhuis(vak, json, naam);
        return;
      }
      try {
        this.kijkers[i] = new weergave!.IfcxKijker(vak, json, naam, blad, this.teksten());
      } catch (err) {
        console.warn("Geen WebGL; het IFCX-beeld blijft een stilstaande projectie.", err);
        geenWebGL = true;
        this.kijkers[i] = null;
        bewaarknop(vak, () => blok.dataset.ifcx ?? "", naam, blad, this.teksten().opslaan);
      }
    });
    this.ruimOp(blokken.length);
  }

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
 * De afbeelding op papier: de bladbreedte (178 mm ≈ 680 px) en 230 px (≈ 60 mm)
 * hoog. Compact: een balklaag is plat, en het blad moet op ± 3 pagina's blijven.
 */
const AFDRUK_BREEDTE = 680;
const AFDRUK_HOOGTE = 230;

const afbeeldingen = new Map<string, string>();
const BEWAARD = 24;

function zetAfbeelding(vak: HTMLElement, url: string) {
  const img = document.createElement("img");
  img.className = "calc-ifcx-afbeelding";
  img.alt = "3D";
  img.src = url;
  vak.replaceChildren(img);
  vak.style.height = "auto";
}

/**
 * In een afdruk (PrintBlad, het rapport): elk blok onder `ref` dat op papier hoort,
 * wordt een stilstaande afbeelding. Lukt dat niet (geen WebGL), dan blijft de
 * projectie van de kern staan.
 */
export function useIfcxAfdruk(ref: RefObject<HTMLElement | null>, html: string) {
  useLayoutEffect(() => {
    const wortel = ref.current;
    if (!wortel || !html.includes("calc-ifcx")) return;
    const open: { blok: HTMLElement; vak: HTMLElement; json: string }[] = [];
    for (const blok of wortel.querySelectorAll<HTMLElement>(".calc-ifcx[data-ifcx]")) {
      // Wat alleen op het scherm staat, hoeft niet getekend.
      if (blok.classList.contains("alleen-scherm")) continue;
      const vak = blok.querySelector<HTMLElement>(".calc-ifcx-beeld");
      const json = blok.dataset.ifcx;
      if (!vak || !json) continue;
      const klaar = afbeeldingen.get(json);
      if (klaar) {
        zetAfbeelding(vak, klaar);
        continue;
      }
      if (!heeftWebGL()) continue;
      blok.setAttribute("data-afdruk-laadt", "");
      open.push({ blok, vak, json });
    }
    if (open.length === 0) return;
    let weg = false;
    void (async () => {
      for (const { blok, vak, json } of open) {
        let url = afbeeldingen.get(json);
        if (!url && heeftWebGL()) {
          try {
            const { ifcxAfbeelding } = await import("./ifcxAfdruk");
            url = await ifcxAfbeelding(json, AFDRUK_BREEDTE, AFDRUK_HOOGTE);
            afbeeldingen.set(json, url);
            while (afbeeldingen.size > BEWAARD) afbeeldingen.delete(afbeeldingen.keys().next().value!);
          } catch (err) {
            console.warn("3D-afbeelding voor de afdruk mislukt; de projectie blijft staan.", err);
            geenWebGL = true;
          }
        }
        if (weg) continue;
        if (url) zetAfbeelding(vak, url);
        blok.removeAttribute("data-afdruk-laadt");
      }
    })();
    return () => {
      weg = true;
    };
  }, [ref, html]);
}
