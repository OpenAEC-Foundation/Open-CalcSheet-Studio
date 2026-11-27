/**
 * De hoofdstukken van het rapport als rekentekst: elk hoofdstuk een blad waarvan de code
 * precies de opmaak van dat hoofdstuk in het rapport is. Gelezen uit de afdruk zelf (de
 * meetopstelling van het afdrukvoorbeeld), zodat de uitdraai van het blad gelijk is aan het
 * hoofdstuk. Elke regel is een tekstregel (`'…`) met een blok HTML; de rekenkern zet zo'n
 * regel letterlijk neer (renderer.ts).
 *
 * Hoofdstuk Belastingen wordt een canvasblad (store/canvasBlad.ts): elk stuk (een
 * paragraaf, een tabel, een groep opbouwen) een eenheid, onder elkaar met de hoogte die
 * het in het rapport heeft. Daarna kun je ze verslepen.
 *
 * De getallen die het rapport uitrekent (gemarkeerd met `R` in raster.tsx: K_FI, β, de
 * belastingfactoren, sneeuw, wind) worden in het blad weer uitgerekend: bovenaan staan de
 * rekenregels (REKENREGELS) achter `#hide`, en in de tekst staat de naam ('q_p:F2'), die
 * de rekentaal invult. De rest van de tekst staat er letterlijk.
 */
import { schrijfEenheden, stapelOnderElkaar, type Eenheid } from "../store/canvasBlad.ts";
import type { Belastingen, Opbouw } from "./model.ts";
import { categorie, klasseWaarden } from "./normwaarden.ts";
import { leesVulling } from "./opbouw.ts";

/** Het hoofdstuk dat een canvasblad wordt. */
export const CANVAS_HOOFDSTUK = "belastingen";

/** Een hoofdstuk: zijn anker, zijn titel zonder nummer, en de rekentekst; `canvas` voor een canvasblad. */
export interface HoofdstukBlad {
  anker: string;
  titel: string;
  bron: string;
  canvas: boolean;
}

/** Wat de omzetting van het rapport zelf nodig heeft: de invoer van 5.2 Wind. */
export interface RapportInvoer {
  /** De gebouwhoogte in m zoals getypt; leeg: geen q_p. */
  gebouwhoogte: string;
  /** De windcoëfficiënten c zoals getypt. */
  coefficienten: string[];
  /** De belastingklassen (5.4) en opbouwen (5.5) van het rapport. */
  belastingen?: Pick<Belastingen, "klassen" | "vloerenDaken" | "wanden">;
}

/**
 * 5.4 en 5.5 als rekentekst: wat in het rapport is ingevuld wordt een invoerveld, wat het
 * uitrekent een rekenregel, met dezelfde namen als in de opmaak (Belastingen.tsx). De
 * sommen gaan met `#global` onder hun symbool (g_v1, q_k1) naar elk blad.
 */
function belastingRegels(b: NonNullable<RapportInvoer["belastingen"]>): { invoer: string[]; reken: string[]; globaal: string[] } {
  const invoer: string[] = [];
  const reken: string[] = [];
  const globaal: string[] = [];
  const veld = (naam: string, waarde: string) => {
    const v = getal(waarde);
    if (v !== null) invoer.push(`${naam} = ?{${v}}`);
    return v !== null;
  };
  b.klassen.forEach((k, i) => {
    const nr = i + 1;
    const cat = categorie(k.categorie);
    if (!cat) return;
    if (cat.soort === "dak") {
      if (!veld(`α${nr}`, k.dakhelling)) return;
      reken.push(`#if α${nr} < 15`, `qd${nr} = 1`, `#else if α${nr} < 20`, `qd${nr} = 4 - 0.2*α${nr}`, "#else", `qd${nr} = 0`, "#end if");
      if (k.symbool) globaal.push(`${k.symbool} = qd${nr}`);
      return;
    }
    const kw = klasseWaarden(k);
    if (!kw || kw.qk === null) return;
    invoer.push(`qk${nr} = ?{${kw.qk}}`);
    if (kw.Qk !== null) invoer.push(`Qk${nr} = ?{${kw.Qk}}`);
    const metLs = k.lichteScheidingswanden.trim() !== "" && veld(`ls${nr}`, k.lichteScheidingswanden);
    if (metLs) reken.push(`qt${nr} = qk${nr} + ls${nr}`);
    if (k.symbool) globaal.push(`${k.symbool} = ${metLs ? `qt${nr}` : `qk${nr}`}`);
  });
  const opbouw = (o: Opbouw, sleutel: string) => {
    const termen: string[] = [];
    o.lagen.forEach((laag, j) => {
      const l = `${sleutel}_${j + 1}`;
      if (o.soort === "vlak") {
        const lg = laag as { d: string; rho: string; p: string };
        veld(`d${l}`, lg.d);
        veld(`ρ${l}`, lg.rho);
        if (lg.p.trim() && veld(`p${l}`, lg.p)) termen.push(`p${l}`);
        else if (getal(lg.d) !== null && getal(lg.rho) !== null) {
          reken.push(`p${l} = d${l}*ρ${l}`);
          termen.push(`p${l}`);
        }
      } else {
        const lg = laag as { p: string; h: string; vulling: string };
        const heeftP = veld(`pr${l}`, lg.p);
        const heeftH = veld(`h${l}`, lg.h);
        if (heeftP && heeftH) {
          invoer.push(`v${l} = ?{${leesVulling(lg.vulling)}}`);
          reken.push(`q${l} = pr${l}*h${l}*v${l}`);
          termen.push(`q${l}`);
        }
      }
    });
    reken.push(`g${sleutel} = ${termen.length ? termen.join(" + ") : "0"}`);
    if (o.symbool) globaal.push(`${o.symbool} = g${sleutel}`);
  };
  b.vloerenDaken.forEach((o, i) => opbouw(o, `v${i + 1}`));
  b.wanden.forEach((o, i) => opbouw(o, `w${i + 1}`));
  return { invoer, reken, globaal };
}

