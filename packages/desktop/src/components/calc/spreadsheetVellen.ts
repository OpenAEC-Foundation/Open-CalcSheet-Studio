import type { WorkbookHandle } from "@betteroffice/xlsx";
import type { Bereik } from "./spreadsheetLogica";

/*
 * Hoe een werkmap over de vellen papier valt. Eén berekening voor de afdruk
 * (spreadsheetBlad.ts) en voor de lijnen in het raster (spreadsheetLaag.tsx), zodat
 * het raster laat zien wat er echt op papier komt; check-spreadsheet.mjs legt de
 * uitkomst naast de getekende afbeeldingen.
 *
 * Een werkblad dat te breed is, wordt kleiner tot de breedte van de bladspiegel: er
 * is dus altijd één rand rechts, nooit een tweede kolom vellen. Een te lang werkblad
 * gaat in stukken langs de rijgrenzen, en elk vel neemt zoveel rijen als er passen.
 * Omdat dat alleen van de rijen op dat vel afhangt, verschuiven eerdere grenzen niet
 * als er onderaan iets bijkomt.
 *
 * De maten komen uit `cellRect`, niet uit een getekende afbeelding: de rekenkern
 * tekent geen afbeelding hoger dan 16384 px, dus een heel werkblad tekenen om het te
 * meten kan bij meer dan zo'n vierhonderd rijen al niet.
 */

/** Tekenschaal: 2 is 192 dpi op ware grootte, scherp genoeg voor tekst op papier. */
export const TEKENSCHAAL = 2;
export const MM_PER_PX = 25.4 / 96;
/** Ruimte boven het eerste vel voor de kop van het blad, als bij een PDF-blad. */
export const KOP_RUIMTE = 20;
/** Ruimte voor de naam van het werkblad boven de cellen. */
export const NAAM_RUIMTE = 7;
/** Meer vellen dan dit komen niet op papier; een melding zegt dat het er meer zijn. */
export const MAX_VELLEN = 60;
/** De langste zijde die de rekenkern als afbeelding tekent. */
const MAX_PNG_ZIJDE = 16_384;
const LAATSTE_RIJ = 1_048_575;
const LAATSTE_KOLOM = 16_383;

export type VelKern = Pick<WorkbookHandle, "readCells" | "selectionData" | "cellRect">;

/** Wat er op één vel past, in millimeter, zonder de kop en de werkbladnaam. */
export interface Bladspiegel {
  breedte: number;
  hoogte: number;
}

/** De rijen op één vel. */
export interface Rijstuk {
  van: number;
  tot: number;
}

/** Eén werkblad op papier. */
export interface WerkbladVellen {
  /** De plek van het werkblad in de werkmap. */
  index: number;
  /** De naam boven de cellen; leeg als er maar één werkblad op papier komt. */
  naam: string;
  /** Wat op papier komt: alleen het gebruikte deel. */
  bereik: Bereik;
  /** Hoe breed het bereik op ware grootte is, zoals het getekend wordt. */
  breedtePx: number;
  /** Verkleining om binnen de bladspiegel te passen; ten hoogste 1. */
  schaal: number;
  /** De tekenschaal van de afbeeldingen; lager dan TEKENSCHAAL als een stuk anders te groot wordt. */
  tekenschaal: number;
  stukken: Rijstuk[];
}

export interface Verdeling {
  bladen: WerkbladVellen[];
  /** De werkmap past niet op MAX_VELLEN vellen. */
  afgekapt: boolean;
}

/**
 * Verdeelt rijen over vellen. `y(rij)` is de bovenkant van die rij in pixels, `ruimte`
 * de hoogte van een vel in dezelfde pixels. Elk vel neemt de meeste rijen die passen,
 * en minstens één: een rij hoger dan een vel krijgt een vel voor zich.
 */
export function verdeelRijen(
  y: (rij: number) => number,
  eerste: number,
  laatste: number,
  ruimte: (eersteVel: boolean) => number,
  max: number,
): Rijstuk[] {
  const uit: Rijstuk[] = [];
  let van = eerste;
  while (van <= laatste && uit.length < max) {
    const grens = y(van) + ruimte(uit.length === 0);
    let laag = van;
    let hoog = laatste;
    while (laag < hoog) {
      const midden = Math.ceil((laag + hoog) / 2);
      if (y(midden + 1) <= grens) laag = midden;
      else hoog = midden - 1;
    }
    uit.push({ van, tot: laag });
    van = laag + 1;
  }
  return uit;
}

/** De bovenkant van een rij in pixels; de cellen tellen op, ook boven een vastgezette rij. */
function rijMaat(kern: VelKern, blad: number): (rij: number) => number {
  return (rij) => {
    if (rij > LAATSTE_RIJ) {
      const laatste = kern.cellRect(blad, LAATSTE_RIJ, 0);
      return laatste.y + laatste.h;
    }
    return kern.cellRect(blad, rij, 0).y;
  };
}

/** De breedte zoals de rekenkern hem tekent: afgerond op hele pixels van de afbeelding. */
function getekendeBreedte(kern: VelKern, blad: number, b: Bereik): number {
  const links = kern.cellRect(blad, b.top, b.left);
  const rechts = kern.cellRect(blad, b.top, b.right);
  return Math.ceil((rechts.x + rechts.w - links.x) * TEKENSCHAAL) / TEKENSCHAAL;
}

const schaalVoor = (breedtePx: number, spiegel: Bladspiegel) => Math.min(1, spiegel.breedte / (breedtePx * MM_PER_PX));

