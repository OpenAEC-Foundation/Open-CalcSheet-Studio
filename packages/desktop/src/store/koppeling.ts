/**
 * Een gekoppeld bestand: een blad dat zijn inhoud uit een bestand buiten het
 * project haalt en vanzelf bijwerkt als dat bestand verandert. Eén mechanisme
 * voor een RTF-bestand (store/rtfLezer.ts) en een bereik uit een werkmap
 * (store/werkmapBereik.ts). Beide worden een Markdown-blad (store/markdownBlad.ts)
 * met een `koppeling`: de afdruk, het rapport en de inhoudsopgave werken dan
 * zoals bij elke andere Markdown-tekst.
 *
 * Het blad bewaart:
 *   • het pad van de bron, absoluut, en relatief tot het projectbestand: een
 *     verplaatste projectmap met de bron erin blijft zo werken;
 *   • een kopie van de laatst gelezen inhoud (de tekst van het blad zelf): het
 *     project opent en drukt af, ook zonder de bron;
 *   • het moment en de hash van de laatste lezing.
 *
 * Opnieuw lezen gebeurt in de app (components/calc/koppelingen.ts): bij openen,
 * bij focus van het venster, vóór afdrukken en elke paar seconden op de
 * wijzigingstijd. Ontbreekt de bron, dan blijft de kopie staan en zegt het blad,
 * ook op papier, dat de bron niet gevonden is en wanneer hij laatst gelezen is.
 *
 * Puur en zonder imports van waarde: de controlescripts laden dit bestand in Node.
 */

import type { MarkdownBestand } from "./markdownBlad.ts";

/** Waar de inhoud vandaan komt. */
export type KoppelingSoort = "rtf" | "werkmapbereik";

export interface BronKoppeling {
  soort: KoppelingSoort;
  /** Het absolute pad van de bron; in de browser alleen de bestandsnaam. */
  pad: string;
  /** Het pad vanaf de map van het projectbestand, met `/`; leeg als er nog geen projectbestand was. */
  relatief?: string;
  /** Bij een werkmapbereik: een bereiknaam of `Blad!B4:F20`. */
  verwijzing?: string;
  /** Wanneer de inhoud laatst uit de bron is gelezen (ISO 8601). */
  gelezenOp: string;
  /** Hash van de bytes van de bron bij die lezing. */
  hash: string;
}

const SOORTEN: readonly KoppelingSoort[] = ["rtf", "werkmapbereik"];

/** De koppeling uit een bestand of de opgeslagen staat. Iets onbruikbaars: undefined. */
export function leesKoppeling(x: unknown): BronKoppeling | undefined {
  if (!x || typeof x !== "object" || Array.isArray(x)) return undefined;
  const k = x as Partial<Record<keyof BronKoppeling, unknown>>;
  if (!SOORTEN.includes(k.soort as KoppelingSoort) || typeof k.pad !== "string" || k.pad === "") return undefined;
  const uit: BronKoppeling = {
    soort: k.soort as KoppelingSoort,
    pad: k.pad,
    gelezenOp: typeof k.gelezenOp === "string" ? k.gelezenOp : "",
    hash: typeof k.hash === "string" ? k.hash : "",
  };
  if (typeof k.relatief === "string" && k.relatief !== "") uit.relatief = k.relatief;
  if (typeof k.verwijzing === "string" && k.verwijzing !== "") uit.verwijzing = k.verwijzing;
  if (uit.soort === "werkmapbereik" && !uit.verwijzing) return undefined;
  return uit;
}

/** Is dit Markdown-blad gekoppeld aan een bestand? */
export function isGekoppeld(md: MarkdownBestand | undefined): md is MarkdownBestand & { koppeling: BronKoppeling } {
  return !!md?.koppeling;
}

