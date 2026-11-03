/**
 * Van Markdown naar html, voor het scherm en voor op papier.
 *
 * De html uit deze functies is nog niet opgeschoond: dat doet de aanroeper met
 * dezelfde opschoning als de uitwerking van een rekenblad (uitwerkingRegels.ts).
 * Een afbeelding van buiten laadt daardoor pas na bevestiging per domein, en
 * html in de tekst mag niet meer dan html in een tekstregel van een rekenblad.
 *
 * Alleen `marked` en de DOM-functies van de browser, zodat
 * scripts/check-markdown.mjs dit bestand in Node met jsdom kan laden.
 */
import { Marked } from "marked";

/** Een kop uit de tekst. `nummer` telt alle koppen, op volgorde. */
export interface MarkdownKop {
  niveau: number;
  tekst: string;
  nummer: number;
}

export interface GelezenMarkdown {
  html: string;
  koppen: MarkdownKop[];
}

/** Zoveel teksten blijven gelezen bewaard: de inhoudsopgave en de afdruk lezen dezelfde tekst. */
const BEWAARD = 32;
const gelezen = new Map<string, GelezenMarkdown>();

/** De tekst van een kop zonder de html-tekens: hij komt als gewone tekst in de inhoudsopgave. */
function plat(tekst: string): string {
  const tekens: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
  return tekst.replace(/&(?:amp|lt|gt|quot|#39);/g, (t) => tekens[t]).trim();
}

/**
 * Leest een tekst: de html, met op elke kop `data-md-kop`, en de koppen zelf.
 * Tabellen, doorgehaalde tekst en takenlijsten volgens GFM.
 */
export function leesMarkdown(tekst: string): GelezenMarkdown {
  const bewaard = gelezen.get(tekst);
  if (bewaard) return bewaard;
  const koppen: MarkdownKop[] = [];
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }) {
        const nummer = koppen.length;
        koppen.push({ niveau: depth, tekst: plat(this.parser.parseInline(tokens, this.parser.textRenderer)), nummer });
        return `<h${depth} data-md-kop="${nummer}">${this.parser.parseInline(tokens)}</h${depth}>\n`;
      },
    },
  });
  const uit: GelezenMarkdown = { html: marked.parse(tekst, { async: false }), koppen };
  if (gelezen.size >= BEWAARD) gelezen.delete(gelezen.keys().next().value as string);
  gelezen.set(tekst, uit);
  return uit;
}

const lees = (html: string) => new DOMParser().parseFromString(html, "text/html");

/** Het adres zonder de codering van een url: marked schrijft een spatie of backslash als %20 of %5C. */
function ontcijferd(adres: string): string {
  try {
    return decodeURI(adres).trim().replace(/%5C/gi, "\\");
  } catch {
    return adres.trim();
  }
}

/** Een adres dat naar een bestand naast de tekst wijst: geen schema, geen stam, geen serverpad. */
export function isRelatiefAdres(adres: string): boolean {
  const a = ontcijferd(adres);
  return a !== "" && !a.startsWith("#") && !/^[a-z][a-z0-9+.-]*:/i.test(a) && !/^[\\/]/.test(a);
}

/** Het adres zoals het in de tekst staat, zonder `./`, met rechte schuine strepen. */
export function beeldSleutel(adres: string): string {
  return ontcijferd(adres).replace(/\\/g, "/").replace(/^(\.\/)+/, "");
}

/**
 * Zet de afbeeldingen uit het project terug. Een afbeelding van buiten
 * (`data-extern-src`) en een data-URL blijven staan. Elk ander adres
 * zou als pad in de app laden of op het systeem zoeken: dat wordt een zichtbare
 * melding met het adres.
 */
