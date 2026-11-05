/**
 * Versies in het projectbestand: een wijziging op een berekening is een tak, zonder echte git.
 *
 * Een versie is een kopie van de hele projectstand: de bladen, de projectgegevens en het rapport.
 * De werkstand in de store is altijd de actieve versie; die staat dus niet ook in de lijst. De
 * andere versies dragen hun eigen `inhoud`. Omdat elke wijziging in de store een nieuw object maakt
 * en de rest ongemoeid laat, delen versies alles wat niet verschilt: een nieuwe versie kost in het
 * geheugen vrijwel niets.
 *
 * Elke versie is een regel in de revisietabel van haar eigen rapport, en haar code, datum en
 * omschrijving staan in die regel (`Revisie.versieId`): er is één bron, en wat je daar wijzigt is
 * gewoon een stap in ongedaan maken. Het rapport van een versie noemt de lijn waaruit ze is
 * ontstaan; een andere tak zit niet in dit rapport en staat dus niet op dit voorblad. Een project
 * met één versie heeft geen koppelingen: daar is de laatste regel de versie, en blijft de tabel
 * helemaal vrij.
 *
 * Ongedaan maken loopt per versie (`stapels`): een wissel is geen stap, en Ctrl+Z raakt nooit een
 * andere versie dan die in beeld staat.
 *
 * Elke bewerking geeft de delen van de stand terug die veranderen, of bij niets te doen de stand
 * zelf. Zonder React en zonder stores: scripts/check-versies.mjs laadt dit bestand in Node.
 */
import type { Exemplaar } from "./projectStore";
import type { ProjectGegevens } from "./projectGegevens.ts";
import type { Rapport, Revisie } from "../rapport/model.ts";
import { heeftSleutel } from "../rapport/opzet.ts";
import { volgendeCode } from "../rapport/revisies.ts";
import { hashVan } from "./inhoudshash.ts";
import { tekenVelVoorBestand } from "./tekenBlad.ts";

/** De hele projectstand van een versie. De projectnaam en de weergave horen bij het bestand. */
export interface VersieInhoud {
  exemplaren: Exemplaar[];
  gegevens: ProjectGegevens;
  rapport: Rapport;
}

export interface Versie {
  id: string;
  /** Een eigen naam; leeg: de app noemt hem naar zijn code. */
  naam: string;
  /** De versie waaruit deze is ontstaan; het origineel heeft er geen. */
  ouder?: string;
  /** Ontbreekt bij de actieve versie: de werkstand is de enige bron. */
  inhoud?: VersieInhoud;
}

export interface VersieLijst {
  actief: string;
  lijst: Versie[];
}

/** Wat een versie in zijn eigen regel van de revisietabel heeft. */
export type VersieGegevens = Pick<Revisie, "code" | "datum" | "omschrijving" | "status">;

export interface Stapel<M> {
  verleden: M[];
  toekomst: M[];
}

/** De delen van de store waar de versies over gaan. */
export interface VersieStand<M = unknown> extends VersieInhoud, Stapel<M> {
  activeId: string;
  versies: VersieLijst;
  /** Per andere versie zijn stappen, voor deze sessie. */
  stapels: Record<string, Stapel<M>>;
}

/** Het id van de versie van een project dat er nog geen heeft. In een bestand staat het dan ook niet. */
export const EERSTE_VERSIE = "v-1";

/** Elk project begint als één versie, ook een oud bestand. */
export function beginVersies(): VersieLijst {
  return { actief: EERSTE_VERSIE, lijst: [{ id: EERSTE_VERSIE, naam: "" }] };
}

export function actieveVersie(l: VersieLijst): Versie {
  return l.lijst.find((v) => v.id === l.actief) ?? l.lijst[0];
}

export function ouderVan(l: VersieLijst, id: string): Versie | undefined {
  const ouder = l.lijst.find((v) => v.id === id)?.ouder;
  return ouder === undefined ? undefined : l.lijst.find((v) => v.id === ouder);
}

