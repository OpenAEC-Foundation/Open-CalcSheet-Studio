import katex from "katex";
import { marked } from "marked";
import { strFromU8 } from "fflate";
import { notebooksIn, pakWerkmapUit, uitBase64, type JupyterWerkmap, type WerkmapBestand } from "../../store/jupyterBlad.ts";

/*
 * Een Jupyter-blad op papier: de notebooks met hun tekstcellen, code en uitvoer, uit
 * de opgeslagen werkmap. De kernel komt er niet aan te pas: dit rekent niets uit.
 *
 * De html gaat door UitwerkingHtml (PrintBlad.tsx) en wordt daar met DOMPurify
 * geschoond, net als een rekenblad; hier wordt alleen zorgvuldig geëscapet. Elk
 * los element is een blok voor de paginering (paginering.ts), en wat te hoog is voor
 * een vel wordt hier al in stukken geknipt: de paginering kapt een te hoog blok af.
 */

/** Zoveel regels code of tekst staan er hoogstens in één blok. */
const REGELS_PER_BLOK = 45;
/** Zoveel rijen staan er hoogstens in één tabelblok; de kopregel gaat met elk stuk mee. */
const RIJEN_PER_BLOK = 30;

export interface PapierOpties {
  metCode: boolean;
  /** Toont de naam van het notebook boven zijn cellen; bij meer dan één notebook. */
  metNaam?: boolean;
  fout: (bestand: string) => string;
}

type Bron = string | string[] | undefined;
type Uitvoer = {
  output_type?: string;
  name?: string;
  text?: Bron;
  data?: Record<string, Bron>;
  ename?: string;
  evalue?: string;
  traceback?: string[];
};
type Cel = {
  cell_type?: string;
  source?: Bron;
  outputs?: Uitvoer[];
  execution_count?: number | null;
  metadata?: { tags?: unknown; jupyter?: { source_hidden?: unknown; outputs_hidden?: unknown } };
};

const tekstVan = (b: Bron): string => (Array.isArray(b) ? b.join("") : typeof b === "string" ? b : "");

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** ANSI-kleurcodes uit een foutmelding van de kernel. */
function zonderAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001b\[[0-9;?]*[A-Za-z]/g, "");
}

/** Lange tekst in stukken op regels: een `<pre>` per blok. */
function preBlokken(tekst: string, klasse: string): string[] {
  const regels = tekst.replace(/\r\n?/g, "\n").replace(/\n$/, "").split("\n");
  const uit: string[] = [];
  for (let i = 0; i < regels.length; i += REGELS_PER_BLOK) {
    uit.push(`<pre class="${klasse}">${esc(regels.slice(i, i + REGELS_PER_BLOK).join("\n"))}</pre>`);
  }
  return uit;
}

function formule(tex: string, display: boolean): string {
  return katex.renderToString(tex, { displayMode: display, throwOnError: false, output: "html" });
}

