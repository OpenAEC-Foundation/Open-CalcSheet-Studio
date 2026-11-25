/**
 * Leest de opgemaakte afdruk van het rapport uit tot het tussenmodel (model.ts).
 *
 * De bron is de meetopstelling van het afdrukvoorbeeld (AfdrukVoorbeeld.tsx): daar staat
 * het rapport doorlopend, in de taal, het eenhedenstelsel en met de onderdelen van het
 * rapport, precies zoals de PDF het krijgt. Er komt dus geen tweede weg om het rapport op
 * te bouwen. De meetopstelling heeft ook de echte tekeningen: een canvas op een vel is een
 * kopie zonder inhoud.
 *
 * Wat er gebeurt met wat er staat:
 *   • tekst wordt alinea's met opmaak (vet, cursief, index, kleur), koppen krijgen hun niveau;
 *   • een tabel wordt een tabel, met cellen over meer kolommen of rijen;
 *   • een formule van KaTeX gaat als MathML mee (zie mathmlUitTex);
 *   • een invoerveld of keuzelijst wordt de tekst die erin staat;
 *   • SVG, canvas en afbeeldingen worden PNG op twee keer de schermresolutie, op hun plek;
 *   • elk onderdeel van het rapport begint op een nieuwe pagina, net als op papier.
 *
 * Niet mee kunnen: de pagina's van een ingevoegd PDF-blad, een externe pagina (`@iframe`),
 * de uitvoer van een script (`@js`) en ander ingebed materiaal. Die komen als regel in het
 * document en in `nietMee`, zodat de gebruiker het vóór het opslaan ziet.
 */
import type { TFunction } from "i18next";
import katex from "katex";
import {
  pasInBladspiegel,
  type Alinea,
  type Beeld,
  type Cel,
  type DocBlok,
  type RapportDocument,
  type Run,
  type Tabel,
  type TekstRun,
} from "./model.ts";
import { elementen, leesXml, platteTekst, xmlTekst } from "./xml.ts";
import { metDecimaalKomma } from "@ifc-calc/core";

/** Iets dat niet in het document kan, voor de lijst vóór het opslaan. */
export interface NietMee {
  soort: "pdf" | "iframe" | "js" | "ingebed" | "beeld";
  /** Bestandsnaam, adres of soort element. */
  naam: string;
  /** Bij een PDF-blad: het aantal pagina's. */
  aantal: number;
}

export interface Uitlezing {
  document: RapportDocument;
  nietMee: NietMee[];
}

export interface Kop {
  titel: string;
  taal: string;
  /** De regel bovenaan: momentopname, project, revisie, en dat er niets herrekent. */
  momentopname: string;
  voettekst: string;
  gemaakt: Date;
}

const PX_MM = 25.4 / 96;

/** Onderdelen die geen tekst zijn: hun inhoud is te ingewikkeld voor één regel. */
const ZWAAR = "table, img, svg, canvas, .katex-display, h1, h2, h3, h4, h5, h6, ul, ol, pre, figure, iframe, p, section, header, .calc-iframe, .calc-js";

/** Wat niet mee kan, als regel in het document. */
const INGEBED = "iframe, video, audio, object, embed";

type Uitlijning = Alinea["uitlijning"];

interface Eigen {
  kop?: Alinea["kop"];
  stijl?: Alinea["stijl"];
  uitlijning?: Uitlijning;
  inspringen?: number;
}

/** Een afbeelding die nog wordt omgezet; `null` als het mislukte. */
type Wachtend = Promise<Beeld | null>;

class Lezer {
  blokken: DocBlok[] = [];
  private runs: Run[] = [];
  private eigen: Eigen = {};
  /** Kinderen van een blok in dezelfde alinea, gescheiden door een tab. */
  private plat = false;
  /** Binnen een inline-flex: blokken op één regel, gescheiden door een spatie. */
  private scheiding: "spatie" | null = null;
  nieuwePagina = false;
  private readonly stijlen = new Map<Element, CSSStyleDeclaration>();
  /** Per PDF-blad de regel in het document en de NietMee, om pagina's bij te tellen. */
  private laatstePdf: { ouder: Element | null; naam: string; alinea: Alinea; mee: NietMee } | null = null;

