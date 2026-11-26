import { maakStaaflijst, zijdenKort } from "./poerStaven.ts";
import type { PoerVorm } from "./poerDxf.ts";

/*
 * Revisies van het wapeningsdetail van een poer: een nummer dat omhooggaat zodra de
 * getoetste wapening of de maten veranderen, met wat er sinds de vorige revisie anders is.
 *
 * Een revisie hangt aan de inhoud, niet aan een klik: `revisieInhoud` vat de poer samen
 * (maten van poer, palen en kolom, en per staafgroep de regel uit de staaflijst met de
 * hoogte van de staven). Is die gelijk aan de vastgelegde revisie, dan geldt diens
 * nummer; anders het volgende, nog niet vastgelegd. Vastleggen gebeurt bij het opslaan van
 * het DXF-detail of de IFCX, of met de knop in het beeld: dan gaan het nummer, de datum, de
 * inhoud en de inhoud van de vorige revisie als waarden in het blad (`poer_rev…`), en gaan
 * ze mee met het project. Wie het blad terugzet naar de vastgelegde inhoud, krijgt het oude
 * nummer terug; wie hem verandert, ziet meteen het volgende nummer in de titel.
 *
 * De sleutels van een staafgroep zijn de vaste sleutels uit de definitie (`band/x`,
 * `randbeugel`), niet de merken: een merk schuift op als er een staafsoort bijkomt.
 *
 * Handwerk aan een getekend detail wordt niet bewaard: het detail komt altijd uit de
 * definitie. Zie docs/tweepaalspoer-toetsing.md, §10.
 *
 * Geen imports buiten de poerbestanden: het controlescript laadt dit bestand in Node.
 */

/** De waarden van het blad waarin een revisie staat. */
export const REVISIE_VELD = {
  nr: "poer_rev",
  datum: "poer_rev_datum",
  inhoud: "poer_rev_inhoud",
  vorig: "poer_rev_vorig",
} as const;

export type RevisieInhoud = Record<string, string>;

export interface RevisieStand {
  /** 0: nog geen revisie vastgelegd. */
  nr: number;
  datum: string;
  inhoud: RevisieInhoud | null;
  vorig: RevisieInhoud | null;
}

export interface Wijziging {
  sleutel: string;
  /** null: nieuw. */
  oud: string | null;
  /** null: vervallen. */
  nieuw: string | null;
}

export interface Revisie {
  nr: number;
  /** De datum van de vastgelegde revisie; null als hij nog niet is vastgelegd. */
  datum: string | null;
  vastgelegd: boolean;
  /** Het nummer waartegen `wijzigingen` vergelijkt; 0 als er niets is om mee te vergelijken. */
  sinds: number;
  wijzigingen: Wijziging[];
}

const mm = (w: number) => String(Math.round(w));

/**
 * De poer samengevat voor een revisie. Gelijke poeren geven een gelijke samenvatting; op
 * de millimeter, zoals de staaflijst.
 */
export function revisieInhoud(v: PoerVorm): RevisieInhoud {
  const uit: RevisieInhoud = {};
  const xs = v.omtrek.map((p) => p[0]);
  const ys = v.omtrek.map((p) => p[1]);
  const breedte = (w: number[]) => (w.length ? Math.max(...w) - Math.min(...w) : 0);
  uit.poer = `${mm(breedte(xs))} × ${mm(breedte(ys))} × ${mm(v.h)}`;
  uit.palen = v.palen.map(([x, y]) => `(${mm(x)}; ${mm(y)})`).join(" ");
  uit.paal = `${v.paal.rond ? `Ø${mm(v.paal.x)}` : `${mm(v.paal.x)} × ${mm(v.paal.y)}`}, t = ${mm(v.paal.inbedding)}`;
  uit.kolom = v.kolom.rond ? `Ø${mm(v.kolom.x)}` : `${mm(v.kolom.x)} × ${mm(v.kolom.y)}`;
  const lijst = maakStaaflijst(v.staven);
  for (const r of lijst.regels) {
    const maten = r.verlopend ? `${mm(r.lengte)}–${mm(r.lengteMax)}` : zijdenKort(r).map(mm).join("/");
    uit[`staaf ${r.sleutels.join(" + ")}`] = `${r.aantal} × Ø${mm(r.d)}, ${r.vorm}, ${maten}, L ${mm(r.lengte)}`;
  }
  // De hoogte van de staven per groep: zo telt een band die een laag hoger komt ook mee.
  const hoogten = new Map<string, Set<string>>();
  for (const s of v.staven) {
    const z = Math.min(...s.pad.map((p) => p[2]));
    if (!hoogten.has(s.sleutel)) hoogten.set(s.sleutel, new Set());
    hoogten.get(s.sleutel)!.add(mm(z));
  }
  for (const [sleutel, z] of hoogten) uit[`hoogte ${sleutel}`] = [...z].sort((a, b) => Number(a) - Number(b)).join("/");
  return uit;
}

