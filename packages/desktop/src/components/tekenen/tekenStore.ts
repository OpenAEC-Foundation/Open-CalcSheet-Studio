/**
 * De toestand van de tekeneditor (tabblad Tekenen): de tekening in bewerking,
 * het gereedschap en de stijl uit het lint, en waar de tekening in de code
 * terechtkomt.
 *
 * Het lint en de editor delen deze store; de editor zelf staat als venster
 * over de uitwerking (TekenEditor.tsx).
 */
import { create } from "zustand";
import type { EditorView } from "@codemirror/view";
import i18next from "../../i18n/config";
import { useProjectStore } from "../../store/projectStore";
import { isTekenBlad, type TekenView } from "../../store/tekenBlad";
import { bladOpen, metEditor, vraagCode } from "../../store/codeVerzoek";
import { useEditorViewStore } from "../../store/editorViewStore";
import { voegIn } from "../ribbon/invoegen";
import {
  blokBij,
  blokMetNaam,
  blokTekst,
  inspringing,
  leesTekening,
  schrijfTekening,
  verborgenBij,
  vrijeNaam,
  zoekBlokken,
} from "./code";
import {
  isVorm,
  legeTekening,
  STANDAARD_STIJL,
  type Gereedschap,
  type Opgelost,
  type Stijl,
  type Tekening,
  type Vorm,
} from "./model";
import { gelijkSleutel, heeftVulling, SCHAAL_SYMBOLEN, symboolDef, zetOptie, type SymboolId } from "./symbolen";
import { MODEL_SCHAAL, rasterVoorSchaal, tekeningVanView } from "./vel";
import { kopie, metNieuwId } from "./bewerk";
import type { CommandoNaam } from "./commando";

/** Waar de tekening heen gaat: nieuw op de cursor, of terug op de plek van een bestaand blok. */
export type Doel =
  | { soort: "nieuw" }
  | { soort: "blok"; begin: number; tekst: string };

export interface Melding {
  sleutel: string;
  opties?: Record<string, string | number>;
  fout?: boolean;
}

export interface Raster {
  toon: boolean;
  snap: boolean;
  maat: number;
  /** Objectsnap: eindpunten, middens en middelpunten, en op een lijn. */
  object: boolean;
  /** Ortho: lijnen horizontaal of verticaal. */
  ortho: boolean;
}

/**
 * Een view van een tekenblad in bewerking. Dezelfde editor, maar in deze stand is
 * één eenheid één mm in het echt (vel.ts) en hoort de tekening bij het vel, niet
 * bij een blok in de code.
 */
export interface VelBewerking {
  exId: string;
  viewId: string;
  /** De schaal 1 : n van de view. */
  schaal: number;
}

/** Wat het gereedschap Symbool plaatst: het symbool en zijn keuzes (familie, type oplegging). */
export interface SymboolKeuze {
  sym: SymboolId;
  o: Record<string, string>;
}

interface TekenState {
  /** Er is een tekening in bewerking. */
  open: boolean;
  /** De editor staat in beeld (de tab Tekenen is actief). */
  zichtbaar: boolean;
  tekening: Tekening;
  doel: Doel;
  /** Het blad waarin de tekening thuishoort. */
  bladId: string | null;
  /** Waar de cursor stond bij het openen: de plek voor een nieuwe tekening. */
  plek: number;
  gereedschap: Gereedschap;
  symbool: SymboolKeuze;
  /** Tekenschaal 1 : n voor nieuwe staalprofielen en hout. */
  schaal: number;
  stijl: Stijl;
  raster: Raster;
  /** De geselecteerde elementen. */
  gekozen: string[];
  /** Wat Ctrl+C heeft onthouden. */
  klembord: Vorm[];
  /** Een commando uit het lint: het tekenvlak start het (de teller maakt elke klik nieuw). */
  commando: { naam: CommandoNaam; nr: number } | null;
  terug: Tekening[];
  vooruit: Tekening[];
  /** Sleutel van de laatste wijziging: opeenvolgende wijzigingen met dezelfde sleutel zijn één stap terug. */
  laatste: string | null;
  gewijzigd: boolean;
  melding: Melding | null;
  /** Een zojuist geplaatste tekst: het paneel zet de cursor in zijn tekstveld. */
  focus: string | null;
  /** Een view van een tekenblad in bewerking; null: een tekening uit de code. */
  vel: VelBewerking | null;
  /** De gekozen view op het vel in beeld. */
  velKeuze: string | null;
  /** Een teller: het lint gaat naar de tab Tekenen als hij verandert. */
  lintVerzoek: number;
}

