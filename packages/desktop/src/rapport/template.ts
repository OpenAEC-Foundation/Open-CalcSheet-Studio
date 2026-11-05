/**
 * Het rapporttemplate: het eigen format van een bureau, als bestand en in het rapport.
 *
 * Een template is een `*.reporttemplate` (JSON): de hoofdstukindeling (opzet.ts), per tekst-id
 * de varianten (zoals standaardteksten.ts), de opmaak en eventueel de huisstijl en het land. Het
 * ingebouwde template is ons format: het staat vast in de app (OPZET), en wie het wil aanpassen,
 * werkt in een kopie. Eigen templates staan in de instellingen (store/rapportTemplates.ts).
 *
 * Een rapport houdt zijn eigen kopie (Rapport.opzet), zoals het een kopie van het bureau houdt.
 * Eigen tekst blijft altijd bewaard: wat uit de opzet verdwijnt, blijft in rapport.teksten staan
 * en komt terug als het onderdeel wordt teruggezet.
 *
 * Elke bewerking geeft een nieuw rapport terug en laat het oude staan; kan iets niet, dan komt
 * hetzelfde object terug. Zo ziet het paneel welke knop niets zou doen, en maakt de store geen
 * lege stap in ongedaan maken.
 *
 * Zonder React en zonder stores: scripts/check-rapporttemplate.mjs laadt dit bestand rechtstreeks
 * in Node. Een template uit een bestand is onbetrouwbare invoer: leesTemplate controleert elk veld.
 */
import { alleenInTaal, inTaal, inTaalGezet, leesMeertalig, type Meertalig } from "./meertalig.ts";
import {
  leesHuisstijl, leesLand, standaardRapport, type Huisstijl, type Opmaak, type Rapport,
} from "./model.ts";
import {
  beschrijftBestaand, heeftSleutel, heeftTekst, isRekenblok, knopenVan, normaliseerOpzet, OPZET, opzetVan, REKENBLOKKEN, tekstIds, vrijId,
  zelfdeWaarde, zoekKnoop, type Inhoud, type Knoop, type OpzetMelding, type Weggehaald,
} from "./opzet.ts";
import {
  leesVariantLijst, STANDAARD_IN_NIEUW_RAPPORT, STANDAARD_TEKSTEN, standaardTeksten, variantenVan, type Tekstvariant,
} from "./standaardteksten.ts";

export const TEMPLATE_FORMAAT = "open-calcsheet-report-template";
export const TEMPLATE_VERSIE = 1;
export const TEMPLATE_EXTENSIE = "reporttemplate";
/** Een template is tekst, geen afbeeldingen: wat groter is, is geen template. */
export const TEMPLATE_MAX_TEKENS = 10_000_000;

export interface Template {
  formaat: typeof TEMPLATE_FORMAAT;
  versie: number;
  naam: Meertalig;
  opzet: Knoop[];
  /** Per tekst-id de varianten; de eerste is de tekst waarmee een nieuw rapport begint. */
  teksten: Record<string, Tekstvariant[]>;
  /** Tekst-id's die in een nieuw rapport leeg beginnen, al hebben ze varianten om uit te kiezen. */
  leeg?: string[];
  opmaak: Opmaak;
  huisstijl?: Huisstijl;
  /** Een code uit normen/landen.ts: zet het land in de projectgegevens (pasTemplateToeOpProject in normen/keuze.ts). */
  land?: string;
}

/** Waarom een bestand geen template is. */
export type TemplateFout = "teGroot" | "geenJson" | "geenTemplate" | "geenOpzet";

export type TemplateMelding =
  | OpzetMelding
  | { soort: "nieuwereVersie" | "geenNaam" | "onbekendeTekst" | "onbekendLand"; id?: string; waarde?: string };

export type TemplateUitslag =
  | { ok: true; template: Template; meldingen: TemplateMelding[] }
  | { ok: false; fout: TemplateFout };

/** Regeleinden en witruimte aan de rand tellen niet mee bij het vergelijken van tekst. */
export const normaal = (s: string) => s.replace(/\r\n?/g, "\n").trim();

const object = (x: unknown) => (x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : undefined);

const NIEUWSTE_OPMAAK: Opmaak = { constructieprincipe: true, subkoppen: true, bladenInInhoud: true };

/** De naam van het ingebouwde template. */
export const INGEBOUWD_NAAM: Meertalig = { en: "Standard report", nl: "Standaardrapport" };

