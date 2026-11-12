/**
 * De bladen met een `@fem`-blok met staven die de controle
 * (scripts/check-fem-staven.mjs) en de proef met de echte server
 * (scripts/proef-fem-staven.mjs) allebei rekenen. De antwoorden van FEM Studio op deze
 * bladen staan vastgelegd in deze map (staven-<naam>.json); verandert een blad, dan
 * maakt de proef ze opnieuw (`node scripts/proef-fem-staven.mjs --bewaar`).
 *
 * Elk blad heeft een bekende oplossing; de handberekening staat bij de verwachting in
 * de controle.
 */

/** Ligger op twee steunpunten met een gelijkmatige last: M = qL²/8, w = 5qL⁴/(384EI). */
export const LIGGER = [
  "L = 4 m",
  "b = 71 mm",
  "h = 196 mm",
  "E = 11000 N/mm^2",
  "q = 2 kN/m",
  "@fem ligger",
  "  materiaal E; 690 N/mm^2",
  "  rechthoek hout: b; h",
  "  staaf balk: 0; 0; L; 0",
  "  steun 0; 0; scharnier",
  "  steun L; 0; rol",
  "  geval Q",
  "    lijnlast balk; q",
  "@end",
  "M_max = ligger.Q.balk.M_max",
  "V_max = ligger.Q.balk.V_max",
  "w_max = ligger.Q.balk.w_max",
  'M_kwart = fem_staaf(ligger; "Q"; "balk"; "M"; L/4)',
  'w_achtste = fem_staaf(ligger; "Q"; "balk"; "w"; L/8)',
].join("\n");

/**
 * Driescharnierspant: twee sporen met een scharnier in de nok, op twee vaste
 * steunpunten, met sneeuw per meter grondvlak. V = qL/2, H = qL²/(8h).
 */
export const DRIESCHARNIER = [
  "L = 8 m",
  "h_nok = 3 m",
  "q = 2 kN/m",
  "@fem spant",
  "  materiaal 11000 N/mm^2; 690 N/mm^2",
  "  rechthoek spoor: 71 mm; 196 mm",
  "  knoop A: 0; 0",
  "  knoop B: L; 0",
  "  knoop nok: L/2; h_nok",
  "  staaf links: A; nok; spoor; scharnier eind",
  "  staaf rechts: nok; B; spoor",
  "  steun A; scharnier",
  "  steun B; scharnier",
  "  geval S",
  "    lijnlast links; q; projectie",
  "    lijnlast rechts; q; projectie",
  "@end",
  "H = spant.S.A.Rx",
  "V = spant.S.A.Rz",
].join("\n");

/**
 * Sporenkap met hanenbalk op een vast steunpunt en een rol: de muurplaten nemen geen
 * spatkracht op, dus de hanenbalk is de trekker en zijn kracht volgt uit het evenwicht
 * van een halve kap. De hanenbalk ligt op de sporen, niet op een knoop van het blok:
 * het model knipt de sporen daar zelf.
 */
export const HANENBALK = [
  "L = 8 m",
  "h_nok = 4 m",
  "z_h = 2.5 m",
  "x_h = L/2*z_h/h_nok",
  "q = 2 kN/m",
  "@fem kap",
  "  materiaal 11000 N/mm^2; 690 N/mm^2",
  "  rechthoek spoor: 71 mm; 196 mm",
  "  rechthoek haan: 46 mm; 146 mm",
  "  knoop A: 0; 0",
  "  knoop B: L; 0",
  "  knoop nok: L/2; h_nok",
  "  staaf spoor_l: A; nok; spoor; scharnier eind",
  "  staaf spoor_r: nok; B; spoor",
  "  staaf hanenbalk: x_h; z_h; L - x_h; z_h; haan; scharnier",
  "  steun A; scharnier",
  "  steun B; rol",
  "  geval S",
  "    lijnlast spoor_l; q; projectie",
  "    lijnlast spoor_r; q; projectie",
  "@end",
  "N_haan = kap.S.hanenbalk.N_max",
].join("\n");

