import type { PoerDefinitie } from "./poerDefinitie.ts";

/*
 * De tekening van een tweepaalspoer als SVG-tekst: bovenaanzicht, langsdoorsnede door
 * de palen en dwarsdoorsnede boven een paal, met de maten, de paal- en kolomposities
 * en de werkelijk getoetste staven. Het beeld, de afdruk en de download gebruiken
 * dezelfde tekst. Alles staat in de SVG zelf: een los bestand heeft geen stijlblad.
 *
 * Hier wordt niet gerekend: alleen de definitie (poerDefinitie.ts) op schaal gezet.
 * Teksten komen van de aanroeper, in de taal van de app.
 *
 * Geen imports buiten de typen: het controlescript laadt dit bestand in Node.
 */

export interface TekeningTeksten {
  bovenaanzicht: string;
  langsdoorsnede: string;
  dwarsdoorsnede: string;
  trekband: string;
  beugels: string;
  zijstaven: string;
  bovenstaven: string;
  haarspelden: string;
  dwarsstaven: string;
  laag: string;
  lagen: string;
  hoh: string;
  rechteStaaf: string;
  omgebogen: string;
  been: string;
  doorn: string;
  sneden: string;
  perZijvlak: string;
  perPaal: string;
  perHelft: string;
  geen: string;
  dekkingOnder: string;
  dekkingZij: string;
  staafwerk: string;
  /**
   * Een maat in mm zoals hij op een maatlijn staat. Zonder deze functie het getal in mm;
   * de aanroeper geeft hem mee als het eenhedenstelsel van het project omrekent.
   */
  maat?: (mm: number) => string;
}

export interface Maat {
  /** Naam van de invoer in het blad. */
  naam: string;
  waarde: number;
  x: number;
  y: number;
  label: string;
}

export interface Tekening {
  svg: string;
  breedte: number;
  hoogte: number;
  /** De maten die het beeld klikbaar maakt; in de SVG staat dan alleen de maatlijn. */
  maten: Maat[];
}

const BETON = "#f3f4f6";
const LIJN = "#374151";
const PAAL = "#e2e8f0";
const KOLOM = "#dbeafe";
const KOLOM_LIJN = "#1e40af";
const TREK = "#b91c1c";
const BEUGEL = "#1d4ed8";
const OVERIG = "#0f766e";
const HAARSPELD = "#7c3aed";
const DWARSSTAAF = "#db2777";
const MAAT = "#2563eb";
const MODEL = "#b45309";
const TEKST = "#1f2937";

/** Smaller wordt de tekening onleesbaar: de marges blijven. Een smaller vak schaalt de hele tekening (TweepaalspoerDesigner.tsx). */
export const TEKENING_MIN_BREEDTE = 320;

/** De kleuren van de tekening; het 3D-model (poerIfcx.ts) gebruikt dezelfde. */
export const POER_KLEUREN = { paal: PAAL, kolom: KOLOM, trekband: TREK, beugel: BEUGEL, overig: OVERIG, haarspeld: HAARSPELD, dwarsstaaf: DWARSSTAAF };

const r = (w: number) => (Math.round(w * 100) / 100).toString();

/** XML-veilig: een vertaling of een getal mag de tekening niet openbreken. */
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const lijn = (x1: number, y1: number, x2: number, y2: number, kleur: string, breed: number, extra = "") =>
  `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke="${kleur}" stroke-width="${r(breed)}"${extra}/>`;
const rect = (x: number, y: number, w: number, h: number, vul: string, kleur: string, breed = 1, extra = "") =>
  `<rect x="${r(x)}" y="${r(y)}" width="${r(Math.max(0, w))}" height="${r(Math.max(0, h))}" fill="${vul}" stroke="${kleur}" stroke-width="${r(breed)}"${extra}/>`;
const cirkel = (x: number, y: number, straal: number, vul: string, kleur: string, breed = 1, extra = "") =>
  `<circle cx="${r(x)}" cy="${r(y)}" r="${r(Math.max(0, straal))}" fill="${vul}" stroke="${kleur}" stroke-width="${r(breed)}"${extra}/>`;
const tekst = (x: number, y: number, t: string, anker = "middle", kleur = TEKST, grootte = 11, extra = "") =>
  `<text x="${r(x)}" y="${r(y)}" text-anchor="${anker}" fill="${kleur}" font-size="${grootte}" font-family="Arial, Helvetica, sans-serif"${extra}>${esc(t)}</text>`;

