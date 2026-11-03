/**
 * De uitvoer van een rekenblad in de taal van de app.
 *
 * De rekentekst blijft de bron: de rekenversie, "Bijwerken", opgeslagen bestanden en
 * de sleutels van de invoer kennen alleen die tekst. Pas bij het doorrekenen voor de
 * weergave vervangt een vertaaltabel per module de teksten in de bron: prozaregels,
 * toelichtingen achter een formule, koppen, keuzelijsten en de tekenreeksen in een
 * expressie. Alleen wat precies overeenkomt: tekst die de gebruiker zelf schreef,
 * blijft staan zoals die is, en de code blijft onaangeroerd.
 *
 * Een tabel werkt op stukjes tekst, niet op hele regels. Een regel wordt eerst
 * gesplitst zoals de kern dat doet (rekendeel en tekst om en om, zie alleenInCode in
 * packages/core/src/parser.ts). In de tekst scheiden de html-tags de stukjes; alleen
 * `<sub>`, `<sup>` en `<code>` horen bij het stukje zelf. Leestekens en spaties aan de
 * randen tellen niet mee: "veld 1" is dezelfde vermelding in ", veld 1" en " (veld 1)".
 * Zo hoeft dezelfde vermelding één keer in de tabel, en doet een andere `kolom-…`
 * of `alleen-scherm` er niets aan af.
 *
 * Een symbool in lopende tekst (`b<sub>sparing</sub>`) volgt de weergavenamen; die
 * gelden ook voor de formules (zie `render` in de kern).
 *
 * Geen imports: scripts/check-uitvoer-taal.mjs laadt dit bestand rechtstreeks in Node.
 */

/** De vertaling van één module. */
export interface BladVertaling {
  /** Herkenningspunt in de bladtekst, zoals bij de parametrische beelden (designerKeuze.tsx). */
  marker: string;
  /** Tekst in de bron → tekst in de uitvoer. Zonder rechte apostrof: die scheidt tekst en expressie. */
  tekst: Readonly<Record<string, string>>;
  /** Naam in de code → naam in beeld, bijvoorbeeld `b_sparing` → `b_opening`; een komma mag. */
  namen: Readonly<Record<string, string>>;
}

/** Wat de doorloop aan een stukje tekst vraagt. */
type Bezoek = (tekst: string, verborgen: boolean) => string;

/** Tags die bij de tekst horen. Alle andere scheiden twee stukjes. */
const IN_TEKST = /^<\/?(?:sub|sup|code)\b/i;

/**
 * Loopt de tekst van een literal af, tot de volgende tag. `inTag` loopt door over
 * expressies en regels heen: een tag wordt in een tekening vaak onderbroken door een
 * invulling (`<text x="'p_x'" y="…">`).
 */
function loopTekst(stuk: string, stand: { inTag: boolean }, bezoek: (t: string) => string): string {
  let uit = "";
  let buf = "";
  const leeg = () => {
    if (buf) uit += bezoek(buf);
    buf = "";
  };
  let i = 0;
  while (i < stuk.length) {
    if (stand.inTag) {
      const eind = stuk.indexOf(">", i);
      if (eind === -1) {
        uit += stuk.slice(i);
        return uit;
      }
      uit += stuk.slice(i, eind + 1);
      i = eind + 1;
      stand.inTag = false;
      continue;
    }
    const ch = stuk[i];
    if (ch === "<" && /[a-zA-Z/!]/.test(stuk[i + 1] ?? "")) {
      const rest = stuk.slice(i);
      if (IN_TEKST.test(rest)) {
        const eind = stuk.indexOf(">", i);
        if (eind !== -1) {
          buf += stuk.slice(i, eind + 1);
          i = eind + 1;
          continue;
        }
      }
      leeg();
      stand.inTag = true;
      continue;
    }
    buf += ch;
    i++;
  }
  leeg();
  return uit;
}

/**
 * Leestekens en spaties aan de randen van een stukje, en wat daar tussen staat.
 * Een haakje blijft bij de tekst, tenzij het de hele tekst omsluit of geen tegenhanger
 * heeft.
 */
