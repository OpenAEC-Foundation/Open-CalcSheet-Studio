/**
 * Wisselen van taal in een rapport.
 *
 * Wat de app meelevert wisselt mee: een tekst of veld die gelijk is aan een meegeleverde
 * waarde, in welke taal dan ook, staat daarna in de nieuwe taal. Eigen tekst blijft staan.
 * Automatisch vertalen doen we niet. Per tekst-id onthoudt `Rapport.tekstTaal` de taal
 * waarin de gebruiker de tekst typte, en het paneel meldt het als die afwijkt van de taal
 * van het rapport (andereTaalVan). De tekst-id's en de ankers veranderen niet.
 *
 * Getallen in de invoer krijgen de notatie van de nieuwe taal: een komma of punt tussen
 * twee cijfers is geen tekst die iemand heeft geschreven.
 *
 * Zonder React en zonder stores: scripts/check-rapport-talen.mjs laadt dit bestand
 * rechtstreeks in Node.
 */
import { inTaal, type Meertalig } from "./meertalig.ts";
import { inNotatie, leesTaal, MEEGELEVERD, type LokaleInvoer, type Opbouw, type Rapport } from "./model.ts";
import { NEDERLAND, pasRapportAan, type Normkeuze } from "./normen/keuze.ts";
import { zetOpPad, type Pad } from "./pad.ts";
import { zelfdeWaarde } from "./opzet.ts";
import { variantenVan } from "./standaardteksten.ts";
import { nieuwRapportVolgens, normaal, type Template } from "./template.ts";

/** De meegeleverde waarde die in één van de talen gelijk is aan `waarde`. */
function zoek(waarde: string, lijst: readonly Meertalig[]): Meertalig | undefined {
  const t = normaal(waarde);
  if (t === "") return undefined;
  return lijst.find((m) => Object.values(m).some((w) => normaal(w) === t));
}

/** `waarde` in de nieuwe taal als hij meegeleverd is; anders ongewijzigd. */
function wissel(waarde: string, lijst: readonly Meertalig[], naar: string): string {
  const m = zoek(waarde, lijst);
  return m ? inTaal(m, naar) : waarde;
}

/** De meegeleverde teksten van dit tekst-id: uit het template van dit rapport, anders van de app. */
const tekstenVan = (r: Rapport, id: string): readonly Meertalig[] => variantenVan(r, id).map((v) => v.tekst);

function wisselOpbouw(o: Opbouw, naar: string): Opbouw {
  const n = (s: string) => inNotatie(s, naar);
  return o.soort === "vlak"
    ? { ...o, lagen: o.lagen.map((l) => ({ ...l, d: n(l.d), rho: n(l.rho), p: n(l.p) })) }
    : { ...o, lagen: o.lagen.map((l) => ({ ...l, p: n(l.p), h: n(l.h), vulling: n(l.vulling) })) };
}

/** De invoer buiten de Nederlandse tabellen: meegeleverde namen wisselen, getallen krijgen de notatie. */
function wisselLokaal(l: LokaleInvoer, naar: string): LokaleInvoer {
  const n = (s: string) => inNotatie(s, naar);
  const waarden = (w: Record<string, string>) => Object.fromEntries(Object.entries(w).map(([k, v]) => [k, n(v)]));
  const m = MEEGELEVERD;
  return {
    ...l,
    wind: { ...l.wind, waarden: waarden(l.wind.waarden), q: n(l.wind.q) },
    sneeuw: { ...l.sneeuw, waarden: waarden(l.sneeuw.waarden), s: n(l.sneeuw.s) },
    aardbeving: { ...l.aardbeving, waarden: waarden(l.aardbeving.waarden) },
    factoren: l.factoren.map((f) => ({ ...f, naam: wissel(f.naam, m.factorNaam, naar), gGinf: n(f.gGinf), gGsup: n(f.gGsup), gQ1: n(f.gQ1), gQi: n(f.gQi) })),
    psi: l.psi.map((p) => ({ naam: wissel(p.naam, m.psiNaam, naar), psi0: n(p.psi0), psi1: n(p.psi1), psi2: n(p.psi2) })),
    klassen: l.klassen.map((k) => ({ omschrijving: wissel(k.omschrijving, m.psiNaam, naar), qk: n(k.qk), Qk: n(k.Qk) })),
  };
}

/**
 * Het rapport in de taal `naar`. Hetzelfde object terug als er niets te doen is: dezelfde
 * taal, of een taal die geen taalcode is. Een eigen tekst krijgt in `tekstTaal` de taal
 * waarin hij is getypt; zonder regel daar (een oud rapport) is dat de taal van voor de
 * wissel.
 */