const STREEP = ' stroke-dasharray="5 3"';

/** Horizontale maatlijn. Zonder tekst als de maat klikbaar wordt. */
function maatH(x0: number, x1: number, y: number, ext: number | null, t: string | null): string {
  const delen = [lijn(x0, y, x1, y, MAAT, 1), lijn(x0, y - 3, x0, y + 3, MAAT, 1.2), lijn(x1, y - 3, x1, y + 3, MAAT, 1.2)];
  if (ext !== null) delen.push(lijn(x0, ext, x0, y, MAAT, 0.6), lijn(x1, ext, x1, y, MAAT, 0.6));
  if (t !== null) delen.push(tekst((x0 + x1) / 2, y - 4, t, "middle", MAAT, 10));
  return delen.join("");
}

/** Verticale maatlijn. */
function maatV(y0: number, y1: number, x: number, ext: number | null, t: string | null): string {
  const delen = [lijn(x, y0, x, y1, MAAT, 1), lijn(x - 3, y0, x + 3, y0, MAAT, 1.2), lijn(x - 3, y1, x + 3, y1, MAAT, 1.2)];
  if (ext !== null) delen.push(lijn(ext, y0, x, y0, MAAT, 0.6), lijn(ext, y1, x, y1, MAAT, 0.6));
  if (t !== null) delen.push(`<text x="${r(x - 5)}" y="${r((y0 + y1) / 2)}" text-anchor="middle" fill="${MAAT}" font-size="10" font-family="Arial, Helvetica, sans-serif" transform="rotate(-90 ${r(x - 5)} ${r((y0 + y1) / 2)})">${esc(t)}</text>`);
  return delen.join("");
}

/**
 * Tekent de poer in een vlak van `breedte` pixels; de hoogte volgt uit de schaal.
 * `interactief`: de maten uit `maten` krijgen geen tekst, het beeld zet er knoppen op.
 */