/** FNV-1a over de bytes, als hex. Snel en genoeg om een gewijzigd bestand te herkennen. */
export function inhoudHash(bytes: Uint8Array): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16).padStart(8, "0")}-${bytes.length.toString(16)}`;
}

// ── Paden ─────────────────────────────────────────────────────────────────────

/** Een Windows-pad: met stationsletter of als netwerkpad. Daar telt hoofdletter niet. */
function isWindowsPad(pad: string): boolean {
  return /^[a-z]:[\\/]/i.test(pad) || pad.startsWith("\\\\");
}

function delen(pad: string): string[] {
  return pad.split(/[\\/]+/).filter((d, i) => d !== "" || i === 0);
}

/** De map van een pad, zonder scheidingsteken aan het eind; de wortel houdt het zijne ("C:\", "/"). */
export function mapVan(pad: string): string {
  const i = Math.max(pad.lastIndexOf("/"), pad.lastIndexOf("\\"));
  if (i < 0) return "";
  if (i === 0) return pad.slice(0, 1);
  const map = pad.slice(0, i);
  return /^[a-z]:$/i.test(map) ? `${map}${pad[i]}` : map;
}

/** De bestandsnaam van een pad. */
export function naamVan(pad: string): string {
  return pad.split(/[\\/]/).pop() ?? pad;
}

/**
 * Het pad van `naar` gezien vanuit de map `van`, met `/`. Beide absoluut. Op een
 * ander station of een andere netwerkschijf: undefined, dan geldt alleen het
 * absolute pad.
 */
export function relatiefPad(van: string, naar: string): string | undefined {
  const win = isWindowsPad(van) || isWindowsPad(naar);
  const a = delen(van);
  const b = delen(naar);
  const gelijk = (x: string, y: string) => (win ? x.toLowerCase() === y.toLowerCase() : x === y);
  if (a.length === 0 || b.length === 0 || !gelijk(a[0], b[0])) return undefined;
  let i = 0;
  while (i < a.length && i < b.length - 1 && gelijk(a[i], b[i])) i++;
  return [...Array(a.length - i).fill(".."), ...b.slice(i)].join("/");
}

/** Zet een relatief pad (met `/`) vast aan een map, met het scheidingsteken van die map. */
export function losOp(map: string, relatief: string): string {
  const sep = map.includes("\\") || isWindowsPad(map) ? "\\" : "/";
  const stukken = delen(map);
  for (const d of relatief.split(/[\\/]+/)) {
    if (d === "" || d === ".") continue;
    if (d === "..") {
      if (stukken.length > 1) stukken.pop();
    } else stukken.push(d);
  }
  const pad = stukken.join(sep);
  // Een POSIX-pad begint met de lege wortel; een netwerkpad met twee scheidingstekens.
  if (map.startsWith("\\\\")) return `\\\\${stukken.filter((d) => d !== "").join(sep)}`;
  return pad === "" ? sep : pad;
}

/**
 * Waar de bron kan staan, in volgorde: eerst naast het project (de relatieve
 * plek), dan het absolute pad. Zo leest een gekopieerde projectmap zijn eigen
 * bron en niet die van het origineel.
 */
export function kandidaatPaden(k: BronKoppeling, projectPad: string | null | undefined): string[] {
  const paden: string[] = [];
  if (projectPad && k.relatief && /[\\/]/.test(projectPad)) paden.push(losOp(mapVan(projectPad), k.relatief));
  if (!paden.some((p) => p.toLowerCase() === k.pad.toLowerCase())) paden.push(k.pad);
  return paden;
}

/** De koppeling met het gevonden pad en een relatief pad bij het huidige projectbestand. */
export function metPlek(k: BronKoppeling, pad: string, projectPad: string | null | undefined): BronKoppeling {
  const uit: BronKoppeling = { ...k, pad };
  const relatief = projectPad && /[\\/]/.test(projectPad) ? relatiefPad(mapVan(projectPad), pad) : undefined;
  if (relatief) uit.relatief = relatief;
  else if (projectPad && /[\\/]/.test(projectPad)) delete uit.relatief;
  return uit;
}

// ── Controleren ───────────────────────────────────────────────────────────────

/** Wat de app van het bestandssysteem nodig heeft. In Node en in de app een andere uitvoering. */
export interface BronToegang {
  /** Wijzigingstijd in ms, of null als het bestand er niet is. */
  wijzigingstijd(pad: string): Promise<number | null>;
  lees(pad: string): Promise<Uint8Array>;
}

/** De omzetting van de bytes naar de tekst van het blad, per soort. */
export type Omzetter = (bytes: Uint8Array, k: BronKoppeling) => Promise<
  | { ok: true; tekst: string; beelden?: Record<string, string>; meldingen?: string[] }
  | { ok: false; reden: string; detail?: string }
>;

/** Wat de vorige controle van dit blad zag; houdt in het geheugen, niet in het project. */
export interface VorigeControle {
  pad: string;
  tijd: number;
}

export type Controle =
  /** Niets veranderd. `koppeling` alleen als het pad of het relatieve pad anders is. */
  | { staat: "ongewijzigd"; gezien: VorigeControle; koppeling?: BronKoppeling }
  | { staat: "bijgewerkt"; gezien: VorigeControle; md: MarkdownBestand; meldingen?: string[] }
  | { staat: "ontbreekt"; gezocht: string[] }
  | { staat: "fout"; gezien: VorigeControle; reden: string; detail?: string };

/**
 * Kijkt of de bron van een gekoppeld blad veranderd is en leest hem dan opnieuw.
 * Eerst alleen de wijzigingstijd; de bytes pas als die anders is dan bij de vorige
 * controle. Gelijke bytes (alleen opnieuw opgeslagen) veranderen het blad niet.
 * Een fout in de omzetting (bereik weg, geen RTF) laat de kopie staan.
 */
export async function controleerKoppeling(
  md: MarkdownBestand & { koppeling: BronKoppeling },
  opties: { projectPad?: string | null; toegang: BronToegang; omzetten: Omzetter; vorige?: VorigeControle; nu?: () => Date },
): Promise<Controle> {
  const k = md.koppeling;
  const gezocht = kandidaatPaden(k, opties.projectPad);
  let pad: string | undefined;
  let tijd: number | null = null;
  for (const p of gezocht) {
    try {
      tijd = await opties.toegang.wijzigingstijd(p);
    } catch {
      tijd = null;
    }
    if (tijd !== null) {
      pad = p;
      break;
    }
  }
  if (pad === undefined || tijd === null) return { staat: "ontbreekt", gezocht };
  const gezien: VorigeControle = { pad, tijd };
  const plek = metPlek(k, pad, opties.projectPad);
  const plekAnders = plek.pad !== k.pad || plek.relatief !== k.relatief;
  if (opties.vorige && opties.vorige.pad === pad && opties.vorige.tijd === tijd && k.hash) {
    return plekAnders ? { staat: "ongewijzigd", gezien, koppeling: plek } : { staat: "ongewijzigd", gezien };
  }
  let bytes: Uint8Array;
  try {
    bytes = await opties.toegang.lees(pad);
  } catch {
    return { staat: "ontbreekt", gezocht };
  }
  const hash = inhoudHash(bytes);
  if (hash === k.hash) {
    return plekAnders ? { staat: "ongewijzigd", gezien, koppeling: plek } : { staat: "ongewijzigd", gezien };
  }
  const omgezet = await opties.omzetten(bytes, plek);
  if (!omgezet.ok) return { staat: "fout", gezien, reden: omgezet.reden, detail: omgezet.detail };
  const nu = (opties.nu ?? (() => new Date()))();
  const nieuw: MarkdownBestand = {
    ...md,
    tekst: omgezet.tekst,
    koppeling: { ...plek, hash, gelezenOp: nu.toISOString() },
  };
  if (omgezet.beelden && Object.keys(omgezet.beelden).length > 0) nieuw.beelden = omgezet.beelden;
  else delete nieuw.beelden;
  return { staat: "bijgewerkt", gezien, md: nieuw, ...(omgezet.meldingen?.length ? { meldingen: omgezet.meldingen } : {}) };
}

// ── Melden ────────────────────────────────────────────────────────────────────

/** De stand van de bron zoals de app hem kent (store/koppelingStatus.ts). */
export type BronStaat =
  /** De kopie is de inhoud van de bron. */
  | "actueel"
  /** De bron wordt gelezen; de afdruk wacht. */
  | "lezen"
  /** De bron staat niet waar hij stond. */
  | "ontbreekt"
  /** De bron is er, maar is niet om te zetten (bereik weg, geen RTF). */
  | "fout"
  /** Geen bestandstoegang (de browser): alleen de bewaarde kopie. */
  | "geenToegang";

/**
 * De melding boven een gekoppeld blad, op het scherm en op papier: een sleutel in
 * rapport.json met zijn waarden, of null als de kopie de inhoud van de bron is.
 * Zonder bekende stand geldt in de browser "geen toegang" en in de app "lezen": de
 * kopie gaat nooit stil door voor actueel voordat de bron is bekeken.
 * `laadt`: de afdruk wacht tot de melding weg is.
 */
export function meldingVoor(
  k: BronKoppeling,
  stand: { staat: BronStaat; reden?: string } | undefined,
  opties: { bestandstoegang: boolean; datum: string },
): { sleutel: string; waarden: Record<string, string>; laadt?: true } | null {
  const staat = stand?.staat ?? (opties.bestandstoegang ? "lezen" : "geenToegang");
  const bestand = naamVan(k.pad);
  switch (staat) {
    case "actueel":
      return null;
    case "lezen":
      return { sleutel: "koppeling.lezen", waarden: {}, laadt: true };
    case "ontbreekt":
      return { sleutel: "koppeling.ontbreekt", waarden: { bestand, datum: opties.datum } };
    case "fout":
      return { sleutel: "koppeling.fout", waarden: { bestand, datum: opties.datum, reden: `koppeling.reden.${stand?.reden ?? "leesFout"}` } };
    default:
      return { sleutel: "koppeling.geenToegang", waarden: { bestand, datum: opties.datum } };
  }
}

// ── Wachten ───────────────────────────────────────────────────────────────────

/**
 * Roept `controleer` aan, nooit twee keer tegelijk. Een verzoek terwijl er een
 * loopt, komt er één keer achteraan: zo mist een wijziging tijdens het lezen
 * niets, en stapelen tikken van de klok zich niet op.
 */
export class Wachter {
  private bezig: Promise<void> | null = null;
  private nogEens = false;
  private klok: ReturnType<typeof setInterval> | null = null;

  private readonly controleer: () => Promise<void>;

  constructor(controleer: () => Promise<void>) {
    this.controleer = controleer;
  }

  /** Controleer nu; de belofte is klaar als ook een verzoek dat intussen kwam, klaar is. */
  nu(): Promise<void> {
    if (this.bezig) {
      this.nogEens = true;
      return this.bezig;
    }
    const loop = async () => {
      do {
        this.nogEens = false;
        try {
          await this.controleer();
        } catch (err) {
          console.error("Gekoppelde bestanden controleren mislukt:", err);
        }
      } while (this.nogEens);
    };
    this.bezig = loop().finally(() => {
      this.bezig = null;
    });
    return this.bezig;
  }

  /** Elke `ms` milliseconden; een tweede start vervangt de eerste. */
  start(ms: number): void {
    this.stop();
    this.klok = setInterval(() => void this.nu(), ms);
  }

  stop(): void {
    if (this.klok !== null) clearInterval(this.klok);
    this.klok = null;
  }
}