function velRuimte(spiegel: Bladspiegel, schaal: number, eersteOpPapier: boolean, metNaam: boolean) {
  return (eersteVel: boolean) =>
    (spiegel.hoogte - (eersteOpPapier && eersteVel ? KOP_RUIMTE : 0) - (metNaam ? NAAM_RUIMTE : 0)) / (MM_PER_PX * schaal);
}

/** De werkbladen met inhoud, zonder verborgen werkbladen: die komen niet op papier. */
function bladenMetInhoud(kern: VelKern): { index: number; naam: string; bereik: Bereik }[] {
  const catalogus = kern.readCells({ ranges: [] });
  if (!catalogus.ok) throw new Error(catalogus.failure.message);
  const uit: { index: number; naam: string; bereik: Bereik }[] = [];
  catalogus.sheets.forEach((blad, index) => {
    if (blad.visibility && blad.visibility !== "visible") return;
    const bereik = kern.selectionData(index, 0, 0, "usedRange").usedRange;
    if (bereik) uit.push({ index, naam: blad.name, bereik });
  });
  return uit;
}

/** Wat er op papier komt. */
export function verdeelWerkmap(kern: VelKern, spiegel: Bladspiegel): Verdeling {
  const inhoud = bladenMetInhoud(kern);
  const bladen: WerkbladVellen[] = [];
  let geteld = 0;
  let afgekapt = false;
  for (const { index, naam, bereik } of inhoud) {
    if (geteld >= MAX_VELLEN) {
      afgekapt = true;
      break;
    }
    const metNaam = inhoud.length > 1;
    const breedtePx = getekendeBreedte(kern, index, bereik);
    const schaal = schaalVoor(breedtePx, spiegel);
    const y = rijMaat(kern, index);
    const stukken = verdeelRijen(y, bereik.top, bereik.bottom, velRuimte(spiegel, schaal, geteld === 0, metNaam), MAX_VELLEN - geteld);
    if (stukken[stukken.length - 1].tot < bereik.bottom) afgekapt = true;
    const hoogste = Math.max(...stukken.map((s) => y(s.tot + 1) - y(s.van)));
    const tekenschaal = Math.min(TEKENSCHAAL, MAX_PNG_ZIJDE / (breedtePx + 1), MAX_PNG_ZIJDE / (hoogste + 1));
    bladen.push({ index, naam: metNaam ? naam : "", bereik, breedtePx, schaal, tekenschaal, stukken });
    geteld += stukken.length;
  }
  return { bladen, afgekapt };
}

/** Eén vel in het raster: tot waar het loopt, en of er inhoud op staat. */
export interface VelGrens {
  /** De laatste rij op dit vel. */
  tot: number;
  /** Het nummer van het vel in de hele uitdraai. */
  nummer: number;
  /** Staat er inhoud op? Anders is het het vel dat erbij komt als het werkblad doorloopt. */
  metInhoud: boolean;
}

/** De grenzen van de vellen op één werkblad, in rijen en kolommen. */
export interface VelLijnen {
  /** Waar het papier begint: de linkerbovenhoek van het gebruikte deel. */
  links: number;
  boven: number;
  /** De rand rechts: in deze kolom, zoveel pixels vanaf haar linkerkant. */
  rechtsKolom: number;
  rechtsBinnen: number;
  rechtsKolomBreedte: number;
  schaal: number;
  vellen: VelGrens[];
  /** Na het laatste vel komt niets meer op papier (MAX_VELLEN). */
  vol: boolean;
}

/**
 * De lijnen voor één werkblad. De vellen lopen door tot de grens van MAX_VELLEN, ook
 * voorbij de inhoud, zodat te zien is hoeveel er nog past. Een leeg werkblad begint
 * bij A1: daar komt het papier zodra er iets in staat.
 */
export function velLijnen(kern: VelKern, blad: number, spiegel: Bladspiegel): VelLijnen {
  const { bladen } = verdeelWerkmap(kern, spiegel);
  const dit = bladen.find((b) => b.index === blad);
  const bereik: Bereik = dit?.bereik ?? { top: 0, left: 0, bottom: 0, right: 0 };
  const eerder = bladen.filter((b) => b.index < blad);
  const alEerder = eerder.reduce((n, b) => n + b.stukken.length, 0);
  const metNaam = dit ? bladen.length > 1 : bladen.length > 0;
  const schaal = dit?.schaal ?? 1;

  const y = rijMaat(kern, blad);
  const stukken = verdeelRijen(y, bereik.top, LAATSTE_RIJ, velRuimte(spiegel, schaal, alEerder === 0, metNaam), Math.max(0, MAX_VELLEN - alEerder));
  const vellen = stukken.map((s, i) => ({
    tot: s.tot,
    nummer: alEerder + i + 1,
    metInhoud: dit !== undefined && s.van <= bereik.bottom,
  }));

  // De rand rechts: de breedte van de bladspiegel, of de rand van wat is verkleind.
  const begin = kern.cellRect(blad, bereik.top, bereik.left).x;
  const rechts = begin + (dit && dit.schaal < 1 ? dit.breedtePx : spiegel.breedte / MM_PER_PX);
  let laag = bereik.left;
  let hoog = LAATSTE_KOLOM;
  while (laag < hoog) {
    const midden = Math.ceil((laag + hoog) / 2);
    if (kern.cellRect(blad, bereik.top, midden).x <= rechts) laag = midden;
    else hoog = midden - 1;
  }
  const kolom = kern.cellRect(blad, bereik.top, laag);
  return {
    links: bereik.left,
    boven: bereik.top,
    rechtsKolom: laag,
    rechtsBinnen: rechts - kolom.x,
    rechtsKolomBreedte: kolom.w,
    schaal,
    vellen,
    vol: vellen.length === 0 || vellen[vellen.length - 1].tot < LAATSTE_RIJ,
  };
}
