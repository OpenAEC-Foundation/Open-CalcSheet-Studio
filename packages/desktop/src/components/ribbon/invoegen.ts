import type { EditorView } from "@codemirror/view";
import type { SyntaxKnop } from "./calcpadLint";

const OPEN = "⟨";
const DICHT = "⟩";

/**
 * Zet het fragment van een lintknop op de cursor in de editor.
 *
 * De plaats tussen ⟨ en ⟩ staat daarna geselecteerd, zodat je hem meteen
 * overtypt. Staat er al een selectie, dan komt die op die plaats: selecteer
 * `x` en klik sqrt, dan staat er `sqrt(x)`. Een fragment met `regel` begint op
 * een eigen regel en houdt de rest van de regel eronder; de inspringing van de
 * huidige regel loopt mee in een blok als `#if … #end if`.
 */
export function voegIn(view: EditorView, knop: SyntaxKnop): void {
  const { state } = view;
  const sel = state.selection.main;
  const gekozen = state.sliceDoc(sel.from, sel.to);

  let tekst = knop.tekst;
  const a = tekst.indexOf(OPEN);
  const b = tekst.indexOf(DICHT);
  const heeftPlek = a >= 0 && b > a;
  // Een selectie van meer dan één regel past niet in een plek als sqrt(⟨x⟩).
  const vulIn = heeftPlek && gekozen.length > 0 && !gekozen.includes("\n");
  let plekVan = -1;
  let plekTot = -1;
  if (heeftPlek) {
    const plek = vulIn ? gekozen : tekst.slice(a + 1, b);
    tekst = tekst.slice(0, a) + plek + tekst.slice(b + 1);
    plekVan = a;
    plekTot = a + plek.length;
  }

  const regel = state.doc.lineAt(sel.from);
  const ervoor = state.sliceDoc(regel.from, sel.from);
  const inspring = /^\s*/.exec(regel.text)?.[0] ?? "";
  let voor = "";
  let na = "";
  if (knop.regel) {
    if (ervoor.trim() !== "") voor = "\n" + inspring;
    if (tekst.includes("\n")) tekst = tekst.replace(/\n/g, "\n" + inspring);
    const erna = state.sliceDoc(sel.to, state.doc.lineAt(sel.to).to);
    if (erna.trim() !== "") na = "\n" + inspring;
  } else if (knop.spatie && ervoor !== "" && !/\s$/.test(ervoor)) {
    voor = " ";
  }

  const invoeg = voor + tekst + na;
  const begin = sel.from + voor.length;
  // De plek schuift op met de inspringing van de regels vóór haar.
  const schuif = knop.regel && heeftPlek
    ? (knop.tekst.slice(0, plekVan).match(/\n/g)?.length ?? 0) * inspring.length
    : 0;
  const anchor = heeftPlek && !vulIn ? begin + plekVan + schuif : begin + tekst.length;
  const head = heeftPlek && !vulIn ? begin + plekTot + schuif : anchor;

  view.dispatch({
    changes: { from: sel.from, to: sel.to, insert: invoeg },
    selection: { anchor, head },
    scrollIntoView: true,
    userEvent: "input",
  });
  view.focus();
}