/** Markdown met formules. De formules eerst eruit: `_` en `*` erin zijn geen opmaak. */
function markdown(bron: string): string {
  const formules: string[] = [];
  const bewaar = (html: string) => {
    formules.push(html);
    return `${formules.length - 1}`;
  };
  const zonderCode = bron.split(/(```[\s\S]*?```|`[^`\n]*`)/g).map((deel, i) => {
    if (i % 2 === 1) return deel;
    return deel
      .replace(/\$\$([\s\S]+?)\$\$/g, (_m, tex: string) => bewaar(formule(tex, true)))
      .replace(/(^|[^\\$])\$([^\s$](?:[^$\n]*[^\s$])?)\$(?!\d)/g, (_m, voor: string, tex: string) => voor + bewaar(formule(tex, false)));
  }).join("");
  const html = marked.parse(zonderCode, { async: false, gfm: true }) as string;
  return html.replace(/(\d+)/g, (_m, n: string) => formules[Number(n)] ?? "");
}

/**
 * Knipt een lange tabel in stukken, elk met de kopregel. Zonder DOM (of zonder lange
 * tabel) blijft hij heel. Wat er verder in de uitvoer staat, blijft op zijn plek.
 */
function tabelBlokken(html: string): string[] {
  const rijen = html.match(/<tr[\s>]/gi)?.length ?? 0;
  if (rijen <= RIJEN_PER_BLOK || typeof DOMParser === "undefined") return [`<div class="nb-html">${html}</div>`];
  const doc = new DOMParser().parseFromString(html, "text/html");
  const tabel = doc.querySelector("table");
  const rompen = tabel ? Array.from(tabel.querySelectorAll(":scope > tbody > tr, :scope > tr")) : [];
  if (!tabel || rompen.length <= RIJEN_PER_BLOK) return [`<div class="nb-html">${html}</div>`];
  const kop = tabel.querySelector(":scope > thead")?.outerHTML ?? "";
  const klasse = tabel.getAttribute("class") ?? "";
  const uit: string[] = [];
  for (let i = 0; i < rompen.length; i += RIJEN_PER_BLOK) {
    const stuk = rompen.slice(i, i + RIJEN_PER_BLOK).map((r) => r.outerHTML).join("");
    uit.push(`<div class="nb-html"><table class="${esc(klasse)}">${kop}<tbody>${stuk}</tbody></table></div>`);
  }
  tabel.remove();
  const rest = doc.body.textContent?.trim();
  if (rest) uit.push(`<p class="nb-tekst-los">${esc(rest)}</p>`);
  return uit;
}

/** De rijkste vorm die op papier past; JavaScript en widgets vallen terug op hun tekst. */
function dataBlokken(data: Record<string, Bron>): string[] {
  for (const soort of ["image/png", "image/jpeg"]) {
    const b64 = tekstVan(data[soort]).replace(/\s+/g, "");
    if (b64) return [`<figure class="nb-beeld"><img src="data:${soort};base64,${esc(b64)}" alt=""></figure>`];
  }
  const svg = tekstVan(data["image/svg+xml"]);
  if (svg) {
    // Als afbeelding: een SVG in een img voert niets uit.
    const bytes = new TextEncoder().encode(svg);
    let los = "";
    for (let i = 0; i < bytes.length; i += 0x8000) los += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return [`<figure class="nb-beeld"><img src="data:image/svg+xml;base64,${btoa(los)}" alt=""></figure>`];
  }
  const latex = tekstVan(data["text/latex"]);
  if (latex) {
    const tex = latex.trim().replace(/^\$\$?|\$\$?$/g, "");
    return [`<p class="nb-formule">${formule(tex, true)}</p>`];
  }
  const html = tekstVan(data["text/html"]);
  if (html) return tabelBlokken(html);
  const md = tekstVan(data["text/markdown"]);
  if (md) return [`<div class="ifc-calc nb-md">${markdown(md)}</div>`];
  const platte = tekstVan(data["text/plain"]);
  return platte ? preBlokken(platte, "nb-tekst") : [];
}

function uitvoerBlokken(u: Uitvoer): string[] {
  switch (u.output_type) {
    case "stream":
      return preBlokken(zonderAnsi(tekstVan(u.text)), u.name === "stderr" ? "nb-tekst nb-stderr" : "nb-tekst");
    case "error": {
      const spoor = Array.isArray(u.traceback) && u.traceback.length ? u.traceback.join("\n") : `${u.ename ?? ""}: ${u.evalue ?? ""}`;
      return preBlokken(zonderAnsi(spoor), "nb-tekst nb-fout");
    }
    case "display_data":
    case "execute_result":
      return u.data && typeof u.data === "object" ? dataBlokken(u.data) : [];
    default:
      return [];
  }
}

function celBlokken(cel: Cel, metCode: boolean): string[] {
  const tags = Array.isArray(cel.metadata?.tags) ? cel.metadata.tags : [];
  if (tags.includes("remove-cell")) return [];
  const bron = tekstVan(cel.source);
  if (cel.cell_type === "markdown") {
    return bron.trim() ? [`<div class="ifc-calc nb-md">${markdown(bron)}</div>`] : [];
  }
  if (cel.cell_type !== "code") return [];
  const uit: string[] = [];
  const codeWeg = !metCode || cel.metadata?.jupyter?.source_hidden === true || tags.includes("remove-input");
  if (!codeWeg && bron.trim()) uit.push(...preBlokken(bron, "nb-code"));
  const uitvoerWeg = cel.metadata?.jupyter?.outputs_hidden === true || tags.includes("remove-output");
  if (!uitvoerWeg && Array.isArray(cel.outputs)) uit.push(...cel.outputs.flatMap(uitvoerBlokken));
  return uit;
}

/** Eén notebook als html. Onleesbaar: een melding in plaats van de rest van de uitdraai te breken. */
export function notebookNaarHtml(bestand: WerkmapBestand, opties: PapierOpties): string {
  let nb: { cells?: Cel[] };
  try {
    nb = JSON.parse(strFromU8(bestand.bytes));
    if (!Array.isArray(nb.cells)) throw new Error("no cells");
  } catch {
    return `<p class="nb-tekst-los nb-fout">${esc(opties.fout(bestand.pad))}</p>`;
  }
  const blokken = nb.cells.flatMap((c) => celBlokken(c, opties.metCode));
  if (opties.metNaam) blokken.unshift(`<h3 class="nb-naam">${esc(bestand.pad)}</h3>`);
  return blokken.join("\n");
}

export interface PapierTeksten {
  leeg: string;
  fout: (bestand: string) => string;
  /** De ZIP kon niet worden gelezen. */
  kapot: (melding: string) => string;
}

/** Alle notebooks uit een werkmap als html. */
export function werkmapNaarHtml(werkmap: JupyterWerkmap, t: PapierTeksten): string {
  let notebooks: WerkmapBestand[];
  try {
    notebooks = notebooksIn(pakWerkmapUit(uitBase64(werkmap.data)));
  } catch (err) {
    return `<p class="nb-tekst-los nb-fout">${esc(t.kapot((err as Error)?.message ?? String(err)))}</p>`;
  }
  if (notebooks.length === 0) return `<p class="nb-tekst-los">${esc(t.leeg)}</p>`;
  return notebooks
    .map((n) => notebookNaarHtml(n, { metCode: werkmap.metCode, metNaam: notebooks.length > 1, fout: t.fout }))
    .join("\n");
}

/* Dezelfde werkmap wordt per uitdraai een paar keer gevraagd; uitpakken is niet gratis. */
const cache = new Map<string, string>();

/** Als werkmapNaarHtml, onthouden voor de laatste werkmappen. */
export function werkmapHtml(werkmap: JupyterWerkmap, t: PapierTeksten): string {
  const sleutel = `${werkmap.metCode ? 1 : 0}${t.leeg}${werkmap.data}`;
  const bekend = cache.get(sleutel);
  if (bekend !== undefined) return bekend;
  const html = werkmapNaarHtml(werkmap, t);
  if (cache.size >= 8) cache.delete(cache.keys().next().value as string);
  cache.set(sleutel, html);
  return html;
}