  private readonly t: TFunction;
  readonly beelden: Wachtend[];
  readonly nietMee: NietMee[];
  readonly pdfRegels: { alinea: Alinea; mee: NietMee }[];

  constructor(t: TFunction, beelden: Wachtend[], nietMee: NietMee[], pdfRegels: { alinea: Alinea; mee: NietMee }[]) {
    this.t = t;
    this.beelden = beelden;
    this.nietMee = nietMee;
    this.pdfRegels = pdfRegels;
  }

  private stijl(el: Element): CSSStyleDeclaration {
    let s = this.stijlen.get(el);
    if (!s) this.stijlen.set(el, (s = getComputedStyle(el)));
    return s;
  }

  private verborgen(el: Element): boolean {
    const s = this.stijl(el);
    return s.display === "none" || s.visibility === "hidden" || s.visibility === "collapse";
  }

  private isInline(el: Element): boolean {
    const d = this.stijl(el).display;
    return d.startsWith("inline") || d === "contents" || d === "ruby";
  }

  /** Sluit de alinea die wordt opgebouwd; een lege alinea valt weg. */
  sluitAlinea() {
    const runs = this.runs;
    this.runs = [];
    // Witruimte aan het eind valt weg, en ook een tab of regeleinde aan begin of eind.
    while (runs.length && (runs[runs.length - 1].soort === "tab" || runs[runs.length - 1].soort === "regeleinde")) runs.pop();
    while (runs.length && runs[0].soort === "tab") runs.shift();
    const laatste = runs[runs.length - 1];
    if (laatste?.soort === "tekst") laatste.tekst = laatste.tekst.replace(/ +$/, "");
    const inhoud = runs.filter((r) => r.soort !== "tekst" || r.tekst !== "");
    if (!inhoud.some((r) => r.soort !== "tekst" || r.tekst.trim() !== "")) return;
    this.voeg({ soort: "alinea", runs: inhoud, ...this.eigen });
  }

  voeg(b: DocBlok) {
    if (this.nieuwePagina) {
      b.nieuwePagina = true;
      this.nieuwePagina = false;
    }
    // De afdruk knipt een lange tabel in stukken om hem over vellen te verdelen. Twee
    // tabellen direct na elkaar met evenveel kolommen zijn hier weer één tabel.
    const vorige = this.blokken[this.blokken.length - 1];
    if (b.soort === "tabel" && !b.nieuwePagina && vorige?.soort === "tabel" && kolommenVan(vorige) === kolommenVan(b)) {
      vorige.rijen.push(...b.rijen);
      return;
    }
    this.blokken.push(b);
  }

  /** Een regel van het exportprogramma zelf: een onderdeel dat niet mee kan. */
  private regel(tekst: string): Alinea {
    this.sluitAlinea();
    const a: Alinea = { soort: "alinea", runs: [{ soort: "tekst", tekst, cursief: true, kleur: "555555" }] };
    this.voeg(a);
    return a;
  }

  private tekst(knoop: Text) {
    if (knoop.parentElement) this.tekstVan(knoop.data, knoop.parentElement);
  }

  /** Tekst in de opmaak van `ouder`, met de witruimte zoals CSS hem toont. */
  private tekstVan(ruwe: string, ouder: Element) {
    const s = this.stijl(ouder);
    let ruw = ruwe;
    if (s.textTransform === "uppercase") ruw = ruw.toUpperCase();
    else if (s.textTransform === "lowercase") ruw = ruw.toLowerCase();
    const opmaak = this.opmaak(ouder, s);
    if (/^pre/.test(s.whiteSpace) || s.whiteSpace === "break-spaces") {
      ruw.split("\n").forEach((regel, i) => {
        if (i > 0) this.runs.push({ soort: "regeleinde" });
        regel.split("\t").forEach((stuk, j) => {
          if (j > 0) this.runs.push({ soort: "tab" });
          if (stuk) this.runs.push({ ...opmaak, tekst: stuk });
        });
      });
      return;
    }
    let tekst = ruw.replace(/[ \t\n\r\f]+/g, " ");
    const vorige = this.runs[this.runs.length - 1];
    const naWit = !vorige || vorige.soort === "tab" || vorige.soort === "regeleinde" || (vorige.soort === "tekst" && vorige.tekst.endsWith(" "));
    if (naWit) tekst = tekst.replace(/^ /, "");
    if (!tekst) return;
    if (vorige?.soort === "tekst" && zelfdeOpmaak(vorige, opmaak)) vorige.tekst += tekst;
    else this.runs.push({ ...opmaak, tekst });
  }

