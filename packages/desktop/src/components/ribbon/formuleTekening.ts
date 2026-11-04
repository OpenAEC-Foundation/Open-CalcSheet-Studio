/**
 * De tekeningen in de fragmenten van de formulebibliotheek (formules.ts): rekentaal die
 * in het blad terechtkomt en daar met de invoer meebeweegt. Een fragment is tekst, dus
 * hier is geen nieuw mechanisme: `#hide`-regels rekenen de maten uit en een `@svg`-blok
 * vult ze in met `{{naam}}`, net als in library/ec3/moment.nl.cpd.
 *
 * Drie afspraken gelden voor elke tekening:
 *
 *   - **Een eigen voorvoegsel.** Elk fragment noemt zijn hulpvariabelen `tl3_…` of
 *     `td5_…`. Ze staan in de scope van het hele blad en mogen geen waarde van een
 *     ander fragment raken.
 *   - **De getallen komen uit het fragment.** Een momentenlijn gebruikt `M_max`, `M_A`,
 *     `R_A`, … en rekent niet zelf nog eens `q·L²/8` uit; verandert de gebruiker een
 *     formule, dan volgt de lijn.
 *   - **Eerst de vraag of er getekend kan worden.** `…_ok` staat op 0 en wordt alleen 1
 *     als alle waarden eindig zijn en de eenheden kloppen; een regel die mislukt, laat
 *     de 0 staan. Daarmee komt een NaN of een niet-ingevulde `{{…}}` nooit op het blad,
 *     ook niet met de waarden van een eerder exemplaar van hetzelfde fragment.
 *
 * Schaal: de grootste maat vult het vak, dus een tekening valt er nooit buiten.
 *
 * Een kromme staat er als Bézierkromme en dus exact: een kwadratische Bézier met het
 * stuurpunt midden tussen de eindpunten is een parabool, een kubische met de stuurpunten
 * op een derde een derdegraads lijn. Een stuurpunt ligt niet op de lijn zelf; vandaar de
 * uitdrukkingen als `2*M_max`.
 *
 * Puur tekst, zonder React: scripts/check-formules.mjs rekent de tekeningen na.
 */

export type Taal = "nl" | "en";
type Woord = Record<Taal, string>;

/** `code` en `codeEn` van een fragment, uit dezelfde regels. */
export const tweetalig = (maak: (t: Taal) => string): { code: string; codeEn: string } => ({ code: maak("nl"), codeEn: maak("en") });

// ─── Stijl: dezelfde kleuren als de tekeningen in library/ ──────────

const TEKST = "fill:#52525b";
const TEKST_KLEIN = "fill:#71717a; font-size:10px";
const MAATLIJN = "fill:none; stroke:#52525b";
const AS = "stroke:#71717a";
const VORM = "fill:#d4d4d8; stroke:#36363e";
const LAST = "stroke:#1d4ed8; stroke-width:1.5";
const LAST_VLAK = "fill:#1d4ed8";
const LAST_TEKST = "fill:#1d4ed8";
const OPLEGGING = "fill:#f5f5f4; stroke:#36363e";
const OPLEGLIJN = "fill:none; stroke:#36363e";
const MOMENT_VLAK = "fill:#fbbf77; fill-opacity:0.6; stroke:#d97706; stroke-width:1.5; stroke-linejoin:round";
const MOMENT_TEKST = "fill:#b45309; font-weight:700";

const kader = (b: number, h: number) => `<svg class="lib-tekening" viewBox="0 0 ${b} ${h}" style="width:100%; max-width:${b}px; font-size:12px;">`;
const rond = (n: number) => String(Number(n.toFixed(1)));

/** `M_veld,1` met de index eronder, zoals in de bestaande tekeningen. `rest` staat erachter: `= 5 kN/m`. */
function benoemd(naam: string, rest: string): string {
  const k = naam.indexOf("_");
  if (k < 0) return `${naam} ${rest}`;
  return `${naam.slice(0, k)}<tspan dy="3" font-size="9">${naam.slice(k + 1)}</tspan><tspan dy="-3"> ${rest}</tspan>`;
}

/**
 * De voorvraag, de hulpvariabelen achter `#hide` en de tekening in een `#if`.
 * `eindig`: uitdrukkingen zonder eenheid die een eindig getal moeten geven. `§` in
 * `hulp` en `svg` wordt het voorvoegsel van het fragment.
 */
function tekeningBlok(t: Taal, o: {
  p: string;
  uitleg: Woord;
  eindig: Iterable<string>;
  geldig?: string;
  reden?: Woord;
  hulp: string[];
  svg: string[];
}): string[] {
  const ok = "§ok";
  const som = [...new Set(o.eindig)].map((e) => `abs(${e})`).join(" + ");
  const voorwaarde = [`${som} < 1e30`, ...(o.geldig ? [o.geldig] : [])].join(" and ");
  const reden = o.reden ?? { nl: "Geen tekening: controleer de invoer.", en: "No drawing: check the input." };
  return [
    "#hide",
    `// ${o.uitleg[t]}`,
    `${ok} = 0`,
    `${ok} = ${voorwaarde}`,
    ...o.hulp,
    "#show",
    `#if ${ok}`,
    "@svg",
    ...o.svg,
    "@end",
    "#else",
    `'<small>${reden[t]}</small>`,
    "#end if",
  ].map((r) => r.replace(/§/g, `${o.p}_`));
}

