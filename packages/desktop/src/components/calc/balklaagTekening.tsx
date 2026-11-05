import type { ReactNode } from "react";
import i18next from "i18next";
import { useTranslation } from "react-i18next";

/**
 * Tekenbouwstenen voor het parametrische beeld van de balklaag.
 *
 * De krachtenlijnen volgen de gangbare conventie van een raamwerkprogramma:
 * een gevuld vlak tussen de as en de lijn, het moment aan de trekzijde (een
 * veldmoment dus onder de as), de dwarskracht met arcering en een plus- of
 * minteken per vak, en de waarden bij de uitersten en de steunpunten. Lasten
 * zijn rijen pijlen met een bovenlijn en een label in de tekening zelf.
 */

export const KLEUR_M = { lijn: "#dc2626", vlak: "rgba(239, 68, 68, 0.22)" };
export const KLEUR_V = { lijn: "#2563eb", vlak: "rgba(59, 130, 246, 0.20)" };
export const KLEUR_U = { lijn: "#2563eb", licht: "#93c5fd" };
const OPL = { vulling: "#fbbf24", lijn: "#92400e" };

/** Een getal in de notatie van de taal, zonder taal die van de app: "6,28" in het Nederlands, "6.28" anders. */
export const nl = (v: number, dec = 2, taal: string | undefined = i18next.language) => {
  const t = (Number.isFinite(v) ? v : 0).toFixed(dec);
  return taal?.startsWith("nl") ? t.replace(".", ",") : t;
};

/** Tekst met een witte rand, zodat hij leesbaar blijft boven lijnen en vlakken. */
export function Label(props: {
  x: number; y: number; kleur: string; children: ReactNode;
  anker?: "start" | "middle" | "end"; vet?: boolean; grootte?: number;
}) {
  const { x, y, kleur, children, anker = "middle", vet = true, grootte = 11 } = props;
  return (
    <text x={x} y={y} textAnchor={anker} fontSize={grootte} fontWeight={vet ? 700 : 400} fill={kleur}
      stroke="#ffffff" strokeWidth={3} strokeLinejoin="round" paintOrder="stroke">
      {children}
    </text>
  );
}

/** Oplegging onder een balkas op (x, y): scharnier of rol, amberkleurig met grondarcering. */
export function Oplegging({ x, y, soort, g = 8 }: { x: number; y: number; soort: "scharnier" | "rol"; g?: number }) {
  const hT = soort === "rol" ? 1.5 * g : 1.9 * g;
  const yG = soort === "rol" ? y + hT + 2 * 3 + 1 : y + hT;
  return (
    <g>
      <polygon points={`${x},${y} ${x - g},${y + hT} ${x + g},${y + hT}`}
        fill={OPL.vulling} stroke={OPL.lijn} strokeWidth={1.3} strokeLinejoin="round" />
      {soort === "rol" && (
        <>
          <circle cx={x - g * 0.45} cy={y + hT + 3} r={2.8} fill={OPL.vulling} stroke={OPL.lijn} strokeWidth={1.1} />
          <circle cx={x + g * 0.45} cy={y + hT + 3} r={2.8} fill={OPL.vulling} stroke={OPL.lijn} strokeWidth={1.1} />
        </>
      )}
      <line x1={x - g - 4} y1={yG} x2={x + g + 4} y2={yG} stroke={OPL.lijn} strokeWidth={1.3} />
      {[0, 1, 2, 3, 4].map((i) => (
        <line key={i} x1={x - g - 2 + i * ((2 * g + 4) / 4)} y1={yG} x2={x - g - 6 + i * ((2 * g + 4) / 4)} y2={yG + 5}
          stroke={OPL.lijn} strokeWidth={0.8} />
      ))}
    </g>
  );
}

/**
 * Gelijkmatig verdeelde last: een rij pijlen van `yTop` naar de bovenkant van
 * de balk (`yBalk`), verbonden door een bovenlijn, met het label erboven.
 */