  private opmaak(el: Element, s: CSSStyleDeclaration): TekstRun {
    const r: TekstRun = { soort: "tekst", tekst: "" };
    if ((parseInt(s.fontWeight, 10) || 400) >= 600 || this.eigen.kop) r.vet = true;
    if (s.fontStyle === "italic" || s.fontStyle.startsWith("oblique")) r.cursief = true;
    if (el.closest("u, ins")) r.onderstreept = true;
    const sub = el.closest("sub, sup");
    if (sub) r.positie = sub.tagName === "SUB" ? "sub" : "sup";
    else if (s.verticalAlign === "sub") r.positie = "sub";
    else if (s.verticalAlign === "super") r.positie = "sup";
    if (/mono|consolas|courier/i.test(s.fontFamily)) r.mono = true;
    const kleur = hexKleur(s.color);
    if (kleur) r.kleur = kleur;
    if (this.eigen.kop) delete r.kleur;
    return r;
  }

  /** Een knoop in de lopende tekst. */
  knoop(knoop: Node) {
    if (knoop.nodeType === Node.TEXT_NODE) return this.tekst(knoop as Text);
    if (knoop.nodeType !== Node.ELEMENT_NODE) return;
    const el = knoop as Element;
    if (this.verborgen(el) || el.matches("script, style, template, .rpa-voet")) return;

    if (el.matches(".katex")) return this.formule(el);
    if (el.matches("figure.print-pdf-pagina")) return this.pdfPagina(el);
    if (el.matches(".calc-iframe")) {
      const adres = (el as HTMLElement).dataset.iframeUrl ?? "";
      this.nietMee.push({ soort: "iframe", naam: adres, aantal: 1 });
      this.regel(this.t("documentExport.iframeNietOpgenomen", { adres }));
      return;
    }
    if (el.matches(".calc-js")) {
      this.nietMee.push({ soort: "js", naam: "@js", aantal: 1 });
      this.regel(this.t("documentExport.jsNietOpgenomen"));
      return;
    }
    if (el.matches(INGEBED)) {
      const soort = el.tagName.toLowerCase();
      this.nietMee.push({ soort: "ingebed", naam: soort, aantal: 1 });
      this.regel(this.t("documentExport.ingebedNietOpgenomen", { soort }));
      return;
    }
    if (el.matches("svg, canvas, img")) return this.beeld(el);
    if (el.matches("input, select, textarea")) return this.veld(el);
    if (el.tagName === "BR") {
      this.runs.push({ soort: "regeleinde" });
      return;
    }
    if (el.tagName === "HR") return;
    if (el.tagName === "TABLE") return this.tabel(el as HTMLTableElement);

    const kop = kopNiveau(el);
    if (kop) return this.kop(el, kop);
    if (this.isInline(el)) {
      // De kinderen van een inline-flex (een invoerregel: naam, waarde, eenheid) zijn
      // blokken voor CSS, maar staan op één regel: daar een spatie tussen.
      const vorig = this.scheiding;
      if (/^inline-(flex|grid)$/.test(this.stijl(el).display)) this.scheiding = "spatie";
      for (const k of el.childNodes) this.knoop(k);
      this.scheiding = vorig;
      return;
    }
    if (this.plat || this.scheiding) {
      // Binnen één regel: een blok is een kolom, met een tab of spatie ervoor.
      const laatste = this.runs[this.runs.length - 1];
      if (this.scheiding !== "spatie") {
        if (laatste) this.runs.push({ soort: "tab" });
      } else if (laatste && !(laatste.soort === "tekst" && laatste.tekst.endsWith(" "))) {
        this.runs.push({ soort: "tekst", tekst: " " });
      }
      for (const k of el.childNodes) this.knoop(k);
      return;
    }
    this.blok(el);
  }