// ─── Liggers ────────────────────────────────────────────────────────

const LIGGER_B = 400;
const LIGGER_H = 204;
const X0 = 40;
const XB = 320;
const Y_BALK = 54;
const Y_MOMENT = 102;
const H_MOMENT = 64;
const Y_MAAT = 82;

/** Een plaats op de ligger: een vast deel van de hele lengte (0 tot 1), of een uitdrukking met een lengte. */
export type Plek = number | string;

export interface Oplegging {
  x: Plek;
  soort: "scharnier" | "rol" | "klem";
  naam: string;
}

export interface LiggerSpec {
  /** Voorvoegsel van de hulpvariabelen, zonder underscore. */
  p: string;
  /** De hele lengte als uitdrukking: `L`, `L + a`, `2*L`. */
  lengte: string;
  steunen: Oplegging[];
  last: { q: string; driehoek?: boolean } | { F: string; op: Plek[] };
  maten: { van: Plek; tot: Plek; naam: string; waarde: string }[];
  /**
   * De momentenlijn, van links naar rechts. `M` is de waarde in dat punt (leeg is 0), als
   * uitdrukking in kN·m. `via` geeft de stuurpunten naar dit punt toe: één voor een
   * parabool, twee voor een derdegraads lijn; zonder `via` is het een recht stuk.
   */
  lijn: { x: Plek; M?: string; via?: { x: Plek; M?: string }[] }[];
  /** De getallen bij de lijn. `als`: alleen in beeld onder deze voorwaarde. */
  getallen: { x: Plek; M: string; naam: string; kant?: "links" | "rechts"; als?: string }[];
  /** Een snede op afstand x, met het moment en de dwarskracht daar. */
  snede?: { x: string; M: string; V: string };
  /** Een voorwaarde waaronder de lijn klopt; anders geen tekening maar `reden`. */
  geldig?: string;
  reden?: Woord;
}

const scharnier = [
  `<path d="M0 ${Y_BALK + 2}L-8 ${Y_BALK + 16}H8Z" style="${OPLEGGING}"/>`,
  `<path d="M-11 ${Y_BALK + 16}H11" style="${OPLEGLIJN}"/>`,
];
const rol = [
  `<path d="M0 ${Y_BALK + 2}L-8 ${Y_BALK + 14}H8Z" style="${OPLEGGING}"/>`,
  `<path d="M-11 ${Y_BALK + 18}H11" style="${OPLEGLIJN}"/>`,
];
/** Een inklemming: de muur met arcering aan de buitenkant; `kant` -1 links, 1 rechts. */
const klem = (kant: 1 | -1) => [
  `<path d="M0 ${Y_BALK - 16}V${Y_BALK + 16}M0 ${Y_BALK - 12}l${7 * kant} -6M0 ${Y_BALK - 4}l${7 * kant} -6M0 ${Y_BALK + 4}l${7 * kant} -6M0 ${Y_BALK + 12}l${7 * kant} -6" style="${OPLEGLIJN}; stroke-width:1.5"/>`,
];

/**
 * De tekening van een ligger: boven de ligger met last en opleggingen, daaronder de
 * momentenlijn op schaal. Tekenrichting zoals gebruikelijk in de Nederlandse
 * constructiepraktijk: het moment staat aan de trekzijde, dus een positief veldmoment
 * onder de ligger (naar beneden) en een negatief steunmoment erboven.
 */
