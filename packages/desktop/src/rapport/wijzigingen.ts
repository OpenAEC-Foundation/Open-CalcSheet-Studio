/**
 * De lijst met wijzigingen in het rapport: per plek wat er anders is dan in de oudertak.
 *
 * Twee dingen, bewust gescheiden. `Rapport.wijzigingsLijst` is afgeleid: de app maakt hem steeds
 * opnieuw uit de vergelijking (store/versieVergelijking.ts) en hij staat niet in het bestand.
 * `Rapport.wijzigingen` is van de gebruiker: per regel een eigen tekst, een toelichting of de keuze
 * om de regel weg te laten. Die hangt aan de sleutel van de regel en blijft dus staan als de lijst
 * opnieuw wordt gemaakt, ook als de regel even niet meer voorkomt.
 *
 * Een regel bewaart gegevens en geen zinnen, zodat hij op papier in de taal van het rapport staat en
 * op het scherm in die van de app. Het paginanummer komt uit de ankers van het afdrukvoorbeeld.
 *
 * Zonder React en zonder stores: scripts/check-versies.mjs laadt dit bestand rechtstreeks in Node.
 */
import { inNotatie, type Rapport } from "./model.ts";
import { bijlageBladAnker, heeftSleutel, type Rapportknoop } from "./opzet.ts";

/** Een waarde die anders is: zonder `van` is hij erbij gekomen, zonder `naar` vervallen. */
export interface Verandering {
  naam: string;
  van?: string;
  naar?: string;
}

/** Wat er aan een bestand op een blad is veranderd. */
export type BestandsDeel = "pdf" | "aantekeningen" | "werkmap" | "tekst" | "graaf" | "tekening" | "notebook" | "elementen";

export type WijzigingsDeel =
  | { soort: "erbij" | "weg" | "tekst" | "inhoud" }
  | { soort: "hernoemd"; van: string }
  | { soort: "invoer" | "uitkomst" | "gegevens"; lijst: Verandering[]; meer: number }
  | { soort: "rekentekst"; regels: number }
  | { soort: "oordeel"; van: string; naar: string }
  | { soort: "bestand"; wat: BestandsDeel };

export interface Wijzigingsregel {
  /** Blijft gelijk als de lijst opnieuw wordt gemaakt: "blad:ex-1", "knoop:brand", "voorblad". */
  sleutel: string;
  /** Waar het op papier staat: bepaalt het nummer en de pagina. */
  doel: "voorblad" | "knoop" | "blad" | "gegevens" | "bijlagen" | "opzet";
  /** Het blad of de knoop bij `doel` "blad" of "knoop". */
  id?: string;
  /** De naam van het blad of de kop van de knoop; de andere doelen krijgen hun kop bij het tonen. */
  titel: string;
  delen: WijzigingsDeel[];
}

/** Wat de gebruiker met een regel heeft gedaan. */
export interface WijzigingsKeuze {
  /** Vervangt de tekst die de app zelf maakt. */
  tekst?: string;
  /** Een aanvulling onder de regel. */
  toelichting?: string;
  /** De regel staat niet in het rapport. */
  weg?: true;
}

/** Op papier hoogstens zoveel waarden per onderdeel; de rest telt mee als "en 3 meer". */
export const MAX_VERANDERINGEN = 4;

/** Wat de gebruiker met deze regel deed. */
export function keuzeVan(r: Pick<Rapport, "wijzigingen">, sleutel: string): WijzigingsKeuze {
  const keuzes = r.wijzigingen ?? {};
  return heeftSleutel(keuzes, sleutel) ? keuzes[sleutel] : {};
}

/**
 * Zet een deel van de keuze voor een regel. Leeg is geen keuze: het veld verdwijnt, en daarmee zo nodig
 * de regel en het hele veld van het rapport. Alleen een lege eigen tekst mag even bestaan: daar typt
 * iemand in; op papier geldt dan de tekst van de app (regelTekst). Niets veranderd: hetzelfde rapport.
 */
export function metKeuze(r: Rapport, sleutel: string, deel: Partial<Record<keyof WijzigingsKeuze, string | true | undefined>>): Rapport {
  const oud = keuzeVan(r, sleutel);
  const samen = { ...oud, ...deel };
  const nieuw: WijzigingsKeuze = {
    ...(typeof samen.tekst === "string" ? { tekst: samen.tekst } : {}),
    ...(samen.toelichting ? { toelichting: samen.toelichting as string } : {}),
    ...(samen.weg ? { weg: true as const } : {}),
  };
  if (nieuw.tekst === oud.tekst && nieuw.toelichting === oud.toelichting && nieuw.weg === oud.weg) return r;
  const { [sleutel]: _oud, ...andere } = r.wijzigingen ?? {};
  const keuzes = Object.keys(nieuw).length > 0 ? { ...andere, [sleutel]: nieuw } : andere;
  const { wijzigingen: _alle, ...rest } = r;
  return Object.keys(keuzes).length > 0 ? { ...rest, wijzigingen: keuzes } : rest;
}

/** De regels die in het rapport komen. */
export function zichtbareRegels(r: Pick<Rapport, "wijzigingen" | "wijzigingsLijst">): Wijzigingsregel[] {
  return (r.wijzigingsLijst ?? []).filter((w) => !keuzeVan(r, w.sleutel).weg);
}

/** De regels die de gebruiker heeft weggehaald, om terug te zetten. */
export function weggehaaldeRegels(r: Pick<Rapport, "wijzigingen" | "wijzigingsLijst">): Wijzigingsregel[] {
  return (r.wijzigingsLijst ?? []).filter((w) => keuzeVan(r, w.sleutel).weg);
}