  /** Een invoerveld of keuzelijst: wat erin staat, als tekst. */
  private veld(el: Element) {
    let waarde = "";
    if (el instanceof HTMLSelectElement) waarde = el.selectedOptions[0]?.text ?? "";
    else if (el instanceof HTMLTextAreaElement) waarde = el.value;
    else if (el instanceof HTMLInputElement) {
      if (el.type === "checkbox" || el.type === "radio") waarde = el.checked ? "☒" : "☐";
      else if (!["hidden", "file", "button", "submit", "reset", "image"].includes(el.type)) waarde = el.value || el.placeholder;
    }
    if (!waarde) return;
    const vorige = this.runs[this.runs.length - 1];
    if (vorige?.soort === "tekst" && !vorige.tekst.endsWith(" ")) this.runs.push({ soort: "tekst", tekst: " " });
    this.tekstVan(waarde, el);
    this.runs.push({ soort: "tekst", tekst: " " });
  }

  /** Een blok: een eigen alinea, of een rij naast elkaar, of een lijst. */
  blok(el: Element) {
    this.sluitAlinea();
    const vorige = this.eigen;
    const s = this.stijl(el);
    const eigen: Eigen = { ...vorige, kop: undefined };
    const u = s.textAlign;
    eigen.uitlijning = u === "center" ? "midden" : u === "right" || u === "end" ? "rechts" : undefined;
    if (el.tagName === "PRE") eigen.stijl = "code";
    this.eigen = eigen;

    if (el.tagName === "LI") {
      const lijst = el.parentElement;
      const diepte = Math.max(1, ancestors(el).filter((a) => a.tagName === "UL" || a.tagName === "OL").length);
      this.eigen = { ...eigen, inspringen: diepte };
      const nummer = lijst?.tagName === "OL" ? [...lijst.children].indexOf(el) + ((lijst as HTMLOListElement).start || 1) : 0;
      this.runs.push({ soort: "tekst", tekst: nummer ? `${nummer}. ` : "• " });
    }

    if (this.isRij(el, s)) this.rij(el);
    else for (const k of el.childNodes) this.knoop(k);
    this.sluitAlinea();
    this.eigen = vorige;
  }

  /**
   * Een flex- of grid-rij met alleen tekst (een regel van het voorblad, van de inhoud,
   * een kop met zijn uitkomst): per regel op het scherm één alinea, de vakken met een tab.
   */
  private isRij(el: Element, s: CSSStyleDeclaration): boolean {
    const flexRij = s.display === "flex" && !s.flexDirection.startsWith("column");
    if (!flexRij && s.display !== "grid") return false;
    if (el.querySelector(ZWAAR)) return false;
    return [...el.children].filter((k) => !this.verborgen(k)).length > 1;
  }

  private rij(el: Element) {
    const kinderen = [...el.childNodes].filter((k) => k.nodeType === Node.ELEMENT_NODE ? !this.verborgen(k as Element) : (k.textContent ?? "").trim() !== "");
    let regel: Node[] = [];
    let top = Number.NaN;
    const schrijf = () => {
      if (regel.length === 0) return;
      const vorigPlat = this.plat;
      this.plat = true;
      regel.forEach((k, i) => {
        if (i > 0) this.runs.push({ soort: "tab" });
        if (k.nodeType === Node.ELEMENT_NODE) for (const kk of (k as Element).childNodes) this.knoop(kk);
        else this.knoop(k);
      });
      this.plat = vorigPlat;
      this.sluitAlinea();
      regel = [];
    };
    for (const k of kinderen) {
      const t = k.nodeType === Node.ELEMENT_NODE ? (k as Element).getBoundingClientRect().top : top;
      if (regel.length && Math.abs(t - top) > 2) schrijf();
      if (regel.length === 0) top = t;
      regel.push(k);
    }
    schrijf();
  }

