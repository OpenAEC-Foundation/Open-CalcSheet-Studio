/*
 * Eén vastgelegde definitie van een tweepaalspoer: de maten en de gekozen staven,
 * met de plaats van elke staaf. Het beeld, de afdruk en de SVG-download tekenen
 * hieruit (poerTekening.ts); een latere koppeling met CAD of IFC kan hetzelfde doen.
 *
 * Hier staan geen rekenregels: alleen de opbouw van de wapeningskorf uit de invoer.
 * Wat de toetsing uitrekent (hefboomsarm, hoek) komt onafgerond uit het blad
 * (templates/tweepaalspoer.ts), via `uit`. Dat de plaats van de staven hier en in het
 * blad gelijk is, bewaakt scripts/check-tweepaalspoer.mjs.
 *
 * Geen imports: het controlescript laadt dit bestand rechtstreeks in Node.
 * Alle maten in mm. De oorsprong ligt op de onderkant van de poer, midden in de poer;
 * x loopt langs de paallijn, y dwars daarop, z omhoog.
 */

export interface StaafRij {
  /** Hoogte van het hart boven de onderkant van de poer. */
  z: number;
  /** Plaats van elke staaf in de breedte, hart. */
  y: number[];
}

export interface PoerDefinitie {
  l: number;
  b: number;
  h: number;
  /** Hart-op-hart van de palen. */
  a: number;
  paal: { rond: boolean; x: number; y: number; inbedding: number };
  kolom: { rond: boolean; x: number; y: number };
  /** Hart van de twee palen in de lengterichting. */
  paalX: [number, number];
  c_o: number;
  c_z: number;
  trekband: {
    n: number;
    d: number;
    s: number;
    /** De lagen, onderste eerst. */
    lagen: StaafRij[];
    omgebogen: boolean;
    /** Lengte van het opgebogen been, hart staaf tot uiteinde; 0 bij een rechte staaf. */
    lOp: number;
    doorn: number;
    /** Hart van het been of het uiteinde vanaf het midden van de poer, per laag. */
    xEind: number[];
    /** Hart van de trekband als geheel, boven de onderkant van de poer. */
    aT: number;
  };
  beugels: {
    d: number;
    s: number;
    sneden: number;
    /** Plaats van elke beugel in de lengterichting. */
    x: number[];
    /** Plaats van elke snede in de breedte, hart. */
    y: number[];
    /** Hart van het onder- en het bovenbeen. */
    zOnder: number;
    zBoven: number;
  };
  zij: { n: number; d: number; z: number[]; y: number };
  boven: { n: number; d: number; z: number; y: number[] };
  /** `z` is het onderbeen, `zBoven` het uiteinde van de benen. */
  haarspelden: { n: number; d: number; x: number[]; z: number; zBoven: number };
  /**
   * Het staafwerk uit het blad; null als het blad niet (volledig) heeft gerekend.
   * `eK` en `lT` zijn de arm vanaf het midden: de knoop onder de kolom en de afstand tot
   * de paalknoop, die met de paalafwijking naar buiten ligt.
   */
  model: { d: number; z: number; x: number; hoek: number; eK: number; lT: number } | null;
}

/** Een invoerwaarde van het blad; het beeld geeft zijn eigen `d()` mee. */
export type Lees = (naam: string) => number;

const geheel = (w: number) => Math.max(0, Math.round(w));

/** Gelijk verdeeld rond 0: n plaatsen op onderlinge afstand s. */
function verdeel(n: number, s: number): number[] {
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * s);
}

/**
 * De poer uit de invoer van het blad. Aantallen en lengten komen uit de invoer; niets
 * wordt hier verbeterd. Wat niet past, staat ook zo op de tekening en valt in het blad
 * op in de toetsing.
 */