/** Het ingebouwde template, als losse kopie: wat je ermee doet, raakt het origineel niet. */
export function ingebouwdTemplate(): Template {
  return {
    formaat: TEMPLATE_FORMAAT,
    versie: TEMPLATE_VERSIE,
    naam: { ...INGEBOUWD_NAAM },
    opzet: structuredClone(OPZET) as Knoop[],
    teksten: structuredClone(STANDAARD_TEKSTEN) as Record<string, Tekstvariant[]>,
    leeg: Object.keys(STANDAARD_TEKSTEN).filter((id) => !STANDAARD_IN_NIEUW_RAPPORT.includes(id)),
    opmaak: { ...NIEUWSTE_OPMAAK },
  };
}

/** Een template uit een object (een bestand of de instellingen), per veld gecontroleerd. */
function leesObject(o: Record<string, unknown>, terugnaam: string): TemplateUitslag {
  if (o.formaat !== TEMPLATE_FORMAAT) return { ok: false, fout: "geenTemplate" };
  const { opzet, meldingen: opzetMeldingen } = normaliseerOpzet(o.opzet);
  if (opzet.length === 0) return { ok: false, fout: "geenOpzet" };
  const meldingen: TemplateMelding[] = [...opzetMeldingen];
  if (typeof o.versie === "number" && o.versie > TEMPLATE_VERSIE) meldingen.push({ soort: "nieuwereVersie", waarde: String(o.versie) });

  let naam = leesMeertalig(o.naam);
  if (!naam) {
    if (!terugnaam) meldingen.push({ soort: "geenNaam" });
    naam = terugnaam ? { en: terugnaam } : { en: "Report template", nl: "Rapporttemplate" };
  }

  // Alleen van onderdelen die er zijn: een id uit het bestand wordt nooit zomaar een sleutel.
  const ids = tekstIds(opzet);
  const bron = object(o.teksten) ?? {};
  const teksten: Record<string, Tekstvariant[]> = {};
  for (const id of ids) {
    if (!heeftSleutel(bron, id)) continue;
    const varianten = leesVariantLijst(bron[id]);
    if (varianten.length > 0) teksten[id] = varianten;
  }
  for (const id of Object.keys(bron)) {
    if (!ids.includes(id)) meldingen.push({ soort: "onbekendeTekst", id });
  }
  const leeg = Array.isArray(o.leeg) ? o.leeg.filter((id): id is string => typeof id === "string" && ids.includes(id)) : [];

  const stand = object(o.opmaak) ?? {};
  const keuze = (v: unknown, standaard: boolean) => (typeof v === "boolean" ? v : standaard);
  const huisstijl = leesHuisstijl(o.huisstijl);
  const land = leesLand(o.land);
  if (o.land !== undefined && !land) meldingen.push({ soort: "onbekendLand", waarde: typeof o.land === "string" ? o.land : "" });
  return {
    ok: true,
    meldingen,
    template: {
      formaat: TEMPLATE_FORMAAT,
      versie: TEMPLATE_VERSIE,
      naam,
      opzet,
      teksten,
      ...(leeg.length > 0 ? { leeg } : {}),
      opmaak: {
        constructieprincipe: keuze(stand.constructieprincipe, NIEUWSTE_OPMAAK.constructieprincipe),
        subkoppen: keuze(stand.subkoppen, NIEUWSTE_OPMAAK.subkoppen),
        bladenInInhoud: keuze(stand.bladenInInhoud, NIEUWSTE_OPMAAK.bladenInInhoud),
      },
      ...(huisstijl ? { huisstijl } : {}),
      ...(land ? { land } : {}),
    },
  };
}

/**
 * Een `*.reporttemplate` lezen. Is het geen template, dan zegt de uitslag waarom en verandert er
 * niets. Wat in een geldig template niet klopt, wordt hersteld en staat in `meldingen`.
 * `bestandsnaam` (zonder extensie) is de naam als het bestand er zelf geen noemt.
 */
export function leesTemplate(raw: string, bestandsnaam = ""): TemplateUitslag {
  if (raw.length > TEMPLATE_MAX_TEKENS) return { ok: false, fout: "teGroot" };
  let inhoud: unknown;
  try {
    inhoud = JSON.parse(raw.replace(/^﻿/, ""));
  } catch {
    return { ok: false, fout: "geenJson" };
  }
  const o = object(inhoud);
  return o ? leesObject(o, bestandsnaam) : { ok: false, fout: "geenTemplate" };
}