  /** Een kop: alles erin op één regel. */
  private kop(el: Element, niveau: 1 | 2 | 3) {
    this.sluitAlinea();
    const vorige = this.eigen;
    const vorigPlat = this.plat;
    this.eigen = { kop: niveau };
    this.plat = true;
    for (const k of el.childNodes) this.knoop(k);
    // Een kop is tekst: een tab tussen nummer en titel wordt een spatie.
    this.runs = this.runs.map((r): Run => (r.soort === "tab" ? { soort: "tekst", tekst: " " } : r));
    this.sluitAlinea();
    this.plat = vorigPlat;
    this.eigen = vorige;
  }

  private formule(el: Element) {
    const math = el.querySelector(".katex-mathml math");
    const tex = math?.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? "";
    const html = el.querySelector(".katex-html")?.textContent ?? el.textContent ?? "";
    const blok = el.closest(".katex-display") !== null;
    if (!math) {
      // Zonder MathML (KaTeX met alleen HTML): de tekst, zoals hij er staat.
      this.runs.push({ soort: "tekst", tekst: html, cursief: true });
      return;
    }
    if (blok && !this.plat) this.sluitAlinea();
    this.runs.push({ soort: "formule", mathml: (tex && mathmlUitTex(tex, blok, math)) || mathmlTekst(math), tekst: tex || html, blok: blok && !this.plat });
    if (blok && !this.plat) this.sluitAlinea();
  }

  private pdfPagina(el: Element) {
    const naam = (el as HTMLElement).dataset.pdfBestand ?? "PDF";
    const ouder = el.parentElement;
    const vorige = this.laatstePdf;
    if (vorige && vorige.ouder === ouder && vorige.naam === naam) {
      vorige.mee.aantal++;
      return;
    }
    const mee: NietMee = { soort: "pdf", naam, aantal: 1 };
    this.nietMee.push(mee);
    const alinea = this.regel("");
    this.laatstePdf = { ouder, naam, alinea, mee };
    this.pdfRegels.push({ alinea, mee });
  }

  private beeld(el: Element) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const blok = !this.isInline(el) && !this.plat;
    if (blok) this.sluitAlinea();
    const maat = pasInBladspiegel(r.width * PX_MM, r.height * PX_MM);
    this.runs.push({ soort: "beeld", beeld: this.beelden.length });
    this.beelden.push(naarPng(el, r.width, r.height).then((png) => (png ? { ...png, ...maat } : null)).catch(() => null));
    if (blok) this.sluitAlinea();
  }

  private tabel(el: HTMLTableElement) {
    this.sluitAlinea();
    const rijen: Cel[][] = [];
    for (const tr of el.rows) {
      if (this.verborgen(tr)) continue;
      const kopRij = tr.parentElement?.tagName === "THEAD";
      const rij: Cel[] = [];
      for (const td of tr.cells) {
        if (this.verborgen(td)) continue;
        const sub = new Lezer(this.t, this.beelden, this.nietMee, this.pdfRegels);
        sub.blok(td);
        rij.push({
          alineas: sub.blokken.flatMap((b) => (b.soort === "tabel" ? tabelAlsAlineas(b) : [b])),
          kolommen: Math.max(1, td.colSpan || 1),
          rijen: Math.max(1, td.rowSpan || 1),
          kop: kopRij || td.tagName === "TH",
        });
      }
      rijen.push(rij);
    }
    if (rijen.some((r) => r.length)) this.voeg({ soort: "tabel", rijen } satisfies Tabel);
  }
}

/**
 * De MathML van een formule, opnieuw door KaTeX gemaakt uit de TeX in de afdruk. De kopie
 * in de afdruk zelf is niet altijd heel: KaTeX zet bij `\boldsymbol` (een uitkomst) een
 * hele rij in een `mi`, en de HTML-parser van de browser maakt daar platte tekst van.
 * Als tekst rechtstreeks van KaTeX blijft die rij staan. `null` als het niet lukt.
 */