export function tekenPoer(p: PoerDefinitie, t: TekeningTeksten, breedte: number, interactief = false): Tekening {
  const maten: Maat[] = [];
  const m = t.maat ?? r;
  const W = Math.max(TEKENING_MIN_BREEDTE, breedte);
  const mL = 46;
  const mR = 16;
  const tussen = 58;
  const beschikbaar = W - mL - mR - tussen;
  const s = beschikbaar / Math.max(1, p.l + p.b);

  const paalStomp = Math.max(26, 180 * s);
  const kolomStomp = Math.max(20, 140 * s);
  const titelH = 16;

  // ── indeling ──────────────────────────────────────────────────────────────
  const planY = titelH + 8;
  const planH = p.b * s;
  const maatPlan = planY + planH + 20;
  const langsTitel = maatPlan + 26;
  const kolomTop = langsTitel + 8;
  const poerTop = kolomTop + kolomStomp;
  const poerH = p.h * s;
  const poerOnder = poerTop + poerH;
  const paalOnder = poerOnder + paalStomp;
  const maatOnder = paalOnder + 18;
  const kolommen = W >= 560 ? 2 : 1;
  const legY = maatOnder + 20;
  const legRegels = 9;
  const H = legY + Math.ceil(legRegels / kolommen) * 13 + 2;

  const X = (x: number) => mL + (x + p.l / 2) * s;
  const Y = (y: number) => planY + planH / 2 - y * s;
  const Z = (z: number) => poerOnder - z * s;
  const x2 = mL + p.l * s + tussen;
  const XD = (y: number) => x2 + (y + p.b / 2) * s;

  const uit: string[] = [];
  uit.push(`<rect x="0" y="0" width="${r(W)}" height="${r(H)}" fill="#ffffff"/>`);

  const tb = p.trekband;
  const bg = p.beugels;
  const dT = Math.max(1.6, tb.d * s);
  const dS = Math.max(0.8, bg.d * s);
  const dZ = Math.max(1.2, p.zij.d * s);
  const dB = Math.max(1.2, p.boven.d * s);
  const dH = Math.max(1, p.haarspelden.d * s);
  const dw = p.dwarsstaven;
  const dD = Math.max(1, dw.d * s);

  // ── bovenaanzicht ─────────────────────────────────────────────────────────
  uit.push(tekst(mL, planY - 8, t.bovenaanzicht, "start", TEKST, 11, ' font-weight="700"'));
  uit.push(`<g data-aanzicht="boven">`);
  uit.push(rect(X(-p.l / 2), Y(p.b / 2), p.l * s, planH, BETON, LIJN, 1.4));
  for (const px of p.paalX) {
    uit.push(p.paal.rond
      ? cirkel(X(px), Y(0), (p.paal.x * s) / 2, "none", LIJN, 1, STREEP)
      : rect(X(px - p.paal.x / 2), Y(p.paal.y / 2), p.paal.x * s, p.paal.y * s, "none", LIJN, 1, STREEP));
    uit.push(lijn(X(px), Y(p.b / 2) - 6, X(px), Y(-p.b / 2) + 6, LIJN, 0.5, ' stroke-dasharray="8 3 2 3"'));
  }
  uit.push(p.kolom.rond
    ? cirkel(X(0), Y(0), (p.kolom.x * s) / 2, KOLOM, KOLOM_LIJN, 1.2, ' fill-opacity="0.55"')
    : rect(X(-p.kolom.x / 2), Y(p.kolom.y / 2), p.kolom.x * s, p.kolom.y * s, KOLOM, KOLOM_LIJN, 1.2, ' fill-opacity="0.55"'));
  for (const x of bg.x) {
    uit.push(`<line data-staaf="beugel" x1="${r(X(x))}" y1="${r(Y(bg.y[0] ?? 0))}" x2="${r(X(x))}" y2="${r(Y(bg.y[bg.y.length - 1] ?? 0))}" stroke="${BEUGEL}" stroke-width="${r(Math.max(0.7, dS * 0.8))}"/>`);
  }
  for (const y of [p.zij.y, -p.zij.y]) {
    if (p.zij.n > 0) uit.push(lijn(X(-p.l / 2 + p.c_z), Y(y), X(p.l / 2 - p.c_z), Y(y), OVERIG, Math.max(0.8, dZ * 0.8)));
  }
  tb.lagen.forEach((laag, i) => {
    for (const y of laag.y) {
      uit.push(`<line data-staaf="trekband" data-laag="${i + 1}" x1="${r(X(-tb.xEind[i]))}" y1="${r(Y(y))}" x2="${r(X(tb.xEind[i]))}" y2="${r(Y(y))}" stroke="${TREK}" stroke-width="${r(dT * 0.75)}"${i === 1 ? ' stroke-opacity="0.65"' : ""}/>`);
    }
  });
  dw.x.forEach((x) => {
    uit.push(`<line data-staaf="dwarsstaaf" x1="${r(X(x))}" y1="${r(Y(dw.y))}" x2="${r(X(x))}" y2="${r(Y(-dw.y))}" stroke="${DWARSSTAAF}" stroke-width="${r(Math.max(0.8, dD * 0.8))}"/>`);
  });
  uit.push(`</g>`);
  // maten van het bovenaanzicht
  const yMaatP = maatPlan;
  uit.push(maatH(X(p.paalX[0]), X(p.paalX[1]), yMaatP, Y(-p.b / 2), interactief ? null : m(p.a)));
  maten.push({ naam: "a_hoh", waarde: p.a, x: (X(p.paalX[0]) + X(p.paalX[1])) / 2, y: yMaatP, label: "a" });
  const overstek = (p.l - p.a) / 2;
  uit.push(maatH(X(-p.l / 2), X(p.paalX[0]), yMaatP, Y(-p.b / 2), overstek * s > 22 ? m(overstek) : null));
  uit.push(maatH(X(p.paalX[1]), X(p.l / 2), yMaatP, Y(-p.b / 2), overstek * s > 22 ? m(overstek) : null));
  uit.push(maatV(Y(p.b / 2), Y(-p.b / 2), mL - 14, X(-p.l / 2), interactief ? null : m(p.b)));
  maten.push({ naam: "b_poer", waarde: p.b, x: mL - 20, y: (Y(p.b / 2) + Y(-p.b / 2)) / 2, label: "b" });

  // ── snedelijnen: A-A door de palen, B-B boven de rechterpaal ──────────────
  const snede = (x1: number, y1: number, x2s: number, y2s: number, letter: string, lx: number, ly: number) =>
    lijn(x1, y1, x2s, y2s, TEKST, 1.6) + tekst(lx, ly, letter, "middle", TEKST, 10, ' font-weight="700"');
  uit.push(snede(X(-p.l / 2) - 10, Y(0), X(-p.l / 2) - 2, Y(0), "A", X(-p.l / 2) - 6, Y(0) - 3));
  uit.push(snede(X(p.l / 2) + 2, Y(0), X(p.l / 2) + 10, Y(0), "A", X(p.l / 2) + 6, Y(0) - 3));
  uit.push(snede(X(p.paalX[1]), Y(p.b / 2) - 9, X(p.paalX[1]), Y(p.b / 2) - 2, "B", X(p.paalX[1]) + 7, Y(p.b / 2) - 3));
  uit.push(snede(X(p.paalX[1]), Y(-p.b / 2) + 2, X(p.paalX[1]), Y(-p.b / 2) + 9, "B", X(p.paalX[1]) + 7, Y(-p.b / 2) + 11));

  // ── legenda, onder de tekening ────────────────────────────────────────────
  const lagenTekst = tb.lagen.length === 2 ? t.lagen : t.laag;
  const regels: [string, string][] = [
    [TREK, `${t.trekband}: ${tb.n}Ø${r(tb.d)}, ${tb.lagen.length} ${lagenTekst}, ${t.hoh} ${m(tb.s)}`],
    [TREK, tb.omgebogen ? `${t.omgebogen}, ${t.been} ${m(tb.lOp)}, ${t.doorn} ${m(tb.doorn)}` : t.rechteStaaf],
    [BEUGEL, `${t.beugels}: Ø${r(bg.d)}-${r(bg.s)}, ${r(bg.sneden)} ${t.sneden}`],
    [OVERIG, `${t.zijstaven}: ${p.zij.n > 0 ? `${p.zij.n}Ø${r(p.zij.d)} ${t.perZijvlak}` : t.geen}`],
    [OVERIG, `${t.bovenstaven}: ${p.boven.n > 0 ? `${p.boven.n}Ø${r(p.boven.d)}` : t.geen}`],
    [HAARSPELD, `${t.haarspelden}: ${p.haarspelden.n > 0 ? `${p.haarspelden.n}Ø${r(p.haarspelden.d)} ${t.perPaal}` : t.geen}`],
    [DWARSSTAAF, `${t.dwarsstaven}: ${dw.n > 0 ? `${dw.n}Ø${r(dw.d)} ${t.perHelft}` : t.geen}`],
    [TEKST, `${t.dekkingOnder} ${m(p.c_o)}, ${t.dekkingZij} ${m(p.c_z)}`],
    [MODEL, t.staafwerk],
  ];
  const perKolom = Math.ceil(regels.length / kolommen);
  regels.forEach(([kleur, regel], i) => {
    const kol = Math.floor(i / perKolom);
    uit.push(tekst(mL + (kol * (W - mL - mR)) / kolommen, legY + (i % perKolom) * 13, regel, "start", kleur, 10));
  });

  // ── langsdoorsnede door de palen ──────────────────────────────────────────
  uit.push(tekst(mL, langsTitel, t.langsdoorsnede, "start", TEKST, 11, ' font-weight="700"'));
  uit.push(`<g data-aanzicht="langs">`);
  for (const px of p.paalX) {
    const inb = p.paal.inbedding * s;
    uit.push(rect(X(px - p.paal.x / 2), poerOnder - inb, p.paal.x * s, paalStomp + inb, PAAL, LIJN, 1));
    uit.push(lijn(X(px), poerOnder - inb - 4, X(px), paalOnder + 4, LIJN, 0.5, ' stroke-dasharray="8 3 2 3"'));
  }
  uit.push(rect(X(-p.l / 2), poerTop, p.l * s, poerH, BETON, LIJN, 1.4, ' fill-opacity="0.85"'));
  for (const px of p.paalX) {
    if (p.paal.inbedding > 0) uit.push(lijn(X(px - p.paal.x / 2), poerOnder - p.paal.inbedding * s, X(px + p.paal.x / 2), poerOnder - p.paal.inbedding * s, LIJN, 1, STREEP));
  }
  uit.push(rect(X(-p.kolom.x / 2), kolomTop, p.kolom.x * s, kolomStomp, KOLOM, KOLOM_LIJN, 1.2));
  // beugels
  for (const x of bg.x) {
    uit.push(`<line data-staaf="beugel-langs" x1="${r(X(x))}" y1="${r(Z(bg.zOnder))}" x2="${r(X(x))}" y2="${r(Z(bg.zBoven))}" stroke="${BEUGEL}" stroke-width="${r(Math.max(0.7, dS))}"/>`);
  }
  // zijstaven en bovenstaven in de lengte
  for (const z of p.zij.z) uit.push(lijn(X(-p.l / 2 + p.c_z), Z(z), X(p.l / 2 - p.c_z), Z(z), OVERIG, Math.max(0.7, dZ * 0.7)));
  if (p.boven.n > 0) uit.push(lijn(X(-p.l / 2 + p.c_z), Z(p.boven.z), X(p.l / 2 - p.c_z), Z(p.boven.z), OVERIG, dB));
  // haarspelden, boven de paal
  for (const x of p.haarspelden.x) {
    uit.push(`<line data-staaf="haarspeld" x1="${r(X(x))}" y1="${r(Z(p.haarspelden.z))}" x2="${r(X(x))}" y2="${r(Z(p.haarspelden.zBoven))}" stroke="${HAARSPELD}" stroke-width="${r(dH)}"/>`);
  }
  // trekband, met de ombuiging
  tb.lagen.forEach((laag, i) => {
    const e = tb.xEind[i];
    const z = laag.z;
    const rb = ((tb.doorn + tb.d) / 2) * s;
    let pad: string;
    if (tb.omgebogen) {
      const tip = Z(z + tb.lOp);
      pad = `M ${r(X(-e))} ${r(tip)} L ${r(X(-e))} ${r(Z(z) - rb)} Q ${r(X(-e))} ${r(Z(z))} ${r(X(-e) + rb)} ${r(Z(z))} L ${r(X(e) - rb)} ${r(Z(z))} Q ${r(X(e))} ${r(Z(z))} ${r(X(e))} ${r(Z(z) - rb)} L ${r(X(e))} ${r(tip)}`;
    } else {
      pad = `M ${r(X(-e))} ${r(Z(z))} L ${r(X(e))} ${r(Z(z))}`;
    }
    uit.push(`<path data-staaf="trekband-langs" d="${pad}" fill="none" stroke="${TREK}" stroke-width="${r(dT)}" stroke-linejoin="round"/>`);
  });
  // dwarsstaven, op de diagonalen
  dw.x.forEach((x, i) => {
    uit.push(`<circle data-staaf="dwarsstaaf-langs" cx="${r(X(x))}" cy="${r(Z(dw.z[i]))}" r="${r(dD / 2)}" fill="${DWARSSTAAF}"/>`);
  });
  // het staafwerk uit het blad
  if (p.model) {
    const zT = tb.aT;
    const zD = zT + p.model.z;
    // De paalknoop op de plaats waarmee het blad rekent: met de paalafwijking naar buiten.
    const xKnoop = p.model.eK + p.model.lT;
    const links = `M ${r(X(-p.model.eK))} ${r(Z(zD))} L ${r(X(-xKnoop))} ${r(Z(zT))}`;
    const rechts = `M ${r(X(p.model.eK))} ${r(Z(zD))} L ${r(X(xKnoop))} ${r(Z(zT))}`;
    uit.push(`<path data-model="drukdiagonaal" d="${links} ${rechts}" fill="none" stroke="${MODEL}" stroke-width="1.4" stroke-dasharray="6 3"/>`);
    uit.push(lijn(X(-xKnoop), Z(zT), X(xKnoop), Z(zT), MODEL, 1, ' stroke-dasharray="2 3"'));
    uit.push(lijn(X(-p.model.eK), Z(zD), X(p.model.eK), Z(zD), MODEL, 1.4, ' stroke-dasharray="6 3"'));
    // Een witte rand om de tekst: hij staat tussen de beugels en de zijstaven.
    const HALO = ' paint-order="stroke" stroke="#ffffff" stroke-width="3" stroke-linejoin="round"';
    uit.push(tekst(X(-xKnoop) + (X(-p.model.eK) - X(-xKnoop)) * 0.5 + 8, Z((zT + zD) / 2) + 4, `θ = ${r(Math.round(p.model.hoek))}°`, "start", MODEL, 10, HALO));
    uit.push(tekst(X(0), Z(zT + p.model.z * 0.32), `z = ${m(Math.round(p.model.z))}, d = ${m(Math.round(p.model.d))}`, "middle", MODEL, 10, HALO));
  }
  uit.push(`</g>`);
  uit.push(maatH(X(-p.l / 2), X(p.l / 2), maatOnder, null, interactief ? null : m(p.l)));
  maten.push({ naam: "l_poer", waarde: p.l, x: X(0), y: maatOnder, label: "l" });
  uit.push(maatV(poerTop, poerOnder, mL - 14, X(-p.l / 2), interactief ? null : m(p.h)));
  maten.push({ naam: "h_poer", waarde: p.h, x: mL - 20, y: (poerTop + poerOnder) / 2, label: "h" });

  // ── dwarsdoorsnede boven een paal ─────────────────────────────────────────
  uit.push(tekst(W - mR, langsTitel, t.dwarsdoorsnede, "end", TEKST, 11, ' font-weight="700"'));
  uit.push(`<g data-aanzicht="dwars">`);
  const inb = p.paal.inbedding * s;
  uit.push(rect(XD(-p.paal.y / 2), poerOnder - inb, p.paal.y * s, paalStomp + inb, PAAL, LIJN, 1));
  uit.push(rect(XD(-p.b / 2), poerTop, p.b * s, poerH, BETON, LIJN, 1.4, ' fill-opacity="0.85"'));
  if (p.paal.inbedding > 0) uit.push(lijn(XD(-p.paal.y / 2), poerOnder - inb, XD(p.paal.y / 2), poerOnder - inb, LIJN, 1, STREEP));
  uit.push(rect(XD(-p.kolom.y / 2), kolomTop, p.kolom.y * s, kolomStomp, KOLOM, KOLOM_LIJN, 1.2));
  // beugels: één gesloten beugel per twee sneden, van buiten naar binnen; een oneven snede als los been
  const bys = bg.y;
  for (let i = 0; i < Math.floor(bys.length / 2); i++) {
    const a = bys[i], c = bys[bys.length - 1 - i];
    uit.push(`<rect data-staaf="beugel-dwars" x="${r(XD(a))}" y="${r(Z(bg.zBoven))}" width="${r((c - a) * s)}" height="${r((bg.zBoven - bg.zOnder) * s)}" rx="${r(Math.max(1.5, bg.d * 2 * s))}" fill="none" stroke="${BEUGEL}" stroke-width="${r(Math.max(0.8, dS))}"/>`);
  }
  if (bys.length % 2 === 1) {
    const midden = bys[(bys.length - 1) / 2];
    uit.push(lijn(XD(midden), Z(bg.zBoven), XD(midden), Z(bg.zOnder), BEUGEL, Math.max(0.8, dS)));
  }
  // haarspeld om de trekband
  if (p.haarspelden.n > 0) {
    const yH = Math.max(0, tb.lagen[0] ? (tb.lagen[0].y.length > 0 ? Math.max(...tb.lagen[0].y) : 0) : 0) + tb.d / 2 + p.haarspelden.d;
    const zTop = p.haarspelden.zBoven;
    const zLaag = p.haarspelden.z;
    uit.push(`<path data-staaf="haarspeld-dwars" d="M ${r(XD(-yH))} ${r(Z(zTop))} L ${r(XD(-yH))} ${r(Z(zLaag))} L ${r(XD(yH))} ${r(Z(zLaag))} L ${r(XD(yH))} ${r(Z(zTop))}" fill="none" stroke="${HAARSPELD}" stroke-width="${r(dH)}" stroke-linejoin="round"/>`);
  }
  // staven in doorsnede
  tb.lagen.forEach((laag) => {
    for (const y of laag.y) uit.push(`<circle data-staaf="trekband-dwars" cx="${r(XD(y))}" cy="${r(Z(laag.z))}" r="${r(dT / 2)}" fill="${TREK}"/>`);
  });
  for (const z of p.zij.z) {
    for (const y of [-p.zij.y, p.zij.y]) uit.push(`<circle data-staaf="zij-dwars" cx="${r(XD(y))}" cy="${r(Z(z))}" r="${r(dZ / 2)}" fill="${OVERIG}"/>`);
  }
  for (const y of p.boven.y) uit.push(`<circle data-staaf="boven-dwars" cx="${r(XD(y))}" cy="${r(Z(p.boven.z))}" r="${r(dB / 2)}" fill="${OVERIG}"/>`);
  uit.push(`</g>`);
  uit.push(maatH(XD(-p.b / 2), XD(p.b / 2), maatOnder, null, m(p.b)));

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${r(W)}" height="${r(H)}" viewBox="0 0 ${r(W)} ${r(H)}">${uit.join("")}</svg>`;
  return { svg, breedte: W, hoogte: H, maten };
}