export function liggerTekening(t: Taal, s: LiggerSpec): string[] {
  const eindig = new Set<string>();
  const hulpX: string[] = [];
  const hulpM: string[] = [];
  const hulpY: string[] = [];

  /** Een waarde in de tekening: een vast getal, of de naam van een hulpvariabele. */
  const inSvg = (v: string) => (/^-?[\d.]+$/.test(v) ? v : `{{${v}}}`);

  const xNamen = new Map<string, string>();
  let dynamisch = false;
  /** Het pixelpunt van een plaats op de ligger, als getal of als naam. */
  const px = (x: Plek): string => {
    if (typeof x === "number") return rond(X0 + XB * x);
    dynamisch = true;
    let naam = xNamen.get(x);
    if (!naam) {
      naam = `§x${xNamen.size + 1}`;
      eindig.add(`(${x})/m`);
      hulpX.push(`${naam} = ${X0} + (${x})/m*§sx`);
      xNamen.set(x, naam);
    }
    return naam;
  };

  const mNamen = new Map<string, string>();
  /** Het moment als getal in kN·m, uit de uitdrukking van het fragment. */
  const mom = (expr: string): string => {
    let naam = mNamen.get(expr);
    if (!naam) {
      naam = `§m${mNamen.size + 1}`;
      eindig.add(`(${expr})/(kN*m)`);
      hulpM.push(`${naam} = (${expr})/(kN*m)`);
      mNamen.set(expr, naam);
    }
    return naam;
  };

  const yNamen = new Map<string, string>();
  /** De y van een moment. Aan de trekzijde: positief naar beneden, dus optellen bij de nullijn. */
  const y = (expr?: string): string => {
    if (!expr) return "§y0";
    let naam = yNamen.get(expr);
    if (!naam) {
      naam = `§y${yNamen.size + 1}`;
      hulpY.push(`${naam} = §y0 + ${mom(expr)}*§sm`);
      yNamen.set(expr, naam);
    }
    return naam;
  };

  // De lijn en de getallen.
  let d = "";
  s.lijn.forEach((p, i) => {
    const naar = `${inSvg(px(p.x))} ${inSvg(y(p.M))}`;
    if (i === 0) {
      d = `M${inSvg(px(p.x))} {{§y0}}L${naar}`;
      return;
    }
    const via = p.via ?? [];
    const stuur = via.map((v) => `${inSvg(px(v.x))} ${inSvg(y(v.M))}`).join(" ");
    d += via.length === 0 ? `L${naar}` : `${via.length === 1 ? "Q" : "C"}${stuur} ${naar}`;
  });
  d += `L${inSvg(px(s.lijn[s.lijn.length - 1].x))} {{§y0}}Z`;

  const uiterst = new Set<string>();
  for (const p of s.lijn) if (p.M) uiterst.add(mom(p.M));

  const getallen: string[] = [];
  const hulpT: string[] = [];
  s.getallen.forEach((g, i) => {
    const expr = g.als ? `if(${g.als}; ${g.M}; 0 kN*m)` : g.M;
    const m = mom(expr);
    uiterst.add(m);
    const ty = `§t${i + 1}`;
    // Onder een positief moment, boven een negatief: dan staat het getal buiten het vlak.
    hulpT.push(`${ty} = ${y(expr)} + if(${m} < 0; -6; 14)`);
    let tx: string;
    let anker = "middle";
    if (g.kant === "links") {
      tx = "4";
      anker = "start";
    } else if (g.kant === "rechts") {
      tx = "396";
      anker = "end";
    } else if (typeof g.x === "number") {
      tx = rond(Math.max(70, Math.min(330, X0 + XB * g.x)));
    } else {
      tx = `§w${i + 1}`;
      hulpT.push(`${tx} = max(70; min(330; ${px(g.x)}))`);
    }
    let stijl = MOMENT_TEKST;
    if (g.als) {
      hulpT.push(`§o${i + 1} = if(${g.als}; 1; 0)`);
      stijl += `; opacity:{{§o${i + 1}}}`;
    }
    getallen.push(`<text x="${inSvg(tx)}" y="{{${ty}}}" text-anchor="${anker}" style="${stijl}">${benoemd(g.naam, `= {{${m}}} kNm`)}</text>`);
  });

  // De snede: een streeplijn door de ligger tot op de momentenlijn, met M en V erbij.
  const snede: string[] = [];
  if (s.snede) {
    const xs = px(s.snede.x);
    const ys = y(s.snede.M);
    const mx = mom(s.snede.M);
    eindig.add(`(${s.snede.V})/kN`);
    hulpT.push(`§vx = (${s.snede.V})/kN`, `§tx = max(130; min(270; ${xs}))`, `§ty = §y0 - 6`);
    snede.push(
      `<path d="M${inSvg(xs)} ${Y_BALK}V${inSvg(ys)}" style="${AS}; stroke-dasharray:4 3"/>`,
      `<circle cx="${inSvg(xs)}" cy="${inSvg(ys)}" r="2.5" style="fill:#b45309"/>`,
      `<text x="{{§tx}}" y="{{§ty}}" dx="-6" text-anchor="end" style="${MOMENT_TEKST}">${benoemd("M_x", `= {{${mx}}} kNm`)}</text>`,
      `<text x="{{§tx}}" y="{{§ty}}" dx="6" style="${TEKST}">${benoemd("V_x", "= {{§vx}} kN")}</text>`,
    );
  }

  // De last.
  const last: string[] = [];
  const hulpL: string[] = [];
  if ("q" in s.last) {
    eindig.add(`(${s.last.q})/(kN/m)`);
    hulpL.push(`§q = (${s.last.q})/(kN/m)`);
    const xs = Array.from({ length: 9 }, (_, i) => X0 + (XB * i) / 8);
    const boven = s.last.driehoek
      ? (x: number) => Y_BALK - 4 - ((x - X0) / XB) * 26
      : () => Y_BALK - 24;
    const pijlen = xs.filter((x) => Y_BALK - 2 - boven(x) > 8);
    last.push(
      `<path d="${pijlen.map((x) => `M${x} ${rond(boven(x))}V${Y_BALK - 8}`).join("")}M${X0} ${rond(boven(X0))}L${X0 + XB} ${rond(boven(X0 + XB))}" style="${LAST}"/>`,
      `<path d="${pijlen.map((x) => `M${x} ${Y_BALK - 2}l-3 -7h6z`).join("")}" style="${LAST_VLAK}"/>`,
      `<text x="${s.last.driehoek ? X0 + XB : X0 + XB / 2}" y="${s.last.driehoek ? Y_BALK - 36 : Y_BALK - 30}" text-anchor="${s.last.driehoek ? "end" : "middle"}" style="${LAST_TEKST}">q = {{§q}} kN/m</text>`,
    );
  } else {
    eindig.add(`(${s.last.F})/kN`);
    hulpL.push(`§f = (${s.last.F})/kN`);
    s.last.op.forEach((x, i) => {
      const xp = px(x);
      // Rechts van de pijl, en voorbij het midden links ervan: dan blijft de tekst in het vak.
      const ta = `§a${i + 1}`;
      hulpL.push(`${ta} = if(${xp} < 260; "start"; "end")`);
      const dx = `§d${i + 1}`;
      hulpL.push(`${dx} = if(${xp} < 260; 6; -6)`);
      last.push(
        `<g class="tk-puntlast" transform="translate(${inSvg(xp)} 0)">`,
        `  <path d="M0 ${Y_BALK - 38}V${Y_BALK - 8}" style="${LAST}"/>`,
        `  <path d="M0 ${Y_BALK - 2}l-4 -8h8z" style="${LAST_VLAK}"/>`,
        `  <text x="{{${dx}}}" y="${Y_BALK - 30}" text-anchor="{{${ta}}}" style="${LAST_TEKST}">F = {{§f}} kN</text>`,
        "</g>",
      );
    });
  }

  // De opleggingen.
  const opleggingen: string[] = [];
  s.steunen.forEach((o) => {
    const xp = px(o.x);
    const rechts = o.x === 1;
    const vorm = o.soort === "scharnier" ? scharnier : o.soort === "rol" ? rol : klem(rechts ? 1 : -1);
    const tekstX = rechts ? -12 : 12;
    opleggingen.push(
      `<g class="tk-steun" transform="translate(${inSvg(xp)} 0)">`,
      ...vorm.map((r) => `  ${r}`),
      `  <text x="${tekstX}" y="${Y_BALK + 15}" text-anchor="${rechts ? "end" : "start"}" style="${TEKST}">${o.naam}</text>`,
      "</g>",
    );
  });

  // De maten.
  const maten: string[] = [];
  const hulpMaat: string[] = [];
  s.maten.forEach((m, i) => {
    const a = px(m.van);
    const b = px(m.tot);
    eindig.add(`(${m.waarde})/m`);
    hulpMaat.push(`§l${i + 1} = (${m.waarde})/m`);
    let midden: string;
    if (typeof m.van === "number" && typeof m.tot === "number") {
      midden = rond(X0 + (XB * (m.van + m.tot)) / 2);
    } else {
      midden = `§c${i + 1}`;
      hulpMaat.push(`${midden} = max(34; min(366; (${a} + ${b})/2))`);
    }
    maten.push(
      `<path d="M${inSvg(a)} ${Y_MAAT}H${inSvg(b)}M${inSvg(a)} ${Y_MAAT - 4}V${Y_MAAT + 4}M${inSvg(b)} ${Y_MAAT - 4}V${Y_MAAT + 4}" style="${MAATLIJN}"/>`,
      `<text x="${inSvg(midden)}" y="${Y_MAAT - 3}" text-anchor="middle" style="${TEKST}">${m.naam} = {{§l${i + 1}}} m</text>`,
    );
  });

  const namen = [...uiterst];
  const hulp = [
    ...(dynamisch ? [`§sx = ${XB}/max((${s.lengte})/m; 1e-9)`] : []),
    ...hulpX,
    ...hulpM,
    `§mp = max(0; ${namen.join("; ")})`,
    `§mn = max(0; ${namen.map((n) => `-${n}`).join("; ")})`,
    `§sm = ${H_MOMENT}/max(§mp + §mn; 1e-9)`,
    `§y0 = ${Y_MOMENT} + §mn*§sm`,
    ...hulpY,
    ...hulpT,
    ...hulpL,
    ...hulpMaat,
  ];
  eindig.add(`(${s.lengte})/m`);

  const bijschrift: Woord = {
    nl: "Momentenlijn aan de trekzijde: positief naar beneden",
    en: "Bending moment on the tension side: positive downwards",
  };
  return tekeningBlok(t, {
    p: s.p,
    uitleg: {
      nl: "Tekening. De momentenlijn staat aan de trekzijde, dus een positief moment onder de ligger (naar beneden).",
      en: "Drawing. The bending moment is drawn on the tension side, so a positive moment below the beam (downwards).",
    },
    eindig,
    geldig: s.geldig,
    reden: s.reden,
    hulp,
    svg: [
      kader(LIGGER_B, LIGGER_H),
      ...last,
      `<path d="M${X0} ${Y_BALK}H${X0 + XB}" style="stroke:#36363e; stroke-width:3"/>`,
      ...opleggingen,
      ...maten,
      `<path class="tk-moment" d="${d}" style="${MOMENT_VLAK}"/>`,
      `<line class="tk-nul" x1="${X0}" y1="{{§y0}}" x2="${X0 + XB}" y2="{{§y0}}" style="stroke:#36363e"/>`,
      `<text x="${X0 + XB + 6}" y="{{§y0}}" dy="4" style="${TEKST}">M</text>`,
      ...snede,
      ...getallen,
      `<text x="${LIGGER_B / 2}" y="${LIGGER_H - 4}" text-anchor="middle" style="${TEKST_KLEIN}">${bijschrift[t]}</text>`,
      "</svg>",
    ],
  });
}