function mathmlUitTex(tex: string, blok: boolean, math: Element): string | null {
  let mathml: string;
  try {
    const html = katex.renderToString(tex, { output: "mathml", displayMode: blok, throwOnError: false, trust: true, strict: false });
    const m = /<math[\s\S]*<\/math>/.exec(html);
    if (!m) return null;
    mathml = m[0];
  } catch {
    return null;
  }
  // Alleen als er hetzelfde staat als op papier. Op papier staat in het Nederlands een
  // komma in de getallen (metDecimaalKomma in de kern), in de TeX een punt.
  const zicht = (s: string) => s.replace(/\s+/g, "");
  const opPapier = zicht([...math.childNodes].map(tekstZonderAnnotatie).join(""));
  const tekstVan = (xml: string) => {
    try {
      const wortel = leesXml(xml);
      const sem = elementen(wortel).find((e) => e.naam === "semantics");
      return zicht(platteTekst(sem ? elementen(sem)[0] ?? sem : wortel));
    } catch {
      return null;
    }
  };
  if (tekstVan(mathml) === opPapier) return mathml;
  const metKomma = metDecimaalKomma(mathml);
  return tekstVan(metKomma) === opPapier ? metKomma : null;
}

/** De tekst van een MathML-knoop in de DOM, zonder de TeX-annotatie. */
function tekstZonderAnnotatie(k: Node): string {
  if (k.nodeType === Node.TEXT_NODE) return (k as Text).data;
  if (k.nodeType !== Node.ELEMENT_NODE || /^annotation/i.test((k as Element).localName)) return "";
  return [...k.childNodes].map(tekstZonderAnnotatie).join("");
}

/**
 * De MathML van een formule zoals hij in de afdruk staat, als terugval. Zelf geschreven
 * en niet met XMLSerializer: daar kunnen elementen in de HTML-namespace tussen zitten.
 * Hier telt alleen de naam.
 */
function mathmlTekst(el: Element): string {
  const attr = [...el.attributes]
    .filter((a) => !a.name.startsWith("xmlns"))
    .map((a) => ` ${a.localName}="${xmlTekst(a.value)}"`)
    .join("");
  const binnen = [...el.childNodes].map((k) => {
    if (k.nodeType === Node.TEXT_NODE) return xmlTekst((k as Text).data);
    return k.nodeType === Node.ELEMENT_NODE ? mathmlTekst(k as Element) : "";
  }).join("");
  const naam = el.localName.toLowerCase();
  return `<${naam}${attr}>${binnen}</${naam}>`;
}

/** Het aantal kolommen van de eerste rij, met cellen die over meer kolommen lopen. */
function kolommenVan(t: Tabel): number {
  return (t.rijen[0] ?? []).reduce((som, c) => som + c.kolommen, 0);
}

/** Een tabel in een cel: zijn rijen als alinea's, de cellen met een tab ertussen. */
function tabelAlsAlineas(t: Tabel): Alinea[] {
  return t.rijen.map((rij) => ({
    soort: "alinea",
    runs: rij.flatMap((c, i) => [...(i > 0 ? [{ soort: "tab" } as Run] : []), ...c.alineas.flatMap((a) => a.runs)]),
  }));
}

function zelfdeOpmaak(a: TekstRun, b: TekstRun): boolean {
  return a.vet === b.vet && a.cursief === b.cursief && a.onderstreept === b.onderstreept && a.positie === b.positie && a.mono === b.mono && a.kleur === b.kleur;
}

function ancestors(el: Element): Element[] {
  const uit: Element[] = [];
  for (let a = el.parentElement; a; a = a.parentElement) uit.push(a);
  return uit;
}

/**
 * Het niveau van een kop: een hoofdstuk (h1) is 1, een paragraaf (h2) en de kop van een
 * blad zijn 2, en een kop in de uitwerking van een blad is 3.
 */
function kopNiveau(el: Element): 1 | 2 | 3 | null {
  if (el.matches(".print-blad-kop")) return 2;
  const m = /^H([1-6])$/.exec(el.tagName);
  if (!m) return null;
  if (el.closest(".print-blad")) return 3;
  return Math.min(3, Number(m[1])) as 1 | 2 | 3;
}