/** De tekst van het bestand. */
export function schrijfTemplate(t: Template): string {
  return JSON.stringify(t, null, 2);
}

// ── Toepassen ───────────────────────────────────────────────────────────────

/** Komt deze tekst overeen met een van deze varianten, in welke taal dan ook? */
function isVariant(tekst: string, varianten: readonly Tekstvariant[]): boolean {
  const t = normaal(tekst);
  return t !== "" && varianten.some((v) => Object.values(v.tekst).some((w) => normaal(w) === t));
}

/**
 * Staat hier nog wat een nieuw rapport hier neerzet? Dan heeft niemand eraan gezeten, en mag
 * een ander template het vervangen. Leeg geldt ook: dan raakt niemand iets kwijt.
 */
function isOngemoeid(r: Rapport, id: string, tekst: string): boolean {
  if (normaal(tekst) === "") return true;
  // Buiten Nederland begint een nieuw rapport hier met de tweede variant (metLandTekst in normen/keuze.ts).
  if (id === "aardbeving" && isVariant(tekst, STANDAARD_TEKSTEN.aardbeving)) return true;
  const eerste = r.varianten?.[id]?.[0]
    ?? (STANDAARD_IN_NIEUW_RAPPORT.includes(id) ? STANDAARD_TEKSTEN[id]?.[0] : undefined);
  return eerste !== undefined && isVariant(tekst, [eerste]);
}

/** Varianten die afwijken van wat de app meelevert: alleen die hoeft een rapport te bewaren. */
function eigenVarianten(teksten: Record<string, Tekstvariant[]>): Record<string, Tekstvariant[]> {
  return Object.fromEntries(Object.entries(teksten)
    .filter(([id, lijst]) => !(heeftSleutel(STANDAARD_TEKSTEN, id) && zelfdeWaarde(lijst, STANDAARD_TEKSTEN[id])))
    .map(([id, lijst]) => [id, structuredClone(lijst)]));
}

/** Zet de eigen opzet van een rapport. Is hij gelijk aan het ingebouwde template, dan heeft het rapport er geen. */
function metOpzet(r: Rapport, opzet: Knoop[]): Rapport {
  const { opzet: _oud, ...rest } = r;
  return zelfdeWaarde(opzet, OPZET) ? rest : { ...rest, opzet };
}

/** Zet de lijst weggehaalde onderdelen; een lege lijst is geen veld. */
function metWeggehaald(r: Rapport, lijst: Weggehaald[]): Rapport {
  const { weggehaald: _oud, ...rest } = r;
  return lijst.length > 0 ? { ...rest, weggehaald: lijst } : rest;
}

/**
 * Past een template toe op een rapport. Het rapport krijgt een eigen kopie. Getypte tekst blijft
 * staan; alleen wat niemand aanraakte, volgt het template, in de taal van het rapport. Eigen
 * tekst in een onderdeel dat wegvalt, blijft in het rapport en is terug te zetten.
 */