/** Een getal zoals getypt (met komma of punt) als rekentekst, of null. */
function getal(s: string): string | null {
  const v = Number(s.trim().replace(",", "."));
  return s.trim() && Number.isFinite(v) ? String(v) : null;
}

/**
 * De rekenregels per hoofdstuk: dezelfde rekensommen als het rapport (rapport/normwaarden.ts,
 * projectGegevens.ts), op de getallen die het rapport toont. CC, RC, DesignLife, K_FI,
 * windgebied en terreincategorie komen uit de projectgegevens. Zonder eenheden: het
 * rapport toont de getallen ook zonder.
 */
function rekenregels(anker: string, invoer: RapportInvoer): string[] {
  if (anker === "uitgangspunten") {
    return [
      "#hide",
      "#if DesignLife ≤ 5", "L_klasse = 1", "#else if DesignLife ≤ 15", "L_klasse = 2",
      "#else if DesignLife ≤ 50", "L_klasse = 3", "#else", "L_klasse = 4", "#end if",
      "#if RC ≡ 1", "β = 3.3", "#else if RC ≡ 3", "β = 4.3", "#else", "β = 3.8", "#end if",
      "#if CC ≡ 1", "γ_G = 1.1", "γ_Q = 1.35", "γ_Ga = 1.2",
      "#else if CC ≡ 3", "γ_G = 1.3", "γ_Q = 1.65", "γ_Ga = 1.5",
      "#else", "γ_G = 1.2", "γ_Q = 1.5", "γ_Ga = 1.35", "#end if",
      "#show",
    ];
  }
  if (anker === "belastingen") {
    const z = getal(invoer.gebouwhoogte);
    const regels: string[] = [];
    if (z !== null) regels.push("#pre", "'Gebouwhoogte voor 5.2 Wind [m]", `z = ?{${z}}`, "#post");
    regels.push(
      "#hide",
      "μ_1 = 0.8", "C_e = 1", "C_t = 1", "s_k = 0.7", "s = μ_1*C_e*C_t*s_k",
      "#if windgebied ≡ 1", "v_b0 = 29.5", "#else if windgebied ≡ 3", "v_b0 = 24.5", "#else", "v_b0 = 27", "#end if",
      "#if terreincategorie ≡ 1", "z_0 = 0.005", "z_min = 1",
      "#else if terreincategorie ≡ 3", "z_0 = 0.5", "z_min = 7",
      "#else", "z_0 = 0.2", "z_min = 4", "#end if",
    );
    if (z !== null) {
      regels.push(
        "z_e = max(z; z_min)",
        "k_r = 0.19*(z_0/0.05)^0.07",
        "v_m = k_r*ln(z_e/z_0)*v_b0",
        "I_v = 1/ln(z_e/z_0)",
        "q_p = (1 + 7*I_v)*0.5*1.25*v_m^2/1000",
      );
      invoer.coefficienten.forEach((c, i) => {
        const v = getal(c);
        if (v !== null) regels.push(`P_rep${i + 1} = ${v}*q_p`);
      });
    }
    // 5.4 en 5.5: invoer bovenaan (alleen op het scherm), de rekenregels en de symbolen verborgen.
    const lasten = invoer.belastingen ? belastingRegels(invoer.belastingen) : { invoer: [], reken: [], globaal: [] };
    regels.push(...lasten.reken);
    if (lasten.globaal.length) regels.push("#global", ...lasten.globaal, "#end global");
    regels.push("#show");
    return lasten.invoer.length ? ["#pre", "'Invoer voor 5.4 en 5.5", ...lasten.invoer, "#post", ...regels] : regels;
  }
  return [];
}

/**
 * Een getal dat het rapport uitrekent, als naam voor de rekentaal: `'q_p:F2'`. Een getal
 * waarvoor het blad geen rekenregel heeft (q_p zonder gebouwhoogte), blijft staan.
 */