export const useTeken = create<TekenState>(() => ({
  open: false,
  zichtbaar: false,
  tekening: legeTekening("tek1"),
  doel: { soort: "nieuw" },
  bladId: null,
  plek: 0,
  gereedschap: "selecteer",
  symbool: { sym: "staal", o: { familie: "HEB", maat: "HEB 200" } },
  schaal: 10,
  stijl: STANDAARD_STIJL,
  raster: { toon: true, snap: true, maat: 10, object: true, ortho: false },
  gekozen: [],
  klembord: [],
  commando: null,
  terug: [],
  vooruit: [],
  laatste: null,
  gewijzigd: false,
  melding: null,
  focus: null,
  vel: null,
  velKeuze: null,
  lintVerzoek: 0,
}));

const MAX_TERUG = 100;
const t = (sleutel: string, opties?: Record<string, unknown>) => i18next.t(`tekenen:${sleutel}`, opties ?? {});

export const meld = (melding: Melding | null) => useTeken.setState({ melding });

/** Wijzig de tekening. Met een sleutel tellen opeenvolgende wijzigingen (slepen, typen) als één stap. */
export function wijzig(f: (t: Tekening) => Tekening, sleutel?: string) {
  useTeken.setState((s) => {
    const nieuw = f(s.tekening);
    if (nieuw === s.tekening) return s;
    const samen = sleutel !== undefined && sleutel === s.laatste;
    return {
      tekening: nieuw,
      terug: samen ? s.terug : [...s.terug, s.tekening].slice(-MAX_TERUG),
      vooruit: [],
      laatste: sleutel ?? null,
      gewijzigd: true,
    };
  });
}

/** Wijzig één vorm. */
export function wijzigVorm(id: string, f: (v: Vorm) => Vorm, sleutel?: string) {
  wijzig((tk) => ({
    ...tk,
    elementen: tk.elementen.map((el) => (el.id === id && isVorm(el) ? f(el) : el)),
  }), sleutel);
}

/** Wijzig meer vormen in één stap terug. */
export function wijzigVormen(ids: string[], f: (v: Vorm) => Vorm, sleutel?: string) {
  wijzig((tk) => ({
    ...tk,
    elementen: tk.elementen.map((el) => (ids.includes(el.id) && isVorm(el) ? f(el) : el)),
  }), sleutel);
}

export function ongedaan() {
  useTeken.setState((s) => {
    const vorige = s.terug[s.terug.length - 1];
    if (!vorige) return s;
    return {
      tekening: vorige,
      terug: s.terug.slice(0, -1),
      vooruit: [s.tekening, ...s.vooruit],
      laatste: null,
      gewijzigd: true,
      gekozen: s.gekozen.filter((id) => vorige.elementen.some((e) => e.id === id)),
    };
  });
}

export function opnieuw() {
  useTeken.setState((s) => {
    const volgende = s.vooruit[0];
    if (!volgende) return s;
    return {
      tekening: volgende,
      terug: [...s.terug, s.tekening],
      vooruit: s.vooruit.slice(1),
      laatste: null,
      gewijzigd: true,
      gekozen: s.gekozen.filter((id) => volgende.elementen.some((e) => e.id === id)),
    };
  });
}