export function LijnLast(props: {
  x1: number; x2: number; yTop: number; yBalk: number; kleur: string; label?: ReactNode; labelX?: number;
}) {
  const { x1, x2, yTop, yBalk, kleur, label, labelX } = props;
  const n = Math.max(6, Math.round((x2 - x1) / 38));
  const stap = (x2 - x1) / n;
  const kop = 7;
  return (
    <g>
      <line x1={x1} y1={yTop} x2={x2} y2={yTop} stroke={kleur} strokeWidth={2} strokeLinecap="round" />
      {Array.from({ length: n + 1 }, (_, i) => {
        const px = x1 + i * stap;
        return (
          <g key={i}>
            <line x1={px} y1={yTop} x2={px} y2={yBalk - kop} stroke={kleur} strokeWidth={1.8} />
            <polygon points={`${px},${yBalk} ${px - 3.6},${yBalk - kop - 1} ${px + 3.6},${yBalk - kop - 1}`} fill={kleur} />
          </g>
        );
      })}
      {label && <Label x={labelX ?? (x1 + x2) / 2} y={yTop - 6} kleur={kleur}>{label}</Label>}
    </g>
  );
}

/** Geconcentreerde last van boven op de balk. */
export function PuntLast(props: { x: number; yTop: number; yBalk: number; kleur: string; label: ReactNode }) {
  const { x, yTop, yBalk, kleur, label } = props;
  return (
    <g>
      <line x1={x} y1={yTop} x2={x} y2={yBalk - 9} stroke="#ffffff" strokeWidth={6} />
      <line x1={x} y1={yTop} x2={x} y2={yBalk - 9} stroke={kleur} strokeWidth={2.6} />
      <polygon points={`${x},${yBalk} ${x - 5.5},${yBalk - 11} ${x + 5.5},${yBalk - 11}`} fill={kleur} />
      <Label x={x} y={yTop - 5} kleur={kleur}>{label}</Label>
    </g>
  );
}

export interface LijnLabel {
  /** Plaats langs de balk in mm vanaf het begin. */
  x: number;
  /** Waarde op die plaats, in de eenheid van de lijn. */
  v: number;
  tekst: string;
  /** Uitlijning en verschuiving, voor twee waarden op dezelfde plaats (een sprong). */
  anker?: "start" | "middle" | "end";
  dx?: number;
  /** Het label naast het punt, op zijn hoogte, in plaats van erboven of eronder. */
  naast?: boolean;
  /** Verticale verschuiving van het label in px, omlaag positief. */
  dy?: number;
}

/**
 * Een krachtenlijn als gevuld vlak.
 *
 * `f` geeft de waarde op afstand x (mm) vanaf het begin. `omlaag` tekent een
 * positieve waarde onder de as: zo hangt een veldmoment aan de trekzijde. De
 * sprongen in een dwarskrachtenlijn komen mee via `breekpunten`: daar wordt
 * vlak links en vlak rechts van het punt bemonsterd.
 */