/** De doorbuiging: rekent niet met E·I = 0, want 0/0 zou NaN op het blad geven. */
export function doorbuiging(t: Taal, ...regels: string[]): string[] {
  const melding: Woord = { nl: "E·I is 0: geen doorbuiging te berekenen.", en: "E·I is 0: no deflection to compute." };
  return ["#if E*I_y > 0 N*mm^2", ...regels, "#else", `'${melding[t]}`, "#end if"];
}

// ─── Doorsneden ─────────────────────────────────────────────────────

const VAK_B = 340;
const VAK_H = 216;
const CX = 185;
const CY = 100;
/** De grootste maat van een doorsnede in pixels. */
const GROOTSTE = 150;

const WOORD: Record<string, Woord> = {
  zwaartelijn: { nl: "zwaartelijn", en: "centroidal axis" },
  hartlijn: { nl: "hartlijn", en: "centre line" },
  as: { nl: "as", en: "axis" },
  vervangend: { nl: "Rechthoek met dezelfde", en: "Rectangle with the same" },
  en: { nl: "en", en: "and" },
};

/** De maten van het omhullende vak om (CX, CY): breedte §w, hoogte §v, en de zijden. */
const vakRegels = (w: string, v: string) => [
  `§w = ${w}`,
  `§v = ${v}`,
  `§l = ${CX} - §w/2`,
  `§r = ${CX} + §w/2`,
  `§t = ${CY} - §v/2`,
  `§o = ${CY} + §v/2`,
];