/**
 * Eigen tekst bij een regel die niet meer in de lijst staat: het verschil is er niet meer. Die tekst
 * komt niet op papier, en blijft bewaard voor als het verschil terugkomt.
 */
export function keuzesZonderVerschil(r: Pick<Rapport, "wijzigingen" | "wijzigingsLijst">): { sleutel: string; keuze: WijzigingsKeuze }[] {
  const inLijst = new Set((r.wijzigingsLijst ?? []).map((w) => w.sleutel));
  return Object.entries(r.wijzigingen ?? {})
    .filter(([sleutel, keuze]) => !inLijst.has(sleutel) && (keuze.tekst !== undefined || keuze.toelichting !== undefined))
    .map(([sleutel, keuze]) => ({ sleutel, keuze }));
}

/** Waar een regel op papier staat: het nummer, en het anker waar de pagina vandaan komt. */
export interface RegelPlek {
  nummer: string;
  anker?: string;
  /** Een vaste pagina: het voorblad is altijd de eerste. */
  pagina?: number;
}

/**
 * De plek van een regel in dit rapport, uit dezelfde bron als de inhoudsopgave. Een blad in bijlage A
 * staat daar met zijn uitwerking. Wat vervallen is, of geen eigen plek heeft, heeft geen pagina.
 */
export function plekVanRegel(
  regel: Pick<Wijzigingsregel, "doel" | "id">,
  knopen: readonly Rapportknoop[],
  bijlageBladen: readonly { blad: { id: string }; nummer: string }[],
): RegelPlek {
  if (regel.doel === "voorblad") return { nummer: "", pagina: 1 };
  if (regel.doel !== "blad" && regel.doel !== "knoop") return { nummer: "" };
  if (regel.doel === "blad") {
    const inBijlage = bijlageBladen.find((b) => b.blad.id === regel.id);
    if (inBijlage) return { nummer: inBijlage.nummer, anker: bijlageBladAnker(inBijlage.blad.id) };
  }
  const zoek = (lijst: readonly Rapportknoop[]): Rapportknoop | undefined => {
    for (const k of lijst) {
      const hier = k.id === regel.id ? k : zoek(k.kinderen);
      if (hier) return hier;
    }
    return undefined;
  };
  const knoop = zoek(knopen);
  return knoop ? { nummer: knoop.nummer, anker: knoop.id } : { nummer: "" };
}

export type Vertaal = (sleutel: string, opties?: Record<string, unknown>) => string;

/** Een rijtje waarden: `L 4,2 → 4,8, b 75 → 100 en 3 meer`, in de notatie van de taal, en mm² als mm². */
function rijtje(lijst: readonly Verandering[], meer: number, t: Vertaal, taal: string, naam: (n: string) => string): string {
  const waarde = (s: string | undefined) => (s === undefined || s === "" ? "—" : inNotatie(s, taal).replace(/\^2\b/g, "²").replace(/\^3\b/g, "³"));
  const delen = lijst.map((v) => `${naam(v.naam)} ${waarde(v.van)} → ${waarde(v.naar)}`);
  return meer > 0 ? `${delen.join(", ")} ${t("afdruk.wijzigingen.meer", { aantal: meer })}` : delen.join(", ");
}

/** De kop van een regel: de naam van het blad of de knoop, of de vaste kop van zijn soort. */
export function regelKop(regel: Wijzigingsregel, t: Vertaal): string {
  switch (regel.doel) {
    case "voorblad":
      return t("afdruk.wijzigingen.voorblad");
    case "gegevens":
      return t("afdruk.wijzigingen.projectgegevens");
    case "bijlagen":
      return t("afdruk.wijzigingen.bijlagen");
    case "opzet":
      return t("afdruk.wijzigingen.opzet");
    default:
      return regel.titel;
  }
}

/** De tekst van een regel: wat de gebruiker ervan maakte, of anders wat de app zegt. */
export function regelTekst(regel: Wijzigingsregel, r: Pick<Rapport, "wijzigingen">, t: Vertaal, taal: string): string {
  const eigen = keuzeVan(r, regel.sleutel).tekst;
  return eigen && eigen.trim() !== "" ? eigen : wijzigingTekst(regel, t, taal);
}

/** Wat de app zelf over een regel zegt. `t` is van namespace rapport: op papier of op het scherm. */
export function wijzigingTekst(regel: Wijzigingsregel, t: Vertaal, taal: string): string {
  const zelf = (n: string) => n;
  const veld = (n: string) => t(`werkruimte:gegevens.velden.${n}.label`, { defaultValue: n });
  return regel.delen.map((d) => {
    switch (d.soort) {
      case "invoer":
      case "uitkomst":
        return t(`afdruk.wijzigingen.${d.soort}`, { lijst: rijtje(d.lijst, d.meer, t, taal, zelf) });
      case "gegevens":
        return t("afdruk.wijzigingen.gegevens", { lijst: rijtje(d.lijst, d.meer, t, taal, veld) });
      case "hernoemd":
        return t("afdruk.wijzigingen.hernoemd", { van: d.van });
      case "rekentekst":
        return t("afdruk.wijzigingen.rekentekst", { count: d.regels });
      case "oordeel":
        return t("afdruk.wijzigingen.oordeel", { van: t(`afdruk.wijzigingen.oordelen.${d.van}`), naar: t(`afdruk.wijzigingen.oordelen.${d.naar}`) });
      case "bestand":
        return t(`afdruk.wijzigingen.bestand.${d.wat}`);
      default:
        return t(`afdruk.wijzigingen.${d.soort}`);
    }
  }).join(" ");
}