export function KrachtenLijn(props: {
  x1: number; x2: number; tot: number; asY: number; schaal: number;
  f: (x: number) => number; omlaag: boolean; kleur: { lijn: string; vlak: string };
  breekpunten?: number[]; arcering?: boolean; tekens?: boolean; labels?: LijnLabel[];
}) {
  const { x1, x2, tot, asY, schaal, f, omlaag, kleur, breekpunten = [], arcering, tekens, labels = [] } = props;
  const X = (x: number) => x1 + ((x2 - x1) * x) / Math.max(tot, 1e-9);
  const richting = omlaag ? 1 : -1;
  const Y = (v: number) => asY + richting * v * schaal;
  const eps = tot * 1e-6;
  const xs = new Set<number>();
  const N = 160;
  for (let i = 0; i <= N; i++) xs.add((tot * i) / N);
  for (const b of breekpunten) {
    if (b > eps) xs.add(b - eps);
    if (b < tot - eps) xs.add(b + eps);
  }
  const rij = [...xs].sort((a, b) => a - b);
  const punten = rij.map((x) => `${X(x)},${Y(f(x))}`);
  const vlak = `${X(0)},${asY} ${punten.join(" ")} ${X(tot)},${asY}`;

  // arcering loodrecht op de as, om de 10 px
  const arceerLijnen: ReactNode[] = [];
  if (arcering) {
    const n = Math.floor((x2 - x1) / 10);
    for (let i = 1; i < n; i++) {
      const x = (tot * i) / n;
      const y = Y(f(x));
      if (Math.abs(y - asY) > 2) {
        arceerLijnen.push(<line key={i} x1={X(x)} y1={asY} x2={X(x)} y2={y} stroke={kleur.lijn} strokeWidth={0.6} opacity={0.7} />);
      }
    }
  }

  // Plus- en mintekens: één per aaneengesloten stuk met hetzelfde teken binnen
  // een vak, in het midden van dat stuk en halverwege de as en de lijn. Waar
  // het vlak te laag of te smal is voor een teken, blijft het weg.
  const tekenLabels: ReactNode[] = [];
  if (tekens) {
    const grenzen = [0, ...breekpunten.filter((b) => b > eps && b < tot - eps), tot].sort((a, b) => a - b);
    const piek = Math.max(...rij.map((x) => Math.abs(f(x))), 1e-9);
    const plaats = (stuk: number[], sleutel: string) => {
      if (stuk.length < 2 || Math.abs(X(stuk[stuk.length - 1]) - X(stuk[0])) < 16) return;
      const x = stuk[Math.floor(stuk.length / 2)];
      const v = f(x);
      if (Math.abs(v * schaal) < 13) return;
      tekenLabels.push(
        <text key={sleutel} x={X(x)} y={(asY + Y(v)) / 2 + 4.5} textAnchor="middle" fontSize={13} fontWeight={700}
          fill="#111827" stroke="#ffffff" strokeWidth={3} strokeLinejoin="round" paintOrder="stroke">
          {v > 0 ? "+" : "−"}
        </text>,
      );
    };
    for (let i = 0; i < grenzen.length - 1; i++) {
      const a = grenzen[i] + eps, b = grenzen[i + 1] - eps;
      let stuk: number[] = [];
      let teken = 0;
      for (let k = 0; k <= 80; k++) {
        const x = a + ((b - a) * k) / 80;
        const v = f(x);
        const s = Math.abs(v) > 0.05 * piek ? Math.sign(v) : 0;
        if (s !== teken) {
          if (teken !== 0) plaats(stuk, `${i}-${k}`);
          stuk = [];
          teken = s;
        }
        if (s !== 0) stuk.push(x);
      }
      if (teken !== 0) plaats(stuk, `${i}-eind`);
    }
  }

  // De lijn loopt aan beide uiteinden terug naar de as: een dwarskrachtenlijn
  // begint en eindigt met een sprong bij de oplegging.
  const omtrek = `${X(0)},${asY} ${punten.join(" ")} ${X(tot)},${asY}`;

  return (
    <g>
      <polygon points={vlak} fill={kleur.vlak} stroke="none" />
      {arceerLijnen}
      <polyline points={omtrek} fill="none" stroke={kleur.lijn} strokeWidth={2.5} strokeLinejoin="round" />
      <line x1={x1 - 8} y1={asY} x2={x2 + 8} y2={asY} stroke="#374151" strokeWidth={1.4} />
      {tekenLabels}
      {labels.map((l, i) => {
        const y = Y(l.v);
        const boven = richting * l.v < 0; // lijn ligt boven de as: label erboven
        return (
          <g key={i}>
            <circle cx={X(l.x)} cy={y} r={2.4} fill={kleur.lijn} />
            <Label x={X(l.x) + (l.dx ?? 0)} y={(l.naast ? y + 4 : boven ? y - 7 : y + 14) + (l.dy ?? 0)} kleur={kleur.lijn} anker={l.anker}>{l.tekst}</Label>
          </g>
        );
      })}
    </g>
  );
}

/**
 * Per vak tussen twee grenzen het grootste positieve en het kleinste negatieve
 * punt van een lijn. Een waarde op een grens die twee vakken delen (een
 * steunmoment) komt maar één keer terug.
 */
export function extremen(f: (x: number) => number, grenzen: number[], n = 240): { x: number; v: number }[] {
  const uit: { x: number; v: number }[] = [];
  let piek = 0;
  for (let i = 0; i < grenzen.length - 1; i++) {
    const a = grenzen[i], b = grenzen[i + 1];
    for (let k = 0; k <= n; k++) piek = Math.max(piek, Math.abs(f(a + ((b - a) * k) / n)));
  }
  const tot = grenzen[grenzen.length - 1] - grenzen[0];
  const dubbel = (p: { x: number; v: number }) =>
    uit.some((q) => Math.abs(q.x - p.x) < 0.01 * tot && Math.abs(q.v - p.v) < 0.01 * piek);
  for (let i = 0; i < grenzen.length - 1; i++) {
    const a = grenzen[i], b = grenzen[i + 1];
    let max = { x: a, v: 0 }, min = { x: a, v: 0 };
    for (let k = 0; k <= n; k++) {
      const x = a + ((b - a) * k) / n;
      const v = f(x);
      if (v > max.v) max = { x, v };
      if (v < min.v) min = { x, v };
    }
    for (const p of [max, min]) {
      if (Math.abs(p.v) > 0.03 * piek && !dubbel(p)) uit.push(p);
    }
  }
  return uit;
}

