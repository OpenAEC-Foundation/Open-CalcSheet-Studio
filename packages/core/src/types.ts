/**
 * Node types of the calculation language.
 *
 * Visibility model: each renderable node may carry `hidden: true` (set by parser
 * inside #hide…#show ranges). Hidden assignments still execute (variable binds
 * to scope) but the renderer skips them. Follows the language's `#hide`/`#show`
 * directives.
 */

export interface HeadingNode {
  type: 'heading';
  level: number;
  text: string;
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface TextNode {
  type: 'text';
  text: string;
  /** True when text came from a prose line (`'...`) — content is passed
   *  through as HTML without escaping. False (default) for derived/safe text. */
  html?: boolean;
  /** Optional template parts for prose interpolation. When present,
   *  the renderer should concat literal segments with evaluated expressions.
   *  Example: `'<svg viewbox="'-xx' '-yy'" ...>` becomes
   *    [{lit:'<svg viewbox="'}, {expr:'-xx'}, {lit:' '}, {expr:'-yy'}, {lit:'" ...>'}] */
  parts?: Array<{ kind: 'literal'; value: string } | { kind: 'expr'; value: string; formaat?: string }>;
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
  /** Toelichting die op dezelfde bronregel achter een rekendeel stond; de
   *  renderer zet hem naast de formule in plaats van eronder. */
  inline?: boolean;
}

export interface AssignmentNode {
  type: 'assignment';
  name: string;
  expression: string;
  raw: string;
  /**
   * Toekenning aan één element van een vector of matrix (`v.(i) = …`,
   * `A.(i; j) = …`): de index, in mathjs-notatie (`i, j`), 1-gebaseerd.
   */
  index?: string;
  /** Opmaak van de uitkomst achter de expressie, `:F2` (zie evaluator: formatGetal). */
  formaat?: string;
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/**
 * Cascading conditional with `#else if`.
 * `branches[0]` is the primary `#if`; subsequent are `#else if`.
 * `elseBody` is the final `#else` (or empty).
 */
export interface ConditionalNode {
  type: 'conditional';
  branches: { condition: string; body: AstNode[] }[];
  elseBody: AstNode[];
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
  /** Backwards-compat shims (renderer/legacy code may still reference these). */
  condition?: string;
  ifBody?: AstNode[];
}

/**
 * `?` input prompt — `F = ? kN` prompts user for a numeric value.
 * Interactive: renderer emits an <input>, value flows back via SelectValues.
 * Een standaardwaarde staat tussen accolades achter het vraagteken, zoals in
 * Met standaardwaarde: `L = ?{5000}mm`, `F = ? {3} kN`.
 */
export interface InputPromptNode {
  type: 'input-prompt';
  name: string;
  label: string;
  /** De standaardwaarde (`?{5000}`), anders "0". */
  defaultValue: string;
  unit: string;
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/**
 * User-defined function: `f(x) = x^2 + 1` or `g(a, b) = sqrt(a^2 + b^2)`.
 * Evaluator passes the full assignment string verbatim to mathjs which supports
 * function definitions natively (`f = (x) -> x^2 + 1`).
 */
export interface UserFunctionNode {
  type: 'user-function';
  name: string;
  params: string[];
  expression: string;
  raw: string;
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/**
 * Read-only variable display — `x` alone on a line renders the current value.
 * Useful for referencing earlier-computed quantities in narrative flow.
 */
export interface VarDisplayNode {
  type: 'var-display';
  name: string;
  /** Omrekenen naar deze eenheid: `x|kN*m` of `x to kN*m` op een eigen regel. */
  omrekening?: string;
  /** Opmaak van de uitkomst, `x:F2`. */
  formaat?: string;
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/**
 * `#repeat n … #end repeat` loop. The body is evaluated `count` times;
 * scope is shared across iterations so values accumulate (e.g. running totals).
 *
 * Iteration index is bound to the variable `_i` (1-based) within the body.
 */
export interface RepeatNode {
  type: 'repeat';
  /** Expressie voor het aantal rondes; leeg = tot een #break (met een bovengrens). */
  count: string;
  /** `#while`: herhaal zolang deze voorwaarde waar is (count wordt dan genegeerd). */
  conditie?: string;
  body: AstNode[];
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/**
 * `$Plot{curve1 & curve2 @ var = lo : hi}` inline 2D plot.
 * Each curve is either `yExpr` (implicit x) or `xExpr|yExpr` (parametric).
 * The parameter (variable name + range) is shared across all curves.
 *
 * Evaluator samples each curve at `samples` points and renders as inline SVG.
 */
export interface PlotNode {
  type: 'plot';
  curves: { xExpr?: string; yExpr: string }[];
  param: string;        // variable name, e.g. "x" or "θ"
  lo: string;           // expression for lower bound
  hi: string;           // expression for upper bound
  samples?: number;     // default 100
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface EvaluatedPlot {
  type: 'plot';
  svg: string;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface SvgNode {
  type: 'svg';
  content: string;
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/**
 * Eén regel uit een `@3d`-blok, ingelezen maar nog niet doorgerekend (zie
 * drieD.ts). `regel` is het regelnummer binnen het blok (1 = de eerste regel
 * na `@3d`), voor een melding.
 *   element   `balk 0 0 0 {{L}} 0 0 {{b}} {{h}} hout`: het sleutelwoord, de
 *             maten nog als tekst (`300`, `2.5m`, `{{…}}`, al genormaliseerd),
 *             de kleur als `#rrggbb`, een optie (`rol`) en een tekst
 *   for       `#for i = 1 : n` … `#loop`
 *   if        `#if …` / `#else if …` / `#else` / `#end if`
 */
export type DrieDRegel =
  | { soort: 'element'; regel: number; naam: string; maten: string[]; kleur?: string; optie?: string; tekst?: string }
  | { soort: 'for'; regel: number; teller: string; van: string; tot: string; body: DrieDRegel[] }
  | { soort: 'if'; regel: number; takken: { voorwaarde: string; body: DrieDRegel[] }[]; anders: DrieDRegel[] };

/** De instellingen van een `@3d`-blok, zoals ze er staan (zie drieD.ts). */
export interface DrieDInstellingen {
  eenheid?: 'mm' | 'cm' | 'm';
  camera?: 'iso' | 'voor' | 'boven' | 'zij';
  raster?: boolean;
  assen?: boolean;
  /** De hoogte van het beeld in px, als deel (een getal of `{{…}}`). */
  hoogte?: string;
}

/** Een `@3d … @end`-blok: een ruimtelijk beeld met waarden uit het blad. */
export interface DrieDNode {
  type: '3d';
  regels: DrieDRegel[];
  instellingen: DrieDInstellingen;
  /** Meldingen van het inlezen: een onbekend element, te weinig maten. */
  fouten: string[];
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/**
 * Een `@iframe`-regel: een externe pagina (zie iframeBlok.ts). Het adres, de
 * hoogte en de titel nog als tekst, met `{{…}}` al genormaliseerd.
 */
export interface IframeNode {
  type: 'iframe';
  url: string;
  hoogte?: string;
  titel?: string;
  /** De pagina mag scripts uitvoeren, afgeschermd. */
  scripts: boolean;
  /** Meldingen van het inlezen: geen adres, een onbekende optie. */
  fouten: string[];
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/** Een `@ifcx`-regel: het 3D-beeld van een module, uit een IFCX-document (zie ifcxBlok.ts). */
export interface IfcxBlokNode {
  type: 'ifcx';
  /** De generator: `balklaag`. */
  bron: string;
  hoogte?: string;
  papier?: string;
  /** De taal van de namen in het document (`nl`, `en`); standaard Nederlands. */
  taal?: string;
  fouten: string[];
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/**
 * Een `@js … @end`-blok (zie jsBlok.ts). De code letterlijk; hoogte, titel en
 * netwerk nog als tekst, met `{{…}}` al genormaliseerd.
 */
export interface JsBlokNode {
  type: 'js';
  code: string;
  hoogte?: string;
  titel?: string;
  bibliotheken: string[];
  netwerk: string[];
  fouten: string[];
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface ImageNode {
  type: 'image';
  src: string;
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface SelectOption {
  text: string;
  value: string;
}

export interface SelectNode {
  type: 'select';
  name: string;
  label: string;
  options: SelectOption[];
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface GefUploadNode {
  type: 'gef-upload';
  name: string;  // variable prefix, e.g. "sondering1"
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/**
 * Een rekentaal-opdracht die vanaf die regel geldt, voor de rest van het blad
 * (of tot een andere opdracht van dezelfde soort):
 *   `#deg`, `#rad`, `#gra`   hoekeenheid van sin, cos, … (daarna weer de app-stand)
 *   `#equ`, `#val`, `#noc`   formule en uitkomst / alleen de uitkomst / alleen de formule
 *   `#varsub`, `#nosub`, `#novar`   met invulling / zonder invulling / alleen de invulling
 *   `#round n`               uitkomsten op n decimalen (`#round default`: de app-opmaak)
 * Ze worden uitgevoerd tijdens het rekenen, in de volgorde van het blad, ook
 * binnen een #if-tak of lus en ook als ze verborgen staan.
 */
export interface OpdrachtNode {
  type: 'opdracht';
  opdracht: 'deg' | 'rad' | 'gra' | 'equ' | 'val' | 'noc' | 'varsub' | 'nosub' | 'novar' | 'round';
  /** Bij `#round`: het aantal decimalen; null = de opmaak van de app. */
  decimalen?: number | null;
  hidden?: boolean;
}

/** `#break` — early exit from the enclosing #repeat / #for loop. */
export interface BreakNode {
  type: 'break';
  /** `#continue`: alleen de rest van deze ronde overslaan. */
  doorgaan?: boolean;
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export type AstNode =
  | HeadingNode
  | TextNode
  | AssignmentNode
  | ConditionalNode
  | InputPromptNode
  | UserFunctionNode
  | VarDisplayNode
  | RepeatNode
  | PlotNode
  | SvgNode
  | DrieDNode
  | IframeNode
  | IfcxBlokNode
  | JsBlokNode
  | BreakNode
  | ImageNode
  | SelectNode
  | GefUploadNode
  | OpdrachtNode;

export interface EvaluatedHeading {
  type: 'heading';
  level: number;
  text: string;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface EvaluatedText {
  type: 'text';
  text: string;
  html?: boolean;
  /** Zie TextNode.inline. */
  inline?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/**
 * Een vector of matrix als uitkomst, voor de matrixopmaak in de uitwerking.
 * Elk element is opgemaakt zoals een gewone uitkomst ("0.5 m", "12"); een
 * grote matrix is ingekort, met "…" op de plaats van wat wegviel.
 */
export interface MatrixUitkomst {
  /** De getoonde elementen per rij. Een vector heeft één rij. */
  rijen: string[][];
  /** Een vector (één index) en geen matrix; de rekentaal toont hem liggend. */
  vector: boolean;
  /**
   * De eenheid die alle elementen delen; die staat dan één keer achter de
   * haak en de elementen staan zonder eenheid. Leeg als ze verschillen.
   */
  eenheid: string;
  /** Afmetingen van de hele matrix (vector: 1 × lengte). */
  m: number;
  n: number;
}

export interface EvaluatedAssignment {
  type: 'assignment';
  name: string;
  expression: string;
  substitution: string;
  result: string;
  /**
   * De uitkomst als getal in de getoonde eenheid, onafgerond. `result` is op
   * vier cijfers afgerond; wie met de uitkomst verder rekent (een beeld dat
   * een lijn tekent) neemt deze. Ontbreekt bij een uitkomst die geen getal is.
   */
  waarde?: number;
  unit: string;
  /** De uitkomst is een vector of matrix; `result` is dan een tekstvorm. */
  matrix?: MatrixUitkomst;
  /**
   * De uitkomst zoals hij in beeld komt, als een opmaak (`:F2`, `#round n`)
   * hem anders toont dan `result`. `result` houdt de standaardopmaak: wie de
   * uitkomst leest (de UC in de projectboom) leest het getal, niet de weergave.
   */
  getoond?: string;
  /**
   * Wat de regel toont (`#val`, `#noc`, `#nosub`, `#novar`); zonder
   * dit veld: formule, invulling en uitkomst (`#equ` met `#varsub`).
   */
  weergave?: 'val' | 'noc' | 'nosub' | 'novar';
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface EvaluatedInputPrompt {
  type: 'input-prompt';
  name: string;
  label: string;
  unit: string;
  /** Wat in het veld staat: de invoer van de gebruiker, of de standaardwaarde. */
  currentValue: string;
  /** De standaardwaarde van het veld (`?{5000}`, anders "0"); placeholder van een leeg veld. */
  standaard?: string;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface EvaluatedUserFunction {
  type: 'user-function';
  name: string;
  params: string[];
  expression: string;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/** Renders as `name = <value>` — same chrome as a regular assignment with no substitution. */
export interface EvaluatedVarDisplay {
  type: 'var-display';
  name: string;
  result: string;
  /** Zie EvaluatedAssignment.waarde. */
  waarde?: number;
  unit: string;
  /** Zie EvaluatedAssignment.matrix. */
  matrix?: MatrixUitkomst;
  /** Zie EvaluatedAssignment.getoond. */
  getoond?: string;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface EvaluatedConditionalBranch {
  type: 'conditional-branch';
  children: EvaluatedNode[];
}

export interface EvaluatedSvg {
  type: 'svg';
  content: string;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface EvaluatedImage {
  type: 'image';
  src: string;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/** Een punt in de scène: x, y, z in de eenheid van de scène (z omhoog). */
export type Punt3D = [number, number, number];

/**
 * Eén element van een doorgerekende scène, met ingevulde maten en een kleur
 * als `#rrggbb`. `kolom` en `plaat` uit het blok zijn hier een `balk` en een
 * `doos`, een `lijnlast` is een rij `pijl`en met een `staaf` erover.
 */
export type DrieDElement =
  | { soort: 'balk'; van: Punt3D; naar: Punt3D; b: number; h: number; kleur: string }
  | { soort: 'ibalk'; van: Punt3D; naar: Punt3D; b: number; h: number; tw: number; tf: number; kleur: string }
  | { soort: 'buis'; van: Punt3D; naar: Punt3D; d: number; kleur: string }
  | { soort: 'doos'; hoek: Punt3D; maat: Punt3D; kleur: string }
  | { soort: 'staaf'; van: Punt3D; naar: Punt3D; kleur: string }
  | { soort: 'knoop'; plek: Punt3D; r: number; kleur: string }
  | { soort: 'tekst'; plek: Punt3D; tekst: string; kleur: string }
  | { soort: 'pijl'; van: Punt3D; naar: Punt3D; kleur: string }
  | { soort: 'oplegging'; plek: Punt3D; type: 'scharnier' | 'rol' | 'inklemming'; grootte: number; kleur: string }
  /**
   * Een lichaam met vrije vlakken, gelezen uit een IFCX-document (ifcxLezen.ts);
   * kan niet in een `@3d`-blok staan. `pad` is het pad van het element in het
   * document, `opaciteit` 1 is dekkend.
   */
  | { soort: 'vlakken'; vlakken: { punten: Punt3D[]; rand: boolean }[]; kleur: string; opaciteit?: number; pad?: string };

/**
 * Een doorgerekende `@3d`-scène. Dit staat als JSON in `data-scene` van het
 * `.calc-3d`-element; de app tekent er een draaibaar beeld van.
 */
export interface DrieDScene {
  eenheid: 'mm' | 'cm' | 'm';
  camera: 'iso' | 'voor' | 'boven' | 'zij';
  raster: boolean;
  assen: boolean;
  /** Hoogte van het beeld in px. */
  hoogte: number;
  elementen: DrieDElement[];
}

export interface EvaluatedDrieD {
  type: '3d';
  scene: DrieDScene;
  /** Wat niet te tekenen was, per regel van het blok; staat boven het beeld. */
  meldingen: string[];
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/** Een doorgerekende `@iframe`-regel. `url` is null als het adres is geweigerd. */
export interface EvaluatedIframe {
  type: 'iframe';
  url: string | null;
  hoogteMm: number;
  scripts: boolean;
  titel?: string;
  meldingen: string[];
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/** Een doorgerekende `@ifcx`-regel. `document` is null als er niets te maken viel. */
export interface EvaluatedIfcxBlok {
  type: 'ifcx';
  document: import('./ifcx/typen.js').IfcxBestand | null;
  /** Hoogte van het beeld op het scherm in px. */
  hoogte: number;
  /** Ook op de uitdraai. */
  papier: boolean;
  meldingen: string[];
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/**
 * Een waarde uit het blad voor een script: `w` is de waarde zoals het blad hem
 * toont, `e` de eenheid, `s` de waarde in SI en `d` de dimensie (die van mathjs:
 * massa, lengte, tijd, stroom, temperatuur, lichtsterkte, stofhoeveelheid, hoek, bit).
 */
export interface JsWaarde {
  w: number | string | boolean | unknown[];
  e?: string;
  s?: number;
  d?: number[];
}

/** Een doorgerekend `@js`-blok: de code en de waarden van het blad op die plek. */
export interface EvaluatedJsBlok {
  type: 'js';
  code: string;
  hoogteMm: number;
  titel?: string;
  bibliotheken: string[];
  netwerk: string[];
  waarden: Record<string, JsWaarde>;
  meldingen: string[];
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface EvaluatedSelect {
  type: 'select';
  name: string;
  label: string;
  options: SelectOption[];
  selectedValue: string;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface EvaluatedGefUpload {
  type: 'gef-upload';
  name: string;
  data: null;  // data comes from runtime upload
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export type EvaluatedNode =
  | EvaluatedHeading
  | EvaluatedText
  | EvaluatedAssignment
  | EvaluatedInputPrompt
  | EvaluatedUserFunction
  | EvaluatedVarDisplay
  | EvaluatedConditionalBranch
  | EvaluatedPlot
  | EvaluatedSvg
  | EvaluatedDrieD
  | EvaluatedIframe
  | EvaluatedIfcxBlok
  | EvaluatedJsBlok
  | EvaluatedImage
  | EvaluatedSelect
  | EvaluatedGefUpload;
