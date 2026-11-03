import i18next from "../../i18n/config";
import { useSpreadsheetEditor } from "../../store/spreadsheetEditor";
import {
  aantalCellen, bereikA1, leesHtmlTabel, leesTsv, MAX_KOLOMMEN, MAX_RIJEN, naarHtml, naarTsv, verschuifFormule, zelfdeTekst,
  type Bereik, type BronCel, type HtmlCel,
} from "./spreadsheetLogica";
import { binnenGebruikt, celOp, invoerNaarCel, leesCellen, MAX_CELLEN, Melding, rechthoek, selectie, sluitInvoer, type Doel } from "./spreadsheetOpdrachten";

/*
 * Het klembord van een spreadsheet-blad. Op het systeemklembord komt tabgescheiden
 * tekst en een HTML-tabel, zodat andere programma's de getoonde waarden krijgen.
 * Binnen de app onthouden we de laatste kopie met formules en opmaak: staat die
 * tekst nog op het klembord, dan schuiven formules mee met de afstand en gaat de
 * opmaak mee. Knippen verplaatst bij het plakken, en de rekenkern herschrijft dan
 * ook de verwijzingen náár de verplaatste cellen.
 */

const melding = (sleutel: string) => i18next.t(`werkruimte:spreadsheet.melding.${sleutel}`) as string;

/** Meer cellen zetten we niet met opmaak in de HTML: elke cel is een aanroep van de rekenkern. */
const MAX_OPGEMAAKT = 5000;

interface Kopie {
  /** De editor van de kopie; bij een andere werkmap kan knippen niet verplaatsen. */
  handle: object;
  tsv: string;
  sheetId: string;
  blad: number;
  bereik: Bereik;
  cellen: BronCel[][];
  opmaak: { rows: number; columns: number; formats: unknown[] };
  knippen: boolean;
}

export interface KlembordInhoud {
  tekst: string;
  html?: string;
}

/** Blijft staan bij wisselen van blad: kopiëren tussen spreadsheet-bladen werkt zo ook. */
let laatste: Kopie | null = null;
/** Staat aan tijdens ons eigen plakken: dat is geen andere bewerking. */
let plakt = false;

/** Zet het lopende kader weg; een knip vervalt dan ook, zoals bij Escape of een andere bewerking. */
export function wisKopieKader(): void {
  if (laatste?.knippen) laatste = null;
  if (useSpreadsheetEditor.getState().kopie) useSpreadsheetEditor.setState({ kopie: null });
}

/** Een andere bewerking dan plakken: wat op het klembord staat is niet meer wat het kader toont. */
export function naWijziging(): void {
  if (!plakt) wisKopieKader();
}

/** Tekst en HTML op het systeemklembord; synchroon binnen een gebruikersactie. */
async function schrijfKlembord(tekst: string, html: string): Promise<boolean> {
  let gelukt = false;
  const luister = (e: ClipboardEvent) => {
    if (!e.clipboardData) return;
    e.clipboardData.setData("text/plain", tekst);
    e.clipboardData.setData("text/html", html);
    e.preventDefault();
    gelukt = true;
  };
  document.addEventListener("copy", luister, true);
  try {
    document.execCommand("copy");
  } catch {
    // Zonder execCommand: hieronder de asynchrone weg.
  } finally {
    document.removeEventListener("copy", luister, true);
  }
  if (gelukt) return true;
  try {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/plain": new Blob([tekst], { type: "text/plain" }),
        "text/html": new Blob([html], { type: "text/html" }),
      }),
    ]);
    return true;
  } catch {
    return navigator.clipboard.writeText(tekst).then(() => true, () => false);
  }
}

function htmlCellen(d: Doel, bereik: Bereik): HtmlCel[][] {
  const lezing = d.api.handle.readCells({ ranges: [{ sheetId: d.sheetId, range: { kind: "rowCol", ...rechthoek(bereik) } }] });
  if (!lezing.ok) throw new Melding(lezing.failure.message);
  const metOpmaak = aantalCellen(bereik) <= MAX_OPGEMAAKT;
  return lezing.ranges[0].cells.map((rij) =>
    rij.map((c) => {
      const cel: HtmlCel = { tekst: c.displayText, ruw: c.value.kind === "number" ? c.value.value : undefined };
      if (metOpmaak && c.displayText) {
        const f = d.api.handle.selectionFormatting(d.blad, c.a1);
        Object.assign(cel, { vet: f.bold, cursief: f.italic, kleur: f.textColor, vulling: f.fillColor, uitlijning: f.horizontalAlignment });
      }
      return cel;
    }),
  );
}