/** Een CSS-kleur als `RRGGBB`; niets voor (bijna) zwart, wit of doorzichtig. */
function hexKleur(css: string): string | undefined {
  const m = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+%?))?/.exec(css);
  if (!m) return undefined;
  const [r, g, b] = [m[1], m[2], m[3]].map(Number);
  const alfa = m[4] === undefined ? 1 : m[4].endsWith("%") ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
  if (alfa < 0.5 || Math.max(r, g, b) < 90 || Math.min(r, g, b) > 200) return undefined;
  return [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();
}

// ── afbeeldingen ────────────────────────────────────────────────────────────

/** Twee keer de schermresolutie: scherp genoeg om te printen, niet te groot. */
const SCHAAL = 2;

/** De eigenschappen die een SVG van zijn CSS krijgt; als PNG getekend moeten ze erin staan. */
const SVG_STIJL = [
  "fill", "fill-opacity", "fill-rule", "stroke", "stroke-width", "stroke-opacity", "stroke-dasharray", "stroke-linecap",
  "stroke-linejoin", "opacity", "font-family", "font-size", "font-weight", "font-style", "text-anchor",
  "dominant-baseline", "alignment-baseline", "display", "visibility", "color", "paint-order",
];

function base64NaarBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const uit = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) uit[i] = bin.charCodeAt(i);
  return uit;
}

function dataUrlNaarBeeld(url: string): Pick<Beeld, "bytes" | "type"> | null {
  const m = /^data:image\/(png|jpeg|jpg);base64,(.*)$/s.exec(url);
  if (!m) return null;
  return { bytes: base64NaarBytes(m[2]), type: m[1] === "png" ? "png" : "jpeg" };
}

async function canvasNaarPng(doek: HTMLCanvasElement): Promise<Pick<Beeld, "bytes" | "type"> | null> {
  const blob = await new Promise<Blob | null>((klaar) => doek.toBlob(klaar, "image/png"));
  if (!blob) return null;
  return { bytes: new Uint8Array(await blob.arrayBuffer()), type: "png" };
}

/** Tekent een geladen afbeelding op een doek van `b` × `h` pixels. */
function tekenOpDoek(bron: CanvasImageSource, b: number, h: number): HTMLCanvasElement {
  const doek = document.createElement("canvas");
  doek.width = Math.max(1, Math.round(b));
  doek.height = Math.max(1, Math.round(h));
  const ctx = doek.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.drawImage(bron, 0, 0, doek.width, doek.height);
  return doek;
}

async function laad(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = "async";
  img.src = url;
  await img.decode();
  return img;
}

/** Een SVG met zijn stijl erin, als losse tekst. */
function svgAlsTekst(svg: SVGSVGElement, b: number, h: number): string {
  const kopie = svg.cloneNode(true) as SVGSVGElement;
  const origineel = [svg, ...svg.querySelectorAll("*")];
  const kopieen = [kopie, ...kopie.querySelectorAll("*")];
  origineel.forEach((el, i) => {
    const doel = kopieen[i] as SVGElement | undefined;
    if (!doel?.style) return;
    const s = getComputedStyle(el);
    for (const eig of SVG_STIJL) {
      const w = s.getPropertyValue(eig);
      if (w) doel.style.setProperty(eig, w);
    }
  });
  kopie.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  kopie.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  kopie.setAttribute("width", String(b));
  kopie.setAttribute("height", String(h));
  return new XMLSerializer().serializeToString(kopie);
}

