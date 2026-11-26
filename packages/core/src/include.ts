/**
 * `#include bestand.cpd`: een ander rekentaalbestand invoegen.
 *
 * Een `#include` zoekt zijn bestand in `ParseOptions.includes`, een tabel van
 * sleutel naar tekst. De app vult die met de ingebouwde bestanden
 * (templates/rekentaal-includes.ts) en met de bestanden op schijf die een blad
 * gebruikt, zoals ze laatst gelezen zijn (store/includes.ts). De kern leest zelf
 * niets van schijf.
 *
 * De sleutel van een bestand:
 *   • een absoluut pad (`C:\lib\a.cpd`, `/home/x/a.cpd`) blijft zoals het er staat;
 *   • een relatief pad geldt vanaf de map van het projectbestand, en in een
 *     ingevoegd bestand vanaf de map van dat bestand. `lib/a.cpd` met daarin
 *     `#include b.cpd` zoekt `lib/b.cpd`. De sleutel heeft `/` en geen `.` of `..`.
 * Wordt een geneste sleutel niet gevonden, dan geldt de naam zoals hij er staat:
 * zo vindt een ingevoegd bestand ook de ingebouwde bestanden.
 *
 * Een ontbrekend bestand, een kring (a voegt b in, b voegt a in) of een bestand dat
 * de app niet kon lezen, wordt geen stille fout: op die plek komt een melding in
 * het blad, op het scherm en op papier (`TextNode.includeMelding`).
 */

/** Waarom een bestand er niet (vers) is; de app weet het, de kern zegt het. */
export type IncludeSoort =
  /** Niet gevonden, ook geen bewaarde kopie. */
  | 'ontbreekt'
  /** Kring van includes: het bestand voegt (via via) zichzelf in. */
  | 'kring'
  /** In de browser: geen toegang tot bestanden op schijf. */
  | 'geenToegang'
  /** Een relatief pad in een project dat nog niet is opgeslagen. */
  | 'nietOpgeslagen'
  /** De app leest het bestand nog. */
  | 'lezen'
  /** Niet gevonden of niet te lezen; de bewaarde kopie is gebruikt. */
  | 'kopie';

/** De stand van een bestand zoals de app hem kent, per sleutel. */
export interface IncludeStaat {
  soort: IncludeSoort;
  /** Wanneer de bewaarde kopie gelezen is (ISO 8601), bij `kopie`. */
  gelezenOp?: string;
  /** Waar de app zocht, bij `ontbreekt` en `kopie`. */
  gezocht?: string;
  /** Bij `kopie`: waarom de kopie geldt (`ontbreekt`, `geenToegang`, `nietOpgeslagen`). */
  reden?: Exclude<IncludeSoort, 'kopie' | 'kring' | 'lezen'>;
}

/** Een melding in het blad bij een `#include`. */
export interface IncludeMelding extends IncludeStaat {
  /** Het pad zoals het in de `#include` staat. */
  pad: string;
  /** Bij een kring: de keten van sleutels, van het eerste bestand tot het herhaalde. */
  keten?: string[];
}

/** Een absoluut pad: met stationsletter, als netwerkpad of vanaf de wortel. */
export function isAbsoluutPad(pad: string): boolean {
  return /^[a-z]:[\\/]/i.test(pad) || pad.startsWith('\\\\') || pad.startsWith('/');
}

/** `a/./b/../c.cpd` → `a/c.cpd`; een `..` vooraan blijft staan. */
function normaliseer(pad: string): string {
  const uit: string[] = [];
  for (const d of pad.split(/[\\/]+/)) {
    if (d === '' || d === '.') continue;
    if (d === '..' && uit.length > 0 && uit[uit.length - 1] !== '..') uit.pop();
    else uit.push(d);
  }
  return uit.join('/');
}