/** Kopieert of knipt de selectie. */
export async function kopieer(knippen = false): Promise<void> {
  const eerste = selectie();
  await sluitInvoer(eerste.api);
  const d = selectie();
  const bereik = binnenGebruikt(d, d.bereik);
  if (aantalCellen(bereik) > MAX_CELLEN) throw new Melding(melding("teGroot"));
  const html = htmlCellen(d, bereik);
  const tsv = naarTsv(html.map((rij) => rij.map((c) => c.tekst)));
  laatste = {
    handle: d.api.handle,
    tsv,
    sheetId: d.sheetId,
    blad: d.blad,
    bereik,
    cellen: leesCellen(d, bereik),
    opmaak: d.api.handle.captureFormat(d.blad, bereikA1(bereik)) as Kopie["opmaak"],
    knippen,
  };
  if (!(await schrijfKlembord(tsv, naarHtml(html)))) throw new Melding(melding("kopierenMislukt"));
  useSpreadsheetEditor.setState({ kopie: { sheetId: d.sheetId, bereik, knippen } });
  d.api.focus();
}

/** Het systeemklembord lezen (lint); valt terug op de laatste kopie in de app. */
export async function leesKlembord(): Promise<KlembordInhoud | null> {
  try {
    if (navigator.clipboard?.read) {
      let tekst = "";
      let html: string | undefined;
      for (const item of await navigator.clipboard.read()) {
        if (item.types.includes("text/html")) html = await (await item.getType("text/html")).text();
        if (item.types.includes("text/plain")) tekst = await (await item.getType("text/plain")).text();
      }
      if (tekst || html) return { tekst, html };
    }
  } catch {
    // Geen toestemming of niet ondersteund: platte tekst proberen.
  }
  try {
    const tekst = await navigator.clipboard?.readText();
    if (tekst) return { tekst };
  } catch {
    // Ook geen tekst: de laatste kopie binnen de app.
  }
  return laatste ? { tekst: laatste.tsv } : null;
}

/**
 * Hoe vaak de bron in de selectie past: selecteer je een veelvoud van de bron, dan
 * herhaalt hij zich, en anders komt hij eenmaal linksboven in de selectie.
 */
function herhalingen(selectieBereik: Bereik, hoog: number, breed: number): { rijen: number; kolommen: number } {
  const selHoog = selectieBereik.bottom - selectieBereik.top + 1;
  const selBreed = selectieBereik.right - selectieBereik.left + 1;
  const past = selHoog % hoog === 0 && selBreed % breed === 0 && selHoog <= MAX_RIJEN - 1 && selBreed <= MAX_KOLOMMEN - 1;
  return past ? { rijen: selHoog / hoog, kolommen: selBreed / breed } : { rijen: 1, kolommen: 1 };
}

function selecteerGeplakt(d: Doel, gebied: Bereik): void {
  d.api.selectCells(d.blad, { anchor: { row: gebied.bottom, col: gebied.right }, focus: { row: gebied.top, col: gebied.left } });
  d.api.focus();
}

/** Plakt linksboven in de selectie, in één stap. */
export async function plak(inhoud: KlembordInhoud): Promise<void> {
  const eerste = selectie();
  await sluitInvoer(eerste.api);
  const d = selectie();
  const lezing = d.api.handle.readCells({ ranges: [] });
  if (lezing.ok && lezing.sheets[d.blad]?.editable === false) throw new Melding(melding("beveiligd"));
  const eigen = laatste && zelfdeTekst(inhoud.tekst, laatste.tsv) ? laatste : null;
  plakt = eigen !== null;
  try {
    if (eigen) plakEigen(d, eigen);
    else plakVanBuiten(d, inhoud);
  } finally {
    setTimeout(() => {
      plakt = false;
    });
  }
  // Het kader hoort bij wat op het klembord staat; na een knip is dat op.
  useSpreadsheetEditor.setState({ kopie: laatste ? useSpreadsheetEditor.getState().kopie : null });
}

/** Plakken vanuit het lint: de klembord-API, want daar is geen paste-gebeurtenis. */
export async function plakKlembord(): Promise<void> {
  const inhoud = await leesKlembord();
  if (!inhoud) throw new Melding(melding("leegKlembord"));
  await plak(inhoud);
}