export function verwijderSelectie() {
  const { gekozen } = useTeken.getState();
  if (gekozen.length === 0) return;
  wijzig((tk) => ({ ...tk, elementen: tk.elementen.filter((e) => !gekozen.includes(e.id)) }));
  useTeken.setState({ gekozen: [] });
}

export function kiesGereedschap(g: Gereedschap) {
  useTeken.setState((s) => ({ gereedschap: g, gekozen: g === "selecteer" ? s.gekozen : [] }));
}

/** Het gereedschap Symbool met dit symbool (en zijn keuzes, zoals de familie of het type). */
export function kiesSymbool(sym: SymboolId, o: Record<string, string> = {}) {
  useTeken.setState({ gereedschap: "symbool", symbool: { sym, o }, gekozen: [] });
}

/** Een commando uit het lint: het tekenvlak voert het uit. */
export function startCommando(naam: CommandoNaam) {
  useTeken.setState((s) => ({ commando: { naam, nr: (s.commando?.nr ?? 0) + 1 } }));
}

/** De geselecteerde vormen (een element dat de editor niet kent, telt hier niet mee). */
export function gekozenVormen(): Vorm[] {
  const s = useTeken.getState();
  return s.tekening.elementen.filter((e): e is Vorm => s.gekozen.includes(e.id) && isVorm(e));
}

/** De tekenschaal voor nieuwe profielen; een geselecteerd profiel of hout neemt hem over. */
export function zetSchaal(n: number) {
  useTeken.setState({ schaal: n });
  const ids = gekozenVormen().filter((v) => SCHAAL_SYMBOLEN.includes(v.sym as SymboolId)).map((v) => v.id);
  if (ids.length > 0) wijzigVormen(ids, (o) => zetOptie(o, "schaal", String(n)), "schaal");
}

/** Een keuze op alle gelijke symbolen in de tekening tegelijk (alle HEB 240 naar een andere maat). */
export function zetOptieGelijk(v: Vorm, k: string, w: string) {
  const sleutel = gelijkSleutel(v);
  const ids = useTeken.getState().tekening.elementen
    .filter((e): e is Vorm => isVorm(e) && e.soort === "symbool" && gelijkSleutel(e) === sleutel)
    .map((e) => e.id);
  wijzigVormen(ids, (o) => zetOptie(o, k, w));
}

/** Een kopie van de selectie, een paar rasterstappen verschoven; de kopie wordt de selectie. */
export function kopieerSelectie() {
  const vormen = gekozenVormen();
  if (vormen.length === 0) return;
  const stap = useTeken.getState().raster.maat * 2;
  const kopieen = vormen.map((v) => kopie(v, stap, stap));
  wijzig((tk) => ({ ...tk, elementen: [...tk.elementen, ...kopieen] }));
  useTeken.setState({ gekozen: kopieen.map((k) => k.id) });
}

/** Ctrl+C: de selectie onthouden; Ctrl+V zet er een kopie van neer. */
export function onthoudSelectie() {
  const vormen = gekozenVormen();
  if (vormen.length > 0) useTeken.setState({ klembord: vormen });
}

export function plakKlembord() {
  const s = useTeken.getState();
  if (s.klembord.length === 0) return;
  const stap = s.raster.maat * 2;
  const kopieen = s.klembord.map((v) => kopie(v, stap, stap));
  wijzig((tk) => ({ ...tk, elementen: [...tk.elementen, ...kopieen] }));
  // Een volgende keer plakken komt weer een stap verder.
  useTeken.setState({ gekozen: kopieen.map((k) => k.id), klembord: kopieen.map(metNieuwId) });
}

/** Een reeks: `aantal` exemplaren (het origineel meegeteld), elk (dx, dy) verder. */
export function maakReeks(aantal: number, dx: number, dy: number) {
  const vormen = gekozenVormen();
  const n = Math.min(200, Math.max(1, Math.round(aantal)));
  if (vormen.length === 0 || n < 2 || (dx === 0 && dy === 0)) return;
  const kopieen = vormen.flatMap((v) => Array.from({ length: n - 1 }, (_, i) => kopie(v, dx * (i + 1), dy * (i + 1))));
  wijzig((tk) => ({ ...tk, elementen: [...tk.elementen, ...kopieen] }));
}