/** Euler: een stijl met twee scharnieren onder een drukkracht. α_cr = π²EI/(H²·N). */
export const EULER = [
  "H = 3 m",
  "N = 10 kN",
  "@fem kolom",
  "  materiaal 11000 N/mm^2; 690 N/mm^2",
  "  rechthoek hout: 71 mm; 196 mm",
  "  knoop voet: 0; 0",
  "  knoop top: 0; H",
  "  staaf stijl: voet; top",
  "  steun voet; scharnier",
  "  steun top; rol z",
  "  geval N",
  "    puntlast top; N",
  "  knikvormen 2",
  "@end",
  "α = kolom.N.alpha_cr",
].join("\n");

/**
 * Tweede orde: een ingeklemde stijl met een drukkracht en een dwarskracht aan de top.
 * M_voet = H·tan(kL)/k met k = √(N/EI); eerste orde H·L. De combinatie is een eigen
 * berekening met de gefactoriseerde lasten: 1,5·20 kN druk en 1 kN dwars.
 */
export const TWEEDE = [
  "H = 3 m",
  "@fem mast",
  "  materiaal 11000 N/mm^2; 690 N/mm^2",
  "  rechthoek hout: 71 mm; 196 mm",
  "  knoop voet: 0; 0",
  "  knoop top: 0; H",
  "  staaf stijl: voet; top",
  "  steun voet; inklemming",
  "  geval G",
  "    puntlast top; 20 kN",
  "  geval W",
  "    puntlast top; 1 kN; x",
  "  combinatie UGT = 1.5*G + W",
  "  analyse tweede-orde",
  "@end",
  'M_voet = fem_staaf(mast; "UGT"; "stijl"; "M"; 0 m)',
  'u_top = fem_knoop(mast; "UGT"; "top"; "ux")',
].join("\n");

/**
 * Ruimtelijk: een haakse uitkraging in het horizontale vlak, ingeklemd in A, met een
 * last omlaag op het eind. De eerste staaf krijgt buiging en wringing.
 */
export const RUIMTE = [
  "@fem arm",
  "  materiaal 210000 N/mm^2; 0.3",
  "  doorsnede koker: 20 cm^2; 300 cm^4; 200 cm^4; 400 cm^4",
  "  knoop A: 0; 0; 0",
  "  knoop B: 0; 2 m; 0",
  "  knoop C: 1 m; 2 m; 0",
  "  staaf s1: A; B",
  "  staaf s2: B; C",
  "  steun A; inklemming",
  "  geval F",
  "    puntlast C; 5 kN",
  "@end",
  'u_C = fem_knoop(arm; "F"; "C"; "uz")',
].join("\n");

/**
 * Een portaal met scharnieren en een kruis van twee stangen die alleen trek opnemen:
 * onder de wind van links draagt de ene diagonaal, de andere valt weg.
 */
export const KRUIS = [
  "@fem portaal",
  "  materiaal hout: 11000 N/mm^2; 690 N/mm^2",
  "  materiaal staal: 210000 N/mm^2; 0.3",
  "  rechthoek stijl: 71 mm; 196 mm; hout",
  "  doorsnede stang: 2 cm^2; 1 cm^4; staal",
  "  knoop A: 0; 0",
  "  knoop B: 4 m; 0",
  "  knoop C: 0; 3 m",
  "  knoop D: 4 m; 3 m",
  "  staaf k1: A; C; stijl; scharnier",
  "  staaf k2: B; D; stijl; scharnier",
  "  staaf regel: C; D; stijl; scharnier",
  "  staaf d1: A; D; stang; scharnier; trek",
  "  staaf d2: B; C; stang; scharnier; trek",
  "  steun A; scharnier",
  "  steun B; scharnier",
  "  geval W",
  "    puntlast C; 10 kN; x",
  "@end",
].join("\n");

/**
 * Een spant met gordingen: twee spantbenen en een trekbalk, alle met scharnieren, op
 * een vast steunpunt en een rol. De gordingen geven een puntlast op de nok en
 * halverwege elk been: daar knipt het model het been zelf.
 */
export const SPANT = [
  "L = 8 m",
  "h_nok = 3 m",
  "F = 6 kN",
  "@fem spant",
  "  materiaal 11000 N/mm^2; 690 N/mm^2",
  "  rechthoek spantbeen: 100 mm; 250 mm",
  "  rechthoek trekbalk: 100 mm; 200 mm",
  "  knoop A: 0; 0",
  "  knoop B: L; 0",
  "  knoop nok: L/2; h_nok",
  "  staaf been_l: A; nok; spantbeen; scharnier",
  "  staaf been_r: nok; B; spantbeen; scharnier",
  "  staaf trekker: A; B; trekbalk; scharnier",
  "  steun A; scharnier",
  "  steun B; rol",
  "  geval G",
  "    // de gordingen: op de nok en halverwege elk been",
  "    puntlast nok; F",
  "    puntlast been_l; F; 2.5 m",
  "    puntlast been_r; F; 2.5 m",
  "@end",
].join("\n");