function plakEigen(d: Doel, kopie: Kopie): void {
  const hoog = kopie.cellen.length;
  const breed = kopie.cellen[0].length;
  const start = { row: d.bereik.top, col: d.bereik.left };

  const zelfdeWerkmap = kopie.knippen && kopie.handle === d.api.handle;
  const hier = zelfdeWerkmap && kopie.blad === d.blad;
  const keer = kopie.knippen ? { rijen: 1, kolommen: 1 } : herhalingen(d.bereik, hoog, breed);
  const gebied: Bereik = {
    top: start.row,
    left: start.col,
    bottom: start.row + hoog * keer.rijen - 1,
    right: start.col + breed * keer.kolommen - 1,
  };
  if (gebied.bottom >= MAX_RIJEN || gebied.right >= MAX_KOLOMMEN) throw new Melding(melding("buitenBlad"));
  if (aantalCellen(gebied) > MAX_CELLEN) throw new Melding(melding("teGroot"));

  // Knippen binnen dit werkblad: echt verplaatsen, ook de verwijzingen ernaar.
  if (hier) {
    laatste = null;
    if (start.row === kopie.bereik.top && start.col === kopie.bereik.left) {
      selecteerGeplakt(d, gebied);
      return;
    }
    try {
      d.api.handle.moveRange(d.blad, bereikA1(kopie.bereik), bereikA1({ ...gebied, bottom: gebied.top, right: gebied.left }));
      selecteerGeplakt(d, gebied);
      return;
    } catch {
      // De rekenkern weigert als een formule een deel van de cellen in een bereik heeft.
      // Dan hieronder als kopie met de bron leeg erbij; verwijzingen ernaar blijven staan.
    }
  }

  const ops: unknown[] = [];
  if (zelfdeWerkmap) {
    laatste = null;
    for (let r = kopie.bereik.top; r <= kopie.bereik.bottom; r++) {
      for (let k = kopie.bereik.left; k <= kopie.bereik.right; k++) {
        const inDoel = hier && r >= gebied.top && r <= gebied.bottom && k >= gebied.left && k <= gebied.right;
        if (!inDoel) ops.push(celOp(kopie.blad, { row: r, col: k }, { waarde: { kind: "empty" }, formule: null }));
      }
    }
  }
  for (let r = 0; r <= gebied.bottom - gebied.top; r++) {
    for (let k = 0; k <= gebied.right - gebied.left; k++) {
      const bron = kopie.cellen[r % hoog][k % breed];
      const naar = { row: gebied.top + r, col: gebied.left + k };
      const formule = bron.formule === null || kopie.knippen
        ? bron.formule
        : verschuifFormule(bron.formule, naar.row - (kopie.bereik.top + (r % hoog)), naar.col - (kopie.bereik.left + (k % breed)));
      ops.push(celOp(d.blad, naar, { waarde: bron.waarde, formule }));
    }
  }
  ops.push({ type: "applyRangeFormat", sheet: d.blad, range: rechthoek(gebied), format: kopie.opmaak });
  d.api.handle.applyOps(ops);
  selecteerGeplakt(d, gebied);
}

function plakVanBuiten(d: Doel, inhoud: KlembordInhoud): void {
  const rijen = (inhoud.html && leesHtmlTabel(inhoud.html)) || leesTsv(inhoud.tekst);
  if (!rijen.length || !rijen[0].length) throw new Melding(melding("leegKlembord"));
  const gebied: Bereik = {
    top: d.bereik.top,
    left: d.bereik.left,
    bottom: d.bereik.top + rijen.length - 1,
    right: d.bereik.left + rijen[0].length - 1,
  };
  if (gebied.bottom >= MAX_RIJEN || gebied.right >= MAX_KOLOMMEN) throw new Melding(melding("buitenBlad"));
  if (aantalCellen(gebied) > MAX_CELLEN) throw new Melding(melding("teGroot"));
  const ops: unknown[] = [];
  const notaties: unknown[] = [];
  rijen.forEach((rij, r) =>
    rij.forEach((tekst, k) => {
      const naar = { row: gebied.top + r, col: gebied.left + k };
      const { cel, notatie } = invoerNaarCel(tekst);
      ops.push(celOp(d.blad, naar, cel));
      if (notatie) {
        notaties.push({ type: "setRangeNumberFormat", sheet: d.blad, range: { start: naar, end: naar }, format: { type: "custom", pattern: notatie } });
      }
    }),
  );
  // `setCell` wist de opmaak; bij tekst van buiten blijft de opmaak van de doelcellen staan.
  const opmaak = d.api.handle.captureFormat(d.blad, bereikA1(gebied));
  d.api.handle.applyOps([...ops, { type: "applyRangeFormat", sheet: d.blad, range: rechthoek(gebied), format: opmaak }, ...notaties]);
  selecteerGeplakt(d, gebied);
}