export function ontleed(stuk: string): [string, string, string] {
  const rand = /^(?:\s|&nbsp;|[,;:.·—–\-→=+/≤≥>]|<(?![a-zA-Z/]))+/;
  const randAchter = /(?:\s|&nbsp;|[,;:.·—–\-→=+/≤≥])+$/;
  let voor = "";
  let kern = stuk;
  let na = "";
  const telling = (t: string, c: string) => t.split(c).length - 1;
  for (let klaar = false; !klaar; ) {
    klaar = true;
    const a = kern.match(rand);
    if (a) {
      voor += a[0];
      kern = kern.slice(a[0].length);
      klaar = false;
    }
    const b = kern.match(randAchter);
    if (b) {
      na = b[0] + na;
      kern = kern.slice(0, kern.length - b[0].length);
      klaar = false;
    }
    if (kern.startsWith("(") && (telling(kern, "(") > telling(kern, ")") || /^\([^()]*\)$/.test(kern))) {
      voor += "(";
      kern = kern.slice(1);
      klaar = false;
    }
    if (kern.endsWith(")") && telling(kern, ")") > telling(kern, "(")) {
      na = ")" + na;
      kern = kern.slice(0, -1);
      klaar = false;
    }
  }
  return [voor, kern, na];
}

/** Symbolen in lopende tekst, volgens de weergavenamen: `b<sub>sparing</sub>` → `b<sub>opening</sub>`. */
function symbolen(tekst: string, namen: Readonly<Record<string, string>>): string {
  return tekst.replace(/(\p{L}+)<sub>([^<]+)<\/sub>/gu, (geheel, basis: string, sub: string) => {
    const naam = namen[`${basis}_${sub}`.replace(/,/g, "_")];
    if (!naam) return geheel;
    const i = naam.indexOf("_");
    return i > 0 ? `${naam.slice(0, i)}<sub>${naam.slice(i + 1).replace(/_/g, ",")}</sub>` : naam;
  });
}

/** Vertaalt één stukje tekst; zonder treffer blijft het staan, op de symbolen na. */
function vertaalStuk(stuk: string, v: BladVertaling): string {
  const [voor, kern, na] = ontleed(stuk);
  if (kern === "") return stuk;
  return voor + (v.tekst[kern] ?? symbolen(kern, v.namen)) + na;
}

/** De tekenreeksen in een rekendeel: `if(a; "op veld 2"; "op het overstek")`. */
function inCode(code: string, bezoek: Bezoek, verborgen: boolean): string {
  return code.replace(/"([^"]*)"/g, (_m, tekst: string) => `"${bezoek(tekst, verborgen)}"`);
}

/** Splitst een regel in rekendeel en tekst, om en om, zoals de kern. */
function regelDelen(regel: string): { code: boolean; stuk: string }[] {
  const uit: { code: boolean; stuk: string }[] = [];
  let stuk = "";
  let code = true;
  let inString = false;
  for (const ch of regel) {
    if (code) {
      if (ch === '"') inString = !inString;
      if (ch === "'" && !inString) {
        uit.push({ code, stuk });
        stuk = "";
        code = false;
        continue;
      }
    } else if (ch === "'") {
      uit.push({ code, stuk });
      stuk = "";
      code = true;
      inString = false;
      continue;
    }
    stuk += ch;
  }
  uit.push({ code, stuk });
  return uit;
}

/**
 * Loopt de tekst van een blad af en geeft elk stukje tekst aan `bezoek`, met de vraag
 * of het op een verborgen regel staat. Geeft de bron terug met wat `bezoek` teruggaf.
 */