export function pasTemplateToe(r: Rapport, t: Template): Rapport {
  const nieuw = structuredClone(t.opzet);
  const inNieuw = new Set(knopenVan(nieuw).map((k) => k.id));

  const teksten = { ...r.teksten };
  const tekstTaal = { ...r.tekstTaal };
  for (const id of tekstIds(nieuw)) {
    const huidig = teksten[id] ?? "";
    if (!isOngemoeid(r, id, huidig)) continue;
    const eerste = t.leeg?.includes(id) ? "" : t.teksten[id]?.[0];
    const volgend = eerste === undefined ? huidig : eerste === "" ? "" : inTaal(eerste.tekst, r.taal);
    if (volgend === huidig) continue;
    teksten[id] = volgend;
    delete tekstTaal[id];
  }

  // Eigen tekst die uit beeld raakt: terug te zetten. Een meegeleverde tekst krijg je zo weer.
  const wegBlijft = (r.weggehaald ?? []).filter((w) => !inNieuw.has(w.knoop.id));
  const alWeg = new Set(wegBlijft.flatMap((w) => knopenVan([w.knoop]).map((k) => k.id)));
  const erbij: Weggehaald[] = [];
  const loop = (lijst: readonly Knoop[], ouder: string | null) => {
    lijst.forEach((k, plek) => {
      const tekst = r.teksten[k.id] ?? "";
      const eigen = heeftTekst(k) && !isRekenblok(k) && normaal(tekst) !== "" && !isVariant(tekst, variantenVan(r, k.id));
      if (eigen && !inNieuw.has(k.id) && !alWeg.has(k.id)) {
        const { kinderen: _kinderen, ...los } = k;
        erbij.push({ knoop: structuredClone(los), ouder, plek });
      }
      loop(k.kinderen ?? [], k.id);
    });
  };
  loop(opzetVan(r), null);

  const nieuwePagina = Object.fromEntries(Object.entries(r.nieuwePagina).filter(([id]) => !inNieuw.has(id)));
  const { opzet: _opzet, varianten: _varianten, template: _template, huisstijl: _huisstijl, ...rest } = r;
  const varianten = eigenVarianten(t.teksten);
  const isIngebouwd = zelfdeWaarde(t, ingebouwdTemplate());
  return metWeggehaald(metOpzet({
    ...rest,
    teksten,
    tekstTaal,
    nieuwePagina,
    opmaak: { ...t.opmaak },
    ...(Object.keys(varianten).length > 0 ? { varianten } : {}),
    ...(isIngebouwd ? {} : { template: { naam: { ...t.naam }, ...(t.land ? { land: t.land } : {}) } }),
    ...(t.huisstijl ? { huisstijl: { ...t.huisstijl } } : {}),
  }, nieuw), [...wegBlijft, ...erbij]);
}

/**
 * Terug naar het ingebouwde template, zoals een rapport dat begint. Eigen tekst blijft, en de
 * eigen opmaak en paginakeuzes van het rapport ook. Is er niets te doen, dan komt hetzelfde object terug.
 */
export function terugNaarIngebouwd(r: Rapport): Rapport {
  if (!r.opzet && !r.varianten && !r.template && !r.huisstijl) return r;
  return { ...pasTemplateToe(r, ingebouwdTemplate()), opmaak: r.opmaak, nieuwePagina: r.nieuwePagina };
}

/** Een nieuw rapport volgens dit template; zonder template het ingebouwde. */
export function nieuwRapportVolgens(datum: string, taal: string, t: Template | null): Rapport {
  const r = standaardRapport(datum, standaardTeksten(taal), taal);
  return t ? pasTemplateToe(r, t) : r;
}

/**
 * Maakt een template van dit rapport, om te bewaren. De teksten van nu zijn de teksten waarmee
 * een nieuw rapport begint: getypte tekst wordt de eerste variant, in de taal waarin hij is
 * getypt, en de varianten blijven erachter. De paginakeuzes zitten in de opzet. `land` is het land
 * van het project; zonder gaat mee wat het rapport uit zijn template kreeg.
 */
export function templateUitRapport(r: Rapport, naam: Meertalig, huisstijl?: Huisstijl, land?: string): Template {
  const metPagina = (lijst: readonly Knoop[]): Knoop[] => lijst.map((k) => {
    const { nieuwePagina: standaard, kinderen, ...rest } = k;
    const nieuwePagina = r.nieuwePagina[k.id] ?? standaard;
    return {
      ...rest,
      ...(nieuwePagina ? { nieuwePagina: true } : {}),
      ...(kinderen ? { kinderen: metPagina(kinderen) } : {}),
    };
  });
  const opzet = structuredClone(metPagina(opzetVan(r)));

  const teksten: Record<string, Tekstvariant[]> = {};
  const leeg: string[] = [];
  for (const id of tekstIds(opzet)) {
    const varianten = variantenVan(r, id);
    const tekst = r.teksten[id] ?? "";
    if (normaal(tekst) === "") {
      if (varianten.length > 0) {
        teksten[id] = structuredClone(varianten) as Tekstvariant[];
        leeg.push(id);
      }
      continue;
    }
    const gekozen = varianten.find((v) => isVariant(tekst, [v]));
    const voorop = gekozen ?? { label: { ...EIGEN_LABEL }, tekst: alleenInTaal(tekst, r.tekstTaal[id] ?? r.taal) };
    // Een vorige eigen tekst vervalt: hij zou anders bij elke keer bewaren een variant bijkomen.
    const rest = varianten.filter((v) => v !== gekozen && !zelfdeWaarde(v.label, EIGEN_LABEL));
    teksten[id] = structuredClone([voorop, ...rest]);
  }

  return {
    formaat: TEMPLATE_FORMAAT,
    versie: TEMPLATE_VERSIE,
    naam,
    opzet,
    teksten,
    ...(leeg.length > 0 ? { leeg } : {}),
    opmaak: { ...r.opmaak },
    ...(huisstijl ? { huisstijl: { ...huisstijl } } : {}),
    ...(land ?? r.template?.land ? { land: land ?? r.template?.land } : {}),
  };
}