/** De zwaartelijn en de hartlijn: over de hele tekening, op een vaste plaats of op `zy`. */
const assen = (t: Taal, zy = String(CY), zwaarteNaam = "y", hartNaam = "z") => [
  `<line class="tk-zwaartelijn" x1="8" y1="${zy}" x2="{{§ze}}" y2="${zy}" style="${AS}; stroke-dasharray:8 4"/>`,
  `<line class="tk-hartlijn" x1="${CX}" y1="10" x2="${CX}" y2="190" style="${AS}; stroke-dasharray:12 3 2 3"/>`,
  `<text x="8" y="${zy}" dy="-4" style="${TEKST_KLEIN}">${benoemd(zwaarteNaam, "").replace(/^/, `${WOORD.zwaartelijn[t]} `)}</text>`,
  `<text x="${CX + 4}" y="18" style="${TEKST_KLEIN}">${WOORD.hartlijn[t]} ${hartNaam}</text>`,
];

/** Een liggende maatlijn onder de vorm. */
const maatOnder = (tekst: string) => [
  `<g transform="translate(0 {{§o}})">`,
  `  <path d="M{{§l}} 16H{{§r}}M{{§l}} 12V20M{{§r}} 12V20" style="${MAATLIJN}"/>`,
  `  <text x="${CX}" y="30" text-anchor="middle" style="${TEKST}">${tekst}</text>`,
  "</g>",
];

/** Een staande maatlijn rechts van de vorm, van `van` tot `tot`; de tekst staat op `y`. */
const maatRechts = (tekst: string, van = "{{§t}}", tot = "{{§o}}", y = String(CY)) => [
  `<g transform="translate({{§r}} 0)">`,
  `  <path d="M16 ${van}V${tot}M12 ${van}H20M12 ${tot}H20" style="${MAATLIJN}"/>`,
  `  <text transform="translate(30 ${y}) rotate(-90)" text-anchor="middle" style="${TEKST}">${tekst}</text>`,
  "</g>",
];

const doorsnedeBlok = (t: Taal, o: { p: string; eindig: string[]; geldig?: string; reden?: Woord; hulp: string[]; svg: string[] }) =>
  tekeningBlok(t, {
    ...o,
    uitleg: { nl: "Tekening op schaal: de grootste maat is 150 pixels.", en: "Drawing to scale: the largest dimension is 150 pixels." },
    // De assen lopen net voorbij de vorm, tot vlak voor de maatlijn rechts.
    hulp: [...o.hulp, "§ze = §r + 10"],
    svg: [kader(VAK_B, VAK_H), ...o.svg, "</svg>"],
  });

export const rechthoekTekening = (t: Taal) => doorsnedeBlok(t, {
  p: "td1",
  eindig: ["b/mm", "h/mm"],
  hulp: [
    `§s = ${GROOTSTE}/max(b/mm; h/mm; 1e-9)`,
    "§b = b/mm",
    "§h = h/mm",
    ...vakRegels("max(§b; 0)*§s", "max(§h; 0)*§s"),
  ],
  svg: [
    `<rect class="tk-vorm" x="{{§l}}" y="{{§t}}" width="{{§w}}" height="{{§v}}" style="${VORM}"/>`,
    ...assen(t),
    ...maatOnder("b = {{§b}} mm"),
    ...maatRechts("h = {{§h}} mm"),
  ],
});