/** De versies waaruit deze is ontstaan, van het origineel tot en met hemzelf. */
export function lijnVan(l: VersieLijst, id: string): Versie[] {
  const uit: Versie[] = [];
  const gezien = new Set<string>();
  let hier = l.lijst.find((v) => v.id === id);
  while (hier && !gezien.has(hier.id)) {
    gezien.add(hier.id);
    uit.unshift(hier);
    hier = ouderVan(l, hier.id);
  }
  return uit;
}

/** De inhoud van een versie: voor de actieve de werkstand. */
export function inhoudVan(s: Pick<VersieStand, keyof VersieInhoud | "versies">, id: string): VersieInhoud | undefined {
  if (id === s.versies.actief) return { exemplaren: s.exemplaren, gegevens: s.gegevens, rapport: s.rapport };
  return s.versies.lijst.find((v) => v.id === id)?.inhoud;
}

/** De regel van deze versie in een revisietabel: de gekoppelde, of anders de laatste vrije. */
export function revisieVan(id: string, rapport: Pick<Rapport, "revisies">): Revisie | undefined {
  const { revisies } = rapport;
  return revisies.find((r) => r.versieId === id) ?? [...revisies].reverse().find((r) => r.versieId === undefined);
}

/** Code, datum, omschrijving en status van een versie, uit zijn eigen rapport. */
export function versieGegevens(s: Pick<VersieStand, keyof VersieInhoud | "versies">, v: Versie): VersieGegevens {
  const rij = revisieVan(v.id, inhoudVan(s, v.id)?.rapport ?? { revisies: [] });
  return { code: rij?.code ?? "", datum: rij?.datum ?? "", omschrijving: rij?.omschrijving ?? "", status: rij?.status ?? "concept" };
}

/**
 * Wat er vast staat aan een regel van de revisietabel. De regel van een andere versie komt uit die
 * versie; de eigen regel is te bewerken maar hoort bij de versie. Een regel zonder versie, of van een
 * versie die er niet meer is, is vrij.
 */
export function rijIsVast(rij: Revisie, l: VersieLijst): { cellen: boolean; verwijderen: boolean } {
  const vanVersie = rij.versieId !== undefined && l.lijst.some((v) => v.id === rij.versieId);
  return { cellen: vanVersie && rij.versieId !== l.actief, verwijderen: vanVersie };
}

/** Koppelt de regel van deze versie, als dat nog niet is gebeurd. */
function metEigenRij(rapport: Rapport, id: string): Rapport {
  const rij = revisieVan(id, rapport);
  if (!rij || rij.versieId === id) return rapport;
  return { ...rapport, revisies: rapport.revisies.map((r) => (r === rij ? { ...r, versieId: id } : r)) };
}

/** De code die volgt op de laatste regel, en die nog geen enkele versie heeft. */
function vrijeCode(s: VersieStand<unknown>, rapport: Rapport): string {
  const bezet = new Set(s.versies.lijst.map((v) => versieGegevens(s, v).code));
  let code = volgendeCode(rapport.revisies);
  while (bezet.has(code)) code = volgendeCode([{ code, datum: "", omschrijving: "", status: "concept" }]);
  return code;
}

/**
 * Een nieuwe versie uit de huidige stand. Ze deelt alles met haar ouder, heeft een regel in de
 * revisietabel erbij en begint zonder geschiedenis: ongedaan maken loopt niet terug tot voor de tak.
 * De lijst met wijzigingen hoort bij de vergelijking met de ouder, dus die begint opnieuw.
 */