/** Het label van een tekst die uit het rapport komt en niet uit een lijst varianten. */
const EIGEN_LABEL: Meertalig = { en: "Template text", nl: "Tekst uit het template" };

// ── De opzet bewerken ───────────────────────────────────────────────────────

/** De titel van een nieuw onderdeel per niveau, tot de gebruiker er een typt. */
const NIEUWE_TITEL: Record<Knoop["niveau"], Meertalig> = {
  1: { en: "New chapter", nl: "Nieuw hoofdstuk" },
  2: { en: "New section", nl: "Nieuwe paragraaf" },
  3: { en: "New text block", nl: "Nieuw tekstblok" },
  4: { en: "New text block", nl: "Nieuw tekstblok" },
};

/**
 * De plek van een knoop: de lijst waar hij in staat, zijn index, zijn ouders van boven naar
 * beneden, en de directe ouder.
 */
function plekVan(lijst: readonly Knoop[], id: string, ouders: Knoop[] = []): { lijst: readonly Knoop[]; i: number; ouders: Knoop[]; ouder?: Knoop } | undefined {
  const i = lijst.findIndex((k) => k.id === id);
  if (i >= 0) return { lijst, i, ouders, ouder: ouders[ouders.length - 1] };
  for (const k of lijst) {
    const dieper = k.kinderen && plekVan(k.kinderen, id, [...ouders, k]);
    if (dieper) return dieper;
  }
  return undefined;
}

const metKinderen = (k: Knoop, kinderen: Knoop[]): Knoop => {
  const { kinderen: _oud, ...rest } = k;
  return kinderen.length > 0 ? { ...rest, kinderen } : rest;
};

/** De opzet met een aangepaste lijst: die van `ouder`, of met null het hoogste niveau. */
function metLijst(opzet: readonly Knoop[], ouder: string | null, fn: (lijst: Knoop[]) => Knoop[]): Knoop[] {
  if (ouder === null) return fn([...opzet]);
  return opzet.map((k) => {
    if (k.id === ouder) return metKinderen(k, fn([...(k.kinderen ?? [])]));
    return k.kinderen ? metKinderen(k, metLijst(k.kinderen, ouder, fn)) : k;
  });
}

/** Een knoop en alles eronder met het niveau erbij of eraf. */
function metNiveau(k: Knoop, verschil: number): Knoop {
  const niveau = (k.niveau + verschil) as Knoop["niveau"];
  return k.kinderen ? { ...k, niveau, kinderen: k.kinderen.map((c) => metNiveau(c, verschil)) } : { ...k, niveau };
}

/** Het diepste niveau onder (en met) deze knoop. */
const diepste = (k: Knoop): number => Math.max(k.niveau, ...(k.kinderen ?? []).map(diepste));

/** Kan hier iets onder? Niet onder een rekenblok: dat rekent zelf. En niet dieper dan een subblok. */
const kanKinderenHebben = (k: Knoop) => !isRekenblok(k) && k.niveau < 4;

/** Alle id's die al iets betekenen in dit rapport: ook wat ooit tekst had krijgt een nieuw onderdeel niet. */
function bezetteIds(r: Rapport): Set<string> {
  return new Set([
    ...knopenVan(opzetVan(r)).map((k) => k.id),
    ...(r.weggehaald ?? []).flatMap((w) => knopenVan([w.knoop]).map((k) => k.id)),
    ...Object.keys(r.teksten),
  ]);
}

/**
 * Een nieuw tekstonderdeel: achteraan het hoogste niveau (`ouder` null), of onder een ouder. Het
 * valt weg zolang het leeg is, net als de tekstblokken van ons eigen format. Een hoofdstuk begint
 * op een nieuwe pagina, zoals de hoofdstukken daar.
 */