/** Waarden net binnen de randen van elk vak: de sprongen van een dwarskrachtenlijn. */
export function randwaarden(f: (x: number) => number, grenzen: number[]): { x: number; v: number; kant: number }[] {
  const tot = grenzen[grenzen.length - 1] - grenzen[0];
  const eps = tot * 1e-6;
  const alle: { x: number; v: number; kant: number }[] = [];
  for (let i = 0; i < grenzen.length - 1; i++) {
    alle.push({ x: grenzen[i], v: f(grenzen[i] + eps), kant: 1 });
    alle.push({ x: grenzen[i + 1], v: f(grenzen[i + 1] - eps), kant: -1 });
  }
  const piek = Math.max(...alle.map((p) => Math.abs(p.v)), 1e-9);
  return alle.filter((p) => Math.abs(p.v) > 0.03 * piek);
}

/**
 * Maten van de plattegrond in mm, en het label van de raveelbalk (met het
 * profiel). Het label komt vertaald van de designer: de labelkolom groeit mee
 * met de lengte ervan, dus de maten en de tekening moeten hetzelfde label zien.
 */
export interface RaveelInvoer {
  bSparing: number; lStaart: number; hoh: number; bBalk: number; label?: string;
  /** Overspanning van de wisselbalk, hart op hart; zonder (een ouder blad) een stomp met een breeklijn. */
  lW?: number;
  /** Breedte per wisselbalk en het aantal balken; standaard twee balken als de balklaag. */
  bW?: number; nW?: number;
  /** Lengte van de sparing langs de balken; 0: tot de oplegging, één raveelbalk. */
  lSparing?: number;
}

/*
 * Vaste zones rond de plattegrond (px): een zijmarge, links de maat van de sparing,
 * rechts de labelkolom, boven de maat van de strook en onder de twee maatketens.
 */
const ZONE = { zij: 12, links: 62, rechts: 135, boven: 22, onder: 62 };
/** In een smal paneel: een verklaring van vijf regels onder de tekening, in plaats van de labelkolom. */
const LEGENDA = 5 * 14 + 8;
const MAAT_KLEUR = "#2563eb", MAAT_TEKST = "#1d4ed8";

/** Getekende lengte voorbij de raveelbalk als de overspanning niet bekend is. */
const stomp = (lStaart: number) => Math.max(1000, 0.6 * lStaart);

/** De hele lengte in mm, en of dat de echte overspanning is. */
function lengteVan(p: RaveelInvoer) {
  const heel = !!p.lW && p.lW > p.lStaart;
  return { heel, L: heel ? (p.lW as number) : p.lStaart + stomp(p.lStaart) };
}

/** De maat dwars op de balken in mm: de sparing, de wisselbalken en een doorgaande balk aan elke kant. */
function dwarsVan(p: RaveelInvoer) {
  return p.bSparing + 2 * (p.nW ?? 2) * (p.bW ?? p.bBalk) + 2.6 * p.hoh;
}

/**
 * Indeling in de breedte. De labelkolom groeit mee met het raveelbalklabel
 * (het profiel); laat hij de tekening te smal, dan vervalt hij en komt er een
 * verklaring onder de tekening.
 */
function indeling(W: number, p: RaveelInvoer) {
  const kolom = Math.max(ZONE.rechts, 18 + (p.label ?? "").length * 11 * 0.62 + 6);
  const smal = W - 2 * ZONE.zij - ZONE.links - kolom < 170;
  const rechts = smal ? 0 : kolom;
  return {
    smal, rechts,
    bBeschikbaar: Math.max(40, W - 2 * ZONE.zij - ZONE.links - rechts),
    onder: ZONE.onder + (smal ? LEGENDA : 0),
  };
}

/**
 * Alle coördinaten van de plattegrond, voor de tekening en voor de maatchips die de
 * designer erbovenop zet. De balken lopen naar rechts: oplegging A links, oplegging B
 * rechts, op één schaal. y loopt dwars op de balken: yI1 en yI2 zijn de randen van de
 * sparing, de binnenkanten van de wisselbalken.
 */
