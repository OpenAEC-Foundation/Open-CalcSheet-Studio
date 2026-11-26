import {
  decimalenNa,
  doelInStelsel,
  eenheidInBeeld,
  eenheidUitBeeld,
  invoerNaarBron,
  omrekenen,
  toonInvoer,
  type Stelsel,
} from "@ifc-calc/core";

/**
 * De parametrische beelden in het eenhedenstelsel van het project
 * (docs/superpowers/specs/2026-11-06-eenheden-design.md, stap 3).
 *
 * Een beeld rekent zoals altijd in de eenheid van het blad. Alleen wat in beeld staat,
 * rekent om: een maat van 4500 mm staat in US customary als 177,2 in. De bron is de
 * eenheid zoals het beeld hem tot nu toe schreef ("mm", "kNm", "kN/m²"); rekent het
 * stelsel hem niet om, dan blijft die tekst precies staan.
 */
export interface BeeldEenheden {
  /** De doeleenheid in de schrijfwijze van de rekenkern, of `null` als hij niet omrekent. */
  doel(bron: string): string | null;
  /** De eenheid in beeld: de doeleenheid, of `bron` zoals hij gegeven is. */
  eenheid(bron: string): string;
  /** Het getal in beeld. */
  waarde(v: number, bron: string): number;
  /** Het aantal decimalen in beeld voor `dec` decimalen in de bron, met dezelfde nauwkeurigheid. */
  decimalen(dec: number, bron: string): number;
  /** Het getal met de eenheid erachter, opgemaakt met de notatie van het beeld. */
  tekst(v: number, bron: string, dec: number, opmaak: (v: number, dec: number) => string): string;
  /**
   * De waarde in een bewerkveld: zes significante cijfers in de eenheid in beeld. Een opgeslagen
   * tekst die geen getal is (leeg, een uitdrukking), blijft staan; zonder omrekening altijd letterlijk.
   */
  invoer(v: number | string, bron: string): string;
  /** Een getypt getal in de eenheid in beeld, terug naar de bron; `null` als het geen getal is. */
  terug(getypt: string, bron: string): number | null;
  /** Een label met de eenheid tussen haakjes ("Cantilever a (mm)"), met de eenheid in beeld. */
  label(tekst: string, bron: string): string;
  /**
   * Een getypte waarde ("2,4") op papier in het stelsel, met evenveel nauwkeurigheid als
   * getypt; `null` als er niets om te rekenen is (geen stelsel, geen getal): dan blijft de tekst.
   */
  getypt(tekst: string, bron: string, opmaak: (v: number, dec: number) => string): string | null;
  /**
   * Wat een rapportveld opslaat als iemand `tekst` typt in een veld in de eenheid in beeld:
   * het getal in `bron`, op zes cijfers, met een komma als het rapport die gebruikt. `null`:
   * nog niets opslaan (een tussenstand); `fout`: deze tekst past niet bij het veld. Zonder
   * omrekening de tekst letterlijk.
   */
  opslag(tekst: string, bron: string, komma: boolean): { waarde: string } | { fout: string } | null;
}

/** Een getal zoals iemand het in het rapport typt: met een punt of een komma. */
const GETYPT_GETAL = /^[-+]?(\d+([.,]\d*)?|[.,]\d+)$/;

/** Zonder rekenruis: 304,79999999999995 wordt 304,8. */
const schoon = (n: number) => parseFloat(n.toPrecision(12));

export function beeldEenheden(stelsel: Stelsel | undefined): BeeldEenheden {
  const doel = (bron: string): string | null => {
    if (!stelsel || !bron.trim()) return null;
    const rekenBron = eenheidUitBeeld(bron);
    const d = doelInStelsel(rekenBron, stelsel);
    if (!d) return null;
    try {
      // Kent de rekenkern de omrekening niet (een eenheid die alleen in een blad
      // bestaat), dan blijft hij zoals hij is.
      omrekenen(1, rekenBron, d);
      return d;
    } catch {
      return null;
    }
  };
  const waarde = (v: number, bron: string) => {
    const d = doel(bron);
    return d && Number.isFinite(v) ? omrekenen(v, eenheidUitBeeld(bron), d) : v;
  };
  const decimalen = (dec: number, bron: string) => {
    const d = doel(bron);
    return d ? decimalenNa(dec, eenheidUitBeeld(bron), d) : dec;
  };
  const eenheid = (bron: string) => {
    const d = doel(bron);
    return d ? eenheidInBeeld(d) : bron;
  };
  return {
    doel,
    eenheid,
    waarde,
    decimalen,
    tekst: (v, bron, dec, opmaak) => {
      const e = eenheid(bron);
      const getal = opmaak(waarde(v, bron), decimalen(dec, bron));
      return e ? `${getal} ${e}` : getal;
    },
    invoer: (v, bron) => {
      const d = doel(bron);
      return d ? toonInvoer(String(v), eenheidUitBeeld(bron), d) : String(v);
    },
    terug: (getypt, bron) => {
      const n = parseFloat(getypt.trim().replace(",", "."));
      if (!Number.isFinite(n)) return null;
      const d = doel(bron);
      return d ? schoon(omrekenen(n, d, eenheidUitBeeld(bron))) : n;
    },
    label: (tekst, bron) => (doel(bron) ? tekst.split(`(${bron})`).join(`(${eenheid(bron)})`) : tekst),
    getypt: (tekst, bron, opmaak) => {
      const d = doel(bron);
      const t = tekst.trim();
      if (!d || !GETYPT_GETAL.test(t)) return null;
      const rekenBron = eenheidUitBeeld(bron);
      const v = omrekenen(parseFloat(t.replace(",", ".")), rekenBron, d);
      // Evenveel nauwkeurigheid als getypt, met minstens twee en hooguit drie significante
      // cijfers: 0,07 m wordt 0,23 ft (niet 0,2), en een waarde die uit een omgerekende invoer
      // komt (2.39401 kN/m², 50 psf getypt) wordt 50 en niet 50,0000.
      const nauw = decimalenNa((t.split(/[.,]/)[1] ?? "").length, rekenBron, d);
      const voor = (k: number) => (v === 0 ? nauw : Math.max(0, k - 1 - Math.floor(Math.log10(Math.abs(v)))));
      const minstens = Math.max(nauw, voor(2));
      const dec = Math.min(minstens, voor(3));
      const uit = opmaak(v, dec);
      // Ingekort: dan geen nullen achteraan die er niet getypt zijn (30,0 wordt 30).
      return dec < minstens ? uit.replace(/([.,]\d*?)0+$/, "$1").replace(/[.,]$/, "") : uit;
    },
    opslag: (tekst, bron, komma) => {
      const d = doel(bron);
      if (!d) return { waarde: tekst };
      const t = eenheidUitBeeld(tekst);
      if (t === "") return { waarde: "" };
      // Halverwege een exponent ("1e", "1e-"): nog niets; anders rekent mathjs 1·e uit.
      if (/[eE][-+]?$/.test(t)) return null;
      const terug = invoerNaarBron(t, d, eenheidUitBeeld(bron));
      if ("fout" in terug) return terug;
      const n = Number(terug.waarde.replace(",", "."));
      if (!Number.isFinite(n)) return null;
      // Zes cijfers, net als in het veld: meer is schijnprecisie op papier.
      const s = String(parseFloat(n.toPrecision(6)));
      return { waarde: komma ? s.replace(".", ",") : s };
    },
  };
}