export function voegKnoopToe(r: Rapport, ouder: string | null): Rapport {
  const opzet = opzetVan(r);
  const boven = ouder === null ? undefined : zoekKnoop(ouder, opzet);
  if (ouder !== null && (!boven || !kanKinderenHebben(boven))) return r;
  const niveau = ((boven?.niveau ?? 0) + 1) as Knoop["niveau"];
  const knoop: Knoop = {
    id: vrijId(bezetteIds(r)),
    titel: alleenInTaal(inTaal(NIEUWE_TITEL[niveau], r.taal), r.taal),
    niveau,
    inhoud: "tekst",
    optioneel: true,
    ...(niveau === 1 ? { nieuwePagina: true } : {}),
  };
  return metOpzet(r, metLijst(opzet, ouder, (l) => [...l, knoop]));
}

/**
 * Hernoemt een onderdeel. De nieuwe titel hoort bij de taal van het rapport, en het is de kop die
 * je nu ziet: bij nieuwbouw dus `titelNieuwbouw` (titelVan in opzet.ts).
 */
export function hernoemKnoop(r: Rapport, id: string, titel: string): Rapport {
  const k = zoekKnoop(id, opzetVan(r));
  if (!k) return r;
  const nieuwbouw = k.titelNieuwbouw !== undefined && r.opmaak.constructieprincipe && !beschrijftBestaand(r);
  const pas = (lijst: readonly Knoop[]): Knoop[] => lijst.map((c) => {
    if (c.id === id) {
      return nieuwbouw && c.titelNieuwbouw
        ? { ...c, titelNieuwbouw: inTaalGezet(c.titelNieuwbouw, r.taal, titel) }
        : { ...c, titel: inTaalGezet(c.titel, r.taal, titel) };
    }
    return c.kinderen ? { ...c, kinderen: pas(c.kinderen) } : c;
  });
  return metOpzet(r, pas(opzetVan(r)));
}

/**
 * Een plek omhoog (-1) of omlaag (1). Aan de rand van zijn lijst gaat een onderdeel over zijn
 * ouder heen: naar het einde van de vorige of het begin van de volgende ouder van hetzelfde niveau.
 */
export function verplaatsKnoop(r: Rapport, id: string, richting: -1 | 1): Rapport {
  const opzet = opzetVan(r);
  const plek = plekVan(opzet, id);
  if (!plek) return r;
  const knoop = plek.lijst[plek.i];
  const { ouder } = plek;
  const j = plek.i + richting;
  if (j >= 0 && j < plek.lijst.length) {
    return metOpzet(r, metLijst(opzet, ouder?.id ?? null, (l) => {
      [l[plek.i], l[j]] = [l[j], l[plek.i]];
      return l;
    }));
  }
  if (!ouder) return r;
  const ouders = knopenVan(opzet).filter((k) => k.niveau === ouder.niveau && kanKinderenHebben(k));
  const doel = ouders[ouders.findIndex((k) => k.id === ouder.id) + richting];
  if (!doel) return r;
  const zonder = metLijst(opzet, ouder.id, (l) => l.filter((k) => k.id !== id));
  return metOpzet(r, metLijst(zonder, doel.id, (l) => (richting < 0 ? [...l, knoop] : [knoop, ...l])));
}

/**
 * Een niveau hoger (-1): na zijn ouder, naast die ouder. Of dieper (1): achteraan onder het
 * onderdeel ervoor. Een hele tak gaat mee, en de nummering volgt vanzelf (bouwOpzet).
 */
export function springKnoop(r: Rapport, id: string, richting: -1 | 1): Rapport {
  const opzet = opzetVan(r);
  const plek = plekVan(opzet, id);
  if (!plek) return r;
  const knoop = plek.lijst[plek.i];
  const { ouder } = plek;
  if (knoop.inhoud === "berekeningen") return r;
  if (richting < 0) {
    if (!ouder) return r;
    const boven = plek.ouders[plek.ouders.length - 2];
    const zonder = metLijst(opzet, ouder.id, (l) => l.filter((k) => k.id !== id));
    return metOpzet(r, metLijst(zonder, boven?.id ?? null, (l) => {
      l.splice(l.findIndex((k) => k.id === ouder.id) + 1, 0, metNiveau(knoop, -1));
      return l;
    }));
  }
  const vorige = plek.lijst[plek.i - 1];
  if (!vorige || !kanKinderenHebben(vorige) || diepste(knoop) >= 4) return r;
  const zonder = metLijst(opzet, ouder?.id ?? null, (l) => l.filter((k) => k.id !== id));
  return metOpzet(r, metLijst(zonder, vorige.id, (l) => [...l, metNiveau(knoop, 1)]));
}

