/**
 * Hoofdstuk 5 als rekentekst: de onderdelen 5.4 (overige veranderlijke belastingen) en 5.5
 * (blijvende belastingen) als een gewoon blad, met hun symbolen in een `#global`-blok.
 *
 * Zo'n blad vult daarna dat onderdeel van het rapport (Rapport.bladVoor), en elk ander blad
 * kent de symbolen via `#global` in plaats van via het rapport (belastingBronnen.ts). De
 * tekst rekent hetzelfde als het formulier: dezelfde lagen, dezelfde sommen, dezelfde
 * waarden van de belastingklassen. Daarna is het gewone rekentekst die je kunt aanpassen.
 *
 * Zonder titelregel: in het rapport staat het blad onder de kop van het onderdeel (5.5
 * Blijvende belastingen), en de naam van het blad is die kop.
 *
 * De bron is Nederlandse rekentekst, zoals elk blad; de editor toont hem in de taal van de
 * app. Een naam met een apostrof krijgt een typografische (’): een rechte wisselt in de
 * rekentaal tussen tekst en rekenen.
 *
 * Puur en zonder React: de controlescripts laden dit bestand.
 */
import type { Belastingen, Belastingklasse, Opbouw } from "./model.ts";
import { categorie, dakQk, getal, klasseWaarden } from "./normwaarden.ts";
import { leesVulling } from "./opbouw.ts";
import { inTaal } from "./meertalig.ts";
import { geldigSymbool } from "./belastingBronnen.ts";

/** Het onderdeel van het rapport dat zo'n blad vult (opzet.ts). */
export type Belastingonderdeel = "blijvend" | "veranderlijk";

/** Een getal als rekentekst: een punt als decimaalteken, zonder staart van afronding. */
function g(v: number): string {
  return String(Number(v.toPrecision(12)));
}

/** Tekst op een eigen regel: geen rechte apostrof en geen regeleinde erin. */
function tekst(s: string): string {
  return s.replace(/'/g, "’").replace(/\s+/g, " ").trim();
}

/** De rekenregels van één opbouw: een regel per laag en de som onder zijn symbool. */
function opbouwRegels(o: Opbouw, standaardNaam: string): string[] {
  const vlak = o.soort === "vlak";
  const eenheid = vlak ? "kN/m^2" : "kN/m";
  const symbool = typeof o.symbool === "string" && geldigSymbool(o.symbool) ? o.symbool : "";
  const naam = tekst(o.naam) || standaardNaam;
  const uit: string[] = [`## ${naam}${symbool ? ` (${symbool})` : ""}`];
  const termen: string[] = [];
  o.lagen.forEach((laag, i) => {
    const p = `p_${i + 1}`;
    const omschrijving = tekst(laag.naam);
    if (omschrijving) uit.push(`'${omschrijving}`);
    if (o.soort === "vlak") {
      const l = laag as { d: string; rho: string; p: string };
      const direct = getal(l.p);
      const d = getal(l.d);
      const rho = getal(l.rho);
      // Een ingevulde p gaat voor d × ρ, zoals in opbouw.ts.
      if (Number.isFinite(direct)) uit.push(`${p} = ${g(direct)} kN/m^2`);
      else if (Number.isFinite(d) && Number.isFinite(rho)) uit.push(`${p} = ${g(d)} m*${g(rho)} kN/m^3`);
      else uit.push(`${p} = 0 kN/m^2`);
    } else {
      const l = laag as { p: string; h: string; vulling: string };
      const pr = getal(l.p);
      const h = getal(l.h);
      const vulling = leesVulling(l.vulling);
      if (Number.isFinite(pr) && Number.isFinite(h)) {
        uit.push(`${p} = ${g(pr)} kN/m^2*${g(h)} m${vulling !== 1 ? `*${g(vulling)}` : ""}`);
      } else uit.push(`${p} = 0 kN/m`);
    }
    termen.push(p);
  });
  const som = termen.length ? termen.join(" + ") : `0 ${eenheid}`;
  if (symbool) uit.push("#global", `${symbool} = ${som}`, "#end global");
  else uit.push(`g = ${som}`);
  return uit;
}

/** 5.5 Blijvende belastingen als rekentekst. */
export function blijvendAlsRekentekst(b: Belastingen, kop: { vloerenDaken: string; wanden: string; zonderNaam: string }): string {
  const regels: string[] = [];
  if (b.vloerenDaken.length) {
    regels.push(`# ${tekst(kop.vloerenDaken)}`);
    for (const o of b.vloerenDaken) regels.push(...opbouwRegels(o, kop.zonderNaam));
  }
  if (b.wanden.length) {
    regels.push(`# ${tekst(kop.wanden)}`);
    for (const o of b.wanden) regels.push(...opbouwRegels(o, kop.zonderNaam));
  }
  return regels.join("\n") + "\n";
}

/** De regels van één belastingklasse: q_k (met de toeslag voor lichte scheidingswanden), Q_k en ψ. */
function klasseRegels(k: Belastingklasse, taal: string): string[] {
  const c = categorie(k.categorie);
  const symbool = typeof k.symbool === "string" && geldigSymbool(k.symbool) ? k.symbool : "";
  const naam = c ? tekst(inTaal(c.label, taal)) : tekst(k.categorie);
  const uit: string[] = [`## ${naam}${symbool ? ` (${symbool})` : ""}`];
  if (!c) {
    uit.push(`'Onbekende categorie: ${tekst(k.categorie)}`);
    return uit;
  }
  const w = klasseWaarden(k);
  if (w) uit.push(`'ψ_0 = ${g(w.psi[0])}, ψ_1 = ${g(w.psi[1])}, ψ_2 = ${g(w.psi[2])}`);
  let qk: string;
  if (c.soort === "dak") {
    const alfa = getal(k.dakhelling);
    if (Number.isFinite(alfa)) {
      uit.push(`α = ${g(alfa)}°`);
      uit.push(`q_k = ${g(dakQk(alfa))} kN/m^2`);
      qk = "q_k";
    } else {
      uit.push("'Geen dakhelling ingevuld: q_k is niet te bepalen.");
      return uit;
    }
  } else {
    if (w?.qk === null || w?.qk === undefined) {
      uit.push("'Geen q_k: vul de waarde in.");
      return uit;
    }
    uit.push(`q_k = ${g(w.qk)} kN/m^2`);
    const toeslag = getal(k.lichteScheidingswanden);
    if (k.lichteScheidingswanden.trim() && Number.isFinite(toeslag)) {
      uit.push("'Toeslag voor lichte scheidingswanden");
      uit.push(`Δq_k = ${g(toeslag)} kN/m^2`);
      qk = "q_k + Δq_k";
    } else qk = "q_k";
  }
  if (symbool) uit.push("#global", `${symbool} = ${qk}`, "#end global");
  if (w?.Qk !== null && w?.Qk !== undefined) uit.push(`Q_k = ${g(w.Qk)} kN`);
  return uit;
}

/** 5.4 Overige veranderlijke belastingen als rekentekst. */
export function veranderlijkAlsRekentekst(b: Belastingen, taal: string): string {
  const regels: string[] = [];
  for (const k of b.klassen) regels.push(...klasseRegels(k, taal));
  return regels.join("\n") + "\n";
}

/** De belastingen zonder dit onderdeel: dat staat daarna in het blad. */
export function zonderOnderdeel(b: Belastingen, onderdeel: Belastingonderdeel): Belastingen {
  return onderdeel === "blijvend" ? { ...b, vloerenDaken: [], wanden: [] } : { ...b, klassen: [] };
}