export function nieuweVersie<M>(
  s: VersieStand<M>,
  opties: { id: string; datum: string; naam?: string; omschrijving?: string },
): Partial<VersieStand<M>> {
  const huidig = s.versies.actief;
  const ouderRapport = metEigenRij(s.rapport, huidig);
  const rij: Revisie = {
    code: vrijeCode(s as VersieStand<unknown>, ouderRapport),
    datum: opties.datum,
    omschrijving: opties.omschrijving ?? "",
    status: "concept",
    versieId: opties.id,
  };
  const { wijzigingen: _keuzes, wijzigingsLijst: _lijst, ...rapportZonderLijst } = ouderRapport;
  return {
    rapport: { ...rapportZonderLijst, revisies: [...ouderRapport.revisies, rij] },
    versies: {
      actief: opties.id,
      lijst: [
        ...s.versies.lijst.map((v) => (v.id === huidig
          ? { ...v, inhoud: { exemplaren: s.exemplaren, gegevens: s.gegevens, rapport: ouderRapport } }
          : v)),
        { id: opties.id, naam: opties.naam ?? "", ouder: huidig },
      ],
    },
    verleden: [],
    toekomst: [],
    stapels: { ...s.stapels, [huidig]: { verleden: s.verleden, toekomst: s.toekomst } },
  };
}

/**
 * De regels van eerdere versies in dit rapport volgen wat die versie zelf zegt. Alleen die regels:
 * een eigen regel en een vrije regel blijven. Hetzelfde rapport terug als alles al klopt.
 */
function metLijn(rapport: Rapport, id: string, lijst: readonly Versie[]): Rapport {
  let anders = false;
  const revisies = rapport.revisies.map((r) => {
    if (r.versieId === undefined || r.versieId === id) return r;
    const eigen = lijst.find((v) => v.id === r.versieId)?.inhoud?.rapport.revisies.find((x) => x.versieId === r.versieId);
    if (!eigen || (eigen.code === r.code && eigen.datum === r.datum && eigen.omschrijving === r.omschrijving && eigen.status === r.status)) return r;
    anders = true;
    return { ...eigen };
  });
  return anders ? { ...rapport, revisies } : rapport;
}

/**
 * Naar een andere versie. De huidige stand gaat de lijst in, zonder iets te kopiëren; de stappen van
 * ongedaan maken blijven bij de versie waar ze horen. Niets gaat verloren, en de andere versie komt
 * precies terug zoals ze was. `geenBlad` is wat er opent als er niets is om op te blijven staan.
 */
export function wissel<M>(s: VersieStand<M>, id: string, geenBlad: string): VersieStand<M> | Partial<VersieStand<M>> {
  const doel = s.versies.lijst.find((v) => v.id === id);
  if (id === s.versies.actief || !doel?.inhoud) return s;
  const huidig = s.versies.actief;
  const lijst = s.versies.lijst.map((v): Versie => {
    if (v.id === huidig) return { ...v, inhoud: { exemplaren: s.exemplaren, gegevens: s.gegevens, rapport: s.rapport } };
    if (v.id !== id) return v;
    const { inhoud: _werkstand, ...zonder } = v;
    return zonder;
  });
  const { exemplaren, gegevens, rapport } = doel.inhoud;
  const stapel = s.stapels[id];
  const blijft = /^__.*__$/.test(s.activeId) || exemplaren.some((e) => e.id === s.activeId);
  return {
    exemplaren,
    gegevens,
    rapport: metLijn(rapport, id, lijst),
    versies: { actief: id, lijst },
    activeId: blijft ? s.activeId : (exemplaren[0]?.id ?? geenBlad),
    verleden: stapel?.verleden ?? [],
    toekomst: stapel?.toekomst ?? [],
    stapels: { ...s.stapels, [huidig]: { verleden: s.verleden, toekomst: s.toekomst } },
  };
}

/** De actieve versie is in beeld, en naar het origineel moet je altijd terug kunnen. */
export function magVerwijderen(l: VersieLijst, id: string): boolean {
  const v = l.lijst.find((x) => x.id === id);
  return !!v && id !== l.actief && v.ouder !== undefined;
}

/**
 * Haalt een versie uit de lijst. Haar kinderen hangen daarna aan haar ouder. Haar regel blijft staan in
 * de rapporten die eruit zijn ontstaan, als gewone regel: zij blijven er immers op gebaseerd.
 */