/**
 * Haalt een onderdeel uit de opzet, met alles eronder. De tekst blijft in rapport.teksten. Het
 * komt in de lijst om terug te zetten, behalve als er niets te bewaren valt: een rekenblok (dat
 * plaats je weer uit de lijst) of een eigen onderdeel waar nog niets in staat.
 */
export function verwijderKnoop(r: Rapport, id: string): Rapport {
  const opzet = opzetVan(r);
  const plek = plekVan(opzet, id);
  if (!plek) return r;
  const knoop = plek.lijst[plek.i];
  const ouder = plek.ouder?.id ?? null;
  const zonder = metLijst(opzet, ouder, (l) => l.filter((k) => k.id !== id));
  const tak = knopenVan([knoop]).filter((k) => !isRekenblok(k));
  const bewaren = tak.some((k) => zoekKnoop(k.id, OPZET) !== undefined || normaal(r.teksten[k.id] ?? "") !== "");
  const lijst = r.weggehaald ?? [];
  return metOpzet(bewaren ? metWeggehaald(r, [...lijst, { knoop, ouder, plek: plek.i }]) : r, zonder);
}

/**
 * Zet een weggehaald onderdeel terug, op zijn oude plek als die er nog is en anders op het hoogste
 * niveau. Wat er intussen weer staat (een rekenblok dat je opnieuw plaatste) komt niet dubbel.
 */
export function zetKnoopTerug(r: Rapport, id: string): Rapport {
  const weg = r.weggehaald?.find((w) => w.knoop.id === id);
  if (!weg) return r;
  const opzet = opzetVan(r);
  const bezet = new Set(knopenVan(opzet).map((k) => k.id));
  const zonderBezet = (k: Knoop): Knoop[] => {
    const kinderen = (k.kinderen ?? []).flatMap(zonderBezet);
    return bezet.has(k.id) ? kinderen : [metKinderen(k, kinderen)];
  };
  const ouder = weg.ouder === null ? undefined : zoekKnoop(weg.ouder, opzet);
  const boven = ouder && kanKinderenHebben(ouder) ? ouder : undefined;
  const niveau = (boven?.niveau ?? 0) + 1;
  const terug = zonderBezet(weg.knoop).map((k) => metNiveau(k, niveau - k.niveau));
  const nieuw = metLijst(opzet, boven?.id ?? null, (l) => {
    // De oude plek telt alleen in de oude lijst; anders achteraan.
    const opOudePlek = weg.ouder === null || boven !== undefined;
    l.splice(opOudePlek ? Math.min(weg.plek, l.length) : l.length, 0, ...terug);
    return l;
  });
  // Lezen brengt een tak die nu te diep staat weer op geldige niveaus.
  return metOpzet(metWeggehaald(r, r.weggehaald!.filter((w) => w !== weg)), normaliseerOpzet(nieuw).opzet);
}

/** Haalt een onderdeel uit de lijst om terug te zetten, met zijn tekst: dit is de stap die iets echt weggooit. */
export function vergeetKnoop(r: Rapport, id: string): Rapport {
  const weg = r.weggehaald?.find((w) => w.knoop.id === id);
  if (!weg) return r;
  const teksten = { ...r.teksten };
  const tekstTaal = { ...r.tekstTaal };
  // Een rekenblok is niet weggegooid: dat kan terug uit de lijst, met zijn tekst.
  for (const k of knopenVan([weg.knoop])) {
    if (isRekenblok(k)) continue;
    delete teksten[k.id];
    delete tekstTaal[k.id];
  }
  return metWeggehaald({ ...r, teksten, tekstTaal }, r.weggehaald!.filter((w) => w !== weg));
}

/** De rekenblokken die nog niet in de opzet staan. */
export function ongeplaatsteBlokken(r: Pick<Rapport, "opzet">): Knoop[] {
  const geplaatst = new Set(knopenVan(opzetVan(r)).map((k) => k.id));
  return REKENBLOKKEN.filter((k) => !geplaatst.has(k.id));
}

/**
 * Plaatst een rekenblok uit de lijst, hooguit één keer: achteraan onder `ouder`, of achteraan het
 * hoogste niveau. Berekeningen staat altijd op het hoogste niveau: daar komen de bladen onder.
 * Buiten een ingesprongen hoofdstuk houdt een blok zijn eigen inspringen, voor hetzelfde beeld.
 */
