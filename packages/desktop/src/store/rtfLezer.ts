/**
 * Een kleine RTF-lezer: van een RTF-bestand naar de Markdown-tekst van een blad.
 *
 * Wat meegaat:
 *   • alinea's, regeleinden (`\line`) en tabs;
 *   • vet, cursief, onderstreept, superscript en subscript (als html-tags in de
 *     Markdown: die werken ook midden in een woord of naast een leesteken);
 *   • lijsten, uit de opsommingstekens die het bestand zelf meegeeft (`\pntext`,
 *     `\listtext`), met hun niveau (`\ilvl` of de inspringing);
 *   • koppen, uit `\outlinelevel` of een stijl met de naam "heading 1" of "kop 1";
 *   • eenvoudige tabellen (`\cell`, `\row`), de eerste rij als kop;
 *   • tekens als `\uN` (unicode) en `\'hh` (codepagina, standaard 1252);
 *   • afbeeldingen in PNG of JPEG. Andere formaten (zoals WMF en EMF) gaan niet
 *     mee: dat staat in `meldingen`.
 *
 * Wat wegvalt: lettertypen, kleuren, stijlen, kop- en voetteksten, voetnoten,
 * veldcodes (wel hun uitkomst), en alle groepen met `\*` die de lezer niet kent.
 *
 * Puur en zonder imports: scripts/check-gekoppelde-bestanden.mjs laadt dit in Node.
 */

export interface RtfUitkomst {
  /** De tekst als Markdown. */
  tekst: string;
  /** Afbeeldingen: per adres in de tekst een data-URL, zoals bij een Markdown-blad. */
  beelden: Record<string, string>;
  /** Wat niet meeging, als korte codes: "beeld:wmf", "beeld:emf", … */
  meldingen: string[];
}

/** Begint het bestand als RTF? Witruimte vooraf mag. */
export function lijktOpRtf(bytes: Uint8Array): boolean {
  let i = 0;
  while (i < bytes.length && (bytes[i] === 0x20 || bytes[i] === 0x0a || bytes[i] === 0x0d || bytes[i] === 0x09)) i++;
  // "{\rtf"
  return bytes[i] === 0x7b && bytes[i + 1] === 0x5c && bytes[i + 2] === 0x72 && bytes[i + 3] === 0x74 && bytes[i + 4] === 0x66;
}

/** Groepen waarvan de inhoud nooit tekst is. */
const OVERSLAAN = new Set([
  "fonttbl", "colortbl", "info", "header", "headerl", "headerr", "headerf", "footer", "footerl", "footerr", "footerf",
  "footnote", "annotation", "atnid", "atnauthor", "object", "objdata", "fldinst", "listtable", "listoverridetable",
  "rsidtbl", "generator", "themedata", "colorschememapping", "latentstyles", "datastore", "xmlnstbl", "pgdsctbl",
  "revtbl", "filetbl", "nonshppict", "pn", "xe", "tc", "txe", "bkmkstart", "bkmkend", "docvar", "userprops",
  "mmathPr", "wgrffmtfilter", "falt", "panose", "leveltext", "levelnumbers", "listname", "pnseclvl", "pntxta", "pntxtb",
  "template", "comment", "private", "passwordhash", "protusertbl", "fchars", "lchars", "ftnsep", "ftnsepc", "aftnsep",
  "aftnsepc", "ftncn", "aftncn", "sp", "sn", "sv", "shpinst", "shptxt", "picprop", "blipuid", "macpict", "keywords",
]);

/** Groepen met `\*` die toch inhoud hebben. */
const STER_TOCH = new Set(["shppict"]);

/** Tekens die een eigen woord hebben. */
const SYMBOLEN: Record<string, string> = {
  emdash: "—", endash: "–", lquote: "‘", rquote: "’", ldblquote: "“", rdblquote: "”",
  bullet: "•", emspace: " ", enspace: " ", qmspace: " ", zwj: "", zwnj: "",
};

interface Teken {
  b: boolean;
  i: boolean;
  ul: boolean;
  sup: boolean;
  sub: boolean;
}

type Bestemming = "tekst" | "weg" | "lijstteken" | "beeld" | "stijl";