export function verwijderVersie<M>(s: VersieStand<M>, id: string): VersieStand<M> | Partial<VersieStand<M>> {
  if (!magVerwijderen(s.versies, id)) return s;
  const ouder = s.versies.lijst.find((v) => v.id === id)?.ouder;
  const losVan = (r: Rapport): Rapport => (r.revisies.some((x) => x.versieId === id)
    ? {
        ...r,
        revisies: r.revisies.map((x) => {
          if (x.versieId !== id) return x;
          const { versieId: _weg, ...los } = x;
          return los;
        }),
      }
    : r);
  const lijst = s.versies.lijst
    .filter((v) => v.id !== id)
    .map((v): Versie => {
      const metOuder = v.ouder === id ? { ...v, ouder } : v;
      return metOuder.inhoud ? { ...metOuder, inhoud: { ...metOuder.inhoud, rapport: losVan(metOuder.inhoud.rapport) } } : metOuder;
    });
  const { [id]: _stapel, ...stapels } = s.stapels;
  return { rapport: losVan(s.rapport), versies: { actief: s.versies.actief, lijst }, stapels };
}

/** Een eigen naam voor een versie. */
export function hernoemVersie(l: VersieLijst, id: string, naam: string): VersieLijst {
  return { ...l, lijst: l.lijst.map((v) => (v.id === id ? { ...v, naam } : v)) };
}

// ── In het bestand ──────────────────────────────────────────────────────────
// De knopen van het bestand zijn de actieve versie, zoals altijd. De andere staan samen in één
// waarde: een lezer die de versies niet kent, ziet daardoor een gewoon project. Een tekst vanaf
// GROTE_TEKST staat er één keer in, en elke versie wijst hem aan op zijn inhoudshash. Dat geldt
// voor alles (een PDF, een werkmap, een afbeelding, een lange rekentekst), ook voor een soort blad
// die later bijkomt. Staat de tekst ook in de actieve versie, dan alleen daar.

/** Vanaf deze lengte staat een tekst één keer in het bestand. */
export const GROTE_TEKST = 1024;
/** De vorm van `ocss::versies`. */
export const VERSIES_FORMAAT = 1;
/** Een aanwijzing op zijn inhoudshash, in plaats van de tekst: `{ "$bijlage": "<sha256>" }`. */
const VERWIJZING = "$bijlage";
const IS_HASH = /^[0-9a-f]{64}$/;
const IS_VERSIE_ID = /^v-[A-Za-z0-9_-]{1,60}$/;

type Los = Record<string, unknown>;
const object = (x: unknown) => (x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Los) : undefined);

/** Een waarde met zijn grote teksten eruit; die komen in `teksten`, op hun hash. */
function pakIn(x: unknown, teksten: Map<string, string>): unknown {
  if (typeof x === "string") {
    if (x.length < GROTE_TEKST) return x;
    const hash = hashVan(x);
    teksten.set(hash, x);
    return { [VERWIJZING]: hash };
  }
  if (Array.isArray(x)) return x.map((v) => pakIn(v, teksten));
  const o = object(x);
  if (!o) return x;
  // Object.fromEntries: een sleutel als __proto__ wordt een gewoon veld.
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined).map(([k, v]) => [k, pakIn(v, teksten)]));
}

/** Een waarde met zijn aanwijzingen vervangen door de tekst. Wat niet te vinden is, wordt leeg en telt. */
function pakUit(x: unknown, vind: (hash: string) => string | undefined, ontbreekt: () => void): unknown {
  if (Array.isArray(x)) return x.map((v) => pakUit(v, vind, ontbreekt));
  const o = object(x);
  if (!o) return x;
  const sleutels = Object.keys(o);
  if (sleutels.length === 1 && sleutels[0] === VERWIJZING) {
    const hash = o[VERWIJZING];
    const tekst = typeof hash === "string" ? vind(hash) : undefined;
    if (tekst === undefined) ontbreekt();
    return tekst ?? "";
  }
  return Object.fromEntries(sleutels.map((k) => [k, pakUit(o[k], vind, ontbreekt)]));
}