/**
 * Het voorbeeld uit docs/fem-model.md: een sporenkap met hanenbalk op twee muurplaten
 * (beide nemen spatkracht op), met eigen gewicht, sneeuw per meter grondvlak en wind
 * loodrecht op het dakvlak, drie combinaties voor de uiterste grenstoestand en een voor
 * de doorbuiging. Daaronder de houttoets van het linker spoor door `check_timber_beams`,
 * met de snedekrachten uit het model.
 */
export const KAP = [
  "L = 7.2 m",
  "h_nok = 3.2 m",
  "z_h = 2.2 m",
  "a = 0.6 m",
  "b = 59 mm",
  "h = 156 mm",
  "g_dak = 0.55 kN/m^2",
  "s = 0.56 kN/m^2",
  "w_druk = 0.35 kN/m^2",
  "w_zuig = 0.25 kN/m^2",
  "x_h = L/2*z_h/h_nok",
  "",
  "@fem kap",
  "  materiaal 11000 N/mm^2; 690 N/mm^2",
  "  rechthoek spoor: b; h",
  "  rechthoek haan: 46 mm; 121 mm",
  "  knoop A: 0; 0",
  "  knoop B: L; 0",
  "  knoop nok: L/2; h_nok",
  "  staaf spoor_l: A; nok; spoor; scharnier eind",
  "  staaf spoor_r: nok; B; spoor",
  "  staaf hanenbalk: x_h; z_h; L - x_h; z_h; haan; scharnier",
  "  steun A; scharnier",
  "  steun B; scharnier",
  "  geval G",
  "    eigengewicht 4.2 kN/m^3",
  "    lijnlast spoor_l; g_dak*a",
  "    lijnlast spoor_r; g_dak*a",
  "  geval S",
  "    lijnlast spoor_l; s*a; projectie",
  "    lijnlast spoor_r; s*a; projectie",
  "  geval W",
  "    lijnlast spoor_l; w_druk*a; lokaal",
  "    lijnlast spoor_r; -w_zuig*a; lokaal",
  "  combinatie UGT_G = 1.35*G",
  "  combinatie UGT_S = 1.2*G + 1.5*S",
  "  combinatie UGT_W = 1.2*G + 1.5*W",
  "  combinatie BGT = G + S",
  "  beeld UGT_S M",
  "@end",
  "",
  "M_Ed = max(kap.UGT_S.spoor_l.M_max; -kap.UGT_S.spoor_l.M_min)",
  "N_haan = kap.UGT_S.hanenbalk.N_min",
  "H_A = kap.UGT_S.A.Rx",
  "w_BGT = kap.BGT.spoor_l.w_max",
  "",
  "@toets spoor = check_timber_beams",
  '  inputs = [{beam_id: 1, width_mm: b, height_mm: h, strength_class: "C24", service_class: "Sc2", load_duration: "ShortTerm", load_duration_per_combination: [{combination_id: 1, load_duration: "Permanent"}, {combination_id: 2, load_duration: "ShortTerm"}, {combination_id: 3, load_duration: "ShortTerm"}], length_m: kap.spoor_l.L, buckling_length_z_m: 0.3 m, ltb_segment_length_m: 0.3 m, forces_envelope: fem_krachten(kap; "spoor_l"; "UGT_G"; "UGT_S"; "UGT_W"), deflection_inst_mm: -kap.BGT.spoor_l.w_max, deflection_quasi_perm_mm: -kap.G.spoor_l.w_max, deflection_permanent_mm: -kap.G.spoor_l.w_max}]',
  "@end",
  "UC = spoor.uc_max",
].join("\n");

/** De bladen bij naam, voor de proef en de controle; de naam is die van het bestand met het antwoord. */
export const STAVEN_BLADEN = {
  ligger: LIGGER,
  driescharnier: DRIESCHARNIER,
  hanenbalk: HANENBALK,
  euler: EULER,
  tweede: TWEEDE,
  ruimte: RUIMTE,
  kruis: KRUIS,
  spant: SPANT,
  kap: KAP,
};
