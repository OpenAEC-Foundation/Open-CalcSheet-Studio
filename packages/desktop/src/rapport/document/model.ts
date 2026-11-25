/**
 * Het tussenmodel voor de export van het rapport naar DOCX en ODT.
 *
 * uitAfdruk.ts leest de opgemaakte afdruk uit tot dit model; docx.ts en odt.ts schrijven
 * het als bestand. Het model kent alleen wat beide formaten kunnen: alinea's met
 * opgemaakte tekst, koppen, tabellen, formules, afbeeldingen en pagina-einden.
 */

/** Een stuk tekst met één opmaak. */
export interface TekstRun {
  soort: "tekst";
  tekst: string;
  vet?: boolean;
  cursief?: boolean;
  onderstreept?: boolean;
  /** Verlaagd of verhoogd, zoals een index of een macht. */
  positie?: "sub" | "sup";
  /** Vaste breedte, voor code. */
  mono?: boolean;
  /** Een kleur als `RRGGBB`, alleen als hij afwijkt van zwart. */
  kleur?: string;
}

/** Een formule: de MathML van KaTeX, en de tekst als terugval. */
export interface FormuleRun {
  soort: "formule";
  mathml: string;
  /** De formule als platte tekst, voor wie de formule niet kan lezen. */
  tekst: string;
  /** Een formule op een eigen regel, anders in de lopende tekst. */
  blok?: boolean;
}

/** Een afbeelding uit `RapportDocument.beelden`. */
export interface BeeldRun {
  soort: "beeld";
  beeld: number;
}

export interface RegeleindeRun { soort: "regeleinde" }
export interface TabRun { soort: "tab" }

export type Run = TekstRun | FormuleRun | BeeldRun | RegeleindeRun | TabRun;

export interface Alinea {
  soort: "alinea";
  runs: Run[];
  /** Een kop: 1 hoofdstuk, 2 paragraaf of blad, 3 kop in een blad. */
  kop?: 1 | 2 | 3;
  /** Een eigen stijl: de regel over de momentopname, of code. */
  stijl?: "momentopname" | "code";
  uitlijning?: "midden" | "rechts";
  /** Inspringen in stappen, voor lijsten. */
  inspringen?: number;
  /** Begint op een nieuwe pagina. */
  nieuwePagina?: boolean;
}

export interface Cel {
  alineas: Alinea[];
  kolommen: number;
  rijen: number;
  kop?: boolean;
}

export interface Tabel {
  soort: "tabel";
  rijen: Cel[][];
  nieuwePagina?: boolean;
}

export type DocBlok = Alinea | Tabel;

export interface Beeld {
  bytes: Uint8Array;
  type: "png" | "jpeg";
  /** De maat op papier; nooit breder dan de bladspiegel. */
  breedteMm: number;
  hoogteMm: number;
}

/** Het rapport als document, klaar om weg te schrijven. */
export interface RapportDocument {
  titel: string;
  /** De taal van het rapport, als `nl` of `en-GB`. */
  taal: string;
  /** De tekst in de voet van elke pagina: project, revisie en exportmoment. */
  voettekst: string;
  /** Het lettertype van de huisstijl. */
  lettertype: string;
  /** Een letter met schreef: bepaalt de vervanger als het lettertype ontbreekt. */
  schreef?: boolean;
  /** Het exportmoment, als ISO-tekst. */
  gemaakt: string;
  blokken: DocBlok[];
  beelden: Beeld[];
}

/** De breedte van de bladspiegel in mm: A4 met 20 mm marge links en rechts. */
export const BLADSPIEGEL_MM = 170;

/** Een maat binnen de bladspiegel, met dezelfde verhouding. */
export function pasInBladspiegel(breedteMm: number, hoogteMm: number): { breedteMm: number; hoogteMm: number } {
  if (!(breedteMm > 0) || !(hoogteMm > 0)) return { breedteMm: 10, hoogteMm: 10 };
  const f = Math.min(1, BLADSPIEGEL_MM / breedteMm, 247 / hoogteMm);
  return { breedteMm: breedteMm * f, hoogteMm: hoogteMm * f };
}

/** De runs van een alinea als platte tekst: voor controle en voor de lijst van wat ontbreekt. */
export function alineaTekst(a: Alinea): string {
  return a.runs.map((r) => (r.soort === "tekst" ? r.tekst : r.soort === "formule" ? r.tekst : r.soort === "tab" ? "\t" : r.soort === "regeleinde" ? "\n" : "")).join("");
}

/**
 * Een tabel als rooster: per rij een vak per kolom. Een cel die over meer kolommen of
 * rijen loopt, staat in zijn eerste vak; de vakken die hij verder bedekt, verwijzen naar
 * hem (`bedekt`). Zo schrijven DOCX en ODT dezelfde indeling.
 */
export type Vak = { cel: Cel; bedekt: false } | { cel: Cel; bedekt: true; zelfdeRij: boolean };

export function rooster(tabel: Tabel): { vakken: Vak[][]; kolommen: number } {
  const vakken: Vak[][] = [];
  tabel.rijen.forEach((rij, r) => {
    vakken[r] ??= [];
    let k = 0;
    for (const cel of rij) {
      while (vakken[r][k]) k++;
      for (let dr = 0; dr < Math.max(1, cel.rijen); dr++) {
        if (dr > 0 && r + dr >= tabel.rijen.length) break;
        vakken[r + dr] ??= [];
        for (let dk = 0; dk < Math.max(1, cel.kolommen); dk++) {
          vakken[r + dr][k + dk] = dr === 0 && dk === 0 ? { cel, bedekt: false } : { cel, bedekt: true, zelfdeRij: dr === 0 };
        }
      }
      k += Math.max(1, cel.kolommen);
    }
  });
  const kolommen = Math.max(1, ...vakken.map((r) => r.length));
  const leeg = (): Cel => ({ alineas: [], kolommen: 1, rijen: 1 });
  for (const r of vakken) for (let k = 0; k < kolommen; k++) r[k] ??= { cel: leeg(), bedekt: false };
  return { vakken, kolommen };
}