/** Alle grote teksten in een waarde. */
function groteTeksten(x: unknown, uit: Set<string> = new Set()): Set<string> {
  if (typeof x === "string") {
    if (x.length >= GROTE_TEKST) uit.add(x);
  } else if (Array.isArray(x)) {
    for (const v of x) groteTeksten(v, uit);
  } else {
    const o = object(x);
    if (o) for (const v of Object.values(o)) groteTeksten(v, uit);
  }
  return uit;
}

/** Het rapport zoals het in een bestand komt: de lijst met wijzigingen is afgeleid. */
export function rapportVoorBestand(r: Rapport): Rapport {
  if (!("wijzigingsLijst" in r)) return r;
  const { wijzigingsLijst: _afgeleid, ...rest } = r;
  return rest;
}

/**
 * Een blad zoals het in een bestand komt, op dezelfde manier als de knopen: zonder lege lijst elementen,
 * want opslaan na openen moet hetzelfde geven als het eerste opslaan.
 */
function bladVoorBestand(ex: Exemplaar): Exemplaar {
  const { elementen, ...rest } = ex;
  return {
    ...rest,
    ...(elementen && elementen.length > 0 ? { elementen } : {}),
    ...(ex.tekenvel ? { tekenvel: tekenVelVoorBestand(ex.tekenvel) } : {}),
  };
}

/** De inhoud zoals die in een bestand komt. */
function inhoudVoorBestand(i: VersieInhoud) {
  return { gegevens: i.gegevens, exemplaren: i.exemplaren.map(bladVoorBestand), rapport: rapportVoorBestand(i.rapport) };
}

/** Een versie verandert niet zolang ze niet actief is; inpakken hoeft dus één keer. */
const ingepakt = new WeakMap<VersieInhoud, { inhoud: unknown; teksten: Map<string, string> }>();

function pakInhoudIn(i: VersieInhoud) {
  let uit = ingepakt.get(i);
  if (!uit) {
    const teksten = new Map<string, string>();
    uit = { inhoud: pakIn(inhoudVoorBestand(i), teksten), teksten };
    ingepakt.set(i, uit);
  }
  return uit;
}

/**
 * De versies zoals ze in het bestand komen, zonder de actieve: `top` is de werkstand en staat al in de
 * knopen. Eén versie zonder eigen naam levert niets op: dan blijft het bestand tot op de letter wat het was.
 */
export function schrijfVersies(l: VersieLijst, top: VersieInhoud): unknown {
  if (l.lijst.length === 1 && l.lijst[0].id === EERSTE_VERSIE && l.lijst[0].naam === "") return undefined;
  const stand = { ...top, versies: l };
  const teksten = new Map<string, string>();
  const lijst = l.lijst.map((v) => {
    const { code, datum, omschrijving } = versieGegevens(stand, v);
    const kop = { id: v.id, code, naam: v.naam, datum, omschrijving, ...(v.ouder !== undefined ? { ouder: v.ouder } : {}) };
    if (v.id === l.actief || !v.inhoud) return kop;
    const pak = pakInhoudIn(v.inhoud);
    for (const [hash, tekst] of pak.teksten) teksten.set(hash, tekst);
    return { ...kop, inhoud: pak.inhoud };
  });
  for (const tekst of groteTeksten(inhoudVoorBestand(top))) teksten.delete(hashVan(tekst));
  return { versie: VERSIES_FORMAAT, actief: l.actief, lijst, bijlagen: Object.fromEntries(teksten) };
}

/** Wat er aan de versies in een bestand niet klopte; de app zet het in de taal van de gebruiker. */
export interface VersieMelding {
  soort: "onleesbaar" | "versieWeg" | "actiefWeg" | "bijlageWeg";
  /** De code van de versie waar het om gaat, als die te lezen is. */
  code?: string;
  /** Hoeveel bijlagen er ontbreken. */
  aantal?: number;
}

/** Hoe de velden van een versie worden gelezen: zoals die van het hele project (projectBestand.ts). */
export interface VersieLezers {
  exemplaren: (x: unknown) => Exemplaar[];
  gegevens: (x: unknown) => ProjectGegevens;
  rapport: (x: unknown) => Rapport;
}