export const cirkelTekening = (t: Taal) => doorsnedeBlok(t, {
  p: "td2",
  eindig: ["d/mm"],
  hulp: [
    "§d = d/mm",
    `§s = ${GROOTSTE}/max(§d; 1e-9)`,
    "§R = max(§d; 0)*§s/2",
    ...vakRegels("2*§R", "2*§R"),
  ],
  svg: [
    `<circle class="tk-vorm" cx="${CX}" cy="${CY}" r="{{§R}}" style="${VORM}"/>`,
    ...assen(t),
    ...maatOnder("d = {{§d}} mm"),
  ],
});

export const buisTekening = (t: Taal) => doorsnedeBlok(t, {
  p: "td3",
  eindig: ["D/mm", "t/mm"],
  hulp: [
    "§d = D/mm",
    "§m = t/mm",
    `§s = ${GROOTSTE}/max(§d; 1e-9)`,
    "§R = §d*§s/2",
    // Een dunne wand blijft zichtbaar: minstens 1,5 pixel.
    "§ri = max(§R - max(§m*§s; 1.5); 0)",
    ...vakRegels("2*§R", "2*§R"),
    `§il = ${CX} - §ri`,
    `§ir = ${CX} + §ri`,
    "§tt = §t + 11",
  ],
  svg: [
    `<path class="tk-vorm" d="M{{§l}} ${CY}A{{§R}} {{§R}} 0 1 0 {{§r}} ${CY}A{{§R}} {{§R}} 0 1 0 {{§l}} ${CY}ZM{{§il}} ${CY}A{{§ri}} {{§ri}} 0 1 0 {{§ir}} ${CY}A{{§ri}} {{§ri}} 0 1 0 {{§il}} ${CY}Z" style="${VORM}; fill-rule:evenodd"/>`,
    ...assen(t),
    `<text x="{{§l}}" y="{{§tt}}" dx="-2" text-anchor="end" style="${TEKST}">t = {{§m}} mm</text>`,
    ...maatOnder("D = {{§d}} mm"),
  ],
});

export const kokerTekening = (t: Taal) => doorsnedeBlok(t, {
  p: "td4",
  eindig: ["b/mm", "h/mm", "t/mm"],
  hulp: [
    "§b = b/mm",
    "§h = h/mm",
    "§m = t/mm",
    `§s = ${GROOTSTE}/max(§b; §h; 1e-9)`,
    ...vakRegels("§b*§s", "§h*§s"),
    "§d = min(max(§m*§s; 1.5); min(§w; §v)/2)",
    "§il = §l + §d",
    "§ir = §r - §d",
    "§it = §t + §d",
    "§io = §o - §d",
    "§tt = §t + 11",
  ],
  svg: [
    `<path class="tk-vorm" d="M{{§l}} {{§t}}H{{§r}}V{{§o}}H{{§l}}ZM{{§il}} {{§it}}H{{§ir}}V{{§io}}H{{§il}}Z" style="${VORM}; fill-rule:evenodd"/>`,
    ...assen(t),
    `<text x="{{§l}}" y="{{§tt}}" dx="-6" text-anchor="end" style="${TEKST}">t = {{§m}} mm</text>`,
    ...maatOnder("b = {{§b}} mm"),
    ...maatRechts("h = {{§h}} mm"),
  ],
});

/**
 * Een I- of H-profiel: één pad met bogen tussen lijf en flens. De afronding is begrensd
 * door wat er tussen lijf en flensrand past, zodat de omtrek bij elke invoer gesloten blijft.
 */
export const iProfielTekening = (t: Taal) => doorsnedeBlok(t, {
  p: "td5",
  eindig: ["h/mm", "b/mm", "t_w/mm", "t_f/mm", "r/mm"],
  hulp: [
    "§h = h/mm",
    "§b = b/mm",
    "§tw = t_w/mm",
    "§tf = t_f/mm",
    "§ra = r/mm",
    `§s = ${GROOTSTE}/max(§h; §b; 1e-9)`,
    ...vakRegels("§b*§s", "§h*§s"),
    // Een dun lijf of een dunne flens blijft zichtbaar: minstens 1,5 pixel.
    "§f = min(max(§tf*§s; 1.5); §v/2)",
    "§d = min(max(§tw*§s; 1.5); §w)",
    "§ro = max(min(§ra*§s; min((§w - §d)/2; §v/2 - §f)); 0)",
    `§a = ${CX} - §d/2`,
    `§c = ${CX} + §d/2`,
    "§xa = §a - §ro",
    "§xc = §c + §ro",
    "§y1 = §t + §f",
    "§y2 = §o - §f",
    "§y3 = §y1 + §ro",
    "§y4 = §y2 - §ro",
    "§tt = §t + 11",
    `§ty = ${CY} - §v/4`,
  ],
  svg: [
    `<path class="tk-vorm" d="M{{§l}} {{§t}}H{{§r}}V{{§y1}}H{{§xc}}A{{§ro}} {{§ro}} 0 0 0 {{§c}} {{§y3}}V{{§y4}}A{{§ro}} {{§ro}} 0 0 0 {{§xc}} {{§y2}}H{{§r}}V{{§o}}H{{§l}}V{{§y2}}H{{§xa}}A{{§ro}} {{§ro}} 0 0 0 {{§a}} {{§y4}}V{{§y3}}A{{§ro}} {{§ro}} 0 0 0 {{§xa}} {{§y1}}H{{§l}}Z" style="${VORM}"/>`,
    ...assen(t),
    // De kleine maten links van het lijf: rechts staat de maatlijn van h.
    `<text x="{{§l}}" y="{{§tt}}" dx="-6" text-anchor="end" style="${TEKST}">${benoemd("t_f", "= {{§tf}} mm")}</text>`,
    `<text x="{{§a}}" y="{{§ty}}" dx="-5" text-anchor="end" style="${TEKST}">${benoemd("t_w", "= {{§tw}} mm")}</text>`,
    `<text x="{{§xa}}" y="{{§y2}}" dx="-3" dy="-5" text-anchor="end" style="${TEKST}">r = {{§ra}} mm</text>`,
    ...maatOnder("b = {{§b}} mm"),
    ...maatRechts("h = {{§h}} mm"),
  ],
});