export function raveelMaten(W: number, H: number, p: RaveelInvoer) {
  const { bSparing, lStaart, hoh, bBalk } = p;
  const { smal, rechts, bBeschikbaar, onder } = indeling(W, p);
  const { heel, L } = lengteVan(p);
  const nW = p.nW ?? 2, bW = p.bW ?? bBalk;
  const s = Math.max(0.005, Math.min(bBeschikbaar / L, (H - ZONE.boven - onder) / dwarsVan(p)));
  const x0 = ZONE.zij + ZONE.links + Math.max(0, (bBeschikbaar - L * s) / 2);
  const x1 = x0 + L * s;
  void rechts;
  const yBoven = ZONE.boven + Math.max(0, (H - ZONE.boven - onder - dwarsVan(p) * s) / 2);
  const wisB = Math.max(4, nW * bW * s);
  const yDoor1 = yBoven + 0.3 * hoh * s;
  const yI1 = yDoor1 + hoh * s + (nW * bW * s) / 2;
  const yI2 = yI1 + bSparing * s;
  const yDoor2 = yI2 + (nW * bW * s) / 2 + hoh * s;
  const yOnder = yDoor2 + 0.3 * hoh * s;
  const twee = heel && !!p.lSparing && p.lSparing > 0 && lStaart + p.lSparing < L;
  const xR = x0 + lStaart * s;
  const xR2 = twee ? x0 + (lStaart + (p.lSparing as number)) * s : x1;
  const nStaart = Math.max(1, Math.floor(bSparing / hoh) - 1);
  return {
    s, smal, heel, twee, nStaart, x0, x1, xR, xR2, yBoven, yDoor1, yDoor2, yI1, yI2, yOnder, wisB,
    xm: (x0 + x1) / 2,
    /** Rand van de strook die de raveelbalk draagt: l_staart/2 vóór zijn as. */
    xStrook: xR - (lStaart / 2) * s,
    xStrook2: twee ? xR2 + (L - lStaart - (p.lSparing as number)) / 2 * s : x1,
    stap: (yI2 - yI1) / (nStaart + 1),
    balkB: Math.max(3, bBalk * s),
    /** De maatketens: de strook erboven, de staart en de overspanning eronder, de sparing links. */
    yMaatStrook: yBoven - 8,
    yMaat1: yOnder + 18,
    yMaat2: yOnder + 42,
    xMaatB: x0 - 14,
    /** De labels: rechts in een kolom, of in een smal paneel de verklaring eronder. */
    xLabel: smal ? x0 - 40 : x1 + 18,
    yLegenda: yOnder + 42 + 22,
  };
}

/** Hoogte waarbij de plattegrond de breedte vult, begrensd op `max` px. */
export function raveelHoogte(W: number, p: RaveelInvoer, max = 440) {
  const { bBeschikbaar, onder } = indeling(W, p);
  const { L } = lengteVan(p);
  const h = ZONE.boven + onder + dwarsVan(p) * (bBeschikbaar / L);
  return Math.min(max, Math.max(150, h));
}

/**
 * Labels in een kolom: gesorteerd, minstens `af` px uit elkaar en binnen
 * [boven, onder]. Eerst omlaag schuiven, dan wat onderuit steekt terug omhoog.
 */
function spreid(ys: number[], af: number, boven: number, onder: number) {
  const volg = ys.map((_, i) => i).sort((a, b) => ys[a] - ys[b]);
  const y = volg.map((i) => ys[i]);
  for (let k = 0; k < y.length; k++) y[k] = Math.max(y[k], k > 0 ? y[k - 1] + af : boven);
  for (let k = y.length - 1; k >= 0; k--) y[k] = Math.min(y[k], k < y.length - 1 ? y[k + 1] - af : onder);
  const uit = [...ys];
  volg.forEach((i, k) => { uit[i] = y[k]; });
  return uit;
}

/** Maatlijn met stippen op de einden. */
function MaatLijn({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={MAAT_KLEUR} strokeWidth={1} />
      <circle cx={x1} cy={y1} r={2.4} fill={MAAT_KLEUR} />
      <circle cx={x2} cy={y2} r={2.4} fill={MAAT_KLEUR} />
    </g>
  );
}