export function doorloop(bron: string, bezoek: Bezoek, opIfcx?: (regel: string) => string): string {
  const stand = { inTag: false };
  let blok: "" | "select" | "svg" | "overslaan" = "";
  let verborgen = false;
  return bron
    .split("\n")
    .map((regel) => {
      const t = regel.trim();
      const inspring = regel.slice(0, regel.length - regel.trimStart().length);
      if (blok === "select") {
        if (/^@end\b/.test(t)) {
          blok = "";
          return regel;
        }
        const m = regel.match(/^(\s*)(.*?)(\s*=\s*[^=]*)$/);
        return m ? m[1] + bezoek(m[2], verborgen) + m[3] : regel;
      }
      if (blok === "svg") {
        if (/^@end\b/.test(t)) {
          blok = "";
          return regel;
        }
        return loopTekst(regel, stand, (s) => bezoek(s, verborgen));
      }
      if (blok === "overslaan") {
        if (/^@end\b/.test(t)) blok = "";
        return regel;
      }
      if (t === "") return regel;
      if (/^@select\b/.test(t)) {
        blok = "select";
        return regel.replace(/"([^"]*)"\s*$/, (_m, label: string) => `"${bezoek(label, verborgen)}"`);
      }
      if (/^@svg\s*$/.test(t)) {
        blok = "svg";
        return regel;
      }
      if (/^@3d\s*$/.test(t) || /^@js\b/.test(t)) {
        blok = "overslaan";
        return regel.replace(/\btitel="([^"]*)"/, (_m, titel: string) => `titel="${bezoek(titel, verborgen)}"`);
      }
      if (/^@iframe\b/.test(t)) return regel.replace(/\btitel="([^"]*)"/, (_m, titel: string) => `titel="${bezoek(titel, verborgen)}"`);
      if (/^@ifcx\b/.test(t)) return opIfcx ? opIfcx(regel) : regel;
      if (/^@/.test(t)) return regel;
      if (t.startsWith('"')) return `${inspring}"${bezoek(t.slice(1), verborgen)}`;
      if (/^#{1,6}\s/.test(t)) {
        const m = t.match(/^(#{1,6}\s+)(.*)$/) as RegExpMatchArray;
        return inspring + m[1] + bezoek(m[2], verborgen);
      }
      if (t.startsWith("#")) {
        if (/^#hide\b/i.test(t)) verborgen = true;
        if (/^#(show|pre|post)\b/i.test(t)) verborgen = false;
        return regel;
      }
      return regelDelen(regel)
        .map((d, i, delen) => {
          const sep = i < delen.length - 1 ? "'" : "";
          if (d.code) return inCode(d.stuk, bezoek, verborgen) + sep;
          // Toelichting op een verborgen regel staat nergens in beeld.
          if (verborgen) return d.stuk + sep;
          return loopTekst(d.stuk, stand, (s) => bezoek(s, verborgen)) + sep;
        })
        .join("");
    })
    .join("\n");
}

/** De bladtekst in de taal `taal`. Alleen wat in de tabel staat, verandert. */
export function vertaalBron(bron: string, v: BladVertaling, taal: string): string {
  return doorloop(
    bron,
    (s) => vertaalStuk(s, v),
    (regel) => (/\btaal=/.test(regel) ? regel : regel.replace(/^(\s*@ifcx\s+\S+)/, `$1 taal=${taal}`)),
  );
}

/** De weergavenamen met de komma's gevouwen, zoals de kern de namen na het inlezen kent. */
export function gevouwenNamen(namen: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(namen).map(([k, w]) => [k.replace(/,/g, "_"), w.replace(/,/g, "_")]));
}

/** Wat er te doorrekenen is voor de weergave. */
export interface UitvoerBron {
  bron: string;
  namen?: Record<string, string>;
}

/**
 * De tekst om door te rekenen voor de uitvoer in de taal `taal`, met de weergavenamen.
 * Nederlands is de taal van de bron: dan verandert er niets. Eén laatste uitkomst
 * blijft bewaard: tijdens het typen blijven de bron en de taal gelijk.
 */
let laatste: { bron: string; v: BladVertaling; taal: string; uit: UitvoerBron } | null = null;
export function uitvoerBron(bron: string, v: BladVertaling | null, taal: string): UitvoerBron {
  if (!v) return { bron };
  if (laatste && laatste.bron === bron && laatste.v === v && laatste.taal === taal) return laatste.uit;
  const uit = { bron: vertaalBron(bron, v, taal), namen: gevouwenNamen(v.namen) };
  laatste = { bron, v, taal, uit };
  return uit;
}

/**
 * Alles wat er zichtbaar te vertalen is in een bladtekst: elk stukje met letters, los
 * van leestekens aan de randen. Voor de controle (check-uitvoer-taal.mjs).
 */
export function zichtbareTeksten(bron: string): string[] {
  const uit = new Set<string>();
  doorloop(bron, (s) => {
    const [, kern] = ontleed(s);
    if (/\p{L}/u.test(kern.replace(/<[^>]+>/g, ""))) uit.add(kern);
    return s;
  });
  return [...uit];
}
