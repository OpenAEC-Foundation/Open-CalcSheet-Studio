import { createElement, use, type ComponentProps, type ComponentType, type ReactElement } from "react";

/**
 * Een onderdeel dat apart laadt, in plaats van React.lazy.
 *
 * Met React.lazy wacht een onderdeel altijd eerst op een belofte, ook als de code al
 * binnen is. React toont dan even de `Suspense`-terugval en houdt de inhoud daarna nog
 * tot 300 ms tegen. Hier tekent een geladen onderdeel meteen: dat maakt het opwarmen
 * (warmLuiOp) nuttig, want een klik na het opwarmen merkt niets van het apart laden.
 */
export interface LuiOnderdeel<P> {
  (props: P): ReactElement;
  /** Haal de code alvast binnen. */
  vooraf: () => Promise<unknown>;
}

const wachtrij: Array<() => Promise<unknown>> = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- dezelfde vorm als React.lazy
export function lui<T extends ComponentType<any>>(
  laad: () => Promise<{ default: T }>,
  opties: { warm?: boolean } = {},
): LuiOnderdeel<ComponentProps<T>> {
  type P = ComponentProps<T>;
  let klaar: ComponentType<P> | null = null;
  let belofte: Promise<unknown> | null = null;
  const vooraf = () => {
    belofte ??= laad().then(
      (m) => {
        klaar = m.default;
      },
      (err) => {
        // Een volgende poging mag het opnieuw proberen.
        belofte = null;
        throw err;
      },
    );
    return belofte;
  };
  const Lui = ((props: P) => {
    if (!klaar) use(vooraf());
    return createElement(klaar as ComponentType<P>, props);
  }) as LuiOnderdeel<P>;
  Lui.vooraf = vooraf;
  if (opties.warm !== false) wachtrij.push(vooraf);
  return Lui;
}

/** Bij een moment dat het venster rust. WebKit (macOS, Linux) kent requestIdleCallback niet. */
function bijRust(doe: () => void) {
  if (typeof requestIdleCallback === "function") requestIdleCallback(doe, { timeout: 2000 });
  else setTimeout(doe, 300);
}

let gestart = false;

/**
 * Haalt de losse onderdelen binnen als het venster rust, één voor één en `eerst` vooraan,
 * zodat de eerste klik er niet op hoeft te wachten. Een bibliotheek die pas in zo'n
 * onderdeel laadt (3D, pdf.js, de werkmap) blijft daarbuiten.
 */
export function warmLuiOp(eerst: Array<{ vooraf: () => Promise<unknown> }> = []) {
  if (gestart) return;
  gestart = true;
  const rij = [...eerst.map((o) => o.vooraf), ...wachtrij];
  const volgende = () => {
    const stap = rij.shift();
    if (stap) bijRust(() => void stap().catch(() => undefined).finally(volgende));
  };
  volgende();
}
