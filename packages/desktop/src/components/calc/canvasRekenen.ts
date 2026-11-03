/**
 * Een canvas-blad doorrekenen (store/canvasBlad.ts): hetzelfde `parse`,
 * `evaluate` en `render` als elk blad, met per eenheid zijn eigen uitkomst.
 *
 * De knopen van de kern dragen geen regelnummer, dus de uitkomsten zijn achteraf
 * niet aan een regel in de tekst terug te koppelen. Daarom wordt elke eenheid
 * apart ingelezen en gaat alles samen in één doorrekening, met een grensknoop
 * tussen de eenheden. Scope en opdrachten (`#round`, `#deg`) lopen dan vanzelf
 * door, en de grensknopen wijzen in de uitkomst aan wat bij welke eenheid hoort.
 *
 * Apart inlezen houdt een fout bij zijn eenheid: een `#if` zonder `#end if` of
 * een `#hide` zonder `#show` loopt niet door in wat eronder staat. De ronde van
 * `repeat` om elke eenheid vangt een `#break` buiten een lus op.
 *
 * Laadt zonder React of stores: de rekenworker en de controles gebruiken dit.
 */
import { parse, evaluate, extractScope, render } from "@ifc-calc/core";
import type { AstNode, EvaluatedNode, ParseOptions } from "@ifc-calc/core";
import { heeftEenheden, leesEenheden, type Eenheid } from "../../store/canvasBlad.ts";

/** Een eenheid met wat hij oplevert. */
export interface EenheidUitkomst {
  eenheid: Eenheid;
  nodes: EvaluatedNode[];
}

/** Een eenheid als uitwerking, voor het canvas en voor op papier. */
export interface CanvasUitwerking {
  id: string;
  x: number;
  y: number;
  html: string;
}

/** Een stuurteken, zodat de grens nooit in echte tekst staat. */
const GRENS = "\u0004eenheid:";

/** Wat er bij een eenheid staat als hij niet doorgerekend kon worden. */
function foutKnoop(err: unknown): EvaluatedNode {
  return { type: "text", text: `Error: ${(err as Error)?.message ?? String(err)}` };
}

/** Rekent alle eenheden in één keer door; de uitkomst per eenheid, in dezelfde volgorde. */
function inEenKeer(
  delen: (AstNode | null)[],
  waarden: Record<string, string>,
  scope: Record<string, unknown>,
): EvaluatedNode[][] {
  const ast: AstNode[] = delen.flatMap((deel, i): AstNode[] => {
    const grens: AstNode = { type: "text", text: `${GRENS}${i}` };
    return deel ? [grens, deel] : [grens];
  });
  const per: EvaluatedNode[][] = delen.map(() => []);
  let huidig = per[0];
  for (const n of evaluate(ast, waarden, scope)) {
    if (n.type === "text" && n.text.startsWith(GRENS)) huidig = per[Number(n.text.slice(GRENS.length))];
    else huidig.push(n);
  }
  return per;
}

/**
 * Valt een eenheid om buiten de vangnetten van de kern, dan eenheid voor eenheid,
 * met de scope van de vorige. Alleen hier: dat rekent alles twee keer.
 */
function eenVoorEen(
  delen: (AstNode | null)[],
  waarden: Record<string, string>,
  scope: Record<string, unknown>,
): EvaluatedNode[][] {
  let stand = scope;
  return delen.map((deel) => {
    if (!deel) return [];
    try {
      const nodes = evaluate([deel], waarden, stand);
      stand = extractScope([deel], waarden, stand);
      return nodes;
    } catch (err) {
      return [foutKnoop(err)];
    }
  });
}

/** Rekent de eenheden van een rekentekst door, in de volgorde van hun positie. */
export function rekenEenhedenDoor(
  bron: string,
  waarden: Record<string, string>,
  scope: Record<string, unknown>,
  opties: ParseOptions = {},
): EenheidUitkomst[] {
  const eenheden = leesEenheden(bron);
  const leesfout = new Map<number, EvaluatedNode>();
  const delen = eenheden.map((e, i): AstNode | null => {
    try {
      return { type: "repeat", count: "1", body: parse(e.tekst, opties) };
    } catch (err) {
      leesfout.set(i, foutKnoop(err));
      return null;
    }
  });
  let per: EvaluatedNode[][];
  try {
    per = inEenKeer(delen, waarden, scope);
  } catch {
    per = eenVoorEen(delen, waarden, scope);
  }
  return eenheden.map((eenheid, i) => {
    const fout = leesfout.get(i);
    return { eenheid, nodes: fout ? [fout] : per[i] };
  });
}

/** De uitkomsten als uitwerking per eenheid. Een fout in het opmaken blijft ook bij zijn eenheid. */
export function eenhedenMetHtml(uit: EenheidUitkomst[], namen?: Record<string, string>): CanvasUitwerking[] {
  return uit.map(({ eenheid, nodes }) => {
    let html: string;
    try {
      html = render(nodes, { namen });
    } catch (err) {
      html = render([foutKnoop(err)]);
    }
    return { id: eenheid.id, x: eenheid.x, y: eenheid.y, html };
  });
}

/** Een doorgerekende bladtekst: de knopen, de uitwerking en bij een canvas-blad de eenheden. */
export interface RekenUitwerking {
  nodes: EvaluatedNode[];
  html: string;
  eenheden?: CanvasUitwerking[];
}

/**
 * Rekent een bladtekst door voor de weergave: een gewone tekst in één keer, een
 * tekst met eenheden per eenheid. Werpt bij een fout in een gewone tekst, zoals
 * `parse` en `evaluate` zelf.
 */
export function rekenUitwerking(
  bron: string,
  waarden: Record<string, string>,
  scope: Record<string, unknown>,
  opties: ParseOptions,
  namen?: Record<string, string>,
): RekenUitwerking {
  if (!heeftEenheden(bron)) {
    const nodes = evaluate(parse(bron, opties), waarden, scope);
    return { nodes, html: render(nodes, { namen }) };
  }
  const uit = rekenEenhedenDoor(bron, waarden, scope, opties);
  const nodes = uit.flatMap((u) => u.nodes);
  const eenheden = eenhedenMetHtml(uit, namen);
  // Onder elkaar, als één uitwerking: voor de tab met de code ernaast.
  let html: string;
  try {
    html = render(nodes, { namen });
  } catch {
    html = eenheden.map((e) => e.html).join("");
  }
  return { nodes, html, eenheden };
}