interface Groep {
  bestemming: Bestemming;
  teken: Teken;
  /** Hoeveel tekens na `\uN` overgeslagen worden. */
  uc: number;
  /** In een stijlgroep: het nummer van de stijl. */
  stijl?: number;
  /** Een `\*` is gezien en het volgende woord bepaalt of de groep meetelt. */
  ster?: boolean;
  /** Dit is de groep waarin de bestemming begon (de afbeelding of de stijl sluit daar). */
  eigenaar?: boolean;
}

interface Stuk extends Teken {
  tekst: string;
}

interface Alinea {
  stukken: Stuk[];
  /** De tekst van het opsommingsteken uit `\pntext` of `\listtext`. */
  lijstteken: string;
  /** Een lijst volgens `\ls` zonder eigen opsommingsteken. */
  lijstNr: number;
  niveau: number | null;
  inspringing: number;
  kop: number;
  inTabel: boolean;
}

type Blok =
  | { soort: "alinea"; md: string }
  | { soort: "kop"; niveau: number; md: string }
  | { soort: "lijst"; genummerd: boolean; nummer: number; niveau: number; lijstNr: number; md: string }
  | { soort: "tabel"; rijen: string[][] };

const LEEG_TEKEN: Teken = { b: false, i: false, ul: false, sup: false, sub: false };