export function wisselTaal(r: Rapport, naar: string): Rapport {
  if (r.taal === naar || leesTaal(naar) === undefined) return r;
  const teksten: Record<string, string> = {};
  const tekstTaal: Record<string, string> = {};
  for (const [id, tekst] of Object.entries(r.teksten)) {
    const variant = zoek(tekst, tekstenVan(r, id));
    teksten[id] = variant ? inTaal(variant, naar) : tekst;
    if (variant || normaal(tekst) === "") continue;
    tekstTaal[id] = r.tekstTaal[id] ?? r.taal;
  }
  const n = (s: string) => inNotatie(s, naar);
  const m = MEEGELEVERD;
  const u = r.uitgangspunten;
  const b = r.belastingen;
  return {
    ...r,
    taal: naar,
    teksten,
    tekstTaal,
    titel: wissel(r.titel, m.titel, naar),
    normen: wissel(r.normen, m.normen, naar),
    revisies: r.revisies.map((x) => ({ ...x, omschrijving: wissel(x.omschrijving, m.revisie, naar) })),
    rol: {
      rol: wissel(r.rol.rol, m.rol, naar),
      architect: wissel(r.rol.architect, m.architect, naar),
      datumOnderlegger: wissel(r.rol.datumOnderlegger, m.datumOnderlegger, naar),
    },
    uitgangspunten: {
      ...u,
      soortBouwwerk: wissel(u.soortBouwwerk, m.soortBouwwerk, naar),
      materialen: u.materialen.map((x) => ({
        ...x,
        type: wissel(x.type, m.materiaalType, naar),
        opmerking: wissel(x.opmerking, m.materiaalOpmerking, naar),
      })),
      materialenNoot: wissel(u.materialenNoot, m.materialenNoot, naar),
      bevestiging: u.bevestiging.map((x) => ({ ...x, type: wissel(x.type, m.bevestiging, naar) })),
      conservering: u.conservering.map((x) => ({
        onderdeel: wissel(x.onderdeel, m.conserveringOnderdeel, naar),
        systeem: wissel(x.systeem, m.conserveringSysteem, naar),
      })),
      conserveringSlot: wissel(u.conserveringSlot, m.conserveringSlot, naar),
      vervormingen: u.vervormingen.map((x) => ({
        onderdeel: wissel(x.onderdeel, m.vervormingOnderdeel, naar),
        ueind: n(x.ueind),
        ubij: n(x.ubij),
        uhor: n(x.uhor),
      })),
    },
    belastingen: {
      ...b,
      wind: {
        ...b.wind,
        gebouwhoogte: n(b.wind.gebouwhoogte),
        cscd: n(b.wind.cscd),
        coefficienten: b.wind.coefficienten.map((c) => ({ ...c, c: n(c.c) })),
      },
      klassen: b.klassen.map((k) => ({
        ...k,
        lichteScheidingswanden: n(k.lichteScheidingswanden),
        dakhelling: n(k.dakhelling),
        qlast: n(k.qlast),
      })),
      vloerenDaken: b.vloerenDaken.map((o) => wisselOpbouw(o, naar)),
      wanden: b.wanden.map((o) => wisselOpbouw(o, naar)),
    },
    ...(r.lokaal ? { lokaal: Object.fromEntries(Object.entries(r.lokaal).map(([code, l]) => [code, wisselLokaal(l, naar)])) } : {}),
  };
}

/**
 * Zet een tekst. Getypte tekst krijgt de taal van het rapport; een meegeleverde variant of
 * een lege tekst staat niet in `tekstTaal`, want die hoeft niet vertaald.
 */
export function metTekst(r: Rapport, id: string, tekst: string): Rapport {
  const { [id]: _oud, ...tekstTaal } = r.tekstTaal;
  const eigen = normaal(tekst) !== "" && zoek(tekst, tekstenVan(r, id)) === undefined;
  return {
    ...r,
    teksten: { ...r.teksten, [id]: tekst },
    tekstTaal: eigen ? { ...tekstTaal, [id]: r.taal } : tekstTaal,
  };
}

/**
 * Zet één veld op een pad, zoals het paneel en de API dat doen. Het veld `taal` wisselt
 * het hele rapport, een tekst onthoudt zijn taal; de rest gaat gewoon op zijn plek.
 */
export function zetVeldOpPad(r: Rapport, pad: Pad, waarde: unknown): Rapport {
  if (pad.length === 1 && pad[0] === "taal" && typeof waarde === "string") return wisselTaal(r, waarde);
  if (pad.length === 2 && pad[0] === "teksten" && typeof waarde === "string") return metTekst(r, String(pad[1]), waarde);
  return zetOpPad(r, pad, waarde);
}

/** De taal van deze tekst als die anders is dan de taal van het rapport; anders null. */
export function andereTaalVan(r: Rapport, id: string): string | null {
  const getypt = r.tekstTaal[id];
  return getypt && getypt !== r.taal && normaal(r.teksten[id] ?? "") !== "" ? getypt : null;
}

/**
 * Heeft nog niemand aan dit rapport gezeten? Dan mag het de taal van de app volgen. De
 * datum van de eerste revisie telt niet mee. Met een template: is het precies een nieuw
 * rapport volgens dat template? `keuze`: het land van het project, want een nieuw rapport buiten
 * Nederland begint anders.
 */
export function isNieuwRapport(r: Rapport, template: Template | null = null, keuze: Normkeuze = NEDERLAND): boolean {
  return zelfdeWaarde(r, pasRapportAan(nieuwRapportVolgens(r.revisies[0]?.datum ?? "", r.taal, template), NEDERLAND, keuze));
}