/** De stijl van het lint; een geselecteerde vorm neemt de wijziging over. */
export function zetStijl(deel: Partial<Stijl>) {
  useTeken.setState((s) => ({ stijl: { ...s.stijl, ...deel } }));
  const { gekozen } = useTeken.getState();
  if (gekozen.length === 0) return;
  wijzigVormen(gekozen, (v) => {
    const n: Vorm = { ...v };
    if (deel.lijn !== undefined) n.lijn = deel.lijn;
    if (deel.dikte !== undefined && v.soort !== "tekst") n.dikte = deel.dikte;
    const vlak = v.soort === "rechthoek" || v.soort === "cirkel" || v.soort === "polylijn" || heeftVulling(v);
    if (deel.vulling !== undefined && vlak) n.vulling = deel.vulling;
    if (deel.streep !== undefined && v.soort !== "tekst") n.streep = deel.streep;
    const metTekst = v.soort === "tekst" || v.soort === "maat" || !!symboolDef(v.sym)?.tekst;
    if (deel.grootte !== undefined && metTekst) n.grootte = deel.grootte;
    return n;
  }, `stijl-${gekozen.join(",")}-${Object.keys(deel).join(",")}`);
}

export function zetRaster(deel: Partial<Raster>) {
  useTeken.setState((s) => ({ raster: { ...s.raster, ...deel } }));
}

/** Een tekening in de editor zetten. */
function begin(tekening: Tekening, doel: Doel, plek: number, melding: Melding | null) {
  useTeken.setState({
    open: true,
    zichtbaar: true,
    tekening,
    doel,
    plek,
    bladId: useProjectStore.getState().activeId,
    gekozen: [],
    terug: [],
    vooruit: [],
    laatste: null,
    gewijzigd: false,
    gereedschap: "selecteer",
    melding,
  });
}

/** Mag de tekening in bewerking weg? */
function magWeg(): boolean {
  const s = useTeken.getState();
  return !s.open || !s.gewijzigd || window.confirm(t("vraag.weggooien"));
}

const cursor = (view: EditorView) => view.state.selection.main.head;

function startNieuw(view: EditorView) {
  const bron = view.state.doc.toString();
  begin(legeTekening(vrijeNaam(bron)), { soort: "nieuw" }, cursor(view), null);
}

function startBewerken(view: EditorView): boolean {
  const bron = view.state.doc.toString();
  const blok = blokBij(bron, cursor(view));
  if (!blok) return false;
  const tekst = blokTekst(bron, blok);
  const uit = leesTekening(tekst, vrijeNaam(bron));
  if ("fout" in uit) {
    meld({ sleutel: "melding.geenSvg", fout: true });
    useTeken.setState({ zichtbaar: true });
    return true;
  }
  begin(uit.tekening, { soort: "blok", begin: blok.begin, tekst }, blok.begin, {
    sleutel: "melding.geladen",
    opties: { regel: blok.svg + 1 },
  });
  return true;
}

/** Knop "Nieuwe tekening": een lege tekening voor de plek van de cursor. */
export function nieuweTekening() {
  if (!bladOpen() || !magWeg()) return;
  metEditor(startNieuw);
}

/** Knop "Tekening bewerken": het `@svg`-blok waar de cursor in staat. */
export function bewerkTekening() {
  if (!bladOpen()) return;
  metEditor((view) => {
    if (!blokBij(view.state.doc.toString(), cursor(view))) {
      if (!useTeken.getState().open) startNieuw(view);
      useTeken.setState({ zichtbaar: true });
      meld({ sleutel: "melding.geenBlok", fout: true });
      return;
    }
    if (magWeg()) startBewerken(view);
  });
}

