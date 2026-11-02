/**
 * De waarden van de koppelingen, zoals het blad ze uitrekent.
 *
 * De editor wil laten zien wat de uitwerking straks tekent. Daarom rekent hij
 * het blad door tot de plek van de tekening, met daar een proefblok:
 *
 *     #hide
 *     tekproef_0 = h*schaal
 *     tekproef_0_k = tekproef_0*1 + 0
 *     #show
 *     @svg
 *     <i data-tekproef="{{tekproef_0}}|{{tekproef_0_k}}"></i>
 *     @end
 *
 * Precies het mechanisme van de tekening zelf, dus precies dezelfde getallen.
 * De tweede regel lukt niet als de waarde een eenheid heeft (200 mm + 0): dan
 * meldt de editor dat alleen het getal telt.
 *
 * Een eigen worker, niet die van de uitwerking: die rekent één verzoek
 * tegelijk en houdt er één in de wacht, en een proef mag de uitwerking niet
 * verdringen.
 */
import { useEffect, useRef, useState } from "react";
import type { RekenAntwoord, RekenVerzoek } from "../../rekenen/doorrekening";
import { calcpadIncludes, calcpadImageUrls } from "../../templates/calcpad-includes";
import { getSetting } from "../../store";

export interface Koppeling {
  waarde?: number;
  /** Een waarde die geen getal is, zoals een kleur (`k_M = "#DC2626"`). */
  tekst?: string;
  fout?: "fout" | "eenheid";
}

export interface Proef {
  per: Map<string, Koppeling>;
  /** De getallen van het blad tot de plek van de tekening, voor de keuzelijst. */
  variabelen: [string, number][];
  bezig: boolean;
}

let worker: Worker | null = null;
let volgnummer = 0;
const wachtend = new Map<string, (a: RekenAntwoord) => void>();
let hoekmodus = "rad";

getSetting<{ angleMode?: string }>("units", {})
  .then((u) => {
    if (u?.angleMode) hoekmodus = u.angleMode;
  })
  .catch(() => {});
window.addEventListener("units-changed", (e) => {
  const d = (e as CustomEvent<{ angleMode?: string }>).detail;
  if (d?.angleMode) hoekmodus = d.angleMode;
});

function deWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("../../rekenen/rekenWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<RekenAntwoord>) => {
      const klaar = wachtend.get(e.data.sleutel);
      wachtend.delete(e.data.sleutel);
      klaar?.(e.data);
    };
  }
  return worker;
}

function reken(source: string, waarden: Record<string, string>, scope: Record<string, unknown>): Promise<RekenAntwoord> {
  const sleutel = `tekproef-${++volgnummer}`;
  const verzoek: RekenVerzoek = {
    sleutel,
    source,
    waarden,
    scope,
    naam: "",
    hoekmodus,
    includes: [...calcpadIncludes],
    imageUrls: [...calcpadImageUrls],
  };
  return new Promise((klaar) => {
    wachtend.set(sleutel, klaar);
    deWorker().postMessage(verzoek);
  });
}

/** Het blad tot de plek van de tekening, met het proefblok erachter. */
export function proefBron(voor: string, formules: string[]): string {
  const regels = [voor, "#hide"];
  formules.forEach((f, i) => {
    regels.push(`tekproef_${i} = ${f}`, `tekproef_${i}_k = tekproef_${i}*1 + 0`);
  });
  const vak = formules.map((_, i) => `{{tekproef_${i}}}|{{tekproef_${i}_k}}`).join(";");
  regels.push("#show", "@svg", `<i data-tekproef="${vak}"></i>`, "@end");
  return regels.join("\n");
}

/** De uitkomst van het proefblok uit de uitwerking lezen. */
export function leesProef(html: string, formules: string[]): Map<string, Koppeling> {
  const uit = new Map<string, Koppeling>();
  const treffers = [...html.matchAll(/data-tekproef="([^"]*)"/g)];
  const laatste = treffers[treffers.length - 1]?.[1];
  const delen = laatste ? laatste.split(";") : [];
  formules.forEach((f, i) => {
    const [w, k] = (delen[i] ?? "").split("|");
    const waarde = Number(w);
    const tekst = w && w !== "NaN" && !w.includes("{{") ? w : undefined;
    if (!w || !Number.isFinite(waarde)) uit.set(f, tekst ? { tekst, fout: "fout" } : { fout: "fout" });
    else if (!Number.isFinite(Number(k))) uit.set(f, { waarde, fout: "eenheid" });
    else uit.set(f, { waarde });
  });
  return uit;
}

/**
 * Rekent de koppelingen uit, kort na elke wijziging. `voor` is het blad tot de
 * plek van de tekening; null: geen blad.
 */
export function useProef(
  formules: string[],
  voor: string | null,
  waarden: Record<string, string>,
  scope: Record<string, unknown>,
): Proef {
  const [proef, setProef] = useState<Proef>({ per: new Map(), variabelen: [], bezig: false });
  const vorige = useRef("");
  const sleutel = voor === null ? "" : [voor, formules.join("\u0001"), JSON.stringify(waarden), JSON.stringify(scope)].join("\u0000");

  useEffect(() => {
    if (voor === null || sleutel === vorige.current) return;
    let geldig = true;
    const wacht = window.setTimeout(() => {
      vorige.current = sleutel;
      setProef((p) => ({ ...p, bezig: true }));
      reken(proefBron(voor, formules), waarden, scope)
        .then((a) => {
          if (!geldig) return;
          const variabelen = Object.entries(a.uitkomst?.getallen ?? {})
            .filter(([n]) => !n.startsWith("tekproef_"))
            .sort(([a1], [b1]) => a1.localeCompare(b1));
          setProef({ per: leesProef(a.html, formules), variabelen, bezig: false });
        })
        .catch(() => {
          if (geldig) setProef((p) => ({ ...p, bezig: false }));
        });
    }, 250);
    return () => {
      geldig = false;
      window.clearTimeout(wacht);
      // Afgebroken voordat er gerekend werd: de volgende keer opnieuw proberen.
      if (vorige.current === sleutel) vorige.current = "";
    };
    // `sleutel` vat voor, formules, waarden en scope samen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleutel]);

  return proef;
}