function leesInhoud(tekst: string | undefined): RevisieInhoud | null {
  if (!tekst) return null;
  try {
    const w = JSON.parse(tekst) as unknown;
    if (!w || typeof w !== "object" || Array.isArray(w)) return null;
    return Object.fromEntries(Object.entries(w as Record<string, unknown>).map(([k, v]) => [k, String(v)]));
  } catch {
    return null;
  }
}

/** De vastgelegde revisie uit de waarden van het blad. */
export function leesRevisie(waarden: Readonly<Record<string, string | undefined>>): RevisieStand {
  const nr = Math.max(0, Math.round(parseFloat(String(waarden[REVISIE_VELD.nr] ?? "0").replace(",", ".")) || 0));
  const inhoud = leesInhoud(waarden[REVISIE_VELD.inhoud]);
  return {
    nr: inhoud ? Math.max(1, nr) : 0,
    datum: String(waarden[REVISIE_VELD.datum] ?? ""),
    inhoud,
    vorig: leesInhoud(waarden[REVISIE_VELD.vorig]),
  };
}

/** Wat er van `a` naar `b` veranderd is, in de volgorde van `b` en daarna wat verviel. */
export function verschil(a: RevisieInhoud, b: RevisieInhoud): Wijziging[] {
  const uit: Wijziging[] = [];
  for (const [k, v] of Object.entries(b)) if (a[k] !== v) uit.push({ sleutel: k, oud: a[k] ?? null, nieuw: v });
  for (const [k, v] of Object.entries(a)) if (!(k in b)) uit.push({ sleutel: k, oud: v, nieuw: null });
  return uit;
}

const gelijk = (a: RevisieInhoud, b: RevisieInhoud) => verschil(a, b).length === 0;

/** De revisie van de poer zoals hij nu is. */
export function huidigeRevisie(stand: RevisieStand, inhoud: RevisieInhoud): Revisie {
  if (!stand.inhoud) return { nr: 1, datum: null, vastgelegd: false, sinds: 0, wijzigingen: [] };
  if (gelijk(stand.inhoud, inhoud)) {
    return {
      nr: stand.nr, datum: stand.datum || null, vastgelegd: true,
      sinds: stand.vorig ? stand.nr - 1 : 0,
      wijzigingen: stand.vorig ? verschil(stand.vorig, stand.inhoud) : [],
    };
  }
  return { nr: stand.nr + 1, datum: null, vastgelegd: false, sinds: stand.nr, wijzigingen: verschil(stand.inhoud, inhoud) };
}

/**
 * De waarden die de huidige revisie vastleggen, of null als hij al vastligt. `datum` als
 * JJJJ-MM-DD; de aanroeper geeft hem mee, zodat dezelfde aanroep hetzelfde geeft.
 */
export function vastleggen(stand: RevisieStand, inhoud: RevisieInhoud, datum: string): Record<string, string> | null {
  const r = huidigeRevisie(stand, inhoud);
  if (r.vastgelegd) return null;
  return {
    [REVISIE_VELD.nr]: String(r.nr),
    [REVISIE_VELD.datum]: datum,
    [REVISIE_VELD.inhoud]: JSON.stringify(inhoud),
    [REVISIE_VELD.vorig]: stand.inhoud ? JSON.stringify(stand.inhoud) : "",
  };
}

/** De datum van vandaag als JJJJ-MM-DD, in de tijd van de computer. */
export function vandaag(nu = new Date()): string {
  const t = (n: number) => String(n).padStart(2, "0");
  return `${nu.getFullYear()}-${t(nu.getMonth() + 1)}-${t(nu.getDate())}`;
}