/**
 * De tab Tekenen wordt actief: een tekening in bewerking komt terug in beeld;
 * anders staat de cursor in een `@svg`-blok (bewerken) of niet (nieuw).
 */
export function toonTekenen() {
  if (!bladOpen()) return;
  const s = useTeken.getState();
  // Op een tekenblad: de gekozen view, zonder de code erbij.
  const p = useProjectStore.getState();
  const actief = p.exemplaren.find((e) => e.id === p.activeId);
  if (actief && isTekenBlad(actief)) {
    const eerste = actief.tekenvel?.views[0]?.id;
    if (!s.vel && eerste) openView(actief.id, s.velKeuze ?? eerste, false);
    return;
  }
  if (s.open) {
    useTeken.setState({ zichtbaar: true });
    if (!useEditorViewStore.getState().view) vraagCode();
    return;
  }
  metEditor((view) => {
    if (!startBewerken(view)) startNieuw(view);
  });
}

/** De tab Tekenen wordt verlaten: de tekening blijft, de editor gaat uit beeld. */
export function verbergTekenen() {
  useTeken.setState({ zichtbaar: false });
}

/** Knop "Sluiten": de tekening weg en de editor dicht. */
export function sluitTekenen() {
  if (!magWeg()) return;
  useTeken.setState({ open: false, gekozen: [], terug: [], vooruit: [], gewijzigd: false, melding: null });
}

/** Het blad wisselde: de tekening gaat dan als nieuwe tekening naar de cursor van dat blad. */
export function bladGewisseld(id: string) {
  const s = useTeken.getState();
  if (!s.open || s.vel || s.bladId === id) return;
  useTeken.setState({
    bladId: id,
    doel: { soort: "nieuw" },
    plek: useEditorViewStore.getState().view ? cursor(useEditorViewStore.getState().view!) : 0,
    melding: { sleutel: "melding.anderBlad" },
  });
}

// ─── Een view van een tekenblad ──────────────────────────────────────────────

type Bewaard = Pick<TekenState, "open" | "zichtbaar" | "tekening" | "doel" | "bladId" | "plek" | "gereedschap" | "symbool" | "schaal" | "stijl" | "raster" | "gekozen" | "terug" | "vooruit" | "laatste" | "gewijzigd" | "melding">;

/** De tekening uit de code die opzij staat zolang er een view open is. */
let bewaard: Bewaard | null = null;
let stopKoppeling: (() => void) | null = null;

function huidigeView(): TekenView | undefined {
  const { vel } = useTeken.getState();
  if (!vel) return undefined;
  const ex = useProjectStore.getState().exemplaren.find((e) => e.id === vel.exId);
  return ex?.tekenvel?.views.find((v) => v.id === vel.viewId);
}

/**
 * De tekening in de editor en de view in het project lopen gelijk: elke wijziging
 * in de editor gaat meteen naar het project, zodat opslaan en het afdrukvoorbeeld
 * altijd de laatste stand hebben. Andersom volgt de editor het project, voor de
 * schaal en het kader uit het paneel en voor ongedaan maken op projectniveau.
 */
function koppelView() {
  const uitEditor = useTeken.subscribe((nu, was) => {
    if (!nu.vel || nu.tekening.elementen === was.tekening.elementen) return;
    const view = huidigeView();
    if (!view || view.elementen === nu.tekening.elementen) return;
    // Een view bevat alleen vormen: een onbekend element komt er niet in (store/tekenBlad.ts).
    wijzigOpenView((v) => ({ ...v, elementen: nu.tekening.elementen as Vorm[] }));
  });
  const uitProject = useProjectStore.subscribe(() => {
    const s = useTeken.getState();
    if (!s.vel) return;
    const view = huidigeView();
    if (!view) return sluitView();
    const nieuw = tekeningVanView(view);
    const tk = s.tekening;
    if (
      view.elementen === tk.elementen && view.schaal === s.vel.schaal && nieuw.x0 === tk.x0 && nieuw.y0 === tk.y0 &&
      nieuw.breed.v === tk.breed.v && nieuw.hoog.v === tk.hoog.v
    ) return;
    const anderInhoud = view.elementen !== tk.elementen;
    useTeken.setState({
      tekening: nieuw,
      vel: { ...s.vel, schaal: view.schaal },
      ...(anderInhoud ? { terug: [], vooruit: [], gekozen: [], laatste: null } : {}),
    });
  });
  return () => {
    uitEditor();
    uitProject();
  };
}