/** Escapes voor gewone tekst in Markdown: dan blijft het gewone tekst. */
function escape(tekst: string): string {
  return tekst.replace(/[\\`*_[\]<>|~&]/g, (t) => `\\${t}`);
}

/** Een tekst aan het begin van een regel die anders een kop, lijst of citaat wordt. */
function escapeBegin(md: string): string {
  return md.replace(/^(\s*)([#+=>-]|\d+[.)])/, (_, ws: string, t: string) => `${ws}${t.replace(/([#+=>.)-])$/, "\\$1")}`);
}

function stukkenNaarMd(stukken: Stuk[]): string {
  // Aaneengesloten stukken met dezelfde opmaak samenvoegen.
  const samen: Stuk[] = [];
  for (const s of stukken) {
    const vorige = samen[samen.length - 1];
    if (vorige && vorige.b === s.b && vorige.i === s.i && vorige.ul === s.ul && vorige.sup === s.sup && vorige.sub === s.sub) {
      vorige.tekst += s.tekst;
    } else samen.push({ ...s });
  }
  let uit = "";
  for (const s of samen) {
    // Een regeleinde staat als \n in de tekst; witruimte blijft buiten de tags.
    const delen = s.tekst.split("\n");
    uit += delen
      .map((deel) => {
        const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(deel)!;
        let kern = escape(m[2]);
        if (kern === "") return deel.replace(/\s+/g, " ");
        if (s.sub) kern = `<sub>${kern}</sub>`;
        if (s.sup) kern = `<sup>${kern}</sup>`;
        if (s.ul) kern = `<u>${kern}</u>`;
        if (s.i) kern = `<em>${kern}</em>`;
        if (s.b) kern = `<strong>${kern}</strong>`;
        return `${m[1] ? " " : ""}${kern}${m[3] ? " " : ""}`;
      })
      .join("<br>");
  }
  return uit.replace(/ {2,}/g, " ").trim();
}

/** De tekens 0x80–0x9F van codepagina 1252; de rest is gelijk aan Latin-1. */
const CP1252_80 = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f\u0090‘’“”•–—˜™š›œ\u009džŸ";

/** Codepagina 1252 met de hand: niet elke omgeving decodeert 0x80–0x9F goed. */
const CP1252 = { decode: (b: Uint8Array) => Array.from(b, (c) => (c >= 0x80 && c <= 0x9f ? CP1252_80[c - 0x80] : String.fromCharCode(c))).join("") };

/** Een decoder voor de codepagina van het bestand; 1252 als die onbekend is. */
function decoderVoor(codepagina: number): { decode: (b: Uint8Array) => string } {
  if (codepagina === 1252) return CP1252;
  try {
    return new TextDecoder(codepagina === 65001 ? "utf-8" : `windows-${codepagina}`);
  } catch {
    return CP1252;
  }
}

/** Een getal met de lijstnummering ("3." of "3)") of een opsommingsteken. */
function leesLijstteken(teken: string): { genummerd: boolean; nummer: number } {
  const m = /^\(?(\d+)[.)]?$/.exec(teken.trim());
  return m ? { genummerd: true, nummer: Number(m[1]) } : { genummerd: false, nummer: 0 };
}

export function rtfNaarMarkdown(invoer: Uint8Array | string): RtfUitkomst {
  // Elke byte wordt één teken; `\'hh` en hoge bytes gaan door de codepagina.
  const s = typeof invoer === "string" ? invoer : Array.from(invoer, (b) => String.fromCharCode(b)).join("");
  let decoder = decoderVoor(1252);
  const beelden: Record<string, string> = {};
  const meldingen: string[] = [];
  const blokken: Blok[] = [];
  const stijlKoppen = new Map<number, number>();

  const stapel: Groep[] = [];
  let groep: Groep = { bestemming: "tekst", teken: { ...LEEG_TEKEN }, uc: 1 };
  let overslaan = 0;
  let bytes: number[] = [];

  const nieuweAlinea = (): Alinea => ({ stukken: [], lijstteken: "", lijstNr: 0, niveau: null, inspringing: 0, kop: 0, inTabel: false });
  let alinea = nieuweAlinea();
  // Eigenschappen van de alinea blijven tot \pard; het opsommingsteken en de tekst niet.
  let alineaStijl = 0;

  let tabelRij: string[] = [];
  let tabelRijen: string[][] = [];
  let celTekst: string[] = [];

  // Afbeelding in opbouw.
  let beeldFormaat = "";
  let beeldHex: string[] = [];
  // Stijl in opbouw.
  let stijlNaam = "";

  const voegTekstToe = (tekst: string) => {
    if (tekst === "") return;
    if (groep.bestemming === "lijstteken") {
      alinea.lijstteken += tekst;
      return;
    }
    if (groep.bestemming === "stijl") {
      stijlNaam += tekst;
      return;
    }
    if (groep.bestemming !== "tekst") return;
    const laatste = alinea.stukken[alinea.stukken.length - 1];
    const t = groep.teken;
    if (laatste && laatste.b === t.b && laatste.i === t.i && laatste.ul === t.ul && laatste.sup === t.sup && laatste.sub === t.sub) laatste.tekst += tekst;
    else alinea.stukken.push({ ...t, tekst });
  };

  const spoelBytes = () => {
    if (bytes.length === 0) return;
    const tekst = decoder.decode(new Uint8Array(bytes));
    bytes = [];
    voegTekstToe(tekst);
  };

  /** Het niveau van een lijstalinea: `\ilvl`, anders uit de inspringing (360 twips per stap). */
  const niveauVan = (a: Alinea) => Math.max(0, Math.min(6, a.niveau ?? Math.round(a.inspringing / 360) - 1));

  const sluitAlinea = () => {
    spoelBytes();
    const md = stukkenNaarMd(alinea.stukken);
    if (alinea.inTabel) {
      if (md) celTekst.push(md);
    } else if (alinea.lijstteken.trim() !== "" || alinea.lijstNr > 0) {
      const { genummerd, nummer } = leesLijstteken(alinea.lijstteken);
      if (md) blokken.push({ soort: "lijst", genummerd, nummer, niveau: niveauVan(alinea), lijstNr: alinea.lijstNr, md });
    } else if (md) {
      const kop = alinea.kop || stijlKoppen.get(alineaStijl) || 0;
      blokken.push(kop > 0 ? { soort: "kop", niveau: Math.min(kop, 6), md } : { soort: "alinea", md: escapeBegin(md) });
    }
    const vorige = alinea;
    alinea = nieuweAlinea();
    alinea.niveau = vorige.niveau;
    alinea.inspringing = vorige.inspringing;
    alinea.kop = vorige.kop;
    alinea.inTabel = vorige.inTabel;
    alinea.lijstNr = vorige.lijstNr;
  };

  const sluitCel = () => {
    sluitAlinea();
    tabelRij.push(celTekst.join("<br>"));
    celTekst = [];
  };

  const sluitRij = () => {
    if (alinea.stukken.length > 0) sluitCel();
    if (tabelRij.length > 0) tabelRijen.push(tabelRij);
    tabelRij = [];
  };

  const sluitTabel = () => {
    if (tabelRij.length > 0 || celTekst.length > 0) sluitRij();
    if (tabelRijen.length > 0) blokken.push({ soort: "tabel", rijen: tabelRijen });
    tabelRijen = [];
  };

  const sluitBeeld = () => {
    const hex = beeldHex.join("").replace(/[^0-9a-f]/gi, "");
    beeldHex = [];
    const mime = beeldFormaat === "pngblip" ? "image/png" : beeldFormaat === "jpegblip" ? "image/jpeg" : "";
    if (!mime) {
      const naam = { emfblip: "emf", wmetafile: "wmf", dibitmap: "bmp", wbitmap: "bmp", macpict: "pict" }[beeldFormaat] ?? (beeldFormaat || "onbekend");
      meldingen.push(`beeld:${naam}`);
      return;
    }
    if (hex.length < 8) return;
    let bin = "";
    for (let i = 0; i + 1 < hex.length; i += 2) bin += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    // Alleen een afbeelding in de lopende tekst; niet een in een overgeslagen groep.
    if (stapel[stapel.length - 1]?.bestemming !== "tekst") return;
    const nr = Object.keys(beelden).length + 1;
    const naam = `rtf-beeld-${nr}.${mime === "image/png" ? "png" : "jpg"}`;
    beelden[naam] = `data:${mime};base64,${btoa(bin)}`;
    // De verwijzing komt in de tekst van de alinea, buiten de opmaak; blokkenNaarMd maakt er Markdown van.
    voorTekst();
    alinea.stukken.push({ ...LEEG_TEKEN, tekst: `\u0000beeld:${naam}\u0000` });
  };

  const sluitStijl = () => {
    const naam = stijlNaam.replace(/;\s*$/, "").trim();
    stijlNaam = "";
    const m = /^(?:heading|kop)\s*(\d)$/i.exec(naam);
    if (m && groep.stijl !== undefined) stijlKoppen.set(groep.stijl, Number(m[1]));
  };

  const woord = (naam: string, param: number | null) => {
    // Na `\*`: alleen bekende groepen lezen.
    if (groep.ster) {
      groep.ster = false;
      if (!STER_TOCH.has(naam)) {
        groep.bestemming = "weg";
        return;
      }
    }
    if (groep.bestemming === "weg") return;
    if (OVERSLAAN.has(naam)) {
      spoelBytes();
      groep.bestemming = "weg";
      return;
    }
    if (naam === "stylesheet") {
      groep.bestemming = "stijl";
      return;
    }
    if (groep.bestemming === "stijl") {
      if (naam === "s" && param !== null) {
        groep.stijl = param;
        groep.eigenaar = true;
      }
      return;
    }
    if (naam === "pict") {
      spoelBytes();
      groep.bestemming = "beeld";
      groep.eigenaar = true;
      beeldFormaat = "";
      beeldHex = [];
      return;
    }
    if (groep.bestemming === "beeld") {
      if (["pngblip", "jpegblip", "emfblip", "wmetafile", "dibitmap", "wbitmap", "macpict"].includes(naam)) beeldFormaat = naam;
      return;
    }
    if (naam === "pntext" || naam === "listtext") {
      spoelBytes();
      groep.bestemming = "lijstteken";
      return;
    }
    if (naam === "ansicpg" && param !== null) {
      decoder = decoderVoor(param);
      return;
    }
    if (naam === "uc" && param !== null) {
      groep.uc = Math.max(0, param);
      return;
    }
    if (naam === "u" && param !== null) {
      spoelBytes();
      voorTekst();
      voegTekstToe(String.fromCharCode(param < 0 ? param + 65536 : param));
      overslaan = groep.uc;
      return;
    }
    const aan = param !== 0;
    switch (naam) {
      case "b": spoelBytes(); groep.teken.b = aan; return;
      case "i": spoelBytes(); groep.teken.i = aan; return;
      case "ul": spoelBytes(); groep.teken.ul = aan; return;
      case "ulnone": spoelBytes(); groep.teken.ul = false; return;
      case "super": spoelBytes(); groep.teken.sup = true; groep.teken.sub = false; return;
      case "sub": spoelBytes(); groep.teken.sub = true; groep.teken.sup = false; return;
      case "nosupersub": spoelBytes(); groep.teken.sup = false; groep.teken.sub = false; return;
      case "plain": spoelBytes(); groep.teken = { ...LEEG_TEKEN }; return;
    }
    if (groep.bestemming === "lijstteken") {
      if (naam === "tab") return;
      if (SYMBOLEN[naam] !== undefined) voegTekstToe(SYMBOLEN[naam]);
      return;
    }
    if (groep.bestemming !== "tekst") return;
    switch (naam) {
      // In een cel: een nieuwe regel in dezelfde cel (sluitAlinea zet hem bij de cel).
      case "par":
      case "sect":
      case "page":
        sluitAlinea();
        return;
      case "pard":
        // Een tabel eindigt pas bij tekst zonder \intbl ervoor; na \pard volgt dat vaak nog.
        spoelBytes();
        alinea.niveau = null;
        alinea.inspringing = 0;
        alinea.kop = 0;
        alinea.inTabel = false;
        alinea.lijstNr = 0;
        alineaStijl = 0;
        return;
      case "intbl": alinea.inTabel = true; return;
      case "cell": case "nestcell": sluitCel(); return;
      case "row": case "nestrow": sluitRij(); return;
      case "ilvl": alinea.niveau = param ?? 0; return;
      case "li": alinea.inspringing = param ?? 0; return;
      case "ls": alinea.lijstNr = Math.max(0, param ?? 0); return;
      case "outlinelevel": alinea.kop = (param ?? 0) + 1; return;
      case "s": alineaStijl = param ?? 0; return;
      case "line": spoelBytes(); voegTekstToe("\n"); return;
      case "tab": spoelBytes(); voegTekstToe(" "); return;
    }
    if (SYMBOLEN[naam] !== undefined) {
      spoelBytes();
      voegTekstToe(SYMBOLEN[naam]);
    }
  };

  // Tekst buiten een tabel sluit de tabel af.
  const voorTekst = () => {
    if (!alinea.inTabel && (tabelRijen.length > 0 || tabelRij.length > 0) && groep.bestemming === "tekst") sluitTabel();
  };

  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === "{") {
      spoelBytes();
      // Elke stijl in de stijlenlijst heeft een eigen groep, met zijn naam aan het eind.
      if (groep.bestemming === "stijl") stijlNaam = "";
      stapel.push(groep);
      groep = { ...groep, teken: { ...groep.teken }, ster: false, eigenaar: false };
      i++;
      continue;
    }
    if (c === "}") {
      spoelBytes();
      if (groep.eigenaar && groep.bestemming === "beeld") sluitBeeld();
      if (groep.eigenaar && groep.bestemming === "stijl") sluitStijl();
      groep = stapel.pop() ?? groep;
      i++;
      continue;
    }
    if (c === "\\") {
      const volgend = s[i + 1] ?? "";
      if (/[a-zA-Z]/.test(volgend)) {
        let j = i + 1;
        while (j < s.length && /[a-zA-Z]/.test(s[j]) && j - i <= 32) j++;
        const naam = s.slice(i + 1, j);
        let param: number | null = null;
        const m = /^-?\d{1,10}/.exec(s.slice(j, j + 11));
        if (m) {
          param = Number(m[0]);
          j += m[0].length;
        }
        if (s[j] === " ") j++;
        i = j;
        if (naam === "bin" && param !== null) {
          // Binaire gegevens: overslaan.
          i += Math.max(0, param);
          continue;
        }
        if (overslaan > 0 && naam !== "u") {
          // Een woord telt als één teken van de vervanging na \uN.
          overslaan--;
          continue;
        }
        woord(naam, param);
        continue;
      }
      if (volgend === "'") {
        const hex = s.slice(i + 2, i + 4);
        i += 4;
        if (overslaan > 0) {
          overslaan--;
          continue;
        }
        if (groep.bestemming === "beeld") continue;
        if (/^[0-9a-f]{2}$/i.test(hex)) {
          voorTekst();
          bytes.push(parseInt(hex, 16));
        }
        continue;
      }
      i += 2;
      if (volgend === "*") {
        groep.ster = true;
        continue;
      }
      if (overslaan > 0 && volgend !== "\\" && volgend !== "{" && volgend !== "}") {
        overslaan--;
        continue;
      }
      spoelBytes();
      if (volgend === "\\" || volgend === "{" || volgend === "}") {
        if (overslaan > 0) {
          overslaan--;
          continue;
        }
        voorTekst();
        voegTekstToe(volgend);
      } else if (volgend === "~") voegTekstToe(" ");
      else if (volgend === "_") voegTekstToe("-");
      else if (volgend === "\n" || volgend === "\r") woord("par", null);
      continue;
    }
    if (c === "\r" || c === "\n") {
      i++;
      continue;
    }
    if (groep.bestemming === "beeld") {
      // Hex-gegevens van de afbeelding, tot het volgende stuurteken.
      let j = i;
      while (j < s.length && s[j] !== "\\" && s[j] !== "{" && s[j] !== "}") j++;
      beeldHex.push(s.slice(i, j));
      i = j;
      continue;
    }
    if (overslaan > 0) {
      overslaan--;
      i++;
      continue;
    }
    if (groep.bestemming === "tekst" && c !== " ") voorTekst();
    const code = c.charCodeAt(0);
    if (code >= 0x80) bytes.push(code);
    else {
      spoelBytes();
      voegTekstToe(c);
    }
    i++;
  }
  spoelBytes();
  if (alinea.stukken.length > 0 || alinea.lijstteken) sluitAlinea();
  sluitTabel();

  return { tekst: blokkenNaarMd(blokken), beelden, meldingen: [...new Set(meldingen)] };
}

/** Een cel in een Markdown-tabel: geen regeleinden, en `|` als teken. */
function cel(md: string): string {
  return md.replace(/\n/g, " ").trim() || " ";
}

/**
 * De niveaus van een reeks lijstregels: de ondiepste wordt 0, en een regel gaat
 * ten hoogste één niveau dieper dan de vorige. Anders wordt een ingesprongen lijst
 * in Markdown een codeblok.
 */
function maakNiveausRecht(blokken: Blok[]): void {
  let i = 0;
  while (i < blokken.length) {
    if (blokken[i].soort !== "lijst") {
      i++;
      continue;
    }
    let j = i;
    const nr = (blokken[i] as Extract<Blok, { soort: "lijst" }>).lijstNr;
    while (j < blokken.length && blokken[j].soort === "lijst" && (blokken[j] as Extract<Blok, { soort: "lijst" }>).lijstNr === nr) j++;
    const reeks = blokken.slice(i, j) as Extract<Blok, { soort: "lijst" }>[];
    const min = Math.min(...reeks.map((b) => b.niveau));
    let vorige = -1;
    for (const b of reeks) {
      b.niveau = Math.min(b.niveau - min, vorige + 1);
      vorige = b.niveau;
    }
    i = j;
  }
}

function blokkenNaarMd(blokken: Blok[]): string {
  maakNiveausRecht(blokken);
  const regels: string[] = [];
  let vorige: Blok | undefined;
  for (const b of blokken) {
    // Regels van dezelfde lijst onder elkaar; een andere lijst begint na een witregel.
    const losVanVorige = !(vorige?.soort === "lijst" && b.soort === "lijst" && vorige.lijstNr === b.lijstNr);
    if (regels.length > 0) regels.push(losVanVorige ? "\n\n" : "\n");
    if (b.soort === "alinea") regels.push(b.md);
    else if (b.soort === "kop") regels.push(`${"#".repeat(b.niveau)} ${b.md}`);
    else if (b.soort === "lijst") {
      const teken = b.genummerd ? `${b.nummer}.` : "-";
      regels.push(`${"    ".repeat(b.niveau)}${teken} ${b.md}`);
    } else {
      const breedte = Math.max(...b.rijen.map((r) => r.length));
      const rij = (r: string[]) => `| ${Array.from({ length: breedte }, (_, k) => cel(r[k] ?? "")).join(" | ")} |`;
      const [kop, ...rest] = b.rijen;
      regels.push([rij(kop), `|${" --- |".repeat(breedte)}`, ...rest.map(rij)].join("\n"));
    }
    vorige = b;
  }
  // Afbeeldingen staan als merkteken in de tekst; hier worden ze Markdown.
  return `${regels.join("")}\n`.replace(/\u0000beeld:([^\u0000]+)\u0000/g, (_, naam: string) => `![](${naam})`).replace(/^\n+/, "");
}