export function zetEigenBeelden(wortel: ParentNode, beelden: Record<string, string> | undefined, doc: Document): void {
  for (const img of wortel.querySelectorAll("img")) {
    if (img.hasAttribute("data-extern-src")) continue;
    const adres = img.getAttribute("src") ?? "";
    if (/^data:image\//i.test(adres)) continue;
    const eigen = isRelatiefAdres(adres) ? beelden?.[beeldSleutel(adres)] : undefined;
    if (eigen) {
      img.setAttribute("src", eigen);
      continue;
    }
    const plek = doc.createElement("span");
    plek.className = "md-beeld-weg";
    // Een adres dat de opschoning niet wil (een stam) is al weg; dan de beschrijving.
    plek.textContent = adres || img.getAttribute("alt") || "";
    img.replaceWith(plek);
  }
}

/**
 * De html voor op het scherm: opgeschoond, met de afbeeldingen uit het project.
 * `schoon` is de opschoning van de app.
 */
export function markdownVoorScherm(tekst: string, beelden: Record<string, string> | undefined, schoon: (html: string) => string): string {
  const doc = lees(schoon(leesMarkdown(tekst).html));
  zetEigenBeelden(doc.body, beelden, doc);
  return schoon(doc.body.innerHTML);
}

// ── Op papier ─────────────────────────────────────────────────────────────────

/** Hierboven gaat een alinea in stukken: zo past elk stuk zeker op een vel. */
const MAX_ALINEA = 3000;
/** Tot deze diepte krijgt een lijst een eigen inspringing. */
const MAX_DIEPTE = 4;

const isLijst = (el: Element) => el.localName === "ul" || el.localName === "ol";

/** Eén lijst per regel, ook van de lijsten erin; de nummering loopt door met `start`. */
function lijstStukken(lijst: Element, doc: Document, diepte = 1): Element[] {
  let nummer = Number(lijst.getAttribute("start") ?? 1) || 1;
  return [...lijst.children].flatMap((li) => {
    const dieper = [...li.children].filter(isLijst);
    for (const d of dieper) d.remove();
    const los = doc.createElement(lijst.localName);
    los.className = `md-los md-diepte-${Math.min(diepte, MAX_DIEPTE)}`;
    if (lijst.localName === "ol") los.setAttribute("start", String(nummer++));
    los.appendChild(li);
    return [los, ...dieper.flatMap((d) => lijstStukken(d, doc, diepte + 1))];
  });
}

/**
 * Eén tabel per rij. De kolombreedtes liggen vast op de langste tekst in de
 * kolom, zodat de rijen onder elkaar blijven passen. De kopregel blijft bij de
 * eerste rij eronder (`rpa-houd`, paginering.ts).
 */
function tabelStukken(tabel: Element, doc: Document): Element[] {
  const rijen = [...tabel.querySelectorAll("tr")].filter((r) => r.closest("table") === tabel);
  if (rijen.length === 0) return [tabel];
  const aantal = Math.max(...rijen.map((r) => r.children.length));
  const gewicht = Array.from({ length: aantal }, (_, k) =>
    Math.min(40, Math.max(4, ...rijen.map((r) => (r.children[k]?.textContent ?? "").trim().length))));
  const som = gewicht.reduce((a, b) => a + b, 0);
  return rijen.map((rij) => {
    const los = doc.createElement("table");
    const kop = rij.closest("thead") !== null;
    los.className = kop ? "md-tabel md-kopregel rpa-houd" : "md-tabel";
    const kolommen = doc.createElement("colgroup");
    for (const g of gewicht) {
      const col = doc.createElement("col");
      col.setAttribute("style", `width:${((g / som) * 100).toFixed(2)}%`);
      kolommen.appendChild(col);
    }
    const deel = doc.createElement(kop ? "thead" : "tbody");
    deel.appendChild(rij);
    los.append(kolommen, deel);
    return los;
  });
}

/** Eén blok per regel code. */
function codeStukken(pre: Element, doc: Document): Element[] {
  const regels = (pre.textContent ?? "").replace(/\n$/, "").split("\n");
  return regels.map((regel, i) => {
    const los = doc.createElement("pre");
    const klassen = ["md-code"];
    if (i === 0) klassen.push("md-code-eerste");
    if (i === regels.length - 1) klassen.push("md-code-laatste");
    los.className = klassen.join(" ");
    // Een lege regel moet zijn hoogte houden.
    los.textContent = regel || " ";
    return los;
  });
}

/** Een lange alinea in stukken op zinsgrenzen; korte alinea's blijven heel. */
function alineaStukken(p: Element, doc: Document): Element[] {
  if ((p.textContent ?? "").length <= MAX_ALINEA) return [p];
  const stukken: Element[] = [];
  let huidig = doc.createElement("p");
  let lengte = 0;
  const sluit = () => {
    if (lengte === 0) return;
    stukken.push(huidig);
    huidig = doc.createElement("p");
    lengte = 0;
  };
  for (const knoop of [...p.childNodes]) {
    if (knoop.nodeType !== 3) {
      const l = (knoop.textContent ?? "").length;
      if (lengte + l > MAX_ALINEA) sluit();
      huidig.appendChild(knoop);
      lengte += l;
      continue;
    }
    for (const zin of (knoop.textContent ?? "").split(/(?<=[.!?;:])\s+/)) {
      // Een zin langer dan een alinea: dan op de spaties.
      for (const deel of zin.length > MAX_ALINEA ? zin.split(/(?<=\s)/) : [zin]) {
        if (lengte + deel.length > MAX_ALINEA) sluit();
        huidig.append(doc.createTextNode(`${deel}${deel === zin ? " " : ""}`));
        lengte += deel.length;
      }
    }
  }
  sluit();
  return stukken.map((s, i) => {
    if (i > 0) s.classList.add("md-vervolg");
    if (i < stukken.length - 1) s.classList.add("md-loopt-door");
    return s;
  });
}

/** Het laatste stuk van een lijst of tabel krijgt de ruimte onder het hele blok. */
function metSlot(stukken: Element[]): Element[] {
  stukken[stukken.length - 1]?.classList.add("md-slot");
  return stukken;
}

/** Wat er van een blok op papier komt: in stukken die elk op een vel passen. */
function stukkenVan(el: Element, doc: Document): Element[] {
  if (isLijst(el)) return metSlot(lijstStukken(el, doc));
  if (el.localName === "table") return metSlot(tabelStukken(el, doc));
  if (el.localName === "pre") return codeStukken(el, doc);
  if (el.localName === "p") return alineaStukken(el, doc);
  if (el.localName === "blockquote") {
    // Een wikkel die de verdeling over de vellen afpelt (WIKKELS in paginering.ts).
    const citaat = doc.createElement("div");
    citaat.className = "md-citaat";
    citaat.append(...[...el.children].flatMap((k) => stukkenVan(k, doc)));
    return [citaat];
  }
  return [el];
}

/**
 * De html voor op papier, voor de verdeling over de vellen.
 *
 * De verdeling (paginering.ts) legt elk blok als geheel op een vel, en wat hoger
 * is dan een vel valt eraf. Een lijst, tabel, codeblok of citaat van een Markdown-
 * tekst kan zo lang zijn als de schrijver wil. Daarom gaat hij hier in stukken:
 * een blok per lijstregel, tabelrij of regel code. Lange alinea's gaan op
 * zinsgrenzen in stukken; een afbeelding krijgt zijn grens in de opmaak.
 *
 * Een kop krijgt zijn plek voor de inhoudsopgave (`data-inhoud`, zie
 * koppenVoorInhoud). Een eerste kop gelijk aan de naam van het blad vervalt: die
 * naam staat er al boven. `schoon` is de opschoning van de app.
 */
export function markdownVoorPapier(
  md: { tekst: string; beelden?: Record<string, string> },
  blad: { id: string; naam: string },
  schoon: (html: string) => string,
): string {
  const doc = lees(schoon(leesMarkdown(md.tekst).html));
  zetEigenBeelden(doc.body, md.beelden, doc);

  const eerste = doc.body.firstElementChild;
  if (eerste?.hasAttribute("data-md-kop") && zelfdeTekst(eerste.textContent ?? "", blad.naam)) eerste.remove();
  for (const kop of doc.body.querySelectorAll("[data-md-kop]")) {
    kop.setAttribute("data-inhoud", kopAnker(blad.id, Number(kop.getAttribute("data-md-kop"))));
  }

  const stukken = [...doc.body.children].flatMap((el) => stukkenVan(el, doc));
  doc.body.replaceChildren(...stukken);
  return schoon(doc.body.innerHTML);
}

const zelfdeTekst = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const kopAnker = (bladId: string, nummer: number) => `${bladId}#${nummer}`;

/** De plek van een regel in de inhoudsopgave, gelijk aan `data-inhoud` op de kop op papier. */
export interface InhoudKop {
  titel: string;
  anker: string;
}

/**
 * De koppen van een tekst voor de inhoudsopgave: alleen de bovenste twee niveaus
 * die erin voorkomen, en zonder een eerste kop gelijk aan de naam van het blad.
 * De rest zou de inhoudsopgave langer maken dan het stuk zelf.
 */
export function koppenVoorInhoud(tekst: string, blad: { id: string; naam: string }): InhoudKop[] {
  const { koppen, html } = leesMarkdown(tekst);
  const eersteIsKop = /^\s*<h[1-6]\s/.test(html);
  const zonderNaam = koppen.filter((k) => !(k.nummer === 0 && eersteIsKop && zelfdeTekst(k.tekst, blad.naam)));
  const niveaus = [...new Set(zonderNaam.map((k) => k.niveau))].sort((a, b) => a - b).slice(0, 2);
  return zonderNaam
    .filter((k) => niveaus.includes(k.niveau) && k.tekst !== "")
    .map((k) => ({ titel: k.tekst, anker: kopAnker(blad.id, k.nummer) }));
}

// ── Afbeeldingen naast het bestand ────────────────────────────────────────────

const SOORT_VAN: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp",
};
/** Grotere afbeeldingen blijven buiten het projectbestand: per stuk en samen. */
const MAX_BEELD_BYTES = 10 * 1024 * 1024;
const MAX_BEELDEN_BYTES = 40 * 1024 * 1024;