export const driehoekTekening = (t: Taal) => doorsnedeBlok(t, {
  p: "td6",
  eindig: ["b/mm", "h/mm", "z_c/mm"],
  hulp: [
    "§b = b/mm",
    "§h = h/mm",
    "§zc = z_c/mm",
    `§s = ${GROOTSTE}/max(§b; §h; 1e-9)`,
    ...vakRegels("max(§b; 0)*§s", "max(§h; 0)*§s"),
    // z_c staat vanaf de basis: omhoog is in de tekening minder y.
    "§zy = §o - §zc*§s",
    "§zm = (§zy + §o)/2 + 4",
    "§zx = §l - 16",
  ],
  svg: [
    `<polygon class="tk-vorm" points="${CX},{{§t}} {{§r}},{{§o}} {{§l}},{{§o}}" style="${VORM}"/>`,
    ...assen(t, "{{§zy}}"),
    `<g transform="translate({{§l}} 0)">`,
    `  <path d="M-12 {{§zy}}V{{§o}}M-16 {{§zy}}H-8M-16 {{§o}}H-8" style="${MAATLIJN}"/>`,
    "</g>",
    // Liggend onder de zwaartelijn: staand zou de tekst de zwaartelijn kruisen.
    `<text x="{{§zx}}" y="{{§zm}}" dx="-2" text-anchor="end" style="${TEKST}">${benoemd("z_c", "= {{§zc}} mm")}</text>`,
    ...maatOnder("b = {{§b}} mm"),
    ...maatRechts("h = {{§h}} mm"),
  ],
});

/**
 * De verschuivingsstelling rekent zonder vorm, dus staat hier de rechthoek die hetzelfde
 * oppervlak en traagheidsmoment heeft: h = √(12·I₀/A) en b = A/h.
 */
export const steinerTekening = (t: Taal) => doorsnedeBlok(t, {
  p: "td7",
  eindig: ["I_0/mm^4", "A/mm^2", "a/mm", "I_y/cm^4"],
  geldig: "A > 0 mm^2 and I_0 > 0 mm^4",
  reden: { nl: "Geen tekening: A en I₀ moeten groter zijn dan 0.", en: "No drawing: A and I₀ must be greater than 0." },
  hulp: [
    "§hq = sqrt(12*I_0/A)/mm",
    "§bq = (A/mm^2)/§hq",
    "§a = a/mm",
    "§iy = I_y/cm^4",
    `§s = ${GROOTSTE}/max(§hq + abs(§a); §bq; 1e-9)`,
    "§w = §bq*§s",
    "§v = §hq*§s",
    `§l = ${CX} - §w/2`,
    `§r = ${CX} + §w/2`,
    // De zwaartelijn en de as liggen om het midden: zo past elke a, ook een negatieve.
    `§zy = ${CY} - §a*§s/2`,
    `§as = ${CY} + §a*§s/2`,
    "§t = §zy - §v/2",
  ],
  svg: [
    `<rect class="tk-vorm" x="{{§l}}" y="{{§t}}" width="{{§w}}" height="{{§v}}" style="${VORM}"/>`,
    ...assen(t, "{{§zy}}", "y_0"),
    `<line class="tk-as" x1="8" y1="{{§as}}" x2="{{§ze}}" y2="{{§as}}" style="stroke:#1d4ed8; stroke-dasharray:8 4"/>`,
    `<text x="8" y="{{§as}}" dy="12" style="fill:#1d4ed8; font-size:10px">${WOORD.as[t]} y</text>`,
    ...maatRechts("a = {{§a}} mm", "{{§zy}}", "{{§as}}"),
    `<text x="${CX}" y="196" text-anchor="middle" style="fill:#b45309; font-weight:700">${benoemd("I_y", "= {{§iy}} cm⁴")}</text>`,
    `<text x="${VAK_B / 2}" y="${VAK_H - 4}" text-anchor="middle" style="${TEKST_KLEIN}">${WOORD.vervangend[t]} A ${WOORD.en[t]} I₀</text>`,
  ],
});