/** Wijzig de view die open staat. */
export function wijzigOpenView(f: (v: TekenView) => TekenView) {
  const { vel } = useTeken.getState();
  if (vel) wijzigView(vel.exId, vel.viewId, f);
}

/** Wijzig een view van een tekenblad in het project. */
export function wijzigView(exId: string, viewId: string, f: (v: TekenView) => TekenView) {
  const p = useProjectStore.getState();
  const ex = p.exemplaren.find((e) => e.id === exId);
  if (!ex?.tekenvel) return;
  p.zetTekenVel(exId, { ...ex.tekenvel, views: ex.tekenvel.views.map((v) => (v.id === viewId ? f(v) : v)) });
}

/**
 * Een view van een tekenblad in de editor zetten. Een tekening uit de code die nog
 * in bewerking is, staat zolang opzij en komt bij het sluiten terug. `naarLint`:
 * het lint gaat mee naar de tab Tekenen.
 */
export function openView(exId: string, viewId: string, naarLint = true) {
  const ex = useProjectStore.getState().exemplaren.find((e) => e.id === exId);
  const view = ex?.tekenvel?.views.find((v) => v.id === viewId) ?? ex?.tekenvel?.views[0];
  if (!view) return;
  if (useTeken.getState().vel) sluitView();
  const s = useTeken.getState();
  bewaard = {
    open: s.open, zichtbaar: s.zichtbaar, tekening: s.tekening, doel: s.doel, bladId: s.bladId, plek: s.plek,
    gereedschap: s.gereedschap, symbool: s.symbool, schaal: s.schaal, stijl: s.stijl, raster: s.raster,
    gekozen: s.gekozen, terug: s.terug, vooruit: s.vooruit, laatste: s.laatste, gewijzigd: s.gewijzigd, melding: s.melding,
  };
  useTeken.setState((o) => ({
    open: true,
    zichtbaar: true,
    tekening: tekeningVanView(view),
    doel: { soort: "nieuw" },
    bladId: exId,
    plek: 0,
    gereedschap: "selecteer",
    // De modelmaat: een profiel, wand of vloer tekent één eenheid per mm.
    schaal: MODEL_SCHAAL,
    stijl: { ...STANDAARD_STIJL, lijn: "#000000", dikte: 1 },
    raster: { ...o.raster, maat: rasterVoorSchaal(view.schaal) },
    gekozen: [],
    terug: [],
    vooruit: [],
    laatste: null,
    gewijzigd: false,
    melding: null,
    focus: null,
    vel: { exId, viewId: view.id, schaal: view.schaal },
    velKeuze: view.id,
    lintVerzoek: naarLint ? o.lintVerzoek + 1 : o.lintVerzoek,
  }));
  stopKoppeling = koppelView();
}

/** Terug naar het vel: de editor dicht, en een tekening uit de code weer terug op zijn plek. */
export function sluitView() {
  stopKoppeling?.();
  stopKoppeling = null;
  if (!useTeken.getState().vel) return;
  const terug = bewaard;
  bewaard = null;
  useTeken.setState({ vel: null, ...(terug ?? { open: false, gekozen: [], terug: [], vooruit: [], gewijzigd: false }) });
}