/** Een SVG, canvas of afbeelding als PNG (of JPEG zoals hij al was). */
async function naarPng(el: Element, b: number, h: number): Promise<Pick<Beeld, "bytes" | "type"> | null> {
  if (el instanceof HTMLCanvasElement) {
    if (el.width === 0 || el.height === 0) return null;
    return canvasNaarPng(el);
  }
  if (el instanceof SVGSVGElement) {
    const url = URL.createObjectURL(new Blob([svgAlsTekst(el, b, h)], { type: "image/svg+xml" }));
    try {
      const img = await laad(url);
      return canvasNaarPng(tekenOpDoek(img, b * SCHAAL, h * SCHAAL));
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  if (el instanceof HTMLImageElement) {
    if (!el.complete) await el.decode().catch(() => undefined);
    if (!el.naturalWidth) return null;
    const direct = dataUrlNaarBeeld(el.currentSrc || el.src);
    if (direct) return direct;
    // Een SVG als afbeelding heeft geen vaste resolutie: op twee keer de maat op papier.
    const svg = /\.svg(\?|#|$)|^data:image\/svg/i.test(el.currentSrc || el.src);
    const breed = svg ? b * SCHAAL : el.naturalWidth;
    const hoog = svg ? h * SCHAAL : el.naturalHeight;
    return canvasNaarPng(tekenOpDoek(el, breed, hoog));
  }
  return null;
}

// ── het geheel ──────────────────────────────────────────────────────────────

/** Vervangt in alle alinea's de verwijzingen naar afbeeldingen; een mislukte wordt een regel. */
function nummerBeeldenOm(blokken: DocBlok[], nieuw: (number | null)[], mislukt: string) {
  const alinea = (a: Alinea) => {
    a.runs = a.runs.map((r): Run => {
      if (r.soort !== "beeld") return r;
      const n = nieuw[r.beeld];
      return n === null ? { soort: "tekst", tekst: mislukt, cursief: true, kleur: "555555" } : { soort: "beeld", beeld: n };
    });
  };
  for (const b of blokken) {
    if (b.soort === "alinea") alinea(b);
    else for (const rij of b.rijen) for (const c of rij) c.alineas.forEach(alinea);
  }
}

/**
 * Leest het rapport uit `wortel` (de `.rpa-wortel` in de meetopstelling). `t` geeft de
 * vaste woorden in de taal van het rapport (namespace "rapport").
 */
export async function leesAfdruk(wortel: HTMLElement, kop: Kop, t: TFunction): Promise<Uitlezing> {
  const beelden: Wachtend[] = [];
  const nietMee: NietMee[] = [];
  const pdfRegels: { alinea: Alinea; mee: NietMee }[] = [];
  const lezer = new Lezer(t, beelden, nietMee, pdfRegels);
  lezer.voeg({ soort: "alinea", stijl: "momentopname", runs: [{ soort: "tekst", tekst: kop.momentopname }] });

  // Elk onderdeel van het rapport begint op een nieuw vel; het eerste deelt zijn vel met
  // de regel over de momentopname.
  let eerste = true;
  for (const deel of wortel.children) {
    if (getComputedStyle(deel).display === "none") continue;
    const voor = lezer.blokken.length;
    lezer.nieuwePagina = !eerste;
    lezer.knoop(deel);
    lezer.sluitAlinea();
    if (lezer.blokken.length > voor) eerste = false;
    lezer.nieuwePagina = false;
  }

  for (const { alinea, mee } of pdfRegels) {
    alinea.runs = [{ soort: "tekst", tekst: t("documentExport.pdfNietOpgenomen", { bestand: mee.naam, count: mee.aantal }), cursief: true, kleur: "555555" }];
  }

  const klaar = await Promise.all(beelden);
  const lijst: Beeld[] = [];
  const nieuw = klaar.map((b) => {
    if (!b) return null;
    lijst.push(b);
    return lijst.length - 1;
  });
  const mislukt = klaar.filter((b) => !b).length;
  if (mislukt) nietMee.push({ soort: "beeld", naam: "", aantal: mislukt });
  nummerBeeldenOm(lezer.blokken, nieuw, t("documentExport.beeldNietOpgenomen"));

  // Het lettertype van de huisstijl (`--rpa-font`), en of het een schreefletter is: staat
  // het niet op de computer die het document opent, dan kiest de editor er een van die soort.
  const s = getComputedStyle(wortel);
  const familie = (s.getPropertyValue("--rpa-font") || s.fontFamily).split(",").map((f) => f.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  const lettertype = familie[0] || "Arial";
  const schreef = familie.includes("serif") && !familie.includes("sans-serif");
  return {
    document: {
      titel: kop.titel,
      taal: kop.taal,
      voettekst: kop.voettekst,
      lettertype,
      schreef,
      gemaakt: kop.gemaakt.toISOString(),
      blokken: lezer.blokken,
      beelden: lijst,
    },
    nietMee,
  };
}