/**
 * Plattegrond van een sparing met raveelbalk, over de hele overspanning van de
 * wisselbalken: de opleggingen links en rechts, de doorgaande balken, de wisselbalken
 * langs de sparing, de staartbalken met de strook die de raveelbalk draagt, de
 * raveelbalk zelf en bij een sparing die niet tot de oplegging doorloopt de tweede
 * raveelbalk met zijn staart. Bij een ouder blad, dat de overspanning niet kent,
 * eindigt de tekening in een breeklijn.
 *
 * Labels staan in een kolom rechts, met een verwijslijn (in een smal paneel
 * als verklaring onder de tekening); maten links en onder, elk op een eigen
 * lijn. De getallen tekent de plattegrond alleen met `getallen`: op het scherm zet
 * de designer er klikbare maten neer.
 */
export function RaveelPlattegrond(props: RaveelInvoer & { W: number; H: number; getallen?: boolean }) {
  const { W, H, bSparing, lStaart, label, getallen } = props;
  const { t } = useTranslation("beelden");
  const m = raveelMaten(W, H, props);
  const { x0, x1, xR, xR2, yI1, yI2, yBoven, yOnder, yDoor1, yDoor2, wisB, balkB, stap, nStaart, xStrook, xStrook2, twee, heel, s } = m;
  const houtVul = "#E3C08A", houtLijn = "#8B6F47", rood = "#b91c1c";
  const nW = props.nW ?? 2;
  const raveelB = Math.max(8, balkB);
  const staarten = Array.from({ length: nStaart }, (_, i) => yI1 + (i + 1) * stap);
  // Breeklijn over de volle hoogte, als de overspanning niet bekend is.
  const knik = (y: number) => `${x1},${y - 4} ${x1 - 5},${y - 1.5} ${x1 + 5},${y + 1.5} ${x1},${y + 4}`;
  const breeklijn = `${x1},${yBoven - 4} ${knik((yDoor1 + yI1) / 2)} ${knik((yI2 + yDoor2) / 2)} ${x1},${yOnder + 4}`;
  // Van boven naar beneden, elk met het vlakje dat het in de verklaring krijgt.
  const labels: {
    doel: [number, number]; kleur: string; vet?: boolean; tekst: ReactNode;
    vlak: { vul: string; lijn: string; streep?: string };
  }[] = [
    {
      doel: [twee ? (xR2 + x1) / 2 : (x0 + xStrook) / 2, staarten[0]], kleur: houtLijn,
      tekst: t("raveel.staartbalken", { n: nStaart }), vlak: { vul: houtVul, lijn: houtLijn },
    },
    {
      doel: [(xStrook + xR) / 2, staarten[staarten.length - 1] - stap / 2], kleur: "#dc2626",
      tekst: <>{t("raveel.belasteStrook")} l<tspan baselineShift="sub" fontSize={8}>{t("raveel.staart")}</tspan>/2</>,
      vlak: { vul: "rgba(239, 68, 68, 0.13)", lijn: "#ef4444", streep: "3 2" },
    },
    {
      doel: [xR, yI1 + 0.72 * (yI2 - yI1)], kleur: rood, vet: true,
      tekst: label ?? "", vlak: { vul: "#fca5a5", lijn: rood },
    },
    {
      doel: [(xR + xR2) / 2, (yI1 + yI2) / 2], kleur: "#64748b",
      tekst: t("raveel.sparing"), vlak: { vul: "#f8fafc", lijn: "#94a3b8", streep: "3 2" },
    },
    {
      doel: [x1 - 0.1 * (x1 - x0), yI2 + wisB / 2], kleur: houtLijn,
      tekst: t(nW > 1 ? "raveel.wisselbalk" : "raveel.wisselbalkEnkel"), vlak: { vul: "#D9A866", lijn: houtLijn },
    },
  ];
  const labelY = m.smal
    ? labels.map((_, i) => m.yLegenda + i * 14)
    : spreid(labels.map((l) => l.doel[1] + 4), 14, 10, H - 4);
  const xL = m.xLabel;
  return (
    <g>
      {/* de opleggingen, met arcering */}
      {(heel ? [x0, x1] : [x0]).map((x, k) => (
        <g key={k}>
          <rect x={x - 4.5} y={yBoven - 4} width={9} height={yOnder - yBoven + 8} fill="#e5e7eb" stroke="#374151" strokeWidth={1.2} />
          {Array.from({ length: Math.floor((yOnder - yBoven + 8) / 8) }, (_, i) => (
            <line key={i} x1={x - 4.5} y1={yBoven - 4 + (i + 1) * 8} x2={x + 4.5} y2={yBoven - 4 + i * 8} stroke="#6b7280" strokeWidth={0.6} />
          ))}
        </g>
      ))}
      {/* sparing: open, met een kruis */}
      <rect x={xR} y={yI1} width={xR2 - xR} height={yI2 - yI1} fill="#f8fafc" stroke="#94a3b8" strokeWidth={1} strokeDasharray="5 3" />
      <line x1={xR} y1={yI1} x2={xR2} y2={yI2} stroke="#cbd5e1" strokeWidth={0.8} />
      <line x1={xR2} y1={yI1} x2={xR} y2={yI2} stroke="#cbd5e1" strokeWidth={0.8} />
      {/* de strook die via de staartbalken op de raveelbalk komt */}
      <rect x={xStrook} y={yI1} width={xR - xStrook} height={yI2 - yI1} fill="rgba(239, 68, 68, 0.13)" stroke="none" />
      <line x1={xStrook} y1={yI1} x2={xStrook} y2={yI2} stroke="#ef4444" strokeWidth={0.8} strokeDasharray="3 2" />
      {twee && (
        <>
          <rect x={xR2} y={yI1} width={xStrook2 - xR2} height={yI2 - yI1} fill="rgba(239, 68, 68, 0.13)" stroke="none" />
          <line x1={xStrook2} y1={yI1} x2={xStrook2} y2={yI2} stroke="#ef4444" strokeWidth={0.8} strokeDasharray="3 2" />
        </>
      )}
      {/* doorgaande balken, naast de wisselbalken */}
      {[yDoor1, yDoor2].map((y, i) => (
        <rect key={i} x={x0} y={y - balkB / 2} width={x1 - x0} height={balkB} fill={houtVul} stroke={houtLijn} strokeWidth={0.9} />
      ))}
      {/* staartbalken: van de oplegging tot op de raveelbalk */}
      {staarten.map((y, i) => (
        <g key={i}>
          <rect x={x0} y={y - balkB / 2} width={xR - raveelB / 2 - x0} height={balkB} fill={houtVul} stroke={houtLijn} strokeWidth={0.9} />
          {twee && <rect x={xR2 + raveelB / 2} y={y - balkB / 2} width={x1 - xR2 - raveelB / 2} height={balkB} fill={houtVul} stroke={houtLijn} strokeWidth={0.9} />}
        </g>
      ))}
      {/* wisselbalken: over de hele lengte, en ze dragen de raveelbalk */}
      {[yI1 - wisB, yI2].map((y, i) => (
        <g key={i}>
          <rect x={x0} y={y} width={x1 - x0} height={wisB} fill="#D9A866" stroke={houtLijn} strokeWidth={1.1} />
          {nW > 1 && <line x1={x0} y1={y + wisB / 2} x2={x1} y2={y + wisB / 2} stroke={houtLijn} strokeWidth={0.7} />}
        </g>
      ))}
      {/* de raveelbalk: die wordt hier berekend */}
      {(twee ? [xR, xR2] : [xR]).map((x, i) => (
        <rect key={i} x={x - raveelB / 2} y={yI1} width={raveelB} height={yI2 - yI1} fill="#fca5a5" stroke={rood} strokeWidth={1.6} />
      ))}
      {/* de staartbalken zetten hun oplegreactie af op de raveelbalk */}
      {staarten.map((y, i) => {
        const x = xR - raveelB / 2 - 1;
        return (
          <g key={i}>
            <polygon points={`${x},${y} ${x - 7},${y - 3.5} ${x - 7},${y + 3.5}`} fill={rood} />
            {twee && <polygon points={`${xR2 + raveelB / 2 + 1},${y} ${xR2 + raveelB / 2 + 8},${y - 3.5} ${xR2 + raveelB / 2 + 8},${y + 3.5}`} fill={rood} />}
          </g>
        );
      })}
      {!heel && <polyline points={breeklijn} fill="none" stroke="#374151" strokeWidth={1.1} strokeLinejoin="round" />}

      {/* labelkolom rechts, met verwijslijnen; in een smal paneel een verklaring eronder */}
      {labels.map((l, i) => (
        <g key={i}>
          {m.smal ? (
            <rect x={xL} y={labelY[i] - 9} width={14} height={9} fill={l.vlak.vul} stroke={l.vlak.lijn}
              strokeWidth={1} strokeDasharray={l.vlak.streep} />
          ) : (
            <>
              <line x1={l.doel[0]} y1={l.doel[1]} x2={xL - 4} y2={labelY[i] - 4} stroke="#9ca3af" strokeWidth={0.8} />
              <circle cx={l.doel[0]} cy={l.doel[1]} r={1.6} fill="#6b7280" />
            </>
          )}
          <Label x={m.smal ? xL + 20 : xL} y={labelY[i]} kleur={l.kleur} anker="start" vet={l.vet ?? false}>{l.tekst}</Label>
        </g>
      ))}

      {/* b_sparing: tussen de binnenkanten van de wisselbalken */}
      <line x1={m.xMaatB - 4} y1={yI1} x2={x0 - 6} y2={yI1} stroke={MAAT_KLEUR} strokeWidth={1} />
      <line x1={m.xMaatB - 4} y1={yI2} x2={x0 - 6} y2={yI2} stroke={MAAT_KLEUR} strokeWidth={1} />
      <MaatLijn x1={m.xMaatB} y1={yI1} x2={m.xMaatB} y2={yI2} />
      {/* de strook boven de tekening: l_staart/2 tot de as van de raveelbalk */}
      <MaatLijn x1={xStrook} y1={m.yMaatStrook} x2={xR} y2={m.yMaatStrook} />
      <Label x={(xStrook + xR) / 2} y={m.yMaatStrook - 4} kleur={MAAT_TEKST}>{nl(lStaart / 2, 0)}</Label>
      {/* de staart, en bij twee raveelbalken de sparing en de andere staart */}
      <line x1={x0} y1={yOnder + 3} x2={x0} y2={m.yMaat1 + 4} stroke={MAAT_KLEUR} strokeWidth={1} />
      <line x1={xR} y1={yOnder + 3} x2={xR} y2={m.yMaat1 + 4} stroke={MAAT_KLEUR} strokeWidth={1} />
      <MaatLijn x1={x0} y1={m.yMaat1} x2={xR} y2={m.yMaat1} />
      {twee && (
        <>
          <line x1={xR2} y1={yOnder + 3} x2={xR2} y2={m.yMaat1 + 4} stroke={MAAT_KLEUR} strokeWidth={1} />
          <line x1={x1} y1={yOnder + 3} x2={x1} y2={m.yMaat1 + 4} stroke={MAAT_KLEUR} strokeWidth={1} />
          <MaatLijn x1={xR} y1={m.yMaat1} x2={xR2} y2={m.yMaat1} />
          <MaatLijn x1={xR2} y1={m.yMaat1} x2={x1} y2={m.yMaat1} />
          <Label x={(xR2 + x1) / 2} y={m.yMaat1 - 5} kleur={MAAT_TEKST}>{nl((x1 - xR2) / s, 0)}</Label>
        </>
      )}
      {/* de hele overspanning van de wisselbalk */}
      {heel && (
        <>
          <line x1={x0} y1={m.yMaat1 + 4} x2={x0} y2={m.yMaat2 + 4} stroke={MAAT_KLEUR} strokeWidth={1} />
          <line x1={x1} y1={yOnder + 3} x2={x1} y2={m.yMaat2 + 4} stroke={MAAT_KLEUR} strokeWidth={1} />
          <MaatLijn x1={x0} y1={m.yMaat2} x2={x1} y2={m.yMaat2} />
        </>
      )}
      {getallen && (
        <>
          <Label x={m.xMaatB - 4} y={(yI1 + yI2) / 2 + 4} kleur={MAAT_TEKST} anker="end">{nl(bSparing, 0)}</Label>
          <Label x={(x0 + xR) / 2} y={m.yMaat1 - 5} kleur={MAAT_TEKST}>{nl(lStaart, 0)}</Label>
          {twee && <Label x={(xR + xR2) / 2} y={m.yMaat1 - 5} kleur={MAAT_TEKST}>{nl(props.lSparing as number, 0)}</Label>}
          {heel && <Label x={m.xm} y={m.yMaat2 - 5} kleur={MAAT_TEKST}>{nl(props.lW as number, 0)}</Label>}
        </>
      )}
    </g>
  );
}