/** Twee rechthoeken met dezelfde A en I als de delen, op hun plaats z vanaf de bovenkant. */
export const samengesteldTekening = (t: Taal) => doorsnedeBlok(t, {
  p: "td8",
  eindig: ["A_1/mm^2", "z_1/mm", "I_1/mm^4", "A_2/mm^2", "z_2/mm", "I_2/mm^4", "z_c/mm"],
  hulp: [
    "§h1 = if(A_1 > 0 mm^2; sqrt(12*max(I_1/mm^4; 0)/(A_1/mm^2)); 0)",
    "§h2 = if(A_2 > 0 mm^2; sqrt(12*max(I_2/mm^4; 0)/(A_2/mm^2)); 0)",
    "§b1 = if(§h1 > 0; (A_1/mm^2)/§h1; 0)",
    "§b2 = if(§h2 > 0; (A_2/mm^2)/§h2; 0)",
    "§z1 = z_1/mm",
    "§z2 = z_2/mm",
    "§zc = z_c/mm",
    // De bovenkant z = 0 hoort erbij: daar worden de z-maten vanaf gemeten.
    "§zb = min(0; §z1 - §h1/2; §z2 - §h2/2)",
    "§zo = max(0; §z1 + §h1/2; §z2 + §h2/2)",
    `§s = ${GROOTSTE}/max(§zo - §zb; §b1; §b2; 1e-9)`,
    `§y0 = ${CY} - (§zb + §zo)/2*§s`,
    "§w1 = §b1*§s",
    "§w2 = §b2*§s",
    "§v1 = §h1*§s",
    "§v2 = §h2*§s",
    `§l1 = ${CX} - §w1/2`,
    `§l2 = ${CX} - §w2/2`,
    "§t1 = §y0 + (§z1 - §h1/2)*§s",
    "§t2 = §y0 + (§z2 - §h2/2)*§s",
    "§c1 = §y0 + §z1*§s",
    "§c2 = §y0 + §z2*§s",
    "§zy = §y0 + §zc*§s",
    `§r = ${CX} + max(§w1; §w2)/2`,
    "§tm = max(60; min(150; (§y0 + §zy)/2))",
  ],
  svg: [
    `<rect class="tk-vorm" x="{{§l1}}" y="{{§t1}}" width="{{§w1}}" height="{{§v1}}" style="${VORM}"/>`,
    `<rect class="tk-vorm" x="{{§l2}}" y="{{§t2}}" width="{{§w2}}" height="{{§v2}}" style="${VORM}"/>`,
    `<circle cx="${CX}" cy="{{§c1}}" r="2" style="fill:#36363e"/>`,
    `<circle cx="${CX}" cy="{{§c2}}" r="2" style="fill:#36363e"/>`,
    ...assen(t, "{{§zy}}"),
    `<text x="{{§l1}}" y="{{§c1}}" dx="-6" dy="4" text-anchor="end" style="${TEKST}">${benoemd("z_1", "= {{§z1}} mm")}</text>`,
    `<text x="{{§l2}}" y="{{§c2}}" dx="-6" dy="4" text-anchor="end" style="${TEKST}">${benoemd("z_2", "= {{§z2}} mm")}</text>`,
    ...maatRechts(benoemd("z_c", "= {{§zc}} mm"), "{{§y0}}", "{{§zy}}", "{{§tm}}"),
    `<text x="${VAK_B / 2}" y="${VAK_H - 4}" text-anchor="middle" style="${TEKST_KLEIN}">${WOORD.vervangend[t]} A ${WOORD.en[t]} I</text>`,
  ],
});

/** De traagheidsstraal als afstand tot de zwaartelijn, in de rechthoek met dezelfde A en I. */
export const traagheidsstraalTekening = (t: Taal) => doorsnedeBlok(t, {
  p: "td9",
  eindig: ["I_z/mm^4", "A/mm^2", "i_z/mm"],
  hulp: [
    "§hq = sqrt(12*I_z/A)/mm",
    "§bq = (A/mm^2)/§hq",
    "§iz = i_z/mm",
    `§s = ${GROOTSTE}/max(§hq; §bq; 1e-9)`,
    ...vakRegels("§bq*§s", "§hq*§s"),
    `§ib = ${CY} - §iz*§s`,
    `§io = ${CY} + §iz*§s`,
    `§tm = ${CY} + §iz*§s/2`,
  ],
  svg: [
    `<rect class="tk-vorm" x="{{§l}}" y="{{§t}}" width="{{§w}}" height="{{§v}}" style="${VORM}"/>`,
    ...assen(t, String(CY), "z", "y"),
    `<path d="M8 {{§ib}}H{{§ze}}M8 {{§io}}H{{§ze}}" style="stroke:#b45309; stroke-dasharray:4 3"/>`,
    ...maatRechts(benoemd("i_z", "= {{§iz}} mm"), String(CY), "{{§io}}", "{{§tm}}"),
    `<text x="${VAK_B / 2}" y="${VAK_H - 4}" text-anchor="middle" style="${TEKST_KLEIN}">${WOORD.vervangend[t]} A ${WOORD.en[t]} I</text>`,
  ],
});