export function maakPoer(d: Lees, uit: Record<string, number> = {}): PoerDefinitie {
  const l = Math.max(0, d("l_poer"));
  const b = Math.max(0, d("b_poer"));
  const h = Math.max(0, d("h_poer"));
  const a = Math.max(0, d("a_hoh"));
  const paalRond = Math.round(d("paalvorm")) === 2;
  const kolomRond = Math.round(d("kolomvorm")) === 2;
  const c_o = Math.max(0, d("c_o"));
  const c_z = Math.max(0, d("c_z"));
  const d_s = Math.max(0, d("d_s"));

  // ── trekband ──────────────────────────────────────────────────────────────
  const n_t = geheel(d("n_t"));
  const d_t = Math.max(0, d("d_t"));
  const s_t = Math.max(0, d("s_t"));
  const lagenAantal = Math.round(d("lagen")) === 2 ? 2 : 1;
  const omgebogen = Math.round(d("vorm_t")) === 2;
  const s_v = Math.max(d_t, Math.max(0, d("d_g")) + 5, 20);
  // De laag onder de trekband is zo dik als de dikste staaf daar: beugel of haarspeld.
  const n_hp = geheel(d("n_hp"));
  const d_hp = Math.max(0, d("d_hp"));
  const d_o = Math.max(d_s, n_hp > 0 ? d_hp : 0);
  const perLaag = [Math.ceil(n_t / lagenAantal), n_t - Math.ceil(n_t / lagenAantal)].slice(0, lagenAantal);
  const lagen: StaafRij[] = perLaag.map((n, i) => ({
    z: c_o + d_o + d_t / 2 + i * (d_t + s_v),
    y: verdeel(n, s_t),
  }));
  const aT = c_o + d_o + d_t / 2 + ((lagenAantal - 1) * (d_t + s_v)) / 2;
  // Een omgebogen staaf: hart van het been. Een rechte staaf: het uiteinde, tot aan de dekking.
  // De bovenste laag ligt in de ombuiging één staaf plus de vrije ruimte naar binnen.
  const xEind = perLaag.map((_, i) => l / 2 - c_z - (omgebogen ? d_t / 2 : 0) - i * (d_t + s_v));

  // ── beugels ───────────────────────────────────────────────────────────────
  const s_s = Math.max(0, d("s_s"));
  const sneden = geheel(d("n_s"));
  const breedteIn = l - 2 * c_z - d_s;
  const nBeugel = s_s > 0 && breedteIn > 0 ? Math.floor(breedteIn / s_s) + 1 : 0;
  const yBuiten = b / 2 - c_z - d_s / 2;
  const beugelY = sneden > 1 ? verdeel(sneden, (2 * yBuiten) / (sneden - 1)) : [];

  // ── zijstaven, bovenstaven, haarspelden ───────────────────────────────────
  const n_z = geheel(d("n_z"));
  const d_z = Math.max(0, d("d_z"));
  const hIn = h - c_o - c_z - 2 * d_s;
  const zijZ = Array.from({ length: n_z }, (_, i) => c_o + d_s + ((i + 1) * hIn) / (n_z + 1));
  const n_b = geheel(d("n_b"));
  const d_b = Math.max(0, d("d_b"));
  const bovenY = n_b > 1 ? verdeel(n_b, (2 * (b / 2 - c_z - d_s - d_b / 2)) / (n_b - 1)) : n_b === 1 ? [0] : [];
  const p_x = Math.max(0, d("p_x"));
  const p_y = paalRond ? p_x : Math.max(0, d("p_y"));
  const stapHp = n_hp > 0 ? p_x / n_hp : 0;
  const hpRond = verdeel(n_hp, stapHp);
  const paalX: [number, number] = [-a / 2, a / 2];

  const c_x = Math.max(0, d("c_x"));
  const c_y = kolomRond ? c_x : Math.max(0, d("c_y"));

  const zu = uit.z_u;
  const hoek = uit.θ_g;
  const model = Number.isFinite(zu) && Number.isFinite(hoek) && zu > 0
    ? { d: uit.d_eff, z: zu, x: uit.x_c, hoek, eK: kolomRond ? (2 * c_x) / (3 * Math.PI) : c_x / 4, lT: uit.l_t }
    : null;

  return {
    l, b, h, a,
    paal: { rond: paalRond, x: p_x, y: p_y, inbedding: Math.max(0, d("t_in")) },
    kolom: { rond: kolomRond, x: c_x, y: c_y },
    paalX,
    c_o, c_z,
    trekband: { n: n_t, d: d_t, s: s_t, lagen, omgebogen, lOp: omgebogen ? Math.max(0, d("l_op")) : 0, doorn: omgebogen ? Math.max(0, d("D_m")) : 0, xEind, aT },
    beugels: {
      d: d_s, s: s_s, sneden,
      x: verdeel(nBeugel, s_s),
      y: beugelY,
      zOnder: c_o + d_s / 2,
      zBoven: h - c_z - d_s / 2,
    },
    zij: { n: n_z, d: d_z, z: zijZ, y: b / 2 - c_z - d_s - d_z / 2 },
    boven: { n: n_b, d: d_b, z: h - c_z - d_s - d_b / 2, y: bovenY },
    haarspelden: {
      n: n_hp, d: d_hp,
      x: paalX.flatMap((x) => hpRond.map((dx) => x + dx)),
      z: c_o + d_hp / 2,
      zBoven: h - c_z - d_s,
    },
    model,
  };
}

/** Wat de poer op de tekening aan staven heeft; voor de controle en de legenda. */
export function staafTelling(p: PoerDefinitie) {
  return {
    trekband: p.trekband.lagen.reduce((som, l) => som + l.y.length, 0),
    beugels: p.beugels.x.length,
    zij: 2 * p.zij.z.length,
    boven: p.boven.y.length,
    haarspelden: p.haarspelden.x.length,
  };
}