/** De adressen van afbeeldingen naast de tekst, uit Markdown en uit html in de tekst. */
export function beeldAdressen(tekst: string): string[] {
  const doc = lees(leesMarkdown(tekst).html);
  const adressen = [...doc.querySelectorAll("img")].map((i) => i.getAttribute("src") ?? "");
  return [...new Set(adressen.filter((a) => isRelatiefAdres(a) && beeldSleutel(a) in soortenPerAdres(a)))];
}

/** Alleen een bestand met de extensie van een afbeelding wordt gelezen. */
function soortenPerAdres(adres: string): Record<string, string> {
  const soort = SOORT_VAN[adres.split(/[?#]/)[0].split(".").pop()?.toLowerCase() ?? ""];
  return soort ? { [beeldSleutel(adres)]: soort } : {};
}

/**
 * Leest de afbeeldingen die naast de tekst staan en geeft ze als data-URL, per
 * adres zoals `zetEigenBeelden` ze zoekt. `leesBestand` krijgt het relatieve pad
 * en geeft de bytes, of gooit een fout: wat niet te lezen is of te groot, blijft
 * weg en geeft op het blad de melding met het adres. Geen pad buiten de tekst om:
 * een stam of een serverpad (een blad kan van iemand anders komen) wordt niet gelezen.
 */
export async function verzamelBeelden(
  tekst: string,
  leesBestand: (pad: string) => Promise<Uint8Array>,
  naarBase64: (bytes: Uint8Array) => Promise<string>,
): Promise<Record<string, string> | undefined> {
  const uit: Record<string, string> = {};
  let totaal = 0;
  for (const adres of beeldAdressen(tekst)) {
    const pad = beeldSleutel(adres).split(/[?#]/)[0];
    try {
      const bytes = await leesBestand(pad);
      if (bytes.length > MAX_BEELD_BYTES || totaal + bytes.length > MAX_BEELDEN_BYTES) continue;
      totaal += bytes.length;
      uit[beeldSleutel(adres)] = `data:${soortenPerAdres(adres)[beeldSleutel(adres)]};base64,${await naarBase64(bytes)}`;
    } catch (err) {
      console.warn(`Afbeelding ${pad} niet gelezen:`, err);
    }
  }
  return Object.keys(uit).length > 0 ? uit : undefined;
}