/** Waar het doelblok nu staat; null als het er niet meer is. */
export function zoekDoel(bron: string, doel: Doel, naam: string): { begin: number; einde: number } | null {
  if (doel.soort !== "blok") return null;
  if (bron.slice(doel.begin, doel.begin + doel.tekst.length) === doel.tekst) {
    return { begin: doel.begin, einde: doel.begin + doel.tekst.length };
  }
  const i = bron.indexOf(doel.tekst);
  if (i >= 0) return { begin: i, einde: i + doel.tekst.length };
  const blok = blokMetNaam(bron, naam);
  return blok ? { begin: blok.begin, einde: blok.einde } : null;
}

/** De plek in de bron waar de tekening komt (voor de proefberekening). */
export function plekVanTekening(bron: string): number {
  const s = useTeken.getState();
  const doel = zoekDoel(bron, s.doel, s.tekening.naam);
  if (doel) return doel.begin;
  const view = useEditorViewStore.getState().view;
  const pos = Math.min(view ? cursor(view) : s.plek, bron.length);
  // Een nieuwe tekening midden in een ander blok komt erachter.
  const blok = blokBij(bron, pos);
  return blok ? blok.einde : pos;
}

/** De code van de tekening voor deze plek in de bron. */
export function codeVoor(bron: string, pos: number): string {
  const { tekening } = useTeken.getState();
  return schrijfTekening(tekening, {
    verborgen: verborgenBij(bron, pos),
    kop: t("code.kop", { naam: tekening.naam }),
    bekend: bladWaarde,
  });
}

/** Wat het blad nu voor een koppeling geeft (de proef van de editor); zie SchrijfOpties.bekend. */
let bladWaarde: Opgelost | undefined;
export function zetBladWaarde(f: Opgelost | undefined) {
  bladWaarde = f;
}

/** Knop "Invoegen" / "Bijwerken": de tekening als code in de editor. */
export function schrijfInCode() {
  if (!bladOpen()) return;
  metEditor((view) => {
    const s = useTeken.getState();
    const bron = view.state.doc.toString();
    const plek = zoekDoel(bron, s.doel, s.tekening.naam);
    let naam = s.tekening.naam;

    if (plek) {
      const blok = zoekBlokken(bron).find((b) => b.begin === plek.begin);
      const insp = blok ? inspringing(bron, blok) : "";
      const code = codeVoor(bron, plek.begin).split("\n").map((r) => insp + r).join("\n");
      view.dispatch({
        changes: { from: plek.begin, to: plek.einde, insert: code },
        selection: { anchor: plek.begin },
        scrollIntoView: true,
        userEvent: "input",
      });
      view.focus();
      useTeken.setState({ doel: { soort: "blok", begin: plek.begin, tekst: code }, gewijzigd: false, laatste: null });
      const nu = zoekBlokken(view.state.doc.toString()).find((b) => b.begin === plek.begin);
      meld({ sleutel: "melding.bijgewerkt", opties: { regel: nu ? nu.svg + 1 : view.state.doc.lineAt(plek.begin).number } });
      return;
    }

    // Nieuw (of het oude blok is weg): op de cursor, of achter het blok waar de cursor in staat.
    if (s.doel.soort === "blok" || blokMetNaam(bron, naam)) {
      naam = vrijeNaam(bron);
      useTeken.setState((st) => ({ tekening: { ...st.tekening, naam } }));
    }
    const binnen = blokBij(bron, cursor(view));
    if (binnen) view.dispatch({ selection: { anchor: binnen.einde } });
    const pos = view.state.selection.main.from;
    voegIn(view, { glyph: "svg", tekst: codeVoor(bron, pos), regel: true });

    const nieuweBron = view.state.doc.toString();
    const blok = blokMetNaam(nieuweBron, naam);
    useTeken.setState({
      doel: blok ? { soort: "blok", begin: blok.begin, tekst: blokTekst(nieuweBron, blok) } : { soort: "nieuw" },
      gewijzigd: false,
      laatste: null,
    });
    meld({
      sleutel: s.doel.soort === "blok" ? "melding.opnieuwIngevoegd" : "melding.ingevoegd",
      opties: { regel: blok ? blok.svg + 1 : view.state.doc.lineAt(pos).number },
    });
  });
}