function metRekenwaarden(html: string, bekend: ReadonlySet<string>): string {
  return html.replace(/<span data-reken="([^"]+)"(?: data-format="([^"]*)")?>([^<]*)<\/span>/g, (_heel, naam: string, format: string | undefined, tekst: string) =>
    bekend.has(naam) ? `'${naam}${format ? `:${format}` : ""}'` : tekst);
}

/** De namen die de rekenregels uitrekenen, en wat de projectgegevens al geven. */
function namenVan(regels: readonly string[]): Set<string> {
  const uit = new Set(["CC", "RC", "DesignLife", "K_FI"]);
  for (const r of regels) {
    const m = r.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*=/u);
    if (m) uit.add(m[1]);
  }
  return uit;
}

/** HTML op één regel, zonder rechte apostrof (die wisselt tussen tekst en rekenen) en zonder `$`. */
function regel(html: string, bekend: ReadonlySet<string> = new Set()): string {
  const tekst = html.replace(/\s*\n\s*/g, " ").replace(/'/g, "&#39;").replace(/\$/g, "&#36;");
  return "'" + metRekenwaarden(tekst, bekend);
}

/** Begint met dit stuk een hoofdstuk? Dan zijn kop: een h1 met een anker voor de inhoud. */
function hoofdstukKop(el: Element): HTMLElement | null {
  return el.querySelector<HTMLElement>("h1.rpa-h1[data-inhoud]");
}

/** Een stuk van een hoofdstuk: zijn HTML, zijn hoogte in mm, en of het een nieuwe sectie (vel) begint. */
interface Stuk {
  html: string;
  hoogte: number;
  nieuweSectie: boolean;
}

/** px naar mm, bij 96 px per inch. */
const MM = 25.4 / 96;

/**
 * De hoofdstukken uit de afdruk van het rapport (`.rpa-wortel`): alles tussen de kop van een
 * hoofdstuk en de volgende, tot bijlage A. Voorblad, situatie en inhoud vallen erbuiten.
 */
export function hoofdstukkenUitAfdruk(wortel: HTMLElement, invoer: RapportInvoer = { gebouwhoogte: "", coefficienten: [] }): HoofdstukBlad[] {
  const stijl = wortel.getAttribute("style") ?? "";
  const open = regel(`<div class="rpa-wortel rpa-in-blad" style="${stijl.replace(/"/g, "&quot;")}">`);
  const sluit = regel("</div>");
  const hoofdstukken: { anker: string; titel: string; stukken: Stuk[] }[] = [];
  for (const sectie of Array.from(wortel.children)) {
    if (sectie.tagName !== "SECTION") continue;
    if (sectie.classList.contains("rpa-bijlagekop")) break;
    let eerste = true;
    for (const stuk of Array.from(sectie.children)) {
      const kop = hoofdstukKop(stuk);
      if (kop) {
        const titel = (kop.textContent ?? "").trim().replace(/^\d+\s+/, "");
        hoofdstukken.push({ anker: kop.dataset.inhoud ?? "", titel, stukken: [] });
        eerste = true;
      }
      const h = hoofdstukken[hoofdstukken.length - 1];
      if (!h) continue;
      h.stukken.push({ html: stuk.outerHTML, hoogte: (stuk as HTMLElement).offsetHeight * MM, nieuweSectie: eerste });
      eerste = false;
    }
  }
  return hoofdstukken.map(({ anker, titel, stukken }) => {
    const reken = rekenregels(anker, invoer);
    const bekend = namenVan(reken);
    if (anker === CANVAS_HOOFDSTUK) {
      // Elk stuk een eenheid, met de opmaak van het rapport eromheen; onder elkaar. De
      // rekenregels staan in de eerste: die rekent als eerste, en de rest ziet ze.
      const eenheden: Eenheid[] = stukken.map((s, i) => ({
        id: `h${i + 1}`, x: 0, y: 0,
        tekst: [...(i === 0 ? reken : []), open, regel('<section class="rpa-sectie">'), regel(s.html, bekend), regel("</section>"), sluit].join("\n"),
      }));
      const hoogte = new Map(eenheden.map((e, i) => [e.id, stukken[i].hoogte]));
      return { anker, titel, canvas: true, bron: schrijfEenheden(stapelOnderElkaar(eenheden, (e) => hoogte.get(e.id))) + "\n" };
    }
    const regels = [...reken, open];
    const begin = regels.length;
    for (const s of stukken) {
      if (s.nieuweSectie && regels.length > begin) regels.push(regel("</section>"));
      if (s.nieuweSectie) regels.push(regel('<section class="rpa-sectie">'));
      regels.push(regel(s.html, bekend));
    }
    regels.push(regel("</section>"), sluit);
    return { anker, titel, canvas: false, bron: regels.join("\n") + "\n" };
  });
}