export function plaatsBlok(r: Rapport, inhoud: Inhoud, ouder: string | null): Rapport {
  const blok = ongeplaatsteBlokken(r).find((k) => k.inhoud === inhoud);
  if (!blok) return r;
  const opzet = opzetVan(r);
  const doel = inhoud === "berekeningen" ? null : ouder;
  const boven = doel === null ? undefined : zoekKnoop(doel, opzet);
  if (doel !== null && (!boven || !kanKinderenHebben(boven))) return r;
  const keten = doel === null ? [] : [...(plekVan(opzet, doel)?.ouders ?? []), boven as Knoop];
  const { inspringen, ...rest } = structuredClone(blok);
  const erft = keten.some((k) => k.inspringen !== undefined);
  const knoop: Knoop = {
    ...rest,
    niveau: ((boven?.niveau ?? 0) + 1) as Knoop["niveau"],
    ...(inspringen !== undefined && !erft ? { inspringen } : {}),
    ...(inhoud === "berekeningen" ? { nieuwePagina: true } : {}),
  };
  return metOpzet(r, metLijst(opzet, doel, (l) => [...l, knoop]));
}

// ── Eigen templates in de instellingen ──────────────────────────────────────

export interface EigenTemplate {
  id: string;
  template: Template;
}

export interface EigenTemplates {
  lijst: EigenTemplate[];
  /** Het id van het template voor nieuwe rapporten; null is het ingebouwde. */
  standaard: string | null;
}

/** Uit de instellingen, die net zo onbetrouwbaar zijn als een bestand: wat niet klopt, valt weg. */
export function normaliseerEigenTemplates(x: unknown): EigenTemplates {
  const o = object(x);
  const lijst: EigenTemplate[] = [];
  for (const el of Array.isArray(o?.lijst) ? (o.lijst as unknown[]) : []) {
    const e = object(el);
    const t = object(e?.template);
    if (!e || !t || typeof e.id !== "string" || e.id === "" || lijst.some((w) => w.id === e.id)) continue;
    const gelezen = leesObject(t, "");
    if (gelezen.ok) lijst.push({ id: e.id, template: gelezen.template });
  }
  const standaard = lijst.find((e) => e.id === o?.standaard)?.id ?? null;
  return { lijst, standaard };
}

/**
 * Bewaart een template in de eigen lijst. Een template met dezelfde naam wordt op zijn plek
 * vervangen, zoals een eigen tekstvariant. Geeft ook het id terug.
 */
export function metEigenTemplate(eigen: EigenTemplates, template: Template): { eigen: EigenTemplates; id: string } {
  const bestaand = eigen.lijst.find((e) => inTaal(e.template.naam, "en") === inTaal(template.naam, "en"));
  if (bestaand) {
    return { id: bestaand.id, eigen: { ...eigen, lijst: eigen.lijst.map((e) => (e === bestaand ? { id: e.id, template } : e)) } };
  }
  const bezet = new Set(eigen.lijst.map((e) => e.id));
  let n = 1;
  while (bezet.has(`template-${n}`)) n++;
  const id = `template-${n}`;
  return { id, eigen: { ...eigen, lijst: [...eigen.lijst, { id, template }] } };
}

/** Haalt een template uit de lijst; was het de standaard, dan is dat weer het ingebouwde. */
export function zonderEigenTemplate(eigen: EigenTemplates, id: string): EigenTemplates {
  if (!eigen.lijst.some((e) => e.id === id)) return eigen;
  return { lijst: eigen.lijst.filter((e) => e.id !== id), standaard: eigen.standaard === id ? null : eigen.standaard };
}

/** Het template voor nieuwe rapporten; null is het ingebouwde. Een onbekend id verandert niets. */
export function metStandaardTemplate(eigen: EigenTemplates, id: string | null): EigenTemplates {
  if (id !== null && !eigen.lijst.some((e) => e.id === id)) return eigen;
  return { ...eigen, standaard: id };
}

/** Het template waarmee een nieuw rapport begint; null is het ingebouwde. */
export function standaardTemplateVan(eigen: EigenTemplates): Template | null {
  return eigen.lijst.find((e) => e.id === eigen.standaard)?.template ?? null;
}