/** Het pad uit een `#include`-regel, zonder aanhalingstekens. */
export function includeNaam(ruw: string): string {
  return ruw.trim().replace(/^["']|["']$/g, '');
}

/**
 * De sleutel van een `#include naam` in het bestand met sleutel `vanaf` (zonder:
 * in het blad zelf). Zie het commentaar bovenaan.
 */
export function includeSleutel(naam: string, vanaf?: string): string {
  const n = includeNaam(naam);
  if (isAbsoluutPad(n)) return n;
  if (!vanaf) return normaliseer(n);
  const i = Math.max(vanaf.lastIndexOf('/'), vanaf.lastIndexOf('\\'));
  if (i < 0) return normaliseer(n);
  const map = vanaf.slice(0, i);
  if (isAbsoluutPad(vanaf)) {
    const sep = vanaf.includes('\\') ? '\\' : '/';
    return `${map}${sep}${n.replace(/[\\/]+/g, sep)}`;
  }
  return normaliseer(`${map}/${n}`);
}

export const INCLUDE_RE = /^[ \t]*#include\s+(\S+)\s*$/gmu;

/** De namen in de `#include`-regels van een tekst, in volgorde. */
export function includeNamen(bron: string): string[] {
  return [...bron.matchAll(new RegExp(INCLUDE_RE.source, INCLUDE_RE.flags))].map((m) => includeNaam(m[1]));
}

/**
 * Voegt de `#include`-regels in, ook genest. Waar een melding hoort, komt een regel
 * `#include-melding n` met n de plaats in `meldingen`; parse() maakt daar een
 * tekstknoop van.
 */
export function voegIncludesIn(
  bron: string,
  includes: ReadonlyMap<string, string>,
  staat: ReadonlyMap<string, IncludeStaat> | undefined,
  meldingen: IncludeMelding[],
  stapel: string[] = [],
): string {
  const vanaf = stapel[stapel.length - 1];
  return bron.replace(new RegExp(INCLUDE_RE.source, INCLUDE_RE.flags), (_regel, ruw: string) => {
    const pad = includeNaam(ruw);
    const sleutel = includeSleutel(pad, vanaf);
    // Genest en niet gevonden: de naam zoals hij er staat (een ingebouwd bestand).
    const kandidaten = sleutel !== pad && vanaf ? [sleutel, pad] : [sleutel];
    const gevonden = kandidaten.find((k) => includes.has(k));
    const melding = (m: Omit<IncludeMelding, 'pad'>) => {
      meldingen.push({ pad, ...m });
      return `#include-melding ${meldingen.length - 1}`;
    };
    if (gevonden === undefined) {
      const s = staat?.get(sleutel);
      return melding(s && s.soort !== 'kopie' ? s : { soort: 'ontbreekt', ...(s?.gezocht ? { gezocht: s.gezocht } : {}) });
    }
    if (stapel.includes(gevonden)) {
      return melding({ soort: 'kring', keten: [...stapel.slice(stapel.indexOf(gevonden)), gevonden] });
    }
    const inhoud = voegIncludesIn(includes.get(gevonden)!, includes, staat, meldingen, [...stapel, gevonden]);
    const s = staat?.get(gevonden);
    // Een bewaarde kopie of een bestand dat nog gelezen wordt: eerst de melding, dan de inhoud.
    return s && (s.soort === 'kopie' || s.soort === 'lezen') ? `${melding(s)}\n${inhoud}` : inhoud;
  });
}

type Woorden = (m: IncludeMelding, datum: string) => string;

/** De vaste woorden van een melding, per taal; een andere taal krijgt Engels. */
const WOORDEN: Record<'nl' | 'en' | 'lt', Record<IncludeSoort, Woorden>> = {
  nl: {
    ontbreekt: (m) => `#include ${m.pad}: bestand niet gevonden${m.gezocht ? ` (gezocht: ${m.gezocht})` : ''}. Wat erin staat, ontbreekt in dit blad.`,
    kring: (m) => `#include ${m.pad}: kring van includes (${(m.keten ?? []).join(' → ')}); niet nog een keer ingevoegd.`,
    geenToegang: (m) => `#include ${m.pad}: een bestand op schijf leest alleen de desktop-app. Wat erin staat, ontbreekt in dit blad.`,
    nietOpgeslagen: (m) => `#include ${m.pad}: sla het project eerst op; een relatief pad geldt vanaf de map van het projectbestand.`,
    lezen: (m) => `#include ${m.pad}: het bestand wordt gelezen.`,
    kopie: (m, d) => m.reden === 'geenToegang'
      ? `#include ${m.pad}: een bestand op schijf leest alleen de desktop-app; de kopie van ${d} in het project is gebruikt.`
      : m.reden === 'nietOpgeslagen'
        ? `#include ${m.pad}: het project is nog niet opgeslagen; de kopie van ${d} is gebruikt.`
        : `#include ${m.pad}: bestand niet gevonden${m.gezocht ? ` (gezocht: ${m.gezocht})` : ''}; de kopie van ${d} in het project is gebruikt.`,
  },
  en: {
    ontbreekt: (m) => `#include ${m.pad}: file not found${m.gezocht ? ` (looked for: ${m.gezocht})` : ''}. What it contains is missing from this sheet.`,
    kring: (m) => `#include ${m.pad}: include cycle (${(m.keten ?? []).join(' → ')}); not included again.`,
    geenToegang: (m) => `#include ${m.pad}: only the desktop app reads files on disk. What it contains is missing from this sheet.`,
    nietOpgeslagen: (m) => `#include ${m.pad}: save the project first; a relative path starts from the folder of the project file.`,
    lezen: (m) => `#include ${m.pad}: reading the file.`,
    kopie: (m, d) => m.reden === 'geenToegang'
      ? `#include ${m.pad}: only the desktop app reads files on disk; the copy from ${d} in the project was used.`
      : m.reden === 'nietOpgeslagen'
        ? `#include ${m.pad}: the project has not been saved yet; the copy from ${d} was used.`
        : `#include ${m.pad}: file not found${m.gezocht ? ` (looked for: ${m.gezocht})` : ''}; the copy from ${d} in the project was used.`,
  },
  lt: {
    ontbreekt: (m) => `#include ${m.pad}: failas nerastas${m.gezocht ? ` (ieškota: ${m.gezocht})` : ''}. Jo turinio šiame lape nėra.`,
    kring: (m) => `#include ${m.pad}: įtraukimų ciklas (${(m.keten ?? []).join(' → ')}); dar kartą neįtraukta.`,
    geenToegang: (m) => `#include ${m.pad}: failus diske skaito tik darbalaukio programa. Jo turinio šiame lape nėra.`,
    nietOpgeslagen: (m) => `#include ${m.pad}: pirmiausia išsaugokite projektą; santykinis kelias skaičiuojamas nuo projekto failo aplanko.`,
    lezen: (m) => `#include ${m.pad}: failas skaitomas.`,
    kopie: (m, d) => m.reden === 'geenToegang'
      ? `#include ${m.pad}: failus diske skaito tik darbalaukio programa; panaudota projekte išsaugota ${d} kopija.`
      : m.reden === 'nietOpgeslagen'
        ? `#include ${m.pad}: projektas dar neišsaugotas; panaudota ${d} kopija.`
        : `#include ${m.pad}: failas nerastas${m.gezocht ? ` (ieškota: ${m.gezocht})` : ''}; panaudota projekte išsaugota ${d} kopija.`,
  },
};

/** De tekst van een melding in de taal van de uitvoer (`nl`, `en`, `lt`; anders Engels). */
export function includeMeldingTekst(m: IncludeMelding, taal: string): string {
  const t = taal.toLowerCase().slice(0, 2);
  const woorden = WOORDEN[t === 'nl' || t === 'lt' ? t : 'en'];
  return woorden[m.soort](m, leesmoment(m.gelezenOp));
}

/** Het moment van de laatste lezing in plaatselijke tijd, als `2026-11-20 10:30`. */
export function leesmoment(iso: string | undefined): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '?';
  const twee = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${twee(d.getMonth() + 1)}-${twee(d.getDate())} ${twee(d.getHours())}:${twee(d.getMinutes())}`;
}