/**
 * De versies uit een bestand, dat van iemand anders kan komen: elk veld wordt gecontroleerd, en een
 * bijlage alleen gebruikt als zijn inhoud bij zijn hash past. Wat niet te lezen is, valt weg en staat in
 * `meldingen`. Een versie waarvan alleen een bijlage ontbreekt, blijft: de rest van haar werk is er nog.
 * De actieve versie staat in de knopen en is er dus altijd. `top` zijn die knopen, zoals ze zijn gelezen.
 */
export function leesVersies(x: unknown, top: { exemplaren?: unknown; gegevens?: unknown; rapport?: unknown }, lees: VersieLezers): { versies: VersieLijst; meldingen: VersieMelding[] } {
  const o = object(x);
  if (!o || !Array.isArray(o.lijst) || o.lijst.length === 0) return { versies: beginVersies(), meldingen: [{ soort: "onleesbaar" }] };

  const opslag = object(o.bijlagen) ?? {};
  const gevonden = new Map<string, string | undefined>();
  let inTop: Map<string, string> | null = null;
  const vind = (hash: string): string | undefined => {
    if (!IS_HASH.test(hash)) return undefined;
    if (gevonden.has(hash)) return gevonden.get(hash);
    const tekst = heeftSleutel(opslag, hash) ? opslag[hash] : undefined;
    let uit = typeof tekst === "string" && hashVan(tekst) === hash ? tekst : undefined;
    if (uit === undefined) {
      inTop ??= new Map([...groteTeksten(top)].map((t) => [hashVan(t), t]));
      uit = inTop.get(hash);
    }
    gevonden.set(hash, uit);
    return uit;
  };

  const meldingen: VersieMelding[] = [];
  const lijst: Versie[] = [];
  for (const el of o.lijst as unknown[]) {
    const e = object(el);
    const code = typeof e?.code === "string" ? e.code : undefined;
    const weg = () => meldingen.push({ soort: "versieWeg", ...(code ? { code } : {}) });
    const id = e?.id;
    if (!e || typeof id !== "string" || !IS_VERSIE_ID.test(id) || lijst.some((v) => v.id === id)) {
      weg();
      continue;
    }
    const versie: Versie = { id, naam: typeof e.naam === "string" ? e.naam : "", ...(typeof e.ouder === "string" ? { ouder: e.ouder } : {}) };
    if (id === o.actief) {
      lijst.push(versie);
      continue;
    }
    try {
      let aantal = 0;
      const i = object(pakUit(e.inhoud, vind, () => { aantal++; }));
      if (!i || !Array.isArray(i.exemplaren) || !object(i.rapport)) {
        weg();
        continue;
      }
      versie.inhoud = { exemplaren: lees.exemplaren(i.exemplaren), gegevens: lees.gegevens(i.gegevens), rapport: lees.rapport(i.rapport) };
      if (aantal > 0) meldingen.push({ soort: "bijlageWeg", aantal, ...(code ? { code } : {}) });
      lijst.push(versie);
    } catch {
      // Te diep genest of anderszins onbruikbaar: de andere versies blijven.
      weg();
    }
  }

  let actief = typeof o.actief === "string" ? o.actief : "";
  if (!lijst.some((v) => v.id === actief)) {
    for (let n = 1; ; n++) {
      actief = `v-${n}`;
      if (!lijst.some((v) => v.id === actief)) break;
    }
    lijst.unshift({ id: actief, naam: "" });
    meldingen.push({ soort: "actiefWeg" });
  }

  // Een ouder die er niet is, of een kring: dan is het een eigen begin.
  const versies: VersieLijst = { actief, lijst };
  for (const v of lijst) {
    if (v.ouder === undefined) continue;
    const bestaat = lijst.some((w) => w.id === v.ouder);
    if (!bestaat || lijnVan(versies, v.id)[0]?.ouder !== undefined) delete v.ouder;
  }
  return { versies, meldingen };
}
